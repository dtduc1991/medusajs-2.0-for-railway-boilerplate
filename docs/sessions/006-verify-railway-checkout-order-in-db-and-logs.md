# Handoff: Verified the Railway checkout e2e test actually creates a real order (logs + DB), found a missing email-provider gap

## Context

Repo: `medusajs-2.0-for-railway-boilerplate`. Direct follow-up to [005-checkout-e2e-against-railway-deploy.md](005-checkout-e2e-against-railway-deploy.md) (wrote/ran `storefront/e2e/tests/public/checkout-railway.spec.ts` against the live Railway deployment) and the same session's follow-up work that added a dedicated `"chromium railway"` Playwright project (`storefront/playwright.config.ts`) and `npm run test-e2e:railway` script so the spec no longer needs a throwaway standalone config.

Session 005 only verified the **UI-level** confirmation page rendered correctly. Task this session: confirm the checkout is *actually* completed on the backend — i.e. check Railway's logs and query the live Postgres database directly, not just trust the storefront's confirmation screen.

Status: **Confirmed order creation is correct end-to-end.** Also found a real, previously-undocumented gap: order confirmation emails silently fail on this deployment.

## How this was checked

### 1. Railway backend logs

```bash
railway logs --service backend --lines 200
```

Confirmed for the test run's cart (`cart_01KWEA6VS5SN09EKWX6NPKA5W0`):
- `POST /store/carts/cart_01KWEA6VS5SN09EKWX6NPKA5W0/complete` → `200`
- `GET /store/orders/order_01KWEA77XZYZM316B29YPHBAPN?fields=*payment_collections.payments` → `200`
- `Processing order.placed (priority: 10) which has 1 subscribers`
- Immediately followed by: `Error sending order confirmation notification: Error: Could not find a notification provider for channel: email for notification id noti_...` — a real error, not a fluke (see below).

### 2. Direct Postgres query against the live Railway database

No `psql` available locally, so this used Node's `pg` package already present in `storefront/node_modules` (it's a real dependency of `storefront/package.json`, used elsewhere for e2e DB reset), pointed at Railway's **public** Postgres proxy (`DATABASE_PUBLIC_URL`, retrieved via `railway variables --service Postgres --kv`) rather than the internal `postgres.railway.internal` host, since this session ran from a local machine, not from inside the Railway network.

```js
const { Client } = require("pg")
const client = new Client({ connectionString: DATABASE_PUBLIC_URL, ssl: { rejectUnauthorized: false } })
```

Medusa v2's order module uses its own table set (not a single monolithic `orders` table) — discovered via `information_schema.tables where table_name like '%order%'`: `order`, `order_item`, `order_line_item`, `order_payment_collection`, `order_transaction`, etc. (full list in scrollback if needed again). Queried `order_01KWEA77XZYZM316B29YPHBAPN` (the order from session 005's test run) across these tables. Results:

| Table | Finding |
|---|---|
| `order` | `display_id: 2`, `status: "pending"`, `email: "test@example.com"`, `currency_code: "eur"` — matches what the test filled in |
| `order_item` join `order_line_item` | Medusa Sweatshirt, variant `M`, quantity `1`, `unit_price: 10` — matches the product the spec added to cart |
| `order_payment_collection` → `payment` | `pay_...`, `amount: 20` (2 × unit price, i.e. product + shipping), `provider_id: "pp_system_default"`, `captured_at: null` |
| `payment_collection` | `status: "authorized"`, `completed_at: null` |
| `notification` | Two rows, both `template: "order-placed"`, both `status: "failure"` |

`captured_at: null` / `status: "authorized"` (not `"captured"`) is **expected**, not a bug — `pp_system_default` (labeled "Manual Payment" in the storefront, see `storefront/src/lib/constants.tsx:29`) only authorizes; capturing is a manual admin action in Medusa's order flow. Order `status: "pending"` is likewise the normal initial state before fulfillment.

### 3. Root-caused the notification failure

```bash
railway variables --service backend --kv | grep -i "resend\|sendgrid\|email\|notification"
# → only MEDUSA_ADMIN_EMAIL=dtduc1991@gmail.com
```

No `RESEND_API_KEY` (or any other email-provider var) is set on the Railway `backend` service. `backend/src/modules/email-notifications` (the Resend-backed provider — see its README) is only registered/functional when its required env vars are present (conditional module activation, per the root `CLAUDE.md`'s "Conditionally-activated modules" note). Without it, there is no provider registered for the `email` channel at all, so `NotificationModuleService.createNotifications` throws for every order — confirmed by **two** separate `order-placed`/`failure` rows in the `notification` table, from two different test runs (one from an earlier ~07:26 run, one from this session's ~07:45 run), both failing identically.

**This is non-blocking** — the `order.placed` subscriber ([backend/src/subscribers/order-placed.js](../../backend/.medusa/server/src/subscribers/order-placed.js), compiled from `backend/src/subscribers/order-placed.ts`) fires asynchronously off the event bus after the cart-complete HTTP response has already been sent, so it has zero effect on checkout completing or the confirmation page rendering. But it means **every real customer order placed on this live deployment currently gets no confirmation email**, silently (no failed job retry/alerting visible, just a log line).

## Open items / what the next agent should do

1. **Set `RESEND_API_KEY` (and whatever else `email-notifications`'s README requires — check `backend/src/modules/email-notifications/README.md`) on the Railway `backend` service** if real customer-facing confirmation emails matter for this deployment. Not done this session — fixing it wasn't requested, only diagnosing was.
2. Consider whether this should also live in [docs/railway.md](../railway.md)'s "Open items" list (that doc already tracks other Railway-deployment gaps like no MinIO/no persistent uploads) — it wasn't added there this session to avoid rewriting a doc from a different, already-closed session; flagging here instead since this session's investigation is what surfaced it.
3. If re-querying the live DB again: `DATABASE_PUBLIC_URL` (not `DATABASE_URL`, which resolves to the Railway-internal-only `postgres.railway.internal` host) is required for access from outside Railway's network — get it fresh via `railway variables --service Postgres --kv`, it's a generated secret and shouldn't be hardcoded anywhere in the repo.
4. Only order `order_01KWEA77XZYZM316B29YPHBAPN` (and one earlier one from a prior run around 07:26) were inspected. No cleanup was performed — consistent with session 005's item 4 (this spec creates real, uncleaned orders each run).
