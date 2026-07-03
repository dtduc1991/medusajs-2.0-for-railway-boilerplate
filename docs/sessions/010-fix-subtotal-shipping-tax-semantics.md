# Handoff: Fixed the cart/order subtotal-includes-shipping bug, found a second identical bug in the shipping row, added tax e2e coverage

## Context

Repo: `medusajs-2.0-for-railway-boilerplate`. Direct follow-up to [009-login-and-discount-e2e-against-railway.md](009-login-and-discount-e2e-against-railway.md)'s open item #1: "the `cart-subtotal` label/behavior inconsistency ... is unaddressed at the source." That session found that a completed order's `subtotal` field includes shipping, contradicting the storefront's "Subtotal (excl. shipping and taxes)" label, but didn't root-cause it or fix it.

Status: **Done**, but left a persistent state change on the live Railway deployment (a real 20% German tax rate) - see "Open items" below.

## Root cause (both bugs below share this)

Read Medusa's actual totals-calculation source rather than treating cart vs order as separately-computed. Both `CartModuleService.retrieveCart` and `OrderModuleService`'s order hydration call the **same shared function**, `decorateCartTotals()` in `@medusajs/utils` (`dist/totals/cart/index.js`). Inside it:

```js
// per line item
subtotal = MathBN.add(subtotal, itemSubtotal)
// per shipping method
subtotal = MathBN.add(subtotal, shippingMethodTotals.subtotal)
```

So `subtotal` = Σ(item subtotals) + Σ(shipping-method subtotals) by definition - pre-tax, pre-discount, but **not** pre-shipping. This is also confirmed in `@medusajs/types`' own field docs (`http/cart/common.d.ts` / `http/order/common.d.ts`): *"The cart's subtotal before discounts, excluding taxes. Calculated as the sum of `item_subtotal` and `shipping_subtotal`."*

The apparent cart-vs-order difference in session 009 was just **timing**: the cart's subtotal was read before a shipping method was attached (empty `shipping_methods` array → shipping term contributes 0), while a completed order always has a shipping method attached by the time it's read. Same formula, different point in the flow - not a data-model divergence.

`item_subtotal` (items-only, pre-tax, pre-shipping) is the field that actually holds what the storefront's label claims. It's already returned by both the store cart and store order APIs by default (`query-config.js` for both `store/carts` and `store/orders` includes it in `defaults`) - no backend changes needed anywhere in this session.

## Bug #1: `subtotal` includes shipping (session 009's original find)

Fixed in [storefront/src/modules/common/components/cart-totals/index.tsx](../../storefront/src/modules/common/components/cart-totals/index.tsx) (shared by cart, checkout, and order-complete pages) and [storefront/src/modules/order/components/order-summary/index.tsx](../../storefront/src/modules/order/components/order-summary/index.tsx) (account order-detail page, a separate component with the identical bug, found by grepping for other `.subtotal` usages): switched from `totals.subtotal` / `order.subtotal` to `totals.item_subtotal` / `order.item_subtotal`.

Commit: `b0e4d59`.

## Bug #2: `shipping_total` includes tax (found while writing a shipping+tax test for bug #1's fix)

Not discovered by re-reading code - discovered empirically. The user asked for a test case that exercises both shipping *and* taxes together (session 009's fix/test only ever ran against a 0%-tax deployment, so the "excludes taxes" half of the label was never actually verified). Building that test required first noticing this deployment has zero tax rates configured anywhere (tax regions exist per country via `createTaxRegionsWorkflow` in `backend/src/scripts/seed.ts`, but no rate is ever attached - `automatic_taxes: true` on the Europe region computes to 0 tax on every order out of the box).

After seeding a real tax rate and running the new test, the math didn't add up: `item_subtotal + shipping_row_value + tax_total` overshot the real `total` by exactly the shipping tax amount. Queried the live order directly via Admin API (`GET /admin/orders?fields=...`) and found `shipping_total: 12` while `shipping_subtotal: 10` and the shipping method's own `tax_total: 2` - i.e. **`shipping_total` is tax-inclusive** (`shipping_subtotal + shipping_tax_total`), the same pattern as bug #1's `subtotal`. The "Shipping" row was rendering `shipping_total` verbatim, so summing the visible rows (Subtotal + Shipping + Taxes) double-counted the shipping tax.

Fixed in the same two files: switched the Shipping row from `shipping_total` to `shipping_subtotal` (also already returned by default in both cart and order APIs).

Commit: `60ab599`.

## New e2e coverage: `seedTax()` and a shipping+tax test

Added `seedTax()` to [storefront/e2e/data/seed.ts](../../storefront/e2e/data/seed.ts), following `seedDiscount()`'s idempotent pattern (deletes any leftover rate with the same code before creating a fresh one). It creates a real 20% tax rate on a country's tax region via `POST /admin/tax-rates` (needs `tax_region_id`, looked up via `GET /admin/tax-regions?country_code=...`).

**Gotcha hit and fixed**: `AdminGetTaxRatesParams` does not accept a `code` query filter (only `tax_region_id`) - filtering by code has to happen client-side over the listed rates, otherwise the Admin API 400s.

**Bigger gotcha, since fixed**: initially seeded the tax rate on country `"gb"` (UK), matching the address convention every other `-railway` spec test uses. `seedTax()` leaves the rate behind in the deployment's Postgres with no cleanup (same "harmless for a demo deployment" caveat `seedDiscount()` already has) - but unlike a leftover promotion code, a leftover *tax rate* actively changes order totals for every subsequent test that checks out with a UK address. This silently broke `checkout-railway.spec.ts` and this file's own discount test (both assume 0% tax on `gb`). Caught it by re-running the full suite instead of just the new test. **Fixed by moving the new test's checkout address to Germany (`"de"`)** - not used by any other `-railway` spec - and deleting the stray UK tax rate from the live deployment via a one-off Admin API call.

New test: `discount-railway.spec.ts` → "Order subtotal excludes both shipping and taxes once a real tax rate is configured". Seeds the German tax rate, checks out with a German address, and asserts `item_subtotal + shipping_subtotal + tax_total == total` while the displayed `cart-subtotal` testid equals `item_subtotal` alone (not inflated by shipping or tax).

Commits: `60ab599` (test + seedTax), `43f4dca` (moved address off `gb` to `de`, cleaned up the stray rate).

## Verification performed

All commits were pushed to `main` and verified against the **live Railway deployment** (both `backend` and `storefront` are GitHub-connected and auto-deploy from `main` - see `docs/railway.md`), not just locally:

- After each push, polled `railway status` until both services left "Building"/"Deploying", then confirmed `curl .../health` (backend) and `curl .../` (storefront, expects a 307 region redirect) before re-running tests.
- `discount-railway.spec.ts` (all 3 tests, including the new one): pass.
- `checkout-railway.spec.ts`: pass (confirms the `shipping_subtotal` fix didn't break its UK-address assumptions once the stray tax rate was removed).
- `login-railway.spec.ts`: pass (unaffected, included as a cheap regression check since it shares the same live deployment).
- Did **not** re-run the local (non-Railway) `discount.spec.ts` this session - see open items.

## Open items / what the next agent should do

1. **A real 20% German (`de`) tax rate (`TEST_TAX_RATE`) is now permanently seeded on the live Railway deployment.** This is deliberate (needed for `seedTax()`'s idempotent re-seeding on future test runs) but means any future `-railway` spec that checks out with a German address will now see non-zero tax - keep this in mind the same way the existing UK-address convention is documented. If a future session adds more `-railway` coverage, prefer `gb` (still 0% tax) unless tax behavior is specifically what's being tested, in which case reuse `de` rather than introducing a third country.
2. **The local (non-Railway) `discount.spec.ts` was not re-run this session.** Session 009 already noted its order-subtotal assertion happened to match the pre-fix behavior by coincidence and flagged it for re-verification; that re-verification still hasn't happened. It's optimistically expected to still pass now (its assertion already expected the items-only figure), but should be confirmed against a real docker-compose run.
3. **`checkout.spec.ts`, `cart.spec.ts`, `giftcard.spec.ts`, and other local specs that render `CartTotals` or `OrderSummary` were not re-run.** They all run against a `us`/USD region (per `check-env-variables`/local seed, not this repo's own `backend/src/scripts/seed.ts`) with 0% tax by default, so the `item_subtotal`/`shipping_subtotal` switch should be a no-op for them - but this is inferred from reading the fix, not verified by running them.
4. **This session (like 005/006/008/009 before it) leaves more real state behind on the live deployment**: guest orders from every `-railway` spec run this session, plus the `TEST_TAX_RATE` on `de` from item #1 above. Harmless for a demo deployment, same caveat as prior sessions.
5. Remaining gaps from session 008/009: profile-edit and address-management flows still have no `*-railway.spec.ts` equivalent.
