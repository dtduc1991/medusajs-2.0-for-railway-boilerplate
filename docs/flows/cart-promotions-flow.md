# Frontend flow: Cart & Promotions

## Context

This doc covers the storefront (Next.js App Router, Medusa v2 JS SDK) user-facing flows for viewing and mutating the cart, and applying/removing promotion codes. It is a sibling to the backend research docs [`003-promotions-module-discount-specs.md`](../sessions/003-promotions-module-discount-specs.md) (Medusa v2 Promotions module internals) and [`004-loyalty-plugin-gift-card-testcases.md`](../sessions/004-loyalty-plugin-gift-card-testcases.md) (gift card / store credit plugin — confirmed **not installed** in this repo). Where this doc says "promotion" it means a Medusa v2 `Promotion` entity applied via a customer-entered `code` (see doc 003 §1, §5) — there is no separate gift-card concept implemented anywhere in this storefront's code, only in its UI labels (see §10).

All paths below are relative to `storefront/src/`.

## Overview

Cart UI exists in two places that render the **same underlying data** independently (each does its own `retrieveCart()` server fetch — there's no shared client cache):

1. **Mini-cart / cart dropdown** — `modules/layout/components/cart-dropdown/index.tsx`, rendered via `modules/layout/components/cart-button/index.tsx` inside the global nav (`modules/layout/templates/nav/index.tsx:6,56-57`). A `Popover` anchored to the "Cart (N)" link in the header, present on every page in the `(main)` route group. Auto-opens for 5s whenever the total item count changes while the user is *not* already on `/cart` (`cart-dropdown/index.tsx:64-70`).
2. **Full cart page** — route `storefront/src/app/[countryCode]/(main)/cart/page.tsx`, URL `/[countryCode]/cart`. Server component that fetches the cart (`retrieveCart()` + `enrichLineItems()`), and renders `modules/cart/templates/index.tsx` (`CartTemplate`), which lays out line items (`ItemsTemplate`) on the left and an order summary (`Summary`, including the promo-code widget) on the right, or `EmptyCartMessage` if there are no items.

A third surface, the **checkout order summary** (`modules/checkout/templates/checkout-summary/index.tsx`), reuses the exact same `DiscountCode` component as the cart page (`checkout-summary/index.tsx:4,23`) — so promo-code entry/removal is available both on `/cart` and on `/checkout`, not just one or the other. There is no cart UI shown anywhere else (no separate `/checkout` "review cart" step distinct from this summary panel).

All cart mutations are Next.js Server Actions defined in `storefront/src/lib/data/cart.ts`, which wrap the Medusa JS SDK (`sdk.store.cart.*`) and call `revalidateTag("cart")` on success so both the dropdown and full page re-fetch fresh data on next render. The cart's identity persists via an httpOnly cookie (`_medusa_cart_id`, 7-day `maxAge`, set/read in `storefront/src/lib/data/cookies.ts:18,32,37-40`) — there is no client-side cart store; every read is a server round-trip.

---

## 1. Add item to cart

Out of scope for this doc — covered in detail by the sibling PDP (product detail page) flow doc. Entry point for cross-reference: `modules/products/components/product-actions/index.tsx:14,102`, which calls `addToCart({ variantId, quantity, countryCode })` (`lib/data/cart.ts:71-103`). That action calls `getOrSetCart()` (creates a cart via `sdk.store.cart.create` if none exists yet, tied to the region resolved from `countryCode`) then `sdk.store.cart.createLineItem`. Successful add-to-cart is what triggers the cart-dropdown's auto-open behavior described above, since it changes `totalItems`.

---

## 2. View cart contents

### User steps
1. User navigates to `/[countryCode]/cart` directly, or clicks the "Cart (N)" nav link, or clicks "Go to cart" inside the mini-cart dropdown.
2. If the cart has items: page shows, for each line item — thumbnail, product title, variant options, a quantity selector, unit price, and line total; a "Summary" panel with subtotal/discount/shipping/tax/gift-card/total breakdown, the promo-code widget, and a "Go to checkout" button.
3. If the user is **not** signed in, a `SignInPrompt` banner ("Already have an account? Sign in for a better experience") renders above the line items.
4. If the cart has zero items (or doesn't exist / cookie missing), `EmptyCartMessage` renders instead (see §9).
5. While the server component is fetching, `loading.tsx` renders `SkeletonCartPage`.
6. If the cart ID cookie points at a cart the backend can't find (e.g. stale/expired), the route's `not-found.tsx` renders: "The cart you tried to access does not exist. Clear your cookies and try again," with a link home. (`retrieveCart()` swallows the fetch error and returns `null`, so this depends on a Next.js `notFound()` call somewhere upstream — not present in `cart/page.tsx` itself, which instead passes `cart={null}` into `CartTemplate`, rendering the **empty-cart** message, not the not-found page. See Open Questions.)

### Component map
| Step | Component / file | Server action / API call |
|---|---|---|
| Route entry | `app/[countryCode]/(main)/cart/page.tsx:13-26,28-33` | `retrieveCart()` (`lib/data/cart.ts:13-26`, `sdk.store.cart.retrieve`), then `enrichLineItems()` (`lib/data/cart.ts:148-193`) to hydrate `item.variant.product` for thumbnails/links, plus `getCustomer()` |
| Layout | `modules/cart/templates/index.tsx` (`CartTemplate`) | — pure render, branches on `cart?.items?.length` |
| Line items table | `modules/cart/templates/items.tsx` (`ItemsTemplate`) → `modules/cart/components/item/index.tsx` (`Item`, `type="full"`) | — |
| Sign-in nudge | `modules/cart/components/sign-in-prompt/index.tsx` | — static, shown when `!customer` (`templates/index.tsx:21-26`) |
| Order summary | `modules/cart/templates/summary.tsx` (`Summary`) → `modules/common/components/cart-totals/index.tsx` (`CartTotals`) | — pure render of `cart.subtotal/discount_total/shipping_total/tax_total/gift_card_total/total` |
| Mini-cart | `modules/layout/components/cart-button/index.tsx` → `modules/layout/components/cart-dropdown/index.tsx` (`CartDropdown`) | same `retrieveCart()` + `enrichLineItems()`, independent fetch from the cart page |
| Loading state | `app/[countryCode]/(main)/cart/loading.tsx` → `modules/skeletons/templates/skeleton-cart-page` | — |
| Not-found state | `app/[countryCode]/(main)/cart/not-found.tsx` | — |

### States & edge cases
- `cart-totals/index.tsx:42,67` only renders the "Discount" and "Gift card" rows when `discount_total`/`gift_card_total` are truthy — so a cart with no promotions applied shows neither row at all (not a "$0.00" row).
- `gift_card_total` is wired into the **display** (`CartTotals`, `cart-totals/index.tsx:15,28,67-79`, `data-testid="cart-gift-card-amount"`) even though there's no UI anywhere in this codebase that can cause that field to be non-zero (see §10) — it would only ever populate if something external (admin-applied gift card on the order, or a future plugin) sets it.
- `ItemsTemplate`/`ItemsPreviewTemplate`/`CartDropdown` all independently sort items by `created_at` descending (newest first) — three separate inline `.sort()` calls with identical logic (`templates/items.tsx:35-37`, `templates/preview.tsx:28-30`, `cart-dropdown/index.tsx:108-112`), not a shared utility.
- Mini-cart dropdown is hidden below the `small` breakpoint (`hidden small:block`, `cart-dropdown/index.tsx:98`) — on mobile, the nav cart link just navigates to `/cart` with no hover-preview.
- No explicit out-of-stock-in-cart handling was found anywhere in the cart UI — line items render unconditionally regardless of current stock; the quantity selector independently caps at a hardcoded `10` (see §4) rather than reflecting real inventory.

---

## 3. Update line item quantity

### User steps
1. On the full cart page only (not the mini-cart, not the checkout summary preview), user changes the quantity `<select>` next to a line item.
2. A spinner appears next to the selector while the update is in flight.
3. On success, the table re-renders with the new quantity/line total (via `revalidateTag("cart")`).
4. On failure, an inline error message renders below the row; the quantity selector itself doesn't revert visibly (no optimistic UI / rollback shown).

### Component map
| Step | Component / file | Server action |
|---|---|---|
| Quantity `<select>` | `modules/cart/components/cart-item-select/index.tsx` (`CartItemSelect`), used from `modules/cart/components/item/index.tsx:81-102` | — controlled native `<select>` wrapper |
| Change handler | `modules/cart/components/item/index.tsx:29-43` (`changeQuantity`) | `updateLineItem({ lineId, quantity })` (`lib/data/cart.ts:105-127`, `sdk.store.cart.updateLineItem`) |
| Loading/error UI | `item/index.tsx:24-25,103,105` (`updating` state → `Spinner`; `error` state → `ErrorMessage`) | — |

### States & edge cases
- Quantity options are `1..min(maxQuantity, 10)` where `maxQuantity` is **hardcoded to `10`** regardless of actual inventory (`item/index.tsx:45-47`: `// TODO: Update this to grab the actual max inventory`). Both branches of the `manage_inventory` ternary currently evaluate to the same `maxQtyFromInventory = 10` constant — i.e. the ternary is dead code, real inventory limits are not enforced client-side at all.
- There's also a stray duplicate `<option value={1} key={1}>1</option>` appended after the generated range (`item/index.tsx:99-101`), so "1" can appear twice in the dropdown when `maxQuantity >= 1` (which it always is) — harmless visually (native `<select>` just shows it twice) but is dead/leftover code.
- Errors surface via `medusaError()` (`lib/util/medusa-error.ts`) which capitalizes and appends a period to whatever message string the backend returned — e.g. a stock-exceeded rejection from the backend would still display, just not specially formatted/distinguished from any other error.
- This control is **not present** in the mini-cart dropdown or the checkout-summary item preview (`ItemsPreviewTemplate` renders `Item` with `type="preview"`, which omits the quantity-select `Table.Cell` entirely — `item/index.tsx:77-107` is gated on `type === "full"`). Quantity can only be changed from the full `/cart` page.

---

## 4. Remove line item

### User steps
1. On the full cart page, user clicks the trash-can `DeleteButton` next to a line item; on the mini-cart dropdown, same control with the label "Remove".
2. Button shows a spinner while deleting.
3. On success, the item disappears from the cart (both the page and dropdown will reflect this since both re-fetch from `revalidateTag("cart")`).
4. On failure, the action just stops the spinner (`.catch((err) => setIsDeleting(false))`, `delete-button/index.tsx:19-21`) — **no error message is surfaced to the user at all** for a failed line-item delete.

### Component map
| Step | Component / file | Server action |
|---|---|---|
| Delete button (cart page) | `modules/common/components/delete-button/index.tsx`, used from `modules/cart/components/item/index.tsx:80` | `deleteLineItem(id)` (`lib/data/cart.ts:129-146`, `sdk.store.cart.deleteLineItem`) |
| Delete button (mini-cart) | same `DeleteButton` component, used from `modules/layout/components/cart-dropdown/index.tsx:158-164` | same |

### States & edge cases
- `deleteLineItem` calls `revalidateTag("cart")` **twice** — once inside the `.then()` callback (`cart.ts:141-143`) and once unconditionally after the `await` (`cart.ts:145`), including after a caught error (the `.catch(medusaError)` re-throws, so the line at 145 only runs on success in practice since `medusaError` throws — but it's redundant/confusing as written).
- No confirmation dialog before delete — single click removes the item immediately.
- As noted in §3, a failed delete is silently swallowed in the UI (spinner just stops); only a `console.error` from `medusaError` would appear in server logs, not visible to the end user.

---

## 5. Apply a discount/promo code

### User steps
1. From the cart page (`Summary`) or the checkout page (`CheckoutSummary`), user clicks "Add Promotion Code(s)" to reveal a text input + "Apply" button (`isOpen` toggle, `discount-code/index.tsx:21,62-100`).
2. User types a code and clicks "Apply" (or submits the form).
3. On success: input clears, the "Promotion(s) applied" list re-renders showing the new code as a `Badge` plus its computed value (percentage or formatted currency amount), and cart totals (`discount_total`) update.
4. On failure (invalid/unknown code, etc.): an inline `ErrorMessage` renders below the input with the raw error text from the backend; the input is **not** cleared.

### Component map
| Step | Component / file | Server action / API call |
|---|---|---|
| Toggle + form | `modules/checkout/components/discount-code/index.tsx:57-101` (`DiscountCode`) | — |
| Submit handler | `discount-code/index.tsx:35-55` (`addPromotionCode`) | `applyPromotions(codes)` (`lib/data/cart.ts:231-242`) → `updateCart({ promo_codes: codes })` (`cart.ts:56-69`, `sdk.store.cart.update`) |
| Applied-codes list | `discount-code/index.tsx:103-176` | renders `cart.promotions[]` (`HttpTypes.StorePromotion`), badge color green if `promotion.is_automatic`, grey otherwise |
| Rendered from (cart page) | `modules/cart/templates/summary.tsx:7,35` | — |
| Rendered from (checkout page) | `modules/checkout/templates/checkout-summary/index.tsx:4,23` | — |

### States & edge cases — and a likely-load-bearing bug
- **The apply call sends the full code list, not an incremental add.** `addPromotionCode` (`discount-code/index.tsx:35-55`) builds `codes` by filtering `promotions` to `p.code === undefined` (`line 42`) — i.e. it keeps only *already-applied promotions that have no code* — then pushes the newly typed code. Given that every code-based promotion necessarily has a `code` (it's how the customer found it), this filter typically evaluates to **empty**, meaning each "Apply" submission effectively replaces the cart's promo list with just the one code just typed, silently dropping any previously-applied code-based promotions. (Automatic, no-code promotions wouldn't be in `promotions` filtered to "has no code" either, since `is_automatic` promotions still carry a `code` field per the `Promotion` model in doc 003 §1 — the `code === undefined` condition appears to never realistically match anything meaningful.) This file is flagged in the task context as a recent, uncommitted, in-progress edit — treat this as a likely active bug, not settled behavior.
- **Backend call uses the legacy combined-update endpoint, not the dedicated promotions endpoint.** `applyPromotions()` (`cart.ts:231-242`) calls `updateCart({ promo_codes: codes })`, which is `sdk.store.cart.update(cartId, data)` — a generic `POST /store/carts/:id` cart-update call with a `promo_codes` field, **not** the dedicated `POST /store/carts/:id/promotions` route documented in doc 003 §5 (which Medusa v2's `updateCartPromotionsWorkflow` and its `add`/`remove`/`replace` semantics are built around). Whether the generic cart-update endpoint internally delegates to the same workflow, or implements separate/older `promo_codes` handling, was **not verified in this pass** — worth confirming directly against the installed `@medusajs/medusa` route before relying on `replace`-vs-`add` semantics matching doc 003's description.
- Error message is whatever string the backend returns via `medusaError()` — capitalized, period-appended, no client-side validation (empty/whitespace codes are blocked only by the `if (!code) return` guard at `discount-code/index.tsx:37-39`, which still allows whitespace-only strings since `FormData.get` returns a truthy non-empty string for `" "`).
- No loading/disabled state on the Apply button while the request is in flight (`SubmitButton` — not inspected in this pass, but `addPromotionCode` doesn't set any local `isSubmitting` state, unlike `Item`'s `updating` state for quantity changes) — a user could plausibly double-submit.
- Currency-mismatch and already-applied-code rejections are handled entirely server-side per doc 003 §3 (`computeActions`) — the storefront has no special-cased UI for these, they'd surface as generic `message` strings through the same `ErrorMessage` path.
- A dead/unused helper, `submitPromotionForm` (`cart.ts:287-297`), exists as a `useFormState`-style action (`currentState, formData` signature) that calls `applyPromotions([code])` for a *single* code — it is **not imported or referenced anywhere** in `storefront/src` outside its own definition file (confirmed via repo-wide grep). The component actually in use (`DiscountCode`) does not use it.

---

## 6. Remove a discount/promo code

### User steps
1. Next to each non-automatic applied promotion in the "Promotion(s) applied" list, user clicks the trash icon (`remove-discount-button`).
2. Automatic promotions (`promotion.is_automatic === true`) have **no remove button at all** (`discount-code/index.tsx:153-170`, gated on `!promotion.is_automatic`) — they cannot be removed from this UI by design, matching backend semantics where automatic promotions aren't customer-controlled (doc 003 §4).
3. On click, the code is removed from the applied list and totals update.

### Component map
| Step | Component / file | Server action |
|---|---|---|
| Remove button | `discount-code/index.tsx:153-170` | `removePromotionCode(code)` (`discount-code/index.tsx:25-33`) |
| Resulting call | same | `applyPromotions(codes)` (`cart.ts:231-242`) with a filtered code list |

### States & edge cases — same bug family as §5
- `removePromotionCode` (`discount-code/index.tsx:25-33`) computes `validPromotions` as `promotions.filter(p => p.code !== code)` (correctly excludes the one being removed) but then **re-filters to `p.code === undefined`** before mapping to codes (`line 31`) — the same suspicious filter as the apply path. In practice this means the call to `applyPromotions(...)` is sent with an **empty array** in the overwhelmingly common case (all real promotions have defined codes), which — given `applyPromotions` → `updateCart({ promo_codes: [] })` — would actually happen to produce the *desired end state* (remove the one code) only by coincidence if the backend's `promo_codes` handling treats an empty array as "clear all" rather than "no-op" (consistent with the `PromotionActions.REPLACE` semantics in doc 003 §5 for an empty array posted to the dedicated promotions endpoint — **but this code path doesn't hit that endpoint**, it hits generic cart-update, so that inference doesn't necessarily transfer). Net effect: removing **any single** non-automatic promotion likely clears **all** non-automatic promotions from the cart, not just the targeted one — this needs verification against a running backend, flagged here as inferred-not-confirmed.
- No confirmation prompt, no per-row loading state during removal (no disabled/spinner shown on the trash button while the request is in flight).
- No error handling at all on the remove path — `removePromotionCode` doesn't `try/catch` or surface `e.message` anywhere (compare to `addPromotionCode`'s `catch` block at `discount-code/index.tsx:52-54`); a failed removal request would throw an unhandled promise rejection in the browser console with no user-visible feedback.

---

## 7. Apply a gift card

**No such UI flow exists in this storefront.** See §10 for the full gap analysis. Summary: `applyGiftCard()` and `removeGiftCard()` are defined in `lib/data/cart.ts:244-285` but their entire bodies are commented out (no-ops that return `undefined`), and neither function is imported or called from any component in `storefront/src`. There is no gift-card input field, no gift-card badge/row component, and no `data-testid` markup for gift cards anywhere in `storefront/src` (only in the e2e fixtures, which target a UI that was never built — see §10).

---

## 8. Cart persistence across sessions / guest -> login

### User steps
1. Guest adds items; cart is tracked purely via the `_medusa_cart_id` cookie (no `customer_id` on the cart yet).
2. Guest navigates away, closes the tab, returns later (within 7 days) — cart and any applied promotions are still present, since the cookie (and the server-side cart it points to) persisted.
3. If the guest's cookies are cleared, `/cart` falls through to `EmptyCartMessage` (no cart ID → `retrieveCart()` returns `null` → `cart?.items?.length` is falsy) rather than any explicit "cart not found" messaging on the page itself (contrast with `not-found.tsx`, which is a different, narrower failure mode — see §2 edge cases and Open Questions).
4. If the guest then signs in (`SignInPrompt` → `/account`), this doc did not trace the account/login module to confirm whether the existing guest cart gets associated with the now-authenticated customer, or whether sign-in is fully independent of cart state. **Not verified in this pass** (out of stated scope — the account/auth module wasn't part of this research's file list).

### Component map
| Step | Component / file | Mechanism |
|---|---|---|
| Cart ID cookie | `lib/data/cookies.ts:32,37-40` (`getCartId`/`setCartId`) | httpOnly cookie `_medusa_cart_id`, `maxAge: 60*60*24*7` (7 days) |
| Cart creation | `lib/data/cart.ts:28-54` (`getOrSetCart`) | called from `addToCart`; creates a cart scoped to the region resolved from the URL's `countryCode` if none exists |
| Region-change reconciliation | `cart.ts:43-51` | if an existing cart's `region_id` doesn't match the current country's region, the cart is silently updated to the new region (no user-facing prompt) |

### States & edge cases
- A guest cart's promotions persist exactly as long as the cart itself does (the 7-day cookie) — there is no separate expiry logic for promotions; this matches the e2e gift-card spec's (skipped) test intent "Adding a giftcard and then accessing the cart at a later point keeps the giftcard amount" (`giftcard.spec.ts:371-428`), which — if gift cards existed — would exercise this same cookie-persistence path, just with a feature that isn't implemented (§10).
- Switching `countryCode` in the URL (e.g. via the country selector) can silently re-point the existing cart at a new region (`cart.ts:43-51`) — whether this invalidates currency-pinned promotions (doc 003 §3: `application_method.currency_code` must match `applicationContext.currency_code`) was not traced; plausible edge case where a promo silently stops applying after a region switch, surfaced only the next time `computeActions` re-runs (i.e. next cart mutation), not proactively.
- No explicit handling found for an item that goes out of stock while sitting in a persisted cart — see §2.

---

## 9. Empty cart state

### User steps
1. Cart has no items (new cart, all items removed, or no cart cookie at all) → full page shows `EmptyCartMessage`: heading "Cart", body copy "You don't have anything in your cart...", and an "Explore products" link to `/store`.
2. Mini-cart dropdown independently shows its own empty state (not the same component) when opened: a "0" badge, "Your shopping bag is empty," and its own "Explore products" button that also closes the popover (`cart-dropdown/index.tsx:197-214`).

### Component map
| Step | Component / file |
|---|---|
| Full page empty state | `modules/cart/components/empty-cart-message/index.tsx`, rendered from `modules/cart/templates/index.tsx:41-45` (the `else` branch of `cart?.items?.length`) |
| Mini-cart empty state | inline JSX in `modules/layout/components/cart-dropdown/index.tsx:197-214` — **duplicated markup/copy, not a shared component** with `EmptyCartMessage` |

### States & edge cases
- The two empty states have different copy ("You don't have anything in your cart" vs. "Your shopping bag is empty") and different visual treatments — confirmed not DRY, two independent implementations.
- `cart/page.tsx`'s `fetchCart()` returns `null` for both "no cookie" and "cart fetch failed" cases (`retrieveCart()`'s `.catch(() => null)`, `cart.ts:23-25`) — `CartTemplate` treats `cart === null` identically to `cart.items.length === 0`, both rendering `EmptyCartMessage`. A cart-fetch failure (e.g. backend down, or a deleted/expired cart) is therefore indistinguishable in the UI from a legitimately empty cart — no error state, no retry affordance, no surfaced reason.

---

## 10. Open questions / things not fully verified

- **Gift cards are UI-absent, not just backend-absent.** Doc 004 already established the `@medusajs/loyalty-plugin` (which would supply gift-card/store-credit backend support) isn't installed. This research confirms the gap goes one step further: even if the plugin *were* installed tomorrow, **the storefront has zero gift-card UI to wire it to.** `applyGiftCard`/`removeGiftCard` in `lib/data/cart.ts` are fully commented-out stubs with no call sites; `DiscountCode` (`discount-code/index.tsx`) only ever renders `cart.promotions` (Promotion-module objects) — there's no separate gift-card list, input, or badge anywhere in `storefront/src`. The only places gift cards appear at all are: (a) `gift_card_total` being read for display in `CartTotals` (a field that would just always be `0`/falsy and hence never render, per the `!!gift_card_total` guard), and (b) the e2e fixtures (`cart-page.ts:18-21,54-59,89-101`) and the entirely-skipped `giftcard.spec.ts`, which assert against `data-testid`s (`gift-card`, `gift-card-code`, `gift-card-amount`, `remove-gift-card-button`) that **do not exist in any current component**. Anyone reintroducing gift cards needs to build this UI from scratch, not just un-comment the stub functions.
- **Two likely bugs in `discount-code/index.tsx`** (flagged in §5/§6): the `p.code === undefined` filters in both `addPromotionCode` and `removePromotionCode` appear inverted/leftover — both paths probably send a code list that doesn't match developer intent (apply: drops prior codes instead of preserving them; remove: likely clears all codes instead of just the targeted one). This file is mid-edit per git status (modified, uncommitted) — flagging rather than asserting as confirmed-broken; should be verified by running the app and applying two promo codes in sequence, or removing one of two applied codes, and observing actual network payloads.
- **`applyPromotions` hits the generic cart-update endpoint, not the dedicated promotions endpoint** documented in doc 003 §5 (`POST/DELETE /store/carts/:id/promotions`, which maps to `PromotionActions.ADD/REMOVE/REPLACE`). Whether `sdk.store.cart.update(...,{promo_codes})` is internally routed to the same `updateCartPromotionsWorkflow`, or is older/different logic with different replace-vs-add semantics, was not verified by reading the relevant `@medusajs/medusa` route handler in this pass — doing so would resolve or sharpen the bug claims above.
- **`discount.spec.ts` is not skipped** and exercises exactly the apply/remove flows flagged as buggy above (`discount.spec.ts:216-271`, "Ensure adding and removing a discout does not impact checkout amount") — whether this test currently passes against the live bug pattern, or whether it only ever applies/removes a single code (which would mask the bug, since the inverted filter only differs from correct behavior when *multiple* codes are involved), was not run/verified in this pass. Worth actually running this spec headed against docker-compose (per session doc 002's pattern) before trusting either the test or the component.
- **Guest → logged-in cart association** was out of this doc's file scope (account/auth module not read) — flagged as unverified in §8.
- **`not-found.tsx` vs. empty-cart fallback**: `cart/page.tsx` never calls Next's `notFound()`; it's unclear what *does* trigger `cart/not-found.tsx` to render (some Next.js route-level mechanism not traced — possibly triggered elsewhere, e.g. an invalid `[countryCode]` segment combined with the cart segment, not by cart-fetch failure itself). Flagging as unresolved rather than guessing further.
- **Inventory/stock validation on quantity change**: confirmed absent client-side (`maxQuantity` hardcoded to 10, §3) — whether the backend (`sdk.store.cart.updateLineItem`) enforces real stock limits and what error shape it returns was not traced into the SDK/API layer in this pass; the generic `ErrorMessage` path would surface whatever string comes back, untested.
