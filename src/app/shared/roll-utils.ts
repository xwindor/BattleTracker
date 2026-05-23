export function getInitiativeRollMax(diceCount: number | undefined): number {
  return Math.max(1, Number(diceCount || 1)) * 6;
}

export function clampRollToBounds(value: number, max: number): number {
  return Math.max(0, Math.min(max, Math.floor(Number(value) || 0)));
}

export function clampInitiativeRoll(value: number, diceCount: number | undefined): number {
  return clampRollToBounds(value, getInitiativeRollMax(diceCount));
}
