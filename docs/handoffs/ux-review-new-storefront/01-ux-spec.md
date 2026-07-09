# ux-review-new-storefront / 01-ux-spec — UX/UI audit of `new-storefront/` (Ember Coffee App)

## About this document

This is a **review-only deliverable**, not a build spec. Per [`00-spec.md`](00-spec.md), this pipeline
run ends here — `backend-tdd-engineer`, `frontend-tdd-engineer`, and `e2e-verifier` are all skipped.
Nothing below should be implemented by this run; each numbered finding is a candidate for its own
future `00-spec.md` if picked up later.

**Method**: static code reading of `new-storefront/src/**`, `new-storefront/e2e/**`, and
`new-storefront/design-reference/Ember Coffee App.dc.html`, cross-referenced against
`docs/sessions/011`, `docs/sessions/014`, and `docs/flows/*.md` (used only as a checklist of
edge-case categories to check for — not as a source of truth for what this app should look like,
per `00-spec.md`). The app was not run live in this pass; every finding below is grounded in a
specific file:line, not inferred behavior. Accessibility contrast findings were computed by hand from
the exact hex/rgba values in `new-storefront/src/theme.ts` — treat the ratios as approximate and spot
check with a contrast tool before treating them as final.

All paths below are relative to the repo root.

---

## Top issues (prioritized)

| # | Severity | Screen | Issue |
|---|---|---|---|
| 1 | **High** | Global (`App.tsx`) | Quick-add failures are silently swallowed — the UI always shows a success checkmark even if the add-to-cart network call fails, because the call is fired with `void` and never `.catch()`'d. |
| 2 | **High** | `MenuScreen` | Greeting ("GOOD MORNING, ALEX") uses static mock data (`data.ts`'s `USER.firstName`) instead of the real logged-in `customer` — shows the same name to every visitor, logged in or out, unlike `RewardsScreen`/`AccountScreen`, which correctly use the real customer. |
| 3 | **High** | `App.tsx` | A `view.kind === 'checkout'` + empty-cart race lands on a bare "Your bag is empty." message with **no tab bar and no back affordance at all** — a genuine navigation dead end. |
| 4 | **High** | Global (many screens) | Icon-only buttons (back arrows, heart, bell, quick-add, qty steppers, chat header controls) have no `aria-label` and no visible text — screen readers announce them as unlabeled buttons. One exception (`checkout-login-nudge-dismiss`) shows the team knows the pattern but didn't apply it consistently. |
| 5 | **Medium** | `MenuScreen` | Featured quick-add control (`featured-quick-add-button`) is a `<span onClick>`, not a `<button>` — not keyboard-reachable, unlike the otherwise-identical `quick-add-button` used in the Popular list. |
| 6 | **Medium** | `CheckoutScreen` | Contact/address fields aren't wrapped in a `<form>`, so the `type="email"`/`type="tel"` HTML5 validation on those inputs is inert (no submit event ever fires) — unlike `AccountScreen`'s `AuthForm`, which uses a real `<form>` and gets working native validation on the same input types. |
| 7 | **Medium** | `MenuScreen`, `CartScreen`, `DrinkDetailScreen` | Several controls that look interactive have no handler: bell icon, "See all" link, "Edit" label, pickup-row chevron, heart/favorite button. |
| 8 | **Medium** | `DrinkDetailScreen` | Iced/Hot toggle is purely cosmetic — it sets local state that only affects its own button styling; it never touches `variant` resolution, price, or the payload sent to `onAdd`. |
| 9 | **Medium** | Global | Selection-state UI (category chips, Size/Milk pickers, delivery-method rows) conveys "selected" by background color alone — no `aria-pressed`/`aria-checked`/`role="radiogroup"` anywhere, so the choice is invisible to screen readers. |
| 10 | **Low** | `data.ts` | `money()` calls `Intl.NumberFormat(undefined, ...)` — locale is never pinned, so the exact currency formatting (symbol position, decimal separator) is dependent on the visiting browser's locale, not deterministic. |
| 11 | **Low** | Global | Bare `<input placeholder="...">` with no associated `<label>` used throughout (`CheckoutScreen`'s `Field`, `AccountScreen`'s `AuthForm`, `CartScreen`'s promo input) — placeholder text disappears once the user types, and isn't exposed to assistive tech the way a `<label>` is. |

---

## Screen-by-screen findings

### 1. `MenuScreen.tsx` — browse/order-ahead home

**Visual/interaction consistency vs. `design-reference/`**

- Header, search bar, category chips, and the featured card's layout/copy/colors all match the
  mockup closely (`new-storefront/src/screens/MenuScreen.tsx:33-103` vs.
  `new-storefront/design-reference/Ember Coffee App.dc.html:55-69`), including the literal search
  placeholder text "Search drinks, food…" (`MenuScreen.tsx:77` = mockup `:63`).
- **Copy deviation, unresolved**: the featured card's badge reads **"FEATURED"**
  (`MenuScreen.tsx:144`) where the mockup reads **"EDITOR'S PICK"**
  (`Ember Coffee App.dc.html:72`). Nothing in the repo documents this as an intentional rename —
  looks like undocumented drift, not a deliberate choice.
- **Data deviation, reasonable**: the mockup hardcodes `$5.75` (`Ember Coffee App.dc.html:74`); the
  shipped app renders `money(featured.price, featured.currencyCode)` (`MenuScreen.tsx:150`) off the
  real seeded EUR catalog. This is real data correctly replacing a static mock, not drift — but see
  finding below about `money()`'s locale handling.
- Category chips are data-driven (`MenuScreen.tsx:82-102`) vs. the mockup's 4 hardcoded chips
  (`Espresso/Cold/Matcha/Bakery`, `Ember Coffee App.dc.html:65-68`) — expected, documented in
  `docs/sessions/011` as the point where category filtering became real.

**States & edge cases**

- No drinks in the selected category (or none fetched at all): `MenuScreen.tsx:105-108` shows "No
  drinks in this category yet." — a real, present empty state. Minor copy nit: if there are **zero
  categories at all** (backend returned no coffee products), `categories` is `[]`, no chips render,
  and this same message still says "in this category" even though no category concept was ever
  shown — slightly confusing phrasing for the true "nothing in the whole menu" case.
- Loading/error: `MenuScreen` itself has no loading or error state of its own — both are handled one
  level up as a full-screen replacement of the entire app shell (`App.tsx:161-164`, see App.tsx
  section below). There's no menu-specific skeleton.
- **Quick-add failure is invisible.** `App.tsx`'s `quickAdd` (`App.tsx:84-88`) calls
  `void addVariantToCart(variant.id, 1)` with no `.catch()`, and `addVariantToCart` itself
  (`App.tsx:73-76`) doesn't catch either. Meanwhile `MenuScreen.tsx:156-160` (featured) and
  `:202-206` (popular row) optimistically flip the plus icon to a checkmark on click, **regardless
  of whether the network call actually succeeds**. If `addLineItem` rejects (network blip, stock
  issue, etc.), the user sees a success checkmark and the bag count never updates, with zero error
  surfaced anywhere. This is the single most user-visible "silent failure" in the app.

**Non-functional/decorative controls**

- Notification bell: `<button style={iconButton}><Icon name="Bell" .../></button>`
  (`MenuScreen.tsx:49-51`) — no `onClick` at all.
- Search bar: `MenuScreen.tsx:62-78` is a static `<div>` with an `Icon` and a `<span>` placeholder
  text — not an `<input>`, no state, no keydown/filter wiring of any kind. Purely decorative.
- "See all" link next to "Popular today": `<span style={...}>See all</span>`
  (`MenuScreen.tsx:186`) — not even a `<button>`, no `onClick`, not keyboard-reachable.
- **Inconsistent control type for functionally-identical buttons**: the featured card's quick-add
  is a `<span data-testid="featured-quick-add-button" onClick={...}>` (`MenuScreen.tsx:154-180`),
  while the Popular row's quick-add is a real `<button data-testid="quick-add-button">`
  (`MenuScreen.tsx:200-224`). Same visual affordance (a plus-in-a-circle), different underlying
  element — the featured one is not reachable via Tab/Enter/Space, the popular one is.

**Accessibility**

- Greeting/customer-display bug (see Top Issues #2): `MenuScreen.tsx:54` renders
  `USER.firstName.toUpperCase()` imported from `new-storefront/src/data.ts:9`
  (`export const USER = { firstName: 'Alex' }`) — `MenuScreenProps` (`MenuScreen.tsx:8-13`) doesn't
  even accept a `customer` prop, and `App.tsx:196-201` doesn't pass one. Every visitor — logged in
  as someone else, or not logged in at all — sees "GOOD MORNING, ALEX." This is a real regression
  relative to `RewardsScreen`/`AccountScreen`, which both correctly derive the display name from the
  real `customer` (see Cross-screen consistency below). The mockup itself hardcodes "ALEX" too
  (`Ember Coffee App.dc.html:60`), so this isn't a mockup-fidelity issue — it's that the wiring
  documented as done in `docs/sessions/011`/`014` for Rewards/Account/Checkout was never extended
  to Menu.
- Bell icon button has no `aria-label` (and no handler — see above); same for the featured
  card's Star icon-in-badge (decorative, acceptable) but the quick-add icon-only controls
  (`MenuScreen.tsx:154-180`, `:200-224`) have no accessible name beyond the bare icon glyph —
  a screen reader announces "button" with no label.
- Category chip buttons (`MenuScreen.tsx:84-102`) indicate selection via `theme.ink` background vs.
  `theme.paper` background only — no `aria-pressed`/`role="tablist"`. A screen reader user tabbing
  through the chips gets no indication of which category is active.

**Copy**

- "GOOD MORNING, {NAME}" doesn't adapt to time of day (always "Good morning" regardless of the
  actual time) — cosmetic, but worth flagging since the mockup's own name is arguably fine as static
  intro chrome, whereas a time-sensitive greeting that's always "morning" reads oddly used in an
  afternoon/evening test run. Low priority.

---

### 2. `DrinkDetailScreen.tsx` — customize/PDP

**Visual/interaction consistency vs. `design-reference/`**

- Top bar, hero image + Iced/Hot pill overlay, Size/Milk selectors, extras rows, and the sticky
  qty-stepper + Add-to-bag CTA all match the mockup's layout, radii, and copy closely
  (`DrinkDetailScreen.tsx:44-219` vs. `Ember Coffee App.dc.html:108-147`), including the exact
  "SIZE"/"MILK" section labels and oz values (12/16/20 oz).
- Price again correctly uses `money(drink.price, drink.currencyCode)` real data
  (`DrinkDetailScreen.tsx:93`) vs. mockup's hardcoded `$5.75`/`$6.65` — reasonable, expected
  deviation.

**States & edge cases**

- **No loading/error state needed** — all data (`drink`, `extras`) is passed in as already-loaded
  props from `App.tsx`; this screen only renders once the parent's fetch has resolved.
- **Add-to-bag disabled with no explanation.** `DrinkDetailScreen.tsx:203` disables the CTA when
  `!variant` (no Size×Milk combination matches a real backend variant) — but nothing tells the user
  *why* the button went inert if they pick an unsupported combination (e.g. a size that only exists
  with certain milks in the seeded catalog). The button just dims and stops responding
  (`DrinkDetailScreen.tsx:205-214`, `background: variant ? theme.accent : theme.muted`). No inline
  message like "This combination isn't available."
- Extras default-selection: only `extras[0]` is pre-checked (`DrinkDetailScreen.tsx:28`) — matches
  the mockup's single pre-toggled "Extra espresso shot" (`Ember Coffee App.dc.html:136-137`).

**Non-functional/decorative controls**

- Heart/favorite button: `<button style={circleBtn(theme.accent)}><Icon name="Heart" .../></button>`
  (`DrinkDetailScreen.tsx:53-55`) — no `onClick`. Present in the mockup too
  (`Ember Coffee App.dc.html:111`, also non-interactive there since it's a static image) but the
  shipped app never wired it to anything (e.g. a favorites list), unlike the rest of the screen
  which is fully wired to real state.
- **Iced/Hot toggle is cosmetic only** (Top Issues #8). `temp` state
  (`DrinkDetailScreen.tsx:25`, `setTemp` at `:63-77`) only feeds the toggle's own background/color —
  it is never read by `variant` resolution (`:31`, keys only on `size`/`milk`), `unitPrice`/`total`
  (`:33-34`), or the `onAdd` call (`:204`, passes `variant.id`/`qty`/extra ids only). Toggling
  Iced/Hot visibly changes which pill looks "active" but has zero effect on what actually gets added
  to the cart or its price — worth a product decision on whether Iced/Hot should map to a real
  backend concept (e.g. a third variant option) or be removed if it's staying decorative.

**Accessibility**

- Back-arrow button (`DrinkDetailScreen.tsx:47-49`) and heart button (`:53-55`) are icon-only with
  no `aria-label`.
- Size/Milk buttons (`:98-123`, `:127-148`) and each extra's toggle switch (`:170-172`) convey
  on/off or selected state via color alone — no `aria-pressed` on the Size/Milk buttons, no
  `role="switch"`/`aria-checked` on the extras toggles (which are real `<button>`s, so at least
  keyboard-reachable — better than the toggle-track/knob's purely visual `<span>` sub-elements
  suggesting a native switch that isn't actually announced as one).
- The static "4.9 · 128 ratings" line (`DrinkDetailScreen.tsx:90`) is literally identical text for
  every drink in the catalog — not itself an accessibility issue, but see Copy below.

**Copy**

- "4.9 · 128 ratings" (`DrinkDetailScreen.tsx:90`) is hardcoded, not per-drink data — every drink in
  the catalog, no matter which one, shows the exact same rating and review count. This matches the
  mockup's own hardcoded rating (`Ember Coffee App.dc.html:119`), so it's not new drift, but as
  shipped it now reads as "real" review data for a live product catalog rather than obviously-mock
  filler — worth a product decision on whether to remove it entirely until real ratings exist, since
  presenting identical fake social proof across every product is arguably more misleading in a real
  app than in a static design mockup.

---

### 3. `CartScreen.tsx` — bag / cart

**Visual/interaction consistency vs. `design-reference/`**

- Layout, pickup-info row, per-item rows (thumbnail/title/variant text/price/qty stepper),
  "Apply a promo code" row, and the summary block all match the mockup closely
  (`CartScreen.tsx:51-166` vs. `Ember Coffee App.dc.html:290-320`), including copy ("Your bag",
  "Pickup · Ember Mission St", "Apply a promo code", "Subtotal"/"Taxes"/"Earns +N ★").
- Extras-grouping under a parent line item (`CartScreen.tsx:96-105`, `data-testid="cart-item-extra"`)
  is new functionality with no mockup equivalent (the mockup's two cart rows have no
  parent/extra relationship) — reasonable, real-data-driven addition, confirmed working per
  `new-storefront/e2e/extras.spec.ts`.
- Empty-cart state (`CartScreen.tsx:32-45`) has no mockup equivalent at all (the mockup only shows a
  populated cart) — a reasonable, necessary addition, and its copy ("Your bag is empty" /
  "Add a drink from the menu or ask Ember for a recommendation.") is on-voice with the rest of the
  app.

**States & edge cases**

- Empty cart: present and complete (icon, heading, body copy, "Browse the menu" CTA,
  `CartScreen.tsx:32-45`).
- **No loading/disabled state while a promo code is being applied.** The "Apply" submit button
  (`CartScreen.tsx:127-129`) has no pending/disabled state while `onApplyPromo` is in flight
  (`App.tsx:96-101`, `applyPromo` sets no loading flag) — a fast double-click could fire the apply
  call twice. Contrast with `DrinkDetailScreen`/`CheckoutScreen`, which do show pending copy
  ("Placing order…", "Checking delivery options…") for their own async actions.
- Promo error is shown inline below the form (`CartScreen.tsx:131-133`) — a real, working error
  surface (confirmed against `docs/sessions/011`'s note that this used to be an unhandled rejection).
  Styled in `theme.accent` (brand orange) — see cross-cutting note on error-color overloading below.
- Qty stepper decrementing to 0 removes the line item (via `changeLineItemQty` →
  `removeLineItem` in `new-storefront/src/lib/backend.ts:245-260`), confirmed by
  `new-storefront/e2e/extras.spec.ts`'s "cascade-remove its linked extra" test. No confirmation
  dialog before removal — reasonable for a quantity stepper, not flagged as a bug.

**Non-functional/decorative controls**

- "Edit" label next to "Your bag" heading: `<span style={...}>Edit</span>` (`CartScreen.tsx:55`) —
  not a button, no `onClick`. Present in the mockup too (`Ember Coffee App.dc.html:293`, itself just
  static markup there) but never wired to anything in the shipped app (e.g. a bulk-edit/reorder
  mode).
- Pickup info row's trailing chevron (`CartScreen.tsx:70`, `<Icon name="ChevronRight" .../>`) implies
  the whole row is tappable (e.g. to change pickup location/time), but the row itself is a plain
  `<div>` (`:59-71`) with no `onClick` anywhere in it. Matches the mockup's static chevron
  (`Ember Coffee App.dc.html:297`) but the shipped app has no pickup-location/time feature at all to
  wire it to (`STORE.etaMinutes`/`.name` are still static mock data from `data.ts:8`, a documented,
  known gap per `docs/sessions/011` — not re-flagged as a new bug here, just noted as the reason the
  chevron has nothing to do).

**Accessibility**

- Qty stepper buttons (`CartScreen.tsx:87-93`) are icon-only (Minus/Plus), no `aria-label` — a
  screen reader would announce "button, button" with no indication of which does what beyond
  inferring from adjacent DOM.
- Promo-code `<input>` (`CartScreen.tsx:120-126`) has a `placeholder` ("Promo code") but no
  `<label>`; it does get `autoFocus` when revealed (`:121`), a reasonable touch for the
  reveal-on-click flow.

**Copy**

- "Your bag is empty" (`CartScreen.tsx:38`) matches `App.tsx:188`'s checkout-guard message
  "Your bag is empty." almost verbatim (missing period difference aside) — good cross-screen
  consistency, called out here as a **positive** finding, not an issue.
- Promo/checkout/rewards-redeem error text all render in `theme.accent` (`CartScreen.tsx:132`,
  `CheckoutScreen.tsx:226`, `RewardsScreen.tsx:157-159`) — see the cross-cutting note below; this is
  consistent *within* the app (all three error surfaces agree), but semantically odd since
  `theme.accent` is also the brand color used for every primary call-to-action button, so "error" and
  "primary action" share one visual language with no dedicated red/negative color anywhere in
  `theme.ts`.

---

### 4. `CheckoutScreen.tsx` — checkout

No mockup baseline exists for this screen — the design-reference bundle covers 6 screens (Menu,
Drink Detail, Rewards, Cart, 2 chat variants) and checkout/account/order-confirmation are net-new,
added during the backend-wiring work (`docs/sessions/012`, `013`, `014`). Visual style (radii,
type scale, spacing, `theme.accent` CTA styling) is consistent with the rest of the app even without
a mockup to check against — reasonable extrapolation, not flagged as drift.

**States & edge cases**

- Guest login nudge: dismissible, doesn't block guest checkout, confirmed correct per
  `docs/sessions/014` and `new-storefront/e2e/checkout.spec.ts`'s nudge-dismissal test
  (`CheckoutScreen.tsx:127-160`).
- Logged-in prefill from `customer.defaultAddress` with "Use a different address" override, per
  `docs/sessions/014` — confirmed implemented as documented (`CheckoutScreen.tsx:19-44`).
- Delivery-method loading: "Checking delivery options…" while `loadingOptions` is true
  (`CheckoutScreen.tsx:190`) — good, present.
- Place-order loading: "Placing order…" while `submitting` is true (`:238`) — good, present.
- Inline error (`CheckoutScreen.tsx:226`) is shared across three independent failure points
  (`loadShippingOptions`, `selectShippingOption`, `handlePlaceOrder`) — functionally fine (only one
  can be active at a time), but positioned at the very bottom of the scrollable content, below the
  delivery-method list — if the list is short, this could render off the visible fold without any
  scroll-into-view behavior, so a user could see nothing change and not notice a new error appeared
  without scrolling down.
- **`canReview` doesn't validate format, only presence** (`CheckoutScreen.tsx:100`:
  `email && phone && firstName && lastName && address1 && city`) — every field only needs to be
  non-empty, not well-formed. This wouldn't normally be alarming (browsers often reinforce
  `type="email"`/`type="tel"` for free) — except see the next finding, which means that
  reinforcement never actually happens here.
- **No `<form>` wrapper, so native input-type validation is inert** (Top Issues #6). The entire
  contact/address section (`CheckoutScreen.tsx:117-243`) is `<div>`s; `Field`
  (`:245-266`) renders a plain `<input type={type} .../>` with no enclosing `<form>`, and
  "Continue to delivery" (`:184-191`) is a `<button onClick={loadShippingOptions}>`, not
  `type="submit"`. Browser-native validation for `type="email"`/`type="tel"` only fires on a form
  submit event — since there is none here, a malformed email like `"abc"` sails through
  client-side unchecked, unlike `AccountScreen`'s `AuthForm` (`AccountScreen.tsx:148`), which wraps
  its fields in a real `<form onSubmit={handleSubmit}>` with a `type="submit"` button
  (`:177-184`) and therefore *does* get working native validation for the same input types
  (`:167-168`). This is a real, concrete inconsistency between the app's two "collect contact info"
  forms, not just a style nit.
- A second consequence of no `<form>`: pressing Enter while focused in any checkout field does
  **not** submit/advance (no submit handler exists to catch it), whereas `AuthForm` and `CartScreen`'s
  promo-code entry (`CartScreen.tsx:112-116`, a real `<form onSubmit>`) both do respond to Enter.

**Non-functional/decorative controls**

- Delivery-method selection state is conveyed by background color alone
  (`CheckoutScreen.tsx:196-221`, `data-selected={sel}` is a non-standard custom attribute, not
  `aria-selected`) — see cross-cutting accessibility note.

**Accessibility**

- Back-arrow button (`CheckoutScreen.tsx:120-122`) is icon-only, no `aria-label` — same pattern as
  `DrinkDetailScreen`'s back button.
- The dismiss button on the login nudge **does** have `aria-label="Dismiss"`
  (`CheckoutScreen.tsx:154`) — the one confirmed example in the whole app of the icon-only-button
  pattern being done correctly. Worth using as the reference pattern when fixing the others.
- `Field` inputs (`CheckoutScreen.tsx:245-266`) have no `<label>`, relying on `placeholder` alone
  (same pattern as `AuthForm`, see below) — text disappears once a field has content.
- Shipping-option buttons act like a radio group visually but have no `role="radiogroup"`, no
  `aria-checked`/`aria-selected`, and their selected state is color-only
  (`CheckoutScreen.tsx:196-221`) — a screen reader user has no way to determine which delivery
  method is currently selected other than re-reading the whole list and guessing from context.

**Copy**

- "Log in to earn points on this order." (`CheckoutScreen.tsx:141-143`) is clear and consistent in
  tone with the rest of the app.
- No postal code/country fields anywhere in this screen — confirmed intentional per
  `docs/sessions/014` (country is hardcoded to `vn` internally, `new-storefront/src/lib/checkout.ts:18`,
  never surfaced in UI) — **not** flagged as a bug, per the constraint in `00-spec.md`.

---

### 5. `OrderConfirmationScreen.tsx` — success state

No mockup baseline (net-new screen, see note under Checkout above). Small, self-contained, and
functionally complete.

**States & edge cases**

- This screen has exactly one state — success — by construction (`App.tsx` only ever renders it
  from the `onPlaced` callback after a real, successful `placeOrder()`, `App.tsx:182-186`). There is
  no separate loading/error state to evaluate here; those live in `CheckoutScreen` (`submitting`/
  `error`) prior to this screen ever mounting. Appropriate boundary.

**Non-functional/decorative controls**

- None found — "Back to menu" (`OrderConfirmationScreen.tsx:19-35`) is a real button wired to
  `onDone`.

**Accessibility**

- The green checkmark icon (`OrderConfirmationScreen.tsx:12-14`) is purely decorative alongside the
  adjacent "Order placed!" text — no accessibility concern since the icon isn't the only carrier of
  meaning.
- "Back to menu" button has visible text — no icon-only accessibility gap here.

**Copy**

- "Order #{displayId} is confirmed. We'll have it ready shortly." (`OrderConfirmationScreen.tsx:17`)
  is clear, on-voice, and consistent with the pickup-focused framing used elsewhere (`CartScreen`'s
  "Ready in ~8 min").
- Minor, low-severity code note (not really a UX finding): the `View` type carries an unused
  `orderId` field (`new-storefront/src/types.ts:65`, set at `App.tsx:184`) that this component never
  receives or displays (`OrderConfirmationScreenProps` only has `displayId`/`onDone`,
  `OrderConfirmationScreen.tsx:4-7`) — dead data threaded through state, no UI impact.

---

### 6. `RewardsScreen.tsx` — stars & offers

**Visual/interaction consistency vs. `design-reference/`**

- Star-balance card, star-row progress indicator, "N more stars until your next free drink" copy,
  the two static offer cards ("2× stars" / "Free oat"), and the Activity list all match the mockup
  closely (`RewardsScreen.tsx:81-227` vs. `Ember Coffee App.dc.html:159-188`), including exact copy
  strings.
- **Real-data improvement over the mockup, and over `MenuScreen`**: the header badge/name
  (`RewardsScreen.tsx:87,101`) correctly derives from the real `customer` object
  (`first_name ?? phone ?? email`) instead of the mockup's hardcoded "ALEX"
  (`Ember Coffee App.dc.html:159`) — this is the correct pattern that `MenuScreen` should also be
  using (see Top Issues #2).
- "Offers" cards (`RewardsScreen.tsx:171-182`) remain 100% static/decorative, matching the mockup
  1:1, and matching the documented, intentional "no first-class Medusa equivalent" gap from
  `docs/sessions/011` — not flagged as a bug.

**States & edge cases**

- Logged-out prompt (`RewardsScreen.tsx:22-34`) is a real, complete state with its own testid
  (`rewards-login-prompt`), confirmed exercised by `new-storefront/e2e/rewards.spec.ts`.
- Loading: balance shows `'…'` while `account === null && !error` (`RewardsScreen.tsx:122`);
  activity list separately shows "Loading…" text (`:187-189`) — both present and reasonable, though
  note these are two different visual treatments for what's really the same underlying fetch (one
  ellipsis glyph, one text string) rather than a single shared loading affordance.
- Error: account-fetch failure renders inline (`RewardsScreen.tsx:186`) — present, no retry button
  distinct from re-navigating to the tab (acceptable, minor).
- Redeem: `redeeming` disables the button and swaps its label to "Redeeming…"
  (`RewardsScreen.tsx:131-150`) — good loading state. Redeem error (`:156-160`) and the two-variant
  redeem-success copy (`:161-167`, "Applied!..." vs. "Reward unlocked — enter code...") are both
  present and match what `new-storefront/e2e/rewards.spec.ts`'s redeem tests actually assert against.

**Non-functional/decorative controls**

- None found beyond the already-documented-static "Offers" cards.

**Accessibility**

- The 8-icon star row (`RewardsScreen.tsx:126-130`) conveys progress (`i < progress ? gold : faint`)
  purely visually — there's no `aria-label` summarizing "N of 8 stars" for a screen reader; only the
  raw balance number (`data-testid="star-balance"`) is available as text, not the progress-toward-
  threshold framing that's visually prominent for sighted users.
- Avatar circle showing the customer's first initial (`RewardsScreen.tsx:88-103`) has no
  `aria-hidden`/label — decorative-but-unlabeled, low severity since the adjacent name text carries
  the same information.

**Copy**

- "Your star balance and activity are tied to your account — head to the You tab to log in or sign
  up." (`RewardsScreen.tsx:30`) is clear and correctly directs the user to the right tab by name.

---

### 7. `AccountScreen.tsx` — You tab (auth + profile)

No mockup baseline — auth/account is entirely net-new (`docs/sessions/012`, `013`, `014`).

**States & edge cases**

- Logged-out: `AuthForm` (`AccountScreen.tsx:90-199`) — single `identifier-input` for login
  (phone-or-email, per `docs/sessions/014`'s settled design), full field set for signup (phone
  required, email required, address/city required) — matches the settled product decisions in
  `docs/sessions/014` exactly; **not** flagged as a bug.
- Logged-in: `Profile` (`:35-88`) shows avatar-initial, name/phone/email, and order history with its
  own loading ("Loading orders…", `:63`), error (`:61`), and empty ("No orders yet.",
  `data-testid="no-orders-message"`, `:66`) states — all three present and consistent with the
  register used elsewhere in the app.
- `canSubmit` correctly gates the submit button per mode (`AccountScreen.tsx:142-145`) — login
  needs identifier+password, signup needs all seven required fields.
- Mode toggle clears any prior error (`AccountScreen.tsx:189-193`) — good, prevents a stale
  login-error from bleeding into the signup form after switching modes.

**Non-functional/decorative controls**

- None found — every visible control (submit, mode toggle, logout) is wired.

**Accessibility**

- **`AuthForm`'s inputs correctly sit inside a real `<form onSubmit={handleSubmit}>`**
  (`AccountScreen.tsx:148`) with a `type="submit"` button (`:177-184`) — this is the "does it right"
  counterpart to `CheckoutScreen`'s missing `<form>` (see Top Issues #6 / Checkout section above).
  All inputs still lack `<label>` elements, relying on `placeholder` alone
  (`:154-173`) — same pattern as everywhere else in the app.
- No password show/hide toggle and no `autocomplete` attributes on the password/email/tel inputs —
  a minor UX/accessibility nicety gap, not a blocker.
- Logout button has real visible text ("Log out", `AccountScreen.tsx:82-85`) plus an icon — no
  accessible-name issue here.

**Copy**

- **Cross-screen consistency check (per `00-spec.md`'s explicit ask)**: `Profile`'s customer-name
  display (`AccountScreen.tsx:53`: `[first_name, last_name].filter(Boolean).join(' ') || phone ||
  email`) and `RewardsScreen`'s header badge (`RewardsScreen.tsx:87,101`:
  `first_name ?? phone ?? email`) agree on **priority order** (first name beats phone beats email)
  but differ in that `AccountScreen` additionally appends `last_name` when present. This is a
  reasonable, minor difference given the two contexts (a full profile heading vs. a compact
  single-line tab badge with no room for a full name) — not flagged as a bug, but noted since the
  spec asked for this comparison explicitly.
- "Don't have an account? Sign up" / "Already have an account? Log in" (`AccountScreen.tsx:195`) is
  clear, standard auth-form copy.

---

### 8. `ChatScreen.tsx` — Ember assistant (both variants)

Per `00-spec.md` and `docs/sessions/011`, this screen is **explicitly, permanently mock** — a canned
recommendation, not a real assistant (`ChatScreen.tsx:20-22`). The findings below audit it purely as
a UI/interaction surface (states, consistency, accessibility between its two variants), not as a
functionality gap — nothing here should be read as "ChatScreen doesn't really work," since it was
never meant to.

**Visual/interaction consistency vs. `design-reference/`**

- `BubbleChat` (light) matches the mockup's Chat A closely: header, message bubbles, recommendation
  card, gold rewards-nudge bubble, quick-reply pills, and input bar all align
  (`ChatScreen.tsx:42-176` vs. `Ember Coffee App.dc.html:207-236`), including exact copy
  ("Morning, Alex! Feeling something bold, sweet, or iced today?", "You're 4 ★ from a free drink —
  add it and you're almost there!").
- `VoiceChat` (dark) matches Chat B closely: mood chips, "What are you in the mood for?" heading,
  recommendation card, and the mic/keyboard/sparkles control row all align
  (`ChatScreen.tsx:207-303` vs. `Ember Coffee App.dc.html:244-283`).
- One small header deviation: the mockup's light-chat header has a "more" (`⋯`) icon button on the
  right (`Ember Coffee App.dc.html:211`); the shipped `BubbleChat` replaces it with an `AudioLines`
  icon wired to `onSwitch` (switch-to-voice, `ChatScreen.tsx:95-97`) — a **reasonable, functional
  upgrade** over a decorative "more" button, not drift.

**States & edge cases**

- `rec` (the recommended drink) falling back to `drinks[0]` if the specific handle isn't found, and
  an explicit "No drinks available yet." empty state if there are no drinks at all
  (`ChatScreen.tsx:23-31`) — a real, present empty-state guard.
- `BubbleChat`'s simulated bot reply has a fixed 600ms delay with no debounce/loading indicator
  (`ChatScreen.tsx:70-76`) — a user could send multiple messages in quick succession, each queuing
  its own delayed reply; low severity given the mock nature of this screen, but worth noting since
  rapid-fire sends could produce out-of-order-looking bot replies.

**Non-functional/decorative controls**

Listed for completeness per the audit scope; **not** treated as bugs given the screen's documented
mock status:

- `VoiceChat`'s "History" icon button (`ChatScreen.tsx:228-230`) has no `onClick`.
- `VoiceChat`'s "Tell me more" button (`:280`) has no `onClick`.
- `VoiceChat`'s "Sparkles" icon button (`:297`) has no `onClick`.
- `VoiceChat`'s "Keyboard" button (`:288`), by contrast, **is** wired (`onSwitch`, switches back to
  bubble chat) — so the dark variant has a mix of wired and unwired icon buttons in the same control
  row, which could look inconsistent to a user tapping around even though none of it is meant to be
  a fully working assistant.
- The large mic circle ("Hold to talk", `ChatScreen.tsx:291-296`) has no `onMouseDown`/`onTouchStart`
  handlers — expected, since there's no real voice input to wire it to.

**Accessibility**

- Quick-reply pills (`ChatScreen.tsx:139-153`) are real `<button>`s with visible text — no issue.
- Message `<input>` (`:161-168`) has a placeholder ("Message Ember…") but no `<label>` — same
  pattern as the rest of the app.
- **Dark-variant contrast, computed from `theme.ts`'s literal values**: `color: '#9b8d80'` body text
  on the `theme.darkElev` (`#2A211B`) card background (`ChatScreen.tsx:271`, "Half-caff · oat · light
  ice") computes to roughly **4.9:1** — passes WCAG AA (4.5:1) for normal text, but only barely, at
  a 12px size. `rgba(244,239,230,0.55)` "Hold to talk" text over `theme.dark` (`ChatScreen.tsx:295`)
  computes to roughly **5.4:1** — also passes, comfortably. Neither is a confirmed failure, but both
  are close enough to the threshold to be worth a real contrast-checker pass before this dark theme
  is used more broadly (see the cross-cutting contrast finding below for a clearer, more likely
  failure elsewhere in the light theme).
- Icon-only header buttons (`ChatScreen.tsx:82-84` back arrow in `BubbleChat`; `:221-223` close
  button in `VoiceChat`; `:228-230` History) have no `aria-label` — same pattern as elsewhere in the
  app, called out again here since it recurs in both chat variants.

**Copy**

- Tone is consistent with the rest of the app (warm, casual barista voice) and consistent between
  the two variants ("Ember", gold accents for rewards-flavored copy).

---

## Routing/state — `App.tsx`

**View state machine** (`App.tsx:31-32`, `types.ts:61-65`)

- Four `view.kind` values (`tab`/`detail`/`checkout`/`orderConfirmation`) are handled by one large
  ternary chain (`App.tsx:160-237`) rather than a router — reasonable for an app this size, and each
  transition (`goTab`, `onOpenDrink`, `onPlaced`, etc.) is explicit and traceable.
- **Confirmed dead end (Top Issues #3)**: when `view.kind === 'checkout'` and the cart is empty
  (`App.tsx:186-189`), the app renders `<StatusMessage text="Your bag is empty." />` with **no**
  `TabBar` — the `TabBar` is only rendered in the final `else` branch for `tab` views
  (`App.tsx:234`), not in the `checkout` branch at all, and `StatusMessage` itself
  (`App.tsx:242-248`) has no button or link of any kind. A user who reaches this exact state (cart
  emptied out from under them between pressing "Pay" and the checkout screen mounting — plausible
  via a slow network plus a fast double-tap, or a cart cleared by another tab/session) has **no way
  to navigate anywhere** except reloading the app. Low likelihood of being hit in normal use, but a
  true, confirmed dead end with no recovery path is worth fixing regardless of frequency — at minimum
  a "Back to menu" button on this message, ideally routing back to `bag` instead of surfacing this
  state at all.
- Tab-bar visibility during chat: correctly hidden (`App.tsx:234`, `view.tab !== 'chat'`) so the dark
  voice variant can go full-bleed — matches the mockup's chat screens, which also show no tab bar.
- Global loading/error (`App.tsx:161-164`): `"Loading menu…"` and
  `"Couldn't reach the backend: {error}"` both replace the **entire app shell**, including the tab
  bar — there is no partial-loading state (e.g. showing the shell with a menu-specific skeleton) and
  **no retry affordance** on the error message. A transient network blip on first load leaves the
  user looking at plain text with literally nothing to click. This matches the coarse "whole-app
  goes blank" failure pattern flagged as a real gap in `docs/flows/checkout-flow.md`
  (missing shipping/payment options blanking the whole checkout form) and
  `docs/flows/cart-promotions-flow.md` (cart-fetch failure indistinguishable from empty cart) for
  the *other* storefront — worth noting as the same category of gap recurring independently in this
  app.

**Shared components**

- `PhoneFrame.tsx` (`new-storefront/src/components/PhoneFrame.tsx:9-17`) explicitly, in its own
  comment, documents dropping the mockup's phone-bezel chrome (status bar, home-indicator bar,
  device notch/shadow — all present in every mockup frame,
  e.g. `Ember Coffee App.dc.html:52-53,98`) in favor of "a real responsive app." This is a
  **deliberate, documented divergence**, not drift — flagged here only to confirm it, per the
  audit's requirement to judge every deviation explicitly.
- `TabBar.tsx` (`new-storefront/src/components/TabBar.tsx:20-83`) is used consistently across all
  five tab screens, always with the same five items in the same order, matching the mockup's tab bar
  exactly (`Ember Coffee App.dc.html:91-97`). Accessibility gap: no `<nav>` landmark wrapping it, and
  no `aria-current="page"` (or equivalent) on the active tab's button — active/inactive state is
  conveyed by color only (`TabBar.tsx:46`, `theme.accent` vs. `theme.faint`).
- `Icon.tsx` (`new-storefront/src/components/Icon.tsx:15-19`) silently returns `null` if a requested
  Lucide icon name doesn't exist — a defensible fail-soft choice (no crash from a typo'd icon name),
  but means a broken icon reference would be invisible in the UI (an empty space where an icon
  should be) with nothing in the console or on-screen to flag it during development. Low severity,
  purely a developer-experience note.
- `Placeholder.tsx` used consistently everywhere a product photo would go, always with the same
  striped-background treatment and optional filename caption — matches the mockup's placeholder
  treatment exactly (visual parity confirmed across Menu, Drink Detail, Cart, and both Chat
  variants).

---

## Cross-cutting themes

### Accessibility

1. **Icon-only buttons with no accessible name** (Top Issues #4) — confirmed at, at minimum:
   `MenuScreen.tsx:49-51` (bell), `:154-180` (featured quick-add), `:200-224` (popular quick-add);
   `DrinkDetailScreen.tsx:47-49` (back), `:53-55` (heart), `:193-199` (qty stepper);
   `CartScreen.tsx:87-93` (qty stepper); `CheckoutScreen.tsx:120-122` (back);
   `ChatScreen.tsx:82-84`/`:221-223`/`:228-230`/`:297` (various chat header controls). The one
   confirmed correct example is `CheckoutScreen.tsx:154` (`aria-label="Dismiss"` on the nudge's close
   button) — worth using as the template fix.
2. **Selection state conveyed by color alone, no ARIA state** — category chips
   (`MenuScreen.tsx:84-102`), Size/Milk selectors (`DrinkDetailScreen.tsx:98-123`,`:127-148`), and
   delivery-method rows (`CheckoutScreen.tsx:196-221`) all use background-color changes with no
   `aria-pressed`/`aria-checked`/`role="radiogroup"` anywhere. A screen reader user cannot determine
   the current selection in any of these groups.
3. **No `<label>` on any form input in the app** — `CheckoutScreen`'s `Field` component
   (`CheckoutScreen.tsx:245-266`), `AccountScreen`'s `AuthForm` inputs (`AccountScreen.tsx:154-173`),
   and `CartScreen`'s promo-code input (`CartScreen.tsx:120-126`) all rely on `placeholder` alone.
   Confirmed as suspected in `00-spec.md`.
4. **Contrast**: computed by hand from `theme.ts`'s exact values —
   - `theme.muted` (`#9A8D80`) text on `theme.paper`/`theme.cream` backgrounds (used pervasively —
     e.g. `MenuScreen.tsx:194` drink descriptions, `CartScreen.tsx:81` variant text, timestamps in
     `RewardsScreen.tsx:215`) computes to roughly **3.3:1** — below the WCAG AA 4.5:1 threshold for
     normal-size text (these are all 12-13px). This is the app's single most-repeated color/text
     pairing, so it's worth prioritizing over the dark-chat borderline cases noted in the ChatScreen
     section.
   - `theme.faint` (`#B4A99E`) inactive tab labels/icons on the tab bar's near-cream background
     (`TabBar.tsx:46,55`) computes to roughly **2:1** — well below AA even for large text. This is
     arguably an intentional "de-emphasized but still fully functional nav item" pattern common in
     many apps, but as literal body/label text it's a real, computed contrast failure worth a
     designer's sign-off rather than assuming it's fine because it's "just" an inactive state.
   - Both figures above are hand-computed from the relative-luminance formula against the literal
     hex/rgba values in `theme.ts` — recommend confirming with an actual contrast-checker tool before
     treating them as final, per this document's stated methodology.

### Copy

- Voice/tone is consistent across all screens (warm, casual, coffee-shop register) — no jarring
  tonal shifts found between Menu/Cart/Checkout/Rewards/Chat.
- Error copy has no unified visual treatment distinguishing it from primary-action copy — every
  error surface in the app (`CartScreen.tsx:132`, `CheckoutScreen.tsx:226`, `RewardsScreen.tsx:157`,
  `AccountScreen.tsx:175`) uses `theme.accent`, the same brand-orange used for every CTA button.
  Internally consistent (all errors agree), but there's no dedicated "negative"/red color in
  `theme.ts` at all — worth a design decision on whether errors should visually differ from calls to
  action.
- "Your bag is empty" copy agrees verbatim between `CartScreen.tsx:38` and the checkout guard's
  "Your bag is empty." (`App.tsx:188`) — confirmed **positive** consistency.

### Cross-screen consistency (customer display-name fallback)

Per `00-spec.md`'s explicit ask: `RewardsScreen.tsx:87,101` (`first_name ?? phone ?? email`) and
`AccountScreen.tsx:53` (`[first_name, last_name].filter(Boolean).join(' ') || phone || email`) agree
on priority order and differ only in whether `last_name` is appended — reasonable, not a bug (see
AccountScreen section above for detail). **`MenuScreen.tsx:54` is the one screen that doesn't
participate in this pattern at all** — it never reads `customer`, just the static
`USER.firstName` mock (Top Issues #2). This is the most actionable finding in this whole
cross-screen check.

### Deliberate, reasonable deviations from `design-reference/` (not bugs)

Recorded here so they're not mistaken for gaps by a future reader:

- Real `money(price, currencyCode)` formatting replacing every hardcoded `$` price in the mockup
  (`data.ts:11-12` and its call sites) — real data correctly replacing static mock content. (The
  *locale-handling* of `money()` itself is flagged separately above, Top Issues #10 — that's a
  distinct, narrower issue from "should it be real data at all," which is clearly yes.)
- Real, filterable categories replacing the mockup's 4 static chips (`docs/sessions/011`).
- `PhoneFrame.tsx`'s removal of the mockup's device-bezel chrome — explicitly documented in-code
  as an intentional "real responsive app, not a device mockup" choice.
- `RewardsScreen`/`AccountScreen`/`CheckoutScreen` all correctly wiring to the real `customer` where
  the mockup only ever showed a static "ALEX" — genuine improvements over the mockup baseline.
- Checkout, Order Confirmation, and Account screens have no mockup baseline at all (the
  design-reference bundle predates auth/checkout entirely, per `docs/sessions/012`) — evaluated on
  internal consistency with the rest of the app's visual language instead, per this document's
  per-screen sections above.
- Extras/loyalty stars/pickup ETA/ratings remaining static/mocked — all pre-existing, documented
  gaps from `docs/sessions/011`'s "no first-class Medusa equivalent" list. Not re-litigated here as
  new findings, only referenced where they explain why an adjacent control (e.g. the pickup-row
  chevron) has nothing real to do.
- Phone-required login, email-required signup, and the absence of postal-code/country fields in
  checkout are all settled product decisions from `docs/sessions/014` — confirmed consistent
  throughout `CheckoutScreen`/`AccountScreen`, not flagged as bugs anywhere in this document.

---

## Testid conventions (confirmed, informational only)

No new testids are proposed by this document — this is a review of existing UI, not a build spec.
For reference, the conventions already established and confirmed in use across
`new-storefront/e2e/*.spec.ts` and the screen components are: kebab-case, action/entity-first
(`checkout-login-nudge`, `checkout-login-nudge-dismiss`, `shipping-option` +
`data-selected` for its state, `cart-item`/`cart-item-extra`, `featured-quick-add-button` vs.
`quick-add-button`, `redeem-reward-button`/`redeem-error`/`redeem-confirmation`,
`no-orders-message`/`no-activity-message`). Any future implementation work on the findings above
should follow this existing convention rather than inventing a new one.
