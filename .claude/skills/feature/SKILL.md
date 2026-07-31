---
name: feature
description: Run a Shadowrun 5e tracker feature request through the full rules-verified pipeline — rules brief, implementation, adversarial validation, approval brief. Use for any change touching game rules.
---

Run the feature request below through the full pipeline. Follow the stage order
exactly. Do not compress stages, do not skip the gate, and do not do a stage's
work yourself instead of delegating it — the isolation between subagents is the
entire mechanism.

Feature request: $ARGUMENTS

## Stage 1 — brief

Delegate to the `sr5-rules-analyst` subagent. In the prompt you pass it,
include: the feature request verbatim, the instruction to read `RULINGS.md`
first and treat existing rulings as binding, and the instruction to cite only
printed page numbers it has actually opened in `rules/`.

When it returns, write the brief to `briefs/<slug>.md` where `<slug>` is a
short kebab-case name for the feature. Create `briefs/` if it doesn't exist.

**GATE — stop here.** Show me the brief and wait. Do not proceed to Stage 2
until I say so. If I answer the open rulings questions, add my answers into the
brief file before continuing.

## Stage 2 — implement

Delegate to the `sr5-implementer` subagent. Pass it: the path to the brief
file, the instruction to read `ARCHITECTURE.md` and `CLAUDE.md` before writing
anything, and the reminder that the brief is the complete spec — it must not
consult `rules/` or add rules knowledge of its own, and must stop and report
gaps rather than filling them in.

## Stage 3 — validate

Delegate to the `sr5-rules-validator` subagent. Pass it: the path to the brief,
the paths of files changed in Stage 2, and the instruction to report only, never
fix. It has `rules/` access and must independently re-derive every citation in
the brief rather than trusting it.

If the verdict is FAIL or PASS WITH FIXES, delegate the defect list back to a
fresh `sr5-implementer`, then re-run a fresh `sr5-rules-validator`. Cap at two
loops. On a third failure, stop and tell me the brief itself needs revisiting —
do not keep patching against a spec that may be wrong.

## Stage 4 — approval brief

Delegate to `sr5-approval-brief`. Pass it the brief path and the validator's
report. Show me its output and stop.

## Stage 5 — only after I approve

When I say approved:

1. Move the scenario tests into `tests/scenarios/` and confirm they run as part
   of the standard test command. Run the full suite and show me real output.
2. Check whether this feature changed anything `ARCHITECTURE.md` describes —
   state shape, boundary semantics, where logic lives, participant model, undo
   behaviour. If so, update the affected sections to match the new code and
   show me the diff. If nothing structural changed, say so explicitly and
   change nothing.
3. Append any table rulings I decided to `RULINGS.md`, each with today's date
   and the reasoning.
4. Stage everything and show me the diff summary. Don't commit unless I ask.

## Standing rules

- Never cite a rulebook page that wasn't confirmed present in `rules/`.
- Never paste rulebook prose into source files or docs. Paraphrase and cite.
- If any stage's subagent reports a gap or a contradiction, surface it to me
  rather than resolving it silently.
