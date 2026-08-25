// Promoted scenarios for `briefs/remove-undo-system-spec.md` ("Remove the
// undo/redo system").
//
// The undo/redo mechanism (`src/Common/UndoHandler.ts`, `src/Common/
// Undoable.ts`) has been deleted, and every call site that depended on it
// rewritten as a direct, behaviour-identical mutation. These scenarios pin
// the numbers and control-surfaces that removal must not disturb: the value
// transforms that used to live inside `this.Set(...)` calls (S1/S2), the
// correction paths that now stand in for Undo at the table (S3/S4), what
// mid-turn interrupt spend and a mis-tapped turn-ending Next Pass look like
// with no way back (S5/S6), the GM-only rejoin channel's cross-instance
// `GruntMember.fromSnapshot()` writes (S7 - the single highest-consequence
// spot in the change), and the three `forgetParticipant`/`forgetMapEntry`/
// `forgetSetEntry` side-map cleanups that used to be `DoAction` closures
// (S8).
//
// Scenario numbering (S1-S8) is the spec's own.

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BattleTrackerComponent } from 'app/battle-tracker/battle-tracker.component';
import { appConfig } from 'app/app.config';
import { CombatManager, StatusEnum } from 'Combat';
import { Participant } from 'Combat/Participants/Participant';
import {
  DetachedGruntParticipant, GruntMember, NpcRowParticipant,
  gruntConditionMonitorBoxes
} from 'Grunts';
import { interruptTable } from 'InterruptTable';
import {
  SessionSyncService, SharedCombatState, SharedGmState, SharedLogEntry
} from 'app/services/session-sync.service';
import { formatPassEndLogText, formatTurnEndLogText } from 'app/shared/log-formatter';

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

describe('Remove the undo/redo system', () => {

  // ── S1 — Ordinary: a damage edit is a plain write ───────────────────────

  describe('S1 - a damage edit is a plain write', () => {
    it('moves the Score by the wound-modifier delta and is correctable by re-editing the field', () => {
      const p = new Participant();
      p.name = 'Wombat';
      p.baseIni = 8; // seeds currentInitiativeScore at 8 (painTolerance 0, hasPainEditor false)
      expect(p.getCurrentInitiative()).toBe(8);

      p.physicalDamage = 3;

      expect(p.wm).toBe(1);
      expect(p.getCurrentInitiative()).toBe(7);
      expect(p.appliedInitiativeAttribute).toBe(7);

      // A mis-keyed hit is corrected by re-editing the field - there is no
      // undo control to reach for instead.
      p.physicalDamage = 0;

      expect(p.wm).toBe(0);
      expect(p.getCurrentInitiative()).toBe(8);
    });
  });

  // ── S2 — Edge case: every transform on a former `Set` call survives ─────

  describe('S2 - every value transform survives the direct-assignment rewrite', () => {
    it('still floors, clamps and coerces exactly as it did through Undoable.Set', () => {
      const row = new NpcRowParticipant();
      const m = new GruntMember('Ganger', 4, 3);

      row.rowWoundModifier = -5;
      expect(row.rowWoundModifier).toBe(0); // floored at 0

      row.rowWoundModifier = 2.9;
      expect(row.rowWoundModifier).toBe(2); // floored to a whole number

      m.body = -1;
      expect(m.body).toBe(0); // Math.max(0, Math.floor(val))

      m.body = 4.8;
      expect(m.body).toBe(4);

      m.hasActed = 1 as unknown as boolean;
      expect(m.hasActed).toBeFalse(); // val === true coercion

      row.spentFlagged = 'x' as unknown as boolean;
      expect(row.spentFlagged).toBeFalse(); // val === true coercion

      const g = new DetachedGruntParticipant();
      g.ooc = true;
      expect(g.manualOoc).toBeTrue(); // ooc setter writes _manualOoc, not _ooc
      expect(g['_ooc']).toBeFalse();

      const p = new Participant();
      p.setDicesWithoutRoll(9);
      expect(p.dices).toBe(5); // clampInitiativeDiceCount hard cap

      p.setDicesWithoutRoll(0);
      expect(p.dices).toBe(1); // clampInitiativeDiceCount floor
    });
  });

  // ── S3 — The correction path that used to be Undo ───────────────────────

  describe('S3 - a mis-keyed hit corrected by healing, with no Undo control anywhere', () => {
    let component: BattleTrackerComponent;
    let fixture: ComponentFixture<BattleTrackerComponent>;

    beforeEach(async () => {
      resetCombat();
      await TestBed.configureTestingModule({
        imports: [BattleTrackerComponent],
        providers: appConfig.providers
      }).compileComponents();
      fixture = TestBed.createComponent(BattleTrackerComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      resetCombat();
    });

    afterEach(() => resetCombat());

    it('DV6 then a DV3 correction lands exactly 1 below the pre-hit Score, and no undo/redo control renders', () => {
      const g = component.addGrunt('Ganger A', 4, 3);
      expect(g.physicalHealth).toBe(gruntConditionMonitorBoxes(4, 3)); // 8 + ceil(4/2) = 10
      expect(g.physicalDamage).toBe(0);
      CombatManager.started = true;
      const scoreBeforeHit = g.getCurrentInitiative();

      component.setGruntDamageValue(g, 6);
      component.hitGruntPhysical(g);

      expect(g.physicalDamage).toBe(6);
      expect(g.wm).toBe(2);
      expect(g.getCurrentInitiative()).toBe(scoreBeforeHit - 2);

      // The GM realises it should have been 3 - correction path is healing
      // (RULINGS.md 2026-08-07), not Undo.
      component.setGruntDamageValue(g, 3);
      component.healGrunt(g);

      expect(g.physicalDamage).toBe(3);
      expect(g.wm).toBe(1);
      expect(g.getCurrentInitiative()).toBe(scoreBeforeHit - 1);

      fixture.detectChanges();
      const rendered = fixture.nativeElement as HTMLElement;
      expect(rendered.querySelector('.fa-undo')).toBeNull();
      expect(rendered.querySelector('.fa-redo')).toBeNull();
      expect(rendered.querySelector('[title="Undo"]')).toBeNull();
      expect(rendered.querySelector('[title="Redo"]')).toBeNull();
    });
  });

  // ── S4 — Row member wipe-out and heal-back, with no undo available ──────

  describe('S4 - row member wipe-out and heal-back', () => {
    let component: BattleTrackerComponent;
    let fixture: ComponentFixture<BattleTrackerComponent>;

    beforeEach(async () => {
      resetCombat();
      await TestBed.configureTestingModule({
        imports: [BattleTrackerComponent],
        providers: appConfig.providers
      }).compileComponents();
      fixture = TestBed.createComponent(BattleTrackerComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      resetCombat();
    });

    afterEach(() => resetCombat());

    it('wipes the row out, flags it, pulls it from currentActors, then heal-back reverses all three', () => {
      const row = new NpcRowParticipant();
      row.name = 'Gangers';
      const g1 = new GruntMember('G1', 3, 3);
      const g2 = new GruntMember('G2', 3, 3);
      const g3 = new GruntMember('G3', 3, 3);
      [g1, g2, g3].forEach(m => row.addMember(m));
      expect(g1.conditionMonitorBoxes).toBe(10); // 8 + ceil(3/2)
      row.baseIni = 8;
      CombatManager.participants.insert(row);
      row.diceIni = 4;
      CombatManager.started = true;
      CombatManager.currentActors.insert(row); // the row is the current actor

      const rowWmBefore = row.rowWoundModifier;
      component.applyRowMemberDamage(row, g1, 10, 'physical');

      expect(g1.outOfAction).toBeTrue();
      expect(row.rowWoundModifier).toBeGreaterThan(rowWmBefore);
      expect(row.isWipedOut).toBeFalse();

      component.applyRowMemberDamage(row, g2, 10, 'physical');
      component.applyRowMemberDamage(row, g3, 10, 'physical');

      expect(row.isWipedOut).toBeTrue();
      expect(row.spentFlagged).toBeTrue();
      expect(row.ooc).toBeTrue();
      // flagSpentNpcRows() (run inside applyRowMemberDamage) pulled the row
      // out of currentActors once it could no longer act.
      expect(CombatManager.currentActors.contains(row)).toBeFalse();

      const rowWmBeforeHeal = row.rowWoundModifier;
      component.healRowMember(row, g3, 10);

      expect(g3.outOfAction).toBeFalse();
      expect(row.spentFlagged).toBeFalse();
      expect(row.ooc).toBeFalse();
      expect(row.rowWoundModifier).toBeLessThan(rowWmBeforeHeal);
      // The final-attack record is history and is not touched by the heal,
      // even though `finalState` itself now reads 'standing' again (it is
      // derived live from `outOfAction`, which the heal just cleared).
      expect(g3.finalState).toBe('standing');
      expect(g3.lastDamageType).toBe('physical');
      expect(g3.lastDamageValue).toBe(10);
    });
  });

  // ── S5 — Live at the table, mid-combat, players waiting ─────────────────

  describe('S5 - an Interrupt Action costs Initiative until the turn ends, with no clear control', () => {
    let component: BattleTrackerComponent;
    let fixture: ComponentFixture<BattleTrackerComponent>;
    let sync: SessionSyncService;
    let sent: SharedCombatState[];

    beforeEach(async () => {
      resetCombat();
      await TestBed.configureTestingModule({
        imports: [BattleTrackerComponent],
        providers: appConfig.providers
      }).compileComponents();
      fixture = TestBed.createComponent(BattleTrackerComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      resetCombat();

      sync = TestBed.inject(SessionSyncService);
      sent = [];
      spyOn(sync, 'broadcastState').and.callFake((s: SharedCombatState) => { sent.push(s); });
      spyOn(sync, 'broadcastGmState');
      spyOn(sync, 'appendLog');
      spyOn(sync, 'connect');
      component.shareRoomCode = 'ABC123';
      component.sharedLogEntries = [];
    });

    afterEach(() => resetCombat());

    it('Full Defense holds its cost until the Combat Turn ends and softReset() clears it', () => {
      const decker = new Participant();
      decker.name = 'Decker';
      decker.baseIni = 10;
      CombatManager.participants.insert(decker);
      decker.diceIni = 4; // Score 14
      CombatManager.combatTurn = 2;
      CombatManager.initiativePass = 2;
      CombatManager.started = true;
      CombatManager.currentActors.insert(decker);

      const scoreBefore = decker.getCurrentInitiative();
      component.btnAction_Click(decker, FULL_DEFENSE, decker.name);

      expect(decker.actionHistory).toContain(FULL_DEFENSE);
      expect(decker.getCurrentInitiative()).toBe(scoreBefore - 10);
      expect(decker.canUseAction(FULL_DEFENSE)).toBeFalse(); // persist gate, identity check

      const broadcast = sent[sent.length - 1];
      const sharedDecker = broadcast.participants.find(p => p.name === 'Decker')!;
      expect(sharedDecker.initiativeScore).toBe(decker.getCurrentInitiative());

      // No control anywhere removes it - `resetActions()` has no caller in
      // `src/` (see docs/FEATURE-BACKLOG.md, "Clear interrupts control").
      fixture.detectChanges();
      const rendered = fixture.nativeElement as HTMLElement;
      expect(rendered.querySelector('[data-testid="clear-interrupts-btn"]')).toBeNull();

      // The Combat Turn later ends -> softReset(): the cost is gone, but
      // only because the turn ended, not because anything was undone.
      CombatManager.endCombatTurn();

      expect(decker.actionHistory).toEqual([]);
      expect(decker.actionIniModifier).toBe(0);
    });
  });

  // ── S6 — Live at the table: a mis-tapped Next Pass that ends the turn ───

  describe('S6 - a mis-tapped Next Pass that ends the Combat Turn', () => {
    let component: BattleTrackerComponent;
    let fixture: ComponentFixture<BattleTrackerComponent>;
    let sync: SessionSyncService;
    let sent: SharedLogEntry[];

    beforeEach(async () => {
      resetCombat();
      await TestBed.configureTestingModule({
        imports: [BattleTrackerComponent],
        providers: appConfig.providers
      }).compileComponents();
      fixture = TestBed.createComponent(BattleTrackerComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      resetCombat();

      sync = TestBed.inject(SessionSyncService);
      sent = [];
      spyOn(sync, 'appendLog').and.callFake((e: SharedLogEntry) => { sent.push(e); });
      spyOn(sync, 'broadcastState');
      spyOn(sync, 'broadcastGmState');
      spyOn(sync, 'connect');
      component.shareRoomCode = 'ABC123';
      component.sharedLogEntries = [];
    });

    afterEach(() => resetCombat());

    function makeScored(name: string, baseIni: number, roll: number): Participant {
      const p = new Participant();
      p.name = name;
      p.baseIni = baseIni;
      p.setDicesWithoutRoll(1);
      CombatManager.participants.insert(p);
      p.diceIni = roll;
      return p;
    }

    it('drops every Score by 10 on the first tap, and ends the turn with softReset() on the second - damage untouched, nothing reversible', () => {
      const a = makeScored('A', 10, 2); // Score 12
      const b = makeScored('B', 6, 2);  // Score 8
      const c = makeScored('C', 4, 2);  // Score 6
      a.physicalDamage = 2;
      b.baseIni = 6; // re-affirm, keeps baseIni distinct from dices for the untouched-fields check
      CombatManager.started = true;
      CombatManager.passEnded = false;

      component.btnNextPass_Click();

      expect(a.getCurrentInitiative()).toBe(2);
      expect(b.getCurrentInitiative()).toBe(-2);
      expect(c.getCurrentInitiative()).toBe(-4);
      expect(CombatManager.isOver()).toBeFalse();
      expect(sent.some(e => e.text === formatPassEndLogText(1))).toBeFalse(); // no pass-1-end line yet from this path
      const passStartLines = sent.filter(e => /^Start Initiative Pass 2/.test(e.text));
      expect(passStartLines.length).toBe(1);

      const preTurnEndBaseIni = [a.baseIni, b.baseIni, c.baseIni];
      const preTurnEndDamage = a.physicalDamage;

      // The GM taps it once more, by mistake. `btnNextPass_Click()` is
      // `nextIniPass()` (the -10 decrement) immediately followed by
      // `goToNextActors()` (which is what notices `isOver()` and fires
      // `endCombatTurn()` -> `softReset()`, synchronously, before the click
      // handler returns) - split into its two constituent calls here so the
      // decremented-but-not-yet-reset Scores can be observed in between,
      // exactly as the brief's numbers describe.
      CombatManager.nextIniPass();
      expect(a.getCurrentInitiative()).toBe(-8);
      expect(b.getCurrentInitiative()).toBe(-12);
      expect(c.getCurrentInitiative()).toBe(-14);
      expect(CombatManager.isOver()).toBeTrue();

      CombatManager.goToNextActors();

      expect(sent.some(e => e.text === formatTurnEndLogText(1))).toBeTrue();
      expect(CombatManager.combatTurn).toBe(2);
      expect(CombatManager.initiativePass).toBe(1);
      expect(Number.isNaN(CombatManager.currentInitiative)).toBeTrue();

      // softReset() ran on everyone.
      for (const p of [a, b, c]) {
        expect(p.diceIni).toBe(0);
        expect(p.edge).toBeFalse();
        expect(p.status).toBe(StatusEnum.Waiting);
        expect(p.actionHistory).toEqual([]);
      }
      // Score is back to the bare attribute (softReset -> resetInitiativeScore()).
      expect(a.getCurrentInitiative()).toBe(a.baseIni - a.wm);

      // Damage and baseIni are untouched by softReset().
      expect(a.physicalDamage).toBe(preTurnEndDamage);
      expect([a.baseIni, b.baseIni, c.baseIni]).toEqual(preTurnEndBaseIni);

      // Nothing in the UI can reverse any of it.
      fixture.detectChanges();
      const rendered = fixture.nativeElement as HTMLElement;
      expect(rendered.querySelector('.fa-undo')).toBeNull();
      expect(rendered.querySelector('.fa-redo')).toBeNull();
    });
  });

  // ── S7 — Rejoin after a server restart, GM-only channel present ─────────

  describe('S7 - GM rejoin reconstructs a row, a withheld grunt and a PC\'s committed interrupt', () => {
    let component: BattleTrackerComponent;
    let fixture: ComponentFixture<BattleTrackerComponent>;
    let sync: SessionSyncService;
    let states: SharedCombatState[];
    let gmStates: SharedGmState[];

    beforeEach(async () => {
      resetCombat();
      await TestBed.configureTestingModule({
        imports: [BattleTrackerComponent],
        providers: appConfig.providers
      }).compileComponents();
      fixture = TestBed.createComponent(BattleTrackerComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
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

    function lastBroadcast(): { state: SharedCombatState; gmState: SharedGmState } {
      return { state: states[states.length - 1], gmState: gmStates[gmStates.length - 1] };
    }

    it('round-trips the row (verbatim rowWoundModifier), the withheld grunt, and the identity-shared Full Defense entry', () => {
      const row = new NpcRowParticipant();
      row.name = 'Gangers';
      const s1 = new GruntMember('S1', 4, 3);
      const s2 = new GruntMember('S2', 4, 3);
      const s3 = new GruntMember('S3', 4, 3);
      [s1, s2, s3].forEach(m => row.addMember(m));
      row.baseIni = 7;
      CombatManager.participants.insert(row);
      row.diceIni = 3;
      row.applyDamageToMember(s1, 4, 'physical');
      row.applyDamageToMember(s3, 10, 'stun'); // fills S3's 10-box track
      row.rowWoundModifier = 2; // pinned to the exact scenario value, not re-derived

      const withheld = new DetachedGruntParticipant();
      withheld.name = 'Lieutenant';
      withheld.setGruntAttributes(5, 4);
      withheld.baseIni = 6;
      CombatManager.participants.insert(withheld);
      withheld.diceIni = 2;
      withheld.applyDamage(withheld.physicalHealth, 'physical'); // out of action, non-claimable

      const pc = new Participant();
      pc.name = 'Wombat';
      pc.baseIni = 9;
      CombatManager.participants.insert(pc);
      pc.diceIni = 5;
      pc.physicalDamage = 5;
      pc.doAction(FULL_DEFENSE);
      component['participantClaimable'].set(pc, true);
      component['participantOwners'].set(pc, 'pl-1');

      component.shareRoomCode = 'ABC123';
      component['syncSharedState']();
      const { state, gmState } = lastBroadcast();

      resetCombat();
      component['restoreFromSharedState'](state, gmState);

      const restoredRow = CombatManager.participants.items.find(p => p.name === 'Gangers') as NpcRowParticipant;
      expect(restoredRow.members.map(m => m.damage)).toEqual([4, 0, 10]);
      expect(restoredRow.members[0].lastDamageType).toBe('physical');
      expect(restoredRow.members[0].lastDamageValue).toBe(4);
      expect(restoredRow.members[2].lastDamageType).toBe('stun');
      expect(restoredRow.members.map(m => m.hasActed)).toEqual([false, false, false]);
      expect(restoredRow.rowWoundModifier).toBe(2); // restored verbatim, not re-derived

      const restoredLieutenant = CombatManager.participants.items
        .find(p => p.name === 'Lieutenant') as DetachedGruntParticipant;
      expect(restoredLieutenant).toBeInstanceOf(DetachedGruntParticipant);

      const restoredPc = CombatManager.participants.items.find(p => p.name === 'Wombat')!;
      expect(restoredPc.actionHistory).toContain(FULL_DEFENSE); // identity-shared interruptTable entry
      expect(restoredPc.canUseAction(FULL_DEFENSE)).toBeFalse();

      for (const p of CombatManager.participants.items) {
        const shared = component['getSharedParticipants']().find(s => s.name === p.name);
        if (shared?.initiativeScore !== undefined) {
          expect(p.getCurrentInitiative()).withContext(p.name).toBe(shared.initiativeScore);
        }
      }

      expect(component.restoreWarning).not.toContain('undo');
    });
  });

  // ── S8 — Delete a combatant, then add a new one ──────────────────────────

  describe('S8 - deleting a combatant drops every side-map entry, and a new one gets a fresh id', () => {
    let component: BattleTrackerComponent;
    let fixture: ComponentFixture<BattleTrackerComponent>;
    let sync: SessionSyncService;
    let sent: SharedCombatState[];

    beforeEach(async () => {
      resetCombat();
      await TestBed.configureTestingModule({
        imports: [BattleTrackerComponent],
        providers: appConfig.providers
      }).compileComponents();
      fixture = TestBed.createComponent(BattleTrackerComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      resetCombat();

      sync = TestBed.inject(SessionSyncService);
      sent = [];
      spyOn(sync, 'broadcastState').and.callFake((s: SharedCombatState) => { sent.push(s); });
      spyOn(sync, 'broadcastGmState');
      spyOn(sync, 'appendLog');
      spyOn(sync, 'connect');
      component.shareRoomCode = 'ABC123';
    });

    afterEach(() => resetCombat());

    it('AC 14/AC 8: forgetParticipant drops every side-map entry for the deleted participant', async () => {
      component.addParticipant();
      component.addParticipant();
      component.addParticipant();
      component.addParticipant();
      const gangerA = CombatManager.participants.items[3];
      gangerA.name = 'Ganger A';
      component['participantClaimable'].set(gangerA, true);
      component['participantOwners'].set(gangerA, 'pl-1');
      component.onParticipantEdgeRatingChanged(gangerA, 3);
      component.onParticipantReactionChanged(gangerA, 5);
      component.onParticipantIntuitionChanged(gangerA, 4);
      component.expandedStatEditors.add(gangerA);
      component.selectActor(gangerA);
      const gangerAId = component['getParticipantId'](gangerA);

      spyOn(component['confirmationDialog'], 'simpleConfirm').and.resolveTo(true);

      await component.btnDelete_Click(gangerA);

      expect(CombatManager.participants.contains(gangerA)).toBeFalse();
      expect(component['participantIds'].has(gangerA)).toBeFalse();
      expect(component['participantOwners'].has(gangerA)).toBeFalse();
      expect(component['participantClaimable'].has(gangerA)).toBeFalse();
      expect(component['participantEdgeRatings'].has(gangerA)).toBeFalse();
      expect(component['participantReactions'].has(gangerA)).toBeFalse();
      expect(component['participantIntuitions'].has(gangerA)).toBeFalse();
      expect(component['participantTieBreakers'].has(gangerA)).toBeFalse();
      expect(component['lastKnownDamage'].has(gangerAId)).toBeFalse();
      expect(component['declaredActionSelections'].has(gangerA)).toBeFalse();
      expect(component.expandedStatEditors.has(gangerA)).toBeFalse();
      expect(component.selectedActor).toBeNull();

      const lastBroadcastState = sent[sent.length - 1];
      expect(lastBroadcastState.participants.some(p => p.id === gangerAId)).toBeFalse();

      // A new participant gets a fresh id, not Ganger A's.
      component.addParticipant();
      const fresh = CombatManager.participants.items[CombatManager.participants.items.length - 1];
      const freshId = component['getParticipantId'](fresh);
      expect(freshId).not.toBe(gangerAId);
    });
  });
});
