# SR5E Battle Tracker — Matrix Module: Project Context

> Agent reference doc. Dense and scannable. Last updated: 2026-05-26.

---

## Current State

**Branch:** `feat/matrix-module` · **Base stack:** Angular 19 standalone, Socket.IO, TypeScript

### What's shipped (merged to main)

**Phase 1 data layer (commit `563a3b7`)** — All domain classes exist under `src/Matrix/`:
`MatrixParticipant`, `ICParticipant`, `MatrixHost`, `MatrixTarget`, `MatrixRunState`, `VRMode`, `ICType`, `MatrixIcon`.
Services `matrix-state.service.ts` (jackIn/jackOut/addHost skeletons) and `os-tracking.service.ts` (full threshold logic) are committed.
`matrix-participant-badge/` component exists: VR chip, OS chip, PHYS LOCKED badge.

**Step 1 ✅ (merged to main)** — GM can add a MatrixParticipant ("Add Decker" button). Tracker row shows VR chip (AR/COLD/HOT), OS: 0, PHYS LOCKED when in VR. DP input replaces Reaction; initiative = DP + INT. VR mode toggle buttons set dices = 4/3/1.

**Step 2 ✅ (merged to main)** — OS chip in badge is tappable. Inline ±5/±1/Reset controls. Threshold alerts: OS ≥ 20 → amber banner "⚠ IC Alert"; OS ≥ 40 → red modal "☠ Convergence". Threshold fires once per crossing. Reset via `ConfirmationDialogService`.

**Step 3 ✅ (on feat/matrix-module, not yet merged)** — ICSpawnerComponent complete. "Spawn IC" button visible when ≥1 MatrixParticipant in tracker. GM selects IC type + host rating. Creates `ICParticipant` with `baseIni = rating × 2`, dices = 4 (2 for Patrol). Distinct badge on IC row (no OS chip, no PHYS LOCKED). Undo supported.

**Step 4 ✅ (on feat/matrix-module, not yet merged)** — Two-pane `MatrixRunPanelComponent`: passive 7-step stepper strip, decker status cards (`DeckerCardComponent`) with jack-in/out inline, Noise ± control, Grid selector. Left pane = hierarchy editor stub (Step 5). Right pane = graph stub (Step 9). Jack-in/out logic lives in `MatrixStateService.jackIn/jackOut`.

**Step 5 ✅ (on feat/matrix-module, not yet merged)** — Full hierarchy editor in left pane (`HierarchyEditorComponent`). Public Space section (loose devices). Host nodes (collapsible): Add Host form with name/rating/ASDF + random suggest, Set Active / Clear, edit, delete. Target rows per host: Add Device / File / Persona / IC Target buttons; inline target form with type, Device Rating, Direct Connection toggle, Running Silent toggle, Decker Link dropdown (for personas), spotted status selector. Spotted cycle button (INVISIBLE→GHOST→REVEALED) on every target row. `MatrixTarget` spotted type updated to `"invisible"|"ghost"|"revealed"`; added `deviceRating`, `directConnection`, `runningSilent` fields. `MatrixRunState.publicTargets[]` added. `MatrixStateService`: `addTarget`, `removeTarget`, `setTargetSpotted`, `updateTarget`, `updateHost`, `removeHost`.

---

## What's Next (Steps 6–11)

| Step | One-line summary |
|------|-----------------|
| **6** | Mark tracking on targets — place/remove marks per decker (max 3), dots display, undo-wrapped |
| **7** | Reveal mechanic (3-state: invisible/ghost/revealed) + MatrixPlayerViewComponent in player tab |
| **8** | OsPromptComponent modal — fires on illegal actions (Hack on Fly, Brute Force, Data Spike); undo-linked |
| **9** | MatrixGraphComponent — SVG node graph (public space + inside-host views, animated transition) |
| **10** | IconGeneratorService + PublicSpacePanelComponent — generate random public icons, promote to MatrixTarget |
| **11** | Deck reconfiguration free action — swap any two of A/S/D/F; recompute baseIni if DP swapped |

---

## Key Architecture Decisions

### Stack and Patterns

- **Angular 19 standalone components** — no NgModule. All Matrix components go in `src/app/matrix/` (one folder per component).
- **`CombatManager`** is a singleton default export. Always call `CombatManager.addParticipant()` — never push directly. It assigns `sortOrder` and handles insertion.
- **`Undoable` / `UndoHandler` pattern** — every mutable class extends `Undoable`. Property setters call `this.Set('propName', value)`. Backing field must be named `_propName`. Multi-step mutations wrap in `UndoHandler.StartActions()`. All Matrix mutations must follow this pattern.
- **Side-data Maps** — `BattleTrackerComponent` holds Maps for `participantReactions`, `participantIntuitions`, `participantEdgeRatings`, etc. Matrix-specific decker data (A/S/D/F, OS, VR mode, marks) lives on the subclass (not in Maps) so it survives session restores and syncs to players.
- **No server changes** — `server.js` treats `SharedCombatState` as an opaque JSON blob. Add fields to the interface; they relay transparently.
- **No i18n** — `@ngx-translate` removed. All strings hardcoded English.

### Data Models (field summary)

**`MatrixParticipant` extends `Participant`**
```
attack, sleaze, dataProcessing, firewall, deviceRating   // ASDF + deck DR
vrMode: VRMode                                            // AR | cold-sim | hot-sim
overwatch: number                                         // OS score
jackedIn: boolean
blocksPhysicalActions: boolean                           // true in VR; does NOT set ooc
marksPlaced: Map<string, number>                         // targetId → count
hostConverged: boolean                                   // true if hit OS 40 inside host
// computed: baseIni = DP + INT; dices = 4/3/1
```

**`ICParticipant` extends `MatrixParticipant`**
```
icType: ICType                // Patrol | Killer | Acid | Blaster | Sparky | Scramble | TarBaby
hostRating: number            // copied at spawn; drives initiative formula
linkedTargetId: string        // the MatrixTarget this IC corresponds to
// NO separate A/S/D/F fields — IC inherits host stats at test time
// baseIni = hostRating × 2; dices = 4 (2 for Patrol)
```

**`MatrixHost`**
```
id, name, rating (1–12)
attack, sleaze, dataProcessing, firewall  // host ASDF — also used by all IC in this host
matrixDamage, matrixHealth                // CM: 8 + rating/2 round up
targets: MatrixTarget[]
accessMethod: 'none' | 'hack-on-fly' | 'brute-force' | 'direct-connection'
deckerInside: string[]
icActive: ICParticipant[]
marks: Record<string, number>            // canonical host-wide mark count
```

**`MatrixTarget`**
```
id, name, type: 'device' | 'file' | 'persona' | 'host' | 'ic'
spotted: 'invisible' | 'ghost' | 'revealed'              // three-state visibility
marks: Record<string, number>            // per-decker mark count
deviceRating: number                     // device type only
directConnection: boolean                // device type only; mark routes to host, not device
matrixDamage, matrixHealth               // CM boxes
linkedHostId: string | null              // null = public space
linkedParticipantId?: string             // IC and personas
```

**`MatrixRunState`** (held in `MatrixStateService`)
```
hosts: MatrixHost[]
publicIcons: MatrixIcon[]
currentHostId: string | null             // drives convergence branch at OS 40
deckers: MatrixParticipant[]
workflowStep: MatrixStep
noise: number                            // scene-level flat dice penalty
activeGrid: 'public' | 'corporate' | 'prime'
```

### Key Services

**`MatrixStateService`** — central Matrix run state. Methods: `jackIn`, `jackOut`, `addHost`, `addTarget`, `removeTarget`, `setCurrentHost`, `revealTarget`, `addMark`, `removeMark`, `spawnIC`, `setNoise`, `setActiveGrid`. All mutations go through `UndoHandler`.

`addMark()` must propagate host-wide atomically: increment `target.marks[id]` → `host.marks[id]` → all IC linked-target marks in `host.icActive`. Wrap in single `UndoHandler.StartActions()`.

**`OsTrackingService`** — `addOS(deckerId, amount, reason)`, `resetOS(deckerId)`. Emits `Observable<OSThresholdEvent>`. At OS 40, event includes `currentHostId` so subscribers can branch (host convergence vs GOD convergence).

### Initiative Formula (getParticipantBaseInitiative must branch)
```
Physical:       REA + INT
Matrix (decker): DP + INT
IC:             hostRating × 2
dices: hot-sim = 4, cold-sim = 3, AR = 1, IC = 4 (Patrol = 2)
```

### VR Physical Lock
`blocksPhysicalActions = true` when `vrMode !== AR`. Does **not** set `ooc`. Gate in action planner: `p instanceof MatrixParticipant && p.blocksPhysicalActions`. Participant stays in initiative order.

### Node Graph (MatrixGraphComponent — Step 9 deliverable)
Primary player-facing Matrix UI. **Not built until Step 9.** Steps 4–8: right pane of MatrixRunPanelComponent shows a placeholder `<div>` only. When built: SVG-based with Angular animations. Public space view: host blocks, device nodes, decker persona node. Inside-host view: host is the canvas; animated transition when entering/leaving. GM sees two-pane: hierarchy editor (left) + graph preview with all nodes + visibility badges (right). Player sees only revealed + ghost nodes.

### Convergence Branches (OS 40)
- `currentHostId === null` → GOD convergence modal — decker burned and dumped.
- `currentHostId` set → Host convergence — auto-apply 3 host marks to decker, IC deploys, decker NOT dumped. Set `hostConverged = true`. If decker jacks out while `hostConverged = true` → demiGOD modal on jack-out, then dump.

### SharedCombatState Extensions
```typescript
matrixTargets?: SharedMatrixTarget[]   // invisible omitted; ghost sanitised (type='unknown', name omitted)
currentHostName?: string
matrixNoise?: number
matrixGrid?: 'public' | 'corporate' | 'prime'
// On SharedParticipantState: isMatrix?, vrMode?, overwatch?, overwatchAlert?, jackedIn?, isVRCatatonic?
```

### Matrix CM Formulas
```
IC:     8 + Rating/2 (round up)
Device: 8 + deviceRating/2 (round up)
Host:   8 + Rating/2 (round up)
File:   8 (flat)
Persona: 8 + deckDR/2 (round up)
```

---

## Branch Strategy

- All Matrix work on `feat/matrix-module`
- Each step = one commit (build + test at table before next step)
- Merge to main after each step is verified
- Steps 1 and 2 are on main; Step 3 is on the feature branch awaiting merge

---

## SR5E Rules Quick Reference (implementation-relevant only)

### Initiative
| Mode | baseIni | dices |
|------|---------|-------|
| AR | DP + INT | 1 |
| VR cold-sim | DP + INT | 3 |
| VR hot-sim | DP + INT | 4 |
| IC (general) | rating × 2 | 4 |
| Patrol IC | rating × 2 | 2 |

### OS Accumulation
| Action | OS |
|--------|----|
| Hack on the Fly (per mark obtained) | +2 |
| Brute Force (total) | marks × 4 |
| Check Overwatch Score | +0 |
| OS ≥ 20 | IC Alert (amber) |
| OS ≥ 40, outside host | GOD Convergence — decker dumped |
| OS ≥ 40, inside host | Host Convergence — 3 marks on decker, IC deploys, NOT dumped |
| Jack Out / Dump | Reset OS to 0 |

### IC Spawning Constraints (all four must pass)
1. Only at START of Combat Turn
2. `icActive.length < host.rating` (max concurrent = rating)
3. No duplicate IC type in same host
4. After brickage: can respawn at START of NEXT turn

### IC Rules
- IC has **no own A/S/D/F** — inherits host stats entirely at test time. Do not copy fields.
- Host DP is used for all IC Matrix tests.
- Mark placed on any IC → propagates to host AND all other IC in host instantly.
- Host detects decker → all IC in host gain awareness instantly.

### Three-State Visibility
| State | Condition | Player sees |
|-------|-----------|-------------|
| invisible | Not yet spotted | Nothing (omit from broadcast) |
| ghost | Running silent, partially detected | Pulsing grey ■ icon, no name |
| revealed | Spotted and identified | Full icon + name |

Spotting shortcuts:
- Not running silent, inside host (decker inside): auto-revealed
- Running silent: (1) Matrix Perception hit → ghost; (2) Opposed Computer+INT [DP] vs Logic+Sleaze → revealed
- Own mark on icon → always revealed

### Access Methods
| Method | OS cost | Notes |
|--------|---------|-------|
| Hack on the Fly | +2/mark (success) | Opposed: Cracking+Logic vs Firewall+DP |
| Brute Force | marks × 4 | Opposed: Cracking+Logic vs Firewall+INT |
| Direct Connection | 0 | Physical access; 1 free mark on HOST (not device). Only `jackedIn: true`. |

### Noise
Scene-level flat dice penalty. Set in `MatrixRunState.noise`. Applied via `RollModifierPromptComponent` as a pre-populated "Noise" preset — GM can adjust per-roll. NOT per-decker, NOT in the jack-in form.

### Deck Reconfiguration (Step 11)
Free action. Swap any two of A/S/D/F. If DP swapped: `baseIni = dataProcessing + intuition` recomputes immediately. Wrap in `UndoHandler.StartActions()`.
