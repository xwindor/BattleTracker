import { AfterViewChecked, Component, ElementRef, OnDestroy, OnInit, TemplateRef, ViewChild } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { SessionSyncService, SharedCombatState, SharedLogEntry, SharedParticipantState } from "app/services/session-sync.service";
import { NgbModal, NgbModalModule, NgbModalRef, NgbTooltip } from "@ng-bootstrap/ng-bootstrap";
import { ALL_MATRIX_ACTION_NAMES, CYBERDECK_REQUIRED_ACTIONS, DECLARED_ACTIONS, DECLARED_ACTION_DESCRIPTIONS, DeclaredActionCategoryId, DeclaredActionItem, ILLEGAL_OS_ACTIONS } from "app/shared/declared-actions";
import { INTERRUPT_ACTION_META } from "app/shared/interrupt-actions";
import { DiceRollerComponent } from "app/dice-roller/dice-roller.component";
import { MatrixPlayerViewComponent } from "app/matrix/matrix-player-view/matrix-player-view.component";
import { DeclaredActionEngine, DeclaredActionSelection } from "app/shared/declared-action-engine";
import { buildDecodeFrame, randomMatrixChar, escapeHtml, formatLogText, getLogTextClass } from "app/shared/log-formatter";
import { clampInitiativeRoll, clampRollToBounds, getInitiativeRollMax } from "app/shared/roll-utils";

@Component({
  standalone: true,
  selector: "app-player-view",
  imports: [ CommonModule, FormsModule, NgbModalModule, NgbTooltip, DiceRollerComponent, MatrixPlayerViewComponent ],
  templateUrl: "./player-view.component.html",
  styleUrls: [ "./player-view.component.css" ]
})
export class PlayerViewComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild("logListContainer") logListContainer?: ElementRef<HTMLElement>;
  room = "";
  private playerToken = "";
  characterName = "";
  initiativeDice = 1;
  edgeRating = 1;
  reaction = 1;
  intuition = 3;
  overflowHealth = 4;
  physicalHealth = 10;
  stunHealth = 10;
  deckConfigExpanded = false;
  deckJackedIn = false;
  dataProcessing = 6;
  attack = 0;
  sleaze = 0;
  firewall = 0;
  deviceRating = 0;
  vrMode = "AR"; // "AR" | "cold-sim" | "hot-sim"
  manualRoll = "";
  pendingDeltaDice = 0;
  manualDeltaRoll = "";
  pendingFullReroll = 0;
  manualFullReroll = "";
  connected = false;
  error = "";
  state: SharedCombatState | null = null;
  log: SharedLogEntry[] = [];
  promptRoll = false;
  rollPromptNudge = false;
  notifyMuted = false;
  info = "";
  selectedClaimParticipantId = "";
  actModalParticipant: SharedParticipantState | null = null;
  actModalRef: NgbModalRef | null = null;
  expandedDeclaredActionCategory: DeclaredActionCategoryId | null = "free";
  expandedDeclaredActionDetailKey: string | null = null;
  private declaredActionSelection: DeclaredActionSelection = {
    free: null,
    simple: [],
    complex: null
  };
  readonly declaredActions = DECLARED_ACTIONS;

  get physicalActionCategories() {
    return this.declaredActions.filter(c => !c.id.startsWith("matrix"));
  }

  get matrixActionCategories() {
    return this.declaredActions.filter(c => c.id.startsWith("matrix"));
  }

  matrixGroupOpen = false;

  toggleMatrixGroup() {
    this.matrixGroupOpen = !this.matrixGroupOpen;
  }

  incomingDiceRoll: { roller: string; values: number[] } | null = null;
  ownDiceRoll: { values: number[] } | null = null;

  onPlayerDiceRolled(values: number[]): void {
    if (!this.connected) return;
    const rollerName = this.characterName || this.playerToken;
    this.session.sendCommand({
      type: "dice_roll",
      player: this.playerToken,
      payload: { roller: rollerName, diceCount: values.length, values }
    });
  }

  private pendingLogScroll = false;
  private flashedLogIndex = -1;
  private clearLogFlashTimeout: number | null = null;
  private nudgeTimeout: number | null = null;
  private audioCtx: AudioContext | null = null;
  private lastKnownCombatStarted = false;
  private explicitCombatEndedNotice = false;
  private readonly activeLogDecodeTimers = new Map<number, number>();
  private readonly activeLogDecodeText = new Map<number, string>();
  
  private readonly interruptActions = [
    "block", "parry", "dodge", "hitTheDirt", "intercept", "fullDefense"
  ].map(key => ({ key, label: INTERRUPT_ACTION_META[key]?.label ?? key }));

  constructor(private session: SessionSyncService, private modalService: NgbModal) {}

  ngOnInit() {
    this.playerToken = `pl-${Math.random().toString(36).slice(2, 10)}`;
    const params = new URLSearchParams(window.location.search);
    const room = params.get("room");
    if (room) {
      this.room = room.toUpperCase();
    }
    this.notifyMuted = localStorage.getItem('bt.playerNotifyMuted.v1') === 'true';
  }

  ngOnDestroy() {
    if (this.clearLogFlashTimeout !== null) {
      window.clearTimeout(this.clearLogFlashTimeout);
      this.clearLogFlashTimeout = null;
    }
    if (this.nudgeTimeout !== null) {
      window.clearTimeout(this.nudgeTimeout);
      this.nudgeTimeout = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close();
      this.audioCtx = null;
    }
    this.clearLogDecodeAnimations();
    if (this.connected && this.session.currentRoom) {
      this.session.sendCommand({
        type: "release_claims",
        player: this.playerToken,
        payload: {}
      });
    }
    this.session.disconnect();
  }

  ngAfterViewChecked() {
    if (!this.pendingLogScroll) {
      return;
    }
    this.pendingLogScroll = false;
    this.scrollLogToBottom();
  }

  async join() {
    this.error = "";
    this.info = "";
    try {
      this.session.connect();
      const { state, log } = await this.session.joinAsPlayer(this.room.trim().toUpperCase(), this.playerToken);
      this.connected = true;
      this.applyIncomingState(state);
      this.log = log || [];
      this.clearLogDecodeAnimations();
      this.pendingLogScroll = true;
      this.session.onState((next) => {
        this.applyIncomingState(next);
      });
      this.session.onLog((entry) => {
        this.log = [ ...this.log, entry ];
        this.pendingLogScroll = true;
        this.flashLogEntry(this.log.length - 1);
        this.startLogDecode(this.log.length - 1, entry.text);
      });
      this.session.onCommand((command) => {
        if (command.type === "request_rolls") {
          this.promptRoll = true;
          this.pendingFullReroll = 0; // promptRoll supersedes the pre-combat re-roll banner
          this.manualFullReroll = "";
          this.triggerRollNudge();
        } else if (command.type === "clear_roll_prompt") {
          this.promptRoll = false;
        } else if (command.type === "combat_ended") {
          this.explicitCombatEndedNotice = true;
          this.promptRoll = false;
          this.manualRoll = "";
          this.closeActPlanner();
          this.info = "GM ended combat.";
        } else if (command.type === "dice_roll") {
          if (command.player === this.playerToken) return; // skip echo of our own roll
          const roller = String(command.payload?.["roller"] || command.player || "Unknown");
          const rawValues = command.payload?.["values"];
          const values = Array.isArray(rawValues) ? (rawValues as unknown[]).map(Number) : [];
          if (values.length > 0) {
            this.incomingDiceRoll = { roller, values };
          }
        }
      });
      this.session.onSessionClosed(() => {
        this.connected = false;
        this.state = null;
        this.promptRoll = false;
        this.error = "Session was closed by GM.";
        this.clearLogDecodeAnimations();
      });
      if (this.ownParticipants.length === 0) {
        this.info = "Claim a character from the list or create a new one.";
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Unable to join room.";
    }
  }

  createCharacter() {
    this.info = "";
    this.session.sendCommand({
      type: "register_character",
      player: this.playerToken,
      payload: {
        characterName: this.characterName.trim(),
        initiativeDice: this.initiativeDice,
        edgeRating: this.edgeRating,
        reaction: this.reaction,
        intuition: this.intuition,
        overflowHealth: this.overflowHealth,
        physicalHealth: this.physicalHealth,
        stunHealth: this.stunHealth,
        isMatrix: false
      }
    });
    this.info = "Create character request sent.";
  }

  openDeckPanel() {
    if (!this.primaryCharacter) return;
    this.deckConfigExpanded = true;
  }

  activateDeck() {
    if (!this.primaryCharacter) return;
    // Enable deck on server — stats only, vrMode set to None until Jack In.
    this.session.sendCommand({
      type: "configure_deck",
      player: this.playerToken,
      payload: {
        isMatrix: true,
        create: true,
        dataProcessing: this.dataProcessing,
        attack: this.attack,
        sleaze: this.sleaze,
        firewall: this.firewall,
        deviceRating: this.deviceRating
      }
    });
  }

  jackIn() {
    if (!this.primaryCharacter) return;
    this.session.sendCommand({
      type: "configure_deck",
      player: this.playerToken,
      payload: {
        isMatrix: true,
        jackIn: true,
        dataProcessing: this.dataProcessing,
        attack: this.attack,
        sleaze: this.sleaze,
        firewall: this.firewall,
        deviceRating: this.deviceRating,
        vrMode: this.vrMode
      }
    });
    this.deckJackedIn = true;
    this.pendingDeltaDice = 0;
    this.pendingFullReroll = 0;
    this.applyInitiativeRollLogic(this.primaryCharacter.vrMode || "none", this.vrMode);
    this.info = "";
  }

  confirmMode() {
    if (!this.primaryCharacter?.isMatrix) return;
    this.session.sendCommand({
      type: "configure_deck",
      player: this.playerToken,
      payload: {
        isMatrix: true,
        jackIn: true,
        dataProcessing: this.dataProcessing,
        attack: this.attack,
        sleaze: this.sleaze,
        firewall: this.firewall,
        deviceRating: this.deviceRating,
        vrMode: this.vrMode
      }
    });
    this.deckJackedIn = true;
    this.pendingDeltaDice = 0;
    this.pendingFullReroll = 0;
    this.applyInitiativeRollLogic(this.primaryCharacter.vrMode || "none", this.vrMode);
    this.info = "";
  }

  jackOut() {
    if (!this.primaryCharacter) return;
    const oldMode = this.vrMode; // capture before reset
    // Keep deck active (isMatrix stays true) but remove VR mode.
    this.session.sendCommand({
      type: "configure_deck",
      player: this.playerToken,
      payload: {
        isMatrix: true,
        jackOut: true,
        dataProcessing: this.dataProcessing,
        attack: this.attack,
        sleaze: this.sleaze,
        firewall: this.firewall,
        deviceRating: this.deviceRating
      }
    });
    this.vrMode = "AR";
    this.deckJackedIn = false;
    this.pendingDeltaDice = 0;
    this.pendingFullReroll = 0;
    // Mid-combat: server auto-applies lost-dice delta. Pre-combat: may prompt a fresh roll.
    this.applyInitiativeRollLogic(oldMode, "AR");
    this.info = "";
  }

  removeDeckConfig() {
    if (this.primaryCharacter?.isMatrix) {
      // Only demote on the server if the deck was actually activated.
      this.session.sendCommand({
        type: "configure_deck",
        player: this.playerToken,
        payload: { isMatrix: false }
      });
    }
    this.deckConfigExpanded = false;
    this.deckJackedIn = false;
    this.info = "";
  }

  onDeckStatChange() {
    // Sync stat changes once the deck is active on the server — stats only, no mode change.
    if (!this.primaryCharacter?.isMatrix) return;
    this.session.sendCommand({
      type: "configure_deck",
      player: this.playerToken,
      payload: {
        isMatrix: true,
        dataProcessing: this.dataProcessing,
        attack: this.attack,
        sleaze: this.sleaze,
        firewall: this.firewall,
        deviceRating: this.deviceRating
      }
    });
  }

  private autoRollForMode(mode: string, overrideId?: string) {
    const actor = this.primaryCharacter;
    const participantId = overrideId ?? actor?.id;
    if (!participantId) return;
    const diceCount = mode === "hot-sim" ? 4 : mode === "cold-sim" ? 3 : 1;
    const values: number[] = Array.from({ length: diceCount }, () => Math.floor(Math.random() * 6) + 1);
    const diceSum = values.reduce((s, v) => s + v, 0);
    const rollerName = this.characterName || this.playerToken;

    this.ownDiceRoll = { values };

    this.session.sendCommand({
      type: "dice_roll",
      player: this.playerToken,
      payload: { roller: rollerName, diceCount: values.length, values }
    });

    this.session.sendCommand({
      type: "roll_submission",
      player: this.playerToken,
      payload: { participantId, roll: diceSum, diceValues: values, diceSum }
    });
  }

  /** Returns the number of initiative dice for a given VR mode string. */
  private diceCountForVrMode(mode: string): number {
    return mode === "hot-sim" ? 4 : mode === "cold-sim" ? 3 : 1;
  }

  /**
   * Decide what initiative roll action the player needs to take after a mode change:
   *   (a) Mid-combat, already rolled, gained dice → show delta-dice prompt.
   *   (b) Pre-combat (initiative prep), already rolled, dice count changed → show
   *       full fresh-reroll prompt (pendingFullReroll).
   *   (c) Everything else → server updated dices/baseIni; player rolls via normal
   *       promptRoll mechanism when the GM requests rolls.
   *
   * Call this AFTER resetting pendingDeltaDice/pendingFullReroll to 0.
   */
  private applyInitiativeRollLogic(oldMode: string, newMode: string): void {
    const actor = this.primaryCharacter;
    const combatActive = this.state?.started === true;
    const alreadyRolled = actor && !actor.pendingRoll;
    const oldDices = this.diceCountForVrMode(oldMode);
    const newDices = this.diceCountForVrMode(newMode);
    const delta = newDices - oldDices;

    if (combatActive && alreadyRolled) {
      // Mid-combat: already rolled this pass — only handle the dice delta.
      if (delta > 0) {
        // Gained dice: prompt the player to roll only the extra dice.
        this.pendingDeltaDice = delta;
      }
      // delta <= 0: server applied the lost-dice penalty automatically; nothing for player.
    } else if (alreadyRolled && delta !== 0) {
      // Initiative prep (pre-combat): player already rolled but dice count changed.
      // They need a completely fresh roll for the new dice count.
      this.pendingFullReroll = newDices;
    }
    // Haven't rolled yet: server already updated dices/baseIni.
    // Player will roll via the normal promptRoll banner when GM requests rolls.
  }

  /** Submit a manually-entered initiative delta roll. */
  submitDeltaRoll() {
    const actor = this.primaryCharacter;
    if (!actor || !this.pendingDeltaDice) return;
    const raw = Number(this.manualDeltaRoll);
    if (Number.isNaN(raw) || raw < 1) return;
    const clamped = Math.min(raw, this.pendingDeltaDice * 6);
    this.session.sendCommand({
      type: "roll_submission",
      player: this.playerToken,
      payload: { participantId: actor.id, roll: clamped, isDelta: true }
    });
    this.pendingDeltaDice = 0;
    this.manualDeltaRoll = "";
  }

  /** Auto-roll the pending delta dice and submit them as an initiative delta. */
  submitAutoDeltaRoll() {
    const actor = this.primaryCharacter;
    if (!actor || !this.pendingDeltaDice) return;
    const values = Array.from({ length: this.pendingDeltaDice }, () => Math.floor(Math.random() * 6) + 1);
    const diceSum = values.reduce((s, v) => s + v, 0);
    const rollerName = this.characterName || this.playerToken;
    this.ownDiceRoll = { values };
    this.session.sendCommand({
      type: "dice_roll",
      player: this.playerToken,
      payload: { roller: rollerName, diceCount: values.length, values }
    });
    this.session.sendCommand({
      type: "roll_submission",
      player: this.playerToken,
      payload: { participantId: actor.id, roll: diceSum, diceValues: values, diceSum, isDelta: true }
    });
    this.pendingDeltaDice = 0;
  }

  /**
   * Submit a manually-entered initiative full re-roll (pre-combat mode switch).
   * This is a standard roll_submission (no isDelta) that replaces diceIni entirely.
   */
  submitFullReroll() {
    const actor = this.primaryCharacter;
    if (!actor || !this.pendingFullReroll) return;
    const raw = Number(this.manualFullReroll);
    if (Number.isNaN(raw) || raw < 1) return;
    const clamped = Math.min(raw, this.pendingFullReroll * 6);
    this.session.sendCommand({
      type: "roll_submission",
      player: this.playerToken,
      payload: { participantId: actor.id, roll: clamped }
    });
    this.pendingFullReroll = 0;
    this.manualFullReroll = "";
  }

  /** Auto-roll a fresh full initiative re-roll for a pre-combat mode switch. */
  submitAutoFullReroll() {
    const actor = this.primaryCharacter;
    if (!actor || !this.pendingFullReroll) return;
    const values = Array.from({ length: this.pendingFullReroll }, () => Math.floor(Math.random() * 6) + 1);
    const diceSum = values.reduce((s, v) => s + v, 0);
    const rollerName = this.characterName || this.playerToken;
    this.ownDiceRoll = { values };
    this.session.sendCommand({
      type: "dice_roll",
      player: this.playerToken,
      payload: { roller: rollerName, diceCount: values.length, values }
    });
    this.session.sendCommand({
      type: "roll_submission",
      player: this.playerToken,
      payload: { participantId: actor.id, roll: diceSum, diceValues: values, diceSum }
    });
    this.pendingFullReroll = 0;
    this.manualFullReroll = "";
  }

  claimSelectedCharacter() {
    this.info = "";
    if (!this.selectedClaimParticipantId) {
      this.info = "Select a character to claim.";
      return;
    }
    this.session.sendCommand({
      type: "claim_character",
      player: this.playerToken,
      payload: {
        participantId: this.selectedClaimParticipantId
      }
    });
    this.info = "Claim request sent.";
  }

  submitManualRoll() {
    const actor = this.primaryCharacter;
    const value = Number(this.manualRoll);
    if (!actor || Number.isNaN(value)) {
      return;
    }
    const roll = this.clampInitiativeRoll(value, actor.initiativeDice);
    this.session.sendCommand({
      type: "roll_submission",
      player: this.playerToken,
      payload: {
        participantId: actor.id,
        roll
      }
    });
    this.promptRoll = false;
    this.manualRoll = "";
  }

  submitAutoRoll() {
    const actor = this.primaryCharacter;
    if (!actor) {
      return;
    }
    const diceCount = Math.max(1, Number(actor.initiativeDice || 1));
    const values: number[] = Array.from({ length: diceCount }, () => Math.floor(Math.random() * 6) + 1);
    const diceSum = values.reduce((s, v) => s + v, 0);
    const roll = this.clampInitiativeRoll(diceSum, actor.initiativeDice);
    const rollerName = this.characterName || this.playerToken;

    // Show dice animation in the player's own "Your Roll" section.
    this.ownDiceRoll = { values };

    // Broadcast so other players' dice rollers animate.
    this.session.sendCommand({
      type: "dice_roll",
      player: this.playerToken,
      payload: { roller: rollerName, diceCount: values.length, values }
    });

    // Submit initiative roll; include dice breakdown for GM log formula.
    this.session.sendCommand({
      type: "roll_submission",
      player: this.playerToken,
      payload: {
        participantId: actor.id,
        roll,
        diceValues: values,
        diceSum
      }
    });
    this.promptRoll = false;
    this.manualRoll = "";
  }

  onManualRollChanged(value: string | number | null) {
    if (value === null || value === undefined || value === "") {
      this.manualRoll = "";
      return;
    }
    const numeric = Number(value);
    if (Number.isNaN(numeric)) {
      this.manualRoll = "";
      return;
    }
    const max = this.getPrimaryCharacterManualRollMax();
    const clamped = clampRollToBounds(numeric, max);
    this.manualRoll = String(clamped);
  }

  getPrimaryCharacterManualRollMax(): number {
    const actor = this.primaryCharacter;
    return this.getInitiativeRollMax(actor?.initiativeDice);
  }

  openActPlanner(actor: SharedParticipantState, modalContent: TemplateRef<unknown>) {
    this.actModalParticipant = actor;
    this.declaredActionSelection = { free: null, simple: [], complex: null };
    this.expandedDeclaredActionCategory = "free";
    this.expandedDeclaredActionDetailKey = null;
    this.actModalRef = this.modalService.open(modalContent, { size: "lg", centered: true });
    this.actModalRef.result.finally(() => {
      this.actModalParticipant = null;
      this.actModalRef = null;
    });
  }

  closeActPlanner() {
    if (this.actModalRef) {
      this.actModalRef.dismiss();
    }
  }

  clearActPlannerSelection(): void {
    this.declaredActionSelection = { free: null, simple: [], complex: null };
  }

  isActPlannerSelectionEmpty(): boolean {
    return this.declaredActionSelection.free === null
      && this.declaredActionSelection.simple.length === 0
      && this.declaredActionSelection.complex === null;
  }

  submitActPlanner() {
    if (!this.actModalParticipant || !this.isDeclaredActionSelectionValid()) {
      return;
    }
    const sel = this.declaredActionSelection;
    const allSelected = [sel.free, ...sel.simple, sel.complex].filter((a): a is string => !!a);
    const illegalActions = allSelected.filter(name => name in ILLEGAL_OS_ACTIONS);
    this.session.sendCommand({
      type: "act",
      player: this.playerToken,
      payload: {
        participantId: this.actModalParticipant.id,
        declaredAction: this.buildDeclaredActionLog(),
        illegalActions
      }
    });
    this.closeActPlanner();
  }

  sendDelay(actor: SharedParticipantState) {
    this.session.sendCommand({
      type: "delay",
      player: this.playerToken,
      payload: { participantId: actor.id }
    });
  }

  sendInterrupt(actor: SharedParticipantState, actionKey: string) {
    this.session.sendCommand({
      type: "interrupt",
      player: this.playerToken,
      payload: {
        participantId: actor.id,
        actionKey
      }
    });
  }

  get visibleParticipants(): SharedParticipantState[] {
    return [ ...(this.state?.participants || []) ].sort((a, b) => a.order - b.order);
  }

  get ownParticipants(): SharedParticipantState[] {
    const player = this.playerToken.toLowerCase();
    return this.visibleParticipants.filter(p => (p.ownerName || "").toLowerCase() === player);
  }

  get unclaimedParticipants(): SharedParticipantState[] {
    return this.visibleParticipants.filter(p => p.claimable === true && !p.ownerName);
  }

  get primaryCharacter(): SharedParticipantState | null {
    return this.ownParticipants.length > 0 ? this.ownParticipants[0] : null;
  }

  canControl(actor: SharedParticipantState): boolean {
    const player = this.playerToken.toLowerCase();
    return (actor.ownerName || "").toLowerCase() === player;
  }

  getVisibleInitiative(actor: SharedParticipantState): string {
    if (!this.canControl(actor)) {
      return "-";
    }
    return String(actor.initiativeScore ?? "-");
  }

  getInterruptActions() {
    return this.interruptActions;
  }

  getLogTextClass(text: string): string {
    return getLogTextClass(text);
  }

  getLogDisplayText(entry: SharedLogEntry, index: number): string {
    return this.activeLogDecodeText.get(index) || entry.text;
  }

  formatLogText(text: string): string {
    return formatLogText(text);
  }

  toggleDeclaredActionCategory(categoryId: DeclaredActionCategoryId) {
    this.expandedDeclaredActionCategory = this.expandedDeclaredActionCategory === categoryId ? null : categoryId;
  }

  isDeclaredActionCategoryOpen(categoryId: DeclaredActionCategoryId): boolean {
    return this.expandedDeclaredActionCategory === categoryId;
  }

  toggleDeclaredActionDetails(event: Event, action: DeclaredActionItem) {
    event.preventDefault();
    event.stopPropagation();
    this.expandedDeclaredActionDetailKey =
      this.expandedDeclaredActionDetailKey === action.name ? null : action.name;
  }

  isDeclaredActionDetailsOpen(action: DeclaredActionItem): boolean {
    return this.expandedDeclaredActionDetailKey === action.name;
  }

  getDeclaredActionDetails(action: DeclaredActionItem): string {
    return DECLARED_ACTION_DESCRIPTIONS[action.name] || "No details available yet.";
  }

  isDeclaredActionSelected(action: DeclaredActionItem): boolean {
    return DeclaredActionEngine.isDeclaredActionSelected(this.declaredActionSelection, action);
  }

  canUseDeclaredAction(action: DeclaredActionItem): boolean {
    const isCyberdeckAct = CYBERDECK_REQUIRED_ACTIONS.has(action.name);
    const isPhysicalAct = !ALL_MATRIX_ACTION_NAMES.has(action.name);
    if (isCyberdeckAct && (!this.primaryCharacter?.isMatrix || !this.primaryCharacter?.jackedIn)) {
      return false;
    }
    if (isPhysicalAct && this.primaryCharacter?.isVRCatatonic) {
      return false;
    }
    return DeclaredActionEngine.canUseDeclaredAction(this.declaredActionSelection, action);
  }

  getDeclaredActionDisabledReason(action: DeclaredActionItem): string {
    const isCyberdeckAct = CYBERDECK_REQUIRED_ACTIONS.has(action.name);
    const isPhysicalAct = !ALL_MATRIX_ACTION_NAMES.has(action.name);
    if (isCyberdeckAct && !this.primaryCharacter?.isMatrix) {
      return "Requires a cyberdeck.";
    }
    if (isCyberdeckAct && this.primaryCharacter?.isMatrix && !this.primaryCharacter?.jackedIn) {
      return "Must be jacked in to use this action.";
    }
    if (isPhysicalAct && this.primaryCharacter?.isVRCatatonic) {
      return "Cannot take physical actions while in VR.";
    }
    if (!this.canUseDeclaredAction(action) && !this.isDeclaredActionSelected(action)) {
      return "Not available with current action economy.";
    }
    return "";
  }

  toggleDeclaredAction(action: DeclaredActionItem) {
    if (!this.canUseDeclaredAction(action)) {
      return;
    }
    this.declaredActionSelection = DeclaredActionEngine.toggleDeclaredAction(this.declaredActionSelection, action);
  }

  getDeclaredActionValidationMessage(): string {
    return DeclaredActionEngine.getValidationResult(this.declaredActionSelection).message;
  }

  isDeclaredActionSelectionValid(): boolean {
    return DeclaredActionEngine.getValidationResult(this.declaredActionSelection).valid;
  }

  getFreeUsageText(): string {
    return `${this.declaredActionSelection.free ? 1 : 0}/1`;
  }

  getSimpleUsageText(): string {
    return `${this.declaredActionSelection.simple.length}/2`;
  }

  getComplexUsageText(): string {
    return `${this.declaredActionSelection.complex ? 1 : 0}/1`;
  }

  private buildDeclaredActionLog(): string {
    return DeclaredActionEngine.buildDeclaredActionLog(this.declaredActionSelection) ?? "Act";
  }

  private clampInitiativeRoll(value: number, initiativeDice: number | undefined): number {
    return clampInitiativeRoll(value, initiativeDice);
  }

  private getInitiativeRollMax(initiativeDice: number | undefined): number {
    return getInitiativeRollMax(initiativeDice);
  }

  toggleNotifyMute(): void {
    this.notifyMuted = !this.notifyMuted;
    localStorage.setItem('bt.playerNotifyMuted.v1', String(this.notifyMuted));
  }

  private triggerRollNudge(): void {
    this.rollPromptNudge = false;
    if (this.nudgeTimeout !== null) {
      window.clearTimeout(this.nudgeTimeout);
      this.nudgeTimeout = null;
    }
    setTimeout(() => {
      this.rollPromptNudge = true;
      this.nudgeTimeout = window.setTimeout(() => {
        this.rollPromptNudge = false;
        this.nudgeTimeout = null;
      }, 1500);
    }, 0);
    this.playNudgeChime();
  }

  private playNudgeChime(): void {
    if (this.notifyMuted) return;
    try {
      if (!this.audioCtx) {
        this.audioCtx = new AudioContext();
      }
      const ctx = this.audioCtx;
      const now = ctx.currentTime;
      const playNote = (freq: number, start: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.3, start + 0.01);
        gain.gain.linearRampToValueAtTime(0, start + duration);
        osc.start(start);
        osc.stop(start + duration);
      };
      playNote(880, now, 0.12);
      playNote(1320, now + 0.13, 0.18);
    } catch {
      // audio unavailable — non-critical
    }
  }

  private scrollLogToBottom() {
    const el = this.logListContainer?.nativeElement;
    if (!el) {
      return;
    }
    el.scrollTop = el.scrollHeight;
  }

  isLogEntryNew(index: number): boolean {
    return this.flashedLogIndex === index;
  }

  private flashLogEntry(index: number) {
    this.flashedLogIndex = index;
    if (this.clearLogFlashTimeout !== null) {
      window.clearTimeout(this.clearLogFlashTimeout);
    }
    this.clearLogFlashTimeout = window.setTimeout(() => {
      this.flashedLogIndex = -1;
      this.clearLogFlashTimeout = null;
    }, 1500);
  }

  private startLogDecode(index: number, finalText: string) {
    const existingTimer = this.activeLogDecodeTimers.get(index);
    if (existingTimer !== undefined) {
      window.clearInterval(existingTimer);
      this.activeLogDecodeTimers.delete(index);
    }
    const decodeDuration = Math.min(1200, Math.max(420, finalText.length * 28));
    const startTime = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / decodeDuration);
      const revealedChars = Math.floor(finalText.length * progress);
      this.activeLogDecodeText.set(index, this.buildDecodeFrame(finalText, revealedChars));
      if (progress >= 1) {
        window.clearInterval(timer);
        this.activeLogDecodeTimers.delete(index);
        this.activeLogDecodeText.delete(index);
      }
    }, 36);
    this.activeLogDecodeTimers.set(index, timer);
  }

  private buildDecodeFrame(finalText: string, revealedChars: number): string {
    return buildDecodeFrame(finalText, revealedChars);
  }

  private randomMatrixChar(): string {
    return randomMatrixChar();
  }

  private clearLogDecodeAnimations() {
    for (const timer of this.activeLogDecodeTimers.values()) {
      window.clearInterval(timer);
    }
    this.activeLogDecodeTimers.clear();
    this.activeLogDecodeText.clear();
  }

  private applyIncomingState(next: SharedCombatState | null) {
    const started = Boolean(next?.started);
    if (this.lastKnownCombatStarted && !started) {
      this.promptRoll = false;
      this.manualRoll = "";
      this.closeActPlanner();
      if (!this.explicitCombatEndedNotice) {
        this.info = "Combat turn complete. Waiting for GM to start the next combat turn.";
      }
    }
    if (started) {
      this.explicitCombatEndedNotice = false;
      if (this.info === "Combat turn complete. Waiting for GM to start the next combat turn." || this.info === "GM ended combat.") {
        this.info = "";
      }
      // Combat is now active; any pending pre-combat full reroll is moot —
      // the GM will send request_rolls if needed.
      if (this.pendingFullReroll > 0) {
        this.pendingFullReroll = 0;
        this.manualFullReroll = "";
      }
    }
    const isFirstState = this.state === null;
    this.state = next;
    this.lastKnownCombatStarted = started;
    // Restore deck fields from server state (survives reconnect/claim).
    const pc = this.primaryCharacter;
    if (pc?.isMatrix) {
      if (pc.dataProcessing != null) this.dataProcessing = pc.dataProcessing;
      if (pc.attack != null) this.attack = pc.attack;
      if (pc.sleaze != null) this.sleaze = pc.sleaze;
      if (pc.firewall != null) this.firewall = pc.firewall;
      if (pc.deviceRating != null) this.deviceRating = pc.deviceRating;
      if (pc.vrMode && pc.vrMode !== 'none') this.vrMode = pc.vrMode;
      // On first state load (reconnect/claim), restore panel + jack-in state.
      if (isFirstState) {
        this.deckConfigExpanded = true;
        // jackedIn is only true server-side for Cold/Hot Sim; AR leaves it false.
        // Show Phase 2 if truly jacked in (VR modes), Phase 1 (Jack In prompt) otherwise.
        this.deckJackedIn = pc.jackedIn === true;
      }
    }
  }
}
