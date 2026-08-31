// Pure factory functions turning a `GruntStatblock` (`./statblocks`) into
// live tracker state. Deliberately **no Angular imports** - these live beside
// `createStandaloneGrunt` / `mergeGruntsIntoRow` and are unit-testable without
// a TestBed (brief "Grunt naming and statblocks", implementation appendix
// item 24). The GM component (`battle-tracker.component.ts`) is the only
// caller that knows about side maps, logging or session sync; everything here
// is just "given a statblock, build the domain objects" and is deliberately
// ignorant of all three.
//
// `dataProcessing` (RULINGS.md 2026-08-30) is deliberately **not** threaded
// through `EffectiveGruntAttributes`/the two result types below: unlike
// Body/Willpower/Reaction/Intuition/Initiative Dice, it has nowhere to land
// here - `DetachedGruntParticipant` and `GruntMember` are grunt-shaped and
// carry no Data Processing field; only `MatrixParticipant`, which does not
// exist yet at grunt-instantiation time, does. `battle-tracker.component.ts`
// resolves it separately, at the moment a participant is actually promoted to
// a Matrix form (`promoteToMatrixParticipant` / `statblockDataProcessing`),
// by reading the statblock imprint that already survives every promote/
// demote/duplicate/detach/merge path a grunt can go through - the same
// mechanism `getParticipantStatblockLabel` already uses to look up other
// statblock-only data on demand.

import { GruntStatblock, GruntStatblockAugmented } from "./statblocks/statblock-types";
import { DetachedGruntParticipant, createStandaloneGrunt } from "./DetachedGruntParticipant";
import { GruntMember } from "./GruntMember";

/** A statblock's Body/Willpower/Reaction/Intuition/Initiative Dice, resolved. */
export interface EffectiveGruntAttributes {
  body: number;
  willpower: number;
  reaction: number;
  intuition: number;
  initiativeDice: number;
}

/**
 * Resolve a statblock's effective attributes: the augmented (bracketed)
 * values where `augmented` is true and the block prints one for that field,
 * the base value everywhere else (brief U4: "load augmented by default, with
 * a 'load base (ware off)' toggle").
 */
export function resolveEffectiveStatblockAttributes(
  sb: GruntStatblock,
  augmented: boolean
): EffectiveGruntAttributes {
  const aug: GruntStatblockAugmented = augmented ? (sb.augmented ?? {}) : {};
  return {
    body: aug.body ?? sb.body,
    willpower: aug.willpower ?? sb.willpower,
    reaction: aug.reaction ?? sb.reaction,
    intuition: aug.intuition ?? sb.intuition,
    initiativeDice: aug.initiativeDice ?? sb.initiativeDice
  };
}

export interface StandaloneStatblockResult {
  grunt: DetachedGruntParticipant;
  /** Effective Reaction, for the caller to seed `participantReactions`. */
  reaction: number;
  /** Effective Intuition, for the caller to seed `participantIntuitions`. */
  intuition: number;
  /** Effective Initiative Dice count actually written onto `grunt`. */
  initiativeDice: number;
}

/**
 * Build a **standalone** grunt from a template (brief "How templates feed
 * Body/Willpower").
 *
 * Routes through `createStandaloneGrunt`, the only correct entry point: it
 * calls `setGruntAttributes`, the sole writer of `physicalHealth`/
 * `stunHealth` on a grunt (acceptance criterion 10 / RULINGS 2026-08-04 - no
 * template instantiation may ever write a Condition Monitor box count
 * directly). Initiative Dice are written with `setDicesWithoutRoll` -
 * construction, never `changeDiceCount` (ARCHITECTURE §6).
 */
export function instantiateStandaloneFromStatblock(
  sb: GruntStatblock,
  opts: { name?: string; augmented?: boolean } = {}
): StandaloneStatblockResult {
  const eff = resolveEffectiveStatblockAttributes(sb, opts.augmented === true);
  const grunt = createStandaloneGrunt(opts.name ?? "", eff.body, eff.willpower);
  grunt.setDicesWithoutRoll(eff.initiativeDice);
  return { grunt, reaction: eff.reaction, intuition: eff.intuition, initiativeDice: eff.initiativeDice };
}

export interface RowStatblockResult {
  members: GruntMember[];
  /** Effective Reaction, for the caller to seed the row's shared attribute. */
  reaction: number;
  /** Effective Intuition, for the caller to seed the row's shared attribute. */
  intuition: number;
  /** Effective Initiative Dice count, for the caller to write onto the row. */
  initiativeDice: number;
}

/**
 * Build `names.length` `GruntMember`s from a template, for a linked NPC row
 * (brief acceptance criterion 12: one shared Initiative Test for the whole
 * row). Names are supplied by the caller rather than generated here - the
 * default-naming scheme (`nextRowMemberName`) is GM-component/UI concern, not
 * a rules fact this pure module should know about.
 *
 * `GruntMember.conditionMonitorBoxes` is a getter with no setter (see
 * `GruntMember.ts`), so building members this way is structurally incapable
 * of writing a box count directly - the same invariant
 * `instantiateStandaloneFromStatblock` upholds via `setGruntAttributes`.
 */
export function instantiateRowFromStatblock(
  sb: GruntStatblock,
  names: readonly string[],
  opts: { augmented?: boolean } = {}
): RowStatblockResult {
  const eff = resolveEffectiveStatblockAttributes(sb, opts.augmented === true);
  const members = names.map(name => new GruntMember(name, eff.body, eff.willpower));
  return { members, reaction: eff.reaction, intuition: eff.intuition, initiativeDice: eff.initiativeDice };
}
