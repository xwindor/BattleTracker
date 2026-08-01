// Unit tests for the success-test roll vocabulary added by
// briefs/combat-log-readability.md: hits, 1s, glitch, critical glitch.

import {
  CRITICAL_GLITCH_MAX_HITS,
  GLITCH_FACE,
  GLITCH_POOL_FRACTION,
  HIT_FACE_MINIMUM,
  classifyRoll,
  countHits,
  countOnes,
  isGlitch
} from './roll-utils';

describe('roll-utils: hits, 1s and glitches', () => {

  it('encodes the printed constants (pp. 44-45)', () => {
    expect(HIT_FACE_MINIMUM).toBe(5);
    expect(GLITCH_FACE).toBe(1);
    expect(GLITCH_POOL_FRACTION).toBe(0.5);
    expect(CRITICAL_GLITCH_MAX_HITS).toBe(0);
  });

  it('counts each 5 or 6 as a hit and nothing else (p. 44)', () => {
    expect(countHits([1, 2, 3, 4, 5, 6])).toBe(2);
    expect(countHits([4, 4, 4])).toBe(0);
    expect(countHits([])).toBe(0);
  });

  it('counts only 1s toward the glitch numerator (p. 45)', () => {
    expect(countOnes([1, 1, 2, 6])).toBe(2);
    expect(countOnes([2, 3, 4])).toBe(0);
  });

  describe('glitch threshold: MORE than half the dice show a 1 (p. 45)', () => {
    it('does not glitch on exactly half', () => {
      expect(isGlitch(2, 4)).toBe(false);
      expect(classifyRoll([1, 1, 6, 6]).glitch).toBe('none');
    });

    it('glitches one die past half, even pool', () => {
      expect(isGlitch(3, 4)).toBe(true);
      expect(classifyRoll([1, 1, 1, 6]).glitch).toBe('glitch');
    });

    it('glitches on the majority of an odd pool', () => {
      expect(isGlitch(3, 5)).toBe(true);
      expect(isGlitch(2, 5)).toBe(false);
    });

    it('never glitches on an empty pool - no dice is not a roll', () => {
      expect(isGlitch(0, 0)).toBe(false);
      expect(classifyRoll([]).glitch).toBe('none');
    });
  });

  describe('glitch vs critical glitch (p. 45)', () => {
    it('is a critical glitch only when the glitched roll also had zero hits', () => {
      const outcome = classifyRoll([1, 1, 1, 2, 3]);
      expect(outcome.hits).toBe(0);
      expect(outcome.glitch).toBe('critical');
    });

    it('is an ordinary glitch when the glitched roll produced hits', () => {
      const outcome = classifyRoll([1, 1, 1, 6, 2]);
      expect(outcome.hits).toBe(1);
      expect(outcome.glitch).toBe('glitch');
    });

    it('zero hits without a glitch is neither', () => {
      const outcome = classifyRoll([2, 3, 4, 1]);
      expect(outcome.hits).toBe(0);
      expect(outcome.glitch).toBe('none');
    });
  });

  it('a glitch never suppresses the hit count (p. 45)', () => {
    // S2's attacker: nine dice, five 1s, still three hits.
    const outcome = classifyRoll([6, 5, 5, 1, 1, 1, 1, 1, 3]);
    expect(outcome.pool).toBe(9);
    expect(outcome.ones).toBe(5);
    expect(outcome.hits).toBe(3);
    expect(outcome.glitch).toBe('glitch');
  });

  it('reports the pool size and 1s needed to verify glitch status (p. 45)', () => {
    const outcome = classifyRoll([1, 1, 1, 1, 1, 4, 4, 4, 4]);
    expect(outcome.pool).toBe(9);
    expect(outcome.ones).toBe(5);
    expect(outcome.ones > outcome.pool / 2).toBe(true);
  });
});
