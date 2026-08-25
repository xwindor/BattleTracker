# Remove the Undo/Redo system — implementation spec

## Request

Delete the global Undo/Redo mechanism (`src/Common/UndoHandler.ts`,
`src/Common/Undoable.ts`) and every call site that depends on it, replacing each
undo-mediated mutation with a direct, behaviour-identical mutation.

**Not in scope:** any change to combat behaviour, initiative maths, session
sync, persistence, the action log, or the GM/player wire format. No new UI
controls, no new confirmation dialogs (see Open Decisions 1 and 2 — both are
recommended as *separate follow-up changes*). No changes to
`Participant.hardReset()` or `CombatManager.endCombat()` beyond removing undo
calls. `ICParticipant` rejoin reconstruction stays out of scope as it already is.

## Current behaviour

### The mechanism

`src/Common/UndoHandler.ts` is a module-singleton (`export default
_undoHandlerInstance`, line 132-134) holding `pastHistory` / `futureHistory` /
`currentChapter` and two flags `halted` (never read anywhere) and `recording`.

- `HandleProperty(obj, prop, val)` (line 51-69): asserts `obj` has own property
  `"_" + prop` and **throws** `"obj is missing property: _" + prop` otherwise;
  compares old vs new; **if different, performs the write** `obj["_"+prop] = val`
  and pushes an undo/redo closure pair; auto-opens a chapter via
  `StartActions()` when `!this.recording`. **This method is where the write
  physically happens.**
- `DoAction(action, undoAction)` (line 71-80): pushes the pair only `if
  (this.recording)`, then **always calls `action()`**. **This is where the
  mutation physically happens.**
- `Undo()` / `Redo()` (82-106), `hasPast()` / `hasFuture()` (108-114),
  `StartActions()` (116-124), `EndActions()` (126-129), `Initialize()` (44-49).
- Constructor lines 26-42 install a `window.uhdump` debug hook via
  `Object.defineProperty(window, "uhdump", () => {…})` — the third argument is a
  function, not a property descriptor, so this has never actually produced a
  callable `window.uhdump`. Dead either way.

`src/Common/Undoable.ts` (whole file, 9 lines): `class Undoable { Set(prop, val)
{ UndoHandler.HandleProperty(this, prop, val); } }`.

`src/Common/index.ts` (whole file, 6 lines) re-exports both plus the unused
`IPropertyHistoryItem` type. `tsconfig.json` sets `"baseUrl": "src"` with no
`paths` mapping, so `import … from "Common"` resolves to `src/Common/index.ts`.
`src/Common/` contains **only** these three files (`Glob src/Common/*.ts`).

### Where it is reached from

- Toolbar buttons: `src/app/battle-tracker/battle-tracker.component.html`
  lines 71-78 (`btnUndo_Click()` / `btnRedo_Click()`, `[disabled]` bound to
  `isUndoDisabled()` / `isRedoDisabled()`, icons `fa-undo` / `fa-redo`).
- **No keyboard shortcut exists.** Searched for `ctrlKey`, `HostListener`,
  `keyCode`, `Ctrl+Z` across `src/`: the only `keydown` handlers are
  `inpName_KeyDown` / `inpDiceIni_KeyDown` / `inpBaseIni_KeyDown`, which do tab
  navigation only. Comments mentioning "Ctrl+Z" are prose.
- `src/assets/undo.svg` exists but is referenced by nothing in `src/` — the
  toolbar uses Font Awesome classes. It is listed in `BattleTracker.njsproj:55`.

### Known-defective behaviour that disappears with the system

Documented in `ARCHITECTURE.md` §8 and confirmed in code:

1. `Participant.softReset()` (`src/Combat/Participants/Participant.ts:690`)
   assigns `this._actionHistory = []` directly, bypassing both `Set` and
   `DoAction`, so undo across a Combat Turn boundary loses committed interrupts.
2. `UndoHandler.DoAction` is a silent no-op for history when no chapter is open,
   while `HandleProperty` in the same position auto-opens one.
3. `CombatManager.nextIniPass()`'s doc comment (`src/Combat/CombatManager.ts`
   lines 102-106) misdescribes chaptering; `EndActions()` also pushes empty
   chapters, so `hasPast()` can be true with nothing to undo.

## Affected paths

Exhaustive. Every location below was found by grepping `src/`, `docs/`,
`briefs/`, `server*`, and the project root for `Undo`, `Undoable`,
`UndoHandler`, `StartActions`, `EndActions`, `DoAction`, `HandleProperty`,
`hasPast`, `hasFuture`, `this.Set(`, `extends Undoable`, `super()`, `fa-undo`,
`undo.svg`, and `.insert(`/`.insertAt(`/`.remove(`/`.clear(`.
`.claude/worktrees/` was excluded per `CLAUDE.md`.

### A. Files deleted outright (3)

1. `src/Common/UndoHandler.ts`
2. `src/Common/Undoable.ts`
3. `src/Common/index.ts`
   — i.e. the whole `src/Common/` directory.

Optional (Open Decision 6): `src/assets/undo.svg`.

### B. `extends Undoable` — 5 classes, each with a `super()` call to delete

| File | Class declaration | `super()` |
|---|---|---|
| `src/Combat/CombatManager.ts:10` | `class CombatManager extends Undoable` | line 65 |
| `src/Combat/BTTime.ts:3` | `export class BTTime extends Undoable` | line 43 |
| `src/Combat/Participants/Participant.ts:114` | `export class Participant extends Undoable implements IParticipant` | line 496 |
| `src/Grunts/GruntMember.ts:144` | `export class GruntMember extends Undoable` | line 190 |
| `src/app/battle-tracker/battle-tracker.component.ts:360` | `export class BattleTrackerComponent extends Undoable implements OnInit, OnDestroy, AfterViewChecked` | line 964 |

**`BattleTrackerComponent extends Undoable` is vestigial** — the component never
calls `this.Set(`. Verified by grep.

**Do NOT touch these `super()` calls** — they belong to subclasses of
`Participant`/`MatrixParticipant`, not of `Undoable`:
`src/Matrix/MatrixParticipant.ts:85`, `src/Matrix/ICParticipant.ts:32`,
`src/Magic/AstralParticipant.ts:78`, `src/Grunts/NpcRowParticipant.ts:121`,
`src/Grunts/DetachedGruntParticipant.ts:157`.

### C. `this.Set(...)` property writes — 65 call sites across 9 files

Each must become a direct assignment to the matching backing field,
**preserving the transform applied to the value**.

`src/Combat/Participants/Participant.ts` (22): lines 121 (`name`), 129
(`waiting`), 137 (`finished`), 145 (`active`), 153 (`baseIni`), 173 (`diceIni`),
187 (`diceIni`, in `setDiceIniWithoutScoreChange`), 213 (`dices`, wrapped in
`clampInitiativeDiceCount(val)`), 274 (`hasPainEditor`), 291
(`currentInitiativeScore`), 305 (`appliedInitiativeAttribute`), 351 (`ooc`), 372
(`edge`), 380 (`status`), 388 (`actionHistory`), 396 (`painTolerance`), 405
(`overflowHealth`), 413 (`physicalHealth`), 421 (`stunHealth`), 429
(`physicalDamage`), 440 (`stunDamage`), 450 (`sortOrder`).

`src/Matrix/MatrixParticipant.ts` (11): lines 29, 33, 37, 41, 45, 50, 54, 58,
65, 70. Plus the doc comment at line 17 naming the convention.

`src/Grunts/GruntMember.ts` (8): lines 148, 152 (`Math.max(0,
Math.floor(val))`), 156 (same), 187 (`val === true`), 266, 267, 270, 304. Plus
**lines 337, 338, 342, 343 — see the entanglement note in D below.**

`src/Grunts/DetachedGruntParticipant.ts` (7): lines 62, 79, 92, 93 (all
`Math.max(0, Math.floor(…))`), 149, 154 (`Math.max(0, Math.floor(val))`), 192
(`this.Set("manualOoc", val)` — writes `_manualOoc`, **not** `_ooc`; see the
`ooc` override at 187-193 and the `manualOoc` override note at 195-199).

`src/Combat/CombatManager.ts` (5): lines 22, 32, 42, 52, 61.

`src/Combat/BTTime.ts` (3): lines 20, 29, 38.

`src/Grunts/NpcRowParticipant.ts` (3): lines 87, 100 (`Math.max(0,
Math.floor(val))`), 118 (`val === true`).

`src/Magic/AstralParticipant.ts` (3): lines 52, 56, 75.

`src/Matrix/ICParticipant.ts` (3): lines 21, 25, 29.

### D. `UndoHandler.DoAction(...)` — 14 call sites where the closure IS the mutation

Every one of these executes the mutation *inside* the closure. Deleting the
wrapper without keeping the body is a data-loss bug.

`src/Combat/Participants/ParticipantList.ts` (4): line 27 (`insert`), 41
(`insertAt`), 58 (`remove`), 86 (`clear`).

`src/Combat/Participants/Participant.ts` (2): line 631 (`doAction` — pushes onto
`actionHistory`), 642 (`resetActions` — assigns `_actionHistory = []`).

`src/Grunts/NpcRowParticipant.ts` (2): line 293 (`addMember`), 315
(`removeMember`).

`src/app/battle-tracker/battle-tracker.component.ts` (3): line 607 in
`forgetParticipant` (clears `selectedActor`), 6632 in `forgetMapEntry` (the
`map.delete(key)`), 6643 in `forgetSetEntry` (the `set.delete(key)`).

`src/app/services/matrix-state.service.ts` (4): line 40 (`jackIn`), 63
(`jackOut`), 81 (`addHost`), 93 (`setCurrentHost`).

`src/app/services/os-tracking.service.ts` (2): line 38 (`addOS`), 51
(`resetOS`).

> **ENTANGLEMENT — flagged, not resolved.**
> `GruntMember.fromSnapshot()` (`src/Grunts/GruntMember.ts:330-345`) calls
> `member.Set("damage", …)`, `member.Set("lastDamageType", …)`,
> `member.Set("lastDamageValue", …)`, `member.Set("hasActed", …)` on a *different
> instance*. `damage`, `lastDamageType` and `lastDamageValue` have **no public
> setter** on `GruntMember` — `Set` is being used as a private-field back door.
> This is the path a GM rejoin uses to rebuild every NPC row member's Condition
> Monitor (`ARCHITECTURE.md` §6 "Session sync for rows"). Breaking it means
> group members return from a rejoin with zero damage and a wrong p.379
> alive/dead verdict. Since TypeScript `private` is class-scoped, a static
> method of `GruntMember` may write `member._damage` etc. directly — but the
> implementer must make that choice consciously and cover it with the existing
> rejoin tests.

### E. `UndoHandler.StartActions()` / `Initialize()` / `Undo()` / `Redo()` / `hasPast()` / `hasFuture()` — production call sites

All in `src/app/battle-tracker/battle-tracker.component.ts` unless noted.
Enclosing method named for each; the `UndoHandler.*` statement is deleted.

| Line | Enclosing method | Call |
|---|---|---|
| 5 | (import) | `import { Undoable, UndoHandler } from "Common";` |
| 1021 | `onOsResetClick` | `StartActions()` |
| 1065 | `ngOnInit` | `Initialize()` |
| 1066 | `ngOnInit` | `StartActions()` |
| 2696 | `btnReleaseClaim_Click` | `StartActions()` |
| 4200 | `restoreFromSharedState` | `StartActions()` |
| 4469 | `restoreFromSharedState` | `Initialize()` |
| 4533 | `btnAddParticipant_Click` | `StartActions()` |
| 4549 | `btnEdge_Click` | `StartActions()` |
| 4555 | `btnRollInitiative_Click` | `StartActions()` |
| 4886 | `performAct` | `StartActions()` |
| 4911 | `performRowMemberAct` | `StartActions()` |
| 4933 | `btnDelay_Click` | `StartActions()` |
| 4959 | `btnNextPass_Click` | `StartActions()` |
| 5006 | `btnDelete_Click` | `StartActions()` |
| 5037 | `btnDuplicate_Click` | `StartActions()` |
| 5074 | `btnReset_Click` | `StartActions()` |
| 5108 | `btnLeaveCombat_Click` | `StartActions()` |
| 5125 | `btnEnterCombat_Click` | `StartActions()` |
| 5143 | `btnAction_Click` | `StartActions()` |
| 5277 | `isUndoDisabled` | `hasPast()` — **delete whole method** |
| 5281 | `isRedoDisabled` | `hasFuture()` — **delete whole method** |
| 5301 | `btnUndo_Click` | `Undo()` — **delete whole method** |
| 5307 | `btnRedo_Click` | `Redo()` — **delete whole method** |
| 5314 | `inpName_KeyDown` (inside the `handleTabNav` callback) | `StartActions()` |
| 5406 | `onParticipantRolledTotalChanged` | `StartActions()` |
| 5603 | `addGrunt` | `StartActions()` |
| 5807 | `mergeSelectedGrunts` (refusal branch) | `StartActions()` |
| 5811 | `mergeSelectedGrunts` (success branch) | `StartActions()` |
| 5969 | `onGruntBodyChanged` | `StartActions()` |
| 5981 | `onGruntWillpowerChanged` | `StartActions()` |
| 6033 | `applyGruntDamage` | `StartActions()` |
| 6045 | `healGrunt` | `StartActions()` |
| 6074 | `addNpcRow` | `StartActions()` |
| 6146 | `addNpcToRow` | `StartActions()` |
| 6190 | `applyRowMemberDamage` | `StartActions()` |
| 6347 | `toggleRowMemberActed` | `StartActions()` |
| 6430 | `healRowMember` | `StartActions()` |
| 6496 | `detachRowMember` | `StartActions()` |
| 6564 | `removeRowMember` | `StartActions()` |
| 6662 | `enableDeck` | `StartActions()` |
| 6674 | `removeDeck` | `StartActions()` |
| 6707 | `enableAstral` | `StartActions()` |
| 6728 | `disableAstral` | `StartActions()` |
| 6767 | `toggleAstralProjecting` | `StartActions()` |
| 6807 | `gmJackIn` | `StartActions()` |
| 6833 | `gmJackOut` | `StartActions()` |
| 6854 | `onDeckStatChanged` | `StartActions()` |
| 7106 | `onMatrixDPChanged` | `StartActions()` |
| 7130 | `onVRModeChange` | `StartActions()` |
| 7294 | `rollOutstandingInitiative` | `StartActions()` |
| 7372 | `beginCombatTurn` | `StartActions()` |

Other production imports of `UndoHandler`:
`src/Combat/Participants/ParticipantList.ts:1`,
`src/Combat/Participants/Participant.ts:1` (`{ Undoable, UndoHandler }`),
`src/Combat/CombatManager.ts:1` (`{ Undoable }`), `src/Combat/BTTime.ts:1`,
`src/Grunts/GruntMember.ts:1`, `src/Grunts/NpcRowParticipant.ts:1`,
`src/app/services/os-tracking.service.ts:3`,
`src/app/services/matrix-state.service.ts:3`.

### F. The `log` parameter on `ParticipantList`

`src/Combat/Participants/ParticipantList.ts` `insert(p, log = true)`,
`insertAt(p, i, log = true)`, `remove(p, log = true)`, `clear(log = true)` — the
flag exists **only** to suppress undo recording. With undo gone it is
meaningless. Production call sites passing `false`:

- `src/app/battle-tracker/battle-tracker.component.ts:4212` —
  `combatManager.participants.clear(false)` (in `restoreFromSharedState`)
- `src/app/battle-tracker/battle-tracker.component.ts:4213` —
  `combatManager.currentActors.clear(false)` (same)
- `src/app/battle-tracker/battle-tracker.component.ts:4416` —
  `currentActors.insert(participant, false)` (same)
- `src/app/battle-tracker/battle-tracker.component.ts:7235` —
  `currentActors.remove(actor, false)` (in `enforceSingleCurrentActor`)

Internal recursive uses at `ParticipantList.ts` lines 28, 29, 42, 43, 59, 60, 87
disappear with the closures.

Spec call sites passing `false` (must all be updated if the parameter is
removed — Open Decision 3). Counted by file:
`src/scenarios/gm-reconnect-state-loss.spec.ts` (34),
`src/scenarios/persistent-rooms.spec.ts` (17),
`src/Combat/CombatManager.spec.ts` (14), `src/Grunts/npc-row.spec.ts` (7),
`src/app/battle-tracker/battle-tracker.component.spec.ts` (7),
`src/scenarios/combat-boundary-logging.spec.ts` (5),
`src/scenarios/npc-group-initiative.spec.ts` (4),
`src/scenarios/running-initiative-score.spec.ts` (3),
`src/scenarios/action-log-readability.spec.ts` (3),
`src/scenarios/grunt-heal-dv-input.spec.ts` (3),
`src/scenarios/action-log-attribution.spec.ts` (2),
`src/scenarios/combat-log-readability.spec.ts` (2),
`src/scenarios/gm-npc-rolls.spec.ts` (2). **≈103 lines.**

> Not to be confused with the unrelated `store.remove('ABC123')` calls in
> `persistent-rooms.spec.ts` (349, 476, 5016) or the `Map`/`Set` `.clear()`
> calls throughout the component — those are not `ParticipantList`.

### G. UI

`src/app/battle-tracker/battle-tracker.component.html` lines 69-79 — the entire
`<div class="col-6 position-relative"><div class="right btn-group">…</div></div>`
holding both buttons. **Check the surrounding Bootstrap grid**: the sibling is
`col-6` at line 69; removing one half of a 6/6 row may need the sibling widened
or the wrapper dropped. Not a behavioural change, but do not leave a dangling
empty column.

Line 520 carries a comment "One tap, undoable." on the release-claim button —
reword.

`src/app/battle-tracker/battle-tracker.component.css:1058` mentions "undoing six
flex/width pairs" — unrelated prose about CSS overrides. **Do not touch.**

### H. User-facing strings mentioning undo

1. `battle-tracker.component.ts:4499` — `buildRestoreWarning()` gmState branch:
   `"undo/redo history, and this tab's own panel/selection state"`.
2. `battle-tracker.component.ts:4505` — `buildRestoreWarning()` legacy branch:
   `"committed interrupt actions, and undo history - re-enter those by hand."`
   Note the surrounding doc comment (4482-4486) says this branch is kept
   **byte-for-byte** for legacy snapshots; changing it is a deliberate decision.
3. `battle-tracker.component.ts:1930` — `confirmDestructiveJoin()`:
   `"out of action, committed interrupt actions, spent Edge and the undo history all go with them. This cannot be undone. "`
4. `battle-tracker.component.ts:1236` — `confirmCreateShareSession()`:
   `"This cannot be undone."` — **this one is correct English, not a reference
   to the Undo feature. Leave it.** Same for `server.js:534`'s "Not undoable, by
   design" comment about Close/End — leave.

### I. Comments and doc comments referencing undo semantics

`src/app/battle-tracker/battle-tracker.component.ts`: lines 540-543, 829-830,
840-841, 1522, 1872-1875, 2689-2690, 3487, 4195-4199, 4464-4469, 4478-4481,
5284-5298, 5404-5406, 5688, 5714, 5754, 5805-5807, 5836-5838, 5849, 6334-6336,
6405, 6418, 6534-6541, 6615-6625.

`src/Combat/CombatManager.ts`: 102-106 (the stale `nextIniPass` comment),
285-286, 302-303, 315-316, 325-326, 369-371.

`src/Combat/Participants/Participant.ts`: 233, 563.

`src/Grunts/NpcRowParticipant.ts`: 82-83, 114, 361-363, 620.

`src/Grunts/GruntMember.ts`: 12-14, 282-284.

`src/Grunts/DetachedGruntParticipant.ts`: 262.

`src/Matrix/MatrixParticipant.ts`: 17. `src/Matrix/MatrixTarget.ts`: 4, 6.
`src/Matrix/MatrixHost.ts`: 11. `src/Matrix/MatrixRunState.ts`: 18.
`src/Matrix/MatrixIcon.ts`: 7. (The four Matrix value objects only *mention*
`UndoHandler.DoAction` in prose as the prescribed mutation route; they have no
code dependency.)

`src/app/services/matrix-state.service.ts`: 18-20, 33-38, 48.
`src/app/services/os-tracking.service.ts`: 19-20.
`src/app/dice-roller/dice-roller.component.ts:153` — "the undo for a mis-picked
name", ordinary English. **Leave.**
`src/app/player-view/player-view.component.ts:996` — "`btnReleaseClaim_Click`,
and its undo/redo" — reword.

### J. Tests

**Delete these `it` / `describe` blocks** (they test only the undo mechanism):

- `src/Combat/CombatManager.spec.ts`: line 245 `'is undoable as part of the
  surrounding chapter'`; 403 `'undo reverses a pass advance as a single step'`;
  420 `'undo reverses an Initiative attribute change back out of the Score'`;
  import at line 4.
- `src/app/battle-tracker/battle-tracker.component.spec.ts`: 309 `'is a single
  undo step per edit'`; 514 `'is undoable as a single step'`; 781 `'is undoable
  as a single step'`; import at line 11.
- `src/Grunts/npc-row.spec.ts`: 252, 1053, 1186, 1381, 1485, 1778, 1961, 2481;
  import at line 20; comments at 844, 891, 2709.
- `src/scenarios/persistent-rooms.spec.ts`: 1915 `'a mis-tapped release is one
  Ctrl+Z'`; the whole `describe` at 1938 `'S3 - undo across a restore'` (its at
  1951, 1968, 1982); 2167 `'undo history survives the round trip'`; the whole
  `describe` at 2642 `'undo re-broadcasts…'` (its at 2659, 2672, 2683, 2699);
  2941 `'fix 6: undo history survives the mis-tap and the recovery'`; import at
  line 18; comment at 2226, 3436.
- `src/scenarios/gm-reconnect-state-loss.spec.ts`: the whole `describe` at 273
  `'S3 - Undo: the restore is not walkable…'` (it at 275); import at line 20.
- `src/scenarios/combat-boundary-logging.spec.ts`: the whole `describe` at 190
  `'S3 - the GM mis-taps Next Initiative Pass and undoes it'` (it at 191).
- `src/scenarios/action-log-attribution.spec.ts`: 651 `'S3 - undoing a
  mis-clicked Leave Combat emits no log line'`; comment at 646-647.

**Rewrite these — they assert a real rule through an undo wrapper** (Open
Decision 4):

- `src/Grunts/npc-row.spec.ts:252` `'is a single undo step and gives the score
  back on undo'` — the *score-refund* assertion is a Decision-1 group-wound rule.
- `src/scenarios/grunt-heal-dv-input.spec.ts:117` `'Heal-DV3: a six-box heal is
  a single undo step that restores damage and score'` (+ line 185); import at 22.
- `src/scenarios/action-log-readability.spec.ts:822` `'S3 - a mis-keyed killing
  blow, corrected by heal rather than undo'` — the heal-correction half is the
  point; import at 16.

**Change these string assertions** (they assert the wording in H):

- `src/scenarios/persistent-rooms.spec.ts:1681`
  `expect(component.restoreWarning).toContain('undo history')`
- `src/scenarios/persistent-rooms.spec.ts:2250-2251` `toContain('undo history')`
  and `toContain('cannot be undone')`
- `src/scenarios/persistent-rooms.spec.ts:2438` `toContain('cannot be undone')`
  — this one asserts `confirmCreateShareSession`'s wording (H.4), which is **not
  changing**; leave it.
- `src/scenarios/gm-reconnect-state-loss.spec.ts:456` and `:519`
  `toContain('undo history')`

### K. Documentation

- `ARCHITECTURE.md` — 83 occurrences. Delete §4 "Undo model" entirely; rewrite
  the undo sentences in §1 (ParticipantList "undo-aware", `_currentInitiativeScore`
  "undoable like every other field"), §2 (the whole "Undo batching is the
  caller's responsibility" block and the "Stale comment warning"), §3 ("routes
  through `Undoable.Set`" convention paragraph — the `_field` + getter/setter
  convention itself survives; only its *reason* changes), §5, §6 (row member
  mutations "undoable provided a chapter is open"), §7 ("Undo." subsection under
  Ownership; "Undo/redo re-broadcast" bullet; `buildRestoreWarning` paragraph;
  `restoreFromSharedState` chapter paragraph), and §8 (delete the three
  undo-specific rough edges, keep the others).
- `docs/APP_DOCUMENTATION.md` §7 "Undo/Redo Model", lines 510-523 — delete the
  section and renumber §8 onward. Also line 787 ("undo/redo history never leaves
  the browser").
- `docs/MATRIX_MODULE_PLAN.md` lines 85, 140, 147, 191, 246, 253 — the parked
  plan prescribes `UndoHandler.DoAction` wrapping. Update so a future Matrix
  build doesn't reintroduce it.
- `docs/FEATURE-BACKLOG.md` — delete D7 (lines 303-305, "stale release notice
  after an undo") since it can no longer occur. Add the Open Decision 1 / 2
  follow-ups here if Xavier defers them.
- `RULINGS.md` lines 173-174, 193, 203-205, 247, 401-405 — these already
  *anticipate* the removal. Lines 203-205 ("The correction path for a mis-keyed
  killing blow is global Undo") are in a **superseded** entry; leave the entry
  (it's a reasoning trail) but the superseding 2026-08-07 entry at 400-405 is
  now simply true rather than forward-looking. Line 247 ("All of it is undoable
  in one step, so a mis-typed Body is one Undo") is in a *live* entry and must
  be corrected.
- `CLAUDE.md` line 26 — `ARCHITECTURE.md` is described as authoritative for
  "…tie-breaking, undo, and how session sync…". Drop "undo".
- `BattleTracker.njsproj` lines 55 (`src\assets\undo.svg`) and 63
  (`src\classes\UndoHandler.ts` — **already a stale path**; the file lives at
  `src/Common/UndoHandler.ts`). Remove both.
- Historical briefs (`briefs/*.md`) are records of past decisions — **do not
  rewrite them.** Listed for completeness only:
  `combat-boundary-logging-spec.md` (21), `grunt-heal-uses-dv-input-spec.md`
  (18), `gm-reconnect-state-loss-spec.md` (15), `persistent-rooms.md` (11),
  `action-log-readability-spec.md` (7), `action-log-improvements.md` (6),
  `responsive-design-pass.md` (4), `combat-boundary-logging.md` (4),
  `grunt-heal-uses-dv-input.md` (4), `combat-log-readability.md` (3),
  `npc-group-initiative.md` (2), `action-log-readability.md` (1).
- `.project_planning_files/SETUP-ANNOTATED.md` (6), `BOOTSTRAP.md` (1) — bootstrap
  scaffolding, not live docs. Leave.
- `.claude/agents/*.md` and `.claude/skills/*.md` mention undo in passing. Out of
  scope for this change.

### L. Confirmed to have exactly one instance, not many

- Only one Undo entry point in the UI (the toolbar pair). Searched for keyboard
  shortcuts and context menus; none exist.
- Only one `Undoable` base class, one `UndoHandler` singleton.
- `Participant.resetActions()` (`Participant.ts:639`) is declared on
  `IParticipant` (`src/Combat/Participants/IParticipant.ts:74`) and implemented,
  but **has no callers anywhere in `src/`.** It is the natural hook for Open
  Decision 1. Leave it in place.
- `Participant.hardReset()` (`Participant.ts:693`, `IParticipant.ts:77`) is
  likewise uncalled. Unrelated to undo; leave it.

## Proposed approach

### Where the change belongs

`Undoable.Set` and `UndoHandler.DoAction` are not decorators around a mutation —
they *are* the mutation. There is therefore no single choke point to route
through: the choke point is being deleted, and its work must be pushed back out
to each of the ~79 call sites (65 `Set` + 14 `DoAction`). This is unavoidable
and is the reason the map above is enumerated rather than described.

The `StartActions()` calls (52 of them) are pure deletions — nothing depends on
them once history is gone.

### Removal order

Each step must leave the tree compiling.

1. **UI first.** Delete the toolbar block (`battle-tracker.component.html`
   69-79) and the four methods `isUndoDisabled` / `isRedoDisabled` /
   `btnUndo_Click` / `btnRedo_Click` (`battle-tracker.component.ts` 5276-5309).
   Makes the feature unreachable before anything structural moves.
2. **Delete all 52 `StartActions()` / `Initialize()` statements** listed in E.
   Statement deletions only; no other edit on those lines.
3. **Inline the 3 component `DoAction` bodies** (`forgetParticipant` 6607-6610 →
   `this.selectedActor = null;`; `forgetMapEntry` 6632-6635 →
   `map.delete(key);`; `forgetSetEntry` 6643-6646 → `set.delete(key);`).
   Keep the `map.has` / `set.has` guards and the `previous`/`value` captures can
   go. **Keep the methods themselves** — `forgetParticipant` is called from
   `btnDelete_Click`, `mergeSelectedGrunts`, `removeRowMember` and
   `upsertPlayerParticipant`.
4. **Inline the 6 service `DoAction` bodies** (`matrix-state.service.ts` 40, 63,
   81, 93; `os-tracking.service.ts` 38, 51). Keep the `previous` captures only
   where the forward action still needs them (`os-tracking.addOS` computes
   `previous + amount`). Delete the undo closures.
5. **Rewrite `ParticipantList`** (4 methods): perform the array mutation
   directly, drop the `log` parameter and the recursive `(…, false)` self-calls.
   Then update the 4 production and ~103 spec call sites (Open Decision 3). The
   compiler flags every miss as an excess argument.
6. **Rewrite `Participant.doAction` / `resetActions`** (631, 642) and
   `NpcRowParticipant.addMember` / `removeMember` (293, 315) to mutate directly.
7. **Replace all 65 `this.Set(...)` calls** (section C) with direct backing-field
   assignment, preserving each transform verbatim. Then fix
   `GruntMember.fromSnapshot`'s four cross-instance writes (337, 338, 342, 343)
   — see the entanglement note in D.
8. **Remove `extends Undoable` from the 5 classes** and their 5 `super()` calls
   (section B). Do **not** touch the 5 `super()` calls in `Participant`
   subclasses.
9. **Delete `src/Common/`** and every `from "Common"` / `from 'Common'` import
   (16 files).
10. **Strings, comments, docs** (sections H, I, K) and the `.njsproj` lines.
11. **Tests** (section J).
12. `npm run lint` and `npm test`.

### Behavioural equivalence rules the implementer must hold

- `HandleProperty` writes **only when `oldval !== val`**. A direct assignment
  writes unconditionally. This is not observable — assigning an equal value is
  idempotent and nothing reads a "was it written" signal. Verified against the
  three setters that read the backing field *after* their own `Set`:
  `Participant.diceIni` (171-177), `GruntMember.applyDamage` (265-271),
  `GruntMember.healDamage` (300-307). All three behave identically.
- `HandleProperty`'s `throw` on a missing backing field is a *convention
  enforcer*. Direct assignment replaces a runtime throw with a compile error,
  which is strictly better; nothing depends on catching that throw.
- The `_field` + `get foo()` + `set foo(val)` convention and
  `PARTICIPANT_BASE_BACKING_FIELDS` **stay exactly as they are** — clone,
  promote/demote and the session-sync restore all depend on them
  (`ARCHITECTURE.md` §3/§6). Only the *reason* for the convention changes.

### What must be preserved

- `enforceSingleCurrentActor`'s removal from `currentActors` (line 7235) — it
  passes `false` today for undo reasons; the removal itself is load-bearing.
- `restoreFromSharedState`'s per-participant rebuild **order**: damage,
  painTolerance, hasPainEditor and baseIni each push a signed Score delta, so
  `currentInitiativeScore` / `appliedInitiativeAttribute` must still be pinned
  **last** (`ARCHITECTURE.md` §7). The undo bracket around this is unrelated to
  the ordering — deleting the bracket must not disturb it.
- `resolveRestoredAction()` (`battle-tracker.component.ts:4165`) returning the
  identity-shared `Action` object from `interruptTable`, because
  `canUseAction`'s persist gate is an object-identity check.
- `GruntMember.fromSnapshot`'s ability to write `damage`, `lastDamageType`,
  `lastDamageValue` and `hasActed`.
- Every side-map cleanup in `forgetParticipant` (6588-6612) and the
  `rowMemberDamageValues` loop in `btnDelete_Click` (5018-5022).
- `btnUndo_Click`'s deletion removes its `syncSharedState()` call — that is
  fine, but check no other path relied on it. It did not: every other mutation
  path calls `sort()` or `syncSharedState()` itself.

## Acceptance criteria

1. `npm run build` succeeds with zero references to `Undoable`, `UndoHandler`,
   `StartActions`, `EndActions`, `DoAction`, `HandleProperty`, `hasPast` or
   `hasFuture` anywhere under `src/`.
2. `src/Common/` no longer exists, and no file imports from `"Common"`.
3. `npm run lint` passes with no new warnings.
4. `npm test` passes.
5. The GM toolbar renders no Undo and no Redo control, and the row that held
   them has no empty or mis-sized column.
6. Applying 3 boxes of Physical to an ordinary participant with Reaction 4 /
   Intuition 4 / pain tolerance 0 raises their wound modifier to 1 and lowers
   `getCurrentInitiative()` by exactly 1 — identical to today.
7. `nextIniPass()` still subtracts exactly 10 from every participant's running
   Score once, flips every non-OOC non-Delaying participant to `Waiting`, and
   clears every row member's `hasActed`.
8. `Participant.setDicesWithoutRoll(9)` still writes `dices === 5`
   (`clampInitiativeDiceCount`), and `setDicesWithoutRoll(0)` still writes `1`.
9. `NpcRowParticipant.rowWoundModifier = -3` still reads back `0`;
   `= 2.7` still reads back `2`.
10. `GruntMember.hasActed = "yes" as unknown as boolean` still reads back
    `false` (the `val === true` coercion survives).
11. `DetachedGruntParticipant.ooc = true` still sets `_manualOoc`, and
    `manualOoc` reads `true`, while `_ooc` stays `false`.
12. A GM rejoin (`restoreFromSharedState` with a `gmState`) rebuilds an
    `NpcRowParticipant` whose members carry their pre-disconnect filled boxes,
    `lastDamageType`, `lastDamageValue` and `hasActed` — byte-identical to the
    pre-change result.
13. After a rejoin, a restored participant's `getCurrentInitiative()` equals the
    broadcast value (Score still pinned after the damage/attribute writes).
14. `btnDelete_Click` on a named participant still prompts, and on confirm
    removes them from `participants` **and** drops their entry from
    `participantIds`, `participantOwners`, `participantClaimable`,
    `participantEdgeRatings`, `participantReactions`, `participantIntuitions`,
    `participantTieBreakers`, `lastKnownDamage`, `declaredActionSelections` and
    all four panel-expansion `Set`s.
15. `mergeSelectedGrunts()` still refuses a merge containing any grunt with
    `diceIni > 0`, still writes the GM-only refusal log line, and on success
    still removes every merged grunt and clears its merge-selection tick.
16. `buildRestoreWarning()` contains no occurrence of the substring `undo`, in
    either branch, and still names every other lost item it names today.
17. `confirmDestructiveJoin()`'s message contains no occurrence of the substring
    `undo history`, and still names the participant count, damage, condition
    monitors, out-of-action participants, committed interrupt actions and spent
    Edge.
18. `ARCHITECTURE.md` contains no §4 "Undo model" and none of the three
    undo-specific entries under §8 "Known rough edges"; the two non-undo rough
    edges (`StatusEnum.OOC` is dead; `active`/`waiting`/`finished` impostor) are
    still present.
19. `docs/APP_DOCUMENTATION.md` has no "Undo/Redo Model" section and its
    remaining sections are contiguously numbered.
20. Grepping the repo for `fa-undo` and `fa-redo` returns zero hits.

## Regression risk

| Risk | Why | Existing cover |
|---|---|---|
| **NPC row members lose damage on rejoin** — `GruntMember.fromSnapshot`'s four `member.Set(...)` back-door writes are silently dropped | Highest-consequence single spot in the change | `src/scenarios/gm-reconnect-state-loss.spec.ts` (S1-S6), `src/Grunts/npc-row.spec.ts` |
| **A `this.Set` transform is lost** (floor/clamp/coerce) — 11 of the 65 sites carry one | Silent numeric drift, not a crash | `src/scenarios/running-initiative-score.spec.ts`, `src/Combat/CombatManager.spec.ts`, `npc-row.spec.ts` |
| **A `DoAction` body is deleted with its wrapper**, so a list mutation or map deletion stops happening | Stale side-map entries → participants re-announced to players as new | `npc-row.spec.ts:1053` (currently written as an undo test — see Open Decision 4), `battle-tracker.component.spec.ts` |
| **`ParticipantList` `log`-parameter removal misses a call site** | Compiler catches it (excess argument) — low risk if the parameter is genuinely removed rather than kept as a no-op | build |
| **Restore ordering disturbed** while deleting the `StartActions`/`Initialize` bracket around `restoreFromSharedState` | Wounded combatants shift position in the derived order | `src/scenarios/gm-reconnect-state-loss.spec.ts`, `src/scenarios/persistent-rooms.spec.ts` |
| **`Participant.actionHistory` handling** — `doAction` pushes in place, `resetActions` reassigns, `softReset` reassigns directly, the setter assigns a new array. Four different write shapes | Full Defense double-purchase or a lost interrupt cost | `src/scenarios/running-initiative-score.spec.ts` (S3, p.167), `CombatManager.spec.ts` |
| **Angular component loses `extends Undoable`** | No runtime effect (`Undoable` has no lifecycle, no DI); `noImplicitOverride` is on but nothing overrides `Set` | `battle-tracker.component.spec.ts`, `app.component.spec.ts` |
| **Session sync / room ownership regressions** | Not touched by this change, but `persistent-rooms.spec.ts` is the largest spec and its `insert(…, false)` calls all change | `src/scenarios/persistent-rooms.spec.ts` |
| **Rewritten "rule via undo" tests weaken silently** — deleted rather than rewritten | Loses real coverage of the group-wound accumulator refund | see Open Decision 4 |

Tie-breaking (`initiativeTieBreakComparator`), the undo chapter mechanics and
`DeclaredActionEngine` have no dedicated spec files (`ARCHITECTURE.md` "Test
coverage"). The first and third are unaffected; the second is being deleted.

## Scenarios to survive

Written as executable cases. All assume `npm test` / Jasmine with the existing
fixtures.

### S1 — Ordinary: a damage edit is a plain write

```
Given a Participant with baseIni 8, painTolerance 0, hasPainEditor false,
      currentInitiativeScore seeded at 8, diceIni 0
When  p.physicalDamage = 3
Then  p.wm === 1
And   p.getCurrentInitiative() === 7
And   p.appliedInitiativeAttribute === 7
When  p.physicalDamage = 0
Then  p.wm === 0
And   p.getCurrentInitiative() === 8
```
Proves the Score-delta chain through `physicalDamage` → `syncInitiativeAttribute`
is unchanged by removing `Set`, and that a mis-keyed hit is still correctable by
re-editing the field.

### S2 — Edge case: every transform on a `Set` call survives

```
Given a fresh NpcRowParticipant row and GruntMember m(body 4, willpower 3)
When  row.rowWoundModifier = -5      Then row.rowWoundModifier === 0
When  row.rowWoundModifier = 2.9     Then row.rowWoundModifier === 2
When  m.body = -1                    Then m.body === 0
When  m.body = 4.8                   Then m.body === 4
When  m.hasActed = 1 as any          Then m.hasActed === false
When  row.spentFlagged = "x" as any  Then row.spentFlagged === false
Given a DetachedGruntParticipant g
When  g.ooc = true                   Then g.manualOoc === true
When  p.setDicesWithoutRoll(9)       Then p.dices === 5
When  p.setDicesWithoutRoll(0)       Then p.dices === 1
```
Every one of these is a value transform that lived inside a `this.Set(...)`
argument and is trivially lost by a careless mechanical edit.

### S3 — The correction path that used to be Undo

```
Given a DetachedGruntParticipant "Ganger A", body 4, willpower 3
      (conditionMonitorBoxes = 8 + ceil(4/2) = 10), undamaged, in a started combat
When  the GM types DV 6 and taps P            (hitGruntPhysical)
Then  g.physicalDamage === 6 and g.wm === 2 and the Score has dropped by 2
When  the GM realises it should have been 3 and taps H with DV 3
                                              (healGrunt, RULINGS.md 2026-08-13)
Then  g.physicalDamage === 3
And   g.wm === 1
And   g.getCurrentInitiative() is exactly 1 below its pre-hit value
And   no Undo control exists anywhere in the rendered component
```
This is the scenario that replaces the deleted
`grunt-heal-dv-input.spec.ts:117` undo test. It asserts the same numbers, via
the correction path `RULINGS.md` 2026-08-07 designated when Undo was slated for
removal.

### S4 — Row member wipe-out and heal-back, with no undo available

```
Given an NpcRowParticipant "Gangers" with members G1..G3, each body 3/willpower 3
      (boxes = 8 + ceil(3/2) = 10), combat started, row rolled
When  applyRowMemberDamage(row, G1, 10, "physical")
Then  G1.outOfAction is true
And   row.rowWoundModifier has risen by G1's wound-modifier delta
When  applyRowMemberDamage(row, G2, 10, "physical")
And   applyRowMemberDamage(row, G3, 10, "physical")
Then  row.isWipedOut is true, row.spentFlagged is true, row.ooc is true
And   flagSpentNpcRows() pulled the row out of currentActors if it was acting
When  healRowMember(row, G3, 10)
Then  G3.outOfAction is false
And   row.spentFlagged is false and row.ooc is false
And   row.rowWoundModifier is back to its value before G3's hit
And   G3.finalState still reports the recorded last-attack type and DV
```
Covers the `NpcRowParticipant.addMember`/`removeMember`/`applyDamageToMember`
`DoAction` rewrites plus `GruntMember.applyDamage`/`healDamage`'s `this.Set`
rewrites in one sequence, and confirms the flag/accumulator round-trip that
`npc-row.spec.ts:1186` currently proves *through* undo.

### S5 — Live at the table, mid-combat, players waiting

```
Given a live share session, room ABC123, 3 player-claimed PCs and one grunt row
      Combat Turn 2, Initiative Pass 2, the decker is the current actor
When  the GM taps "Full Defense" on the decker  (btnAction_Click)
Then  the decker's actionHistory holds the interruptTable fullDefense object
And   getCurrentInitiative() has dropped by 10
And   the shared log carries the interrupt line
And   the broadcast SharedParticipantState for the decker reports the new score
And   canUseAction(fullDefense) now returns false (persist gate, identity check)
And   there is no control anywhere that removes it
When  the Combat Turn later ends (endCombatTurn -> softReset)
Then  actionHistory is [] and the interrupt cost is gone
```
This is the scenario that documents the accepted loss. It must be an explicit
test so that a later change re-introducing a "clear interrupts" control (Open
Decision 1) has to update it deliberately.

### S6 — Live at the table: a mis-tapped Next Pass that ends the Combat Turn

```
Given Combat Turn 1, Pass 1, three participants with current Scores 12, 8, 6
And   the GM has already rolled everyone and applied two hits this turn
When  the GM taps "Next Initiative Pass" (btnNextPass_Click)
Then  every Score drops by 10 -> 2, -2, -4
And   isOver() is false, so a "Start Initiative Pass 2" line is logged
When  the GM taps it once more, by mistake
Then  every Score drops to -8, -12, -14
And   isOver() is true, so endCombatTurn() fires:
        onCombatTurnEnded(1) is logged,
        combatTurn becomes 2, initiativePass 1, currentInitiative NaN,
        every participant softReset()s (diceIni 0, Score back to the bare
        attribute, edge false, status Waiting, actionHistory [])
And   physicalDamage / stunDamage / baseIni / dices / rowWoundModifier are
      untouched by softReset and still hold their values
And   nothing in the UI can reverse any of it
```
The most expensive remaining mis-tap. Damage survives; the turn does not. This
test pins the boundary so Open Decision 2's follow-up (a confirmation on the
turn-ending tap only) can be added against a known baseline.

### S7 — Rejoin after a server restart, GM-only channel present

```
Given room ABC123 persisted with a gmState carrying:
        an NpcRowParticipant with 3 members (filled boxes 4, 0, 10),
        rowWoundModifier 2, rowEverPopulated true, spentFlagged false,
        one withheld non-claimable out-of-action DetachedGruntParticipant,
        one wounded PC (physicalDamage 5) holding a fullDefense actionHistory entry
When  the GM taps Join and takes the pull path
Then  the row comes back as an NpcRowParticipant, members' filled boxes are
      4 / 0 / 10, lastDamageType/lastDamageValue/hasActed all round-trip
And   rowWoundModifier is 2, restored verbatim, not re-derived
And   the withheld grunt comes back as a DetachedGruntParticipant
And   the PC's actionHistory holds the *identity-shared* interruptTable entry,
      so canUseAction(fullDefense) is false
And   every restored participant's getCurrentInitiative() matches the broadcast
      value (Score pinned last, after the damage/attribute writes)
And   component.restoreWarning contains no occurrence of "undo"
```
This is the entanglement test. It fails loudly if
`GruntMember.fromSnapshot`'s back-door writes were mishandled, and it is the one
scenario where a careless removal produces silent, permanent data loss at a real
table.

### S8 — Delete a combatant, then add a new one

```
Given four participants, one of them "Ganger A" with a claim, an edge rating,
      a Reaction, an Intuition, a tie-breaker and an expanded stat panel
When  btnDelete_Click(Ganger A) is confirmed
Then  participants no longer contains Ganger A
And   every side map named in AC 14 has no entry for Ganger A
And   selectedActor is null if it was Ganger A
And   the next broadcast's participants array does not contain Ganger A's id
When  a new participant is added
Then  it receives a fresh id that is not Ganger A's
```
Covers the `forgetParticipant` / `forgetMapEntry` / `forgetSetEntry` rewrites —
the three places where deleting a `DoAction` wrapper without keeping its body
would leave the deletion un-performed.

## Open decisions — ALL RESOLVED 2026-08-24

Xavier approved every recommended default below, unchanged. They are no longer
open. The implementer must follow the "Recommended default" in each, and must
NOT re-open any of them. In particular:

- **D1 and D2 are explicitly OUT OF SCOPE for this change.** No "Clear
  interrupts" control, no Next-Pass confirmation. Instead, add both to
  `docs/FEATURE-BACKLOG.md` as follow-up entries as part of this work.
- **D3:** no safety net on Seize Initiative or Act.
- **D4:** delete the ~17 pure-undo tests; rewrite the 3 rule-asserting ones.
- **D5:** reword both `buildRestoreWarning()` branches (the legacy freeze is
  deliberately lifted for the undo clause only) and `confirmDestructiveJoin()`.
  Leave `confirmCreateShareSession` line 1236 and `server.js:534` alone.
- **D6:** delete `src/assets/undo.svg` and both `.njsproj` lines.
- **D7:** keep the `_field` + getter/setter convention as-is; update
  `ARCHITECTURE.md` §3 to restate its justification.

### 1. Is a replacement needed for a mis-tapped Interrupt Action?

**Grounding.** `btnAction_Click` (`battle-tracker.component.ts:5137-5146`) calls
`p.doAction(action)`, pushing an `Action` onto `actionHistory`.
`Participant.actionIniModifier` sums those into every `getCurrentInitiative()`.
`canUseAction` blocks re-selecting a `persist` action already present —
`fullDefense` is `iniMod: -10, persist: true` (`src/InterruptTable.ts`). There is
**no caller of `Participant.resetActions()` anywhere in `src/`** and no UI that
removes an entry from `actionHistory`. It clears only at
`softReset()` (`Participant.ts:690`). Undo is currently the sole correction path.

**Recommended default: no replacement in this change; wire `resetActions()` to a
"Clear interrupts" control as a separate, immediately-following change, and add
it to `docs/FEATURE-BACKLOG.md` as part of this work.** A deletion is easier to
review and revert when it adds nothing. If the control is later added, whether
clearing Full Defense mid-turn refunds the −10 is a table ruling, not a printed
rule — it belongs in `RULINGS.md`, not decided here.

### 2. Should `btnNextPass_Click` gain a confirmation?

**Grounding.** `btnNextPass_Click` (`battle-tracker.component.ts:4958-4993`)
calls `nextIniPass()` (−10 to every Score, status flips, `resetMemberActed()`)
and then `goToNextActors()`, which can cascade into `endInitiativePass()` →
`endCombatTurn()` → `softReset()` on everyone. The method **already computes
`const isRealNewPass = !this.combatManager.isOver()` at line 4984**, and
`CombatManager.isOver()` is the same predicate `endInitiativePass()` uses, so a
turn-ending tap is detectable *before* mutating. No "previous pass" control
exists.

**Recommended default: a confirmation only when `isOver()` is true, added as a
separate follow-up change.** A prompt on every tap is prompt fatigue on a
control used 2-4 times per turn; a prompt on the turn-ending tap is roughly once
per turn at the point of maximum cost. Note the check would have to run *before*
`nextIniPass()` (which itself moves Scores), not at line 4984's position.

### 3. Remove `ParticipantList`'s `log` parameter, or keep it as an ignored no-op?

**Grounding.** 4 production call sites and ~103 spec call sites pass `false`
(section F). Keeping the parameter avoids ~107 edits; removing it makes every
missed edit a compile error.

**Recommended default: remove it.** The 107 edits are pure deletions of `, false`
/ `(false)`, and TypeScript flags every one that is missed as an excess argument.
Leaving a parameter that does nothing is exactly the kind of vestigial API this
change exists to eliminate — `BattleTrackerComponent extends Undoable` is the
cautionary example already in the tree.

### 4. Delete the undo tests, or rewrite the ones asserting a rule?

**Grounding.** Three tests use undo as the *mechanism* for asserting an
initiative-maths rule: `npc-row.spec.ts:252` (the row's shared wound accumulator
gives the Score back), `grunt-heal-dv-input.spec.ts:117` and `:185` (a six-box
heal restores damage *and* score across two writes),
`action-log-readability.spec.ts:822` (a mis-keyed killing blow corrected by heal
rather than undo). The remaining ~17 test only chaptering.

**Recommended default: delete the ~17; rewrite the 3 (scenarios S3 and S4
above).** Deleting all 20 silently drops real coverage of the group-wound
accumulator's refund path — the very rule `RULINGS.md` 2026-08-07 turns on.

### 5. Reword `buildRestoreWarning()`'s legacy branch, which is deliberately frozen?

**Grounding.** `battle-tracker.component.ts:4502-4507` is the no-`gmState`
branch, and its doc comment (4482-4486) states it is kept "byte-for-byte
identical to the pre-change text" so a room persisted before the GM-only channel
shipped still reads correctly. It contains "and undo history - re-enter those by
hand." Three tests assert `toContain('undo history')` against these strings.

**Recommended default: reword both branches, dropping only the undo clause and
leaving every other item and the sentence structure intact.** The freeze existed
to protect the *accuracy* of the legacy message, and "undo history" is no longer
accurate in either branch. Update the three assertions
(`persistent-rooms.spec.ts:1681`, `:2250`; `gm-reconnect-state-loss.spec.ts:456`,
`:519`) accordingly. Leave `confirmCreateShareSession`'s "This cannot be undone."
(line 1236) and `server.js:534`'s comment alone — those are ordinary English,
not references to the feature.

### 6. Delete `src/assets/undo.svg`?

**Grounding.** Referenced by nothing under `src/` (the toolbar used Font Awesome
`fa-undo`); listed in `BattleTracker.njsproj:55`. That same project file also
lists `src\classes\UndoHandler.ts`, a path that has not existed for some time —
so the `.njsproj` is already stale and is not a reliable index of what ships.

**Recommended default: delete the asset and both `.njsproj` lines.** Low risk;
the build is driven by `angular.json`, not `.njsproj`.

### 7. Anything to preserve about the `_field` + getter/setter convention?

**Grounding.** `ARCHITECTURE.md` §3 presents the convention as enforced by
`Undoable.Set`'s throw. Once that throw is gone, the convention is held only by
`PARTICIPANT_BASE_BACKING_FIELDS` (`Participant.ts:100-112`), which `clone()`,
the four subclass `clone()` overrides and the four GM-component promote/demote
helpers all read by name.

**Recommended default: keep the convention exactly as-is and update
`ARCHITECTURE.md` §3 to state its new justification** —
`PARTICIPANT_BASE_BACKING_FIELDS` and the type-swap/clone machinery, not undo.
Do **not** attempt to collapse backing fields into plain public properties in
this change; that would silently break `clone()`, the promote/demote helpers and
the GM-only rejoin channel, and is a separate piece of work.
