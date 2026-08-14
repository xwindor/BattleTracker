// Acceptance-criteria tests for the linked NPC row feature
// (briefs/npc-group-initiative.md). One describe per criterion, in the brief's
// order. The named gameplay scenarios S1-S8 live in
// src/scenarios/npc-group-initiative.spec.ts.

import { ComponentFixture, TestBed, discardPeriodicTasks, fakeAsync, flush, tick } from '@angular/core/testing';
import {
  BattleTrackerComponent,
  MERGE_MESSAGE_DISMISS_MS
} from 'app/battle-tracker/battle-tracker.component';
import { appConfig } from 'app/app.config';
import { LogHandler } from 'Logging';
import { CombatManager, StatusEnum } from 'Combat';
import { Participant, INITIATIVE_PASS_DECAY } from 'Combat/Participants/Participant';
import { AstralParticipant } from 'Magic';
import { UndoHandler } from 'Common';
import { interruptTable } from 'InterruptTable';
import {
  DetachedGruntParticipant,
  GruntMember,
  GRUNT_CONDITION_MONITOR_BASE,
  GRUNT_OVERFLOW_BOXES,
  MIN_MERGEABLE_GRUNTS,
  NpcRowParticipant,
  gruntConditionMonitorBoxes,
  hasGruntConditionMonitor,
  isNpcRow
} from 'Grunts';
import { PlayerViewComponent } from 'app/player-view/player-view.component';
import { SharedCombatState, SharedLogEntry } from 'app/services/session-sync.service';
import { DeclaredActionItem } from 'app/shared/declared-actions';

const FULL_DEFENSE = interruptTable.find(a => a.key === 'fullDefense')!;
const PARRY = interruptTable.find(a => a.key === 'parry')!;

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

/**
 * A row that has taken its single Initiative Test: shared Initiative Score =
 * row Initiative attribute + the one dice result (criterion 1, p. 379).
 * `roll` is passed in so the tests stay deterministic.
 */
function makeRolledRow(
  name: string,
  attribute: number,
  dice: number,
  roll: number,
  memberNames: string[] = [],
  body = 3,
  willpower = 3
): NpcRowParticipant {
  const row = new NpcRowParticipant();
  row.name = name;
  row.baseIni = attribute;
  row.setDicesWithoutRoll(dice);
  for (const memberName of memberNames) {
    row.addMember(new GruntMember(memberName, body, willpower));
  }
  CombatManager.participants.insert(row, false);
  row.diceIni = roll;
  return row;
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

describe('NPC group initiative - acceptance criteria', () => {
  beforeEach(resetCombat);
  afterEach(resetCombat);

  // ── 1 ────────────────────────────────────────────────────────────────────
  describe('AC1 - one Initiative Test for the whole row', () => {
    it('gives every NPC in the row the same single result', () => {
      const row = makeRolledRow('Gangers', 7, 2, 8, ['G1', 'G2', 'G3', 'G4']);

      expect(row.getCurrentInitiative()).toBe(15);
      // Every member reads the row's score: there is exactly one score, held by
      // the row, not one per NPC.
      expect(row.members.length).toBe(4);
      for (const m of row.members) {
        expect(row.getCurrentInitiative()).toBe(15);
        expect((m as unknown as Record<string, unknown>)['currentInitiativeScore']).toBeUndefined();
      }
    });

    it('takes exactly one slot in the participant list regardless of member count', () => {
      makeRolledRow('Gangers', 7, 2, 8, ['G1', 'G2', 'G3', 'G4']);
      expect(CombatManager.participants.count).toBe(1);
    });
  });

  // ── 2 ────────────────────────────────────────────────────────────────────
  describe('AC2 - one position in the order, members act consecutively', () => {
    it('is picked up once by getNextActors and holds the slot alone', () => {
      const cayman = makeRolledParticipant('Cayman', 11, 3, 11); // 22
      const row = makeRolledRow('Gangers', 7, 2, 8, ['G1', 'G2', 'G3', 'G4']); // 15

      CombatManager.getNextActors();
      expect(CombatManager.currentActors.items).toEqual([cayman]);

      CombatManager.act(cayman);
      expect(CombatManager.currentActors.items).toEqual([row]);
      // All four NPCs act inside that one slot, back-to-back.
      expect(row.activeMembers.map(m => m.name)).toEqual(['G1', 'G2', 'G3', 'G4']);

      CombatManager.act(row);
      expect(CombatManager.currentActors.items).toEqual([]);
    });
  });

  // ── 3 / 4 ────────────────────────────────────────────────────────────────
  describe('AC3-4 - independent Condition Monitors, damage never spreads', () => {
    it('writes damage to the hit NPC only', () => {
      const row = makeRolledRow('Gangers', 7, 2, 8, ['G1', 'G2', 'G3', 'G4']);
      const [g1, g2, g3, g4] = row.members;

      row.applyDamageToMember(g3, 6, 'physical');

      expect(g3.damage).toBe(6);
      expect(g1.damage).toBe(0);
      expect(g2.damage).toBe(0);
      expect(g4.damage).toBe(0);
    });

    it('keeps per-NPC Condition Monitor sizes independent', () => {
      const row = new NpcRowParticipant();
      const tough = row.addMember(new GruntMember('Troll', 9, 3));
      const frail = row.addMember(new GruntMember('Ganger', 2, 2));

      expect(tough.conditionMonitorBoxes).toBe(GRUNT_CONDITION_MONITOR_BASE + 5); // ceil(9/2)
      expect(frail.conditionMonitorBoxes).toBe(GRUNT_CONDITION_MONITOR_BASE + 1); // ceil(2/2)
    });
  });

  // ── 5 ────────────────────────────────────────────────────────────────────
  describe('AC5 - a member wound moves the SHARED score (Decision 1 house rule)', () => {
    it('applies the wound modifier to the whole row, not just the wounded NPC', () => {
      const row = makeRolledRow('Gangers', 7, 2, 8, ['G1', 'G2', 'G3', 'G4']); // 15
      const g3 = row.members[2];

      row.applyDamageToMember(g3, 6, 'physical'); // 6 boxes -> -2 wound modifier

      expect(row.getCurrentInitiative()).toBe(13); // everyone, together
      expect(row.wm).toBe(2);
    });

    it('leaves the wounded NPC its own wound modifier for its own dice pools', () => {
      const row = makeRolledRow('Gangers', 7, 2, 8, ['G1', 'G2']);
      const [g1, g2] = row.members;

      row.applyDamageToMember(g2, 6, 'physical');

      expect(g2.wm).toBe(2); // his own tests take -2 (p. 170)
      expect(g1.wm).toBe(0); // the unwounded NPC's own pools are untouched
    });

    it('accumulates the wounds of several members onto the one shared score', () => {
      const row = makeRolledRow('Gangers', 7, 2, 8, ['G1', 'G2']); // 15
      const [g1, g2] = row.members;

      row.applyDamageToMember(g1, 3, 'stun');     // -1
      expect(row.getCurrentInitiative()).toBe(14);
      row.applyDamageToMember(g2, 6, 'physical'); // -2 more
      expect(row.getCurrentInitiative()).toBe(12);
    });

    it('applies the change immediately, mid-pass, as a signed delta', () => {
      const row = makeRolledRow('Gangers', 7, 2, 8, ['G1']); // 15
      CombatManager.started = true;
      CombatManager.nextIniPass(); // -> 5
      expect(row.getCurrentInitiative()).toBe(5);

      row.applyDamageToMember(row.members[0], 3, 'physical');

      expect(row.getCurrentInitiative()).toBe(4); // 5 - 1, not recomputed from base
    });

    // The house rule is triggered by a wound EVENT (Decision 1's wording:
    // "when any NPC in the row takes a wound ... that wound's Initiative
    // penalty applies"), not by the row's current roster. Nothing in the brief
    // authorises a membership change to move the shared score, and S4 says the
    // opposite outright.
    it('does not move the shared score when an already-wounded NPC joins', () => {
      const row = makeRolledRow('Gangers', 7, 2, 8, ['G1']); // 15
      const reinforcement = new GruntMember('Veteran', 3, 3);
      reinforcement.applyDamage(6, 'physical'); // hurt before he ever joined

      row.addMember(reinforcement);

      expect(reinforcement.wm).toBe(2);                 // his own pools still take it
      expect(row.getCurrentInitiative()).toBe(15);      // the row's score is untouched
      expect(row.wm).toBe(0);
    });

    it('does not move the shared score when a wounded NPC is removed', () => {
      const row = makeRolledRow('Gangers', 7, 2, 8, ['G1', 'G2']); // 15
      row.applyDamageToMember(row.members[1], 6, 'physical');
      expect(row.getCurrentInitiative()).toBe(13);

      row.removeMember(row.members[1]);

      expect(row.getCurrentInitiative()).toBe(13); // the wound stays paid
    });

    it('gives the shared penalty back when the wound itself is healed away', () => {
      const row = makeRolledRow('Gangers', 7, 2, 8, ['G1']); // 15
      const g1 = row.members[0];
      row.applyDamageToMember(g1, 6, 'physical');
      expect(row.getCurrentInitiative()).toBe(13);

      const result = row.healMember(g1, 6);

      expect(result.healed).toBe(6);
      expect(result.scoreDelta).toBe(2);
      expect(row.getCurrentInitiative()).toBe(15);
    });

    it('never lets healing push the row faster than it started', () => {
      // Damage an NPC arrived with never cost the row anything, so healing it
      // cannot pay the row a bonus.
      const row = makeRolledRow('Gangers', 7, 2, 8, []); // 15
      const wounded = new GruntMember('Veteran', 3, 3);
      wounded.applyDamage(6, 'physical');
      row.addMember(wounded);

      row.healMember(wounded, 6);

      expect(row.wm).toBe(0);
      expect(row.getCurrentInitiative()).toBe(15);
    });

    it('is a single undo step and gives the score back on undo', () => {
      const row = makeRolledRow('Gangers', 7, 2, 8, ['G1']);
      UndoHandler.StartActions();
      row.applyDamageToMember(row.members[0], 6, 'physical');
      expect(row.getCurrentInitiative()).toBe(13);

      UndoHandler.Undo();

      expect(row.members[0].damage).toBe(0);
      expect(row.getCurrentInitiative()).toBe(15);
    });
  });

  // ── 6 ────────────────────────────────────────────────────────────────────
  describe('AC6 - a downed NPC is skipped, the rest of the row carries on', () => {
    it('drops the downed NPC from activeMembers and leaves the score alone', () => {
      const row = makeRolledRow('Gangers', 7, 2, 8, ['G1', 'G2', 'G3']);
      const g2 = row.members[1];
      const scoreBeforeDrop = row.getCurrentInitiative();

      row.applyDamageToMember(g2, g2.conditionMonitorBoxes, 'stun');

      expect(g2.outOfAction).toBeTrue();
      expect(row.activeMembers.map(m => m.name)).toEqual(['G1', 'G3']);
      // The score moved only by g2's accumulated wound modifier, never because
      // he went down.
      expect(row.getCurrentInitiative()).toBe(scoreBeforeDrop - g2.wm);
      expect(row.ooc).toBeFalse();
    });

    // Decision 14 (2026-08-07) REVERSES Decision 8: a spent row is flagged and
    // kept, not auto-deleted. These tests were rewritten in place rather than
    // dropped, so the reversal stays visible in the suite.
    it('flags the row but keeps it in the order once every NPC is out (Decision 14)', () => {
      const row = makeRolledRow('Gangers', 7, 2, 8, ['G1', 'G2']);
      for (const m of row.members) {
        row.applyDamageToMember(m, m.conditionMonitorBoxes, 'physical');
      }

      expect(row.isSpent).toBeTrue();
      expect(CombatManager.flagSpentNpcRows()).toEqual([row]);
      expect(CombatManager.participants.contains(row))
        .withContext('row stays in the initiative order').toBeTrue();
      expect(row.spentFlagged).toBeTrue();
      // Flagged the way any other downed participant is: out of combat, so
      // getNextActors() skips it and the GM list styles it as such.
      expect(row.ooc).toBeTrue();
    });

    it('announces a spent row exactly once, however often the check runs', () => {
      const row = makeRolledRow('Gangers', 7, 2, 8, ['G1']);
      row.applyDamageToMember(row.members[0], row.members[0].conditionMonitorBoxes, 'physical');

      expect(CombatManager.flagSpentNpcRows()).toEqual([row]);
      expect(CombatManager.flagSpentNpcRows()).toEqual([]);
      expect(CombatManager.flagSpentNpcRows()).toEqual([]);
    });

    it('un-flags a row whose member is healed back up, and re-flags on a second collapse', () => {
      // Decision 13 + Decision 14 together: the row survives long enough to be
      // healed back into, and the flag follows the live state both ways.
      const row = makeRolledRow('Gangers', 7, 2, 8, ['G1']);
      const g1 = row.members[0];
      row.applyDamageToMember(g1, g1.conditionMonitorBoxes, 'physical');
      CombatManager.flagSpentNpcRows();
      expect(row.spentFlagged).toBeTrue();

      row.healMember(g1, 3);

      expect(row.isSpent).toBeFalse();
      CombatManager.flagSpentNpcRows();
      expect(row.spentFlagged).toBeFalse();

      row.applyDamageToMember(g1, g1.conditionMonitorBoxes, 'physical');
      expect(CombatManager.flagSpentNpcRows()).toEqual([row]);
    });

    it('does not flag a row that still has someone standing', () => {
      const row = makeRolledRow('Gangers', 7, 2, 8, ['G1', 'G2']);
      row.applyDamageToMember(row.members[0], row.members[0].conditionMonitorBoxes, 'physical');

      expect(CombatManager.flagSpentNpcRows()).toEqual([]);
      expect(CombatManager.participants.contains(row)).toBeTrue();
    });

    it('does not flag an empty row the GM has not populated yet', () => {
      const row = new NpcRowParticipant();
      CombatManager.addParticipant(row);

      expect(row.isSpent).toBeFalse();
      expect(CombatManager.flagSpentNpcRows()).toEqual([]);
    });

    it('keeps a row emptied by removal or detach, but does not flag it (Decision 21)', () => {
      // Narrows the old expectation: `isSpent` is still true (nobody left to
      // act), but Decision 21 reserves the red `spentFlagged`/`ooc` state for
      // a row wiped out BY DAMAGE. A row emptied by hand is a plain empty
      // row (`RULINGS.md` 2026-08-13).
      const removed = makeRolledRow('Removed', 7, 2, 8, ['G1']);
      removed.removeMember(removed.members[0]);
      expect(removed.isSpent).toBeTrue();
      expect(removed.isWipedOut).toBeFalse();

      const detached = makeRolledRow('Detached', 7, 2, 8, ['Witch']);
      detached.detachMember(detached.members[0]);
      expect(detached.isSpent).toBeTrue();
      expect(detached.isWipedOut).toBeFalse();

      CombatManager.flagSpentNpcRows();
      expect(CombatManager.participants.contains(removed)).toBeTrue();
      expect(CombatManager.participants.contains(detached)).toBeTrue();
      expect(removed.spentFlagged).toBeFalse();
      expect(detached.spentFlagged).toBeFalse();
      expect(removed.ooc).toBeFalse();
      expect(detached.ooc).toBeFalse();
    });

    it('advances the order when the row that went spent was the one acting', () => {
      // Killing the last member of the ACTING row used to leave currentActors
      // empty with passEnded still false: no Act button, no Next Pass button,
      // tracker stalled. Still true now that the row is kept rather than
      // deleted - it just has to leave currentActors instead.
      const row = makeRolledRow('Gangers', 9, 2, 8, ['G1']);      // 17
      const pete = makeRolledParticipant('Pete', 8, 1, 2);        // 10
      CombatManager.started = true;
      CombatManager.passEnded = false;
      CombatManager.goToNextActors();
      expect(CombatManager.currentActors.items).toEqual([row]);

      row.applyDamageToMember(row.members[0], row.members[0].conditionMonitorBoxes, 'physical');
      CombatManager.flagSpentNpcRows();

      expect(CombatManager.participants.contains(row)).toBeTrue();
      expect(CombatManager.currentActors.contains(row)).toBeFalse();
      expect(CombatManager.currentActors.items).toEqual([pete]);
      expect(pete.status).toBe(StatusEnum.Active);
      expect(CombatManager.passEnded).toBeFalse();
    });

    it('ends the pass when the acting row was the last participant standing', () => {
      const row = makeRolledRow('Gangers', 9, 2, 8, ['G1']); // 17
      CombatManager.started = true;
      CombatManager.passEnded = false;
      CombatManager.goToNextActors();
      expect(CombatManager.currentActors.items).toEqual([row]);

      row.applyDamageToMember(row.members[0], row.members[0].conditionMonitorBoxes, 'physical');
      CombatManager.flagSpentNpcRows();

      // Nobody left to act: the pass closes (and, with nothing above 0, the
      // Combat Turn with it) rather than the tracker stalling.
      expect(CombatManager.currentActors.count).toBe(0);
      expect(CombatManager.passEnded).toBeTrue();
    });

    it('does not skip a tied participant when the acting row goes spent', () => {
      const row = makeRolledRow('Gangers', 7, 2, 8, ['G1']);      // 15
      const twin = makeRolledParticipant('Twin', 7, 2, 8);        // 15, tied
      CombatManager.started = true;
      CombatManager.passEnded = false;
      CombatManager.goToNextActors();
      expect(CombatManager.currentActors.items).toEqual([row, twin]);

      row.applyDamageToMember(row.members[0], row.members[0].conditionMonitorBoxes, 'physical');
      CombatManager.flagSpentNpcRows();

      // The other half of the tie is still mid-turn and must keep its slot.
      expect(CombatManager.currentActors.items).toEqual([twin]);
      expect(twin.status).toBe(StatusEnum.Active);
    });
  });

  // ── 7 ────────────────────────────────────────────────────────────────────
  describe('AC7 - grunt Condition Monitor shape', () => {
    it('holds 8 + ceil(max(Body, Willpower) / 2) boxes', () => {
      expect(new GruntMember('a', 3, 3).conditionMonitorBoxes).toBe(10);
      expect(new GruntMember('b', 5, 2).conditionMonitorBoxes).toBe(11); // ceil(5/2) = 3
      expect(new GruntMember('c', 2, 5).conditionMonitorBoxes).toBe(11); // higher of the two
      expect(new GruntMember('d', 6, 6).conditionMonitorBoxes).toBe(11);
    });

    it('takes Physical and Stun on the same single track', () => {
      const m = new GruntMember('a', 3, 3); // 10 boxes
      m.applyDamage(4, 'physical');
      m.applyDamage(3, 'stun');

      expect(m.damage).toBe(7);
      expect(m.wm).toBe(2); // one per third box, across both types
    });

    it('does not overflow: damage past the last box is discarded', () => {
      const m = new GruntMember('a', 3, 3); // 10 boxes
      const result = m.applyDamage(14, 'physical');

      expect(m.damage).toBe(10);
      expect(result.applied).toBe(10);
      expect(result.discarded).toBe(4);
      expect(GRUNT_OVERFLOW_BOXES).toBe(0);
    });

    it('is not configurable - a member exposes no way to set a different shape', () => {
      const m = new GruntMember('a', 3, 3) as unknown as Record<string, unknown>;
      expect(m['physicalHealth']).toBeUndefined();
      expect(m['stunHealth']).toBeUndefined();
      expect(m['overflowHealth']).toBeUndefined();
    });

    it('records the final blow so alive/dead can be settled after the fight', () => {
      const stunned = new GruntMember('a', 3, 3);
      stunned.applyDamage(10, 'stun');
      expect(stunned.finalState).toBe('alive');

      const grazed = new GruntMember('b', 5, 3);
      grazed.applyDamage(20, 'physical'); // final DV 20 > Body 5
      expect(grazed.finalState).toBe('dead');

      const light = new GruntMember('c', 5, 3);
      light.applyDamage(9, 'physical');
      light.applyDamage(2, 'physical');   // final DV 2 < Body 5
      expect(light.finalState).toBe('alive');

      // The brief states "< Body -> alive" and "> Body -> dead" and says nothing
      // about equality; the tracker records the inputs and refuses to guess.
      const exact = new GruntMember('d', 5, 3);
      exact.applyDamage(11, 'physical');  // final DV 5 would be equal; use 5
      const equal = new GruntMember('e', 5, 3);
      equal.applyDamage(9, 'physical');
      equal.applyDamage(5, 'physical');
      expect(equal.finalState).toBe('undetermined');
      expect(exact.finalState).toBe('dead');
    });

    it('does not let a hit on an already-downed grunt rewrite the final attack', () => {
      // p. 379 settles alive-or-dead from the attack that TOOK THE GRUNT OUT.
      // A stray round into a corpse applies no boxes (the track is full and
      // grunts have no overflow) and must not flip the verdict.
      const ganger = new GruntMember('Ganger', 3, 3); // 10 boxes, Body 3
      ganger.applyDamage(9, 'physical');
      ganger.applyDamage(5, 'physical');              // final DV 5 > Body 3
      expect(ganger.finalState).toBe('dead');

      const stray = ganger.applyDamage(1, 'physical');

      expect(stray.applied).toBe(0);
      expect(ganger.lastDamageValue).toBe(5);
      expect(ganger.lastDamageType).toBe('physical');
      expect(ganger.finalState).toBe('dead');

      // Same in the other direction: a Stun tap on a body dropped by Physical
      // must not turn "dead" into "alive".
      ganger.applyDamage(2, 'stun');
      expect(ganger.finalState).toBe('dead');
    });

    it('reports standing while the track is not full', () => {
      const m = new GruntMember('a', 3, 3);
      m.applyDamage(9, 'physical');
      expect(m.finalState).toBe('standing');
      expect(m.outOfAction).toBeFalse();
    });
  });

  // ── 8 / 9 ────────────────────────────────────────────────────────────────
  describe('AC8-9 - pass decay and negative scores', () => {
    it('subtracts 10 from the row exactly once per pass, however many members', () => {
      const row = makeRolledRow('Gangers', 7, 2, 8, ['G1', 'G2', 'G3', 'G4']); // 15

      CombatManager.nextIniPass();

      expect(row.getCurrentInitiative()).toBe(15 - INITIATIVE_PASS_DECAY); // 5, not -25
    });

    it('lets the shared score go negative without clamping', () => {
      const row = makeRolledRow('Gangers', 7, 2, 8, ['G1']); // 15
      CombatManager.nextIniPass();
      CombatManager.nextIniPass();

      expect(row.getCurrentInitiative()).toBe(-5);
    });

    it('stops scheduling the row once the shared score is 0 or less', () => {
      const row = makeRolledRow('Gangers', 5, 1, 5, ['G1']); // 10
      CombatManager.nextIniPass(); // -> 0

      CombatManager.getNextActors();

      expect(CombatManager.currentActors.contains(row)).toBeFalse();
    });
  });

  // ── 11 ───────────────────────────────────────────────────────────────────
  describe('AC11 - lieutenant tie-breaking is not automated (Decision 6)', () => {
    it('models no lieutenant link on the row at all', () => {
      const row = new NpcRowParticipant() as unknown as Record<string, unknown>;
      expect(row['lieutenant']).toBeUndefined();
      expect(row['lieutenantId']).toBeUndefined();
    });
  });

  // ── 12 / 13 ──────────────────────────────────────────────────────────────
  describe('AC12-13 - detaching an NPC onto its own initiative row', () => {
    it('removes it from the row and hands back an independent participant', () => {
      const row = makeRolledRow('Gangers', 7, 2, 8, ['G1', 'Witch']);
      const witch = row.members[1];

      const detached = row.detachMember(witch)!;

      expect(row.members.map(m => m.name)).toEqual(['G1']);
      expect(detached.name).toBe('Witch');
      expect(detached).not.toBe(row);
    });

    it('hands back a participant that has not rolled, so it rolls its own test', () => {
      const row = makeRolledRow('Gangers', 7, 2, 8, ['Specialist']);
      const detached = row.detachMember(row.members[0])!;

      expect(detached.diceIni).toBe(0); // its own Initiative Test is still owed
      expect(detached.getCurrentInitiative()).toBe(7); // bare attribute
    });

    it('carries the NPC\'s Condition Monitor across, boxes and damage intact', () => {
      const row = makeRolledRow('Gangers', 7, 2, 8, ['Witch'], 4, 3);
      const witch = row.members[0];
      row.applyDamageToMember(witch, 6, 'physical');

      const detached = row.detachMember(witch)!;

      expect(detached.physicalHealth).toBe(witch.conditionMonitorBoxes);
      expect(detached.physicalDamage).toBe(6);
      expect(detached.wm).toBe(2);            // same wound modifier as before
      expect(detached.overflowHealth).toBe(GRUNT_OVERFLOW_BOXES);
    });

    it('leaves the row\'s shared score exactly where it was (S4)', () => {
      const row = makeRolledRow('Gangers', 7, 2, 8, ['G1', 'G2']); // 15
      row.applyDamageToMember(row.members[1], 6, 'physical');
      expect(row.getCurrentInitiative()).toBe(13);

      row.detachMember(row.members[1]);

      // Decision 1's trigger is a wound *event*, not the current roster, and
      // S4 says outright that the members left behind "keep the row's original
      // shared score untouched". A detach must not speed the row back up.
      expect(row.getCurrentInitiative()).toBe(13);
    });

    it('keeps the grunt single combined Condition Monitor, not a PC two-track one', () => {
      // p. 379 (and p. 381 for lieutenants: "They possess a single Condition
      // Monitor, like other grunts") - detaching changes which Initiative Score
      // the NPC is on, not the shape of its Condition Monitor.
      const row = makeRolledRow('Gangers', 7, 2, 8, ['Specialist'], 4, 3); // 10 boxes
      const member = row.members[0];
      row.applyDamageToMember(member, 4, 'physical');

      const detached = row.detachMember(member) as DetachedGruntParticipant;

      expect(hasGruntConditionMonitor(detached)).toBeTrue();
      expect(detached.physicalHealth).toBe(member.conditionMonitorBoxes);
      expect(detached.overflowHealth).toBe(GRUNT_OVERFLOW_BOXES);
      // Stun and Physical share the one track: 4 Physical + 6 Stun fills a
      // 10-box grunt, where a PC-shaped participant would still be standing
      // with two half-full tracks.
      detached.stunDamage = 6;
      expect(detached.combinedDamage).toBe(10);
      expect(detached.wm).toBe(3);      // one ladder over the combined track
      expect(detached.ooc).toBeTrue();  // same out-of-action threshold as before

      const stillUp = row.detachMember(new GruntMember('nobody'));
      expect(stillUp).toBeNull();
    });

    it('carries the final-attack record across so alive/dead is still resolvable (p. 379)', () => {
      const row = makeRolledRow('Gangers', 7, 2, 8, ['Ganger'], 3, 3);
      const member = row.members[0];
      row.applyDamageToMember(member, 9, 'physical');
      row.applyDamageToMember(member, 5, 'physical'); // final DV 5 > Body 3

      expect(member.finalState).toBe('dead');
      const detached = row.detachMember(member) as DetachedGruntParticipant;

      expect(detached.gruntBody).toBe(3);
      expect(detached.lastDamageType).toBe('physical');
      expect(detached.lastDamageValue).toBe(5);
      expect(detached.finalState).toBe('dead'); // same verdict after detaching
    });

    it('duplicates a detached grunt as a grunt, not as a PC-shaped participant', () => {
      const row = makeRolledRow('Gangers', 7, 2, 8, ['Ganger'], 3, 3);
      row.applyDamageToMember(row.members[0], 4, 'physical');
      const detached = row.detachMember(row.members[0]) as DetachedGruntParticipant;

      const copy = detached.clone() as DetachedGruntParticipant;

      expect(hasGruntConditionMonitor(copy)).toBeTrue();
      expect(copy.physicalDamage).toBe(4);
      expect(copy.gruntBody).toBe(3);
      copy.stunDamage = 6;
      expect(copy.ooc).toBeTrue();
    });

    it('supports detaching into a different participant type for an initiative-type change', () => {
      const row = makeRolledRow('Gangers', 7, 2, 8, ['Witch']);

      const detached = row.detachMember(row.members[0], () => new AstralParticipant());

      expect(detached instanceof AstralParticipant).toBeTrue();
    });

    it('refuses to detach an NPC that is not in the row', () => {
      const row = makeRolledRow('Gangers', 7, 2, 8, ['G1']);
      expect(row.detachMember(new GruntMember('Stranger'))).toBeNull();
    });
  });

  // ── 14 ───────────────────────────────────────────────────────────────────
  describe('AC14 - a row at 0 or less still exists and can still respond', () => {
    it('keeps the row in the encounter at Initiative Score 0', () => {
      const row = makeRolledRow('Gangers', 5, 1, 5, ['G1']); // 10
      CombatManager.nextIniPass(); // -> 0

      expect(row.getCurrentInitiative()).toBe(0);
      expect(CombatManager.participants.contains(row)).toBeTrue();
      expect(row.ooc).toBeFalse(); // still there to take its Free Action / defend
    });
  });

  // ── 15 ───────────────────────────────────────────────────────────────────
  describe('AC15 - joining an existing row inherits the shared score (Decision 7)', () => {
    it('adds a reinforcement on the row\'s current score with no roll and no late-entry penalty', () => {
      const row = makeRolledRow('Gangers', 7, 2, 8, ['G1', 'G2']); // 15
      CombatManager.started = true;
      CombatManager.nextIniPass(); // pass 2, row on 5

      const reinforcement = row.addMember(new GruntMember('G5', 3, 3));

      expect(row.getCurrentInitiative()).toBe(5); // unchanged: no roll, no -10
      expect(row.activeMembers).toContain(reinforcement);
    });

    it('still applies the ordinary late-entry penalty to a brand-new row', () => {
      CombatManager.started = true;
      CombatManager.initiativePass = 3; // two passes already elapsed
      const row = new NpcRowParticipant();
      row.name = 'Reinforcements';
      row.baseIni = 7;
      row.addMember(new GruntMember('R1', 3, 3));

      CombatManager.addParticipant(row);
      row.diceIni = 8; // its own Initiative Test

      expect(row.getCurrentInitiative()).toBe(15 - 2 * INITIATIVE_PASS_DECAY); // -5
    });
  });

  // ── 16 ───────────────────────────────────────────────────────────────────
  describe('AC16 - no Surprise handling for rows (Decision 2)', () => {
    it('exposes no surprise state or surprise test anywhere on a row or its members', () => {
      const row = new NpcRowParticipant();
      const member = row.addMember(new GruntMember('G1'));
      const rowKeys = [
        ...Object.keys(row),
        ...Object.getOwnPropertyNames(NpcRowParticipant.prototype)
      ];
      const memberKeys = [
        ...Object.keys(member),
        ...Object.getOwnPropertyNames(GruntMember.prototype)
      ];

      expect(rowKeys.filter(k => /surprise/i.test(k))).toEqual([]);
      expect(memberKeys.filter(k => /surprise/i.test(k))).toEqual([]);
    });
  });

  // ── 17 ───────────────────────────────────────────────────────────────────
  describe('AC17 - row members cannot take Interrupt Actions (Decision 3)', () => {
    it('refuses every Interrupt Action for the row, however high the score', () => {
      const row = makeRolledRow('Gangers', 20, 2, 10, ['G1']); // 30

      for (const action of interruptTable) {
        expect(row.canUseAction(action))
          .withContext(`interrupt ${action.key}`).toBeFalse();
      }
    });

    it('leaves the row\'s shared score untouched when an interrupt is attempted', () => {
      const row = makeRolledRow('Gangers', 20, 2, 10, ['G1']); // 30
      expect(row.canUseAction(FULL_DEFENSE)).toBeFalse();
      expect(row.getCurrentInitiative()).toBe(30);
    });

    it('allows the same interrupt once the NPC is detached onto its own row', () => {
      const row = makeRolledRow('Gangers', 20, 2, 10, ['G1']); // 30
      const detached = row.detachMember(row.members[0])!;
      CombatManager.addParticipant(detached);
      detached.diceIni = 10; // its own Initiative Test -> 30

      expect(detached.canUseAction(FULL_DEFENSE)).toBeTrue();
      detached.doAction(FULL_DEFENSE);
      expect(detached.getCurrentInitiative()).toBe(20); // the cost lands on him alone
      expect(row.getCurrentInitiative()).toBe(30);      // the row never paid
      expect(detached.canUseAction(PARRY)).toBeTrue();
    });
  });

  // ── 18 ───────────────────────────────────────────────────────────────────
  describe('AC18 - scope guard', () => {
    it('has no group-wide Condition Monitor and no shared damage', () => {
      const row = makeRolledRow('Gangers', 7, 2, 8, ['G1', 'G2']);
      row.applyDamageToMember(row.members[0], 6, 'physical');

      // The row's own (unused) tracks never receive the member's damage.
      expect(row.physicalDamage).toBe(0);
      expect(row.stunDamage).toBe(0);
      expect(row.members[1].damage).toBe(0);
    });

    it('has no Group Edge pool, Professional Rating or Mowing Them Down behaviour', () => {
      const row = new NpcRowParticipant() as unknown as Record<string, unknown>;
      expect(row['groupEdge']).toBeUndefined();
      expect(row['professionalRating']).toBeUndefined();
      expect(row['mowingThemDown']).toBeUndefined();
      // Edge on the row is the ordinary per-participant Seize Initiative flag,
      // not a spendable group pool.
      expect(typeof row['edge']).toBe('boolean');
    });
  });

  // ── cross-cutting engine integration ─────────────────────────────────────
  describe('engine integration', () => {
    it('is recognised as a row by the type guard and not by plain participants', () => {
      const row = new NpcRowParticipant();
      expect(isNpcRow(row)).toBeTrue();
      expect(isNpcRow(new Participant())).toBeFalse();
    });

    it('survives a Combat Turn boundary carrying its members\' wounds into the next test', () => {
      const row = makeRolledRow('Gangers', 7, 2, 8, ['G1', 'G2']); // 15
      row.applyDamageToMember(row.members[0], 6, 'physical');      // -2 -> 13

      row.softReset();

      // New turn: the row's Initiative attribute is still reduced by the wounds
      // its members are carrying, and the next single test builds on that.
      expect(row.getCurrentInitiative()).toBe(5); // attribute 7 - 2
      row.diceIni = 8;
      expect(row.getCurrentInitiative()).toBe(13);
      expect(row.status).toBe(StatusEnum.Waiting);
    });

    it('duplicates into an independent row with its own copies of each NPC', () => {
      const row = makeRolledRow('Gangers', 7, 2, 8, ['G1', 'G2']);
      row.applyDamageToMember(row.members[0], 3, 'physical');

      const copy = row.clone() as NpcRowParticipant;

      expect(isNpcRow(copy)).toBeTrue();
      expect(copy.members.map(m => m.name)).toEqual(['G1', 'G2']);
      expect(copy.members[0]).not.toBe(row.members[0]);
      copy.applyDamageToMember(copy.members[1], 6, 'physical');
      expect(row.members[1].damage).toBe(0); // the original row is unaffected
    });

    it('flags a spent row automatically when the order advances, and keeps it', () => {
      // Decision 14: the engine's pre-step still notices the row, it just flags
      // it instead of deleting it. The row stays in the list and is never
      // handed the initiative, because it reads as out of combat.
      const cayman = makeRolledParticipant('Cayman', 11, 3, 11);
      const row = makeRolledRow('Gangers', 7, 2, 8, ['G1']);
      row.applyDamageToMember(row.members[0], row.members[0].conditionMonitorBoxes, 'physical');

      CombatManager.goToNextActors();

      expect(CombatManager.participants.items).toEqual([cayman, row]);
      expect(row.spentFlagged).toBeTrue();
      expect(CombatManager.currentActors.items).toEqual([cayman]);
    });

    it('keeps the row\'s shared wound penalty when it is duplicated', () => {
      const row = makeRolledRow('Gangers', 7, 2, 8, ['G1', 'G2']); // 15
      row.applyDamageToMember(row.members[0], 6, 'physical');      // -2 -> 13

      const copy = row.clone() as NpcRowParticipant;

      expect(copy.wm).toBe(2);
      expect(copy.getCurrentInitiative()).toBe(13);
    });
  });
});

// ── GM-workflow plumbing (component side) ─────────────────────────────────
//
// The rules all live in the classes above; these cover the GM-component half -
// spent-row cleanup, undo coverage of the side maps, the shared-state payload
// and the panel's damage controls.
describe('NPC group initiative - GM workflow', () => {
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

  /** A row created the way the GM's "NPC Row" button creates one. */
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

  it('does not stall the tracker when the last member of the ACTING row is killed', () => {
    const row = gmRow('Gangers', 9, 8, ['G1']);          // 17
    const pete = makeRolledParticipant('Pete', 8, 1, 2); // 10
    CombatManager.started = true;
    CombatManager.passEnded = false;
    CombatManager.goToNextActors();
    expect(CombatManager.currentActors.items).toEqual([row]);

    component.applyRowMemberDamage(row, row.members[0], row.members[0].conditionMonitorBoxes, 'physical');

    // Decision 14: the row is still there, flagged - but it is no longer the
    // one acting.
    expect(CombatManager.participants.contains(row)).toBeTrue();
    expect(row.ooc).toBeTrue();
    // Somebody is acting and the pass is still open: the GM has an Act button
    // to press, rather than only Undo and End Combat.
    expect(CombatManager.currentActors.items).toEqual([pete]);
    expect(CombatManager.passEnded).toBeFalse();
  });

  // -- Decision 21 (narrows Decision 14) -----------------------------------
  // A row emptied by hand - removal or detaching the last member - is a
  // plain empty row, not a wiped-out one: no flag, no `ooc`, no red styling
  // (`RULINGS.md` 2026-08-13, "Emptying a row by hand is not the same as
  // wiping it out"). Removal also always prompts first.
  it('prompts before removing an NPC, and does nothing on cancel (Decision 21)', async () => {
    const row = gmRow('Gangers', 7, 8, ['G1', 'G2']);
    const confirmSpy = spyOn(component['confirmationDialog'], 'simpleConfirm').and.resolveTo(false);

    await component.removeRowMember(row, row.members[0]);

    expect(confirmSpy).toHaveBeenCalled();
    expect(row.members.map(m => m.name)).toEqual(['G1', 'G2']);
  });

  it('removes a non-last NPC on confirmation, without flagging or deleting the row (Decision 21)', async () => {
    const row = gmRow('Gangers', 7, 8, ['G1', 'G2']);
    spyOn(component['confirmationDialog'], 'simpleConfirm').and.resolveTo(true);

    await component.removeRowMember(row, row.members[0]);

    expect(row.members.map(m => m.name)).toEqual(['G2']);
    expect(CombatManager.participants.contains(row)).toBeTrue();
    expect(row.spentFlagged).toBeFalse();
    expect(row.ooc).toBeFalse();
  });

  it('offers to delete the row too when removing its last NPC, and does so on confirm (Decision 21)', async () => {
    const row = gmRow('Gangers', 7, 8, ['G1']);
    const confirmSpy = spyOn(component['confirmationDialog'], 'simpleConfirm').and.resolveTo(true);

    await component.removeRowMember(row, row.members[0]);

    expect(confirmSpy.calls.mostRecent().args[0]).toContain('last NPC');
    expect(CombatManager.participants.contains(row)).toBeFalse();
  });

  it('empties a row by detaching its last NPC without flagging it (Decision 21)', () => {
    const row = gmRow('Gangers', 7, 8, ['Witch']);

    component.detachRowMember(row, row.members[0]);

    expect(CombatManager.participants.contains(row)).toBeTrue();
    expect(row.spentFlagged).toBeFalse();
    expect(row.ooc).toBeFalse();
    expect(CombatManager.participants.items.map(p => p.name).sort())
      .toEqual(['Gangers', 'Witch']);
  });

  it('leaves the per-row delete button as the only way a row leaves the order', async () => {
    // Decision 14's cleanup path: the GM taps the trash icon, exactly as they
    // would for any other downed participant.
    const row = gmRow('Gangers', 7, 8, ['G1']);
    component.applyRowMemberDamage(row, row.members[0], row.members[0].conditionMonitorBoxes, 'physical');
    expect(CombatManager.participants.contains(row)).toBeTrue();
    spyOn(component['confirmationDialog'], 'simpleConfirm').and.resolveTo(true);

    await component.btnDelete_Click(row);

    expect(CombatManager.participants.contains(row)).toBeFalse();
  });

  it('detaches from the GM panel as a grunt, not as a PC-shaped participant', () => {
    // The GM-side path, not `row.detachMember` directly: the Detach button goes
    // through `detachRowMember`, whose own parameter default shadows the
    // domain default. When that default was a bare `Participant`, every
    // detached grunt silently got the PC shape of two independent Condition
    // Monitors - roughly double the boxes it had a moment earlier - against
    // p. 379 and p. 381 ("They possess a single Condition Monitor, like other
    // grunts"). Asserted here so a regression of the shadowed default fails.
    const row = gmRow('Gangers', 7, 8, ['G1', 'Specialist']);
    const member = row.members[1];
    component.setRowMemberDamageValue(member, 4);
    component.hitRowMemberPhysical(row, member);
    const boxes = member.conditionMonitorBoxes;

    const detached = component.detachRowMember(row, member) as DetachedGruntParticipant;

    expect(hasGruntConditionMonitor(detached)).toBeTrue();
    expect(detached.physicalHealth).toBe(boxes);
    expect(detached.overflowHealth).toBe(GRUNT_OVERFLOW_BOXES);
    expect(detached.combinedDamage).toBe(4);
    // One combined pool: the remaining boxes taken as Stun fill the same track.
    detached.stunDamage = boxes - 4;
    expect(detached.combinedDamage).toBe(boxes);
    expect(detached.ooc).toBeTrue();
  });

  it('shows a detached grunt ONE combined Condition Monitor bar, and a row none', () => {
    // D1/D2: the details panel used to render two independent PC tracks for
    // every selected participant. For a row that was a phantom Condition
    // Monitor whose first tap benched the whole row; for a detached grunt it
    // misreported how full its single track was (p. 379).
    const row = gmRow('Gangers', 7, 8, ['G1']);
    component.selectActor(row);
    fixture.detectChanges();

    expect(component.isNpcRow(row)).toBeTrue();
    expect(component.hasGruntConditionMonitor(row)).toBeFalse();
    let tabs = Array.from(fixture.nativeElement.querySelectorAll('a[ngbNavLink], button[ngbNavLink]'))
      .map(e => (e as HTMLElement).textContent?.trim());
    expect(tabs).not.toContain('Condition Monitor');

    const detached = component.detachRowMember(row, row.members[0]) as DetachedGruntParticipant;
    component.selectActor(detached);
    fixture.detectChanges();

    expect(component.hasGruntConditionMonitor(detached)).toBeTrue();
    tabs = Array.from(fixture.nativeElement.querySelectorAll('a[ngbNavLink], button[ngbNavLink]'))
      .map(e => (e as HTMLElement).textContent?.trim());
    expect(tabs).toContain('Condition Monitor');
    // One bar, not two: the widget is bound to the combined pool.
    component.onGruntCombinedDamageChanged(detached, 4);
    expect(detached.combinedDamage).toBe(4);
    expect(detached.physicalDamage).toBe(4);
  });

  it('restores a linked NPC row from the shared state as a row (D4)', () => {
    const row = gmRow('Gangers', 7, 8, ['G 1', 'G 2']); // shared score 15
    CombatManager.started = true;
    component.applyRowMemberDamage(row, row.members[1], 6, 'physical'); // -2 -> 13
    expect(row.getCurrentInitiative()).toBe(13);

    const shared = component['getSharedParticipants']();
    const sharedRow = shared.find(s => s.name === 'Gangers');
    expect(sharedRow?.isNpcRow).toBeTrue();
    expect(sharedRow?.rowMembers?.length).toBe(2);
    expect(sharedRow?.rowWoundModifier).toBe(2);

    component['restoreFromSharedState']({
      round: CombatManager.combatTurn,
      pass: CombatManager.initiativePass,
      started: true,
      passEnded: CombatManager.passEnded,
      currentInitiative: CombatManager.currentInitiative,
      participants: shared
    });

    const restored = CombatManager.participants.items.find(p => p.name === 'Gangers');
    expect(restored).toBeTruthy();
    expect(isNpcRow(restored!)).toBeTrue();
    const restoredRow = restored as NpcRowParticipant;
    expect(restoredRow.members.map(m => m.name)).toEqual(['G 1', 'G 2']);
    expect(restoredRow.members[1].damage).toBe(6);
    expect(restoredRow.members[1].lastDamageType).toBe('physical');
    expect(restoredRow.members[1].lastDamageValue).toBe(6);
    expect(restoredRow.members[1].conditionMonitorBoxes)
      .toBe(GRUNT_CONDITION_MONITOR_BASE + 2); // Body/Willpower 3 -> 8 + ceil(3/2)
    expect(restoredRow.rowWoundModifier).toBe(2);
    expect(restoredRow.getCurrentInitiative()).toBe(13);
    // Criterion 17 / Decision 3: still refused an Interrupt Action after the
    // rejoin, which is exactly what a plain-Participant restore broke.
    expect(restoredRow.canUseAction(FULL_DEFENSE)).toBeFalse();
    const rebroadcast = component['getSharedParticipants']().find(s => s.name === 'Gangers');
    expect(rebroadcast?.canInterrupt).toBeFalse();
  });

  it('forgets a deleted row\'s per-member damage values, undoably (D5)', async () => {
    const row = gmRow('Gangers', 7, 8, ['G 1', 'G 2']);
    const [g1, g2] = [row.members[0], row.members[1]];
    component.setRowMemberDamageValue(g1, 6);
    component.setRowMemberDamageValue(g2, 9);
    const values = component['rowMemberDamageValues'];
    expect(values.has(g1)).toBeTrue();
    spyOn(component['confirmationDialog'], 'simpleConfirm').and.resolveTo(true);

    await component.btnDelete_Click(row);

    expect(values.has(g1)).toBeFalse();
    expect(values.has(g2)).toBeFalse();

    UndoHandler.Undo();

    // Half-undoable was the bug: the row came back with its NPCs' queued Damage
    // Values silently reset to the one-box default.
    expect(CombatManager.participants.contains(row)).toBeTrue();
    expect(component.getRowMemberDamageValue(g1)).toBe(6);
    expect(component.getRowMemberDamageValue(g2)).toBe(9);
  });

  it('keeps a spent row\'s per-member damage values, since the row stays (D5/D14)', () => {
    // Under Decision 8 the row was deleted here and its side-map entries had to
    // be dropped with it. Decision 14 keeps the row, so the queued Damage
    // Values must survive too - the GM can still heal the NPC back up.
    const row = gmRow('Gangers', 7, 8, ['G 1']);
    const g1 = row.members[0];
    component.setRowMemberDamageValue(g1, 5);

    component.applyRowMemberDamage(row, g1, g1.conditionMonitorBoxes, 'physical');

    expect(CombatManager.participants.contains(row)).toBeTrue();
    expect(component['rowMemberDamageValues'].has(g1)).toBeTrue();
    expect(component.getRowMemberDamageValue(g1)).toBe(5);
  });

  // Decision 13 (2026-08-07) REVERSES the 2026-08-02 heal refusal this test
  // used to assert. Rewritten in place so the reversal stays visible.
  it('heals a grunt who is out of action and puts them back in the fight (D13)', () => {
    const row = gmRow('Gangers', 7, 8, ['G 1', 'G 2']); // 15
    const g1 = row.members[0];
    component.applyRowMemberDamage(row, g1, g1.conditionMonitorBoxes, 'physical');
    expect(g1.outOfAction).toBeTrue();
    const damageAfterDown = g1.damage;
    const scoreAfterDown = row.getCurrentInitiative();
    const before = LogHandler.logbook.length;

    const result = component.healRowMember(row, g1, 4);

    expect(result.healed).toBe(4);
    expect(g1.damage).toBe(damageAfterDown - 4);
    expect(g1.outOfAction).withContext('back on their feet').toBeFalse();
    expect(row.activeMembers.map(m => m.name)).toContain('G 1');
    // The row's shared accumulator pays back the wound steps the heal undid,
    // exactly as it already did for a member who was never fully down.
    expect(row.getCurrentInitiative()).toBeGreaterThan(scoreAfterDown);
    const lines = LogHandler.logbook.slice(before).map(e => e.text);
    expect(lines.find(t => /G 1 healed 4/.test(t))).withContext('heal line').toBeTruthy();
    expect(lines.find(t => /G 1 is back in action/.test(t)))
      .withContext('revival line').toBeTruthy();
    expect(lines.find(t => /hit had no effect/.test(t)))
      .withContext('the old refusal must be gone').toBeFalsy();
  });

  it('leaves the p. 379 final-attack record alone when a heal revives (D13)', () => {
    const row = gmRow('Gangers', 7, 8, ['G 1']);
    const g1 = row.members[0];
    component.setRowMemberDamageValue(g1, g1.conditionMonitorBoxes);
    component.hitRowMemberPhysical(row, g1);
    expect(g1.finalState).toBe('dead'); // DV 10 > Body 3

    component.healRowMember(row, g1, 5);

    // Still standing now, but the record of the blow that dropped them is
    // untouched: it is history, not current status.
    expect(g1.finalState).toBe('standing');
    expect(g1.lastDamageType).toBe('physical');
    expect(g1.lastDamageValue).toBe(g1.conditionMonitorBoxes);
  });

  it('un-flags a row healed back into the fight, and keeps it acting (D13/D14)', () => {
    const row = gmRow('Gangers', 7, 8, ['G 1']);
    const g1 = row.members[0];
    component.applyRowMemberDamage(row, g1, g1.conditionMonitorBoxes, 'physical');
    expect(row.spentFlagged).toBeTrue();
    expect(row.ooc).toBeTrue();

    component.healRowMember(row, g1, 4);

    expect(row.isSpent).toBeFalse();
    expect(row.spentFlagged).toBeFalse();
    expect(row.ooc).toBeFalse();
    expect(CombatManager.participants.contains(row)).toBeTrue();
  });

  it('never reuses an NPC name after a middle member is removed (D9)', async () => {
    spyOn(component['confirmationDialog'], 'simpleConfirm').and.resolveTo(true);
    const row = component.addNpcRow(false);
    row.name = 'G';
    component.addNpcToRow(row);
    component.addNpcToRow(row);
    component.addNpcToRow(row);
    expect(row.members.map(m => m.name)).toEqual(['G 1', 'G 2', 'G 3']);

    await component.removeRowMember(row, row.members[1]); // drop "G 2"
    component.addNpcToRow(row);

    const names = row.members.map(m => m.name);
    expect(new Set(names).size).withContext(names.join(', ')).toBe(names.length);
    expect(names).toEqual(['G 1', 'G 3', 'G 4']);
  });

  it('does not flag a brand-new empty row the GM has not filled in yet, nor the row emptied by hand (Decision 21)', async () => {
    // The spent check runs on every damage/detach/remove tap, including taps on
    // other rows - it must not flag the empty row the GM just created and is
    // about to populate, and (since Decision 21) must not flag a row emptied
    // by hand either.
    spyOn(component['confirmationDialog'], 'simpleConfirm').and.resolveTo(true);
    const fresh = component.addNpcRow(false);
    const other = gmRow('Gangers', 7, 8, ['G1']);

    await component.removeRowMember(other, other.members[0]);

    // Removing the last NPC also deletes the now-empty row (Decision 21), so
    // there is nothing left on "other" to flag.
    expect(CombatManager.participants.contains(fresh)).toBeTrue();
    expect(fresh.spentFlagged).toBeFalse();
    expect(fresh.ooc).toBeFalse();
    expect(CombatManager.participants.contains(other)).toBeFalse();
  });

  it('keeps a spent row\'s side maps intact, and undoes the flag with the hit', () => {
    const row = gmRow('Gangers', 7, 8, ['G1']);
    const id = component['participantIds'].get(row);
    const reaction = component['participantReactions'].get(row);
    const intuition = component['participantIntuitions'].get(row);
    const tieBreaker = component['participantTieBreakers'].get(row);
    expect(id).toBeTruthy();

    component.applyRowMemberDamage(row, row.members[0], row.members[0].conditionMonitorBoxes, 'physical');
    // Decision 14: the row is still in the encounter, so nothing keyed by it is
    // dropped in the first place.
    expect(component['participantIds'].has(row)).toBeTrue();
    expect(row.spentFlagged).toBeTrue();

    UndoHandler.Undo();

    // The killing blow and the flag it raised come back off together, and the
    // row is still the SAME participant with the same tie-break inputs.
    expect(CombatManager.participants.contains(row)).toBeTrue();
    expect(row.spentFlagged).toBeFalse();
    expect(component['participantIds'].get(row)).toBe(id);
    expect(component['participantReactions'].get(row)).toBe(reaction);
    expect(component['participantIntuitions'].get(row)).toBe(intuition);
    expect(component['participantTieBreakers'].get(row)).toBe(tieBreaker);
    expect(component['participantEdgeRatings'].get(row)).toBe(0);
    expect(row.members[0].damage).toBe(0);
  });

  it('never offers a row an Interrupt Action in the shared state (criterion 17)', () => {
    const row = gmRow('Gangers', 9, 8, ['G1']); // 17
    const pete = makeRolledParticipant('Pete', 8, 1, 6);
    CombatManager.started = true;

    const shared = component['getSharedParticipants']();
    const sharedRow = shared.find(s => s.name === 'Gangers');
    const sharedPete = shared.find(s => s.name === 'Pete');

    expect(sharedRow?.canInterrupt).toBeFalse();
    expect(sharedPete?.canInterrupt).toBeTrue();
    expect(pete.getCurrentInitiative()).toBe(14);
  });

  it('applies a real Damage Value from the panel, so alive/dead is resolvable (p. 379)', () => {
    const row = gmRow('Gangers', 7, 8, ['G1']);
    const g1 = row.members[0];
    // The panel's DV box: 9P from a burst, not nine taps of "+1".
    component.setRowMemberDamageValue(g1, 9);
    component.hitRowMemberPhysical(row, g1);
    expect(g1.damage).toBe(9);
    expect(g1.lastDamageValue).toBe(9);

    component.hitRowMemberPhysical(row, g1); // the burst that drops him
    expect(g1.outOfAction).toBeTrue();
    expect(g1.finalState).toBe('dead'); // DV 9 > Body 3, not "1 < 3 -> alive"
  });

  it('defaults the panel DV to a single box and refuses a zero DV', () => {
    const row = gmRow('Gangers', 7, 8, ['G1']);
    const g1 = row.members[0];

    expect(component.getRowMemberDamageValue(g1)).toBe(1);
    component.hitRowMemberStun(row, g1);
    expect(g1.damage).toBe(1);

    component.setRowMemberDamageValue(g1, 0);
    expect(component.getRowMemberDamageValue(g1)).toBe(1);
    component.setRowMemberDamageValue(g1, Number.NaN);
    expect(component.getRowMemberDamageValue(g1)).toBe(1);
  });

  it('logs a shared-score change in both directions, naming the NPC', () => {
    const row = gmRow('Gangers', 7, 8, ['Ganger 1']); // 15
    const g1 = row.members[0];

    let before = LogHandler.logbook.length;
    component.applyRowMemberDamage(row, g1, 6, 'physical');
    let lines = LogHandler.logbook.slice(before).map(e => e.text);
    expect(lines.find(t => /group wound/.test(t) && /Ganger 1/.test(t) && /-2/.test(t)))
      .withContext('wound line').toBeTruthy();
    expect(row.getCurrentInitiative()).toBe(13);

    before = LogHandler.logbook.length;
    component.healRowMember(row, g1, 6);
    lines = LogHandler.logbook.slice(before).map(e => e.text);
    // The row speeding back up is just as surprising as it slowing down, and
    // needs the same explanation.
    expect(lines.find(t => /group recovery/.test(t) && /Ganger 1/.test(t) && /\+2/.test(t)))
      .withContext('recovery line').toBeTruthy();
    expect(row.getCurrentInitiative()).toBe(15);
  });

  it('logs a reinforcement joining on the row\'s current shared score (S7)', () => {
    const row = gmRow('Gangers', 7, 8, ['G1']); // 15
    CombatManager.started = true;
    CombatManager.nextIniPass();                // row now on 5
    const before = LogHandler.logbook.length;

    component.addNpcToRow(row, 'Veteran');

    const joinLine = LogHandler.logbook.slice(before).map(e => e.text)
      .find(t => /Veteran joined the group/.test(t));
    expect(joinLine).withContext('join line').toBeTruthy();
    expect(row.getCurrentInitiative()).toBe(5); // and it did not move
  });
});

// ── ADDENDUM DECISIONS 9-12 (Xavier, 2026-08-03) ──────────────────────────
//
// Post-approval extension of the same brief: a lone grunt with no row
// (Decision 9), folding standalone grunts into a group after the fact
// (Decision 10) with damage carried and no retroactive wound penalty
// (Decision 11), and identification badges on both views (Decision 12).
describe('NPC group initiative - addendum Decisions 9-12', () => {
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

  /** Two standalone grunts created the way the "Add Grunt" button creates them. */
  function twoStandaloneGrunts(): DetachedGruntParticipant[] {
    return [ component.addGrunt('Ganger A'), component.addGrunt('Ganger B') ];
  }

  // ── Decision 9 ───────────────────────────────────────────────────────────
  describe('D9 - Add Grunt: one grunt in its own initiative slot', () => {
    it('creates a grunt-shaped participant, not a row and not a PC-shaped one', () => {
      const grunt = component.addGrunt('Lone Ganger');

      expect(CombatManager.participants.contains(grunt)).toBeTrue();
      expect(hasGruntConditionMonitor(grunt)).toBeTrue();
      expect(isNpcRow(grunt)).toBeFalse();
      // ONE combined Physical + Stun track of 8 + ceil(max(B,W)/2), no overflow
      // (p. 379; RULINGS.md 2026-08-01 "A detached grunt keeps its single
      // Condition Monitor").
      expect(grunt.physicalHealth).toBe(GRUNT_CONDITION_MONITOR_BASE + 2); // B/W 3
      expect(grunt.overflowHealth).toBe(GRUNT_OVERFLOW_BOXES);
      expect(grunt.gruntBody).toBe(3);
      grunt.physicalDamage = 4;
      grunt.stunDamage = 6;
      expect(grunt.combinedDamage).toBe(GRUNT_CONDITION_MONITOR_BASE + 2);
      expect(grunt.ooc).toBeTrue(); // a PC-shaped participant would still be up
    });

    it('sizes the single track from Body / Willpower (p. 379)', () => {
      const troll = component.addGrunt('Troll', 9, 3);
      const frail = component.addGrunt('Ganger', 2, 2);

      expect(troll.physicalHealth).toBe(GRUNT_CONDITION_MONITOR_BASE + 5); // ceil(9/2)
      expect(frail.physicalHealth).toBe(GRUNT_CONDITION_MONITOR_BASE + 1); // ceil(2/2)
    });

    it('owes its own Initiative Test and takes it like any other participant', () => {
      const grunt = component.addGrunt('Lone Ganger');

      expect(grunt.diceIni).toBe(0); // no special-cased score (Decision 9)
      const shared = component['getSharedParticipants']().find(s => s.name === 'Lone Ganger');
      expect(shared?.pendingRoll).toBeTrue();

      component.btnRollInitiative_Click(grunt);

      expect(grunt.diceIni).toBeGreaterThan(0);
      expect(grunt.getCurrentInitiative()).toBe(grunt.baseIni + grunt.diceIni);
    });

    it('takes the ordinary late-entry penalty when added mid-combat (p. 160)', () => {
      CombatManager.started = true;
      CombatManager.initiativePass = 3; // two passes already elapsed
      const grunt = component.addGrunt('Reinforcement');

      grunt.diceIni = 8;

      expect(grunt.getCurrentInitiative())
        .toBe(grunt.baseIni + 8 - 2 * INITIATIVE_PASS_DECAY);
    });

    it('never gives two standalone grunts the same default name', () => {
      const a = component.addGrunt();
      const b = component.addGrunt();
      const c = component.addGrunt();

      const names = [ a.name, b.name, c.name ];
      expect(new Set(names).size).withContext(names.join(', ')).toBe(3);
    });

    it('is one undo step', () => {
      UndoHandler.StartActions();
      const grunt = component.addGrunt('Lone Ganger');
      expect(CombatManager.participants.contains(grunt)).toBeTrue();

      UndoHandler.Undo();

      expect(CombatManager.participants.contains(grunt)).toBeFalse();
    });
  });

  // ── Decision 10 ──────────────────────────────────────────────────────────
  describe('D10 - merging standalone grunts into a group', () => {
    it('folds two ticked grunts into one row and takes them out of the order', () => {
      const [ a, b ] = twoStandaloneGrunts();
      component.toggleMergeSelection(a);
      component.toggleMergeSelection(b);
      expect(component.canMergeSelectedGrunts()).toBeTrue();

      const result = component.mergeSelectedGrunts();

      expect(result.ok).toBeTrue();
      const row = result.row!;
      expect(isNpcRow(row)).toBeTrue();
      expect(row.members.map(m => m.name)).toEqual([ 'Ganger A', 'Ganger B' ]);
      // One slot in the order where there were two (criterion 2, p. 379).
      expect(CombatManager.participants.items).toEqual([ row ]);
      // Nobody had rolled, so the group still owes its ONE Initiative Test.
      expect(row.diceIni).toBe(0);
    });

    it('merges any mix of Add-Grunt and detached-from-a-row grunts', () => {
      const standalone = component.addGrunt('Ganger A');
      const source = component.addNpcRow(false);
      source.name = 'Gangers';
      component.addNpcToRow(source, 'Specialist');
      const detached = component.detachRowMember(source, source.members[0]) as DetachedGruntParticipant;
      component.toggleMergeSelection(standalone);
      component.toggleMergeSelection(detached);

      const result = component.mergeSelectedGrunts();

      expect(result.ok).toBeTrue();
      expect(result.row!.members.map(m => m.name)).toEqual([ 'Ganger A', 'Specialist' ]);
    });

    it('refuses - out loud - when one of the grunts has already rolled this turn', () => {
      const [ a, b ] = twoStandaloneGrunts();
      a.diceIni = 9; // took its Initiative Test for this Combat Turn
      component.toggleMergeSelection(a);
      component.toggleMergeSelection(b);
      const before = LogHandler.logbook.length;

      const result = component.mergeSelectedGrunts();

      expect(result.ok).toBeFalse();
      expect(result.row).toBeNull();
      expect(result.refused).toEqual([ a ]);
      // Not a silent no-op: the GM is told which grunt blocked it and why.
      expect(component.mergeMessage).toContain('Ganger A');
      expect(component.mergeMessage).toContain('already rolled Initiative');
      expect(LogHandler.logbook.slice(before).map(e => e.text)
        .find(t => /merge refused/.test(t))).withContext('refusal log line').toBeTruthy();
      // ... and nothing changed: both grunts still stand on their own scores.
      expect(CombatManager.participants.items).toEqual([ a, b ]);
    });

    it('still merges after a Combat Turn boundary clears the rolled scores', () => {
      const [ a, b ] = twoStandaloneGrunts();
      a.diceIni = 9;
      b.diceIni = 7;
      component.toggleMergeSelection(a);
      component.toggleMergeSelection(b);
      expect(component.mergeSelectedGrunts().ok).toBeFalse();

      // "after a Combat Turn ends and before the new turn's Initiative Test is
      // rolled" (Decision 10) - softReset is that boundary.
      a.softReset();
      b.softReset();

      expect(component.mergeSelectedGrunts().ok).toBeTrue();
    });

    it('refuses a merge of fewer than two grunts', () => {
      const [ a ] = twoStandaloneGrunts();
      component.toggleMergeSelection(a);

      expect(component.canMergeSelectedGrunts()).toBeFalse();
      const result = component.mergeSelectedGrunts();

      expect(result.ok).toBeFalse();
      expect(component.mergeMessage).toContain(`at least ${MIN_MERGEABLE_GRUNTS}`);
    });

    it('offers the merge tick to grunts only, never to a PC or a row', () => {
      const grunt = component.addGrunt('Ganger A');
      const row = component.addNpcRow(false);
      const pc = makeRolledParticipant('Wombat', 9, 2, 7);

      expect(component.isMergeableGruntCandidate(grunt)).toBeTrue();
      expect(component.isMergeableGruntCandidate(row)).toBeFalse();
      expect(component.isMergeableGruntCandidate(pc)).toBeFalse();
    });

    it('undoes a merge completely - grunts back, row gone, selection restored', () => {
      const [ a, b ] = twoStandaloneGrunts();
      component.toggleMergeSelection(a);
      component.toggleMergeSelection(b);
      UndoHandler.StartActions();

      const row = component.mergeSelectedGrunts().row!;
      expect(component.isSelectedForMerge(a)).toBeFalse();

      UndoHandler.Undo();

      expect(CombatManager.participants.contains(row)).toBeFalse();
      expect(CombatManager.participants.contains(a)).toBeTrue();
      expect(CombatManager.participants.contains(b)).toBeTrue();
      expect(component.isSelectedForMerge(a)).toBeTrue();
      expect(component.isSelectedForMerge(b)).toBeTrue();
    });

    it('takes the merged group\'s stat block off the first grunt (p. 378)', () => {
      const [ a, b ] = twoStandaloneGrunts();
      component.onParticipantReactionChanged(a, 5);
      component.onParticipantIntuitionChanged(a, 4);
      component.toggleMergeSelection(a);
      component.toggleMergeSelection(b);

      const row = component.mergeSelectedGrunts().row!;

      expect(row.baseIni).toBe(9);
      // A group has no Edge attribute, so ERIC falls through (Decision 5, p. 380).
      expect(component['participantEdgeRatings'].get(row)).toBe(0);
      expect(row.canUseAction(FULL_DEFENSE)).toBeFalse(); // criterion 17 holds
    });
  });

  // ── Decision 11 ──────────────────────────────────────────────────────────
  describe('D11 - merge preserves damage, applies no retroactive wound penalty', () => {
    it('carries each grunt\'s Condition Monitor damage into the row verbatim', () => {
      const [ a, b ] = twoStandaloneGrunts();
      component.onGruntCombinedDamageChanged(a, 6); // -2 on his own tests
      a.lastDamageType = 'physical';
      a.lastDamageValue = 6;
      component.onGruntCombinedDamageChanged(b, 2);
      component.toggleMergeSelection(a);
      component.toggleMergeSelection(b);

      const row = component.mergeSelectedGrunts().row!;

      const [ ma, mb ] = row.members;
      expect(ma.damage).toBe(6);
      expect(mb.damage).toBe(2);
      // Track size unchanged by the merge (p. 379's formula, same inputs).
      expect(ma.conditionMonitorBoxes).toBe(a.physicalHealth);
      expect(ma.body).toBe(a.gruntBody);
      expect(ma.lastDamageType).toBe('physical');
      expect(ma.lastDamageValue).toBe(6);
      // The member's OWN wound modifier still applies to his own pools (p. 170).
      expect(ma.wm).toBe(2);
      expect(mb.wm).toBe(0);
    });

    it('starts the shared wound accumulator at 0, however hurt the founders were', () => {
      const [ a, b ] = twoStandaloneGrunts();
      component.onGruntCombinedDamageChanged(a, 9); // -3 of his own
      component.onGruntCombinedDamageChanged(b, 6); // -2 of his own
      component.toggleMergeSelection(a);
      component.toggleMergeSelection(b);

      const row = component.mergeSelectedGrunts().row!;

      // Decision 11 / Decision 7: damage from before the merge is not a wound
      // *event* inside the row, so it never slows the new group.
      expect(row.rowWoundModifier).toBe(0);
      expect(row.wm).toBe(0);
      expect(row.getCurrentInitiative()).toBe(row.baseIni); // unrolled, unpenalised
    });

    it('still slows the whole row on the first wound event AFTER the merge (Decision 1)', () => {
      const [ a, b ] = twoStandaloneGrunts();
      component.onGruntCombinedDamageChanged(a, 6);
      component.toggleMergeSelection(a);
      component.toggleMergeSelection(b);
      const row = component.mergeSelectedGrunts().row!;
      row.diceIni = 8; // the group's one Initiative Test
      const scoreAfterRoll = row.getCurrentInitiative();

      component.applyRowMemberDamage(row, row.members[1], 6, 'physical');

      expect(row.getCurrentInitiative()).toBe(scoreAfterRoll - 2);
      expect(row.rowWoundModifier).toBe(2); // only the post-merge wound counts
    });

    it('keeps a downed grunt\'s alive/dead verdict across the merge (p. 379)', () => {
      const [ a, b ] = twoStandaloneGrunts();
      a.physicalDamage = a.physicalHealth; // track full
      a.lastDamageType = 'physical';
      a.lastDamageValue = 9;               // DV 9 > Body 3
      expect(a.finalState).toBe('dead');
      component.toggleMergeSelection(a);
      component.toggleMergeSelection(b);

      const row = component.mergeSelectedGrunts().row!;

      expect(row.members[0].outOfAction).toBeTrue();
      expect(row.members[0].finalState).toBe('dead');
    });
  });

  // ── Decision 12 ──────────────────────────────────────────────────────────
  describe('D12 - identification badges on both views', () => {
    it('badges a group row and a standalone grunt in the GM initiative list', () => {
      const row = component.addNpcRow(false);
      row.name = 'Gangers';
      component.addNpcToRow(row, 'G1');
      component.addGrunt('Lone Ganger');
      makeRolledParticipant('Wombat', 9, 2, 7);
      fixture.detectChanges();

      const rowBadges = fixture.nativeElement.querySelectorAll('[data-testid="badge-npc-row"]');
      const gruntBadges = fixture.nativeElement.querySelectorAll('[data-testid="badge-grunt"]');

      expect(rowBadges.length).withContext('one GROUP badge').toBe(1);
      expect(gruntBadges.length).withContext('one GRUNT badge').toBe(1);
      expect((rowBadges[0] as HTMLElement).textContent?.trim()).toBe('GROUP');
      expect((gruntBadges[0] as HTMLElement).textContent?.trim()).toBe('GRUNT');
    });

    it('puts both kinds on the wire for the player view', () => {
      const row = component.addNpcRow(false);
      row.name = 'Gangers';
      component.addNpcToRow(row, 'G1');
      component.addGrunt('Lone Ganger');
      makeRolledParticipant('Wombat', 9, 2, 7);

      const shared = component['getSharedParticipants']();

      expect(shared.find(s => s.name === 'Gangers')?.isNpcRow).toBeTrue();
      expect(shared.find(s => s.name === 'Gangers')?.isDetachedGrunt).toBeUndefined();
      expect(shared.find(s => s.name === 'Lone Ganger')?.isDetachedGrunt).toBeTrue();
      expect(shared.find(s => s.name === 'Wombat')?.isDetachedGrunt).toBeUndefined();
      expect(shared.find(s => s.name === 'Wombat')?.isNpcRow).toBeUndefined();
    });
  });
});

// ── Addendum defect fixes (adversarial validation, approved 2026-08-04) ─────
//
// D1 the merge could resize a Condition Monitor and revive a dead grunt;
// D2 a hand-benched grunt silently rejoined the fight on merge;
// D3 every merged row was called "Grunt Group";
// D4 GM-only bookkeeping was broadcast to players;
// D7 the merge message never cleared itself.
describe('NPC group initiative - addendum defect fixes D1-D4 / D7', () => {
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

  // ── D1 ────────────────────────────────────────────────────────────────────
  describe('D1 - Body/Willpower are real stored attributes and size the track', () => {
    it('resizes a standalone grunt\'s Condition Monitor when Body is edited (p. 379)', () => {
      const grunt = component.addGrunt('Ganger A'); // B/W 3 -> 8 + ceil(3/2) = 10

      expect(grunt.physicalHealth).toBe(gruntConditionMonitorBoxes(3, 3));

      component.onGruntBodyChanged(grunt, 9);

      // 8 + ceil(9/2) = 13. The old code left it on 10 for the grunt's whole life.
      expect(grunt.gruntBody).toBe(9);
      expect(grunt.physicalHealth).toBe(gruntConditionMonitorBoxes(9, 3));
      expect(grunt.physicalHealth).toBe(GRUNT_CONDITION_MONITOR_BASE + 5);
      // Stun capacity stays in step so the Stats tab cannot report a second,
      // larger monitor.
      expect(grunt.stunHealth).toBe(grunt.physicalHealth);
    });

    it('resizes when Willpower is edited too, and takes the higher of the two', () => {
      const grunt = component.addGrunt('Ganger A');

      component.onGruntWillpowerChanged(grunt, 8);
      expect(grunt.gruntWillpower).toBe(8);
      expect(grunt.physicalHealth).toBe(gruntConditionMonitorBoxes(3, 8)); // 12

      // Body below Willpower does not shrink it - the formula takes the max.
      component.onGruntBodyChanged(grunt, 4);
      expect(grunt.physicalHealth).toBe(gruntConditionMonitorBoxes(4, 8)); // 12
    });

    it('clamps recorded damage into a track that shrinks, never past its end', () => {
      const grunt = component.addGrunt('Ganger A', 9, 3); // 13 boxes
      component.onGruntCombinedDamageChanged(grunt, 12);
      expect(grunt.ooc).toBeFalse();

      component.onGruntBodyChanged(grunt, 2); // 8 + ceil(3/2) = 10 boxes

      expect(grunt.physicalHealth).toBe(gruntConditionMonitorBoxes(2, 3));
      expect(grunt.combinedDamage).toBe(grunt.physicalHealth);
      // A track that is full is out of action, by p. 379's own condition.
      expect(grunt.ooc).toBeTrue();
    });

    it('leaves filled boxes where they are when the track grows', () => {
      const grunt = component.addGrunt('Ganger A'); // 10 boxes
      component.onGruntCombinedDamageChanged(grunt, 6);

      component.onGruntBodyChanged(grunt, 9); // 13 boxes

      expect(grunt.combinedDamage).toBe(6); // no invented boxes either way
      expect(grunt.wm).toBe(2);
    });

    it('does not resize the Condition Monitor on merge (the reported defect)', () => {
      // A Body-9 grunt on the *default* Willpower: the old back-derivation read
      // Willpower off the box count and handed GruntMember a pair of attributes
      // that recomputed to a different, larger track.
      const a = component.addGrunt('Ganger A', 9, 3);
      const b = component.addGrunt('Ganger B', 9, 3);
      expect(a.physicalHealth).toBe(GRUNT_CONDITION_MONITOR_BASE + 5);
      component.toggleMergeSelection(a);
      component.toggleMergeSelection(b);

      const row = component.mergeSelectedGrunts().row!;

      expect(row.members[0].body).toBe(9);
      expect(row.members[0].willpower).toBe(3);
      expect(row.members[0].conditionMonitorBoxes).toBe(a.physicalHealth);
    });

    it('does not revive a downed grunt through a merge (p. 379, RULINGS 2026-08-02)', () => {
      const a = component.addGrunt('Ganger A', 9, 3); // 13 boxes
      const b = component.addGrunt('Ganger B', 9, 3);
      component.onGruntCombinedDamageChanged(a, a.physicalHealth); // track full
      a.lastDamageType = 'physical';
      a.lastDamageValue = 12; // DV 12 > Body 9
      expect(a.ooc).toBeTrue();
      expect(a.finalState).toBe('dead');
      component.toggleMergeSelection(a);
      component.toggleMergeSelection(b);

      const row = component.mergeSelectedGrunts().row!;

      expect(row.members[0].damage).toBe(a.physicalHealth);
      expect(row.members[0].conditionMonitorBoxes).toBe(a.physicalHealth);
      expect(row.members[0].outOfAction).withContext('still down').toBeTrue();
      expect(row.members[0].finalState).toBe('dead');
    });

    it('round-trips a member\'s track through detach and back through merge', () => {
      const source = component.addNpcRow(false);
      source.name = 'Gangers';
      component.addNpcToRow(source, 'Bruiser');
      component.addNpcToRow(source, 'Witch');
      source.members[0].body = 9;
      source.members[0].willpower = 2;
      const boxes = source.members[0].conditionMonitorBoxes;
      component.applyRowMemberDamage(source, source.members[0], 6, 'physical');

      const detached =
        component.detachRowMember(source, source.members[0]) as DetachedGruntParticipant;

      expect(detached.gruntBody).toBe(9);
      expect(detached.gruntWillpower).toBe(2);
      expect(detached.physicalHealth).toBe(boxes);
      expect(detached.combinedDamage).toBe(6);

      const other = component.addGrunt('Ganger B');
      component.toggleMergeSelection(detached);
      component.toggleMergeSelection(other);
      const row = component.mergeSelectedGrunts().row!;

      expect(row.members[0].conditionMonitorBoxes).toBe(boxes);
      expect(row.members[0].damage).toBe(6);
    });

    it('carries Willpower through a clone, so a duplicate keeps the same track', () => {
      const grunt = component.addGrunt('Ganger A', 3, 9);

      const copy = grunt.clone() as DetachedGruntParticipant;

      expect(copy.gruntWillpower).toBe(9);
      expect(copy.physicalHealth).toBe(grunt.physicalHealth);
    });

    it('makes a Body edit one undo step', () => {
      const grunt = component.addGrunt('Ganger A');
      const before = grunt.physicalHealth;

      component.onGruntBodyChanged(grunt, 9);
      expect(grunt.physicalHealth).not.toBe(before);

      UndoHandler.Undo();

      expect(grunt.gruntBody).toBe(3);
      expect(grunt.physicalHealth).toBe(before);
    });
  });

  // ── D2 / Decision 15 ──────────────────────────────────────────────────────
  //
  // Decision 15 (2026-08-07) REMOVES the hand-bench merge refusal D2 added:
  // nothing in the UI ever set the flag on a grunt, so the refusal was
  // unreachable dead code. Rewritten in place so the reversal stays visible.
  describe('D2/D15 - the hand-bench merge refusal is gone', () => {
    it('merges a hand-benched grunt instead of refusing (Decision 15)', () => {
      const a = component.addGrunt('Ganger A');
      const b = component.addGrunt('Ganger B');
      a.ooc = true; // the flag no GM control can actually set for a grunt
      expect(a.ooc).toBeTrue();
      component.toggleMergeSelection(a);
      component.toggleMergeSelection(b);

      const result = component.mergeSelectedGrunts();

      expect(result.ok).toBeTrue();
      expect(result.row!.members.map(m => m.name)).toEqual([ 'Ganger A', 'Ganger B' ]);
      expect(component.mergeMessage).not.toContain('taken out of the fight by hand');
    });

    it('exposes no hand-bench reader on a grunt at all', () => {
      const grunt = component.addGrunt('Ganger A');
      grunt.ooc = true;

      // The getter `mergeGruntsIntoRow` used to read is gone with the check.
      expect((grunt as unknown as Record<string, unknown>)['manuallyOutOfAction'])
        .toBeUndefined();
    });

    it('leaves ordinary participants\' manual bench behaviour untouched', () => {
      // Decision 15 is grunt/row-specific: a plain participant's Leave Combat
      // still works exactly as before.
      const plain = new Participant();
      plain.name = 'Wombat';
      CombatManager.participants.insert(plain, false);

      plain.ooc = true;
      expect(plain.ooc).toBeTrue();
      plain.ooc = false;
      expect(plain.ooc).toBeFalse();
    });

    it('still refuses a merge when a selected grunt has already rolled (Decision 10)', () => {
      // The one refusal Decision 15 does NOT touch.
      const a = component.addGrunt('Ganger A');
      const b = component.addGrunt('Ganger B');
      a.diceIni = 9;
      component.toggleMergeSelection(a);
      component.toggleMergeSelection(b);

      const result = component.mergeSelectedGrunts();

      expect(result.ok).toBeFalse();
      expect(result.refused).toEqual([ a ]);
      expect(component.mergeMessage).toContain('already rolled Initiative');
    });

    it('does not refuse a grunt who is down by damage either', () => {
      const a = component.addGrunt('Ganger A');
      const b = component.addGrunt('Ganger B');
      component.onGruntCombinedDamageChanged(a, a.physicalHealth);
      expect(a.ooc).toBeTrue();
      component.toggleMergeSelection(a);
      component.toggleMergeSelection(b);

      const result = component.mergeSelectedGrunts();

      // Damage carries into the row (Decision 11) and keeps him out of action
      // there (p. 379), so there is nothing to lose by merging him.
      expect(result.ok).toBeTrue();
      expect(result.row!.members[0].outOfAction).toBeTrue();
    });
  });

  // ── D3 ────────────────────────────────────────────────────────────────────
  describe('D3 - merged rows are numbered, so log lines stay attributable', () => {
    function mergeTwo(nameA: string, nameB: string): NpcRowParticipant {
      const a = component.addGrunt(nameA);
      const b = component.addGrunt(nameB);
      component.toggleMergeSelection(a);
      component.toggleMergeSelection(b);
      return component.mergeSelectedGrunts().row!;
    }

    it('names the first merge "Grunt Group" and the second "Grunt Group 2"', () => {
      const first = mergeTwo('A1', 'A2');
      const second = mergeTwo('B1', 'B2');
      const third = mergeTwo('C1', 'C2');

      expect(first.name).toBe('Grunt Group');
      expect(second.name).toBe('Grunt Group 2');
      expect(third.name).toBe('Grunt Group 3');
      expect(new Set([ first.name, second.name, third.name ]).size).toBe(3);
    });

    it('keeps the two rows\' log lines apart', () => {
      const first = mergeTwo('A1', 'A2');
      const second = mergeTwo('B1', 'B2');
      first.diceIni = 8;
      second.diceIni = 8;
      const before = LogHandler.logbook.length;

      component.applyRowMemberDamage(second, second.members[0], 6, 'physical');

      const lines = LogHandler.logbook.slice(before).map(e => e.text);
      expect(lines.some(t => t.startsWith('Grunt Group 2'))).toBeTrue();
      expect(lines.some(t => /^Grunt Group [^2]/.test(t) || t === 'Grunt Group')).toBeFalse();
    });

    it('skips a number the GM has already used by hand', () => {
      const row = component.addNpcRow(false);
      row.name = 'Grunt Group 4';

      expect(mergeTwo('A1', 'A2').name).toBe('Grunt Group 5');
    });
  });

  // ── D4 ────────────────────────────────────────────────────────────────────
  describe('D4 - GM bookkeeping stays out of the players\' log', () => {
    // `LogHandler.logbook` is a process-wide singleton that outlives a test, so
    // every assertion here reads only the lines this test produced.
    it('does not tell players a new grunt\'s Condition Monitor size', () => {
      const before = LogHandler.logbook.length;

      const grunt = component.addGrunt('Ganger A', 9, 3); // 13 boxes

      const line = LogHandler.logbook.slice(before).map(e => e.text)
        .find(t => /^Ganger A added\.$/.test(t))!;
      expect(line).withContext('creation line').toBeTruthy();
      expect(line).not.toContain(String(grunt.physicalHealth));
      expect(line).not.toContain('boxes');
    });

    it('marks a merge refusal hidden from players', () => {
      const a = component.addGrunt('Ganger A');
      const b = component.addGrunt('Ganger B');
      a.diceIni = 9;
      component.toggleMergeSelection(a);
      component.toggleMergeSelection(b);
      const before = LogHandler.logbook.length;

      component.mergeSelectedGrunts();

      const entry = component.sharedLogEntries.find(e => /merge refused/.test(e.text));
      expect(entry).withContext('refusal entry').toBeTruthy();
      expect(entry!.hiddenFromPlayers).toBeTrue();
      // ... and it is still in the GM's own log, tagged, exactly once.
      const local = LogHandler.logbook.slice(before).map(e => e.text)
        .filter(t => /merge refused/.test(t));
      expect(local.length).toBe(1);
      expect(local[0]).toContain('hidden from players');
    });

    it('still broadcasts the row-formed line - that one is table-visible', () => {
      const a = component.addGrunt('Ganger A');
      const b = component.addGrunt('Ganger B');
      component.toggleMergeSelection(a);
      component.toggleMergeSelection(b);
      const before = LogHandler.logbook.length;

      component.mergeSelectedGrunts();

      const line = LogHandler.logbook.slice(before).map(e => e.text)
        .find(t => /formed from/.test(t))!;
      expect(line).toBeTruthy();
      expect(line).not.toContain('hidden from players');
    });

    it('opens its own undo chapter for the refusal instead of joining an open one', () => {
      const a = component.addGrunt('Ganger A');
      const b = component.addGrunt('Ganger B');
      a.diceIni = 9;
      component.toggleMergeSelection(a);
      component.toggleMergeSelection(b);
      // An unrelated edit whose chapter is still open when the refusal lands.
      UndoHandler.StartActions();
      b.name = 'Ganger B renamed';

      component.mergeSelectedGrunts();
      UndoHandler.Undo();

      // Undo takes back the refusal's chapter, not the rename's.
      expect(b.name).toBe('Ganger B renamed');
    });
  });

  // ── D7 ────────────────────────────────────────────────────────────────────
  describe('D7 - the merge message clears itself', () => {
    it('dismisses a success message rather than leaving it on screen', fakeAsync(() => {
      const a = component.addGrunt('Ganger A');
      const b = component.addGrunt('Ganger B');
      component.toggleMergeSelection(a);
      component.toggleMergeSelection(b);

      component.mergeSelectedGrunts();
      expect(component.mergeMessage).toContain('Merged');

      tick(MERGE_MESSAGE_DISMISS_MS);

      expect(component.mergeMessage).toBe('');
      discardPeriodicTasks();
      flush();
    }));

    it('dismisses a refusal message too', fakeAsync(() => {
      const a = component.addGrunt('Ganger A');
      const b = component.addGrunt('Ganger B');
      a.diceIni = 9;
      component.toggleMergeSelection(a);
      component.toggleMergeSelection(b);

      component.mergeSelectedGrunts();
      expect(component.mergeMessage).toContain('Cannot merge');

      tick(MERGE_MESSAGE_DISMISS_MS);

      expect(component.mergeMessage).toBe('');
      discardPeriodicTasks();
      flush();
    }));

    it('is cleared immediately by the next selection tap, not left to time out',
      fakeAsync(() => {
        const a = component.addGrunt('Ganger A');
        const b = component.addGrunt('Ganger B');
        a.diceIni = 9;
        component.toggleMergeSelection(a);
        component.toggleMergeSelection(b);
        component.mergeSelectedGrunts();
        expect(component.mergeMessage).not.toBe('');

        component.toggleMergeSelection(a);

        expect(component.mergeMessage).toBe('');
        discardPeriodicTasks();
        flush();
      }));

    it('restarts the countdown on a second message instead of stacking timers',
      fakeAsync(() => {
        const a = component.addGrunt('Ganger A');
        const b = component.addGrunt('Ganger B');
        a.diceIni = 9;
        component.toggleMergeSelection(a);
        component.toggleMergeSelection(b);
        component.mergeSelectedGrunts();

        tick(MERGE_MESSAGE_DISMISS_MS - 1);
        component.mergeSelectedGrunts(); // refused again, message re-shown
        tick(MERGE_MESSAGE_DISMISS_MS - 1);

        expect(component.mergeMessage).withContext('still up').not.toBe('');
        tick(1);
        expect(component.mergeMessage).toBe('');
        discardPeriodicTasks();
        flush();
      }));
  });
});

// == ROUND 3 DECISIONS 13-19 (Xavier, 2026-08-07) ==========================
//
// Table-tested fixes and reversals to the shipped feature. Two of them reverse
// earlier decisions outright (13 reverses the 2026-08-02 heal refusal, 14
// reverses Decision 8's auto-delete) and one removes an earlier fix as dead
// code (15). One describe per decision, in the brief's order.
describe('NPC group initiative - Round 3 Decisions 13-19', () => {
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

  /**
   * Open a share session and capture everything that would reach players.
   * `appendSharedLog` is a no-op with no room code, and the entry never comes
   * back through the server in a unit test, so the outbound call is the only
   * honest place to read the players' copy of a line.
   */
  function capturePlayerLog(): SharedLogEntry[] {
    const sent: SharedLogEntry[] = [];
    component.shareRoomCode = 'ABC123';
    spyOn(component['sessionSync'], 'appendLog').and.callFake((entry: SharedLogEntry) => {
      sent.push(entry);
    });
    return sent;
  }

  // -- Decision 13 ---------------------------------------------------------
  describe('D13 - healing revives a downed grunt', () => {
    it('takes boxes off a GruntMember whose track is full (reverses 2026-08-02)', () => {
      const m = new GruntMember('G1', 3, 3); // 10 boxes
      m.applyDamage(10, 'physical');
      expect(m.outOfAction).toBeTrue();

      const healed = m.healDamage(4);

      expect(healed).toBe(4);
      expect(m.damage).toBe(6);
      expect(m.outOfAction).withContext('out-of-action is re-derived, not latched').toBeFalse();
    });

    it('derives out-of-action live in both directions, like the grow path', () => {
      const m = new GruntMember('G1', 3, 3);
      m.applyDamage(10, 'physical');
      expect(m.outOfAction).toBeTrue();
      m.healDamage(1);
      expect(m.outOfAction).toBeFalse();
      m.applyDamage(1, 'physical');
      expect(m.outOfAction).toBeTrue();
      // ... and the grow direction the 2026-08-04 ruling already accepted.
      m.body = 9;
      expect(m.outOfAction).toBeFalse();
    });

    it('leaves the final-attack record untouched, so history stays readable', () => {
      const m = new GruntMember('G1', 3, 3);
      m.applyDamage(10, 'physical'); // DV 10 > Body 3
      expect(m.finalState).toBe('dead');

      m.healDamage(4);

      expect(m.lastDamageType).toBe('physical');
      expect(m.lastDamageValue).toBe(10);
      expect(m.finalState).toBe('standing');
    });

    it('pays the row its shared wound penalty back for a downed member', () => {
      const row = gmRow('Gangers', 7, 8, ['G 1']); // 15
      const g1 = row.members[0];
      component.applyRowMemberDamage(row, g1, g1.conditionMonitorBoxes, 'physical');
      const downScore = row.getCurrentInitiative();

      const result = component.healRowMember(row, g1, 9);

      expect(result.healed).toBe(9);
      expect(g1.outOfAction).toBeFalse();
      // 10 boxes -> 1 box: the whole -3 the row was carrying comes back off.
      expect(result.rowWoundModifierDelta).toBe(-3);
      expect(row.getCurrentInitiative()).toBe(downScore + 3);
    });

    it('revives a standalone grunt the same way, off its combined track', () => {
      const grunt = component.addGrunt('Lone Ganger'); // 10 boxes
      component.onGruntCombinedDamageChanged(grunt, grunt.physicalHealth);
      expect(grunt.ooc).toBeTrue();

      component.onGruntCombinedDamageChanged(grunt, grunt.physicalHealth - 2);

      expect(grunt.ooc).withContext('no latched out-of-action on a detached grunt').toBeFalse();
    });
  });

  // -- Decision 14 ---------------------------------------------------------
  describe('D14 - a spent row is flagged, not deleted', () => {
    it('keeps a fully-downed row in the order, flagged out of action', () => {
      const row = gmRow('Gangers', 7, 8, ['G 1', 'G 2']);
      for (const m of [...row.members]) {
        component.applyRowMemberDamage(row, m, m.conditionMonitorBoxes, 'physical');
      }

      expect(CombatManager.participants.contains(row)).toBeTrue();
      expect(row.spentFlagged).toBeTrue();
      // The same flag every other downed participant carries, which is what the
      // GM list styles.
      expect(row.ooc).toBeTrue();
      expect(component.getParticipantStyles(row).ooc).toBeTrue();
    });

    it('never hands a flagged row the initiative again', () => {
      const row = gmRow('Gangers', 9, 8, ['G 1']);   // 17
      const pete = makeRolledParticipant('Pete', 8, 1, 2); // 10
      CombatManager.started = true;
      CombatManager.passEnded = false;
      component.applyRowMemberDamage(row, row.members[0], row.members[0].conditionMonitorBoxes, 'physical');

      CombatManager.goToNextActors();

      expect(CombatManager.currentActors.items).toEqual([pete]);
    });

    it('flags only the row wiped out by damage - manual removal and detach do not (Decision 21)', async () => {
      // Narrows the old "however the row emptied" expectation: since Decision
      // 21, only a row taken out BY DAMAGE reads as wiped out. Manual removal
      // of the last NPC deletes the now-empty row outright (offered in the
      // same prompt); detaching the last NPC leaves a plain, unflagged empty
      // row behind.
      const killed = gmRow('Killed', 7, 8, ['K1']);
      const emptied = gmRow('Emptied', 7, 8, ['E1']);
      const drained = gmRow('Drained', 7, 8, ['D1']);
      spyOn(component['confirmationDialog'], 'simpleConfirm').and.resolveTo(true);

      component.applyRowMemberDamage(killed, killed.members[0], killed.members[0].conditionMonitorBoxes, 'physical');
      await component.removeRowMember(emptied, emptied.members[0]);
      component.detachRowMember(drained, drained.members[0]);

      expect(CombatManager.participants.contains(killed)).toBeTrue();
      expect(killed.spentFlagged).toBeTrue();

      expect(CombatManager.participants.contains(emptied)).toBeFalse();

      expect(CombatManager.participants.contains(drained)).toBeTrue();
      expect(drained.spentFlagged).toBeFalse();
      expect(drained.ooc).toBeFalse();
    });

    it('still lets the GM remove it with the per-row delete control', async () => {
      const row = gmRow('Gangers', 7, 8, ['G 1']);
      component.applyRowMemberDamage(row, row.members[0], row.members[0].conditionMonitorBoxes, 'physical');
      spyOn(component['confirmationDialog'], 'simpleConfirm').and.resolveTo(true);

      await component.btnDelete_Click(row);

      expect(CombatManager.participants.contains(row)).toBeFalse();
    });
  });

  // -- Decision 15 ---------------------------------------------------------
  describe('D15 - the manual bench flag is gone from the grunt paths', () => {
    it('merges hand-benched grunts without a refusal', () => {
      const a = component.addGrunt('Ganger A');
      const b = component.addGrunt('Ganger B');
      a.ooc = true;
      component.toggleMergeSelection(a);
      component.toggleMergeSelection(b);

      expect(component.mergeSelectedGrunts().ok).toBeTrue();
    });

    it('keeps Participant.ooc working for a plain participant', () => {
      const plain = new Participant();
      CombatManager.participants.insert(plain, false);

      plain.ooc = true;
      expect(plain.ooc).toBeTrue();
      plain.ooc = false;
      expect(plain.ooc).toBeFalse();
    });
  });

  // -- Decision 16 ---------------------------------------------------------
  describe('D16 - no Simple or Complex action at Initiative Score 0 or below', () => {
    const FREE_ACTION = { name: 'Change Linked Device Mode', economy: 'free' } as DeclaredActionItem;
    const SIMPLE_ACTION = { name: 'Take Aim', economy: 'simple' } as DeclaredActionItem;
    const COMPLEX_ACTION = { name: 'Melee Attack', economy: 'complex' } as DeclaredActionItem;

    /** A participant with a live, positive Initiative Score. */
    function actor(score: number): Participant {
      const p = makeRolledParticipant('Wombat', 6, 1, 1);
      CombatManager.started = true;
      p.applyInitiativeScoreDelta(score - p.getCurrentInitiative());
      return p;
    }

    it('blocks Simple and Complex, and allows Free, at exactly 0', () => {
      const p = actor(0);

      expect(p.getCurrentInitiative()).toBe(0);
      expect(component.hasLiveActionPhase(p)).toBeFalse();
      expect(component.canUseDeclaredAction(p, SIMPLE_ACTION)).toBeFalse();
      expect(component.canUseDeclaredAction(p, COMPLEX_ACTION)).toBeFalse();
      expect(component.canUseDeclaredAction(p, FREE_ACTION))
        .withContext('one Free Action per pass survives (p. 160)').toBeTrue();
    });

    it('blocks them below 0 too, and allows them above 0', () => {
      const p = actor(-4);
      expect(component.canUseDeclaredAction(p, SIMPLE_ACTION)).toBeFalse();
      expect(component.canUseDeclaredAction(p, COMPLEX_ACTION)).toBeFalse();

      p.applyInitiativeScoreDelta(5); // back to 1
      expect(p.getCurrentInitiative()).toBe(1);
      expect(component.canUseDeclaredAction(p, SIMPLE_ACTION)).toBeTrue();
      expect(component.canUseDeclaredAction(p, COMPLEX_ACTION)).toBeTrue();
    });

    it('applies to a row, a standalone grunt and a PC alike', () => {
      CombatManager.started = true;
      const row = gmRow('Gangers', 7, 8, ['G 1']);
      const grunt = component.addGrunt('Lone Ganger');
      grunt.diceIni = 1;
      const pc = makeRolledParticipant('Wombat', 6, 1, 1);
      for (const p of [row, grunt, pc]) {
        p.applyInitiativeScoreDelta(-p.getCurrentInitiative());
        expect(p.getCurrentInitiative()).withContext(p.name).toBe(0);
        expect(component.canUseDeclaredAction(p, SIMPLE_ACTION)).withContext(p.name).toBeFalse();
        expect(component.canUseDeclaredAction(p, COMPLEX_ACTION)).withContext(p.name).toBeFalse();
        expect(component.canUseDeclaredAction(p, FREE_ACTION)).withContext(p.name).toBeTrue();
      }
    });

    it('says why, rather than greying the action out silently', () => {
      const p = actor(0);

      expect(component.getActionDisabledReason(p, SIMPLE_ACTION)).toContain('Free Action only');
      expect(component.getActionDisabledReason(p, COMPLEX_ACTION)).toContain('no Action Phase');
      expect(component.getActionDisabledReason(p, FREE_ACTION)).toBe('');
    });

    it('refuses to submit a Simple selection made before the Score dropped', () => {
      const p = actor(6);
      component['declaredActionSelections'].set(p, {
        free: null, simple: [SIMPLE_ACTION.name], complex: null
      });
      expect(component.isDeclaredActionSelectionValid(p)).toBeTrue();

      p.applyInitiativeScoreDelta(-6); // 0

      expect(component.isDeclaredActionSelectionValid(p)).toBeFalse();
      expect(component.getDeclaredActionValidationMessage(p)).toContain('no Action Phase');
    });

    it('still lets a Free-Action-only selection through at 0 or below', () => {
      const p = actor(0);
      component['declaredActionSelections'].set(p, {
        free: FREE_ACTION.name, simple: [], complex: null
      });

      expect(component.isDeclaredActionSelectionValid(p)).toBeTrue();
    });

    it('does not gate Interrupt Actions or defence through this path', () => {
      // Interrupts keep their own cost gate (p. 167) and are declared outside
      // the Act modal; a Defense Test is not modelled as a gated action at all.
      const p = actor(6);
      expect(p.canUseAction(PARRY)).toBeTrue();
      p.applyInitiativeScoreDelta(-6);
      expect(p.getCurrentInitiative()).toBe(0);
      expect(p.canUseAction(PARRY))
        .withContext('refused by cost, which is the p. 167 gate, not this one').toBeFalse();
    });

    it('does not gate anything before combat starts', () => {
      const p = new Participant();
      CombatManager.participants.insert(p, false);
      CombatManager.started = false;

      expect(component.hasLiveActionPhase(p)).toBeTrue();
    });
  });

  // -- Decision 17 ---------------------------------------------------------
  describe('D17 - row/grunt log privacy', () => {
    it('keeps the Condition Monitor fraction out of the players\' damage line', () => {
      const sent = capturePlayerLog();
      const row = gmRow('Gangers', 7, 8, ['G 1']);

      component.applyRowMemberDamage(row, row.members[0], 6, 'physical');

      const playerLine = sent.find(e => /took 6 Physical/.test(e.text))!;
      expect(playerLine).withContext('player damage line').toBeTruthy();
      expect(playerLine.text).not.toContain('/');
      expect(playerLine.text).toBe('G 1 took 6 Physical');
      // The GM's own copy still carries the running total, but not the
      // Condition Monitor's maximum (Decision 25, `RULINGS.md` 2026-08-13).
      const gmLine = LogHandler.logbook.map(e => e.text).reverse()
        .find(t => /took 6 Physical/.test(t))!;
      expect(gmLine).toContain('(6)');
      expect(gmLine).not.toContain('/');
    });

    it('keeps it out of the heal line too', () => {
      const sent = capturePlayerLog();
      const row = gmRow('Gangers', 7, 8, ['G 1']);
      component.applyRowMemberDamage(row, row.members[0], 6, 'physical');

      component.healRowMember(row, row.members[0], 2);

      const playerLine = sent.find(e => /healed 2/.test(e.text))!;
      expect(playerLine.text).toBe('G 1 healed 2');
      const gmLine = LogHandler.logbook.map(e => e.text).reverse()
        .find(t => /healed 2/.test(t))!;
      expect(gmLine).toContain('(4)');
      expect(gmLine).not.toContain('/');
    });

    it('sends the group-wound house-rule line to the GM only', () => {
      const sent = capturePlayerLog();
      const row = gmRow('Gangers', 7, 8, ['G 1']);

      component.applyRowMemberDamage(row, row.members[0], 6, 'physical');

      expect(sent.some(e => /group wound/.test(e.text)))
        .withContext('must not reach players').toBeFalse();
      const entry = component.sharedLogEntries.find(e => /group wound/.test(e.text))!;
      expect(entry).withContext('GM entry').toBeTruthy();
      expect(entry.hiddenFromPlayers).toBeTrue();
      expect(entry.houseRule).toBeTrue();
    });

    it('sends the recovery direction of that line to the GM only as well', () => {
      const sent = capturePlayerLog();
      const row = gmRow('Gangers', 7, 8, ['G 1']);
      component.applyRowMemberDamage(row, row.members[0], 6, 'physical');

      component.healRowMember(row, row.members[0], 6);

      expect(sent.some(e => /group wound|group recovery/.test(e.text))).toBeFalse();
      expect(component.sharedLogEntries.filter(e => /group wound|group recovery/.test(e.text))
        .every(e => e.hiddenFromPlayers === true)).toBeTrue();
    });

    it('sends the "every member is out of action" line to the GM only', () => {
      const sent = capturePlayerLog();
      const row = gmRow('Gangers', 7, 8, ['G 1']);

      component.applyRowMemberDamage(row, row.members[0], row.members[0].conditionMonitorBoxes, 'physical');

      expect(sent.some(e => /every member is out of action/.test(e.text))).toBeFalse();
      const entry = component.sharedLogEntries.find(e => /every member is out of action/.test(e.text))!;
      expect(entry).withContext('GM entry').toBeTruthy();
      expect(entry.hiddenFromPlayers).toBeTrue();
      // The individual NPC going down is still shared - that one IS fiction.
      expect(sent.some(e => /G 1 is out of action/.test(e.text))).toBeTrue();
    });
  });

  // -- Decision 18 ---------------------------------------------------------
  describe('D18 - per-NPC acted tracking inside a row', () => {
    it('marks and unmarks one NPC without touching the others', () => {
      const row = gmRow('Gangers', 7, 8, ['G 1', 'G 2']);
      const [g1, g2] = [row.members[0], row.members[1]];

      component.toggleRowMemberActed(g1);

      expect(component.isRowMemberActed(g1)).toBeTrue();
      expect(component.isRowMemberActed(g2)).toBeFalse();

      component.toggleRowMemberActed(g1);
      expect(component.isRowMemberActed(g1)).toBeFalse();
    });

    it('summarises the row for the panel header, counting only NPCs still up', () => {
      const row = gmRow('Gangers', 7, 8, ['G 1', 'G 2', 'G 3']);
      expect(component.getRowActedSummary(row)).toBe('0/3 acted');

      component.toggleRowMemberActed(row.members[0]);
      expect(component.getRowActedSummary(row)).toBe('1/3 acted');

      // A downed NPC is skipped when the row comes up (p. 379), so it must not
      // leave the row looking permanently unfinished.
      component.applyRowMemberDamage(row, row.members[2], row.members[2].conditionMonitorBoxes, 'physical');
      expect(component.getRowActedSummary(row)).toBe('1/2 acted');
    });

    it('clears every marker at the Initiative Pass boundary (p. 159)', () => {
      const row = gmRow('Gangers', 7, 8, ['G 1', 'G 2']);
      CombatManager.started = true;
      component.toggleRowMemberActed(row.members[0]);
      component.toggleRowMemberActed(row.members[1]);

      CombatManager.nextIniPass();

      expect(row.members.map(m => m.hasActed)).toEqual([false, false]);
    });

    it('clears them at the Combat Turn boundary too', () => {
      const row = gmRow('Gangers', 7, 8, ['G 1']);
      component.toggleRowMemberActed(row.members[0]);

      row.softReset();

      expect(row.members[0].hasActed).toBeFalse();
    });

    it('is one undo step, like every other row mutation', () => {
      const row = gmRow('Gangers', 7, 8, ['G 1']);
      component.toggleRowMemberActed(row.members[0]);
      expect(row.members[0].hasActed).toBeTrue();

      UndoHandler.Undo();

      expect(row.members[0].hasActed).toBeFalse();
    });

    it('renders an Act control per member and dims the ones that have gone', () => {
      const row = gmRow('Gangers', 7, 8, ['G 1', 'G 2']);
      component.selectActor(row);
      fixture.detectChanges();

      const buttons = fixture.nativeElement.querySelectorAll('.npc-row-acted');
      expect(buttons.length).toBe(2);
      expect((buttons[0] as HTMLElement).textContent!.trim()).toBe('Act');

      component.toggleRowMemberActed(row.members[0]);
      fixture.detectChanges();

      const after = fixture.nativeElement.querySelectorAll('.npc-row-acted');
      expect((after[0] as HTMLElement).textContent!.trim()).toBe('Acted');
      expect(fixture.nativeElement.querySelectorAll('.npc-row-member-acted').length).toBe(1);
    });
  });

  // -- Decision 19 ---------------------------------------------------------
  describe('D19 - default naming and panel chrome', () => {
    it('never names a new row the literal "NPC Row"', () => {
      const first = component.addNpcRow(false);
      const second = component.addNpcRow(false);

      expect(first.name).toBe('Grunt Group');
      expect(second.name).toBe('Grunt Group 2');
      expect([first.name, second.name]).not.toContain('NPC Row');
    });

    it('does not repeat the row name inside its own log lines', () => {
      const row = component.addNpcRow(false);
      row.baseIni = 7;
      row.setDicesWithoutRoll(2);
      const member = component.addNpcToRow(row);
      row.diceIni = 8;
      const before = LogHandler.logbook.length;

      component.applyRowMemberDamage(row, member, member.conditionMonitorBoxes, 'physical');

      const line = LogHandler.logbook.slice(before).map(e => e.text)
        .find(t => /is out of action/.test(t))!;
      expect(line).withContext('down line').toBeTruthy();
      // The old shape was "NPC Row NPC Row 1 is out of action ..." - the row's
      // name as the actor and again as the member's name prefix.
      expect(member.name).toBe('NPC 1');
      expect(line.startsWith('Grunt Group NPC 1 ')).toBeTrue();
      expect(line.match(/Grunt Group/g)!.length).toBe(1);
    });

    it('still names members after the row once the GM has named it', () => {
      const row = component.addNpcRow(false);
      row.name = 'Gangers';

      expect(component.addNpcToRow(row).name).toBe('Gangers 1');
      expect(component.addNpcToRow(row).name).toBe('Gangers 2');
    });

    it('drops the "One Initiative Test for the whole row" blurb above the panel', () => {
      const row = gmRow('Gangers', 7, 8, ['G 1']);
      component.selectActor(row);
      fixture.detectChanges();

      const panel = fixture.nativeElement.querySelector('.npc-row-panel') as HTMLElement;
      expect(panel).withContext('row panel is open').toBeTruthy();
      expect(panel.textContent).not.toContain('One Initiative Test for the whole row');
      expect(panel.textContent).not.toContain('Wounds slow the whole row');
      // The shared score is still on screen, in the row's own header.
      expect(row.getCurrentInitiative()).toBe(15);
      expect(fixture.nativeElement.textContent).toContain('15');
    });
  });
});

// ── ROUND 4 DECISIONS 20-25 (Xavier, 2026-08-13) ───────────────────────────
describe('NPC group initiative - Round 4 Decisions 20-25', () => {
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

  /** The rendered `.participant` row for a given name, name matched by text. */
  /**
   * The rendered `.participant` row for a given participant. The name field
   * is an `<input>` (its value is not `textContent`), so this looks the row
   * up by index (`#participant{{i}}`, the same pattern
   * `battle-tracker.component.spec.ts` already uses) rather than by text.
   */
  function participantRow(p: Participant | NpcRowParticipant): HTMLElement {
    const index = CombatManager.participants.items.indexOf(p as unknown as Participant);
    const el = fixture.nativeElement.querySelector('#participant' + index) as HTMLElement | null;
    if (!el) {
      throw new Error(`no rendered participant row found at index ${index}`);
    }
    return el;
  }

  function alwaysConfirm(): void {
    spyOn(component['confirmationDialog'], 'simpleConfirm').and.resolveTo(true);
  }

  // -- Decision 20 -----------------------------------------------------------
  describe('D20 - a grunt DV can exceed his remaining boxes (RULINGS.md 2026-08-13)', () => {
    it('records the full DV as the final attack, capping only the boxes written', () => {
      const grunt = component.addGrunt('Lone Ganger', 3, 3); // 10 boxes
      component.setGruntDamageValue(grunt, 14);

      const result = component.hitGruntPhysical(grunt);

      expect(result.applied).toBe(10); // no overflow (p. 379)
      expect(grunt.combinedDamage).toBe(10);
      expect(grunt.lastDamageValue).toBe(14); // full DV recorded, not just the 10 written
      expect(grunt.finalState).toBe('dead'); // DV 14 > Body 3
    });

    it('reads alive instead of dead when the same over-max hit is Stun', () => {
      const grunt = component.addGrunt('Lone Ganger', 3, 3);
      component.setGruntDamageValue(grunt, 14);

      component.hitGruntStun(grunt);

      expect(grunt.stunDamage).toBe(10);
      expect(grunt.finalState).toBe('alive'); // Stun always reads alive (p. 379)
    });

    it('heals a box back off and un-latches out-of-action, mirroring the row panel', () => {
      const grunt = component.addGrunt('Lone Ganger', 3, 3);
      component.setGruntDamageValue(grunt, 10);
      component.hitGruntPhysical(grunt);
      expect(grunt.ooc).toBeTrue();

      component.healGrunt(grunt, 1);

      expect(grunt.combinedDamage).toBe(9);
      expect(grunt.ooc).toBeFalse();
    });

    it('defaults the DV to a single box and clamps a zero/NaN entry, like the row panel', () => {
      const grunt = component.addGrunt('Lone Ganger');
      expect(component.getGruntDamageValue(grunt)).toBe(1);
      component.setGruntDamageValue(grunt, 0);
      expect(component.getGruntDamageValue(grunt)).toBe(1);
      component.setGruntDamageValue(grunt, Number.NaN);
      expect(component.getGruntDamageValue(grunt)).toBe(1);
    });

    it('gives the same DV controls to a grunt detached from a row', () => {
      const row = gmRow('Gangers', 7, 8, ['Witch']);
      const detached = component.detachRowMember(row, row.members[0]) as DetachedGruntParticipant;
      component.setGruntDamageValue(detached, 20);

      component.hitGruntPhysical(detached);

      expect(detached.lastDamageValue).toBe(20);
      expect(detached.ooc).toBeTrue();
    });

    it('renders the DV + P/S/-1 controls on the standalone grunt panel, and drops the old CM note (Decision 25)', () => {
      const grunt = component.addGrunt('Lone Ganger');
      component.selectActor(grunt);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.grunt-dv')).withContext('DV input').toBeTruthy();
      expect(fixture.nativeElement.querySelector('.grunt-hit-physical')).withContext('P button').toBeTruthy();
      expect(fixture.nativeElement.querySelector('.grunt-hit-stun')).withContext('S button').toBeTruthy();
      expect(fixture.nativeElement.querySelector('.grunt-heal')).withContext('-1 button').toBeTruthy();
      expect(fixture.nativeElement.querySelector('.grunt-cm-note'))
        .withContext('old blurb removed (Decision 25)').toBeFalsy();
    });
  });

  // -- Decision 21 -------------------------------------------------------
  describe('D21 - manual removal never reads as wiped out, and always prompts', () => {
    it('prompts before removing an NPC, and does nothing on cancel', async () => {
      const row = gmRow('Gangers', 7, 8, ['G 1', 'G 2']);
      const confirmSpy = spyOn(component['confirmationDialog'], 'simpleConfirm').and.resolveTo(false);

      await component.removeRowMember(row, row.members[0]);

      expect(confirmSpy).toHaveBeenCalled();
      expect(row.members.map(m => m.name)).toEqual(['G 1', 'G 2']);
    });

    it('does not stall the tracker when the last member of the ACTING row is removed by hand', async () => {
      const row = gmRow('Gangers', 9, 8, ['G 1']); // 17
      const pete = makeRolledParticipant('Pete', 8, 1, 2); // 10
      alwaysConfirm();
      CombatManager.started = true;
      CombatManager.passEnded = false;
      CombatManager.goToNextActors();
      expect(CombatManager.currentActors.items).toEqual([row]);

      await component.removeRowMember(row, row.members[0]);

      // The row is gone (last member removed, Decision 21 deletes it), and
      // the pass keeps moving - Pete is up, not stuck with only Undo.
      expect(CombatManager.participants.contains(row)).toBeFalse();
      expect(CombatManager.currentActors.items).toEqual([pete]);
      expect(CombatManager.passEnded).toBeFalse();
    });
  });

  // -- Decision 22 -------------------------------------------------------
  describe('D22 - a grunt row has no whole-row Act button', () => {
    it('hides the whole-row Act button for a row, keeps it for an ordinary participant', () => {
      CombatManager.started = true;
      const row = gmRow('Gangers', 7, 8, ['G 1']);
      const pete = makeRolledParticipant('Pete', 8, 1, 2);
      row.status = StatusEnum.Active;
      pete.status = StatusEnum.Active;
      fixture.detectChanges();

      const rowActButtons = Array.from(participantRow(row).querySelectorAll('.gm-action-buttons button'))
        .filter(b => (b as HTMLElement).textContent?.trim() === 'Act');
      const peteActButtons = Array.from(participantRow(pete).querySelectorAll('.gm-action-buttons button'))
        .filter(b => (b as HTMLElement).textContent?.trim() === 'Act');

      expect(rowActButtons.length).withContext('row Act button').toBe(0);
      expect(peteActButtons.length).withContext('ordinary participant Act button').toBe(1);
    });

    it('still shows Delay for a row (kept, unlike Act - see Decision 22 notes)', () => {
      CombatManager.started = true;
      const row = gmRow('Gangers', 7, 8, ['G 1']);
      row.status = StatusEnum.Active;
      fixture.detectChanges();

      const delayButtons = Array.from(participantRow(row).querySelectorAll('.gm-action-buttons button'))
        .filter(b => (b as HTMLElement).textContent?.trim() === 'Delay');
      expect(delayButtons.length).toBe(1);
    });
  });

  // -- Decisions 23 & 24 --------------------------------------------------
  describe('D23/D24 - a member Act opens the modal, logs, and gates on the row being up', () => {
    it('is disabled until the row is the current actor with a live Action Phase (D24)', () => {
      const row = gmRow('Gangers', 9, 8, ['G 1']); // 17
      expect(component.canRowMemberAct(row)).withContext('combat not started').toBeFalse();

      CombatManager.started = true;
      CombatManager.passEnded = false;
      CombatManager.goToNextActors();
      expect(component.canRowMemberAct(row)).withContext('row is the current actor').toBeTrue();

      row.applyInitiativeScoreDelta(-row.getCurrentInitiative()); // to 0 - Decision 16
      expect(component.canRowMemberAct(row)).withContext('no live Action Phase at Score 0').toBeFalse();
    });

    it('disables the not-yet-acted button in the template, but never the un-mark direction', () => {
      const row = gmRow('Gangers', 9, 8, ['G 1']); // not the current actor yet
      component.selectActor(row);
      fixture.detectChanges();
      let button = fixture.nativeElement.querySelector('.npc-row-acted') as HTMLButtonElement;
      expect(button.disabled).withContext('row not up yet').toBeTrue();

      CombatManager.started = true;
      CombatManager.passEnded = false;
      CombatManager.goToNextActors();
      fixture.detectChanges();
      button = fixture.nativeElement.querySelector('.npc-row-acted') as HTMLButtonElement;
      expect(button.disabled).withContext('row is up').toBeFalse();

      // A mis-tap correction (un-mark) must always be reachable, current
      // actor or not.
      CombatManager.started = false;
      row.members[0].hasActed = true;
      fixture.detectChanges();
      button = fixture.nativeElement.querySelector('.npc-row-acted') as HTMLButtonElement;
      expect(button.textContent?.trim()).toBe('Acted');
      expect(button.disabled).withContext('un-mark always reachable').toBeFalse();
    });

    it('opens the Act modal scoped to the member and logs the declared action attributed to it (D23)', () => {
      const row = gmRow('Gangers', 9, 8, ['G 1', 'G 2']); // 17
      CombatManager.started = true;
      CombatManager.passEnded = false;
      CombatManager.goToNextActors();
      spyOn(component['modalService'], 'open').and.returnValue(
        { close: () => {}, dismiss: () => {}, result: new Promise(() => {}) } as any);

      component.btnRowMemberAct_Click(row, row.members[0], null as any);

      expect(component.actModalParticipant).toBe(row);
      expect(component.actModalRowMember).toBe(row.members[0]);

      component['declaredActionSelections'].set(row, { free: 'Drop Prone', simple: [], complex: null });
      const before = LogHandler.logbook.length;

      component.submitActModal();

      expect(row.members[0].hasActed).toBeTrue();
      expect(row.members[1].hasActed).withContext('only the declaring member is marked').toBeFalse();
      const lines = LogHandler.logbook.slice(before).map(e => e.text);
      expect(lines.find(t => /G 1 dropped prone \(free\)/.test(t)))
        .withContext('attributed to the NPC, not the row').toBeTruthy();
      // Not everyone in the row has gone yet, so it keeps the current-actor
      // slot - a group does not finish its Action Phase after one member.
      expect(CombatManager.currentActors.items).toEqual([row]);
    });

    it('finishes the row Action Phase and advances only once every member has acted', () => {
      const row = gmRow('Gangers', 9, 8, ['G 1', 'G 2']); // 17
      const pete = makeRolledParticipant('Pete', 8, 1, 2); // 10
      CombatManager.started = true;
      CombatManager.passEnded = false;
      CombatManager.goToNextActors();
      expect(CombatManager.currentActors.items).toEqual([row]);

      component['performRowMemberAct'](row, row.members[0], 'Ready Weapon');
      expect(CombatManager.currentActors.items)
        .withContext('G 2 has not gone yet').toEqual([row]);

      component['performRowMemberAct'](row, row.members[1], 'Ready Weapon');

      expect(row.status).toBe(StatusEnum.Finished);
      expect(CombatManager.currentActors.items).toEqual([pete]);
    });

    it('skips a downed member when deciding whether the row has finished acting', () => {
      const row = gmRow('Gangers', 9, 8, ['G 1', 'G 2']); // 17
      CombatManager.started = true;
      CombatManager.passEnded = false;
      CombatManager.goToNextActors();
      component.applyRowMemberDamage(row, row.members[1], row.members[1].conditionMonitorBoxes, 'physical');
      expect(CombatManager.currentActors.items)
        .withContext('row still owes G 1 an action').toEqual([row]);

      component['performRowMemberAct'](row, row.members[0], null);

      expect(row.status).toBe(StatusEnum.Finished);
    });
  });

  // -- Decision 25 -------------------------------------------------------
  describe('D25 - Condition Monitor changes are logged without the maximum', () => {
    it('drops the fraction from the row-member damage line, keeping the running total', () => {
      const row = gmRow('Gangers', 7, 8, ['G 1']); // 10 boxes
      component.applyRowMemberDamage(row, row.members[0], 6, 'physical');

      const line = LogHandler.logbook.map(e => e.text).reverse().find(t => /took 6 Physical/.test(t))!;
      expect(line).toContain('(6)');
      expect(line).not.toContain('/');
      expect(line).not.toContain('10');
    });

    it('drops the fraction from the "already out of action" no-effect line', () => {
      const row = gmRow('Gangers', 7, 8, ['G 1']);
      component.applyRowMemberDamage(row, row.members[0], row.members[0].conditionMonitorBoxes, 'physical');

      const before = LogHandler.logbook.length;
      component.applyRowMemberDamage(row, row.members[0], 1, 'physical');

      const line = LogHandler.logbook.slice(before).map(e => e.text)
        .find(t => /hit had no effect/.test(t))!;
      expect(line).toBeTruthy();
      expect(line).not.toContain('/');
    });

    it('drops the fraction from the heal line, keeping the running total', () => {
      const row = gmRow('Gangers', 7, 8, ['G 1']);
      component.applyRowMemberDamage(row, row.members[0], 6, 'physical');

      component.healRowMember(row, row.members[0], 2);

      const line = LogHandler.logbook.map(e => e.text).reverse().find(t => /healed 2/.test(t))!;
      expect(line).toContain('(4)');
      expect(line).not.toContain('/');
    });
  });
});

describe('NPC group initiative - addendum D12 badges on the player view', () => {
  let player: PlayerViewComponent;
  let playerFixture: ComponentFixture<PlayerViewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlayerViewComponent],
      providers: appConfig.providers
    }).compileComponents();
    playerFixture = TestBed.createComponent(PlayerViewComponent);
    player = playerFixture.componentInstance;
    playerFixture.detectChanges();
  });

  it('renders a GROUP badge for a row and a GRUNT badge for a lone grunt', () => {
    player.connected = true;
    player.state = {
      round: 1,
      pass: 1,
      started: true,
      participants: [
        { id: 'r1', name: 'Gangers', order: 1, active: false, playerControlled: false, isNpcRow: true },
        { id: 'g1', name: 'Lone Ganger', order: 2, active: false, playerControlled: false, isDetachedGrunt: true },
        { id: 'p1', name: 'Wombat', order: 3, active: false, playerControlled: false }
      ]
    } as SharedCombatState;

    playerFixture.detectChanges();

    const rowBadges = playerFixture.nativeElement.querySelectorAll('[data-testid="player-badge-npc-row"]');
    const gruntBadges = playerFixture.nativeElement.querySelectorAll('[data-testid="player-badge-grunt"]');
    expect(rowBadges.length).toBe(1);
    expect(gruntBadges.length).toBe(1);
    // Wombat, an ordinary participant, carries neither.
    expect(playerFixture.nativeElement.textContent).toContain('Wombat');
  });
});
