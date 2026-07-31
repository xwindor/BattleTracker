import { CombatManager } from 'Combat';
import { Participant, INITIATIVE_PASS_DECAY } from 'Combat/Participants/Participant';
import { interruptTable } from 'InterruptTable';
import { UndoHandler } from 'Common';
import { MatrixParticipant } from 'Matrix';
import { AstralParticipant } from 'Magic';
import { StatusEnum } from 'Combat/Participants/StatusEnum';

// Helpers
function makeParticipant(name: string): Participant {
  const p = new Participant();
  p.name = name;
  return p;
}

/**
 * A deterministic replacement for the d6 roller `changeDiceCount()` injects,
 * so the mid-turn dice-change scenarios stay reproducible.
 */
function scriptedRoller(values: number[]): () => number {
  let i = 0;
  return () => values[i++];
}

/**
 * Build a participant that has taken the Initiative Test:
 * Initiative Score = Initiative attribute + Initiative Dice roll
 * (brief F1, p. 159). `roll` is the already-known dice total so the
 * scenarios stay deterministic.
 */
function makeRolledParticipant(name: string, attribute: number, dice: number, roll: number): Participant {
  const p = makeParticipant(name);
  p.baseIni = attribute;
  p.setDicesWithoutRoll(dice);
  CombatManager.participants.insert(p, false);
  p.diceIni = roll;
  return p;
}

/** Reset the singleton CombatManager to a clean, un-started encounter. */
function resetCombat() {
  CombatManager.participants.clear(false);
  CombatManager.currentActors.clear(false);
  CombatManager.nextSortOrder = 0;
  CombatManager.initiativePass = 1;
  CombatManager.combatTurn = 1;
  CombatManager.started = false;
  CombatManager.passEnded = true;
}

const FULL_DEFENSE = interruptTable.find(a => a.key === 'fullDefense')!;

describe('CombatManager.copyParticipant', () => {
  beforeEach(() => {
    CombatManager.participants.clear(false);
    CombatManager.nextSortOrder = 0;
  });

  it('duplicating "Razor" renames source to "Razor 1" and creates "Razor 2"', () => {
    const p = makeParticipant('Razor');
    CombatManager.participants.insert(p, false);

    CombatManager.copyParticipant(p);

    const names = CombatManager.participants.items.map(x => x.name);
    expect(names).toContain('Razor 1');
    expect(names).toContain('Razor 2');
    expect(names.length).toBe(2);
  });

  it('duplicating "Razor 1" when "Razor 2" already exists creates "Razor 3"', () => {
    const p1 = makeParticipant('Razor 1');
    const p2 = makeParticipant('Razor 2');
    CombatManager.participants.insert(p1, false);
    CombatManager.participants.insert(p2, false);

    CombatManager.copyParticipant(p1);

    const names = CombatManager.participants.items.map(x => x.name);
    expect(names).toContain('Razor 3');
    expect(p1.name).toBe('Razor 1');
    expect(names.length).toBe(3);
  });

  it('does not throw for a name containing "." (e.g. "Razor.io Hacker")', () => {
    const p = makeParticipant('Razor.io Hacker');
    CombatManager.participants.insert(p, false);

    expect(() => CombatManager.copyParticipant(p)).not.toThrow();
    const names = CombatManager.participants.items.map(x => x.name);
    expect(names).toContain('Razor.io Hacker 1');
    expect(names).toContain('Razor.io Hacker 2');
  });

  it('does not throw for a name containing parentheses (e.g. "Lone Star (Officer)")', () => {
    const p = makeParticipant('Lone Star (Officer)');
    CombatManager.participants.insert(p, false);

    expect(() => CombatManager.copyParticipant(p)).not.toThrow();
    const names = CombatManager.participants.items.map(x => x.name);
    expect(names).toContain('Lone Star (Officer) 1');
    expect(names).toContain('Lone Star (Officer) 2');
  });

  it('"Troll" and "Trollkin Boss" are not treated as related', () => {
    const troll = makeParticipant('Troll');
    const trollkin = makeParticipant('Trollkin Boss 3');
    CombatManager.participants.insert(troll, false);
    CombatManager.participants.insert(trollkin, false);

    CombatManager.copyParticipant(troll);

    const names = CombatManager.participants.items.map(x => x.name);
    expect(names).toContain('Troll 1');
    expect(names).toContain('Troll 2');
    expect(names).not.toContain('Troll 4');
  });
});

// ---------------------------------------------------------------------------
// Running Initiative Score across passes.
// Rules facts and expected values come from the approved brief
// "Running Initiative Score Across Passes" (printed pages cited inline).
// ---------------------------------------------------------------------------

describe('Initiative Score is a running value, not a recompute', () => {
  beforeEach(() => {
    resetCombat();
  });

  // Acceptance criterion 1 (brief p. 159)
  it('seeds the Score once per Combat Turn as Initiative attribute + Initiative Dice roll', () => {
    const p = makeRolledParticipant('Kicker', 8, 1, 3);

    expect(p.initiativeAttribute).toBe(8);
    expect(p.currentInitiativeScore).toBe(11);
    expect(p.getCurrentInitiative()).toBe(11);
  });

  // Acceptance criterion 2 (brief pp. 159-160)
  it('subtracts exactly 10 from every participant on a pass advance', () => {
    const a = makeRolledParticipant('A', 10, 1, 5);
    const b = makeRolledParticipant('B', 4, 1, 2);

    CombatManager.nextIniPass();

    expect(a.currentInitiativeScore).toBe(5);
    expect(b.currentInitiativeScore).toBe(-4);
    expect(INITIATIVE_PASS_DECAY).toBe(10);
  });

  // Acceptance criterion 3 (brief pp. 160, 191)
  it('does not clamp at 0: 12, spend 10 on Full Defense, then a pass advance reads -8', () => {
    const p = makeRolledParticipant('Blackfeather', 8, 1, 4);
    expect(p.getCurrentInitiative()).toBe(12);

    p.doAction(FULL_DEFENSE);
    expect(p.getCurrentInitiative()).toBe(2);

    CombatManager.nextIniPass();
    expect(p.getCurrentInitiative()).toBe(-8);
  });

  // Acceptance criterion 4 (brief p. 159)
  it('only schedules a participant in a new pass when their Score is greater than 0', () => {
    const above = makeRolledParticipant('Above', 8, 1, 3);   // 11 -> 1
    const at = makeRolledParticipant('AtZero', 6, 1, 4);     // 10 -> 0

    CombatManager.nextIniPass();
    CombatManager.getNextActors();

    expect(above.currentInitiativeScore).toBe(1);
    expect(at.currentInitiativeScore).toBe(0);
    expect(CombatManager.currentActors.items.map(p => p.name)).toEqual(['Above']);
  });

  // Acceptance criterion 6 (brief F4, p. 160)
  it('applies an Initiative attribute change as a same-sized delta: attribute 8 / Score 11 -> attribute 10 -> Score 13', () => {
    const p = makeRolledParticipant('Implanted', 8, 1, 3);
    expect(p.currentInitiativeScore).toBe(11);

    p.baseIni = 10; // wired reflexes: +2 Initiative attribute

    expect(p.currentInitiativeScore).toBe(13);
    expect(p.appliedInitiativeAttribute).toBe(10);
  });

  // Acceptance criteria 7 and 8 (brief F5, p. 160)
  it('adds only the delta dice on a mid-turn Initiative Dice increase, and subtracts only the delta dice on a decrease', () => {
    const p = makeRolledParticipant('Jazzed', 9, 1, 4); // Score 13
    expect(p.currentInitiativeScore).toBe(13);

    // +2D6 gained, the two new dice roll 3 and 4: only that result is added.
    p.changeDiceCount(3, scriptedRoller([3, 4]));
    expect(p.currentInitiativeScore).toBe(20);

    // The 2D6 are lost again; the lost dice roll 2 and 3 and only that is removed.
    p.changeDiceCount(1, scriptedRoller([2, 3]));
    expect(p.currentInitiativeScore).toBe(15);
  });

  // Acceptance criterion 9 (brief pp. 52, 288): 5D6 hard cap, enforced by the
  // engine so every call site inherits it.
  describe('Participant.changeDiceCount', () => {
    it('caps the dice count at 5D6 and only rolls the dice actually gained', () => {
      const p = makeRolledParticipant('Overclocked', 9, 1, 4); // Score 13

      const result = p.changeDiceCount(9, scriptedRoller([1, 1, 1, 1, 1, 1, 1, 1]));

      expect(p.dices).toBe(5);              // not 9
      expect(result.values.length).toBe(4); // only the 4 dice actually gained
      expect(p.currentInitiativeScore).toBe(17);
    });

    it('caps the no-roll setter at 5D6 too', () => {
      const p = makeParticipant('Setup');
      p.setDicesWithoutRoll(12);
      expect(p.dices).toBe(5);
      p.setDicesWithoutRoll(0);
      expect(p.dices).toBe(1);
    });

    it('does not roll before the once-per-turn Initiative Test has been taken', () => {
      const p = makeParticipant('Unrolled');
      p.baseIni = 9;
      const before = p.currentInitiativeScore;

      const result = p.changeDiceCount(4, () => { throw new Error('must not roll'); });

      expect(p.dices).toBe(4);
      expect(result.values).toEqual([]);
      expect(p.currentInitiativeScore).toBe(before);
    });

    it('does not roll when the count does not actually change', () => {
      const p = makeRolledParticipant('Steady', 9, 3, 10);
      const before = p.currentInitiativeScore;

      const result = p.changeDiceCount(3, () => { throw new Error('must not roll'); });

      expect(result.delta).toBe(0);
      expect(p.currentInitiativeScore).toBe(before);
    });

    it('is undoable as part of the surrounding chapter', () => {
      const p = makeRolledParticipant('Jazzed', 9, 1, 4); // Score 13
      UndoHandler.StartActions();

      p.changeDiceCount(3, scriptedRoller([3, 4]));
      expect(p.currentInitiativeScore).toBe(20);

      UndoHandler.Undo();

      expect(p.dices).toBe(1);
      expect(p.diceIni).toBe(4);
      expect(p.currentInitiativeScore).toBe(13);
    });
  });

  // Acceptance criterion 10 (brief pp. 158, 160, 169)
  it('routes a wound modifier through the Initiative attribute into the Score, immediately, without granting an action', () => {
    const p = makeRolledParticipant('Wounded', 10, 1, 5); // Score 15
    p.status = StatusEnum.Finished; // already acted this pass

    p.physicalDamage = 6; // wound modifier 2 (floor(6/3))

    expect(p.wm).toBe(2);
    expect(p.initiativeAttribute).toBe(8);
    expect(p.currentInitiativeScore).toBe(13);
    expect(p.status).toBe(StatusEnum.Finished);
  });

  // Acceptance criterion 5 (brief p. 160) - engine-level half: a Score of 0 or
  // less removes the Action Phase, not the participant. Free Actions and
  // defence responses are UI-level and are not gated by the combat engine.
  it('keeps a participant at or below 0 in the encounter, only out of the acting order', () => {
    const p = makeRolledParticipant('Spent', 6, 1, 4); // Score 10

    CombatManager.nextIniPass();

    expect(p.currentInitiativeScore).toBe(0);
    expect(p.ooc).toBeFalse();
    expect(CombatManager.participants.items).toContain(p);
    CombatManager.getNextActors();
    expect(CombatManager.currentActors.items).not.toContain(p);
  });

  it('applies the pass decay exactly once - hasMoreIniPasses() only previews it', () => {
    const p = makeRolledParticipant('Preview', 11, 3, 11); // Score 22

    expect(CombatManager.hasMoreIniPasses()).toBeTrue();  // 22 - 10 > 0
    expect(p.currentInitiativeScore).toBe(22);            // preview is not a mutation

    CombatManager.nextIniPass();
    expect(p.currentInitiativeScore).toBe(12);
    expect(CombatManager.hasMoreIniPasses()).toBeTrue();  // 12 - 10 > 0

    CombatManager.nextIniPass();
    expect(p.currentInitiativeScore).toBe(2);
    expect(CombatManager.hasMoreIniPasses()).toBeFalse(); // 2 - 10 <= 0
  });

  it('re-seeds the Score at the Combat Turn boundary and keeps it out of the next turn', () => {
    const p = makeRolledParticipant('Fresh', 9, 1, 5); // Score 14
    CombatManager.nextIniPass();
    expect(p.currentInitiativeScore).toBe(4);

    CombatManager.endCombatTurn();

    expect(p.diceIni).toBe(0);
    expect(p.currentInitiativeScore).toBe(9); // bare Initiative attribute again

    p.diceIni = 6; // new turn's Initiative Test
    expect(p.currentInitiativeScore).toBe(15);
  });

  // Promoted to tests/scenarios/running-initiative-score.spec.ts as "the
  // defect this feature actually closes" - the test proving a bare Score
  // delta (unbacked by baseIni/diceIni/actionHistory) survives a pass
  // boundary in a way a recompute-from-base accessor could not reconstruct.

  it('late entry into an in-progress Combat Turn subtracts 10 per elapsed pass (p. 160, p. 193)', () => {
    makeRolledParticipant('Anchor', 10, 1, 6);
    CombatManager.started = true;
    CombatManager.nextIniPass(); // now in pass 2

    const late = makeParticipant('Bodyguard B');
    late.baseIni = 12;
    CombatManager.addParticipant(late); // joins after the first pass
    late.diceIni = 7;                   // rolls for Initiative Score as normal

    expect(late.currentInitiativeScore).toBe(9); // 12 + 7 - 10
  });

  it('re-adding an existing participant (in-place type swap) does not decay the Score twice', () => {
    // The swap target has NOT rolled yet, so it has already absorbed the pass
    // decay through nextIniPass(); re-inserting it must not subtract 10 again
    // (brief F6, p. 160 - once per elapsed pass, not twice).
    const unrolled = makeParticipant('Decker');
    unrolled.baseIni = 9;
    CombatManager.participants.insert(unrolled, false);
    CombatManager.started = true;

    CombatManager.nextIniPass(); // pass 2
    CombatManager.nextIniPass(); // pass 3
    expect(unrolled.currentInitiativeScore).toBe(-11); // 9 - 10 - 10

    const swapped = new MatrixParticipant();
    swapped.name = 'Decker';
    // A type swap copies the running Score backing field verbatim.
    (swapped as unknown as Record<string, unknown>)["_currentInitiativeScore"] =
      unrolled.currentInitiativeScore;
    (swapped as unknown as Record<string, unknown>)["_appliedInitiativeAttribute"] =
      unrolled.appliedInitiativeAttribute;
    CombatManager.removeParticipant(unrolled);
    CombatManager.addParticipant(swapped, true);

    expect(swapped.currentInitiativeScore).toBe(-11);
  });

  it('still decays a genuine late entrant that has not rolled yet', () => {
    makeRolledParticipant('Anchor', 10, 1, 6);
    CombatManager.started = true;
    CombatManager.nextIniPass(); // pass 2

    const late = makeParticipant('Latecomer');
    late.baseIni = 12;
    CombatManager.addParticipant(late); // default: genuine late entry
    late.diceIni = 7;

    expect(late.currentInitiativeScore).toBe(9); // 12 + 7 - 10
  });

  it('clone() folds committed Interrupt Action spend into the copy\'s running Score', () => {
    // The reduction occurs at the time of the Interrupt Action (brief F9,
    // p. 167) and must not be refunded by a clone / type swap that drops the
    // action history.
    const p = makeRolledParticipant('Spender', 10, 1, 6); // Score 16
    p.doAction(FULL_DEFENSE);                             // -10 -> 6
    expect(p.getCurrentInitiative()).toBe(6);

    const copy = p.clone();
    expect(copy.actionHistory).toEqual([]);
    expect(copy.getCurrentInitiative()).toBe(6);
    expect(copy.currentInitiativeScore).toBe(6);

    // ...and the same for the Matrix/astral clone overrides.
    const mp = new MatrixParticipant();
    mp.baseIni = 10;
    CombatManager.participants.insert(mp, false);
    mp.diceIni = 6;          // Score 16
    mp.doAction(FULL_DEFENSE); // -> 6
    expect(mp.clone().getCurrentInitiative()).toBe(6);

    const ap = new AstralParticipant();
    ap.baseIni = 10;
    CombatManager.participants.insert(ap, false);
    ap.diceIni = 6;
    ap.doAction(FULL_DEFENSE);
    expect(ap.clone().getCurrentInitiative()).toBe(6);
  });

  it('undo reverses a pass advance as a single step', () => {
    const a = makeRolledParticipant('A', 10, 1, 5); // 15
    const b = makeRolledParticipant('B', 8, 1, 4);  // 12

    UndoHandler.StartActions();
    CombatManager.nextIniPass();
    expect(a.currentInitiativeScore).toBe(5);
    expect(b.currentInitiativeScore).toBe(2);
    expect(CombatManager.initiativePass).toBe(2);

    UndoHandler.Undo();

    expect(a.currentInitiativeScore).toBe(15);
    expect(b.currentInitiativeScore).toBe(12);
    expect(CombatManager.initiativePass).toBe(1);
  });

  it('undo reverses an Initiative attribute change back out of the Score', () => {
    const p = makeRolledParticipant('Implanted', 8, 1, 3); // 11

    UndoHandler.StartActions();
    p.baseIni = 10;
    expect(p.currentInitiativeScore).toBe(13);

    UndoHandler.Undo();

    expect(p.baseIni).toBe(8);
    expect(p.currentInitiativeScore).toBe(11);
    expect(p.appliedInitiativeAttribute).toBe(8);
  });

  it('clone() and the Matrix/astral clone overrides carry the running Score', () => {
    const p = makeRolledParticipant('Original', 10, 1, 6); // 16
    CombatManager.nextIniPass();                           // 6

    const plain = p.clone();
    expect(plain.currentInitiativeScore).toBe(6);
    expect(plain.appliedInitiativeAttribute).toBe(10);

    const mp = new MatrixParticipant();
    mp.baseIni = 9;
    CombatManager.participants.insert(mp, false);
    mp.diceIni = 8; // Score 17
    const matrixClone = mp.clone();
    expect(matrixClone.currentInitiativeScore).toBe(17);

    const ap = new AstralParticipant();
    ap.baseIni = 7;
    CombatManager.participants.insert(ap, false);
    ap.diceIni = 4; // Score 11
    const astralClone = ap.clone();
    expect(astralClone.currentInitiativeScore).toBe(11);
  });
});

// Brief scenarios S1-S3, and "the defect this feature actually closes", have
// been promoted to tests/scenarios/running-initiative-score.spec.ts.
