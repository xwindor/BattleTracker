// GM screen overhaul, ticket 10 (GitHub #13, spec #3): the Matrix panel in
// the right-hand slot. The Matrix button opens it wide from the right, over
// the initiative list, with a strip of the list left showing and clickable.
// It shares one slot with the participant panel, closes with its × or
// Escape, and is remembered after a refresh. The Matrix run panel inside it
// is unchanged (user stories 51-53, 55, 57, 62).
//
// A "refresh" is built the way it happens at the table: the GM's screen is
// thrown away and a new one is built on the same browser storage. Glossary
// terms (CONTEXT.md): Matrix panel, participant panel, initiative list.

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BattleTrackerComponent } from 'app/battle-tracker/battle-tracker.component';
import { appConfig } from 'app/app.config';
import { CombatManager } from 'Combat';
import { Participant } from 'Combat/Participants/Participant';
import { MatrixParticipant } from 'Matrix/MatrixParticipant';
import { SessionSyncService, SharedCombatState, SharedGmState } from 'app/services/session-sync.service';
import { MATRIX_PANEL_MEMORY_KEY, PARTICIPANT_PANEL_MEMORY_KEY } from 'app/battle-tracker/gm-screen-memory';

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

function forgetPanels() {
  try {
    localStorage.removeItem(PARTICIPANT_PANEL_MEMORY_KEY);
    localStorage.removeItem(MATRIX_PANEL_MEMORY_KEY);
  } catch { /* blocked */ }
}

describe('Matrix panel (GM screen overhaul 10, #13)', () => {
  let component: BattleTrackerComponent;
  let fixture: ComponentFixture<BattleTrackerComponent>;
  let states: SharedCombatState[];
  let gmStates: SharedGmState[];

  beforeEach(async () => {
    forgetPanels();
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
    forgetPanels();
  });

  // ── helpers ────────────────────────────────────────────────────────────

  function buildScreen(): void {
    fixture = TestBed.createComponent(BattleTrackerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  /** Refresh the page: this screen goes away and a new one is built on the same browser storage. */
  function refresh(): void {
    fixture.destroy();
    resetCombat();
    buildScreen();
  }

  /** Refresh, then rejoin the room, which brings back the participants it held. */
  function refreshAndRejoin(): void {
    component.shareRoomCode = 'ABC123';
    component['syncSharedState']();
    const state = states[states.length - 1];
    const gmState = gmStates[gmStates.length - 1];
    refresh();
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

  function rowOf(p: Participant | unknown): HTMLElement {
    const i = CombatManager.participants.items.indexOf(p as Participant);
    const row = el().querySelector('#participant' + i) as HTMLElement;
    expect(row).withContext('row for participant').toBeTruthy();
    return row;
  }

  function matrixButton(): HTMLButtonElement {
    const b = el().querySelector('[data-testid="matrix-btn"]') as HTMLButtonElement | null;
    expect(b).withContext('Matrix button').toBeTruthy();
    return b!;
  }

  function clickMatrixButton(): void {
    matrixButton().click();
    fixture.detectChanges();
  }

  function matrixPanel(): HTMLElement | null {
    return el().querySelector('[data-testid="matrix-panel"]');
  }

  function participantPanel(): HTMLElement | null {
    return el().querySelector('[data-testid="participant-panel"]');
  }

  function participantPanelName(): string {
    return (participantPanel()?.querySelector('[data-testid="participant-panel-name"]')?.textContent || '').trim();
  }

  function clickName(p: Participant | unknown): void {
    (rowOf(p).querySelector('input.gm-name-input') as HTMLInputElement).click();
    fixture.detectChanges();
  }

  function pressEscape(): void {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
  }

  // ── opening and closing ────────────────────────────────────────────────

  it('the screen starts with the Matrix panel closed and nothing of the Matrix above the list', () => {
    expect(matrixPanel()).toBeNull();
    expect(el().querySelector('app-matrix-run-panel')).toBeNull();
    const buttons = Array.from(el().querySelectorAll('button')).map(b => (b.textContent || '').trim());
    expect(buttons).not.toContain('Show Matrix panel');
  });

  it('the Matrix button opens the Matrix panel, holding the Matrix run panel, under a MATRIX header', () => {
    clickMatrixButton();

    const panel = matrixPanel();
    expect(panel).toBeTruthy();
    expect((panel!.querySelector('[data-testid="matrix-panel-title"]')?.textContent || '').trim()).toBe('MATRIX');
    expect(panel!.querySelector('app-matrix-run-panel')).withContext('the run panel is inside').toBeTruthy();
    expect(el().querySelectorAll('app-matrix-run-panel').length).withContext('only one run panel').toBe(1);
    expect(matrixButton().getAttribute('aria-pressed')).toBe('true');
  });

  it('the Matrix button closes the Matrix panel when it is already open', () => {
    clickMatrixButton();
    clickMatrixButton();

    expect(matrixPanel()).toBeNull();
    expect(matrixButton().getAttribute('aria-pressed')).toBe('false');
  });

  it('× closes the Matrix panel', () => {
    clickMatrixButton();

    (matrixPanel()!.querySelector('[data-testid="matrix-panel-close"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(matrixPanel()).toBeNull();
  });

  it('Escape closes the Matrix panel', () => {
    clickMatrixButton();

    pressEscape();

    expect(matrixPanel()).toBeNull();
  });

  it('Escape while a pop-up is open leaves the Matrix panel open', () => {
    clickMatrixButton();
    component.btnAddParticipant_Click(); // opens the add pop-up
    fixture.detectChanges();

    pressEscape();

    expect(matrixPanel()).toBeTruthy();
    component.cancelAddDraft();
  });

  // ── one slot shared with the participant panel ─────────────────────────

  it('the initiative list stays on screen beside it, and clicking a name swaps to that participant\'s panel', () => {
    const kestrel = scored('Kestrel', 8, 3);
    fixture.detectChanges();
    clickMatrixButton();

    expect(rowOf(kestrel)).withContext('the list is still there').toBeTruthy();
    clickName(kestrel);

    expect(participantPanelName()).toBe('Kestrel');
    expect(matrixPanel()).withContext('the Matrix panel gave up the slot').toBeNull();
  });

  it('the Matrix button swaps an open participant panel for the Matrix panel', () => {
    const kestrel = scored('Kestrel', 8, 3);
    fixture.detectChanges();
    clickName(kestrel);

    clickMatrixButton();

    expect(matrixPanel()).toBeTruthy();
    expect(participantPanel()).toBeNull();
  });

  it('adding a participant while the Matrix panel is open swaps to their panel on Stats', () => {
    clickMatrixButton();

    component.btnAddParticipant_Click();
    component.pendingAddDraft!.name = 'Razor';
    component.commitAddDraft();
    fixture.detectChanges();

    expect(participantPanelName()).toBe('Razor');
    expect(matrixPanel()).toBeNull();
  });

  // ── the inside behaves as before ───────────────────────────────────────

  it('a decker\'s Jack In inside the Matrix panel still jacks them in', () => {
    const decker = new MatrixParticipant();
    decker.name = 'Tesseract';
    decker.baseIni = 9;
    decker.setDicesWithoutRoll(1);
    CombatManager.participants.insert(decker);
    fixture.detectChanges();
    clickMatrixButton();

    const card = Array.from(matrixPanel()!.querySelectorAll('.decker-card'))
      .find(c => (c.textContent || '').includes('Tesseract')) as HTMLElement | undefined;
    expect(card).withContext('Tesseract\'s decker card').toBeTruthy();
    const jackIn = Array.from(card!.querySelectorAll('button'))
      .find(b => (b.textContent || '').trim() === 'Jack In') as HTMLButtonElement;
    jackIn.click();
    fixture.detectChanges();

    expect(decker.jackedIn).toBeTrue();
  });

  // ── remembering after a refresh ────────────────────────────────────────

  it('after a refresh, an open Matrix panel opens again', () => {
    clickMatrixButton();

    refresh();

    expect(matrixPanel()).toBeTruthy();
  });

  it('after a refresh and rejoining the room, the Matrix panel is still the one open', () => {
    scored('Kestrel', 8, 3);
    fixture.detectChanges();
    clickMatrixButton();

    refreshAndRejoin();

    expect(matrixPanel()).toBeTruthy();
    expect(participantPanel()).toBeNull();
  });

  it('a Matrix panel closed with × stays closed after a refresh', () => {
    clickMatrixButton();
    (matrixPanel()!.querySelector('[data-testid="matrix-panel-close"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    refresh();

    expect(matrixPanel()).toBeNull();
  });

  it('swapping from the Matrix to a participant remembers the participant, not the Matrix', () => {
    const kestrel = scored('Kestrel', 8, 3);
    fixture.detectChanges();
    clickMatrixButton();
    clickName(kestrel);

    refreshAndRejoin();

    expect(matrixPanel()).toBeNull();
    expect(participantPanelName()).toBe('Kestrel');
  });

  it('swapping from a participant to the Matrix remembers the Matrix, not the participant', () => {
    const kestrel = scored('Kestrel', 8, 3);
    fixture.detectChanges();
    clickName(kestrel);
    clickMatrixButton();

    refreshAndRejoin();

    expect(participantPanel()).toBeNull();
    expect(matrixPanel()).toBeTruthy();
  });

  describe('when the browser blocks storage', () => {
    beforeEach(() => {
      spyOn(Storage.prototype, 'getItem').and.throwError('SecurityError');
      spyOn(Storage.prototype, 'setItem').and.throwError('SecurityError');
      spyOn(Storage.prototype, 'removeItem').and.throwError('SecurityError');
    });

    it('the Matrix panel opens and closes, and a refresh starts it closed', () => {
      refresh();
      clickMatrixButton();
      expect(matrixPanel()).toBeTruthy();
      pressEscape();
      expect(matrixPanel()).toBeNull();
      clickMatrixButton();

      expect(() => refresh()).not.toThrow();

      expect(matrixPanel()).toBeNull();
    });
  });
});
