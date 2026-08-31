/**
 * Types for the fourteen sample grunt/lieutenant statblocks printed at SR5
 * core pp. 381-384 (brief "Grunt naming and statblocks", governing rule G13).
 *
 * Deliberately narrow (Decision D-X2, 2026-08-26, binding): Xavier's own
 * instruction was "dont add in gear, skills, etc, just add in what the
 * initiative tracker is already using like body, willpower, etc." The
 * tracker's complete per-participant attribute vocabulary is Body, Willpower,
 * Reaction, Intuition, Edge and Initiative Dice (see that decision's table) -
 * so that is all this type carries, plus the bookkeeping fields (id, label,
 * Professional Rating, page) and `notes` for the book's own printed
 * arithmetic errors (the X-list).
 *
 * Amended 2026-08-30 (RULINGS.md "Data Processing is imported from a
 * statblock only where the book supplies one, and is blank otherwise") to add
 * a **seventh**, optional field: `dataProcessing`. This does not reopen
 * D-X2 - D-X2's field inventory was an application of its own stated
 * principle ("what the initiative tracker is already using"), and simply
 * missed that the tracker already models Data Processing for Matrix
 * initiative. See `dataProcessing`'s own doc comment below for the reasoning
 * and per-block detail.
 *
 * Deliberately absent, struck from an earlier draft of this type by D-X2:
 * `armor`, `printedInitiative`, `printedAltInitiative`,
 * `printedConditionMonitor`, `printedLimits`, and the entire `reference`
 * sub-object (skills, gear, spells, complex forms, adept powers, qualities,
 * programs). None of that is modelled by the tracker today and D-X2 says not
 * to start.
 *
 * There is deliberately no `conditionMonitorBoxes` field either: writing a
 * template's own box count would violate the standing invariant that a
 * grunt's Condition Monitor is always *derived* from stored Body and
 * Willpower, never written directly (RULINGS 2026-08-04; brief acceptance
 * criterion 10). `gruntConditionMonitorBoxes(body, willpower)` (`../GruntMember`)
 * is what turns `body`/`willpower` below into a box count, at instantiation
 * and on every later edit alike.
 */

/** Which side of a grunt/lieutenant pair a block describes (brief G10-G11). */
export type GruntStatblockKind = "grunt" | "lieutenant";

/**
 * The bracketed ("augmented") override of a printed attribute or Initiative
 * Dice count, present only where the block itself prints a bracketed value
 * (brief "The statblock data set" preamble: "Values in parentheses are
 * augmented"). Absent fields fall back to the block's base value.
 */
export interface GruntStatblockAugmented {
  reaction?: number;
  intuition?: number;
  body?: number;
  willpower?: number;
  initiativeDice?: number;
}

/**
 * One printed sample grunt or lieutenant block (SR5 core pp. 381-384).
 *
 * Given verbatim by Decision D-X2 (2026-08-26, binding) - do not add fields
 * back to this type without a fresh binding decision authorising it.
 */
export interface GruntStatblock {
  /** Stable id, e.g. `"pr5-grunt"`. Never re-used, never renumbered. */
  id: string;
  /** GM-facing label, e.g. `"PR 5 - Elite Corporate Security (Grunt)"`. */
  label: string;
  kind: GruntStatblockKind;
  /** Professional Rating band, 0-6 (brief G8, p. 380). */
  professionalRating: number;
  /** Printed page this block appears on. */
  printedPage: number;

  /** Base Body (brief G17/G5 Condition Monitor input; G6 alive-or-dead input). */
  body: number;
  /** Base Willpower (brief G17/G5 Condition Monitor input). */
  willpower: number;
  /** Base Reaction (brief G18 Initiative attribute input). */
  reaction: number;
  /** Base Intuition (brief G18 Initiative attribute input). */
  intuition: number;
  /** Base Initiative Dice count. */
  initiativeDice: number;

  /** Bracketed overrides, present only where the block prints them. */
  augmented?: GruntStatblockAugmented;

  /**
   * Data Processing, present only on the one block the rules actually derive
   * a value for (`pr4-lieutenant`, whose living persona takes Data Processing
   * from Logic - printed pp. 101, 251, 383). This is a **seventh** imported
   * value beyond the six D-X2 (2026-08-26) named ("Body, Willpower, Reaction,
   * Intuition, Edge and Initiative Dice") - it does not reopen D-X2, because
   * D-X2's own stated principle was narrower than its list: import "what the
   * initiative tracker is already using". The tracker has used Data
   * Processing for Matrix initiative since before this feature existed
   * (`MatrixParticipant.dataProcessing`); D-X2's field inventory simply never
   * checked the Matrix module for it. See RULINGS.md 2026-08-30 ("Data
   * Processing is imported from a statblock only where the book supplies one,
   * and is blank otherwise"), which is the binding decision for this field
   * and for every other block leaving it absent.
   *
   * Absent (not zero) wherever the book does not hand the tracker a number to
   * import - a decker's deck array is deliberately unassigned by the rules
   * (`pr5-lieutenant`, p. 227) and a bare commlink has no attribute array at
   * all (the other twelve blocks, p. 439). `undefined` here means "the GM
   * fills this in"; it is never written as a stored `0` (see
   * `MatrixParticipant.DATA_PROCESSING_UNSET` - a stored 0 means unset there
   * too, never a rated 0).
   *
   * Deliberately **not** part of `GruntStatblockAugmented`: Data Processing
   * derives from Logic (p. 251) and the block prints no bracketed
   * alternative, so it has no augmented/base distinction to toggle.
   */
  dataProcessing?: number;

  /**
   * GM-facing notes recording the book's own printed arithmetic errors (the
   * X-list, brief "Printed inconsistencies") that this block instantiation
   * disagrees with - e.g. the PR 4 lieutenant's printed Condition Monitor of
   * 10 against the p. 379 formula's 11 (X2). Never a Condition Monitor
   * maximum or a Professional Rating restated as a number for a log line -
   * this field is for the details panel, not the combat log (RULINGS
   * 2026-08-13 bars both from any log regardless).
   */
  notes: string[];
}
