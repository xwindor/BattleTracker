# Table Rulings

Rulings for cases the SR5E rulebook leaves open. Check here before deciding
an undefined case ad hoc — append new decisions with today's date and the
reasoning, don't re-decide an existing entry.

## 2026-07-31 — No floor on Initiative Score

**Ruling:** Initiative Score has no lower bound. It is allowed to go
arbitrarily negative and is never clamped at 0.

**Why:** The core rulebook shows negative Initiative Scores in its own
worked examples (p. 160: Halloweener ends a Combat Turn at -4; p. 191:
Blackfeather ends up at -9 and is refused a Parry because of it) but never
states a general floor rule either way. Negative values are load-bearing for
the Interrupt Action affordability check (p. 167: an Interrupt Action is
refused if the character doesn't have enough Initiative Score left to pay
for it) — clamping at 0 would make that check meaningless below zero. This
was adopted as the brief's recommended default for the "Running Initiative
Score Across Passes" feature (`briefs/running-initiative-score.md`, Open
Ruling Question 7) and is load-bearing for that feature's regression tests
(S1 expects -4, S3 expects -9).

**How to apply:** Any code path that reduces a participant's Initiative
Score (pass decay, Interrupt Action costs, wound modifiers, spell/attack
effects) should never clamp the result at 0. Code that GATES on Initiative
Score (e.g. "can this participant act," "can this participant afford this
Interrupt Action") should compare against the actual signed value, not
against `max(0, score)`.

## 2026-07-31 — Bonus Initiative Dice carry additively into astral space

> **SUPERSEDED IN PART, 2026-08-30.** The dice *count* below is wrong: astral
> is **3D6 total**, so the delta is **+2**, not +1. See "2026-08-30 — Astral
> Initiative is 3D6 total, not 2D6" at the end of this file. What survives
> unchanged is the *shape* of the rule: the change is applied as a **relative
> delta** on the character's current dice count, never as an absolute
> overwrite, so bonus dice from Increase Reflexes, wired reflexes or a drug
> are preserved. Read the numbers below as +2/-2.

**Ruling:** When a character astrally projects, their Astral Initiative Dice
count is their current Physical Initiative Dice count **plus one** (not an
absolute reset to a flat 2D6). Returning from astral space subtracts back
off only the die that was actually gained on the way out.

**Why:** The core rulebook's Initiative Attribute Chart (printed p. 159)
gives Astral as "2D6 Base Initiative Dice" against 1D6 Physical, and the
worked example on p. 160 describes a magician who "gains the die" when
projecting — implying a delta on top of whatever she already has, not a
fresh absolute count. The book's example uses a magician with no other
Initiative Dice bonuses, so it doesn't say one way or the other whether an
existing bonus die (e.g. from Increase Reflexes, wired reflexes, or a drug)
should be preserved or overwritten when projecting. Overwriting to a flat 2
would silently delete a bonus the character is still actively paying
Drain/sustaining for, which reads as clearly wrong; treating the mode change
as a relative +1/-1 delta preserves any such bonus and matches the "gains
the die" wording literally. Treated as the better default rather than a
directly-cited rule, since RAW is silent on the interaction specifically.

**How to apply:** Any future feature touching astral-projection Initiative
Dice (or a similar mode-switch mechanic) should apply the mode's dice-count
change as a delta relative to the character's current dice count, not as an
absolute overwrite, unless a future ruling here says otherwise. Note: the
Matrix VR-mode dice counts (AR/Cold-Sim/Hot-Sim) are still implemented as
absolute per-mode counts, not relative deltas — this ruling does not
retroactively apply to Matrix, which is a separate, currently-paused module
(see CLAUDE.md "Current focus").

## 2026-08-01 — A linked NPC row's wounds slow the whole row

**Ruling:** When any NPC in a linked NPC row (a grunt group sharing one
Initiative Score) takes damage that crosses a Wound Modifier threshold, that
wound's Initiative penalty is applied to the **row's shared Initiative
Score**, so every member of the row slows down together. Nobody splits off
onto a different score. The wounded NPC's own dice pools still take his own
wound modifier as normal.

The trigger is a **wound event**, not the row's current roster. The row carries
its own accumulated shared Wound Modifier, moved only when a member actually
takes damage or is healed. Four consequences follow, and are ruled here because
the printed rules do not reach them:

- **Wound modifiers carry forward across Combat Turns.** The row's Initiative
  attribute for the next Combat Turn's single Initiative Test is its base
  Initiative minus the shared Wound Modifier it has accumulated. This part is
  RAW, not house rule: "If a character was wounded previously, wound modifiers
  may affect his Initiative Score on this and any subsequent Combat Turns"
  (p. 159). The row simply applies it at row level.
- A member who goes down (Condition Monitor full) keeps costing the row his
  wound modifier — going down is not a refund.
- **Membership changes never move the shared score.** An NPC joining an
  existing row brings no Initiative penalty with him however badly hurt he
  already is (Decision 7 says he simply inherits the row's current score), and
  an NPC removed or **detached** takes none away — the wounds his damage
  already cost the row stay paid. Scenario S4 states this directly: when the
  street witch detaches to project, "the remaining three gangers keep the row's
  original shared score untouched". Detaching is not a wound event in either
  direction.
- Healing a member, or correcting a mis-keyed hit, runs the rule backwards: the
  row gets back exactly the shared penalty that wound cost it, floored so that
  healing damage an NPC *arrived* with (which never cost the row anything)
  cannot make the row faster than it started.

**Why:** This is a house rule and is not printed anywhere. RAW says the
opposite: the grunt rules state that injury modifiers "might cause some of the
grunts to act on a different Initiative Score than the rest of their team"
(p. 379), and the general rule applies a wound modifier to *the character's*
Initiative attribute and therefore *their* Initiative Score, immediately on
injury and possibly reordering them within the same Initiative Pass (p. 170,
p. 160). Xavier chose (2026-08-01, `briefs/npc-group-initiative.md`
Decision 1) neither RAW's split-off nor the "wounds never touch group
initiative" simplification, on the grounds that a row is a bookkeeping device
— the whole point of the grunt rules (p. 379) — and splitting it defeats that,
while making it immune to injury makes a badly-shot-up group as fast as a
fresh one.

**How to apply:** Wound-derived Initiative changes inside a row go to the row,
never to a member. If an NPC needs an Initiative Score genuinely of its own —
an augmented specialist (p. 379), a lieutenant (pp. 380–381), an NPC astrally
projecting or changing Matrix mode (pp. 159–160), or one taking Interrupt
Actions (which row members are forbidden per Decision 3) — detach it onto its
own row rather than trying to model a per-member offset inside the row.

## 2026-08-01 — A linked NPC row is removed as soon as it is empty, however it emptied

**Superseded 2026-08-07** by "A spent NPC row is flagged, not deleted" below —
table use found auto-deletion threw away a row (and any member's chance to be
healed back up) the instant the last member dropped. Kept for the reasoning
trail; do not re-implement auto-deletion from this entry.

**Ruling:** A linked NPC row is dropped from the initiative order the moment it
has no members left, whether that happened because every member was taken out
of action, because the GM removed a member, or because the last member was
detached onto their own row (brief acceptance criterion 6 / Decision 8, p.
379). All three are treated identically — "empty" is a roster fact, not a
combat-log distinction.

**Why:** A row is a bookkeeping device (p. 379); an empty one is a phantom
slot in the order with nothing left to act, and leaving it there — visible to
players via session sync — implies a combatant that is not there. The code
tracks this with an `everPopulated` flag (`NpcRowParticipant`) rather than a
member-count check alone, because a row emptied by detach still needs to read
as "spent" even though nothing in it ever reached the Condition Monitor's
floor.

**How to apply:** `CombatManager.removeSpentNpcRows()` is the single place
this is decided, and it fires from both `advanceToNextActors()` (automatic,
e.g. the last member of the acting row goes down) and every UI path that can
empty a row (damage, detach, manual delete) via `cleanupSpentNpcRows()` /
`onSpentNpcRowsRemoved`, so the log line and side-map cleanup can never
diverge from the actual removal. A row the GM has created but not yet
populated is left alone — "empty" only applies once it has held a member.

## 2026-08-01 — A detached grunt keeps its single Condition Monitor

**Not an open question — a printed rule, recorded here because the code briefly
got it wrong.** Detaching an NPC from a linked row onto its own initiative row
(brief acceptance criterion 12) changes *which Initiative Score it is on* and
nothing else. It stays a grunt, so it keeps the grunt Condition Monitor shape:
**one** combined Physical + Stun track of 8 + ceil(max(Body, Willpower)/2)
boxes, no overflow (p. 379), and the final attack's type and DV stay recorded so
alive-or-dead can still be settled against Body (p. 379).

**Why it is not open:** p. 381 says of lieutenants — the most likely detach
target, along with augmented specialists (p. 379) — "They possess a single
Condition Monitor, like other grunts." Handing a detached grunt the PC shape of
two independent tracks would roughly double the boxes it had a moment earlier
and contradicts that sentence. `DetachedGruntParticipant`
(`src/Grunts/DetachedGruntParticipant.ts`) is the implementation.

**Known limit:** a detach into a *different participant type* — an NPC astrally
projecting or switching to a Matrix mode (criterion 13) — currently produces an
`AstralParticipant` / `MatrixParticipant`, which carries the grunt's boxes and
damage on its Physical track but has PC-shaped two-track semantics. Fixing that
needs a grunt-shaped variant of each of those classes; it is listed in this
feature's deviations rather than silently ignored.

## 2026-08-02 — Healing cannot bring a downed grunt back into the fight

**Superseded 2026-08-07** by "Healing can bring a downed grunt back into the
fight" below — the correction path this ruling relied on ("use global Undo")
stopped being workable once Xavier committed to removing the Undo mechanic.
Kept for the reasoning trail; do not re-implement the heal refusal from this
entry.

**Ruling:** Once a grunt's single Condition Monitor is full, healing it does
nothing. Boxes cannot be taken off a grunt who is already out of action: the
heal is refused outright (0 boxes), the grunt stays out of action, and the
row's shared wound accumulator is not paid back either. This applies to a
`GruntMember` in a linked NPC row and, by the same reasoning, to a
`DetachedGruntParticipant`.

**Why:** p. 379 says of the grunt Condition Monitor, "when it's full, the
grunt is out of action **for the rest of the fight**." That states
out-of-action as a property of the fight, not of the current box count, so
un-filling a box mid-fight must not put the grunt back on his feet — the
Condition Monitor stops being the thing that decides it the moment it fills.
The book does not say what happens if the GM applies healing anyway, which is
why this is written down here: `briefs/npc-group-initiative.md` covers damage
and never mentions healing at all, and the tracker's own heal control (added
so a GM could correct a mis-tap without global undo) is what makes the case
reachable. The alternative — letting a heal revive — would also silently
rewrite the p. 379 alive-or-dead verdict, which is settled by the attack that
took the grunt out.

**How to apply:** `GruntMember.healDamage` returns 0 for a member who is
already `outOfAction`, so nothing downstream (the row's shared Initiative
penalty per Decision 1, the final-attack record, the spent-row check that
removes an emptied row per Decision 8) can be moved by it. The GM-facing heal
button logs "no effect, already out of action" rather than failing silently.
**The correction path for a mis-keyed killing blow is global Undo**, which
restores the exact pre-hit state including the row's shared score; healing is
only for correcting hits that did not down the grunt. If the fiction genuinely
calls for a downed grunt to get back up (First Aid between fights, say), the GM
adds them back as a new NPC — that is a new fight for that grunt.

## 2026-08-04 — A standalone grunt stores Body *and* Willpower, and resizes on either

**Ruling:** A grunt on its own initiative row (`DetachedGruntParticipant` — one
created with "Add Grunt", or one detached out of a linked row) stores **both**
Body and Willpower as real attributes, and its single combined Condition
Monitor is re-derived from p. 379's `8 + ceil(max(Body, Willpower) / 2)` the
moment either of them is edited. Damage already recorded is **clamped** into
the new size: a track that shrinks below the boxes already filled ends up full,
and a track that grows leaves the filled boxes exactly where they were. No
boxes of damage are invented and none are rescaled.

**Why this is written down:** the formula is printed (p. 379) but the *timing*
is not — the book has no notion of a GM editing an NPC's Body mid-fight. Two
things made a decision necessary. First, the tracker previously stored only
Body, and the GM's Body field did not resize the monitor at all, so a Body-9
grunt kept the 10 boxes it was created with instead of the 13 the formula gives
it — a straight contradiction of p. 379. Second, folding a grunt into a group
(addendum Decision 10) hands `GruntMember` a Body/Willpower pair and lets it
recompute the box count; with Willpower not stored, it had to be *back-derived*
from the box count as `2 × (boxes − 8)`, which silently disagreed with any Body
the GM had set. A Body-9 grunt gained boxes across a merge, and a grunt whose
track was full came out of the merge with room to spare — i.e. back on its
feet, contradicting p. 379 ("when it's full, the grunt is out of action for the
rest of the fight") and the 2026-08-02 ruling above.

The clamp direction is the judgment call. Rescaling damage proportionally would
invent or erase boxes the GM never recorded; refusing to shrink would leave the
attributes and the printed formula disagreeing. Clamping keeps every recorded
box that still fits and lets p. 379's own "full track = out of action"
condition decide the rest.

**How to apply:** `DetachedGruntParticipant.setGruntAttributes` /
`syncConditionMonitorToAttributes` are the only places the track is sized, and
they run from every write path — the GM's B and W fields on the grunt Condition
Monitor panel, `createStandaloneGrunt`, and `NpcRowParticipant.detachMember`.
`toMemberSnapshot()` hands both stored attributes straight to `GruntMember`, so
a merge cannot change a monitor's size. Excess damage is taken off Physical
first and then Stun, matching the combined-bar edit path, which also writes
Physical. A mis-typed Body or Willpower is corrected by re-editing the field -
there is no undo control (Undo was removed from the tracker; see brief
"Remove the undo/redo system").

**Known limit, deliberately not fixed:** raising Body or Willpower on a grunt
whose track is *already full* gives it room again and it stands back up. That is
allowed: editing an attribute is a **stat correction**, not an in-fiction event,
and the no-revival rule above (2026-08-02) is about *healing* — un-filling boxes
the fiction filled. If a GM wants a downed grunt genuinely back on its feet, the
2026-08-02 entry still applies: add it as a new NPC.

## 2026-08-04 — A merged Grunt Group is a new row, and takes the late-entry penalty

**Ruling:** A row created by merging standalone grunts (addendum Decision 10)
is a **brand-new participant**, not a joiner. If the merge happens after combat
has begun, the row rolls its own single Initiative Test and subtracts 10 for
each Initiative Pass that has already elapsed, like any other late entrant
(p. 160).

**Why:** Decision 7 exempts an NPC *joining an existing row* from the
late-entry penalty — it inherits that row's current shared score, because the
row is already standing in the order at a known position. A merge produces a
row that was not in the order a moment ago and has no score at all: there is
nothing for it to inherit. Decision 10 makes this unambiguous by refusing the
merge outright if any selected grunt has already rolled this Combat Turn, so
the merged row always starts unrolled. With no inheritance available, the
ordinary printed rule is the one that applies, and acceptance criterion 15 says
so explicitly ("A brand-new row (not joining an existing one) still rolls
Initiative Score normally and, if added after combat has begun, subtracts 10 for
each Initiative Pass already elapsed").

**How to apply:** `mergeSelectedGrunts` adds the row through the ordinary
`CombatManager.addParticipant` path, which is where the -10-per-elapsed-pass
penalty already lands for every other new participant. Nothing merge-specific
adjusts the score. If the GM wants reinforcements on an *existing* group's
score instead, the path is "add NPC to row", not a merge.

## 2026-08-04 — Merging grunts who are all already out of action is allowed, and self-cleans

**Ruling:** Merging a selection of grunts who are **all** out of action is not
prevented. The merge succeeds, producing a row every one of whose members has a
full Condition Monitor; that row is immediately "spent" and is removed from the
initiative order by the next cleanup pass, exactly like a row whose last member
was just dropped (Decision 8).

**Why:** nothing in p. 379 or in Decisions 10-11 makes a downed grunt
unmergeable — damage carries into a merge verbatim (Decision 11), and a member
whose track is full is out of action inside the row for the same printed reason
it was out of action outside it. Special-casing a refusal would need a rule the
book does not supply, and would cost the GM a legitimate move (folding the
remains of two broken gangs into one row to tidy the order). The outcome is
already correct without any special case: the existing empty/spent-row rule
(2026-08-01, above) collects it. The case is recorded here only so a later agent
finds a documented decision rather than concluding the disappearing row is a
bug.

**How to apply:** no code enforces this — it is the composition of
`mergeGruntsIntoRow` (which does not inspect out-of-action state, other than
refusing a *hand-benched* grunt, below) and
`CombatManager.removeSpentNpcRows()`. The row's disappearance is logged by the
ordinary spent-row log line, so the combat log still records what happened.

## 2026-08-04 — A hand-benched grunt cannot be merged into a group

**Superseded 2026-08-07** — the "Leave Combat" bench control this refusal
depends on was never built; `manuallyOutOfAction` and this refusal check are
being removed as unreachable dead code. Kept for the reasoning trail; if a
bench control is added later, revisit whether this refusal should return.

**Ruling:** If the GM has taken a standalone grunt out of the fight *by hand*
("Leave Combat") rather than by filling its Condition Monitor, a merge that
includes it is **refused**, with a reason, and nothing is changed. The GM either
puts the grunt back into combat first or unticks it.

**Why:** "out of action" has two different sources in this app. p. 379 defines
one of them — a full Condition Monitor — and that is the only one a row member
has: `GruntMember.outOfAction` is derived purely from the track. The manual
bench is a `Participant`-level flag with no counterpart on `GruntMember`, so a
benched grunt folded into a row came back as an **active member**, silently and
with no log line: it started acting again when the row came up. The two honest
options were to invent a manual-bench concept on `GruntMember` — which would
then feed the "every member out of action → delete the row" rule (Decision 8)
and let a reversible GM toggle permanently delete a row — or to refuse. Refusal
matches what Decision 10 already does for a grunt that has rolled this Combat
Turn: state that cannot be carried across a merge blocks the merge instead of
being dropped.

**How to apply:** `mergeGruntsIntoRow` checks
`DetachedGruntParticipant.manuallyOutOfAction` after the already-rolled gate and
returns the same all-or-nothing refusal shape. A grunt who is down by *damage*
is not refused — that state carries perfectly (Decision 11) and stays true
inside the row.

## 2026-08-01 — Grunt Edge: the book contradicts itself, Edge 0 stands

**Ruling:** A linked NPC row enters ERIC tie-breaking with an Edge attribute of
**0** and falls through to Reaction, then Intuition, then the coin toss
(p. 159), per Decision 5 of `briefs/npc-group-initiative.md`.

**Why this is written down:** p. 380 says two incompatible things about grunt
Edge on the same page. The Professional Rating section says a grunt group's
Professional Rating "determines the rating of their Edge attribute and Edge
pool"; the Group Edge sidebar on that same page says grunts "don't have their
own Edge attributes at all". Decision 5 is binding either way — Xavier chose
Edge 0 and explicitly ruled out substituting Professional Rating / Group Edge —
but the contradiction is recorded so a future agent who finds the Professional
Rating sentence does not "discover" it and file the Edge-0 behaviour as a bug.
Group Edge as a spendable pool remains out of scope for this feature.

## 2026-08-01 — Downed grunt with final Physical DV exactly equal to Body

**Ruling:** Not decided. The tracker records the final attack's type and DV
alongside the grunt's Body and reports the outcome as `undetermined`; the GM
calls it.

**Why:** p. 379 gives only the two open inequalities — Stun or Physical with DV
*less than* Body means the grunt is alive, Physical *greater than* Body means
dead — and says nothing about equality. Rather than silently rounding the case
into "alive" or "dead", the app surfaces the inputs it has. If the table
settles this, replace this entry with the decision.

## 2026-07-31 — GM/NPC dice roll visibility defaults

**Ruling:** GM and NPC dice rolls are visible to players in the shared
combat log by default. The GM can hide an individual upcoming roll ("hide
next roll") or the whole session ("GM rolls: hidden") to keep specific rolls
or a whole session's worth of GM rolls out of the shared log. NPC dice pool
compositions may also be shown to players — they are not hidden by default.

**Why:** The core rulebook (printed p. 330, Gamemaster Advice) explicitly
hands this decision to the table rather than mandating an answer: it tells
the group to agree up front whether all dice, including the gamemaster's,
are visible to everyone, whether the GM rolls discreetly or in the open, and
when initiative is rolled and reported. Xavier chose visible-by-default with
an opt-out, since the tracker's core value is a shared record of what
happened (`briefs/combat-log-readability.md`, Open Question 1 and 2).

**How to apply:** Any future feature that logs a GM- or NPC-originated roll
should default to broadcasting it to players and should route it through
whatever the current GM-visibility gate is (see
`briefs/combat-log-readability.md`'s "Known limitations" — as of 2026-07-31
this gate only reliably covers the dice-roller and initiative-roll log
*lines*; it does not yet prevent a hidden roll's numbers from reaching
players via the periodic participant state-sync broadcast, and hidden log
entries are not reliably preserved across an ordinary disconnect, only a
deliberate "Close Room." Treat the toggle as a convenience for keeping
routine rolls out of the log, not as a guarantee of concealment, until those
gaps are closed).

## 2026-08-07 — Healing can bring a downed grunt back into the fight

**Ruling:** Healing a grunt below its out-of-action threshold (combined damage
no longer meets the box count) clears out-of-action status, for both a
`GruntMember` in a row and a standalone/detached `DetachedGruntParticipant`.
This reverses the 2026-08-02 ruling above.

**Why:** The 2026-08-02 ruling's correction path for a mis-keyed killing blow
was "use global Undo, which restores the exact pre-hit state." That stopped
being workable once Undo was removed from the app entirely (brief "Remove the
undo/redo system" — not itself a rules question). With no other correction path, refusing to let a heal revive a
grunt left a mis-keyed killing blow permanently uncorrectable at the table.
"Out of action" is already a live-derived value in the grow direction (the
2026-08-04 entry above accepts that raising Body/Willpower on a full grunt
un-latches it, as a stat correction rather than an in-fiction event); this
ruling makes the heal direction consistent with that rather than a special
case. p. 379's "out of action for the rest of the fight" is read as shorthand
for "for as long as the Condition Monitor stays full," not as an irreversible
flag independent of the box count — the same reading the grow-direction entry
already relies on.

**How to apply:** `GruntMember.healDamage` / the grunt heal path must not gate
on `outOfAction`; healing runs the ordinary box-count math and out-of-action
status re-derives from the result on every read, exactly like the grow-Body
path already does. The row's shared wound accumulator (Decision 1) is paid
back the same way a heal already pays it back for a grunt that was never
fully down. The final-attack type/DV record used for the p. 379 alive-or-dead
call is left untouched by a heal — it still reflects the last attack that
actually landed, so an alive/dead read taken *while the grunt was down* stays
correct history even after a later heal changes its current status.

## 2026-08-07 — A spent NPC row is flagged, not deleted

**Narrowed 2026-08-13** — see "Emptying a row by hand is not the same as
wiping it out" below. The flagged/red state ruled on here applies **only** to
a row emptied by damage. A row emptied by manual removal or by detaching its
last member is left as a plain empty row, unflagged and not `ooc`. The
paragraph below that treats those two cases as identical no longer holds; the
rest of the entry stands.

**Ruling:** A linked NPC row whose last member goes out of action is no
longer removed from the initiative order automatically. It is flagged the
same way a downed ordinary participant already is, and stays in the order
until the GM removes it manually with the existing per-row delete control.
This reverses the 2026-08-01 "removed as soon as it is empty" ruling above
for the *all-members-down* case specifically.

**Why:** Auto-deletion interacted badly with the 2026-08-07 heal-revival
ruling above — a row that emptied by damage was gone before the GM had a
chance to heal a member back up, even though healing would otherwise have
worked. It was also the only participant type in the whole app that
disappeared automatically on going out of action; every other kind (PC,
ordinary NPC, standalone grunt) stays visible and inactive until the GM
removes it. A row that empties because the GM manually removed every member,
or detached the last one out, still reads as "spent" the same way — the
`everPopulated` bookkeeping from the 2026-08-01 entry is unaffected, only the
automatic deletion step is removed.

**How to apply:** `CombatManager.removeSpentNpcRows()` / `cleanupSpentNpcRows`
stop removing the row from `participants`; the row is instead marked spent
(flagged in the UI) and left in place. The existing manual per-row delete
control is the GM's cleanup path, same as for any other downed participant.

## 2026-08-07 — Manual grunt bench flag removed as unreachable

**Ruling:** `manuallyOutOfAction` (`Participant`'s manual "Leave Combat"
bench) and the merge-refusal check that read it (2026-08-04, "a hand-benched
grunt cannot be merged," above) are removed from the grunt/row code paths.

**Why:** Nothing in the app's UI ever set the flag for a grunt — there is no
GM control that reaches it, so the refusal it guarded could never actually
fire from normal play. Carrying dead code that references a nonexistent GM
action is worse than carrying nothing; if a bench control is built later,
the refusal can be reintroduced at that point with a real GM action behind
it.

**How to apply:** `mergeGruntsIntoRow` drops the `manuallyOutOfAction` check
(the already-rolled-this-turn refusal from Decision 10 is unaffected). Ordinary
`Participant.ooc` manual-bench behavior for **non-grunt** participants (PCs,
plain NPCs) is untouched — this only removes the grunt/row-specific
`manuallyOutOfAction` getter and its one caller.

## 2026-08-07 — Simple/Complex actions are blocked at Initiative Score 0 or below; Free Actions and defense are not

**Ruling:** A participant at Initiative Score 0 or below (any participant
type — PC, ordinary NPC, standalone grunt, or NPC row alike) may still
declare and take one Free Action per pass (p. 160) and still defends against
incoming attacks normally, but may not take a Simple or Complex action.

**Why:** This was already the printed rule (p. 159-160: a character needs a
live Action Phase, which a Score of 0 or below does not have, to take a
Simple or Complex action; the Free Action allowance and the fact that Defense
Tests are not Interrupt Actions and are never gated by Score are both
separately printed) but the app's Interrupt Action cost gate
(`Participant.canUseAction`, p. 167) was the only thing enforcing anything
at low Score, and it only covers Interrupt Actions, not the "Act" declare-
actions flow. Nothing previously stopped a participant at Score 0 or below
from declaring a Simple or Complex action through the normal Act modal.

**How to apply:** The action-declaration flow (the "Act" modal's Simple/
Complex categories) must check the participant's current Initiative Score and
block those two categories at 0 or below, leaving the Free Action category
open. This is a general fix to `Participant`/action-declaration code, not
grunt- or row-specific, even though it surfaced during NPC row testing.

## 2026-08-13 — A killing blow's Damage Value can exceed the boxes left on the track

**Ruling:** The GM must be able to record a Damage Value larger than a grunt's
remaining Condition Monitor boxes. The track itself still stops at full — a
grunt takes no overflow (p. 379) — but the DV of the attack that fills it is
recorded in full, because p. 379 settles a downed grunt's alive-or-dead from
that DV against his Body.

**Why:** Damage on a standalone or detached grunt could only be entered by
clicking Condition Monitor boxes, so the largest recordable hit was exactly the
number of boxes remaining. A grunt with two boxes left, shot by a DV 14 burst,
could only ever be recorded as taking 2 — and then read as merely unconscious
against any Body of 3+, when the printed rule plainly kills him. The row panel
already had a DV field for this reason; the standalone panel did not, so the
same grunt gave two different answers depending on which screen the GM used.

**How to apply:** The standalone grunt Condition Monitor panel carries the same
`DV` + `P` / `S` / `-1` controls as the row panel. Applying a DV greater than
the boxes remaining fills the track and records the full DV as the final
attack's value for the `finalState` determination. Clicking boxes directly
stays available and is unchanged; it simply cannot express an over-max hit.

## 2026-08-13 — Emptying a row by hand is not the same as wiping it out

**Ruling:** The red out-of-action flag on an NPC row means *this group was
taken out*. It is raised only when the row empties through damage. A row
emptied by the GM removing its last member, or by detaching the last member
onto their own initiative, is left as a plain empty row — not flagged, not
`ooc`, not styled red — for the GM to delete when convenient. Removing an NPC
from a row now asks for confirmation first, and when it is the last NPC the
same prompt offers to delete the empty row.

**Why:** Narrows the 2026-08-07 "spent NPC row is flagged, not deleted" ruling,
which treated both causes identically. At the table that read as a bug: hitting
the trash icon on the last ganger — an act of tidying up — produced the same
red "wiped out" state as killing them, with no confirmation and nothing in the
UI to take it back. Xavier's requirement is that the prompt-then-delete
behaviour ordinary participant rows already have applies to row members too,
and that a deliberate removal never leaves combat state behind it.

**How to apply:** Manual removal and detach paths must not raise `spentFlagged`
or `ooc`; only the damage path does. `removeRowMember` confirms before removing,
and when the member is the row's last it offers deletion of the row in the same
prompt. The `everPopulated` bookkeeping is unaffected.

## 2026-08-13 — Condition Monitor maximums never appear in any log

**Ruling:** Damage taken and damage healed are logged for every participant and
every NPC. The maximum size of a Condition Monitor is not — the `/max` half of
an `(x/y)` fraction is dropped from every log line, the GM-only log included.
The running damage total may be shown; the capacity behind it may not.

**Why:** Extends the 2026-08-07 Decision 17 log-privacy work, which stripped
the fraction from the player-facing copy only and left it in the GM text. The
number that matters is how much a hit did; the maximum answers "how many more
hits until it drops", which is information a table earns by fighting rather
than reads off a log. Keeping it GM-only was a half measure — the GM already
reads the box count off the Condition Monitor panel, where it belongs, so the
log copy was duplication carrying a leak risk whenever a log is shared or
pasted.

**How to apply:** Row-member damage, no-effect and heal log lines drop the
`(x/y)` fraction from both texts. Ordinary participants already log this way
via `flushDamageLog` and need no change. Any new log line reporting a Condition
Monitor change follows the same rule.

## 2026-08-19 — `GruntMember.hasActed` goes on the session-sync wire after all

**Ruling:** NPC-group Decision 18 ("has this NPC already gone in the current
Initiative Pass" — `GruntMember.hasActed` — is GM bookkeeping only and does
not survive a rejoin) is **reversed**. `hasActed` now round-trips through the
session-sync wire, on the **GM-only** channel, and is restored on rejoin via
`GruntMemberSnapshot`/`GruntMember.fromSnapshot()`.

**Why:** Decision 18's reasoning — that the marker is cleared at every pass
boundary anyway, so losing it is harmless — holds for an ordinary pass but not
for a GM rejoin mid-pass, which is exactly the moment the GM most needs it:
with six gangers in a row and no record of who has gone, the GM has to
reconstruct the pass from memory or table notes. `briefs/gm-reconnect-state-
loss.md`'s Decision D2 makes restoring it the point, not an afterthought.

**How to apply:** `GruntMemberSnapshot.hasActed` (optional, `GruntMember.ts`)
carries the flag on the domain side; `GruntMember.toSnapshot()`/`fromSnapshot()`
are its read/write sides there, unchanged. On the wire, it carries as
`SharedGmParticipantState.rowMemberHasActed` (`boolean[]`, index-aligned with
the same row's `rowMembers` array) — **not** as a field on
`SharedGruntMemberState`/`rowMembers` itself. Corrected 2026-08-19 (same day,
adversarial review defect D5): an earlier draft of this ruling put it on
`rowMembers`, which is part of `SharedParticipantState` and therefore reaches
every player socket via `session:update-state` — directly contradicting this
brief's own "no new field on `SharedParticipantState`" promise. `hasActed` is
GM bookkeeping, not something a player is meant to see, so it belongs
exclusively on the GM-only channel `session:update-gm-state` uses
(`ARCHITECTURE.md` §7, "The GM-only channel") — `buildGmParticipantState()`
writes it, `buildRestoredParticipant()` reads it back by row-member index. It
is still cleared at every pass boundary and Combat Turn boundary exactly as
before (`resetMemberActed()`) — only the *rejoin* behaviour changed, and it
carries no rules content either way — it is presentation/bookkeeping, the same
class of thing `rowMembers` already was.

## 2026-08-30 — Astral Initiative is 3D6 total, not 2D6

**Ruling:** A projecting magician rolls **3D6** Initiative Dice, not 2D6.
Xavier's ruling, made 2026-08-30 to resolve a contradiction printed in the
rulebook itself.

**Why:** The book disagrees with itself, and not evenly — it says 2D6 in
three places and 3D6 in one:

- printed p. 101 (`rules/pages/p0103.txt`), Final Calculations: Astral
  Initiative (Intuition x 2) + 2D6
- printed p. 159 (`rules/pages/p0161.txt`), Initiative Attribute chart: 2D6
- printed p. 160 (`rules/pages/p0162.txt`), worked example: a projecting
  magician "gains the die", singular
- printed p. 314 (`rules/pages/p0316.txt`), Astral Attributes table:
  `Initiative Dice +2D6 (3D6 total)`

Xavier ruled for the p. 314 reading on 2026-08-30. This is a house ruling
that overrides the majority of the printed text, made deliberately and with
the three-to-one split known. The tracker previously implemented the 2D6
reading, so astral characters were rolling one die short of this ruling.

This surfaced during the grunt-statblock work: the printed PR 2 wagemage
statblock reads "Astral Initiative 8 + 3D6", which the feature brief had
written off as a misprint. It is not a misprint — it agrees with p. 314. The
GM-facing statblock note asserting the book was wrong was drafted on that
mistaken basis and is withdrawn. (An earlier draft of this entry said "two
notes"; there was one, carried as both an inline comment and a `notes[]`
string.) Nothing in the statblock data should assert the opposite claim
either — that the book is *consistent* here. It is not; this entry is where
the contradiction is recorded.

**How to apply:** `ASTRAL_INITIATIVE_DICE` (`src/Magic/AstralParticipant.ts`)
is an **absolute** total dice count, not a bonus, and becomes `3`.
`ASTRAL_PROJECTION_DICE_DELTA` is derived from it
(`ASTRAL_INITIATIVE_DICE - PHYSICAL_INITIATIVE_DICE`) and therefore becomes
`2` on its own — a magician projecting mid-turn gains two dice, rolls them,
and adds them to the running Initiative Score; returning loses them the same
way. The delta stays **relative** so bonus dice from Increase Reflexes, wired
reflexes or a drug are preserved, and the 5D6 hard cap still applies at the
write site. Statblocks continue to store no astral initiative line at all —
the value is always derived.

## 2026-08-30 — A combatant is announced when they enter the initiative order, not when a name box loses focus

**Ruling:** The "joined the fight" log line for any **GM-added** combatant is
written the first time that combatant actually enters a rolled initiative
order — not on blur, not on Enter, not at the moment the add dialog is
confirmed. Each combatant is announced at most once.

**Player-registered participants are the exception:** a player connecting to
the room is announced **immediately on connect**, as they are today
("<name> joined the session"). A player who has connected is in the fight by
definition, and the GM needs to see the connection the moment it happens.

**Why:** Three rounds of fixes failed to stop a phantom join line because the
trigger was a *focus* event. "The name box lost focus" is not the same fact as
"this character entered the fight". Focus moves for reasons that have nothing
to do with the GM's intent — most damagingly when a confirmation pop-up opens,
which blurs the name box an instant before the combatant is deleted, writing a
join line for someone who never entered the fight. The log is append-only, so
there is nothing to retract.

There are **eleven** pop-up sites in `battle-tracker.component.ts` alone, and
every one steals focus. Suppressing them one at a time is unbounded work with
no end state. Entering the initiative order is the first moment the tracker
can *know* a combatant is in the fight, and it is reached by exactly one code
path regardless of which button created the combatant.

**How to apply:** All GM-side add paths — the plus button, Tab-to-add, Add
Grunt, Grunt Group, Add NPC, merge, and the add dialog's Confirm — defer their
announcement. The announcement fires from the single point where a participant
first receives a rolled Initiative Score. A combatant created and deleted
before initiative is rolled is never announced, which is the point.

**Consequence the GM will notice:** combatants added during setup do not
appear in the log until initiative is first rolled. This is a deliberate
change in *timing*, not in wording — the line still carries the name the GM
typed. Acceptance criteria written against "one line, at commit" (brief U1,
D2) are amended by this ruling; the line is still exactly one, still at a
single choke point, but the choke point moved.

## 2026-08-30 — A lieutenant's tie-break precedence applies against everyone, not just his own team

**Ruling:** When a lieutenant ties with his own grunt row, he goes first — and
he keeps that position even if it puts him ahead of an unrelated combatant who
beat him on the ERIC ladder. Xavier's ruling: "if it's a fair leapfrog then
it's fair."

**Why:** Printed p. 381 (`rules/pages/p0383.txt`) scopes the rule to the
lieutenant's own team: if he gets the same Initiative as his team, he always
goes first. Printed p. 159 (`rules/pages/p0161.txt`) gives the ERIC ladder
(Edge, Reaction, Intuition, Coin toss) for everyone else. When a lieutenant,
his row, and an uninvolved third party are all tied on the same Initiative
Score, the two rules give genuinely cyclic preferences and the book gives no
answer: the lieutenant must precede his row, but ERIC may place the third
party ahead of the lieutenant and behind the row.

The cycle has to be broken somewhere. Breaking it in the lieutenant's favour
keeps the printed rule intact and costs only that the third party is passed by
one combatant on an exact tie — a coin-toss-adjacent outcome either way.

**How to apply:** `applyLieutenantPrecedence` moves the lieutenant ahead of
his row and leaves every other pair as the ERIC comparator ordered it. A
lieutenant already ahead of his row is never moved backwards. The doc comment
on that method must not claim everyone else's relative order is untouched —
the lieutenant-versus-third-party pair *is* affected, deliberately, by this
ruling. The comparator itself stays free of pairwise overrides so it remains
transitive; the precedence is applied as a post-sort splice.

## 2026-08-30 — Data Processing is imported from a statblock only where the book supplies one, and is blank otherwise

**Ruling:** The tracker imports a Data Processing value for a printed grunt
statblock **only when the rules derive one from the block's own printed
attributes**. Where the book deliberately declines to supply a number, the
tracker stores nothing and shows the field blank until the GM fills it in. A
Matrix participant with no Data Processing derives **no** VR Initiative;
promoting a participant to a Matrix form no longer seeds a hardcoded default.

Xavier's decision, 2026-08-30, on being shown that the promote path was seeding
a hardcoded 6.

**Why:** A made-up number that looks authoritative is worse than a blank. The
old default of 6 belongs to no character in the book, but reads on screen
exactly like a real rating — which is how the PR 4 technomancer came to show a
plausible, wrong VR Initiative (6 + Intuition 5 = 11 + 4D6) rather than an
obviously broken one. A blank is self-announcing: the GM can see the tracker
does not know, and fill it in.

**How to apply, per block:**

- **`pr4-lieutenant` (technomancer) stores Data Processing 5.** A technomancer
  has no deck — his living persona takes its Matrix ratings from his Mental
  attributes, and the Living Persona table makes Data Processing equal to
  **Logic** (printed pp. 101 and 251). His block prints Logic 5 (printed
  p. 383). Hot-sim VR therefore derives 5 + Intuition 5 = 10, with 4D6 from the
  mode (printed pp. 101, 159, 230, 231).
- **`pr5-lieutenant` (decker) stores no Data Processing**, and carries a
  GM-facing note recording his Shiawase Cyber-5 and its array `8 7 6 5`
  (printed pp. 227, 384, 439). The book refuses to assign a decker's array to
  particular attributes — the numbers are chosen when the deck boots, and two of
  them can be swapped again as a Free Action mid-fight (printed pp. 227, 228).
  Any single number the tracker picked would be the app making a tactical choice
  that belongs to the GM, and one the GM can legally change during the fight.
- **The other twelve blocks store no Data Processing.** Each carries only a
  commlink (printed pp. 381-384), which has no printed attribute array
  (p. 439), and none carries the sim module a commlink needs for VR (p. 439).

**Consequences and limits, all deliberate:**

- **Data Processing is not part of the augmented/base toggle.** It derives from
  Logic (p. 251) and the block prints no bracketed alternative. The toggle
  models switchable cyberware; this is not that.
- **Cold-sim stays available for the technomancer**, and computes correctly if
  chosen (10 + 3D6). Printed p. 251 says a living persona supports AR and
  hot-sim only, so this is technically an illegal mode for him — but per
  `SCOPE.md` the tracker does not enforce legality, and the GM overrides things
  routinely.
- **The printed line "Matrix Initiative 9 + 3D6 (Hot Sim)" is never imported as
  a value** (printed p. 383). It stays a GM-facing note. Both halves disagree
  with the rules: the 9 is his *physical* initiative attribute (Reaction 4 +
  Intuition 5), and 3D6 is the cold-sim dice count, on a line labelled hot-sim,
  for a character who cannot use cold-sim at all.
- **No mid-combat Data Processing mutation is modelled.** The book's mutators
  are Infusion and Diffusion of a Matrix attribute (p. 252) and a decker's
  Reconfigure Free Action (p. 228). The PR 4 lieutenant carries both Infusion
  and Diffusion of Data Processing on his own block (p. 383). These stay manual
  GM edits, and a manual edit follows whatever convention the tracker already
  uses for a mid-turn Reaction edit — no second, Matrix-only convention.
- **A stored 0 means "unset", never a rated 0.** A live persona's floor is 1:
  Diffusion cannot reduce a Matrix attribute below 1 (p. 252).

## 2026-08-29 — Overwatch Score banding below 40 is display-only

**Ruling:** The tracker may colour a decker's Overwatch Score into bands for
readability, but **no band below 40 carries any mechanical effect**. Crossing a
band raises no alert, launches no IC, and changes no state. Convergence at OS
40 remains the only threshold with consequences.

**Why:** SR5 defines exactly one Overwatch threshold — 40 (p. 232). It has no
"alert level", no "security tier", and nothing at OS 20; a search of all 32
occurrences of "Overwatch" in the CRB and its Master Index entry (which cites
only "SR5 231, 232") turns up no second threshold. Hosts launch IC when they
*spot* unauthorized activity (p. 247) or when the intruder *fails* a Sleaze
action (pp. 231, 236) — both event-driven, neither a function of OS. The
previous implementation invented an `'ic-alert'` tier at OS 20 and attributed
it to "Section 9.2 / Table 25", a citation format SR5 does not use. Colour
banding keeps the tension curve visible at the table — a decker should be able
to feel the clock running — without inventing a rule to do it.

**How to apply:** Bands are a CSS concern only. `OsAlertLevel` collapses to
`'none' | 'convergence'`; nothing between 0 and 39 is an alert. Any banding
thresholds chosen for colour are arbitrary presentation values and must be
commented as such, so no later reader mistakes them for printed rules. The
Master Index points at Data Trails p. 111 for expanded Overwatch rules; if that
book is ever added to `rules/`, revisit this before house-ruling further.

## 2026-08-29 — Reboot and jack-out reset Overwatch Score to zero, with no cooldown

**Ruling:** Rebooting the device a persona is running on, or jacking out, resets
that decker's Overwatch Score to **zero** and erases all their marks. There is
**no cooldown, no minimum offline duration, and no residual OS** — a decker may
reboot at OS 39 and return at OS 0.

**Why:** The reset itself is printed, not a gap: "When you reboot the device
your persona is on, your OS is reset to zero and all of your marks, as well as
the ones others may have put on your icon, are erased" (p. 242), and "When you
start using the Matrix after a fresh boot, you're as pure and innocent as the
driven snow" (p. 232). Jack Out "jacks you out of the Matrix and **reboots the
device you are using**" (p. 240), so it inherits the same reset. The genuinely
open question was whether to add friction to the resulting loop — RAW, a
Complex Action plus roughly two Combat Turns offline buys a clean slate and a
fresh fifteen-minute timer, which reads as though it defuses the only pressure
mechanic in the chapter. This table takes the printed rules as they stand: the
book explicitly endorses the tactic ("Hackers, by contrast, reboot regularly to
avoid detection by GOD and the demiGODs", p. 236), and losing **every mark**
mid-infiltration is a real cost — the decker has to re-hack everything they had
access to.

**How to apply:** Jack-out and reboot both zero the OS counter and clear that
decker's marks. Marks are per-persona, so this touches only the rebooting
decker; a teammate's marks on the same icon are unaffected. The device returns
"at the end of the following Combat Turn" (p. 242) — the tracker does not
enforce that timing, since it does not resolve actions, but the GM prompt
should mention it. Do **not** add a cooldown, a suspicion carry-over, or a
minimum offline timer without a new ruling here.

## 2026-08-28 — IC Initiative Attribute = Host Data Processing + Host Rating

> Restored 2026-09-01. This ruling was made on `feat/matrix-v2` (2026-08-28)
> and lost when that branch was abandoned before landing on `main`; the port
> that became `feat/matrix-v3` shipped without it and fell back to
> `Host Rating x 2` instead. Recorded here verbatim from that branch's
> `RULINGS.md`, not re-decided
> (`briefs/matrix-port-rules-correctness-spec.md`).

**Ruling:** An IC program's Initiative Score is **Host Data Processing + Host
Rating, plus 4D6** Initiative Dice. The 4D6 is printed (p. 247); the base
attribute is this house ruling.

**Why:** CRB p. 247 gives IC "its own Initiative Score" and 4D6 dice (it is
"treated as if it is in hot-sim"), and says "IC uses the Matrix attributes of
its host" — but it **never states the Initiative Attribute**. The hot-sim
formula is Data Processing + Intuition (p. 230), and IC has no Intuition or any
other Mental attribute. The nearest textual support for a substitution is
p. 237 ("if a device is completely unattended, the Device Rating stands in for
any Mental attributes an icon needs but doesn't have"), which is written for
defense tests rather than initiative, so this is an extension of it, not a
printed rule. Host Rating therefore stands in for Intuition, and Host Data
Processing supplies the DP term, which is the most faithful reading of "uses
the Matrix attributes of its host". The rejected alternative, Host Rating × 2,
is what `docs/UNVERIFIED-RULES.md` item 4 asserted; it is almost certainly a
transcription slip, since Host Rating × 2 appears elsewhere on p. 247 as the
IC **attack dice pool**, an unrelated quantity.

**How to apply:** IC initiative base = host's Data Processing + host's Rating;
Initiative Dice = 4D6 always. Host Matrix attributes are Rating, +1, +2, +3
assigned in any order (p. 247), so the DP term varies with how the GM built the
host and is a deliberate GM lever. The value must be exposed as an **editable
per-IC field** in the tracker so it can be overridden at the table. Do not
reuse Host Rating × 2 for initiative — that number is the attack pool only.

## 2026-08-28 — A VR decker is incapacitated, and is not a second initiative row

> Restored 2026-09-01, verbatim from `feat/matrix-v2`'s `RULINGS.md` — see the
> note on the ruling above.

**Ruling:** A decker in Cold-Sim or Hot-Sim VR is **physically incapacitated**:
the body cannot take physical actions, and if attacked physically it is treated
as "defender unaware of attack" (p. 189 — no defense possible, resolve as a
Success Test). A VR decker occupies **one** row in the initiative order, using
their Matrix initiative; the meat body is **never** a second participant row.

**Why:** CRB p. 229 establishes the state plainly ("your body goes limp and
your only sensory input comes from the Matrix"; in cold-sim "your meat senses
are blocked, as though your body were asleep") and p. 243 warns "don't do it
somewhere dangerous", but the book **never** gives mechanics for the limp body
under physical attack — no defense rule, no prone status, no waking rule,
nothing about the body being moved or restrained. The Rigger chapter is
equally silent. Treating it as p. 189's "unaware" case is the reading most
consistent with senses being blocked. The single-row half is not a gap but
printed rules: p. 160 is explicit that an alternate initiative type
**replaces** your Initiative Attribute and dice rather than adding a track (the
astral-projection worked example replaces Reaction + Intuition with
Intuition × 2), and p. 243 confirms switching VR→AR *loses* the VR dice.

**How to apply:** In this tracker the defense half is **flavour and state
only** — the app has no defense-roll code anywhere (`fullDefense` in
`src/app/shared/interrupt-actions.ts` is a declared interrupt stance with an
Initiative Score cost and descriptive text; `Participant.isInFullDefense()`
only reads action history; nothing rolls a defense pool). So the ruling's live
consequences are: (1) the PHYS LOCKED badge means "incapacitated, cannot act
physically", and (2) **no code may add a second participant for the meat
body** — a VR decker is exactly one row whose initiative is the Matrix one. If
a separately targetable body is ever wanted in the UI, it is an inert token, not
an initiative entry. Revisit the defense half only if the app ever rolls
defense tests.

## 2026-08-28 — A host is not an initiative participant; it perceives only through its IC

> Restored 2026-09-01, verbatim from `feat/matrix-v2`'s `RULINGS.md` — see the
> note two rulings above.

**Ruling:** A Matrix host is **never** a row in the initiative order. All host
perception happens through its IC — principally Patrol IC — on that IC's own
initiative. A host running no Patrol IC is effectively blind until the intruder
trips a printed detection trigger.

**Why:** Hosts have no Initiative Score, no Condition Monitor, and cannot be
attacked with Matrix damage (p. 229), and are never listed among combat
participants — so giving
one an initiative row would invent a participant the rules do not describe.
The countervailing text is p. 236, which says a target that survives an Attack
action "will most likely actively search for you on its next action", implying
the host acts; but p. 247 resolves this by having the host and its IC "instantly
share spotting information", so IC perception *is* host perception. The printed
detection triggers remain fully in force and are event-driven, not turn-driven:
a failed Sleaze action gives the target a free mark on you and immediately
alerts the owner and launches IC (pp. 231, 236), and a host that spots
unauthorized activity informs its owner and launches IC (p. 247).

**How to apply:** Model the host as **context, not a participant** — no
initiative row, no turn, no Initiative Score. Only IC entities enter the
initiative order. Host awareness reaches the tracker through two paths: IC
Matrix Perception on the IC's own action, and the printed failure/detection
triggers above, which fire as events regardless of whose turn it is. Note the
consequence for host design: a host with no Patrol IC has no polling perception
at all, so Patrol IC is what makes a host dangerous to a silent-running decker.

## 2026-08-28 — IC launched at the start of a Combat Turn rolls normally and acts that turn

> Restored 2026-09-01, verbatim from `feat/matrix-v2`'s `RULINGS.md` — see the
> note three rulings above.

**Ruling:** IC launched by a host at the beginning of a Combat Turn rolls its
Initiative Score as normal in Step 1 and acts in that same Combat Turn. The
mid-combat entry penalty (−10 per Initiative Pass already elapsed) is **not**
applied to it.

**Why:** p. 247 states the launch timing precisely — "A host can launch one IC
program per Combat Turn, at the beginning of each Combat Turn" — which places
the spawn at the same moment everyone else rolls initiative, so the p. 160
join-in-progress rule ("subtract 10 for each Initiative Pass that has already
occurred") has no elapsed pass to charge for. The book never reconciles the two
passages explicitly, which is why this is recorded as a ruling. It also matches
the stated design intent of escalating host pressure: "Once the host starts to
launch IC, it's time to finish up and buzz out of there" (p. 247).

**How to apply:** On spawn at a Combat Turn boundary, add the IC to the
initiative roll queue like any other participant — roll base + 4D6 (see the IC
Initiative Attribute ruling above) with no penalty. Also printed on p. 247 and
load-bearing here: a host launches **one** IC per Combat Turn, may run up to
its Rating in IC simultaneously, and cannot run more than one of each type at
once; crashed IC vanishes and may be relaunched at the start of the next
Combat Turn. IC never generates an Overwatch Score (p. 248) — it is always
considered legal.

## 2026-08-29 — IC Matrix Condition Monitor is 8 + (Host Rating ÷ 2)

> Restored 2026-09-01, verbatim from `feat/matrix-v2`'s `RULINGS.md` — see the
> note on the first ruling above. This one is dated 2026-08-29, not 2026-08-28,
> in that branch's own file; kept as originally dated rather than folded into
> the 2026-08-28 batch (`briefs/matrix-port-rules-correctness-spec.md` names it
> as one of "the five lost 2026-08-28 Matrix rulings" collectively, but its own
> heading was always the 29th).

**Ruling:** An IC program's Matrix Condition Monitor is **8 + (Host Rating ÷ 2),
rounded up** — the same shape as a device's, sized off the host's Rating. A
Rating 6 host's IC therefore has 11 boxes.

**Why:** The CRB gives IC a Condition Monitor (pp. 229, 247) and **never states
its size**. It also never gives IC a Device Rating, which is the number the
device formula needs. Both formulas the book *does* give have the same shape —
devices at `8 + (Device Rating ÷ 2)` (p. 228) and sprites at `8 + (Level ÷ 2)`
(p. 254) — and IC "uses the Matrix attributes of its host" (p. 247), borrowing
every other number it has from there. Host Rating is the one rating IC can be
said to possess. The rejected alternatives were a flat 8 (most literal, since IC
has no rating of its own to halve, but it makes host rating irrelevant to how
durable its IC is) and `8 + (Firewall ÷ 2)` (ties toughness to the damage-
resistance stat, but nothing in the book sizes a monitor off Firewall).

**How to apply:** `8 + Math.ceil(hostRating / 2)`, matching the device formula's
rounding (p. 48; the book writes character monitors as "8 + (Will ÷ 2, round
up)" on p. 108, confirming the convention for monitors). Filling it crashes the
IC: it vanishes from the host and the initiative order, and the host may run a
fresh copy at the start of the next Combat Turn (p. 247). IC cannot be repaired
and loses all damage when it stops running (p. 229) — so no repair path applies
to it.

## 2026-08-29 — VR Initiative Dice are absolute; meat augmentations do not stack

> Restored 2026-09-02. This ruling was made on `feat/matrix-v2` (2026-08-29)
> and lost when that branch was abandoned before landing on `main`; the port
> that became `feat/matrix-v3` shipped without it. Recorded here verbatim,
> not re-decided (Xavier's decision 3, 2026-09-02,
> `briefs/matrix-port-rules-correctness.md`).

**Ruling:** Cold-Sim sets a decker's Initiative Dice to **exactly 3D6** and
Hot-Sim to **exactly 4D6**, regardless of any Initiative Dice the character has
from augmentations, drugs or spells. Meat-side enhancements do **not** add on
top of the VR base. AR is unaffected — in AR the character keeps their ordinary
physical Initiative Dice.

**Why:** The CRB is genuinely ambiguous. The Initiative Attribute Chart calls
3D6/4D6 the "**Base** Initiative Dice" (p. 159), which reads as a floor that
enhancements add to; but the body text says you "get **+3D6** Initiative Dice
(remember that any enhancements or bonuses cannot take you past the maximum of
5D6)" (p. 229), and that parenthetical only makes sense if enhancements can
apply. The sample decker (p. 102) carries no augmentation line and settles
nothing. This tracker takes the "Base" reading: the mode determines the dice,
full stop. It is simpler to run at the table, and it stops a decker needing to
also be a street samurai to compete on initiative.

**How to apply:** Setting mode to COLD writes `dices = 3`; HOT writes
`dices = 4`. **Switching back to AR must restore the participant's pre-VR dice
count, not reset to 1.** This matters because the app has no augmentation model
— the GM types the character's *total* Initiative Dice into `dices` directly,
so an augmented decker's row already reads 3 or 4 before ever jacking in, and
an absolute write followed by a naive restore would silently destroy it.
`AstralParticipant.projectionDiceGain` (`src/Magic/AstralParticipant.ts`) is
the established pattern for remembering a mode-switch dice change and undoing
it exactly; VR should mirror it. Note the deliberate asymmetry with astral
projection, which uses a **relative delta** precisely so augmented dice survive
(`ASTRAL_PROJECTION_DICE_DELTA`, same file) — VR is absolute by this ruling,
astral is relative by the rules, and the two must not be refactored into a
single shared path. The 5D6 cap (pp. 52/288) still applies at the write site.

## 2026-08-29 — Marks propagated from a slave count toward the master's three

> Restored 2026-09-02, verbatim from `feat/matrix-v2`'s `RULINGS.md` — see the
> note on the ruling above.

**Ruling:** A mark earned on a slaved device also lands on its master and
**counts normally toward the three-mark cap on that master**. Three successful
hacks against slaved devices therefore yield three marks on the host, unlocking
the 3-mark actions (Reboot Device, Format Device). The master/host is alerted
only by the **original** action against the slave, under the ordinary
Attack/Sleaze detection rules — the propagation itself is silent.

**Why:** p. 233 states the propagation plainly — "if you get a mark on a slave
you also get a mark on the master. This happens even if the slave was marked
through a direct connection" — and that it does not work in reverse. What the
CRB never says is whether the propagated mark counts against the master's cap
of three (p. 236). Counting it normally is the reading that makes the tactic
work as the GM chapter clearly intends: p. 355 presents it as the signature
decker play, letting the hacker "gain marks on the device or its Master while
making tests against the much lower Rating of the device." It is also the
simplest model — one kind of mark, one cap, no second class of "access-only"
mark.

**How to apply:** `addMark()` on a slaved device writes the mark on the device
and one on its master, both counting toward their respective three-mark caps.
Propagation does not chain past one hop unless the intermediate is itself a
slave of a further master. It fires no alert of its own. Note the balance this
assumes: direct connection is deliberately strong — it zeroes noise, ignores
grid modifiers, and forces the weak device's ratings as the defense pool
(pp. 232-233) — and is paid for in fiction by the decker having to be
physically present at the device, and therefore vulnerable in meat space while
their body is limp in VR (see the 2026-08-28 PHYS LOCKED ruling). The tracker
should make that physical exposure visible, since it is the cost that balances
the tactic.

## 2026-08-29 — Matrix damage applies no penalty until the monitor is full

> Restored 2026-09-02, verbatim from `feat/matrix-v2`'s `RULINGS.md` — see the
> note two rulings above. This is the page-cited backing for the round-3
> `ICParticipant.wm` override (brief round-3 defect D5): IC's Matrix Condition
> Monitor must not feed a wound modifier the way `physicalHealth` does for a
> meat body.

**Ruling:** Matrix damage produces **no dice pool modifier and no rating
reduction** at any level below a completely filled monitor. A deck at 8 of 9
boxes performs exactly as well as an undamaged one. Only filling the track has
an effect.

**Why:** Printed, and unusually explicit: "There is no penalty for having Matrix
damage until your Matrix Condition Monitor is completely filled" (p. 228). This
is recorded as a ruling despite being a plain rule because it is the **inverse
of every other damage track in this tracker** — physical and stun both apply a
wound modifier as they fill, wired through `Participant.get wm()` and from there
into the Initiative attribute. The risk is not misreading the book; it is
reusing the existing damage code, which would silently introduce a penalty the
rules do not have.

**How to apply:** Matrix damage must never feed `wm`, never touch `baseIni`, and
never alter a Matrix attribute. It is a counter with one threshold. When the
track fills: a device is bricked and stays so until repaired (p. 228); a deck
being used in VR dumps its user with dumpshock (pp. 228, 229); IC crashes
(p. 247). Note the separate mechanic that *does* reduce attributes — Acid,
Binder, Jammer and Marker IC each drain one Matrix attribute per hit (p. 248) —
is **not** damage, is cleared by rebooting rather than repair, and is out of
scope for this module (see below).

## 2026-08-29 — This module tracks Matrix state; it does not apply effects

> Restored 2026-09-02, verbatim from `feat/matrix-v2`'s `RULINGS.md` — see the
> note three rulings above. This is the page-cited backing for round-3
> Decision 2 (`access-host-panel.component.ts`'s `confirmAccess()`): the panel
> records a GM-typed mark count and Overwatch delta and does not roll, compare,
> or resolve anything itself.

**Ruling:** The Matrix module records numbers the GM gives it. It does **not**
apply mechanical effects to attributes, dice pools or initiative as a
consequence of Matrix state. Attribute drain from Acid/Binder/Jammer/Marker IC
(p. 248), drone damage routing (p. 270), rigger damage rerouting (p. 266),
technomancer Stun conversion (pp. 229, 251) and program effects on damage math
(pp. 245-246) are **out of scope** — documented in
`briefs/matrix-condition-monitors-and-access.md` so the rules are not
re-derived, but not built.

**Why:** Xavier's scope, stated 2026-08-29: "the app is for tracking stuff, not
applying effects to attributes." The verification brief surfaced a large amount
of adjacent rules surface, and treating a rules brief as a work list is how the
first attempt at this module sprawled. Recording a condition monitor is
bookkeeping; mutating Data Processing because a Binder IC landed a hit is
resolution.

**How to apply:** New Matrix state is a field the GM edits and the app displays.
Before adding anything that *reacts* to Matrix state by changing another number,
check this ruling. The one deliberate exception already in place is the VR
interface mode, which changes the Initiative attribute and dice — that is core
initiative-tracker behaviour predating this module and is governed by p. 160.

**Related, now moot:** ruling M6 in the brief asked whether rebooting clears
Matrix damage. It needs no answer: this module has **no repair action and no
reboot action that touches damage**. The damage count is a number the GM sets
and clears by hand, so nothing in the app ever decides to clear it.

## 2026-09-01 — Tied IC act simultaneously, not by coin toss

**Ruling:** Two (or more) IC tied on effective Initiative Score, with no Edge,
Reaction or Intuition to compare, do not fall through to a coin toss. They act
**simultaneously** — the gamemaster's-discretion alternative p. 159 itself
prints ("at the gamemaster's discretion, both characters can act
simultaneously") — because that is what the engine already does for any tie of
this shape.

**Why:** `CombatManager.getNextActors()` (`src/Combat/CombatManager.ts:192-198`)
scans every `Waiting`, non-OOC participant with positive current initiative and
collects the highest-initiative group into `currentActors` — edge participants
first, then everyone else tied within the same edge state, grouped together.
It has no step that falls through to a coin toss for participants with no
Edge, Reaction or Intuition; it simply puts them in `currentActors` together
and both act.

`briefs/matrix-port-rules-correctness-spec.md`'s "Table Ruling 4" (Undefined /
needs a table ruling, item 4) originally recommended "fall through to the coin
toss, which is what the existing comparator will do with three absent
attributes" as its own default — that claim was checked against the code by
adversarial validation on 2026-09-01 and found wrong: the comparator is never
reached for this case, because `getNextActors()` groups equal-Initiative,
equal-Edge participants into `currentActors` before any coin-toss step would
run. The brief has been corrected in place rather than silently superseded, so
a later reader does not file the actual (correct) behaviour as a bug.

**How to apply:** No code change. This is the existing, already-correct
behaviour of `getNextActors()`; nothing needs to be built. If a GM wants a
strict one-at-a-time order between two tied IC instead, that is a manual
override at the table, not something the tracker currently automates.

## 2026-09-02 — IC has a Matrix Condition Monitor only; the inherited Stun track is dropped

**Ruling:** `ICParticipant` tracks Matrix damage only, on its `physicalHealth`/
`physicalDamage` slot per Table Ruling 2 above. It has **no** Stun track. The
10-box `stunHealth` it inherits from `Participant` is never read by `wm` or
`ooc` for an IC and carries no printed meaning.

**Why:** SR5's IC section gives each IC program "its own Condition Monitor"
(singular, p. 247) and never describes a second track. The 10-box Stun default
came from `Participant`'s generic construction (`stunHealth = 10`,
`Participant.ts`), not from any Matrix rule — a class-hierarchy artifact, not a
rules claim. Leaving it live would let `Participant.ooc`'s
`stunDamage >= stunHealth` half go out-of-combat on a track that does not
exist for IC.

**How to apply:** `ICParticipant` overrides `wm` to return `0` unconditionally
(the Matrix Condition Monitor produces no wound modifier at all below full,
per the restored "Matrix damage applies no penalty until the monitor is full"
ruling above) and overrides `ooc` to test only
`physicalDamage >= physicalHealth`, plus the shared manual "bench this
participant" flag every participant type carries. `stunHealth`/`stunDamage`
stay declared (removing the fields outright would touch shared `Participant`
plumbing far beyond this module) but are inert for IC — nothing in the Matrix
UI renders them, and nothing in `ICParticipant` reads them any more.

> **Addendum, round-4 (2026-09-02), "missed interaction 4":** the same
> treatment now covers `overflowHealth` too. `Participant`'s inherited
> overflow-track field (a meat Physical Condition Monitor concept, default 4,
> `Participant.ts`) had no ICParticipant-specific override at all — nothing
> currently reads it for an IC, so there was no live bug, but leaving it as a
> plain inherited field with a meat-body default was the same kind of latent
> trap this ruling's Stun-track fix exists to close off, should a future
> feature reuse a generic "apply damage"/"resistance track" helper built for
> meat characters against an IC. `ICParticipant.overflowHealth` is now pinned
> to `0`: Matrix damage has no overflow phase at all — an IC's Matrix
> Condition Monitor filling crashes it outright (p. 247), it does not spill
> into a further track the way a meat body's Physical Condition Monitor does.
> The setter is still overridden alongside the getter (delegating to
> `super.overflowHealth`) because TypeScript/JS accessor pairs are replaced as
> a unit — overriding only the getter would make the property silently
> read-only for any caller.

## 2026-09-02 — The Matrix module has no dice roller of its own

**Ruling:** No Matrix component gets its own dice-rolling widget. Where a GM
wants to roll dice for a Matrix action, they use the battle tracker's existing
dice roller (or their own physical dice) and type the result into the Matrix
module by hand.

**Why:** Xavier, 2026-09-02: "I'm not aware of a dice roller other than the one
that already exists in the battle tracker, the matrix module should not have a
separate dice roller." This withdraws Scope Question A and A′ from
`briefs/matrix-port-rules-correctness-spec.md` (both approved 2026-09-01,
"keep the roller inside the access-host panel, sever the wire to the
derivation, and route the roll into the shared log") — see that brief's
withdrawal note for the mechanical reason (the panel's roller never actually
worked, per that brief's appendix C1/C3) alongside this scope reason. It also
matches the restored "This module tracks Matrix state; it does not apply
effects" ruling above: a second roller is exactly the kind of resolution
machinery that ruling warns against growing back.

**How to apply:** `AccessHostPanelComponent` (the one component that had a
roller) has none — `marksThisAttempt` (renamed from `marksPlaced` round-4,
Decision 6 — see that ruling below) and the Overwatch delta it hands to
`OsPromptComponent` are both typed in by the GM from a result produced
elsewhere. No other Matrix component may import `DiceRollerComponent` or
`DiceRollRequest`. If a future Matrix screen wants a roll logged and visible to
players, it routes through the battle tracker's existing roller and logging
path, the same as every other roll in the app — it does not grow its own.

## 2026-09-02 — D-11 footnote: a restored ruling's wording, not its substance, was corrected

**What this is:** Not a new ruling. The 2026-08-28 "IC Initiative Attribute =
Host Data Processing + Host Rating" entry above (restored 2026-09-01) carries
a note claiming it was recorded "verbatim" from `feat/matrix-v2`. That word
is accurate for the ruling's substance and reasoning, but not for one exact
phrase, and round-4 validation flagged the mismatch (defect D-11): the
`feat/matrix-v2` original described the rejected `Host Rating x 2` value as
appearing "on the adjacent line of p. 247"; the text actually restored onto
this branch instead reads "elsewhere on p. 247" (see that entry's "Why"
section).

**Verified:** `rules/pages/p0249.txt` — "IC uses the Matrix attributes of its
host" (the line the ruling's DP term hangs on) is at line 24; the Host
Rating × 2 attack-dice-pool line is at line 63, in a different column of the
page's two-column layout. Not literally the adjacent line either way, so
"elsewhere on p. 247" is the more accurate of the two phrasings.

**Disposition:** kept as corrected rather than reverted to the milder
inaccuracy in the original. The "verbatim" claim on that entry should be read
as "verbatim in substance", not "byte-identical throughout" — this footnote
exists so a future reader does not treat that one phrase as a restoration
error and "fix" it back to the less accurate wording.

> **Correction, round-5 (2026-09-03):** the line number just above was itself
> off by one — "IC uses the Matrix attributes of its host" is at
> `rules/pages/p0249.txt:24`, not `:23` (line 23 is the previous sentence,
> "...so it gets a total of 4D6 Initiative Dice in"). Verified directly
> against the file with `cat -n`. The substance of this footnote is
> unaffected; only the cited line number is corrected.

## 2026-09-02 — Marks propagate up the containment hierarchy — this is not a Decision 1 violation

**Ruling:** `MatrixStateService.addMark()` placing an additional mark on a
target's host (Decision 7a) or on its open-grid parent (Decision 7b) is the
app writing a mark the GM did not directly type into that specific icon. This
does **not** contradict Xavier's Decision 1 (2026-09-02, "marks are recorded,
never derived": "we aren't doing any rolls outside the already existing dice
roller ... and we aren't comparing any dice either").

**Why the distinction holds:** Decision 1 forbids the app from *deriving* a
mark count from a **dice roll** — computing how many marks a hack earned from
hits, net hits, or any other roll result this app does not itself resolve.
Propagation is not that. It derives a second mark from a **rule Xavier has
explicitly ruled on**: a mark on a slaved device also marks its master (p. 233;
`RULINGS.md` 2026-08-29 "Marks propagated from a slave count toward the
master's three", restored 2026-09-02), extended by Xavier's decision 7b
(2026-09-02) to an open-grid parent/child chain. The GM still places the one
mark that starts the chain, by hand, from a resolution that happened at the
table — exactly as Decision 1 requires. The propagated mark's *value* (always
exactly 1, capped independently per icon at 3) is fixed by the rule, not
computed from anything the app rolled or compared.

**How to apply:** Do not read a future "the app placed a mark nobody clicked"
report against this pass as a Decision 1 regression without first checking
whether it is propagation under this ruling. If a new propagation path is
ever proposed that derives its mark *count* from something other than "the
GM's one manually-placed mark, multiplied by nothing", that new path needs
its own ruling — this entry authorizes only the fixed, one-for-one host/parent
propagation `MatrixStateService.addMark()` implements.

## 2026-09-03 — Propagation is device-only at both ends

**Ruling:** Only a `type: "device"` icon ever propagates a mark it receives
upward, and a propagation walk only ever lands on a device or a host. A file,
persona, IC, or nested-host icon neither propagates a mark it holds, nor
receives one propagated from below. A device parented to a file does not
propagate through the file — the walk stops there, and the file itself
receives nothing.

Verbatim: "Only getting marks on devices propagate to the hosts as well,
files and personas do not get propagated to and do not propagate" (Xavier,
2026-09-03).

**Why:** p. 233 states the device-only scope of slaving outright: "Only
devices can be slaves, masters, or part of a PAN. In a WAN, the slaves must
be devices, and the master must be a host" (`rules/pages/p0235.txt:54-58`).
The WAN passage the two host/parent propagation rulings above are built on
(2026-08-29 "Marks propagated from a slave count toward the master's three";
2026-09-02 "Marks propagate up the containment hierarchy") is itself written
for devices slaved to a host — "wide area networks, or WANs, with multiple
devices slaved to a host" (`rules/pages/p0235.txt:46-47`). Extending that
device-specific mechanism to files and personas was never supported by the
text; round-5 validation (validator defect 1) caught that
`MatrixStateService.addMark()` propagated from every `MatrixTarget` type
without checking, so marking three paydata files inside a host handed a
decker three marks on the **host** — enough for Reboot Device (p. 242, 3-mark
threshold) without ever hacking the host itself.

**How to apply:** `MatrixStateService.addMark()` only calls
`propagateMarkUp()` when the marked icon's `type === "device"`; within that
walk, the open-grid parent/child hop (Decision 7b) additionally requires the
*parent* to be a device before placing anything there or continuing the walk
past it. Host WAN propagation (Decision 7a) is unaffected on the destination
side — a host is always a valid destination, it has no `type` to gate on.
`HierarchyEditorComponent.parentOptionsFor()` mirrors the destination half in
the UI: a file/persona/IC/nested-host target is never offered as a parent
choice, and `canHaveParent()` hides the parent control entirely for a
non-device target, since it could never do anything. See
`MatrixTarget.parentTargetId`'s doc comment and `MatrixStateService.addMark()`'s
doc comment for the implementation.

## 2026-09-03 — Propagation is visible, not reversible

**Ruling:** Removing a mark never reverses `addMark()`'s propagation onto an
ancestor (host or open-grid parent) — this was already the behaviour
(`RULINGS.md` 2026-08-29, "Marks propagated from a slave count toward the
master's three", restored 2026-09-02) and stays unchanged. Verbatim, on being
asked whether an ancestor's mark should auto-remove when the propagating mark
is removed: "No the mark should not be removed upstream" (Xavier, 2026-09-03).

What changes is **discoverability**, not the mechanic: the GM must be able to
see that a mark on one icon also placed a mark somewhere else, before and
after the fact.

- **Before committing:** the `+Mark` control on a device states what it will
  *also* mark — "Also marks Host: <name>" or "Also marks: <parent name>" —
  before the GM confirms (`TargetCardComponent.propagationPreview`).
- **After the fact:** an icon whose current mark for a decker includes at
  least one that arrived by propagation shows a badge on that decker's mark
  row (`MatrixTarget.propagatedMarks` / `MatrixHost.propagatedMarks`),
  distinguishing it from a mark placed there directly. The flag is not a
  second ledger of *which* stacked mark was the propagated one — it clears
  once that icon's count for the decker reaches 0, and re-sets on the next
  propagation.
- **On removal:** the `×` / remove-mark tooltip on the icon that *caused* a
  propagation states plainly that the upstream mark stays, and the remove
  tooltip on the ancestor itself states that a propagated mark's own source
  is untouched by removing it there.

**Why no auto-removal:** an ancestor's mark may have other sources besides
the one propagation that happens to still be visible in the moment — a host
holds one running total, not a per-source breakdown, so an intruder with a
direct mark on the host *and* a propagated one from a slaved device looks
identical to an intruder with only the propagated one. Automatically
decrementing the host's count when the device's mark is removed could erase
a mark the decker legitimately still holds. The GM, who knows the actual
history at the table, corrects the ancestor's own row by hand if the
propagated mark genuinely needs to go.

**How to apply:** `MatrixStateService.removeMark()` and `removeMarkFromHost()`
only ever touch the record they're called on; `propagatedMarks[deckerId]`
clears only when that same record's count for that decker reaches 0. Do not
add a "remove upstream too" option without a new ruling here — this entry
settles that question as asked and answered.
