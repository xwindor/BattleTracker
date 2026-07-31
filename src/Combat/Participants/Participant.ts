import { Undoable, UndoHandler } from "Common";
// Imported directly rather than through the "Combat" barrel: CombatManager
// now imports this module for INITIATIVE_PASS_DECAY, and going through the
// barrel would reintroduce an import cycle.
import { StatusEnum } from "./StatusEnum";
import { Action } from "Interfaces/Action";
import { IParticipant } from "./IParticipant";

/**
 * Amount subtracted from every participant's running Initiative Score at the
 * end of each Initiative Pass. Brief "Running Initiative Score Across Passes"
 * F2 / acceptance criterion 2, printed pp. 159-160.
 */
export const INITIATIVE_PASS_DECAY = 10;

/**
 * Minimum Initiative Dice: everyone has at least one Initiative Die (brief
 * "Precise Definitions" / F1, printed p. 159).
 */
export const MIN_INITIATIVE_DICE = 1;

/**
 * Hard cap on Initiative Dice: "Everyone has one and can gain up to four more,
 * hard cap 5D6" (brief "Precise Definitions" / acceptance criterion 9, printed
 * pp. 52 and 288). Enforced in exactly one place - `clampInitiativeDiceCount()`
 * below - so every write path inherits it.
 */
export const MAX_INITIATIVE_DICE = 5;

/**
 * Base Initiative Dice for Physical initiative, i.e. what a participant drops
 * back to when they lose a deck / astral form (brief "Precise Definitions":
 * "Base is 1D6 Physical", printed p. 159).
 */
export const PHYSICAL_INITIATIVE_DICE = 1;

/**
 * Display floor for a participant's rolled Initiative Dice total. Purely a UI
 * concern (0 means "has not rolled yet"); it is *not* a floor on the running
 * Initiative Score, which has none - the book keeps subtracting past zero
 * (brief F3 / criterion 3, printed p. 160, p. 191). Lives here rather than in
 * the GM component because `changeDiceCount()` below is what has to apply the
 * floored-off remainder as a separate Score delta.
 */
export const MIN_DISPLAYED_DICE_TOTAL = 1;

/** Faces on an Initiative Die. */
const INITIATIVE_DIE_FACES = 6;

/** Roll one Initiative Die (1..6). The default roller for `changeDiceCount`. */
export function rollInitiativeDie(): number {
  return Math.floor(Math.random() * INITIATIVE_DIE_FACES) + 1;
}

/**
 * Normalise an Initiative Dice count to a whole number inside
 * [MIN_INITIATIVE_DICE, MAX_INITIATIVE_DICE]. The single enforcement point for
 * the 5D6 hard cap (brief criterion 9, pp. 52/288): both `dices` write paths
 * (`setDicesWithoutRoll` and `changeDiceCount`) go through it, so no caller can
 * exceed the cap.
 */
export function clampInitiativeDiceCount(val: number): number {
  const normalized = Math.floor(Number(val));
  if (!Number.isFinite(normalized)) {
    return MIN_INITIATIVE_DICE;
  }
  return Math.max(MIN_INITIATIVE_DICE, Math.min(MAX_INITIATIVE_DICE, normalized));
}

/**
 * Outcome of a dice-count change: the individual dice rolled for the delta and
 * the signed total applied to the running Initiative Score. `values` is empty
 * and `delta` is 0 when no roll was required (no Initiative Test yet this
 * Combat Turn, or the count did not actually change).
 */
export interface DiceCountChangeResult {
  values: number[];
  delta: number;
}

/** Shared "nothing was rolled" result. */
export const NO_DICE_COUNT_CHANGE: DiceCountChangeResult = { values: [], delta: 0 };

/**
 * Backing-field names of every `Participant` field that a clone / in-place
 * type swap has to carry over. Kept in one place because
 * `MatrixParticipant.clone()`, `AstralParticipant.clone()` and the GM
 * component's promote/demote helpers all copy the same set by name and would
 * otherwise silently drift (and, since the running Initiative Score now lives
 * in a backing field, silently reset a participant's score mid-turn).
 */
export const PARTICIPANT_BASE_BACKING_FIELDS = [
  "_active", "_baseIni", "_diceIni", "_dices", "_edge", "_finished",
  "_name", "_ooc", "_overflowHealth", "_painTolerance", "_physicalDamage",
  "_physicalHealth", "_status", "_stunDamage", "_stunHealth", "_waiting",
  "_hasPainEditor", "_sortOrder",
  "_currentInitiativeScore", "_appliedInitiativeAttribute"
];

export class Participant extends Undoable implements IParticipant {

  get name(): string {
    return this._name;
  }

  set name(val: string) {
    this.Set("name", val);
  }

  get waiting(): boolean {
    return this._waiting;
  }

  set waiting(val: boolean) {
    this.Set("waiting", val);
  }

  get finished(): boolean {
    return this._finished;
  }

  set finished(val: boolean) {
    this.Set("finished", val);
  }

  get active(): boolean {
    return this._active;
  }

  set active(val: boolean) {
    this.Set("active", val);
  }

  get baseIni(): number {
    return this._baseIni;
  }

  set baseIni(val: number) {
    this.Set("baseIni", val);
    // A change to the Initiative attribute applies as a same-sized delta to
    // the running Initiative Score (brief F4, p. 160).
    this.syncInitiativeAttribute();
  }

  get diceIni(): number {
    return this._diceIni;
  }

  /**
   * Sum of the Initiative Dice rolled for this Combat Turn. Assigning it
   * moves the running Initiative Score by the difference only:
   *  - 0 -> n is the once-per-turn Initiative Test (brief F1, p. 159): the
   *    Score becomes Initiative attribute + dice result.
   *  - n -> m mid-turn is a dice change: only the delta is added or
   *    subtracted, never a recompute (brief F5, p. 160).
   */
  set diceIni(val: number) {
    const previous = this._diceIni;
    this.Set("diceIni", val);
    if (this._diceIni !== previous) {
      this.applyInitiativeScoreDelta(this._diceIni - previous);
    }
  }

  /**
   * Write the rolled-dice total *without* moving the running Initiative
   * Score. For display/bounds clamping only (e.g. keeping `diceIni` within
   * `dices * 6` after an unrelated field edit). The Score only ever moves
   * when dice are actually rolled (brief F5, p. 160), so a cosmetic clamp
   * must not become a silent Score change.
   */
  setDiceIniWithoutScoreChange(val: number) {
    this.Set("diceIni", val);
  }

  /**
   * The participant's Initiative Dice count. Deliberately read-only: there is
   * no plain setter, because assigning a new count mid-turn is a *rules event*
   * that has to roll the gained/lost dice and move the running Initiative
   * Score (brief F5 / criteria 7-8, p. 160). Write it through
   * `changeDiceCount()` (a real change) or `setDicesWithoutRoll()`
   * (construction / restore / reset, where no roll is owed). Removing the
   * setter is what makes "forgot to roll the delta" a compile error rather
   * than a silent Score bug.
   */
  get dices(): number {
    return this._dices;
  }

  /**
   * Write the Initiative Dice count *without* rolling anything and without
   * moving the running Initiative Score. Follows the same convention as
   * `setDiceIniWithoutScoreChange`: for the cases that are not a mid-turn dice
   * change - object construction, `hardReset()`, rebuilding a participant from
   * broadcast state, and initial character setup from `register_character`.
   * The 5D6 hard cap still applies (brief criterion 9, pp. 52/288).
   */
  setDicesWithoutRoll(val: number) {
    this.Set("dices", clampInitiativeDiceCount(val));
  }

  /**
   * Change the Initiative Dice count as a mid-turn rules event
   * (brief F5 / criteria 7-8, p. 160).
   *
   *  - The new count is clamped to the 5D6 hard cap (criterion 9, pp. 52/288).
   *  - If the participant has not taken their once-per-Combat-Turn Initiative
   *    Test yet (`diceIni <= 0`), or the count does not actually change, the
   *    count is simply written: nothing to roll, no Score movement.
   *  - Otherwise only the *changed* dice are rolled - never the whole pool -
   *    and the full rolled total is added (gain) or subtracted (loss) from the
   *    running Initiative Score.
   *
   * `diceIni` is also a display field with a floor of `MIN_DISPLAYED_DICE_TOTAL`,
   * so when a decrease would push it below that floor the floored-off remainder
   * is applied to the Score as a separate delta instead of being silently lost.
   *
   * All writes go through `Set` / `applyInitiativeScoreDelta`, so the whole
   * change is undoable like any other mutation.
   *
   * @param rollDie injected single-die roller, so callers (and tests) can
   *                supply a deterministic sequence.
   * @returns the individual rolled values and the signed total applied, for
   *          logging. `NO_DICE_COUNT_CHANGE` when nothing was rolled.
   */
  changeDiceCount(newDices: number, rollDie: () => number = rollInitiativeDie): DiceCountChangeResult {
    const clamped = clampInitiativeDiceCount(newDices);
    const previousCount = this._dices;
    if (this._diceIni <= 0 || clamped === previousCount) {
      this.setDicesWithoutRoll(clamped);
      return { values: [], delta: 0 };
    }

    const diceDelta = clamped - previousCount;
    const values: number[] = [];
    for (let i = 0; i < Math.abs(diceDelta); i++) {
      values.push(rollDie());
    }
    const sum = values.reduce((total, v) => total + v, 0);
    const signed = diceDelta > 0 ? sum : -sum;

    this.setDicesWithoutRoll(clamped);

    const target = this._diceIni + signed;
    const displayed = Math.max(MIN_DISPLAYED_DICE_TOTAL, target);
    // The `diceIni` setter moves the Score by (displayed - previous); the
    // remainder below the display floor is applied separately so the *full*
    // rolled total always reaches the Score.
    this.diceIni = displayed;
    this.applyInitiativeScoreDelta(target - displayed);

    return { values, delta: signed };
  }

  get hasPainEditor(): boolean {
    return this._hasPainEditor;
  }

  set hasPainEditor(val: boolean) {
    this.Set("hasPainEditor", val);
    // Toggling the Pain Editor changes the wound modifier and therefore the
    // Initiative attribute (brief p. 160, p. 169).
    this.syncInitiativeAttribute();
  }

  /**
   * The current running Initiative Score (brief: "one mutable
   * currentInitiativeScore per participant per Combat Turn", p. 159-160).
   * Seeded once per Combat Turn by the Initiative Test and thereafter only
   * ever moved by signed deltas. Never recomputed from a base.
   */
  get currentInitiativeScore(): number {
    return this._currentInitiativeScore;
  }

  set currentInitiativeScore(val: number) {
    this.Set("currentInitiativeScore", val);
  }

  /**
   * The Initiative attribute value that is currently folded into
   * `currentInitiativeScore`. Used to turn an attribute change into a
   * one-time same-sized Score delta (brief F4, p. 160) instead of a
   * recompute.
   */
  get appliedInitiativeAttribute(): number {
    return this._appliedInitiativeAttribute;
  }

  set appliedInitiativeAttribute(val: number) {
    this.Set("appliedInitiativeAttribute", val);
  }

  /**
   * Live Initiative attribute: the participant's base Initiative (Reaction +
   * Intuition, or the mode-appropriate formula set by subclasses) reduced by
   * the wound modifier. Wound modifiers hit the attribute, not the Score
   * directly, so that they propagate (brief p. 160, p. 169).
   */
  get initiativeAttribute(): number {
    return this.baseIni - this.wm;
  }

  get wm(): number {
    // Pain Editor Exception
    if (this.hasPainEditor) {
      return 0;
    }

    let physicalWM = Math.floor((this.physicalDamage - this.painTolerance) / 3);
    if (physicalWM < 0) {
      physicalWM = 0;
    }
    let stunWM = Math.floor((this.stunDamage - this.painTolerance) / 3);
    if (stunWM < 0) {
      stunWM = 0;
    }
    return physicalWM + stunWM;
  }

  get ooc(): boolean {
    // Handle Manual out of Combat
    // TODO maybe make manual out of combat an extra property and style it accordingly
    if (this._ooc) {
      return true;
    }

    // Pain Editor Exception
    if (this.hasPainEditor) {
      return this.physicalDamage >= this.physicalHealth;
    }

    return this.physicalDamage >= this.physicalHealth || this.stunDamage >= this.stunHealth;
  }

  set ooc(val: boolean) {
    this.Set("ooc", val);
  }

  get edge(): boolean {
    return this._edge;
  }

  set edge(val: boolean) {
    this.Set("edge", val);
  }

  get status(): StatusEnum {
    return this._status;
  }

  set status(val: StatusEnum) {
    this.Set("status", val);
  }

  get actionHistory(): Action[] {
    return this._actionHistory;
  }

  set actionHistory(val: Action[]) {
    this.Set("actionHistory", val);
  }

  get painTolerance(): number {
    return this._painTolerance;
  }

  set painTolerance(val: number) {
    this.Set("painTolerance", val);
    this.syncInitiativeAttribute();
  }

  get overflowHealth(): number {
    return this._overflowHealth;
  }

  set overflowHealth(val: number) {
    this.Set("overflowHealth", val);
  }

  get physicalHealth(): number {
    return this._physicalHealth;
  }

  set physicalHealth(val: number) {
    this.Set("physicalHealth", val);
  }

  get stunHealth(): number {
    return this._stunHealth;
  }

  set stunHealth(val: number) {
    this.Set("stunHealth", val);
  }

  get physicalDamage(): number {
    return this._physicalDamage;
  }

  set physicalDamage(val: number) {
    this.Set("physicalDamage", val);
    // Wound modifiers apply to the Initiative attribute immediately on
    // injury, and thence to the Score (brief criterion 10, pp. 158/160/169).
    this.syncInitiativeAttribute();
  }

  get stunDamage(): number {
    return this._stunDamage;
  }

  set stunDamage(val: number) {
    this.Set("stunDamage", val);
    // See physicalDamage: wound modifier -> Initiative attribute -> Score.
    this.syncInitiativeAttribute();
  }

  get sortOrder(): number {
    return this._sortOrder;
  }

  set sortOrder(val: number) {
    this.Set("sortOrder", val);
  }

  private _name: string;

  private _waiting: boolean;

  private _finished: boolean;

  private _active: boolean;

  private _baseIni: number;

  private _diceIni: number;

  private _dices: number;

  private _hasPainEditor: boolean;

  private _ooc: boolean;

  private _edge: boolean;

  private _status: StatusEnum;

  private _painTolerance: number;

  private _overflowHealth: number;

  private _physicalHealth: number;

  private _stunHealth: number;

  private _physicalDamage: number;

  private _stunDamage: number;

  private _sortOrder: number;

  private _currentInitiativeScore: number;

  private _appliedInitiativeAttribute: number;

  private _actionHistory: Action[] = [];

  constructor() {
    super();
    this._status = StatusEnum.Waiting;
    this._waiting = false;
    this._finished = false;
    this._active = false;
    this._baseIni = 6;
    this._diceIni = 0;
    this._dices = 1;
    this._ooc = false;
    this._edge = false;
    this._name = "";
    this._painTolerance = 0;
    this._overflowHealth = 4;
    this._physicalHealth = 10;
    this._stunHealth = 10;
    this._stunDamage = 0;
    this._physicalDamage = 0;
    this._hasPainEditor = false;
    this._sortOrder = 0;
    this._actionHistory = []
    // No dice rolled yet, so the running Score starts at the bare Initiative
    // attribute; the Initiative Test adds the dice result on top.
    this._appliedInitiativeAttribute = this._baseIni;
    this._currentInitiativeScore = this._baseIni;
  }

  clone(): IParticipant {
    const clone: Participant = new Participant();
    clone._active = this._active;
    clone._baseIni = this._baseIni;
    clone._diceIni = this._diceIni;
    clone._dices = this._dices;
    clone._edge = this._edge;
    clone._finished = this._finished;
    clone._name = this._name;
    clone._ooc = this._ooc;
    clone._overflowHealth = this._overflowHealth;
    clone._painTolerance = this._painTolerance;
    clone._physicalDamage = this._physicalDamage;
    clone._physicalHealth = this._physicalHealth;
    clone._status = this._status;
    clone._stunDamage = this._stunDamage;
    clone._stunHealth = this._stunHealth;
    clone._waiting = this._waiting;
    clone._hasPainEditor = this._hasPainEditor;
    clone._sortOrder = this._sortOrder;
    // The copy starts with an empty action history (it is a *different*
    // character, so it does not inherit Full Defense etc.), so the Initiative
    // already committed to Interrupt Actions is folded straight into its
    // running Score instead. The reduction happens at the time of the
    // Interrupt Action (brief F9, p. 167) and must not be refunded by a copy.
    clone._currentInitiativeScore = this.getCurrentInitiative();
    clone._appliedInitiativeAttribute = this._appliedInitiativeAttribute;
    clone._actionHistory = []
    return clone;
  }

  seizeInitiative() {
    this.edge = true;
  }

  /**
   * The participant's Initiative Score right now.
   *
   * This is the stored running Score (mutated only by deltas) plus the
   * Initiative already committed to Interrupt Actions this Combat Turn.
   * Interrupt costs are held in `actionHistory` rather than debited straight
   * off the Score so that undoing / resetting an action returns the points;
   * both accumulators are cleared at the same moment (the Combat Turn
   * boundary, `softReset()`), so the value matches debit-at-declaration
   * (brief F9, p. 167) at every point in the turn.
   *
   * Deliberately unclamped: negative Scores are load-bearing (brief F3,
   * p. 160 shows -4 and p. 191 shows -9 gating a Parry). See Open Ruling
   * Question 7 - no floor is the brief's recommended default.
   */
  getCurrentInitiative() {
    return this._currentInitiativeScore + this.actionIniModifier;
  }

  /**
   * Apply a signed delta to the running Initiative Score. Every mid-turn
   * change to the Score goes through here; nothing recomputes it from a base
   * after the Initiative Test (brief points 2-4, p. 160).
   */
  applyInitiativeScoreDelta(delta: number) {
    if (delta === 0) {
      return;
    }
    this.currentInitiativeScore = this._currentInitiativeScore + delta;
  }

  /**
   * Fold any change in the live Initiative attribute (base initiative and/or
   * wound modifier) into the running Score as a single same-sized delta
   * (brief F4 / criterion 6, p. 160): attribute 8 / Score 11 raised to
   * attribute 10 yields Score 13, not a recompute.
   */
  syncInitiativeAttribute() {
    const attribute = this.initiativeAttribute;
    const delta = attribute - this._appliedInitiativeAttribute;
    if (delta === 0) {
      return;
    }
    this.appliedInitiativeAttribute = attribute;
    this.applyInitiativeScoreDelta(delta);
  }

  /**
   * Discard the running Score at a Combat Turn boundary. The Score drops back
   * to the bare Initiative attribute; the next Initiative Test (`diceIni`)
   * adds the dice result to produce the new turn's Score (brief F1, p. 159).
   */
  resetInitiativeScore() {
    this.appliedInitiativeAttribute = this.initiativeAttribute;
    this.currentInitiativeScore = this.initiativeAttribute;
  }

  canUseAction(action: Action): boolean {
    // Gated on the running Score, so Initiative already spent on earlier
    // Interrupt Actions this turn stays spent (brief F9 / S3, p. 167).
    if (Math.abs(action.iniMod) > this.getCurrentInitiative()) {
      return false;
    }
    if (action.persist) {
      return !this._actionHistory.includes(action)
    }
    return true;
  }

  doAction(action: Action) {
    if (action.persist && this.actionHistory.includes(action)) {
      return;
    }

    UndoHandler.DoAction(() => {
      this.actionHistory.push(action);
    },
      () => {
        this.actionHistory.pop();
      });
  }

  resetActions()
  {
    const items = this.actionHistory;
    UndoHandler.DoAction(() => this._actionHistory = [], () => { this._actionHistory = items; });
  }

  isInFullDefense(): boolean {
    return this.actionHistory.some(a => a.key === "fullDefense");
  }

  get actionIniModifier(): number {
    let sum = 0;
    for (const action of this.actionHistory) {
      sum += action.iniMod;
    }

    return sum;
  }


  leaveCombat() {
    this.ooc = true;
  }

  enterCombat() {
    this.ooc = false;
  }

  /**
   * The Initiative Test: rolled once per Combat Turn (brief F1, p. 159).
   * Assigning `diceIni` seeds the running Score with
   * Initiative attribute + dice result.
   */
  rollInitiative() {
    let rolled = 0;
    for (let i = 0; i < this.dices; i++) {
      rolled += rollInitiativeDie();
    }
    this.diceIni = rolled;
  }

  softReset(revive = false) {
    this.diceIni = 0;
    // New Combat Turn: the old running Score is discarded and re-rolled
    // (brief, p. 159 Step 5 / Precise Definitions).
    this.resetInitiativeScore();
    this.edge = false;
    this.status = StatusEnum.Waiting;
    if (revive || !this.ooc) {
      this.enterCombat();
    }
    this._actionHistory = [];
  }

  hardReset() {
    this.softReset(true);
    this.physicalDamage = 0;
    this.stunDamage = 0;
    this.diceIni = 0;
    // Manual "reset this character" only: back to the Physical base of 1D6.
    // `softReset()` above has already cleared `diceIni`, so there is no rolled
    // total for a dice change to act on - no roll is owed here.
    this.setDicesWithoutRoll(PHYSICAL_INITIATIVE_DICE);
    this.baseIni = 0;
  }
}
