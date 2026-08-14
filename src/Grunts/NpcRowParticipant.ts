import { UndoHandler } from "Common";
// Imported directly rather than through the "Combat" barrel: the barrel pulls
// in CombatManager, which imports this module, and that would be a cycle.
import {
  Participant,
  PARTICIPANT_BASE_BACKING_FIELDS
} from "Combat/Participants/Participant";
import { IParticipant } from "Combat/Participants/IParticipant";
import { Action } from "Interfaces/Action";
import {
  GruntDamageType, GruntMember, GruntMemberSnapshot, GRUNT_OVERFLOW_BOXES
} from "./GruntMember";
import { DetachedGruntParticipant, hasGruntConditionMonitor } from "./DetachedGruntParticipant";

/**
 * NpcRowParticipant — several NPCs sharing one Initiative Score.
 *
 * "The GM may streamline Initiative in combat by making a single Initiative
 * Test for the entire group of grunts, and the result of that test applies to
 * all the grunts" (brief acceptance criterion 1, p. 379). The row is modelled
 * as **one participant** in `CombatManager.participants` rather than as a
 * bracket over several participants, because that is what makes the rest of
 * the engine correct for free (ARCHITECTURE.md §1-§5):
 *
 *  - it occupies a single position in the derived order (criterion 2, p. 159);
 *  - the pass boundary subtracts 10 from it exactly once (criterion 8, p. 159);
 *  - `getNextActors()` picks it up once and its members act back-to-back
 *    inside that one slot (criterion 2);
 *  - the tie-break comparator sees one entry, whose Edge rating is 0
 *    (criterion 10 / Decision 5).
 *
 * What it adds on top of `Participant` is the per-NPC half of the rules: each
 * `GruntMember` carries its own Condition Monitor (criteria 3-4, 7, p. 379),
 * and the *house rule* that any member's wound penalty lands on the row's
 * shared Initiative Score (criterion 5 / Decision 1) — see `wm` below.
 *
 * The row itself deliberately has **no** Condition Monitor of its own, no
 * shared damage, no Group Edge pool and no Professional Rating behaviour
 * (criterion 18, scope guard).
 */
/**
 * Everything about a linked row that is *row* state rather than ordinary
 * `Participant` state, flattened for the session-sync wire.
 *
 * A GM rejoining a shared session rebuilds their whole encounter from the last
 * broadcast, so without this a row came back as a bare `Participant`: no
 * members, no per-member Condition Monitors, no shared wound accumulator, and
 * `canInterrupt` flipping back to true in the next broadcast - which would
 * hand a row the Interrupt Actions criterion 17 / Decision 3 forbid it.
 */
export interface NpcRowSnapshot {
  members: GruntMemberSnapshot[];
  /** The shared wound accumulator (criterion 5 / Decision 1). */
  rowWoundModifier: number;
  /** Distinguishes an *emptied* row from one the GM has not filled in yet. */
  everPopulated: boolean;
}

export class NpcRowParticipant extends Participant {

  /**
   * Structural marker used by `isNpcRow()`. `instanceof` would work too, but
   * the repo already reaches for duck-typed guards across module boundaries
   * (see the GM component's `isMatrix` / `isAstral`), and this keeps
   * `CombatManager` from depending on the class identity.
   */
  readonly isNpcRow = true;

  private _members: GruntMember[];

  /**
   * True once the row has ever held an NPC. Lets `isSpent` tell a row the GM
   * has created but not populated yet (keep it: they are about to fill it) from
   * a row that has been emptied by removal or detach (drop it: it is a phantom
   * slot in the order that would otherwise be handed initiative and broadcast
   * to players as an empty group). Undoable like every other field, so undoing
   * the removal that emptied the row restores the row's history too.
   */
  private _everPopulated = false;
  get everPopulated(): boolean { return this._everPopulated; }
  set everPopulated(val: boolean) { this.Set("everPopulated", val); }

  /**
   * The row's shared Wound Modifier (criterion 5 / Decision 1) - see `wm`.
   *
   * Deliberately its **own** piece of state rather than a sum over the current
   * members: Decision 1's trigger is an *event* ("when any NPC in the row takes
   * a wound ... that wound's Initiative penalty applies"), not a standing
   * property of the current roster. Only `applyDamageToMember` / `healMember`
   * move it; adding, removing or detaching a member never does.
   */
  private _rowWoundModifier = 0;
  get rowWoundModifier(): number { return this._rowWoundModifier; }
  set rowWoundModifier(val: number) { this.Set("rowWoundModifier", Math.max(0, Math.floor(val))); }

  /**
   * Has this row already been reported as spent?
   *
   * A spent row is no longer deleted from the order (brief Decision 14,
   * `RULINGS.md` 2026-08-07 "A spent NPC row is flagged, not deleted") - it
   * stays put, flagged, until the GM removes it with the ordinary per-row
   * delete control. Because it stays, the "every member is out of action" check
   * runs again on every later cleanup pass, so the row has to remember that it
   * has already been announced or the GM's log fills with the same line.
   *
   * Cleared again when the row stops being spent (a member healed back up per
   * Decision 13, or a new NPC added), so a row that drops a second time is
   * announced a second time. Undoable like every other field.
   */
  private _spentFlagged = false;
  get spentFlagged(): boolean { return this._spentFlagged; }
  set spentFlagged(val: boolean) { this.Set("spentFlagged", val === true); }

  constructor() {
    super();
    this._members = [];
    // A row has no Condition Monitor of its own (criterion 18); grunts also
    // take no overflow damage (p. 379). Both tracks are left unused, and
    // overflow is zeroed so nothing can read a PC-shaped value off a row.
    this.overflowHealth = GRUNT_OVERFLOW_BOXES;
  }

  /** Every NPC in the row, in the order they act (criterion 2). */
  get members(): readonly GruntMember[] {
    return this._members;
  }

  /**
   * The members that still act when the row comes up. A member whose Condition
   * Monitor is full is out of action for the rest of the fight and is skipped,
   * while the rest of the row carries on (criterion 6, p. 379).
   */
  get activeMembers(): readonly GruntMember[] {
    return this._members.filter(m => !m.outOfAction);
  }

  /**
   * True once every NPC in the row is out of action, or once the row has been
   * *emptied* — every NPC removed or detached.
   *
   * A spent row is **flagged, not deleted** (brief Decision 14, which reverses
   * Decision 8; `RULINGS.md` 2026-08-07). It keeps its slot in the initiative
   * order, reads as out of combat through `ooc` below — the same highlight any
   * downed PC or NPC already gets — and leaves only when the GM taps the
   * per-row delete control. Auto-deletion was the only participant type in the
   * app that disappeared by itself, and it destroyed the row (and any member's
   * chance of being healed back up per Decision 13) the instant the last member
   * dropped.
   *
   * A row the GM has created but **not yet populated** is not spent, so a
   * brand-new row does not flag itself before the GM can fill it
   * (`everPopulated`).
   */
  get isSpent(): boolean {
    if (this._members.length === 0) {
      return this._everPopulated;
    }
    return this._members.every(m => m.outOfAction);
  }

  /**
   * Narrower than `isSpent` (brief "NPC Group Initiative" Decision 21,
   * `RULINGS.md` 2026-08-13 "Emptying a row by hand is not the same as
   * wiping it out"): true only when the row was taken out **by damage** -
   * every member still present, and every one of them out of action.
   *
   * A row *emptied by hand* (its last member removed or detached) also
   * satisfies `isSpent` - it cannot act either way, nobody is left to take a
   * turn - but it must never read as "wiped out": no red flag, no `ooc`, no
   * `spentFlagged` announcement. That state is reserved for a group actually
   * taken out in the fiction, which is the case Decision 14 was written for.
   * `ooc` below and `CombatManager.flagSpentNpcRows()` both key off this
   * getter rather than `isSpent` for exactly that reason.
   */
  get isWipedOut(): boolean {
    return this._members.length > 0 && this._members.every(m => m.outOfAction);
  }

  /**
   * **The house rule (criterion 5 / Decision 1).**
   *
   * "When any NPC in the row takes a wound (crosses a Wound Modifier threshold,
   * p. 169), that wound's Initiative penalty applies to the row's shared
   * Initiative Score." The trigger is a **damage event**, so the row's Wound
   * Modifier is an accumulator moved only by `applyDamageToMember` and
   * `healMember`; `Participant`'s `initiativeAttribute = baseIni - wm` feeds the
   * running Initiative Score and `syncInitiativeAttribute()` applies the change
   * as a signed delta the moment the injury happens (p. 160, p. 169).
   *
   * It is emphatically **not** a sum over the current roster. Nothing in the
   * brief authorises a membership change to move the shared score, and both
   * directions of that would be wrong at the table: a pre-wounded reinforcement
   * joining (criterion 15 / Decision 7 says they just inherit the row's current
   * score) would silently slow the row down, and a wounded member detaching
   * would silently speed it up — scenario S4 states the opposite outright, that
   * "the remaining three gangers keep the row's original shared score
   * untouched".
   *
   * This is a deliberate departure from RAW and is recorded in `RULINGS.md`
   * (2026-08-01): p. 379 / p. 170 would instead drop *only the wounded grunt*
   * to a lower Initiative Score, splitting him off the group. The wounded
   * member's own dice pools still take his own wound modifier as normal
   * (p. 170) — that is `GruntMember.wm`, untouched by this.
   *
   * Members that are already out of action keep counting: their wounds hit the
   * shared score when they were taken and are not refunded by them dropping.
   */
  override get wm(): number {
    return this._rowWoundModifier;
  }

  /**
   * A row is out of combat when the GM manually benches it, or when it has
   * been **wiped out by damage** (criterion 6). It never derives OOC from a
   * Condition Monitor of its own, because it does not have one (criterion 18) —
   * `super.ooc` covers only the manual flag, since the row's unused damage
   * tracks stay at zero.
   *
   * Since Decision 14 this is also what keeps a wiped-out row *visible but
   * inert*: `getNextActors()` skips OOC participants, and the GM list gives it
   * the same "out of action" styling as any downed participant, so the
   * flagged row sits in the order doing nothing until the GM deletes it.
   *
   * Deliberately keyed off `isWipedOut`, not the broader `isSpent`: a row
   * emptied by hand (Decision 21) still cannot act, but it must not read as
   * out of combat the way a damage-wiped row does — see `isWipedOut`.
   */
  override get ooc(): boolean {
    return super.ooc || this.isWipedOut;
  }

  override set ooc(val: boolean) {
    super.ooc = val;
  }

  /**
   * Clear every member's "has acted this pass" marker (brief Decision 18).
   *
   * Called at each Initiative Pass boundary, where everybody still above 0
   * acts again (p. 159), and at the Combat Turn boundary via `softReset()`.
   */
  resetMemberActed(): void {
    for (const member of this._members) {
      member.hasActed = false;
    }
  }

  /**
   * Combat Turn boundary. The row's own Participant state resets as usual; its
   * NPCs' per-pass Act markers reset with it (Decision 18). Damage and the
   * shared wound accumulator deliberately survive, exactly as a participant's
   * damage does (ARCHITECTURE.md §2, and p. 159 for wound modifiers carrying
   * into later Combat Turns).
   */
  override softReset(revive = false): void {
    super.softReset(revive);
    this.resetMemberActed();
  }

  /**
   * Interrupt Actions are refused for a row outright (criterion 17 /
   * Decision 3, a deliberate departure from p. 167): there is no coherent way
   * for one member to pay an Interrupt cost out of a score the whole row
   * shares. An NPC that needs to interrupt must be detached first
   * (`detachMember`, criterion 12), after which ordinary p. 167 rules apply to
   * it individually.
   */
  override canUseAction(_action: Action): boolean {
    return false;
  }

  /**
   * Add an NPC to the row.
   *
   * Joining an *existing* row mid-combat inherits the row's current shared
   * Initiative Score directly — no separate late-entry Initiative Test and no
   * -10-per-elapsed-pass penalty (criterion 15 / Decision 7, departs from
   * p. 160 by design). That falls out of the model: the score lives on the row,
   * so a new member is on it the moment it is added.
   *
   * Score-neutral, including for an NPC who arrives **already wounded**: the
   * row's shared score is moved by wound *events* inside the row (Decision 1),
   * and a reinforcement's pre-existing damage is not one. Decision 7 says the
   * joiner takes the row's current score, full stop.
   */
  addMember(member: GruntMember): GruntMember {
    UndoHandler.DoAction(
      () => { this._members.push(member); },
      () => { this._members.pop(); }
    );
    this.everPopulated = true;
    return member;
  }

  /**
   * Remove an NPC from the row without creating a standalone participant for
   * it (deletion / GM correction). Use `detachMember` for the rules case where
   * the NPC keeps acting on its own initiative row.
   *
   * Score-neutral: a member leaving is not a wound event, so it never moves the
   * row's shared Initiative Score in either direction (see `wm`; scenario S4).
   * The wounds that member's damage already cost the row stay paid.
   */
  removeMember(member: GruntMember): boolean {
    const index = this._members.indexOf(member);
    if (index === -1) {
      return false;
    }
    UndoHandler.DoAction(
      () => { this._members.splice(index, 1); },
      () => { this._members.splice(index, 0, member); }
    );
    return true;
  }

  /**
   * Apply damage to one NPC in the row.
   *
   * Two things happen, and they are deliberately different in scope:
   *  1. the boxes land on **that member's** Condition Monitor only, never on
   *     any other member's (criteria 3-4, p. 379);
   *  2. any Wound Modifier the hit crosses moves the **row's shared**
   *     Initiative Score (criterion 5 / Decision 1) — every member of the row
   *     is now slower, together.
   *
   * The returned `scoreDelta` is what the caller logs, so the house rule is
   * visible in the combat log along with which NPC's wound triggered it
   * (scenario S3). `rowWoundModifierDelta` is the change the row's **shared**
   * accumulator actually took, which is what the log must quote: the member's
   * own raw delta can differ from it once the accumulator's floor at 0 bites
   * (see `healMember`).
   */
  applyDamageToMember(member: GruntMember, boxes: number, type: GruntDamageType) {
    const scoreBefore = this.getCurrentInitiative();
    const rowWoundModifierBefore = this._rowWoundModifier;
    const result = member.applyDamage(boxes, type);
    // The wound *event*, and only the wound event, moves the shared modifier.
    this.rowWoundModifier =
      this._rowWoundModifier + (result.woundModifierAfter - result.woundModifierBefore);
    this.syncInitiativeAttribute();
    return {
      ...result,
      scoreBefore,
      scoreAfter: this.getCurrentInitiative(),
      scoreDelta: this.getCurrentInitiative() - scoreBefore,
      rowWoundModifierBefore,
      rowWoundModifierAfter: this._rowWoundModifier,
      rowWoundModifierDelta: this._rowWoundModifier - rowWoundModifierBefore
    };
  }

  /**
   * Healing counterpart of `applyDamageToMember`: a healing event gives the row
   * back exactly the shared penalty the matching wound event cost it, so a
   * mis-keyed hit can be corrected at the table without global undo. Floored at
   * 0 by the `rowWoundModifier` setter, so healing damage an NPC arrived with
   * (which never cost the row anything, see `addMember`) cannot make the row
   * faster than it started.
   *
   * That floor is exactly why the result reports `rowWoundModifierDelta`
   * separately from the member's own `woundModifierBefore`/`After`: when the
   * floor bites, the member recovers (say) 4 steps of wound modifier while the
   * row gives back only the 1 it was actually carrying. The caller must log the
   * row's number, or the log claims a shared-score movement that did not happen.
   */
  healMember(member: GruntMember, boxes: number) {
    const scoreBefore = this.getCurrentInitiative();
    const rowWoundModifierBefore = this._rowWoundModifier;
    const woundModifierBefore = member.wm;
    const healed = member.healDamage(boxes);
    const woundModifierAfter = member.wm;
    this.rowWoundModifier =
      this._rowWoundModifier - (woundModifierBefore - woundModifierAfter);
    this.syncInitiativeAttribute();
    return {
      healed,
      woundModifierBefore,
      woundModifierAfter,
      scoreBefore,
      scoreAfter: this.getCurrentInitiative(),
      scoreDelta: this.getCurrentInitiative() - scoreBefore,
      rowWoundModifierBefore,
      rowWoundModifierAfter: this._rowWoundModifier,
      rowWoundModifierDelta: this._rowWoundModifier - rowWoundModifierBefore
    };
  }

  /**
   * Detach an NPC from the row onto its own initiative row (criterion 12,
   * p. 379 for augmented specialists, pp. 380-381 for lieutenants). This is
   * also the required path for:
   *  - an NPC that needs an Interrupt Action (criterion 17 / Decision 3), and
   *  - an NPC changing Initiative type — astral projection or any Matrix mode
   *    — which cannot stay on a physical row's shared score (criterion 13,
   *    pp. 159-160).
   *
   * The returned participant has **not** taken an Initiative Test: `diceIni` is
   * 0, so the GM (or the caller) rolls its own Initiative Test for it, and
   * `CombatManager.addParticipant()` applies the ordinary late-entry penalty of
   * -10 per elapsed pass (p. 160). Decision 7's "no late-entry penalty" applies
   * only to an NPC *joining* an existing row, not to one leaving it.
   *
   * **A detached grunt is still a grunt**: detaching changes which Initiative
   * Score it is on, nothing else. Its Condition Monitor keeps the grunt shape —
   * one combined Physical + Stun track of the same box count, holding the same
   * filled boxes, with the same wound modifier, the same out-of-action
   * threshold and no overflow (p. 379, restated for lieutenants on p. 381:
   * "They possess a single Condition Monitor, like other grunts"). That is what
   * `DetachedGruntParticipant` is for; the default factory hands one back.
   * The final-attack record travels too, so alive-or-dead can still be settled
   * per p. 379 after the detach.
   *
   * Score-neutral for the row: the wounds this member's damage already cost the
   * row stay paid (see `wm`; scenario S4 — the remaining gangers keep the row's
   * original shared score untouched).
   *
   * @param factory supplies the participant instance, so an astral / Matrix
   *                detach can hand in an `AstralParticipant` /
   *                `MatrixParticipant` without this module knowing about those
   *                modules. A factory that returns a participant *without* the
   *                grunt Condition Monitor shape gets the grunt's boxes and
   *                damage on its Physical track, but PC-shaped two-track
   *                semantics — see "Deviations and gaps".
   */
  detachMember(
    member: GruntMember,
    factory: () => Participant = () => new DetachedGruntParticipant()
  ): Participant | null {
    if (this._members.indexOf(member) === -1) {
      return null;
    }
    const detached = factory();
    detached.name = member.name;
    detached.physicalHealth = member.conditionMonitorBoxes;
    detached.stunHealth = member.conditionMonitorBoxes;
    detached.overflowHealth = GRUNT_OVERFLOW_BOXES;
    if (hasGruntConditionMonitor(detached)) {
      // Both Condition Monitor inputs travel, set together and **before** the
      // damage: a grunt-shaped participant re-derives its track from Body and
      // Willpower (p. 379), so handing over only Body would resize the track
      // against a Willpower of 0. Body is also what p. 379's "type and DV of the
      // final attack vs. Body" comparison needs, before or after going down.
      detached.setGruntAttributes(member.body, member.willpower);
    }
    detached.physicalDamage = member.damage;
    detached.baseIni = this.baseIni;
    detached.setDicesWithoutRoll(this.dices);
    if (hasGruntConditionMonitor(detached)) {
      detached.lastDamageType = member.lastDamageType;
      detached.lastDamageValue = member.lastDamageValue;
    }
    this.removeMember(member);
    return detached;
  }

  /**
   * Row state for the session-sync wire (`NpcRowSnapshot`). The row's ordinary
   * `Participant` state - name, Initiative attribute, dice, running Score -
   * already travels through `SharedParticipantState`; this is only the part
   * that is specific to being a row.
   */
  toRowSnapshot(): NpcRowSnapshot {
    return {
      members: this._members.map(m => m.toSnapshot()),
      rowWoundModifier: this._rowWoundModifier,
      everPopulated: this._everPopulated
    };
  }

  /**
   * Rebuild this row's members and shared accumulator from a snapshot.
   *
   * The accumulator is restored **verbatim** rather than recomputed from the
   * restored members' damage: Decision 1's trigger is a wound *event*, not the
   * current roster, so a member who joined already wounded (criterion 15 /
   * Decision 7) or one who was detached after being hurt would both be
   * mis-scored by a re-derivation. `everPopulated` is written after the members
   * so a row that was emptied before the broadcast still reads as spent
   * (Decision 8) instead of coming back as a brand-new unpopulated row.
   *
   * Score-neutral: this is reconstruction of existing state, not a wound event,
   * so it deliberately does **not** call `syncInitiativeAttribute()` - the
   * restore path writes the broadcast running Score back verbatim afterwards.
   */
  restoreRowSnapshot(snapshot: Partial<NpcRowSnapshot> | undefined): void {
    if (!snapshot) {
      return;
    }
    for (const memberSnapshot of snapshot.members ?? []) {
      this.addMember(GruntMember.fromSnapshot(memberSnapshot));
    }
    this.rowWoundModifier = Math.max(0, Math.floor(Number(snapshot.rowWoundModifier ?? 0)));
    this.everPopulated = snapshot.everPopulated === true || this._members.length > 0;
  }

  /**
   * Duplicating a row duplicates its NPCs too — each with its own copy of its
   * own Condition Monitor. Without this override, `Participant.clone()` would
   * silently hand back a plain participant and drop the row entirely
   * (ARCHITECTURE.md §6).
   */
  override clone(): IParticipant {
    const clone = new NpcRowParticipant();
    const src = this as unknown as Record<string, unknown>;
    const dst = clone as unknown as Record<string, unknown>;
    for (const f of PARTICIPANT_BASE_BACKING_FIELDS) {
      dst[f] = src[f];
    }
    // Mirrors Participant.clone(): no action history on the copy, so any
    // Initiative committed to Interrupt Actions is folded into the copy's
    // running Score rather than refunded (p. 167). A row can never have an
    // action history (canUseAction is always false), but the invariant is kept
    // so this stays correct if that ever changes.
    dst["_currentInitiativeScore"] = this.getCurrentInitiative();
    dst["_actionHistory"] = [];
    dst["_members"] = this._members.map(m => m.clone());
    // The row's own shared wound accumulator and its "has been populated"
    // history are row state, not member state, so they have to be copied too:
    // a duplicated row is as slowed-down as the row it was copied from, and a
    // duplicate of an emptied row is still an emptied row.
    dst["_rowWoundModifier"] = this._rowWoundModifier;
    dst["_everPopulated"] = this._everPopulated;
    return clone;
  }
}

/** True when a participant is a linked NPC row rather than a single character. */
export function isNpcRow(p: IParticipant): p is NpcRowParticipant {
  return (p as Partial<NpcRowParticipant>).isNpcRow === true;
}

// ── Merging standalone grunts into a row (addendum Decision 10) ────────────

/**
 * Fewest grunts a merge can be made from: "Two or more standalone/detached
 * grunts (any mix) can be combined into a linked NPC row" (Decision 10). One
 * grunt is not a group, and merging it would only cost it its own Initiative
 * slot for nothing.
 */
export const MIN_MERGEABLE_GRUNTS = 2;

/**
 * Has this participant already taken its Initiative Test for the **current**
 * Combat Turn? `diceIni` is the sum of the Initiative Dice rolled this turn and
 * is cleared by `softReset()` at the Combat Turn boundary, so `> 0` is exactly
 * "has a rolled Score for this turn" - the same signal the shared-state
 * `pendingRoll` flag is built from.
 */
export function hasRolledInitiativeThisTurn(p: IParticipant): boolean {
  return p.diceIni > 0;
}

/** Outcome of a merge attempt (Decision 10). Refusals are never silent. */
export interface GruntMergeResult {
  /** True when the row was built. False means nothing was changed at all. */
  ok: boolean;
  /** The new row, or `null` when the merge was refused. */
  row: NpcRowParticipant | null;
  /** The grunts folded into the row (empty on a refusal). */
  merged: DetachedGruntParticipant[];
  /**
   * The grunts that blocked the merge, i.e. the ones that had already rolled
   * Initiative this Combat Turn (Decision 10 - the only refusal reason left
   * since Decision 15 dropped the hand-bench check).
   */
  refused: DetachedGruntParticipant[];
  /** GM-facing explanation. Always populated, including on success. */
  reason: string;
}

/**
 * Fold two or more standalone / detached grunts into one new linked row
 * (addendum Decision 10).
 *
 * Conceptually the inverse of `detachMember`. Two rules govern it:
 *
 *  - **Gate (Decision 10).** "Merging is only allowed when none of the grunts
 *    being merged has rolled Initiative for the current Combat Turn." Refusal is
 *    all-or-nothing and carries a reason, because the GM's alternative (detach
 *    and re-group between turns) is a different action, not a retry. Refusing
 *    only the grunts that had rolled would silently build a *different* group
 *    than the one the GM selected. This is what makes the row's single shared
 *    Initiative Test unambiguous: nobody merged has a score yet, so there is no
 *    question of whose score the group inherits.
 *  - **No retroactive wound penalty (Decision 11).** Each grunt's Condition
 *    Monitor damage carries into the row verbatim, but the row's shared wound
 *    accumulator starts at **0** and is not backfilled from it: Decision 1's
 *    trigger is a wound *event*, and damage taken before the merge is not one.
 *    Same precedent as a reinforcement joining an existing row (Decision 7,
 *    `addMember`), which is likewise score-neutral.
 *  - **No hand-bench refusal.** An earlier build refused a merge that included a
 *    grunt the GM had benched by hand, because `GruntMember` has no hand-bench
 *    concept. Nothing in the app ever set that flag on a grunt - there is no GM
 *    control that reaches it - so the check was unreachable dead code and is
 *    removed (brief Decision 15, `RULINGS.md` 2026-08-07). If a bench control is
 *    ever built, the refusal comes back with it. A grunt that is down by
 *    *damage* was never refused and still is not: that state carries perfectly
 *    (Decision 11) and stays true inside the row.
 *
 * The row is handed back **unrolled** (`diceIni` 0) with the first grunt's
 * Initiative attribute and dice count, so the GM makes the one group Initiative
 * Test for it (criterion 1, p. 379). Grunts are grouped precisely because they
 * share one set of attributes (p. 378), so taking the stat block off the first
 * selected grunt is the group's stat block; the GM can edit it on the row.
 *
 * Pure: it builds and returns the row and never touches the encounter's
 * participant list. Removing the merged grunts from the order is the caller's
 * job, so the whole swap lands in one undo chapter.
 */
export function mergeGruntsIntoRow(
  grunts: readonly DetachedGruntParticipant[],
  rowName = ""
): GruntMergeResult {
  if (grunts.length < MIN_MERGEABLE_GRUNTS) {
    return {
      ok: false,
      row: null,
      merged: [],
      refused: [],
      reason: `Select at least ${MIN_MERGEABLE_GRUNTS} standalone grunts to merge into a group.`
    };
  }
  const refused = grunts.filter(g => hasRolledInitiativeThisTurn(g));
  if (refused.length > 0) {
    const names = refused.map(g => g.name || "unnamed grunt").join(", ");
    return {
      ok: false,
      row: null,
      merged: [],
      refused: [ ...refused ],
      reason: `Cannot merge: ${names} already rolled Initiative for this Combat Turn. `
        + "A group takes one shared Initiative Test, so grunts can only be merged before "
        + "anyone in the selection has rolled - re-group between Combat Turns instead."
    };
  }
  const row = new NpcRowParticipant();
  row.name = rowName;
  row.baseIni = grunts[0].baseIni;
  row.setDicesWithoutRoll(grunts[0].dices);
  for (const grunt of grunts) {
    row.addMember(GruntMember.fromSnapshot(grunt.toMemberSnapshot()));
  }
  // Stated rather than assumed: Decision 11 makes the founding members' existing
  // damage score-neutral, so the accumulator must be untouched here.
  row.rowWoundModifier = 0;
  return {
    ok: true,
    row,
    merged: [ ...grunts ],
    refused: [],
    reason: `Merged ${grunts.length} grunts into one group on a single shared Initiative Score. `
      + "Their damage carried over; the group takes no wound penalty for damage taken before the merge."
  };
}
