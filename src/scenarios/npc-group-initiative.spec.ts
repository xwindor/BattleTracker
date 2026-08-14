// Promoted regression scenarios for the "NPC Group Initiative (linked rows)"
// feature (briefs/npc-group-initiative.md). These are the brief's own named
// Gameplay Scenarios S1-S8, walked step by step, with the expected outcome
// asserted at each step. Per-criterion tests live in src/Grunts/npc-row.spec.ts.
//
// S3, S6, S7 and S8 encode the brief's DECISIONS (2026-08-01), which depart
// from RAW in named places - each is called out where it is tested.

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BattleTrackerComponent } from 'app/battle-tracker/battle-tracker.component';
import { appConfig } from 'app/app.config';
import { CombatManager } from 'Combat';
import { Participant, INITIATIVE_PASS_DECAY } from 'Combat/Participants/Participant';
import { IParticipant } from 'Combat/Participants/IParticipant';
import { AstralParticipant, ASTRAL_INITIATIVE_DICE } from 'Magic';
import { MatrixParticipant } from 'Matrix';
import { LogHandler } from 'Logging';
import { interruptTable } from 'InterruptTable';
import { GruntMember, NpcRowParticipant } from 'Grunts';

const FULL_DEFENSE = interruptTable.find(a => a.key === 'fullDefense')!;

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

function makeRolledParticipant(name: string, attribute: number, dice: number, roll: number): Participant {
  const p = new Participant();
  p.name = name;
  p.baseIni = attribute;
  p.setDicesWithoutRoll(dice);
  CombatManager.participants.insert(p, false);
  p.diceIni = roll;
  return p;
}

/**
 * A linked row that has taken its one Initiative Test (criterion 1, p. 379).
 * `roll` is the known dice total so the scenarios stay deterministic.
 */
function makeRolledRow(
  name: string,
  attribute: number,
  dice: number,
  roll: number,
  memberNames: string[]
): NpcRowParticipant {
  const row = new NpcRowParticipant();
  row.name = name;
  row.baseIni = attribute;
  row.setDicesWithoutRoll(dice);
  for (const memberName of memberNames) {
    row.addMember(new GruntMember(memberName, 3, 3));
  }
  CombatManager.participants.insert(row, false);
  row.diceIni = roll;
  return row;
}

/** Everyone eligible to act this pass, highest Initiative Score first. */
function actingOrder(): string[] {
  return CombatManager.participants.items
    .filter(p => !p.ooc && p.getCurrentInitiative() > 0)
    .slice()
    .sort((a, b) => b.getCurrentInitiative() - a.getCurrentInitiative())
    .map(p => p.name);
}

describe('S1 - ordinary case: four gangers on one shared score', () => {
  beforeEach(resetCombat);
  afterEach(resetCombat);

  it('rolls once for the row, holds one slot, and decays once per pass', () => {
    // "GM rolls one Initiative Test: 7 + 2D6 = 15. All four NPCs read
    // Initiative Score 15" (p. 379).
    const row = makeRolledRow('Gangers', 7, 2, 8, ['Ganger 1', 'Ganger 2', 'Ganger 3', 'Ganger 4']);
    const cayman = makeRolledParticipant('Cayman', 11, 3, 11);        // 22
    const pete = makeRolledParticipant('Saskatchewan Pete', 8, 1, 2); // 10

    expect(row.getCurrentInitiative()).toBe(15);
    expect(row.members.length).toBe(4);

    // Order: Cayman 22, row 15, Pete 10 - one entry for the row (criterion 2).
    expect(actingOrder()).toEqual(['Cayman', 'Gangers', 'Saskatchewan Pete']);
    expect(CombatManager.participants.count).toBe(3);

    // Cayman acts; the row then holds the slot alone and all four gangers act
    // back-to-back inside it.
    CombatManager.getNextActors();
    expect(CombatManager.currentActors.items).toEqual([cayman]);
    CombatManager.act(cayman);
    expect(CombatManager.currentActors.items).toEqual([row]);
    expect(row.activeMembers.map(m => m.name))
      .toEqual(['Ganger 1', 'Ganger 2', 'Ganger 3', 'Ganger 4']);
    CombatManager.act(row);
    expect(CombatManager.currentActors.items).toEqual([pete]);
    CombatManager.act(pete);

    // End of pass: everyone -10 (p. 159). The row loses 10, not 10 per member.
    CombatManager.nextIniPass();
    expect(cayman.getCurrentInitiative()).toBe(12);
    expect(row.getCurrentInitiative()).toBe(5);
    expect(pete.getCurrentInitiative()).toBe(0);

    // Second pass: Cayman, then all four gangers again; Pete is at 0 and gets
    // only a Free Action (p. 160) - he is not scheduled.
    expect(actingOrder()).toEqual(['Cayman', 'Gangers']);
    expect(row.activeMembers.length).toBe(4);
    CombatManager.getNextActors();
    expect(CombatManager.currentActors.items).toEqual([cayman]);
    CombatManager.act(cayman);
    expect(CombatManager.currentActors.items).toEqual([row]);
    expect(CombatManager.participants.contains(pete)).toBeTrue(); // still there to defend
  });
});

describe('S2 - ties: row vs. a PC (ERIC), and row vs. its lieutenant (manual)', () => {
  let component: BattleTrackerComponent;
  let fixture: ComponentFixture<BattleTrackerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BattleTrackerComponent],
      providers: appConfig.providers
    }).compileComponents();
    fixture = TestBed.createComponent(BattleTrackerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    resetCombat();
  });

  afterEach(resetCombat);

  /**
   * The order the GM and players actually see, via the real comparator
   * (`initiativeTieBreakComparator`). `sort()` only orders by initiative once
   * combat is running - before that the list is in the GM's manual sort order.
   */
  function displayedOrder(): string[] {
    CombatManager.started = true;
    component.sort();
    return CombatManager.participants.items.map(p => p.name);
  }

  it('gives the tie to the PC, because the row has no Edge attribute', () => {
    const row = makeRolledRow('Gangers', 8, 2, 8, ['G1', 'G2', 'G3', 'G4']); // 16
    const wombat = makeRolledParticipant('Wombat', 10, 1, 6);                // 16
    // The row is created through the GM path so it gets the Edge rating the
    // feature assigns it: 0 (Decision 5) - grunts have no Edge attribute.
    component['participantEdgeRatings'].set(row, 0);
    component['participantReactions'].set(row, 4);
    component['participantIntuitions'].set(row, 4);
    component['participantEdgeRatings'].set(wombat, 3);
    component['participantReactions'].set(wombat, 5);
    component['participantIntuitions'].set(wombat, 5);

    expect(row.getCurrentInitiative()).toBe(16);
    expect(wombat.getCurrentInitiative()).toBe(16);
    expect(displayedOrder()).toEqual(['Wombat', 'Gangers']);
  });

  it('falls through Edge to Reaction, then Intuition, when neither side has Edge', () => {
    const row = makeRolledRow('Gangers', 8, 2, 8, ['G1']);      // 16
    const thug = makeRolledParticipant('Thug', 10, 1, 6);       // 16
    component['participantEdgeRatings'].set(row, 0);
    component['participantEdgeRatings'].set(thug, 0);
    component['participantReactions'].set(row, 6);
    component['participantReactions'].set(thug, 4);

    expect(displayedOrder()).toEqual(['Gangers', 'Thug']); // Reaction decides

    component['participantReactions'].set(thug, 6);
    component['participantIntuitions'].set(row, 2);
    component['participantIntuitions'].set(thug, 5);

    expect(displayedOrder()).toEqual(['Thug', 'Gangers']); // then Intuition
  });

  it('does NOT automate the lieutenant-goes-first rule (Decision 6, out of scope)', () => {
    const row = makeRolledRow('Gangers', 8, 2, 8, ['G1', 'G2']);        // 16
    const lt = makeRolledParticipant('Lieutenant', 10, 1, 6);           // 16
    for (const p of [row, lt] as IParticipant[]) {
      component['participantEdgeRatings'].set(p, 0);
      component['participantReactions'].set(p, 4);
      component['participantIntuitions'].set(p, 4);
    }
    // Identical ERIC stats: the tie falls to the coin toss, and nothing puts
    // the lieutenant ahead of his own team automatically (p. 381 unimplemented).
    component['participantTieBreakers'].set(row, 0.9);
    component['participantTieBreakers'].set(lt, 0.1);

    expect(displayedOrder()).toEqual(['Gangers', 'Lieutenant']);

    // The GM reorders by hand - that is the whole of the support for p. 381.
    component['participantTieBreakers'].set(lt, 0.99);
    expect(displayedOrder()).toEqual(['Lieutenant', 'Gangers']);
  });
});

describe('S3 - mid-Combat-Turn wound: the house rule under test (Decision 1)', () => {
  let component: BattleTrackerComponent;
  let fixture: ComponentFixture<BattleTrackerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BattleTrackerComponent],
      providers: appConfig.providers
    }).compileComponents();
    fixture = TestBed.createComponent(BattleTrackerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    resetCombat();
  });

  afterEach(resetCombat);

  it('drops the WHOLE row to 13, not just the wounded ganger', () => {
    const row = makeRolledRow('Gangers', 7, 2, 8, ['Ganger 1', 'Ganger 2', 'Ganger 3', 'Ganger 4']);
    const wombat = makeRolledParticipant('Wombat', 10, 1, 6);
    CombatManager.started = true;
    expect(row.getCurrentInitiative()).toBe(15);

    // Wombat shoots ganger 3 for 6 boxes: a -2 wound modifier (p. 169).
    const ganger3 = row.members[2];
    component.applyRowMemberDamage(row, ganger3, 6, 'physical');

    // RAW (p. 379/170/160) would move ganger 3 alone to 13. Decision 1: the
    // whole row moves together and nobody splits off.
    expect(row.getCurrentInitiative()).toBe(13);
    expect(row.activeMembers.length).toBe(4);
    expect(row.activeMembers.map(m => m.name))
      .toEqual(['Ganger 1', 'Ganger 2', 'Ganger 3', 'Ganger 4']);
    // Still one slot in the order, still back-to-back, still ahead of nobody
    // new: Wombat is unaffected.
    expect(CombatManager.participants.count).toBe(2);
    expect(wombat.getCurrentInitiative()).toBe(16);
  });

  it('still gives ganger 3 the -2 on his own dice pools (p. 170)', () => {
    const row = makeRolledRow('Gangers', 7, 2, 8, ['Ganger 1', 'Ganger 2', 'Ganger 3']);
    component.applyRowMemberDamage(row, row.members[2], 6, 'physical');

    expect(row.members[2].wm).toBe(2);
    expect(row.members[0].wm).toBe(0);
    expect(row.members[1].wm).toBe(0);
  });

  it('logs that the group-wide house rule fired and which NPC triggered it', () => {
    const row = makeRolledRow('Gangers', 7, 2, 8, ['Ganger 1', 'Ganger 2', 'Ganger 3']);
    const before = LogHandler.logbook.length;

    component.applyRowMemberDamage(row, row.members[2], 6, 'physical');

    const lines = LogHandler.logbook.slice(before).map(e => e.text);
    const houseRuleLine = lines.find(t => /house rule/i.test(t));
    expect(houseRuleLine).withContext('group wound log line').toBeTruthy();
    expect(houseRuleLine).toContain('Ganger 3'); // which NPC's wound did it
    expect(houseRuleLine).toContain('13');       // the new shared score
  });

  it('applies the change immediately, within the same Initiative Pass', () => {
    const row = makeRolledRow('Gangers', 7, 2, 8, ['G1']);
    const rival = makeRolledParticipant('Rival', 8, 1, 6); // 14, below the row
    CombatManager.started = true;
    expect(actingOrder()).toEqual(['Gangers', 'Rival']);

    component.applyRowMemberDamage(row, row.members[0], 6, 'physical'); // -2

    expect(row.getCurrentInitiative()).toBe(13);
    expect(actingOrder()).toEqual(['Rival', 'Gangers']); // reorders mid-pass
  });
});

describe('S4 - two initiative tracks at once: the street witch projects', () => {
  beforeEach(resetCombat);
  afterEach(resetCombat);

  it('leaves the row\'s shared score untouched even when the NPC leaving is wounded', () => {
    const row = makeRolledRow('Gangers', 7, 2, 8, ['G1', 'G2', 'G3', 'Witch']); // 15
    const witch = row.members[3];
    row.applyDamageToMember(witch, 6, 'physical'); // -2, on the whole row
    expect(row.getCurrentInitiative()).toBe(13);

    row.detachMember(witch, () => new AstralParticipant());

    // "The remaining three gangers keep the row's original shared score
    // untouched" - the detach itself moves nothing, in either direction.
    expect(row.getCurrentInitiative()).toBe(13);
    expect(row.activeMembers.map(m => m.name)).toEqual(['G1', 'G2', 'G3']);
  });

  it('detaches her onto her own astral row and leaves the rest of the row alone', () => {
    const row = makeRolledRow('Gangers', 7, 2, 8, ['G1', 'G2', 'G3', 'Witch']); // 15
    const witch = row.members[3];

    // She cannot stay on a physical row's shared score (criterion 13).
    const projected = row.detachMember(witch, () => new AstralParticipant()) as AstralParticipant;
    CombatManager.addParticipant(projected);
    projected.astralProjecting = true;
    projected.baseIni = 10;                                    // INT 5 x 2 (p. 159)
    projected.setDicesWithoutRoll(ASTRAL_INITIATIVE_DICE);      // 2D6 astral (p. 159)
    projected.diceIni = 7;

    expect(projected.getCurrentInitiative()).toBe(17);
    // The remaining three gangers keep the row's original shared score.
    expect(row.getCurrentInitiative()).toBe(15);
    expect(row.activeMembers.map(m => m.name)).toEqual(['G1', 'G2', 'G3']);
    // Her body's Condition Monitor came with her and is still hers alone.
    expect(projected.physicalHealth).toBe(witch.conditionMonitorBoxes);
  });

  it('does the same for a decker NPC switching to hot-sim VR', () => {
    const row = makeRolledRow('Gangers', 7, 2, 8, ['G1', 'Decker']); // 15
    const decker = row.detachMember(row.members[1], () => new MatrixParticipant()) as MatrixParticipant;
    CombatManager.addParticipant(decker);

    expect(decker instanceof MatrixParticipant).toBeTrue();
    expect(row.activeMembers.map(m => m.name)).toEqual(['G1']);
    expect(row.getCurrentInitiative()).toBe(15);
  });
});

describe('S5 - unconscious member', () => {
  beforeEach(resetCombat);
  afterEach(resetCombat);

  it('takes ganger 2 out, keeps the shared score, and keeps the rest acting', () => {
    const row = makeRolledRow('Gangers', 7, 2, 8, ['Ganger 1', 'Ganger 2', 'Ganger 3', 'Ganger 4']);
    const ganger2 = row.members[1];
    CombatManager.started = true;

    // A mix of Stun and Physical on the one combined track (p. 379).
    row.applyDamageToMember(ganger2, 5, 'stun');
    expect(row.getCurrentInitiative()).toBe(14); // -1 from his wounds (Decision 1)
    row.applyDamageToMember(ganger2, 5, 'physical');

    expect(ganger2.damage).toBe(10);
    expect(ganger2.outOfAction).toBeTrue();
    // Out for the rest of the fight, skipped every time the row comes up.
    expect(row.activeMembers.map(m => m.name)).toEqual(['Ganger 1', 'Ganger 3', 'Ganger 4']);
    // The shared score does not move because he went down - only from the
    // wound thresholds his damage crossed on the way (3 of them: -3 total).
    expect(row.getCurrentInitiative()).toBe(12);
    expect(row.ooc).toBeFalse();
    expect(CombatManager.participants.contains(row)).toBeTrue();

    // The app records what the finishing blow was, for later interrogation.
    expect(ganger2.lastDamageType).toBe('physical');
    expect(ganger2.lastDamageValue).toBe(5);
    expect(ganger2.finalState).toBe('dead'); // Physical DV 5 > Body 3 (p. 379)
  });

  it('records "alive" when the finishing blow was Stun', () => {
    const row = makeRolledRow('Gangers', 7, 2, 8, ['G1', 'G2']);
    const g2 = row.members[1];
    row.applyDamageToMember(g2, 5, 'physical');
    row.applyDamageToMember(g2, 5, 'stun');

    expect(g2.outOfAction).toBeTrue();
    expect(g2.finalState).toBe('alive');
  });

  it('does not automate any Professional Rating morale reaction (out of scope)', () => {
    const row = makeRolledRow('Gangers', 7, 2, 8, ['G1', 'G2', 'G3']);
    row.applyDamageToMember(row.members[0], 10, 'physical');

    // Nobody flees, nothing is flagged: the other two are still scheduled.
    expect(row.activeMembers.length).toBe(2);
    expect(row.ooc).toBeFalse();
    expect((row as unknown as Record<string, unknown>)['morale']).toBeUndefined();
  });
});

describe('S6 - surprise: deliberately not modelled (Decision 2)', () => {
  beforeEach(resetCombat);
  afterEach(resetCombat);

  it('does nothing to a row when the PCs ambush it', () => {
    const row = makeRolledRow('Gangers', 7, 2, 8, ['G1', 'G2', 'G3', 'G4']);
    const scoreBefore = row.getCurrentInitiative();
    const membersBefore = row.members.length;

    // There is no surprise API to call: no row-level test, no per-NPC flags.
    const api = [
      ...Object.getOwnPropertyNames(NpcRowParticipant.prototype),
      ...Object.getOwnPropertyNames(GruntMember.prototype)
    ];
    expect(api.filter(k => /surprise/i.test(k))).toEqual([]);

    expect(row.getCurrentInitiative()).toBe(scoreBefore); // no -10, no split
    expect(row.members.length).toBe(membersBefore);
    expect(CombatManager.participants.count).toBe(1);
  });

  it('leaves the GM the workflow it does support: two rows set up separately', () => {
    const surprised = makeRolledRow('Gangers (surprised)', 7, 2, 8, ['G1', 'G2']);
    const ready = makeRolledRow('Gangers (ready)', 7, 2, 8, ['G3', 'G4']);
    // The GM expresses the split by rolling the two rows differently; the
    // tracker neither helps nor hinders.
    surprised.applyInitiativeScoreDelta(-10);

    expect(surprised.getCurrentInitiative()).toBe(5);
    expect(ready.getCurrentInitiative()).toBe(15);
    expect(actingOrder()).toEqual(['Gangers (ready)', 'Gangers (surprised)']);
  });
});

describe('S7 - reinforcements joining an existing row (Decision 7)', () => {
  beforeEach(resetCombat);
  afterEach(resetCombat);

  it('slots two more gangers straight onto the row\'s current score, no roll, no penalty', () => {
    const row = makeRolledRow('Gangers', 7, 2, 8, ['G1', 'G2', 'G3', 'G4']); // 15
    CombatManager.started = true;

    CombatManager.nextIniPass(); // start of the second Initiative Pass
    expect(CombatManager.initiativePass).toBe(2);
    expect(row.getCurrentInitiative()).toBe(5);

    const g5 = row.addMember(new GruntMember('G5', 3, 3));
    const g6 = row.addMember(new GruntMember('G6', 3, 3));

    // No Initiative Test for them, and no -10 for the elapsed pass (p. 160 is
    // deliberately not applied here).
    expect(row.getCurrentInitiative()).toBe(5);
    expect(row.activeMembers.map(m => m.name)).toEqual(['G1', 'G2', 'G3', 'G4', 'G5', 'G6']);
    expect(CombatManager.participants.count).toBe(1);

    // From here they act back-to-back with the rest of the row.
    CombatManager.getNextActors();
    expect(CombatManager.currentActors.items).toEqual([row]);
    expect(row.activeMembers).toContain(g5);
    expect(row.activeMembers).toContain(g6);
  });

  it('still charges a reinforcement forming its OWN row the p. 160 late-entry penalty', () => {
    makeRolledRow('Gangers', 7, 2, 8, ['G1']);
    CombatManager.started = true;
    CombatManager.nextIniPass(); // one pass elapsed

    const fresh = new NpcRowParticipant();
    fresh.name = 'Reinforcements';
    fresh.baseIni = 7;
    fresh.addMember(new GruntMember('R1', 3, 3));
    CombatManager.addParticipant(fresh);
    fresh.diceIni = 8; // its own Initiative Test: 15

    expect(fresh.getCurrentInitiative()).toBe(15 - INITIATIVE_PASS_DECAY); // 5
  });
});

describe('S8 - Interrupt Action attempted from inside a row (Decision 3)', () => {
  beforeEach(resetCombat);
  afterEach(resetCombat);

  it('refuses Full Defense for ganger 1 while he is still in the row', () => {
    const row = makeRolledRow('Gangers', 7, 2, 8, ['Ganger 1', 'Ganger 2']); // 15

    expect(row.canUseAction(FULL_DEFENSE)).toBeFalse();
    expect(row.getCurrentInitiative()).toBe(15); // nothing paid, nothing changed
    expect(row.actionHistory).toEqual([]);
  });

  it('allows it once ganger 1 is detached, with the cost landing on him alone', () => {
    const row = makeRolledRow('Gangers', 7, 2, 8, ['Ganger 1', 'Ganger 2']); // 15

    const ganger1 = row.detachMember(row.members[0])!;
    CombatManager.addParticipant(ganger1);
    ganger1.diceIni = 8; // his own Initiative Test: 15

    expect(ganger1.canUseAction(FULL_DEFENSE)).toBeTrue();
    ganger1.doAction(FULL_DEFENSE);

    expect(ganger1.getCurrentInitiative()).toBe(5); // -10, on him
    expect(row.getCurrentInitiative()).toBe(15);    // the row never paid
    expect(row.activeMembers.map(m => m.name)).toEqual(['Ganger 2']);
  });
});
