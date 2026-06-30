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

   Full research on the v2 Promotions module — data model, rule/operator system, the `computeActions` algorithm, campaign budgets, and the actual admin/store API surface to migrate `seed.ts` against — is now written up in [003-promotions-module-discount-specs.md](003-promotions-module-discount-specs.md). Key takeaways for fixing this spec cluster:
   - There is no `/admin/discounts` in v2. Coupon-style discounts are created via `POST /admin/promotions` with `type: "standard"`, an `application_method` (`type: fixed|percentage`, `target_type: order|items|shipping_methods`), and optional `rules`. Gift cards have no direct v2 equivalent in this module — they'd need separate research if those specs are to be salvaged rather than dropped.
   - The storefront-facing flow to apply/remove a code on a cart is `POST` / `DELETE /store/carts/:id/promotions` with body `{ promo_codes: string[] }` (see §5 of the linked doc), **not** any of the v1 discount endpoints `seed.ts`/fixtures currently assume.
   - Seeding a promotion for tests likely means: `POST /admin/promotions` (admin auth, same pattern as the `loginAdmin()` fix already applied) with a minimal `standard` + `fixed` or `percentage` application method, then asserting the storefront's promo-code UI calls the store route above. Confirm the exact request schema by reading `admin/promotions/validators.js` first (flagged as unverified in the linked doc, §7) before writing the new seed code.
2. **Login/register specs (~6 tests)**: `login.spec.ts` and `register.spec.ts`. The "wrong credentials" test cases pass (error message shows correctly), but "successful login redirects to account page" and "logging out" consistently fail — the page never navigates past the sign-in form even though the exact same credentials work fine via direct `curl` against `/auth/customer/emailpass`. This was reproduced twice (not a flake). Root cause not yet identified — likely a storefront-side issue in the login server action (cookie/redirect timing), not a test-infra problem. No server-side error was visible in `docker logs` for the storefront container, suggesting the error (if any) is being swallowed client-side or in a server action that doesn't log.

## Update: Promotions module migration + a real app bug fixed (discount.spec.ts)

Acting on the research in [003-promotions-module-discount-specs.md](003-promotions-module-discount-specs.md):

- **`seed.ts`**: `seedDiscount()` now calls `POST /admin/promotions` (v2: `type: "standard"`, `application_method: { type, value, currency_code, target_type: "order" }`) instead of the nonexistent `/admin/discounts`. Verified end-to-end via direct `curl` against a real cart (`POST /store/carts/:id/promotions`) before touching the test code — the API itself works correctly.
- **`loadRegion()`**: stopped hardcoding a `usd` filter. This boilerplate's `backend/src/scripts/seed.ts` only provisions a single **Europe/`eur`** region — there is no `us`/`usd` region at all, unlike the upstream `medusa-starter-default` this e2e suite was written against (despite the storefront's own `NEXT_PUBLIC_DEFAULT_REGION=us` env var suggesting otherwise — that env var has no seeded region to back it). `loadRegion()` now just takes whichever region exists.
- **`seedGiftcard()`** now throws clearly, and `giftcard.spec.ts` is `test.describe.skip()`'d with an inline comment — gift cards have no v2 Promotions-module equivalent, and the storefront's own `src/lib/data/cart.ts` already has gift-card application (`applyGiftCard`, `removeGiftCard`) commented out as unsupported.

This surfaced a **real, pre-existing bug in the storefront app code**, not a test/infra issue — [`src/modules/checkout/components/discount-code/index.tsx`](../../storefront/src/modules/checkout/components/discount-code/index.tsx) (shared by both the cart and checkout promo-code UI):
1. The applied discount's numeric value had no `data-testid`/`data-value` at all — it was inlined as plain text inside the `discount-code` span. Fixed by giving it its own `<span data-testid="discount-amount" data-value={...}>` sibling, and moving `discount-code` onto just the `<Badge>` (it previously wrapped both the code *and* the amount, so `toHaveText(code)` assertions were doomed to fail even with the amount testid added).
2. **Dead error-handling code**: the component called `useFormState(submitPromotionForm, null)` to get a `message`/`formAction` pair, but the `<form>`'s `action` was wired to a separate local function (`addPromotionCode`) that never used `formAction` — so `submitPromotionForm` and its error message never ran, and `discount-error-message` could never become visible even on a genuine failure (e.g. an invalid promo code). Fixed by having `addPromotionCode` catch errors into local `useState` and removing the unused `useFormState`/`submitPromotionForm` wiring.

Both fixes were verified headed, rebuilding the `storefront` docker image each time (no src volume mount — see [001](001-added-docker-compose-file.md) point 3, the image bakes `src` at build time):
- "fake discount displays an error message" (cart + checkout) — **now pass** (were failing before, timing out waiting for an error message that could never appear).
- "discount works during transaction" / "discount can be used when entered in from cart" — `discount-code`/`discount-amount` lookups now resolve correctly and match.

### Follow-up: fixed the amount mismatch and the duplicate-code issue too

Both items flagged below as open were real and have been fixed in `seed.ts`'s `seedDiscount()`:
- **Amount**: changed the hardcoded `amount` from `2000` to `5`. Confirmed via the store API that this boilerplate's seeded products (Sweatshirt, Sweatpants, etc.) are priced `10` (eur, plain units) — `5` is safely below any single-item cart subtotal used across the spec's test cases, so the fixed discount applies in full instead of being capped.
- **Duplicate code**: `seedDiscount()` now does `GET /admin/promotions?code=TEST_DISCOUNT_FIXED` and deletes any existing match before creating a new one, making repeated `beforeEach` calls within one spec file idempotent (confirmed via direct `curl` that v2 does reject a duplicate `code` with `"Promotion with code: X, already exists."` — this was a real, reproducible bug, not a hypothetical).

Re-running `discount.spec.ts` (9 tests) headed went from 2/9 passing to **6/9 passing**. The 3 that still fail all trace back to the same single root cause, confirmed by isolating one of them: it now passes the entire discount-application section cleanly and only fails later, at `shippingCountrySelect.selectOption("United States")` — there's no `us`/`usd` region seeded at all (see `loadRegion()` note above), so `"United States"` was never a selectable option in the only region that exists (`Europe`, countries `dk/fr/de/it/es/se/gb`). This is the same gap that almost certainly explains most of `checkout.spec.ts`'s failures from the original 13/52 run too — it's a seed-data gap in `backend/src/scripts/seed.ts`, not anything in the e2e suite or the discount-code component. (One of the 3 failures, when run as part of the full 9-test batch, instead showed a timing-related timeout on `discount-amount` that did **not** reproduce when the same test was run in isolation — likely headed-mode flakiness under back-to-back sequential load, not a real regression.)

## Open items / what the next agent should do

- **Don't re-trust the docker-compose `DATABASE_URL` value as committed** — it currently points at `test_medusa_db`, not the dev `medusa` database, because of change #2 above. If picking this up cold, either restore it to `medusa` for normal dev work, or be aware tests already point at the test DB.
- **No `us`/`usd` region in this boilerplate's seed data is the real remaining blocker** for `discount.spec.ts` (3/9 still fail) and likely most of `checkout.spec.ts`. Fixing this means either adding a second region to `backend/src/scripts/seed.ts` (a real backend seed-data change, re-affects the dev DB clone too) or rewriting the e2e fixtures to use a Europe-compatible shipping country (`"Denmark"` etc.) instead of `"United States"`. Not attempted this session — flagged, not fixed, since it touches backend seed data rather than test code.
- **Promotions module rewrite still needed for the remaining `discount.spec.ts` assertions** — module research is done, see [003-promotions-module-discount-specs.md](003-promotions-module-discount-specs.md).
- **`giftcard.spec.ts` is now skipped, not deleted** — revisit if Medusa ever ships a v2-native gift card module.
- **Debug the login redirect issue** — start with `e2e/fixtures/account/login-page.ts` and the storefront's actual login server action/page component to see what happens client-side after `signInButton.click()`. Consider running with `--debug` or recording video (`use: { video: 'on' }` in `playwright.config.ts`) since the headed run didn't surface an obvious error. Not investigated further this session.
- Containers were left running at handoff with `backend` pointed at `test_medusa_db`. `storefront/.env` and the compose edit are uncommitted local state. The `storefront` docker image was rebuilt twice this session (`docker compose build storefront && docker compose up -d storefront`) to pick up the `discount-code/index.tsx` fix — remember this step is required after any further `storefront/src` change, it will not hot-reload.

## Suggested skills for the next session

- **`/code-review`** — the `seed.ts` patch (auth endpoint + two-step customer registration) was written and self-validated via `curl` + one test run; worth a second opinion before treating it as the canonical v2 migration pattern for the rest of the suite.
- **`tdd`** — if rewriting the gift card/discount seeding against the Promotions module, doing it test-first against the real v2 API (as was done here via `curl` before touching `seed.ts`) is the pattern that worked — keep using direct `curl` probes against `localhost:9000` to confirm an endpoint's actual request/response shape before writing the Playwright-side code.
