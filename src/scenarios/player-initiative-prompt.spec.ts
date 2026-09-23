// Scenarios for briefs/player-initiative-prompt-spec.md
// ("player initiative prompt as a modal with embedded dice roller").
//
// Not rules-dependent - this only changes how loudly and reliably the app
// asks a player to roll, never the dice math itself (spec "No rules
// citation required"), so nothing here cites a rulebook page. Dice counts,
// caps and clamping are exercised through the same `clampInitiativeRoll`/
// `getInitiativeRollMax` helpers the rest of the app already uses and are
// not re-derived here.
//
// Two testing styles are used, matching existing convention in this
// directory:
//  - A stubbed `NgbModal.open()` (as in `matrix-port-rules-correctness.spec.ts`'s
//    `stubModal`) for tests that need to inspect exactly what was opened
//    (options) or closed (dismiss calls), without needing the real portal.
//  - The real `NgbModal` service, querying `document` for the rendered
//    modal (as in `cyberpunk-name-generator.spec.ts`'s D10 tests), for the
//    scenarios that must prove an actual button click in actual rendered
//    DOM drives the right method - `NgbModal` renders its window onto
//    `document.body`, not inside `fixture.nativeElement`.

import { ApplicationRef } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { PlayerViewComponent } from 'app/player-view/player-view.component';
import { DiceRollerComponent } from 'app/dice-roller/dice-roller.component';
import { appConfig } from 'app/app.config';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import {
  SessionSyncService, SessionCommand, SharedCombatState, SharedParticipantState
} from 'app/services/session-sync.service';

// ─── DiceRollerComponent: the `fixedDiceCount` input (spec "Proposed approach") ───
// Tested directly, independent of the player view, because it is the actual
// mechanism the spec requires: "the embedded roller's dice count must be set
// to the actor's initiative dice, not the free 1-50 default ... add an input
// rather than altering existing behaviour."
describe('DiceRollerComponent: fixedDiceCount (briefs/player-initiative-prompt-spec.md)', () => {
  let fixture: ComponentFixture<DiceRollerComponent>;
  let component: DiceRollerComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DiceRollerComponent] }).compileComponents();
    fixture = TestBed.createComponent(DiceRollerComponent);
    component = fixture.componentInstance;
  });

  it('with no fixedDiceCount, the free 1-50 count field works exactly as before', () => {
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('#dice-roller-count') as HTMLInputElement;
    expect(input.readOnly).toBeFalse();
    expect(component.diceCount).toBe(2);
  });

  it('locks diceCount to the supplied value and renders it as plain text, not an editable input', () => {
    // Fix round (reviewer defect 2): a `readOnly` number input still lets
    // the spinner arrows / mouse wheel change its value, so a locked count
    // is no longer an `<input>` at all - it is plain, non-editable text.
    fixture.componentRef.setInput('fixedDiceCount', 3);
    fixture.detectChanges();
    expect(component.diceCount).toBe(3);
    const input = fixture.nativeElement.querySelector('#dice-roller-count') as HTMLInputElement | null;
    expect(input?.tagName).not.toBe('INPUT');
    const fixed = fixture.nativeElement.querySelector('[data-testid="dice-roller-count-fixed"]') as HTMLElement;
    expect(fixed).not.toBeNull();
    expect(fixed.textContent?.trim()).toBe('3');
  });

  it('rolling with a fixedDiceCount set always rolls that many dice even if diceCount is forced out of sync', () => {
    // Fix round (reviewer defect 2): `roll()` must never trust `diceCount`
    // while `fixedDiceCount` is set, so even a stray DOM mutation (there is
    // no longer an input to produce one, but this proves the guard is in
    // the roll logic itself, not just the removed input) cannot change what
    // gets rolled.
    fixture.componentRef.setInput('fixedDiceCount', 4);
    fixture.detectChanges();
    component.diceCount = 50; // simulate diceCount drifting from fixedDiceCount
    let captured: { values: number[] } | undefined;
    component.rolledEvent.subscribe(r => (captured = r));
    component.roll();
    expect(captured?.values.length).toBe(4);
  });

  it('rolling with a fixedDiceCount set always rolls exactly that many dice', () => {
    fixture.componentRef.setInput('fixedDiceCount', 5);
    fixture.detectChanges();
    let captured: { values: number[] } | undefined;
    component.rolledEvent.subscribe(r => (captured = r));
    component.roll();
    expect(captured?.values.length).toBe(5);
  });

  it('changing fixedDiceCount (e.g. a delta prompt with a different dice count) re-locks diceCount', () => {
    fixture.componentRef.setInput('fixedDiceCount', 2);
    fixture.detectChanges();
    expect(component.diceCount).toBe(2);
    fixture.componentRef.setInput('fixedDiceCount', 4);
    fixture.detectChanges();
    expect(component.diceCount).toBe(4);
  });

  // ─── QA fix round: `showOtherPlayers` (defect 1, "the roll modal must show
  // only the player's own roll") ─────────────────────────────────────────
  it('defaults to showing the "Other Players" section (existing behaviour, unchanged)', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Other Players');
  });

  it('with showOtherPlayers set false, the "Other Players" section does not render at all, "Your Roll" still does', () => {
    fixture.componentRef.setInput('showOtherPlayers', false);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Other Players');
    expect(fixture.nativeElement.textContent).toContain('Your Roll');
  });
});

describe('Player initiative prompt as a modal (briefs/player-initiative-prompt-spec.md)', () => {
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

  function stateWith(participants: SharedParticipantState[], overrides: Partial<SharedCombatState> = {}): SharedCombatState {
    return { round: 1, pass: 1, started: true, participants, ...overrides };
  }

  function participant(overrides: Partial<SharedParticipantState> & { id: string; name: string; order: number }): SharedParticipantState {
    // `askedToRoll: true` by default (redesign item A,
    // `briefs/mid-turn-joiner-spec.md`): most scenarios below are about what
    // happens once the GM HAS asked this specific character, so this keeps
    // them from having to spell out the field on every call. Item B's own
    // tests override it to `false` explicitly to prove the gate. Supersedes
    // the old state-level `rollsRequested` default this replaced.
    return { active: false, playerControlled: true, askedToRoll: true, ...overrides };
  }

  /** A copy of `p` with `askedToRoll` explicitly set - for tests that build
   * a "the GM has now asked" broadcast from a participant object created
   * earlier in the test (when `askedToRoll` wasn't the point yet). */
  function asked(p: SharedParticipantState, value = true): SharedParticipantState {
    return { ...p, askedToRoll: value };
  }

  async function join(state: SharedCombatState | null, gmConnected = true) {
    spyOn(sync, 'joinAsPlayer').and.resolveTo({ state, log: [], gmConnected });
    component.room = 'ABC123';
    await component.join();
    fixture.detectChanges();
  }

  function myToken(): string {
    return component['playerToken'];
  }

  /** A fake `NgbModal.open()` that hands the test direct control over what was opened and how it closes. */
  interface FakeModalRef {
    dismiss: jasmine.Spy;
    result: Promise<unknown>;
  }
  function stubModalOpen(): { content: unknown; options: unknown; ref: FakeModalRef }[] {
    const calls: { content: unknown; options: unknown; ref: FakeModalRef }[] = [];
    // Spy on the component's own injected `NgbModal` (accessed as `any` -
    // it is a private constructor field), not a separately-`TestBed.inject`ed
    // one: a standalone component's own `imports: [NgbModalModule]` can hand
    // it a differently-scoped instance than `TestBed.inject(NgbModal)` would,
    // and spying on the wrong object silently lets the *real* `NgbModal.open()`
    // run instead (a real modal actually opens in the browser, so anything
    // that only checks `rollModalRef` truthiness still passes - only
    // assertions on the stub's own call log expose the mismatch).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const modal = (component as any).modalService as NgbModal;
    spyOn(modal, 'open').and.callFake((content: unknown, options?: unknown) => {
      let rejectFn!: (reason?: unknown) => void;
      const result = new Promise((_resolve, reject) => { rejectFn = reject; });
      result.catch(() => { /* expected: every close is a dismiss */ });
      const ref: FakeModalRef = {
        dismiss: jasmine.createSpy('dismiss').and.callFake((reason?: unknown) => rejectFn(reason)),
        result
      };
      calls.push({ content, options, ref });
      return ref as unknown as NgbModalRef;
    });
    return calls;
  }

  function commandsSentOfType(spy: jasmine.Spy, type: string): SessionCommand[] {
    return spy.calls.allArgs().map(a => a[0] as SessionCommand).filter(c => c.type === type);
  }

  // ── Scenario 1 (Ordinary) / AC 1 ────────────────────────────────────────
  it('Scenario 1 / AC 1: GM request_rolls opens a modal, not an inline banner', async () => {
    // Fix round 2, item F: this test used to feed `pendingRoll: false` and
    // still assert the modal opened, which encoded the exact bug item A
    // fixes (the old `request_rolls` handler opened unconditionally,
    // ignoring `pendingRoll`/`ooc`/whether a character even exists) as
    // correct. A player who still owes a roll is `pendingRoll: true`.
    const hero = participant({
      id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 3, pendingRoll: true,
      askedToRoll: false
    });
    let commandHandler!: (c: SessionCommand) => void;
    spyOn(sync, 'onCommand').and.callFake(h => { commandHandler = h; });
    // Joins not yet asked - the GM has not asked yet.
    await join(stateWith([hero]));
    const opens = stubModalOpen();
    expect(opens.length).toBe(0);

    // The real `requestPlayerRolls()` (GM component) pushes the updated
    // shared state (this character now `askedToRoll: true`) before sending
    // the `request_rolls` command itself (item B: the state push is ordered
    // ahead of the command precisely so a player never sees the command
    // arrive first) - simulated here as the same two steps, in that order.
    component['applyIncomingState'](stateWith([asked(hero)]));
    commandHandler({ type: 'request_rolls', player: 'GM', payload: {}, timestamp: new Date().toISOString() });
    fixture.detectChanges();

    expect(opens.length).toBe(1);
    expect(opens[0].options).toEqual(jasmine.objectContaining({ backdrop: 'static', keyboard: false }));
    expect(component.rollModalRef).not.toBeNull();
    expect(component.promptRoll).toBeTrue();
    // The old inline banner never rendered into the fixture at all - a modal
    // was used instead of an `@if` block in the card body.
    expect(fixture.nativeElement.querySelector('.roll-banner')).toBeNull();
  });

  // ── Item A: request_rolls must never open the modal for a player who does
  // not currently qualify, even though the old handler opened unconditionally ─
  describe('Item A: request_rolls only opens for a player who actually still owes a roll', () => {
    it('an already-rolled player (pendingRoll: false) never sees the modal on request_rolls', async () => {
      const hero = participant({
        id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 3, pendingRoll: false
      });
      let commandHandler!: (c: SessionCommand) => void;
      spyOn(sync, 'onCommand').and.callFake(h => { commandHandler = h; });
      await join(stateWith([hero]));
      const opens = stubModalOpen();

      commandHandler({ type: 'request_rolls', player: 'GM', payload: {}, timestamp: new Date().toISOString() });
      fixture.detectChanges();

      expect(opens.length).toBe(0);
      expect(component.rollModalRef).toBeNull();
    });

    it('an ooc player never sees the modal on request_rolls, even with pendingRoll still true', async () => {
      const hero = participant({
        id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 3, pendingRoll: true, ooc: true
      });
      let commandHandler!: (c: SessionCommand) => void;
      spyOn(sync, 'onCommand').and.callFake(h => { commandHandler = h; });
      await join(stateWith([hero]));
      const opens = stubModalOpen();

      commandHandler({ type: 'request_rolls', player: 'GM', payload: {}, timestamp: new Date().toISOString() });
      fixture.detectChanges();

      expect(opens.length).toBe(0);
      expect(component.rollModalRef).toBeNull();
    });

    it('a player with no character at all never sees the modal on request_rolls', async () => {
      let commandHandler!: (c: SessionCommand) => void;
      spyOn(sync, 'onCommand').and.callFake(h => { commandHandler = h; });
      await join(stateWith([])); // nothing owned
      const opens = stubModalOpen();

      commandHandler({ type: 'request_rolls', player: 'GM', payload: {}, timestamp: new Date().toISOString() });
      fixture.detectChanges();

      expect(component.primaryCharacter).toBeNull();
      expect(opens.length).toBe(0);
      expect(component.rollModalRef).toBeNull();
    });

    it('item C: a player mid-delta-roll does not get the main modal stacked on top on request_rolls', async () => {
      // Already rolled this pass (pendingRoll: false) - a delta prompt only
      // ever exists after the main Initiative Test, so this is the only
      // state that can co-occur with the delta modal being open.
      const decker = participant({
        id: 'p-1', name: 'Decker', order: 1, ownerName: myToken(), initiativeDice: 1, pendingRoll: false
      });
      let commandHandler!: (c: SessionCommand) => void;
      spyOn(sync, 'onCommand').and.callFake(h => { commandHandler = h; });
      const opens = stubModalOpen();
      await join(stateWith([decker]));
      // Mid-delta-roll: force the delta modal open directly (simulating an
      // in-progress delta prompt for this same character).
      component.pendingDeltaDice = 2;
      component['openDeltaRollModal']();
      const openCountBeforeRequest = opens.length;

      commandHandler({ type: 'request_rolls', player: 'GM', payload: {}, timestamp: new Date().toISOString() });
      fixture.detectChanges();

      // No new modal opened - the main modal stays deferred behind the delta one.
      expect(opens.length).toBe(openCountBeforeRequest);
      expect(component.rollModalRef).toBeNull();
      expect(component.deltaRollModalRef).not.toBeNull();
    });

    it('a straggler who already has the modal open gets a fresh nudge on a repeat request_rolls', async () => {
      const hero = participant({
        id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 3, pendingRoll: true
      });
      let commandHandler!: (c: SessionCommand) => void;
      spyOn(sync, 'onCommand').and.callFake(h => { commandHandler = h; });
      stubModalOpen();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nudgeSpy = spyOn(component as any, 'triggerRollNudge').and.callThrough();
      await join(stateWith([hero])); // opens the modal once, nudges once
      expect(component.rollModalRef).not.toBeNull();
      expect(nudgeSpy).toHaveBeenCalledTimes(1);

      // Repeat request_rolls while the player still has not rolled: the
      // modal is already open (a no-op to open again), but the straggler
      // still gets a fresh nudge/chime.
      commandHandler({ type: 'request_rolls', player: 'GM', payload: {}, timestamp: new Date().toISOString() });
      fixture.detectChanges();

      expect(component.rollModalRef).not.toBeNull();
      expect(nudgeSpy).toHaveBeenCalledTimes(2);
    });
  });

  // ── Item B: the modal must not appear before the GM has actually asked ──
  describe('Item B: askedToRoll gates the modal independently of pendingRoll', () => {
    it('pendingRoll true but askedToRoll false does not open the modal on join/reconnect', async () => {
      const hero = participant({
        id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 3, pendingRoll: true,
        askedToRoll: false
      });
      const opens = stubModalOpen();
      await join(stateWith([hero]));

      expect(opens.length).toBe(0);
      expect(component.rollModalRef).toBeNull();
      expect(component.promptRoll).toBeFalse();
    });

    it('a later broadcast turning askedToRoll true (the GM finally asking) opens it', async () => {
      const hero = participant({
        id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 3, pendingRoll: true,
        askedToRoll: false
      });
      const opens = stubModalOpen();
      await join(stateWith([hero]));
      expect(opens.length).toBe(0);

      component['applyIncomingState'](stateWith([asked(hero)]));
      fixture.detectChanges();

      expect(opens.length).toBe(1);
      expect(component.rollModalRef).not.toBeNull();
    });
  });

  // ── AC 2 / Scenario 2 (Cap plus high roll) ──────────────────────────────
  it('AC 2 / Scenario 2: the modal roller submits a clamped roll_submission with no separate copy step', async () => {
    const hero = participant({
      id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 1, pendingRoll: true
    });
    await join(stateWith([hero]));
    const sendSpy = spyOn(sync, 'sendCommand');

    // 1 Initiative Die -> max roll is 6 (getInitiativeRollMax). A 5-die
    // result (30) must be clamped down to 6, not trusted raw.
    component.onInitiativeRollFromModal({ values: [6, 6, 6, 6, 6], rollAs: null });

    const submissions = commandsSentOfType(sendSpy, 'roll_submission');
    expect(submissions.length).toBe(1);
    expect(submissions[0].payload).toEqual(jasmine.objectContaining({
      participantId: 'p-1', roll: 6, diceValues: [6, 6, 6, 6, 6], diceSum: 30
    }));
    // QA fix round defect 3: an initiative roll no longer sends the generic
    // `dice_roll` command at all - the GM's log line comes from
    // `roll_submission` alone, and this is the command that used to trigger
    // a second, generic "rolled 1d6..." log line for the same roll.
    expect(commandsSentOfType(sendSpy, 'dice_roll').length).toBe(0);
    // QA fix round 2: the modal stays open showing the result and does not
    // close itself - pressing Roll must not make the dice (or the result)
    // vanish. `rollResultTotal` shows the *unclamped* dice sum the player
    // actually rolled (30), not the clamped submission (6) - see the
    // component doc comment on `rollResultTotal`.
    expect(component.manualRoll).toBe('');
    expect(component.rollModalRef).not.toBeNull();
    expect(component.rollAwaitingDone).toBeTrue();
    expect(component.rollResultTotal).toBe(30);

    // Nothing closes it on its own - not a timer, not another broadcast.
    // Only pressing Done does (AC 4).
    component.confirmRollDone();
    fixture.detectChanges();

    expect(component.promptRoll).toBeFalse();
    expect(component.rollModalRef).toBeNull();
    expect(component.rollAwaitingDone).toBeFalse();
  });

  // ── AC 3 / Scenario 3 (Change of mind) ──────────────────────────────────
  it('AC 3 / Scenario 3: the manual field clamps like onManualRollChanged and sends exactly one roll_submission', async () => {
    const hero = participant({
      id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 2, pendingRoll: true
    });
    await join(stateWith([hero]));
    const sendSpy = spyOn(sync, 'sendCommand');

    // Typed 999 with 2 dice (max 12) clamps down as onManualRollChanged does.
    component.onManualRollChanged(999);
    expect(component.manualRoll).toBe('12');
    component.submitManualRoll();

    const submissions = commandsSentOfType(sendSpy, 'roll_submission');
    expect(submissions.length).toBe(1);
    expect(submissions[0].payload).toEqual(jasmine.objectContaining({ participantId: 'p-1', roll: 12 }));
    expect(component.rollModalRef).toBeNull();

    // Change of mind the other way: manual entry then the roller - still
    // exactly one roll_submission for that attempt.
    sendSpy.calls.reset();
    component.onManualRollChanged(5);
    component.onInitiativeRollFromModal({ values: [6, 6], rollAs: null });
    expect(commandsSentOfType(sendSpy, 'roll_submission').length).toBe(1);
  });

  // ── AC 5 / Scenario 4 (Reconnect at the table) ──────────────────────────
  it('AC 5 / Scenario 4: a fresh join/reconnect with pendingRoll true opens the modal with no GM re-request', async () => {
    const hero = participant({
      id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 3, pendingRoll: true
    });
    const opens = stubModalOpen();
    await join(stateWith([hero]));

    expect(opens.length).toBe(1);
    expect(component.rollModalRef).not.toBeNull();
    expect(component.promptRoll).toBeTrue();
  });

  // ── AC 6 ─────────────────────────────────────────────────────────────────
  it('AC 6: a player with pendingRoll false does not see the modal on reconnect', async () => {
    const hero = participant({
      id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 3, pendingRoll: false
    });
    const opens = stubModalOpen();
    await join(stateWith([hero]));

    expect(opens.length).toBe(0);
    expect(component.rollModalRef).toBeNull();
    expect(component.promptRoll).toBeFalse();
  });

  // ── Regression: "Request Player Rolls produced nothing" ────────────────
  // The GM requests rolls during initiative PREP, before the Combat Turn
  // itself begins (`combatManager.started` only flips to `true` once
  // `beginCombatTurn()` runs, and that is deliberately deferred until every
  // roll is in). Every test above defaults `started: true`, which hid a bug
  // where the modal's open predicate also required `started` and so could
  // never be satisfied at the one moment the GM actually asks. These tests
  // reproduce that flow with `started: false`.
  describe('Regression: prep-time request (combat not started yet)', () => {
    it('a prep-time request_rolls (started: false) opens the modal', async () => {
      const hero = participant({
        id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 3, pendingRoll: true
      });
      const opens = stubModalOpen();
      await join(stateWith([hero], { started: false }));

      expect(opens.length).toBe(1);
      expect(component.rollModalRef).not.toBeNull();
      expect(component.promptRoll).toBeTrue();
    });

    it('the live request_rolls command path (not just an incoming state update) opens the modal while not started', async () => {
      const hero = participant({
        id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 3, pendingRoll: true,
        askedToRoll: false
      });
      let commandHandler!: (c: SessionCommand) => void;
      spyOn(sync, 'onCommand').and.callFake(h => { commandHandler = h; });
      // Joins before the GM has asked - still prep-time (not started).
      await join(stateWith([hero], { started: false }));
      const opens = stubModalOpen();
      expect(opens.length).toBe(0);

      // Mirrors `requestPlayerRolls()`'s real ordering: the state push
      // (this character now `askedToRoll: true`) lands before the
      // `request_rolls` command, both still with `started: false`.
      component['applyIncomingState'](stateWith([asked(hero)], { started: false }));
      commandHandler({ type: 'request_rolls', player: 'GM', payload: {}, timestamp: new Date().toISOString() });
      fixture.detectChanges();

      expect(opens.length).toBe(1);
      expect(component.rollModalRef).not.toBeNull();
      expect(component.promptRoll).toBeTrue();
    });

    it('the modal closes once the Combat Turn actually begins (started: true, askedToRoll cleared, pendingRoll: false)', async () => {
      const hero = participant({
        id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 3, pendingRoll: true
      });
      stubModalOpen();
      await join(stateWith([hero], { started: false }));
      expect(component.rollModalRef).not.toBeNull();

      // `beginCombatTurn()` clears every "asked" record and everyone's
      // `diceIni` gets rolled/submitted before this broadcast in the real
      // flow, so `pendingRoll` is also false by the time `started` flips to
      // true.
      component['applyIncomingState'](stateWith([
        participant({
          id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 3, pendingRoll: false,
          askedToRoll: false
        })
      ], { started: true }));
      fixture.detectChanges();

      expect(component.rollModalRef).toBeNull();
      expect(component.promptRoll).toBeFalse();
    });

    it('still no modal at prep time when the GM has not asked yet (askedToRoll: false)', async () => {
      const hero = participant({
        id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 3, pendingRoll: true,
        askedToRoll: false
      });
      const opens = stubModalOpen();
      await join(stateWith([hero], { started: false }));

      expect(opens.length).toBe(0);
      expect(component.rollModalRef).toBeNull();
      expect(component.promptRoll).toBeFalse();
    });
  });

  // ── AC 7 ─────────────────────────────────────────────────────────────────
  it('AC 7: clear_roll_prompt closes the modal', async () => {
    const hero = participant({
      id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 3, pendingRoll: true
    });
    stubModalOpen();
    let commandHandler!: (c: SessionCommand) => void;
    spyOn(sync, 'onCommand').and.callFake(h => { commandHandler = h; });
    await join(stateWith([hero]));
    expect(component.rollModalRef).not.toBeNull();

    commandHandler({ type: 'clear_roll_prompt', player: 'GM', payload: {}, timestamp: new Date().toISOString() });
    fixture.detectChanges();

    expect(component.rollModalRef).toBeNull();
    expect(component.promptRoll).toBeFalse();
  });

  it('AC 7: combat_ended closes the modal (and the delta modal, and clears its state)', async () => {
    const hero = participant({
      id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 3, pendingRoll: true
    });
    stubModalOpen();
    let commandHandler!: (c: SessionCommand) => void;
    spyOn(sync, 'onCommand').and.callFake(h => { commandHandler = h; });
    await join(stateWith([hero]));
    component.pendingDeltaDice = 2;
    component['openDeltaRollModal']();
    expect(component.rollModalRef).not.toBeNull();
    expect(component.deltaRollModalRef).not.toBeNull();

    commandHandler({ type: 'combat_ended', player: 'GM', payload: {}, timestamp: new Date().toISOString() });
    fixture.detectChanges();

    expect(component.rollModalRef).toBeNull();
    expect(component.deltaRollModalRef).toBeNull();
    expect(component.promptRoll).toBeFalse();
    expect(component.pendingDeltaDice).toBe(0);
  });

  // ── Verification: Force Roll Outstanding / any pendingRoll-false broadcast ─
  it('Verification: the modal closes the instant a broadcast reports pendingRoll: false, even with no clear_roll_prompt command', async () => {
    const hero = participant({
      id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 3, pendingRoll: true
    });
    stubModalOpen();
    await join(stateWith([hero]));
    expect(component.rollModalRef).not.toBeNull();

    // Simulate the broadcast that follows a GM "Force Roll Outstanding" -
    // diceIni now rolled, pendingRoll false - with no clear_roll_prompt
    // command modelled at all, isolating this specific closing path.
    component['applyIncomingState'](stateWith([
      participant({ id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 3, pendingRoll: false })
    ]));
    fixture.detectChanges();

    expect(component.rollModalRef).toBeNull();
    expect(component.promptRoll).toBeFalse();
  });

  // ── Scenario 5 (Several players) ────────────────────────────────────────
  it('Scenario 5: only this browser\'s own primaryCharacter can open the modal, never another player\'s', async () => {
    const mine = participant({
      id: 'p-mine', name: 'Mine', order: 1, ownerName: myToken(), initiativeDice: 3, pendingRoll: false
    });
    const someoneElses = participant({
      id: 'p-other', name: 'Someone Else', order: 2, ownerName: 'pl-someoneelse', initiativeDice: 3, pendingRoll: true
    });
    const opens = stubModalOpen();
    await join(stateWith([mine, someoneElses]));

    expect(opens.length).toBe(0);
    expect(component.rollModalRef).toBeNull();
  });

  // ── Scenario 6 (Delta after VR mode change) / AC 8 ──────────────────────
  it('Scenario 6 / AC 8: a VR mode change mid-pass opens the delta modal with the correct dice count and limits, not the main one', async () => {
    const decker = participant({
      id: 'p-1', name: 'Decker', order: 1, ownerName: myToken(), initiativeDice: 1, pendingRoll: false,
      isMatrix: true, jackedIn: true, vrMode: 'AR'
    });
    const opens = stubModalOpen();
    await join(stateWith([decker]));
    expect(opens.length).toBe(0); // already rolled, main modal must not appear

    const sendSpy = spyOn(sync, 'sendCommand');
    component.vrMode = 'hot-sim';
    component.confirmMode();

    // AR (1 die) -> Hot Sim (4 dice): delta of 3.
    expect(component.pendingDeltaDice).toBe(3);
    expect(opens.length).toBe(1);
    expect(opens[0].options).toEqual(jasmine.objectContaining({ backdrop: 'static', keyboard: false }));
    expect(component.rollModalRef).toBeNull(); // the main modal, still closed
    expect(component.deltaRollModalRef).not.toBeNull();

    component.onDeltaRollFromModal({ values: [6, 6, 6], rollAs: null });
    const submissions = commandsSentOfType(sendSpy, 'roll_submission');
    const deltaSubmission = submissions.find(s => s.payload?.['isDelta'] === true);
    expect(deltaSubmission?.payload).toEqual(jasmine.objectContaining({
      participantId: 'p-1', roll: 18, diceValues: [6, 6, 6], diceSum: 18, isDelta: true
    }));
    // Submission is immediate; QA fix round 2: the modal no longer closes
    // itself at all - it stays open showing the result until Done is pressed.
    expect(component.pendingDeltaDice).toBe(3);
    expect(component.deltaRollModalRef).not.toBeNull();
    expect(component.deltaRollAwaitingDone).toBeTrue();
    expect(component.deltaRollResultTotal).toBe(18);

    component.confirmDeltaRollDone();
    fixture.detectChanges();

    expect(component.pendingDeltaDice).toBe(0);
    expect(component.deltaRollModalRef).toBeNull();
  });

  // ── Fix round 4 (consistency follow-up): a mode switch that *loses* dice
  // now prompts the player the same way a gain already did, instead of the
  // server rolling and applying the loss automatically. ───────────────────
  describe('Fix round 4: a mode switch that loses dice prompts the player instead of resolving automatically', () => {
    it('Hot Sim -> AR opens the delta modal wording the loss, with the correct (positive) dice count and limits', async () => {
      const decker = participant({
        id: 'p-1', name: 'Decker', order: 1, ownerName: myToken(), initiativeDice: 4, pendingRoll: false,
        isMatrix: true, jackedIn: true, vrMode: 'hot-sim'
      });
      const opens = stubModalOpen();
      await join(stateWith([decker]));
      expect(opens.length).toBe(0); // already rolled, main modal must not appear

      const sendSpy = spyOn(sync, 'sendCommand');
      component.vrMode = 'AR';
      component.confirmMode();

      // Hot Sim (4 dice) -> AR (1 die, the client's own optimistic guess):
      // delta of -3.
      expect(component.pendingDeltaDice).toBe(-3);
      expect(component.isDeltaLoss).toBeTrue();
      expect(component.deltaDiceCount).toBe(3);
      expect(opens.length).toBe(1);
      expect(opens[0].options).toEqual(jasmine.objectContaining({ backdrop: 'static', keyboard: false }));
      expect(component.rollModalRef).toBeNull();
      expect(component.deltaRollModalRef).not.toBeNull();
      // `isDeltaLoss`/`deltaDiceCount` (asserted above) are exactly what the
      // modal template (player-view.component.html) branches its wording
      // and dice count on - not re-checked against rendered DOM here, since
      // `stubModalOpen()` never mounts the real template into `document`.

      // The roller submits a positive pip total either way - the GM tab
      // reads the sign from its own bookkeeping, never from this payload.
      component.onDeltaRollFromModal({ values: [5, 4, 2], rollAs: null });
      const submissions = commandsSentOfType(sendSpy, 'roll_submission');
      const deltaSubmission = submissions.find(s => s.payload?.['isDelta'] === true);
      expect(deltaSubmission?.payload).toEqual(jasmine.objectContaining({
        participantId: 'p-1', roll: 11, diceValues: [5, 4, 2], diceSum: 11, isDelta: true
      }));
      // QA fix round 2: stays open showing the result until Done, no timer.
      expect(component.pendingDeltaDice).toBe(-3);
      expect(component.deltaRollModalRef).not.toBeNull();
      expect(component.deltaRollAwaitingDone).toBeTrue();
      expect(component.deltaRollResultTotal).toBe(11);

      component.confirmDeltaRollDone();
      fixture.detectChanges();

      expect(component.pendingDeltaDice).toBe(0);
      expect(component.deltaRollModalRef).toBeNull();
    });

    it('a manually-typed loss total clamps to [deltaDiceCount, deltaDiceCount * 6], the same bounds shape as a gain', async () => {
      const decker = participant({
        id: 'p-1', name: 'Decker', order: 1, ownerName: myToken(), initiativeDice: 4, pendingRoll: false,
        isMatrix: true, jackedIn: true, vrMode: 'hot-sim'
      });
      stubModalOpen();
      await join(stateWith([decker]));
      const sendSpy = spyOn(sync, 'sendCommand');
      component.vrMode = 'AR';
      component.confirmMode();
      expect(component.pendingDeltaDice).toBe(-3);

      component.manualDeltaRoll = '999'; // above the 3-die max of 18
      component.submitDeltaRoll();

      const submissions = commandsSentOfType(sendSpy, 'roll_submission');
      const deltaSubmission = submissions.find(s => s.payload?.['isDelta'] === true);
      expect(deltaSubmission?.payload?.['roll']).toBe(18); // deltaDiceCount(3) * 6
      expect(component.pendingDeltaDice).toBe(0);
      expect(component.deltaRollModalRef).toBeNull();
    });

    // Scope guard: jacking out entirely stays automatic (Xavier's decision)
    // - only a mode-*to*-mode switch prompts. `jackOut()` never calls
    // `applyInitiativeRollLogic()` at all.
    it('jacking out entirely never opens the delta modal - the server applies that loss on its own', async () => {
      const decker = participant({
        id: 'p-1', name: 'Decker', order: 1, ownerName: myToken(), initiativeDice: 4, pendingRoll: false,
        isMatrix: true, jackedIn: true, vrMode: 'hot-sim'
      });
      const opens = stubModalOpen();
      await join(stateWith([decker]));

      component.jackOut();

      expect(opens.length).toBe(0);
      expect(component.pendingDeltaDice).toBe(0);
      expect(component.deltaRollModalRef).toBeNull();
    });
  });

  // ── Item D: the delta prompt is recoverable from state, not only from the
  // live VR-mode-change event (a refresh mid-delta-roll used to lose it) ──
  describe('Item D: the delta modal survives a refresh via SharedParticipantState.pendingDeltaDice', () => {
    it('a fresh join/reconnect with pendingDeltaDice > 0 on the wire opens the delta modal directly', async () => {
      const decker = participant({
        id: 'p-1', name: 'Decker', order: 1, ownerName: myToken(), initiativeDice: 4, pendingRoll: false,
        isMatrix: true, jackedIn: true, vrMode: 'hot-sim', pendingDeltaDice: 3
      });
      const opens = stubModalOpen();
      await join(stateWith([decker]));

      expect(component.pendingDeltaDice).toBe(3);
      expect(opens.length).toBe(1);
      expect(component.deltaRollModalRef).not.toBeNull();
      expect(component.rollModalRef).toBeNull(); // never the main modal
    });

    it('does not zero out an already-open local delta prompt because of a stale wire 0 in between', async () => {
      const decker = participant({
        id: 'p-1', name: 'Decker', order: 1, ownerName: myToken(), initiativeDice: 1, pendingRoll: false,
        isMatrix: true, jackedIn: true, vrMode: 'AR'
      });
      stubModalOpen();
      await join(stateWith([decker]));
      // Local, optimistic set - as `applyInitiativeRollLogic` does right
      // after sending `configure_deck`, before any confirming broadcast.
      component.vrMode = 'hot-sim';
      component.confirmMode();
      expect(component.pendingDeltaDice).toBe(3);
      expect(component.deltaRollModalRef).not.toBeNull();

      // An unrelated broadcast arrives before the GM's own confirming one -
      // this decker's `pendingDeltaDice` is still absent on this snapshot.
      component['applyIncomingState'](stateWith([
        participant({
          id: 'p-1', name: 'Decker', order: 1, ownerName: myToken(), initiativeDice: 1, pendingRoll: false,
          isMatrix: true, jackedIn: true, vrMode: 'AR'
        })
      ]));

      expect(component.pendingDeltaDice).toBe(3);
      expect(component.deltaRollModalRef).not.toBeNull();
    });

    // Fix round 4 (consistency follow-up): the same survival, for a
    // *negative* (loss) pendingDeltaDice - a refresh/reconnect must recover
    // "you owe a lost-dice roll" exactly as reliably as "you owe a gained-
    // dice roll" always has.
    it('a fresh join/reconnect with a negative pendingDeltaDice on the wire opens the delta modal, worded as a loss', async () => {
      const decker = participant({
        id: 'p-1', name: 'Decker', order: 1, ownerName: myToken(), initiativeDice: 1, pendingRoll: false,
        isMatrix: true, jackedIn: true, vrMode: 'AR', pendingDeltaDice: -3
      });
      const opens = stubModalOpen();
      await join(stateWith([decker]));

      expect(component.pendingDeltaDice).toBe(-3);
      expect(component.isDeltaLoss).toBeTrue();
      expect(component.deltaDiceCount).toBe(3);
      expect(opens.length).toBe(1);
      expect(component.deltaRollModalRef).not.toBeNull();
      expect(component.rollModalRef).toBeNull(); // never the main modal
    });

    it("the server's authoritative negative delta overwrites this client's own (wrong-sign) optimistic guess", async () => {
      const decker = participant({
        id: 'p-1', name: 'Decker', order: 1, ownerName: myToken(), initiativeDice: 1, pendingRoll: false,
        isMatrix: true, jackedIn: true, vrMode: 'AR'
      });
      stubModalOpen();
      await join(stateWith([decker]));
      // Force a stale, wrong-sign local guess into place - proving the
      // reconciliation is not merely "ignore anything already positive".
      component.pendingDeltaDice = 2;

      component['applyIncomingState'](stateWith([
        participant({
          id: 'p-1', name: 'Decker', order: 1, ownerName: myToken(), initiativeDice: 1, pendingRoll: false,
          isMatrix: true, jackedIn: true, vrMode: 'AR', pendingDeltaDice: -3
        })
      ]));

      expect(component.pendingDeltaDice).toBe(-3);
    });
  });

  // ── Fix round 3: the GM converting the decker to an Astral projector must
  // not strand the delta modal open with a stale count ──────────────────
  describe('Fix round 3: an owed delta note must not survive the GM swapping the decker to Astral', () => {
    it('a broadcast reporting isMatrix no longer true closes the delta modal, even though it was open with a positive count', async () => {
      // Same participant id throughout - `promoteToAstralParticipant` is an
      // in-place type swap on the GM side, so the player-facing id is
      // unchanged even though the underlying object was replaced.
      const decker = participant({
        id: 'p-1', name: 'Decker', order: 1, ownerName: myToken(), initiativeDice: 1, pendingRoll: false,
        isMatrix: true, jackedIn: true, vrMode: 'AR'
      });
      stubModalOpen();
      await join(stateWith([decker]));
      // Optimistic local set, as `applyInitiativeRollLogic` does right after
      // a VR-mode switch, before any confirming broadcast.
      component.vrMode = 'hot-sim';
      component.confirmMode();
      expect(component.pendingDeltaDice).toBe(3);
      expect(component.deltaRollModalRef).not.toBeNull();

      // The GM promotes this participant to Astral before the delta was ever
      // rolled: `pendingDeltaDice` drops off the wire (absent -> 0) AND
      // `isMatrix` drops off with it - the participant is no longer a decker
      // at all.
      component['applyIncomingState'](stateWith([
        participant({ id: 'p-1', name: 'Decker', order: 1, ownerName: myToken(), initiativeDice: 3, pendingRoll: false, isAstral: true })
      ]));

      expect(component.pendingDeltaDice).toBe(0);
      expect(component.deltaRollModalRef).toBeNull();
    });

    it('does not regress the existing stale-wire-0 protection when isMatrix stays true throughout', async () => {
      // Same scenario as the "Item D" stale-wire-0 test above, re-asserted
      // here as the paired negative case for this fix: the new `isMatrix`
      // check must only force-close on an actual type change, not on every
      // in-between broadcast that has not caught up yet.
      const decker = participant({
        id: 'p-1', name: 'Decker', order: 1, ownerName: myToken(), initiativeDice: 1, pendingRoll: false,
        isMatrix: true, jackedIn: true, vrMode: 'AR'
      });
      stubModalOpen();
      await join(stateWith([decker]));
      component.vrMode = 'hot-sim';
      component.confirmMode();
      expect(component.pendingDeltaDice).toBe(3);

      component['applyIncomingState'](stateWith([
        participant({
          id: 'p-1', name: 'Decker', order: 1, ownerName: myToken(), initiativeDice: 1, pendingRoll: false,
          isMatrix: true, jackedIn: true, vrMode: 'AR'
        })
      ]));

      expect(component.pendingDeltaDice).toBe(3);
      expect(component.deltaRollModalRef).not.toBeNull();
    });
  });

  // ── Round 2 ordering assumption: the `askedToRoll: true` state push and
  // the `request_rolls` command are sent as two separate socket messages,
  // and the spec's own "Proposed approach" relies on per-socket delivery
  // order to land the state first. This proves the claimed self-heal holds
  // even when a socket delivers them the other way around. ───────────────
  it('Round 2 ordering assumption: request_rolls arriving before the state push still opens on the very next broadcast', async () => {
    const hero = participant({
      id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 3, pendingRoll: true,
      askedToRoll: false
    });
    let commandHandler!: (c: SessionCommand) => void;
    spyOn(sync, 'onCommand').and.callFake(h => { commandHandler = h; });
    // Joins not yet asked - the state push that will set it true has not
    // arrived on this socket yet.
    await join(stateWith([hero]));
    const opens = stubModalOpen();

    // Wrong order: the one-shot command arrives before the state broadcast
    // that actually flips `askedToRoll` to `true`.
    commandHandler({ type: 'request_rolls', player: 'GM', payload: {}, timestamp: new Date().toISOString() });
    fixture.detectChanges();
    // `syncRollModal()` re-derives from `this.state`, which still reports
    // `askedToRoll: false` for this character at this point - correctly
    // does not open yet.
    expect(opens.length).toBe(0);
    expect(component.rollModalRef).toBeNull();

    // The state push lands right after - the self-heal the spec relies on.
    component['applyIncomingState'](stateWith([asked(hero)]));
    fixture.detectChanges();

    expect(opens.length).toBe(1);
    expect(component.rollModalRef).not.toBeNull();
    expect(component.promptRoll).toBeTrue();
  });

  // ── QA fix round: the item E echo is removed ────────────────────────────
  // Superseded design decision - the original spec's "Item E" had the modal
  // roll echo onto the page-level roller and also broadcast a `dice_roll`
  // command. Xavier reported this reads at the table as "the dice rolled on
  // the main page" instead of inside the modal he pressed the button in, and
  // asked for the echo removed outright (briefs/player-initiative-prompt-spec.md
  // QA fix round, defects 2 and 3). `dice_roll` is also what let the GM log a
  // second, generic roll line for the same roll - see the "exactly one log
  // line" describe block below.
  describe('QA fix round: no page-level echo and no dice_roll broadcast for an initiative roll', () => {
    it('onInitiativeRollFromModal does not touch ownDiceRoll and sends no dice_roll, only one roll_submission', async () => {
      const hero = participant({
        id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 2, pendingRoll: true
      });
      await join(stateWith([hero]));
      const sendSpy = spyOn(sync, 'sendCommand');

      component.onInitiativeRollFromModal({ values: [3, 4], rollAs: null });

      expect(component.ownDiceRoll).toBeNull();
      expect(commandsSentOfType(sendSpy, 'dice_roll').length).toBe(0);
      expect(commandsSentOfType(sendSpy, 'roll_submission').length).toBe(1);
      // Exactly one command goes out for the roll at all - the generic
      // `dice_roll` line the GM used to log alongside the correct
      // initiative-roll line is gone, not merely deduplicated.
      expect(sendSpy).toHaveBeenCalledTimes(1);
    });

    it('onDeltaRollFromModal does not touch ownDiceRoll and sends no dice_roll, only one roll_submission', async () => {
      const decker = participant({
        id: 'p-1', name: 'Decker', order: 1, ownerName: myToken(), initiativeDice: 1, pendingRoll: false
      });
      await join(stateWith([decker]));
      component.pendingDeltaDice = 2;
      component['openDeltaRollModal']();
      const sendSpy = spyOn(sync, 'sendCommand');

      component.onDeltaRollFromModal({ values: [5, 6], rollAs: null });

      expect(component.ownDiceRoll).toBeNull();
      expect(commandsSentOfType(sendSpy, 'dice_roll').length).toBe(0);
      const submissions = commandsSentOfType(sendSpy, 'roll_submission');
      expect(submissions.length).toBe(1);
      expect(sendSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ── QA fix round 2: the modal stays open after an on-screen roll, showing
  // the settled result, until the player presses Done - replacing the
  // previous round's timed auto-close, which Xavier hand-tested and
  // rejected: the modal closed itself the instant the roll animation
  // finished, so he never actually saw the result
  // (briefs/player-initiative-prompt-spec.md). ────────────────────────────
  describe('QA fix round 2: modal stays open after rolling, showing the result, until Done is pressed', () => {
    it('main modal: after rolling, shows the total, hides manual entry, disables the Roll button, and does not close on its own', fakeAsync(() => {
      const hero = participant({
        id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 2, pendingRoll: true
      });
      void join(stateWith([hero]));
      tick();
      fixture.detectChanges();

      component.onInitiativeRollFromModal({ values: [3, 4], rollAs: null });
      fixture.detectChanges();

      expect(component.rollModalRef).not.toBeNull();
      expect(component.rollAwaitingDone).toBeTrue();
      expect(component.rollResultTotal).toBe(7);
      // The result is on screen...
      const resultEl = document.querySelector('[data-testid="roll-modal-result"]') as HTMLElement;
      expect(resultEl?.textContent).toContain('7');
      // QA fix round 3 (Xavier hands-on test): the result line and the
      // "GM requested initiative rolls..." banner both draw their own light
      // background, and used to have no `color` of their own, so the text
      // fell back to the surrounding ng-bootstrap modal's inherited theme
      // colour (the cyberdeck theme's pale mint-green `--cd-text`) - pale
      // text on a pale panel, reported as unreadable "white on white". Each
      // must resolve to its own explicit dark colour, not the modal's.
      const modalBodyColor = getComputedStyle(resultEl.closest('.modal-body') as Element).color;
      const resultColor = getComputedStyle(resultEl).color;
      expect(resultColor).not.toBe(modalBodyColor);
      expect(resultColor).toBe('rgb(22, 101, 52)'); // #166534, explicit in player-view.component.css
      const bannerEl = document.querySelector('.roll-banner') as HTMLElement;
      expect(bannerEl).withContext('roll-banner still rendered while awaiting Done').not.toBeNull();
      const bannerColor = getComputedStyle(bannerEl).color;
      expect(bannerColor).not.toBe(modalBodyColor);
      expect(bannerColor).toBe('rgb(30, 58, 138)'); // #1e3a8a, explicit in player-view.component.css
      // ...manual entry is gone entirely...
      expect(document.querySelector('[data-testid="roll-modal-manual-input"]')).toBeNull();
      expect(document.querySelector('[data-testid="roll-modal-manual-submit"]')).toBeNull();
      // ...and the roller's own Roll button is disabled, so it cannot be
      // pressed again for a second submission.
      const rollBtn = document.querySelector(
        '[data-testid="roll-modal-dice-roller"] [data-testid="dice-roller-roll-button"]'
      ) as HTMLButtonElement;
      expect(rollBtn.disabled).toBeTrue();
      // Done is the only affordance offered.
      expect(document.querySelector('[data-testid="roll-modal-done"]')).not.toBeNull();

      // Nothing about the passage of time closes it - no timer is armed
      // (the previous round's `ROLL_ANIMATION_MS` deferred close is gone).
      tick(DiceRollerComponent.ROLL_ANIMATION_MS + 5000);
      fixture.detectChanges();
      expect(component.rollModalRef).not.toBeNull();
      expect(component.rollAwaitingDone).toBeTrue();

      // Done closes it.
      component.confirmRollDone();
      fixture.detectChanges();
      expect(component.rollModalRef).toBeNull();
      expect(component.rollAwaitingDone).toBeFalse();
      expect(component.rollResultTotal).toBeNull();
    }));

    it('main modal: a real click on Done closes it', async () => {
      const hero = participant({
        id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 2, pendingRoll: true
      });
      await join(stateWith([hero]));
      component.onInitiativeRollFromModal({ values: [3, 4], rollAs: null });
      // `NgbModal`'s window is attached directly to `ApplicationRef`, not as
      // a descendant of this fixture's own component tree - a real click
      // triggers Angular's zone-based app-wide change detection, but calling
      // the handler directly (as this test does) does not, so
      // `fixture.detectChanges()` alone never reaches the modal's own view.
      // `ApplicationRef.tick()` is what a real click would have triggered.
      TestBed.inject(ApplicationRef).tick();

      const doneBtn = document.querySelector('[data-testid="roll-modal-done"]') as HTMLButtonElement;
      expect(doneBtn).withContext('rendered Done button').not.toBeNull();
      doneBtn.click();
      fixture.detectChanges();

      expect(component.rollModalRef).toBeNull();
    });

    it('delta modal: after rolling, shows the total, hides manual entry, disables the Roll button, and does not close on its own', fakeAsync(() => {
      const decker = participant({
        id: 'p-1', name: 'Decker', order: 1, ownerName: myToken(), initiativeDice: 1, pendingRoll: false
      });
      void join(stateWith([decker]));
      tick();
      fixture.detectChanges();
      component.pendingDeltaDice = 2;
      component['openDeltaRollModal']();
      fixture.detectChanges();

      component.onDeltaRollFromModal({ values: [5, 6], rollAs: null });
      // Same reasoning as the main modal's real-click test above -
      // `NgbModal`'s window is attached to `ApplicationRef`, not this
      // fixture's tree, so a direct method call (not a real DOM event) needs
      // an explicit app-wide tick to reach it.
      TestBed.inject(ApplicationRef).tick();
      fixture.detectChanges();

      expect(component.deltaRollModalRef).not.toBeNull();
      expect(component.deltaRollAwaitingDone).toBeTrue();
      expect(component.deltaRollResultTotal).toBe(11);
      const resultEl = document.querySelector('[data-testid="delta-roll-modal-result"]') as HTMLElement;
      expect(resultEl?.textContent).toContain('11');
      // QA fix round 3: same unreadable-text defect and same fix as the main
      // roll modal's result line above - the delta modal reuses
      // `.roll-result-summary`, so this guards both instances at once.
      expect(getComputedStyle(resultEl).color).toBe('rgb(22, 101, 52)'); // #166534
      expect(document.querySelector('[data-testid="delta-roll-modal-manual-input"]')).toBeNull();
      expect(document.querySelector('[data-testid="delta-roll-modal-manual-submit"]')).toBeNull();
      const rollBtn = document.querySelector(
        '[data-testid="delta-roll-modal-dice-roller"] [data-testid="dice-roller-roll-button"]'
      ) as HTMLButtonElement;
      expect(rollBtn.disabled).toBeTrue();

      tick(DiceRollerComponent.ROLL_ANIMATION_MS + 5000);
      fixture.detectChanges();
      expect(component.deltaRollModalRef).not.toBeNull();

      component.confirmDeltaRollDone();
      fixture.detectChanges();
      expect(component.deltaRollModalRef).toBeNull();
      expect(component.pendingDeltaDice).toBe(0);
    }));

    it('Done does not send a second roll_submission - the roll was already submitted at roll time', async () => {
      const hero = participant({
        id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 2, pendingRoll: true
      });
      await join(stateWith([hero]));
      const sendSpy = spyOn(sync, 'sendCommand');

      component.onInitiativeRollFromModal({ values: [3, 4], rollAs: null });
      expect(commandsSentOfType(sendSpy, 'roll_submission').length).toBe(1);

      component.confirmRollDone();

      expect(commandsSentOfType(sendSpy, 'roll_submission').length).toBe(1);
    });

    // ── External closes still win immediately, even while a result is
    // showing and waiting for Done (brief: "External closes must still win
    // immediately"). ─────────────────────────────────────────────────────
    describe('external closes win immediately even while waiting for Done', () => {
      it('clear_roll_prompt', async () => {
        const hero = participant({
          id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 2, pendingRoll: true
        });
        let commandHandler!: (c: SessionCommand) => void;
        spyOn(sync, 'onCommand').and.callFake(h => { commandHandler = h; });
        await join(stateWith([hero]));
        component.onInitiativeRollFromModal({ values: [3, 4], rollAs: null });
        expect(component.rollAwaitingDone).toBeTrue();

        commandHandler({ type: 'clear_roll_prompt', player: 'GM', payload: {}, timestamp: new Date().toISOString() });
        fixture.detectChanges();

        expect(component.rollModalRef).toBeNull();
        expect(component.rollAwaitingDone).toBeFalse();
      });

      it('combat_ended', async () => {
        const hero = participant({
          id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 2, pendingRoll: true
        });
        let commandHandler!: (c: SessionCommand) => void;
        spyOn(sync, 'onCommand').and.callFake(h => { commandHandler = h; });
        await join(stateWith([hero]));
        component.onInitiativeRollFromModal({ values: [3, 4], rollAs: null });
        expect(component.rollModalRef).not.toBeNull();

        commandHandler({ type: 'combat_ended', player: 'GM', payload: {}, timestamp: new Date().toISOString() });
        fixture.detectChanges();

        expect(component.rollModalRef).toBeNull();
        expect(component.rollAwaitingDone).toBeFalse();
      });

      it('the character going ooc', async () => {
        const hero = participant({
          id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 2, pendingRoll: true
        });
        await join(stateWith([hero]));
        component.onInitiativeRollFromModal({ values: [3, 4], rollAs: null });
        expect(component.rollAwaitingDone).toBeTrue();

        component['applyIncomingState'](stateWith([
          participant({ id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 2, pendingRoll: false, ooc: true })
        ]));
        fixture.detectChanges();

        expect(component.rollModalRef).toBeNull();
        expect(component.rollAwaitingDone).toBeFalse();
      });

      it('the combat turn ending (started -> not started)', async () => {
        const hero = participant({
          id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 2, pendingRoll: true
        });
        await join(stateWith([hero]));
        component.onInitiativeRollFromModal({ values: [3, 4], rollAs: null });
        expect(component.rollAwaitingDone).toBeTrue();

        component['applyIncomingState'](stateWith([hero], { started: false }));
        fixture.detectChanges();

        expect(component.rollModalRef).toBeNull();
        expect(component.rollAwaitingDone).toBeFalse();
      });

      it('session closed', async () => {
        const hero = participant({
          id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 2, pendingRoll: true
        });
        let closedHandler!: (p: { room: string; persisted?: boolean }) => void;
        spyOn(sync, 'onSessionClosed').and.callFake(h => { closedHandler = h; });
        await join(stateWith([hero]));
        component.onInitiativeRollFromModal({ values: [3, 4], rollAs: null });
        expect(component.rollAwaitingDone).toBeTrue();

        closedHandler({ room: 'ABC123', persisted: true });
        fixture.detectChanges();

        expect(component.rollModalRef).toBeNull();
      });

      it('losing the primary character entirely', async () => {
        const hero = participant({
          id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 2, pendingRoll: true
        });
        await join(stateWith([hero]));
        component.onInitiativeRollFromModal({ values: [3, 4], rollAs: null });
        expect(component.rollAwaitingDone).toBeTrue();

        component['applyIncomingState'](stateWith([]));
        fixture.detectChanges();

        expect(component.rollModalRef).toBeNull();
        expect(component.rollAwaitingDone).toBeFalse();
      });

      // Same list, for the delta modal.
      it('delta modal: clear_roll_prompt has no dedicated handler, but combat_ended still closes it while awaiting Done', async () => {
        const decker = participant({
          id: 'p-1', name: 'Decker', order: 1, ownerName: myToken(), initiativeDice: 1, pendingRoll: false
        });
        let commandHandler!: (c: SessionCommand) => void;
        spyOn(sync, 'onCommand').and.callFake(h => { commandHandler = h; });
        await join(stateWith([decker]));
        component.pendingDeltaDice = 2;
        component['openDeltaRollModal']();
        component.onDeltaRollFromModal({ values: [5, 6], rollAs: null });
        expect(component.deltaRollAwaitingDone).toBeTrue();

        commandHandler({ type: 'combat_ended', player: 'GM', payload: {}, timestamp: new Date().toISOString() });
        fixture.detectChanges();

        expect(component.deltaRollModalRef).toBeNull();
        expect(component.deltaRollAwaitingDone).toBeFalse();
        expect(component.pendingDeltaDice).toBe(0);
      });

      it('delta modal: the character going ooc closes it while awaiting Done', async () => {
        const decker = participant({
          id: 'p-1', name: 'Decker', order: 1, ownerName: myToken(), initiativeDice: 1, pendingRoll: false
        });
        await join(stateWith([decker]));
        component.pendingDeltaDice = 2;
        component['openDeltaRollModal']();
        component.onDeltaRollFromModal({ values: [5, 6], rollAs: null });
        expect(component.deltaRollAwaitingDone).toBeTrue();

        component['applyIncomingState'](stateWith([
          participant({ id: 'p-1', name: 'Decker', order: 1, ownerName: myToken(), initiativeDice: 1, pendingRoll: false, ooc: true })
        ]));
        fixture.detectChanges();

        expect(component.deltaRollModalRef).toBeNull();
        expect(component.deltaRollAwaitingDone).toBeFalse();
      });
    });

    // ── The key design decision this round makes explicit: an ORDINARY
    // broadcast reporting pendingRoll: false for the primary character -
    // exactly what happens once the GM's side applies the very roll this
    // player just sent, with no clear_roll_prompt/combat_ended/ooc/turn-
    // boundary signal attached - must NOT auto-close the modal while a
    // result is still waiting for Done. Only the explicit closes above (and
    // Done itself) end this state. See `syncRollModal()`'s own doc comment
    // for why this does not conflict with "a GM force-roll must still close
    // it right away": a force-roll cannot target a participant whose own
    // submission has already cleared `pendingRoll` server-side. ───────────
    it('an ordinary pendingRoll: false broadcast (the confirmation of this player\'s own roll) does NOT close the modal while awaiting Done', async () => {
      const hero = participant({
        id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 2, pendingRoll: true
      });
      await join(stateWith([hero]));
      component.onInitiativeRollFromModal({ values: [3, 4], rollAs: null });
      expect(component.rollAwaitingDone).toBeTrue();

      // The GM's broadcast confirming the roll this player just sent -
      // pendingRoll now false, nothing else changed.
      component['applyIncomingState'](stateWith([
        participant({ id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 2, pendingRoll: false })
      ]));
      fixture.detectChanges();

      expect(component.rollModalRef).not.toBeNull();
      expect(component.rollAwaitingDone).toBeTrue();
      expect(component.rollResultTotal).toBe(7);

      // Done still works normally afterwards.
      component.confirmRollDone();
      fixture.detectChanges();
      expect(component.rollModalRef).toBeNull();
    });

    // ── A refresh/reconnect after rolling but before pressing Done must not
    // reopen the modal - the roll is already recorded, so `pendingRoll` is
    // already false in the fresh state a reload/reconnect receives. This is
    // a brand-new component instance (as a real page refresh would be), so
    // `rollAwaitingDone` starts false regardless of what the previous page
    // instance held. ─────────────────────────────────────────────────────
    it('a refresh/reconnect after rolling but before Done does not reopen the modal', async () => {
      const hero = participant({
        id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 2, pendingRoll: false
      });
      const opens = stubModalOpen();
      await join(stateWith([hero]));

      expect(opens.length).toBe(0);
      expect(component.rollModalRef).toBeNull();
      expect(component.rollAwaitingDone).toBeFalse();
      expect(component.promptRoll).toBeFalse();
    });
  });

  // ── AC 9 ─────────────────────────────────────────────────────────────────
  it('AC 9: the chime fires only when the modal newly opens, not on every unrelated broadcast while it stays open', async () => {
    const hero = participant({
      id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 3, pendingRoll: true
    });
    stubModalOpen();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nudgeSpy = spyOn(component as any, 'triggerRollNudge').and.callThrough();
    await join(stateWith([hero])); // opens the modal once

    expect(nudgeSpy).toHaveBeenCalledTimes(1);

    // An unrelated broadcast (e.g. the GM sorting the order) while the
    // player still has not rolled: pendingRoll is still true, the modal
    // stays open, and openRollModal() is a no-op - no second chime.
    component['applyIncomingState'](stateWith([
      participant({ id: 'p-1', name: 'Hero', order: 2, ownerName: myToken(), initiativeDice: 3, pendingRoll: true })
    ]));
    expect(nudgeSpy).toHaveBeenCalledTimes(1);
  });

  // ── AC 10 ────────────────────────────────────────────────────────────────
  it('AC 10: the page-level dice roller keeps sending a plain dice_roll, unaffected by the initiative modal', async () => {
    const hero = participant({
      id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 3, pendingRoll: false
    });
    await join(stateWith([hero]));
    const sendSpy = spyOn(sync, 'sendCommand');

    component.onPlayerDiceRolled({ values: [3, 4], rollAs: null });

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ type: 'dice_roll' }));
  });

  // ── Turn boundary / session closed also close both modals ──────────────
  it('combat started -> not started closes both modals and clears the delta count', async () => {
    const hero = participant({
      id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 3, pendingRoll: true
    });
    stubModalOpen();
    await join(stateWith([hero]));
    component.pendingDeltaDice = 2;
    component['openDeltaRollModal']();
    expect(component.rollModalRef).not.toBeNull();
    expect(component.deltaRollModalRef).not.toBeNull();

    component['applyIncomingState'](stateWith([hero], { started: false }));
    fixture.detectChanges();

    expect(component.rollModalRef).toBeNull();
    expect(component.deltaRollModalRef).toBeNull();
    expect(component.pendingDeltaDice).toBe(0);
  });

  it('session closed closes both modals', async () => {
    const hero = participant({
      id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 3, pendingRoll: true
    });
    stubModalOpen();
    let closedHandler!: (p: { room: string; persisted?: boolean }) => void;
    spyOn(sync, 'onSessionClosed').and.callFake(h => { closedHandler = h; });
    await join(stateWith([hero]));
    component.pendingDeltaDice = 2;
    component['openDeltaRollModal']();
    expect(component.rollModalRef).not.toBeNull();
    expect(component.deltaRollModalRef).not.toBeNull();

    closedHandler({ room: 'ABC123', persisted: true });
    fixture.detectChanges();

    expect(component.rollModalRef).toBeNull();
    expect(component.deltaRollModalRef).toBeNull();
  });

  // ── Fix round defect 1: "Out-of-combat trap" ────────────────────────────
  // `pendingRoll` is just `diceIni <= 0` (ARCHITECTURE.md §1/§7) and takes no
  // account of `ooc` - the GM's "Leave Combat" does not touch `diceIni`, so
  // without an explicit `ooc` check the non-dismissible modal would never
  // close for a character benched before it rolled.
  describe('Fix round defect 1: out-of-combat trap', () => {
    it('a primary character marked ooc before rolling never has the modal opened, even though pendingRoll is still true', async () => {
      const hero = participant({
        id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 3, pendingRoll: true, ooc: true
      });
      const opens = stubModalOpen();
      await join(stateWith([hero]));

      expect(opens.length).toBe(0);
      expect(component.rollModalRef).toBeNull();
      expect(component.promptRoll).toBeFalse();
    });

    it('the main modal closes the instant a broadcast marks the primary character ooc, with pendingRoll still true', async () => {
      const hero = participant({
        id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 3, pendingRoll: true
      });
      stubModalOpen();
      await join(stateWith([hero]));
      expect(component.rollModalRef).not.toBeNull();

      component['applyIncomingState'](stateWith([
        participant({ id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 3, pendingRoll: true, ooc: true })
      ]));

      expect(component.rollModalRef).toBeNull();
      expect(component.promptRoll).toBeFalse();
    });

    it('the delta ("extra dice") modal closes when the primary character goes ooc mid-delta-roll', async () => {
      const decker = participant({
        id: 'p-1', name: 'Decker', order: 1, ownerName: myToken(), initiativeDice: 1, pendingRoll: false
      });
      stubModalOpen();
      await join(stateWith([decker]));
      component.pendingDeltaDice = 3;
      component['openDeltaRollModal']();
      expect(component.deltaRollModalRef).not.toBeNull();

      component['applyIncomingState'](stateWith([
        participant({ id: 'p-1', name: 'Decker', order: 1, ownerName: myToken(), initiativeDice: 1, pendingRoll: false, ooc: true })
      ]));

      expect(component.deltaRollModalRef).toBeNull();
      expect(component.pendingDeltaDice).toBe(0);
    });

    it('the modal closes if the primary character is removed from the encounter entirely (no ownParticipants left)', async () => {
      const hero = participant({
        id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 3, pendingRoll: true
      });
      stubModalOpen();
      await join(stateWith([hero]));
      expect(component.rollModalRef).not.toBeNull();

      // Hero is gone from the encounter altogether - not just OOC.
      component['applyIncomingState'](stateWith([]));

      expect(component.primaryCharacter).toBeNull();
      expect(component.rollModalRef).toBeNull();
      expect(component.promptRoll).toBeFalse();
    });

    it('the modal follows ownership when it is reassigned away from the character it was opened for', async () => {
      // Two characters owned by this player: Hero (needs to roll, opens the
      // modal) and Second (already rolled). If ownership of Hero is released
      // (e.g. GM reassigns/releases it) so that Second becomes the new
      // ownParticipants[0]/primaryCharacter, the modal must not keep
      // referring to Hero, who this player no longer controls.
      const hero = participant({
        id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 3, pendingRoll: true
      });
      const second = participant({
        id: 'p-2', name: 'Second', order: 2, ownerName: myToken(), initiativeDice: 2, pendingRoll: false
      });
      stubModalOpen();
      await join(stateWith([hero, second]));
      expect(component.primaryCharacter?.id).toBe('p-1');
      expect(component.rollModalRef).not.toBeNull();

      // Hero's ownership is released; Second (already rolled) is now the
      // only, and therefore primary, owned character.
      component['applyIncomingState'](stateWith([
        participant({ id: 'p-1', name: 'Hero', order: 1, initiativeDice: 3, pendingRoll: true }),
        participant({ id: 'p-2', name: 'Second', order: 2, ownerName: myToken(), initiativeDice: 2, pendingRoll: false })
      ]));

      expect(component.primaryCharacter?.id).toBe('p-2');
      expect(component.rollModalRef).toBeNull();
      expect(component.promptRoll).toBeFalse();
    });
  });

  // ── Not dismissible (Xavier's resolved Open Decision 2) ─────────────────
  it('OD2: the modal is opened with backdrop "static" and keyboard false - not dismissible by click-away or Escape', async () => {
    const hero = participant({
      id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 3, pendingRoll: true
    });
    const opens = stubModalOpen();
    await join(stateWith([hero]));

    expect(opens.length).toBe(1);
    expect(opens[0].options).toEqual(jasmine.objectContaining({ backdrop: 'static', keyboard: false }));
  });

  // ── Fix round defect 4: scrollable on a small screen ────────────────────
  it('defect 4: both roll modals are opened with scrollable: true, so the body scrolls on a small screen', async () => {
    const decker = participant({
      id: 'p-1', name: 'Decker', order: 1, ownerName: myToken(), initiativeDice: 1, pendingRoll: true
    });
    const opens = stubModalOpen();
    await join(stateWith([decker]));
    expect(opens[0].options).toEqual(jasmine.objectContaining({ scrollable: true }));

    component.pendingDeltaDice = 2;
    component['openDeltaRollModal']();
    expect(opens[1].options).toEqual(jasmine.objectContaining({ scrollable: true }));
  });

  // ── Fix round defect 3: both modals dismissed on component teardown ─────
  it('defect 3: ngOnDestroy dismisses both roll modals alongside existing cleanup', async () => {
    const hero = participant({
      id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 3, pendingRoll: true
    });
    stubModalOpen();
    await join(stateWith([hero]));
    component.pendingDeltaDice = 2;
    component['openDeltaRollModal']();
    const rollDismiss = component.rollModalRef!.dismiss as jasmine.Spy;
    const deltaDismiss = component.deltaRollModalRef!.dismiss as jasmine.Spy;

    component.ngOnDestroy();

    expect(rollDismiss).toHaveBeenCalled();
    expect(deltaDismiss).toHaveBeenCalled();
    expect(component.rollModalRef).toBeNull();
    expect(component.deltaRollModalRef).toBeNull();
  });

  // ── Real-DOM integration: the modal actually renders and its Roll button
  // actually drives submission (matching this repo's D10 convention of not
  // trusting a wired handler unless a real click exercises it). ──────────
  describe('Real NgbModal rendering', () => {
    it('a real click on the modal roller\'s Roll button submits roll_submission with no manual copy step', async () => {
      const hero = participant({
        id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 2, pendingRoll: true
      });
      await join(stateWith([hero]));
      fixture.detectChanges();

      const sendSpy = spyOn(sync, 'sendCommand');
      expect(document.querySelector('[data-testid="roll-modal"]'))
        .withContext('rendered roll modal').not.toBeNull();
      const rollBtn = document.querySelector(
        '[data-testid="roll-modal-dice-roller"] [data-testid="dice-roller-roll-button"]'
      ) as HTMLButtonElement | null;
      expect(rollBtn).withContext('rendered Roll button inside the roll modal').not.toBeNull();

      rollBtn!.click();
      fixture.detectChanges();

      const submissions = commandsSentOfType(sendSpy, 'roll_submission');
      expect(submissions.length).toBe(1);
      expect(submissions[0].payload?.['participantId']).toBe('p-1');
      // No close button, no dismiss affordance rendered at all.
      expect(document.querySelector('[data-testid="roll-modal"] .btn-close')).toBeNull();
    });

    it('there is no close button and no dismiss affordance while the modal is open', async () => {
      const hero = participant({
        id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 2, pendingRoll: true
      });
      await join(stateWith([hero]));
      fixture.detectChanges();

      expect(document.querySelector('[data-testid="roll-modal"]')).not.toBeNull();
      expect(document.querySelector('.modal-content .btn-close')).toBeNull();
      expect(document.querySelector('.modal-content .modal-footer')).toBeNull();

      // Cleanup: this test never submits, so the (deliberately non-
      // dismissible) modal would otherwise stay mounted on `document.body`
      // and bleed into the next test's DOM queries.
      component['closeRollModal']();
      fixture.detectChanges();
    });

    // ── QA fix round defect 1: "the roll modal must show only the player's
    // own roll, not the Other Players list" ──────────────────────────────
    it('the main roll modal renders "Your Roll" but never renders the "Other Players" section', async () => {
      const hero = participant({
        id: 'p-1', name: 'Hero', order: 1, ownerName: myToken(), initiativeDice: 2, pendingRoll: true
      });
      await join(stateWith([hero]));
      fixture.detectChanges();

      const modalEl = document.querySelector('[data-testid="roll-modal"]')?.closest('.modal-content');
      expect(modalEl).withContext('rendered roll modal').not.toBeNull();
      expect(modalEl!.textContent).toContain('Your Roll');
      expect(modalEl!.textContent).not.toContain('Other Players');

      component['closeRollModal']();
      fixture.detectChanges();
    });

    it('the delta ("extra dice") roll modal renders "Your Roll" but never renders the "Other Players" section', async () => {
      const decker = participant({
        id: 'p-1', name: 'Decker', order: 1, ownerName: myToken(), initiativeDice: 1, pendingRoll: false
      });
      await join(stateWith([decker]));
      component.pendingDeltaDice = 2;
      component['openDeltaRollModal']();
      fixture.detectChanges();

      const modalEl = document.querySelector('[data-testid="delta-roll-modal"]')?.closest('.modal-content');
      expect(modalEl).withContext('rendered delta roll modal').not.toBeNull();
      expect(modalEl!.textContent).toContain('Your Roll');
      expect(modalEl!.textContent).not.toContain('Other Players');

      component['closeDeltaRollModal']();
      fixture.detectChanges();
    });
  });
});
