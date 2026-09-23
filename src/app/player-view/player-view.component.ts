import { AfterViewChecked, Component, ElementRef, OnDestroy, OnInit, TemplateRef, ViewChild } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { SessionSyncService, SharedCombatState, SharedLogEntry, SharedParticipantState } from "app/services/session-sync.service";
import { NgbModal, NgbModalModule, NgbModalRef, NgbTooltip } from "@ng-bootstrap/ng-bootstrap";
import { ALL_MATRIX_ACTION_NAMES, CYBERDECK_REQUIRED_ACTIONS, DECLARED_ACTIONS, DECLARED_ACTION_DESCRIPTIONS, DeclaredActionCategoryId, DeclaredActionItem, ILLEGAL_OS_ACTIONS } from "app/shared/declared-actions";
import { INTERRUPT_ACTION_META } from "app/shared/interrupt-actions";
import { DiceRollerComponent, DiceRollRequest } from "app/dice-roller/dice-roller.component";
import { DeclaredActionEngine, DeclaredActionSelection, NO_DECLARED_ACTION_PHRASE } from "app/shared/declared-action-engine";
import { buildDecodeFrame, randomMatrixChar, formatLogText, getLogTextClass, formatLogEntryReference } from "app/shared/log-formatter";
import { clampInitiativeRoll, clampRollToBounds, getInitiativeRollMax } from "app/shared/roll-utils";

@Component({
  standalone: true,
  selector: "app-player-view",
  imports: [ CommonModule, FormsModule, NgbModalModule, NgbTooltip, DiceRollerComponent ],
  templateUrl: "./player-view.component.html",
  styleUrls: [ "./player-view.component.css" ]
})
export class PlayerViewComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild("logListContainer") logListContainer?: ElementRef<HTMLElement>;
  @ViewChild("rollModalContent") private rollModalContentTpl?: TemplateRef<unknown>;
  @ViewChild("deltaRollModalContent") private deltaRollModalContentTpl?: TemplateRef<unknown>;
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
  astralConfigExpanded = false;
  dataProcessing = 6;
  attack = 0;
  sleaze = 0;
  firewall = 0;
  deviceRating = 0;
  vrMode = "AR"; // "AR" | "cold-sim" | "hot-sim"
  manualRoll = "";
  pendingDeltaDice = 0;
  manualDeltaRoll = "";
  connected = false;
  /**
   * False while the room exists but no GM socket is in it. Durable rooms make
   * this ordinary - a player can open the link before the GM is back, or long
   * after they closed their laptop - so it is shown rather than refused
   * (spec briefs/persistent-rooms.md, Open Decision 7 / AC 6).
   */
  gmConnected = true;
  error = "";
  state: SharedCombatState | null = null;
  log: SharedLogEntry[] = [];
  promptRoll = false;
  /**
   * The open initiative-roll modal (`briefs/player-initiative-prompt-spec.md`),
   * or `null` when closed. Not dismissible by the player (Xavier's resolved
   * Open Decision 2, 2026-09-15): the only way this becomes `null` is one of
   * this component's own `closeRollModal()` calls, never a backdrop click or
   * Escape (`backdrop: 'static', keyboard: false` below).
   */
  rollModalRef: NgbModalRef | null = null;
  /** Same shape as `rollModalRef`, for the "extra dice" follow-up prompt. */
  deltaRollModalRef: NgbModalRef | null = null;
  /**
   * True from the moment the modal's embedded roller has produced a result
   * until the player presses Done. The `roll_submission` for that result was
   * already sent the instant the dice landed (`onInitiativeRollFromModal`) -
   * this field only holds the modal open so the player actually sees the
   * result, and hides the manual-entry controls / disables the roller's Roll
   * button in the same modal so nothing can be submitted a second time.
   *
   * QA fix round 2 (briefs/player-initiative-prompt-spec.md, "Pressing Roll
   * closes the modal before the dice are seen"): replaces the previous
   * round's timed auto-close, which deferred the close by exactly
   * `DiceRollerComponent.ROLL_ANIMATION_MS` and so closed the modal the
   * instant the animation finished - Xavier hand-tested that and never
   * actually saw the result. There is no timer at all now: only
   * `confirmRollDone()` (the Done button) ends this state, and the explicit
   * external-close paths (`clear_roll_prompt`, `combat_ended`, the turn
   * boundary, session closed, losing/benching the primary character) still
   * win immediately even while this is true - see `syncRollModal()`.
   */
  rollAwaitingDone = false;
  /**
   * The dice total to show in the modal while `rollAwaitingDone` is true -
   * the sum of the values the embedded roller actually produced for this
   * roll. Deliberately not an Initiative Score: the resulting Score is only
   * known once the GM's next broadcast applies the roll, and this component
   * has no reliable base-attribute value to compute it from on its own
   * (brief QA fix round 2: "if the resulting Initiative Score is only known
   * after the GM's next broadcast, show the dice total immediately and do
   * not invent the score"). `null` while no result is being shown.
   */
  rollResultTotal: number | null = null;
  /** Same role as `rollAwaitingDone`, for the delta ("extra dice") modal. */
  deltaRollAwaitingDone = false;
  /** Same role as `rollResultTotal`, for the delta modal. */
  deltaRollResultTotal: number | null = null;
  rollPromptNudge = false;
  notifyMuted = false;
  info = "";
  selectedClaimParticipantId = "";
  /**
   * Which branch of the "Get A Character" chooser is open. Public so tests can
   * set it directly (briefs/player-join-claim-or-create-spec.md, "Component
   * state"). Reset is edge-triggered, never level-triggered - see
   * `applyIncomingState` - so a broadcast mid-form does not close it under the
   * player's fingers.
   */
  joinChoice: "none" | "claim" | "create" = "none";
  /** Edge-detector for the `joinChoice` reset rule in `applyIncomingState`. */
  private hadOwnCharacter = false;
  /**
   * Fix round Item A: a claim/create is fire-and-forget with no ack
   * (`server.js` broadcasts `session:command` with no reply), so the only
   * thing that used to clear the "...request sent" line was a *refused*
   * claim (`claim_denied`). On success nothing ever cleared it, so it sat on
   * screen forever even after the character showed up. This flag tracks
   * "there is a pending-request message on screen" distinctly from `info`
   * itself, which several unrelated messages also use (Reconnected, the
   * released-character notice, "Select a character to claim.") - so the
   * success path can clear *this* message specifically, at the
   * no-character -> has-a-character edge, without risking a different `info`
   * message that happens to be showing at the same moment. Set in
   * `createCharacter()`/`claimSelectedCharacter()`'s success branch; cleared
   * on that ownership edge in `applyIncomingState` and on `claim_denied`.
   */
  private pendingRequestMessage = false;
  /**
   * Fix round Item B: distinguishes "the claim pool has never had anything
   * in it" from "the player had a character selected and it was claimed (or
   * un-claimabled) by someone else while they were still deciding" - the
   * generic "no characters are available" line reads as if there never was
   * one, which is misleading in the second case. Set in `applyIncomingState`
   * when a stale selection is cleared and the pool is now genuinely empty;
   * self-heals the moment anything becomes claimable again (see
   * `claimUnavailableMessage`).
   */
  selectionClaimedAway = false;
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

  /**
   * `npc` comes straight off the broadcast payload, so the dice tray marks a
   * GM roll made for a non-player combatant (Core p. 44) the same way the log entry
   * for the same roll does - the two are on screen together.
   */
  incomingDiceRoll: { roller: string; values: number[]; npc?: boolean } | null = null;
  ownDiceRoll: { values: number[] } | null = null;

  onPlayerDiceRolled(request: DiceRollRequest): void {
    if (!this.connected) return;
    // `rollAs` is never set here: the player view leaves `allowRollAs` off, so
    // a player's roll is always their own (only the GM rolls for NPCs, Core p. 44).
    const values = request.values;
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
    // Fix round (reviewer defect 3): dismiss both roll modals alongside the
    // rest of teardown - `NgbModal`'s window is rendered onto `document.body`,
    // outside this component's own template, so leaving a ref open here would
    // leave the modal mounted on the page after the component itself is gone.
    // Routed through the sync methods (item A) rather than the bare
    // primitives, forced closed since the component is going away regardless
    // of what state currently says.
    this.syncRollModal({ forceClosed: true });
    this.syncDeltaRollModal({ forceClosed: true });
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
      const normalizedRoom = this.room.trim().toUpperCase();
      const { state, log, gmConnected } = await this.session.joinAsPlayer(normalizedRoom, this.playerToken);
      // Decision 6 (briefs/player-room-box-collapse-spec.md): show the
      // player the room code they actually joined, not whatever case/
      // whitespace they typed. Assigned only after the await resolves, so a
      // failed join leaves their typing intact to correct.
      this.room = normalizedRoom;
      this.connected = true;
      this.joinChoice = "none";
      this.gmConnected = gmConnected;
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
          // Item A: every trigger funnels through the one predicate. A
          // straggler who already has the modal open would otherwise get no
          // feedback at all from a repeat request (`openRollModal()` is a
          // no-op once open) - so re-nudge explicitly when that happens.
          //
          // Item 6 (round 3, `briefs/mid-turn-joiner-spec.md`): the per-row
          // "ask this player" control names its one target in
          // `payload.participantId`. `request_rolls` is still a room-wide
          // broadcast either way (batch "Request Player Rolls" sends none),
          // so every client receives every ask - a targeted one that names
          // someone else must not re-chime a straggler whose own modal is
          // already open for an earlier, unrelated ask (round-3 defect 8).
          // `syncRollModal()` itself is unaffected either way - it only ever
          // opens for THIS player's own `askedToRoll`, regardless of who a
          // targeted ask named.
          const targetId = command.payload?.["participantId"] as string | undefined;
          const targetsSomeoneElse = !!targetId && targetId !== this.primaryCharacter?.id;
          const wasAlreadyOpen = !!this.rollModalRef;
          this.syncRollModal();
          if (!targetsSomeoneElse && wasAlreadyOpen && this.rollModalRef) {
            this.triggerRollNudge();
          }
        } else if (command.type === "clear_roll_prompt") {
          this.syncRollModal({ forceClosed: true });
        } else if (command.type === "combat_ended") {
          this.explicitCombatEndedNotice = true;
          this.manualRoll = "";
          this.manualDeltaRoll = "";
          this.closeActPlanner();
          this.syncRollModal({ forceClosed: true });
          this.syncDeltaRollModal({ forceClosed: true });
          this.info = "GM ended combat.";
        } else if (command.type === "claim_denied") {
          // Broadcast like every command, so it must be filtered down to the
          // player who actually asked. A refused claim used to be silent on
          // both screens - the player just kept seeing "Claim request sent."
          if (command.payload?.["requester"] !== this.playerToken) return;
          const reason = String(command.payload?.["reason"] || "the GM refused it");
          const name = String(command.payload?.["characterName"] || "That character");
          this.info = "";
          this.pendingRequestMessage = false;
          this.error = `Could not claim ${name}: ${reason}. Ask the GM to clear the claim, then try again.`;
        } else if (command.type === "dice_roll") {
          if (command.player === this.playerToken) return; // skip echo of our own roll
          const roller = String(command.payload?.["roller"] || command.player || "Unknown");
          const rawValues = command.payload?.["values"];
          const values = Array.isArray(rawValues) ? (rawValues as unknown[]).map(Number) : [];
          if (values.length > 0) {
            this.incomingDiceRoll = { roller, values, npc: !!command.payload?.["npc"] };
          }
        }
      });
      this.session.onGmPresence((payload) => {
        this.gmConnected = payload.connected;
      });
      // A player's socket reconnects on its own after a server restart, but the
      // new socket has no room membership until it re-joins. Players hold no
      // authoritative state, so they always PULL (unlike the GM tab, which
      // pushes - see BattleTrackerComponent.handleSessionReconnected).
      this.session.onReconnect(() => void this.rejoinAfterReconnect());
      this.session.onDisconnect(() => {
        this.gmConnected = false;
        this.info = "Reconnecting to the session server...";
      });
      this.session.onSessionClosed((payload) => {
        this.connected = false;
        this.state = null;
        this.manualDeltaRoll = "";
        this.syncRollModal({ forceClosed: true });
        this.syncDeltaRollModal({ forceClosed: true });
        // Close and End are different actions with different consequences for
        // the player (spec Open Decision 3 / AC 8): a closed room is still on
        // the server under the same code, an ended one is gone. Telling a
        // player "closed" for both sends them hunting for a new code that does
        // not exist, or gives up on a room that is still there.
        const persisted = payload?.persisted !== false;
        this.error = persisted
          ? `GM closed the session. Room ${payload?.room || this.room} is still saved - rejoin with the same code once the GM reopens it.`
          : "GM ended this room. It has been deleted and the code no longer works.";
        this.clearLogDecodeAnimations();
      });
      if (this.ownParticipants.length === 0) {
        this.info = "Choose whether to claim a character the GM has set up, or create a new one.";
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Unable to join room.";
    }
  }

  /**
   * Re-join the room after the transport came back. Pull, not push: the player
   * view has no authoritative combat state of its own.
   */
  private async rejoinAfterReconnect() {
    if (!this.connected || !this.room) {
      return;
    }
    try {
      const { state, log, gmConnected } = await this.session.joinAsPlayer(this.room.trim().toUpperCase(), this.playerToken);
      this.gmConnected = gmConnected;
      this.applyIncomingState(state);
      this.log = log || [];
      this.error = "";
      this.info = "Reconnected.";
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Lost connection to the room.";
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
    // A create/claim request is broadcast with no ack and only the GM tab
    // applies it (spec Open Decision 5); with no GM socket in the room it
    // silently goes nowhere, so the message must not read as confirmed.
    this.info = this.gmConnected
      ? "Create character request sent."
      : "Create character request sent - it will not take effect until the GM is back.";
    // Item A: mark this as the pending-request message so the success edge
    // in `applyIncomingState` knows it is safe to clear.
    this.pendingRequestMessage = true;
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
    this.applyInitiativeRollLogic(this.primaryCharacter.vrMode || "none", this.vrMode);
    this.info = "";
  }

  jackOut() {
    if (!this.primaryCharacter) return;
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
    // RESOLVED, `briefs/mid-turn-joiner-spec.md` ("jack-out now prompts the
    // player", Xavier 2026-09-20): a jack out the player themselves triggers
    // no longer rolls the lost dice automatically. If this character already
    // made this Combat Turn's Initiative Test, the GM tab defers the loss and
    // mirrors it back as `SharedParticipantState.pendingDeltaDice`; the next
    // broadcast's `applyIncomingState()` picks that up and opens the same
    // non-dismissible delta modal a VR-mode-down switch already uses (no
    // optimistic client-side guess here, unlike `applyInitiativeRollLogic()`
    // for a mode switch — jacking out restores this character's own physical
    // dice count, which `diceCountForVrMode()`'s flat AR-is-1-die heuristic
    // cannot predict for an augmented character; waiting for the server's
    // authoritative broadcast avoids duplicating that guess incorrectly).
    // Reset to 0 here only so a stale delta from a *previous*, already-
    // resolved mode switch cannot linger through this transition.
    this.pendingDeltaDice = 0;
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

  enableAstral() {
    this.session.sendCommand({
      type: "configure_astral",
      player: this.playerToken,
      payload: { isAstral: true }
    });
  }

  removeAstral() {
    this.session.sendCommand({
      type: "configure_astral",
      player: this.playerToken,
      payload: { isAstral: false }
    });
    this.astralConfigExpanded = false;
    this.info = "";
  }

  sendAstralProject(project: boolean) {
    this.session.sendCommand({
      type: "configure_astral",
      player: this.playerToken,
      payload: { project }
    });
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
   * Decide whether to: (a) prompt the player to roll delta dice, (b) do a fresh
   * full roll via autoRollForMode, or (c) do nothing (server handled it).
   * Call this after sending the configure_deck command.
   *
   * Fix round 4 (consistency follow-up, `briefs/player-initiative-prompt-spec.md`
   * follow-on brief): a dice *decrease* is prompted exactly like an increase
   * now - `pendingDeltaDice` is signed (positive gained, negative lost) - so
   * the server never rolls a mode-switch loss itself, matching the gain side.
   * Known caveat, reported rather than fixed here (out of the diff's scope,
   * `diceCountForVrMode` predates this change): the heuristic below treats
   * any non-VR target as a flat 1 die, which is wrong for an augmented
   * character switching back to AR with more than 1 physical Initiative Die.
   * This is an optimistic, client-only guess anyway - `applyIncomingState()`
   * below overwrites it with the server's authoritative signed delta as soon
   * as that broadcast arrives - but a player who rolls before the correction
   * lands could briefly see the wrong dice count.
   */
  private applyInitiativeRollLogic(oldMode: string, newMode: string): void {
    const actor = this.primaryCharacter;
    const combatActive = this.state?.started === true;
    const alreadyRolled = actor && !actor.pendingRoll;
    if (combatActive && alreadyRolled) {
      // Already rolled this pass: only handle the dice delta, gained or lost.
      const oldDices = this.diceCountForVrMode(oldMode);
      const newDices = this.diceCountForVrMode(newMode);
      const delta = newDices - oldDices;
      if (delta !== 0) {
        // Gained or lost dice: show the prompt so the player rolls exactly
        // the dice that changed, in either direction.
        this.pendingDeltaDice = delta;
        this.syncDeltaRollModal();
      }
    }
    // Not in combat or haven't rolled yet: server already updated dices/baseIni.
    // The player will roll via the normal promptRoll mechanism — don't auto-roll here.
  }

  /**
   * Number of dice the delta modal shows/rolls - always positive, the
   * magnitude of the signed `pendingDeltaDice` (fix round 4).
   */
  get deltaDiceCount(): number {
    return Math.abs(this.pendingDeltaDice);
  }

  /** True when the outstanding delta is dice *lost* (fix round 4). */
  get isDeltaLoss(): boolean {
    return this.pendingDeltaDice < 0;
  }

  /** Submit a manually-entered initiative delta roll. */
  submitDeltaRoll() {
    const actor = this.primaryCharacter;
    if (!actor || !this.pendingDeltaDice) return;
    const raw = Number(this.manualDeltaRoll);
    if (Number.isNaN(raw) || raw < 1) return;
    const clamped = Math.min(raw, this.deltaDiceCount * 6);
    this.session.sendCommand({
      type: "roll_submission",
      player: this.playerToken,
      payload: { participantId: actor.id, roll: clamped, isDelta: true }
    });
    // Item A: force-closed rather than waiting for the confirming broadcast -
    // this submission has already resolved it. Also lets a deferred main
    // modal (item C, no stacking) open immediately if one was owed underneath.
    this.syncDeltaRollModal({ forceClosed: true });
    this.syncRollModal();
  }

  /**
   * The embedded dice roller inside the delta-roll modal emits this once it
   * has animated a roll (spec AC 8) - the same-style replacement for the old
   * inline "Auto Roll" button as `onInitiativeRollFromModal` is for the main
   * prompt, scoped to the delta's own dice count and no clamp beyond it (the
   * roller is locked to exactly `pendingDeltaDice` dice via `fixedDiceCount`,
   * so there is no over-roll to clamp).
   *
   * QA fix round (briefs/player-initiative-prompt-spec.md):
   * - No more `dice_roll` broadcast, and no more echo onto the page-level
   *   roller (`ownDiceRoll`) - that broadcast is what let the GM log a
   *   second, generic roll line for what is really one initiative roll, and
   *   let other players' own rollers animate this roll in their "Other
   *   Players" tray. `roll_submission` alone already produces the correct
   *   log line. Accepted consequence: other players no longer see this
   *   character's delta roll animate anywhere on their own screen.
   * - The submission is still sent immediately, exactly once, same as
   *   before. QA fix round 2: the modal's closing is no longer deferred by a
   *   timer at all - it now stays open showing the rolled total until the
   *   player presses Done (`confirmDeltaRollDone()`).
   */
  onDeltaRollFromModal(request: DiceRollRequest): void {
    const actor = this.primaryCharacter;
    if (!actor || !this.pendingDeltaDice) {
      return;
    }
    const values = request.values;
    const diceSum = values.reduce((s, v) => s + v, 0);
    this.session.sendCommand({
      type: "roll_submission",
      player: this.playerToken,
      payload: { participantId: actor.id, roll: diceSum, diceValues: values, diceSum, isDelta: true }
    });
    this.deltaRollResultTotal = diceSum;
    this.deltaRollAwaitingDone = true;
  }

  claimSelectedCharacter() {
    this.info = "";
    // Clear any previous denial so a retry after the GM cleared the claim does
    // not leave a stale "could not claim" on screen.
    this.error = "";
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
    // Same no-ack, GM-absent caveat as `createCharacter()` above.
    this.info = this.gmConnected
      ? "Claim request sent."
      : "Claim request sent - it will not take effect until the GM is back.";
    // Item A: same pending-request marker as `createCharacter()`.
    this.pendingRequestMessage = true;
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
    this.manualRoll = "";
    // Item A: force-closed rather than waiting for the confirming broadcast.
    // Also lets a deferred delta modal (item C, no stacking) open right away
    // if one was owed underneath (not expected in practice for the main
    // roll - `pendingDeltaDice` is only ever armed after a character has
    // already rolled - but harmless and correct either way).
    this.syncRollModal({ forceClosed: true });
    this.syncDeltaRollModal();
  }

  /**
   * The embedded dice roller inside the initiative-roll modal emits this
   * once it has animated a roll (spec AC 2). Replaces the old inline
   * "Auto Roll" button, which rolled its own random values rather than using
   * `DiceRollerComponent` - this handler is that button's replacement, wired
   * to the shared roller's own result instead of generating a second,
   * separate set of values.
   *
   * QA fix round (briefs/player-initiative-prompt-spec.md):
   * - No more `dice_roll` broadcast, and no more echo onto the page-level
   *   roller (`ownDiceRoll`). That broadcast is what let the GM log a
   *   second, generic roll line for what is really one initiative roll (the
   *   correct line already comes from `roll_submission` alone), and let
   *   other players' own rollers animate this roll in their "Other Players"
   *   tray. Accepted consequence: other players no longer see someone
   *   else's initiative dice animate in their own roller.
   * - The submission is still sent immediately, exactly once. QA fix round
   *   2: the modal's closing is no longer deferred by a timer at all - it
   *   now stays open showing the rolled total until the player presses Done
   *   (`confirmRollDone()`), so the dice and the result are actually seen
   *   rather than vanishing the instant the animation ends.
   */
  onInitiativeRollFromModal(request: DiceRollRequest): void {
    const actor = this.primaryCharacter;
    if (!actor) {
      return;
    }
    const values = request.values;
    const diceSum = values.reduce((s, v) => s + v, 0);
    const roll = this.clampInitiativeRoll(diceSum, actor.initiativeDice);

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
    this.manualRoll = "";
    this.rollResultTotal = diceSum;
    this.rollAwaitingDone = true;
  }

  /**
   * The player has seen the settled result and pressed Done - the only way
   * this modal closes after an on-screen roll (Xavier's decision, QA fix
   * round 2, `briefs/player-initiative-prompt-spec.md`: "the Done button
   * only closes the window"). The `roll_submission` itself already went out
   * the instant the dice landed, in `onInitiativeRollFromModal` above - this
   * only ends the "waiting to be acknowledged" state, through the same
   * `syncRollModal({ forceClosed: true })` path every other close uses, and
   * lets a deferred delta modal open right away if one was owed underneath
   * (same as every other close path here always has).
   */
  confirmRollDone(): void {
    this.rollAwaitingDone = false;
    this.rollResultTotal = null;
    this.syncRollModal({ forceClosed: true });
    this.syncDeltaRollModal();
  }

  /** Same role as `confirmRollDone()`, for the delta ("extra dice") modal. */
  confirmDeltaRollDone(): void {
    this.deltaRollAwaitingDone = false;
    this.deltaRollResultTotal = null;
    this.syncDeltaRollModal({ forceClosed: true });
    this.syncRollModal();
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

  /**
   * Low-level primitive: opens the modal window, unless it is already open.
   * The guard is load-bearing, not cosmetic - `syncRollModal()` (the only
   * caller, fix round 2 item A) calls this on every trigger, including
   * ordinary broadcasts unrelated to rolling, so without it those would
   * re-open (and re-chime, if it also called `triggerRollNudge()`
   * unconditionally) a modal the player is already looking at.
   *
   * NOT called from anywhere else. Every open/close decision in this
   * component goes through `syncRollModal()` so there is exactly one place
   * that decides "should this be showing" - see that method's doc comment.
   */
  private openRollModal(): void {
    if (this.rollModalRef || !this.rollModalContentTpl) {
      return;
    }
    this.rollModalRef = this.modalService.open(this.rollModalContentTpl, {
      backdrop: "static",
      keyboard: false,
      centered: true,
      // Fix round (reviewer defect 4): the embedded roller (including its
      // "Other Players" roll list) can be taller than a small phone screen.
      // `scrollable: true` makes the modal *body* scroll internally rather
      // than the whole page, so the Roll button and manual-entry field stay
      // reachable instead of being pushed off past the bottom of the
      // viewport.
      scrollable: true
    });
    // Nothing ever calls `.close()`/`.dismiss()` except this component, but a
    // dismissed `NgbModalRef.result` still rejects - swallow it so that
    // rejection never surfaces as an unhandled promise rejection.
    this.rollModalRef.result.catch(() => { /* closed programmatically only */ });
    this.rollAwaitingDone = false;
    this.rollResultTotal = null;
    this.triggerRollNudge();
  }

  /**
   * Closing for any reason - the Done button, or a close arriving from
   * elsewhere (GM force-rolls, `clear_roll_prompt`, combat ends, the
   * character goes ooc) even while a result is still showing, waiting for
   * Done - always clears `rollAwaitingDone`/`rollResultTotal` too, so a
   * modal reopened later never starts back up mid-result from stale state
   * (QA fix round 2, briefs/player-initiative-prompt-spec.md).
   */
  private closeRollModal(): void {
    this.rollAwaitingDone = false;
    this.rollResultTotal = null;
    if (this.rollModalRef) {
      this.rollModalRef.dismiss();
    }
    this.rollModalRef = null;
  }

  /**
   * Same shape as `openRollModal()`, for the "extra dice" follow-up prompt.
   * NOT called from anywhere but `syncDeltaRollModal()` - see that method.
   */
  private openDeltaRollModal(): void {
    if (this.deltaRollModalRef || !this.deltaRollModalContentTpl) {
      return;
    }
    this.deltaRollModalRef = this.modalService.open(this.deltaRollModalContentTpl, {
      backdrop: "static",
      keyboard: false,
      centered: true,
      // Fix round (reviewer defect 4): same scrolling fix as the main roll
      // modal above.
      scrollable: true
    });
    this.deltaRollModalRef.result.catch(() => { /* closed programmatically only */ });
    this.deltaRollAwaitingDone = false;
    this.deltaRollResultTotal = null;
    this.triggerRollNudge();
  }

  /** Same reasoning as `closeRollModal()`, for the delta modal. */
  private closeDeltaRollModal(): void {
    this.deltaRollAwaitingDone = false;
    this.deltaRollResultTotal = null;
    if (this.deltaRollModalRef) {
      this.deltaRollModalRef.dismiss();
    }
    this.deltaRollModalRef = null;
  }

  /**
   * The single place that decides "should the main roll modal be showing"
   * (fix round 2, item A) - every trigger in this component funnels through
   * here instead of calling `openRollModal()`/`closeRollModal()` itself:
   * `request_rolls`, `clear_roll_prompt`, `combat_ended`, incoming state
   * (join/reconnect/every later broadcast), and session closed.
   *
   * The rule (item A, fix round: "Request Player Rolls produced nothing";
   * redesigned per-person by `briefs/mid-turn-joiner-spec.md`'s validation
   * round 2, also item A): the player has a primary character, that
   * character still owes a roll (`pendingRoll`), it is not `ooc`, and the GM
   * has specifically asked THIS character (`primaryCharacter.askedToRoll`) -
   * so adding a player-owned character mid-fight, or undoing a submitted
   * roll, can never pop this open on its own the way it used to when the
   * rule was `pendingRoll` alone, and asking a DIFFERENT player can never
   * pop this one open either (the table-wide `state.rollsRequested` switch
   * this replaced could not tell the two apart). This does
   * NOT require `combatManager.started` - the GM requests rolls during
   * initiative prep, before the Combat Turn itself begins, so gating on
   * `started` made the modal unopenable at the moment it is actually
   * requested (see `syncRollModal()`'s own inline comment below).
   *
   * `options.forceClosed` is how a caller that already knows the answer
   * (a just-submitted roll, `combat_ended`, session closed, `ngOnDestroy`)
   * closes it without waiting for a round-trip broadcast to confirm
   * `pendingRoll: false` - still through this one function, never a bare
   * `closeRollModal()` call.
   *
   * Item C (no stacking): never opens while the delta modal is open: the
   * delta prompt survives being deferred a moment (`syncRollModal()` is
   * called again the moment the delta modal closes, from
   * `syncDeltaRollModal()`).
   *
   * QA fix round 2 (`rollAwaitingDone` carve-out): once the player has
   * actually rolled in this modal and it is showing the settled result
   * waiting for Done, an ordinary broadcast reporting `pendingRoll: false` -
   * exactly what happens the moment the GM's side applies the very roll this
   * player just sent - must NOT auto-close the modal out from under a result
   * the player has not acknowledged yet; only the Done button
   * (`confirmRollDone()`) and the explicit external-close paths (which all
   * already call this with `forceClosed: true`, or drop/bench the primary
   * character - both checked below before this carve-out applies) end it.
   * Verified against the brief's own list of what must still win immediately
   * even mid-result: `clear_roll_prompt`, `combat_ended` and session-closed
   * all pass `forceClosed: true` directly; the turn boundary passes
   * `forceClosed: turnJustEnded`; going `ooc` or losing the primary
   * character both fall through to the ordinary `shouldShow` computation
   * below, which is `false` either way. The one item on that list this
   * carve-out cannot special-case is a GM "Force Roll Outstanding" landing
   * on a participant who has *already* rolled and is sitting in this exact
   * state - reported, not solved, in the QA report: the GM only ever rolls
   * for participants still reporting `pendingRoll: true` server-side
   * (unchanged, GM-side, out of scope for this brief), and this
   * participant's own submission has already cleared that, so the two
   * requirements do not actually conflict in the reachable state space today.
   */
  private syncRollModal(options: { forceClosed?: boolean } = {}): void {
    const pc = this.primaryCharacter;
    const askedToRoll = pc?.askedToRoll === true;
    if (!options.forceClosed && this.rollAwaitingDone && pc && !pc.ooc) {
      this.promptRoll = true;
      if (!this.rollModalRef) {
        // Should not normally happen (the modal that produced this result is
        // still the one open) - defensive only, mirrors the same guard
        // `openRollModal()` always applies.
        this.openRollModal();
      }
      return;
    }
    // Fix round (regression: "Request Player Rolls produced nothing"):
    // `started` used to gate this predicate, but the GM requests rolls
    // during initiative PREP - before the Combat Turn actually begins
    // (`BattleTrackerComponent.btnStartRound_Click()` sets
    // `initiativePrepActive = true` and calls `requestPlayerRolls()`, then
    // defers `beginCombatTurn()` - the only place that sets
    // `combatManager.started = true` - until every roll is in). Gating on
    // `started` meant the modal could never open at the one moment it is
    // actually requested. The rule is now just: the player has a primary
    // character, that character still owes a roll, it is not `ooc`, and the
    // GM has specifically asked this character. `beginCombatTurn()` clears
    // every "asked" record GM-side at the moment the turn begins, so this
    // predicate still closes the prompt right on schedule without needing
    // `started` at all.
    const shouldShow = !options.forceClosed
      && askedToRoll
      && pc?.pendingRoll === true
      && !pc?.ooc;
    this.promptRoll = shouldShow;
    if (shouldShow) {
      if (!this.deltaRollModalRef) {
        this.openRollModal();
      }
      // else: deferred behind the delta modal. `submitDeltaRoll()`/
      // `onDeltaRollFromModal()` call this method again right after closing
      // the delta modal, so a main-modal roll that was owed the whole time
      // opens the instant the delta one is out of the way.
    } else {
      this.closeRollModal();
    }
  }

  /**
   * Same role as `syncRollModal()`, for the "extra dice" follow-up prompt
   * (fix round 2, items A and C). `pendingDeltaDice` itself is set by the two
   * callers that know its value - `applyInitiativeRollLogic()` right after a
   * VR mode switch (the immediate, optimistic case) and `applyIncomingState()`
   * from `primaryCharacter.pendingDeltaDice` (item D: the reconnect/refresh
   * case, recovered from state instead of lost) - this method only decides
   * whether that count is currently eligible to be shown.
   *
   * Eligibility does not require `pendingDeltaDice !== 0` to *close* it: losing
   * the primary character, going `ooc`, or combat ending must close this
   * modal even if a stale nonzero count is still sitting in the field (the
   * old code's explicit `(!pc || pc.ooc)` close-guard, generalised here to
   * also cover `!started`). `pendingDeltaDice` is signed since fix round 4
   * (consistency follow-up) - positive gained, negative lost - so eligibility
   * checks it is nonzero, not merely positive.
   *
   * QA fix round 2: unlike `syncRollModal()`, this method needs no explicit
   * `deltaRollAwaitingDone` carve-out to stay open while the delta modal is
   * showing a settled result. `applyIncomingState()`'s own stale-wire-0
   * guard (see its comment on `incomingDeltaDice`) already refuses to zero
   * `this.pendingDeltaDice` from an incoming broadcast while
   * `deltaRollModalRef` is still set and `isMatrix` stays `true` - which is
   * exactly the state this modal is in while awaiting Done - so
   * `pendingDeltaDice` simply never goes stale-zero out from under it before
   * `confirmDeltaRollDone()` explicitly closes it. Only `confirmDeltaRollDone()`
   * and the same external-close paths as the main modal end this state.
   */
  private syncDeltaRollModal(options: { forceClosed?: boolean } = {}): void {
    const pc = this.primaryCharacter;
    const started = this.state?.started === true;
    const eligible = started && !!pc && !pc.ooc;
    const shouldShow = !options.forceClosed && eligible && this.pendingDeltaDice !== 0;
    if (shouldShow) {
      if (!this.rollModalRef) {
        this.openDeltaRollModal();
      }
      // else: deferred behind the main modal. `submitManualRoll()`/
      // `onInitiativeRollFromModal()` call this method again right after
      // closing the main modal, so a delta prompt that was owed the whole
      // time opens the instant the main one is out of the way.
    } else {
      this.pendingDeltaDice = 0;
      this.manualDeltaRoll = "";
      this.closeDeltaRollModal();
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
    const illegalActions = allSelected.filter(name => ILLEGAL_OS_ACTIONS.has(name));
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

  /**
   * Every participant currently on the wire, in broadcast order.
   *
   * The one source both the initiative list and the claim/ownership lists
   * used to share (`visibleParticipants`) until a claimable out-of-action
   * participant could be on the wire at all (GM decision, durable-rooms
   * follow-up: a player must be able to reclaim their character while it is
   * out of action). Those are two different questions now - "is this in the
   * initiative order" and "can this be claimed/does this player own it" - so
   * they read from different getters below rather than one list serving both.
   */
  private get allParticipants(): SharedParticipantState[] {
    return [ ...(this.state?.participants || []) ].sort((a, b) => a.order - b.order);
  }

  /**
   * The initiative order as shown at the table. Out-of-action participants
   * are never in the initiative order (they cannot act, brief requirement:
   * "a downed character must NOT appear in the initiative order on the
   * player view") - the one claimable-OOC exception to `SharedParticipantState`
   * being on the wire at all does not change that; it is still excluded here
   * and only reachable through `ownParticipants`/`unclaimedParticipants` below.
   */
  get visibleParticipants(): SharedParticipantState[] {
    return this.allParticipants.filter(p => !p.ooc);
  }

  /**
   * Characters this player owns, out of action or not - so a returning
   * player sees they still hold a downed character rather than believing
   * they lost it. Reads from `allParticipants`, not `visibleParticipants`:
   * an owned character does not stop being "this player's" just because it
   * left the initiative order.
   */
  get ownParticipants(): SharedParticipantState[] {
    const player = this.playerToken.toLowerCase();
    return this.allParticipants.filter(p => (p.ownerName || "").toLowerCase() === player);
  }

  /**
   * Claimable, unowned characters - including a claimable character that is
   * currently out of action, so a returning player can reclaim one that went
   * down while they were away. Reads from `allParticipants` for the same
   * reason as `ownParticipants`.
   */
  get unclaimedParticipants(): SharedParticipantState[] {
    return this.allParticipants.filter(p => p.claimable === true && !p.ownerName);
  }

  get primaryCharacter(): SharedParticipantState | null {
    return this.ownParticipants.length > 0 ? this.ownParticipants[0] : null;
  }

  /** Whether there is anything the "Claim a Character" button can offer. */
  get canClaimAnything(): boolean {
    return this.unclaimedParticipants.length > 0;
  }

  /**
   * Item B (fix round): the line shown wherever the claim pool is empty -
   * under the disabled chooser button and inside the claim panel itself.
   * Distinguishes "nothing has ever been claimable" from "the one you had
   * picked was just claimed by someone else" so a player is not told there
   * was never anything there when in fact their pick was taken out from
   * under them.
   */
  get claimUnavailableMessage(): string {
    return this.selectionClaimedAway
      ? "The character you selected was just claimed by someone else - ask the GM if another one opens up."
      : "No characters are available to claim yet - ask the GM to make one claimable.";
  }

  chooseClaim(): void {
    this.joinChoice = "claim";
    this.error = "";
    this.info = "";
  }

  chooseCreate(): void {
    this.joinChoice = "create";
    this.error = "";
    this.info = "";
  }

  backToJoinChoice(): void {
    this.joinChoice = "none";
    this.selectedClaimParticipantId = "";
    this.info = "";
    this.error = "";
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

  /**
   * The line a GM-narration entry shows to name the roll it is about. The log
   * is a flat list, so unrelated entries routinely land between a roll and its
   * narration; the reference restates the parent roll's actor and hit/glitch
   * summary so the link does not depend on the two being adjacent.
   */
  getLogEntryReference(entry: SharedLogEntry): string {
    if (entry.refSummary) {
      return entry.refSummary;
    }
    if (!entry.refId) {
      return "";
    }
    const parent = this.log.find(e => e.id === entry.refId);
    return parent ? formatLogEntryReference(parent.actor, parent.text) : "";
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
    return DeclaredActionEngine.buildDeclaredActionLog(this.declaredActionSelection) ?? NO_DECLARED_ACTION_PHRASE;
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

  /**
   * Characters this player owned in the *previous* state that are still in the
   * encounter but no longer owned by anybody.
   *
   * The GM can clear a claim (`btnReleaseClaim_Click`), and the server clears
   * one when a player's socket drops. Until now the only
   * symptom on the player's screen was their whole character panel vanishing
   * with no explanation - the same silence `claim_denied` fixed for a refused
   * claim. A participant that has *left* the encounter is deliberately not
   * reported here: that is a removal, not a release, and this message would tell
   * the player to re-claim something that no longer exists.
   */
  private findReleasedOwnCharacters(next: SharedCombatState | null): string[] {
    const previouslyOwned = this.ownParticipants;
    if (previouslyOwned.length === 0) {
      return [];
    }
    const incoming = next?.participants || [];
    const released: string[] = [];
    for (const mine of previouslyOwned) {
      const now = incoming.find(p => p.id === mine.id);
      if (now && !now.ownerName) {
        released.push(now.name || mine.name || "your character");
      }
    }
    return released;
  }

  private applyIncomingState(next: SharedCombatState | null) {
    const started = Boolean(next?.started);
    // Fix round (regression: dropping `started` from `syncRollModal()`'s own
    // predicate): captured here, before `this.state` is reassigned, so the
    // later unconditional `syncRollModal()` call further down (item A's
    // reconnect-safe re-derivation) can tell "the Combat Turn just ended in
    // THIS broadcast" apart from an ordinary mid-turn update. Without this,
    // a broadcast that both ends the turn (`started: true -> false`) and
    // still carries this character as stale-`askedToRoll: true`/`pendingRoll: true` left
    // over from the turn that just ended (e.g. a request the GM made
    // mid-turn for a late joiner who never got to roll before the turn
    // happened to end) would force-close the modal here only to have the
    // later unconditional call reopen it immediately, in the same broadcast
    // - `syncRollModal()` no longer has `started` itself to refuse that
    // reopen. Any such stale request belongs to the turn that just ended and
    // is moot the moment `started` goes false - a genuine new request for
    // the next turn's prep only ever arrives on a LATER, separate broadcast
    // (once the GM calls `requestPlayerRolls()` again), which this flag does
    // not suppress.
    const turnJustEnded = this.lastKnownCombatStarted && !started;
    if (turnJustEnded) {
      this.manualRoll = "";
      this.manualDeltaRoll = "";
      this.closeActPlanner();
      // `this.state` still holds the *previous* broadcast here - `next` is
      // assigned to it a few lines down - but `started` is already `false`
      // for the purpose of both sync methods' predicates, so passing
      // `forceClosed` sidesteps relying on that not-yet-applied assignment.
      this.syncRollModal({ forceClosed: true });
      this.syncDeltaRollModal({ forceClosed: true });
      if (!this.explicitCombatEndedNotice) {
        this.info = "Combat turn complete. Waiting for GM to start the next combat turn.";
      }
    }
    if (started) {
      this.explicitCombatEndedNotice = false;
      if (this.info === "Combat turn complete. Waiting for GM to start the next combat turn." || this.info === "GM ended combat.") {
        this.info = "";
      }
    }
    const isFirstState = this.state === null;
    const releasedNames = this.findReleasedOwnCharacters(next);
    this.state = next;
    if (releasedNames.length > 0) {
      this.error = "";
      const names = releasedNames.join(", ");
      this.info = `The GM released ${names} - ${releasedNames.length === 1 ? "it is" : "they are"} `
        + "free again. Tap Claim a Character to take control back.";
    }
    // Edge-triggered, never level-triggered (spec "Reset rules"): only reset
    // the chooser on the owned -> unowned transition, or a mid-form player
    // would lose their branch on every unrelated broadcast (the GM sorting
    // the order, damage changing, etc. - `applyIncomingState` runs on every
    // one of those).
    const ownsNow = this.ownParticipants.length > 0;
    if (this.hadOwnCharacter && !ownsNow) {
      this.joinChoice = "none";
      this.selectedClaimParticipantId = "";
    }
    // Item A (fix round): the opposite edge from the one above - no character
    // -> now holding one. This is exactly when a claim/create the player sent
    // has landed, so the "...request sent" line is stale and must go. Gated
    // on `pendingRequestMessage`, not cleared unconditionally, so an
    // unrelated `info` message showing at the same moment (there is none
    // that can share this edge today, but the flag is what makes that safe
    // rather than coincidental) is never at risk.
    if (!this.hadOwnCharacter && ownsNow && this.pendingRequestMessage) {
      this.info = "";
      this.pendingRequestMessage = false;
    }
    this.hadOwnCharacter = ownsNow;
    // A selected-but-not-yet-submitted claim can go stale mid-branch - another
    // player claims it first, or the GM un-marks it claimable - between two
    // broadcasts. Left alone, the dropdown collapses to "Select character" but
    // the id stays selected, so a stale tap on Claim would still fire a real
    // `claim_character` the GM can only answer with `claim_denied` (defect D2,
    // briefs/player-join-claim-or-create-spec.md fix round). Clearing it here
    // does not bounce the player off the claim branch - `canClaimAnything`
    // gating the Claim button covers the rest.
    if (this.selectedClaimParticipantId
      && !this.unclaimedParticipants.some(p => p.id === this.selectedClaimParticipantId)) {
      // Item B (fix round): only worth recording as "taken from under you"
      // when the pool is now genuinely empty - if other unclaimed characters
      // remain, the dropdown just falls back to "Select character" and the
      // unavailable line never renders at all, so there is nothing to
      // distinguish.
      this.selectionClaimedAway = this.unclaimedParticipants.length === 0;
      this.selectedClaimParticipantId = "";
    }
    // Self-heals the moment anything is claimable again, the same way the
    // Claim button itself re-enables with no player interaction (AC 9).
    if (this.unclaimedParticipants.length > 0) {
      this.selectionClaimedAway = false;
    }
    this.lastKnownCombatStarted = started;
    // Restore deck fields from server state (survives reconnect/claim).
    const pc = this.primaryCharacter;
    // Item A / reconnect fix (spec Open Decision 1, resolved yes):
    // `applyIncomingState` runs on every broadcast - reconnect, refresh, late
    // join, or an ordinary mid-turn update - so `syncRollModal()` re-derives
    // "should the roll modal be open" from the authoritative,
    // reconnect-safe `pendingRoll`/`ooc`/`askedToRoll` fields every single
    // time, rather than trusting the one-shot `promptRoll` a missed
    // `request_rolls` command would never have set. The predicate's `else`
    // path is what satisfies Open Decision 2's non-`clear_roll_prompt` close
    // cases: it fires the moment the server reports `pendingRoll: false` for
    // any reason (a manual roll entered on the GM's own screen, or "Force
    // Roll Outstanding" - verified: `rollAndLogInitiative` sets `diceIni` to
    // the rolled total before the next broadcast, so `pendingRoll`
    // (`diceIni <= 0`) is already `false` in the same state this method
    // receives), or the player having no primary character at all.
    // `syncRollModal()` is idempotent, so a broadcast that changes nothing
    // about rolling is a no-op here.
    //
    // Item B closes the "known caveat" the original spec asked to be
    // reported, not solved: `pendingRoll` is `diceIni <= 0`, already `true`
    // for every participant the instant a new Combat Turn starts
    // (`softReset()` zeroes `diceIni`) - before the GM has clicked "Request
    // Player Rolls". `primaryCharacter.askedToRoll` (cleared for everyone at
    // the top of the GM's `beginCombatTurn()`) means that no longer opens
    // this modal on its own -
    // see `syncRollModal()`'s own doc comment for the full rule.
    //
    // Fix round (reviewer defect 1, "Out-of-combat trap"): `pendingRoll` is
    // just `diceIni <= 0` (`ARCHITECTURE.md` §1/§7) and is computed without
    // regard to `ooc` - the GM marking this participant's primary character
    // out of combat before it rolls (`btnLeaveCombat_Click`/`ooc`) does not
    // touch `diceIni`, so `pendingRoll` stays `true` and, left unguarded, the
    // non-dismissible modal would never close. `syncRollModal()`'s own
    // `!pc?.ooc` term is what covers this.
    //
    // `turnJustEnded` (captured above, before `this.state` was reassigned):
    // forces this call closed rather than letting it re-derive normally when
    // this exact broadcast is the one ending the Combat Turn - otherwise a
    // stale `askedToRoll`/`pendingRoll` left over from the turn that just
    // ended would reopen the modal this same tick, immediately undoing the
    // force-close above. See that comment for the full reasoning.
    this.syncRollModal({ forceClosed: turnJustEnded });
    // Item D: recover the delta prompt from state instead of only from the
    // live `applyInitiativeRollLogic()` event path, so a refresh mid-delta-
    // roll does not lose it. Only ever adopts a *nonzero* incoming value,
    // never lowers it to a stale wire `0` while the delta modal is already
    // open locally - `syncDeltaRollModal()`'s own eligibility check (`!pc ||
    // pc.ooc || !started`) is what actually forces it closed when that is
    // warranted, independent of the count. Fix round 4 (consistency
    // follow-up): `pendingDeltaDice` is signed - positive gained, negative
    // lost - so a nonzero incoming value is trusted in *either* direction,
    // not only a positive one; this also lets the server's authoritative
    // value correct this client's own optimistic guess (see
    // `applyInitiativeRollLogic()`'s doc comment) if the two disagree.
    const incomingDeltaDice = pc?.pendingDeltaDice ?? 0;
    if (incomingDeltaDice !== 0) {
      this.pendingDeltaDice = incomingDeltaDice;
    } else if (!this.deltaRollModalRef || pc?.isMatrix !== true) {
      // Fix round 3 (briefs/player-initiative-prompt-spec.md,
      // `participantPendingDeltaDice` defect class): the `!this.deltaRollModalRef`
      // guard alone protects the ordinary race (this client's own optimistic
      // gain racing an unconfirmed broadcast, still `isMatrix: true` the whole
      // time - see the "stale wire 0" test below) but must NOT also protect a
      // stale note stranded by the GM converting this participant away from a
      // Matrix persona entirely (`promoteToAstralParticipant`/
      // `promoteToMatrixParticipant`/`demoteFromAstralParticipant`, GM-side
      // fix, same round): once the wire's `isMatrix` is no longer `true`,
      // `pendingDeltaDice` cannot mean anything (it is a VR-mode-only
      // concept), so a wire `0` is trusted even with the modal still open -
      // otherwise this non-dismissible modal would stay open forever with an
      // obsolete count, and submitting it would add a stale roll straight
      // onto whatever participant now holds this id.
      this.pendingDeltaDice = 0;
    }
    this.syncDeltaRollModal();
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
    if (pc?.isAstral && isFirstState) {
      this.astralConfigExpanded = true;
    }
  }
}
