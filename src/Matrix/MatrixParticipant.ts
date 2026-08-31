import { Participant, PARTICIPANT_BASE_BACKING_FIELDS } from "Combat/Participants/Participant";
import { IParticipant } from "Combat/Participants/IParticipant";
import { VRMode } from "./VRMode";

// Initiative Dice per Matrix interface mode (brief "Precise Definitions",
// printed p. 159).
const HOT_SIM_INITIATIVE_DICE = 4;
const COLD_SIM_INITIATIVE_DICE = 3;
const AR_INITIATIVE_DICE = 1;

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
  }

  /**
   * Initiative Dice for a Matrix interface mode (brief "Precise Definitions",
   * printed p. 159): 1D6 Matrix AR, 3D6 cold-sim, 4D6 hot-sim.
   */
  static initiativeDiceForMode(mode: VRMode): number {
    switch (mode) {
      case VRMode.HotSim:  return HOT_SIM_INITIATIVE_DICE;
      case VRMode.ColdSim: return COLD_SIM_INITIATIVE_DICE;
      case VRMode.AR:
      default:             return AR_INITIATIVE_DICE;
    }
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
    this.vrMode = mode;
    this.baseIni = this.dataProcessing > DATA_PROCESSING_UNSET
      ? this.dataProcessing + intuition
      : DATA_PROCESSING_UNSET;
    this.jackedIn = true;
    this.blocksPhysicalActions = (mode !== VRMode.AR);
    // Applied last so a caller that logs the resulting Score sees both halves
    // of the change (attribute delta + rolled dice delta) already folded in.
    applyDiceCount(MatrixParticipant.initiativeDiceForMode(mode));
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

    return clone;
  }
}
