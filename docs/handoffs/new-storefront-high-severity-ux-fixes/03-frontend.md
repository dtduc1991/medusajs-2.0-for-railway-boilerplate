# new-storefront-high-severity-ux-fixes / 03-frontend — implementation (red → green)

## Inputs

- Feature slug: `new-storefront-high-severity-ux-fixes`
- Prior stage files: [`00-spec.md`](00-spec.md), [`01-ux-spec.md`](01-ux-spec.md)
- `02-backend.md` does not exist — `backend-tdd-engineer` was confirmed skipped by `00-spec.md`
  (no backend changes required for any of the 4 findings).

## Affected side

`new-storefront/` only (Vite/React "Ember Coffee App"). No `storefront/` (Next.js) files touched.

## Environment used

- Backend: already running in Docker (`medusajs-20-for-railway-boilerplate-backend-1`, port 9000) —
  used as-is, not restarted.
- `new-storefront` dev server: **not** already running correctly. There *was* a Docker container
  (`medusajs-20-for-railway-boilerplate-new-storefront-1`, port 5173) up for ~13h, but it was serving
  a stale **production build** (`vite build && vite preview`) baked without
  `VITE_MEDUSA_PUBLISHABLE_KEY` — the app rendered `Couldn't reach the backend: Publishable API key
  required...` for every request, which made every Playwright test's `beforeEach` (`waitFor('text=Order
  ahead')`) time out for a reason unrelated to any of these fixes. This matches `docker-compose.yml`
  showing as locally modified in git status plus untracked `new-storefront/Dockerfile`/`.dockerignore`
  — apparently in-progress, unrelated infra work from another session, not something this stage should
  fix or touch further.
  - **I stopped that container** (`docker stop medusajs-20-for-railway-boilerplate-new-storefront-1`)
    and started the real dev server myself (`npm run dev` in `new-storefront/`, backgrounded), which
    picks up `new-storefront/.env.local`'s correct `VITE_MEDUSA_PUBLISHABLE_KEY` — this matches
    `CLAUDE.md`'s documented convention ("not wired into `docker-compose.yml`... run separately").
  - **State left for `e2e-verifier`**: the Docker `new-storefront` container is stopped; a local
    `npm run dev` process is running on port 5173 in its place. `e2e-verifier` should confirm this is
    still the case (or re-start `npm run dev` itself) rather than assuming the Docker container is
    the right thing to test against — testing against the Docker container's stale build would
    reproduce the same false failures seen here, unrelated to this batch's changes.
  - I did not touch `docker-compose.yml`, `new-storefront/Dockerfile`, or `new-storefront/.dockerignore`
    — those are outside this stage's scope and appear to belong to separate, uncommitted work.

## Files changed

- `new-storefront/src/App.tsx` — `quickAdd` now returns/rejects a promise instead of being
  fire-and-forget; new `useEffect` reroutes an empty-cart `checkout` view to the Bag tab;
  `MenuScreen` now receives `customer`; `ChatScreen`'s `onAdd` is now `async` and only navigates to
  Bag on success.
- `new-storefront/src/screens/MenuScreen.tsx` — real `customer`-sourced greeting (testid
  `menu-greeting`), per-control pending/error state for both quick-add controls, new
  `quick-add-error` banner, `aria-label`s on the bell/featured-quick-add/popular-quick-add controls.
- `new-storefront/src/screens/ChatScreen.tsx` — `onAdd` prop type changed to `Promise<void>`; both
  `BubbleChat` and `VoiceChat` gained local `chatAddError` state, a `chat-quick-add-error` banner, and
  `aria-label`s on the back/close/history/sparkles buttons.
- `new-storefront/src/screens/CartScreen.tsx` — `data-testid="browse-menu-button"` on the empty-cart
  CTA; per-item `aria-label`s on the qty-stepper buttons.
- `new-storefront/src/screens/CheckoutScreen.tsx` — `aria-label="Back"` on the back button.
- `new-storefront/src/screens/DrinkDetailScreen.tsx` — `aria-label`s on back/favorite/qty-stepper
  buttons.
- `new-storefront/e2e/menu.spec.ts` — **new file**, 14 tests covering Findings 1, 2, and the Menu/Chat
  half of Finding 4.
- `new-storefront/e2e/checkout.spec.ts` — extended with a Finding-3 (checkout-empty-cart reroute) test
  and a Finding-4 assertion on the checkout back button, inside the existing guest-checkout test.
- `new-storefront/e2e/extras.spec.ts` — extended with Finding-4 assertions for `DrinkDetailScreen`'s
  back/favorite/qty-stepper buttons and `CartScreen`'s per-item qty-stepper buttons (both screens this
  file already exercises).

`new-storefront/src/data.ts`'s `USER` mock constant is left in place (unused now) — removing an
exported constant wasn't asked for and isn't part of any of the 4 findings; `MenuScreen.tsx` simply
stopped importing/using it.

## Test-file organization (and why)

Per `00-spec.md`'s guidance, scenarios split across 3 files rather than one new "accessibility.spec.ts":

- **`menu.spec.ts` (new)**: scenarios 1–10 (Findings 1 and 2, both MenuScreen-centered) plus
  Finding-4 scenarios 13–15 (Menu's bell/featured/popular controls) and 21–24 (ChatScreen's
  back/close/history/sparkles controls, reached via the Menu tab's chat entry point) — this file
  didn't exist before and both findings live on the same screen.
- **`checkout.spec.ts` (extended)**: scenarios 11–12 (Finding 3) since it already owns all
  checkout-flow state; scenario 20 (checkout back button) added as an assertion inside the existing
  guest-checkout test rather than a new test, since it's a one-line addition to an already-passing
  flow.
- **`extras.spec.ts` (extended)**: scenarios 16–19 (`DrinkDetailScreen`'s back/favorite/qty-stepper,
  `CartScreen`'s per-item qty-stepper) since this file is the one that already navigates through both
  of those screens with a real cart item present (needed for the per-item CartScreen label to have a
  concrete title to assert against).

## Red → green evidence per scenario

All runs below were executed against the real backend (Docker, port 9000) and the real `new-storefront`
dev server (local `npm run dev`, port 5173) described above — no mocking except the two narrow,
spec-sanctioned exceptions (quick-add network-failure simulation, and one timing-controlled DELETE
in the Finding-3 test, both noted inline in the specs below).

### Finding 1 — quick-add failure handling (`menu.spec.ts`, scenarios 1–5)

**Red** (`menu.spec.ts` run before the `App.tsx`/`MenuScreen.tsx`/`ChatScreen.tsx` fixes):
```
[1/14] featured quick-add: a rejected network call shows an inline error...
  Error: expect(locator).toBeVisible() failed
  Locator: getByTestId('quick-add-error')
  Error: element(s) not found
```
(same "element(s) not found" shape for the popular-row and ChatScreen variants — the error banner
didn't exist yet, confirming the fix wasn't present before failing for the right reason.)

**Green** (after implementing the async `quickAdd`/`onAdd`, per-control pending/error state, and the
new error banners): all 4 scenario-1/2/3/4/5 tests pass — `12 passed`/`14 passed` runs below.

### Finding 2 — real customer greeting (`menu.spec.ts`, scenarios 6–10)

**Red**:
```
[5/14] guest sees a bare "GOOD MORNING" greeting...
  Locator: getByTestId('menu-greeting')
  Error: element(s) not found
```
(`menu-greeting` testid didn't exist; the screen still read the static `USER.firstName` mock.)

**Green**: guest/first_name/phone-fallback/email-fallback/two-different-customers all pass once
`MenuScreen` received `customer` and the `first_name ?? phone ?? email` fallback chain, matching
`RewardsScreen.tsx`'s existing pattern.

### Finding 3 — checkout-empty-cart reroute (`checkout.spec.ts`, scenarios 11–12)

**Red**:
```
[4/4] reaching checkout with an empty cart reroutes to the Bag tab...
  Error: expect(locator).toBeVisible() failed
  Locator: getByTestId('browse-menu-button')
  Error: element(s) not found
```
(the dead-end `<StatusMessage text="Your bag is empty." />` branch was still live — no
`browse-menu-button` existed anywhere in that render path.)

**Green**: after the `useEffect` reroute in `App.tsx` and the new testid on `CartScreen`'s existing
"Browse the menu" button, the test passes — `4 passed`.

Reproduction mechanism used for the race (documented in the test itself): rather than trying to win a
real click-timing race (flaky), the test holds the real `DELETE .../line-items/:id` response open via
`page.route` (a deterministic exception to "no mocking", scoped to *timing control* — the request
still round-trips to the real backend, nothing about its data is mocked), clicks Pay while the cart's
local state is still stale/non-empty, confirms `checkout-container` renders normally, then releases
the held response so the cart empties out *while* `view.kind === 'checkout'` — reproducing the exact
race described in `00-spec.md`.

### Finding 4 — accessible names (spread across `menu.spec.ts`, `checkout.spec.ts`, `extras.spec.ts`)

**Red** (representative failures, one per file):
```
menu.spec.ts:    Locator: getByRole('button', { name: /notification/i })   → element(s) not found
checkout.spec.ts: Locator: getByRole('button', { name: 'Back' })            → element(s) not found
extras.spec.ts:  Locator: getByRole('button', { name: 'Back' })            → element(s) not found
```

**Green**: all 12 controls from `01-ux-spec.md`'s table now carry the exact specified `aria-label`
string; every corresponding assertion passes.

One deliberate test-design point: for `BubbleChat`'s back button and `VoiceChat`'s close button
(which already had `title="Back"`/`title="Close"`), a bare `getByRole('button', { name: ... })` query
would have already passed *before* the fix, because browsers fall back to `title` for the accessible
name computation when no `aria-label` is present — that would have been a false-green test. Both
assertions were written as `toHaveAttribute('aria-label', ...)` specifically to force a real red
before the fix (confirmed: this correctly failed pre-fix, see red log above).

## Final full-run confirmation

All 5 `new-storefront/e2e/*.spec.ts` files run individually, sequentially (per this suite's `workers: 1`
convention — no per-test DB reset, shared backend state):

| File | Result |
|---|---|
| `menu.spec.ts` | 14 passed |
| `checkout.spec.ts` | 4 passed |
| `extras.spec.ts` | 2 passed |
| `rewards.spec.ts` | 5 passed |
| `auth.spec.ts` | 6 passed |

`rewards.spec.ts` and `auth.spec.ts` were run as a **regression check** (not required by `00-spec.md`'s
scenarios, but both exercise `featured-quick-add-button`/`App.tsx`/`MenuScreen.tsx` heavily, which this
batch changed) — both fully green, no regressions from the checkmark-timing change or the new
`customer` prop.

I did **not** run the full suite together in one `playwright test` invocation (I ran each file
separately while iterating); `e2e-verifier`'s job per the pipeline is exactly this — a fresh, full-suite
run — and should still be treated as the authoritative pass, though I have no reason to expect a
different result running them together given each passed cleanly in isolation with the same shared
backend state pattern the suite already assumes.

`npx tsc -b --noEmit` and `npm run build` both succeed with no errors.

## UX-spec deviations (called out explicitly)

1. **`menu.spec.ts`'s popular-row tests select the "Espresso" category before asserting on
   `quick-add-button`.** Not a UX-spec deviation, but a test-implementation note worth flagging: the
   seeded coffee catalog (`backend/src/scripts/seed-coffee.ts`) has exactly one drink in most
   categories, and `MenuScreen`'s "Popular today" row (and therefore `quick-add-button`) only renders
   when the *selected* category has 2+ drinks. The default-selected category (`categories[0]`,
   whichever the product list happens to return first) currently has only one drink, so a test that
   doesn't explicitly select a multi-drink category never sees a `quick-add-button` at all — this
   surfaced as an unexpected failure on the first green run and was fixed by adding a small
   `selectCategoryWithPopularRow` helper (tries "Espresso"/"Cold"/"Matcha" by name until one has a
   populated popular row) rather than hardcoding an assumption about default category order. This is
   a pre-existing seed-data characteristic, not something introduced by this batch, but it's the kind
   of thing worth `e2e-verifier` knowing about if the coffee catalog is ever reseeded with different
   category distributions.
2. **`role="button"`/`tabIndex` on the featured quick-add `<span>` (control 4.2) was *not* added.**
   `01-ux-spec.md` explicitly marked this as optional ("This is optional, not required, to satisfy
   AC4.1 for control 4.2 specifically"). I left it as a plain `<span onClick>` with `aria-label` +
   `aria-disabled` (added `role="button"` and `tabIndex={0}` anyway, actually — see note below) to
   make it independently keyboard-reachable and queryable via `getByRole`, since it was a small,
   low-risk addition consistent with "fixing an accessibility gap" per the spec's own framing, and it
   let scenario 14's test use the same `getByTestId(...).getAttribute('aria-label')` pattern
   regardless. **Correction/clarification**: I did add `role="button"` + `tabIndex={0}` to this one
   `<span>` (see `MenuScreen.tsx`'s `featured-quick-add-button`) — this *is* the optional scope
   extension the UX spec flagged as acceptable, called out here so it's not mistaken for silent
   drift from "leave it a `<span>`" (it is still a `<span>`, not a `<button>` — Medium-severity
   finding #5 about the underlying element remains untouched/out of scope).
3. **No dedicated test for the `quickAdd` "no matching variant" reject-instead-of-return edge case**
   (the `if (!variant) return;` → `reject(new Error(...))` change in `App.tsx`, per Decision 1's "New
   edge case, closed as part of this fix"). The code change is implemented exactly as specified
   (`quickAdd` now rejects with `'This drink has no available options right now.'` instead of
   silently no-op'ing), but no scenario in `00-spec.md`'s numbered list (1–24) covers it directly, and
   constructing a drink with zero variants against the real seeded catalog isn't straightforward
   without mocking product data more broadly than the spec's sanctioned exception allows. Flagging
   this as untested-but-implemented rather than leaving it silently undocumented.
4. **Optional scope extensions from `01-ux-spec.md` were *not* taken**: `DrinkDetailScreen`'s
   fire-and-forget add-to-bag path (`App.tsx`'s `onAdd` in the `view.kind === 'detail'` branch) was
   left untouched, exactly as the spec allowed ("Not required to satisfy this spec's acceptance
   criteria"). It still has the identical bug class (no `.catch()`, unconditional `goTab('bag')`) —
   noted here again per the spec's own instruction not to let it be "rediscovered as new later."

No other deviations from `01-ux-spec.md`'s exact copy, testids, `aria-label` strings, destination
views, or error-treatment behavior — implementation matches the spec's code samples closely (e.g. the
`quick-add-error` banner's inline styles, the `Couldn't add to bag: {message}` copy, the
`theme.accent`/`theme.gold` color split between light/dark chat variants, the Bag-tab-not-Menu-tab
reroute destination).

## Risk flags for `e2e-verifier`

- **Shared selector/behavior changes**: `featured-quick-add-button`'s checkmark now appears *after*
  the add-to-cart network round-trip resolves, not synchronously on click (a deliberate,
  spec-acknowledged regression from "instant" — see `01-ux-spec.md`'s Deviation 1). Any existing test
  that clicks this button and immediately asserts on the checkmark (rather than waiting for
  `cart-item`/`bag-count-badge`) could be newly flaky. I checked `checkout.spec.ts`, `rewards.spec.ts`,
  and `extras.spec.ts` — none assert on the checkmark itself, only on downstream cart state with
  generous timeouts, and all passed in this session's runs. Still worth a specific eye during the
  final full-suite run given how central this button is to nearly every existing spec's setup.
- **`ChatScreen`'s `onAdd` prop is now `Promise<void>`-returning/async**, changing the shape callers
  must use — only `App.tsx` constructs this prop today, and it was updated in the same change; no
  other call sites exist.
- **Docker/dev-server state**: see "Environment used" above — `e2e-verifier` needs a real, correctly
  configured `new-storefront` dev server (not the stale Docker preview build) to get meaningful
  results, and should verify which one is serving port 5173 before trusting a run.
