// GM screen overhaul, ticket 02 (GitHub #5, spec #3): the participant panel's
// extras - Escape closes it, adding someone opens their panel on Stats,
// deleting the open participant closes it (Leave combat does not), and the
// open panel is remembered after a refresh (user stories 40, 43-45, 62, 64,
// 65).
//
// A "refresh" is built the way it happens at the table: the GM's screen is
// thrown away, a new one is built on the same browser storage, and the GM
// rejoins their room, which brings the participants back from the room's
// copy. Glossary terms (CONTEXT.md): participant panel, participant.

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BattleTrackerComponent } from 'app/battle-tracker/battle-tracker.component';
import { appConfig } from 'app/app.config';
import { CombatManager } from 'Combat';
import { Participant } from 'Combat/Participants/Participant';
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

describe('Participant panel extras (GM screen overhaul 02, #5)', () => {
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

  /**
   * Refresh the page: this screen goes away, a new one is built on the same
   * browser storage, and the GM rejoins the room, which brings back the
   * participants the room held.
   */
  function refreshAndRejoin(): void {
    component.shareRoomCode = 'ABC123';
    component['syncSharedState']();
    const state = states[states.length - 1];
    const gmState = gmStates[gmStates.length - 1];
    fixture.destroy();
    resetCombat();
    buildScreen();
    rejoin(state, gmState);
  }

  function rejoin(state: SharedCombatState, gmState: SharedGmState): void {
    component['restoreFromSharedState'](state, gmState);
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

  function byName(name: string): Participant {
    const p = CombatManager.participants.items.find(x => x.name === name);
    expect(p).withContext('participant ' + name).toBeTruthy();
    return p as Participant;
  }

  function rowOf(p: Participant | unknown): HTMLElement {
    const i = CombatManager.participants.items.indexOf(p as Participant);
    const row = el().querySelector('#participant' + i) as HTMLElement;
    expect(row).withContext('row for participant').toBeTruthy();
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

  function openTab(label: string): void {
    const tab = Array.from(panel()!.querySelectorAll('nav button'))
      .find(b => (b.textContent || '').trim() === label) as HTMLButtonElement | undefined;
    expect(tab).withContext(label + ' tab').toBeTruthy();
    tab!.click();
    fixture.detectChanges();
  }

  function clickName(p: Participant | unknown): void {
    (rowOf(p).querySelector('input.gm-name-input') as HTMLInputElement).click();
    fixture.detectChanges();
  }

  function pressEscape(): void {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
  }

  /** A row menu item (GM screen overhaul 08, #11), found by its tooltip after opening the menu. */
  function rowButton(p: Participant | unknown, title: string): HTMLButtonElement {
    (rowOf(p).querySelector('[data-testid="row-menu-btn"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const b = rowOf(p).querySelector(`.dropdown-menu.show button[title="${title}"]`) as HTMLButtonElement | null;
    expect(b).withContext(title + ' button').toBeTruthy();
    return b!;
  }

  // ── look ───────────────────────────────────────────────────────────────

  it('the panel says under the name what kind of participant it is', () => {
    const kestrel = scored('Kestrel', 8, 3);
    fixture.detectChanges();
    clickName(kestrel);
    const description = () =>
      (panel()!.querySelector('[data-testid="participant-panel-description"]')?.textContent || '').trim();
    expect(description()).toBe('Character');

    component.btnAddNpcRow_Click();
    component.pendingAddDraft!.name = 'Halloweeners';
    component.commitAddDraft();
    fixture.detectChanges();
    expect(description()).toBe('Grunt group');
  });

  // ── Escape ─────────────────────────────────────────────────────────────

  it('Escape closes an open participant panel', () => {
    const kestrel = scored('Kestrel', 8, 3);
    fixture.detectChanges();
    clickName(kestrel);
    expect(panel()).withContext('open before Escape').toBeTruthy();

    pressEscape();

    expect(panel()).withContext('closed by Escape').toBeNull();
  });

  it('Escape while a pop-up is open leaves the panel open', () => {
    const kestrel = scored('Kestrel', 8, 3);
    fixture.detectChanges();
    clickName(kestrel);
    component.btnAddParticipant_Click(); // opens the add pop-up
    fixture.detectChanges();

    pressEscape();

    expect(panelName()).toBe('Kestrel');
    component.cancelAddDraft();
  });

  // ── adding opens the panel on Stats ────────────────────────────────────

  it('adding a character opens their panel on the Stats tab', () => {
    const kestrel = scored('Kestrel', 8, 3);
    fixture.detectChanges();
    clickName(kestrel);
    openTab('Condition');

    component.btnAddParticipant_Click();
    component.pendingAddDraft!.name = 'Razor';
    component.commitAddDraft();
    fixture.detectChanges();

    expect(panelName()).toBe('Razor');
    expect(activeTab()).toBe('Stats');
  });

  it('adding a grunt opens their panel on the Stats tab', () => {
    component.btnAddGrunt_Click();
    component.pendingAddDraft!.name = 'Ganger';
    component.commitAddDraft();
    fixture.detectChanges();

    expect(panelName()).toBe('Ganger');
    expect(activeTab()).toBe('Stats');
  });

  it('adding a grunt group opens its panel on the Stats tab', () => {
    component.btnAddNpcRow_Click();
    component.pendingAddDraft!.name = 'Halloweeners';
    component.commitAddDraft();
    fixture.detectChanges();

    expect(panelName()).toBe('Halloweeners');
    expect(activeTab()).toBe('Stats');
  });

  it('the screen starts with the panel closed when nothing is remembered', () => {
    fixture.destroy();
    resetCombat();
    buildScreen();

    expect(CombatManager.participants.count).withContext('the blank participant is still added').toBe(1);
    expect(panel()).toBeNull();
  });

  // ── delete and Leave combat ────────────────────────────────────────────

  it('deleting the participant whose panel is open closes it, after the usual confirmation', async () => {
    const kestrel = scored('Kestrel', 8, 3);
    fixture.detectChanges();
    clickName(kestrel);
    const confirm = spyOn(component['confirmationDialog'], 'simpleConfirm').and.resolveTo(true);

    rowButton(kestrel, 'Delete this participant').click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(confirm).toHaveBeenCalled();
    expect(CombatManager.participants.contains(kestrel)).toBeFalse();
    expect(panel()).toBeNull();
  });

  it('deleting someone else leaves the open panel alone', async () => {
    const kestrel = scored('Kestrel', 8, 3);
    const razor = scored('Razor', 10, 5);
    fixture.detectChanges();
    clickName(kestrel);
    spyOn(component['confirmationDialog'], 'simpleConfirm').and.resolveTo(true);

    rowButton(razor, 'Delete this participant').click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(panelName()).toBe('Kestrel');
  });

  it('Leave combat keeps the participant\'s panel open', () => {
    const kestrel = scored('Kestrel', 8, 3);
    fixture.detectChanges();
    clickName(kestrel);

    rowButton(kestrel, 'Leave combat').click();
    fixture.detectChanges();

    expect(kestrel.ooc).withContext('left combat as before').toBeTrue();
    expect(panelName()).toBe('Kestrel');
  });

  // ── remembering after a refresh ────────────────────────────────────────

  it('after a refresh, the same participant\'s panel reopens on the same tab', () => {
    scored('Razor', 10, 5);
    const kestrel = scored('Kestrel', 8, 3);
    fixture.detectChanges();
    clickName(kestrel);
    openTab('Stats');

    refreshAndRejoin();

    expect(panelName()).toBe('Kestrel');
    expect(activeTab()).toBe('Stats');
  });

  it('after a refresh, a panel left on Condition reopens on Condition', () => {
    const kestrel = scored('Kestrel', 8, 3);
    fixture.detectChanges();
    clickName(kestrel);
    openTab('Stats');
    openTab('Condition');

    refreshAndRejoin();

    expect(panelName()).toBe('Kestrel');
    expect(activeTab()).toBe('Condition');
  });

  it('the panel stays closed after the refresh until the GM rejoins the room', () => {
    const kestrel = scored('Kestrel', 8, 3);
    fixture.detectChanges();
    clickName(kestrel);
    component.shareRoomCode = 'ABC123';
    component['syncSharedState']();
    const state = states[states.length - 1];
    const gmState = gmStates[gmStates.length - 1];
    fixture.destroy();
    resetCombat();
    buildScreen();

    expect(panel()).withContext('before rejoining').toBeNull();

    rejoin(state, gmState);
    expect(panelName()).toBe('Kestrel');
  });

  it('a panel closed with × stays closed after a refresh', () => {
    const kestrel = scored('Kestrel', 8, 3);
    fixture.detectChanges();
    clickName(kestrel);
    (panel()!.querySelector('[data-testid="participant-panel-close"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    refreshAndRejoin();

    expect(panel()).toBeNull();
  });

  it('a remembered participant who is gone leaves the panel closed, with no message', () => {
    const kestrel = scored('Kestrel', 8, 3);
    fixture.detectChanges();
    clickName(kestrel);
    fixture.destroy();
    resetCombat();
    buildScreen();

    // The GM joins a room where Kestrel isn't.
    resetCombat();
    scored('Razor', 10, 5);
    component.shareRoomCode = 'XYZ789';
    component['syncSharedState']();
    const state = states[states.length - 1];
    const gmState = gmStates[gmStates.length - 1];
    resetCombat();
    rejoin(state, gmState);

    expect(byName('Razor')).toBeTruthy();
    expect(panel()).toBeNull();
    // The usual rejoin notice appears as it always does; nothing is added
    // about the missing participant.
    expect(component.restoreWarning).not.toContain('Kestrel');
    expect(component.shareError).toBe('');
  });

  describe('when the browser blocks storage', () => {
    beforeEach(() => {
      spyOn(Storage.prototype, 'getItem').and.throwError('SecurityError');
      spyOn(Storage.prototype, 'setItem').and.throwError('SecurityError');
      spyOn(Storage.prototype, 'removeItem').and.throwError('SecurityError');
    });

    it('the screen builds, the panel opens and closes, and a refresh starts it closed', () => {
      fixture.destroy();
      resetCombat();
      expect(() => buildScreen()).not.toThrow();
      resetCombat();
      const kestrel = scored('Kestrel', 8, 3);
      fixture.detectChanges();

      clickName(kestrel);
      openTab('Stats');
      expect(panelName()).toBe('Kestrel');
      pressEscape();
      expect(panel()).toBeNull();
      clickName(kestrel);

      refreshAndRejoin();

      expect(byName('Kestrel')).toBeTruthy();
      expect(panel()).toBeNull();
    });
  });
});
