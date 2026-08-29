# SR5E Battle Tracker — Matrix Module: Incremental Build Plan

> **Deferral note:** The Matrix rules claims in `docs/UNVERIFIED-RULES.md`
> (items 1-9) are deliberately left unverified while this module is parked.
> Before any Matrix work resumes, run those items through
> `sr5-rules-analyst` first.

**Status: deferred.** Core tracker work takes priority; this plan is parked
here until it's picked back up. Rules numbers below marked `[UNVERIFIED: ...]`
have not been checked against `rules/` — see `docs/UNVERIFIED-RULES.md`
before treating them as fact.

## Context

The Matrix module adds Shadowrun 5e hacking support to the existing Angular 19 initiative tracker.
**Branch:** `feat/matrix-module`

Phase 1 data models, services, and badge are **already committed** (`563a3b7`):
- `src/Matrix/` — all domain classes (MatrixParticipant, ICParticipant, MatrixHost, MatrixTarget, MatrixRunState, VRMode, ICType, MatrixIcon)
- `src/app/services/matrix-state.service.ts` — jackIn/jackOut/addHost skeleton
- `src/app/services/os-tracking.service.ts` — full threshold logic
- `src/app/matrix/matrix-participant-badge/` — VR chip, OS chip, PHYS LOCKED badge

**What Phase 1 does NOT include:** a way for the GM to actually create a MatrixParticipant. Every step below is a GM-usable feature slice that can be built, tested at the table, and committed before the next step starts.

---

## Step 1 — Add Decker to the initiative tracker ✅ NEXT

**Goal:** GM can add a decker, enter ASDF stats + intuition + VR mode, and see them appear in the initiative list with the correct Matrix initiative and badge. No workflow panel yet.

**Files to create/modify:**
- `src/app/battle-tracker/battle-tracker.component.ts` — `addMatrixParticipant()`, `onMatrixDPChanged()`, `onVRModeChange()`, fix `getParticipantBaseInitiative()` for Matrix participants
- `src/app/battle-tracker/battle-tracker.component.html` — "Add Decker" button; DP input replacing Reaction for Matrix rows; VR mode toggle buttons in the stats col

**Acceptance criteria (done when):**
1. Clicking "Add Decker" (💻 icon beside the existing + button) inserts a MatrixParticipant named "Decker" with defaults (DP 6, INT 3, AR, dices = 1).
2. The tracker row shows the VR chip (AR / COLD / HOT), OS: 0, no PHYS LOCKED badge.
3. Changing the DP input updates the initiative base immediately (DP + INT). `[UNVERIFIED: docs/UNVERIFIED-RULES.md #1]`
4. Clicking HOT/COLD/AR mode buttons sets dices to 4/3/1 and updates initiative. `[UNVERIFIED: docs/UNVERIFIED-RULES.md #1]`
5. PHYS LOCKED badge appears when mode is COLD or HOT. `[UNVERIFIED: docs/UNVERIFIED-RULES.md #2]`
6. Regular (non-Matrix) participant rows are unchanged.

**Unlocks:** Step 2 (the badge's OS chip can now be tapped; the OS editor has a real participant to operate on).

---

## Step 1 — Decker in the initiative tracker ✅ DONE (2026-08-29)

> **What this step actually turned out to be.** The plan assumed Step 1 was a
> build. It was not — `gmJackIn`, `gmJackOut`, `applyVRMode`,
> `promoteToMatrixParticipant`, `onDeckStatChanged`, `pendingVrModes` and a
> Matrix branch in `getParticipantBaseInitiative` were **already on `main`**.
> (The old "Phase 1 does NOT include a way for the GM to create a
> MatrixParticipant" note was wrong; `promoteToMatrixParticipant` does exactly
> that.) Step 1 was therefore a **correctness fix** to existing code, which is
> where the four wrong rules claims had already done damage:
>
> 1. `getParticipantBaseInitiative` returned **DP + INT for every
>    MatrixParticipant regardless of mode**, so an AR decker used the Matrix
>    formula. It also disagreed with `applyVRMode`'s own AR branch (REA + INT),
>    so the two only diverged once something recomputed the base — editing
>    Reaction or Intuition on an AR decker jumped their Initiative.
> 2. `AR_INITIATIVE_DICE = 1` in `MatrixParticipant` meant returning to AR
>    **truncated any augmented decker to 1D6**, permanently.
> 3. `gmJackOut` and the player `configure_deck` jack-out path both wrote a
>    hard-coded `PHYSICAL_INITIATIVE_DICE`, same truncation.
> 4. Initial deck creation wrote `setDicesWithoutRoll(PHYSICAL_INITIATIVE_DICE)`
>    — so simply handing an augmented character a cyberdeck cut their dice.
>
> **Fixed:** mode-aware base initiative; `initiativeDiceForMode` now returns
> `number | null` (null for AR/None) so no caller can silently receive 1D6; new
> `MatrixParticipant.preVrDiceCount` remembers the pre-VR count, restored via
> `restorePhysicalDiceCount` through the normal dice funnel; deck creation
> leaves dice alone. **10 regression tests added; suite 954 → 964, all green.**
>
> Deferred to Step 2 as planned: `overwatchAlert` in `MatrixParticipant` still
> carries the fictional OS-20 `'ic-alert'` tier, matching the same defect in
> `os-tracking.service.ts`.

## Step 2 — OS counter inline editor

**Goal:** Clicking the OS chip in the badge opens ± controls inline. Threshold alerts fire at OS 20 (amber banner) and OS 40 (red modal). Reset on jack-out. `[UNVERIFIED: docs/UNVERIFIED-RULES.md #3]`

**Files to create/modify:**
- `src/app/matrix/matrix-participant-badge/matrix-participant-badge.component.html` — expand OS chip into ±/reset row on click
- `src/app/matrix/matrix-participant-badge/matrix-participant-badge.component.ts` — expand/collapse state, emit OS delta
- `src/app/battle-tracker/battle-tracker.component.ts` — handle osClick → call `osTracking.addOS()`, subscribe to `threshold$` for alerts
- `src/app/battle-tracker/battle-tracker.component.html` — toast/alert area for IC ALERT and CONVERGENCE events

**Acceptance criteria:**
1. Clicking OS chip toggles an inline panel with [−5] [−1] [+1] [+5] [Reset] buttons.
2. Tapping +1 increments OS on the participant, badge color updates.
3. When OS crosses 20 → amber banner: "⚠ IC Alert — [Decker name] OS: 21". `[UNVERIFIED: docs/UNVERIFIED-RULES.md #3]`
4. When OS crosses 40 → red modal: "☠ Convergence! GOD attacks [Decker name]". `[UNVERIFIED: docs/UNVERIFIED-RULES.md #3]`
5. Reset sets OS to 0 (confirmed via the existing ConfirmationDialogService).
6. Threshold fires exactly once when crossing the boundary, not on every increment above it.

**Unlocks:** Step 3 (OS resets correctly when IC is spawned / decker jacks out; needed to wire IC spawning to OS tracking).

---

## Step 2 — Overwatch Score counter (manual) ✅ DONE (2026-08-29)

> **Ruled and applied:** **C1** — banding below 40 is display-only, no
> mechanical effect. **C6** — reboot/jack-out resets OS to zero and erases that
> decker's marks, with no cooldown (the reset itself is printed, pp. 240, 242;
> the ruling settles that no friction is added on top).
>
> The OS-20 fiction reached further than the plan assumed — it was in **six**
> places, several of them live UI: `OsAlertLevel`, `getOSAlert` and the
> fabricated "Section 9.2 / Table 25" comment in `os-tracking.service.ts`;
> `MatrixParticipant.overwatchAlert`; the badge's `osTier`; a subscriber branch
> in `ngOnInit`; an "⚠ IC Alert" strip in the GM template with its CSS; and the
> wire-field comment in `session-sync.service.ts`. All corrected.
>
> Two things were **kept** rather than deleted, because they are rules-correct:
> the reminder strip (renamed `icAlertMessages` → `osReminders`, relabelled
> "Overwatch owed") legitimately tells the GM that OS is owed once defense
> resolves, which is exactly the printed rule (p. 232); and the act-modal
> reminder. What was wrong there was the framing, not the mechanism.
>
> `ILLEGAL_OS_ACTIONS` became a `ReadonlySet<string>`: it was a
> `Record<string, number>` whose per-action costs (Hack on the Fly 1, Brute
> Force 2) implied a fixed OS price that does not exist — OS equals the
> defender's hits, which this app never rolls. Nothing read those values except
> a `> 0` test.
>
> **7 regression tests added; suite 964 → 972, all green.**

## Step 3 — IC as initiative participants

**Goal:** GM can spawn IC from a host rating. IC enters the tracker as a full participant (rolls initiative, takes turns). No host/target model needed yet — IC is standalone.

**Files to create/modify:**
- `src/app/matrix/ic-spawner/ic-spawner.component.{ts,html,css}` — new standalone component: IC type dropdown, host rating input, initiative preview, Spawn button
- `src/app/battle-tracker/battle-tracker.component.ts` — `spawnIC()` method that creates ICParticipant, wires side-data maps, calls `combatManager.addParticipant()`
- `src/app/battle-tracker/battle-tracker.component.html` — "Spawn IC" button/dropdown (visible when at least one MatrixParticipant is in the tracker)

**Acceptance criteria:**
1. A "Spawn IC" button appears when the tracker contains ≥1 MatrixParticipant.
2. GM selects IC type (Patrol / Killer / etc.) and host rating (1–12).
3. On Spawn: an ICParticipant appears in the tracker with `baseIni = rating × 2`, dices = 2 (Patrol) or 4 (others). `[UNVERIFIED: docs/UNVERIFIED-RULES.md #4]`
4. The IC row shows a distinct badge (e.g., "IC — Patrol" label, no OS chip, no PHYS LOCKED).
5. IC acts on its initiative like any other participant (existing engine handles this with no changes).
6. The ordinary Delete control removes the IC, same as any other participant.

**Unlocks:** Step 4 (the workflow stepper needs IC spawning to be complete for the InsideHost step to be useful).

---

## Step 4 — Hacking workflow shell (jack-in/out panel + stepper)

**Goal:** A collapsible Matrix panel appears in the GM view. It shows the workflow stepper (Jack In → Public Space → Locate Host → Access Host → Inside Host → Target Interaction → Jack Out) and a Jack In / Mode Switch form. OS reset on jack-out.

**Files to create/modify:**
- `src/app/matrix/matrix-run-panel/matrix-run-panel.component.{ts,html,css}` — outer container with stepper + step panels; `@Input activeDeckers`
- `src/app/matrix/jack-in-panel/jack-in-panel.component.{ts,html,css}` — decker dropdown, mode selector (AR/Cold/Hot), Confirm Jack In, Jack Out buttons
- `src/app/battle-tracker/battle-tracker.component.html` — import and render `<app-matrix-run-panel>` (collapsible section below the participant list)
- `src/app/battle-tracker/battle-tracker.component.ts` — pass `activeDeckers` getter to the panel; handle jackOut event → `matrixState.jackOut()` + `osTracking.resetOS()`

**Acceptance criteria:**
1. A "Matrix" collapsible section appears in the GM view (collapsed by default).
2. Expanding it shows the 7-step stepper; active step is highlighted.
3. Jack In form shows all MatrixParticipants from the tracker as a dropdown.
4. Selecting a decker and clicking "Jack In (Hot-Sim)" calls `matrixState.jackIn()`, updates the tracker badge, and marks Step 1 complete on the stepper.
5. "Jack Out" button resets OS to 0 (with confirmation) and reverts the badge to AR.
6. Noise is explicitly NOT a field here — plan doc says it's a per-roll modifier (Step 9). `[UNVERIFIED: docs/UNVERIFIED-RULES.md #10]`

**Unlocks:** Step 5 (the Host step panel plugs into the existing stepper slot).

---

## Step 5 — Host + target creation

**Goal:** GM can create a host (name, rating, ASDF) and add device/file targets inside it. Targets are visible to the GM in the InsideHost panel. No marks or reveals yet.

**Files to create/modify:**
- `src/app/matrix/locate-host-panel/locate-host-panel.component.{ts,html,css}` — host creation form; host list; "Set Current Host" button
- `src/app/matrix/inside-host-panel/inside-host-panel.component.{ts,html,css}` — list of targets in current host; "Add Target" form (name, type, ASDF, spotted status)
- `src/app/matrix/target-card/target-card.component.{ts,html,css}` — read-only card: name, type badge, spotted status, Matrix CM track
- `src/app/services/matrix-state.service.ts` — `addTarget()`, `removeTarget()` methods

**Acceptance criteria:**
1. In the "Locate Host" step: GM creates "Aztechnology Host — Rating 8" with ASDF auto-suggested from rating; can override.
2. In the "Inside Host" step: GM adds a Device target ("Security Camera", Device Rating 3, Spotted) and a File target ("Personnel Records", Hidden).
3. Both targets appear in the InsideHost panel as cards with their type badge and spotted status icon.
4. Host ASDF and rating are editable after creation.
5. No marks UI yet — that's Step 6.

**Unlocks:** Step 6 (marks need targets to exist).

---

## Step 6 — Mark tracking

**Goal:** GM can place / remove marks on targets, recording which decker placed each mark (max 3 per decker per target). Marks are visible on target cards as filled dots. `[UNVERIFIED: docs/UNVERIFIED-RULES.md #5]`

**Files to create/modify:**
- `src/app/matrix/target-card/target-card.component.{ts,html,css}` — add mark dots (●○○ style), decker selector for "+Mark" button, "Remove Mark" per decker
- `src/app/services/matrix-state.service.ts` — `addMark(target, deckerId)`, `removeMark(target, deckerId)`, each mutating `MatrixRunState` directly (no wrapper - see `ARCHITECTURE.md` §3 for the backing-field convention these should follow)

**Acceptance criteria:**
1. Clicking "+Mark" on a target card: dropdown selects decker → mark count increments (max 3). `[UNVERIFIED: docs/UNVERIFIED-RULES.md #5]`
2. Dots rendered: e.g., `●●○` for 2 marks.
3. "×" button next to each decker's dot row removes 1 mark.
4. Cannot place a 4th mark (button disabled at 3). `[UNVERIFIED: docs/UNVERIFIED-RULES.md #5]`
5. The "×" control removes the last mark placed - the correction path for a
   mis-tapped "+Mark" (there is no undo control; see `ARCHITECTURE.md` §3).
6. Mark data persists across step navigation (stays in MatrixRunState).

**Unlocks:** Step 7 (reveals use marks as a prerequisite check in the UI hint text).

---

## Step 7 — Reveal mechanic + player view

**Goal:** GM can reveal targets to players. Players with a decker character see revealed targets (read-only). Running-silent targets appear as "Unknown Icon ■" in player view.

**Files to create/modify:**
- `src/app/matrix/target-card/target-card.component.{ts,html}` — "Reveal to Players" button; visual indicator when revealed
- `src/app/matrix/matrix-player-view/matrix-player-view.component.{ts,html,css}` — new standalone component; shows decker VR mode, OS bar, revealed target cards
- `src/app/player-view/player-view.component.{ts,html}` — import and render `<app-matrix-player-view>` when `sharedState.isMatrix = true` for this player's character
- `src/app/services/matrix-state.service.ts` — `revealTarget(target)` method
- `src/app/services/session-sync.service.ts` — add `matrixTargets?: SharedMatrixTarget[]` to `SharedCombatState`; populate in broadcast

**Acceptance criteria:**
1. GM clicks "Reveal" on a Spotted target → card gains a "REVEALED" badge.
2. Player view (open in a second tab/browser) immediately shows the target card with name, type, and marks.
3. Hidden targets do NOT appear in player view.
4. Running-silent targets show as "Unknown Icon ■" with no name.
5. Decker player sees their own OS bar and VR mode badge in player view.

**Unlocks:** Step 8 (OS automation needs the action planner to know which actions are illegal).

---

## Step 8 — OS automation (illegal action prompts)

**Goal:** When a MatrixParticipant takes a Matrix action tagged as illegal (Hack on the Fly, Brute Force, Data Spike), a modal prompts the GM with the RAW OS delta. GM can accept, adjust, or cancel.

**Files to create/modify:**
- `src/app/matrix/os-prompt/os-prompt.component.{ts,html,css}` — modal: action name, suggested OS, number input, Accept / Cancel buttons
- `src/app/shared/declared-actions.ts` — export `OS_ADDING_ACTIONS: Record<string, number>` mapping action IDs to base OS cost
- `src/app/battle-tracker/battle-tracker.component.ts` — in `performAct()` / action submit path: check if actor is MatrixParticipant and action is in `OS_ADDING_ACTIONS`; open OsPromptComponent; on confirm call `osTracking.addOS()`

**Acceptance criteria:**
1. When a decker takes "Hack on the Fly", a modal appears: "Hack on the Fly — Apply OS? Suggested: +2. [Accept] [Modify] [Cancel]".
2. Accept → OS increments, badge updates.
3. Modify → GM enters custom delta → OS increments by that amount.
4. Cancel → no OS change.
5. Non-illegal actions (Analyze, Browse, etc.) produce no OS prompt.
6. There is no undo control anywhere in the tracker (see `ARCHITECTURE.md`
   §3): a mis-confirmed prompt has to be corrected by hand, via
   `osTracking.resetOS()`/`addOS()` with the right delta. If this proves too
   fiddly at the table, a dedicated correction control is a separate,
   deliberate addition - not a side effect of this step.

**Unlocks:** Step 9 (access method panels need full OS automation to be meaningful).

---

## Step 9 — Full hacking workflow (access methods + direct connection)

**Goal:** The AccessHost step panel has working Hack on the Fly, Brute Force, and Direct Connection flows with dice-roll prompts and OS tracking.

**Files to create/modify:**
- `src/app/matrix/access-host-panel/access-host-panel.component.{ts,html,css}` — three entry methods with confirm buttons; wires to dice-roll prompt and OsPromptComponent
- `src/app/matrix/matrix-run-panel/matrix-run-panel.component.html` — plug in AccessHostPanelComponent at step 4 slot

**Acceptance criteria:**
1. "Hack on the Fly" button opens a dice roll prompt (reusing DiceRollerComponent) then the OS prompt (+2 per mark on success, per RAW). `[UNVERIFIED: docs/UNVERIFIED-RULES.md #6]`
2. "Brute Force" button does the same with opposed test hints and OS cost (marks × 4). `[UNVERIFIED: docs/UNVERIFIED-RULES.md #7]`
3. "Direct Connection" checkbox: sets accessMethod = 'direct-connection'; 1 mark on host, 0 OS, confirmation log entry. `[UNVERIFIED: docs/UNVERIFIED-RULES.md #8]`
4. Access method persists on the MatrixHost object.

**Unlocks:** Step 10 (icon generator is purely additive).

---

## Step 10 — Icon generator

**Goal:** The PublicSpace step panel has a "Generate N Icons" button that creates random public Matrix icons with plausible names (commlinks, spam nodes, vehicle nodes).

**Files to create/modify:**
- `src/app/services/icon-generator.service.ts` — name corpus, `generate(n): MatrixIcon[]` method
- `src/app/matrix/public-space-panel/public-space-panel.component.{ts,html,css}` — list of generated icons; "Promote" button to elevate to a MatrixTarget

**Acceptance criteria:**
1. "Generate 5 Icons" button populates a list of MatrixIcons with device type, rating, and a generated name.
2. "Promote" elevates an icon to a full MatrixTarget on the current host.
3. Names vary on each generate (not always identical).
4. List clears on Matrix run reset.

**Unlocks:** Step 11 (deck reconfiguration is the final polish step).

---

## Step 11 — Deck reconfiguration action

**Goal:** "Switch Two Matrix Attributes" (Free Action) lets the decker swap any two of A/S/D/F. If DP changes, initiative base updates immediately. `[UNVERIFIED: docs/UNVERIFIED-RULES.md #9]`

**Files to create/modify:**
- `src/app/battle-tracker/battle-tracker.component.ts` — `onDeckReconfig(decker, attr1, attr2)` method; called from action submit when action is 'deck-reconfig'
- `src/app/battle-tracker/battle-tracker.component.html` — in the Matrix stats row, show a small "Swap" affordance (two radio-style selects + Swap button) when the decker's current action is 'deck-reconfig'

**Acceptance criteria:**
1. Decker declares "Deck Reconfiguration" in the action planner.
2. A two-attribute swap UI appears: select "Attack" ↔ "Data Processing", click Swap.
3. Both attribute values swap on the MatrixParticipant.
4. If DP was swapped, `baseIni` recalculates immediately; badge initiative score updates.
5. A mis-tapped swap is corrected by swapping the same two attributes back -
   there is no undo control (`ARCHITECTURE.md` §3).

---

## Architecture rules for this module

- **No changes to IParticipant or Participant** — MatrixParticipant/ICParticipant extend Participant and satisfy IParticipant via inheritance.
- **All mutations assign the matching backing field directly** — same
  `_field` + getter/setter convention as the existing engine
  (`ARCHITECTURE.md` §3). There is no undo/redo mechanism in this tracker;
  do not reintroduce one.
- **Side-data Maps in BattleTrackerComponent** — `participantReactions`, `participantIntuitions`, `participantEdgeRatings`, etc. still need entries for every participant (including Matrix). The `getParticipantBaseInitiative()` method must branch on `isMatrix(p)` to use `DP + INT` instead of `REA + INT`.
- **No server changes needed** — `server.js` treats `SharedCombatState` as an opaque JSON blob; Matrix state additions to the interface are transparently relayed.
- **Components go in `src/app/matrix/`** — one folder per component; all standalone.
- **No i18n** — codebase already removed @ngx-translate; all strings hardcoded English.
