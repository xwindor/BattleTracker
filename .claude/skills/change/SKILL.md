---
name: change
description: Run a non-rules change — UI, refactor, bug fix, performance, ergonomics — through the lightweight pipeline: spec, gate, implementation, adversarial review. Use when the change does not depend on what the Shadowrun rulebook says.
---

Run the change request below through the pipeline. Follow the stage order
exactly. Do not compress stages, do not skip the gate, and do not do a stage's
work yourself instead of delegating it — the isolation between subagents is the
entire mechanism.

Change request: $ARGUMENTS

## Stage 0 — is this the right pipeline?

If the change depends on what the SR5 rulebook says — a mechanic, a number, a
timing question, anything where "is this what the book says" is a real question
— stop and tell me to use `/feature` instead. Say which part is rules-dependent.

If the change is trivial (a CSS tweak, a rename, a one-line fix with no other
call sites), stop and tell me to just ask directly. This pipeline is overhead
that small changes don't earn.

## Stage 1 — spec

Delegate to the `sr5-change-scoper` subagent. Pass it the request verbatim and
the instruction to read `ARCHITECTURE.md` and `CLAUDE.md` before anything else.

Write its two documents: `briefs/<slug>.md` (plain-language, for me) and
`briefs/<slug>-spec.md` (technical, for the implementer).

**GATE — stop here.** Show me `briefs/<slug>.md` and wait. Note that
`briefs/<slug>-spec.md` also exists if I want to read the technical detail. Do
not proceed until I say so. If I answer the open decisions, add my answers
into `briefs/<slug>.md` first.

## Stage 2 — implement

Delegate to the `sr5-implementer` subagent. Pass it the path to
`briefs/<slug>-spec.md` and the instruction to read `ARCHITECTURE.md` and
`CLAUDE.md` before writing anything. The spec is the complete specification —
it must stop and report gaps rather than filling them in. It must fix every
path in the affected-paths map, not just the one that prompted the request.

## Stage 3 — review

Delegate to the `sr5-change-reviewer` subagent. Pass it the paths to both
`briefs/<slug>.md` and `briefs/<slug>-spec.md`, and the files changed in
Stage 2. It reports only, never fixes.

When you relay the reviewer's output to me, lead with its Plain summary. Do not
paste raw technical output as the first thing I read.

If the verdict is FAIL or PASS WITH FIXES, delegate the defect list to a fresh
`sr5-implementer`, then re-run a fresh `sr5-change-reviewer`. Cap at two loops.

On a third failure, stop and diagnose before fixing further. Report which it is:

- The spec is wrong or incomplete — go back to Stage 1.
- The implementation is incomplete — the same defect keeps appearing in paths
  earlier rounds didn't touch. Search exhaustively for the defect class and
  propose one shared choke point. Show me the design before implementing.
- Genuinely separate defects — say so and I'll decide what to fix or backlog.

Never launch a third fix round without naming which of the three this is.

## Stage 4 — summary

Lead with a plain-language summary — three to six sentences on what changed,
what it means at the table, and anything I need to decide. Below that, show me:
what changed file by file, the review verdict (led by the reviewer's Plain
summary, not its raw technical output), any unfixed defects with severity, and
a short numbered tap-through script exercising the riskiest scenario. Then stop.

## Stage 5 — only after I approve

Lead everything you show me in this stage with a plain-language summary of what
happened and what it means for the tracker in play. Test output, diffs, and
other technical detail go below it.

1. Move scenario tests into `src/scenarios/` and confirm they run under the
   standard test command. Run the full suite and show real output.
2. Check whether this changed anything `ARCHITECTURE.md` describes. If so,
   update it and show me the diff. If not, say so explicitly.
3. Stage everything and show the diff summary. Don't commit unless I ask.

## Standing rules

- Every output shown to Xavier leads with a plain-language summary. He is not a
  software engineer. Technical detail goes below it, never instead of it.
- Work in the main checkout. Do not create worktrees or branches.
- If any subagent reports a gap or contradiction, surface it rather than
  resolving it silently.
