import { MatrixParticipant } from "./MatrixParticipant";
import { ICType } from "./ICType";
import { IParticipant } from "Combat/Participants/IParticipant";

// IC Initiative Dice (existing Matrix-module values, Table 4 / Table 24 - not
// covered by this feature's brief; unchanged by this refactor).
const PATROL_IC_DICE = 2;
const IC_DICE = 4;

/**
 * ICParticipant
 *
 * Intrusion Countermeasure (IC) participant. Bridges a Matrix target and an
 * initiative-tracker entry. Uses the Matrix initiative formula
 * (baseIni = hostRating * 2; dices = 2 for Patrol IC, 4 for everything else).
 */
export class ICParticipant extends MatrixParticipant {

  private _icType: ICType;
  get icType(): ICType { return this._icType; }
  set icType(val: ICType) { this.Set("icType", val); }

  private _hostRating: number;
  get hostRating(): number { return this._hostRating; }
  set hostRating(val: number) { this.Set("hostRating", val); }

  private _linkedTargetId: string;
  get linkedTargetId(): string { return this._linkedTargetId; }
  set linkedTargetId(val: string) { this.Set("linkedTargetId", val); }

  constructor(icType: ICType = ICType.Patrol, hostRating = 1, linkedTargetId = "") {
    super();
    this._icType = icType;
    this._hostRating = hostRating;
    this._linkedTargetId = linkedTargetId;

    // Per Table 4 / Table 24: baseIni = hostRating × 2;
    // dices = 2 for Patrol, 4 for everything else.
    this.baseIni = hostRating * 2;
    // One-time construction: nothing has been rolled yet, so no dice change is
    // owed - but the write still goes through the capped no-roll setter so the
    // 5D6 hard cap is enforced universally (brief criterion 9, pp. 52/288).
    this.setDicesWithoutRoll((icType === ICType.Patrol) ? PATROL_IC_DICE : IC_DICE);
  }

  override clone(): IParticipant {
    const baseClone = super.clone() as MatrixParticipant;
    const clone = new ICParticipant(this._icType, this._hostRating, this._linkedTargetId);

    // Copy state copied by the parent clone() (we re-use the base/matrix copy
    // by syncing the underscore fields). Easiest: copy the underscore fields
    // off baseClone onto our new ICParticipant.
    const src = baseClone as unknown as Record<string, unknown>;
    const dst = clone as unknown as Record<string, unknown>;
    for (const key of Object.keys(src)) {
      // Don't overwrite IC-specific underscore fields with undefined values
      if (key === "_icType" || key === "_hostRating" || key === "_linkedTargetId") {
        continue;
      }
      dst[key] = src[key];
    }
    return clone;
  }
}
