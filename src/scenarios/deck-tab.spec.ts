// GM screen overhaul, ticket 04 (GitHub #7, spec #3): the Deck tab replaces
// the Deck panel that used to drop open under a participant's row (user
// stories 18, 23, 32, 37). The row's Deck button opens the participant panel
// on the Deck tab; the tab holds every control the old Deck panel had, and
// each does exactly what it did before (the spec's ground rule).
//
// Built the same way as the other participant panel tests: the whole GM
// screen, driven through its buttons and boxes. Glossary terms (CONTEXT.md):
// participant panel, participant, grunt group.

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BattleTrackerComponent } from 'app/battle-tracker/battle-tracker.component';
import { appConfig } from 'app/app.config';
import { CombatManager } from 'Combat';
import { Participant } from 'Combat/Participants/Participant';
import { MatrixParticipant, VRMode } from 'Matrix';
import { SessionSyncService, SharedCombatState, SharedGmState } from 'app/services/session-sync.service';
import { PARTICIPANT_PANEL_MEMORY_KEY } from 'app/battle-tracker/gm-screen-memory';

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

function forgetPanel() {
  try { localStorage.removeItem(PARTICIPANT_PANEL_MEMORY_KEY); } catch { /* blocked */ }
}

describe('Deck tab (GM screen overhaul 04, #7)', () => {
  let component: BattleTrackerComponent;
  let fixture: ComponentFixture<BattleTrackerComponent>;
  let states: SharedCombatState[];
  let gmStates: SharedGmState[];

  beforeEach(async () => {
    forgetPanel();
    resetCombat();
    await TestBed.configureTestingModule({
      imports: [BattleTrackerComponent],
      providers: appConfig.providers
    }).compileComponents();
    const sync = TestBed.inject(SessionSyncService);
    states = [];
    gmStates = [];
    spyOn(sync, 'broadcastState').and.callFake((s: SharedCombatState) => { states.push(s); });
    spyOn(sync, 'broadcastGmState').and.callFake((g: SharedGmState) => { gmStates.push(g); });
    spyOn(sync, 'appendLog');
    buildScreen();
    // Every test builds its own roster: drop the blank participant the
    // screen starts with.
    resetCombat();
    fixture.detectChanges();
  });

  afterEach(() => {
    resetCombat();
    forgetPanel();
  });

  // ── helpers ────────────────────────────────────────────────────────────

  function buildScreen(): void {
    fixture = TestBed.createComponent(BattleTrackerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function scored(name: string, baseIni: number, roll: number): Participant {
    const p = new Participant();
    p.name = name;
    p.baseIni = baseIni;
    p.setDicesWithoutRoll(1);
    CombatManager.participants.insert(p);
    p.diceIni = roll;
    return p;
  }

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** The participant called `name`, as the screen holds them right now. */
  function byName(name: string): Participant {
    const p = CombatManager.participants.items.find(x => x.name === name);
    expect(p).withContext('participant ' + name).toBeTruthy();
    return p as Participant;
  }

  function rowOf(name: string): HTMLElement {
    const i = CombatManager.participants.items.indexOf(byName(name));
    const row = el().querySelector('#participant' + i) as HTMLElement;
    expect(row).withContext('row for ' + name).toBeTruthy();
    return row;
  }

  function panel(): HTMLElement | null {
    return el().querySelector('[data-testid="participant-panel"]');
  }

  function panelName(): string {
    return (panel()?.querySelector('[data-testid="participant-panel-name"]')?.textContent || '').trim();
  }

  function activeTab(): string {
    return (panel()?.querySelector('nav button.active')?.textContent || '').trim();
  }

  function tabLabels(): string[] {
    return Array.from(panel()!.querySelectorAll('nav button')).map(b => (b.textContent || '').trim());
  }

  function pressDeck(name: string): void {
    (rowOf(name).querySelector('[data-testid="deck-btn"]') as HTMLButtonElement).click();
    fixture.detectChanges();
  }

  function deckTab(): HTMLElement {
    const tab = panel()?.querySelector('[data-testid="deck-tab"]') as HTMLElement | null;
    expect(tab).withContext('Deck tab content').toBeTruthy();
    return tab!;
  }

  /** A button in the Deck tab by its words. */
  function deckButton(words: string): HTMLButtonElement {
    const b = Array.from(deckTab().querySelectorAll('button'))
      .find(x => (x.textContent || '').trim() === words) as HTMLButtonElement | undefined;
    expect(b).withContext(words + ' button').toBeTruthy();
    return b!;
  }

  function hasDeckButton(words: string): boolean {
    return Array.from(deckTab().querySelectorAll('button')).some(x => (x.textContent || '').trim() === words);
  }

  function press(words: string): void {
    deckButton(words).click();
    fixture.detectChanges();
  }

  function deckStatBox(title: string): HTMLInputElement {
    const box = deckTab().querySelector(`input[title="${title}"]`) as HTMLInputElement | null;
    expect(box).withContext(title + ' box').toBeTruthy();
    return box!;
  }

  function type(box: HTMLInputElement, value: string): void {
    box.value = value;
    box.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function asDecker(name: string): MatrixParticipant {
    const p = byName(name);
    expect(p instanceof MatrixParticipant).withContext(name + ' has a deck').toBeTrue();
    return p as MatrixParticipant;
  }

  // ── the Deck button ────────────────────────────────────────────────────

  it('the Deck button opens the participant panel on the Deck tab, and nothing opens under the row', () => {
    scored('Kestrel', 8, 3);
    fixture.detectChanges();

    pressDeck('Kestrel');

    expect(panelName()).toBe('Kestrel');
    expect(activeTab()).toBe('Deck');
    expect(el().querySelector('.deck-panel')).withContext('the old under-row Deck panel').toBeNull();
  });

  it('the Deck button switches an open panel to that participant\'s Deck tab', () => {
    scored('Kestrel', 8, 3);
    scored('Razor', 6, 2);
    fixture.detectChanges();
    pressDeck('Kestrel');

    pressDeck('Razor');

    expect(panelName()).toBe('Razor');
    expect(activeTab()).toBe('Deck');
  });

  it('the row\'s Deck button is filled while that participant\'s Deck tab is showing', () => {
    scored('Kestrel', 8, 3);
    scored('Razor', 6, 2);
    fixture.detectChanges();
    const filled = (name: string) =>
      rowOf(name).querySelector('[data-testid="deck-btn"]')!.classList.contains('btn-secondary');

    pressDeck('Kestrel');
    expect(filled('Kestrel')).toBeTrue();
    expect(filled('Razor')).toBeFalse();

    const stats = Array.from(panel()!.querySelectorAll('nav button'))
      .find(b => (b.textContent || '').trim() === 'Stats') as HTMLButtonElement;
    stats.click();
    fixture.detectChanges();
    expect(filled('Kestrel')).withContext('on the Stats tab').toBeFalse();
  });

  it('every participant except a grunt group has a Deck tab', () => {
    scored('Kestrel', 8, 3);
    fixture.detectChanges();
    pressDeck('Kestrel');
    expect(tabLabels()).toContain('Deck');

    component.btnAddGrunt_Click();
    component.pendingAddDraft!.name = 'Ganger';
    component.commitAddDraft();
    fixture.detectChanges();
    expect(tabLabels()).withContext('a lone grunt').toContain('Deck');

    component.btnAddNpcRow_Click();
    component.pendingAddDraft!.name = 'Halloweeners';
    component.commitAddDraft();
    fixture.detectChanges();
    expect(panelName()).toBe('Halloweeners');
    expect(tabLabels()).withContext('a grunt group').not.toContain('Deck');
    expect(rowOf('Halloweeners').querySelector('[data-testid="deck-btn"]'))
      .withContext('a grunt group row has no Deck button').toBeNull();
  });

  // ── no deck yet ────────────────────────────────────────────────────────

  it('with no deck set up, the tab offers Enable Deck, which sets one up as before', () => {
    scored('Kestrel', 8, 3);
    fixture.detectChanges();
    pressDeck('Kestrel');

    expect(deckTab().textContent).toContain('No deck configured.');
    expect(hasDeckButton('Jack In')).toBeFalse();

    press('Enable Deck');

    const kestrel = asDecker('Kestrel');
    expect(kestrel.jackedIn).toBeFalse();
    expect(panelName()).withContext('the panel follows the participant').toBe('Kestrel');
    expect(activeTab()).toBe('Deck');
    expect(hasDeckButton('Enable Deck')).toBeFalse();
    expect(hasDeckButton('Jack In')).toBeTrue();
    expect(hasDeckButton('Remove Deck')).toBeTrue();
  });

  // ── deck set up ────────────────────────────────────────────────────────

  it('typing a deck stat records it on the deck, as before', () => {
    scored('Kestrel', 8, 3);
    fixture.detectChanges();
    pressDeck('Kestrel');
    press('Enable Deck');

    type(deckStatBox('Attack'), '4');
    type(deckStatBox('Sleaze'), '3');
    type(deckStatBox('Firewall'), '5');
    type(deckStatBox('Device Rating'), '4');
    type(deckStatBox('Data Processing'), '6');

    const kestrel = asDecker('Kestrel');
    expect(kestrel.attack).toBe(4);
    expect(kestrel.sleaze).toBe(3);
    expect(kestrel.firewall).toBe(5);
    expect(kestrel.deviceRating).toBe(4);
    expect(component.getMatrixDataProcessingDisplayValue(kestrel)).toBe(6);
  });

  it('Hot Sim then Jack In jacks in at Hot Sim; Switch Mode and Jack Out work as before', () => {
    scored('Kestrel', 8, 3);
    fixture.detectChanges();
    pressDeck('Kestrel');
    press('Enable Deck');

    press('Hot Sim');
    press('Jack In');

    let kestrel = asDecker('Kestrel');
    expect(kestrel.jackedIn).toBeTrue();
    expect(kestrel.vrMode).toBe(VRMode.HotSim);
    expect(hasDeckButton('Jack In')).toBeFalse();
    expect(deckButton('Switch Mode').disabled)
      .withContext('Switch Mode is off while the chosen mode is the current one').toBeTrue();
    expect(deckTab().querySelector('app-matrix-participant-badge'))
      .withContext('the VR and OS chips').toBeTruthy();

    press('Cold Sim');
    expect(deckButton('Switch Mode').disabled).toBeFalse();
    press('Switch Mode');
    kestrel = asDecker('Kestrel');
    expect(kestrel.vrMode).toBe(VRMode.ColdSim);

    press('Jack Out');
    kestrel = asDecker('Kestrel');
    expect(kestrel.jackedIn).toBeFalse();
    expect(hasDeckButton('Jack In')).toBeTrue();
  });

  it('AR then Jack In jacks in at AR', () => {
    scored('Kestrel', 8, 3);
    fixture.detectChanges();
    pressDeck('Kestrel');
    press('Enable Deck');

    press('Hot Sim');
    press('AR');
    press('Jack In');

    const kestrel = asDecker('Kestrel');
    expect(kestrel.jackedIn).toBeTrue();
    expect(kestrel.vrMode).toBe(VRMode.AR);
  });

  it('Remove Deck takes the deck away and the tab offers Enable Deck again', () => {
    scored('Kestrel', 8, 3);
    fixture.detectChanges();
    pressDeck('Kestrel');
    press('Enable Deck');

    press('Remove Deck');

    expect(byName('Kestrel') instanceof MatrixParticipant).toBeFalse();
    expect(panelName()).toBe('Kestrel');
    expect(activeTab()).toBe('Deck');
    expect(hasDeckButton('Enable Deck')).toBeTrue();
  });

  // ── remembered after a refresh ─────────────────────────────────────────

  it('after a refresh, a panel left on the Deck tab reopens on the Deck tab', () => {
    scored('Kestrel', 8, 3);
    fixture.detectChanges();
    pressDeck('Kestrel');
    press('Enable Deck');

    component.shareRoomCode = 'ABC123';
    component['syncSharedState']();
    const state = states[states.length - 1];
    const gmState = gmStates[gmStates.length - 1];
    fixture.destroy();
    resetCombat();
    buildScreen();
    component['restoreFromSharedState'](state, gmState);
    fixture.detectChanges();

    expect(panelName()).toBe('Kestrel');
    expect(activeTab()).toBe('Deck');
    expect(hasDeckButton('Jack In')).toBeTrue();
  });
});
