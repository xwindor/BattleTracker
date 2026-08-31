// Acceptance-criteria and scenario tests for
// briefs/action-log-readability-spec.md (AC1-AC30, scenarios S1-S5).
//
// Companion to src/scenarios/action-log-attribution.spec.ts (the prior Action
// Log pass this one follows in style/convention): declared-action/interrupt
// sentence wording and attribution, NPC-group text, the house-rule badge, and
// the VR-mode dead-code removal. Not in scope here (per the brief): initiative
// math, damage application mechanics, and every log line not named in the
// brief's "Affected paths" tables.

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BattleTrackerComponent } from 'app/battle-tracker/battle-tracker.component';
import { appConfig } from 'app/app.config';
import { CombatManager, StatusEnum } from 'Combat';
import { Participant } from 'Combat/Participants/Participant';
import { GruntMember, NpcRowParticipant } from 'Grunts';
import { MatrixParticipant } from 'Matrix/MatrixParticipant';
import { VRMode } from 'Matrix/VRMode';
import { SessionSyncService, SharedLogEntry } from 'app/services/session-sync.service';
import {
  DeclaredActionEngine,
  DeclaredActionSelection,
  NO_DECLARED_ACTION_PHRASE
} from 'app/shared/declared-action-engine';
import { DECLARED_ACTIONS, DECLARED_ACTION_VERB_PHRASES } from 'app/shared/declared-actions';
import { INTERRUPT_ACTION_META } from 'app/shared/interrupt-actions';
import { formatLogText, getLogTextClass } from 'app/shared/log-formatter';
import { interruptTable } from 'InterruptTable';
import { LogHandler } from 'Logging';

const FULL_DEFENSE = interruptTable.find(a => a.key === 'fullDefense')!;

/**
 * A player token as the player client actually mints it
 * (`player-view.component.ts`). Opaque, not a human name.
 */
const PLAYER_TOKEN = 'pl-8f2a91bc';

function resetCombat() {
  CombatManager.participants.clear();
  CombatManager.currentActors.clear();
  CombatManager.nextSortOrder = 0;
  CombatManager.initiativePass = 1;
  CombatManager.combatTurn = 1;
  CombatManager.started = false;
  CombatManager.passEnded = true;
}

describe('Action Log readability (briefs/action-log-readability-spec.md)', () => {
  let component: BattleTrackerComponent;
  let fixture: ComponentFixture<BattleTrackerComponent>;
  let sync: SessionSyncService;
  /** Entries that actually went out on the wire, in send order. */
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
    // Stand in for the server echo, same harness as action-log-attribution.spec.ts.
    spyOn(sync, 'appendLog').and.callFake((entry: SharedLogEntry) => {
      sent.push(entry);
      component['insertSharedLogEntry'](entry);
    });
    spyOn(sync, 'sendCommand').and.stub();

    component.shareRoomCode = 'ABC123';
    component.sharedLogEntries = [];
  });

  afterEach(() => {
    resetCombat();
  });

  // ── helpers ────────────────────────────────────────────────────────────

  function addCombatant(name: string): Participant {
    component.addParticipant(false);
    const p = CombatManager.participants.items[
      CombatManager.participants.items.length - 1
    ] as Participant;
    p.name = name;
    return p;
  }

  function command(type: string, player: string, payload: Record<string, unknown> = {}) {
    component['handleSessionCommand']({
      type,
      player,
      payload,
      timestamp: new Date().toISOString()
    });
  }

  function gmRow(name: string): NpcRowParticipant {
    const row = component.addNpcRow(false);
    row.name = name;
    return row;
  }

  function matrixDecker(name: string): MatrixParticipant {
    const mp = new MatrixParticipant();
    mp.name = name;
    mp.dataProcessing = 6;
    mp.setDicesWithoutRoll(1);
    mp.baseIni = 10;
    CombatManager.participants.insert(mp);
    component['participantReactions'].set(mp, 5);
    component['participantIntuitions'].set(mp, 5);
    return mp;
  }

  // ── AC1, AC2 - phrase-table completeness ────────────────────────────────

  describe('AC1 - declared-action verb phrases cover every DECLARED_ACTIONS item', () => {
    it('has a phrase for every item.name in every category', () => {
      for (const category of DECLARED_ACTIONS) {
        for (const item of category.items) {
          expect(DECLARED_ACTION_VERB_PHRASES[item.name])
            .withContext(`${category.category}: ${item.name}`).toBeTruthy();
        }
      }
    });
  });

  describe('AC2 - every interrupt has a non-empty verb', () => {
    it('covers every key in INTERRUPT_ACTION_META', () => {
      for (const key of Object.keys(INTERRUPT_ACTION_META)) {
        expect(INTERRUPT_ACTION_META[key].verb).withContext(key).toBeTruthy();
      }
    });
  });

  // ── AC3-AC8 - sentence assembly ──────────────────────────────────────────

  describe('AC3-AC8 - buildDeclaredActionLog sentence assembly', () => {
    it('AC3 - a single free clause', () => {
      const sel: DeclaredActionSelection = { free: 'Drop Prone', simple: [], complex: null };
      expect(DeclaredActionEngine.buildDeclaredActionLog(sel)).toBe('dropped prone (free).');
    });

    it('AC4 - a repeated simple action names the repeat count', () => {
      const sel: DeclaredActionSelection = { free: null, simple: ['Take Aim', 'Take Aim'], complex: null };
      expect(DeclaredActionEngine.buildDeclaredActionLog(sel)).toBe('took aim twice (simple).');
    });

    it('AC5 - free, simple and simple join with an Oxford comma in free->simple->complex order', () => {
      const sel: DeclaredActionSelection = {
        free: 'Drop Prone', simple: ['Take Aim', 'Ready Weapon'], complex: null
      };
      expect(DeclaredActionEngine.buildDeclaredActionLog(sel))
        .toBe('dropped prone (free), took aim (simple), and readied a weapon (simple).');
    });

    it('AC6 - a single complex clause', () => {
      const sel: DeclaredActionSelection = { free: null, simple: [], complex: 'Reload Firearm' };
      expect(DeclaredActionEngine.buildDeclaredActionLog(sel)).toBe('reloaded (complex).');
    });

    it('AC7 - null for an empty selection', () => {
      const sel: DeclaredActionSelection = { free: null, simple: [], complex: null };
      expect(DeclaredActionEngine.buildDeclaredActionLog(sel)).toBeNull();
    });

    it('AC8 - falls back to "used <name>" for an unrecognised action name', () => {
      const sel: DeclaredActionSelection = { free: 'Not A Real Action', simple: [], complex: null };
      expect(DeclaredActionEngine.buildDeclaredActionLog(sel)).toBe('used Not A Real Action (free).');
    });
  });

  // ── AC9 - GM Act submission attribution ──────────────────────────────────

  describe('AC9 - a GM Act submission is attributed to the character', () => {
    it('produces exactly one shared entry, actor = the character, none of the old shapes', () => {
      const sarah = addCombatant('Sarah');
      sent.length = 0;
      component.actModalParticipant = sarah;
      component['declaredActionSelections'].set(sarah, {
        free: 'Drop Prone', simple: [], complex: null
      });

      component.submitActModal();

      expect(sent.length).toBe(1);
      expect(sent[0].actor).toBe('Sarah');
      expect(sent[0].actor).not.toBe('GM');
      expect(sent[0].text).toBe('dropped prone (free).');
      for (const forbidden of ['Free:', 'Simple:', 'Complex:', ' | ', 'Act_Click']) {
        expect(sent[0].text).not.toContain(forbidden);
      }
    });
  });

  // ── AC10, AC11 - player-submitted act command ────────────────────────────

  describe('AC10, AC11 - a player-submitted act command', () => {
    function ownedActiveCombatant(name: string): Participant {
      const p = addCombatant(name);
      p.status = StatusEnum.Active;
      component['participantOwners'].set(p, PLAYER_TOKEN);
      return p;
    }

    it('AC10 - logs the payload string verbatim, attributed to the character', () => {
      const wombat = ownedActiveCombatant('Wombat');
      sent.length = 0;

      command('act', PLAYER_TOKEN, {
        participantId: component['getParticipantId'](wombat),
        declaredAction: 'dropped prone (free).'
      });

      expect(sent.length).toBe(1);
      expect(sent[0].actor).toBe('Wombat');
      expect(sent[0].text).toBe('dropped prone (free).');
    });

    it('AC11 - a missing declaredAction field logs "passed their action."', () => {
      const wombat = ownedActiveCombatant('Wombat');
      sent.length = 0;

      command('act', PLAYER_TOKEN, { participantId: component['getParticipantId'](wombat) });

      expect(sent.length).toBe(1);
      expect(sent[0].text).toBe(NO_DECLARED_ACTION_PHRASE);
      expect(sent[0].text).toBe('passed their action.');
    });
  });

  // ── AC12 - btnAction_Click interrupt attribution ─────────────────────────

  describe('AC12 - btnAction_Click interrupt attribution', () => {
    it('logs "interrupted, going full defense." attributed to the participant', () => {
      const ganger2 = addCombatant('Ganger 2');
      ganger2.baseIni = 15; // enough Score to afford Full Defense's -10
      sent.length = 0;

      component.btnAction_Click(ganger2, FULL_DEFENSE);

      expect(sent.length).toBe(1);
      expect(sent[0].actor).toBe('Ganger 2');
      expect(sent[0].text).toBe('interrupted, going full defense.');
      expect(sent[0].text).not.toContain('Interrupt Full Defense');
    });
  });

  // ── Round-2 defect D1 - a lost connection must not lose the local record ──
  //
  // Before this pass, `performAct`/`btnAction_Click` each wrote an
  // unconditional local `LogHandler.log` line as well as attempting the
  // shared broadcast. This pass moved both onto `appendParticipantEventLog`,
  // which - with a session open - takes only the shared branch and relies on
  // the server echo to mirror the entry back into `LogHandler`. With the
  // socket down (`shareConnectionLost`) that echo never arrives, so the GM's
  // own screen showed nothing for the event at all until (if ever) the socket
  // reconnected and the emit was resent.

  describe('D1 (round 2) - the socket is down while a session is still open', () => {
    it('performAct writes a local fallback line when the connection is lost', () => {
      const sarah = addCombatant('Sarah');
      component.shareConnectionLost = true;
      sent.length = 0;
      LogHandler.logbook.length = 0;
      component.actModalParticipant = sarah;
      component['declaredActionSelections'].set(sarah, {
        free: 'Drop Prone', simple: [], complex: null
      });

      component.submitActModal();

      // The emit is still attempted (fire-and-forget) - unchanged behaviour.
      expect(sent.length).toBe(1);
      expect(sent[0].actor).toBe('Sarah');
      expect(sent[0].text).toBe('dropped prone (free).');
      // ...but the GM's own pane also gets a local record, since no echo is
      // coming back to supply one.
      const local = LogHandler.logbook.filter(e => e.text === 'Sarah dropped prone (free).');
      expect(local.length).toBe(1);
    });

    it('btnAction_Click writes a local fallback line when the connection is lost', () => {
      const ganger2 = addCombatant('Ganger 2');
      ganger2.baseIni = 15;
      component.shareConnectionLost = true;
      sent.length = 0;
      LogHandler.logbook.length = 0;

      component.btnAction_Click(ganger2, FULL_DEFENSE);

      expect(sent.length).toBe(1);
      const local = LogHandler.logbook.filter(
        e => e.text === 'Ganger 2 interrupted, going full defense.'
      );
      expect(local.length).toBe(1);
    });

    it('writes no local fallback once the connection is healthy again (no double-log regression)', () => {
      const sarah = addCombatant('Sarah');
      component.shareConnectionLost = false;
      LogHandler.logbook.length = 0;
      component.actModalParticipant = sarah;
      component['declaredActionSelections'].set(sarah, {
        free: 'Drop Prone', simple: [], complex: null
      });

      component.submitActModal();

      // The common case is unchanged: shared-only, the echo (simulated by the
      // test harness elsewhere) supplies the local mirror, not this helper.
      expect(LogHandler.logbook.length).toBe(0);
    });

    // The brief also asks whether this gap reaches the helper's other
    // callers (jack in/out, Awakened toggles, astral projection toggle).
    // They all route through the same `appendParticipantEventLog` choke
    // point, so the fix applies to them for free - this is the same
    // assertion shape as the two tests above, exercised through a different
    // caller to confirm it, not a separate code path.
    it('enableAstral (an unrelated caller of the same helper) also gets the fallback for free', () => {
      const mage = addCombatant('Mage');
      component.shareConnectionLost = true;
      sent.length = 0;
      LogHandler.logbook.length = 0;

      component.enableAstral(mage);

      expect(sent.length).toBe(1);
      const local = LogHandler.logbook.filter(e => e.text === 'Mage is now Awakened');
      expect(local.length).toBe(1);
    });
  });

  // ── AC13 - a row member's declared action ────────────────────────────────

  describe('AC13 - a row member declared action is attributed to the row, names the NPC', () => {
    it('produces one entry: actor = row, text = "<member> <sentence>"', () => {
      const row = gmRow('Gangers');
      const g1 = component.addNpcToRow(row, 'G 1');
      sent.length = 0;

      component['performRowMemberAct'](row, g1,
        DeclaredActionEngine.buildDeclaredActionLog({ free: 'Drop Prone', simple: [], complex: null }));

      expect(sent.length).toBe(1);
      expect(sent[0].actor).toBe('Gangers');
      expect(sent[0].text).toBe('G 1 dropped prone (free).');
    });

    // Round-2 defect D5: the row-member action text (A11) opens with the NPC's
    // own name, and `logRowEvent`'s local write is `${actor} ${text}` with no
    // separator, so the GM's own (no-session-only) pane used to read as one
    // run-on ("Gangers G 1 dropped prone (free)."). This asserts the fix -
    // scoped to `performRowMemberAct`'s own local line, not to `logRowEvent`
    // in general (other row events, e.g. `addGrunt`, assert a colon-free local
    // line of their own - see `src/Grunts/npc-row.spec.ts`).
    it('D5 - the local pane separates the row name from the member name with a colon', () => {
      const row = gmRow('Gangers');
      const g1 = component.addNpcToRow(row, 'G 1');
      LogHandler.logbook.length = 0;

      component['performRowMemberAct'](row, g1,
        DeclaredActionEngine.buildDeclaredActionLog({ free: 'Drop Prone', simple: [], complex: null }));

      const local = LogHandler.logbook.map(e => e.text);
      expect(local).toContain('Gangers: G 1 dropped prone (free).');
      expect(local.some(t => t.startsWith('Gangers G 1'))).toBeFalse();
    });
  });

  // ── AC14 - classification ─────────────────────────────────────────────────

  describe('AC14 - classification of the new sentence shapes', () => {
    const texts = [
      'dropped prone (free) and took aim twice (simple).',
      'interrupted, going full defense.',
      'passed their action.',
      'G 1 reloaded (complex).'
    ];

    for (const text of texts) {
      it(`classifies "${text}" as log-text-action`, () => {
        expect(getLogTextClass(text)).toBe('log-text-action');
      });
    }
  });

  // ── AC15, AC16 - highlighting ─────────────────────────────────────────────

  describe('AC15, AC16 - highlighting a sentence clause', () => {
    it('AC15 - wraps the verb phrase, leaving the tag outside the span', () => {
      const html = formatLogText('took aim (simple).');
      expect(html).toContain('<span class="log-keyword-action">took aim</span>');
      const tagIndex = html.indexOf('(simple)');
      const spanEnd = html.indexOf('</span>');
      expect(tagIndex).toBeGreaterThan(-1);
      expect(tagIndex).toBeGreaterThan(spanEnd);
    });

    it('AC16 - wraps an interrupt clause', () => {
      const html = formatLogText('interrupted, going full defense.');
      expect(html).toContain('<span class="log-keyword-action">going full defense.</span>');
    });

    // Round-2 defect D2: the old lowercase-initial heuristic assumed a row
    // member's prepended name was always capitalised. A fully-lowercase or
    // lowercase-initial NPC name broke that assumption and got swallowed into
    // the highlighted span along with the verb phrase.
    it('D2 - a fully-lowercase row-member name is left out of the highlighted span', () => {
      const html = formatLogText('ork samurai took aim twice (simple).');
      expect(html).toBe(
        'ork samurai <span class="log-keyword-action">took aim twice</span> (simple).'
      );
    });

    it('D2 - a lowercase-initial row-member name (leading article) is left out of the span', () => {
      const html = formatLogText('the bouncer dropped prone (free).');
      expect(html).toBe(
        'the bouncer <span class="log-keyword-action">dropped prone</span> (free).'
      );
    });
  });

  // ── AC17 - addGrunt ────────────────────────────────────────────────────────

  describe('AC17 - addGrunt log text', () => {
    it('produces one entry, actor = the grunt, text exactly "added.", box-count-free (queued until rolled, RULINGS.md 2026-08-30)', () => {
      const grunt = component.addGrunt('Ganger A');
      sent.length = 0;
      component['rollAndLogInitiative'](grunt);

      const addedLines = sent.filter(e => e.text === 'added.');
      expect(addedLines.length).toBe(1);
      expect(addedLines[0].actor).toBe('Ganger A');
      expect(addedLines[0].text).not.toMatch(/\d/);
      expect(addedLines[0].text).not.toContain('boxes');
      expect(addedLines[0].text).not.toContain('Condition Monitor');
    });
  });

  // ── AC18, AC19 - addNpcToRow join line ───────────────────────────────────

  describe('AC18, AC19 - addNpcToRow join line', () => {
    it('AC18 - an unwounded joiner reads "<name> joined the group.", no score', () => {
      const row = gmRow('Gangers');
      // Reinforcement onto an already-rolled row (Decision 7) announces
      // immediately; onto a still-unrolled row it would queue instead
      // (RULINGS.md 2026-08-30) - see IA9b in
      // grunt-naming-and-statblocks.spec.ts for that half.
      component['rollAndLogInitiative'](row);
      sent.length = 0;

      component.addNpcToRow(row, 'Veteran');

      const joinLines = sent.filter(e => e.text === 'Veteran joined the group.');
      expect(joinLines.length).toBe(1);
      expect(joinLines[0].actor).toBe('Gangers');
      expect(joinLines[0].text).not.toMatch(/\d/);
    });

    // The public `addNpcToRow(row, name, body, willpower)` signature always
    // constructs a fresh, undamaged `GruntMember`, so the wounded-joiner
    // branch it carries (`member.wm > 0`) cannot be reached through that
    // signature alone - the same class of gap as the VR-mode dead code this
    // spec removes elsewhere (item C), except this one predates the spec and
    // is out of scope to fix (brief: "Not in scope: ... damage application").
    // `row.addMember` is the real per-member entry point (used directly by
    // `src/Grunts/npc-row.spec.ts` for the identical "already hurt before
    // joining" case), so the spy below damages the member at that exact call
    // site - the same point production code reads `member.wm` from - rather
    // than fabricating the resulting string.
    it('AC19 - a wounded joiner names the penalty (member.wm > 0 at join time)', () => {
      const row = gmRow('Gangers');
      component['rollAndLogInitiative'](row); // already-rolled row - immediate announcement (Decision 7)
      const originalAddMember = row.addMember.bind(row);
      spyOn(row, 'addMember').and.callFake((member: GruntMember) => {
        member.applyDamage(6, 'physical'); // wm becomes 2 before the join line reads it
        return originalAddMember(member);
      });
      sent.length = 0;

      component.addNpcToRow(row, 'Veteran');

      const joinLines = sent.filter(e => e.text === 'Veteran joined the group, arrives wounded (-2).');
      expect(joinLines.length).toBe(1);
    });
  });

  // ── AC20 - merge log text ──────────────────────────────────────────────────

  describe('AC20 - mergeSelectedGrunts log text', () => {
    it('produces one entry, actor = the new row, "formed from A, B.", no house-rule/CM wording (queued until the new row is rolled, RULINGS.md 2026-08-30)', () => {
      const a = component.addGrunt('A');
      const b = component.addGrunt('B');
      component.toggleMergeSelection(a);
      component.toggleMergeSelection(b);
      sent.length = 0;

      const result = component.mergeSelectedGrunts();
      expect(sent.length).toBe(0); // "the row goes in unrolled" (Decision 10)
      component['rollAndLogInitiative'](result.row!);

      const formedLines = sent.filter(e => e.text === 'formed from A, B.');
      expect(formedLines.length).toBe(1);
      expect(formedLines[0].actor).toBe(result.row!.name);
      expect(formedLines[0].text).not.toContain('house rule');
      expect(formedLines[0].text).not.toContain('Condition Monitor');
    });
  });

  // ── AC21 - the no-op-hit line ──────────────────────────────────────────────

  describe('AC21 - hitting an already-out member', () => {
    it('one entry, GM and player text identical, no slash/damage total/dead-alive', () => {
      const row = gmRow('Gangers');
      const g1 = component.addNpcToRow(row, 'G 1');
      component.applyRowMemberDamage(row, g1, g1.conditionMonitorBoxes, 'physical');
      sent.length = 0;

      component.applyRowMemberDamage(row, g1, 1, 'physical');

      expect(sent.length).toBe(1);
      expect(sent[0].text).toBe('G 1 already out of action — hit had no effect.');
      expect(sent[0].text).not.toContain('/');
      expect(sent[0].text).not.toMatch(/\d+\/\d+/); // no damage-total fraction
      expect(sent[0].text).not.toContain('dead');
      expect(sent[0].text).not.toContain('alive');
    });
  });

  // ── AC22 - the wiped-out line ──────────────────────────────────────────────

  describe('AC22 - a row wiped out by damage', () => {
    it('emits one GM-only entry, text exactly "every member is out of action.", off the wire', () => {
      const row = gmRow('Gangers');
      const g1 = component.addNpcToRow(row, 'G 1');
      sent.length = 0;
      component.sharedLogEntries = [];

      component.applyRowMemberDamage(row, g1, g1.conditionMonitorBoxes, 'physical');

      const wipeout = component.sharedLogEntries.find(e => e.text === 'every member is out of action.');
      expect(wipeout).withContext('GM-only entry').toBeTruthy();
      expect(wipeout!.hiddenFromPlayers).toBeTrue();
      expect(sent.some(e => e.text === 'every member is out of action.')).toBeFalse();
    });
  });

  // ── AC23, AC24 - group wound / recovery ──────────────────────────────────

  describe('AC23, AC24 - group wound and recovery lines', () => {
    it('AC23 - a wound: GM-only, houseRule, no "house rule" substring, no row name', () => {
      const row = gmRow('Gangers');
      const g1 = component.addNpcToRow(row, 'G 1');
      sent.length = 0;
      component.sharedLogEntries = [];

      component.applyRowMemberDamage(row, g1, 6, 'physical');

      expect(sent.some(e => /group wound/.test(e.text))).toBeFalse();
      const wound = component.sharedLogEntries.find(e => /group wound from G 1/.test(e.text));
      expect(wound).withContext('group wound entry').toBeTruthy();
      expect(wound!.text).toMatch(/^group wound from G 1 \(-\d+\) → shared score -?\d+$/);
      expect(wound!.hiddenFromPlayers).toBeTrue();
      expect(wound!.houseRule).toBeTrue();
      expect(wound!.text).not.toContain('house rule');
      expect(wound!.text).not.toContain('Gangers');
    });

    it('AC24 - the heal direction: group recovery, same two flags', () => {
      const row = gmRow('Gangers');
      const g1 = component.addNpcToRow(row, 'G 1');
      component.applyRowMemberDamage(row, g1, 6, 'physical');
      sent.length = 0;
      component.sharedLogEntries = [];

      component.healRowMember(row, g1, 6);

      expect(sent.some(e => /group recovery/.test(e.text))).toBeFalse();
      const recovery = component.sharedLogEntries.find(e => /group recovery from G 1/.test(e.text));
      expect(recovery).withContext('group recovery entry').toBeTruthy();
      expect(recovery!.text).toMatch(/^group recovery from G 1 \(\+\d+\) → shared score \d+$/);
      expect(recovery!.hiddenFromPlayers).toBeTrue();
      expect(recovery!.houseRule).toBeTrue();
    });
  });

  // ── AC25 - the house-rule badge ───────────────────────────────────────────

  describe('AC25 - the GM pane renders the house-rule badge', () => {
    it('renders exactly one badge, only for the entry carrying houseRule: true', () => {
      component.sharedLogEntries = [
        {
          actor: 'Gangers',
          text: 'group wound from G 1 (-2) → shared score 6',
          timestamp: new Date().toISOString(),
          hiddenFromPlayers: true,
          houseRule: true
        },
        {
          actor: 'Gangers',
          text: 'G 1 is out of action (dead)',
          timestamp: new Date().toISOString()
        }
      ];
      fixture.detectChanges();

      const badges = fixture.nativeElement.querySelectorAll('[data-testid="log-badge-house-rule"]');
      expect(badges.length).toBe(1);
    });
  });

  // ── AC26 - tooltip destinations ───────────────────────────────────────────

  describe('AC26 - tooltips carry the prose moved out of the log', () => {
    it('the merge button title carries the carried-damage/house-rule sentence', () => {
      const a = component.addGrunt('A');
      const b = component.addGrunt('B');
      component.toggleMergeSelection(a);
      component.toggleMergeSelection(b);
      fixture.detectChanges();

      const btn = fixture.nativeElement.querySelector('[data-testid="merge-grunts-btn"]') as HTMLElement;
      expect(btn.title).toContain('Condition Monitor damage carries over');
      expect(btn.title).toContain('house rule');
    });

    it('the Add-NPC button title carries the "own tests only" sentence', () => {
      gmRow('Gangers');
      fixture.detectChanges();

      const btn = fixture.nativeElement.querySelector('.npc-row-add-member') as HTMLElement;
      expect(btn.title).toContain('own tests only');
      expect(btn.title).toContain("group's shared score does not move");
    });

    it('the GROUP badge title says "keeps its place" only when the row is wiped out', () => {
      const row = gmRow('Gangers');
      const g1 = component.addNpcToRow(row, 'G 1');
      fixture.detectChanges();
      let badge = fixture.nativeElement.querySelector('[data-testid="badge-npc-row"]') as HTMLElement;
      expect(badge.title).not.toContain('keeps its place in the initiative order');

      component.applyRowMemberDamage(row, g1, g1.conditionMonitorBoxes, 'physical');
      fixture.detectChanges();

      badge = fixture.nativeElement.querySelector('[data-testid="badge-npc-row"]') as HTMLElement;
      expect(badge.title).toContain('keeps its place in the initiative order');
    });
  });

  // ── AC27, AC28 - VR mode dead-code removal ───────────────────────────────

  describe('AC27 - onVRModeChange writes no log entry', () => {
    it('produces zero entries mentioning "VR mode"', () => {
      const mp = matrixDecker('Decker');
      sent.length = 0;
      component.sharedLogEntries = [];

      component.onVRModeChange(mp, VRMode.HotSim);

      expect(sent.some(e => e.text.includes('VR mode'))).toBeFalse();
      expect(component.sharedLogEntries.some(e => e.text.includes('VR mode'))).toBeFalse();
    });
  });

  describe('AC28 - gmJackIn / gmJackOut / configure_deck are unaffected', () => {
    it('gmJackIn logs exactly one entry with unchanged text', () => {
      const mp = matrixDecker('Slamm-0');
      sent.length = 0;

      component.gmJackIn(mp);

      expect(sent.length).toBe(1);
      expect(sent[0].actor).toBe('Slamm-0');
      expect(sent[0].text).toBe('jacked in (AR)');
    });

    it('gmJackOut logs exactly one entry with unchanged text', () => {
      const mp = matrixDecker('Slamm-0');
      component.gmJackIn(mp);
      sent.length = 0;

      component.gmJackOut(mp);

      expect(sent.length).toBe(1);
      expect(sent[0].text).toBe('jacked out');
    });

    it('the configure_deck jack-in/jack-out branches log exactly one entry each', () => {
      command('register_character', PLAYER_TOKEN, {
        characterName: 'Slamm-0', initiativeDice: 1, reaction: 5, intuition: 5
      });
      sent.length = 0;

      command('configure_deck', PLAYER_TOKEN, {
        isMatrix: true, jackIn: true, vrMode: 'hot-sim', dataProcessing: 5
      });
      expect(sent.filter(e => e.text === 'jacked in (Hot Sim)').length).toBe(1);

      sent.length = 0;
      command('configure_deck', PLAYER_TOKEN, { isMatrix: true, jackOut: true, dataProcessing: 5 });
      expect(sent.filter(e => e.text === 'jacked out').length).toBe(1);
    });
  });

  // ── AC29 - no leaked token, no literal "GM" actor ─────────────────────────

  describe('AC29 - no pl- token and no literal "GM" actor for a participant-attributed event', () => {
    it('holds across a GM Act, a GM interrupt and a player Act', () => {
      const sarah = addCombatant('Sarah');
      component.actModalParticipant = sarah;
      component['declaredActionSelections'].set(sarah, { free: 'Drop Prone', simple: [], complex: null });
      component.submitActModal();

      const ganger2 = addCombatant('Ganger 2');
      ganger2.baseIni = 15;
      component.btnAction_Click(ganger2, FULL_DEFENSE);

      const wombat = addCombatant('Wombat');
      wombat.status = StatusEnum.Active;
      component['participantOwners'].set(wombat, PLAYER_TOKEN);
      command('act', PLAYER_TOKEN, { participantId: component['getParticipantId'](wombat) });

      expect(sent.length).toBe(3);
      for (const entry of sent) {
        expect(entry.actor).not.toMatch(/^pl-/);
        expect(entry.actor).not.toBe('GM');
        expect(entry.text).not.toMatch(/pl-[a-z0-9]{8}/);
      }
    });
  });

  // ── Gameplay scenarios ─────────────────────────────────────────────────

  describe('S1 - GM declares a mixed action set mid-combat', () => {
    it('logs one classified, highlighted sentence and advances the order as before', () => {
      const sarah = addCombatant('Sarah');
      sarah.baseIni = 10;
      sarah.setDicesWithoutRoll(1);
      sarah.diceIni = 4; // Score 14
      const rival = addCombatant('Rival');
      rival.baseIni = 5;
      rival.setDicesWithoutRoll(1);
      rival.diceIni = 1; // Score 6, lower - acts after Sarah

      CombatManager.started = true;
      CombatManager.passEnded = false;
      CombatManager.goToNextActors();
      expect(CombatManager.currentActors.items).toEqual([sarah]);

      sent.length = 0;
      component.actModalParticipant = sarah;
      component['declaredActionSelections'].set(sarah, {
        free: 'Drop Prone', simple: ['Take Aim', 'Take Aim'], complex: null
      });

      component.submitActModal();

      expect(sent.length).toBe(1);
      expect(sent[0].actor).toBe('Sarah');
      expect(sent[0].text).toBe('dropped prone (free) and took aim twice (simple).');
      expect(sent[0].actor).not.toBe('GM');
      expect(sent[0].text).not.toContain('Free:');
      expect(sent[0].text).not.toContain('|');
      expect(getLogTextClass(sent[0].text)).toBe('log-text-action');
      const html = formatLogText(sent[0].text);
      expect((html.match(/log-keyword-action/g) || []).length).toBe(2);
      expect(html).toContain('dropped prone');
      expect(html).toContain('took aim twice');
      // The order actually advanced: Sarah finished, Rival is up next.
      expect(sarah.status).toBe(StatusEnum.Finished);
      expect(CombatManager.currentActors.items).toEqual([rival]);
    });
  });

  describe('S2 - a repeated action, an unknown action, and a row member at once', () => {
    it('keeps row attribution for the member and classifies a stale client payload', () => {
      const row = gmRow('Gangers');
      const g1 = component.addNpcToRow(row, 'G 1');
      const g2 = component.addNpcToRow(row, 'G 2'); // a second member still owes an action
      CombatManager.started = true;
      CombatManager.passEnded = false;
      CombatManager.goToNextActors();
      sent.length = 0;

      component['performRowMemberAct'](row, g1,
        DeclaredActionEngine.buildDeclaredActionLog({ free: null, simple: ['Take Aim', 'Take Aim'], complex: null }));

      expect(sent.length).toBe(1);
      expect(sent[0].actor).toBe('Gangers');
      expect(sent[0].text).toBe('G 1 took aim twice (simple).');
      expect(g1.hasActed).toBeTrue();
      // The row keeps the current-actor slot: G 2 still owes an action.
      expect(g2.hasActed).toBeFalse();
      expect(CombatManager.currentActors.items).toEqual([row]);

      // A stale player client still sending the old "Free: X" shape.
      const wombat = addCombatant('Wombat');
      wombat.status = StatusEnum.Active;
      component['participantOwners'].set(wombat, PLAYER_TOKEN);
      sent.length = 0;

      command('act', PLAYER_TOKEN, {
        participantId: component['getParticipantId'](wombat),
        declaredAction: 'Free: Gesture'
      });

      expect(sent.length).toBe(1);
      expect(sent[0].actor).toBe('Wombat');
      expect(sent[0].text).toBe('Free: Gesture');
      expect(getLogTextClass(sent[0].text)).toBe('log-text-action');

      for (const entry of sent) {
        expect(entry.actor).not.toBe('GM');
        expect(entry.actor).not.toMatch(/^pl-/);
      }
    });
  });

  describe('S3 - a mis-keyed killing blow, corrected by heal rather than undo', () => {
    it('reverts cleanly by healing the same boxes back off, and reads with the new wording throughout', () => {
      const row = gmRow('Gangers');
      const g2 = component.addNpcToRow(row, 'G 2'); // Body 3 -> 10-box track
      sent.length = 0;
      component.sharedLogEntries = [];
      const localBefore = LogHandler.logbook.length;

      component.applyRowMemberDamage(row, g2, 10, 'physical');

      // Player-safe copy (what the wire, and so the GM's shared-log pane
      // during a live session, actually carries - Decision 17): no running
      // damage total, no final-attack state.
      const shared = component.sharedLogEntries.filter(e => !e.hiddenFromPlayers).map(e => e.text);
      expect(shared.some(t => /^G 2 took 10 Physical/.test(t))).withContext('damage line').toBeTrue();
      expect(shared).toContain('G 2 is out of action');
      // The GM's own fuller local text (brief section D: not on the wire,
      // pre-existing and out of scope to change) carries the p. 379 verdict.
      const local = LogHandler.logbook.slice(localBefore).map(e => e.text);
      expect(local.some(t => /G 2 is out of action \(dead\)/.test(t))).withContext('GM final-state text').toBeTrue();
      const wound = component.sharedLogEntries.find(e => /group wound from G 2/.test(e.text));
      expect(wound).withContext('group wound entry').toBeTruthy();
      expect(wound!.hiddenFromPlayers).toBeTrue();
      expect(wound!.houseRule).toBeTrue();

      // Correction path: heal the same boxes back off (RULINGS.md 2026-08-07)
      // rather than reaching for an undo control - there is none.
      component.healRowMember(row, g2, 10);

      // The damage, shared score and out-of-action state all revert...
      expect(g2.outOfAction).toBeFalse();
      expect(g2.damage).toBe(0);
    });

    it('the heal correction path reads "healed", "back in action" and "group recovery"', () => {
      const row = gmRow('Gangers');
      const g2 = component.addNpcToRow(row, 'G 2');
      component.applyRowMemberDamage(row, g2, 10, 'physical');
      sent.length = 0;
      component.sharedLogEntries = [];

      component.healRowMember(row, g2, 10);

      const shared = component.sharedLogEntries.filter(e => !e.hiddenFromPlayers).map(e => e.text);
      expect(shared.some(t => /^G 2 healed 10/.test(t))).withContext('heal line').toBeTrue();
      expect(shared).toContain('G 2 is back in action - Condition Monitor no longer full');
      const recovery = component.sharedLogEntries.find(e => /group recovery from G 2/.test(e.text));
      expect(recovery).withContext('group recovery entry').toBeTruthy();
      expect(recovery!.hiddenFromPlayers).toBeTrue();
      expect(recovery!.houseRule).toBeTrue();
    });
  });

  describe('S4 - live at the table, mid-combat, players waiting', () => {
    it('a reinforcement, an interrupt and a stale empty Act all read with no "GM" credit', () => {
      const row = gmRow('Gangers');
      component.addNpcToRow(row, 'G 1');
      // The row has taken its own Initiative Test by the time reinforcements
      // arrive (Decision 7's precondition, and per RULINGS.md 2026-08-30 the
      // precondition for the *join line itself* announcing immediately
      // rather than queuing).
      component['rollAndLogInitiative'](row);
      const scoreBefore = row.getCurrentInitiative();

      // A reinforcement walks in already hurt (Decision 7's join-time case).
      const originalAddMember = row.addMember.bind(row);
      spyOn(row, 'addMember').and.callFake((member: GruntMember) => {
        member.applyDamage(6, 'physical');
        return originalAddMember(member);
      });
      sent.length = 0;

      component.addNpcToRow(row, 'Ganger 4');

      const joinLines = sent.filter(e => e.text === 'Ganger 4 joined the group, arrives wounded (-2).');
      expect(joinLines.length).toBe(1);
      expect(row.getCurrentInitiative()).toBe(scoreBefore); // Score-neutral join

      // The GM hovers Add NPC and reads the answer off the tooltip.
      fixture.detectChanges();
      const addBtn = fixture.nativeElement.querySelector('.npc-row-add-member') as HTMLElement;
      expect(addBtn.title).toContain('own tests only');

      // A moment later: Interrupt -> Full Defense on a different participant.
      const ganger2 = addCombatant('Ganger 2');
      ganger2.baseIni = 15;
      sent.length = 0;
      component.btnAction_Click(ganger2, FULL_DEFENSE);

      expect(sent.length).toBe(1);
      expect(sent[0].actor).toBe('Ganger 2');
      expect(sent[0].text).toBe('interrupted, going full defense.');

      // A third player taps Act with nothing selected (stale client, empty payload).
      const wombat = addCombatant('Wombat');
      wombat.status = StatusEnum.Active;
      component['participantOwners'].set(wombat, PLAYER_TOKEN);
      sent.length = 0;

      command('act', PLAYER_TOKEN, { participantId: component['getParticipantId'](wombat) });

      expect(sent.length).toBe(1);
      expect(sent[0].actor).toBe('Wombat');
      expect(sent[0].text).toBe('passed their action.');

      for (const entry of sent) {
        expect(entry.actor).not.toBe('GM');
        expect(entry.actor).not.toMatch(/^pl-/);
      }
    });
  });

  describe('S5 - wipe-out during a hidden-roll session', () => {
    it('keeps the wipe-out line GM-only and off the wire, without spending the GM-roll one-shot', () => {
      const row = gmRow('Gangers');
      const g1 = component.addNpcToRow(row, 'G 1'); // Body 3 -> 10-box track
      component.toggleGmRollVisibility();
      component.toggleHideNextGmRoll();
      sent.length = 0;
      component.sharedLogEntries = [];

      component.applyRowMemberDamage(row, g1, g1.conditionMonitorBoxes, 'physical');

      // Player-safe copy of the "out of action" line (no final-attack state -
      // that detail is GM-only text, brief section D / Decision 17).
      expect(sent.some(e => e.text === 'G 1 is out of action')).toBeTrue();
      const wipeout = component.sharedLogEntries.find(e => e.text === 'every member is out of action.');
      expect(wipeout).withContext('GM-only wipe-out entry').toBeTruthy();
      expect(wipeout!.hiddenFromPlayers).toBeTrue();
      expect(sent.some(e => e.text === 'every member is out of action.')).toBeFalse();
      // The GM-roll one-shot is untouched by any of this.
      expect(component.hideNextGmRoll).toBeTrue();
    });
  });
});
