import {
  Participant,
  PARTICIPANT_BASE_BACKING_FIELDS,
  PHYSICAL_INITIATIVE_DICE
} from "Combat/Participants/Participant";
import { IParticipant } from "Combat/Participants/IParticipant";

/**
 * Base Initiative Dice for Astral initiative. The Initiative Attribute Chart
 * gives Astral as Intuition x 2 with **2D6** base Initiative Dice, against
 * 1D6 for Physical (brief "Precise Definitions", printed p. 159).
 */
export const ASTRAL_INITIATIVE_DICE = 2;

/**
 * Dice-count change applied when a magician projects into astral space (and,
 * negated, when they return): "a magician with 1d6 Initiative dice who takes
 * his first action to astrally project (2d6 Base Initiative Dice) gains the
 * die (and the change in Initiative) for their Astral Initiative during that
 * Combat Turn" (brief "Astral projection mid-turn", printed p. 160).
 *
 * Deliberately a **relative** delta rather than an absolute count: a magician
 * already carrying bonus Initiative Dice from another source (Increase
 * Reflexes, wired reflexes, a drug) must keep them, and an absolute "set to 2"
 * would clobber that. The 5D6 hard cap still applies at the write site
 * (pp. 52/288).
 */
export const ASTRAL_PROJECTION_DICE_DELTA = ASTRAL_INITIATIVE_DICE - PHYSICAL_INITIATIVE_DICE;

/**
 * AstralParticipant
 *
 * An Awakened character who can enter astral space. Extends the standard
 * Participant so it slots into the existing initiative tracker without
 * engine changes. While astralProjecting is true:
 *   - baseIni uses INT × 2 instead of REA + INT
 *   - the Initiative Dice count is one higher than the character's physical
 *     count (Astral base is 2D6 against Physical's 1D6, p. 159); projecting
 *     mid-turn gains that die, rolls it and adds it to the running Initiative
 *     Score, and returning loses it the same way (p. 160)
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

  /**
   * How many Initiative Dice this participant *actually* gained when they
   * projected - which is not always `ASTRAL_PROJECTION_DICE_DELTA`. A magician
   * already at the 5D6 hard cap (pp. 52/288) gains nothing: the cap absorbs the
   * die, no die is rolled and the running Score does not move.
   *
   * Returning from astral space is a dice *decrease*, and a decrease "rolls the
   * number of lost dice and subtracts the total" (brief F5 / criterion 8,
   * printed p. 160) - you only roll and subtract dice you actually lose. So the
   * return trip has to give back exactly what the outbound trip realized, which
   * means recording it here rather than re-applying the constant blind.
   *
   * 0 while not projecting, and 0 while projecting if the cap absorbed the gain.
   * Undoable like every other field, so undoing the toggle restores it.
   */
  private _projectionDiceGain: number;
  get projectionDiceGain(): number { return this._projectionDiceGain; }
  set projectionDiceGain(val: number) { this.Set("projectionDiceGain", val); }

  constructor() {
    super();
    this._astralProjecting = false;
    this._blocksPhysicalActions = false;
    this._projectionDiceGain = 0;
  }

  override clone(): IParticipant {
    const clone = new AstralParticipant();
    const src = this as unknown as Record<string, unknown>;
    const dst = clone as unknown as Record<string, unknown>;
    // Includes the running Initiative Score backing fields.
    for (const f of PARTICIPANT_BASE_BACKING_FIELDS) {
      dst[f] = src[f];
    }
    // Mirrors Participant.clone(): the copy gets no action history, so the
    // Initiative already spent on Interrupt Actions is folded into its
    // running Score rather than refunded (brief F9, p. 167).
    dst["_currentInitiativeScore"] = this.getCurrentInitiative();
    dst["_actionHistory"] = [];
    clone._astralProjecting = this._astralProjecting;
    clone._blocksPhysicalActions = this._blocksPhysicalActions;
    // The copy is projecting if the source was, so it owes back the same
    // realized dice gain when it returns (p. 160).
    clone._projectionDiceGain = this._projectionDiceGain;
    return clone;
  }
}
