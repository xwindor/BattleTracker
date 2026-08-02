import { AfterViewChecked, Component, OnInit, OnDestroy, ChangeDetectorRef, TemplateRef, ViewChild, ElementRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { NgbNavModule, NgbDropdownModule, NgbModal, NgbModalRef, NgbTooltip } from "@ng-bootstrap/ng-bootstrap";
import { Subscription } from "rxjs";
import { Undoable, UndoHandler } from "Common";
import { CombatManager, StatusEnum, BTTime, IParticipant } from "Combat";
import {
  Participant, PARTICIPANT_BASE_BACKING_FIELDS, MIN_DISPLAYED_DICE_TOTAL,
  PHYSICAL_INITIATIVE_DICE, DiceCountChangeResult, NO_DICE_COUNT_CHANGE,
  clampInitiativeDiceCount, rollInitiativeDie, INITIATIVE_PASS_DECAY
} from "Combat/Participants/Participant";
import { LogHandler } from "Logging";
import { Action } from "Interfaces/Action";
import { FormsModule } from '@angular/forms';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import ActionHandler from "Combat/ActionHandler";
import { ConditionMonitorComponent } from "app/condition-monitor/condition-monitor.component";
import { ConfirmationDialogService } from 'app/confirmation-dialog/confirmation-dialog.service';
import { DiceRollerComponent, DiceRollRequest } from "app/dice-roller/dice-roller.component";
import { SessionCommand, SessionSyncService, SharedCombatState, SharedLogEntry, SharedParticipantState } from "app/services/session-sync.service";
import { MatrixStateService } from "app/services/matrix-state.service";
import { OsTrackingService } from "app/services/os-tracking.service";
import { MatrixParticipant, VRMode } from "Matrix";
import { AstralParticipant, ASTRAL_PROJECTION_DICE_DELTA } from "Magic";
import { GruntMember, NpcRowParticipant, isNpcRow } from "Grunts";
import type { GruntDamageType } from "Grunts";
import { MatrixParticipantBadgeComponent } from "app/matrix/matrix-participant-badge/matrix-participant-badge.component";
import { AstralBadgeComponent } from "app/magic/astral-badge/astral-badge.component";
import { ALL_MATRIX_ACTION_NAMES, CYBERDECK_REQUIRED_ACTIONS, DECLARED_ACTIONS, DECLARED_ACTION_DESCRIPTIONS, DeclaredActionCategoryId, DeclaredActionItem, ILLEGAL_OS_ACTIONS } from "app/shared/declared-actions";
import { getInterruptLabel, getInterruptDescription } from "app/shared/interrupt-actions";
import { DeclaredActionEngine, DeclaredActionSelection } from "app/shared/declared-action-engine";
import {
  buildDecodeFrame, randomMatrixChar, escapeHtml, formatLogText, getLogTextClass,
  formatDiceRollLogText, formatInitiativeRollLogText, formatManualInitiativeRollLogText,
  formatInitiativeDeltaLogText, formatPassStartLogText, formatLogEntryReference,
  formatGroupWoundLogText
} from "app/shared/log-formatter";
import { getInitiativeRollMax, clampInitiativeRoll, classifyRoll } from "app/shared/roll-utils";

/**
 * Options for `changeParticipantDiceCount`. `rollGainedDice: false` is the
 * session-protocol escape hatch: on a player-driven jack-in the *player*
 * client rolls the gained dice and submits them as a delta `roll_submission`,
 * so the GM must not roll them here or the gain would be counted twice. Lost
 * dice are always rolled GM-side.
 */
interface DiceCountChangeOptions {
  rollGainedDice?: boolean;
}

interface LocalLogEntry {
  timestamp: Date;
  text: string;
}

/**
 * Edge rating a linked NPC row is created with, and keeps.
 *
 * Grunts have no Edge attribute at all (brief "NPC Group Initiative"
 * criterion 10 / Decision 5, p. 380), and ERIC's first step is the Edge
 * attribute (p. 159) - so a row enters the tie-break with 0 and falls through
 * to Reaction, then Intuition, then the coin toss. Deliberately *not* the
 * group's Professional Rating / Group Edge pool, which Decision 5 rules out.
 */
const NPC_ROW_EDGE_RATING = 0;

/**
 * Marker appended to every GM-local log line the players never received.
 *
 * Whether the gamemaster's dice are seen is a table agreement (brief p. 330);
 * once the table has chosen "hidden", the GM's own log still has to say which
 * lines went out and which did not, or a GM reading back the log after a
 * disconnect cannot tell the two apart. One constant so every hidden-write path
 * tags the line identically.
 */
const HIDDEN_FROM_PLAYERS_TAG = "(hidden from players)";

/**
 * Marker appended to a GM-local log line the GM rolled on behalf of a
 * non-player combatant.
 *
 * The shared log carries this as the `npc` flag and renders it as a badge, but
 * with no share session running there is no shared log - the line goes only to
 * the plain Action Log, where without a tag it is shaped exactly like a player
 * character's own roll line. One constant so every path tags it identically.
 */
const NPC_ROLL_TAG = "(NPC roll)";

/**
 * Actor used for a player-command log entry whose target participant has no
 * name yet. Matches the `target.name || "Player"` idiom the existing
 * player-command handlers use, so a nameless row does not fall back to `"GM"`.
 */
const PLAYER_COMMAND_FALLBACK_ACTOR = "Player";

/**
 * Shape of the opaque token the player client mints for itself
 * (`player-view.component.ts` builds it as `pl-` plus a random base-36 run;
 * the exact length is not depended on here).
 *
 * Deliberately **not** used on its own to decide "this is a token": a player
 * may legitimately name a character something token-shaped ("PL-2077"), and a
 * bare shape test would silently rename them. It is only ever a *secondary*
 * guard on top of an exact comparison against the authenticated
 * `command.player` value - see `rollerName`.
 */
const PLAYER_TOKEN_PATTERN = /^pl-[a-z0-9]{4,}$/i;

/**
 * Name given to a participant registered with no character name.
 *
 * Deliberately not the player token: `register_character` writes this straight
 * onto `participant.name`, so a token used here would not just mis-attribute
 * one log line - it would become the row's permanent name, its shared-state
 * name, and the actor of every later entry about it.
 */
const REGISTERED_CHARACTER_FALLBACK_NAME = "Unnamed Character";

/**
 * Same, for `release_claims` - which is fired by the *server* on a dropped
 * socket as well as by the player, so "Player" would over-claim intent for a
 * row released by a network blip.
 */
const RELEASED_CLAIM_FALLBACK_ACTOR = "Participant";

/**
 * Text of the player-command shared-log entries. One constant per event so the
 * wording cannot drift between the handler and the tests that read it, and so
 * every string can be checked once against `getLogTextClass`'s classifier
 * (none of these may contain "Interrupt", "Free:/Simple:/Complex:" or a
 * standalone "Act", which would misclassify them as action lines).
 *
 * The astral/Matrix entries here are shared with the GM-side buttons for the
 * same events (`enableAstral`, `disableAstral`, `toggleAstralProjecting`,
 * `gmJackIn`, `gmJackOut`), so the log reads the same whether the player
 * submitted the command or the GM pressed the button.
 */
const PLAYER_COMMAND_LOG_TEXT = {
  joined: "joined the session",
  claimed: "claimed by a player",
  claimReleased: "claim released",
  deckRemoved: "deck removed",
  deckConfigured: "deck configured",
  // `jackIn: true` covers both an actual jack-in and a mode switch by someone
  // already jacked in (Hot Sim -> Cold Sim). They are different events and the
  // log says so; "jacked in (Cold Sim)" for a decker who never left the Matrix
  // reads as a fresh connection that did not happen.
  jackedIn: (mode: string) => `jacked in (${mode})`,
  switchedVrMode: (mode: string) => `switched to ${mode}`,
  jackedOut: "jacked out",
  awakened: "is now Awakened",
  awakenedRemoved: "removed Awakened status",
  astralProjecting: "entered astral space (INT\xD72 initiative)",
  astralReturned: "returned from astral space (REA+INT initiative)"
} as const;

/**
 * Pluralise a counted noun. Same idiom as `formatDiceRollLogText`'s
 * `${hits} hit${hits !== 1 ? "s" : ""}` - a batch of one is a real and common
 * case at the table (one straggler left to roll) and "1 participants" reads as
 * a bug in the tracker.
 */
function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count !== 1 ? "s" : ""}`;
}

/** GM-action shared-log entries added by the Action Log attribution change. */
const GM_LOG_TEXT = {
  leftCombat: (name: string) => `${name} left combat`,
  reEnteredCombat: (name: string) => `${name} re-entered combat`,
  forceRolledBatch: (count: number) =>
    `Force-rolled initiative for ${pluralize(count, "outstanding participant")}`,
  nonPlayerRolledBatch: (count: number) =>
    `Rolled initiative for ${pluralize(count, "non-player participant")}`
} as const;

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
    AstralBadgeComponent
  ]
})
export class BattleTrackerComponent extends Undoable implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild("gmLogListContainer") gmLogListContainer?: ElementRef<HTMLElement>;
  /** The GM's dice roller, so its sticky "Roll as" state can be reset (p. 44). */
  @ViewChild("gmDiceRoller") gmDiceRoller?: DiceRollerComponent;
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

  /**
   * Whether the GM's own dice rolls go into the shared log at all.
   *
   * Whether the gamemaster's dice are visible - rolled in front of the players
   * or behind a screen - is explicitly a table agreement, not a rule
   * (brief p. 330). The table's chosen default here is *visible*: the
   * tracker's whole value is a shared record, so a GM roll is broadcast unless
   * the GM says otherwise.
   */
  static readonly GM_ROLLS_VISIBLE_BY_DEFAULT = true;

  /** Session-level switch. False = every GM roll stays GM-local. */
  gmRollsVisibleToPlayers = BattleTrackerComponent.GM_ROLLS_VISIBLE_BY_DEFAULT;

  /** One-shot override: hide only the next GM roll, then reset itself. */
  hideNextGmRoll = false;

  /** True if the roll about to be logged must not reach players. */
  isGmRollHiddenFromPlayers(): boolean {
    return !this.gmRollsVisibleToPlayers || this.hideNextGmRoll;
  }

  /**
   * Flip the session-level decision. Flipping it in *either* direction also
   * disarms the one-shot: the "hide next roll" button is only on screen while
   * the session is visible, so an arming that survived a round trip through
   * session-hidden would be invisible state the GM cannot see or clear.
   */
  toggleGmRollVisibility(): void {
    this.gmRollsVisibleToPlayers = !this.gmRollsVisibleToPlayers;
    this.hideNextGmRoll = false;
  }

  toggleHideNextGmRoll(): void {
    this.hideNextGmRoll = !this.hideNextGmRoll;
  }

  /**
   * Read the visibility decision for one GM-originated roll and spend the
   * one-shot. The one-shot is only spent while the session is visible -
   * otherwise a session-hidden roll would silently burn an arming that had no
   * observable effect.
   */
  private consumeGmRollVisibility(): boolean {
    const hidden = this.isGmRollHiddenFromPlayers();
    if (this.gmRollsVisibleToPlayers) {
      this.hideNextGmRoll = false;
    }
    return hidden;
  }

  /**
   * A participant nobody has claimed is run by the GM, so its initiative roll
   * is a GM roll and answers to the same visibility decision as the dice
   * roller (brief p. 330).
   */
  private isGmControlled(p: IParticipant): boolean {
    return !this.participantOwners.has(p);
  }

  /**
   * Log an initiative-track entry for a participant, honouring GM roll
   * visibility for GM-run participants. Player-claimed participants are never
   * hidden - the setting is about the *gamemaster's* dice (brief p. 330).
   *
   * `presetHidden` lets a batch (roll-outstanding) resolve the decision once
   * and apply it to every roll in the batch, so the one-shot is spent once per
   * GM action rather than once per participant.
   *
   * This also owns the *local* log line for the entry, so a line the players
   * never received is tagged "(hidden from players)" in the GM's own log
   * exactly like the dice roller's hidden rolls. Callers must not write their
   * own local line, or the GM gets the same event twice with only one of the
   * two copies telling the truth about visibility.
   */
  private appendParticipantRollLog(p: IParticipant, logText: string, presetHidden?: boolean): void {
    const actor = p.name || 'Participant';
    if (!this.isGmControlled(p)) {
      LogHandler.log(this.currentBTTime, `${actor} ${logText}`);
      this.appendSharedLog(actor, logText);
      return;
    }
    const hidden = presetHidden !== undefined ? presetHidden : this.consumeGmRollVisibility();
    if (hidden && this.shareRoomCode) {
      // appendGmOnlyLog writes the local line itself, tagged as hidden.
      this.appendGmOnlyLog(actor, logText);
    } else {
      LogHandler.log(this.currentBTTime, `${actor} ${logText}`);
      this.appendSharedLog(actor, logText);
    }
  }

  /** Name a roll is attributed to when the GM rolls as themselves. */
  static readonly GM_ROLLER_NAME = "GM";

  /**
   * Names offered by the dice roller's "Roll as" picker: the combatants the GM
   * actually runs. Anything `isPlayerCharacterName` claims is out - the
   * gamemaster governs the actions of the *non-player* characters (brief
   * p. 44), so offering a player's character here could only ever produce a
   * roll impersonating them, badged NPC.
   *
   * Same predicate the roll-time re-validation in `onGmDiceRolled` uses, and
   * deliberately so: when the picker filter and the roll-time guard were two
   * separate expressions they drifted, and a state one of them excluded (a
   * disconnected player's still-claimable character) sailed through the other.
   *
   * The GM can still type a name that is not in this list: a critter or
   * bystander outside the initiative order still has dice.
   */
  get rollAsNames(): string[] {
    const names = this.combatManager.participants.items
      .map(p => (p.name || "").trim())
      .filter(name => name.length > 0 && !this.isPlayerCharacterName(name));
    return [ ...new Set(names) ];
  }

  /**
   * Forget the sticky "Roll as" attribution in the dice roller.
   *
   * Sticky attribution is what makes a second roll for the same NPC one tap,
   * but it has no natural end: once the fight is over the named NPC may be
   * dead or gone, and the GM's next roll would silently go out under their
   * name. Three moments end it, each meaning "that combatant is not who the
   * next roll is for":
   *
   *  - End Combat (`btnReset_Click`) - the scene is finished;
   *  - the armed combatant being deleted from the tracker (`btnDelete_Click`,
   *    via `clearGmRollAttributionIfNamed`) - it is not in the fight any more;
   *  - the GM closing the share session (`btnCloseShareSession_Click`) - this
   *    table's session is over even if combat was never formally ended.
   *
   * A fourth case is handled at roll time instead of here: an armed name that
   * has become a player-claimed character falls back to the GM in
   * `onGmDiceRolled`, because the check has to happen against the state at the
   * moment the dice land.
   *
   * Not undoable, deliberately: this is transient view state in an OnPush
   * child component, not combat state routed through `Undoable.Set`, and
   * `UndoHandler` only replays property/list closures on domain objects.
   * Re-arming it is one tap in the same field, and an undo of End Combat (or
   * of a delete) that silently re-attributed the GM's dice to a dead NPC would
   * be worse than retyping the name.
   */
  private clearGmRollAttribution(): void {
    this.gmDiceRoller?.clearRollAs();
  }

  /**
   * Drop the sticky attribution only if it is the one naming `name`.
   *
   * Used at participant removal: deleting some unrelated combatant must not
   * cost the GM the name they are mid-way through rolling for, but deleting
   * *the* NPC they are rolling for leaves an attribution with nothing behind
   * it, and the next roll would silently go out under a name that is no longer
   * in the fight.
   */
  private clearGmRollAttributionIfNamed(name: string): void {
    const armed = this.gmDiceRoller?.rollAsName;
    if (armed && this.isSameCombatantName(armed, name)) {
      this.clearGmRollAttribution();
    }
  }

  /**
   * Loose name comparison for attribution checks: trimmed, case-insensitive.
   *
   * The "Roll as" field is free text (the GM types names for critters outside
   * the initiative order), so "ganger bravo" and "Ganger Bravo" are the same
   * combatant as far as a human at the table is concerned. Matching loosely
   * only ever makes the attribution checks *more* cautious - the outcome of a
   * match is always "do not attribute to this name".
   */
  private isSameCombatantName(a: string, b: string): boolean {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  }

  /**
   * True when `name` is the name of a participant that is a player's
   * character rather than a non-player combatant.
   *
   * The gamemaster governs the actions of the *non-player* characters (brief
   * p. 44), so this is the one test for "not mine to roll as". Two states
   * count, joined by OR:
   *
   *  - a player owns the participant right now (`participantOwners`);
   *  - the GM has marked it Claimable, which is the GM stating it is a
   *    player's character, whether or not anyone currently holds the claim.
   *
   * The second half is not redundant. It is what covers the two ordinary
   * states where a player character is momentarily unowned:
   *
   *  - prep, where the GM earmarks a character before any player has joined;
   *  - a mid-fight disconnect, where `release_claims` deletes the owner entry
   *    and leaves `claimable` set.
   *
   * Both now behave the same, because from the tracker's point of view they
   * are the same situation: a character the GM has declared a player's.
   *
   * `isGmControlled` is deliberately left alone and *not* expressed in terms of
   * this: its narrow "unclaimed right now" meaning is the correct test for
   * whose dice an initiative roll is, which is a different question.
   *
   * Name-based, not participant-based, because attribution itself is a name:
   * the "Roll as" field is free text, so a typed name that collides with a
   * player's character is the same impersonation as picking it.
   */
  private isPlayerCharacterName(name: string): boolean {
    return this.combatManager.participants.items.some(
      p => (this.participantOwners.has(p) || this.isParticipantClaimable(p))
        && this.isSameCombatantName(p.name || "", name)
    );
  }

  /**
   * Told to the GM when a roll they armed for an NPC went out under their own
   * name instead. Silently re-attributing was the alternative and it is worse:
   * the GM would read a log line that does not say what they expected and have
   * no way to tell whether the tracker had decided something or they had
   * mis-typed.
   */
  private playerCharacterFallbackNotice(name: string): string {
    return `Rolled as GM — "${name}" is a player character.`;
  }

  onGmDiceRolled(request: DiceRollRequest): void {
    const values = request.values;
    // Hits, 1s and glitch status all come from the faces already rolled
    // (brief pp. 44-45); nothing else about the test is modelled. Rolling on
    // behalf of an NPC changes the *attribution* only - the gamemaster governs
    // the actions of the non-player characters and determines the results of
    // their tests (brief p. 44), using the same resolution as anyone else.
    const glitch = classifyRoll(values).glitch;
    const logText = formatDiceRollLogText(values);
    const requestedName = (request.rollAs || "").trim();
    // Re-validated here against the *same* predicate the picker filters on,
    // not just in the picker: the field is sticky and free-text, so a name
    // that was an unclaimed GM-run combatant when it was armed can be a
    // player's character by the time the dice land (they claimed it, the GM
    // marked it Claimable, or the GM typed such a name outright). Attributing
    // to it now would impersonate that player, badged NPC. The dice still roll
    // and still get logged - only the attribution falls back to the GM, who is
    // after all the person who pressed the button.
    const impersonatesPlayer = requestedName.length > 0 && this.isPlayerCharacterName(requestedName);
    if (impersonatesPlayer) {
      // Disarm rather than silently re-attribute every future roll: the GM
      // should be able to see in the field that the name is no longer theirs
      // to roll.
      this.clearGmRollAttribution();
      this.shareInfo = this.playerCharacterFallbackNotice(requestedName);
    }
    const npcName = impersonatesPlayer ? "" : requestedName;
    // Tell the roller what the roll was *actually* logged as, not what was
    // asked for. Its tray label is written at emit time from the requested
    // name, and a tray reading "Your Roll - as Wombat" over a line logged as
    // GM is the same lie in the other direction.
    this.gmDiceRoller?.reportRollAttribution(
      npcName || null,
      impersonatesPlayer ? this.playerCharacterFallbackNotice(requestedName) : null
    );
    const roller = npcName || BattleTrackerComponent.GM_ROLLER_NAME;
    // Marks the entry as "the GM rolled these dice for a non-player
    // combatant", which is what makes it readable as something other than a
    // player character's own roll.
    const extra: Partial<SharedLogEntry> = npcName ? { glitch, npc: true } : { glitch };
    // An NPC roll is still a GM roll, so it answers to the same visibility
    // one-shot as any other; it does not bypass it.
    const hidden = this.consumeGmRollVisibility();
    if (this.shareRoomCode && !hidden) {
      this.appendSharedLog(roller, logText, extra);
      this.sessionSync.sendCommand({
        type: "dice_roll",
        // `player` stays "GM": it is the authenticated identity the server
        // checks. Who the roll is *for* travels in `roller`.
        player: BattleTrackerComponent.GM_ROLLER_NAME,
        payload: { roller, diceCount: values.length, values, npc: !!npcName }
      });
    } else if (this.shareRoomCode) {
      // Kept off the wire: recorded in the GM's own log only, flagged so the
      // GM can see at a glance that the players did not get this one.
      this.appendGmOnlyLog(roller, logText, extra);
    } else {
      // No share session: the plain Action Log is the only record, and it has
      // no badges. Tag the line so an NPC roll is still readable as one and
      // not as that character's player rolling for themselves.
      const tag = npcName ? ` ${NPC_ROLL_TAG}` : "";
      LogHandler.log(this.currentBTTime, `${roller} ${logText}${tag}`);
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
  /** Which linked NPC rows have their member list open (brief p. 379). */
  expandedRowPanels = new Set<IParticipant>();
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
  private convergenceModalRef: NgbModalRef | null = null;
  private osThresholdSub?: Subscription;



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
    // A fresh session starts a fresh record, which throws away any hidden
    // entries retained from a session that closed under the GM. Those are the
    // only copy in existence (the server never had them), and this button is
    // the reflex action after a disconnect - so the loss is confirmed out loud
    // rather than happening as a silent side effect (brief p. 330).
    if (this.hasRetainedHiddenLogEntries()) {
      const count = this.retainedHiddenLogEntryCount;
      const confirmed = await this.confirmationDialog.confirm(
        `${count} hidden GM log ${count === 1 ? "entry is" : "entries are"} still held locally from the closed `
        + `session. The server never received ${count === 1 ? "it" : "them"}, so starting a new session discards `
        + `${count === 1 ? "it" : "them"} permanently. Rejoin the old room code instead to keep `
        + `${count === 1 ? "it" : "them"}.`,
        "Discard retained hidden entries?",
        "Discard and Create",
        "Cancel"
      );
      if (!confirmed) {
        this.shareInfo = "Kept the retained hidden entries; no new session created.";
        return;
      }
    }
    try {
      this.sessionSync.connect();
      const { room } = await this.sessionSync.createSession();
      this.shareRoomCode = room;
      this.shareJoinCode = room;
      this.sharedLogEntries = this.reseedLogOrder([]);
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
      this.sharedLogEntries = this.mergeHiddenLogEntries(log || []);
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
      // Deliberate close: the GM ended this session's record on purpose, so
      // the GM-local hidden entries go with it. (An *unexpected* close keeps
      // them - see the onSessionClosed handler.)
      this.sharedLogEntries = this.reseedLogOrder([]);
      this.clearSharedLogDecodeAnimations();
      this.initiativePrepActive = false;
      // Second choke point alongside End Combat: a GM who closes the session
      // has finished with this table's scene even if they never pressed End
      // Combat, and a name left armed here would carry into the next session.
      // Deliberate closes only - an *unexpected* close (handleSessionClosedExternally)
      // is a dropped connection mid-fight, where the NPC is still standing and
      // the GM is still rolling for it.
      this.clearGmRollAttribution();
      this.isClosingSession = false;
    }
  }

  private attachShareListeners() {
    this.sessionSync.onCommand((command) => this.handleSessionCommand(command));
    this.sessionSync.onLog((entry) => {
      const index = this.insertSharedLogEntry(entry);
      this.pendingLogScroll = true;
      this.flashSharedLogEntry(index);
      this.startSharedLogDecode(index, entry.text);
      if (entry.actor !== "GM") {
        LogHandler.log(this.currentBTTime, `${entry.actor} ${entry.text}`);
      }
    });
    this.sessionSync.onSessionClosed(() => this.handleSessionClosedExternally());
  }

  /**
   * The session went away without the GM asking for it (server restart,
   * dropped connection). Reset the share state but keep the GM-local hidden
   * entries: the server never received them, so this list is the only copy and
   * a rejoin merges them back in (brief p. 330).
   */
  private handleSessionClosedExternally() {
    if (this.isClosingSession) {
      return;
    }
    this.shareInfo = "Session was closed.";
    this.shareRoomCode = "";
    this.shareJoinCode = "";
    this.sharedLogEntries = this.reseedLogOrder(this.getHiddenLogEntries());
    this.clearSharedLogDecodeAnimations();
    this.initiativePrepActive = false;
    this.sessionSync.disconnect();
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
      // Never `playerName`: that is the opaque `pl-…` token, and this value is
      // written straight onto `participant.name` (upsertPlayerParticipant), so
      // a token here would become the row's permanent name everywhere - roster,
      // shared state, and every future log line about it - not just this entry.
      const characterName = this.nameUnlessToken(
        payload["characterName"],
        playerName,
        REGISTERED_CHARACTER_FALLBACK_NAME
      );
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
      const registered = this.upsertPlayerParticipant(
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
      // A re-registration (sheet edit, reconnect) comes through this same path
      // and deliberately re-announces the player - suppressing it would need a
      // "have we seen this token" check duplicating `participantOwners`.
      this.appendPlayerCommandLog(registered, PLAYER_COMMAND_LOG_TEXT.joined);
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
        // Name captured before the demote: that swaps the participant instance.
        this.appendPlayerCommandLog(targetName, PLAYER_COMMAND_LOG_TEXT.deckRemoved);
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
        // Read *before* applyVRMode, which writes `jackedIn`: the same payload
        // flag covers a real jack-in and a mode switch by someone already
        // jacked in, and only the previous state tells the two apart.
        const wasJackedIn = mp.jackedIn;
        const vrModeStr = String(payload["vrMode"] || "AR");
        const mode = vrModeStr === "hot-sim" ? VRMode.HotSim
                   : vrModeStr === "cold-sim" ? VRMode.ColdSim
                   : VRMode.AR;
        // Lost dice (e.g. Hot Sim → Cold Sim) are rolled and applied GM-side.
        // Gained dice are not: the player client submits them as a delta
        // roll_submission {isDelta:true}, so rolling here would double-count.
        this.applyVRMode(mp, mode, { rollGainedDice: false });
        mp.jackedIn = true; // force true even for AR (applyVRMode leaves it false)
        // Jacking in changes Initiative attribute *and* dice count, so it has
        // to leave a trace in the log the players read, not only the GM's.
        const modeLabel = this.vrModeLabel(mode);
        this.appendPlayerCommandLog(
          mp,
          wasJackedIn
            ? PLAYER_COMMAND_LOG_TEXT.switchedVrMode(modeLabel)
            : PLAYER_COMMAND_LOG_TEXT.jackedIn(modeLabel)
        );
      } else if (payload["jackOut"] === true || payload["create"] === true) {
        // Jack Out or initial deck creation: no VR mode, restore physical initiative.
        const isJackOut = payload["jackOut"] === true;
        mp.vrMode = VRMode.None;
        mp.jackedIn = false;
        mp.blocksPhysicalActions = false;
        const reaction = this.participantReactions.get(mp) ?? 0;
        const intuition = this.getParticipantIntuition(mp);
        mp.baseIni = reaction + intuition;
        if (isJackOut) {
          // Jack-out dice loss is always handled GM-side: roll the lost dice,
          // subtract the total, log (brief F5 / criterion 8, p. 160).
          this.changeParticipantDiceCount(mp, PHYSICAL_INITIATIVE_DICE);
          this.appendPlayerCommandLog(mp, PLAYER_COMMAND_LOG_TEXT.jackedOut);
        } else {
          // Initial deck creation is character setup, not a mid-turn dice
          // change - the player sends a full roll_submission afterwards.
          mp.setDicesWithoutRoll(PHYSICAL_INITIATIVE_DICE);
          this.appendPlayerCommandLog(mp, PLAYER_COMMAND_LOG_TEXT.deckConfigured);
        }
      }
      // No `else`: a bare stat-edit payload (no create/jackIn/jackOut) writes
      // the stats above and nothing else. It is not reachable from the player
      // client today - every `configure_deck` it sends carries one of those
      // flags - so a log line here would be dead code that reads as covered.
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
      // These three sites write no log line of their own: `enableAstral`,
      // `disableAstral` and `toggleAstralProjecting` each own their entry, so
      // the GM's log reads the same whether the player sent the command or the
      // GM pressed the button - and the event is not recorded twice.
      if (payload["isAstral"] === false) {
        if (this.isAstral(target)) {
          this.disableAstral(target);
        }
        return;
      }
      if (payload["isAstral"] === true && !this.isAstral(target)) {
        this.enableAstral(target);
        return;
      }
      if (payload["project"] !== undefined && this.isAstral(target)) {
        const wantProject = payload["project"] === true;
        if (this.asAstral(target).astralProjecting !== wantProject) {
          // Astral projection changes the Initiative attribute and the dice
          // count, so it belongs in the log the players read.
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
      this.appendPlayerCommandLog(target, PLAYER_COMMAND_LOG_TEXT.claimed);
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
          // One entry per participant actually released, and none when nothing
          // was. The server fires a synthetic release_claims on every dropped
          // socket and the player client fires one on ngOnDestroy, so a closing
          // tab produces two commands - the second finds no owner, releases
          // nothing, and logs nothing. Wording deliberately states no intent.
          this.appendPlayerCommandLog(
            participant,
            PLAYER_COMMAND_LOG_TEXT.claimReleased,
            RELEASED_CLAIM_FALLBACK_ACTOR
          );
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
        this.appendSharedLog(
          target.name || "Player",
          formatInitiativeDeltaLogText(diceValues, roll, total)
        );
        if (this.initiativePrepActive) {
          this.updateInitiativePrepInfo();
        }
        this.sort();
        return;
      }
      if (this.combatManager.started && target.diceIni > 0) {
        // Initiative is rolled once per Combat Turn (p. 159/160). This
        // participant already has a running Score, so a full Initiative Test
        // submission is stale (e.g. a client that was showing a pre-restore
        // "needs to roll" prompt) and must not be stacked on top of it.
        LogHandler.log(
          this.currentBTTime,
          `${target.name} initiative roll ignored: already rolled this Combat Turn`
        );
        return;
      }
      target.diceIni = this.clampInitiativeRoll(roll, target);
      const total = target.getCurrentInitiative();
      const intuition = this.getParticipantIntuition(target);
      let baseLabel: string;
      if (this.isAstral(target) && this.asAstral(target).astralProjecting) {
        baseLabel = `INT×2(${intuition * 2})`;
      } else if (this.isMatrix(target) && this.asMatrix(target).jackedIn && this.asMatrix(target).vrMode !== VRMode.AR && this.asMatrix(target).vrMode !== VRMode.None) {
        baseLabel = `DP(${this.asMatrix(target).dataProcessing}) + INT(${intuition})`;
      } else {
        baseLabel = `REA(${this.getParticipantReaction(target)}) + INT(${intuition})`;
      }
      const rawValues = command.payload?.["diceValues"];
      const diceValues = Array.isArray(rawValues) ? (rawValues as unknown[]).map(Number) : [];
      this.appendSharedLog(
        target.name || "Player",
        diceValues.length > 0
          ? formatInitiativeRollLogText(baseLabel, diceValues, total)
          : formatManualInitiativeRollLogText(baseLabel, target.diceIni, total)
      );
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
      // `command.player` is deliberately *not* a fallback here: it is the
      // opaque token, and the player client already sends
      // `roller: characterName || playerToken`, so an unnamed (or reloaded)
      // client puts the token in the name slot itself. Both cases land on the
      // same non-token label.
      const roller = this.rollerName(
        command.payload?.["roller"],
        command.player || "",
        PLAYER_COMMAND_FALLBACK_ACTOR
      );
      const rawValues = command.payload?.["values"];
      const values = Array.isArray(rawValues) ? (rawValues as unknown[]).map(Number) : [];
      if (values.length > 0) {
        // Same classification as a GM roll - hits, 1s, glitch (brief pp. 44-45).
        this.appendSharedLog(roller, formatDiceRollLogText(values), { glitch: classifyRoll(values).glitch });
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
          // Carried so a rejoining GM can reconstruct "already rolled" state
          // instead of re-offering the once-per-Combat-Turn Initiative Test
          // (p. 159/160). See restoreFromSharedState().
          rolledInitiativeTotal: p.diceIni,
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

  private appendSharedLog(actor: string, text: string, extra?: Partial<SharedLogEntry>) {
    if (!this.shareRoomCode) {
      return;
    }
    const entry: SharedLogEntry = {
      actor,
      text,
      timestamp: new Date().toISOString(),
      id: this.nextLogEntryId(),
      ...extra
    };
    // Reserve this entry's place in the GM's own log *now*, before it makes
    // the round trip through the server. A hidden entry logged in the
    // meantime is appended synchronously, so without a reservation the echo
    // would land after it and the GM would read the two out of order.
    this.assignLogOrder(entry);
    this.sessionSync.appendLog(entry);
  }

  /**
   * Shared-log line for something a *player* did through a session command.
   *
   * Player commands carry `command.player`, which is an opaque random token
   * minted client-side (`pl-…`, `player-view.component.ts`) and never a human
   * name, so it must never reach the log - it would render as
   * `pl-k3f9a2b1: joined the session`. There is no player-name field anywhere
   * in the system to use instead.
   *
   * The convention the existing player-command handlers already follow
   * (`roll_submission`, `act`, `delay`, `interrupt`) is to attribute the entry
   * to the *character* the command acted on - the name a player reading the
   * log recognises as themselves.
   *
   * Scope, precisely: this helper is used by the player-command handlers that
   * had no attribution of their own (`register_character`, `configure_deck`,
   * `configure_astral`, `claim_character`, `release_claims`). It is **not** a
   * choke point for the whole file - `roll_submission`, `act`, `delay`,
   * `interrupt` and `dice_roll` still build their actor name inline from
   * `target.name || "Player"`, so a new handler can still write `"GM"` or a
   * raw name without passing through here. What it does guarantee is that the
   * branches that do call it never fall back to anything token-shaped.
   *
   * Takes a name directly as well as a participant, because several of these
   * branches swap the participant instance (promote/demote) before the line is
   * written and the caller has to capture the name first.
   */
  private appendPlayerCommandLog(
    target: IParticipant | string,
    text: string,
    fallbackActor: string = PLAYER_COMMAND_FALLBACK_ACTOR
  ): void {
    const name = typeof target === "string" ? target : (target.name || "");
    this.appendSharedLog(name || fallbackActor, text);
  }

  /**
   * Read a human-facing name out of a command payload, refusing the value that
   * is *actually* this player's opaque token.
   *
   * The comparison is exact against the authenticated `command.player`, never a
   * shape heuristic: the token is right there at every call site, and a shape
   * test would reject a legitimate character name that merely looks token-like
   * ("PL-2077"). At `register_character` that rejection is not cosmetic - the
   * value is written straight onto `participant.name`, so a false positive
   * renames the row permanently and only a GM edit can undo it.
   */
  private nameUnlessToken(raw: unknown, token: string, fallback: string): string {
    const name = String(raw ?? "").trim();
    if (!name || name === token) {
      return fallback;
    }
    return name;
  }

  /**
   * Same idea for `dice_roll`'s `roller` field, which needs one extra guard.
   *
   * The player client sends `roller: characterName || playerToken`, so an
   * unnamed (or reloaded) client puts its own token in the name slot. But a
   * bare exact match cannot be the whole test here: unlike `register_character`,
   * a `dice_roll` may legitimately arrive with `roller === command.player` when
   * the player *is* identified by a human name (see
   * `combat-log-readability.spec.ts` "classifies a player-submitted roll the
   * same way as a GM roll"). So the exact match only counts as a leak when the
   * matched value also has the minted `pl-…` shape - which the client-substituted
   * token always does, and a human name effectively never does.
   */
  private rollerName(raw: unknown, token: string, fallback: string): string {
    const name = String(raw ?? "").trim();
    if (!name || (name === token && PLAYER_TOKEN_PATTERN.test(token))) {
      return fallback;
    }
    return name;
  }

  /**
   * Log a participant-attributed event that either a player command or a GM
   * button can raise (astral status, astral projection, jack in/out).
   *
   * With a session open the line goes to the shared log only: the server echo
   * mirrors every non-`"GM"` entry into `LogHandler` (see `attachShareListeners`),
   * so writing a local line here as well would give the GM the same event
   * twice. With no session there is no echo and no shared log, so the plain
   * Action Log is the only place the event can be recorded.
   */
  private appendParticipantEventLog(actorName: string, text: string): void {
    const actor = actorName || PLAYER_COMMAND_FALLBACK_ACTOR;
    if (this.shareRoomCode) {
      this.appendSharedLog(actor, text);
      return;
    }
    LogHandler.log(this.currentBTTime, `${actor} ${text}`);
  }

  /**
   * Append an entry to the GM's own log without sending it to the server.
   *
   * Used for GM rolls the GM chose to keep private (brief p. 330) and for any
   * narration attached to one. The server broadcasts a log entry to the whole
   * room, so "GM sees it, players do not" can only be done by not sending it.
   */
  private appendGmOnlyLog(
    actor: string,
    text: string,
    extra?: Partial<SharedLogEntry>
  ): SharedLogEntry {
    const entry: SharedLogEntry = {
      actor,
      text,
      timestamp: new Date().toISOString(),
      id: this.nextLogEntryId(),
      ...extra,
      hiddenFromPlayers: true
    };
    const index = this.insertSharedLogEntry(entry);
    this.pendingLogScroll = true;
    this.flashSharedLogEntry(index);
    this.startSharedLogDecode(index, entry.text);
    LogHandler.log(this.currentBTTime, `${actor} ${text} ${HIDDEN_FROM_PLAYERS_TAG}`);
    return entry;
  }

  private nextLogEntryId(): string {
    return `log-${Date.now().toString(36)}-${(this.logEntryIdCounter++).toString(36)}`;
  }
  private logEntryIdCounter = 0;

  // ── Local ordering of the GM's log pane ─────────────────────────────────
  //
  // Two append paths feed `sharedLogEntries`: visible entries arrive via the
  // server echo (async) and hidden entries are pushed synchronously. A
  // monotonic sequence assigned when the GM *originates* an entry keeps the
  // two interleaved in the order they actually happened. Presentation only -
  // it changes nothing about what players receive.

  private logOrderSequence = 0;
  private readonly logOrderById = new Map<string, number>();
  private readonly logOrderByEntry = new WeakMap<SharedLogEntry, number>();

  private assignLogOrder(entry: SharedLogEntry): number {
    const existing = this.peekLogOrder(entry);
    if (existing !== undefined) {
      this.logOrderByEntry.set(entry, existing);
      return existing;
    }
    const seq = this.logOrderSequence++;
    if (entry.id) {
      this.logOrderById.set(entry.id, seq);
    }
    this.logOrderByEntry.set(entry, seq);
    return seq;
  }

  private peekLogOrder(entry: SharedLogEntry): number | undefined {
    const byEntry = this.logOrderByEntry.get(entry);
    if (byEntry !== undefined) {
      return byEntry;
    }
    return entry.id ? this.logOrderById.get(entry.id) : undefined;
  }

  private getLogOrder(entry: SharedLogEntry): number {
    const known = this.peekLogOrder(entry);
    return known !== undefined ? known : this.assignLogOrder(entry);
  }

  /**
   * Place an entry at its ordered position and return the index it landed at.
   * Almost always the end; only a server echo that lost a race with a hidden
   * entry goes anywhere else.
   */
  private insertSharedLogEntry(entry: SharedLogEntry): number {
    const order = this.assignLogOrder(entry);
    const entries = [ ...this.sharedLogEntries ];
    let position = entries.length;
    while (position > 0 && this.getLogOrder(entries[position - 1]) > order) {
      position--;
    }
    entries.splice(position, 0, entry);
    this.sharedLogEntries = entries;
    if (position < entries.length - 1) {
      // Everything after the insertion point shifted by one; the in-flight
      // decode animations are keyed by index, so stop them rather than let
      // them paint onto the wrong row.
      this.cancelSharedLogDecodeFrom(position);
    }
    return position;
  }

  /**
   * Maximum length of a GM's glitch narration. Not a rules limit - the session
   * server rejects a log entry over 2 KB, so the text box is bounded well
   * inside that.
   */
  static readonly GM_NOTE_MAX_LENGTH = 300;

  /** Template-facing alias for the narration length cap. */
  get glitchNoteMaxLength(): number {
    return BattleTrackerComponent.GM_NOTE_MAX_LENGTH;
  }

  /** Draft narration text, keyed by the id of the entry it annotates. */
  glitchNoteDrafts = new Map<string, string>();
  /** Which glitch entry currently has its narration box open. */
  openGlitchNoteEntryId: string | null = null;

  /**
   * A glitch entry can carry GM narration. Only glitched rolls offer the box;
   * the consequence of a glitch is GM-adjudicated narrative with nothing to
   * look up (brief p. 45), so this text is always typed by the GM and never
   * generated.
   */
  canAnnotateGlitch(entry: SharedLogEntry): boolean {
    return !!entry.id && !!entry.glitch && entry.glitch !== "none" && !entry.gmNote;
  }

  isGlitchNoteOpen(entry: SharedLogEntry): boolean {
    return !!entry.id && this.openGlitchNoteEntryId === entry.id;
  }

  toggleGlitchNote(entry: SharedLogEntry): void {
    if (!entry.id) {
      return;
    }
    this.openGlitchNoteEntryId = this.openGlitchNoteEntryId === entry.id ? null : entry.id;
  }

  /**
   * What will happen to *this* narration when it is submitted.
   *
   * Visibility is decided per entry: a narration about a roll the players
   * already saw stays public even while the session-hidden switch is lit, and a
   * narration about a hidden roll stays private even while GM rolls are
   * visible. The switch is on the other side of the screen, so the input says
   * which of the two this one is (brief p. 330).
   */
  getGlitchNoteVisibilityLabel(entry: SharedLogEntry): string {
    return entry.hiddenFromPlayers ? "stays private" : "will be visible to players";
  }

  /** True when submitting this narration puts it on the wire. */
  isGlitchNoteVisibleToPlayers(entry: SharedLogEntry): boolean {
    return !entry.hiddenFromPlayers;
  }

  getGlitchNoteDraft(entry: SharedLogEntry): string {
    return (entry.id && this.glitchNoteDrafts.get(entry.id)) || "";
  }

  setGlitchNoteDraft(entry: SharedLogEntry, text: string): void {
    if (!entry.id) {
      return;
    }
    this.glitchNoteDrafts.set(entry.id, text.slice(0, BattleTrackerComponent.GM_NOTE_MAX_LENGTH));
  }

  /**
   * Record the GM's narration for a glitch as its own entry pointing back at
   * the roll (`refId`). The log is append-only, so the original roll entry is
   * never rewritten - its hits and glitch label stand exactly as rolled
   * (brief p. 45).
   *
   * The narration also carries `refSummary`: the parent roll's actor and its
   * hit/glitch summary, restated inline. The log is a flat list with no turn
   * or pass grouping, so anything at all can be logged between the roll and
   * its narration; the restatement is what makes the link readable instead of
   * relying on the two happening to sit next to each other.
   */
  submitGlitchNote(entry: SharedLogEntry): void {
    const text = this.getGlitchNoteDraft(entry).trim();
    if (!entry.id || text.length === 0) {
      return;
    }
    const extra: Partial<SharedLogEntry> = {
      gmNote: true,
      refId: entry.id,
      refSummary: formatLogEntryReference(entry.actor, entry.text),
      glitch: entry.glitch
    };
    if (entry.hiddenFromPlayers) {
      // Narration about a roll the players never saw stays GM-local too.
      this.appendGmOnlyLog("GM", text, extra);
    } else {
      this.appendSharedLog("GM", text, extra);
    }
    this.glitchNoteDrafts.delete(entry.id);
    this.openGlitchNoteEntryId = null;
  }

  /**
   * The line a narration entry shows to name the roll it is about.
   *
   * Prefers the summary captured when the narration was written, which travels
   * with the entry and survives a reconnect. Falls back to re-deriving it from
   * the parent entry if it is still in the log (older entries carry no
   * `refSummary`). Returns "" when there is nothing to reference.
   */
  getLogEntryReference(entry: SharedLogEntry): string {
    if (entry.refSummary) {
      return entry.refSummary;
    }
    const parent = this.getAnnotatedEntry(entry);
    return parent ? formatLogEntryReference(parent.actor, parent.text) : "";
  }

  /** The roll entry a narration entry is attached to, for display. */
  getAnnotatedEntry(entry: SharedLogEntry): SharedLogEntry | null {
    if (!entry.refId) {
      return null;
    }
    return this.sharedLogEntries.find(e => e.id === entry.refId) || null;
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
  ): IParticipant {
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

    // Distinguishes genuine first-time setup (no roll owed) from a
    // re-registration of a participant already in the encounter (a dice-count
    // change there is a mid-turn rules event) - see applyRegisteredDiceCount.
    const isExistingTarget = target !== undefined;

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
      const decker: MatrixParticipant = target;
      const safeDP = Math.max(1, Number(dataProcessing || 1));
      const mode = vrModeStr === "hot-sim" ? VRMode.HotSim
                 : vrModeStr === "cold-sim" ? VRMode.ColdSim
                 : VRMode.AR;
      target.dataProcessing = safeDP;
      if (mode === VRMode.AR) {
        // AR: physical initiative — REA+INT+initiativeDice, no catatonia.
        // jackedIn is NOT reset here — it's controlled by the GM via gmJackIn/gmJackOut.
        target.vrMode = VRMode.AR;
        this.applyRegisteredDiceCount(target, initiativeDice, isExistingTarget);
        target.baseIni = safeReaction + safeIntuition;
        target.blocksPhysicalActions = false;
      } else {
        // Cold/Hot-Sim: Matrix initiative — DP+INT+3d6/4d6, physically catatonic.
        // Setup path, so the dice count is written without rolling.
        decker.applyJackInMode(mode, safeIntuition, n => decker.setDicesWithoutRoll(n));
      }
      this.participantReactions.set(target, safeReaction);
      this.participantIntuitions.set(target, safeIntuition);
    } else {
      this.applyRegisteredDiceCount(target, initiativeDice, isExistingTarget);
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
    // Returned so `register_character` can attribute its log entry to the
    // character rather than the opaque player token.
    return target;
  }

  /**
   * Apply the Initiative Dice count carried by a `register_character` command.
   *
   * First-time setup (a participant that did not exist yet), or a
   * re-registration while combat has not started or before this turn's
   * Initiative Test, is not a rules event: the count is simply written, no roll
   * owed (the player submits their Initiative roll separately).
   *
   * A re-registration *mid-turn* for a participant who has already rolled is a
   * different thing entirely - the player has activated a drug/spell and their
   * dice count changed. That is a mid-turn Initiative Dice change and must roll
   * the gained/lost dice and move the running Score like every other one
   * (brief F5 / criteria 7-8, p. 160), so it goes through the same funnel
   * rather than being silently overwritten.
   */
  private applyRegisteredDiceCount(
    p: IParticipant,
    initiativeDice: number,
    isExistingTarget: boolean
  ): void {
    const clamped = clampInitiativeDiceCount(initiativeDice);
    const isMidTurnChange = isExistingTarget
      && this.combatManager.started
      && p.diceIni > 0
      && clamped !== p.dices;
    if (isMidTurnChange) {
      this.changeParticipantDiceCount(p, clamped);
      return;
    }
    // Setup path: the 5D6 cap still applies (brief criterion 9, pp. 52/288).
    p.setDicesWithoutRoll(clamped);
  }

  /**
   * Rolled-dice total to restore for a broadcast participant.
   *
   * Prefers the transmitted `rolledInitiativeTotal`. Older snapshots (from a
   * build that predates that field) only carry `pendingRoll`, which is exactly
   * `diceIni <= 0` - so "not pending" is known to mean "rolled", even though
   * the total itself is unrecoverable. In that case we restore the minimum
   * non-zero total so the participant is still correctly treated as having
   * taken their once-per-Combat-Turn Initiative Test (p. 159/160); the running
   * Score is restored verbatim regardless, so only the displayed dice total is
   * approximate.
   */
  private restoredRolledTotal(shared: SharedParticipantState, participant: IParticipant): number {
    const transmitted = Number(shared.rolledInitiativeTotal);
    if (Number.isFinite(transmitted) && transmitted > 0) {
      return this.clampInitiativeRoll(transmitted, participant);
    }
    if (shared.pendingRoll === false && !Number.isFinite(transmitted)) {
      return MIN_DISPLAYED_DICE_TOTAL;
    }
    return 0;
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

    // Turn/pass counters are restored *before* the participants, so the
    // running Initiative Scores below are reconstructed against the pass
    // count they actually belong to (and never decayed against a stale one).
    this.combatManager.combatTurn = Math.max(1, Number(state.round || 1));
    this.combatManager.initiativePass = Math.max(1, Number(state.pass || 1));
    this.combatManager.started = Boolean(state.started);
    this.combatManager.passEnded = Boolean(state.passEnded);
    this.combatManager.currentInitiative = Number(state.currentInitiative ?? this.combatManager.currentInitiative);

    const ordered = [ ...state.participants ].sort((a, b) => a.order - b.order);
    for (const shared of ordered) {
      const participant = new Participant();
      participant.name = shared.name;
      // Reconstructing existing state, not a change event: no roll is owed
      // (the Score is restored verbatim below). The 5D6 cap still applies.
      participant.setDicesWithoutRoll(Number(shared.initiativeDice || 1));
      // Reconstruct the already-rolled state. Initiative is rolled once per
      // Combat Turn (p. 159/160), so a participant whose Score is already
      // running must not come back marked as still needing to roll - that is
      // what `pendingRoll` (getSharedParticipants) and the GM roll button both
      // key off. The running Score itself is restored verbatim further down,
      // so this write must be Score-neutral.
      participant.setDiceIniWithoutScoreChange(
        this.restoredRolledTotal(shared, participant)
      );
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
      // The broadcast payload carries each participant's *current* running
      // Initiative Score, already reduced by every pass that has elapsed
      // (brief pp. 159-160). Reconstruct it verbatim rather than re-deriving
      // it from the pass count, and tell addParticipant() not to apply the
      // late-entry decay on top (it would double-count).
      this.combatManager.addParticipant(participant, true);
      const restoredScore = Number(shared.initiativeScore);
      if (Number.isFinite(restoredScore)) {
        participant.currentInitiativeScore = restoredScore;
        participant.appliedInitiativeAttribute = participant.initiativeAttribute;
      }
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
      this.appendSharedLog(
        "GM",
        formatPassStartLogText(this.combatManager.initiativePass, INITIATIVE_PASS_DECAY)
      );
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
    // The combatant the GM was rolling for is gone: the sticky attribution
    // outlives it otherwise, and the next roll (their own Perception check,
    // say) goes out under a name no longer in the fight. Cleared only when it
    // is *this* name - deleting an unrelated combatant leaves it armed.
    this.clearGmRollAttributionIfNamed(sender.name || "");
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
    // The scene is over: whoever the GM was rolling for may not exist next
    // fight, so the sticky attribution does not carry across the boundary.
    this.clearGmRollAttribution();
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

  /**
   * An OOC participant is filtered out of the broadcast list entirely
   * (`getSharedParticipants`), so without a log line the row simply vanishes
   * from every player's screen with no explanation. Both handlers log *after*
   * the state change so the entry describes what actually happened.
   */
  btnLeaveCombat_Click(sender: IParticipant) {
    LogHandler.log(this.currentBTTime, sender.name + " LeaveCombat_Click");
    UndoHandler.StartActions();
    sender.leaveCombat();
    if (this.combatManager.currentActors.contains(sender)) {
      // Remove sender from active Actors
      this.combatManager.act(sender);
    }
    this.appendSharedLog("GM", GM_LOG_TEXT.leftCombat(sender.name));
    this.sort();
  }

  btnEnterCombat_Click(sender: IParticipant) {
    LogHandler.log(this.currentBTTime, sender.name + " EnterCombat_Click");
    UndoHandler.StartActions();
    sender.enterCombat();
    // `enterCombat()` only clears the manual `_ooc` flag; the `ooc` getter can
    // still be true from damage, in which case the participant does *not*
    // reappear in the player-visible list and "re-entered combat" would be a
    // lie. Log only when they are genuinely back.
    if (!sender.ooc) {
      this.appendSharedLog("GM", GM_LOG_TEXT.reEnteredCombat(sender.name));
    }
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

  /**
   * The GM's own log pane shows *everything* the GM has, hidden entries
   * included - the visibility decision is about what players receive
   * (brief p. 330), not about what the GM can see. Already held in the order
   * the entries happened (see `insertSharedLogEntry`).
   */
  getSharedLogEntriesForGm(): SharedLogEntry[] {
    return this.sharedLogEntries;
  }

  /** Entries the GM kept off the wire - the only copy of them anywhere. */
  private getHiddenLogEntries(): SharedLogEntry[] {
    return this.sharedLogEntries.filter(e => e.hiddenFromPlayers);
  }

  /**
   * Hidden entries still held after the session went away under the GM.
   *
   * With no room code the shared log pane has nothing to show, so without this
   * the retained entries would exist in memory and appear nowhere - the GM
   * would have no way to read them and no warning before an action that
   * destroys them. Only meaningful while there is no live session; once
   * rejoined they are ordinary entries in the merged log again.
   */
  getRetainedHiddenLogEntries(): SharedLogEntry[] {
    return this.shareRoomCode ? [] : this.getHiddenLogEntries();
  }

  hasRetainedHiddenLogEntries(): boolean {
    return this.getRetainedHiddenLogEntries().length > 0;
  }

  get retainedHiddenLogEntryCount(): number {
    return this.getRetainedHiddenLogEntries().length;
  }

  /** Banner text for the retained-entry block in the GM's log pane. */
  get retainedHiddenLogBanner(): string {
    const count = this.retainedHiddenLogEntryCount;
    return `${count} hidden GM ${count === 1 ? "entry" : "entries"} retained from the closed session `
      + `- players never received ${count === 1 ? "it" : "them"}. Rejoin the room code to merge `
      + `${count === 1 ? "it" : "them"} back in; creating a new session discards ${count === 1 ? "it" : "them"}.`;
  }

  /**
   * Rebuild the log from a server-provided history without losing the GM's
   * hidden entries. The server never received those, so they cannot come back
   * in `incoming`; merging them in by timestamp is the only way a reconnect
   * keeps them.
   */
  private mergeHiddenLogEntries(incoming: SharedLogEntry[]): SharedLogEntry[] {
    const hidden = this.getHiddenLogEntries();
    if (hidden.length === 0) {
      return [ ...incoming ];
    }
    const seen = new Set(incoming.map(e => e.id).filter(Boolean));
    const merged = [ ...incoming, ...hidden.filter(e => !e.id || !seen.has(e.id)) ];
    merged.sort((a, b) => (a.timestamp || "").localeCompare(b.timestamp || ""));
    return this.reseedLogOrder(merged);
  }

  /**
   * Re-key the local ordering sequence to a wholesale replacement of the log
   * (a rejoin, a reset). Without this the sequence numbers left over from the
   * previous list would put newly arriving entries in the wrong place.
   */
  private reseedLogOrder(entries: SharedLogEntry[]): SharedLogEntry[] {
    this.logOrderById.clear();
    this.logOrderSequence = 0;
    for (const entry of entries) {
      const seq = this.logOrderSequence++;
      if (entry.id) {
        this.logOrderById.set(entry.id, seq);
      }
      this.logOrderByEntry.set(entry, seq);
    }
    return entries;
  }

  getSharedLogDisplayText(entry: SharedLogEntry, index: number): string {
    return this.sharedLogDecodeText.get(index) || entry.text;
  }

  getLocalLogDisplayText(entry: LocalLogEntry): string {
    return this.localLogDecodeText.get(this.getLocalLogKey(entry)) || entry.text;
  }

  /**
   * Log presentation is shared with the player view (`app/shared/log-formatter`)
   * so a glitch, an action or a damage entry reads identically on both screens.
   */
  getLogTextClass(text: string): string {
    return getLogTextClass(text);
  }

  formatLogText(text: string): string {
    return formatLogText(text);
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

  /**
   * GM edit of the rolled-dice-total box.
   *
   * The box is the manual entry point for the Initiative Test result (its
   * sibling is the Roll button, which is disabled once a total is present), so
   * it *is* allowed to move the running Initiative Score - but only by the
   * legitimate delta between the old and the new rolled total (brief F5 /
   * criteria 7-8, p. 160). The value is therefore clamped to
   * [0, dices x 6] *before* it is written through the Score-moving `diceIni`
   * setter; previously the raw typed value reached that setter through a
   * two-way `[(ngModel)]` binding and inflated the Score by the unclamped
   * amount before any clamp could run.
   *
   * The one-way `[ngModel]` binding means Angular writes the clamped model
   * value back into the DOM input, so what the GM sees always matches the
   * model.
   */
  onParticipantRolledTotalChanged(p: IParticipant, value: number) {
    // One undo step per edit: the clamp plus the resulting Score delta are a
    // single reversible change.
    UndoHandler.StartActions();
    const clamped = this.clampInitiativeRoll(value, p);
    if (clamped !== p.diceIni) {
      p.diceIni = clamped;
    }
    this.onParticipantUpdated();
  }

  onParticipantUpdated() {
    this.enforceParticipantRollBounds();
    this.syncSharedState();
  }

  /**
   * GM edit of an Initiative Dice count box (participant row *and* the Stats
   * tab - both bind one-way and call this). A thin wrapper over the single
   * dice-count funnel; the engine owns the 5D6 cap, the roll and the Score
   * math (brief F5 / criteria 7-9, p. 160, pp. 52/288).
   */
  onParticipantDiceCountChanged(p: IParticipant, value: number) {
    const result = this.changeParticipantDiceCount(p, value);
    if (result.values.length === 0) {
      // No dice were rolled (not started / not yet rolled / no actual change),
      // so the displayed rolled total may now exceed the new pool's maximum.
      p.diceIni = this.clampInitiativeRoll(p.diceIni, p);
    }
    this.syncSharedState();
  }

  /**
   * Single component-side entry point for "this participant's Initiative Dice
   * count changed". Every GM/session path that changes a dice count goes
   * through here, so none of them can forget the roll-and-Score-delta step
   * (brief F5 / criteria 7-8, p. 160).
   *
   * Two things live here rather than in the engine because they are not rules:
   *  - the `combatManager.started` gate (the engine has no CombatManager
   *    reference, and creating one would be an import cycle). Outside a running
   *    combat there is no running Score to move, so the count is just written.
   *  - `rollGainedDice: false`, the session-protocol case where the *player*
   *    client rolls and submits the gained dice.
   *
   * The engine (`Participant.changeDiceCount`) owns the cap, the roll and the
   * Score arithmetic; this method only decides whether a roll is owed and logs
   * the outcome.
   */
  private changeParticipantDiceCount(
    p: IParticipant,
    newDices: number,
    options: DiceCountChangeOptions = {}
  ): DiceCountChangeResult {
    const clamped = clampInitiativeDiceCount(newDices);
    const rollGainedDice = options.rollGainedDice !== false;
    if (!this.combatManager.started || (!rollGainedDice && clamped > p.dices)) {
      p.setDicesWithoutRoll(clamped);
      return NO_DICE_COUNT_CHANGE;
    }

    const result = p.changeDiceCount(clamped, () => this.rollInitiativeDie());
    if (result.values.length > 0) {
      this.logInitiativeDiceDelta(p, result);
    }
    return result;
  }

  /**
   * Single-die roller seam. Exists so the dice-count paths have one place to
   * stub in tests; the engine takes the roller as a parameter.
   */
  private rollInitiativeDie(): number {
    return rollInitiativeDie();
  }

  /**
   * Log the outcome of a mid-turn dice change to both the local GM log and the
   * shared session log.
   */
  private logInitiativeDiceDelta(p: IParticipant, result: DiceCountChangeResult): void {
    const total = p.getCurrentInitiative();
    const logText = formatInitiativeDeltaLogText(result.values, result.delta, total);
    // appendParticipantRollLog writes the local line too, tagged if hidden.
    this.appendParticipantRollLog(p, logText);
  }

  /**
   * Roll all initiative dice for p, update diceIni, and log the result to
   * both the local GM log and the shared session log (if active).
   */
  private rollAndLogInitiative(p: IParticipant, presetHidden?: boolean): void {
    const values = Array.from({ length: p.dices }, () => Math.floor(Math.random() * 6) + 1);
    p.diceIni = this.clampInitiativeRoll(values.reduce((s, v) => s + v, 0), p);
    const total = p.getCurrentInitiative();
    const intuition = this.getParticipantIntuition(p);
    const baseLabel = this.isAstral(p) && this.asAstral(p).astralProjecting
      ? `INT×2(${intuition * 2})`
      : this.isMatrix(p) && this.asMatrix(p).jackedIn
          && this.asMatrix(p).vrMode !== VRMode.AR && this.asMatrix(p).vrMode !== VRMode.None
          ? `DP(${this.asMatrix(p).dataProcessing}) + INT(${intuition})`
          : `REA(${this.getParticipantReaction(p)}) + INT(${intuition})`;
    const logText = formatInitiativeRollLogText(baseLabel, values, total);
    // appendParticipantRollLog writes the local line too, tagged if hidden.
    this.appendParticipantRollLog(p, logText, presetHidden);
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

  // ── Linked NPC rows (grunt groups) ──────────────────────────────────────
  //
  // All of the rules live in `src/Grunts/`; everything here is plumbing: side
  // maps, undo batching, logging and panel state. See
  // briefs/npc-group-initiative.md.

  /** Template guard: is this participant a linked NPC row? */
  isNpcRow(p: IParticipant): p is NpcRowParticipant {
    return isNpcRow(p);
  }

  /** Template cast, mirroring `asMatrix` / `asAstral`. */
  asNpcRow(p: IParticipant): NpcRowParticipant {
    return p as NpcRowParticipant;
  }

  isRowPanelExpanded(p: IParticipant): boolean {
    return this.expandedRowPanels.has(p);
  }

  toggleRowPanel(p: IParticipant) {
    if (this.expandedRowPanels.has(p)) {
      this.expandedRowPanels.delete(p);
    } else {
      this.expandedRowPanels.add(p);
    }
  }

  /**
   * Create an empty linked NPC row. It takes one slot in the initiative order
   * and rolls one Initiative Test for everybody in it (criteria 1-2, p. 379).
   *
   * Its Edge rating is seeded to 0 and left there: a grunt group has no Edge
   * attribute, so ERIC falls straight through to Reaction, then Intuition, then
   * the coin toss (criterion 10 / Decision 5, p. 159, p. 380). That is the only
   * tie-break behaviour this feature adds - the lieutenant/row tie (p. 381) is
   * manual (criterion 11 / Decision 6).
   */
  addNpcRow(selectNewRow = true): NpcRowParticipant {
    UndoHandler.StartActions();
    const row = new NpcRowParticipant();
    row.name = "NPC Row";
    this.combatManager.addParticipant(row);
    this.participantClaimable.set(row, false);
    this.participantEdgeRatings.set(row, NPC_ROW_EDGE_RATING);
    this.participantReactions.set(row, 3);
    this.participantIntuitions.set(row, 3);
    row.baseIni = this.getParticipantBaseInitiative(row);
    this.participantTieBreakers.set(row, Math.random());
    this.getParticipantId(row);
    this.expandedRowPanels.add(row);
    if (selectNewRow) {
      this.selectActor(row);
    }
    this.syncSharedState();
    this.sort();
    return row;
  }

  /**
   * Add an NPC to a row. Mid-combat this is the reinforcement case: the new
   * NPC inherits the row's current shared Initiative Score directly, with no
   * Initiative Test of its own and no -10-per-elapsed-pass late-entry penalty
   * (criterion 15 / Decision 7, scenario S7).
   */
  addNpcToRow(row: NpcRowParticipant, name?: string, body = 3, willpower = 3): GruntMember {
    UndoHandler.StartActions();
    const member = new GruntMember(name ?? `${row.name || "NPC"} ${row.members.length + 1}`, body, willpower);
    row.addMember(member);
    this.appendSharedLog(row.name || "NPC Row",
      `${member.name} joins the row on shared initiative score ${row.getCurrentInitiative()}`);
    this.syncSharedState();
    this.sort();
    return member;
  }

  /**
   * Damage one NPC in a row.
   *
   * The boxes land on that NPC's own Condition Monitor only (criteria 3-4,
   * p. 379); any Wound Modifier the hit crosses moves the row's *shared*
   * Initiative Score (criterion 5 / Decision 1). That second half is a house
   * rule, so it gets its own log line naming the NPC whose wound caused it -
   * otherwise a GM watching the whole row slow down at once has no way to tell
   * the house rule from a bug (scenario S3).
   */
  applyRowMemberDamage(
    row: NpcRowParticipant,
    member: GruntMember,
    boxes: number,
    type: GruntDamageType
  ) {
    UndoHandler.StartActions();
    const result = row.applyDamageToMember(member, boxes, type);
    if (result.applied > 0) {
      this.appendSharedLog(row.name || "NPC Row",
        `${member.name} took ${result.applied} ${type === "stun" ? "Stun" : "Physical"} `
        + `(${member.damage}/${member.conditionMonitorBoxes})`);
    }
    if (result.scoreDelta !== 0) {
      this.appendSharedLog(row.name || "NPC Row", formatGroupWoundLogText(
        row.name, member.name,
        result.woundModifierAfter - result.woundModifierBefore,
        result.scoreAfter
      ));
    }
    if (result.wentOutOfAction) {
      this.appendSharedLog(row.name || "NPC Row",
        `${member.name} is out of action (${member.finalState})`);
    }
    // Decision 8: the row leaves the order the moment its last member drops.
    for (const spent of this.combatManager.removeSpentNpcRows()) {
      this.appendSharedLog(spent.name || "NPC Row", "every member is out of action - row removed from initiative");
      this.forgetParticipant(spent);
    }
    this.syncSharedState();
    this.sort();
    return result;
  }

  /**
   * Template shorthands for the two damage buttons. Both types go on the same
   * combined track (p. 379); the type is still recorded because it decides
   * alive-or-dead once the NPC drops (p. 379).
   */
  hitRowMemberPhysical(row: NpcRowParticipant, member: GruntMember, boxes = 1) {
    return this.applyRowMemberDamage(row, member, boxes, "physical");
  }

  hitRowMemberStun(row: NpcRowParticipant, member: GruntMember, boxes = 1) {
    return this.applyRowMemberDamage(row, member, boxes, "stun");
  }

  /** Undo a mis-keyed hit / heal an NPC, re-syncing the row's shared score. */
  healRowMember(row: NpcRowParticipant, member: GruntMember, boxes: number) {
    UndoHandler.StartActions();
    const result = row.healMember(member, boxes);
    if (result.healed > 0) {
      this.appendSharedLog(row.name || "NPC Row",
        `${member.name} healed ${result.healed} (${member.damage}/${member.conditionMonitorBoxes})`);
    }
    this.syncSharedState();
    this.sort();
    return result;
  }

  /**
   * Detach an NPC from its row onto its own initiative row (criterion 12).
   * Required for an augmented specialist or lieutenant acting on its own score
   * (p. 379-381), for an NPC changing Initiative type (criterion 13), and for
   * any NPC that needs an Interrupt Action, which row members cannot take
   * (criterion 17 / Decision 3, scenario S8).
   *
   * The detached NPC is a normal participant from here on: it has not rolled,
   * so the GM rolls its own Initiative Test, and `addParticipant` applies the
   * ordinary late-entry penalty for elapsed passes (p. 160). Decision 7's "no
   * penalty" covers joining a row, not leaving one.
   */
  detachRowMember(
    row: NpcRowParticipant,
    member: GruntMember,
    factory: () => Participant = () => new Participant()
  ): Participant | null {
    UndoHandler.StartActions();
    const detached = row.detachMember(member, factory);
    if (!detached) {
      return null;
    }
    this.combatManager.addParticipant(detached);
    this.participantClaimable.set(detached, false);
    this.participantEdgeRatings.set(detached, this.getParticipantEdgeRatingValue(row));
    this.participantReactions.set(detached, this.getParticipantReactionValue(row));
    this.participantIntuitions.set(detached, this.getParticipantIntuitionValue(row));
    this.participantTieBreakers.set(detached, Math.random());
    const id = this.getParticipantId(detached);
    this.lastKnownDamage.set(id, {
      physical: Math.max(0, Number(detached.physicalDamage || 0)),
      stun: Math.max(0, Number(detached.stunDamage || 0))
    });
    this.appendSharedLog(row.name || "NPC Row",
      `${member.name} detached from the row onto their own initiative`);
    for (const spent of this.combatManager.removeSpentNpcRows()) {
      this.forgetParticipant(spent);
    }
    this.syncSharedState();
    this.sort();
    return detached;
  }

  /** Remove an NPC from a row outright (GM correction, no standalone entry). */
  removeRowMember(row: NpcRowParticipant, member: GruntMember) {
    UndoHandler.StartActions();
    row.removeMember(member);
    this.syncSharedState();
    this.sort();
  }

  /**
   * Drop every GM-local side-map entry for a participant that has left the
   * encounter. Side-map bookkeeping is manual and keyed by object identity
   * (ARCHITECTURE.md §8), so anything that removes a participant outside
   * `btnDelete_Click` has to do this too.
   */
  private forgetParticipant(p: IParticipant) {
    this.declaredActionSelections.delete(p);
    const id = this.participantIds.get(p);
    if (id) {
      this.lastKnownDamage.delete(id);
    }
    this.participantIds.delete(p);
    this.participantOwners.delete(p);
    this.participantClaimable.delete(p);
    this.participantEdgeRatings.delete(p);
    this.participantReactions.delete(p);
    this.participantIntuitions.delete(p);
    this.participantTieBreakers.delete(p);
    this.expandedRowPanels.delete(p);
    this.expandedDeckPanels.delete(p);
    this.expandedAstralPanels.delete(p);
    if (this.selectedActor === p) {
      this.selectedActor = null;
    }
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
    // Name captured before the promote: that swaps the participant instance.
    const astralName = p.name || "";
    const ap = this.promoteToAstralParticipant(p);
    this.appendParticipantEventLog(astralName, PLAYER_COMMAND_LOG_TEXT.awakened);
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
    // Name captured before the demote: that swaps the participant instance.
    const astralName = p.name || "";
    this.demoteFromAstralParticipant(p as AstralParticipant);
    this.appendParticipantEventLog(astralName, PLAYER_COMMAND_LOG_TEXT.awakenedRemoved);
    this.syncSharedState();
    this.sort();
  }

  /**
   * Enter or leave astral space. Both halves of the Initiative change are a
   * delta on the running Score (brief "Astral projection mid-turn", p. 160):
   *  - the attribute half (REA+INT <-> INT x 2) rides the `baseIni` setter;
   *  - the dice half is a *relative* +1/-1 on the Initiative Dice count
   *    (Astral base 2D6 vs Physical 1D6, p. 159), pushed through the single
   *    dice-count funnel so the gained/lost die is actually rolled and applied
   *    to the running Score - "gains the die (and the change in Initiative)
   *    for their Astral Initiative during that Combat Turn" (p. 160).
   *
   * Relative rather than absolute so a magician already carrying bonus
   * Initiative Dice keeps them. Outside a running combat, or before this
   * turn's Initiative Test, the funnel just writes the count (no roll owed).
   *
   * The return trip subtracts the **realized** outbound gain
   * (`projectionDiceGain`), not the constant: a dice decrease "rolls the number
   * of lost dice and subtracts the total" (brief F5 / criterion 8, p. 160), so
   * you only roll and subtract dice you actually lose. A magician already at
   * the 5D6 cap (pp. 52/288) gains nothing on the way out - the cap absorbs it,
   * nothing is rolled, the Score does not move - and so must lose nothing on
   * the way back. The round trip nets to zero dice and zero Score.
   */
  toggleAstralProjecting(p: IParticipant): void {
    if (!this.isAstral(p)) return;
    UndoHandler.StartActions();
    const ap = p as AstralParticipant;
    ap.astralProjecting = !ap.astralProjecting;
    ap.blocksPhysicalActions = ap.astralProjecting;
    ap.baseIni = this.getParticipantBaseInitiative(ap);
    const countBefore = ap.dices;
    const requested = ap.astralProjecting
      ? countBefore + ASTRAL_PROJECTION_DICE_DELTA
      : countBefore - ap.projectionDiceGain;
    this.changeParticipantDiceCount(ap, requested);
    // Record what the outbound trip actually achieved (the funnel clamps to the
    // 5D6 cap, so this can be less than requested, or 0); clear it on return.
    ap.projectionDiceGain = ap.astralProjecting ? ap.dices - countBefore : 0;
    this.appendParticipantEventLog(
      ap.name || "",
      ap.astralProjecting
        ? PLAYER_COMMAND_LOG_TEXT.astralProjecting
        : PLAYER_COMMAND_LOG_TEXT.astralReturned
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

  /** Human-readable name of a VR mode, for the log. */
  private vrModeLabel(mode: VRMode): string {
    return mode === VRMode.HotSim ? "Hot Sim"
         : mode === VRMode.ColdSim ? "Cold Sim"
         : "AR";
  }

  gmJackIn(p: IParticipant): void {
    if (!this.isMatrix(p)) return;
    UndoHandler.StartActions();
    const mp = p as MatrixParticipant;
    // Same distinction the configure_deck branch makes: this button is both
    // "Jack In" and "Switch Mode", and only the previous state says which.
    const wasJackedIn = mp.jackedIn;
    const mode = this.getPendingVrMode(p);
    // Mid-combat jack in: the base stat delta is automatic via baseIni; the
    // dice half rolls only the gained/lost dice and applies the total to the
    // running Score (brief F5 / criteria 7-8, p. 160). Outside a running
    // combat the funnel just writes the count.
    this.applyVRMode(mp, mode);
    mp.jackedIn = true; // force true even for AR so Phase 2 shows
    this.pendingVrModes.set(p, mode); // keep pending = active mode so Switch Mode starts disabled
    const modeLabel = this.vrModeLabel(mode);
    this.appendParticipantEventLog(
      p.name || "",
      wasJackedIn
        ? PLAYER_COMMAND_LOG_TEXT.switchedVrMode(modeLabel)
        : PLAYER_COMMAND_LOG_TEXT.jackedIn(modeLabel)
    );
    this.syncSharedState();
    this.sort();
  }

  gmJackOut(p: IParticipant): void {
    if (!this.isMatrix(p)) return;
    UndoHandler.StartActions();
    const mp = p as MatrixParticipant;
    // Jack Out: clear VR mode, restore physical initiative.
    mp.vrMode = VRMode.None;
    mp.jackedIn = false;
    mp.blocksPhysicalActions = false;
    const reaction = this.participantReactions.get(mp) ?? 0;
    const intuition = this.getParticipantIntuition(mp);
    mp.baseIni = reaction + intuition;
    this.pendingVrModes.set(p, VRMode.AR);
    // Mid-combat jack out — base stat delta automatic via baseIni; the dice
    // half rolls the lost dice and subtracts the total (brief F5 / criterion
    // 8, p. 160). Outside a running combat the funnel just writes the count.
    this.changeParticipantDiceCount(mp, PHYSICAL_INITIATIVE_DICE);
    this.appendParticipantEventLog(p.name || "", PLAYER_COMMAND_LOG_TEXT.jackedOut);
    this.syncSharedState();
    this.sort();
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
    // Shared field list: includes the running Initiative Score backing
    // fields, so an in-place type swap keeps the participant's current Score.
    for (const f of PARTICIPANT_BASE_BACKING_FIELDS) {
      dst[f] = src[f];
    }
    // Same participant, new class: the action history comes along, so
    // Initiative already committed to Interrupt Actions stays committed
    // (and a persisting one such as Full Defense keeps holding). The
    // reduction happens at the time of the Interrupt Action and is not
    // reversible by a type swap (brief F9, p. 167).
    dst["_actionHistory"] = [ ...(src["_actionHistory"] as Action[]) ];
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
    // In-place type swap: the new instance already carries the running
    // Initiative Score, so it must not take the late-entry decay again
    // (brief F6, p. 160 - subtract 10 per elapsed pass once, not twice).
    this.combatManager.addParticipant(mp, true);
    return mp;
  }

  private demoteToParticipant(mp: MatrixParticipant): Participant {
    const p = new Participant();
    const src = mp as unknown as Record<string, unknown>;
    const dst = p as unknown as Record<string, unknown>;
    // Shared field list: includes the running Initiative Score backing
    // fields, so an in-place type swap keeps the participant's current Score.
    for (const f of PARTICIPANT_BASE_BACKING_FIELDS) {
      dst[f] = src[f];
    }
    // Same participant, new class: the action history comes along, so
    // Initiative already committed to Interrupt Actions stays committed
    // (and a persisting one such as Full Defense keeps holding). The
    // reduction happens at the time of the Interrupt Action and is not
    // reversible by a type swap (brief F9, p. 167).
    dst["_actionHistory"] = [ ...(src["_actionHistory"] as Action[]) ];
    const reaction = this.participantReactions.get(mp) ?? 0;
    const intuition = this.participantIntuitions.get(mp) ?? 0;
    // Losing the deck's Initiative Dice mid-combat is a dice *decrease*: the
    // newly-rolled lost dice are subtracted from the running Score "along with
    // any decrease to their Initiative Attribute" (p. 160). `baseIni` covers
    // the attribute half automatically; the dice half goes through the same
    // funnel as gmJackOut().
    p.baseIni = reaction + intuition;
    this.changeParticipantDiceCount(p, PHYSICAL_INITIATIVE_DICE);
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
    // In-place type swap: the new instance already carries the running
    // Initiative Score, so it must not take the late-entry decay again
    // (brief F6, p. 160 - subtract 10 per elapsed pass once, not twice).
    this.combatManager.addParticipant(p, true);
    return p;
  }

  private promoteToAstralParticipant(p: IParticipant): AstralParticipant {
    const ap = new AstralParticipant();
    const src = p as unknown as Record<string, unknown>;
    const dst = ap as unknown as Record<string, unknown>;
    // Shared field list: includes the running Initiative Score backing
    // fields, so an in-place type swap keeps the participant's current Score.
    for (const f of PARTICIPANT_BASE_BACKING_FIELDS) {
      dst[f] = src[f];
    }
    // Same participant, new class: the action history comes along, so
    // Initiative already committed to Interrupt Actions stays committed
    // (and a persisting one such as Full Defense keeps holding). The
    // reduction happens at the time of the Interrupt Action and is not
    // reversible by a type swap (brief F9, p. 167).
    dst["_actionHistory"] = [ ...(src["_actionHistory"] as Action[]) ];
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
    // In-place type swap: the new instance already carries the running
    // Initiative Score, so it must not take the late-entry decay again
    // (brief F6, p. 160 - subtract 10 per elapsed pass once, not twice).
    this.combatManager.addParticipant(ap, true);
    return ap;
  }

  private demoteFromAstralParticipant(ap: AstralParticipant): Participant {
    const p = new Participant();
    const src = ap as unknown as Record<string, unknown>;
    const dst = p as unknown as Record<string, unknown>;
    // Shared field list: includes the running Initiative Score backing
    // fields, so an in-place type swap keeps the participant's current Score.
    for (const f of PARTICIPANT_BASE_BACKING_FIELDS) {
      dst[f] = src[f];
    }
    // Same participant, new class: the action history comes along, so
    // Initiative already committed to Interrupt Actions stays committed
    // (and a persisting one such as Full Defense keeps holding). The
    // reduction happens at the time of the Interrupt Action and is not
    // reversible by a type swap (brief F9, p. 167).
    dst["_actionHistory"] = [ ...(src["_actionHistory"] as Action[]) ];
    const reaction = this.participantReactions.get(ap) ?? 0;
    const intuition = this.participantIntuitions.get(ap) ?? 0;
    // Dropping back to Physical initiative is a dice *decrease* exactly like
    // the Matrix jack-out twin (demoteToParticipant): `baseIni` covers the
    // attribute half, and the dice half must roll the lost dice and subtract
    // the total (brief F5 / criterion 8, p. 160). This site previously
    // assigned the count directly and skipped the roll entirely.
    p.baseIni = reaction + intuition;
    this.changeParticipantDiceCount(p, PHYSICAL_INITIATIVE_DICE);
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
    // In-place type swap: the new instance already carries the running
    // Initiative Score, so it must not take the late-entry decay again
    // (brief F6, p. 160 - subtract 10 per elapsed pass once, not twice).
    this.combatManager.addParticipant(p, true);
    return p;
  }

  onMatrixDPChanged(p: IParticipant, value: number): void {
    if (!this.isMatrix(p)) return;
    UndoHandler.StartActions();
    p.dataProcessing = Math.max(1, Number(value || 1));
    p.baseIni = this.getParticipantBaseInitiative(p);
    this.syncSharedState();
  }

  /**
   * "Switch Mode" control. A mid-combat interface-mode switch is a dice change
   * like any other: `applyVRMode` routes it through the dice-count funnel, so
   * the gained/lost dice are rolled and applied to the running Score (brief
   * F5 / criteria 7-8, p. 160). This handler previously changed the dice count
   * with no roll and no Score effect at all.
   */
  onVRModeChange(p: IParticipant, mode: VRMode): void {
    if (!this.isMatrix(p)) return;
    UndoHandler.StartActions();
    this.applyVRMode(p as MatrixParticipant, mode);
    LogHandler.log(this.currentBTTime, `${p.name} VR mode → ${mode}`);
    this.syncSharedState();
  }

  /**
   * Apply a Matrix interface mode: the Initiative attribute half directly, the
   * Initiative Dice half through `changeParticipantDiceCount` - the single
   * funnel that owns the cap, the delta roll and the Score movement.
   */
  private applyVRMode(
    mp: MatrixParticipant,
    mode: VRMode,
    options: DiceCountChangeOptions = {}
  ): DiceCountChangeResult {
    const intuition = this.getParticipantIntuition(mp);
    if (mode === VRMode.AR) {
      mp.vrMode = VRMode.AR;
      const reaction = this.participantReactions.get(mp) ?? 0;
      mp.baseIni = reaction + intuition;
      mp.jackedIn = false;
      mp.blocksPhysicalActions = false;
      return this.changeParticipantDiceCount(
        mp, MatrixParticipant.initiativeDiceForMode(VRMode.AR), options
      );
    }
    let result: DiceCountChangeResult = NO_DICE_COUNT_CHANGE;
    mp.applyJackInMode(mode, intuition, target => {
      result = this.changeParticipantDiceCount(mp, target, options);
    });
    return result;
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
    const targets = this.combatManager.participants.items.filter(participant => {
      if (participant.ooc || participant.diceIni > 0) {
        return false;
      }
      if (!includePlayers && this.participantOwners.has(participant)) {
        return false;
      }
      return true;
    });
    // One GM action, one visibility decision: resolve (and spend) it once so a
    // batch of NPC rolls is hidden or shown as a unit rather than the one-shot
    // being burned by whichever participant happens to come first.
    //
    // The one-shot is only spent if this batch will actually roll at least one
    // GM-run participant. A batch that rolls nothing (the GM tapping the button
    // to check status when nothing is outstanding) or that rolls only
    // player-claimed characters - who are never hidden - must leave the arming
    // intact for the next real GM roll (brief p. 330).
    const rollsGmControlled = targets.some(p => this.isGmControlled(p));
    const hiddenForBatch = rollsGmControlled ? this.consumeGmRollVisibility() : false;
    // Batch marker, emitted before the rolls so `assignLogOrder` places it
    // ahead of them and the cascade reads as one GM action rather than as an
    // organic run of individual rolls. Suppressed when nothing is outstanding.
    //
    // It follows the batch's own visibility decision, not a separate one: a
    // visible "the GM rolled 4 characters" alongside four hidden rolls would
    // leak the existence of the very rolls the GM opted out of showing
    // (RULINGS.md, GM roll visibility).
    if (targets.length > 0) {
      const summary = includePlayers
        ? GM_LOG_TEXT.forceRolledBatch(targets.length)
        : GM_LOG_TEXT.nonPlayerRolledBatch(targets.length);
      // `this.shareRoomCode` is part of the hidden test, exactly as in
      // `appendParticipantRollLog`: `appendGmOnlyLog` has no session check of
      // its own, so without it a GM with no session open and GM rolls set to
      // hidden would get a "(hidden from players)" marker in their local
      // Action Log with no players to hide it from. With no session both
      // branches must produce nothing (AC12), which `appendSharedLog`'s early
      // return already does.
      if (hiddenForBatch && this.shareRoomCode) {
        this.appendGmOnlyLog("GM", summary);
      } else {
        this.appendSharedLog("GM", summary);
      }
    }
    for (const participant of targets) {
      if (this.participantOwners.has(participant)) {
        rolledPlayer = true;
      }
      this.rollAndLogInitiative(participant, hiddenForBatch);
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
    this.appendSharedLog(
      "GM",
      formatPassStartLogText(this.combatManager.initiativePass, INITIATIVE_PASS_DECAY)
    );
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

  /**
   * Stop the decode animation on every entry from `index` onward. Used when an
   * out-of-order entry is inserted and the rows below it shift down; the
   * animations are keyed by row index, so a stale one would paint on the wrong
   * line. The entry's final text is what shows instead.
   */
  private cancelSharedLogDecodeFrom(index: number) {
    for (const key of [ ...this.sharedLogDecodeTimers.keys() ]) {
      if (key >= index) {
        window.clearInterval(this.sharedLogDecodeTimers.get(key));
        this.sharedLogDecodeTimers.delete(key);
      }
    }
    for (const key of [ ...this.sharedLogDecodeText.keys() ]) {
      if (key >= index) {
        this.sharedLogDecodeText.delete(key);
      }
    }
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

  /**
   * Keep the displayed rolled-dice total inside its input bounds. This runs on
   * *any* participant field edit (including unrelated ones such as the name
   * field), so it must never move the running Initiative Score as a side
   * effect - the Score only changes when dice are actually rolled (brief F5,
   * p. 160).
   *
   * Because the clamp is Score-neutral by design, it can leave the rolled-total
   * box showing a number that no longer reconciles with the running Score
   * (attribute + displayed total != Score) - e.g. a decker who rolled 18 on 3D6
   * and then lost two dice to a small lost-dice roll. That is correct per the
   * rules but silently confusing at the table, so every clamp that opens such a
   * gap emits a log line naming both numbers. The Score itself is never
   * touched here.
   */
  private enforceParticipantRollBounds() {
    for (const participant of this.combatManager.participants.items) {
      const clamped = this.clampInitiativeRoll(participant.diceIni, participant);
      if (participant.diceIni !== clamped) {
        participant.setDiceIniWithoutScoreChange(clamped);
        this.logRolledTotalClamp(participant, clamped);
      }
    }
  }

  /**
   * Log a Score-neutral rolled-total clamp when it leaves the displayed total
   * irreconcilable with the Initiative Score the GM can actually see, so the
   * gap is never silent. Purely a legibility signal - no Score math happens
   * here (brief F5, p. 160).
   *
   * Both the guard and the message read `getCurrentInitiative()`, the
   * *effective* Score (running Score + Initiative committed to Interrupt
   * Actions, brief F9, p. 167) - the same value the Ini column, the roll log
   * and the sort comparator use. Reading the raw `currentInitiativeScore`
   * backing field instead would name a number that appears nowhere on screen
   * for anyone holding Full Defense.
   *
   * The message states the two numbers and does not claim the clamp caused the
   * gap: ordinary pass-boundary decay (-10, p. 160) opens the same gap on its
   * own, and this function cannot tell the two apart. It does still state the
   * mismatch outright - without that clause the line puts two numbers side by
   * side and leaves the GM to notice the gap for themselves, which is the
   * silence this log line exists to break.
   *
   * It names the participant's Initiative Dice count, rolled total, Initiative
   * attribute and Score, so for a GM-run participant it is subject to the same
   * visibility decision as the roll it describes (brief p. 330) - hence it goes
   * out through `appendParticipantRollLog` and not straight to the shared log.
   * The decision is *read* rather than consumed: this line is a consequence of
   * a dice-count change, not a roll of its own, so it must not spend the "hide
   * next roll" one-shot the GM armed for something else.
   */
  private logRolledTotalClamp(p: IParticipant, clamped: number) {
    const effectiveScore = p.getCurrentInitiative();
    const reconcilable = p.initiativeAttribute + clamped === effectiveScore;
    if (reconcilable) {
      return;
    }
    const logText =
      `initiative roll clamped to ${clamped} (max ${p.dices}D6); `
      + `Score is ${effectiveScore} `
      + `(attribute ${p.initiativeAttribute} + rolled total do not match)`;
    this.appendParticipantRollLog(p, logText, this.isGmRollHiddenFromPlayers());
  }

}
