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
import {
  DetachedGruntParticipant, GruntMember, NpcRowParticipant,
  hasGruntConditionMonitor, isNpcRow, createStandaloneGrunt, mergeGruntsIntoRow,
  DEFAULT_GRUNT_ATTRIBUTE, MIN_MERGEABLE_GRUNTS
} from "Grunts";
import type { GruntDamageType, GruntMergeResult } from "Grunts";
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
 * Name prefix for a grunt created with the "Add Grunt" button (brief addendum
 * Decision 9). Numbered per encounter so two grunts never share a name - the
 * combat log names the grunt whose wound or death it records (p. 379).
 */
const STANDALONE_GRUNT_NAME_PREFIX = "Grunt";

/**
 * Name prefix for a row formed by merging standalone grunts (Decision 10).
 * Same default as the "Grunt Group" button's row, and editable in place - the
 * merged grunts keep their own names as the row's members.
 *
 * Numbered from the second merge onwards ("Grunt Group", "Grunt Group 2", ...)
 * by `nextMergedGruntRowName`, for the same reason
 * `STANDALONE_GRUNT_NAME_PREFIX` is numbered: the log's row-level lines (wounds
 * taken by the group, members removed, the row emptying) name the row, and two
 * rows answering to one name make those lines unattributable.
 */
const MERGED_GRUNT_ROW_NAME = "Grunt Group";

/**
 * Matches a row name this app generated rather than one the GM typed:
 * `"Grunt Group"`, `"Grunt Group 2"`, ... Used to decide whether the row's own
 * name is a sensible prefix for its NPCs' default names (brief Decision 19 -
 * an unrenamed row must not produce log lines that say its name twice).
 */
const DEFAULT_ROW_NAME_PATTERN = new RegExp(`^${MERGED_GRUNT_ROW_NAME}(?: (\\d+))?$`);

/**
 * Default name prefix for an NPC added to a row the GM has not renamed yet.
 *
 * Deliberately not the row's own name (which would read "Grunt Group: Grunt
 * Group 1 is out of action", brief Decision 19) and deliberately not
 * `STANDALONE_GRUNT_NAME_PREFIX` either, which is already the namespace of the
 * "Add Grunt" button's standalone NPCs - two combatants answering to "Grunt 1"
 * would make the log's per-NPC lines unattributable (p. 379 records
 * alive-or-dead per NPC).
 */
const DEFAULT_ROW_MEMBER_NAME_PREFIX = "NPC";

/**
 * Lowest Initiative Score that still buys an Action Phase.
 *
 * A participant needs a Score **above** this to take a Simple or Complex
 * action; at or below it they still get one Free Action per pass and still
 * defend normally (brief "NPC Group Initiative" Decision 16, `RULINGS.md`
 * 2026-08-07, p. 159-160). Applies to every participant type - PC, ordinary
 * NPC, standalone grunt and linked row alike.
 */
const MIN_ACTION_PHASE_INITIATIVE_SCORE = 0;

/** Why the Simple / Complex categories are shut at Score 0 or below. */
const NO_ACTION_PHASE_MESSAGE =
  "Initiative Score 0 or below: no Action Phase this pass — one Free Action only "
  + "(defending is unaffected).";

/**
 * How long a merge result stays on screen before it clears itself, in
 * milliseconds.
 *
 * The message answers a question the GM asked one tap ago ("did that merge, and
 * if not why not"). Left up, it reads as current state minutes later, next to a
 * selection that no longer has anything to do with it. Long enough to read a
 * three-line refusal, short enough that it is gone by the next thing the GM
 * does.
 */
export const MERGE_MESSAGE_DISMISS_MS = 12000;

/**
 * Damage Value the row panel's damage controls start on: one box, so an
 * ordinary chip of damage is still a single tap.
 */
const DEFAULT_ROW_MEMBER_DAMAGE_VALUE = 1;

/**
 * Upper bound on a typed Damage Value. Nothing in the rules caps DV, but a
 * grunt's track is at most 8 + ceil(max(Body, Willpower)/2) boxes and takes no
 * overflow (brief "NPC Group Initiative" criterion 7, p. 379), so anything past
 * this is discarded on application anyway; the cap only stops a fat-fingered
 * entry (a stray extra digit) reaching the log and the alive/dead comparison.
 */
const MAX_ROW_MEMBER_DAMAGE_VALUE = 99;

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
 * Why a `claim_character` command was refused, sent back to the requesting
 * player as a `claim_denied` command and written to the GM's own log.
 *
 * A refused claim used to be a silent `return` on the GM side and a "Claim
 * request sent." that never resolved on the player side. That is unrecoverable
 * at the table in the one case that matters: a player who reloads during a
 * server restart comes back with a new token while the GM's pushed state still
 * carries the old one, so their own character is permanently unclaimable and
 * neither screen says why.
 */
const CLAIM_DENIED_REASON = {
  owned: "already claimed by another player",
  notClaimable: "not marked claimable by the GM",
  missing: "no longer in the encounter"
} as const;

/** Shared-log wording for the GM releasing a claim by hand. */
const CLAIM_FORCE_RELEASED_TEXT = "claim cleared by the GM";

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
  /**
   * Which row member the currently-open Act modal is declaring for (brief
   * "NPC Group Initiative" Decision 23), or `null` for an ordinary
   * participant's own Act. `actModalParticipant` stays the row itself in
   * both cases - the row is what holds the shared Score and Action Phase the
   * modal gates on (Decision 24) - this only says which NPC the declared
   * action gets attributed and logged to, and which NPC's `hasActed` marker
   * is set on submit.
   */
  actModalRowMember: GruntMember | null = null;
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
  /**
   * True between a transport drop and a successful re-authentication. Drives
   * the banner that stops the GM running three more passes while every
   * broadcast is being discarded (spec AC 10).
   */
  shareConnectionLost = false;
  /**
   * What a restore could not bring back, shown to the GM at restore time.
   * Health/damage/OOC participants are outside this change's scope (spec Open
   * Decision 4 chose option (b)), so the loss must at least be stated out loud.
   */
  restoreWarning = "";
  /**
   * Every room code this tab's *live* combat state belongs to, kept across a
   * Close (which clears `shareRoomCode`) so a rejoin can tell "this is my own
   * encounter coming back" from "I am joining a room cold".
   *
   * This is the distinguishing signal for push-vs-pull on the explicit Join
   * button (spec Open Decision 6). It is in-memory only: a page reload or a new
   * tab starts blank, which is exactly the fresh-tab case that must still pull.
   *
   * **A set, not a single code** (round-3 fix 6). Create Player Session used to
   * *reassign* it to the new room, while its own confirmation dialog told the GM
   * "rejoining with code {old} brings it back". After a mis-tap that promise was
   * false: the old code was no longer this tab's live encounter, so rejoining it
   * took the destructive pull path and discarded the very encounter the dialog
   * had just said was safe. One `CombatManager` can legitimately be the live
   * source of truth for several codes at once - creating or joining another room
   * does not stop it being the truth for the one it just left - so membership is
   * additive.
   *
   * Entries leave on exactly two events: the room is destroyed (End Room /
   * an external end), or this tab's encounter is *replaced* by a pull, at which
   * point every earlier association is genuinely stale.
   */
  private liveEncounterRooms = new Set<string>();

  /**
   * Per-room snapshot of participant IDs, taken whenever a room is added to
   * `liveEncounterRooms` (round-4 fix D6).
   *
   * `liveEncounterRooms` membership is additive and never expires on its own
   * (round-3 fix 6, by design - see the doc comment above), which is provably
   * wrong once this tab has gone on to become the live source of truth for a
   * *different* encounter under a different room code: the two share nothing,
   * but a blind push would still silently overwrite the old room's real saved
   * state with the new, unrelated one. `liveEncounterDivergedFrom()` compares
   * the current on-screen participants against what was fingerprinted "as
   * when the room was joined/created" (not continuously updated while play
   * continues there - see that method's doc comment for why) to tell the two
   * cases apart.
   */
  private liveEncounterFingerprints = new Map<string, Set<string>>();

  /**
   * Single-code view of `liveEncounterRooms`: the most recent one, or "".
   * Assigning replaces the whole set (used by teardown paths and tests).
   */
  private get liveEncounterRoomCode(): string {
    let last = "";
    for (const room of this.liveEncounterRooms) {
      last = room;
    }
    return last;
  }

  private set liveEncounterRoomCode(room: string) {
    this.liveEncounterRooms.clear();
    this.liveEncounterFingerprints.clear();
    if (room) {
      this.markRoomLive(room);
    }
  }

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
  /**
   * The Damage Value the GM is about to apply to each NPC in a row.
   *
   * Needed because p. 379 settles a downed grunt's alive-or-dead from the DV of
   * the **final attack** compared against Body — so the tracker has to be told
   * the attack's real DV, not just "one more box". Purely transient view state
   * (the same class of thing as `expandedRowPanels`), so it is not routed
   * through `Undoable.Set`: it holds nothing that survives applying the damage,
   * and the damage application itself is fully undoable.
   */
  private readonly rowMemberDamageValues = new Map<GruntMember, number>();
  /**
   * The Damage Value queued against a standalone / detached grunt's next hit
   * (brief "NPC Group Initiative" Decision 20, `RULINGS.md` 2026-08-13). Same
   * purpose and shape as `rowMemberDamageValues`, keyed by the participant
   * itself since a standalone grunt has no `GruntMember` to key off. The
   * Condition Monitor widget's box-clicking can only ever record as many
   * boxes as are left on the track, which makes a killing blow bigger than
   * the remaining boxes unrecordable for p. 379's alive-or-dead comparison.
   */
  private readonly gruntDamageValues = new Map<IParticipant, number>();
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
    // A linked NPC row can be found spent by the engine itself
    // (`advanceToNextActors()`'s pre-step), not just by a GM tap. Registering
    // here means the log line happens once, in exactly the same way, whichever
    // path noticed it.
    this.combatManager.onSpentNpcRowsFlagged = rows => this.onSpentNpcRowsFlagged(rows);
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
    this.clearMergeMessageDismiss();
    this.clearSharedLogDecodeAnimations();
    this.clearLocalLogDecodeAnimations();
    this.sessionSync.disconnect();
    this.osThresholdSub?.unsubscribe();
    // The CombatManager is a singleton and outlives this component; leaving a
    // callback into a destroyed component registered would log spent rows
    // into a tracker that is no longer on screen.
    if (this.combatManager.onSpentNpcRowsFlagged) {
      this.combatManager.onSpentNpcRowsFlagged = null;
    }
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
    const previousRoom = this.shareRoomCode;
    if (!await this.confirmCreateShareSession(previousRoom)) {
      return;
    }
    try {
      this.sessionSync.connect();
      const { room } = await this.sessionSync.createSession();
      this.shareRoomCode = room;
      this.shareJoinCode = room;
      // From here on this tab is the live source of truth for that code, so a
      // later Close + Join of the same code pushes rather than pulls.
      //
      // `markRoomLive`, not `liveEncounterRoomCode =` (round-3 fix 6): the
      // encounter on screen is unchanged by creating a room, so it is still
      // the live truth for `previousRoom` too. That is what makes the
      // dialog's "rejoining with code {previous} brings it back" actually
      // true - a rejoin of the old code pushes this encounter back rather
      // than pulling the old room's lossy snapshot over the top of it. Both
      // codes are fingerprinted against the same (unchanged) participants
      // right now (round-4 fix D6).
      this.markRoomLive(room);
      this.shareConnectionLost = false;
      this.restoreWarning = "";
      this.sharedLogEntries = this.reseedLogOrder([]);
      this.clearSharedLogDecodeAnimations();
      this.attachShareListeners();
      this.syncSharedState();
      // The old code is the GM's only handle on the room they just walked out
      // of, and this button has just overwritten the join box with the new one.
      this.shareInfo = previousRoom && previousRoom !== room
        ? `Created room ${room}. Left room ${previousRoom} - it is kept, and rejoining with code `
          + `${previousRoom} brings it back.`
        : `Created room ${room}.`;
    } catch (err) {
      this.shareError = err instanceof Error ? err.message : "Unable to create share session.";
    }
  }

  /**
   * The two things "Create Player Session" destroys or abandons, confirmed
   * before either happens (review defects D3 / spec AC 9, AC 15).
   *
   * 1. **Hidden GM log entries.** A fresh session reseeds `sharedLogEntries` to
   *    `[]`, and the server never had the hidden ones - this tab is the only
   *    copy. The old gate asked `hasRetainedHiddenLogEntries()`, which is
   *    `shareRoomCode ? [] : getHiddenLogEntries()`, so it answered *false*
   *    exactly when a session was live: the dangerous case never prompted. Ask
   *    about whatever hidden entries exist, live room or not - the same way
   *    End Room (AC 17) counts them.
   * 2. **The room this tab is already running.** Creating a new session detaches
   *    this GM socket from the old room server-side, so players still sitting in
   *    it are left with no GM. That is the same abandoned-room consequence AC 15
   *    made Join confirm; this button is the second path to it.
   *
   * Returns true when the create may go ahead.
   */
  private async confirmCreateShareSession(previousRoom: string): Promise<boolean> {
    const hiddenCount = this.getHiddenLogEntries().length;
    if (hiddenCount === 0 && !previousRoom) {
      return true;
    }
    const parts: string[] = [];
    if (previousRoom) {
      parts.push(`This tab is running room ${previousRoom}. Creating a new session leaves that room: `
        + `anyone still in ${previousRoom} sees no GM connected. The room itself is kept and rejoining `
        + `with code ${previousRoom} brings it back.`);
    }
    if (hiddenCount > 0) {
      parts.push(`${hiddenCount} hidden GM log ${hiddenCount === 1 ? "entry is" : "entries are"} held only in `
        + `this tab. The server never received ${hiddenCount === 1 ? "it" : "them"}, so starting a new session `
        + `discards ${hiddenCount === 1 ? "it" : "them"} permanently. Rejoin `
        + `${previousRoom ? `room ${previousRoom}` : "the old room code"} instead to keep `
        + `${hiddenCount === 1 ? "it" : "them"}. This cannot be undone.`);
    }
    const confirmed = await this.confirmationDialog.confirm(
      parts.join(" "),
      previousRoom ? `Leave room ${previousRoom} and create a new one?` : "Discard retained hidden entries?",
      hiddenCount > 0 ? "Discard and Create" : "Leave and Create",
      "Cancel"
    );
    if (confirmed) {
      return true;
    }
    if (hiddenCount > 0 && !previousRoom) {
      this.shareInfo = "Kept the retained hidden entries; no new session created.";
    } else if (hiddenCount > 0) {
      this.shareInfo = `Kept room ${previousRoom} and its hidden entries; no new session created.`;
    } else {
      this.shareInfo = `Kept room ${previousRoom}; no new session created.`;
    }
    return false;
  }

  /**
   * Does this tab still hold the live encounter for `room`?
   *
   * True for any code this tab has been the live GM of whose encounter is still
   * the one on screen - a GM who tapped Close Room (or Create Player Session, or
   * was closed out from another tab) and is now rejoining that code. A fresh
   * tab, a reloaded tab, or a tab joining a room it has never run all answer
   * false and must pull.
   */
  private holdsLiveEncounterFor(room: string): boolean {
    return !!room
      && this.liveEncounterRooms.has(room)
      && this.combatManager.participants.items.length > 0;
  }

  /** IDs of every participant currently on screen (see `getParticipantId`). */
  private currentParticipantIdSet(): Set<string> {
    return new Set(this.combatManager.participants.items.map(p => this.getParticipantId(p)));
  }

  /**
   * Record `room` as a code whose live encounter this tab holds - additive
   * with any other room it already holds one for (round-3 fix 6) - and
   * fingerprint what that means right now for `liveEncounterDivergedFrom()`
   * (round-4 fix D6).
   */
  private markRoomLive(room: string): void {
    this.liveEncounterRooms.add(room);
    this.liveEncounterFingerprints.set(room, this.currentParticipantIdSet());
  }

  /**
   * Has this tab's on-screen encounter drifted far enough from `room`'s
   * fingerprint that a blind push (`holdsLiveEncounterFor()` says yes) would
   * actually be a silent, undetected overwrite of that room's real saved
   * state (round-4 fix D6)?
   *
   * Sequence this exists to catch: GM runs room A, taps Create Player Session
   * (now live in both A and B, round-3 fix 6), builds a *completely
   * different* encounter in B over the following hour, then rejoins A by
   * typing its code. `liveEncounterRooms` still has A in it - membership never
   * expires on its own - so without this check the join would silently push
   * the B-derived encounter over A's real saved state while claiming "nothing
   * was replaced".
   *
   * A room with no recorded fingerprint is treated as **not** diverged: that
   * only happens defensively (every `markRoomLive` call sets one), and
   * refusing to push on missing evidence would regress the ordinary
   * mis-tap-and-immediately-recover case (round-3 fix 6) that gave no reason
   * to doubt the association in the first place. Otherwise "diverged" means
   * **zero** participant IDs survive in common with what was fingerprinted
   * "as when the room was joined/created" (spec wording, not a continuously
   * rolling window - see `liveEncounterFingerprints`): ordinary play, adding
   * or removing individual participants from the *same* fight, always leaves
   * at least one survivor. Only a wholesale cast swap zeroes it out, and that
   * is deliberately the only thing this catches - the threshold is a judgment
   * call, documented here per the review defect.
   */
  private liveEncounterDivergedFrom(room: string): boolean {
    const fingerprint = this.liveEncounterFingerprints.get(room);
    if (!fingerprint || fingerprint.size === 0) {
      return false;
    }
    for (const p of this.combatManager.participants.items) {
      if (fingerprint.has(this.getParticipantId(p))) {
        return false;
      }
    }
    return true;
  }

  /**
   * Join by room code. **Push when this tab still holds the encounter; pull
   * only when it does not** (spec Open Decision 6 - the single most damaging
   * thing to get backwards here).
   *
   * `restoreFromSharedState()` unconditionally clears both participant lists and
   * all eight side-maps, rebuilds from the lossy server snapshot (no damage, no
   * health, no OOC participants, no `NpcRowParticipant`/`ICParticipant`, no
   * action history) and wipes undo history. Close Room's own on-screen advice is
   * "rejoin with code X to pick it back up", so a mis-tapped Close followed by
   * that advice would otherwise irreversibly downgrade a live encounter. That is
   * the same hazard `handleSessionReconnected()` already solves for a transport
   * drop, reached through a different trigger, so it gets the same answer: this
   * call is an authentication, not a restore, and the tab re-broadcasts what it
   * already has.
   *
   * The log is merged either way - `mergeHiddenLogEntries` is additive (server
   * history plus GM-local hidden entries), so it destroys nothing.
   *
   * When the tab does *not* hold the live encounter but does hold participants -
   * a different room's encounter, or one built up before any session existed -
   * the pull is destructive and is confirmed first (spec AC 15). A genuinely
   * empty tab has nothing at risk and is never prompted.
   */
  async btnJoinShareSession_Click() {
    this.shareError = "";
    this.shareInfo = "";
    const room = this.shareJoinCode.trim().toUpperCase();
    if (!room) {
      this.shareError = "Enter a room code to join.";
      return;
    }
    const pushLocalState = this.holdsLiveEncounterFor(room);
    if (!pushLocalState && !await this.confirmDestructiveJoin(room)) {
      return;
    }
    try {
      this.sessionSync.connect();
      const { state, log } = await this.sessionSync.joinAsGm(room);
      this.shareRoomCode = room;
      this.shareConnectionLost = false;
      this.restoreWarning = "";
      this.sharedLogEntries = this.mergeHiddenLogEntries(log || []);
      this.clearSharedLogDecodeAnimations();
      this.pendingLogScroll = true;
      this.attachShareListeners();
      if (pushLocalState) {
        if (this.liveEncounterDivergedFrom(room)) {
          // Round-4 fix D6: see `liveEncounterDivergedFrom()`. Nothing this
          // tab still recognises survives from what was fingerprinted when it
          // last became this room's live truth, so the stale association is
          // dropped and the GM is stopped and told, rather than the push
          // proceeding unprompted and silently overwriting the room's real
          // saved state.
          this.liveEncounterRooms.delete(room);
          this.liveEncounterFingerprints.delete(room);
          this.shareInfo = `Room ${room}'s saved encounter no longer matches what this tab is showing - `
            + "this tab looks like it has become a different encounter since. Nothing was sent to the "
            + `room and nothing here was changed. Rejoin ${room} again to pull its saved encounter `
            + "instead, or use \"End Room\" if you meant to replace it.";
        } else {
          // Still the live encounter for every code it was already live for,
          // plus this one (round-3 fix 6).
          this.markRoomLive(room);
          this.syncSharedState();
          this.shareInfo = `Rejoined session ${room} with this tab's live encounter - `
            + "nothing was replaced, and players are back in sync.";
        }
      } else if (this.snapshotHasEncounter(state)) {
        const ooc = this.snapshotOocCount(state);
        const replaced = !!state && Array.isArray(state.participants) && state.participants.length > 0;
        this.restoreFromSharedState(state);
        // A pull *replaces* this tab's encounter, so every earlier association
        // is now stale and the set is reset to this room alone, fingerprinted
        // against what was just restored (round-4 fix D6) - not against what
        // this tab had before the pull, which is exactly what was just
        // discarded. An OOC-only snapshot replaces nothing, so those
        // associations survive.
        if (replaced) {
          this.liveEncounterRoomCode = room;
        } else {
          this.markRoomLive(room);
        }
        if (!replaced) {
          // Everyone in the saved encounter is out of action, so there was
          // nothing on the wire to rebuild - and nothing was replaced here
          // either. Critically, this branch does **not** push: pushing would
          // overwrite a real saved fight with this tab's encounter, which is the
          // silent-overwrite this fix exists to stop (round-3 fix 5).
          this.shareInfo = `Joined session ${room}. Its saved encounter is ${ooc} `
            + `participant${ooc === 1 ? "" : "s"} out of action, which are not broadcast and cannot be `
            + "restored - nothing here was replaced, and nothing was sent to the room.";
        } else {
          this.shareInfo = `Joined session ${room}.`;
        }
      } else {
        // `restoreFromSharedState()` no-ops on an empty snapshot, so nothing was
        // discarded however the confirmation read (review defect D4). Say so,
        // and push what this tab has: the join already made this tab the live
        // encounter for that code, and without a push the room would keep
        // showing players its empty snapshot until the GM's next click.
        this.markRoomLive(room);
        this.syncSharedState();
        this.shareInfo = `Joined session ${room} - it had no saved encounter, so this tab's `
          + "encounter was kept and sent to the room instead.";
      }
    } catch (err) {
      this.shareError = err instanceof Error ? err.message : "Unable to join share session.";
    }
  }

  /**
   * Ask before a Join replaces what is on this screen (spec AC 15).
   *
   * A pull runs `restoreFromSharedState()`, which clears both participant lists
   * and all eight side-maps, rebuilds from the lossy server snapshot and calls
   * `UndoHandler.Initialize()` - so damage, condition monitors, out-of-action
   * participants, committed interrupt actions and the whole undo history go,
   * irreversibly, on one tap of a button sitting next to a text box. Naming the
   * count is the difference between "are you sure" and an informed answer.
   *
   * Returns true when the join may proceed. An empty tab is never prompted:
   * there is nothing to lose, and a prompt on every fresh join would train the
   * GM to dismiss it.
   */
  private async confirmDestructiveJoin(room: string): Promise<boolean> {
    // Round-4 fix D5: a literal `.length === 0` check could only ever fire in
    // a test whose fixture had been emptied after the constructor ran - the
    // constructor's own `addParticipant()` (see below) means a real app
    // instance never has zero participants, so a genuinely fresh tab always
    // showed this "will be discarded" warning for one blank row nobody
    // touched. `isUnusedPlaceholder` treats that row the same as empty.
    const atRisk = this.combatManager.participants.items.filter(p => !this.isUnusedPlaceholder(p));
    const count = atRisk.length;
    if (count === 0) {
      return true;
    }
    // Whether the pull actually replaces anything depends on the target room's
    // snapshot, which this tab cannot see until after `joinAsGm` - and joining
    // first to find out would abandon the current room server-side before the
    // GM had agreed to anything. So the dialog is honest about the condition
    // instead of promising a discard that `restoreFromSharedState`'s
    // empty-snapshot no-op may never perform (review defect D4).
    const confirmed = await this.confirmationDialog.confirm(
      `Joining room ${room} replaces this tab's encounter with that room's last saved broadcast. `
      + `If that room has a saved encounter, ${count} participant${count === 1 ? "" : "s"} on screen `
      + `${count === 1 ? "is" : "are"} discarded, along with damage and condition monitors, anyone `
      + "out of action, committed interrupt actions and the undo history. This cannot be undone. "
      + `If room ${room} turns out to have no saved encounter, nothing is replaced and this tab keeps `
      + "what it has.",
      `Replace this encounter with room ${room}?`,
      "Discard and Join",
      "Cancel"
    );
    if (!confirmed) {
      this.shareInfo = `Kept this tab's encounter; did not join ${room}.`;
      return false;
    }
    return true;
  }

  /**
   * Is `p` the untouched blank row `addParticipant()` seeds in the
   * constructor on every tab load, still exactly as created (round-4 fix D5)?
   *
   * `combatManager.participants` is therefore never literally empty in a real
   * app instance, so `confirmDestructiveJoin()`'s risk check has to treat this
   * one row the same as "nothing on screen", or every fresh tab shows the
   * scary "this will destroy your work" dialog for a row nobody has touched.
   *
   * A field-by-field check rather than a tracked "still pristine" flag on
   * purpose: a flag would have to be cleared by every one of the many
   * participant-mutation paths in this file, which is exactly the kind of
   * manual, uncompiler-checked bookkeeping ARCHITECTURE §8 already flags for
   * the eight side-maps - a mutation path that forgot to clear it would
   * silently defeat the warning this check exists to give. Reading the
   * participant's actual state cannot drift out of sync with an edit nobody
   * remembered to flag.
   */
  private isUnusedPlaceholder(p: IParticipant): boolean {
    // `Object.getPrototypeOf`, not `p.constructor` directly: TypeScript
    // narrows a `.constructor` comparison against a class reference, and
    // since `IParticipant` has no nominal relationship to `Participant` the
    // narrowed type in the rest of this function collapses to `never` -
    // `getPrototypeOf` reads the same fact without tripping that narrowing.
    if (Object.getPrototypeOf(p) !== Participant.prototype) {
      // A promoted/demoted or otherwise subclassed participant (Matrix,
      // Astral, NPC row, grunt) was a deliberate GM action, never the
      // constructor's own placeholder.
      return false;
    }
    if (this.participantOwners.get(p) || this.participantClaimable.get(p)) {
      return false; // claimed or made claimable - a deliberate GM decision
    }
    return p.name === ""
      && p.physicalDamage === 0
      && p.stunDamage === 0
      && p.dices === 1
      && p.diceIni === 0
      && !p.ooc
      && !p.edge
      && !p.hasPainEditor
      && p.actionHistory.length === 0;
  }

  /**
   * Does this room hold real content that a Join must not silently overwrite?
   *
   * Deliberately **not** the same question as "will `restoreFromSharedState()`
   * rebuild anything" (review defect D4 read them as one; round-3 fix 5 splits
   * them). A room whose every participant is out of action broadcasts
   * `participants: []`, because `getSharedParticipants()` filters OOC out - so a
   * real, saved, fully-incapacitated encounter looked content-free, and the
   * Join's empty-snapshot branch pushed this tab's encounter straight over it.
   * `oocParticipantCount` is on the wire precisely so that room still counts as
   * occupied here.
   *
   * This is the persistence/overwrite guard only. The combat log and the rest of
   * the UI still exclude OOC participants from "active participants" on purpose,
   * and none of that changes.
   */
  private snapshotHasEncounter(state: SharedCombatState | null): boolean {
    if (!state) {
      return false;
    }
    const listed = Array.isArray(state.participants) ? state.participants.length : 0;
    return listed > 0 || this.snapshotOocCount(state) > 0;
  }

  /** Participants held by a room but withheld from its broadcast as OOC. */
  private snapshotOocCount(state: SharedCombatState | null): number {
    const raw = Number(state?.oocParticipantCount ?? 0);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
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
    // No `skin` param: cyberdeck is the app's only theme now, so there is
    // nothing to propagate to the player's URL.
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

  /**
   * Close = *leave the room*, not destroy it.
   *
   * Durable rooms make the room rejoinable by code afterwards (spec Open
   * Decision 3), so this path no longer discards the GM-local hidden log
   * entries: they are the only copy in existence and a rejoin merges them back
   * in. Discarding them moved to the destructive `btnEndShareSession_Click`
   * (spec AC 9).
   */
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
      this.shareInfo = `Closed session ${room}. The room is kept - rejoin with code ${room} to pick it back up.`;
    } catch (err) {
      this.shareError = err instanceof Error ? err.message : "Unable to close share session.";
    } finally {
      this.resetShareStateAfterLeaving(room, false);
    }
  }

  /**
   * End = *destroy the room*. Deletes the persisted record on the server, so
   * the code stops resolving (spec AC 8). This is the action that throws the
   * GM-local hidden entries away, behind a confirmation (spec AC 9).
   */
  async btnEndShareSession_Click() {
    this.shareError = "";
    this.shareInfo = "";
    if (!this.shareRoomCode) {
      return;
    }
    const room = this.shareRoomCode;
    const hiddenCount = this.getHiddenLogEntries().length;
    const hiddenWarning = hiddenCount > 0
      ? ` ${hiddenCount} hidden GM log ${hiddenCount === 1 ? "entry" : "entries"} held only in this tab will be discarded with it.`
      : "";
    const confirmed = await this.confirmationDialog.confirm(
      `Permanently delete room ${room} and its saved encounter from the server? `
      + `Nobody will be able to rejoin this code.${hiddenWarning}`,
      "Delete this room?",
      "Delete Room",
      "Cancel"
    );
    if (!confirmed) {
      this.shareInfo = `Kept room ${room}.`;
      return;
    }
    if (this.damageLogFlushTimeout !== null) {
      window.clearTimeout(this.damageLogFlushTimeout);
      this.damageLogFlushTimeout = null;
      this.flushDamageLog();
    }
    this.isClosingSession = true;
    try {
      await this.sessionSync.endSession(room);
    } catch (err) {
      // The room was NOT deleted, so nothing here may behave as if it was
      // (spec AC 17). `resetShareStateAfterLeaving(room, true)` discards the
      // GM-local hidden log entries - the only copy in existence, since the
      // server never received them - and clears `liveEncounterRoomCode`, which
      // is what makes a later rejoin push rather than pull. Doing that on a
      // timeout or a rejected emit would destroy data over a network blip. Every
      // other action in this file already leaves state alone on failure; this
      // one now does too: the GM stays in the room and can retry.
      //
      // ...unless the failure *is* the room already being gone (review defect
      // D5). A successful end whose ack was lost leaves the GM holding a room
      // code that no longer resolves: End Room, Close Room and rejoin all then
      // answer "Room not found" while the UI still shows the room as live, with
      // no way out. The GM's intent - destroy this room - was already achieved,
      // so treat it as the terminal state it is and tear down locally.
      const message = err instanceof Error ? err.message : "Unable to end share session.";
      if (this.isRoomAlreadyGone(message)) {
        this.shareInfo = `Room ${room} was already deleted on the server (the earlier attempt got through). `
          + "Cleared it here too.";
        this.resetShareStateAfterLeaving(room, true);
        return;
      }
      this.shareError = message;
      this.isClosingSession = false;
      return;
    }
    this.shareInfo = `Deleted room ${room}.`;
    this.resetShareStateAfterLeaving(room, true);
  }

  /**
   * Does this failure reason mean the room no longer exists server-side?
   *
   * Matches the two things `roomNotFoundReason()` in `server.js` can answer:
   * the plain "Room not found", and the legacy removed-room message. A timeout
   * ("No response from server for ...") deliberately does not match - that is
   * genuinely unknown, and AC 17 requires unknown to mean "keep everything".
   */
  private isRoomAlreadyGone(reason: string): boolean {
    const text = (reason || "").toLowerCase();
    return text.includes("room not found") || text.includes("no longer available");
  }

  /**
   * Shared teardown for the two lifecycle actions. `discardHiddenEntries` is
   * the only difference: only the destructive action throws away log entries
   * the server never received.
   */
  private resetShareStateAfterLeaving(room: string, discardHiddenEntries: boolean) {
    this.sessionSync.disconnect();
    this.shareRoomCode = "";
    this.shareJoinCode = discardHiddenEntries ? "" : room;
    // A close keeps the association: the room is still there and this tab still
    // holds its encounter, so rejoining the code pushes that encounter back
    // (`btnJoinShareSession_Click`). An end destroys the room, so there is
    // nothing left to push to.
    if (discardHiddenEntries) {
      // Only *this* room's association goes: any other code this tab is still
      // the live encounter for (a room it created and walked away from, round-3
      // fix 6) is untouched by ending this one.
      this.liveEncounterRooms.delete(room);
      this.liveEncounterFingerprints.delete(room);
    }
    this.shareConnectionLost = false;
    this.sharedLogEntries = this.reseedLogOrder(
      discardHiddenEntries ? [] : this.getHiddenLogEntries()
    );
    this.clearSharedLogDecodeAnimations();
    this.initiativePrepActive = false;
    // Second choke point alongside End Combat: a GM who leaves the session
    // has finished with this table's scene even if they never pressed End
    // Combat, and a name left armed here would carry into the next session.
    // Deliberate leaves only - an *unexpected* close (handleSessionClosedExternally)
    // is a dropped connection mid-fight, where the NPC is still standing and
    // the GM is still rolling for it.
    this.clearGmRollAttribution();
    this.isClosingSession = false;
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
    this.sessionSync.onSessionClosed((payload) => this.handleSessionClosedExternally(payload));
    // A rejected broadcast used to vanish silently, which is exactly how the
    // GM ended up running combat against frozen player screens (spec AC 10).
    this.sessionSync.onError((payload) => this.handleSessionError(payload));
    this.sessionSync.onDisconnect(() => {
      if (!this.shareRoomCode || this.isClosingSession) {
        return;
      }
      this.shareConnectionLost = true;
      this.shareError = "Connection to the session server lost - players are not receiving updates. Reconnecting...";
      this.refreshShareBanner();
    });
    this.sessionSync.onReconnect(() => void this.handleSessionReconnected());
  }

  /**
   * A guarded emit was refused by the server. The common cause is a reconnected
   * socket that has not re-authenticated yet (`role-required: gm`), which the
   * reconnect handler repairs; anything else is shown as-is so it cannot be
   * silently swallowed (spec AC 10).
   */
  private handleSessionError(payload: { event: string; reason: string }) {
    if (!payload) {
      return;
    }
    const isAuth = typeof payload.reason === "string" && payload.reason.startsWith("role-required");
    this.shareError = isAuth
      ? `Session server refused ${payload.event} (${payload.reason}) - players are not receiving updates. Re-authenticating...`
      : `Session server refused ${payload.event}: ${payload.reason}`;
    if (isAuth) {
      this.shareConnectionLost = true;
      void this.handleSessionReconnected();
    }
    this.refreshShareBanner();
  }

  /**
   * Transport came back after a drop - typically a `pm2 restart`.
   *
   * **PUSH, NEVER PULL.** This is the single most damaging thing to get
   * backwards in this feature (spec Open Decision 6). The GM's local
   * `CombatManager` is the source of truth (ARCHITECTURE §7) and still holds
   * perfect state across the outage: subclasses, health, damage, OOC
   * participants, action history. The server's snapshot is a lossy projection
   * of it. So this handler re-authenticates and then re-broadcasts *local*
   * state - it must never call `restoreFromSharedState()`, which would
   * downgrade a live encounter to the lossy copy. Pull is correct only when
   * the tab has no state: a fresh page load or the explicit Join button.
   */
  private async handleSessionReconnected() {
    if (!this.shareRoomCode || this.isClosingSession) {
      return;
    }
    const room = this.shareRoomCode;
    try {
      // The returned state/log are deliberately ignored: this call is an
      // authentication, not a restore.
      await this.sessionSync.joinAsGm(room);
      this.shareConnectionLost = false;
      this.shareError = "";
      this.shareInfo = `Reconnected to session ${room}; players are back in sync.`;
      this.syncSharedState();
    } catch (err) {
      this.shareConnectionLost = true;
      this.shareError = err instanceof Error
        ? `Could not rejoin session ${room}: ${err.message}`
        : `Could not rejoin session ${room}.`;
    }
    this.refreshShareBanner();
  }

  /**
   * Session listeners fire outside Angular's change detection (socket
   * callbacks), so the banner they set would otherwise not repaint until the
   * GM's next click - which is the wrong moment to learn players are frozen.
   */
  private refreshShareBanner() {
    try {
      this.changeDetector.detectChanges();
    } catch {
      // View already destroyed, or a detection pass is in flight; the banner
      // will paint on the next cycle either way.
    }
  }

  /**
   * The session went away without the GM asking for it (a deliberate close from
   * another tab). Reset the share state but keep the GM-local hidden
   * entries: the server never received them, so this list is the only copy and
   * a rejoin merges them back in (brief p. 330).
   *
   * Note this is *not* the server-restart path, despite what this comment used
   * to claim: a restarting server never emits `session:closed`. Restarts are
   * handled by `handleSessionReconnected`.
   *
   * `persisted` distinguishes a close (room kept, code still valid) from an end
   * (room destroyed). Only an end clears the join box - after a close the code
   * is the one thing needed to pick the encounter back up, so wiping it costs
   * the GM the room.
   */
  private handleSessionClosedExternally(payload?: { room: string; persisted?: boolean }) {
    if (this.isClosingSession) {
      return;
    }
    // Older servers omit the flag; assume the room survives rather than throwing
    // away a code that may still be valid.
    const persisted = payload?.persisted !== false;
    const room = payload?.room || this.shareRoomCode;
    this.shareInfo = persisted
      ? `Session was closed. Room ${room} is kept - rejoin with that code to pick it back up.`
      : "Session was ended and the room was deleted.";
    this.shareRoomCode = "";
    this.shareJoinCode = persisted ? room : "";
    if (!persisted) {
      this.liveEncounterRooms.delete(room);
      this.liveEncounterFingerprints.delete(room);
    }
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

  /** Does this participant currently have a player owner? */
  isParticipantClaimed(p: IParticipant): boolean {
    return !!this.participantOwners.get(p);
  }

  /**
   * What the GM's "Claimed" chip says on hover. The owner is an opaque `pl-…`
   * token, never a human name (ARCHITECTURE §7), so it is shown only as a hint
   * that a claim exists and can be cleared.
   */
  getClaimOwnerHint(p: IParticipant): string {
    const owner = this.participantOwners.get(p);
    if (!owner) {
      return "";
    }
    return `Claimed by player token ${owner}. Tap to clear the claim so a player can take it (or re-take it after a reconnect).`;
  }

  /**
   * Clear a claim by hand.
   *
   * The other half of the stale-owner fix. A claim can outlive the client that
   * made it: the server strips `ownerName` on a player disconnect and emits
   * `release_claims`, but if the GM's socket was down at that moment the GM tab
   * never sees it, and the GM's reconnect push writes the stale owner straight
   * back. Nobody then holds the claim and the player cannot re-take it - so the
   * GM needs a visible way to see and clear one.
   *
   * Undoable: the ownership side-map is dropped through `forgetMapEntry`
   * (`UndoHandler.DoAction`) inside its own chapter, so a mis-tap is one Ctrl+Z.
   */
  btnReleaseClaim_Click(p: IParticipant) {
    if (!this.isParticipantClaimed(p)) {
      return;
    }
    UndoHandler.StartActions();
    this.forgetMapEntry(this.participantOwners, p);
    this.appendPlayerCommandLog(p, CLAIM_FORCE_RELEASED_TEXT, RELEASED_CLAIM_FALLBACK_ACTOR);
    this.sort();
  }

  /**
   * Tell the requesting player why their `claim_character` was refused, and put
   * the same fact in front of the GM.
   *
   * The command is broadcast like every other one (the server has no per-socket
   * channel); the player view shows it only to the token in `payload.requester`.
   * The GM's copy is a GM-only log entry: it is troubleshooting information
   * about one player's client, not table-facing narration.
   */
  private denyClaim(
    requester: string,
    participantId: string,
    characterName: string,
    reason: string
  ): void {
    const name = characterName || "That character";
    this.sessionSync.sendCommand({
      type: "claim_denied",
      player: "GM",
      payload: { requester, participantId, characterName, reason }
    });
    this.appendGmOnlyLog(
      name,
      `claim refused for a player (${reason})`
    );
    this.refreshShareBanner();
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
        this.denyClaim(playerName, participantId, "", CLAIM_DENIED_REASON.missing);
        return;
      }
      if (this.participantClaimable.get(target) !== true) {
        this.denyClaim(playerName, participantId, target.name, CLAIM_DENIED_REASON.notClaimable);
        return;
      }
      const existingOwner = this.participantOwners.get(target);
      if (existingOwner === playerName) {
        // Already theirs (a duplicate tap, or a resend after a reconnect).
        // Nothing to change and nothing to complain about.
        return;
      }
      if (existingOwner) {
        // The stale-owner case the durable-rooms review found: a player's
        // browser reloads during a restart, the old process strips `ownerName`
        // and emits `release_claims`, the GM's socket is down and never gets it,
        // and the GM's reconnect PUSH (Open Decision 6 - correct, unchanged)
        // writes the stale owner back. The re-claim then hits this branch. It
        // used to return silently, leaving the player locked out of their own
        // character with nothing on either screen.
        this.denyClaim(playerName, participantId, target.name, CLAIM_DENIED_REASON.owned);
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
      participants: this.getSharedParticipants(),
      // Not a participant list, a *count* - see `SharedCombatState`. It exists
      // so a room whose whole encounter is out of action still reads as
      // "has content" to the join guard instead of looking like an empty room
      // that is safe to overwrite (round-3 fix 5). Nothing renders it.
      oocParticipantCount: this.combatManager.participants.items.filter(p => p.ooc).length
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
          // A member of a linked NPC row can never take an Interrupt Action
          // (brief "NPC Group Initiative" criterion 17 / Decision 3, a
          // deliberate departure from p. 167) - so the row itself never offers
          // one, however high its shared Score.
          canInterrupt: !isNpcRow(p) && p.getCurrentInitiative() >= 1,
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

        // Presentation only (addendum Decision 12): a standalone grunt is badged
        // on the player view the way a group row is, so players can tell a lone
        // grunt from a PC or an ordinary NPC at a glance. Nothing downstream
        // reads it as rules state.
        if (hasGruntConditionMonitor(p)) {
          base.isDetachedGrunt = true;
        }

        // A linked row carries state no other participant type has: its NPCs
        // (each with its own Condition Monitor, criteria 3-4/7, p. 379) and the
        // shared wound accumulator (criterion 5 / Decision 1). All of it is on
        // the wire so a rejoining GM rebuilds the row as a row - see
        // buildRestoredParticipant.
        if (isNpcRow(p)) {
          const snapshot = p.toRowSnapshot();
          base.isNpcRow = true;
          base.rowWoundModifier = snapshot.rowWoundModifier;
          base.rowEverPopulated = snapshot.everPopulated;
          base.rowMembers = snapshot.members.map(m => ({
            name: m.name,
            body: m.body,
            willpower: m.willpower,
            damage: m.damage,
            lastDamageType: m.lastDamageType,
            lastDamageValue: m.lastDamageValue
          }));
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

  /**
   * Rebuild one broadcast participant as the *right class*.
   *
   * `SharedParticipantState` already carries `isMatrix` / `isAstral` and the
   * deck and astral fields; the restore path used to throw them away and build
   * a plain `Participant` for everyone, so a rejoining GM silently got a decker
   * back as an ordinary combatant. Persistence makes rejoining the normal
   * resume path, so the spec fixes the reconstruction here (Open Decision 4,
   * option (b)). No wire-format change: every field read below is already on
   * the wire today.
   */
  private buildRestoredParticipant(shared: SharedParticipantState): Participant {
    // Rows first: a row is never a decker or a magician (an NPC changing
    // Initiative type has to be detached off the row first, criterion 13), and
    // a row rebuilt as a plain Participant loses its members, its shared wound
    // accumulator and its refusal of Interrupt Actions (criterion 17 /
    // Decision 3) - the refusal being the one that silently changes what the
    // GM and the players are offered on the next broadcast.
    if (shared.isNpcRow === true) {
      const row = new NpcRowParticipant();
      row.restoreRowSnapshot({
        members: (shared.rowMembers ?? []).map(m => ({
          name: String(m.name ?? ""),
          body: Math.max(0, Number(m.body ?? 0)),
          willpower: Math.max(0, Number(m.willpower ?? 0)),
          damage: Math.max(0, Number(m.damage ?? 0)),
          lastDamageType: m.lastDamageType === "physical" || m.lastDamageType === "stun"
            ? m.lastDamageType
            : null,
          lastDamageValue: Math.max(0, Number(m.lastDamageValue ?? 0))
        })),
        rowWoundModifier: Math.max(0, Number(shared.rowWoundModifier ?? 0)),
        everPopulated: shared.rowEverPopulated === true
      });
      return row;
    }
    if (shared.isMatrix === true) {
      const mp = new MatrixParticipant();
      mp.dataProcessing = Math.max(0, Number(shared.dataProcessing || 0));
      mp.attack = Math.max(0, Number(shared.attack || 0));
      mp.sleaze = Math.max(0, Number(shared.sleaze || 0));
      mp.firewall = Math.max(0, Number(shared.firewall || 0));
      mp.deviceRating = Math.max(0, Number(shared.deviceRating || 0));
      mp.overwatch = Math.max(0, Number(shared.overwatch || 0));
      mp.jackedIn = shared.jackedIn === true;
      mp.vrMode = this.restoredVrMode(shared.vrMode);
      // `isVRCatatonic` is exactly `blocksPhysicalActions` on the wire
      // (getSharedParticipants). It gates the action planner only - a jacked-in
      // decker stays fully scheduled in initiative (ARCHITECTURE §6).
      mp.blocksPhysicalActions = shared.isVRCatatonic === true;
      return mp;
    }
    if (shared.isAstral === true) {
      const ap = new AstralParticipant();
      ap.astralProjecting = shared.isAstralProjecting === true;
      ap.blocksPhysicalActions = shared.isAstralProjecting === true;
      return ap;
    }
    return new Participant();
  }

  /** Map the broadcast VR-mode string back onto the enum. */
  private restoredVrMode(mode: string | undefined): VRMode {
    switch (mode) {
      case VRMode.HotSim: return VRMode.HotSim;
      case VRMode.ColdSim: return VRMode.ColdSim;
      case VRMode.AR: return VRMode.AR;
      default: return VRMode.None;
    }
  }

  private restoreFromSharedState(state: SharedCombatState | null) {
    if (!state || !state.participants || state.participants.length === 0) {
      return;
    }

    // Bound this rebuild's own undo chapter. A write made outside an explicit
    // StartActions() auto-opens a chapter that then absorbs everything after it
    // (ARCHITECTURE §4), so without this the GM's first post-restore Ctrl+Z
    // would walk into the middle of the restore. The chapter is then discarded
    // entirely below - see the Initialize() call at the end.
    UndoHandler.StartActions();

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
      const participant = this.buildRestoredParticipant(shared);
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
      // A jacked-in decker's Initiative Attribute is Data Processing +
      // Intuition, not Reaction + Intuition (MatrixParticipant.applyJackInMode);
      // both inputs are already on the wire. The running Score is restored
      // verbatim below regardless - this only keeps future recomputes honest.
      const jackedInMatrixAttribute = shared.isMatrix === true
        && shared.jackedIn === true
        && Number(shared.dataProcessing || 0) > 0
        ? Math.max(0, Number(shared.dataProcessing)) + safeIntuition
        : 0;
      participant.baseIni = jackedInMatrixAttribute > 0
        ? jackedInMatrixAttribute
        : (safeReaction + safeIntuition > 0
          ? safeReaction + safeIntuition
          : (shared.pendingRoll ? 6 : Math.max(0, Number(shared.initiativeScore || 0))));
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
    this.restoreWarning = this.buildRestoreWarning();

    // Discard the whole undo history, including this rebuild's own chapter.
    // There is no history from before the restore to walk back into, and the
    // restore itself must not be undoable - "undo" would leave the tab holding
    // whatever happened to be in memory before the join (spec scenario S3).
    // `recording` is left false, so the GM's next edit opens a fresh chapter.
    UndoHandler.Initialize();
  }

  /**
   * What a restore could not bring back, in the GM's words.
   *
   * Participant subclasses *are* restored now (spec Open Decision 4, option
   * (b)). Health, damage and out-of-combat participants are not: none of them
   * are on the wire at all (`SharedParticipantState` has no damage fields, and
   * `getSharedParticipants` filters OOC participants out entirely), and
   * widening the player-visible payload is explicitly a separate change - it is
   * logged in `docs/FEATURE-BACKLOG.md`. Undo history never leaves the browser
   * (ARCHITECTURE §7), so a resumed room starts with none.
   *
   * The one exception is a linked NPC row: its members' Condition Monitors *are*
   * on the wire and are restored (they are row state, not the participant-level
   * damage fields), so the warning says so rather than telling the GM to re-key
   * damage they already have back.
   */
  private buildRestoreWarning(): string {
    return "Restored from the room's last broadcast. Not included: damage and "
      + "condition monitors (linked NPC rows excepted - their NPCs come back "
      + "with theirs), any participant who was out of action, committed "
      + "interrupt actions, and undo history - re-enter those by hand.";
  }

  dismissRestoreWarning() {
    this.restoreWarning = "";
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

  /**
   * "Add Grunt" (brief addendum Decision 9). Same one-tap shape as
   * `btnAddParticipant_Click`; the grunt lands unrolled and takes its own
   * Initiative Test from the roll button next to it.
   */
  btnAddGrunt_Click() {
    LogHandler.log(this.currentBTTime, "AddGrunt_Click");
    this.addGrunt();
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
    this.actModalRowMember = null;
    this.openActModal(sender, actModalContent);
  }

  /**
   * A row member's own Act control (brief "NPC Group Initiative" Decision
   * 23). Opens the same Act modal an ordinary participant gets, scoped to
   * this one NPC (`actModalRowMember`) - the declared action is logged
   * attributed to the NPC, not the row, and only this member is marked
   * "acted" on submit (`performRowMemberAct`).
   *
   * Gated the same way the template disables the button (Decision 24): the
   * row has to be the current actor and still have a live Action Phase.
   * Checked again here in case the handler is ever reached some other way -
   * the template's `[disabled]` is the primary gate.
   */
  btnRowMemberAct_Click(row: NpcRowParticipant, member: GruntMember, actModalContent: TemplateRef<unknown>): void {
    if (!this.canRowMemberAct(row)) {
      return;
    }
    this.actModalRowMember = member;
    this.openActModal(row, actModalContent);
  }

  /**
   * Is a row's per-member Act button live right now (brief Decision 24)?
   * Two gates, both on the row (the member has no Score or turn state of its
   * own - the row does):
   *  - the row has to be the participant currently up (`currentActors`), not
   *    merely "somewhere in the order";
   *  - the row still needs a live Action Phase (`hasLiveActionPhase`,
   *    Decision 16) - a shared Score of 0 or below has none.
   */
  canRowMemberAct(row: NpcRowParticipant): boolean {
    return this.combatManager.currentActors.contains(row) && this.hasLiveActionPhase(row);
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
      this.actModalRowMember = null;
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
    const rowMember = this.actModalRowMember;
    const illegalActions = this.actModalIllegalOsActions;
    // Decision 23: a row member's declared action marks and logs that NPC,
    // not the whole row - `performAct` would finish the row's Action Phase on
    // the first member to act, which is wrong for a group of more than one.
    if (rowMember && isNpcRow(actor)) {
      this.performRowMemberAct(actor, rowMember, this.buildDeclaredActionLog(actor));
    } else {
      this.performAct(actor, this.buildDeclaredActionLog(actor));
    }
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

  /**
   * Does this participant still have a live Action Phase?
   *
   * An Initiative Score of 0 or below has none, so no Simple and no Complex
   * action can be declared from it; one Free Action per pass and ordinary
   * defence are both still available (brief "NPC Group Initiative" Decision 16,
   * `RULINGS.md` 2026-08-07, p. 159-160). General mechanics: this applies to
   * PCs, ordinary NPCs, standalone grunts and rows identically.
   *
   * Interrupt Actions are a separate gate and already correct - they are
   * refused by cost in `Participant.canUseAction()` (p. 167) and are not
   * declared through this modal at all.
   *
   * Outside a started combat there is no running Score to gate on (the Score
   * reads as the bare Initiative attribute), and no Act button either, so the
   * gate is not applied there.
   */
  /** Template copy of `NO_ACTION_PHASE_MESSAGE` (Decision 16). */
  readonly noActionPhaseMessage = NO_ACTION_PHASE_MESSAGE;

  hasLiveActionPhase(sender: IParticipant): boolean {
    return !this.combatManager.started
      || sender.getCurrentInitiative() > MIN_ACTION_PHASE_INITIATIVE_SCORE;
  }

  canUseDeclaredAction(sender: IParticipant, action: DeclaredActionItem): boolean {
    const isCyberdeckAct = CYBERDECK_REQUIRED_ACTIONS.has(action.name);
    const isPhysicalAct = !ALL_MATRIX_ACTION_NAMES.has(action.name);
    if (action.economy !== "free" && !this.hasLiveActionPhase(sender)) {
      return false;
    }
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
    if (!this.hasLiveActionPhase(sender) && this.hasActionPhaseSelection(sender)) {
      return false;
    }
    return DeclaredActionEngine.getValidationResult(this.getDeclaredActionSelection(sender)).valid;
  }

  getDeclaredActionValidationMessage(sender: IParticipant): string {
    if (!this.hasLiveActionPhase(sender) && this.hasActionPhaseSelection(sender)) {
      return NO_ACTION_PHASE_MESSAGE;
    }
    return DeclaredActionEngine.getValidationResult(this.getDeclaredActionSelection(sender)).message;
  }

  /**
   * Does the current selection contain anything that needs an Action Phase?
   *
   * Checked separately from `canUseDeclaredAction` so a selection made while
   * the participant still had a Score above 0 cannot be *submitted* after the
   * Score has dropped to 0 or below (Decision 16). A Free-Action-only selection
   * is still legal down there (p. 160) and stays submittable.
   */
  private hasActionPhaseSelection(sender: IParticipant): boolean {
    const selection = this.getDeclaredActionSelection(sender);
    return selection.simple.length > 0 || selection.complex !== null;
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
    if (action.economy !== "free" && !this.hasLiveActionPhase(sender)) {
      return NO_ACTION_PHASE_MESSAGE;
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

  /**
   * The row-member counterpart of `performAct` (brief "NPC Group Initiative"
   * Decision 23): declares and logs **one NPC's** action, not the row's.
   *
   * Attribution follows the same convention every other row log line uses
   * (`logRowEvent`): the actor is the row (`rowLogActor`), the NPC's name is
   * named in the text - "Gangers" is who the log speaks for, "Ganger 1" is
   * who did the thing. This is a fictional event the table witnesses (unlike
   * the wound-modifier bookkeeping lines), so it goes to both the GM and the
   * shared log, same as an ordinary participant's declared action.
   *
   * Only marks *this* member as having acted (`hasActed`, Decision 18) and
   * only finishes the row's Action Phase - `CombatManager.act(row)`, exactly
   * the call an ordinary participant's `performAct` makes - once every member
   * still standing has gone. A group does not take one action; its members
   * each take their own, and the initiative only moves on once they all have.
   */
  private performRowMemberAct(row: NpcRowParticipant, member: GruntMember, declaredAction: string | null = null): void {
    UndoHandler.StartActions();
    const actor = this.rowLogActor(row);
    const text = declaredAction ? `${member.name}: ${declaredAction}` : `${member.name}: Act`;
    this.logRowEvent(actor, text);
    member.hasActed = true;
    if (row.activeMembers.every(m => m.hasActed)) {
      this.combatManager.act(row);
    }
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
    // Same undoable side-map cleanup the automatic row removal uses. Raw
    // `.delete()` calls here made a manual delete only half-undoable: the
    // participant came back from the undo stack with a brand-new id, a
    // defaulted Reaction/Intuition and a fresh coin-toss tie-breaker, and was
    // re-announced to players as somebody new (ARCHITECTURE.md §7/§8).
    this.forgetParticipant(sender);
    // A row's per-member side map is keyed by `GruntMember`, not by the row, so
    // `forgetParticipant` cannot reach it: deleting a row left one entry per
    // dead member behind forever. This is now the *only* path that removes a
    // row (Decision 14 stopped the automatic one), so it is the only place that
    // can drop those entries.
    if (isNpcRow(sender)) {
      for (const member of sender.members) {
        this.forgetMapEntry(this.rowMemberDamageValues, member);
      }
    }
    this.combatManager.removeParticipant(sender);
    // The combatant the GM was rolling for is gone: the sticky attribution
    // outlives it otherwise, and the next roll (their own Perception check,
    // say) goes out under a name no longer in the fight. Cleared only when it
    // is *this* name - deleting an unrelated combatant leaves it armed.
    this.clearGmRollAttributionIfNamed(sender.name || "");
    // Deselecting the deleted participant is `forgetParticipant`'s job now, and
    // it does it undoably - a bare assignment here would survive the undo and
    // leave the restored participant unselected.
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

  /**
   * Undo/redo change player-visible state, so they must re-broadcast like every
   * other mutation path - otherwise the GM tab and the players silently
   * disagree. The case that made this a live defect: the GM releases a claim
   * (broadcast), then undoes it (local only). Players still saw the character as
   * free, a second player could claim it, and the original owner's re-claim was
   * refused for a character their own screen said was unowned.
   *
   * `syncSharedState()` rather than `sort()`: `sort()` runs
   * `enforceSingleCurrentActor()`, which writes participant `status` through the
   * undo system. Any such write auto-opens a chapter (ARCHITECTURE §4) and
   * `StartActions()` clears `futureHistory` - so sorting straight after an undo
   * would destroy the redo stack it just created. `syncSharedState()` only reads
   * and broadcasts.
   */
  btnUndo_Click() {
    LogHandler.log(this.currentBTTime, "Undo_Click");
    UndoHandler.Undo();
    this.syncSharedState();
  }

  btnRedo_Click() {
    LogHandler.log(this.currentBTTime, "Redo_Click");
    UndoHandler.Redo();
    this.syncSharedState();
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

  /**
   * Create a **standalone grunt**: one grunt-shaped NPC in its own slot in the
   * initiative order, not inside a row (brief addendum Decision 9).
   *
   * Deliberately the same shape as `addParticipant` above - it is added to the
   * encounter the same way, gets the same side-map seeding, and has **not**
   * rolled, so it takes its own Initiative Test from the ordinary roll button
   * (or Initiative Prep) like any other new participant, with no special-cased
   * score. The only differences are the class (`DetachedGruntParticipant`, so it
   * gets the single combined Condition Monitor of p. 379) and the Body /
   * Willpower defaults, which match `addNpcToRow`'s.
   *
   * Its Edge rating is seeded to 0 for the same reason a row's is: a grunt has
   * no Edge attribute (p. 380), so ERIC falls through to Reaction, then
   * Intuition, then the coin toss (Decision 5, p. 159).
   */
  addGrunt(
    name?: string,
    body = DEFAULT_GRUNT_ATTRIBUTE,
    willpower = DEFAULT_GRUNT_ATTRIBUTE,
    selectNewGrunt = true
  ): DetachedGruntParticipant {
    UndoHandler.StartActions();
    const grunt = createStandaloneGrunt(name ?? this.nextStandaloneGruntName(), body, willpower);
    this.combatManager.addParticipant(grunt);
    this.participantClaimable.set(grunt, false);
    this.participantEdgeRatings.set(grunt, NPC_ROW_EDGE_RATING);
    this.participantReactions.set(grunt, 3);
    this.participantIntuitions.set(grunt, 3);
    grunt.baseIni = this.getParticipantBaseInitiative(grunt);
    this.participantTieBreakers.set(grunt, Math.random());
    const id = this.getParticipantId(grunt);
    this.lastKnownDamage.set(id, {
      physical: Math.max(0, Number(grunt.physicalDamage || 0)),
      stun: Math.max(0, Number(grunt.stunDamage || 0))
    });
    // Deliberately box-count-free. The old wording published this NPC's exact
    // Condition Monitor size to every player in the room the moment it was
    // added - GM bookkeeping, and a straight answer to "how many hits until it
    // drops" that nobody at the table had earned. The GM reads the box count off
    // the Condition Monitor panel, where it always was.
    this.logRowEvent(grunt.name || STANDALONE_GRUNT_NAME_PREFIX,
      "added as a standalone grunt (single Condition Monitor) - "
      + "still to roll their own Initiative Test");
    if (selectNewGrunt) {
      this.selectActor(grunt);
    }
    this.syncSharedState();
    this.sort();
    return grunt;
  }

  /**
   * Default name for the next standalone grunt: `"Grunt <n>"`, one past the
   * highest number already in the encounter. Same reasoning as
   * `nextRowMemberName`: the combat log names the grunt whose wound or death it
   * records (p. 379), and two combatants answering to one name make those lines
   * unreadable.
   */
  private nextStandaloneGruntName(): string {
    const pattern = new RegExp(`^${STANDALONE_GRUNT_NAME_PREFIX} (\\d+)$`);
    let highest = 0;
    for (const p of this.combatManager.participants.items) {
      const match = pattern.exec(p.name || "");
      if (match) {
        highest = Math.max(highest, Number(match[1]));
      }
    }
    return `${STANDALONE_GRUNT_NAME_PREFIX} ${highest + 1}`;
  }

  /**
   * Default name for the next row, merged or created with the Grunt Group
   * button: `"Grunt Group"` for the first one in the encounter, then
   * `"Grunt Group 2"`, `"Grunt Group 3"`, ...
   *
   * Same reasoning as `nextStandaloneGruntName`, applied one level up: the
   * row-level log lines this feature writes (the group-wide wound line of
   * scenario S3, a member removed, the row going spent per Decision 14) are
   * attributed to the row *by name*, so two merges in one session under one
   * name make the whole row-level half of the log unreadable.
   *
   * The first row is left unnumbered on purpose - most sessions have exactly one
   * grunt group, and "Grunt Group 1" would be a number the GM has to read past
   * for nothing. Numbering starts where ambiguity does.
   */
  private nextMergedGruntRowName(): string {
    let highest = 0;
    for (const p of this.combatManager.participants.items) {
      const match = DEFAULT_ROW_NAME_PATTERN.exec(p.name || "");
      if (match) {
        // A bare "Grunt Group" is group 1, so the next one is 2.
        highest = Math.max(highest, match[1] ? Number(match[1]) : 1);
      }
    }
    return highest === 0 ? MERGED_GRUNT_ROW_NAME : `${MERGED_GRUNT_ROW_NAME} ${highest + 1}`;
  }

  /** Is this row still on a name this app generated (brief Decision 19)? */
  private isDefaultRowName(name: string): boolean {
    return !name || DEFAULT_ROW_NAME_PATTERN.test(name);
  }

  // ── Merging standalone grunts into a row (addendum Decision 10) ──────────

  /**
   * Which standalone grunts the GM has ticked for a merge.
   *
   * Transient view state, like `expandedRowPanels`: it holds nothing that
   * survives the merge, and the merge itself is fully undoable. Kept as a `Set`
   * of participants so a mis-tap is one tap to correct and nothing is committed
   * until the Merge button is pressed.
   */
  readonly gruntsSelectedForMerge = new Set<IParticipant>();

  /**
   * Result of the last merge attempt, in the GM's words - shown next to the
   * button. Decision 10 requires a refusal to say *why*, because the GM's
   * alternative (re-group between Combat Turns) is a different action rather
   * than a retry.
   */
  mergeMessage = "";

  /** Pending auto-dismiss for `mergeMessage`, or `null` when nothing is shown. */
  private mergeMessageDismissTimeout: number | null = null;

  /**
   * Show a merge result, and start it counting down.
   *
   * The message is transient feedback on a tap that has already happened, not
   * state: it is rendered outside the selection-count guard, so without this it
   * would sit under an empty selection for the rest of the session and read as
   * if it were describing whatever the GM is doing now. Every write goes through
   * here so there is exactly one place that can leave a stale one on screen.
   *
   * Not undoable and deliberately so - it is a toast, not tracker state; undoing
   * the merge itself puts the grunts back regardless.
   */
  private setMergeMessage(text: string): void {
    this.clearMergeMessageDismiss();
    this.mergeMessage = text;
    if (!text) {
      return;
    }
    this.mergeMessageDismissTimeout = window.setTimeout(() => {
      this.mergeMessageDismissTimeout = null;
      this.mergeMessage = "";
    }, MERGE_MESSAGE_DISMISS_MS);
  }

  private clearMergeMessageDismiss(): void {
    if (this.mergeMessageDismissTimeout !== null) {
      window.clearTimeout(this.mergeMessageDismissTimeout);
      this.mergeMessageDismissTimeout = null;
    }
  }

  /** Is this participant one the GM could merge into a group at all? */
  isMergeableGruntCandidate(p: IParticipant): boolean {
    return hasGruntConditionMonitor(p);
  }

  isSelectedForMerge(p: IParticipant): boolean {
    return this.gruntsSelectedForMerge.has(p);
  }

  toggleMergeSelection(p: IParticipant): void {
    if (this.gruntsSelectedForMerge.has(p)) {
      this.gruntsSelectedForMerge.delete(p);
    } else {
      this.gruntsSelectedForMerge.add(p);
    }
    this.setMergeMessage("");
  }

  /** Untick everything. A mis-tap costs one tap to correct, not an undo. */
  clearMergeSelection(): void {
    this.gruntsSelectedForMerge.clear();
    this.setMergeMessage("");
  }

  /** The ticked grunts, in initiative-list order, still in the encounter. */
  private getGruntsSelectedForMerge(): DetachedGruntParticipant[] {
    return this.combatManager.participants.items
      .filter(p => this.gruntsSelectedForMerge.has(p) && hasGruntConditionMonitor(p))
      .map(p => p as DetachedGruntParticipant);
  }

  getMergeSelectionCount(): number {
    return this.getGruntsSelectedForMerge().length;
  }

  /** Enabled only once the GM has ticked enough grunts to form a group. */
  canMergeSelectedGrunts(): boolean {
    return this.getMergeSelectionCount() >= MIN_MERGEABLE_GRUNTS;
  }

  /**
   * Fold the ticked standalone grunts into one new linked NPC row
   * (Decision 10).
   *
   * Refused - with a message, never silently - if any of them has already
   * rolled Initiative for the current Combat Turn: a group acts on **one**
   * shared Initiative Test (p. 379), and there is no defined answer to whose
   * already-rolled score the new group would take. Nothing is changed on a
   * refusal, so the GM can untick the offender and merge the rest.
   *
   * On success each grunt becomes a member of the row carrying its Condition
   * Monitor damage across exactly (Decision 11), the grunts leave the order, and
   * the row goes in unrolled so the GM makes its single group Initiative Test.
   * The row's shared wound accumulator starts at 0 - no retroactive penalty for
   * damage the founding members already had (Decision 11, matching Decision 7).
   */
  mergeSelectedGrunts(): GruntMergeResult {
    const selected = this.getGruntsSelectedForMerge();
    const result = mergeGruntsIntoRow(selected, this.nextMergedGruntRowName());
    this.setMergeMessage(result.reason);
    if (!result.ok || !result.row) {
      // Refusals are logged as well as shown: the GM's next move (re-group
      // between Combat Turns) happens minutes later, and the reason has to
      // still be readable then.
      //
      // GM-only. A refusal names an NPC and says why it could not be grouped -
      // pure GM bookkeeping about NPCs the players may not even have met, and
      // "Ganger A already rolled Initiative" is table information nobody
      // in-fiction has. `StartActions` is here only so the log write opens its
      // own undo chapter instead of appending to whatever chapter happened to be
      // left open; nothing else on this path mutates tracker state.
      UndoHandler.StartActions();
      this.logGmOnlyRowEvent(MERGED_GRUNT_ROW_NAME, `merge refused - ${result.reason}`);
      return result;
    }
    UndoHandler.StartActions();
    const row = result.row;
    const first = selected[0];
    // The row is a brand-new participant, not a joiner: if it is created after
    // combat has begun it takes the ordinary late-entry penalty of -10 per
    // elapsed pass (criterion 15, p. 160). Decision 7's exemption covers an NPC
    // joining an *existing* row, which this is not.
    this.combatManager.addParticipant(row);
    this.participantClaimable.set(row, false);
    this.participantEdgeRatings.set(row, NPC_ROW_EDGE_RATING);
    this.participantReactions.set(row, this.getParticipantReactionValue(first));
    this.participantIntuitions.set(row, this.getParticipantIntuitionValue(first));
    this.participantTieBreakers.set(row, Math.random());
    this.getParticipantId(row);
    this.expandedRowPanels.add(row);
    for (const grunt of selected) {
      this.forgetParticipant(grunt);
      this.combatManager.removeParticipant(grunt);
      // Undoable, like every other side-map drop here: undoing the merge has to
      // give the GM back the same ticked selection, not an empty one.
      this.forgetSetEntry(this.gruntsSelectedForMerge, grunt);
    }
    this.logRowEvent(row.name,
      `formed from ${selected.map(g => g.name || "unnamed grunt").join(", ")} - `
      + "one shared Initiative Score from here on. Their Condition Monitor damage carried over; "
      + "no wound penalty is applied to the group for damage taken before the merge (house rule).");
    this.selectActor(row);
    this.syncSharedState();
    this.sort();
    return result;
  }

  // ── Linked NPC rows (grunt groups) ──────────────────────────────────────
  //
  // All of the rules live in `src/Grunts/`; everything here is plumbing: side
  // maps, undo batching, logging and panel state. See
  // briefs/npc-group-initiative.md.

  /**
   * Write a row event to both logs: the GM's own local log and, if a session is
   * running, the shared one. Same shape as `appendParticipantRollLog` - a
   * `appendSharedLog` call on its own is a no-op with no session open, and
   * these lines (especially the house-rule wound line, scenario S3) have to be
   * readable back by the GM whether or not players were connected.
   */
  private logRowEvent(actor: string, text: string, playerText: string = text): void {
    LogHandler.log(this.currentBTTime, `${actor} ${text}`);
    this.appendSharedLog(actor, playerText);
  }

  /**
   * The name a row's log lines are attributed to.
   *
   * One helper rather than `row.name || "NPC Row"` repeated at nine call sites:
   * the literal fallback was the doubled-text bug of brief Decision 19 (a row
   * left on its default name produced `"NPC Row: NPC Row 1 is out of action"`,
   * the same words twice in one line). New rows now get a distinct default name
   * (`nextMergedGruntRowName`) and members of a still-default row are named from
   * `STANDALONE_GRUNT_NAME_PREFIX` rather than from the row, so neither half of
   * the line repeats the other.
   */
  private rowLogActor(row: NpcRowParticipant): string {
    return row.name || MERGED_GRUNT_ROW_NAME;
  }

  /**
   * The same, for a row event the players have no business seeing - GM
   * bookkeeping about NPCs rather than something that happened in the fiction.
   *
   * `appendGmOnlyLog` writes the GM's own local line itself, tagged
   * "(hidden from players)", so this must not write one as well or the GM gets
   * the event twice with only one copy telling the truth about visibility. Same
   * contract as `appendParticipantRollLog`.
   */
  private logGmOnlyRowEvent(actor: string, text: string): void {
    this.appendGmOnlyLog(actor, text);
  }

  /** Template guard: is this participant a linked NPC row? */
  isNpcRow(p: IParticipant): p is NpcRowParticipant {
    return isNpcRow(p);
  }

  /** Template cast, mirroring `asMatrix` / `asAstral`. */
  asNpcRow(p: IParticipant): NpcRowParticipant {
    return p as NpcRowParticipant;
  }

  /**
   * Template guard: does this participant carry the grunt Condition Monitor
   * shape - **one** combined Physical + Stun track, no overflow (p. 379, and
   * p. 381 for lieutenants: "They possess a single Condition Monitor, like
   * other grunts")? True for a `DetachedGruntParticipant`; false for a row,
   * which has no Condition Monitor of its own at all.
   */
  hasGruntConditionMonitor(p: IParticipant): p is DetachedGruntParticipant {
    return hasGruntConditionMonitor(p);
  }

  /** Template cast — only call inside a `hasGruntConditionMonitor(p)` guard. */
  asGrunt(p: IParticipant): DetachedGruntParticipant {
    return p as DetachedGruntParticipant;
  }

  /**
   * Write a combined-track edit from the Condition Monitor widget back onto a
   * detached grunt.
   *
   * The widget is a single bar over one pool, but the participant keeps two
   * writable damage fields (Physical and Stun) so the GM can still record which
   * kind of damage was taken. Boxes clicked on the combined bar are written to
   * the Physical field on top of whatever Stun is already recorded, which is
   * what keeps `combinedDamage` equal to the number of boxes the GM just
   * filled; Stun stays wherever it was. Falls back to zero rather than negative
   * if the GM drags the bar below the recorded Stun.
   */
  onGruntCombinedDamageChanged(p: DetachedGruntParticipant, combined: number): void {
    const target = Math.max(0, Math.floor(Number(combined || 0)));
    p.physicalDamage = Math.max(0, target - p.stunDamage);
    this.onParticipantDamageChanged();
  }

  /**
   * Record a standalone grunt's Body, and resize its Condition Monitor to match.
   *
   * Body does two things on a grunt (p. 379): it is the number the final
   * attack's DV is compared against to settle alive-or-dead, **and** it is one
   * of the two inputs to the box count, `8 + ceil(max(Body, Willpower) / 2)`.
   * This used to record only the first, leaving a Body-9 grunt on the 10 boxes
   * it was created with instead of 13 for its whole life - a straight criterion-7
   * violation, and the reason a merge could change the size of a Condition
   * Monitor: `GruntMember` recomputes the formula from the attributes, and the
   * attributes and the box count had been allowed to drift apart.
   *
   * The resize itself lives on the participant (`setGruntAttributes`), so the
   * same rule applies however Body is written - GM field, detach, or merge.
   */
  onGruntBodyChanged(p: DetachedGruntParticipant, value: number): void {
    UndoHandler.StartActions();
    p.gruntBody = Math.max(0, Number(value || 0));
    this.syncSharedState();
  }

  /**
   * The other Condition Monitor input (p. 379). Editable for the same reason
   * Body is: "Add Grunt" seeds both at `DEFAULT_GRUNT_ATTRIBUTE`, and a grunt
   * whose Willpower is the higher of the two has no other way to get the box
   * count the formula gives it.
   */
  onGruntWillpowerChanged(p: DetachedGruntParticipant, value: number): void {
    UndoHandler.StartActions();
    p.gruntWillpower = Math.max(0, Number(value || 0));
    this.syncSharedState();
  }

  // ── Standalone / detached grunt DV controls (brief Decision 20) ─────────
  //
  // The Condition Monitor widget's box-clicking can only ever record as many
  // boxes as are left on the track, so the largest recordable hit is exactly
  // the boxes remaining - too small for p. 379's "DV of the final attack vs.
  // Body" comparison whenever a killing blow outsizes the track. These mirror
  // the row panel's per-member DV controls (`getRowMemberDamageValue` and
  // friends), keyed by participant instead of by `GruntMember`.

  /** The Damage Value the next P/S tap will apply, defaulting to a single box. */
  getGruntDamageValue(p: IParticipant): number {
    return this.gruntDamageValues.get(p) ?? DEFAULT_ROW_MEMBER_DAMAGE_VALUE;
  }

  /** Clamped the same way `setRowMemberDamageValue` is - at least one box. */
  setGruntDamageValue(p: IParticipant, value: number): void {
    const parsed = Math.floor(Number(value));
    const safe = Number.isFinite(parsed)
      ? Math.max(DEFAULT_ROW_MEMBER_DAMAGE_VALUE, Math.min(MAX_ROW_MEMBER_DAMAGE_VALUE, parsed))
      : DEFAULT_ROW_MEMBER_DAMAGE_VALUE;
    this.gruntDamageValues.set(p, safe);
  }

  hitGruntPhysical(p: DetachedGruntParticipant, boxes = this.getGruntDamageValue(p)) {
    return this.applyGruntDamage(p, boxes, "physical");
  }

  hitGruntStun(p: DetachedGruntParticipant, boxes = this.getGruntDamageValue(p)) {
    return this.applyGruntDamage(p, boxes, "stun");
  }

  /**
   * Apply a Damage Value to a standalone / detached grunt's combined track
   * (brief Decision 20, `RULINGS.md` 2026-08-13 "A killing blow's Damage
   * Value can exceed the boxes left on the track"). The rules-level clamping
   * and final-attack recording live on `DetachedGruntParticipant.applyDamage`;
   * this is plumbing only.
   *
   * Routed through the same `onParticipantDamageChanged()` hook the box-
   * clicking widget already uses, so the hit is logged the ordinary
   * participant way (`flushDamageLog`) rather than a second bespoke log path -
   * that generic path already drops the Condition Monitor maximum
   * (`RULINGS.md` 2026-08-13 "Condition Monitor maximums never appear in any
   * log"), so nothing further is needed here to satisfy Decision 25 for this
   * control.
   */
  applyGruntDamage(p: DetachedGruntParticipant, boxes: number, type: GruntDamageType) {
    UndoHandler.StartActions();
    const result = p.applyDamage(boxes, type);
    this.onParticipantDamageChanged();
    return result;
  }

  /** Heal one box / take back a mis-keyed hit (the row panel's "-1" button). */
  healGrunt(p: DetachedGruntParticipant, boxes: number) {
    UndoHandler.StartActions();
    const healed = p.healDamage(boxes);
    this.onParticipantDamageChanged();
    return healed;
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
    // Numbered and distinct rather than the old literal `"NPC Row"`: that
    // string was reused as the log-actor fallback *and* as the prefix of every
    // member's default name, so an unrenamed row logged "NPC Row: NPC Row 1 ..."
    // (brief Decision 19). Shares the merged-row namer so a button-made row and
    // a merged one cannot collide either.
    row.name = this.nextMergedGruntRowName();
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
   * Default name for the next NPC added to a row: `"<row name> <n>"`.
   *
   * `n` is one past the **highest number already used** in the row, not
   * `members.length + 1`: with a count, deleting a middle NPC and adding
   * another produced a second NPC with the same name (delete "G 2" of G 1-3,
   * add -> "G 3" again). Two identically-named grunts is not a cosmetic problem
   * at the table - the combat log names the NPC whose wound moved the row's
   * shared score (Decision 1) and the alive/dead verdict is recorded per NPC
   * (p. 379), and neither line can be read back if two NPCs answer to it.
   * Custom names the GM typed are skipped by the pattern, so a final
   * collision check keeps the name unique against those too.
   *
   * A row still on its **default** name is the one case where the row's name is
   * a bad prefix: `"Grunt Group 1"` inside `"Grunt Group"`'s log lines repeats
   * the row's own name back at the reader, which is the doubled text brief
   * Decision 19 removes. Those members fall back to
   * `DEFAULT_ROW_MEMBER_NAME_PREFIX` instead. The moment the GM names the row,
   * its NPCs go back to being named after it.
   */
  private nextRowMemberName(row: NpcRowParticipant): string {
    const prefix = this.isDefaultRowName(row.name)
      ? DEFAULT_ROW_MEMBER_NAME_PREFIX
      : (row.name || DEFAULT_ROW_MEMBER_NAME_PREFIX);
    const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} (\\d+)$`);
    let highest = 0;
    for (const member of row.members) {
      const match = pattern.exec(member.name);
      if (match) {
        highest = Math.max(highest, Number(match[1]));
      }
    }
    const taken = new Set(row.members.map(m => m.name));
    let next = Math.max(highest, row.members.length) + 1;
    while (taken.has(`${prefix} ${next}`)) {
      next++;
    }
    return `${prefix} ${next}`;
  }

  /**
   * Add an NPC to a row. Mid-combat this is the reinforcement case: the new
   * NPC inherits the row's current shared Initiative Score directly, with no
   * Initiative Test of its own and no -10-per-elapsed-pass late-entry penalty
   * (criterion 15 / Decision 7, scenario S7).
   */
  addNpcToRow(row: NpcRowParticipant, name?: string, body = 3, willpower = 3): GruntMember {
    UndoHandler.StartActions();
    const member = new GruntMember(name ?? this.nextRowMemberName(row), body, willpower);
    row.addMember(member);
    // Joining is Score-neutral even for an NPC who arrives already hurt: the
    // shared Score moves on wound *events* inside the row (Decision 1), and
    // Decision 7 says a joiner simply takes the row's current Score. Said out
    // loud in the log for a wounded joiner, because that is exactly the case a
    // GM would otherwise expect to see the row slow down.
    const carriedWounds = member.wm > 0
      ? ` (arrives wounded: -${member.wm} on their own tests only, row's shared score unchanged)`
      : "";
    this.logRowEvent(this.rowLogActor(row),
      `${member.name} joins the row on shared initiative score ${row.getCurrentInitiative()}${carriedWounds}`);
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
   *
   * **Log privacy (brief Decision 17).** The GM's copy of a damage line carries
   * the running damage total; the players' copy does not. The Condition
   * Monitor's *maximum* is dropped from both copies (brief Decision 25,
   * `RULINGS.md` 2026-08-13 "Condition Monitor maximums never appear in any
   * log") - "how many more hits until it drops" is a straight answer that
   * nobody at the table has earned, the same reasoning that already keeps a
   * new grunt's box count out of the shared log. The wound-modifier house-rule
   * line goes further and is GM-only outright: it is a statement about the
   * tracker's own bookkeeping, not an event anyone in the fiction witnesses.
   */
  applyRowMemberDamage(
    row: NpcRowParticipant,
    member: GruntMember,
    boxes: number,
    type: GruntDamageType
  ) {
    UndoHandler.StartActions();
    const actor = this.rowLogActor(row);
    const result = row.applyDamageToMember(member, boxes, type);
    if (result.applied > 0) {
      const damageType = type === "stun" ? "Stun" : "Physical";
      // The running damage total may stay in the GM's own copy; the
      // Condition Monitor's maximum may not (brief Decision 25, `RULINGS.md`
      // 2026-08-13 "Condition Monitor maximums never appear in any log") - it
      // answers "how many more hits until it drops", which the maximum alone
      // gave away regardless of the current total.
      this.logRowEvent(actor,
        `${member.name} took ${result.applied} ${damageType} `
        + `(${member.damage})`,
        `${member.name} took ${result.applied} ${damageType}`);
    } else if (member.outOfAction) {
      // A tap on a grunt whose track is already full applies nothing (p. 379:
      // grunts take no overflow) and must not rewrite the final-attack record.
      // Say so: a silent no-op looks like a broken button to a GM recording a
      // coup de grace, and "nothing happened" is itself the ruling.
      this.logRowEvent(actor,
        `${member.name} - no effect, already out of action `
        + `(${member.damage}, ${member.finalState})`,
        `${member.name} - no effect, already out of action`);
    }
    if (result.scoreDelta !== 0) {
      this.logGmOnlyRowEvent(actor, formatGroupWoundLogText(
        actor, member.name,
        result.rowWoundModifierDelta,
        result.scoreAfter
      ));
    }
    if (result.wentOutOfAction) {
      this.logRowEvent(actor,
        `${member.name} is out of action (${member.finalState})`,
        `${member.name} is out of action`);
    }
    // Decision 14: the row is flagged, not removed, once its last member drops.
    this.flagSpentNpcRows();
    this.syncSharedState();
    this.sort();
    return result;
  }

  /**
   * Pull any row that can no longer act off the current-actor slot, and flag
   * (only) the ones taken out **by damage** (Decision 14, narrowed by
   * Decision 21). Called from every GM path that can empty or finish off a
   * row - damage, heal, detach and the per-member trash icon - so the flag
   * (and the "this row can no longer act" consequence) lands on the same tap
   * that caused it.
   *
   * A damage-wiped row is **not** removed: it keeps its slot, styled like any
   * other out-of-action participant, and the GM's existing per-row trash icon
   * (`btnDelete_Click`) is the cleanup path. A row emptied by hand is left as
   * a plain, unflagged empty row instead (brief Decision 21, `RULINGS.md`
   * 2026-08-13). Either way `CombatManager.flagSpentNpcRows()` advances the
   * order if the row that can no longer act was the one currently acting, so
   * emptying the acting row does not stall the tracker.
   *
   * The logging lives in `onSpentNpcRowsFlagged` below, which the engine calls
   * for *every* damage-wipe flagging - including the one it performs itself as
   * the pre-step of `goToNextActors()`. Doing it here instead would mean a row
   * that went spent on the next "Act" tap did so with no log line.
   */
  private flagSpentNpcRows(): void {
    this.combatManager.flagSpentNpcRows();
  }

  /**
   * The GM-side half of a row being wiped out **by damage**: say so in the
   * log. Registered on the CombatManager in the constructor, so it runs
   * exactly once per collapse, from whichever path caused it. Never called for
   * a row emptied by hand (Decision 21) - `CombatManager.flagSpentNpcRows()`
   * only reports rows where `isWipedOut` is true.
   *
   * GM-only (brief Decision 17). "Every member of that group is down, and the
   * row is still sitting in my initiative list waiting to be deleted" is
   * bookkeeping about the tracker, not something the players witness - the
   * individual NPCs going down are logged separately and those lines *are*
   * shared.
   *
   * No side-map cleanup here any more: the row is still in the encounter, so
   * its ids, tie-break inputs and its NPCs' queued Damage Values all have to
   * stay. `btnDelete_Click` does that cleanup when the GM actually removes it.
   */
  private onSpentNpcRowsFlagged(rows: NpcRowParticipant[]): void {
    for (const spent of rows) {
      this.logGmOnlyRowEvent(this.rowLogActor(spent),
        "every member is out of action - flagged out of action; the row keeps its place "
        + "in the initiative order until you delete it");
    }
    this.syncSharedState();
  }

  // ── Per-NPC "has acted this pass" (brief Decisions 18 & 23) ──────────────
  //
  // The row is one participant, so the engine's own Waiting/Active/Finished
  // lifecycle can only say whether *the row* has gone. Which of six gangers has
  // already fired is per-NPC bookkeeping that the GM previously had to hold in
  // their head. This is the row-member equivalent of an ordinary participant's
  // Act button.
  //
  // Since Decision 23 the primary path to `hasActed = true` is
  // `btnRowMemberAct_Click` -> the Act modal -> `performRowMemberAct`, which
  // opens the same declare-action flow an ordinary participant gets and logs
  // the result, exactly like `performAct`. `toggleRowMemberActed` below stays
  // as the one-tap correction for a mis-tap: once a member is marked
  // "Acted", tapping the pill again calls this to flip it straight back off,
  // with no modal and no second log line - the declared action already
  // logged is left alone, only the bookkeeping marker is corrected.

  isRowMemberActed(member: GruntMember): boolean {
    return member.hasActed;
  }

  /**
   * Un-mark (or, if ever called directly, mark) one NPC of a row as having
   * gone this pass, without opening the Act modal and without writing a log
   * line.
   *
   * Kept as a toggle, and kept undoable and unlogged for the same reason it
   * always was: a mis-tap at the table has to cost one tap to correct, not an
   * Undo, and a row of six must not write six bookkeeping lines a pass into a
   * log whose job is to record what happened in the fiction. Since Decision
   * 23 the template only reaches this method for the *un-mark* direction -
   * the mark-as-acted direction now goes through `btnRowMemberAct_Click` so
   * it is a real, logged action declaration - but the method itself is left
   * bidirectional so a caller (or a future control) can still flip either way
   * in one tap. Cleared automatically at each pass boundary
   * (`CombatManager.nextIniPass`) and Combat Turn boundary
   * (`NpcRowParticipant.softReset`) either way.
   */
  toggleRowMemberActed(member: GruntMember): void {
    UndoHandler.StartActions();
    member.hasActed = !member.hasActed;
    this.syncSharedState();
  }

  /**
   * "3/4 acted" for the row panel header - one glance tells the GM whether the
   * row still owes actions this pass. Counts only members that can still act:
   * a downed NPC is skipped when the row comes up (criterion 6, p. 379) and
   * would otherwise make the row look permanently unfinished.
   */
  getRowActedSummary(row: NpcRowParticipant): string {
    const active = row.activeMembers;
    return `${active.filter(m => m.hasActed).length}/${active.length} acted`;
  }

  /**
   * The Damage Value queued against one NPC in a row, defaulting to a single
   * box so the panel still works as a one-tap "+1" for chip damage.
   */
  getRowMemberDamageValue(member: GruntMember): number {
    return this.rowMemberDamageValues.get(member) ?? DEFAULT_ROW_MEMBER_DAMAGE_VALUE;
  }

  /**
   * Set the DV the next hit on this NPC will apply. Clamped to at least one box
   * (a DV of 0 is not an attack) and to no more than a full Condition Monitor's
   * worth plus the row's own headroom - the excess is discarded anyway, since
   * grunts take no overflow damage (p. 379).
   */
  setRowMemberDamageValue(member: GruntMember, value: number): void {
    const parsed = Math.floor(Number(value));
    const safe = Number.isFinite(parsed)
      ? Math.max(DEFAULT_ROW_MEMBER_DAMAGE_VALUE, Math.min(MAX_ROW_MEMBER_DAMAGE_VALUE, parsed))
      : DEFAULT_ROW_MEMBER_DAMAGE_VALUE;
    this.rowMemberDamageValues.set(member, safe);
  }

  /**
   * Template shorthands for the two damage buttons. Both types go on the same
   * combined track (p. 379); the type *and the DV* are still recorded because
   * together they decide alive-or-dead once the NPC drops (p. 379: Stun, or
   * Physical with DV less than Body, means alive; Physical with DV greater than
   * Body means dead). That is why these default to the GM-entered DV rather
   * than a fixed single box - with a fixed 1-box tap the recorded final DV
   * would always be 1 and a grunt killed by a 9P burst would report "alive".
   */
  hitRowMemberPhysical(row: NpcRowParticipant, member: GruntMember, boxes = this.getRowMemberDamageValue(member)) {
    return this.applyRowMemberDamage(row, member, boxes, "physical");
  }

  hitRowMemberStun(row: NpcRowParticipant, member: GruntMember, boxes = this.getRowMemberDamageValue(member)) {
    return this.applyRowMemberDamage(row, member, boxes, "stun");
  }

  /**
   * Undo a mis-keyed hit / heal an NPC, re-syncing the row's shared score.
   *
   * The house rule runs in both directions (Decision 1), so a heal that takes
   * the NPC back below a Wound Modifier threshold gives the *whole row* its
   * shared penalty back — and gets the same log line the wound got, for the
   * same reason: a GM watching every member of the row speed up at once needs
   * to see that it was the house rule and which NPC caused it.
   *
   * **Healing a downed NPC brings it back up** (brief Decision 13,
   * `RULINGS.md` 2026-08-07, reversing the 2026-08-02 refusal): out-of-action
   * is derived live from the box count, so taking boxes off puts the NPC back
   * on its feet, restores it to `activeMembers`, and un-flags the row if it was
   * the last one standing. This is now the correction path for a mis-keyed
   * killing blow, in place of global Undo.
   *
   * Log privacy as in `applyRowMemberDamage`: the GM sees the running damage
   * total, players see only that healing happened (Decision 17). The Condition
   * Monitor's maximum is dropped from the GM's copy too (Decision 25,
   * `RULINGS.md` 2026-08-13).
   */
  healRowMember(row: NpcRowParticipant, member: GruntMember, boxes: number) {
    UndoHandler.StartActions();
    const actor = this.rowLogActor(row);
    // Read before the call so the "back on its feet" line can be written from
    // the transition rather than inferred from the post-heal state alone.
    const wasOutOfAction = member.outOfAction;
    const result = row.healMember(member, boxes);
    if (result.healed > 0) {
      this.logRowEvent(actor,
        `${member.name} healed ${result.healed} (${member.damage})`,
        `${member.name} healed ${result.healed}`);
    }
    if (wasOutOfAction && !member.outOfAction) {
      // The reversal that Decision 13 exists for. Said out loud in both logs:
      // the NPC is back in the row's rotation from this moment on, which is
      // exactly the kind of change a GM must not have to infer.
      this.logRowEvent(actor, `${member.name} is back in action - Condition Monitor no longer full`);
    }
    if (result.scoreDelta !== 0) {
      // The ROW's applied delta, not the member's raw recovery: the row's
      // shared accumulator is floored at 0, so an NPC who arrived wounded can
      // recover four steps while the row gives back only the one it was
      // actually carrying. Logging the member's number there would claim a
      // shared-score movement that never happened.
      //
      // GM-only for the same reason the damage path's copy is (Decision 17).
      this.logGmOnlyRowEvent(actor, formatGroupWoundLogText(
        actor, member.name,
        result.rowWoundModifierDelta,
        result.scoreAfter
      ));
    }
    // A heal can *un*-spend a row (Decision 13 + Decision 14), so the spent flag
    // has to be re-evaluated here too, not only on the damage path.
    this.flagSpentNpcRows();
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
   *
   * **The default factory must stay a `DetachedGruntParticipant`.** This is the
   * only production caller of `detachMember`, and the template calls it with
   * two arguments, so this default *is* what every Detach tap constructs.
   * Defaulting it to a bare `Participant` (as it briefly did) silently gave
   * every detached grunt the PC shape of two independent Condition Monitors —
   * roughly double the boxes it had a moment earlier — contradicting p. 379 and
   * p. 381 ("They possess a single Condition Monitor, like other grunts") and
   * bypassing the class written to satisfy them. `NpcRowParticipant.detachMember`
   * has the same default, but a parameter default in the caller shadows it.
   */
  detachRowMember(
    row: NpcRowParticipant,
    member: GruntMember,
    factory: () => Participant = () => new DetachedGruntParticipant()
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
    this.logRowEvent(this.rowLogActor(row),
      `${member.name} detached from the row onto their own initiative`);
    // Detaching the last NPC empties the row, but that is tidying up, not a
    // wipe-out: the row is left as a plain empty row, not flagged/ooc/styled
    // red (brief Decision 21, `RULINGS.md` 2026-08-13, narrowing Decision 14
    // to the damage case). `flagSpentNpcRows()` still has to run so the row
    // gives up the current-actor slot if it was the one acting.
    this.flagSpentNpcRows();
    this.syncSharedState();
    this.sort();
    return detached;
  }

  /**
   * Remove an NPC from a row outright (GM correction, no standalone entry).
   *
   * **Always prompts first** (brief Decision 21, `RULINGS.md` 2026-08-13
   * "Emptying a row by hand is not the same as wiping it out") - Xavier's own
   * wording: "this is for all participant rows, it should prompt and offer to
   * delete." Same `confirmationDialog.simpleConfirm` pattern `btnDelete_Click`
   * uses. When the NPC being removed is the row's **last**, the same prompt
   * also offers to delete the now-empty row: a single "Yes" does both, in one
   * undo chapter, rather than leaving a corpse-free empty row behind for a
   * second tap the GM has to remember to make. Declining leaves everything
   * untouched.
   *
   * Deleting the row this way runs the exact same undoable side-map cleanup
   * `btnDelete_Click` does (`forgetParticipant`), including
   * `forgetMapEntry(this.rowMemberDamageValues, member)` for the member's own
   * queued Damage Value - otherwise undo would restore the row with a fresh,
   * defaulted set of GM-local bookkeeping (ARCHITECTURE.md §7/§8).
   *
   * Never raises `spentFlagged` or `ooc` (Decision 21): a row emptied this way
   * is not "wiped out", so `flagSpentNpcRows()` - which still has to run so a
   * mid-turn removal gives up the current-actor slot - reads it through
   * `NpcRowParticipant.isWipedOut`, not the broader `isSpent`, and leaves it
   * unflagged. Only called when the row survives the tap (i.e. not the last
   * member), since a deleted row has nothing left to flag.
   */
  async removeRowMember(row: NpcRowParticipant, member: GruntMember): Promise<void> {
    LogHandler.log(this.currentBTTime, (member.name || "NPC") + " RemoveRowMember_Click");
    const isLastMember = row.members.length === 1 && row.members[0] === member;
    const confirmationText = isLastMember
      ? `Are you sure you want to remove ${member.name || "this NPC"}? `
        + "It is the last NPC in the row - the now-empty row will be deleted too."
      : `Are you sure you want to remove ${member.name || "this NPC"} from the row?`;
    const confirmed = await this.confirmationDialog.simpleConfirm(confirmationText);
    if (!confirmed) {
      LogHandler.log(this.currentBTTime, (member.name || "NPC") + " RemoveRowMember_Cancel");
      return;
    }
    LogHandler.log(this.currentBTTime, (member.name || "NPC") + " RemoveRowMember_Confirm");
    UndoHandler.StartActions();
    row.removeMember(member);
    this.forgetMapEntry(this.rowMemberDamageValues, member);
    this.logRowEvent(this.rowLogActor(row), `${member.name} removed from the row`);
    if (isLastMember) {
      // The row is now a plain empty row (Decision 21) - the prompt already
      // offered to delete it, so finish the job in the same undo chapter
      // rather than leaving the GM a second tap to remember.
      this.forgetParticipant(row);
      this.combatManager.removeParticipant(row);
      this.clearGmRollAttributionIfNamed(row.name || "");
    } else {
      this.flagSpentNpcRows();
    }
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
    const id = this.participantIds.get(p);
    if (id) {
      this.forgetMapEntry(this.lastKnownDamage, id);
    }
    this.forgetMapEntry(this.declaredActionSelections, p);
    this.forgetMapEntry(this.participantIds, p);
    this.forgetMapEntry(this.participantOwners, p);
    this.forgetMapEntry(this.participantClaimable, p);
    this.forgetMapEntry(this.participantEdgeRatings, p);
    this.forgetMapEntry(this.participantReactions, p);
    this.forgetMapEntry(this.participantIntuitions, p);
    this.forgetMapEntry(this.participantTieBreakers, p);
    this.forgetSetEntry(this.expandedRowPanels, p);
    this.forgetSetEntry(this.expandedDeckPanels, p);
    this.forgetSetEntry(this.expandedAstralPanels, p);
    if (this.selectedActor === p) {
      const previous = this.selectedActor;
      UndoHandler.DoAction(
        () => { this.selectedActor = null; },
        () => { this.selectedActor = previous; }
      );
    }
  }

  /**
   * Delete one side-map entry **undoably**.
   *
   * The side maps are keyed by object identity and hold state the domain model
   * does not (`participantIds`, the ERIC tie-break inputs, ownership, panel
   * state — ARCHITECTURE.md §7/§8). Dropping them outside an undo closure makes
   * the removal only half-undoable: the participant comes back from the undo
   * stack, but with a brand-new id, a defaulted Reaction/Intuition, a fresh
   * random coin-toss tie-breaker, and it broadcasts to players as if it were
   * somebody new. Routed through `UndoHandler.DoAction` (the non-property
   * mutation primitive, §4) so they land in the same chapter as the list
   * removal that triggered them.
   */
  private forgetMapEntry<K, V>(map: Map<K, V>, key: K): void {
    if (!map.has(key)) {
      return;
    }
    const value = map.get(key) as V;
    UndoHandler.DoAction(
      () => { map.delete(key); },
      () => { map.set(key, value); }
    );
  }

  /** `forgetMapEntry` for the panel-expansion `Set`s. */
  private forgetSetEntry<T>(set: Set<T>, key: T): void {
    if (!set.has(key)) {
      return;
    }
    UndoHandler.DoAction(
      () => { set.delete(key); },
      () => { set.add(key); }
    );
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
