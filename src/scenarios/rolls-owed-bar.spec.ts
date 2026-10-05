// GM screen overhaul, ticket 14 (GitHub #17, spec #3): the rolls-owed bar.
// The between-turns Initiative Prep card and the mid-combat Pending Rolls
// card become one bar above the initiative list. It shows whenever someone
// still owes an Initiative roll, says how many and who (and who has been
// asked), carries Request player rolls, Roll remaining NPCs and Force roll
// outstanding, plus Begin Combat Turn only between turns, and disappears
// when nobody owes a roll (user stories 9-13).
//
// Ground rule: every button only moved. Each test below drives the whole GM
// screen and checks each button does what the old card's button did, under
// the same on/off rule. Glossary terms (CONTEXT.md): rolls-owed bar,
// initiative list, top bar.

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BattleTrackerComponent } from 'app/battle-tracker/battle-tracker.component';
import { appConfig } from 'app/app.config';
import { CombatManager } from 'Combat';
import { Participant } from 'Combat/Participants/Participant';
import { SessionCommand, SessionSyncService } from 'app/services/session-sync.service';
import { ConfirmationDialogService } from 'app/confirmation-dialog/confirmation-dialog.service';
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

describe('Rolls-owed bar (GM screen overhaul 14, #17)', () => {
  let component: BattleTrackerComponent;
  let fixture: ComponentFixture<BattleTrackerComponent>;
  let commands: SessionCommand[];

  beforeEach(async () => {
    forgetPanels();
    resetCombat();
    await TestBed.configureTestingModule({
      imports: [BattleTrackerComponent],
      providers: appConfig.providers
    }).compileComponents();
    const sync = TestBed.inject(SessionSyncService);
    commands = [];
    spyOn(sync, 'broadcastState');
    spyOn(sync, 'broadcastGmState');
    spyOn(sync, 'appendLog');
    spyOn(sync, 'sendCommand').and.callFake((c: SessionCommand) => { commands.push(c); });
    fixture = TestBed.createComponent(BattleTrackerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    // Every test builds its own roster: drop the blank participant the
    // screen starts with.
    resetCombat();
    component.shareRoomCode = 'ABC123';
    component.sharedLogEntries = [];
    fixture.detectChanges();
  });

  afterEach(() => {
    resetCombat();
    forgetPanels();
  });

  // ── helpers ────────────────────────────────────────────────────────────

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(node: Element | null): string {
    return (node?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function bar(): HTMLElement | null {
    return el().querySelector('[data-testid="rolls-owed-bar"]');
  }

  function barButton(label: string): HTMLButtonElement | undefined {
    return Array.from(bar()?.querySelectorAll('button') ?? [])
      .find(b => text(b) === label) as HTMLButtonElement | undefined;
  }

  function topBarButton(label: string): HTMLButtonElement | undefined {
    return Array.from(el().querySelectorAll('[data-testid="top-bar"] button'))
      .find(b => text(b) === label) as HTMLButtonElement | undefined;
  }

  function addRolled(name: string, baseIni: number, dice: number): Participant {
    const p = new Participant();
    p.name = name;
    p.baseIni = baseIni;
    p.setDicesWithoutRoll(1);
    p.diceIni = dice;
    CombatManager.participants.insert(p);
    return p;
  }

  function addUnrolled(name: string, playerId?: string): Participant {
    const p = new Participant();
    p.name = name;
    p.baseIni = 9;
    p.setDicesWithoutRoll(1);
    CombatManager.participants.insert(p);
    if (playerId) {
      component['participantOwners'].set(p, playerId);
    }
    return p;
  }

  async function click(button: HTMLButtonElement | undefined): Promise<void> {
    expect(button).withContext('button on screen').toBeTruthy();
    button!.click();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  // ── when it shows ──────────────────────────────────────────────────────

  it('is not there before anyone presses Start Combat Turn, nor with nobody owing a roll mid-turn', async () => {
    addUnrolled('Hero', 'pl-hero');
    fixture.detectChanges();
    expect(bar()).withContext('before Start Combat Turn').toBeNull();

    resetCombat();
    addRolled('A', 10, 5);
    await click(topBarButton('Start Combat Turn'));
    expect(CombatManager.started).toBeTrue();
    expect(bar()).withContext('mid-turn, everyone rolled').toBeNull();
  });

  it('between turns: shows the count and who owes, marks who was asked, and carries the four buttons', async () => {
    addRolled('A', 10, 5);
    addUnrolled('Hero', 'pl-hero');
    addUnrolled('Ganger');
    await click(topBarButton('Start Combat Turn'));

    expect(CombatManager.started).toBeFalse();
    expect(bar()).not.toBeNull();
    // Start Combat Turn asks every player who owes a roll, as before.
    const line = text(bar());
    expect(line).toContain('ROLLS OWED (2)');
    expect(line).toContain('Hero (asked)');
    expect(line).toContain('Ganger');
    expect(line).not.toContain('Ganger (asked)');
    expect(line).not.toContain('A,');

    expect(barButton('Request player rolls')).toBeTruthy();
    expect(barButton('Roll remaining NPCs')).toBeTruthy();
    expect(barButton('Force roll outstanding')).toBeTruthy();
    // Begin Combat Turn is held back while anyone still owes a roll, as on
    // the old Prep card.
    expect(barButton('Begin Combat Turn')?.disabled).toBeTrue();
  });

  it('sits above the initiative list', async () => {
    addUnrolled('Ganger');
    await click(topBarButton('Start Combat Turn'));
    const headings = el().querySelector('[data-testid="initiative-list-headings"]')!;
    expect(bar()!.compareDocumentPosition(headings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bar()!.closest('.gm-list-col')).withContext('inside the list column').not.toBeNull();
  });

  it('mid-turn: shows for a late joiner without Begin Combat Turn, and goes when the last roll lands', async () => {
    addRolled('A', 10, 5);
    await click(topBarButton('Start Combat Turn'));
    expect(CombatManager.started).toBeTrue();

    const late = addUnrolled('Late');
    fixture.detectChanges();
    expect(text(bar())).toContain('ROLLS OWED (1)');
    expect(text(bar())).toContain('Late');
    expect(barButton('Begin Combat Turn')).toBeUndefined();
    expect(el().textContent).not.toContain('Begin Combat Turn');

    await click(barButton('Roll remaining NPCs'));
    expect(late.diceIni).toBeGreaterThan(0);
    expect(bar()).toBeNull();
  });

  // ── the buttons do what the old cards' buttons did ─────────────────────

  it('between turns, Roll remaining NPCs waits until every player has rolled; mid-turn it does not', async () => {
    addUnrolled('Hero', 'pl-hero');
    addUnrolled('Ganger');
    await click(topBarButton('Start Combat Turn'));
    expect(barButton('Roll remaining NPCs')?.disabled).withContext('between turns').toBeTrue();

    resetCombat();
    addRolled('A', 10, 5);
    await click(topBarButton('Start Combat Turn'));
    addUnrolled('Hero', 'pl-hero');
    addUnrolled('Ganger');
    fixture.detectChanges();
    expect(barButton('Roll remaining NPCs')?.disabled).withContext('mid-turn').toBeFalse();
  });

  it('Request player rolls asks every player who owes a roll, and is off with no room open', async () => {
    addRolled('A', 10, 5);
    await click(topBarButton('Start Combat Turn'));
    addUnrolled('Hero', 'pl-hero');
    fixture.detectChanges();
    expect(text(bar())).not.toContain('Hero (asked)');

    commands.length = 0;
    await click(barButton('Request player rolls'));
    expect(commands.some(c => c.type === 'request_rolls')).toBeTrue();
    expect(text(bar())).toContain('Hero (asked)');

    component.shareRoomCode = '';
    fixture.detectChanges();
    expect(barButton('Request player rolls')?.disabled).toBeTrue();
  });

  it('Force roll outstanding still asks first, then rolls everyone; the bar goes and Start Combat Turn begins the turn', async () => {
    const hero = addUnrolled('Hero', 'pl-hero');
    const ganger = addUnrolled('Ganger');
    await click(topBarButton('Start Combat Turn'));

    const dialog = TestBed.inject(ConfirmationDialogService);
    const confirm = spyOn(dialog, 'confirm').and.resolveTo(false);
    await click(barButton('Force roll outstanding'));
    expect(confirm).toHaveBeenCalled();
    expect(hero.diceIni).toBe(0);
    expect(bar()).withContext('cancelled: nothing rolled').not.toBeNull();

    confirm.and.resolveTo(true);
    await click(barButton('Force roll outstanding'));
    expect(hero.diceIni).toBeGreaterThan(0);
    expect(ganger.diceIni).toBeGreaterThan(0);
    expect(bar()).withContext('nobody owes a roll').toBeNull();
    expect(CombatManager.started).toBeFalse();

    await click(topBarButton('Start Combat Turn'));
    expect(CombatManager.started).toBeTrue();
  });
});
