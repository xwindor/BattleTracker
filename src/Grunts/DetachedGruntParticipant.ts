// Imported directly rather than through the "Combat" barrel: the barrel pulls
// in CombatManager, which imports this module's sibling, and that would be a
// cycle (see NpcRowParticipant).
import { Participant } from "Combat/Participants/Participant";
import { IParticipant } from "Combat/Participants/IParticipant";
import {
  GruntDamageResult,
  GruntDamageType,
  GruntFinalState,
  GruntMemberSnapshot,
  DEFAULT_GRUNT_ATTRIBUTE,
  GRUNT_OVERFLOW_BOXES,
  WOUND_MODIFIER_BOX_INTERVAL,
  gruntConditionMonitorBoxes,
  resolveGruntFinalState
} from "./GruntMember";

/**
 * A grunt that has been **detached** from its linked NPC row onto its own
 * initiative row (brief acceptance criterion 12; p. 379 for augmented
 * specialists, pp. 380-381 for lieutenants).
 *
 * Detaching changes *which Initiative Score the NPC is on* and nothing else.
 * It is still a grunt, so it keeps the grunt Condition Monitor shape: **one**
 * combined Physical + Stun track, no overflow (p. 379, restated for
 * lieutenants on p. 381 - "They possess a single Condition Monitor, like other
 * grunts"). Handing back a bare `Participant` would give it the PC shape of two
 * independent tracks, i.e. roughly double the boxes it had a moment earlier,
 * which contradicts printed text rather than filling a gap in it.
 *
 * The combined track is expressed by overriding the two derived getters that
 * read the Condition Monitor - `wm` and `ooc` - to work off
 * `physicalDamage + stunDamage` against a single box count (`physicalHealth`).
 * Both tracks are still writable so the GM can record Stun and Physical
 * separately, but they share one capacity and one wound-modifier ladder, which
 * is exactly what `GruntMember` does.
 */
export class DetachedGruntParticipant extends Participant {

  /**
   * Structural marker, matching `NpcRowParticipant.isNpcRow`: lets callers
   * (and `NpcRowParticipant.detachMember`) tell a grunt-shaped participant from
   * a PC-shaped one without depending on the class identity.
   */
  readonly hasGruntConditionMonitor = true;

  /**
   * Body. Two jobs, both printed:
   *  - one of the two inputs to the Condition Monitor formula,
   *    `8 + ceil(max(Body, Willpower) / 2)` (p. 379);
   *  - the number the final attack's DV is compared against to settle
   *    alive-or-dead once the grunt is down (p. 379).
   *
   * Writing it resizes the single combined track immediately, exactly as
   * `GruntMember.conditionMonitorBoxes` recomputes from the same two attributes,
   * so a standalone grunt and the row member it becomes on a merge can never
   * disagree about how big its Condition Monitor is.
   */
  private _gruntBody = 0;
  get gruntBody(): number { return this._gruntBody; }
  set gruntBody(val: number) {
    this.Set("gruntBody", Math.max(0, Math.floor(val)));
    this.syncConditionMonitorToAttributes();
  }

  /**
   * Willpower, the other input to p. 379's Condition Monitor formula.
   *
   * Stored for real rather than back-derived from the box count: the box count
   * is *output* of the formula, and reconstructing an attribute from it cannot
   * survive an edit to the other attribute (a Body edit would silently resize
   * the track on the next merge). Keeping both attributes means
   * `toMemberSnapshot` hands `GruntMember` the same inputs this participant used,
   * so `GruntMember.conditionMonitorBoxes` reproduces the same track.
   */
  private _gruntWillpower = 0;
  get gruntWillpower(): number { return this._gruntWillpower; }
  set gruntWillpower(val: number) {
    this.Set("gruntWillpower", Math.max(0, Math.floor(val)));
    this.syncConditionMonitorToAttributes();
  }

  /**
   * Set both Condition Monitor inputs and resize **once**.
   *
   * Needed wherever both attributes are known up front (creating a standalone
   * grunt, detaching a row member): setting them one at a time would resize
   * against a stale partner attribute in between, and a shrink-then-grow round
   * trip would clamp damage away that the final size had room for.
   */
  setGruntAttributes(body: number, willpower: number): void {
    this.Set("gruntBody", Math.max(0, Math.floor(body)));
    this.Set("gruntWillpower", Math.max(0, Math.floor(willpower)));
    this.syncConditionMonitorToAttributes();
  }

  /**
   * Re-derive the single combined track from Body / Willpower (p. 379) and keep
   * the recorded damage inside it.
   *
   * `physicalHealth` holds the capacity `ooc` / `wm` read; `stunHealth` is kept
   * in step so nothing that reads the Stun capacity reports a second, larger
   * monitor. Damage is **clamped**, never rescaled or discarded wholesale: a
   * track that shrinks below the boxes already filled fills completely, which is
   * p. 379's own out-of-action condition, and a track that grows leaves the
   * filled boxes exactly where they were.
   */
  private syncConditionMonitorToAttributes(): void {
    const boxes = gruntConditionMonitorBoxes(this._gruntBody, this._gruntWillpower);
    if (this.physicalHealth !== boxes) {
      this.physicalHealth = boxes;
    }
    if (this.stunHealth !== boxes) {
      this.stunHealth = boxes;
    }
    let excess = this.combinedDamage - boxes;
    if (excess <= 0) {
      return;
    }
    // Physical first, mirroring `onGruntCombinedDamageChanged`, which writes
    // combined-bar edits onto the Physical field and leaves Stun where it was.
    const physicalCut = Math.min(excess, this.physicalDamage);
    if (physicalCut > 0) {
      this.physicalDamage = this.physicalDamage - physicalCut;
      excess -= physicalCut;
    }
    if (excess > 0) {
      this.stunDamage = Math.max(0, this.stunDamage - excess);
    }
  }

  /**
   * The manual "bench this participant" flag, i.e. this class's private half of
   * the ordinary `Participant.ooc` setter. Held separately from
   * `Participant._ooc` because `ooc` is overridden below and must not read the
   * base getter, which applies the two-track PC test this class exists to
   * replace.
   *
   * Deliberately **not** exposed through a public getter any more: the only
   * reader it ever had was `mergeGruntsIntoRow`'s hand-bench refusal, which no
   * GM control could reach and which brief Decision 15 / `RULINGS.md`
   * 2026-08-07 removed as dead code.
   */
  private _manualOoc = false;

  private _lastDamageType: GruntDamageType | null = null;
  /** Damage type of the attack that took this grunt out (p. 379). */
  get lastDamageType(): GruntDamageType | null { return this._lastDamageType; }
  set lastDamageType(val: GruntDamageType | null) { this.Set("lastDamageType", val); }

  private _lastDamageValue = 0;
  /** DV of that attack, compared against Body for alive/dead (p. 379). */
  get lastDamageValue(): number { return this._lastDamageValue; }
  set lastDamageValue(val: number) { this.Set("lastDamageValue", Math.max(0, Math.floor(val))); }

  constructor() {
    super();
    // Grunts take no overflow damage (p. 379).
    this.overflowHealth = GRUNT_OVERFLOW_BOXES;
  }

  /** Boxes filled on the single combined track (p. 379). */
  get combinedDamage(): number {
    return this.physicalDamage + this.stunDamage;
  }

  /**
   * One wound-modifier ladder over the combined track: one step per third box
   * (p. 169), not one ladder per track. `painTolerance` / `hasPainEditor` are
   * honoured the same way `Participant.wm` honours them.
   */
  override get wm(): number {
    if (this.hasPainEditor) {
      return 0;
    }
    const effective = this.combinedDamage - this.painTolerance;
    if (effective <= 0) {
      return 0;
    }
    return Math.floor(effective / WOUND_MODIFIER_BOX_INTERVAL);
  }

  /**
   * Out of action when the **one** track is full (p. 379) - not when either of
   * two PC tracks fills. `physicalHealth` holds the grunt's box count.
   */
  override get ooc(): boolean {
    return this._manualOoc || this.combinedDamage >= this.physicalHealth;
  }

  override set ooc(val: boolean) {
    this.Set("manualOoc", val);
  }

  /**
   * Alive-or-dead once downed, by the same p. 379 comparison `GruntMember` uses
   * (shared implementation, so detaching cannot change the verdict).
   */
  get finalState(): GruntFinalState {
    return resolveGruntFinalState(
      this.ooc, this._lastDamageType, this._lastDamageValue, this._gruntBody);
  }

  /**
   * Apply a Damage Value to the single combined track (brief "NPC Group
   * Initiative" Decision 20, `RULINGS.md` 2026-08-13). Mirrors
   * `GruntMember.applyDamage`: the boxes actually **written** are capped at
   * the track's remaining capacity (grunts take no overflow, p. 379), but the
   * DV **recorded** for the final-attack alive-or-dead comparison is the full
   * DV of the attack, uncapped - a killing blow bigger than the boxes left has
   * to be recordable in full or p. 379's "DV vs. Body" call cannot be made for
   * it.
   *
   * Only used by the GM's DV + P/S controls; the Condition Monitor widget's
   * box-clicking still writes `physicalDamage`/`stunDamage` directly and
   * cannot express an over-max hit (`RULINGS.md` 2026-08-13, "How to apply").
   * Written onto the matching typed field so the GM can still see which kind
   * of damage a standalone/detached grunt is carrying, exactly as
   * `GruntMember` records a type even though its own track is a single
   * number.
   */
  applyDamage(boxes: number, type: GruntDamageType): GruntDamageResult {
    const requested = Math.max(0, Math.floor(boxes));
    const before = this.wm;
    const wasOut = this.ooc;
    const remaining = Math.max(0, this.physicalHealth - this.combinedDamage);
    const applied = Math.min(requested, remaining);
    // As with `GruntMember.applyDamage`: the final-attack record is only
    // overwritten while the grunt is still up, so a later stray hit on an
    // already-downed body cannot rewrite the p. 379 verdict.
    if (requested > 0 && !wasOut) {
      this.lastDamageType = type;
      this.lastDamageValue = requested;
    }
    if (applied > 0) {
      if (type === "stun") {
        this.stunDamage = this.stunDamage + applied;
      } else {
        this.physicalDamage = this.physicalDamage + applied;
      }
    }
    return {
      applied,
      discarded: requested - applied,
      woundModifierBefore: before,
      woundModifierAfter: this.wm,
      wentOutOfAction: !wasOut && this.ooc
    };
  }

  /**
   * Undo a mis-keyed hit / apply healing to the combined track (the -1
   * control next to the DV buttons, Decision 20). Cuts Physical first,
   * mirroring `syncConditionMonitorToAttributes`'s own convention for a track
   * that shrinks - there is no fictional meaning to "half a box of Stun, half
   * a box of Physical" recovered at once, so the split only has to be
   * consistent, not significant. Healing a downed grunt below a full track
   * un-latches `ooc` the same live-derived way raising Body/Willpower already
   * does (`RULINGS.md` 2026-08-04 / 2026-08-07).
   */
  healDamage(boxes: number): number {
    const requested = Math.max(0, Math.floor(boxes));
    const healed = Math.min(requested, this.combinedDamage);
    let remaining = healed;
    const physicalCut = Math.min(remaining, this.physicalDamage);
    if (physicalCut > 0) {
      this.physicalDamage = this.physicalDamage - physicalCut;
      remaining -= physicalCut;
    }
    if (remaining > 0) {
      this.stunDamage = Math.max(0, this.stunDamage - remaining);
    }
    return healed;
  }

  /**
   * This grunt as a `GruntMember` snapshot, i.e. the exact inverse of
   * `NpcRowParticipant.detachMember` - what a **merge** into a group needs
   * (brief addendum Decision 10).
   *
   * Damage carries across untouched, including the final-attack record, so a
   * merged grunt keeps its Condition Monitor exactly as it was (Decision 11)
   * and p. 379's alive-or-dead comparison is still answerable afterwards.
   *
   * Both Condition Monitor inputs are handed over as stored values. Nothing is
   * back-derived from the box count, so `GruntMember.conditionMonitorBoxes`
   * recomputes p. 379's `8 + ceil(max(Body, Willpower) / 2)` from the same two
   * numbers this participant sized its own track from and lands on the same
   * count - the merged member cannot silently gain or lose boxes, and a grunt
   * whose track was full stays full and therefore stays out of action (p. 379:
   * "when it's full, the grunt is out of action for the rest of the fight";
   * `RULINGS.md` 2026-08-02).
   */
  toMemberSnapshot(): GruntMemberSnapshot {
    return {
      name: this.name,
      body: this._gruntBody,
      willpower: this._gruntWillpower,
      damage: this.combinedDamage,
      lastDamageType: this._lastDamageType,
      lastDamageValue: this._lastDamageValue
    };
  }

  /**
   * Duplicating a detached grunt must not silently hand back a PC-shaped
   * participant (same hazard as `MatrixParticipant.clone`, ARCHITECTURE.md §6).
   */
  override clone(): IParticipant {
    const copy = super.clone() as unknown as Record<string, unknown>;
    const clone = new DetachedGruntParticipant();
    const dst = clone as unknown as Record<string, unknown>;
    for (const key of Object.keys(copy)) {
      dst[key] = copy[key];
    }
    dst["_gruntBody"] = this._gruntBody;
    dst["_gruntWillpower"] = this._gruntWillpower;
    dst["_manualOoc"] = this._manualOoc;
    dst["_lastDamageType"] = this._lastDamageType;
    dst["_lastDamageValue"] = this._lastDamageValue;
    return clone;
  }
}

/** True when a participant carries the grunt single-Condition-Monitor shape. */
export function hasGruntConditionMonitor(p: IParticipant): p is DetachedGruntParticipant {
  return (p as Partial<DetachedGruntParticipant>).hasGruntConditionMonitor === true;
}

/**
 * Build a **standalone** grunt: one grunt-shaped NPC in its own slot in the
 * initiative order, not inside a row (brief addendum Decision 9).
 *
 * Same Condition Monitor shape as a detached grunt - one combined Physical +
 * Stun track of `8 + ceil(max(Body, Willpower) / 2)` boxes, no overflow (p. 379;
 * `RULINGS.md` 2026-08-01 "A detached grunt keeps its single Condition
 * Monitor"). **Both** attributes are stored on the participant: Body because
 * p. 379's alive-or-dead comparison needs it, and both because the formula is
 * re-evaluated whenever either of them changes (`setGruntAttributes`), which is
 * what keeps the track the same size across a merge (`toMemberSnapshot`).
 *
 * It has **not** rolled: `diceIni` is 0, so it takes its own Initiative Test
 * like any other new standalone participant, with no special-cased score
 * (Decision 9). The caller adds it to the encounter, which is where the
 * ordinary late-entry penalty of -10 per elapsed pass lands (p. 160).
 */
export function createStandaloneGrunt(
  name = "",
  body = DEFAULT_GRUNT_ATTRIBUTE,
  willpower = DEFAULT_GRUNT_ATTRIBUTE
): DetachedGruntParticipant {
  const grunt = new DetachedGruntParticipant();
  grunt.name = name;
  grunt.overflowHealth = GRUNT_OVERFLOW_BOXES;
  // Sizes `physicalHealth` / `stunHealth` from p. 379's formula in one step, and
  // keeps doing so for every later edit to either attribute.
  grunt.setGruntAttributes(body, willpower);
  return grunt;
}
