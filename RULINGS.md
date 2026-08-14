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
Physical. All of it is undoable in one step, so a mis-typed Body is one Undo.

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
being workable once Xavier committed to removing the Undo mechanic from the
app entirely (see project memory / working notes — not itself a rules
question). With no other correction path, refusing to let a heal revive a
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
