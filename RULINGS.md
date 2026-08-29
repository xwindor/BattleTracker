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
