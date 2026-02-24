import { AfterViewChecked, Component, ElementRef, OnDestroy, OnInit, TemplateRef, ViewChild } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { SessionSyncService, SharedCombatState, SharedLogEntry, SharedParticipantState } from "app/services/session-sync.service";
import { NgbModal, NgbModalModule, NgbModalRef } from "@ng-bootstrap/ng-bootstrap";
import { DECLARED_ACTIONS, DECLARED_ACTION_DESCRIPTIONS, DeclaredActionCategoryId, DeclaredActionItem } from "app/shared/declared-actions";

interface DeclaredActionSelection {
  free: string | null;
  simple: string[];
  complex: string | null;
}

@Component({
  standalone: true,
  selector: "app-player-view",
  imports: [ CommonModule, FormsModule, NgbModalModule ],
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
  intuition = 1;
  overflowHealth = 4;
  physicalHealth = 10;
  stunHealth = 10;
  manualRoll = "";
  connected = false;
  error = "";
  state: SharedCombatState | null = null;
  log: SharedLogEntry[] = [];
  promptRoll = false;
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
  private pendingLogScroll = false;
  private flashedLogIndex = -1;
  private clearLogFlashTimeout: number | null = null;
  
  private readonly interruptActions = [
    { key: "block", label: "Block" },
    { key: "parry", label: "Parry" },
    { key: "dodge", label: "Dodge" },
    { key: "hitTheDirt", label: "Hit The Dirt" },
    { key: "intercept", label: "Intercept" },
    { key: "fullDefense", label: "Full Defense" }
  ];

  constructor(private session: SessionSyncService, private modalService: NgbModal) {}

  ngOnInit() {
    this.playerToken = `pl-${Math.random().toString(36).slice(2, 10)}`;
    const params = new URLSearchParams(window.location.search);
    const room = params.get("room");
    if (room) {
      this.room = room.toUpperCase();
    }
  }

  ngOnDestroy() {
    if (this.clearLogFlashTimeout !== null) {
      window.clearTimeout(this.clearLogFlashTimeout);
      this.clearLogFlashTimeout = null;
    }
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
      this.state = state;
      this.log = log || [];
      this.pendingLogScroll = true;
      this.session.onState((next) => {
        this.state = next;
      });
      this.session.onLog((entry) => {
        this.log = [ ...this.log, entry ];
        this.pendingLogScroll = true;
        this.flashLogEntry(this.log.length - 1);
      });
      this.session.onCommand((command) => {
        if (command.type === "request_rolls") {
          this.promptRoll = true;
        } else if (command.type === "clear_roll_prompt") {
          this.promptRoll = false;
        }
      });
      this.session.onSessionClosed(() => {
        this.connected = false;
        this.state = null;
        this.promptRoll = false;
        this.error = "Session was closed by GM.";
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
        stunHealth: this.stunHealth
      }
    });
    this.info = "Create character request sent.";
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
    if (!actor || Number.isNaN(value) || value < 0) {
      return;
    }
    this.session.sendCommand({
      type: "roll_submission",
      player: this.playerToken,
      payload: {
        participantId: actor.id,
        roll: value
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
    let roll = 0;
    for (let i = 0; i < diceCount; i++) {
      roll += Math.floor(Math.random() * 6) + 1;
    }
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

  submitActPlanner() {
    if (!this.actModalParticipant || !this.isDeclaredActionSelectionValid()) {
      return;
    }
    this.session.sendCommand({
      type: "act",
      player: this.playerToken,
      payload: {
        participantId: this.actModalParticipant.id,
        declaredAction: this.buildDeclaredActionLog()
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
    if (/Free:|Simple:|Complex:|Interrupt|Act/i.test(text)) {
      return "log-text-action";
    }
    if (/roll/i.test(text)) {
      return "log-text-roll";
    }
    return "log-text-system";
  }

  formatLogText(text: string): string {
    let formatted = this.escapeHtml(text);
    const rollPattern = /(initiative roll:\s*)(-?\d+)/i;
    if (rollPattern.test(formatted)) {
      return formatted.replace(rollPattern, `$1<span class="log-keyword-roll">$2</span>`);
    }

    const interruptPattern = /^(Interrupt\s+)(.+)$/i;
    if (interruptPattern.test(formatted)) {
      return formatted.replace(interruptPattern, `$1<span class="log-keyword-action">$2</span>`);
    }

    const categoryPattern = /(Free|Simple|Complex):\s*([^|]+)/gi;
    if (categoryPattern.test(formatted)) {
      return formatted.replace(categoryPattern, (_match, label: string, actions: string) => {
        const highlightedActions = actions
          .split(",")
          .map((action: string) => action.trim())
          .filter((action: string) => action.length > 0)
          .map((action: string) => `<span class="log-keyword-action">${action}</span>`)
          .join(", ");
        return `${label}: ${highlightedActions}`;
      });
    }
    formatted = formatted.replace(/(healed\s+Physical\s+)(\d+)/gi, `$1<span class="log-keyword-heal">$2</span>`);
    formatted = formatted.replace(/(healed\s+Stun\s+)(\d+)/gi, `$1<span class="log-keyword-heal">$2</span>`);
    formatted = formatted.replace(/(Physical\s+)(\d+)/gi, `$1<span class="log-keyword-physical">$2</span>`);
    formatted = formatted.replace(/(Stun\s+)(\d+)/gi, `$1<span class="log-keyword-stun">$2</span>`);
    return formatted;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
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
    if (action.economy === "free") {
      return this.declaredActionSelection.free === action.name;
    }
    if (action.economy === "simple") {
      return this.declaredActionSelection.simple.includes(action.name);
    }
    return this.declaredActionSelection.complex === action.name;
  }

  canUseDeclaredAction(action: DeclaredActionItem): boolean {
    if (this.isDeclaredActionSelected(action)) {
      return true;
    }
    if (action.economy === "free") {
      return true;
    }
    if (action.economy === "simple") {
      return this.declaredActionSelection.complex === null && this.declaredActionSelection.simple.length < 2;
    }
    return this.declaredActionSelection.simple.length === 0 && this.declaredActionSelection.complex === null;
  }

  toggleDeclaredAction(action: DeclaredActionItem) {
    if (!this.canUseDeclaredAction(action)) {
      return;
    }
    if (action.economy === "free") {
      this.declaredActionSelection.free = this.declaredActionSelection.free === action.name ? null : action.name;
      return;
    }
    if (action.economy === "simple") {
      if (this.declaredActionSelection.simple.includes(action.name)) {
        this.declaredActionSelection.simple = this.declaredActionSelection.simple.filter(a => a !== action.name);
      } else {
        this.declaredActionSelection.simple = [ ...this.declaredActionSelection.simple, action.name ];
      }
      return;
    }
    this.declaredActionSelection.complex = this.declaredActionSelection.complex === action.name ? null : action.name;
    if (this.declaredActionSelection.complex) {
      this.declaredActionSelection.simple = [];
    }
  }

  getDeclaredActionValidationMessage(): string {
    if (!this.declaredActionSelection.free && this.declaredActionSelection.simple.length === 0 && !this.declaredActionSelection.complex) {
      return "Select at least one action.";
    }
    return "Valid action set.";
  }

  isDeclaredActionSelectionValid(): boolean {
    return this.getDeclaredActionValidationMessage() === "Valid action set.";
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
    const parts: string[] = [];
    if (this.declaredActionSelection.free) {
      parts.push(`Free: ${this.declaredActionSelection.free}`);
    }
    if (this.declaredActionSelection.simple.length > 0) {
      parts.push(`Simple: ${this.declaredActionSelection.simple.join(", ")}`);
    }
    if (this.declaredActionSelection.complex) {
      parts.push(`Complex: ${this.declaredActionSelection.complex}`);
    }
    return parts.length > 0 ? parts.join(" | ") : "Act";
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
}
