// Promoted scenarios for briefs/cyberpunk-name-generator-spec.md - the
// cyberpunk/Shadowrun-flavoured name generator reachable from the Add
// dialog, the grunt-group NPC name boxes, and the Matrix host/icon name
// boxes. Covers acceptance criteria 8-22 (the GM-component and Matrix-wiring
// half of the brief's acceptance criteria list) plus the brief's own
// "Scenarios to survive" NS1-NS6, walked step by step. AC 1-7 (the pure
// generator module) live in src/app/shared/name-generator.spec.ts.
//
// Not a rules change (brief "Not a rules change"): naming is a tracker
// affordance, not a rules mechanic (governing rule G14,
// briefs/grunt-naming-and-statblocks-spec.md:45).

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { BattleTrackerComponent } from 'app/battle-tracker/battle-tracker.component';
import { HierarchyEditorComponent } from 'app/matrix/hierarchy-editor/hierarchy-editor.component';
import { appConfig } from 'app/app.config';
import { CombatManager } from 'Combat';
import { GruntMember } from 'Grunts';
import { MatrixParticipant, MatrixHost } from 'Matrix';
import { AstralParticipant } from 'Magic';
import { MatrixStateService } from 'app/services/matrix-state.service';
import { SessionCommand, SessionSyncService, SharedLogEntry } from 'app/services/session-sync.service';
import {
  GeneratedNameKind,
  NAME_PATTERNS,
  WORD_LISTS,
  normaliseNameForComparison
} from 'app/shared/name-generator';

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

/**
 * Every string the corpus can produce for `kind`, by enumerating the
 * Cartesian product of each matching pattern's slots. Used to exhaust a
 * corpus deliberately (NS2) - not exported from `name-generator.ts`, since
 * "give me every possible output" is a test-only need, not a module
 * capability the app itself ever wants.
 */
function enumerateAllPossibleNames(kind: GeneratedNameKind): string[] {
  const patterns = NAME_PATTERNS.filter(p => p.kind === kind);
  const results: string[] = [];
  for (const pattern of patterns) {
    let combos: string[][] = [[]];
    for (const slot of pattern.slots) {
      const list = WORD_LISTS[slot] ?? [slot];
      const next: string[][] = [];
      for (const combo of combos) {
        for (const word of list) {
          next.push([...combo, word]);
        }
      }
      combos = next;
    }
    for (const combo of combos) {
      results.push(combo.join(pattern.join ?? ' ').trim());
    }
  }
  return results;
}

/** Every key that appears anywhere in a JSON-shaped value, recursively (AC 22). */
function collectKeys(value: unknown, out: Set<string> = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectKeys(item, out);
    }
  } else if (value && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) {
      out.add(key);
      collectKeys(v, out);
    }
  }
  return out;
}

describe('Cyberpunk name generator: GM component wiring (Part 1)', () => {
  let component: BattleTrackerComponent;
  let fixture: ComponentFixture<BattleTrackerComponent>;
  let sync: SessionSyncService;
  let sent: SharedLogEntry[];
  let commands: SessionCommand[];
  let broadcasts: jasmine.Spy;

  beforeEach(async () => {
    // Reset the singleton BEFORE the component is constructed: the
    // constructor unconditionally seeds one blank placeholder participant
    // (`addParticipant()`), and several scenarios below (NS1, AC15) depend
    // on that placeholder being the *only* thing in the encounter at start.
    resetCombat();

    await TestBed.configureTestingModule({
      imports: [BattleTrackerComponent],
      providers: appConfig.providers
    }).compileComponents();

    fixture = TestBed.createComponent(BattleTrackerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    sync = TestBed.inject(SessionSyncService);
    sent = [];
    commands = [];
    spyOn(sync, 'appendLog').and.callFake((entry: SharedLogEntry) => { sent.push(entry); });
    spyOn(sync, 'sendCommand').and.callFake((cmd: SessionCommand) => { commands.push(cmd); });
    broadcasts = spyOn(sync, 'broadcastState');

    component.shareRoomCode = 'ABC123';
    component.sharedLogEntries = [];
  });

  afterEach(() => {
    resetCombat();
  });

  // ── NS1 - Ordinary case: generate a grunt's name in the Add dialog ───────

  it('NS1: generate in the Add dialog creates nothing, re-rolls, and only the commit adds a participant', () => {
    component.btnAddGrunt_Click();
    expect(component.pendingAddDraft?.name).toBe('Grunt 1');
    expect(component.combatManager.participants.count).toBe(1); // placeholder only

    component.generateDraftName();
    const first = component.pendingAddDraft?.name ?? '';
    expect(first).not.toBe('Grunt 1');
    expect(first).not.toMatch(/^Grunt \d+$/);
    expect(first.trim()).toBe(first);
    expect(component.combatManager.participants.count).toBe(1); // still nothing created
    expect(broadcasts).not.toHaveBeenCalled();
    expect(sent.length).toBe(0);

    component.generateDraftName();
    expect(component.pendingAddDraft?.name).not.toBe(first); // re-roll gives a new one

    component.commitAddDraft();
    expect(component.combatManager.participants.count).toBe(2);
    const g = component.combatManager.participants.items[1];
    expect(g.name.length).toBeGreaterThan(0);
    expect(sent.length).toBe(0); // join line waits for the roll
  });

  // ── NS2 - Edge case: the corpus is exhausted and uniqueness still holds ──

  it('NS2: crew corpus exhaustion still yields a unique name, fast, without invading the default namespace', () => {
    // Keep this test cheap: syncSharedState() no-ops without a room code,
    // so filling the encounter with 3,000 grunts stays O(n) per add rather
    // than O(n) per add *and* per broadcast build.
    component.shareRoomCode = '';

    const all = enumerateAllPossibleNames('crew');
    for (const n of all) {
      component.addGrunt(n, 3, 3, false);
    }

    component.btnAddNpcRow_Click();
    const t0 = performance.now();
    component.generateDraftName();
    expect(performance.now() - t0).toBeLessThan(100);

    const name = component.pendingAddDraft?.name ?? '';
    const taken = new Set(component.combatManager.participants.items.map(p => normaliseNameForComparison(p.name)));
    expect(taken.has(normaliseNameForComparison(name))).toBeFalse();
    expect(name).toMatch(/ \d+$/); // suffix fallback fired
    expect(name).not.toMatch(/^Grunt Group( \d+)?$/); // and did not invade a namespace
    expect(component['nextMergedGruntRowName']()).toBe('Grunt Group');
  });

  // ── NS3 - Correction path: no undo, but typing over stays free ───────────

  it('NS3: a generated name can be hand-typed over twice with no undo and no log noise, and the log shows the final name', () => {
    component.btnAddGrunt_Click();
    component.generateDraftName();
    const generated = component.pendingAddDraft?.name ?? '';
    component.commitAddDraft();
    const g = component.combatManager.participants.items[1];
    expect(g.name).toBe(generated);
    expect(sent.length).toBe(0);

    // The GM doesn't like it. Type over it - no dialog, no undo, no log noise.
    g.name = 'Hand-Typed Name';
    component.onParticipantUpdated();
    expect(sent.length).toBe(0);

    // Change their mind again, before the fight starts.
    g.name = 'Final Name';
    component.onParticipantUpdated();

    // The join line is written on the first Initiative Test, with the FINAL name.
    component.combatManager.started = true;
    component.btnRollInitiative_Click(g);
    const join = sent.filter(e => e.text === 'added.');
    expect(join.length).toBe(1);
    expect(join[0].actor).toBe('Final Name');
    expect(JSON.stringify(sent)).not.toContain(generated);
    expect(JSON.stringify(sent)).not.toContain('Hand-Typed Name');
  });

  // ── NS4 - Live at the table: reinforcements arrive mid-pass ──────────────

  it('NS4: four reinforcements generated mid-pass are distinct, announce immediately, and leave the row Score untouched', () => {
    // Pass 2 of Combat Turn 1. Row 'Ancients' already rolled, wounded to
    // rowWoundModifier 1.
    component.combatManager.started = true;
    component.combatManager.initiativePass = 2;

    const row = component.addNpcRow(false);
    row.name = 'Ancients';
    const founder = row.addMember(new GruntMember('Ancients Founder', 4, 3));
    component.btnRollInitiative_Click(row); // row has now rolled this turn
    row.applyDamageToMember(founder, 3, 'physical'); // wm 0 -> 1, rowWoundModifier -> 1

    const scoreBefore = row.getCurrentInitiative();
    const currentActorsBefore = component.combatManager.currentActors.count;
    const sentBefore = sent.length;

    // Four taps: open, generate, confirm - four times.
    const names: string[] = [];
    for (let i = 0; i < 4; i++) {
      component.btnAddNpcToRow_Click(row);
      component.generateDraftName();
      names.push(component.pendingAddDraft?.name ?? '');
      component.commitAddDraft();
    }

    expect(new Set(names.map(n => normaliseNameForComparison(n))).size).toBe(4); // all four distinct
    expect(row.members.length).toBe(5); // founder + 4 reinforcements
    expect(row.getCurrentInitiative()).toBe(scoreBefore); // Decision 7: joiners are Score-neutral
    expect(row.rowWoundModifier).toBe(1); // untouched
    expect(component.combatManager.currentActors.count).toBe(currentActorsBefore);

    // The row has already rolled, so these four announce immediately.
    const joins = sent.slice(sentBefore).filter(e => e.text.includes('joined the group'));
    expect(joins.length).toBe(4);
    for (const n of names) {
      expect(joins.some(e => e.text.startsWith(n + ' joined the group'))).toBeTrue();
    }
    expect(JSON.stringify(joins)).not.toMatch(/\d+\/\d+/); // no CM maximum, RULINGS 2026-08-13
    expect(JSON.stringify(joins)).not.toMatch(/^NPC \d+/m); // no placeholder leaked
  });

  // ── Defect 5 (second validator round) - documented, pinned gap: the
  //    roster and the log can permanently disagree for a reinforcement
  //    added-then-renamed into an ALREADY-ROLLED row ──────────────────────
  //
  // Repro from the validator round: rolled group -> Add NPC, committed with
  // the dialog's own pre-filled placeholder (no generate press) -> the join
  // line is written immediately, with the placeholder, because the row has
  // already rolled and there is no future roll for this member to wait for
  // (Decision 7) -> expand the row and press the inline generate button ->
  // the roster shows the new name, but the log line already sent still
  // names the placeholder. Not fixed (see
  // briefs/cyberpunk-name-generator-spec.md's "When the name reaches the
  // log" correction and `addNpcToRow()`'s doc comment) - this test exists to
  // PIN the real behaviour so a future change either fixes it deliberately
  // or fails this test as a warning, rather than the gap silently drifting.

  it('defect 5 (second validator round): renaming a reinforcement after an already-rolled row has announced it does not fix the log line already sent', () => {
    component.combatManager.started = true;
    component.combatManager.initiativePass = 2;

    // Row left on its own default name (`isDefaultRowName()` true), so
    // `nextRowMemberName()` prefixes new members with "NPC" rather than the
    // row's own name - the ordinary case for a group the GM has not
    // bothered to rename.
    const row = component.addNpcRow(false);
    row.addMember(new GruntMember('Founder', 4, 3));
    component.btnRollInitiative_Click(row); // row has now rolled this turn

    const sentBefore = sent.length;

    // Add NPC -> commit WITHOUT pressing generate (the dialog's own
    // pre-filled placeholder goes through as-is - the ordinary case of a GM
    // who plans to name the NPC afterwards via the row-member box).
    component.btnAddNpcToRow_Click(row);
    const placeholderName = component.pendingAddDraft?.name ?? '';
    expect(placeholderName).toMatch(/^NPC \d+$/); // the ordinary default, not yet generated
    component.commitAddDraft();

    // The row had already rolled, so this announced immediately (Decision
    // 7), with the placeholder - there is no roll left to wait for.
    const joinsAfterAdd = sent.slice(sentBefore).filter(e => e.text.includes('joined the group'));
    expect(joinsAfterAdd.length).toBe(1);
    expect(joinsAfterAdd[0].text.startsWith(placeholderName + ' joined the group')).toBeTrue();

    const newMember = row.members[row.members.length - 1];
    expect(newMember.name).toBe(placeholderName);

    // GM expands the row and uses the inline generate button to give the
    // reinforcement a real name - same feature, same button, as NS4.
    component.generateRowMemberName(row, newMember);
    const generatedName = newMember.name;
    expect(generatedName).not.toBe(placeholderName);

    // The roster shows the new name...
    expect(row.members[row.members.length - 1].name).toBe(generatedName);
    // ...but the log line already sent still names the placeholder, and no
    // second join line was ever written for this member.
    const allJoinsForThisMember = sent
      .slice(sentBefore)
      .filter(e => e.text.includes('joined the group'));
    expect(allJoinsForThisMember.length).toBe(1);
    expect(allJoinsForThisMember[0].text.startsWith(placeholderName + ' joined the group')).toBeTrue();
    expect(JSON.stringify(allJoinsForThisMember)).not.toContain(generatedName);
  });

  // ── NS5 - A generated name may not impersonate a player character ───────

  it('NS5: never returns a name matching a player character, even when every randomised attempt collides on it', () => {
    component['upsertPlayerParticipant']('kestrelPlayer', 'Kestrel', 1, 3, 4, 4, 4, 10, 10);
    expect(component['isPlayerCharacterName']('Kestrel')).toBeTrue();

    // Adversarial RNG: always try to draw the handleSolo pattern and always
    // land on "Kestrel" within it, for all GENERATE_NAME_MAX_ATTEMPTS
    // randomised attempts - the worst case the dedup loop has to survive.
    // Real Math.random essentially never behaves this way (that's the whole
    // point of "random"), but a rigged sequence proves the guarantee holds
    // even in the worst case.
    //
    // Defect 6 (validator round): this scenario used to stop here and assert
    // only `not.toBe('kestrel')`, which a fallback of "Kestrel 2" would also
    // satisfy - defeating the scenario in spirit (the PC's own name plus a
    // number, still surfaced into the "Roll as" picker). The fix
    // (`name-generator.ts`'s exhaustive fallback scan) makes the retry move
    // on to a genuinely different corpus name instead, which this now checks
    // for directly: not just "isn't literally Kestrel", but "isn't Kestrel
    // with a number stapled on, and IS one of the corpus's own combinations".
    const handleSoloIndex = WORD_LISTS['handleSolo'].indexOf('Kestrel');
    expect(handleSoloIndex).toBeGreaterThanOrEqual(0);
    const handleSoloListLength = WORD_LISTS['handleSolo'].length;
    // pickPattern's roll: NAME_PATTERNS lists the adjective+noun "handle"
    // pattern (weight 1) before the solo one (a smaller weight - see that
    // pattern's own doc comment). A draw this close to 1 selects the last
    // pattern in the list (handleSolo) regardless of the exact weight ratio.
    const pickPatternDraw = 0.999;
    const soloWordDraw = (handleSoloIndex + 0.5) / handleSoloListLength;
    const rng = (() => {
      let call = 0;
      return () => (call++ % 2 === 0 ? pickPatternDraw : soloWordDraw);
    })();

    component.btnAddGrunt_Click();
    component['generateDraftNameWith'](rng);
    const generated = component.pendingAddDraft?.name ?? '';

    expect(normaliseNameForComparison(generated)).not.toBe('kestrel');
    expect(generated).not.toMatch(/^Kestrel \d+$/i); // not the PC's name plus a number either
    expect(enumerateAllPossibleNames('handle').map(normaliseNameForComparison))
      .toContain(normaliseNameForComparison(generated)); // a genuinely different corpus name
    expect(component['isPlayerCharacterName'](generated)).toBeFalse();

    component.commitAddDraft();
    expect(component.rollAsNames).toContain(generated);
    expect(component.rollAsNames).not.toContain('Kestrel');
  });

  // ── AC 13 (direct) - a generated name can never equal a PC's, broadly ───

  it('AC13 (direct): across many draws for every handle-eligible kind, a generated name never case-insensitively equals a player character\'s', () => {
    component['upsertPlayerParticipant']('kestrelPlayer', 'Kestrel', 1, 3, 4, 4, 4, 10, 10);
    component['upsertPlayerParticipant']('vitosPlayer', 'Vitos Wire', 2, 3, 4, 4, 4, 10, 10);

    for (const kind of ['grunt', 'participant', 'rowMember'] as const) {
      component['openAddDialog'](kind, kind === 'rowMember' ? component.addNpcRow(false) : null);
      for (let press = 0; press < 20; press++) {
        component.generateDraftName();
        const name = component.pendingAddDraft?.name ?? '';
        expect(component['isPlayerCharacterName'](name)).withContext(name).toBeFalse();
        expect(normaliseNameForComparison(name)).not.toBe(normaliseNameForComparison('Kestrel'));
        expect(normaliseNameForComparison(name)).not.toBe(normaliseNameForComparison('Vitos Wire'));
      }
      component.cancelAddDraft();
    }
  });

  // ── D10 (second validator round): UI wiring, previously untested ────────
  //
  // Grepping `src/` for `add-draft-name-generate`, `row-member-name-generate`,
  // `host-name-generate`, `target-name-generate` found ZERO test references
  // before this round - every AC8-14 test above calls
  // `component.generateDraftName()` / `generateRowMemberName()` directly,
  // never through a real rendered button. Deleting `(click)="generateDraftName()"`
  // from the Add dialog button left every test in this file passing. These
  // tests exercise the actual rendered DOM instead.
  // `NgbModal` renders its window onto `document.body`, not inside
  // `fixture.nativeElement` (confirmed empirically), so the Add dialog
  // assertions below query `document`, matching the row-member and Matrix
  // assertions' use of `fixture.nativeElement`/`By.css` for content that
  // *is* part of the component's own template.

  it('D10: the Add dialog\'s generate button is wired to generateDraftName() by a real DOM click', () => {
    component.btnAddGrunt_Click();
    fixture.detectChanges();
    const btn = document.querySelector('[data-testid="add-draft-name-generate"]') as HTMLButtonElement;
    expect(btn).withContext('rendered generate button').toBeTruthy();
    const before = component.pendingAddDraft?.name;

    btn.click();
    fixture.detectChanges();

    expect(component.pendingAddDraft?.name).not.toBe(before);
    component.cancelAddDraft();
  });

  it('D10: the row-member generate button is wired to generateRowMemberName() by a real DOM click', () => {
    const row = component.addNpcRow(false);
    const m = row.addMember(new GruntMember('Original', 3, 3));
    fixture.detectChanges();

    const generateBtn = fixture.nativeElement.querySelector('[data-testid="row-member-name-generate"]') as HTMLButtonElement;
    expect(generateBtn).withContext('rendered generate button').toBeTruthy();

    generateBtn.click();
    fixture.detectChanges();

    expect(m.name).not.toBe('Original');
  });

  // ── AC 8 - generate button changes only the draft's name ────────────────

  it('AC8: pressing generate changes pendingAddDraft.name and nothing else', () => {
    component.btnAddGrunt_Click();
    const draftBefore = { ...component.pendingAddDraft };
    const participantsBefore = JSON.stringify(component.combatManager.participants.items);

    component.generateDraftName();

    expect(JSON.stringify(component.combatManager.participants.items)).toBe(participantsBefore);
    const draftAfter = component.pendingAddDraft;
    expect(draftAfter?.kind).toBe(draftBefore.kind);
    expect(draftAfter?.count).toBe(draftBefore.count);
    expect(draftAfter?.body).toBe(draftBefore.body);
    expect(draftAfter?.willpower).toBe(draftBefore.willpower);
    expect(draftAfter?.statblockId).toBe(draftBefore.statblockId);
    expect(draftAfter?.loadAugmented).toBe(draftBefore.loadAugmented);
    expect(draftAfter?.targetRow).toBe(draftBefore.targetRow);
    expect(draftAfter?.lieutenantTeamRow).toBe(draftBefore.lieutenantTeamRow);
    expect(draftAfter?.name).not.toBe(draftBefore.name);
  });

  // ── AC 9 - pressing generate twice produces two different names ─────────

  it('AC9: pressing generate twice produces two different names, even when the RNG would otherwise redraw the same one (defect 2)', () => {
    // A degenerate RNG that always returns 0: every pattern pick and every
    // slot draw lands on index 0, so without excluding the box's *current*
    // value from `taken`, a second press would silently redraw exactly what
    // the first one wrote (defect 2, validator round - worst on the small
    // Matrix icon corpora, but the same underlying gap here).
    const degenerate = () => 0;
    component.btnAddNpcRow_Click();

    component['generateDraftNameWith'](degenerate);
    const first = component.pendingAddDraft?.name ?? '';
    component['generateDraftNameWith'](degenerate);
    const second = component.pendingAddDraft?.name ?? '';

    expect(second).not.toBe(first);
    expect(enumerateAllPossibleNames('crew').map(normaliseNameForComparison))
      .toContain(normaliseNameForComparison(second));
  });

  // ── AC 10 - corpus kind per draft kind ───────────────────────────────────

  it('AC10: row/merge always draws from crew; grunt/participant/rowMember always draws from handle - one corpus per field, every press (brief "Corpus kind, per call site")', () => {
    component.btnAddNpcRow_Click();
    for (let press = 1; press <= 3; press++) {
      component.generateDraftName();
      const rowName = component.pendingAddDraft?.name ?? '';
      expect(enumerateAllPossibleNames('crew').map(normaliseNameForComparison))
        .withContext(`row/merge press ${press}`)
        .toContain(normaliseNameForComparison(rowName));
    }
    component.cancelAddDraft();

    // grunt/participant/rowMember always draw from `handle` - no cycling,
    // no second style. Every press stays in the same corpus.
    for (const kind of ['grunt', 'participant', 'rowMember'] as const) {
      component['openAddDialog'](kind, kind === 'rowMember' ? component.addNpcRow(false) : null);
      for (let press = 1; press <= 3; press++) {
        component.generateDraftName();
        const name = component.pendingAddDraft?.name ?? '';
        expect(enumerateAllPossibleNames('handle').map(normaliseNameForComparison))
          .withContext(`${kind} draft, press ${press}: "${name}"`)
          .toContain(normaliseNameForComparison(name));
      }
      component.cancelAddDraft();
    }
  });

  // ── AC 11 - never collides with a default-name namespace ────────────────

  it('AC11: a generated name never matches an existing default-name pattern', () => {
    const forbidden = [/^Grunt \d+$/, /^Grunt Group( \d+)?$/, /^NPC \d+$/, /^Combatant \d+$/];
    for (const kind of ['grunt', 'row'] as const) {
      component.btnAddGrunt_Click();
      if (kind === 'row') {
        component.cancelAddDraft();
        component.btnAddNpcRow_Click();
      }
      for (let i = 0; i < 20; i++) {
        component.generateDraftName();
        const name = component.pendingAddDraft?.name ?? '';
        for (const pattern of forbidden) {
          expect(name).not.toMatch(pattern);
        }
      }
      component.cancelAddDraft();
    }
    expect(component['nextStandaloneGruntName']()).toBe('Grunt 1');
    expect(component['nextMergedGruntRowName']()).toBe('Grunt Group');
  });

  // ── AC 12 - generate broadcasts and logs nothing ─────────────────────────

  it('AC12: pressing generate fires zero broadcastState and zero appendLog calls', () => {
    component.btnAddGrunt_Click();
    component.generateDraftName();
    component.generateDraftName();
    expect(broadcasts).not.toHaveBeenCalled();
    expect(sync.appendLog).not.toHaveBeenCalled();
  });

  // ── AC 14 - row-member generate touches only that member's name ─────────

  it('AC14: the row-member generate button changes only that member\'s name', () => {
    const row = component.addNpcRow(false);
    row.name = 'Ancients';
    const m1 = row.addMember(new GruntMember('NPC 1', 3, 3));
    const m2 = row.addMember(new GruntMember('NPC 2', 3, 3));
    row.applyDamageToMember(m1, 3, 'physical');
    const woundBefore = row.rowWoundModifier;
    const m1DamageBefore = m1.damage;
    const m2Before = { name: m2.name, damage: m2.damage };
    const rowNameBefore = row.name;

    component.generateRowMemberName(row, m1);

    expect(m1.name).not.toBe('NPC 1');
    expect(row.name).toBe(rowNameBefore);
    expect(row.rowWoundModifier).toBe(woundBefore);
    expect(m1.damage).toBe(m1DamageBefore);
    expect(m2.name).toBe(m2Before.name);
    expect(m2.damage).toBe(m2Before.damage);
  });

  // ── No undo affordance - retyping or pressing again is the correction ───

  it('a mis-tap on the row-member generate button is corrected by retyping or pressing again, with no undo control anywhere in the row', () => {
    const row = component.addNpcRow(false);
    const m = row.addMember(new GruntMember('Original Name', 3, 3));
    fixture.detectChanges();

    component.generateRowMemberName(row, m);
    expect(m.name).not.toBe('Original Name');

    // No revert control exists - the remedy is retyping or pressing again
    // (SCOPE.md's standing no-undo rule).
    const revertBtn = fixture.nativeElement.querySelector('[data-testid="row-member-name-revert"]');
    expect(revertBtn).withContext('no revert control in the DOM').toBeFalsy();

    // Retyping by hand works exactly like any other name box.
    m.name = 'Hand-Typed';
    component.onParticipantUpdated();
    expect(m.name).toBe('Hand-Typed');

    // Pressing generate again also works, ordinarily.
    component.generateRowMemberName(row, m);
    expect(m.name).not.toBe('Hand-Typed');
  });

  // ── Defect 4 - the row-member generate button is not a Tab stop between
  //    Name and Body ───────────────────────────────────────────────────────

  it('defect 4 (validator round): the row-member generate button sits after Body/Willpower in the DOM, not between Name and Body', () => {
    const row = component.addNpcRow(false); // starts with its panel already expanded
    row.addMember(new GruntMember('Ganger', 3, 3));
    fixture.detectChanges();

    const memberRow = fixture.debugElement.query(By.css('.npc-row-member')).nativeElement as HTMLElement;
    const nameInput = memberRow.querySelector('.npc-row-member-name') as HTMLElement;
    const generateBtn = memberRow.querySelector('[data-testid="row-member-name-generate"]') as HTMLElement;
    const inputs = Array.from(memberRow.querySelectorAll('input')) as HTMLElement[];
    const bodyInput = inputs[1]; // Name is inputs[0]; Body/Willpower follow it
    const willpowerInput = inputs[2];

    expect(nameInput).toBeTruthy();
    expect(generateBtn).toBeTruthy();
    expect(bodyInput).toBeTruthy();
    expect(willpowerInput).toBeTruthy();

    // DOCUMENT_POSITION_FOLLOWING means the left operand comes BEFORE the
    // right one in DOM (tab) order.
    const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING;
    expect(nameInput.compareDocumentPosition(bodyInput) & FOLLOWING).toBeTruthy();
    expect(bodyInput.compareDocumentPosition(willpowerInput) & FOLLOWING).toBeTruthy();
    // The generate button comes AFTER Willpower, not between Name and Body.
    expect(willpowerInput.compareDocumentPosition(generateBtn) & FOLLOWING).toBeTruthy();
  });

  // ── Defect 4 (second validator round) - the icon no longer collides with
  //    Roll Initiative's, on the same expanded row ─────────────────────────

  it('defect 4 (second validator round): the row-member generate button does not reuse the Roll Initiative icon', () => {
    const row = component.addNpcRow(false);
    row.addMember(new GruntMember('Ganger', 3, 3));
    fixture.detectChanges();

    const rowGenerateIcon = fixture.nativeElement.querySelector(
      '[data-testid="row-member-name-generate"] i'
    ) as HTMLElement;
    expect(rowGenerateIcon).withContext('generate button has an icon').toBeTruthy();
    expect(rowGenerateIcon.classList.contains('fa-dice'))
      .withContext('no longer the Roll Initiative icon')
      .toBeFalse();
    expect(rowGenerateIcon.classList.contains('fa-shuffle'))
      .withContext('uses a distinct icon instead')
      .toBeTrue();

    // Roll Initiative's own button, one line up on the same expanded row,
    // still uses fa-dice - proving the two are now visually distinguishable
    // rather than asserting on a hard-coded class alone.
    const rollBtn = fixture.nativeElement.querySelector('.gm-roll-btn i') as HTMLElement;
    expect(rollBtn).withContext('Roll Initiative icon still present').toBeTruthy();
    expect(rollBtn.classList.contains('fa-dice')).toBeTrue();
  });

  // Defect 4 (second validator round)'s visual-order fix (`order: 1`/`order:
  // 2` in the stylesheet) is deliberately NOT asserted here by
  // `getBoundingClientRect()`/layout position: this app's `test` Angular
  // architect target (`angular.json`) loads only `src/styles.scss`, not
  // Bootstrap's CSS (that is a separate entry under the `build` target's
  // `styles` array) - confirmed empirically
  // (`getComputedStyle(...).display` on `.npc-row-member` reads `"block"` in
  // Karma, not the `d-flex` the class name implies), so every element in
  // this row lays out top-to-bottom with no horizontal position for a
  // layout-based assertion to check. Covered instead by the class-structure
  // checks above (the generate button and `.npc-row-bw-group` etc. carry the
  // classes `battle-tracker.component.css`'s `order` rules target) and by
  // manual verification in a real browser: with those rules in place, the
  // generate button renders immediately right of the Name box, ahead of
  // Body/Willpower.

  // ── AC 15 - the blank-placeholder invariant survives generation ─────────

  it('AC15: the constructor-seeded placeholder stays "unused" after opening, generating and cancelling', () => {
    const placeholder = component.combatManager.participants.items[0];
    expect(component['isUnusedPlaceholder'](placeholder)).toBeTrue();

    component.btnAddGrunt_Click();
    component.generateDraftName();
    component.generateDraftName();
    component.generateDraftName();
    component.cancelAddDraft();

    expect(component['isUnusedPlaceholder'](placeholder)).toBeTrue();
  });

  // ── AC 16 - generation happens only where the brief says it does ────────

  it('AC16: none of the ordinary add paths generate a name on their own', () => {
    // A fresh placeholder participant, never touched by generation:
    expect(component.combatManager.participants.items[0].name).toBe('');

    // addGrunt() with no name falls back to the numbered default, not a
    // generated one.
    const grunt = component.addGrunt(undefined, 3, 3, false);
    expect(grunt.name).toBe('Grunt 1');

    const row = component.addNpcRow(false);
    expect(row.name).toBe('Grunt Group');

    const member = component.addNpcToRow(row, undefined, 3, 3);
    expect(member.name).toBe('NPC 1');

    const p = component.addParticipant(false);
    expect(p.name).toBe('');
  });

  it('AC16 (extended, defect 10): commitAddDraft(), mergeSelectedGrunts(), restoreFromSharedState(), and the four promote/demote helpers generate no name of their own', () => {
    // commitAddDraft() with a blank name falls back to the numbered default
    // (nextStandaloneParticipantName()), not a generated one - the generator
    // is only ever invoked by generateDraftName()/generateDraftNameWith().
    component.btnAddParticipant_Click();
    expect(component.pendingAddDraft).toBeTruthy();
    component.pendingAddDraft!.name = '';
    component.commitAddDraft();
    const addedParticipant = component.combatManager.participants.items
      .find(x => x !== component.combatManager.participants.items[0]);
    expect(addedParticipant?.name).toBe('Combatant 1');

    // mergeSelectedGrunts() with no name falls back to nextMergedGruntRowName().
    const g1 = component.addGrunt('Merge One', 3, 3, false);
    const g2 = component.addGrunt('Merge Two', 3, 3, false);
    component.toggleMergeSelection(g1);
    component.toggleMergeSelection(g2);
    const mergeResult = component.mergeSelectedGrunts();
    expect(mergeResult.ok).toBeTrue();
    expect(mergeResult.row?.name).toBe('Grunt Group');

    // restoreFromSharedState() reconstructs participants from the wire shape
    // verbatim - it must never invent or alter a name in transit.
    const original = component.addGrunt('Vitos Wire', 4, 4, false);
    const gmState = component['buildGmState']();
    const shared = { round: 1, pass: 1, participants: component['getSharedParticipants']() };
    component['restoreFromSharedState'](shared, gmState);
    const restored = component.combatManager.participants.items.find(x => x.name === 'Vitos Wire');
    expect(restored).toBeTruthy();
    expect(original === restored).toBeFalse(); // a fresh instance, but the SAME name, untouched

    // The four promote/demote helpers copy the name field across the type
    // swap; none of them draws from the generator.
    const named = component.addParticipant(false);
    named.name = 'Swap Target';
    const mp = component['promoteToMatrixParticipant'](named) as MatrixParticipant;
    expect(mp.name).toBe('Swap Target');
    const backToParticipant = component['demoteToParticipant'](mp);
    expect(backToParticipant.name).toBe('Swap Target');
    const ap = component['promoteToAstralParticipant'](backToParticipant) as AstralParticipant;
    expect(ap.name).toBe('Swap Target');
    const backAgain = component['demoteFromAstralParticipant'](ap);
    expect(backAgain.name).toBe('Swap Target');
  });

  // ── AC 21 - one join line, naming the final generated/typed name ────────

  it('AC21: regenerating twice before the roll still produces exactly one join line, naming the final name', () => {
    component.btnAddGrunt_Click();
    component.generateDraftName();
    component.generateDraftName();
    const finalName = component.pendingAddDraft?.name ?? '';
    component.commitAddDraft();
    const g = component.combatManager.participants.items[1];
    expect(g.name).toBe(finalName);

    component.combatManager.started = true;
    component.btnRollInitiative_Click(g);

    const joins = sent.filter(e => e.text === 'added.');
    expect(joins.length).toBe(1);
    expect(joins[0].actor).toBe(finalName);
  });

  // ── AC 22 - no new wire keys for a generated name ────────────────────────

  it('AC22: generated-name participants introduce no new keys on getSharedParticipants()/buildGmState()', () => {
    component.btnAddGrunt_Click();
    component.generateDraftName();
    component.commitAddDraft();
    const generatedParticipants = component['getSharedParticipants']();
    const generatedGmState = component['buildGmState']();

    resetCombat();
    fixture = TestBed.createComponent(BattleTrackerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    component.shareRoomCode = 'ABC123';
    component.addGrunt('Typed Name', 3, 3, false);
    const typedParticipants = component['getSharedParticipants']();
    const typedGmState = component['buildGmState']();

    expect([...collectKeys(generatedParticipants)].sort()).toEqual([...collectKeys(typedParticipants)].sort());
    expect([...collectKeys(generatedGmState)].sort()).toEqual([...collectKeys(typedGmState)].sort());
  });
});

describe('Cyberpunk name generator: Matrix host/icon wiring (Part 2)', () => {
  let fixture: ComponentFixture<HierarchyEditorComponent>;
  let component: HierarchyEditorComponent;
  let matrixState: MatrixStateService;

  function decker(name: string): MatrixParticipant {
    const d = new MatrixParticipant();
    d.name = name;
    return d;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HierarchyEditorComponent],
      providers: appConfig.providers
    }).compileComponents();

    fixture = TestBed.createComponent(HierarchyEditorComponent);
    component = fixture.componentInstance;
    matrixState = TestBed.inject(MatrixStateService);
    component.activeDeckers = [decker('Slamm-0')];
    fixture.detectChanges();
  });

  // ── NS6 - Matrix host and icon naming, and marks are untouched ──────────

  it('NS6: host and icon names generate, save, and never disturb marks; a second host cannot collide', () => {
    component.openAddHost();
    component.suggestHostName();
    const hostName = component.hostForm.name;
    expect(hostName.trim().length).toBeGreaterThan(0);
    expect(component.hostForm.rating).toBe(4); // nothing else moved
    component.saveHostForm();
    const host = matrixState.state.hosts[0];
    expect(host.name).toBe(hostName);

    matrixState.addMarkToHost(host, 'Slamm-0', 1);
    expect(host.marks['Slamm-0']).toBe(1);

    component.openAddTarget(host, 'file');
    component.suggestTargetName();
    expect(component.targetForm.name).toMatch(/\.[a-z]{3}$/); // 'file' corpus shape
    component.saveTargetForm();

    expect(host.marks['Slamm-0']).toBe(1); // untouched by any naming
    expect(matrixState.state.hosts.length).toBe(1);

    // Second host cannot collide with the first.
    component.openAddHost();
    component.suggestHostName();
    expect(component.hostForm.name.toLowerCase()).not.toBe(hostName.toLowerCase());
  });

  // ── AC 17 - host suggest writes only the name, saves nothing ────────────

  it('AC17: suggestHostName() writes hostForm.name only and calls no matrixState mutator', () => {
    const addHost = spyOn(matrixState, 'addHost');
    const updateHost = spyOn(matrixState, 'updateHost');
    const setCurrentHost = spyOn(matrixState, 'setCurrentHost');

    component.openAddHost();
    const before = { ...component.hostForm };
    component.suggestHostName();

    expect(component.hostForm.name).not.toBe(before.name);
    expect(component.hostForm.rating).toBe(before.rating);
    expect(component.hostForm.attack).toBe(before.attack);
    expect(component.hostForm.sleaze).toBe(before.sleaze);
    expect(component.hostForm.dataProcessing).toBe(before.dataProcessing);
    expect(component.hostForm.firewall).toBe(before.firewall);
    expect(addHost).not.toHaveBeenCalled();
    expect(updateHost).not.toHaveBeenCalled();
    expect(setCurrentHost).not.toHaveBeenCalled();
  });

  // ── AC 18 - target suggest matches targetForm.type ──────────────────────

  it('AC18: suggestTargetName() writes targetForm.name only, from the corpus matching targetForm.type', () => {
    const cases: { type: 'device' | 'file' | 'persona' | 'ic'; kind: GeneratedNameKind }[] = [
      { type: 'device', kind: 'device' },
      { type: 'file', kind: 'file' },
      { type: 'persona', kind: 'persona' },
      { type: 'ic', kind: 'ic' }
    ];
    for (const { type, kind } of cases) {
      component.openAddTarget(null, type);
      const before = { ...component.targetForm };
      component.suggestTargetName();
      expect(component.targetForm.name).not.toBe(before.name);
      expect(component.targetForm.type).toBe(before.type);
      expect(component.targetForm.visibility).toBe(before.visibility);
      expect(component.targetForm.deviceRating).toBe(before.deviceRating);
      expect(enumerateAllPossibleNames(kind).map(normaliseNameForComparison))
        .toContain(normaliseNameForComparison(component.targetForm.name));
      component.closeTargetForm();
    }
  });

  // ── AC 19 - generated names are unique across hosts and public space ────
  //
  // Validator round, defect D2: the previous version of this test used guard
  // names ('Widget', 'Loose Device', 'Renraku Node One') that appear nowhere
  // in WORD_LISTS.deviceNoun, so the "not.toBe" assertions could never fail -
  // suggestTargetName()'s 'device' corpus was structurally incapable of
  // producing them. It also never put a name on a target NESTED inside a
  // host, so the `for (const target of host.targets)` branch of
  // takenMatrixNames() (hierarchy-editor.component.ts:498-500) ran with an
  // empty loop body every time. Rewritten to use real corpus words as the
  // taken names - so a collision is one the corpus can actually produce and
  // the assertion is a genuine check - and to nest one of the taken names
  // inside the host.

  it('AC19: a generated host/target name never collides with an existing host name, a target nested inside a host, or a public target', () => {
    // Real hostOrg + hostFunction + hostSuffix combination (WORD_LISTS).
    const hostName = 'Meridian Payroll Cluster';
    component.openAddHost();
    component.hostForm.name = hostName;
    component.saveHostForm();
    const host: MatrixHost = matrixState.state.hosts[0];

    // A target NESTED INSIDE the host - exercises takenMatrixNames()'s
    // `for (const target of host.targets)` branch, which no test covered
    // before this rewrite.
    const nestedTargetName = 'Security Camera'; // real deviceNoun entry
    component.openAddTarget(host, 'device');
    component.targetForm.name = nestedTargetName;
    component.saveTargetForm();

    // A target in public space, not nested in any host.
    const publicTargetName = 'Vending Terminal'; // real deviceNoun entry
    component.openAddTarget(null, 'device');
    component.targetForm.name = publicTargetName;
    component.saveTargetForm();

    const generated: string[] = [];
    for (let i = 0; i < 25; i++) {
      component.openAddTarget(null, 'device');
      component.suggestTargetName();
      const name = component.targetForm.name;
      expect(normaliseNameForComparison(name)).not.toBe(normaliseNameForComparison(hostName));
      expect(normaliseNameForComparison(name)).not.toBe(normaliseNameForComparison(nestedTargetName));
      expect(normaliseNameForComparison(name)).not.toBe(normaliseNameForComparison(publicTargetName));
      generated.push(name);
      component.saveTargetForm();
    }

    // Mutually distinct: each draw is saved (added to takenMatrixNames())
    // before the next one, so the 25 generated names must all differ too.
    const distinct = new Set(generated.map(normaliseNameForComparison));
    expect(distinct.size).toBe(generated.length);
  });

  // ── AC 20 - Save stays disabled until a name exists ─────────────────────

  it('AC20: Save is disabled while the name is blank, and generate enables it', () => {
    component.openAddHost();
    component.hostForm.name = '';
    fixture.detectChanges();
    let saveBtn = fixture.debugElement.query(By.css('.hier-form .hier-btn-save')).nativeElement as HTMLButtonElement;
    expect(saveBtn.disabled).toBeTrue();

    component.suggestHostName();
    fixture.detectChanges();
    saveBtn = fixture.debugElement.query(By.css('.hier-form .hier-btn-save')).nativeElement as HTMLButtonElement;
    expect(saveBtn.disabled).toBeFalse();
  });

  it('AC20 (extended, defect 10): the target form\'s Save is disabled while the name is blank, and generate enables it', () => {
    component.openAddTarget(null, 'device');
    component.targetForm.name = '';
    fixture.detectChanges();
    let saveBtn = fixture.debugElement.query(By.css('.hier-form .hier-btn-save')).nativeElement as HTMLButtonElement;
    expect(saveBtn.disabled).toBeTrue();

    component.suggestTargetName();
    fixture.detectChanges();
    saveBtn = fixture.debugElement.query(By.css('.hier-form .hier-btn-save')).nativeElement as HTMLButtonElement;
    expect(saveBtn.disabled).toBeFalse();
  });

  // ── D10 (second validator round): all three Matrix Suggest buttons are
  //    wired, exercised through a real DOM click rather than a direct
  //    method call (see the GM-component describe block above for the same
  //    gap on the Add dialog / row-member side). These forms render inside
  //    `HierarchyEditorComponent`'s own template (an `@if` block, not an
  //    `NgbModal` portal), so `fixture.nativeElement` finds them directly. ──

  it('D10: the add-host Suggest button is wired to suggestHostName() by a real DOM click', () => {
    component.openAddHost();
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('[data-testid="add-host-name-generate"]') as HTMLButtonElement;
    expect(btn).withContext('rendered add-host suggest button').toBeTruthy();
    const before = component.hostForm.name;

    btn.click();
    fixture.detectChanges();

    expect(component.hostForm.name).not.toBe(before);
  });

  it('D10: the edit-host Suggest button is wired to suggestHostName() by a real DOM click', () => {
    component.openAddHost();
    component.hostForm.name = 'Meridian Payroll Cluster';
    component.saveHostForm();
    const host = matrixState.state.hosts[0];

    component.openEditHost(host);
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('[data-testid="edit-host-name-generate"]') as HTMLButtonElement;
    expect(btn).withContext('rendered edit-host suggest button').toBeTruthy();
    const before = component.hostForm.name;

    btn.click();
    fixture.detectChanges();

    expect(component.hostForm.name).not.toBe(before);
  });

  it('D10: the target-form Suggest button is wired to suggestTargetName() by a real DOM click', () => {
    component.openAddTarget(null, 'device');
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('[data-testid="target-name-generate"]') as HTMLButtonElement;
    expect(btn).withContext('rendered target suggest button').toBeTruthy();
    const before = component.targetForm.name;

    btn.click();
    fixture.detectChanges();

    expect(component.targetForm.name).not.toBe(before);
  });

  // ── Defect 2 - a Matrix suggest press always differs from the box's
  //    current value, even in the smallest corpora ────────────────────────

  it('defect 2 (validator round): suggestHostName() never redraws the box\'s own current value', () => {
    // Exhaust every 'host' combination except one, so the single untaken
    // candidate is (very likely) what the first press draws; a second press
    // must not just redraw that same value back at itself. Cheap: filling
    // `takenMatrixNames()`'s backing store directly via saved hosts would be
    // slow at ~18,000 entries, so this drives the fix through the box's OWN
    // value instead - set the box, generate, and require the result differs
    // regardless of what it drew.
    component.openAddHost();
    component.hostForm.name = 'Sable Payroll Cluster';
    component.suggestHostName();
    const first = component.hostForm.name;
    expect(normaliseNameForComparison(first)).not.toBe(normaliseNameForComparison('Sable Payroll Cluster'));

    // Now force the exact exhaustion case: taken already contains one
    // possible target name; suggesting again immediately after must not
    // reproduce the box's own current value.
    for (let i = 0; i < 10; i++) {
      const before = component.hostForm.name;
      component.suggestHostName();
      expect(normaliseNameForComparison(component.hostForm.name)).not.toBe(normaliseNameForComparison(before));
    }
  });

  it('defect 2 (validator round): suggestTargetName() never redraws the box\'s own current value, even for the smallest (\'ic\') corpus', () => {
    component.openAddTarget(null, 'ic');
    for (let i = 0; i < 10; i++) {
      const before = component.targetForm.name;
      component.suggestTargetName();
      if (before) {
        expect(normaliseNameForComparison(component.targetForm.name)).not.toBe(normaliseNameForComparison(before));
      }
    }
  });

  it('defect 2 (validator round): suggestTargetName() still terminates with a value distinct from the box\'s current one when the whole \'ic\' corpus is otherwise taken', () => {
    // Every icNoun candidate is taken, AND the box's own current value is one
    // of them - the deliberately worst case defect 2 describes ("exhaust the
    // 20 IC names and the next Suggest yields 'Black Ice 2'" should still
    // never equal what's already on screen).
    component.openAddTarget(null, 'ic');
    component.targetForm.name = WORD_LISTS['icNoun'][0];
    const currentValue = component.targetForm.name;

    // Fill public space with every OTHER icNoun candidate, so combined with
    // the box's own current value (folded into `taken` by the fix), the
    // whole corpus is covered.
    for (const n of WORD_LISTS['icNoun']) {
      if (normaliseNameForComparison(n) === normaliseNameForComparison(currentValue)) continue;
      component.openAddTarget(null, 'ic');
      component.targetForm.name = n;
      component.saveTargetForm();
    }
    component.openAddTarget(null, 'ic');
    component.targetForm.name = currentValue;

    component.suggestTargetName();
    expect(normaliseNameForComparison(component.targetForm.name)).not.toBe(normaliseNameForComparison(currentValue));
  });
});
