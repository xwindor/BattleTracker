// Tests for the log presentation added by briefs/combat-log-readability.md.

import {
  CRITICAL_GLITCH_LABEL,
  GLITCH_LABEL,
  formatDiceRollLogText,
  formatGroupWoundLogText,
  formatInitiativeDeltaLogText,
  formatInitiativeRollLogText,
  formatLogText,
  formatManualInitiativeRollLogText,
  formatPassStartLogText,
  formatPassEndLogText,
  formatTurnStartLogText,
  formatTurnEndLogText,
  COMBAT_STARTED_LOG_TEXT,
  COMBAT_ENDED_LOG_TEXT,
  getGlitchLabel,
  getLogTextClass
} from './log-formatter';

/** Initiative Pass decay, mirrored from Combat/Participants/Participant (p. 160). */
const PASS_DECAY = 10;

describe('log-formatter: dice roll entries', () => {

  it('shows dice rolled and number of 1s when the roll glitches, so glitch status is verifiable (AC1, p. 45)', () => {
    const text = formatDiceRollLogText([6, 5, 1, 1, 1]);
    expect(text).toContain('rolled 5d6');
    expect(text).toContain('3 ones of 5');
    expect(text).toContain('2 hits');
  });

  it('omits the ones count on a clean, non-glitching roll (Xavier, 2026-07-31)', () => {
    const text = formatDiceRollLogText([6, 5, 4, 1, 1]);
    expect(text).not.toContain('ones of');
    expect(text).toContain('2 hits');
  });

  it('prints the faces high-to-low without changing the multiset', () => {
    expect(formatDiceRollLogText([1, 6, 3, 5, 2])).toContain('[6, 5, 3, 2, 1]');
  });

  it('labels a glitch that also produced hits as GLITCH, keeping the hits (AC2, p. 45)', () => {
    const text = formatDiceRollLogText([6, 5, 5, 1, 1, 1, 1, 1, 3]);
    expect(text).toContain('3 hits');
    expect(text).toContain(GLITCH_LABEL);
    expect(text).not.toContain(CRITICAL_GLITCH_LABEL);
  });

  it('labels a glitch with zero hits as CRITICAL GLITCH (AC3, p. 45)', () => {
    const text = formatDiceRollLogText([1, 1, 1, 2, 3]);
    expect(text).toContain('0 hits');
    expect(text).toContain(CRITICAL_GLITCH_LABEL);
  });

  it('labels a glitch with one hit as an ordinary glitch, not critical (AC3, p. 45)', () => {
    const text = formatDiceRollLogText([1, 1, 1, 6, 2]);
    expect(text).toContain('1 hit');
    expect(text).toContain(GLITCH_LABEL);
    expect(text).not.toContain(CRITICAL_GLITCH_LABEL);
  });

  it('applies no glitch label to a clean roll', () => {
    const text = formatDiceRollLogText([6, 5, 4, 3, 2]);
    expect(text).not.toContain(GLITCH_LABEL);
    expect(text).not.toContain('ones of');
  });

  it('uses the printed terms and no synonyms', () => {
    expect(getGlitchLabel('glitch')).toBe('GLITCH');
    expect(getGlitchLabel('critical')).toBe('CRITICAL GLITCH');
    expect(getGlitchLabel('none')).toBe('');
  });
});

describe('log-formatter: initiative entries', () => {

  it('shows Initiative attribute + dice = Initiative Score (AC19, p. 160)', () => {
    expect(formatInitiativeRollLogText('REA(3) + INT(3)', [4, 5], 15))
      .toBe('initiative roll: REA(3) + INT(3) + [4, 5] = 15');
  });

  it('renders a negative Initiative Score signed, never clamped to 0 (AC21, p. 160)', () => {
    expect(formatInitiativeRollLogText('REA(2) + INT(2)', [3, 4], -1)).toContain('= -1');
    expect(formatManualInitiativeRollLogText('REA(2) + INT(2)', 5, -1)).toContain('= -1');
    expect(formatInitiativeDeltaLogText([], -10, -1)).toContain('score: -1');
  });

  it('gives a mid-turn Initiative Score change its own entry (AC20, p. 160)', () => {
    expect(formatInitiativeDeltaLogText([4, 2], 6, 18))
      .toBe('initiative delta: +[4, 2] = +6 → score: 18');
    expect(formatInitiativeDeltaLogText([5], -5, 12))
      .toBe('initiative delta: -[5] = -5 → score: 12');
  });

  it('names the -10 per Initiative Pass on the pass boundary (AC19, p. 160)', () => {
    expect(formatPassStartLogText(1, PASS_DECAY)).toBe('Start Initiative Pass 1');
    expect(formatPassStartLogText(2, PASS_DECAY))
      .toBe('Start Initiative Pass 2 — all Initiative Scores -10');
  });

  // Combat structural boundaries (brief "Action Log entries for combat
  // structural boundaries", AC16). `formatPassStartLogText` above is
  // unchanged; these are the four new formatters/constants alongside it.
  it('names the Combat Turn on the turn-start line (AC5, AC12)', () => {
    expect(formatTurnStartLogText(1)).toBe('Start Combat Turn 1');
    expect(formatTurnStartLogText(2)).toBe('Start Combat Turn 2');
  });

  it('names the turn that just ended, not the incremented value (AC2)', () => {
    expect(formatTurnEndLogText(1)).toBe('End Combat Turn 1');
    expect(formatTurnEndLogText(2)).toBe('End Combat Turn 2');
  });

  it('names the pass that just ended, without restating the -10 (AC1, Decision 6)', () => {
    expect(formatPassEndLogText(1)).toBe('End Initiative Pass 1');
    expect(formatPassEndLogText(2)).toBe('End Initiative Pass 2');
    expect(formatPassEndLogText(2)).not.toContain('-10');
  });

  it('has plain combat-started and combat-ended constants (AC5, AC6, AC7)', () => {
    expect(COMBAT_STARTED_LOG_TEXT).toBe('Combat started');
    expect(COMBAT_ENDED_LOG_TEXT).toBe('Combat ended');
  });

  // NPC group initiative, scenario S3: the log has to say both that the
  // group-wide house rule fired and which NPC triggered it. The row's own
  // name is not repeated in the text (it is already the entry's actor); the
  // words "house rule" now live on the entry's `houseRule` flag, not the text.
  it('names the NPC and the new shared score on a group wound', () => {
    const text = formatGroupWoundLogText('Ganger 3', 2, 13);

    expect(text).toContain('Ganger 3');
    expect(text).toContain('-2');
    expect(text).toContain('13');
  });

  it('expresses the house rule running backwards when an NPC recovers', () => {
    // A healed / mis-keyed-hit-corrected NPC gives the row its shared penalty
    // back, so the entry has to be able to say "+N" and a higher score. A
    // one-way "-N" rendering would report a speed-up as a slow-down.
    const text = formatGroupWoundLogText('G1', -2, 15);

    expect(text).toContain('+2');
    expect(text).not.toContain('-2');
    expect(text).toContain('recovery');
    expect(text).toContain('15');
  });

  it('falls back to a generic name when the NPC is unnamed', () => {
    const text = formatGroupWoundLogText('', 1, 5);
    expect(text).toContain('a member');
  });
});

describe('log-formatter: presentation', () => {

  it('classifies a glitched entry distinctly from an ordinary roll', () => {
    expect(getLogTextClass(formatDiceRollLogText([1, 1, 1, 2, 3]))).toBe('log-text-glitch');
    expect(getLogTextClass(formatDiceRollLogText([6, 5, 4, 3, 2]))).toBe('log-text-roll');
  });

  it('highlights GLITCH and CRITICAL GLITCH without double-wrapping', () => {
    const glitch = formatLogText(formatDiceRollLogText([1, 1, 1, 6, 2]));
    expect(glitch).toContain('<span class="log-keyword-glitch">GLITCH</span>');

    const critical = formatLogText(formatDiceRollLogText([1, 1, 1, 2, 3]));
    expect(critical).toContain('<span class="log-keyword-critical-glitch">CRITICAL GLITCH</span>');
    expect(critical).not.toContain('log-keyword-glitch');
  });

  it('still highlights the glitch on an entry another pattern also matches', () => {
    // "initiative roll:" returns early in the core formatter; the glitch
    // decoration is applied to every branch (p. 45 - a glitch always stands).
    const text = formatLogText(`initiative roll: REA(3) + INT(3) + [1, 1] = 8 ${GLITCH_LABEL}`);
    expect(text).toContain('log-keyword-glitch');
  });

  it('highlights the resulting score on an initiative roll line', () => {
    // Regression: the pattern used to expect "initiative roll: <digit>"
    // verbatim (the pre-baseLabel format) and silently stopped matching once
    // the line grew the "REA(3) + INT(3) + [dice] (subtotal) = score" shape,
    // leaving initiative rolls with no colour at all in the shared log.
    const text = formatLogText('initiative roll: REA(3) + INT(3) + [3] = 9');
    expect(text).toContain('<span class="log-keyword-roll">9</span>');
  });

  it('leaves existing damage/healing highlighting intact', () => {
    expect(formatLogText('Cayman took Physical 3')).toContain('log-keyword-physical');
    expect(formatLogText('Cayman healed Stun 2')).toContain('log-keyword-heal');
  });

  it('escapes GM-authored narration rather than rendering it as markup', () => {
    expect(formatLogText('<b>gun jams</b>')).toContain('&lt;b&gt;');
  });
});

// Regression tests for a defect found in adversarial review of
// briefs/action-log-readability-spec.md: `categoryPattern`'s greedy,
// lastIndex-continued match swallowed the connector word between clauses
// ("and", ", ") and, in a row-member line, the actor name prefixed ahead of
// the clause. These assert the *exact* span contents, not just that a span
// exists somewhere in the output.
describe('log-formatter: action clause highlighting (defect fix)', () => {

  it('highlights exactly the verb phrase of each clause in a two-clause sentence, dropping the "and" connector', () => {
    const html = formatLogText('dropped prone (free) and took aim twice (simple).');
    expect(html).toBe(
      '<span class="log-keyword-action">dropped prone</span> (free) and '
      + '<span class="log-keyword-action">took aim twice</span> (simple).'
    );
  });

  it('highlights exactly the verb phrase of each clause in a three-clause sentence, dropping ", " and ", and "', () => {
    const html = formatLogText('dropped prone (free), took aim (simple), and readied a weapon (simple).');
    expect(html).toBe(
      '<span class="log-keyword-action">dropped prone</span> (free), '
      + '<span class="log-keyword-action">took aim</span> (simple), and '
      + '<span class="log-keyword-action">readied a weapon</span> (simple).'
    );
  });

  it('excludes a row member\'s name prefix from the highlighted span', () => {
    const html = formatLogText('Ganger 1 took aim twice (simple).');
    expect(html).toBe(
      'Ganger 1 <span class="log-keyword-action">took aim twice</span> (simple).'
    );
  });
});
