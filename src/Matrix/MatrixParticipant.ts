import { Participant, PARTICIPANT_BASE_BACKING_FIELDS } from "Combat/Participants/Participant";
import { IParticipant } from "Combat/Participants/IParticipant";
import { VRMode } from "./VRMode";

// Initiative Dice for the two VR interface modes: 3D6 cold-sim (printed
// p. 229), 4D6 hot-sim (printed p. 230).
//
// These are **absolute**, not additive: meat-side Initiative Dice
// augmentations do not stack onto the VR base (RULINGS.md, 2026-08-29 "VR
// Initiative Dice are absolute"). Deliberately unlike astral projection, which
// uses a *relative* delta (`ASTRAL_PROJECTION_DICE_DELTA`) so augmented dice
// survive. Do not refactor the two into one shared path.
//
// There is deliberately no AR constant. In AR the character uses their
// **normal physical** Initiative Dice, whatever those happen to be
// (pp. 159, 229, 231) - a decker with Wired Reflexes 2 rolls 3D6 in AR. The
// count is therefore a property of the character, not of the mode, and the
// old `AR_INITIATIVE_DICE = 1` silently truncated augmented deckers to 1D6 on
// every jack-out. `preVrDiceCount` below is what restores it instead.
const HOT_SIM_INITIATIVE_DICE = 4;
const COLD_SIM_INITIATIVE_DICE = 3;

/**
 * Sentinel stored value for "Data Processing has not been entered yet".
 *
 * A live persona's rules-reachable floor is 1 - Diffusion cannot reduce a
 * Matrix attribute below 1 (printed p. 252) - so no legitimate rating is ever
 * 0. RULINGS.md 2026-08-30 ("Data Processing is imported from a statblock
 * only where the book supplies one, and is blank otherwise") makes this
 * explicit: a stored 0 always means "unset", never a rated 0, and a
 * participant with this value derives no VR Initiative until the GM enters a
 * real one.
 */
export const DATA_PROCESSING_UNSET = 0;

/**
 * MatrixParticipant
 *
 * A decker (or persona) participating in the Matrix. Extends the standard
 * Participant so that it slots into the existing initiative tracker without
 * requiring engine changes. All mutable Matrix-specific properties follow the
 * standard convention: backing field _foo, getter, setter that assigns _foo
 * directly - required so clone() and PARTICIPANT_BASE_BACKING_FIELDS-style
 * type-swap helpers can copy fields by name.
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
  set attack(val: number) { this._attack = val; }

  private _sleaze: number;
  get sleaze(): number { return this._sleaze; }
  set sleaze(val: number) { this._sleaze = val; }

  private _dataProcessing: number;
  get dataProcessing(): number { return this._dataProcessing; }
  set dataProcessing(val: number) { this._dataProcessing = val; }

  private _firewall: number;
  get firewall(): number { return this._firewall; }
  set firewall(val: number) { this._firewall = val; }

  private _deviceRating: number;
  get deviceRating(): number { return this._deviceRating; }
  set deviceRating(val: number) { this._deviceRating = val; }

  // -- Matrix initiative state --
  private _vrMode: VRMode;
  get vrMode(): VRMode { return this._vrMode; }
  set vrMode(val: VRMode) { this._vrMode = val; }

  private _overwatch: number;
  get overwatch(): number { return this._overwatch; }
  set overwatch(val: number) { this._overwatch = val; }

  private _jackedIn: boolean;
  get jackedIn(): boolean { return this._jackedIn; }
  set jackedIn(val: boolean) { this._jackedIn = val; }

  // -- Catatonia / action restriction --
  // True when in VR. Decker stays scheduled; action planner gates physical
  // action categories. Does NOT set ooc.
  private _blocksPhysicalActions: boolean;
  get blocksPhysicalActions(): boolean { return this._blocksPhysicalActions; }
  set blocksPhysicalActions(val: boolean) { this._blocksPhysicalActions = val; }

  // -- Marks placed by this decker on Matrix targets --
  private _marksPlaced: Map<string, number>;
  get marksPlaced(): Map<string, number> { return this._marksPlaced; }
  set marksPlaced(val: Map<string, number>) { this._marksPlaced = val; }

  /**
   * The Initiative Dice count this participant had immediately before entering
   * a VR mode, or null when not in VR.
   *
   * Needed because the VR dice count is **absolute** (3D6/4D6, RULINGS.md
   * 2026-08-29) while the count it replaces is whatever the character actually
   * has. The app has no augmentation model - the GM types the character's
   * *total* Initiative Dice into `dices` directly - so an augmented decker's
   * row may legitimately read 3D6 before ever jacking in, and returning to AR
   * must put that number back rather than assume the 1D6 unaugmented base.
   *
   * Analogous in purpose to `AstralParticipant.projectionDiceGain`, but stores
   * an **absolute count to restore** rather than a realized delta to subtract,
   * because VR overwrites the count instead of adjusting it.
   */
  private _preVrDiceCount: number | null;
  get preVrDiceCount(): number | null { return this._preVrDiceCount; }
  set preVrDiceCount(val: number | null) { this._preVrDiceCount = val; }

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
    this._dataProcessing = DATA_PROCESSING_UNSET;
    this._firewall = 0;
    this._deviceRating = 0;
    this._vrMode = VRMode.None;
    this._overwatch = 0;
    this._jackedIn = false;
    this._blocksPhysicalActions = false;
    this._marksPlaced = new Map<string, number>();
    this._preVrDiceCount = null;
  }

  /**
   * Initiative Dice for a **VR** interface mode: 3D6 cold-sim (p. 229), 4D6
   * hot-sim (p. 230).
   *
   * Returns `null` for AR and None, which is not a failure case: in AR the
   * character keeps their own physical Initiative Dice (pp. 159, 229, 231), so
   * there is no mode-derived answer to give. The null return is deliberate -
   * it makes a caller handle the AR case explicitly rather than silently
   * receive `1` and clobber an augmented decker's dice, which is what the
   * previous signature did.
   */
  static initiativeDiceForMode(mode: VRMode): number | null {
    switch (mode) {
      case VRMode.HotSim:  return HOT_SIM_INITIATIVE_DICE;
      case VRMode.ColdSim: return COLD_SIM_INITIATIVE_DICE;
      default:             return null;
    }
  }

  /** True when this participant is in a VR mode (cold-sim or hot-sim). */
  static isVRMode(mode: VRMode): boolean {
    return mode === VRMode.ColdSim || mode === VRMode.HotSim;
  }

  /**
   * Apply a jack-in (or mid-combat mode switch) for this decker: the
   * Initiative attribute (DP + INT) and the VR catatonia flag.
   *
   * The dice-count half is *not* applied here directly - it is handed to the
   * mandatory `applyDiceCount` callback with the target count. That parameter
   * is required rather than optional on purpose: a mid-combat mode switch is a
   * dice change that has to roll the gained/lost dice and move the running
   * Initiative Score (brief F5, p. 160), while initial character setup must
   * not roll anything. Making the caller name which one it means is what stops
   * a call site from silently skipping the roll (the `onVRModeChange` defect).
   *
   * Pass `p.changeDiceCount(n, ...)` for a real mid-turn change, or
   * `p.setDicesWithoutRoll(n)` for construction/setup.
   *
   * If Data Processing is unset (`DATA_PROCESSING_UNSET`), this derives **no**
   * VR Initiative rather than the plausible-looking `0 + intuition`
   * (RULINGS.md 2026-08-30) - `baseIni` is left at the sentinel too, so a
   * caller/display reading `baseIni` sees the same "not derivable" signal
   * `getParticipantBaseInitiative()` produces for the same case.
   */
  applyJackInMode(mode: VRMode, intuition: number, applyDiceCount: (targetDiceCount: number) => void): void {
    const vrDice = MatrixParticipant.initiativeDiceForMode(mode);
    if (vrDice === null) {
      // AR (or None) is not a jack-in: its Initiative attribute is REA + INT
      // and its dice are the character's own, neither of which this method can
      // compute - it has no Reaction and no memory of the prior dice count.
      // The caller (`applyVRMode`) handles AR before reaching here; bailing
      // rather than falling through stops a future caller from silently
      // getting DP + INT and 1D6 for an AR decker.
      return;
    }
    this.vrMode = mode;
    this.baseIni = this.dataProcessing > DATA_PROCESSING_UNSET
      ? this.dataProcessing + intuition
      : DATA_PROCESSING_UNSET;
    this.jackedIn = true;
    this.blocksPhysicalActions = true;
    // Applied last so a caller that logs the resulting Score sees both halves
    // of the change (attribute delta + rolled dice delta) already folded in.
    applyDiceCount(vrDice);
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

    // Copy Participant base fields (mirrors Participant.clone()), including
    // the running Initiative Score backing fields.
    for (const f of PARTICIPANT_BASE_BACKING_FIELDS) {
      dst[f] = src[f];
    }
    // Mirrors Participant.clone(): the copy gets no action history, so the
    // Initiative already spent on Interrupt Actions is folded into its
    // running Score rather than refunded (brief F9, p. 167).
    dst["_currentInitiativeScore"] = this.getCurrentInitiative();
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
    clone._preVrDiceCount = this._preVrDiceCount;

    return clone;
  }
}
