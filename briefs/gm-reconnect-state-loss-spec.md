# Spec: GM rejoin loses condition monitors, damage, downed combatants and turn state

## Request

Make a GM's pull-path rejoin (`btnJoinShareSession_Click` → `restoreFromSharedState`) reconstruct the encounter losslessly, by carrying participant-level condition-monitor state, damage, out-of-action combatants, turn state and grunt/row class identity on a **GM-only** transport channel that no player-reachable channel ever receives.

**Not in scope:** the transport-reconnect push path (`handleSessionReconnected` — already correct, must stay push-not-pull); any change to initiative rules, the -10 pass decay, tie-break ordering, or `CombatManager` state machine; any change to what players see (`SharedParticipantState` gains no new field, and the player-facing `participants` array is byte-identical to today); undo semantics or chaptering (undo is slated for removal — preserve the existing `StartActions()`/`Initialize()` bracket, add nothing); the Matrix host/target/mark GM workflow; player identity/accounts; `docs/UNVERIFIED-RULES.md` content.

**Not rules-dependent.** Every field named here is state the tracker already computes and already displays. No SR5 page citation is required, and no `RULINGS.md` entry is being decided — except Open Decision 2, which *reverses* an existing brief decision (NPC-group Decision 18, "`hasActed` is deliberately not on the session-sync wire") and therefore needs a `RULINGS.md` append if accepted.

---

## Current behaviour

### The two reconnect paths, and which one is broken

| Path | Trigger | Direction | Lossy? |
|---|---|---|---|
| Transport reconnect | server restart, wifi drop; GM tab stays open | **push** (`handleSessionReconnected`, `battle-tracker.component.ts:2501-2526`) | No |
| Explicit Join, tab holds the encounter | Close Room then rejoin same tab | **push** (`btnJoinShareSession_Click:1589-1645`) | No |
| Explicit Join, tab does **not** hold the encounter | page refresh, new browser, new device, second GM tab | **pull** (`:1647-1696` → `restoreFromSharedState`) | **Yes — this is the bug** |

`liveEncounterRooms` is a plain in-memory `Set<string>` (`battle-tracker.component.ts:711`) with no `localStorage`/`sessionStorage` backing anywhere in `src/` (verified by grep — the only `localStorage` use in the app is the player view's notify-mute key). A page reload therefore always empties it, so `holdsLiveEncounterFor(room)` is false and the Join takes the destructive pull. An ordinary Close does **not** clear the set (`resetShareStateAfterLeaving:2363-2407`, the `liveEncounterRooms.delete` is inside `if (discardHiddenEntries)`), which is why close-then-rejoin is safe.

### What is on the wire today

`SharedParticipantState` (`src/app/services/session-sync.service.ts:26-108`) carries exactly: `id`, `name`, `order`, `active`, `initiativeScore`, `playerControlled`, `claimable`, `ownerName`, `ooc`, `canAct`, `canDelay`, `canInterrupt`, `initiativeDice`, `pendingRoll`, `rolledInitiativeTotal`, `edgeRating`, `reaction`, `intuition`, `isNpcRow`, `isDetachedGrunt`, `rowMembers`, `rowWoundModifier`, `rowEverPopulated`, `isAstral`, `isAstralProjecting`, and the Matrix block. **Grep confirms zero occurrences of `physicalDamage`, `stunDamage`, `physicalHealth`, `stunHealth`, `overflowHealth`, `painTolerance`, `hasPainEditor`, `status`, `edge` or `actionHistory` in that file.**

`getSharedParticipants()` (`battle-tracker.component.ts:3179-3269`) opens with

```ts
.filter(p => !p.ooc || this.isClaimableOrOwnedOoc(p))
```

(`:3181`). `isClaimableOrOwnedOoc` (`:3102-3104`) is `participantClaimable.get(p) === true || participantOwners.has(p)`. A downed NPC satisfies neither, so it is dropped from the array before any mapping runs.

`SharedCombatState` (`session-sync.service.ts:138-210`) carries `round`, `pass`, `started`, `passEnded`, `currentInitiative`, `participants`, `oocParticipantCount`, `oocOwnership`, `matrixTargets`, `currentHostName`.

`syncSharedState()` (`battle-tracker.component.ts:3106-3162`) is the single broadcast choke point — every mutation path in the GM component reaches it (directly or via `sort()`, `:1099-1109`). It calls `sessionSync.broadcastState()` (`session-sync.service.ts:519-522`) → `session:update-state`.

### What the server does with it

`session:update-state` (`server.js:856-881`) validates only `typeof state.round === "number" && Array.isArray(state.participants)` (`isSharedState`, `:132-136`), caps at 64 KB, stores `session.state = state` verbatim (`:876`), `touchSession(room)` (`:877`), then broadcasts `playerFacingState(state)` (`:880`).

`playerFacingState()` (`:179-185`) strips exactly one key, `oocOwnership`, by shallow rest-spread.

The three **player-reachable** channels, exhaustively (verified by grepping `session:state|session\.state|playerFacingState` across `server.js`):

1. `server.js:880` — `session:update-state` room broadcast
2. `server.js:846` — `player:join` ack
3. `server.js:411` — `releasePlayerClaims` broadcast

The two **GM-only, per-socket** channels that return `session.state` *unstripped*:

4. `server.js:791` — `gm:create-session` ack
5. `server.js:818` — `gm:join-session` ack

`server/session-store.js` persists `{ version, room, lastActivity, state, log }` (`serialize`, `:266-274`) and reads back `{ state, log, lastActivity }` (`loadAll`, `:483-487`). `hasPersistableContent` (`:131-139`) gates on `state != null || log.length > 0`.

`releasePlayerClaims` (`server.js:377-419`) rewrites `session.state.participants` with `{ ...participant, ownerName: undefined }`, preserving every other field.

### What `restoreFromSharedState` rebuilds today

`restoreFromSharedState` (`battle-tracker.component.ts:3913-4036`) — the **only** production call site is `:1688`. It:

- opens `UndoHandler.StartActions()` (`:3923`) and ends with `UndoHandler.Initialize()` (`:4035`), so the rebuild is not undoable;
- clears nine side-maps (`:3925-3933`) and both participant lists (`:3935-3936`);
- restores turn/pass counters before participants (`:3942-3946`);
- for each entry, in order: `buildRestoredParticipant` → `name` → `setDicesWithoutRoll` → `setDiceIniWithoutScoreChange(restoredRolledTotal(...))` → `baseIni` → side-maps → `addParticipant(p, true)` → `currentInitiativeScore = shared.initiativeScore` + `appliedInitiativeAttribute = p.initiativeAttribute` → `sortOrder` → `lastKnownDamage` seed → `status = Active|Waiting` + `currentActors` → `ooc = true` if flagged;
- ends `sortBySortOrder()` and sets `restoreWarning = buildRestoreWarning()`.

`buildRestoredParticipant` (`:3853-3901`) reconstructs `NpcRowParticipant` (from `isNpcRow`), `MatrixParticipant` (from `isMatrix`), `AstralParticipant` (from `isAstral`), else plain `Participant`.

### Confirmed consequences, each traced to a line

1. **Damage and condition-monitor shape are gone.** `Participant`'s `_physicalDamage`, `_stunDamage`, `_physicalHealth` (default 10), `_stunHealth` (10), `_overflowHealth` (4), `_painTolerance` (0), `_hasPainEditor` (false) are set only by the constructor (`src/Combat/Participants/Participant.ts:482-507`). The restore never writes any of them, and none is on the wire.
2. **A downed non-claimable participant vanishes.** Filter at `:3181`. `Participant.ooc` (`Participant.ts:335-348`) derives from damage vs. health; `NpcRowParticipant.ooc` (`NpcRowParticipant.ts:228-230`) is `super.ooc || isWipedOut`; `DetachedGruntParticipant.ooc` (`:187-189`) is `_manualOoc || combinedDamage >= physicalHealth`.
3. **A wiped-out NPC row vanishes entirely, with its whole roster.** `isWipedOut` (`NpcRowParticipant.ts:175-177`) → `ooc` true → filtered at `:3181`. `rowMembers`, `rowWoundModifier`, `rowEverPopulated` and every member's final-attack record go with it. **This is the NPC-group half of the report.**
4. **An all-down encounter cannot be rejoined at all.** With every participant filtered, `state.participants.length === 0`; `snapshotHasEncounter` is still true via `oocParticipantCount` (`:2191-2207`), so `:1649` computes `replaced === false` and `:1661` calls `abandonJoinAndRestore` — the join is reversed with "…which are not broadcast and cannot be restored".
5. **Everyone who already acted this pass acts again.** `:4005-4010` writes only `Active` or `Waiting`. `CombatManager.getNextActors()` (`src/Combat/CombatManager.ts:195`) selects on `p.status === StatusEnum.Waiting`, so a restored `Finished` participant re-enters the pass.
6. **Delaying is lost.** Same lines; `Delaying` is not representable on the wire.
7. **`edge` is lost.** `_edge` is never written by the restore, and edge is the unconditional priority branch in `getNextActors()` (`CombatManager.ts:200`).
8. **`actionHistory` is lost.** `:4005` onward never writes it. The *number* survives because `getSharedParticipants` broadcasts `initiativeScore: p.getCurrentInitiative()` (`:3188`), which already includes `actionIniModifier`, and the restore assigns that to `currentInitiativeScore` with an empty history — the same fold-in convention `Participant.clone()` uses (`Participant.ts:534`). What is lost is `isInFullDefense()`, the persist gate in `canUseAction` (`Participant.ts:607-609`), and the ability to refund on undo.
9. **`DetachedGruntParticipant` comes back as a plain `Participant`.** `buildRestoredParticipant` has no branch for it; `isDetachedGrunt` exists on the wire but is documented presentation-only (`session-sync.service.ts:74-85`). Lost: `hasGruntConditionMonitor`, the combined-track `wm`/`ooc` overrides, `_gruntBody`, `_gruntWillpower`, `_lastDamageType`, `_lastDamageValue`, and therefore `finalState`.
10. **`ICParticipant` comes back as a `MatrixParticipant`.** No `isIC`/`icType`/`hostRating`/`linkedTargetId` on the wire (`src/Matrix/ICParticipant.ts:17-44`).
11. **`NpcRowParticipant.spentFlagged` is not in `NpcRowSnapshot`** (`NpcRowParticipant.ts:51-57, 462-468`), so a restored wiped-out row would re-announce its collapse. Currently masked by (3).
12. **`GruntMember.hasActed` is not in `GruntMemberSnapshot`** (`GruntMember.ts:114-121, 302-311`) — deliberate, per NPC-group Decision 18 (`GruntMember.ts:166-179`).
13. **`baseIni` is re-derived by a second, incomplete copy of the formula.** `:3970-3979` handles the jacked-in Matrix case (DP + INT) but has no astral branch, whereas `getParticipantBaseInitiative` (`:5084-5093`) returns `INT × 2` for a projecting `AstralParticipant`. A projecting magician's `baseIni` therefore comes back as REA+INT. The immediate Score is right (pinned verbatim at `:3997`), but the next `softReset()`/`resetInitiativeScore()` re-seeds from the wrong attribute, and every later wound delta is computed off the wrong base.
14. **The tie-break coin toss is re-rolled.** `participantTieBreakers` is cleared at `:3932` and never repopulated; `getParticipantTieBreaker` (`:6736-6740`) lazily assigns `Math.random()`.
15. **`lastKnownDamage` is seeded from the restored defaults** (`:4001-4004`), so the first post-restore damage edit logs a wrong delta through `flushDamageLog` (`:3643-3677`).
16. **PC condition-monitor sizes only come back if the player re-registers.** `upsertPlayerParticipant` writes `overflowHealth`/`physicalHealth`/`stunHealth` from the `register_character` payload (`:3735-3737`), but the player client sends that only from `createCharacter()` (`player-view.component.ts:271-289`), never automatically on reconnect (`rejoinAfterReconnect`, `:255-269`, pulls state only).

### What already works and must not regress

- **A row that is not wiped out restores correctly.** `NpcRowParticipant.toRowSnapshot`/`restoreRowSnapshot` (`:462-494`) and `GruntMember.toSnapshot`/`fromSnapshot` (`:302-335`) round-trip name, Body, Willpower, filled boxes, `lastDamageType`, `lastDamageValue`, `rowWoundModifier`, `everPopulated`. Covered by `src/Grunts/npc-row.spec.ts:1009-1047` ("restores a linked NPC row from the shared state as a row (D4)"). **This closes the open question in `docs/FEATURE-BACKLOG.md` line 145-156 ("re-verify the row-member restore path specifically as step 1"): the row path is sound; the live symptom was (3), not a row-snapshot defect.**
- **`handleSessionReconnected` pushes and never pulls** (`:2501-2526`), asserted by `src/scenarios/persistent-rooms.spec.ts:1408-1412`.
- **The GM tab never consumes `session:state`.** `attachShareListeners` (`:2409-2433`) registers `onCommand`/`onLog`/`onSessionClosed`/`onError`/`onDisconnect`/`onReconnect` and no `onState`. Grep confirms `onState(` has exactly one caller, `player-view.component.ts:176`.

---

## Affected paths

### Must change

**`src/app/services/session-sync.service.ts`**
1. Add `SharedActionState`, `SharedGmParticipantState`, `SharedGmState` interfaces (shapes in "Serialisation contract" below).
2. Add `broadcastGmState(gmState: SharedGmState)` — emits `session:update-gm-state` with `{ room: this.currentRoom, gmState }`; same `if (!this.currentRoom) return;` guard as `broadcastState` (`:519-522`).
3. Widen `joinAsGm`'s return type and ack destructuring to `{ state, log, gmState }` (`:475-482`); default `gmState` to `null` when the server omits it.
4. Widen `createSession`'s ack likewise only if it already returns state — it does not (`:463-473`); **leave `createSession` unchanged**.
5. Leave `SharedParticipantState` and `SharedCombatState` **unchanged**. No new field on either.

**`src/app/battle-tracker/battle-tracker.component.ts`**
6. `syncSharedState()` (`:3106-3162`) — after `sessionSync.broadcastState(sharedState)` (`:3144`), call `this.sessionSync.broadcastGmState(this.buildGmState())`. This is the single choke point; do not add the emit at any other call site.
7. New private `buildGmState(): SharedGmState`.
8. New private `buildGmParticipantState(p: IParticipant): SharedGmParticipantState`.
9. `getSharedParticipants()` (`:3179-3269`) — **unchanged.** The OOC filter at `:3181` stays exactly as it is; withheld participants are carried by `SharedGmState.withheldParticipants` instead.
10. `restoreFromSharedState(state)` (`:3913-4036`) — change signature to `restoreFromSharedState(state, gmState: SharedGmState | null = null)`; merge and apply per the rehydration contract below.
11. `buildRestoredParticipant(shared)` (`:3853-3901`) — change signature to `buildRestoredParticipant(shared, gm: SharedGmParticipantState | undefined)`; add the `DetachedGruntParticipant` branch and the `ICParticipant` branch.
12. New private `restoredBaseIni(shared, gm, participant): number` — replaces the inline formula at `:3970-3979`; must handle plain, jacked-in Matrix, and projecting astral. Prefer `gm.baseIni` verbatim when present.
13. New private `resolveRestoredAction(entry: SharedActionState): Action` — maps a wire entry back to the **identity-shared** `interruptTable` object by `key` (`src/InterruptTable.ts`), falling back to a fresh object only for an unknown key. Required because `Participant.canUseAction`'s persist check is `this._actionHistory.includes(action)` — object identity (`Participant.ts:607-609`), and `ActionHandler.coreInterrupts` holds the same references (`src/Combat/ActionHandler.ts:28-33`).
14. `buildRestoreWarning()` (`:4063-4070`) — reword; must now be conditional on whether a `gmState` was present.
15. `btnJoinShareSession_Click()` (`:1531-1725`) — destructure `gmState` from `joinAsGm`; pass it to `restoreFromSharedState` at `:1688`; compute `snapshotHasEncounter`/`replaced` from the merged roster so the all-down abandon branch at `:1649-1665` is not reached for new-format snapshots.
16. `snapshotHasEncounter(state)` (`:2191-2197`) — add a `gmState` parameter; return true when `gmState.withheldParticipants.length > 0` as well.
17. `handleSessionReconnected()` (`:2501-2526`) — **unchanged.** It calls `syncSharedState()` (`:2518`), which now carries the GM state automatically. Do not add a pull.
18. `confirmDestructiveJoin()` (`:1860-1906`) — update the discard text at `:1887-1892`; "damage and condition monitors" now genuinely go, so the wording gets *stronger*, not weaker.

**`src/Grunts/NpcRowParticipant.ts`**
19. `NpcRowSnapshot` (`:51-57`) — add `spentFlagged: boolean`.
20. `toRowSnapshot()` (`:462-468`) — emit `spentFlagged: this._spentFlagged`.
21. `restoreRowSnapshot()` (`:485-494`) — apply `this.spentFlagged = snapshot.spentFlagged === true` **after** members are added (so `flagSpentNpcRows` does not re-announce).

**`src/Grunts/GruntMember.ts`**
22. `GruntMemberSnapshot` (`:114-121`) — add `hasActed: boolean` (Open Decision 2).
23. `toSnapshot()` (`:302-311`) — emit `hasActed: this._hasActed`.
24. `fromSnapshot()` (`:321-335`) — `member.Set("hasActed", snapshot.hasActed === true)`.

**`server.js`**
25. New handler `socket.on("session:update-gm-state", ({ room, gmState } = {}) => {...})` — placed immediately after `session:update-state` (`:881`). Must: validate with a new `isGmState(v)` (`v && typeof v === "object" && Array.isArray(v.participants)`); cap `JSON.stringify(gmState).length` at 64 KB with `reject(socket, "session:update-gm-state", "payload-too-large: gmState")`; `if (!room) return;`; `const session = getOrCreateSession(room); session.gmState = gmState; touchSession(room);` **and emit nothing.** This is write-only; there is no broadcast.
26. `touchSession`'s doc comment (`:319-334`) — the count changes from 5 to 6; update the prose and the three `// write site N of 5` comments at `:817`, `:877`, `:902`, `:978`, `:1027`.
27. `gm:join-session` ack (`:818`) — add `gmState: session.gmState || null`.
28. `gm:create-session` ack (`:791`) — add `gmState: null` for shape symmetry.
29. `player:join` ack (`:846`) — **unchanged**; it must never carry `gmState`.
30. `playerFacingState()` (`:179-185`) — **unchanged**; `gmState` is not on `state` at all, so there is nothing to strip. Add a one-line comment saying so, pointing at the new handler.
31. `releasePlayerClaims()` (`:377-419`) — **unchanged**; `gmState` holds no ownership.
32. `getOrCreateSession` (`:298`) — initialise `gmState: null` on the created session object.

**`server/room-guards.js`**
33. `ROOM_SCOPED_EVENTS` — add `[ "session:update-gm-state", { roles: [ "gm" ] } ]` alongside `session:update-state`/`session:append-log` (`:~380-413`). Note: default-deny by payload shape already covers it, but the explicit entry is what pins it to **gm-only** rather than the `DEFAULT_ROOM_SCOPED_ROLES` gm-or-player fallback.

**`server/session-store.js`**
34. `serialize()` (`:266-274`) — add `gmState: session.gmState === undefined ? null : session.gmState`.
35. `loadAll()` (`:483-487`) — add `gmState: doc.gmState === undefined ? null : doc.gmState`.
36. `hasPersistableContent()` (`:131-139`) — add `if (session.gmState !== null && session.gmState !== undefined) return true;`.
37. `STORE_FORMAT_VERSION` (`:23`) — leave at 1. The added key is additive and both directions default it; bumping would require a migration path for no benefit.

### Must change, documentation

38. `ARCHITECTURE.md` §7 — rewrite "What is still *not* on the server" and the `restoreFromSharedState()` paragraph; add a "The GM-only channel" subsection describing `session:update-gm-state` and why it is a separate channel rather than a stripped field.
39. `ARCHITECTURE.md` §6 — "Still not reconstructed on rejoin: `DetachedGruntParticipant` and `ICParticipant`" becomes obsolete; and "Row members' Condition Monitors are therefore the **one** kind of damage that survives a rejoin" becomes false.
40. `ARCHITECTURE.md` §8 — remove the "Grunt reconstruction gaps on rejoin" bullet.
41. `docs/FEATURE-BACKLOG.md` — close "HIGH PRIORITY — Participant-level damage is not on the session-sync wire at all" (lines 126-256) and the "Durable rooms — what a restore still cannot bring back" section's options (c)/(d) (lines 412-440), pointing both at this brief. Record explicitly that the 2026-08-07 "re-verify the row-member path" doubt was checked and the row path was sound.
42. `docs/APP_DOCUMENTATION.md` — add `session:update-gm-state` to the socket event catalog.
43. `RULINGS.md` — append the Decision 18 reversal if Open Decision 2 is accepted.

### Searched and found only one — no hidden siblings

- **`restoreFromSharedState` has exactly one production caller**: `battle-tracker.component.ts:1688`. All other occurrences (`:756, 1497, 1670, 1838, 1885, 2177, 2497, 4051`) are comments; the rest are spec files.
- **`getSharedParticipants` has exactly one production caller**: `:3117`, inside `syncSharedState`.
- **`syncSharedState` is the only broadcast site.** `sessionSync.broadcastState` has exactly one caller (`:3144`). This is why criterion 6 above places the GM emit there and nowhere else.
- **`session:state` reaches players from exactly three server sites** (`server.js:411, 846, 880`) and the GM from exactly two acks (`:791, 818`). Enumerated by grep; there is no fourth.
- **`onState` has exactly one subscriber in `src/`**: `player-view.component.ts:176`.

### Deliberately unchanged, named so nobody "fixes" them

- `participantOwners` / `ownershipByRoom` / `switchActiveOwnershipRoom` / `reconcileOwnershipFromServer` — ownership is server-collaborative and already reconciled correctly (ARCHITECTURE §7, D-A round 7). Do not put ownership in `gmState`.
- `hiddenLogEntriesByRoom` / `mergeHiddenLogEntries` — the log is already merged additively on rejoin.
- `UndoHandler` history — never leaves the browser, and undo is slated for removal.
- `pendingVrModes`, `expandedRowPanels`, `rowMemberDamageValues`, `declaredActionSelections`, `selectedActor`, `actModalParticipant` — transient GM UI state, not encounter state.
- `oocParticipantCount` — keep it; old snapshots still need it for `snapshotHasEncounter`.
- `isDetachedGrunt` on `SharedParticipantState` — stays presentation-only for the player badge. Reconstruction reads `gmState.isGrunt`, not this flag, so the player-facing field keeps its single documented meaning.

---

## Proposed approach

**One private channel, not a widened broadcast.** Two designs were considered:

- *(A) Widen `SharedParticipantState` and strip fields server-side in `playerFacingState()`.* Rejected. `playerFacingState` is a **denylist** — every future sensitive field has to remember to opt in, which is precisely the drift shape ARCHITECTURE §7 records rounds 3-8 of. It is also unsafe across a deploy: a new GM tab talking to a not-yet-restarted server would broadcast damage to every player.
- *(B, chosen) A separate GM-only event `session:update-gm-state`, stored as `session.gmState`, returned only in the `gm:join-session` ack.* It is an **allowlist by construction**: there is no code path from `gmState` to a player socket, so a future handler cannot leak it by forgetting a rule. It degrades safely across a deploy — an old server has no listener for the event, `authorizeRoomPacket` authorizes-then-drops it, nothing is stored, and the GM simply gets today's lossy restore.

**Everything rides the existing choke point.** The GM emit goes inside `syncSharedState()` and nowhere else, so all ~50 mutation paths in the component are covered by one line. There is deliberately no second "remember to also push GM state" obligation anywhere in the file.

**Two lists, one type.** `gmState.withheldParticipants` reuses `SharedParticipantState` verbatim rather than inventing a second participant shape — this is the specific "second serialisation format / `PARTICIPANT_BASE_BACKING_FIELDS` drift" objection recorded against option (d) in the backlog, and reusing the type answers it. `gmState.participants` carries only the *extra* fields, keyed by `id`.

**Restore merges before it rebuilds.** `restoreFromSharedState` concatenates `state.participants` with `gmState.withheldParticipants`, sorts by `order`, and looks each entry's GM extras up by `id`. Duplicate `id`s (a claimable OOC participant appearing in both) resolve to the `state.participants` copy.

---

## Serialisation contract

New types in `src/app/services/session-sync.service.ts`:

```ts
/** One committed Interrupt Action, flattened for the wire. Mirrors `Interfaces/Action`. */
export interface SharedActionState {
  key: string;
  iniMod: number;
  persist?: boolean;
  martialArt?: boolean;
  edge?: boolean;
}

/** GM-only per-participant rehydration data. Keyed to a participant by `id`. */
export interface SharedGmParticipantState {
  id: string;

  // Condition Monitor shape and contents.
  physicalHealth: number;
  stunHealth: number;
  overflowHealth: number;
  physicalDamage: number;
  stunDamage: number;
  painTolerance: number;
  hasPainEditor: boolean;

  // Score bookkeeping, restored verbatim rather than re-derived.
  // `currentInitiativeScore` is the RAW backing field, NOT getCurrentInitiative().
  baseIni: number;
  currentInitiativeScore: number;
  appliedInitiativeAttribute: number;

  // Turn state.
  status: number;            // StatusEnum
  edge: boolean;
  actionHistory: SharedActionState[];
  ooc: boolean;              // the MANUAL flag only, not the derived getter
  tieBreaker: number;

  // DetachedGruntParticipant.
  isGrunt?: boolean;
  gruntBody?: number;
  gruntWillpower?: number;
  lastDamageType?: "physical" | "stun" | null;
  lastDamageValue?: number;

  // ICParticipant.
  isIC?: boolean;
  icType?: string;
  hostRating?: number;
  linkedTargetId?: string;

  // NpcRowParticipant extras not already in SharedParticipantState.rowMembers.
  rowSpentFlagged?: boolean;
}

/** The GM-only half of a room snapshot. Never reaches a player socket. */
export interface SharedGmState {
  version: 1;
  /**
   * Participants `getSharedParticipants()` withholds as out-of-action and
   * non-claimable. Same type as the player-facing entries on purpose: one
   * participant shape, no second format to drift.
   */
  withheldParticipants: SharedParticipantState[];
  participants: SharedGmParticipantState[];
}
```

`SharedGruntMemberState` (`session-sync.service.ts:15-24`) gains `hasActed?: boolean` (Open Decision 2). It rides the existing `rowMembers` field on the **player-facing** entry — which is acceptable because `rowMembers` already carries member damage today and players never render it; do not move it.

### Broadcast contract — `buildGmState()`

```
withheldParticipants = combatManager.participants.items
    .filter(p => p.ooc && !isClaimableOrOwnedOoc(p))
    .map(p => <the same object getSharedParticipants() would build for p>)
```
Extract the per-participant mapping body of `getSharedParticipants()` (`:3183-3267`) into a private `buildSharedParticipant(p, index)` and call it from both places. `order` for a withheld participant is its index in the **full** `combatManager.participants.items` array + 1, so the merged restore sorts correctly against the player-facing entries (whose `order` stays the post-filter index — see AC 8 for the reconciliation rule).

`participants` = one `SharedGmParticipantState` per entry in `combatManager.participants.items` (**all** of them, withheld or not), built by `buildGmParticipantState(p)`:

| Field | Source |
|---|---|
| `id` | `getParticipantId(p)` |
| `physicalHealth` / `stunHealth` / `overflowHealth` | `p.physicalHealth` / `p.stunHealth` / `p.overflowHealth` |
| `physicalDamage` / `stunDamage` | `p.physicalDamage` / `p.stunDamage` |
| `painTolerance` / `hasPainEditor` | direct |
| `baseIni` | `p.baseIni` |
| `currentInitiativeScore` | `p.currentInitiativeScore` — the raw backing field |
| `appliedInitiativeAttribute` | `p.appliedInitiativeAttribute` |
| `status` | `p.status` (numeric `StatusEnum`) |
| `edge` | `p.edge` |
| `actionHistory` | `p.actionHistory.map(a => ({ key, iniMod, persist, martialArt, edge }))` |
| `ooc` | the **manual** flag. There is no public getter for it (`Participant._ooc` is private and `DetachedGruntParticipant._manualOoc` is a separate private). Derive it as `p.ooc && !isDamageDerivedOoc(p)` via a new private helper, or add a `manualOoc` getter to `IParticipant`. **Recommended: add `get manualOoc(): boolean` to `Participant` (returns `this._ooc`) and override it on `DetachedGruntParticipant` (returns `this._manualOoc`)** — cleaner than reverse-deriving, and it is a read-only getter so it needs no `Undoable.Set` plumbing. |
| `tieBreaker` | `getParticipantTieBreaker(p)` |
| `isGrunt`/`gruntBody`/`gruntWillpower`/`lastDamageType`/`lastDamageValue` | set only when `hasGruntConditionMonitor(p)` |
| `isIC`/`icType`/`hostRating`/`linkedTargetId` | set only when `p instanceof ICParticipant` |
| `rowSpentFlagged` | set only when `isNpcRow(p)`; `p.spentFlagged` |

### Rehydration contract — order is load-bearing

`restoreFromSharedState(state, gmState)`. Build `const gmById = new Map(gmState?.participants.map(g => [g.id, g]) ?? [])` and

```
const merged = dedupeById([...state.participants, ...(gmState?.withheldParticipants ?? [])])
                 .sort((a, b) => a.order - b.order);
```
where `dedupeById` keeps the **first** occurrence (i.e. the `state.participants` copy wins).

Then, per entry, **in exactly this order**:

1. `const gm = gmById.get(shared.id)`
2. `participant = buildRestoredParticipant(shared, gm)` — the class branch. Order inside it: `isNpcRow` → `gm?.isIC` → `shared.isMatrix` → `shared.isAstral` → `gm?.isGrunt` → plain. For the grunt branch, call `setGruntAttributes(gm.gruntBody, gm.gruntWillpower)` **inside** the branch — it sizes `physicalHealth`/`stunHealth` from p. 379's formula and must run before any damage is written.
3. `participant.name = shared.name`
4. **Condition-monitor shape.** If `hasGruntConditionMonitor(participant)` — do **not** write `physicalHealth`/`stunHealth` from the wire; step 2 already sized them and a second write would fight `syncConditionMonitorToAttributes`. Otherwise write `participant.overflowHealth = gm.overflowHealth`, `participant.physicalHealth = gm.physicalHealth`, `participant.stunHealth = gm.stunHealth`. When `gm` is absent, leave constructor defaults (legacy behaviour).
5. `participant.painTolerance = gm.painTolerance`; `participant.hasPainEditor = gm.hasPainEditor`
6. `participant.physicalDamage = gm.physicalDamage`; `participant.stunDamage = gm.stunDamage`
7. `participant.setDicesWithoutRoll(shared.initiativeDice || 1)`
8. `participant.setDiceIniWithoutScoreChange(restoredRolledTotal(shared, participant))`
9. `participant.baseIni = restoredBaseIni(shared, gm, participant)`
10. side-maps: owners, claimable, edgeRatings, reactions, intuitions, ids — as today (`:3981-3988`) — **plus** `participantTieBreakers.set(participant, gm.tieBreaker)` when `gm` is present
11. `combatManager.addParticipant(participant, true)`
12. **Pin the Score, last of everything that moves it.** If `gm` is present: `participant.currentInitiativeScore = gm.currentInitiativeScore` and `participant.appliedInitiativeAttribute = gm.appliedInitiativeAttribute`. Otherwise fall back to today's `shared.initiativeScore` + `participant.initiativeAttribute` (`:3995-3999`).
13. `for (const a of gm.actionHistory) participant.doAction(resolveRestoredAction(a))` — pushes onto the history without touching `currentInitiativeScore`, so `getCurrentInitiative()` reproduces the pre-crash effective Score exactly.
14. `participant.sortOrder = Math.max(0, Number(shared.order || 1) - 1)`
15. `lastKnownDamage.set(shared.id, { physical: participant.physicalDamage, stun: participant.stunDamage })` — now seeded from the **restored** values, closing defect 15.
16. Status and current-actor membership:
    - if `shared.active` → `participant.status = StatusEnum.Active`; `currentActors.insert(participant, false)`
    - else if `gm` present → `participant.status = gm.status`, **except** never `Active` (coerce `Active` → `Waiting`; `currentActors` membership is what `shared.active` is authoritative for)
    - else → `participant.status = StatusEnum.Waiting`
17. `if (gm ? gm.ooc : shared.ooc === true) participant.ooc = true;`
18. `if (isNpcRow(participant) && gm?.rowSpentFlagged) participant.spentFlagged = true;`

Row members' `hasActed` is restored inside `restoreRowSnapshot` at step 2, from `rowMembers[].hasActed`.

**Why step 12 comes after steps 4-9:** the `physicalDamage`, `stunDamage`, `painTolerance`, `hasPainEditor` and `baseIni` setters each call `syncInitiativeAttribute()` (`Participant.ts:417-430, 382-385, 273-278, 152-157`), which applies a signed delta to the running Score. Pinning the Score before them would be silently overwritten; pinning after makes them all no-ops for the Score. Getting this backwards shifts every wounded combatant's position in the initiative order.

`UndoHandler.StartActions()` at the top and `UndoHandler.Initialize()` at the bottom are **unchanged** — every new write above lands inside the same discarded chapter.

---

## Acceptance criteria

1. A GM whose tab is closed mid-fight and who rejoins by room code gets back every participant with `physicalDamage`, `stunDamage`, `physicalHealth`, `stunHealth`, `overflowHealth`, `painTolerance` and `hasPainEditor` byte-identical to the values held when the last broadcast was sent.
2. A downed, non-claimable participant (`p.ooc === true`, `isClaimableOrOwnedOoc(p) === false`) is present in the encounter after the rejoin, still `ooc`, with its damage.
3. An `NpcRowParticipant` whose every member is out of action (`isWipedOut === true`) is present after the rejoin, as an `NpcRowParticipant`, with every member's name / Body / Willpower / filled boxes / `lastDamageType` / `lastDamageValue`, with `rowWoundModifier` and `everPopulated` intact, and with `spentFlagged === true` so it is not re-announced.
4. Healing a member of a restored wiped-out row back below its box count clears `ooc` and `spentFlagged` and lets the row act again, exactly as it does without a rejoin.
5. An encounter in which **every** participant is out of action rejoins successfully and restores in full. `abandonJoinAndRestore` is not reached.
6. `restoreFromSharedState` restores `status` verbatim (except that a non-`shared.active` participant is never `Active`), so a participant who was `Finished` this pass is not re-offered by `CombatManager.getNextActors()`, and a `Delaying` participant comes back `Delaying`.
7. `edge`, `actionHistory` and the tie-break value round-trip. A participant on Full Defense comes back with `isInFullDefense() === true`, and `canUseAction(fullDefense)` returns `false` for them.
8. For every restored participant, `getCurrentInitiative()` equals its pre-crash value, and the derived order after `sort()` is identical to the pre-crash order.
9. A `DetachedGruntParticipant` (standalone or detached) comes back as a `DetachedGruntParticipant`: `hasGruntConditionMonitor(p) === true`, `gruntBody`/`gruntWillpower` intact, single combined track of `8 + ceil(max(B,W)/2)` boxes, `overflowHealth === 0`, and `finalState` returns the same verdict as before the rejoin.
10. An `ICParticipant` comes back as an `ICParticipant` with `icType`, `hostRating` and `linkedTargetId` intact (Open Decision 5).
11. An `AstralParticipant` with `astralProjecting === true` comes back with `baseIni === intuition * 2`, not `reaction + intuition`.
12. Each `GruntMember`'s `hasActed` round-trips (Open Decision 2).
13. **`SharedParticipantState` and `SharedCombatState` gain no new field.** A `session:state` payload captured after this change is structurally identical to one captured before it, for the same encounter.
14. `gmState` never reaches a player. Asserted three ways: `player:join`'s ack contains no `gmState` key; no `io.to(room).emit` anywhere in `server.js` carries it; `session:update-gm-state` has no broadcast in its handler.
15. `session:update-gm-state` is refused for a socket whose `socket.data.role !== "gm"`, and for a socket whose `socket.data.room` differs from the packet's `room`.
16. `gmState` is persisted with the room and survives a process restart: after `store.flushAll()` and `loadAll()`, `sessions.get(room).gmState` deep-equals what was pushed.
17. Joining a room persisted **before** this change (no `gmState` on disk) succeeds and behaves exactly as it does today, with `restoreWarning` set to the legacy text.
18. Joining a room persisted **after** this change sets `restoreWarning` to text that no longer claims damage or condition monitors were lost.
19. A transport reconnect (`handleSessionReconnected`) still pushes and never calls `restoreFromSharedState`, and now also pushes `gmState`.
20. `restoreFromSharedState` leaves `UndoHandler.pastHistory` and `futureHistory` empty; the GM's first post-restore edit is one undo step and undoing it does not reach into the restore.
21. A `session:update-gm-state` payload larger than 64 KB is refused with `payload-too-large: gmState`, and **`session.gmState` is cleared to `null`**, not left holding whatever was previously stored (amended 2026-08-19, review defect D7 — see below). The same applies to an `invalid-payload: gmState` refusal.
22. `npm run lint` and `npm test` pass.

---

## Regression risk

| Risk | Why | Covering tests today |
|---|---|---|
| **Damage leaks to players.** The single worst outcome. | Any `gmState` field accidentally attached to `SharedCombatState` would ride `session:state`. | None. AC 13/14 must add them. |
| **Initiative order shifts silently.** | Damage setters move the running Score (`syncInitiativeAttribute`). Wrong ordering in the rehydration contract shifts everyone. | `src/scenarios/running-initiative-score.spec.ts`; `battle-tracker.component.spec.ts:115-240` (restore + `pendingRoll`/Score). AC 8 must add a full-order assertion. |
| **Row restore regresses.** | `NpcRowSnapshot` and `GruntMemberSnapshot` both gain a field; `restoreRowSnapshot` gains a write after the members. | `src/Grunts/npc-row.spec.ts:1009-1047` (D4 round trip) — must still pass unchanged. |
| **`flagSpentNpcRows` re-announces a restored wiped-out row.** | `spentFlagged` is what suppresses the repeat (`CombatManager.ts:375-416`). | `src/Grunts/npc-row.spec.ts` Decision 14/21 tests. AC 3. |
| **Full Defense becomes re-selectable.** | `canUseAction`'s persist check is object identity against `interruptTable`. A JSON-rebuilt action object fails `includes()`. | None. AC 7 must add it. |
| **Restore no longer discards its own undo chapter.** | More writes inside the same bracket; a stray `StartActions()` would split it. | `src/scenarios/persistent-rooms.spec.ts` S3. AC 20. |
| **All-down join changes behaviour.** | The `abandonJoinAndRestore` branch (`:1649-1665`) stops firing for new snapshots. | `src/scenarios/persistent-rooms.spec.ts:4389, 4562, 4694, 4729, 4753` all construct `{ participants: [], oocParticipantCount: N }` — these describe **legacy** snapshots and must keep passing unchanged. AC 5 and AC 17. |
| **`restoreWarning` text assertions break.** | `persistent-rooms.spec.ts:1676-1681` asserts it contains `'damage'`, `'out of action'`, `'undo history'`. | Those tests must be split into legacy-snapshot (unchanged text) and new-snapshot (new text) cases. |
| **`touchSession` write-site count drifts.** | ARCHITECTURE §7 and five in-file comments name "5 of 5". | None. Update all six sites; the doc already warns to re-count with grep rather than trust the comments. |
| **Payload size.** | `gmState` roughly doubles the per-participant bytes. 50 participants ≈ 12 KB, well under 64 KB. | AC 21. |
| **Player view visual regression.** | Should be zero — `getSharedParticipants` and `SharedParticipantState` are untouched. | `player-view` has no spec file; AC 13 is the structural guard. |
| **Deploy skew.** | New GM tab + old server: the event has no listener, `authorizeRoomPacket` authorizes then Socket.IO drops it, nothing is stored. Old GM tab + new server: no `gmState` pushed, `session.gmState` stays `null`, legacy restore. Both degrade to today's behaviour; neither leaks. | Worth one unit test on the client for `gmState: undefined` in the ack (AC 17). |

New spec file: **`src/scenarios/gm-reconnect-state-loss.spec.ts`** — `src/scenarios/` is the repo convention for promoted brief scenarios, and Karma only globs `src/**/*.spec.ts` (ARCHITECTURE, "Test coverage").

---

## Scenarios to survive

### S1 — Ordinary case: mid-fight browser refresh

```
GIVEN combat started, turn 1, pass 2
  AND "Street Sam"  physicalDamage 4, stunDamage 5, physicalHealth 11, stunHealth 10, status Finished
  AND "Ganger"      physicalDamage 3, status Waiting
  AND the GM has pushed state (syncSharedState) after the last damage edit
WHEN the tab's CombatManager is emptied (simulating a reload)
  AND restoreFromSharedState(capturedState, capturedGmState) runs
THEN "Street Sam".physicalDamage === 4 and .stunDamage === 5
  AND "Street Sam".physicalHealth === 11 and .stunHealth === 10
  AND "Street Sam".status === StatusEnum.Finished
  AND CombatManager.getNextActors() does NOT select "Street Sam"
  AND both participants' getCurrentInitiative() equal their pre-restore values
  AND component.restoreWarning does not contain "damage"
```

### S2 — Edge case: a wiped-out NPC group, and an all-down table

```
GIVEN a row "Gangers" with members G1 (Body 3) and G2 (Body 3)
  AND applyRowMemberDamage fills G1's track with physical DV 9
  AND applyRowMemberDamage fills G2's track with stun DV 4
  AND flagSpentNpcRows() has run, so row.spentFlagged === true and row.ooc === true
  AND the row is the ONLY participant in the encounter
WHEN getSharedParticipants() runs
THEN it returns []           // unchanged: the player-facing filter still withholds it
  AND buildGmState().withheldParticipants has length 1
WHEN restoreFromSharedState(state, gmState) runs
THEN a participant named "Gangers" exists AND isNpcRow(it) is true
  AND it has 2 members named G1, G2, both outOfAction
  AND G1.finalState === 'dead'   AND G2.finalState === 'alive'
  AND it.spentFlagged === true   AND it.ooc === true
  AND flagSpentNpcRows() returns []   // no duplicate announcement
WHEN component.healRowMember(row, G2, 4) heals G2 back up
THEN row.ooc === false AND row.spentFlagged === false AND the row can act again
```

### S3 — Undo: the restore is not walkable, the next edit is

```
GIVEN restoreFromSharedState(state, gmState) has just run for a 3-participant encounter
THEN UndoHandler has no undoable history   // Initialize() at :4035
WHEN the GM sets participants[0].physicalDamage = 7 through the Condition Monitor
  AND presses Ctrl+Z (btnUndo_Click)
THEN participants[0].physicalDamage returns to its restored value, not to 0
  AND the participant count is still 3
  AND no pre-restore participant reappears
  AND getCurrentInitiative() returns to its restored value
```

### S4 — Live at the table: GM's laptop dies mid-combat, five players waiting

```
GIVEN room ABC123, combat turn 2, pass 3
  AND "Wraith"  (claimable, owned by pl-1) physicalDamage 9, stunDamage 2, status Active, on Full Defense
  AND "Rigger"  (claimable, owned by pl-2) status Delaying, edge true
  AND "Lone Ganger" (DetachedGruntParticipant, Body 5, Willpower 3)
        combinedDamage 10 == its 11-box track minus 1, lastDamageType 'physical', lastDamageValue 4
  AND "Sec Guards" (row, 4 members, 2 of them down, rowWoundModifier 3)
  AND "Drone" (plain NPC) physicalDamage 10 == physicalHealth  -> ooc, withheld from players
  AND every player is still connected
WHEN the GM process dies and a NEW tab joins room ABC123 by code
THEN confirmDestructiveJoin is not shown (the new tab is an unused placeholder)
  AND all FIVE participants are in the encounter, in the same derived order
  AND "Wraith".isInFullDefense() is true and canUseAction(fullDefense) is false
  AND "Rigger".status === StatusEnum.Delaying and .edge is true
  AND "Lone Ganger" satisfies hasGruntConditionMonitor(), gruntBody === 5,
      combinedDamage === 10, finalState === 'standing'
  AND "Sec Guards" has 4 members, 2 outOfAction, rowWoundModifier === 3
  AND "Drone".ooc is true and .physicalDamage === 10
  AND every connected player's next session:state payload is structurally
      identical to the one they received before the crash (no new fields)
  AND no player socket ever received a physicalDamage value
```

### S5 — Legacy snapshot: a room saved before this change

```
GIVEN a persisted room document with `state` but `gmState: null`
WHEN the GM joins it
THEN restoreFromSharedState(state, null) runs
  AND behaviour is byte-identical to the pre-change build
  AND component.restoreWarning contains "damage", "out of action" and "undo history"
  AND nothing throws on the absent gmState
```

### S6 — Deploy skew: new client, old server

```
GIVEN a SessionSyncService whose joinAsGm ack omits `gmState` entirely
WHEN btnJoinShareSession_Click takes the pull path
THEN gmState resolves to null and S5's behaviour applies
  AND broadcastGmState still emits (the old server drops it) without throwing
```

---

## DECIDED by Xavier, 2026-08-19 — these are no longer open

The "Open decisions" section below is kept for its reasoning, but every item is now settled as follows. **Where the two conflict, this section wins.**

- **D1 — transport design: the separate GM-only `session:update-gm-state` channel.** Build option (B) exactly as specified.
- **D2 — `GruntMember.hasActed` goes on the wire.** NPC-group Decision 18 is reversed; append the reversal to `RULINGS.md`.
- **D3 — `status` is restored verbatim** (with `Active` reserved to `shared.active`). Delaying and Finished both round-trip.
- **D4 — `actionHistory` is restored**, via the identity-preserving `resolveRestoredAction` lookup. Full Defense must come back and must not be re-purchasable.
- **D5 — `ICParticipant` is OUT OF SCOPE.** The Matrix module stays paused. **Omit `isIC`, `icType`, `hostRating` and `linkedTargetId` from `SharedGmParticipantState`; do not add an IC branch to `buildRestoredParticipant`; drop acceptance criterion 10.** IC continuing to restore as a plain `MatrixParticipant` remains a known, accepted gap — leave the existing `ARCHITECTURE.md` note about it in place rather than deleting it.
- **D6 — add the `manualOoc` getter** to `Participant`, overridden on `DetachedGruntParticipant`.
- **D7 — existing persisted rooms will be DELETED, not migrated.** There is no data-compatibility obligation. Consequences:
  - Still write the code so an absent/`null` `gmState` cannot crash the restore — that path is now justified only by **deploy skew** (an old GM tab talking to a new server, or vice versa), not by old room files.
  - **Keep** `oocParticipantCount`, the `abandonJoinAndRestore` all-down branch, and the legacy `restoreWarning` text, so the five existing `persistent-rooms.spec.ts` legacy-snapshot tests keep passing unchanged. Do not delete them to "clean up".
  - Acceptance criteria 5, 17 and 18 all stand as written; AC 17 is now a deploy-skew test rather than a migration test.
- **D8 — two `restoreWarning` texts**, chosen by whether a `gmState` was present, exactly as specified.

## Amended 2026-08-19 — post-implementation adversarial review fixes

The build against this brief passed 914/914 tests but an adversarial review
found defects, numbered independently of this brief's own D1-D8 above (they
are review-round labels, not brief decisions — where a number collides, e.g.
"review defect D7" vs. this brief's own "D7 — existing persisted rooms", the
prefix disambiguates). The ones that changed this brief's own acceptance
criteria:

- **Review defect D7 (server, `session:update-gm-state`).** A refused
  `gmState` push (`invalid-payload` or `payload-too-large`) used to leave the
  room's previously stored `session.gmState` in place while `session.state`
  kept moving — silently wrong, not lost. Fixed to clear `session.gmState` to
  `null` on refusal instead, same as a legacy room or deploy skew. Acceptance
  criterion 21 above is amended to match. Extracted the handler's validation
  into `server/gm-state-channel.js` (`isGmState`, `validateGmStatePayload`) so
  it is directly testable, the same way `room-guards.js`/`session-store.js`
  already are.
- **Review defect D1 (roster order reconciliation).** `getSharedParticipants()`
  numbers `order` on the post-filter scale; a withheld entry's `order`
  (`buildGmState()`) is numbered on the full-roster scale. The "Broadcast
  contract" section above waved at AC 8 for how the restore's merge
  reconciles the two without ever stating a rule, and the two scales were
  sorted together as if they were one — a withheld participant above a live
  one could land on the exact same `sortOrder` as it. Fixed by adding
  `SharedGmParticipantState.rosterIndex` (the full-roster index, carried once
  per participant on the GM-only channel) as the single ruler the merge and
  the restored `sortOrder` both rank against whenever a `gmState` is present;
  `order` alone remains correct for the no-`gmState` case, where there is only
  one list and nothing to reconcile.
- **Review defect D5 (`hasActed` on the player wire).** `SharedGruntMemberState.hasActed`
  rode `rowMembers`, which is part of `SharedParticipantState` and reaches
  every player socket — breaking this brief's own "not one extra field"
  promise and acceptance criterion 13. Moved to
  `SharedGmParticipantState.rowMemberHasActed` (GM-only, index-aligned with
  `rowMembers`). `RULINGS.md`'s Decision 18 reversal (Open Decision 2) still
  stands; only the wire location changed.

## Open decisions (reasoning retained; superseded by the section above)

**1. GM-only channel vs. widened broadcast with a server-side strip.**
Recommended: **the separate `session:update-gm-state` channel** (option B above). It is an allowlist by construction, so a future handler cannot leak damage by forgetting a rule — the exact failure mode ARCHITECTURE §7 records eight review rounds of. It also degrades safely across a deploy. Cost: one new event, one new persisted key, ~5 files instead of 3. If Xavier prefers the cheaper strip, **this spec's "Serialisation contract" and server sections must be rewritten** — do not attempt the substitution by hand from this document.

**2. Reverse NPC-group Decision 18 and put `GruntMember.hasActed` on the wire?**
Decision 18 (`GruntMember.ts:166-179`) calls it "GM bookkeeping only… it does not survive a rejoin." Recommended: **reverse it.** That reasoning is sound for a normal pass boundary, where it is cleared anyway, but a mid-pass rejoin is precisely when the GM needs to know which of six gangers has gone — and there is no other signal, because the row is one participant and its `status` cannot say. Requires a `RULINGS.md` append. Cost: 3 fields, 3 lines.

**3. Restore `status` verbatim, or bring everyone back `Waiting`?**
Recommended: **verbatim** (with `Active` reserved to `shared.active`). Today's behaviour gives a second Action Phase in the same pass to everyone who already acted, which is a correctness bug at the table, not just a cosmetic one. Bringing everyone back `Waiting` is one line less code but keeps the double-act.

**4. Restore `actionHistory`?**
Recommended: **yes.** The Score already round-trips correctly without it (the cost is folded into `initiativeScore`), so this is purely about status and the persist gate — but the persist gate is a real rules gate: without it, Full Defense can be paid for twice in one Combat Turn. Note the identity trap in affected-path 13; a naive JSON restore silently fails to close the gate.

**5. Reconstruct `ICParticipant`?**
Recommended: **yes.** Three fields, the class already exists and is already wired into initiative, and this change is already rewriting `buildRestoredParticipant`. It is transport for existing state, not Matrix rules verification or GM-workflow build-out, so it does not conflict with `CLAUDE.md`'s "Matrix is paused". Say no and the `isIC` fields are simply omitted from `SharedGmParticipantState`.

**6. Add `manualOoc` getter to `Participant`, or reverse-derive it?**
Recommended: **add the getter** (`get manualOoc(): boolean { return this._ooc; }` on `Participant`, overridden on `DetachedGruntParticipant` to return `_manualOoc`, and on `NpcRowParticipant` to return `super.manualOoc`). Read-only, so no `Undoable.Set` plumbing and no `PARTICIPANT_BASE_BACKING_FIELDS` change. Reverse-deriving "is this OOC because of damage or because the GM said so" from the public getter is possible but re-implements each subclass's threshold rule in a second place — exactly the drift this repo keeps paying for.

**7. Keep `oocParticipantCount` and the `abandonJoinAndRestore` all-down branch?**
Recommended: **keep both**, unreachable for new snapshots but load-bearing for rooms already on disk. Removing them breaks S5 and five existing tests in `persistent-rooms.spec.ts`.

**8. `restoreWarning` wording.**
Recommended: **two texts, chosen by whether a `gmState` was present.** New-format: name only what genuinely does not come back — undo/redo history, and the GM's transient panel/selection state. Legacy: keep today's string verbatim so the existing assertions can be reused for that branch. Leaving one text that still says "damage… not included" after the fix is the exact drift the backlog already warns about at line 227-231.

---

## Notes on contradictions found during scoping

1. **`docs/FEATURE-BACKLOG.md:145-156` records an unresolved doubt** — the 2026-08-07 live test suggested the row-member restore path might *also* be broken, and instructs "re-verify the row-member restore path specifically as step 1 of the fix". Done. **The row path is sound** for a row with at least one member still standing; `src/Grunts/npc-row.spec.ts:1009-1047` covers it. The live symptom is explained by the *wiped-out row* case (a wiped row is `ooc`, so it is filtered off the wire before its snapshot is ever built), not by a snapshot defect. That resolves the backlog's open question.

2. **`ARCHITECTURE.md` §6 asserts "Row members' Condition Monitors are therefore the one kind of damage that survives a rejoin."** That is true only for rows that are not wiped out — an exception the document does not state. It should be corrected regardless of whether this change ships.

3. **`restoreFromSharedState` contains a second, incomplete copy of the `baseIni` formula** (`:3970-3979`) that diverges from `getParticipantBaseInitiative` (`:5084-5093`) in two ways: it omits the astral `INT × 2` branch entirely, and it gates the Matrix branch on `jackedIn === true` where `getParticipantBaseInitiative` does not gate at all. Pre-existing defect, independent of the reported bug, included in the affected-paths map (item 12) because the fix rewrites those lines anyway.
