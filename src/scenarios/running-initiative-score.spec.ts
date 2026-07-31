// Promoted regression scenarios for the "Running Initiative Score Across
// Passes" feature (briefs/running-initiative-score.md). These are the named
// Gameplay Scenarios from the rules brief (S1-S3) plus the one test that
// actually proves the recompute-from-base bug is closed - see that test's
// comment for why S1-S3 alone would not have caught it.

import { CombatManager } from 'Combat';
import { Participant, INITIATIVE_PASS_DECAY } from 'Combat/Participants/Participant';
import { IParticipant } from 'Combat/Participants/IParticipant';
import { interruptTable } from 'InterruptTable';

function makeParticipant(name: string): Participant {
  const p = new Participant();
  p.name = name;
  return p;
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

/** Participants eligible to act, highest Initiative Score first. */
function actingOrder(): string[] {
  return CombatManager.participants.items
    .filter(p => !p.ooc && p.getCurrentInitiative() > 0)
    .slice()
    .sort((a, b) => b.getCurrentInitiative() - a.getCurrentInitiative())
    .map(p => p.name);
}

/**
 * What the pre-fix, recompute-from-base accessor would have returned:
 *   diceIni + baseIni - wm - (initiativePass - 1) * 10 + actionIniModifier
 * Used as an oracle so this file can state, explicitly, where the running
 * Score does and does not diverge from a recompute.
 */
function recomputeFromBase(p: IParticipant): number {
  return p.diceIni + p.baseIni - p.wm
    - (CombatManager.initiativePass - 1) * INITIATIVE_PASS_DECAY
    + p.actionIniModifier;
}

const FULL_DEFENSE = interruptTable.find(a => a.key === 'fullDefense')!;
const BLOCK = interruptTable.find(a => a.key === 'block')!;
const PARRY = interruptTable.find(a => a.key === 'parry')!;

describe('Brief scenario S1 - the three-participant example (p. 160)', () => {
  beforeEach(() => {
    resetCombat();
  });

  it('walks Cayman 22 / Halloweener 16 / Pete 10 through three passes without clamping', () => {
    // Book values (p. 160): Cayman Initiative Rating 11, 3 dice totalling 11;
    // the Halloweener Rating 7, 2 dice totalling 9; Saskatchewan Pete Rating 8,
    // 1 die totalling 2.
    const cayman = makeRolledParticipant('Cayman', 11, 3, 11);
    const halloweener = makeRolledParticipant('Halloweener', 7, 2, 9);
    const pete = makeRolledParticipant('Saskatchewan Pete', 8, 1, 2);

    // Pass 1
    expect(cayman.getCurrentInitiative()).toBe(22);
    expect(halloweener.getCurrentInitiative()).toBe(16);
    expect(pete.getCurrentInitiative()).toBe(10);
    expect(actingOrder()).toEqual(['Cayman', 'Halloweener', 'Saskatchewan Pete']);

    // End of pass 1: subtract 10
    CombatManager.nextIniPass();
    expect(cayman.getCurrentInitiative()).toBe(12);
    expect(halloweener.getCurrentInitiative()).toBe(6);
    expect(pete.getCurrentInitiative()).toBe(0);
    // Pass 2: Pete is out, he is not greater than 0
    expect(actingOrder()).toEqual(['Cayman', 'Halloweener']);

    // End of pass 2: subtract 10 again, negatives are kept
    CombatManager.nextIniPass();
    expect(cayman.getCurrentInitiative()).toBe(2);
    expect(halloweener.getCurrentInitiative()).toBe(-4); // not clamped at 0
    expect(pete.getCurrentInitiative()).toBe(-10);
    // Pass 3: Cayman alone
    expect(actingOrder()).toEqual(['Cayman']);

    // End of pass 3: nobody is left, the Combat Turn is over
    CombatManager.nextIniPass();
    expect(cayman.getCurrentInitiative()).toBe(-8);
    expect(actingOrder()).toEqual([]);
    expect(CombatManager.isOver()).toBeTrue();
  });
});

describe('Brief scenario S2 - mid-turn attribute change applied after decay (p. 160)', () => {
  beforeEach(() => {
    resetCombat();
  });

  it('Kicker 11 -> 1 -> +2 attribute -> +1D6(4) -> 7 -> -3, and no third pass', () => {
    const kicker = makeRolledParticipant('Kicker', 8, 1, 3);
    expect(kicker.getCurrentInitiative()).toBe(11);

    // End of pass 1
    CombatManager.nextIniPass();
    expect(kicker.getCurrentInitiative()).toBe(1);

    // In pass 2, after decay: wireless wired reflexes 1.
    // +1 Reaction -> Initiative attribute 8 -> 10, applied as +2 to the
    // running Score (p. 160): 1 + 2 = 3.
    kicker.baseIni = 10;
    expect(kicker.getCurrentInitiative()).toBe(3);

    // ...and +1D6: roll only the new die (4) and add it: 3 + 4 = 7.
    kicker.changeDiceCount(2, () => 4);
    expect(kicker.getCurrentInitiative()).toBe(7);
    expect(kicker.currentInitiativeScore).toBe(7);

    // He acts in pass 2. End of pass 2.
    CombatManager.nextIniPass();
    expect(kicker.getCurrentInitiative()).toBe(-3);

    // No third pass.
    expect(actingOrder()).toEqual([]);
    expect(CombatManager.isOver()).toBeTrue();
    expect(CombatManager.hasMoreIniPasses()).toBeFalse();
  });
});

describe('Brief scenario S3 - Interrupt Action spend followed by a pass boundary (pp. 167, 191)', () => {
  beforeEach(() => {
    resetCombat();
  });

  it('Wombat 26 -> Full Defense 16 -> Block 11 -> 1 -> -9, and the Parry is refused', () => {
    const wombat = makeRolledParticipant('Wombat', 20, 1, 6);
    expect(wombat.getCurrentInitiative()).toBe(26);

    // Full Defense: -10, debited at the time of the Interrupt Action.
    expect(wombat.canUseAction(FULL_DEFENSE)).toBeTrue();
    wombat.doAction(FULL_DEFENSE);
    expect(wombat.getCurrentInitiative()).toBe(16);

    // Block: -5.
    expect(wombat.canUseAction(BLOCK)).toBeTrue();
    wombat.doAction(BLOCK);
    expect(wombat.getCurrentInitiative()).toBe(11);

    // End of pass 1: the 15 points already spent stay spent.
    CombatManager.nextIniPass();
    expect(wombat.getCurrentInitiative()).toBe(1);

    // He acts in pass 2 on Score 1. End of pass 2.
    CombatManager.nextIniPass();
    expect(wombat.getCurrentInitiative()).toBe(-9);

    // Pass 3: Parry costs 5 and the Score is already in the negatives.
    expect(wombat.canUseAction(PARRY)).toBeFalse();
  });
});

describe('The defect this feature actually closes', () => {
  beforeEach(() => {
    resetCombat();
  });

  // S1-S3 above are the brief's own worked examples, and (as documented in
  // briefs/running-initiative-score.md) a hand-derivation showed the pre-fix
  // recompute-from-base formula happened to produce the same numbers for all
  // three, because every mutation those scenarios exercise (attribute change,
  // dice change, Interrupt spend) was already representable in baseIni /
  // diceIni / actionHistory. This test is the one that actually diverges: a
  // bare Initiative Score debit not backed by any of those fields (the shape
  // Surprise p. 192, Shake Up p. 196, and Electricity p. 171 all take) has no
  // representation for a recompute accessor to reconstruct.
  it('stores a Score delta that no base field can express, and carries it across a pass boundary', () => {
    const p = makeRolledParticipant('Shaken', 10, 1, 6); // Score 16

    p.applyInitiativeScoreDelta(-5);
    expect(p.currentInitiativeScore).toBe(11);
    expect(recomputeFromBase(p)).toBe(16); // recompute-from-base loses the debit

    CombatManager.nextIniPass();
    expect(p.currentInitiativeScore).toBe(1);   // running: 16 - 5 - 10
    expect(recomputeFromBase(p)).toBe(6);       // recompute: 16 - 10
    expect(p.getCurrentInitiative()).not.toBe(recomputeFromBase(p));
  });
});
