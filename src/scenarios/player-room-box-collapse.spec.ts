// Scenarios for briefs/player-room-box-collapse-spec.md
// ("collapse the player view's Room card after a successful join").
//
// Not rules-dependent - room joining is app-level session plumbing with no
// rulebook counterpart (see the spec's "Not rules-dependent" section), so
// nothing here cites a rulebook page. Scenarios S1-S6 below are the spec's
// own numbering; acceptance criteria are covered inline and cross-referenced
// by number in comments.

import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { PlayerViewComponent } from 'app/player-view/player-view.component';
import { appConfig } from 'app/app.config';
import {
  SessionSyncService, SessionCommand, SharedCombatState, SharedParticipantState
} from 'app/services/session-sync.service';

describe('Player view: Room card collapses after a successful join (briefs/player-room-box-collapse-spec.md)', () => {
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

  function q(testid: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(`[data-testid="${testid}"]`);
  }

  const emptyState: SharedCombatState = { round: 1, pass: 1, participants: [] };

  // ── S1 - the ordinary case: a player joins and the box collapses ─────────
  it('S1: a player joins and the box collapses into a room line', async () => {
    // Before joining: the card is present with an enabled input and button.
    expect(q('player-room-join-card')).not.toBeNull();
    const preInput = fixture.nativeElement.querySelector('input[placeholder="Room code"]') as HTMLInputElement;
    expect(preInput).not.toBeNull();
    expect(preInput.disabled).toBeFalse();
    expect(fixture.nativeElement.textContent).toContain('Join Session');

    component.room = 'ABC123';
    spyOn(sync, 'joinAsPlayer').and.resolveTo({
      state: { round: 1, pass: 1, participants: [] }, log: [], gmConnected: true
    });

    await component.join();
    fixture.detectChanges();

    // AC 2: the card and every trace of it are gone.
    expect(q('player-room-join-card')).toBeNull();
    expect(fixture.nativeElement.querySelector('input[placeholder="Room code"]')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Join Session');

    // AC 3: the collapsed row shows the joined room code.
    const bar = q('player-room-bar');
    expect(bar).not.toBeNull();
    expect(q('player-room-code')?.textContent).toContain('ABC123');

    // AC 5: the bar is not a card and is not inside one.
    expect(bar!.classList.contains('card')).toBeFalse();
    expect(bar!.classList.contains('card-body')).toBeFalse();
    expect(bar!.closest('.card')).toBeNull();

    // The chooser renders below the collapsed row, unaffected.
    expect(q('player-join-choice')).not.toBeNull();
  });

  // ── S2 - the edge case: joined, but the room has no state yet ────────────
  it('S2: joined into a room with no state yet still shows the room line and the strip', async () => {
    component.room = 'ABC123';
    spyOn(sync, 'joinAsPlayer').and.resolveTo({ state: null, log: [], gmConnected: true });

    await component.join();
    fixture.detectChanges();

    expect(component.state).toBeNull();
    // AC 12: the lower half stays gated off, but the view is not empty.
    expect(q('player-join-choice')).toBeNull();
    expect(q('player-room-bar')).not.toBeNull();
    expect(q('player-room-code')?.textContent).toContain('ABC123');
    expect(q('player-message-strip')).not.toBeNull();
  });

  // ── S3 - the reversal: closing the room brings the card back ─────────────
  // D5 (fix round, briefs/player-room-box-collapse.md open decisions +
  // reviewer notes): the card's input is destroyed and re-created by
  // `@if (!connected)`, so `ngModel` writes `room` back into the new input
  // via a microtask. Asserting only `component.room` misses a regression
  // where that write-back silently stops reaching the DOM. This is run
  // fakeAsync (rather than the surrounding tests' `async`) so `tick()` can
  // deterministically flush that microtask before the input's `.value` is
  // read - this is also P1's regression test.
  it('S3: the card/bar transition is symmetric across a Close Room and a rejoin', fakeAsync(() => {
    let closed!: (payload: { room: string; persisted?: boolean }) => void;
    spyOn(sync, 'onSessionClosed').and.callFake((h) => { closed = h; });
    spyOn(sync, 'joinAsPlayer').and.resolveTo({
      state: { round: 1, pass: 1, participants: [] }, log: [], gmConnected: true
    });
    // Typed lower-case, so a correct `.value` also confirms AC 16's
    // normalization survived the destroy/re-create round trip (P1).
    component.room = 'abc123';
    component.join();
    tick();
    fixture.detectChanges();

    expect(q('player-room-bar')).not.toBeNull();

    closed({ room: 'ABC123', persisted: true });
    fixture.detectChanges();
    tick(); // flush the re-created input's ngModel write-back microtask

    // AC 13: the card returns, prefilled and enabled; the bar is gone.
    expect(component.connected).toBeFalse();
    const card = q('player-room-join-card');
    expect(card).not.toBeNull();
    const input = fixture.nativeElement.querySelector('input[placeholder="Room code"]') as HTMLInputElement;
    expect(input.disabled).toBeFalse();
    expect(component.room).toBe('ABC123');
    // P1 / D5: the rendered input, not just the field, holds the code.
    expect(input.value).toBe('ABC123');
    expect(q('player-room-bar')).toBeNull();

    // AC 11: the closed-room error is visible in the DOM.
    expect(fixture.nativeElement.textContent).toContain('still saved');

    // Rejoin: the transition reverses cleanly.
    (sync.joinAsPlayer as jasmine.Spy).and.resolveTo({
      state: { round: 1, pass: 1, participants: [] }, log: [], gmConnected: true
    });
    component.join();
    tick();
    fixture.detectChanges();

    expect(q('player-room-join-card')).toBeNull();
    expect(q('player-room-bar')).not.toBeNull();
  }));

  // ── S4 - the message that would otherwise vanish: a released claim ───────
  describe('S4: messages fired after joining reach the DOM, not just the field', () => {
    const MY_ID = 'p-mine';

    function stateOwnedBy(owner: string | undefined): SharedCombatState {
      return {
        round: 1, pass: 1, participants: [{
          id: MY_ID, name: 'Wombat', order: 1, active: false,
          playerControlled: !!owner, claimable: true, ownerName: owner
        }]
      };
    }

    it('a released claim is shown in the DOM via the message strip', async () => {
      component.room = 'ABC123';
      // Join owning the character.
      spyOn(sync, 'joinAsPlayer').and.resolveTo({
        state: stateOwnedBy(component['playerToken']), log: [], gmConnected: true
      });
      await component.join();
      fixture.detectChanges();

      expect(q('player-room-bar')).not.toBeNull();
      // They hold a character, so the chooser card is not on screen.
      expect(q('player-join-choice')).toBeNull();

      component['applyIncomingState'](stateOwnedBy(undefined));
      fixture.detectChanges();

      expect(component.info).toContain('Wombat');
      expect(component.info).toContain('released');
      expect(fixture.nativeElement.textContent).toContain('Wombat');
      expect(fixture.nativeElement.textContent).toContain('released');
    });

    it('a claim denial is shown in the DOM via the message strip', async () => {
      let command!: (c: SessionCommand) => void;
      spyOn(sync, 'onCommand').and.callFake((h) => { command = h; });
      spyOn(sync, 'joinAsPlayer').and.resolveTo({ state: emptyState, log: [], gmConnected: true });
      component.room = 'ABC123';
      await component.join();
      fixture.detectChanges();

      command({
        type: 'claim_denied',
        player: 'GM',
        payload: {
          requester: component['playerToken'],
          participantId: 'p-1',
          characterName: 'Wombat',
          reason: 'already claimed by another player'
        },
        timestamp: new Date().toISOString()
      });
      fixture.detectChanges();

      expect(component.error).toContain('Wombat');
      expect(fixture.nativeElement.textContent).toContain('Wombat');
      expect(fixture.nativeElement.textContent).toContain('already claimed by another player');
    });
  });

  // ── S5 - live at the table: a phone drops mid-fight ───────────────────────
  it('S5: a dropped connection keeps the player on their collapsed room line, not thrown back to the join form', async () => {
    const fightState: SharedCombatState = {
      round: 1, pass: 2, started: true, passEnded: false,
      participants: [
        { id: 'p-mine', name: 'Wombat', order: 1, active: false, playerControlled: true, ownerName: component['playerToken'] } as SharedParticipantState,
        { id: 'p-npc', name: 'Ganger', order: 2, active: true, playerControlled: false } as SharedParticipantState,
        { id: 'p-third', name: 'Street Doc', order: 3, active: false, playerControlled: false } as SharedParticipantState
      ]
    };

    let dropped!: (reason: string) => void;
    spyOn(sync, 'onDisconnect').and.callFake((h) => { dropped = h; });
    spyOn(sync, 'joinAsPlayer').and.resolveTo({ state: fightState, log: [], gmConnected: true });
    component.room = 'ABC123';
    await component.join();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Pass 2');
    expect(q('player-room-code')?.textContent).toContain('ABC123');

    const sendCommandSpy = spyOn(sync, 'sendCommand');

    dropped('transport closed');
    fixture.detectChanges();

    // onDisconnect does not clear `connected` - the player is not thrown
    // back to a join form mid-fight.
    expect(component.connected).toBeTrue();
    expect(q('player-room-join-card')).toBeNull();
    expect(q('player-room-bar')).not.toBeNull();
    expect(q('player-room-code')?.textContent).toContain('ABC123');
    expect(fixture.nativeElement.textContent).toContain('Reconnecting to the session server');
    expect(q('gm-not-connected')).not.toBeNull();

    (sync.joinAsPlayer as jasmine.Spy).and.resolveTo({ state: fightState, log: [], gmConnected: true });
    await component['rejoinAfterReconnect']();
    fixture.detectChanges();

    expect(component.info).toBe('Reconnected.');
    expect(fixture.nativeElement.textContent).toContain('Reconnected.');
    expect(fixture.nativeElement.textContent).toContain('Pass 2');
    expect(q('player-room-join-card')).toBeNull();
    expect(sendCommandSpy).not.toHaveBeenCalled();
  });

  // ── P4 (fix round regression, reviewer-recommended) - all three message
  // kinds render at once, mid-fight, without one overwriting another ───────
  // The strongest single disproof of the "a message stops being shown"
  // primary risk the spec named: error (a denied claim), info (a dropped
  // transport's "Reconnecting..." notice) and the GM-absence warning are all
  // driven live at once, in pass 2 of a started fight, and all three must be
  // simultaneously visible in the message strip while the room bar is
  // untouched.
  it('P4: a denied claim, a dropped connection and the GM-absence warning all render together mid-fight', async () => {
    const fightState: SharedCombatState = {
      round: 1, pass: 2, started: true, passEnded: false,
      participants: [
        { id: 'p-mine', name: 'Wombat', order: 1, active: false, playerControlled: true, ownerName: component['playerToken'] } as SharedParticipantState,
        { id: 'p-npc', name: 'Ganger', order: 2, active: true, playerControlled: false } as SharedParticipantState,
        { id: 'p-third', name: 'Street Doc', order: 3, active: false, playerControlled: false } as SharedParticipantState
      ]
    };

    let command!: (c: SessionCommand) => void;
    let dropped!: (reason: string) => void;
    spyOn(sync, 'onCommand').and.callFake((h) => { command = h; });
    spyOn(sync, 'onDisconnect').and.callFake((h) => { dropped = h; });
    spyOn(sync, 'joinAsPlayer').and.resolveTo({ state: fightState, log: [], gmConnected: true });
    component.room = 'ABC123';
    await component.join();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Pass 2');
    const bar = q('player-room-bar');
    expect(bar).not.toBeNull();
    expect(q('player-room-code')?.textContent).toContain('ABC123');

    // A claim denial fires first: sets `error`, and (per the handler) clears
    // `info` on its way through - so it must run before the drop below, not
    // after, or it would wipe out the "Reconnecting..." notice.
    command({
      type: 'claim_denied',
      player: 'GM',
      payload: {
        requester: component['playerToken'],
        participantId: 'p-1',
        characterName: 'Wombat',
        reason: 'already claimed by another player'
      },
      timestamp: new Date().toISOString()
    });
    // The GM's tab drops next: sets `gmConnected = false` and `info`, and
    // does not touch `error`.
    dropped('transport closed');
    fixture.detectChanges();

    // All three message kinds are live at once.
    expect(component.error).toContain('Wombat');
    expect(component.error).toContain('already claimed by another player');
    expect(component.info).toBe('Reconnecting to the session server...');
    expect(component.gmConnected).toBeFalse();

    const strip = q('player-message-strip');
    expect(strip).not.toBeNull();
    // Exactly the three blocks - nothing missing, nothing duplicated.
    expect(strip!.childElementCount).toBe(3);
    expect(strip!.textContent).toContain('Wombat');
    expect(strip!.textContent).toContain('already claimed by another player');
    expect(strip!.textContent).toContain('Reconnecting to the session server');
    expect(strip!.querySelector('[data-testid="gm-not-connected"]')).not.toBeNull();

    // The room bar is unaffected by any of it.
    expect(q('player-room-bar')).not.toBeNull();
    expect(q('player-room-code')?.textContent).toContain('ABC123');
    expect(fixture.nativeElement.textContent).toContain('Pass 2');
  });

  // ── S6 - the existing GM-absence contract, unchanged ──────────────────────
  it('S6: the GM-not-connected warning still appears/disappears exactly as before the move', async () => {
    spyOn(sync, 'joinAsPlayer').and.resolveTo({ state: emptyState, log: [], gmConnected: false });
    component.room = 'ABC123';
    await component.join();
    fixture.detectChanges();

    const notice = q('gm-not-connected');
    expect(notice).not.toBeNull();
    expect(notice!.textContent).toContain('GM not connected');
  });

  it('S6: no warning when the GM is present', async () => {
    // A second fixture, per the spec's wording ("Join a second fixture").
    const fixture2 = TestBed.createComponent(PlayerViewComponent);
    const component2 = fixture2.componentInstance;
    fixture2.detectChanges();
    const sync2 = TestBed.inject(SessionSyncService);
    spyOn(sync2, 'joinAsPlayer').and.resolveTo({ state: emptyState, log: [], gmConnected: true });
    component2.room = 'ABC123';
    await component2.join();
    fixture2.detectChanges();

    expect(fixture2.nativeElement.querySelector('[data-testid="gm-not-connected"]')).toBeNull();
  });

  // ── AC 4 - a component driven directly (connected=true, room='') is safe ──
  it('AC 4: connected with an empty room renders no stray Room label', () => {
    component.connected = true;
    fixture.detectChanges();

    expect(q('player-room-bar')).toBeNull();
  });

  // ── AC 1 - the pre-join card's exact contents ─────────────────────────────
  it('AC 1: before joining, the card has an enabled input and a button disabled until a room code is typed', () => {
    expect(q('player-room-join-card')).not.toBeNull();
    const input = fixture.nativeElement.querySelector('input[placeholder="Room code"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.disabled).toBeFalse();

    const button = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    const joinButton = button.find(b => b.textContent?.trim() === 'Join Session');
    expect(joinButton).toBeDefined();
    expect(joinButton!.disabled).toBeTrue();

    component.room = 'ABC123';
    fixture.detectChanges();
    expect(joinButton!.disabled).toBeFalse();
  });

  // ── AC 6 - the message strip renders both before and after joining ───────
  // D6 (fix round): asserting only that the wrapper element exists would
  // still pass if the three @if blocks inside it were deleted entirely.
  // Seed each message kind and assert its text actually lands inside the
  // strip, so the test fails if the blocks stop rendering.
  it('AC 6: the message strip is present before joining and after, even with state null', async () => {
    const strip = q('player-message-strip');
    expect(strip).not.toBeNull();

    // Before joining: an error written to the field must reach the strip.
    component.error = 'pre-join probe error';
    fixture.detectChanges();
    expect(strip!.textContent).toContain('pre-join probe error');
    component.error = '';
    fixture.detectChanges();

    spyOn(sync, 'joinAsPlayer').and.resolveTo({ state: null, log: [], gmConnected: true });
    component.room = 'ABC123';
    await component.join();
    fixture.detectChanges();

    expect(component.state).toBeNull();
    const stripAfterJoin = q('player-message-strip');
    expect(stripAfterJoin).not.toBeNull();

    // After joining, with state null: info and the GM-absence warning must
    // both still land inside the strip.
    component.info = 'post-join probe info';
    fixture.detectChanges();
    expect(stripAfterJoin!.textContent).toContain('post-join probe info');

    component.gmConnected = false;
    fixture.detectChanges();
    expect(stripAfterJoin!.querySelector('[data-testid="gm-not-connected"]')).not.toBeNull();
  });

  // ── AC 7/8 - error and info text render in the DOM once connected ────────
  it('AC 7 & 8: error and info text are visible in the DOM while connected', async () => {
    spyOn(sync, 'joinAsPlayer').and.resolveTo({ state: emptyState, log: [], gmConnected: true });
    component.room = 'ABC123';
    await component.join();

    component.error = 'Could not claim Wombat: already claimed by another player.';
    component.info = 'Claim request sent.';
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Could not claim Wombat');
    expect(fixture.nativeElement.textContent).toContain('Claim request sent.');
  });

  // ── AC 9/10 - gm-not-connected toggles with gmConnected ───────────────────
  it('AC 9 & 10: gm-not-connected shows only when gmConnected is false, while connected', async () => {
    spyOn(sync, 'joinAsPlayer').and.resolveTo({ state: emptyState, log: [], gmConnected: false });
    component.room = 'ABC123';
    await component.join();
    fixture.detectChanges();
    expect(q('gm-not-connected')).not.toBeNull();

    component.gmConnected = true;
    fixture.detectChanges();
    expect(q('gm-not-connected')).toBeNull();
  });

  // ── AC 11 - a failed join still shows its error, with the card visible ───
  it('AC 11: a failed join keeps the card and shows the error text', async () => {
    spyOn(sync, 'joinAsPlayer').and.rejectWith(new Error('Room not found.'));
    component.room = 'NOPE00';
    await component.join();
    fixture.detectChanges();

    expect(component.connected).toBeFalse();
    expect(q('player-room-join-card')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Room not found.');
  });

  // ── AC 14 - tapping Join twice after success is impossible ───────────────
  it('AC 14: the Join button is not in the DOM after a successful join', async () => {
    spyOn(sync, 'joinAsPlayer').and.resolveTo({ state: emptyState, log: [], gmConnected: true });
    component.room = 'ABC123';
    await component.join();
    fixture.detectChanges();

    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    expect(buttons.find(b => b.textContent?.trim() === 'Join Session')).toBeUndefined();
  });

  // ── AC 15 - no extra socket work from rendering/collapsing/expanding ─────
  it('AC 15: joining sends no command, and no command fires from the collapse/expand transition', async () => {
    const sendCommandSpy = spyOn(sync, 'sendCommand');
    spyOn(sync, 'joinAsPlayer').and.resolveTo({ state: emptyState, log: [], gmConnected: true });
    component.room = 'ABC123';
    await component.join();
    fixture.detectChanges();

    expect(sendCommandSpy).not.toHaveBeenCalled();
  });

  // ── AC 16 - Decision 6: the displayed/stored room code is normalized ─────
  it('AC 16: a lower-case room code is normalized to capitals after joining, in the field and on the bar', async () => {
    spyOn(sync, 'joinAsPlayer').and.resolveTo({ state: emptyState, log: [], gmConnected: true });
    component.room = 'abc123';

    await component.join();
    fixture.detectChanges();

    expect(component.room).toBe('ABC123');
    expect(q('player-room-code')?.textContent).toContain('ABC123');
  });
});
