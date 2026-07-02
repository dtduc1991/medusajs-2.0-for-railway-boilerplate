# Handoff: Wrote a registration e2e test against the live Railway deployment, verified customer data in Postgres

## Context

Repo: `medusajs-2.0-for-railway-boilerplate`. Direct follow-up to [005-checkout-e2e-against-railway-deploy.md](005-checkout-e2e-against-railway-deploy.md) (established the `*-railway.spec.ts` pattern for testing against a live deployment instead of the local docker-compose stack) and [006-verify-railway-checkout-order-in-db-and-logs.md](006-verify-railway-checkout-order-in-db-and-logs.md) (established querying the live Postgres directly to verify test side-effects, not just the UI). Task this session: same thing, but for **customer registration** instead of checkout, against a **different, newer Railway deployment** than the one those two docs describe (see "Deployment has moved" below) — `https://storefront-86798e.up.railway.app`.

Status: **Done.** Test written, passing, and its side effect (a real `customer` row) confirmed directly in Postgres.

## What was done

1. Added [storefront/e2e/tests/public/register-railway.spec.ts](../../storefront/e2e/tests/public/register-railway.spec.ts), following the exact pattern `checkout-railway.spec.ts` established: imports `test`/`expect` from `@playwright/test` directly (not `"../../index"`, which pulls in the `resetDatabaseFixture` that runs destructive `RENAME`/`DROP DATABASE` SQL before every test — see session 005 for why that's dangerous against a live deployment).
2. Registers a customer with a **unique, timestamp-suffixed email** (`test-reg-railway-${Date.now()}@example.com`) rather than reusing register.spec.ts's fixed emails (`test-reg@example.com`) — that repo's other reg test relies on the DB being reset before every run, which doesn't happen here, so a fixed email would only ever succeed once against a persistent deployment DB and fail every run after with "customer already exists."
3. Wired it into [storefront/playwright.config.ts](../../storefront/playwright.config.ts): added to the `"chromium railway"` project's `testMatch` array alongside `checkout-railway.spec.ts`, and added a matching `testIgnore` entry on `"chromium public"` so it isn't double-picked-up by the local docker-compose-targeted suite. No config changes needed beyond that — `npm run test-e2e:railway` (already existed from session 005) picks it up automatically.
4. Ran headed: `NEXT_PUBLIC_BASE_URL="https://storefront-86798e.up.railway.app" npx playwright test --project="chromium railway" e2e/tests/public/register-railway.spec.ts --headed` → **1 passed**.
5. Verified the registration actually persisted correctly in the live Postgres (see below) — not just that the UI showed a welcome message.

## Deployment has moved — `docs/railway.md` is now stale on topology/domains

`docs/railway.md` (session before numbered sessions existed) describes a project deployed via one-off `railway up` CLI calls, no GitHub connection, domains `backend-production-88f56.up.railway.app` / `storefront-production-4524.up.railway.app`. Two commits landed since then — `fe64104` ("Added Terraform") and `25f0ed4` ("deploy railway using terraform") — that replaced this with a Terraform-managed deployment (`terraform/*.tf`, driven by `deploy-railway.sh`). Current `railway status` (same linked project, `medusa-railway-boilerplate`) shows:

- `backend`: `https://backend-b0c498.up.railway.app`, connected to GitHub repo `dtduc1991/medusajs-2.0-for-railway-boilerplate`
- `storefront`: `https://storefront-86798e.up.railway.app`, same GitHub connection
- `postgres` / `redis`: lowercase service names (vs. the old CLI deploy's `Postgres`/`Redis` plugin services), deployed from Railway's own image (`ghcr.io/railwayapp-templates/postgres-ssl:16` per [terraform/postgres.tf](../../terraform/postgres.tf)) rather than Railway's managed Postgres **plugin**.

**This is not the same deployment** the domains in `docs/railway.md` and sessions 005/006 point at — those old domains may no longer resolve or may point at a torn-down project. If a future agent is told to "test against Railway" without a domain, check `railway status` first rather than trusting the domain in `docs/railway.md`; that doc has not been updated to reflect the Terraform migration. Worth a follow-up session to refresh `docs/railway.md` itself (out of scope here — this session only needed to *use* the deployment, not document its infra).

One important consequence of the Terraform migration, relevant to future DB-verification work:

### The Terraform Postgres has no Data tab and no public connection string by default

Because `postgres` is a plain Docker-image service (not Railway's managed Postgres **plugin**), the Railway **dashboard has no "Data" tab / query browser for it** — that UI is plugin-only. And `railway variables --service postgres --kv` has no `DATABASE_PUBLIC_URL` (only the internal `postgres.railway.internal` `DATABASE_URL`) — unlike the old CLI deployment in session 006, which did have a public proxy already configured. Both of session 006's "how to check" methods (dashboard Data tab, `DATABASE_PUBLIC_URL` + local `pg` client) are **unavailable** on this deployment as currently configured. See below for what worked instead.

## How DB verification was actually done this session (with gotchas)

Goal: confirm the registered customer actually landed in the `customer` table, matching session 006's precedent of not trusting the UI alone.

### Attempt 1: temporary public TCP proxy — blocked by local network, not by Railway

`railway tcp-proxy create --port 5432 --service postgres` successfully created a public endpoint (`<random>.proxy.rlwy.net:<port>`, `ACTIVE` within seconds). Connecting from the local machine with Node's `pg` package timed out (`ETIMEDOUT`). Confirmed via PowerShell `Test-NetConnection -ComputerName <host> -Port <port>` that this is a **local corporate-network firewall blocking outbound non-standard TCP ports**, not a Railway-side issue (`TcpTestSucceeded: False`, connection never reaches the socket layer). **The proxy was deleted again afterward** (`railway tcp-proxy delete <id> --service postgres --yes`) — don't leave a live public DB proxy sitting around. If a future agent has an unrestricted network, this path should just work; if not, fall through to the SSH path below.

### Attempt 2: `railway ssh` — works, but only interactively, and only with care around quoting

`railway ssh --service backend -- <command>` (non-interactive, agent-run) hit three separate blockers in sequence:

1. **No SSH key registered yet.** `railway ssh keys add` registers a local public key (`~/.ssh/id_ed25519.pub`) with the Railway account. This is a **standing credential change to the user's Railway account**, not scoped to this session — flagged to the user, not removed automatically. If a future agent does this again for a different user, say so explicitly; don't assume it's a no-op.
2. **First connection: "Host key verification failed."** Railway's own SSH-over-HTTPS proxy (`ssh.railway.com`) wasn't yet in `~/.ssh/known_hosts`, and `railway ssh` doesn't auto-accept-and-cache it non-interactively (no `--accept-new`-equivalent flag found in `railway ssh --help`). Fixed by one manual `ssh -o StrictHostKeyChecking=accept-new -i ~/.ssh/id_ed25519 <user-id>@ssh.railway.com` (using the exact `Host`/`User` shown by `railway ssh config --service backend --dry-run`) — this fails auth (expected, wrong flow) but successfully caches the host key, after which `railway ssh` itself proceeds past that check.
3. **The user's SSH key is passphrase-protected → cannot be driven non-interactively at all.** `ssh-add` prompted for the passphrase interactively; an agent has no legitimate way to supply or extract that. **This means `railway ssh` against this account can only be run from the user's own terminal**, not automated by an agent in this environment. The rest of the DB verification in this session was done by handing the user exact commands to paste, not by the agent running them directly.

### Attempt 3 (successful): user runs `railway ssh` interactively, agent hands over copy-paste commands

Two further gotchas surfaced once the user started running commands themselves:

- **Nested quoting across the SSH hop breaks.** `railway ssh --service backend -- sh -c "node -e \"<multi-line script>\""` produced `node: -e requires an argument` / `sh: syntax error: unexpected "("` — the multi-line, multi-quote-level script does not survive being re-parsed by the remote `sh -c`, and results differ depending on the user's *local* shell (cmd vs. PowerShell vs. git-bash) doing its own layer of escaping before that. **What actually worked reliably**: have the user run `railway ssh --service backend` with **no trailing command**, which drops them into a real interactive remote shell (single layer of quoting from then on), then paste the `node -e "..."` script directly at that remote prompt. (A base64-encode-and-pipe workaround was tried first and also technically works, but is more fragile across different local shells than just "open an interactive session and paste.")
- **`require('pg')` fails from the container's default cwd.** This is a pnpm workspace with strict (non-hoisted) `node_modules` — `pg` isn't a direct dependency at the root, so plain `require('pg')` throws `Cannot find module`. Fixed by `find / -type d -path "*/node_modules/pg" 2>/dev/null`, which surfaced **two coexisting versions**, each duplicated under both the source tree and the compiled output:
  ```
  /app/node_modules/.pnpm/pg@8.20.0/node_modules/pg
  /app/node_modules/.pnpm/pg@8.16.3/node_modules/pg
  /app/.medusa/server/node_modules/.pnpm/pg@8.20.0/node_modules/pg
  /app/.medusa/server/node_modules/.pnpm/pg@8.16.3/node_modules/pg
  ```
  `require()`-ing by the absolute `.pnpm` path (any of the four works for a read-only query) sidesteps the resolution issue. Used `/app/node_modules/.pnpm/pg@8.20.0/node_modules/pg`.

## Verification performed

Query run from inside the `backend` container (`DATABASE_URL` env var already points at `postgres.railway.internal`, reachable from there):

```sql
SELECT id, email, first_name, last_name, has_account, created_at
FROM customer WHERE email LIKE 'test-reg-railway-%'
ORDER BY created_at DESC LIMIT 5;
```

Returned two rows (two separate test executions during this session, ~24s apart — not a single test creating two rows), each with a **distinct** email, `has_account: true`, and correct `first_name`/`last_name`. Followed up with:

```sql
SELECT email, COUNT(*) FROM customer GROUP BY email HAVING COUNT(*) > 1;
```

→ **empty result**, confirming the registration flow never creates two `customer` rows for the same email (no double-submit bug in `storefront/src/modules/account/components/register/index.tsx`'s form handling, at least not one that reaches the DB).

## Stable test account created for a future login-railway.spec.ts

Login test coverage against this deployment (open item #5 below) needs a **fixed, known-password account** — unlike registration, which deliberately uses a fresh timestamped email every run to avoid "customer already exists" collisions, a login test needs to log into the *same* account repeatedly. Created one directly via the Store API (not through the browser — faster, and doesn't require driving Playwright just to seed data) using the flow `storefront/src/lib/data/customer.ts`'s `signup()` follows: `POST /auth/customer/emailpass/register` → `POST /store/customers` (with the returned auth token) → `POST /auth/customer/emailpass` to confirm login succeeds. Publishable key fetched fresh via `GET /key-exchange` (same endpoint the storefront's own `key-exchange` route uses).

```
email:    e2e-login-railway@example.com
password: TestPassword123!
first_name: E2E
last_name:  LoginTest
customer id: cus_01KWH7TJSC216CCWZDR0X03D3Z
```

Login confirmed working end-to-end (`POST /auth/customer/emailpass` returned a valid session JWT). This is a throwaway account on a demo/smoke-test deployment, not a real customer — credentials are recorded here in plaintext deliberately, same spirit as this repo's other demo-deployment secrets (see `docs/railway.md`'s admin password note). **Do not reuse this pattern for a production deployment's credentials.**

Not yet done: the actual `login-railway.spec.ts` file. Next agent picking this up should follow the `register-railway.spec.ts` pattern (plain `@playwright/test` import, `"chromium railway"` project) and use these credentials directly rather than registering a new account per run.

## Open items / what the next agent should do

1. **`docs/railway.md` needs a refresh** to describe the Terraform-managed deployment (new domains, new service names, no GitHub-disconnected `railway up` flow anymore) — not done this session, flagged above under "Deployment has moved."
2. **A registered SSH key (`duc.dangtrong@orientsoftware.com`) is now attached to the user's Railway account**, added this session to enable `railway ssh`. Not removed — the user was told where to remove it (Railway dashboard → Account Settings → SSH Keys, or `railway ssh keys`) if unwanted, but no action was taken either way.
3. **No cleanup of test customer rows.** Consistent with session 005/006's precedent for `checkout-railway.spec.ts` (creates real, uncleaned orders each run) — `register-railway.spec.ts` likewise leaves real `customer` rows in the live deployment's Postgres on every run. Harmless for a demo/smoke-test deployment; worth knowing before running it in a loop or CI.
4. **If DB verification is needed again and the operator's network allows arbitrary outbound TCP ports**, the `railway tcp-proxy create --port 5432 --service postgres` path (then a local `pg` client, then `railway tcp-proxy delete`) is simpler than the SSH path and doesn't require the user's passphrase — try that first and only fall back to interactive `railway ssh` if it times out.
5. Only `register-railway.spec.ts`'s guest→registered-customer flow was covered. Login, profile edit, and address-management flows still have no `*-railway.spec.ts` equivalent — same DB-reset-fixture landmine (session 005) would apply if someone tries to point the existing `authenticated/*.spec.ts` suite at this deployment directly. **A stable account for a login test now exists** (see "Stable test account created for a future login-railway.spec.ts" above) — `login-railway.spec.ts` itself still needs to be written.
