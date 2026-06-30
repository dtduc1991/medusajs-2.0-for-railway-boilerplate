# Checkout journey: cart → order confirmation

## Context

Repo: `medusajs-2.0-for-railway-boilerplate` (Medusa v2.13.6 backend + Next.js 14 App Router storefront). This doc covers the storefront-side journey from "cart has items" through "order confirmed", grounded in the actual component/server-action code, not the Medusa docs. It's a sibling to [`003-promotions-module-discount-specs.md`](../sessions/003-promotions-module-discount-specs.md) (backend Promotions module internals) and [`004-loyalty-plugin-gift-card-testcases.md`](../sessions/004-loyalty-plugin-gift-card-testcases.md) (gift cards, not installed in this repo) — discount/gift-card *mechanics* are not re-derived here, only how the checkout UI surfaces them. No application code was modified to produce this doc.

## Overview

Two routes are involved:

- **`/[countryCode]/checkout`** — `storefront/src/app/[countryCode]/(checkout)/checkout/page.tsx`. A single page, not a multi-page wizard. It fetches the cart (`retrieveCart()`, `storefront/src/lib/data/cart.ts:13`) server-side, 404s via `notFound()` if there's no cart (`page.tsx:17-19`), enriches line items with product/variant data, fetches the customer, and renders `CheckoutForm` (the step sections) next to `CheckoutSummary` (cart total + line items + discount code box) in a two-column grid (`page.tsx:34-39`). The whole page is wrapped in `payment-wrapper` (`storefront/src/modules/checkout/components/payment-wrapper/index.tsx`), which conditionally injects Stripe Elements or the PayPal SDK script provider around the children, depending on which payment session is currently active on the cart.
- **`/[countryCode]/order/confirmed/[id]`** — `storefront/src/app/[countryCode]/(main)/order/confirmed/[id]/page.tsx`. Rendered after `placeOrder()` redirects here post-completion. Fetches the order by id (`retrieveOrder`, `storefront/src/lib/data/orders.ts:8-17`), 404s if not found, and renders `OrderCompletedTemplate`.

**Step structure**: `CheckoutForm` (`storefront/src/modules/checkout/templates/checkout-form/index.tsx:27-47`) renders four stacked sections in fixed order — `Addresses`, `Shipping`, `Payment`, `Review` — all on **one page**, not separate routes. Each section is a "collapsible accordion" component that manages its own open/closed state via a `?step=` query param (`address` / `delivery` / `payment` / `review`) read with `useSearchParams()`. Only one section is "open" (its form visible) at a time; completed sections collapse into a read-only summary with an "Edit" button. There is no client-side router/wizard component — each section component independently checks `searchParams.get("step") === "..."` and pushes a new `?step=` value via `router.push()` to advance. Step gating is enforced loosely and inconsistently per-section (see each section's "States & edge cases" below) — nothing prevents jumping the URL param directly to `?step=review` except each section's own internal readiness checks.

---

## 1. Enter/select shipping address (+ contact info)

**Component**: `Addresses` — `storefront/src/modules/checkout/components/addresses/index.tsx`, composing `ShippingAddress` (`.../shipping-address/index.tsx`), `AddressSelect` (`.../address-select/index.tsx`), `BillingAddress` (`.../billing_address/index.tsx`), `CountrySelect` (`.../country-select/index.tsx`).

### User steps

1. Page loads with `?step=address` (default/first step) — section is open (`addresses/index.tsx:30`).
2. If logged in and the customer has saved addresses whose `country_code` is in the cart's region, a "Hi {first_name}, do you want to use one of your saved addresses?" picker (`AddressSelect`, a Headless UI `Listbox`) appears above the form (`shipping-address/index.tsx:86-101`). Selecting one pre-fills the form fields (`setFormAddress`, `shipping-address/index.tsx:37-60`) including email if the saved record carries one.
3. User fills shipping fields: first/last name, address line 1, company (optional), postal code, city, country (native `<select>` populated from `cart.region.countries`), province, email, phone (optional) — `shipping-address/index.tsx:102-204`.
4. "Billing address same as shipping address" checkbox, checked by default (`useToggleState` seeded from `compareAddresses(cart.shipping_address, cart.billing_address)`, `addresses/index.tsx:32-36`). Unchecking reveals a second, separate `BillingAddress` form block (`addresses/index.tsx:76-87`) with its own first/last/address/company/postal/city/country/province/phone fields (no email — billing has no email field).
5. User clicks **"Continue to delivery"** (`SubmitButton`, a `<button type=submit>` inside a native `<form action={formAction}>`).
6. Form submits via the React 18 `useFormState`/server-action pattern: `setAddresses` (`storefront/src/lib/data/cart.ts:300-350`) is bound as `formAction`. It builds a `shipping_address` object from `FormData`, copies it onto `billing_address` if `same_as_billing === "on"`, else reads the separate billing fields, then calls `updateCart(data)` (a `POST` to the Medusa store cart API via the JS SDK). On success it **redirects** (`redirect()`, a true Next.js server redirect, not a client push) to `/${country_code}/checkout?step=delivery` — note this uses the *shipping* country code from the just-submitted form, not necessarily the page's current `[countryCode]` param.
7. On failure, `setAddresses` returns `e.message` as the `useFormState` state, rendered by `ErrorMessage` under the form (`addresses/index.tsx:91`, `data-testid="address-error-message"`).
8. Once closed (`isOpen` false because `?step` moved on), the section collapses to a 3-column read-only summary: Shipping Address / Contact / Billing Address, with a `CheckCircleSolid` check icon next to the "Shipping Address" heading and an "Edit" button that pushes `?step=address` again (`addresses/index.tsx:38-40, 94-180`).

### Component map

| Step | Component / file | Server action / API call |
|---|---|---|
| Render saved-address picker | `shipping-address/index.tsx:86-101` → `AddressSelect` (`address-select/index.tsx`) | none (client-side filter of `customer.addresses`) |
| Country dropdown options | `country-select/index.tsx:21-30` | none — sourced from `cart.region.countries` already on the cart object |
| Submit shipping+billing | `addresses/index.tsx:42,67` (`useFormState(setAddresses, null)`) | `setAddresses` → `updateCart()` (`storefront/src/lib/data/cart.ts:56-69`) → `sdk.store.cart.update(cartId, data)` (Medusa store API `POST /store/carts/:id`) |
| Advance step | `setAddresses` (`cart.ts:347-349`) | Next.js `redirect()` to `?step=delivery` |
| Edit | `addresses/index.tsx:38-40` | client `router.push(pathname + "?step=address")` |

### States & edge cases

- **Loading**: while `cart.shipping_address` hasn't resolved yet in the collapsed view, a `Spinner` is shown instead of the summary (`addresses/index.tsx:174-176`) — this is a defensive branch, not an expected steady state since the form only collapses after a successful submit.
- **Required-field validation**: all shipping fields except company and phone are `required` HTML attributes (native browser validation, no client-side JS schema) — `shipping-address/index.tsx:110,118,127,144,154,162,172,194`. Same pattern for billing (`billing_address/index.tsx`, all but company/phone `required`). Email has `type="email"` for native format validation.
- **Server-side error surfaces generically**: any failure from `updateCart` (invalid country code for region, network error, etc.) is caught in `setAddresses`'s try/catch and returned as raw `e.message` — no field-level validation errors are distinguished from generic API errors; everything renders as one line in `ErrorMessage`.
- **Country list is region-scoped**: `CountrySelect` only offers countries belonging to `cart.region.countries` (`country-select/index.tsx:21-30`) — if a customer's saved address has a `country_code` outside the cart's current region, it's filtered out of the saved-address picker entirely (`addressesInRegion`, `shipping-address/index.tsx:29-35`), not shown as an invalid/greyed option.
- **Redirect target country-code quirk**: the post-submit redirect URL is built from the **just-submitted shipping country**, not the cart's already-resolved region/page locale (`cart.ts:347-349`). If a user changes the shipping country to one in a different region than the URL's `[countryCode]`, the redirect could send them to a different locale path than they started on — not verified end-to-end, flagged as worth testing.
- **Guest vs. logged-in**: the only behavioral branch is the saved-address picker (step 2 above) — gated on `customer && addressesInRegion.length > 0` (`shipping-address/index.tsx:86`). Guests simply never see it; the rest of the form is identical.

---

## 2. Billing address / "same as shipping" toggle

Folded into the same `Addresses` component/form as above (no separate step or URL state). Covered for clarity since the task scope calls it out explicitly.

### User steps

1. Checkbox defaults to **checked** unless the cart already has a `shipping_address`/`billing_address` pair that *don't* match by `compareAddresses` (`addresses/index.tsx:32-36`, util at `storefront/src/lib/util/compare-addresses.ts` — compares `first_name, last_name, address_1, company, postal_code, city, country_code, province, phone` field-by-field via lodash `isEqual(pick(...))`; note `address_2` is **not** part of the comparison).
2. Unchecking reveals the `BillingAddress` block; re-checking hides it again — the billing fields are not cleared on hide, just unmounted (the section re-collapses to "Billing- and delivery address are the same." in the read-only view, `addresses/index.tsx:147-150`).
3. On submit, `same_as_billing === "on"` short-circuits to `data.billing_address = data.shipping_address` server-side (`cart.ts:326-327`) — the (now-unmounted) billing form fields, even if previously filled, are never read in that case.

### States & edge cases

- If the checkbox is checked, the separate billing form is **not rendered at all** (conditionally mounted, `addresses/index.tsx:76`), so there's no hidden-field submission risk — confirmed by reading the JSX, not just the action.
- Billing form has no email field (only shipping does) — billing address has no independent contact concept in this flow.

---

## 3. Select shipping method ("Delivery")

**Component**: `Shipping` — `storefront/src/modules/checkout/components/shipping/index.tsx`.

### User steps

1. Section opens when `?step=delivery` (`shipping/index.tsx:32`), reached automatically after address submit.
2. Available shipping options are fetched **server-side** in `CheckoutForm` before any client interaction — `listCartShippingMethods(cart.id)` (`checkout-form/index.tsx:20`, `storefront/src/lib/data/fulfillment.ts:5-12`) — and passed down as a prop, not fetched client-side by `Shipping` itself.
3. Options render as a Headless UI `RadioGroup` with name + price per option (`shipping/index.tsx:98-127`), price formatted via `convertToLocale`.
4. Selecting an option immediately calls `set(id)` (`shipping/index.tsx:47-56`) — **selection itself triggers the API call**, there's no separate "confirm selection" step; `setShippingMethod({cartId, shippingMethodId})` (`cart.ts:195-213`) calls `sdk.store.cart.addShippingMethod(...)` and revalidates the `"cart"` Next.js cache tag, which re-renders the page with `cart.shipping_methods` populated.
5. A loading spin shows on the button (`isLoading={isLoading}`) while the call is in flight; on error, `err.message` is set into local state and shown via `ErrorMessage` (`data-testid="delivery-option-error-message"`).
6. User clicks **"Continue to payment"** — this is a **plain client-side navigation**, not a form submit (`handleSubmit`, `shipping/index.tsx:43-45`, just `router.push(pathname + "?step=payment")`). It does **not** re-validate that a shipping method is actually set beyond the button's `disabled={!cart.shipping_methods?.[0]}` guard (`shipping/index.tsx:141`).
7. Collapses to a read-only "Method: {name} {price}" summary with an Edit button once advanced past.

### Component map

| Step | Component / file | Server action / API call |
|---|---|---|
| Fetch available options | `checkout-form/index.tsx:20` | `listCartShippingMethods` (`fulfillment.ts:5-12`) → `sdk.store.fulfillment.listCartOptions({cart_id})` (`GET /store/shipping-options?cart_id=`) |
| Select a method | `shipping/index.tsx:98-127` (`RadioGroup onChange={set}`) | `setShippingMethod` (`cart.ts:195-213`) → `sdk.store.cart.addShippingMethod(cartId, {option_id})` |
| Advance to payment | `shipping/index.tsx:43-45` | none — pure client routing, `router.push` |

### States & edge cases

- **No shipping options available**: `listCartShippingMethods` swallows all errors and returns `null` (`fulfillment.ts:9-11`) rather than throwing. `CheckoutForm` then returns `null` for the **entire form** if either `shippingMethods` or `paymentMethods` is falsy (`checkout-form/index.tsx:23-25`) — i.e. a region with no configured shipping options blanks out the *whole checkout page* (still inside the `(checkout)` layout chrome), with no explicit "no shipping options" messaging shown to the user. This is a real, observable failure mode, not a hypothetical — worth a dedicated empty-state UI.
- **Re-selecting**: switching the radio to a different option calls `addShippingMethod` again; a code comment flags this directly — `shipping/index.tsx:35`: `// To do: remove the previously selected shipping method instead of using the last one` — the previously-selected method is **not removed**, only the *last* one is used for `selectedShippingMethod` lookup (`.at(-1)`). Whether stale/duplicate shipping methods accumulate on the cart server-side, or whether Medusa's `addShippingMethod` replaces in place, was not verified by reading backend code in this pass — flagged as an open question.
- **Gating before address completion**: heading is visually greyed/disabled (`opacity-50 pointer-events-none`) only when `!isOpen && cart.shipping_methods?.length === 0` — this is cosmetic (CSS pointer-events), not a hard route guard; the underlying `?step=delivery` URL is directly navigable even without an address.
- **Edit button visibility gated** on `cart.shipping_address && cart.billing_address && cart.email` all being present (`shipping/index.tsx:80-83`) — so you can't re-open delivery from the collapsed summary unless address step actually completed, though this doesn't stop direct URL manipulation.

---

## 4. Apply discount/promotion code at checkout

**Component**: `DiscountCode` — `storefront/src/modules/checkout/components/discount-code/index.tsx`. Rendered inside `CheckoutSummary` (`checkout-summary/index.tsx:23`), i.e. it lives in the right-hand cart-summary column, **not** inside the step accordion — it's visible regardless of which checkout step (`?step=`) is currently open.

This component and its backing action (`applyPromotions`, `cart.ts:231-242`) are the same ones used on the `/cart` page — full mechanics of the Promotions module (rule evaluation, `computeActions`, automatic vs. code-entered promotions, campaign budgets) are documented in [`003-promotions-module-discount-specs.md`](../sessions/003-promotions-module-discount-specs.md) and are **not** re-derived here. Only the checkout-specific UI wiring is covered.

### User steps

1. Collapsed by default behind an "Add Promotion Code(s)" toggle button (`discount-code/index.tsx:62-69`, local `isOpen` state, not the `?step=` URL state).
2. Expands to show a text input + "Apply" submit button.
3. Submitting calls `addPromotionCode` (a local async function wired to the form's `action`, **not** `useFormState`) — appends the new code to the list of already-applied non-automatic promotion codes and calls `applyPromotions(codes)` (`cart.ts:231-242`) → `updateCart({promo_codes: codes})` → Medusa store cart update endpoint.
4. On success the input is cleared and any error message reset; on thrown error, `e.message` is set into local `message` state and rendered via `ErrorMessage` (`data-testid="discount-error-message"`).
5. Applied promotions list renders below, one row per promotion, showing a `Badge` with the code (color green if `is_automatic`, grey otherwise) and the discount amount/percentage. Automatic promotions have **no remove button** (`!promotion.is_automatic` gates the trash-icon button, `discount-code/index.tsx:153-170`) — only manually-entered codes can be removed.
6. Removing a code calls `removePromotionCode` which recomputes the code list **excluding** the removed one and resubmits via `applyPromotions`.

### Component map

| Step | Component / file | Server action / API call |
|---|---|---|
| Apply code | `discount-code/index.tsx:35-55` (`addPromotionCode`) | `applyPromotions` (`cart.ts:231-242`) → `updateCart({promo_codes})` → `POST /store/carts/:id` (Medusa SDK `cart.update`, not the dedicated `/store/carts/:id/promotions` route — see Open Questions) |
| Remove code | `discount-code/index.tsx:25-33` | same `applyPromotions` path, with the code filtered out |

### States & edge cases

- **Dead `useFormState` wiring was a real bug, now fixed** (per `docs/sessions/002-e2e-playwright-headed-against-docker-compose.md`): an unused `submitPromotionForm`/`useFormState` pair previously meant the error message could never render even on a genuinely invalid code; `addPromotionCode` now owns error state directly via local `useState`. Confirmed current code (read in this pass) uses the local-state path, not `useFormState`.
- **Invalid/unknown code**: surfaces as a generic thrown-error message via `ErrorMessage`, sourced from whatever the Medusa API returns for an invalid `promo_codes` entry — exact error string not independently verified in this pass (relies on backend promotions-module behavior).
- **No loading state on the input form itself** beyond the `SubmitButton`'s built-in `useFormStatus()` pending spinner.

---

## 5. Select and authorize payment method

**Components**: `Payment` (`storefront/src/modules/checkout/components/payment/index.tsx`), `PaymentContainer` (`.../payment-container/index.tsx`), `PaymentTest` (`.../payment-test/index.tsx`), `PaymentWrapper`/`StripeWrapper` (`.../payment-wrapper/`), `PaymentButton` (`.../payment-button/index.tsx`, actually fired from the **Review** step, see §6).

### User steps

1. Section opens at `?step=payment`. Available payment providers fetched server-side: `listCartPaymentMethods(cart.region.id)` (`checkout-form/index.tsx:21`, `storefront/src/lib/data/payment.ts:5-15`) → `sdk.store.payment.listPaymentProviders({region_id})`.
2. **Gift-card-only carts skip provider selection entirely**: if `cart.gift_cards?.length > 0 && cart.total === 0` (`paidByGiftcard`, `payment/index.tsx:46-47`), the radio group is hidden and a static "Gift card" label is shown instead — though note `applyGiftCard`/`removeGiftCard` in `cart.ts:244-285` are **commented-out no-ops** in this repo (gift cards have no v2 equivalent here, per the loyalty-plugin research doc), so this branch is presently dead code in practice — `cart.gift_cards` would never be populated. Flagged, not removed, since it's pre-existing in the bundled storefront.
3. Otherwise, providers render as a radio list (`PaymentContainer` per provider, sorted alphabetically by `provider_id`, `payment/index.tsx:152-165`), each row showing an icon/title from the static `paymentInfoMap` (`storefront/src/lib/constants.tsx:9-34`) keyed by Medusa `provider_id` strings (`pp_stripe_stripe`, `pp_stripe-ideal_stripe`, `pp_stripe-bancontact_stripe`, `pp_paypal_paypal`, `pp_system_default`). Unmapped provider IDs fall back to showing the raw `provider_id` string and a generic `CreditCard` icon.
4. If the selected provider is "manual" (`isManual`, prefix `pp_system_default`) **and** `NODE_ENV === "development"`, a `PaymentTest` orange "Attention: For testing purposes only" badge renders next to it (`payment-container/index.tsx:46,54`) — this repo's seeded backend exclusively uses `pp_system_default` (confirmed in `backend/src/scripts/seed.ts:120`), so in practice this is the only payment provider actually configured out of the box; Stripe/PayPal wiring exists in the code but isn't seeded/enabled by default.
5. If Stripe is selected, a `CardElement` (Stripe Elements iframe) appears below the radio list (`payment/index.tsx:167-184`) for entering raw card details — only rendered if `stripeReady` (the `StripeContext`, true only when `PaymentWrapper` detected an active Stripe payment session and successfully constructed `StripeWrapper`/`Elements`).
6. Clicking **"Continue to review"**: `handleSubmit` (`payment/index.tsx:85-110`). If there's no `activeSession` yet (no pending payment session on the cart's payment collection), it calls `initiatePaymentSession(cart, {provider_id})` (`cart.ts:215-229`) → Medusa SDK `payment.initiatePaymentSession`, which creates the provider-specific session (e.g. a Stripe PaymentIntent) and revalidates the cart cache.
7. **Stripe-specific UX wrinkle**: if the selected method is Stripe and there was no prior active session, the button instead becomes a no-op "Enter card details" label after the session is created (`shouldInputCard` branch, `payment/index.tsx:88-104`) — i.e. the **first click only creates the Stripe session and re-renders the card element**; the page does **not** auto-advance to review. The user must click again (now seeing the `CardElement`) to actually proceed — this is implicit in the code (the function returns early without navigating when `shouldInputCard` is true) rather than an explicit two-step UI affordance, which is a subtle, easy-to-miss interaction detail.
8. For non-Stripe providers (manual, PayPal), or Stripe with an already-active session, the same click immediately `router.push`es to `?step=review`.
9. Button is `disabled` if `(isStripe && !cardComplete) || (!selectedPaymentMethod && !paidByGiftcard)` (`payment/index.tsx:213-216`) — Stripe specifically requires `cardComplete` (set by the `CardElement`'s `onChange` callback) before the button is enabled at all, even before a session exists.
10. Collapses to a read-only summary showing the payment method title/icon and (for Stripe) the detected card brand, or "Another step will appear" placeholder text for non-Stripe providers (`payment/index.tsx:225-274`).

### Component map

| Step | Component / file | Server action / API call |
|---|---|---|
| Fetch providers | `checkout-form/index.tsx:21` | `listCartPaymentMethods` (`payment.ts:5-15`) → `sdk.store.payment.listPaymentProviders({region_id})` |
| Wrap children in Stripe/PayPal SDK context | `payment-wrapper/index.tsx` + `stripe-wrapper.tsx` | client-side `loadStripe()` / PayPal script load, gated on `NEXT_PUBLIC_STRIPE_KEY` / `NEXT_PUBLIC_PAYPAL_CLIENT_ID` env vars and an active matching payment session |
| Select provider + create session | `payment/index.tsx:85-110` | `initiatePaymentSession` (`cart.ts:215-229`) → `sdk.store.payment.initiatePaymentSession` |
| Enter card details (Stripe only) | `payment/index.tsx:173-183` (`CardElement`) | none server-side until "Place order" — handled entirely client-side by Stripe.js |
| Advance to review | `payment/index.tsx:97-104` | none — `router.push` once a session exists and (for Stripe) card isn't required first |

### States & edge cases

- **`StripeWrapper` throws synchronously** if `stripeKey`, `stripePromise`, or `paymentSession.data.client_secret` is missing (`stripe-wrapper.tsx:24-40`) — these are unguarded `throw new Error(...)` calls inside a render path with no visible error boundary in the files read, meaning a misconfigured Stripe key (env var unset) would surface as an uncaught render exception rather than a graceful fallback message, *if* a Stripe session is somehow active without a key configured. In practice `loadStripe()` itself already returns `null` when `NEXT_PUBLIC_STRIPE_KEY` is unset, and `payment-wrapper/index.tsx:28-32` checks `stripePromise` truthiness before even mounting `StripeWrapper`, so this throw path is a defensive double-check rather than a commonly hit case — but it's still untrapped if reached.
- **Payment provider list empty**: like shipping, `listCartPaymentMethods` swallows errors to `null` (`payment.ts:12-14`), and `CheckoutForm` blanks the entire form if `paymentMethods` is falsy (`checkout-form/index.tsx:23-25`) — same whole-page failure mode as the no-shipping-options case.
- **Loading state**: `isLoading` drives the submit button's spinner during `initiatePaymentSession`; separately, PayPal has its own `isPending`/`isResolved` states from `usePayPalScriptReducer()` showing a `Spinner` while the PayPal SDK script itself loads (`payment-button/index.tsx:237-260` — though this lives in the Review-step button, see §6).
- **Error on session creation**: caught in `handleSubmit`'s try/catch, surfaced via `ErrorMessage` (`data-testid="payment-method-error-message"`).
- **`paymentReady` flag**: `(activeSession && cart.shipping_methods.length !== 0) || paidByGiftcard` (`payment/index.tsx:49-50`) gates whether the collapsed-state heading shows the checkmark/Edit button — note this checks `cart.shipping_methods.length`, a property access that would throw if `shipping_methods` were ever `undefined` rather than an empty array; not observed to be an actual problem given the cart always carries this array post-fetch, but it's an unguarded access worth knowing about if cart shape ever changes.

---

## 6. Review order summary & place order

**Components**: `Review` (`storefront/src/modules/checkout/components/review/index.tsx`), `PaymentButton` (`.../payment-button/index.tsx`).

### User steps

1. Section opens at `?step=review`. Unlike the other three sections, **Review has no "Edit" affordance of its own** and no read-only collapsed state showing prior data — it's just greyed out (`opacity-50 pointer-events-none`) until `isOpen`, then shows Terms-of-Use/Privacy-Policy acknowledgment copy and the **Place Order** button (`review/index.tsx:21-52`).
2. Gated by `previousStepsCompleted = cart.shipping_address && cart.shipping_methods.length > 0 && (cart.payment_collection || paidByGiftcard)` (`review/index.tsx:16-19`) — if false, nothing renders inside the open section (not even an error — just blank).
3. `PaymentButton` (`payment-button/index.tsx`) dispatches to one of three sub-components purely by inspecting `cart.payment_collection.payment_sessions[0].provider_id` (`payment-button/index.tsx:38-64`): `StripePaymentButton`, `ManualTestPaymentButton`, `PayPalPaymentButton`. Falls back to a permanently-`disabled` "Select a payment method" button if the provider matches none of the three (`payment-button/index.tsx:61-63`).
4. A separate `notReady` flag (`!cart.shipping_address || !cart.billing_address || !cart.email || cart.shipping_methods.length < 1`, `payment-button/index.tsx:23-28`) independently disables the actual payment-specific buttons — i.e. there are **two independent readiness gates** (`Review`'s `previousStepsCompleted` and `PaymentButton`'s `notReady`) computed slightly differently (the latter additionally requires `billing_address` and `email` explicitly) — redundant but not contradictory based on the flows above, since address submission always sets both.
5. **Manual provider** (`ManualTestPaymentButton`, `payment-button/index.tsx:262-299`): clicking "Place order" directly calls `placeOrder()` (`cart.ts:352-374`) with no further user interaction — this is effectively a one-click "fake" payment confirmation, appropriate for the `pp_system_default` test provider this repo actually seeds.
6. **Stripe provider** (`StripePaymentButton`, `payment-button/index.tsx:85-190`): clicking calls `stripe.confirmCardPayment(session.data.client_secret, {payment_method: {card, billing_details: {...from cart.billing_address...}}})` client-side via Stripe.js. On success (`paymentIntent.status` is `requires_capture` or `succeeded`) or on an error whose attached `payment_intent.status` is already `requires_capture`/`succeeded` (treated as "completed enough", `payment-button/index.tsx:151-156`), it calls `placeOrder()`. Otherwise the Stripe error message is shown via `ErrorMessage` (`data-testid="stripe-payment-error-message"`) and **`placeOrder()` is never called** — the cart is left as-is for retry.
7. **PayPal provider** (`PayPalPaymentButton`, `payment-button/index.tsx:192-260`): uses `PayPalButtons` with `createOrder` returning the existing session's PayPal order id and `onApprove` calling `actions.order.authorize()`; only on `authorization.status === "COMPLETED"` does it call `placeOrder()`; any other status or a thrown error sets a generic error message instead.
8. `placeOrder()` (`cart.ts:352-374`): calls `sdk.store.cart.complete(cartId)` (Medusa's cart-completion workflow). If the response `type === "order"`, removes the cart-id cookie and **server-redirects** to `/${country_code}/order/confirmed/${order.id}` (country code derived from the **order's** `shipping_address.country_code`, lowercased). If the response is **not** an order (i.e. `type === "cart"`, meaning completion failed server-side — e.g. inventory/payment validation failure inside the Medusa workflow), the function just `return`s the cart — the catch is structural: a failed completion silently falls through to returning the cart object rather than throwing, so the calling button's `.catch()` handlers (which set `errorMessage` state) **would not fire** in that branch, since no exception was thrown. This is a real, code-confirmed gap: a `type: "cart"` failure response from `complete()` produces no visible UI error at all in any of the three payment-button variants — they only render an error when `placeOrder()` **throws** (e.g. network/HTTP error via `medusaError`), not when it resolves "successfully" but didn't actually place an order.

### Component map

| Step | Component / file | Server action / API call |
|---|---|---|
| Render review gate + ToS copy | `review/index.tsx` | none |
| Dispatch to provider-specific button | `payment-button/index.tsx:18-64` | none — pure routing on `provider_id` string prefix (`isStripe`/`isManual`/`isPaypal` in `lib/constants.tsx:37-45`) |
| Manual "pay" | `payment-button/index.tsx:262-299` | `placeOrder()` directly |
| Stripe "pay" | `payment-button/index.tsx:85-190` | `stripe.confirmCardPayment()` (Stripe.js, client-only) → on success, `placeOrder()` |
| PayPal "pay" | `payment-button/index.tsx:192-260` | `actions.order.authorize()` (PayPal SDK) → on `COMPLETED`, `placeOrder()` |
| Complete cart → order | `cart.ts:352-374` | `sdk.store.cart.complete(cartId)` → Medusa `POST /store/carts/:id/complete`; on order success: `removeCartId()` + `redirect()` |

### States & edge cases

- **Payment declined (Stripe)**: handled — error message shown inline, no order placed, user can retry (re-click triggers a fresh `confirmCardPayment` call against the same client secret). No explicit "retry" UI distinct from just clicking the button again.
- **Payment declined (PayPal)**: any non-`COMPLETED` authorization status or thrown error shows a generic message (`"An error occurred, status: ..."` or `"An unknown error occurred, please try again."`) — less specific than Stripe's pass-through of the actual decline reason.
- **Cart/session expired or invalid mid-checkout**: not explicitly handled in any of the three buttons beyond whatever `medusaError` (`storefront/src/lib/util/medusa-error.ts`, not read in this pass) normalizes a failed HTTP call into — surfaces as a generic thrown error caught by each button's `.catch()`.
- **Out-of-stock item at checkout time**: not handled in any storefront code read in this pass — this would have to be enforced (or not) by the Medusa backend's cart-completion workflow; no client-side stock re-check exists before "Place order" is clickable.
- **Silent non-order completion** (see step 8 above) is the single most notable edge case found in this whole flow — flagged again here for visibility.
- **Double-submit protection**: each button tracks its own `submitting`/`isLoading` boolean and disables/spins during the async call, but this is purely local component state — a second rapid click before state updates, or a second tab, isn't guarded against beyond normal React batching.

---

## 7. Order confirmation page

**Components**: `OrderCompletedTemplate` (`storefront/src/modules/order/templates/order-completed-template.tsx`) composing `OrderDetails`, `Items` (`storefront/src/modules/order/components/items/index.tsx`, listing only, not read in full this pass), `ShippingDetails`, `PaymentDetails`, `Help`, plus `CartTotals` (shared with cart/checkout summary) and an optional `OnboardingCta`.

### User steps

1. Arrives via the server redirect from `placeOrder()` (§6) at `/${countryCode}/order/confirmed/${order.id}`. While the RSC tree resolves, `loading.tsx` renders `SkeletonOrderConfirmed` (`storefront/src/app/[countryCode]/(main)/order/confirmed/[id]/loading.tsx`).
2. Page fetches the order via `retrieveOrder(id)` (`storefront/src/lib/data/orders.ts:8-17`, React `cache()`-wrapped, requests `fields: "*payment_collections.payments"` explicitly) and enriches line items the same way the checkout page does (`enrichLineItems`, shared with `cart.ts`). 404s (`notFound()`) if the order doesn't resolve — e.g. wrong id, or an order belonging to another customer's auth session (auth header is forwarded via `getAuthHeaders()`, but exact authorization behavior on mismatch wasn't independently verified against the backend).
3. If a `_medusa_onboarding` cookie is `"true"`, an `OnboardingCta` banner renders above everything (`order-completed-template.tsx:20,25`) — a dev/setup-flow affordance unrelated to normal checkout, not detailed further here.
4. Displays: "Thank you!" heading, `OrderDetails` (confirmation email line, order date, order number/`display_id`; an `order status`/`payment status` block exists in the JSX but is **commented out** — `order-details/index.tsx:44-58` — so no live status text actually renders even though `data-testid="order-status"` markup is present), line items (`Items`), `CartTotals` totals block, `ShippingDetails` (address/contact/method recap, near-identical markup to the checkout step's own summary), `PaymentDetails` (method + masked card last4 for Stripe, or a generic "amount paid at {timestamp}" line for other providers — `payment-details/index.tsx:42-51`), and a static `Help` block (Contact / Returns & Exchanges links).

### Component map

| Step | Component / file | Server action / API call |
|---|---|---|
| Fetch order | `app/.../order/confirmed/[id]/page.tsx:13-26` | `retrieveOrder` (`orders.ts:8-17`) → `sdk.store.order.retrieve(id, {fields: "*payment_collections.payments"})` |
| Render summary | `order-completed-template.tsx` | none — pure presentation of the fetched order |
| Loading skeleton | `loading.tsx` → `SkeletonOrderConfirmed` | none |

### States & edge cases

- **Order not found / unauthorized**: hard 404 via `notFound()` (`page.tsx:16-18,35-37`) — no distinct "you don't have access to this order" messaging, just the generic Next.js not-found page.
- **Payment details rendering assumes `payment_collections[0]` and `payments[0]` exist** (`payment-details/index.tsx:13`, `order.payment_collections?.[0].payments?.[0]` — note the **non-optional** `.[0]` chain after the first optional one) — if `payment_collections` exists but is an empty array, this is a runtime error (`Cannot read properties of undefined`), not a guarded empty state. Same pattern in `paymentInfoMap[payment.provider_id].title` (`payment-details/index.tsx:31`) — an unmapped `provider_id` here would throw (`.title` on `undefined`), unlike the checkout-page `Payment` component which defensively does `paymentInfoMap[...]?.title || selectedPaymentMethod` (`payment/index.tsx:236`). This is an inconsistency between the two components worth fixing if a new payment provider is ever added without updating `paymentInfoMap`.
- **Order status / payment status text is dead code** (commented out, see step 4) — the `data-testid` hooks exist but resolve to empty `<span>`s, so any e2e assertion against `order-status` text content would presently fail.

---

## 8. Guest checkout vs. logged-in checkout

No distinct route or component variant — both paths run through the exact same `Addresses`/`Shipping`/`Payment`/`Review` components. Differences observed by reading the code:

- **Saved-address picker** (§1, step 2) only appears for logged-in customers with addresses in the cart's region (`shipping-address/index.tsx:86`).
- **Email pre-fill**: if the cart has no email yet but the logged-in customer does, the shipping form's email field is pre-filled from `customer.email` (`shipping-address/index.tsx:68-69`) — guests simply see an empty email field.
- **Auth headers**: every server action in `cart.ts` forwards `getAuthHeaders()` (`storefront/src/lib/data/cookies.ts:4-13`, reads a `_medusa_jwt` cookie) to the Medusa SDK calls. For a guest, this resolves to `{}` (no `Authorization` header) — the cart itself is still tracked via the separate `_medusa_cart_id` cookie (`cookies.ts:32-35`), so guest checkout works purely on cart-id continuity, no customer record required at any point in this flow. Account creation/login is not part of the checkout journey itself — not investigated further here as out of scope.

---

## 9. Returning to edit a previous step

Already covered inline per-section above; consolidated here since the task explicitly calls it out as its own flow.

### User steps

1. Each completed (collapsed) section shows an **"Edit"** button (`data-testid`s: `edit-address-button`, `edit-delivery-button`, `edit-payment-button`) that does a **client-side** `router.push(pathname + "?step=<name>")` — no server round-trip, no data refetch beyond what Next.js's router cache already has.
2. Re-opening a step shows the form **pre-filled from the cart's current persisted state** (e.g. `ShippingAddress`'s `useEffect` re-derives `formData` from `cart.shipping_address` whenever `cart` changes, `shipping-address/index.tsx:62-71`) — not from any client-side draft/undo buffer. Editing and not submitting, then navigating away, loses the in-progress edits (confirmed by the e2e spec `storefront/e2e/tests/public/checkout.spec.ts`, "Editing checkout steps works as expected" test, lines 94-212, which always re-submits after editing rather than testing an abandon-edit path).
3. Per the e2e spec "Entering checkout, leaving, then returning takes you back to the correct checkout spot" (`checkout.spec.ts:402-508`): navigating away entirely (back to `/cart`) and returning via the cart's checkout button re-lands on the checkout page with the **last-submitted step's continuation button visible** (e.g. after submitting address + delivery + initiating payment, returning shows the payment submit button, not a reset back to address) — i.e. step progress is derived purely from cart state (`shipping_address`/`shipping_methods`/`payment_collection` presence), not from the `?step=` URL param surviving navigation; the URL param resets but the *effective* step is recomputed from cart data each time `CheckoutForm`/each section re-renders.
4. Clicking Edit on the address step **after** later steps were completed, then navigating away and back, was explicitly tested (`checkout.spec.ts:493-507`) to confirm it still lands back on the payment step (not stuck mid-edit) — confirming point 3's "derived from cart state, not URL" model, since the in-progress unsaved address edit doesn't persist across navigation either.

### Component map

| Step | Component / file | Notes |
|---|---|---|
| Edit shipping/billing | `addresses/index.tsx:38-40` | `router.push(pathname + "?step=address")` |
| Edit delivery | `shipping/index.tsx:39-41` | `router.push(pathname + "?step=delivery", {scroll:false})` |
| Edit payment | `payment/index.tsx:79-83` | `router.push(pathname + "?" + createQueryString("step","payment"), {scroll:false})` |
| Review | none | no edit affordance on Review itself (§6) |

### States & edge cases

- No section actually **validates** that re-opening for edit is allowed beyond visibility gating on the Edit button itself (e.g. `Shipping`'s edit button only renders if address+billing+email are present, `shipping/index.tsx:80-83`) — but the `?step=` URL param can still be set manually regardless, and each section's `isOpen` check has no server-side enforcement.
- Editing the address and resubmitting does **not** automatically invalidate/reset a later step's data (e.g. an already-selected shipping method, or an already-initiated payment session) — there's no observed cascade-invalidation logic (e.g. changing country to one with a different region/tax could leave a stale payment session or shipping method selected). Not exercised by the e2e suite either. Flagged as untested behavior, not confirmed broken.

---

## Open questions / not fully verified

- **`discount-code`'s checkout-page call path**: `applyPromotions` (`cart.ts:231-242`) goes through the generic `updateCart({promo_codes: codes})` → `sdk.store.cart.update(...)`, **not** the dedicated `POST/DELETE /store/carts/:id/promotions` route documented in `003-promotions-module-discount-specs.md` §5. Whether Medusa's `update` cart endpoint internally delegates to the same `updateCartPromotionsWorkflow`, or whether this is a different/older code path with different semantics (e.g. does it support `action: add/remove/replace` the same way?), was **not verified** — this matters because §5 of the promotions doc explicitly says the storefront "must call" the dedicated route, but this storefront's actual code does not use it for the checkout/cart promo UI.
- **Shipping method re-selection**: confirmed via an explicit `// To do` code comment (`shipping/index.tsx:35`) that switching shipping options doesn't clean up the previous selection client-side, but whether Medusa's backend `addShippingMethod` replaces vs. appends server-side wasn't traced into backend code in this pass.
- **Exact Stripe integration details**: which Stripe payment methods beyond raw card (`pp_stripe_stripe`) are actually exercised — `pp_stripe-ideal_stripe`/`pp_stripe-bancontact_stripe` have `paymentInfoMap` entries and `isStripe()` would match them (prefix `pp_stripe_`... actually note `isStripe()` in `lib/constants.tsx:37-39` only matches `pp_stripe_` prefix exactly, which would **not** match `pp_stripe-ideal_stripe` or `pp_stripe-bancontact_stripe` since those use a hyphen before `stripe` — meaning iDEAL/Bancontact would fall through to the `CardElement`-less default path in `Payment` and to the `default: <Button disabled>` case in `PaymentButton`. This looks like a real, code-confirmed gap between the providers listed in `paymentInfoMap` and the providers `isStripe()`/`PaymentButton` actually know how to drive — not exercised in this repo since only `pp_system_default` is seeded, so never hit in practice here, but worth flagging explicitly.
- **Whether server or client components handle each step**: `CheckoutForm` and the `checkout/page.tsx` itself are server components (no `"use client"`), but every step section (`Addresses`, `Shipping`, `Payment`, `Review`, `DiscountCode`) is `"use client"`. The split is consistent with Next.js App Router conventions but wasn't independently cross-checked against every file's top-of-file directive beyond what was read directly.
- **Retry behavior on payment failure**: confirmed no automatic retry exists anywhere (user must re-click); whether Stripe's `client_secret`/PaymentIntent remains valid for a meaningful retry window after a decline, or whether `initiatePaymentSession` needs to be re-called, was not tested against a live Stripe sandbox in this pass.
- **The `type: "cart"` (non-order) response from `placeOrder()`'s `sdk.store.cart.complete()` call** (§6, step 8) is flagged as a likely real UX gap (no error shown to the user) based on reading the code's control flow, but was **not reproduced live** (e.g. by forcing an inventory conflict at checkout time) — confirm with an actual failing-completion scenario before treating this as a confirmed bug rather than a code-path inference.
- **Out-of-stock-at-checkout handling**: no storefront-side re-check exists; behavior entirely depends on the Medusa backend's cart-completion workflow, which was not read in this pass (out of the stated scope of storefront-only files).
- **`backend/src/scripts/seed.ts` seeds "Standard Shipping"/"Express Shipping" with `manual_manual` fulfillment + `pp_system_default` payment** (confirmed, `backend/src/scripts/seed.ts:120,247-299`) — the bundled e2e spec (`checkout.spec.ts`) references a shipping option named `"FakeEx Standard"` that does not match this repo's actual seed data, consistent with the known upstream-starter-vs-this-boilerplate seed mismatch already documented in `docs/sessions/002-e2e-playwright-headed-against-docker-compose.md`. This means `checkout.spec.ts` likely fails the same way `discount.spec.ts` partially did, for the same root cause (region/seed-data mismatch) — not independently re-run in this pass to confirm pass/fail counts.
