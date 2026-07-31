import { Undoable } from "Common";
import { ParticipantList } from "./Participants/ParticipantList";
import { StatusEnum } from "./Participants/StatusEnum";
import { IParticipant } from "./Participants/IParticipant";
import { INITIATIVE_PASS_DECAY } from "./Participants/Participant";

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
    }
  }

  endCombatTurn() {
    this.initiativePass = 1;
    this.combatTurn++;
    this.currentInitiative = NaN;
    for (const p of this.participants.items) {
      p.softReset();
    }
    this.started = false;
  }

  endInitiativePass() {
    this.passEnded = true;
    if (this.isOver()) {
      this.endCombatTurn();
      return;
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

  goToNextActors() {
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
