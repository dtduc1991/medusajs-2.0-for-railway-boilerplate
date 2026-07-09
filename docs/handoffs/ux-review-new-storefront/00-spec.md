# ux-review-new-storefront / 00-spec — UX/UI audit scope for the existing `new-storefront/` app

## Inputs

- Feature slug: `ux-review-new-storefront`
- Prior stage file: none (first stage)
- Request (paraphrased): audit the existing `new-storefront/` (Vite/React "Ember Coffee App")
  storefront for UX/UI quality — this is a **review**, not a new feature. No product code changes
  in this pipeline run.

## What kind of pipeline run this is

**This is a review-only run of the pipeline, not a feature build.** Normal runs turn a feature
request into acceptance criteria/test scenarios that `backend-tdd-engineer`/`frontend-tdd-engineer`
implement against under TDD. There is no new behavior being specified here — the deliverable is an
**audit report** of the UI/UX that already exists in `new-storefront/`, produced by the
`ux-designer` stage. No code is written or edited by any stage in this run.

## Scope

- **In scope**: `new-storefront/` only (the Vite/React "Ember Coffee App" — screens, components,
  routing/state in `App.tsx`, and how the rendered UI compares to
  `new-storefront/design-reference/`).
- **Out of scope**: `storefront/` (Next.js) and `backend/`. Not because they're irrelevant to UX in
  general, but because the request that triggered this run is specifically about `new-storefront/`
  (per `CLAUDE.md`, this is "the actively-developed frontend" — see `docs/sessions/011` through
  `014`). If a reviewer wants `storefront/` audited too, that is a separate pipeline run with its own
  `00-spec.md`.
- Existing `docs/flows/*.md` (`checkout-flow.md`, `cart-promotions-flow.md`,
  `browse-search-pdp-flow.md`, `storefront-backend-api-surface.md`) are standing UX reference docs
  written against `storefront/` (Next.js), **not** `new-storefront/`. They are still useful here as
  comparison points anywhere `new-storefront/` implements the same underlying commerce flow
  (checkout, cart/promo, browse/PDP) with different UI/interaction choices — the ux-designer stage
  should check whether `new-storefront/`'s handling of the edge cases those docs already found (e.g.
  promo-code error states, empty cart, shipping-option loading) is at least as good, and flag it if
  not. These docs are read-only inputs for comparison; this run does not update them (this run
  doesn't touch `storefront/` at all).

## Affected sides / stage plan for this run

- **Affected side**: `new-storefront/` (UI/UX audit only — no backend, no `storefront/`).
- **Stage 1 — feature-planner**: this file. Done.
- **Stage 2 — ux-designer**: RUNS. Reads this file and produces
  `docs/handoffs/ux-review-new-storefront/01-ux-spec.md`. For this run, that file **is the
  deliverable** — the audit report itself, not a pre-implementation spec for a later build stage to
  satisfy. It should read like `docs/flows/*.md` (dense, file:line-grounded, a "States & edge cases"
  register) rather than like a normal `01-ux-spec.md` (which usually hands off requirements to
  `frontend-tdd-engineer`).
- **Stage 3 — backend-tdd-engineer: SKIPPED.** Reason: review-only, no code changes. No backend
  behavior is being built or altered by this pipeline run.
- **Stage 4 — frontend-tdd-engineer: SKIPPED.** Reason: review-only, no code changes. Nothing in
  `01-ux-spec.md` is meant to be implemented by this run; any issues it surfaces are candidate future
  feature requests (each would get its own `00-spec.md` if picked up later).
- **Stage 5 — e2e-verifier: SKIPPED.** Reason: review-only, no code changes — there is nothing to
  run Playwright against that isn't already covered by the existing `new-storefront/e2e/` suite, and
  no new/changed behavior to verify. The pipeline **ends after `ux-designer`** for this run. Do not
  write a `docs/sessions/NNN-*.md` rollup expecting a verification stage; if a rollup is wanted, it
  should describe this as "audit produced, no implementation," and should link `01-ux-spec.md`
  directly.

## Review scope for the ux-designer stage

Enumerate everything the audit must cover. This replaces the usual "acceptance criteria / test
scenarios" section (not applicable to a review with no new behavior).

### Screens (`new-storefront/src/screens/`, 8 files — confirmed present)

1. `MenuScreen.tsx` — browse/order-ahead home: store header, decorative search bar (`placeholder`
   only, no keydown/filter wiring — verify at review time whether this is intentional or a known
   gap), category chips, featured drink card, popular-today list with quick-add.
2. `DrinkDetailScreen.tsx` — PDP/customize: hero image, Iced/Hot toggle (verify whether it affects
   price/variant or is cosmetic), size/milk selectors, extras toggles, sticky add-to-bag CTA.
3. `CartScreen.tsx` — bag: empty state, pickup info row, line items + extras grouping, promo code
   apply/error, summary (subtotal/tax/stars estimate), pay CTA.
4. `CheckoutScreen.tsx` — guest login nudge (dismissible), prefill from `customer.defaultAddress`
   with "use a different address" override, contact/address fields (phone required, no postal
   code/country — see `docs/sessions/014-*.md` for why), delivery-method loading/selection, place
   order, inline error state.
5. `OrderConfirmationScreen.tsx` — success state after checkout.
6. `RewardsScreen.tsx` — logged-out prompt vs. logged-in loyalty content: star balance card,
   progress bar, redeem CTA (thresholded), redeem success/error, static "offers" cards, activity
   list with its own loading/empty/error states.
7. `AccountScreen.tsx` — logged-out `AuthForm` (login: single identifier field for phone-or-email;
   signup: phone required, email required, address/city required) vs. logged-in `Profile` (name/
   phone/email fallback chain, order history with loading/empty/error, logout).
8. `ChatScreen.tsx` — two explicitly-mocked variants (`BubbleChat` light, `VoiceChat` dark/voice) —
   note in code (`ChatScreen.tsx:20-22`) that this is a **canned recommendation only, not a real
   assistant**; review as a UI/interaction surface, not as working AI chat.

### Routing/state (`new-storefront/src/App.tsx`)

- Top-level `view` state machine (`tab` / `detail` / `checkout` / `orderConfirmation`) and its
  transitions — review whether back/forward navigation, tab-bar visibility (hidden during chat),
  and the checkout guard (`cart && cart.items.length > 0`, else `"Your bag is empty."`) are
  consistent and discoverable.
- Global loading (`"Loading menu…"`) and error (`"Couldn't reach the backend: …"`) states shown in
  place of the entire app shell — review whether these are adequate or too coarse (e.g. no retry
  affordance).
- Shared components: `new-storefront/src/components/PhoneFrame.tsx`, `TabBar.tsx`, `Icon.tsx`,
  `Placeholder.tsx` — review for consistency of use across screens.

### Comparison baseline

- `new-storefront/design-reference/Ember Coffee App.dc.html` (+ `support.js`) — the original mockup,
  6 screens + 2 chat directions per its own intro block. Confirmed concrete deviations already
  visible from a first pass (ux-designer must verify with real file:line refs and decide if they're
  intentional or drift, not just restate these):
  - Mockup prices are hardcoded in `$` (e.g. `$5.75` for the featured drink) while the shipped app
    renders `money(price, currencyCode)` off the real cart/product currency (`eur`, per the seeded
    region) — worth flagging as a mockup-vs-real-data mismatch, not necessarily an app bug.
  - Mockup's featured-card badge reads "EDITOR'S PICK"; the shipped `MenuScreen.tsx` renders
    "FEATURED" instead (`MenuScreen.tsx:144`) — a copy deviation from the reference, undocumented as
    intentional anywhere found so far.
- `docs/flows/checkout-flow.md`, `docs/flows/cart-promotions-flow.md`,
  `docs/flows/browse-search-pdp-flow.md` — standing edge-case registers for the *other* storefront's
  equivalent flows. Use only as a checklist of edge-case categories to check for
  (empty/loading/error/promo-failure/etc.), not as a source of truth for what `new-storefront/`
  should look like.

## What the ux-designer stage should evaluate

For each screen above, produce a `docs/flows/`-style section covering:

1. **Visual/interaction consistency vs. `design-reference/`** — does the shipped screen match the
   mockup's layout, copy, iconography, and interaction affordances? Call out every deviation found,
   with file:line on both sides (shipped TSX and the `.dc.html` mockup section), and judge whether
   each is a deliberate, reasonable divergence (e.g. real data replacing a static mock) or drift.
2. **States & edge cases** — loading, empty, error, and success for every screen that fetches data
   or submits an action (menu/extras fetch, cart mutations, promo apply, checkout address/shipping/
   place-order, rewards account/redeem, order history, login/signup). Note anything with no visible
   loading indicator, no error surface, or a dead-end error (e.g. an error state with no retry path).
3. **Non-functional/decorative controls** — elements that look interactive but have no handler or no
   effect, found by reading the code (e.g. `MenuScreen`'s search input, notification bell, "See all"
   link; `DrinkDetailScreen`'s heart/favorite button and Iced/Hot toggle's actual effect on
   price/variant; `CartScreen`'s "Edit" label and pickup-row chevron). Confirm each with a file:line
   reference rather than assuming from this list — this list is a starting point for the audit, not
   a substitute for it.
4. **Accessibility** — keyboard reachability of all interactive elements (many are styled `<button>`s
   or `<span onClick>`s — check which), focus handling for the dismissible checkout nudge and any
   modal-like states, label/aria associations for form inputs (checkout and auth forms use bare
   `<input placeholder=...>` with no associated `<label>` — verify and flag), color-contrast for
   text-on-accent/text-on-dark combinations (e.g. `ChatScreen`'s dark voice variant), and whether
   `data-testid`-only elements have any accessible name for screen readers.
5. **Copy clarity** — review all user-facing strings (headers, empty states, error messages, CTA
   labels, the guest checkout nudge, the rewards redeem-result messages) for clarity and consistency
   of voice/tone across screens.
6. **Cross-screen consistency** — e.g. the customer-display-name fallback chain
   (`first_name → phone → email`) is implemented separately in `RewardsScreen.tsx` and
   `AccountScreen.tsx`/`CheckoutScreen.tsx` — check they actually agree; `MenuScreen.tsx`'s greeting
   uses a static `USER.firstName` from `new-storefront/src/data.ts` rather than the real logged-in
   `customer` — flag as a likely inconsistency (greets "Alex" regardless of who's actually logged in
   or logged out) with file:line.

Every issue raised must have a concrete file:line reference (shipped code and/or mockup). No
hypothetical/speculative issues — this mirrors the existing `docs/flows/`'s "States & edge cases"
register convention (real bugs found by reading code, not guessed).

## Known constraints (bound the audit, don't block it)

- Only a `eur`/Europe region is seeded (`backend/src/scripts/seed.ts`, now includes `vn` per
  `docs/sessions/014`) — any pricing/currency observations should account for this; there is no
  `usd` region to compare against.
- `new-storefront/` is not wired into `docker-compose.yml`; run separately (`npm run dev`, backend
  on `:9000`) if the ux-designer stage wants to interact with the live app rather than read code
  only — either is acceptable for this audit, but empirical checks (per `docs/agent-workflow.md`'s
  general preference for verifying rather than assuming) are preferred where feasible.
- Per `docs/sessions/014-*.md`: phone is the required, primary login identifier; email is required
  at signup (reversed from an earlier "optional" decision — see that session's item 6); checkout has
  no postal code/country fields (country is hardcoded to `vn` internally, never shown in the UI).
  These are settled product decisions, not audit findings — don't re-flag them as bugs unless the UI
  itself is inconsistent with them (e.g. leftover copy referencing postal code).
- `ChatScreen.tsx` is explicitly, permanently mock/canned (see its own code comment) — this is a
  known, intentional scope boundary from the original backend-wiring work
  (`docs/sessions/011-new-storefront-backend-wiring.md`), not a gap to flag as "unimplemented."
  Audit it as a UI surface (states, accessibility, consistency between its two variants) rather than
  faulting it for not being a real assistant.

## Handoff — next stage

Next stage: `ux-designer`, invoked with slug `ux-review-new-storefront`, producing
`docs/handoffs/ux-review-new-storefront/01-ux-spec.md` as the audit deliverable itself. After
`ux-designer` finishes, this pipeline run is complete — `backend-tdd-engineer`,
`frontend-tdd-engineer`, and `e2e-verifier` are all skipped per the reasons stated above. Do not
invoke them for this slug.
