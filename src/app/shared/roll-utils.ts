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
