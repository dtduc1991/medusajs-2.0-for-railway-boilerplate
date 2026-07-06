# Handoff: checkout login nudge + real default-address prefill; phone-or-email login (blocked, DB needs a fix first)

## Context

Two related pieces of work against `new-storefront/` (Ember) checkout in one continuous session, the
second building directly on a gap the first flagged.

**Part A — done, verified, not yet committed.** Checkout previously had no concept of login at all
(session 012's explicit "guest checkout, not gated by auth" decision) and no prefill. Added: a
dismissible "log in to earn points" nudge for guests, and default-info prefill for logged-in customers.

**Part B — code complete, typechecks/builds clean, but currently BLOCKED and the dev database is left
in a broken state.** Part A's summary noted the real gap: `Customer.defaultAddress` was always `null`
because nothing in the app ever wrote to a customer's address book. This part closes that gap (real
persisted default address at signup) and adds phone-or-email login, dropping postal code/country from
the checkout form. **Do not consider this part done** — see "Current broken state" below before doing
anything else.

Full plans (design rationale, alternatives, exact rejected approaches) are preserved at
`C:\Users\duc.dangtrong\.claude\plans\abstract-sleeping-lamport.md` (this file was reused/overwritten
across both parts of this session — only its final version, for Part B, is current).

## Part A — checkout login nudge + default-info prefill

- `new-storefront/src/lib/auth.ts`: `Customer` gained `defaultAddress` (from `customer.addresses`,
  preferring `is_default_shipping`).
- `new-storefront/src/screens/CheckoutScreen.tsx`: takes `customer`/`onGoToAccount` props. Guest nudge
  (`data-testid="checkout-login-nudge"`, dismissible, does not block guest checkout). Logged-in prefill
  falls back through `defaultAddress` → the customer profile's own name, with a "Use a different
  address" override that clears the form for one-off editing (no persistence).
- `new-storefront/src/App.tsx`: wires `customer`/`onGoToAccount={() => goTab('you')}` into
  `CheckoutScreen`.
- `new-storefront/e2e/checkout.spec.ts`: extended with nudge-dismissal + logged-in-prefill coverage.
- **Verified**: `npm run build` clean, full Playwright suite (13 specs at the time) passed against the
  running docker-compose stack.

This part is real and working as of this session, but was superseded in-place by Part B's further
edits to the same files (`CheckoutScreen.tsx`'s form fields, `auth.ts`'s `Customer`/`signup`/`login`) —
the description above is what Part A *added*; read Part B for what the code looks like now.

## Part B — phone number, persisted default address, phone-or-email login, drop postal/country

### Scope decisions (confirmed with the user before implementing)

- Phone becomes the **required**, primary login identifier; email becomes **optional**.
- Signup now also collects `address_1`/`city` and persists them as the customer's real default
  address (`sdk.store.customer.createAddress(..., is_default_shipping: true)`) — first genuine write
  to the address book anywhere in this app.
- Checkout form drops postal code and country entirely; country is hardcoded internally
  (`DEFAULT_COUNTRY_CODE` in `new-storefront/src/lib/checkout.ts`).
- The user picked Vietnam (`vn`) as that hardcoded country. `vn` was not in the single seeded region
  (`backend/src/scripts/seed.ts`'s `countries = [gb, de, dk, se, fr, es, it]`) — the user chose to
  **extend the seed data** (add `vn` to the existing EUR "Europe" region/tax zones/service zone) rather
  than pick an already-seeded country, since coffee/extras products are only priced in `eur`/`usd` and
  a new region+currency would need re-pricing every product.

### Why no new auth provider was needed

Read Medusa's built-in `emailpass` provider (`@medusajs/auth-emailpass`) and the core login route
(`@medusajs/medusa/dist/api/auth/[actor_type]/[auth_provider]/route.js`) directly in `node_modules`
(pnpm virtual store — see "gotcha" below for how to find these):

- The auth identity's `entity_id` is an opaque unique string with **no format validation** anywhere in
  the register/login routes (`req.body` passed straight through). Registering with `email: <phone>`
  works identically to today's email flow, just keyed on phone.
- The core login route's only Medusa-specific step after `authenticate()` succeeds is
  `generateJwtTokenForAuthIdentity`, itself a thin wrapper around the **publicly exported**
  `generateJwtToken` (`@medusajs/framework/utils`) — reproducible in a custom route without deep
  imports.
- `Customer.email`/`.phone` are both `.nullable()` at the model level and `.nullish()` in the
  `StoreCreateCustomer` zod validator — email-optional-at-signup needed zero backend model changes.
- Phone-uniqueness-at-registration is **free**: `EmailPassAuthService.register()` already rejects
  re-registering a claimed `entity_id` (`"Identity with email already exists"`). Since phone *is* the
  entity_id, this already prevents two accounts sharing a phone.

**Gotcha hit while building the route**: `FilterableCustomerProps` (the typed filter DTO) only has
`email`, not `phone`, even though the `Customer` model has a plain filterable `phone` column — cast
past the incomplete type (`{ phone: identifier } as any`) rather than fight it; confirmed at runtime
this filters correctly.

### Files changed

- **New**: `backend/src/api/auth/customer/emailpass/login-by-identifier/route.ts` — public POST route.
  Resolves `identifier` (phone or email) → customer via `listCustomers({phone})` then `{email}` fallback
  → always authenticates against `customer.phone` (the true registered entity_id) via
  `authModuleService.authenticate("emailpass", ...)` → mints a token with `generateJwtToken` matching
  the core route's payload shape. Generic 401 on any failure (no oracle on which field matched).
- **New**: `backend/src/scripts/add-vietnam-region.ts` — one-off idempotent script for the
  *already-seeded* docker-compose DB (re-running edited `seed.ts` isn't safe: `createRegionsWorkflow`
  unconditionally creates a new region rather than upserting). Run via
  `npx medusa exec ./src/scripts/add-vietnam-region.ts` (also added as
  `pnpm seed:add-vietnam-region` in `backend/package.json`). **See "Current broken state" — this
  script had two real bugs, only fixed as of the latest edit, and was never re-verified end to end.**
- `backend/src/scripts/seed.ts`: added `"vn"` to `countries` (line 65) and to the fulfillment set's
  `geo_zones` — covers fresh seeds/CI at zero cost.
- `new-storefront/src/lib/checkout.ts`: `CheckoutAddress` dropped `postal_code`/`country_code`, gained
  `phone`. Added internal `DEFAULT_COUNTRY_CODE = 'vn'`, injected into the cart address payload inside
  `setCheckoutAddress` (never exposed to the UI).
- `new-storefront/src/lib/auth.ts`: `Customer.email` is now `string | null`, gained `phone`.
  `signup()` now takes `phone` (required), `email` (optional), `address_1`, `city`; registers the auth
  identity with `email: phone`, creates the customer, **creates a default address**, catches the
  duplicate-identity error and rethrows as `"This phone number is already registered."`. `login()`
  rewritten to call the new custom route via `sdk.client.fetch()` (same escape-hatch pattern
  `lib/loyalty.ts` already established) instead of `sdk.auth.login()`, then `sdk.client.setToken()`
  manually.
- `new-storefront/src/screens/AccountScreen.tsx`: `AuthForm`'s login mode is now a single
  `identifier-input` (email or phone); signup mode gained `phone-input` (required),
  `address-input`/`city-input` (required, becomes the default address), `email-input` now optional.
  `Profile` shows phone/email conditionally (either may be absent) with a first_name → phone → email
  fallback chain for the avatar initial/heading.
- `new-storefront/src/screens/CheckoutScreen.tsx`: postal-code field and country `<select>` removed
  entirely; added a `phone-input` field, included in `canReview` and the address sent to
  `setCheckoutAddress`. Prefill/override logic extended to cover phone.
- `new-storefront/src/screens/RewardsScreen.tsx`: null-safety fixes for `customer.email` now being
  nullable (fallback chain `first_name → phone → email`).
- `new-storefront/src/App.tsx`: `handleLogin`/`handleSignup` signatures updated to match.
- `new-storefront/e2e/auth.spec.ts`, `checkout.spec.ts`, `rewards.spec.ts`: updated for the new
  signup/login/checkout field shapes (phone required at signup, `identifier-input` for login, no
  postal-code/country-select in checkout). **Not yet run against the fixed backend — see below.**

## Current broken state — READ BEFORE DOING ANYTHING ELSE

**The docker-compose dev database's `geo_zone` table currently contains ONLY `vn`** — the other 7
countries (gb/de/dk/se/fr/es/it) were wiped out. This breaks shipping-option resolution (and therefore
checkout) for every country except Vietnam, for **every test and every manual check**, until fixed.

### Root cause (hit twice, same bug shape both times)

`add-vietnam-region.ts`'s first version called `fulfillmentModuleService.listServiceZones()` with no
`relations` config. Medusa doesn't eager-load `geo_zones` by default, so `serviceZone.geo_zones` came
back `undefined`, not an empty array. The script's "does vn already exist" check
(`serviceZone.geo_zones?.some(...)`) was therefore always `false`, and `updateServiceZones()` — a
**full-replace** call, not an append/patch — was called with `geo_zones: [{country_code: "vn", ...}]`
only, deleting the other 7 in the same operation. This is the same relation-loading trap as
`regionModuleService.listRegions()`'s `.countries` (which the script *did* fix, with
`{relations: ["countries"]}` — see below), but the service-zone case wasn't caught in the same pass.

**Not caught by reading code — caught empirically**, twice, by querying `geo_zone` directly via `psql`
after each run. A second, unrelated gotcha compounded debugging this: the docker-compose backend
connects to database **`test_medusa_db`**, not `medusa` (confirmed via
`docker compose exec backend printenv DATABASE_URL`) — an earlier `psql -d medusa` check against the
wrong database looked like the region-country fix hadn't persisted at all, when it actually had.

The region-`countries` case has an analogous root cause and was fixed correctly: calling
`regionModuleService.updateRegions()` (what `updateRegionsWorkflow`'s step calls internally) silently
no-ops on `countries` — that field is only wired up in the module's custom-overridden
`create`/`upsertRegions` methods (confirmed by reading `@medusajs/region`'s `region-module.js` in
`node_modules/.pnpm/@medusajs+region@.../dist/services/region-module.js`). Fixed by calling
`regionModuleService.upsertRegions()` directly instead of going through the workflow.

### What's fixed vs. not-yet-reverified

- `add-vietnam-region.ts` now has `{ relations: ["geo_zones"] }` added to its `listServiceZones()` call
  (same fix pattern as the countries case) — **this typechecks clean but has never been run
  successfully end-to-end**. The conversation was interrupted (user redirected to writing this note)
  immediately before re-running it.
- The actual DB data was restored once already via a throwaway `fix-geo-zones.ts` script (not
  committed, already deleted) that set `geo_zones` back to all 8 countries directly — but then the
  **still-unfixed** version of `add-vietnam-region.ts` was copied into the container and re-run to test
  idempotency, which wiped it out **a second time**. The relations fix was written immediately after,
  but not yet copied into the container or re-verified.
- The corrected `add-vietnam-region.ts` (with the `geo_zones` relations fix) has NOT been copied into
  the running backend container yet (recall: the compose backend service has no source bind-mount —
  builds from a Dockerfile — so local source edits need `docker compose cp <file> backend:/app/<path>`
  to take effect against the *running* container without a full image rebuild).

### Also unverified this session (blocked on the above)

- The new `/auth/customer/emailpass/login-by-identifier` route has never been curled or exercised —
  no confirmation yet that phone-or-email login actually works end-to-end.
- `new-storefront`'s full Playwright suite has not been run since Part B's edits — the updated specs
  (phone signup, identifier login, no postal/country fields) are unverified against a real backend.
- The backend Docker image *was* rebuilt once this session (to bake in the new auth route and updated
  `seed.ts`) and the container recreated — that part is real and current. It's only the
  *one-off Vietnam script's* correctness that's in question.

## Follow-up session — all open items resolved

A later session (2026-07-06) picked this up and closed every item above. Summary, in order:

1. **`geo_zone` restore was worse than diagnosed.** Querying `test_medusa_db` directly found *two*
   tables wiped to `vn`-only, not one: `geo_zone` (as expected) but also `region_country` (the region's
   country assignment) — the same relation-loading trap had silently hit `upsertRegions()` too, on an
   earlier bad run where `existingCountries` was read back empty. `tax_region` was unaffected (additive
   `createTaxRegions`, not a full-replace). Fixed with a throwaway `restore-full-coverage.ts` (not
   committed — copied into the container via `docker compose cp`, run once, deleted) that explicitly set
   both `region.countries` and `service_zone.geo_zones` back to all 8 (`gb,de,dk,se,fr,es,it,vn`).
2. **Idempotency confirmed.** Re-ran the corrected `add-vietnam-region.ts` (with the `geo_zones`
   relations fix, copied into the running container) immediately after restoring — all three checks
   logged "already ..." with counts unchanged (8/8) before and after.
3. **Verified via `psql` against `test_medusa_db`** — `geo_zone`, `region_country`, and `tax_region` all
   show 8 rows.
4. **Curled `/auth/customer/emailpass/login-by-identifier` directly** — login by phone: works. Login by
   email: works. Wrong password and unknown identifier: both a generic 401, no oracle. This step also
   surfaced a real bug session 014 missed (see below).
5. **Full Playwright suite: 15/15 passed** against the live docker-compose stack (`npx playwright test
   e2e` from `new-storefront/`), after the fix in the next paragraph and after filling in `email-input`
   in signup steps that several tests had missed (`auth.spec.ts` ×2, `checkout.spec.ts` ×1,
   `rewards.spec.ts` ×4 — pre-existing gaps in the specs' own coverage, unmasked by the email-required
   reversal below).
6. **Real bug found and a scope decision reversed.** Curling `POST /store/customers` with no `email`
   (the phone-only-signup path Part B was built around) failed with `"Email is required to create a
   customer"`. Session 014 confirmed `email` is `.nullish()` in the `StoreCreateCustomer` zod validator
   and concluded "email-optional-at-signup needed zero backend model changes" — but missed that Medusa's
   core `createCustomerAccountWorkflow` runs a separate step, `validateCustomerAccountCreation`
   (`@medusajs/core-flows`), that unconditionally throws if `email` is falsy, independent of what the
   route's own validator allows. Confirmed by reading `validate-customer-account-creation.js` directly,
   and reproduced twice (fails with `email` omitted, succeeds identically with a real email attached).
   Presented three options to the user (bypass the workflow with a custom route; synthesize a placeholder
   email; make email required again) — **user chose to reverse the "email optional" scope decision**
   rather than add a workaround route. Email is now required at signup again:
   - `new-storefront/src/lib/auth.ts`: `signup()`'s `email` field is `string` again (was `?: string`),
     always passed straight to `sdk.store.customer.create(...)`.
   - `new-storefront/src/screens/AccountScreen.tsx`: `onSignup`'s `email` prop is required; `canSubmit`
     now includes `email` in the signup-mode check; placeholder text dropped "(optional)".
   - `new-storefront/src/App.tsx`: `handleSignup`'s `fields.email` type updated to match.
   - Phone-or-email **login** is unaffected and still works as designed — only signup changed.
7. **Still not committed** — same file set as before (see original list above) plus the email-required
   reversal on top. Ask the user before committing/pushing.

## Suggested skills for the next session

None outstanding for Part B — `/verify` (or manual browser check) is still worth doing once this is
committed, since this session's confirmation was Playwright + curl, not an interactive browser session.
