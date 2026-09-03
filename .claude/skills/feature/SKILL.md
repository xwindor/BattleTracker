---
name: feature
description: Run a Shadowrun 5e tracker feature request through the full rules-verified pipeline — rules brief, implementation, adversarial validation, approval brief. Use for any change touching game rules.
---

Run the feature request below through the full pipeline. Follow the stage order
exactly. Do not compress stages, do not skip the gate, and do not do a stage's
work yourself instead of delegating it — the isolation between subagents is the
entire mechanism.

Feature request: $ARGUMENTS

## Stage 1a — rules brief

Delegate to the `sr5-rules-analyst` subagent. In the prompt you pass it,
include: the feature request verbatim, the instruction to read `SCOPE.md` and
`RULINGS.md` first — treating existing rulings as binding and `SCOPE.md` as the
product boundary — and the instruction to cite only printed page numbers it has
actually opened in `rules/`.

When it returns, write its two documents: `briefs/<slug>.md` (plain-language,
for me) and `briefs/<slug>-spec.md` (technical, for the implementer), where
`<slug>` is a short kebab-case name for the feature. Create `briefs/` if it
doesn't exist.

`briefs/<slug>.md` must include these two sections, written in plain terms:

- **Not building — and why** — the straightforward exclusions, in plain terms.
- **Scope questions for you** — the things that could go either way, each with
  the case for and the case against, phrased so I can answer without reading
  code. State clearly that answering these may mean updating `SCOPE.md`.

## Stage 1b — implementation plan

Delegate to the `sr5-change-scoper` subagent. Pass it: the path to
`briefs/<slug>-spec.md` from Stage 1a, and the instruction to read
`ARCHITECTURE.md` and `CLAUDE.md`. It does NOT re-derive rules — the analyst's
output is the rules spec. Its job is the implementation plan: current
behaviour with file:line references, every affected path (including places
exhibiting the same pattern that the request didn't mention), the proposed
approach and where the change belongs, and regression risk. It appends to both
documents from Stage 1a — plain language to `briefs/<slug>.md`, technical
detail to `briefs/<slug>-spec.md`.

**GATE — stop here.** Show me `briefs/<slug>.md` and wait. Note that
`briefs/<slug>-spec.md` also exists if I want to read the technical detail. Do
not proceed to Stage 2 until I say so. If I answer the open rulings questions
or open decisions, add my answers into `briefs/<slug>.md` before continuing.

## Stage 2 — implement

Delegate to the `sr5-implementer` subagent. Pass it: the path to
`briefs/<slug>-spec.md`, the instruction to read `ARCHITECTURE.md` and
`CLAUDE.md` before writing anything, and the reminder that the spec is the
complete spec — it must not consult `rules/` or add rules knowledge of its
own, and must stop and report gaps rather than filling them in. It must fix
every path in the affected-paths map, not only the one that prompted the
request.

## Stage 3 — validate

Delegate to the `sr5-rules-validator` subagent. Pass it: the paths to both
`briefs/<slug>.md` and `briefs/<slug>-spec.md`, the paths of files changed in
Stage 2, and the instruction to report only, never fix. It has `rules/` access
and must independently re-derive every citation in the brief rather than
trusting it.

When you relay the validator's output to me, lead with its Plain summary. Do
not paste raw technical output as the first thing I read.

If the verdict is FAIL or PASS WITH FIXES, delegate the defect list back to a
fresh `sr5-implementer`, then re-run a fresh `sr5-rules-validator`. Cap at two
loops.

On a third failure, stop and diagnose before fixing anything further. Report
which of these it is:

- The brief is wrong or incomplete — citations don't hold up, acceptance
  criteria are ambiguous or missing cases. Go back to Stage 1.
- The implementation is incomplete — the brief is sound, but the same defect
  keeps appearing in code paths earlier rounds didn't touch. Before fixing
  again, search exhaustively for every path that could exhibit the defect class
  and propose routing them through one shared choke point. Show me the design
  before implementing.
- Genuinely separate defects — unrelated problems that surfaced together. Say
  so, and I'll decide whether to fix or backlog each.

Never launch a third fix round without naming which of the three this is.

## Stage 4 — approval brief

Delegate to `sr5-approval-brief`. Pass it the paths to both `briefs/<slug>.md`
and `briefs/<slug>-spec.md`, and the validator's report. Show me its output —
led by its Plain summary, never raw technical output first — and stop.

## Stage 5 — only after I approve

When I say approved:

Lead everything you show me in this stage with a plain-language summary of what
happened and what it means for the tracker in play. Test output, diffs, and
other technical detail go below it.

1. Move the scenario tests into `src/scenarios/` and confirm they run as part
   of the standard test command. Run the full suite and show me real output.
2. Check whether this feature changed anything `ARCHITECTURE.md` describes —
   state shape, boundary semantics, where logic lives, participant model, undo
   behaviour. If so, update the affected sections to match the new code and
   show me the diff. If nothing structural changed, say so explicitly and
   change nothing.
3. Append any table rulings I decided to `RULINGS.md`, each with today's date
   and the reasoning.
4. If I answered a scope question in a way that changes the product boundary,
   update `SCOPE.md` with the decision and today's date — the same way table
   rulings go to `RULINGS.md`. Show me the diff.
5. Stage everything and show me the diff summary. Don't commit unless I ask.

## Standing rules

- Scope every proposal against `SCOPE.md`. Finding a rule does not mean
  implementing it.
- Scope exclusions are proposals for Xavier to approve, never filters applied
  silently.
- Every output shown to Xavier leads with a plain-language summary. He is not a
  software engineer. Technical detail goes below it, never instead of it.
- Never cite a rulebook page that wasn't confirmed present in `rules/`.
- Never paste rulebook prose into source files or docs. Paraphrase and cite.
- If any stage's subagent reports a gap or a contradiction, surface it to me
  rather than resolving it silently.
- Work in the main checkout. Do not create worktrees or branches.