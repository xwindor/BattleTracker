import { AfterViewChecked, Component, OnInit, OnDestroy, ChangeDetectorRef, TemplateRef, ViewChild, ElementRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { NgbNavModule, NgbDropdownModule, NgbModal, NgbModalRef, NgbTooltip } from "@ng-bootstrap/ng-bootstrap";
import { Subscription } from "rxjs";
import { CombatManager, StatusEnum, BTTime, IParticipant } from "Combat";
import {
  Participant, PARTICIPANT_BASE_BACKING_FIELDS, MIN_DISPLAYED_DICE_TOTAL,
  PHYSICAL_INITIATIVE_DICE, DiceCountChangeResult, NO_DICE_COUNT_CHANGE,
  clampInitiativeDiceCount, rollInitiativeDie, INITIATIVE_PASS_DECAY,
  PARTICIPANT_DEFAULT_BASE_INI
} from "Combat/Participants/Participant";
import { LogHandler } from "Logging";
import { Action } from "Interfaces/Action";
import { FormsModule } from '@angular/forms';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import ActionHandler from "Combat/ActionHandler";
import { interruptTable } from "InterruptTable";
import { ConditionMonitorComponent } from "app/condition-monitor/condition-monitor.component";
import { ConfirmationDialogService } from 'app/confirmation-dialog/confirmation-dialog.service';
import { DiceRollerComponent, DiceRollRequest } from "app/dice-roller/dice-roller.component";
import {
  SessionCommand, SessionSyncService, SharedCombatState, SharedLogEntry, SharedParticipantState,
  SharedGmState, SharedGmParticipantState, SharedActionState
} from "app/services/session-sync.service";
import { MatrixStateService } from "app/services/matrix-state.service";
import { OsTrackingService } from "app/services/os-tracking.service";
import { MatrixParticipant, VRMode, DATA_PROCESSING_UNSET } from "Matrix";
import { AstralParticipant, ASTRAL_PROJECTION_DICE_DELTA } from "Magic";
import {
  DetachedGruntParticipant, GruntMember, NpcRowParticipant,
  hasGruntConditionMonitor, isNpcRow, createStandaloneGrunt, mergeGruntsIntoRow,
  DEFAULT_GRUNT_ATTRIBUTE, MIN_MERGEABLE_GRUNTS,
  ALL_GRUNT_STATBLOCKS, getStatblockById,
  instantiateStandaloneFromStatblock, instantiateRowFromStatblock
} from "Grunts";
import type { GruntDamageType, GruntMergeResult, GruntStatblock } from "Grunts";
import { MatrixParticipantBadgeComponent } from "app/matrix/matrix-participant-badge/matrix-participant-badge.component";
import { MatrixRunPanelComponent } from "app/matrix/matrix-run-panel/matrix-run-panel.component";
import { AstralBadgeComponent } from "app/magic/astral-badge/astral-badge.component";
import { ALL_MATRIX_ACTION_NAMES, CYBERDECK_REQUIRED_ACTIONS, DECLARED_ACTIONS, DECLARED_ACTION_DESCRIPTIONS, DeclaredActionCategoryId, DeclaredActionItem, ILLEGAL_OS_ACTIONS } from "app/shared/declared-actions";
import { getInterruptLabel, getInterruptDescription, getInterruptVerbPhrase } from "app/shared/interrupt-actions";
import { DeclaredActionEngine, DeclaredActionSelection, NO_DECLARED_ACTION_PHRASE } from "app/shared/declared-action-engine";
import {
  formatLogText, getLogTextClass,
  formatDiceRollLogText, formatInitiativeRollLogText, formatManualInitiativeRollLogText,
  formatInitiativeDeltaLogText, formatPassStartLogText, formatLogEntryReference,
  formatGroupWoundLogText, formatTurnStartLogText, formatTurnEndLogText,
  formatPassEndLogText, COMBAT_STARTED_LOG_TEXT, COMBAT_ENDED_LOG_TEXT
} from "app/shared/log-formatter";
import { classifyRoll } from "app/shared/roll-utils";

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
 * `addParticipant()`'s own seed values for `participantEdgeRatings` /
 * `participantReactions` / `participantIntuitions` on a brand-new row. Named
 * so `isUnusedPlaceholder()` (P2-2, durable-rooms review round 5) can compare
 * a row's side-map entries against "still exactly what a fresh row starts
 * with" rather than against "unset" - every row, including a genuinely
 * untouched one, gets these three maps populated at creation time, so "unset"
 * is never the right baseline.
 */
const PLACEHOLDER_EDGE_RATING_DEFAULT = 0;
const PLACEHOLDER_REACTION_DEFAULT = 3;
/**
 * Derived from `PARTICIPANT_DEFAULT_BASE_INI`, not a second independent `3`
 * (D-K, durable-rooms review round 7). `isUnusedPlaceholder()` below only
 * correctly recognises a fresh row because `PLACEHOLDER_REACTION_DEFAULT +
 * PLACEHOLDER_INTUITION_DEFAULT` happens to equal the constructor's
 * `_baseIni` default - previously true only by coincidence, with nothing
 * enforcing it, so changing either number alone would have silently made
 * every fresh row read as "touched" (reopening round-4 defect D5) with no
 * compiler or test catching it. Deriving one from the other makes that
 * impossible instead of merely documented.
 */
const PLACEHOLDER_INTUITION_DEFAULT = PARTICIPANT_DEFAULT_BASE_INI - PLACEHOLDER_REACTION_DEFAULT;

/**
 * The one `PARTICIPANT_BASE_BACKING_FIELDS` entry `isUnusedPlaceholder()`
 * must skip (review defect D4, durable-rooms review round 6): see that
 * method's doc comment for why `_sortOrder` is excluded from the "is this row
 * still untouched" comparison. Named so the exclusion cannot silently stop
 * matching a renamed backing field.
 */
const PLACEHOLDER_SORT_ORDER_FIELD = "_sortOrder";

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
 * Default name prefix for a plain (non-grunt) participant left unnamed at
 * commit (defect D2, validator round). The "+" Add Participant button used to
 * create a genuinely nameless participant with **zero** log lines ever - the
 * dialog's own placeholder promised "Leave blank to use the default name" but
 * no such default existed for `kind === "participant"`.
 *
 * Its own namespace, distinct from every other default-name prefix in this
 * file (`STANDALONE_GRUNT_NAME_PREFIX` "Grunt", `MERGED_GRUNT_ROW_NAME`
 * "Grunt Group", `DEFAULT_ROW_MEMBER_NAME_PREFIX` "NPC") so a hand-added
 * participant can never answer to the same name as a grunt, a row or a row
 * member (brief acceptance criterion 4). Also deliberately not "Participant"
 * - `buildSharedParticipant()` already uses `"Participant <n>"` as a
 * *wire-only, never-written-back* rendering fallback for a still-blank
 * participant (implementation appendix, "the fourth, wire-only namespace");
 * reusing that word here could put a real, permanently-named participant next
 * to another participant's blank-name placeholder text that happens to render
 * identically.
 */
const STANDALONE_PARTICIPANT_NAME_PREFIX = "Combatant";

/**
 * Kinds of participant the single "name before add" dialog can build (brief
 * "Grunt naming and statblocks", implementation appendix "The choke point").
 * `"merge"` is not a *creation* in the same sense as the other three - it
 * folds already-existing standalone grunts into a new row - but it goes
 * through the same dialog because it shares the same defect the others do
 * (`mergeSelectedGrunts` picks a name before the GM has any say, brief IA1).
 */
type AddDraftKind = "participant" | "grunt" | "row" | "rowMember" | "merge";

/**
 * The one draft object the "name before add" dialog edits (brief U1/U12, D2).
 * Nothing here is committed to `combatManager.participants` until
 * `commitAddDraft()` runs; `cancelAddDraft()` just discards it.
 */
interface AddDraft {
  kind: AddDraftKind;
  /** Proposed name, pre-filled from the same generator the button used to seed instantly. */
  name: string;
  /** Row member count (kind === "row" only). */
  count: number;
  body: number;
  willpower: number;
  /** Selected template id (`GruntStatblock.id`), or `null` for a hand-built grunt/row (D3). */
  statblockId: string | null;
  /** U4: load the template's augmented (bracketed) values rather than its base ones. */
  loadAugmented: boolean;
  /** kind === "rowMember" only: which existing row the NPC joins. */
  targetRow: NpcRowParticipant | null;
  /**
   * kind === "grunt" only, and only meaningful when the selected template is
   * a lieutenant (U7): the row this lieutenant beats on an Initiative tie
   * with his own team (p. 381). Never auto-filled - a lieutenant is never
   * auto-linked to a group (brief acceptance criterion 16 / U6).
   */
  lieutenantTeamRow: NpcRowParticipant | null;
}

/**
 * Shared-log wording for a plain participant or an empty row added through
 * the dialog (brief Decision D2). `addGrunt`/`addNpcToRow`/`mergeSelectedGrunts`
 * already have their own wording and keep it unchanged - `commitAddDraft()`
 * does not queue this text for those kinds at all (see that method).
 *
 * None of these fire at commit any more (RULINGS.md 2026-08-30): every use
 * is queued through `queueJoinAnnouncement()` and only actually written to
 * the log the first time the participant it names has a rolled Initiative
 * Score.
 */
const PARTICIPANT_JOINED_LOG_TEXT = "joined the fight.";
const ROW_FORMED_LOG_TEXT = "formed.";
/** Shared-log wording for a standalone grunt (`addGrunt`/`commitTemplateGrunt`). */
const GRUNT_ADDED_LOG_TEXT = "added.";

/**
 * One deferred join-log line, resolved lazily by `announceJoinIfPending()`
 * against whichever `IParticipant` instance the queue entry is currently
 * keyed on - not a closure over the object that created it, so a queued
 * announcement keeps resolving correctly after a duplicate or a
 * promote/demote type swap moves it to a different object (see
 * `pendingJoinAnnouncement`'s own doc comment). Every resolver here always
 * produces a line; there is no "not ready yet" case left to encode, because
 * every add path either supplies a name up front or (Tab-to-add only) picks
 * a default name at the moment it actually fires.
 */
type JoinAnnouncementResolver = (p: IParticipant) =>
  { actor: string; text: string; playerText?: string };

/**
 * One queued entry in a participant's join-announcement queue: the resolver
 * plus, for a row-member entry only, the specific `GruntMember` it was
 * queued for. `addNpcToRow` queues one entry per NPC added, all keyed on the
 * *row* (not the member), so a row waiting to roll can be carrying several
 * members' entries at once. Tagging each entry with its member lets a later
 * removal or relocation of that one member (`removeRowMember`,
 * `detachRowMember`) prune just its own entry out of the row's queue without
 * touching any other still-pending member's line (RULINGS.md 2026-08-30, "A
 * combatant created and deleted before initiative is rolled is never
 * announced, which is the point"). Entries queued for anything other than a
 * row member (a plain participant, a standalone grunt, a whole new row)
 * leave `member` undefined - there is nothing else in their queue to prune
 * around.
 */
interface QueuedJoinAnnouncement {
  resolve: JoinAnnouncementResolver;
  member?: GruntMember;
}

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
 * Floor on a Grunt Group's member count (defect D8, validator round): the
 * "Number of NPCs" box was unvalidated, and a typed `0` created an empty row
 * that still logged "formed.", still occupied an initiative slot, and
 * represented a squad that did not exist. Not a rule citation - a
 * keyboard-typo guard, the same class of thing as `MAX_ROW_MEMBER_DAMAGE_VALUE`.
 */
const MIN_ROW_MEMBER_COUNT = 1;

/**
 * Upper guard on a Grunt Group's member count (defect D8, validator round): a
 * typed `250` created 250 members with no warning. Not a rule citation - a
 * keyboard-typo guard (a stray extra digit), generous enough for the largest
 * sample squad any GM is realistically running at one table.
 */
const MAX_ROW_MEMBER_COUNT = 50;

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

/**
 * Coerce a box count read off the GM-only restore channel.
 *
 * `restoreFromSharedState` has always coerced the player-facing fields
 * (`Math.max(0, Number(...))`) and guarded the Score with `Number.isFinite`,
 * because a room file is untrusted input. The GM-only channel added by the
 * "GM reconnect state loss" brief initially assigned its numbers raw, and none
 * of `Participant`'s Condition Monitor setters coerce or clamp - so a corrupt
 * or truncated snapshot wrote `NaN` into a damage track instead of degrading
 * (review defect D6). A non-finite or negative value falls back to whatever
 * the freshly constructed participant already had, which is the same thing a
 * missing `gm` entry produces.
 */
function gmCount(raw: unknown, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
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
    MatrixRunPanelComponent,
    AstralBadgeComponent
  ]
})
export class BattleTrackerComponent implements OnInit, OnDestroy, AfterViewChecked {
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

  // ── "Name before add" dialog (brief "Grunt naming and statblocks") ───────
  private addDraftModalRef: NgbModalRef | null = null;
  /** The in-progress draft, or `null` when no add dialog is open. Public: the template binds to it directly. */
  pendingAddDraft: AddDraft | null = null;
  readonly allGruntStatblocks: readonly GruntStatblock[] = ALL_GRUNT_STATBLOCKS;

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
   * Not persisted anywhere else, deliberately: this is transient view state in
   * an OnPush child component, not combat state. Re-arming it is one tap in
   * the same field.
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
   * Per-room snapshot of participant IDs, seeded whenever a room is added to
   * `liveEncounterRooms` (round-4 fix D6) and **refreshed on every successful
   * push** inside `syncSharedState()` (round 5, fixing Symptom C - D-E,
   * durable-rooms review round 7, corrects this comment and the one on
   * `liveEncounterDivergedFrom()` below, which both used to say the opposite
   * and cited each other as the reason).
   *
   * `liveEncounterRooms` membership is additive and never expires on its own
   * (round-3 fix 6, by design - see the doc comment above), which is provably
   * wrong once this tab has gone on to become the live source of truth for a
   * *different* encounter under a different room code: the two share nothing,
   * but a blind push would still silently overwrite the old room's real saved
   * state with the new, unrelated one. `liveEncounterDivergedFrom()` compares
   * the current on-screen participants against this fingerprint to tell the
   * two cases apart - and because `syncSharedState()` keeps the fingerprint
   * current with every push this tab makes for that room, ordinary play (add
   * one, remove one, many pushes over a long session) never trips it; only a
   * wholesale cast swap with no push in between does.
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
    // A pull genuinely replaces this tab's encounter (every earlier
    // association is now stale - see the getter's doc comment), so every
    // other room's shelved ownership becomes unreachable garbage the moment
    // this runs: `switchActiveOwnershipRoom` can only ever be reached for a
    // room this tab still `holdsLiveEncounterFor`, and this call is what
    // erases that membership for everything except `room` itself (D-A,
    // durable-rooms review round 7). `restoreFromSharedState()` (the only
    // caller that assigns a non-empty `room` here) has already rebuilt the
    // active `participantOwners`/`participantClaimable` maps directly from
    // the server's own copy by the time this setter runs, so `room` becomes
    // `activeOwnershipRoom` as a bookkeeping fact only - nothing here touches
    // those maps' content.
    this.ownershipByRoom.clear();
    // Same reasoning, same moment, for the hidden-log shelf (durable-rooms
    // review round 8, item 3): every other room's shelved hidden entries are
    // equally unreachable once this runs, since only a room this tab
    // `holdsLiveEncounterFor` can ever be switched into via
    // `switchActiveOwnershipRoom` again. Whatever `room` itself had shelved
    // was already folded into `sharedLogEntries` by the caller before this
    // setter runs (see the join branch that assigns here), so nothing is
    // lost by clearing the shelf out from under it.
    this.hiddenLogEntriesByRoom.clear();
    this.activeOwnershipRoom = room;
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
   * Which participants show their E/R/I/D stats as editable inputs rather than
   * as the read-only `E2 R5 I4 D2` summary.
   *
   * Purely presentational, and the reason it exists is row height: the four
   * chip+input pairs are ~230px of controls in a `col-lg-3`, which is a quarter
   * of the row's width spent on values that are typed once at setup and then
   * essentially never touched again (Xavier: "maybe we need a twirly we can
   * collapse for stat input"). Collapsed, the same numbers still read at a
   * glance in ~70px, so nothing is hidden - only made non-editable until asked
   * for.
   *
   * Transient view state, the same class of thing as `expandedRowPanels` -
   * holds no game state.
   */
  expandedStatEditors = new Set<IParticipant>();
  /**
   * The Damage Value the GM is about to apply to each NPC in a row.
   *
   * Needed because p. 379 settles a downed grunt's alive-or-dead from the DV of
   * the **final attack** compared against Body — so the tracker has to be told
   * the attack's real DV, not just "one more box". Purely transient view state
   * (the same class of thing as `expandedRowPanels`): it holds nothing that
   * survives applying the damage, and a mis-keyed DV is corrected by editing
   * this field again before the tap, or by healing afterward.
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
  /**
   * Who owns each participant, for whichever room `activeOwnershipRoom`
   * currently names - see that field's doc comment for the full per-room
   * model (D-A, durable-rooms review round 7). Every read/write site in this
   * file that is not part of a room switch treats this map exactly as it
   * always has: a flat `Map<IParticipant, string>` for "the room this tab is
   * broadcasting to right now". That invariant - the map always describes
   * `activeOwnershipRoom`, which a room switch keeps equal to `shareRoomCode`
   * - is what lets ~60 existing call sites stay untouched while the
   * underlying fact becomes per-room.
   */
  private readonly participantOwners = new Map<IParticipant, string>();
  /**
   * Whether each participant is available for a player to claim at all - a GM
   * authoring decision, and deliberately **not** room-scoped the way
   * `participantOwners` is (D-A, durable-rooms review round 7): a character
   * marked claimable stays claimable across a room switch (round 6's D8
   * tests fix this as tested, unmodified, behaviour), only *who currently
   * holds* the claim resets per room. See `snapshotActiveOwnership`'s doc
   * comment for the full reasoning.
   */
  private readonly participantClaimable = new Map<IParticipant, boolean>();
  /**
   * Per-room shelf for ownership (`participantOwners` only - see
   * `participantClaimable`'s doc comment for why that map is excluded),
   * keyed by the stable participant id (`getParticipantId`), not object
   * identity - object identity cannot distinguish rooms here, because one
   * `CombatManager` (and so one set of `Participant` objects) can legitimately
   * be the live source of truth for several room codes at once
   * (`liveEncounterRooms`). Only one room's ownership can be the *active*
   * `participantOwners` content at a time - see `activeOwnershipRoom` - so
   * this is where every other room's ownership lives while it is not.
   *
   * Written only by `shelveActiveOwnership`/`switchActiveOwnershipRoom`, read
   * only by `loadShelvedOwnership`/`switchActiveOwnershipRoom`. Entries leave
   * on the same two events `liveEncounterRooms` membership does (a full pull
   * replacing this tab's encounter, or the room being permanently ended) -
   * see the call sites of each for why.
   */
  private readonly ownershipByRoom = new Map<string, Map<string, string>>();
  /**
   * Per-room shelf for GM-local hidden log entries (durable-rooms review
   * round 8, item 3) - the same "one flat variable holding a per-room fact"
   * shape `ownershipByRoom` closed for ownership in round 7, closed here for
   * `sharedLogEntries`'s hidden subset. `sharedLogEntries` is a single global
   * array holding whichever room is currently active's whole log (hidden and
   * visible entries together, see `getHiddenLogEntries`); without this shelf
   * a hidden note written while running room B survives a switch to room A
   * inside that global array and `mergeHiddenLogEntries` folds it into room
   * A's server log on the next join - a GM-visible-only leak (nothing reaches
   * players), but cumulative across further switches.
   *
   * Written/read at the exact same seams as `ownershipByRoom`:
   * `switchActiveOwnershipRoom` (every join/create branch that keeps this
   * tab's own local state live) and the `liveEncounterRoomCode` setter (the
   * destructive-pull branch, which invalidates every other room's shelf the
   * same way it already does for ownership - see that setter's doc comment).
   * Keyed by room code, same lifecycle as `ownershipByRoom`: entries leave on
   * a full pull replacing this tab's encounter, or the room being
   * permanently ended.
   */
  private readonly hiddenLogEntriesByRoom = new Map<string, SharedLogEntry[]>();
  /**
   * Which room code the flat `participantOwners`/`participantClaimable` maps
   * currently describe. **Not the same field as `shareRoomCode`** (D-A,
   * durable-rooms review round 7) - deliberately: `shareRoomCode` can be
   * blanked (a Close, an external close notice) while this tab's in-memory
   * ownership for that room is still perfectly correct and does not need
   * shelving or reloading, only a later push needs `shareRoomCode` restored.
   * Conflating the two was the original defect: "is this tab authorized to
   * broadcast to room X" (`shareRoomCode`, see ARCHITECTURE §7) and "which
   * room's ownership do the flat maps hold" are two different per-room facts
   * that do not always change together, and D-A's repro was exactly a path
   * that changed the first without the second ever being represented at all.
   */
  private activeOwnershipRoom = "";
  private readonly participantEdgeRatings = new Map<IParticipant, number>();
  private readonly participantReactions = new Map<IParticipant, number>();
  private readonly participantIntuitions = new Map<IParticipant, number>();
  private readonly participantTieBreakers = new Map<IParticipant, number>();
  private readonly lastKnownDamage = new Map<string, { physical: number; stun: number }>();
  /**
   * GM-only imprint of which statblock a templated grunt/row was instantiated
   * from, and whether it was loaded with augmented (bracketed) values (brief
   * "Grunt naming and statblocks" U2/D-X4). Rides `SharedGmParticipantState`
   * only - `professionalRating` is capability information of the same class
   * as a Condition Monitor maximum (RULINGS 2026-08-13), so it never reaches
   * `SharedParticipantState`. Obligations: cleared in `restoreFromSharedState`,
   * dropped in `forgetParticipant`, copied in `btnDuplicate_Click`, deleted in
   * `upsertPlayerParticipant`'s type-mismatch branch, and (defect 4, fix round
   * 2) carried across every promote/demote in-place type swap
   * (`promoteToMatrixParticipant`/`demoteToParticipant`/
   * `promoteToAstralParticipant`/`demoteFromAstralParticipant`) exactly like
   * `participantEdgeRatings`/`participantReactions`/`participantIntuitions`.
   */
  private readonly participantStatblocks = new Map<IParticipant, { id: string; augmented: boolean }>();
  /**
   * U7 (brief p. 381): which row a lieutenant beats on an Initiative tie with
   * his own team, keyed by `getParticipantId(row)` rather than an object
   * reference - object identity does not survive `restoreFromSharedState`,
   * which rebuilds every participant (see `initiativeTieBreakComparator`).
   * Same obligations as `participantStatblocks` (including the promote/demote
   * type-swap carry-over added by defect 4, fix round 2) **except**
   * duplication (defect D7, validator round): `btnDuplicate_Click`
   * deliberately does **not** copy this entry to the clone, or a duplicated
   * lieutenant and its source would both be linked to the same row - both
   * beating it on a tie, and tying with each other, with no comparator rule
   * to order the two of them (this map has nothing to say about a
   * lieutenant-vs-lieutenant tie). A duplicated lieutenant is created
   * unlinked; the GM re-links it by hand (D3's retroactive control) if that
   * is genuinely wanted.
   */
  private readonly participantLieutenantTeamRowId = new Map<IParticipant, string>();
  /**
   * Deferred "joined the fight" log lines, one queue per participant
   * (RULINGS.md 2026-08-30, "A combatant is announced when they enter the
   * initiative order, not when a name box loses focus" — this replaces the
   * blur/Enter-triggered design entirely; there is no `onParticipantNameCommitted`
   * any more).
   *
   * Every GM-side add path (the plus button, Tab-to-add, Add Grunt, Grunt
   * Group, Add NPC, merge, and the add dialog's Confirm) calls
   * `queueJoinAnnouncement()` instead of writing its join line directly.
   * `announceJoinIfPending()` is the single choke point that actually writes
   * a queued line, the first time the participant it is keyed on has a
   * rolled Initiative Score (`diceIni > 0`) - called from every place that
   * writes a real Initiative Test result (`rollAndLogInitiative`, the player
   * `roll_submission` command, and the manual rolled-total box), and from
   * `queueJoinAnnouncement` itself so a reinforcement joining an
   * already-rolled row (`addNpcToRow`) announces immediately rather than
   * waiting for a roll that will never happen for it individually.
   *
   * A combatant created and deleted before initiative is ever rolled never
   * reaches `diceIni > 0` and is therefore never announced - the entire
   * point of the ruling above, and the reason three earlier fix rounds
   * failed: the old trigger was a *focus* event, and a confirmation pop-up
   * (there are eleven `confirmationDialog` call sites in this file, and
   * every one steals focus) blurred the name box an instant before a
   * combatant was deleted, writing a join line for someone who never
   * entered the fight.
   *
   * Each resolver is a function of the *current* `IParticipant` instance it
   * is fired against, not a closure over the object that created it - so a
   * queue entry keeps resolving correctly after `btnDuplicate_Click` copies
   * it to a clone, or a promote/demote type swap
   * (`promoteToMatrixParticipant`/`demoteToParticipant`/
   * `promoteToAstralParticipant`/`demoteFromAstralParticipant`) moves it to
   * a different object entirely (round 2 defect 8 - the entry used to be
   * silently dropped on every one of those four swaps).
   *
   * Same four obligations as every other GM-local side map
   * (ARCHITECTURE.md §8): cleared in `restoreFromSharedState` (a bulk
   * rebuild - nothing here survives a rejoin, and nothing should: a
   * restored participant already has whatever name and roll state it was
   * broadcast with), dropped in `forgetParticipant`, copied in
   * `btnDuplicate_Click`, deleted in `upsertPlayerParticipant`'s
   * type-mismatch branch, and now also carried across every promote/demote
   * type swap.
   */
  private readonly pendingJoinAnnouncement = new Map<IParticipant, QueuedJoinAnnouncement[]>();
  private damageLogFlushTimeout: number | null = null;
  private readonly damageLogDebounceMs = 500;

  // -- OS threshold alert state --
  @ViewChild("convergenceModalTpl") private convergenceModalTpl!: TemplateRef<unknown>;
  /** The "name before add" dialog template (brief U1/U12). */
  @ViewChild("addDraftModalTpl") private addDraftModalTpl!: TemplateRef<unknown>;

  /**
   * Transient "you owe Overwatch Score" reminders shown to the GM.
   *
   * These are rules-correct and stay: for any Attack or Sleaze action, "your OS
   * increases by the number of hits the target gets on its defense test"
   * (p. 232), which this app never rolls — so the GM is reminded to apply it
   * once defense is resolved. Formerly named `icAlertMessages` and labelled
   * "IC Alert", which wrongly implied an OS-driven alert threshold; SR5 has no
   * Overwatch threshold below convergence at 40.
   */
  osReminders: string[] = [];
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
    this.addParticipant();
    this.changeDetector = ref;
    // A linked NPC row can be found spent by the engine itself
    // (`advanceToNextActors()`'s pre-step), not just by a GM tap. Registering
    // here means the log line happens once, in exactly the same way, whichever
    // path noticed it.
    this.combatManager.onSpentNpcRowsFlagged = rows => this.onSpentNpcRowsFlagged(rows);
    // Structural combat boundaries (Initiative Pass end, Combat Turn end) are
    // observed the same way: one listener, set here, so every one of the ten
    // call paths that can reach `endInitiativePass()`/`endCombatTurn()`
    // (ARCHITECTURE.md §2, brief "Action Log entries for combat structural
    // boundaries") logs identically regardless of which triggered it.
    this.combatManager.onInitiativePassEnded = pass => this.logInitiativePassEnded(pass);
    this.combatManager.onCombatTurnEnded = turn => this.logCombatTurnEnded(turn);
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

  /**
   * Whether the Matrix run panel is shown. Off by default.
   *
   * The Matrix module is still parked (`CLAUDE.md`, "Current focus") and this
   * is the first and only thing that mounts it — `<app-matrix-run-panel>` had
   * no consumer anywhere in the app, so the hierarchy editor, access-host
   * panel, matrix graph and decker cards were all compiled, type-checked and
   * unit-tested but unreachable at runtime. This toggle exists so the module
   * can be exercised by hand; it is deliberately not the finished GM workflow
   * (see `docs/MATRIX_MODULE_PLAN.md`).
   */
  showMatrixPanel = false;

  toggleMatrixPanel(): void {
    this.showMatrixPanel = !this.showMatrixPanel;
  }

  /**
   * Every Matrix-capable participant that can actually hold a mark, for the
   * run panel's decker cards and the hierarchy editor's mark controls.
   *
   * **Nameless participants are excluded.** `MatrixHost.marks` and
   * `MatrixTarget.marks` are keyed by `decker.name` (a string), so a
   * participant with no name cannot be a mark key at all. The constructor
   * seeds one untouched blank row on every tab load (see
   * `isUnusedPlaceholder()`), which without this filter reached the +Mark
   * picker as an option with an empty label and an empty value — the picker
   * rendered blank and its confirm button silently did nothing, because
   * `TargetCardComponent.confirmAddMark()` bails on a falsy id.
   *
   * Filtering here rather than in the card keeps the rule in one place: a
   * participant with no name is not addressable by any Matrix record, so it
   * is not a decker as far as this module is concerned.
   */
  get matrixActiveDeckers(): MatrixParticipant[] {
    return CombatManager.participants.items
      .filter((p): p is MatrixParticipant => this.isMatrix(p) && (p.name ?? "").trim() !== "");
  }

  /**
   * Routes the run panel's jack-in request through the same funnel the GM's
   * own row button uses, so the dice-count and Initiative handling stay in one
   * place rather than being duplicated for the panel.
   */
  onMatrixJackInRequested(event: { decker: MatrixParticipant; mode: VRMode }): void {
    this.setPendingVrMode(event.decker, event.mode);
    this.gmJackIn(event.decker);
  }

  onMatrixJackOutRequested(decker: MatrixParticipant): void {
    this.gmJackOut(decker);
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
    this.osTracking.resetOS(this.asMatrix(p));
    this.syncSharedState();
    this.changeDetector.detectChanges();
  }

  dismissOsReminder(index: number): void {
    this.osReminders.splice(index, 1);
  }

  dismissConvergenceAlert(): void {
    if (this.convergenceModalRef) {
      this.convergenceModalRef.close();
      this.convergenceModalRef = null;
    }
    this.convergenceAlertDecker = null;
  }

  // -- Act modal Overwatch reminder --

  /**
   * Attack/Sleaze actions in the current modal selection, which will owe
   * Overwatch Score once defense is resolved (p. 232).
   *
   * Names only, no amounts: OS equals the defender's hits, which this app does
   * not roll. The former `delta` on each entry came from a per-action cost
   * table that is not a rule (see `ILLEGAL_OS_ACTIONS`).
   */
  get actModalIllegalOsActions(): string[] {
    if (!this.actModalParticipant || !this.isMatrix(this.actModalParticipant)) return [];
    const sel = this.getDeclaredActionSelection(this.actModalParticipant);
    const all = [sel.free, ...sel.simple, sel.complex].filter((a): a is string => !!a);
    return all.filter(name => ILLEGAL_OS_ACTIONS.has(name));
  }

  /** True when the current selection owes Overwatch Score after defense. */
  get actModalOwesOverwatch(): boolean {
    return this.actModalIllegalOsActions.length > 0;
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
    this.observedLocalLogCount = this.logHandler.logbook.length;
    // Convergence (OS 40, p. 232) is the only Overwatch event there is. The
    // former `ic-alert` branch here fired at OS 20 on a rule that does not
    // exist in SR5 — see `briefs/matrix-rules-verification.md` item 3b.
    this.osThresholdSub = this.osTracking.threshold$.subscribe(event => {
      if (event.alert === "convergence") {
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
    if (this.combatManager.onInitiativePassEnded) {
      this.combatManager.onInitiativePassEnded = null;
    }
    if (this.combatManager.onCombatTurnEnded) {
      this.combatManager.onCombatTurnEnded = null;
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
      // Defect D4 fix (validator round): the p. 381 lieutenant-beats-his-own-
      // tied-team rule is a post-sort adjustment, not part of the comparator
      // above - see `applyLieutenantPrecedence`'s doc comment.
      this.applyLieutenantPrecedence(this.combatManager.participants.items);
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
      // Review defect D8 (durable-rooms review round 6): a brand-new room has
      // no state to reconcile ownership against - `reconcileOwnershipFromServer`
      // only ever runs on `gm:join-session`, and a fresh `gm:create-session`
      // never calls it - so the very first push to the new room must not carry
      // any `ownerName` still cached from whichever players were claimed in
      // the *previous* room; a stale token there would deny every returning
      // player's `claim_character` against the server's `existingOwner` check
      // with no GM action able to explain why.
      //
      // Round 6 closed that by *destroying* `participantOwners` outright - a
      // GM who creates a room by mistake and immediately rejoins `previousRoom`
      // to recover (the round-3 fix 6 flow the confirmation dialog above
      // describes) found that room's real, still-valid owners gone too. That
      // was disclosed as a deliberate trade-off, not a bug, but it was the same
      // global-variable-for-a-per-room-fact substitution review round 6 kept
      // finding through new doors elsewhere in this file: `participantOwners`
      // is one flat map shared across every room this tab is simultaneously
      // live for, so the only way to give the new room a clean slate was to
      // wipe every room's slate.
      //
      // `switchActiveOwnershipRoom` (D-A, durable-rooms review round 7) closes
      // it at the representation instead: it shelves `previousRoom`'s current
      // ownership under its own code before resetting the active maps to
      // empty for `room`, so "the new room has no ownership yet" and "the
      // previous room's ownership remains intact for its own later rejoin" are
      // both true at once, with nothing to disclose as a trade-off. See that
      // method's doc comment and `activeOwnershipRoom`'s for the full model.
      this.switchActiveOwnershipRoom(room);
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
   * Snapshot the *active* `participantOwners` content, keyed by stable
   * participant id rather than object identity (D-A, durable-rooms review
   * round 7). Object identity is exactly what a per-room shelf cannot key on:
   * the same `Participant` objects are what gets shelved under one room code
   * and reloaded under another, so keying on the object itself would make
   * every entry collide.
   *
   * **`participantClaimable` is deliberately excluded** - it is not a
   * per-room fact the way `ownerName` is. `claimable` marks a GM authoring
   * decision ("this character is available for a player to claim at all"),
   * not which specific player-token in which specific room claimed it; the
   * pre-existing, tested contract (round 6's D8 tests, kept passing
   * unmodified by this round) is that Create Player Session leaves it
   * untouched while clearing ownership. A brand-new room's characters are
   * therefore still claimable by its own (new) players by default, exactly
   * as before - only *who* claimed them is room-scoped.
   */
  private snapshotActiveOwnership(): Map<string, string> {
    const snapshot = new Map<string, string>();
    for (const p of this.combatManager.participants.items) {
      const ownerName = this.participantOwners.get(p);
      if (ownerName !== undefined) {
        snapshot.set(this.getParticipantId(p), ownerName);
      }
    }
    return snapshot;
  }

  /**
   * Shelve `room`'s ownership - the *current* content of the active
   * `participantOwners` map - under its own key in `ownershipByRoom`, so it
   * survives becoming inactive. A no-op for an empty room code (nothing to
   * shelve under). An empty snapshot removes any stale shelf entry rather
   * than storing one, so a room that has been fully un-owned since it was
   * last active does not resurrect old owners on a later reload.
   */
  private shelveActiveOwnership(room: string): void {
    if (!room) {
      return;
    }
    const snapshot = this.snapshotActiveOwnership();
    if (snapshot.size === 0) {
      this.ownershipByRoom.delete(room);
      return;
    }
    this.ownershipByRoom.set(room, snapshot);
  }

  /**
   * Replace `participantOwners`' content with `room`'s shelved ownership, or
   * with nothing if `room` has none shelved - "the new room simply has no
   * ownership yet" (spec, Part 1) is exactly the no-shelf case, not a special
   * case of it. Every currently-owned participant not present in the loaded
   * shelf ends up with no owner, matching the room whose ownership is being
   * loaded rather than whatever was active a moment ago. `participantClaimable`
   * is untouched - see `snapshotActiveOwnership`'s doc comment for why.
   *
   * **A shelved owner is only restored onto a participant that is currently
   * claimable** (durable-rooms review round 8, item 2). `participantClaimable`
   * is deliberately not shelved per room (see `snapshotActiveOwnership`), so
   * it can legitimately be toggled off in a *different* room than the one
   * whose ownership shelf still names an owner for that same character id -
   * e.g. "Raven" claimed by a player in room A, then re-authored as a
   * straight NPC (claimable off) while room B is active. Without this guard,
   * switching back to A would reload `{Raven -> pl-1}` with
   * `claimable === false`, a combination the rest of the app assumes cannot
   * happen: the server's `releasePlayerClaims`/`release_claims` and the
   * claim-request handler all gate on `claimable === true`
   * (`server.js`), so a disconnecting or returning player could neither
   * release nor reclaim it, leaving a permanently "Claimed" chip on a dead
   * token clearable only by a manual Release. Skipping the entry here keeps
   * the invariant "an owner implies claimable" true immediately after every
   * room switch instead of only after the GM notices and manually releases
   * it. The shelf entry itself is left alone - if claimable is switched back
   * on later, the original owner reappears on the next switch into the room,
   * matching the mis-tap-recovery guarantee the rest of this shelf gives.
   */
  private loadShelvedOwnership(room: string): void {
    this.participantOwners.clear();
    const snapshot = room ? this.ownershipByRoom.get(room) : undefined;
    if (!snapshot) {
      return;
    }
    for (const p of this.combatManager.participants.items) {
      const ownerName = snapshot.get(this.getParticipantId(p));
      if (ownerName && this.participantClaimable.get(p) === true) {
        this.participantOwners.set(p, ownerName);
      }
    }
  }

  /**
   * Shelve `room`'s currently-active hidden log entries (the GM-local subset
   * of `sharedLogEntries` - see `getHiddenLogEntries`) under their own room
   * key, mirroring `shelveActiveOwnership` exactly. A no-op for an empty room
   * code. An empty snapshot removes any stale shelf entry rather than storing
   * one, same reasoning as `shelveActiveOwnership`: a room with no hidden
   * entries left as of this switch should not resurrect old ones on a later
   * reload.
   */
  private shelveActiveHiddenLog(room: string): void {
    if (!room) {
      return;
    }
    const hidden = this.getHiddenLogEntries();
    if (hidden.length === 0) {
      this.hiddenLogEntriesByRoom.delete(room);
      return;
    }
    this.hiddenLogEntriesByRoom.set(room, hidden);
  }

  /** `room`'s shelved hidden entries, or none if it has never held any. */
  private loadShelvedHiddenLog(room: string): SharedLogEntry[] {
    const shelved = room ? this.hiddenLogEntriesByRoom.get(room) : undefined;
    return shelved ? [ ...shelved ] : [];
  }

  /**
   * Switch which room the flat `participantOwners` map describes, from
   * `activeOwnershipRoom` to `toRoom` (D-A, durable-rooms review round 7 -
   * the fix for review defect D-A / "the class is relocated, not closed").
   * `participantClaimable` is never switched - see `snapshotActiveOwnership`'s
   * doc comment.
   *
   * This is the one place ownership becomes representable per room instead of
   * being a single global the next room switch either destroys or
   * mis-attributes: shelve whatever is currently active under its own room
   * code (so a later switch back finds it again - the mis-tap recovery the
   * Create Player Session dialog promises), then load `toRoom`'s own shelf (or
   * nothing, if `toRoom` has never been active before - "the new room simply
   * has no ownership yet", exactly as the spec requires, with the previous
   * room's ownership left completely alone).
   *
   * A no-op when `toRoom` already **is** `activeOwnershipRoom` - not merely an
   * optimisation. Without this guard a room that is still active (its
   * ownership was never shelved out, e.g. `shareRoomCode` was blanked by a
   * Close without ever switching which room's ownership is active - see
   * `activeOwnershipRoom`'s doc comment) would have its own, still-correct
   * content shelved into itself and then immediately reloaded from an empty
   * shelf, silently wiping every current owner.
   *
   * Callers pass only the target room; `activeOwnershipRoom` is the
   * authoritative "from" so it can never drift out of sync with what the map
   * actually holds, the way tracking it via a second local variable at each
   * call site could.
   *
   * **Also switches GM-local hidden log entries** (durable-rooms review
   * round 8, item 3), reusing this exact seam rather than a second one: every
   * caller of this method calls `mergeHiddenLogEntries()` immediately
   * afterward, so `sharedLogEntries`'s hidden subset must already be
   * `toRoom`'s own by the time that merge runs, or a hidden note written
   * while `activeOwnershipRoom` was some other room rides along into
   * `toRoom`'s merged log - see `hiddenLogEntriesByRoom`'s doc comment for
   * the full repro this closes.
   */
  private switchActiveOwnershipRoom(toRoom: string): void {
    if (toRoom === this.activeOwnershipRoom) {
      return;
    }
    this.shelveActiveOwnership(this.activeOwnershipRoom);
    // `activeOwnershipRoom` only ever reads "" before this tab's very first
    // room switch - it is set to a real room code below and, unlike
    // `shareRoomCode`, is never blanked again afterward (see its doc
    // comment), so "" here can only mean this tab has not yet associated
    // `sharedLogEntries` with any room at all. Any hidden entries sitting in
    // it are therefore unscoped, not room B's leftovers - swapping them out
    // for `toRoom`'s (likely nonexistent) shelf would silently discard
    // hidden notes a GM wrote before ever creating or joining a room, which
    // is exactly what a plain, pre-round-8 fresh tab used to carry through
    // to its first join. Only swap the hidden-entry pool once there is an
    // actual previous room to shelve it under.
    if (this.activeOwnershipRoom) {
      this.shelveActiveHiddenLog(this.activeOwnershipRoom);
      this.sharedLogEntries = this.reseedLogOrder(this.loadShelvedHiddenLog(toRoom));
    }
    this.loadShelvedOwnership(toRoom);
    this.activeOwnershipRoom = toRoom;
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
   * **zero** participant IDs survive in common with the fingerprint -
   * `liveEncounterFingerprints` is refreshed on every successful push
   * (`syncSharedState()`, round 5, fixing Symptom C), not frozen "as when the
   * room was joined/created" (D-E, durable-rooms review round 7: this comment
   * and `liveEncounterFingerprints`'s own doc comment used to say the
   * opposite, each citing the other as the reason) - so ordinary play, adding
   * or removing individual participants from the *same* fight over however
   * long a session, always leaves at least one survivor no matter how long
   * ago the room was joined or created. Only a wholesale cast swap with no
   * push in between zeroes it out, and that is deliberately the only thing
   * this catches - the threshold is a judgment call, documented here per the
   * review defect.
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
   * all eight side-maps and rebuilds from the lossy server snapshot (no damage,
   * no health, no OOC participants, no `NpcRowParticipant`/`ICParticipant`, no
   * action history). Close Room's own on-screen advice is
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
   *
   * **Authority model (durable-rooms review round 5, Part 1).** Two outcomes -
   * a stale-cast divergence, or a saved encounter that could not be restored
   * because everyone in it is OOC - are cases where this method must decide
   * "do not push, ever, until the GM explicitly tries again", not just "do not
   * push this once". Both are handled by *never completing the join*: neither
   * branch below assigns `shareRoomCode`, so `syncSharedState()`'s existing
   * `if (!this.shareRoomCode) return;` gate makes every one of this file's ~50
   * other call sites structurally incapable of pushing to that room afterward,
   * with no separate flag to keep in sync and no banner to trust (round-3/4's
   * "nothing was sent to the room" text used to become false the moment any
   * later action ran `syncSharedState()`, because `shareRoomCode` had already
   * been set before either check ran - review defect Symptom B). The tab is
   * fully disconnected (`sessionSync.disconnect()`) rather than left half-joined,
   * so there is no ambiguity about whether it is "in" that room.
   */
  async btnJoinShareSession_Click() {
    this.shareError = "";
    this.shareInfo = "";
    const room = this.shareJoinCode.trim().toUpperCase();
    if (!room) {
      this.shareError = "Enter a room code to join.";
      return;
    }
    // The room this tab is currently connected to and broadcasting for, if
    // any - captured before anything below can change it, so every
    // abandonment path in this method can name it and, where possible,
    // restore it (review defect D1, durable-rooms review round 6).
    const previousRoom = this.shareRoomCode;
    let pushLocalState = this.holdsLiveEncounterFor(room);
    if (pushLocalState && this.liveEncounterDivergedFrom(room)) {
      // Checked BEFORE any server-side room switch (review defect D1): the
      // old code called `sessionSync.joinAsGm(room)` first - which detaches
      // this socket from `previousRoom` server-side and broadcasts
      // `session:gm-presence {connected: false}` to it - and only discovered
      // the divergence afterward, by which point `previousRoom` had already
      // been silently abandoned with zero confirmation and zero recovery
      // (live-reproduced: run room B for an hour with a different cast, then
      // type room A's old code back in; the tab ended up connected to
      // neither, with `shareRoomCode` cleared and every later broadcast
      // silently discarded). Deciding here means a refused join never touches
      // this tab's connection at all.
      if (!await this.confirmDivergedJoin(room, previousRoom)) {
        return; // nothing touched - whatever this tab was connected to still is
      }
      // GM chose to proceed anyway: drop the stale association and fall
      // through to the ordinary destructive-pull confirmation/flow below,
      // which has its own, more detailed warning about what pulling
      // discards.
      this.liveEncounterRooms.delete(room);
      this.liveEncounterFingerprints.delete(room);
      pushLocalState = false;
    }
    // D-B, durable-rooms review round 7: the abandonment warning below used to
    // fire only on the pull path (`!pushLocalState`) - `confirmDestructiveJoin`
    // was never even called when this tab already held the target room's live
    // encounter, so rejoining a room the tab holds while a *different* room
    // (`previousRoom`) is the one actually connected abandoned that room with
    // zero confirmation: the server detaches the socket from it and broadcasts
    // `session:gm-presence {connected: false}` the instant `joinAsGm` below
    // succeeds. Nothing local is at risk on a push - the encounter itself is
    // never confirmed - but abandoning a *different* room's players is a real
    // consequence regardless of which path gets there, so every join path that
    // can abandon a room now confirms it.
    if (pushLocalState && previousRoom && previousRoom !== room
      && !await this.confirmAbandonPreviousRoom(room, previousRoom)) {
      return;
    }
    if (!pushLocalState && !await this.confirmDestructiveJoin(room, previousRoom)) {
      return;
    }
    try {
      this.sessionSync.connect();
      const { state, log, gmState } = await this.sessionSync.joinAsGm(room);
      if (pushLocalState) {
        if (this.liveEncounterDivergedFrom(room)) {
          // Defensive backstop only (durable-rooms review round 6): the
          // pre-check above already refuses a diverged join before this
          // point is ever reached in practice. If it is somehow still
          // reached, do not repeat the old bug of leaving the tab fully
          // disconnected with `previousRoom` abandoned and no recovery -
          // reclaim it the same way the OOC-only branch below does. Ownership
          // is untouched here on purpose: `switchActiveOwnershipRoom` has not
          // been called yet, so the active maps still describe whichever room
          // this tab was actually running, exactly what `restorePreviousRoomConnection`
          // (inside `abandonJoinAndRestore`) needs them to (D-A, durable-rooms
          // review round 7).
          await this.abandonJoinAndRestore(room, previousRoom,
            `Room ${room}'s saved encounter no longer matches what this tab is showing`);
          this.liveEncounterRooms.delete(room);
          this.liveEncounterFingerprints.delete(room);
          this.ownershipByRoom.delete(room);
          this.hiddenLogEntriesByRoom.delete(room);
          return;
        }
        // Ownership becomes this room's before anything is reconciled or
        // pushed (D-A, durable-rooms review round 7): shelve whatever was
        // active (`previousRoom`, if this tab was running a different one)
        // and load `room`'s own shelf, so the reconcile below corrects the
        // *right* room's cache and the push after it can never carry a
        // different room's owners. See `switchActiveOwnershipRoom`'s doc
        // comment for the full model this closes.
        this.switchActiveOwnershipRoom(room);
        // Ownership is not really this tab's authoritative state at all - it
        // is decided collaboratively by players claiming/releasing through
        // the server, and the server can strip a claim (a disconnect, a
        // Close/End evacuation) without this tab ever hearing about it if it
        // was not connected at that moment. Reconcile the local cache from
        // the server's returned copy for `room` now that the active maps
        // describe `room`, so a stale local owner can never be re-asserted by
        // the push below (durable-rooms review round 5, Symptom A) - see
        // `reconcileOwnershipFromServer()`.
        this.reconcileOwnershipFromServer(state);
        // Still the live encounter for every code it was already live for,
        // plus this one (round-3 fix 6).
        this.shareRoomCode = room;
        this.shareConnectionLost = false;
        this.restoreWarning = "";
        this.sharedLogEntries = this.mergeHiddenLogEntries(log || []);
        this.clearSharedLogDecodeAnimations();
        this.pendingLogScroll = true;
        this.attachShareListeners();
        this.markRoomLive(room);
        this.syncSharedState();
        this.shareInfo = previousRoom && previousRoom !== room
          ? `Rejoined session ${room} with this tab's live encounter - nothing was replaced, and players `
            + `are back in sync. This tab has stopped broadcasting to room ${previousRoom}; rejoin that `
            + "code to resume it."
          : `Rejoined session ${room} with this tab's live encounter - `
            + "nothing was replaced, and players are back in sync.";
        return;
      }
      if (this.snapshotHasEncounter(state, gmState)) {
        // A new-format room's GM-only channel can carry a real encounter (the
        // withheld/out-of-action roster) even when `state.participants` is
        // empty - e.g. every combatant down - so "did this pull actually
        // replace anything" has to ask both lists, not just the player-facing
        // one (brief "GM reconnect state loss" AC 5: the abandon branch below
        // stays reachable only for a legacy snapshot with nothing on either
        // channel).
        const replaced = (!!state && Array.isArray(state.participants) && state.participants.length > 0)
          || (!!gmState && Array.isArray(gmState.withheldParticipants) && gmState.withheldParticipants.length > 0);
        if (!replaced) {
          // Everyone in the saved encounter is out of action, so there was
          // nothing on the wire to rebuild - and nothing was replaced here
          // either. Critically, this branch does **not** join: joining would
          // leave the tab able to push this unrelated encounter over a real
          // saved fight on the very next click (round-3 fix 5's original bug,
          // reopened by round-3/4's "warn once, then leave the tab connected
          // anyway" shape - durable-rooms review round 5, Symptom B, "the
          // round-3 OOC-only branch has the same shape" - and, per review
          // round 6, reachable from a room this tab was actively running,
          // which must not be silently abandoned by discovering that). Only
          // reachable for a room saved before this change (spec D7): a
          // new-format room's all-down encounter now restores in full above.
          const ooc = this.snapshotOocCount(state);
          await this.abandonJoinAndRestore(room, previousRoom,
            `Room ${room}'s saved encounter is ${ooc} participant${ooc === 1 ? "" : "s"} out of action, `
            + "which are not broadcast and cannot be restored");
          return;
        }
        this.shareRoomCode = room;
        this.shareConnectionLost = false;
        this.restoreWarning = "";
        // This branch rebuilds ownership straight from the server's copy
        // (`restoreFromSharedState`, below) rather than through
        // `switchActiveOwnershipRoom`, so it has to load `room`'s own shelved
        // hidden entries the same way here explicitly - otherwise whatever
        // room was active before this pull is still what `sharedLogEntries`
        // describes, and `mergeHiddenLogEntries` would fold *that* room's
        // hidden notes into `room`'s merged log (durable-rooms review round
        // 8, item 3). Same "" guard as `switchActiveOwnershipRoom`: skip the
        // swap while no room has ever been tracked yet, so a hidden entry
        // written before this tab's very first join still merges into it
        // rather than being silently discarded in favor of `room`'s
        // (nonexistent) shelf.
        if (this.activeOwnershipRoom) {
          this.sharedLogEntries = this.reseedLogOrder(this.loadShelvedHiddenLog(room));
        }
        this.sharedLogEntries = this.mergeHiddenLogEntries(log || []);
        this.clearSharedLogDecodeAnimations();
        this.pendingLogScroll = true;
        this.attachShareListeners();
        this.restoreFromSharedState(state, gmState);
        // A pull *replaces* this tab's encounter, so every earlier association
        // is now stale and the set is reset to this room alone, fingerprinted
        // against what was just restored (round-4 fix D6) - not against what
        // this tab had before the pull, which is exactly what was just
        // discarded.
        this.liveEncounterRoomCode = room;
        this.shareInfo = `Joined session ${room}.`;
        return;
      }
      // `restoreFromSharedState()` no-ops on an empty snapshot, so nothing was
      // discarded however the confirmation read (review defect D4). Say so,
      // and push what this tab has: the join already made this tab the live
      // encounter for that code, and without a push the room would keep
      // showing players its empty snapshot until the GM's next click.
      //
      // This room is new to this tab's ownership too - exactly the "new room
      // has no ownership yet" case `switchActiveOwnershipRoom` handles for
      // Create Player Session, reused here for the same reason (D-A,
      // durable-rooms review round 7): whatever was active for `previousRoom`
      // is shelved, not destroyed, so rejoining `previousRoom` later still
      // recovers it.
      this.switchActiveOwnershipRoom(room);
      this.shareRoomCode = room;
      this.shareConnectionLost = false;
      this.restoreWarning = "";
      this.sharedLogEntries = this.mergeHiddenLogEntries(log || []);
      this.clearSharedLogDecodeAnimations();
      this.pendingLogScroll = true;
      this.attachShareListeners();
      this.markRoomLive(room);
      this.syncSharedState();
      this.shareInfo = `Joined session ${room} - it had no saved encounter, so this tab's `
        + "encounter was kept and sent to the room instead.";
    } catch (err) {
      this.shareError = err instanceof Error ? err.message : "Unable to join share session.";
    }
  }

  /**
   * Bring this tab's local ownership cache (`participantOwners`) into
   * agreement with the server's last-known copy whenever this tab
   * (re)establishes its session for a room - durable-rooms review round 5,
   * Part 1, Symptom A.
   *
   * Ownership is not GM-tab-authoritative state: it is decided collaboratively
   * by players claiming/releasing through the server, and the server can
   * *release* a claim on its own (a disconnect, a Close/End evacuation)
   * without this tab's knowledge whenever it was not connected to hear the
   * broadcast that announced it - which is exactly what happened in the
   * ordering bug `evacuateRoom()` had in `server.js` (the release broadcast was
   * emitted after every socket, including the GM's own, had already left the
   * Socket.IO room). Reconciling here makes the stale-owner symptom
   * structurally impossible rather than fixed only for that one ordering bug:
   * even if a *different* future bug drops a correction on the floor, the next
   * successful (re)join heals it, because ownership is always re-derived from
   * the server at that point rather than trusted to still be right.
   *
   * Deliberately one-directional: this only ever **clears** a local owner the
   * server no longer has (the server is the only side that can legitimately
   * strip an ownership), never fabricates one the server has that the local
   * cache does not. `claim_character` is relayed live through
   * `session:command` and updates the cache the moment it happens, so a claim
   * the server has that the cache lacks can only mean this tab is about to
   * push a `claimable` flag the server has not seen yet (set while offline),
   * in which case the local cache - not the stale wire copy - is correct.
   * `participantClaimable` itself is never touched here for the same reason:
   * the server never mutates it independently.
   *
   * **Covers OOC participants too** (review defect D2, durable-rooms review
   * round 6). `state.participants` used to never include anyone currently OOC
   * at all, so this method used to `continue` past every out-of-action
   * participant with "not on the wire - nothing to reconcile against" -
   * which is exactly backwards for ownership: a claimed character going OOC
   * is the common case a release needs to survive (a downed PC, closed and
   * rejoined days later, then revived). A **claimable** OOC participant is
   * now in `state.participants` directly (GM decision, durable-rooms
   * follow-up), so `byId` already covers that case; `oocById` -
   * `state.oocOwnership`, the minimal ownership-only shadow - remains the
   * fallback for the narrower case that overlap does not close (an
   * out-of-action participant owned but not currently claimable - see
   * `isClaimableOrOwnedOoc`'s doc comment) and for older/malformed wire data.
   * See its doc comment in `session-sync.service.ts`.
   */
  private reconcileOwnershipFromServer(state: SharedCombatState | null): void {
    if (!state || !Array.isArray(state.participants)) {
      return;
    }
    const byId = new Map<string, SharedParticipantState>(state.participants.map(sp => [ sp.id, sp ]));
    const oocById = new Map<string, { ownerName?: string }>(
      (Array.isArray(state.oocOwnership) ? state.oocOwnership : []).map(o => [ o.id, o ])
    );
    for (const p of this.combatManager.participants.items) {
      const sp = byId.get(this.getParticipantId(p)) || oocById.get(this.getParticipantId(p));
      if (!sp) {
        continue; // genuinely new locally, or OOC and never claimed/claimable - nothing to reconcile against
      }
      const localOwner = this.participantOwners.get(p);
      if (localOwner && !sp.ownerName) {
        this.participantOwners.delete(p);
      }
    }
  }

  /**
   * Ask before a push-path Join abandons a *different* room this tab is
   * currently connected to and broadcasting for (D-B, durable-rooms review
   * round 7 - fixes the gap review defect D1 (round 6) closed only for the
   * pull path).
   *
   * Nothing local is at risk on a push - the encounter itself is never
   * confirmed, `confirmDestructiveJoin` below owns that warning - but
   * abandonment is a real consequence regardless of which path gets there:
   * the server detaches this socket from `previousRoom` the instant
   * `sessionSync.joinAsGm(room)` succeeds and broadcasts `session:gm-presence
   * {connected: false}` to it. D1's original repro was reproducible again
   * here with a one-word change to the steps ("holds the live encounter for"
   * instead of "does not hold it for"): `holdsLiveEncounterFor(room)` reading
   * true made `btnJoinShareSession_Click` skip `confirmDestructiveJoin`
   * entirely, so a GM running room B who rejoined room A by typing its old
   * code back in (A still `holdsLiveEncounterFor`, per round-3 fix 6's
   * additive membership) abandoned B with zero confirmation and zero warning.
   *
   * Returns true when the join may proceed. Only called when
   * `previousRoom && previousRoom !== room` - a push into the room already
   * running, or from a tab connected to nothing, abandons nothing and is
   * never prompted.
   */
  private async confirmAbandonPreviousRoom(room: string, previousRoom: string): Promise<boolean> {
    const confirmed = await this.confirmationDialog.confirm(
      `This tab is currently running room ${previousRoom}: joining ${room} disconnects this tab from it `
      + `immediately, and anyone still in ${previousRoom} sees no GM connected. Room ${previousRoom} itself `
      + "is kept regardless of what happens here, and rejoining that code brings it back - nothing on this "
      + `screen is at risk from this join, since this tab already holds room ${room}'s own live encounter.`,
      `Leave room ${previousRoom} and join ${room}?`,
      "Leave and Join",
      "Cancel"
    );
    if (!confirmed) {
      this.shareInfo = `Kept room ${previousRoom} running; did not join ${room}.`;
      return false;
    }
    return true;
  }

  /**
   * Ask before a Join replaces what is on this screen (spec AC 15), and before
   * it abandons a *different* room this tab is currently connected to and
   * broadcasting for (review defect D1, durable-rooms review round 6).
   *
   * A pull runs `restoreFromSharedState()`, which clears both participant lists
   * and all eight side-maps and rebuilds from the lossy server snapshot - so
   * damage, condition monitors, out-of-action participants and committed
   * interrupt actions all go, irreversibly, on one tap of a button sitting next
   * to a text box. Naming the count is the difference between "are you sure"
   * and an informed answer.
   *
   * `previousRoom` is `shareRoomCode` as it stood before this join attempt -
   * the room whose players stop receiving updates the instant
   * `sessionSync.joinAsGm(room)` succeeds, because the server detaches this
   * socket from it (`detachSocketFromPreviousRoom`, `server.js`). D1's repro
   * had no warning at all naming that room: this dialog is the one place every
   * `!pushLocalState` join path in `btnJoinShareSession_Click` runs through, so
   * it is also the one place that abandonment can be named unconditionally,
   * even when nothing local is at risk. **The push path has its own,
   * lighter-weight version of the same warning** (D-B, round 7):
   * `confirmAbandonPreviousRoom`, above.
   *
   * Returns true when the join may proceed. An empty tab with no other room to
   * abandon is never prompted: there is nothing to lose, and a prompt on every
   * fresh join would train the GM to dismiss it.
   */
  private async confirmDestructiveJoin(room: string, previousRoom: string): Promise<boolean> {
    // Round-4 fix D5: a literal `.length === 0` check could only ever fire in
    // a test whose fixture had been emptied after the constructor ran - the
    // constructor's own `addParticipant()` (see below) means a real app
    // instance never has zero participants, so a genuinely fresh tab always
    // showed this "will be discarded" warning for one blank row nobody
    // touched. `isUnusedPlaceholder` treats that row the same as empty.
    const atRisk = this.combatManager.participants.items.filter(p => !this.isUnusedPlaceholder(p));
    const count = atRisk.length;
    const abandonsPrevious = !!previousRoom && previousRoom !== room;
    if (count === 0 && !abandonsPrevious) {
      return true;
    }
    const parts: string[] = [];
    if (abandonsPrevious) {
      parts.push(`This tab is currently running room ${previousRoom}: joining ${room} disconnects this tab `
        + `from it immediately, and anyone still in ${previousRoom} sees no GM connected. Room ${previousRoom} `
        + `itself is kept regardless of what happens here, and rejoining that code brings it back.`);
    }
    if (count > 0) {
      // Whether the pull actually replaces anything depends on the target
      // room's snapshot, which this tab cannot see until after `joinAsGm` -
      // and joining first to find out would abandon the current room
      // server-side before the GM had agreed to anything. So the dialog is
      // honest about the condition instead of promising a discard that
      // `restoreFromSharedState`'s empty-snapshot no-op may never perform
      // (review defect D4).
      //
      // Wording deliberately stronger, not weaker, than it used to be (brief
      // "GM reconnect state loss"): this tab's on-screen damage and condition
      // monitors are now genuinely, permanently discarded by this action -
      // before this change they were already unrecoverable either way, so
      // there was nothing to strengthen the warning against; now that a
      // rejoin can actually bring a room's own damage back, discarding this
      // tab's own is the one way real data is lost here.
      parts.push(`Joining room ${room} replaces this tab's encounter with that room's last saved broadcast. `
        + `If that room has a saved encounter, ${count} participant${count === 1 ? "" : "s"} on screen `
        + `${count === 1 ? "is" : "are"} discarded for good - their damage, condition monitors, anyone `
        + "out of action, committed interrupt actions and spent Edge all go with them. "
        + "This cannot be undone. "
        + `If room ${room} turns out to have no saved encounter, nothing is replaced and this tab keeps `
        + "what it has.");
    }
    const confirmed = await this.confirmationDialog.confirm(
      parts.join(" "),
      `Join room ${room}?`,
      "Discard and Join",
      "Cancel"
    );
    if (!confirmed) {
      this.shareInfo = `Kept this tab's encounter; did not join ${room}.`
        + (abandonsPrevious ? ` Room ${previousRoom} is untouched and this tab is still connected to it.` : "");
      return false;
    }
    return true;
  }

  /**
   * The join box names a room this tab still thinks it holds the live
   * encounter for (`liveEncounterRooms` has it), but the on-screen cast has
   * since diverged from what was fingerprinted when that association was made
   * (`liveEncounterDivergedFrom`) - review defect D1 (durable-rooms review
   * round 6).
   *
   * Left unchecked, `holdsLiveEncounterFor(room)` reading true meant this path
   * used to skip confirmation altogether - a diverged join went straight to
   * `sessionSync.joinAsGm(room)` with zero friction, which is exactly the
   * "typed the old room code back in by mistake" blunder the review
   * reproduced: the server had already detached this socket from whatever
   * room it was running (and broadcast `session:gm-presence {connected:
   * false}` to it) before the code even noticed the divergence.
   *
   * Called BEFORE any server-side room switch. Nothing about this tab's
   * connection changes while the dialog is open or if it is cancelled -
   * whatever room this tab was running keeps running, completely untouched,
   * because `sessionSync.joinAsGm` is never called on that path.
   *
   * @returns true to mean "drop the stale association and continue as an
   *   ordinary destructive pull" - the caller then runs
   *   `confirmDestructiveJoin`, which has its own, more detailed warning
   *   about what pulling discards. false to mean "leave everything exactly
   *   as it is".
   */
  private async confirmDivergedJoin(room: string, previousRoom: string): Promise<boolean> {
    const stillRunning = previousRoom && previousRoom !== room
      ? ` This tab is still connected to and broadcasting room ${previousRoom} - that connection is `
        + "untouched no matter what you choose here."
      : "";
    const confirmed = await this.confirmationDialog.confirm(
      `Room ${room} used to be this tab's own live encounter, but what is on screen no longer matches it - `
      + `this tab has moved on to a different cast since. Pushing now would silently overwrite room ${room}'s `
      + `real saved state with an unrelated encounter, so nothing has been sent.${stillRunning} To bring in `
      + `room ${room}'s actual saved encounter instead, continue - you will be asked to confirm discarding `
      + "what is on this screen first, the same as joining any other room.",
      `Room ${room} has diverged from this tab`,
      `Continue to Join Room ${room}`,
      "Stay As-Is"
    );
    if (!confirmed) {
      this.shareError = `Did not join ${room}: its last-known saved state no longer matches what this tab is `
        + `showing.${stillRunning}`;
      return false;
    }
    return true;
  }

  /**
   * Reconnect this tab to `previousRoom` after a join to a different room had
   * to be abandoned before it could complete (review defect D1, durable-rooms
   * review round 6).
   *
   * `sessionSync.joinAsGm(room)` has, by the time any caller of this method
   * runs, already succeeded server-side - which means the server has already
   * detached this socket from `previousRoom` (`detachSocketFromPreviousRoom`)
   * and broadcast `session:gm-presence {connected: false}` to it. Discovering
   * *afterward* that there was nothing useful to pull (the OOC-only branch in
   * `btnJoinShareSession_Click`) used to leave the tab fully disconnected with
   * no attempt to reclaim what it had been running - exactly the "abandoned
   * with zero recovery" defect this method exists to close. Reclaiming here is
   * byte-for-byte the same push a manual rejoin of that code performs:
   * re-authenticate, reconcile ownership from the server's copy, resume
   * broadcasting.
   *
   * Only ever called with a `previousRoom` this tab still
   * `holdsLiveEncounterFor` - the on-screen encounter is untouched by every
   * caller of this method, so if that was true before the abandoned join it is
   * still true now.
   *
   * @returns `{ ok: true }` if the reconnect succeeded; `{ ok: false, reason }`
   *   otherwise, `reason` being why (minor fix, durable-rooms review round 7 -
   *   the previous bare `catch { return false }` discarded it, so the caller's
   *   banner could say only that the reconnect failed, never why).
   */
  private async restorePreviousRoomConnection(previousRoom: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    try {
      const { state } = await this.sessionSync.joinAsGm(previousRoom);
      // D-A, durable-rooms review round 7: ownership for `previousRoom` was
      // never switched away (this method's own doc comment - the on-screen
      // encounter, and therefore the active ownership maps, are untouched by
      // every caller), so reconciling in place is correct with no
      // `switchActiveOwnershipRoom` call needed here.
      this.reconcileOwnershipFromServer(state);
      this.shareRoomCode = previousRoom;
      // Minor fix (durable-rooms review round 7): without this, the join box
      // still shows the room code that was just declined/abandoned, so a
      // reflexive second tap of Join Session re-runs the very path that
      // failed instead of a harmless no-op rejoin of the room this tab is
      // actually now back in.
      this.shareJoinCode = previousRoom;
      this.shareConnectionLost = false;
      this.attachShareListeners();
      this.markRoomLive(previousRoom);
      this.syncSharedState();
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : "Unable to reconnect." };
    }
  }

  /**
   * Common failure path for a join that reached the server - so this tab's
   * connection has already switched away from `previousRoom` - but turned out
   * to have nothing worth pulling: an OOC-only saved encounter, or (as a
   * defensive backstop) a divergence that slipped past `confirmDivergedJoin`'s
   * pre-check. Review defect D1, durable-rooms review round 6.
   *
   * Never leaves the tab silently disconnected. If this tab still holds the
   * live encounter for `previousRoom`, it is reclaimed exactly as a manual
   * rejoin of that code would (`restorePreviousRoomConnection`); the outcome
   * decides whether the banner reports a clean, automatic recovery or an
   * unmistakable, error-level warning naming both rooms with a safe, correct
   * recovery action - never the destructive "rejoin to pull" advice the
   * review found this path giving before.
   *
   * When there is no `previousRoom` to abandon (a fresh tab, or rejoining the
   * very room just declined), nothing was lost by this attempt beyond a wasted
   * click, so the notice stays informational rather than an error.
   */
  private async abandonJoinAndRestore(room: string, previousRoom: string, why: string): Promise<void> {
    const abandoning = !!previousRoom && previousRoom !== room;
    // Try to reclaim `previousRoom` on the *existing* transport before ever
    // tearing anything down - `restorePreviousRoomConnection` just
    // re-authenticates the same live socket to a different room, the same
    // way a manual rejoin of that code would. Calling `sessionSync.disconnect()`
    // unconditionally first (an earlier version of this fix did) worked, but
    // only by closing a socket that was still perfectly good and opening a
    // brand new one to replace it - observably different from "nothing about
    // this tab's connection changes", and a strictly worse bet if the network
    // is flaky right now.
    if (abandoning && this.holdsLiveEncounterFor(previousRoom)) {
      const restored = await this.restorePreviousRoomConnection(previousRoom);
      if (restored.ok) {
        this.shareError = `${why} - nothing here was replaced and nothing was sent to room ${room}. This tab `
          + `has been reconnected to room ${previousRoom}, which is running again and back in sync with `
          + "players.";
        return;
      }
      // The reconnect attempt itself failed (a genuine network problem) -
      // now this tab really is disconnected from everything, and must say so.
      this.sessionSync.disconnect();
      this.shareRoomCode = "";
      this.shareConnectionLost = true;
      this.shareError = `${why} - nothing here was replaced and nothing was sent to room ${room}. This tab `
        + `could NOT automatically reconnect to room ${previousRoom} (${restored.reason}), which it was `
        + `running before this join attempt - players there are NOT receiving updates. Re-enter `
        + `${previousRoom} in the join box and press Join Session to resume it.`;
      return;
    }
    // Nothing (usable) to reclaim: either this tab was not running a
    // different room at all, or it was but no longer holds that room's live
    // encounter (e.g. a pull replaced it in between). Either way there is
    // nothing left to restore, so tear the transport down cleanly.
    this.sessionSync.disconnect();
    this.shareRoomCode = "";
    if (!abandoning) {
      this.shareInfo = `${why} - nothing here was replaced, nothing was sent to the room, and this tab is `
        + `not connected to room ${room}. Rejoin ${room} to try again.`;
      return;
    }
    this.shareError = `${why} - nothing here was replaced and nothing was sent to room ${room}. This tab is `
      + `no longer connected to room ${previousRoom} either. Re-enter ${previousRoom} in the join box and `
      + "press Join Session if it still holds an encounter worth resuming.";
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
    // Compared against a freshly-constructed reference rather than a
    // hand-picked field list (P2-2, durable-rooms review round 5): the old
    // list checked only name/physicalDamage/stunDamage/dices/diceIni/ooc/edge/
    // hasPainEditor/actionHistory, and missed `baseIni`, the condition-monitor
    // sizing fields, `painTolerance` and `status`/`waiting` - so a troll whose
    // Reaction/Intuition and a 12-box Condition Monitor were set before its
    // name was typed compared as "still a placeholder" and was silently
    // discarded on a destructive Join with no prompt (live-reproduced).
    //
    // **Actually iterates `PARTICIPANT_BASE_BACKING_FIELDS`** (review defect
    // D4, durable-rooms review round 6) rather than repeating P2-2's mistake
    // one level up: the P2-2 fix already claimed "a new field added later is
    // covered automatically", but the code beneath that comment was still a
    // hand-picked list of fifteen named comparisons - true of every field that
    // existed at the time it was written, false of the very next field added
    // to `Participant` that this function's author does not also remember to
    // add here. `PARTICIPANT_BASE_BACKING_FIELDS` (`Participant.ts`) is the
    // single list `MatrixParticipant.clone()`/`AstralParticipant.clone()`/the
    // promote-demote helpers already trust for exactly this "stay in sync
    // with the class" property, so reusing it here makes the claim true
    // rather than merely stating it.
    const ref = new Participant();
    const pFields = p as unknown as Record<string, unknown>;
    const refFields = ref as unknown as Record<string, unknown>;
    for (const f of PARTICIPANT_BASE_BACKING_FIELDS) {
      if (f === PLACEHOLDER_SORT_ORDER_FIELD) {
        // Deliberately excluded: `CombatManager.addParticipant()` stamps
        // `_sortOrder` from an incrementing counter purely by row position, so
        // even an untouched *second* blank row never matches a fresh
        // reference's `sortOrder` of 0 - including it would make every blank
        // row after the first warn, which is exactly the false alarm round-4
        // fix D5 exists to prevent.
        continue;
      }
      if (pFields[f] !== refFields[f]) {
        return false;
      }
    }
    // `_actionHistory` is deliberately absent from `PARTICIPANT_BASE_BACKING_FIELDS`
    // - `clone()` always resets it to `[]` rather than copying, since a clone
    // is a fresh participant, not a continuation of committed interrupt costs
    // - so the loop above cannot cover it. A placeholder cares about it
    // directly: any committed interrupt action disqualifies the row.
    if (p.actionHistory.length !== ref.actionHistory.length) {
      return false;
    }
    // Side-maps a GM can set before ever typing a name: a typed Edge/
    // Reaction/Intuition rating or a pending VR mode is real setup, not
    // placeholder noise - compared against `addParticipant()`'s own seed
    // values, not against "unset" (every row, touched or not, has these three
    // maps populated at creation).
    if ((this.participantEdgeRatings.get(p) ?? PLACEHOLDER_EDGE_RATING_DEFAULT) !== PLACEHOLDER_EDGE_RATING_DEFAULT) {
      return false;
    }
    if ((this.participantReactions.get(p) ?? PLACEHOLDER_REACTION_DEFAULT) !== PLACEHOLDER_REACTION_DEFAULT) {
      return false;
    }
    if ((this.participantIntuitions.get(p) ?? PLACEHOLDER_INTUITION_DEFAULT) !== PLACEHOLDER_INTUITION_DEFAULT) {
      return false;
    }
    if (this.pendingVrModes.has(p)) {
      return false; // never set on a plain, untouched Participant
    }
    return true;
  }

  /**
   * Does this room hold real content that a Join must not silently overwrite?
   *
   * Deliberately **not** the same question as "will `restoreFromSharedState()`
   * rebuild anything" (review defect D4 read them as one; round-3 fix 5 splits
   * them). A room whose every participant is out of action **and non-claimable**
   * broadcasts `participants: []`, because `getSharedParticipants()` withholds
   * exactly that subset (a claimable OOC participant is on the wire regardless -
   * GM decision, durable-rooms follow-up) - so a real, saved, fully-incapacitated
   * NPC-only encounter looked content-free, and the Join's empty-snapshot branch
   * pushed this tab's encounter straight over it. `oocParticipantCount` is on
   * the wire precisely so that room still counts as occupied here.
   *
   * This is the persistence/overwrite guard only. The combat log and the rest of
   * the UI still exclude OOC participants from "active participants" on purpose,
   * and none of that changes.
   */
  private snapshotHasEncounter(state: SharedCombatState | null, gmState: SharedGmState | null = null): boolean {
    if (!state) {
      return false;
    }
    const listed = Array.isArray(state.participants) ? state.participants.length : 0;
    const withheld = Array.isArray(gmState?.withheldParticipants) ? gmState!.withheldParticipants.length : 0;
    return listed > 0 || withheld > 0 || this.snapshotOocCount(state) > 0;
  }

  /**
   * Participants held by a room but withheld from its broadcast as
   * (non-claimable) OOC - see `SharedCombatState.oocParticipantCount`'s doc
   * comment for why a claimable one is not counted here.
   */
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
      // Its shelved ownership goes with it (D-A, durable-rooms review round
      // 7): the room is permanently destroyed, so nothing will ever
      // `switchActiveOwnershipRoom(room)` again to read this shelf entry back.
      // Deliberately not touched on an ordinary Close (`discardHiddenEntries`
      // false): the room is kept and still rejoinable, and if this room's
      // ownership happens to be the *active* maps right now (nothing switched
      // it away), it is still correct in memory and needs no shelving at all -
      // see `activeOwnershipRoom`'s doc comment for why that can be true even
      // though `shareRoomCode` is about to be blanked below.
      this.ownershipByRoom.delete(room);
      // Same reasoning, same event, for the hidden-log shelf (durable-rooms
      // review round 8, item 3): the room is permanently destroyed, so
      // nothing will ever `switchActiveOwnershipRoom(room)` again to read a
      // shelved-hidden-entries entry back either.
      this.hiddenLogEntriesByRoom.delete(room);
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
   *
   * **Also repairs `room-mismatch`** (D-C, durable-rooms review round 7).
   * `authorizeRoomPacket` (`server/room-guards.js`) returns this reason when the
   * caller's role is fine but `socket.data.room` disagrees with the room named
   * in the packet - which happens when a `gm:join-session`/`gm:create-session`
   * ack is lost or times out (`emitWithAck`'s `requestTimeoutMs`) after the
   * server has already processed it: the server detached this socket from its
   * old room and joined it to the new one, but the promise rejected before
   * `SessionSyncService.currentRoom` (or this component's `shareRoomCode`) ever
   * learned that, so the GM tab keeps broadcasting under a room the socket is
   * no longer authorized for. Left unhandled this reads no differently from
   * `role-required` on the wire except for the reason text - the GM keeps
   * running combat while every broadcast is silently refused, exactly the
   * frozen-players failure mode `session:error` exists to prevent (AC 10). The
   * repair is the same either way: re-authenticate to what this tab believes
   * `shareRoomCode` is - `handleSessionReconnected()` calls `joinAsGm(room)`
   * again, which corrects both `socket.data.room` server-side and
   * `SessionSyncService.currentRoom` client-side to agree once more, then
   * pushes this tab's state so players catch back up.
   */
  private handleSessionError(payload: { event: string; reason: string }) {
    if (!payload) {
      return;
    }
    // Mirror `onDisconnect`'s guard: a refusal for a room this tab has
    // already left (`shareRoomCode` blanked by a Close/End notice from
    // another tab, or this tab mid-close itself) has nothing to reconnect
    // to. Without this guard a stale in-flight push's `role-required`
    // refusal - arriving just after `handleSessionClosedExternally` blanks
    // `shareRoomCode` - would show a permanent "Re-authenticating..." banner
    // and call `handleSessionReconnected()`, which itself no-ops on an empty
    // `shareRoomCode`, so nothing would ever clear it (durable-rooms review
    // round 8, item 1).
    if (!this.shareRoomCode || this.isClosingSession) {
      return;
    }
    const isAuth = typeof payload.reason === "string"
      && (payload.reason.startsWith("role-required") || payload.reason === "room-mismatch");
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
      // The returned log is deliberately ignored: this call is an
      // authentication, not a restore. The returned *state* is not ignored -
      // `reconcileOwnershipFromServer()` reads it to correct this tab's
      // ownership cache before the push below re-asserts it (durable-rooms
      // review round 5, Part 1, Symptom A: a claim released while this tab was
      // disconnected must not be pushed back to life by the reconnect).
      const { state } = await this.sessionSync.joinAsGm(room);
      this.reconcileOwnershipFromServer(state);
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
    // Minor fix (durable-rooms review round 7): a notice naming a room this
    // tab is not currently connected to must not blank `shareRoomCode` out
    // from under whatever room this tab actually joined since - the server
    // only ever broadcasts `session:closed` to sockets that were in that room,
    // so a mismatch here can only mean this tab moved on before the event
    // arrived. Older servers omit `room` entirely; treat an absent room the
    // same as a match, matching prior behaviour, rather than refusing to
    // act on a notice with no way to name what it is about.
    if (payload?.room && this.shareRoomCode && payload.room !== this.shareRoomCode) {
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
    // This tab is no longer connected to anything, so no connection can be
    // "lost" - a stale true here (set by a transport blip or a since-guarded
    // `handleSessionError` moments earlier) would otherwise persist as a
    // permanent red banner alongside this green notice, with nothing left to
    // reconnect to (durable-rooms review round 8, item 1).
    this.shareConnectionLost = false;
    this.shareError = "";
    if (!persisted) {
      this.liveEncounterRooms.delete(room);
      this.liveEncounterFingerprints.delete(room);
      // Its shelved ownership goes with it, same reasoning as the destructive
      // branch of `resetShareStateAfterLeaving` (D-A, durable-rooms review
      // round 7): the room is gone, so nothing will ever read this shelf
      // entry back.
      this.ownershipByRoom.delete(room);
      // Same reasoning for the hidden-log shelf (durable-rooms review round
      // 8, item 3).
      this.hiddenLogEntriesByRoom.delete(room);
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
   * Reversible: re-claiming (or the player re-taking it) puts the ownership
   * side-map entry straight back.
   */
  btnReleaseClaim_Click(p: IParticipant) {
    if (!this.isParticipantClaimed(p)) {
      return;
    }
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
      // A re-registration (sheet edit, reconnect) comes through this same path
      // and deliberately re-announces the player - suppressing it would need a
      // "have we seen this token" check duplicating `participantOwners`.
      //
      // Logged before `upsertPlayerParticipant`, using `characterName` rather
      // than the returned participant: a type-mismatch re-registration (deck
      // added/removed) discards and recreates the participant via
      // `combatManager.removeParticipant()`, which can cascade into
      // `endInitiativePass()`/`endCombatTurn()` if the old instance is the
      // current actor, and that boundary line must not land above this one
      // (brief "Combat boundary logging" fix round, Defect 1). `characterName`
      // is what `upsertPlayerParticipant` writes onto `target.name` either way,
      // so the text is identical.
      this.appendPlayerCommandLog(characterName, PLAYER_COMMAND_LOG_TEXT.joined);
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
        // Logged before the demote: `demoteToParticipant` -> `removeParticipant`
        // can cascade into `endInitiativePass()`/`endCombatTurn()` if `target`
        // is the current actor, and that boundary line must not land above
        // this one (brief "Combat boundary logging" fix round, Defect 1). Name
        // captured first regardless, since the demote swaps the participant
        // instance.
        this.appendPlayerCommandLog(targetName, PLAYER_COMMAND_LOG_TEXT.deckRemoved);
        if (target instanceof MatrixParticipant) {
          this.demoteToParticipant(target);
        }
        this.sort();
        return;
      }
      const targetName = target.name || "";
      // Whether this is a first jack-in or a mode switch is decided by the
      // *pre-swap* state: a freshly `promoteToMatrixParticipant`d instance
      // always starts `jackedIn = false`, so this is knowable before the
      // promote runs and does not need to read the post-swap instance.
      const wasJackedIn = target instanceof MatrixParticipant ? target.jackedIn : false;
      const jackIn = payload["jackIn"] === true;
      const jackOut = !jackIn && payload["jackOut"] === true;
      const create = !jackIn && !jackOut && payload["create"] === true;
      let mode = VRMode.AR;
      if (jackIn) {
        const vrModeStr = String(payload["vrMode"] || "AR");
        mode = vrModeStr === "hot-sim" ? VRMode.HotSim
             : vrModeStr === "cold-sim" ? VRMode.ColdSim
             : VRMode.AR;
        const modeLabel = this.vrModeLabel(mode);
        // Jacking in changes Initiative attribute *and* dice count, so it has
        // to leave a trace in the log the players read, not only the GM's -
        // logged before the type swap below for the same reason as the demote
        // branch above (Defect 1: `promoteToMatrixParticipant` ->
        // `removeParticipant` can cascade into `endInitiativePass()`/
        // `endCombatTurn()`).
        this.appendPlayerCommandLog(
          targetName,
          wasJackedIn
            ? PLAYER_COMMAND_LOG_TEXT.switchedVrMode(modeLabel)
            : PLAYER_COMMAND_LOG_TEXT.jackedIn(modeLabel)
        );
      } else if (jackOut) {
        this.appendPlayerCommandLog(targetName, PLAYER_COMMAND_LOG_TEXT.jackedOut);
      } else if (create) {
        this.appendPlayerCommandLog(targetName, PLAYER_COMMAND_LOG_TEXT.deckConfigured);
      }
      if (!(target instanceof MatrixParticipant)) {
        target = this.promoteToMatrixParticipant(target);
      }
      const mp = target as MatrixParticipant;
      // Floor 0, not 1 (RULINGS 2026-08-30): a stored 0 - an absent or
      // explicitly-cleared payload field - means "unset", and must not be
      // coerced up into a plausible-looking rated 1.
      mp.dataProcessing = Math.max(DATA_PROCESSING_UNSET, Number(payload["dataProcessing"] || DATA_PROCESSING_UNSET));
      mp.attack = Math.max(0, Number(payload["attack"] || 0));
      mp.sleaze = Math.max(0, Number(payload["sleaze"] || 0));
      mp.firewall = Math.max(0, Number(payload["firewall"] || 0));
      mp.deviceRating = Math.max(0, Number(payload["deviceRating"] || 0));
      if (jackIn) {
        // Lost dice (e.g. Hot Sim → Cold Sim) are rolled and applied GM-side.
        // Gained dice are not: the player client submits them as a delta
        // roll_submission {isDelta:true}, so rolling here would double-count.
        this.applyVRMode(mp, mode, { rollGainedDice: false });
        mp.jackedIn = true; // force true even for AR (applyVRMode leaves it false)
      } else if (jackOut || create) {
        // Jack Out or initial deck creation: no VR mode, restore physical initiative.
        mp.vrMode = VRMode.None;
        mp.jackedIn = false;
        mp.blocksPhysicalActions = false;
        const reaction = this.participantReactions.get(mp) ?? 0;
        const intuition = this.getParticipantIntuition(mp);
        mp.baseIni = reaction + intuition;
        if (jackOut) {
          // Jack-out dice loss is always handled GM-side: roll the lost dice,
          // subtract the total (brief F5 / criterion 8, p. 160). Restores the
          // decker's own physical dice, not a hard-coded 1D6.
          this.restorePhysicalDiceCount(mp);
        }
        // Initial deck creation deliberately leaves the dice count alone.
        // Creating a deck does not change how fast the character's body is:
        // they are in AR, using their normal Initiative Dice (p. 229), which
        // is whatever the row already holds. Writing 1D6 here truncated an
        // augmented character the moment the GM handed them a cyberdeck.
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
      // Same choke point `rollAndLogInitiative` uses (RULINGS.md
      // 2026-08-30): a player rolling for a claimed GM-added NPC still owes
      // that NPC's own join line, not just the player-connect line.
      this.announceJoinIfPending(target);
      const total = target.getCurrentInitiative();
      const intuition = this.getParticipantIntuition(target);
      let baseLabel: string;
      if (this.isAstral(target) && this.asAstral(target).astralProjecting) {
        baseLabel = `INT×2(${intuition * 2})`;
      } else if (this.isMatrix(target) && this.asMatrix(target).jackedIn && this.asMatrix(target).vrMode !== VRMode.AR && this.asMatrix(target).vrMode !== VRMode.None) {
        baseLabel = `DP(${this.formatDataProcessing(this.asMatrix(target).dataProcessing)}) + INT(${intuition})`;
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
      const declaredAction = String(command.payload?.["declaredAction"] || NO_DECLARED_ACTION_PHRASE);
      const illegalActions = Array.isArray(command.payload?.["illegalActions"])
        ? (command.payload!["illegalActions"] as string[])
        : [];
      const target = this.findPlayerParticipant(playerName, participantId);
      if (!target || (target.status !== StatusEnum.Active && target.status !== StatusEnum.Delaying)) {
        return;
      }
      this.performAct(target, declaredAction, target.name || "Player");
      if (illegalActions.length > 0) {
        this.osReminders.push(`${target.name}: ${illegalActions.join(", ")} — add OS after resolving defense`);
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
      // Logged before `btnDelay_Click`: delaying the sole current actor empties
      // `currentActors` and cascades into `endInitiativePass()`/
      // `endCombatTurn()`, which fire their own shared-log line synchronously.
      // This line describes the cause and must not land below that effect
      // (brief "Combat boundary logging" fix round, Defect 1).
      this.appendSharedLog(target.name || "Player", "Delay");
      this.btnDelay_Click(target);
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

  /**
   * Is this participant claimable, or already owned, right now?
   *
   * The single predicate that decides whether an **out-of-action**
   * participant is worth putting on the wire at all - reused by
   * `getSharedParticipants()` (does the participant itself go in
   * `participants`, so a downed player character stays visible and
   * reclaimable to its owner) and `syncSharedState()`'s `oocOwnership`
   * shadow (does it earn an ownership-only shadow entry). Both call sites
   * asking the same question through the same function is the point - a GM
   * decision (durable-rooms follow-up, "a player must be able to reclaim
   * their character while it is out of action") that a downed NPC must never
   * satisfy, so it stays off the wire exactly as before, while a downed PC
   * must always satisfy it, so it doesn't vanish out from under its owner.
   *
   * Deliberately not narrowed to `claimable === true` alone: an out-of-action
   * participant that is *owned* but for some reason no longer flagged
   * `claimable` (see `participantClaimable`'s doc comment; `btnToggleClaimable_Click`
   * clears the owner in the same tap so this should not arise through the
   * ordinary UI, but the two maps are independent and nothing enforces the
   * pairing) still needs its stale ownership reconciled on a later rejoin,
   * which is what keeps `oocOwnership` from being fully subsumed by the new
   * `participants` entry for the claimable case - see `SharedCombatState
   * .oocOwnership`'s doc comment.
   */
  private isClaimableOrOwnedOoc(p: IParticipant): boolean {
    return this.participantClaimable.get(p) === true || this.participantOwners.has(p);
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
      // that is safe to overwrite (round-3 fix 5). Nothing renders it. Only
      // the still-withheld (non-claimable) OOC participants are counted here -
      // a claimable OOC participant is already in `participants` above (GM
      // decision, durable-rooms follow-up - see `SharedCombatState`'s doc
      // comment on both fields).
      oocParticipantCount: this.combatManager.participants.items
        .filter(p => p.ooc && !this.isClaimableOrOwnedOoc(p)).length,
      // Ownership-only shadow for OOC participants (review defect D2,
      // durable-rooms review round 6) - see `SharedCombatState.oocOwnership`.
      // Only claimed or claimable OOC participants are worth a wire entry;
      // an OOC participant nobody has ever made claimable has no ownership
      // for a later rejoin to reconcile. Same predicate `getSharedParticipants`
      // uses to decide whether a claimable OOC participant also belongs in
      // `participants` itself - reused rather than duplicated so the two
      // lists can never silently diverge on who counts as "claimable enough".
      oocOwnership: this.combatManager.participants.items
        .filter(p => p.ooc && this.isClaimableOrOwnedOoc(p))
        .map(p => ({
          id: this.getParticipantId(p),
          ownerName: this.participantOwners.get(p),
          claimable: this.participantClaimable.get(p) === true
        }))
    };
    this.sessionSync.broadcastState(sharedState);
    // GM-only rehydration channel (brief "GM reconnect state loss"), pushed
    // from this single choke point so every one of this file's ~50 mutation
    // paths is covered by one line rather than a second "remember to also
    // push GM state" obligation. Never broadcast to players - see
    // `SessionSyncService.broadcastGmState` and `server.js`'s
    // `session:update-gm-state` handler.
    this.sessionSync.broadcastGmState(this.buildGmState());
    // Symptom C fix (durable-rooms review round 5, Part 1): refresh this
    // room's fingerprint on every successful push, not only at join/create
    // time. `liveEncounterDivergedFrom()` compares the *current* roster
    // against whatever was last fingerprinted - without this, ordinary
    // incremental play (add one, remove one, many pushes over a long session)
    // could eventually leave zero overlap with a fingerprint frozen at
    // creation time, even though every intervening state was this tab's own
    // legitimate, continuously-pushed history. Refreshing here means
    // "diverged" can only ever mean "this tab stopped being the room's truth
    // in between", never "the encounter legitimately changed while it was".
    // Guarded on membership rather than always inserting: only a room this
    // tab is already recorded as the live truth for (via `markRoomLive()`)
    // gets a fingerprint at all - this must never be the thing that creates
    // that association.
    if (this.liveEncounterRooms.has(this.shareRoomCode)) {
      this.liveEncounterFingerprints.set(this.shareRoomCode, this.currentParticipantIdSet());
    }
  }

  /**
   * One entry per participant to put on the wire.
   *
   * Out-of-action participants are withheld by default (spec Open Decision 4
   * - restoring their health/damage is a known, accepted gap either way) -
   * **except** a claimable one, which is deliberately still broadcast so its
   * owner can see and reclaim it while it is down (GM decision, durable-rooms
   * follow-up: "a player must be able to reclaim their character while it is
   * out of action"). A downed NPC never satisfies `isClaimableOrOwnedOoc()`
   * and so never appears here - the privacy property `getSharedParticipants`
   * already had (a player learns nothing about a downed NPC) is unchanged for
   * that case; only the claimable exception is new. See `ooc` on
   * `SharedParticipantState` for why every consumer of `canAct`/`canDelay`/
   * `canInterrupt` must still treat a claimable-but-`ooc` entry as inert.
   */
  private getSharedParticipants(): SharedParticipantState[] {
    return this.combatManager.participants.items
      .filter(p => !p.ooc || this.isClaimableOrOwnedOoc(p))
      .map((p, index) => this.buildSharedParticipant(p, index));
  }

  /**
   * One player-facing wire entry for `p`. Factored out of `getSharedParticipants()`
   * so `buildGmState()`'s `withheldParticipants` (brief "GM reconnect state
   * loss") can build the exact same shape for an out-of-action, non-claimable
   * participant without a second, drifting copy of this mapping - "Two lists,
   * one type" in the spec's proposed approach.
   *
   * `order` is whatever index the caller passes: `getSharedParticipants()`
   * passes the post-filter index (unchanged from before this change - the
   * player-facing array is byte-identical), `buildGmState()` passes the
   * participant's index in the *full*, unfiltered roster.
   */
  private buildSharedParticipant(p: IParticipant, index: number): SharedParticipantState {
    const base: SharedParticipantState = {
      id: this.getParticipantId(p),
      name: p.name || `Participant ${index + 1}`,
      order: index + 1,
      active: this.combatManager.currentActors.contains(p),
      initiativeScore: p.getCurrentInitiative(),
      playerControlled: this.participantOwners.has(p),
      claimable: this.participantClaimable.get(p) === true,
      ownerName: this.participantOwners.get(p),
      // Downed (out of action) - see this field's doc comment on
      // `SharedParticipantState`. Almost always false: the only entries
      // that can be `ooc: true` here at all are the claimable exception
      // this method's own filter admits.
      ooc: p.ooc,
      // A downed character must never be offered as playable just because
      // it is claimable (a downed character being claimable must not
      // become a downed character being playable) - every action
      // affordance is forced off here, at the source, rather than trusted
      // to every UI consumer to re-derive the same guard.
      canAct: !p.ooc && (p.status === StatusEnum.Active || p.status === StatusEnum.Delaying),
      canDelay: !p.ooc && p.status === StatusEnum.Active,
      // A member of a linked NPC row can never take an Interrupt Action
      // (brief "NPC Group Initiative" criterion 17 / Decision 3, a
      // deliberate departure from p. 167) - so the row itself never offers
      // one, however high its shared Score.
      canInterrupt: !p.ooc && !isNpcRow(p) && p.getCurrentInitiative() >= 1,
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
        // Deliberately no `hasActed` here (fix round 2026-08-19, review
        // defect D5): this method builds both the player-facing entry AND
        // (via buildGmState()) a withheld entry, and `rowMembers` is part of
        // `SharedParticipantState` - the type `session:update-state` sends to
        // every player socket. `hasActed` rides
        // `SharedGmParticipantState.rowMemberHasActed` instead, GM-only and
        // index-aligned with this same array - see buildGmParticipantState().
      }));
    }

    return base;
  }

  /**
   * The GM-only half of the room snapshot (brief "GM reconnect state loss").
   * Built and pushed from the same single choke point as the player-facing
   * broadcast (`syncSharedState()`), never anywhere else.
   */
  private buildGmState(): SharedGmState {
    const all = this.combatManager.participants.items;
    const withheldParticipants: SharedParticipantState[] = [];
    all.forEach((p, index) => {
      if (p.ooc && !this.isClaimableOrOwnedOoc(p)) {
        // `order` here is the full-roster index, not the post-filter one
        // `getSharedParticipants()` uses for the player-facing array - see
        // `buildSharedParticipant`'s doc comment. The restore does NOT sort
        // by this `order` field when a `gmState` is present (review defect
        // D1 fix): it ranks by `buildGmParticipantState(p, index)`'s
        // `rosterIndex` below instead, which is on the same full-roster scale
        // for every participant, withheld or not - see that method's doc
        // comment and `SharedGmParticipantState.rosterIndex`'s.
        withheldParticipants.push(this.buildSharedParticipant(p, index));
      }
    });
    return {
      version: 1,
      withheldParticipants,
      participants: all.map((p, index) => this.buildGmParticipantState(p, index))
    };
  }

  /**
   * One GM-only rehydration entry for `p` - see `SharedGmParticipantState`.
   *
   * `rosterIndex` is `p`'s index in the same full, unfiltered `all` array
   * `buildGmState()` iterates - the single authoritative ruler the restore's
   * merge sorts by (review defect D1 fix, 2026-08-19): see
   * `SharedGmParticipantState.rosterIndex`'s doc comment for why the two
   * player-facing/withheld `order` fields cannot be compared against each
   * other directly.
   */
  private buildGmParticipantState(p: IParticipant, rosterIndex: number): SharedGmParticipantState {
    const gm: SharedGmParticipantState = {
      id: this.getParticipantId(p),
      rosterIndex,
      physicalHealth: p.physicalHealth,
      stunHealth: p.stunHealth,
      overflowHealth: p.overflowHealth,
      physicalDamage: p.physicalDamage,
      stunDamage: p.stunDamage,
      painTolerance: p.painTolerance,
      hasPainEditor: p.hasPainEditor,
      baseIni: p.baseIni,
      currentInitiativeScore: p.currentInitiativeScore,
      appliedInitiativeAttribute: p.appliedInitiativeAttribute,
      status: p.status,
      edge: p.edge,
      actionHistory: p.actionHistory.map(a => ({
        key: a.key,
        iniMod: a.iniMod,
        persist: a.persist,
        martialArt: a.martialArt,
        edge: a.edge
      })),
      ooc: p.manualOoc,
      tieBreaker: this.getParticipantTieBreaker(p)
    };
    if (hasGruntConditionMonitor(p)) {
      gm.isGrunt = true;
      gm.gruntBody = p.gruntBody;
      gm.gruntWillpower = p.gruntWillpower;
      gm.lastDamageType = p.lastDamageType;
      gm.lastDamageValue = p.lastDamageValue;
    }
    if (isNpcRow(p)) {
      gm.rowSpentFlagged = p.spentFlagged;
      // Index-aligned with the player-facing rowMembers array built from the
      // same toRowSnapshot() call in buildSharedParticipant() - see
      // `rowMemberHasActed`'s doc comment for why this rides the GM-only
      // channel rather than `rowMembers[].hasActed` itself.
      gm.rowMemberHasActed = p.toRowSnapshot().members.map(m => m.hasActed === true);
    }
    // Item 7 fix (fix round 3): `projectionDiceGain` is "how this Score got
    // here", not something a restore can re-derive from `astralProjecting`
    // alone - see `SharedGmParticipantState.astralProjectionDiceGain`'s own
    // doc comment for the stranded-dice defect this closes. Only set while
    // actually projecting; 0 restores to 0 the same as an absent field would.
    if (this.isAstral(p) && p.astralProjecting) {
      gm.astralProjectionDiceGain = p.projectionDiceGain;
    }
    // Statblock imprint - GM-only (brief U2/D-X4). Carried by id only:
    // `label`/`professionalRating` are re-derived from
    // `getStatblockById(imprint.id)` on demand (`getParticipantStatblockLabel()`)
    // rather than sent here at all (item 8 fix, fix round 3 - the two fields
    // used to be written three lines below this comment despite the comment
    // already claiming they weren't, and had no reader anywhere in `src/` on
    // either side of the wire; `statblockId` is the single source of truth).
    const imprint = this.participantStatblocks.get(p);
    if (imprint) {
      gm.statblockId = imprint.id;
      gm.statblockAugmented = imprint.augmented;
    }
    // U7: GM-only, id-based (see `participantLieutenantTeamRowId`'s doc comment).
    const teamRowId = this.participantLieutenantTeamRowId.get(p);
    if (teamRowId) {
      gm.lieutenantTeamRowId = teamRowId;
    }
    return gm;
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
   * renames the row permanently and only a GM edit can correct it.
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
   * button can raise — astral status, astral projection, jack in/out, and,
   * since `briefs/action-log-readability-spec.md`, a declared Act
   * (`performAct`) and an Interrupt (`btnAction_Click`) as well.
   *
   * With a session open **and the socket healthy**, the line goes to the
   * shared log only: the server echo mirrors every non-`"GM"` entry into
   * `LogHandler` (see `attachShareListeners`), so writing a local line here
   * as well would give the GM the same event twice.
   *
   * With a session open but the connection currently down
   * (`shareConnectionLost`), `appendSharedLog`'s emit is fire-and-forget and
   * no echo is coming back to mirror it locally — round-2 defect D1. Without
   * a fallback the GM's own screen would show nothing for the event until (if
   * ever) the socket reconnects and the emit is resent, even though the event
   * genuinely happened at the table. So this also writes the same local line
   * the no-session branch below writes, exactly as `appendGmOnlyLog` and
   * `logRowEvent` already write a local line unconditionally. This does not
   * reopen finding D (the row/roll double-log case, left alone per the brief)
   * because it only fires while disconnected, when no echo is coming to
   * duplicate it.
   *
   * With no session there is no echo and no shared log, so the plain Action
   * Log is the only place the event can be recorded.
   */
  private appendParticipantEventLog(actorName: string, text: string): void {
    const actor = actorName || PLAYER_COMMAND_FALLBACK_ACTOR;
    if (this.shareRoomCode) {
      this.appendSharedLog(actor, text);
      if (this.shareConnectionLost) {
        LogHandler.log(this.currentBTTime, `${actor} ${text}`);
      }
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
      this.participantStatblocks.delete(target);
      this.participantLieutenantTeamRowId.delete(target);
      this.pendingJoinAnnouncement.delete(target);
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
      // Floor 0, not 1 (RULINGS 2026-08-30): same reasoning as the
      // configure_deck handler above - an absent/cleared value is unset, not
      // a rated 1.
      const safeDP = Math.max(DATA_PROCESSING_UNSET, Number(dataProcessing || DATA_PROCESSING_UNSET));
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
  private buildRestoredParticipant(
    shared: SharedParticipantState,
    gm: SharedGmParticipantState | undefined
  ): Participant {
    // Rows first: a row is never a decker or a magician (an NPC changing
    // Initiative type has to be detached off the row first, criterion 13), and
    // a row rebuilt as a plain Participant loses its members, its shared wound
    // accumulator and its refusal of Interrupt Actions (criterion 17 /
    // Decision 3) - the refusal being the one that silently changes what the
    // GM and the players are offered on the next broadcast.
    if (shared.isNpcRow === true) {
      const row = new NpcRowParticipant();
      row.restoreRowSnapshot({
        members: (shared.rowMembers ?? []).map((m, memberIndex) => ({
          name: String(m.name ?? ""),
          body: Math.max(0, Number(m.body ?? 0)),
          willpower: Math.max(0, Number(m.willpower ?? 0)),
          damage: Math.max(0, Number(m.damage ?? 0)),
          lastDamageType: m.lastDamageType === "physical" || m.lastDamageType === "stun"
            ? m.lastDamageType
            : null,
          lastDamageValue: Math.max(0, Number(m.lastDamageValue ?? 0)),
          // Brief "GM reconnect state loss" D2 (reverses NPC-group Decision
          // 18), sourced from the GM-only channel and index-aligned with this
          // same `rowMembers` array (fix round 2026-08-19, review defect D5:
          // `m.hasActed` no longer exists on the player-facing wire at all).
          // Absent with no `gm` (legacy/deploy skew) - defaults to false,
          // same as never having acted.
          hasActed: gm?.rowMemberHasActed?.[memberIndex] === true
        })),
        rowWoundModifier: Math.max(0, Number(shared.rowWoundModifier ?? 0)),
        everPopulated: shared.rowEverPopulated === true,
        // So a restored wiped-out row does not re-announce its own collapse
        // (brief "GM reconnect state loss" AC 3). Absent on a legacy/deploy-
        // skew restore with no `gm` - a wiped-out row was never on the
        // player-facing wire at all before this change, so there is nothing
        // to restore it *from* in that case either.
        spentFlagged: gm?.rowSpentFlagged === true
      });
      return row;
    }
    // ICParticipant reconstruction is explicitly out of scope (brief Decision
    // D5) - an IC still comes back as an ordinary MatrixParticipant below, a
    // known, accepted gap.
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
      // Item 7 fix (fix round 3): without this, `projectionDiceGain` reset to
      // 0 on every GM reconnect, and "Return to Body" computed
      // `countBefore - 0`, requesting no change - a mage reconnected into
      // mid-projection kept the extra dice and the inflated Score
      // permanently. GM-only (`gm?.astralProjectionDiceGain`), same as the
      // rest of this rehydration; absent with no `gm` (legacy/deploy skew)
      // defaults to 0, same as never having projected.
      if (ap.astralProjecting) {
        ap.projectionDiceGain = Math.max(0, Number(gm?.astralProjectionDiceGain ?? 0));
      }
      return ap;
    }
    // A standalone/detached grunt has no flag on the player-facing wire that
    // reconstruction may use (`isDetachedGrunt` is presentation-only, by
    // design - see `SharedParticipantState.isDetachedGrunt`'s doc comment).
    // `gm.isGrunt`, GM-only, is what makes this branch reachable at all
    // (brief "GM reconnect state loss" AC 9); with no `gm` this still falls
    // through to a plain Participant, the pre-existing, known gap.
    if (gm?.isGrunt === true) {
      const grunt = new DetachedGruntParticipant();
      // Both Condition Monitor inputs, set together, before any damage is
      // written (rehydration contract step 2) - sizes the single combined
      // track from p. 379's formula exactly as the live class does.
      grunt.setGruntAttributes(
        Math.max(0, Number(gm.gruntBody ?? 0)),
        Math.max(0, Number(gm.gruntWillpower ?? 0))
      );
      grunt.lastDamageType = gm.lastDamageType === "physical" || gm.lastDamageType === "stun"
        ? gm.lastDamageType
        : null;
      grunt.lastDamageValue = Math.max(0, Number(gm.lastDamageValue ?? 0));
      return grunt;
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

  /**
   * The Initiative attribute to restore, replacing the inline formula this
   * method used to duplicate (a pre-existing defect, independent of the GM
   * reconnect state loss but swept up by this rewrite: it omitted the astral
   * INT x2 branch entirely - see `getParticipantBaseInitiative`).
   *
   * The GM-only channel's `baseIni` is the raw backing field, restored
   * verbatim - preferred whenever it is present. With no `gm` (legacy
   * snapshot or deploy skew), fall back to re-deriving from the player-facing
   * wire fields alone, same three cases `getParticipantBaseInitiative` covers:
   * plain, jacked-in Matrix, and a projecting astral.
   */
  private restoredBaseIni(
    shared: SharedParticipantState,
    gm: SharedGmParticipantState | undefined,
    participant: IParticipant
  ): number {
    if (gm) {
      return Math.max(0, Number(gm.baseIni || 0));
    }
    const safeReaction = Math.max(0, Number(shared.reaction || 0));
    const safeIntuition = Math.max(0, Number(shared.intuition || 0));
    // A jacked-in decker's Initiative Attribute is Data Processing +
    // Intuition, not Reaction + Intuition (MatrixParticipant.applyJackInMode);
    // both inputs are already on the player-facing wire.
    const jackedInMatrixAttribute = this.isMatrix(participant)
      && shared.jackedIn === true
      && Number(shared.dataProcessing || 0) > 0
      ? Math.max(0, Number(shared.dataProcessing)) + safeIntuition
      : 0;
    if (jackedInMatrixAttribute > 0) {
      return jackedInMatrixAttribute;
    }
    // A projecting magician's Initiative Attribute is Intuition x2
    // (`getParticipantBaseInitiative`) - the branch the pre-existing formula
    // was missing.
    if (this.isAstral(participant) && shared.isAstralProjecting === true) {
      return Math.max(0, safeIntuition * 2);
    }
    if (safeReaction + safeIntuition > 0) {
      return safeReaction + safeIntuition;
    }
    return shared.pendingRoll
      ? PARTICIPANT_DEFAULT_BASE_INI
      : Math.max(0, Number(shared.initiativeScore || 0));
  }

  /**
   * Map one GM-only wire entry back onto the **identity-shared** `Action`
   * object `interruptTable` holds for that key, rather than a freshly-built
   * object with the same fields.
   *
   * Required because `Participant.canUseAction`'s persist gate is
   * `this._actionHistory.includes(action)` - object identity, not a value
   * comparison (`Participant.ts`) - and `ActionHandler.coreInterrupts` holds
   * those exact same references. A JSON-reconstructed Full Defense action
   * would round-trip every field correctly and still silently fail the
   * persist gate, letting it be bought a second time in the same Combat Turn
   * (brief "GM reconnect state loss" AC 7 / D4).
   */
  private resolveRestoredAction(entry: SharedActionState): Action {
    const known = interruptTable.find(a => a.key === entry.key);
    if (known) {
      return known;
    }
    // Unknown key (a custom/future action not in the mechanically-offered
    // table): fall back to a fresh object built from the wire fields, so the
    // restore never throws and the Score still reads correctly even though
    // the persist gate cannot be identity-matched for it.
    return {
      key: entry.key,
      iniMod: entry.iniMod,
      persist: entry.persist,
      martialArt: entry.martialArt,
      edge: entry.edge
    };
  }

  private restoreFromSharedState(state: SharedCombatState | null, gmState: SharedGmState | null = null) {
    // "Restore merges before it rebuilds": an all-withheld (all out-of-action,
    // non-claimable) encounter now has real content on the GM-only channel
    // even though the player-facing `state.participants` is empty (brief AC 5)
    // - so the no-op guard must ask both lists, not just the player-facing
    // one, or a fully-downed encounter would silently fail to restore.
    const hasPlayerFacing = !!state && Array.isArray(state.participants) && state.participants.length > 0;
    const hasWithheld = !!gmState && Array.isArray(gmState.withheldParticipants) && gmState.withheldParticipants.length > 0;
    if (!state || (!hasPlayerFacing && !hasWithheld)) {
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
    this.participantStatblocks.clear();
    this.participantLieutenantTeamRowId.clear();
    this.pendingJoinAnnouncement.clear();
    this.lastKnownDamage.clear();

    this.combatManager.participants.clear();
    this.combatManager.currentActors.clear();
    this.combatManager.nextSortOrder = 0;

    // Turn/pass counters are restored *before* the participants, so the
    // running Initiative Scores below are reconstructed against the pass
    // count they actually belong to (and never decayed against a stale one).
    this.combatManager.combatTurn = Math.max(1, Number(state.round || 1));
    this.combatManager.initiativePass = Math.max(1, Number(state.pass || 1));
    this.combatManager.started = Boolean(state.started);
    this.combatManager.passEnded = Boolean(state.passEnded);
    this.combatManager.currentInitiative = Number(state.currentInitiative ?? this.combatManager.currentInitiative);

    // Merge before rebuilding ("Restore merges before it rebuilds", spec
    // proposed approach): a withheld (out-of-action, non-claimable)
    // participant rides the GM-only channel under the exact same wire shape
    // as everyone else, so one loop below reconstructs both. A duplicate id -
    // a claimable OOC participant legitimately present on both lists -
    // resolves to the player-facing copy, which is authoritative for it.
    const seenIds = new Set<string>();
    const merged: SharedParticipantState[] = [];
    for (const shared of [ ...(state.participants ?? []), ...(gmState?.withheldParticipants ?? []) ]) {
      if (seenIds.has(shared.id)) {
        continue;
      }
      seenIds.add(shared.id);
      merged.push(shared);
    }

    const gmById = new Map((gmState?.participants ?? []).map(g => [ g.id, g ]));

    // Rank the merged roster for the rebuild loop and the sortOrder each
    // entry is pinned to below - by `rosterIndex` (review defect D1 fix,
    // 2026-08-19), not by `order` directly. `state.participants[].order` is
    // numbered on the post-filter scale and `gmState.withheldParticipants[].order`
    // on the full-roster scale - two different rulers that collide when
    // sorted together (a withheld participant above a live one could land on
    // the exact same slot as that live one). `rosterIndex`, carried once per
    // participant on the GM-only channel, is the one ruler both lists can be
    // read against consistently. With no `gmState` at all (legacy snapshot or
    // deploy skew) there is only ever the player-facing list, already on one
    // scale with nothing to reconcile, so `order` remains the correct fallback.
    //
    // This has to be a single decision for the WHOLE restore, not one taken
    // per entry (review defect D5, 2026-08-19 follow-up): a torn snapshot -
    // `gmState` present but missing an entry for some id (an older `gmState`
    // paired with a newer `state`, or a mid-write race) - used to fall back to
    // `order` for just that one entry while every other entry ranked on
    // `rosterIndex`, mixing the two scales in a single sort and reproducing
    // exactly the collision `rosterIndex` exists to prevent (e.g. sortOrders
    // `[0, 1, 1]`). If every merged entry has a usable `rosterIndex`, rank all
    // of them by it; otherwise rank all of them by `order`. Never mix within
    // one restore.
    const canRankByRosterIndex = merged.length > 0 && merged.every(entry => {
      const gmEntry = gmById.get(entry.id);
      return !!gmEntry && Number.isFinite(gmEntry.rosterIndex);
    });
    const rosterRank = (entry: SharedParticipantState): number => {
      return canRankByRosterIndex
        ? (gmById.get(entry.id) as SharedGmParticipantState).rosterIndex
        : Number(entry.order || 0);
    };
    merged.sort((a, b) => rosterRank(a) - rosterRank(b));

    for (const [mergedIndex, shared] of merged.entries()) {
      // Rehydration contract, in exactly this order (spec "GM reconnect
      // state loss") - the damage/attribute setters below each move the
      // running Initiative Score by a delta, so the Score itself must be
      // pinned only after every one of them has run (step 12's comment,
      // further down, says why).
      const gm = gmById.get(shared.id);
      const participant = this.buildRestoredParticipant(shared, gm);
      participant.name = shared.name;

      // Condition-monitor shape. A grunt-shaped participant was already sized
      // by setGruntAttributes() inside buildRestoredParticipant - writing
      // physicalHealth/stunHealth again here would fight
      // syncConditionMonitorToAttributes(). With no `gm` at all, leave
      // constructor defaults (legacy/deploy-skew behaviour, unchanged).
      if (!hasGruntConditionMonitor(participant) && gm) {
        participant.overflowHealth = gmCount(gm.overflowHealth, participant.overflowHealth);
        participant.physicalHealth = gmCount(gm.physicalHealth, participant.physicalHealth);
        participant.stunHealth = gmCount(gm.stunHealth, participant.stunHealth);
      }
      if (gm) {
        participant.painTolerance = gmCount(gm.painTolerance, participant.painTolerance);
        participant.hasPainEditor = gm.hasPainEditor === true;
        participant.physicalDamage = gmCount(gm.physicalDamage, participant.physicalDamage);
        participant.stunDamage = gmCount(gm.stunDamage, participant.stunDamage);
      }

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
      participant.baseIni = this.restoredBaseIni(shared, gm, participant);

      const safeReaction = Math.max(0, Number(shared.reaction || 0));
      const safeIntuition = Math.max(0, Number(shared.intuition || 0));
      // Position in the already-sorted merged list, not a re-derivation from
      // `rosterIndex`/`order`.
      //
      // `merged` was ranked above by one ruler for the whole restore (review
      // defects D1 and D5). Taking the position from that finished ranking is
      // what actually guarantees the property those defects were about:
      // `sortOrder` values are unique by construction, because array indices
      // are. Re-deriving them from the wire values instead does not - and the
      // D5 follow-up test proves it. A torn snapshot (a newer `state` paired
      // with an older `gmState` that has no entry for some id) forces the
      // whole restore onto the `order` ruler, but `order` is itself two
      // different scales across the two lists: the player-facing entries are
      // numbered by post-filter index and the withheld entries by full-roster
      // index. Ranking everyone by `order` therefore still collided
      // (sortOrders `[0, 1, 0]` for a withheld DownA + Live1 + an unseen
      // Live2). The merged position cannot collide regardless of which ruler
      // ranked it, and it reproduces the old value exactly on both healthy
      // paths - the legacy path's `merged` is `state.participants` sorted by
      // `order`, so index === order - 1, and the rosterIndex path's roster
      // indices are contiguous from 0, so index === rosterIndex.
      const sharedSortOrder = mergedIndex;
      if (shared.ownerName) {
        this.participantOwners.set(participant, shared.ownerName);
      }
      this.participantClaimable.set(participant, shared.claimable === true);
      this.participantEdgeRatings.set(participant, Math.max(0, Number(shared.edgeRating || 0)));
      this.participantReactions.set(participant, safeReaction > 0 ? safeReaction : Math.max(0, Number(participant.baseIni || 0)));
      this.participantIntuitions.set(participant, safeIntuition);
      this.participantIds.set(participant, shared.id);
      if (gm) {
        // The coin-toss tie-breaker, restored rather than re-rolled (brief
        // "GM reconnect state loss" AC 7) - a tie can otherwise resolve
        // differently after a rejoin than it did before it.
        const gmTieBreaker = Number(gm.tieBreaker);
        this.participantTieBreakers.set(
          participant,
          Number.isFinite(gmTieBreaker) ? gmTieBreaker : Math.random()
        );
      }
      // The broadcast payload carries each participant's *current* running
      // Initiative Score, already reduced by every pass that has elapsed
      // (brief pp. 159-160). Reconstruct it verbatim rather than re-deriving
      // it from the pass count, and tell addParticipant() not to apply the
      // late-entry decay on top (it would double-count).
      this.combatManager.addParticipant(participant, true);

      // Pin the Score last of everything that moves it. physicalDamage,
      // stunDamage, painTolerance, hasPainEditor and baseIni above each call
      // syncInitiativeAttribute(), which applies a signed delta to the
      // running Score - pinning it before them would be silently overwritten;
      // pinning it after makes every one of them a no-op for the Score.
      // Getting this backwards shifts every wounded combatant's position in
      // the initiative order.
      if (gm) {
        // Coerced with the same Number.isFinite discipline the legacy branch
        // below already used (review defect D6): none of Participant's setters
        // coerce or clamp, so a corrupt room file would otherwise write NaN
        // straight into the running Score and scramble the whole order rather
        // than degrading. A non-finite Score falls back to the participant's
        // own reconstructed value instead of poisoning the sort.
        const gmScore = Number(gm.currentInitiativeScore);
        if (Number.isFinite(gmScore)) {
          participant.currentInitiativeScore = gmScore;
        }
        const gmApplied = Number(gm.appliedInitiativeAttribute);
        participant.appliedInitiativeAttribute = Number.isFinite(gmApplied)
          ? gmApplied
          : participant.initiativeAttribute;
      } else {
        const restoredScore = Number(shared.initiativeScore);
        if (Number.isFinite(restoredScore)) {
          participant.currentInitiativeScore = restoredScore;
          participant.appliedInitiativeAttribute = participant.initiativeAttribute;
        }
      }

      // Committed Interrupt Actions (brief AC 7 / D4) - pushed onto the
      // history without touching currentInitiativeScore, so
      // getCurrentInitiative() reproduces the pre-crash effective Score
      // exactly (the cost was already folded into the pinned Score above).
      if (gm) {
        for (const action of gm.actionHistory) {
          participant.doAction(this.resolveRestoredAction(action));
        }
      }

      participant.sortOrder = sharedSortOrder;
      // Seeded from the just-restored values (closes defect 15: previously
      // seeded from the fresh constructor's 0/0 defaults, so the first
      // post-restore damage edit logged a wrong delta).
      this.lastKnownDamage.set(shared.id, {
        physical: Math.max(0, Number(participant.physicalDamage || 0)),
        stun: Math.max(0, Number(participant.stunDamage || 0))
      });

      if (shared.active) {
        participant.status = StatusEnum.Active;
        this.combatManager.currentActors.insert(participant);
      } else if (gm) {
        // `shared.active` is authoritative for currentActors membership - a
        // restored non-active participant is never Active even if the
        // GM-only channel says so (brief AC 6, D3: Finished/Delaying both
        // round-trip verbatim otherwise).
        // An unrecognised status from a corrupt snapshot degrades to Waiting
        // rather than leaving the participant in a state CombatManager cannot
        // schedule (review defect D6).
        const gmStatus = Number(gm.status);
        const knownStatus = Number.isFinite(gmStatus) && StatusEnum[gmStatus] !== undefined;
        participant.status = !knownStatus || gmStatus === StatusEnum.Active
          ? StatusEnum.Waiting
          : gmStatus;
      } else {
        participant.status = StatusEnum.Waiting;
      }

      // Edge (brief AC 7: "edge ... round-trip"), Score-neutral so order
      // relative to the pinned Score above does not matter. Not on the
      // player-facing wire at all, so only restorable when `gm` is present.
      if (gm) {
        participant.edge = gm.edge === true;
      }

      // A claimable participant that was out of action when this snapshot was
      // taken must come back out of action, never silently revived - the
      // highest-risk part of the original gap (a GM rejoining and finding a
      // downed PC standing up again would be worse than not being able to
      // reclaim it at all). With a `gm` entry the manual flag is restored
      // verbatim (brief AC 2/3: a non-claimable downed NPC comes back down
      // too, not just a claimable PC); with no `gm`, fall back to the
      // player-facing `shared.ooc`, exactly as before this change.
      if (gm ? gm.ooc === true : shared.ooc === true) {
        participant.ooc = true;
      }

      // So a restored wiped-out row is not re-announced as newly spent
      // (belt-and-braces with the same write inside restoreRowSnapshot -
      // brief AC 3).
      if (isNpcRow(participant) && gm?.rowSpentFlagged) {
        participant.spentFlagged = true;
      }

      // Statblock imprint (brief "Grunt naming and statblocks" acceptance
      // criterion 20): GM-only, carried by id only - `label`/
      // `professionalRating` are re-derived from `getStatblockById` on
      // demand rather than sent on the wire (`GM_STATE_MAX_PAYLOAD_BYTES`,
      // `server/gm-state-channel.js`). D-X2 struck gear/skills/etc. from
      // `GruntStatblock`, so there is no reference text to re-hydrate.
      if (gm?.statblockId) {
        this.participantStatblocks.set(participant, {
          id: gm.statblockId,
          augmented: gm.statblockAugmented === true
        });
      }
      // U7: which row this lieutenant beats on an Initiative tie with his own
      // team. Restored verbatim as an id - resolved back to a live
      // participant lazily by the tie-break comparator, since object
      // identity does not survive this rebuild.
      if (gm?.lieutenantTeamRowId) {
        this.participantLieutenantTeamRowId.set(participant, gm.lieutenantTeamRowId);
      }
    }

    this.combatManager.participants.sortBySortOrder();
    this.restoreWarning = this.buildRestoreWarning(gmState);
  }

  /**
   * What a restore could not bring back, in the GM's words. Two different
   * texts, chosen by whether a GM-only channel snapshot was present (brief
   * "GM reconnect state loss" D8):
   *
   * - **With `gmState`** (a room saved after this change, or an unaffected
   *   push-path reconnect): damage, condition monitors, turn state, committed
   *   interrupts and out-of-action combatants all come back now - the only
   *   thing that still cannot is this tab's own transient panel/selection
   *   state, which never leaves the browser (ARCHITECTURE §7).
   * - **With no `gmState`** (a legacy room persisted before this change, or
   *   deploy skew - an old server/client on one end of the join): kept as
   *   close to byte-for-byte identical to the earlier text as possible, so a
   *   rejoin into a pre-existing room still reads correctly - except that the
   *   undo-history clause is dropped (brief "Remove the undo/redo system" D5),
   *   since the tracker no longer has one to lose.
   */
  private buildRestoreWarning(gmState: SharedGmState | null): string {
    if (gmState) {
      // Deliberately avoids the word "damage" (spec scenario S1 asserts its
      // absence): this text must never read as a claim that anything was
      // lost. D11 (review round 2026-08-19): scoped to what this particular
      // snapshot actually held ("this snapshot's ... came back with it"),
      // rather than a blanket "everyone's ... came back intact" - the earlier
      // wording promised more than any one push is actually guaranteed to
      // carry.
      return "Restored from the room's last broadcast: this snapshot's injuries, "
        + "condition monitors and turn state came back with it. Not included: "
        + "this tab's own panel/selection state - re-open "
        + "anything you had expanded.";
    }
    return "Restored from the room's last broadcast. Not included: damage and "
      + "condition monitors (linked NPC rows excepted - their NPCs come back "
      + "with theirs), any non-claimable participant who was out of action, and "
      + "committed interrupt actions - re-enter those by "
      + "hand. A claimable character who was out of action comes back "
      + "out of action.";
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
  /**
   * Opens the "name before add" dialog (brief U1/U12). Creates **nothing**
   * until `commitAddDraft()` runs - `addParticipant()` itself is only called
   * from inside that method now.
   *
   * Deliberately writes **no** `LogHandler` entry here (defect D9, validator
   * round): opening the dialog is not a commit, so a raw internal handler
   * name (`"AddParticipant_Click"`, etc.) used to land in the GM's local
   * Action Log even when the GM went on to press Cancel, leaving a trace of
   * an add that never happened and that nobody could read as English. The
   * actual creation still reaches the local Action Log - `logRowEvent()`
   * always writes both the shared line and the local one - it just no longer
   * writes a *second*, diagnostic-only line at open time.
   */
  btnAddParticipant_Click() {
    this.openAddDialog("participant");
  }

  /**
   * "Add Grunt" (brief addendum Decision 9), now routed through the same
   * dialog (brief U12: naming on add applies uniformly, not just to grunts).
   * The dialog also offers the fourteen sample grunt/lieutenant templates
   * (brief "Grunt naming and statblocks" Phase 2). See
   * `btnAddParticipant_Click`'s doc comment for why this does not log at open.
   */
  btnAddGrunt_Click() {
    this.openAddDialog("grunt");
  }

  /**
   * "Grunt Group" - a brand-new linked NPC row, optionally from a template.
   * See `btnAddParticipant_Click`'s doc comment for why this does not log at
   * open (defect D9).
   */
  btnAddNpcRow_Click() {
    this.openAddDialog("row");
  }

  /**
   * "Add NPC" on an existing row's panel - the mid-combat reinforcement case.
   * See `btnAddParticipant_Click`'s doc comment for why this does not log at
   * open (defect D9).
   */
  btnAddNpcToRow_Click(row: NpcRowParticipant) {
    this.openAddDialog("rowMember", row);
  }

  /**
   * "Merge N into a Grunt Group" - naming happens before the merge commits
   * (brief IA1). See `btnAddParticipant_Click`'s doc comment for why this
   * does not log at open (defect D9).
   */
  btnMergeSelectedGrunts_Click() {
    this.openAddDialog("merge");
  }

  /**
   * Seed a fresh `AddDraft` for `kind` and open the dialog. Creates nothing:
   * the draft is local component state until `commitAddDraft()` runs (brief
   * acceptance criterion IA1/IA2). The proposed default name comes from the
   * same generator the button used to seed instantly before this change, so
   * leaving it untouched and pressing Confirm reproduces the old one-tap
   * behaviour exactly.
   */
  private openAddDialog(kind: AddDraftKind, targetRow: NpcRowParticipant | null = null): void {
    const defaultName =
      kind === "grunt" ? this.nextStandaloneGruntName() :
      kind === "row" ? this.nextMergedGruntRowName() :
      kind === "merge" ? this.nextMergedGruntRowName() :
      kind === "rowMember" && targetRow ? this.nextRowMemberName(targetRow) :
      "";
    this.pendingAddDraft = {
      kind,
      name: defaultName,
      count: 1,
      body: DEFAULT_GRUNT_ATTRIBUTE,
      willpower: DEFAULT_GRUNT_ATTRIBUTE,
      statblockId: null,
      loadAugmented: true,
      targetRow,
      lieutenantTeamRow: null
    };
    this.addDraftModalRef = this.modalService.open(this.addDraftModalTpl, { size: "lg", centered: true });
    this.addDraftModalRef.result.finally(() => {
      this.addDraftModalRef = null;
    });
  }

  /**
   * Which statblock the draft currently has selected, or `null` for a
   * hand-built grunt/row (brief D3). Template convenience so the dialog can
   * branch on `kind`/augmented-availability without repeating the lookup.
   */
  selectedDraftStatblock(): GruntStatblock | null {
    if (!this.pendingAddDraft?.statblockId) {
      return null;
    }
    return getStatblockById(this.pendingAddDraft.statblockId) ?? null;
  }

  /**
   * Templates offered by the picker, filtered by what `pendingAddDraft.kind`
   * can legally become (defect D6, validator round). A Grunt Group's members
   * share **one** rolled Initiative Score (brief acceptance criterion 12,
   * p. 379); a lieutenant template carries his **own** Score and must be a
   * separate participant (criterion 16, p. 380/381). Offering a lieutenant
   * template on a *row* draft used to build a row of two or three lieutenants
   * sharing a single Score - stacking several lieutenants side by side is
   * explicitly licensed (p. 381), but sharing an Initiative Score between
   * them is not what that licenses. A lieutenant template is therefore only
   * ever offered for `kind === "grunt"`, which always creates one standalone
   * participant with its own roll.
   */
  statblockOptionsForDraft(): readonly GruntStatblock[] {
    if (this.pendingAddDraft?.kind === "row") {
      return this.allGruntStatblocks.filter(sb => sb.kind !== "lieutenant");
    }
    return this.allGruntStatblocks;
  }

  /** Every existing linked NPC row, for the lieutenant team-row picker (U7). */
  existingNpcRows(): NpcRowParticipant[] {
    return this.combatManager.participants.items.filter(isNpcRow);
  }

  /** Cancel the open add dialog. Creates and changes nothing (brief IA2). */
  cancelAddDraft(): void {
    this.pendingAddDraft = null;
    if (this.addDraftModalRef) {
      this.addDraftModalRef.dismiss();
      this.addDraftModalRef = null;
    }
  }

  /**
   * The single commit point for every "name before add" flow (brief U1/U12,
   * amended by RULINGS.md 2026-08-30: the join line is written once
   * initiative is actually rolled, not here - see `queueJoinAnnouncement`).
   *
   * Does not queue a join line itself for `kind === "grunt" | "rowMember" |
   * "merge"`: `addGrunt`/`commitTemplateGrunt`/`addNpcToRow`/
   * `mergeSelectedGrunts` already queue their own wording. Queuing here too
   * would double-queue those paths.
   */
  commitAddDraft(): void {
    const draft = this.pendingAddDraft;
    if (!draft) {
      return;
    }
    const name = draft.name.trim();
    switch (draft.kind) {
      case "participant": {
        // D2 fix: a blank name is not left blank (that produced a
        // permanently nameless, permanently unannounced participant) - it
        // gets the same "default name, unique in the encounter" treatment
        // every other add path already has (brief acceptance criterion 3).
        // The join line is queued, not written, here (RULINGS.md
        // 2026-08-30) - see `queueJoinAnnouncement`.
        const finalName = name || this.nextStandaloneParticipantName();
        const p = this.addParticipant(false);
        p.name = finalName;
        this.queueJoinAnnouncement(p, (participant) => ({
          actor: participant.name || finalName,
          text: PARTICIPANT_JOINED_LOG_TEXT
        }));
        this.selectActor(p);
        this.syncSharedState();
        break;
      }
      case "grunt": {
        if (draft.statblockId) {
          this.commitTemplateGrunt(draft, name);
        } else {
          // addGrunt() already queues "added." - see this method's doc comment.
          this.addGrunt(name || undefined, draft.body, draft.willpower);
        }
        break;
      }
      case "row": {
        this.commitRowDraft(draft, name);
        break;
      }
      case "rowMember": {
        if (draft.targetRow) {
          // addNpcToRow() already queues "<name> joined the group." - see
          // this method's doc comment.
          this.addNpcToRow(draft.targetRow, name || undefined, draft.body, draft.willpower);
        }
        break;
      }
      case "merge": {
        // mergeSelectedGrunts() already queues "formed from ..." - see this
        // method's doc comment.
        this.mergeSelectedGrunts(name || undefined);
        break;
      }
    }
    this.pendingAddDraft = null;
    if (this.addDraftModalRef) {
      this.addDraftModalRef.close();
      this.addDraftModalRef = null;
    }
  }

  /**
   * `kind === "grunt"` with a template selected: instantiate from the
   * statblock rather than from `draft.body`/`draft.willpower` (brief "How
   * templates feed Body/Willpower").
   */
  private commitTemplateGrunt(draft: AddDraft, typedName: string): DetachedGruntParticipant {
    const sb = getStatblockById(draft.statblockId as string);
    if (!sb) {
      // Defensive only - the picker only ever offers ids from
      // `ALL_GRUNT_STATBLOCKS`, so this cannot happen from the UI.
      throw new Error(`Unknown grunt statblock id: ${draft.statblockId}`);
    }
    const finalName = typedName || this.nextStandaloneGruntName();
    // `initiativeDice` is already written onto `grunt.dices` by
    // `instantiateStandaloneFromStatblock` via `setDicesWithoutRoll` -
    // construction, never `changeDiceCount` (ARCHITECTURE §6).
    const { grunt, reaction, intuition } =
      instantiateStandaloneFromStatblock(sb, { augmented: draft.loadAugmented, name: finalName });
    this.combatManager.addParticipant(grunt);
    this.participantClaimable.set(grunt, false);
    // Grunts and lieutenants alike carry no Edge attribute (brief G9) - Edge 0
    // for ERIC, unconditionally (acceptance criterion 14, RULINGS 2026-08-01,
    // now unconditional per Decision D-X3 dropping contacts).
    this.participantEdgeRatings.set(grunt, NPC_ROW_EDGE_RATING);
    this.participantReactions.set(grunt, reaction);
    this.participantIntuitions.set(grunt, intuition);
    grunt.baseIni = this.getParticipantBaseInitiative(grunt);
    this.participantTieBreakers.set(grunt, Math.random());
    const id = this.getParticipantId(grunt);
    this.lastKnownDamage.set(id, {
      physical: Math.max(0, Number(grunt.physicalDamage || 0)),
      stun: Math.max(0, Number(grunt.stunDamage || 0))
    });
    this.participantStatblocks.set(grunt, { id: sb.id, augmented: draft.loadAugmented === true });
    if (sb.kind === "lieutenant" && draft.lieutenantTeamRow) {
      this.setLieutenantTeam(grunt, draft.lieutenantTeamRow);
    }
    // Same wording `addGrunt()` uses, box-count-free and Professional-Rating-
    // free (acceptance criteria 11, 18/19). Queued, not written, until this
    // grunt has a rolled Initiative Score (RULINGS.md 2026-08-30).
    this.queueJoinAnnouncement(grunt, (participant) => ({
      actor: participant.name || STANDALONE_GRUNT_NAME_PREFIX,
      text: GRUNT_ADDED_LOG_TEXT
    }));
    this.selectActor(grunt);
    this.syncSharedState();
    this.sort();
    return grunt;
  }

  /**
   * `kind === "row"`: a brand-new linked NPC row, its initial members either
   * hand-built (`draft.body`/`draft.willpower`) or instantiated from a
   * template. Built inline rather than via `addNpcRow()` + `addNpcToRow()` per
   * member: `addNpcToRow()` logs its own "joined the group" line per member,
   * which would violate acceptance criterion IA5 ("member joins inside the
   * same commit do not each produce a line") - this method's **one** "formed."
   * line is the only log entry the whole commit produces.
   */
  private commitRowDraft(draft: AddDraft, typedName: string): NpcRowParticipant {
    // Resolved and validated *before* anything is created (defect D6,
    // validator round): a lieutenant template must never be instantiated
    // into a row - see the throw below for why. Checking first means a
    // rejected draft leaves no half-built, orphaned row behind, the same way
    // the "Unknown grunt statblock id" defensive check already did.
    let sb: GruntStatblock | null = null;
    if (draft.statblockId) {
      sb = getStatblockById(draft.statblockId) ?? null;
      if (!sb) {
        throw new Error(`Unknown grunt statblock id: ${draft.statblockId}`);
      }
      if (sb.kind === "lieutenant") {
        // Defensive only: the picker (`statblockOptionsForDraft`) never
        // offers a lieutenant template for a row draft, so this cannot
        // happen from the UI. A lieutenant template must become its own
        // separate participant with its own Initiative Score (brief
        // acceptance criterion 16), never a shared row member.
        throw new Error(`Lieutenant statblock "${sb.id}" cannot be instantiated into a row.`);
      }
    }

    const row = new NpcRowParticipant();
    row.name = typedName || this.nextMergedGruntRowName();
    this.combatManager.addParticipant(row);
    this.participantClaimable.set(row, false);
    this.participantEdgeRatings.set(row, NPC_ROW_EDGE_RATING);
    this.getParticipantId(row);
    this.expandedRowPanels.add(row);

    // Defect D8 (validator round): floor of 1 (a `0` used to create an
    // empty, "formed.", initiative-slot-occupying row for a squad that did
    // not exist) and an upper guard against a fat-fingered entry.
    const count = Math.min(
      MAX_ROW_MEMBER_COUNT,
      Math.max(MIN_ROW_MEMBER_COUNT, Math.floor(draft.count || 0))
    );
    // The row is brand new and empty, so the default member names are exactly
    // `nextRowMemberName(row)`'s output for an empty row, computed once
    // rather than re-querying `row.members` after each add.
    const prefix = this.isDefaultRowName(row.name) ? DEFAULT_ROW_MEMBER_NAME_PREFIX : row.name;
    const names = Array.from({ length: count }, (_, i) => `${prefix} ${i + 1}`);

    if (sb) {
      const result = instantiateRowFromStatblock(sb, names, { augmented: draft.loadAugmented });
      for (const member of result.members) {
        row.addMember(member);
      }
      this.participantReactions.set(row, result.reaction);
      this.participantIntuitions.set(row, result.intuition);
      row.setDicesWithoutRoll(result.initiativeDice);
      this.participantStatblocks.set(row, { id: sb.id, augmented: draft.loadAugmented === true });
    } else {
      for (const memberName of names) {
        row.addMember(new GruntMember(memberName, draft.body, draft.willpower));
      }
      this.participantReactions.set(row, 3);
      this.participantIntuitions.set(row, 3);
      row.setDicesWithoutRoll(PHYSICAL_INITIATIVE_DICE);
    }
    row.baseIni = this.getParticipantBaseInitiative(row);
    this.participantTieBreakers.set(row, Math.random());
    // Queued, not written, until this row has its own rolled Initiative
    // Score (RULINGS.md 2026-08-30) - a brand-new row goes in unrolled
    // (single shared Initiative Test, p. 379).
    this.queueJoinAnnouncement(row, (participant) => ({
      actor: participant.name || MERGED_GRUNT_ROW_NAME,
      text: ROW_FORMED_LOG_TEXT
    }));
    this.selectActor(row);
    this.syncSharedState();
    this.sort();
    return row;
  }

  btnEdge_Click(sender: IParticipant) {
    LogHandler.log(this.currentBTTime, sender.name + " Edge_Click");
    sender.seizeInitiative();
  }

  btnRollInitiative_Click(sender: IParticipant) {
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
      const names = illegalActions.join(", ");
      this.osReminders.push(`${actor.name}: ${names} — add OS after resolving defense`);
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
    return DECLARED_ACTION_DESCRIPTIONS[action.name] || "No details available yet.";
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

  /**
   * Attribution follows the character-name-as-actor convention
   * (`briefs/action-log-improvements.md`), routed through
   * `appendParticipantEventLog` so the event is recorded exactly once whether
   * or not a session is open (see that helper's doc comment - finding D in
   * `briefs/action-log-readability-spec.md`).
   */
  private performAct(sender: IParticipant, declaredAction: string | null = null, submitter?: string) {
    const actor = submitter || sender.name || PLAYER_COMMAND_FALLBACK_ACTOR;
    this.appendParticipantEventLog(actor, declaredAction || NO_DECLARED_ACTION_PHRASE);
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
    const actor = this.rowLogActor(row);
    const text = `${member.name} ${declaredAction ?? NO_DECLARED_ACTION_PHRASE}`;
    // Round-2 defect D5: `logRowEvent`'s local write is `${actor} ${text}`,
    // which reads as one run-on the moment `text` itself opens with another
    // name ("Gangers G 1 took aim twice (simple)." - `text` cannot gain a
    // colon of its own; AC13/S2 assert the wire shape `"G 1 ... (simple)."`
    // verbatim). So the colon goes on only this call's *local* line, matching
    // the shared pane's own `<strong>actor</strong>: text` convention, rather
    // than into `logRowEvent` itself - other row events routed through it
    // (`addGrunt`'s local `"Ganger A added."`, asserted colon-free) must keep
    // their existing local shape.
    LogHandler.log(this.currentBTTime, `${actor}: ${text}`);
    this.appendSharedLog(actor, text);
    member.hasActed = true;
    if (row.activeMembers.every(m => m.hasActed)) {
      this.combatManager.act(row);
    }
    this.sort();
  }

  btnDelay_Click(sender: IParticipant) {
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
    LogHandler.log(this.currentBTTime, "NextPass_Click");
    this.combatManager.nextIniPass();
    // Decide, before `goToNextActors()` runs, whether the pass `nextIniPass()`
    // just started is real (gets its own "Start Initiative Pass" line) or the
    // phantom pass created when this same click ends the Combat Turn (never
    // announced - Open Decision 2 / AC4). `goToNextActors()` can call
    // `endInitiativePass()` synchronously, which reserves the *next* log
    // line's slot immediately if it fires - so this can't be decided by
    // checking `initiativePass` afterwards the way it used to be: that only
    // worked because the phantom-pass case resets `initiativePass` back to 1
    // via `endCombatTurn()`, but an ordinary "everyone still standing is
    // Delaying" pass (a real new pass that immediately re-ends, e.g. two
    // combatants who both held their action) does NOT reset it, and used to
    // let the pass-end hook's line land above this method's own pass-start
    // line for the same pass.
    //
    // `nextIniPass()` always increments `initiativePass`, so it is already
    // > 1 here on every real Next Pass click - the only question left is
    // whether the Combat Turn is over. `isOver()` is exactly the same check
    // `endInitiativePass()` runs internally to decide the same thing, and
    // nothing between here and there (`goToNextActors()`'s status flips and
    // `flagSpentNpcRows()`) changes any participant's Initiative Score, so
    // calling it now predicts that branch correctly without duplicating its
    // logic.
    const isRealNewPass = !this.combatManager.isOver();
    if (isRealNewPass) {
      this.appendSharedLog(
        "GM",
        formatPassStartLogText(this.combatManager.initiativePass, INITIATIVE_PASS_DECAY)
      );
    }
    this.combatManager.goToNextActors();
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
    // Same side-map cleanup the automatic row removal uses (ARCHITECTURE.md
    // §7/§8) - every GM-local map keyed on this participant has to be dropped
    // too, or the entry outlives the participant it was keyed on.
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
    // Deselecting the deleted participant is `forgetParticipant`'s job now.
    this.syncSharedState();
  }

  btnDuplicate_Click(sender: IParticipant) {
    LogHandler.log(this.currentBTTime, sender.name + " Duplicate_Click");
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
      if (this.participantStatblocks.has(sender)) {
        this.participantStatblocks.set(clone, this.participantStatblocks.get(sender)!);
      }
      // `participantLieutenantTeamRowId` is deliberately NOT copied here
      // (defect D7, validator round): a duplicated lieutenant linked to the
      // same row as its source would leave two lieutenants both beating that
      // row on a tie, and tying with each other with no comparator rule to
      // order the two of them. A duplicate is created unlinked; the GM
      // re-links it by hand (the retroactive lieutenant/team-row control,
      // defect D3) if that is genuinely wanted. (Item 9, fix round 3: this
      // note used to sit directly above the unrelated `pendingJoinAnnouncement`
      // copy below and read as describing *that* copy.)
      //
      // `pendingJoinAnnouncement` IS copied: a source still owing a join line
      // (not yet rolled) produces a clone that owes its own, independent join
      // line too - each resolver reads off whichever participant it is fired
      // against (see that map's own doc comment), so copying the array is
      // enough; nothing needs rebinding.
      if (this.pendingJoinAnnouncement.has(sender)) {
        this.pendingJoinAnnouncement.set(clone, [ ...this.pendingJoinAnnouncement.get(sender)! ]);
      }
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
    this.declaredActionSelections.clear();
    this.combatManager.endCombat();
    this.initiativePrepActive = false;
    // The scene is over: whoever the GM was rolling for may not exist next
    // fight, so the sticky attribution does not carry across the boundary.
    this.clearGmRollAttribution();
    this.appendSharedLog("GM", COMBAT_ENDED_LOG_TEXT);
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
   * A non-claimable OOC participant is filtered out of the broadcast list
   * entirely (`getSharedParticipants`), so without a log line the row simply
   * vanishes from every player's screen with no explanation. A claimable one
   * stays visible (`ooc: true`, exiting only the initiative order), but the
   * log line still matters there too - it is the only announcement its owner
   * gets that their character just went down or came back. Both handlers log
   * *after* the state change so the entry describes what actually happened.
   */
  btnLeaveCombat_Click(sender: IParticipant) {
    LogHandler.log(this.currentBTTime, sender.name + " LeaveCombat_Click");
    sender.leaveCombat();
    // Logged before `combatManager.act()`: if `sender` is the current actor,
    // `act()` can cascade into `endInitiativePass()`/`endCombatTurn()`, which
    // fire their own shared-log line synchronously. This line describes the
    // cause (leaving combat) and must not land below that effect (brief
    // "Combat boundary logging" fix round, Defect 1).
    this.appendSharedLog("GM", GM_LOG_TEXT.leftCombat(sender.name));
    if (this.combatManager.currentActors.contains(sender)) {
      // Remove sender from active Actors
      this.combatManager.act(sender);
    }
    this.sort();
  }

  btnEnterCombat_Click(sender: IParticipant) {
    LogHandler.log(this.currentBTTime, sender.name + " EnterCombat_Click");
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
    const actor = submitter || p.name || PLAYER_COMMAND_FALLBACK_ACTOR;
    this.appendParticipantEventLog(actor, `interrupted, ${getInterruptVerbPhrase(action.key)}.`);
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
    return this.logHandler.logbook;
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

  /**
   * Tab-to-add (brief Decision D4): the one fast keyboard entry path left
   * untouched by the dialog. Still creates a blank, unnamed participant
   * instantly with no join line - the line is queued (`queueJoinAnnouncement`)
   * and only actually written the first time this participant has a rolled
   * Initiative Score (RULINGS.md 2026-08-30). If it is still unnamed at that
   * moment, it gets the same "default name, unique in the encounter"
   * treatment the dialog's blank-name commit uses (brief acceptance
   * criterion 3), rather than sitting in a rolled order under no name at
   * all.
   */
  inpName_KeyDown(e: KeyboardEvent) {
    this.handleTabNav(e, 'input[name="name"]', (row) => {
      LogHandler.log(this.currentBTTime, "TabAddParticipant");
      const p = this.addParticipant();
      this.queueJoinAnnouncement(p, (participant) => {
        const typed = (participant.name || "").trim();
        const actor = typed || this.nextStandaloneParticipantName();
        if (!typed) {
          participant.name = actor;
        }
        return { actor, text: PARTICIPANT_JOINED_LOG_TEXT };
      });
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
    // The clamp and the resulting Score delta are applied together, in one
    // assignment to `diceIni`.
    const clamped = this.clampInitiativeRoll(value, p);
    if (clamped !== p.diceIni) {
      p.diceIni = clamped;
      // This box is a genuine Initiative Test result (see doc comment
      // above), so a participant with a still-queued join line may be
      // entering a rolled order for the first time right here (RULINGS.md
      // 2026-08-30) - the same choke point `rollAndLogInitiative` and the
      // player `roll_submission` command use.
      this.announceJoinIfPending(p);
    }
    this.onParticipantUpdated();
  }

  /**
   * Runs on every edit to a participant row, including every keystroke of a
   * name edit. Does not decide any join-line timing: that is entirely owned
   * by `announceJoinIfPending`, fired only from genuine Initiative Test
   * results (RULINGS.md 2026-08-30) - there is no longer a "commit" event on
   * the name box itself for a join line to hang off.
   */
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
    // The choke point (RULINGS.md 2026-08-30): fired before this roll's own
    // log line, so a still-owed join announcement reads ahead of the roll
    // that put this participant into the order.
    this.announceJoinIfPending(p);
    const total = p.getCurrentInitiative();
    const intuition = this.getParticipantIntuition(p);
    const baseLabel = this.isAstral(p) && this.asAstral(p).astralProjecting
      ? `INT×2(${intuition * 2})`
      : this.isMatrix(p) && this.asMatrix(p).jackedIn
          && this.asMatrix(p).vrMode !== VRMode.AR && this.asMatrix(p).vrMode !== VRMode.None
          ? `DP(${this.formatDataProcessing(this.asMatrix(p).dataProcessing)}) + INT(${intuition})`
          : `REA(${this.getParticipantReaction(p)}) + INT(${intuition})`;
    const logText = formatInitiativeRollLogText(baseLabel, values, total);
    // appendParticipantRollLog writes the local line too, tagged if hidden.
    this.appendParticipantRollLog(p, logText, presetHidden);
  }

  /**
   * GM-facing label of the statblock this participant was instantiated from
   * (e.g. "PR 5 - Elite Corporate Security (Grunt)"), or `null` for a
   * hand-built participant. Defect 7 fix (fix round 2): D-X4 retains
   * `professionalRating`/`label` as GM-only identification "so the GM can
   * see what a participant was created from", but nothing ever rendered it -
   * this is the local (non-wire) lookup the details panel binds to.
   * Never touches `SharedParticipantState`; the label only ever travels on
   * `SharedGmParticipantState` (U2, unchanged).
   */
  getParticipantStatblockLabel(p: IParticipant): string | null {
    const imprint = this.participantStatblocks.get(p);
    if (!imprint) {
      return null;
    }
    return getStatblockById(imprint.id)?.label ?? null;
  }

  /**
   * Data Processing to seed onto `p` if/when it is promoted to a Matrix
   * participant, sourced from the statblock imprint the same way
   * `getParticipantStatblockLabel` reads it - the established mechanism for
   * "this participant was instantiated from statblock X, look up X's own
   * data" (brief "Grunt statblock Data Processing" item 4; RULINGS
   * 2026-08-30). `undefined` for a hand-built participant, or for a block
   * that prints no usable Data Processing (`pr5-lieutenant` and the other
   * twelve) - `promoteToMatrixParticipant` treats that as unset, never as a
   * default.
   */
  private statblockDataProcessing(p: IParticipant): number | undefined {
    const imprint = this.participantStatblocks.get(p);
    if (!imprint) {
      return undefined;
    }
    return getStatblockById(imprint.id)?.dataProcessing;
  }

  /**
   * Roll-log rendering of a Data Processing value: the number itself, or
   * `"not set"` for the unset sentinel (RULINGS.md 2026-08-30) - a bare
   * `DP(0)` would read as a real, if unusually low, rating rather than as
   * "the GM has not entered one yet".
   */
  private formatDataProcessing(dp: number): string {
    return dp > DATA_PROCESSING_UNSET ? String(dp) : "not set";
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

  /**
   * Only jacked into a VR mode uses Data Processing + Intuition (p. 101,
   * p. 159, p. 231); AR uses physical Reaction + Intuition like anyone else,
   * so a Matrix participant currently in AR (or not jacked in at all) falls
   * through to the same branch a non-Matrix participant does - guarding on
   * `jackedIn`/`vrMode` here, not merely `isMatrix(p)`, is what makes that
   * true (a Reaction edit on an AR-mode decker must move Reaction+Intuition,
   * not silently recompute DP+Intuition instead).
   *
   * An unset Data Processing (`DATA_PROCESSING_UNSET`) derives **no** VR
   * Initiative (RULINGS.md 2026-08-30): rather than the plausible-looking
   * `0 + intuition`, this returns `DATA_PROCESSING_UNSET` itself, so a GM
   * reading the number sees an unmistakably-incomplete value instead of one
   * that could pass for a real attribute.
   */
  getParticipantBaseInitiative(p: IParticipant): number {
    const intuition = this.getParticipantIntuition(p);
    // No `jackedIn` guard: `vrMode` alone decides the formula, and every
    // jack-out path resets it to `None`/`AR`, so the two can never disagree.
    if (this.isMatrix(p) && MatrixParticipant.isVRMode(p.vrMode)) {
      // Only the VR modes use the Matrix Initiative attribute (Data
      // Processing + Intuition, pp. 229-230). **AR does not**: "When in AR,
      // you use your normal Initiative and Initiative Dice" (p. 229), and the
      // Initiative Attribute Chart lists Matrix AR as Reaction + Intuition
      // (p. 159). An AR decker therefore falls through to the ordinary
      // Reaction + Intuition return at the bottom, so their row behaves
      // exactly like any other participant.
      if (p.dataProcessing <= DATA_PROCESSING_UNSET) {
        return DATA_PROCESSING_UNSET;
      }
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

  addParticipant(selectNewParticipant = true): Participant {
    const p = new Participant();
    this.combatManager.addParticipant(p);
    this.participantClaimable.set(p, false);
    // These three MUST stay the same values `isUnusedPlaceholder()` compares
    // against (review defect D4, durable-rooms review round 6): they were
    // duplicate literals before this fix, so changing one here without also
    // changing `PLACEHOLDER_*_DEFAULT` silently made every fresh row compare
    // as "touched" and reopened round-4's D5 (the destructive-join warning
    // firing on an untouched blank row). Sharing the same named constants
    // makes that impossible instead of merely documented.
    this.participantEdgeRatings.set(p, PLACEHOLDER_EDGE_RATING_DEFAULT);
    this.participantReactions.set(p, PLACEHOLDER_REACTION_DEFAULT);
    this.participantIntuitions.set(p, PLACEHOLDER_INTUITION_DEFAULT);
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
    return p;
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
    //
    // Queued, not written, until this grunt has a rolled Initiative Score
    // (RULINGS.md 2026-08-30) - a standalone grunt takes its own Initiative
    // Test like any other new participant, so this is ordinarily a no-op
    // until the GM (or a batch roll) rolls it.
    this.queueJoinAnnouncement(grunt, (participant) => ({
      actor: participant.name || STANDALONE_GRUNT_NAME_PREFIX,
      text: GRUNT_ADDED_LOG_TEXT
    }));
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
   * Default name for the next plain participant left unnamed at commit
   * (defect D2): `"Combatant <n>"`, one past the highest number already in
   * the encounter. Same scanning shape as `nextStandaloneGruntName`, over its
   * own namespace (`STANDALONE_PARTICIPANT_NAME_PREFIX`).
   */
  private nextStandaloneParticipantName(): string {
    const pattern = new RegExp(`^${STANDALONE_PARTICIPANT_NAME_PREFIX} (\\d+)$`);
    let highest = 0;
    for (const p of this.combatManager.participants.items) {
      const match = pattern.exec(p.name || "");
      if (match) {
        highest = Math.max(highest, Number(match[1]));
      }
    }
    return `${STANDALONE_PARTICIPANT_NAME_PREFIX} ${highest + 1}`;
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
   * survives the merge. Kept as a `Set` of participants so a mis-tap is one tap
   * to correct and nothing is committed until the Merge button is pressed.
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
   * Not tracker state - it is a toast, cleared on its own timeout regardless
   * of what happens to the merge.
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

  /**
   * Was `p` instantiated from a statblock whose `kind` is `"lieutenant"`
   * (brief D-X2's `GruntStatblock.kind`)? Used by `mergeSelectedGrunts`
   * (defect 5, fix round 2) to refuse a merge that would produce a row made
   * entirely of lieutenants. False for a hand-built grunt (no imprint at
   * all) and for a grunt-kind template - only an actual lieutenant template
   * counts.
   */
  private isLieutenantImprintedStatblock(p: IParticipant): boolean {
    const imprint = this.participantStatblocks.get(p);
    if (!imprint) {
      return false;
    }
    return getStatblockById(imprint.id)?.kind === "lieutenant";
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
  /**
   * @param name GM-typed row name from the "name before add" dialog (brief
   * U1/U12, IA1). Falls back to `nextMergedGruntRowName()` exactly as before
   * when omitted or blank, so every existing direct call site
   * (`component.mergeSelectedGrunts()`, no argument) is unaffected.
   */
  mergeSelectedGrunts(name?: string): GruntMergeResult {
    const selected = this.getGruntsSelectedForMerge();
    const rowName = (name ?? "").trim() || this.nextMergedGruntRowName();
    // Defect 5 fix (fix round 2), widened by item 6 (fix round 3): a
    // lieutenant statblock (e.g. "pr1-lieutenant") can be instantiated as a
    // standalone grunt (brief G18/D3), so the merge selection can include one
    // imprinted from a lieutenant template - which the row picker already
    // refuses at instantiation time (defect D6), but the merge path never
    // checked. A lieutenant has his own attributes (p. 380) and his own
    // Initiative Test (p. 381) - verified against `rules/` 2026-08-30
    // (`rules/pages/p0382.txt` for "own attributes",
    // `rules/pages/p0383.txt` for "own Initiative Test"). Folding even one
    // of them into a row's single shared Score and shared
    // Condition Monitor (p. 379) is the same violation the row picker's
    // filter exists to prevent, reached from a different door.
    //
    // Item 6 fix (fix round 3): the previous guard only refused when the
    // WHOLE selection was lieutenant-imprinted, so a mixed selection (one
    // lieutenant plus one ordinary grunt) still went through - folding the
    // lieutenant into the row's single shared Score and Condition Monitor
    // anyway. Refused now whenever the selection contains *any*
    // lieutenant-imprinted grunt, naming the offender(s) so the GM knows
    // which tick to clear rather than having to guess.
    //
    // Also widened to a lieutenant/team-row link (`participantLieutenantTeamRowId`)
    // on its own, not just a lieutenant-template imprint: `setLieutenantTeam`
    // is not restricted to lieutenant-imprinted grunts (the "Lieutenant of"
    // control is offered for any grunt-shaped participant), so a hand-built
    // grunt the GM has linked to a row is making his own tie-break-relevant
    // Initiative Test the same way a templated lieutenant does - merging him
    // away would fold that into a shared Score exactly the same way, and
    // silently drop the link with no warning (item 6's second half).
    const lieutenantsInSelection = selected.filter(g =>
      this.isLieutenantImprintedStatblock(g) || this.participantLieutenantTeamRowId.has(g)
    );
    if (lieutenantsInSelection.length > 0) {
      const names = lieutenantsInSelection.map(g => g.name || "unnamed grunt").join(", ");
      const reason = `Cannot merge: ${names} ${lieutenantsInSelection.length === 1 ? "was" : "were"} `
        + "instantiated from a lieutenant statblock or linked as one. A lieutenant has his own "
        + "attributes (p. 380) and his own Initiative Test (p. 381) and cannot share a group's "
        + `single Score - untick ${lieutenantsInSelection.length === 1 ? "it" : "them"}, or add `
        + `${lieutenantsInSelection.length === 1 ? "it" : "them"} individually instead.`;
      this.setMergeMessage(reason);
      this.logGmOnlyRowEvent(MERGED_GRUNT_ROW_NAME, `merge refused - ${reason}`);
      return { ok: false, row: null, merged: [], refused: [ ...selected ], reason };
    }
    const result = mergeGruntsIntoRow(selected, rowName);
    this.setMergeMessage(result.reason);
    if (!result.ok || !result.row) {
      // Refusals are logged as well as shown: the GM's next move (re-group
      // between Combat Turns) happens minutes later, and the reason has to
      // still be readable then.
      //
      // GM-only. A refusal names an NPC and says why it could not be grouped -
      // pure GM bookkeeping about NPCs the players may not even have met, and
      // "Ganger A already rolled Initiative" is table information nobody
      // in-fiction has. Nothing else on this path mutates tracker state.
      this.logGmOnlyRowEvent(MERGED_GRUNT_ROW_NAME, `merge refused - ${result.reason}`);
      return result;
    }
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
    // D5: when the merged grunts carry different statblock imprints, the
    // merged row takes the first selected grunt's - mirroring
    // `mergeGruntsIntoRow` itself, which already takes `baseIni`/`dices` from
    // `grunts[0]` (`NpcRowParticipant.ts`).
    if (this.participantStatblocks.has(first)) {
      this.participantStatblocks.set(row, this.participantStatblocks.get(first)!);
    }
    // Queued before the removal loop below, and frozen now rather than
    // resolved lazily: the source grunts are about to be removed from the
    // encounter, so their names have to be captured while they still exist.
    // The line itself is not written until this row has its own rolled
    // Initiative Score (RULINGS.md 2026-08-30) - "the row goes in unrolled
    // so the GM makes its single group Initiative Test" (brief Decision 10),
    // so this ordinarily just queues.
    const mergedFrom = selected.map(g => g.name || "unnamed grunt").join(", ");
    this.queueJoinAnnouncement(row, (participant) => ({
      actor: participant.name || MERGED_GRUNT_ROW_NAME,
      text: `formed from ${mergedFrom}.`
    }));
    for (const grunt of selected) {
      // `forgetParticipant` drops `participantLieutenantTeamRowId` along with
      // every other side map (ARCHITECTURE.md §8) - silently, with no warning
      // to the GM. That would be a real loss for a grunt carrying a
      // lieutenant/team-row link, but the refusal check above (item 6, fix
      // round 3) now guarantees no such grunt ever reaches this loop: any
      // `grunt` here is, by construction, neither lieutenant-imprinted nor
      // linked via `setLieutenantTeam`. Preventing the situation rather than
      // warning about it after the fact.
      this.forgetParticipant(grunt);
      this.combatManager.removeParticipant(grunt);
      this.forgetSetEntry(this.gruntsSelectedForMerge, grunt);
    }
    this.selectActor(row);
    this.syncSharedState();
    this.sort();
    return result;
  }

  // ── Linked NPC rows (grunt groups) ──────────────────────────────────────
  //
  // All of the rules live in `src/Grunts/`; everything here is plumbing: side
  // maps, logging and panel state. See briefs/npc-group-initiative.md.

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
   * Queue a deferred join-log line for `p` (RULINGS.md 2026-08-30). Every
   * GM-side add path funnels its "this combatant just joined" wording
   * through here instead of calling `logRowEvent` directly - the plus
   * button and Tab-to-add (`addParticipant` callers), Add Grunt
   * (`addGrunt`/`commitTemplateGrunt`), Grunt Group (`commitRowDraft`), Add
   * NPC (`addNpcToRow`), merge (`mergeSelectedGrunts`), and the add
   * dialog's Confirm (`commitAddDraft`).
   *
   * Immediately attempts to fire the line it just queued
   * (`announceJoinIfPending`), which is a no-op for the ordinary case of a
   * brand-new, unrolled participant - `addNpcToRow`'s reinforcement case is
   * the exception, where the *row* may already be rolled this Combat Turn,
   * and this immediate attempt is what announces that member right away
   * instead of waiting for a roll that individual member will never get
   * (Decision 7: a joiner takes the row's current Score, no Initiative Test
   * of its own).
   */
  private queueJoinAnnouncement(
    p: IParticipant,
    resolve: JoinAnnouncementResolver,
    member?: GruntMember
  ): void {
    const queue = this.pendingJoinAnnouncement.get(p) ?? [];
    queue.push({ resolve, member });
    this.pendingJoinAnnouncement.set(p, queue);
    this.announceJoinIfPending(p);
  }

  /**
   * The single choke point (RULINGS.md 2026-08-30): writes every join line
   * still queued for `p`, the first time `p` actually has a rolled
   * Initiative Score (`diceIni > 0`). Called from every place that writes a
   * real Initiative Test result to `diceIni` - `rollAndLogInitiative` (the
   * Roll button and every batch-roll path), the player `roll_submission`
   * command, and the manual rolled-total box
   * (`onParticipantRolledTotalChanged`) - and from `queueJoinAnnouncement`
   * itself. A participant whose queue is empty, or who has not yet rolled,
   * is left untouched: a combatant created and deleted before initiative is
   * ever rolled never reaches `diceIni > 0` here and so is never announced,
   * which is the entire point of the ruling.
   */
  private announceJoinIfPending(p: IParticipant): void {
    if (p.diceIni <= 0) {
      return;
    }
    const queue = this.pendingJoinAnnouncement.get(p);
    if (!queue || queue.length === 0) {
      return;
    }
    this.pendingJoinAnnouncement.delete(p);
    for (const entry of queue) {
      const { actor, text, playerText } = entry.resolve(p);
      this.logRowEvent(actor, text, playerText ?? text);
    }
  }

  /**
   * Prune one row member's queued-but-unfired join announcement out of its
   * row's queue, leaving any other member's own entry untouched (RULINGS.md
   * 2026-08-30). `addNpcToRow` queues one entry per member added, all keyed
   * on the row rather than the member, so a blanket
   * `pendingJoinAnnouncement.delete(row)` would silently drop other
   * still-pending members too.
   *
   * Called by every path that removes or relocates a row member before its
   * row has rolled - `removeRowMember` and `detachRowMember` - so a member
   * who never made it into a rolled Initiative order never gets a "joined
   * the group" line written after the line recording their removal or
   * detachment. A no-op if the member's entry already fired (the row had
   * already rolled when they joined) or was never queued.
   */
  private forgetQueuedRowMemberAnnouncement(row: NpcRowParticipant, member: GruntMember): void {
    const queue = this.pendingJoinAnnouncement.get(row);
    if (!queue) {
      return;
    }
    const pruned = queue.filter(entry => entry.member !== member);
    if (pruned.length === 0) {
      this.pendingJoinAnnouncement.delete(row);
    } else {
      this.pendingJoinAnnouncement.set(row, pruned);
    }
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
  private logGmOnlyRowEvent(actor: string, text: string, extra?: Partial<SharedLogEntry>): void {
    this.appendGmOnlyLog(actor, text, extra);
  }

  /** Template guard: is this participant a linked NPC row? */
  isNpcRow(p: IParticipant): p is NpcRowParticipant {
    return isNpcRow(p);
  }

  /**
   * Tooltip for the GROUP badge. When the row has been wiped out by damage
   * (`NpcRowParticipant.isWipedOut`), explains why it is still sitting in the
   * initiative list - the prose the wiped-out log line used to carry, moved
   * here so a GM (or a player asking about it) can read it without a new log
   * entry (`briefs/action-log-readability-spec.md`, B15/B16).
   */
  getNpcRowBadgeTooltip(row: NpcRowParticipant): string {
    const base = "Grunt Group: several NPCs on one shared Initiative Score, "
      + "acting back-to-back in this slot (p. 379).";
    if (!row.isWipedOut) {
      return base;
    }
    return `${base} Every NPC in this group is out of action. The row keeps its place `
      + "in the initiative order until you delete it.";
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

  /** The Damage Value the next P/S/H tap will apply, defaulting to a single box. */
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
    const result = p.applyDamage(boxes, type);
    this.onParticipantDamageChanged();
    return result;
  }

  /**
   * Take boxes off a standalone / detached grunt's combined track (the
   * grunt panel's "H" button), defaulting to the same DV the P/S buttons
   * read so correcting a mis-keyed hit needs no retyping.
   */
  healGrunt(p: DetachedGruntParticipant, boxes = this.getGruntDamageValue(p)) {
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
    // Item 8 fix (fix round 4): not currently wired to any UI control
    // (`commitRowDraft` builds the Grunt Group button's row inline instead,
    // see that method's own comment) - but it is public, and a queue-less add
    // path here would be a latent trap for whichever future button ends up
    // calling it directly: every other add path funnels its join line
    // through here (RULINGS.md 2026-08-30), and this one silently would not.
    this.queueJoinAnnouncement(row, (participant) => ({
      actor: participant.name || MERGED_GRUNT_ROW_NAME,
      text: ROW_FORMED_LOG_TEXT
    }));
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
   *
   * The join line is queued like every other add path (RULINGS.md
   * 2026-08-30), but this is the one path where that queue can fire
   * *immediately*: if the row has already rolled this Combat Turn, this
   * member has just entered a rolled order by inheriting the row's current
   * Score directly (Decision 7) - there is no future roll of its own to wait
   * for. `queueJoinAnnouncement` makes that immediate attempt itself, so the
   * two cases (row already rolled / row still unrolled) need no branch here.
   */
  addNpcToRow(row: NpcRowParticipant, name?: string, body = 3, willpower = 3): GruntMember {
    const member = new GruntMember(name ?? this.nextRowMemberName(row), body, willpower);
    row.addMember(member);
    // Joining is Score-neutral even for an NPC who arrives already hurt: the
    // shared Score moves on wound *events* inside the row (Decision 1), and
    // Decision 7 says a joiner simply takes the row's current Score. Said out
    // loud in the log for a wounded joiner, because that is exactly the case a
    // GM would otherwise expect to see the row slow down.
    //
    // `carriedWounds` is read lazily inside the resolver, like `member.name`
    // is, rather than frozen at queue time: a reinforcement that takes
    // damage before its own row gets around to rolling (unrolled row, item 8
    // fix round 4) must report the wounds it actually has at announcement
    // time, not the wounds it arrived with.
    this.queueJoinAnnouncement(row, (participant) => {
      const carriedWounds = member.wm > 0
        ? `, arrives wounded (-${member.wm})`
        : "";
      return {
        actor: this.rowLogActor(this.asNpcRow(participant)),
        text: `${member.name} joined the group${carriedWounds}.`
      };
    }, member);
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
      this.logRowEvent(actor, `${member.name} already out of action — hit had no effect.`);
    }
    if (result.scoreDelta !== 0) {
      this.logGmOnlyRowEvent(actor, formatGroupWoundLogText(
        member.name,
        result.rowWoundModifierDelta,
        result.scoreAfter
      ), { houseRule: true });
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
      this.logGmOnlyRowEvent(this.rowLogActor(spent), "every member is out of action.");
    }
    this.syncSharedState();
  }

  /**
   * The GM-side half of an Initiative Pass ending: say so in the log.
   * Registered on the CombatManager in the constructor, so every one of the
   * ten call paths that can end a pass (ARCHITECTURE.md §2) logs identically,
   * and the engine's `!alreadyEnded` guard keeps a delayed actor's late Act
   * from firing this twice for the same pass (brief "Action Log entries for
   * combat structural boundaries" scenario S2).
   *
   * Appends a log line and nothing else: this fires mid-transition, and every
   * one of those ten call paths already ends with its own `sort()`/
   * `syncSharedState()`.
   */
  private logInitiativePassEnded(pass: number): void {
    this.appendSharedLog("GM", formatPassEndLogText(pass));
  }

  /**
   * The GM-side half of a Combat Turn ending: say so in the log. Registered
   * on the CombatManager in the constructor. Fires before
   * `endCombatTurn()`'s own mutations, so `turn` is still the turn that is
   * ending, not the incremented value.
   *
   * Appends a log line and nothing else, for the same reason as
   * `logInitiativePassEnded` above.
   */
  private logCombatTurnEnded(turn: number): void {
    this.appendSharedLog("GM", formatTurnEndLogText(turn));
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
   * Kept as a toggle, and kept unlogged for the same reason it always was: a
   * mis-tap at the table has to cost one tap to correct, and a row of six must
   * not write six bookkeeping lines a pass into a log whose job is to record
   * what happened in the fiction. Since Decision
   * 23 the template only reaches this method for the *un-mark* direction -
   * the mark-as-acted direction now goes through `btnRowMemberAct_Click` so
   * it is a real, logged action declaration - but the method itself is left
   * bidirectional so a caller (or a future control) can still flip either way
   * in one tap. Cleared automatically at each pass boundary
   * (`CombatManager.nextIniPass`) and Combat Turn boundary
   * (`NpcRowParticipant.softReset`) either way.
   */
  toggleRowMemberActed(member: GruntMember): void {
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
   * The Damage Value queued against one NPC in a row - what the next "P"/"S"/"H"
   * tap will apply or take back - defaulting to a single box so the panel still
   * works as a one-tap "+1" for chip damage and a one-tap "-1" to take it off.
   */
  getRowMemberDamageValue(member: GruntMember): number {
    return this.rowMemberDamageValues.get(member) ?? DEFAULT_ROW_MEMBER_DAMAGE_VALUE;
  }

  /**
   * Set the DV the next hit or heal on this NPC will apply. Clamped to at least
   * one box (a DV of 0 is neither an attack nor a heal) and to no more than a
   * full Condition Monitor's worth plus the row's own headroom. Either way the
   * excess is discarded: a hit because grunts take no overflow damage (p. 379),
   * a heal because it is clamped to the damage actually on the track.
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
   * Correct a mis-keyed hit / heal an NPC, re-syncing the row's shared score.
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
   * the last one standing. This is the correction path for a mis-keyed
   * killing blow (`RULINGS.md` 2026-08-07).
   *
   * Log privacy as in `applyRowMemberDamage`: the GM sees the running damage
   * total, players see only that healing happened (Decision 17). The Condition
   * Monitor's maximum is dropped from the GM's copy too (Decision 25,
   * `RULINGS.md` 2026-08-13).
   *
   * `boxes` defaults to the same DV `hitRowMemberPhysical`/`Stun` read, so the
   * "H" button defaults to the same DV the "P"/"S" buttons read, without the
   * GM having to retype it.
   */
  healRowMember(row: NpcRowParticipant, member: GruntMember, boxes = this.getRowMemberDamageValue(member)) {
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
        member.name,
        result.rowWoundModifierDelta,
        result.scoreAfter
      ), { houseRule: true });
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
    // A member of a templated row carries the row's statblock imprint with it
    // when it detaches (brief implementation appendix item 33).
    if (this.participantStatblocks.has(row)) {
      this.participantStatblocks.set(detached, this.participantStatblocks.get(row)!);
    }
    // Item 1 fix (fix round 4): if `member` joined this row while it was
    // still unrolled, it is owed a queued "joined the group" line that has
    // not fired yet (`pendingJoinAnnouncement`, RULINGS.md 2026-08-30). That
    // line is now wrong on two counts - the member is no longer in the
    // group, and `member.name` inside the resolver would go on resolving
    // against a `GruntMember` no row will ever roll for again - so it is
    // dropped here rather than left to fire later.
    //
    // Deliberately NOT requeued onto `detached` under new wording. The
    // `logRowEvent` two lines below - "detached from the row onto their own
    // initiative" - fires unconditionally, is shown to players like every
    // other queued join line, and already tells the table this NPC now
    // exists as its own entry in the order; a detach was never a "leave the
    // fight" event; the member has been visibly present since it joined the
    // row, only unannounced. A second "joined the fight" line when the
    // detached NPC's own Initiative Test resolves would be a duplicate
    // announcement of the same NPC's presence, which is exactly what the
    // choke point in `announceJoinIfPending` exists to prevent, not
    // reintroduce here.
    this.forgetQueuedRowMemberAnnouncement(row, member);
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
   * also offers to delete the now-empty row: a single "Yes" does both in one
   * tap, rather than leaving a corpse-free empty row behind for a second tap
   * the GM has to remember to make. Declining leaves everything untouched.
   *
   * Deleting the row this way runs the exact same side-map cleanup
   * `btnDelete_Click` does (`forgetParticipant`), including
   * `forgetMapEntry(this.rowMemberDamageValues, member)` for the member's own
   * queued Damage Value (ARCHITECTURE.md §7/§8).
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
    row.removeMember(member);
    this.forgetMapEntry(this.rowMemberDamageValues, member);
    // Item 1 fix (fix round 4): drop `member`'s own queued "joined the
    // group" line, if the row hadn't rolled yet when it fired
    // (`pendingJoinAnnouncement`, RULINGS.md 2026-08-30) - otherwise it
    // would still be sitting in the row's queue and would fire the next time
    // the row rolls, writing "joined the group" for an NPC the log already
    // recorded as removed, for someone no longer in the fight at all. A
    // no-op if the entry already fired or was never queued. (When `member`
    // was the row's last member, `forgetParticipant(row)` below also clears
    // the whole queue for the row being deleted; this call still runs first
    // so the prune does not depend on that branch.)
    this.forgetQueuedRowMemberAnnouncement(row, member);
    this.logRowEvent(this.rowLogActor(row), `${member.name} removed from the row`);
    if (isLastMember) {
      // The row is now a plain empty row (Decision 21) - the prompt already
      // offered to delete it, so finish the job now rather than leaving the
      // GM a second tap to remember.
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
      // Item 9 fix (fix round 3): if `p` is a row, drop every OTHER
      // participant's dangling lieutenant/team-row link that pointed at it
      // (`participantLieutenantTeamRowId` is keyed by the *lieutenant*, not
      // the row, so `forgetMapEntry(participantLieutenantTeamRowId, p)`
      // below cannot reach these - it only ever removes `p`'s own entry, and
      // `p` here is the row being deleted, not a lieutenant). Harmless today
      // (ids are random strings and can never re-match a future row), but
      // leaving it meant a lieutenant could point at an id that no longer
      // names anything in the encounter with no way for the GM to see or
      // clear it.
      if (isNpcRow(p)) {
        for (const [ lieutenant, teamRowId ] of [ ...this.participantLieutenantTeamRowId ]) {
          if (teamRowId === id) {
            this.participantLieutenantTeamRowId.delete(lieutenant);
          }
        }
      }
    }
    this.forgetMapEntry(this.declaredActionSelections, p);
    this.forgetMapEntry(this.participantIds, p);
    this.forgetMapEntry(this.participantOwners, p);
    this.forgetMapEntry(this.participantClaimable, p);
    this.forgetMapEntry(this.participantEdgeRatings, p);
    this.forgetMapEntry(this.participantReactions, p);
    this.forgetMapEntry(this.participantIntuitions, p);
    this.forgetMapEntry(this.participantTieBreakers, p);
    this.forgetMapEntry(this.participantStatblocks, p);
    this.forgetMapEntry(this.participantLieutenantTeamRowId, p);
    this.forgetMapEntry(this.pendingJoinAnnouncement, p);
    this.forgetSetEntry(this.expandedRowPanels, p);
    this.forgetSetEntry(this.expandedDeckPanels, p);
    this.forgetSetEntry(this.expandedAstralPanels, p);
    this.forgetSetEntry(this.expandedStatEditors, p);
    if (this.selectedActor === p) {
      this.selectedActor = null;
    }
  }

  /**
   * Delete one side-map entry.
   *
   * The side maps are keyed by object identity and hold state the domain model
   * does not (`participantIds`, the ERIC tie-break inputs, ownership, panel
   * state — ARCHITECTURE.md §7/§8). Anything that removes a participant has to
   * clean these up too, or the side-map entry outlives the participant it was
   * keyed on.
   */
  private forgetMapEntry<K, V>(map: Map<K, V>, key: K): void {
    if (!map.has(key)) {
      return;
    }
    map.delete(key);
  }

  /** `forgetMapEntry` for the panel-expansion `Set`s. */
  private forgetSetEntry<T>(set: Set<T>, key: T): void {
    if (!set.has(key)) {
      return;
    }
    set.delete(key);
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
    this.pendingVrModes.delete(p);
    this.demoteToParticipant(p as MatrixParticipant);
    this.syncSharedState();
    this.sort();
  }

  /** Are this participant's E/R/I/D shown as inputs (true) or as a summary? */
  areStatsExpanded(p: IParticipant): boolean {
    return this.expandedStatEditors.has(p);
  }

  toggleStatEditor(p: IParticipant): void {
    if (this.expandedStatEditors.has(p)) {
      this.expandedStatEditors.delete(p);
    } else {
      this.expandedStatEditors.add(p);
    }
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
    // Name captured before the promote: that swaps the participant instance.
    const astralName = p.name || "";
    // Logged before the promote: `promoteToAstralParticipant` ->
    // `removeParticipant` can cascade into `endInitiativePass()`/
    // `endCombatTurn()` if `p` is the current actor, and that boundary line
    // must not land above this one (brief "Combat boundary logging" fix
    // round, Defect 1).
    this.appendParticipantEventLog(astralName, PLAYER_COMMAND_LOG_TEXT.awakened);
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
    this.expandedAstralPanels.delete(p);
    // Name captured before the demote: that swaps the participant instance.
    const astralName = p.name || "";
    // Logged before the demote: `demoteFromAstralParticipant` ->
    // `removeParticipant` can cascade into `endInitiativePass()`/
    // `endCombatTurn()` if `p` is the current actor, and that boundary line
    // must not land above this one (brief "Combat boundary logging" fix
    // round, Defect 1).
    this.appendParticipantEventLog(astralName, PLAYER_COMMAND_LOG_TEXT.awakenedRemoved);
    this.demoteFromAstralParticipant(p as AstralParticipant);
    this.syncSharedState();
    this.sort();
  }

  /**
   * Enter or leave astral space. Both halves of the Initiative change are a
   * delta on the running Score (brief "Astral projection mid-turn", p. 160):
   *  - the attribute half (REA+INT <-> INT x 2) rides the `baseIni` setter;
   *  - the dice half is a *relative* +2/-2 on the Initiative Dice count
   *    (Astral base 3D6 total vs Physical 1D6, printed p. 314,
   *    `rules/pages/p0316.txt`; RULINGS 2026-08-30), pushed through the single
   *    dice-count funnel so the gained/lost dice are actually rolled and
   *    applied to the running Score - "gains the die (and the change in
   *    Initiative) for their Astral Initiative during that Combat Turn"
   *    (p. 160, `rules/pages/p0162.txt` line 53). The book's own example is
   *    singular because it predates the 3D6 astral-base ruling above;
   *    RULINGS.md 2026-08-30 supersedes the *count* only, not the mechanic -
   *    under that ruling a magician projecting mid-turn gains two dice, not
   *    one.
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

  /**
   * Jack Out: clear VR mode, restore physical initiative, reboot the device
   * you're using — reset OS to zero and erase this decker's marks (p. 242).
   *
   * Round-5 defect D-3: an earlier version of this method zeroed OS inline
   * (`this.osTracking.resetOS(mp)`) and never touched any mark record at
   * all, so `MatrixStateService.jackOut()`'s mark erasure (D-9) lived only
   * in a service method this, the actual GM-facing jack-out button, never
   * called. Routed through that service method instead of duplicating its
   * logic, so there is exactly one place "jacking out" is defined.
   *
   * `vrMode`/`jackedIn`/`blocksPhysicalActions` and the OS reset are all now
   * `matrixState.jackOut()`'s responsibility — see that method's doc comment
   * for the `VRMode.None` (not `VRMode.AR`) reconciliation between this
   * button and the service method.
   */
  gmJackOut(p: IParticipant): void {
    if (!this.isMatrix(p)) return;
    const mp = p as MatrixParticipant;
    this.matrixState.jackOut(mp);
    const reaction = this.participantReactions.get(mp) ?? 0;
    const intuition = this.getParticipantIntuition(mp);
    mp.baseIni = reaction + intuition;
    this.pendingVrModes.set(p, VRMode.AR);
    // Mid-combat jack out — base stat delta automatic via baseIni; the dice
    // half rolls the lost dice and subtracts the total (brief F5 / criterion
    // 8, p. 160). Outside a running combat the funnel just writes the count.
    // Restores the decker's *own* physical dice, not a hard-coded 1D6.
    this.restorePhysicalDiceCount(mp);
    this.appendParticipantEventLog(p.name || "", PLAYER_COMMAND_LOG_TEXT.jackedOut);
    this.syncSharedState();
    this.sort();
  }

  onDeckStatChanged(p: IParticipant, field: 'attack' | 'sleaze' | 'firewall' | 'deviceRating', value: number): void {
    if (!this.isMatrix(p)) return;
    (p as MatrixParticipant)[field] = Math.max(0, Number(value || 0));
    this.syncSharedState();
  }

  private promoteToMatrixParticipant(p: IParticipant): MatrixParticipant {
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
    // No hardcoded default (RULINGS 2026-08-30): the old `defaultDP = 6`
    // belonged to no character in the book and looked like a real rating.
    // `statblockDataProcessing` supplies a value only for a block the rules
    // actually derive one for (today, only `pr4-lieutenant`); every other
    // promotion - including from a bare "Add Participant" row, and from
    // `pr5-lieutenant`, whose deck array is deliberately unassigned - leaves
    // Data Processing unset until the GM enters one.
    mp.dataProcessing = this.statblockDataProcessing(p) ?? DATA_PROCESSING_UNSET;
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
    // Defect 4 fix (fix round 2): the statblock imprint and the lieutenant/
    // team-row link previously did not survive an in-place type swap, same
    // as every other GM-local side map here.
    const imprint = this.participantStatblocks.get(p);
    if (imprint) this.participantStatblocks.set(mp, imprint);
    const teamRowId = this.participantLieutenantTeamRowId.get(p);
    if (teamRowId !== undefined) this.participantLieutenantTeamRowId.set(mp, teamRowId);
    // Item 1 fix (fix round 3, closing round 2 defect 8): a still-queued
    // join line used to be silently dropped by every one of these four
    // type-swap helpers - a Tab-added participant jacked into the Matrix (or
    // astrally projected) before ever being named+rolled would enter combat
    // with no join line and no way to get one. Each resolver reads off
    // whichever participant it is fired against (see `pendingJoinAnnouncement`'s
    // own doc comment), so the array can move across the swap unchanged.
    const pendingJoin = this.pendingJoinAnnouncement.get(p);
    if (pendingJoin) this.pendingJoinAnnouncement.set(mp, pendingJoin);
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
    this.participantStatblocks.delete(p);
    this.participantLieutenantTeamRowId.delete(p);
    this.pendingJoinAnnouncement.delete(p);
    if (this.expandedDeckPanels.has(p)) {
      this.expandedDeckPanels.delete(p);
      this.expandedDeckPanels.add(mp);
    }
    // Carried across the type swap for the same reason the deck panel is: this
    // keys off the participant instance, and enabling a deck replaces that
    // instance, so without this an open stat twirly would silently snap shut.
    if (this.expandedStatEditors.has(p)) {
      this.expandedStatEditors.delete(p);
      this.expandedStatEditors.add(mp);
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
    // Defect 4 fix (fix round 2): carry the statblock imprint and the
    // lieutenant/team-row link across the type swap, same as every other
    // GM-local side map here.
    const imprint = this.participantStatblocks.get(mp);
    if (imprint) this.participantStatblocks.set(p, imprint);
    const teamRowId = this.participantLieutenantTeamRowId.get(mp);
    if (teamRowId !== undefined) this.participantLieutenantTeamRowId.set(p, teamRowId);
    // Item 1 fix (fix round 3, closing round 2 defect 8) - see
    // `promoteToMatrixParticipant`'s matching comment.
    const pendingJoin = this.pendingJoinAnnouncement.get(mp);
    if (pendingJoin) this.pendingJoinAnnouncement.set(p, pendingJoin);
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
    this.participantStatblocks.delete(mp);
    this.participantLieutenantTeamRowId.delete(mp);
    this.pendingJoinAnnouncement.delete(mp);
    this.expandedDeckPanels.delete(mp);
    // Same instance-swap carry-over as promoteToMatrixParticipant, in reverse:
    // removing the deck must not also collapse an open stat twirly.
    if (this.expandedStatEditors.has(mp)) {
      this.expandedStatEditors.delete(mp);
      this.expandedStatEditors.add(p);
    }
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
    // Defect 4 fix (fix round 2): carry the statblock imprint and the
    // lieutenant/team-row link across the type swap, same as every other
    // GM-local side map here.
    const imprint = this.participantStatblocks.get(p);
    if (imprint) this.participantStatblocks.set(ap, imprint);
    const teamRowId = this.participantLieutenantTeamRowId.get(p);
    if (teamRowId !== undefined) this.participantLieutenantTeamRowId.set(ap, teamRowId);
    // Item 1 fix (fix round 3, closing round 2 defect 8) - see
    // `promoteToMatrixParticipant`'s matching comment.
    const pendingJoin = this.pendingJoinAnnouncement.get(p);
    if (pendingJoin) this.pendingJoinAnnouncement.set(ap, pendingJoin);
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
    this.participantStatblocks.delete(p);
    this.participantLieutenantTeamRowId.delete(p);
    this.pendingJoinAnnouncement.delete(p);
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
    // Defect 4 fix (fix round 2): carry the statblock imprint and the
    // lieutenant/team-row link across the type swap, same as every other
    // GM-local side map here.
    const imprint = this.participantStatblocks.get(ap);
    if (imprint) this.participantStatblocks.set(p, imprint);
    const teamRowId = this.participantLieutenantTeamRowId.get(ap);
    if (teamRowId !== undefined) this.participantLieutenantTeamRowId.set(p, teamRowId);
    // Item 1 fix (fix round 3, closing round 2 defect 8) - see
    // `promoteToMatrixParticipant`'s matching comment.
    const pendingJoin = this.pendingJoinAnnouncement.get(ap);
    if (pendingJoin) this.pendingJoinAnnouncement.set(p, pendingJoin);
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
    this.participantStatblocks.delete(ap);
    this.participantLieutenantTeamRowId.delete(ap);
    this.pendingJoinAnnouncement.delete(ap);
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

  /**
   * Value to bind the GM's Data Processing input to: the real rating, or
   * `null` for the unset sentinel so the field renders empty (with a "not
   * set" placeholder) rather than showing a literal, plausible-looking `0`
   * (RULINGS.md 2026-08-30).
   */
  getMatrixDataProcessingDisplayValue(p: IParticipant): number | null {
    if (!this.isMatrix(p)) return null;
    return p.dataProcessing > DATA_PROCESSING_UNSET ? p.dataProcessing : null;
  }

  onMatrixDPChanged(p: IParticipant, value: number): void {
    if (!this.isMatrix(p)) return;
    // Floor 0, not 1 (RULINGS 2026-08-30): letting the GM clear this field
    // back to "unset" has to actually stay 0, not spring back up to a
    // plausible-looking rated 1.
    p.dataProcessing = Math.max(DATA_PROCESSING_UNSET, Number(value || DATA_PROCESSING_UNSET));
    p.baseIni = this.getParticipantBaseInitiative(p);
    this.syncSharedState();
  }

  /**
   * "Switch Mode" control. A mid-combat interface-mode switch is a dice change
   * like any other: `applyVRMode` routes it through the dice-count funnel, so
   * the gained/lost dice are rolled and applied to the running Score (brief
   * F5 / criteria 7-8, p. 160). This handler previously changed the dice count
   * with no roll and no Score effect at all.
   *
   * Has no production caller (`briefs/action-log-readability-spec.md` item 3):
   * the template's "Jack In" and "Switch Mode" buttons both call `gmJackIn`,
   * which logs via `appendParticipantEventLog`, and the `configure_deck`
   * jack-in branch logs via `appendPlayerCommandLog`. This method is kept only
   * for `battle-tracker.component.spec.ts`'s dice-funnel regression suite,
   * which calls it directly, and writes no log line of its own - VR-mode
   * events are logged by `gmJackIn` / `gmJackOut` / the `configure_deck`
   * branch, never here.
   */
  onVRModeChange(p: IParticipant, mode: VRMode): void {
    if (!this.isMatrix(p)) return;
    this.applyVRMode(p as MatrixParticipant, mode);
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
      return this.restorePhysicalDiceCount(mp, options);
    }
    // Entering VR overwrites the dice count with an absolute 3D6/4D6, so
    // remember what it was first or an augmented decker loses those dice
    // permanently on the way back (RULINGS.md 2026-08-29). Guarded on null so
    // a Cold -> Hot switch does not overwrite the *original* physical count
    // with the cold-sim 3.
    if (mp.preVrDiceCount === null) {
      mp.preVrDiceCount = mp.dices;
    }
    let result: DiceCountChangeResult = NO_DICE_COUNT_CHANGE;
    mp.applyJackInMode(mode, intuition, target => {
      result = this.changeParticipantDiceCount(mp, target, options);
    });
    return result;
  }

  /**
   * Put back the Initiative Dice count a decker had before they jacked in, and
   * forget it.
   *
   * Falls back to `PHYSICAL_INITIATIVE_DICE` only when nothing was recorded -
   * a participant who was never in VR, or one restored from an older session
   * snapshot. Falling back to 1 unconditionally is the bug this replaces: it
   * truncated any augmented decker to 1D6 the first time they jacked out.
   *
   * Routed through `changeParticipantDiceCount` like every other dice change,
   * so a mid-combat restore rolls the regained dice and moves the running
   * Score (p. 160), while a restore outside combat just writes the count.
   */
  private restorePhysicalDiceCount(
    mp: MatrixParticipant,
    options: DiceCountChangeOptions = {}
  ): DiceCountChangeResult {
    const restored = mp.preVrDiceCount ?? PHYSICAL_INITIATIVE_DICE;
    mp.preVrDiceCount = null;
    return this.changeParticipantDiceCount(mp, restored, options);
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

  /**
   * U7 (brief p. 381): "if they get the same Initiative as their team, they
   * always go first." A specific override of p. 159's generic ERIC ladder,
   * scoped to that one lieutenant against that one row - resolved lazily by
   * id via `participantLieutenantTeamRowId` rather than an object reference,
   * since object identity does not survive `restoreFromSharedState`.
   */
  private isLieutenantOf(candidate: IParticipant, row: IParticipant): boolean {
    const teamRowId = this.participantLieutenantTeamRowId.get(candidate);
    return teamRowId !== undefined && teamRowId === this.getParticipantId(row);
  }

  /**
   * Record that `lieutenant` beats `row` on an Initiative tie without
   * consulting ERIC (U7, p. 381). Never called automatically - a lieutenant is
   * never auto-linked to a group (brief acceptance criterion 16 / U6); the GM
   * opts a specific lieutenant into a specific row's tie-break explicitly.
   */
  setLieutenantTeam(lieutenant: IParticipant, row: NpcRowParticipant): void {
    this.participantLieutenantTeamRowId.set(lieutenant, this.getParticipantId(row));
  }

  /**
   * Clear a lieutenant/team-row link (defect D3, validator round) - the
   * unlink half of `setLieutenantTeam`.
   */
  clearLieutenantTeam(lieutenant: IParticipant): void {
    this.participantLieutenantTeamRowId.delete(lieutenant);
  }

  /**
   * Which row `lieutenant` currently beats on an Initiative tie, or `null` if
   * none (defect D3, validator round - the retroactive lieutenant/team-row
   * control). Resolved by id, the same way the comparator does
   * (`isLieutenantOf`) - `participantLieutenantTeamRowId` never holds an
   * object reference.
   */
  getLieutenantTeamRow(lieutenant: IParticipant): NpcRowParticipant | null {
    const teamRowId = this.participantLieutenantTeamRowId.get(lieutenant);
    if (!teamRowId) {
      return null;
    }
    return this.existingNpcRows().find(row => this.getParticipantId(row) === teamRowId) ?? null;
  }

  /**
   * GM-facing setter behind the retroactive lieutenant/team-row control
   * (defect D3, validator round). Before this, the link could only be made
   * from inside the Add Grunt dialog at the moment a lieutenant *template*
   * was instantiated - a lieutenant created before his squad, a hand-built
   * *grunt* with no template at all (Add Grunt with no statblock picked,
   * later designated a lieutenant here), or a link the GM wants to remove or
   * retarget, had no way back in short of deleting and re-adding the
   * participant, which loses the rolled Initiative Score and writes a
   * spurious second "added." line. Re-sorts immediately so a tie the GM just
   * linked (or unlinked) reorders on screen without waiting for the next
   * unrelated mutation.
   *
   * Item 9 fix (fix round 3): the sentence above used to say "a hand-built
   * lieutenant with no template at all", full stop - readable as covering
   * *any* hand-built participant, including one made with the plain "Add
   * Participant" button. It does not: the control's own UI gate
   * (`battle-tracker.component.html`, the "Lieutenant of" dropdown) requires
   * `hasGruntConditionMonitor(selectedActor)`, deliberately (defect 10, fix
   * round 2 - "it previously accepted ANY non-row participant, including a
   * player character, which p. 380-381's lieutenant rule has no meaning for
   * at all"). The comment is fixed to match that gate rather than the gate
   * widened to match the old comment: p. 380-381's mechanic (a lieutenant
   * sharing the single combined Condition Monitor shape and tie-break
   * precedence a grunt/row has) genuinely has no meaning for a PC or an
   * ordinary NPC, so a plain `Participant` from "Add Participant" correctly
   * gets no dropdown - and, for now, no explanation either; a disabled
   * control or a tooltip explaining the omission would close that gap
   * further but is not built here.
   */
  onLieutenantTeamRowChanged(lieutenant: IParticipant, row: NpcRowParticipant | null): void {
    if (row) {
      this.setLieutenantTeam(lieutenant, row);
    } else {
      this.clearLieutenantTeam(lieutenant);
    }
    this.sort();
  }

  /**
   * Effective Initiative value used to order ties: raw Score, plus the +100
   * "edged" weighting and the -1000 "out of combat" weighting the tracker
   * already applies elsewhere (an edged participant sorts first among ties,
   * an OOC one sorts last). Factored out so `applyLieutenantPrecedence` (D4
   * fix below) uses the **exact** equality test `initiativeTieBreakComparator`
   * does, rather than a second copy that could silently drift from it.
   */
  private effectiveInitiativeForSort(p: IParticipant): number {
    return p.getCurrentInitiative() + (p.edge ? 100 : 0) - (p.ooc ? 1000 : 0);
  }

  /**
   * The plain ERIC ladder (p. 159): Edge, Reaction, Intuition, coin toss,
   * then insertion order. **Does not** special-case a lieutenant against his
   * own team - that used to live here as a pairwise override
   * (`isLieutenantOf(p1, p2) ? -1 : isLieutenantOf(p2, p1) ? 1 : ...`), which
   * made the comparator non-transitive: with a lieutenant tied with his own
   * row AND with an unrelated third party (all Edge 0, the lieutenant beating
   * the row on Reaction/Intuition but losing to the third party on the same),
   * the pairwise rule produced lieutenant < row, row < third party, and third
   * party < lieutenant - a strict 3-cycle `sort()` could order inconsistently
   * between runs (defect D4, validator round; brief implementation appendix
   * "How the lieutenant tie-break would be represented" flagged this exact
   * risk as a known limitation).
   *
   * The p. 381 "lieutenant beats his own tied team" rule is now applied
   * **after** this comparator has produced a totally ordered array - see
   * `applyLieutenantPrecedence`. That keeps this ladder itself transitive and
   * explicable on its own (any two participants' relative order here follows
   * from their own Edge/Reaction/Intuition/coin-toss/insertion-order alone,
   * never from a third participant), and moves the lieutenant rule to a
   * single well-defined post-processing pass instead of a pairwise exception
   * that can chain into a cycle.
   */
  private initiativeTieBreakComparator(p1: IParticipant, p2: IParticipant): number {
    const p1Ini = this.effectiveInitiativeForSort(p1);
    const p2Ini = this.effectiveInitiativeForSort(p2);
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

  /**
   * p. 381 / U7, applied as a **post-sort adjustment** rather than a pairwise
   * comparator override (defect D4 fix, validator round - see
   * `initiativeTieBreakComparator`'s doc comment for why the override was
   * removed from there). Mutates `items` in place: for every lieutenant tied
   * on effective Initiative with his own linked row, splice him out and
   * reinsert him immediately before that row.
   *
   * Item 2 fix (fix round 3, RULINGS.md 2026-08-30 "A lieutenant's tie-break
   * precedence applies against everyone, not just his own team"): the line
   * this replaced claimed "everyone else's relative order... is left exactly
   * as the comparator produced it" - that is false for the lieutenant's own
   * pair with an uninvolved third party tied at the same Initiative Score.
   * The splice below moves the lieutenant ahead of his row unconditionally
   * once both are found tied, which can also move him ahead of a third
   * combatant ERIC had placed between them - a **deliberate** leapfrog
   * ("if it's a fair leapfrog then it's fair," Xavier's ruling), not a
   * comparator bug. The two rules genuinely cycle on a three-way tie (p. 381
   * says the lieutenant always precedes his row; ERIC, p. 159, may place the
   * third party between them) and the book gives no answer; this is where
   * the cycle is broken, in the lieutenant's favour. Only the
   * lieutenant/row/third-party relationship is affected - the third party's
   * order relative to everyone *else* is untouched, and this is still a
   * total, deterministic order: each lieutenant is considered in his current
   * (ERIC-decided) position, so two lieutenants linked to the same tied row
   * both end up somewhere ahead of it (p. 381 is satisfied for each), but not
   * necessarily adjacent to it or to each other. `[L1, X, L2, ROW]` stays
   * exactly `[L1, X, L2, ROW]`: both lieutenants already precede the row and
   * take the "already ahead" early-continue below, so `X` is never displaced
   * from between them. Only a lieutenant found *behind* his row gets moved,
   * and only up to immediately before it.
   *
   * The comparator itself stays free of this override (no pairwise
   * exceptions), which is what keeps `initiativeTieBreakComparator`
   * transitive - the precedence rule is applied here, once, as a post-sort
   * splice, not baked into the ladder's own ordering logic.
   */
  private applyLieutenantPrecedence(items: IParticipant[]): void {
    if (this.participantLieutenantTeamRowId.size === 0) {
      return;
    }
    for (const lieutenant of [ ...items ]) {
      const teamRowId = this.participantLieutenantTeamRowId.get(lieutenant);
      if (!teamRowId) {
        continue;
      }
      const rowIndex = items.findIndex(p => p !== lieutenant && this.getParticipantId(p) === teamRowId);
      if (rowIndex === -1) {
        continue;
      }
      const row = items[rowIndex];
      if (this.effectiveInitiativeForSort(lieutenant) !== this.effectiveInitiativeForSort(row)) {
        continue;
      }
      const lieutenantIndex = items.indexOf(lieutenant);
      if (lieutenantIndex < rowIndex) {
        // Already somewhere ahead of his row - p. 381 only requires that he
        // go first, not that he sit immediately adjacent. Splicing him up to
        // be adjacent anyway would demote him past whichever participants
        // ERIC legitimately placed between him and the row (defect 1, fix
        // round 2 - the old `=== rowIndex - 1` guard only recognised the
        // already-adjacent case and reshuffled every other already-ahead
        // lieutenant backwards).
        continue;
      }
      items.splice(lieutenantIndex, 1);
      items.splice(items.indexOf(row), 0, lieutenant);
    }
  }

  private enforceSingleCurrentActor() {
    if (!this.combatManager.started || this.combatManager.currentActors.count <= 1) {
      return;
    }
    const ranked = [ ...this.combatManager.currentActors.items ].sort((a, b) => this.initiativeTieBreakComparator(a, b));
    this.applyLieutenantPrecedence(ranked);
    const keep = ranked[0];
    for (const actor of [ ...this.combatManager.currentActors.items ]) {
      if (actor === keep) {
        continue;
      }
      actor.status = StatusEnum.Waiting;
      this.combatManager.currentActors.remove(actor);
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
    this.initiativePrepActive = false;
    // Turn number and "is this a new combat" are captured before
    // `startRound()` runs, and all three start lines are emitted ahead of
    // that call — a deliberate departure from this file's usual "log after
    // the state change" convention. `startRound()` can itself cascade
    // straight through `endInitiativePass()` into `endCombatTurn()` when
    // nobody can act (every participant OOC), which increments `combatTurn`
    // before the click returns; logging after the call would print "Start
    // Combat Turn 2" for a turn that never had anyone in it, and the new
    // "End Combat Turn 1" line (via `onCombatTurnEnded`) would sit *above*
    // its own start line and disagree with it by one (brief "Action Log
    // entries for combat structural boundaries", Open Decision 5). These are
    // announcements of a boundary the click is about to cross, not reports of
    // a participant's state.
    const turn = this.combatManager.combatTurn;
    // Derived from combat state, not remembered: `endCombat()` resets
    // `combatTurn` to 1 and `started` to false, so a second encounter
    // re-announces "Combat started" correctly, and `endCombatTurn()`
    // increments past 1, so turns 2..N do not re-announce it.
    const isNewCombat = turn === 1 && !this.combatManager.started;
    if (isNewCombat) {
      this.appendSharedLog("GM", COMBAT_STARTED_LOG_TEXT);
    }
    this.appendSharedLog("GM", formatTurnStartLogText(turn));
    this.appendSharedLog(
      "GM",
      formatPassStartLogText(this.combatManager.initiativePass, INITIATIVE_PASS_DECAY)
    );
    this.combatManager.startRound();
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
    // Local log now renders oldest-first, same as the shared log, so a new
    // entry lands at the bottom and needs the same follow-to-bottom scroll.
    this.pendingLogScroll = true;
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
