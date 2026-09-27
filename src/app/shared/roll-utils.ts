// ── Success-test roll vocabulary ──────────────────────────────────────────
//
// These are the only rules facts this feature needed, and every one of them
// is computable from data the app already captures (the rolled die faces).
// No limit, threshold, opposed-test or Edge concept exists in this *roll
// resolution* path, and none is introduced here. Scoped deliberately: Edge does
// exist elsewhere in the app (`Participant.edge`, the Edge-weighted initiative
// ordering, the GM-editable Edge rating, Edge tie-breaking) - it is only the
// dice-pool resolution below that has no notion of it.

/** A die showing this face or higher is a *hit* (each 5 or 6, brief p. 44). */
export const HIT_FACE_MINIMUM = 5;

/** Only the 1 face counts toward a glitch (brief p. 45). */
export const GLITCH_FACE = 1;

/**
 * A glitch is when *more than half* the dice you rolled show a 1
 * (brief p. 45) - strictly more than, so exactly half is not a glitch.
 */
export const GLITCH_POOL_FRACTION = 0.5;

/**
 * A glitch on a roll that produced no hits at all is a *critical* glitch;
 * a glitch with one or more hits stays an ordinary glitch (brief p. 45).
 */
export const CRITICAL_GLITCH_MAX_HITS = 0;

export type GlitchLevel = "none" | "glitch" | "critical";

export interface RollOutcome {
  /** Number of dice actually rolled - the glitch denominator (brief p. 45). */
  pool: number;
  /** Dice showing 5 or 6 (brief p. 44). */
  hits: number;
  /** Dice showing 1 - the glitch numerator (brief p. 45). */
  ones: number;
  glitch: GlitchLevel;
}

export function isHitFace(value: number): boolean {
  return value >= HIT_FACE_MINIMUM;
}

export function countHits(values: readonly number[]): number {
  return values.filter(isHitFace).length;
}

export function countOnes(values: readonly number[]): number {
  return values.filter(v => v === GLITCH_FACE).length;
}

/**
 * Glitch test, expressed exactly as printed: more than half the dice rolled
 * show a 1 (brief p. 45). An empty pool never glitches - a resolution with no
 * dice is not a roll.
 */
export function isGlitch(ones: number, pool: number): boolean {
  if (pool <= 0) {
    return false;
  }
  return ones > pool * GLITCH_POOL_FRACTION;
}

/**
 * Classify a set of rolled die faces. A glitch never cancels a success: hits
 * are counted independently of glitch status and both stand (brief p. 45).
 */
export function classifyRoll(values: readonly number[]): RollOutcome {
  const pool = values.length;
  const hits = countHits(values);
  const ones = countOnes(values);
  let glitch: GlitchLevel = "none";
  if (isGlitch(ones, pool)) {
    glitch = hits <= CRITICAL_GLITCH_MAX_HITS ? "critical" : "glitch";
  }
  return { pool, hits, ones, glitch };
}

export function getInitiativeRollMax(diceCount: number | undefined): number {
  return Math.max(1, Number(diceCount || 1)) * 6;
}

export function clampRollToBounds(value: number, max: number): number {
  return Math.max(0, Math.min(max, Math.floor(Number(value) || 0)));
}

export function clampInitiativeRoll(value: number, diceCount: number | undefined): number {
  return clampRollToBounds(value, getInitiativeRollMax(diceCount));
}

/**
 * Shown in place of a numeric Initiative Score for a participant who has not
 * yet taken this Combat Turn's Initiative Test (QA fix, hands-on findings on
 * commit 304aa36, item 3) - shared between the GM screen and the player view
 * so the two can never disagree on the wording. Not a rules value - a display
 * placeholder, so it carries no page citation. An em dash reads unambiguously
 * as "nothing here yet" rather than as a number, which a bare "0" or a
 * negative late-entry-penalty figure (Core p. 160, applied at add time before
 * any roll) does not.
 */
export const NOT_ROLLED_DISPLAY = "— not rolled";
