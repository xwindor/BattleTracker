// GM screen overhaul, ticket 13 (GitHub #16, spec #3): the warning area. The
// roll and turn warning lines stack in one area directly under the top bar:
// the pass ending while a roll is owed, nobody able to act, roll status, and
// why the Act window closed. The area takes no space when there's nothing to
// show (user stories 7-8).
//
// Ground rule: every line here only moved. Each test below drives the whole
// GM screen and checks each line still shows under exactly the conditions it
// did before, now in the warning area. Glossary terms (CONTEXT.md): top bar,
// warning area.

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BattleTrackerComponent } from 'app/battle-tracker/battle-tracker.component';
import { appConfig } from 'app/app.config';
import { CombatManager, StatusEnum } from 'Combat';
import { Participant } from 'Combat/Participants/Participant';
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

const WARNING_LINES = [
  'pass-end-roll-notice',
  'nobody-can-act-notice',
  'roll-status-line',
  'act-modal-closed-reason'
];

describe('Warning area (GM screen overhaul 13, #16)', () => {
  let component: BattleTrackerComponent;
  let fixture: ComponentFixture<BattleTrackerComponent>;
  let sync: SessionSyncService;

  beforeEach(async () => {
    forgetPanels();
    resetCombat();
    await TestBed.configureTestingModule({
      imports: [BattleTrackerComponent],
      providers: appConfig.providers
    }).compileComponents();
    sync = TestBed.inject(SessionSyncService);
    spyOn(sync, 'broadcastState');
    spyOn(sync, 'broadcastGmState');
    spyOn(sync, 'appendLog');
    spyOn(sync, 'sendCommand');
    fixture = TestBed.createComponent(BattleTrackerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
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

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(node: Element | null): string {
    return (node?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function warningArea(): HTMLElement | null {
    return el().querySelector('[data-testid="warning-area"]');
  }

  /** The warning lines showing, top to bottom, by what each one is. */
  function linesShown(): string[] {
    const area = warningArea();
    if (!area) {
      return [];
    }
    return Array.from(area.querySelectorAll('[data-testid]'))
      .map(n => n.getAttribute('data-testid') || '')
      .filter(id => WARNING_LINES.includes(id));
  }

  function line(testid: string): HTMLElement | null {
    return warningArea()?.querySelector(`[data-testid="${testid}"]`) ?? null;
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

  /** Someone who hasn't rolled Initiative yet, added the GM's way. */
  function unrolled(name: string, baseIni: number): Participant {
    component.btnAddParticipant_Click();
    component.pendingAddDraft!.name = name;
    component.commitAddDraft();
    const p = CombatManager.participants.items.find(x => x.name === name) as Participant;
    p.baseIni = baseIni;
    p.setDicesWithoutRoll(1);
    expect(p.diceIni).withContext(name + ' has not rolled').toBe(0);
    return p;
  }

  async function startCombatTurn(): Promise<void> {
    await component.btnStartRound_Click();
    fixture.detectChanges();
  }

  // ── nothing to warn about ──────────────────────────────────────────────

  it('with nothing to warn about, there is no warning area at all', () => {
    scored('Razor', 10, 5);
    fixture.detectChanges();
    expect(warningArea()).toBeNull();
  });

  it('a running fight with every roll in and nobody stuck shows no warning area', async () => {
    scored('Razor', 10, 5);
    scored('Kestrel', 8, 3);
    fixture.detectChanges();
    await startCombatTurn();
    expect(CombatManager.started).toBeTrue();
    expect(warningArea()).toBeNull();
  });

  // ── where it sits ──────────────────────────────────────────────────────

  it('sits directly under the top bar, in the block that stays at the top of the window', async () => {
    unrolled('Late', 10);
    fixture.detectChanges();
    await startCombatTurn();

    const area = warningArea();
    expect(area).not.toBeNull();
    const topBar = el().querySelector('[data-testid="top-bar"]');
    expect(area!.previousElementSibling).toBe(topBar);
    const top = el().querySelector('[data-testid="gm-top-block"]') as HTMLElement;
    expect(top.contains(area)).toBeTrue();
    expect(getComputedStyle(top).position).toBe('sticky');
  });

  it('keeps the screen told how tall the top block is, so the Matrix panel title sticks below the warnings', async () => {
    const top = el().querySelector('[data-testid="gm-top-block"]') as HTMLElement;
    const screen = top.parentElement as HTMLElement;
    const measured = async () => {
      await new Promise(r => requestAnimationFrame(() => setTimeout(r)));
      return screen.style.getPropertyValue('--gm-top-block-height');
    };
    const withoutWarnings = await measured();
    expect(withoutWarnings).toBe(`${top.offsetHeight}px`);

    unrolled('Late', 10);
    fixture.detectChanges();
    await startCombatTurn();
    expect(warningArea()).not.toBeNull();

    const withWarnings = await measured();
    expect(withWarnings).toBe(`${top.offsetHeight}px`);
    expect(parseFloat(withWarnings)).toBeGreaterThan(parseFloat(withoutWarnings));
  });

  // ── each line, under exactly the conditions it showed before ───────────

  it('roll status: Start Combat Turn with a roll owed says what is still waiting', async () => {
    scored('Razor', 10, 5);
    unrolled('Late', 10);
    fixture.detectChanges();

    await startCombatTurn();

    expect(CombatManager.started).toBeFalse();
    expect(linesShown()).toEqual(['roll-status-line']);
    expect(text(line('roll-status-line'))).toBe(component.rollStatusText);
    expect(text(line('roll-status-line'))).toContain('Waiting for initiative');
  });

  it('roll status: once the last roll is in, the line says so', async () => {
    scored('Razor', 10, 5);
    const late = unrolled('Late', 10);
    fixture.detectChanges();
    await startCombatTurn();

    component.btnRollInitiative_Click(late);
    fixture.detectChanges();

    expect(text(line('roll-status-line'))).toContain('All initiative rolls ready');
  });

  it('the pass ending while a roll is owed: shown while the last one able to act is up', async () => {
    scored('Razor', 15, 5);
    fixture.detectChanges();
    await startCombatTurn();
    unrolled('Late', 10);
    fixture.detectChanges();

    expect(line('pass-end-roll-notice')).not.toBeNull();
    expect(text(line('pass-end-roll-notice'))).toBe(component.pendingPassEndRollNotice()!);
    expect(text(line('pass-end-roll-notice'))).toContain('Late');
  });

  it('the pass ending while a roll is owed: gone once the roll is in', async () => {
    scored('Razor', 15, 5);
    fixture.detectChanges();
    await startCombatTurn();
    const late = unrolled('Late', 10);
    fixture.detectChanges();
    expect(line('pass-end-roll-notice')).not.toBeNull();

    component.btnRollInitiative_Click(late);
    fixture.detectChanges();

    expect(line('pass-end-roll-notice')).toBeNull();
  });

  it('nobody able to act: shown when everyone left in the pass still owes a roll', async () => {
    const razor = scored('Razor', 15, 5);
    fixture.detectChanges();
    await startCombatTurn();
    unrolled('Late', 10);
    component['performAct'](razor, null);
    fixture.detectChanges();

    expect(line('nobody-can-act-notice')).not.toBeNull();
    expect(text(line('nobody-can-act-notice'))).toBe(component.nobodyCanActRollNotice()!);
    expect(text(line('nobody-can-act-notice'))).toContain('Late');
    expect(line('pass-end-roll-notice')).toBeNull();
  });

  it('why the Act window closed: shown when the GM submits for someone who has already acted', async () => {
    const hero = scored('Hero', 15, 5);
    fixture.detectChanges();
    await startCombatTurn();
    component.actModalParticipant = hero;
    component['declaredActionSelections'].set(hero, { free: 'Drop Prone', simple: [], complex: null });
    component['performAct'](hero, null);
    expect(hero.status).toBe(StatusEnum.Finished);

    component.submitActModal();
    fixture.detectChanges();

    expect(line('act-modal-closed-reason')).not.toBeNull();
    expect(text(line('act-modal-closed-reason'))).toContain('Hero');
    expect(text(line('act-modal-closed-reason'))).toContain('Act window closed');
  });

  // ── stacked, each with a marker ────────────────────────────────────────

  it('stacks several lines in order, each one line with a marker at its start', async () => {
    scored('Razor', 15, 5);
    fixture.detectChanges();
    await startCombatTurn();
    unrolled('Late', 10);
    fixture.detectChanges();
    // The roll status line is written at the moments it always was; here,
    // as the GM's Start Combat Turn would write it.
    component.rollStatusText = 'Waiting for initiative: 0 player, 1 non-player.';
    fixture.detectChanges();

    expect(linesShown()).toEqual(['pass-end-roll-notice', 'roll-status-line']);
    for (const id of linesShown()) {
      const first = line(id)!.firstElementChild;
      expect(first).withContext(id + ' marker').not.toBeNull();
      expect(first!.classList).withContext(id + ' marker').toContain('gm-warning-marker');
    }
  });

  // ── the room's own messages stay as they were ──────────────────────────

  it('the connection-lost warning and share errors still show, as before, outside the warning area', () => {
    component.shareRoomCode = 'ABC123';
    component.shareConnectionLost = true;
    component.shareError = 'Could not reach the session server.';
    fixture.detectChanges();

    const lost = el().querySelector('[data-testid="share-connection-lost"]');
    expect(lost).not.toBeNull();
    expect(text(lost)).toContain('Session server unreachable');
    expect(text(el())).toContain('Could not reach the session server.');
    expect(warningArea()).toBeNull();
  });
});
