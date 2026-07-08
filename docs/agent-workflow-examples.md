# Agent pipeline — example use cases

Concrete prompts for driving the pipeline described in `docs/agent-workflow.md`. Each stage is a
separate `Agent` tool call with `subagent_type` set to the agent's name
(`feature-planner`, `ux-designer`, `backend-tdd-engineer`, `frontend-tdd-engineer`,
`e2e-verifier`) — the driver (you, talking to Claude Code) doesn't need to invoke them directly;
asking in plain language is enough, but knowing the shape of each stage's prompt helps you steer it
or resume mid-pipeline. Every stage reads the prior `docs/handoffs/<slug>/NN-*.md` file(s) itself —
you generally only need to give the *first* stage full context; later stages, you mostly just need
to point at the slug.

## Use case 1 — full-stack feature (backend + UX gate + frontend)

Scenario: a change that needs new backend behavior, has real UI/UX surface, and should go through
every gate.

**What you say to Claude Code:**
> Add a "Reorder last order" button to `new-storefront`'s account/order-history area. It re-adds
> every line item from the customer's most recent completed order into the current cart. If a line
> item is no longer purchasable, skip it and show a note listing what was skipped. Run this through
> the agent pipeline.

**Stage 1 — `feature-planner` prompt** (what Claude Code passes via the `Agent` tool):
```
Feature request: "Add a 'Reorder last order' button to the logged-in customer's order
history/account area in new-storefront, which re-adds every line item from their most recently
completed order back into the current cart. Skip line items no longer available/purchasable and
show a note listing what was skipped."

Pick a feature slug, check docs/ for relevant existing context (order history, cart, rewards areas
of new-storefront), determine affected side(s), and write docs/handoffs/<slug>/00-spec.md.
```
Expect: slug like `reorder-last-order`, affected sides = backend (needs an endpoint or reuse of
existing cart/order APIs to fetch the last order and check purchasability) + `new-storefront` UI.

**Stage 2 — `ux-designer`:**
```
Feature slug: reorder-last-order. Read docs/handoffs/reorder-last-order/00-spec.md and write
01-ux-spec.md — cover the button's placement/states (loading while re-adding, success, partial
success with skipped-items note, no-prior-order empty state), and propose data-testids.
```

**Stage 3 — `backend-tdd-engineer`** (only if `00-spec.md` says backend work is needed):
```
Feature slug: reorder-last-order. Read 00-spec.md and 01-ux-spec.md. Implement whatever backend
support is needed (e.g. an endpoint to fetch the last completed order with current purchasability
per line item) red-green-refactor against the spec's test scenarios. Write 02-backend.md.
```

**Stage 4 — `frontend-tdd-engineer`:**
```
Feature slug: reorder-last-order. Read 00-spec.md, 01-ux-spec.md, and 02-backend.md. Implement the
button + cart re-add flow in new-storefront red-green using Playwright. Write 03-frontend.md.
```

**Stage 5 — `e2e-verifier`** (always last):
```
Feature slug: reorder-last-order. Read all prior handoff files. Run new-storefront's full
Playwright suite against the docker-compose stack (or a locally running backend + `npm run dev`),
spot-check the actual cart contents after a reorder via the API directly, write 04-verification.md,
then roll up into docs/sessions/NNN-reorder-last-order.md.
```

## Use case 2 — frontend-only UI change (no backend work)

Scenario: copy/interaction change with no API surface — e.g. making the checkout login nudge from
`docs/sessions/014-*.md` collapsible instead of dismiss-only.

**What you say:**
> Make the guest checkout login nudge in `new-storefront` collapsible (tap to collapse/expand)
> instead of only dismissible. Run it through the pipeline, skip the backend stage.

- `feature-planner` writes `00-spec.md` and explicitly notes **"backend-tdd-engineer: skip — no
  API surface, UI-only interaction change"** — the skip reason belongs in the spec file, not just
  in your prompt, so a later reader of the trace knows it was deliberate.
- `ux-designer` → `01-ux-spec.md` (collapsed/expanded states, animation notes, testids).
- Skip straight to `frontend-tdd-engineer` → `03-frontend.md`.
- `e2e-verifier` → `04-verification.md` + `docs/sessions/NNN-*.md` as usual.

## Use case 3 — backend-only change (no UI)

Scenario: a one-off data/admin task with no customer-facing UI — e.g. a script to backfill
`is_default_shipping` on existing customer addresses.

**What you say:**
> Write a script that backfills `is_default_shipping = true` on each customer's oldest address
> where no address is currently marked default. Run it through the pipeline; there's no UI so skip
> ux-designer and frontend-tdd-engineer.

- `feature-planner` → `00-spec.md`, affected side = backend only, both UI stages marked skip with
  reason ("no customer-facing surface").
- `backend-tdd-engineer` → `02-backend.md` (test scenarios likely: customer with no default gets
  one set, customer with an existing default is untouched, idempotent on re-run).
- `e2e-verifier` still runs — even backend-only changes get the empirical-check treatment (e.g.
  query the DB directly before/after, per this repo's habit of not trusting a migration script's
  own "did it work" logic — see `docs/sessions/014-*.md`'s `geo_zone` incident) — and still writes
  the `docs/sessions/` rollup.

## Use case 4 — bug fix found during manual testing

Scenario: you noticed the `storefront` checkout doesn't show a shipping-method error state when the
selected country has no service zone.

**What you say:**
> There's a bug: storefront checkout silently does nothing if you pick a country with no shipping
> service zone — no error shown. Fix it through the pipeline.

Frame it as a spec like any other feature, just with a **repro** instead of a feature ask:
```
Bug report: in storefront checkout, selecting a country with no matching shipping service zone
does not show an error — the "continue" button silently no-ops. Expected: a visible error state
telling the customer no shipping is available for that country.

Write docs/handoffs/checkout-no-shipping-zone-error/00-spec.md: reproduce the current behavior
first (read the relevant checkout module code, confirm the failure mode), then write acceptance
criteria + test scenarios for the fix.
```
Everything downstream (ux-designer for the error state's copy/placement, frontend-tdd-engineer for
the fix + regression test, e2e-verifier) proceeds exactly as in use case 1.

## Use case 5 — resuming a blocked pipeline

Scenario: a previous run got through `backend-tdd-engineer` but stalled before the frontend stage
(mirrors what actually happened in `docs/sessions/014-*.md` — code complete, blocked on a DB state
issue, picked up again in a later session).

**What you say:**
> Pick up the `phone-login` pipeline — 00-spec.md through 02-backend.md already exist in
> docs/handoffs/phone-login/. Resume from frontend-tdd-engineer.

```
Feature slug: phone-login. Read docs/handoffs/phone-login/00-spec.md, 01-ux-spec.md, and
02-backend.md (note any "Open items" it left — confirm those are actually resolved before building
on top of them, don't assume the handoff file is still accurate without checking). Implement the
frontend side and write 03-frontend.md.
```
This is why every stage is instructed to re-check the prior stage's "Open items" rather than
trusting them blindly — a resumed pipeline is exactly when a stale assumption bites.

## Tips

- You rarely need to write these prompts yourself — describing the feature/bug to Claude Code and
  saying "run it through the agent pipeline" is enough; it will drive the stages using
  `docs/agent-workflow.md`.
- If you already know a stage should be skipped, say so up front (use case 2/3) — it saves
  `feature-planner` from having to infer it, though it should reach the same conclusion on its own.
- To just get a spec/estimate without committing to implementation, ask for `feature-planner` (and
  optionally `ux-designer`) only, and stop there — nothing forces you through the whole pipeline in
  one sitting.
