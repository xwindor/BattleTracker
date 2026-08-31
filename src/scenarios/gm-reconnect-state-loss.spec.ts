// Promoted scenarios and per-criterion tests for
// `briefs/gm-reconnect-state-loss-spec.md` ("GM rejoin loses condition
// monitors, damage, downed combatants and turn state").
//
// This is transport/rehydration plumbing, not a new SR5 rule: every field
// carried here is state the tracker already computes and already displays
// (spec, "Not rules-dependent"), so nothing here cites a rulebook page except
// where it reuses assertions already covered by rules-cited specs elsewhere
// (`npc-row.spec.ts`, `running-initiative-score.spec.ts`).
//
// Scenario numbering (S1-S6) and acceptance criteria (AC 1-22, AC 10 dropped
// per Decision D5) are the spec's own.

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BattleTrackerComponent } from 'app/battle-tracker/battle-tracker.component';
import { appConfig } from 'app/app.config';
import { CombatManager, StatusEnum, IParticipant } from 'Combat';
import { Participant } from 'Combat/Participants/Participant';
import { AstralParticipant } from 'Magic';
import { interruptTable } from 'InterruptTable';
import {
  DetachedGruntParticipant, GruntMember, NpcRowParticipant,
  hasGruntConditionMonitor, isNpcRow
} from 'Grunts';
import {
  SessionSyncService, SharedCombatState, SharedGmState
} from 'app/services/session-sync.service';
import {
  authorizeRoomPacket, ROOM_SCOPED_EVENTS
} from '../../server/room-guards';
import { createSessionStore, PersistedSession } from '../../server/session-store';
import {
  isGmState, validateGmStatePayload, GM_STATE_MAX_PAYLOAD_BYTES
} from '../../server/gm-state-channel';

const FULL_DEFENSE = interruptTable.find(a => a.key === 'fullDefense')!;

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

describe('GM reconnect state loss', () => {
  let component: BattleTrackerComponent;
  let fixture: ComponentFixture<BattleTrackerComponent>;
  let sync: SessionSyncService;
  let states: SharedCombatState[];
  let gmStates: SharedGmState[];

  beforeEach(async () => {
    // Reset before construction (test hygiene, matching persistent-rooms.spec.ts):
    // the constructor seeds one placeholder participant, and a stale one left
    // behind by an earlier spec must not masquerade as it.
    resetCombat();
    await TestBed.configureTestingModule({
      imports: [BattleTrackerComponent],
      providers: appConfig.providers
    }).compileComponents();

    fixture = TestBed.createComponent(BattleTrackerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    // The constructor seeds one placeholder participant (test hygiene, same
    // as persistent-rooms.spec.ts) - every test below builds its own exact
    // roster, so clear it rather than special-casing it into every fixture.
    resetCombat();

    sync = TestBed.inject(SessionSyncService);
    states = [];
    gmStates = [];
    spyOn(sync, 'broadcastState').and.callFake((s: SharedCombatState) => { states.push(s); });
    spyOn(sync, 'broadcastGmState').and.callFake((g: SharedGmState) => { gmStates.push(g); });
    spyOn(sync, 'appendLog');
    spyOn(sync, 'connect');
  });

  afterEach(() => resetCombat());

  /** Capture the latest player-facing + GM-only pair, as of the last push. */
  function lastBroadcast(): { state: SharedCombatState; gmState: SharedGmState } {
    return { state: states[states.length - 1], gmState: gmStates[gmStates.length - 1] };
  }

  // ── S1 - Ordinary case: mid-fight browser refresh ───────────────────────
  describe('S1 - ordinary case: mid-fight browser refresh', () => {
    it('restores damage, Condition Monitor sizes, Finished status and both Scores exactly (AC 1, 6, 8)', () => {
      CombatManager.combatTurn = 1;
      CombatManager.initiativePass = 2;
      CombatManager.started = true;
      CombatManager.passEnded = false;

      const sam = new Participant();
      sam.name = 'Street Sam';
      sam.physicalHealth = 11;
      sam.stunHealth = 10;
      sam.baseIni = 9;
      CombatManager.participants.insert(sam);
      sam.diceIni = 4;
      sam.physicalDamage = 4;
      sam.stunDamage = 5;
      sam.status = StatusEnum.Finished;

      const ganger = new Participant();
      ganger.name = 'Ganger';
      ganger.baseIni = 6;
      CombatManager.participants.insert(ganger);
      ganger.diceIni = 2;
      ganger.physicalDamage = 3;

      const samScoreBefore = sam.getCurrentInitiative();
      const gangerScoreBefore = ganger.getCurrentInitiative();

      component.shareRoomCode = 'ABC123';
      component['syncSharedState']();
      const { state, gmState } = lastBroadcast();

      resetCombat();
      component['restoreFromSharedState'](state, gmState);

      const restoredSam = CombatManager.participants.items.find(p => p.name === 'Street Sam')!;
      const restoredGanger = CombatManager.participants.items.find(p => p.name === 'Ganger')!;

      expect(restoredSam.physicalDamage).toBe(4);
      expect(restoredSam.stunDamage).toBe(5);
      expect(restoredSam.physicalHealth).toBe(11);
      expect(restoredSam.stunHealth).toBe(10);
      expect(restoredSam.status).toBe(StatusEnum.Finished);

      CombatManager.getNextActors();
      expect(CombatManager.currentActors.contains(restoredSam)).toBeFalse();

      expect(restoredSam.getCurrentInitiative()).toBe(samScoreBefore);
      expect(restoredGanger.getCurrentInitiative()).toBe(gangerScoreBefore);

      // Scenario-literal: the new-format warning must never contain the word
      // "damage" (it never claims anything was lost - see buildRestoreWarning).
      expect(component.restoreWarning).not.toContain('damage');
    });
  });

  // ── S2 - Edge case: a wiped-out NPC group, and an all-down table ────────
  describe('S2 - a wiped-out NPC group, and an all-down table', () => {
    it('restores a fully wiped-out row, its members, and lets it be healed back up (AC 3, 4, 5)', () => {
      const row = new NpcRowParticipant();
      row.name = 'Gangers';
      const g1 = new GruntMember('G1', 3, 3);   // 10-box track
      const g2 = new GruntMember('G2', 3, 3);   // 10-box track
      row.addMember(g1);
      row.addMember(g2);
      row.baseIni = 8;
      CombatManager.participants.insert(row);
      row.diceIni = 5;

      // G1: a single hit exactly filling the track, DV > Body -> dead.
      row.applyDamageToMember(g1, g1.conditionMonitorBoxes, 'physical');
      // G2: a single stun hit exactly filling the track -> alive regardless of DV.
      row.applyDamageToMember(g2, g2.conditionMonitorBoxes, 'stun');
      expect(g1.finalState).toBe('dead');
      expect(g2.finalState).toBe('alive');

      expect(CombatManager.flagSpentNpcRows()).toEqual([row]);
      expect(row.spentFlagged).toBeTrue();
      expect(row.ooc).toBeTrue();

      component.shareRoomCode = 'ABC123';
      component['syncSharedState']();

      // The player-facing filter still withholds a wiped-out row entirely.
      expect(component['getSharedParticipants']()).toEqual([]);
      const gmState = component['buildGmState']();
      expect(gmState.withheldParticipants.length).toBe(1);
      expect(gmState.withheldParticipants[0].name).toBe('Gangers');

      const { state } = lastBroadcast();
      resetCombat();
      component['restoreFromSharedState'](state, gmState);

      const restored = CombatManager.participants.items.find(p => p.name === 'Gangers');
      expect(restored).toBeTruthy();
      expect(isNpcRow(restored!)).toBeTrue();
      const restoredRow = restored as NpcRowParticipant;
      expect(restoredRow.members.map(m => m.name)).toEqual(['G1', 'G2']);
      expect(restoredRow.members.every(m => m.outOfAction)).toBeTrue();
      expect(restoredRow.members[0].finalState).toBe('dead');
      expect(restoredRow.members[1].finalState).toBe('alive');
      expect(restoredRow.spentFlagged).toBeTrue();
      expect(restoredRow.ooc).toBeTrue();
      // Not re-announced: flagSpentNpcRows() finds nothing NEW to flag.
      expect(CombatManager.flagSpentNpcRows()).toEqual([]);

      component.healRowMember(restoredRow, restoredRow.members[1], 4);
      expect(restoredRow.ooc).toBeFalse();
      expect(restoredRow.spentFlagged).toBeFalse();
      CombatManager.getNextActors();
      expect(CombatManager.currentActors.contains(restoredRow)).toBeTrue();
    });

    it('an encounter where every participant is out of action rejoins in full (AC 5)', () => {
      const drone = new Participant();
      drone.name = 'Drone';
      drone.physicalHealth = 8;
      CombatManager.participants.insert(drone);
      drone.physicalDamage = 8; // OOC, non-claimable

      component.shareRoomCode = 'ABC123';
      component['syncSharedState']();
      const { state, gmState } = lastBroadcast();

      // The player-facing snapshot alone looks empty...
      expect(state.participants).toEqual([]);
      // ...but the merged roster (spec "Restore merges before it rebuilds")
      // still has real content to restore from.
      expect(gmState.withheldParticipants.length).toBe(1);

      resetCombat();
      component['restoreFromSharedState'](state, gmState);

      expect(CombatManager.participants.items.length).toBe(1);
      expect(CombatManager.participants.items[0].name).toBe('Drone');
      expect(CombatManager.participants.items[0].ooc).toBeTrue();
      expect(CombatManager.participants.items[0].physicalDamage).toBe(8);
    });

    it('D10: btnJoinShareSession_Click restores an all-down encounter through the real pull path, never reaching abandonJoinAndRestore (AC 5)', async () => {
      // D10 (review round 2026-08-19): the "all down" test above drives
      // restoreFromSharedState() directly, so it never exercises AC 5's
      // actual claim - that the button handler's own `replaced`/
      // `snapshotHasEncounter` widening keeps `abandonJoinAndRestore` from
      // firing at all for a new-format all-down snapshot. This drives the
      // real button handler end to end instead.
      component.shareRoomCode = ''; // this tab holds no live encounter -> pull path
      component.shareJoinCode = 'ABC123';
      spyOn(component['confirmationDialog'], 'confirm').and.resolveTo(true);
      const abandonSpy = spyOn<never>(component as never, 'abandonJoinAndRestore' as never)
        .and.resolveTo(undefined as never);
      spyOn(sync, 'joinAsGm').and.resolveTo({
        state: { round: 1, pass: 1, participants: [] },
        log: [],
        gmState: {
          version: 1,
          withheldParticipants: [{
            id: 'p-drone', name: 'Drone', order: 1, active: false, initiativeScore: 5,
            playerControlled: false, initiativeDice: 1, pendingRoll: false, ooc: true
          }],
          participants: [{
            id: 'p-drone', rosterIndex: 0,
            physicalHealth: 8, stunHealth: 8, overflowHealth: 0,
            physicalDamage: 8, stunDamage: 0, painTolerance: 0, hasPainEditor: false,
            baseIni: 5, currentInitiativeScore: 5, appliedInitiativeAttribute: 5,
            status: 0, edge: false, actionHistory: [], ooc: true, tieBreaker: 0.1
          }]
        }
      });

      await component.btnJoinShareSession_Click();

      expect(abandonSpy).not.toHaveBeenCalled();
      expect(component.shareRoomCode).toBe('ABC123');
      expect(CombatManager.participants.items.length).toBe(1);
      expect(CombatManager.participants.items[0].name).toBe('Drone');
      expect(CombatManager.participants.items[0].ooc).toBeTrue();
      expect(CombatManager.participants.items[0].physicalDamage).toBe(8);
    });
  });

  // ── S4 - Live at the table: GM's laptop dies mid-combat ─────────────────
  describe('S4 - GM\'s laptop dies mid-combat, five players waiting', () => {
    it('restores every combatant type in one pass, with none of the new GM-only damage fields on the player-facing wire (AC 2, 7, 9, 13, 14)', () => {
      CombatManager.combatTurn = 2;
      CombatManager.initiativePass = 3;
      CombatManager.started = true;
      CombatManager.passEnded = false;

      const wraith = new Participant();
      wraith.name = 'Wraith';
      wraith.baseIni = 9;
      CombatManager.participants.insert(wraith);
      wraith.diceIni = 5;
      wraith.physicalDamage = 9;
      wraith.stunDamage = 2;
      wraith.status = StatusEnum.Active;
      CombatManager.currentActors.insert(wraith);
      wraith.doAction(FULL_DEFENSE);
      component['participantClaimable'].set(wraith, true);
      component['participantOwners'].set(wraith, 'pl-1');

      const rigger = new Participant();
      rigger.name = 'Rigger';
      rigger.baseIni = 7;
      CombatManager.participants.insert(rigger);
      rigger.diceIni = 2;
      rigger.status = StatusEnum.Delaying;
      rigger.edge = true;
      component['participantClaimable'].set(rigger, true);
      component['participantOwners'].set(rigger, 'pl-2');

      const loneGanger = new DetachedGruntParticipant();
      loneGanger.name = 'Lone Ganger';
      loneGanger.setGruntAttributes(5, 3); // 8 + ceil(5/2) = 11-box track
      CombatManager.participants.insert(loneGanger);
      loneGanger.baseIni = 6;
      loneGanger.diceIni = 2;
      loneGanger.applyDamage(6, 'physical');
      loneGanger.applyDamage(4, 'physical'); // combinedDamage 10, lastDamageValue 4, still standing

      const secGuards = new NpcRowParticipant();
      secGuards.name = 'Sec Guards';
      const s1 = new GruntMember('S1', 4, 3);
      const s2 = new GruntMember('S2', 4, 3);
      const s3 = new GruntMember('S3', 4, 3);
      const s4 = new GruntMember('S4', 4, 3);
      [s1, s2, s3, s4].forEach(m => secGuards.addMember(m));
      secGuards.baseIni = 7;
      CombatManager.participants.insert(secGuards);
      secGuards.diceIni = 3;
      secGuards.applyDamageToMember(s1, s1.conditionMonitorBoxes, 'physical');
      secGuards.applyDamageToMember(s2, s2.conditionMonitorBoxes, 'stun');
      secGuards.rowWoundModifier = 3; // pinned to the exact scenario value

      const drone = new Participant();
      drone.name = 'Drone';
      drone.baseIni = 5;
      CombatManager.participants.insert(drone);
      drone.diceIni = 1;
      drone.physicalHealth = 10;
      drone.physicalDamage = 10; // OOC, non-claimable -> withheld from players

      component.shareRoomCode = 'ABC123';
      component['syncSharedState']();
      const { state, gmState } = lastBroadcast();

      // AC 13/14 - the single worst outcome. Structural guard on the
      // player-facing payload only, before it is ever mutated by a restore.
      //
      // D6 (review round 2026-08-19): this only proves the NEW GM-only
      // fields this brief added (`SharedGmParticipantState.physicalDamage`/
      // `stunDamage`) never reach the player-facing payload - it does NOT
      // prove no damage information reaches players at all. `secGuards`
      // above has two members down, and its `rowMembers[].damage` entries
      // (a pre-existing field, unrelated to this brief) still carry each
      // NPC's filled-box count on `state.participants` for any row that
      // is not entirely wiped out - a known, pre-existing exposure
      // (`docs/FEATURE-BACKLOG.md`) this test deliberately does not assert
      // against, because this brief did not change it.
      const stateJson = JSON.stringify(state);
      expect(stateJson).not.toContain('physicalDamage');
      expect(stateJson).not.toContain('stunDamage');
      expect(stateJson).not.toContain('gmState');
      expect(Object.keys(state).sort()).toEqual(
        ['currentInitiative', 'oocOwnership', 'oocParticipantCount', 'participants', 'passEnded', 'pass', 'round', 'started'].sort()
      );
      // Drone (OOC, non-claimable) never appears on the player-facing wire at all.
      expect(state.participants.some(p => p.name === 'Drone')).toBeFalse();
      expect(state.participants.length).toBe(4); // Wraith, Rigger, Lone Ganger, Sec Guards

      resetCombat();
      component['restoreFromSharedState'](state, gmState);

      expect(CombatManager.participants.items.length).toBe(5);
      const byName = (n: string) => CombatManager.participants.items.find(p => p.name === n)!;

      const restoredWraith = byName('Wraith');
      expect(restoredWraith.isInFullDefense()).toBeTrue();
      expect(restoredWraith.canUseAction(FULL_DEFENSE)).toBeFalse();

      const restoredRigger = byName('Rigger');
      expect(restoredRigger.status).toBe(StatusEnum.Delaying);
      expect(restoredRigger.edge).toBeTrue();

      const restoredGanger = byName('Lone Ganger') as DetachedGruntParticipant;
      expect(hasGruntConditionMonitor(restoredGanger)).toBeTrue();
      expect(restoredGanger.gruntBody).toBe(5);
      expect(restoredGanger.combinedDamage).toBe(10);
      expect(restoredGanger.finalState).toBe('standing');

      const restoredRow = byName('Sec Guards') as NpcRowParticipant;
      expect(isNpcRow(restoredRow)).toBeTrue();
      expect(restoredRow.members.length).toBe(4);
      expect(restoredRow.members.filter(m => m.outOfAction).length).toBe(2);
      expect(restoredRow.rowWoundModifier).toBe(3);

      const restoredDrone = byName('Drone');
      expect(restoredDrone.ooc).toBeTrue();
      expect(restoredDrone.physicalDamage).toBe(10);
    });
  });

  // ── S5 - Legacy snapshot: a room saved before this change ───────────────
  describe('S5 - a room saved before this change', () => {
    it('restores byte-identically to the pre-change build, with the legacy warning text (AC 17)', () => {
      const legacyState: SharedCombatState = {
        round: 2, pass: 2, started: true, passEnded: false, currentInitiative: 9,
        participants: [{
          id: 'p-1', name: 'Ganger', order: 1, active: false, initiativeScore: 9,
          playerControlled: false, initiativeDice: 1, pendingRoll: false,
          rolledInitiativeTotal: 3, reaction: 3, intuition: 4
        }]
      };

      expect(() => component['restoreFromSharedState'](legacyState, null)).not.toThrow();

      expect(component.restoreWarning).toContain('damage');
      expect(component.restoreWarning).toContain('out of action');
      expect(component.restoreWarning).toContain('committed interrupt actions');
      expect(component.restoreWarning).not.toContain('undo');

      const restored = CombatManager.participants.items[0];
      expect(restored.name).toBe('Ganger');
      expect(restored.getCurrentInitiative()).toBe(9);
    });
  });

  // ── S6 - Deploy skew: new client, old server ─────────────────────────────
  describe('S6 - deploy skew: new client, old server', () => {
    // D3 (review round 2026-08-19): the original version of both tests below
    // stubbed `sync.joinAsGm`/`sync.broadcastGmState` outright and asserted on
    // the stub - the real `gmState: res.gmState ?? null` normalisation inside
    // `joinAsGm()`, and the real `this.socket?.emit(...)` inside
    // `broadcastGmState()`, never ran. Rewritten to drive the REAL methods
    // against a stubbed *socket* instead, matching how the AC 15/16 tests
    // below drive the real `room-guards`/`session-store` modules.

    /** Minimal Socket.IO-client stand-in: only what `emitWithAck`/`broadcastGmState` touch. */
    function fakeSocket(onAck?: (event: string, ack: (res: unknown) => void) => void) {
      return {
        connected: true,
        emit: (event: string, a?: unknown, b?: unknown) => {
          const ack = typeof a === 'function' ? a : b;
          if (typeof ack === 'function' && onAck) {
            onAck(event, ack as (res: unknown) => void);
          }
        },
        on: () => { /* not reached: ensureConnected() short-circuits on socket.connected */ },
        off: () => { /* no-op */ },
        // The fixture's own teardown calls component.ngOnDestroy() ->
        // sessionSync.disconnect() -> this.socket?.disconnect() - without
        // this the afterEach itself throws, independent of the test body.
        disconnect: () => { /* no-op */ }
      };
    }

    it('gmState resolves to null through the REAL joinAsGm() when the ack omits it entirely, and S5\'s behaviour applies (AC 17, 18)', async () => {
      // An old server's `gm:join-session` ack has no `gmState` key at all -
      // exactly what `joinAsGm()`'s own `gmState?: SharedGmState | null` type
      // documents as the deploy-skew case.
      (sync as unknown as { socket: unknown }).socket = fakeSocket((event, ack) => {
        if (event === 'gm:join-session') {
          ack({
            ok: true,
            state: {
              round: 1, pass: 1, participants: [{
                id: 'p-1', name: 'Ganger', order: 1, active: false, initiativeScore: 6,
                playerControlled: false, initiativeDice: 1, pendingRoll: false
              }]
            },
            log: []
          });
        }
      });

      const { state, gmState } = await sync.joinAsGm('ABC123');
      expect(gmState).toBeNull();

      component['restoreFromSharedState'](state, gmState ?? null);

      expect(component.restoreWarning).toContain('damage');
      expect(component.restoreWarning).toContain('out of action');
      expect(component.restoreWarning).toContain('committed interrupt actions');
      expect(component.restoreWarning).not.toContain('undo');
    });

    it('the REAL broadcastGmState() still emits the event over the socket (an old server drops it) without throwing', () => {
      (sync.broadcastGmState as jasmine.Spy).and.callThrough();
      const emittedEvents: string[] = [];
      (sync as unknown as { socket: unknown }).socket = {
        connected: true,
        emit: (event: string) => { emittedEvents.push(event); },
        on: () => { /* no-op */ },
        off: () => { /* no-op */ },
        disconnect: () => { /* no-op */ } // see fakeSocket()'s doc comment above
      };
      sync.currentRoom = 'ABC123';
      component.shareRoomCode = 'ABC123';

      expect(() => component['syncSharedState']()).not.toThrow();

      expect(emittedEvents).toContain('session:update-gm-state');
    });
  });

  // ── Acceptance criteria not fully covered by a named scenario ───────────
  describe('Acceptance criteria', () => {
    it('AC 7: the coin-toss tie-breaker round-trips rather than being re-rolled', () => {
      const p = new Participant();
      p.name = 'Tied';
      CombatManager.participants.insert(p);
      const originalTieBreaker = component['getParticipantTieBreaker'](p);
      p.diceIni = 3;

      component.shareRoomCode = 'ABC123';
      component['syncSharedState']();
      const { state, gmState } = lastBroadcast();

      resetCombat();
      component['restoreFromSharedState'](state, gmState);

      const restored = CombatManager.participants.items[0];
      expect(component['getParticipantTieBreaker'](restored)).toBe(originalTieBreaker);
    });

    it('AC 7 / D2: Full Defense identity gate is reached (not short-circuited on the score check) and refuses a repeat purchase', () => {
      // D2 (review round 2026-08-19): `canUseAction()` checks
      // `Math.abs(action.iniMod) > getCurrentInitiative()` FIRST and only
      // falls through to the object-identity persist check
      // (`this._actionHistory.includes(action)`) when that score check is
      // false. The pre-fix version of this test (S4) always left Wraith's
      // post-Full-Defense Score below 10, so `Math.abs(-10) > score` was true
      // and canUseAction() returned false without ever reaching the identity
      // branch - a resolveRestoredAction() that returned a fresh object
      // literal instead of the shared interruptTable reference could not have
      // been caught. Here the raw running Score comfortably clears the cost
      // even after it, forcing the identity branch to run.
      CombatManager.started = true;
      CombatManager.passEnded = false;
      const wraith = new Participant();
      wraith.name = 'Wraith';
      wraith.baseIni = 20;
      CombatManager.participants.insert(wraith);
      wraith.diceIni = 5; // raw running Score 25
      wraith.status = StatusEnum.Active;
      CombatManager.currentActors.insert(wraith);
      wraith.doAction(FULL_DEFENSE); // effective initiative 25 - 10 = 15

      // Sanity: the score check alone must NOT already refuse this, or the
      // test below would not be exercising the identity branch at all.
      expect(Math.abs(FULL_DEFENSE.iniMod)).toBeLessThanOrEqual(wraith.getCurrentInitiative());

      component.shareRoomCode = 'ABC123';
      component['syncSharedState']();
      const { state, gmState } = lastBroadcast();

      resetCombat();
      component['restoreFromSharedState'](state, gmState);

      const restored = CombatManager.participants.items[0];
      expect(Math.abs(FULL_DEFENSE.iniMod)).toBeLessThanOrEqual(restored.getCurrentInitiative());
      expect(restored.canUseAction(FULL_DEFENSE)).toBeFalse();
    });

    it('AC 8 (D13 strengthened): the derived order after sort() is identical to the pre-crash order, with a wounded participant and a withheld one', () => {
      // D13 (review round 2026-08-19): the original version of this test had
      // no damage anywhere, so a rehydration-order defect (pinning the Score
      // before, instead of after, the damage/attribute setters that each move
      // it - see restoreFromSharedState's step 12 comment) would move nothing
      // and this test would still pass. `p2` below carries real damage so a
      // pin-order regression actually shifts its restored Score. The withheld
      // `drone` exercises the merge reconciliation this same acceptance
      // criterion depends on (review defect D1) inside the sort()-based path.
      CombatManager.started = true;
      CombatManager.passEnded = false;
      const p1 = new Participant();
      p1.name = 'First';
      p1.baseIni = 10;
      CombatManager.participants.insert(p1);
      p1.diceIni = 5;
      const p2 = new Participant();
      p2.name = 'Second';
      p2.physicalHealth = 12;
      p2.baseIni = 8;
      CombatManager.participants.insert(p2);
      p2.diceIni = 3;
      p2.physicalDamage = 6; // wounded - shifts the running Score via wound modifier
      const drone = new Participant();
      drone.name = 'Drone';
      drone.physicalHealth = 8;
      CombatManager.participants.insert(drone);
      drone.physicalDamage = 8; // OOC, non-claimable -> withheld from the player-facing wire
      const p3 = new Participant();
      p3.name = 'Third';
      p3.baseIni = 6;
      CombatManager.participants.insert(p3);
      p3.diceIni = 1;

      component.shareRoomCode = 'ABC123';
      component.sort();
      const preOrder = CombatManager.participants.items.map(p => p.name);
      const preScores = new Map(CombatManager.participants.items.map(p => [ p.name, p.getCurrentInitiative() ]));
      const { state, gmState } = lastBroadcast();
      expect(gmState.withheldParticipants.length).toBe(1); // sanity: Drone really is withheld

      resetCombat();
      component['restoreFromSharedState'](state, gmState);
      component.sort();

      expect(CombatManager.participants.items.map(p => p.name)).toEqual(preOrder);
      for (const p of CombatManager.participants.items) {
        expect(p.getCurrentInitiative()).withContext(p.name).toBe(preScores.get(p.name)!);
      }
    });

    it('D1: a withheld participant FIRST in the roster restores into its exact pre-crash slot, with unique sortOrder values', () => {
      // Repro from review defect D1: `getSharedParticipants()` numbers `order`
      // by post-filter index; `buildGmState()` numbered a withheld entry's
      // `order` by full-roster index (a different scale). Sorting both lists
      // together by `order` directly collided two participants onto the same
      // `sortOrder`. Combat NOT started, so sort() takes the sortBySortOrder()
      // path this defect actually lived on (the score-based path in the AC 8
      // test above never reads `sortOrder` at all).
      const drone = new Participant();
      drone.name = 'Drone';
      drone.physicalHealth = 8;
      CombatManager.participants.insert(drone);
      drone.physicalDamage = 8; // OOC, non-claimable -> withheld
      const wraith = new Participant();
      wraith.name = 'Wraith';
      CombatManager.participants.insert(wraith);
      const rigger = new Participant();
      rigger.name = 'Rigger';
      CombatManager.participants.insert(rigger);

      component.shareRoomCode = 'ABC123';
      component['syncSharedState']();
      const { state, gmState } = lastBroadcast();
      expect(gmState.withheldParticipants.length).toBe(1);

      resetCombat();
      component['restoreFromSharedState'](state, gmState);
      component.sort();

      expect(CombatManager.participants.items.map(p => p.name)).toEqual(['Drone', 'Wraith', 'Rigger']);
      const sortOrders = CombatManager.participants.items.map(p => p.sortOrder);
      expect(new Set(sortOrders).size).toBe(3);
    });

    it('D1: a withheld participant in the MIDDLE of the roster restores into its exact pre-crash slot, with unique sortOrder values', () => {
      const wraith = new Participant();
      wraith.name = 'Wraith';
      CombatManager.participants.insert(wraith);
      const drone = new Participant();
      drone.name = 'Drone';
      drone.physicalHealth = 8;
      CombatManager.participants.insert(drone);
      drone.physicalDamage = 8; // OOC, non-claimable -> withheld
      const rigger = new Participant();
      rigger.name = 'Rigger';
      CombatManager.participants.insert(rigger);

      component.shareRoomCode = 'ABC123';
      component['syncSharedState']();
      const { state, gmState } = lastBroadcast();
      expect(gmState.withheldParticipants.length).toBe(1);

      resetCombat();
      component['restoreFromSharedState'](state, gmState);
      component.sort();

      expect(CombatManager.participants.items.map(p => p.name)).toEqual(['Wraith', 'Drone', 'Rigger']);
      const sortOrders = CombatManager.participants.items.map(p => p.sortOrder);
      expect(new Set(sortOrders).size).toBe(3);
    });

    it('D8: a withheld participant LAST in the roster restores into its exact pre-crash slot, with unique sortOrder values', () => {
      // Review round 2026-08-19 ran this case by hand and it passed, but only
      // FIRST and MIDDLE had regression tests. LAST is the position S4 happens
      // to use, which is why the original D1 collision hid for a whole round.
      const wraith = new Participant();
      wraith.name = 'Wraith';
      CombatManager.participants.insert(wraith);
      const rigger = new Participant();
      rigger.name = 'Rigger';
      CombatManager.participants.insert(rigger);
      const drone = new Participant();
      drone.name = 'Drone';
      drone.physicalHealth = 8;
      CombatManager.participants.insert(drone);
      drone.physicalDamage = 8; // OOC, non-claimable -> withheld

      component.shareRoomCode = 'ABC123';
      component['syncSharedState']();
      const { state, gmState } = lastBroadcast();
      expect(gmState.withheldParticipants.length).toBe(1);

      resetCombat();
      component['restoreFromSharedState'](state, gmState);
      component.sort();

      expect(CombatManager.participants.items.map(p => p.name)).toEqual(['Wraith', 'Rigger', 'Drone']);
      expect(new Set(CombatManager.participants.items.map(p => p.sortOrder)).size).toBe(3);
    });

    it('D8: two withheld participants at roster positions 0 and 2 of 4 both restore into their exact slots', () => {
      const downA = new Participant();
      downA.name = 'DownA';
      downA.physicalHealth = 8;
      CombatManager.participants.insert(downA);
      downA.physicalDamage = 8;
      const live1 = new Participant();
      live1.name = 'Live1';
      CombatManager.participants.insert(live1);
      const downB = new Participant();
      downB.name = 'DownB';
      downB.physicalHealth = 8;
      CombatManager.participants.insert(downB);
      downB.physicalDamage = 8;
      const live2 = new Participant();
      live2.name = 'Live2';
      CombatManager.participants.insert(live2);

      component.shareRoomCode = 'ABC123';
      component['syncSharedState']();
      const { state, gmState } = lastBroadcast();
      expect(gmState.withheldParticipants.length).toBe(2);

      resetCombat();
      component['restoreFromSharedState'](state, gmState);
      component.sort();

      expect(CombatManager.participants.items.map(p => p.name)).toEqual(['DownA', 'Live1', 'DownB', 'Live2']);
      expect(new Set(CombatManager.participants.items.map(p => p.sortOrder)).size).toBe(4);
    });

    it('D5: a torn snapshot (newer state, older gmState missing an id) still restores unique sortOrder values', () => {
      // Review defect D5: the rosterIndex fallback used to be decided PER
      // ENTRY, so an id present in `state` but absent from `gmState` ranked on
      // the 1-based post-filter `order` while everyone else ranked on the
      // 0-based `rosterIndex` - reproducing the very collision rosterIndex was
      // introduced to prevent (observed sortOrders `[0, 1, 1]`). The ruler is
      // now a whole-restore decision: all rosterIndex, or all order, never a
      // mix.
      const downA = new Participant();
      downA.name = 'DownA';
      downA.physicalHealth = 8;
      CombatManager.participants.insert(downA);
      downA.physicalDamage = 8; // withheld
      const live1 = new Participant();
      live1.name = 'Live1';
      CombatManager.participants.insert(live1);

      component.shareRoomCode = 'ABC123';
      component['syncSharedState']();
      const staleGmState = lastBroadcast().gmState;

      // A third participant joins and only the player-facing half is captured,
      // so `newState` carries an id the older `gmState` has never seen.
      const live2 = new Participant();
      live2.name = 'Live2';
      CombatManager.participants.insert(live2);
      component['syncSharedState']();
      const newState = lastBroadcast().state;

      resetCombat();
      component['restoreFromSharedState'](newState, staleGmState);
      component.sort();

      const sortOrders = CombatManager.participants.items.map(p => p.sortOrder);
      expect(new Set(sortOrders).size).toBe(sortOrders.length);
    });

    it('D6: a corrupt gmState degrades safely instead of writing NaN into the Score or the damage tracks', () => {
      // Review defect D6: the GM branch assigned every number raw, and none of
      // Participant's setters coerce or clamp - so a truncated or corrupt room
      // file produced NaN Scores and a scrambled order rather than degrading.
      // The player-facing fields in this same method have always been coerced;
      // this asserts the GM-only fields now match that discipline.
      const sam = new Participant();
      sam.name = 'Street Sam';
      CombatManager.participants.insert(sam);

      component.shareRoomCode = 'ABC123';
      component['syncSharedState']();
      const { state, gmState } = lastBroadcast();

      const corrupt = JSON.parse(JSON.stringify(gmState)) as SharedGmState;
      const entry = corrupt.participants[0] as unknown as Record<string, unknown>;
      entry['currentInitiativeScore'] = 'not-a-number';
      entry['physicalDamage'] = NaN;
      entry['stunDamage'] = -5;
      entry['physicalHealth'] = undefined;
      entry['painTolerance'] = 'x';
      entry['tieBreaker'] = null;
      entry['status'] = 9999;

      resetCombat();
      expect(() => component['restoreFromSharedState'](state, corrupt)).not.toThrow();

      const restored = CombatManager.participants.items[0];
      expect(Number.isFinite(restored.getCurrentInitiative())).toBe(true);
      expect(Number.isFinite(restored.physicalDamage)).toBe(true);
      expect(restored.physicalDamage).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(restored.stunDamage)).toBe(true);
      expect(restored.stunDamage).toBeGreaterThanOrEqual(0);
      expect(restored.physicalHealth).toBeGreaterThan(0);
      // An unrecognised status must degrade to something CombatManager can
      // actually schedule, not sit in a state nothing selects.
      expect(StatusEnum[restored.status]).toBeDefined();
    });

    it('D9: painTolerance, hasPainEditor and a non-default overflowHealth round-trip without corrupting the pinned Score', () => {
      // These three are exactly the setters the rehydration contract's step
      // ordering exists for (restoreFromSharedState's step 12 comment): each
      // applies a signed delta to the running Score via syncInitiativeAttribute()
      // the moment it is written, so the Score must be pinned only after all
      // of them run.
      const p = new Participant();
      p.name = 'Tough';
      p.baseIni = 8;
      CombatManager.participants.insert(p);
      p.diceIni = 3;
      p.overflowHealth = 6; // non-default (constructor default is 4)
      p.painTolerance = 2;
      p.hasPainEditor = true;
      const scoreBefore = p.getCurrentInitiative();

      component.shareRoomCode = 'ABC123';
      component['syncSharedState']();
      const { state, gmState } = lastBroadcast();

      resetCombat();
      component['restoreFromSharedState'](state, gmState);

      const restored = CombatManager.participants.items[0];
      expect(restored.overflowHealth).toBe(6);
      expect(restored.painTolerance).toBe(2);
      expect(restored.hasPainEditor).toBeTrue();
      expect(restored.getCurrentInitiative()).toBe(scoreBefore);
    });

    it('AC 9: a standalone DetachedGruntParticipant comes back as one, not a plain Participant', () => {
      const grunt = new DetachedGruntParticipant();
      grunt.name = 'Loner';
      grunt.setGruntAttributes(4, 4); // 8 + ceil(4/2) = 10 boxes
      CombatManager.participants.insert(grunt);
      grunt.diceIni = 2;
      grunt.applyDamage(10, 'physical'); // fills the track, DV 10 > Body 4 -> dead

      component.shareRoomCode = 'ABC123';
      component['syncSharedState']();
      const { gmState } = lastBroadcast();
      // A wiped-out standalone grunt is withheld from the player-facing wire,
      // same as any other OOC, non-claimable participant.
      expect(gmState.withheldParticipants.length).toBe(1);
      const { state } = lastBroadcast();

      resetCombat();
      component['restoreFromSharedState'](state, gmState);

      const restored = CombatManager.participants.items[0] as DetachedGruntParticipant;
      expect(hasGruntConditionMonitor(restored)).toBeTrue();
      expect(restored.gruntBody).toBe(4);
      expect(restored.gruntWillpower).toBe(4);
      expect(restored.finalState).toBe('dead');
    });

    it('AC 11: a projecting astral participant restores baseIni = Intuition x2 verbatim, via the GM-only channel', () => {
      const mage = new AstralParticipant();
      mage.name = 'Hexer';
      mage.astralProjecting = true;
      mage.blocksPhysicalActions = true;
      CombatManager.participants.insert(mage);
      component['participantReactions'].set(mage, 4);
      component['participantIntuitions'].set(mage, 5);
      mage.baseIni = 10; // INT(5) x 2, as toggleAstralProjecting() would compute
      mage.diceIni = 2;

      component.shareRoomCode = 'ABC123';
      component['syncSharedState']();
      const { state, gmState } = lastBroadcast();

      resetCombat();
      component['restoreFromSharedState'](state, gmState);

      const restored = CombatManager.participants.items[0] as AstralParticipant;
      expect(restored.astralProjecting).toBeTrue();
      expect(restored.baseIni).toBe(10);
    });

    it('AC 11 fallback: a legacy snapshot with no gmState still derives astral baseIni correctly (defect 13 fix)', () => {
      const legacyState: SharedCombatState = {
        round: 1, pass: 1, participants: [{
          id: 'p-mage', name: 'Hexer', order: 1, active: false, initiativeScore: 10,
          playerControlled: false, initiativeDice: 2, pendingRoll: false, rolledInitiativeTotal: 6,
          reaction: 4, intuition: 5, isAstral: true, isAstralProjecting: true
        }]
      };

      component['restoreFromSharedState'](legacyState, null);

      const restored = CombatManager.participants.items[0] as AstralParticipant;
      // INT 5 x 2 = 10, NOT REA 4 + INT 5 = 9 (the pre-existing missing-branch defect).
      expect(restored.baseIni).toBe(10);
    });

    it('item 7 fix (fix round 3): a GM reconnect mid-projection carries projectionDiceGain, so Return to Body still subtracts the realized gain instead of stranding it', () => {
      CombatManager.started = true;
      // Set up exactly as `toggleAstralProjecting()` would have left it: a
      // mage who projected with no other Initiative Dice bonus realized the
      // full delta of 2 (RULINGS 2026-08-30, ASTRAL_PROJECTION_DICE_DELTA).
      const mage = new AstralParticipant();
      mage.name = 'Hexer';
      mage.astralProjecting = true;
      mage.blocksPhysicalActions = true;
      mage.baseIni = 10; // INT(5) x 2
      mage.setDicesWithoutRoll(1); // physical baseline before projecting
      CombatManager.participants.insert(mage);
      component['participantReactions'].set(mage, 4);
      component['participantIntuitions'].set(mage, 5);
      mage.diceIni = 4; // pretend Initiative Test already rolled this turn
      mage.setDicesWithoutRoll(3); // 3D6 total while projecting (p. 314)
      mage.projectionDiceGain = 2;
      const scoreBeforeReconnect = mage.getCurrentInitiative();

      component.shareRoomCode = 'ABC123';
      component['syncSharedState']();
      const { state, gmState } = lastBroadcast();

      resetCombat();
      component['restoreFromSharedState'](state, gmState);

      const restored = CombatManager.participants.items[0] as AstralParticipant;
      expect(restored.astralProjecting).toBeTrue();
      // The defect: without carrying this, `projectionDiceGain` silently
      // reset to 0 across the reconnect.
      expect(restored.projectionDiceGain).toBe(2);
      expect(restored.getCurrentInitiative()).toBe(scoreBeforeReconnect);

      // Return to Body, post-reconnect: must request `-2` (the realized
      // outbound gain), not `-0`, or the mage keeps the extra die and the
      // inflated Score for the rest of the fight.
      component['participantReactions'].set(restored, 4);
      component['participantIntuitions'].set(restored, 5);
      const scoreBeforeReturn = restored.getCurrentInitiative();
      component.toggleAstralProjecting(restored);

      expect(restored.astralProjecting).toBeFalse();
      expect(restored.dices).toBe(1); // back to the 1D6 physical baseline
      expect(restored.projectionDiceGain).toBe(0);
      // baseIni half: INT x2 (10) -> REA+INT (9), a delta of -1. The dice
      // half rolls and subtracts the realized 2 gained dice. Score strictly
      // decreases by more than just the baseIni half - the stranded-dice
      // defect this closes left the dice half at 0.
      expect(restored.getCurrentInitiative()).toBeLessThan(scoreBeforeReturn - 1);
    });

    it('AC 12: each row member\'s hasActed round-trips (Open Decision 2 / D2)', () => {
      const row = new NpcRowParticipant();
      row.name = 'Gangers';
      const g1 = new GruntMember('G1', 3, 3);
      const g2 = new GruntMember('G2', 3, 3);
      row.addMember(g1);
      row.addMember(g2);
      row.baseIni = 8;
      CombatManager.participants.insert(row);
      row.diceIni = 4;
      g1.hasActed = true;

      component.shareRoomCode = 'ABC123';
      component['syncSharedState']();
      const { state, gmState } = lastBroadcast();

      resetCombat();
      component['restoreFromSharedState'](state, gmState);

      const restoredRow = CombatManager.participants.items[0] as NpcRowParticipant;
      expect(restoredRow.members[0].hasActed).toBeTrue();
      expect(restoredRow.members[1].hasActed).toBeFalse();
    });

    it('AC 13: SharedParticipantState and SharedCombatState gain no new top-level field, including nested rowMembers entries', () => {
      const p = new Participant();
      p.name = 'Plain';
      CombatManager.participants.insert(p);
      p.diceIni = 2;

      // D5 (review round 2026-08-19): a row, with `hasActed` set on one
      // member, so a leak of `hasActed` onto `rowMembers` (the pre-fix
      // defect - `rowMembers` is nested INSIDE a `SharedParticipantState`
      // entry) is reachable by this test at all. The original version of
      // this test allowlisted only top-level participant keys and never
      // looked inside `rowMembers`, so it could not have caught that leak.
      const row = new NpcRowParticipant();
      row.name = 'Gangers';
      const g1 = new GruntMember('G1', 3, 3);
      row.addMember(g1);
      row.baseIni = 6;
      CombatManager.participants.insert(row);
      row.diceIni = 1;
      g1.hasActed = true;

      component.shareRoomCode = 'ABC123';
      component['syncSharedState']();
      const { state } = lastBroadcast();

      expect(Object.keys(state).sort()).toEqual(
        ['currentInitiative', 'oocOwnership', 'oocParticipantCount', 'participants', 'passEnded', 'pass', 'round', 'started'].sort()
      );
      const knownParticipantFields = new Set([
        'id', 'name', 'order', 'active', 'initiativeScore', 'playerControlled', 'claimable',
        'ownerName', 'ooc', 'canAct', 'canDelay', 'canInterrupt', 'initiativeDice', 'pendingRoll',
        'rolledInitiativeTotal', 'edgeRating', 'reaction', 'intuition', 'isNpcRow', 'isDetachedGrunt',
        'rowMembers', 'rowWoundModifier', 'rowEverPopulated', 'isAstral', 'isAstralProjecting',
        'isMatrix', 'vrMode', 'overwatch', 'overwatchAlert', 'jackedIn', 'isVRCatatonic',
        'dataProcessing', 'attack', 'sleaze', 'firewall', 'deviceRating'
      ]);
      const knownRowMemberFields = new Set([
        'name', 'body', 'willpower', 'damage', 'lastDamageType', 'lastDamageValue'
      ]);
      let sawRowMembers = false;
      for (const entry of state.participants) {
        for (const key of Object.keys(entry)) {
          expect(knownParticipantFields.has(key)).withContext(key).toBeTrue();
        }
        for (const member of entry.rowMembers ?? []) {
          sawRowMembers = true;
          for (const key of Object.keys(member)) {
            expect(knownRowMemberFields.has(key)).withContext(key).toBeTrue();
          }
        }
      }
      // Sanity: the row really did put a rowMembers array on the wire, or
      // the descent above never ran and this test would be vacuous again.
      expect(sawRowMembers).toBeTrue();
    });

    it('AC 14: broadcastState and broadcastGmState are pushed as two separate calls with disjoint payloads', () => {
      const wounded = new Participant();
      wounded.name = 'Wounded';
      CombatManager.participants.insert(wounded);
      wounded.diceIni = 1;
      wounded.physicalDamage = 5;

      component.shareRoomCode = 'ABC123';
      component['syncSharedState']();
      const { state, gmState } = lastBroadcast();

      expect(JSON.stringify(state)).not.toContain('physicalDamage');
      expect(gmState.participants.some(g => g.physicalDamage === 5)).toBeTrue();
    });

    it('AC 19: a transport reconnect still pushes and never pulls, and now pushes gmState too', async () => {
      const p = new Participant();
      p.name = 'Live';
      CombatManager.participants.insert(p);
      p.diceIni = 3;
      component.shareRoomCode = 'ABC123';

      const restoreSpy = spyOn<never>(component as never, 'restoreFromSharedState' as never);
      const joinSpy = spyOn(sync, 'joinAsGm').and.resolveTo({
        state: { round: 99, pass: 99, participants: [] },
        log: []
      });

      await component['handleSessionReconnected']();

      expect(joinSpy).toHaveBeenCalledWith('ABC123');
      expect(restoreSpy).not.toHaveBeenCalled();
      expect(sync.broadcastGmState).toHaveBeenCalled();
      // The pushed state is this tab's own live encounter, not the stale one.
      expect(states[states.length - 1].round).not.toBe(99);
    });

    it('AC 21: a payload-too-large refusal for the GM channel surfaces to the GM, same as the state channel', () => {
      component.shareRoomCode = 'ABC123';
      component['handleSessionError']({ event: 'session:update-gm-state', reason: 'payload-too-large: gmState' });
      expect(component.shareError).toContain('payload-too-large');
    });
  });

  // ── AC 10 - explicitly out of scope ──────────────────────────────────────
  // Decision D5 (spec, "DECIDED by Xavier"): ICParticipant reconstruction is
  // OUT of scope. No isIC/icType/hostRating/linkedTargetId field exists on
  // SharedGmParticipantState, buildRestoredParticipant has no IC branch, and
  // acceptance criterion 10 is dropped. Nothing to test here by design; see
  // ARCHITECTURE.md §6's existing note, left in place.
});

// ── AC 14 / AC 21 - the real server-side validation for session:update-gm-state ──
//
// D4 (review round 2026-08-19): these two acceptance criteria had no test
// driving real server code at all - AC 14's client-side test (above) only
// proves the client never puts damage on the player-facing payload, not that
// the server-side channel is genuinely write-only/never-broadcast; AC 21's
// only test drove the client's error-banner rendering, never the server's
// actual refuse-and-clear decision. `server/gm-state-channel.js` extracts the
// handler's pure validation (the part of `session:update-gm-state` that does
// NOT need a live socket or the server's `sessions` Map) the same way
// `room-guards.js`/`session-store.js` already are, so it is importable and
// testable here directly, matching the AC 15/16 tests' own pattern below.
//
// What this does NOT cover, and why: the other two of AC 14's "three ways"
// (`player:join`'s ack contains no `gmState` key; no `io.to(room).emit`
// anywhere in `server.js` carries it) are properties of the *transport
// wiring* around `getOrCreateSession`/`sessions`/the Socket.IO `io` object,
// not of the validation decision - extracting them cleanly would mean either
// re-implementing that wiring in the test (testing a copy, not the real
// server.js code - the exact vacuous-test failure mode this review round is
// about) or booting a real Socket.IO server and client pair, which is out of
// scope for this fix round. Stated explicitly rather than faked.
describe('GM reconnect state loss - the real server-side gmState validation (AC 14, 21)', () => {
  it('isGmState refuses anything without an array `participants` field', () => {
    // `v && typeof v === "object" && ...` short-circuits on a falsy `v` by
    // returning `v` itself (`null`/`undefined`), not the literal `false` -
    // the same pattern `isSharedState` already uses in `server.js`. Falsy is
    // what the handler's `if (!isGmState(gmState))` branch actually needs.
    expect(isGmState(null)).toBeFalsy();
    expect(isGmState(undefined)).toBeFalsy();
    expect(isGmState({})).toBeFalse();
    expect(isGmState({ participants: 'not-an-array' })).toBeFalse();
    expect(isGmState({ participants: [] })).toBeTrue();
  });

  it('validateGmStatePayload accepts a well-shaped payload under the size cap', () => {
    const verdict = validateGmStatePayload({ version: 1, withheldParticipants: [], participants: [] });
    expect(verdict.ok).toBeTrue();
    expect(verdict.reason).toBeUndefined();
  });

  it('validateGmStatePayload refuses a malformed payload with invalid-payload: gmState (AC 14/21 server-side)', () => {
    const verdict = validateGmStatePayload({ notParticipants: [] });
    expect(verdict.ok).toBeFalse();
    expect(verdict.reason).toBe('invalid-payload: gmState');
  });

  it('validateGmStatePayload refuses an over-cap payload with payload-too-large: gmState (AC 21)', () => {
    const oversized = {
      version: 1, withheldParticipants: [],
      participants: [{ id: 'x'.repeat(200) }]
    };
    // Exercise the real 64 KB production cap via the exported constant,
    // rather than hard-coding 64 * 1024 a second time in the test.
    expect(GM_STATE_MAX_PAYLOAD_BYTES).toBe(64 * 1024);
    // Inject a tiny cap so the test does not have to build an actual 64 KB
    // string to prove the comparison itself is correct.
    const verdict = validateGmStatePayload(oversized, 50);
    expect(verdict.ok).toBeFalse();
    expect(verdict.reason).toBe('payload-too-large: gmState');
  });

  it('validateGmStatePayload honours the real 64 KB default cap end to end', () => {
    const huge = {
      version: 1, withheldParticipants: [],
      participants: Array.from({ length: 2000 }, (_, i) => ({ id: `p-${i}`, name: 'x'.repeat(64) }))
    };
    expect(JSON.stringify(huge).length).toBeGreaterThan(GM_STATE_MAX_PAYLOAD_BYTES);
    expect(validateGmStatePayload(huge).ok).toBeFalse();
    expect(validateGmStatePayload(huge).reason).toBe('payload-too-large: gmState');
  });
});

// ── AC 15 - the GM-only channel is refused for anyone but the room's own GM ──
describe('GM reconnect state loss - room-ownership rule for session:update-gm-state (AC 15)', () => {
  const OPTS = { isRoomCode: (v: unknown) => typeof v === 'string' && /^[A-Z0-9]{6}$/.test(v), roomExists: (room: string) => room === 'AAAAAA' || room === 'BBBBBB' };
  function gm(room?: string) { return { role: 'gm', room }; }
  function player(room?: string) { return { role: 'player', room }; }

  it('is registered as a GM-only room-scoped event', () => {
    expect(ROOM_SCOPED_EVENTS.get('session:update-gm-state')).toEqual({ roles: ['gm'] });
  });

  it('refuses a socket whose role is player', () => {
    const verdict = authorizeRoomPacket('session:update-gm-state', { room: 'AAAAAA' }, player('AAAAAA'), OPTS);
    expect(verdict.ok).toBeFalse();
  });

  it('refuses a socket with no role at all', () => {
    const verdict = authorizeRoomPacket('session:update-gm-state', { room: 'AAAAAA' }, {}, OPTS);
    expect(verdict.ok).toBeFalse();
  });

  it('refuses a GM socket whose own room differs from the packet\'s room', () => {
    const verdict = authorizeRoomPacket('session:update-gm-state', { room: 'AAAAAA' }, gm('BBBBBB'), OPTS);
    expect(verdict.ok).toBeFalse();
    expect(verdict.reason).toBe('room-mismatch');
  });

  it('allows the room\'s own GM', () => {
    expect(authorizeRoomPacket('session:update-gm-state', { room: 'AAAAAA' }, gm('AAAAAA'), OPTS).ok).toBeTrue();
  });
});

// ── AC 16 - gmState survives a persisted-room round trip ─────────────────────
describe('GM reconnect state loss - persistence across a process restart (AC 16)', () => {
  const DATA_DIR = '/var/data/rooms';

  /** Minimal in-memory stand-in for node:fs, matching persistent-rooms.spec.ts's fixture. */
  class FakeFs {
    readonly files = new Map<string, string>();
    readonly dirs = new Set<string>();
    existsSync(p: string) { return this.files.has(p) || this.dirs.has(p); }
    mkdirSync(p: string) { this.dirs.add(p); }
    readdirSync(dir: string) {
      const prefix = dir + '/';
      return Array.from(this.files.keys()).filter(f => f.startsWith(prefix)).map(f => f.slice(prefix.length));
    }
    readFileSync(p: string) {
      const contents = this.files.get(p);
      if (contents === undefined) { throw new Error('ENOENT: ' + p); }
      return contents;
    }
    writeFileSync(p: string, data: string) { this.files.set(p, String(data)); }
    renameSync(from: string, to: string) {
      const contents = this.files.get(from);
      if (contents === undefined) { throw new Error('ENOENT: ' + from); }
      this.files.delete(from);
      this.files.set(to, contents);
    }
    unlinkSync(p: string) { if (!this.files.delete(p)) { throw new Error('ENOENT: ' + p); } }
  }

  it('gmState survives a flushAll()/loadAll() round trip, deep-equal to what was pushed', () => {
    const fs = new FakeFs();
    const store = createSessionStore({ fs, dir: DATA_DIR, now: () => 1000 });

    const gmState: SharedGmState = {
      version: 1,
      withheldParticipants: [],
      participants: [{
        id: 'p-1', rosterIndex: 0, physicalHealth: 10, stunHealth: 10, overflowHealth: 4,
        physicalDamage: 6, stunDamage: 2, painTolerance: 0, hasPainEditor: false,
        baseIni: 8, currentInitiativeScore: 12, appliedInitiativeAttribute: 8,
        status: 0, edge: false, actionHistory: [{ key: 'fullDefense', iniMod: -10, persist: true }],
        ooc: false, tieBreaker: 0.42
      }]
    };
    const session: PersistedSession = {
      state: { round: 1, pass: 1, participants: [] },
      log: [],
      gmState
    };
    store.touch('ABC123', session);
    expect(store.flushAll()).toBe(1);

    const store2 = createSessionStore({ fs, dir: DATA_DIR, now: () => 2000 });
    const restored = store2.loadAll();
    expect(restored.sessions.get('ABC123')?.gmState).toEqual(gmState);
  });

  it('an absent gmState on disk (a room saved before this change) loads as null, not a crash', () => {
    const fs = new FakeFs();
    const store = createSessionStore({ fs, dir: DATA_DIR, now: () => 1000 });
    // No gmState key at all - the pre-change document shape.
    fs.mkdirSync(DATA_DIR);
    fs.writeFileSync(`${DATA_DIR}/OLDRM1.room.json`, JSON.stringify({
      version: 1, room: 'OLDRM1', lastActivity: 1000,
      state: { round: 1, pass: 1, participants: [] }, log: []
    }));

    const restored = store.loadAll();
    expect(restored.sessions.get('OLDRM1')?.gmState).toBeNull();
  });

  it('hasPersistableContent recognises a room whose only content is gmState', () => {
    const fs = new FakeFs();
    const store = createSessionStore({ fs, dir: DATA_DIR, now: () => 1000 });
    const session: PersistedSession = {
      state: null,
      log: [],
      gmState: { version: 1, withheldParticipants: [], participants: [] }
    };
    store.touch('ABC123', session);
    expect(store.flushAll()).toBe(1);
    expect(fs.files.has(`${DATA_DIR}/ABC123.room.json`)).toBeTrue();
  });
});
