# Handoff: Running storefront e2e Playwright suite (headed) against the docker-compose stack

## Context

Repo: `medusajs-2.0-for-railway-boilerplate` (Medusa v2.13.6 backend + Next.js storefront), stack already running via the docker-compose setup from [001-added-docker-compose-file.md](001-added-docker-compose-file.md). Task: run `storefront/e2e` (Playwright) in headed mode against the live docker-compose containers.

Status: **Partially working, not done.** Infra wiring is complete and the suite runs headed against the real containers. 13/52 tests pass as of last run. Remaining failures are real incompatibilities between this bundled e2e suite (written for Medusa v1-era APIs) and the v2 backend actually running here — not infra problems. See "Open items" for what's left.

## Why this was non-trivial (read before re-running)

The e2e suite (`storefront/e2e/`) assumes the **backend itself is connected to a dedicated Postgres database whose name starts with `test_`**, because:
- `e2e/tests/global/teardown.ts` calls `resetDatabase()` (in `e2e/data/reset.ts`), which connects to Postgres **directly via the `pg` client as a superuser** and renames/recreates that database in place — it does not go through the Medusa API.
- `e2e/data/seed.ts` seeds data by hitting the **live backend REST API** (`CLIENT_SERVER`, default `localhost:9000`).

So the backend process serving port 9000 must be the one pointed at `test_medusa_db`, not the normal dev `medusa` database. This means swapping `DATABASE_URL` is not optional config — it requires actually repointing and restarting the `backend` container.

## What was changed

1. **Created `test_medusa_db`** inside the existing `postgres` container, cloned from `medusa`:
   ```sh
   docker exec medusajs-20-for-railway-boilerplate-postgres-1 psql -U postgres \
     -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='medusa' AND pid <> pg_backend_pid();" \
     -c "CREATE DATABASE test_medusa_db WITH OWNER postgres TEMPLATE medusa;"
   ```
2. **[docker-compose.yml](../../docker-compose.yml)** — `backend.environment.DATABASE_URL` changed from `.../medusa?sslmode=disable` to `.../test_medusa_db?sslmode=disable`. This is a **live edit to the tracked compose file**, currently uncommitted. `docker compose up -d backend` then `docker compose up -d storefront` (storefront must be recreated too — it uses `network_mode: "service:backend"`, so when `backend`'s container is recreated, `storefront`'s shared network namespace reference goes stale).
3. **Created `storefront/.env`** (gitignored, not in repo before) with:
   - `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_MEDUSA_BACKEND_URL`, search vars matching the compose defaults
   - `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` — copied from the running storefront container's boot log (it self-fetches this from the backend at container start; the host-side Playwright process needs its own copy since it's a separate Node process)
   - Postgres reset vars (`PGHOST=localhost`, `PGUSER=postgres`, `PGPASSWORD=postgres`, `TEST_POSTGRES_DATABASE=test_medusa_db`, `PRODUCTION_POSTGRES_DATABASE=medusa`, etc. — see `e2e/README.md` and `e2e/.env.example` for the full variable reference)
   - `MEDUSA_ADMIN_EMAIL=admin@yourmail.com` / `MEDUSA_ADMIN_PASSWORD=supersecret` (matches `backend/.env`)
4. **[storefront/playwright.config.ts](../../storefront/playwright.config.ts)** — set `webServer.reuseExistingServer: true` (was commented out). Without this, Playwright tries to spawn a second `yarn start` on port 8000, which is already bound by the docker `storefront` container.
5. **[storefront/e2e/data/seed.ts](../../storefront/e2e/data/seed.ts)** — patched two Medusa v1 → v2 API incompatibilities:
   - `loginAdmin()`: was POSTing to `/admin/auth/token` (v1, returns `access_token`) — changed to `/auth/user/emailpass` (v2, returns `token`).
   - `seedUser()`: was POSTing directly to `/store/customers` — v2 requires (a) an `x-publishable-api-key` header on all store requests, and (b) customer creation is now a two-step flow: `POST /auth/customer/emailpass/register` (creates the auth identity + returns a bearer token) then `POST /store/customers` with that token to create the actual customer record. Added `axios.defaults.headers.common["x-publishable-api-key"]` and rewired `seedUser` accordingly.

## Verification performed

Ran `npx playwright test --headed` from `storefront/` twice (full suite, then `login.spec.ts` in isolation to rule out flakiness). Confirmed via direct `curl` that the v2 auth endpoints work correctly outside of Playwright (admin login, customer register, customer login all return valid tokens for the seeded user).

**Result: 13/52 passed**, including all of `search.spec.ts` and parts of `cart`/`checkout`. Failures cluster into two root causes, both pre-existing in the bundled suite (not something this session introduced):

1. **Gift card / discount specs (~20 tests)** — `seedGiftcard()`/`seedDiscount()` in `seed.ts` POST to `/admin/gift-cards` and `/admin/discounts`. These endpoints don't exist in Medusa v2 — gift cards/discounts were replaced by the **Promotions module**, which has a different API shape entirely. Every spec that depends on these (directly or via `region.id` from `loadRegion()`, which itself may also need checking against v2's `/admin/regions` response shape) fails.
2. **Login/register specs (~6 tests)**: `login.spec.ts` and `register.spec.ts`. The "wrong credentials" test cases pass (error message shows correctly), but "successful login redirects to account page" and "logging out" consistently fail — the page never navigates past the sign-in form even though the exact same credentials work fine via direct `curl` against `/auth/customer/emailpass`. This was reproduced twice (not a flake). Root cause not yet identified — likely a storefront-side issue in the login server action (cookie/redirect timing), not a test-infra problem. No server-side error was visible in `docker logs` for the storefront container, suggesting the error (if any) is being swallowed client-side or in a server action that doesn't log.

## Open items / what the next agent should do

- **Don't re-trust the docker-compose `DATABASE_URL` value as committed** — it currently points at `test_medusa_db`, not the dev `medusa` database, because of change #2 above. If picking this up cold, either restore it to `medusa` for normal dev work, or be aware tests already point at the test DB.
- **Promotions module rewrite needed** for gift card/discount specs to pass — this is real feature work (new v2 API calls, possibly new fixture/locator updates if the storefront UI for promotions differs from what `e2e/fixtures/*` expects), not a quick patch.
- **Debug the login redirect issue** — start with `e2e/fixtures/account/login-page.ts` and the storefront's actual login server action/page component to see what happens client-side after `signInButton.click()`. Consider running with `--debug` or recording video (`use: { video: 'on' }` in `playwright.config.ts`) since the headed run didn't surface an obvious error.
- **`loadRegion()` in `seed.ts`** (`/admin/regions`) hasn't been independently verified against v2's response shape — it may have the same kind of drift as the auth endpoints did. Worth checking directly via `curl` before assuming it's fine just because no error was thrown.
- Containers were left running at handoff with `backend` pointed at `test_medusa_db`. `storefront/.env` and the compose edit are uncommitted local state.

## Suggested skills for the next session

- **`/code-review`** — the `seed.ts` patch (auth endpoint + two-step customer registration) was written and self-validated via `curl` + one test run; worth a second opinion before treating it as the canonical v2 migration pattern for the rest of the suite.
- **`tdd`** — if rewriting the gift card/discount seeding against the Promotions module, doing it test-first against the real v2 API (as was done here via `curl` before touching `seed.ts`) is the pattern that worked — keep using direct `curl` probes against `localhost:9000` to confirm an endpoint's actual request/response shape before writing the Playwright-side code.
