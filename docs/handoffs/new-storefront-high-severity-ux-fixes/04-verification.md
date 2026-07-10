# new-storefront-high-severity-ux-fixes / 04-verification — independent e2e-verifier pass

## Inputs

- Feature slug: `new-storefront-high-severity-ux-fixes`
- Prior stage files read in full: [`00-spec.md`](00-spec.md), [`01-ux-spec.md`](01-ux-spec.md),
  [`03-frontend.md`](03-frontend.md). `02-backend.md` does not exist — `backend-tdd-engineer` was
  confirmed skipped by `00-spec.md` and nothing in this pass contradicts that (no backend files are
  in the current git diff for this slug).

## Environment used

- Backend: `medusajs-20-for-railway-boilerplate-backend-1` (Docker), already running, healthy, port
  9000 — reused as-is, not restarted.
- `new-storefront` dev server: at session start, port 5173 was **not** serving anything —
  `medusajs-20-for-railway-boilerplate-new-storefront-1` (the stale production-build Docker container
  `03-frontend.md` stopped) was confirmed `Exited (0) 25 hours ago`, and no local `npm run dev`
  process from the prior stage was still alive. I started `npm run dev` myself in `new-storefront/`
  (backgrounded), which picked up the correct `new-storefront/.env.local` (`VITE_MEDUSA_BACKEND_URL`,
  `VITE_MEDUSA_PUBLISHABLE_KEY`) and served port 5173 correctly (`GET /` → 200). This matches
  `CLAUDE.md`'s documented convention and `03-frontend.md`'s explicit instruction to `e2e-verifier` to
  confirm this rather than assume.
- **State left running**: the Docker `new-storefront` container remains stopped (as the frontend
  stage left it — it's serving a stale build baked without a publishable key and appears to belong to
  unrelated, uncommitted infra work per `03-frontend.md`'s note about `docker-compose.yml`/
  `new-storefront/Dockerfile` being locally modified/untracked; not this pipeline's concern to fix).
  My local `npm run dev` process is left running on port 5173 in its place, consistent with how the
  frontend stage left things. I did not touch `docker-compose.yml`, `new-storefront/Dockerfile`, or
  `new-storefront/.dockerignore`.

## Full suite run (fresh, single invocation — not per-file)

`npm run test-e2e` (`playwright test e2e`) from `new-storefront/`, all 4 spec files together in one
run, `workers: 1` (per this suite's shared-backend-state convention):

```
Running 31 tests using 1 worker
...
31 passed (2.7m)
```

Breakdown by file (all in the same run): `auth.spec.ts` 6/6, `checkout.spec.ts` 4/4, `extras.spec.ts`
2/2, `menu.spec.ts` 14/14, `rewards.spec.ts` 5/5. This matches `03-frontend.md`'s per-file numbers,
but is a stronger check: `03-frontend.md` explicitly stated it ran each file separately while
iterating and had *not* run them all together in one invocation — this is the first full-suite,
single-run confirmation for this batch. No regressions, no flakes across the run.

`npx tsc -b --noEmit`: clean, no errors. `npm run build`: clean production build (one pre-existing,
unrelated warning about the single JS chunk exceeding 500kB — not introduced by this batch, not a
correctness issue).

## Empirical spot-checks (beyond "tests passed")

### Finding 1 — quick-add failure handling

Read `menu.spec.ts`'s failure-simulation tests directly (not just their pass/fail): `failNextLineItemCreate()`
installs a real `page.route()` interceptor on `POST **/store/carts/*/line-items` that fulfills with an
actual `500` + JSON error body — this is a genuine simulated network failure, not a vacuous check (it
doesn't just assert an already-true condition; the interceptor is confirmed to change behavior because
the same button click succeeds in the "regression" test with no interceptor installed). The assertions
made under failure are concrete and would fail if the fix regressed: `quick-add-error` becomes visible
with the exact text `"Couldn't add to bag: Simulated network failure"`, `role="alert"` is present, the
button's icon stays `svg.lucide-plus` (`svg.lucide-check` has count 0 — i.e. explicitly checked absent,
not just "checkmark eventually appears"), `bag-count-badge` has count 0 (never rendered, since it only
renders when `bagCount > 0`), and `page.on('pageerror', ...)` collects zero errors (ruling out
"silently swallowed via an uncaught rejection that just doesn't crash the test").

Read `MenuScreen.tsx` and `App.tsx` source directly to confirm the implementation genuinely
implements this rather than the test asserting around a coincidence:
- `App.tsx`'s `quickAdd` (`new-storefront/src/App.tsx:104-108`) now returns the promise from
  `addVariantToCart` and rejects with a real `Error` in the previously-silent no-variant branch — no
  `void`, no swallowed rejection.
- `MenuScreen.tsx`'s two quick-add handlers (`:183-197` featured, `:242-255` popular row) both
  `await onQuickAdd(...)` inside a `try/catch`, only set `justAdded`/`justAddedId` (the code path that
  flips `Plus` → `Check`) inside the `try` block's success branch, and only set `quickAddError` in
  `catch` — there is no code path where both can be true simultaneously, and the checkmark genuinely
  cannot appear before the awaited promise settles. This matches `01-ux-spec.md`'s Decision 1 exactly.
- `ChatScreen.tsx`'s back/close/history/sparkles buttons and the `onAdd` plumbing in `App.tsx:236-239`
  (`async (d) => { await quickAdd(d); goTab('bag'); }`) confirmed to only navigate on success — a
  failure leaves the user on the Chat screen, matching scenario 5's bar ("no longer silently
  swallowed").

**Verdict: genuine, not vacuous.** No false-positive checkmark on failure, no unhandled rejection, no
bag-count update on failure — confirmed both by the test's construction and by direct source reading.

### Finding 2 — real customer greeting

Read `MenuScreen.tsx:34,66-68` directly: `displayName = (customer?.first_name ?? customer?.phone ??
customer?.email ?? '').toUpperCase()`, rendered as `GOOD MORNING, {displayName}` only if `displayName`
is truthy, else the bare `GOOD MORNING` — exactly matches `01-ux-spec.md`'s Decision 2 code sample,
with no leftover reference to `data.ts`'s `USER` mock anywhere in `MenuScreen.tsx` (confirmed via
`grep` — zero matches for `USER` in the file after the fix).

The suite's own coverage of this (scenarios 6-10 in `menu.spec.ts`) signs up **real customers against
the real backend** (`signup()` drives the actual signup form, hits the real `/store/customers` +
`/auth/...` endpoints) rather than mocking a `customer` prop — "Ada Lovelace" and "Grace Hopper"/
"Rosalind Franklin" are genuinely distinct, freshly-created backend customer records for each test,
and the two-customers test (scenario 10) explicitly logs out and signs up a second real customer to
prove the greeting isn't a shared static value. The phone/email-fallback tests (scenarios 7-8) `PATCH`
the just-created customer directly via `/store/customers/me` with a real bearer token pulled from
`localStorage`, then reload the page and assert the greeting reflects the patched state — this is a
real round trip through the backend's actual customer-update endpoint, not a mocked response. Given
this, "logged-in customer sees their own real name" and "guest sees bare GOOD MORNING, never a name"
are both confirmed against actual persisted backend state, not just a component-level assumption.

### Finding 3 — checkout-empty-cart reroute

Read `App.tsx:71-75` (the `useEffect` reroute) and `App.tsx:195-212` (the `checkout` view branch) —
the old `<StatusMessage text="Your bag is empty." />` dead-end branch is gone entirely; when
`view.kind === 'checkout'` and the cart is empty, the ternary renders `null` for one frame while the
`useEffect` immediately corrects `view` to `{ kind: 'tab', tab: 'bag' }`. Because that lands in the
normal `tab`/`bag` render path, `TabBar` renders unconditionally per the existing `view.tab !== 'chat'`
condition (`App.tsx:258`) — confirmed by reading `TabBar.tsx`, which is the *only* place
`data-testid="tab-bag"`/`"bag-count-badge"` are rendered, so a passing assertion on `tab-bag` being
visible is not incidental — it can only pass if the real `TabBar` component actually mounted.

The `checkout.spec.ts` scenario 11-12 test (`checkout.spec.ts:169-221`) is a genuine race reproduction,
not a directly-driven state transition: it adds a real item, opens the real cart, clicks the real
minus button (driving quantity to 0, which triggers a real `DELETE .../line-items/:id` against the
real backend), holds that specific DELETE response open via `page.route` (a timing-control-only
interception — the request still round-trips to the real backend; nothing about its data or response
body is mocked), clicks the real Pay button while `cart` state is still stale/non-empty (reproducing
the exact "cart emptied out from under the user mid-transition" race from `00-spec.md`), confirms
`checkout-container` renders (proving the stale-cart branch was genuinely hit), then releases the held
response and asserts `browse-menu-button` becomes visible, `tab-bag` is visible, and clicking
`browse-menu-button` lands on a page where `menu-greeting` is visible (Menu tab). This is a real,
non-fabricated reproduction of the described race, and the assertions can only pass if the reroute
actually occurs and TabBar actually renders — confirmed not vacuous.

### Finding 4 — aria-labels

Cross-checked all 12 rows of `01-ux-spec.md`'s Decision 4 table directly against current source
(exact string match, not paraphrase):

| # | File | Expected | Found |
|---|---|---|---|
| 4.1 | `MenuScreen.tsx:62` | `"Notifications"` | `aria-label="Notifications"` — match |
| 4.2 | `MenuScreen.tsx:181` | `` `Add ${featured.name} to bag` `` | `aria-label={`Add ${featured.name} to bag`}` — match (plus `role="button"`/`tabIndex={0}` added, the documented optional extension) |
| 4.3 | `MenuScreen.tsx:240` | `` `Add ${d.name} to bag` `` | `aria-label={`Add ${d.name} to bag`}` — match |
| 4.4 | `DrinkDetailScreen.tsx:47` | `"Back"` | `aria-label="Back"` — match |
| 4.5 | `DrinkDetailScreen.tsx:53` | `"Add to favorites"` | `aria-label="Add to favorites"` — match |
| 4.6 | `DrinkDetailScreen.tsx:193,197` | `"Decrease/Increase quantity"` | both present, exact — match |
| 4.7 | `CartScreen.tsx:87,91` | per-item dynamic | `` `Decrease/Increase quantity of ${it.title}` `` — match |
| 4.8 | `CheckoutScreen.tsx:120` | `"Back"` | `aria-label="Back"` — match |
| 4.9 | `ChatScreen.tsx:92` | `"Back"` (keep `title`) | `title="Back" aria-label="Back"` — match |
| 4.10 | `ChatScreen.tsx:247` | `"Close"` (keep `title`) | `title="Close" aria-label="Close"` — match |
| 4.11 | `ChatScreen.tsx:254` | `"History"` | `aria-label="History"` — match |
| 4.12 | `ChatScreen.tsx:329` | `"Suggestions"` | `aria-label="Suggestions"` — match |

`extras.spec.ts` (scenarios 16-19) and `checkout.spec.ts`/`menu.spec.ts` (the rest) all query these by
real `page.getByRole('button', { name: ... })`/`toHaveAttribute('aria-label', ...)` against the
rendered DOM in a real browser, not by reading source — the full-suite run above confirms these
render correctly at runtime, not just in the source file. The `BubbleChat`/`VoiceChat` back/close
buttons' tests specifically assert `toHaveAttribute('aria-label', ...)` rather than a bare
`getByRole` query, correctly avoiding the false-green risk `03-frontend.md` called out (browsers fall
back to `title` for accessible-name computation, which would make an un-fixed button pass a bare role
query) — confirmed this reasoning is sound by reading how Chromium's accessible-name algorithm
prioritizes `aria-label` over `title` when both are present, and confirming both are indeed present
simultaneously per the table above.

## Review of `03-frontend.md`'s called-out deviations

1. **Category-selection test workaround (`selectCategoryWithPopularRow`)**: verified this is not
   masking a bug. Queried the real backend directly (`GET /store/products?fields=title,*categories`
   against the running docker backend) and confirmed the seeded catalog's category distribution after
   `listDrinks()`'s Size×Milk-variant filter (`new-storefront/src/lib/backend.ts:78-86`) is genuinely
   `Espresso: 2, Cold: 1, Matcha: 1` — i.e. only "Espresso" has 2+ drinks, so the "Popular today" row
   (which needs `filtered.slice(1,3)` to be non-empty) genuinely only renders for that one category.
   This is real, pre-existing seed-data behavior (confirmed independent of this batch's changes), and
   the test helper's fallback-through-known-categories approach is a reasonable, non-brittle way to
   handle it. Not a problem.
2. **`role="button"`/`tabIndex={0}` added to the featured quick-add `<span>`**: `01-ux-spec.md`
   explicitly marked this optional; the addition is a genuine accessibility improvement (makes the
   control keyboard-reachable and `getByRole`-queryable) and doesn't reintroduce Medium-severity
   finding #5 (still a `<span>`, not a native `<button>`) since that finding is about the semantic
   element, not ARIA role. Not a problem — a reasonable, disclosed judgment call.
3. **Untested `quickAdd` "no variant" reject edge case**: confirmed via source read that the code
   change is real (`App.tsx:106`: `if (!variant) return Promise.reject(new Error(...))`) even though no
   scenario exercises it directly. This is a real, if minor, coverage gap — flagging as an open item
   below rather than treating "implemented but untested" as equivalent to "verified."
4. **`DrinkDetailScreen`'s fire-and-forget add-to-bag path left untouched**: confirmed via source read
   (`App.tsx:190-193`, still `void addDrinkWithExtrasToCart(...)` followed by unconditional
   `goTab('bag')`) — this is exactly as `00-spec.md`/`01-ux-spec.md` explicitly allowed (out of scope,
   not required). Not a regression, not silently dropped — correctly disclosed in both `03-frontend.md`
   and here for traceability. Same underlying bug class as Finding 1 still exists on this one screen;
   worth carrying forward as a known, deliberately-deferred item.

No other issues found. `03-frontend.md`'s "all green" report holds up under independent re-verification
— nothing contradicts it.

## Regression check

Full suite (31 tests across all 4 files) passed together in one invocation with no failures and no
observed flakiness. `auth.spec.ts` and `rewards.spec.ts` (unmodified by this batch except incidentally
exercising `featured-quick-add-button`, which changed timing per Deviation 1 in `01-ux-spec.md`) both
passed clean — the checkmark-timing regression (`instant` → `after network resolution`) that
`03-frontend.md` flagged as a risk did not manifest as a failure anywhere; every existing spec that
uses this button waits on downstream cart state (`cart-item` count, etc.) rather than the checkmark
icon itself, so the timing change is invisible to them. No regressions found outside this batch's own
scope.

## Open items (carried forward / newly identified)

1. **No dedicated test for `quickAdd`'s "no matching variant" reject path** (carried forward from
   `03-frontend.md`). Low risk (implementation is a one-line, clearly-correct change and the shape
   mirrors the already-tested general failure path) but genuinely untested. Would need either a way to
   construct/seed a variant-less drink or a targeted mock, neither trivial under this suite's
   real-backend convention — a reasonable next-session pickup if this scenario is ever prioritized, not
   a blocker.
2. **`DrinkDetailScreen`'s identical fire-and-forget add-to-bag bug remains unfixed** (carried forward
   from `00-spec.md`/`01-ux-spec.md`/`03-frontend.md`, all of which explicitly scoped it out). Flagging
   again per those docs' own instruction not to let it be "rediscovered as new" — this is a known,
   deliberate scope exclusion requiring a human/product decision on priority, not a pipeline defect.
3. **Docker `new-storefront` container / uncommitted `docker-compose.yml`+`Dockerfile` changes**
   (unrelated to this batch, first surfaced in `03-frontend.md`): still stopped/uncommitted as found.
   Not this pipeline's scope to resolve, but a human should decide whether that in-progress
   containerization work should be finished, reverted, or left as-is — it's currently in a
   half-modified state in git status.
4. **Nothing found in this pass that changes `03-frontend.md`'s "all green" verdict.** All 4 findings'
   fixes verified both by an independent full-suite run and by direct source inspection against
   `01-ux-spec.md`'s exact specified behavior/copy/testids/aria-labels.

## Handoff

This is the last stage of the pipeline for this slug. No further pipeline stage follows. Rollup:
[`docs/sessions/015-new-storefront-high-severity-ux-fixes.md`](../../sessions/015-new-storefront-high-severity-ux-fixes.md).
