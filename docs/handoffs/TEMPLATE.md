# Handoff template — inter-agent trace

Copy this into `docs/handoffs/<feature-slug>/NN-<stage>.md`. One file per pipeline stage (see
`docs/agent-workflow.md`), not per commit. This is a *working trace between agents*, not the final
human-facing recap — that's `docs/sessions/` (existing `session-notes` skill), written once at the
end by rolling up every stage file below.

Register: match `docs/sessions/` and `docs/flows/` — dense, precise, technical prose. Say
"not done"/"not run" plainly rather than implying something happened that didn't.

```md
# <slug> / <NN>-<stage> — <one-line outcome, not the task name>

## Inputs

- Feature slug: `<feature-slug>`
- Prior stage file: [`NN-<prev-stage>.md`](NN-<prev-stage>.md) — or "none (first stage)"
- What this stage was asked to do, in 1-2 sentences (quote the relevant acceptance
  criterion/scenario number from `00-spec.md` if applicable).

## What was done

Freeform, named for what actually happened (e.g. "Bootstrapped Jest integration-test runner",
"Added `phone-input` state to checkout form"). For each change:
- **Why**, not just what.
- File/line references as relative links, e.g. `[../../backend/src/api/foo/route.ts:42](../../backend/src/api/foo/route.ts#L42)`.
- Gotchas hit and how they were caught (empirical vs. derived from reading code).

## Tests (TDD stages only — backend/frontend engineer)

- Test(s) added/extended, with the exact scenario from the spec they cover.
- **Red**: command run, failure output/summary, confirming the test actually failed for the right reason.
- **Green**: command run, pass output/summary, after implementation.
- Anything intentionally left untested and why.

## UX notes (ux-designer stage only)

States covered (loading/empty/error/success), accessibility notes, copy, and which existing
component patterns or `design-reference/` mockups this follows or deviates from.

## Verification performed (e2e-verifier stage only)

What was actually run, against what environment (docker-compose vs. Railway — say which), and the
actual result. Empirical checks (curl, psql, browser) preferred over "tests passed" alone.

## Open items

Numbered, concrete. Carry forward anything unresolved from the prior stage file instead of letting
it silently drop.

## Handoff — next stage

Name the next stage file this produces (or "none — this is the last stage, rolling up to
`docs/sessions/NNN-<slug>.md` now") and the explicit task for whoever/whatever picks it up next.
```
