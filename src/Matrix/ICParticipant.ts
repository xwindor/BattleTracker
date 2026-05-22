import { MatrixParticipant } from "./MatrixParticipant";
import { ICType } from "./ICType";
import { IParticipant } from "Combat/Participants/IParticipant";

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

  /** ID of the MatrixHost this IC belongs to (for mark propagation). */
  private _linkedHostId: string;
  get linkedHostId(): string { return this._linkedHostId; }
  set linkedHostId(val: string) { this.Set("linkedHostId", val); }

  constructor(icType: ICType = ICType.Patrol, hostRating = 1, linkedTargetId = "") {
    super();
    this._icType = icType;
    this._hostRating = hostRating;
    this._linkedTargetId = linkedTargetId;
    this._linkedHostId = "";

    // SR5E p.247: baseIni = hostRating × 2; dices = 2 for Patrol, 4 for all others.
    this.baseIni = hostRating * 2;
    this.dices = (icType === ICType.Patrol) ? 2 : 4;

    // Matrix CM formula: 8 + ceil(hostRating / 2). Stored as physicalHealth.
    this.physicalHealth = 8 + Math.ceil(hostRating / 2);
  }

  /** True when the Matrix condition monitor is full. */
  get isBricked(): boolean {
    return this.physicalDamage >= this.physicalHealth;
  }

  override clone(): IParticipant {
    const baseClone = super.clone() as MatrixParticipant;
    const clone = new ICParticipant(this._icType, this._hostRating, this._linkedTargetId);

    const src = baseClone as unknown as Record<string, unknown>;
    const dst = clone as unknown as Record<string, unknown>;
    for (const key of Object.keys(src)) {
      if (key === "_icType" || key === "_hostRating" || key === "_linkedTargetId" || key === "_linkedHostId") {
        continue;
      }
      dst[key] = src[key];
    }
    clone._linkedHostId = this._linkedHostId;
    return clone;
  }
}
