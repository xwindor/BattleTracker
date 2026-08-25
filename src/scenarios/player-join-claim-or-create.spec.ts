// Promoted scenarios for briefs/player-join-claim-or-create-spec.md
// ("the player view opens on a claim-or-create chooser").
//
// Not rules-dependent - claiming/ownership is app-level bookkeeping with no
// rulebook counterpart (see the spec's "Not rules-dependent" section), so
// nothing here cites a rulebook page. Scenarios S1-S6 below are the spec's
// own numbering; acceptance criteria are covered inline and cross-referenced
// by number in comments.

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PlayerViewComponent } from 'app/player-view/player-view.component';
import { appConfig } from 'app/app.config';
import {
  SessionSyncService, SessionCommand, SharedCombatState, SharedParticipantState
} from 'app/services/session-sync.service';

describe('Player join: claim-or-create chooser (briefs/player-join-claim-or-create-spec.md)', () => {
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
    return { round: 1, pass: 1, participants, ...overrides };
  }

  function participant(overrides: Partial<SharedParticipantState> & { id: string; name: string; order: number }): SharedParticipantState {
    return { active: false, playerControlled: false, ...overrides };
  }

  async function join(state: SharedCombatState | null, gmConnected = true) {
    spyOn(sync, 'joinAsPlayer').and.resolveTo({ state, log: [], gmConnected });
    component.room = 'ABC123';
    await component.join();
    fixture.detectChanges();
  }

  function q(testid: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(`[data-testid="${testid}"]`);
  }

  // ── S1 - the ordinary case: a player claims the character the GM set up ──
  it('S1: a player claims the character the GM already set up', async () => {
    const wombat = participant({ id: 'p-1', name: 'Wombat', order: 1, claimable: true, ownerName: undefined });
    await join(stateWith([wombat]));

    // AC 1: exactly two buttons, no dropdown, no create input, on first look.
    expect(component.joinChoice).toBe('none');
    expect(q('player-join-choice')).not.toBeNull();
    const claimBtn = q('player-choose-claim') as HTMLButtonElement;
    expect(claimBtn).not.toBeNull();
    expect(claimBtn.disabled).toBeFalse();
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
    expect(q('player-claim-panel')).toBeNull();
    expect(q('player-create-panel')).toBeNull();

    // AC 2: tapping Claim reveals the dropdown and its button only.
    claimBtn.click();
    fixture.detectChanges();
    expect(q('player-claim-panel')).not.toBeNull();
    const options: HTMLOptionElement[] = Array.from(fixture.nativeElement.querySelectorAll('option'));
    expect(options.map(o => o.textContent)).toContain('#1 Wombat');
    expect(q('player-create-panel')).toBeNull();

    // AC 7: claimSelectedCharacter() sends claim_character with the selected id.
    spyOn(sync, 'sendCommand');
    component.selectedClaimParticipantId = 'p-1';
    component.claimSelectedCharacter();
    expect(sync.sendCommand).toHaveBeenCalledTimes(1);
    const sent = (sync.sendCommand as jasmine.Spy).calls.mostRecent().args[0] as SessionCommand;
    expect(sent).toEqual(jasmine.objectContaining({
      type: 'claim_character',
      player: component['playerToken'],
      payload: { participantId: 'p-1' }
    }));

    // AC 10: once owned, the whole card disappears.
    component['applyIncomingState'](stateWith([
      participant({ id: 'p-1', name: 'Wombat', order: 1, claimable: true, ownerName: component['playerToken'] })
    ]));
    fixture.detectChanges();
    expect(q('player-join-choice')).toBeNull();
    expect(q('player-claim-panel')).toBeNull();
    expect(component.primaryCharacter?.id).toBe('p-1');
  });

  // ── S2 - the ordinary case, other branch: a drop-in player creates one ──
  it('S2: a drop-in player creates a character', async () => {
    await join(stateWith([]));

    // AC 8: nothing to claim -> Claim button disabled, with a reason.
    const claimBtn = q('player-choose-claim') as HTMLButtonElement;
    expect(claimBtn.disabled).toBeTrue();
    // Fix round Item B: the genuinely-never-had-anything wording is
    // unchanged - this player never selected anything, so there is nothing
    // to say was taken from them.
    expect(q('player-claim-unavailable-choice')?.textContent)
      .toContain('No characters are available to claim yet');

    // AC 3: tapping Create reveals all eight inputs and the Create button,
    // and no dropdown.
    (q('player-choose-create') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(q('player-create-panel')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
    // AC 3 (fix round): count the inputs, don't just check the container -
    // the eight fields are Character name, Init Dice, Overflow, Reaction,
    // Intuition, Edge, Physical CM, Stun CM.
    const createPanel = q('player-create-panel') as HTMLElement;
    const inputs = createPanel.querySelectorAll('input');
    expect(inputs.length).toBe(8);

    component.characterName = 'Drop-In';
    component.initiativeDice = 2;
    component.edgeRating = 3;
    component.reaction = 4;
    component.intuition = 5;
    component.overflowHealth = 6;
    component.physicalHealth = 11;
    component.stunHealth = 9;

    spyOn(sync, 'sendCommand');
    component.createCharacter();

    // AC 6: register_character payload is identical field-for-field to before.
    const sent = (sync.sendCommand as jasmine.Spy).calls.mostRecent().args[0] as SessionCommand;
    expect(sent.type).toBe('register_character');
    expect(sent.payload).toEqual({
      characterName: 'Drop-In',
      initiativeDice: 2,
      edgeRating: 3,
      reaction: 4,
      intuition: 5,
      overflowHealth: 6,
      physicalHealth: 11,
      stunHealth: 9,
      isMatrix: false
    });

    // AC 13: submitting does not close the branch.
    expect(component.joinChoice).toBe('create');
    fixture.detectChanges();
    expect(q('player-create-panel')).not.toBeNull();
  });

  // ── S3 - nothing to claim, then something to claim, with no interaction ──
  it('S3: an arriving claimable character enables the button without moving the player into a branch', async () => {
    await join(stateWith([]));
    expect((q('player-choose-claim') as HTMLButtonElement).disabled).toBeTrue();

    component['applyIncomingState'](stateWith([
      participant({ id: 'p-9', name: 'Ork', order: 1, claimable: true })
    ]));
    fixture.detectChanges();

    // AC 9: the same button lights up on the next state, no interaction.
    expect((q('player-choose-claim') as HTMLButtonElement).disabled).toBeFalse();
    expect(q('player-claim-unavailable-choice')).toBeNull();
    expect(component.joinChoice).toBe('none');
  });

  // S3, second half - the level-vs-edge trigger bug (the single most likely defect).
  it('S3b: a player mid-create-form keeps their branch and typed values across an unrelated broadcast', async () => {
    await join(stateWith([
      participant({ id: 'p-9', name: 'Ork', order: 1, claimable: true })
    ]));
    (q('player-choose-create') as HTMLButtonElement).click();
    fixture.detectChanges();
    component.characterName = 'Half-Typed';

    // Unrelated broadcast: same participants (still unowned by this player,
    // so ownParticipants stays empty on both sides of the update - a
    // level-triggered reset would fire here even though nothing changed).
    component['applyIncomingState'](stateWith(
      [ participant({ id: 'p-9', name: 'Ork', order: 1, claimable: true }) ],
      { round: 2 }
    ));
    fixture.detectChanges();

    // AC 11
    expect(component.joinChoice).toBe('create');
    expect(component.characterName).toBe('Half-Typed');
    expect(q('player-create-panel')).not.toBeNull();
  });

  // ── S4 - the reversal (no undo stack; this is what stands in for one) ──
  describe('S4: the reversal', () => {
    it('S4(a): the player-side Back control returns to the two-button state, from the create branch', async () => {
      await join(stateWith([]));
      (q('player-choose-create') as HTMLButtonElement).click();
      fixture.detectChanges();
      component.characterName = 'Almost';

      // AC 4
      (q('player-join-choice-back') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(component.joinChoice).toBe('none');
      expect(q('player-join-choice')).not.toBeNull();
      expect(q('player-create-panel')).toBeNull();
      expect(component.selectedClaimParticipantId).toBe('');
    });

    // AC 4 pinned the Back control on *both* branches; only the create side
    // had a DOM assertion (fix round). This is the claim-side counterpart.
    it('S4(a) claim-side: the Back control returns to the two-button state, from the claim branch', async () => {
      const wombat = participant({ id: 'p-1', name: 'Wombat', order: 1, claimable: true });
      await join(stateWith([wombat]));
      (q('player-choose-claim') as HTMLButtonElement).click();
      fixture.detectChanges();
      component.selectedClaimParticipantId = 'p-1';

      const claimBackBtn = q('player-join-choice-back') as HTMLButtonElement;
      expect(claimBackBtn).not.toBeNull();
      claimBackBtn.click();
      fixture.detectChanges();

      expect(component.joinChoice).toBe('none');
      expect(q('player-join-choice')).not.toBeNull();
      expect(q('player-claim-panel')).toBeNull();
      expect(component.selectedClaimParticipantId).toBe('');
    });

    it('S4(b): a GM-side release reopens the card on the two-button state, not the last branch, and keeps the release notice', async () => {
      const MY_ID = 'p-mine';
      await join(stateWith([
        participant({ id: MY_ID, name: 'Wombat', order: 1, claimable: true, ownerName: component['playerToken'] })
      ]));
      expect(component.ownParticipants.length).toBe(1);
      // Card is gone while owned; nothing to click into a branch with, so
      // joinChoice is whatever it was from join() ("none") - simulate a
      // player who had a branch open before claiming by forcing it, the way
      // a stale in-memory value could otherwise survive a claim.
      component.joinChoice = 'create';

      component['applyIncomingState'](stateWith([
        participant({ id: MY_ID, name: 'Wombat', order: 1, claimable: true, ownerName: undefined })
      ]));
      fixture.detectChanges();

      // AC 12
      expect(component.joinChoice).toBe('none');
      expect(q('player-join-choice')).not.toBeNull();
      expect(component.selectedClaimParticipantId).toBe('');
      // persistent-rooms.spec.ts's release-notice assertion must still hold.
      expect(component.info).toContain('Wombat');
      expect(component.info).toContain('released');
      expect(component.info).toContain('Claim');
    });

    // Defect D3 (fix round): the released-character notice used to say
    // "Claim from the list to take control back", but there is no list on
    // screen any more, only the two chooser buttons. It must describe what is
    // actually there.
    it('D3: the released-character notice points at the Claim button, not a list that no longer exists', async () => {
      const MY_ID = 'p-mine';
      await join(stateWith([
        participant({ id: MY_ID, name: 'Wombat', order: 1, claimable: true, ownerName: component['playerToken'] })
      ]));

      component['applyIncomingState'](stateWith([
        participant({ id: MY_ID, name: 'Wombat', order: 1, claimable: true, ownerName: undefined })
      ]));

      expect(component.info).not.toContain('from the list');
      expect(component.info).toContain('Claim a Character');
    });
  });

  // ── S5 - a player's tablet dies mid pass-2 and they rejoin ──────────────
  it('S5: a rejoining player sees the chooser without the fight around them stopping', async () => {
    const started: SharedCombatState = {
      round: 1, pass: 2, started: true, passEnded: false,
      participants: [
        participant({ id: 'p-1', name: 'Wombat', order: 1, claimable: true, ownerName: undefined, initiativeScore: 8 }),
        participant({ id: 'p-active', name: 'Ganger', order: 2, active: true }),
        participant({ id: 'p-other', name: 'Troll', order: 3 })
      ]
    };
    // A fresh tab: a brand-new component instance, matching ngOnInit minting
    // a new token on reload.
    const freshFixture = TestBed.createComponent(PlayerViewComponent);
    const freshComponent = freshFixture.componentInstance;
    freshFixture.detectChanges();
    const freshSync = TestBed.inject(SessionSyncService);
    spyOn(freshSync, 'joinAsPlayer').and.resolveTo({ state: started, log: [], gmConnected: true });
    freshComponent.room = 'ABC123';
    await freshComponent.join();
    freshFixture.detectChanges();

    const claimBtn = freshFixture.nativeElement.querySelector('[data-testid="player-choose-claim"]') as HTMLButtonElement;
    expect(claimBtn.disabled).toBeFalse();
    // The chooser does not hide or block the order underneath it.
    expect(freshComponent.state?.started).toBeTrue();
    expect(freshFixture.nativeElement.textContent).toContain('Pass 2');

    spyOn(freshSync, 'sendCommand');
    claimBtn.click();
    freshFixture.detectChanges();
    freshComponent.selectedClaimParticipantId = 'p-1';
    freshComponent.claimSelectedCharacter();

    const calls = (freshSync.sendCommand as jasmine.Spy).calls.all().map(c => c.args[0] as SessionCommand);
    expect(calls.length).toBe(1);
    expect(calls[0].type).toBe('claim_character');
    // No register_character is ever sent - a returning player must not be
    // nudged down the create path.
    expect(calls.some(c => c.type === 'register_character')).toBeFalse();

    freshComponent['applyIncomingState']({
      ...started,
      participants: [
        participant({ id: 'p-1', name: 'Wombat', order: 1, claimable: true, ownerName: freshComponent['playerToken'], initiativeScore: 8 }),
        participant({ id: 'p-active', name: 'Ganger', order: 2, active: true }),
        participant({ id: 'p-other', name: 'Troll', order: 3 })
      ]
    });
    freshFixture.detectChanges();

    expect(freshFixture.nativeElement.querySelector('[data-testid="player-join-choice"]')).toBeNull();
    expect(freshComponent.primaryCharacter?.id).toBe('p-1');
    expect(freshComponent.primaryCharacter?.initiativeScore).toBe(8);
  });

  // ── S6 - GM absent (Open Decision 5 taken) ──────────────────────────────
  it('S6: both buttons stay usable while the GM is absent, with a warning, and the on-screen message never claims success', async () => {
    await join(stateWith([]), false);

    expect(component.gmConnected).toBeFalse();
    // Buttons remain reachable - Create is never gated on GM presence.
    expect((q('player-choose-create') as HTMLButtonElement).disabled).toBeFalse();
    // Claim is disabled here only because there is nothing to claim
    // (participants: []), not because the GM is absent - `canClaimAnything`
    // has no gmConnected term.
    expect(q('player-claim-unavailable-choice')).not.toBeNull();
    const warning = q('player-gm-absent-notice');
    expect(warning).not.toBeNull();
    expect(warning?.textContent).toContain('GM');

    (q('player-choose-create') as HTMLButtonElement).click();
    fixture.detectChanges();
    component.characterName = 'Solo';

    spyOn(sync, 'sendCommand');
    component.createCharacter();

    expect(sync.sendCommand).toHaveBeenCalledTimes(1);
    const sent = (sync.sendCommand as jasmine.Spy).calls.mostRecent().args[0] as SessionCommand;
    expect(sent.type).toBe('register_character');
    // The message must not read as confirmed - it must not be the plain
    // success wording used when the GM is connected.
    expect(component.info).not.toBe('Create character request sent.');
    expect(component.info).toContain('GM');
  });

  // Defect D1 (fix round, briefs/player-join-claim-or-create-spec.md): the
  // warning used to sit only inside the `joinChoice === 'none'` branch, so it
  // disappeared the instant a player tapped Claim or Create - exactly when
  // they were about to submit a request that would evaporate with no GM in
  // the room. This asserts it is present in all three chooser states, not
  // just the one S6 above already covered.
  it('D1: the GM-absent warning stays visible across all three chooser states, not just the two-button one', async () => {
    const wombat = participant({ id: 'p-1', name: 'Wombat', order: 1, claimable: true });
    await join(stateWith([ wombat ]), false);

    expect(component.joinChoice).toBe('none');
    expect(q('player-gm-absent-notice')).not.toBeNull();

    (q('player-choose-claim') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.joinChoice).toBe('claim');
    expect(q('player-gm-absent-notice')).not.toBeNull();

    (q('player-join-choice-back') as HTMLButtonElement).click();
    fixture.detectChanges();
    (q('player-choose-create') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.joinChoice).toBe('create');
    expect(q('player-gm-absent-notice')).not.toBeNull();
  });

  // Defect D2 (fix round): the claim pool can empty out from under a player
  // who is already on the claim branch - another player claims the same
  // character first, or the GM un-marks it claimable - before they submit.
  it('D2: a claim pool that empties while the player is on the claim branch explains itself, disables Claim, and clears the stale selection', async () => {
    const wombat = participant({ id: 'p-1', name: 'Wombat', order: 1, claimable: true, ownerName: undefined });
    await join(stateWith([ wombat ]));

    (q('player-choose-claim') as HTMLButtonElement).click();
    fixture.detectChanges();
    component.selectedClaimParticipantId = 'p-1';
    expect(q('player-claim-unavailable-panel')).toBeNull();

    // Another player claims it first (or the GM un-marks it claimable) -
    // either way the next broadcast shows nothing left to claim.
    component['applyIncomingState'](stateWith([
      participant({ id: 'p-1', name: 'Wombat', order: 1, claimable: true, ownerName: 'pl-someone-else' })
    ]));
    fixture.detectChanges();

    // Stays on the claim branch - do not auto-bounce back to the chooser.
    expect(component.joinChoice).toBe('claim');
    // (a) the unavailable line renders, disables Claim, and - fix round Item
    // B - reads differently from the genuinely-never-had-anything case: this
    // player had a selection and it was taken from under them, so the line
    // must say so rather than implying there was never anything to claim.
    const unavailable = q('player-claim-unavailable-panel');
    expect(unavailable).not.toBeNull();
    expect(unavailable?.textContent).toContain('claimed by someone else');
    expect(unavailable?.textContent).not.toContain('No characters are available to claim yet');
    const claimBtn = fixture.nativeElement.querySelector('[data-testid="player-claim-panel"] button.btn-outline-primary') as HTMLButtonElement;
    expect(claimBtn.disabled).toBeTrue();
    // (b) the stale id is cleared, so a mis-tap on Claim cannot fire a real
    // `claim_character` the GM would only answer with `claim_denied`.
    expect(component.selectedClaimParticipantId).toBe('');

    spyOn(sync, 'sendCommand');
    claimBtn.click();
    fixture.detectChanges();
    expect(sync.sendCommand).not.toHaveBeenCalled();
  });

  // ── Item A (fix round): the pending-request line must clear on success ──
  describe('Item A: the "...request sent" line clears once the request lands', () => {
    it('a successful claim clears "Claim request sent." the moment the character shows up owned', async () => {
      const wombat = participant({ id: 'p-1', name: 'Wombat', order: 1, claimable: true, ownerName: undefined });
      await join(stateWith([ wombat ]));

      component.chooseClaim();
      fixture.detectChanges();
      component.selectedClaimParticipantId = 'p-1';
      spyOn(sync, 'sendCommand');
      component.claimSelectedCharacter();
      expect(component.info).toBe('Claim request sent.');

      // The GM applies the claim; the next broadcast shows this player as owner.
      component['applyIncomingState'](stateWith([
        participant({ id: 'p-1', name: 'Wombat', order: 1, claimable: true, ownerName: component['playerToken'] })
      ]));
      fixture.detectChanges();

      // Without the fix, "Claim request sent." sits at the top of the page
      // forever - there was nothing that ever cleared a *successful* claim.
      expect(component.info).toBe('');
      expect(component.primaryCharacter?.id).toBe('p-1');
    });

    it('a successful create clears "Create character request sent."', async () => {
      await join(stateWith([]));
      component.chooseCreate();
      fixture.detectChanges();
      component.characterName = 'Drop-In';
      spyOn(sync, 'sendCommand');
      component.createCharacter();
      expect(component.info).toBe('Create character request sent.');

      component['applyIncomingState'](stateWith([
        participant({ id: 'p-new', name: 'Drop-In', order: 1, claimable: true, ownerName: component['playerToken'] })
      ]));
      fixture.detectChanges();

      expect(component.info).toBe('');
    });

    it('a claim made while the GM is away still clears its "will not take effect until the GM is back" line once the GM returns and applies it', async () => {
      const wombat = participant({ id: 'p-1', name: 'Wombat', order: 1, claimable: true, ownerName: undefined });
      await join(stateWith([ wombat ]), false);

      component.chooseClaim();
      fixture.detectChanges();
      component.selectedClaimParticipantId = 'p-1';
      spyOn(sync, 'sendCommand');
      component.claimSelectedCharacter();
      expect(component.info).toContain('it will not take effect until the GM is back');

      // The GM comes back and the claim lands.
      component.gmConnected = true;
      component['applyIncomingState'](stateWith([
        participant({ id: 'p-1', name: 'Wombat', order: 1, claimable: true, ownerName: component['playerToken'] })
      ]));
      fixture.detectChanges();

      // Without the fix this sentence survives forever, still telling the
      // player the GM is away even though the claim already landed.
      expect(component.info).toBe('');
    });

    it('does not clobber an unrelated info message that has nothing to do with a pending request', async () => {
      // No claim/create was ever sent, so `pendingRequestMessage` is false -
      // the ownership edge must leave an unrelated `info` line alone.
      await join(stateWith([]));
      component.info = 'Reconnected.';
      component['applyIncomingState'](stateWith([
        participant({ id: 'p-1', name: 'Wombat', order: 1, claimable: true, ownerName: component['playerToken'] })
      ]));
      fixture.detectChanges();
      expect(component.info).toBe('Reconnected.');
    });
  });

  // ── Wording (spec "Wording") ────────────────────────────────────────────
  it('the onboarding info line describes choosing, not a dropdown that is not on screen', async () => {
    await join(stateWith([]));
    expect(component.info).toContain('Choose whether to claim');
  });

  // ── AC 16 - nothing new appears on the GM screen / Action Log ──────────
  it('AC 16: no command is sent merely by opening or backing out of a branch', async () => {
    await join(stateWith([
      participant({ id: 'p-1', name: 'Wombat', order: 1, claimable: true })
    ]));
    spyOn(sync, 'sendCommand');

    (q('player-choose-claim') as HTMLButtonElement).click();
    fixture.detectChanges();
    (q('player-join-choice-back') as HTMLButtonElement).click();
    fixture.detectChanges();
    (q('player-choose-create') as HTMLButtonElement).click();
    fixture.detectChanges();
    (q('player-join-choice-back') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(sync.sendCommand).not.toHaveBeenCalled();
  });

  // ── S4(a)'s reconnect counterpart: a transport reconnect leaves the
  // branch and typed values untouched (AC 14). ───────────────────────────
  it('a transport reconnect leaves the current branch and typed create-form values untouched', async () => {
    await join(stateWith([]));
    (q('player-choose-create') as HTMLButtonElement).click();
    fixture.detectChanges();
    component.characterName = 'Still Here';

    const joinSpy = sync.joinAsPlayer as jasmine.Spy;
    joinSpy.and.resolveTo({ state: stateWith([]), log: [], gmConnected: true });
    await component['rejoinAfterReconnect']();
    fixture.detectChanges();

    expect(component.joinChoice).toBe('create');
    expect(component.characterName).toBe('Still Here');
  });
});
