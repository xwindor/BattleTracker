import { Participant } from "Combat/Participants/Participant";
import { IParticipant } from "Combat/Participants/IParticipant";
import { VRMode } from "./VRMode";

/**
 * MatrixParticipant
 *
 * A decker (or persona) participating in the Matrix. Extends the standard
 * Participant so that it slots into the existing initiative tracker without
 * requiring engine changes. All mutable Matrix-specific properties are
 * Undoable: backing field _foo, getter, setter that calls this.Set('foo', val).
 *
 * Important: blocksPhysicalActions is the VR-catatonia gate. The decker stays
 * in the initiative order at their Matrix initiative; the action planner is
 * what actually hides physical actions when this flag is true. We do NOT
 * touch the existing ooc flag (which would remove them from scheduling).
 */
export class MatrixParticipant extends Participant {

  // -- Deck attributes (ASDF) --
  private _attack: number;
  get attack(): number { return this._attack; }
  set attack(val: number) { this.Set("attack", val); }

  private _sleaze: number;
  get sleaze(): number { return this._sleaze; }
  set sleaze(val: number) { this.Set("sleaze", val); }

  private _dataProcessing: number;
  get dataProcessing(): number { return this._dataProcessing; }
  set dataProcessing(val: number) { this.Set("dataProcessing", val); }

  private _firewall: number;
  get firewall(): number { return this._firewall; }
  set firewall(val: number) { this.Set("firewall", val); }

  private _deviceRating: number;
  get deviceRating(): number { return this._deviceRating; }
  set deviceRating(val: number) { this.Set("deviceRating", val); }

  // -- Matrix initiative state --
  private _vrMode: VRMode;
  get vrMode(): VRMode { return this._vrMode; }
  set vrMode(val: VRMode) { this.Set("vrMode", val); }

  private _overwatch: number;
  get overwatch(): number { return this._overwatch; }
  set overwatch(val: number) { this.Set("overwatch", val); }

  private _jackedIn: boolean;
  get jackedIn(): boolean { return this._jackedIn; }
  set jackedIn(val: boolean) { this.Set("jackedIn", val); }

  // -- Catatonia / action restriction --
  // True when in VR. Decker stays scheduled; action planner gates physical
  // action categories. Does NOT set ooc.
  private _blocksPhysicalActions: boolean;
  get blocksPhysicalActions(): boolean { return this._blocksPhysicalActions; }
  set blocksPhysicalActions(val: boolean) { this.Set("blocksPhysicalActions", val); }

  // -- Marks placed by this decker on Matrix targets --
  private _marksPlaced: Map<string, number>;
  get marksPlaced(): Map<string, number> { return this._marksPlaced; }
  set marksPlaced(val: Map<string, number>) { this.Set("marksPlaced", val); }

  /**
   * Computed Overwatch alert level used by components for CSS styling.
   *  - 'none'        : OS  < 20
   *  - 'ic-alert'    : OS >= 20
   *  - 'convergence' : OS >= 40
   */
  get overwatchAlert(): "none" | "ic-alert" | "convergence" {
    if (this._overwatch >= 40) return "convergence";
    if (this._overwatch >= 20) return "ic-alert";
    return "none";
  }

  constructor() {
    super();
    this._attack = 0;
    this._sleaze = 0;
    this._dataProcessing = 0;
    this._firewall = 0;
    this._deviceRating = 0;
    this._vrMode = VRMode.AR;
    this._overwatch = 0;
    this._jackedIn = false;
    this._blocksPhysicalActions = false;
    this._marksPlaced = new Map<string, number>();
  }

  /**
   * Apply a jack-in (or mid-combat mode switch) for this decker.
   * Recomputes baseIni and dices per Table 24 (4/3/1 d6) and flips the
   * VR catatonia flag. The caller is responsible for re-rolling initiative
   * if combat is already in progress.
   */
  applyJackInMode(mode: VRMode, intuition: number): void {
    this.vrMode = mode;
    let dice: number;
    switch (mode) {
      case VRMode.HotSim:  dice = 4; break;
      case VRMode.ColdSim: dice = 3; break;
      case VRMode.AR:
      default:             dice = 1; break;
    }
    this.dices = dice;
    this.baseIni = this.dataProcessing + intuition;
    this.jackedIn = true;
    this.blocksPhysicalActions = (mode !== VRMode.AR);
  }

  /**
   * Override clone() so that copyParticipant() in CombatManager preserves
   * Matrix fields (Table 14 gotcha — the base impl returns a Participant
   * and would silently strip these).
   *
   * Implementation note: Participant uses `private` backing fields, so we
   * cannot assign to them directly from a subclass. We instead bracket-cast
   * through the runtime object and copy the underscore fields verbatim.
   * This is safe because the constructor (super → this) has already
   * initialised all backing fields on the new instance.
   */
  override clone(): IParticipant {
    const clone: MatrixParticipant = new MatrixParticipant();
    const src = this as unknown as Record<string, unknown>;
    const dst = clone as unknown as Record<string, unknown>;

    // Copy Participant base fields (mirrors Participant.clone()).
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

    // Copy Matrix fields
    clone._attack = this._attack;
    clone._sleaze = this._sleaze;
    clone._dataProcessing = this._dataProcessing;
    clone._firewall = this._firewall;
    clone._deviceRating = this._deviceRating;
    clone._vrMode = this._vrMode;
    clone._overwatch = this._overwatch;
    clone._jackedIn = this._jackedIn;
    clone._blocksPhysicalActions = this._blocksPhysicalActions;
    clone._marksPlaced = new Map(this._marksPlaced);

    return clone;
  }
}
