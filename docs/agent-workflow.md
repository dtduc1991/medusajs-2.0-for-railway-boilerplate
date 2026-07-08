# Agent pipeline: TDD + UX/UI feature workflow

A 5-stage pipeline of specialized subagents (`.claude/agents/`) for building features/bugfixes in
this repo under TDD (red→green→refactor) with a UX/UI gate before any frontend code, and a
mandatory markdown handoff file between every stage so the pipeline is traceable end to end.

This is driven manually: each stage is a separate `Agent` tool call from the main Claude Code
conversation (subagents don't spawn each other). You (the driver — human or a Claude Code session)
run the stages in order, passing the feature slug and prior handoff path forward.

## The stages

```
1. feature-planner        →  docs/handoffs/<slug>/00-spec.md
2. ux-designer             →  docs/handoffs/<slug>/01-ux-spec.md          (skip: pure backend/no UI)
3. backend-tdd-engineer    →  docs/handoffs/<slug>/02-backend.md          (skip: no backend change)
4. frontend-tdd-engineer   →  docs/handoffs/<slug>/03-frontend.md         (skip: no UI change)
5. e2e-verifier            →  docs/handoffs/<slug>/04-verification.md
                           →  docs/sessions/NNN-<slug>.md   (rollup, human-facing)
```

Each agent's definition (`.claude/agents/<name>.md`) already encodes: what to read before starting,
what its job is, and what it must write before finishing. This doc is the map between stages, not a
restatement of each agent's job — read the agent files for stage-specific detail.

See `docs/agent-workflow-examples.md` for worked example prompts (full-stack feature, frontend-only,
backend-only, bug fix, resuming a blocked pipeline).

## Running it

1. Invoke `feature-planner` with the raw feature request. It picks a feature slug and decides which
   sides (backend / `storefront` / `new-storefront`) are affected, writing that decision into
   `00-spec.md` along with numbered test scenarios.
2. If any UI is affected, invoke `ux-designer` next, pointing it at the slug. It reads `00-spec.md`
   and writes `01-ux-spec.md`. **This must happen before `frontend-tdd-engineer` runs** — the UX
   spec is what the frontend TDD stage builds against, not a free-standing design doc reviewed
   after the fact.
3. If backend changes are needed, invoke `backend-tdd-engineer`. It implements red→green against
   the spec's scenarios and writes `02-backend.md`. If the repo's backend test runner still isn't
   wired up (true as of this writing — see `CLAUDE.md`), bootstrapping it is this stage's job, not
   a separate task.
4. If UI changes are needed, invoke `frontend-tdd-engineer` — after step 3 if the frontend depends
   on new backend behavior (check `02-backend.md` for endpoint-shape/env/seed prerequisites first).
   It implements red→green using Playwright as the TDD loop (this repo has no component-level test
   runner in either storefront) and writes `03-frontend.md`.
5. Always invoke `e2e-verifier` last, even if a stage was skipped — it runs the full relevant
   Playwright suite(s) against a real stack, verifies empirically (spot-checking persisted state
   directly, not just trusting "tests passed" — this repo has a track record of bugs only caught
   that way, see `docs/sessions/014-*.md`), writes `04-verification.md`, then rolls the whole
   feature up into `docs/sessions/NNN-<slug>.md` per the existing `session-notes` skill convention.

## Stage skipping

A stage is skipped only when the spec (`00-spec.md`) explicitly says why — e.g. a pure backend
data-migration script has no `ux-designer`/`frontend-tdd-engineer` stage; a pure copy-text change
might skip `backend-tdd-engineer`. Never skip silently: if a later stage expected a file that
doesn't exist, that's a signal to check `00-spec.md`'s stated scope, not to assume it was forgotten.

## Handoff files vs. existing docs conventions

Two markdown conventions now coexist in `docs/` — they serve different readers, don't merge them:

- **`docs/handoffs/<slug>/`** (new, this pipeline) — granular, one file per pipeline stage, written
  *by* one agent *for* the next agent in the same feature's pipeline run. Working trace, not meant
  to be read standalone by a human looking for "what happened last month."
  Template: `docs/handoffs/TEMPLATE.md`.
- **`docs/sessions/NNN-*.md`** (existing, `session-notes` skill) — one entry per feature/session,
  written once at the end (by `e2e-verifier` in this pipeline), for a future *human session* with
  zero context. Links into `docs/handoffs/<slug>/` for detail rather than restating it.
- **`docs/flows/*.md`** (existing) — standing UX reference material for browse/search/PDP, cart,
  checkout. The pipeline *reads* these (via `feature-planner`/`ux-designer`) but does not rewrite
  them — if a feature meaningfully changes one of these flows, update the relevant `docs/flows/`
  file as part of the feature's own commit, separately from the handoff trace.

## Known repo constraints that shape every run of this pipeline

- No backend test runner is wired up yet (Jest + `@medusajs/test-utils` are present as
  devDependencies only) — `backend-tdd-engineer` bootstraps one on first real use.
- Two independent frontends exist: `storefront/` (Next.js, documented in `CLAUDE.md`) and
  `new-storefront/` (Vite/React "Ember Coffee App", its own `design-reference/` and Playwright
  suite) — `feature-planner` must state which one(s) a feature targets; don't assume "the
  storefront" means only one of them.
- Only a `eur`/Europe region is seeded (`backend/src/scripts/seed.ts`) — features assuming
  `us`/`usd` need that called out as a prerequisite, not discovered mid-implementation.
