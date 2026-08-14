import { Undoable } from "Common";

/**
 * One NPC inside a linked NPC row ("grunt", brief p. 378-379).
 *
 * A GruntMember is deliberately **not** an `IParticipant`: it never occupies a
 * slot in the initiative order on its own. The row it belongs to
 * (`NpcRowParticipant`) is the participant; the member only carries the state
 * the rules keep per-NPC rather than per-row - its own Condition Monitor
 * (brief acceptance criteria 3-4, p. 379).
 *
 * Every mutable field follows the repo's `_field` + getter/setter +
 * `Undoable.Set` convention, so every change a GM makes to a member is part of
 * the same undo chain as everything else (ARCHITECTURE.md §4).
 */

/**
 * Base box count of a grunt Condition Monitor: "8 + half of the higher of Body
 * or Willpower, rounded up" (brief acceptance criterion 7, p. 379).
 */
export const GRUNT_CONDITION_MONITOR_BASE = 8;

/**
 * Divisor applied to the higher of Body / Willpower before rounding up, per the
 * same formula (brief acceptance criterion 7, p. 379).
 */
export const GRUNT_CONDITION_MONITOR_ATTRIBUTE_DIVISOR = 2;

/**
 * Damage boxes per step of Wound Modifier: "wound modifiers accumulate with
 * every third box of damage" (brief acceptance criterion 5, p. 169).
 */
export const WOUND_MODIFIER_BOX_INTERVAL = 3;

/**
 * Grunts take **no** overflow damage: the single track simply fills and the
 * grunt is out of action (brief acceptance criterion 7, p. 379).
 */
export const GRUNT_OVERFLOW_BOXES = 0;

/** Which kind of damage the box(es) came from (brief p. 379). */
export type GruntDamageType = "physical" | "stun";

/**
 * Default Body / Willpower a newly created grunt is given, matching the
 * defaults the GM component already uses when adding an NPC to a row
 * (`addNpcToRow`). Nothing in the rules fixes a default - these are the
 * tracker's starting values, editable per grunt.
 */
export const DEFAULT_GRUNT_ATTRIBUTE = 3;

/**
 * The grunt Condition Monitor formula in one place: one combined track of
 * `8 + ceil(max(Body, Willpower) / 2)` boxes (brief acceptance criterion 7,
 * p. 379). Shared by `GruntMember` (a grunt inside a row) and by the standalone
 * grunt factory (addendum Decision 9), so the two can never disagree about how
 * big a grunt's single track is.
 */
export function gruntConditionMonitorBoxes(body: number, willpower: number): number {
  return GRUNT_CONDITION_MONITOR_BASE
    + Math.ceil(Math.max(body, willpower) / GRUNT_CONDITION_MONITOR_ATTRIBUTE_DIVISOR);
}

/**
 * Post-combat state of a downed grunt (brief edge case 7, p. 379):
 *  - Stun, or Physical with DV **less than** Body -> alive
 *  - Physical with DV **greater than** Body        -> dead
 *
 * `undetermined` covers Physical with DV exactly **equal** to Body, which the
 * brief does not state a result for. The tracker records the inputs and refuses
 * to guess rather than inventing a ruling - the GM decides. See the
 * "Deviations and gaps" note for this feature.
 */
export type GruntFinalState = "alive" | "dead" | "undetermined" | "standing";

/**
 * Alive-or-dead for a downed grunt, from the recorded final attack
 * (brief edge case 7, p. 379). Pure function so a grunt that has been
 * **detached** onto its own initiative row can still be resolved by the same
 * rule (`DetachedGruntParticipant`, p. 381: a lieutenant "possesses a single
 * Condition Monitor, like other grunts") rather than a second copy of the
 * comparison drifting from this one.
 */
export function resolveGruntFinalState(
  outOfAction: boolean,
  lastDamageType: GruntDamageType | null,
  lastDamageValue: number,
  body: number
): GruntFinalState {
  if (!outOfAction) {
    return "standing";
  }
  if (lastDamageType === "stun") {
    return "alive";
  }
  if (lastDamageValue < body) {
    return "alive";
  }
  if (lastDamageValue > body) {
    return "dead";
  }
  return "undetermined";
}

/**
 * Flat, transport-safe picture of one grunt's per-NPC state.
 *
 * Exists so a linked row can be put on the session-sync wire and rebuilt on a
 * GM rejoin with its NPCs intact (`SharedParticipantState.rowMembers`). Every
 * field here is state the rules keep per-NPC rather than per-row: the Condition
 * Monitor inputs (Body / Willpower, brief acceptance criterion 7, p. 379), the
 * filled boxes, and the final-attack record p. 379 settles alive-or-dead from.
 */
export interface GruntMemberSnapshot {
  name: string;
  body: number;
  willpower: number;
  damage: number;
  lastDamageType: GruntDamageType | null;
  lastDamageValue: number;
}

/** What a single damage application did, for logging and for the row's score. */
export interface GruntDamageResult {
  /** Boxes actually written to the track (capped, never overflowing). */
  applied: number;
  /** Boxes discarded because the track was already full (p. 379: no overflow). */
  discarded: number;
  /** Wound Modifier before / after, so the caller can see a threshold crossing. */
  woundModifierBefore: number;
  woundModifierAfter: number;
  /** True when this application filled the track (grunt is out of action). */
  wentOutOfAction: boolean;
}

export class GruntMember extends Undoable {

  private _name: string;
  get name(): string { return this._name; }
  set name(val: string) { this.Set("name", val); }

  private _body: number;
  get body(): number { return this._body; }
  set body(val: number) { this.Set("body", Math.max(0, Math.floor(val))); }

  private _willpower: number;
  get willpower(): number { return this._willpower; }
  set willpower(val: number) { this.Set("willpower", Math.max(0, Math.floor(val))); }

  /**
   * Boxes filled on the single combined Physical + Stun track. Written through
   * `applyDamage` / `healDamage` rather than assigned directly by callers, so
   * the no-overflow cap (p. 379) is enforced in one place.
   */
  private _damage: number;
  get damage(): number { return this._damage; }

  private _lastDamageType: GruntDamageType | null;
  /** Damage type of the most recent hit - the "final attack" once downed. */
  get lastDamageType(): GruntDamageType | null { return this._lastDamageType; }

  private _lastDamageValue: number;
  /** DV of the most recent hit, compared against Body for alive/dead. */
  get lastDamageValue(): number { return this._lastDamageValue; }

  /**
   * Has this NPC already gone in the current Initiative Pass?
   *
   * The row's members act back-to-back inside the row's single slot (brief
   * acceptance criterion 2, p. 379), so the engine's own `status` lifecycle -
   * which is per *participant* - cannot say which of six gangers has already
   * fired. This is the per-NPC equivalent of a plain participant's Act state
   * (brief Decision 18): GM bookkeeping only, cleared at every pass boundary
   * (p. 159, everyone still above 0 acts again) and at the Combat Turn
   * boundary. It gates nothing in the rules engine.
   */
  private _hasActed: boolean;
  get hasActed(): boolean { return this._hasActed; }
  set hasActed(val: boolean) { this.Set("hasActed", val === true); }

  constructor(name = "", body = 3, willpower = 3) {
    super();
    this._name = name;
    this._body = Math.max(0, Math.floor(body));
    this._willpower = Math.max(0, Math.floor(willpower));
    this._damage = 0;
    this._lastDamageType = null;
    this._lastDamageValue = 0;
    this._hasActed = false;
  }

  /**
   * Grunt Condition Monitor size: one combined track of
   * `8 + ceil(max(Body, Willpower) / 2)` boxes taking both Physical and Stun
   * damage (brief acceptance criterion 7, p. 379). Not configurable - grunt
   * style is the only shape a row member can have (Decision 4).
   */
  get conditionMonitorBoxes(): number {
    return gruntConditionMonitorBoxes(this._body, this._willpower);
  }

  /**
   * This member's own Wound Modifier: one per third filled box (p. 169).
   * Positive, matching `Participant.wm`'s convention (it is subtracted, never
   * added). It still applies to this NPC's own dice pools as normal (p. 170);
   * what the house rule changes is only where the *Initiative* half of it lands
   * (Decision 1 - see `NpcRowParticipant.wm`).
   */
  get wm(): number {
    return Math.floor(this._damage / WOUND_MODIFIER_BOX_INTERVAL);
  }

  /**
   * Full track = out of action for the rest of the fight (brief acceptance
   * criterion 6, p. 379). There is no separate "unconscious vs. dead" state
   * during combat; see `finalState`.
   */
  get outOfAction(): boolean {
    return this._damage >= this.conditionMonitorBoxes;
  }

  /** Boxes left before this member drops. */
  get remainingBoxes(): number {
    return Math.max(0, this.conditionMonitorBoxes - this._damage);
  }

  /**
   * Alive-or-dead once downed, decided by the type of the final attack
   * (brief edge case 7, p. 379). Returns `standing` while the member is still
   * up, and `undetermined` for Physical DV exactly equal to Body, which the
   * brief does not resolve.
   */
  get finalState(): GruntFinalState {
    return resolveGruntFinalState(
      this.outOfAction, this._lastDamageType, this._lastDamageValue, this._body);
  }

  /**
   * Apply damage to the single combined track. Both damage types go on the same
   * track and the track never overflows: anything past the last box is
   * discarded (brief acceptance criterion 7, p. 379).
   *
   * Damage lands on **this member only** - never on any other member of the row
   * (brief acceptance criterion 4, p. 379).
   *
   * The "final attack" record (`lastDamageType` / `lastDamageValue`) is only
   * written while the grunt is still **up**. p. 379 settles alive-or-dead from
   * the attack that took the grunt out of action; a later stray round into an
   * already-downed body applies no boxes (the track is full and does not
   * overflow) and must not be able to rewrite that verdict.
   */
  applyDamage(boxes: number, type: GruntDamageType): GruntDamageResult {
    const requested = Math.max(0, Math.floor(boxes));
    const before = this.wm;
    const wasOut = this.outOfAction;
    const applied = Math.min(requested, this.remainingBoxes);
    if (requested > 0 && !wasOut) {
      this.Set("lastDamageType", type);
      this.Set("lastDamageValue", requested);
    }
    if (applied > 0) {
      this.Set("damage", this._damage + applied);
    }
    return {
      applied,
      discarded: requested - applied,
      woundModifierBefore: before,
      woundModifierAfter: this.wm,
      wentOutOfAction: !wasOut && this.outOfAction
    };
  }

  /**
   * Undo a mis-keyed hit / apply healing. Kept symmetric with `applyDamage` so
   * the GM can correct a mis-tap at the table without reaching for global undo
   * (the row re-syncs the shared Initiative Score either way).
   *
   * **Healing a downed grunt brings it back up** (brief Decision 13,
   * `RULINGS.md` 2026-08-07, which reverses the 2026-08-02 refusal). There is
   * deliberately no `outOfAction` gate here: `outOfAction` is a *live-derived*
   * read of the box count against the track size, in the heal direction exactly
   * as it already was in the grow direction (raising Body / Willpower on a full
   * grunt un-latches it, `RULINGS.md` 2026-08-04). p. 379's "out of action for
   * the rest of the fight" is read as "for as long as the Condition Monitor
   * stays full".
   *
   * The final-attack record (`lastDamageType` / `lastDamageValue`) is **not**
   * touched by a heal: it still describes the last attack that actually landed,
   * so a p. 379 alive-or-dead read taken while the grunt was down stays correct
   * history afterwards.
   */
  healDamage(boxes: number): number {
    const requested = Math.max(0, Math.floor(boxes));
    const healed = Math.min(requested, this._damage);
    if (healed > 0) {
      this.Set("damage", this._damage - healed);
    }
    return healed;
  }

  /** Flat copy of this NPC's per-member state, for the session-sync wire. */
  toSnapshot(): GruntMemberSnapshot {
    return {
      name: this._name,
      body: this._body,
      willpower: this._willpower,
      damage: this._damage,
      lastDamageType: this._lastDamageType,
      lastDamageValue: this._lastDamageValue
    };
  }

  /**
   * Rebuild a member from a snapshot, damage and final-attack record included.
   *
   * Writes `damage` directly rather than replaying `applyDamage`, because a
   * replay would re-trigger the wound-modifier deltas the row's shared
   * accumulator is driven by (Decision 1) - the accumulator is restored
   * separately, from its own snapshot field, and must not be double-counted.
   */
  static fromSnapshot(snapshot: Partial<GruntMemberSnapshot>): GruntMember {
    const member = new GruntMember(
      snapshot.name ?? "",
      Number(snapshot.body ?? 0),
      Number(snapshot.willpower ?? 0)
    );
    const damage = Math.max(0, Math.floor(Number(snapshot.damage ?? 0)));
    member.Set("damage", Math.min(damage, member.conditionMonitorBoxes));
    member.Set("lastDamageType",
      snapshot.lastDamageType === "physical" || snapshot.lastDamageType === "stun"
        ? snapshot.lastDamageType
        : null);
    member.Set("lastDamageValue", Math.max(0, Math.floor(Number(snapshot.lastDamageValue ?? 0))));
    return member;
  }

  clone(): GruntMember {
    return GruntMember.fromSnapshot(this.toSnapshot());
  }
}
