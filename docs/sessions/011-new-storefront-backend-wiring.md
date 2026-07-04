# Handoff: Wired `new-storefront` (Ember) to the real Medusa backend for browse + cart

## Context

`new-storefront/` is a previously-undocumented design-handoff bundle in this repo — an
unrelated React+Vite prototype called "Ember" (an order-ahead coffee app with an AI-barista
chat), not a branch of `storefront/`. It wasn't mentioned in `CLAUDE.md` and had zero backend
wiring: every screen rendered from static mocks in `src/data.ts`.

Task, in two parts:
1. Research it deeply and document how it should call the real backend →
   [`new-storefront/docs/backend-integration.md`](../../new-storefront/docs/backend-integration.md)
   (a mapping table of every mock concept to a real Medusa Store API endpoint, plus a "Gaps
   with no first-class Medusa equivalent" section for loyalty stars, extras/add-ons, pickup
   ETA, ratings, and AI chat).
2. Implement the "good fit" mappings — user chose **browse + cart only** (no payment/checkout,
   no customer auth) and **seed a real coffee catalog** rather than reuse the generic
   shirts/sweatshirts demo catalog that `backend/src/scripts/seed.ts` creates.

Status: **done and verified live** (Playwright against a real running backend, not just
`tsc`). Payment/checkout and auth remain unimplemented by design — see Open items.

## What was built

- **`backend/src/scripts/seed-coffee.ts`** (+ `pnpm seed:coffee` in `backend/package.json`) —
  seeds 4 coffee products × Size(3, ±price delta) × Milk(4, free) = 12 real variants each, into
  the existing Europe region / default sales channel / shipping profile / stock location that
  `seed.ts` creates. Idempotent: checks existing categories/products/inventory-levels by
  name/handle/sku before creating, so re-running it is safe. Requires `pnpm seed` to have run
  first (throws with a clear message if the sales channel/shipping profile/stock location
  aren't found).
- **`new-storefront/src/lib/sdk.ts`** — plain `@medusajs/js-sdk` client, reading
  `VITE_MEDUSA_BACKEND_URL` / `VITE_MEDUSA_PUBLISHABLE_KEY` from Vite env (see gotcha #2 below
  for why this ended up synchronous instead of resolving the key at runtime).
- **`new-storefront/src/lib/cartStorage.ts`** — cart id in `localStorage` (this app is a pure
  client-side SPA, no server actions/httpOnly cookies like `storefront/` has).
- **`new-storefront/src/lib/backend.ts`** — `listDrinks()`, `retrieveCart()`, `addLineItem()`,
  `changeLineItemQty()`, `applyPromoCode()`. Maps Medusa's product/variant/cart shapes to the
  app's `Drink`/`CartItem`/`Cart` types (see `types.ts` — reworked to carry real variant ids and
  prices instead of a flat mock price + `SIZE_DELTA` formula).
- Screens (`MenuScreen`, `DrinkDetailScreen`, `CartScreen`, `ChatScreen`, `App.tsx`) now fetch
  real products/categories/cart instead of importing from `data.ts`. `data.ts` still holds
  `STORE`, `USER`, `EXTRAS`, `REWARD_ACTIVITY` — intentionally still mocked, no backend
  equivalent exists (documented in `backend-integration.md`).
- Category chips now actually filter (`MenuScreen`); promo-code apply now hits the real
  `POST /store/carts/:id` `promo_codes` endpoint and surfaces real rejection errors in the UI
  (previously an unhandled promise rejection with no user feedback — fixed by threading a
  `promoError` state through `App.tsx` → `CartScreen`).
- Extras (extra shot / cold foam) deliberately **not** wired to the real cart — no backend
  concept exists for them (see doc). The customize screen still previews their price locally
  (unchanged UX), but only the Size×Milk variant is what actually gets added; this is a known,
  documented gap, not a bug.

## Gotchas hit during implementation

1. **`backend/.env`'s `DATABASE_URL` had an inline `# comment`** on the same line
   (`DATABASE_URL=postgres://...medusa # Make sure this database exists...`). Node's URL
   parsing treats everything after the space as part of the path up to the `#` fragment
   marker, so the actual dbname resolved to `"medusa "` (trailing space) and `pnpm ib` failed
   with `database "medusa " does not exist`. Fixed in both `backend/.env` and `.env.template`
   by moving the comment to its own line above. **This was breaking every native `pnpm
   ib`/`pnpm dev` run before this session**, not something introduced by this work.

2. **The backend's `/key-exchange` route isn't reachable from a browser** — it has no CORS
   headers, so it only works for server-to-server calls (Railway build-time, or `curl`). The
   original plan was to have `new-storefront` auto-resolve its publishable key from that route
   at runtime for zero-config local dev; had to drop that and require
   `VITE_MEDUSA_PUBLISHABLE_KEY` explicitly instead (same pattern `storefront/` already uses).
   `new-storefront/.env.local` (gitignored) is left in place with a working key for this repo's
   seed data, fetched once via `curl http://localhost:9000/key-exchange`.

3. **`docker-compose.yml`'s `backend` service hardcodes `STORE_CORS: http://localhost:8000`**
   in its `environment:` block, which overrides `env_file: ./backend/.env` (compose merges
   `env_file` first, `environment:` wins). Added `http://localhost:5173` to
   `STORE_CORS` in `backend/.env`/`.env.template` for the **native** `pnpm dev` path, but the
   **docker-compose** path still only accepts `:8000` — **not fixed**, see Open items.

4. **Docker-compose's `backend`/`storefront` containers were already running** (from a prior
   session, `restart: unless-stopped`, `4 days` old per `docker compose ps`) and silently
   contended for port 9000 with a natively-run `pnpm dev` backend started for this session's
   testing. This surfaced as flaky/contradictory CORS behavior (`http://localhost:8000` origin
   sometimes got a valid `Access-Control-Allow-Origin` response, `:5173` never did, regardless
   of `STORE_CORS` list order) — actually two different backends answering port 9000
   inconsistently, not a CORS list-parsing bug. Fix: `docker compose stop backend storefront`
   (data preserved) before running the native backend, `docker compose up -d backend
   storefront` to restore afterward.

5. **Incident: an overly broad `taskkill //PID <id> //T` (kill process tree) while chasing
   down what was holding port 9000 killed a much larger process tree than intended and took
   down Docker Desktop's own engine** as collateral damage (`docker info` started failing with
   a named-pipe error immediately after). Recovered by relaunching Docker Desktop and waiting
   for `docker info` to succeed again, then `docker compose up -d` to bring the stack back —
   no data loss (named volumes untouched), but worth flagging: **on this machine, avoid
   `taskkill /T` for anything above a leaf process** — a plain `Stop-Process -Id <id>` (no
   `-Force`/tree) or `docker compose stop <service>` for anything Docker-related is safer, since
   process-tree ancestry here isn't confined to what you'd expect (a stray backend process's
   ancestry apparently intersected Docker Desktop's own supervisor tree).

## Verified (Playwright against the real local backend + coffee seed)

- Menu: real categories (Espresso/Matcha/Cold) filter correctly; featured/popular pull real
  products with real cheapest-variant prices; quick-add uses the Medium/Oat variant.
- Detail screen: Size/Milk selection resolves to the correct real variant id and live-recomputes
  the real price; "Add to bag" adds that exact variant + quantity to a real cart.
- Cart: real line items (title, size/milk parsed from `variant_title`, unit price), real
  subtotal (tax was €0.00 in testing — expected, no shipping address set yet, matches the
  address-dependent tax behavior already documented in
  [010](010-fix-subtotal-shipping-tax-semantics.md)), qty steppers hit real update/delete
  endpoints, decrementing to 0 removes the line and empty-state renders correctly.
- Promo code: a bogus code correctly gets rejected by the real promotions endpoint, and the
  rejection now surfaces in the UI instead of an unhandled rejection.
- Chat: recommendation card now pulls a real drink (`brown-sugar-oat-latte` by handle, falling
  back to first fetched drink) and its "Add to bag" goes through the same real `quickAdd` path
  as everywhere else.
- Rewards tab: unaffected (still fully mocked, by design), no regressions.

No console errors in any of the above once CORS/env were sorted.

## Open items / what the next agent should do

1. **Docker-compose's `backend` service `STORE_CORS` still only allows `:8000`.** If you want
   `new-storefront`'s dev server usable via the docker-compose stack (not just a natively-run
   backend), add `http://localhost:5173` to the hardcoded `STORE_CORS` value in
   `docker-compose.yml`'s `backend.environment` block and `docker compose up -d backend` to
   recreate (no image rebuild needed, it's an env var not baked into the image).
2. **Coffee catalog only exists in whichever Postgres database you seeded** — the native
   `pnpm ib`/`pnpm seed:coffee` path seeds the `medusa` db (`backend/.env`'s `DATABASE_URL`);
   the docker-compose `backend` container uses a separate `test_medusa_db` (see
   `docker-compose.yml`'s hardcoded `DATABASE_URL` override) which does **not** have the coffee
   products — its image also predates `seed-coffee.ts` entirely, so `docker compose exec
   backend pnpm seed:coffee` would fail (file not in the built image) without a rebuild first.
3. **Payment/checkout is fully unimplemented** — the "Pay" button in `CartScreen` is still a
   static no-op, and there's no address-collection UI anywhere in Ember. See
   `backend-integration.md`'s "Recommended integration approach" before starting this — it
   needs a product decision on address UI since none of Ember's screens have one today.
4. **Customer auth is fully unimplemented** — no login/signup screens exist in Ember at all.
   Anything customer-scoped (order history for the "You" tab, saved addresses) is blocked on
   porting the JWT/localStorage auth pattern, analogous to `storefront/src/lib/data/customer.ts`
   + `cookies.ts` but adapted for a client-side SPA instead of Next.js server actions.
5. **Extras (add-ons) and loyalty stars remain fully mocked/decorative**, per the documented
   "no first-class Medusa equivalent" gap — needs a product decision (custom line-item
   modifier vs. separate product-as-addon; a loyalty module) before any code changes there.
6. `new-storefront/.env.local` (gitignored) has a real local publishable key already in it —
   fine to reuse for local dev, no rotation needed (publishable keys aren't secret in the same
   sense as the Railway API token flagged in session 007).
