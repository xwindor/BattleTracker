// Acceptance-criteria and scenario tests for
// briefs/grunt-statblock-data-processing.md /
// briefs/grunt-statblock-data-processing-spec.md, settled by RULINGS.md
// "2026-08-30 - Data Processing is imported from a statblock only where the
// book supplies one, and is blank otherwise".
//
// Covers acceptance criteria 1, 3, 4, 5, 6, 10, 12, 13, 18, 19, 20; gameplay
// scenarios S1 (hot-sim) and S7 (the decker); and the restore/backwards-
// compatibility case (undefined item 2 / acceptance criterion 17).

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BattleTrackerComponent } from 'app/battle-tracker/battle-tracker.component';
import { appConfig } from 'app/app.config';
import { CombatManager } from 'Combat';
import { IParticipant } from 'Combat/Participants/IParticipant';
import { INITIATIVE_PASS_DECAY } from 'Combat/Participants/Participant';
import {
  DetachedGruntParticipant, NpcRowParticipant,
  ALL_GRUNT_STATBLOCKS, getStatblockById
} from 'Grunts';
import { SessionSyncService, SharedLogEntry, SharedCombatState } from 'app/services/session-sync.service';
import { MatrixParticipant, VRMode, DATA_PROCESSING_UNSET } from 'Matrix';

function resetCombat() {
  CombatManager.participants.clear();
  CombatManager.currentActors.clear();
  CombatManager.nextSortOrder = 0;
  CombatManager.initiativePass = 1;
  CombatManager.combatTurn = 1;
  CombatManager.started = false;
  CombatManager.passEnded = true;
}

describe('Grunt statblock Data Processing (briefs/grunt-statblock-data-processing*.md, RULINGS.md 2026-08-30)', () => {
  let component: BattleTrackerComponent;
  let fixture: ComponentFixture<BattleTrackerComponent>;
  let sync: SessionSyncService;
  let sent: SharedLogEntry[];

  beforeEach(async () => {
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
    spyOn(sync, 'appendLog').and.callFake((entry: SharedLogEntry) => {
      sent.push(entry);
      component['insertSharedLogEntry'](entry);
    });
    spyOn(sync, 'sendCommand').and.stub();

    component.shareRoomCode = 'ABC123';
    component.sharedLogEntries = [];
  });

  afterEach(() => resetCombat());

  // ── helpers (mirrors grunt-naming-and-statblocks.spec.ts) ────────────────

  function items(): IParticipant[] {
    return component.combatManager.participants.items as IParticipant[];
  }

  function commitGruntAdd(
    name: string,
    opts: { statblockId?: string; augmented?: boolean } = {}
  ): DetachedGruntParticipant {
    component.btnAddGrunt_Click();
    const draft = component.pendingAddDraft!;
    draft.name = name;
    if (opts.statblockId !== undefined) draft.statblockId = opts.statblockId;
    if (opts.augmented !== undefined) draft.loadAugmented = opts.augmented;
    component.commitAddDraft();
    return items()[items().length - 1] as DetachedGruntParticipant;
  }

  function commitRowAdd(
    name: string,
    count: number,
    opts: { statblockId?: string } = {}
  ): NpcRowParticipant {
    component.btnAddNpcRow_Click();
    const draft = component.pendingAddDraft!;
    draft.name = name;
    draft.count = count;
    if (opts.statblockId !== undefined) draft.statblockId = opts.statblockId;
    component.commitAddDraft();
    return items()[items().length - 1] as NpcRowParticipant;
  }

  // ── AC1/AC2 - the statblock data itself ───────────────────────────────────

  it('AC1 - pr4-lieutenant stores a Data Processing of 5, sourced from its printed Logic 5 (p. 383) via Living Persona DP = Logic (p. 101, p. 251)', () => {
    expect(getStatblockById('pr4-lieutenant')!.dataProcessing).toBe(5);
  });

  it('AC10 - pr5-lieutenant (the decker) imports no Data Processing value', () => {
    expect(getStatblockById('pr5-lieutenant')!.dataProcessing).toBeUndefined();
  });

  it('AC10/AC11 - pr5-lieutenant carries a GM-facing note naming the Shiawase Cyber-5 and its unassigned array 8 7 6 5, never a single number', () => {
    const notes = getStatblockById('pr5-lieutenant')!.notes.join(' ');
    expect(notes).toContain('Shiawase Cyber-5');
    expect(notes).toContain('8 7 6 5');
  });

  it('AC12 - the other twelve blocks import no Data Processing', () => {
    const withDp = ALL_GRUNT_STATBLOCKS.filter(sb => sb.dataProcessing !== undefined);
    expect(withDp.map(sb => sb.id)).toEqual(['pr4-lieutenant']);
  });

  it('AC13 - Intuition (the second VR-initiative term) is already a plain number on all fourteen blocks; no new second-term field was added', () => {
    for (const sb of ALL_GRUNT_STATBLOCKS) {
      expect(typeof sb.intuition).toBe('number');
    }
  });

  it('AC18 - regression: pr4-lieutenant\'s Condition Monitor derivation and note are unchanged by this work (still 11, not the printed 10)', () => {
    const lt = commitGruntAdd('Vitos Wire', { statblockId: 'pr4-lieutenant' });
    expect(lt.physicalHealth).toBe(11);
    expect(getStatblockById('pr4-lieutenant')!.notes.join(' ')).toContain('11');
  });

  // ── AC6 - AR regression: byte-identical to before this change ────────────

  it('AC6 - pr4-lieutenant in AR (still a plain grunt, not yet a Matrix participant): Reaction 4 + Intuition 5 = 9 with 1D6', () => {
    const lt = commitGruntAdd('Vitos Wire', { statblockId: 'pr4-lieutenant' });
    expect(component.getParticipantReactionValue(lt)).toBe(4);
    expect(component.getParticipantIntuitionValue(lt)).toBe(5);
    expect(lt.baseIni).toBe(9);
    expect(lt.dices).toBe(1);
  });

  // ── AC4/AC19 - instantiation seeds it onto a promoted Matrix participant ──

  it('AC4 - promoting a pr4-lieutenant grunt to a Matrix participant seeds Data Processing 5, not a hardcoded default', () => {
    const lt = commitGruntAdd('Vitos Wire', { statblockId: 'pr4-lieutenant' });
    const mp = component['promoteToMatrixParticipant'](lt) as MatrixParticipant;
    expect(mp.dataProcessing).toBe(5);
  });

  it('AC5/AC7 - a hand-built ("Add Participant") promotion to Matrix seeds no default at all - Data Processing stays unset', () => {
    component.btnAddParticipant_Click();
    component.pendingAddDraft!.name = 'Random Decker';
    component.commitAddDraft();
    const p = items()[items().length - 1];
    const mp = component['promoteToMatrixParticipant'](p) as MatrixParticipant;
    expect(mp.dataProcessing).toBe(DATA_PROCESSING_UNSET);
  });

  it('AC19 - regression: the Data Processing change does not disturb the lieutenant/row tie-break link across a Matrix promotion', () => {
    const row = commitRowAdd('Ancients', 2, { statblockId: 'pr4-grunt' });
    const boss = commitGruntAdd('Vitos Wire', { statblockId: 'pr4-lieutenant' });
    component.setLieutenantTeam(boss, row);
    const rowId = component['getParticipantId'](row);

    const mp = component['promoteToMatrixParticipant'](boss) as MatrixParticipant;
    expect(mp.dataProcessing).toBe(5);
    expect(component['participantLieutenantTeamRowId'].get(mp)).toBe(rowId);
    expect(component['isLieutenantOf'](mp, row)).toBeTrue();
  });

  // ── AC3/AC4/AC5 - VR base and dice counts ─────────────────────────────────

  it('AC3/AC4 - pr4-lieutenant in Hot-Sim VR derives base Initiative 10 (DP 5 + INT 5) and 4 Initiative Dice', () => {
    const lt = commitGruntAdd('Vitos Wire', { statblockId: 'pr4-lieutenant' });
    const mp = component['promoteToMatrixParticipant'](lt) as MatrixParticipant;
    component.setPendingVrMode(mp, VRMode.HotSim);
    component.gmJackIn(mp);
    expect(mp.vrMode).toBe(VRMode.HotSim);
    expect(mp.baseIni).toBe(10);
    expect(mp.dices).toBe(4);
  });

  it('AC5 - pr4-lieutenant in Cold-Sim VR (offered, though illegal for a living persona per p. 251) derives base 10 and 3 Initiative Dice', () => {
    const lt = commitGruntAdd('Vitos Wire', { statblockId: 'pr4-lieutenant' });
    const mp = component['promoteToMatrixParticipant'](lt) as MatrixParticipant;
    component.setPendingVrMode(mp, VRMode.ColdSim);
    component.gmJackIn(mp);
    expect(mp.vrMode).toBe(VRMode.ColdSim);
    expect(mp.baseIni).toBe(10);
    expect(mp.dices).toBe(3);
  });

  // ── AC7 - the printed "9 + 3D6 (Hot Sim)" line is a note, never a value ──

  it('AC7 - the printed "Matrix Initiative 9 + 3D6" line is text only; it never becomes a stored value', () => {
    const sb = getStatblockById('pr4-lieutenant')!;
    expect(sb.notes.join(' ')).toContain('9 + 3D6');
    // The stored value is Logic-derived (5), not the printed 9.
    expect(sb.dataProcessing).toBe(5);
  });

  // ── S1 - Ordinary case: the technomancer jacks in ─────────────────────────

  it('S1 - the technomancer jacks into Hot-Sim VR: base 10, rolls 4D6 (3+5+2+4=14) for a Score of 24, then decays 10/pass', () => {
    const lt = commitGruntAdd('Vitos Wire', { statblockId: 'pr4-lieutenant' });
    const mp = component['promoteToMatrixParticipant'](lt) as MatrixParticipant;
    component.setPendingVrMode(mp, VRMode.HotSim);
    component.gmJackIn(mp);
    expect(mp.baseIni).toBe(10);
    expect(mp.dices).toBe(4);

    // Deterministic dice: floor(random*6)+1 == 3,5,2,4 (sum 14).
    spyOn(Math, 'random').and.returnValues(0.4, 0.7, 0.2, 0.55);
    component['rollAndLogInitiative'](mp);
    expect(mp.diceIni).toBe(14);
    expect(mp.getCurrentInitiative()).toBe(24);

    mp.applyInitiativeScoreDelta(-INITIATIVE_PASS_DECAY);
    expect(mp.getCurrentInitiative()).toBe(14);
    mp.applyInitiativeScoreDelta(-INITIATIVE_PASS_DECAY);
    expect(mp.getCurrentInitiative()).toBe(4);
    mp.applyInitiativeScoreDelta(-INITIATIVE_PASS_DECAY);
    expect(mp.getCurrentInitiative()).toBe(-6); // no floor at 0 (RULINGS 2026-07-31)
  });

  // ── S7 - the decker, who has no number ────────────────────────────────────

  it('S7 - pr5-lieutenant switched to Cold-Sim VR: the app has no Data Processing for him and derives nothing (0), never a guess', () => {
    const decker = commitGruntAdd('Slick', { statblockId: 'pr5-lieutenant' });
    const mp = component['promoteToMatrixParticipant'](decker) as MatrixParticipant;
    expect(mp.dataProcessing).toBe(DATA_PROCESSING_UNSET);

    component.setPendingVrMode(mp, VRMode.ColdSim);
    component.gmJackIn(mp);
    expect(mp.vrMode).toBe(VRMode.ColdSim);
    // No VR Initiative derived - the sentinel, not a plausible partial number.
    expect(mp.baseIni).toBe(DATA_PROCESSING_UNSET);
    expect(component.getParticipantBaseInitiative(mp)).toBe(DATA_PROCESSING_UNSET);
    expect(component.getMatrixDataProcessingDisplayValue(mp)).toBeNull();

    // GM reads the note, assigns Data Processing 8 from the array, and the
    // app derives 13 + 3D6 (p. 101, p. 159, p. 229, p. 231). Logic (5) is
    // never consulted for a decker (p. 227 vs p. 251).
    component.onMatrixDPChanged(mp, 8);
    expect(mp.dataProcessing).toBe(8);
    expect(component.getParticipantBaseInitiative(mp)).toBe(13);
  });

  // ── Backwards compatibility: a session saved before this change ──────────

  describe('AC17/AC20 - backwards compatibility: a session saved/synced before this change still loads', () => {
    /** Builds a bare-minimum legacy `SharedCombatState`, `dataProcessing` supplied by the caller. */
    function legacyMatrixState(dataProcessing?: number): SharedCombatState {
      return {
        round: 1, pass: 1, started: true, passEnded: false, currentInitiative: 10,
        participants: [{
          id: 'p-1', name: 'Old Decker', order: 1, active: false, initiativeScore: 10,
          playerControlled: false, initiativeDice: 4, pendingRoll: false,
          rolledInitiativeTotal: 4, reaction: 4, intuition: 5,
          isMatrix: true, vrMode: 'hot-sim', jackedIn: true,
          ...(dataProcessing !== undefined ? { dataProcessing } : {})
        }]
      };
    }

    it('a participant restored with NO Data Processing field at all loads without throwing and reads as unset', () => {
      expect(() => component['restoreFromSharedState'](legacyMatrixState(undefined), null)).not.toThrow();
      const restored = CombatManager.participants.items[0] as MatrixParticipant;
      expect(restored.dataProcessing).toBe(DATA_PROCESSING_UNSET);
      expect(component.getParticipantBaseInitiative(restored)).toBe(DATA_PROCESSING_UNSET);
    });

    it('a participant restored with an explicit stored 0 loads identically - 0 always means unset, never a rated 0', () => {
      expect(() => component['restoreFromSharedState'](legacyMatrixState(0), null)).not.toThrow();
      const restored = CombatManager.participants.items[0] as MatrixParticipant;
      expect(restored.dataProcessing).toBe(DATA_PROCESSING_UNSET);
      expect(component.getParticipantBaseInitiative(restored)).toBe(DATA_PROCESSING_UNSET);
    });

    it('a participant restored with a real Data Processing (e.g. the pre-change hardcoded 6) loads that value verbatim', () => {
      expect(() => component['restoreFromSharedState'](legacyMatrixState(6), null)).not.toThrow();
      const restored = CombatManager.participants.items[0] as MatrixParticipant;
      expect(restored.dataProcessing).toBe(6);
      expect(component.getParticipantBaseInitiative(restored)).toBe(11); // 6 + Intuition 5
    });
  });
});
