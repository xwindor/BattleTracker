import { AfterViewChecked, Component, OnInit, OnDestroy, ChangeDetectorRef, TemplateRef, ViewChild, ElementRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { NgbNavModule, NgbDropdownModule, NgbModal, NgbModalRef, NgbTooltip } from "@ng-bootstrap/ng-bootstrap";
import { Subscription } from "rxjs";
import { Undoable, UndoHandler } from "Common";
import { CombatManager, StatusEnum, BTTime, IParticipant } from "Combat";
import { Participant } from "Combat/Participants/Participant";
import { LogHandler } from "Logging";
import { Action } from "Interfaces/Action";
import { FormsModule } from '@angular/forms';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import ActionHandler from "Combat/ActionHandler";
import { ConditionMonitorComponent } from "app/condition-monitor/condition-monitor.component";
import { ConfirmationDialogService } from 'app/confirmation-dialog/confirmation-dialog.service';
import { DiceRollerComponent } from "app/dice-roller/dice-roller.component";
import { SessionCommand, SessionSyncService, SharedCombatState, SharedLogEntry, SharedParticipantState } from "app/services/session-sync.service";
import { MatrixStateService } from "app/services/matrix-state.service";
import { OsTrackingService } from "app/services/os-tracking.service";
import { MatrixParticipant, VRMode, ICParticipant, ICType, MatrixHost } from "Matrix";
import { AstralParticipant } from "Magic";
import { MatrixParticipantBadgeComponent } from "app/matrix/matrix-participant-badge/matrix-participant-badge.component";
import { ICSpawnerComponent } from "app/matrix/ic-spawner/ic-spawner.component";
import { MatrixRunPanelComponent } from "app/matrix/matrix-run-panel/matrix-run-panel.component";
import { AstralBadgeComponent } from "app/magic/astral-badge/astral-badge.component";
import { ALL_MATRIX_ACTION_NAMES, CYBERDECK_REQUIRED_ACTIONS, DECLARED_ACTIONS, DECLARED_ACTION_DESCRIPTIONS, DeclaredActionCategoryId, DeclaredActionItem, ILLEGAL_OS_ACTIONS } from "app/shared/declared-actions";
import { getInterruptLabel, getInterruptDescription } from "app/shared/interrupt-actions";
import { DeclaredActionEngine, DeclaredActionSelection } from "app/shared/declared-action-engine";
import { buildDecodeFrame, randomMatrixChar, escapeHtml, formatLogText, getLogTextClass } from "app/shared/log-formatter";
import { getInitiativeRollMax, clampInitiativeRoll } from "app/shared/roll-utils";

interface LocalLogEntry {
  timestamp: Date;
  text: string;
}

@Component({
  standalone: true,
  selector: "app-battle-tracker",
  templateUrl: "./battle-tracker.component.html",
  styleUrls: ["./battle-tracker.component.css"],
  imports: [
    CommonModule,
    NgbNavModule,
    NgbDropdownModule,
    NgbTooltip,
    FormsModule,
    DragDropModule,
    ConditionMonitorComponent,
    DiceRollerComponent,
    MatrixParticipantBadgeComponent,
    ICSpawnerComponent,
    MatrixRunPanelComponent,
    AstralBadgeComponent
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

  onGmDiceRolled(values: number[]): void {
    const hits = values.filter(v => v >= 5).length;
    const logText = `rolled ${values.length}d6: [${values.join(", ")}] — ${hits} hit${hits !== 1 ? "s" : ""}`;
    if (this.shareRoomCode) {
      this.appendSharedLog("GM", logText);
      this.sessionSync.sendCommand({
        type: "dice_roll",
        player: "GM",
        payload: { roller: "GM", diceCount: values.length, values }
      });
    } else {
      LogHandler.log(this.currentBTTime, `GM ${logText}`);
    }
  }

  
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
  private readonly matrixChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$#@%*+-";
  private readonly sharedLogDecodeTimers = new Map<number, number>();
  private readonly sharedLogDecodeText = new Map<number, string>();
  private readonly localLogDecodeTimers = new Map<string, number>();
  private readonly localLogDecodeText = new Map<string, string>();
  private observedLocalLogCount = 0;
  expandedDeckPanels = new Set<IParticipant>();
  expandedAstralPanels = new Set<IParticipant>();
  private readonly pendingVrModes = new Map<IParticipant, VRMode>();
  private readonly participantIds = new Map<IParticipant, string>();
  private readonly participantOwners = new Map<IParticipant, string>();
  private readonly participantClaimable = new Map<IParticipant, boolean>();
  private readonly participantEdgeRatings = new Map<IParticipant, number>();
  private readonly participantReactions = new Map<IParticipant, number>();
  private readonly participantIntuitions = new Map<IParticipant, number>();
  private readonly participantTieBreakers = new Map<IParticipant, number>();
  private readonly lastKnownDamage = new Map<string, { physical: number; stun: number }>();
  private damageLogFlushTimeout: number | null = null;
  private readonly damageLogDebounceMs = 500;

  // -- OS threshold alert state --
  @ViewChild("convergenceModalTpl") private convergenceModalTpl!: TemplateRef<unknown>;
  icAlertMessages: string[] = [];
  convergenceAlertDecker: string | null = null;
  convergenceAlertOs = 0;
  convergenceIsHostContext = false;
  convergenceHostName = "";
  private convergenceModalRef: NgbModalRef | null = null;
  private osThresholdSub?: Subscription;

  // -- Active host banner + IC spawner --
  @ViewChild("spawnICModalTpl") private spawnICModalTpl!: TemplateRef<unknown>;
  activeHostName = "";
  activeHostRating = 4;
  private icSpawnerModalRef: NgbModalRef | null = null;

  /** Expose ICType enum to the template. */
  readonly ICType = ICType;



  get currentBTTime(): BTTime {
    return new BTTime(this.combatManager.combatTurn, this.combatManager.initiativePass, this.combatManager.currentInitiative);
  }

  selectedActor: IParticipant | null = null;

  constructor(
    private ref: ChangeDetectorRef,
    private confirmationDialog: ConfirmationDialogService,
    private modalService: NgbModal,
    private sessionSync: SessionSyncService,
    public matrixState: MatrixStateService,
    public osTracking: OsTrackingService
  ) {
    super();
    this.addParticipant();
    this.changeDetector = ref;
  }

  /**
   * Type guard so templates and methods can branch on Matrix-aware
   * participants without sprinkling `instanceof` everywhere.
   */
  /** Exposed for use in @if expressions in the template. */
  readonly VRMode = VRMode;

  isMatrix(p: IParticipant): p is MatrixParticipant {
    return p instanceof MatrixParticipant;
  }

  /** Safe cast — only call inside an `@if (isMatrix(p))` guard. */
  asMatrix(p: IParticipant): MatrixParticipant {
    return p as MatrixParticipant;
  }

  isAstral(p: IParticipant): p is AstralParticipant {
    return p instanceof AstralParticipant;
  }

  asAstral(p: IParticipant): AstralParticipant {
    return p as AstralParticipant;
  }

  getPhysicalActionCategoriesFor(_p: IParticipant | null) {
    return this.physicalActionCategories;
  }

  // -- OS badge inline editor handlers --

  onOsAdjust(p: IParticipant, delta: number): void {
    if (!this.isMatrix(p)) return;
    this.osTracking.addOS(this.asMatrix(p), delta, `manual adjustment`);
    this.syncSharedState();
  }

  async onOsResetClick(p: IParticipant): Promise<void> {
    if (!this.isMatrix(p)) return;
    const confirmed = await this.confirmationDialog.simpleConfirm(`Reset OS to 0 for ${p.name}?`);
    if (!confirmed) return;
    UndoHandler.StartActions();
    this.osTracking.resetOS(this.asMatrix(p));
    this.syncSharedState();
    this.changeDetector.detectChanges();
  }

  dismissIcAlert(index: number): void {
    this.icAlertMessages.splice(index, 1);
  }

  dismissConvergenceAlert(): void {
    if (this.convergenceModalRef) {
      this.convergenceModalRef.close();
      this.convergenceModalRef = null;
    }
    this.convergenceAlertDecker = null;
  }

  // -- Active host banner --

  get activeHost(): MatrixHost | null {
    return this.matrixState.getCurrentHost();
  }

  get hasAnyMatrixParticipants(): boolean {
    return this.combatManager.participants.items.some(p => p instanceof MatrixParticipant);
  }

  /** All non-IC MatrixParticipants currently in the tracker. */
  get activeDeckers(): MatrixParticipant[] {
    return this.combatManager.participants.items.filter(
      p => p instanceof MatrixParticipant && !(p instanceof ICParticipant)
    ) as MatrixParticipant[];
  }

  setActiveHostFromBanner(): void {
    if (!this.activeHostName.trim()) return;
    UndoHandler.StartActions();
    const host = this.matrixState.createOrSetHost(this.activeHostName.trim(), Math.max(1, this.activeHostRating));
    // Pre-fill the name/rating fields from the stored host in case they updated.
    this.activeHostName = host.name;
    this.activeHostRating = host.rating;
  }

  clearActiveHostFromBanner(): void {
    UndoHandler.StartActions();
    this.matrixState.clearActiveHost();
  }

  openSpawnICModal(): void {
    if (!this.spawnICModalTpl) return;
    this.icSpawnerModalRef = this.modalService.open(this.spawnICModalTpl, { centered: true });
    this.icSpawnerModalRef.result.finally(() => { this.icSpawnerModalRef = null; });
  }

  closeSpawnICModal(): void {
    this.icSpawnerModalRef?.close();
  }

  spawnIC(icType: ICType): void {
    const host = this.activeHost;
    if (!host) return;
    if (host.icActive.length >= host.rating) return;
    if (host.icActive.some(ic => ic.icType === icType)) return;

    UndoHandler.StartActions();

    const ic = new ICParticipant(icType, host.rating);
    ic.name = `${icType} IC`;
    ic.linkedHostId = host.id;

    this.participantClaimable.set(ic, false);
    this.participantEdgeRatings.set(ic, 0);
    this.participantReactions.set(ic, 0);
    this.participantIntuitions.set(ic, 0);
    this.participantTieBreakers.set(ic, Math.random());
    this.combatManager.addParticipant(ic);

    const id = this.getParticipantId(ic);
    this.lastKnownDamage.set(id, { physical: 0, stun: 0 });

    this.matrixState.addICToHost(host, ic);

    this.closeSpawnICModal();
    LogHandler.log(this.currentBTTime, `Spawned ${icType} IC (Rating ${host.rating})`);
    this.sort();
  }

  // -- IC type guards --

  isIC(p: IParticipant): p is ICParticipant {
    return p instanceof ICParticipant;
  }

  asIC(p: IParticipant): ICParticipant {
    return p as ICParticipant;
  }

  isICBricked(p: IParticipant): boolean {
    return this.isIC(p) && p.physicalDamage >= p.physicalHealth;
  }

  onICMatrixDamageChanged(): void {
    this.syncSharedState();
  }

  // -- Act modal OS accumulation prompt --

  /** Illegal OS-generating actions in the current modal selection, with their deltas. */
  get actModalIllegalOsActions(): Array<{ name: string; delta: number }> {
    if (!this.actModalParticipant || !this.isMatrix(this.actModalParticipant)) return [];
    const sel = this.getDeclaredActionSelection(this.actModalParticipant);
    const all = [sel.free, ...sel.simple, sel.complex].filter((a): a is string => !!a);
    return all
      .filter(name => name in ILLEGAL_OS_ACTIONS)
      .map(name => ({ name, delta: ILLEGAL_OS_ACTIONS[name] }));
  }

  get actModalSuggestedOsDelta(): number {
    return this.actModalIllegalOsActions.reduce((sum, a) => sum + a.delta, 0);
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
    this.observedLocalLogCount = this.logHandler.logbook.length;
    this.osThresholdSub = this.osTracking.threshold$.subscribe(event => {
      if (event.alert === "ic-alert") {
        this.icAlertMessages.push(`${event.decker.name} — OS: ${event.decker.overwatch}`);
        this.changeDetector.detectChanges();
      } else if (event.alert === "convergence") {
        this.convergenceAlertDecker = event.decker.name;
        this.convergenceAlertOs = event.decker.overwatch;
        const host = this.matrixState.getCurrentHost();
        if (host) {
          this.convergenceIsHostContext = true;
          this.convergenceHostName = host.name;
          // Auto-apply 3 marks from host to decker (SR5E: host convergence marks the decker 3×).
          const deckerId = this.getParticipantId(event.decker);
          UndoHandler.StartActions();
          this.matrixState.addMarkToHost(host, deckerId, 3);
          event.decker.hostConverged = true;
        } else {
          this.convergenceIsHostContext = false;
          this.convergenceHostName = "";
        }
        this.convergenceModalRef = this.modalService.open(this.convergenceModalTpl, { backdrop: "static", centered: true });
        this.changeDetector.detectChanges();
      }
    });
  }

  ngOnDestroy() {
    if (this.clearSharedLogFlashTimeout !== null) {
      window.clearTimeout(this.clearSharedLogFlashTimeout);
      this.clearSharedLogFlashTimeout = null;
    }
    if (this.damageLogFlushTimeout !== null) {
      window.clearTimeout(this.damageLogFlushTimeout);
      this.damageLogFlushTimeout = null;
    }
    this.clearSharedLogDecodeAnimations();
    this.clearLocalLogDecodeAnimations();
    this.sessionSync.disconnect();
    this.osThresholdSub?.unsubscribe();
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
      this.clearSharedLogDecodeAnimations();
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
      this.clearSharedLogDecodeAnimations();
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
    const params = new URLSearchParams({
      mode: "player",
      room: this.shareRoomCode
    });
    const skin = window.localStorage.getItem("battle-tracker-skin");
    if (skin === "alternate" || skin === "vintage" || skin === "cyberdeck") {
      params.set("skin", skin);
    }
    return `${base}?${params.toString()}`;
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
    if (this.damageLogFlushTimeout !== null) {
      window.clearTimeout(this.damageLogFlushTimeout);
      this.damageLogFlushTimeout = null;
      this.flushDamageLog();
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
      this.clearSharedLogDecodeAnimations();
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
      this.startSharedLogDecode(this.sharedLogEntries.length - 1, entry.text);
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
      this.clearSharedLogDecodeAnimations();
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
      const isMatrix = payload["isMatrix"] === true;
      const dataProcessing = Number(payload["dataProcessing"] || 0);
      const vrMode = String(payload["vrMode"] || "AR");
      this.upsertPlayerParticipant(
        playerName,
        characterName,
        initiativeDice,
        edgeRating,
        reaction,
        intuition,
        overflowHealth,
        physicalHealth,
        stunHealth,
        isMatrix,
        dataProcessing,
        vrMode
      );
      this.appendSharedLog("GM", `Registered ${characterName}`);
      this.sort();
      return;
    }
    if (command.type === "configure_deck") {
      const payload = command.payload || {};
      const playerName = command.player || "";
      if (!playerName) return;
      const isMatrix = payload["isMatrix"] === true;
      let target: IParticipant | undefined;
      for (const p of this.combatManager.participants.items) {
        if (this.participantOwners.get(p) === playerName) {
          target = p;
          break;
        }
      }
      if (!target) return;
      if (!isMatrix) {
        const targetName = target.name || "Player";
        if (target instanceof MatrixParticipant) {
          this.demoteToParticipant(target);
        }
        this.appendSharedLog("GM", `${targetName} deck removed`);
        this.sort();
        return;
      }
      if (!(target instanceof MatrixParticipant)) {
        target = this.promoteToMatrixParticipant(target);
      }
      const mp = target as MatrixParticipant;
      mp.dataProcessing = Math.max(1, Number(payload["dataProcessing"] || 1));
      mp.attack = Math.max(0, Number(payload["attack"] || 0));
      mp.sleaze = Math.max(0, Number(payload["sleaze"] || 0));
      mp.firewall = Math.max(0, Number(payload["firewall"] || 0));
      mp.deviceRating = Math.max(0, Number(payload["deviceRating"] || 0));
      if (payload["jackIn"] === true) {
        // Jack In / Switch Mode: apply the chosen VR mode and mark as jacked in.
        const vrModeStr = String(payload["vrMode"] || "AR");
        const mode = vrModeStr === "hot-sim" ? VRMode.HotSim
                   : vrModeStr === "cold-sim" ? VRMode.ColdSim
                   : VRMode.AR;
        const oldDices = mp.dices;
        const wasRolled = mp.diceIni > 0 && this.combatManager.started;
        const hadRolledPreCombat = mp.diceIni > 0 && !this.combatManager.started;
        this.applyVRMode(mp, mode);
        mp.jackedIn = true; // force true even for AR (applyVRMode leaves it false)
        if (wasRolled) {
          const diceDelta = mp.dices - oldDices;
          if (diceDelta < 0) {
            // Lost dice (e.g. Hot Sim → Cold Sim): server applies and logs immediately.
            this.applyAndLogInitiativeDelta(mp, oldDices, mp.dices);
          }
          // diceDelta > 0: player will submit a delta roll_submission {isDelta:true}.
          // diceDelta === 0: no dice change; base stat shift is automatic via baseIni.
        } else if (hadRolledPreCombat && mp.dices !== oldDices) {
          // Pre-combat mode switch with a stale roll: clear diceIni so the participant
          // shows as pending a roll in the tracker. Player will submit a fresh roll_submission.
          mp.diceIni = 0;
          LogHandler.log(this.currentBTTime, `${mp.name} initiative cleared — awaiting re-roll for new mode`);
        }
        // else: no prior roll — player will send a full roll_submission when prompted.
      } else if (payload["jackOut"] === true || payload["create"] === true) {
        // Jack Out or initial deck creation: no VR mode, restore physical initiative.
        const oldDices = mp.dices;
        const wasRolled = payload["jackOut"] === true && mp.diceIni > 0 && this.combatManager.started;
        const hadRolledPreCombat = payload["jackOut"] === true && mp.diceIni > 0 && !this.combatManager.started;
        mp.vrMode = VRMode.None;
        mp.jackedIn = false;
        mp.blocksPhysicalActions = false;
        const reaction = this.participantReactions.get(mp) ?? 0;
        const intuition = this.getParticipantIntuition(mp);
        mp.baseIni = reaction + intuition;
        mp.dices = 1;
        if (wasRolled) {
          // Mid-combat: server always handles jack-out dice loss: roll the lost dice, subtract, log.
          this.applyAndLogInitiativeDelta(mp, oldDices, 1);
        } else if (hadRolledPreCombat) {
          // Pre-combat jack-out with a stale Matrix roll: clear it so the participant
          // shows as pending a roll in the tracker. Player will submit a fresh 1d6 roll_submission.
          mp.diceIni = 0;
          LogHandler.log(this.currentBTTime, `${mp.name} initiative cleared — awaiting re-roll after jack out`);
        }
        // else: create or no prior roll — player will send full roll_submission when prompted.
      }
      // else (stat-edit): stats already set above — don't touch vrMode, jackedIn, or initiative.
      this.sort();
      return;
    }
    if (command.type === "configure_astral") {
      const payload = command.payload || {};
      const playerName = command.player || "";
      if (!playerName) return;
      const target = this.combatManager.participants.items.find(
        p => this.participantOwners.get(p) === playerName
      );
      if (!target) return;
      if (payload["isAstral"] === false) {
        if (this.isAstral(target)) {
          this.disableAstral(target);
          LogHandler.log(this.currentBTTime, `${target.name} removed Awakened status`);
        }
        return;
      }
      if (payload["isAstral"] === true && !this.isAstral(target)) {
        this.enableAstral(target);
        LogHandler.log(this.currentBTTime, `${target.name} is now Awakened`);
        return;
      }
      if (payload["project"] !== undefined && this.isAstral(target)) {
        const wantProject = payload["project"] === true;
        if (this.asAstral(target).astralProjecting !== wantProject) {
          this.toggleAstralProjecting(target);
        }
      }
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
      const isDelta = command.payload?.["isDelta"] === true;
      const target = this.findPlayerParticipant(playerName, participantId);
      if (!target) {
        return;
      }
      if (isDelta) {
        // Mid-combat delta roll: add to existing diceIni rather than replacing it.
        target.diceIni = Math.max(1, target.diceIni + roll);
        const total = target.getCurrentInitiative();
        const rawValues = command.payload?.["diceValues"];
        const diceValues = Array.isArray(rawValues) ? (rawValues as unknown[]).map(Number) : [];
        const sign = roll >= 0 ? '+' : '';
        if (diceValues.length > 0) {
          this.appendSharedLog(
            target.name || "Player",
            `initiative delta: +[${diceValues.join(", ")}] = ${sign}${roll} → score: ${total}`
          );
        } else {
          this.appendSharedLog(
            target.name || "Player",
            `initiative delta: manual(${sign}${roll}) → score: ${total}`
          );
        }
        if (this.initiativePrepActive) {
          this.updateInitiativePrepInfo();
        }
        this.sort();
        return;
      }
      target.diceIni = this.clampInitiativeRoll(roll, target);
      const total = target.getCurrentInitiative();
      const intuition = this.getParticipantIntuition(target);
      let baseLabel: string;
      if (this.isIC(target)) {
        baseLabel = `Rating×2(${this.asIC(target).hostRating * 2})`;
      } else if (this.isMatrix(target) && this.asMatrix(target).jackedIn && this.asMatrix(target).vrMode !== VRMode.AR && this.asMatrix(target).vrMode !== VRMode.None) {
        baseLabel = `DP(${this.asMatrix(target).dataProcessing}) + INT(${intuition})`;
      } else {
        baseLabel = `REA(${this.getParticipantReaction(target)}) + INT(${intuition})`;
      }
      const rawValues = command.payload?.["diceValues"];
      const diceValues = Array.isArray(rawValues) ? (rawValues as unknown[]).map(Number) : [];
      if (diceValues.length > 0) {
        this.appendSharedLog(
          target.name || "Player",
          `initiative roll: ${baseLabel} + [${diceValues.join(", ")}] = ${total}`
        );
      } else {
        this.appendSharedLog(
          target.name || "Player",
          `initiative roll: ${baseLabel} + manual(${target.diceIni}) = ${total}`
        );
      }
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
      const illegalActions = Array.isArray(command.payload?.["illegalActions"])
        ? (command.payload!["illegalActions"] as string[])
        : [];
      const target = this.findPlayerParticipant(playerName, participantId);
      if (!target || (target.status !== StatusEnum.Active && target.status !== StatusEnum.Delaying)) {
        return;
      }
      this.performAct(target, declaredAction, target.name || "Player");
      if (illegalActions.length > 0) {
        this.icAlertMessages.push(`${target.name}: ${illegalActions.join(", ")} — add OS after resolving defense`);
      }
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
    if (command.type === "dice_roll") {
      if (command.player === "GM") return; // skip echo of our own roll
      const roller = String(command.payload?.["roller"] || command.player || "Unknown");
      const rawValues = command.payload?.["values"];
      const values = Array.isArray(rawValues) ? (rawValues as unknown[]).map(Number) : [];
      if (values.length > 0) {
        const hits = values.filter(v => v >= 5).length;
        const logText = `rolled ${values.length}d6: [${values.join(", ")}] — ${hits} hit${hits !== 1 ? "s" : ""}`;
        this.appendSharedLog(roller, logText);
        this.incomingDiceRoll = { roller, values };
      }
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
      .map((p, index) => {
        const base: SharedParticipantState = {
          id: this.getParticipantId(p),
          name: p.name || `Participant ${index + 1}`,
          order: index + 1,
          active: this.combatManager.currentActors.contains(p),
          initiativeScore: p.getCurrentInitiative(),
          playerControlled: this.participantOwners.has(p),
          claimable: this.participantClaimable.get(p) === true,
          ownerName: this.participantOwners.get(p),
          canAct: p.status === StatusEnum.Active || p.status === StatusEnum.Delaying,
          canDelay: p.status === StatusEnum.Active,
          canInterrupt: p.getCurrentInitiative() >= 1,
          initiativeDice: p.dices,
          pendingRoll: p.diceIni <= 0,
          edgeRating: this.getParticipantEdgeRating(p),
          reaction: this.getParticipantReaction(p),
          intuition: this.getParticipantIntuition(p)
        };

        if (this.isMatrix(p)) {
          base.isMatrix = true;
          base.vrMode = p.vrMode;
          base.overwatch = p.overwatch;
          base.overwatchAlert = p.overwatchAlert;
          base.jackedIn = p.jackedIn;
          base.isVRCatatonic = p.blocksPhysicalActions;
          base.dataProcessing = p.dataProcessing;
          base.attack = p.attack;
          base.sleaze = p.sleaze;
          base.firewall = p.firewall;
          base.deviceRating = p.deviceRating;
        }

        if (this.isAstral(p)) {
          base.isAstral = true;
          base.isAstralProjecting = p.astralProjecting;
        }

        return base;
      });
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
    if (this.damageLogFlushTimeout !== null) {
      window.clearTimeout(this.damageLogFlushTimeout);
    }
    this.damageLogFlushTimeout = window.setTimeout(() => {
      this.flushDamageLog();
      this.damageLogFlushTimeout = null;
    }, this.damageLogDebounceMs);
  }

  private flushDamageLog() {
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
    stunHealth: number,
    isMatrix = false,
    dataProcessing = 0,
    vrModeStr = "AR"
  ) {
    let target: IParticipant | undefined;
    for (const p of this.combatManager.participants.items) {
      if (this.participantOwners.get(p) === playerName) {
        target = p;
        break;
      }
    }

    // If the participant type needs to change (decker ↔ physical), discard and recreate.
    const typeMismatch = target !== undefined && isMatrix !== (target instanceof MatrixParticipant);
    if (typeMismatch && target) {
      this.participantIds.delete(target);
      this.participantOwners.delete(target);
      this.participantClaimable.delete(target);
      this.participantEdgeRatings.delete(target);
      this.participantReactions.delete(target);
      this.participantIntuitions.delete(target);
      this.participantTieBreakers.delete(target);
      this.combatManager.removeParticipant(target);
      target = undefined;
    }

    if (!target) {
      target = isMatrix ? new MatrixParticipant() : new Participant();
      this.combatManager.addParticipant(target);
    }

    target.name = characterName;
    target.overflowHealth = Math.max(1, overflowHealth);
    target.physicalHealth = Math.max(1, physicalHealth);
    target.stunHealth = Math.max(1, stunHealth);
    this.participantOwners.set(target, playerName);
    this.participantClaimable.set(target, true);
    this.participantEdgeRatings.set(target, Math.max(0, Number(edgeRating || 0)));

    const safeReaction = Math.max(0, Number(reaction || 0));
    const safeIntuition = Math.max(0, Number(intuition || 0));

    if (isMatrix && target instanceof MatrixParticipant) {
      const safeDP = Math.max(1, Number(dataProcessing || 1));
      const mode = vrModeStr === "hot-sim" ? VRMode.HotSim
                 : vrModeStr === "cold-sim" ? VRMode.ColdSim
                 : VRMode.AR;
      target.dataProcessing = safeDP;
      if (mode === VRMode.AR) {
        // AR: physical initiative — REA+INT+initiativeDice, no catatonia.
        // jackedIn is NOT reset here — it's controlled by the GM via gmJackIn/gmJackOut.
        target.vrMode = VRMode.AR;
        target.dices = Math.max(1, initiativeDice);
        target.baseIni = safeReaction + safeIntuition;
        target.blocksPhysicalActions = false;
      } else {
        // Cold/Hot-Sim: Matrix initiative — DP+INT+3d6/4d6, physically catatonic.
        target.applyJackInMode(mode, safeIntuition);
      }
      this.participantReactions.set(target, safeReaction);
      this.participantIntuitions.set(target, safeIntuition);
    } else {
      target.dices = Math.max(1, initiativeDice);
      target.baseIni = safeReaction + safeIntuition;
      this.participantReactions.set(target, safeReaction);
      this.participantIntuitions.set(target, safeIntuition);
    }

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
      selected: p === this.selectedActor,
      "is-ic": this.isIC(p),
      "is-ic-bricked": this.isICBricked(p)
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
    this.rollAndLogInitiative(sender);
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

  clearActModalSelection(): void {
    if (this.actModalParticipant) {
      this.clearDeclaredActionSelection(this.actModalParticipant);
    }
  }

  isActModalSelectionEmpty(sender: IParticipant): boolean {
    const sel = this.getDeclaredActionSelection(sender);
    return sel.free === null && sel.simple.length === 0 && sel.complex === null;
  }

  submitActModal() {
    if (!this.actModalParticipant || !this.isDeclaredActionSelectionValid(this.actModalParticipant)) {
      return;
    }
    const actor = this.actModalParticipant;
    const illegalActions = this.actModalIllegalOsActions;
    this.performAct(actor, this.buildDeclaredActionLog(actor));
    if (illegalActions.length > 0) {
      const names = illegalActions.map(a => a.name).join(", ");
      this.icAlertMessages.push(`${actor.name}: ${names} — add OS after resolving defense`);
    }
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
    const isCyberdeckAct = CYBERDECK_REQUIRED_ACTIONS.has(action.name);
    const isPhysicalAct = !ALL_MATRIX_ACTION_NAMES.has(action.name);
    if (isCyberdeckAct && (!this.isMatrix(sender) || !this.asMatrix(sender).jackedIn)) {
      return false;
    }
    if (isPhysicalAct && this.isMatrix(sender) && (sender as MatrixParticipant).blocksPhysicalActions) {
      return false;
    }
    if (isPhysicalAct && this.isAstral(sender) && (sender as AstralParticipant).blocksPhysicalActions) {
      return false;
    }
    return DeclaredActionEngine.canUseDeclaredAction(this.getDeclaredActionSelection(sender), action);
  }

  isDeclaredActionSelectionValid(sender: IParticipant): boolean {
    return DeclaredActionEngine.getValidationResult(this.getDeclaredActionSelection(sender)).valid;
  }

  getDeclaredActionValidationMessage(sender: IParticipant): string {
    return DeclaredActionEngine.getValidationResult(this.getDeclaredActionSelection(sender)).message;
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
    const isCyberdeckAct = CYBERDECK_REQUIRED_ACTIONS.has(action.name);
    const isPhysicalAct = !ALL_MATRIX_ACTION_NAMES.has(action.name);
    if (isCyberdeckAct && !this.isMatrix(sender)) {
      return "Requires a cyberdeck.";
    }
    if (isCyberdeckAct && this.isMatrix(sender) && !this.asMatrix(sender).jackedIn) {
      return "Must be jacked in to use this action.";
    }
    if (isPhysicalAct && this.isMatrix(sender) && (sender as MatrixParticipant).blocksPhysicalActions) {
      return "Cannot take physical actions while in VR.";
    }
    if (isPhysicalAct && this.isAstral(sender) && (sender as AstralParticipant).blocksPhysicalActions) {
      return "Cannot take physical actions while astrally projecting.";
    }
    if (this.isDeclaredActionSelected(sender, action)) {
      const selection = this.getDeclaredActionSelection(sender);
      if (action.economy === "simple"
        && DeclaredActionEngine.isRepeatableSimpleAction(action.name)
        && DeclaredActionEngine.getSimpleActionSelectionCount(selection, action.name) === 1
        && DeclaredActionEngine.canAddSimpleDuplicate(selection, action.name)) {
        return "Click to add this action a second time.";
      }
      return "Selected. Click again to deselect.";
    }
    if (this.canUseDeclaredAction(sender, action)) {
      return "";
    }
    const selection = this.getDeclaredActionSelection(sender);
    if (action.economy === "simple" && selection.complex) {
      return "Cannot select Simple while a Complex action is selected.";
    }
    if (action.economy === "simple" && selection.simple.length >= 2) {
      return "Maximum of 2 Simple actions reached.";
    }
    if (action.economy === "simple" && DeclaredActionEngine.getSimpleAttackCount(selection) >= 1) {
      return "Only one Simple attack action is allowed.";
    }
    if (action.economy === "complex" && selection.simple.length > 0) {
      return "Cannot select Complex while Simple actions are selected.";
    }
    if (action.economy === "complex" && selection.complex) {
      return "A Complex action is already selected.";
    }
    if (DeclaredActionEngine.hasConflictingSelectedAction(selection, action.name)) {
      return "Conflicts with an already selected action.";
    }
    return "Not allowed by current action limits.";
  }

  private toggleDeclaredActionSelection(sender: IParticipant, action: DeclaredActionItem): void {
    if (!this.canUseDeclaredAction(sender, action)) {
      return;
    }
    const selection = this.getDeclaredActionSelection(sender);
    this.declaredActionSelections.set(sender, DeclaredActionEngine.toggleDeclaredAction(selection, action));
  }

  private buildDeclaredActionLog(sender: IParticipant): string | null {
    return DeclaredActionEngine.buildDeclaredActionLog(this.getDeclaredActionSelection(sender));
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
    if (this.isIC(sender)) {
      const host = this.matrixState.state.hosts.find(h => h.id === (sender as ICParticipant).linkedHostId);
      if (host) this.matrixState.removeICFromHost(host, sender as ICParticipant);
    }
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
    if (this.selectedActor === sender) {
      this.selectedActor = null;
    }
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
    if (this.damageLogFlushTimeout !== null) {
      window.clearTimeout(this.damageLogFlushTimeout);
      this.damageLogFlushTimeout = null;
      this.flushDamageLog();
    }
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
    this.appendSharedLog("GM", "End Combat");
    if (this.shareRoomCode) {
      this.sessionSync.sendCommand({
        type: "combat_ended",
        player: "GM",
        payload: {}
      });
      this.sessionSync.sendCommand({
        type: "clear_roll_prompt",
        player: "GM",
        payload: {}
      });
    }
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
    return getInterruptLabel(action.key);
  }

  getActionTooltip(action: Action): string {
    const description = getInterruptDescription(action.key) || "No description available.";
    return `${description} Initiative cost: ${action.iniMod}`;
  }

  getActionDetails(action: Action): string {
    const description = getInterruptDescription(action.key) || "No description available.";
    return `${description} Initiative cost: ${action.iniMod}.`;
  }

  getVisibleLogEntries(): LocalLogEntry[] {
    this.ensureLocalLogAnimations();
    return [ ...this.logHandler.logbook ].reverse();
  }

  getVisibleSharedLogEntries(): SharedLogEntry[] {
    return [ ...this.sharedLogEntries ];
  }

  getSharedLogDisplayText(entry: SharedLogEntry, index: number): string {
    return this.sharedLogDecodeText.get(index) || entry.text;
  }

  getLocalLogDisplayText(entry: LocalLogEntry): string {
    return this.localLogDecodeText.get(this.getLocalLogKey(entry)) || entry.text;
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
    this.handleTabNav(e, 'input[name="name"]', (row) => {
      LogHandler.log(this.currentBTTime, "TabAddParticipant");
      UndoHandler.StartActions();
      this.addParticipant();
      const index = row.getAttribute("data-indexnr");
      this.indexToSelect = index !== null ? 1 + Number(index) : -1;
      this.focusPendingRow();
    });
  }

  inpDiceIni_KeyDown(e: KeyboardEvent) {
    this.handleTabNav(e, ".inpDiceIni");
  }

  inpBaseIni_KeyDown(e: KeyboardEvent) {
    this.handleTabNav(e, ".inpBaseIni");
  }

  private handleTabNav(
    e: KeyboardEvent,
    selector: string,
    onCreateNewRow?: (currentRow: HTMLElement) => void
  ): void {
    if (e.code !== "Tab") return;
    const row = (e.target as HTMLElement).closest(".participant") as HTMLElement | null;
    if (!row) return;

    if (e.shiftKey) {
      const prevRow = row.previousElementSibling as HTMLElement | null;
      if (!prevRow) return;
      const field = prevRow.querySelector(selector) as HTMLInputElement | null;
      if (!field) return;
      e.preventDefault();
      field.select();
      prevRow.click();
      return;
    }

    const nextRow = row.nextElementSibling as HTMLElement | null;
    if (nextRow) {
      const field = nextRow.querySelector(selector) as HTMLInputElement | null;
      if (!field) return;
      e.preventDefault();
      field.select();
      nextRow.click();
      return;
    }

    if (onCreateNewRow) {
      e.preventDefault();
      onCreateNewRow(row);
    }
  }

  private focusPendingRow() {
    const target = this.indexToSelect;
    if (target < 0) return;
    this.indexToSelect = -1;
    queueMicrotask(() => {
      const row = document.getElementById("participant" + target);
      if (!row) return;
      const field = row.querySelector("input") as HTMLInputElement | null;
      if (!field) return;
      field.select();
      row.click();
    });
  }

  // Focus Handler
  inp_Focus(e: Event) {
    if (e.target instanceof HTMLInputElement)
      e.target.select();
  }

  iniChange(e: Event, p: IParticipant) {
    const clamped = this.clampInitiativeRoll(p.diceIni, p);
    if (clamped !== p.diceIni) {
      e.preventDefault();
      p.diceIni = clamped;
      const target = e.target as HTMLInputElement;
      target.value = String(clamped);
    }
  }

  onParticipantUpdated() {
    this.enforceParticipantRollBounds();
    this.syncSharedState();
  }

  onParticipantDiceCountChanged(p: IParticipant, value: number) {
    const oldDices = p.dices;
    const normalizedDiceCount = Math.max(1, Math.floor(Number(value || 1)));
    p.dices = normalizedDiceCount;
    if (this.combatManager.started && p.diceIni > 0 && oldDices !== normalizedDiceCount) {
      // SR5E: mid-combat dice change — only roll delta dice, add/subtract, and log.
      this.applyAndLogInitiativeDelta(p, oldDices, normalizedDiceCount);
    } else {
      p.diceIni = this.clampInitiativeRoll(p.diceIni, p);
    }
    this.syncSharedState();
  }

  /**
   * Roll `count` dice and return the individual values and their sum.
   */
  private rollDiceDetailed(count: number): { values: number[]; sum: number } {
    const values: number[] = [];
    for (let i = 0; i < count; i++) {
      values.push(Math.floor(Math.random() * 6) + 1);
    }
    return { values, sum: values.reduce((s, v) => s + v, 0) };
  }

  /**
   * Roll all initiative dice for p, update diceIni, and log the result to
   * both the local GM log and the shared session log (if active).
   */
  private rollAndLogInitiative(p: IParticipant): void {
    const values = Array.from({ length: p.dices }, () => Math.floor(Math.random() * 6) + 1);
    p.diceIni = this.clampInitiativeRoll(values.reduce((s, v) => s + v, 0), p);
    const total = p.getCurrentInitiative();
    const intuition = this.getParticipantIntuition(p);
    const baseLabel = this.isIC(p)
      ? `Rating×2(${this.asIC(p).hostRating * 2})`
      : this.isMatrix(p) && this.asMatrix(p).jackedIn
        && this.asMatrix(p).vrMode !== VRMode.AR && this.asMatrix(p).vrMode !== VRMode.None
        ? `DP(${this.asMatrix(p).dataProcessing}) + INT(${intuition})`
        : `REA(${this.getParticipantReaction(p)}) + INT(${intuition})`;
    const logText = `initiative roll: ${baseLabel} + [${values.join(', ')}] = ${total}`;
    LogHandler.log(this.currentBTTime, `${p.name} ${logText}`);
    this.appendSharedLog(p.name || 'Participant', logText);
  }

  /**
   * Apply SR5E mid-combat initiative delta: roll only the gained or lost dice,
   * add or subtract from p.diceIni, and log to both the local and shared logs.
   * Only call when combat is active and p.diceIni > 0.
   */
  private applyAndLogInitiativeDelta(p: IParticipant, oldDices: number, newDices: number): void {
    const delta = newDices - oldDices;
    if (delta === 0) return;
    const { values, sum } = this.rollDiceDetailed(Math.abs(delta));
    const signed = delta > 0 ? sum : -sum;
    p.diceIni = Math.max(1, p.diceIni + signed);
    const sign = delta > 0 ? '+' : '-';
    const total = p.getCurrentInitiative();
    const logText = `initiative delta: ${sign}[${values.join(', ')}] = ${sign}${sum} → score: ${total}`;
    LogHandler.log(this.currentBTTime, `${p.name} ${logText}`);
    this.appendSharedLog(p.name || 'Participant', logText);
  }

  /** @deprecated Use applyAndLogInitiativeDelta. Kept as internal shim. */
  private rollDiceDelta(oldDices: number, newDices: number): number {
    const delta = newDices - oldDices;
    if (delta === 0) return 0;
    const { sum } = this.rollDiceDetailed(Math.abs(delta));
    return delta > 0 ? sum : -sum;
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
    const intuition = this.getParticipantIntuition(p);
    if (this.isMatrix(p)) {
      return Math.max(0, p.dataProcessing + intuition);
    }
    if (this.isAstral(p) && p.astralProjecting) {
      return Math.max(0, intuition * 2);
    }
    return Math.max(0, this.getParticipantReaction(p) + intuition);
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

  isDeckPanelExpanded(p: IParticipant): boolean {
    return this.expandedDeckPanels.has(p);
  }

  toggleDeckPanel(p: IParticipant) {
    if (this.expandedDeckPanels.has(p)) {
      this.expandedDeckPanels.delete(p);
    } else {
      this.expandedDeckPanels.add(p);
    }
  }

  enableDeck(p: IParticipant) {
    UndoHandler.StartActions();
    const mp = this.promoteToMatrixParticipant(p);
    const reaction = this.participantReactions.get(mp) ?? 0;
    const intuition = this.participantIntuitions.get(mp) ?? 0;
    mp.baseIni = reaction + intuition;
    this.pendingVrModes.set(mp, VRMode.AR);
    this.syncSharedState();
    this.sort();
  }

  removeDeck(p: IParticipant) {
    if (!this.isMatrix(p)) return;
    UndoHandler.StartActions();
    this.pendingVrModes.delete(p);
    this.demoteToParticipant(p as MatrixParticipant);
    this.syncSharedState();
    this.sort();
  }

  isAstralPanelExpanded(p: IParticipant): boolean {
    return this.expandedAstralPanels.has(p);
  }

  toggleAstralPanel(p: IParticipant): void {
    if (this.expandedAstralPanels.has(p)) {
      this.expandedAstralPanels.delete(p);
    } else {
      this.expandedAstralPanels.add(p);
    }
  }

  enableAstral(p: IParticipant): void {
    UndoHandler.StartActions();
    const ap = this.promoteToAstralParticipant(p);
    this.syncSharedState();
    this.sort();
    // Carry the panel expansion to the new instance
    if (this.expandedAstralPanels.has(p)) {
      this.expandedAstralPanels.delete(p);
      this.expandedAstralPanels.add(ap);
    }
  }

  disableAstral(p: IParticipant): void {
    if (!this.isAstral(p)) return;
    UndoHandler.StartActions();
    this.expandedAstralPanels.delete(p);
    this.demoteFromAstralParticipant(p as AstralParticipant);
    this.syncSharedState();
    this.sort();
  }

  toggleAstralProjecting(p: IParticipant): void {
    if (!this.isAstral(p)) return;
    UndoHandler.StartActions();
    const ap = p as AstralParticipant;
    ap.astralProjecting = !ap.astralProjecting;
    ap.blocksPhysicalActions = ap.astralProjecting;
    ap.baseIni = this.getParticipantBaseInitiative(ap);
    LogHandler.log(
      this.currentBTTime,
      `${ap.name} ${ap.astralProjecting ? "entered astral space (INT\xD72 initiative)" : "returned from astral space (REA+INT initiative)"}`
    );
    this.syncSharedState();
    this.sort();
  }

  getPendingVrMode(p: IParticipant): VRMode {
    return this.pendingVrModes.get(p) ?? VRMode.AR;
  }

  setPendingVrMode(p: IParticipant, mode: VRMode): void {
    this.pendingVrModes.set(p, mode);
  }

  gmJackIn(p: IParticipant): void {
    if (!this.isMatrix(p)) return;
    UndoHandler.StartActions();
    const mp = p as MatrixParticipant;
    const mode = this.getPendingVrMode(p);
    const oldDices = mp.dices;
    const wasRolled = mp.diceIni > 0 && this.combatManager.started;
    this.applyVRMode(mp, mode);
    mp.jackedIn = true; // force true even for AR so Phase 2 shows
    this.pendingVrModes.set(p, mode); // keep pending = active mode so Switch Mode starts disabled
    if (wasRolled) {
      // SR5E: mid-combat jack in — base stat delta automatic via baseIni;
      // only roll the extra/lost dice, apply, and log.
      this.applyAndLogInitiativeDelta(mp, oldDices, mp.dices);
    } else if (mp.diceIni > 0) {
      // Pre-combat (initiative prep): participant already rolled for the old mode.
      // Dice count changed — roll a completely fresh initiative for the new mode.
      this.rollAndLogInitiative(mp);
    }
    // Not yet rolled: server updated dices/baseIni; GM requests rolls as normal.
    const modeLabel = mode === VRMode.HotSim ? 'Hot Sim' : mode === VRMode.ColdSim ? 'Cold Sim' : 'AR';
    LogHandler.log(this.currentBTTime, `${p.name} jacked in (${modeLabel})`);
    this.syncSharedState();
    this.sort();
  }

  gmJackOut(p: IParticipant): void {
    if (!this.isMatrix(p)) return;
    UndoHandler.StartActions();
    const mp = p as MatrixParticipant;
    const oldDices = mp.dices;
    const wasRolled = mp.diceIni > 0 && this.combatManager.started;
    // Jack Out: clear VR mode, restore physical initiative, reset OS.
    mp.vrMode = VRMode.None;
    mp.jackedIn = false;
    mp.blocksPhysicalActions = false;
    mp.hostConverged = false;
    const reaction = this.participantReactions.get(mp) ?? 0;
    const intuition = this.getParticipantIntuition(mp);
    mp.baseIni = reaction + intuition;
    mp.dices = 1;
    this.osTracking.resetOS(mp);
    this.pendingVrModes.set(p, VRMode.AR);
    if (wasRolled) {
      // SR5E: mid-combat jack out — base stat delta automatic via baseIni;
      // only roll the lost dice, subtract, and log.
      this.applyAndLogInitiativeDelta(mp, oldDices, 1);
    } else if (mp.diceIni > 0) {
      // Pre-combat (initiative prep): participant already rolled for the old mode.
      // Rolling out resets to 1d6 physical initiative — roll a fresh score now.
      this.rollAndLogInitiative(mp);
    }
    // Not yet rolled: server updated dices/baseIni; GM requests rolls as normal.
    LogHandler.log(this.currentBTTime, `${p.name} jacked out`);
    this.syncSharedState();
    this.sort();
  }

  /** Called from MatrixRunPanelComponent when the GM confirms a jack-in or mode switch. */
  onMatrixPanelJackIn(decker: MatrixParticipant, mode: VRMode): void {
    this.pendingVrModes.set(decker, mode);
    this.gmJackIn(decker);
  }

  /** Called from MatrixRunPanelComponent when the GM requests a jack-out. */
  async onMatrixPanelJackOut(decker: MatrixParticipant): Promise<void> {
    if (decker.hostConverged) {
      const confirmed = await this.confirmationDialog.confirm(
        `${decker.name} has an active host convergence. Jacking out now will trigger an immediate demiGOD Convergence attack. Proceed?`,
        "demiGOD Convergence Warning",
        "Jack Out Anyway",
        "Cancel"
      );
      if (!confirmed) return;
    }
    this.gmJackOut(decker);
  }

  onDeckStatChanged(p: IParticipant, field: 'attack' | 'sleaze' | 'firewall' | 'deviceRating', value: number): void {
    if (!this.isMatrix(p)) return;
    UndoHandler.StartActions();
    (p as MatrixParticipant)[field] = Math.max(0, Number(value || 0));
    this.syncSharedState();
  }

  private promoteToMatrixParticipant(p: IParticipant, defaultDP = 6): MatrixParticipant {
    const mp = new MatrixParticipant();
    const src = p as unknown as Record<string, unknown>;
    const dst = mp as unknown as Record<string, unknown>;
    const baseFields = [
      "_active", "_baseIni", "_diceIni", "_dices", "_edge", "_finished",
      "_name", "_ooc", "_overflowHealth", "_painTolerance", "_physicalDamage",
      "_physicalHealth", "_status", "_stunDamage", "_stunHealth", "_waiting",
      "_hasPainEditor", "_sortOrder"
    ];
    for (const f of baseFields) {
      dst[f] = src[f];
    }
    dst["_actionHistory"] = [];
    mp.dataProcessing = defaultDP;
    mp.vrMode = VRMode.None;
    const existingId = this.participantIds.get(p);
    if (existingId) this.participantIds.set(mp, existingId);
    const owner = this.participantOwners.get(p);
    if (owner) this.participantOwners.set(mp, owner);
    const claimable = this.participantClaimable.get(p);
    if (claimable !== undefined) this.participantClaimable.set(mp, claimable);
    const edge = this.participantEdgeRatings.get(p);
    if (edge !== undefined) this.participantEdgeRatings.set(mp, edge);
    const reaction = this.participantReactions.get(p);
    if (reaction !== undefined) this.participantReactions.set(mp, reaction);
    const intuition = this.participantIntuitions.get(p);
    if (intuition !== undefined) this.participantIntuitions.set(mp, intuition);
    const tb = this.participantTieBreakers.get(p);
    if (tb !== undefined) this.participantTieBreakers.set(mp, tb);
    const damage = existingId ? this.lastKnownDamage.get(existingId) : undefined;
    if (damage && existingId) this.lastKnownDamage.set(existingId, damage);
    const das = this.declaredActionSelections.get(p);
    if (das) {
      this.declaredActionSelections.set(mp, das);
      this.declaredActionSelections.delete(p);
    }
    this.participantIds.delete(p);
    this.participantOwners.delete(p);
    this.participantClaimable.delete(p);
    this.participantEdgeRatings.delete(p);
    this.participantReactions.delete(p);
    this.participantIntuitions.delete(p);
    this.participantTieBreakers.delete(p);
    if (this.expandedDeckPanels.has(p)) {
      this.expandedDeckPanels.delete(p);
      this.expandedDeckPanels.add(mp);
    }
    if (this.selectedActor === p) this.selectedActor = mp;
    if (this.actModalParticipant === p) this.actModalParticipant = mp;
    this.combatManager.removeParticipant(p);
    this.combatManager.addParticipant(mp);
    return mp;
  }

  private demoteToParticipant(mp: MatrixParticipant): Participant {
    const p = new Participant();
    const src = mp as unknown as Record<string, unknown>;
    const dst = p as unknown as Record<string, unknown>;
    const baseFields = [
      "_active", "_baseIni", "_diceIni", "_dices", "_edge", "_finished",
      "_name", "_ooc", "_overflowHealth", "_painTolerance", "_physicalDamage",
      "_physicalHealth", "_status", "_stunDamage", "_stunHealth", "_waiting",
      "_hasPainEditor", "_sortOrder"
    ];
    for (const f of baseFields) {
      dst[f] = src[f];
    }
    dst["_actionHistory"] = [];
    const reaction = this.participantReactions.get(mp) ?? 0;
    const intuition = this.participantIntuitions.get(mp) ?? 0;
    p.dices = 1;
    p.baseIni = reaction + intuition;
    const existingId = this.participantIds.get(mp);
    if (existingId) this.participantIds.set(p, existingId);
    const owner = this.participantOwners.get(mp);
    if (owner) this.participantOwners.set(p, owner);
    const claimable = this.participantClaimable.get(mp);
    if (claimable !== undefined) this.participantClaimable.set(p, claimable);
    const edge = this.participantEdgeRatings.get(mp);
    if (edge !== undefined) this.participantEdgeRatings.set(p, edge);
    const reaction2 = this.participantReactions.get(mp);
    if (reaction2 !== undefined) this.participantReactions.set(p, reaction2);
    const intuition2 = this.participantIntuitions.get(mp);
    if (intuition2 !== undefined) this.participantIntuitions.set(p, intuition2);
    const tb = this.participantTieBreakers.get(mp);
    if (tb !== undefined) this.participantTieBreakers.set(p, tb);
    const das = this.declaredActionSelections.get(mp);
    if (das) {
      this.declaredActionSelections.set(p, das);
      this.declaredActionSelections.delete(mp);
    }
    this.participantIds.delete(mp);
    this.participantOwners.delete(mp);
    this.participantClaimable.delete(mp);
    this.participantEdgeRatings.delete(mp);
    this.participantReactions.delete(mp);
    this.participantIntuitions.delete(mp);
    this.participantTieBreakers.delete(mp);
    this.expandedDeckPanels.delete(mp);
    if (this.selectedActor === mp) this.selectedActor = p;
    if (this.actModalParticipant === mp) this.actModalParticipant = p;
    this.combatManager.removeParticipant(mp);
    this.combatManager.addParticipant(p);
    return p;
  }

  private promoteToAstralParticipant(p: IParticipant): AstralParticipant {
    const ap = new AstralParticipant();
    const src = p as unknown as Record<string, unknown>;
    const dst = ap as unknown as Record<string, unknown>;
    const baseFields = [
      "_active", "_baseIni", "_diceIni", "_dices", "_edge", "_finished",
      "_name", "_ooc", "_overflowHealth", "_painTolerance", "_physicalDamage",
      "_physicalHealth", "_status", "_stunDamage", "_stunHealth", "_waiting",
      "_hasPainEditor", "_sortOrder"
    ];
    for (const f of baseFields) {
      dst[f] = src[f];
    }
    dst["_actionHistory"] = [];
    const existingId = this.participantIds.get(p);
    if (existingId) this.participantIds.set(ap, existingId);
    const owner = this.participantOwners.get(p);
    if (owner) this.participantOwners.set(ap, owner);
    const claimable = this.participantClaimable.get(p);
    if (claimable !== undefined) this.participantClaimable.set(ap, claimable);
    const edge = this.participantEdgeRatings.get(p);
    if (edge !== undefined) this.participantEdgeRatings.set(ap, edge);
    const reaction = this.participantReactions.get(p);
    if (reaction !== undefined) this.participantReactions.set(ap, reaction);
    const intuition = this.participantIntuitions.get(p);
    if (intuition !== undefined) this.participantIntuitions.set(ap, intuition);
    const tb = this.participantTieBreakers.get(p);
    if (tb !== undefined) this.participantTieBreakers.set(ap, tb);
    const das = this.declaredActionSelections.get(p);
    if (das) {
      this.declaredActionSelections.set(ap, das);
      this.declaredActionSelections.delete(p);
    }
    this.participantIds.delete(p);
    this.participantOwners.delete(p);
    this.participantClaimable.delete(p);
    this.participantEdgeRatings.delete(p);
    this.participantReactions.delete(p);
    this.participantIntuitions.delete(p);
    this.participantTieBreakers.delete(p);
    if (this.selectedActor === p) this.selectedActor = ap;
    if (this.actModalParticipant === p) this.actModalParticipant = ap;
    this.combatManager.removeParticipant(p);
    this.combatManager.addParticipant(ap);
    return ap;
  }

  private demoteFromAstralParticipant(ap: AstralParticipant): Participant {
    const p = new Participant();
    const src = ap as unknown as Record<string, unknown>;
    const dst = p as unknown as Record<string, unknown>;
    const baseFields = [
      "_active", "_baseIni", "_diceIni", "_dices", "_edge", "_finished",
      "_name", "_ooc", "_overflowHealth", "_painTolerance", "_physicalDamage",
      "_physicalHealth", "_status", "_stunDamage", "_stunHealth", "_waiting",
      "_hasPainEditor", "_sortOrder"
    ];
    for (const f of baseFields) {
      dst[f] = src[f];
    }
    dst["_actionHistory"] = [];
    const reaction = this.participantReactions.get(ap) ?? 0;
    const intuition = this.participantIntuitions.get(ap) ?? 0;
    p.dices = 1;
    p.baseIni = reaction + intuition;
    const existingId = this.participantIds.get(ap);
    if (existingId) this.participantIds.set(p, existingId);
    const owner = this.participantOwners.get(ap);
    if (owner) this.participantOwners.set(p, owner);
    const claimable = this.participantClaimable.get(ap);
    if (claimable !== undefined) this.participantClaimable.set(p, claimable);
    const edge = this.participantEdgeRatings.get(ap);
    if (edge !== undefined) this.participantEdgeRatings.set(p, edge);
    const reaction2 = this.participantReactions.get(ap);
    if (reaction2 !== undefined) this.participantReactions.set(p, reaction2);
    const intuition2 = this.participantIntuitions.get(ap);
    if (intuition2 !== undefined) this.participantIntuitions.set(p, intuition2);
    const tb = this.participantTieBreakers.get(ap);
    if (tb !== undefined) this.participantTieBreakers.set(p, tb);
    const das = this.declaredActionSelections.get(ap);
    if (das) {
      this.declaredActionSelections.set(p, das);
      this.declaredActionSelections.delete(ap);
    }
    this.participantIds.delete(ap);
    this.participantOwners.delete(ap);
    this.participantClaimable.delete(ap);
    this.participantEdgeRatings.delete(ap);
    this.participantReactions.delete(ap);
    this.participantIntuitions.delete(ap);
    this.participantTieBreakers.delete(ap);
    this.expandedAstralPanels.delete(ap);
    if (this.selectedActor === ap) this.selectedActor = p;
    if (this.actModalParticipant === ap) this.actModalParticipant = p;
    this.combatManager.removeParticipant(ap);
    this.combatManager.addParticipant(p);
    return p;
  }

  onMatrixDPChanged(p: IParticipant, value: number): void {
    if (!this.isMatrix(p)) return;
    UndoHandler.StartActions();
    p.dataProcessing = Math.max(1, Number(value || 1));
    p.baseIni = this.getParticipantBaseInitiative(p);
    this.syncSharedState();
  }

  onVRModeChange(p: IParticipant, mode: VRMode): void {
    if (!this.isMatrix(p)) return;
    UndoHandler.StartActions();
    this.applyVRMode(p as MatrixParticipant, mode);
    LogHandler.log(this.currentBTTime, `${p.name} VR mode → ${mode}`);
    this.syncSharedState();
  }

  private applyVRMode(mp: MatrixParticipant, mode: VRMode): void {
    const intuition = this.getParticipantIntuition(mp);
    if (mode === VRMode.AR) {
      mp.vrMode = VRMode.AR;
      const reaction = this.participantReactions.get(mp) ?? 0;
      mp.baseIni = reaction + intuition;
      mp.dices = 1;
      mp.jackedIn = false;
      mp.blocksPhysicalActions = false;
    } else {
      mp.applyJackInMode(mode, intuition);
    }
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
      this.rollAndLogInitiative(participant);
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

  private startSharedLogDecode(index: number, finalText: string) {
    const existingTimer = this.sharedLogDecodeTimers.get(index);
    if (existingTimer !== undefined) {
      window.clearInterval(existingTimer);
      this.sharedLogDecodeTimers.delete(index);
    }
    const decodeDuration = Math.min(1200, Math.max(420, finalText.length * 28));
    const startTime = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / decodeDuration);
      const revealedChars = Math.floor(finalText.length * progress);
      this.sharedLogDecodeText.set(index, this.buildDecodeFrame(finalText, revealedChars));
      if (progress >= 1) {
        window.clearInterval(timer);
        this.sharedLogDecodeTimers.delete(index);
        this.sharedLogDecodeText.delete(index);
      }
    }, 36);
    this.sharedLogDecodeTimers.set(index, timer);
  }

  private ensureLocalLogAnimations() {
    const logCount = this.logHandler.logbook.length;
    if (logCount <= this.observedLocalLogCount) {
      return;
    }
    for (let i = this.observedLocalLogCount; i < logCount; i++) {
      const entry = this.logHandler.logbook[i];
      this.startLocalLogDecode(entry);
    }
    this.observedLocalLogCount = logCount;
  }

  private startLocalLogDecode(entry: LocalLogEntry) {
    const key = this.getLocalLogKey(entry);
    const existingTimer = this.localLogDecodeTimers.get(key);
    if (existingTimer !== undefined) {
      window.clearInterval(existingTimer);
      this.localLogDecodeTimers.delete(key);
    }
    const finalText = entry.text;
    const decodeDuration = Math.min(1200, Math.max(420, finalText.length * 28));
    const startTime = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / decodeDuration);
      const revealedChars = Math.floor(finalText.length * progress);
      this.localLogDecodeText.set(key, this.buildDecodeFrame(finalText, revealedChars));
      if (progress >= 1) {
        window.clearInterval(timer);
        this.localLogDecodeTimers.delete(key);
        this.localLogDecodeText.delete(key);
      }
    }, 36);
    this.localLogDecodeTimers.set(key, timer);
  }

  private buildDecodeFrame(finalText: string, revealedChars: number): string {
    let frame = "";
    for (let i = 0; i < finalText.length; i++) {
      const currentChar = finalText[i];
      if (currentChar === " " || i < revealedChars) {
        frame += currentChar;
      } else if (/[A-Za-z0-9]/.test(currentChar)) {
        frame += this.randomMatrixChar();
      } else {
        frame += currentChar;
      }
    }
    return frame;
  }

  private randomMatrixChar(): string {
    const index = Math.floor(Math.random() * this.matrixChars.length);
    return this.matrixChars[index];
  }

  private getLocalLogKey(entry: LocalLogEntry): string {
    return `${entry.timestamp.getTime()}-${entry.text}`;
  }

  private clearSharedLogDecodeAnimations() {
    for (const timer of this.sharedLogDecodeTimers.values()) {
      window.clearInterval(timer);
    }
    this.sharedLogDecodeTimers.clear();
    this.sharedLogDecodeText.clear();
  }

  private clearLocalLogDecodeAnimations() {
    for (const timer of this.localLogDecodeTimers.values()) {
      window.clearInterval(timer);
    }
    this.localLogDecodeTimers.clear();
    this.localLogDecodeText.clear();
  }

  private scrollLogToBottom() {
    const el = this.gmLogListContainer?.nativeElement;
    if (!el) {
      return;
    }
    el.scrollTop = el.scrollHeight;
  }

  getParticipantInitiativeRollMax(p: IParticipant): number {
    return this.getInitiativeRollMax(p);
  }

  private getInitiativeRollMax(p: IParticipant): number {
    const diceCount = Math.max(1, Number(p.dices || 1));
    return diceCount * 6;
  }

  private clampInitiativeRoll(value: number, p: IParticipant): number {
    const normalized = Math.floor(Number(value) || 0);
    return Math.max(0, Math.min(this.getInitiativeRollMax(p), normalized));
  }

  private enforceParticipantRollBounds() {
    for (const participant of this.combatManager.participants.items) {
      const clamped = this.clampInitiativeRoll(participant.diceIni, participant);
      if (participant.diceIni !== clamped) {
        participant.diceIni = clamped;
      }
    }
  }

}
