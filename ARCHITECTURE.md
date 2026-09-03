# SR5E Battle Tracker — Architecture

This document maps how the tracker's combat engine actually behaves, based on
reading the code rather than the intent behind it. It builds on
`docs/APP_DOCUMENTATION.md` (which stays the broader reference for UI flows,
deployment, and event names) — this file goes deeper specifically on
initiative, turn/pass structure, participant state, tie-breaking, and how
session sync interacts with combat state. Where this doc and
`docs/APP_DOCUMENTATION.md` disagree, this doc describes what the code does
and calls out the conflict explicitly (see "Known rough edges" and inline
notes below).

Matrix and astral content here is scoped narrowly to how those modules hook
into core initiative — per `CLAUDE.md`, that module's *rules* are deferred
and unverified. Its class structure is not: `src/Matrix/` and `src/Magic/`
already exist in the tree, wired into the GM UI and session sync (see
"Matrix/astral hook" below).

**On line numbers.** This document cites symbols by name, not by line, except
where a line range is genuinely load-bearing. `battle-tracker.component.ts` is
~7,200 lines and moves constantly; every line citation in the previous
revision of this file had drifted by hundreds of lines. Grep for the symbol.

## 1. Where initiative order actually lives

There is no separate "initiative order" list. Order is derived at read time
from a single flat collection:

- `CombatManager.participants: ParticipantList` (`src/Combat/CombatManager.ts`)
  — every participant in the encounter, GM-owned, Matrix, astral, grunt or
  NPC-row, all in one list.
- `CombatManager.currentActors: ParticipantList` — the subset currently
  allowed to act this initiative score (see §5; ties can put more than one
  participant here simultaneously before UI-level tie-breaking trims it).

`ParticipantList` (`src/Combat/Participants/ParticipantList.ts`) is a thin
wrapper around a plain array (`_list: IParticipant[]`) with
`insert`/`insertAt`/`remove`/`clear` (and a `move()` composed from
remove + insertAt), plus two comparator methods: `sortByInitiative()` (its own
`initiativeComparator`) and `sortBySortOrder()`.

**In practice, `sortByInitiative()`'s comparator is not what determines
combat order.** The GM component's `sort()` branches on
`combatManager.started`:

- **not started** — `sortBySortOrder()` only. No initiative comparator runs at
  all and no tie-break; rows sit in the order the GM added them.
- **started** — `sortByInitiative()`, then *immediately* a second sort of the
  same array with a more elaborate comparator (`initiativeTieBreakComparator`,
  a private method on the GM component), then `enforceSingleCurrentActor()`.
  The second comparator is the one whose output actually reaches players; the
  first sort's result is completely overwritten — see "Known rough edges." In
  the "started" branch, `sort()` also runs `applyLieutenantPrecedence()`
  between the comparator sort and `enforceSingleCurrentActor()` — see
  "Lieutenant tie-break" immediately below.

Either branch ends with `syncSharedState()`.

**Lieutenant tie-break (p. 381 / `briefs/grunt-naming-and-statblocks-spec.md`
U7).** `initiativeTieBreakComparator` implements the plain ERIC ladder only —
Edge, Reaction, Intuition, coin toss, then insertion order — and is a totally
ordered, transitive comparator on its own: any two participants' relative
order follows from their own attributes alone, never from a third
participant. The p. 381 rule "a lieutenant tied with his own team always goes
first" is deliberately **not** implemented as a branch inside that comparator.
An earlier version did exactly that (`isLieutenantOf(p1, p2) ? -1 : ...`), and
it was wrong: a pairwise override inside a comparator does not compose safely
with the rest of the ladder, and produced a strict 3-cycle whenever a
lieutenant, his tied row, and an unrelated third participant were all tied and
the lieutenant beat the row on Reaction/Intuition but lost to the third party
on the same attributes — lieutenant < row, row < third party, third party <
lieutenant, all simultaneously true, which is exactly the kind of order
`Array.prototype.sort` is not specified to handle consistently.

Instead, `applyLieutenantPrecedence(items)` (private, GM component) runs as a
**post-sort adjustment**, after `initiativeTieBreakComparator` has already
produced a totally ordered array: for every participant with an entry in
`participantLieutenantTeamRowId` whose effective Initiative (`getCurrentInitiative()`
plus the same ±100 edge / −1000 OOC weighting the comparator uses) equals his
linked row's, it is spliced out and reinserted immediately before that row.
Everyone else's relative order — already fully decided by the ERIC ladder — is
left untouched. `sort()` calls it once after the comparator sort;
`enforceSingleCurrentActor()` calls it again on its own `ranked` copy of
`currentActors`, for the same reason it re-runs the comparator there — ties
can put more than one participant in `currentActors` simultaneously, and
whichever one is kept as sole current actor has to respect the same ordering
rule the display does.

`participantLieutenantTeamRowId: Map<IParticipant, string>` is keyed by
`getParticipantId(row)`, not an object reference — object identity does not
survive `restoreFromSharedState()`, which rebuilds every participant. It rides
`SharedGmParticipantState.lieutenantTeamRowId` (GM-only; a lieutenant's team
membership is not player-facing) and is set via `setLieutenantTeam()` /
`clearLieutenantTeam()`, both public on the GM component — reachable from the
Add Grunt dialog's lieutenant-template picker (`kind === "grunt"` with a
lieutenant template selected) **and**, retroactively, from a "Lieutenant of"
dropdown on the details panel's Stats tab for any already-existing,
non-row participant. It is **not** copied when a participant is duplicated
(`btnDuplicate_Click`) — a duplicated lieutenant is created unlinked, or a
clone and its source would both be linked to the same row.

Each participant carries a **stored, running Initiative Score** for the
current Combat Turn — `Participant.currentInitiativeScore` (backing field
`_currentInitiativeScore`). It is seeded
once per Combat Turn and thereafter only ever moved by signed deltas; it is
never recomputed from a base. `Participant.getCurrentInitiative()` reads:

```text
currentInitiativeScore + actionIniModifier
```

- `currentInitiativeScore`: the running Score. Reset to the bare Initiative
  attribute by `softReset()` (turn boundary, via `resetInitiativeScore()`) and
  re-seeded when `diceIni` is assigned (the Initiative Test).
- `actionIniModifier`: sum of `iniMod` for every entry in `actionHistory`
  (interrupts and declared actions that cost initiative — see §5). Interrupt
  costs are held here rather than debited straight off the Score so resetting
  an action gives the points back. In the normal turn loop both
  accumulators clear at the same moment (the turn boundary), so the total
  matches a debit-at-declaration model at every point in the turn. The one
  place they part company is `clone()` (§3): a duplicated participant starts
  with an empty `actionHistory`, so the interrupt spend already committed is
  **folded into the copy's `_currentInitiativeScore`** instead of being
  refunded. In-place type swaps (§6) take the other route — they carry
  `actionHistory` across verbatim, so a persisting interrupt such as Full
  Defense keeps both its cost and its status.

The inputs that move the running Score:

- `diceIni`: sum of the rolled dice for this combat turn. **Assigning it
  applies the difference as a Score delta**: `0 -> n` is the once-per-turn
  Initiative Test (Score becomes attribute + n); `n -> m` mid-turn is a dice
  change and adds/subtracts only the delta. Cleared by `softReset()`.
- `baseIni`: Reaction + Intuition equivalent for a standard participant
  (default `PARTICIPANT_DEFAULT_BASE_INI` = 6); recomputed by subclasses for
  Matrix/astral participants (§6). Assigning it applies the attribute
  difference as a same-sized Score delta via `syncInitiativeAttribute()`.
- `wm`: wound modifier, computed live from physical/stun damage vs. pain
  tolerance (0 if `hasPainEditor` is true), and **overridden wholesale by two
  subclasses** — `NpcRowParticipant` (a shared event accumulator) and
  `DetachedGruntParticipant` (one ladder over a single combined track); see
  §6. It feeds `initiativeAttribute = baseIni - wm`, so the damage /
  pain-tolerance / pain-editor setters also push an attribute delta into the
  Score.
- `applyInitiativeScoreDelta(delta)`: the general primitive. Used by the
  pass boundary (-10) and available for bare Score debits (Surprise, Shake
  Up, Electricity) that no base field can express. A delta of 0 is a no-op.
- `appliedInitiativeAttribute`: bookkeeping — the attribute value currently
  folded into the Score, so an attribute change becomes a one-time delta
  rather than a recompute.

The Score is deliberately **not clamped**; negative values are load-bearing
(they gate Interrupt Actions via `canUseAction()`, and the declared-action
Action Phase gate in §5).

There is no persisted "current order" field on `CombatManager` or on the
shared state's participant list beyond an `order` index computed at
broadcast time (`getSharedParticipants()`, see §7) — order is always
re-derived from current initiative, not stored as authoritative state.

## 2. Combat Turn and Initiative Pass

`CombatManager` tracks these as plain numeric/boolean fields, each behind a
getter/setter that assigns the matching backing field directly:

- `combatTurn: number` (starts at 1)
- `initiativePass: number` (starts at 1)
- `started: boolean`
- `passEnded: boolean` (starts `true`)
- `currentInitiative: number` (the initiative score currently being
  resolved, `NaN` when nothing is active)

Both boundary transitions are observable outside the engine:
`CombatManager.onInitiativePassEnded` and `onCombatTurnEnded` are nullable
listener fields — a GM-component callback set once in the constructor and
nulled again in `ngOnDestroy` because `CombatManager` is a singleton that
outlives the component, the same wiring shape `CombatManager.onSpentNpcRowsFlagged`
uses for row-wipe notifications (§6, "A row wiped out by damage") — fired from
`endInitiativePass()` and `endCombatTurn()` respectively so every call path
that can trigger a boundary logs it identically regardless of which one fired
(`briefs/combat-boundary-logging.md`). Two firing rules matter to anything that
consumes these hooks: `onInitiativePassEnded` fires only on the `false -> true`
transition of `passEnded` — not on every call to `endInitiativePass()`, so a
participant who acts again after the pass has already ended (e.g. a Delaying
participant) does not re-fire it — and it does **not** fire at all when that
same transition also ends the Combat Turn; in that case only
`onCombatTurnEnded` fires, never both. None of the three listener fields is
one of the getter/setter-backed fields above: they are plain wiring
references, not combat state.

**Pass boundary** (`nextIniPass()`): sets `passEnded = false`, increments
`initiativePass`, then for every participant **subtracts
`INITIATIVE_PASS_DECAY` (10) from the running Initiative Score** (including
OOC participants and those already at or below zero), flips every non-OOC,
non-Delaying participant's `status` back to `Waiting`, and — for a linked NPC
row — clears every member's per-NPC `hasActed` marker via `resetMemberActed()`
(§6). Delaying participants are left alone: they carry their `Delaying` status
across the pass boundary and re-enter scheduling only when explicitly acted on.

`addParticipant(participant, carriesRunningScore = false)` seeds a late
entrant joining an already-started turn with `-(initiativePass - 1) * 10`.
Re-insertions of an *existing* participant pass `carriesRunningScore = true`
— the in-place type swaps (§6) and the shared-state restore path (§7) —
because their Score has already absorbed the decay for every elapsed pass and
must not absorb it twice. A **newly merged** grunt row is deliberately *not*
such a case: it is a brand-new participant with no rolled Score, so it takes
the ordinary late-entry penalty (`RULINGS.md` 2026-08-04, "A merged Grunt
Group is a new row, and takes the late-entry penalty").

**Turn boundary** (`endCombatTurn()`): fires `onCombatTurnEnded` with the turn
that is ending (before any mutation), then resets `initiativePass` to 1,
increments `combatTurn`, clears `currentInitiative`, calls `softReset()` on
every participant (§3), and sets `started = false`. This is invoked
automatically from `endInitiativePass()` when `isOver()` is true — i.e. when
no non-OOC participant has positive current initiative left.
`hasMoreIniPasses()` is a separate check (any non-OOC participant with
`getCurrentInitiative() - 10 > 0`) used by UI to decide whether another pass
is coming; it only *previews* the decay and is not itself what triggers the
turn boundary — `isOver()` is.

There is also `endCombat()`, a manual teardown the turn loop never calls:
`combatTurn` and `initiativePass` back to 1, `currentActors` cleared,
`started` false, `softReset()` on everyone. It does **not** fire
`onCombatTurnEnded`. It also increments `combatGeneration`, a read-only
counter (get-only, no setter — only `endCombat()` advances it) added in the
Matrix rules-correctness pass (round-5 defect D-6) to give each combat
encounter a session identity distinct from `combatTurn`'s bare number:
`combatTurn` resets to 1 on every `endCombat()`, so on its own it cannot tell
"turn 1 of this encounter" apart from "turn 1 of the next encounter, after
this one ended". The Matrix module stamps `ICParticipant` with both
`spawnedOnCombatTurn` and `spawnedInCombatGeneration` when an IC launches, so
an IC left in a host's `icActive` list from a previous, already-ended combat
does not falsely read as "already launched this turn" the moment a brand-new
combat also reaches turn 1 (`ICSpawnerComponent.sameTurnIC`).

**What resets at a turn boundary** (via `softReset()`): `diceIni` → 0,
`currentInitiativeScore` → back to the bare Initiative attribute (the old
turn's Score is discarded, and the next Initiative Test re-seeds it),
`edge` → false, `status` → `Waiting`, `actionHistory` → `[]`, and — if the
participant was not OOC, or `revive` is passed — `ooc` is cleared. On an
`NpcRowParticipant` it additionally clears every member's `hasActed`. Damage,
health, `baseIni`, `dices`, and a row's shared wound accumulator all persist
across turns; they're untouched by `softReset()`. Only `hardReset()` (not
called anywhere in the turn/pass lifecycle — it's a manual reset) also zeroes
damage, sets `baseIni` to 0, and drops `dices` back to
`PHYSICAL_INITIATIVE_DICE` (1) via `setDicesWithoutRoll`.

> **`actionHistory` has a different write shape from everything else
> `softReset()` touches.** `diceIni`, `currentInitiativeScore`, `edge`,
> `status` and `ooc` all go through their normal setters. `actionHistory`
> does not: `softReset()` assigns `this._actionHistory = []` directly. This
> is one of four different ways `actionHistory` gets written across the
> codebase — see `Participant.doAction` (pushes in place), `resetActions()`
> (reassigns to `[]`), and the setter (assigns a whole new array) — worth
> knowing if a future change needs to intercept every write.

**What resets at a pass boundary:** `status` (Waiting/Delaying),
`passEnded`/`initiativePass`, per-member `hasActed`, and the -10 applied to
every running Score. Rolled dice (`diceIni`), action history, and edge stay —
a participant keeps whatever initiative modifiers they accumulated from
interrupts/actions taken earlier in the same turn as they carry into the next
pass; those only clear at the turn boundary.

## 3. Participant state

`Participant` (`src/Combat/Participants/Participant.ts`) implements
`IParticipant`. Every mutable field is private with a backing `_field` and a
getter/setter that assigns the backing field directly — this is a hard
convention, held not by any runtime enforcement but by
`PARTICIPANT_BASE_BACKING_FIELDS` (below) and the clone / in-place type-swap
machinery that reads backing fields by name: a new property that doesn't
follow the `_foo` + `get foo()` + `set foo(val)` shape is silently dropped by
`clone()` and the promote/demote helpers rather than carried across.

Fields: `name`, `status` (`StatusEnum`), `active`/`waiting`/`finished`
(booleans that shadow `status` rather than being derived from it — see
rough edges), `baseIni`, `diceIni`, `dices`, `edge`, `sortOrder`,
`actionHistory: Action[]`, `hasPainEditor`, `painTolerance`,
`overflowHealth`, `physicalHealth`, `stunHealth`, `physicalDamage`,
`stunDamage`, `currentInitiativeScore`, `appliedInitiativeAttribute`.

Several setters (`baseIni`, `physicalDamage`, `stunDamage`, `painTolerance`,
`hasPainEditor`, `diceIni`) do a second, dependent write after their own
backing-field assignment, in order to keep the running Initiative Score in
step (§1).

`PARTICIPANT_BASE_BACKING_FIELDS` is the exported list of the 20 base backing
fields a clone or in-place type swap has to carry over. It exists because
`MatrixParticipant.clone()`, `AstralParticipant.clone()`,
`DetachedGruntParticipant.clone()`, `NpcRowParticipant.clone()` and the GM
component's promote/demote helpers all copy the same set by name and would
otherwise drift — a live hazard now that the running Initiative Score lives in
a backing field (omitting it silently resets a participant's Score mid-turn).
Note what it does **not** contain: `_actionHistory`. Each `clone()` handles
that explicitly (§1), and the promote/demote helpers copy it separately (§6).

`dices` is the one field with **no plain setter** — it is a read-only getter
(`readonly dices: number` on `IParticipant`). Changing a participant's
Initiative Dice count is a rules event that has to roll the gained/lost dice
and move the running Score, so it goes through one of exactly two methods:

- `changeDiceCount(newDices, rollDie?)` — the mid-turn change. Clamps to
  `[MIN_INITIATIVE_DICE, MAX_INITIATIVE_DICE]` = `[1, 5]` (the 5D6 hard cap,
  brief pp. 52/288); if the participant has not taken this turn's Initiative
  Test (`diceIni <= 0`) or the count does not actually change, it just writes
  the count; otherwise it rolls `|delta|` dice via the injected `rollDie`,
  applies the *full* rolled total to the Score, and returns
  `{ values, delta }` (`DiceCountChangeResult`) for logging. It applies the
  floored-off remainder (below `MIN_DISPLAYED_DICE_TOTAL`) as a separate Score
  delta so no part of the roll is lost to the display floor.
- `setDicesWithoutRoll(val)` — construction, `hardReset()`, shared-state
  restore, `ICParticipant`'s constructor, standalone-grunt and merged-row
  construction, and initial `register_character` setup. Same `[1, 5]` clamp,
  no roll, no Score movement.

Removing the setter is deliberate: it turns "forgot to roll the dice delta"
from a silent Score bug into a compile error. The cap lives in exactly one
function (`clampInitiativeDiceCount`), which both paths call.

On the GM-component side there is one funnel,
`BattleTrackerComponent.changeParticipantDiceCount(p, newDices, options?)`,
that every dice-count-changing UI/session path calls. It adds the two
non-rules concerns the engine cannot see: the `combatManager.started` gate
(outside a running combat there is no running Score to move) and
`rollGainedDice: false`, the session-protocol case where the *player* client
rolls and submits the gained dice as a delta `roll_submission`.

`setDiceIniWithoutScoreChange(val)` is the deliberate exception: it writes the
`diceIni` backing field through `Set` and *skips* the Score delta. It exists
for display/bounds clamping (`enforceParticipantRollBounds()`, which fires on
any participant field edit, including unrelated ones like the name box) so a
cosmetic clamp can never turn into a silent Score change. Because the clamp is
Score-neutral, it can leave the rolled-total box showing a number that no
longer reconciles with the Score column (`initiativeAttribute + diceIni !==
getCurrentInitiative()` — the *effective* Score, running Score plus Initiative
committed to Interrupt Actions, brief F9 p. 167 — not the raw
`currentInitiativeScore` backing field, which can differ from what the GM
actually sees whenever the participant holds Full Defense or another
committed interrupt cost; e.g. after a large dice loss whose lost-dice roll
was small); `logRolledTotalClamp()` emits an Action Log line naming both
numbers whenever that happens, so the gap is never silent. It is also used by
the shared-state restore path (§7) to rebuild "already rolled" state without
disturbing the separately-restored Score. Actual dice rolls always go through
the `diceIni` setter.

The GM's rolled-dice-total input is bound **one-way**
(`[ngModel]="p.diceIni"` + `(ngModelChange)="onParticipantRolledTotalChanged"`,
`battle-tracker.component.html`), deliberately — a two-way `[(ngModel)]` would
push the raw typed value through the Score-moving setter before any validation
could run, and an `(input)` listener cannot intercept it either (template
listeners are registered ahead of `ngModel`'s host listener, so they observe
the *previous* model value). The handler clamps to `[0, dices * 6]` first
(`clampInitiativeRoll` / `getInitiativeRollMax`, `src/app/shared/roll-utils.ts`),
then assigns, so a typed edit moves the Score only by the legitimate old→new
rolled-total delta, and Angular writes the clamped value back into the DOM.

Two fields are computed, not stored:

- `wm` (wound modifier): `floor((physicalDamage - painTolerance) / 3)` +
  the same for stun, each floored at 0; forced to 0 if `hasPainEditor`.
  Overridden entirely by `NpcRowParticipant` and `DetachedGruntParticipant`
  (§6).
- `ooc`: `true` if manually flagged OOC (`_ooc`), or if physical damage
  reaches `physicalHealth` (Pain Editor case), or if either physical or
  stun damage reaches its respective health track (non-Pain-Editor case).
  Also overridden by both grunt classes (§6).

There is no PC/NPC field distinction anywhere in `IParticipant` or
`Participant` — the class makes no structural distinction between player
and non-player characters. "Player-controlled" is tracked entirely outside
the combat engine, in the GM component's `participantOwners: Map<IParticipant,
string>` (§7), not on the participant itself. Anything resembling an NPC
distinction (declared actions, UI affordances) is a UI-layer concern, not a
domain-model one. The grunt classes in `src/Grunts/` are the closest thing to
an exception, and they model *Condition Monitor shape and group initiative*,
not "is a PC".

`clone()` is used by `CombatManager.copyParticipant()` ("duplicate NPC"
button). Note the split of responsibility, which is easy to get wrong:

- `Participant.clone()` copies every scalar field **verbatim**, including
  `_edge`, `_active`, `_status`, `_waiting` and `_sortOrder`. The only two
  things it changes are `_currentInitiativeScore` (seeded from the source's
  `getCurrentInitiative()`, i.e. Score *including* committed interrupt spend,
  so duplicating a participant mid-turn does not refund what they already
  paid) and `_actionHistory` (emptied).
- `CombatManager.copyParticipant()` is what resets `edge`, `active`, `status`
  (to `Waiting`) and `waiting` on the copy, and stamps a fresh `sortOrder`.

So a caller that uses `clone()` directly for anything other than
`copyParticipant()` gets a participant that is still Active/Edged if the
source was. Name collision handling (in `copyParticipant`) appends an
incrementing numeric suffix (`"Ganger 1"`, `"Ganger 2"`, …).

> **Numbering note.** §4 ("Undo model") was deleted when Undo/Redo was
> removed from the tracker (brief "Remove the undo/redo system"). The
> remaining sections keep their original numbers rather than closing the
> gap, because every section number here is cross-referenced from comments
> throughout `src/`, `server.js`, and the other docs — renumbering would
> have meant chasing down every one of those citations for no reader
> benefit. §5 follows directly.

## 5. Actor progression through an initiative score

`CombatManager.getNextActors()` scans all `Waiting`, non-OOC participants
with positive current initiative, and picks the highest-initiative group —
with edge participants unconditionally taking priority over non-edge ones
regardless of score, and only ties within the same edge state grouped
together into `currentActors`. It also sets `currentInitiative` to the highest
effective initiative it saw.

`goToNextActors()` wraps `advanceToNextActors()` behind the `advancingActors`
re-entrancy flag. `advanceToNextActors()` runs `flagSpentNpcRows()` as its
pre-step (§6), marks the outgoing `currentActors` `Finished`, recomputes the
next group, marks it `Active`, and — if nobody is left — calls
`endInitiativePass()`.

`act(actor)` marks that actor `Finished`, removes them from
`currentActors`, and advances to the next group once `currentActors` is
empty. `Delay` (UI-driven, `btnDelay_Click`) sets `status = Delaying` and
removes the actor from `currentActors` without marking them `Finished` —
they don't reappear until the GM explicitly acts on them again.
`seizeInitiative(p)` simply sets `p.edge = true`, which the edge-priority
branch of `getNextActors()` and the tie-break comparator then act on.

### Interrupt Actions

Interrupts apply an initiative cost by pushing an `Action`
(`{ key, iniMod, persist?, martialArt?, edge? }`) onto `actionHistory` via
`Participant.doAction()`; `actionIniModifier` sums these into every subsequent
`getCurrentInitiative()` call. `canUseAction()` blocks an action whose
`|iniMod|` exceeds current initiative, and blocks re-selecting a `persist`
action already in history (e.g. Full Defense, which is meant to apply once and
hold). `NpcRowParticipant` overrides `canUseAction()` to return `false`
unconditionally (§6).

**Two different files hold "interrupt actions", and they are not the same
list. Do not conflate them:**

| | `src/InterruptTable.ts` | `src/app/shared/interrupt-actions.ts` |
|---|---|---|
| Export | `interruptTable: Action[]` | `INTERRUPT_ACTION_META: Record<string, InterruptActionMeta>` |
| Contents | **6** entries | **18** keys (17 named + `custom`) |
| Carries | `key`, `iniMod`, `persist` | `label`, `description`, `verb` |
| Role | the mechanically offered, Score-costing set | display text and Action Log verb phrases |

`interruptTable`'s six entries are `fullDefense` (`iniMod: -10`, `persist:
true`), `block`, `intercept`, `hitTheDirt`, `dodge` and `parry` (all
`iniMod: -5`). `ActionHandler` (`src/Combat/ActionHandler.ts`) exposes them as
both `interrupts` (the whole table) and `coreInterrupts` (the same six, mapped
by an explicit `CORE_INTERRUPTS` key list), and `player-view.component.ts`
carries a third hardcoded copy of the same six key strings.

`INTERRUPT_ACTION_META` additionally names `counterstrike`, `diveForCover`,
`reversal`, `rightBackAtYa`, `runForYourLife`, `diveOnTheGrenade`,
`sacrificeThrow`, `riposte`, `protectingThePrinciple`, `shadowBlock`,
`iAmTheFirewall` and `custom` — most with empty `description` strings. **These
are labels without mechanics.** None of them exists in `interruptTable`, so
none has an `iniMod`, none can be selected, and none can cost Initiative. An
agent asked to "add the missing interrupts" must add `Action` entries to
`interruptTable` (and keys to `CORE_INTERRUPTS` if they should be offered by
default); adding metadata alone changes nothing.

`getInterruptLabel` / `getInterruptDescription` / `getInterruptVerbPhrase` are
the accessors, the last falling back to `using <label>` for an unknown key so
the log clause is always readable.

### Declared actions and the Action Phase gate

A **second, separate** Score gate covers the ordinary Act modal (declared Free /
Simple / Complex actions, which never touch `canUseAction`): at an Initiative
Score of 0 or below a participant has no Action Phase, so
`BattleTrackerComponent.hasLiveActionPhase()` refuses the Simple and Complex
categories while leaving Free open, and `isDeclaredActionSelectionValid()`
refuses to submit a Simple/Complex selection made before the Score dropped
(`MIN_ACTION_PHASE_INITIATIVE_SCORE` = 0, `RULINGS.md` 2026-08-07). It applies
to every participant type. Note that `hasLiveActionPhase()` returns `true`
unconditionally while `combatManager.started` is false — outside a running
combat there is no Score to gate on. Defense Tests are not modelled as gated
actions at all and are unaffected.

**There is an engine-side action-economy model, and it is not in the GM
component.** `src/app/shared/` holds the declared-action layer:

- `declared-actions.ts` — the data. `DECLARED_ACTIONS` (categories of
  `DeclaredActionItem`, each with a `DeclaredActionEconomy` of
  `free`/`simple`/`complex`), `REPEATABLE_SIMPLE_ACTIONS`,
  `DECLARED_ACTION_DESCRIPTIONS`, `DECLARED_ACTION_VERB_PHRASES` (+
  `getDeclaredActionVerbPhrase`), and the Matrix gates
  `CYBERDECK_REQUIRED_ACTIONS`, `ALL_MATRIX_ACTION_NAMES` and
  `ILLEGAL_OS_ACTIONS` (Overwatch Score cost per illegal action).
- `declared-action-engine.ts` — the rules. `DeclaredActionEngine` and
  `DeclaredActionSelection` (`{ free, simple[], complex }`) model the
  Free/Simple/Complex slot economy, repeated Simple actions, pairwise
  `actionConflicts` (e.g. Quick Draw vs. Ready Weapon), and the
  `simpleAttackActions` / `callShotCompatibleActions` /
  `multipleAttackCompatibleActions` sets. `NO_DECLARED_ACTION_PHRASE` is the
  log text for an Act submitted with nothing selected.

The GM component holds the *Score* gate (`hasLiveActionPhase`,
`canUseDeclaredAction`, which also applies the cyberdeck/Matrix checks) and the
modal wiring; the slot economy and conflict rules belong in
`DeclaredActionEngine`. A new action-economy rule goes there, not into
`battle-tracker.component.ts`.

## 6. Matrix/astral hook into core initiative

There is no separate Matrix or astral initiative track, host, or ordering
structure at the `CombatManager` level. Both `MatrixParticipant`
(`src/Matrix/MatrixParticipant.ts`) and `AstralParticipant`
(`src/Magic/AstralParticipant.ts`) are direct subclasses of `Participant`
and insert into the exact same `CombatManager.participants` list as anyone
else — same status lifecycle, same `getCurrentInitiative()` formula, same
tie-break comparator. `ICParticipant` further extends
`MatrixParticipant` (still the same list, still the same engine).

There are, in total, **four** `Participant` subclasses plus one grandchild:
`MatrixParticipant` (→ `ICParticipant`), `AstralParticipant`,
`NpcRowParticipant`, and `DetachedGruntParticipant`.

What the Matrix/astral subclasses add is only how `baseIni`/`dices` get *set*,
plus a UI-gating flag:

- `MatrixParticipant.applyJackInMode(mode, intuition, applyDiceCount)`: sets
  `vrMode`, `baseIni = dataProcessing + intuition`, `jackedIn = true`,
  `blocksPhysicalActions = (mode !== AR)`, and hands the mode's dice count
  (4/3/1 for Hot-Sim/Cold-Sim/AR, via the static `initiativeDiceForMode`) to
  the **mandatory** `applyDiceCount` callback — applied last, so a caller that
  logs the resulting Score sees both halves of the change folded in. The
  callback is required rather than optional so every caller has to say whether
  this is a mid-turn change (`changeDiceCount`, rolls the delta) or setup
  (`setDicesWithoutRoll`, does not) — it used to assign `dices` itself and
  leave the roll to callers, which is how the "Switch Mode" control came to
  change the dice count with no Score effect at all.

  **Data Processing may be unset** (RULINGS 2026-08-30). `dataProcessing` is a
  plain non-nullable `number`, so "unset" is represented by the sentinel
  `DATA_PROCESSING_UNSET = 0` (`src/Matrix/MatrixParticipant.ts`) - a stored 0
  means *no value entered*, never a rated 0. The rules floor for a live persona
  is 1 (Diffusion cannot reduce a Matrix attribute below it, printed p. 252),
  so 0 is not a reachable rating and is safe as a sentinel. When Data
  Processing is unset, `applyJackInMode` derives **no** VR Initiative attribute
  (`baseIni` stays at the sentinel) and the GM's Data Processing box renders
  blank with a "not set" placeholder rather than a literal 0. Promoting a
  participant to a Matrix form no longer seeds a hardcoded default - the old
  `defaultDP = 6` was nobody's rating and read on screen exactly like a real
  one.

  `getParticipantBaseInitiative()` uses the Data Processing formula **only
  while actually jacked into a VR mode**. It previously applied it to any
  `MatrixParticipant` regardless of mode, so editing Reaction or Intuition on a
  participant sitting in AR silently recomputed from Data Processing. AR uses
  physical Initiative and physical Initiative Dice (printed p. 231), so the
  guard is on `jackedIn`/`vrMode`, not on the class.
- `AstralParticipant` carries the same shape of state (`astralProjecting`,
  `blocksPhysicalActions`, `isAwakened`) but has **no `applyJackInMode`
  equivalent**: the INT×2 base formula lives in the GM component's
  `toggleAstralProjecting()`, not on the class. Its dice count is expressed as
  a **relative** delta, not an absolute per-mode count:
  `ASTRAL_PROJECTION_DICE_DELTA` = `ASTRAL_INITIATIVE_DICE (3) -
  PHYSICAL_INITIATIVE_DICE (1)` = +2, requested by `toggleAstralProjecting()`
  on the way in, through the `changeParticipantDiceCount` funnel so the gained
  dice are rolled and move the running Score. `ASTRAL_INITIATIVE_DICE` is 3,
  not 2 (`RULINGS.md` 2026-08-30, "Astral Initiative is 3D6 total, not 2D6" —
  this entry supersedes the dice *count* in the 2026-07-31 entry below it,
  though the *shape* of the rule, a relative delta rather than an absolute
  overwrite, is unchanged and still cited as 2026-07-31). Relative rather than
  absolute so a magician already carrying bonus Initiative Dice (Increase
  Reflexes, wired reflexes, a drug) keeps them (`RULINGS.md` 2026-07-31,
  "Bonus Initiative Dice carry additively into astral space"). The way *out*
  does **not** blindly negate the constant: the funnel's 5D6 cap (pp. 52/288)
  can absorb the requested +2 into fewer dice or nothing (a magician already
  at 5D6 gains no die and the Score does not move), so `AstralParticipant`
  records what was actually realized in `projectionDiceGain` — carried by
  `clone()` — and the return trip requests `-projectionDiceGain`, not `-2`.
  This keeps a capped-out round trip (project, return) net-zero on both dice
  count and Score, matching p. 160's rule for a dice decrease: that
  participant "immediately rolls the number of lost dice and subtracts the
  total from their Initiative Score (along with any decrease to their
  Initiative Attribute)" — i.e. you only roll and subtract dice you actually
  lose.
  `MatrixParticipant`'s per-mode counts are still absolute and have the same
  modelling limitation; that is a deferred Matrix-module concern.
- `ICParticipant` sets `baseIni = hostDataProcessing + hostRating` (Table
  Ruling 1, RULINGS.md 2026-08-28 "IC Initiative Attribute = Host Data
  Processing + Host Rating", restored 2026-09-01 — a house rule, not a
  printed value; `baseIni` stays an ordinary editable field afterwards) and
  `dices` to a flat 4 for every IC type, including Patrol (p. 247 states no
  exception), both through the no-roll paths. An earlier version of this
  class set `baseIni = hostRating * 2` (that number is the IC attack dice
  pool printed elsewhere on p. 247, an unrelated quantity) and gave
  Patrol only 2 dice, citing a "Table 4 / Table 24" that does not exist in
  print; corrected in `briefs/matrix-port-rules-correctness-spec.md`. Its
  `hostRating`/`hostDataProcessing` setters recompute `baseIni` **and**
  `physicalHealth` (IC's Matrix Condition Monitor, reused from the inherited
  slot — see below) through a shared `recomputeFromHost()`, so a GM
  correcting a host's Rating post-spawn does not leave the IC on stale
  values (round-4 defect D-4). `recomputeFromHost()` now recomputes each
  field only while it has never been hand-edited (round-5 defect D-8):
  `ICParticipant` overrides the `baseIni`/`physicalHealth` accessors purely
  to flag a direct write from outside the class, and `recomputeFromHost()`
  writes through `super.baseIni =`/`super.physicalHealth =` so its own
  writes never trip that flag — a GM who types a real Initiative Score for a
  boss IC no longer loses it the moment they fix a typo in the host's
  Rating. The flag survives `clone()`.
- `ICParticipant` overrides three more `Participant` members to keep IC's
  Matrix-only damage model from leaking meat-body semantics (round-4,
  Xavier's decision 4 and "missed interaction 4"):
  - `wm` always returns `0` — Matrix damage carries no dice-pool or
    Initiative penalty below a completely full monitor (p. 228; `RULINGS.md`
    restored 2026-09-02, "Matrix damage applies no penalty until the monitor
    is full"), so the base `Participant.wm` formula (which derives a wound
    modifier from `physicalDamage`/`physicalHealth`) must not run for IC.
  - `ooc` depends only on `physicalDamage >= physicalHealth` (the reused
    Matrix Condition Monitor slot) plus the shared `manualOoc` "bench this
    participant" flag — never on the inherited Stun fields. IC has "its own
    Condition Monitor" (singular, p. 247) and no printed Stun track;
    `stunHealth`/`stunDamage` stay declared (removing them would touch
    shared `Participant` plumbing) but are inert for IC (`RULINGS.md`
    2026-09-02, "IC has a Matrix Condition Monitor only; the inherited Stun
    track is dropped").
  - `overflowHealth` is pinned to `0` — Matrix damage has no overflow phase;
    an IC's monitor filling crashes it outright (p. 247) rather than
    starting an overflow track the way a meat Physical Condition Monitor
    does. The inherited `overflowHealth` (default 4, `Participant.ts`) is a
    meat-only concept with no IC reader today, but the override forces an
    explicit "not applicable" signal for any future caller (round-4,
    "missed interaction 4"; same reasoning as the `wm`/`ooc` overrides
    above, addended onto the same `RULINGS.md` 2026-09-02 entry).

`blocksPhysicalActions` is explicitly *not* the same as `ooc` — per the
in-code comment on `MatrixParticipant`, a jacked-in decker stays fully
scheduled in initiative; only the action-planner UI is expected to hide
physical action categories while the flag is set. The combat engine itself
has no awareness of this flag (`CombatManager`/`ParticipantList` never
reference `blocksPhysicalActions`).

Every subclass overrides `clone()` to copy its extra fields, because
`Participant.clone()` — used by `copyParticipant()` — only knows about base
fields and would otherwise silently downgrade a duplicated
decker/astral/grunt/row participant back to a plain `Participant`. The
base-field list those overrides copy (and the GM component's promote/demote
helpers) is the single exported constant `PARTICIPANT_BASE_BACKING_FIELDS`
(§3).

GM UI wiring (`battle-tracker.component.ts`) supports converting a
participant in place between plain/`MatrixParticipant` via
`promoteToMatrixParticipant`/`demoteToParticipant`, triggered by the
player-side `configure_deck` session command (§7), and the astral equivalents
`promoteToAstralParticipant`/`demoteFromAstralParticipant` — these are live
type swaps on an existing list entry, not a separate registration path. All
four promote/demote helpers copy `_actionHistory` across as well (unlike
`clone()`), and re-insert with `addParticipant(p, true)` so the carried Score
is not decayed again for passes it has already absorbed.
`demoteToParticipant` and `demoteFromAstralParticipant` both perform the
dice-*decrease* half of the change (roll the lost dice, subtract the total) via
`changeParticipantDiceCount`; the `baseIni` write only covers the attribute
half. Every other dice-count-changing path — the row and Stats-tab dice-count
inputs, `gmJackIn`, `gmJackOut`, `onVRModeChange`, and the `configure_deck`
jack-in/jack-out branches — routes through that same funnel. The only paths
that write `dices` without it use `setDicesWithoutRoll` and are deliberate
non-change events: `restoreFromSharedState`,
`upsertPlayerParticipant`/`register_character`, the `configure_deck` `create`
payload, the `ICParticipant` constructor, `createStandaloneGrunt`,
`mergeGruntsIntoRow`, `Participant.hardReset()`, and the (currently uncalled)
Phase-1 `MatrixStateService.jackIn` skeleton. `upsertPlayerParticipant` is only
a non-change event for *setup*: it routes through `applyRegisteredDiceCount`,
which falls back to the funnel when a `register_character` command is resent
for a participant that already exists, combat has started, they have already
rolled this turn, and the incoming count actually differs — that case is a
mid-turn dice change (a drug or spell firing player-side), not setup.

Session sync (`SessionSyncService.SharedParticipantState`,
`src/app/services/session-sync.service.ts`) already carries the full set of
Matrix/astral fields (`isMatrix`, `vrMode`, `overwatch`, `overwatchAlert`,
`jackedIn`, `isVRCatatonic`, `dataProcessing`, `attack`, `sleaze`,
`firewall`, `deviceRating`, `isAstral`, `isAstralProjecting`) plus
Matrix-target/host fields (`SharedMatrixTarget`, `matrixTargets`,
`currentHostName`) even though the host/target GM workflow itself is still
mid-build per `docs/MATRIX_MODULE_PLAN.md` — the shared-state shape was
deliberately front-loaded ("Phase 4 wires broadcasting; defined here so the
shared types are stable from Phase 1 onward").

`CLAUDE.md`'s "Matrix module is deferred" should be read narrowly: what's
deferred is *rules verification* (`docs/UNVERIFIED-RULES.md`) and the
remaining GM-workflow build-out (host/target spotting, mark tracking, OS
thresholds UI, IC spawning — see `docs/MATRIX_MODULE_PLAN.md`). The domain
classes, initiative integration, and badge/session-sync plumbing for Phase 1
already exist and are live in the tracker.

### Grunts: rows, standalone grunts, and the moves between them

`src/Grunts/` models three things, and the lifecycle between them is a loop,
not a one-way street:

```text
        createStandaloneGrunt()          detachMember()
   (nothing) ───────────────► DetachedGruntParticipant ◄─────────── NpcRowParticipant
                                        │                                   ▲
                                        └────── mergeGruntsIntoRow() ───────┘
                                                 (2+ grunts, none rolled)
```

- `NpcRowParticipant` — several NPCs sharing one Initiative Score, one slot in
  the order. Its NPCs are `GruntMember` objects, not participants.
- `DetachedGruntParticipant` — one grunt-shaped NPC on its own Initiative
  Score, with the grunt single Condition Monitor. Reached either by detaching
  from a row, or built from scratch by `createStandaloneGrunt()` (`RULINGS.md`
  2026-08-04 / addendum Decision 9) — the standalone case is not a
  second-class detach, it is a first-class way to add a grunt.
- `GruntMember` — one NPC inside a row. A plain class, **not** an
  `IParticipant`.

#### Linked NPC rows (grunt groups)

`NpcRowParticipant` (`src/Grunts/NpcRowParticipant.ts`) is **one entry in
`CombatManager.participants`**, with one running Initiative Score, one slot in
the derived order, and one -10 at each pass boundary. The NPCs in it are
`GruntMember` objects (`src/Grunts/GruntMember.ts`) hanging off the row —
deliberately *not* participants, so they never appear in the order and the
engine loops in §2/§5 stay untouched. Members act back-to-back inside the
row's single slot; the row exposes `members` / `activeMembers` for the UI to
step through. There is no per-member turn state beyond `hasActed`.

Overrides that carry the rules (see `briefs/npc-group-initiative.md` and the
`RULINGS.md` entries from 2026-08-01 onward):

- `wm` = the row's **own accumulated shared wound modifier**
  (`_rowWoundModifier`), which is the house rule: any member's wound moves the
  row's shared Score, for everybody, through the existing
  `initiativeAttribute` → `syncInitiativeAttribute()` delta path (§1). No new
  Score plumbing was added for this feature. It is an **event accumulator, not
  a sum over the current members**: only `applyDamageToMember` / `healMember`
  move it, so adding, removing or detaching a member is Score-neutral (a
  reinforcement inherits the row's score per Decision 7; scenario S4 says the
  members left behind keep the row's score untouched). Its setter floors it at
  0 and floors it to a whole number, and it is carried across Combat Turn
  boundaries because `softReset()`/`resetInitiativeScore()` never touch it
  (p. 159: wound modifiers may affect Initiative Score "on this and any
  subsequent Combat Turns").
- `ooc` = `super.ooc` (the manual flag only, since the row's own inherited
  damage tracks are unused and stay at zero) **OR `isWipedOut`**. A row has no
  Condition Monitor of its own — each member has a grunt-style single combined
  track (`gruntConditionMonitorBoxes(body, willpower)` = `8 +
  ceil(max(Body, Willpower) / 2)` boxes, `GRUNT_OVERFLOW_BOXES` = 0, no
  overflow). Because those tracks are meaningless, the GM details panel renders
  **no Condition Monitor tab at all** for a selected row (the members' monitors
  are edited in the row panel), and renders a *single* combined bar for a
  selected `DetachedGruntParticipant`; the PC two-track display is for everyone
  else. `hasGruntConditionMonitor()` is the guard, `isNpcRow()` the exclusion.
- `softReset()` calls `super.softReset()` then `resetMemberActed()`.
- `canUseAction()` always returns `false`: row members cannot take Interrupt
  Actions at all (the GM component also reports `canInterrupt: false` for a row
  in the shared state, §7). `detachMember(member, factory)` is the way out — by
  default it hands back a `DetachedGruntParticipant`, a `Participant` subclass
  that keeps the grunt Condition Monitor shape after the detach: `wm` and `ooc`
  are overridden to work off `physicalDamage + stunDamage` against a single box
  count, and the final-attack record (`lastDamageType` / `lastDamageValue` /
  `gruntBody`, plus `gruntWillpower` for re-sizing) travels with it so p. 379's
  alive/dead comparison still resolves. A caller-supplied factory
  (`AstralParticipant` / `MatrixParticipant`, for an initiative-type change)
  gets the boxes and damage but PC-shaped two-track semantics — a known limit,
  recorded in `RULINGS.md` (2026-08-01, "A detached grunt keeps its single
  Condition Monitor").
- A member who is out of action **can** be healed back up: `healDamage` has no
  `outOfAction` gate, `GruntMember.outOfAction` is re-derived from the box
  count on every read, and the row's shared accumulator is paid back exactly as
  it is for a member who was never fully down (`RULINGS.md` 2026-08-07,
  reversing the 2026-08-02 refusal — the "use global Undo instead" correction
  path it relied on stopped being workable once Undo was removed from the
  tracker).
  The final-attack `lastDamageType`/`lastDamageValue` record is untouched by a
  heal, so p. 379's alive/dead read stays correct history. Same for a
  `DetachedGruntParticipant`, whose `ooc` was always live-derived.
- `DetachedGruntParticipant` also carries its own `applyDamage(boxes, type)` /
  `healDamage(boxes)` (`RULINGS.md` 2026-08-13, "A killing blow's Damage Value
  can exceed the boxes left on the track"), mirroring `GruntMember`'s methods
  of the same name: the boxes actually **written** onto
  `physicalDamage`/`stunDamage` are capped at the track's remaining capacity
  (no overflow, p. 379), but the DV **recorded** for the p. 379 alive/dead
  comparison is the attack's full DV, uncapped. Before this, a standalone or
  detached grunt's Condition Monitor widget could only ever apply as many boxes
  as were left on the track — a killing blow bigger than the remaining boxes
  was unrecordable — so this gives the standalone/detached panel the same `DV`
  + `P`/`S`/`H` GM controls the row panel already had
  (`getGruntDamageValue`/`setGruntDamageValue`/`hitGruntPhysical`/
  `hitGruntStun`/`healGrunt` in the GM component, all thin plumbing over the
  two domain methods); the `H` (heal) control reads the same DV input the
  `P`/`S` controls read, and takes that many boxes back off rather than always
  taking one. The Condition Monitor *widget's* box-clicking still
  writes `physicalDamage`/`stunDamage` directly and cannot express an over-max
  hit.

**Alive or dead.** `resolveGruntFinalState(outOfAction, lastDamageType,
lastDamageValue, body)` in `GruntMember.ts` is the single implementation of
p. 379's post-combat call, shared by `GruntMember.finalState` and
`DetachedGruntParticipant.finalState` so detaching cannot change the verdict.
It returns a `GruntFinalState` of:

- `standing` — not out of action at all;
- `alive` — the final attack was Stun, or Physical with DV **less than** Body;
- `dead` — Physical with DV **greater than** Body;
- `undetermined` — Physical with DV **exactly equal** to Body. The rulebook
  does not state a result, so the tracker records the inputs and refuses to
  guess; the GM decides (`RULINGS.md` 2026-08-01, "Downed grunt with final
  Physical DV exactly equal to Body").

#### Merging standalone grunts back into a row

`mergeGruntsIntoRow(grunts, rowName?)` (exported from `NpcRowParticipant.ts`)
is the inverse of `detachMember` and the second half of the lifecycle above.
It is a **pure function**: it builds and returns the row and never touches the
encounter's participant list — removing the merged grunts and adding the row
is the caller's job.

- **Minimum size.** `MIN_MERGEABLE_GRUNTS` = 2. One grunt is not a group.
- **The gate.** `hasRolledInitiativeThisTurn(p)` (`p.diceIni > 0`, the same
  signal `pendingRoll` is built from) must be false for *every* selected
  grunt. Refusal is all-or-nothing and carries a GM-facing `reason`, because
  merging only the ones that hadn't rolled would silently build a different
  group than the GM selected.
- **No retroactive wound penalty.** Each grunt's Condition Monitor damage
  carries into the row verbatim (via `DetachedGruntParticipant.toMemberSnapshot()`
  → `GruntMember.fromSnapshot()`), but the row's `rowWoundModifier` is set to
  **0** — Decision 1's trigger is a wound *event*, and damage taken before the
  merge is not one. Same precedent as a reinforcement joining an existing row.
- **No hand-bench refusal.** An earlier build refused a merge including a
  hand-benched grunt. Nothing in the app ever set that flag, so the check was
  unreachable dead code and was removed (`RULINGS.md` 2026-08-07, "Manual
  grunt bench flag removed as unreachable"). A grunt down by *damage* was never
  refused and still is not.

The row comes back **unrolled** (`diceIni` 0) with the first selected grunt's
`baseIni` and dice count — grunts are grouped precisely because they share one
stat block (p. 378) — so the GM makes the one group Initiative Test for it. The
result type is `GruntMergeResult` (`{ ok, row, merged, refused, reason }`);
`reason` is always populated, including on success.

#### Spent, wiped out, and emptied rows

`NpcRowParticipant.isSpent` covers **both** a row whose every member is out of
action and a row *emptied* by removal or detach (`everPopulated` is what
distinguishes an emptied row from a brand-new one the GM has not filled in yet,
which is left alone) — either way nobody is left to act, so `isSpent` is what
`flagSpentNpcRows()` uses to decide whether the row has to give up the
current-actor slot. But since brief Decision 21 (`RULINGS.md` 2026-08-13,
"Emptying a row by hand is not the same as wiping it out") the **red flag
itself** — `spentFlagged`, `ooc`, the downed-participant styling — is driven by
the narrower `NpcRowParticipant.isWipedOut` (at least one member present, all
of them out of action), not by `isSpent`. A row emptied by hand — its last
member removed or detached — satisfies `isSpent` (it cannot act, it has
nobody) but not `isWipedOut`, and is left as a plain, unstyled empty row for
the GM to delete whenever convenient. This means an empty-by-hand row can in
principle still be selected by `getNextActors()` if its Score is still above 0
and its `status` is `Waiting` — the same latent corner case the "brand-new, not
yet populated" row already tolerated (`isSpent` false there too, for the same
reason); in practice the GM is prompted to delete the row in the same tap that
empties it (see `removeRowMember` below), so the window is normally momentary.

A row wiped out **by damage** is **flagged, not deleted** (`RULINGS.md`
2026-08-07, reversing the 2026-08-01 auto-delete ruling): it keeps its slot in
the order, reads `ooc === true` so `getNextActors()` skips it and the GM list
gives it the ordinary out-of-action styling, and leaves only when the GM taps
the per-row trash icon (`btnDelete_Click`, the only path that removes a row
still holding members). `CombatManager.flagSpentNpcRows()` is the single place
this is decided; it runs at the top of `advanceToNextActors()` and again from
the GM component's damage/heal/detach/remove handlers so the flag lands on the
tap that caused it, and it keys the flag/log/`ooc` consequence off `isWipedOut`
while still pulling *any* `isSpent` row (wiped or merely emptied) out of
`currentActors` if it was acting. The flag is remembered on the row
(`spentFlagged`) so it is announced once, and cleared again if a heal
brings a member back (Decision 13), or if a wiped-out row's downed members are
later removed by hand until none are left (it reads as a plain empty row from
that point, not a wiped-out one) — either way a later collapse is announced
afresh. If the row that just went spent was the participant currently acting it
is pulled out of `currentActors` and `flagSpentNpcRows()` advances the order
itself — the same pattern as `btnDelay_Click` — behind the `advancingActors`
re-entrancy flag, so it never re-enters `goToNextActors()` from inside that
method's own pre-step. Without the advance, emptying the acting row (by damage
or by hand) left `currentActors` holding a participant that could no longer act
with `passEnded` still false, which renders neither an Act button nor a Next
Pass button. Newly-flagged rows are reported to the GM component through the
`onSpentNpcRowsFlagged` listener, fired *before* the advance so the log reads
in the order things happened.

The GM component's `removeRowMember()` (the per-member trash icon) is the one
row mutation that **prompts** (brief Decision 21): it always confirms first,
the same `confirmationDialog.simpleConfirm` pattern `btnDelete_Click` uses, and
when the NPC being removed is the row's last, the same single Yes/No answers
both "remove this NPC" and "delete the now-empty row" — there is no second
prompt. Deleting the row this way runs the identical side-map cleanup
`btnDelete_Click` does (`forgetParticipant`, plus
`forgetMapEntry(rowMemberDamageValues, member)` for the member's own queued
Damage Value). `detachRowMember`
is unchanged in this respect — detaching is not destructive (the NPC goes on to
its own initiative row), so it does not gain a new prompt.

#### Per-member Act

Each `GruntMember` carries a per-NPC `hasActed` marker (brief Decision 18) —
the row-member equivalent of a participant's Act state, since the row is one
participant and its `status` cannot say which of six gangers has gone. It gates
nothing in the engine, and is cleared by `nextIniPass()` and by
`NpcRowParticipant.softReset()` (both via `resetMemberActed()`). Decision 18
originally kept it off the session-sync wire entirely (GM bookkeeping; did not
survive a rejoin) — **reversed** by `briefs/gm-reconnect-state-loss.md` Open
Decision 2 (`RULINGS.md` 2026-08-19): a mid-pass rejoin is exactly when the GM
needs to know which of six gangers has already gone, and the row's `status`
has no way to say. It rides `SharedGmParticipantState.rowMemberHasActed`
(GM-only, index-aligned with `rowMembers`; §7 "The GM-only channel") rather
than `rowMembers[].hasActed` itself, which would put it on the player-facing
wire (adversarial review round 2026-08-19, defect D5). Since brief Decision 22
the row has **no whole-row Act
button** at all (`isNpcRow(p)` hides it in the template; ordinary participants
are unaffected) — a group does not take one action, its members each take their
own. Since Decision 23 the per-member control is the real declare-action path,
not a silent toggle: tapping "Act" on a still-standing member
(`btnRowMemberAct_Click`) opens the same Act modal an ordinary participant's
`btnAct_Click` opens, scoped to that NPC via `actModalRowMember`
(`actModalParticipant` stays the row itself, since the row is what holds the
shared Score and Action Phase the modal gates on); `submitActModal()` branches
on `actModalRowMember` and, for a row member, calls `performRowMemberAct()`
instead of the ordinary `performAct()` — it logs the declared action attributed
to the NPC (actor = the row, NPC named in the text, same convention as every
other row log line), sets that member's `hasActed`, and only calls
`CombatManager.act(row)` — finishing the row's Action Phase and advancing the
order, exactly what `performAct` does for an ordinary participant — once every
member in `row.activeMembers` has acted. Decision 24 gates the per-member Act
button on `canRowMemberAct(row)`: `currentActors.contains(row)` (the row's
turn) and `hasLiveActionPhase(row)` (Decision 16 — Score above 0).
`toggleRowMemberActed()` (Decision 18's original silent toggle) is kept, but
the template now only reaches it in the **un-mark** direction — tapping an
already-"Acted" pill flips it back off in one tap with no modal and no second
log line — and that direction is deliberately **never** gated by
`canRowMemberAct`, so a mis-tap can always be corrected regardless of whose
turn it is.

Member-list mutations (add, remove, damage, detach) mutate the row's member
array directly. The GM-local side-map cleanup that goes with a removal
(`forgetParticipant()`) runs via `forgetMapEntry` / `forgetSetEntry` — every
GM-local map keyed on the removed participant has to be dropped too, or the
entry outlives the participant it was keyed on and a later re-add would show
stale bookkeeping. Since Decision 14 that cleanup
runs from `btnDelete_Click`, and since Decision 21 also from `removeRowMember()`
when confirming the last member's removal deletes the now-empty row in the same
tap; a merely-flagged (not deleted) row keeps every side-map entry either way,
because it is still in the encounter and its NPCs can still be healed back up.

Row/grunt **log routing** splits three ways (`RULINGS.md` 2026-08-07, brief
Decision 17): `logRowEvent(actor, gmText, playerText?)` writes the GM's line and
a possibly-different player line — damage and heal lines keep the running
Condition Monitor total for the GM and drop it entirely for players (the
*maximum* is dropped from **both** copies, brief Decision 25, `RULINGS.md`
2026-08-13 "Condition Monitor maximums never appear in any log" — a hit still
reads `(6)`, never `(6/10)`); `logGmOnlyRowEvent` (→ `appendGmOnlyLog`) carries
the group-wound house-rule line and the "every member is out of action" line,
which are bookkeeping about NPCs rather than events the table witnesses. Since
`briefs/action-log-readability-spec.md` the group-wound line also carries
`SharedLogEntry.houseRule`, which drives a GM-only "house rule" badge in the
log pane (the words "house rule" no longer appear in the text itself, only on
the badge) — `logGmOnlyRowEvent`/`appendGmOnlyLog` take an `extra?:
Partial<SharedLogEntry>` for this and any future per-entry flag. One row event
does **not** route through `logRowEvent`: `performRowMemberAct` writes its own
local + shared pair directly, so its local copy can carry a colon between the
row and the member (`action-log-readability-spec.md` fix-round defect D5 —
`logRowEvent`'s colon-free local shape reads as a run-on once the text itself
opens with the member's name, e.g. "Gangers G 1 took aim…" instead of
"Gangers: G 1 took aim…").

GM-component-side, a row is created by `addNpcRow()` and is given an Edge
rating of `NPC_ROW_EDGE_RATING` (0), which is what makes the existing
`initiativeTieBreakComparator` resolve a row's ties by Reaction, then
Intuition, then the coin toss (`RULINGS.md` 2026-08-01, "Grunt Edge: the book
contradicts itself, Edge 0 stands") - **unless the row is tied with its own
linked lieutenant**, in which case the lieutenant goes first regardless of
Reaction/Intuition/coin toss (p. 381, `briefs/grunt-naming-and-statblocks-spec.md`
U7). That override is **not** part of `initiativeTieBreakComparator` itself -
see "Lieutenant tie-break" below for why, and for where it actually lives.
Rows inherit every side-map obligation in
§7 / "Known rough edges"; `forgetParticipant()` is the shared cleanup helper
for participants removed outside `btnDelete_Click`.

**Session sync for rows.** `restoreFromSharedState()` reconstructs
`MatrixParticipant` and `AstralParticipant` from the `isMatrix`/`isAstral` flags
on the wire, and `NpcRowParticipant` from an `isNpcRow` flag alongside them
(see §7 for what a restore does and does not rebuild generally). The row
payload on `SessionSyncService.SharedParticipantState` is `isNpcRow`,
`rowMembers` (`SharedGruntMemberState[]` — name, Body, Willpower, filled boxes,
and the final-attack type/DV p. 379 settles alive-or-dead from),
`rowWoundModifier` (the shared accumulator, Decision 1) and `rowEverPopulated`.
`NpcRowParticipant.toRowSnapshot()` / `restoreRowSnapshot()` and
`GruntMember.toSnapshot()` / `GruntMember.fromSnapshot()` are the domain-side
halves, so the component never pokes member internals. The accumulator is
restored verbatim rather than re-derived from member damage: its trigger is a
wound *event*, not the current roster, so a pre-wounded joiner (Decision 7) or a
detached-while-wounded member would both be mis-scored by a re-derivation.
Because the row comes back as a row, `canUseAction()` keeps refusing Interrupt
Actions and the next broadcast keeps `canInterrupt: false` (criterion 17 /
Decision 3), which the plain-`Participant` restore silently broke.

Row members' Condition Monitors were, for a while, the one kind of damage that
survived a rejoin at all — they are row state, not the participant-level
`physicalDamage`/`stunDamage` fields. That is no longer the special case it
was: `briefs/gm-reconnect-state-loss.md` put participant-level damage,
Condition Monitor shape, turn state and more on a GM-only channel (§7, "The
GM-only channel"), so a row's members are now merely *one of several* kinds of
state that survive, not the only one.

**Still not reconstructed on rejoin:** `ICParticipant` only, now — and that is
a deliberate, accepted gap (Decision D5), not an oversight. There *is* an
`isDetachedGrunt` flag on `SharedParticipantState`, but it remains
**presentation only** — it exists so the player view can badge a lone grunt
the way it badges a group, and `restoreFromSharedState()` deliberately does
not use it to reconstruct the class; a standalone or detached grunt is
reconstructed instead from the GM-only channel's `isGrunt` flag (§7), which
*is* used for that purpose. `DetachedGruntParticipant` therefore now comes
back correctly, with `gruntBody`/`gruntWillpower`/the final-attack record all
intact. `ICParticipant` still returns as a `MatrixParticipant` — no
`isIC`/`icType`/`hostRating`/`linkedTargetId` field exists anywhere on either
channel, by Decision D5's explicit scope cut, not because the transport could
not carry it. Panel-expansion `Set`s (`expandedRowPanels` and friends) are
keyed by participant object and are not cleared by a restore, so a restored
row's member panel starts collapsed.

## 7. Session sync and its effect on combat state

Transport: `server.js` (Express + Socket.IO) relays events between one GM
socket and any number of player sockets in a room; combat state itself
never lives on the server beyond a last-known snapshot
(`sessions: Map<room, { state, log, gmState, lastActivity, createdAt }>`).

That snapshot is **durable**: `server/session-store.js` persists one JSON
file per room under `SR5E_DATA_DIR` (default `data/rooms/`), written atomically
(temp file + rename) ~1s after the last change, flushed immediately on
`gm:close-session` / `gm:end-session` and on `SIGINT`/`SIGTERM`. Every room is
loaded back into the Map *before* `server.listen`, so a room survives a
`pm2 restart` and a multi-day gap. **Retention is indefinite, with one
exception** (spec Open Decision 5 as amended 2026-08-05): no room is ever
removed for age, and a room dies only when a GM uses End Room — except that at
the hard room cap (`TOTAL_ROOM_CAP`), the single oldest room nobody is
connected to may be evicted to make room for a new `gm:create-session` (see
"Room-creation bounds" below). Unlike End Room, an eviction leaves a tombstone:
it happens to a GM who was not there to see it, so their next `gm:join-session`
for that code explains why via `roomNotFoundReason()` rather than a bare "Room
not found". `lastActivity` is still stamped on every write. A housekeeping
sweep still runs at startup and every 24h, but all it does now is clear legacy
`<ROOM>.expired.json` markers — both the ones the previous 30-day build wrote
and any corrupt one — after `DEFAULT_TOMBSTONE_RETENTION_MS` (30 days); it
removes no live rooms.

`touchSession(room)` has **seven** callers: `session:update-state`,
`session:append-log`, `gm:join-session` (so a bare rejoin still advances
`lastActivity` and the persisted copy), `gm:close-session` (an immediate flush
point), `releasePlayerClaims` — itself one call site reached from three
triggers (a genuine socket `disconnect`, `evacuateRoom`, and
`detachSocketFromPreviousRoom`), and the one the spec calls out as easiest to
miss because it mutates `session.state.participants`/`session.state.oocOwnership`
in place rather than through either emit handler — and `session:update-gm-state`
(brief "GM reconnect state loss"), which itself has **two** call sites inside
one handler: the happy path, which stores the pushed `gmState` and touches, and
the refusal path (review defect D4, 2026-08-19 follow-up), which clears
`session.gmState` to `null` on a rejected packet and must touch that clear too
— otherwise the clear never reaches disk and a restart resurrects the stale,
discarded `gmState`. All seven go through the single `touchSession(room)`
helper so a further site added later cannot silently skip persistence. Four of
the seven call sites carry an inline `// write site N of 7` comment directly on
the line; the other three (the `releasePlayerClaims` call, `gm:close-session`'s
call, and the refusal-path clear) carry the same information in a preceding
comment block instead, so re-count against `grep -n 'touchSession(' server.js`
rather than trusting the comments. See `briefs/persistent-rooms.md` and
`touchSession`'s own doc comment.

### The room-ownership choke point

Every event that acts on a room has to answer one question: *does this socket
belong to the room it named?* That was answered per handler, and it drifted —
`session:update-state` and `session:append-log` grew the check, `session:command`
never did, so any socket that had called the credential-free
`gm:create-session` could aim `act` / `delay` / `interrupt` /
`register_character` / `claim_character` at another room's code and have that
room's GM tab apply it.

There is now **one rule in one function**: `authorizeRoomPacket()` in
`server/room-guards.js`. It is reached two ways, and a handler cannot skip it:

1. `server.js` installs it as a `socket.use` middleware, so it runs before every
   handler on the socket, including handlers nobody has written yet. A refused
   packet is answered (`session:error` plus the ack callback, so a client
   awaiting `closeSession`/`endSession` gets a reason rather than a timeout) and
   dropped; it is deliberately *not* raised as a middleware error, which would
   disconnect the GM over one bad emit.
2. `guardLifecycle()` calls the same function directly, for its ack contract.

Default-deny is by payload **shape**, not by registration: any event whose first
argument carries a `room` string is treated as room-scoped even if it is absent
from `ROOM_SCOPED_EVENTS`. Only `ROOM_ENTRY_EVENTS` — `gm:create-session`,
`gm:join-session`, `player:join`, the three events that *assign* membership — are
exempt. A future handler therefore cannot reintroduce the *authorization* hole
by forgetting to opt in; it would have to opt out on purpose. This does not
mean a new handler can never crash the process on a malformed payload it
destructures itself — see the process-level `uncaughtException` guard in
`server.js` and the note on that below. Individual handlers no longer repeat
the role/room checks, on purpose: duplicated copies of the rule are what drifted.

Per-event roles, from `ROOM_SCOPED_EVENTS`: `session:update-state` is GM-only.
`session:append-log` is also GM-only (round 5, P2-3) — no player client ever
legitimately emits it (every player-originated log line reaches the wire
through `session:command`, which the GM tab validates and turns into a
shared-log entry itself), and unlike `session:command` the log-entry payload
has no player-identity field to check `actor` against, so a `role:"player"`
socket calling it directly used to reach the (identity-blind) schema check and
could broadcast a forged `actor` ("GM", another player's name) that persisted
verbatim under indefinite retention. `session:command` allows both `gm` and
`player`, gated instead by `command.player` matching the authenticated
identity (below). `gm:close-session` and `gm:end-session` are GM-only and carry
`requiresExistingRoom: true`. Every other room-scoped event not listed in
`ROOM_SCOPED_EVENTS` falls back to `DEFAULT_ROOM_SCOPED_ROLES` — "GM or
authenticated player".

Order of refusal is `invalid-payload` (room-entry events only:
`gm:join-session` / `player:join`, whose payload is destructured directly —
round-4 defect D1) → `invalid-room-code` → (lifecycle only) `room-not-found` →
`role-required: …` → `room-mismatch`. `invalid-payload` is checked first and
only for the two events that destructure a payload before any other logic
runs; every other event skips straight to `invalid-room-code`. Room codes are
`/^[A-Z0-9]{6}$/`. Lifecycle events answer "room not found" *ahead* of the
membership check so an End Room retry after a lost ack still reads as the
terminal success it is (defect D5), even though the end has by then cleared the
issuing socket's own membership. The write paths deliberately do **not** require
an existing room, or the contentless reaper's self-healing recreate would break.

`gm:close-session` and `gm:end-session` both run `evacuateRoom()`, which
releases every departing player's claim, clears `socket.data.room` /
`socket.data.role` / `socket.data.playerName` on every socket attached to that
room, then `socketsLeave()`. `socketsLeave()` alone was not enough: it clears
Socket.IO membership but not `socket.data.room`, which is what the ownership
rule authorises against — so a second GM tab still logically in an *ended*
room passed every check afterwards and recreated the room through
`getOrCreateSession` on its next broadcast. With indefinite retention that
resurrection is permanent, i.e. "End Room" did not end the room.

**Claim release happens before `socketsLeave()`, not after** (round 5,
Symptom A). `releasePlayerClaims()` broadcasts to `io.to(room)`, Socket.IO's own
room roster; emitting that after every socket, including the GM's own, has
already left the room sends both the `session:state` and the `session:command
release_claims` it produces to nobody. The GM tab's `participantOwners` cache
never learns the claim was released, and a later rejoin's push re-asserts the
stale owner right back onto the server. `detachFromPreviousRoom()` (the round-4
D4 room-switch path) already released before leaving for the same reason;
`evacuateRoom()` now matches it, so the same operation is never ordered two
different ways.

**Correction (review defect D5, round 6): this ordering is not what actually
protects the closing GM's own tab, live.** The reordering above is kept — it is
correct, it matches `detachFromPreviousRoom()`, and the release still persists
to disk either way — but on a real close the closing GM's own tab never
processes the reordered broadcasts at all: `server.js` emits `session:closed` /
`session:state` / `session:command release_claims` in the same tick as the ack,
and the tab's ack handler (`btnCloseShareSession_Click`) calls
`sessionSync.disconnect()` as soon as the ack resolves. Any *other* GM tab still
in the room disconnects on `session:closed` first and misses the same broadcasts
for the same reason. So the load-bearing fix for Symptom A, in practice, is
**`reconcileOwnershipFromServer()`** (below), called on every (re)join — not
this ordering. Do not delete `reconcileOwnershipFromServer()` as "redundant"
with the ordering fix above; it is the thing actually doing the work.

### Crash containment (P2-1, round 5)

Two separate defences, neither of which is the same as the choke point above
and neither of which alone is a full guarantee:

1. **Defensive destructuring.** Every handler that destructures a room-scoped
   payload defaults it to `{}` — `session:update-state`, `session:append-log`,
   `session:command`, `gm:close-session`, `gm:end-session`, alongside
   `gm:join-session`/`player:join` (round-4 D1). An emit with no payload or an
   explicit `null` no longer throws `const { room } = undefined`. This is
   per-handler and must be repeated by any new handler that destructures its
   payload — the choke point does not do this for you (see below).
2. **`process.on("uncaughtException", ...)`** in `server.js`, registered before
   any other module code runs. Node does not catch a synchronous throw from an
   `EventEmitter` listener; by default it kills the whole process, taking every
   room and every connected GM/player down over one bad code path anywhere —
   not only in a room-scoped handler. The handler logs loudly, flushes every
   pending debounced room write synchronously (`store.beginShutdown()`, the
   same call `SIGTERM` uses), and exits with code 1 (not 0) so a process
   manager restarts it and can tell a crash-restart from a deliberate one.
   Deliberately does **not** try to keep serving: a throw mid-handler can leave
   `sessions`, `socket.data` or the write queue half-mutated in a way this
   level cannot know about, and continuing risks quietly persisting corrupted
   state to every room touched afterward. Durable rooms plus the GM tab's
   reconnect-push already make a clean restart a non-event for a live table
   (spec Open Decision 6), so failing fast and letting pm2 restart is the
   cheaper failure mode.

**What the room-ownership choke point's "default-deny by payload shape"
guarantee does and does not cover**: it closes the *cross-room-authorization*
hole — an event whose payload has a `room` string cannot bypass the room/role
check by not being registered. It does **not** protect a handler that has no
`room` in its payload at all — including one that names no room but still
crashes on some other malformed field, or a completely unregistered event
(`socket.emit("future:x")` with no payload) that a not-yet-written handler
destructures unsafely. The two defences above are what actually cover that gap;
the choke point covers a different one.

### Room-creation bounds

A **brand-new room is never written to disk**. `gm:create-session` takes no room
code, no role and no credential, so persisting at create time would let anyone
fill the disk by calling it in a loop — and the room-ownership rule cannot help,
since it only guards rooms that already exist. A created room lives in the Map
until the GM's first real state broadcast or log entry; `store.touch` refuses a
room with no content (`hasPersistableContent`).

That refusal is a **backstop, not the bound**: a create-loop that gives each new
room content one `session:append-log` later produces writes that are individually
legitimate. The bound is `server/room-guards.js` (spec AC 16):

| Bound | Constant | Value |
|---|---|---|
| Creations per origin per window | `ROOM_CREATE_LIMIT` / `ROOM_CREATE_WINDOW_MS` | 10 per 60s |
| Creations per socket connection (lifetime) | `SOCKET_ROOM_CREATE_LIMIT` | 25 |
| Total rooms held | `TOTAL_ROOM_CAP` | 500 |
| Contentless-room TTL / sweep | `CONTENTLESS_ROOM_TTL_MS` / `CONTENTLESS_SWEEP_INTERVAL_MS` | 10 min / 60s |

A room that never acquires content is dropped from the `sessions` Map by a
reaper separate from the store's file housekeeping. Reaping is self-healing —
`session:update-state` goes through `getOrCreateSession`, so a GM still in a
reaped room recreates it on the next broadcast, with content.

The cap is **not** a permanent lockout. At the cap, a create first tries
`findEvictableRoom()`: the single least-recently-active room (`lastActivity`)
that has **nobody connected** — by either Socket.IO membership or
`socket.data.room` — is evicted, in memory and on disk (leaving a tombstone),
and the create proceeds. One room per create, never a batch, and never a room
with a live socket, however idle it looks. If all 500 are occupied the create is
refused, with the reason saying so. Every eviction is logged with the room code
and its idle time. Eviction is destructive and not undoable.

The cap check runs **last**, after the per-connection lifetime limit and the
per-origin rate limit (round-4 defect D3): eviction deletes a real persisted
room, so it must only fire once every other refusal reason has already been
cleared and the create is actually about to proceed. It used to run before the
rate limit, so a request that was going to be refused anyway — for an unrelated
reason — could still evict a room for a create that then never happened.

The per-origin key is `creationOriginKey()`. Trusting `X-Forwarded-For` is
**opt-in** (`SR5E_TRUST_PROXY=1`). When it is trusted, the key is the entry
`SR5E_PROXY_HOPS` back from the **right**: nginx's
`$proxy_add_x_forwarded_for` prepends the client's own value, so the leftmost
entry is attacker-chosen and keying on it made the limiter free to bypass. When
it is *not* trusted the header is ignored entirely and the key is the raw socket
remote address — because counting back from the right is only sound if a proxy
is really appending an entry. Reached directly (a dev box, an exposed port, a
misconfigured nginx) nothing is appended, so the rightmost entry is the caller's
again: 20 spoofed origins bought 60 rooms with zero refusals, verified live.
Operators behind nginx must set `SR5E_TRUST_PROXY=1`, or every socket shares the
127.0.0.1 key and one busy GM rate-limits another.

`gm:create-session` and `gm:join-session` both reassign `socket.data.room`, and
both call `detachFromPreviousRoom()` first (`server/room-guards.js`) so the
socket leaves the old Socket.IO room and its `gmPresence` entry. Without that a
GM tab that switched rooms stayed a member of both: a player still in the
abandoned room could send commands that were relayed to — and applied by — the
GM tab now running a *different* room, and the abandoned room reported
`gmConnected: true` forever. The abandoned room itself is untouched: still in
the Map, still persisted, still joinable by code. `player:join` **also**
detaches (round-4 defect D4): a player who joined room A, claimed a character,
then joined room B without ever leaving A stayed a Socket.IO member of A (a
cross-room broadcast leak) and left A's claim permanently orphaned, since by the
time that socket disconnects `socket.data.room` is B, not A. `player:join` now
calls the same `detachSocketFromPreviousRoom()` as
`gm:create-session`/`gm:join-session`, which also releases the departing
player's claim in the room they left.

What is still *not* on the server: GM-local hidden log entries and this tab's
own transient panel/selection state. Damage/health, non-claimable OOC participants and
`actionHistory` **are** now persisted — on a second, GM-only channel (see
"The GM-only channel" below) — closing the gap the rest of this paragraph used
to describe. `getSharedParticipants()` and the player-facing `session:state`
payload are unchanged: a claimable OOC participant (a player character) *is*
broadcast there, deliberately, so its owner can reclaim it (see "OOC
participants and the wire" below), and a non-claimable one still is not.
Durability does not widen *that* snapshot at all — only the new, separate
GM-only one carries the rest.

#### The GM-only channel

`briefs/gm-reconnect-state-loss.md` closed the gap the paragraph above used to
describe: a GM whose tab was gone (not merely reconnecting — see "Authority"
below for that distinction) rebuilt an encounter from `session:state` alone,
which was never meant to be a save file and never carried damage, Condition
Monitor sizes, out-of-action combatants, turn state or committed interrupts.

The fix is a **second, GM-only transport**, not a wider player-facing payload:
`SessionSyncService.broadcastGmState()` → `session:update-gm-state` →
`session.gmState` on the server, returned only in the `gm:join-session` (and,
for shape symmetry, `gm:create-session`) ack — a per-socket reply, never a room
broadcast. `playerFacingState()` has nothing to strip for it, because
`gmState` is never a property of `state` in the first place; there is no code
path from `session.gmState` to a player socket at all. This was a deliberate
choice over widening `SharedParticipantState` and stripping fields
server-side: a strip is a **denylist** — every future sensitive field has to
remember to opt in, which is exactly the drift shape the review rounds below
record repeatedly — and it is unsafe across a deploy, where a new GM tab
talking to a not-yet-restarted server would broadcast damage to every player.
The separate-event shape is an **allowlist by construction**: nothing reaches
a player unless a handler explicitly relays it there, which none does. It also
degrades safely across a deploy skew in *either* direction — an old server has
no listener for `session:update-gm-state`, but `authorizeRoomPacket` still
sees the packet: the `socket.use` middleware runs on every incoming packet
regardless of whether a listener is registered for its event name, so an old
server authorizes it (falling back to `DEFAULT_ROOM_SCOPED_ROLES`'s gm-or-player
default, since an old `ROOM_SCOPED_EVENTS` predates this event's explicit
gm-only entry) and only *then* drops it, because nothing is listening to
receive it; nothing is stored — and an old GM tab talking to a new server
simply never emits it, so
`session.gmState` stays `null` and the restore falls back to today's lossy
behaviour. Neither direction leaks; both degrade to "lost," never "shown to
players."

A refused push (bad shape, or over the 64 KB cap) does the same thing on
purpose (adversarial review round 2026-08-19, defect D7): `server.js`'s
`session:update-gm-state` handler clears `session.gmState` to `null` rather
than leaving whatever was stored before the refusal, so `session.state` (which
keeps accepting pushes independently) can never silently outrun a `gmState`
that stopped updating. The alternative — leave the stale copy in place — is
worse than losing it: `restoreFromSharedState` already handles `null`
correctly (it is exactly the legacy/deploy-skew case), but it has no way to
notice a `gmState` that is merely *out of date* relative to `state`, and would
restore a stale Condition Monitor as if it were current. Validation lives in
`server/gm-state-channel.js` (`isGmState`, `validateGmStatePayload`), a small
pure module in the same shape as `room-guards.js`/`session-store.js` — the
transport handler in `server.js` only decides what to do with the verdict.

`SharedGmState` (`session-sync.service.ts`) carries `withheldParticipants`
(same `SharedParticipantState` shape as the player-facing array — a
**withheld**, out-of-action, non-claimable participant `getSharedParticipants()`
drops, reusing the type rather than inventing a second one) and `participants`
(one `SharedGmParticipantState` per participant in the encounter, keyed by
`id`: the participant's full-roster `rosterIndex` (review defect D1, see
below), Condition Monitor contents and shape, the raw Score backing fields,
`status`, `edge`, `actionHistory`, the manual `ooc` flag via a new
`Participant.manualOoc` getter, the tie-break value, and — when applicable —
the `DetachedGruntParticipant`, `NpcRowParticipant.spentFlagged` and
per-row-member `hasActed` (`rowMemberHasActed`, index-aligned with
`rowMembers` — review defect D5, "Session sync for rows" above) extras).
`ICParticipant` reconstruction is explicitly out of scope (Decision D5): no
`isIC`/`icType`/`hostRating`/`linkedTargetId` field exists anywhere on this
channel, and an IC still restores as a plain `MatrixParticipant` — the same
known gap as before, left in place on purpose rather than half-fixed.

`restoreFromSharedState(state, gmState)` merges before it rebuilds: it
concatenates `state.participants` with `gmState.withheldParticipants`
(deduplicated by `id`, the player-facing copy winning a collision — the
claimable-OOC case that can legitimately appear on both), and looks each
entry's GM extras up by `id`. **The merge sort, and the `sortOrder` each
restored participant is pinned to, rank by `SharedGmParticipantState.rosterIndex`
when a `gmState` is present — not by `order` directly** (adversarial review
round 2026-08-19, defect D1). `state.participants[].order` is numbered on the
post-filter scale `getSharedParticipants()` already used before this brief;
`gmState.withheldParticipants[].order` is numbered on the full, unfiltered
roster scale (see `buildGmState()`'s doc comment) — two different rulers that
collide when sorted together directly: a withheld participant sitting above a
live one in the original roster could land on the exact same `sortOrder` as
that live one, corrupting both restored positions. `rosterIndex` is carried
once per participant (present or withheld) on the GM-only channel
specifically to give the merge one ruler both lists can be read against.
With no `gmState` at all (legacy snapshot or deploy skew), `order` remains the
correct — and only possible — fallback: there is just the one, already
consistently-numbered player-facing list. **Order inside the per-participant
rebuild is load-bearing**: `physicalDamage`, `stunDamage`, `painTolerance`,
`hasPainEditor` and `baseIni` each apply a signed delta to the running
Initiative Score via `syncInitiativeAttribute()` (§1) the moment they are
written, so the Score itself (`currentInitiativeScore` /
`appliedInitiativeAttribute`, restored from the GM-only channel's raw backing
fields) is pinned **last**, after every one of them — pinning it earlier would
be silently overwritten by those deltas and would shift every wounded
combatant's position in the derived order. `resolveRestoredAction()` maps a
wire `actionHistory` entry back onto the identity-shared `Action` object
`interruptTable` holds for that key (not a freshly-built object with the same
fields), because `canUseAction`'s persist gate is an object-identity check
(§5) — a JSON-reconstructed Full Defense would round-trip every field and
still silently fail the gate, letting it be bought twice in one Combat Turn.

The join guard (`snapshotHasEncounter`) and the abandon-on-all-down branch in
`btnJoinShareSession_Click` (§8, "Known rough edges" no longer lists this) were
both widened to ask `gmState.withheldParticipants` as well as
`state.participants` — an encounter where *everyone* is out of action used to
be indistinguishable from an empty room and refused the join outright; it now
restores in full. That refusal path is kept, unreachable, for a room
persisted before this change (no `gmState` on disk — Decision D7, no
migration promised) and for deploy skew.

`buildRestoreWarning()` now reads two different ways depending on whether a
`gmState` was present: with one, nothing important was lost — only this tab's
own transient panel state, which never left the browser to begin with; with
none (a legacy room, or an old server/client on either end of a deploy), the
text is kept as close to the pre-change wording as still accurate (its "undo
history" clause was dropped when Undo was removed — brief "Remove the
undo/redo system" D5), so a room saved before this shipped still tells the GM
accurately what did not come back.

`gm:close-session` and `gm:end-session` are different actions: close *leaves*
the room (still persisted, still joinable by code), end *destroys* it (in-memory
session and file both deleted). The GM-local hidden-log discard belongs to end,
not close — and only to an end that **actually succeeded** (spec AC 17). A
rejected or timed-out `endSession()` leaves the room code, the hidden entries and
the live-encounter association exactly as they were, so a network blip cannot
destroy the only copy of those entries; the GM sees the error and retries. The
one failure reason that is *not* treated as a failure is "Room not found" (or
the legacy removed-room message): that means the end already succeeded and only
the ack was lost, so the retry performs the local teardown instead of leaving
the GM holding a room that no longer exists behind an error banner with no way
out. `btnCreateShareSession_Click` discards those entries too, and its
confirmation counts `getHiddenLogEntries()` directly — it used to ask
`hasRetainedHiddenLogEntries()`, which is empty whenever `shareRoomCode` is set,
so the one case that had entries to lose was the one case that never prompted.
Creating a session while a room is already live also abandons that room (see the
socket detach above), so the same dialog names the code to rejoin to get it back.

### Authority: who is the truth for a room, and how that can be lost

*This is the one, authoritative description of this mechanism. Everything about
push/pull below points back here.*

**The problem this section exists to solve.** Durable-rooms review round 5
found three symptoms that were really one design gap: the GM tab treated its
own local state as automatically authoritative for pushing, and had no way to
either learn that the server had moved on without it, or to stop pushing once
it knew it shouldn't. Fixing each symptom individually (as rounds 3 and 4 did)
kept reopening the same defect class through a different door. The fix is a
small, explicit model of "who is the truth for room X right now", covering
both directions: the tab correcting itself from the server, and the tab
refusing to act once it knows it is no longer the truth.

**`liveEncounterRooms`**, a **set** of room codes this tab's `CombatManager` is
the live source of truth for — not a single code. It is what decides
push-vs-pull on the Join button (`holdsLiveEncounterFor()`), and it is
additive: creating or joining another room does not stop this tab being the
truth for the one it just left. It was a single code, reassigned by Create,
which made the dialog's "rejoin code X to bring it back" false the moment it
was printed — the rejoin took the destructive pull path and discarded the very
encounter the dialog had promised was safe. The private `liveEncounterRoomCode`
accessor is a most-recent-entry view over the set. Consequence to know: after
a mis-tapped Create, rejoining the old code pushes this tab's *current*
encounter into that room, overwriting the room's stored snapshot. That is the
promised behaviour (the local encounter is the one that was there), but it is
a push, not a merge.

Membership can be **lost**, not just gained, in three ways: the room is
destroyed (End Room, or an external end — `resetShareStateAfterLeaving` with
`discardHiddenEntries`, and `handleSessionClosedExternally` when the close was
not persisted, each deleting only that one code); this tab's encounter is
genuinely *replaced* by a pull, at which point every earlier association is
stale and the `liveEncounterRoomCode` setter clears the whole set before adding
the joined room alone; or the GM **confirms** a diverged rejoin (next
paragraph), which drops that one code without touching any other the tab still
holds. Note the third is conditional on the confirmation, not on the detection:
merely *finding* divergence changes nothing, because the GM is asked first and
declining returns without touching the set.

**`liveEncounterFingerprints`** — per-room `Set<participantId>`, written by
`markRoomLive()` (create, join) and **refreshed on every successful push**
inside `syncSharedState()` (round 5, fixing Symptom C). That refresh is the
part that makes the fingerprint mean the right thing during ordinary play: a
GM who taps Create Player Session early, plays a whole fight to its
conclusion with a fully different cast than whoever was on screen at that
moment, and pushes every state change along the way never diverges — every
push keeps the fingerprint current with the roster that tab is actually,
continuously the truth for. Without that refresh, `liveEncounterFingerprints`
only ever reflected the moment the room was joined/created, so an ordinary
evening of play (add one, remove one, many pushes) could legitimately drift the
on-screen roster to zero overlap with a stale fingerprint — and the *next*
rejoin then read that as "this tab has become a different encounter" even
though nothing was ever wrong. `liveEncounterDivergedFrom(room)` compares the
*current* on-screen roster against that fingerprint: no recorded fingerprint
fails open (not diverged — this only happens defensively); otherwise diverged
means **zero** participant IDs survive in common. Only a wholesale cast swap
with no push in between zeroes it out on purpose; the threshold is a judgment
call, documented here.

**What happens on a rejoin the tab cannot safely complete on its own** (round 5,
fixing Symptom B). The two cases are no longer handled alike, so state them
separately:

- **Saved encounter entirely OOC and so unrestorable** — cannot be known until
  the server answers `joinAsGm`, so the join really is **never completed**: it
  is reversed by `abandonJoinAndRestore()` and the tab goes back to the room it
  was running.
- **Diverged** — decided client-side *before* any connection is touched, so the
  GM is **asked** (`confirmDivergedJoin`) rather than refused outright.
  Declining returns immediately with nothing touched. Confirming drops the
  stale association (`liveEncounterRooms`/`liveEncounterFingerprints`), sets
  `pushLocalState = false`, and falls through to the ordinary **destructive
  pull** — which *does* complete, behind `confirmDestructiveJoin`'s own more
  detailed warning about what pulling discards. The post-`joinAsGm` divergence
  check that remains in the push branch is a defensive backstop only; in
  practice the pre-check above means it is never reached.

The invariant that holds across both: `shareRoomCode` is never left assigned to
a room the join declined to complete. Earlier rounds warned the GM once
("nothing was sent to the room") and then left `shareRoomCode` assigned to that
room anyway, so the very
next mutation anywhere in this file — a sort, a damage edit, Next Pass —
pushed straight over the room's real saved state, because
`syncSharedState()`'s only gate is `if (!this.shareRoomCode) return;`. Neither
branch in `btnJoinShareSession_Click()` ever leaves `shareRoomCode` assigned to
a room the join declined to complete, so "authorized to push room X" cannot
silently outlive the warning that said it wasn't happening — there is no
separate flag to fall out of sync and no later call site that can forget to
check one.

**Round 6 correction (review defect D1): "the join is never completed" used to
mean "connect first, then decide, then disconnect if wrong" — which is what let
a diverged join silently abandon a *different* room the tab was still running.**
`sessionSync.joinAsGm(room)` is a single socket that can be authenticated to
exactly one room at a time; calling it *at all* already switches this tab's
server-side room membership away from whatever it was running before
(`detachSocketFromPreviousRoom`, `server.js`), broadcasting
`session:gm-presence {connected: false}` to that room the instant it succeeds
— before the client has decided whether the join should go ahead. Rounds 3-5
treated "decide push-vs-pull, then possibly refuse" as a single atomic client
step; it never was one on the wire. This is the same defect class rounds 3-5
kept re-fixing through new doors: **`shareRoomCode` is a single global flag
standing in for what is conceptually a per-room fact ("is this tab authorized
to broadcast to room X").** A refusal computed *after* the global flag had
already been reassigned had no way to express "refused for A, but still fine
for B".

**The fix does not introduce a second flag or a per-room map for this** (that
would just be the same representation problem at a different granularity, with
its own new drift hazard). Instead it makes the single-room reality **true
before the switch is attempted, not merely corrected after**, plus one
narrow, explicit reversal path for the one case that cannot be known in
advance:

- **Divergence is now decided client-side, entirely from data this tab already
  holds** (`liveEncounterDivergedFrom`), **before** `sessionSync.joinAsGm` is
  ever called (`btnJoinShareSession_Click`, `confirmDivergedJoin`). Since
  nothing about this tab's connection or `socket.data.room` changes until that
  decision is made, a refused diverged join touches literally nothing.
- **The one case that genuinely cannot be decided in advance** — whether the
  *target* room's saved encounter has anything worth pulling — can only be
  known from the server's answer to `joinAsGm`, by which point the switch has
  already happened. For that case alone, the switch is made **reversible**:
  `abandonJoinAndRestore()` re-authenticates the same live socket back to
  `previousRoom` (`restorePreviousRoomConnection()`), on the *existing*
  transport rather than tearing it down and reconnecting from scratch, so
  socket membership, `shareRoomCode`, listeners and the `session:gm-presence`
  broadcast to the old room are all restored together, atomically from the
  caller's point of view. If the reconnect attempt itself fails (a genuine
  network problem, not a refusal), only then is the transport actually torn
  down, and the GM is told with an **error-level** banner (`shareError`, not
  `shareInfo`) naming both rooms and the one safe recovery action.
- **Confirmation is no longer skipped just because `holdsLiveEncounterFor(target)`
  is true.** That check answered "is this tab's on-screen encounter still
  associated with this code at all", not "is it safe to act on that
  association with zero friction" — the two came apart the moment the
  association had diverged. A diverged join now always confirms first
  (`confirmDivergedJoin`), even though the underlying connection is never at
  risk while the dialog is open.
- **Every join path that can abandon a *different* room now confirms it too**
  (D-B, round 7). `confirmDestructiveJoin` used to fire only on the pull path,
  so a **push** join — rejoining a room this tab already holds the live
  encounter for, while a *different* room is the one actually connected —
  abandoned that other room with zero confirmation: the server detaches the
  socket and broadcasts `session:gm-presence {connected: false}` the instant
  `joinAsGm` succeeds. Nothing local is at risk on a push (the encounter itself
  is never overwritten), but abandoning another room's players is a real
  consequence regardless of which path reaches it, so
  `confirmAbandonPreviousRoom(room, previousRoom)` gates that case. Three
  distinct confirmations therefore guard the Join button, and which ones you
  see depends on the path: `confirmDivergedJoin` (push path, diverged),
  `confirmAbandonPreviousRoom` (push path, a different room is connected), and
  `confirmDestructiveJoin` (pull path, local state at risk).

**Correction (D-C, round 7): a lost or timed-out ack is repaired reactively,
not prevented.** `emitWithAck` (`session-sync.service.ts`) rejects its promise
after `requestTimeoutMs` (6000 ms) with no way to know whether the server
actually processed the request in the meantime.
`gm:join-session`/`gm:create-session` are not idempotent no-ops on the server:
by the time the promise rejects, the server may already have detached the
socket from its old room and joined it to the new one (`socket.data.room` = the
new room), while the client-side reject means neither
`SessionSyncService.currentRoom` nor `BattleTrackerComponent.shareRoomCode`
ever learned that — both still name the old room. Every subsequent broadcast
from this tab then names a room its own socket is no longer authorized for,
which `authorizeRoomPacket` refuses as `room-mismatch` — a reason distinct from
`role-required` precisely because the role is fine; only the room disagrees.
Before this fix `handleSessionError` only repaired `role-required`, so a
`room-mismatch` read as an unrecognised refusal and wedged the GM mid-combat
with every broadcast silently discarded. The fix treats `room-mismatch` exactly
like `role-required`: `handleSessionError` calls `handleSessionReconnected()`,
which re-authenticates to `shareRoomCode` (the client's own belief about which
room it should be running) and pushes local state — correcting
`socket.data.room` server-side and `SessionSyncService.currentRoom` client-side
back into agreement, and catching players back up in the same call. So: every
code path reaching a decision point *synchronously* either avoids invalidating
the single fact or repairs it before returning; an *asynchronous* ack lost in
flight is repaired on the next refusal.

**`reconcileOwnershipFromServer(state)`**, called on every (re)join
(`btnJoinShareSession_Click`) and on transport reconnect
(`handleSessionReconnected`), before any push happens — the other half of
Symptom A. Ownership is not really GM-tab-authoritative state: it is decided
collaboratively by players claiming/releasing through the server, and the
server can strip a claim on its own (a disconnect, a Close/End evacuation)
without this tab's knowledge whenever it was not connected to hear the
`release_claims` broadcast that announced it. This function corrects
`participantOwners` from the server's returned copy — one-directionally, only
ever *clearing* a local owner the server no longer has, never fabricating one
the server has that the cache lacks (a live `claim_character` command already
keeps the cache current for that direction; the only way the server can be
*ahead* here is a release this tab missed). This is what makes the stale-owner
symptom structurally impossible rather than fixed only for the one ordering
bug that produced it: even a *different* future bug that drops a correction on
the floor heals itself on the next successful join, because ownership is always
re-derived from the server at that point rather than trusted to still be right.

It looks a participant up in `state.participants` first and only falls back to
`oocOwnership` if that lookup misses (`byId.get(id) || oocById.get(id)`).
Round 6's defect D2 was that it used to `continue` past every OOC participant
entirely — backwards for ownership, since a claimed character going OOC is the
ordinary case a release needs to survive (a downed PC, closed and rejoined days
later, then revived, hits the returning player's `claim_character` with the
server's stale `existingOwner` check).

**`SharedCombatState.oocOwnership`** is a minimal, ownership-only shadow —
`{id, ownerName, claimable}` (`SharedOocOwnershipState`), nothing else — that
the GM tab computes and sends up on every `session:update-state` specifically
so a later `reconcileOwnershipFromServer` has something to reconcile against
even while the participant it describes is out of action. `server.js`'s
`releasePlayerClaims` strips a departing player's `ownerName` from this shadow
the same way it does from `state.participants`.

Since claimable OOC participants are now on `state.participants` directly (see
"OOC participants and the wire" below), the shadow is redundant for that case
and the fallback is never reached for it. The case that is **not** redundant is
an out-of-action participant that is *owned* (`participantOwners.has(p)`) but
not *claimable* — `getSharedParticipants()`'s filter keys strictly on
claimable, so that participant is withheld from `state.participants` entirely,
and `oocOwnership` is the only thing on the wire a rejoining GM's
reconciliation has to correct a stale local owner against. The ordinary claim UI
(`btnToggleClaimable_Click`) cannot produce this state — turning `claimable`
off in that one control also clears the owner in the same tap — so it is a
defensive case, but nothing enforces the pairing at the data-model level.
Verdict: keep `oocOwnership`, computed by the same helper
(`isClaimableOrOwnedOoc`) as the `participants` exception so the two can never
drift on the definition of "claimable enough."

**Round 7 (D-G): `oocOwnership` is stripped from player-reachable channels.**
Round 6's placement of it directly on `SharedCombatState` meant it travelled on
the room broadcast (`session:state`) and the `player:join` ack — reachable by
every player in the room, not just the GM — which reopened the leak ground Open
Decision 4 explicitly weighed and rejected. `playerFacingState()` in `server.js`
strips `oocOwnership` from exactly those two channels, while `gm:join-session`
and `gm:create-session` acks (per-socket, never room-broadcast) still return
`session.state` unstripped. The stored session document itself
(`session.state.oocOwnership`, in memory and on disk) is untouched either way —
`releasePlayerClaims` still needs to strip ownership from it, and a rejoining
GM's `reconcileOwnershipFromServer` still needs to read it — only the copy
handed to a player-reachable channel is trimmed, and only a shallow copy, so the
stored object is never mutated by a broadcast. There is now exactly one place
that decides what a player-reachable channel may carry, and every such channel
goes through it.

### Ownership is a per-room fact, not a global one (D-A, round 7)

**The defect class.** Rounds 3–6 each closed one *instance* of representing a
per-room fact ("who owns this character") in a single global variable shared
by every room this tab is simultaneously live for (`liveEncounterRooms` —
several room codes, one `CombatManager`, because Create Player Session and a
"no saved encounter" Join both leave the on-screen encounter unchanged while
adding a new code to broadcast it to). Round 6's D8 fix (clear
`participantOwners` at Create time) is a representative example: it did not make
"this room's ownership" representable — it *destroyed* the global so the next
room started clean, which is the same substitution resolved by deletion instead
of by giving the fact somewhere per-room to live. The round-6 review verdict on
that fix was accordingly "relocated, not closed".

**Why a `Map<room, …>` alone does not fix it.** `participantOwners` is keyed
by `IParticipant` object identity, which ~60 call sites across the GM component
read and write as a flat map — claim, release, promote/demote/clone side-map
copies, the placeholder check, the outgoing-state builder. All of them assume
"the current owner of this participant", with no room parameter. Rekeying every
one of those to `Map<room, Map<IParticipant, string>>` would touch most of the
file's mutation surface for a fact that, at any single moment, only one room
actually needs.

**`participantClaimable` is out of scope for this fix, deliberately.** It is
not a per-room fact the way `ownerName` is: `claimable` marks a GM authoring
decision ("this character is available for a player to claim at all"), not
which specific player-token in which specific room holds the claim. Create
Player Session clears ownership but leaves `claimable` untouched, so a
brand-new room's characters are still claimable by its own (new) players by
default.

**The fix: keep `participantOwners` as the *active* room's view, and add a
per-room shelf underneath it that only room-switch points touch.**

- `participantOwners` keeps exactly its existing shape and every existing call
  site — unchanged, because it now carries a documented invariant: **it
  always describes `activeOwnershipRoom`.**
- `activeOwnershipRoom: string` (GM-component-local) names which room that is.
  **It is deliberately not the same field as `shareRoomCode`**: a Close, or an
  external close notice, blanks `shareRoomCode` while this tab's in-memory
  ownership for that room is still perfectly correct and needs no shelving —
  conflating the two was exactly what let D-A's repro happen.
- `ownershipByRoom: Map<room, Map<participantId, ownerName>>` is the shelf.
  Keyed by the stable `participantId` string (`getParticipantId`), not object
  identity — object identity is exactly what a shelf *cannot* key on, since
  the same `Participant` objects get shelved under one room code and reloaded
  under another.
- `switchActiveOwnershipRoom(toRoom)` is the one function that moves the
  "active" designation: it shelves whatever `activeOwnershipRoom` currently
  holds (skipped if empty; an empty snapshot removes any stale shelf entry
  rather than storing one), loads `toRoom`'s own shelf into the now-empty
  active map (nothing, if `toRoom` has never been active before), and only then
  reassigns `activeOwnershipRoom`. A no-op when `toRoom` already **is**
  `activeOwnershipRoom`, which is not an optimisation but a correctness
  requirement: without that guard, a room whose ownership was never shelved out
  (the Close case above) would have its own still-correct content shelved into
  itself and immediately reloaded from an empty shelf, wiping every current
  owner.

**Call sites, and why each is scoped the way it is:**

- **Create Player Session** (`btnCreateShareSession_Click`) calls
  `switchActiveOwnershipRoom(room)` in place of round 6's
  `participantOwners.clear()`. This shelves the previous room's real owners
  (recoverable by a later rejoin of that code — the "brings it back" promise
  the confirmation dialog makes) and resets the active maps to empty for the
  brand-new room.
- **Join, push path** (`btnJoinShareSession_Click`, `holdsLiveEncounterFor(room)`
  true and not diverged) calls `switchActiveOwnershipRoom(room)` *before*
  `reconcileOwnershipFromServer(state)`, so reconciliation corrects the
  *newly-active* room's cache against that room's own fetched state, never a
  different room's. This is the exact fix for D-A's repro: mis-tap Create,
  notice, retype the real room's code and Join — the push branch restores that
  room's shelf before pushing, so all owners come back intact and no player sees
  a spurious "GM released X" message.
- **Join, "no saved encounter" path** (server has nothing for `room`, so this
  tab's own encounter is pushed instead) calls `switchActiveOwnershipRoom(room)`
  for the same reason as Create.
- **Join, pull path** (`restoreFromSharedState`, a full replace) does **not**
  call `switchActiveOwnershipRoom` — it rebuilds `participantOwners` (and
  `participantClaimable`) directly from the freshly-fetched
  `state.participants` (already fully authoritative for the room being pulled),
  and the `liveEncounterRoomCode` setter that follows it sets
  `activeOwnershipRoom = room` as a bookkeeping fact and clears
  `ownershipByRoom` entirely. This mirrors `liveEncounterRooms`' own "a pull
  replaces everything" rule: every other room's shelved ownership becomes
  unreachable the moment this tab's `CombatManager` no longer holds a live
  encounter for it.
- **`restorePreviousRoomConnection`** does **not** call it either — by its own
  precondition (`holdsLiveEncounterFor(previousRoom)`), ownership was never
  switched away from that room, so the active maps already describe it
  correctly; only `reconcileOwnershipFromServer` is needed.
- **End Room** (`resetShareStateAfterLeaving(room, discardHiddenEntries: true)`)
  and an **external, non-persisted close** (`handleSessionClosedExternally`)
  both delete `ownershipByRoom.get(room)` alongside the existing
  `liveEncounterRooms.delete(room)` — the room is permanently gone, so nothing
  will ever `switchActiveOwnershipRoom(room)` again to read that shelf entry
  back. An ordinary **Close** does neither.

**Why the global substitution is harder to reintroduce, not impossible.**
`switchActiveOwnershipRoom`'s own contract — shelve the outgoing room, load the
incoming room's own shelf or nothing — cannot express "destroy every room's
ownership to clean one room's slate" the way a bare `.clear()` could, and it is
genuinely the only function that *switches which room the active maps describe
while keeping every other room's ownership shelved and recoverable*. But it is
not the only code that writes `participantOwners` or `activeOwnershipRoom`
directly, and both other writers are correct by design, not gaps:

- `restoreFromSharedState` clears and rebuilds `participantOwners` straight
  from the server's freshly-fetched `state.participants` for the room being
  pulled — see the "Join, pull path" bullet above.
- The `liveEncounterRoomCode` setter writes `activeOwnershipRoom` and clears
  `ownershipByRoom` (and `hiddenLogEntriesByRoom`) directly, immediately after
  `restoreFromSharedState` has already rebuilt the active maps — reassigning
  which room they now describe as a bookkeeping fact, not re-deriving content.

The item-3 hidden-log leak (round 8) is the empirical counter-example to any
stronger claim: it was reached through one of these exact seams — the same
three join branches and the same `liveEncounterRoomCode` setter — because
`sharedLogEntries`' hidden subset had no shelf of its own yet. It is now
shelved the same way (`hiddenLogEntriesByRoom`, switched at the same points),
which is the argument for auditing every writer of a flat map that is supposed
to be per-room, not only the one named function whose job is switching between
rooms.

### The GM's local `CombatManager` is the single source of truth

Nothing about turn/pass advancement or initiative computation is
network-aware — those all run identically whether or not a share session is
active. Session sync is a one-way derived broadcast layered on top:

- Every mutation path that changes visible state calls `sort()` (which
  calls `syncSharedState()` at its end) or `syncSharedState()` directly.
- `syncSharedState()` builds a `SharedCombatState` (`round`, `pass`,
  `started`, `passEnded`, `currentInitiative`, `participants` from
  `getSharedParticipants()`, `oocParticipantCount`, `oocOwnership`, and the
  front-loaded Matrix fields `matrixTargets` / `currentHostName`) and pushes it
  via `sessionSync.broadcastState()` → `session:update-state` → server
  rebroadcasts as `session:state` to everyone in the room, including the GM
  tab that sent it.
- `getSharedParticipants()` recomputes `order` as the post-filter array index
  every time — this is the only place an explicit "order" number exists in the
  state model, and it's derived, not authoritative.

#### OOC participants and the wire

`getSharedParticipants()` filters out OOC participants — with one deliberate
exception. Because of that filter, an encounter where *everyone* withheld is
out of action serialises as `participants: []` and used to be indistinguishable
on the wire from a room that never had an encounter — so a GM joining that code
hit the empty-snapshot branch and pushed their own encounter straight over a
real saved fight. `SharedCombatState` therefore also carries
`oocParticipantCount`, a plain count of what the filter withheld. It exists
**only** for the persistence/overwrite guard (`snapshotHasEncounter()`);
nothing renders it, and every UI notion of "active participants" still excludes
OOC on purpose.

**The exception: a *claimable* OOC participant is broadcast anyway**, with an
`ooc: true` field on its `SharedParticipantState` entry, so its owner can see
and reclaim it while it is down. The filter is
`!p.ooc || isClaimableOrOwnedOoc(p)` — the same predicate `syncSharedState()`'s
`oocOwnership` shadow uses, factored into one shared helper so the two lists
cannot silently diverge. A downed **non-player** participant (not claimable,
never owned) still never appears on the wire at all — the privacy property this
filter always had is unchanged for that case; and `oocParticipantCount` counts
only the participants still actually withheld, so it does not double-count a
claimable OOC participant against `participants.length`. Every action
affordance (`canAct`/`canDelay`/`canInterrupt`) is forced `false` for an `ooc`
entry regardless of its underlying `status`/Score, at the point of broadcast —
a claimable downed character must not become a playable one.

On the player side, `PlayerViewComponent` reads two different lists off the
same wire array for two different questions: `visibleParticipants` (the
initiative order — still excludes every `ooc` entry, claimable or not, since a
downed character is never in the order) and `ownParticipants` /
`unclaimedParticipants` (claim/ownership — read the *unfiltered* array, so a
claimable downed character is still offered for claim and a player's own downed
character still reads as theirs). `restoreFromSharedState()` reads `shared.ooc`
back onto the rebuilt participant's manual `ooc` flag — the only field on the
wire that can put one back down at all, since damage/health still are not — so
a GM rejoining a room never gets a downed PC back standing up.

#### Commands

Players never mutate combat state directly. Player-initiated actions are sent
as a `session:command` and handled exclusively by the GM tab's
`handleSessionCommand()`, which mutates the real `CombatManager` and its
side-maps, then re-broadcasts. The server's role is authorization/schema
gatekeeping only — it does not interpret or apply commands itself. What it
gatekeeps, exactly: **room ownership** (the shared choke point above; this is
the check `session:command` was missing, so a guessed room code was a live
cross-room injection into another table's encounter), the
`ALLOWED_COMMAND_TYPES` allowlist, payload shape and size, the role, and the
`player` field matching the authenticated socket.

`ALLOWED_COMMAND_TYPES` holds **14** types, not all of them player-originated:

| Type | Direction |
|---|---|
| `register_character`, `configure_deck`, `configure_astral` | player → GM (setup) |
| `claim_character`, `release_claims` | player → GM (ownership) |
| `claim_denied` | **GM → players** (a refused claim, shown only to the token in `payload.requester`) |
| `roll_submission`, `dice_roll` | player → GM (rolls) |
| `act`, `delay`, `interrupt` | player → GM (turn actions) |
| `request_rolls`, `clear_roll_prompt` | **GM → players** (roll prompts) |
| `combat_ended` | **GM → players** |

`command.player` is a random opaque token minted client-side
(`player-view.component.ts`'s `playerToken`), never a human name — it must
never reach a log entry's actor or text. Every `handleSessionCommand`
branch that logs a player-originated event attributes it to the
*character* name instead (`target.name`, falling back to a non-token
label when the name is empty or literally equals the sender's token), via
`appendPlayerCommandLog`. The equivalent GM-button-triggered events go
through `appendParticipantEventLog` — declared actions and interrupts
(`performAct`, `btnAction_Click`) are likely its most common callers,
alongside jacking a deck in/out and toggling Awakened status — which
writes to the shared log when a session is open and to the local Action
Log when it isn't, so shared-log coverage of an event doesn't depend on
whether the player or the GM triggered it. It also falls back to a local
line when a session is open but the connection is lost
(`shareConnectionLost`) — the shared emit is fire-and-forget with no local
echo of its own, so without this fallback an Act or Interrupt taken while
disconnected left no record anywhere until reconnect
(`action-log-readability-spec.md` fix-round defect D1; the record lands in
the local pane only, which the GM cannot see until the session is closed —
a known, accepted gap, `docs/FEATURE-BACKLOG.md` N2). Neither helper is the
*only* place an actor name is built — `roll_submission`, `act`, `delay`,
`interrupt`, and `dice_roll` still construct `target.name || "Player"` inline
— so a new handler that logs a player-originated event should follow the same
convention rather than falling back to `"GM"` or `command.player`.

#### Side-tables

"Player-owned" (`participantOwners`), "claimable" (`participantClaimable`), and
the tie-break inputs (`participantEdgeRatings`/`participantReactions`/
`participantIntuitions`/`participantTieBreakers`) are **GM-component-local
`Map<IParticipant, ...>` side-tables**, not fields on `Participant` and not part
of `CombatManager`. They're keyed by object identity, so removing and re-adding
a participant (e.g. the decker↔physical type swap in §6) always requires
explicitly deleting and re-populating every side-map — the code does this
manually at each such site; a new participant field of this kind would need the
same discipline.

#### Disconnect, rejoin, and the log

On disconnect, the server itself does one piece of state surgery
server-side: it strips `ownerName` from any participant the disconnecting
player owned (if `claimable`), and rebroadcasts — this is the one place
combat-adjacent state is touched outside the GM tab's own logic. That strip
can be *undone* by the GM's own reconnect push: if the GM's socket was down
when it happened, the GM tab still holds the old owner in `participantOwners`
and pushes it back. The claim then belongs to a token no client holds, so
`handleSessionCommand`'s `claim_character` branch replies with a `claim_denied`
command naming the reason, logs it GM-only, and the GM can clear the claim in
one tap via `btnReleaseClaim_Click`. Push-not-pull is unchanged; this
is reconciliation *after* the push. The player end of that tap is
`findReleasedOwnCharacters()` in the player view: a character the player owned
in the previous state that is still present with no `ownerName` produces a
one-line notice that the GM released it and it can be re-claimed. A participant
that has *left* the encounter is deliberately not reported: that is a removal,
not a release.

Reconnect/rejoin (`joinAsGm`, `joinAsPlayer`) replays the last broadcast
`state` and `log` from the server's snapshot. **Combat state is replayed
verbatim with no reconciliation. The log is not.** A GM rejoin runs the
server's log through `mergeHiddenLogEntries()`: entries the GM chose to keep
off the wire (`hiddenFromPlayers`, written by `appendGmOnlyLog`) exist only in
the GM tab's `sharedLogEntries`, so the server's history can never contain them
and a verbatim replace would destroy them. The merge keeps the server list,
re-adds any GM-local hidden entry whose `id` is not already in it, sorts the
union by `timestamp`, and reseeds the local ordering sequence (`reseedLogOrder`)
to the merged order. Consequences worth knowing: hidden entries are retained
(not cleared) when a session drops unexpectedly
(`handleSessionClosedExternally`) so a rejoin can merge them back. A deliberate
`btnCloseShareSession_Click` **also** retains them — close leaves the room
rejoinable, so discarding the only copy at close time would destroy data the GM
could still have merged back; the discard belongs to the destructive
`btnEndShareSession_Click`, behind a confirmation, and
`btnCreateShareSession_Click` likewise discards them only behind an explicit GM
confirmation.

**`sharedLogEntries`, like `participantOwners`, is one flat array describing
whichever room is currently active — and its hidden subset is per-room shelved
the same way, since round 8 (item 3): a hidden note authored while running room
B must not survive a switch to room A and get folded into room A's merged log on
the next join. `hiddenLogEntriesByRoom: Map<room, SharedLogEntry[]>` is that
shelf, written/read by `shelveActiveHiddenLog`/`loadShelvedHiddenLog`, switched
at the exact same seams as `ownershipByRoom` — inside
`switchActiveOwnershipRoom` itself and the `liveEncounterRoomCode` setter.**
Entry `timestamp` is therefore load-bearing for ordering, not just display.

`restoreFromSharedState()` sets the turn/pass counters *before* rebuilding
participants and then assigns each restored participant's
`currentInitiativeScore` directly from the broadcast `initiativeScore` — the
running Score is reconstructed from the transmitted value, never re-derived from
the pass count, so it cannot desync from `initiativePass`. The rolled-dice total
is reconstructed alongside it, from the broadcast `rolledInitiativeTotal` field,
via `setDiceIniWithoutScoreChange()` (Score-neutral — the Score is restored
separately and verbatim). This is what keeps `pendingRoll`
(`getSharedParticipants()`: `diceIni <= 0`) and the GM roll button's
`[disabled]="p.diceIni !== 0"` gate honest after a rejoin; without it a restored
participant looks unrolled and a second Initiative Test would stack on an
already-decayed Score. Belt-and-braces, `handleSessionCommand`'s non-delta
`roll_submission` branch refuses a full Initiative Test for a participant who
already has `diceIni > 0` while combat is started (rolled once per Combat Turn).
A GM reconnecting after a crash gets back whatever was last successfully
broadcast; this tab's own transient panel/selection state is not part of that
snapshot and is never sent to the server at all, so a page refresh loses it
even though combat state survives. It reconstructs the *correct participant class* from the broadcast
`isMatrix`/`isAstral`/`isNpcRow` flags (and, since "GM reconnect state loss,"
the GM-only channel's `isGrunt` flag — §7, "The GM-only channel") rather than
rebuilding everyone as a plain `Participant`.

Health and damage **do** now come back, for every participant type, not only
row members: `restoreFromSharedState(state, gmState)` takes a second,
optional argument carrying the GM-only snapshot, and merges a withheld
(out-of-action, non-claimable) participant back in before rebuilding (§7). With
no `gmState` — a room persisted before this change, or a deploy-skew join
where one end of the socket predates the feature — behaviour is unchanged from
before: health/damage still do not come back, a non-claimable OOC participant
is still absent, and `buildRestoreWarning()` says so in the same words it
always has. A **claimable** OOC participant's manual `ooc` flag round-trips
either way, via the player-facing `shared.ooc` field (unchanged) or the
GM-only `gm.ooc` field (preferred when present, since it also covers the
non-claimable case). `ICParticipant` still has no reconstructing flag on
either channel (Decision D5) and still comes back as a `MatrixParticipant`;
`DetachedGruntParticipant` does now reconstruct correctly, from the GM-only
channel (§7).

- **Transport reconnect is push, not pull, on the GM side.** A reconnected
  socket is a new socket with no role, so every guarded emit is refused until it
  re-authenticates; nothing used to notice, and the GM ran combat against frozen
  player screens. The GM tab now listens for `session:error` and for the
  transport `connect` after a drop, re-emits `gm:join-session`, and then
  **pushes** its state with `syncSharedState()` — it must never call
  `restoreFromSharedState()` there, which would replace a live encounter with
  the lossier server copy. Players always pull (they hold no authoritative
  state).
- **The explicit Join button follows the same push-not-pull rule**, decided by
  `holdsLiveEncounterFor()` — see "Authority" above. This is what makes
  Close Room's own advice ("rejoin with code ABC123") safe: a mis-tapped Close
  followed by a rejoin from the same tab restores nothing and loses nothing.
  The log is merged either way (`mergeHiddenLogEntries` is additive). **A pull
  that would overwrite something is confirmed first** (spec AC 15): if the tab
  does not hold the live encounter for that code but its `CombatManager` still
  has participants, `confirmDestructiveJoin()` names the count and what goes
  with it (damage, condition monitors, out-of-action participants, committed
  interrupts, spent Edge) before `restoreFromSharedState()` runs. Cancelling
  aborts before the `joinAsGm` call, so nothing local is touched. A tab with no
  real participants (`isUnusedPlaceholder()`) is never prompted. This is not
  the only confirmation on the Join button — a *push* can prompt too, for
  divergence or for abandoning another connected room; see "Authority" above
  for all three and which path reaches which.

### The shared log entry shape

`SharedLogEntry` (`session-sync.service.ts`) is richer than `{actor, text,
timestamp}` and several of its fields are load-bearing for features documented
nowhere else in this file:

- `id` — stable per-entry id, present on entries a later entry can point at.
  Optional so snapshots from older builds still load.
- `glitch: GlitchLevel` (`"none" | "glitch" | "critical"`) — the glitch status
  of the roll this entry records. Computed by `classifyRoll` in
  `src/app/shared/roll-utils.ts`: a glitch is more than half the dice showing a
  1 (`GLITCH_POOL_FRACTION` 0.5, `GLITCH_FACE` 1), critical when that roll also
  produced no hits (`CRITICAL_GLITCH_MAX_HITS` 0); a hit is a 5 or 6
  (`HIT_FACE_MINIMUM`).
- `refId` / `refSummary` — `refId` is the `id` of the entry this one annotates,
  used to attach GM glitch narration to the roll it describes without rewriting
  the original (the log is append-only). `refSummary` carries a human-readable
  restatement of the target on the wire, because the log is a flat list and
  adjacency proves nothing.
- `gmNote` — the entry's text is GM-authored narrative typed at the table.
- `npc` — the GM made this roll on behalf of a non-player combatant: `actor` is
  that combatant's name, not the GM's. Presentation only; resolution is
  identical to any other roll. See `briefs/gm-npc-rolls.md`.
- `hiddenFromPlayers` — the entry was kept off the wire entirely. Whether GM
  rolls are visible to players is a table decision, not a rule (`RULINGS.md`
  2026-07-31, "GM/NPC dice roll visibility defaults"). An entry carrying this
  flag exists in the GM's local list only.
- `houseRule` — the entry states a table ruling rather than a printed rule;
  drives the GM-pane "house rule" badge. Set only on GM-only entries in
  practice (§6).

`src/app/shared/log-formatter.ts` is the presentation layer for all of this:
`formatLogText`, `getLogTextClass`, `escapeHtml`, the glitch labels, the
initiative/pass/turn boundary line builders (`formatPassStartLogText`,
`formatTurnStartLogText`, `formatTurnEndLogText`, `formatPassEndLogText`,
`COMBAT_STARTED_LOG_TEXT`, `COMBAT_ENDED_LOG_TEXT`), the group-wound line
(`formatGroupWoundLogText`), the dice/initiative roll lines, the reference
helpers (`extractLogEntrySummary`, `formatLogEntryReference`) and the Matrix
"decode" animation constants. Log *text* belongs there, not in the GM
component.

## 8. Known rough edges

- **Dead first sort.** In its `combatManager.started` branch (§1 — the other
  branch sorts by `sortOrder` and never reaches either comparator), `sort()`
  calls `combatManager.participants.sortByInitiative()` and then immediately
  re-sorts the same array with `initiativeTieBreakComparator`. The first sort's
  result is fully discarded — harmless today since `Array.sort` is
  stable-enough for this to not matter, but it's wasted work and a second,
  separate tie-break implementation (`ParticipantList.initiativeComparator`,
  with its own hardcoded ±100/±1000 edge and OOC weightings) that no longer
  reflects the actual tie-break rule used anywhere in the app.
- **`StatusEnum.OOC` is dead.** The enum defines `OOC = 4`, but nothing in
  `src/` ever assigns it — "out of combat" is entirely driven by the
  computed `ooc` getter (health-threshold based, and overridden by the grunt
  classes), which is a different mechanism from `status`. A reader who sees
  `StatusEnum.OOC` and assumes it's how OOC is represented will be wrong.
- **`active`/`waiting`/`finished` booleans duplicate `status`, and one of them
  has a same-named impostor on the wire.** `Participant` has both a
  `status: StatusEnum` and separate `active`, `waiting`, `finished` boolean
  fields. Nothing anywhere branches on the trio: the only writer is
  `CombatManager.copyParticipant()` (`active = false`, `waiting = false` on a
  duplicate; `finished` untouched), and the only readers are `clone()` and
  `PARTICIPANT_BASE_BACKING_FIELDS`, which copy them so type swaps don't drop
  fields. They are effectively write-only vestigial state.

  **The trap:** `SharedParticipantState.active` is a *different field with a
  different source*. It is derived at broadcast time from
  `currentActors.contains(p)`, not from `Participant.active`, and on restore it
  is written back to `status` + `currentActors`, not to `Participant.active`.
  The player view's active-actor highlight reads the wire field. So `p.active`
  and `shared.active` share a name and nothing else — reading the domain one
  and expecting the wire one's meaning will silently give you `false`.
- **Two "interrupt action" lists that are easy to confuse.** `interruptTable`
  (6 mechanically-offered entries) and `INTERRUPT_ACTION_META` (18 label/
  description/verb keys). Adding a key to the second one does not make the
  action selectable or give it an Initiative cost. See §5.
- **Side-map bookkeeping is manual and easy to miss.** Every GM-local
  `Map<IParticipant, ...>` (`participantOwners`, `participantClaimable`,
  `participantEdgeRatings`, `participantReactions`, `participantIntuitions`,
  `participantTieBreakers`, `participantIds`, `lastKnownDamage`,
  `rowMemberDamageValues`, `participantStatblocks`,
  `participantLieutenantTeamRowId`, the panel-expansion `Set`s, and
  `pendingJoinAnnouncement`) has to be explicitly cleaned up any time a
  participant is removed or type-swapped (see `btnDelete_Click`,
  `forgetParticipant`, `upsertPlayerParticipant`'s type-mismatch branch). A new
  feature that adds another such map inherits this obligation with no compiler
  enforcement. `participantLieutenantTeamRowId` is the one exception to the
  usual four-place pattern (clear on restore / drop on forget / copy on
  duplicate / delete on type-mismatch) — it is deliberately **not** copied on
  duplicate (see "Lieutenant tie-break" above).

  `pendingJoinAnnouncement` is `Map<IParticipant, JoinAnnouncementResolver[]>`
  as of the "grunt naming and statblocks" fix round 3 (RULINGS.md 2026-08-30,
  "A combatant is announced when they enter the initiative order, not when a
  name box loses focus") — it used to be a `Set` marking a participant as
  owing a join line, consulted from a blur/Enter handler
  (`onParticipantNameCommitted`, now removed). It now holds, per participant,
  every deferred join-log line still owed, each a function of whichever
  `IParticipant` instance it is fired against rather than a closure over the
  object that queued it — the array-valued shape exists because `addNpcToRow`
  can queue more than one pending line onto the same still-unrolled row before
  it ever rolls. `queueJoinAnnouncement()` is the single point every GM-side
  add path funnels its wording through; `announceJoinIfPending()` is the
  single choke point that actually writes a queued line, called from every
  place that writes a genuine Initiative Test result to `diceIni`
  (`rollAndLogInitiative`, the player `roll_submission` command, and the
  manual rolled-total box) and from `queueJoinAnnouncement` itself (so a
  reinforcement joining an already-rolled row, `addNpcToRow`, announces
  immediately rather than waiting for a roll that member will never get). It
  now follows the full four-place pattern like any other side map, plus the
  promote/demote carry-over `participantStatblocks`/
  `participantLieutenantTeamRowId` already had (round 2 defect 8 — a still-
  queued join line used to be silently dropped by every one of the four
  promote/demote type-swap helpers).
- **`isUnusedPlaceholder()` diffs a fresh reference instance, not a hand-list**
  (P2-2, round 5). It used to check eight fields by name and missed `baseIni`,
  the condition-monitor sizing fields, `painTolerance` and `status`/`waiting`,
  so a GM who set Reaction/Intuition/a 12-box monitor before typing a name had
  that work silently counted as "nothing at risk" and discarded on a
  destructive Join with no prompt. It now constructs `new Participant()` and
  compares every relevant field against it, plus `participantEdgeRatings`/
  `participantReactions`/`participantIntuitions`/`pendingVrModes` against
  `addParticipant()`'s own seed values — so a new `Participant` field added
  later is covered automatically. `sortOrder` is deliberately excluded: it is
  stamped from a position counter, not GM intent. `PARTICIPANT_DEFAULT_BASE_INI`
  is exported from `Participant.ts` specifically so the GM tab's
  `PLACEHOLDER_REACTION_DEFAULT + PLACEHOLDER_INTUITION_DEFAULT` can be tied to
  it rather than being a second, un-derived `3 + 3 = 6` (D-K, round 7).
- **`hardReset()` is unreachable from the normal game loop.** It exists on
  `Participant` (zeroes damage, sets `baseIni` to 0, resets `dices` to 1 via
  `setDicesWithoutRoll`, in addition to `softReset()`'s work) but nothing in
  `CombatManager` or the GM component calls it — turn boundaries only ever call
  `softReset()`. If it's meant to back a "fully reset this character" UI action,
  that action doesn't currently exist or isn't wired to it. Note it sets
  `baseIni = 0`, not back to `PARTICIPANT_DEFAULT_BASE_INI`.
- **`CombatManager.endCombat()` is also unreferenced by the turn loop** and
  does not fire `onCombatTurnEnded`, so a caller wiring it to a UI control
  would get no Action Log boundary line.
- **No PC/NPC field anywhere in the domain model** (§3) — if a future
  feature needs to branch on that distinction inside `Combat/`, there's
  currently nothing to key off; it would have to be threaded through from
  the GM-component side-maps or added fresh.
- **`ICParticipant` reconstruction gap on rejoin** — comes back as a plain
  `MatrixParticipant` (§6), a deliberate, accepted scope cut (Decision D5,
  `briefs/gm-reconnect-state-loss.md`), not an oversight.
  `DetachedGruntParticipant` no longer has this problem: it reconstructs from
  the GM-only channel's `isGrunt` flag (§7). The player-facing
  `isDetachedGrunt` wire flag remains presentation-only and is still
  deliberately not used for reconstruction.

## Test coverage (as it stands)

Framework: Jasmine + Karma (`npm test`), config in `karma.conf.js`. The
Angular karma builder discovers spec files by globbing `src/**/*.spec.ts`
(`angular.json`'s `test` architect target, default `include`) — a spec file
placed outside `src/` (e.g. a top-level `tests/` directory) is silently never
compiled or run, confirmed by testing several explicit `--include` glob
variants against such a location, all of which matched zero tests. Anything
meant to run under `npm test` must live under `src/`.

**21 spec files** exist in the tree, in three groups.

*Domain / engine:*

- `src/Combat/CombatManager.spec.ts`
- `src/Grunts/npc-row.spec.ts` — the linked-NPC-row feature's per-criterion tests

*Component:*

- `src/app/app.component.spec.ts`
- `src/app/battle-tracker/battle-tracker.component.spec.ts`
- `src/app/condition-monitor/condition-monitor.component.spec.ts`
- `src/app/confirmation-dialog/confirmation-dialog.component.spec.ts`

*Shared units:*

- `src/app/shared/log-formatter.spec.ts`
- `src/app/shared/roll-utils.spec.ts`

*Promoted brief scenarios* — `src/scenarios/` is the convention for any
feature's promoted scenario tests, pulled out of the general specs so each
brief reads as a standalone regression suite:

- `src/scenarios/running-initiative-score.spec.ts` (S1-S3, p. 160/167/191,
  plus the recompute-from-base divergence test)
- `src/scenarios/npc-group-initiative.spec.ts` (S1-S8)
- `src/scenarios/action-log-attribution.spec.ts`
- `src/scenarios/action-log-readability.spec.ts`
- `src/scenarios/combat-log-readability.spec.ts`
- `src/scenarios/combat-boundary-logging.spec.ts`
- `src/scenarios/gm-npc-rolls.spec.ts`
- `src/scenarios/persistent-rooms.spec.ts`
- `src/scenarios/gm-reconnect-state-loss.spec.ts` (S1-S6, brief "GM reconnect
  state loss")
- `src/scenarios/remove-undo-system.spec.ts` (S1-S8, brief "Remove the
  undo/redo system")
- `src/scenarios/grunt-heal-dv-input.spec.ts` (brief "Grunt heal uses DV
  input")
- `src/scenarios/player-join-claim-or-create.spec.ts` (S1-S6, brief "the
  player view opens on a claim-or-create chooser")
- `src/scenarios/player-room-box-collapse.spec.ts` (S1-S6, brief "collapse
  the player view's Room card after a successful join")

Tie-breaking (`initiativeTieBreakComparator`) and `DeclaredActionEngine` have
no dedicated spec files as of this writing; the session-sync
command-handling path (`handleSessionCommand`) is
exercised indirectly through `battle-tracker.component.spec.ts` and
`src/scenarios/persistent-rooms.spec.ts` rather than by a spec of its own.
Confirm current coverage with `npm test` rather than trusting this list to
stay accurate.
