// GM screen overhaul, ticket 03 (GitHub #6, spec #3): the bottom strip. The
// action log and the dice roller sit in a strip pinned to the bottom of the
// screen, which shrinks to one line showing the latest log entry and is
// remembered after a refresh (user stories 58-61, 63, 65).
//
// Ground rule (spec #3): the log and the roller only MOVE. Every control in
// them does exactly what it did before; the tests at the end check that from
// the strip. A "refresh" here is the screen thrown away and built again on the
// same browser storage. Glossary terms (CONTEXT.md): bottom strip.

import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { BattleTrackerComponent } from 'app/battle-tracker/battle-tracker.component';
import { DiceRollerComponent } from 'app/dice-roller/dice-roller.component';
import { appConfig } from 'app/app.config';
import { CombatManager } from 'Combat';
import { Participant } from 'Combat/Participants/Participant';
import { SessionSyncService, SharedLogEntry } from 'app/services/session-sync.service';
import { BOTTOM_STRIP_MEMORY_KEY } from 'app/battle-tracker/gm-screen-memory';

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

function forgetStrip() {
  try { localStorage.removeItem(BOTTOM_STRIP_MEMORY_KEY); } catch { /* blocked */ }
}

describe('Bottom strip (GM screen overhaul 03, #6)', () => {
  let component: BattleTrackerComponent;
  let fixture: ComponentFixture<BattleTrackerComponent>;

  beforeEach(async () => {
    forgetStrip();
    resetCombat();
    await TestBed.configureTestingModule({
      imports: [BattleTrackerComponent],
      providers: appConfig.providers
    }).compileComponents();
    const sync = TestBed.inject(SessionSyncService);
    spyOn(sync, 'broadcastState');
    spyOn(sync, 'broadcastGmState');
    spyOn(sync, 'appendLog');
    spyOn(sync, 'sendCommand');
    buildScreen();
  });

  afterEach(() => {
    fixture.destroy();
    resetCombat();
    forgetStrip();
  });

  // ── helpers ────────────────────────────────────────────────────────────

  function buildScreen(): void {
    fixture = TestBed.createComponent(BattleTrackerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  /** Refresh the page: a new screen on the same browser storage. */
  function refresh(): void {
    fixture.destroy();
    resetCombat();
    buildScreen();
  }

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function strip(): HTMLElement {
    const s = el().querySelector('[data-testid="bottom-strip"]') as HTMLElement | null;
    expect(s).withContext('bottom strip').not.toBeNull();
    return s!;
  }

  /** Whether `node` is actually drawn on screen (not hidden away). */
  function shown(node: Element | null): boolean {
    return !!node && (node as HTMLElement).offsetParent !== null;
  }

  function logList(): HTMLElement | null {
    return strip().querySelector('.gm-log-list');
  }

  function roller(): HTMLElement | null {
    return strip().querySelector('app-dice-roller');
  }

  function oneLine(): HTMLElement | null {
    return strip().querySelector('[data-testid="bottom-strip-line"]');
  }

  function buttonLabelled(label: string): HTMLButtonElement {
    const b = Array.from(strip().querySelectorAll('button'))
      .find(x => shown(x) && (x.textContent || '').trim().startsWith(label)) as HTMLButtonElement | undefined;
    expect(b).withContext('"' + label + '" button in the strip').toBeTruthy();
    return b!;
  }

  function shrink(): void {
    buttonLabelled('Shrink').click();
    fixture.detectChanges();
  }

  function expand(): void {
    buttonLabelled('Show log').click();
    fixture.detectChanges();
  }

  /** Pick `name` in the strip's "Roll as" dropdown, as the GM would. */
  function rollAs(name: string): void {
    const select = strip().querySelector('[data-testid="roll-as-select"]') as HTMLSelectElement;
    select.selectedIndex = Array.from(select.options).findIndex(o => o.value === name);
    select.dispatchEvent(new Event('change'));
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

  function sharedEntry(actor: string, text: string, extra: Partial<SharedLogEntry> = {}): SharedLogEntry {
    return { actor, text, timestamp: new Date().toISOString(), ...extra };
  }

  // ── where the log and the roller are ───────────────────────────────────

  it('holds the action log on the left and the dice roller on the right, under small headings', () => {
    const text = strip().textContent || '';
    expect(text).toContain('// Action log');
    expect(text).toContain('// Dice');
    expect(shown(logList())).toBe(true);
    expect(shown(roller())).toBe(true);
    const listLeft = logList()!.getBoundingClientRect().left;
    const rollerLeft = roller()!.getBoundingClientRect().left;
    expect(listLeft).toBeLessThan(rollerLeft);
  });

  it('is not part of the initiative list any more', () => {
    expect(el().querySelector('.gm-list-col [data-testid="bottom-strip"]')).toBeNull();
    expect(el().querySelector('.gm-list-col .gm-log-list')).toBeNull();
    expect(el().querySelector('.gm-list-col app-dice-roller')).toBeNull();
  });

  it('stays on screen at the bottom however long the initiative list is', () => {
    resetCombat();
    for (let i = 0; i < 30; i++) {
      scored('Ganger ' + (i + 1), 8, 3);
    }
    fixture.detectChanges();
    // The top of the GM screen, as when the app opens (in a full test run,
    // earlier tests can leave things above it on the test page).
    el().scrollIntoView({ block: 'start' });

    const box = strip().getBoundingClientRect();
    expect(box.top).toBeLessThan(window.innerHeight);
    expect(box.bottom).toBeLessThanOrEqual(window.innerHeight + 1);
    // The list really is longer than the screen, so the strip is pinned,
    // not just sitting under a short list.
    const lastRow = el().querySelector('#participant29') as HTMLElement;
    expect(lastRow.getBoundingClientRect().top).toBeGreaterThan(box.top);
  });

  it('Shrink sits in the top-right corner of the strip, after the dice heading', () => {
    const shrinkBox = buttonLabelled('Shrink').getBoundingClientRect();
    const diceBox = strip().querySelector('.bottom-strip-dice')!.getBoundingClientRect();
    expect(shrinkBox.left).toBeGreaterThan(diceBox.left);
    expect(shrinkBox.top - diceBox.top).toBeLessThan(40);
  });

  it('the roller shows "Your roll" and "Other players" as tabs, one at a time', () => {
    const mine = strip().querySelector('[data-testid="dice-roller-tab-mine"]') as HTMLButtonElement;
    const others = strip().querySelector('[data-testid="dice-roller-tab-others"]') as HTMLButtonElement;
    const remote = () => strip().querySelector('.dice-section-remote');
    expect(mine.getAttribute('aria-selected')).toBe('true');
    expect(shown(remote())).toBe(false);

    others.click();
    fixture.detectChanges();
    expect(shown(remote())).toBe(true);
    expect(remote()!.textContent).toContain('No recent rolls.');

    mine.click();
    fixture.detectChanges();
    expect(shown(remote())).toBe(false);
  });

  // ── shrinking ──────────────────────────────────────────────────────────

  it('Shrink turns it into one line showing the latest log entry; Show brings the log and dice back', () => {
    component.shareRoomCode = 'ABC123';
    component['sharedLogEntries'] = [
      sharedEntry('GM', 'Combat Turn 1 begins'),
      sharedEntry('Razor', 'rolled Initiative 23')
    ];
    fixture.detectChanges();

    shrink();

    expect(shown(logList())).toBe(false);
    expect(shown(roller())).toBe(false);
    expect(shown(oneLine())).toBe(true);
    const line = (oneLine()!.textContent || '').replace(/\s+/g, ' ');
    expect(line).toContain('Razor');
    expect(line).toContain('rolled Initiative 23');
    expect(line).not.toContain('Combat Turn 1 begins');

    expand();

    expect(shown(logList())).toBe(true);
    expect(shown(roller())).toBe(true);
    expect(shown(oneLine())).toBe(false);
  });

  it('the one line follows the log: a new entry replaces the one shown', () => {
    component.shareRoomCode = 'ABC123';
    component['sharedLogEntries'] = [sharedEntry('GM', 'Combat Turn 1 begins')];
    fixture.detectChanges();
    shrink();

    component['sharedLogEntries'] = [
      ...component['sharedLogEntries'],
      sharedEntry('Kestrel', 'jacked in (Hot Sim)')
    ];
    fixture.detectChanges();

    const line = oneLine()!.textContent || '';
    expect(line).toContain('jacked in (Hot Sim)');
    expect(line).not.toContain('Combat Turn 1 begins');
  });

  it('the one line keeps the "hidden" marker on a roll players never saw', () => {
    component.shareRoomCode = 'ABC123';
    component['sharedLogEntries'] = [
      sharedEntry('GM', 'rolled 2d6: [5, 2] - 1 hit', { hiddenFromPlayers: true })
    ];
    fixture.detectChanges();
    shrink();
    expect(oneLine()!.querySelector('.log-badge-hidden')).not.toBeNull();
  });

  it('the one line says so when the log is empty', () => {
    component.shareRoomCode = 'ABC123';
    component['sharedLogEntries'] = [];
    fixture.detectChanges();
    shrink();
    expect(oneLine()!.textContent).toContain('No log entries yet.');
  });

  it('the one line shows the latest entry when there is no room too', () => {
    component.shareRoomCode = '';
    const logbook = component.logHandler.logbook;
    const entry = { timestamp: new Date(), text: 'Razor acts', bttime: component.currentBTTime };
    logbook.push(entry);
    try {
      fixture.detectChanges();
      shrink();
      expect(oneLine()!.textContent).toContain('Razor acts');
    } finally {
      logbook.splice(logbook.indexOf(entry), 1);
    }
  });

  it('shrinking keeps a "Roll as" choice: it is still there after Show', async () => {
    resetCombat();
    scored('Razor', 8, 3);
    fixture.detectChanges();
    rollAs('Razor');

    shrink();
    expand();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(strip().querySelector('[data-testid="roll-as-hint"]')!.textContent).toContain('Razor');
  });

  // ── remembering after a refresh ────────────────────────────────────────

  it('starts expanded when nothing is remembered', () => {
    expect(shown(logList())).toBe(true);
    expect(shown(oneLine())).toBe(false);
  });

  it('a shrunk strip is still shrunk after a refresh', () => {
    shrink();
    refresh();
    expect(shown(oneLine())).toBe(true);
    expect(shown(logList())).toBe(false);
  });

  it('a strip shrunk then shown again is expanded after a refresh', () => {
    shrink();
    expand();
    refresh();
    expect(shown(logList())).toBe(true);
    expect(shown(oneLine())).toBe(false);
  });

  it('something unreadable in the browser\'s memory means expanded', () => {
    localStorage.setItem(BOTTOM_STRIP_MEMORY_KEY, '{not json');
    refresh();
    expect(shown(logList())).toBe(true);
  });

  describe('when the browser blocks storage', () => {
    beforeEach(() => {
      spyOn(Storage.prototype, 'getItem').and.throwError('SecurityError');
      spyOn(Storage.prototype, 'setItem').and.throwError('SecurityError');
      spyOn(Storage.prototype, 'removeItem').and.throwError('SecurityError');
    });

    it('the screen builds expanded, and Shrink and Show still work', () => {
      expect(() => refresh()).not.toThrow();
      expect(shown(logList())).toBe(true);
      shrink();
      expect(shown(oneLine())).toBe(true);
      expand();
      expect(shown(logList())).toBe(true);
    });
  });

  // ── the moved controls do what they did ────────────────────────────────

  it('the GM-rolls toggles in the strip switch visibility exactly as before', () => {
    component.shareRoomCode = 'ABC123';
    fixture.detectChanges();
    expect(component.gmRollsVisibleToPlayers).toBe(true);

    buttonLabelled('Hide next roll').click();
    fixture.detectChanges();
    expect(component.hideNextGmRoll).toBe(true);
    expect(buttonLabelled('Next roll: hidden')).toBeTruthy();

    buttonLabelled('GM rolls: visible to players').click();
    fixture.detectChanges();
    expect(component.gmRollsVisibleToPlayers).toBe(false);
    expect(buttonLabelled('GM rolls: hidden (session)')).toBeTruthy();
  });

  it('rolling as a participant from the strip logs the roll under their name, marked NPC', fakeAsync(() => {
    resetCombat();
    scored('Razor', 8, 3);
    component.shareRoomCode = 'ABC123';
    fixture.detectChanges();
    tick();
    rollAs('Razor');

    (strip().querySelector('[data-testid="dice-roller-roll-button"]') as HTMLButtonElement).click();
    tick(DiceRollerComponent.ROLL_ANIMATION_MS);
    fixture.detectChanges();

    // In a room the line reaches the log through the server; what the screen
    // sends it is the roll under Razor's name, marked as rolled for an NPC.
    const appendLog = TestBed.inject(SessionSyncService).appendLog as jasmine.Spy;
    expect(appendLog).toHaveBeenCalled();
    const sent = appendLog.calls.mostRecent().args[0] as SharedLogEntry;
    expect(sent.actor).toBe('Razor');
    expect(sent.npc).toBe(true);
  }));

  it('"+ narration" on a glitched roll in the strip opens the narration box', () => {
    component.shareRoomCode = 'ABC123';
    component['sharedLogEntries'] = [
      sharedEntry('GM', 'rolled 3 dice: 1, 1, 4', { id: 'r1', glitch: 'glitch' })
    ];
    fixture.detectChanges();

    buttonLabelled('+ narration').click();
    fixture.detectChanges();

    expect(logList()!.querySelector('.glitch-note-editor input')).not.toBeNull();
  });

  it('the retained-hidden banner shows in the strip after the room goes away', () => {
    component.shareRoomCode = '';
    component['sharedLogEntries'] = [
      sharedEntry('GM', 'secret roll', { hiddenFromPlayers: true })
    ];
    fixture.detectChanges();

    expect(logList()!.querySelector('[data-testid="retained-hidden-banner"]')).not.toBeNull();
    expect(logList()!.querySelector('[data-testid="retained-hidden-entry"]')!.textContent).toContain('secret roll');
  });
});
