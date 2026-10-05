// Promoted scenarios for briefs/mid-turn-joiner-spec.md ("prompting a
// mid-turn combat joiner to roll Initiative").
//
// The late-entry Initiative Score maths (Core p. 160: roll normally, then
// subtract 10 per Initiative Pass already elapsed) is NOT under test here -
// it already lives in `CombatManager.addParticipant()` / `Participant.diceIni`
// and is proven correct by `running-initiative-score.spec.ts` and
// `CombatManager.spec.ts`. This file is about *reachability*: whether a GM
// can actually get a late joiner - a new "+ Participant", a brand-new player
// registering mid-fight, or a genuine NPC late joiner - to roll through the
// same locked roll pop-up mechanism already built for the pre-combat case,
// once a Combat Turn is already running. Every scenario drives the real GM
// handlers (`btnStartRound_Click`, `btnNextPass_Click`, `performAct`,
// `commitAddDraft`, `handleSessionCommand`) into an actually-started combat
// turn, per the spec's own "Scenarios to survive" preamble - no test here
// uses a state helper that defaults `started: true`.
//
// Updated for the "RESOLVED - validation round 2: redesign" section, items
// A-F: the table-wide `rollsRequested` switch this file used to assert on
// (`component['rollsRequested']`, `state.rollsRequested`,
// `areRollsRequested()`) was replaced by a per-participant "asked" record
// (`component['participantsAskedToRoll']`, a `Set<string>` of participant
// ids; `SharedParticipantState.askedToRoll` on the wire;
// `getAskedRollNames()` for the panel). Every test below that used to read
// the old switch now reads the new per-participant field instead - see
// each test's own comment for what changed and why.

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BattleTrackerComponent } from 'app/battle-tracker/battle-tracker.component';
import { PlayerViewComponent } from 'app/player-view/player-view.component';
import { appConfig } from 'app/app.config';
import { CombatManager, StatusEnum } from 'Combat';
import { Participant } from 'Combat/Participants/Participant';
import {
  SessionCommand, SessionSyncService, SharedCombatState, SharedLogEntry, SharedParticipantState
} from 'app/services/session-sync.service';
import { ConfirmationDialogService } from 'app/confirmation-dialog/confirmation-dialog.service';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { MatrixParticipant } from 'Matrix/MatrixParticipant';

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

describe('Mid-turn combat joiner: reachability of the roll pop-up mid-combat (briefs/mid-turn-joiner-spec.md)', () => {
  let component: BattleTrackerComponent;
  let fixture: ComponentFixture<BattleTrackerComponent>;
  let sync: SessionSyncService;
  let broadcasts: SharedCombatState[];
  let commands: SessionCommand[];

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
    broadcasts = [];
    commands = [];
    spyOn(sync, 'broadcastState').and.callFake((s: SharedCombatState) => { broadcasts.push(s); });
    spyOn(sync, 'broadcastGmState');
    spyOn(sync, 'sendCommand').and.callFake((c: SessionCommand) => { commands.push(c); });

    component.shareRoomCode = 'ABC123';
    component.sharedLogEntries = [];
  });

  afterEach(() => {
    resetCombat();
  });

  // ── helpers ────────────────────────────────────────────────────────────

  /**
   * A plain participant with a fully-rolled Initiative Score
   * (`baseIni + roll`, wound modifier 0), so `hasPendingInitiativeRolls()`
   * never blocks `btnStartRound_Click` from going straight into
   * `beginCombatTurn()` - matching `combat-boundary-logging.spec.ts`'s own
   * helper of the same shape.
   */
  function makeScored(name: string, baseIni: number, roll: number): Participant {
    const p = new Participant();
    p.name = name;
    p.baseIni = baseIni;
    p.setDicesWithoutRoll(1);
    CombatManager.participants.insert(p);
    p.diceIni = roll;
    return p;
  }

  /** GM taps Act on whichever participant currently holds the initiative slot. */
  function actCurrent(): void {
    const actor = CombatManager.currentActors.items[0];
    component['performAct'](actor, null);
  }

  function command(type: string, player: string, payload: Record<string, unknown> = {}) {
    component['handleSessionCommand']({ type, player, payload, timestamp: new Date().toISOString() });
  }

  /** The real "+ Participant" flow: open the dialog, name it, commit it. */
  function addParticipantViaDialog(name: string): Participant {
    component.btnAddParticipant_Click();
    expect(component.pendingAddDraft).toBeTruthy();
    component.pendingAddDraft!.name = name;
    component.commitAddDraft();
    const p = CombatManager.participants.items.find(x => x.name === name) as Participant;
    expect(p).toBeTruthy();
    return p;
  }

  function lastBroadcast(): SharedCombatState {
    expect(broadcasts.length).toBeGreaterThan(0);
    return broadcasts[broadcasts.length - 1];
  }

  function pendingRollFor(state: SharedCombatState, id: string): boolean | undefined {
    return state.participants.find(p => p.id === id)?.pendingRoll;
  }

  /** Item A: the per-participant wire signal that replaced `rollsRequested`. */
  function askedToRollFor(state: SharedCombatState, id: string): boolean | undefined {
    return state.participants.find(p => p.id === id)?.askedToRoll;
  }

  // ── Scenario 1 (Ordinary, mid-combat) ─────────────────────────────────

  it('Scenario 1: Pass 2, a player-owned "+ Participant" joiner is reachable via the mid-combat Request Player Rolls, and rolls attribute + roll - 10', async () => {
    const a = makeScored('A', 15, 5); // Score 20
    const b = makeScored('B', 10, 4); // Score 14

    await component.btnStartRound_Click();
    expect(CombatManager.started).toBeTrue();
    actCurrent(); // A acts
    actCurrent(); // B acts -> pass 1 ends
    component.btnNextPass_Click(); // -10 each -> Start Initiative Pass 2
    expect(CombatManager.initiativePass).toBe(2);
    expect(CombatManager.started).toBeTrue();

    // AC10: "Begin Combat Turn" must never render while started is true -
    // checked here, mid-sequence, not only in the dedicated template test
    // below.
    expect(component.hasOutstandingMidCombatRolls()).toBeFalse();

    // The GM adds a late joiner via the real "+ Participant" handler, then
    // fills in their sheet (Attribute 9, 3 dice - brief scenario 1's own
    // numbers) exactly as the GM would on the details panel.
    const hero = addParticipantViaDialog('Hero');
    hero.baseIni = 9;
    hero.setDicesWithoutRoll(3);
    component['participantOwners'].set(hero, 'pl-hero');

    // Late-entry maths already applied at add time (Core p. 160), before any
    // roll - not re-verified here (running-initiative-score.spec.ts /
    // CombatManager.spec.ts own that), only read back to build the expected
    // total below.
    expect(hero.diceIni).toBe(0);
    expect(hero.currentInitiativeScore).toBe(9 - 10); // attribute - 10x(pass-1)

    // The mid-combat panel is now reachable (AC8).
    expect(component.hasOutstandingMidCombatRolls()).toBeTrue();

    // GM presses the new mid-combat "Request Player Rolls" - the exact same
    // handler the pre-combat panel uses (spec "Affected paths": no
    // duplicated logic).
    component.btnRequestPlayerRolls_Click();

    const requestCommands = commands.filter(c => c.type === 'request_rolls');
    expect(requestCommands.length).toBe(1);
    const afterRequest = lastBroadcast();
    // Item A: the per-participant `askedToRoll` field replaces the old
    // table-wide `rollsRequested` switch - only Hero, who is currently
    // pending, is marked.
    expect(askedToRollFor(afterRequest, component['getParticipantId'](hero))).toBeTrue();
    expect(afterRequest.started).toBeTrue();
    expect(pendingRollFor(afterRequest, component['getParticipantId'](hero))).toBeTrue();
    // A and B already rolled this Combat Turn - their `pendingRoll` stays
    // false throughout, which is exactly what `PlayerViewComponent
    // .syncRollModal()` gates each player's own modal on - proven generally
    // by `player-initiative-prompt.spec.ts`'s "Item A" block. Asserting it
    // here shows this specific request never flips it, and never marks them
    // asked either (they were never pending, so `requestPlayerRolls()`'s own
    // pending-at-that-moment filter skips them).
    expect(pendingRollFor(afterRequest, component['getParticipantId'](a))).toBeFalsy();
    expect(pendingRollFor(afterRequest, component['getParticipantId'](b))).toBeFalsy();
    expect(askedToRollFor(afterRequest, component['getParticipantId'](a))).toBeFalsy();
    expect(askedToRollFor(afterRequest, component['getParticipantId'](b))).toBeFalsy();

    // Player rolls in the modal and submits (roll_submission, exactly as
    // PlayerViewComponent.onInitiativeRollFromModal sends it).
    command('roll_submission', 'pl-hero', {
      participantId: component['getParticipantId'](hero),
      roll: 14, diceValues: [6, 6, 2], diceSum: 14
    });

    expect(hero.diceIni).toBe(14);
    expect(hero.getCurrentInitiative()).toBe(9 - 10 + 14); // 13
  });

  // ── Scenario 2 (New registration mid-fight) ───────────────────────────

  it('Scenario 2: Pass 3, a brand-new register_character joiner takes -20 before any roll, and is reachable via mid-combat Request Player Rolls', async () => {
    makeScored('A', 15, 5); // Score 20
    // A big cushion so B is still positive after two -10 decays (into pass 3),
    // which is what keeps the Combat Turn alive long enough to reach pass 3 -
    // `isOver()` only ends the turn once nobody has positive Score left.
    const b = makeScored('B', 50, 1); // Score 51 - a big cushion either way

    await component.btnStartRound_Click();
    expect(CombatManager.currentActors.items).toEqual([b]); // B (51) acts first
    actCurrent(); // B acts -> advances to A (20)
    actCurrent(); // A acts -> pass 1 ends (both acted)
    component.btnNextPass_Click(); // pass 2: B 41, A 10
    actCurrent(); // B (41) acts
    actCurrent(); // A (10) acts -> pass 2 ends
    component.btnNextPass_Click(); // pass 3: B 31, A 0
    expect(CombatManager.initiativePass).toBe(3);
    expect(CombatManager.started).toBeTrue();
    expect(CombatManager.passEnded).toBeFalse(); // B (31) is the current actor, not yet acted

    command('register_character', 'pl-wombat', {
      characterName: 'Wombat', initiativeDice: 1, reaction: 5, intuition: 5, isMatrix: false
    });
    const wombat = CombatManager.participants.items.find(p => p.name === 'Wombat')!;
    expect(wombat.diceIni).toBe(0);
    // Attribute 10 (5+5), minus 10 x (pass 3 - 1) = 20, before any roll.
    expect(wombat.currentInitiativeScore).toBe(10 - 20);

    expect(component.hasOutstandingMidCombatRolls()).toBeTrue();
    component.btnRequestPlayerRolls_Click();

    expect(commands.some(c => c.type === 'request_rolls')).toBeTrue();
    const state = lastBroadcast();
    expect(askedToRollFor(state, component['getParticipantId'](wombat))).toBeTrue();
    expect(pendingRollFor(state, component['getParticipantId'](wombat))).toBeTrue();
  });

  // ── Scenario 3 (Stale request cleared) ────────────────────────────────

  it('Scenario 3: after the GM requests and the late joiner rolls (individually, via the modal), Hero\'s "asked" record clears, the pending count returns to zero, and no already-rolled participant is disturbed', async () => {
    const a = makeScored('A', 15, 5); // Score 20, already rolled

    await component.btnStartRound_Click();
    // Solo fighter: pass 1 ends the instant A acts. Advance to pass 2 so
    // there is an elapsed pass for the late joiner's penalty.
    actCurrent();
    component.btnNextPass_Click(); // pass 2: A 10

    const hero = addParticipantViaDialog('Hero');
    hero.baseIni = 9;
    hero.setDicesWithoutRoll(3);
    component['participantOwners'].set(hero, 'pl-hero');
    const heroId = component['getParticipantId'](hero);

    component.btnRequestPlayerRolls_Click();
    expect(component['participantsAskedToRoll'].has(heroId)).toBeTrue();
    expect(component.getPendingOutstandingRollCount()).toBe(1);

    command('roll_submission', 'pl-hero', {
      participantId: heroId,
      roll: 10, diceValues: [6, 2, 2], diceSum: 10
    });

    // Item A: "asked" is read (and pruned) through `isAskedToRoll()`, the
    // single choke point every `buildSharedParticipant()` call runs through -
    // an individual player `roll_submission` DOES clear Hero's own record the
    // moment their roll lands, via that read-time prune, with no per-call-site
    // patch needed. This is the inverted assertion the validator required:
    // the previous build's "stays true" behaviour was exactly D1's bug (a
    // second late joiner added afterward would otherwise see a locked pop-up
    // nobody asked for).
    expect(askedToRollFor(lastBroadcast(), heroId)).toBeFalsy();
    expect(component.getPendingOutstandingRollCount()).toBe(0);
    expect(component.hasOutstandingMidCombatRolls()).toBeFalse();
    // A never owed a roll and is never disturbed by any of this.
    expect(a.diceIni).toBe(5);
    const finalState = lastBroadcast();
    expect(pendingRollFor(finalState, component['getParticipantId'](a))).toBeFalsy();
  });

  it('Scenario 3 (batch variant): Force Roll Outstanding mid-combat resolves the batch and clears Hero\'s "asked" record, undisturbed for anyone already rolled', async () => {
    const a = makeScored('A', 15, 5); // Score 20, already rolled

    await component.btnStartRound_Click();
    actCurrent();
    component.btnNextPass_Click(); // pass 2

    const hero = addParticipantViaDialog('Hero');
    hero.baseIni = 9;
    hero.setDicesWithoutRoll(3);
    component['participantOwners'].set(hero, 'pl-hero');
    const heroId = component['getParticipantId'](hero);

    component.btnRequestPlayerRolls_Click();
    expect(component['participantsAskedToRoll'].has(heroId)).toBeTrue();

    const dialog = TestBed.inject(ConfirmationDialogService);
    spyOn(dialog, 'confirm').and.resolveTo(true);
    await component['confirmAndForceRollOutstanding']();

    expect(hero.diceIni).toBeGreaterThan(0);
    // The batch resolved every pending player, so Hero's own record reads
    // as resolved on the very next broadcast (the batch's own trailing
    // `sort()`) - no separate clear call needed.
    expect(askedToRollFor(lastBroadcast(), heroId)).toBeFalsy();
    expect(component.getPendingOutstandingRollCount()).toBe(0);
    expect(component.hasOutstandingMidCombatRolls()).toBeFalse();
    expect(a.diceIni).toBe(5); // never disturbed
  });

  // ── Scenario 4 (At the table, others waiting) ─────────────────────────

  it('Scenario 4: with a lower-scoring participant still Waiting this pass, a higher-scoring late joiner is picked up by getNextActors() before them', async () => {
    const a = makeScored('A', 30, 1); // Score 31
    const b = makeScored('B', 20, 1); // Score 21
    const c = makeScored('C', 10, 1); // Score 11 - stays Waiting

    await component.btnStartRound_Click();
    expect(CombatManager.currentActors.items).toEqual([a]);
    actCurrent(); // A acts -> engine auto-advances to B (next highest Waiting)
    expect(CombatManager.currentActors.items).toEqual([b]);
    // C (Score 11) is still Waiting, not yet chosen - this is the window the
    // spec's "beats anyone still Waiting this pass" language describes.
    expect(c.status).toBe(StatusEnum.Waiting);

    // A late joiner arrives now, mid-pass 1 (no penalty yet - Core p. 160,
    // "join during Pass 1" edge case), scored higher than C.
    const late = addParticipantViaDialog('Late');
    late.baseIni = 15; // no late-entry penalty: joined during Pass 1 (Core p. 160 edge case 1)
    late.setDicesWithoutRoll(1);
    late.diceIni = 5; // Score 20 - beats C's 11, ties nothing
    expect(late.getCurrentInitiative()).toBe(20); // 15 + 5, no penalty subtracted

    actCurrent(); // B acts -> engine picks the next highest Waiting: Late (20) over C (11)
    expect(CombatManager.currentActors.items).toEqual([late]);
    expect(c.status).not.toBe(StatusEnum.Finished);

    actCurrent(); // Late acts
    expect(CombatManager.currentActors.items).toEqual([c]);
    actCurrent(); // C finally acts, last of pass 1
  });

  // ── Technical AC10 / regression: "Begin Combat Turn" never renders while started ──

  describe('AC10: "Begin Combat Turn" never renders once combat has started', () => {
    it('does not render anywhere in the DOM while combatManager.started is true, even with rolls outstanding', async () => {
      makeScored('A', 15, 5);
      await component.btnStartRound_Click();
      expect(CombatManager.started).toBeTrue();

      addParticipantViaDialog('Late'); // makes hasOutstandingMidCombatRolls() true
      fixture.detectChanges();

      const text = fixture.nativeElement.textContent as string;
      expect(text).not.toContain('Begin Combat Turn');
      // The rolls-owed bar (GM screen overhaul 14, #17) is on screen in its
      // place, correctly labelled.
      const panel = fixture.nativeElement.querySelector('[data-testid="rolls-owed-bar"]');
      expect(panel).not.toBeNull();
      expect(panel.textContent).toContain('ROLLS OWED');
    });

    it('between turns the rolls-owed bar still shows "Begin Combat Turn" before combat starts', async () => {
      makeScored('A', 15, 5);
      // Insert an unrolled participant too, so `initiativePrepActive` has
      // something to prompt for once `btnStartRound_Click` is pressed.
      const unrolled = new Participant();
      unrolled.name = 'Unrolled';
      CombatManager.participants.insert(unrolled);

      await component.btnStartRound_Click();
      fixture.detectChanges();

      expect(CombatManager.started).toBeFalse(); // still prep, not started
      expect(component.initiativePrepActive).toBeTrue();
      // GM screen overhaul 14 (#17): the Prep card is now the rolls-owed
      // bar, found by its own handle rather than as "the first card".
      const prepPanel = fixture.nativeElement.querySelector('[data-testid="rolls-owed-bar"]');
      expect(prepPanel).toBeTruthy();
      expect(prepPanel.textContent).toContain('Begin Combat Turn');
    });
  });

  // ── Technical AC12: the per-row GM dice button still works mid-combat ──

  it('AC12 regression: the per-row GM dice button (btnRollInitiative_Click) still rolls a late joiner mid-combat, penalty included, and now broadcasts immediately', async () => {
    makeScored('A', 15, 5); // Score 20
    await component.btnStartRound_Click();
    actCurrent();
    component.btnNextPass_Click(); // pass 2

    const late = addParticipantViaDialog('Late');
    late.baseIni = 9;
    late.setDicesWithoutRoll(1);
    expect(late.diceIni).toBe(0);
    expect(late.currentInitiativeScore).toBe(9 - 10);
    const lateId = component['getParticipantId'](late);
    // Item A, per-row "ask this player" - asked first, so the fix's
    // broadcast requirement (validator failure 2) has something to disprove:
    // an un-broadcast roll would leave this record stuck `true` forever.
    component['participantOwners'].set(late, 'pl-late');
    component.btnAskPlayerToRoll_Click(late);
    expect(askedToRollFor(lastBroadcast(), lateId)).toBeTrue();
    broadcasts.length = 0;

    component.btnRollInitiative_Click(late);

    expect(late.diceIni).toBeGreaterThan(0);
    expect(late.getCurrentInitiative()).toBe(9 - 10 + late.diceIni);
    // Validator failure 2, fixed: `rollAndLogInitiative()` on its own never
    // broadcast - this is the confirmed gap - so before the fix nothing in
    // `broadcasts` would exist here at all, and Late's own wire entry would
    // still (wrongly) read `askedToRoll: true` forever.
    expect(broadcasts.length).toBeGreaterThan(0);
    const after = lastBroadcast();
    expect(pendingRollFor(after, lateId)).toBeFalse();
    expect(askedToRollFor(after, lateId)).toBeFalsy();
  });

  // ── Affected path: NPC late joiners reachable via Force Roll Outstanding
  // / Roll Remaining Non-Player mid-combat (standalone grunt, and a grunt
  // detached from a row - "checked, not a defect" in the implementation
  // plan: the detach penalty is applied exactly once, at addParticipant time,
  // by design). ──────────────────────────────────────────────────────────

  describe('NPC late joiners reachable mid-combat via the "Pending Rolls" panel', () => {
    it('a standalone grunt added mid-combat ("+ Grunt Group"/"Add Grunt") rolls via "Roll Remaining Non-Player"', async () => {
      makeScored('A', 15, 5);
      await component.btnStartRound_Click();
      actCurrent();
      component.btnNextPass_Click(); // pass 2

      const grunt = component.addGrunt('Ganger', 3, 3, false);
      expect(grunt.diceIni).toBe(0);
      expect(component.hasOutstandingMidCombatRolls()).toBeTrue();
      expect(component.getPendingNonPlayerRollCount()).toBeGreaterThan(0);

      component.btnRollRemainingNonPlayer_Click();

      expect(grunt.diceIni).toBeGreaterThan(0);
    });

    it('a grunt detached from an already-rolled row is a genuine late joiner (diceIni 0) and rolls via Force Roll Outstanding', async () => {
      makeScored('A', 15, 5);
      await component.btnStartRound_Click();
      actCurrent();
      component.btnNextPass_Click(); // pass 2

      const row = component.addNpcRow(false);
      const member = component.addNpcToRow(row, 'Ganger One', 3, 3);
      row.baseIni = 8;
      row.setDicesWithoutRoll(2);
      row.diceIni = 10; // the row already rolled its one shared Initiative Test

      const detached = component.detachRowMember(row, member)!;
      expect(detached).toBeTruthy();
      // Genuinely unrolled, unlike the row it came from (spec's "Detach-to-
      // standalone: checked, not a defect").
      expect(detached.diceIni).toBe(0);
      expect(component.hasOutstandingMidCombatRolls()).toBeTrue();

      const dialog = TestBed.inject(ConfirmationDialogService);
      spyOn(dialog, 'confirm').and.resolveTo(true);
      await component['confirmAndForceRollOutstanding']();

      expect(detached.diceIni).toBeGreaterThan(0);
    });
  });

  // ── Regression: the mid-combat panel must not appear before combat starts,
  // and must disappear once every outstanding roll is in. ─────────────────

  it('Regression: the mid-combat panel is absent before combat starts and after every roll is in', async () => {
    expect(component.hasOutstandingMidCombatRolls()).toBeFalse(); // not started yet

    makeScored('A', 15, 5);
    await component.btnStartRound_Click();
    actCurrent();
    component.btnNextPass_Click();
    expect(component.hasOutstandingMidCombatRolls()).toBeFalse(); // nothing pending yet

    const hero = addParticipantViaDialog('Hero');
    hero.baseIni = 9;
    hero.setDicesWithoutRoll(1);
    expect(component.hasOutstandingMidCombatRolls()).toBeTrue();

    component.btnRollInitiative_Click(hero);
    expect(component.hasOutstandingMidCombatRolls()).toBeFalse();
  });

  // ── D2 (round 1) / item A (round 2 redesign): a Combat Turn boundary
  // clears every "asked" record unconditionally, so a later unrelated
  // broadcast never reopens anybody's pop-up. ───────────────────────────

  it('D2/item A: a Combat Turn ends after a mid-turn request, then a later unrelated broadcast - Hero\'s "asked" record stays cleared', async () => {
    const a = makeScored('A', 15, 5); // Score 20, already rolled

    await component.btnStartRound_Click();
    actCurrent(); // A acts -> pass 1 ends
    component.btnNextPass_Click(); // pass 2: A 10

    const hero = addParticipantViaDialog('Hero');
    hero.baseIni = 9;
    hero.setDicesWithoutRoll(3);
    component['participantOwners'].set(hero, 'pl-hero');
    const heroId = component['getParticipantId'](hero);

    component.btnRequestPlayerRolls_Click();
    expect(component['participantsAskedToRoll'].has(heroId)).toBeTrue();

    // The table moves on without Hero's roll ever landing. The GM presses
    // the same explicit control (now warning, per item C) enough times to
    // run the Combat Turn out - A's Score decays to 0 or below and the turn
    // ends via the ordinary `isOver()` cascade.
    const dialog = TestBed.inject(ConfirmationDialogService);
    spyOn(dialog, 'confirm').and.resolveTo(true);
    component.btnNextPass_Click(); // pass 3: A 0 -> Combat Turn ends
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(CombatManager.started).toBeFalse();
    // The boundary clears every "asked" record unconditionally, not only
    // when nobody is left pending (softReset() just zeroed every diceIni,
    // so "nobody pending" cannot be how this is detected - it would read as
    // "everyone was just asked again", the opposite of correct).
    expect(component['participantsAskedToRoll'].has(heroId)).toBeFalse();

    // A later, wholly unrelated broadcast (a wound, an edit) must not revive
    // it - it is simply never true again until the GM asks for the new
    // turn's rolls.
    a.physicalDamage = 1;
    component['syncSharedState']();
    const finalState = lastBroadcast();
    expect(askedToRollFor(finalState, heroId)).toBeFalsy();
  });

  // ── D4: warn, never block, on the explicit control that advances the
  // order while a roll is still outstanding (validation round 1). ─────────

  describe('D4: Next Pass / End Combat Turn warns, never blocks, while a roll is outstanding', () => {
    it('names who still owes a roll, and Cancel leaves the pass exactly where it was', async () => {
      makeScored('A', 15, 5); // Score 20

      await component.btnStartRound_Click();
      actCurrent(); // A acts -> pass 1 ends
      const hero = addParticipantViaDialog('Hero'); // unrolled, still owes a roll
      hero.baseIni = 9;
      hero.setDicesWithoutRoll(1);
      expect(component.hasOutstandingMidCombatRolls()).toBeTrue();

      const dialog = TestBed.inject(ConfirmationDialogService);
      const confirmSpy = spyOn(dialog, 'confirm').and.resolveTo(false);
      const passBefore = CombatManager.initiativePass;

      component.btnNextPass_Click();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      const message = confirmSpy.calls.mostRecent().args[0] as string;
      expect(message).toContain('Hero');
      expect(confirmSpy.calls.mostRecent().args[2]).toBe('Advance Anyway');
      // Cancel (resolved false above): never blocks outright, but this
      // press did not advance the order either.
      expect(CombatManager.initiativePass).toBe(passBefore);
    });

    it('confirming "Advance Anyway" lets the pass advance exactly as an ordinary Next Pass would', async () => {
      const a = makeScored('A', 15, 5); // Score 20

      await component.btnStartRound_Click();
      actCurrent(); // A acts -> pass 1 ends
      const hero = addParticipantViaDialog('Hero');
      hero.baseIni = 9;
      hero.setDicesWithoutRoll(1);

      const dialog = TestBed.inject(ConfirmationDialogService);
      spyOn(dialog, 'confirm').and.resolveTo(true);

      component.btnNextPass_Click();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(CombatManager.initiativePass).toBe(2);
      expect(a.getCurrentInitiative()).toBe(10); // the ordinary -10 still ran
    });

    it('regression: no confirmation dialog at all when nobody owes a roll', async () => {
      makeScored('A', 15, 5);
      makeScored('B', 10, 4);
      await component.btnStartRound_Click();
      actCurrent();
      actCurrent(); // pass 1 ends, both rolled

      const dialog = TestBed.inject(ConfirmationDialogService);
      const confirmSpy = spyOn(dialog, 'confirm');

      component.btnNextPass_Click(); // synchronous - nothing pending

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(CombatManager.initiativePass).toBe(2);
    });
  });

  // ── F (round 2 redesign, supersedes round-1 D6): the "Pending Rolls"
  // panel names who is owed a roll, shows WHO has been asked (per-person,
  // replacing the round-1 table-wide "request outstanding" line), and
  // enables Roll Remaining Non-Player even while a player still owes a roll
  // (round-1 answers 6-8, kept). ──────────────────────────────────────────

  describe('F: mid-combat "Pending Rolls" panel visibility', () => {
    it('F(a)/(b): names everyone still owed a roll, and separately names who has actually been asked', async () => {
      makeScored('A', 15, 5);
      await component.btnStartRound_Click();
      actCurrent();
      component.btnNextPass_Click(); // pass 2

      const hero = addParticipantViaDialog('Hero');
      hero.baseIni = 9;
      hero.setDicesWithoutRoll(1);
      component['participantOwners'].set(hero, 'pl-hero');
      const grunt = component.addGrunt('Ganger');

      expect(component.getOutstandingRollNames()).toContain('Hero');
      expect(component.getOutstandingRollNames()).toContain('Ganger');
      // Nobody has been asked yet - "owed" and "asked" are different lists.
      expect(component.getAskedRollNames()).toEqual([]);

      component.btnRequestPlayerRolls_Click();
      // Only Hero (player-owned) is asked - "Request Player Rolls" never
      // asks NPCs (they have no player to ask; Roll Remaining Non-Player/
      // Force Roll Outstanding is how the GM rolls for them instead).
      expect(component.getAskedRollNames()).toEqual(['Hero']);

      fixture.detectChanges();
      // GM screen overhaul 14 (#17): one names line on the rolls-owed bar,
      // each asked name marked "(asked)".
      const namesEl = fixture.nativeElement.querySelector('[data-testid="rolls-owed-names"]');
      expect(namesEl.textContent).toContain('Hero (asked)');
      expect(namesEl.textContent).toContain('Ganger');
      expect(namesEl.textContent).not.toContain('Ganger (asked)');

      void grunt; // referenced only for `getOutstandingRollNames()` above
    });

    it('F(c): Roll Remaining Non-Player stays enabled mid-combat even while a player still owes a roll', async () => {
      makeScored('A', 15, 5);
      await component.btnStartRound_Click();
      actCurrent();
      component.btnNextPass_Click(); // pass 2

      const hero = addParticipantViaDialog('Hero'); // unrolled player-owned joiner
      hero.baseIni = 9;
      hero.setDicesWithoutRoll(1);
      component['participantOwners'].set(hero, 'pl-hero');
      const grunt = component.addGrunt('Ganger'); // unrolled NPC

      fixture.detectChanges();
      const btn = fixture.nativeElement.querySelector(
        '[data-testid="rolls-owed-roll-npcs-btn"]'
      ) as HTMLButtonElement;
      expect(btn.disabled).toBeFalse();

      component.btnRollRemainingNonPlayer_Click();

      expect(grunt.diceIni).toBeGreaterThan(0);
      expect(hero.diceIni).toBe(0); // never touched - player-owned is excluded
    });

    it('regression: the pre-combat panel keeps its own button disabled while a player still owes a roll (unchanged)', async () => {
      const unrolledPlayer = new Participant();
      unrolledPlayer.name = 'Hero';
      CombatManager.participants.insert(unrolledPlayer);
      component['participantOwners'].set(unrolledPlayer, 'pl-hero');
      const unrolledGrunt = component.addGrunt('Ganger');

      await component.btnStartRound_Click(); // still prep - pending rolls outstanding
      fixture.detectChanges();

      expect(component.initiativePrepActive).toBeTrue();
      expect(CombatManager.started).toBeFalse();
      // GM screen overhaul 14 (#17): found on the rolls-owed bar by its
      // own handle rather than as "the first card on the page".
      const btn = fixture.nativeElement.querySelector(
        '[data-testid="rolls-owed-bar"] [data-testid="rolls-owed-roll-npcs-btn"]'
      ) as HTMLButtonElement | null;
      expect(btn?.disabled).toBeTrue();
      void unrolledGrunt;
    });
  });

  // ── D3 additions: Pass 2 late joiner via a real roll_submission overtakes
  // a participant still Waiting in that same pass. ────────────────────────

  it('D3: a Pass 2 late joiner, penalised -10, rolling through a real roll_submission, overtakes a participant still Waiting in Pass 2', async () => {
    const a = makeScored('A', 40, 1); // Score 41
    const b = makeScored('B', 25, 1); // Score 26
    const c = makeScored('C', 21, 1); // Score 22

    await component.btnStartRound_Click();
    actCurrent(); // A acts
    actCurrent(); // B acts
    actCurrent(); // C acts -> pass 1 ends
    component.btnNextPass_Click(); // pass 2: A 31, B 16, C 12 - all Waiting again
    expect(CombatManager.currentActors.items).toEqual([a]); // A (31) picked automatically

    const hero = addParticipantViaDialog('Hero');
    hero.baseIni = 9; // 9 - 10 x (2-1) = -1 before any roll
    hero.setDicesWithoutRoll(3); // enough dice for a 15 roll to be in range
    component['participantOwners'].set(hero, 'pl-hero');
    expect(hero.currentInitiativeScore).toBe(-1);

    command('roll_submission', 'pl-hero', {
      participantId: component['getParticipantId'](hero),
      roll: 15, diceValues: [6, 6, 3], diceSum: 15
    });
    expect(hero.getCurrentInitiative()).toBe(14); // -1 + 15 - beats C (12), not B (16)

    actCurrent(); // A finishes -> next highest Waiting is B (16), not Hero (14)
    expect(CombatManager.currentActors.items).toEqual([b]);
    expect(c.status).toBe(StatusEnum.Waiting);

    actCurrent(); // B finishes -> Hero (14) overtakes C (12), still Waiting
    expect(CombatManager.currentActors.items).toEqual([hero]);
    expect(c.status).toBe(StatusEnum.Waiting);

    actCurrent(); // Hero finishes -> C (12) is last
    expect(CombatManager.currentActors.items).toEqual([c]);
  });

  // ── D3 addition: two player joiners in the same pass, each penalised
  // independently - no shared penalty. ─────────────────────────────────────

  it('D3: two player joiners in the same Pass 3, each takes -20 independently, with no shared penalty', async () => {
    makeScored('A', 15, 5); // Score 20
    makeScored('B', 50, 1); // Score 51 - cushion to reach pass 3

    await component.btnStartRound_Click();
    actCurrent(); // B (51) acts first
    actCurrent(); // A (20) acts -> pass 1 ends
    component.btnNextPass_Click(); // pass 2: B 41, A 10
    actCurrent();
    actCurrent(); // pass 2 ends
    component.btnNextPass_Click(); // pass 3: B 31, A 0
    expect(CombatManager.initiativePass).toBe(3);

    const heroOne = addParticipantViaDialog('HeroOne');
    heroOne.baseIni = 12;
    heroOne.setDicesWithoutRoll(2);
    component['participantOwners'].set(heroOne, 'pl-one');
    expect(heroOne.currentInitiativeScore).toBe(12 - 20); // -8, before any roll

    command('register_character', 'pl-two', {
      characterName: 'HeroTwo', initiativeDice: 4, reaction: 3, intuition: 4, isMatrix: false
    });
    const heroTwo = CombatManager.participants.items.find(p => p.name === 'HeroTwo')!;
    expect(heroTwo.currentInitiativeScore).toBe(7 - 20); // -13, independent of HeroOne

    command('roll_submission', 'pl-one', {
      participantId: component['getParticipantId'](heroOne), roll: 10, diceValues: [6, 4], diceSum: 10
    });
    command('roll_submission', 'pl-two', {
      participantId: component['getParticipantId'](heroTwo), roll: 6, diceValues: [2, 2, 1, 1], diceSum: 6
    });

    expect(heroOne.getCurrentInitiative()).toBe(12 - 20 + 10); // 2
    expect(heroTwo.getCurrentInitiative()).toBe(7 - 20 + 6); // -7
  });

  // ── D3 addition: a merged row and a brand-new NPC row added mid-fight are
  // reachable by Force Roll Outstanding / Roll Remaining Non-Player. ──────

  it('D3: a merged Grunt Group and a brand-new NPC row, both added mid-combat, are reachable by Roll Remaining Non-Player / Force Roll Outstanding', async () => {
    makeScored('A', 15, 5);
    await component.btnStartRound_Click();
    actCurrent();
    component.btnNextPass_Click(); // pass 2

    // A brand-new NPC row (never populated via a merge), unrolled.
    const row = component.addNpcRow(false);
    component.addNpcToRow(row, 'Ganger One', 3, 3);
    expect(row.diceIni).toBe(0);

    // Two standalone grunts, merged into a row via the real dialog flow.
    const g1 = component.addGrunt('G1');
    const g2 = component.addGrunt('G2');
    component.toggleMergeSelection(g1);
    component.toggleMergeSelection(g2);
    component.btnMergeSelectedGrunts_Click();
    expect(component.pendingAddDraft).toBeTruthy();
    component.pendingAddDraft!.name = 'Merged Mob';
    component.commitAddDraft();
    const mergedRow = CombatManager.participants.items.find(p => p.name === 'Merged Mob')!;
    expect(mergedRow.diceIni).toBe(0);

    expect(component.hasOutstandingMidCombatRolls()).toBeTrue();
    component.btnRollRemainingNonPlayer_Click();

    expect(row.diceIni).toBeGreaterThan(0);
    expect(mergedRow.diceIni).toBeGreaterThan(0);
  });

  // ── Item B: a visual marker, never an interruption, for anyone still
  // owing an Initiative roll mid-combat. ────────────────────────────────

  describe('Item B: the "needs Initiative roll" indicator', () => {
    it('true only mid-combat, for a non-ooc participant with diceIni <= 0', async () => {
      makeScored('A', 15, 5);
      await component.btnStartRound_Click();
      actCurrent();
      component.btnNextPass_Click(); // pass 2

      const late = addParticipantViaDialog('Late'); // unrolled
      // Not started yet would never mark it, but combat IS started here.
      expect(component.participantNeedsInitiativeRoll(late)).toBeTrue();
      component.btnRollInitiative_Click(late);
      expect(component.participantNeedsInitiativeRoll(late)).toBeFalse();
    });

    it('false before combat starts, even for a diceIni <= 0 participant', () => {
      const late = new Participant();
      late.name = 'Late';
      CombatManager.participants.insert(late);
      expect(component.participantNeedsInitiativeRoll(late)).toBeFalse();
    });

    it('renders in the DOM on the participant row once combat has started', async () => {
      makeScored('A', 15, 5);
      await component.btnStartRound_Click();
      actCurrent();
      component.btnNextPass_Click(); // pass 2
      addParticipantViaDialog('Late'); // unrolled

      fixture.detectChanges();
      const markers = fixture.nativeElement.querySelectorAll('[data-testid="needs-initiative-roll-indicator"]');
      expect(markers.length).toBeGreaterThan(0);
    });
  });

  // ── Item 1 (round 3): the round-2 "item C" per-click Act/Delay confirm
  // dialogs are gone entirely - Act and Delay never show a dialog any more,
  // for the GM or for a player command. Replaced by a state-driven,
  // non-blocking notice (`pendingPassEndRollNotice()`) read live off the
  // order, covering the same "last actor this pass, someone still owes a
  // roll" situation without a click to hang it off. ──────────────────────

  describe('Item 1: no Act/Delay confirm dialog any more, replaced by a state-driven notice', () => {
    function actViaModal(actor: Participant): void {
      component.actModalParticipant = actor;
      component['declaredActionSelections'].set(actor, { free: 'Drop Prone', simple: [], complex: null });
      component.submitActModal();
    }

    it('a mid-pass Act (others still Waiting) shows no notice, before or after', async () => {
      const a = makeScored('A', 30, 1); // Score 31
      makeScored('B', 20, 1); // Score 21 - still Waiting after A acts
      await component.btnStartRound_Click();
      expect(CombatManager.currentActors.items).toEqual([a]);
      const late = addParticipantViaDialog('Late'); // unrolled, still owed a roll
      late.baseIni = 10; // realistic Initiative attribute (round 4 item 1) - unrolled, diceIni still 0
      late.setDicesWithoutRoll(1);

      expect(component.pendingPassEndRollNotice()).toBeNull();
      const dialog = TestBed.inject(ConfirmationDialogService);
      const confirmSpy = spyOn(dialog, 'confirm');

      actViaModal(a);

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(a.status).toBe(StatusEnum.Finished);
      // B is now the sole current actor and nobody else is Waiting - the
      // notice appears for B's turn, still never blocking anything.
      expect(component.pendingPassEndRollNotice()).toContain('Late');
    });

    it('Act on the sole current actor with a roll outstanding runs immediately, with no dialog at all - the notice was already showing beforehand', async () => {
      const a = makeScored('A', 15, 5); // Score 20 - sole actor
      await component.btnStartRound_Click();
      const late = addParticipantViaDialog('Late'); // unrolled, still owed a roll
      late.baseIni = 10; // realistic Initiative attribute (round 4 item 1) - unrolled, diceIni still 0
      late.setDicesWithoutRoll(1);
      expect(CombatManager.currentActors.items).toEqual([a]);

      expect(component.pendingPassEndRollNotice()).toContain('Late');
      const dialog = TestBed.inject(ConfirmationDialogService);
      const confirmSpy = spyOn(dialog, 'confirm');

      actViaModal(a);

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(a.status).toBe(StatusEnum.Finished);
    });

    it('Delay on the sole current actor with a roll outstanding runs immediately too, for the GM row button and the player command alike', async () => {
      const a = makeScored('A', 20, 1); // Score 21 - acts first
      const b = makeScored('B', 12, 1); // Score 13 - waits behind A, delays second
      await component.btnStartRound_Click();
      expect(CombatManager.currentActors.items).toEqual([a]);
      const late = addParticipantViaDialog('Late');
      late.baseIni = 10; // realistic Initiative attribute (round 4 item 1) - unrolled, diceIni still 0
      late.setDicesWithoutRoll(1);

      const dialog = TestBed.inject(ConfirmationDialogService);
      const confirmSpy = spyOn(dialog, 'confirm');

      component.btnDelay_Click(a);

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(a.status).toBe(StatusEnum.Delaying);
      // B was already Waiting and rolled, so the engine picks it up as the
      // next current actor the instant A vacates the slot.
      expect(CombatManager.currentActors.items).toEqual([b]);

      // Same for the player command path - no distinction any more, no
      // `skipPassEndWarning` argument left to make one. B is now the sole
      // current actor with nobody else Waiting (Late is still unrolled).
      component['participantOwners'].set(b, 'pl-b');
      command('delay', 'pl-b', { participantId: component['getParticipantId'](b) });
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(b.status).toBe(StatusEnum.Delaying);
    });

    it('the notice appears when a grunt row occupying the sole current-actor slot is the one due to act', async () => {
      const row = component.addNpcRow(false);
      component.addNpcToRow(row, 'Ganger One', 3, 3);
      row.baseIni = 20;
      row.setDicesWithoutRoll(1);
      row.diceIni = 5; // Score 25 - sole actor
      await component.btnStartRound_Click();
      expect(CombatManager.currentActors.items).toEqual([row]);

      // The late joiner arrives mid-combat, unrolled - added after Start
      // Round so it cannot block combat from starting in the first place.
      const late = addParticipantViaDialog('Late');
      late.baseIni = 10; // realistic Initiative attribute (round 4 item 1) - unrolled, diceIni still 0
      late.setDicesWithoutRoll(1);

      expect(component.pendingPassEndRollNotice()).toContain('Late');
    });

    it('the notice reacts correctly when the current actor is removed (e.g. Leave Combat) - it does not linger once there is no live pass to warn about', async () => {
      const a = makeScored('A', 15, 5); // Score 20 - sole actor
      await component.btnStartRound_Click();
      const late = addParticipantViaDialog('Late'); // unrolled, still owed a roll
      late.baseIni = 10; // realistic Initiative attribute (round 4 item 1) - unrolled, diceIni still 0
      late.setDicesWithoutRoll(1);
      expect(CombatManager.currentActors.items).toEqual([a]);
      expect(component.pendingPassEndRollNotice()).toContain('Late');

      component.btnLeaveCombat_Click(a);

      // Nobody is left who can act this pass (Late is item 2-excluded, still
      // unrolled) - the pass ends automatically and the notice is read purely
      // from state: it goes null because there is no longer a live pass with
      // a sole actor to warn about, not because it "remembers" anything.
      expect(CombatManager.currentActors.count).toBe(0);
      expect(component.pendingPassEndRollNotice()).toBeNull();
    });

    it('the notice appears for whoever becomes the new sole current actor once the previous one is removed and someone else was already waiting', async () => {
      const a = makeScored('A', 15, 5); // Score 20 - sole actor
      const b = makeScored('B', 12, 1); // Score 13 - still Waiting behind A
      await component.btnStartRound_Click();
      expect(CombatManager.currentActors.items).toEqual([a]);
      // Nobody outstanding yet - B is still Waiting, so A is not the last
      // actor this pass regardless of anyone unrolled.
      const late = addParticipantViaDialog('Late');
      late.baseIni = 10; // realistic Initiative attribute (round 4 item 1) - unrolled, diceIni still 0
      late.setDicesWithoutRoll(1);
      expect(component.pendingPassEndRollNotice()).toBeNull();

      component.btnLeaveCombat_Click(a);

      // B is now the sole current actor, and only Late (unrolled) remains -
      // the notice now applies to B's turn, purely from the order's state.
      expect(CombatManager.currentActors.items).toEqual([b]);
      expect(component.pendingPassEndRollNotice()).toContain('Late');
    });

    it('the notice never reaches a player: it is a GM-facing method only, and no roll-prompt state carries it', async () => {
      makeScored('A', 15, 5); // Score 20 - sole actor
      await component.btnStartRound_Click();
      const late = addParticipantViaDialog('Late');
      late.baseIni = 10; // realistic Initiative attribute (round 4 item 1) - unrolled, diceIni still 0
      late.setDicesWithoutRoll(1);

      // Nothing about `pendingPassEndRollNotice()`'s text is broadcast on
      // any shared-state field - the broadcast shape is asserted directly:
      // no wire field carries the notice text at all.
      component['syncSharedState']();
      const sync = TestBed.inject(SessionSyncService);
      const broadcastSpy = sync.broadcastState as jasmine.Spy;
      const state = broadcastSpy.calls.mostRecent().args[0] as SharedCombatState;
      const serialized = JSON.stringify(state);
      expect(serialized).not.toContain('Last turn of this pass');
    });

    it('round 4 item 1 regression: fires for a Pass 2 late joiner rated 12, penalised to 2 - the exact case the drifted "anyoneElseWaiting" test used to swallow', async () => {
      const a = makeScored('A', 15, 5); // Score 20 - sole actor, Pass 1
      await component.btnStartRound_Click();
      expect(CombatManager.currentActors.items).toEqual([a]);
      actCurrent(); // A acts; nobody else Waiting yet, so the pass auto-ends
      expect(CombatManager.passEnded).toBeTrue();

      component.btnNextPass_Click(); // Pass 2 - nothing outstanding yet, synchronous
      expect(CombatManager.initiativePass).toBe(2);
      expect(CombatManager.currentActors.items).toEqual([a]);

      // Joins during Pass 2, unrolled: attribute 12, late-entry penalty
      // -10 x (2 - 1) = -10 applied at add time (`addParticipant`, untouched
      // by this fix round) leaves a running Score of 2 - positive, but still
      // unrolled (`diceIni` stays 0).
      const late = addParticipantViaDialog('Late');
      late.baseIni = 12;
      late.setDicesWithoutRoll(1);
      expect(late.diceIni).toBe(0);
      expect(late.getCurrentInitiative()).toBe(2);

      // Before round 4's fix, `pendingPassEndRollNotice()` counted Late as
      // "still waiting" purely because its Score (2) was positive, with no
      // `diceIni` check - so it read "someone else can still act" and
      // returned null, in exactly the situation the notice exists to name.
      expect(component.pendingPassEndRollNotice()).toContain('Late');
    });
  });

  // ── Item D: no engine change - a late joiner acts this pass only if their
  // roll lands before the pass ends; proceeding past the kept Next Pass /
  // End Combat Turn confirmation (item 1 keeps this one) means they wait for
  // the next pass, with no logic reopening the ended one. ─────────────────

  describe('Item D: late-roll timing relative to the kept Next Pass confirmation', () => {
    it('rolling before the pass ends still lets a positive post-penalty joiner act this pass', async () => {
      const a = makeScored('A', 40, 1); // Score 41
      const b = makeScored('B', 25, 1); // Score 26
      await component.btnStartRound_Click();
      actCurrent(); // A (41) acts -> B is sole Waiting, becomes current
      actCurrent(); // B (26) acts -> pass 1 ends (both acted)
      component.btnNextPass_Click(); // pass 2: A 31, B 16

      const hero = addParticipantViaDialog('Hero');
      hero.baseIni = 9; // 9 - 10 = -1 before any roll
      hero.setDicesWithoutRoll(3);
      component['participantOwners'].set(hero, 'pl-hero');

      // Rolls BEFORE anyone proceeds past pass 2 - lands while the pass is
      // still open.
      command('roll_submission', 'pl-hero', {
        participantId: component['getParticipantId'](hero), roll: 15, diceValues: [6, 6, 3], diceSum: 15
      });
      expect(hero.getCurrentInitiative()).toBe(14); // -1 + 15, above 0

      actCurrent(); // A (31) acts -> next highest Waiting is B (16), not yet Hero
      expect(CombatManager.currentActors.items).toEqual([b]);
      actCurrent(); // B (16) acts -> Hero (14) is next, having landed in time
      expect(CombatManager.currentActors.items).toEqual([hero]);
      void a;
    });

    it('rolling only after the GM proceeds past the kept Next Pass confirmation waits for the next pass - the ended one is never reopened', async () => {
      const a = makeScored('A', 15, 5); // Score 20 - sole actor
      await component.btnStartRound_Click();

      const hero = addParticipantViaDialog('Hero'); // unrolled, still owed a roll
      // Pre-roll score 0: does not preempt A as sole current actor - but a
      // big roll, landing too late, would have been well above 0 had it
      // arrived in time.
      hero.baseIni = 0;
      hero.setDicesWithoutRoll(3);
      component['participantOwners'].set(hero, 'pl-hero');

      const dialog = TestBed.inject(ConfirmationDialogService);
      spyOn(dialog, 'confirm').and.resolveTo(true); // GM proceeds anyway
      component.actModalParticipant = a;
      component['declaredActionSelections'].set(a, { free: 'Drop Prone', simple: [], complex: null });
      // Item 1: Act itself no longer shows any dialog - it runs immediately
      // and ends pass 1 (A was sole actor) synchronously.
      component.submitActModal();
      expect(a.status).toBe(StatusEnum.Finished);
      expect(CombatManager.passEnded).toBeTrue();
      expect(CombatManager.initiativePass).toBe(1);

      // The GM explicitly advances (same confirm spy, resolves true again -
      // Hero still owes a roll at this point too).
      component.btnNextPass_Click();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(CombatManager.initiativePass).toBe(2);

      // Hero's roll lands only now, after pass 1 has already ended.
      command('roll_submission', 'pl-hero', {
        participantId: component['getParticipantId'](hero), roll: 18, diceValues: [6, 6, 6], diceSum: 18
      });
      expect(hero.diceIni).toBe(18);

      // No logic reopens pass 1: Hero is simply back in the Waiting pool for
      // pass 2, evaluated the ordinary way against whoever is left.
      expect(hero.status).toBe(StatusEnum.Waiting);
      expect(CombatManager.initiativePass).toBe(2); // unchanged by the late roll
    });
  });

  // ── Item E: the mid-combat status line must not say "Begin Combat Turn"
  // (that button does not exist mid-combat), and must not go stale after a
  // player's own roll mid-fight. ─────────────────────────────────────────

  describe('Item E: the mid-combat status line', () => {
    it('reads "All initiative rolls in." (not "Begin Combat Turn") once everyone mid-combat has rolled', async () => {
      makeScored('A', 15, 5);
      await component.btnStartRound_Click();
      actCurrent();
      component.btnNextPass_Click(); // pass 2

      const late = addParticipantViaDialog('Late');
      late.baseIni = 9;
      late.setDicesWithoutRoll(1);
      component.btnRollInitiative_Click(late); // resolves the only outstanding roll

      // Round 4 item 3: the roll-status line moved to its own slot
      // (`rollStatusText`), separate from the session banner (`shareInfo`).
      expect(component.rollStatusText).toBe('All initiative rolls in.');
      expect(component.rollStatusText).not.toContain('Begin Combat Turn');
    });

    it('updates rather than staying stale after a player\'s own roll_submission mid-fight', async () => {
      makeScored('A', 15, 5);
      await component.btnStartRound_Click();
      actCurrent();
      component.btnNextPass_Click(); // pass 2

      const hero = addParticipantViaDialog('Hero');
      hero.baseIni = 9;
      hero.setDicesWithoutRoll(3);
      component['participantOwners'].set(hero, 'pl-hero');
      component.btnRequestPlayerRolls_Click();
      expect(component.rollStatusText).toContain('Waiting for initiative');

      command('roll_submission', 'pl-hero', {
        participantId: component['getParticipantId'](hero), roll: 10, diceValues: [6, 2, 2], diceSum: 10
      });

      // Previously stale (only ever refreshed `if (this.initiativePrepActive)`,
      // never true once combat has started) - now refreshed on this same
      // roll-landing path. Round 4 item 3: its own slot, not `shareInfo`.
      expect(component.rollStatusText).toBe('All initiative rolls in.');
    });
  });
});

// ─── Round 3 item 2: a participant who has not rolled is not given a turn
// until they roll (`briefs/mid-turn-joiner-spec.md`, "RESOLVED - validation
// round 3", item 2 - Xavier's table ruling, 2026-09-19). ───────────────────

describe('Round 3 item 2: an unrolled participant is skipped when choosing who acts next', () => {
  beforeEach(() => {
    CombatManager.participants.clear();
    CombatManager.currentActors.clear();
    CombatManager.nextSortOrder = 0;
    CombatManager.initiativePass = 1;
    CombatManager.combatTurn = 1;
    CombatManager.started = false;
    CombatManager.passEnded = true;
  });

  afterEach(() => {
    CombatManager.participants.clear();
    CombatManager.currentActors.clear();
  });

  it('a late joiner with a high bare attribute but no roll yet is never picked as current actor over a lower-scoring participant who HAS rolled', () => {
    const rolled = new Participant();
    rolled.name = 'Rolled';
    rolled.baseIni = 5;
    rolled.setDicesWithoutRoll(1);
    CombatManager.participants.insert(rolled);
    rolled.diceIni = 1; // Score 6 - low, but rolled

    const unrolled = new Participant();
    unrolled.name = 'Unrolled';
    unrolled.baseIni = 20; // bare attribute alone would dwarf Rolled's Score 6
    unrolled.setDicesWithoutRoll(1);
    CombatManager.participants.insert(unrolled); // diceIni stays 0 - never rolled

    CombatManager.started = true;
    CombatManager.passEnded = false;
    CombatManager.getNextActors();

    // Before item 2, Unrolled's bare Score 20 would have made it the sole
    // current actor over Rolled's Score 6. Item 2 skips it outright.
    expect(CombatManager.currentActors.items).toEqual([rolled]);

    // Once Unrolled actually rolls, it re-enters the ordinary comparison and
    // is picked up the very next time the order is recomputed.
    unrolled.diceIni = 3; // Score 23 now
    CombatManager.getNextActors();
    expect(CombatManager.currentActors.items).toEqual([unrolled]);
  });

  it('a genuinely solo unrolled participant grants nobody a turn and the pass ends with no Action Phase handed out', () => {
    const late = new Participant();
    late.name = 'Late';
    late.baseIni = 10;
    late.setDicesWithoutRoll(1);
    CombatManager.participants.insert(late);

    CombatManager.started = true;
    CombatManager.passEnded = false;
    CombatManager.getNextActors();

    expect(CombatManager.currentActors.count).toBe(0);
    expect(late.status).not.toBe(StatusEnum.Active);
  });
});

// ─── Round 3 item 3: the roll-status line only shows while a roll panel is
// actually visible, and never overwrites an unrelated session message
// (`briefs/mid-turn-joiner-spec.md`, "RESOLVED - validation round 3", item
// 3). ────────────────────────────────────────────────────────────────────

describe('Round 3 item 3: the roll-status line', () => {
  let component: BattleTrackerComponent;
  let fixture: ComponentFixture<BattleTrackerComponent>;
  let sync: SessionSyncService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BattleTrackerComponent],
      providers: appConfig.providers
    }).compileComponents();
    fixture = TestBed.createComponent(BattleTrackerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    CombatManager.participants.clear();
    CombatManager.currentActors.clear();
    CombatManager.nextSortOrder = 0;
    CombatManager.initiativePass = 1;
    CombatManager.combatTurn = 1;
    CombatManager.started = false;
    CombatManager.passEnded = true;
    sync = TestBed.inject(SessionSyncService);
    spyOn(sync, 'broadcastState');
    spyOn(sync, 'broadcastGmState');
    spyOn(sync, 'sendCommand');
    component.shareRoomCode = 'ABC123';
    component.sharedLogEntries = [];
  });

  afterEach(() => {
    CombatManager.participants.clear();
    CombatManager.currentActors.clear();
  });

  it('a pre-combat, pre-Start-Round ask (no panel on screen at all) never writes "Begin Combat Turn" onto shareInfo', () => {
    const hero = new Participant();
    hero.name = 'Hero';
    CombatManager.participants.insert(hero);
    component['participantOwners'].set(hero, 'pl-hero');
    component.shareInfo = '';

    expect(component.initiativePrepActive).toBeFalse();
    expect(CombatManager.started).toBeFalse();
    component.btnAskPlayerToRoll_Click(hero);

    expect(component.shareInfo).toBe('');
    // Round 4 item 3: the roll-status line has its own slot now, and stays
    // blank too - no panel is on screen for it to describe.
    expect(component.rollStatusText).toBe('');
  });

  it('never overwrites an unrelated session message (e.g. "Reconnected to session...") mid-combat - round 4 item 3: the roll status now has its own slot, so it cannot compete with this one at all', () => {
    const a = new Participant();
    a.name = 'A';
    a.baseIni = 15;
    a.setDicesWithoutRoll(1);
    CombatManager.participants.insert(a);
    a.diceIni = 5;
    CombatManager.started = true;
    CombatManager.passEnded = false;

    const late = new Participant();
    late.name = 'Late';
    late.baseIni = 9;
    late.setDicesWithoutRoll(1);
    CombatManager.participants.insert(late); // unrolled, mid-combat

    // An unrelated message the GM is currently looking at.
    component.shareInfo = 'Reconnected to session ABC123; players are back in sync.';

    component.btnRollInitiative_Click(late); // a roll-landing event mid-combat

    expect(component.shareInfo).toBe('Reconnected to session ABC123; players are back in sync.');
    // The roll-landing event still wrote its own status line - just not
    // into `shareInfo`.
    expect(component.rollStatusText).toBe('All initiative rolls in.');
  });

  it('round 4 item 3 regression: the roll-status line reappears after "Copied player link." - it no longer has to fight `shareInfo` for a slot at all', () => {
    const a = new Participant();
    a.name = 'A';
    a.baseIni = 15;
    a.setDicesWithoutRoll(1);
    CombatManager.participants.insert(a);
    a.diceIni = 5;
    CombatManager.started = true;
    CombatManager.passEnded = false;

    const late = new Participant();
    late.name = 'Late';
    late.baseIni = 9;
    late.setDicesWithoutRoll(1);
    CombatManager.participants.insert(late); // unrolled, mid-combat

    // The GM copies the player link - the same session-banner message
    // `btnCopyShareUrl_Click()` writes onto `shareInfo`, which before this
    // fix permanently starved the roll-status line of that slot for the
    // rest of the session because nothing ever cleared it.
    component.shareInfo = 'Copied player link.';

    component.btnRollInitiative_Click(late); // a roll-landing event mid-combat

    // The session banner is untouched, and the roll status still shows -
    // in its own slot, not fighting `shareInfo` for one.
    expect(component.shareInfo).toContain('Copied player link');
    expect(component.rollStatusText).toBe('All initiative rolls in.');
  });

  it('a stale "All initiative rolls in." does not survive a later Next Pass - it clears rather than lingering for the rest of the fight', () => {
    const a = new Participant();
    a.name = 'A';
    a.baseIni = 15;
    a.setDicesWithoutRoll(1);
    CombatManager.participants.insert(a);
    a.diceIni = 5;
    CombatManager.started = true;
    CombatManager.passEnded = false;

    const late = new Participant();
    late.name = 'Late';
    late.baseIni = 9;
    late.setDicesWithoutRoll(1);
    CombatManager.participants.insert(late);
    component.btnRollInitiative_Click(late); // resolves the only outstanding roll

    expect(component.rollStatusText).toBe('All initiative rolls in.');

    component.btnNextPass_Click(); // nothing pending - synchronous, no dialog

    expect(component.rollStatusText).toBe('');
  });
});

// ─── Round 3 item 4: re-registering as a different character type keeps the
// "asked" record instead of losing it (`briefs/mid-turn-joiner-spec.md`,
// "RESOLVED - validation round 3", item 4). ─────────────────────────────────

describe('Round 3 item 4: re-registering as a different character type keeps the "asked" record', () => {
  let component: BattleTrackerComponent;
  let fixture: ComponentFixture<BattleTrackerComponent>;
  let sync: SessionSyncService;
  let broadcasts: SharedCombatState[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BattleTrackerComponent],
      providers: appConfig.providers
    }).compileComponents();
    fixture = TestBed.createComponent(BattleTrackerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    CombatManager.participants.clear();
    CombatManager.currentActors.clear();
    CombatManager.nextSortOrder = 0;
    CombatManager.initiativePass = 1;
    CombatManager.combatTurn = 1;
    CombatManager.started = false;
    CombatManager.passEnded = true;
    sync = TestBed.inject(SessionSyncService);
    broadcasts = [];
    spyOn(sync, 'broadcastState').and.callFake((s: SharedCombatState) => { broadcasts.push(s); });
    spyOn(sync, 'broadcastGmState');
    spyOn(sync, 'sendCommand');
    component.shareRoomCode = 'ABC123';
    component.sharedLogEntries = [];
  });

  afterEach(() => {
    CombatManager.participants.clear();
    CombatManager.currentActors.clear();
  });

  function command(type: string, playerName: string, payload: Record<string, unknown> = {}) {
    component['handleSessionCommand']({ type, player: playerName, payload, timestamp: new Date().toISOString() });
  }

  it('carries the ask onto the new participant object and drops the stale record under the old id', () => {
    command('register_character', 'pl-hero', {
      characterName: 'Hero', initiativeDice: 1, reaction: 6, intuition: 5, isMatrix: false
    });
    const firstHero = CombatManager.participants.items.find(p => p.name === 'Hero')!;
    const oldId = component['getParticipantId'](firstHero);
    component.btnAskPlayerToRoll_Click(firstHero);
    expect(component['participantsAskedToRoll'].has(oldId)).toBeTrue();

    // Same player re-registers as a decker (type mismatch: Participant -> MatrixParticipant),
    // which discards the old object and builds a brand-new one.
    command('register_character', 'pl-hero', {
      characterName: 'Hero', initiativeDice: 1, reaction: 6, intuition: 5, isMatrix: true, dataProcessing: 4
    });
    const newHero = CombatManager.participants.items.find(p => p.name === 'Hero')!;
    expect(newHero).not.toBe(firstHero);
    const newId = component['getParticipantId'](newHero);

    // The stale record under the discarded object's id is gone...
    expect(component['participantsAskedToRoll'].has(oldId)).toBeFalse();
    // ...and the new object is asked under its own id instead - same
    // request, carried across, not a fresh one and not a lost one.
    expect(component['participantsAskedToRoll'].has(newId)).toBeTrue();
    expect(component['isAskedToRoll'](newHero, true)).toBeTrue();
  });

  it('a re-registration that was never asked stays not-asked (no ask fabricated out of nothing)', () => {
    command('register_character', 'pl-hero', {
      characterName: 'Hero', initiativeDice: 1, reaction: 6, intuition: 5, isMatrix: false
    });
    const firstHero = CombatManager.participants.items.find(p => p.name === 'Hero')!;
    expect(component['isAskedToRoll'](firstHero, true)).toBeFalse();

    command('register_character', 'pl-hero', {
      characterName: 'Hero', initiativeDice: 1, reaction: 6, intuition: 5, isMatrix: true, dataProcessing: 4
    });
    const newHero = CombatManager.participants.items.find(p => p.name === 'Hero')!;
    expect(component['isAskedToRoll'](newHero, true)).toBeFalse();
    void broadcasts;
  });
});

// ─── Round 3 item 5: the player's own roll supersedes a GM row-button roll,
// exactly once (`briefs/mid-turn-joiner-spec.md`, "RESOLVED - validation
// round 3", item 5 - Xavier's decision, reversing the orchestrator's
// recommendation). ──────────────────────────────────────────────────────────

describe('Round 3 item 5: the player\'s own roll supersedes the GM\'s row-button roll, exactly once', () => {
  let component: BattleTrackerComponent;
  let fixture: ComponentFixture<BattleTrackerComponent>;
  let sync: SessionSyncService;
  let broadcasts: SharedCombatState[];
  let logged: SharedLogEntry[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BattleTrackerComponent],
      providers: appConfig.providers
    }).compileComponents();
    fixture = TestBed.createComponent(BattleTrackerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    CombatManager.participants.clear();
    CombatManager.currentActors.clear();
    CombatManager.nextSortOrder = 0;
    CombatManager.initiativePass = 1;
    CombatManager.combatTurn = 1;
    CombatManager.started = false;
    CombatManager.passEnded = true;
    sync = TestBed.inject(SessionSyncService);
    broadcasts = [];
    logged = [];
    spyOn(sync, 'broadcastState').and.callFake((s: SharedCombatState) => { broadcasts.push(s); });
    spyOn(sync, 'broadcastGmState');
    spyOn(sync, 'sendCommand');
    spyOn(sync, 'appendLog').and.callFake((entry: SharedLogEntry) => { logged.push(entry); });
    component.shareRoomCode = 'ABC123';
    component.sharedLogEntries = [];
  });

  afterEach(() => {
    CombatManager.participants.clear();
    CombatManager.currentActors.clear();
  });

  function command(type: string, playerName: string, payload: Record<string, unknown> = {}) {
    component['handleSessionCommand']({ type, player: playerName, payload, timestamp: new Date().toISOString() });
  }

  it('mid-combat: the GM rolls for a player-owned late joiner with the row dice button; the player\'s own roll then supersedes it, and the log names the supersession', () => {
    const a = new Participant();
    a.name = 'A';
    a.baseIni = 15;
    a.setDicesWithoutRoll(1);
    CombatManager.participants.insert(a);
    a.diceIni = 5;
    CombatManager.started = true;
    CombatManager.passEnded = false;

    const hero = new Participant();
    hero.name = 'Hero';
    hero.baseIni = 9;
    hero.setDicesWithoutRoll(3);
    CombatManager.participants.insert(hero);
    component['participantOwners'].set(hero, 'pl-hero');
    const heroId = component['getParticipantId'](hero);

    // Round 4 item 4: the supersede precondition requires Hero to have been
    // asked to roll at some point this Combat Turn, not merely GM-rolled -
    // matches the real flow (the pop-up that would let a player roll for
    // themselves only ever opens for someone who was asked).
    component.btnAskPlayerToRoll_Click(hero);
    component.btnRollInitiative_Click(hero); // the GM rolls for Hero
    expect(hero.diceIni).toBeGreaterThan(0);
    expect(component['participantsWithSupersedableGmRoll'].has(heroId)).toBeTrue();

    command('roll_submission', 'pl-hero', {
      participantId: heroId, roll: 12, diceValues: [6, 6], diceSum: 12
    });

    // The player's roll replaced the GM's - attribute(9) + 12 = 21,
    // deterministically, regardless of whatever the GM's random row-button
    // roll happened to produce.
    expect(hero.diceIni).toBe(12);
    expect(hero.getCurrentInitiative()).toBe(21);
    expect(component['participantsWithSupersedableGmRoll'].has(heroId)).toBeFalse();
    expect(logged.length).toBeGreaterThan(0);
    const lastLog = logged[logged.length - 1];
    expect(lastLog.text).toContain('supersedes the GM');
  });

  it('a second player submission after the supersession is ignored - only once', () => {
    const hero = new Participant();
    hero.name = 'Hero';
    hero.baseIni = 9;
    hero.setDicesWithoutRoll(3);
    CombatManager.participants.insert(hero);
    component['participantOwners'].set(hero, 'pl-hero');
    CombatManager.started = true;
    CombatManager.passEnded = false;
    const heroId = component['getParticipantId'](hero);

    component.btnAskPlayerToRoll_Click(hero); // round 4 item 4 precondition
    component.btnRollInitiative_Click(hero);
    command('roll_submission', 'pl-hero', {
      participantId: heroId, roll: 12, diceValues: [6, 6], diceSum: 12
    });
    const afterFirst = hero.getCurrentInitiative();

    command('roll_submission', 'pl-hero', {
      participantId: heroId, roll: 18, diceValues: [6, 6, 6], diceSum: 18
    });

    expect(hero.getCurrentInitiative()).toBe(afterFirst); // unchanged - ignored
  });

  it('a participant who rolled for themselves (never GM-rolled) still rejects a resubmission exactly as before - regression', () => {
    const hero = new Participant();
    hero.name = 'Hero';
    hero.baseIni = 9;
    hero.setDicesWithoutRoll(3);
    CombatManager.participants.insert(hero);
    component['participantOwners'].set(hero, 'pl-hero');
    CombatManager.started = true;
    CombatManager.passEnded = false;
    const heroId = component['getParticipantId'](hero);

    command('roll_submission', 'pl-hero', {
      participantId: heroId, roll: 10, diceValues: [6, 4], diceSum: 10
    });
    const afterFirst = hero.getCurrentInitiative();

    command('roll_submission', 'pl-hero', {
      participantId: heroId, roll: 18, diceValues: [6, 6, 6], diceSum: 18
    });

    expect(hero.getCurrentInitiative()).toBe(afterFirst);
  });

  it('pre-combat: the GM rolls with the row dice button before Start Round; the player\'s own roll still supersedes it', () => {
    const hero = new Participant();
    hero.name = 'Hero';
    hero.baseIni = 9;
    hero.setDicesWithoutRoll(3);
    CombatManager.participants.insert(hero);
    component['participantOwners'].set(hero, 'pl-hero');
    const heroId = component['getParticipantId'](hero);

    expect(CombatManager.started).toBeFalse();
    component.btnAskPlayerToRoll_Click(hero); // round 4 item 4 precondition
    component.btnRollInitiative_Click(hero);
    expect(hero.diceIni).toBeGreaterThan(0);

    command('roll_submission', 'pl-hero', {
      participantId: heroId, roll: 12, diceValues: [6, 6], diceSum: 12
    });

    expect(hero.getCurrentInitiative()).toBe(21); // 9 + 12
  });

  it('never carries across a Combat Turn boundary - a submission after the turn ends is not superseded, per the ordinary once-per-turn guard', () => {
    const hero = new Participant();
    hero.name = 'Hero';
    hero.baseIni = 9;
    hero.setDicesWithoutRoll(3);
    CombatManager.participants.insert(hero);
    component['participantOwners'].set(hero, 'pl-hero');
    CombatManager.started = true;
    CombatManager.passEnded = false;
    const heroId = component['getParticipantId'](hero);

    component.btnRollInitiative_Click(hero); // GM rolls this turn
    expect(component['participantsWithSupersedableGmRoll'].has(heroId)).toBeTrue();

    // The Combat Turn boundary fires (End Combat is the simplest way to
    // reach `logCombatTurnEnded`'s sibling clear without threading a whole
    // multi-pass sequence here - `beginCombatTurn()`'s own clear is asserted
    // directly instead, since both are the documented clear points).
    component['beginCombatTurn']();

    expect(component['participantsWithSupersedableGmRoll'].has(heroId)).toBeFalse();
    void broadcasts;
  });
});

// ─── Round 3 item 7: "who has been asked" shows on the participant's own
// row, and in the pre-combat Initiative Prep panel too
// (`briefs/mid-turn-joiner-spec.md`, "RESOLVED - validation round 3", item
// 7). ────────────────────────────────────────────────────────────────────

describe('Round 3 item 7: "who has been asked" display', () => {
  let component: BattleTrackerComponent;
  let fixture: ComponentFixture<BattleTrackerComponent>;
  let sync: SessionSyncService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BattleTrackerComponent],
      providers: appConfig.providers
    }).compileComponents();
    fixture = TestBed.createComponent(BattleTrackerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    CombatManager.participants.clear();
    CombatManager.currentActors.clear();
    CombatManager.nextSortOrder = 0;
    CombatManager.initiativePass = 1;
    CombatManager.combatTurn = 1;
    CombatManager.started = false;
    CombatManager.passEnded = true;
    sync = TestBed.inject(SessionSyncService);
    spyOn(sync, 'broadcastState');
    spyOn(sync, 'broadcastGmState');
    spyOn(sync, 'sendCommand');
    component.shareRoomCode = 'ABC123';
    component.sharedLogEntries = [];
  });

  afterEach(() => {
    CombatManager.participants.clear();
    CombatManager.currentActors.clear();
  });

  it('shows on the row once asked, pre-combat', () => {
    const hero = new Participant();
    hero.name = 'Hero';
    CombatManager.participants.insert(hero);
    component['participantOwners'].set(hero, 'pl-hero');

    expect(component.participantAskedToRoll(hero)).toBeFalse();
    component.btnAskPlayerToRoll_Click(hero);
    expect(component.participantAskedToRoll(hero)).toBeTrue();

    fixture.detectChanges();
    const markers = fixture.nativeElement.querySelectorAll('[data-testid="asked-to-roll-indicator"]');
    expect(markers.length).toBeGreaterThan(0);
  });

  // QA fix round 3 (Xavier hands-on test: "the messages in the row are all
  // messed up formatting wise"). Once asked, `participantAskedToRoll()` is
  // strictly more specific than `participantNeedsInitiativeRoll()` (asking
  // requires `pendingRoll`), so showing both at once was pure repetition of
  // the same fact - "Asked to roll" now takes priority and "Needs Initiative
  // roll" does not also render for the same participant, and the ask button
  // sits in the same status-row container as the badge rather than squeezed
  // into the rolled-total input-group.
  it('the "asked" badge replaces the "needs a roll" badge, not stacks with it, and the ask button stays with them', () => {
    const hero = new Participant();
    hero.name = 'Hero';
    CombatManager.participants.insert(hero);
    component['participantOwners'].set(hero, 'pl-hero');
    CombatManager.started = true;

    fixture.detectChanges();
    // Before asking: only the plain "needs a roll" badge.
    expect(fixture.nativeElement.querySelector('[data-testid="needs-initiative-roll-indicator"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="asked-to-roll-indicator"]')).toBeNull();

    component.btnAskPlayerToRoll_Click(hero);
    fixture.detectChanges();

    // After asking: only the "asked" badge - the redundant "needs a roll"
    // badge for the same fact is gone, not doubled up beside it.
    const askedBadge: Element | null =
      fixture.nativeElement.querySelector('[data-testid="asked-to-roll-indicator"]');
    expect(askedBadge).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="needs-initiative-roll-indicator"]')).toBeNull();

    // The ask button (still visible - the roll is still outstanding) stays
    // beside the dice-roll button in the Roll column, so the two read as a
    // pair. The badge sits on the same row, in the Actions column (GM screen
    // overhaul 08, #11), so the row stays one line tall.
    const row: Element | null = askedBadge!.closest('.participant');
    expect(askedBadge!.closest('.gm-col-actions')).withContext('badge in the Actions column').not.toBeNull();
    const askBtn: Element | null = row!.querySelector('[data-testid="ask-player-to-roll-btn"]');
    expect(askBtn).withContext('ask button on the same row').not.toBeNull();
    const rolledCol: Element | null = askBtn!.closest('.gm-rolled-ini-col');
    expect(rolledCol?.querySelector('.gm-roll-btn')).withContext('same column as the dice-roll button').not.toBeNull();
  });

  it('the pre-combat Initiative Prep panel names who has been asked', () => {
    const hero = new Participant();
    hero.name = 'Hero';
    CombatManager.participants.insert(hero);
    component['participantOwners'].set(hero, 'pl-hero');

    component['initiativePrepActive'] = true;
    component.btnRequestPlayerRolls_Click();
    fixture.detectChanges();

    // GM screen overhaul 14 (#17): the Prep card is now the rolls-owed bar.
    const askedEl = fixture.nativeElement.querySelector('[data-testid="rolls-owed-names"]');
    expect(askedEl.textContent).toContain('Hero (asked)');
  });
});

// ─── Round 3 item 8: guard against a deferred, confirmed advance being
// applied twice, or applied stale (`briefs/mid-turn-joiner-spec.md`,
// "RESOLVED - validation round 3", item 8). ─────────────────────────────────

describe('Round 3 item 8: guard against the confirmed Next Pass advance running twice', () => {
  let component: BattleTrackerComponent;
  let fixture: ComponentFixture<BattleTrackerComponent>;
  let sync: SessionSyncService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BattleTrackerComponent],
      providers: appConfig.providers
    }).compileComponents();
    fixture = TestBed.createComponent(BattleTrackerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    CombatManager.participants.clear();
    CombatManager.currentActors.clear();
    CombatManager.nextSortOrder = 0;
    CombatManager.initiativePass = 1;
    CombatManager.combatTurn = 1;
    CombatManager.started = false;
    CombatManager.passEnded = true;
    sync = TestBed.inject(SessionSyncService);
    spyOn(sync, 'broadcastState');
    spyOn(sync, 'broadcastGmState');
    spyOn(sync, 'sendCommand');
    component.shareRoomCode = 'ABC123';
    component.sharedLogEntries = [];
  });

  afterEach(() => {
    CombatManager.participants.clear();
    CombatManager.currentActors.clear();
  });

  it('a rapid double-click of Next Pass, both awaiting the same held-open confirm dialog, only advances the pass once', async () => {
    // Item 1 removes the round-2 Act/Delay confirm dialogs entirely (see
    // `submitActModal()`/`btnDelay_Click()`'s own doc comments), which also
    // removes the specific race item 8's own wording describes ("the player
    // can tap Act on their phone" while a GM confirm dialog is open for
    // them) - that dialog no longer exists to race against. Next Pass / End
    // Combat Turn is the one confirm-gated advance item 1 keeps, and it can
    // only ever be reachable while `passEnded` is already true - at which
    // point nobody is `Active` for a player command to race against it.
    // The still-real risk on this one remaining control is the GM's own
    // double-tap: two overlapping clicks, both awaiting the same dialog,
    // both eventually confirmed - this is the scenario the guard actually
    // defends, exercised directly here.
    const a = new Participant();
    a.name = 'A';
    a.baseIni = 15;
    a.setDicesWithoutRoll(1);
    CombatManager.participants.insert(a);
    a.diceIni = 5;
    CombatManager.started = true;
    CombatManager.passEnded = true; // Next Pass is only ever reachable in this state

    const late = new Participant();
    late.name = 'Late';
    late.baseIni = 9;
    late.setDicesWithoutRoll(1);
    CombatManager.participants.insert(late); // still owes a roll

    const dialog = TestBed.inject(ConfirmationDialogService);
    let resolveConfirm!: (v: boolean) => void;
    const heldOpen = new Promise<boolean>(resolve => { resolveConfirm = resolve; });
    spyOn(dialog, 'confirm').and.returnValue(heldOpen);

    // Two rapid clicks, neither awaited individually - both see the same
    // "nothing has happened yet" snapshot and await the same dialog.
    component.btnNextPass_Click();
    component.btnNextPass_Click();
    expect(CombatManager.initiativePass).toBe(1); // nothing has happened yet

    resolveConfirm(true);
    await new Promise(resolve => setTimeout(resolve, 0));

    // Only one advance actually happened, not two.
    expect(CombatManager.initiativePass).toBe(2);
  });

  it('regression: an ordinary, uninterrupted confirm still advances exactly once', async () => {
    const a = new Participant();
    a.name = 'A';
    a.baseIni = 15;
    a.setDicesWithoutRoll(1);
    CombatManager.participants.insert(a);
    a.diceIni = 5;
    CombatManager.started = true;
    CombatManager.passEnded = false;

    const late = new Participant();
    late.name = 'Late';
    late.baseIni = 9;
    late.setDicesWithoutRoll(1);
    CombatManager.participants.insert(late);

    const dialog = TestBed.inject(ConfirmationDialogService);
    spyOn(dialog, 'confirm').and.resolveTo(true);

    component.btnNextPass_Click();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(CombatManager.initiativePass).toBe(2);
  });
});

// ─── D1 fix (validation round 1) / validator failure 3 (round 2 redesign): a
// second late joiner never sees a locked pop-up they never asked the GM for -
// asserted on the actual player side (`PlayerViewComponent`), not only via
// the GM's own bookkeeping. A fresh TestBed module per test, with both
// components in one `imports`
// array, so the same `SessionSyncService` singleton backs both fixtures and
// the GM's real broadcasts can be fed straight into the player component via
// `applyIncomingState()` - the same technique
// `player-initiative-prompt.spec.ts` uses for synthetic states, here with
// genuine ones produced by the real GM handlers. ───────────────────────────

describe('D1: a second player-owned late joiner never auto-opens the locked roll pop-up (validation round 1)', () => {
  let gm: BattleTrackerComponent;
  let gmFixture: ComponentFixture<BattleTrackerComponent>;
  let player: PlayerViewComponent;
  let playerFixture: ComponentFixture<PlayerViewComponent>;
  let sync: SessionSyncService;
  let broadcasts: SharedCombatState[];

  function resetCombatLocal() {
    CombatManager.participants.clear();
    CombatManager.currentActors.clear();
    CombatManager.nextSortOrder = 0;
    CombatManager.initiativePass = 1;
    CombatManager.combatTurn = 1;
    CombatManager.started = false;
    CombatManager.passEnded = true;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BattleTrackerComponent, PlayerViewComponent],
      providers: appConfig.providers
    }).compileComponents();

    gmFixture = TestBed.createComponent(BattleTrackerComponent);
    gm = gmFixture.componentInstance;
    gmFixture.detectChanges();
    resetCombatLocal();

    sync = TestBed.inject(SessionSyncService);
    broadcasts = [];
    spyOn(sync, 'broadcastState').and.callFake((s: SharedCombatState) => { broadcasts.push(s); });
    spyOn(sync, 'broadcastGmState');
    spyOn(sync, 'sendCommand');
    spyOn(sync, 'connect');

    gm.shareRoomCode = 'ABC123';
    gm.sharedLogEntries = [];

    playerFixture = TestBed.createComponent(PlayerViewComponent);
    player = playerFixture.componentInstance;
    // The real roll modal must never actually open in a headless test.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const modal = (player as any).modalService as NgbModal;
    spyOn(modal, 'open').and.callFake(() => {
      let rejectFn!: (reason?: unknown) => void;
      const result = new Promise((_resolve, reject) => { rejectFn = reject; });
      result.catch(() => { /* expected: every close is a dismiss */ });
      return {
        dismiss: jasmine.createSpy('dismiss').and.callFake((reason?: unknown) => rejectFn(reason)),
        result
      } as unknown as NgbModalRef;
    });
    playerFixture.detectChanges();
  });

  afterEach(() => resetCombatLocal());

  function makeScored(name: string, baseIni: number, roll: number): Participant {
    const p = new Participant();
    p.name = name;
    p.baseIni = baseIni;
    p.setDicesWithoutRoll(1);
    CombatManager.participants.insert(p);
    p.diceIni = roll;
    return p;
  }

  function actCurrent(): void {
    const actor = CombatManager.currentActors.items[0];
    gm['performAct'](actor, null);
  }

  function command(type: string, playerName: string, payload: Record<string, unknown> = {}) {
    gm['handleSessionCommand']({ type, player: playerName, payload, timestamp: new Date().toISOString() });
  }

  function addParticipantViaDialog(name: string): Participant {
    gm.btnAddParticipant_Click();
    gm.pendingAddDraft!.name = name;
    gm.commitAddDraft();
    return CombatManager.participants.items.find(x => x.name === name) as Participant;
  }

  function lastBroadcast(): SharedCombatState {
    return broadcasts[broadcasts.length - 1];
  }

  function pushLatestStateToPlayer(): void {
    player['applyIncomingState'](lastBroadcast());
    playerFixture.detectChanges();
  }

  function askedToRollFor(id: string): boolean | undefined {
    return lastBroadcast().participants.find(p => p.id === id)?.askedToRoll;
  }

  it('"+ Participant" joiner B, added after A has rolled, never opens B\'s pop-up on the player side', async () => {
    const bToken = player['playerToken'];

    const a = makeScored('A', 15, 5); // Score 20, already rolled
    await gm.btnStartRound_Click();
    actCurrent();
    gm.btnNextPass_Click(); // pass 2

    // Joiner A (an earlier late joiner) requests and rolls, exactly as
    // Scenario 1/3 do - this is what must clear Joiner A's own "asked"
    // record before B ever appears.
    const joinerA = addParticipantViaDialog('JoinerA');
    joinerA.baseIni = 9;
    joinerA.setDicesWithoutRoll(1);
    gm.btnToggleClaimable_Click(joinerA);
    command('claim_character', 'pl-joiner-a', { participantId: gm['getParticipantId'](joinerA) });
    gm.btnRequestPlayerRolls_Click();
    command('roll_submission', 'pl-joiner-a', {
      participantId: gm['getParticipantId'](joinerA), roll: 10, diceValues: [6, 4], diceSum: 10
    });
    pushLatestStateToPlayer();
    // D1/item A choke point already proved GM-side: Joiner A's own record
    // clears the moment their roll lands.
    expect(askedToRollFor(gm['getParticipantId'](joinerA))).toBeFalsy();

    // Now joiner B (this player) is added via the real "+ Participant"
    // handler, made player-owned through the real claim path (not a direct
    // owner-map write).
    const joinerB = addParticipantViaDialog('JoinerB');
    joinerB.baseIni = 11;
    joinerB.setDicesWithoutRoll(1);
    gm.btnToggleClaimable_Click(joinerB);
    command('claim_character', bToken, { participantId: gm['getParticipantId'](joinerB) });
    pushLatestStateToPlayer();

    expect(player.primaryCharacter?.name).toBe('JoinerB');
    expect(player.primaryCharacter?.pendingRoll).toBeTrue();
    // Validator failure 3, fixed: joining does not mark anyone asked, and
    // Joiner A's earlier "Request Player Rolls" click (a snapshot of who was
    // pending AT THAT TIME) never covers someone who arrives afterward.
    expect(player.primaryCharacter?.askedToRoll).toBeFalsy();
    // The whole point of D1: no GM click happened for B, so the pop-up must
    // stay shut.
    expect(player.promptRoll).toBeFalse();
    expect(player.rollModalRef).toBeNull();
    void a;
  });

  it('a brand-new register_character joiner B, added after A has rolled, never opens B\'s pop-up on the player side', async () => {
    const bToken = player['playerToken'];

    makeScored('A', 15, 5); // Score 20, already rolled
    await gm.btnStartRound_Click();
    actCurrent();
    gm.btnNextPass_Click(); // pass 2

    const joinerA = addParticipantViaDialog('JoinerA');
    joinerA.baseIni = 9;
    joinerA.setDicesWithoutRoll(1);
    gm.btnToggleClaimable_Click(joinerA);
    command('claim_character', 'pl-joiner-a', { participantId: gm['getParticipantId'](joinerA) });
    gm.btnRequestPlayerRolls_Click();
    command('roll_submission', 'pl-joiner-a', {
      participantId: gm['getParticipantId'](joinerA), roll: 10, diceValues: [6, 4], diceSum: 10
    });
    pushLatestStateToPlayer();
    expect(askedToRollFor(gm['getParticipantId'](joinerA))).toBeFalsy();

    // Joiner B registers fresh, mid-fight - `register_character` sets
    // ownership internally (the other genuine "real path", never a direct
    // owner-map write).
    command('register_character', bToken, {
      characterName: 'JoinerB', initiativeDice: 1, reaction: 6, intuition: 5, isMatrix: false
    });
    pushLatestStateToPlayer();

    expect(player.primaryCharacter?.name).toBe('JoinerB');
    expect(player.primaryCharacter?.pendingRoll).toBeTrue();
    expect(player.primaryCharacter?.askedToRoll).toBeFalsy();
    expect(player.promptRoll).toBeFalse();
    expect(player.rollModalRef).toBeNull();
  });

  // ── Validator failure 1 (round 2 redesign): release then re-claim of the
  // last player owed a roll must NOT silently cancel the request - the
  // pop-up must come back once they reconnect and reclaim. ────────────────

  it('validator failure 1, fixed: releasing and re-claiming the asked character does not clear the request - the pop-up reopens on reclaim', async () => {
    const bToken = player['playerToken'];
    makeScored('A', 15, 5); // Score 20, already rolled
    await gm.btnStartRound_Click();
    actCurrent();
    gm.btnNextPass_Click(); // pass 2

    const hero = addParticipantViaDialog('Hero');
    hero.baseIni = 9;
    hero.setDicesWithoutRoll(1);
    gm.btnToggleClaimable_Click(hero);
    command('claim_character', bToken, { participantId: gm['getParticipantId'](hero) });
    gm.btnRequestPlayerRolls_Click();
    pushLatestStateToPlayer();

    expect(player.primaryCharacter?.name).toBe('Hero');
    expect(player.primaryCharacter?.askedToRoll).toBeTrue();
    expect(player.promptRoll).toBeTrue();

    // A phone sleeping / a dropped socket: the GM releases the claim (the
    // real path a lost connection resolves through), which used to be
    // exactly what the table-wide `rollsRequested` switch keyed off of -
    // "nobody owns it, so nobody can be waiting on it" was never the rule.
    command('release_claims', bToken, {});
    pushLatestStateToPlayer();
    expect(player.ownParticipants.length).toBe(0);

    // Reclaim (the player's phone wakes back up).
    command('claim_character', bToken, { participantId: gm['getParticipantId'](hero) });
    pushLatestStateToPlayer();

    // The record was never touched by the release, so it is still there
    // waiting the moment ownership comes back - this is the fix.
    expect(player.primaryCharacter?.name).toBe('Hero');
    expect(player.primaryCharacter?.askedToRoll).toBeTrue();
    expect(player.promptRoll).toBeTrue();
    expect(player.rollModalRef).not.toBeNull();
  });

  // ── Item A's new per-row control: asks only ONE player. ──────────────────

  it('per-row "ask this player" (btnAskPlayerToRoll_Click) asks only that player - a second player\'s pop-up stays closed', async () => {
    const bToken = player['playerToken'];
    makeScored('A', 15, 5); // Score 20, already rolled
    await gm.btnStartRound_Click();
    actCurrent();
    gm.btnNextPass_Click(); // pass 2

    const hero = addParticipantViaDialog('Hero'); // asked
    hero.baseIni = 9;
    hero.setDicesWithoutRoll(1);
    gm.btnToggleClaimable_Click(hero);
    command('claim_character', 'pl-other', { participantId: gm['getParticipantId'](hero) });

    const other = addParticipantViaDialog('Other'); // not asked
    other.baseIni = 8;
    other.setDicesWithoutRoll(1);
    gm.btnToggleClaimable_Click(other);
    command('claim_character', bToken, { participantId: gm['getParticipantId'](other) });

    gm.btnAskPlayerToRoll_Click(hero);
    pushLatestStateToPlayer();

    // This player owns Other, who was never asked - their own pop-up stays
    // shut even though the GM just asked a DIFFERENT player. This is
    // exactly the failure the old table-wide switch could not express: it
    // had no way to say "only THIS person".
    expect(player.primaryCharacter?.name).toBe('Other');
    expect(player.primaryCharacter?.pendingRoll).toBeTrue();
    expect(player.primaryCharacter?.askedToRoll).toBeFalsy();
    expect(player.promptRoll).toBeFalse();
    expect(player.rollModalRef).toBeNull();
    expect(askedToRollFor(gm['getParticipantId'](hero))).toBeTrue();
  });

  // Round 3 item 6 (asking one player chimes only that player) is covered
  // below, in its own lightweight describe - it needs the player's real
  // `request_rolls` command handler registered (`PlayerViewComponent.join()`),
  // which this describe's `pushLatestStateToPlayer()` helper deliberately
  // bypasses (it calls `applyIncomingState()` directly).

  // ── Validator-noted gap: the GM's per-row dice button closes the
  // player's own pop-up, asserted on the player side. ──────────────────────

  it('gap fix: the GM row dice button closes the player\'s own locked pop-up', async () => {
    const bToken = player['playerToken'];
    makeScored('A', 15, 5); // Score 20, already rolled
    await gm.btnStartRound_Click();
    actCurrent();
    gm.btnNextPass_Click(); // pass 2

    const hero = addParticipantViaDialog('Hero');
    hero.baseIni = 9;
    hero.setDicesWithoutRoll(1);
    gm.btnToggleClaimable_Click(hero);
    command('claim_character', bToken, { participantId: gm['getParticipantId'](hero) });

    gm.btnAskPlayerToRoll_Click(hero);
    pushLatestStateToPlayer();
    expect(player.promptRoll).toBeTrue();
    expect(player.rollModalRef).not.toBeNull();

    // The GM rolls for Hero with the row dice button instead of waiting.
    gm.btnRollInitiative_Click(hero);
    pushLatestStateToPlayer();

    // The player's own locked pop-up closes - the roll landed, by whichever
    // route.
    expect(player.promptRoll).toBeFalse();
    expect(player.primaryCharacter?.pendingRoll).toBeFalse();
  });

  // ── Validator-noted gap: release then re-claim pre-combat (not only
  // mid-combat) leaves the ask intact. ──────────────────────────────────────

  it('gap fix: pre-combat, releasing and re-claiming the asked character does not clear the request', async () => {
    const bToken = player['playerToken'];
    const hero = addParticipantViaDialog('Hero'); // unrolled, still pre-combat
    hero.baseIni = 9;
    gm.btnToggleClaimable_Click(hero);
    command('claim_character', bToken, { participantId: gm['getParticipantId'](hero) });

    expect(CombatManager.started).toBeFalse();
    gm.btnAskPlayerToRoll_Click(hero);
    pushLatestStateToPlayer();

    expect(player.primaryCharacter?.name).toBe('Hero');
    expect(player.primaryCharacter?.askedToRoll).toBeTrue();
    expect(player.promptRoll).toBeTrue();

    command('release_claims', bToken, {});
    pushLatestStateToPlayer();
    expect(player.ownParticipants.length).toBe(0);

    command('claim_character', bToken, { participantId: gm['getParticipantId'](hero) });
    pushLatestStateToPlayer();

    expect(player.primaryCharacter?.name).toBe('Hero');
    expect(player.primaryCharacter?.askedToRoll).toBeTrue();
    expect(player.promptRoll).toBeTrue();
    expect(player.rollModalRef).not.toBeNull();
  });
});

// ─── Round 3 item 6: asking one player chimes only that player
// (`briefs/mid-turn-joiner-spec.md`, "RESOLVED - validation round 3", item
// 6 - round-3 defect 8). Uses the same lightweight single-`PlayerViewComponent`
// harness as `player-initiative-prompt.spec.ts` (a real `join()` so
// `session.onCommand()` is genuinely registered, which the two-fixture D1
// describe above deliberately bypasses via `applyIncomingState()` alone). ──

describe('Round 3 item 6: asking one player chimes only that player', () => {
  let component: PlayerViewComponent;
  let fixture: ComponentFixture<PlayerViewComponent>;
  let sync: SessionSyncService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlayerViewComponent],
      providers: appConfig.providers
    }).compileComponents();
    fixture = TestBed.createComponent(PlayerViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    sync = TestBed.inject(SessionSyncService);
    spyOn(sync, 'connect');
  });

  function stateWith(participants: SharedParticipantState[]): SharedCombatState {
    return { round: 1, pass: 1, started: true, participants };
  }

  function participant(overrides: Partial<SharedParticipantState> & { id: string; name: string; order: number }): SharedParticipantState {
    return { active: false, playerControlled: true, ...overrides };
  }

  async function join(state: SharedCombatState | null): Promise<void> {
    spyOn(sync, 'joinAsPlayer').and.resolveTo({ state, log: [], gmConnected: true });
    component.room = 'ABC123';
    await component.join();
    fixture.detectChanges();
  }

  it('a targeted ask naming someone else never re-chimes this player\'s already-open pop-up', async () => {
    // This player owns "Other", already asked and already showing its own
    // locked pop-up.
    const other = participant({
      id: 'p-other', name: 'Other', order: 1, ownerName: component['playerToken'],
      initiativeDice: 1, pendingRoll: true, askedToRoll: true
    });
    let commandHandler!: (c: SessionCommand) => void;
    spyOn(sync, 'onCommand').and.callFake(h => { commandHandler = h; });
    await join(stateWith([other]));

    commandHandler({ type: 'request_rolls', player: 'GM', payload: {}, timestamp: new Date().toISOString() });
    fixture.detectChanges();
    expect(component.promptRoll).toBeTrue();
    component.rollPromptNudge = false; // clear the opening nudge

    // The GM now asks a DIFFERENT participant ("p-hero") specifically, via
    // the per-row control - the command names that id.
    commandHandler({
      type: 'request_rolls', player: 'GM', payload: { participantId: 'p-hero' },
      timestamp: new Date().toISOString()
    });
    fixture.detectChanges();

    expect(component.promptRoll).toBeTrue(); // still open, unaffected
    expect(component.rollPromptNudge).toBeFalse(); // never re-chimed
  });

  it('regression: an untargeted ask (the batch "Request Player Rolls" button) still re-nudges an already-open pop-up', async () => {
    const other = participant({
      id: 'p-other', name: 'Other', order: 1, ownerName: component['playerToken'],
      initiativeDice: 1, pendingRoll: true, askedToRoll: true
    });
    let commandHandler!: (c: SessionCommand) => void;
    spyOn(sync, 'onCommand').and.callFake(h => { commandHandler = h; });
    await join(stateWith([other]));

    commandHandler({ type: 'request_rolls', player: 'GM', payload: {}, timestamp: new Date().toISOString() });
    fixture.detectChanges();
    component.rollPromptNudge = false;

    // The GM presses the batch button again (no `participantId` - the same
    // shape it has always sent) - a straggler still gets re-nudged.
    commandHandler({ type: 'request_rolls', player: 'GM', payload: {}, timestamp: new Date().toISOString() });
    fixture.detectChanges();
    // `triggerRollNudge()` flips the flag inside a `setTimeout(0)`.
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(component.rollPromptNudge).toBeTrue();
  });

  it('a targeted ask naming THIS player still opens/re-syncs their own pop-up normally', async () => {
    const hero = participant({
      id: 'p-hero', name: 'Hero', order: 1, ownerName: component['playerToken'],
      initiativeDice: 1, pendingRoll: true, askedToRoll: true
    });
    let commandHandler!: (c: SessionCommand) => void;
    spyOn(sync, 'onCommand').and.callFake(h => { commandHandler = h; });
    await join(stateWith([hero]));

    commandHandler({
      type: 'request_rolls', player: 'GM', payload: { participantId: 'p-hero' },
      timestamp: new Date().toISOString()
    });
    fixture.detectChanges();

    expect(component.promptRoll).toBeTrue();
  });
});

// ─── Round 4 item 2: guard against the Act declaration window double-acting
// (`briefs/mid-turn-joiner-spec.md`, "RESOLVED - validation round 4", item
// 2). ────────────────────────────────────────────────────────────────────

describe('Round 4 item 2: submitActModal() refuses a stale Act after the target has already acted elsewhere', () => {
  let component: BattleTrackerComponent;
  let fixture: ComponentFixture<BattleTrackerComponent>;
  let sync: SessionSyncService;
  let logged: SharedLogEntry[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BattleTrackerComponent],
      providers: appConfig.providers
    }).compileComponents();
    fixture = TestBed.createComponent(BattleTrackerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    CombatManager.participants.clear();
    CombatManager.currentActors.clear();
    CombatManager.nextSortOrder = 0;
    CombatManager.initiativePass = 1;
    CombatManager.combatTurn = 1;
    CombatManager.started = false;
    CombatManager.passEnded = true;
    sync = TestBed.inject(SessionSyncService);
    logged = [];
    spyOn(sync, 'broadcastState');
    spyOn(sync, 'broadcastGmState');
    spyOn(sync, 'sendCommand');
    spyOn(sync, 'appendLog').and.callFake((entry: SharedLogEntry) => { logged.push(entry); });
    component.shareRoomCode = 'ABC123';
    component.sharedLogEntries = [];
  });

  afterEach(() => {
    CombatManager.participants.clear();
    CombatManager.currentActors.clear();
  });

  function command(type: string, playerName: string, payload: Record<string, unknown> = {}) {
    component['handleSessionCommand']({ type, player: playerName, payload, timestamp: new Date().toISOString() });
  }

  it("a player's own Act, submitted on their phone while the GM's Act declaration modal for the same participant is still open, is not double-applied when the GM submits", async () => {
    const hero = new Participant();
    hero.name = 'Hero';
    hero.baseIni = 15;
    hero.setDicesWithoutRoll(1);
    CombatManager.participants.insert(hero);
    hero.diceIni = 5; // Score 20 - sole actor
    component['participantOwners'].set(hero, 'pl-hero');
    await component.btnStartRound_Click(); // real GM flow: an actually-started turn
    expect(CombatManager.currentActors.items).toEqual([hero]);
    expect(hero.status).toBe(StatusEnum.Active);

    // GM opens the Act declaration modal for Hero (still Active at this point).
    component.actModalParticipant = hero;
    component['declaredActionSelections'].set(hero, { free: 'Drop Prone', simple: [], complex: null });

    // Hero's own player taps Act first - the real player-side command path,
    // which already refuses a non-Active/Delaying target and here still
    // finds Hero Active, so it applies normally.
    command('act', 'pl-hero', { participantId: component['getParticipantId'](hero), declaredAction: 'Ready Weapon' });
    expect(hero.status).toBe(StatusEnum.Finished);
    const countAfterRealAct = logged.length; // includes "Start Combat Turn"/"Start Initiative Pass" lines too

    // The GM's now-stale modal submits on top of that.
    component.submitActModal();

    // Round 4 item 2 fix: no second Act was applied - Hero is no longer
    // Active/Delaying, so `submitActModal()` refuses the stale submission
    // exactly as the player-side `act` command already does. Not a bare
    // "toBe(1)" - `btnStartRound_Click()` itself already logged the turn/pass
    // start lines before either Act attempt.
    expect(logged.length).toBe(countAfterRealAct);
    // Round 5 item 3 fix: the window does not just silently refuse and stay
    // open for the GM to press Submit into the same refusal again - it
    // closes itself and says why.
    expect(component.actModalClosedReason).toContain('Hero');
    expect(component.actModalClosedReason).toContain('already acted');
  });

  it('regression: an ordinary Act submitted through the modal while the target is still Active applies normally', async () => {
    const hero = new Participant();
    hero.name = 'Hero';
    hero.baseIni = 15;
    hero.setDicesWithoutRoll(1);
    CombatManager.participants.insert(hero);
    hero.diceIni = 5;
    await component.btnStartRound_Click();
    expect(CombatManager.currentActors.items).toEqual([hero]);
    const countBeforeAct = logged.length;

    component.actModalParticipant = hero;
    component['declaredActionSelections'].set(hero, { free: 'Drop Prone', simple: [], complex: null });
    component.submitActModal();

    expect(hero.status).toBe(StatusEnum.Finished);
    // +2, not +1: the declared-action line itself, plus the pass-end line
    // this single participant's Act itself triggers (nobody else was left
    // to act) - not a defect of this fix, just this test's minimal setup.
    expect(logged.length).toBe(countBeforeAct + 2);
  });
});

// ─── Round 4 item 4: the superseding roll (round 3 item 5) requires having
// been asked to roll this Combat Turn, not merely "the GM rolled for this
// participant" (`briefs/mid-turn-joiner-spec.md`, "RESOLVED - validation
// round 4", item 4). ────────────────────────────────────────────────────

describe('Round 4 item 4: a superseding roll is refused for a participant who was never asked', () => {
  let component: BattleTrackerComponent;
  let fixture: ComponentFixture<BattleTrackerComponent>;
  let sync: SessionSyncService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BattleTrackerComponent],
      providers: appConfig.providers
    }).compileComponents();
    fixture = TestBed.createComponent(BattleTrackerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    CombatManager.participants.clear();
    CombatManager.currentActors.clear();
    CombatManager.nextSortOrder = 0;
    CombatManager.initiativePass = 1;
    CombatManager.combatTurn = 1;
    CombatManager.started = false;
    CombatManager.passEnded = true;
    sync = TestBed.inject(SessionSyncService);
    spyOn(sync, 'broadcastState');
    spyOn(sync, 'broadcastGmState');
    spyOn(sync, 'sendCommand');
    spyOn(sync, 'appendLog');
    component.shareRoomCode = 'ABC123';
    component.sharedLogEntries = [];
  });

  afterEach(() => {
    CombatManager.participants.clear();
    CombatManager.currentActors.clear();
  });

  function command(type: string, playerName: string, payload: Record<string, unknown> = {}) {
    component['handleSessionCommand']({ type, player: playerName, payload, timestamp: new Date().toISOString() });
  }

  it("the GM rolls with the per-row dice button for a player-owned participant who was never asked - the player's own roll does not supersede it", () => {
    const hero = new Participant();
    hero.name = 'Hero';
    hero.baseIni = 9;
    hero.setDicesWithoutRoll(3);
    CombatManager.participants.insert(hero);
    component['participantOwners'].set(hero, 'pl-hero');
    CombatManager.started = true;
    CombatManager.passEnded = false;
    const heroId = component['getParticipantId'](hero);

    // The GM rolls directly, with no "ask" of any kind first - not reachable
    // through the real pop-up flow (which only opens for an asked
    // character), but a stale/forged client could still attempt it.
    component.btnRollInitiative_Click(hero);
    expect(hero.diceIni).toBeGreaterThan(0);
    const gmTotal = hero.getCurrentInitiative();
    expect(component['participantsWithSupersedableGmRoll'].has(heroId)).toBeTrue();
    expect(component['participantsAskedThisCombatTurn'].has(heroId)).toBeFalse();

    command('roll_submission', 'pl-hero', {
      participantId: heroId, roll: 12, diceValues: [6, 6], diceSum: 12
    });

    // Refused: never asked this Combat Turn, so the GM's roll stands.
    expect(hero.getCurrentInitiative()).toBe(gmTotal);
  });

  it('regression: the same GM roll DOES get superseded once the participant has actually been asked', () => {
    const hero = new Participant();
    hero.name = 'Hero';
    hero.baseIni = 9;
    hero.setDicesWithoutRoll(3);
    CombatManager.participants.insert(hero);
    component['participantOwners'].set(hero, 'pl-hero');
    CombatManager.started = true;
    CombatManager.passEnded = false;
    const heroId = component['getParticipantId'](hero);

    component.btnAskPlayerToRoll_Click(hero);
    component.btnRollInitiative_Click(hero);
    expect(component['participantsAskedThisCombatTurn'].has(heroId)).toBeTrue();

    command('roll_submission', 'pl-hero', {
      participantId: heroId, roll: 12, diceValues: [6, 6], diceSum: 12
    });

    expect(hero.diceIni).toBe(12);
    expect(hero.getCurrentInitiative()).toBe(21); // 9 + 12
  });
});

// ─── Round 4 item 5: Initiative-costing Interrupt Actions are gated on
// having rolled this Combat Turn's Initiative Test
// (`briefs/mid-turn-joiner-spec.md`, "RESOLVED - validation round 4", item
// 5). Asserted on the actual player side (`PlayerViewComponent`), since this
// item is entirely about what a player can tap. ──────────────────────────

describe('Round 4 item 5: an unrolled participant cannot use an Initiative-costing Interrupt Action before being asked', () => {
  let gm: BattleTrackerComponent;
  let gmFixture: ComponentFixture<BattleTrackerComponent>;
  let player: PlayerViewComponent;
  let playerFixture: ComponentFixture<PlayerViewComponent>;
  let sync: SessionSyncService;
  let broadcasts: SharedCombatState[];

  function resetCombatLocal() {
    CombatManager.participants.clear();
    CombatManager.currentActors.clear();
    CombatManager.nextSortOrder = 0;
    CombatManager.initiativePass = 1;
    CombatManager.combatTurn = 1;
    CombatManager.started = false;
    CombatManager.passEnded = true;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BattleTrackerComponent, PlayerViewComponent],
      providers: appConfig.providers
    }).compileComponents();

    gmFixture = TestBed.createComponent(BattleTrackerComponent);
    gm = gmFixture.componentInstance;
    gmFixture.detectChanges();
    resetCombatLocal();

    sync = TestBed.inject(SessionSyncService);
    broadcasts = [];
    spyOn(sync, 'broadcastState').and.callFake((s: SharedCombatState) => { broadcasts.push(s); });
    spyOn(sync, 'broadcastGmState');
    spyOn(sync, 'sendCommand');
    spyOn(sync, 'connect');

    gm.shareRoomCode = 'ABC123';
    gm.sharedLogEntries = [];

    playerFixture = TestBed.createComponent(PlayerViewComponent);
    player = playerFixture.componentInstance;
    // The real roll modal must never actually open in a headless test.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const modal = (player as any).modalService as NgbModal;
    spyOn(modal, 'open').and.callFake(() => {
      let rejectFn!: (reason?: unknown) => void;
      const result = new Promise((_resolve, reject) => { rejectFn = reject; });
      result.catch(() => { /* expected: every close is a dismiss */ });
      return {
        dismiss: jasmine.createSpy('dismiss').and.callFake((reason?: unknown) => rejectFn(reason)),
        result
      } as unknown as NgbModalRef;
    });
    playerFixture.detectChanges();
  });

  afterEach(() => resetCombatLocal());

  function lastBroadcast(): SharedCombatState {
    return broadcasts[broadcasts.length - 1];
  }

  function pushLatestStateToPlayer(): void {
    player['applyIncomingState'](lastBroadcast());
    playerFixture.detectChanges();
  }

  it('a mid-fight late joiner with no request yet, and a usable screen, cannot interrupt before rolling - and can once they roll', () => {
    const a = new Participant();
    a.name = 'A';
    a.baseIni = 15;
    a.setDicesWithoutRoll(1);
    CombatManager.participants.insert(a);
    a.diceIni = 5;
    CombatManager.started = true;
    CombatManager.passEnded = false;

    const late = new Participant();
    late.name = 'Late';
    late.baseIni = 9;
    late.setDicesWithoutRoll(1);
    CombatManager.participants.insert(late); // unrolled, mid-combat, never asked
    gm['participantOwners'].set(late, 'pl-late');

    gm['syncSharedState']();
    pushLatestStateToPlayer();
    const beforeRoll = player.visibleParticipants.find(p => p.name === 'Late');
    expect(beforeRoll?.canInterrupt).toBeFalse();

    // Late now rolls (through whichever route - here the per-row GM button,
    // standing in for the pop-up's own submission).
    gm.btnRollInitiative_Click(late);
    gm['syncSharedState']();
    pushLatestStateToPlayer();
    const afterRoll = player.visibleParticipants.find(p => p.name === 'Late');
    expect(afterRoll?.canInterrupt).toBeTrue();
  });

  it('regression: ordinary defence is never modelled as a gated action and is unaffected by this change', () => {
    const late = new Participant();
    late.name = 'Late';
    late.baseIni = 9;
    late.setDicesWithoutRoll(1);
    CombatManager.participants.insert(late);
    CombatManager.started = true;
    CombatManager.passEnded = false;
    gm['participantOwners'].set(late, 'pl-late');

    gm['syncSharedState']();
    pushLatestStateToPlayer();
    const shared = player.visibleParticipants.find(p => p.name === 'Late');
    // `canInterrupt` is the only Interrupt-Action gate this item touches;
    // there is no separate "canDefend" field to gate at all (ARCHITECTURE.md
    // §5 - Defense Tests are not modelled as a gated action).
    expect(shared?.canInterrupt).toBeFalse();
    expect((shared as unknown as { canDefend?: unknown })?.canDefend).toBeUndefined();
  });
});

// ─── No Interrupt Actions before combat has started (Xavier, 2026-09-21):
// `canParticipantInterrupt()` and the `interrupt` command handler must both
// gate on `combatManager.started`, the way `act`/`delay` already do - a
// participant who rolled during Initiative Prep must not be able to spend
// that roll on Full Defence (or any other Interrupt Action) before the GM
// has actually clicked Begin Combat Turn. Driven entirely through the real
// GM flow (`btnStartRound_Click`, the real `interrupt` session command) -
// never a helper that pokes `CombatManager.started` directly. ───────────

describe('No Interrupt Actions before combat starts (Xavier, 2026-09-21)', () => {
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
    const sync = TestBed.inject(SessionSyncService);
    spyOn(sync, 'broadcastState');
    spyOn(sync, 'broadcastGmState');
    spyOn(sync, 'sendCommand');
    component.shareRoomCode = 'ABC123';
    component.sharedLogEntries = [];
  });

  afterEach(() => resetCombat());

  function command(type: string, playerName: string, payload: Record<string, unknown> = {}) {
    component['handleSessionCommand']({ type, player: playerName, payload, timestamp: new Date().toISOString() });
  }

  it('a participant who has already rolled during Initiative Prep is refused an Interrupt Action, and the advertised flag reads false, until the GM actually clicks Begin Combat Turn', async () => {
    const rolled = new Participant();
    rolled.name = 'Rolled';
    rolled.baseIni = 15;
    rolled.setDicesWithoutRoll(1);
    CombatManager.participants.insert(rolled);
    rolled.diceIni = 5; // Score 20 - has a rolled Initiative Score already
    component['participantOwners'].set(rolled, 'pl-rolled');

    // A second, unrolled participant keeps `btnStartRound_Click()` in
    // Initiative Prep rather than actually starting the Combat Turn - the
    // real GM flow for "some rolls are in, combat hasn't begun yet", not a
    // fake of `combatManager.started`.
    const unrolled = new Participant();
    unrolled.name = 'Unrolled';
    CombatManager.participants.insert(unrolled);

    await component.btnStartRound_Click();
    expect(CombatManager.started).toBeFalse(); // sanity: still prep, not a running Combat Turn

    const rolledId = component['getParticipantId'](rolled);
    const shared = component['getSharedParticipants']().find(p => p.name === 'Rolled');
    expect(shared?.canInterrupt).toBeFalse();

    command('interrupt', 'pl-rolled', { participantId: rolledId, actionKey: 'block' });

    expect(rolled.actionHistory.length).toBe(0); // refused GM-side, no Initiative spent
    expect(rolled.getCurrentInitiative()).toBe(20); // unchanged
  });

  it('regression: once combat actually starts, the same rolled participant CAN interrupt (sanity - this gate only blocks the pre-combat case)', async () => {
    const rolled = new Participant();
    rolled.name = 'Rolled';
    rolled.baseIni = 15;
    rolled.setDicesWithoutRoll(1);
    CombatManager.participants.insert(rolled);
    rolled.diceIni = 5; // Score 20
    component['participantOwners'].set(rolled, 'pl-rolled');

    await component.btnStartRound_Click(); // nobody left unrolled - combat actually starts
    expect(CombatManager.started).toBeTrue();

    const rolledId = component['getParticipantId'](rolled);
    const shared = component['getSharedParticipants']().find(p => p.name === 'Rolled');
    expect(shared?.canInterrupt).toBeTrue();

    command('interrupt', 'pl-rolled', { participantId: rolledId, actionKey: 'block' });

    expect(rolled.actionHistory.length).toBe(1);
    expect(rolled.getCurrentInitiative()).toBe(15); // 20 - 5 (Block, iniMod -5)
  });
});

// ─── Seize the Initiative: R1, R2, R3 (`briefs/seize-initiative-spec.md`,
// "RESOLVED - Xavier's rulings, 2026-09-21"). This section, and the "Seize
// the Initiative - R1: an unrolled participant cannot use a seize attempt to
// unlock an Interrupt Action" block further down (which used to be titled
// "Round 5 item 9"), replace the old `briefs/mid-turn-joiner-spec.md` "Round
// 4 item 6" / "Round 5 item 9" blocks, which asserted the seize exemption
// these rulings remove: an unrolled participant could seize and be treated
// as eligible to act/interrupt anyway. R1 makes that state unreachable
// through a fresh declaration instead, so those old assertions are rewritten
// here to assert the opposite. ─────────────────────────────────────────────

describe('Seize the Initiative - R1: requires a rolled Initiative Score', () => {
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
    const sync = TestBed.inject(SessionSyncService);
    spyOn(sync, 'broadcastState');
    spyOn(sync, 'broadcastGmState');
    spyOn(sync, 'sendCommand');
    component.shareRoomCode = 'ABC123';
    component.sharedLogEntries = [];
  });

  afterEach(() => {
    resetCombat();
  });

  function makeScored(name: string, baseIni: number, roll: number): Participant {
    const p = new Participant();
    p.name = name;
    p.baseIni = baseIni;
    p.setDicesWithoutRoll(1);
    CombatManager.participants.insert(p);
    p.diceIni = roll;
    return p;
  }

  function addParticipantViaDialog(name: string): Participant {
    component.btnAddParticipant_Click();
    expect(component.pendingAddDraft).toBeTruthy();
    component.pendingAddDraft!.name = name;
    component.commitAddDraft();
    const p = CombatManager.participants.items.find(x => x.name === name) as Participant;
    expect(p).toBeTruthy();
    return p;
  }

  function actCurrent(): void {
    const actor = CombatManager.currentActors.items[0];
    component['performAct'](actor, null);
  }

  /** Finds the row index a participant currently occupies, for scoping a
   *  per-row DOM query to the right `#participantN` container. */
  function rowIndexOf(p: Participant): number {
    return CombatManager.participants.items.indexOf(p);
  }

  /** Open a row's row menu (⋯), the way the GM reaches Seize the Initiative. */
  function openRowMenu(row: HTMLElement): void {
    (row.querySelector('[data-testid="row-menu-btn"]') as HTMLButtonElement).click();
    fixture.detectChanges();
  }

  it('the Seize control (button) is not rendered for a participant who has not rolled this Combat Turn', () => {
    const rolled = makeScored('Rolled', 7, 5);
    component.btnStartRound_Click();
    const unrolled = addParticipantViaDialog('Unrolled'); // diceIni stays 0
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector(`#participant${rowIndexOf(unrolled)}`);
    expect(row).toBeTruthy();
    openRowMenu(row); // Seize lives in the row menu (GM screen overhaul 08, #11)
    expect(row.querySelector('.dropdown-menu.show [data-testid="seize-initiative-btn"]')).toBeNull();
    void rolled;
  });

  it('the Seize control (button) IS rendered once that same participant has rolled', () => {
    const rolled = makeScored('Rolled', 7, 5);
    component.btnStartRound_Click();
    const late = addParticipantViaDialog('Late');
    component.btnRollInitiative_Click(late); // the real per-row GM dice button
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector(`#participant${rowIndexOf(late)}`);
    openRowMenu(row);
    expect(row.querySelector('.dropdown-menu.show [data-testid="seize-initiative-btn"]')).not.toBeNull();
    void rolled;
  });

  it('CombatManager.seizeInitiative() (the engine-level backstop) is a no-op for a participant with no rolled Initiative Score this Combat Turn', () => {
    // Direct engine call, bypassing the GM button entirely, so this proves
    // the rule holds even for a caller that never goes through
    // `btnEdge_Click`/the hidden button - fails without the fix, since the
    // pre-fix `seizeInitiative()` unconditionally set `p.edge = true`.
    const p = new Participant();
    p.name = 'Unrolled';
    p.baseIni = 10;
    p.setDicesWithoutRoll(1);
    CombatManager.participants.insert(p);
    expect(p.diceIni).toBe(0);

    CombatManager.seizeInitiative(p);

    expect(p.edge).toBeFalse();
  });

  it('btnEdge_Click on an unrolled participant leaves them unseized, and getNextActors() still skips them for having no roll', () => {
    const rolled = makeScored('Rolled', 7, 5); // Score 12 - would ordinarily win
    component.btnStartRound_Click();
    expect(CombatManager.currentActors.items).toEqual([rolled]);

    const unrolled = addParticipantViaDialog('Unrolled'); // diceIni stays 0
    unrolled.baseIni = 6;
    component.btnEdge_Click(unrolled); // the real GM seize control, on the hidden case
    expect(unrolled.edge).toBeFalse();

    actCurrent(); // Rolled's Act advances the order for real

    // Without R1, Unrolled would now lead (the old round-4-item-6 exemption).
    // With R1, Unrolled is still skipped by `canParticipantActThisPass()` for
    // having no roll, exactly like any other unrolled participant.
    expect(CombatManager.currentActors.count).toBe(0);
  });

  it('a rolled participant whose Score has since decayed to 0 can still seize (R1 only tests "has rolled", not Score magnitude), but seizing grants no action while current initiative is not positive', () => {
    const rolled = makeScored('Rolled', 20, 1); // Score 21 - stays positive
    component.btnStartRound_Click();
    expect(CombatManager.currentActors.items).toEqual([rolled]);

    const seized = makeScored('Seized', 4, 6); // rolled, Score 10
    CombatManager.nextIniPass(); // decays every running Score by 10 (Rolled -> 11, Seized -> 0)
    expect(seized.diceIni).toBeGreaterThan(0); // still counts as rolled
    expect(seized.getCurrentInitiative()).toBe(0);

    CombatManager.seizeInitiative(seized);
    expect(seized.edge).toBeTrue(); // R1 is satisfied - they rolled

    CombatManager.getNextActors();

    // `canParticipantActThisPass()` still requires current initiative > 0
    // (Core p. 159) - seizing changes rank only (R3), never this floor.
    expect(CombatManager.currentActors.items).not.toContain(seized);
  });
});

describe('Seize the Initiative - R2: timing is unrestricted once rolled, and Seize stays an Edge Effect', () => {
  let component: BattleTrackerComponent;
  let fixture: ComponentFixture<BattleTrackerComponent>;
  let broadcasts: SharedCombatState[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BattleTrackerComponent],
      providers: appConfig.providers
    }).compileComponents();
    fixture = TestBed.createComponent(BattleTrackerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    resetCombat();
    const sync = TestBed.inject(SessionSyncService);
    broadcasts = [];
    // `.and.callFake` (not a bare `spyOn`) so the two round-6 defect-1/4b
    // tests below can inspect what actually went out on the wire, not just
    // that the call happened.
    spyOn(sync, 'broadcastState').and.callFake((s: SharedCombatState) => { broadcasts.push(s); });
    spyOn(sync, 'broadcastGmState');
    spyOn(sync, 'sendCommand');
    component.shareRoomCode = 'ABC123';
    component.sharedLogEntries = [];
    // `btnEdge_Click()` now opens a confirmation dialog before seizing
    // (Xavier, 2026-09-21) - auto-confirm here so these pre-existing R2
    // scenario tests still exercise the real handler end to end. Cancel
    // behaviour has its own dedicated tests below.
    const dialog = TestBed.inject(ConfirmationDialogService);
    spyOn(dialog, 'confirm').and.resolveTo(true);
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

  /** Finds the row index a participant currently occupies, for scoping a
   *  per-row DOM query to the right `#participantN` container. */
  function rowIndexOf(p: Participant): number {
    return CombatManager.participants.items.indexOf(p);
  }

  /** Open a row's row menu (⋯), the way the GM reaches Seize the Initiative. */
  function openRowMenu(row: HTMLElement): void {
    (row.querySelector('[data-testid="row-menu-btn"]') as HTMLButtonElement).click();
    fixture.detectChanges();
  }

  it('a rolled participant can seize mid-pass, well outside their own Action Phase - not only between passes or above some Score threshold', async () => {
    // Before 2026-09-21 the Seize button's own template condition also
    // required `combatManager.passEnded && p.getCurrentInitiative() > 10` -
    // a restriction this brief found already in the tree and removed as
    // part of R2. This participant is mid-pass (`passEnded` false) and at a
    // Score well under 10, both of which the old condition would have
    // refused.
    const a = makeScored('A', 4, 3); // Score 7
    const b = makeScored('B', 4, 2); // Score 6
    component.btnStartRound_Click();
    expect(CombatManager.passEnded).toBeFalse();
    expect(b.getCurrentInitiative()).toBeLessThan(10);

    component.btnEdge_Click(b);
    await fixture.whenStable(); // let the (auto-confirmed) dialog promise settle

    expect(b.edge).toBeTrue();
    void a;
  });

  /**
   * Round-6 validator defect 4(a): the R2 mid-pass test above only ever
   * proved `p.edge` became `true` - the pre-fix handler had no guard at all,
   * so that same assertion passed before R1/R2 existed too. This is the
   * companion the brief asked for: the Seize control itself actually renders
   * for a participant mid-pass, at a Score under 10, where the old
   * `passEnded && Score > 10` template condition (removed as part of R2)
   * would have hidden it.
   */
  it('the Seize control (button) renders mid-pass for a participant at a Score under 10 (round-6 defect 4a)', () => {
    const a = makeScored('A', 4, 3); // Score 7
    const b = makeScored('B', 4, 2); // Score 6
    component.btnStartRound_Click();
    expect(CombatManager.passEnded).toBeFalse();
    expect(b.getCurrentInitiative()).toBeLessThan(10);
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector(`#participant${rowIndexOf(b)}`);
    expect(row).toBeTruthy();
    openRowMenu(row);
    expect(row.querySelector('.dropdown-menu.show [data-testid="seize-initiative-btn"]')).not.toBeNull();
    void a;
  });

  /**
   * Round-6 validator defect 4(b) - "this is what would have caught Defect
   * 1". Drives the real GM flow into a running Combat Turn
   * (`btnStartRound_Click`, never a helper that fakes `combatManager.started`)
   * and taps the real `btnEdge_Click` handler, then asserts the seizer leads
   * both the displayed order and the very next broadcast.
   *
   * Fails without the Defect 1 fix: the pre-fix `btnEdge_Click` only set
   * `sender.edge` and returned - it never called `sort()`, so neither
   * `CombatManager.participants.items` nor any broadcast moved. `High` (Score
   * 22, no seize) would still lead `CombatManager.participants.items[0]`, and
   * `broadcasts` would stay exactly as it was before the tap (length
   * unchanged from the pre-tap baseline) rather than gaining a fresh entry
   * with the seizer first.
   */
  it('tapping Seize re-sorts the order and broadcasts immediately - the seizer leads both the displayed order and the broadcast (round-6 defect 1 / 4b)', async () => {
    const high = makeScored('High', 20, 2); // Score 22 - would ordinarily act first
    const seizer = makeScored('Seizer', 4, 2); // Score 6 - would ordinarily act last
    component.btnStartRound_Click();
    expect(CombatManager.participants.items[0]).toBe(high); // sanity: High leads before any seize
    broadcasts.length = 0; // isolate the broadcast the tap itself causes

    component.btnEdge_Click(seizer);
    await fixture.whenStable(); // let the (auto-confirmed) dialog promise settle

    expect(seizer.edge).toBeTrue();
    // Displayed order: the seizer's row is now first (Core p. 160,
    // "regardless of your Initiative Score").
    expect(CombatManager.participants.items[0]).toBe(seizer);
    // Broadcast: the tap itself pushed a fresh state, and that state's own
    // participant order already carries the seizer first - not merely
    // eventually, on some later unrelated action.
    expect(broadcasts.length).toBeGreaterThan(0);
    const latest = broadcasts[broadcasts.length - 1];
    expect(latest.participants[0]?.name).toBe('Seizer');
  });

  it('seizing never costs Initiative Score and never appends to actionHistory (an Edge Effect, not an Interrupt Action, Core p. 167)', async () => {
    const a = makeScored('A', 4, 3); // Score 7
    component.btnStartRound_Click();
    const scoreBefore = a.getCurrentInitiative();

    component.btnEdge_Click(a);
    await fixture.whenStable();

    expect(a.edge).toBeTrue(); // sanity: the (auto-confirmed) seize actually landed
    expect(a.getCurrentInitiative()).toBe(scoreBefore); // unchanged - no Ini cost
    expect(a.actionHistory.length).toBe(0); // not recorded as an Interrupt Action
  });
});

// ─── Confirm step before seizing (Xavier, 2026-09-21): a tap on the Seize
// Initiative control now opens a confirmation naming the participant before
// spending their point of Edge (Core p. 56). Cancelling must leave no trace
// at all - no Edge spent, no flag set, no log line, no re-sort, no
// broadcast - and confirming must still perform the exact same seize as
// before the dialog existed. ────────────────────────────────────────────

describe('Confirm step before seizing (Xavier, 2026-09-21)', () => {
  let component: BattleTrackerComponent;
  let fixture: ComponentFixture<BattleTrackerComponent>;
  let broadcasts: SharedCombatState[];
  let logged: SharedLogEntry[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BattleTrackerComponent],
      providers: appConfig.providers
    }).compileComponents();
    fixture = TestBed.createComponent(BattleTrackerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    resetCombat();
    const sync = TestBed.inject(SessionSyncService);
    broadcasts = [];
    logged = [];
    spyOn(sync, 'broadcastState').and.callFake((s: SharedCombatState) => { broadcasts.push(s); });
    spyOn(sync, 'broadcastGmState');
    spyOn(sync, 'sendCommand');
    spyOn(sync, 'appendLog').and.callFake((entry: SharedLogEntry) => { logged.push(entry); });
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

  it('cancelling the confirmation leaves no trace: no Edge spent, no flag set, no log line, no re-sort, no broadcast', async () => {
    const high = makeScored('High', 20, 2); // Score 22 - would ordinarily act first
    const seizer = makeScored('Seizer', 4, 2); // Score 6 - would ordinarily act last
    component.btnStartRound_Click();
    const orderBefore = [...CombatManager.participants.items];
    broadcasts.length = 0; // isolate whatever the tap itself causes
    logged.length = 0;

    const dialog = TestBed.inject(ConfirmationDialogService);
    const confirmSpy = spyOn(dialog, 'confirm').and.resolveTo(false); // GM cancels

    component.btnEdge_Click(seizer);
    await fixture.whenStable(); // let the (cancelled) dialog promise settle

    expect(confirmSpy).toHaveBeenCalled();
    // The dialog names the participant, per the brief.
    expect(confirmSpy.calls.mostRecent().args[0]).toContain('Seizer');
    expect(seizer.edge).toBeFalse(); // no Edge spent
    expect(CombatManager.participants.items).toEqual(orderBefore); // no re-sort
    expect(broadcasts.length).toBe(0); // no broadcast
    expect(logged.length).toBe(0); // no log line
    void high;
  });

  it('confirming performs the exact same seize as before the dialog existed: Edge spent, log line, re-sort, broadcast', async () => {
    const high = makeScored('High', 20, 2); // Score 22 - would ordinarily act first
    const seizer = makeScored('Seizer', 4, 2); // Score 6 - would ordinarily act last
    component.btnStartRound_Click();
    expect(CombatManager.participants.items[0]).toBe(high); // sanity: High leads before any seize
    broadcasts.length = 0;
    logged.length = 0;

    const dialog = TestBed.inject(ConfirmationDialogService);
    const confirmSpy = spyOn(dialog, 'confirm').and.resolveTo(true); // GM confirms

    component.btnEdge_Click(seizer);
    await fixture.whenStable();

    expect(confirmSpy).toHaveBeenCalled();
    expect(seizer.edge).toBeTrue(); // Edge spent
    expect(CombatManager.participants.items[0]).toBe(seizer); // re-sorted, seizer leads
    expect(broadcasts.length).toBeGreaterThan(0); // broadcast
    expect(broadcasts[broadcasts.length - 1].participants[0]?.name).toBe('Seizer');
    expect(logged.length).toBeGreaterThan(0); // log line
    expect(logged[logged.length - 1].actor).toBe('Seizer');
    expect(logged[logged.length - 1].text.toLowerCase()).toContain('seiz');
  });
});

describe('Round 6 defects 2 and 3: the header Initiative number and the shared-log line for a seize', () => {
  let component: BattleTrackerComponent;
  let fixture: ComponentFixture<BattleTrackerComponent>;
  let broadcasts: SharedCombatState[];
  let logged: SharedLogEntry[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BattleTrackerComponent],
      providers: appConfig.providers
    }).compileComponents();
    fixture = TestBed.createComponent(BattleTrackerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    resetCombat();
    const sync = TestBed.inject(SessionSyncService);
    broadcasts = [];
    logged = [];
    spyOn(sync, 'broadcastState').and.callFake((s: SharedCombatState) => { broadcasts.push(s); });
    spyOn(sync, 'broadcastGmState');
    spyOn(sync, 'sendCommand');
    spyOn(sync, 'appendLog').and.callFake((entry: SharedLogEntry) => { logged.push(entry); });
    component.shareRoomCode = 'ABC123';
    component.sharedLogEntries = [];
    // Auto-confirm the Seize dialog (Xavier, 2026-09-21) so these
    // pre-existing round-6 scenario tests still exercise the real handler.
    const dialog = TestBed.inject(ConfirmationDialogService);
    spyOn(dialog, 'confirm').and.resolveTo(true);
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

  /**
   * Round-6 validator defect 2: the header "Initiative" figure must be the
   * Score of whoever is actually acting, never merely the highest Score
   * among everyone still eligible this pass. A seizer at a low Score leading
   * past a much higher-Score non-seizer who is still `Waiting` (Core p. 160,
   * "regardless of your Initiative Score") is the one case R2 makes routine
   * rather than a corner case.
   *
   * Three participants, because reproducing the bug needs a bystander who is
   * still eligible (`Waiting`) *at the moment `currentActors` picks the
   * seizer* - not merely someone who has already finished and dropped out of
   * the eligible pool (which would make `currentInitiative` coincidentally
   * correct even under the bug): `Actor` goes first and acts, `Bystander`
   * (Score 22) stays `Waiting` throughout, and `Seizer` (Score 6) seizes
   * mid-`Actor`'s turn - a real GM sequence (`btnStartRound_Click`,
   * `btnEdge_Click`, then the real Act flow), never a helper that pokes
   * `currentActors`/`currentInitiative` by hand.
   *
   * Fails without the fix: the pre-fix `getNextActors()` set
   * `currentInitiative` to the highest `effIni` it saw among *every* eligible
   * participant, independently of who ended up in `currentActors` - so once
   * `Actor` finishes and `Seizer` (edge) wins the group over `Bystander`
   * (higher Score, no edge), this would read 22 (`Bystander`'s Score) rather
   * than 6 (`Seizer`'s), on `CombatManager.currentInitiative` itself, in the
   * broadcast, and in the GM header text.
   */
  it('the header Initiative figure matches the seizer\'s own Score, not a higher-Score bystander\'s (round-6 defect 2)', async () => {
    const actor = makeScored('Actor', 25, 1); // Score 26 - leads first
    const bystander = makeScored('Bystander', 20, 2); // Score 22 - stays Waiting throughout
    const seizer = makeScored('Seizer', 4, 2); // Score 6
    component.btnStartRound_Click();
    expect(CombatManager.currentActors.items).toEqual([actor]);

    component.btnEdge_Click(seizer); // seize mid-Actor's turn (R2)
    await fixture.whenStable(); // let the (auto-confirmed) dialog promise settle
    expect(seizer.edge).toBeTrue();

    component['performAct'](actor, null); // Actor's turn ends for real; advances the order
    fixture.detectChanges();

    expect(CombatManager.currentActors.items).toEqual([seizer]); // edge wins over Bystander's higher Score
    expect(CombatManager.currentInitiative).toBe(6); // the seizer's own Score, not Bystander's 22
    const latest = broadcasts[broadcasts.length - 1];
    expect(latest.currentInitiative).toBe(6);
    // The round status now sits in the top bar (GM screen overhaul 12, #15).
    const status = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="top-bar-status"]');
    const statusText = (status?.textContent || '').replace(/\s+/g, ' ');
    expect(statusText).toContain('Ini 6');
    expect(statusText).not.toContain('Ini 22');
    void bystander;
  });

  /**
   * Round-6 validator defect 3: seizing is a dramatic, Edge-costing moment
   * (Core p. 160, "Initiative and Edge"; one point of Edge, Core p. 56) and
   * must write a shared-log line naming the character, phrased like the
   * other participant-attributed Action Log lines - not left silent, and not
   * a bare internal label like the pre-fix `"<Name> Edge_Click"`.
   *
   * Fails without the fix: the pre-fix `btnEdge_Click` never called
   * `appendSharedLog`/`appendParticipantEventLog` at all, so `logged` stays
   * empty.
   */
  it('a successful seize writes a shared-log line naming the character (round-6 defect 3)', async () => {
    const seizer = makeScored('Seizer', 4, 2); // Score 6
    component.btnStartRound_Click();

    component.btnEdge_Click(seizer);
    await fixture.whenStable(); // let the (auto-confirmed) dialog promise settle

    expect(logged.length).toBeGreaterThan(0);
    const entry = logged[logged.length - 1];
    expect(entry.actor).toBe('Seizer');
    expect(entry.text.toLowerCase()).toContain('seiz');
    expect(entry.text).not.toContain('Edge_Click'); // no longer a bare internal label
  });
});

describe('Seize the Initiative - R3: a seizer\'s own Score decays and gates exactly like anyone else\'s', () => {
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
    const sync = TestBed.inject(SessionSyncService);
    spyOn(sync, 'broadcastState');
    spyOn(sync, 'broadcastGmState');
    spyOn(sync, 'sendCommand');
    component.shareRoomCode = 'ABC123';
    component.sharedLogEntries = [];
    // Auto-confirm the Seize dialog (Xavier, 2026-09-21) so these
    // pre-existing R3 scenario tests still exercise the real handler.
    const dialog = TestBed.inject(ConfirmationDialogService);
    spyOn(dialog, 'confirm').and.resolveTo(true);
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

  function actCurrent(): void {
    const actor = CombatManager.currentActors.items[0];
    component['performAct'](actor, null);
  }

  /**
   * Gameplay scenario 1 (`briefs/seize-initiative-spec.md`, "Gameplay
   * scenarios to survive"): a participant with Score 14 seizes in pass 1.
   * They lead pass 1; lead pass 2 at Score 4; in pass 3 their Score is -6, so
   * they get only a Free Action, but their rank (`p.edge`) is unaffected -
   * seizing changes rank only, never the seizer's own Score or eligibility
   * threshold (R3).
   */
  it('a seizer\'s Score still drops 10 every pass, exactly like a non-seizer\'s', async () => {
    const seizer = makeScored('Seizer', 9, 5); // Score 14
    const other = makeScored('Other', 20, 1); // Score 21 - stays positive throughout
    component.btnStartRound_Click();
    component.btnEdge_Click(seizer);
    await fixture.whenStable(); // let the (auto-confirmed) dialog promise settle
    expect(seizer.edge).toBeTrue();
    expect(seizer.getCurrentInitiative()).toBe(14);

    CombatManager.nextIniPass();
    expect(seizer.getCurrentInitiative()).toBe(4); // -10, identical to any other participant

    CombatManager.nextIniPass();
    expect(seizer.getCurrentInitiative()).toBe(-6); // -10 again - no floor (RULINGS.md 2026-07-31)
    void other;
  });

  it('a seizer at 0 or below may take a Free Action and may still defend, but no Simple or Complex action - identical to a non-seizer at 0 or below (RULINGS.md 2026-08-07)', async () => {
    const seizer = makeScored('Seizer', 4, 6); // rolled, Score 10
    component.btnStartRound_Click();
    component.btnEdge_Click(seizer);
    await fixture.whenStable(); // let the (auto-confirmed) dialog promise settle
    expect(seizer.edge).toBeTrue();

    CombatManager.nextIniPass(); // decays the running Score by 10 -> 0
    expect(seizer.getCurrentInitiative()).toBe(0);

    // Rank (the seize flag) is unaffected by Score reaching 0 - seizing
    // changes rank only (R3).
    expect(seizer.edge).toBeTrue();
    expect(component.hasLiveActionPhase(seizer)).toBeFalse(); // no Simple/Complex
    void actCurrent;
  });

  it('two seizers are ordered among themselves by their own Scores, highest first, with the ordinary ERIC tie-break for a tie', async () => {
    const lowSeizer = makeScored('LowSeizer', 4, 1); // Score 5
    const highSeizer = makeScored('HighSeizer', 9, 5); // Score 14
    component.btnStartRound_Click(); // picks HighSeizer as the (pre-seize) current actor - Active
    // Reset both back to Waiting before seizing: this test is about the
    // ordering computation itself, not about who Start Round happened to
    // pick first before either had seized.
    lowSeizer.status = StatusEnum.Waiting;
    highSeizer.status = StatusEnum.Waiting;
    component.btnEdge_Click(lowSeizer);
    component.btnEdge_Click(highSeizer);
    await fixture.whenStable(); // let both (auto-confirmed) dialog promises settle
    expect(lowSeizer.edge).toBeTrue();
    expect(highSeizer.edge).toBeTrue();

    CombatManager.getNextActors();

    expect(CombatManager.currentActors.items).toEqual([highSeizer]);
  });

  it('the seized flag clears at the Combat Turn boundary and the participant returns to ordinary order', async () => {
    const seizer = makeScored('Seizer', 20, 5); // Score 25 - stays positive after one pass
    component.btnStartRound_Click();
    component.btnEdge_Click(seizer);
    await fixture.whenStable(); // let the (auto-confirmed) dialog promise settle
    expect(seizer.edge).toBeTrue();

    CombatManager.endCombatTurn(); // softReset() on every participant

    expect(seizer.edge).toBeFalse();
    expect(seizer.diceIni).toBe(0); // fresh Initiative Test owed next Combat Turn
  });

  it('an unrolled, edge=true participant (the narrow type-mismatch carry case, never a fresh seize) no longer holds the Combat Turn open on its bare attribute', () => {
    // Simulates the one documented exception (`battle-tracker.component.ts`,
    // the round-5-item-5 re-registration carry) where `p.edge` can be true on
    // an unrolled object - never reachable through a fresh
    // `seizeInitiative()` call. Nobody else is present, so the ONLY thing
    // that could keep `isOver()` false here is this participant's own bare
    // (unrolled) attribute plus `p.edge`.
    //
    // Fails without the fix: the pre-fix `hasRolledOrSeized()` read `p.edge`
    // as sufficient on its own, regardless of `diceIni`, so `isOver()` would
    // have returned `false` (Combat Turn held open) here. After the fix,
    // `hasRolledThisTurn()` ignores `p.edge` entirely, so an unrolled
    // participant can never hold the turn open, seized or not.
    const carriedSeize = new Participant();
    carriedSeize.name = 'CarriedSeize';
    carriedSeize.baseIni = 8; // current initiative 8, well above 0
    carriedSeize.setDicesWithoutRoll(1);
    CombatManager.participants.insert(carriedSeize);
    carriedSeize.edge = true; // simulates the carry, bypassing the R1 guard
    expect(carriedSeize.diceIni).toBe(0);
    expect(carriedSeize.getCurrentInitiative()).toBeGreaterThan(0);

    expect(CombatManager.isOver()).toBeTrue();
  });
});

// ─── Round 4 item 7: "nobody can act" - the GM screen must say so plainly
// when every remaining participant still owes a roll
// (`briefs/mid-turn-joiner-spec.md`, "RESOLVED - validation round 4", item
// 7). ────────────────────────────────────────────────────────────────────

describe('Round 4 item 7: "nobody can act" notice', () => {
  // Round 5 item 8 fix: these tests used to set `CombatManager.started`/
  // `passEnded` by hand and poke `getNextActors()` on an encounter that never
  // actually went through Start Round. Rewritten to drive
  // `btnStartRound_Click`, the real "+ Participant" dialog and a real Act to
  // reach the deadlock for real - only the mid-deadlock recompute itself
  // (nothing left to Act on to trigger it) still calls `CombatManager
  // .getNextActors()` directly, the same recompute `advanceToNextActors()`
  // makes internally.
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
    const sync = TestBed.inject(SessionSyncService);
    spyOn(sync, 'broadcastState');
    spyOn(sync, 'broadcastGmState');
    spyOn(sync, 'sendCommand');
    component.shareRoomCode = 'ABC123';
    component.sharedLogEntries = [];
  });

  afterEach(() => {
    resetCombat();
  });

  function makeScored(name: string, baseIni: number, roll: number): Participant {
    const p = new Participant();
    p.name = name;
    p.baseIni = baseIni;
    p.setDicesWithoutRoll(1);
    CombatManager.participants.insert(p);
    p.diceIni = roll;
    return p;
  }

  function addParticipantViaDialog(name: string): Participant {
    component.btnAddParticipant_Click();
    expect(component.pendingAddDraft).toBeTruthy();
    component.pendingAddDraft!.name = name;
    component.commitAddDraft();
    const p = CombatManager.participants.items.find(x => x.name === name) as Participant;
    expect(p).toBeTruthy();
    return p;
  }

  function actCurrent(): void {
    const actor = CombatManager.currentActors.items[0];
    component['performAct'](actor, null);
  }

  it('fires when the only remaining participant this pass is unrolled, and names them', () => {
    // A realistic small Initiative rating (Reaction 3 + Intuition 1 = 4, +3
    // on the roll) so Rolled keeps a genuinely positive Score after acting -
    // item 10 means the Combat Turn only stays open because Rolled's Score
    // is still above 0, not because Late's bare attribute is.
    const rolled = makeScored('Rolled', 4, 3); // Score 7
    component.btnStartRound_Click();
    expect(CombatManager.currentActors.items).toEqual([rolled]);

    // A late joiner, added mid-combat via the real "+ Participant" dialog -
    // present but never rolled (`diceIni` stays 0), the deadlock case.
    const late = addParticipantViaDialog('Late');
    late.baseIni = 8;

    actCurrent(); // Rolled acts for real -> advanceToNextActors() -> Late is
    // the only Waiting participant left, and fails the roll gate.

    expect(CombatManager.currentActors.count).toBe(0);
    const notice = component.nobodyCanActRollNotice();
    expect(notice).toContain('Late');
  });

  it('does not fire once the blocked participant rolls', () => {
    const rolled = makeScored('Rolled', 4, 3);
    component.btnStartRound_Click();
    const late = addParticipantViaDialog('Late');
    late.baseIni = 8;
    actCurrent();
    expect(component.nobodyCanActRollNotice()).toContain('Late');

    component.btnRollInitiative_Click(late); // the real per-row GM dice button
    CombatManager.getNextActors();

    expect(component.nobodyCanActRollNotice()).toBeNull();
    expect(CombatManager.currentActors.items).toEqual([late]);
    void rolled;
  });

  it('regression: does not fire for an ordinary empty currentActors with nobody blocked (e.g. combat not started, or everyone finished with no one unrolled)', () => {
    expect(component.nobodyCanActRollNotice()).toBeNull(); // combat not started

    const a = makeScored('A', 4, 1); // Score 5
    component.btnStartRound_Click();
    expect(CombatManager.currentActors.items).toEqual([a]);
    expect(component.nobodyCanActRollNotice()).toBeNull(); // someone CAN act
  });
});

// ─── Round 5 item 1: the `interrupt` command handler enforces what
// `canInterrupt` advertises, on receipt, the same way `act`/`delay` already
// check status (`briefs/mid-turn-joiner-spec.md`, "RESOLVED - validation
// round 5", item 1). ─────────────────────────────────────────────────────

describe('Round 5 item 1: the interrupt command handler rejects an unrolled, unseized participant GM-side', () => {
  let component: BattleTrackerComponent;
  let fixture: ComponentFixture<BattleTrackerComponent>;
  let logged: SharedLogEntry[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BattleTrackerComponent],
      providers: appConfig.providers
    }).compileComponents();
    fixture = TestBed.createComponent(BattleTrackerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    resetCombat();
    const sync = TestBed.inject(SessionSyncService);
    logged = [];
    spyOn(sync, 'broadcastState');
    spyOn(sync, 'broadcastGmState');
    spyOn(sync, 'sendCommand');
    spyOn(sync, 'appendLog').and.callFake((entry: SharedLogEntry) => { logged.push(entry); });
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

  function addParticipantViaDialog(name: string): Participant {
    component.btnAddParticipant_Click();
    expect(component.pendingAddDraft).toBeTruthy();
    component.pendingAddDraft!.name = name;
    component.commitAddDraft();
    return CombatManager.participants.items.find(x => x.name === name) as Participant;
  }

  function command(type: string, playerName: string, payload: Record<string, unknown> = {}) {
    component['handleSessionCommand']({ type, player: playerName, payload, timestamp: new Date().toISOString() });
  }

  it("a stale or double-tapped phone's interrupt command is rejected for a participant who has not rolled this Combat Turn", () => {
    const a = makeScored('A', 4, 3); // Score 7, keeps the turn running
    component.btnStartRound_Click();
    expect(CombatManager.currentActors.items).toEqual([a]);

    // A late joiner, added mid-combat, player-owned, never rolled.
    const late = addParticipantViaDialog('Late');
    late.baseIni = 6;
    component['participantOwners'].set(late, 'pl-late');
    const lateId = component['getParticipantId'](late);
    const scoreBefore = late.getCurrentInitiative();

    command('interrupt', 'pl-late', { participantId: lateId, actionKey: 'block' });

    // Rejected: no Initiative spent, and no Interrupt Action recorded.
    expect(late.getCurrentInitiative()).toBe(scoreBefore);
    expect(late.actionHistory.length).toBe(0);
    // No new "used ... block" style log line was appended for the refusal.
    expect(logged.some(e => e.text.toLowerCase().includes('block'))).toBeFalse();

    // Once Late actually rolls, the identical command succeeds.
    component.btnRollInitiative_Click(late);
    const scoreAfterRoll = late.getCurrentInitiative();
    command('interrupt', 'pl-late', { participantId: lateId, actionKey: 'block' });
    expect(late.actionHistory.length).toBe(1);
    expect(late.getCurrentInitiative()).toBe(scoreAfterRoll - 5); // Block, iniMod -5
  });
});

// ─── Seize the Initiative - R1: the interrupt gate's seize exemption is
// removed, the same way the acting gate's was above (`briefs/seize-initiative
// -spec.md`, "RESOLVED - Xavier's rulings, 2026-09-21", "What this removes").
// This replaces the old "Round 5 item 9" block (`briefs/mid-turn-joiner-spec.md`),
// which asserted the exemption this ruling removes: a seized-but-unrolled
// participant could spend Initiative on an Interrupt Action. R1 makes that
// state unreachable through a fresh seize declaration, so `canInterrupt`
// still refuses an unrolled, unseized participant - unchanged - and now also
// refuses an unrolled participant even after a (no-op) seize attempt,
// because seizing never took effect. ──────────────────────────────────────

describe('Seize the Initiative - R1: an unrolled participant cannot use a seize attempt to unlock an Interrupt Action', () => {
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
    const sync = TestBed.inject(SessionSyncService);
    spyOn(sync, 'broadcastState');
    spyOn(sync, 'broadcastGmState');
    spyOn(sync, 'sendCommand');
    spyOn(sync, 'appendLog');
    component.shareRoomCode = 'ABC123';
    component.sharedLogEntries = [];
    // Auto-confirm the Seize dialog (Xavier, 2026-09-21) so these
    // pre-existing R1 scenario tests still exercise the real handler.
    const dialog = TestBed.inject(ConfirmationDialogService);
    spyOn(dialog, 'confirm').and.resolveTo(true);
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

  function addParticipantViaDialog(name: string): Participant {
    component.btnAddParticipant_Click();
    expect(component.pendingAddDraft).toBeTruthy();
    component.pendingAddDraft!.name = name;
    component.commitAddDraft();
    return CombatManager.participants.items.find(x => x.name === name) as Participant;
  }

  function command(type: string, playerName: string, payload: Record<string, unknown> = {}) {
    component['handleSessionCommand']({ type, player: playerName, payload, timestamp: new Date().toISOString() });
  }

  it('an unrolled participant is refused an Interrupt Action both before AND after a Seize Initiative attempt, because R1 makes the seize itself a no-op', async () => {
    // Fails without the fix: before 2026-09-21, `btnEdge_Click(late)` here
    // would have set `late.edge = true` unconditionally, and
    // `canParticipantInterrupt()`'s old `|| p.edge` exemption would then have
    // let the second `interrupt` command through - exactly the old "Round 5
    // item 9" test this replaces asserted as correct.
    const a = makeScored('A', 4, 3); // Score 7
    component.btnStartRound_Click();

    const late = addParticipantViaDialog('Late');
    late.baseIni = 10; // Score 10, never rolled
    component['participantOwners'].set(late, 'pl-late');
    const lateId = component['getParticipantId'](late);

    // Not yet seized: the interrupt is refused (round 5 item 1/round 4 item 5).
    command('interrupt', 'pl-late', { participantId: lateId, actionKey: 'block' });
    expect(late.actionHistory.length).toBe(0);

    // The GM attempts to seize the Initiative for Late (the real GM
    // control) - R1 refuses, since Late has not rolled this Combat Turn.
    component.btnEdge_Click(late);
    await fixture.whenStable(); // let the (auto-confirmed) dialog promise settle
    expect(late.edge).toBeFalse();

    command('interrupt', 'pl-late', { participantId: lateId, actionKey: 'block' });

    // Still refused: no Initiative spent, no Interrupt Action recorded.
    expect(late.actionHistory.length).toBe(0);
    expect(late.getCurrentInitiative()).toBe(10);
    void a;
  });

  it('once Late actually rolls, the identical seize-then-interrupt sequence succeeds (sanity: R1 blocks only the unrolled case)', async () => {
    const a = makeScored('A', 4, 3); // Score 7
    component.btnStartRound_Click();

    const late = addParticipantViaDialog('Late');
    late.baseIni = 10;
    component['participantOwners'].set(late, 'pl-late');
    const lateId = component['getParticipantId'](late);

    component.btnRollInitiative_Click(late); // the real per-row GM dice button
    component.btnEdge_Click(late);
    await fixture.whenStable(); // let the (auto-confirmed) dialog promise settle
    expect(late.edge).toBeTrue();
    const scoreAfterSeize = late.getCurrentInitiative();

    command('interrupt', 'pl-late', { participantId: lateId, actionKey: 'block' });

    expect(late.actionHistory.length).toBe(1);
    expect(late.getCurrentInitiative()).toBe(scoreAfterSeize - 5); // Block, iniMod -5
    void a;
  });
});

// ─── Round 5 item 4: the superseding-roll precondition's second half - a
// duplicate or delayed player submission must not overwrite a GM's later,
// deliberate re-roll (`briefs/mid-turn-joiner-spec.md`, "RESOLVED -
// validation round 5", item 4). ──────────────────────────────────────────

describe('Round 5 item 4: a duplicate/delayed player submission cannot overwrite a later, deliberate GM re-roll', () => {
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
    const sync = TestBed.inject(SessionSyncService);
    spyOn(sync, 'broadcastState');
    spyOn(sync, 'broadcastGmState');
    spyOn(sync, 'sendCommand');
    spyOn(sync, 'appendLog');
    component.shareRoomCode = 'ABC123';
    component.sharedLogEntries = [];
  });

  afterEach(() => resetCombat());

  function command(type: string, playerName: string, payload: Record<string, unknown> = {}) {
    component['handleSessionCommand']({ type, player: playerName, payload, timestamp: new Date().toISOString() });
  }

  it("a duplicate resend of the player's earlier submission is ignored once the player has already submitted once this Combat Turn, even after the GM re-arms the supersede flag with a later roll", () => {
    const hero = new Participant();
    hero.name = 'Hero';
    hero.baseIni = 9;
    hero.setDicesWithoutRoll(3);
    CombatManager.participants.insert(hero);
    component['participantOwners'].set(hero, 'pl-hero');
    CombatManager.started = true;
    CombatManager.passEnded = false;
    const heroId = component['getParticipantId'](hero);

    // GM rolls once, Hero's player supersedes it - the ordinary round-3
    // item-5 path.
    component.btnAskPlayerToRoll_Click(hero);
    component.btnRollInitiative_Click(hero);
    command('roll_submission', 'pl-hero', {
      participantId: heroId, roll: 12, diceValues: [6, 6], diceSum: 12
    });
    const afterPlayerRoll = hero.getCurrentInitiative();
    expect(afterPlayerRoll).toBe(21); // 9 + 12

    // The GM makes a deliberate, later re-roll for Hero (e.g. correcting a
    // mistaken entry) with the same row dice button. This re-arms
    // `participantsWithSupersedableGmRoll` for Hero.
    component.btnAskPlayerToRoll_Click(hero);
    component.btnRollInitiative_Click(hero);
    expect(component['participantsWithSupersedableGmRoll'].has(heroId)).toBeTrue();
    const afterGmReroll = hero.getCurrentInitiative();

    // A duplicate or delayed resend of Hero's ORIGINAL submission now lands.
    command('roll_submission', 'pl-hero', {
      participantId: heroId, roll: 12, diceValues: [6, 6], diceSum: 12
    });

    // Round 5 item 4 fix: this must NOT supersede the GM's later, deliberate
    // re-roll - Hero's player already submitted once this Combat Turn.
    expect(hero.getCurrentInitiative()).toBe(afterGmReroll);
  });
});

// ─── Round 5 item 5: the seize (`p.edge`) survives a same-player type-
// mismatch re-registration, the same way the "asked" records already do
// (`briefs/mid-turn-joiner-spec.md`, "RESOLVED - validation round 5", item
// 5). ──────────────────────────────────────────────────────────────────

describe('Round 5 item 5: seize survives a type-mismatch re-registration', () => {
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
    const sync = TestBed.inject(SessionSyncService);
    spyOn(sync, 'broadcastState');
    spyOn(sync, 'broadcastGmState');
    spyOn(sync, 'sendCommand');
    component.shareRoomCode = 'ABC123';
    component.sharedLogEntries = [];
    // Auto-confirm the Seize dialog (Xavier, 2026-09-21) so this
    // pre-existing round-5 scenario test still exercises the real handler.
    const dialog = TestBed.inject(ConfirmationDialogService);
    spyOn(dialog, 'confirm').and.resolveTo(true);
  });

  afterEach(() => resetCombat());

  function command(type: string, playerName: string, payload: Record<string, unknown> = {}) {
    component['handleSessionCommand']({ type, player: playerName, payload, timestamp: new Date().toISOString() });
  }

  it('a seize made before re-registering as a different character type (decker <-> non-decker) is carried onto the new participant object', async () => {
    command('register_character', 'pl-hero', {
      characterName: 'Hero', initiativeDice: 1, reaction: 6, intuition: 5, isMatrix: false
    });
    const firstHero = CombatManager.participants.items.find(p => p.name === 'Hero')!;
    // R1 (`briefs/seize-initiative-spec.md`, "RESOLVED - Xavier's rulings,
    // 2026-09-21"): a participant cannot seize before rolling this Combat
    // Turn's Initiative Test - give Hero a roll first so the real GM seize
    // control below actually takes effect.
    firstHero.diceIni = 8;
    component.btnEdge_Click(firstHero); // the real GM seize control
    await fixture.whenStable(); // let the (auto-confirmed) dialog promise settle
    expect(firstHero.edge).toBeTrue();

    // Same player re-registers as a decker (type mismatch: Participant ->
    // MatrixParticipant), which discards the old object and builds a
    // brand-new one.
    command('register_character', 'pl-hero', {
      characterName: 'Hero', initiativeDice: 1, reaction: 6, intuition: 5, isMatrix: true, dataProcessing: 4
    });
    const newHero = CombatManager.participants.items.find(p => p.name === 'Hero')!;
    expect(newHero).not.toBe(firstHero);

    // Core p. 161: the move to the top "lasts for the entire Combat Turn" -
    // the Edge spent seizing it must not be spent for nothing just because
    // the same player re-registered as a different character type.
    expect(newHero.edge).toBeTrue();
  });

  it('a re-registration by a player who never seized stays un-seized (no seize fabricated out of nothing)', () => {
    command('register_character', 'pl-hero', {
      characterName: 'Hero', initiativeDice: 1, reaction: 6, intuition: 5, isMatrix: false
    });
    const firstHero = CombatManager.participants.items.find(p => p.name === 'Hero')!;
    expect(firstHero.edge).toBeFalse();

    command('register_character', 'pl-hero', {
      characterName: 'Hero', initiativeDice: 1, reaction: 6, intuition: 5, isMatrix: true, dataProcessing: 4
    });
    const newHero = CombatManager.participants.items.find(p => p.name === 'Hero')!;
    expect(newHero.edge).toBeFalse();
  });
});

// ─── Round 5 item 6: the roll-status line must clear at EVERY Combat Turn
// boundary, not only the ones reached through `advancePass()`
// (`briefs/mid-turn-joiner-spec.md`, "RESOLVED - validation round 5", item
// 6). ──────────────────────────────────────────────────────────────────

describe('Round 5 item 6: the roll-status line clears wherever a Combat Turn boundary is observed, not only inside advancePass()', () => {
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
    const sync = TestBed.inject(SessionSyncService);
    spyOn(sync, 'broadcastState');
    spyOn(sync, 'broadcastGmState');
    spyOn(sync, 'sendCommand');
    component.shareRoomCode = 'ABC123';
    component.sharedLogEntries = [];
  });

  afterEach(() => resetCombat());

  it("logCombatTurnEnded() - fired by CombatManager.onCombatTurnEnded for every Combat Turn boundary, whichever call path reached it - clears a roll-status line left over from that turn", () => {
    // Simulate a status line still on screen from earlier in the turn, the
    // way `updateInitiativePrepInfo()` would have left it (e.g. "All
    // initiative rolls in." or "Waiting for initiative: ...").
    component['rollStatusText'] = 'All initiative rolls in.';

    // `logCombatTurnEnded` is wired directly to `CombatManager
    // .onCombatTurnEnded` (constructor), so it fires for every Combat Turn
    // boundary the engine reaches, regardless of which caller reached
    // `endCombatTurn()` - not only `advancePass()`'s own Next Pass /
    // End Combat Turn button, which already had its own clear.
    component['logCombatTurnEnded'](1);

    // Round 5 item 6 fix: without it, this stale line survived into the
    // next turn/pre-combat state for any Combat Turn boundary that did not
    // happen to go through `advancePass()`.
    expect(component.rollStatusText).toBe('');
  });

  it('regression: advancePass() itself still clears the line for the ordinary Next Pass / End Combat Turn route (unchanged)', () => {
    const rolled = new Participant();
    rolled.name = 'Rolled';
    rolled.baseIni = 15;
    rolled.setDicesWithoutRoll(1);
    CombatManager.participants.insert(rolled);
    rolled.diceIni = 5; // Score 20 - stays positive after one pass
    component.btnStartRound_Click();
    const actor = CombatManager.currentActors.items[0];
    component['performAct'](actor, null); // pass 1 ends

    component['rollStatusText'] = 'All initiative rolls in.';
    component.btnNextPass_Click(); // synchronous - nobody owes a roll

    expect(component.rollStatusText).toBe('');
  });
});

// ─── Round 5 item 10: an unrolled, unseized participant does not hold the
// Combat Turn open on its own bare attribute
// (`briefs/mid-turn-joiner-spec.md`, "RESOLVED - validation round 5", item
// 10). ─────────────────────────────────────────────────────────────────

describe('Round 5 item 10: a Combat Turn ends once only unrolled participants remain', () => {
  let component: BattleTrackerComponent;
  let fixture: ComponentFixture<BattleTrackerComponent>;
  let logged: SharedLogEntry[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BattleTrackerComponent],
      providers: appConfig.providers
    }).compileComponents();
    fixture = TestBed.createComponent(BattleTrackerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    resetCombat();
    const sync = TestBed.inject(SessionSyncService);
    logged = [];
    spyOn(sync, 'broadcastState');
    spyOn(sync, 'broadcastGmState');
    spyOn(sync, 'sendCommand');
    spyOn(sync, 'appendLog').and.callFake((entry: SharedLogEntry) => { logged.push(entry); });
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

  function addParticipantViaDialog(name: string): Participant {
    component.btnAddParticipant_Click();
    expect(component.pendingAddDraft).toBeTruthy();
    component.pendingAddDraft!.name = name;
    component.commitAddDraft();
    return CombatManager.participants.items.find(x => x.name === name) as Participant;
  }

  function actCurrent(): void {
    const actor = CombatManager.currentActors.items[0];
    component['performAct'](actor, null);
  }

  /**
   * Next Pass / End Combat Turn warns (does not block) while anyone still
   * owes a roll (item D4) - Late owing a roll is exactly this test's own
   * fixture, so every `btnNextPass_Click()` below goes through that async
   * confirm dialog. Stubbed to resolve "Advance Anyway" so the pass/turn
   * genuinely advances, the same pattern the D4 describe block above uses.
   */
  function stubProceedPastOutstandingRollWarning(): void {
    const dialog = TestBed.inject(ConfirmationDialogService);
    spyOn(dialog, 'confirm').and.resolveTo(true);
  }

  async function clickNextPassAndProceed(): Promise<void> {
    component.btnNextPass_Click();
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  it('ends the Combat Turn once the only remaining participant is unrolled, instead of leaving it "stuck" open on a bare attribute', async () => {
    // A single, low-scoring rolled participant, so the very next pass
    // decays them to 0 or below and the turn would ordinarily end there.
    const rolled = makeScored('Rolled', 2, 1); // Score 3
    component.btnStartRound_Click();
    expect(CombatManager.currentActors.items).toEqual([rolled]);

    // A late joiner, added mid-combat, never rolled.
    const late = addParticipantViaDialog('Late');
    late.baseIni = 8;

    actCurrent(); // Rolled acts -> advance -> Late is Waiting but unrolled ->
    // currentActors empties -> endInitiativePass() -> isOver() is still
    // false here (Rolled's own Score 3 is still positive) - only the pass
    // ends, the turn does not.
    expect(CombatManager.started).toBeTrue();
    expect(CombatManager.currentActors.count).toBe(0);

    const turnEndedBefore = logged.some(e => e.text.toLowerCase().includes('combat turn') && e.text.toLowerCase().includes('end'));
    expect(turnEndedBefore).toBeFalse();

    // The GM advances to the next pass: Rolled's Score decays by 10 (3 -> -7),
    // and Late is still unrolled. Before item 10, Late's bare attribute (8)
    // would have kept `isOver()` false forever; now nobody remaining is both
    // above 0 and rolled-or-seized, so the Combat Turn ends here instead.
    stubProceedPastOutstandingRollWarning();
    await clickNextPassAndProceed();

    expect(CombatManager.started).toBeFalse();
    expect(CombatManager.combatTurn).toBe(2);
  });

  it("regression: a rolled participant still above 0 keeps the Combat Turn open, even with an unrolled participant also present", async () => {
    const rolled = makeScored('Rolled', 20, 5); // Score 25 - stays positive after one pass
    component.btnStartRound_Click();
    const late = addParticipantViaDialog('Late');
    late.baseIni = 8;
    actCurrent();

    stubProceedPastOutstandingRollWarning();
    await clickNextPassAndProceed(); // Rolled decays to 15, still positive

    expect(CombatManager.started).toBeTrue();
    expect(CombatManager.combatTurn).toBe(1);
    void late;
    void rolled;
  });

  it('the Begin Combat Turn gate is unaffected: it still requires every rolled/unrolled participant present at Start Round time to have a roll in hand before combat begins', () => {
    const unrolled = new Participant();
    unrolled.name = 'Unrolled';
    unrolled.baseIni = 8;
    unrolled.setDicesWithoutRoll(1);
    CombatManager.participants.insert(unrolled); // present at Start Round, never rolled

    component.btnStartRound_Click();

    // hasPendingInitiativeRolls() still blocks beginCombatTurn() - item 10
    // only changes what happens to an ALREADY-running Combat Turn, not the
    // pre-combat gate.
    expect(CombatManager.started).toBeFalse();
    expect(component.initiativePrepActive).toBeTrue();
  });

  it('a late joiner added after the turn would otherwise have ended keeps the turn alive again, unrolled, until it too is skipped by item 10', async () => {
    stubProceedPastOutstandingRollWarning();

    const rolled = makeScored('Rolled', 2, 1); // Score 3
    component.btnStartRound_Click();
    actCurrent(); // Rolled acts -> nobody else Waiting -> endInitiativePass() -> isOver() true (Rolled's Score 3 still >0 here) -> pass ends only

    await clickNextPassAndProceed(); // Rolled decays to -7 -> isOver() true -> Combat Turn ends
    expect(CombatManager.started).toBeFalse();
    expect(CombatManager.combatTurn).toBe(2);

    // A brand-new Combat Turn starts. `rolled` is still in the encounter
    // (`softReset()` at the turn boundary zeroed its `diceIni`, not removed
    // it) and would otherwise still owe this turn's own Initiative Test too
    // - taken out of the picture here (as if they left the fight) so this
    // turn's fixture is a clean single already-rolled participant plus a
    // fresh late joiner, matching the first test's shape. The turn stays
    // open on the strength of whoever else is rolled and positive, never on
    // the late joiner's own bare attribute.
    rolled.ooc = true;
    const rolled2 = makeScored('Rolled2', 2, 1); // Score 3, turn 2
    component.btnStartRound_Click();
    expect(CombatManager.started).toBeTrue();
    expect(CombatManager.combatTurn).toBe(2);

    const late = addParticipantViaDialog('Late');
    late.baseIni = 20; // a high bare attribute - must not keep the turn open

    actCurrent(); // Rolled2 acts -> Late is unrolled -> currentActors empties
    expect(CombatManager.currentActors.count).toBe(0);

    await clickNextPassAndProceed(); // Rolled2 decays to -7 -> isOver() true regardless of Late's 20
    expect(CombatManager.started).toBeFalse();
    expect(CombatManager.combatTurn).toBe(3);
    void rolled2;
  });
});

// ─── RESOLVED - jack-out now prompts the player (Xavier, 2026-09-20),
// `briefs/mid-turn-joiner-spec.md`'s final section. Reverses the "jacking out
// entirely stays automatic" decision recorded 2026-09-17 in
// `briefs/player-initiative-prompt-spec.md`: a *player*-initiated jack out
// (the `configure_deck` command's `jackOut` branch, reached only through a
// player's own session command) no longer rolls the lost dice GM-side. It
// defers through the same `rollGainedDice: false` path a mid-pass VR-mode-down
// switch already uses (fix round 4, `briefs/player-initiative-prompt-spec.md`),
// so the owning player rolls the loss themselves via the existing
// non-dismissible delta modal (`SharedParticipantState.pendingDeltaDice`,
// `participantPendingDeltaDice`).
//
// What distinguishes a player-initiated jack out from a GM-initiated one:
// they are two different code paths, not a flag on one path. A player's jack
// out only ever arrives as a `configure_deck` session command (sent by
// `PlayerViewComponent.jackOut()`), handled by
// `BattleTrackerComponent.handleSessionCommand()`'s `jackOut` branch. A
// GM-initiated jack out only ever arrives as a direct call to
// `BattleTrackerComponent.gmJackOut()` - the method the GM's own "Jack Out"
// row button and the Matrix run panel's jack-out control both call - which
// this brief's "stays automatic" carve-out applies to and this change does
// not touch. Removing the deck entirely (`configure_deck` with
// `isMatrix: false`) is a third, separate branch (`demoteToParticipant()`)
// and is likewise untouched. Every scenario below drives the real path a
// player's own client actually uses (`handleSessionCommand` with a
// `configure_deck` command), into an actually-started Combat Turn via the
// real GM handlers - never a helper that fakes `combatManager.started`.
describe('Player-initiated jack out prompts the player to roll the lost dice (briefs/mid-turn-joiner-spec.md, "RESOLVED - jack-out now prompts the player")', () => {
  let component: BattleTrackerComponent;
  let fixture: ComponentFixture<BattleTrackerComponent>;
  let sync: SessionSyncService;
  let broadcasts: SharedCombatState[];
  let logged: SharedLogEntry[];

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
    broadcasts = [];
    logged = [];
    spyOn(sync, 'broadcastState').and.callFake((s: SharedCombatState) => { broadcasts.push(s); });
    spyOn(sync, 'broadcastGmState');
    spyOn(sync, 'sendCommand');
    spyOn(sync, 'appendLog').and.callFake((entry: SharedLogEntry) => { logged.push(entry); });

    component.shareRoomCode = 'ABC123';
    component.sharedLogEntries = [];
  });

  afterEach(() => resetCombat());

  function command(type: string, playerName: string, payload: Record<string, unknown> = {}) {
    component['handleSessionCommand']({ type, player: playerName, payload, timestamp: new Date().toISOString() });
  }

  function lastBroadcast(): SharedCombatState {
    expect(broadcasts.length).toBeGreaterThan(0);
    return broadcasts[broadcasts.length - 1];
  }

  function pendingDeltaFor(state: SharedCombatState, id: string): number | undefined {
    return state.participants.find(p => p.id === id)?.pendingDeltaDice;
  }

  /** A rolled, non-Matrix participant that unblocks `btnStartRound_Click`. */
  function makeScored(name: string, baseIni: number, roll: number): Participant {
    const p = new Participant();
    p.name = name;
    p.baseIni = baseIni;
    p.setDicesWithoutRoll(1);
    CombatManager.participants.insert(p);
    p.diceIni = roll;
    return p;
  }

  /**
   * A decker who joins mid-combat (Pass 1, so the late-entry penalty - not
   * this feature's concern - is zero), takes this Combat Turn's own
   * Initiative Test in AR, then jacks into Hot Sim mid-turn (a *gain*,
   * already deferred to the player since fix round 2/3 of
   * `briefs/player-initiative-prompt-spec.md`) and resolves that gain via
   * their own delta roll - exactly the precondition the brief's jack-out
   * scenario needs: "already rolled this Combat Turn", now also jacked in.
   */
  function jackedInDeckerAlreadyRolled(): MatrixParticipant {
    command('register_character', 'pl-decker', {
      characterName: 'Slamm-0', initiativeDice: 1, reaction: 6, intuition: 5,
      isMatrix: true, dataProcessing: 8, vrMode: 'AR'
    });
    const mp = CombatManager.participants.items.find(p => p.name === 'Slamm-0') as MatrixParticipant;
    expect(mp instanceof MatrixParticipant).toBeTrue();

    // The decker's own Initiative Test, exactly as PlayerViewComponent's
    // main roll modal submits it.
    command('roll_submission', 'pl-decker', {
      participantId: component['getParticipantId'](mp), roll: 4, diceValues: [4], diceSum: 4
    });
    expect(mp.diceIni).toBe(4);

    // Jacks into Hot Sim mid-turn: a +3 gain, deferred to the player.
    command('configure_deck', 'pl-decker', { isMatrix: true, jackIn: true, vrMode: 'hot-sim', dataProcessing: 8 });
    expect(mp.dices).toBe(4); // a gain writes the pool immediately (unaffected by this change)
    const gainId = component['getParticipantId'](mp);
    expect(pendingDeltaFor(lastBroadcast(), gainId)).toBe(3);

    // The player rolls the 3 gained dice themselves - ordinary, unaffected
    // by this feature - clearing the note before the jack-out scenario
    // begins, so each test below starts from a single, unambiguous note.
    command('roll_submission', 'pl-decker', {
      participantId: gainId, roll: 11, diceValues: [5, 4, 2], isDelta: true
    });
    expect(component['participantPendingDeltaDice'].has(mp)).toBeFalse();
    return mp;
  }

  it('a player jacking out mid-combat after already rolling this Combat Turn gets a negative pendingDeltaDice note (a loss), not an immediate GM-side roll', () => {
    const other = makeScored('Other', 5, 3); // keeps btnStartRound_Click unblocked
    void other;
    component.btnStartRound_Click();
    expect(CombatManager.started).toBeTrue();

    const mp = jackedInDeckerAlreadyRolled();
    const id = component['getParticipantId'](mp);
    const dicesBeforeJackOut = mp.dices; // 4 (Hot Sim)
    const scoreBeforeJackOut = mp.getCurrentInitiative();
    logged.length = 0;

    command('configure_deck', 'pl-decker', { isMatrix: true, jackOut: true, dataProcessing: 8 });

    // Dice half deferred: nothing rolled or applied yet (the defect this
    // fix closes - previously `restorePhysicalDiceCount` rolled and applied
    // the loss here, GM-side, immediately).
    expect(mp.dices).toBe(dicesBeforeJackOut);
    // Attribute half (DP+INT(13) -> REA+INT(11), -2) still applies
    // immediately, exactly as it always has - only the *dice* half changed.
    expect(mp.getCurrentInitiative()).toBe(scoreBeforeJackOut - 2);
    // Worded as a loss: Hot Sim(4) -> the decker's own physical dice(1).
    expect(component['participantPendingDeltaDice'].get(mp)).toBe(-3);
    expect(pendingDeltaFor(lastBroadcast(), id)).toBe(-3);
    // No dice were rolled GM-side for this: only the player-command "jacked
    // out" line exists, no "initiative delta" roll line.
    expect(logged.some(e => e.text.startsWith('initiative delta'))).toBeFalse();
    expect(logged.some(e => e.text === 'jacked out')).toBeTrue();
  });

  it("the player's own roll after jacking out applies the subtraction exactly once, through the same engine path (Participant.changeDiceCount) a dice decrease already uses", () => {
    makeScored('Other', 5, 3);
    component.btnStartRound_Click();
    const mp = jackedInDeckerAlreadyRolled();
    const id = component['getParticipantId'](mp);

    command('configure_deck', 'pl-decker', { isMatrix: true, jackOut: true, dataProcessing: 8 });
    expect(component['participantPendingDeltaDice'].get(mp)).toBe(-3);
    const scoreBeforeRoll = mp.getCurrentInitiative();
    logged.length = 0;

    // The player's own roll, exactly as PlayerViewComponent's delta modal
    // (`onDeltaRollFromModal`) submits it.
    command('roll_submission', 'pl-decker', {
      participantId: id, roll: 9, diceValues: [4, 3, 2], isDelta: true
    });

    expect(mp.dices).toBe(1); // restored to the decker's own physical dice
    expect(mp.getCurrentInitiative()).toBe(scoreBeforeRoll - 9);
    expect(component['participantPendingDeltaDice'].has(mp)).toBeFalse();
    expect(pendingDeltaFor(lastBroadcast(), id)).toBeUndefined();
    // Exactly one Action Log line for this roll, worded as a subtraction -
    // the same signed-delta formatter a mode-switch loss already uses.
    const deltaLines = logged.filter(e => e.text.startsWith('initiative delta'));
    expect(deltaLines.length).toBe(1);
    expect(deltaLines[0].actor).toBe('Slamm-0');
    expect(deltaLines[0].text).toBe(`initiative delta: -[4, 3, 2] = -9 → score: ${scoreBeforeRoll - 9}`);

    // A second, duplicate resend of the same submission must not apply the
    // subtraction twice - guard B: nothing is owed any more, so it is
    // discarded outright.
    logged.length = 0;
    command('roll_submission', 'pl-decker', {
      participantId: id, roll: 6, diceValues: [3, 3], isDelta: true
    });
    expect(mp.dices).toBe(1);
    expect(mp.getCurrentInitiative()).toBe(scoreBeforeRoll - 9);
    expect(logged.length).toBe(0);
  });

  it('the owed jack-out delta rides on the shared state and survives a refresh (GM-tab restoreFromSharedState, matching a player reconnect)', () => {
    makeScored('Other', 5, 3);
    component.btnStartRound_Click();
    const mp = jackedInDeckerAlreadyRolled();

    command('configure_deck', 'pl-decker', { isMatrix: true, jackOut: true, dataProcessing: 8 });
    expect(component['participantPendingDeltaDice'].get(mp)).toBe(-3);
    const stateBeforeRestore = lastBroadcast();

    // A GM tab reload (or a player reconnect reading the same wire field,
    // `player-initiative-prompt-spec.md` Item D) rebuilds every participant
    // from the broadcast state alone.
    component['restoreFromSharedState'](stateBeforeRestore);

    const restored = CombatManager.participants.items.find(p => p.name === 'Slamm-0') as MatrixParticipant;
    expect(restored).toBeTruthy();
    expect(restored).not.toBe(mp); // a genuinely new object, per restoreFromSharedState's own contract
    expect(component['participantPendingDeltaDice'].get(restored)).toBe(-3);

    // The note is still live after restore: the player's roll still resolves
    // it exactly once, on the reconstructed object.
    const restoredId = component['getParticipantId'](restored);
    command('roll_submission', 'pl-decker', {
      participantId: restoredId, roll: 9, diceValues: [4, 3, 2], isDelta: true
    });
    expect(restored.dices).toBe(1);
    expect(component['participantPendingDeltaDice'].has(restored)).toBeFalse();
  });

  it('a GM-initiated jack out (gmJackOut, the GM\'s own row/Matrix-panel button) still resolves automatically, with no prompt', () => {
    makeScored('Other', 5, 3);
    component.btnStartRound_Click();
    const mp = jackedInDeckerAlreadyRolled();
    const id = component['getParticipantId'](mp);
    const dicesBefore = mp.dices;
    logged.length = 0;

    // The GM's own "Jack Out" button on the participant row / Matrix run
    // panel both call this directly - unaffected by this change.
    component.gmJackOut(mp);

    expect(mp.dices).toBe(1); // rolled and applied immediately, as always
    expect(mp.dices).not.toBe(dicesBefore);
    expect(component['participantPendingDeltaDice'].has(mp)).toBeFalse();
    expect(pendingDeltaFor(lastBroadcast(), id)).toBeUndefined();
    // A real dice roll happened GM-side: an "initiative delta" line exists
    // (unlike the player-initiated case above).
    expect(logged.some(e => e.text.startsWith('initiative delta'))).toBeTrue();
  });

  it('removing the deck entirely (configure_deck isMatrix: false) still resolves automatically, with no prompt', () => {
    makeScored('Other', 5, 3);
    component.btnStartRound_Click();
    const mp = jackedInDeckerAlreadyRolled();

    command('configure_deck', 'pl-decker', { isMatrix: false });

    expect(component['participantPendingDeltaDice'].has(mp)).toBeFalse();
    const replacement = CombatManager.participants.items.find(p => p.name === 'Slamm-0')!;
    expect(replacement instanceof MatrixParticipant).toBeFalse();
    expect(component['participantPendingDeltaDice'].has(replacement)).toBeFalse();
    expect(pendingDeltaFor(lastBroadcast(), component['getParticipantId'](replacement))).toBeUndefined();
  });

  it('a jack out by a participant who has not yet rolled this Combat Turn does not prompt - the normal roll covers it', () => {
    makeScored('Other', 5, 3);
    component.btnStartRound_Click();
    expect(CombatManager.started).toBeTrue();

    // A decker joins mid-combat already jacked into Hot Sim (chosen before
    // ever taking this Combat Turn's own Initiative Test - `diceIni` stays 0
    // until the player rolls, same as any other unrolled participant).
    command('register_character', 'pl-decker', {
      characterName: 'Slamm-0', initiativeDice: 1, reaction: 6, intuition: 5,
      isMatrix: true, dataProcessing: 8, vrMode: 'hot-sim'
    });
    const mp = CombatManager.participants.items.find(p => p.name === 'Slamm-0') as MatrixParticipant;
    expect(mp.diceIni).toBe(0);
    logged.length = 0;

    command('configure_deck', 'pl-decker', { isMatrix: true, jackOut: true, dataProcessing: 8 });

    // The same no-op guard `changeParticipantDiceCount`'s `!rollGainedDice`
    // branch already uses for "not yet rolled this Combat Turn" - the count
    // is simply written, nothing is owed, nothing to roll (the normal
    // Initiative Test roll will cover it).
    expect(mp.dices).toBe(1);
    expect(mp.diceIni).toBe(0);
    expect(component['participantPendingDeltaDice'].has(mp)).toBeFalse();
    expect(pendingDeltaFor(lastBroadcast(), component['getParticipantId'](mp))).toBeUndefined();
    expect(logged.some(e => e.text.startsWith('initiative delta'))).toBeFalse();
  });
});
