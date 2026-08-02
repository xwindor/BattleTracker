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
and hold). **Note:** `InterruptTable` currently defines 14 entries (full
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

## 7. Session sync and its effect on combat state

Transport: `server.js` (Express + Socket.IO) relays events between one GM
socket and any number of player sockets in a room; combat state itself
never lives on the server beyond a last-known snapshot
(`sessions: Map<room, { state, log }>`, in-memory, lost on restart).

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
  derived, not authoritative.
- Players never mutate combat state directly. Player-initiated actions
  (`register_character`, `configure_deck`, `claim_character`,
  `release_claims`, `roll_submission`, `act`, `delay`, `interrupt`) are sent
  as a `session:command` and handled exclusively by the GM tab's
  `handleSessionCommand()`, which mutates the real `CombatManager` and its
  side-maps, then re-broadcasts. The server's role is authorization/schema
  gatekeeping only (`ALLOWED_COMMAND_TYPES` allowlist, payload shape/size
  checks, role checks, `player` field must match the authenticated
  socket) — it does not interpret or apply commands itself.
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
  combat-adjacent state is touched outside the GM tab's own logic.
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
  back, while a deliberate `btnCloseShareSession_Click` discards them, and
  `btnCreateShareSession_Click` discards them only behind an explicit GM
  confirmation. Entry `timestamp` is therefore load-bearing for ordering, not
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
  the snapshot).

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
future feature's promoted scenario tests, for the same reason.
Tie-breaking (`initiativeTieBreakComparator`), the undo/redo chapter
mechanics, and the session-sync command-handling path
(`handleSessionCommand`) have no dedicated spec files as of this writing —
confirm current coverage with `npm test` rather than trusting this list to
stay accurate.
