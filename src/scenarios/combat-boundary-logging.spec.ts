// Promoted scenarios for briefs/combat-boundary-logging-spec.md ("Action Log
// entries for combat structural boundaries").
//
// Covers the brief's gameplay scenarios S1-S7 verbatim (each `describe`
// below is named for its scenario) plus one focused test per acceptance
// criterion that no scenario exercises directly, so AC1-AC17 all have
// coverage somewhere in this file. The subject is the five new/changed
// shared Action Log entries for Initiative Pass end, Combat Turn
// start/end, and Combat start/end - not turn/pass mechanics themselves,
// which have their own suite (running-initiative-score.spec.ts) and are
// untouched by this change.

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BattleTrackerComponent } from 'app/battle-tracker/battle-tracker.component';
import { appConfig } from 'app/app.config';
import { CombatManager } from 'Combat';
import { Participant, INITIATIVE_PASS_DECAY } from 'Combat/Participants/Participant';
import { NpcRowParticipant, GruntMember } from 'Grunts';
import { SessionCommand, SessionSyncService, SharedLogEntry } from 'app/services/session-sync.service';
import { ConfirmationDialogService } from 'app/confirmation-dialog/confirmation-dialog.service';
import {
  getLogTextClass,
  formatPassStartLogText,
  formatPassEndLogText,
  formatTurnStartLogText,
  formatTurnEndLogText,
  COMBAT_STARTED_LOG_TEXT,
  COMBAT_ENDED_LOG_TEXT
} from 'app/shared/log-formatter';
import { LogHandler } from 'Logging';

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

/** Every text the five new/changed structural-boundary entries can produce. */
const STRUCTURAL_PATTERN =
  /^(Combat started|Combat ended|Start Combat Turn \d+|End Combat Turn \d+|Start Initiative Pass \d+(?: — all Initiative Scores -\d+)?|End Initiative Pass \d+)$/;

describe('Action Log entries for combat structural boundaries', () => {
  let component: BattleTrackerComponent;
  let fixture: ComponentFixture<BattleTrackerComponent>;
  let sync: SessionSyncService;
  let dialog: ConfirmationDialogService;
  /** Entries that actually went out on the wire, in send order. */
  let sent: SharedLogEntry[];
  /** Commands sent via `sessionSync.sendCommand`, in send order. */
  let sentCommands: SessionCommand[];

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
    dialog = TestBed.inject(ConfirmationDialogService);
    sent = [];
    // Stand in for the server echo, exactly as action-log-attribution.spec.ts
    // does: a broadcast entry reaches the GM's own pane by coming back from
    // the server, which is what puts visible and hidden entries into one
    // ordered list (needed for S4's cross-entry ordering assertions).
    spyOn(sync, 'appendLog').and.callFake((entry: SharedLogEntry) => {
      sent.push(entry);
      component['insertSharedLogEntry'](entry);
    });
    sentCommands = [];
    spyOn(sync, 'sendCommand').and.callFake((cmd: SessionCommand) => {
      sentCommands.push(cmd);
    });

    component.shareRoomCode = 'ABC123';
    component.sharedLogEntries = [];
  });

  afterEach(() => {
    resetCombat();
  });

  // ── helpers ────────────────────────────────────────────────────────────

  /**
   * A plain participant with a fully-rolled Initiative Score
   * (`baseIni + roll`, wound modifier 0) and `diceIni > 0`, so
   * `hasPendingInitiativeRolls()` never blocks `btnStartRound_Click`.
   */
  function makeScored(name: string, baseIni: number, roll: number): Participant {
    const p = new Participant();
    p.name = name;
    p.baseIni = baseIni;
    p.setDicesWithoutRoll(1);
    CombatManager.participants.insert(p, false);
    p.diceIni = roll;
    return p;
  }

  /** Just the five structural-boundary lines, in send order. */
  function structuralTexts(): string[] {
    return sent.filter(e => STRUCTURAL_PATTERN.test(e.text)).map(e => e.text);
  }

  function passStart(pass: number): string {
    return formatPassStartLogText(pass, INITIATIVE_PASS_DECAY);
  }

  /** GM taps Act on whichever participant currently holds the initiative slot. */
  function actCurrent(): void {
    const actor = CombatManager.currentActors.items[0];
    component['performAct'](actor, null);
  }

  // ── S1 ─────────────────────────────────────────────────────────────────

  describe('S1 - an ordinary two-pass Combat Turn, start to finish', () => {
    it('logs every boundary once, in order, with no line for a pass that never started', async () => {
      makeScored('A', 15, 5); // Score 20
      makeScored('B', 10, 4); // Score 14
      makeScored('C', 5, 3);  // Score 8

      await component.btnStartRound_Click();
      actCurrent(); // A (20) acts
      actCurrent(); // B (14) acts
      actCurrent(); // C (8) acts -> pass 1 ends

      component.btnNextPass_Click(); // -10 each: 10, 4, -2 -> Start Initiative Pass 2
      actCurrent(); // 10 acts
      actCurrent(); // 4 acts -> pass 2 ends (both still > 0 before this decay)

      component.btnNextPass_Click(); // -10 each: 0, -6, -12 -> nobody -> End Combat Turn 1

      expect(structuralTexts()).toEqual([
        COMBAT_STARTED_LOG_TEXT,
        formatTurnStartLogText(1),
        passStart(1),
        formatPassEndLogText(1),
        passStart(2),
        formatPassEndLogText(2),
        formatTurnEndLogText(1)
      ]);
      expect(sent.filter(e => STRUCTURAL_PATTERN.test(e.text)).every(e => e.actor === 'GM')).toBe(true);
      expect(structuralTexts().some(t => t.includes('Pass 3'))).toBe(false);
      expect(CombatManager.combatTurn).toBe(2);
      expect(CombatManager.started).toBe(false);
    });
  });

  // ── S2 ─────────────────────────────────────────────────────────────────

  describe('S2 - a delayed runner acts after the pass has already ended', () => {
    it('produces no second End Initiative Pass entry for that pass', async () => {
      const a = makeScored('A', 15, 5); // Score 20
      makeScored('B', 10, 4);           // Score 14

      await component.btnStartRound_Click();
      component.btnDelay_Click(a); // A delays; B takes the slot
      actCurrent(); // B acts -> pass ends here (A is Delaying, not Waiting)

      const passEndIndex = sent.findIndex(e => e.text === formatPassEndLogText(1));
      expect(passEndIndex).toBeGreaterThan(-1);
      expect(sent.filter(e => e.text === formatPassEndLogText(1)).length).toBe(1);

      component['performAct'](a, null); // GM taps Act on A (still visible, Delaying)

      expect(sent.filter(e => e.text === formatPassEndLogText(1)).length).toBe(1);
      const aActionIndex = sent.findIndex(e => e.actor === 'A');
      expect(aActionIndex).toBeGreaterThan(passEndIndex);
      expect(structuralTexts()).toEqual([
        COMBAT_STARTED_LOG_TEXT,
        formatTurnStartLogText(1),
        passStart(1),
        formatPassEndLogText(1)
      ]);
    });
  });

  // ── S3 ─────────────────────────────────────────────────────────────────

  describe('S3 - the GM mis-taps Next Initiative Pass and undoes it', () => {
    it('undo emits no new entries and removes none; the redo tap re-adds the pass-start line', async () => {
      makeScored('A', 10, 5); // Score 15
      makeScored('B', 3, 2);  // Score 5

      await component.btnStartRound_Click();
      actCurrent(); // A acts
      actCurrent(); // B acts -> pass 1 ends
      expect(sent.filter(e => e.text === formatPassEndLogText(1)).length).toBe(1);

      component.btnNextPass_Click(); // -10 each: 5, -5 -> Start Initiative Pass 2
      expect(CombatManager.initiativePass).toBe(2);
      expect(sent.filter(e => e.text === passStart(2)).length).toBe(1);

      const sentLengthBeforeUndo = sent.length;
      component.btnUndo_Click();

      expect(CombatManager.initiativePass).toBe(1);
      expect(sent.length).toBe(sentLengthBeforeUndo);

      component.btnNextPass_Click();

      expect(CombatManager.initiativePass).toBe(2);
      expect(sent.filter(e => e.text === passStart(2)).length).toBe(2);
      expect(sent.filter(e => e.text === formatPassEndLogText(1)).length).toBe(1);
    });
  });

  // ── S4 ─────────────────────────────────────────────────────────────────

  describe('S4 - live at the table, mid-combat, players waiting', () => {
    it('a wiped-out row ends the pass, then the turn, then combat ends cleanly', async () => {
      const player = makeScored('Runner', 2, 1); // Score 3
      const row = new NpcRowParticipant();
      row.name = 'Gangers';
      row.baseIni = 1;
      row.setDicesWithoutRoll(1);
      CombatManager.participants.insert(row, false);
      row.diceIni = 1; // Score 2
      const g1 = new GruntMember('G 1', 3, 3);
      row.addMember(g1);

      // Combat Turn 2, Initiative Pass 3: the player has already acted this
      // pass, the row holds the current-actor slot.
      CombatManager.started = true;
      CombatManager.passEnded = false;
      CombatManager.combatTurn = 2;
      CombatManager.initiativePass = 3;
      CombatManager.goToNextActors();
      expect(CombatManager.currentActors.items).toEqual([player]);
      CombatManager.act(player);
      expect(CombatManager.currentActors.items).toEqual([row]);

      sent.length = 0;
      component.sharedLogEntries = [];

      // The GM applies a lethal Damage Value to the row's last member.
      component.applyRowMemberDamage(row, g1, g1.conditionMonitorBoxes, 'physical');

      const paneTexts = component.sharedLogEntries.map(e => e.text);
      const outOfActionIdx = paneTexts.findIndex(t => t.includes('is out of action'));
      const wipedIdx = paneTexts.indexOf('every member is out of action.');
      const passEndIdx = paneTexts.indexOf(formatPassEndLogText(3));
      expect(outOfActionIdx).toBeGreaterThan(-1);
      expect(wipedIdx).toBeGreaterThan(outOfActionIdx);
      expect(passEndIdx).toBeGreaterThan(wipedIdx);
      const wipedEntry = component.sharedLogEntries[wipedIdx];
      expect(wipedEntry.hiddenFromPlayers).toBe(true); // GM-only (Decision 17)

      // GM taps the button, now labelled End Combat Turn (3-10 and 2-10 are
      // both below 1).
      sent.length = 0;
      component.btnNextPass_Click();

      expect(structuralTexts()).toEqual([formatTurnEndLogText(2)]);
      expect(structuralTexts().some(t => t.includes('Pass 4'))).toBe(false);

      // GM taps End Combat and confirms.
      spyOn(dialog, 'simpleConfirm').and.resolveTo(true);
      sent.length = 0;
      await component.btnReset_Click();

      expect(sent[sent.length - 1].text).toBe(COMBAT_ENDED_LOG_TEXT);
      expect(sentCommands.map(c => c.type)).toEqual(['combat_ended', 'clear_roll_prompt']);
      for (const entry of sent) {
        expect(entry.actor).not.toMatch(/^pl-/);
        expect(entry.text).not.toContain('pl-');
      }
    });
  });

  // ── S5 ─────────────────────────────────────────────────────────────────

  describe('S5 - a second fight in the same session', () => {
    it('re-announces Combat started and End Combat Turn 1 rather than suppressing them as repeats', async () => {
      // Both encounters are driven end-to-end through the same user-facing
      // actions S1 uses (Start Combat Turn, act, Next Initiative Pass) rather
      // than a direct `CombatManager.endCombatTurn()` call - a single
      // full-score combatant needs exactly one act (ends pass 1, since their
      // Score is untouched by acting) and one pass decay (ends the turn) to
      // reach a genuine turn end, so this is a real regression test of the
      // repeat-suppression behaviour, not a restatement of the `isNewCombat`
      // boolean condition it depends on.
      makeScored('First', 5, 5); // Score 10
      await component.btnStartRound_Click();
      actCurrent(); // First acts -> pass 1 ends (Score unchanged, still > 0)
      component.btnNextPass_Click(); // -10: 0 -> nobody -> End Combat Turn 1
      expect(CombatManager.combatTurn).toBe(2);
      expect(CombatManager.started).toBe(false);

      spyOn(dialog, 'simpleConfirm').and.resolveTo(true);
      await component.btnReset_Click();
      expect(CombatManager.combatTurn).toBe(1);
      expect(CombatManager.started).toBe(false);

      sent.length = 0;
      // A fresh encounter: `endCombat()` soft-resets 'First' rather than
      // removing it (ARCHITECTURE.md §2), which would leave it with an
      // un-rolled `diceIni` and block `btnStartRound_Click` on a pending-roll
      // prompt that has nothing to do with this scenario - so it is cleared
      // here the way a GM starting a new scene actually would (deleting or
      // replacing the roster), leaving only the state this scenario cares
      // about: `combatTurn`/`started` already reset by End Combat.
      CombatManager.participants.clear(false);
      makeScored('Newcomer', 5, 5); // Score 10
      await component.btnStartRound_Click();
      actCurrent(); // Newcomer acts -> pass 1 ends
      component.btnNextPass_Click(); // -10: 0 -> nobody -> End Combat Turn 1

      expect(structuralTexts()).toEqual([
        COMBAT_STARTED_LOG_TEXT,
        formatTurnStartLogText(1),
        passStart(1),
        formatPassEndLogText(1),
        formatTurnEndLogText(1)
      ]);
    });
  });

  // ── S6 ─────────────────────────────────────────────────────────────────

  describe('S6 - no session open', () => {
    it('produces zero shared entries and no local mirror, for the whole of S1', async () => {
      component.shareRoomCode = '';
      LogHandler.logbook.length = 0;

      makeScored('A', 15, 5); // Score 20
      makeScored('B', 10, 4); // Score 14
      makeScored('C', 5, 3);  // Score 8

      await component.btnStartRound_Click();
      actCurrent();
      actCurrent();
      actCurrent();
      component.btnNextPass_Click();
      actCurrent();
      actCurrent();
      component.btnNextPass_Click();

      expect(sent.length).toBe(0);
      expect(LogHandler.logbook.some(e => e.text.includes('Combat started'))).toBe(false);
      expect(LogHandler.logbook.some(e => e.text.includes('End Initiative Pass'))).toBe(false);
      expect(LogHandler.logbook.some(e => e.text.includes('End Combat Turn'))).toBe(false);
      expect(LogHandler.logbook.some(e => e.text.includes('Combat ended'))).toBe(false);
      // Local click markers are unaffected.
      expect(LogHandler.logbook.some(e => e.text === 'StartRound_Click')).toBe(true);
      expect(LogHandler.logbook.some(e => e.text === 'NextPass_Click')).toBe(true);
    });
  });

  // ── S7 ─────────────────────────────────────────────────────────────────

  describe('S7 - everyone is already down', () => {
    it('logs the turn number correctly on both ends of the cascade (AC12)', async () => {
      const p = makeScored('Downed', 5, 5); // Score 10, but OOC
      p.ooc = true;

      await component.btnStartRound_Click();

      expect(structuralTexts()).toEqual([
        COMBAT_STARTED_LOG_TEXT,
        formatTurnStartLogText(1),
        passStart(1),
        formatTurnEndLogText(1)
      ]);
      expect(CombatManager.combatTurn).toBe(2);
    });
  });

  // ── Remaining acceptance criteria not pinned by a scenario above ────────

  describe('AC8 - btnReset_Click confirmation declined', () => {
    it('produces zero log entries and sends zero commands', async () => {
      makeScored('A', 10, 5);
      await component.btnStartRound_Click();
      sent.length = 0;
      sentCommands.length = 0;

      spyOn(dialog, 'simpleConfirm').and.resolveTo(false);
      await component.btnReset_Click();

      expect(sent.length).toBe(0);
      expect(sentCommands.length).toBe(0);
    });
  });

  describe('AC7 - the former "End Combat" literal is gone', () => {
    it('never sends a standalone "End Combat" text', async () => {
      makeScored('A', 10, 5);
      await component.btnStartRound_Click();
      spyOn(dialog, 'simpleConfirm').and.resolveTo(true);
      sent.length = 0;

      await component.btnReset_Click();

      expect(sent.some(e => e.text === 'End Combat')).toBe(false);
      expect(sent.filter(e => e.text === COMBAT_ENDED_LOG_TEXT).length).toBe(1);
    });
  });

  describe('AC10 - every new entry text classifies as a system line', () => {
    const texts = [
      COMBAT_STARTED_LOG_TEXT,
      COMBAT_ENDED_LOG_TEXT,
      formatTurnStartLogText(1),
      formatTurnEndLogText(1),
      formatPassEndLogText(1),
      formatPassEndLogText(2)
    ];

    for (const text of texts) {
      it(`classifies "${text}" as log-text-system`, () => {
        expect(getLogTextClass(text)).toBe('log-text-system');
      });
    }
  });

  describe('AC13 - restoreFromSharedState produces zero boundary entries', () => {
    it('emits nothing regardless of the incoming round/pass/started/passEnded', () => {
      makeScored('A', 10, 5);
      expect(CombatManager.combatTurn).toBe(1);
      expect(CombatManager.initiativePass).toBe(1);
      expect(CombatManager.started).toBe(false);
      expect(CombatManager.passEnded).toBe(true);
      sent.length = 0;
      component.sharedLogEntries = [];

      // `restoreFromSharedState` early-returns unless `state.participants` is
      // non-empty (Defect 2 fix round: an empty array short-circuits before the
      // state-restoring body ever runs, which would make this test pass
      // identically even if a future change added an `appendSharedLog` call
      // inside that body). One participant is enough to clear the guard and
      // actually exercise the restore.
      component['restoreFromSharedState']({
        round: 3,
        pass: 2,
        started: true,
        passEnded: false,
        currentInitiative: 5,
        participants: [
          {
            id: 'p-restored',
            name: 'Restored',
            order: 1,
            active: false,
            playerControlled: false,
            initiativeScore: 12,
            initiativeDice: 1,
            rolledInitiativeTotal: 5
          }
        ],
        oocParticipantCount: 0
      });

      // Proof the restore body actually ran, not just the early-return guard:
      // every one of round/pass/started/passEnded now reflects the snapshot,
      // not the pre-restore combat state asserted above.
      expect(CombatManager.combatTurn).toBe(3);
      expect(CombatManager.initiativePass).toBe(2);
      expect(CombatManager.started).toBe(true);
      expect(CombatManager.passEnded).toBe(false);

      expect(sent.filter(e => STRUCTURAL_PATTERN.test(e.text)).length).toBe(0);
      expect(component.sharedLogEntries.filter(e => STRUCTURAL_PATTERN.test(e.text)).length).toBe(0);
    });
  });

  describe('AC15 - the two new listeners are nulled in ngOnDestroy', () => {
    it('alongside the existing onSpentNpcRowsFlagged teardown', () => {
      expect(component.combatManager.onInitiativePassEnded).not.toBeNull();
      expect(component.combatManager.onCombatTurnEnded).not.toBeNull();

      component.ngOnDestroy();

      expect(component.combatManager.onSpentNpcRowsFlagged).toBeNull();
      expect(component.combatManager.onInitiativePassEnded).toBeNull();
      expect(component.combatManager.onCombatTurnEnded).toBeNull();
    });
  });

  // ── Fix-round regression: Defect 1 ───────────────────────────────────────
  //
  // A boundary line must never appear above its own cause. Three call sites
  // (`btnLeaveCombat_Click`, the `configure_deck` jack-in type-swap path, and
  // `mergeSelectedGrunts`) used to call `combatManager.act()` /
  // `removeParticipant()` - which can cascade synchronously into
  // `endInitiativePass()`/`endCombatTurn()` and reserve that boundary line's
  // slot in `sent` - *before* logging their own causing action, so the
  // boundary line landed above the event that caused it. Each test below sets
  // up the participant the fix site removes/re-adds as the current actor, so
  // the cascade is guaranteed to actually fire a boundary line, and asserts
  // the causing line is first and the boundary line comes after it.

  describe('Defect 1 - btnLeaveCombat_Click logs before the boundary it can cause', () => {
    it('"A left combat" precedes End Combat Turn 1 when A is the sole, currently-acting participant', async () => {
      const a = makeScored('A', 5, 5); // Score 10, sole participant
      await component.btnStartRound_Click();
      sent.length = 0;
      expect(CombatManager.currentActors.items).toEqual([a]);

      component.btnLeaveCombat_Click(a);

      expect(sent.length).toBeGreaterThan(1);
      expect(sent[0].text).toBe('A left combat');
      expect(sent.slice(1).some(e => STRUCTURAL_PATTERN.test(e.text))).toBe(true);
      // Specifically the turn line: A leaving combat makes it the only
      // participant that is now `ooc`, so `isOver()` is true immediately and
      // only the turn-end hook fires (Open Decision 2) - not a separate pass
      // end.
      expect(sent.some(e => e.text === formatTurnEndLogText(1))).toBe(true);
    });
  });

  describe('Defect 1 - mergeSelectedGrunts logs before the boundary it can cause', () => {
    it('"formed from" precedes any boundary line produced by removing the acting grunt', () => {
      // Neither grunt has rolled Initiative this turn (`diceIni` stays 0) -
      // `mergeGruntsIntoRow` refuses any grunt that has, so a positive Score
      // from `baseIni` alone (no dice) is what makes G1 eligible to be the
      // current actor while still being merge-eligible.
      const g1 = component.addGrunt('G1');
      const g2 = component.addGrunt('G2');
      g1.baseIni = 10; // Score 10 - the current actor
      g2.baseIni = 0;  // Score 0 - never eligible to take the vacated slot
      sent.length = 0;
      CombatManager.started = true;
      CombatManager.passEnded = false;
      CombatManager.combatTurn = 1;
      // Pass 2, not 1: `mergeSelectedGrunts` inserts the new row via
      // `addParticipant(row, /* carriesRunningScore */ false)` (it is a new
      // participant, not a joiner - criterion 15, p. 160), and the row's
      // Score starts as G1's `baseIni` (`mergeGruntsIntoRow` sets
      // `row.baseIni = grunts[0].baseIni`). In pass 1 that would hand the
      // vacated slot straight back to the row and no boundary would fire; the
      // late-entry -10 (once per elapsed pass) brings the row's Score to 0
      // here, so removing G1 (the current actor) empties `currentActors` for
      // real and the cascade reaches `endInitiativePass()`.
      CombatManager.initiativePass = 2;
      CombatManager.goToNextActors();
      expect(CombatManager.currentActors.items).toEqual([g1]);

      component.toggleMergeSelection(g1);
      component.toggleMergeSelection(g2);
      const result = component.mergeSelectedGrunts();

      expect(result.ok).toBe(true);
      expect(sent.length).toBeGreaterThan(1);
      expect(sent[0].text).toContain('formed from');
      expect(sent.slice(1).some(e => STRUCTURAL_PATTERN.test(e.text))).toBe(true);
    });
  });

  describe('Defect 1 - configure_deck jack-in logs before the boundary it can cause', () => {
    it('"jacked in" precedes any boundary line produced by the type swap', () => {
      const runner = makeScored('Runner', 4, 6); // Score 10, sole participant
      component['participantOwners'].set(runner, 'pl-runner');
      sent.length = 0;
      CombatManager.started = true;
      CombatManager.passEnded = false;
      CombatManager.combatTurn = 1;
      CombatManager.initiativePass = 1;
      CombatManager.goToNextActors();
      expect(CombatManager.currentActors.items).toEqual([runner]);

      component['handleSessionCommand']({
        type: 'configure_deck',
        player: 'pl-runner',
        payload: { isMatrix: true, jackIn: true, vrMode: 'hot-sim', dataProcessing: 5 },
        timestamp: new Date().toISOString()
      });

      expect(sent.length).toBeGreaterThan(1);
      expect(sent[0].text).toBe('jacked in (Hot Sim)');
      expect(sent.slice(1).some(e => STRUCTURAL_PATTERN.test(e.text))).toBe(true);
    });
  });

  // ── Fix-round regression: Defect 7 ───────────────────────────────────────
  //
  // The seventh site of the "boundary line lands above its own cause" class
  // of bug (Defect 1's family), left alone in the first fix round because it
  // looked simple and wasn't: `btnNextPass_Click` itself. `nextIniPass()`
  // starts a genuinely new pass and `goToNextActors()` can cascade straight
  // into `endInitiativePass()` for that same pass, synchronously, before the
  // click handler gets back around to logging that pass's own start line -
  // reachable whenever a pass-start decay leaves every remaining
  // above-zero participant `Delaying` rather than `Waiting` (an ordinary
  // "everyone is holding their action" situation). Distinct from the
  // existing phantom-pass guard (AC4, exercised throughout S1/S4/S5/S7):
  // that case is a pass that never starts at all and must never get a start
  // line; this one is a real pass that starts and immediately re-ends, and
  // its start line must still land first.

  describe('Defect 7 - btnNextPass_Click logs a pass\'s start line before its own immediate end', () => {
    it('Start Initiative Pass 2 precedes End Initiative Pass 2 when both combatants are Delaying', async () => {
      const a = makeScored('A', 15, 5); // Score 20
      const b = makeScored('B', 10, 4); // Score 14

      await component.btnStartRound_Click();
      expect(CombatManager.currentActors.items).toEqual([a]);
      component.btnDelay_Click(a); // A delays; B takes the slot
      expect(CombatManager.currentActors.items).toEqual([b]);
      component.btnDelay_Click(b); // B delays too -> nobody Waiting -> pass 1 ends
      expect(sent.filter(e => e.text === formatPassEndLogText(1)).length).toBe(1);

      sent.length = 0;
      component.btnNextPass_Click(); // -10 each: A 10, B 4, both still Delaying

      expect(structuralTexts()).toEqual([passStart(2), formatPassEndLogText(2)]);
      const startIndex = sent.findIndex(e => e.text === passStart(2));
      const endIndex = sent.findIndex(e => e.text === formatPassEndLogText(2));
      expect(startIndex).toBeGreaterThan(-1);
      expect(endIndex).toBeGreaterThan(startIndex);
      expect(structuralTexts().some(t => t.includes('Pass 3'))).toBe(false);
    });
  });

  // AC4 regression: the phantom-pass guard this fix must not disturb. Same
  // assertion S1/S4/S5/S7 already make, isolated here so the fix above has a
  // focused counter-example alongside it: a click that ends the Combat Turn
  // still produces no "Start Initiative Pass" line for the pass number
  // `nextIniPass()` produced.
  describe('AC4 - no phantom pass-start line on a turn-ending Next Pass click', () => {
    it('produces End Combat Turn N and no Start/End Initiative Pass line for the phantom pass', async () => {
      const a = makeScored('A', 5, 5); // Score 10, sole participant

      await component.btnStartRound_Click();
      actCurrent(); // A acts -> pass 1 ends (Score unchanged, still > 0)
      sent.length = 0;

      component.btnNextPass_Click(); // -10: 0 -> nobody -> phantom pass 2, End Combat Turn 1

      expect(structuralTexts()).toEqual([formatTurnEndLogText(1)]);
      expect(structuralTexts().some(t => t.includes('Pass 2'))).toBe(false);
      expect(CombatManager.initiativePass).toBe(1);
      expect(CombatManager.combatTurn).toBe(2);
    });
  });
});
