/**
 * The shared Matrix Condition Monitor formula.
 *
 * Every device's Matrix Condition Monitor is 8 + (Device Rating / 2),
 * rounding up (p. 228; division rounds up unless a rule says otherwise,
 * p. 48). The same shape sizes an IC's monitor off its host's Rating
 * (RULINGS.md 2026-08-29, "IC Matrix Condition Monitor is 8 + (Host Rating /
 * 2)" — Table Ruling 2, restored 2026-09-01) and a sprite's off its Level
 * (p. 254, not modelled by this tracker).
 *
 * Hosts and files never call this: they cannot be attacked with Matrix
 * damage and have no Matrix Condition Monitor at all (p. 229).
 */
const MATRIX_CM_BASE = 8; // p. 228

export function matrixConditionMonitor(rating: number): number {
  return MATRIX_CM_BASE + Math.ceil(rating / 2);
}
