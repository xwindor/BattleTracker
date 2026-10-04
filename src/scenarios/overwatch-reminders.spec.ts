// GM screen overhaul, ticket 11 (GitHub #14, spec #3): the "Overwatch owed"
// reminders move from above the initiative list into the decker's own
// participant panel: their Deck tab, just above the Overwatch Score buttons
// where the score is added, each bar keeping its × to dismiss. While any are
// waiting, that decker's Deck button on their row shows how many, even with
// no panel open, and a reminder never opens a panel by itself (user stories
// 6, 54, 56, as Xavier changed them on 2026-10-04: the reminder is one
// decker's, and the Matrix panel can't adjust the score).
//
// A reminder is raised the way it happens at the table: a player presses Act
// on their phone with an illegal Matrix action declared (or the GM submits
// the Declare Actions pop-up with one), and the GM is reminded to add the
// Overwatch Score once defense is resolved (Core p. 232). Glossary terms
// (CONTEXT.md): participant panel, Matrix panel, initiative list.

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BattleTrackerComponent } from 'app/battle-tracker/battle-tracker.component';
import { appConfig } from 'app/app.config';
import { CombatManager } from 'Combat';
import { MatrixParticipant } from 'Matrix/MatrixParticipant';
import { SessionSyncService } from 'app/services/session-sync.service';
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

describe('Overwatch reminders in the decker\'s Deck tab (GM screen overhaul 11, #14)', () => {
  let component: BattleTrackerComponent;
  let fixture: ComponentFixture<BattleTrackerComponent>;
  let kestrel: MatrixParticipant;
  let razor: MatrixParticipant;

  beforeEach(async () => {
    forgetPanels();
    resetCombat();
    await TestBed.configureTestingModule({
      imports: [BattleTrackerComponent],
      providers: appConfig.providers
    }).compileComponents();
    const sync = TestBed.inject(SessionSyncService);
    spyOn(sync, 'broadcastState');
    spyOn(sync, 'broadcastGmState');
    spyOn(sync, 'appendLog');
    fixture = TestBed.createComponent(BattleTrackerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    // Every test builds its own roster: drop the blank participant the
    // screen starts with.
    resetCombat();

    // Two players' deckers, Kestrel acting first, then Razor.
    kestrel = playerDecker('Kestrel', 'kestrel-player', 15, 5); // Score 20
    razor = playerDecker('Razor', 'razor-player', 10, 4);       // Score 14
    await component.btnStartRound_Click();
    fixture.detectChanges();
  });

  afterEach(() => {
    resetCombat();
    forgetPanels();
  });

  // ── helpers ────────────────────────────────────────────────────────────

  function playerDecker(name: string, player: string, baseIni: number, roll: number): MatrixParticipant {
    const p = new MatrixParticipant();
    p.name = name;
    p.baseIni = baseIni;
    p.setDicesWithoutRoll(1);
    CombatManager.participants.insert(p);
    p.diceIni = roll;
    component['participantOwners'].set(p, player);
    return p;
  }

  // A player's phone sends its Act as a message to the GM screen; nothing
  // on the GM screen can be clicked to stand in for it, so the test hands the
  // screen that message directly, as matrix-panel.spec.ts does for rooms.

  /** The player presses Act on their phone, having declared these illegal Matrix actions. */
  function playerActs(p: MatrixParticipant, player: string, illegalActions: string[]): void {
    component['handleSessionCommand']({
      type: 'act',
      player,
      payload: { participantId: component['getParticipantId'](p), declaredAction: illegalActions.join(', '), illegalActions },
      timestamp: new Date().toISOString()
    });
    fixture.detectChanges();
  }

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function rowOf(p: MatrixParticipant): HTMLElement {
    const i = CombatManager.participants.items.indexOf(p);
    const row = el().querySelector('#participant' + i) as HTMLElement;
    expect(row).withContext('row for ' + p.name).toBeTruthy();
    return row;
  }

  function deckButton(p: MatrixParticipant): HTMLButtonElement {
    return rowOf(p).querySelector('[data-testid="deck-btn"]') as HTMLButtonElement;
  }

  /** The number shown on this participant's Deck button, or null when it shows none. */
  function deckButtonCount(p: MatrixParticipant): string | null {
    const badge = deckButton(p).querySelector('[data-testid="deck-btn-os-count"]');
    return badge ? (badge.textContent || '').trim() : null;
  }

  function openDeckTab(p: MatrixParticipant): void {
    deckButton(p).click();
    fixture.detectChanges();
  }

  function matrixButton(): HTMLButtonElement {
    return el().querySelector('[data-testid="matrix-btn"]') as HTMLButtonElement;
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

  function deckTab(): HTMLElement | null {
    return el().querySelector('[data-testid="deck-tab"]');
  }

  /** Every "Overwatch owed" reminder on the whole GM screen, wherever it sits. */
  function remindersOnScreen(): HTMLElement[] {
    return Array.from(el().querySelectorAll('[data-testid="overwatch-reminder"]')) as HTMLElement[];
  }

  function reminderTexts(): string[] {
    return remindersOnScreen().map(r => (r.textContent || '').replace(/\s+/g, ' ').trim());
  }

  function dismiss(reminder: HTMLElement): void {
    (reminder.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
  }

  // ── where the reminders sit ────────────────────────────────────────────

  it('a reminder appears in that decker\'s Deck tab, naming the actions', () => {
    playerActs(kestrel, 'kestrel-player', ['Hack on the Fly']);
    openDeckTab(kestrel);

    expect(participantPanelName()).toBe('Kestrel');
    const reminders = remindersOnScreen();
    expect(reminders.length).toBe(1);
    expect(deckTab()!.contains(reminders[0])).withContext('inside the Deck tab').toBeTrue();
    expect(reminderTexts()[0]).toContain('Overwatch owed');
    expect(reminderTexts()[0]).toContain('Hack on the Fly — add OS after resolving defense');
  });

  it('the reminder sits just above the Overwatch Score buttons of a jacked-in decker', () => {
    kestrel.jackedIn = true;
    playerActs(kestrel, 'kestrel-player', ['Hack on the Fly']);
    openDeckTab(kestrel);

    const os = deckTab()!.querySelector('[data-testid="deck-tab-os"]') as HTMLElement;
    expect(os).withContext('Overwatch Score buttons').toBeTruthy();
    const reminder = remindersOnScreen()[0];
    expect(reminder.compareDocumentPosition(os) & Node.DOCUMENT_POSITION_FOLLOWING)
      .withContext('the Overwatch Score buttons come after the reminder').toBeTruthy();
  });

  it('no reminder appears above the initiative list, nor in the Matrix panel', () => {
    playerActs(kestrel, 'kestrel-player', ['Hack on the Fly']);

    const list = el().querySelector('.gm-list-col') as HTMLElement;
    expect(list.textContent).not.toContain('Overwatch owed');
    matrixButton().click();
    fixture.detectChanges();
    expect(matrixPanel()).toBeTruthy();
    expect(matrixPanel()!.textContent).not.toContain('Overwatch owed');
    expect(remindersOnScreen()).toEqual([]);
  });

  it('each decker\'s panel shows only their own reminders', () => {
    playerActs(kestrel, 'kestrel-player', ['Hack on the Fly']);
    playerActs(razor, 'razor-player', ['Data Spike']);

    openDeckTab(razor);
    expect(reminderTexts().length).toBe(1);
    expect(reminderTexts()[0]).toContain('Data Spike');

    openDeckTab(kestrel);
    expect(reminderTexts().length).toBe(1);
    expect(reminderTexts()[0]).toContain('Hack on the Fly');
  });

  it('several reminders for one decker each get their own bar, in the order they were raised', () => {
    playerActs(kestrel, 'kestrel-player', ['Hack on the Fly']);
    playerActs(razor, 'razor-player', []);
    component.btnNextPass_Click(); // Kestrel, still on 10, acts again in pass 2
    fixture.detectChanges();
    playerActs(kestrel, 'kestrel-player', ['Data Spike', 'Brute Force']);
    openDeckTab(kestrel);

    const texts = reminderTexts();
    expect(texts.length).toBe(2);
    expect(texts[0]).toContain('Hack on the Fly');
    expect(texts[1]).toContain('Data Spike, Brute Force');
  });

  it('× dismisses just that reminder, as it did above the list, and the panel stays open', () => {
    playerActs(kestrel, 'kestrel-player', ['Hack on the Fly']);
    playerActs(razor, 'razor-player', []);
    component.btnNextPass_Click();
    fixture.detectChanges();
    playerActs(kestrel, 'kestrel-player', ['Data Spike']);
    openDeckTab(kestrel);

    dismiss(remindersOnScreen()[0]);

    expect(reminderTexts().length).toBe(1);
    expect(reminderTexts()[0]).toContain('Data Spike');
    expect(participantPanelName()).withContext('dismissing leaves the panel open').toBe('Kestrel');
  });

  it('a reminder waits through closing and reopening the panel', () => {
    playerActs(kestrel, 'kestrel-player', ['Hack on the Fly']);
    openDeckTab(kestrel);
    (participantPanel()!.querySelector('[data-testid="participant-panel-close"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(remindersOnScreen()).toEqual([]);

    openDeckTab(kestrel);
    expect(reminderTexts().length).toBe(1);
  });

  // ── the count on the decker's Deck button ──────────────────────────────

  it('the Deck button shows no number when no reminder is waiting', () => {
    expect(deckButtonCount(kestrel)).toBeNull();
    expect(deckButton(kestrel).title).toBe('Deck — cyberdeck configuration');
  });

  it('the Deck button shows how many reminders that decker has waiting, with no panel open', () => {
    playerActs(kestrel, 'kestrel-player', ['Hack on the Fly']);
    expect(deckButtonCount(kestrel)).toBe('1');
    expect(deckButtonCount(razor)).withContext('only the decker who owes').toBeNull();

    playerActs(razor, 'razor-player', []);
    component.btnNextPass_Click();
    fixture.detectChanges();
    playerActs(kestrel, 'kestrel-player', ['Data Spike']);
    expect(deckButtonCount(kestrel)).toBe('2');
    expect(deckButton(kestrel).title).toBe('Deck — 2 Overwatch reminders waiting');
  });

  it('the Matrix button carries no count', () => {
    playerActs(kestrel, 'kestrel-player', ['Hack on the Fly']);

    expect((matrixButton().textContent || '').trim()).toBe('Matrix');
  });

  it('the count goes down as reminders are dismissed, and disappears with the last one', () => {
    playerActs(kestrel, 'kestrel-player', ['Hack on the Fly']);
    playerActs(razor, 'razor-player', []);
    component.btnNextPass_Click();
    fixture.detectChanges();
    playerActs(kestrel, 'kestrel-player', ['Data Spike']);
    openDeckTab(kestrel);

    dismiss(remindersOnScreen()[0]);
    expect(deckButtonCount(kestrel)).toBe('1');

    dismiss(remindersOnScreen()[0]);
    expect(deckButtonCount(kestrel)).toBeNull();
    expect(remindersOnScreen()).toEqual([]);
  });

  // ── a reminder never opens a panel ─────────────────────────────────────

  it('a new reminder does not open any panel', () => {
    playerActs(kestrel, 'kestrel-player', ['Hack on the Fly']);

    expect(participantPanel()).toBeNull();
    expect(matrixPanel()).toBeNull();
  });

  it('a new reminder leaves another participant\'s open panel where it is', () => {
    openDeckTab(razor);

    playerActs(kestrel, 'kestrel-player', ['Hack on the Fly']);

    expect(participantPanelName()).withContext('still Razor\'s panel').toBe('Razor');
    expect(remindersOnScreen()).withContext('Kestrel\'s reminder is not in Razor\'s panel').toEqual([]);
    expect(deckButtonCount(kestrel)).toBe('1');
  });

  // ── both ways a reminder is raised ─────────────────────────────────────

  it('the Declare Actions pop-up raises a reminder the same way, counted on the Deck button', () => {
    component.actModalParticipant = kestrel;
    component['declaredActionSelections'].set(kestrel, { free: null, simple: [], complex: 'Data Spike' });
    component.submitActModal();
    fixture.detectChanges();

    expect(participantPanel()).withContext('the pop-up does not open a panel').toBeNull();
    expect(deckButtonCount(kestrel)).toBe('1');
    openDeckTab(kestrel);
    expect(reminderTexts()[0]).toContain('Data Spike — add OS after resolving defense');
  });

  it('an Act without an illegal action raises no reminder', () => {
    playerActs(kestrel, 'kestrel-player', []);

    expect(deckButtonCount(kestrel)).toBeNull();
    openDeckTab(kestrel);
    expect(remindersOnScreen()).toEqual([]);
  });
});
