# new-storefront-high-severity-ux-fixes / 00-spec — bugfix batch: 4 High-severity UX audit findings

## Inputs

- Feature slug: `new-storefront-high-severity-ux-fixes`
- Prior stage file: none (first stage of this pipeline run). Source material is a *different*
  pipeline run's deliverable: [`docs/handoffs/ux-review-new-storefront/01-ux-spec.md`](../ux-review-new-storefront/01-ux-spec.md)
  (the "Top issues (prioritized)" table, rows 1-4, and their corresponding per-screen sections).
- Request (paraphrased): pick up the 4 **High**-severity findings from that audit and run them
  through the standard TDD pipeline (`docs/agent-workflow.md`) as a bugfix batch. This is **not** a
  new feature — no new product capability is being added, only defects fixed in existing UI.

## What kind of pipeline run this is

A normal bugfix run of the full 5-stage pipeline. Unlike the audit run that produced
`ux-review-new-storefront/01-ux-spec.md` (which ended after `ux-designer` with no code changes),
this run **does** implement changes: `ux-designer` → `frontend-tdd-engineer` → `e2e-verifier` all
execute. `backend-tdd-engineer` is skipped — see "Stage skipping" below for why.

## The 4 findings in scope (verified against current source, line numbers re-checked)

### Finding 1 — Silent quick-add failure (High)

- `new-storefront/src/App.tsx:73-76` (`addVariantToCart`) and `:84-88` (`quickAdd`): `quickAdd` calls
  `void addVariantToCart(variant.id, 1)` — fire-and-forget, no `.catch()` anywhere in the chain.
  `addVariantToCart` itself has no try/catch either, so a rejection from `addLineItem`
  (`new-storefront/src/lib/backend.ts:179-183`) becomes an unhandled promise rejection, not a
  surfaced UI error.
- `new-storefront/src/screens/MenuScreen.tsx:154-181` (`featured-quick-add-button`, currently a
  `<span onClick>`, not a `<button>` — see Medium-severity finding #5, explicitly out of scope for
  this batch) and `:200-224` (`quick-add-button`, a real `<button>`): both set local `justAdded`/
  `justAddedId` state and flip the plus icon to a checkmark **synchronously on click**, independent
  of whether `onQuickAdd(drink)` (→ `quickAdd` → `addVariantToCart` → `addLineItem`) actually
  resolves or rejects.
- Net effect: on a rejected `addLineItem` call (network blip, stock issue, stale cart id, etc.), the
  user sees a false-positive checkmark and the bag count (`App.tsx:69`, derived from `cart.items`)
  never updates, with no error surfaced anywhere.
- `quickAdd` is also invoked from `ChatScreen` (`App.tsx:212-215`, wired to `ChatScreen`'s recommendation
  card and "Add to bag" quick-reply) — same underlying bug, but `ChatScreen` shows no optimistic
  checkmark at all today, so the user-visible symptom there is just "nothing happens, no bag update,
  no error," not a false success. Included as a secondary scenario below since it shares the same
  root cause and root fix (making `addVariantToCart`/`quickAdd` error-aware), not because the audit
  named it as a separate High-severity finding.
- **Adjacent but explicitly out of scope for this batch**: `DrinkDetailScreen`'s add-to-bag path
  (`App.tsx:170-173`, `void addDrinkWithExtrasToCart(...)` immediately followed by `goTab('bag')`
  regardless of outcome) has the identical fire-and-forget pattern and the identical bug class, but
  was not named in the audit's 4 High findings (the audit flagged `DrinkDetailScreen`'s missing
  loading/error states as a separate, lower-priority item, not this exact issue). Noting it here so
  it isn't rediscovered as "new" later — if `ux-designer`/`frontend-tdd-engineer` want to fix it in
  the same pass because the root cause and root fix (an error-aware `addVariantToCart`/
  `addDrinkWithExtrasToCart`) are shared, that's a reasonable scope extension to call out explicitly
  in `01-ux-spec.md`/`03-frontend.md` — but it is **not required** to satisfy this spec's acceptance
  criteria.

### Finding 2 — MenuScreen greeting uses static mock data (High)

- `new-storefront/src/screens/MenuScreen.tsx:53-55` renders
  `GOOD MORNING, {USER.firstName.toUpperCase()}` from `new-storefront/src/data.ts:9`
  (`export const USER = { firstName: 'Alex' }`).
- `MenuScreenProps` (`MenuScreen.tsx:8-13`) has no `customer` field, and `App.tsx:196-201` (where
  `<MenuScreen>` is rendered) does not pass one — even though `App.tsx:40` already holds a
  `customer: Customer | null` state, populated at mount by `getCurrentCustomer()`
  (`App.tsx:61`, `lib/auth.ts:115-122`) and already threaded into `RewardsScreen` (`App.tsx:204`),
  `CheckoutScreen` (`App.tsx:179`), and `AccountScreen` (`App.tsx:230`).
- **Confirmed: no new backend data is required.** The `Customer` type (`lib/auth.ts:4-11`) already
  carries `first_name`, `phone`, `email` — exactly what `RewardsScreen.tsx:87,101`
  (`customer.first_name ?? customer.phone ?? customer.email`) already uses for its own header badge.
  This fix is prop-plumbing (`App.tsx` → `MenuScreen`) plus adopting the existing fallback pattern —
  not a data-fetching change.
- Per the task instructions: prefer `RewardsScreen`'s compact single-line fallback style
  (`first_name ?? phone ?? email`) over `AccountScreen`'s (`[first_name, last_name].filter(Boolean).join(' ') || phone || email`),
  since Menu's greeting is compact chrome, not a full profile view.
- Open question for `ux-designer` to settle (not resolved by the audit or this spec): what the
  greeting should show for a **guest** (`customer === null`) — no hardcoded name of any kind is
  acceptable, but whether that means omitting the line, using a generic greeting with no name, or
  something else is a UX decision, not an engineering one.

### Finding 3 — Checkout dead end on empty cart (High)

- `new-storefront/src/App.tsx:175-189`: when `view.kind === 'checkout'`, the ternary checks
  `cart && cart.items.length > 0`; if false, it renders `<StatusMessage text="Your bag is empty." />`
  (defined at `App.tsx:242-248`) with **no** `TabBar` (`TabBar` only renders in the final `else`
  branch for `tab` views, `App.tsx:234`) and `StatusMessage` itself has no button, link, or any other
  affordance — a confirmed, code-verified dead end requiring an app reload to escape.
- Reachable via a plausible race (cart emptied out from under the user between pressing "Pay" and
  the checkout screen mounting — slow network + fast double-tap, or a cart cleared by another
  tab/session) — low likelihood, but a true dead end with zero recovery path.
- Minimum fix per the audit: a working way back to the menu/bag from this exact state. Two
  implementation shapes are both acceptable and it's `ux-designer`'s call which to spec:
  (a) add a "Back to menu"/"Back to bag" button to the `StatusMessage` rendered in this branch, or
  (b) skip rendering this state entirely and route straight back to the `bag` tab view
  (`goTab('bag')`) when this condition is hit. Either way, the `TabBar`-less, affordance-less
  dead-end state must not be reachable as a permanent stuck state after this fix.

### Finding 4 — Icon-only buttons missing `aria-label` (High)

Confirmed by re-reading current source (line numbers below match the file as read for this spec —
re-verify at implementation time in case of drift):

| # | Location | Control | Current state |
|---|---|---|---|
| 4.1 | `MenuScreen.tsx:49-51` | Bell icon button | No `aria-label`, no `onClick` (non-functional — out of scope to wire up) |
| 4.2 | `MenuScreen.tsx:154-181` | Featured quick-add (`<span onClick>`, not a `<button>`) | No `aria-label` |
| 4.3 | `MenuScreen.tsx:200-224` | Popular-row quick-add `<button>` | No `aria-label` |
| 4.4 | `DrinkDetailScreen.tsx:47-49` | Back arrow button | No `aria-label` |
| 4.5 | `DrinkDetailScreen.tsx:53-55` | Heart/favorite button | No `aria-label`, no `onClick` (non-functional — out of scope to wire up) |
| 4.6 | `DrinkDetailScreen.tsx:193-199` | Qty stepper (minus `:193`, plus `:197`) | No `aria-label` on either |
| 4.7 | `CartScreen.tsx:87-93` | Qty stepper (minus `:87`, plus `:91`) | No `aria-label` on either |
| 4.8 | `CheckoutScreen.tsx:120-122` | Back arrow button | No `aria-label` |
| 4.9 | `ChatScreen.tsx:82-84` (`BubbleChat`) | Back arrow button | Has `title="Back"` only, no `aria-label` |
| 4.10 | `ChatScreen.tsx:221-223` (`VoiceChat`) | Close (X) button | Has `title="Close"` only, no `aria-label` |
| 4.11 | `ChatScreen.tsx:228-230` (`VoiceChat`) | "History" icon button | No `aria-label`, no `onClick` (non-functional — out of scope to wire up) |
| 4.12 | `ChatScreen.tsx:297` (`VoiceChat`) | "Sparkles" icon button | No `aria-label`, no `onClick` (non-functional — out of scope to wire up) |

The one confirmed-correct existing example to use as the template:
`CheckoutScreen.tsx:151-158` (`checkout-login-nudge-dismiss`), which has `aria-label="Dismiss"`.

**Explicitly out of scope for this batch** (per the task instructions): whether to wire up the
non-functional buttons above (4.1, 4.5, 4.11, 4.12 — bell, heart, History, Sparkles) with real
`onClick` handlers, or remove them, is a separate Medium-severity concern from the audit
(`01-ux-spec.md`'s finding #7) and is **not** part of this slug. This batch only adds `aria-label`s
to make the buttons' existing (possibly no-op) state screen-reader-announceable; it does not change
what clicking them does.

## Affected sides / stage plan

- **Affected side**: `new-storefront/` only (Vite/React "Ember Coffee App"). No `storefront/`
  (Next.js) changes — none of the 4 findings touch that app.
- **Backend**: **no backend changes required**, confirmed by checking:
  - `new-storefront/src/lib/backend.ts` — `addLineItem` (the quick-add call, Finding 1) already
    exists and already returns/rejects a promise correctly; the bug is entirely in how the frontend
    (`App.tsx`) calls it (fire-and-forget, no `.catch()`), not in the backend call itself. No new
    endpoint or request shape needed.
  - `new-storefront/src/lib/auth.ts` — `Customer` (Finding 2) already carries `first_name`/`phone`/
    `email`, and `getCurrentCustomer()` is already called once at `App.tsx` mount and stored in
    `customer` state, already passed to 3 of 5 tab screens. No new fetch needed — this is prop
    plumbing plus a display-logic change.
  - Findings 3 and 4 are pure client-side routing/state (`App.tsx`) and JSX-attribute (`aria-label`)
    changes respectively — no backend interaction at all.

### Stage skipping

- **Stage 3 — `backend-tdd-engineer`: SKIPPED.** Reason: confirmed above — none of the 4 findings
  require a new backend endpoint, a changed request/response shape, or new data not already fetched
  by the existing `customer`/`cart` state. All 4 are frontend-only defects (error handling, prop
  plumbing, client routing, accessibility attributes).
- **Stage 2 — `ux-designer`: RUNS, not skipped.** This batch touches UI states (error surfacing for
  quick-add, a guest-vs-logged-in greeting fallback, a new/changed navigation affordance on the
  checkout-empty-cart state) and accessibility (exact `aria-label` copy for 12 controls) — real UX
  decisions, not mechanical fixes. `ux-designer` must produce `01-ux-spec.md` specifying:
  1. Exactly how quick-add failure is surfaced (inline error text near the control? a toast? where,
     and with what copy?) and confirm the checkmark must not appear until success.
  2. The exact guest-state behavior for the Menu greeting (see Finding 2's open question).
  3. The exact shape of the checkout-empty-cart fix (button-on-message vs. reroute-to-bag) and its
     copy/testid if a new button is introduced.
  4. The exact `aria-label` string for each of the 12 controls in the Finding 4 table.
  This must happen **before** `frontend-tdd-engineer` runs, per `docs/agent-workflow.md`.
- **Stage 4 — `frontend-tdd-engineer`: RUNS.** Implements all 4 fixes red→green against the test
  scenarios below, using Playwright as the TDD loop (no component-level test runner exists in
  `new-storefront/`, per `CLAUDE.md`).
- **Stage 5 — `e2e-verifier`: RUNS** (always, per the pipeline). Runs the full relevant
  `new-storefront/e2e/` suite against a real backend and spot-checks empirically (e.g. actually
  triggering a quick-add failure and confirming no false checkmark, not just trusting a passing
  assertion).

## Acceptance criteria & numbered test scenarios

These are the TDD contract — `frontend-tdd-engineer` should be able to write a failing Playwright
test directly from each numbered scenario.

### Finding 1 — quick-add failure handling

**AC1.1**: When the quick-add network call rejects, the UI does not show a success checkmark, does
not update the bag count, and surfaces a visible error to the user.

**AC1.2**: When the quick-add network call succeeds, existing behavior is preserved — the checkmark
shows and the bag count updates (regression coverage for the happy path already exercised
informally by `checkout.spec.ts`/`rewards.spec.ts`'s use of `featured-quick-add-button`).

Scenarios:

1. Given the featured-drink quick-add call is made to fail (simulate via Playwright route
   interception on the cart line-item creation request — e.g. `page.route(...)` aborting or
   returning a non-2xx for the `POST` that `sdk.store.cart.createLineItem` issues; this is a
   deliberate, scoped exception to the suite's usual "no mocking, real backend" convention, needed
   specifically to make a network failure reproducible on demand), when the user clicks
   `featured-quick-add-button` (`MenuScreen.tsx:154-181`), then: the plus icon does **not** flip to a
   checkmark, an error is visibly surfaced (exact treatment per `01-ux-spec.md`), and the bag tab's
   count badge does not increment.
2. Same as (1) but for the popular-row `quick-add-button` (`MenuScreen.tsx:200-224`).
3. Given the same failure simulation, when the user clicks quick-add, then no unhandled promise
   rejection is thrown (verify via Playwright's `page.on('pageerror', ...)`/console-error listener
   showing nothing new, distinguishing "silently swallowed" from "properly caught and surfaced").
4. Given a successful quick-add (no interception — real backend), when the user clicks either
   quick-add control, then the checkmark appears and, on navigating to the Bag tab, the item is
   present with the bag count badge incremented (happy-path regression, extending existing coverage
   in `checkout.spec.ts`'s `'guest can add a drink, check out...'` test rather than duplicating it).
5. (Secondary, same root cause) Given the quick-add call reachable from `ChatScreen`'s recommendation
   card / "Add to bag" quick reply is made to fail the same way, when the user clicks it, then an
   error is surfaced there too (or, at minimum, is no longer silently swallowed) — exact UI treatment
   for `ChatScreen` is `ux-designer`'s call, since `ChatScreen` currently has no optimistic checkmark
   to falsely show in the first place.

### Finding 2 — real customer greeting on MenuScreen

**AC2.1**: A logged-in customer sees their own name (via the fallback chain), never the literal
string "Alex", in the Menu screen greeting.

**AC2.2**: A logged-out (guest) visitor never sees any other customer's name, and never sees "Alex"
— the guest-state greeting behavior is whatever `ux-designer` specifies in `01-ux-spec.md`.

Scenarios:

6. Given a logged-in customer with a `first_name` set, when the Menu tab renders, then the greeting
   shows that customer's real first name (uppercased, per the existing `GOOD MORNING, {NAME}`
   format), sourced from the same `customer` prop already passed to `RewardsScreen`/`AccountScreen`/
   `CheckoutScreen`.
7. Given a logged-in customer with no `first_name` but a `phone`, when the Menu tab renders, then the
   greeting falls back to `phone` (matching `RewardsScreen.tsx:87,101`'s fallback order).
8. Given a logged-in customer with neither `first_name` nor `phone` but an `email`, when the Menu tab
   renders, then the greeting falls back to `email`.
9. Given no customer is logged in, when the Menu tab renders, then the greeting does not show
   "Alex" or any other specific customer's name — exact copy/behavior per `01-ux-spec.md`.
10. Regression: two different logged-in customers (e.g. the two distinct signups already used across
    `checkout.spec.ts`'s two tests, "Ada Lovelace" vs. "Grace Hopper") see two different greetings,
    proving the value is read from the real `customer`, not a shared static constant.

### Finding 3 — checkout-with-empty-cart navigation

**AC3.1**: Reaching `view.kind === 'checkout'` with an empty cart never leaves the user with zero
navigation options — a working control is always present that returns them to an interactive tab
view (menu or bag).

Scenarios:

11. Given the cart becomes empty while `view.kind === 'checkout'` (reproduce via whatever mechanism
    `frontend-tdd-engineer` finds most direct in this state-machine-in-a-single-component app — e.g.
    driving `App`'s state directly in a component-level way is not available since there's no
    component test runner, so this likely means emptying the cart via the UI/API immediately before
    or during the transition to the checkout view, or exercising the `StatusMessage`/reroute branch
    via whatever reproducible steps get `cart.items.length === 0` at that exact render), when the
    empty-cart-checkout state is rendered, then a visible, clickable affordance is present (button or
    equivalent) that is not just the bare "Your bag is empty." text.
12. Given that affordance is clicked (or, if the fix reroutes automatically, given the empty-cart
    checkout state is reached), then the user lands on a normal, interactive tab view (Menu or Bag)
    with the `TabBar` visible and functional — not stuck on the same dead-end screen.

### Finding 4 — accessible names on icon-only buttons

**AC4.1**: Each control listed in the Finding 4 table above is reachable via Playwright's
accessibility-tree queries by an accessible name (`page.getByRole('button', { name: /.../ })`), not
just by `data-testid`.

Scenarios (one per row of the Finding 4 table — exact label strings per `01-ux-spec.md`):

13. `MenuScreen`'s bell icon button has a non-empty `aria-label` (e.g. matching "notification"),
    verifiable via `page.getByRole('button', { name: /notification/i })`.
14. `MenuScreen`'s featured quick-add control has a non-empty `aria-label` distinguishing it as an
    add-to-bag action.
15. `MenuScreen`'s popular-row quick-add button(s) have a non-empty `aria-label` (ideally
    drink-specific, so multiple popular rows remain individually addressable by accessible name —
    `ux-designer` to confirm whether a generic or per-drink label is required).
16. `DrinkDetailScreen`'s back button has an `aria-label` (e.g. "Back").
17. `DrinkDetailScreen`'s heart/favorite button has a non-empty `aria-label`.
18. `DrinkDetailScreen`'s qty-stepper minus and plus buttons each have distinct, non-empty
    `aria-label`s (e.g. "Decrease quantity" / "Increase quantity").
19. `CartScreen`'s qty-stepper minus and plus buttons each have distinct, non-empty `aria-label`s.
20. `CheckoutScreen`'s back button has an `aria-label` (e.g. "Back") — matching the existing, correct
    `checkout-login-nudge-dismiss` pattern already in the same file.
21. `ChatScreen` `BubbleChat`'s back button has an `aria-label` (not just `title`).
22. `ChatScreen` `VoiceChat`'s close button has an `aria-label` (not just `title`).
23. `ChatScreen` `VoiceChat`'s "History" button has a non-empty `aria-label`.
24. `ChatScreen` `VoiceChat`'s "Sparkles" button has a non-empty `aria-label`.

## Existing e2e files to extend (do not assume new files are needed without checking first)

`new-storefront/e2e/` currently has exactly 4 spec files — confirmed via glob:
`auth.spec.ts`, `checkout.spec.ts`, `extras.spec.ts`, `rewards.spec.ts`. **There is no
`menu.spec.ts` today.** Recommendation for `frontend-tdd-engineer`:

- Scenarios 1-10 (Findings 1 and 2, both centered on `MenuScreen`) most naturally live in a new
  `new-storefront/e2e/menu.spec.ts` — there is currently no file that owns Menu-screen-specific
  behavior; `checkout.spec.ts`/`rewards.spec.ts` only pass through the Menu screen incidentally (to
  quick-add on their way to checkout/rewards flows). Creating `menu.spec.ts` is not "inventing a new
  file where one already fits" — verify this is still true at implementation time in case a later
  commit added one.
- Scenario 11-12 (Finding 3, checkout-empty-cart) fits naturally as an addition to
  `checkout.spec.ts`, which already owns all checkout-flow state (it already asserts on
  `checkout-container`, `checkout-login-nudge`, etc.).
- Scenarios 13-24 (Finding 4, aria-labels) can be spread across whichever spec file already exercises
  each screen (e.g. the back-button/qty-stepper checks fit naturally alongside `checkout.spec.ts`'s
  and a new `menu.spec.ts`'s existing flows) rather than requiring one big new "accessibility.spec.ts"
  — though a single new spec file scoped to accessibility assertions across screens is also a
  reasonable, defensible choice if `frontend-tdd-engineer` finds that cleaner; either is acceptable,
  but state the choice and reasoning in `03-frontend.md`.
- Follow the existing testid/naming conventions confirmed in `01-ux-spec.md`'s "Testid conventions"
  section (kebab-case, action/entity-first) for any new `data-testid`s this batch introduces (e.g. a
  new "back to menu" button on the checkout-empty-cart state, if that's the chosen fix shape).

## Known constraints

- Per `CLAUDE.md`: `new-storefront/` is not wired into `docker-compose.yml` — run it separately
  (`npm run dev`, backend on `:9000`) for local work and for `e2e-verifier`'s final run.
- Per `CLAUDE.md`/`docs/agent-workflow.md`: no component-level test runner exists in
  `new-storefront/` — Playwright against a real running app is the only TDD loop available, which is
  why Scenario 1/2/5 (simulating a network failure) require Playwright route interception as a
  narrow, deliberate exception to this suite's normal "real backend, no mocking" convention — this
  exception is scoped to *simulating a rejected network call*, not to mocking data generally; every
  other scenario in this spec should run against the real backend per existing convention.
- Only a `eur` region (plus `vn`, per `docs/sessions/014`) is seeded — not relevant to any of these 4
  fixes directly (none involve pricing/currency), noted only for completeness per this pipeline's
  standing constraints.
- `docs/sessions/011`/`014` document the settled patterns this batch must stay consistent with:
  phone-required login/email-required signup, the `customer.first_name ?? customer.phone ?? customer.email`
  fallback chain, and the existing e2e conventions (`uniquePhone()`/`uniqueEmail()` helpers, the
  `snap()` screenshot utility, one customer signup per test to avoid cross-test collisions).

## Handoff — next stage

Next stage: `ux-designer`, invoked with slug `new-storefront-high-severity-ux-fixes`, reading this
file and producing `docs/handoffs/new-storefront-high-severity-ux-fixes/01-ux-spec.md`. It must
resolve the 4 open UX decisions called out above (quick-add error treatment/copy, guest-greeting
behavior, checkout-empty-cart fix shape, exact `aria-label` strings for all 12 controls) before
`frontend-tdd-engineer` runs.
