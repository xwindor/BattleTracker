import { Undoable } from "Common";
import { ParticipantList } from "./Participants/ParticipantList";
import { StatusEnum } from "./Participants/StatusEnum";
import { IParticipant } from "./Participants/IParticipant";

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

  nextIniPass() {
    this.passEnded = false;
    this.initiativePass++;
    for (const p of this.participants.items) {
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

  hasMoreIniPasses() {
    for (const p of this.participants.items) {
      if (p.getCurrentInitiative() - 10 > 0 && !p.ooc) {
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

  addParticipant(participant: IParticipant) {
    participant.sortOrder = this.nextSortOrder++;
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
