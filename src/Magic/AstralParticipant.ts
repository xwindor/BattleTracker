import {
  Participant,
  PARTICIPANT_BASE_BACKING_FIELDS,
  PHYSICAL_INITIATIVE_DICE
} from "Combat/Participants/Participant";
import { IParticipant } from "Combat/Participants/IParticipant";

/**
 * Base Initiative Dice for Astral initiative: an ABSOLUTE total dice count
 * (compare `PHYSICAL_INITIATIVE_DICE = 1`), not a bonus on top of the
 * physical base. The Astral Attributes Table (printed p. 314,
 * `rules/pages/p0316.txt`) gives Astral Initiative as Intuition x 2 with
 * "Initiative Dice +2D6 (3D6 total)" - a base 1D6 plus two, for three dice
 * total. RULINGS 2026-08-30 (see RULINGS.md) resolves this against the
 * tracker's prior (wrong) reading of a 2D6 base, drawn from the p. 159
 * Initiative Attribute Chart, which conflicts with p. 314. The printed PR 2
 * wagemage statblock's "Astral Initiative 8 + 3D6" agrees with p. 314 and is
 * not a misprint.
 */
export const ASTRAL_INITIATIVE_DICE = 3;

/**
 * Dice-count change applied when a magician projects into astral space (and,
 * negated, when they return).
 *
 * Item 3 fix (fix round 3): the comment this replaced quoted printed p. 160
 * (`rules/pages/p0162.txt`) as "(3d6 total Astral Initiative Dice) gains the
 * two dice" - that quotation was fabricated. The page's own worked example
 * describes a magician who "(2d6 Base Initiative Dice) gains the die"
 * (singular), per RULINGS.md's own citation of it (2026-07-31 entry, and the
 * 2026-08-30 entry's "Why" section: 'worked example: a projecting magician
 * "gains the die", singular'). Verified fresh against
 * `rules/pages/p0162.txt` line 53, 2026-08-30 (fix round 4): the page reads
 * "gains the die", singular, exactly as quoted above.
 *
 * RULINGS.md 2026-08-30 ("Astral Initiative is 3D6 total, not 2D6")
 * overrides the page-160 reading regardless: it rules for the printed p. 314
 * total (3D6) over the p. 159/160 reading (2D6), so this delta is 2, not 1,
 * and `ASTRAL_INITIATIVE_DICE` above is an absolute 3, not 2. Xavier's
 * ruling deliberately overrides the majority (2D6-in-three-places) printed
 * text; see that entry for the full "why".
 *
 * Deliberately a **relative** delta rather than an absolute count: a magician
 * already carrying bonus Initiative Dice from another source (Increase
 * Reflexes, wired reflexes, a drug) must keep them, and an absolute "set to 3"
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
 *   - the Initiative Dice count is two higher than the character's physical
 *     count (Astral base is 3D6 total against Physical's 1D6, printed p. 314,
 *     `rules/pages/p0316.txt`; RULINGS 2026-08-30); projecting mid-turn gains
 *     those two dice, rolls them and adds the result to the running
 *     Initiative Score, and returning loses them the same way (p. 160)
 *   - blocksPhysicalActions gates physical action categories (same
 *     semantics as MatrixParticipant's VR catatonia flag)
 *   - The physical body remains in the initiative order; the participant
 *     is NOT removed from scheduling
 */
export class AstralParticipant extends Participant {

  readonly isAwakened = true;

  private _astralProjecting: boolean;
  get astralProjecting(): boolean { return this._astralProjecting; }
  set astralProjecting(val: boolean) { this._astralProjecting = val; }

  private _blocksPhysicalActions: boolean;
  get blocksPhysicalActions(): boolean { return this._blocksPhysicalActions; }
  set blocksPhysicalActions(val: boolean) { this._blocksPhysicalActions = val; }

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
   */
  private _projectionDiceGain: number;
  get projectionDiceGain(): number { return this._projectionDiceGain; }
  set projectionDiceGain(val: number) { this._projectionDiceGain = val; }

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
