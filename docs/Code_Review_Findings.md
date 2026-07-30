# BattleTracker — Code Review Findings

**Findings document, not a fix plan.** Decomposition into agent prompts happens after this doc is reviewed.

Prepared: 2026-05-13
Scope: codebase at `main` @ `9181606`
Companions: `docs/SR5E_Matrix_Module_Plan.docx`, `docs/Persistent_Characters_Plan.md`

---

## 1. What this is

A catalogue of issues found while reviewing the codebase. Each item has an ID, a one-line summary, a "why it matters" note, an approximate file:line citation where one exists, and a tag indicating whether it interacts with the Matrix Module Plan, the Persistent Characters Plan, or stands alone.

This document does **not** prescribe an order, does **not** assign agents, and does **not** include prompts. Those decisions come after you've decided which findings are worth actioning.

Items are grouped by severity, not by file. The IDs (B1, S1, A1, …) are stable so we can reference them later when writing prompts.

---

## 2. Bugs (B-series)

Real defects with observable wrong behaviour.

### B1. `selectedActor` / `selectActor` typo in details panel guard
- **Where**: `src/app/battle-tracker/battle-tracker.component.html:327`
- **What**: The `@if` guard reads `selectedActor !== null && selectActor !== undefined`. `selectActor` (no "ed") is the *method* on the component, which is always truthy. The right-hand side never gates anything.
- **Why it matters**: The details panel renders whenever `selectedActor !== null` — including for participants that have been deleted (the reference can linger in `_selectedActor` until something else clears it).
- **Fix scope**: One-character template fix + nulling `selectedActor` in `btnDelete_Click` after the participant is removed.
- **Interactions**: Persistent Characters v1 indirectly relies on this guard working correctly when the player-view shows a claimed participant in the details column.

### B2. `copyParticipant` treats name as regex and mutates the source
- **Where**: `src/Combat/CombatManager.ts:170-214`
- **What**: Two bugs in the same function.
  - `participant.name.match(name)` (line 193) treats `name` as a regex pattern. Names containing `.`, `*`, `(`, etc. misbehave; "Troll" silently substring-matches "Trollkin Boss".
  - The `if (high === 0)` branch (line 207-209) mutates `p.name` (the source participant being duplicated) as a side effect, renaming it from "Razor" to "Razor 1".
- **Why it matters**: Duplicating a grunt mid-combat surprises the GM by renaming the original; PC names with punctuation produce wrong numbering.
- **Fix scope**: Replace regex match with literal-string handling. Don't touch `p.name` — only set `copy.name`. Add unit tests for names with regex metacharacters and overlapping prefixes.
- **Interactions**: None.

### B3. CDK drag-drop reorder bypasses undo
- **Where**: `src/app/battle-tracker/battle-tracker.component.ts:198`
- **What**: `drop()` uses `moveItemInArray` and directly assigns `sortOrder` on each participant. None of these mutations go through `UndoHandler.StartActions()` or `UndoHandler.DoAction(...)`.
- **Why it matters**: Every other GM action is undoable. Drag-reorder is the one exception. Ctrl-Z after an accidental reorder does nothing.
- **Fix scope**: Wrap the reorder in `UndoHandler.DoAction(...)` capturing the previous order.
- **Interactions**: None.

### B4. First participant added by constructor isn't undoable
- **Where**: `src/app/battle-tracker/battle-tracker.component.ts:194` (constructor calls `addParticipant()`) versus `ngOnInit` calling `UndoHandler.Initialize()` and `StartActions()` at line 208.
- **What**: The constructor runs before `ngOnInit`. The first `addParticipant()` happens before undo is initialised, so undoing back to "no participants" is impossible.
- **Why it matters**: Cosmetic — the user sees an undo path that stops one step short. Worth fixing because the same constructor-side-effect pattern shows up elsewhere and makes the component harder to test.
- **Fix scope**: Move the seed `addParticipant()` from constructor to `ngOnInit` after `StartActions()`.
- **Interactions**: None.

### B5. `onChange(e)` is a `console.log` stub
- **Where**: `src/app/battle-tracker/battle-tracker.component.ts:1550`
- **What**: A leftover handler that just logs the event. Not bound to anything I could find.
- **Why it matters**: Dead code. If anyone ever binds it accidentally, they get console spam in prod.
- **Fix scope**: Delete the method.
- **Interactions**: None.

### B6. `isDeclaredActionSelectionValid` compares against a localised message string
- **Where**: `src/app/battle-tracker/battle-tracker.component.ts:892` and `src/app/player-view/player-view.component.ts:510`
- **What**: Validity is computed by string-equality against the "Valid action set. Ready to submit." literal. The instant anyone edits that text — for i18n, copy polish, or just typo fix — every action submission silently breaks.
- **Why it matters**: Stringly-typed logic in load-bearing code, duplicated across two components, with two *different* literals. The two implementations have already diverged.
- **Fix scope**: Refactor to return `{ valid: boolean, message: string }` (or a separate `isValid()` and `getMessage()`), make the player and GM agree on rules.
- **Interactions**: Touches both the GM component and player-view. The dedup work in §A6 below would naturally subsume this.

### B7. `participantTieBreakers` random values are outside the undo system
- **Where**: `src/app/battle-tracker/battle-tracker.component.ts:170`, generated in `addParticipant`, `copyParticipant`, `upsertPlayerParticipant`
- **What**: Tie-breaker random numbers are stored in a `Map<IParticipant, number>` that is not wired into `UndoHandler`. `restoreFromSharedState` doesn't preserve them either.
- **Why it matters**: When a GM rejoins a session, tie-breakers reset. Two participants who tied on initiative may flip order silently. Undoing a `copyParticipant` doesn't restore the original tie-breaker.
- **Fix scope**: Move the random seed selection into the undo chapter, or persist the tie-breaker in `SharedParticipantState`.
- **Interactions**: None directly; the persistent-characters plan does not address it either.

### B8. `isInFullDefense` uses `==` and a magic string
- **Where**: `src/Combat/Participants/Participant.ts:317`
- **What**: `a.key == "fullDefense"`. Loose equality and string-key coupling.
- **Why it matters**: Strict mode is on; this is a lint smell that's outlived multiple refactors.
- **Fix scope**: `===` and either a constant or a flag on the action.
- **Interactions**: None.

### B9. `getDeclaredActionDetails` builds an unused `label`
- **Where**: `src/app/battle-tracker/battle-tracker.component.ts:838`
- **What**: A `const label = ...` is computed and never used.
- **Why it matters**: Dead variable inside live code is a smell.
- **Fix scope**: Remove the line.
- **Interactions**: None.

### B10. `isDeclaredActionSelectionValid(sender)` declares an unused `selection`
- **Where**: `src/app/battle-tracker/battle-tracker.component.ts:891`
- **What**: Local `const selection = this.getDeclaredActionSelection(sender)` is never referenced inside the method.
- **Fix scope**: Remove. Subsumed by B6 if that gets fixed properly.

---

## 3. Security & wire-protocol (S-series)

Trust assumptions in `server.js` and `session-sync.service.ts`. Acceptable for "GM + 3 friends on the same LAN"; risky for any wider deployment.

### S1. CORS is wide open
- **Where**: `server.js:14`
- **What**: `cors: { origin: "*" }`
- **Why it matters**: Any web origin can connect a Socket.IO client to a hosted server. For a private LAN deployment this is fine; for anything exposed to the internet it isn't.
- **Fix scope**: Env-var allowlist (`process.env.ALLOWED_ORIGINS`), default `"*"` only when unset so dev is unaffected.

### S2. No role enforcement on any event
- **Where**: All handlers in `server.js`
- **What**: A connected socket can emit:
  - `session:update-state` and overwrite the whole combat state for the room
  - `session:command` with `player: "GM"` and impersonate the GM
  - `gm:close-session` and nuke any room
- **Why it matters**: Any player can rewrite the combat or close the session. Friend-mode trust model is on full display.
- **Fix scope**: Stamp role on the socket at join time (already partially done — `socket.data.role`); reject events that don't match. Validate `command.player` against the socket's known identity.
- **Allowlist note**: The command-type allowlist must include the Matrix Module's new types: `matrix_jack_in`, `matrix_state_update`, `os_prompt_response`, `roll_modifier_prompt`, `roll_modifier_response`, plus existing types (`register_character`, `claim_character`, `release_claims`, `roll_submission`, `act`, `delay`, `interrupt`, `dice_roll`, `combat_ended`, `clear_roll_prompt`, `request_rolls`). Coordinate with Matrix Phase 2 before tightening.

### S3. No payload schema validation
- **Where**: All handlers in `server.js`
- **What**: Untyped JS handlers accept whatever the client sends. A malformed `state` becomes the cached state for the room.
- **Why it matters**: Bad clients can poison the room. Schema corruption survives server restart only briefly (in-memory `sessions: Map`) but ruins the current session.
- **Fix scope**: Handwritten guards per event — `room` is a 6-char uppercase string, `state` has `round: number` and `participants: array`, etc. Reject malformed messages; emit `session:error` back to the offender. No new deps.

### S4. No payload size caps
- **Where**: All handlers in `server.js`
- **What**: `session:update-state` and `session:append-log` accept arbitrary-size JSON.
- **Why it matters**: One client can fill the server's memory or the log buffer.
- **Fix scope**: ~64 KB cap on state, ~2 KB cap per log entry.

### S5. Player tokens are client-generated and ephemeral
- **Where**: `src/app/player-view/player-view.component.ts:101`
- **What**: `playerToken = pl- + Math.random().toString(36).slice(2,10)`. Regenerated on every page load.
- **Why it matters**: No notion of "the same player came back." Also the player can change their own token in the console and impersonate another player's claim.
- **Fix scope**: Persistent Characters v1 fixes the *ephemeral* part (`playerToken` persisted to localStorage). The *unforgeable* part is a server-side identity feature and belongs to the v2 plan.

### S6. `SessionSyncService` listeners are one-at-a-time
- **Where**: `src/app/services/session-sync.service.ts:145-163`
- **What**: `onState`, `onLog`, `onCommand`, `onSessionClosed` each call `socket.off(event)` before `on(event)`. Only one subscriber per event can exist at a time.
- **Why it matters**: Today only one subscriber exists per event so the bug is latent. The instant a second component wants to listen — Matrix Phase 4's `MatrixPlayerViewComponent` is a likely candidate — the first subscription silently dies.
- **Fix scope**: Return a `Subscription` or expose `Observable`s.

### S7. No reconnect or session resume
- **Where**: Whole client architecture
- **What**: If the Socket.IO connection drops, neither the GM nor the player has a path to resume. The player loses their token; the GM loses their share state.
- **Why it matters**: Real networks drop. Today this is "refresh the page, restart the session."
- **Fix scope**: Out of scope for now — flagged for awareness. Persistent Characters v1's stable `playerToken` is half of the story (player can rejoin and claim); the other half (GM can resume the same room) needs server changes.

---

## 4. Architecture (A-series)

Patterns that aren't bugs but make every change harder than it should be.

### A1. Mixed singletons and DI
- **Where**: `src/Combat/CombatManager.ts:252` (`export default new CombatManager()`), `src/Combat/ActionHandler.ts:36`, `src/Logging/LogHandler.ts:37`, `src/Common/UndoHandler.ts:132`
- **What**: Four module-level singletons via `export default new X()`. Meanwhile `SessionSyncService`, `ConfirmationDialogService`, `VersionService` are properly Angular-injected. The Matrix Module Plan adds `MatrixStateService` and `OsTrackingService` — both properly injected.
- **Why it matters**: Cannot run two GM tabs in the same browser. Cannot unit-test in isolation. Half-injected codebase confuses contributors about which pattern to use next. `Participant.getCurrentInitiative()` even reaches into the `CombatManager` singleton directly.
- **Fix scope**: Convert the four singletons to `@Injectable({providedIn: 'root'})`. Update all consumers. Significant refactor; touches many files.
- **Interactions with Matrix**: The Matrix plan keeps these as singletons (it inherits the current pattern). Converting them would be a coordinated change across both plans.

### A2. Stringly-typed reflective undo
- **Where**: `src/Common/UndoHandler.ts:51` (`HandleProperty(obj, prop, val)`), `src/Common/Undoable.ts`
- **What**: Every undoable property = backing field `_propName` + getter + setter calling `this.Set("propName", val)`. `UndoHandler` reads `obj["_" + prop]` to capture old value. Typos in the property name throw at runtime, not compile time.
- **Why it matters**: `Participant.ts` is 380 lines and roughly 200 of them are boilerplate for this pattern. `MatrixParticipant` (Matrix Phase 1) adds ~12 more undoable properties — that's ~120 more boilerplate lines, in a class that already inherits the same problem from `Participant`. Cost of the pattern is paid forever.
- **Fix scope**: Two options. (a) A proxy-based implementation: any property write on an `Undoable` automatically records to undo. (b) A snapshot-based implementation: undo captures a JSON snapshot of the model before each chapter. Either replaces ~200 lines of `Participant` with ~10. Big refactor.
- **Interactions with Matrix**: Matrix Phase 1 inherits the existing pattern. Refactoring now would be a coordinated change. Refactoring later is straightforward because the `Set(prop, val)` API is the contract.

### A3. `BattleTrackerComponent` is 1971 lines and growing
- **Where**: `src/app/battle-tracker/battle-tracker.component.ts`
- **What**: Single component owns: GM combat state, share-session lifecycle, declared-action validation and selection, log animation, claimable-participant management, side-table bookkeeping for player stats, tie-break logic, initiative prep, damage-delta detection, Tab keyboard navigation.
- **Why it matters**: The Matrix Module Plan adds substantial new logic to this file (badge rendering, OS prompt wiring, MatrixParticipant casting in `getSharedParticipants`, Matrix run panel integration). Without breaking up the existing component, this file heads to 2500+ lines.
- **Fix scope**: Extract `ShareSessionController` (share/sync responsibilities), `PlayerParticipantRegistry` (the 8 side-tables), and possibly a `DeclaredActionPresenter` (validation + selection state). Component drops to ~900 lines.
- **Interactions with Matrix**: **High-conflict zone.** Doing this refactor concurrently with Matrix Phases 1–3 would produce serious merge pain. Best done either entirely before Matrix work or entirely after Matrix Phase 3 lands.

### A4. Eight `Map<IParticipant, …>` side-tables in `BattleTrackerComponent`
- **Where**: `src/app/battle-tracker/battle-tracker.component.ts:164-171`
- **What**: `participantIds`, `participantOwners`, `participantClaimable`, `participantEdgeRatings`, `participantReactions`, `participantIntuitions`, `participantTieBreakers`, `lastKnownDamage`. All keyed on `IParticipant` references; each must be manually cleared on delete (lines 1207-1213) and on `restoreFromSharedState` (lines 685-693).
- **Why it matters**: Memory leak risk — if any code path forgets `delete` on remove, the participant lives forever via the map ref. Synchronisation cost: every new side-table needs cleanup in two places. The Matrix Module Plan acknowledges this and recommends putting Matrix data on the subclass instead of more side-tables.
- **Fix scope**: Either (a) consolidate into a single `Map<IParticipant, ParticipantMetadata>` with one cleanup point, or (b) move the data onto `Participant` itself (subclass for Matrix, see A1's discussion).
- **Interactions with Matrix**: Matrix plan already declines to add more side-tables. The Matrix Phase 1 agent and any agent fixing this should agree on the pattern.

### A5. `Participant.getCurrentInitiative()` reads from the `CombatManager` singleton
- **Where**: `src/Combat/Participants/Participant.ts:278`
- **What**: Pure model class imports the manager singleton to read the current initiative pass.
- **Why it matters**: Couples the model to global state. Cannot have two combats. Tests must monkey-patch the singleton.
- **Fix scope**: Pass the pass number as an argument, or expose initiative as a function of the pass.
- **Interactions**: Subsumed by A1 if singletons are converted to services.

### A6. Massive duplication between `BattleTrackerComponent` and `PlayerViewComponent`
- **Where**: Both files, ~150+ lines of overlap
- **What**: Copy-pasted methods (sometimes verbatim, sometimes slightly diverged):
  - `matrixChars`, `randomMatrixChar`, `buildDecodeFrame`, `startLogDecode`, `clearLogDecodeAnimations`
  - `formatLogText`, `escapeHtml`, `getLogTextClass`
  - `clampInitiativeRoll`, `getInitiativeRollMax`, `clampRollToBounds`
  - `flashLogEntry` / `flashSharedLogEntry`
  - Declared-action state engine: `DeclaredActionSelection`, `canUseDeclaredAction`, `toggleDeclaredAction`, `canAddSimpleDuplicate`, `isRepeatableSimpleAction`, `getSimpleActionSelectionCount`, `removeOneSimpleActionSelection`, `formatActionListWithCounts`, `buildDeclaredActionLog`, `getDeclaredActionValidationMessage`
  - `physicalActionCategories` / `matrixActionCategories` getters, `matrixGroupOpen`, `toggleMatrixGroup`
- **Why it matters**: The implementations have already diverged. The player-side declared-action validator is significantly weaker than the GM's — a player can submit action sets the GM's own UI considers invalid (Simple + Complex combinations, Call-a-Shot without an attack, etc.).
- **Fix scope**: Extract `DeclaredActionEngine`, `LogFormatter`, `RollUtils` into `src/app/shared/`. Replace both components' inline copies.
- **Interactions with Matrix**: **Time-critical.** Matrix Phase 2 adds `RollModifierPromptComponent` to `src/app/shared/`. Doing the dedup *before* Matrix Phase 2 lands keeps merge surface low. Doing it after means coordinating folder layout.
- **Interactions with Persistent Characters**: Touches `player-view.component.ts` which v1 also touches. Coordinate.

### A7. The undo system is wired into `BattleTrackerComponent`'s `selectedActor`
- **Where**: `src/app/battle-tracker/battle-tracker.component.ts:183` (`set selectedActor(val) { this.Set("selectedActor", val); }`)
- **What**: Selecting a participant goes through the undo machinery. Ctrl-Z after a click reverts the selection before reverting the actual game state.
- **Why it matters**: Mildly surprising UX — undo eats a click before doing anything useful.
- **Fix scope**: Take `selectedActor` out of the `Undoable` path; it's view state, not model state.

### A8. Two registries for action metadata
- **Where**: `src/app/battle-tracker/battle-tracker.component.ts:93-108` (`actionLabels` + `actionDescriptions` for interrupts) vs `src/app/shared/declared-actions.ts:166` (`DECLARED_ACTION_DESCRIPTIONS` for declared actions)
- **What**: Two registries doing essentially the same job. Whoever adds a new action has to know which one to edit.
- **Fix scope**: Unify under one shared module.
- **Interactions with Matrix**: Matrix Phase 5 says it'll enrich `DECLARED_ACTION_DESCRIPTIONS` with OS amounts. Same registry it'll live in. Coordinate naming.

### A9. `ngReady()` template-call hack
- **Where**: `src/app/battle-tracker/battle-tracker.component.html:266` (`{{ ngReady() }}`) and the method at `battle-tracker.component.ts:1521`
- **What**: A template interpolation calls a component method on every change-detection cycle for the last row. Inside, the method calls `changeDetector.detectChanges()`.
- **Why it matters**: Angular fighting Angular. Cycle-per-row CD calls in a 2000-line component.
- **Fix scope**: Replace with `@ViewChildren` + `QueryList.changes`, or a microtask scheduled from `btnAddParticipant_Click`.

### A10. Three near-identical `inp*_KeyDown` handlers
- **Where**: `src/app/battle-tracker/battle-tracker.component.ts:1414-1519`
- **What**: `inpName_KeyDown`, `inpDiceIni_KeyDown`, `inpBaseIni_KeyDown` — same Tab/Shift-Tab focus-walk, different selector strings.
- **Fix scope**: One private `handleTabNav(e, selector)` plus `Element.closest('.participant')` instead of the hand-rolled `closestByClass`.

### A11. `Participant.clone()` manually copies 17 fields
- **Where**: `src/Combat/Participants/Participant.ts:249`
- **What**: Hand-coded copy of every backing field. Add a new field, forget the clone, and copies silently differ.
- **Why it matters**: Matrix Phase 1's `MatrixParticipant.clone()` will add another set of hand-copied fields. The pattern compounds.
- **Fix scope**: Snapshot-based clone (subsumed by A2 if undo refactor happens).
- **Interactions with Matrix**: Matrix Phase 1 explicitly notes this risk and tells the agent to override `clone()` with all Matrix fields. Doesn't solve the underlying pattern.

### A12. Dead Auth0 folder
- **Where**: `src/app/auth/auth.service.ts` (69 lines of commented-out code) and `src/app/auth/auth.config.ts` (real-looking Auth0 client ID)
- **What**: Vestigial Auth0 integration from before the upstream fork. Not imported, not used.
- **Why it matters**: Clutter. The committed client ID is presumably already burned (public repo) but is worth removing on principle.
- **Fix scope**: Delete the folder, update `src/app/auth/index.ts` accordingly.

### A13. Dead dependencies
- **Where**: `package.json`
- **What**: `bootstrap-slider`, `jquery`, `ts-helpers`, possibly `core-js` — no imports found in `src/`. `bootstrap-slider` is jQuery-based; you use `@angular-slider/ngx-slider` everywhere.
- **Fix scope**: Verify with grep, remove from `package.json`, `npm install`, confirm `ng build` still passes.

### A14. `emitDecoratorMetadata: true` in tsconfig
- **Where**: `tsconfig.json:7`
- **What**: Only needed by libraries like TypeORM. Angular doesn't use it. Produces the build warning you've learned to ignore.
- **Fix scope**: Set to false, verify build is clean.

---

## 5. UI / UX (U-series)

### U1. Mobile layout is unusable
- **Where**: `src/app/battle-tracker/battle-tracker.component.html` (participant row), `src/app/battle-tracker/battle-tracker.component.css` (`.detailsBar`)
- **What**: Per-row column counts add to more than 12 in xl mode (4-1-3-3-3 = 14). At smaller breakpoints rows break and stack unpredictably. The details panel is `position: fixed; right: 0; top: 10vh; height: 80vh` — overlays half the viewport on mobile.
- **Fix scope**: Responsive rework. Non-trivial.

### U2. Flood-fill state colors degrade input readability
- **Where**: `src/app/battle-tracker/battle-tracker.component.css:67,71,73,91`
- **What**: `.acting > * { background: rgba(100,255,100,1) !important; }`, `.ooc > * { background: rgba(255,0,0,1) }`, `.finished > * { ... }`, `.delaying > * { ... }`. Children inherit the flood colour at full opacity, including form inputs.
- **Why it matters**: Reading the dice-roll input on an acting participant means reading black text on near-fluorescent green.
- **Fix scope**: Use border accents or a single side stripe, not flood backgrounds. The cyberdeck skin (current default) likely overrides this; the base CSS is still the antipattern.

### U3. Five `ngx-slider`s for what should be number inputs
- **Where**: `src/app/battle-tracker/battle-tracker.component.html:368-410`
- **What**: Stats tab uses `ngx-slider` for Dices, Overflow, Physical Health, Stun Health, Pain Tolerance. Sliders are imprecise, slow, terrible on touch, and the values are set once per character.
- **Fix scope**: Replace with `<input type="number" min=... max=...>`. Drop the `@angular-slider/ngx-slider` dep if no other consumers remain.
- **Interactions with Matrix**: None directly. Matrix Phase 1 adds `MatrixParticipantBadgeComponent` to the inline row, not to the Stats tab. No collision.

### U4. Two ways to edit dice count
- **Where**: `src/app/battle-tracker/battle-tracker.component.html` — inline `gm-dice-count-input` at line 144 (writes to `p.dices` via `onParticipantDiceCountChanged`) vs the Stats tab slider at line 368 (two-way `[(value)]="selectedActor.dices"`).
- **Why it matters**: Two controls for the same value, different code paths, potential to silently disagree if the side-table logic ever drifts.
- **Fix scope**: Pick one. Inline is faster for combat; Stats-tab is more discoverable.

### U5. Action button "Interrupts" label never reflects state
- **Where**: `src/app/battle-tracker/battle-tracker.component.html:185`
- **What**: Always says "Interrupts" regardless of whether an interrupt is active (e.g. Full Defense).
- **Fix scope**: State-aware label or a small indicator on the trigger.

### U6. Native `title` tooltips
- **Where**: `[attr.title]` bindings throughout the battle-tracker template
- **What**: Native title tooltips are 700ms delayed, can't be styled, and don't show on touch. The codebase has nicer "details" twirl panels for the same content; two systems exist in parallel.
- **Fix scope**: Decide whether to lean on the twirl panel and remove the `title` redundancy, or replace `title` with an Angular tooltip directive (ng-bootstrap has one).

### U7. No keyboard shortcuts for common GM operations
- **Where**: Whole tracker
- **What**: Next pass, undo/redo, end turn, act for selected actor — all mouse-only. Only Tab navigation works in inputs.
- **Fix scope**: Add a small `@HostListener` keybindings table. Out of scope for any specific plan; quality-of-life.

### U8. "Matrix decode" log animation runs on every entry
- **Where**: `src/app/battle-tracker/battle-tracker.component.ts:1829`, `src/app/player-view/player-view.component.ts:619`
- **What**: 36ms `setInterval` per log entry until decode finishes. System entries ("Start Initiative Pass 2") get the full effect.
- **Why it matters**: Combat with frequent state changes accumulates active timers. Cute in moderation, distracting in volume.
- **Fix scope**: Animate only player-sourced entries; skip system entries. Or expose a toggle.

### U9. Initiative Prep card has four overlapping action buttons
- **Where**: `src/app/battle-tracker/battle-tracker.component.html:73-90`
- **What**: "Request Player Rolls", "Roll Remaining Non-Player", "Force Roll Outstanding", "Begin Combat Turn". Their enabled states have subtle conditional dependencies that aren't visually obvious.
- **Fix scope**: A single primary action plus an overflow menu for the force-rolls; or clear visual grouping.

### U10. End Combat button uses `btn-danger` like Delete
- **Where**: `src/app/battle-tracker/battle-tracker.component.html:47`
- **What**: Same red as the per-row Delete button. Visual collision; easy to misclick.
- **Fix scope**: Different colour or different placement.

### U11. Action history is invisible except for the Full Defense shield icon
- **Where**: GM template
- **What**: Multiple interrupts can be queued during a phase but only Full Defense shows a visual marker.
- **Fix scope**: A row of small badges for active interrupts per participant.

### U12. Drag handle is the whole row
- **Where**: `cdkDrag` on `.participant`
- **What**: Clicking anywhere on a row starts a drag operation, including the name input. Accidental drags while editing text are easy.
- **Fix scope**: Add `cdkDragHandle` on a dedicated grip element.

### U13. Damage logging spam in shared mode
- **Where**: `src/app/battle-tracker/battle-tracker.component.ts:589` (`recordDamageChanges`)
- **What**: Each call to `syncSharedState` (which happens after every state mutation) walks every participant and emits a log entry for any damage delta. If the GM ticks through several condition-monitor boxes, each tick emits its own log entry.
- **Fix scope**: Debounce, or buffer deltas until a higher-level commit point.

---

## 6. Sequencing notes vs other plans

### Matrix Module Plan (in flight)

| Finding | Recommended timing | Reason |
|---|---|---|
| Bug fixes (B1-B10) | Anytime, low conflict | Touches existing surfaces. Some files (`battle-tracker.component.ts`) also touched by Matrix work — coordinate or fix first. |
| Server hardening (S1-S4) | After Matrix Phase 2 finalises its new command types | The allowlist needs to include `matrix_jack_in`, `matrix_state_update`, `roll_modifier_prompt`, `roll_modifier_response`, `os_prompt_response`. |
| Listener model (S6) | Before Matrix Phase 4 | Phase 4 adds `MatrixPlayerViewComponent` to player-view which may want to subscribe; today's one-listener-at-a-time pattern would break. |
| Architecture A1, A2, A5, A11 | Either entirely before or entirely after the Matrix run | These rewire core patterns; doing it during Matrix Phases 1-3 is high-conflict. |
| Architecture A3 (slim component) | Either entirely before or entirely after Matrix Phases 1-3 | Same file, heavy modification. |
| Architecture A4 (side-tables) | Coordinate with Matrix Phase 1 | Matrix plan already prefers the subclass approach over side-tables; aligning here is cheap. |
| Architecture A6 (dedup to shared/) | **Before Matrix Phase 2** | Matrix Phase 2 adds `RollModifierPromptComponent` to `src/app/shared/`. Doing dedup first keeps the folder layout consensual. |
| Architecture A8 (action metadata) | Before or coordinated with Matrix Phase 5 | Phase 5 will enrich `DECLARED_ACTION_DESCRIPTIONS`. Settling registry naming first avoids rework. |
| Architecture A12, A13, A14 (dead code, deps, tsconfig) | Anytime | Independent. |
| UI U1-U13 | Anytime, but `U3` (sliders) touches the Stats tab which Matrix doesn't | Independent; do during a quiet patch. |

### Persistent Characters Plan (just produced)

| Finding | Interaction with v1 |
|---|---|
| B1 (`selectedActor` typo) | v1 doesn't touch the GM template but a player who claims a participant will populate `selectedActor` via owner sync; fix is independent. |
| B6 (validation string-equality) | The player-view path that v1 modifies sits adjacent to this; bundling is convenient. |
| A6 (dedup) | v1 adds new UI to `player-view.component.ts`. If dedup happens first, v1 imports the shared modules instead of inheriting more duplication. **Recommend A6 before v1.** |
| S5 (ephemeral player tokens) | v1 directly fixes the *ephemeral* part. The *unforgeable* part stays for v2. |
| S6 (listener model) | v1 may add a subscriber on `player-view`; fix before v1 if multiple subscriptions are needed. |
| U3 (sliders) | The decker form in v1 ships number inputs from the start; if U3 is done concurrently, no slider rework needed. |

---

## 7. Open questions

Things I'd want you to weigh in on before we decompose any of this into prompts.

1. **Severity ranking — which buckets matter most.** My instinct is bugs first, then dedup-before-Matrix-Phase-2, then everything else opportunistically. Your priorities may differ.
2. **Server hardening (S1-S4) — local or networked deployment?** If this only ever runs on the GM's laptop and players connect over LAN, S1-S4 are roughly zero-priority. If the server is on the internet, they're urgent. Which is it?
3. **Architecture A1 / A2 — do you want the singleton-to-service refactor at all?** It's a large change for a benefit that mostly accrues to testability and future-feature ergonomics. Saying "no, keep the singletons" is a defensible call.
4. **A3 (slim component) — risk tolerance during active Matrix work.** Refactoring `BattleTrackerComponent` while Matrix Phases 1-3 are also editing it produces merge pain. Three options:
   - Do A3 first, pause Matrix
   - Do Matrix Phases 1-3 first, then A3
   - Skip A3 entirely, accept the 2500-line component
5. **A6 (dedup) — confirm we do this before Matrix Phase 2 lands.** Matrix Phase 2 introduces `RollModifierPromptComponent` to `src/app/shared/`. If A6 lands first the folder is already populated with shared utilities; if Matrix Phase 2 lands first the dedup agent has to integrate around it. I'd lean strongly toward dedup-first; confirm.
6. **U1 (mobile) — is mobile actually a target?** The GM probably runs this on a laptop. Players might be on phones. If only the player view needs mobile, U1 is scoped to one component instead of two.
7. **U2 (state colours) — is the cyberdeck skin the truth?** Players likely never see the default skin since `app.component.ts:55` migrates everyone to cyberdeck. If so, the base CSS antipattern is a smell, not a defect.
8. **A12 / A13 (dead code, deps) — do you want me to be conservative or aggressive?** Conservative = just the obvious dead Auth0 folder. Aggressive = strip every unreferenced dep. The latter saves install time and audit surface but risks tripping over a transitive dep I missed.
9. **Anything missing from this catalogue?** I reviewed at depth but the codebase has surfaces I skimmed (`server.js` proxy config, the cyberdeck skin CSS, the dice-roller). Worth flagging if you've noticed specific issues there.

---

## 8. What's next

After this doc is reviewed and the questions in §7 are answered, we'll go through findings one at a time and produce agent prompts. The ID system (B1, S2, A6, …) is the handle — you can say "let's prompt B1, B2, B5 together" and I'll write that prompt. Some findings are too small to be solo prompts (B5 is one line); some are too big for one agent (A3); we'll group as appropriate.

Anticipated prompt families, very loosely:

- **Bug bundle** — B1, B2, B3, B4, B5, B8, B9, B10 in one prompt for one agent.
- **Validation rework** — B6 alone, or rolled into A6's dedup prompt.
- **Server hardening** — S1, S2, S3, S4 as one prompt, after the Matrix command types are finalised.
- **Listener model** — S6 as a small prompt.
- **Dedup** — A6 + A8 as one prompt, scoped to `src/app/shared/`.
- **Slim component** — A3 as a major prompt, scheduled around Matrix.
- **Dead code / deps / tsconfig** — A12 + A13 + A14 as one trivial prompt.
- **UI cleanup** — U3 (sliders) alone, others as opportunistic individual prompts.

The Matrix Phase 1 handoff also wants a small note appended: "consume `kind === 'matrix'` from `register_character`; see `docs/Persistent_Characters_Plan.md` §3.2." That's a sentence in their existing prompt, not a new prompt.

We'll write all of those one at a time, with you driving.
