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

Each participant computes its own current initiative on demand via
`Participant.getCurrentInitiative()`:

```text
diceIni + baseIni - wm - (initiativePass - 1) * 10 + actionIniModifier
```

- `diceIni`: sum of the rolled dice for this combat turn (set by
  `rollInitiative()`, cleared by `softReset()`).
- `baseIni`: Reaction + Intuition equivalent for a standard participant
  (default 6); recomputed by subclasses for Matrix/astral participants (§6).
- `wm`: wound modifier, computed live from physical/stun damage vs. pain
  tolerance (0 if `hasPainEditor` is true).
- `(initiativePass - 1) * 10`: the standard -10 per initiative pass after
  the first, read from `CombatManager.initiativePass` (with a `1` fallback
  if that's ever `undefined`).
- `actionIniModifier`: sum of `iniMod` for every entry in
  `actionHistory` (interrupts and declared actions that cost initiative —
  see §5).

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
`passEnded = false`, and flips every non-OOC, non-Delaying participant's
`status` back to `Waiting`. Delaying participants are left alone — they
carry their `Delaying` status across the pass boundary and re-enter
scheduling only when explicitly acted on.

**Turn boundary** (`endCombatTurn()`): resets `initiativePass` to 1, clears
`currentInitiative`, increments `combatTurn`, calls `softReset()` on every
participant (§3), and sets `started = false`. This is invoked automatically
from `endInitiativePass()` when `isOver()` is true — i.e. when no non-OOC
participant has positive current initiative left. `hasMoreIniPasses()` is a
separate check (any non-OOC participant with `currentInitiative - 10 > 0`)
used by UI to decide whether another pass is coming, but it is not itself
what triggers the turn boundary — `isOver()` is.

**What resets at a turn boundary** (via `softReset()`): `diceIni` → 0,
`edge` → false, `status` → `Waiting`, `actionHistory` → `[]`, and — if the
participant was not OOC, or `revive` is passed — `ooc` is cleared. Damage,
health, `baseIni`, and `dices` all persist across turns; they're untouched
by `softReset()`. Only `hardReset()` (not called anywhere in the turn/pass
lifecycle — it's a manual reset) also zeroes damage and stats.

**What resets at a pass boundary:** only `status` (Waiting/Delaying) and
`passEnded`/`initiativePass`. Rolled dice (`diceIni`), action history, and
edge stay — a participant keeps whatever initiative modifiers they
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
`stunDamage`.

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
`actionHistory`. Name collision handling appends an incrementing numeric
suffix (`"Ganger 1"`, `"Ganger 2"`, ...).

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
(`this.recording === false`), it auto-starts a chapter — so a bare property
set outside any explicit `StartActions()` still becomes its own
single-entry chapter.

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
`StartActions()` still get undo coverage per-property, just not batched —
each property write becomes its own chapter unless one is already open.

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

- `MatrixParticipant.applyJackInMode(mode, intuition)`: sets `dices` to
  4/3/1 for Hot-Sim/Cold-Sim/AR, sets `baseIni = dataProcessing +
  intuition`, and sets `blocksPhysicalActions = (mode !== AR)`.
- `AstralParticipant` doc comment states the same shape (INT×2 base, 1d6,
  `blocksPhysicalActions` while `astralProjecting`), gated the same way.

`blocksPhysicalActions` is explicitly *not* the same as `ooc` — per the
in-code comment on `MatrixParticipant`, a jacked-in decker stays fully
scheduled in initiative; only the action-planner UI is expected to hide
physical action categories while the flag is set. The combat engine itself
has no awareness of this flag (`CombatManager`/`ParticipantList` never
reference `blocksPhysicalActions`).

Both subclasses override `clone()` to copy their extra fields, because
`Participant.clone()` — used by `copyParticipant()` — only knows about base
fields and would otherwise silently downgrade a duplicated decker/astral
participant back to a plain `Participant`.

GM UI wiring (`battle-tracker.component.ts`) supports converting a
participant in place between plain/`MatrixParticipant` via
`promoteToMatrixParticipant`/`demoteToParticipant`, triggered by the
player-side `configure_deck` session command (§7) — this is a live type
swap on an existing list entry, not a separate registration path.

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
  `state` and `log` verbatim from the server's in-memory snapshot; there is
  no reconciliation logic — a GM reconnecting after a crash gets back
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
  `Participant` (zeroes damage, `baseIni`, `dices` in addition to
  `softReset()`'s work) but nothing in `CombatManager` or the GM component
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

Framework: Jasmine + Karma (`npm test`), config in `karma.conf.js`. Only 5
spec files exist in the whole tree: `CombatManager.spec.ts`,
`app.component.spec.ts`, `battle-tracker.component.spec.ts`,
`condition-monitor.component.spec.ts`, `confirmation-dialog.component.spec.ts`.
Tie-breaking (`initiativeTieBreakComparator`), the undo/redo chapter
mechanics, and the session-sync command-handling path
(`handleSessionCommand`) have no dedicated spec files as of this writing —
confirm current coverage with `npm test` rather than trusting this list to
stay accurate.
