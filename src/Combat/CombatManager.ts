import { Undoable } from "Common";
import { ParticipantList } from "./Participants/ParticipantList";
import { StatusEnum } from "./Participants/StatusEnum";
import { IParticipant } from "./Participants/IParticipant";
import { INITIATIVE_PASS_DECAY } from "./Participants/Participant";
// Imported by module path, not through the "Grunts" barrel's consumers, so no
// import cycle is introduced (Grunts only depends on Combat/Participants).
import { isNpcRow, NpcRowParticipant } from "Grunts/NpcRowParticipant";

class CombatManager extends Undoable {
  participants: ParticipantList;
  currentActors: ParticipantList;
  nextSortOrder = 0;

  private _started: boolean;

  get started(): boolean {
    return this._started;
  }

  set started(val: boolean) {
    this.Set("started", val);
  }

  private _passEnded: boolean;

  get passEnded(): boolean {
    return this._passEnded;
  }

  set passEnded(val: boolean) {
    this.Set("passEnded", val);
  }

  private _combatTurn: number;

  get combatTurn(): number {
    return this._combatTurn;
  }

  set combatTurn(val: number) {
    this.Set("combatTurn", val);
  }

  private _initiativePass: number;

  get initiativePass(): number {
    return this._initiativePass;
  }

  set initiativePass(val: number) {
    this.Set("initiativePass", val);
  }

  private _currentInitiative: number;
  get currentInitiative(): number {
    return this._currentInitiative;
  }

  set currentInitiative(val: number) {
    this.Set("currentInitiative", val);
  }

  constructor() {
    super();
    this._started = false;
    this._passEnded = true;
    this._combatTurn = 1;
    this._initiativePass = 1;
    this._currentInitiative = NaN;

    this.participants = new ParticipantList();
    this.currentActors = new ParticipantList();
  }

  endCombat() {
    this.combatTurn = 1;
    this.currentActors.clear();
    if (this.started) {
      this.started = false;
    }
    this.initiativePass = 1;
    for (const p of this.participants.items) {
      p.softReset();
    }
  }

  public startRound() {
    this.started = true;
    this.passEnded = false;
    this.goToNextActors();
  }

  /**
   * Advance to the next Initiative Pass: subtract exactly 10 from every
   * participant's running Initiative Score, once (brief criterion 2,
   * pp. 159-160). Applied to everyone, including participants already at or
   * below zero and participants currently out of combat - the latter so that
   * re-entering mid-turn lands on the correct "roll, then subtract 10 per
   * elapsed pass" value (brief F6, p. 160).
   *
   * Undo batching is the caller's responsibility: the production caller (the
   * GM component's Next Pass button) calls `UndoHandler.StartActions()` first,
   * so the whole advance collapses into one undo step. Called without an open
   * chapter, each property write becomes its own chapter (still undoable, just
   * not batched).
   */
  nextIniPass() {
    this.passEnded = false;
    this.initiativePass++;
    for (const p of this.participants.items) {
      p.applyInitiativeScoreDelta(-INITIATIVE_PASS_DECAY);
      if (!p.ooc && p.status !== StatusEnum.Delaying) {
        p.status = StatusEnum.Waiting;
      }
      // A row's members each carry their own "has acted this pass" marker
      // (brief "NPC Group Initiative" Decision 18); everyone still above 0 acts
      // again in the new pass (p. 159), so the markers clear with the row's own
      // status.
      if (isNpcRow(p)) {
        p.resetMemberActed();
      }
    }
  }

  endCombatTurn() {
    if (this.onCombatTurnEnded) {
      this.onCombatTurnEnded(this.combatTurn);
    }
    this.initiativePass = 1;
    this.combatTurn++;
    this.currentInitiative = NaN;
    for (const p of this.participants.items) {
      p.softReset();
    }
    this.started = false;
  }

  /**
   * End the current Initiative Pass. `passEnded` is itself the "this pass has
   * already ended" state, so the hook fires only on its `false -> true`
   * transition (`!alreadyEnded`) — this is what stops a Delaying participant
   * who acts after the pass has already ended from re-firing the hook (brief
   * "Action Log entries for combat structural boundaries" scenario S2). The
   * `isOver()` branch emits only the turn-end line via `endCombatTurn()`
   * (Open Decision 2): it also suppresses the phantom pass N+1 line described
   * in that brief, since the pass `nextIniPass()` just created was never
   * announced as starting.
   */
  endInitiativePass() {
    const alreadyEnded = this.passEnded;
    const endingPass = this.initiativePass;
    this.passEnded = true;
    if (this.isOver()) {
      this.endCombatTurn();
      return;
    }
    if (!alreadyEnded && this.onInitiativePassEnded) {
      this.onInitiativePassEnded(endingPass, this.combatTurn);
    }
  }

  isOver() {
    for (const p of this.participants.items) {
      if (p.getCurrentInitiative() > 0 && !p.ooc) {
        return false;
      }
    }
    return true;
  }

  /**
   * Would anyone still be above 0 after the next pass advance? This only
   * *previews* the decay - `nextIniPass()` is the single place that actually
   * applies it, so the -10 is never subtracted twice (brief criterion 4,
   * p. 159).
   */
  hasMoreIniPasses() {
    for (const p of this.participants.items) {
      if (p.getCurrentInitiative() - INITIATIVE_PASS_DECAY > 0 && !p.ooc) {
        return true;
      }
    }
    return false;
  }

  getNextActors() {
    this.currentActors.clear();
    let max = 0;
    let edge = false;
    this.currentInitiative = 0;

    for (const p of this.participants.items) {
      const effIni = p.getCurrentInitiative();
      if (!p.ooc && p.status === StatusEnum.Waiting && effIni > 0) {
        if (effIni > this.currentInitiative) {
          this.currentInitiative = effIni;
        }

        if ((effIni > max && (p.edge || !edge)) || (p.edge && !edge)) {
          this.currentActors.clear();
          this.currentActors.insert(p);
          edge = p.edge;
          max = effIni;
        } else if (effIni === max && edge === p.edge) {
          this.currentActors.insert(p);
        }
      }
    }
  }

  seizeInitiative(p: IParticipant) {
    p.seizeInitiative();
  }

  /**
   * Insert a participant into the encounter.
   *
   * @param carriesRunningScore `true` when the participant's running
   * Initiative Score is *already* correct for the current Initiative Pass -
   * i.e. this is not a genuine late entry but a re-insertion of an existing
   * participant (the GM component's in-place type swaps, and the shared-state
   * restore path, which reconstructs the Score from the broadcast value).
   * Those must not be decayed a second time: the pass decay is subtracted
   * once per elapsed pass, not twice (brief F6, p. 160).
   */
  addParticipant(participant: IParticipant, carriesRunningScore = false) {
    participant.sortOrder = this.nextSortOrder++;
    // Late entry into an in-progress Combat Turn: roll for Initiative Score
    // as normal, then subtract 10 for each Initiative Pass that has already
    // occurred (brief F6, p. 160). Under the old recompute-from-base
    // accessor this fell out of the global pass counter for free; with a
    // per-participant running Score it has to be seeded explicitly.
    if (this.started && this.initiativePass > 1 && !carriesRunningScore) {
      participant.applyInitiativeScoreDelta(
        -(this.initiativePass - 1) * INITIATIVE_PASS_DECAY);
    }
    this.participants.insert(participant);
  }

  copyParticipant(p: IParticipant) {
    const copy = p.clone();
    copy.edge = false;
    copy.active = false;
    copy.status = StatusEnum.Waiting;
    copy.waiting = false;
    copy.sortOrder = this.nextSortOrder++;

    const { base } = CombatManager.splitNameAndIndex(p.name);

    // Find the highest trailing number among all participants sharing this base name.
    let high = 0;
    for (const participant of this.participants.items) {
      const { base: participantBase, index } = CombatManager.splitNameAndIndex(participant.name);
      if (participantBase === base && index > high) {
        high = index;
      }
    }

    if (high === 0) {
      high++;
      p.name = base + " 1";
    }

    // Set the name for the Copy
    copy.name = `${base} ${high + 1}`;
    this.participants.insert(copy);
  }

  private static splitNameAndIndex(name: string): { base: string; index: number } {
    const match = name.match(/^(.*?) (\d+)$/);
    if (match) {
      return { base: match[1], index: Number(match[2]) };
    }
    return { base: name, index: 0 };
  }

  /**
   * Re-entrancy guard for `flagSpentNpcRows()`. `goToNextActors()` calls that
   * method as its first step, and the method may itself need to advance the
   * order when the participant that is currently acting turns out to be spent -
   * which must never re-enter `goToNextActors()` from inside its own pre-step,
   * or the newly-selected actors would immediately be marked `Finished` and
   * skipped.
   * Transient control state, not combat state: deliberately not routed through
   * `Undoable.Set`.
   */
  private advancingActors = false;

  /**
   * Called with every linked NPC row `flagSpentNpcRows()` has just found to be
   * newly spent, however that was triggered.
   *
   * There are two halves: the engine half (flag the row, pull it out of
   * `currentActors`, done here) and the GM-component half (log it —
   * ARCHITECTURE.md §7/§8). The second half has no business inside
   * `CombatManager`, but it must not depend on *which* caller triggered it:
   * this method also runs as `advanceToNextActors()`'s own pre-step, and a row
   * that went spent from there used to go silent. One listener, set by the GM
   * component, so both paths do exactly the same thing.
   *
   * Not routed through `Undoable.Set`: it is a wiring reference, not combat
   * state.
   */
  onSpentNpcRowsFlagged: ((rows: NpcRowParticipant[]) => void) | null = null;

  /**
   * Called once, on the `false -> true` transition of `passEnded`, naming the
   * Initiative Pass that just ended and the Combat Turn it ended within — see
   * `endInitiativePass()`. Not fired when that same transition also ends the
   * Combat Turn (`isOver()` true); `onCombatTurnEnded` covers that case alone
   * (brief "Action Log entries for combat structural boundaries", Open
   * Decision 2).
   *
   * Not routed through `Undoable.Set`: it is a wiring reference, not combat
   * state (same rationale as `onSpentNpcRowsFlagged` above).
   */
  onInitiativePassEnded: ((pass: number, turn: number) => void) | null = null;

  /**
   * Called from `endCombatTurn()`, before any of its mutations, naming the
   * Combat Turn that is ending (not the incremented value) — see
   * `endCombatTurn()`.
   *
   * Not routed through `Undoable.Set`: it is a wiring reference, not combat
   * state (same rationale as `onSpentNpcRowsFlagged` above).
   */
  onCombatTurnEnded: ((turn: number) => void) | null = null;

  /**
   * Pull any linked NPC row that can no longer act out of the current-actor
   * slot, and flag **only the ones taken out by damage** as out of combat.
   *
   * Two cases can leave a row with nobody left to act, and brief Decision 21
   * (`RULINGS.md` 2026-08-13, "Emptying a row by hand is not the same as
   * wiping it out") requires the tracker to tell them apart:
   *
   *  - **Wiped out by damage** (`NpcRowParticipant.isWipedOut`) — every
   *    member is still on the roster, all of them out of action. This is the
   *    case brief Decision 14 (`RULINGS.md` 2026-08-07, reversing Decision 8)
   *    was written for: the row **keeps its slot in the initiative order**,
   *    reads as out of combat through `NpcRowParticipant.ooc`, so
   *    `getNextActors()` skips it and the GM list styles it exactly like any
   *    other downed participant, and stays until the GM removes it with the
   *    ordinary per-row delete control. Nothing here deletes anything, so a
   *    member healed back up (Decision 13) still has a row to be healed back
   *    into.
   *  - **Emptied by hand** (removal or detaching the last member,
   *    `!isWipedOut && isSpent`) — the row cannot act either, because it has
   *    no members, but it must never be announced or styled as wiped out: no
   *    red flag, no `ooc`, no `spentFlagged`. It is left as a plain empty row
   *    for the GM to delete at leisure.
   *
   * A row the GM has created but not populated yet is left alone entirely
   * (`NpcRowParticipant.isSpent`).
   *
   * Either way, if the row that can no longer act is the participant
   * currently acting, it is pulled out of `currentActors` and the order is
   * advanced the same way `btnDelay_Click` advances when `currentActors`
   * empties - otherwise emptying the acting row (by damage or by hand) would
   * leave `currentActors` holding a participant that can no longer act, with
   * `passEnded` still false, and the tracker would stall with neither an
   * "Act" button nor a "Next Initiative Pass" button.
   *
   * Idempotent: the flag is remembered on the row (`spentFlagged`) so repeated
   * calls announce nothing, and it is cleared again if the row stops being
   * wiped out - healed back up (Decision 13), or reduced to an empty row by
   * removing its already-downed members by hand - so a second collapse is
   * announced afresh. The flag write goes through `Undoable.Set`, so it is
   * undoable like any other mutation; undo batching is the caller's
   * responsibility as everywhere else (ARCHITECTURE.md §4).
   *
   * @returns the rows that were *newly* flagged as wiped out, for logging.
   */
  flagSpentNpcRows(): NpcRowParticipant[] {
    const newlySpent: NpcRowParticipant[] = [];
    let wasActing = false;
    for (const p of this.participants.items.slice()) {
      if (!isNpcRow(p)) {
        continue;
      }
      if (!p.isSpent) {
        // Healed back up (Decision 13), or given a new NPC: announce it again
        // if it drops a second time.
        if (p.spentFlagged) {
          p.spentFlagged = false;
        }
        continue;
      }
      if (p.isWipedOut) {
        if (!p.spentFlagged) {
          p.spentFlagged = true;
          newlySpent.push(p);
        }
      } else if (p.spentFlagged) {
        // Was wiped out and flagged, then its downed members were removed by
        // hand until none were left - the row is a plain empty row now, not
        // a wiped-out one, so the flag comes back off (Decision 21).
        p.spentFlagged = false;
      }
      // A spent row cannot act, so it must not hold the slot even though it
      // stays in the list - true whether it is wiped out or just emptied.
      if (this.currentActors.remove(p)) {
        wasActing = true;
      }
    }
    if (newlySpent.length > 0 && this.onSpentNpcRowsFlagged) {
      // Before the advance, so the log reads in the order things happened: the
      // row goes down, then the next actor comes up.
      this.onSpentNpcRowsFlagged(newlySpent);
    }
    if (wasActing && this.currentActors.count === 0 && !this.advancingActors) {
      this.goToNextActors();
    }
    return newlySpent;
  }

  goToNextActors() {
    const reentrant = this.advancingActors;
    this.advancingActors = true;
    try {
      this.advanceToNextActors();
    } finally {
      this.advancingActors = reentrant;
    }
  }

  private advanceToNextActors() {
    // A row whose last member just dropped is flagged (and dropped out of
    // `currentActors`) before the next actor is picked, so it can never be
    // handed the initiative (Decision 14). Guarded above, so this can only flag
    // here - the advance itself is what the rest of this method does.
    this.flagSpentNpcRows();
    // Clear active participants
    if (this.currentActors.count > 0) {
      for (const a of this.currentActors.items) {
        a.status = StatusEnum.Finished;
      }
    }

    this.getNextActors();
    if (this.currentActors.count > 0) {
      for (const a of this.currentActors.items) {
        a.status = StatusEnum.Active;
      }
    } else {
      this.endInitiativePass();
    }
  }

  act(actor: IParticipant) {
    actor.status = StatusEnum.Finished;
    this.currentActors.remove(actor)
    if (this.currentActors.count === 0) {
      this.goToNextActors();
    }
  }

  removeParticipant(participant: IParticipant) {
    if (this.currentActors.contains(participant)) {
      // Remove sender from active Actors
      this.act(participant);
    }
    this.participants.remove(participant);
  }
}

export default new CombatManager()
