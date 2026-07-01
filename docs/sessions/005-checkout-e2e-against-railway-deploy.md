# Handoff: Wrote and ran a headed Playwright checkout test against the live Railway deployment

## Context

Repo: `medusajs-2.0-for-railway-boilerplate`. Continuation of [docs/railway.md](../railway.md), which covers the first live Railway deployment of this app (backend + storefront + Postgres + Redis, no Meilisearch/MinIO). Task this session: write and run (headed) a Playwright checkout flow test against that live deployment — `https://storefront-production-4524.up.railway.app` / backend `https://backend-production-88f56.up.railway.app` — not the local docker-compose stack the existing e2e suite normally targets.

Status: **Done, test passes.** File: [storefront/e2e/tests/public/checkout-railway.spec.ts](../../storefront/e2e/tests/public/checkout-railway.spec.ts) (new, not yet committed — see open items).

## Why this isn't just "run checkout.spec.ts against a different URL"

Two things about the existing suite made a new spec necessary rather than pointing the old one at Railway:

### 1. The shared fixtures auto-reset the database before every test — dangerous against a live deployment

[storefront/e2e/fixtures/index.ts](../../storefront/e2e/fixtures/index.ts#L23) has an `auto: true` fixture:

```ts
resetDatabaseFixture: [
  async function ({}, use) {
    await resetDatabase()
    await use()
  },
  { auto: true, timeout: 10000 },
],
```

`resetDatabase()` ([storefront/e2e/data/reset.ts](../../storefront/e2e/data/reset.ts)) runs raw SQL against Postgres (`PGHOST`/`PGUSER`/`PGPASSWORD`/`PGDATABASE` env vars, defaulting to `localhost`/`postgres`/`postgres`/`postgres` per [storefront/.env](../../storefront/.env)) that **terminates connections, renames the database, recreates it from a template database, and drops the renamed original** — before *every single test* that imports `test`/`expect` from `"../../index"` (which is all of the existing specs — they all merge in `fixtures`). This is fine for the local docker-compose harness, which owns a disposable `test_medusa_db`. It is **not** something you want running against a real deployment's database, and — subtly — it's also not something you want running against a local docker-compose stack that happens to be up and in active use, since `docker-compose.yml` points the real `backend` container's `DATABASE_URL` at that same `test_medusa_db`.

This fixture fires regardless of which Playwright *project* runs the test (it's baked into the fixture chain itself, not gated behind the `"public setup"` / `"cleanup test database"` project dependency graph in `playwright.config.ts` — that teardown project is a *second*, separate thing that also touches the DB). Confirmed by testing: even a from-scratch minimal `defineConfig()` with no `dependencies`/`teardown` declared still triggered a Postgres connection attempt, because the fixture chain (`"../../index"` → `fixtures/index.ts`) was still being imported by the spec.

**Fix used**: `checkout-railway.spec.ts` imports `test`/`expect` directly from `"@playwright/test"`, not from `"../../index"`, and drives the page with plain `page.getByTestId(...)` locators instead of the shared `CartPage`/`CheckoutPage`/`ProductPage`/`StorePage`/`OrderPage` fixture classes. This avoids the fixture chain entirely — no DB reset, no dependency on `CLIENT_SERVER`/`NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` env vars either (those are only needed by `e2e/data/seed.ts`, which is likewise not imported).

**If a future agent wants proper Page Object reuse against a live deployment**, the real fix is upstream: make `resetDatabaseFixture` opt-in (e.g. gate it behind an env var like `E2E_RESET_DB=1`, defaulting off) rather than `auto: true` unconditionally. Not attempted this session — out of scope, and changing shared fixture behavior risks the existing docker-compose-targeted suite.

### 2. This repo's seed data doesn't match what `checkout.spec.ts` expects

`checkout.spec.ts` was written for `medusa-starter-default`'s seed (a `us`/`usd` region, a `"FakeEx Standard"` shipping option). This repo's actual seed ([backend/src/scripts/seed.ts](../../backend/src/scripts/seed.ts)) is different — already flagged in [docs/sessions/002](002-e2e-playwright-headed-against-docker-compose.md) and [004](004-fix-customer-auth-headers-and-rerun-e2e.md), and directly relevant here:

- Region: single Europe/`eur` region, countries `gb, de, dk, se, fr, es, it` — no `us`/`usd`. Confirmed live via `GET /store/regions`: `display_name` values are `Denmark, France, Germany, Italy, Spain, Sweden, United Kingdom` (exact strings the country `<select>` renders, from `country.display_name` in [storefront/src/modules/checkout/components/country-select/index.tsx](../../storefront/src/modules/checkout/components/country-select/index.tsx#L28)).
- Shipping options: `"Standard Shipping"` and `"Express Shipping"` (not `"FakeEx Standard"`).
- Only one payment provider is configured: `pp_system_default`, which the storefront labels **"Manual Payment"** (see `paymentInfoMap` in [storefront/src/lib/constants.tsx](../../storefront/src/lib/constants.tsx#L29)).

`checkout-railway.spec.ts` uses `"United Kingdom"` / `"Standard Shipping"` accordingly.

### 3. A gotcha specific to writing this spec: the payment step's submit button starts disabled

[storefront/src/modules/checkout/components/payment/index.tsx](../../storefront/src/modules/checkout/components/payment/index.tsx#L213) disables `submit-payment-button` until a payment method radio is actually selected (`!selectedPaymentMethod && !paidByGiftcard`). With only one provider configured, it's tempting to assume it's pre-selected — it isn't. The radio option itself has no `data-testid` ([storefront/src/modules/checkout/components/payment-container/index.tsx](../../storefront/src/modules/checkout/components/payment-container/index.tsx)), so the test clicks it by its visible label text: `checkout.getByText("Manual Payment").click()`, *then* clicks `submit-payment-button`. Without this click, the button stays disabled forever and the test times out waiting for it to become clickable — that's the exact failure hit on the first run of this spec.

## How to run it

From `storefront/`, against a deployed environment (not local docker-compose):

```bash
export NEXT_PUBLIC_BASE_URL="https://storefront-production-4524.up.railway.app"
npx playwright test --config=<path-to-a-minimal-standalone-config> --headed
```

A minimal standalone config is required — **do not** run this spec with the repo's own `storefront/playwright.config.ts` directly without checking its `webServer`/project setup first, since that config's `"chromium public"` project still carries the `"public setup"` → `"cleanup test database"` dependency chain for *other* specs in the same directory (`public/*.spec.ts` testMatch), even though `checkout-railway.spec.ts` itself doesn't use the risky fixtures. The config used this session (not committed, lived in the session's scratchpad dir) was effectively:

```ts
import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "<absolute path to>/storefront/e2e",
  testMatch: "public/checkout-railway.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.NEXT_PUBLIC_BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
})
```

If this spec is going to be run regularly (vs. this session's one-off), consider adding a proper `"chromium railway"` project to the real `storefront/playwright.config.ts` that matches only this file and has no `dependencies`/`teardown` — cleaner than a throwaway external config, and keeps it discoverable/committed. Not done this session to avoid touching the shared config under time pressure.

## Verification performed

Ran headed, 1 test, 1 passed (~22s). Flow exercised: store → product page → select size M on "Medusa Sweatshirt" → add to cart → cart → checkout → fill UK shipping+billing address → select "Standard Shipping" → select "Manual Payment" → submit payment → submit order → order confirmation page, then asserted the confirmation page shows the correct product/variant/quantity, shipping address (including `GB` country code), contact info, and shipping method name.

Not verified: whether the resulting order is visible via `/store/orders` as a guest (returns `401 Unauthorized` without a customer session — expected, not a bug, just not checked further since the UI-level confirmation was the assertion target).

## Open items / what the next agent should do

1. ~~Not committed yet~~ — resolved in a follow-up session: a `"chromium railway"` project was added to `storefront/playwright.config.ts` (no `dependencies`/`teardown`, `testMatch: "public/checkout-railway.spec.ts"`, and `"chromium public"` gained a matching `testIgnore` so it isn't double-picked-up). Run via `npm run test-e2e:railway` (`storefront/package.json`) with `NEXT_PUBLIC_BASE_URL` set to the target deployment. The throwaway standalone config described below is no longer needed; the snippet is kept for historical context only. Re-verified passing against the live Railway deployment through this project.
2. **Consider making `resetDatabaseFixture` opt-in** (see gotcha #1) if more tests need to target live/deployed environments going forward — right now every other spec in `e2e/tests/public|authenticated` is unusable against a live deployment without hitting this same DB-reset landmine.
3. ~~Consider formalizing a `"chromium railway"` project~~ — done, see item 1.
4. This spec creates a real order in the live Railway Postgres database each time it runs (guest checkout, no cleanup) — harmless for a demo/smoke-test deployment, but worth knowing before running it repeatedly or in any kind of CI loop against a real customer-facing environment.
