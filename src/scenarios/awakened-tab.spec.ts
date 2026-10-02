// GM screen overhaul, ticket 05 (GitHub #8, spec #3): the Awakened tab
// replaces the Awakened panel that used to drop open under a participant's
// row (user stories 18, 23, 32, 38). The row's Awakened button opens the
// participant panel on the Awakened tab; the tab holds every control the old
// panel had (Enable Awakened, Astral Project / Return to Body, Remove
// Awakened), and each does exactly what it did before (the spec's ground rule).
//
// Built the same way as the other participant panel tests: the whole GM
// screen, driven through its buttons. Glossary terms (CONTEXT.md):
// participant panel, participant, grunt group, Awakened.

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BattleTrackerComponent } from 'app/battle-tracker/battle-tracker.component';
import { appConfig } from 'app/app.config';
import { CombatManager } from 'Combat';
import { Participant } from 'Combat/Participants/Participant';
import { AstralParticipant } from 'Magic';
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

describe('Awakened tab (GM screen overhaul 05, #8)', () => {
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

  function pressAwakened(name: string): void {
    (rowOf(name).querySelector('[data-testid="awakened-btn"]') as HTMLButtonElement).click();
    fixture.detectChanges();
  }

  function awakenedTab(): HTMLElement {
    const tab = panel()?.querySelector('[data-testid="awakened-tab"]') as HTMLElement | null;
    expect(tab).withContext('Awakened tab content').toBeTruthy();
    return tab!;
  }

  /** The tab's one line saying where they are. */
  function whereLine(): string {
    return (awakenedTab().querySelector('[data-testid="awakened-where"]')?.textContent || '')
      .replace(/\s+/g, ' ').trim();
  }

  /** A button in the Awakened tab by its words. */
  function awakenedButton(words: string): HTMLButtonElement {
    const b = Array.from(awakenedTab().querySelectorAll('button'))
      .find(x => (x.textContent || '').trim() === words) as HTMLButtonElement | undefined;
    expect(b).withContext(words + ' button').toBeTruthy();
    return b!;
  }

  function hasAwakenedButton(words: string): boolean {
    return Array.from(awakenedTab().querySelectorAll('button')).some(x => (x.textContent || '').trim() === words);
  }

  function press(words: string): void {
    awakenedButton(words).click();
    fixture.detectChanges();
  }

  function asAwakened(name: string): AstralParticipant {
    const p = byName(name);
    expect(p instanceof AstralParticipant).withContext(name + ' is Awakened').toBeTrue();
    return p as AstralParticipant;
  }

  // ── the Awakened button ────────────────────────────────────────────────

  it('the Awakened button opens the participant panel on the Awakened tab, and nothing opens under the row', () => {
    scored('Ashwood', 8, 3);
    fixture.detectChanges();

    pressAwakened('Ashwood');

    expect(panelName()).toBe('Ashwood');
    expect(activeTab()).toBe('Awakened');
    expect(el().querySelector('.astral-panel')).withContext('the old under-row Awakened panel').toBeNull();
  });

  it('pressing it again leaves the tab open (close with × or Escape)', () => {
    scored('Ashwood', 8, 3);
    fixture.detectChanges();

    pressAwakened('Ashwood');
    pressAwakened('Ashwood');

    expect(panelName()).toBe('Ashwood');
    expect(activeTab()).toBe('Awakened');
  });

  it('the Awakened button switches an open panel to that participant\'s Awakened tab', () => {
    scored('Ashwood', 8, 3);
    scored('Razor', 6, 2);
    fixture.detectChanges();
    pressAwakened('Ashwood');

    pressAwakened('Razor');

    expect(panelName()).toBe('Razor');
    expect(activeTab()).toBe('Awakened');
  });

  it('the row\'s Awakened button is filled while that participant\'s Awakened tab is showing', () => {
    scored('Ashwood', 8, 3);
    scored('Razor', 6, 2);
    fixture.detectChanges();
    const filled = (name: string) =>
      rowOf(name).querySelector('[data-testid="awakened-btn"]')!.classList.contains('btn-warning');

    pressAwakened('Ashwood');
    expect(filled('Ashwood')).toBeTrue();
    expect(filled('Razor')).toBeFalse();

    const stats = Array.from(panel()!.querySelectorAll('nav button'))
      .find(b => (b.textContent || '').trim() === 'Stats') as HTMLButtonElement;
    stats.click();
    fixture.detectChanges();
    expect(filled('Ashwood')).withContext('on the Stats tab').toBeFalse();
  });

  it('every participant except a grunt group has an Awakened tab, named "Awakened", never "Magic"', () => {
    scored('Ashwood', 8, 3);
    fixture.detectChanges();
    pressAwakened('Ashwood');
    expect(tabLabels()).toContain('Awakened');
    expect(tabLabels()).not.toContain('Magic');

    component.btnAddGrunt_Click();
    component.pendingAddDraft!.name = 'Ganger';
    component.commitAddDraft();
    fixture.detectChanges();
    expect(tabLabels()).withContext('a lone grunt').toContain('Awakened');

    component.btnAddNpcRow_Click();
    component.pendingAddDraft!.name = 'Halloweeners';
    component.commitAddDraft();
    fixture.detectChanges();
    expect(panelName()).toBe('Halloweeners');
    expect(tabLabels()).withContext('a grunt group').not.toContain('Awakened');
    expect(rowOf('Halloweeners').querySelector('[data-testid="awakened-btn"]'))
      .withContext('a grunt group row has no Awakened button').toBeNull();
  });

  // ── not Awakened yet ───────────────────────────────────────────────────

  it('not set up as Awakened: the tab offers Enable Awakened, which sets them up as before', () => {
    scored('Ashwood', 8, 3);
    fixture.detectChanges();
    pressAwakened('Ashwood');

    expect(awakenedTab().textContent).toContain('Not set up as Awakened.');
    expect(hasAwakenedButton('Astral Project')).toBeFalse();
    expect(hasAwakenedButton('Remove Awakened')).toBeFalse();

    press('Enable Awakened');

    const ashwood = asAwakened('Ashwood');
    expect(ashwood.astralProjecting).toBeFalse();
    expect(panelName()).withContext('the panel follows the participant').toBe('Ashwood');
    expect(activeTab()).toBe('Awakened');
    expect(whereLine()).toBe('Awakened · currently in their body');
    expect(hasAwakenedButton('Enable Awakened')).toBeFalse();
    expect(hasAwakenedButton('Astral Project')).toBeTrue();
    expect(hasAwakenedButton('Remove Awakened')).toBeTrue();
  });

  // ── Awakened ───────────────────────────────────────────────────────────

  it('Astral Project projects them as before (two more Initiative Dice); Return to Body brings them back', () => {
    scored('Ashwood', 8, 3);
    fixture.detectChanges();
    pressAwakened('Ashwood');
    press('Enable Awakened');
    const diceInBody = asAwakened('Ashwood').dices;

    press('Astral Project');

    let ashwood = asAwakened('Ashwood');
    expect(ashwood.astralProjecting).toBeTrue();
    expect(ashwood.dices).toBe(diceInBody + 2);
    expect(whereLine()).toBe('Awakened · astral projecting');
    expect(hasAwakenedButton('Astral Project')).toBeFalse();

    press('Return to Body');

    ashwood = asAwakened('Ashwood');
    expect(ashwood.astralProjecting).toBeFalse();
    expect(ashwood.dices).toBe(diceInBody);
    expect(whereLine()).toBe('Awakened · currently in their body');
    expect(hasAwakenedButton('Astral Project')).toBeTrue();
  });

  it('Remove Awakened takes it away and the tab offers Enable Awakened again', () => {
    scored('Ashwood', 8, 3);
    fixture.detectChanges();
    pressAwakened('Ashwood');
    press('Enable Awakened');

    press('Remove Awakened');

    expect(byName('Ashwood') instanceof AstralParticipant).toBeFalse();
    expect(panelName()).toBe('Ashwood');
    expect(activeTab()).toBe('Awakened');
    expect(hasAwakenedButton('Enable Awakened')).toBeTrue();
  });

  // ── remembered after a refresh ─────────────────────────────────────────

  it('after a refresh, a panel left on the Awakened tab reopens on the Awakened tab', () => {
    scored('Ashwood', 8, 3);
    fixture.detectChanges();
    pressAwakened('Ashwood');
    press('Enable Awakened');
    press('Astral Project');

    component.shareRoomCode = 'ABC123';
    component['syncSharedState']();
    const state = states[states.length - 1];
    const gmState = gmStates[gmStates.length - 1];
    fixture.destroy();
    resetCombat();
    buildScreen();
    component['restoreFromSharedState'](state, gmState);
    fixture.detectChanges();

    expect(panelName()).toBe('Ashwood');
    expect(activeTab()).toBe('Awakened');
    expect(whereLine()).toBe('Awakened · astral projecting');
    expect(hasAwakenedButton('Return to Body')).toBeTrue();
  });
});
