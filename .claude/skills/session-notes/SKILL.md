---
name: session-notes
description: Write or update a numbered handoff doc in docs/sessions/ documenting what was worked on, root causes/solutions found, and open items for the next agent. Use when the user says "take notes on this session", "write a handoff doc", "log this session", "update docs/sessions", or at the end of a nontrivial work session in this repo.
---

# Session notes

Writes this repo's session handoff docs: `docs/sessions/NNN-kebab-case-title.md`. These exist so a future agent with zero conversation history can pick up the work — write for that reader, not for a human skimming a changelog.

## Steps

1. **Find the next number.** List `docs/sessions/*.md`, take the highest `NNN` prefix, increment (zero-padded to 3 digits). Never reuse or renumber existing files.
2. **Name the file** `NNN-kebab-case-title.md` — title describes the outcome, not the ticket (e.g. `010-fix-subtotal-shipping-tax-semantics.md`, not `010-session.md`).
3. **Write the doc** using the structure below.
4. **Link, don't duplicate.** Reference other session docs, ADRs, or PRDs with relative markdown links (`[009-....md](009-....md)`) instead of restating their content. Reference source files as `[path/file.ts:42](../../path/file.ts#L42)` (relative from `docs/sessions/`).
5. If this session directly continues an open item from a prior doc, say so explicitly and name which numbered item it resolves.

## Structure

```md
# Handoff: <one-line outcome, not the task ticket>

## Context

Repo/task framing in 2-4 sentences. If this continues a prior session, link it and quote
the specific open item being addressed. State status up front: **Done**, **Done but
partial**, **Blocked**, etc. — plus anything left in a non-default state (persistent
deploy changes, running containers, stray test data).

## <Freeform body sections — name them for what actually happened>

Not a fixed template past this point. Use whatever sections fit the work: "Root cause",
"Bug #1: ...", "Files changed", "Design decisions". For each fix/finding capture:
- **Why**, not just what — the root cause, not only the diff.
- File/line references as relative links.
- Commit hashes if committed.
- Gotchas hit and how they were caught (a wrong assumption, a flaky rerun, an empirical
  finding vs. one derived from reading code) — this is often the most valuable part for
  the next agent, more than the fix itself.

## Verification performed

What was actually run/tested, against what environment (local docker-compose vs. live
Railway deploy — say which), and the actual result (counts, pass/fail, curl output).
Do not write this section if nothing was verified — say so plainly instead ("not run
this session") rather than omitting it silently.

## Open items / what the next agent should do

Numbered, concrete, actionable — not "investigate further" but what to run/check first
and why it's the likely next step. Include anything left in a non-default state here too
(carried over from Context if relevant). Carry forward any prior open items not resolved
this session instead of letting them silently drop.

## Suggested skills for the next session (optional)

Only if a specific skill (e.g. `/code-review`, `tdd`) clearly fits the open items.
```

## Rules

- One doc per session/task, not per commit. If continuing the same task across multiple
  turns in one sitting, keep updating the same file until the task concludes.
- Never invent verification that wasn't performed. If something is assumed-but-unverified,
  label it as such (see session 010's item 3 for the pattern).
- Keep prose dense — this repo's existing docs favor precise, technical paragraphs over
  bullet fragments. Match that register.
- Do not create `docs/sessions/README.md` or an index file — `CLAUDE.md` already
  summarizes the convention; don't duplicate that index here.
