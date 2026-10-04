// GM screen overhaul, ticket 12 (GitHub #15, spec #3): the top bar. One bar
// across the top of the GM screen holds where the fight is (Combat Turn,
// Initiative Pass, current Initiative), the round buttons, the Matrix button,
// and the room controls: the room code, Copy player link and a room menu (⋯)
// holding Join another room, Close room and End room. It replaces the old
// session bar and the status line under the list (user stories 1-5).
//
// Ground rule: every control here only moved. Each test below drives the
// whole GM screen through its buttons and checks the control still does what
// it did before. Glossary terms (CONTEXT.md): top bar, initiative list.

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BattleTrackerComponent } from 'app/battle-tracker/battle-tracker.component';
import { appConfig } from 'app/app.config';
import { CombatManager } from 'Combat';
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

describe('Top bar (GM screen overhaul 12, #15)', () => {
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

  function topBar(): HTMLElement {
    const bar = el().querySelector('[data-testid="top-bar"]') as HTMLElement | null;
    expect(bar).withContext('top bar').toBeTruthy();
    return bar!;
  }

  function inTopBar(testid: string): HTMLElement | null {
    return topBar().querySelector(`[data-testid="${testid}"]`);
  }

  /** The buttons sitting on the bar itself, outside the room menu. */
  function barButtonElements(): HTMLButtonElement[] {
    return Array.from(topBar().querySelectorAll('button'))
      .filter(b => !b.closest('.dropdown-menu')) as HTMLButtonElement[];
  }

  /** Those buttons as the GM reads them. */
  function barButtons(): string[] {
    return barButtonElements().map(b => text(b)).filter(t => t !== '');
  }

  function clickBarButton(label: string): void {
    const b = barButtonElements().find(x => text(x) === label);
    expect(b).withContext('top bar button ' + label).toBeTruthy();
    b!.click();
    fixture.detectChanges();
  }

  function statusText(): string {
    return text(inTopBar('top-bar-status'));
  }

  function roomMenu(): HTMLElement {
    const menu = inTopBar('room-menu');
    expect(menu).withContext('room menu').toBeTruthy();
    return menu!;
  }

  /** Whether the room menu is showing its list; false when there's no menu at all. */
  function isRoomMenuOpen(): boolean {
    return !!inTopBar('room-menu')?.querySelector('.dropdown-menu.show');
  }

  function openRoomMenu(): void {
    (roomMenu().querySelector('[data-testid="room-menu-btn"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(isRoomMenuOpen()).withContext('room menu opened').toBeTrue();
  }

  function roomMenuItemElements(): HTMLButtonElement[] {
    return Array.from(roomMenu().querySelectorAll('.dropdown-menu button')) as HTMLButtonElement[];
  }

  function roomMenuItems(): string[] {
    return roomMenuItemElements().map(b => text(b));
  }

  function pickFromRoomMenu(label: string): void {
    const item = roomMenuItemElements().find(b => text(b) === label);
    expect(item).withContext('room menu item ' + label).toBeTruthy();
    item!.click();
    fixture.detectChanges();
  }

  async function settle(): Promise<void> {
    await fixture.whenStable();
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

  function openRoom(code = 'ABC123'): void {
    component.shareRoomCode = code;
    component.shareJoinCode = code;
    fixture.detectChanges();
  }

  // ── round status ───────────────────────────────────────────────────────

  it('shows the Combat Turn between turns', () => {
    expect(statusText()).toContain('Between Combat Turns');
    expect(statusText()).toContain('Turn 1');
  });

  it('shows Combat Turn, Initiative Pass and current Initiative once the fight is running', () => {
    scored('Razor', 10, 5);
    fixture.detectChanges();

    clickBarButton('Start Combat Turn');

    expect(CombatManager.started).toBeTrue();
    expect(statusText()).toContain('Turn 1 · Pass 1 · Ini 15');
  });

  it('the old status line under the list is gone: the round status is only in the top bar', () => {
    scored('Razor', 10, 5);
    fixture.detectChanges();
    clickBarButton('Start Combat Turn');

    const outsideBar = Array.from(el().querySelectorAll('.gm-list-col'))
      .map(n => text(n)).join(' ');
    expect(outsideBar).not.toContain('Combat Turn 1');
    expect(outsideBar).not.toMatch(/Pass 1, Initiative/);
  });

  // ── round buttons ──────────────────────────────────────────────────────

  it('holds Start Combat Turn, End Combat and the Matrix button between turns', () => {
    expect(barButtons()).toContain('Start Combat Turn');
    expect(barButtons()).toContain('End Combat');
    expect(inTopBar('matrix-btn')).not.toBeNull();
    expect(barButtons()).not.toContain('Next Initiative Pass');
  });

  it('a whole pass from the top bar: Start, then Next Initiative Pass once the pass ends, then End Combat Turn', () => {
    // Razor 10+5 = 15: two passes (15, then 5), and acts once in each.
    const razor = scored('Razor', 10, 5);
    fixture.detectChanges();

    clickBarButton('Start Combat Turn');
    expect(barButtons()).not.toContain('Start Combat Turn');
    // Mid-pass there's nothing to advance yet, exactly as before.
    expect(barButtons()).not.toContain('Next Initiative Pass');

    component['performAct'](razor, null);
    fixture.detectChanges();
    expect(CombatManager.passEnded).toBeTrue();
    expect(barButtons()).toContain('Next Initiative Pass');

    clickBarButton('Next Initiative Pass');
    expect(CombatManager.initiativePass).toBe(2);
    expect(statusText()).toContain('Pass 2');

    component['performAct'](razor, null);
    fixture.detectChanges();
    expect(barButtons()).toContain('End Combat Turn');
  });

  it('End Combat still asks first, and ends the fight on yes', async () => {
    const dialog = component['confirmationDialog'];
    const confirm = spyOn(dialog, 'simpleConfirm').and.resolveTo(false);
    scored('Razor', 10, 5);
    fixture.detectChanges();
    clickBarButton('Start Combat Turn');

    clickBarButton('End Combat');
    await settle();
    expect(confirm).toHaveBeenCalledWith('Are you sure you want to end combat?');
    expect(CombatManager.started).toBeTrue();

    confirm.and.resolveTo(true);
    clickBarButton('End Combat');
    await settle();
    expect(CombatManager.started).toBeFalse();
    expect(barButtons()).toContain('Start Combat Turn');
  });

  it('the Matrix button in the top bar opens and closes the Matrix panel', () => {
    (inTopBar('matrix-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el().querySelector('[data-testid="matrix-panel"]')).not.toBeNull();

    (inTopBar('matrix-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el().querySelector('[data-testid="matrix-panel"]')).toBeNull();
  });

  // ── room controls: no room open ────────────────────────────────────────

  it('with no room open, Create room and Join room are on the bar, and no room code or menu', () => {
    expect(barButtons()).toContain('Create room');
    expect(barButtons()).toContain('Join room');
    expect(inTopBar('join-room-input')).not.toBeNull();
    expect(inTopBar('room-code')).toBeNull();
    expect(inTopBar('copy-player-link-btn')).toBeNull();
    expect(inTopBar('room-menu')).toBeNull();
  });

  it('Join room with no code still says to enter one', () => {
    clickBarButton('Join room');
    expect(text(el())).toContain('Enter a room code to join.');
  });

  it('Create room still creates a room, and the bar then shows its code', async () => {
    spyOn(sync, 'connect');
    spyOn(sync, 'createSession').and.resolveTo({ room: 'NEW777' });

    clickBarButton('Create room');
    await settle();

    expect(sync.createSession).toHaveBeenCalled();
    expect(text(inTopBar('room-code'))).toBe('NEW777');
    expect(barButtons()).not.toContain('Create room');
  });

  // ── room controls: a room open ─────────────────────────────────────────

  it('with a room open, the bar shows the room code, Copy player link and the room menu', () => {
    openRoom();

    expect(text(inTopBar('room-code'))).toBe('ABC123');
    expect(inTopBar('copy-player-link-btn')).not.toBeNull();
    expect(inTopBar('room-menu')).not.toBeNull();
    expect(barButtons()).not.toContain('Create room');
    expect(barButtons()).not.toContain('Join room');
  });

  it('the room code still opens the player link in a new tab', () => {
    openRoom();
    const link = inTopBar('room-code') as HTMLAnchorElement;
    expect(link.tagName).toBe('A');
    expect(link.href).toBe(component.shareUrl);
    expect(link.target).toBe('_blank');
  });

  it('Copy player link still copies the player link and says so', async () => {
    openRoom();
    const write = spyOn(navigator.clipboard, 'writeText').and.resolveTo();

    (inTopBar('copy-player-link-btn') as HTMLButtonElement).click();
    await settle();

    expect(write).toHaveBeenCalledWith(component.shareUrl);
    expect(text(el())).toContain('Copied player link.');
  });

  it('the room menu is closed until opened and holds Join another room, Create a new room, Close room and End room', () => {
    openRoom();
    expect(isRoomMenuOpen()).toBeFalse();

    openRoomMenu();

    expect(roomMenuItems()).toEqual(['Join another room…', 'Create a new room…', 'Close room', 'End room']);
  });

  it('Close room in the menu still leaves the room, keeping it rejoinable', async () => {
    openRoom();
    spyOn(sync, 'closeSession').and.resolveTo();

    openRoomMenu();
    pickFromRoomMenu('Close room');
    await settle();

    expect(sync.closeSession).toHaveBeenCalledWith('ABC123');
    expect(isRoomMenuOpen()).toBeFalse();
    expect(inTopBar('room-code')).toBeNull();
    expect(barButtons()).toContain('Create room');
    expect(text(el())).toContain('rejoin with code ABC123');
  });

  it('End room in the menu still asks before deleting the room, and a no keeps the room', async () => {
    openRoom();
    const confirm = spyOn(component['confirmationDialog'], 'confirm').and.resolveTo(false);

    openRoomMenu();
    pickFromRoomMenu('End room');
    await settle();

    expect(confirm).toHaveBeenCalled();
    expect(confirm.calls.mostRecent().args[1]).toBe('Delete this room?');
    expect(text(inTopBar('room-code'))).toBe('ABC123');
  });

  it('End room in the menu, answered yes, still deletes the room and leaves it', async () => {
    openRoom();
    spyOn(component['confirmationDialog'], 'confirm').and.resolveTo(true);
    spyOn(sync, 'endSession').and.resolveTo();

    openRoomMenu();
    pickFromRoomMenu('End room');
    await settle();

    expect(sync.endSession).toHaveBeenCalledWith('ABC123');
    expect(inTopBar('room-code')).toBeNull();
    expect(barButtons()).toContain('Create room');
  });

  it('Join another room shows a code box on the bar; Join room joins as before and Cancel puts the bar back', async () => {
    openRoom();
    openRoomMenu();
    pickFromRoomMenu('Join another room…');

    const input = inTopBar('join-room-input') as HTMLInputElement;
    expect(input).withContext('code box').toBeTruthy();
    expect(barButtons()).toContain('Join room');

    clickBarButton('Cancel');
    expect(inTopBar('join-room-input')).toBeNull();
    expect(text(inTopBar('room-code'))).toBe('ABC123');

    // Join really joins: same path as before, by the code typed.
    const join = spyOn(component, 'btnJoinShareSession_Click').and.resolveTo();
    openRoomMenu();
    pickFromRoomMenu('Join another room…');
    const box = inTopBar('join-room-input') as HTMLInputElement;
    box.value = 'XYZ999';
    box.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    clickBarButton('Join room');
    await settle();

    expect(join).toHaveBeenCalled();
    expect(component.shareJoinCode).toBe('XYZ999');
  });

  it('Create a new room in the menu still creates a room the same way (asking first, as before)', async () => {
    openRoom();
    const create = spyOn(component, 'btnCreateShareSession_Click').and.resolveTo();

    openRoomMenu();
    pickFromRoomMenu('Create a new room…');
    await settle();

    expect(create).toHaveBeenCalled();
  });
});
