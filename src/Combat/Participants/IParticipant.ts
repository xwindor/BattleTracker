import { StatusEnum } from "./StatusEnum";
import { Action } from "Interfaces/Action";
// Type-only: `DiceCountChangeResult` is an interface, so this erases at
// runtime and does not create an import cycle with Participant.ts.
import type { DiceCountChangeResult } from "./Participant";

export interface IParticipant
{
  name: string;
  waiting: boolean;
  finished: boolean;
  active: boolean;
  baseIni: number;
  actionIniModifier: number
  diceIni: number;
  /**
   * Initiative Dice count. Read-only on purpose - write it through
   * `changeDiceCount()` (a mid-turn rules event, which rolls the delta) or
   * `setDicesWithoutRoll()` (construction / restore / reset).
   */
  readonly dices: number;
  hasPainEditor: boolean;
  readonly wm: number;
  ooc: boolean;
  /**
   * The manual out-of-combat flag only, never the damage-derived half of
   * `ooc`. Read-only - write it through the ordinary `ooc` setter. Exists so
   * the GM-only rehydration channel can restore exactly what the GM flagged,
   * without re-deriving it from damage vs. health a second time (brief
   * "GM reconnect state loss" D6, `buildGmParticipantState`).
   */
  readonly manualOoc: boolean;
  edge: boolean;
  status: StatusEnum;
  painTolerance: number;
  overflowHealth: number;
  physicalHealth: number;
  stunHealth: number;
  physicalDamage: number;
  stunDamage: number;
  sortOrder: number;
  actionHistory: Action[];
  /** Running Initiative Score for the current Combat Turn (brief pp. 159-160). */
  currentInitiativeScore: number;
  /** Initiative attribute value currently folded into the running Score. */
  appliedInitiativeAttribute: number;
  /** Live Initiative attribute (base initiative minus wound modifier). */
  readonly initiativeAttribute: number;

  clone(): IParticipant;
  seizeInitiative(): void;
  getCurrentInitiative(): number;
  /** Display/bounds clamp of `diceIni` that must not move the Score. */
  setDiceIniWithoutScoreChange(val: number): void;
  /** Write `dices` without rolling: construction / restore / reset only. */
  setDicesWithoutRoll(val: number): void;
  /**
   * Mid-turn Initiative Dice change: rolls only the gained/lost dice and
   * applies the total to the running Score (brief F5, p. 160).
   */
  changeDiceCount(newDices: number, rollDie?: () => number): DiceCountChangeResult;
  /** Move the running Initiative Score by a signed delta (brief p. 160). */
  applyInitiativeScoreDelta(delta: number): void;
  /** Re-apply an Initiative attribute change as a same-sized Score delta. */
  syncInitiativeAttribute(): void;
  /** Discard the running Score at a Combat Turn boundary (brief p. 159). */
  resetInitiativeScore(): void;
  canUseAction(action: Action): boolean;
  isInFullDefense(): boolean;
  doAction(action: Action): void;
  leaveCombat(): void;
  enterCombat(): void;
  rollInitiative(): void;
  resetActions(): void;

  softReset(revive?: boolean): void;
  hardReset(): void;
}
