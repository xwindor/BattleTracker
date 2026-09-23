# Seize the Initiative — technical rules spec

**First line: Core does not classify Seize the Initiative as an Interrupt
Action.** It is an Edge Effect, printed in full at Core p. 56 as well as in the
"Initiative and Edge" sidebar at Core pp. 160–161 — not only at Core pp. 160–161, as
this brief's earlier citations could be read to imply (round-6 validator
citation fix, `briefs/seize-initiative.md` companion note). The
Interrupt Actions framework (Core p. 167) is a separate mechanic with different
triggers and a different cost currency (Initiative Score, not Edge); Seize is
neither listed among its examples nor cross-referenced from it. Any
implementation modelled on Interrupt Action semantics — e.g. gating it the way
`Participant.canUseAction` gates Full Defence — is modelling the wrong mechanic.

## Request

Re-derive the printed rule for Seize the Initiative and test Xavier's proposed
reading against it: what it is, what it costs, when it may be declared, how long
it lasts, and specifically whether a seizer keeps taking full Action Phases in
every pass until every other participant is at 0 or below, regardless of the
seizer's own Score.

## Governing rules

1. **Seize the Initiative is an Edge Effect:** the character moves to the top of
   the initiative order, regardless of their Initiative Score. (Core p. 160)
2. **Cost: one point of Edge**, as with any Edge effect, and no more than one
   point on any single test or action. (Core p. 56)
3. **Multiple seizers** in the same Combat Turn go before everyone else, ordered
   among themselves by their own Initiative Scores; non-seizers then act by
   their own Scores as normal. (Core p. 160–161)
4. **Duration: the whole Combat Turn**, across multiple Initiative Passes; the
   character returns to their ordinary position at the start of the next Combat
   Turn. (Core p. 161)
5. **Initiative Score** = Initiative Test roll + Initiative Attribute; highest
   acts first each pass. (Core p. 159)
6. **Pass decay and the zero floor:** every Score drops by 10 at the end of each
   pass (Core p. 159); anyone still above 0 acts again; this repeats until all
   are at 0 or less, ending the Combat Turn. A character at 0 or below may take
   one Free Action per pass and may still defend, but gets no further Simple or
   Complex action. (Core p. 160)
7. **Late entrants** roll normally, then subtract 10 per Initiative Pass already
   elapsed. (Core p. 160)
8. **Interrupt Actions** are a distinct mechanic: an action taken outside one's
   own Action Phase, paid for from the character's remaining Initiative Score,
   and usable before a first Action Phase only if not surprised. Full Defence is
   the book's example. (Core p. 167)
9. **Delayed Actions are procedurally anchored; Seize is not.** A Delayed Action
   must be declared at Step 3A of the Combat Turn Sequence; Seize has no
   equivalent stated step. (Core p. 161; sequence at Core p. 158)

## Interactions and exceptions

- **Wound modifiers** hit the Initiative Attribute immediately and can reorder
  within a pass, but never grant an extra action (Core p. 159–160). They apply
  to a seizer exactly as to anyone else.
- **Surprise** (Core p. 192) costs 10 Initiative Score and bars Defence Tests
  unless Edge is spent to avoid it — a *different* Edge spend from Seize. The
  Interrupt Action restriction on a surprised character is written for Interrupt
  Actions, which Seize is not.
- **`RULINGS.md` 2026-07-31** ("No floor on Initiative Score") applies to a
  seizer's own Score once they have one.
- **`RULINGS.md` 2026-08-07** (Simple/Complex blocked at 0 or below; Free
  Actions and defence are not) is the general rule in item 6 and is not
  overridden anywhere in the printed Seize text.
- **`RULINGS.md` contains no entry for Seize the Initiative.** The current app
  behaviour — an unrolled seizer exempt from the "hasn't rolled" skip — exists
  only in code comments (`CombatManager.ts`, dated 2026-09-19) and in
  `briefs/mid-turn-joiner-spec.md` items 6, 9 and 10. It was never promoted to a
  dated ruling. Whatever Xavier decides here is what belongs there.

## Edge cases the book defines

1. Two or more seizers: ordered among themselves by their own Scores, then
   everyone else by theirs. (Core p. 160–161)
2. A character at 0 or below, seized or not, gets one Free Action per pass and
   may defend, but no Simple or Complex action. (Core p. 160)
3. A late entrant's Score takes −10 per elapsed pass. (Core p. 160)
4. Only one Edge point per test or action: Seize cannot be stacked or
   re-purchased mid-turn for further effect. (Core p. 56)

## Undefined / needs a table ruling

1. **Does the book require a rolled Initiative Score before Seize may be
   declared?** Not stated. Strongly implied by "regardless of your Initiative
   Score" and by ordering several seizers by their Scores — both presuppose a
   Score exists. **Recommended default: require a rolled Score.** It resolves
   the case that prompted this brief.
2. **Is there a procedural moment at which Seize must be declared?** No — unlike
   a Delayed Action (Step 3A). **Recommended default: any point after the
   character has a rolled Score this Combat Turn.**
3. **Does a seizer's own Score still decay and still gate them at 0 or below?**
   No exemption appears in the Seize text, and the general rule makes none.
   **Recommended default: yes — Seize changes rank only, never the seizer's own
   Score or their eligibility threshold.** This contradicts the "special value,
   keeps acting until everyone else is ≤ 0" framing in the request.
4. **How are two tied seizers ordered?** Not stated for this case. **Recommended
   default: the ordinary ERIC tie-break** (Core p. 159).
5. **Does a seizer at 0 or below still occupy the top slot for their
   Free-Action-only turn?** Not addressed. **Recommended default: yes** — the
   text never withdraws their rank. Low stakes.

## Scope classification

**TRACK**
- That a participant has seized this Combat Turn, persisting across passes and
  clearing at the next Combat Turn (Core p. 160–161).
- The participant's own running Score, decaying 10 a pass and gating
  Simple/Complex at 0 or below — already tracked; the change is to stop carving
  a seizer out of it.
- Ordering seizers among themselves by Score, and everyone else after them
  (Core p. 160–161).
- The one-Edge cost of the declaration, insofar as Edge spending is tracked.

**GM RESOLVES**
- Whether to allow a Seize declared at a moment the book doesn't explicitly
  authorise (mid-pass, mid-turn).
- Tie-breaking via the coin-toss leg of ERIC, or the GM's simultaneous-action
  alternative (Core p. 159).

**OUT OF SCOPE**
- Anything modelling Seize as an Interrupt Action: no Initiative-Score cost
  gate, no not-surprised restriction.

**SCOPE QUESTION** — should the app **require** a rolled Score before allowing
Seize, rather than warning? *For:* it prevents the defect that prompted this
brief and matches the wording. *Against:* `SCOPE.md`'s standing position is warn
rather than refuse; refusing outright is a new kind of enforcement needing
explicit sign-off, as the PAN slave cap did.

## Acceptance criteria

1. A participant who has completed this Combat Turn's Initiative Test and then
   spends Edge to seize is placed at the top of the order for every remaining
   pass of that Combat Turn. (Core p. 160–161)
2. Multiple seizers are ordered among themselves by their own Scores, highest
   first; non-seizers follow by their own Scores. (Core p. 160–161)
3. A seizer's Score still drops by 10 at the end of each pass, like everyone
   else's. (Core p. 159)
4. A seizer at 0 or below may take only a Free Action and may still defend, but
   no Simple or Complex action — identical to a non-seizer at 0 or below.
   (Core p. 160; `RULINGS.md` 2026-08-07)
5. A seizer returns to their ordinary position at the start of the next Combat
   Turn. (Core p. 161)
6. *[Pending Xavier's answer to Undefined item 1]* A participant with no rolled
   Score for the current Combat Turn is **[blocked from / warned before]**
   declaring Seize.

## Gameplay scenarios to survive

1. **Ordinary case.** A participant with Score 14 seizes in pass 1. They act
   first in pass 1 (pass decay, Core p. 159); first again in pass 2 at Score 4;
   in pass 3 their Score is −6, so they get a Free Action only, still resolving
   ahead of others, but no full turn (Core p. 160).
2. **Two seizers tie** on equal rolled Scores: ERIC decides which leads
   (Undefined item 4).
3. **Seizer wounded mid-turn.** A wound modifier lowers their Attribute after
   pass 1: the running Score changes immediately, no extra action is granted,
   the seized rank is unaffected. (Core p. 159–160)
4. **Astral projection after seizing.** A character who seized while physical
   then projects: their Score basis is replaced, but nothing in the Seize text
   cancels a seize — confirm the seized rank survives the swap.
5. **Surprise and Seize are different Edge spends** (Core p. 192 vs Core p. 160);
   confirm the tracker never conflates them.
6. **Combat Turn boundary.** The seized flag clears at the boundary; the
   character rolls fresh and returns to ordinary order. (Core p. 161)

## Rules-notes entries held for Stage 5

The analyst derived four entries for `docs/rules-notes/core-combat.md` (Seize as
an Edge Effect; Interrupt Actions defined; Initiative Score, passes and the zero
floor; the Combat Turn Sequence and Delayed Actions), each
`verified: analyst 2026-09-21`, with pages Core pp. 56, 158, 159, 160, 161, 167
and 192 opened this run. They are appended at Stage 5, after approval — not
before.

## RESOLVED — Xavier's rulings, 2026-09-21 — BINDING

Three table rulings, to be recorded in `RULINGS.md` at Stage 5 (which today has
no Seize entry at all). Together they **remove** the seize exemption the
mid-turn-joiner work introduced, rather than tuning it.

**R1 — Seize requires a rolled Initiative Score.** A participant may not seize
until they have completed this Combat Turn's Initiative Test. Fills Undefined
item 1; the book implies it ("regardless of your Initiative Score"; several
seizers ordered "by their Initiative Scores", Core p. 160–161) but never states
it. Xavier: "you cannot seize initiative until you have rolled."
*Orchestrator reading, stated to Xavier and correctable:* the Seize control is
**unavailable** (not merely warned against) until that participant has rolled.
This is stricter than `SCOPE.md`'s standing "warn rather than refuse" default,
so it is recorded as a watched limit in `SCOPE.md` at Stage 5, the way the PAN
slave cap was.

**R2 — Seize may be declared at any point after rolling, including outside the
character's own Action Phase.** Xavier: "seizing can be done as an interrupt
action after a roll… what would be the point of seizing the initiative only
after you wait your turn?" This **fills a genuine gap rather than contradicting
the book**: Core anchors a Delayed Action to Step 3A of the Combat Turn Sequence
(Core p. 161) and gives Seize no equivalent step, so the timing is undefined
(Undefined item 2).
**Critical distinction to preserve in code and comments:** Seize is declared
*like* an Interrupt Action in **timing only**. It remains an Edge Effect (Core
p. 160) costing **one point of Edge** (Core p. 56) and must never cost
Initiative Score, never route through `canUseAction`, and never inherit the
Interrupt Action restrictions (Core p. 167, including the not-surprised
condition). Xavier is aware this timing is his ruling, not the printed text.

**R3 — A seizer's own Initiative Score decays and gates exactly like everyone
else's.** −10 at the end of each pass (Core p. 159); at 0 or below they get
one Free Action and may defend, but no Simple or Complex action (Core p. 160;
`RULINGS.md` 2026-08-07). Xavier: "yes their score decays as normal because there is no
indication otherwise." Resolves Undefined item 3 and the round-5 validator's
Defect 3. Seizing changes **rank only**, for the whole Combat Turn (Core
p. 161).

### What this removes from the existing (uncommitted) code

- The seize exemption in `CombatManager.canParticipantActThisPass()` — an
  unrolled participant is skipped, with **no** seize exception (R1 makes an
  unrolled seizer impossible).
- The seize exemption in `hasRolledOrSeized()`, used by `isOver()` /
  `hasMoreIniPasses()` — a seizer no longer holds a Combat Turn open on an
  unrolled attribute.
- The seize exemption in `canParticipantInterrupt()` (round-5 item 9).
- Consequently the "third hand-written copy" problem the round-5 validator
  raised shrinks: eligibility becomes "has rolled", full stop.

**Retained:** the seized flag still sorts the participant to the top of the
order, persists across passes, and clears at the Combat Turn boundary (Core
p. 161). Multiple seizers are ordered among themselves by their own Scores
(Core p. 160–161), with ERIC for a tie (Core p. 159).

### Open, not decided here

Xavier earlier suggested moving the Seize control into the player's roll pop-up,
alongside Blitz (Edge to roll the maximum 5D6, Core p. 159), so the Edge
decision sits with the player. R2 makes that more attractive, since a player can
now seize at any time after rolling. **Not in this round** — it is a separate
increment and Blitz is unimplemented anywhere in the app.
