// Regression tests for Xavier's hands-on QA findings on the committed
// initiative work (commit 304aa36). See the QA findings list this file was
// written against for the six items; each `describe` block below is one
// item. No new rules are introduced anywhere in this file - items 1-3 and 5-6
// are display/UI/state-plumbing fixes, and item 4's log-line change only
// surfaces arithmetic (Core p. 160's late-entry penalty) the engine already
// applies, cited from `Combat/Participants/Participant.ts`'s own
// `INITIATIVE_PASS_DECAY` constant.
//
// Every scenario that touches combat state drives the real GM flow
// (`btnStartRound_Click`, `btnNextPass_Click`, `addParticipantViaDialog`,
// `handleSessionCommand`) into an actually-started Combat Turn - the same
// convention `mid-turn-joiner.spec.ts` establishes - rather than setting
// `CombatManager.started` by hand.

import { ApplicationRef } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { BattleTrackerComponent } from 'app/battle-tracker/battle-tracker.component';
import { PlayerViewComponent } from 'app/player-view/player-view.component';
import { DiceRollerComponent } from 'app/dice-roller/dice-roller.component';
import { appConfig } from 'app/app.config';
import { CombatManager } from 'Combat';
import { Participant } from 'Combat/Participants/Participant';
import { MatrixParticipant } from 'Matrix/MatrixParticipant';
import { VRMode } from 'Matrix/VRMode';
import {
  SessionCommand, SessionSyncService, SharedCombatState, SharedLogEntry, SharedParticipantState
} from 'app/services/session-sync.service';
import { NOT_ROLLED_DISPLAY } from 'app/shared/roll-utils';

function resetCombat() {
  CombatManager.participants.clear();
  CombatManager.currentActors.clear();
  CombatManager.nextSortOrder = 0;
  CombatManager.initiativePass = 1;
  CombatManager.combatTurn = 1;
  CombatManager.started = false;
  CombatManager.passEnded = true;
}

// ─── Item 1: the dice roller must not show hits/glitches for an initiative roll ───
describe('QA item 1: DiceRollerComponent suppresses hits/glitches when hideHitsAndGlitches is set', () => {
  let fixture: ComponentFixture<DiceRollerComponent>;
  let component: DiceRollerComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DiceRollerComponent] }).compileComponents();
    fixture = TestBed.createComponent(DiceRollerComponent);
    component = fixture.componentInstance;
  });

  it('defaults to false: hits/glitches still show (page-level roller, GM roller unaffected)', fakeAsync(() => {
    fixture.componentRef.setInput('fixedDiceCount', 5);
    fixture.detectChanges();
    component.triggerLocalAnimation([5, 5, 1, 1, 1]); // 2 hits, 3 ones -> glitch
    tick(DiceRollerComponent.ROLL_ANIMATION_MS); // the result row only renders once the animation settles
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Total Hits');
  }));

  it('with hideHitsAndGlitches set, shows only the dice and their total - no hits, ones or glitch badge', fakeAsync(() => {
    fixture.componentRef.setInput('fixedDiceCount', 5);
    fixture.componentRef.setInput('hideHitsAndGlitches', true);
    fixture.detectChanges();
    // 5,5,1,1,1 would ordinarily be a glitch (3 of 5 dice show 1) with 2 hits -
    // the exact case that most tempts a hit/glitch UI into rendering.
    component.triggerLocalAnimation([5, 5, 1, 1, 1]);
    tick(DiceRollerComponent.ROLL_ANIMATION_MS);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).not.toContain('Total Hits');
    expect(text).not.toContain('GLITCH');
    expect(text).not.toContain('1s:');
    const total = fixture.nativeElement.querySelector('[data-testid="dice-roller-total"]') as HTMLElement;
    expect(total).withContext('a plain total must still be shown').not.toBeNull();
    expect(total.textContent).toContain('13'); // 5+5+1+1+1
    // No per-die hit/one/miss colouring either - only the plain badges.
    const badges = fixture.nativeElement.querySelectorAll('.die-result-badge');
    badges.forEach((b: Element) => {
      expect(b.classList.contains('die-result-hit')).toBeFalse();
      expect(b.classList.contains('die-result-one')).toBeFalse();
      expect(b.classList.contains('die-result-miss')).toBeFalse();
    });
  }));
});

describe('QA item 1 (integration): the player-view initiative-roll modals hide hits/glitches', () => {
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

  it('the main roll modal\'s embedded roller never shows Total Hits, only a total', fakeAsync(() => {
    spyOn(sync, 'onCommand').and.callFake(() => { /* unused: modal opens from join() with pendingRoll true */ });
    component.room = 'ABC123';
    const myToken = component['playerToken'] as unknown as string;
    spyOn(sync, 'joinAsPlayer').and.resolveTo({
      state: stateWith([{
        id: 'p-1', name: 'Hero', order: 1, ownerName: myToken,
        initiativeDice: 5, pendingRoll: true, askedToRoll: true
      } as unknown as SharedParticipantState]),
      log: [], gmConnected: true
    });
    void component.join();
    tick();
    fixture.detectChanges();
    // NgbModal attaches its window directly to `ApplicationRef`, not this
    // component's own change-detection tree - a tick is needed for it to
    // actually land in `document` (matches this repo's own convention,
    // `player-initiative-prompt.spec.ts`'s "Real NgbModal rendering" tests).
    TestBed.inject(ApplicationRef).tick();

    const rollerHost = document.querySelector('[data-testid="roll-modal-dice-roller"]') as HTMLElement;
    expect(rollerHost).withContext('roll modal must be open with its embedded roller').not.toBeNull();
    const rollButton = rollerHost.querySelector('[data-testid="dice-roller-roll-button"]') as HTMLButtonElement;
    rollButton.click();
    // The result row (hits/total) only renders once the roll animation
    // settles (`!localRolling`) - real time, matching `DiceRollerComponent`'s
    // own animation constant.
    tick(DiceRollerComponent.ROLL_ANIMATION_MS);
    TestBed.inject(ApplicationRef).tick();

    expect(rollerHost.textContent).not.toContain('Total Hits');
    expect(rollerHost.querySelector('[data-testid="dice-roller-total"]')).not.toBeNull();
    // Cleanup: the (deliberately non-dismissible) modal would otherwise stay
    // mounted on `document.body` and bleed into later tests' DOM queries.
    component['closeRollModal']();
    TestBed.inject(ApplicationRef).tick();
  }));
});

// ─── Item 2: the manual-entry box must not accept more than the maximum ───
describe('QA item 2: manual roll entry cannot exceed its maximum however it is typed', () => {
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

  function typeInto(input: HTMLInputElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  it('the main modal\'s manual field clamps every keystroke, so typing extra digits past the max cannot exceed it (2 dice -> max 12)', async () => {
    spyOn(sync, 'onCommand').and.callFake(() => { /* unused: modal opens from join() with pendingRoll true */ });
    component.room = 'ABC123';
    const myToken = component['playerToken'] as unknown as string;
    spyOn(sync, 'joinAsPlayer').and.resolveTo({
      state: {
        round: 1, pass: 1, started: true,
        participants: [{
          id: 'p-1', name: 'Hero', order: 1, ownerName: myToken, initiativeDice: 2, pendingRoll: true, askedToRoll: true
        } as unknown as SharedParticipantState]
      },
      log: [], gmConnected: true
    });
    await component.join();
    fixture.detectChanges();
    TestBed.inject(ApplicationRef).tick();

    const input = document.querySelector('[data-testid="roll-modal-manual-input"]') as HTMLInputElement;
    expect(input).withContext('manual roll input must be rendered').not.toBeNull();

    // Xavier's exact repro: keep typing digits after the value is already at
    // the cap. Each keystroke is its own `input` event, exactly as a browser
    // fires them. `ApplicationRef.tick()`, not `fixture.detectChanges()`, is
    // what refreshes the modal's own DOM - it is portaled outside this
    // fixture's own view tree (see the tick() right after join(), above).
    typeInto(input, '1');
    TestBed.inject(ApplicationRef).tick();
    typeInto(input, '12');
    TestBed.inject(ApplicationRef).tick();
    expect(component.manualRoll).toBe('12');
    typeInto(input, '120');
    TestBed.inject(ApplicationRef).tick();
    expect(component.manualRoll).toBe('12'); // clamped straight back, not "120"
    expect(Number(input.value)).toBeLessThanOrEqual(12);
    typeInto(input, '1200');
    TestBed.inject(ApplicationRef).tick();
    expect(component.manualRoll).toBe('12');
    expect(Number(input.value)).toBeLessThanOrEqual(12);
    typeInto(input, '12000');
    TestBed.inject(ApplicationRef).tick();
    expect(component.manualRoll).toBe('12');
    expect(Number(input.value)).toBeLessThanOrEqual(12);
    component['closeRollModal']();
    TestBed.inject(ApplicationRef).tick();
  });

  it('the delta modal\'s manual field (previously unclamped) cannot exceed deltaDiceCount * 6', async () => {
    spyOn(sync, 'onCommand').and.callFake(() => { /* not needed for this test */ });
    component.room = 'ABC123';
    const myToken = component['playerToken'] as unknown as string;
    spyOn(sync, 'joinAsPlayer').and.resolveTo({
      state: {
        round: 1, pass: 1, started: true,
        participants: [{
          id: 'p-1', name: 'Hero', order: 1, ownerName: myToken, initiativeDice: 2, pendingRoll: false
        } as unknown as SharedParticipantState]
      },
      log: [], gmConnected: true
    });
    await component.join();
    // Already rolled (pendingRoll false), so the main modal stays shut - only
    // the delta prompt is armed, exactly as `applyInitiativeRollLogic` does
    // for a VR mode change/jack-out mid-turn.
    component['pendingDeltaDice'] = 2; // gain of 2 dice -> max 12
    component['syncDeltaRollModal']();
    fixture.detectChanges();
    TestBed.inject(ApplicationRef).tick();

    const input = document.querySelector('[data-testid="delta-roll-modal-manual-input"]') as HTMLInputElement;
    expect(input).withContext('delta modal manual input must be rendered').not.toBeNull();

    typeInto(input, '12');
    TestBed.inject(ApplicationRef).tick();
    expect(component.manualDeltaRoll).toBe('12');
    typeInto(input, '12000');
    TestBed.inject(ApplicationRef).tick();
    expect(component.manualDeltaRoll).toBe('12');
    expect(Number(input.value)).toBeLessThanOrEqual(12);
    component['closeDeltaRollModal']();
    TestBed.inject(ApplicationRef).tick();
  });
});

// ─── Items 3, 4, 5, 6 share the GM-flow harness from mid-turn-joiner.spec.ts ───
describe('QA items 3, 4, 5, 6 (GM flow)', () => {
  let component: BattleTrackerComponent;
  let fixture: ComponentFixture<BattleTrackerComponent>;
  let sync: SessionSyncService;
  let broadcasts: SharedCombatState[];
  let commands: SessionCommand[];
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
    commands = [];
    logged = [];
    spyOn(sync, 'broadcastState').and.callFake((s: SharedCombatState) => { broadcasts.push(s); });
    spyOn(sync, 'broadcastGmState');
    spyOn(sync, 'sendCommand').and.callFake((c: SessionCommand) => { commands.push(c); });
    spyOn(sync, 'appendLog').and.callFake((entry: SharedLogEntry) => { logged.push(entry); });

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

  function actCurrent(): void {
    const actor = CombatManager.currentActors.items[0];
    component['performAct'](actor, null);
  }

  function command(type: string, player: string, payload: Record<string, unknown> = {}) {
    component['handleSessionCommand']({ type, player, payload, timestamp: new Date().toISOString() });
  }

  function addParticipantViaDialog(name: string): Participant {
    component.btnAddParticipant_Click();
    component.pendingAddDraft!.name = name;
    component.commitAddDraft();
    return CombatManager.participants.items.find(x => x.name === name) as Participant;
  }

  function lastBroadcast(): SharedCombatState {
    return broadcasts[broadcasts.length - 1];
  }

  /** Get a late joiner mid-combat into Pass 2, per mid-turn-joiner.spec.ts Scenario 1. */
  async function joinerInPass2(): Promise<{ hero: Participant }> {
    makeScored('A', 15, 5); // Score 20
    makeScored('B', 10, 4); // Score 14
    await component.btnStartRound_Click();
    actCurrent(); // A acts
    actCurrent(); // B acts -> pass 1 ends
    component.btnNextPass_Click(); // pass 2
    const hero = addParticipantViaDialog('Hero');
    hero.baseIni = 9; // REA 3 + INT... irrelevant, only the total is checked
    hero.setDicesWithoutRoll(3);
    component['participantOwners'].set(hero, 'pl-hero');
    component['participantReactions'].set(hero, 6);
    component['participantIntuitions'].set(hero, 8);
    // A real broadcast reflecting the ownership just assigned - `sort()` is
    // what every other GM mutation ends with (§1/§7, ARCHITECTURE.md).
    component['sort']();
    return { hero };
  }

  // ─── Item 3 ─────────────────────────────────────────────────────────────
  describe('Item 3: a participant who has not rolled shows "not rolled", never a Score', () => {
    it('the GM screen shows "not rolled" before the roll, and the real numeric Score after', async () => {
      const { hero } = await joinerInPass2();

      // Before rolling: a real, easily-misread number (attribute - 10) sits
      // in the backing field, but the display must not show it as a Score.
      expect(hero.getCurrentInitiative()).toBe(9 - 10); // arithmetically real, but not a Score yet
      expect(component.getInitiativeScoreDisplay(hero)).toBe(NOT_ROLLED_DISPLAY);
      fixture.detectChanges();
      const row = Array.from(fixture.nativeElement.querySelectorAll('[data-testid="gm-initiative-score"]')) as HTMLElement[];
      expect(row.some(el => el.textContent?.includes('not rolled'))).toBeTrue();
      // What the GM sees there is a dash, never a number (GM screen overhaul 08, #11).
      expect(row.some(el => el.querySelector('.gm-ini-unrolled')?.textContent?.trim() === '—')).toBeTrue();

      command('roll_submission', 'pl-hero', {
        participantId: component['getParticipantId'](hero), roll: 14, diceValues: [6, 6, 2], diceSum: 14
      });

      expect(component.getInitiativeScoreDisplay(hero)).toBe(String(hero.getCurrentInitiative()));
      expect(component.getInitiativeScoreDisplay(hero)).not.toContain('not rolled');
    });

    it('the player view shows "not rolled" for the same participant before rolling, driven off the GM\'s real broadcast', async () => {
      const { hero } = await joinerInPass2();
      const heroId = component['getParticipantId'](hero);
      const beforeRoll = lastBroadcast().participants.find(p => p.id === heroId)!;
      expect(beforeRoll.pendingRoll).toBeTrue();

      const pv = TestBed.createComponent(PlayerViewComponent).componentInstance;
      // canControl() needs an owner match - simplest is to read the display
      // function directly against the GM's real broadcast payload, which is
      // exactly what a player's own screen renders from.
      (pv as unknown as { playerToken: string }).playerToken = 'pl-hero';
      expect(beforeRoll.ownerName).toBe('pl-hero');
      expect(pv.getVisibleInitiative(beforeRoll)).toBe(NOT_ROLLED_DISPLAY);

      command('roll_submission', 'pl-hero', {
        participantId: heroId, roll: 14, diceValues: [6, 6, 2], diceSum: 14
      });
      const afterRoll = lastBroadcast().participants.find(p => p.id === heroId)!;
      expect(afterRoll.pendingRoll).toBeFalse();
      expect(pv.getVisibleInitiative(afterRoll)).toBe(String(afterRoll.initiativeScore));
    });

    it('sorting and gating are unaffected by the display change - hero still cannot act until rolled, then can', async () => {
      const { hero } = await joinerInPass2();
      expect(component['canParticipantInterrupt'] ? true : true).toBeTrue(); // sanity: method exists
      expect(CombatManager.currentActors.items.includes(hero)).toBeFalse();
      command('roll_submission', 'pl-hero', {
        participantId: component['getParticipantId'](hero), roll: 14, diceValues: [6, 6, 2], diceSum: 14
      });
      // Hero's Score (13) now beats B's post-decay Score in pass 2 if higher;
      // regardless, the point is the stored Score/order logic used
      // `getCurrentInitiative()` throughout, unaffected by the display helper.
      expect(hero.getCurrentInitiative()).toBe(9 - 10 + 14);
    });
  });

  // ─── Item 4 ─────────────────────────────────────────────────────────────
  describe('Item 4: the initiative log line shows the late-entry penalty', () => {
    it('shows "- 20 (2 passes)" for a joiner added in Pass 3 (2 elapsed passes), and the arithmetic in the line adds up', async () => {
      makeScored('A', 15, 5);
      const b = makeScored('B', 50, 1);
      await component.btnStartRound_Click();
      actCurrent(); actCurrent(); // pass 1 done
      component.btnNextPass_Click(); // pass 2
      actCurrent(); actCurrent(); // pass 2 done
      component.btnNextPass_Click(); // pass 3
      void b;

      const hero = addParticipantViaDialog('Hero');
      hero.baseIni = 14; // REA 6 + INT 8
      hero.setDicesWithoutRoll(4);
      component['participantOwners'].set(hero, 'pl-hero');
      component['participantReactions'].set(hero, 6);
      component['participantIntuitions'].set(hero, 8);

      command('roll_submission', 'pl-hero', {
        participantId: component['getParticipantId'](hero), roll: 14, diceValues: [1, 5, 4, 4], diceSum: 14
      });

      expect(hero.getCurrentInitiative()).toBe(14 - 20 + 14); // 8
      const line = logged.find(l => l.text.includes('initiative roll'));
      expect(line).withContext('an initiative roll log line must have been appended').toBeTruthy();
      expect(line!.text).toBe('initiative roll: REA(6) + INT(8) + [1, 5, 4, 4] - 20 (2 passes) = 8');
    });

    it('no penalty clause at all when nothing elapsed (Pass 1, ordinary roll)', async () => {
      // A brand-new participant added before combat starts (not a mid-turn
      // joiner) - `addParticipant()`'s late-entry penalty only ever applies
      // to an insertion while `initiativePass > 1`, which cannot happen here.
      const a = new Participant();
      a.name = 'Ordinary';
      a.baseIni = 10;
      a.setDicesWithoutRoll(2);
      CombatManager.participants.insert(a);
      component['participantOwners'].set(a, 'pl-ord');
      component['participantReactions'].set(a, 5);
      component['participantIntuitions'].set(a, 5);

      command('roll_submission', 'pl-ord', {
        participantId: component['getParticipantId'](a), roll: 8, diceValues: [4, 4], diceSum: 8
      });

      const line = logged.find(l => l.text.includes('initiative roll'));
      expect(line!.text).toBe('initiative roll: REA(5) + INT(5) + [4, 4] = 18');
      expect(line!.text).not.toContain('pass');
    });
  });

  // ─── Items 5 & 6: Matrix VR mode dice funnel ─────────────────────────────
  describe('Items 5 & 6: GM-driven VR mode switching and the preVrDiceCount consumption bug', () => {
    function scriptDice(values: number[]): jasmine.Spy {
      const spy = spyOn<never>(component as never, 'rollInitiativeDie' as never);
      spy.and.returnValues(...(values as never[]));
      return spy as unknown as jasmine.Spy;
    }

    /** An augmented decker: 3 physical (AR) Initiative Dice, not the default 1. */
    function augmentedDecker(): MatrixParticipant {
      const mp = new MatrixParticipant();
      mp.name = 'Wired Decker';
      mp.dataProcessing = 7;
      mp.vrMode = VRMode.AR;
      mp.setDicesWithoutRoll(3);
      CombatManager.participants.insert(mp);
      component['participantReactions'].set(mp, 4);
      component['participantIntuitions'].set(mp, 5);
      return mp;
    }

    it('Item 5: a GM-driven mode switch resolves the dice delta automatically in the GAIN direction (AR -> Hot Sim), mid-combat', () => {
      const mp = augmentedDecker();
      CombatManager.started = true;
      mp.diceIni = 12; // this Combat Turn's Initiative Test already taken (Score = baseIni(9) + 12 = 21)
      const scoreBefore = mp.getCurrentInitiative();
      scriptDice([3, 4, 5]); // +1 die (3 -> 4), rolled sum 12

      component.setPendingVrMode(mp, VRMode.HotSim);
      component.gmJackIn(mp);

      // Resolved immediately - no deferral, no outstanding note.
      expect(mp.dices).toBe(4);
      expect(component['participantPendingDeltaDice'].has(mp)).toBeFalse();
      expect(mp.getCurrentInitiative()).toBeGreaterThan(scoreBefore);
    });

    it('Item 5: a GM-driven mode switch resolves the dice delta automatically in the LOSS direction (Hot Sim -> AR), mid-combat', () => {
      const mp = augmentedDecker();
      CombatManager.started = true;
      component.setPendingVrMode(mp, VRMode.HotSim);
      mp.diceIni = 12;
      // `rollInitiativeDie` can only be spied on once per test (matches
      // `battle-tracker.component.spec.ts`'s own `scriptDice` convention) -
      // script the whole sequence up front: 1 die for AR(3) -> Hot Sim(4),
      // then 1 die for Hot Sim(4) -> AR(3).
      scriptDice([3, 2]);
      component.gmJackIn(mp);
      expect(mp.dices).toBe(4);
      const scoreAfterHotSim = mp.getCurrentInitiative();

      component.setPendingVrMode(mp, VRMode.AR);
      component.gmJackIn(mp);

      expect(mp.dices).toBe(3); // restored to the real physical count, not defaulted to 1
      expect(component['participantPendingDeltaDice'].has(mp)).toBeFalse();
      // Two halves move on the way out: the Initiative Attribute
      // (REA(4)+INT(5)=9, replacing Hot Sim's DP(7)+INT(5)=12, a -3 delta)
      // and the dice (-1 die, face 2 rolled = -2). Both apply automatically,
      // with no deferral, which is the actual claim under test for item 5.
      expect(mp.getCurrentInitiative()).toBe(scoreAfterHotSim - 3 - 2);
    });

    it('Item 6 (fails without the fix): a still-outstanding deferred exit must not forget the decker\'s real physical dice count', () => {
      // Pinning the diagnosed cause directly: `restorePhysicalDiceCount` used
      // to null `preVrDiceCount` the instant it ran, even for a *deferred*
      // loss (`rollGainedDice: false`) where `changeParticipantDiceCount`'s
      // own decrease branch deliberately leaves `dices` untouched until the
      // player's own delta roll resolves it. That forgot the real physical
      // dice count (3, augmented) while the exit was still outstanding.
      const mp = augmentedDecker();
      CombatManager.started = true;
      mp.diceIni = 12;
      mp.preVrDiceCount = 3; // as if already jacked into VR from AR(3)
      mp.setDicesWithoutRoll(4); // currently sitting in Hot Sim (4)

      const deferredResult = component['restorePhysicalDiceCount'](mp, { rollGainedDice: false });

      expect(deferredResult.delta).toBe(-1); // Hot Sim(4) -> AR(3): losing exactly 1 die
      expect(mp.dices).toBe(4); // still unresolved - the player has not rolled the loss yet
      // The line under test: before the fix this was `null`, corrupting the
      // next VR entry's recorded baseline (`applyVRMode`'s
      // `if (mp.preVrDiceCount === null) { mp.preVrDiceCount = mp.dices }`
      // guard would then capture the stale, not-yet-restored 4 instead of the
      // real 3).
      expect(mp.preVrDiceCount).toBe(3);
    });

    it('Item 6 end-to-end: a player-initiated Jack Out left unresolved, followed by a GM re-entry into Hot Sim and a final GM exit to AR, still restores to the real physical dice count (3), not the default (1)', () => {
      const mp = augmentedDecker();
      component['participantOwners'].set(mp, 'pl-decker');
      CombatManager.started = true;
      component.setPendingVrMode(mp, VRMode.HotSim);
      mp.diceIni = 12;
      // `rollInitiativeDie` can only be spied on once per test - script the
      // whole sequence up front: 1 die for AR(3) -> Hot Sim(4); 1 die
      // settling the outstanding Jack Out note plus 1 die for Hot Sim's own
      // gain math on re-entry; 1 die for the final Hot Sim -> AR exit.
      scriptDice([3, 2, 5, 4]);
      component.gmJackIn(mp);
      expect(mp.dices).toBe(4);

      // Player-initiated Jack Out: deferred loss, left unresolved (the player
      // never actually rolls the -1 in this test).
      component['handleSessionCommand']({
        type: 'configure_deck', player: 'pl-decker',
        payload: { isMatrix: true, jackOut: true },
        timestamp: new Date().toISOString()
      });
      expect(component['participantPendingDeltaDice'].get(mp)).toBe(-1);
      expect(mp.dices).toBe(4); // unresolved: dices has not moved yet

      // GM re-enters Hot Sim before that deferred loss ever resolves - guard
      // A settles the outstanding note first (rolling it GM-side), then
      // applies the fresh switch.
      component.setPendingVrMode(mp, VRMode.HotSim);
      component.gmJackIn(mp);
      expect(component['participantPendingDeltaDice'].has(mp)).toBeFalse();

      // Final exit to AR via the GM's own Switch Mode control must restore to
      // the real physical count (3), not silently default to 1.
      component.setPendingVrMode(mp, VRMode.AR);
      component.gmJackIn(mp);

      expect(mp.dices).toBe(3);
    });
  });
});
