# new-storefront-high-severity-ux-fixes / 01-ux-spec — resolved UX decisions for the 4 High-severity fixes

## Inputs

- Feature slug: `new-storefront-high-severity-ux-fixes`
- Prior stage file: [`00-spec.md`](00-spec.md)
- This stage was asked to resolve the 4 open UX decisions `00-spec.md` explicitly deferred to
  `ux-designer` (quick-add error treatment/copy, guest-greeting behavior, checkout-empty-cart fix
  shape, exact `aria-label` strings for 12 controls) so `frontend-tdd-engineer` can implement
  directly against concrete behavior. Affected side: `new-storefront/` only (per `00-spec.md`'s
  "Affected sides" section) — no `storefront/` (Next.js) changes in this batch.

## Method

Read every screen file named in `00-spec.md`'s Finding 1–4 tables in full
(`new-storefront/src/App.tsx`, `MenuScreen.tsx`, `DrinkDetailScreen.tsx`, `CartScreen.tsx`,
`CheckoutScreen.tsx`, `ChatScreen.tsx`, `RewardsScreen.tsx`, `AccountScreen.tsx`, `TabBar.tsx`),
`new-storefront/src/theme.ts`, `new-storefront/src/types.ts`, `new-storefront/src/lib/auth.ts`, and
all 4 existing `new-storefront/e2e/*.spec.ts` files for testid/error-pattern precedent. Confirmed:
no toast/snackbar/notification primitive exists anywhere in `new-storefront/src/components/`
(`Icon.tsx`, `PhoneFrame.tsx`, `Placeholder.tsx`, `TabBar.tsx` only) — every existing async error in
this app (`CartScreen`'s promo error, `CheckoutScreen`'s checkout error, `RewardsScreen`'s redeem
error, `AccountScreen`'s auth error) is an inline text node conditionally rendered near the control
that triggered it, in `theme.accent` (or `theme.gold` on the one dark-background instance,
`RewardsScreen`'s star-balance card). All 4 decisions below follow that existing register rather
than inventing a toast.

---

## Decision 1 — Quick-add failure treatment (Finding 1, AC1.1–AC1.2)

### Architecture (applies to both MenuScreen and ChatScreen call sites)

The root fix: `App.tsx:73-76`'s `addVariantToCart` and `App.tsx:84-88`'s `quickAdd` must stop being
fire-and-forget. `quickAdd` must **return the promise** from `addVariantToCart` (drop the `void` at
`App.tsx:87`) instead of swallowing it, so callers (`MenuScreen`, `ChatScreen`) can `await`/`.catch()`
it themselves. Concretely:

- `quickAdd(drink)` resolves once the cart update lands (unchanged happy path — `setCart(next)`
  already happens inside `addVariantToCart`), and **rejects** if `addLineItem` rejects.
- **New edge case, closed as part of this fix**: today, if no variant matches `Medium`/`Oat` and
  `drink.variants[0]` is also undefined, `quickAdd` silently `return`s with no error and no cart
  update (`App.tsx:86`, `if (!variant) return;`) — this reads as success to a caller now awaiting a
  promise. Fix: in that branch, reject with `new Error('This drink has no available options right now.')`
  instead of a bare `return`, so it flows through the same error-surfacing path specified below
  rather than silently no-op'ing under an now-error-aware caller.
- Error handling and the optimistic-checkmark gating live **locally in the component that owns the
  clicked control** (`MenuScreen` for its two controls, `ChatScreen` for its two call sites) — not
  lifted into new `App.tsx` state — so a failure on one screen can never leak a stale error banner
  onto a different screen after a tab switch. This mirrors how `CheckoutScreen`/`RewardsScreen`
  already own their own `error`/`redeemError` state locally, rather than centralizing all error state
  in `App.tsx` (the one exception, `promoError`, is centralized only because `App.tsx` already owns
  the `applyPromo` orchestration entirely — quick-add's orchestration should not move there).

### MenuScreen (`MenuScreen.tsx:154-181` featured, `:200-224` popular row)

Both controls get the same treatment, applied per-control so one failing does not block the other:

1. On click: if a request for this exact control (this specific drink, for the popular row) is
   already in flight, ignore the click (retry-spam guard — no double-fire). Otherwise, clear this
   control's prior error (if any) and mark it pending.
2. `await onQuickAdd(drink)`.
3. **On success**: set the existing `justAdded`/`justAddedId` state exactly as today (900ms checkmark
   flash, `Icon name={justAdded ? 'Check' : 'Plus'}`) — happy path is otherwise unchanged (AC1.2).
4. **On failure**: do **not** set `justAdded`/`justAddedId` — the icon never leaves its `Plus` state.
   Set a local `quickAddError: string | null` to:
   ```
   Couldn't add to bag: {message}
   ```
   where `{message}` is `error instanceof Error ? error.message : String(error)` — this exact
   "Couldn't {verb}: {message}" shape already exists in this codebase at `App.tsx:164`
   (`` `Couldn't reach the backend: ${error}` ``), so this is reuse of an established copy pattern,
   not a new one.
5. Either way, clear the pending flag for that control.

**Where the error renders**: one shared inline banner in `MenuScreen`, placed directly below the
"Order ahead" heading and above the search bar (i.e., between what's currently `MenuScreen.tsx:58`
and `:62`) — a single location regardless of which of the two controls failed, since only one
quick-add is realistically in flight at a time and this avoids duplicating the banner per-control.

```tsx
{quickAddError && (
  <div data-testid="quick-add-error" role="alert" style={{ margin: '10px 24px 0', font: `500 13px ${theme.body}`, color: theme.accent }}>
    {quickAddError}
  </div>
)}
```

- `role="alert"` is a deliberate addition beyond what `CartScreen`/`CheckoutScreen`/`RewardsScreen`'s
  existing error text nodes have (none of them carry an ARIA live-region role today) — see
  Deviations below for why this one new instance gets it while the others aren't retrofitted in this
  batch.
- `data-testid="quick-add-error"` (new).
- Clears (`quickAddError = null`) at the start of the *next* quick-add attempt from either control,
  or immediately on that attempt's success. It does not auto-dismiss on a timer and has no close
  button — this matches every other error surface in the app (`promoError`, `checkout-error`,
  `redeem-error`, `auth-error`), none of which auto-dismiss or have a dismiss control.

**Pending-state visual**: while a control's own request is in flight, render it at `opacity: 0.5`
(matching the existing disabled-button convention already used in this app,
e.g. `CheckoutScreen.tsx:188`'s `opacity: canReview ? 1 : 0.5`). The popular-row control is a real
`<button>` — also set `disabled` natively while pending. The featured control remains a `<span
onClick>` per `00-spec.md`'s explicit note that converting it to a `<button>` is Medium-severity
finding #5 and out of scope for this batch — guard re-entrancy in the click handler itself (ignore
clicks while pending) and additionally set `aria-disabled="true"` while pending so the state is at
least announced, since a plain `<span>` has no native `disabled`.

**Regression note (AC1.2 / scenario 4)**: because the checkmark now only appears *after* the
add-to-cart promise resolves rather than synchronously on click, the checkmark's timing changes from
"instant" to "after one network round trip" — this reverses the explicit intent documented in the
existing code comment at `MenuScreen.tsx:17-19` ("flip the plus icon to a checkmark immediately on
click so the tap reads as instant regardless of that delay"). This is a deliberate, necessary
consequence of fixing Finding 1, not an oversight — see Deviations.

### ChatScreen (`ChatScreen.tsx` — `BubbleChat`'s recommendation-card button `:116-122` and
quick-reply pill `:139-153`; `VoiceChat`'s recommendation-card button `:276-279`)

`App.tsx:212-215`'s `onAdd` prop passed into `<ChatScreen>` today is
`onAdd={(d) => { quickAdd(d); goTab('bag'); }}` — fire-and-forget, then unconditional navigation.
Fix: make this an async function that only navigates on success:

```
onAdd={async (d) => { await quickAdd(d); goTab('bag'); }}
```

This causes the returned promise to reject (propagate) if `quickAdd` rejects, and **not** navigate to
the Bag tab on failure. `ChatScreenProps.onAdd`'s type changes from `(drink: Drink) => void` to
`(drink: Drink) => Promise<void>`. Every call site inside `BubbleChat`/`VoiceChat` that invokes
`onAdd(...)` becomes responsible for catching its own rejection and displaying a local error, exactly
mirroring `MenuScreen`'s pattern:

- `BubbleChat` and `VoiceChat` each get their own local `chatAddError: string | null` state (each
  chat variant is its own component, so no sharing needed).
- Same copy: `Couldn't add to bag: {message}`.
- Same "no unhandled rejection" contract: the button's own `onClick` handler must be
  `async () => { try { await onAdd(rec); } catch (e) { setChatAddError(...); } }`.
- **Placement/testid**: `data-testid="chat-quick-add-error"` in both variants.
  - `BubbleChat`: render directly above the quick-reply pill row (between what's currently
    `ChatScreen.tsx:134` and `:137`).
  - `VoiceChat`: render directly above the bottom control row (between what's currently
    `ChatScreen.tsx:285` and `:287`).
- **Color**: `BubbleChat` is light-themed (same surfaces as `MenuScreen`/`CartScreen`) — use
  `theme.accent`, consistent with `CartScreen`/`CheckoutScreen`. `VoiceChat` is the dark variant — use
  `theme.gold`, matching the one other dark-surface error precedent in this app,
  `RewardsScreen.tsx:157-159`'s `redeemError` (rendered inside the dark `theme.ink` balance card,
  also styled in `theme.gold` for contrast) — not `theme.accent`, which is illegible-by-similarity
  against `VoiceChat`'s orange mood-chip/CTA accents on a near-black background.
- No optimistic checkmark exists in `ChatScreen` today (per `00-spec.md`'s note) and none is being
  added — the acceptance bar here (scenario 5) is "no longer silently swallowed," which the above
  satisfies: on failure the user stays on the Chat screen (no navigation) and sees the error text.

### Explicitly out of scope, noted for traceability

`DrinkDetailScreen`'s add-to-bag path (`App.tsx:170-173`) has the identical fire-and-forget bug but
is out of scope per `00-spec.md`. If `frontend-tdd-engineer` chooses to extend the fix here in the
same pass (a reasonable scope extension per `00-spec.md`), use the identical architecture: make
`addDrinkWithExtrasToCart` awaitable/rejectable, only call `goTab('bag')` on success, and add a local
`addError` state in `DrinkDetailScreen` rendered above the sticky CTA bar with
`data-testid="drink-detail-add-error"` and the same `Couldn't add to bag: {message}` copy, in
`theme.accent` (light screen). Not required to satisfy this spec's acceptance criteria.

---

## Decision 2 — Menu greeting real-customer behavior (Finding 2, AC2.1–AC2.2)

`MenuScreenProps` gains a `customer: Customer | null` field; `App.tsx:196-201` passes
`customer={customer}` into `<MenuScreen>` (the same `customer` state already threaded to
`RewardsScreen`/`CheckoutScreen`/`AccountScreen`). `MenuScreen.tsx:53-55`'s
`GOOD MORNING, {USER.firstName.toUpperCase()}` (importing the static `USER` mock from `data.ts:9`) is
replaced with:

```tsx
const displayName = (customer?.first_name ?? customer?.phone ?? customer?.email ?? '').toUpperCase();
```
```tsx
<div data-testid="menu-greeting" style={{ ...unchanged }}>
  {displayName ? `GOOD MORNING, ${displayName}` : 'GOOD MORNING'}
</div>
```

- **(a) Logged in with `first_name`**: greeting shows `GOOD MORNING, {FIRST_NAME_UPPERCASED}` — exact
  same visual format as today, just sourced from the real customer (AC2.1, scenario 6).
- **(b) Logged in, no `first_name`, has `phone`**: falls back to `phone`, uppercased —
  `GOOD MORNING, {PHONE}` (scenario 7). Uppercasing a phone number is a no-op on digits/`+` so this
  looks identical to how a phone string renders anywhere else; no special-casing needed.
- **No `first_name`/`phone`, has `email`**: falls back to `email`, uppercased (scenario 8).
- **(c) Guest (`customer === null`) or, defensively, a logged-in customer with all three fields
  null/empty** (not expected in practice — signup requires phone+email — but the fallback chain
  degrades to the same `''` result either way): drop the name entirely and show the bare word
  **`GOOD MORNING`** — no comma, no placeholder name, no word "Guest." This is the exact behavior
  `00-spec.md`'s open question suggested and resolves scenario 9's "must never show 'Alex' or any
  other name" requirement. It also matches the *pattern*, if not the literal copy, used by
  `RewardsScreen`'s own logged-out state (`RewardsScreen.tsx:22-34`): that screen doesn't attempt to
  render a name-shaped placeholder for guests either — it swaps to entirely different content
  ("Log in to see your rewards"). `MenuScreen` can't do the same full swap (guests must still be able
  to browse/quick-add from this screen — that's existing, correct behavior, confirmed by
  `checkout.spec.ts`'s guest-checkout test), so the minimal equivalent is: keep the screen fully
  functional, just drop the name-bearing half of the greeting line.
- This fallback order (`first_name ?? phone ?? email`) exactly matches `RewardsScreen.tsx:87,101`,
  per `00-spec.md`'s explicit instruction to prefer that compact form over `AccountScreen`'s
  `[first_name, last_name].filter(Boolean).join(' ')` form (which is for a full profile heading, not
  compact tab chrome).
- **New testid**: `data-testid="menu-greeting"` on the greeting `<div>` — none exists today; adding
  one makes scenario 6–10's assertions robust to exact copy rather than relying on substring/regex
  matching against the whole screen.
- **Explicitly unchanged / not part of this fix**: `ChatScreen.tsx:55`'s scripted bot line
  `"Morning, Alex! Feeling something bold, sweet, or iced today?"` is canned chat dialogue (the
  screen is documented as permanently mock, per `docs/sessions/011`), not the Finding 2 defect — it
  happens to also say "Alex" but is out of scope here. Do not touch it.
- **Also unchanged**: the "always says morning regardless of time of day" behavior — flagged as a
  separate, Low-severity, out-of-batch item in the prior audit (`ux-review-new-storefront/01-ux-spec.md`
  Top Issues, Copy note under `MenuScreen`). No time-of-day logic is being added here.

---

## Decision 3 — Checkout-empty-cart dead end fix (Finding 3, AC3.1)

**Chosen shape: (b) — reroute, don't patch the dead-end message.** `App.tsx:186-189`'s
`cart && cart.items.length > 0 ? <CheckoutScreen .../> : <StatusMessage text="Your bag is empty." />`
branch is removed. Whenever `view.kind === 'checkout'` is reached (or persists) with an empty/null
cart, the view state is corrected to `{ kind: 'tab', tab: 'bag' }` — functionally identical to
calling the existing `goTab('bag')` — so the very next render shows `CartScreen`'s **already
fully-formed** empty-cart state (`CartScreen.tsx:32-45`: bag icon, "Your bag is empty" heading, "Add
a drink from the menu or ask Ember for a recommendation." body copy, and a "Browse the menu" button
already wired to `onBrowse` → `goTab('menu')`), with the `TabBar` visible beneath it (the `TabBar`
renders whenever `view.kind === 'tab'` and `view.tab !== 'chat'`, per `App.tsx:234` — a normal `tab`
view for `bag` satisfies this automatically, with no special-casing needed).

**Why (b) over (a)**: `CartScreen`'s empty-cart state is already correct, already tested (implicitly
exercised whenever a real cart is empty), and already has a working "back to somewhere useful"
control — adding a *second*, differently-styled "back to menu" button on a bare `StatusMessage` would
duplicate that affordance with new copy/testids for no benefit, and would leave two different
"your bag is empty" UIs in the app (`CartScreen.tsx:38`'s and a new one) where today there's
deliberate, positive consistency between `CartScreen.tsx:38` and `App.tsx:188`'s copy (per the prior
audit's Copy section). Rerouting preserves that consistency by making there be only one such screen.

**Implementation shape is `frontend-tdd-engineer`'s call** (a `useEffect` watching
`view.kind === 'checkout' && (!cart || cart.items.length === 0)` that calls `goTab('bag')`, vs.
inlining the fallback directly as the `bag` tab render in that same ternary branch to avoid even a
one-frame flash of the old message) — but the end state is not optional: the
`StatusMessage`-with-zero-affordances branch must be deleted or made unreachable, not augmented.

**Destination**: the **Bag tab** (`{ kind: 'tab', tab: 'bag' }`), not the Menu tab — Bag is one tap
further from Menu but is the more contextually correct landing spot (the user was mid-checkout, Bag
is "back one step," Menu is "back to the start"), and it's the view that already owns the correct
empty-state copy/CTA. From there, the existing "Browse the menu" button remains available if the
user wants to go further back.

**New testid**: add `data-testid="browse-menu-button"` to `CartScreen.tsx:40`'s existing "Browse the
menu" button (currently untested by testid, only reachable by text). This button becomes the
load-bearing recovery affordance for scenario 12's "affordance is clicked → lands on a normal,
interactive tab view" assertion, and giving it a stable testid avoids `frontend-tdd-engineer` having
to locate it by text content.

**TabBar as a safety net**: yes, confirmed present by construction — since the fix routes into the
normal `tab`/`bag` rendering path rather than a special-cased branch, `TabBar` is guaranteed to render
(scenario 12's explicit requirement), with no separate "also render TabBar here" logic needed.

---

## Decision 4 — `aria-label` strings for all 12 icon-only controls (Finding 4, AC4.1, scenarios 13–24)

Template/tone reference (the one confirmed-correct existing example):
`CheckoutScreen.tsx:154`, `aria-label="Dismiss"` — short, capitalized-first-word-only, verb or
noun phrase, no trailing punctuation. All labels below follow that register.

| # | File:line | Control | `aria-label` | Notes |
|---|---|---|---|---|
| 4.1 | `MenuScreen.tsx:49-51` | Bell icon button | `"Notifications"` | Non-functional (no `onClick`) — out of scope to wire up, per `00-spec.md`. Label only announces what the icon represents. |
| 4.2 | `MenuScreen.tsx:154-181` | Featured quick-add (`<span onClick>`) | `` `Add ${featured.name} to bag` `` | Dynamic, per the currently-displayed featured drink (e.g. `"Add Brown Sugar Oat Latte to bag"`). Keep as a `<span>` per Medium-severity finding #5 (out of scope); add `aria-disabled="true"` while pending, per Decision 1. |
| 4.3 | `MenuScreen.tsx:200-224` | Popular-row quick-add `<button>` | `` `Add ${d.name} to bag` `` | Dynamic, per-row — required so multiple popular-row buttons remain individually addressable by accessible name (scenario 15's open question), consistent with 4.2's per-drink treatment. |
| 4.4 | `DrinkDetailScreen.tsx:47-49` | Back arrow button | `"Back"` | |
| 4.5 | `DrinkDetailScreen.tsx:53-55` | Heart/favorite button | `"Add to favorites"` | Non-functional (no `onClick`) — out of scope to wire up. |
| 4.6 | `DrinkDetailScreen.tsx:193` (minus) / `:197` (plus) | Qty stepper | `"Decrease quantity"` / `"Increase quantity"` | Single stepper per screen (one drink being customized) — no per-drink disambiguation needed, generic label is unambiguous in context. |
| 4.7 | `CartScreen.tsx:87` (minus) / `:91` (plus) | Qty stepper, per line item | `` `Decrease quantity of ${it.title}` `` / `` `Increase quantity of ${it.title}` `` | Unlike 4.6, this screen can render multiple line items simultaneously — generic "Decrease quantity"/"Increase quantity" would produce multiple identically-named buttons in the accessibility tree (a real a11y regression, not just an imprecision). Per-item labels avoid that, consistent with the 4.3 decision. |
| 4.8 | `CheckoutScreen.tsx:120-122` | Back arrow button | `"Back"` | Matches the confirmed-correct `checkout-login-nudge-dismiss` pattern already in this same file. |
| 4.9 | `ChatScreen.tsx:82-84` (`BubbleChat`) | Back arrow button | `"Back"` | Currently has `title="Back"` only — keep the `title` attribute (harmless, gives a mouse-hover tooltip) and add the matching `aria-label`. |
| 4.10 | `ChatScreen.tsx:221-223` (`VoiceChat`) | Close (X) button | `"Close"` | Currently has `title="Close"` only — same treatment as 4.9, keep `title`, add matching `aria-label`. |
| 4.11 | `ChatScreen.tsx:228-230` (`VoiceChat`) | "History" icon button | `"History"` | Non-functional — out of scope to wire up. Label matches the icon's own conventional meaning (`lucide`'s `history` icon), same word used in the design-reference mockup's intent. |
| 4.12 | `ChatScreen.tsx:297` (`VoiceChat`) | "Sparkles" icon button | `"Suggestions"` | Non-functional — out of scope to wire up. This icon has no accompanying visible text anywhere (unlike the `MOODS` array's "Surprise me" chip, which also uses a sparkles icon but is a distinct control) — "Suggestions" was chosen as the closest generic, non-misleading description of a sparkles glyph's conventional meaning (AI-assist/ideas) in a voice-assistant context; there is no existing in-app or mockup text this could be copied from verbatim. |

All 12: verify via `page.getByRole('button', { name: /.../i })` per `00-spec.md`'s scenarios 13-24 —
every one of the above is attached to an actual `<button>` or (for 4.2 only) a `<span>` with
`onClick` — note the `<span>`-based control (4.2) will **not** be picked up by
`page.getByRole('button', ...)` unless it also carries `role="button"`. Since `00-spec.md`'s scenario
14 requires "a non-empty `aria-label` distinguishing it as an add-to-bag action" but does not
explicitly require the `getByRole('button', ...)` query to succeed for this one control (unlike
4.3/4.6/4.7/4.8, which are real `<button>`s), no additional `role="button"` is being mandated here —
but if `frontend-tdd-engineer` wants scenario 14 to be queryable the same way as the others,
adding `role="button"` and `tabIndex={0}` to this `<span>` alongside the `aria-label` is consistent
with fixing an accessibility gap and does not conflict with keeping it a `<span>` (Medium-severity
finding #5, "not a real `<button>`," is about the *semantic HTML element*, which `role="button"`
does not change — it would still not be a native `<button>`). This is optional, not required, to
satisfy AC4.1 for control 4.2 specifically.

---

## New `data-testid`s introduced by this batch (summary)

Following the existing kebab-case, action/entity-first convention confirmed in
`new-storefront/e2e/*.spec.ts` (`checkout-login-nudge`, `checkout-login-nudge-dismiss`,
`shipping-option`, `cart-item`/`cart-item-extra`, `redeem-reward-button`/`redeem-error`, etc.):

| testid | Location | Purpose |
|---|---|---|
| `quick-add-error` | `MenuScreen.tsx`, new inline banner | Finding 1 |
| `chat-quick-add-error` | `ChatScreen.tsx`, both `BubbleChat`/`VoiceChat` | Finding 1, scenario 5 |
| `menu-greeting` | `MenuScreen.tsx`, existing greeting `<div>` | Finding 2, scenarios 6-10 |
| `browse-menu-button` | `CartScreen.tsx:40`, existing "Browse the menu" button | Finding 3, scenarios 11-12 |

No new files/screens are introduced. No testids are proposed for the 12 `aria-label` fixes
(Finding 4) beyond what's listed above — those are verified by accessible name
(`page.getByRole('button', { name: ... })`), not by testid, per `00-spec.md`'s AC4.1.

---

## Accessibility summary (cross-cutting)

- **Keyboard reachability**: all Finding-4 controls except 4.2 (see note above) are already real
  `<button>`s and thus already keyboard-reachable (Tab/Enter/Space) — this batch only adds accessible
  *names*, it does not change reachability, except optionally for 4.2 if `role="button"`/`tabIndex`
  is added per the note above.
- **Focus handling**: none of the 4 findings introduce a new modal/dismissible overlay requiring
  focus-trap changes — the new inline error banners (`quick-add-error`, `chat-quick-add-error`) are
  non-modal, non-focus-stealing text nodes, consistent with every other inline error in this app
  (none of which move focus). The checkout-empty-cart reroute (Decision 3) lands on a normal tab view
  with normal focus behavior — no special handling needed.
- **Live-region announcement**: `role="alert"` is added to the two new quick-add error banners (see
  Decision 1) so a screen reader user is told about the failure without needing to discover the new
  text node by other means — a genuine, deliberate improvement over this app's pre-existing error
  surfaces (`promoError`, `checkout-error`, `redeemError`, `auth-error`), none of which have any ARIA
  live-region role today. This batch does **not** retrofit `role="alert"` onto those 4 pre-existing
  surfaces — that's out of scope (not named in any of the 4 findings) — but it would be inconsistent
  to ship a *new* error surface in this same PR without it, given Finding 4 is explicitly about
  accessibility in this batch.
- **Label/`aria` associations for new form fields**: none of the 4 findings add a new form input —
  no new `<label>`/`aria-describedby` work is in scope here (the app-wide "no `<label>` anywhere"
  gap is a separate, Medium-severity finding from the prior audit, not one of these 4).

---

## Deviations (from existing patterns/prior docs — stated explicitly, not silent drift)

1. **Checkmark timing regresses from "instant" to "after resolution"** (Decision 1). The existing
   code comment at `MenuScreen.tsx:17-19` explicitly documents the current optimistic-UI intent
   ("flip the plus icon to a checkmark immediately on click... regardless of that delay"). Fixing
   Finding 1 necessarily reverses this: a checkmark can no longer be shown before the network call
   resolves, because showing it earlier is the entire defect being fixed. This is an intentional,
   required tradeoff (correctness over perceived instantaneity), not an oversight — the 0.5-opacity
   pending state (Decision 1) is the compensating affordance so a tap still visibly registers
   something before the checkmark/error resolves.
2. **`role="alert"` added to 2 new error surfaces but not retrofitted to the 4 pre-existing ones**
   (see Accessibility summary above) — scoped deliberately to what Finding 1 touches, not expanded
   into an unscoped accessibility pass across the whole app.
3. **`VoiceChat`'s new error banner uses `theme.gold`, not `theme.accent`** — a deliberate deviation
   from `MenuScreen`/`BubbleChat`/`CartScreen`/`CheckoutScreen`'s shared `theme.accent` error color,
   because `VoiceChat` is the one dark-surface screen in the app and `theme.gold` is the existing,
   established dark-surface error/accent color (`RewardsScreen`'s `redeemError` on its dark `ink`
   card) — using `theme.accent` there would be low-contrast against `VoiceChat`'s own
  `theme.accent`-colored mood chip/CTA elements.
4. **Finding 4's own suggested example text ("Decrease quantity" / "Increase quantity") is
   overridden with per-item dynamic labels for `CartScreen` specifically** (control 4.7) — see the
   table note for why (avoiding duplicate accessible names across multiple simultaneously-rendered
   line items). `DrinkDetailScreen`'s single stepper (4.6) keeps the generic form since no such
   ambiguity exists there.
5. **`ChatScreen.tsx:55`'s "Morning, Alex!" scripted bot line is deliberately left untouched** — see
   Decision 2 — it is mock chat dialogue, not the Finding 2 defect, even though it also contains the
   literal string "Alex."

## Open items

None blocking `frontend-tdd-engineer`. Two explicitly optional scope extensions are noted above and
left to that stage's discretion, not required for this spec's acceptance criteria:
1. Extending Finding 1's fix architecture to `DrinkDetailScreen`'s add-to-bag path (out of scope per
   `00-spec.md`, but same root cause/fix shape).
2. Adding `role="button"`/`tabIndex={0}` to the featured quick-add `<span>` (control 4.2) so it's
   queryable via `getByRole('button', ...)` identically to the other 11 controls.

## Handoff — next stage

Next stage: `frontend-tdd-engineer`, invoked with slug `new-storefront-high-severity-ux-fixes`,
reading this file plus `00-spec.md`, implementing all 4 fixes red→green against `00-spec.md`'s
numbered scenarios (1–24) using the exact copy, testids, `aria-label` strings, destination views, and
error-treatment behavior specified above, and writing
`docs/handoffs/new-storefront-high-severity-ux-fixes/03-frontend.md`. `backend-tdd-engineer`
(`02-backend.md`) remains skipped per `00-spec.md`.
