import { Participant } from "Combat/Participants/Participant";
import { IParticipant } from "Combat/Participants/IParticipant";

/**
 * AstralParticipant
 *
 * An Awakened character who can enter astral space. Extends the standard
 * Participant so it slots into the existing initiative tracker without
 * engine changes. While astralProjecting is true:
 *   - baseIni uses INT × 2 instead of REA + INT
 *   - dices stays at 1d6 (astral initiative: INT×2 + 1d6)
 *   - blocksPhysicalActions gates physical action categories (same
 *     semantics as MatrixParticipant's VR catatonia flag)
 *   - The physical body remains in the initiative order; the participant
 *     is NOT removed from scheduling
 */
export class AstralParticipant extends Participant {

  readonly isAwakened = true;

  private _astralProjecting: boolean;
  get astralProjecting(): boolean { return this._astralProjecting; }
  set astralProjecting(val: boolean) { this.Set("astralProjecting", val); }

  private _blocksPhysicalActions: boolean;
  get blocksPhysicalActions(): boolean { return this._blocksPhysicalActions; }
  set blocksPhysicalActions(val: boolean) { this.Set("blocksPhysicalActions", val); }

  constructor() {
    super();
    this._astralProjecting = false;
    this._blocksPhysicalActions = false;
  }

  override clone(): IParticipant {
    const clone = new AstralParticipant();
    const src = this as unknown as Record<string, unknown>;
    const dst = clone as unknown as Record<string, unknown>;
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
    clone._astralProjecting = this._astralProjecting;
    clone._blocksPhysicalActions = this._blocksPhysicalActions;
    return clone;
  }
}
