// Acceptance-criteria and scenario tests for
// briefs/grunt-naming-and-statblocks-spec.md, amended by that brief's own
// "Decisions - 2026-08-26 (binding)" section, which overrides everything
// earlier in the document. In particular:
//   - D-X1: no Professional Rating break-point badge (U11/IA27 struck).
//   - D-X2: `GruntStatblock` carries only body/willpower/reaction/intuition/
//     initiativeDice(+augmented)/notes - no gear/skills/Limits/Armor/printed-
//     alt-Initiative text (rules-spec criteria 23/24 struck; IA13/IA22/IA25
//     narrowed or struck accordingly).
//   - D-X3: contacts are NOT imported at all (rules-spec criteria 5/6/15
//     amended; IA12's contact half dropped).
//   - D-X4: `professionalRating` is retained as GM-only identification only.
//
// Phase 1 (naming on add) acceptance criteria are IA1-IA11 below; Phase 2
// (statblocks) IA12-IA24 (IA25 struck); Phase 3 (U7 lieutenant tie-break only,
// U11 badge dropped) IA26 (IA27 struck). Gameplay scenarios IS1-IS8, IS6/IS7
// adjusted per the Decisions section, IS8 the Phase 3 tie-break.
//
// Defect-fix round (adversarial validator, 2026-08-26): IA26 rewritten - the
// lieutenant tie-break moved from a pairwise comparator override to a
// post-sort adjustment (`applyLieutenantPrecedence`), see D4 below. IA13/IA24
// and the pure-factory test now assert literal box counts, not the formula
// they're meant to be checking. IA18 asserts "no Score movement at
// construction" directly. IA20's stale inline comment is corrected. New
// permanent regression coverage for D1 (per-keystroke announcement), D2
// (blank Add Participant), D4 (non-transitive lieutenant tie-break), D6
// (lieutenant templates in a row), D7 (Duplicate cloning the team link), D8
// (unvalidated row member count) and D9 (diagnostic strings in the local
// Action Log), plus IA7 (promote/demote helpers), IA10 (register_character)
// and a GM-reconnect round trip for the lieutenant/team-row link.

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BattleTrackerComponent } from 'app/battle-tracker/battle-tracker.component';
import { appConfig } from 'app/app.config';
import { CombatManager } from 'Combat';
import { IParticipant } from 'Combat/Participants/IParticipant';
import {
  DetachedGruntParticipant, NpcRowParticipant,
  ALL_GRUNT_STATBLOCKS, getStatblockById,
  instantiateStandaloneFromStatblock, instantiateRowFromStatblock,
  hasGruntConditionMonitor
} from 'Grunts';
import { SessionSyncService, SharedLogEntry, SharedGmState } from 'app/services/session-sync.service';
import { MatrixParticipant } from 'Matrix';
import { AstralParticipant } from 'Magic';

function resetCombat() {
  CombatManager.participants.clear();
  CombatManager.currentActors.clear();
  CombatManager.nextSortOrder = 0;
  CombatManager.initiativePass = 1;
  CombatManager.combatTurn = 1;
  CombatManager.started = false;
  CombatManager.passEnded = true;
}

describe('Grunt naming on add, and grunts from CRB statblocks (briefs/grunt-naming-and-statblocks-spec.md)', () => {
  let component: BattleTrackerComponent;
  let fixture: ComponentFixture<BattleTrackerComponent>;
  let sync: SessionSyncService;
  /** Entries that actually went out on the shared log, in send order. */
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

  // ── helpers ────────────────────────────────────────────────────────────

  function items(): IParticipant[] {
    return component.combatManager.participants.items as IParticipant[];
  }

  function names(): string[] {
    return items().map(p => p.name);
  }

  /** Open the Add Grunt dialog, optionally pick a template, and confirm. */
  function commitGruntAdd(
    name: string,
    opts: { statblockId?: string; augmented?: boolean; body?: number; willpower?: number } = {}
  ): DetachedGruntParticipant {
    component.btnAddGrunt_Click();
    const draft = component.pendingAddDraft!;
    draft.name = name;
    if (opts.statblockId !== undefined) draft.statblockId = opts.statblockId;
    if (opts.augmented !== undefined) draft.loadAugmented = opts.augmented;
    if (opts.body !== undefined) draft.body = opts.body;
    if (opts.willpower !== undefined) draft.willpower = opts.willpower;
    component.commitAddDraft();
    return items()[items().length - 1] as DetachedGruntParticipant;
  }

  /** Open the Grunt Group dialog, optionally pick a template, and confirm. */
  function commitRowAdd(
    name: string,
    count: number,
    opts: { statblockId?: string; augmented?: boolean; body?: number; willpower?: number } = {}
  ): NpcRowParticipant {
    component.btnAddNpcRow_Click();
    const draft = component.pendingAddDraft!;
    draft.name = name;
    draft.count = count;
    if (opts.statblockId !== undefined) draft.statblockId = opts.statblockId;
    if (opts.augmented !== undefined) draft.loadAugmented = opts.augmented;
    if (opts.body !== undefined) draft.body = opts.body;
    if (opts.willpower !== undefined) draft.willpower = opts.willpower;
    component.commitAddDraft();
    return items()[items().length - 1] as NpcRowParticipant;
  }

  function commitParticipantAdd(name: string): IParticipant {
    component.btnAddParticipant_Click();
    component.pendingAddDraft!.name = name;
    component.commitAddDraft();
    return items()[items().length - 1];
  }

  /**
   * Adds one placeholder exactly the way the constructor does, and returns
   * it (matching `persistent-rooms.spec.ts`'s "Round 4 - D5" helper). Needed
   * because this file's `beforeEach` calls `resetCombat()` *after*
   * `fixture.detectChanges()` (so every other test here starts from a
   * genuinely empty roster) - which wipes out the constructor's own
   * placeholder, unlike a real fresh tab.
   */
  function placeholder(): IParticipant {
    component.addParticipant();
    return items()[items().length - 1];
  }

  function snapshotRoster(): unknown {
    return items().map(p => ({
      id: component['getParticipantId'](p),
      name: p.name,
      score: p.getCurrentInitiative(),
      sortOrder: p.sortOrder
    }));
  }

  /**
   * Give `p` a rolled Initiative Score the same way the Roll button does
   * (RULINGS.md 2026-08-30: this is the single choke point a queued join
   * line fires from). Random dice values, matching production - callers here
   * only ever assert *that* a line fired, never the roll's own numbers.
   */
  function rollFor(p: IParticipant): void {
    component['rollAndLogInitiative'](p);
  }

  // ── IA1-IA11: Phase 1, naming on add ─────────────────────────────────────

  describe('IA1/IA2 - every add control opens a dialog and creates nothing until Confirm', () => {
    it('Add Participant', () => {
      const before = items().length;
      component.btnAddParticipant_Click();
      expect(items().length).toBe(before);
      expect(component.pendingAddDraft).not.toBeNull();
      component.cancelAddDraft();
      expect(items().length).toBe(before);
    });

    it('Add Grunt', () => {
      const before = items().length;
      component.btnAddGrunt_Click();
      expect(items().length).toBe(before);
      component.cancelAddDraft();
      expect(items().length).toBe(before);
    });

    it('Grunt Group', () => {
      const before = items().length;
      component.btnAddNpcRow_Click();
      expect(items().length).toBe(before);
      component.cancelAddDraft();
      expect(items().length).toBe(before);
    });

    it('Add NPC (to an existing row)', () => {
      const row = commitRowAdd('Existing Row', 0);
      const before = items().length;
      const memberCountBefore = row.members.length;
      component.btnAddNpcToRow_Click(row);
      expect(items().length).toBe(before);
      expect(row.members.length).toBe(memberCountBefore);
      component.cancelAddDraft();
      expect(row.members.length).toBe(memberCountBefore);
    });

    it('Merge', () => {
      const g1 = component.addGrunt('G1');
      const g2 = component.addGrunt('G2');
      component.toggleMergeSelection(g1);
      component.toggleMergeSelection(g2);
      const before = items().length;
      component.btnMergeSelectedGrunts_Click();
      expect(items().length).toBe(before);
      component.cancelAddDraft();
      expect(items().length).toBe(before);
      expect(names()).toContain('G1');
      expect(names()).toContain('G2');
    });
  });

  it('IA2 (full) - cancel leaves the roster byte-identical and broadcasts nothing', () => {
    const broadcastSpy = spyOn(sync, 'broadcastState');
    const before = snapshotRoster();
    component.btnAddParticipant_Click();
    component.pendingAddDraft!.name = 'Typed and then abandoned';
    component.cancelAddDraft();
    expect(snapshotRoster()).toEqual(before);
    expect(broadcastSpy).not.toHaveBeenCalled();
    expect(sent.length).toBe(0);
  });

  it('IA3 (amended, RULINGS.md 2026-08-30) - confirming with a typed name queues the line; rolling writes exactly one entry, actor is the typed name, no placeholder text', () => {
    sent.length = 0;
    const p = commitParticipantAdd('Halloweener Torch');
    expect(sent.length).toBe(0); // not yet rolled - nothing sent at commit any more
    rollFor(p);
    const joinLines = sent.filter(e => e.text === 'joined the fight.');
    expect(joinLines.length).toBe(1);
    expect(joinLines[0].actor).toBe('Halloweener Torch');
    expect(JSON.stringify(sent)).not.toContain('Participant 1');
  });

  it('IA4 - a blank name uses the generator default, unique within the encounter', () => {
    const g1 = commitGruntAdd('');
    const g2 = commitGruntAdd('');
    expect(g1.name).toBe('Grunt 1');
    expect(g2.name).toBe('Grunt 2');
    expect(g1.name).not.toBe(g2.name);
  });

  it('IA5 (amended, RULINGS.md 2026-08-30) - a Grunt Group add of N members produces one row, queued; rolling writes exactly one shared-log entry', () => {
    sent.length = 0;
    const row = commitRowAdd('Ancients', 4);
    expect(row.members.length).toBe(4);
    expect(sent.length).toBe(0); // unrolled - a brand-new row always goes in this way (Decision 10)
    rollFor(row);
    const formedLines = sent.filter(e => e.text === 'formed.');
    expect(formedLines.length).toBe(1);
  });

  it('IA6 - isUnusedPlaceholder still true for the constructor-seeded row on an untouched tab', () => {
    expect(component['isUnusedPlaceholder'](placeholder())).toBeTrue();
  });

  it('IA7 - no log line from the constructor or restoreFromSharedState', () => {
    // Constructor already ran in beforeEach; nothing has been sent.
    expect(sent.length).toBe(0);
    const gmState: SharedGmState = { version: 1, withheldParticipants: [], participants: [] };
    component['restoreFromSharedState']({ round: 1, pass: 1, participants: [] }, gmState);
    expect(sent.length).toBe(0);
  });

  it('IA8 (amended, RULINGS.md 2026-08-30) - addGrunt(\'X\') called directly queues the line; rolling writes exactly one entry, text "added."', () => {
    sent.length = 0;
    const grunt = component.addGrunt('X');
    expect(sent.length).toBe(0); // a standalone grunt takes its own Initiative Test like anyone else
    rollFor(grunt);
    const addedLines = sent.filter(e => e.text === 'added.');
    expect(addedLines.length).toBe(1);
    expect(addedLines[0].actor).toBe('X');
  });

  it('IA9 - addNpcToRow(row, \'X\') onto an ALREADY-ROLLED row still writes exactly one entry immediately (Decision 7: a joiner takes the row\'s current Score, no roll of its own to wait for)', () => {
    const row = component.addNpcRow(false);
    row.name = 'Gangers';
    rollFor(row); // reinforcement case: row has already taken its Initiative Test
    sent.length = 0;
    component.addNpcToRow(row, 'X');
    const joinLines = sent.filter(e => e.text === 'X joined the group.');
    expect(joinLines.length).toBe(1);
  });

  it('IA9b (amended, RULINGS.md 2026-08-30) - addNpcToRow(row, \'X\') onto a still-UNROLLED row queues the line instead, and it fires once the row rolls', () => {
    const row = component.addNpcRow(false);
    row.name = 'Gangers';
    sent.length = 0;
    component.addNpcToRow(row, 'X');
    expect(sent.filter(e => e.text === 'X joined the group.').length).toBe(0);
    rollFor(row);
    expect(sent.filter(e => e.text === 'X joined the group.').length).toBe(1);
  });

  it('item 8 fix (fix round 4) - a reinforcement wounded AFTER joining a still-unrolled row reports the wounds it has when the row finally rolls, not the wounds (none) it arrived with', () => {
    // The wound clause used to be frozen at queue time, so a member who took
    // damage in the gap between joining and the row's own roll was
    // under-reported. `member.name` was already read lazily; `carriedWounds`
    // now is too.
    const row = component.addNpcRow(false);
    row.name = 'Gangers';
    const veteran = component.addNpcToRow(row, 'Veteran'); // wm 0 at join time
    veteran.applyDamage(6, 'physical'); // wm becomes 2 before the row ever rolls
    sent.length = 0;

    rollFor(row);

    const joinLines = sent.filter(e => e.text === 'Veteran joined the group, arrives wounded (-2).');
    expect(joinLines.length).toBe(1);
  });

  it('IA10 - a register_character session command still writes exactly one "joined the session" entry, not double-logged by the new commit path', () => {
    sent.length = 0;
    component['handleSessionCommand']({
      type: 'register_character',
      player: 'pl-cayman',
      payload: { characterName: 'Cayman' },
      timestamp: new Date().toISOString()
    });
    expect(sent.length).toBe(1);
    expect(sent[0].actor).toBe('Cayman');
    expect(sent[0].text).toBe('joined the session');
    expect(names()).toContain('Cayman');
  });

  it('IA7 (full) - the four promote/demote helpers write no log line when called directly', () => {
    const p = component.addParticipant();
    sent.length = 0;
    const mp = component['promoteToMatrixParticipant'](p) as MatrixParticipant;
    expect(sent.length).toBe(0);
    const backToParticipant = component['demoteToParticipant'](mp);
    expect(sent.length).toBe(0);
    const ap = component['promoteToAstralParticipant'](backToParticipant) as AstralParticipant;
    expect(sent.length).toBe(0);
    component['demoteFromAstralParticipant'](ap);
    expect(sent.length).toBe(0);
  });

  it('defect 4 (fix round 2) - the statblock imprint and the lieutenant/team-row link survive every promote/demote type swap', () => {
    const row = commitRowAdd('Ancients', 2, { statblockId: 'pr1-grunt' });
    const boss = commitGruntAdd('Ancients Boss', { statblockId: 'pr1-lieutenant' });
    component.setLieutenantTeam(boss, row);
    const rowId = component['getParticipantId'](row);

    expect(component['participantStatblocks'].get(boss)!.id).toBe('pr1-lieutenant');
    expect(component['participantLieutenantTeamRowId'].get(boss)).toBe(rowId);

    // Astral round trip.
    const ap = component['promoteToAstralParticipant'](boss) as AstralParticipant;
    expect(component['participantStatblocks'].has(boss)).toBeFalse();
    expect(component['participantLieutenantTeamRowId'].has(boss)).toBeFalse();
    expect(component['participantStatblocks'].get(ap)!.id).toBe('pr1-lieutenant');
    expect(component['participantLieutenantTeamRowId'].get(ap)).toBe(rowId);

    const backToParticipant = component['demoteFromAstralParticipant'](ap);
    expect(component['participantStatblocks'].has(ap)).toBeFalse();
    expect(component['participantLieutenantTeamRowId'].has(ap)).toBeFalse();
    expect(component['participantStatblocks'].get(backToParticipant)!.id).toBe('pr1-lieutenant');
    expect(component['participantLieutenantTeamRowId'].get(backToParticipant)).toBe(rowId);

    // Matrix round trip, starting from the same participant instance.
    const mp = component['promoteToMatrixParticipant'](backToParticipant) as MatrixParticipant;
    expect(component['participantStatblocks'].has(backToParticipant)).toBeFalse();
    expect(component['participantLieutenantTeamRowId'].has(backToParticipant)).toBeFalse();
    expect(component['participantStatblocks'].get(mp)!.id).toBe('pr1-lieutenant');
    expect(component['participantLieutenantTeamRowId'].get(mp)).toBe(rowId);

    const finalParticipant = component['demoteToParticipant'](mp);
    expect(component['participantStatblocks'].has(mp)).toBeFalse();
    expect(component['participantLieutenantTeamRowId'].has(mp)).toBeFalse();
    expect(component['participantStatblocks'].get(finalParticipant)!.id).toBe('pr1-lieutenant');
    expect(component['participantLieutenantTeamRowId'].get(finalParticipant)).toBe(rowId);

    // The lieutenant tie-break still resolves against his row through the
    // carried-over link, post-swap.
    expect(component['isLieutenantOf'](finalParticipant, row)).toBeTrue();
  });

  it('IA11 - no add-path log line ever contains a Condition Monitor maximum or a Professional Rating', () => {
    sent.length = 0;
    const grunt = commitGruntAdd('Vitos Wire', { statblockId: 'pr4-lieutenant' });
    const row = commitRowAdd('Ancients', 3, { statblockId: 'pr1-grunt' });
    // The lines only actually exist once each is rolled (RULINGS.md
    // 2026-08-30) - roll both so the loop below has something to check.
    rollFor(grunt);
    rollFor(row);
    expect(sent.length).toBeGreaterThan(0);
    for (const entry of sent) {
      expect(entry.text).not.toContain('Condition Monitor');
      expect(entry.text).not.toMatch(/\bboxes\b/);
      expect(entry.text).not.toMatch(/\bPR\s*\d/);
      expect(entry.text).not.toContain('Professional Rating');
    }
  });

  // ── IA12-IA24: Phase 2, statblocks ───────────────────────────────────────

  it('IA12 (amended, D-X3) - ALL_GRUNT_STATBLOCKS has length 14', () => {
    expect(ALL_GRUNT_STATBLOCKS.length).toBe(14);
    for (const sb of ALL_GRUNT_STATBLOCKS) {
      expect(getStatblockById(sb.id)).toBe(sb);
    }
  });

  it('IA13 (narrowed, D-X2) - no statblock field is a Condition Monitor box count; every derived box count matches the p. 379 formula', () => {
    // Literal, hand-computed expected box counts (defect D12, validator
    // round): the previous version of this test compared the instantiated
    // grunt's box count against `gruntConditionMonitorBoxes(sb.body,
    // sb.willpower)` - the exact same formula the production code calls -
    // so a wrong formula would have passed against itself. These are
    // 8 + ceil(max(Body, Willpower) / 2), p. 379, computed by hand from the
    // Body/Willpower transcribed in `grunt-statblocks.ts`.
    const expectedBoxes: Record<string, number> = {
      'pr0-grunt': 10, 'pr0-lieutenant': 10,
      'pr1-grunt': 10, 'pr1-lieutenant': 10,
      'pr2-grunt': 10, 'pr2-lieutenant': 10,
      'pr3-grunt': 10, 'pr3-lieutenant': 10,
      'pr4-grunt': 10, 'pr4-lieutenant': 11,
      'pr5-grunt': 11, 'pr5-lieutenant': 11,
      'pr6-grunt': 11, 'pr6-lieutenant': 11
    };
    expect(Object.keys(expectedBoxes).length).toBe(ALL_GRUNT_STATBLOCKS.length);
    for (const sb of ALL_GRUNT_STATBLOCKS) {
      expect((sb as unknown as Record<string, unknown>)['conditionMonitorBoxes']).toBeUndefined();
      expect((sb as unknown as Record<string, unknown>)['printedConditionMonitor']).toBeUndefined();
      const { grunt } = instantiateStandaloneFromStatblock(sb, { augmented: false });
      expect(grunt.physicalHealth).toBe(expectedBoxes[sb.id]);
    }
  });

  it('IA14 - PR 0 grunt 10 boxes, PR 5 grunt 11, PR 6 lieutenant 11, PR 4 lieutenant 11 (not printed 10) with a note', () => {
    const pr0Grunt = commitGruntAdd('T1', { statblockId: 'pr0-grunt' });
    expect(pr0Grunt.physicalHealth).toBe(10);

    const pr5Grunt = commitGruntAdd('T2', { statblockId: 'pr5-grunt' });
    expect(pr5Grunt.physicalHealth).toBe(11);

    const pr6Lt = commitGruntAdd('T3', { statblockId: 'pr6-lieutenant' });
    expect(pr6Lt.physicalHealth).toBe(11);

    const pr4Lt = commitGruntAdd('T4', { statblockId: 'pr4-lieutenant' });
    expect(pr4Lt.physicalHealth).toBe(11);
    expect(getStatblockById('pr4-lieutenant')!.notes.join(' ')).toContain('11');
  });

  it('IA15 - PR 0 lieutenant yields 10 boxes despite no printed Condition Monitor line', () => {
    const pr0Lt = commitGruntAdd('Boss', { statblockId: 'pr0-lieutenant' });
    expect(pr0Lt.physicalHealth).toBe(10);
    expect(getStatblockById('pr0-lieutenant')!.notes.length).toBeGreaterThan(0);
  });

  it('IA16 - instantiating a template as a row produces one participant with one Score', () => {
    const before = items().length;
    const row = commitRowAdd('Ancients', 4, { statblockId: 'pr1-grunt' });
    expect(items().length).toBe(before + 1);
    expect(row.members.length).toBe(4);
    expect(typeof row.getCurrentInitiative()).toBe('number');
  });

  it('IA17 - Reaction/Intuition side maps and baseIni: pr2-grunt=7, pr5-grunt aug=12/base=10, pr6-lieutenant=15', () => {
    const pr2 = commitGruntAdd('A', { statblockId: 'pr2-grunt' });
    expect(component['participantReactions'].get(pr2)).toBe(4);
    expect(component['participantIntuitions'].get(pr2)).toBe(3);
    expect(pr2.baseIni).toBe(7);

    const pr5aug = commitGruntAdd('B', { statblockId: 'pr5-grunt', augmented: true });
    expect(pr5aug.baseIni).toBe(12);

    const pr5base = commitGruntAdd('C', { statblockId: 'pr5-grunt', augmented: false });
    expect(pr5base.baseIni).toBe(10);

    const pr6lt = commitGruntAdd('D', { statblockId: 'pr6-lieutenant', augmented: true });
    expect(pr6lt.baseIni).toBe(15);
  });

  it('IA18 - dices equals the printed Initiative Dice count, written with no Score movement at construction', () => {
    const pr6 = commitGruntAdd('E', { statblockId: 'pr6-grunt' });
    expect(pr6.dices).toBe(4);

    // The "no Score movement" half (defect D12, validator round - previously
    // unasserted): `instantiateStandaloneFromStatblock` writes the dice count
    // via `setDicesWithoutRoll` and touches nothing else, so a freshly
    // instantiated grunt's running Initiative Score must equal a genuinely
    // untouched grunt's, regardless of how many Initiative Dice the template
    // carries.
    const fresh = new DetachedGruntParticipant();
    const { grunt: pr6Fresh } = instantiateStandaloneFromStatblock(
      getStatblockById('pr6-grunt')!, { augmented: true }
    );
    expect(pr6Fresh.dices).toBe(4);
    expect(pr6Fresh.getCurrentInitiative()).toBe(fresh.getCurrentInitiative());
  });

  it('IA19 - participantEdgeRatings is 0 for every grunt and lieutenant template', () => {
    for (const sb of ALL_GRUNT_STATBLOCKS) {
      const g = commitGruntAdd(`edge-${sb.id}`, { statblockId: sb.id });
      expect(component['participantEdgeRatings'].get(g)).toBe(0);
    }
  });

  it('IA20 - a template row added mid-pass takes the late-entry penalty; a member added to an existing row does not', () => {
    CombatManager.started = true;
    CombatManager.initiativePass = 3;
    const row = commitRowAdd('Latecomers', 2, { statblockId: 'pr1-grunt' });
    // Reaction 3 + Intuition 3 = 6; late-entry penalty is -(pass - 1) *
    // INITIATIVE_PASS_DECAY = -(3 - 1) * 10 = -20 (p. 160), giving 6 - 20
    // (defect D12, validator round: this comment previously pre-computed the
    // result as "-14", which does not match the "6 - 20" the assertion
    // below actually checks).
    expect(row.getCurrentInitiative()).toBe(6 - 20);

    CombatManager.initiativePass = 1;
    const existing = commitRowAdd('Existing', 1, { statblockId: 'pr1-grunt' });
    const scoreBefore = existing.getCurrentInitiative();
    component.btnAddNpcToRow_Click(existing);
    component.pendingAddDraft!.name = 'Reinforcement';
    component.commitAddDraft();
    expect(existing.getCurrentInitiative()).toBe(scoreBefore);
  });

  it('IA21 - SharedParticipantState for a templated participant carries no statblockId/professionalRating/reference text', () => {
    commitGruntAdd('Leaker Check', { statblockId: 'pr5-lieutenant' });
    const wire = JSON.stringify(component['getSharedParticipants']());
    expect(wire).not.toMatch(/professionalRating|statblockId|statblock/i);
  });

  it('defect 7 (fix round 2) - the GM view can look up a templated participant\'s statblock label; a hand-built participant has none', () => {
    const grunt = commitGruntAdd('Vitos Wire', { statblockId: 'pr4-lieutenant' });
    expect(component.getParticipantStatblockLabel(grunt))
      .toBe('PR 4 - Organized Crime Gang (Lieutenant, technomancer)');

    const handBuilt = component.addParticipant();
    expect(component.getParticipantStatblockLabel(handBuilt)).toBeNull();
  });

  it('IA22 (narrowed, D-X2) - GM-only round trip restores name/Body/Willpower/Reaction/Intuition/dice/statblockId', () => {
    const original = commitGruntAdd('Vitos Wire', { statblockId: 'pr4-lieutenant' });
    // Captured before the restore: `restoreFromSharedState` clears every side
    // map wholesale (Phase 1 obligation) and rebuilds fresh participant
    // objects, so `original`'s own map entries are gone afterwards - the
    // round trip is checked against these captured primitives, not against
    // `original` a second time.
    const originalBody = original.gruntBody;
    const originalWillpower = original.gruntWillpower;
    const originalReaction = component['participantReactions'].get(original);
    const originalIntuition = component['participantIntuitions'].get(original);
    const originalDices = original.dices;

    const gmState = component['buildGmState']();
    // Item 8 fix (fix round 3): `professionalRating`/`label` are no longer
    // wire fields at all - D-X4's "GM-only identification" is carried by
    // `statblockId` alone and re-derived on demand
    // (`getParticipantStatblockLabel()`), never sent as its own copy.
    const gmEntry = gmState.participants.find((g: { id: string }) => g.id === component['getParticipantId'](original));
    expect((gmEntry as unknown as { professionalRating?: number })?.professionalRating).toBeUndefined();
    expect((gmEntry as unknown as { label?: string })?.label).toBeUndefined();
    expect(gmEntry?.statblockId).toBe('pr4-lieutenant');

    const shared = { round: 1, pass: 1, participants: component['getSharedParticipants']() };
    component['restoreFromSharedState'](shared, gmState);
    const restored = items().find(p => p.name === 'Vitos Wire') as DetachedGruntParticipant;
    expect(restored).toBeTruthy();
    expect(hasGruntConditionMonitor(restored)).toBeTrue();
    expect(restored.gruntBody).toBe(originalBody);
    expect(restored.gruntWillpower).toBe(originalWillpower);
    expect(component['participantReactions'].get(restored)).toBe(originalReaction);
    expect(component['participantIntuitions'].get(restored)).toBe(originalIntuition);
    expect(restored.dices).toBe(originalDices);
    expect(component['participantStatblocks'].get(restored)?.id).toBe('pr4-lieutenant');
    // The GM-visible label still round-trips, re-derived from the restored
    // `statblockId` rather than carried on the wire.
    expect(component.getParticipantStatblockLabel(restored))
      .toBe('PR 4 - Organized Crime Gang (Lieutenant, technomancer)');
  });

  it('IA23 - GM state payload for 20 templated participants including a six-member row stays under 64 KB', () => {
    for (let i = 0; i < 19; i++) {
      commitGruntAdd(`Solo ${i}`, { statblockId: ALL_GRUNT_STATBLOCKS[i % ALL_GRUNT_STATBLOCKS.length].id });
    }
    commitRowAdd('Big Row', 6, { statblockId: 'pr5-grunt' });
    const gmState = component['buildGmState']();
    expect(JSON.stringify(gmState).length).toBeLessThan(64 * 1024);
  });

  it('IA24 - editing a templated grunt\'s Body re-derives the track with no log naming the new maximum', () => {
    const g = commitGruntAdd('Troll Correction', { statblockId: 'pr5-grunt' });
    sent.length = 0;
    g.gruntBody = 9;
    // Literal expected value (defect D12, validator round - the previous
    // assertion compared against `gruntConditionMonitorBoxes(9,
    // g.gruntWillpower)`, the exact formula the production code itself
    // calls, so it would pass even with a wrong formula). PR 5 grunt
    // Willpower is 4 (pr5-grunt, `grunt-statblocks.ts`); 8 + ceil(max(9, 4)
    // / 2) = 8 + 5 = 13 (p. 379; matches scenario S9 in the rules spec).
    expect(g.gruntWillpower).toBe(4);
    expect(g.physicalHealth).toBe(13);
    expect(sent.length).toBe(0);
  });

  // ── IA26: Phase 3, U7 lieutenant tie-break ──────────────────────────────

  it('IA26 (revised, D4) - a lieutenant tied with his own team row sorts immediately before it via post-sort adjustment; the comparator itself is plain ERIC', () => {
    const row = commitRowAdd('Thugs', 4, { statblockId: 'pr0-grunt' });
    const boss = commitGruntAdd('Boss', { statblockId: 'pr0-lieutenant' });
    component.setLieutenantTeam(boss, row);

    row.baseIni = 10; row.setDicesWithoutRoll(0); row.currentInitiativeScore = 10;
    boss.baseIni = 10; boss.setDicesWithoutRoll(0); boss.currentInitiativeScore = 10;

    // D4 fix: the comparator itself no longer knows about the lieutenant
    // link at all - it is a plain, transitive ERIC ladder. Boss and row are
    // tied all the way down to Edge/Reaction/Intuition here (both from the
    // PR 0 pair, R3/I3/Edge0), so the comparator alone gives no guaranteed
    // order between them; the lieutenant rule is applied afterwards.
    const items = [ row, boss ];
    component['applyLieutenantPrecedence'](items);
    expect(items).toEqual([ boss, row ]);

    const otherRow = commitRowAdd('Other Thugs', 2, { statblockId: 'pr0-grunt' });
    otherRow.baseIni = 10; otherRow.setDicesWithoutRoll(0); otherRow.currentInitiativeScore = 10;
    expect(component['isLieutenantOf'](boss, otherRow)).toBeFalse();
    // Not this lieutenant's team - `applyLieutenantPrecedence` does not move
    // him relative to `otherRow` at all.
    const unrelated = [ otherRow, boss ];
    component['applyLieutenantPrecedence'](unrelated);
    expect(unrelated).toEqual([ otherRow, boss ]);
  });

  it('D4 regression - lieutenant tie-break no longer produces a non-transitive 3-cycle', () => {
    // Exact repro from the validator report: a lieutenant at effective
    // Reaction 7 / Intuition 5, linked to a row at Reaction 8 / Intuition 6,
    // plus an unrelated participant at Reaction 7 / Intuition 6 - all tied on
    // Score, all Edge 0.
    const lt = commitParticipantAdd('Lieutenant');
    const row = commitRowAdd('Squad', 2);
    const third = commitParticipantAdd('Rival');

    component['participantEdgeRatings'].set(lt, 0);
    component['participantReactions'].set(lt, 7);
    component['participantIntuitions'].set(lt, 5);
    component['participantEdgeRatings'].set(row, 0);
    component['participantReactions'].set(row, 8);
    component['participantIntuitions'].set(row, 6);
    component['participantEdgeRatings'].set(third, 0);
    component['participantReactions'].set(third, 7);
    component['participantIntuitions'].set(third, 6);
    for (const p of [ lt, row, third ]) {
      p.baseIni = 0;
      p.setDicesWithoutRoll(0);
      p.currentInitiativeScore = 10;
    }
    component.setLieutenantTeam(lt, row);

    const cmp = component['initiativeTieBreakComparator'].bind(component);
    // The plain ERIC ladder (Reaction, then Intuition) is transitive on its
    // own: row (R8) beats third (R7/I6) beats lt (R7/I5), and critically
    // row also beats lt directly - no contradiction. Under the OLD pairwise
    // override, `cmp(row, lt)` returned *positive* here (lt before row, by
    // the lieutenant clause), directly contradicting "row < third < lt" and
    // producing the reported 3-cycle.
    expect(cmp(row, third)).toBeLessThan(0);
    expect(cmp(third, lt)).toBeLessThan(0);
    expect(cmp(row, lt)).toBeLessThan(0);

    // The p. 381 rule still applies - as a post-sort adjustment, not inside
    // the (now-transitive) comparator. The lieutenant ends up ahead of
    // 'Rival' here even though the plain ERIC ladder puts Rival ahead of him
    // (cmp(third, lt) above) - a deliberate leapfrog, not a bug (RULINGS.md
    // 2026-08-30, "A lieutenant's tie-break precedence applies against
    // everyone, not just his own team": "if it's a fair leapfrog then it's
    // fair").
    CombatManager.started = true;
    component.sort();
    const order = items().filter(p => [ lt, row, third ].includes(p)).map(p => p.name);
    expect(order).toEqual([ 'Lieutenant', 'Squad', 'Rival' ]);

    // Stable across repeated re-sorts - nothing cycles.
    component.sort();
    const order2 = items().filter(p => [ lt, row, third ].includes(p)).map(p => p.name);
    expect(order2).toEqual(order);
  });

  it('defect 1 (fix round 2) - applyLieutenantPrecedence never demotes a lieutenant already ahead of his row', () => {
    // The old guard was `lieutenantIndex === rowIndex - 1` - it only
    // recognised "already immediately adjacent" as done, so a lieutenant who
    // is already several places ahead of his row (but with someone else's
    // participant legitimately sorted between them by plain ERIC) got
    // spliced out and reinserted right before the row, moving him *behind*
    // whoever ERIC had already placed between him and his row. That is a
    // demotion the rule (p. 381: the lieutenant only ever needs to beat his
    // own tied team) never calls for.
    const lt = commitParticipantAdd('Boss');
    const between = commitParticipantAdd('Between');
    const row = commitRowAdd('Squad', 2);

    // ERIC-decided order, all tied on Score/Edge: Boss (R9) ahead of Between
    // (R8) ahead of Squad (R7) - Boss is already two places ahead of his row.
    component['participantEdgeRatings'].set(lt, 0);
    component['participantReactions'].set(lt, 9);
    component['participantIntuitions'].set(lt, 5);
    component['participantEdgeRatings'].set(between, 0);
    component['participantReactions'].set(between, 8);
    component['participantIntuitions'].set(between, 5);
    component['participantEdgeRatings'].set(row, 0);
    component['participantReactions'].set(row, 7);
    component['participantIntuitions'].set(row, 5);
    for (const p of [ lt, between, row ]) {
      p.baseIni = 0;
      p.setDicesWithoutRoll(0);
      p.currentInitiativeScore = 10;
    }
    component.setLieutenantTeam(lt, row);

    const items3 = [ lt, between, row ]; // already the correct ERIC order
    component['applyLieutenantPrecedence'](items3);
    // Boss must stay ahead of Between, not get spliced to sit immediately
    // before Squad (which would push him behind Between).
    expect(items3).toEqual([ lt, between, row ]);
  });

  it('D1 regression, re-based on RULINGS.md 2026-08-30 - the deferred Tab-added join line fires on entering a rolled initiative order, never on a keystroke, never on blur/Enter', () => {
    // The original D1 defect: typing "Cayman" announced the combatant after
    // the very first letter, because the trigger was a per-keystroke
    // handler. Three later rounds moved the trigger to blur/Enter instead
    // and still failed (a confirmation pop-up blurs the name box an instant
    // before a Cancel/Delete removes the combatant it names). RULINGS.md
    // 2026-08-30 replaces the trigger entirely: entering a *rolled*
    // initiative order, the one moment nothing about focus can spoof.
    const p = component.addParticipant(); // Tab-to-add's own creation path
    component['queueJoinAnnouncement'](p, (participant: IParticipant) =>
      ({ actor: participant.name || 'Combatant', text: 'joined the fight.' }));
    sent.length = 0;
    let typed = '';
    for (const ch of 'Cayman') {
      typed += ch;
      p.name = typed;
      component.onParticipantUpdated(); // the per-keystroke ngModelChange handler
      expect(sent.length).toBe(0); // no announcement mid-typing - the original bug
    }

    // Blur/Enter alone - no roll - fires nothing at all any more. There is
    // no `onParticipantNameCommitted` left to call, and the template's own
    // name input has no `(blur)`/`(keydown.enter)` binding left at all
    // (item 1 fix) - blur it for real, on the actual rendered row, and
    // confirm nothing happens.
    fixture.detectChanges();
    const index = component.combatManager.participants.items.indexOf(p);
    const nameInput = fixture.nativeElement.querySelector(
      '#participant' + index + ' input[name="name"]'
    ) as HTMLInputElement;
    expect(nameInput).withContext('rendered name input').toBeTruthy();
    nameInput.dispatchEvent(new Event('blur'));
    nameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(sent.length).toBe(0);

    // Rolling Initiative is the only thing that fires it.
    rollFor(p);
    expect(sent.length).toBeGreaterThanOrEqual(1);
    const joinLine = sent.find(e => e.text === 'joined the fight.');
    expect(joinLine).withContext('join line').toBeTruthy();
    expect(joinLine!.actor).toBe('Cayman');

    // Never fires twice: a second roll-adjacent write (a manual rolled-total
    // edit) does not re-announce - the participant no longer owes a line.
    const sentAfterFirstRoll = sent.length;
    component.onParticipantRolledTotalChanged(p, p.diceIni + 1);
    expect(sent.filter(e => e.text === 'joined the fight.').length).toBe(1);
    expect(sent.length).toBe(sentAfterFirstRoll); // the edit itself logs separately or not at all here, but no second join line
  });

  it('item 1 fix (fix round 3) - a combatant created and deleted before initiative is ever rolled is never announced', () => {
    // The whole point of the ruling: a combatant that never entered a rolled
    // initiative order at all leaves no trace in the log.
    const p = component.addParticipant();
    component['queueJoinAnnouncement'](p, (participant: IParticipant) =>
      ({ actor: participant.name || 'Combatant', text: 'joined the fight.' }));
    p.name = 'Ephemeral';
    component.onParticipantUpdated();
    sent.length = 0;

    component['forgetParticipant'](p);
    component.combatManager.removeParticipant(p);
    expect(sent.length).toBe(0);
    // The queue entry itself is gone too (forget-drop obligation) - nothing
    // left that could fire later even if the object were somehow reused.
    expect(component['pendingJoinAnnouncement'].has(p)).toBeFalse();
  });

  it('item 1 fix (fix round 4) - a row member added to a still-unrolled row, then REMOVED before the row ever rolls, never gets a "joined the group" line when the row later rolls', async () => {
    // Live-table scenario from the fix-round-4 brief: GM builds a Grunt
    // Group, taps Add NPC three times, changes their mind about the third
    // and removes it, then rolls the row. Only two grunts ever fought;
    // the third must leave no "joined" trace at all, only the removal line.
    const row = component.addNpcRow(false);
    row.name = 'Gangers';
    const g1 = component.addNpcToRow(row, 'Gangers G 1');
    const g2 = component.addNpcToRow(row, 'Gangers G 2');
    const g3 = component.addNpcToRow(row, 'Gangers G 3');
    expect(row.members).toEqual([ g1, g2, g3 ]);
    sent.length = 0;

    spyOn(component['confirmationDialog'], 'simpleConfirm').and.resolveTo(true);
    await component.removeRowMember(row, g3);
    expect(row.members).toEqual([ g1, g2 ]);
    expect(sent.filter(e => e.text === 'Gangers G 3 removed from the row').length).toBe(1);

    rollFor(row);
    // The bug: without pruning, this would fire "Gangers G 3 joined the
    // group." here - after the removal line, for someone not in the fight.
    expect(sent.filter(e => e.text.includes('Gangers G 3') && e.text.includes('joined')).length)
      .toBe(0);
    // Every mention of G 3 in the log is the removal line and nothing else.
    const g3Mentions = sent.filter(e => e.text.includes('Gangers G 3'));
    expect(g3Mentions.length).toBe(1);
    expect(g3Mentions[0].text).toBe('Gangers G 3 removed from the row');
    // The two members who are actually still in the row still announce
    // normally - the fix must not have collateral-damaged their entries.
    expect(sent.some(e => e.text === 'Gangers G 1 joined the group.')).toBeTrue();
    expect(sent.some(e => e.text === 'Gangers G 2 joined the group.')).toBeTrue();
  });

  it('item 1 fix (fix round 4) - a row member added to a still-unrolled row, then DETACHED before the row ever rolls, never gets a "joined the group" line, and is not re-announced separately when the row later rolls', () => {
    // Same live-table scenario, but the GM detaches G 3 onto his own row
    // instead of deleting him outright - he is still in the fight. The
    // stale "joined the group" line must still never fire (he is no longer
    // in the group), and the log must not carry a second "joined" line for
    // him either: the unconditional "detached ... onto their own initiative"
    // line already told the table he is present.
    const row = component.addNpcRow(false);
    row.name = 'Gangers';
    const g1 = component.addNpcToRow(row, 'Gangers G 1');
    const g2 = component.addNpcToRow(row, 'Gangers G 2');
    const g3 = component.addNpcToRow(row, 'Gangers G 3');
    sent.length = 0;

    const detached = component.detachRowMember(row, g3);
    expect(detached).toBeTruthy();
    expect(row.members).toEqual([ g1, g2 ]);
    const detachLines = sent.filter(e => e.text.includes('detached from the row'));
    expect(detachLines.length).toBe(1);
    expect(detachLines[0].text).toBe('Gangers G 3 detached from the row onto their own initiative');

    rollFor(row);
    // The bug: without pruning, this fires "Gangers G 3 joined the group."
    // here - after the "detached" line, for someone who left the group.
    expect(sent.filter(e => e.text.includes('Gangers G 3') && e.text.includes('joined')).length)
      .toBe(0);

    // Chosen behaviour (see `detachRowMember`'s own comment): the detached
    // NPC is not re-announced under new wording when his own Initiative Test
    // later resolves either - the detach line already told the table he is
    // present, and a second "joined" line for the same NPC would be exactly
    // the doubled announcement RULINGS.md 2026-08-30 exists to prevent.
    rollFor(detached!);
    expect(sent.filter(e => e.text.includes('Gangers G 3')).length).toBe(1); // the detach line only
    expect(sent.some(e => e.text.includes('Gangers G 3') && e.text.includes('joined'))).toBeFalse();

    // The two members who stayed in the group still announce normally.
    expect(sent.some(e => e.text === 'Gangers G 1 joined the group.')).toBeTrue();
    expect(sent.some(e => e.text === 'Gangers G 2 joined the group.')).toBeTrue();
  });

  it('defect 9 (fix round 2), re-based on RULINGS.md 2026-08-30 - a still-blank Tab-added row gets a default name at the moment it is rolled, and is announced exactly once', () => {
    // Superseded by defect 9: an earlier fix round had a blank commit fall
    // back to a default name and announce right away ("Combatant 1 joined
    // the fight."), which meant simply tabbing through an empty Tab-added
    // row spammed the shared log. Under the new choke point there is no
    // "commit" event left to spam on every Tab press - the only remaining
    // question is what happens if a still-blank row is the one that gets
    // rolled (batch "Roll Outstanding", say, catching a row the GM never
    // got around to naming). It gets the same "default name, unique in the
    // encounter" treatment every other add path already has, rather than
    // entering the fight under no name at all.
    const p = component.addParticipant();
    component['queueJoinAnnouncement'](p, (participant: IParticipant) => {
      const t = (participant.name || '').trim();
      const actor = t || component['nextStandaloneParticipantName']();
      if (!t) participant.name = actor;
      return { actor, text: 'joined the fight.' };
    });
    sent.length = 0;

    rollFor(p); // still unnamed at the moment it is rolled
    const joinLines = sent.filter(e => e.text === 'joined the fight.');
    expect(joinLines.length).toBe(1);
    expect(joinLines[0].actor).toBe('Combatant 1');
    expect(p.name).toBe('Combatant 1');

    // Never fires twice for the same participant.
    component.onParticipantRolledTotalChanged(p, p.diceIni + 1);
    expect(sent.filter(e => e.text === 'joined the fight.').length).toBe(1);
  });

  it('D2 regression - confirming Add Participant with a blank name uses a unique default; the join line is queued, then written once each is rolled (amended by RULINGS.md 2026-08-30)', () => {
    sent.length = 0;
    const p1 = commitParticipantAdd('');
    const p2 = commitParticipantAdd('');
    expect(p1.name).toBe('Combatant 1');
    expect(p2.name).toBe('Combatant 2');
    // Named at commit, but not yet announced - nothing is sent until each
    // one actually enters a rolled initiative order.
    expect(sent.length).toBe(0);

    rollFor(p1);
    const afterP1Roll = sent.filter(e => e.text === 'joined the fight.');
    expect(afterP1Roll.length).toBe(1);
    expect(afterP1Roll[0].actor).toBe('Combatant 1');

    rollFor(p2);
    const afterP2Roll = sent.filter(e => e.text === 'joined the fight.');
    expect(afterP2Roll.length).toBe(2);
    expect(afterP2Roll[1].actor).toBe('Combatant 2');

    // Own namespace - never collides with a grunt, a row or a row member.
    expect(component['nextStandaloneGruntName']()).toBe('Grunt 1');
  });

  it('D6 regression - a lieutenant template cannot be instantiated into a shared row', () => {
    component.btnAddNpcRow_Click();
    expect(component.statblockOptionsForDraft().some(sb => sb.kind === 'lieutenant')).toBeFalse();
    component.pendingAddDraft!.name = 'Bad Squad';
    component.pendingAddDraft!.count = 3;
    // Bypasses the UI filter directly, the way a defensive test has to.
    component.pendingAddDraft!.statblockId = 'pr0-lieutenant';
    expect(() => component.commitAddDraft()).toThrow();
    expect(items().find(p => p.name === 'Bad Squad')).toBeUndefined();
  });

  it('D7 regression - duplicating a lieutenant does not copy the team-row link', () => {
    const row = commitRowAdd('Thugs', 4, { statblockId: 'pr0-grunt' });
    const boss = commitGruntAdd('Boss', { statblockId: 'pr0-lieutenant' });
    component.setLieutenantTeam(boss, row);
    expect(component['isLieutenantOf'](boss, row)).toBeTrue();

    component.btnDuplicate_Click(boss);
    const clone = items().find(p => p.name === 'Boss 2')!;
    expect(clone).toBeTruthy();
    expect(component['isLieutenantOf'](clone, row)).toBeFalse();
    expect(component['participantLieutenantTeamRowId'].has(clone)).toBeFalse();
    // The source's own link survives the duplicate (only the clone is unlinked).
    const source = items().find(p => p.name === 'Boss 1')!;
    expect(component['isLieutenantOf'](source, row)).toBeTrue();
  });

  it('defect 5 (fix round 2) - merging standalone grunts that are ALL lieutenant-imprinted is refused, never producing an all-lieutenant row', () => {
    const boss1 = commitGruntAdd('Boss One', { statblockId: 'pr1-lieutenant' });
    const boss2 = commitGruntAdd('Boss Two', { statblockId: 'pr2-lieutenant' });
    component.toggleMergeSelection(boss1);
    component.toggleMergeSelection(boss2);

    const before = items().length;
    const result = component.mergeSelectedGrunts('All Bosses');

    expect(result.ok).toBeFalse();
    expect(result.row).toBeNull();
    expect(items().length).toBe(before); // nothing was created
    expect(names()).toContain('Boss One');
    expect(names()).toContain('Boss Two'); // neither grunt was consumed
    expect(component.mergeMessage).toContain('lieutenant');
  });

  it('item 6 fix (fix round 3) - a MIXED selection (one lieutenant, one ordinary grunt) is also refused, naming the offender', () => {
    // Previously only an ALL-lieutenant selection was refused; a mixed
    // selection folded the lieutenant into the row's single shared
    // Initiative Score and shared Condition Monitor anyway (p. 381: a
    // lieutenant has his own attributes and his own Initiative Test).
    const boss = commitGruntAdd('Boss One', { statblockId: 'pr1-lieutenant' });
    const ganger = commitGruntAdd('Ganger', { statblockId: 'pr1-grunt' });
    component.toggleMergeSelection(boss);
    component.toggleMergeSelection(ganger);

    const before = items().length;
    const result = component.mergeSelectedGrunts('Mixed Squad');

    expect(result.ok).toBeFalse();
    expect(result.row).toBeNull();
    expect(items().length).toBe(before); // nothing was created
    expect(names()).toContain('Boss One');
    expect(names()).toContain('Ganger'); // neither grunt was consumed
    // Names the offender, not just "a lieutenant is in here somewhere".
    expect(result.reason).toContain('Boss One');
    expect(component.mergeMessage).toContain('Boss One');

    // Untick the offender: the remaining ordinary grunts merge normally.
    component.toggleMergeSelection(boss);
    const ganger2 = commitGruntAdd('Ganger Two', { statblockId: 'pr1-grunt' });
    component.toggleMergeSelection(ganger2);
    const retry = component.mergeSelectedGrunts('Ganger Squad');
    expect(retry.ok).toBeTrue();
    expect(retry.row).toBeTruthy();
  });

  it('item 6 fix (fix round 3) - a hand-linked (not template-imprinted) lieutenant/team-row link also refuses the merge, and forgetParticipant never silently drops it', () => {
    // `setLieutenantTeam` is not restricted to lieutenant-imprinted grunts -
    // the "Lieutenant of" control is offered for any grunt-shaped
    // participant. A hand-built grunt the GM has linked to a row is making
    // his own tie-break-relevant Initiative Test the same way a templated
    // lieutenant does.
    const row = commitRowAdd('Squad', 2, { statblockId: 'pr1-grunt' });
    const handLinked = commitGruntAdd('Fixer');
    component.setLieutenantTeam(handLinked, row);
    expect(component['isLieutenantOf'](handLinked, row)).toBeTrue();

    const ganger = commitGruntAdd('Ganger', { statblockId: 'pr1-grunt' });
    component.toggleMergeSelection(handLinked);
    component.toggleMergeSelection(ganger);

    const before = items().length;
    const result = component.mergeSelectedGrunts('Should Not Form');

    expect(result.ok).toBeFalse();
    expect(result.row).toBeNull();
    expect(items().length).toBe(before);
    // Not silently dropped: the link survives because the merge never ran.
    expect(component['isLieutenantOf'](handLinked, row)).toBeTrue();
    expect(component['participantLieutenantTeamRowId'].has(handLinked)).toBeTrue();
    expect(result.reason).toContain('Fixer');
  });

  it('item 9 fix (fix round 3) - deleting a row clears every dangling lieutenant/team-row link that pointed at it', () => {
    const row = commitRowAdd('Squad', 2, { statblockId: 'pr1-grunt' });
    const boss = commitGruntAdd('Boss', { statblockId: 'pr1-lieutenant' });
    component.setLieutenantTeam(boss, row);
    expect(component['isLieutenantOf'](boss, row)).toBeTrue();

    // Delete the linked row (not the lieutenant) - the boss survives, but
    // his link now points at nothing.
    component['forgetParticipant'](row);
    component.combatManager.removeParticipant(row);

    expect(names()).toContain('Boss'); // the lieutenant himself is untouched
    expect(component['participantLieutenantTeamRowId'].has(boss)).toBeFalse();
  });

  it('D8 regression - a Grunt Group\'s member count is floored at 1 and capped against a fat-fingered entry', () => {
    const zero = commitRowAdd('Empty Squad', 0);
    expect(zero.members.length).toBe(1);
    const huge = commitRowAdd('Huge Squad', 250);
    expect(huge.members.length).toBe(50);
  });

  it('D9 regression - opening then cancelling any add dialog writes no entry to the local Action Log', () => {
    const openers: Array<() => void> = [
      () => component.btnAddParticipant_Click(),
      () => component.btnAddGrunt_Click(),
      () => component.btnAddNpcRow_Click(),
      () => component.btnMergeSelectedGrunts_Click()
    ];
    for (const open of openers) {
      const before = component.logHandler.logbook.length;
      open();
      component.cancelAddDraft();
      expect(component.logHandler.logbook.length).toBe(before);
    }
    const row = commitRowAdd('Existing Row', 1);
    const beforeRowNpc = component.logHandler.logbook.length;
    component.btnAddNpcToRow_Click(row);
    component.cancelAddDraft();
    expect(component.logHandler.logbook.length).toBe(beforeRowNpc);
  });

  it('item 1 fix (fix round 3) - a focus-steal on Delete no longer matters at all: typing a name then deleting an unrolled row writes no join line, and the round-2 mousedown workaround is gone', async () => {
    // The defect this superseded (defect 8, fix round 2): the join line used
    // to fire on blur, and a native mousedown on the Delete button blurs
    // whatever was focused BEFORE the button's own click handler runs -
    // typing a name into a Tab-added row and clicking Delete straight away
    // therefore committed a join line an instant before the participant it
    // named was removed. Round 2's fix suppressed the mousedown's default
    // action so the blur never happened. That workaround is now gone
    // (RULINGS.md 2026-08-30): there is no blur-triggered commit left to
    // protect against, since the join line only ever fires the first time a
    // combatant has a rolled Initiative Score - an unrolled, deleted
    // combatant was never going to be announced regardless of focus.
    const p = component.addParticipant();
    p.name = 'Cayman';
    fixture.detectChanges();
    const index = component.combatManager.participants.items.indexOf(p);
    const row = fixture.nativeElement.querySelector('#participant' + index) as HTMLElement;
    const deleteBtn = row.querySelector('button.btn-danger.gm-trailing-icon') as HTMLButtonElement;

    // The workaround's own suppression is gone: a mousedown on Delete is no
    // longer prevented (nothing left needing that suppression).
    const md = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    deleteBtn.dispatchEvent(md);
    expect(md.defaultPrevented).toBeFalse();

    sent.length = 0;
    spyOn(component['confirmationDialog'], 'simpleConfirm').and.resolveTo(true);
    deleteBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component['participantIds'].has(p)).toBeFalse();
    // Never rolled, so never announced - deleted before it ever entered a
    // rolled initiative order.
    expect(sent.length).toBe(0);
  });

  it('defect 10 (fix round 2) - the "Lieutenant of" dropdown is offered for a grunt, not for a player character', () => {
    const row = commitRowAdd('Ancients', 2, { statblockId: 'pr1-grunt' });
    const boss = commitGruntAdd('Boss', { statblockId: 'pr1-lieutenant' });
    const pc = commitParticipantAdd('Cayman');

    function statsTabHasLieutenantDropdown(p: IParticipant): boolean {
      component.selectActor(p);
      fixture.detectChanges();
      const links = Array.from(
        fixture.nativeElement.querySelectorAll('.detailsBar nav button')
      ) as HTMLButtonElement[];
      const stats = links.find(b => (b.textContent || '').trim() === 'Stats');
      expect(stats).withContext('Stats tab button').toBeTruthy();
      stats!.click();
      fixture.detectChanges();
      return fixture.nativeElement.querySelector('[data-testid="lieutenant-team-row-select"]') !== null;
    }

    expect(statsTabHasLieutenantDropdown(boss)).toBeTrue();
    expect(statsTabHasLieutenantDropdown(pc)).toBeFalse();
  });

  it('defect 10 (fix round 2) - a lieutenant linked to a row shows a visible LIEUTENANT badge in the roster', () => {
    const row = commitRowAdd('Ancients', 2, { statblockId: 'pr1-grunt' });
    const boss = commitGruntAdd('Boss', { statblockId: 'pr1-lieutenant' });
    fixture.detectChanges();

    function badgeFor(p: IParticipant): string | null {
      const index = component.combatManager.participants.items.indexOf(p);
      const rowEl = fixture.nativeElement.querySelector('#participant' + index) as HTMLElement;
      return rowEl.querySelector('[data-testid="badge-lieutenant"]') ? 'lieutenant'
        : rowEl.querySelector('[data-testid="badge-grunt"]') ? 'grunt'
        : null;
    }

    // Not yet linked: reads as an ordinary grunt.
    expect(badgeFor(boss)).toBe('grunt');

    component.setLieutenantTeam(boss, row);
    fixture.detectChanges();
    expect(badgeFor(boss)).toBe('lieutenant');

    // Item 5 fix (fix round 3): the earlier version of this test only
    // checked the badge *element* existed - `.participant-badge-lieutenant`
    // had no matching CSS rule at all, so it rendered as bare unstyled text
    // next to the properly-coloured GROUP/GRUNT chips. Real computed styles
    // via Karma/Chrome, not a string comparison against the stylesheet
    // source - this fails exactly the way it would have before the CSS
    // rule was added.
    const lieutenantBadgeEl = fixture.nativeElement.querySelector(
      '[data-testid="badge-lieutenant"]'
    ) as HTMLElement;
    expect(lieutenantBadgeEl).withContext('LIEUTENANT badge element').toBeTruthy();
    const lieutenantStyle = getComputedStyle(lieutenantBadgeEl);
    // An element with no matching CSS rule computes a fully transparent
    // background - this is the exact failure mode being guarded against.
    expect(lieutenantStyle.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(lieutenantStyle.backgroundColor).not.toBe('');

    // And distinct from the GRUNT badge's colour, not just "some colour" -
    // otherwise a rule that accidentally reused `.participant-badge-grunt`'s
    // colours would still pass the two checks above.
    const grunt2 = commitGruntAdd('PlainGrunt', { statblockId: 'pr1-grunt' });
    fixture.detectChanges();
    const grunt2Index = component.combatManager.participants.items.indexOf(grunt2);
    const gruntBadgeEl = fixture.nativeElement.querySelector(
      '#participant' + grunt2Index + ' [data-testid="badge-grunt"]'
    ) as HTMLElement;
    expect(gruntBadgeEl).withContext('GRUNT badge element').toBeTruthy();
    expect(lieutenantStyle.backgroundColor).not.toBe(getComputedStyle(gruntBadgeEl).backgroundColor);
  });

  it('D12 - GM reconnect round trip preserves the lieutenant/team-row link', () => {
    const row = commitRowAdd('Ancients', 4, { statblockId: 'pr1-grunt' });
    const boss = commitGruntAdd('Ancients Boss', { statblockId: 'pr1-lieutenant' });
    component.setLieutenantTeam(boss, row);
    expect(component['isLieutenantOf'](boss, row)).toBeTrue();

    const gmState = component['buildGmState']();
    const shared = { round: 1, pass: 1, participants: component['getSharedParticipants']() };
    component['restoreFromSharedState'](shared, gmState);

    const restoredRow = items().find(p => p.name === 'Ancients') as NpcRowParticipant;
    const restoredBoss = items().find(p => p.name === 'Ancients Boss') as IParticipant;
    expect(restoredRow).toBeTruthy();
    expect(restoredBoss).toBeTruthy();
    expect(component['isLieutenantOf'](restoredBoss, restoredRow)).toBeTrue();
  });

  // ── Gameplay scenarios ───────────────────────────────────────────────────

  it('IS1 (amended, RULINGS.md 2026-08-30) - ordinary case: naming on add fixes the reported defect; the join line follows the first roll', () => {
    placeholder(); // the constructor's own blank row, on a real fresh tab
    component.btnAddGrunt_Click();
    expect(component.combatManager.participants.count).toBe(1); // placeholder only
    expect(sent.length).toBe(0);
    component.pendingAddDraft!.name = 'Halloweener Torch';
    component.commitAddDraft();
    expect(component.combatManager.participants.count).toBe(2);
    // Named at commit, but not announced yet - it has not entered a rolled
    // initiative order.
    expect(sent.length).toBe(0);
    const grunt = items()[items().length - 1];
    rollFor(grunt);
    const addedLines = sent.filter(e => e.text === 'added.');
    expect(addedLines.length).toBe(1);
    expect(addedLines[0].actor).toBe('Halloweener Torch');
    expect(JSON.stringify(sent)).not.toContain('Grunt 1');
  });

  it('IS2 - cancel is total', () => {
    placeholder(); // the constructor's own blank row, on a real fresh tab
    const before = snapshotRoster();
    const broadcastSpy = spyOn(sync, 'broadcastState');
    component.btnAddParticipant_Click();
    component.pendingAddDraft!.name = 'Typed and then abandoned';
    component.cancelAddDraft();
    expect(snapshotRoster()).toEqual(before);
    expect(broadcastSpy).not.toHaveBeenCalled();
    expect(sent.length).toBe(0);
    expect(component['isUnusedPlaceholder'](items()[0])).toBeTrue();
  });

  it('IS3 - blank name, three namespaces held apart', () => {
    commitGruntAdd('');
    commitGruntAdd('');
    const row = commitRowAdd('', 2);
    expect(names()).toContain('Grunt 1');
    expect(names()).toContain('Grunt 2');
    expect(row.name).toBe('Grunt Group');
    expect(row.members.map(m => m.name)).toEqual(['NPC 1', 'NPC 2']);
    // No two live top-level participants share a non-empty name.
    const nonEmpty = names().filter(n => n !== '');
    expect(new Set(nonEmpty).size).toBe(nonEmpty.length);
  });

  it('IS4 (amended, RULINGS.md 2026-08-30) - correction is free: rename before rolling does not log twice under either name; a rolled-then-renamed line keeps its already-fired wording; delete-and-readd reuses the vacated default number', async () => {
    const g = commitGruntAdd('Wrong Name');
    expect(sent.length).toBe(0); // not yet rolled - not yet announced
    // Renaming before ever rolling: the (still-unfired) queued line will
    // read whichever name is current when it actually fires - no
    // "Wrong Name" line is ever written at all.
    g.name = 'Right Name';
    component.onParticipantUpdated();
    expect(sent.length).toBe(0);
    rollFor(g);
    const addedLines = sent.filter(e => e.text === 'added.');
    expect(addedLines.length).toBe(1);
    expect(addedLines[0].actor).toBe('Right Name'); // never "Wrong Name" - it was never sent
    const sentAfterRoll = sent.length;

    // Renaming again AFTER the line has already fired does not re-announce
    // or retroactively rewrite it - the log is append-only (IS4's original
    // point survives the re-basing).
    g.name = 'Renamed Again';
    component.onParticipantUpdated();
    expect(sent.filter(e => e.text === 'added.').length).toBe(1);
    expect(sent.length).toBe(sentAfterRoll);

    spyOn(component['confirmationDialog'], 'simpleConfirm').and.resolveTo(true);
    await component.btnDelete_Click(g);
    expect(component['participantIds'].has(g)).toBeFalse();
    const g2 = commitGruntAdd('Right Name');
    rollFor(g2);
    expect(sent.filter(e => e.text === 'added.').length).toBe(2);
    // Neither grunt is named "Grunt N" (both were explicitly named), so the
    // next default is "Grunt 1" - no orphaned number left behind by the delete.
    expect(component['nextStandaloneGruntName']()).toBe('Grunt 1');
  });

  it('IS5 - reinforcements arrive mid-combat: dialog opens mid-pass, joiner is Score-neutral, no CM maximum in the log', () => {
    CombatManager.started = true;
    CombatManager.initiativePass = 2;
    const row = commitRowAdd('Ancients', 4, { statblockId: 'pr1-grunt' });
    // The row has already taken its own Initiative Test this Combat Turn -
    // the precondition Decision 7's Score-neutral joiner rule (and, per
    // RULINGS.md 2026-08-30, this reinforcement's *own* immediate
    // announcement) depends on: a joiner onto an unrolled row would instead
    // have its join line queued until the row's own first roll.
    rollFor(row);
    sent.length = 0;
    row.applyDamageToMember(row.members[2], 3, 'physical');
    const scoreBefore = row.getCurrentInitiative();
    const broadcastsBefore = 0;
    const broadcastSpy = spyOn(sync, 'broadcastState');

    component.btnAddNpcToRow_Click(row);
    expect(broadcastSpy.calls.count()).toBe(broadcastsBefore);
    component.pendingAddDraft!.name = 'Ancients 5';
    component.commitAddDraft();

    expect(row.members.length).toBe(5);
    expect(row.getCurrentInitiative()).toBe(scoreBefore);
    const joinLine = sent.find(e => e.text.includes('joined the group'));
    expect(joinLine).toBeTruthy();
    expect(joinLine!.text).toBe('Ancients 5 joined the group.');
    expect(joinLine!.text).not.toMatch(/\d+\/\d+/);
  });

  it('IS6 - template instantiation produces a derived, not a printed, box count; nothing about the template reaches players', () => {
    const row = commitRowAdd('Ancients', 4, { statblockId: 'pr1-grunt', augmented: true });
    expect(row.members.length).toBe(4);
    expect(row.members[0].conditionMonitorBoxes).toBe(10); // B4/W3 -> 8 + ceil(4/2)
    expect(component['participantReactions'].get(row)).toBe(3);
    expect(component['participantIntuitions'].get(row)).toBe(3);
    expect(row.baseIni).toBe(6);
    expect(row.dices).toBe(1);
    expect(component['participantEdgeRatings'].get(row)).toBe(0);
    expect(component['participantStatblocks'].get(row)?.id).toBe('pr1-grunt');

    const lt = commitGruntAdd('Vitos Wire', { statblockId: 'pr4-lieutenant' });
    expect(lt.physicalHealth).toBe(11); // NOT the printed 10
    expect(getStatblockById('pr4-lieutenant')!.notes.join(' ')).toContain('11');

    expect(JSON.stringify(component['getSharedParticipants']())).not.toMatch(/pr1-grunt|professionalRating/);
  });

  it('IS7 (corrected, defect 11) - GM rejoin round-trips the template imprint (grunt row AND lieutenant) and stays under the cap', () => {
    // The brief's IS7 pseudocode builds ~twenty templated participants
    // including a six-member row AND a paired lieutenant ("Ancients Boss",
    // pr1-lieutenant) detached onto his own row, then checks the
    // lieutenant's own round trip specifically (gruntBody, physicalHealth,
    // statblockId) - not just the row's. The version this replaces dropped
    // the lieutenant out of the test entirely and never reached 20
    // participants, so it silently stopped covering the harder of the two
    // cases (a standalone lieutenant linked to a row via
    // `participantLieutenantTeamRowId`, U7) while still claiming to. The
    // `getStatblockReference(...).gear` assertion in the original pseudocode
    // is dropped, not replaced - D-X2 struck reference text/gear entirely, so
    // there is nothing left to re-hydrate.
    for (let i = 0; i < 18; i++) {
      commitGruntAdd(`Solo ${i}`, { statblockId: ALL_GRUNT_STATBLOCKS[i % ALL_GRUNT_STATBLOCKS.length].id });
    }
    const row = commitRowAdd('Ancients', 6, { statblockId: 'pr1-grunt' });
    const boss = commitGruntAdd('Ancients Boss', { statblockId: 'pr1-lieutenant' });
    component.setLieutenantTeam(boss, row);
    // 18 solos + 1 row (headcount 6) + 1 lieutenant = 20 templated
    // participants including the one six-member row (brief IA23's exact
    // shape), reached here as a gameplay scenario rather than a synthetic
    // loop.
    expect(items().length).toBe(20);

    const gmState = component['buildGmState']();
    expect(JSON.stringify(gmState).length).toBeLessThan(64 * 1024);
    const shared = { round: 1, pass: 1, participants: component['getSharedParticipants']() };
    component['restoreFromSharedState'](shared, gmState);

    const restoredRow = items().find(p => p.name === 'Ancients') as NpcRowParticipant;
    expect(restoredRow).toBeTruthy();
    expect(restoredRow.members.length).toBe(6);
    expect(component['participantStatblocks'].get(restoredRow)?.id).toBe('pr1-grunt');
    expect(getStatblockById(component['participantStatblocks'].get(restoredRow)!.id)).toBeTruthy();

    const restoredBoss = items().find(p => p.name === 'Ancients Boss') as DetachedGruntParticipant;
    expect(restoredBoss).toBeTruthy();
    expect(hasGruntConditionMonitor(restoredBoss)).toBeTrue();
    expect(restoredBoss.gruntBody).toBe(4); // pr1-lieutenant: B4/W4
    expect(restoredBoss.physicalHealth).toBe(10); // 8 + ceil(max(4, 4) / 2)
    expect(component['participantStatblocks'].get(restoredBoss)?.id).toBe('pr1-lieutenant');
    // U7: the lieutenant/team-row link round-trips too, GM-only.
    expect(component['isLieutenantOf'](restoredBoss, restoredRow)).toBeTrue();
  });

  it('IS8 - Phase 3: the lieutenant tie-break, and its blast radius', () => {
    const row = commitRowAdd('Thugs', 4, { statblockId: 'pr0-grunt' }); // R3 I3, Edge 0
    const lt = commitGruntAdd('Boss', { statblockId: 'pr0-lieutenant' }); // R3 I3, Edge 0
    component.setLieutenantTeam(lt, row);
    const pc = commitParticipantAdd('Cayman');
    component['participantEdgeRatings'].set(pc, 3);
    component['participantReactions'].set(pc, 6);
    component['participantIntuitions'].set(pc, 5);

    for (const p of [row, lt, pc]) {
      p.baseIni = 0;
      p.setDicesWithoutRoll(0);
      p.currentInitiativeScore = 10;
    }
    // sort() only runs the tie-break comparator once combat has started -
    // before that it sorts by add order (sortOrder) instead.
    CombatManager.started = true;
    component.sort();
    const order = items().filter(p => [row, lt, pc].includes(p)).map(p => p.name);
    expect(order).toEqual(['Cayman', 'Boss', 'Thugs']);

    const otherRow = commitRowAdd('Other Thugs', 2, { statblockId: 'pr0-grunt' });
    otherRow.baseIni = 0;
    otherRow.setDicesWithoutRoll(0);
    otherRow.currentInitiativeScore = 10;
    expect(component['isLieutenantOf'](lt, otherRow)).toBeFalse();
  });

  // ── Pure factory functions (statblock-instantiation.ts), no TestBed needed ──

  describe('instantiateRowFromStatblock (pure)', () => {
    it('builds members with no box-count setter available (structurally derived)', () => {
      const sb = getStatblockById('pr1-grunt')!;
      const result = instantiateRowFromStatblock(sb, ['A', 'B', 'C']);
      expect(result.members.length).toBe(3);
      // Literal (defect D12, validator round - see IA13's comment for why):
      // pr1-grunt is Body 4 / Willpower 3, so 8 + ceil(max(4, 3) / 2) = 10.
      expect(sb.body).toBe(4);
      expect(sb.willpower).toBe(3);
      expect(result.members[0].conditionMonitorBoxes).toBe(10);
      expect((result.members[0] as unknown as Record<string, unknown>)['conditionMonitorBoxes']).toBeDefined();
    });
  });
});
