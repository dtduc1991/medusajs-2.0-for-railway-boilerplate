# Handoff: Implemented checkout/payment + customer auth for `new-storefront` (Ember)

## Context

Session 011 wired Ember (`new-storefront/`) to the real Medusa backend for browse+cart only and
left checkout/payment and customer auth as explicitly-unimplemented open items requiring product
decisions. This session closed all four open items from that handoff, with two scope decisions
confirmed by the user up front:

- **Checkout is guest checkout, decoupled from auth** — no login required to place an order.
  Auth is additive (login/signup + a "You" tab), not a checkout gate.
- **"You" tab includes real order history** once logged in, via `sdk.store.order.list()`.

Full plan (design rationale, alternatives considered, verification steps) is preserved at
`C:\Users\duc.dangtrong\.claude\plans\humble-waddling-ladybug.md` if you need more detail than
this handoff carries.

## What was built

### Mechanical fixes (session 011's open items #1/#2)
- `docker-compose.yml`: `STORE_CORS` **and** `AUTH_CORS` now both include
  `http://localhost:5173`. Session 011 only flagged `STORE_CORS`; this session hit a second CORS
  block on `/auth/customer/emailpass/register` during live verification and fixed `AUTH_CORS`
  too — **if you add new SDK call surfaces to Ember in the future, check both env vars**, not
  just `STORE_CORS`.
- Backend image rebuilt (`docker compose build backend`) so `seed-coffee.ts` is actually present
  in the image, then `docker compose exec backend pnpm seed:coffee` run against the
  docker-compose stack's `test_medusa_db`. Coffee catalog is now seeded in **both** databases
  (native `medusa` db and docker-compose's `test_medusa_db`).

### Checkout/payment (`new-storefront/src/lib/checkout.ts`, new screens)
- `CheckoutScreen.tsx`: single-page address form (email, first/last name, address line 1, city,
  postal code, country — a `<select>` of the 7 countries `backend/src/scripts/seed.ts` actually
  maps to a shipping service zone: gb/de/dk/se/fr/es/it) → real shipping options
  (`sdk.store.fulfillment.listCartOptions`) → place order.
  - Selecting a shipping method **commits it to the cart immediately**
    (`sdk.store.cart.addShippingMethod`) and refetches the cart to update the displayed total —
    this mirrors `storefront/`'s real checkout behavior and fixes a bug caught during live
    verification (the "Place order" button initially showed the total *before* shipping was
    added, e.g. €5.50 instead of €15.50).
  - `lib/checkout.ts`'s `placeOrder()` throws on a `{ type: "cart" }` completion response instead
    of silently returning it — `storefront/`'s `placeOrder()` has a documented silent-failure bug
    here (`docs/flows/checkout-flow.md`); Ember's version doesn't repeat it.
  - Payment provider is resolved dynamically (`sdk.store.payment.listPaymentProviders`), not
    hardcoded to `pp_system_default`, though that's the only one seeded today.
- `OrderConfirmationScreen.tsx`: shows the real order's `display_id`, "Back to menu" clears local
  cart state.
- `CartScreen.tsx`'s "Pay" button (previously a fully dead no-op, no `onClick` at all) now
  navigates to checkout via a new `onPay` prop.
- `types.ts`'s `View` union gained `{ kind: 'checkout' }` and
  `{ kind: 'orderConfirmation'; orderId; displayId }`, handled in `App.tsx` the same
  "escapes the tab bar" way `{ kind: 'detail' }` already was.

### Customer auth (`new-storefront/src/lib/auth.ts`, `AccountScreen.tsx`)
- Plain `sdk.auth.register` → `sdk.store.customer.create` → `sdk.auth.login` signup sequence,
  matching `storefront/`'s `customer.ts` call order — but **no manual token/cookie plumbing was
  needed**. `@medusajs/js-sdk`'s `Client` already defaults to persisting the JWT to `localStorage`
  and auto-attaching it as a Bearer header on every request; `storefront/`'s
  `getAuthHeaders()`/`setAuthToken()` cookie dance only exists to work around Next.js server
  actions having no persistent client instance across requests, which doesn't apply here.
- `AccountScreen.tsx` replaces the old `<ComingSoon label="Profile" />` placeholder for the "You"
  tab: logged-out state is an inline login/signup form; logged-in state shows real name/email, a
  "Log out" button, and real order history via `listMyOrders()`.
- **No cart↔customer transfer on login** — checking `storefront/` confirmed it doesn't do this
  either (no `transferCart` call anywhere in that codebase), so an order placed as a guest will
  **not** retroactively show up under a subsequently-logged-in customer's order history. This is
  expected, not a bug — don't mistake it for one during future testing.

## Verified (Playwright driver script against the real docker-compose backend, not just `tsc`)

Wrote a throwaway driver script (`@playwright/test`'s `chromium` export, since `chromium-cli`
wasn't available in this environment) exercising the full path: quick-add a drink → Bag → Pay →
fill address (Germany) → real shipping options load → select Standard (total updates from €5.50
to €15.50) → Place order → lands on confirmation with a real order number (`Order #2`) → bag
empty. Then: You tab shows login/signup (not the old placeholder) → sign up a new test customer →
lands logged in with real name/email, "No orders yet" (expected, guest checkout doesn't
retroactively associate) → log out → log back in with the same credentials → same profile shown.
Only console output was two expected 401s from the initial "am I logged in" check while logged
out — not a real error.

`npm run build` (`tsc -b && vite build`) passes clean.

## Open items / what the next agent should do

1. **Order history will only ever show orders placed while logged in.** If a future requirement
   wants guest orders to retroactively appear after signup/login, that needs a cart-transfer step
   on login — not implemented here, and `storefront/` has no precedent for it either.
2. **No password reset / MFA flows** — out of scope for this pass, not started.
3. **Extras (add-ons) and loyalty stars remain fully mocked/decorative**, unchanged from session
   011 — still needs a product decision (custom line-item modifier vs. separate
   product-as-addon; a loyalty module) before any code changes there. `AccountScreen`'s real
   customer name is intentionally independent of `MenuScreen`'s/`RewardsScreen`'s still-mocked
   `USER.firstName` greeting.
4. **No billing address separate from shipping** — `CheckoutScreen` sends the same address for
   both (`billing_address = shipping_address`), the simplest correct option given no billing UI
   existed before this session either.
