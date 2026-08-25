// Promoted regression scenarios for "the grunt heal control applies the DV
// input" (briefs/grunt-heal-uses-dv-input.md, spec
// briefs/grunt-heal-uses-dv-input-spec.md). The heal control on both grunt
// Condition Monitor panels — the per-member button inside an expanded row and
// the standalone/detached grunt button — takes the number in the adjacent DV
// input, exactly as the P and S damage buttons already do, instead of a
// hard-coded single box. Left at the DV default of 1 both behave as they did
// before the change.
//
// Named Heal-DV1..Heal-DV6b rather than S1..S6 so they cannot be confused with
// the unrelated S1-S8 scenarios in src/scenarios/npc-group-initiative.spec.ts,
// which cover a different brief for the same feature area. Per-criterion tests
// for the surrounding grunt DV controls live in src/Grunts/npc-row.spec.ts
// (Decision 20).

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BattleTrackerComponent } from 'app/battle-tracker/battle-tracker.component';
import { appConfig } from 'app/app.config';
import { CombatManager } from 'Combat';
import { Participant } from 'Combat/Participants/Participant';
import { LogHandler } from 'Logging';
import { NpcRowParticipant } from 'Grunts';

/** Reset the singleton CombatManager to a clean, un-started encounter. */
function resetCombat() {
  CombatManager.participants.clear();
  CombatManager.currentActors.clear();
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
  CombatManager.participants.insert(p);
  p.diceIni = roll;
  return p;
}

describe('Grunt heal applies the DV input (briefs/grunt-heal-uses-dv-input.md)', () => {
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

  /** A row created the way the GM's Grunt Group button creates one. */
  function gmRow(name: string, attribute: number, roll: number, memberNames: string[]): NpcRowParticipant {
    const row = component.addNpcRow(false);
    row.name = name;
    row.baseIni = attribute;
    row.setDicesWithoutRoll(2);
    for (const memberName of memberNames) {
      component.addNpcToRow(row, memberName);
    }
    row.diceIni = roll;
    return row;
  }

  it('Heal-DV1: the row heal button removes the DV in the box, not one box', () => {
    const row = gmRow('Gangers', 7, 8, ['G 1', 'G 2']);
    const [g1, g2] = [row.members[0], row.members[1]];
    component.applyRowMemberDamage(row, g1, 8, 'physical');
    component.setRowMemberDamageValue(g1, 6);
    const before = LogHandler.logbook.length;

    const result = component.healRowMember(row, g1);   // no explicit amount

    expect(result.healed).toBe(6);
    expect(g1.damage).toBe(2);
    expect(g2.damage).withContext('other members untouched').toBe(0);
    const lines = LogHandler.logbook.slice(before).map(e => e.text);
    expect(lines.find(t => /G 1 healed 6/.test(t))).toBeTruthy();
    expect(lines.filter(t => /healed 1\b/.test(t)).length).toBe(0);
  });

  it('Heal-DV2: over-heals down to zero and no further, and still defaults to one box', () => {
    const row = gmRow('Gangers', 7, 8, ['G 1', 'G 2']);
    const [g1, g2] = [row.members[0], row.members[1]];
    component.applyRowMemberDamage(row, g1, 4, 'physical');
    component.setRowMemberDamageValue(g1, 99);

    const result = component.healRowMember(row, g1);

    expect(result.healed).withContext('only what was there').toBe(4);
    expect(g1.damage).toBe(0);

    // A member whose DV was never typed still heals exactly one box.
    component.applyRowMemberDamage(row, g2, 5, 'stun');
    expect(component.getRowMemberDamageValue(g2)).toBe(1);
    component.healRowMember(row, g2);
    expect(g2.damage).toBe(4);

    // And a heal that can do nothing writes no line.
    const before = LogHandler.logbook.length;
    component.healRowMember(row, g1);
    expect(LogHandler.logbook.slice(before).map(e => e.text)
      .filter(t => /healed/.test(t)).length).toBe(0);
  });

  it('Heal-DV3: healing all of a nine-box hit off restores damage and score, via healing rather than undo', () => {
    const row = gmRow('Gangers', 7, 8, ['G 1']);
    const g1 = row.members[0];
    const scoreBeforeHit = row.getCurrentInitiative();
    const accumulatorBeforeHit = row.rowWoundModifier;

    component.applyRowMemberDamage(row, g1, 9, 'physical');
    const damageAfterHit = g1.damage;
    expect(damageAfterHit).toBeGreaterThan(0);

    // Correction path: heal the same boxes back off in two taps
    // (RULINGS.md 2026-08-07), not an undo control - there is none.
    component.setRowMemberDamageValue(g1, 6);
    component.healRowMember(row, g1);
    expect(g1.damage).toBe(damageAfterHit - 6);

    component.setRowMemberDamageValue(g1, damageAfterHit - 6);
    component.healRowMember(row, g1);

    expect(g1.damage).withContext('fully healed via two heals, not one undo').toBe(0);
    expect(row.rowWoundModifier).toBe(accumulatorBeforeHit);
    expect(row.getCurrentInitiative()).toBe(scoreBeforeHit);
  });

  it('Heal-DV4: mid-combat, one tap takes back a mis-keyed killing blow and puts the group back in the fight', () => {
    const row = gmRow('Gangers', 9, 8, ['G 1']);          // 17
    const pete = makeRolledParticipant('Pete', 8, 1, 2);  // 10
    CombatManager.started = true;
    CombatManager.passEnded = false;
    CombatManager.goToNextActors();
    expect(CombatManager.currentActors.items).toEqual([row]);

    // The mis-key: a DV 10 burst meant for someone else.
    component.setRowMemberDamageValue(row.members[0], 10);
    component.hitRowMemberPhysical(row, row.members[0]);
    expect(row.members[0].outOfAction).toBeTrue();
    expect(row.spentFlagged).toBeTrue();
    expect(row.ooc).toBeTrue();

    // One tap back, with the same 10 still in the box. No retyping, no ten taps.
    const before = LogHandler.logbook.length;
    component.healRowMember(row, row.members[0]);

    expect(row.members[0].damage).toBe(0);
    expect(row.members[0].outOfAction).toBeFalse();
    expect(row.activeMembers.length).toBe(1);
    expect(row.spentFlagged).toBeFalse();
    expect(row.ooc).toBeFalse();
    expect(row.getCurrentInitiative()).toBeGreaterThan(pete.getCurrentInitiative());
    const lines = LogHandler.logbook.slice(before).map(e => e.text);
    expect(lines.find(t => /healed 10/.test(t))).toBeTruthy();
    expect(lines.find(t => /is back in action/.test(t))).toBeTruthy();
    // The p. 379 record of the blow is history and stays put.
    expect(row.members[0].lastDamageValue).toBe(10);
  });

  it('Heal-DV5: a grunt heal larger than its Physical damage cuts Physical first, then Stun', () => {
    const grunt = component.addGrunt('Lone Ganger', 3, 3); // 10 boxes
    component.setGruntDamageValue(grunt, 2);
    component.hitGruntPhysical(grunt);
    component.setGruntDamageValue(grunt, 6);
    component.hitGruntStun(grunt);
    expect(grunt.physicalDamage).toBe(2);
    expect(grunt.stunDamage).toBe(6);

    component.setGruntDamageValue(grunt, 5);
    const healed = component.healGrunt(grunt);

    expect(healed).toBe(5);
    expect(grunt.physicalDamage).toBe(0);
    expect(grunt.stunDamage).toBe(3);
    expect(grunt.combinedDamage).toBe(3);
  });

  it('Heal-DV6a: the grunt heal control renders and heals by the DV in its input', () => {
    const grunt = component.addGrunt('Lone Ganger', 3, 3);
    component.setGruntDamageValue(grunt, 7);
    component.hitGruntPhysical(grunt);        // 7 boxes on
    component.selectActor(grunt);
    fixture.detectChanges();

    const healBtn = fixture.nativeElement.querySelector('.grunt-heal') as HTMLButtonElement;
    expect(healBtn).withContext('heal button still classed .grunt-heal').toBeTruthy();
    expect(healBtn.textContent?.trim()).withContext('labelled H, beside P and S').toBe('H');
    healBtn.click();
    fixture.detectChanges();

    expect(grunt.combinedDamage).withContext('7 off in one click, not 1').toBe(0);
  });

  it('Heal-DV6b: the row heal control renders inside the expanded row panel and heals by the DV in its input', () => {
    const row = gmRow('Gangers', 7, 8, ['G 1']);
    const g1 = row.members[0];
    component.applyRowMemberDamage(row, g1, 7, 'physical');
    component.setRowMemberDamageValue(g1, 5);
    component.selectActor(row);
    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('.npc-row-panel') as HTMLElement;
    expect(panel).withContext('row panel is open').toBeTruthy();

    const healBtn = panel.querySelector('.npc-row-heal') as HTMLButtonElement;
    expect(healBtn).withContext('heal button still classed .npc-row-heal').toBeTruthy();
    expect(healBtn.textContent?.trim()).withContext('labelled H, beside P and S').toBe('H');

    healBtn.click();
    fixture.detectChanges();

    expect(g1.damage).withContext('DV 5 off a real DOM click, not 1').toBe(2);
  });
});
