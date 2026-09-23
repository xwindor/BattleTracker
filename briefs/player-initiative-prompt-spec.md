# Spec: player initiative prompt as a modal with embedded dice roller

### Request

Replace the player view's inline "please roll initiative" banner (and its inline "roll the extra delta dice" variant) with a modal dialog that embeds the existing dice-roller component and auto-fills the rolled total into the submission; also make the prompt reappear reliably for a player who was disconnected or joined late.

Not in scope: any change to initiative dice-count rules, roll-clamping math, who is allowed to roll for whom (`allowRollAs`/GM-rolls-for-NPC), the GM-side UI (`btnRequestPlayerRolls_Click`, `btnForceRollOutstanding_Click`, etc.), or prompting for a second/third character owned by the same player (Open Decision 4).

No rules citation required: roll amounts, dice caps, and initiative math (`clampInitiativeRoll`, `getInitiativeRollMax`) are pre-existing and unchanged. If the implementer finds the modal work requires touching that math, stop and treat it as a separate rules-dependent change.

### Current behaviour

- **Trigger.** GM "Request Player Rolls" (`BattleTrackerComponent.requestPlayerRolls`, `src/app/battle-tracker/battle-tracker.component.ts:8690`) sends a one-shot `request_rolls` session command with no payload. Gated on `getPendingPlayerRollCount() > 0` (`:8678`), which counts player-owned participants (`participantOwners`) with `diceIni <= 0` and not `ooc`.
- **Player-side flag.** `PlayerViewComponent.onCommand` sets `this.promptRoll = true` and calls `triggerRollNudge()` on `request_rolls` (`src/app/player-view/player-view.component.ts:230-232`); `clear_roll_prompt` sets it `false` (233-234), as do `combat_ended` (237), a started→not-started transition in `applyIncomingState` (1118-1119), and session-closed (276). `promptRoll` is **not** in `SharedCombatState`/`SharedParticipantState` — transient component state set only by a live command.
- **Reconnect gap.** `join()` (201) and `rejoinAfterReconnect()` (~304) both call `applyIncomingState(state)`, but nothing re-derives `promptRoll`. A player connecting after `request_rolls` went out (refresh, socket reconnect, late join) gets no prompt, though `actor.pendingRoll` may still be `true`.
- **Authoritative flag.** `SharedParticipantState.pendingRoll` (`src/app/services/session-sync.service.ts:65`) is computed on every GM broadcast as `p.diceIni <= 0` (`battle-tracker.component.ts:3565`, in `getSharedParticipants()`), so it is reconnect-safe. `applyInitiativeRollLogic` (player-view 525-542) already reads `actor.pendingRoll` for the VR delta case, but the main banner is driven by `promptRoll`.
- **Main roll UI.** `player-view.component.html:171-184`, `@if (promptRoll)` renders `.roll-banner`: number input bound to `manualRoll` (clamped live by `onManualRollChanged`, 660-673, via `clampRollToBounds`/`getInitiativeRollMax`), "Submit Manual Roll" (`submitManualRoll()`, 605-622), "Auto Roll" (`submitAutoRoll()`, 624-658). `submitAutoRoll` generates random dice inline (does not call `DiceRollerComponent`), sets `this.ownDiceRoll = { values }` so the separate roller animates, broadcasts `dice_roll`, then sends `roll_submission` with `participantId`, `roll` (clamped), `diceValues`, `diceSum`. `submitManualRoll` sends `roll_submission` with `participantId` and clamped `roll`. Both clear `promptRoll` and `manualRoll` (620, 656).
- **Delta roll UI.** `@if (pendingDeltaDice > 0)` (html 185-196) renders a second `.roll-banner` with `submitDeltaRoll()` (545-558) and `submitAutoDeltaRoll()` (561-579), for dice gained mid-turn from a VR mode change (computed in `applyInitiativeRollLogic`). Own min/max (`pendingDeltaDice` to `pendingDeltaDice * 6`), not via `clampInitiativeRoll`/`getInitiativeRollMax`.
- **Dice-roller widget.** `DiceRollerComponent` (`src/app/dice-roller/dice-roller.component.ts`) embedded lower on the player page (html 261-268) as `<app-dice-roller [incomingRoll] [ownRoll] (rolledEvent)="onPlayerDiceRolled($event)">`. Its `roll()` (266-278) rolls `diceCount` (default 2, editable 1-50) d6, animates, emits `rolledEvent`; `onPlayerDiceRolled` (player-view 130) only broadcasts `dice_roll`, never `roll_submission`. `ownRoll`/`incomingRoll` inputs trigger animation from outside (used by `submitAutoRoll`/`autoRollForMode`/`submitAutoDeltaRoll`).
- **Nudge.** `triggerRollNudge()` (983-997) toggles `rollPromptNudge` for `.nudge-pulse` (css 133-140) and calls `playNudgeChime()` (~999), an `AudioContext` tone unless `notifyMuted` (localStorage `bt.playerNotifyMuted.v1`).
- **Multiple owned characters.** `primaryCharacter` (795-796) is `ownParticipants[0]`. All the methods above operate only on it. Pre-existing limitation.
- **GM roll paths untouched.** `rollAndLogInitiative`, `rollOutstandingInitiative`, and the GM "roll as" attribution flow in `DiceRollerComponent` (`allowRollAs`/`rollAsName`) are GM-side only.

### Affected paths

1. `player-view.component.html:171-184` — main roll banner (`@if (promptRoll)`).
2. `player-view.component.html:185-196` — delta roll banner (`@if (pendingDeltaDice > 0)`).
3. `player-view.component.html:261-268` — standalone `<app-dice-roller>`; must keep working for non-initiative rolls.
4. `player-view.component.ts:230-232` — `request_rolls` handler.
5. `player-view.component.ts:233-234` — `clear_roll_prompt` handler.
6. `player-view.component.ts:235-240` — `combat_ended` handler.
7. `player-view.component.ts:1116-1120` (`applyIncomingState`) — clears on started→not-started; site for re-arming from `actor.pendingRoll`.
8. `player-view.component.ts:201-260` (`join()`) and `rejoinAfterReconnect()` (~304) — where the reconnect fix must take effect.
9. `player-view.component.ts:605-622` (`submitManualRoll`), `624-658` (`submitAutoRoll`).
10. `player-view.component.ts:545-558` (`submitDeltaRoll`), `561-579` (`submitAutoDeltaRoll`).
11. `player-view.component.ts:660-678` (`onManualRollChanged`, `getPrimaryCharacterManualRollMax`) — clamping the modal must keep using.
12. `player-view.component.ts:983-1000` (`triggerRollNudge`, `playNudgeChime`) — must fire when the modal newly opens.
13. `src/app/dice-roller/dice-roller.component.ts`/`.html` — embedded instance's `rolledEvent` needs a consumer that submits `roll_submission`.
14. `player-view.component.css:126-160` — `.roll-banner`/`.nudge-pulse`/`.roll-input` styling; move to modal or retire.
15. `src/scenarios/persistent-rooms.spec.ts` (~993-994) — asserts command types including `roll_submission`, `dice_roll`, `request_rolls`, `clear_roll_prompt`; must still hold.
16. `src/scenarios/action-log-attribution.spec.ts` — references `roll_submission`/`manualRoll`; check for banner assumptions.

Searched `promptRoll`, `pendingDeltaDice`, `roll-banner`, `request_rolls`, `manualRoll` across `src/`; no other surface. No `player-view.component.spec.ts` exists; only items 15-16 cover this flow, and they check command sequences, not rendered UI.

Not affected (confirmed): GM-side `requestPlayerRolls`/`btnRequestPlayerRolls_Click`/`rollOutstandingInitiative`; `DiceRollerComponent`'s `allowRollAs` machinery (player view never sets it).

### Proposed approach

- Single modal via `NgbModal` (already used in `player-view.component.ts` for the Act planner, `openActPlanner` ~680-689), replacing the `@if (promptRoll)` banner. Open/close driven from the same places `promptRoll` is set/cleared (items 4-8) plus the reconnect fix.
- Inside: a **second** `<app-dice-roller>` instance for on-screen rolling, plus a manual-entry input reusing `onManualRollChanged`/`clampInitiativeRoll`. Both converge on the existing `roll_submission` payloads.
- Wire the modal instance's `rolledEvent` to a handler that submits as `submitAutoRoll` does (clamped via `clampInitiativeRoll`, same payload, plus the `dice_roll` broadcast). Do not change the page-level roller's behaviour. The embedded roller's dice count must be set to the actor's initiative dice, not the free 1-50 default — if that can't be done without changing `DiceRollerComponent`'s inputs, add an input rather than altering existing behaviour.
- Same modal shell for the delta case with its own copy and its existing min/max.
- Reconnect fix: after applying state (in `applyIncomingState` or at `join()`/`rejoinAfterReconnect()`), if `primaryCharacter?.pendingRoll` is `true` and combat is started, open the modal if not already open. Must not interfere with existing edge-triggered resets (`joinChoice`, `pendingRequestMessage`, `hadOwnCharacter`; comments at 61-94), since `applyIncomingState` runs on every broadcast. Must not reopen on every broadcast after a dismissal — see Open Decision 2.
- Keep the chime on newly opening; pulse animation optional on the modal.

### Scope classification

- **TRACK** — surfacing an already-tracked "needs to roll" state and recording the value (payload unchanged).
- **GM RESOLVES** — nothing new.
- **OUT OF SCOPE** — per-character prompts for multi-character players; any change to valid roll values, caps, or initiative math.

### Size check

Small-to-medium, confined to `PlayerViewComponent` and styles, reusing `NgbModal` and `DiceRollerComponent`. No split needed.

### Acceptance criteria

1. On `request_rolls` for a continuously connected player, a modal (not an inline banner) prompts `primaryCharacter` to roll.
2. The modal's embedded roller animates dice and submits the total as `roll_submission` (`participantId`, `roll`, `diceValues`, `diceSum`), clamped via `clampInitiativeRoll`, with no separate copy step.
3. The modal's manual field clamps to `[0, getInitiativeRollMax(actor.initiativeDice)]` as `onManualRollChanged` does, and submits the same payload as `submitManualRoll`.
4. Submitting (auto or manual) closes the modal and clears prompt state (`promptRoll = false; manualRoll = ""`).
5. A player who reconnects/refreshes/joins late with `primaryCharacter.pendingRoll === true` in fresh state sees the modal open without the GM re-requesting.
6. A player with `pendingRoll === false` does not see it open on reconnect.
7. `clear_roll_prompt` and `combat_ended` close/suppress the modal.
8. The delta case uses the same modal pattern with its min/max (`pendingDeltaDice` to `pendingDeltaDice * 6`) unchanged.
9. The chime (respecting `notifyMuted`) plays when the modal newly opens.
10. The page-level `<app-dice-roller>` keeps working for non-initiative rolls exactly as before.

### Regression risk

- `persistent-rooms.spec.ts` asserts exact command types; modal must not change which commands fire or payload shapes.
- `action-log-attribution.spec.ts` — check whether it drives public methods (safe) or asserts banner DOM.
- `applyIncomingState` edge-triggers (see above).
- `DiceRollerComponent` is shared with the GM view; initiative submission must be scoped to the modal instance only.

### Scenarios to survive

1. **Ordinary.** GM requests rolls; connected player sees modal, rolls with embedded roller, total submitted and clamped; modal closes.
2. **Cap plus high roll.** Player at 5 initiative dice; embedded roll total is clamped by `clampInitiativeRoll` before submission, not trusted raw.
3. **Change of mind.** Player types a manual value then uses the roller (or vice versa); exactly one `roll_submission` goes out.
4. **Reconnect at the table.** Player drops Wi-Fi after GM requested rolls, reconnects before rolling; modal reappears for them only.
5. **Several players.** Each browser shows only its own `primaryCharacter`'s prompt.
6. **Delta after VR mode change.** Player already rolled, switches to hot-sim mid-pass; delta modal (not main) appears with correct dice count and limits.

### Open decisions

These mirror the Scope Questions in `briefs/player-initiative-prompt.md`. Implement per Xavier's answers recorded there under "Your answers"; if an answer is missing, stop and report.

**RESOLVED (Xavier, 2026-09-15) — these override the recommendations below where they differ:**

- **OD2 / Brief Q1: NOT dismissible.** No close button, no backdrop-click or Escape dismissal (`NgbModal` with `backdrop: 'static'`, `keyboard: false`). The main modal closes only when: the player submits a roll (auto or manual); the player's `primaryCharacter.pendingRoll` becomes `false` in incoming state (covers GM "Force Roll Outstanding", GM entering a value, any GM-side resolution — verify force-roll actually produces `pendingRoll === false` in the broadcast and report if not); `clear_roll_prompt`; `combat_ended`; combat started→not-started; session closed; or the player no longer has a primary character. The delta modal follows the same rule, closing when `pendingDeltaDice` drops to 0 or on the same end/close events.
- **OD1 / Brief Q2: yes.** On (re)connect, open when `primaryCharacter.pendingRoll === true` and combat is started. Since the modal isn't dismissible, there is no "dismissed" memory to track. Guard against double-open on every broadcast. Known caveat to verify and REPORT, not solve: `pendingRoll` (`diceIni <= 0`) may already be `true` before the GM has clicked "Request Player Rolls" (e.g. at the start of a new combat turn), so a reconnecting player might get the modal slightly before the GM requests. If this happens, describe it in your report; do not invent a new shared "rolls requested" field without it being specced.
- **OD4 / Brief Q3: no.** `primaryCharacter` only.
- **OD5 / Brief Q4: yes,** block the page behind (standard modal).

1. Reconnect re-trigger even if dismissed before disconnecting? Recommend yes when `pendingRoll` is still `true`. (Brief Q2)
2. Dismissible without rolling? Recommend yes, reopening on next reconnect or fresh `request_rolls`, not on every broadcast. (Brief Q1)
3. Roller animation (1550ms, `triggerLocalAnimation`) fit inside modal — reuse unmodified, CSS follow-up if cramped.
4. Extend to second/third owned characters? Recommend no; backlog. (Brief Q3)
5. Block page behind modal? Recommend standard blocking, matching Act planner. (Brief Q4)
