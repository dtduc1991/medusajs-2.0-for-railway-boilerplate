# Handoff: 4 High-severity UX audit findings fixed in `new-storefront/`, full pipeline run, verified

## Context

**Status: Done.** Ran the 4 **High**-severity findings from the earlier UX-audit-only pipeline run
(`docs/handoffs/ux-review-new-storefront/01-ux-spec.md`'s "Top issues" rows 1-4) through this repo's
full 5-stage bugfix pipeline (`docs/agent-workflow.md`), slug `new-storefront-high-severity-ux-fixes`.
`backend-tdd-engineer` was skipped (no backend changes needed, confirmed at the spec stage). Full
per-stage detail lives in `docs/handoffs/new-storefront-high-severity-ux-fixes/`:
[`00-spec.md`](../handoffs/new-storefront-high-severity-ux-fixes/00-spec.md),
[`01-ux-spec.md`](../handoffs/new-storefront-high-severity-ux-fixes/01-ux-spec.md),
[`03-frontend.md`](../handoffs/new-storefront-high-severity-ux-fixes/03-frontend.md),
[`04-verification.md`](../handoffs/new-storefront-high-severity-ux-fixes/04-verification.md) — this
doc is a rollup summary; read those for exact code/line references, copy strings, and full evidence.

## The 4 findings fixed

1. **Silent quick-add failure** — `App.tsx`'s `quickAdd`/`addVariantToCart` were fire-and-forget with
   no `.catch()`; `MenuScreen`'s quick-add controls flipped to a success checkmark synchronously on
   click regardless of whether the network call actually succeeded. Fixed by making `quickAdd` return/
   reject a real promise, and gating the checkmark on that promise resolving; failures now surface an
   inline `role="alert"` error banner (`Couldn't add to bag: {message}`) locally in `MenuScreen`/
   `ChatScreen`, with no false-positive checkmark, no bag-count update, and no unhandled rejection.
   Deliberate, disclosed side effect: the checkmark now appears after one network round trip instead
   of instantly (previously-documented intentional optimism reversed in favor of correctness).
2. **`MenuScreen` greeting used a hardcoded mock name ("Alex")** — replaced with the real logged-in
   `customer`'s `first_name ?? phone ?? email` (matching `RewardsScreen`'s existing fallback pattern),
   falling back to a bare `GOOD MORNING` (no name) for guests — never a placeholder or another
   customer's name.
3. **Checkout dead end on an empty cart** — a race (cart emptying out between pressing Pay and the
   checkout screen mounting) rendered a bare, `TabBar`-less "Your bag is empty." message with zero
   navigation affordances. Fixed by rerouting to the Bag tab's already-correct empty-cart state
   (bag icon, copy, and a "Browse the menu" button, now with `data-testid="browse-menu-button"`) with
   the normal `TabBar` present, rather than patching the old dead-end message.
4. **12 icon-only buttons missing `aria-label`** across `MenuScreen`, `DrinkDetailScreen`, `CartScreen`,
   `CheckoutScreen`, and `ChatScreen` (`BubbleChat`/`VoiceChat`) — all given exact, UX-spec'd
   `aria-label` strings (static for single-instance controls like back/close buttons, dynamic
   per-drink/per-line-item where multiple identically-shaped controls could otherwise collide in the
   accessibility tree, e.g. `Add ${drink.name} to bag`, `Decrease quantity of ${item.title}`).

## Verification performed

Independent `e2e-verifier` pass (full detail in
[`04-verification.md`](../handoffs/new-storefront-high-severity-ux-fixes/04-verification.md)):

- **Environment**: backend already running in Docker (reused, not restarted). The `new-storefront`
  Docker container the prior stage had stopped (stale production build with no publishable key,
  unrelated to this batch) remained stopped; started a fresh local `npm run dev` on port 5173, which
  correctly picked up `.env.local`'s publishable key. Left in that state for any future session — the
  Docker container / `docker-compose.yml`/`Dockerfile` changes around it are unrelated, uncommitted
  infra work, not this pipeline's concern.
- **Full suite, one invocation** (not per-file, unlike the frontend stage's iteration runs):
  `npm run test-e2e` → **31/31 passed** (`auth.spec.ts` 6, `checkout.spec.ts` 4, `extras.spec.ts` 2,
  `menu.spec.ts` 14 [new file], `rewards.spec.ts` 5). `npx tsc -b --noEmit` clean. `npm run build`
  clean (one pre-existing, unrelated large-chunk warning).
- **Empirical spot-checks beyond "tests passed"**: confirmed the quick-add failure test genuinely
  triggers a real simulated `500` via `page.route` (not a vacuous assertion) and that `MenuScreen`'s/
  `App.tsx`'s source only sets the success-checkmark state inside the `try` block's success path
  (structurally cannot coexist with the error state); confirmed the Menu-greeting scenarios sign up
  **real customers against the real backend** (not a mocked `customer` prop) and patch a real customer
  record via `/store/customers/me` to exercise the phone/email fallback; confirmed the checkout-empty-
  cart test reproduces a genuine race (real DELETE held open via timing-only route interception, real
  Pay click against stale state) and that `TabBar`/`tab-bag` can only render via the real `TabBar`
  component (only place that testid exists); cross-checked all 12 `aria-label` strings against
  `01-ux-spec.md`'s table by reading current source directly (exact match, including the two
  `title`-vs-`aria-label` cases the frontend stage specifically avoided a false-green risk on).
- Reviewed all 4 deviations `03-frontend.md` called out (category-selection test workaround, optional
  `role="button"` on the featured quick-add span, untested no-variant reject edge case, deliberately
  out-of-scope `DrinkDetailScreen` add-to-bag path) — none are problems; one (the untested edge case)
  is carried forward as a minor open item below.
- **No regressions found.** `auth.spec.ts`/`rewards.spec.ts` (unmodified by this batch aside from
  incidentally exercising the now-differently-timed quick-add button) passed clean.

## Open items / what the next session should do

1. **No test coverage for `quickAdd`'s "no matching variant" reject path** (`App.tsx`'s
   `if (!variant) return Promise.reject(...)`) — implemented correctly per source read, but genuinely
   untested against the real backend (constructing a variant-less drink isn't straightforward under
   this suite's real-backend convention). Low risk, worth a future pickup only if this exact edge case
   becomes a priority.
2. **`DrinkDetailScreen`'s add-to-bag path has the identical fire-and-forget bug as Finding 1**
   (`App.tsx`'s `view.kind === 'detail'` branch: `void addDrinkWithExtrasToCart(...)` then unconditional
   `goTab('bag')`). Explicitly out of scope for this batch (per `00-spec.md`/`01-ux-spec.md`), flagged
   again here per those docs' own instruction so it isn't "rediscovered as new" later. A human/product
   call on priority, not a pipeline defect.
3. **Unrelated, pre-existing infra state**: the Docker `new-storefront` container is stopped, and
   `docker-compose.yml`/`new-storefront/Dockerfile`/`.dockerignore` show as locally
   modified/untracked in git status — first surfaced by the frontend stage, not touched by this
   pipeline run. Needs a human decision on whether to finish, revert, or otherwise resolve that
   in-progress containerization work; it's currently half-done.
4. **Nothing in this batch is blocked.** All 4 findings are implemented, tested, and independently
   verified — no human decision is required to consider *this* feature done. Items 1-3 above are
   pre-existing/adjacent, not blockers for this slug.
