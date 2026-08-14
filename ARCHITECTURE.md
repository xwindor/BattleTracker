# SR5E Battle Tracker — Architecture

This document maps how the tracker's combat engine actually behaves, based on
reading the code rather than the intent behind it. It builds on
`docs/APP_DOCUMENTATION.md` (which stays the broader reference for UI flows,
deployment, and event names) — this file goes deeper specifically on
initiative, turn/pass structure, participant state, tie-breaking, undo, and
how session sync interacts with combat state. Where this doc and
`docs/APP_DOCUMENTATION.md` disagree, this doc describes what the code does
and calls out the conflict explicitly (see "Known rough edges" and inline
notes below).

Matrix and astral content here is scoped narrowly to how those modules hook
into core initiative — per `CLAUDE.md`, that module's *rules* are deferred
and unverified. Its class structure is not: `src/Matrix/` and `src/Magic/`
already exist in the tree, wired into the GM UI and session sync (see
"Matrix/astral hook" below).

## 1. Where initiative order actually lives

There is no separate "initiative order" list. Order is derived at read time
from a single flat collection:

- `CombatManager.participants: ParticipantList` (`src/Combat/CombatManager.ts`)
  — every participant in the encounter, GM-owned, Matrix, or astral, all in
  one list.
- `CombatManager.currentActors: ParticipantList` — the subset currently
  allowed to act this initiative score (see §3, ties can put more than one
  participant here simultaneously before UI-level tie-breaking trims it).

`ParticipantList` (`src/Combat/Participants/ParticipantList.ts`) is a thin
wrapper around a plain array (`_list: IParticipant[]`) with undo-aware
`insert`/`remove`/`insertAt`/`clear`, plus two comparator methods:
`sortByInitiative()` (its own `initiativeComparator`) and
`sortBySortOrder()`.

**In practice, `sortByInitiative()`'s comparator is not what determines
combat order.** The GM component's `sort()`
(`battle-tracker.component.ts:286`) calls `sortByInitiative()` and then
immediately re-sorts the same array with a second, more elaborate comparator
(`initiativeTieBreakComparator`, `battle-tracker.component.ts:2213`), which
is the one whose output actually reaches players. The first sort's result is
completely overwritten — see "Known rough edges."

Each participant carries a **stored, running Initiative Score** for the
current Combat Turn — `Participant.currentInitiativeScore` (backing field
`_currentInitiativeScore`, undoable like every other field). It is seeded
once per Combat Turn and thereafter only ever moved by signed deltas; it is
never recomputed from a base. `Participant.getCurrentInitiative()` reads:

```text
currentInitiativeScore + actionIniModifier
```

- `currentInitiativeScore`: the running Score. Reset to the bare Initiative
  attribute by `softReset()` (turn boundary) and re-seeded when `diceIni` is
  assigned (the Initiative Test).
- `actionIniModifier`: sum of `iniMod` for every entry in `actionHistory`
  (interrupts and declared actions that cost initiative — see §5). Interrupt
  costs are held here rather than debited straight off the Score so undoing
  or resetting an action gives the points back. In the normal turn loop both
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
  (default 6); recomputed by subclasses for Matrix/astral participants (§6).
  Assigning it applies the attribute difference as a same-sized Score delta.
- `wm`: wound modifier, computed live from physical/stun damage vs. pain
  tolerance (0 if `hasPainEditor` is true). It feeds
  `initiativeAttribute = baseIni - wm`, so the damage/pain-tolerance/pain-
  editor setters also push an attribute delta into the Score.
- `applyInitiativeScoreDelta(delta)`: the general primitive. Used by the
  pass boundary (-10) and available for bare Score debits (Surprise, Shake
  Up, Electricity) that no base field can express.
- `appliedInitiativeAttribute`: bookkeeping — the attribute value currently
  folded into the Score, so an attribute change becomes a one-time delta
  rather than a recompute.

The Score is deliberately **not clamped**; negative values are load-bearing
(they gate Interrupt Actions via `canUseAction()`).

There is no persisted "current order" field on `CombatManager` or on the
shared state's participant list beyond an `order` index computed at
broadcast time (`getSharedParticipants()`, see §7) — order is always
re-derived from current initiative, not stored as authoritative state.

## 2. Combat Turn and Initiative Pass

`CombatManager` tracks these as plain numeric/boolean fields (each routed
through `Undoable.Set` so they're part of the undo chapter mechanism, §4):

- `combatTurn: number` (starts at 1)
- `initiativePass: number` (starts at 1)
- `started: boolean`
- `passEnded: boolean` (starts `true`)
- `currentInitiative: number` (the initiative score currently being
  resolved, `NaN` when nothing is active)

**Pass boundary** (`nextIniPass()`): increments `initiativePass`, sets
`passEnded = false`, **subtracts `INITIATIVE_PASS_DECAY` (10) from every
participant's running Initiative Score** (including OOC participants and
those already at or below zero), and flips every non-OOC, non-Delaying
participant's `status` back to `Waiting`. Delaying participants are left
alone — they carry their `Delaying` status across the pass boundary and
re-enter scheduling only when explicitly acted on. Undo batching is the
**caller's** responsibility, not `nextIniPass()`'s: the GM's Next Pass
handler (`btnNextPass_Click`) calls `UndoHandler.StartActions()` first, which
is what makes the click a single undo step. Called with **no** chapter open
(e.g. from a spec), the writes are *not* split into one chapter each: the
first write hits `UndoHandler.HandleProperty`'s `if (!this.recording)
StartActions()` branch, which opens a chapter and leaves `recording === true`,
so every subsequent write in the call — and every mutation after it, until
something calls `StartActions()` or `Undo()` — accumulates into that same
never-closed chapter. So an unwrapped `nextIniPass()` is undoable as one lump
that also swallows whatever happens next, not as N separate steps. See §4.

`addParticipant(participant, carriesRunningScore = false)` seeds a late
entrant joining an already-started turn with `-(initiativePass - 1) * 10`.
Re-insertions of an *existing* participant pass `carriesRunningScore = true`
— the four in-place type swaps (§6) and the shared-state restore path (§7) —
because their Score has already absorbed the decay for every elapsed pass and
must not absorb it twice. Before the running-Score change this fell out of
the global pass counter for free.

**Turn boundary** (`endCombatTurn()`): resets `initiativePass` to 1, clears
`currentInitiative`, increments `combatTurn`, calls `softReset()` on every
participant (§3), and sets `started = false`. This is invoked automatically
from `endInitiativePass()` when `isOver()` is true — i.e. when no non-OOC
participant has positive current initiative left. `hasMoreIniPasses()` is a
separate check (any non-OOC participant with `currentInitiative - 10 > 0`)
used by UI to decide whether another pass is coming, but it is not itself
what triggers the turn boundary — `isOver()` is.

**What resets at a turn boundary** (via `softReset()`): `diceIni` → 0,
`currentInitiativeScore` → back to the bare Initiative attribute (the old
turn's Score is discarded, and the next Initiative Test re-seeds it),
`edge` → false, `status` → `Waiting`, `actionHistory` → `[]`, and — if the
participant was not OOC, or `revive` is passed — `ooc` is cleared. Damage,
health, `baseIni`, and `dices` all persist across turns; they're untouched
by `softReset()`. Only `hardReset()` (not called anywhere in the turn/pass
lifecycle — it's a manual reset) also zeroes damage and stats.

**What resets at a pass boundary:** `status` (Waiting/Delaying),
`passEnded`/`initiativePass`, and the -10 applied to every running Score.
Rolled dice (`diceIni`), action history, and edge stay — a participant keeps whatever initiative modifiers they
accumulated from interrupts/actions taken earlier in the same turn as they
carry into the next pass; those only clear at the turn boundary.

## 3. Participant state

`Participant` (`src/Combat/Participants/Participant.ts`) implements
`IParticipant`. Every mutable field is private with a backing `_field` and a
getter/setter that routes through `Undoable.Set` (§4) — this is a hard
convention: `Undoable.Set` throws if the backing field name doesn't match
(`obj is missing property: _prop`), so a new property must always follow the
`_foo` + `get foo()` + `set foo(val)` shape.

Fields: `name`, `status` (`StatusEnum`), `active`/`waiting`/`finished`
(booleans that shadow `status` rather than being derived from it — see
rough edges), `baseIni`, `diceIni`, `dices`, `edge`, `sortOrder`,
`actionHistory: Action[]`, `hasPainEditor`, `painTolerance`,
`overflowHealth`, `physicalHealth`, `stunHealth`, `physicalDamage`,
`stunDamage`, `currentInitiativeScore`, `appliedInitiativeAttribute`.

Several setters (`baseIni`, `physicalDamage`, `stunDamage`, `painTolerance`,
`hasPainEditor`, `diceIni`) do a second, dependent write after their own
`Set` in order to keep the running Initiative Score in step (§1). They land
in the same undo chapter as the primary write.

`dices` is the one field with **no plain setter** — it is a read-only getter
(`readonly dices: number` on `IParticipant`). Changing a participant's
Initiative Dice count is a rules event that has to roll the gained/lost dice
and move the running Score, so it goes through one of exactly two methods:

- `changeDiceCount(newDices, rollDie?)` — the mid-turn change. Clamps to
  `[1, 5]` (the 5D6 hard cap, brief pp. 52/288); if the participant has not
  taken this turn's Initiative Test (`diceIni <= 0`) or the count does not
  actually change, it just writes the count; otherwise it rolls
  `|delta|` dice via the injected `rollDie`, applies the *full* rolled total to
  the Score, and returns `{ values, delta }` for logging. It applies the
  floored-off remainder (below `MIN_DISPLAYED_DICE_TOTAL`) as a separate Score
  delta so no part of the roll is lost to the display floor.
- `setDicesWithoutRoll(val)` — construction, `hardReset()`, shared-state
  restore, and initial `register_character` setup. Same `[1, 5]` clamp, no
  roll, no Score movement.

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
(`[ngModel]="p.diceIni"` + `(ngModelChange)="onParticipantRolledTotalChanged"`),
deliberately — a two-way `[(ngModel)]` would push the raw typed value through
the Score-moving setter before any validation could run, and an `(input)`
listener cannot intercept it either (template listeners are registered ahead
of `ngModel`'s host listener, so they observe the *previous* model value).
The handler clamps to `[0, dices * 6]` first, then assigns, so a typed edit
moves the Score only by the legitimate old→new rolled-total delta, and
Angular writes the clamped value back into the DOM.

Two fields are computed, not stored:

- `wm` (wound modifier): `floor((physicalDamage - painTolerance) / 3)` +
  the same for stun, each floored at 0; forced to 0 if `hasPainEditor`.
- `ooc`: `true` if manually flagged OOC (`_ooc`), or if physical damage
  reaches `physicalHealth` (Pain Editor case), or if either physical or
  stun damage reaches its respective health track (non-Pain-Editor case).

There is no PC/NPC field distinction anywhere in `IParticipant` or
`Participant` — the class makes no structural distinction between player
and non-player characters. "Player-controlled" is tracked entirely outside
the combat engine, in the GM component's `participantOwners: Map<IParticipant,
string>` (§7), not on the participant itself. Anything resembling an NPC
distinction (declared actions, UI affordances) is a UI-layer concern, not a
domain-model one.

`clone()` is used by `CombatManager.copyParticipant()` ("duplicate NPC"
button) — it copies scalar fields but always resets `edge`, `active`,
`status` (to `Waiting`), `waiting`, and gives a fresh `sortOrder` and empty
`actionHistory`. Because the action history is dropped, the copy's
`_currentInitiativeScore` is seeded from the source's
`getCurrentInitiative()` (Score *including* committed interrupt spend), so
duplicating a participant mid-turn does not refund what they already paid.
Name collision handling appends an incrementing numeric suffix
(`"Ganger 1"`, `"Ganger 2"`, ...).

## 4. Undo model

Two cooperating pieces, both under `src/Common/`:

- `Undoable` (base class `Participant`, `CombatManager`, and Matrix/astral
  subclasses all extend): `Set(prop, val)` just forwards to
  `UndoHandler.HandleProperty`.
- `UndoHandler` (singleton, `src/Common/UndoHandler.ts`): maintains
  `pastHistory` / `futureHistory`, each a stack of "chapters"
  (`HistoryEntry[]`), plus a `currentChapter` being built.

**Property writes** (`HandleProperty`): compares old vs. new backing-field
value; if different, mutates immediately and pushes an undo/redo closure
pair onto `currentChapter`. If nothing is currently "recording"
(`this.recording === false`), it auto-starts a chapter — but it never
*closes* one, so that auto-opened chapter stays open and collects every later
write until an explicit `StartActions()` (or an `Undo()`, which calls
`EndActions()` first) closes it. A bare property set outside any explicit
`StartActions()` is therefore not guaranteed to be its own single-entry
chapter; it is the *start* of an open-ended one.

**Non-property actions** (list insert/remove, action-history push/pop) go
through `UndoHandler.DoAction(action, undoAction)` instead — this runs
`action()` immediately and, if a chapter is open, appends the pair. Called
directly by `ParticipantList.insert/remove/insertAt/clear` and by
`Participant.doAction/resetActions`.

**Chaptering**: UI click handlers call `UndoHandler.StartActions()` first
(e.g. `btnDelay_Click`, `btnDelete_Click`, `rollOutstandingInitiative`) so
that everything the handler does — however many property sets and list
mutations — collapses into one undo step. `StartActions()` closes any
chapter already open, clears `futureHistory` (redo stack invalidated by new
work), and opens a new one. Handlers that *don't* explicitly call
`StartActions()` still get undo coverage per-property, but not *isolation*:
their writes join whatever chapter the first of them auto-opened (see
"Property writes" above), and that chapter keeps absorbing later mutations
until something else calls `StartActions()`. Explicit `StartActions()` at the
top of a handler is what bounds an undo step on both ends.

`Undo()`/`Redo()` walk a chapter's entries in reverse/forward order and
replay the closures; they don't recompute derived state (`ooc`, `wm`,
`getCurrentInitiative()`), which is fine since those are always computed
live from the restored backing fields.

Nothing about undo is initiative-pass- or turn-scoped — the undo stack is a
flat, session-lifetime history, not reset at pass or turn boundaries. Undo
across a turn boundary will restore participants' pre-reset state
(damage, `actionHistory`, etc.) correctly because the boundary reset itself
went through `Set`/`DoAction` and is just another chapter.

## 5. Actor progression through an initiative score

`CombatManager.getNextActors()` scans all `Waiting`, non-OOC participants
with positive current initiative, and picks the highest-initiative group —
with edge participants unconditionally taking priority over non-edge ones
regardless of score, and only ties within the same edge state grouped
together into `currentActors`. `goToNextActors()` marks the outgoing
`currentActors` `Finished`, recomputes the next group, marks it `Active`,
and — if nobody is left — calls `endInitiativePass()`.

`act(actor)` marks that actor `Finished`, removes them from
`currentActors`, and advances to the next group once `currentActors` is
empty. `Delay` (UI-driven, `btnDelay_Click`) sets `status = Delaying` and
removes the actor from `currentActors` without marking them `Finished` —
they don't reappear until the GM explicitly acts on them again.

Interrupts and declared actions apply an initiative cost by pushing an
`Action` (`{ key, iniMod, persist?, martialArt?, edge? }`,
`src/InterruptTable.ts`) onto `actionHistory` via `Participant.doAction()`;
`actionIniModifier` sums these into every subsequent
`getCurrentInitiative()` call. `canUseAction()` blocks an action whose
`|iniMod|` exceeds current initiative, and blocks re-selecting a `persist`
action already in history (e.g. Full Defense, which is meant to apply once
and hold).

A **second, separate** Score gate covers the ordinary Act modal (declared Free /
Simple / Complex actions, which never touch `canUseAction`): at an Initiative
Score of 0 or below a participant has no Action Phase, so
`BattleTrackerComponent.hasLiveActionPhase()` refuses the Simple and Complex
categories while leaving Free open, and `isDeclaredActionSelectionValid()`
refuses to submit a Simple/Complex selection made before the Score dropped
(`MIN_ACTION_PHASE_INITIATIVE_SCORE`, `RULINGS.md` 2026-08-07). It applies to
every participant type. Defense Tests are not modelled as gated actions at all
and are unaffected. This lives in the GM component because that is where action
declaration lives; there is no engine-side action-economy model to put it in. **Note:** `InterruptTable` currently defines 14 entries (full
defense, block, intercept, counterstrike, dive for cover, dodge, parry,
reversal, right back at ya, run for your life, dive on the grenade,
sacrifice throw, riposte, protecting the principle, shadow block, "I am the
firewall") — this is a wider and differently-named set than the six listed
in `docs/APP_DOCUMENTATION.md` §"Act/Delay/Interrupt" (which also lists a
"Hit the Dirt" key that does not exist in the table). Treat
`src/InterruptTable.ts` as authoritative for what's actually offered.

## 6. Matrix/astral hook into core initiative

There is no separate Matrix or astral initiative track, host, or ordering
structure at the `CombatManager` level. Both `MatrixParticipant`
(`src/Matrix/MatrixParticipant.ts`) and `AstralParticipant`
(`src/Magic/AstralParticipant.ts`) are direct subclasses of `Participant`
and insert into the exact same `CombatManager.participants` list as anyone
else — same status lifecycle, same `getCurrentInitiative()` formula, same
undo mechanics, same tie-break comparator. `ICParticipant` further extends
`MatrixParticipant` (still the same list, still the same engine).

What each subclass adds is only how `baseIni`/`dices` get *set*, plus a
UI-gating flag:

- `MatrixParticipant.applyJackInMode(mode, intuition, applyDiceCount)`: sets
  `baseIni = dataProcessing + intuition`, `blocksPhysicalActions = (mode !==
  AR)`, and hands the mode's dice count (4/3/1 for Hot-Sim/Cold-Sim/AR, via
  the static `initiativeDiceForMode`) to the **mandatory** `applyDiceCount`
  callback. The callback is required rather than optional so every caller has
  to say whether this is a mid-turn change (`changeDiceCount`, rolls the delta)
  or setup (`setDicesWithoutRoll`, does not) — it used to assign `dices`
  itself and leave the roll to callers, which is how the "Switch Mode" control
  came to change the dice count with no Score effect at all.
- `AstralParticipant` states the same shape (INT×2 base,
  `blocksPhysicalActions` while `astralProjecting`), gated the same way — but
  its dice count is expressed as a **relative** delta, not an absolute per-mode
  count: `ASTRAL_PROJECTION_DICE_DELTA` (`src/Magic/AstralParticipant.ts`) is
  `ASTRAL_INITIATIVE_DICE - PHYSICAL_INITIATIVE_DICE` = +1, requested by
  `toggleAstralProjecting()` on the way in, through the
  `changeParticipantDiceCount` funnel so the gained die is rolled and moves the
  running Score. Relative rather than absolute so a magician already carrying
  bonus Initiative Dice (Increase Reflexes, wired reflexes, a drug) keeps them.
  The way *out* does **not** blindly negate the constant: the funnel's 5D6 cap
  (pp. 52/288) can absorb the requested +1 into nothing (a magician already at
  5D6 gains no die and the Score does not move), so `AstralParticipant` records
  what was actually realized in `projectionDiceGain` — undoable, carried by
  `clone()` — and the return trip requests `-projectionDiceGain`, not `-1`.
  This keeps a capped-out round trip (project, return) net-zero on both dice
  count and Score, matching "you only roll and subtract dice you actually
  lose" (p. 160). `MatrixParticipant`'s per-mode counts are still absolute and
  have the same modelling limitation; that is a deferred Matrix-module
  concern.

`blocksPhysicalActions` is explicitly *not* the same as `ooc` — per the
in-code comment on `MatrixParticipant`, a jacked-in decker stays fully
scheduled in initiative; only the action-planner UI is expected to hide
physical action categories while the flag is set. The combat engine itself
has no awareness of this flag (`CombatManager`/`ParticipantList` never
reference `blocksPhysicalActions`).

Both subclasses override `clone()` to copy their extra fields, because
`Participant.clone()` — used by `copyParticipant()` — only knows about base
fields and would otherwise silently downgrade a duplicated decker/astral
participant back to a plain `Participant`. The base-field list those
overrides copy (and the GM component's four promote/demote helpers) is now a
single exported constant, `PARTICIPANT_BASE_BACKING_FIELDS` in
`src/Combat/Participants/Participant.ts` — it used to be six duplicated
string arrays, which is a live drift hazard now that the running Initiative
Score lives in a backing field (omitting it silently resets a participant's
Score mid-turn).

GM UI wiring (`battle-tracker.component.ts`) supports converting a
participant in place between plain/`MatrixParticipant` via
`promoteToMatrixParticipant`/`demoteToParticipant`, triggered by the
player-side `configure_deck` session command (§7) — this is a live type
swap on an existing list entry, not a separate registration path. All four
promote/demote helpers copy `_actionHistory` across as well (unlike
`clone()`), and re-insert with `addParticipant(p, true)` so the carried Score
is not decayed again for passes it has already absorbed.
`demoteToParticipant` and its astral twin `demoteFromAstralParticipant` both
perform the dice-*decrease* half of the change (roll the lost dice, subtract
the total) via `changeParticipantDiceCount`; the `baseIni` write only covers
the attribute half. Every other dice-count-changing path — the row and
Stats-tab dice-count inputs, `gmJackIn`, `gmJackOut`, `onVRModeChange`, and
the `configure_deck` jack-in/jack-out branches — routes through that same
funnel. The only paths that write `dices` without it use
`setDicesWithoutRoll` and are deliberate non-change events:
`restoreFromSharedState`, `upsertPlayerParticipant`/`register_character`,
the `configure_deck` `create` payload, the `ICParticipant` constructor,
`Participant.hardReset()`, and the (currently uncalled) Phase-1
`MatrixStateService.jackIn` skeleton. `upsertPlayerParticipant` is only a
non-change event for *setup*: it routes through `applyRegisteredDiceCount`,
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
deferred is *rules verification* (`docs/UNVERIFIED-RULES.md` items 1-9) and
the remaining GM-workflow build-out (host/target spotting, mark tracking,
OS thresholds UI, IC spawning — see `docs/MATRIX_MODULE_PLAN.md`). The
domain classes, initiative integration, and badge/session-sync plumbing for
Phase 1 already exist and are live in the tracker.

### Linked NPC rows (grunt groups)

`NpcRowParticipant` (`src/Grunts/NpcRowParticipant.ts`) is the third
`Participant` subclass and follows the same principle as the two above: it is
**one entry in `CombatManager.participants`**, with one running Initiative
Score, one slot in the derived order, and one -10 at each pass boundary. The
NPCs in it are `GruntMember` objects (`src/Grunts/GruntMember.ts`) hanging off
the row — deliberately *not* participants, so they never appear in the order
and the engine loops in §2/§5 stay untouched. Members act back-to-back inside
the row's single slot; the row exposes `members` / `activeMembers` for the UI to
step through. There is no per-member turn state.

Three overrides carry the rules (see `briefs/npc-group-initiative.md` and the
2026-08-01 entry in `RULINGS.md`):

- `wm` = the row's **own accumulated shared wound modifier**
  (`_rowWoundModifier`), which is the house rule: any member's wound moves the
  row's shared Score, for everybody, through the existing
  `initiativeAttribute` → `syncInitiativeAttribute()` delta path (§1). No new
  Score plumbing was added for this feature. It is an **event accumulator, not
  a sum over the current members**: only `applyDamageToMember` / `healMember`
  move it, so adding, removing or detaching a member is Score-neutral (a
  reinforcement inherits the row's score per Decision 7; scenario S4 says the
  members left behind keep the row's score untouched). It is floored at 0 and
  carried across Combat Turn boundaries via `resetInitiativeScore()` (p. 159:
  wound modifiers may affect Initiative Score "on this and any subsequent
  Combat Turns").
- `ooc` = manual flag OR every member out of action. A row has no Condition
  Monitor of its own — each member has a grunt-style single combined track
  (8 + ceil(max(Body, Willpower)/2) boxes, no overflow), and the row's own
  inherited damage tracks are unused and stay at zero. Because those tracks are
  meaningless, the GM details panel renders **no Condition Monitor tab at all**
  for a selected row (the members' monitors are edited in the row panel), and
  renders a *single* combined bar for a selected `DetachedGruntParticipant`; the
  PC two-track display is for everyone else. `hasGruntConditionMonitor()` is the
  guard, `isNpcRow()` the exclusion.
- A member who is out of action **can** be healed back up: `healDamage` has no
  `outOfAction` gate, `GruntMember.outOfAction` is re-derived from the box count
  on every read, and the row's shared accumulator is paid back exactly as it is
  for a member who was never fully down (`RULINGS.md` 2026-08-07, reversing the
  2026-08-02 refusal — the "use global Undo instead" correction path it relied
  on stopped being workable once Undo was slated for removal). The final-attack
  `lastDamageType`/`lastDamageValue` record is untouched by a heal, so p. 379's
  alive/dead read stays correct history. Same for a
  `DetachedGruntParticipant`, whose `ooc` was always live-derived.
- `canUseAction()` always returns `false`: row members cannot take Interrupt
  Actions at all (the GM component also reports `canInterrupt: false` for a row
  in the shared state, §7). `detachMember(member, factory)` is the way out — by
  default it hands back a `DetachedGruntParticipant`
  (`src/Grunts/DetachedGruntParticipant.ts`), a `Participant` subclass that
  keeps the grunt Condition Monitor shape after the detach: `wm` and `ooc` are
  overridden to work off `physicalDamage + stunDamage` against a single box
  count, and the final-attack record (`lastDamageType` / `lastDamageValue` /
  `gruntBody`) travels with it so p. 379's alive/dead comparison still resolves.
  A caller-supplied factory (`AstralParticipant` / `MatrixParticipant`, for an
  initiative-type change) gets the boxes and damage but PC-shaped two-track
  semantics — a known limit, recorded in `RULINGS.md` (2026-08-01, "A detached
  grunt keeps its single Condition Monitor").
- `DetachedGruntParticipant` also carries its own `applyDamage(boxes, type)` /
  `healDamage(boxes)` (brief Decision 20, `RULINGS.md` 2026-08-13 "A killing
  blow's Damage Value can exceed the boxes left on the track"), mirroring
  `GruntMember`'s methods of the same name rather than duplicating their logic:
  the boxes actually **written** onto `physicalDamage`/`stunDamage` are capped
  at the track's remaining capacity (no overflow, p. 379), but the DV
  **recorded** for the p. 379 alive/dead comparison is the attack's full DV,
  uncapped. Before this, a standalone or detached grunt's Condition Monitor
  widget could only ever apply as many boxes as were left on the track — a
  killing blow bigger than the remaining boxes was unrecordable — so this gives
  the standalone/detached panel the same `DV` + `P`/`S`/`-1` GM controls the row
  panel already had (`getGruntDamageValue`/`setGruntDamageValue`/
  `hitGruntPhysical`/`hitGruntStun`/`healGrunt` in the GM component, all thin
  plumbing over the two domain methods).

`NpcRowParticipant.isSpent` covers **both** a row whose every member is out of
action and a row *emptied* by removal or detach (`everPopulated` is what
distinguishes an emptied row from a brand-new one the GM has not filled in yet,
which is left alone) — either way nobody is left to act, so `isSpent` is what
`flagSpentNpcRows()` uses to decide whether the row has to give up the
current-actor slot. But since brief Decision 21 (`RULINGS.md` 2026-08-13,
"Emptying a row by hand is not the same as wiping it out", narrowing the
2026-08-07 entry below) the **red flag itself** — `spentFlagged`, `ooc`, the
downed-participant styling — is driven by the narrower
`NpcRowParticipant.isWipedOut` (every member present, all of them out of
action), not by `isSpent`. A row emptied by hand — its last member removed or
detached — satisfies `isSpent` (it cannot act, it has nobody) but not
`isWipedOut`, and is left as a plain, unstyled empty row for the GM to delete
whenever convenient. This means an empty-by-hand row can in principle still be
selected by `getNextActors()` if its Score is still above 0 and its `status`
is `Waiting` — the same latent corner case the "brand-new, not yet populated"
row already tolerated (`isSpent` false there too, for the same reason); in
practice the GM is prompted to delete the row in the same tap that empties it
(see `removeRowMember` below), so the window is normally momentary.

A row wiped out **by damage** is **flagged, not deleted** (`RULINGS.md`
2026-08-07, reversing the 2026-08-01 auto-delete ruling): it keeps its slot in
the order, reads `ooc === true` so `getNextActors()` skips it and the GM list
gives it the ordinary out-of-action styling, and leaves only when the GM taps
the per-row trash icon (`btnDelete_Click`, the only path that removes a row
still holding members). `CombatManager.flagSpentNpcRows()` is the single place
this is decided; it runs at the top of `goToNextActors()` and again from the GM
component's damage/heal/detach/remove handlers (`flagSpentNpcRows()`) so the
flag lands on the tap that caused it, and it now keys the flag/log/`ooc`
consequence off `isWipedOut` while still pulling *any* `isSpent` row (wiped or
merely emptied) out of `currentActors` if it was acting. The flag is remembered
on the row (`spentFlagged`, undoable) so it is announced once, and cleared
again if a heal brings a member back (Decision 13), or if a wiped-out row's
downed members are later removed by hand until none are left (it reads as a
plain empty row from that point, not a wiped-out one) — either way a later
collapse is announced afresh. If the row that just went spent was the
participant currently acting it is pulled out of `currentActors` and that
method advances the order itself — the same pattern as `btnDelay_Click` —
behind the `advancingActors` re-entrancy flag, so it never re-enters
`goToNextActors()` from inside that method's own pre-step. Without the advance,
emptying the acting row (by damage or by hand) left `currentActors` holding a
participant that could no longer act with `passEnded` still false, which
renders neither an Act button nor a Next Pass button.

The GM component's `removeRowMember()` (the per-member trash icon) is the one
row mutation that **prompts** (brief Decision 21): it always confirms first,
the same `confirmationDialog.simpleConfirm` pattern `btnDelete_Click` uses, and
when the NPC being removed is the row's last, the same single Yes/No answers
both "remove this NPC" and "delete the now-empty row" — there is no second
prompt. Deleting the row this way runs the identical undoable side-map cleanup
`btnDelete_Click` does (`forgetParticipant`, plus
`forgetMapEntry(rowMemberDamageValues, member)` for the member's own queued
Damage Value), all in the same undo chapter as the removal. `detachRowMember`
is unchanged in this respect — detaching is not destructive (the NPC goes on to
its own initiative row), so it does not gain a new prompt, only the
`isWipedOut` narrowing above.

Each `GruntMember` also carries a per-NPC `hasActed` marker (brief Decision 18)
— the row-member equivalent of a participant's Act state, since the row is one
participant and its `status` cannot say which of six gangers has gone. It gates
nothing in the engine, is cleared by `nextIniPass()` and by
`NpcRowParticipant.softReset()`, and is deliberately **not** on the session-sync
wire (GM bookkeeping; it does not survive a rejoin). Since brief Decision 22
the row has **no whole-row Act button** at all (`isNpcRow(p)` hides it in the
template; ordinary participants are unaffected) — a group does not take one
action, its members each take their own. Since Decision 23 the per-member
control is the real declare-action path, not a silent toggle: tapping "Act" on
a still-standing member (`btnRowMemberAct_Click`) opens the same Act modal an
ordinary participant's `btnAct_Click` opens, scoped to that NPC via a new
`actModalRowMember` field (`actModalParticipant` stays the row itself, since
the row is what holds the shared Score and Action Phase the modal gates on);
`submitActModal()` branches on `actModalRowMember` and, for a row member, calls
`performRowMemberAct()` instead of the ordinary `performAct()` — it logs the
declared action attributed to the NPC (`logRowEvent`, actor = the row, NPC
named in the text, same convention as every other row log line), sets that
member's `hasActed`, and only calls `CombatManager.act(row)` — finishing the
row's Action Phase and advancing the order, exactly what `performAct` does for
an ordinary participant — once every member in `row.activeMembers` has acted.
Decision 24 gates the per-member Act button on `canRowMemberAct(row)`:
`currentActors.contains(row)` (the row's turn) and `hasLiveActionPhase(row)`
(Decision 16 — Score above 0). `toggleRowMemberActed()` (Decision 18's original
silent toggle) is kept, but the template now only reaches it in the **un-mark**
direction — tapping an already-"Acted" pill flips it back off in one tap with
no modal and no second log line, Xavier's Round 3 mis-tap-correction
requirement — and that direction is deliberately **never** gated by
`canRowMemberAct`, so a mis-tap can always be corrected regardless of whose
turn it is.

Member-list mutations go through `UndoHandler.DoAction`, so adding, removing,
damaging and detaching are all undoable like any other mutation; the GM
component's handlers open a chapter first (§4) so each tap is one undo step.
The GM-local side-map cleanup that goes with a removal (`forgetParticipant()`)
is undoable too, via `forgetMapEntry` / `forgetSetEntry` — otherwise undo would
restore the row with a new participant id, a defaulted Reaction/Intuition and a
fresh coin-toss tie-breaker, and re-announce it to players as a new participant.
Since Decision 14 that cleanup runs from `btnDelete_Click`, and since Decision
21 also from `removeRowMember()` when confirming the last member's removal
deletes the now-empty row in the same tap; a merely-flagged (not deleted) row
keeps every side-map entry either way, because it is still in the encounter and
its NPCs can still be healed back up.

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
Partial<SharedLogEntry>` for this and any future per-entry flag.

GM-component-side, a row is created by `addNpcRow()` and is given an Edge
rating of `NPC_ROW_EDGE_RATING` (0), which is what makes the existing
`initiativeTieBreakComparator` resolve a row's ties by Reaction, then
Intuition, then the coin toss. Rows inherit every side-map obligation in §7 /
"Known rough edges"; `forgetParticipant()` is the shared cleanup helper for
participants removed outside `btnDelete_Click`.

**Session sync for rows.** `restoreFromSharedState()` reconstructs
`MatrixParticipant` and `AstralParticipant` from the `isMatrix`/`isAstral` flags
on the wire, and now `NpcRowParticipant` from an `isNpcRow` flag alongside them
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

Row members' Condition Monitors are therefore the **one** kind of damage that
survives a rejoin — they are row state, not the participant-level
`physicalDamage`/`stunDamage` fields, which are still not on the wire for
anybody (§7). `buildRestoreWarning()` says so.

Still not reconstructed on rejoin: `DetachedGruntParticipant` (no grunt flag on
the wire, so a detached grunt returns as a plain `Participant` with PC-shaped
two-track semantics and no `gruntBody`/final-attack record) and `ICParticipant`
(returns as a `MatrixParticipant`). Both are the same shape of gap the row flag
just closed and would be fixed the same way. Panel-expansion `Set`s
(`expandedRowPanels` and friends) are keyed by participant object and are not
cleared by a restore, so a restored row's member panel starts collapsed.

## 7. Session sync and its effect on combat state

Transport: `server.js` (Express + Socket.IO) relays events between one GM
socket and any number of player sockets in a room; combat state itself
never lives on the server beyond a last-known snapshot
(`sessions: Map<room, { state, log, lastActivity }>`).

That snapshot is now **durable**: `server/session-store.js` persists one JSON
file per room under `SR5E_DATA_DIR` (default `data/rooms/`), written atomically
(temp file + rename) ~1s after the last change, flushed immediately on
`gm:close-session` / `gm:end-session` and on `SIGINT`/`SIGTERM`. Every room is
loaded back into the Map *before* `server.listen`, so a room survives a
`pm2 restart` and a multi-day gap. **Retention is indefinite, with one
exception** (spec Open Decision 5 as amended 2026-08-05; exception reconciled
into AC 11 as round-4 defect D7): no room is ever removed for age, and a room
dies only when a GM uses End Room — except that at the hard room cap
(`TOTAL_ROOM_CAP`), the single oldest room nobody is connected to may be
evicted to make room for a new `gm:create-session` (see "Room-creation bounds"
below). Unlike End Room, an eviction leaves a tombstone: it happens to a GM who
was not there to see it, so their next `gm:join-session` for that code explains
why via `roomNotFoundReason()` rather than a bare "Room not found". `lastActivity`
is still stamped on every write. A housekeeping sweep still runs at startup and
every 24h, but all it does now is clear legacy `<ROOM>.expired.json` markers -
both the ones the previous 30-day build wrote and any corrupt one - after
`DEFAULT_TOMBSTONE_RETENTION_MS`; it removes no live rooms.
Three server-side sites mutate a session — the two emit
handlers plus the in-place `ownerName` strip in the disconnect handler — and all
three go through the single `touchSession(room)` helper. See
`briefs/persistent-rooms.md`.

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
exempt. A future handler therefore cannot reintroduce the hole by forgetting to
opt in; it would have to opt out on purpose. Individual handlers no longer repeat
the role/room checks, on purpose: duplicated copies of the rule are what drifted.

Order of refusal is `invalid-room-code` → (lifecycle only) `room-not-found` →
`role-required: …` → `room-mismatch`. Lifecycle events answer "room not found"
*ahead* of the membership check so an End Room retry after a lost ack still reads
as the terminal success it is (defect D5), even though the end has by then
cleared the issuing socket's own membership. The write paths deliberately do
**not** require an existing room, or the contentless reaper's self-healing
recreate would break.

`gm:close-session` and `gm:end-session` both run `evacuateRoom()`, which clears
`socket.data.room` / `socket.data.role` / `socket.data.playerName` on every
socket attached to that room, then `socketsLeave()`. `socketsLeave()` alone was
not enough: it clears Socket.IO membership but not `socket.data.room`, which is
what the ownership rule authorises against — so a second GM tab still logically
in an *ended* room passed every check afterwards and recreated the room through
`getOrCreateSession` on its next broadcast. With indefinite retention that
resurrection is permanent, i.e. "End Room" did not end the room.

### Room-creation bounds

A **brand-new room is never written to disk**. `gm:create-session` takes no room
code, no role and no credential, so persisting at create time would let anyone
fill the disk by calling it in a loop — and the room-ownership rule cannot help,
since it only guards rooms that already exist. A
created room lives in the Map until the GM's first real state broadcast or log
entry; `store.touch` refuses a room with no content (`hasPersistableContent`).

That refusal is a **backstop, not the bound**: a create-loop that gives each new
room content one `session:append-log` later produces writes that are individually
legitimate. The bound is `server/room-guards.js` (spec AC 16): creation is
rate-limited per origin (10/60s) and per socket connection (25 lifetime), the
total number of rooms held is capped (`TOTAL_ROOM_CAP`, 500 — a rate limit
bounds the rate, not the accumulation, and retention is indefinite), and a
room that never acquires content is dropped from the `sessions` Map after 10
minutes by a reaper separate from the store's file housekeeping. Reaping is
self-healing — `session:update-state` goes through `getOrCreateSession`, so a GM
still in a reaped room recreates it on the next broadcast, with content.

The cap is **not** a permanent lockout. At the cap, a create first tries
`findEvictableRoom()`: the single least-recently-active room (`lastActivity`)
that has **nobody connected** — by either Socket.IO membership or
`socket.data.room` — is evicted, in memory and on disk (leaving a tombstone;
see "Retention is indefinite, with one exception" above), and the create
proceeds. One room per create, never a batch, and never a room with a live
socket, however idle it looks. If all 500 are occupied the create is refused as
before, with the reason saying so. Every eviction is logged with the room code
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
the Map, still persisted, still joinable by code. `player:join` does **not**
detach (it reassigns `socket.data.room` the same way); that is a known gap, not
a decision.

What is still *not* on the server: the GM's undo/redo history, GM-local hidden
log entries, and everything `getSharedParticipants()` does not broadcast
(damage/health, OOC participants, `actionHistory`). Durability does not widen
the snapshot — it only makes the same snapshot outlive the process.

`gm:close-session` and `gm:end-session` are different actions: close *leaves*
the room (still persisted, still joinable by code), end *destroys* it (in-memory
session and file both deleted). The GM-local hidden-log discard belongs to end,
not close — and only to an end that **actually succeeded** (spec AC 17). A
rejected or timed-out `endSession()` leaves the room code, the hidden entries and
the live-encounter association exactly as they were, so a network blip cannot destroy
the only copy of those entries; the GM sees the error and retries. The one
failure reason that is *not* treated as a failure is "Room not found" (or the
legacy removed-room message): that means the end already succeeded and only the
ack was lost, so the retry performs the local teardown instead of leaving the GM
holding a room that no longer exists behind an error banner with no way out.
`btnCreateShareSession_Click` discards those entries too, and its confirmation
now counts `getHiddenLogEntries()` directly - it used to ask
`hasRetainedHiddenLogEntries()`, which is empty whenever `shareRoomCode` is set,
so the one case that had entries to lose was the one case that never prompted.
Creating a session while a room is already live also abandons that room (see the
socket detach above), so the same dialog names the code to rejoin to get it back.

That promise is enforced by `liveEncounterRooms`, a **set** of room codes this
tab's `CombatManager` is the live source of truth for — not a single code. It is
what decides push-vs-pull on the Join button (`holdsLiveEncounterFor()`), and it
is additive: creating or joining another room does not stop this tab being the
truth for the one it just left. It was a single code, reassigned by Create, which
made the dialog's "rejoin code X to bring it back" false the moment it was
printed — the rejoin took the destructive pull path and discarded the very
encounter the dialog had promised was safe. Entries leave on exactly two events:
the room is destroyed (End Room, or an external end), or this tab's encounter is
genuinely *replaced* by a pull, at which point every earlier association is
stale and the set resets to the joined room alone. The private
`liveEncounterRoomCode` accessor is a most-recent-entry view over the set.
Consequence to know: after a mis-tapped Create, rejoining the old code pushes
this tab's *current* encounter into that room, overwriting the room's stored
snapshot. That is the promised behaviour (the local encounter is the one that
was there), but it is a push, not a merge.

**The GM's local `CombatManager` is the single source of truth.** Nothing
about turn/pass advancement, undo, or initiative computation is
network-aware — those all run identically whether or not a share session is
active. Session sync is a one-way derived broadcast layered on top:

- Every mutation path that changes visible state calls `sort()` (which
  calls `syncSharedState()` at its end) or `syncSharedState()` directly.
- `syncSharedState()` builds a `SharedCombatState` (`round`, `pass`,
  `started`, `passEnded`, `currentInitiative`, and a freshly-computed
  `participants` array from `getSharedParticipants()`) and pushes it via
  `sessionSync.broadcastState()` → `session:update-state` → server
  rebroadcasts as `session:state` to everyone in the room, including the GM
  tab that sent it.
- `getSharedParticipants()` filters out OOC participants entirely (they
  never appear in the shared list at all, not just hidden) and recomputes
  `order` as the post-filter array index every time — this is the only
  place an explicit "order" number exists in the state model, and it's
  derived, not authoritative. Because of that filter, an encounter where
  *everyone* is out of action serialises as `participants: []` and used to be
  indistinguishable on the wire from a room that never had an encounter — so a
  GM joining that code hit the empty-snapshot branch and pushed their own
  encounter straight over a real saved fight. `SharedCombatState` therefore also
  carries `oocParticipantCount`, a plain count of what the filter withheld. It
  exists **only** for the persistence/overwrite guard
  (`snapshotHasEncounter()`); nothing renders it, and every UI notion of "active
  participants" still excludes OOC on purpose.
- Players never mutate combat state directly. Player-initiated actions
  (`register_character`, `configure_deck`, `claim_character`,
  `release_claims`, `roll_submission`, `act`, `delay`, `interrupt`) are sent
  as a `session:command` and handled exclusively by the GM tab's
  `handleSessionCommand()`, which mutates the real `CombatManager` and its
  side-maps, then re-broadcasts. The server's role is authorization/schema
  gatekeeping only — it does not interpret or apply commands itself. What it
  gatekeeps, exactly: **room ownership** (the shared choke point above; this is
  the check `session:command` was missing, so a guessed room code was a live
  cross-room injection into another table's encounter), the
  `ALLOWED_COMMAND_TYPES` allowlist, payload shape and size, the role, and the
  `player` field matching the authenticated socket.
- `command.player` is a random opaque token minted client-side
  (`player-view.component.ts`'s `playerToken`), never a human name — it must
  never reach a log entry's actor or text. Every `handleSessionCommand`
  branch that logs a player-originated event attributes it to the
  *character* name instead (`target.name`, falling back to a non-token
  label when the name is empty or literally equals the sender's token), via
  `appendPlayerCommandLog`. The equivalent GM-button-triggered events (e.g.
  jacking a deck in/out, toggling Awakened status) go through
  `appendParticipantEventLog`, which writes to the shared log when a session
  is open and to the local Action Log only when it isn't, so shared-log
  coverage of an event doesn't depend on whether the player or the GM
  triggered it. Neither helper is the *only* place an actor name is built —
  `roll_submission`, `act`, `delay`, `interrupt`, and `dice_roll` still
  construct `target.name || "Player"` inline — so a new handler that logs a
  player-originated event should follow the same convention rather than
  falling back to `"GM"` or `command.player`.
- "Player-owned" (`participantOwners`), "claimable"
  (`participantClaimable`), and the tie-break inputs
  (`participantEdgeRatings`/`participantReactions`/`participantIntuitions`/
  `participantTieBreakers`) are **GM-component-local `Map<IParticipant, ...>`
  side-tables**, not fields on `Participant` and not part of
  `CombatManager`. They're keyed by object identity, so removing and
  re-adding a participant (e.g. the decker↔physical type swap in §6) always
  requires explicitly deleting and re-populating every side-map — the code
  does this manually at each such site; a new participant field of this
  kind would need the same discipline.
- On disconnect, the server itself does one piece of state surgery
  server-side: it strips `ownerName` from any participant the disconnecting
  player owned (if `claimable`), and rebroadcasts — this is the one place
  combat-adjacent state is touched outside the GM tab's own logic. That strip
  can be *undone* by the GM's own reconnect push: if the GM's socket was down
  when it happened, the GM tab still holds the old owner in
  `participantOwners` and pushes it back. The claim then belongs to a token no
  client holds, so `handleSessionCommand`'s `claim_character` branch replies
  with a `claim_denied` command naming the reason (shown only to the token in
  `payload.requester`), logs it GM-only, and the GM can clear the claim in one
  undoable tap via `btnReleaseClaim_Click`. Push-not-pull is unchanged; this is
  reconciliation *after* the push. The player end of that tap is
  `findReleasedOwnCharacters()` in the player view: a character the player owned
  in the previous state that is still present with no `ownerName` produces a
  one-line notice that the GM released it and it can be re-claimed. Without it
  the player's whole character panel simply vanished — the same silence
  `claim_denied` fixed for a refused claim. A participant that has *left* the
  encounter is deliberately not reported: that is a removal, not a release.
- Reconnect/rejoin (`joinAsGm`, `joinAsPlayer`) replays the last broadcast
  `state` and `log` from the server's in-memory snapshot. **Combat state is
  replayed verbatim with no reconciliation. The log is not.** A GM rejoin runs
  the server's log through `mergeHiddenLogEntries()`: entries the GM chose to
  keep off the wire (`hiddenFromPlayers`, written by `appendGmOnlyLog`) exist
  only in the GM tab's `sharedLogEntries`, so the server's history can never
  contain them and a verbatim replace would destroy them. The merge keeps the
  server list, re-adds any GM-local hidden entry whose `id` is not already in
  it, sorts the union by `timestamp`, and reseeds the local ordering sequence
  (`reseedLogOrder`) to the merged order. Consequences worth knowing before
  changing this: hidden entries are retained (not cleared) when a session drops
  unexpectedly (`handleSessionClosedExternally`) so a rejoin can merge them
  back. A deliberate `btnCloseShareSession_Click` now *also* retains them —
  close leaves the room rejoinable, so discarding the only copy of those entries
  at close time would destroy data the GM could still have merged back; the
  discard belongs to the destructive `btnEndShareSession_Click`, behind a
  confirmation, and `btnCreateShareSession_Click` likewise discards them only
  behind an explicit GM confirmation. Entry `timestamp` is therefore load-bearing for ordering, not
  just display. `restoreFromSharedState()` sets the turn/pass
  counters *before* rebuilding participants and then assigns each restored
  participant's `currentInitiativeScore` directly from the broadcast
  `initiativeScore` — the running Score is reconstructed from the transmitted
  value, never re-derived from the pass count, so it cannot desync from
  `initiativePass`. The rolled-dice total is reconstructed alongside it, from
  the broadcast `rolledInitiativeTotal` field, via
  `setDiceIniWithoutScoreChange()` (Score-neutral — the Score is restored
  separately and verbatim). This is what keeps `pendingRoll`
  (`getSharedParticipants()`: `diceIni <= 0`) and the GM roll button's
  `[disabled]="p.diceIni !== 0"` gate honest after a rejoin; without it a
  restored participant looks unrolled and a second Initiative Test would stack
  on an already-decayed Score. Belt-and-braces, `handleSessionCommand`'s
  non-delta `roll_submission` branch refuses a full Initiative Test for a
  participant who already has `diceIni > 0` while combat is started
  (rolled once per Combat Turn). A GM reconnecting after a crash gets back
  whatever was last successfully broadcast, and local undo history is not
  part of that snapshot (undo history is never sent to the server at all,
  so a page refresh loses undo/redo even though combat state survives via
  the snapshot). `restoreFromSharedState()` opens its own undo chapter and then
  calls `UndoHandler.Initialize()` at the end, so the rebuild is not itself
  undoable and cannot leave an open chapter for a later Ctrl+Z to walk into.
  It reconstructs the *correct participant class* from the broadcast
  `isMatrix`/`isAstral` flags (`MatrixParticipant` with its deck stats and VR
  mode, `AstralParticipant` with its projection flag) rather than rebuilding
  everyone as a plain `Participant`; health, damage and OOC participants are
  still not on the wire and still do not come back, and the GM is told so at
  restore time (`restoreWarning`). `ICParticipant` has no wire flag of its own
  and comes back as a `MatrixParticipant`.
- **Transport reconnect is push, not pull, on the GM side.** A reconnected
  socket is a new socket with no role, so every guarded emit is refused until it
  re-authenticates; nothing used to notice, and the GM ran combat against frozen
  player screens. The GM tab now listens for `session:error` and for the
  transport `connect` after a drop, re-emits `gm:join-session`, and then
  **pushes** its state with `syncSharedState()` — it must never call
  `restoreFromSharedState()` there, which would replace a live encounter with
  the lossier server copy. Players always pull (they hold no authoritative
  state).
- **The explicit Join button follows the same push-not-pull rule.** Whether
  `btnJoinShareSession_Click` pulls is decided by one question: *does this tab
  still hold the live encounter for that room code?* The GM component records
  the room its `CombatManager` belongs to in `liveEncounterRoomCode` (set on
  create and on join, kept across a Close, cleared only by an End), and pushes
  with `syncSharedState()` when that code matches the one being joined and the
  participant list is non-empty. This is what makes Close Room's own advice
  ("rejoin with code ABC123") safe: a mis-tapped Close followed by a rejoin from
  the same tab restores nothing and loses nothing. A fresh tab, a reloaded tab,
  or a join of a *different* code all still pull — the field is in-memory only,
  so a page load starts blank. The log is merged either way
  (`mergeHiddenLogEntries` is additive). **A pull that would overwrite something
  is confirmed first** (spec AC 15): if the tab does not hold the live encounter
  for that code but its `CombatManager` still has participants,
  `confirmDestructiveJoin()` names the count and what goes with it (damage,
  condition monitors, out-of-action participants, committed interrupts, undo
  history) before `restoreFromSharedState()` runs. Cancelling aborts before the
  `joinAsGm` call, so nothing local is touched. A tab with no participants is
  never prompted.
- **Undo/redo re-broadcast.** `btnUndo_Click`/`btnRedo_Click` call
  `syncSharedState()` after `UndoHandler.Undo()`/`Redo()`. Undo reverses
  player-visible state (a released claim being the case that made this a
  defect: reverted locally but not on the wire, so the GM and the players
  disagreed about who owned a character). They deliberately call
  `syncSharedState()` and *not* `sort()`: `sort()` runs
  `enforceSingleCurrentActor()`, whose `status` writes auto-open an undo chapter
  (§4) and so would clear the redo stack the undo just created.

## 8. Known rough edges

- **Dead first sort.** `sort()` calls `combatManager.participants
  .sortByInitiative()` and then immediately re-sorts the same array with
  `initiativeTieBreakComparator`. The first sort's result is fully
  discarded — harmless today since `Array.sort` is stable-enough for this
  to not matter, but it's wasted work and a second, separate tie-break
  implementation (`ParticipantList.initiativeComparator`) that no longer
  reflects the actual tie-break rule used anywhere in the app.
- **`StatusEnum.OOC` is dead.** The enum defines `OOC = 4`, but nothing in
  `src/` ever assigns it — "out of combat" is entirely driven by the
  computed `Participant.ooc` getter (health-threshold based), which is a
  different mechanism from `status`. A reader who sees `StatusEnum.OOC` and
  assumes it's how OOC is represented will be wrong.
- **`active`/`waiting`/`finished` booleans duplicate `status`.**
  `Participant` has both a `status: StatusEnum` and separate `active`,
  `waiting`, `finished` boolean fields. `CombatManager`/`ParticipantList`
  only ever touch `status`; nothing in `src/Combat` sets or reads the
  boolean trio, so either they're driven from elsewhere (UI) or are stale
  fields — worth confirming before relying on them.
- **Side-map bookkeeping is manual and easy to miss.** Every GM-local
  `Map<IParticipant, ...>` (`participantOwners`, `participantClaimable`,
  `participantEdgeRatings`, `participantReactions`, `participantIntuitions`,
  `participantTieBreakers`, `participantIds`, `lastKnownDamage`) has to be
  explicitly cleaned up any time a participant is removed or type-swapped
  (see `btnDelete_Click`, `upsertPlayerParticipant`'s type-mismatch branch).
  A new feature that adds another such map inherits this obligation with no
  compiler enforcement.
- **`hardReset()` is unreachable from the normal game loop.** It exists on
  `Participant` (zeroes damage and `baseIni`, and resets `dices` to 1 via
  `setDicesWithoutRoll`, in addition to `softReset()`'s work) but nothing in `CombatManager` or the GM component
  calls it — turn boundaries only ever call `softReset()`. If it's meant to
  back a "fully reset this character" UI action, that action doesn't
  currently exist or isn't wired to it.
- **`RULINGS.md` is currently empty.** `CLAUDE.md` directs agents to check
  it before deciding undefined rules cases, but there's nothing in it yet
  to check.
- **Interrupt list documentation drift** — see §5; `docs/
  APP_DOCUMENTATION.md`'s interrupt list is stale relative to
  `src/InterruptTable.ts`.
- **No PC/NPC field anywhere in the domain model** (§3) — if a future
  feature needs to branch on that distinction inside `Combat/`, there's
  currently nothing to key off; it would have to be threaded through from
  the GM-component side-maps or added fresh.

## Test coverage (as it stands)

Framework: Jasmine + Karma (`npm test`), config in `karma.conf.js`. The
Angular karma builder discovers spec files by globbing `src/**/*.spec.ts`
(`angular.json`'s `test` architect target, default `include`) — a spec file
placed outside `src/` (e.g. a top-level `tests/` directory) is silently never
compiled or run, confirmed by testing several explicit `--include` glob
variants against such a location, all of which matched zero tests. Anything
meant to run under `npm test` must live under `src/`.

6 spec files exist in the tree: `CombatManager.spec.ts`,
`app.component.spec.ts`, `battle-tracker.component.spec.ts`,
`condition-monitor.component.spec.ts`, `confirmation-dialog.component.spec.ts`,
and `src/scenarios/running-initiative-score.spec.ts` — the promoted brief
scenarios (S1-S3, p. 160/167/191, plus the recompute-from-base divergence
test) for the running-Initiative-Score feature, pulled out of
`CombatManager.spec.ts` into their own file so they read as a standalone
regression suite for that brief. `src/scenarios/` is the convention for any
future feature's promoted scenario tests, for the same reason —
`src/scenarios/npc-group-initiative.spec.ts` (S1-S8 of the linked-NPC-row
brief) follows it, with that feature's per-criterion tests in
`src/Grunts/npc-row.spec.ts`.
Tie-breaking (`initiativeTieBreakComparator`), the undo/redo chapter
mechanics, and the session-sync command-handling path
(`handleSessionCommand`) have no dedicated spec files as of this writing —
confirm current coverage with `npm test` rather than trusting this list to
stay accurate.
