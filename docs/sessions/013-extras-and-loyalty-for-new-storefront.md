# Handoff: Real extras (add-ons) and a real loyalty-points ledger for `new-storefront` (Ember)

## Context

Session 012 closed out checkout/payment and customer auth for Ember, leaving one open item
from its own handoff: extras (add-ons) and loyalty stars were still fully mocked, explicitly
blocked on a product decision (`new-storefront/docs/backend-integration.md`'s "Gaps with no
first-class Medusa equivalent"). This session got that decision from the user and implemented
both halves in full, verified against the real docker-compose stack (not just typecheck/build).

Two scope decisions confirmed by the user up front:
- **Extras** → model each extra as its own product/variant, added as a **separate cart line
  item** linked to the parent drink's line item via metadata. No custom backend module — reuses
  core cart/pricing/tax as-is.
- **Loyalty stars** → build a **real custom points-ledger module**, not
  `@medusajs/loyalty-plugin` — research in this session (re-reading
  `docs/research/002-loyalty-plugin-gift-card-testcases.md`) confirmed that plugin implements
  gift cards/store credit, not a points ledger, so it wouldn't have solved this at all.

Full plan (design rationale, alternatives considered, exact code snippets) is preserved at
`C:\Users\duc.dangtrong\.claude\plans\lively-purring-wozniak.md` if more detail is needed than
this handoff carries.

## What was built

### Extras as real, priced cart line items

- `backend/src/scripts/seed-coffee.ts`: added an `EXTRAS` array and a second product-creation
  block seeding two single-variant products ("Extra Espresso Shot" €0.90, "Cold Foam Top" €0.70)
  in a new `"Extras"` product category — deliberately **no Size/Milk options**, which is what
  `new-storefront/src/lib/backend.ts`'s `listDrinks()` already relies on to exclude non-drink
  products from the menu (`toVariant`'s `if (!size || !milk) return null` /
  `listDrinks`'s `.filter((d) => d.variants.length > 0)`) — confirmed no storefront filter
  changes were needed.
- `new-storefront/src/lib/backend.ts`:
  - `listExtras()` — fetches products in the `"Extras"` category, maps each to
    `{ id: <variant id>, label, price }`.
  - `addDrinkWithExtras(variantId, quantity, extraVariantIds)` — adds the drink, resolves its
    *new* line item id (not returned directly by `createLineItem`'s response — resolved by
    diffing cart item ids before/after the call), then adds each extra as its own line item via
    `addExtraLineItem(cartId, variantId, quantity, parentLineItemId)`, which sets
    `metadata: { parent_line_item_id }` (the SDK's `StoreAddCartLineItem` already types
    `metadata?: Record<string, unknown>` — no cast needed).
  - `removeLineItem(cartId, lineId)` — cascade-deletes any line items whose
    `metadata.parent_line_item_id` matches before deleting the line itself; wired into
    `changeLineItemQty`'s `quantity <= 0` branch so removing a drink also removes its extras.
  - `toCart`'s per-item mapping now carries `CartItem.parentLineItemId` from
    `item.metadata?.parent_line_item_id`.
- `new-storefront/src/types.ts` / `data.ts`: added `ExtraProduct` (real, variant-backed),
  `CartItem.parentLineItemId?: string`; removed the mocked `EXTRAS` export and the now-unused
  `Extra` interface.
- `DrinkDetailScreen.tsx`: takes a new `extras: ExtraProduct[]` prop (real data from
  `listExtras()`, fetched once in `App.tsx` alongside `listDrinks()`/`retrieveCart()`) instead of
  importing the `data.ts` mock; `onAdd` signature gained `extraVariantIds: string[]`. Added
  `data-testid="add-to-bag-button"`.
- `CartScreen.tsx`: splits `cart.items` into parents and a `Map` of linked extras by parent line
  id; renders extras nested under their drink with a **distinct** `data-testid="cart-item-extra"`
  (not `cart-item`) so the pre-existing `checkout.spec.ts` count assertion (which only exercises
  the quick-add path, never extras) keeps passing unaffected.
- **Known, accepted limitation**: changing a drink's quantity in the cart *after* adding it does
  not cascade-update its linked extras' quantities (they stay at add-time quantity). Removing
  the drink still correctly removes its extras. This wasn't asked for and would need a real
  quantity-sync mechanism to fix.

### Real points-ledger loyalty module

- `backend/src/modules/loyalty/` — this repo's **first module with its own persisted entities**
  (the two pre-existing custom modules, `email-notifications` and `minio-file`, are provider
  modules with no data model at all). `LoyaltyAccount` (`customer_id` unique, `balance`) has-many
  `LoyaltyTransaction` (`amount`, `reason`, `reference_id`), declared via `model.hasMany`/
  `model.belongsTo` with `mappedBy` on both sides (verified in a REPL that this generates the
  `account_id` foreign key correctly) — `service.ts`'s `MedusaService({ LoyaltyAccount,
  LoyaltyTransaction })` auto-generates all CRUD methods used elsewhere (`listLoyaltyAccounts`,
  `createLoyaltyTransactions`, etc.), no manual repository code.
- `backend/medusa-config.js`: registered as `{ resolve: './src/modules/loyalty' }` — a plain
  top-level `modules:` entry (no `key:`/`options.providers` wrapper; those are only for
  overriding/feeding core modules, confirmed by every pre-existing entry in this file).
- `backend/src/subscribers/award-loyalty-points.ts`: subscribes to `order.placed` (payload is
  thin, just `{ id }` — refetches the order via `query.graph` for `customer_id`/`total`, same
  pattern as the existing `order-placed.ts`). Awards `Math.round(order.total * 2)` points —
  matches the rate `CartScreen.tsx`'s pre-existing cosmetic "Earns +N stars" estimate already
  used, so the number a customer saw pre-checkout now matches what they actually earn. Guest
  checkout orders still carry a `customer_id` (Medusa creates a guest customer record even
  without login) — points silently accrue to an identity that's never viewed unless the same
  person later logs in with a cart created *while already authenticated* (see note below);
  consistent with the already-accepted "no guest→customer cart transfer" limitation from session
  012's open item #1.
- `backend/src/api/middlewares.ts` (new — none existed before): requires customer auth
  (`authenticate("customer", ["session", "bearer"])`) on `/store/loyalty*`.
- `backend/src/api/store/loyalty/route.ts` (new): `GET` returns `{ balance, transactions }` for
  `req.auth_context.actor_id`. Uses `AuthenticatedMedusaRequest` from `@medusajs/framework/http`
  (not the plain `MedusaRequest` the repo's other custom routes use) — needed because
  `auth_context` isn't on the base `MedusaRequest` type; this was the one real typecheck failure
  hit during implementation, fixed by switching the request type.
- `new-storefront/src/lib/loyalty.ts` (new): `getLoyaltyAccount()` — first use in this codebase
  of the SDK's generic `sdk.client.fetch()` escape hatch (no `sdk.store.*` typed method exists
  for a custom route); publishable-key/JWT headers are still attached automatically.
- `RewardsScreen.tsx`: now takes a `customer: Customer | null` prop (passed from `App.tsx`);
  logged-out shows a login prompt instead of mocked stars; logged-in fetches
  `getLoyaltyAccount()` with loading/error states. `REWARD_THRESHOLD = 8` is now a local display
  constant (was `USER.rewardThreshold` in the mock); `data.ts`'s `USER` was trimmed to just
  `{ firstName }` since `stars`/`starsToReward`/`rewardThreshold` had no other consumers
  (`MenuScreen`'s greeting only ever used `firstName`).

## Verified

Not just typecheck/build — exercised against the real docker-compose stack:
1. Rebuilt the backend image (`docker compose build backend`) so the new module/route/subscriber
   code was actually present (the compose backend service builds from a Dockerfile, no source
   bind-mount — this is the same gotcha session 012 hit for `seed-coffee.ts`).
2. `docker compose exec backend npx medusa db:generate loyalty` generated
   `backend/src/modules/loyalty/migrations/Migration20260705092220.ts` **inside the container**
   (its filesystem isn't bind-mounted either) — copied out via `docker cp` into the actual source
   tree so it's committed, then applied with `npx medusa db:migrate`. Confirmed via `psql`
   (`\dt`, `mikro_orm_migrations`) that `loyalty_account`/`loyalty_transaction` tables exist and
   the migration is recorded.
3. Re-ran `pnpm seed:coffee` in the container — confirmed the two new "Extras" products exist in
   `test_medusa_db` via a direct `psql` query.
4. `cd new-storefront && npx playwright test e2e` — **all 8 specs pass**, including two new ones
   added this session:
   - `e2e/extras.spec.ts` — customizing a drink adds its pre-selected extra as a linked
     `cart-item-extra`; removing the drink cascade-removes it.
   - `e2e/rewards.spec.ts` — logged-out Rewards tab shows the login prompt (not stale mock data);
     signing up *before* creating a cart, then placing a real order, results in a nonzero real
     star balance and an activity row on the Rewards tab.
   - The pre-existing `checkout.spec.ts`/`auth.spec.ts` (5 specs) still pass unaffected.
5. Both `backend`'s `npx tsc --noEmit` and `new-storefront`'s `npm run build` (`tsc -b && vite
   build`) pass clean. The backend's Docker build already runs `medusa build` (production build
   path, same as Railway) and `pnpm start`'s `init-backend` ran migrations at container startup
   without error — this is stronger verification than a bare local typecheck.

## Follow-up (same session, later pass): items 1 and 2 fixed

1. **Extras now scale with drink quantity.** `new-storefront/src/lib/backend.ts`'s
   `changeLineItemQty` looks up any cart items whose `metadata.parent_line_item_id` matches the
   line being changed and applies the same new quantity to them before refetching the cart — so
   e.g. bumping 1 latte-with-extra-shot to 2 also bumps the shot to 2. Removal (`quantity <= 0`)
   was already handled by the pre-existing cascade-delete in `removeLineItem`. Verified with a new
   `e2e/extras.spec.ts` test that adds a drink+extra, clicks the cart's qty-plus button, and reads
   the cart back directly via `GET /store/carts/:id` (publishable-key header, no SDK) to assert
   both line items' `quantity` match — the UI itself never displays an extra's quantity, so
   asserting through the API was the only way to actually check this.
2. **Loyalty points now survive login-after-cart-creation.** Root cause was as suspected (Medusa
   fixes `cart.customer_id` at cart-*creation* time), but the fix was much smaller than it looked:
   Medusa core already ships `POST /store/carts/:id/customer` (the
   `transferCartCustomerWorkflow`, idempotent no-op if the cart already belongs to the caller),
   exposed on the JS SDK as `sdk.store.cart.transferCart(id)`. Added
   `transferCartToCustomer()` in `backend.ts` (returns `null` on no local cart / a stale-cart
   error) and call it right after `login()`/`signup()` succeed in `App.tsx`'s `handleLogin`/
   `handleSignup`, applying the returned cart to state. No custom backend code needed. Verified
   with a new `e2e/rewards.spec.ts` test: quick-add a drink *before* signing up (guest-owned
   cart), sign up, then place the order — asserts a nonzero star balance and one activity row,
   which would have failed pre-fix (points would've accrued to the throwaway guest customer
   record instead). Full 10-spec suite (`npx playwright test e2e`) passes.

## Follow-up (same session, later pass): items 3 and 4 fixed

3. **Redemption flow built.** `backend/src/api/store/loyalty/redeem/route.ts` (new, authenticated
   `POST`) debits `REWARD_THRESHOLD` points as a `LoyaltyTransaction` with
   `reason: "reward.redeemed"`, `amount: -REWARD_THRESHOLD`, 400s if the account's balance is
   short. No workflow — plain `MedusaService` calls, matching the existing GET route's and the
   awarding subscriber's style (no locking/transaction wrapping anywhere in this ledger yet; a
   known, accepted race-condition risk on rapid double-clicks, same class of issue as the
   subscriber's own read-then-write). `new-storefront/src/lib/loyalty.ts` gained `redeemReward()`
   and a shared `toActivity()` mapper (was inlined) with a `reason -> label` table so
   `"reward.redeemed"` now renders as "Free drink redeemed" in Activity, not the raw reason
   string. `RewardsScreen.tsx` shows a "Redeem free drink" button once `balance >= rewardThreshold`
   (replacing the "N more stars" copy for that state) with pending/error states.
4. **Loyalty rate/threshold are now env-configurable.** New
   `backend/src/modules/loyalty/config.ts` reads `LOYALTY_POINTS_PER_CURRENCY_UNIT` (default `2`)
   and `LOYALTY_REWARD_THRESHOLD` (default `8`) — both documented in `backend/.env.template`.
   Both the awarding subscriber and the new redeem route import from here instead of hardcoding.
   Added a **public** (no-auth) `GET /store/loyalty/config` so the storefront — including guests,
   for the cart's pre-checkout "Earns +N stars" estimate — can read the same numbers instead of
   duplicating them; `App.tsx` fetches it once at bootstrap (falling back to the same defaults if
   the fetch fails) and threads it down to `CartScreen` (`pointsPerCurrencyUnit`) and
   `RewardsScreen` (`rewardThreshold`), replacing both files' hardcoded constants.
   - **Gotcha hit and fixed**: a middleware route entry with only `matcher` + `middlewares` (no
     `methods`) gets registered by Medusa as a plain Express `app.use(matcher, ...)` mount, which
     matches by path *prefix* — so a bare `"/store/loyalty"` matcher was also forcing auth on
     `/store/loyalty/config` (caught this via a live `curl` against the rebuilt container, not
     typecheck). Fix: add explicit `methods: ["GET"]` / `["POST"]` to each middleware route entry
     in `backend/src/api/middlewares.ts` so Medusa registers them as exact-path `app.get`/`app.post`
     instead. Worth remembering for any future custom route under a shared prefix with a public
     sibling.

Verified end-to-end against the rebuilt docker-compose backend (not just typecheck): rebuilt the
backend image twice (once per fix), confirmed `curl` against `/store/loyalty/config` (200,
unauthenticated), `/store/loyalty` and `/store/loyalty/redeem` (401 unauthenticated, as intended).
Added `e2e/rewards.spec.ts`'s "redeeming a reward debits the threshold and logs an activity row"
(signs up, places one order — which nets well over the 8-point default threshold at seeded coffee
prices — clicks redeem, asserts the balance drop equals the value read back from
`GET /store/loyalty/config`, and asserts the new activity row reads "Free drink redeemed"). Full
suite is now 11 specs, all passing (`cd new-storefront && npx playwright test e2e`).

## Open items / what the next agent should do

1. ~~Extras quantity doesn't sync after add-time~~ — fixed in this session.
2. ~~Loyalty points only ever accrue to orders placed while already logged in~~ — fixed in this
   session.
3. ~~No redemption flow for loyalty points~~ — fixed in this session.
4. ~~Loyalty point rate/threshold are hardcoded~~ — fixed in this session.

None of the original four open items remain. Possible future work, not asked for and not built:
wrapping the ledger's award/redeem read-then-write sequences in a lock or workflow if
concurrent-request correctness ever matters beyond this demo.

## Follow-up (later session): real fulfillment/coupon behind a redemption

Redemption used to be ledger-only (debit the points, log an activity row — no actual discount).
`backend/src/api/store/loyalty/redeem/route.ts` now also mints a real Medusa **promotion** via
`IPromotionModuleService.createPromotions()` (core module, resolved with `Modules.PROMOTION` —
same pattern as the existing `Modules.API_KEY`/`Modules.PRODUCT` usages elsewhere in this repo,
no new dependency needed since `@medusajs/promotion` ships as a transitive dep of
`@medusajs/medusa`):
- `type: "standard"`, `is_automatic: false`, **`limit: 1`** (single-use), random code
  (`FREE-<8 hex chars>`).
- `application_method`: `percentage` / `value: 100` / `target_type: "items"` /
  `allocation: "each"` / **`max_quantity: 1`** — discounts exactly one unit of one line item, not
  the whole cart. Scoped away from the "Extras" category via a `target_rules` entry on
  `items.product.categories.id` (`operator: "ne"`) so a redemption can't be used to zero out an
  extra shot instead of a drink.
- The rule-attribute path (`items.product.categories.id`) and its `in`/`eq`/`ne` operators were
  confirmed against the running dev backend's own
  `GET /admin/promotions/rule-attribute-options/target-rules` endpoint (not guessed from
  memory), and the whole shape was validated end-to-end with a throwaway promotion applied to a
  real cart via `curl` before writing any storefront code — confirmed a 2-quantity drink + 2-qty
  extra cart discounts to exactly one drink unit, extra untouched.
- `LoyaltyTransaction.reference_id` (previously always `null` on redeem) now stores the
  promotion's code, so the ledger keeps a real link to what was actually issued.
- Response body gained a `code` field alongside the existing `balance`/`transactions`.

`new-storefront/src/lib/loyalty.ts`'s `redeemReward()` now returns `code` too.
`new-storefront/src/App.tsx` gained `handleRedeem`: mints the code, then immediately tries
`applyPromoCode(code)` against whatever cart currently exists (the same
`sdk.store.cart.update(cartId, { promo_codes })` call the pre-existing manual "Apply a promo
code" cart UI already used) — a no-cart-yet failure is expected and swallowed, not an error, since
the code is still valid for later manual entry. `RewardsScreen.tsx` takes a new
`onRedeem: () => Promise<{ account; code; appliedToCart }>` prop (redemption's cart-application
side effect lives in `App.tsx`, matching where `applyPromo`/cart state already live — the screen
itself only renders the outcome) and shows one of two confirmation strings via a new
`data-testid="redeem-confirmation"`: "Applied! Your free drink discount is in your bag." or
"Reward unlocked — enter code FREE-XXXXXXXX in your bag to redeem it."

**Verified end-to-end, not just typecheck**: rebuilt the backend image, recreated both `backend`
and `storefront` docker-compose containers (recreating `backend` invalidates `storefront`'s
network-namespace-shared connection per this repo's known docker-compose gotcha — needed a
`docker compose up -d storefront` after, not just a restart, since restarting a
`network_mode: "service:backend"` container against a *new* backend container ID fails outright).
Backend `npx tsc --noEmit` and `new-storefront`'s `npm run build` both pass clean. Added
`e2e/rewards.spec.ts`'s "redeeming a reward with an item already in the bag applies a real
discount to the cart": places one order to earn points, starts a fresh bag, reads the cart's
`total` directly via `GET /store/carts/:id` before redeeming (same direct-API-read pattern
`extras.spec.ts` already established for state the UI doesn't expose), redeems, asserts the
confirmation text, then re-reads the same cart and asserts `promotions.length === 1` and `total`
strictly decreased. Snaps before every button click through the whole flow (16 screenshots,
`01-menu-initial` through `16-rewards-fulfillment-applied`) so the full state progression —
signup, quick-add, checkout, order confirmation, second cart, redeem — is visually inspectable,
not just the redeem moment.

**Flakiness fix, same pass**: while re-running the full suite to add the before/after snap, found
that the quick-add-then-checkout flow in both this test and the pre-existing "redeeming a reward
debits the threshold" test raced the app's fire-and-forget `void addVariantToCart(...)` — under
the load of running all 12 specs back-to-back (vs. this file's 5 in isolation), the bag could
still be empty by the time the test looked for the pay button, and Playwright's default 5s
assertion timeout wasn't always enough for the add to land. Both call sites now
`await expect(page.getByTestId('cart-item')).toHaveCount(1, { timeout: 15000 })` before proceeding
to checkout, matching the 15s timeout convention already used elsewhere in this file. Confirmed
fixed by re-running the full 12-spec suite twice in a row with no failures.
