import { AfterViewChecked, Component, OnInit, OnDestroy, ChangeDetectorRef, TemplateRef, ViewChild, ElementRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { NgbNavModule, NgbDropdownModule, NgbModal, NgbModalRef } from "@ng-bootstrap/ng-bootstrap";
import { Undoable, UndoHandler } from "Common";
import { CombatManager, StatusEnum, BTTime, IParticipant } from "Combat";
import { Participant } from "Combat/Participants/Participant";
import { LogHandler } from "Logging";
import { Action } from "Interfaces/Action";
import { NgxSliderModule } from '@angular-slider/ngx-slider';
import { FormsModule } from '@angular/forms';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import ActionHandler from "Combat/ActionHandler";
import { ConditionMonitorComponent } from "app/condition-monitor/condition-monitor.component";
import { ConfirmationDialogService } from 'app/confirmation-dialog/confirmation-dialog.service';
import { SessionCommand, SessionSyncService, SharedCombatState, SharedLogEntry, SharedParticipantState } from "app/services/session-sync.service";
import { DECLARED_ACTIONS, DECLARED_ACTION_DESCRIPTIONS, DeclaredActionCategoryId, DeclaredActionItem } from "app/shared/declared-actions";

interface DeclaredActionSelection {
  free: string | null;
  simple: string[];
  complex: string | null;
}

@Component({
  standalone: true,
  selector: "app-battle-tracker",
  templateUrl: "./battle-tracker.component.html",
  styleUrls: ["./battle-tracker.component.css"],
  imports: [
    CommonModule,
    NgxSliderModule,
    NgbNavModule,
    NgbDropdownModule,
    FormsModule,
    DragDropModule,
    ConditionMonitorComponent
  ]
})
export class BattleTrackerComponent extends Undoable implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild("gmLogListContainer") gmLogListContainer?: ElementRef<HTMLElement>;
  combatManager = CombatManager
  indexToSelect = -1;
  logHandler = LogHandler;
  changeDetector: ChangeDetectorRef;
  actionHandler = ActionHandler
  expandedActionKey: string | null = null;
  expandedDeclaredActionCategory: DeclaredActionCategoryId | null = "free";
  expandedDeclaredActionDetailKey: string | null = null;
  private readonly declaredActionSelections = new Map<IParticipant, DeclaredActionSelection>();
  private actModalRef: NgbModalRef | null = null;
  actModalParticipant: IParticipant | null = null;
  readonly declaredActions = DECLARED_ACTIONS;
  private readonly actionLabels: Record<string, string> = {
    fullDefense: "Full Defense",
    block: "Block",
    intercept: "Intercept",
    hitTheDirt: "Hit the Dirt",
    dodge: "Dodge",
    parry: "Parry"
  };
  private readonly actionDescriptions: Record<string, string> = {
    block: "Interrupt defense vs melee. Add Unarmed Combat to your defense test once for this attack only (not for the whole Combat Turn).",
    dodge: "Interrupt defense. Add Gymnastics to your defense test once for this attack only (not for the whole Combat Turn).",
    hitTheDirt: "If you've already used your Free Action, drop prone under suppressive fire without making the Reaction + Edge test. You will be prone on your next Action Phase and must use Stand Up to get up.",
    intercept: "Interrupt to attack a target moving past you or breaking from melee (within 1 + Reach meters). You must have enough Initiative left this Action Phase to do it.",
    parry: "Interrupt defense vs melee. Add your relevant melee weapon skill to your defense test once for this attack only; relevant bonus dice (such as weapon focus dice) can apply.",
    fullDefense: "Interrupt stance for the rest of the Combat Turn. Add Willpower to all defense tests this turn. Can be taken before your Action Phase if not surprised, and it stacks with other interrupt actions."
  };
  
  private readonly simpleAttackActions = new Set<string>([
    "Quick Draw",
    "Fire Bow",
    "Fire Semi-Auto, Single-Shot, Burst Fire, or Full-Auto",
    "Throw Weapon",
    "Reckless Spellcasting"
  ]);
  private readonly callShotCompatibleActions = new Set<string>([
    "Fire Bow",
    "Fire Semi-Auto, Single-Shot, Burst Fire, or Full-Auto",
    "Throw Weapon",
    "Melee Attack",
    "Cast Spell",
    "Reckless Spellcasting",
    "Quick Draw",
    "Fire Long Burst or Semi-Auto Burst",
    "Fire Full-Auto Weapon",
    "Fire Mounted or Vehicle Weapon",
    "Load and Fire Bow"
  ]);
  private readonly multipleAttackCompatibleActions = new Set<string>([
    "Fire Semi-Auto, Single-Shot, Burst Fire, or Full-Auto",
    "Throw Weapon",
    "Melee Attack",
    "Cast Spell",
    "Reckless Spellcasting",
    "Quick Draw",
    "Fire Long Burst or Semi-Auto Burst",
    "Fire Full-Auto Weapon",
    "Fire Mounted or Vehicle Weapon",
    "Fire Bow",
    "Load and Fire Bow"
  ]);
  private readonly actionConflicts: Record<string, string[]> = {
    "Quick Draw": [ "Ready Weapon", "Fire Bow", "Fire Semi-Auto, Single-Shot, Burst Fire, or Full-Auto", "Throw Weapon" ],
    "Ready Weapon": [ "Quick Draw" ]
  };
  shareRoomCode = "";
  shareJoinCode = "";
  shareError = "";
  shareInfo = "";
  private isClosingSession = false;
  initiativePrepActive = false;
  sharedLogEntries: SharedLogEntry[] = [];
  private pendingLogScroll = false;
  private flashedSharedLogIndex = -1;
  private clearSharedLogFlashTimeout: number | null = null;
  private readonly participantIds = new Map<IParticipant, string>();
  private readonly participantOwners = new Map<IParticipant, string>();
  private readonly participantClaimable = new Map<IParticipant, boolean>();
  private readonly participantEdgeRatings = new Map<IParticipant, number>();
  private readonly participantReactions = new Map<IParticipant, number>();
  private readonly participantIntuitions = new Map<IParticipant, number>();
  private readonly participantTieBreakers = new Map<IParticipant, number>();
  private readonly lastKnownDamage = new Map<string, { physical: number; stun: number }>();

  get currentBTTime(): BTTime {
    return new BTTime(this.combatManager.combatTurn, this.combatManager.initiativePass, this.combatManager.currentInitiative);
  }

  private _selectedActor: IParticipant | null = null

  get selectedActor(): IParticipant | null {
    return this._selectedActor;
  }

  set selectedActor(val: IParticipant | null) {
    this.Set("selectedActor", val);
  }

  constructor(
    private ref: ChangeDetectorRef,
    private confirmationDialog: ConfirmationDialogService,
    private modalService: NgbModal,
    private sessionSync: SessionSyncService
  ) {
    super();
    this.addParticipant();
    this.changeDetector = ref;
  }

  drop(event: CdkDragDrop<string[]>) {
    if (!this.combatManager.started) {
      moveItemInArray(this.combatManager.participants.items, event.previousIndex, event.currentIndex);
      for (let i = 0; i < this.combatManager.participants.count; i++) {
        this.combatManager.participants.items[i].sortOrder = i;
      }
    }
  }

  async ngOnInit() {
    UndoHandler.Initialize();
    UndoHandler.StartActions();
  }

  ngOnDestroy() {
    if (this.clearSharedLogFlashTimeout !== null) {
      window.clearTimeout(this.clearSharedLogFlashTimeout);
      this.clearSharedLogFlashTimeout = null;
    }
    this.sessionSync.disconnect();
  }

  ngAfterViewChecked() {
    if (!this.pendingLogScroll) {
      return;
    }
    this.pendingLogScroll = false;
    this.scrollLogToBottom();
  }

  selectActor(p: IParticipant) {
    this.selectedActor = p;
  }

  sort() {
    if (!this.combatManager.started) {
      this.combatManager.participants.sortBySortOrder();
    }
    else {
      this.combatManager.participants.sortByInitiative();
      this.combatManager.participants.items.sort((a, b) => this.initiativeTieBreakComparator(a, b));
      this.enforceSingleCurrentActor();
    }
    this.syncSharedState();
  }

  async btnCreateShareSession_Click() {
    this.shareError = "";
    this.shareInfo = "";
    try {
      this.sessionSync.connect();
      const { room } = await this.sessionSync.createSession();
      this.shareRoomCode = room;
      this.shareJoinCode = room;
      this.sharedLogEntries = [];
      this.attachShareListeners();
      this.syncSharedState();
    } catch (err) {
      this.shareError = err instanceof Error ? err.message : "Unable to create share session.";
    }
  }

  async btnJoinShareSession_Click() {
    this.shareError = "";
    this.shareInfo = "";
    const room = this.shareJoinCode.trim().toUpperCase();
    if (!room) {
      this.shareError = "Enter a room code to join.";
      return;
    }
    try {
      this.sessionSync.connect();
      const { state, log } = await this.sessionSync.joinAsGm(room);
      this.shareRoomCode = room;
      this.sharedLogEntries = log || [];
      this.pendingLogScroll = true;
      this.attachShareListeners();
      this.restoreFromSharedState(state);
      this.shareInfo = `Joined session ${room}.`;
    } catch (err) {
      this.shareError = err instanceof Error ? err.message : "Unable to join share session.";
    }
  }

  get shareUrl(): string {
    if (!this.shareRoomCode) {
      return "";
    }
    const base = window.location.origin + window.location.pathname;
    return `${base}?mode=player&room=${this.shareRoomCode}`;
  }

  async btnCopyRoomCode_Click() {
    if (!this.shareRoomCode) {
      return;
    }
    try {
      await navigator.clipboard.writeText(this.shareRoomCode);
      this.shareInfo = "Copied room code.";
    } catch {
      this.shareError = "Unable to copy room code.";
    }
  }

  async btnCopyShareUrl_Click() {
    if (!this.shareUrl) {
      return;
    }
    try {
      await navigator.clipboard.writeText(this.shareUrl);
      this.shareInfo = "Copied player link.";
    } catch {
      this.shareError = "Unable to copy player link.";
    }
  }

  async btnCloseShareSession_Click() {
    this.shareError = "";
    this.shareInfo = "";
    if (!this.shareRoomCode) {
      return;
    }
    const room = this.shareRoomCode;
    this.isClosingSession = true;
    try {
      await this.sessionSync.closeSession(room);
      this.shareInfo = `Closed session ${room}.`;
    } catch (err) {
      this.shareError = err instanceof Error ? err.message : "Unable to close share session.";
    } finally {
      this.sessionSync.disconnect();
      this.shareRoomCode = "";
      this.shareJoinCode = "";
      this.sharedLogEntries = [];
      this.initiativePrepActive = false;
      this.isClosingSession = false;
    }
  }

  private attachShareListeners() {
    this.sessionSync.onCommand((command) => this.handleSessionCommand(command));
    this.sessionSync.onLog((entry) => {
      this.sharedLogEntries = [ ...this.sharedLogEntries, entry ];
      this.pendingLogScroll = true;
      this.flashSharedLogEntry(this.sharedLogEntries.length - 1);
      if (entry.actor !== "GM") {
        LogHandler.log(this.currentBTTime, `${entry.actor} ${entry.text}`);
      }
    });
    this.sessionSync.onSessionClosed(() => {
      if (this.isClosingSession) {
        return;
      }
      this.shareInfo = "Session was closed.";
      this.shareRoomCode = "";
      this.shareJoinCode = "";
      this.sharedLogEntries = [];
      this.initiativePrepActive = false;
      this.sessionSync.disconnect();
    });
  }

  isParticipantClaimable(p: IParticipant): boolean {
    return this.participantClaimable.get(p) === true;
  }

  btnToggleClaimable_Click(p: IParticipant) {
    const next = !this.isParticipantClaimable(p);
    this.participantClaimable.set(p, next);
    if (!next) {
      this.participantOwners.delete(p);
    }
    this.syncSharedState();
  }

  private handleSessionCommand(command: SessionCommand) {
    if (!command || !command.type) {
      return;
    }
    if (command.type === "register_character") {
      const payload = command.payload || {};
      const playerName = command.player || "";
      if (!playerName) {
        return;
      }
      const characterName = String(payload["characterName"] || playerName);
      const initiativeDice = Number(payload["initiativeDice"] || 1);
      const edgeRating = Number(payload["edgeRating"] || 0);
      const reaction = Number(payload["reaction"] || 0);
      const intuition = Number(payload["intuition"] || 0);
      const overflowHealth = Number(payload["overflowHealth"] || 4);
      const physicalHealth = Number(payload["physicalHealth"] || 10);
      const stunHealth = Number(payload["stunHealth"] || 10);
      this.upsertPlayerParticipant(
        playerName,
        characterName,
        initiativeDice,
        edgeRating,
        reaction,
        intuition,
        overflowHealth,
        physicalHealth,
        stunHealth
      );
      this.appendSharedLog("GM", `Registered ${characterName}`);
      this.sort();
      return;
    }
    if (command.type === "claim_character") {
      const playerName = command.player || "";
      const participantId = String(command.payload?.["participantId"] || "");
      if (!playerName || !participantId) {
        return;
      }
      const target = this.combatManager.participants.items.find(p => this.getParticipantId(p) === participantId);
      if (!target) {
        return;
      }
      if (this.participantClaimable.get(target) !== true) {
        return;
      }
      const existingOwner = this.participantOwners.get(target);
      if (existingOwner) {
        return;
      }
      this.participantOwners.set(target, playerName);
      this.appendSharedLog("GM", `Claimed ${target.name}`);
      this.sort();
      return;
    }
    if (command.type === "release_claims") {
      const playerName = command.player || "";
      if (!playerName) {
        return;
      }
      let changed = false;
      for (const participant of this.combatManager.participants.items) {
        if (this.participantOwners.get(participant) === playerName && this.participantClaimable.get(participant) === true) {
          this.participantOwners.delete(participant);
          changed = true;
        }
      }
      if (changed) {
        this.sort();
      }
      return;
    }
    if (command.type === "roll_submission") {
      const playerName = command.player;
      const participantId = String(command.payload?.["participantId"] || "");
      const roll = Number(command.payload?.["roll"] || 0);
      const target = this.findPlayerParticipant(playerName, participantId);
      if (!target) {
        return;
      }
      target.diceIni = Math.max(0, roll);
      this.appendSharedLog(target.name || "Player", `initiative roll: ${target.diceIni}`);
      if (this.initiativePrepActive) {
        this.updateInitiativePrepInfo();
      }
      this.sort();
      return;
    }
    if (command.type === "act") {
      const playerName = command.player;
      const participantId = String(command.payload?.["participantId"] || "");
      const declaredAction = String(command.payload?.["declaredAction"] || "Act");
      const target = this.findPlayerParticipant(playerName, participantId);
      if (!target || target.status !== StatusEnum.Active) {
        return;
      }
      this.performAct(target, declaredAction, target.name || "Player");
      return;
    }
    if (command.type === "delay") {
      const playerName = command.player;
      const participantId = String(command.payload?.["participantId"] || "");
      const target = this.findPlayerParticipant(playerName, participantId);
      if (!target || target.status !== StatusEnum.Active) {
        return;
      }
      this.btnDelay_Click(target);
      this.appendSharedLog(target.name || "Player", "Delay");
      return;
    }
    if (command.type === "interrupt") {
      const playerName = command.player;
      const participantId = String(command.payload?.["participantId"] || "");
      const actionKey = String(command.payload?.["actionKey"] || "");
      const target = this.findPlayerParticipant(playerName, participantId);
      if (!target || !actionKey) {
        return;
      }
      const action = this.actionHandler.coreInterrupts.find(a => a.key === actionKey);
      if (!action || !target.canUseAction(action)) {
        return;
      }
      this.btnAction_Click(target, action, target.name || "Player");
      return;
    }
  }

  private syncSharedState() {
    if (!this.shareRoomCode) {
      return;
    }
    this.recordDamageChanges();
    const sharedState: SharedCombatState = {
      round: this.combatManager.combatTurn,
      pass: this.combatManager.initiativePass,
      started: this.combatManager.started,
      passEnded: this.combatManager.passEnded,
      currentInitiative: this.combatManager.currentInitiative,
      participants: this.getSharedParticipants()
    };
    this.sessionSync.broadcastState(sharedState);
  }

  private getSharedParticipants(): SharedParticipantState[] {
    return this.combatManager.participants.items
      .filter(p => !p.ooc)
      .map((p, index) => ({
        id: this.getParticipantId(p),
        name: p.name || `Participant ${index + 1}`,
        order: index + 1,
        active: this.combatManager.currentActors.contains(p),
        initiativeScore: p.getCurrentInitiative(),
        playerControlled: this.participantOwners.has(p),
        claimable: this.participantClaimable.get(p) === true,
        ownerName: this.participantOwners.get(p),
        canAct: p.status === StatusEnum.Active,
        canDelay: p.status === StatusEnum.Active,
        canInterrupt: p.getCurrentInitiative() >= 1,
        initiativeDice: p.dices,
        pendingRoll: p.diceIni <= 0,
        edgeRating: this.getParticipantEdgeRating(p),
        reaction: this.getParticipantReaction(p),
        intuition: this.getParticipantIntuition(p)
      }));
  }

  private appendSharedLog(actor: string, text: string) {
    if (!this.shareRoomCode) {
      return;
    }
    this.sessionSync.appendLog({
      actor,
      text,
      timestamp: new Date().toISOString()
    });
  }

  private getParticipantId(participant: IParticipant): string {
    const existing = this.participantIds.get(participant);
    if (existing) {
      return existing;
    }
    const id = `p-${Math.random().toString(36).slice(2, 10)}`;
    this.participantIds.set(participant, id);
    return id;
  }

  private recordDamageChanges() {
    for (const participant of this.combatManager.participants.items) {
      const id = this.getParticipantId(participant);
      const currentPhysical = Math.max(0, Number(participant.physicalDamage || 0));
      const currentStun = Math.max(0, Number(participant.stunDamage || 0));
      const previous = this.lastKnownDamage.get(id);
      if (!previous) {
        this.lastKnownDamage.set(id, { physical: currentPhysical, stun: currentStun });
        continue;
      }

      const physicalDelta = currentPhysical - previous.physical;
      const stunDelta = currentStun - previous.stun;
      const damageParts: string[] = [];
      const healingParts: string[] = [];
      if (physicalDelta > 0) {
        damageParts.push(`Physical ${physicalDelta}`);
      } else if (physicalDelta < 0) {
        healingParts.push(`Physical ${Math.abs(physicalDelta)}`);
      }
      if (stunDelta > 0) {
        damageParts.push(`Stun ${stunDelta}`);
      } else if (stunDelta < 0) {
        healingParts.push(`Stun ${Math.abs(stunDelta)}`);
      }
      if (damageParts.length > 0) {
        this.appendSharedLog("GM", `${participant.name || "Participant"} took ${damageParts.join(", ")}`);
      }
      if (healingParts.length > 0) {
        this.appendSharedLog("GM", `${participant.name || "Participant"} healed ${healingParts.join(", ")}`);
      }

      this.lastKnownDamage.set(id, { physical: currentPhysical, stun: currentStun });
    }
  }

  private findPlayerParticipant(playerName: string, participantId: string): IParticipant | null {
    for (const participant of this.combatManager.participants.items) {
      if (this.getParticipantId(participant) === participantId && this.participantOwners.get(participant) === playerName) {
        return participant;
      }
    }
    return null;
  }

  private upsertPlayerParticipant(
    playerName: string,
    characterName: string,
    initiativeDice: number,
    edgeRating: number,
    reaction: number,
    intuition: number,
    overflowHealth: number,
    physicalHealth: number,
    stunHealth: number
  ) {
    let target: IParticipant | undefined;
    for (const participant of this.combatManager.participants.items) {
      if (this.participantOwners.get(participant) === playerName) {
        target = participant;
        break;
      }
    }
    if (!target) {
      target = new Participant();
      this.combatManager.addParticipant(target);
    }

    target.name = characterName;
    target.dices = Math.max(1, initiativeDice);
    const safeReaction = Math.max(0, Number(reaction || 0));
    const safeIntuition = Math.max(0, Number(intuition || 0));
    target.baseIni = safeReaction + safeIntuition;
    target.overflowHealth = Math.max(1, overflowHealth);
    target.physicalHealth = Math.max(1, physicalHealth);
    target.stunHealth = Math.max(1, stunHealth);
    this.participantOwners.set(target, playerName);
    this.participantClaimable.set(target, true);
    this.participantEdgeRatings.set(target, Math.max(0, Number(edgeRating || 0)));
    this.participantReactions.set(target, safeReaction);
    this.participantIntuitions.set(target, safeIntuition);
    if (!this.participantTieBreakers.has(target)) {
      this.participantTieBreakers.set(target, Math.random());
    }
    const id = this.getParticipantId(target);
    this.lastKnownDamage.set(id, {
      physical: Math.max(0, Number(target.physicalDamage || 0)),
      stun: Math.max(0, Number(target.stunDamage || 0))
    });
  }

  private restoreFromSharedState(state: SharedCombatState | null) {
    if (!state || !state.participants || state.participants.length === 0) {
      return;
    }

    this.declaredActionSelections.clear();
    this.participantIds.clear();
    this.participantOwners.clear();
    this.participantClaimable.clear();
    this.participantEdgeRatings.clear();
    this.participantReactions.clear();
    this.participantIntuitions.clear();
    this.participantTieBreakers.clear();
    this.lastKnownDamage.clear();

    this.combatManager.participants.clear(false);
    this.combatManager.currentActors.clear(false);
    this.combatManager.nextSortOrder = 0;

    const ordered = [ ...state.participants ].sort((a, b) => a.order - b.order);
    for (const shared of ordered) {
      const participant = new Participant();
      participant.name = shared.name;
      participant.dices = Math.max(1, Number(shared.initiativeDice || 1));
      participant.diceIni = shared.pendingRoll ? 0 : 0;
      const safeReaction = Math.max(0, Number(shared.reaction || 0));
      const safeIntuition = Math.max(0, Number(shared.intuition || 0));
      participant.baseIni = safeReaction + safeIntuition > 0
        ? safeReaction + safeIntuition
        : (shared.pendingRoll ? 6 : Math.max(0, Number(shared.initiativeScore || 0)));
      const sharedSortOrder = Math.max(0, Number(shared.order || 1) - 1);
      if (shared.ownerName) {
        this.participantOwners.set(participant, shared.ownerName);
      }
      this.participantClaimable.set(participant, shared.claimable === true);
      this.participantEdgeRatings.set(participant, Math.max(0, Number(shared.edgeRating || 0)));
      this.participantReactions.set(participant, safeReaction > 0 ? safeReaction : Math.max(0, Number(participant.baseIni || 0)));
      this.participantIntuitions.set(participant, safeIntuition);
      this.participantIds.set(participant, shared.id);
      this.combatManager.addParticipant(participant);
      participant.sortOrder = sharedSortOrder;
      this.lastKnownDamage.set(shared.id, {
        physical: Math.max(0, Number(participant.physicalDamage || 0)),
        stun: Math.max(0, Number(participant.stunDamage || 0))
      });
      if (shared.active) {
        participant.status = StatusEnum.Active;
        this.combatManager.currentActors.insert(participant, false);
      } else {
        participant.status = StatusEnum.Waiting;
      }
    }

    this.combatManager.combatTurn = Math.max(1, Number(state.round || 1));
    this.combatManager.initiativePass = Math.max(1, Number(state.pass || 1));
    this.combatManager.started = Boolean(state.started);
    this.combatManager.passEnded = Boolean(state.passEnded);
    this.combatManager.currentInitiative = Number(state.currentInitiative ?? this.combatManager.currentInitiative);
    this.combatManager.participants.sortBySortOrder();
  }

  /// Style Handler
  getParticipantStyles(p: IParticipant) {
    const styles = {
      acting: this.combatManager.currentActors.contains(p),
      ooc: p.ooc,
      delaying: p.status === StatusEnum.Delaying,
      waiting: p.status === StatusEnum.Waiting,
      noIni: p.diceIni === 0,
      negativeIni: p.getCurrentInitiative() <= 0 && this.combatManager.started,
      finished: p.status === StatusEnum.Finished,
      edged: p.edge,
      selected: p === this.selectedActor
    };

    return styles;
  }

  /// Button Handler
  btnAddParticipant_Click() {
    UndoHandler.StartActions();
    LogHandler.log(this.currentBTTime, "AddParticipant_Click");
    this.addParticipant()
  }

  btnEdge_Click(sender: IParticipant) {
    UndoHandler.StartActions();
    LogHandler.log(this.currentBTTime, sender.name + " Edge_Click");
    sender.seizeInitiative();
  }

  btnRollInitiative_Click(sender: IParticipant) {
    UndoHandler.StartActions();
    LogHandler.log(this.currentBTTime, sender.name + " RollInitiative_Click");
    sender.rollInitiative();
  }

  btnAct_Click(sender: IParticipant, actModalContent: TemplateRef<unknown>) {
    this.openActModal(sender, actModalContent);
  }

  btnDeclaredAct_Click(sender: IParticipant, declaredAction: DeclaredActionItem) {
    this.toggleDeclaredActionSelection(sender, declaredAction);
  }

  openActModal(sender: IParticipant, actModalContent: TemplateRef<unknown>) {
    this.actModalParticipant = sender;
    this.expandedDeclaredActionCategory = "free";
    this.expandedDeclaredActionDetailKey = null;
    if (!this.declaredActionSelections.has(sender)) {
      this.clearDeclaredActionSelection(sender);
    }
    this.actModalRef = this.modalService.open(actModalContent, { size: "lg", centered: true });
    this.actModalRef.result.finally(() => {
      this.actModalRef = null;
      this.actModalParticipant = null;
    });
  }

  closeActModal() {
    if (this.actModalRef) {
      this.actModalRef.dismiss();
    }
  }

  submitActModal() {
    if (!this.actModalParticipant || !this.isDeclaredActionSelectionValid(this.actModalParticipant)) {
      return;
    }
    const actor = this.actModalParticipant;
    this.performAct(actor, this.buildDeclaredActionLog(actor));
    this.clearDeclaredActionSelection(actor);
    if (this.actModalRef) {
      this.actModalRef.close();
    }
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
    const description = DECLARED_ACTION_DESCRIPTIONS[action.name] || "No details available yet.";
    const label = action.economy.charAt(0).toUpperCase() + action.economy.slice(1);
    return `${description}`;
  }

  getDeclaredActionStateText(sender: IParticipant): string {
    const selection = this.getDeclaredActionSelection(sender);
    const freeState = selection.free ? "1/1 Free" : "0/1 Free";
    const simpleState = `${selection.simple.length}/2 Simple`;
    const complexState = selection.complex ? "1/1 Complex" : "0/1 Complex";
    return `${freeState} | ${simpleState} | ${complexState}`;
  }

  isDeclaredActionSelected(sender: IParticipant, action: DeclaredActionItem): boolean {
    const selection = this.getDeclaredActionSelection(sender);
    if (action.economy === "free") {
      return selection.free === action.name;
    }
    if (action.economy === "simple") {
      return selection.simple.includes(action.name);
    }
    return selection.complex === action.name;
  }

  canUseDeclaredAction(sender: IParticipant, action: DeclaredActionItem): boolean {
    const selection = this.getDeclaredActionSelection(sender);
    if (this.isDeclaredActionSelected(sender, action)) {
      return true;
    }
    if (action.economy === "free") {
      if (this.hasConflictingSelectedAction(selection, action.name)) {
        return false;
      }
      return true;
    }
    if (action.economy === "simple") {
      if (this.simpleAttackActions.has(action.name) && this.getSimpleAttackCount(selection) >= 1) {
        return false;
      }
      if (this.hasConflictingSelectedAction(selection, action.name)) {
        return false;
      }
      return selection.complex === null && selection.simple.length < 2;
    }
    if (this.hasConflictingSelectedAction(selection, action.name)) {
      return false;
    }
    return selection.simple.length === 0 && selection.complex === null;
  }

  isDeclaredActionSelectionValid(sender: IParticipant): boolean {
    const selection = this.getDeclaredActionSelection(sender);
    return this.getDeclaredActionValidationMessage(sender) === "Valid action set. Ready to submit.";
  }

  getDeclaredActionValidationMessage(sender: IParticipant): string {
    const selection = this.getDeclaredActionSelection(sender);
    const selected = this.getSelectedActionNames(selection);
    if (!selection.free && selection.simple.length === 0 && !selection.complex) {
      return "Select at least one action to submit.";
    }
    if (selection.complex && selection.simple.length > 0) {
      return "Complex and Simple actions cannot be combined.";
    }
    if (this.getSimpleAttackCount(selection) > 1) {
      return "Only one Simple attack action can be selected per Action Phase.";
    }
    if (selected.has("Call a Shot") && !this.hasAny(selected, this.callShotCompatibleActions)) {
      return "Call a Shot requires a compatible attack action.";
    }
    if (selected.has("Multiple Attacks") && !this.hasAny(selected, this.multipleAttackCompatibleActions)) {
      return "Multiple Attacks requires a compatible attack action.";
    }
    if (selection.simple.length > 2) {
      return "You can select at most 2 Simple actions.";
    }
    return "Valid action set. Ready to submit.";
  }

  getSelectionStateClass(sender: IParticipant): "valid" | "invalid" {
    return this.isDeclaredActionSelectionValid(sender) ? "valid" : "invalid";
  }

  getFreeUsageText(sender: IParticipant): string {
    const selection = this.getDeclaredActionSelection(sender);
    return `${selection.free ? 1 : 0}/1`;
  }

  getSimpleUsageText(sender: IParticipant): string {
    const selection = this.getDeclaredActionSelection(sender);
    return `${selection.simple.length}/2`;
  }

  getComplexUsageText(sender: IParticipant): string {
    const selection = this.getDeclaredActionSelection(sender);
    return `${selection.complex ? 1 : 0}/1`;
  }

  getActionDisabledReason(sender: IParticipant, action: DeclaredActionItem): string {
    if (this.isDeclaredActionSelected(sender, action)) {
      return "Selected. Click again to deselect.";
    }
    if (this.canUseDeclaredAction(sender, action)) {
      return "Click to select.";
    }
    const selection = this.getDeclaredActionSelection(sender);
    if (action.economy === "simple" && selection.complex) {
      return "Cannot select Simple while a Complex action is selected.";
    }
    if (action.economy === "simple" && selection.simple.length >= 2) {
      return "Maximum of 2 Simple actions reached.";
    }
    if (action.economy === "simple" && this.simpleAttackActions.has(action.name) && this.getSimpleAttackCount(selection) >= 1) {
      return "Only one Simple attack action is allowed.";
    }
    if (action.economy === "complex" && selection.simple.length > 0) {
      return "Cannot select Complex while Simple actions are selected.";
    }
    if (action.economy === "complex" && selection.complex) {
      return "A Complex action is already selected.";
    }
    if (this.hasConflictingSelectedAction(selection, action.name)) {
      return "Conflicts with an already selected action.";
    }
    return "Not allowed by current action limits.";
  }

  private getSelectedActionNames(selection: DeclaredActionSelection): Set<string> {
    const selected = new Set<string>();
    if (selection.free) {
      selected.add(selection.free);
    }
    selection.simple.forEach(action => selected.add(action));
    if (selection.complex) {
      selected.add(selection.complex);
    }
    return selected;
  }

  private hasAny(selected: Set<string>, candidates: Set<string>): boolean {
    for (const action of selected) {
      if (candidates.has(action)) {
        return true;
      }
    }
    return false;
  }

  private getSimpleAttackCount(selection: DeclaredActionSelection): number {
    return selection.simple.filter(action => this.simpleAttackActions.has(action)).length;
  }

  private getConflictsForAction(actionName: string): string[] {
    return this.actionConflicts[actionName] || [];
  }

  private hasConflictingSelectedAction(selection: DeclaredActionSelection, actionName: string): boolean {
    const selected = this.getSelectedActionNames(selection);
    const conflicts = this.getConflictsForAction(actionName);
    if ([ ...selected ].some(a => conflicts.includes(a))) {
      return true;
    }
    return [ ...selected ].some(selectedAction =>
      this.getConflictsForAction(selectedAction).includes(actionName)
    );
  }

  private toggleDeclaredActionSelection(sender: IParticipant, action: DeclaredActionItem): void {
    if (!this.canUseDeclaredAction(sender, action)) {
      return;
    }
    const selection = this.getDeclaredActionSelection(sender);
    if (action.economy === "free") {
      selection.free = selection.free === action.name ? null : action.name;
      return;
    }
    if (action.economy === "simple") {
      if (selection.simple.includes(action.name)) {
        selection.simple = selection.simple.filter(a => a !== action.name);
      } else {
        selection.simple = [ ...selection.simple, action.name ];
      }
      return;
    }
    selection.complex = selection.complex === action.name ? null : action.name;
    if (selection.complex !== null) {
      selection.simple = [];
    }
  }

  private buildDeclaredActionLog(sender: IParticipant): string | null {
    const selection = this.getDeclaredActionSelection(sender);
    const parts: string[] = [];
    if (selection.free) {
      parts.push(`Free: ${selection.free}`);
    }
    if (selection.simple.length > 0) {
      parts.push(`Simple: ${selection.simple.join(", ")}`);
    }
    if (selection.complex) {
      parts.push(`Complex: ${selection.complex}`);
    }
    if (parts.length === 0) {
      return null;
    }
    return parts.join(" | ");
  }

  private getDeclaredActionSelection(sender: IParticipant): DeclaredActionSelection {
    const existing = this.declaredActionSelections.get(sender);
    if (existing) {
      return existing;
    }
    const created: DeclaredActionSelection = {
      free: null,
      simple: [],
      complex: null
    };
    this.declaredActionSelections.set(sender, created);
    return created;
  }

  private clearDeclaredActionSelection(sender: IParticipant): void {
    this.declaredActionSelections.set(sender, {
      free: null,
      simple: [],
      complex: null
    });
  }

  private performAct(sender: IParticipant, declaredAction: string | null = null, submitter?: string) {
    UndoHandler.StartActions();
    if (declaredAction) {
      LogHandler.log(this.currentBTTime, `${sender.name} Act_Click: ${declaredAction}`);
      if (submitter) {
        this.appendSharedLog(submitter, declaredAction);
      } else {
        this.appendSharedLog("GM", `${sender.name}: ${declaredAction}`);
      }
    } else {
      LogHandler.log(this.currentBTTime, sender.name + " Act_Click");
      if (submitter) {
        this.appendSharedLog(submitter, "Act");
      } else {
        this.appendSharedLog("GM", `${sender.name}: Act`);
      }
    }
    this.combatManager.act(sender);
    this.sort();
  }

  btnDelay_Click(sender: IParticipant) {
    UndoHandler.StartActions();
    LogHandler.log(this.currentBTTime, sender.name + " Delay_Click");
    sender.status = StatusEnum.Delaying;
    if (this.combatManager.currentActors.remove(sender)) {
      if (this.combatManager.currentActors.count === 0) {
        this.combatManager.goToNextActors();
      }
    }
    this.sort();
  }

  async btnStartRound_Click() {
    LogHandler.log(this.currentBTTime, "StartRound_Click");
    this.shareInfo = "";
    if (!this.hasPendingInitiativeRolls()) {
      this.beginCombatTurn();
      return;
    }
    this.initiativePrepActive = true;
    if (this.getPendingPlayerRollCount() > 0) {
      this.requestPlayerRolls();
    }
    this.updateInitiativePrepInfo();
  }

  btnNextPass_Click() {
    UndoHandler.StartActions();
    LogHandler.log(this.currentBTTime, "NextPass_Click");
    this.combatManager.nextIniPass();
    this.combatManager.goToNextActors();
    if (this.combatManager.initiativePass > 1) {
      this.appendSharedLog("GM", `Start Initiative Pass ${this.combatManager.initiativePass}`);
    }
    this.sort();
  }

  async btnDelete_Click(sender: IParticipant) {
    LogHandler.log(this.currentBTTime, sender.name + " Delete_Click");
    if (sender.name !== "") {
      const confirmationText = `Are you sure you want to remove ${sender.name}?`;
      const confirmed = await this.confirmationDialog.simpleConfirm(confirmationText);
      if (!confirmed) {
        LogHandler.log(this.currentBTTime, sender.name + " Delete_Cancel");
        return;
      }
    }
    LogHandler.log(this.currentBTTime, sender.name + " Delete_Confirm");
    UndoHandler.StartActions();
    this.declaredActionSelections.delete(sender);
    const participantId = this.participantIds.get(sender);
    if (participantId) {
      this.lastKnownDamage.delete(participantId);
    }
    this.participantIds.delete(sender);
    this.participantOwners.delete(sender);
    this.participantClaimable.delete(sender);
    this.participantEdgeRatings.delete(sender);
    this.participantReactions.delete(sender);
    this.participantIntuitions.delete(sender);
    this.participantTieBreakers.delete(sender);
    this.combatManager.removeParticipant(sender);
    this.syncSharedState();
  }

  btnDuplicate_Click(sender: IParticipant) {
    LogHandler.log(this.currentBTTime, sender.name + " Duplicate_Click");
    UndoHandler.StartActions();
    const existing = new Set(this.combatManager.participants.items);
    this.combatManager.copyParticipant(sender);
    const clone = this.combatManager.participants.items.find(p => !existing.has(p));
    if (clone) {
      this.participantClaimable.set(clone, this.participantClaimable.get(sender) === true);
      if (this.participantOwners.has(sender)) {
        this.participantOwners.set(clone, this.participantOwners.get(sender) || "");
      }
      this.participantEdgeRatings.set(clone, this.getParticipantEdgeRatingValue(sender));
      this.participantReactions.set(clone, this.getParticipantReactionValue(sender));
      this.participantIntuitions.set(clone, this.getParticipantIntuitionValue(sender));
      clone.baseIni = this.getParticipantBaseInitiative(clone);
      this.participantTieBreakers.set(clone, Math.random());
      const cloneId = this.getParticipantId(clone);
      this.lastKnownDamage.set(cloneId, {
        physical: Math.max(0, Number(clone.physicalDamage || 0)),
        stun: Math.max(0, Number(clone.stunDamage || 0))
      });
    }
    this.sort();
  }

  async btnReset_Click() {
    LogHandler.log(this.currentBTTime, "Reset_Click");
    const confirmationText = "Are you sure you want to end combat?";
    const confirmed = await this.confirmationDialog.simpleConfirm(confirmationText);
    if (!confirmed) {
      LogHandler.log(this.currentBTTime, "Reset_Cancel");
      return;
    }
    LogHandler.log(this.currentBTTime, "Reset_Confirm");
    UndoHandler.StartActions();
    this.declaredActionSelections.clear();
    this.combatManager.endCombat();
    this.initiativePrepActive = false;
    this.sort()
  }

  btnLeaveCombat_Click(sender: IParticipant) {
    LogHandler.log(this.currentBTTime, sender.name + " LeaveCombat_Click");
    UndoHandler.StartActions();
    sender.leaveCombat();
    if (this.combatManager.currentActors.contains(sender)) {
      // Remove sender from active Actors
      this.combatManager.act(sender);
    }
    this.sort();
  }

  btnEnterCombat_Click(sender: IParticipant) {
    LogHandler.log(this.currentBTTime, sender.name + " EnterCombat_Click");
    UndoHandler.StartActions();
    sender.enterCombat();
    this.sort();
  }

  btnAction_Click(p: IParticipant, action: Action, submitter?: string) {
    if (!p.canUseAction(action)) {
      return;
    }
    LogHandler.log(this.currentBTTime, p.name + " Action_Click: " + action.key);
    if (submitter) {
      this.appendSharedLog(submitter, `Interrupt ${this.getActionLabel(action)}`);
    } else {
      this.appendSharedLog("GM", `${p.name}: Interrupt ${this.getActionLabel(action)}`);
    }
    UndoHandler.StartActions();
    p.doAction(action);
    this.syncSharedState();
  }

  getActionLabel(action: Action): string {
    return this.actionLabels[action.key] || action.key;
  }

  getActionTooltip(action: Action): string {
    const description = this.actionDescriptions[action.key] || "No description available.";
    return `${description} Initiative cost: ${action.iniMod}`;
  }

  getActionDetails(action: Action): string {
    const description = this.actionDescriptions[action.key] || "No description available.";
    return `${description} Initiative cost: ${action.iniMod}.`;
  }

  getVisibleLogEntries() {
    return [ ...this.logHandler.logbook ].reverse();
  }

  getVisibleSharedLogEntries(): SharedLogEntry[] {
    return [ ...this.sharedLogEntries ];
  }

  getLogTextClass(text: string): string {
    if (/Act_Click:|Action_Click:|Interrupt|Free:|Simple:|Complex:/i.test(text)) {
      return "log-text-action";
    }
    if (/RollInitiative_Click|submitted initiative roll|roll/i.test(text)) {
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

  toggleActionDetails(event: Event, action: Action): void {
    event.preventDefault();
    event.stopPropagation();
    this.expandedActionKey = this.expandedActionKey === action.key ? null : action.key;
  }

  isActionDetailsOpen(action: Action): boolean {
    return this.expandedActionKey === action.key;
  }

  isUndoDisabled() {
    return !UndoHandler.hasPast();
  }

  isRedoDisabled() {
    return !UndoHandler.hasFuture();
  }

  btnUndo_Click() {
    LogHandler.log(this.currentBTTime, "Undo_Click");
    UndoHandler.Undo();
  }

  btnRedo_Click() {
    LogHandler.log(this.currentBTTime, "Redo_Click");
    UndoHandler.Redo();
  }

  inpName_KeyDown(e: KeyboardEvent) {
    const keyCode = e.code

    if (keyCode === "Tab" && !e.shiftKey) // Tab key
    {
      e.preventDefault();

      const row = this.closestByClass(e.target as HTMLElement, "participant");
      if (!row) return;

      const nextRow = row.nextElementSibling as HTMLElement;
      if (nextRow) {
        const field = nextRow.querySelector("input") as HTMLInputElement;
        if (field) {
          field.select();
          nextRow.click();
          return;
        }
      }

      LogHandler.log(this.currentBTTime, "TabAddParticipant");
      UndoHandler.StartActions();
      this.addParticipant();

      const index = row.getAttribute("data-indexnr");
      this.indexToSelect = index !== null ? 1 + Number(index) : -1;
    }
    else if (keyCode === "Tab" && e.shiftKey) // Shift + Tab
    {
      e.preventDefault();

      const row = this.closestByClass(e.target as HTMLElement, "participant");
      if (!row) return;

      const prevRow = row.previousElementSibling as HTMLElement;
      if (prevRow) {
        const field = prevRow.querySelector("input") as HTMLInputElement;
        if (field) {
          field.select();
          prevRow.click();
          return;
        }
      }
    }
  }

  inpDiceIni_KeyDown(e: KeyboardEvent) {
    const keyCode = e.code;

    if (keyCode === "Tab" && !e.shiftKey) {
      e.preventDefault();
      const row = this.closestByClass(e.target as HTMLElement, "participant");
      const nextRow = row?.nextElementSibling as HTMLElement | null;
      if (nextRow != null) {
        const field: HTMLInputElement = nextRow.querySelectorAll(".inpDiceIni")[0] as HTMLInputElement;
        if (field) {
          field.select();
          nextRow.click()
          return;
        }
      }
    } else if (keyCode === "Tab" && e.shiftKey) {
      e.preventDefault();
      const row = this.closestByClass(e.target as HTMLElement, "participant");
      const prevRow = row?.previousElementSibling as HTMLElement | null;
      if (prevRow != null) {
        const field: HTMLInputElement = prevRow.querySelectorAll(".inpDiceIni")[0] as HTMLInputElement;
        if (field) {
          field.select();
          prevRow.click()
          return;
        }
      }
    }
  }

  inpBaseIni_KeyDown(e: KeyboardEvent) {
    const keyCode = e.code;
    const shift = e.shiftKey;

    if (keyCode === "Tab" && !shift) {
      e.preventDefault();
      const row = this.closestByClass(e.target as HTMLElement, "participant");
      const nextRow = row?.nextElementSibling as HTMLElement | null;
      if (nextRow != null) {
        const field: HTMLInputElement = nextRow.querySelectorAll(".inpBaseIni")[0] as HTMLInputElement;
        if (field) {
          field.select();
          nextRow.click()
          return;
        }
      }
    } else if (keyCode === "Tab" && shift) {
      e.preventDefault();
      const row = this.closestByClass(e.target as HTMLElement, "participant");
      const prevRow = row?.previousElementSibling as HTMLElement | null;
      if (prevRow != null) {
        const field: HTMLInputElement = prevRow.querySelectorAll(".inpBaseIni")[0] as HTMLInputElement;
        if (field) {
          field.select();
          prevRow.click();
          return;
        }
      }
    }
  }

  ngReady() {
    const row = document.getElementById("participant" + this.indexToSelect);
    if (row) {
      const field: HTMLInputElement = row.querySelectorAll("input")[0] as HTMLInputElement;
      if (field) {
        this.indexToSelect = -1;
        field.select();
        row.click();
      }
      this.changeDetector.detectChanges();
    }
  }

  // Focus Handler
  inp_Focus(e: Event) {
    if (e.target instanceof HTMLInputElement)
      e.target.select();
  }

  iniChange(e: Event, p: IParticipant) {
    if (p.diceIni < 0) {
      e.preventDefault();
      p.diceIni = 0;
      const target = e.target as HTMLInputElement
      target.value = '0';
    }
  }

  onChange(e: Event) {
    console.log(e);
  }

  onParticipantUpdated() {
    this.syncSharedState();
  }

  getParticipantEdgeRatingValue(p: IParticipant): number {
    return this.getParticipantEdgeRating(p);
  }

  getParticipantReactionValue(p: IParticipant): number {
    return this.getParticipantReaction(p);
  }

  getParticipantIntuitionValue(p: IParticipant): number {
    return this.getParticipantIntuition(p);
  }

  getParticipantBaseInitiative(p: IParticipant): number {
    return Math.max(0, this.getParticipantReaction(p) + this.getParticipantIntuition(p));
  }

  onParticipantEdgeRatingChanged(p: IParticipant, value: number) {
    this.participantEdgeRatings.set(p, Math.max(0, Number(value || 0)));
    this.syncSharedState();
  }

  onParticipantReactionChanged(p: IParticipant, value: number) {
    this.participantReactions.set(p, Math.max(0, Number(value || 0)));
    p.baseIni = this.getParticipantBaseInitiative(p);
    this.syncSharedState();
  }

  onParticipantIntuitionChanged(p: IParticipant, value: number) {
    this.participantIntuitions.set(p, Math.max(0, Number(value || 0)));
    p.baseIni = this.getParticipantBaseInitiative(p);
    this.syncSharedState();
  }

  onParticipantDamageChanged() {
    this.syncSharedState();
  }

  addParticipant(selectNewParticipant = true) {
    const p = new Participant();
    this.combatManager.addParticipant(p);
    this.participantClaimable.set(p, false);
    this.participantEdgeRatings.set(p, 0);
    this.participantReactions.set(p, 3);
    this.participantIntuitions.set(p, 3);
    p.baseIni = this.getParticipantBaseInitiative(p);
    this.participantTieBreakers.set(p, Math.random());
    const id = this.getParticipantId(p);
    this.lastKnownDamage.set(id, {
      physical: Math.max(0, Number(p.physicalDamage || 0)),
      stun: Math.max(0, Number(p.stunDamage || 0))
    });
    if (selectNewParticipant) {
      this.selectActor(p);
    }
    this.syncSharedState();
  }

  private getParticipantEdgeRating(p: IParticipant): number {
    if (!this.participantEdgeRatings.has(p)) {
      this.participantEdgeRatings.set(p, 0);
    }
    return this.participantEdgeRatings.get(p) || 0;
  }

  private getParticipantReaction(p: IParticipant): number {
    if (!this.participantReactions.has(p)) {
      this.participantReactions.set(p, Math.max(0, Number(p.baseIni || 0)));
    }
    return this.participantReactions.get(p) || 0;
  }

  private getParticipantIntuition(p: IParticipant): number {
    if (!this.participantIntuitions.has(p)) {
      this.participantIntuitions.set(p, 0);
    }
    return this.participantIntuitions.get(p) || 0;
  }

  private getParticipantTieBreaker(p: IParticipant): number {
    if (!this.participantTieBreakers.has(p)) {
      this.participantTieBreakers.set(p, Math.random());
    }
    return this.participantTieBreakers.get(p) || 0;
  }

  private initiativeTieBreakComparator(p1: IParticipant, p2: IParticipant): number {
    const p1Ini = p1.getCurrentInitiative() + (p1.edge ? 100 : 0) - (p1.ooc ? 1000 : 0);
    const p2Ini = p2.getCurrentInitiative() + (p2.edge ? 100 : 0) - (p2.ooc ? 1000 : 0);
    if (p1Ini !== p2Ini) {
      return p2Ini - p1Ini;
    }

    const p1Edge = this.getParticipantEdgeRating(p1);
    const p2Edge = this.getParticipantEdgeRating(p2);
    if (p1Edge !== p2Edge) {
      return p2Edge - p1Edge;
    }

    const p1Reaction = this.getParticipantReaction(p1);
    const p2Reaction = this.getParticipantReaction(p2);
    if (p1Reaction !== p2Reaction) {
      return p2Reaction - p1Reaction;
    }

    const p1Intuition = this.getParticipantIntuition(p1);
    const p2Intuition = this.getParticipantIntuition(p2);
    if (p1Intuition !== p2Intuition) {
      return p2Intuition - p1Intuition;
    }

    const p1Random = this.getParticipantTieBreaker(p1);
    const p2Random = this.getParticipantTieBreaker(p2);
    if (p1Random !== p2Random) {
      return p2Random - p1Random;
    }
    return p1.sortOrder - p2.sortOrder;
  }

  private enforceSingleCurrentActor() {
    if (!this.combatManager.started || this.combatManager.currentActors.count <= 1) {
      return;
    }
    const ranked = [ ...this.combatManager.currentActors.items ].sort((a, b) => this.initiativeTieBreakComparator(a, b));
    const keep = ranked[0];
    for (const actor of [ ...this.combatManager.currentActors.items ]) {
      if (actor === keep) {
        continue;
      }
      actor.status = StatusEnum.Waiting;
      this.combatManager.currentActors.remove(actor, false);
    }
    this.combatManager.currentInitiative = keep.getCurrentInitiative();
  }

  private hasPendingInitiativeRolls(): boolean {
    return this.combatManager.participants.items.some(p => !p.ooc && p.diceIni <= 0);
  }

  getPendingOutstandingRollCount(): number {
    return this.combatManager.participants.items.filter(p => !p.ooc && p.diceIni <= 0).length;
  }

  getPendingPlayerRollCount(): number {
    return this.combatManager.participants.items.filter(
      p => !p.ooc && p.diceIni <= 0 && this.participantOwners.has(p)
    ).length;
  }

  getPendingNonPlayerRollCount(): number {
    return this.combatManager.participants.items.filter(
      p => !p.ooc && p.diceIni <= 0 && !this.participantOwners.has(p)
    ).length;
  }

  requestPlayerRolls() {
    if (!this.shareRoomCode || this.getPendingPlayerRollCount() <= 0) {
      return;
    }
    this.sessionSync.sendCommand({
      type: "request_rolls",
      player: "GM",
      payload: {}
    });
  }

  btnRequestPlayerRolls_Click() {
    this.requestPlayerRolls();
    this.updateInitiativePrepInfo();
  }

  btnRollRemainingNonPlayer_Click() {
    this.rollOutstandingInitiative(false);
    this.updateInitiativePrepInfo();
  }

  btnForceRollOutstanding_Click() {
    this.confirmAndForceRollOutstanding();
  }

  btnBeginCombatTurn_Click() {
    if (this.hasPendingInitiativeRolls()) {
      this.updateInitiativePrepInfo();
      return;
    }
    this.beginCombatTurn();
  }

  private rollOutstandingInitiative(includePlayers: boolean) {
    UndoHandler.StartActions();
    let rolledPlayer = false;
    for (const participant of this.combatManager.participants.items) {
      if (participant.ooc || participant.diceIni > 0) {
        continue;
      }
      if (!includePlayers && this.participantOwners.has(participant)) {
        continue;
      }
      if (this.participantOwners.has(participant)) {
        rolledPlayer = true;
      }
      participant.rollInitiative();
    }
    if (rolledPlayer && this.shareRoomCode) {
      this.sessionSync.sendCommand({
        type: "clear_roll_prompt",
        player: "GM",
        payload: {}
      });
    }
    this.sort();
  }

  private async confirmAndForceRollOutstanding() {
    const confirmed = await this.confirmationDialog.confirm(
      "Force-roll initiative for all remaining characters (including player characters)?",
      "Force Roll Outstanding",
      "Force Roll",
      "Cancel"
    );
    if (!confirmed) {
      return;
    }
    this.rollOutstandingInitiative(true);
    this.updateInitiativePrepInfo();
  }

  private beginCombatTurn() {
    UndoHandler.StartActions();
    this.initiativePrepActive = false;
    this.combatManager.startRound();
    this.appendSharedLog("GM", `Start Combat Turn ${this.combatManager.combatTurn}`);
    this.appendSharedLog("GM", `Start Initiative Pass ${this.combatManager.initiativePass}`);
    this.sort();
  }

  private updateInitiativePrepInfo() {
    const pendingPlayers = this.getPendingPlayerRollCount();
    const pendingNonPlayers = this.getPendingNonPlayerRollCount();
    const pendingTotal = pendingPlayers + pendingNonPlayers;
    if (pendingTotal === 0) {
      this.shareInfo = "All initiative rolls ready. Begin Combat Turn.";
      return;
    }
    const playerPart = pendingPlayers > 0 ? `${pendingPlayers} player` : "0 player";
    const otherPart = pendingNonPlayers > 0 ? `${pendingNonPlayers} non-player` : "0 non-player";
    this.shareInfo = `Waiting for initiative: ${playerPart}, ${otherPart}.`;
  }

  isSharedLogEntryNew(index: number): boolean {
    return this.flashedSharedLogIndex === index;
  }

  private flashSharedLogEntry(index: number) {
    this.flashedSharedLogIndex = index;
    if (this.clearSharedLogFlashTimeout !== null) {
      window.clearTimeout(this.clearSharedLogFlashTimeout);
    }
    this.clearSharedLogFlashTimeout = window.setTimeout(() => {
      this.flashedSharedLogIndex = -1;
      this.clearSharedLogFlashTimeout = null;
    }, 1500);
  }

  private scrollLogToBottom() {
    const el = this.gmLogListContainer?.nativeElement;
    if (!el) {
      return;
    }
    el.scrollTop = el.scrollHeight;
  }

  // Helper to find the closest ancestor with a given class
  private closestByClass(el: HTMLElement, className: string): HTMLElement | null {
    while (el && !el.classList.contains(className)) {
      if (el.parentElement != null) {
        el = el.parentElement;
      }
      else {
        return null
      }
    }
    return el;
  }
}

