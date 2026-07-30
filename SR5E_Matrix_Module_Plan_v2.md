# BattleTracker Matrix Tracker Module — Development Plan v2

**Shadowrun 5th Edition Initiative Tracker — Feature Addition**  
Prepared: May 13, 2026 · Updated: May 22, 2026  
Angular 19 · Socket.IO · TypeScript

---

## Table of Contents

1. [Overview & Goals](#1-overview--goals)
2. [Architecture Overview](#2-architecture-overview)
3. [Data Models](#3-data-models)
4. [New Angular Components](#4-new-angular-components)
5. [Services](#5-services)
6. [Incremental Build Steps](#6-incremental-build-steps)
7. [SR5E Rules Reference Cheat Sheet](#7-sre5-rules-reference-cheat-sheet)
8. [Effort Summary](#8-effort-summary)
9. [Testing Notes](#9-testing-notes)
10. [Open Questions / Design Decisions](#10-open-questions--design-decisions)
11. [Proposed File Structure](#11-proposed-file-structure)

---

## 1. Overview & Goals

This document is the full development plan for adding a Matrix Tracker module (`MatrixModule`) to BattleTracker, a Shadowrun 5e initiative tracker. The app is already built on Angular 19 standalone components, Socket.IO real-time sync, and a well-defined Participant/CombatManager engine with an undo/redo system.

The Matrix module needs to do three distinct things:

**1. Slot Matrix initiative** (VR hot-sim, VR cold-sim, AR) into the existing initiative tracker alongside physical participants, with no disruption to the existing engine.

**2. Track per-decker Overwatch Score (OS)** with threshold alerts at 20 and 40, auto-prompts when illegal actions are taken, and reset on jack-out. At OS 40, behaviour branches depending on whether the decker is inside a host (host convergence) or in public space (GOD convergence).

**3. Guide a freeform hacking workflow** (Jack In → Public Space → Locate Host → Access Host → Inside Host → Jack Out) that lets the GM manage targets, marks, IC spawning, and player-view reveals — rendered as a node graph in the player view.

The plan is organised into five implementation phases, each buildable and testable independently.

---

## 2. Architecture Overview

### 2.1 The Participant / CombatManager Engine

`CombatManager` is a singleton (exported as a default instance). It holds a `ParticipantList` and drives the initiative pass/turn lifecycle. Participants implement `IParticipant` — the interface that the engine cares about for scheduling.

Key points to respect:

- `getCurrentInitiative()` drives all ordering. Formula: `diceIni + baseIni − wm − (pass−1)×10 + actionIniModifier`. `dices` is the number of d6 rolled. For Matrix VR hot-sim deckers this should be set to 4; cold-sim 3; AR 1. `baseIni` must equal the sum of the two relevant stats. For Matrix: Data Processing + Intuition. Set this on the `MatrixParticipant` at jack-in time.
- VR catatonia does **NOT** use the `ooc` flag. A decker in VR is still in the initiative order and must still be tracked — they simply cannot take physical actions. The existing `ooc` flag is reserved for participants who are fully removed from scheduling (dead, fled, etc.). Instead, `MatrixParticipant` adds a `blocksPhysicalActions` flag that the action planner checks before presenting physical action options.
- Mid-combat jack-in or mode switch: a decker may jack in or switch interface modes during an active combat turn. When this happens, their initiative must be re-rolled using the new dice count and base, and they re-enter the tracker at that score for the current pass. `CombatManager.addParticipant()` handles insertion; the component triggers a re-sort.
- `CombatManager.addParticipant()` assigns `sortOrder`. Always call this instead of pushing directly.

### 2.2 The Undoable / UndoHandler Pattern

Every mutable class that should participate in undo/redo extends `Undoable`. Property setters must call `this.Set(propName, value)`, which talks to `UndoHandler`. The backing field must be named `_propName`.

```typescript
// Pattern: Adding a new undoable property
private _overwatch: number = 0;
get overwatch(): number { return this._overwatch; }
set overwatch(val: number) { this.Set('overwatch', val); }
// backing field is _overwatch

// Multi-step mutations must be wrapped:
UndoHandler.StartActions();
participant.overwatch += 2;
participant.someOtherProp = true;
// UndoHandler auto-closes the chapter on next StartActions() call
```

### 2.3 Side-Data Maps in BattleTrackerComponent

Several participant attributes (`reaction`, `intuition`, `edgeRating`, `ownerName`, `claimable`) are NOT on the `Participant` class — they live in Maps keyed on `IParticipant` references inside `BattleTrackerComponent`. Matrix-specific decker data (A/S/D/F, OS, VR mode, marks) follows the subclass approach rather than side-data Maps, because this data needs to survive session restores and sync to players.

### 2.4 Session Sync (Socket.IO)

The `SessionSyncService` broadcasts a `SharedCombatState` snapshot whenever state changes. `SharedParticipantState` is a plain serialisable DTO. The player view receives these snapshots and renders from them — it has no direct reference to `Participant` objects.

Any new Matrix state (OS, VR mode, targets, noise level, active grid) must be added to `SharedCombatState` (or a new `SharedMatrixState` extension). The GM broadcasts it via `sessionSync.broadcastState()`; the player view receives it via `session.onState()`.

New command types (e.g., `matrix_jack_in`, `os_update`) follow the existing `SessionCommand` pattern: type string + player string + payload object.

### 2.5 Angular Architecture Notes

The app uses Angular 19 standalone components — there is no NgModule. A 'MatrixModule' in practice means a folder `src/app/matrix/` containing standalone components that import each other.

`BattleTrackerComponent` already has `physicalActionCategories` and `matrixActionCategories` getters that filter the declared-actions list — and matrix action categories already exist in `declared-actions.ts`. The action planner is ready to present matrix actions; what is missing is the state management behind them.

### 2.6 Proposed File Structure

```
src/Matrix/                          — domain layer
  VRMode.ts
  ICType.ts
  MatrixParticipant.ts               extends Participant
  ICParticipant.ts                   extends MatrixParticipant
  MatrixTarget.ts
  MatrixHost.ts
  MatrixIcon.ts
  MatrixRunState.ts                  top-level state shape
  index.ts                           barrel export

src/app/matrix/                      — Angular feature folder
  matrix-run-panel/                  MatrixRunPanelComponent
  decker-status-card/                DeckerStatusCardComponent
  overwatch-score/                   OverwatchScoreComponent
  os-prompt/                         OsPromptComponent (modal)
  matrix-workflow/                   WorkflowStepperComponent
  jack-in-panel/                     JackInPanelComponent  ← logic only (see §4.6)
  public-space-panel/                PublicSpacePanelComponent
  locate-host-panel/                 LocateHostPanelComponent
  access-host-panel/                 AccessHostPanelComponent
  inside-host-panel/                 InsideHostPanelComponent
  target-card/                       TargetCardComponent
  ic-spawner/                        ICSpawnerComponent
  matrix-participant-badge/          MatrixParticipantBadgeComponent
  matrix-player-view/                MatrixPlayerViewComponent
  matrix-graph/                      MatrixGraphComponent  ← NEW

src/app/shared/
  roll-modifier-prompt/              RollModifierPromptComponent

src/app/services/
  matrix-state.service.ts            MatrixStateService
  os-tracking.service.ts             OsTrackingService
  icon-generator.service.ts          IconGeneratorService
```

---

## 3. Data Models

All models that hold mutable state must extend `Undoable`. Plain value objects (`MatrixTarget`, `MatrixHost`, etc.) are simple TypeScript classes/interfaces — they do not need `Undoable` if mutations are always made via `UndoHandler.DoAction()`.

### 3.1 VRMode Enum

```typescript
// src/Matrix/VRMode.ts
export enum VRMode {
  AR       = 'AR',
  ColdSim  = 'cold-sim',
  HotSim   = 'hot-sim'
}
```

### 3.2 MatrixParticipant (extends Participant)

This is the central class that represents a decker in the initiative tracker. It extends the existing `Participant` class and adds Matrix-specific state. IC participants use a separate `ICParticipant` subclass (see 3.4).

Design decision: subclassing is cleaner for this feature because (a) OS, A/S/D/F, and VR mode need to persist across session restores, (b) the player view needs to display decker-specific badges, and (c) IC spawning needs to build participants with Matrix condition monitors.

```typescript
// src/Matrix/MatrixParticipant.ts — key fields

// Deck attributes (ASDF)
attack: number;          // Attack
sleaze: number;          // Sleaze
dataProcessing: number;  // Data Processing — contributes to baseIni
firewall: number;        // Firewall
deviceRating: number;    // Deck Device Rating

// Matrix initiative state
vrMode: VRMode;          // AR | cold-sim | hot-sim
overwatch: number;       // OS score (0–39+ before Convergence)
jackedIn: boolean;       // true while connected

// Catatonia / action restriction
blocksPhysicalActions: boolean;
// true when in VR — participant stays in initiative order but physical actions
// are locked in action planner. Does NOT set ooc.

// Marks placed by this decker: Map<targetId, markCount>
marksPlaced: Map<string, number>;

// Computed:
// baseIni = dataProcessing + intuition (set at jack-in or mode switch)
// dices   = 4 (hot-sim) | 3 (cold-sim) | 1 (AR)
```

The constructor must call `super()` and initialise all backing fields (`_attack`, `_sleaze`, etc.) and register `Set()` setters for each. The `clone()` override must copy all Matrix fields.

**Overwatch thresholds:** The getter `overwatchAlert` returns `'none' | 'ic-alert' | 'convergence'` based on whether OS ≥ 20 or ≥ 40. Components use this to apply CSS classes. The convergence branch (host vs. GOD) is determined at display time by checking `MatrixRunState.currentHostId` (see §4.3 and §5.1).

**Physical action blocking:** In `BattleTrackerComponent`, the action planner checks `p.blocksPhysicalActions` before displaying physical action categories. The participant still appears in the tracker with their Matrix initiative score and acts normally in the pass structure.

### 3.3 MatrixTarget

Represents any interactive icon in the Matrix — whether in public space, floating in a host, or nested inside a host-within-a-host.

```typescript
// src/Matrix/MatrixTarget.ts
id:               string              // Unique (generated)
name:             string              // Display name
type:             'device' | 'file' | 'persona' | 'host' | 'ic'
personaOwner:     string | undefined  // For persona type: name/id of runner or NPC
context:          'public' | 'host'   // Where this icon currently lives
attack:           number              // A attribute (for IC, devices, personas)
sleaze:           number              // S attribute
dataProcessing:   number              // DP attribute
firewall:         number              // Firewall attribute
rating:           number              // General rating

// Device-specific fields (type === 'device' only):
deviceRating:     number              // Device Rating 1–12. Distinct from any host rating.
                                      // Used for Matrix CM formula and direct-connection tests.
directConnection: boolean             // GM toggle: true when decker is physically plugged in.
                                      // Node shows wire/plug icon when true.
                                      // Tests against a directly-connected device use deviceRating,
                                      // not the host's rating.
                                      // A mark placed via direct connection is applied to the HOST,
                                      // not the device — MatrixStateService auto-increments the
                                      // host's mark count for the relevant decker.
                                      // Only a decker with jackedIn: true may make a direct
                                      // connection (physical action requiring cyberdeck).

matrixDamage:     number              // Current Matrix CM damage
matrixHealth:     number              // Max Matrix CM boxes

// Visibility state — THREE states (replaces binary hidden/revealedToPlayers):
spotted: 'invisible' | 'ghost' | 'revealed'
// 'invisible' — not running silent, but not yet spotted (player hasn't looked).
//               Node NOT shown to players.
// 'ghost'     — running silent and decker's Matrix Perception test got a hit
//               confirming something is in the vicinity. Node shown to players
//               as a greyed/pulsing unknown icon; no identity revealed.
// 'revealed'  — spotted and identified. Node shown normally to players.
//
// Spotting rules (SR5E §Matrix Perception):
//   • Icons NOT running silent, within 100m of physical location → auto 'revealed'
//   • Icons NOT running silent, beyond 100m OR inside a host (once decker is inside) → auto 'revealed'
//   • Icons RUNNING SILENT → two-step:
//       (1) Matrix Perception hit → 'ghost'
//       (2) Opposed Computer+Intuition [DP] vs Logic+Sleaze → 'revealed'
//   • Icons with the decker's own mark on them → always 'revealed' regardless of distance
//   • Once 'revealed', stays revealed until: Hide action, reboot, or jack out

marks:            Record<string, number>   // marks[deckerId] = count (max 3 per decker)
linkedHostId:     string | null            // Which host this target lives in (null = public space)
linkedParticipantId: string | undefined    // For IC and personas: links to initiative tracker entry
```

**Visual differentiation guideline:** devices → chip/circuit icon; files → document icon; personas → humanoid avatar (color-coded: runner = cyan, corp spider = red, unknown = gray); IC → shield/hazard icon (red/orange); host → server/building icon. Devices with `directConnection: true` additionally show a wire/plug overlay icon. These are CSS class hints on `TargetCardComponent`, driven by `type`, `personaOwner`, and `directConnection`.

### 3.4 ICParticipant (extends MatrixParticipant)

IC is both a Matrix target (it has a condition monitor and can be spotted/hidden) AND an initiative tracker participant (it rolls initiative and takes turns). `ICParticipant` bridges both.

> **IC does NOT have its own Matrix attributes (A/S/D/F). It inherits the host's A, S, DP, and Firewall stats entirely for all tests (SR5E p.247).** The host reference is available via `hostRating` and the parent `MatrixHost` object held in `MatrixStateService`. Do not add separate `attack`, `sleaze`, `dataProcessing`, or `firewall` fields to `ICParticipant`.

> **IC uses the host's Data Processing attribute for all Matrix tests** (not a separate attribute). Resolve any IC Matrix test using the host's DP as the relevant dice pool component.

```typescript
// ICParticipant additional fields (beyond MatrixParticipant)
icType:          ICType    // Patrol | Killer | Acid | Blaster | Sparky | Scramble | TarBaby
hostRating:      number    // Copied from host at spawn; used for initiative formula
linkedTargetId:  string    // The MatrixTarget record this IC corresponds to

// Initiative formula (SR5E p.247):
//   baseIni = hostRating × 2
//   dices   = 4 (all IC except Patrol) | 2 (Patrol IC)
//   Note: baseIni × 2 reflects the "hot-sim" treatment for IC.
```

**Shared marks (host-wide mark propagation):** When any mark is placed on this IC participant OR on the host itself, ALL IC in the same host AND the host itself immediately share that mark. The `marks` Record on both the `ICParticipant`'s linked `MatrixTarget` and the `MatrixHost` must be synchronised by `MatrixStateService.addMark()`. Conversely, if the host detects (spots) a decker, all IC in the host instantly gain awareness — `MatrixStateService` must propagate the spotted-decker signal to all active IC in the host. See §3.6 for the host-level field.

### 3.5 ICType Enum

```typescript
// src/Matrix/ICType.ts
export enum ICType {
  Patrol   = 'Patrol',
  Killer   = 'Killer',
  Acid     = 'Acid',
  Blaster  = 'Blaster',
  Sparky   = 'Sparky',
  Scramble = 'Scramble',
  TarBaby  = 'Tar Baby'
}
```

### 3.6 MatrixHost

Represents a target host: has A/S/D/F stats, a rating, a condition monitor, and a list of contained targets.

```typescript
id:             string           // Unique
name:           string           // e.g. 'Aztechnology R&D Host'
attack:         number           // A attribute
sleaze:         number           // S attribute
dataProcessing: number           // DP attribute — also used by all IC in this host for Matrix tests
firewall:       number           // Firewall attribute
rating:         number           // Host Rating (1–12)
matrixDamage:   number           // Current host CM damage
matrixHealth:   number           // Host CM boxes (8 + Rating/2, round up)
targets:        MatrixTarget[]   // Contents of the host
accessMethod:   'none' | 'hack-on-fly' | 'brute-force' | 'direct-connection'
deckerInside:   string[]         // IDs of deckers currently inside
icActive:       ICParticipant[]  // IC currently active in this host

// Shared marks (host-wide propagation):
// marks[deckerId] = count — the canonical mark count for this host/all its IC.
// When MatrixStateService.addMark() is called for ANY target inside this host (or
// for the host itself), it must also update this field and mirror it to every
// ICParticipant's linked MatrixTarget. The player view reads from this field.
marks:          Record<string, number>

// IC spawning constraints (SR5E p.247):
// • A host may spawn ONE IC program per Combat Turn, at the START of the turn only.
// • Maximum concurrent IC = Host Rating (icActive.length must not exceed rating).
// • No two IC of the same ICType may run simultaneously in the same host.
// • When IC is bricked (Matrix CM filled), the host CAN respawn it at the start of
//   the NEXT Combat Turn (subject to the one-per-turn and max-concurrent limits).
// ICSpawnerComponent enforces all four constraints before calling addParticipant().
```

### 3.7 MatrixRunState

The top-level state object for the current Matrix run. A single instance lives in `MatrixStateService`.

```typescript
// MatrixRunState fields (held in MatrixStateService)
hosts:          MatrixHost[]          // All known hosts this session
publicIcons:    MatrixIcon[]          // Public space icons
currentHostId:  string | null         // Which host the GM is currently viewing
                                      // Also used by OverwatchScoreComponent to branch
                                      // convergence behaviour at OS 40.
deckers:        MatrixParticipant[]   // Reference list of all decker participants
workflowStep:   MatrixStep            // Current phase of hacking workflow

// GM scene-level parameters (NEW):
noise:          number                // Flat dice pool penalty applied to ALL Matrix tests
                                      // in this scene. Default 0. GM adjusts at any time
                                      // via ± control in MatrixRunPanelComponent header.
                                      // Passed through SharedCombatState so player view
                                      // can display current noise level.
activeGrid:     'public' | 'corporate' | 'prime'
                                      // The grid the current scene is on.
                                      // Affects connection costs and dice pool modifiers.
                                      // Shown as a toggle/dropdown in the panel header.
                                      // Default 'public'.
```

**Noise in practice:** `noise` is a scene-level field, not a per-roll modifier. `RollModifierPromptComponent` (§4.16) can add it as a pre-populated preset named "Noise" when the GM opens a roll prompt, so the GM sees it but can adjust per-roll. The static `noiseLevel` field removal from the original design is reversed — `noise` is now an explicit GM-settable scene parameter that persists across rolls.

**JackInPanelComponent update:** Remove any noise input from the jack-in form. Noise is set in the panel header, not per-decker.

### 3.8 MatrixIcon (Public Space)

```typescript
id:           string    // Unique
name:         string    // Generated, e.g. 'Aztechnology Commlink 7F'
iconType:     'commlink' | 'spam' | 'vehicle-node' | 'sensor' | 'misc-device'
deviceRating: number    // 1–4 (random for public)
promoted:     boolean   // true if GM promoted to a real MatrixTarget
```

### 3.9 SharedCombatState Extensions

```typescript
export interface SharedMatrixParticipantState extends SharedParticipantState {
  isMatrix?:       boolean;
  vrMode?:         string;           // 'AR' | 'cold-sim' | 'hot-sim'
  overwatch?:      number;
  overwatchAlert?: string;           // 'none' | 'ic-alert' | 'convergence'
  jackedIn?:       boolean;
  isVRCatatonic?:  boolean;
}

export interface SharedMatrixTarget {
  id:             string;
  name:           string;
  type:           string;
  spotted:        'invisible' | 'ghost' | 'revealed';
  // 'invisible' targets are omitted from the broadcast entirely (not sent to players).
  // 'ghost' targets are sent with type='unknown', name omitted.
  // 'revealed' targets are sent in full.
  marks:          Record<string, number>;
  matrixDamage:   number;
  matrixHealth:   number;
  directConnection?: boolean;        // Devices: true = show wire/plug icon in player view
}

// On SharedCombatState add:
matrixTargets?:   SharedMatrixTarget[];
currentHostName?: string;
matrixNoise?:     number;            // Current scene noise level (from MatrixRunState.noise)
matrixGrid?:      'public' | 'corporate' | 'prime';  // Current active grid
```

---

## 4. New Angular Components

All new components are standalone. They live under `src/app/matrix/`. `BattleTrackerComponent` and `PlayerViewComponent` import selected components from this folder.

### 4.1 MatrixRunPanelComponent

The main container for all Matrix run activity. Rendered inside `BattleTrackerComponent` as a collapsible section. Uses a **two-pane layout** with a top strip and header controls.

**Top strip (always visible when panel is open):** One `DeckerStatusCardComponent` (§4.2) per `MatrixParticipant`. The GM sees every decker's jack-in status, VR mode, OS, and Jack In/Out controls at a glance — the primary at-a-glance decker status view during both freeform out-of-combat Matrix runs and active combat.

**Header controls:** Noise ± control (default 0), Grid selector (`public` / `corporate` / `prime`), and Active Host banner (shown when `currentHostId` is set). These bind to `MatrixRunState.noise` and `MatrixRunState.activeGrid`. Any change triggers `syncSharedState()`.

**Reference strip:** A compact `WorkflowStepperComponent` (§4.5) sits above or alongside the panes. It auto-highlights the current phase based on run state. Purely informational — no navigation is tied to it, no panel switching. GMs can ignore it entirely.

**Left pane — Hierarchy editor:** GM's management tool for all Matrix objects, organised as a collapsible tree (hosts → contents, public space icons, loose devices). Host creation, target CRUD, and IC spawning controls live here.

**Right pane — Node graph (stub in Steps 4–8):** Renders a placeholder `<div class="graph-stub">Matrix Graph — coming in Step 9</div>` until `MatrixGraphComponent` is built in Step 9. When complete, GM sees ALL nodes (including invisible/ghost) with visibility badges; players see only revealed/auto-visible nodes.

**Inputs:** `activeDeckers: MatrixParticipant[]`, `matrixRunState: MatrixRunState`  
**Emits:** `jackOut` (relayed from `DeckerStatusCardComponent`)

### 4.2 DeckerStatusCardComponent

*(Previously DeckerCardComponent — expanded role: now owns jack-in/out UX as well as status display.)*

Compact status card for a single decker. One card per `MatrixParticipant` in the top strip of `MatrixRunPanelComponent`. This is the **primary jack-in UX**; `JackInPanelComponent` is demoted (see §4.6).

**Inputs:** `decker: MatrixParticipant`  
**Emits:** `jackIn(vrMode: VRMode)`, `jackOut(deckerId: string)`

**Display:**
- Name
- Jack-in status badge: NOT JACKED IN / AR / COLD-SIM / HOT-SIM
- VR CATATONIC indicator when `blocksPhysicalActions = true`
- OS counter — green (0–19), amber (20–39 IC alert), red (40+ Convergence)
- A/S/D/F values

**Jack In flow:** Clicking "Jack In" opens a small inline mode selector (AR / COLD / HOT). On confirm, the card calls `MatrixStateService.jackIn(decker, vrMode)`, which updates `decker.vrMode`, `decker.dices` (4/3/1), `decker.baseIni = DP + INT`, `decker.jackedIn = true`, `decker.blocksPhysicalActions = (vrMode !== AR)`. If jacking in mid-combat, immediately triggers initiative re-roll and re-sorts the tracker.

**Jack Out flow:** "Jack Out" button emits `jackOut`. Parent calls `MatrixStateService.jackOut(decker)` + `osTrackingService.resetOS(decker.id)`. If `decker.hostConverged === true`, shows a convergence warning modal *before* completing the jack-out: *"demiGOD traces you the moment you surface — Convergence attack incoming."* Then dumps the decker.

### 4.3 OverwatchScoreComponent

Dedicated OS counter widget, usable inside `DeckerCardComponent` or standalone.

Displays current OS, threshold badges (IC ALERT at 20, CONVERGENCE at 40), and ± manual adjustment buttons.

- At OS ≥ 20: amber highlight, 'IC ALERT' badge
- At OS ≥ 40: **convergence branch on host context:**
  - If `MatrixRunState.currentHostId === null` (decker is NOT in a host): show existing modal — *"CONVERGENCE — GOD has traced you. Decker is burned and dumped."* — existing behaviour, unchanged.
  - If `MatrixRunState.currentHostId` is set (decker IS inside a host): show new modal — *"HOST CONVERGENCE — [Host Name] has 3 marks on you. IC deploying. Do NOT jack out."* — and auto-apply 3 marks to the decker from the host via `MatrixStateService.addMark()`. The decker is NOT dumped. If they jack out of the host after this event, demiGOD converges immediately outside (show a second warning modal on jack-out in this state).
- Reset button clears OS (on jack-out); prompts confirmation.

### 4.4 OsPromptComponent

Modal dialog shown when a decker takes an illegal Matrix action (Brute Force, Hack on the Fly, etc.) during initiative.

Presents the RAW OS addition amount, allows the GM to accept, modify (number input), or cancel.

**Inputs:** action name, `suggestedOS: number`  
**Output:** confirmed OS delta (number) or null for cancel  
Called by the action planner submit path in `BattleTrackerComponent`.

### 4.5 WorkflowStepperComponent

*(Previously MatrixWorkflowComponent — converted from navigable stepper to passive phase indicator.)*

Renders the seven-step workflow as a compact strip: **Jack In → Public Space → Locate Host → Access Host → Inside Host → Target Interaction → Jack Out.**

**Passive indicator only.** No click handlers for navigation — clicking a step does nothing (or optionally shows the info tooltip). There is no panel-switching tied to this component. The GM works directly in the hierarchy editor (left pane); this strip is a read-only phase reference.

**Auto-highlight logic** driven by `MatrixRunState`:
- *Jack In* lit when any decker has `jackedIn: true`
- *Locate Host* lit when `currentHostId` is set
- *Inside Host* lit when `currentHostId` is set and at least one decker is in `host.deckerInside`
- Other steps are stateless — highlighted as a workflow guide only

Each step has an info **tooltip** (hover or tap) with a one-line SR5E rule summary (e.g. *"Public Space: Icons not running silent within 100m are auto-revealed."*).

**Inputs:** `matrixRunState: MatrixRunState`

### 4.6 JackInPanelComponent *(Demoted — logic only)*

The stand-alone jack-in form panel is **no longer the primary jack-in UX.** That role has moved to `DeckerStatusCardComponent` (§4.2).

The **logic** that was in this panel — initiative re-roll on mode change, `baseIni`/`dices` computation, `blocksPhysicalActions` update, OS reset on jack-out, `hostConverged` check on jack-out — must be extracted into `MatrixStateService` methods:

- `jackIn(decker: MatrixParticipant, vrMode: VRMode): void`
- `jackOut(decker: MatrixParticipant): void`

`DeckerStatusCardComponent` calls these methods directly. `JackInPanelComponent` may be removed entirely or kept as an internal shell — it **must not** be rendered as a stepper panel in `MatrixRunPanelComponent`.

**No noise input anywhere in the jack-in flow.** Noise is a scene-level GM parameter in the panel header (§4.1).

### 4.7 PublicSpacePanelComponent

Step 2 content. Displays public Matrix icons. Contains the Icon Generator.

- Icon list: shows generated commlinks, spam, vehicle nodes, etc. with Device Rating
- 'Generate N Icons' button: calls `IconGeneratorService.generate(n)`
- Each icon has a 'Promote' button to elevate it to a full `MatrixTarget`
- Hidden devices note: GM clicks 'Reveal' manually after player makes a Matrix Perception test

### 4.8 LocateHostPanelComponent

Step 3 content. GM creates or selects the target host.

- Create Host form: name, rating (1–12), A/S/D/F (auto-calculated from rating as suggestion — GM can override)
- Hosts list: previously created hosts this session
- On host select: `currentHostId` updated in `MatrixRunState`

### 4.9 AccessHostPanelComponent

Step 4 content. Three entry methods.

- **Hack on the Fly:** button triggers dice-roll prompt, logs result, auto-prompts OS addition (+2 per mark on success)
- **Brute Force:** opposed test button, auto-prompts OS addition (marks × 4 OS on success)
- **Direct Connection:** checkbox — 'Physical access to a device on the host network grants 1 mark on the host automatically. No OS. No test needed.' Toggling this sets `directConnection: true` on the relevant device `MatrixTarget` and auto-increments the host's mark count for the relevant decker.

### 4.10 InsideHostPanelComponent

Step 5 content. Dashboard view of everything inside the current host.

Lists all `MatrixTarget` objects in the host (sorted by type: devices, files, personas, IC, nested hosts).

Each target shows: name, type icon, spotted state (Invisible / Ghost / Revealed), marks per decker, Matrix CM track.

**Spotted state column values:**
- *Invisible* — not yet spotted, node not shown to players
- *Ghost* — running silent, partially detected; node shown to players as greyed unknown icon
- *Revealed* — identified; node shown in full to players

**Reveal / Downgrade controls per target:** GM can manually step a target between states. 'Reveal' sets `spotted = 'revealed'`. 'Ghost' sets `spotted = 'ghost'`. 'Hide' sets `spotted = 'invisible'`. Triggering a state change calls `MatrixStateService.revealTarget()` and broadcasts state.

**'Spawn IC' shortcut** per IC-type target: calls `ICSpawnerComponent`. Button disabled if: (a) `icActive.length >= host.rating`, (b) same IC type already running, or (c) it is not the start of a Combat Turn.

### 4.11 TargetCardComponent

Reusable card for a single `MatrixTarget`. Used inside `InsideHostPanelComponent` and as a minicard in player view.

Shows: name, type badge, spotted state badge, marks (filled dots per decker, max 3), Matrix CM track (reuses/mirrors `ConditionMonitorComponent`).

**Edit form fields (GM side):**
- For `type === 'device'`: `deviceRating` field (number input, 1–12). Required. Used for Matrix CM calculation and direct-connection tests.
- For `type === 'device'`: `directConnection` toggle (boolean). When true, show wire/plug icon on card header and in graph node.

**Mark buttons:** +Mark (requires decker selection), Remove Mark.  
When adding a mark to a device with `directConnection: true`, the mark is routed to the host instead (see §3.3).

**Spotted state badge** uses three-state values (`invisible` / `ghost` / `revealed`). The GM sees all states. The player-facing `SharedMatrixTarget` filters and sanitises based on this field before broadcast.

**Running Silent icon:** shown to GM. In player view, `ghost` targets appear as a pulsing grey unknown icon (no name/type revealed). `invisible` targets are omitted from the broadcast entirely.

### 4.12 ICSpawnerComponent

Modal/panel for spawning IC into the initiative tracker.

**Inputs:** `icType`, `hostRating` (pre-filled from host)

**Pre-spawn validation (all must pass — show error if not):**
1. Current time must be the START of a Combat Turn (not mid-turn). UI hint: button is greyed if `CombatManager.turnPhase !== 'start'` or equivalent.
2. `host.icActive.length < host.rating` (max concurrent IC not reached).
3. No existing IC of the same `ICType` currently in `host.icActive`.

**Initiative preview:** Rating × 2 + Nd6 (N = hostRating for Patrol, 4 for others).

**On spawn:** creates `ICParticipant`, sets `baseIni = hostRating × 2`, `dices = 4` (or 2 for Patrol), calls `CombatManager.addParticipant()`. Links the `ICParticipant` back to the `MatrixTarget` via `linkedParticipantId` / `linkedTargetId`. IC inherits host A/S/D/F — do NOT copy these values onto the `ICParticipant` as separate fields.

**Respawn after brickage:** When an IC's Matrix CM is filled (bricked), mark it as bricked but do not remove it from `icActive` immediately — keep a `bricked: boolean` flag on `ICParticipant`. The host CAN respawn it at the start of the NEXT Combat Turn, subject to all constraints above. Provide a 'Respawn' button in `ICSpawnerComponent` for bricked IC entries.

### 4.13 IconGeneratorService

Service (not a component) that generates random public Matrix icons.

```typescript
IconGeneratorService.generate(count: number): MatrixIcon[]
```

Randomly selects icon type from: `commlink`, `spam`, `vehicle-node`, `sensor`, `misc-device`. Generates a plausible fake name (e.g. 'Fuchi Commlink 3A', 'SpamBot #7'). Assigns Device Rating 1–4 with weighted distribution (DR 1–2 most common).

### 4.14 MatrixParticipantBadgeComponent

Small inline badge component, used inside the existing participant rows in `BattleTrackerComponent`.

Shows: VR mode chip (AR / COLD-SIM / HOT-SIM in color), OS number, 'PHYS LOCKED' badge when `blocksPhysicalActions = true`. Clicking the OS number opens the `OverwatchScoreComponent` inline editor.

### 4.15 MatrixPlayerViewComponent

Component rendered inside `PlayerViewComponent` (conditionally) to show Matrix-specific data for player-decker characters.

- Shows: decker VR mode, OS bar (color-coded), jack-in status, current noise level (from `SharedCombatState.matrixNoise`)
- Shows revealed Matrix targets as `TargetCard`s (read-only view, marks shown)
- **`invisible` targets:** not shown (omitted from broadcast)
- **`ghost` targets:** shown as a pulsing grey unknown icon (■) with no name or type — only the GM knows what it is
- **`revealed` targets:** shown in full
- Devices with `directConnection: true` show a wire/plug icon

The primary player-facing Matrix UI is the **node graph** (`MatrixGraphComponent` — see §4.17). This component provides the status bar and target list as supplementary info.

### 4.16 RollModifierPromptComponent

A general-purpose modifier prompt that the GM triggers before any dice roll — Matrix or physical.

**Flow:** GM clicks a roll button → `RollModifierPromptComponent` opens as a modal or inline panel. The GM adds one or more named modifiers with a dice-pool delta. The finalized modifier list and net total are sent to the player via a new session command. The player sees a prompt: 'GM has applied modifiers to your roll — accept to proceed.'

**For Matrix rolls:** When opening, auto-populate a "Noise" modifier row pre-filled with `−MatrixRunState.noise` (if noise > 0). GM can adjust before sending. Grid penalties can be added as a second preset row.

**GM side:**
- List of modifier rows: `[label: string, delta: number]` — add/remove freely
- Common presets: Noise −Xd (pre-filled from scene noise), Wound Modifier, Visibility, Range, Cover, Grid Penalty
- Net modifier total shown prominently
- 'Send to Player' or 'GM Roll' buttons

**Session command type:** `roll_modifier_prompt`  
**Payload:** `{ rollLabel, basePool, modifiers: [{label, delta}], finalPool, participantId }`

This component is not Matrix-specific and lives in `src/app/shared/`.

### 4.17 MatrixGraphComponent *(Built in Step 9)*

> **Do not implement this component before Step 9.** In Steps 4–8, `MatrixRunPanelComponent`'s right pane renders a placeholder `<div class="graph-stub">Matrix Graph — coming in Step 9</div>`.

The **primary player-facing Matrix UI.** The node graph replaces the flat list as the main visual. This is a significant new component — use a canvas or SVG-based approach with Angular animations for the host-transition effect.

**Public space view:**
- Host nodes: large solid blocks (server/building icon)
- Loose device nodes: smaller floating circles
- Decker's persona: distinct node (cyan outline, humanoid avatar)
- Background: dark grid/grid-line aesthetic using CSS theme variables

**Inside-host view:**
- No central host node — the decker IS inside the host. The host is the canvas.
- All objects (devices, files, personas, IC) are free-floating nodes
- **Animated transition** when entering/leaving a host: persona node "flies into" the host block and the view expands to fill the frame

**Node interactions:**
- Tapping/clicking a node selects it
- Selected node shows available actions (Hack on the Fly, Data Spike, etc.) as a radial or side panel
- If an action is already chosen in the initiative tracker, clicking a node populates it as the target for that action

**Node appearance by state:**
- `invisible` → not shown (player view) / shown with dimmed/dashed border + 'HIDDEN' label (GM view)
- `ghost` → pulsing grey unknown icon (■), no label — shown in both player and GM view
- `revealed` → full icon with name label

**IC nodes:** red/orange fill, shield/hazard icon, linked to their initiative tracker row. Clicking an IC node highlights its initiative tracker row.

**Devices with `directConnection: true`:** show a wire/plug overlay icon on the node.

**GM view — two panes:**
- **Left pane:** hierarchy editor (the existing component list UI — `InsideHostPanelComponent`, target CRUD, IC spawner)
- **Right pane:** graph preview — same graph the players see, but with ALL nodes visible. Each node shows a small visibility badge (eye icon = revealed, ghost icon = ghost, hidden icon = invisible)

**Implementation notes:**
- Recommend SVG-based graph with Angular animations (`@angular/animations`) for the enter-host transition
- Use `d3-force` or a simple custom force-layout for node positioning
- IC nodes emit a `selectedIC` event that the parent can use to highlight the initiative row
- The graph is read-only for players; GM can click nodes to select them for editing in the left pane

---

## 5. Services

### 5.1 MatrixStateService

The central service for Matrix run state. Injectable, provided in root. Holds `MatrixRunState` and exposes observables/getters for components.

- Manages the list of hosts, targets, public icons, workflow step, `noise`, and `activeGrid`
- Provides methods: `jackIn(decker, vrMode)`, `jackOut(decker)`, `addHost(host)`, `addTarget(host, target)`, `setCurrentHost(id)`, `revealTarget(target, spotted)`, `addMark(target, deckerId)`, `removeMark(target, deckerId)`, `spawnIC(icType, host)`, `setNoise(n)`, `setActiveGrid(grid)`

**`addMark(target, deckerId)` — host-wide mark propagation:**
When called for any `MatrixTarget` inside a host (or for the host itself):
1. Increment `target.marks[deckerId]`
2. Also increment `host.marks[deckerId]` (the canonical host-level count)
3. Mirror the updated mark count to every `ICParticipant`'s linked `MatrixTarget` in `host.icActive`
4. Call `syncSharedState()` so the player view updates

**`revealTarget(target, spotted)`** sets `target.spotted = spotted` and broadcasts. The `SharedMatrixTarget` sent to players omits invisible targets and sanitises ghost targets (type='unknown', name omitted).

All mutations go through `UndoHandler` so that undo/redo works for Matrix actions.

Notifies `BattleTrackerComponent` to call `syncSharedState()` after any mutation affecting the player view.

### 5.2 OsTrackingService

Manages OS accumulation and threshold logic.

- `addOS(deckerId, amount, reason)`: adds OS, logs reason, checks thresholds
- `resetOS(deckerId)`: sets OS to 0 (on jack-out or biofeedback dump)
- `getOSAlert(decker)`: returns `'none' | 'ic-alert' | 'convergence'`
- Emits `Observable<OSThresholdEvent>` that components subscribe to for showing modals/alerts

**At OS 40:** the threshold event includes the current `MatrixRunState.currentHostId`. Subscribers (`OverwatchScoreComponent`) use this to branch the convergence modal (see §4.3).

### 5.3 SessionSyncService (Extension)

The existing service needs minimal extension — primarily adding Matrix state to the broadcast payload and handling new command types.

- Extend `getSharedParticipants()` to cast `MatrixParticipant` instances and populate `SharedMatrixParticipantState` fields
- Include `matrixNoise` and `matrixGrid` from `MatrixRunState` in every broadcast
- `matrixTargets`: omit `invisible` targets; send `ghost` targets with sanitised payload; send `revealed` targets in full

**New command types:**
- `matrix_state_update` — GM broadcasts Matrix targets/icons to players
- `roll_modifier_prompt` / `roll_modifier_response` — per-roll modifier exchange

### 5.4 Integration Points in Existing Code

**`BattleTrackerComponent`:**
- Import and render `MatrixRunPanelComponent` in a new 'Matrix' tab
- Conditionally render `MatrixParticipantBadgeComponent` inside each participant row (`p instanceof MatrixParticipant`)
- In `performAct()`: check if action is an OS-adding Matrix action → open `OsPromptComponent` → call `osTrackingService.addOS()`
- Extend `getSharedParticipants()` to populate `matrixState` fields including `matrixNoise` and `matrixGrid`
- Inject `MatrixStateService` and `OsTrackingService`. Wire OS threshold events to show convergence modal.

**`PlayerViewComponent`:**
- In `applyIncomingState()`: read `matrixTargets` from state and pass to `MatrixPlayerViewComponent` and `MatrixGraphComponent`
- Import and render `MatrixGraphComponent` as the primary Matrix visual
- Import and render `MatrixPlayerViewComponent` for status bar (conditionally, when `isMatrix === true`)

**`SharedCombatState` (`session-sync.service.ts`):**
- Add `matrixTargets?: SharedMatrixTarget[]`
- Add `matrixNoise?: number` and `matrixGrid?: string`
- Add participant-level matrix fields as optional fields on `SharedParticipantState`
- No server changes needed — server.js treats state as an opaque JSON blob

**`IParticipant` / `Participant`:** Do not modify. `MatrixParticipant` extends `Participant` via the existing inheritance chain.

**`declared-actions.ts`:**
- Add `OS_ADDING_ACTIONS` constant export: list of action names that trigger OS prompt
- Optionally enrich `DECLARED_ACTION_DESCRIPTIONS` for Matrix actions with OS amounts

---

## 6. Incremental Build Steps

Each phase is independently shippable and testable. Build in order.

### Phase 1 — Data Models + Initiative Integration

**Goal:** `MatrixParticipant` and `ICParticipant` are fully functional. A decker can be added to the initiative tracker with the correct initiative formula. VR catatonia is flagged visually. OS tracking is wired up but UI is minimal.

| Task | Effort | Notes |
|------|--------|-------|
| Define `VRMode` enum and `MatrixParticipant` class. All `Undoable` setters. | 4 h | Back out matrix fields via `clone()` too |
| Define `ICParticipant` and `ICType` enum. Verify initiative formula. **No A/S/D/F fields on ICParticipant — inherits host stats.** | 3 h | Test `baseIni = rating×2`, `dices = 4`. Add note: IC uses host DP for all tests. |
| Define `MatrixStateService` skeleton (`addDecker`, `jackIn`, `jackOut`, `setNoise`, `setActiveGrid` stubs). | 2 h | Inject in `BattleTrackerComponent` |
| Define `OsTrackingService`. Basic `addOS` / `resetOS` / alert logic. | 2 h | Unit test threshold crossings |
| `MatrixParticipantBadgeComponent`: VR mode chip, OS number, CATATONIC badge. | 3 h | Conditionally render in participant row |
| Wire `blocksPhysicalActions` → action planner in `BattleTrackerComponent`. | 1 h | Verify VR deckers can't take physical actions |
| Extend `getSharedParticipants()` and `SharedParticipantState` with Matrix fields. | 2 h | Player view receives `isMatrix`, `vrMode`, OS |
| Phase 1 integration test: add `MatrixParticipant` to tracker, roll initiative, verify order. | 2 h | — |

**Phase 1 Gotchas:**
- `UndoHandler`: every new property needs its own `_backingField` and `Set()` setter. Missing one causes a runtime throw.
- VR physical lock: `blocksPhysicalActions` does NOT call `p.ooc`. Gate on `p instanceof MatrixParticipant && p.blocksPhysicalActions` in the action planner.
- Mid-combat jack-in: call `p.rollInitiative()` immediately, then `sort()`.
- Clone: `MatrixParticipant` must override `clone()` to return a `MatrixParticipant` with all Matrix fields copied.

### Phase 2 — Hacking Workflow UI

**Goal:** The full seven-step hacking workflow UI is functional. GM can jack in a decker, generate public icons, create a host, and navigate workflow steps. OS prompt fires correctly. Noise and grid controls appear in the panel header.

| Task | Effort | Notes |
|------|--------|-------|
| `MatrixRunPanelComponent` two-pane layout: top strip (decker status cards), left pane (hierarchy editor stub), right pane (graph placeholder `<div>`). | 3 h | Right pane stub only — `MatrixGraphComponent` is a Step 9 deliverable. |
| Extract jack-in/out logic into `MatrixStateService.jackIn()` / `jackOut()`. Demote `JackInPanelComponent` — no longer rendered as a panel. | 3 h | Initiative re-roll on jack-in mid-combat; OS reset + `hostConverged` check on jack-out. |
| `DeckerStatusCardComponent`: jack-in status badge, VR CATATONIC indicator, OS counter, inline mode selector (AR/COLD/HOT) on "Jack In", convergence warning on "Jack Out" when `hostConverged` set. | 3 h | Replaces `JackInPanelComponent` as primary jack-in UX. |
| `WorkflowStepperComponent`: passive 7-step indicator strip, auto-highlights from `MatrixRunState`. Info tooltip per step. No click navigation. | 2 h | Purely informational — GMs can ignore. |
| Noise ± control and activeGrid toggle in `MatrixRunPanelComponent` header. | 2 h | Binds to `MatrixRunState.noise` / `activeGrid`. Broadcasts on change. |
| `OsPromptComponent` modal. | 2 h | Modal via NgbModal |
| Wire `OsPromptComponent` into `performAct()` for OS-adding Matrix actions. | 2 h | Constants in `declared-actions.ts` |
| `OverwatchScoreComponent`: OS bar, threshold labels, ± adjustment, reset. **Convergence modal with host-context branch.** | 4 h | At OS 40: check `currentHostId`. Host path: 3 marks on decker + IC deploy. GOD path: existing dump. |
| `RollModifierPromptComponent`. Pre-populate Noise preset from `MatrixRunState.noise`. | 4 h | Lives in `src/app/shared/` |
| New session commands: `roll_modifier_prompt` + `roll_modifier_response`. | 2 h | Player sees modifier list before rolling |
| `PublicSpacePanelComponent` + `IconGeneratorService`. | 3 h | Name list: hardcoded corp name arrays |
| `LocateHostPanelComponent`: create/select host form. | 2 h | Persist in `MatrixStateService.hosts` |
| `AccessHostPanelComponent`: 3 entry methods with OS calculations. | 3 h | Log access method to shared log |
| Phase 2 integration test: full jack-in → host access → OS accumulation → convergence branch. | 2 h | Test both host-context and public-space OS 40 paths |

**Phase 2 Gotchas:**
- Graph pane is a stub `<div>` for the entire Phase 2. Do not start `MatrixGraphComponent` — that is Phase 4 / Step 9 work. Keep the placeholder in place so the layout is exercised early.
- OS suggestion values: Hack on the Fly = +2 per mark. Brute Force = marks × 4. Make these configurable constants.
- Noise is scene-level, not per-decker. `MatrixRunState.noise` persists until GM changes it. `RollModifierPromptComponent` pre-populates the noise modifier from this field; GM can override per-roll.
- Host convergence path: do NOT dump the decker. Auto-apply 3 marks from the host and show the modal. Track a `hostConverged: boolean` flag on the `MatrixParticipant` — if they jack out while `hostConverged = true`, `MatrixStateService.jackOut()` must show the demiGOD modal before completing the jack-out. This check lives in the service, not in `DeckerStatusCardComponent`.
- Jack-out: `jackOut()` resets OS, sets `jackedIn = false`, sets `blocksPhysicalActions = false`, clears `hostConverged`. Re-sort the tracker.
- `RollModifierPrompt` session commands: send to targeted participant's player only, not all connected players.

### Phase 3 — Targets, Marks, IC Spawning

**Goal:** GM can manage targets inside a host, reveal them to players (with three-state visibility), apply marks (with host-wide propagation), and spawn IC into the initiative tracker.

| Task | Effort | Notes |
|------|--------|-------|
| `MatrixTarget` data model with three-state `spotted` field. `deviceRating` and `directConnection` fields on device type. CRUD in `MatrixStateService`. | 3 h | Undo-wrapped `DoAction` for each mutation |
| `MatrixStateService.addMark()` with host-wide propagation. | 2 h | Mirror marks to host + all IC in host |
| `InsideHostPanelComponent`: target list, type icons, CM tracks, three-state reveal controls. | 4 h | Use existing `ConditionMonitorComponent` for Matrix CM |
| `TargetCardComponent`: marks display, spotted state badge, inline mark +/−. `deviceRating` and `directConnection` fields in edit form. | 4 h | `directConnection` toggle shows wire/plug icon |
| Direct connection mark routing: marks on directly-connected device auto-route to host. | 1 h | No OS cost. Only `jackedIn: true` deckers. |
| `ICSpawnerComponent`: IC type picker, host rating, initiative preview, spawn button. **Enforce all four rate-limiting constraints.** | 4 h | Calls `CombatManager.addParticipant(icParticipant)` |
| Link IC participant ↔ `MatrixTarget` (bidirectional IDs). Shared marks propagation for IC. | 2 h | Needed for kill-IC logic and mark sync |
| `MatrixStateService.spawnIC()`: creates `ICParticipant` + `MatrixTarget` pair. IC inherits host A/S/D/F at test time (no copying). | 2 h | Trigger `syncSharedState` after spawn |
| When IC Matrix CM reaches max damage: auto-derez IC, set `bricked = true`, remove from initiative. Show 'Respawn' button in spawner. | 2 h | Host can respawn at start of next Combat Turn |
| Phase 3 integration test: create host, add targets, spawn IC, verify mark propagation, kill IC. | 2 h | — |

**Phase 3 Gotchas:**
- Matrix CM formula: IC = `8 + Rating/2` (round up). Devices = `8 + deviceRating/2` (round up). Files = 8 (flat). Auto-calculate on creation.
- Mark propagation: `addMark()` must update `host.marks`, target's `marks`, and all IC linked-target `marks` atomically inside a single `UndoHandler.StartActions()` block.
- IC spawning constraints: if any constraint fails (wrong time, max IC reached, duplicate type), show a clear error message in the spawner UI — do not silently skip.
- Shared marks / decker spotting: when the host detects a decker (e.g. Patrol IC files alert), mark that decker as "known" in `MatrixRunState` and propagate to all IC in the host. Implement as a `MatrixStateService.alertHost(hostId, deckerId)` method.
- Running Silent three-state: the `spotted` field on `MatrixTarget` is the canonical source of truth. `SharedMatrixTarget` sanitises it before broadcast — omit invisible, sanitise ghost, pass through revealed.

### Phase 4 — Player View Integration + Node Graph

**Goal:** Players with decker characters see their OS, VR mode badge, GM-revealed Matrix targets, and the node graph as their primary Matrix UI. The icon generator is polished.

| Task | Effort | Notes |
|------|--------|-------|
| `MatrixPlayerViewComponent`: decker status bar (VR mode, OS, noise display). | 3 h | Rendered in `PlayerViewComponent` for `isMatrix` participants |
| Player view: render `revealed` targets as read-only `TargetCard`s. | 2 h | Filter from `SharedCombatState.matrixTargets` |
| `ghost` targets: render as pulsing grey unknown icon with no name. | 1 h | Sanitised record already has `type='unknown'` |
| `MatrixGraphComponent` — skeleton: SVG canvas, static node layout. | 4 h | Start simple: static positions, no force-layout |
| Graph: public space view with host blocks, device nodes, decker persona node. | 3 h | CSS theme variables for colors |
| Graph: inside-host view with animated transition. | 4 h | Angular animations: persona "enters" host block |
| Graph: `ghost` nodes as pulsing grey, IC nodes as red/orange + shield icon. | 2 h | CSS keyframe animations for pulse |
| Graph: GM two-pane layout (hierarchy editor left, graph preview right). | 3 h | GM sees all nodes + visibility badges |
| Graph: `directConnection: true` devices show wire/plug overlay icon. | 1 h | CSS class driven by field |
| Extend `SharedCombatState` broadcast with `matrixNoise` and `matrixGrid`. | 1 h | Player view shows noise level indicator |
| Icon generator name corpus polish. Bulk generation UI. | 2 h | Slider 1–20, 'Generate' + Promote |
| Player view OS alert: amber/red styling when OS exceeds thresholds. | 1 h | Use `overwatchAlert` field |
| Phase 4 integration test: GM reveals target → player sees it in graph; GM ghosts → pulsing icon appears; GM hides → disappears. | 2 h | — |

**Phase 4 Gotchas:**
- State broadcast timing: `matrixTargets` must be in every `syncSharedState()` call, not just on explicit Matrix actions.
- Graph performance: use `trackBy` in `*ngFor` if rendering target lists alongside the graph. SVG nodes should be keyed by `id`.
- Decker privacy: OS should only be included in the `SharedParticipantState` for the owning player. Other players see the VR mode badge but not the OS value.
- Force-layout caveat: if using `d3-force`, ensure the simulation is stopped on component destroy to prevent memory leaks.

### Phase 5 — Polish, Deck Reconfiguration + Docs

**Goal:** Deck reconfiguration, full OS rule enforcement, cyberdeck-theme integration, and documentation updates.

| Task | Effort | Notes |
|------|--------|-------|
| Deck reconfiguration: Switch Two Matrix Attributes free action. | 2 h | Recompute `baseIni` if DP swapped |
| OS rule enforcement: verify all Matrix actions have correct OS amounts in `OS_ADDING_ACTIONS`. | 2 h | Cross-reference SR5E Core p.231–234 |
| IC alert (OS 20) visual: ambient amber glow on entire Matrix panel. | 1 h | CSS class on panel root |
| Host convergence follow-up: if decker jacks out while `hostConverged = true`, trigger demiGOD modal. | 1 h | Check flag in `jackOut()` |
| Convergence modals: add flavour text and Convergence attack formula (both GOD and host variants). | 1 h | Informational only |
| Cyberdeck theme: Matrix panel uses existing CSS theme variables. | 2 h | See `cyberdeck-theme-notes.md` |
| `APP_DOCUMENTATION.md`: add Matrix module section. | 3 h | Same format as existing doc |
| Phase 5 integration test: end-to-end with two deckers, IC, OS accumulation, both convergence paths, jack-out. | 3 h | Manual test checklist |

**Phase 5 Gotchas:**
- Switch Two Matrix Attributes: SR5E Core p.228. Free action. Swapping any pair that includes DP requires recomputing `baseIni = dataProcessing + intuition`. Wrap in `UndoHandler.StartActions()`.
- Biofeedback damage (hot-sim): Killer, Blaster, Sparky IC deal physical damage to hot-sim VR deckers. Wire this up via the IC damage section.
- demiGOD convergence on jack-out: this is distinct from the standard GOD convergence. Show a different modal: *"demiGOD traces you the moment you surface — Convergence attack incoming."*

---

## 7. SR5E Rules Reference Cheat Sheet

Quick-reference for the developer. Sources: SR5 Core Rulebook (6th printing). Page numbers approximate.

### 7.1 Matrix Initiative Formulas

| Interface Mode | Formula | d6 Count | Notes |
|---|---|---|---|
| AR (Augmented Reality) | Data Processing + Intuition + 1d6 | 1 | No catatonia. Physical and Matrix act separately. |
| VR Cold-Sim | Data Processing + Intuition + 3d6 | 3 | No catatonia. Slightly faster. |
| VR Hot-Sim | Data Processing + Intuition + 4d6 | 4 | Catatonic physically. Higher biofeedback risk. |
| IC (general) | Host Rating × 2 + 4d6 | 4 | `baseIni = Rating×2`, `dices = 4`. IC uses host's DP for all Matrix tests (not a separate attribute). |
| Patrol IC | Host Rating × 2 + 2d6 | 2 | Patrol IC uses 2d6. `baseIni = Rating×2`. |

### 7.2 Overwatch Score Accumulation

OS is accumulated per-decker. Resets only on jack-out (or dump/biofeedback).

| Action | OS Added | Legal? | Notes |
|---|---|---|---|
| Hack on the Fly (mark obtained) | +2 per mark | No | Each successful mark attempt adds 2 OS. |
| Brute Force (mark obtained) | marks × 4 | No | 3 marks = 12 OS. |
| Check Overwatch Score | +0 | Yes | Complex action. Reveals rough OS value. |
| Any illegal action (detected) | +variable | No | GOD's Convergence score increases. |
| Jack Out / Dump / Biofeedback | Reset to 0 | — | Clears all OS for this decker. |
| OS threshold: 20 | — | — | IC Alert. Visual amber warning. |
| OS threshold: 40 (outside host) | — | — | GOD Convergence. Decker burned and dumped. |
| OS threshold: 40 (inside host) | — | — | Host Convergence. Host places 3 marks on decker. IC deploys. Decker NOT dumped. Jack out → demiGOD. |

### 7.3 Marks — Requirements for Common Actions

| Action | Marks Required | Notes |
|---|---|---|
| Hack on the Fly | 0 (places marks) | Opposed: Cracking + Logic vs Firewall + Data Processing |
| Brute Force | 0 (places marks) | Opposed: Cracking + Logic vs Firewall + Intuition |
| Control Device | 1 | On the device being controlled |
| Edit File | 1 | On the file or the device hosting it |
| Crash Program | 1 | On the persona running the program |
| Data Spike | 0 | Direct Matrix damage. No marks needed. |
| Snoop | 1 | On the persona or device to intercept |
| Trace Icon | 2 | On the icon being traced |
| Reboot Device | 3 | On the target device |
| Format Device | 3 | On the target device |
| Spoof Command | 1 | On the device being spoofed |

**Host-wide mark propagation (SR5E p.247):** When any mark is placed on an IC program or on the host itself, ALL IC in that host and the host itself immediately share that mark. Conversely, if the host detects (spots) a decker, all IC instantly gain awareness. The app must propagate mark changes host-wide via `MatrixStateService.addMark()`.

### 7.4 IC Types — Quick Reference

IC does NOT have its own A/S/D/F attributes. It uses the host's Matrix attributes for all tests (SR5E p.247).

| IC Type | Primary Attack | Matrix DV | Special Effect |
|---|---|---|---|
| Patrol | Alert IC, no direct attack | — | Calls in other IC if decker spotted. Raises OS. |
| Killer | Cybercombat + Rating vs Willpower + Firewall | Rating | Matrix damage to persona CM. |
| Acid | Cybercombat + Rating vs Willpower + Firewall | Rating | Reduces a deck attribute by 1 on hit. |
| Blaster | Cybercombat + Rating vs Willpower + Firewall | Rating | Stun damage to decker (biofeedback, VR only). |
| Sparky | Cybercombat + Rating vs Willpower + Firewall | Rating | Physical damage to hot-sim VR decker. |
| Scramble | Cybercombat + Rating vs Willpower + Firewall | Rating | Reduces initiative score by Rating. |
| Tar Baby | Opposed: Attack + Rating vs Interface | — | Limits decker's available actions. |

### 7.5 IC Spawning Constraints (SR5E p.247)

- A host may spawn **one IC program per Combat Turn**, at the **start of the turn** only.
- **Maximum concurrent IC = Host Rating** (`icActive.length` must not exceed `host.rating`).
- **No two IC of the same type** may run simultaneously in the same host.
- When IC is bricked, the host **can respawn** it at the start of the **next** Combat Turn.

### 7.6 Three-State Icon Visibility

| State | Running Silent? | Condition | Player View |
|---|---|---|---|
| Invisible | No | Not yet spotted (player hasn't looked) | Hidden — not shown |
| Ghost | Yes | Matrix Perception hit confirms vicinity | Pulsing grey unknown icon ■ |
| Revealed | Either | Spotted and identified | Full icon + name |

Spotting rules:
- Icons NOT running silent, within 100m (physical) or inside a host (once decker is inside): **auto-revealed** — no test needed.
- Icons RUNNING SILENT: two-step — (1) Matrix Perception hit → Ghost, (2) Opposed Computer+Intuition [DP] vs Logic+Sleaze → Revealed.
- Icons with the decker's own mark on them: always **Revealed** regardless of distance or silent running.
- Once **Revealed**, stays revealed until: Hide action, reboot, or jack out.

### 7.7 Access Methods — Host Entry

| Method | Test | OS Cost | Notes |
|---|---|---|---|
| Hack on the Fly | Cracking + Logic vs Firewall + Data Processing | +2 OS/mark (success) | Best for quiet entry. |
| Brute Force | Cracking + Logic vs Firewall + Intuition | marks × 4 OS | Faster but louder. Triggers alert IC. |
| Direct Connection | None (physical access required) | 0 OS | Device on host network = 1 free mark on host. Mark routes to host, not device. Only `jackedIn: true` deckers. |

### 7.8 Matrix Condition Monitor Formulas

| Target | CM Formula | Example |
|---|---|---|
| IC | 8 + Rating/2 (round up) | Rating 6 IC: 8 + 3 = 11 boxes |
| Device | 8 + Device Rating/2 (round up) | DR 4 device: 8 + 2 = 10 boxes |
| Host | 8 + Host Rating/2 (round up) | Rating 8 host: 8 + 4 = 12 boxes |
| File | 8 (flat) | Always 8 boxes |
| Persona (decker) | 8 + Device Rating/2 (deck) | DR 6 deck: 8 + 3 = 11 boxes |

### 7.9 Noise and Grid

**Noise:** Flat dice pool penalty on all Matrix tests. Scene-level — GM sets once and it applies to all rolls until changed. Stored in `MatrixRunState.noise`. Displayed in `MatrixRunPanelComponent` header.

**Active Grid:** Affects connection costs and some dice pools. `'public'` (default), `'corporate'`, or `'prime'`. Stored in `MatrixRunState.activeGrid`.

### 7.10 Deck Reconfiguration

**Switch Two Matrix Attributes (Free Action, SR5E p.228):** The decker swaps any two of their four deck attributes (A/S/D/F). Once per Action Phase. If either swapped attribute is Data Processing, recompute `baseIni = dataProcessing + intuition` immediately. Wrap the swap in `UndoHandler.StartActions()`.

---

## 8. Effort Summary

| Phase | Description | Estimated Effort |
|---|---|---|
| Phase 1 | Data models + initiative integration | ~19 hours |
| Phase 2 | Hacking workflow UI, OS prompts, noise/grid controls | ~31 hours |
| Phase 3 | Targets, marks (with propagation), IC spawning (with rate limits) | ~23 hours |
| Phase 4 | Player view + node graph (`MatrixGraphComponent`) | ~29 hours |
| Phase 5 | Polish, deck reconfig, convergence follow-ups, docs | ~12 hours |
| **Total** | All phases | **~114 hours** |

Estimates assume a single developer familiar with Angular and the existing codebase. `MatrixGraphComponent` (Phase 4) is the largest new addition and carries the highest uncertainty — the SVG/canvas approach and Angular animation for the host transition should be prototyped early in Phase 4 before committing to the full layout.

---

## 9. Testing Notes

The existing codebase has Jasmine spec stubs for each component but limited coverage. The Matrix module should target the following at minimum:

- `MatrixParticipant.getCurrentInitiative()`: verify AR/cold-sim/hot-sim dice counts.
- `MatrixParticipant`: verify `blocksPhysicalActions = true` when `vrMode` is not AR, and that `ooc` remains false.
- Mid-combat jack-in: verify `diceIni` is re-rolled and participant re-sorts correctly.
- `OsTrackingService`: verify `addOS` fires threshold events at exactly 20 and 40. Verify host-context and public-space branches at 40.
- `ICParticipant` initiative: verify `baseIni = hostRating × 2` for various ratings. Verify no A/S/D/F fields are added to `ICParticipant`.
- IC spawning constraints: verify all four constraints (timing, max concurrent, no-duplicate-type, respawn-after-brickage) are enforced by `ICSpawnerComponent`.
- `MatrixStateService.addMark()`: verify that a mark placed on an IC target propagates to `host.marks` and all other IC linked-targets in the same host.
- `MatrixParticipant.clone()`: verify all Matrix fields are deep-copied.
- `MatrixStateService.spawnIC()`: verify `CombatManager.addParticipant()` is called and `ICParticipant` links correctly to its `MatrixTarget`. Verify IC has no A/S/D/F fields.
- Three-state visibility: verify `'invisible'` targets are omitted from `SharedCombatState.matrixTargets`. Verify `'ghost'` targets are sanitised (type='unknown', name omitted).
- Direct connection: verify mark routes to host (not device) when `directConnection: true`. Verify only `jackedIn: true` deckers can toggle `directConnection`.
- `RollModifierPromptComponent`: verify net modifier total is computed correctly and Noise preset is pre-populated from `MatrixRunState.noise`.
- Session sync round-trip: verify `matrixTargets`, `matrixNoise`, and `matrixGrid` appear in `SharedCombatState` and are deserialised correctly in player view.
- `MatrixGraphComponent`: verify node click emits selection event. Verify `ghost` nodes show pulsing grey icon. Verify host-entry animation triggers on `currentHostId` change.

---

## 10. Open Questions / Design Decisions

**Q1: Separate physical and Matrix tracker entries for VR deckers?**  
Current design: single `MatrixParticipant` entry, Matrix initiative, physical actions blocked in action planner. **Ship Option A.** Option B (two entries — one for physical body, one for Matrix persona) is a Phase 5+ enhancement.

**Q2: Should players see their own OS in the player view?**  
Yes — the decker's own OS is shown in their player view (read-only, controlled by the ownership check in `SharedParticipantState`). Other players do not see another decker's OS. RAW says OS is secret; the player view is the decker's personal console.

**Q3: Persist Matrix state across combat turns?**  
Yes. `MatrixStateService` is independent of `CombatManager` lifecycle. Host/target state persists until the GM explicitly ends the Matrix run or closes the session.

**Q4: Multiple simultaneous Matrix runs?**  
Supported by the data model (multiple hosts in `MatrixRunState`, per-decker OS). GM manually switches the viewed host in Phase 1–4. Multi-host simultaneous view is a Phase 5+ enhancement.

**Q5: Roll Modifier Prompt — can the player decline a modifier?**  
**Option A (ship in Phase 2):** Player can see modifiers but cannot decline — they must roll with whatever the GM applied. Disputes handled out-of-band. Option B (flag for GM + text channel) deferred to Phase 5.

**Q6: Host convergence demiGOD timing.**  
If a decker jacks out while `hostConverged = true` (i.e. they hit OS 40 inside the host), demiGOD converges immediately outside. The `jackOut()` method checks this flag and shows the demiGOD modal before completing the jack-out. Decker is dumped at this point.

**Q7: Can the same IC type spawn in different hosts simultaneously?**  
Yes — the no-duplicate-type constraint is per-host, not global. Two separate hosts can each run a Killer IC simultaneously.

---

*End of development plan — v2 (UX revision: two-pane MatrixRunPanel + passive stepper + DeckerStatusCard, May 22, 2026).*
