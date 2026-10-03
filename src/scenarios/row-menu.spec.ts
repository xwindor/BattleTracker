// GM screen overhaul, ticket 08 (GitHub #11, spec #3): the row menu (⋯).
// Seize the Initiative, Duplicate, Enter/Leave combat, the player-claim
// setting and Delete leave the row and sit in a menu at its end (user stories
// 25-30); the Claimed / release-claim button stays on the row (story 20).
// Every moved control does exactly what it did before (the spec's ground
// rule): Delete still asks first, Seize still asks first and is still absent
// before the participant has rolled.
//
// Built the same way as the other GM screen tests: the whole GM screen,
// driven through its buttons. Glossary terms (CONTEXT.md): row menu,
// participant, initiative list.

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BattleTrackerComponent } from 'app/battle-tracker/battle-tracker.component';
import { appConfig } from 'app/app.config';
import { CombatManager } from 'Combat';
import { Participant } from 'Combat/Participants/Participant';
import { SessionSyncService } from 'app/services/session-sync.service';
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

describe('Row menu (GM screen overhaul 08, #11)', () => {
  let component: BattleTrackerComponent;
  let fixture: ComponentFixture<BattleTrackerComponent>;

  beforeEach(async () => {
    forgetPanel();
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
    fixture.detectChanges();
  });

  afterEach(() => {
    resetCombat();
    forgetPanel();
  });

  // ── helpers ────────────────────────────────────────────────────────────

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
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

  function rowOf(p: Participant): HTMLElement {
    const i = CombatManager.participants.items.indexOf(p);
    const row = el().querySelector('#participant' + i) as HTMLElement;
    expect(row).withContext('row for ' + p.name).toBeTruthy();
    return row;
  }

  function menuOf(p: Participant): HTMLElement {
    const menu = rowOf(p).querySelector('[data-testid="row-menu"]') as HTMLElement;
    expect(menu).withContext('row menu for ' + p.name).toBeTruthy();
    return menu;
  }

  function isMenuOpen(p: Participant): boolean {
    return !!menuOf(p).querySelector('.dropdown-menu.show');
  }

  function openMenu(p: Participant): void {
    (rowOf(p).querySelector('[data-testid="row-menu-btn"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(isMenuOpen(p)).withContext('menu opened').toBeTrue();
  }

  /** The menu's items, as the GM reads them. */
  function menuItems(p: Participant): string[] {
    return Array.from(menuOf(p).querySelectorAll('.dropdown-menu button'))
      .map(b => (b.textContent || '').replace(/\s+/g, ' ').trim());
  }

  function pick(p: Participant, label: string): void {
    const item = Array.from(menuOf(p).querySelectorAll('.dropdown-menu button'))
      .find(b => (b.textContent || '').replace(/\s+/g, ' ').trim() === label) as HTMLButtonElement | undefined;
    expect(item).withContext('menu item ' + label).toBeTruthy();
    item!.click();
    fixture.detectChanges();
  }

  /** Buttons sitting on the row itself, outside its menu. */
  function rowButtonsOutsideMenu(p: Participant): string[] {
    return Array.from(rowOf(p).querySelectorAll('button'))
      .filter(b => !b.closest('.dropdown-menu'))
      .map(b => ((b.getAttribute('title') || '') + ' ' + (b.textContent || '')).replace(/\s+/g, ' ').trim());
  }

  // ── what the menu holds ────────────────────────────────────────────────

  it('every row has a row menu holding Duplicate, Leave combat, the claim setting and Delete', () => {
    // Not yet rolled, so Seize the Initiative isn't offered (see below).
    const razor = scored('Razor', 10, 0);
    razor.diceIni = 0;
    fixture.detectChanges();

    openMenu(razor);
    expect(menuItems(razor)).toEqual([
      'Duplicate',
      'Leave combat',
      'Players can claim: off',
      'Delete…'
    ]);
  });

  it('those controls no longer sit on the row; the menu button does', () => {
    const razor = scored('Razor', 10, 5);
    component.btnStartRound_Click();
    fixture.detectChanges();

    const outside = rowButtonsOutsideMenu(razor).join(' | ');
    for (const gone of ['Seize', 'Duplicate', 'Leave combat', 'Enter combat', 'Claimable', 'Private', 'Delete']) {
      expect(outside).withContext(gone + ' is off the row').not.toContain(gone);
    }
    expect(rowOf(razor).querySelector('[data-testid="row-menu-btn"]')).not.toBeNull();
  });

  it('the menu is closed until the GM opens it, and picking an item closes it', () => {
    const razor = scored('Razor', 10, 5);
    fixture.detectChanges();
    expect(isMenuOpen(razor)).toBeFalse();

    openMenu(razor);
    pick(razor, 'Players can claim: off');

    expect(isMenuOpen(razor)).withContext('closed after picking').toBeFalse();
  });

  it('picking an item with the keyboard closes the menu too', () => {
    const razor = scored('Razor', 10, 5);
    fixture.detectChanges();

    openMenu(razor);
    // Enter on a focused button arrives as a click with no mouse press or
    // release around it - the drop-down's own auto-close never sees it.
    const item = menuOf(razor).querySelector('[data-testid="claimable-btn"]') as HTMLButtonElement;
    item.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    fixture.detectChanges();

    expect(component.isParticipantClaimable(razor)).toBeTrue();
    expect(isMenuOpen(razor)).withContext('closed after a keyboard pick').toBeFalse();
  });

  it('Escape closes the menu and leaves the participant panel open', async () => {
    const razor = scored('Razor', 10, 5);
    fixture.detectChanges();
    (rowOf(razor).querySelector('input.gm-name-input') as HTMLInputElement).click();
    fixture.detectChanges();
    expect(el().querySelector('[data-testid="participant-panel"]')).withContext('panel open').not.toBeNull();

    openMenu(razor);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(isMenuOpen(razor)).withContext('menu closed').toBeFalse();
    expect(el().querySelector('[data-testid="participant-panel"]')).withContext('panel still open').not.toBeNull();
  });

  it('the claim setting in the menu turns player claiming on and off, as the lock button did', () => {
    const razor = scored('Razor', 10, 5);
    fixture.detectChanges();
    expect(component.isParticipantClaimable(razor)).toBeFalse();

    openMenu(razor);
    pick(razor, 'Players can claim: off');
    expect(component.isParticipantClaimable(razor)).toBeTrue();

    openMenu(razor);
    expect(menuItems(razor)).toContain('Players can claim: on');
    pick(razor, 'Players can claim: on');
    expect(component.isParticipantClaimable(razor)).toBeFalse();
  });

  // ── each moved control does what it did ────────────────────────────────

  it('Duplicate copies the participant', () => {
    const razor = scored('Razor', 10, 5);
    fixture.detectChanges();

    openMenu(razor);
    pick(razor, 'Duplicate');

    expect(CombatManager.participants.count).toBe(2);
    expect(isMenuOpen(razor)).toBeFalse();
  });

  it('Leave combat and Enter combat take the participant out of the order and back', () => {
    const razor = scored('Razor', 10, 5);
    fixture.detectChanges();

    openMenu(razor);
    pick(razor, 'Leave combat');
    expect(razor.ooc).toBeTrue();

    openMenu(razor);
    expect(menuItems(razor)).toContain('Enter combat');
    pick(razor, 'Enter combat');
    expect(razor.ooc).toBeFalse();
  });

  it('Delete asks for confirmation first, exactly as before', async () => {
    const razor = scored('Razor', 10, 5);
    fixture.detectChanges();
    const confirm = spyOn(component['confirmationDialog'], 'simpleConfirm').and.resolveTo(false);

    openMenu(razor);
    pick(razor, 'Delete…');
    await fixture.whenStable();

    expect(confirm).toHaveBeenCalledWith('Are you sure you want to remove Razor?');
    expect(CombatManager.participants.contains(razor)).withContext('cancelled: still there').toBeTrue();

    confirm.and.resolveTo(true);
    openMenu(razor);
    pick(razor, 'Delete…');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(CombatManager.participants.contains(razor)).withContext('confirmed: gone').toBeFalse();
  });

  it('Seize the Initiative is not offered before the participant has rolled', () => {
    const unrolled = scored('Unrolled', 10, 0);
    component.btnStartRound_Click();
    unrolled.diceIni = 0;
    fixture.detectChanges();

    openMenu(unrolled);
    expect(menuItems(unrolled).some(i => i.startsWith('Seize'))).toBeFalse();
  });

  it('Seize the Initiative is offered once rolled, asks first, then seizes; and is gone once seized', async () => {
    const razor = scored('Razor', 10, 5);
    scored('Kestrel', 12, 6);
    component.btnStartRound_Click();
    fixture.detectChanges();
    const confirm = spyOn(component['confirmationDialog'], 'confirm').and.resolveTo(true);

    openMenu(razor);
    expect(menuItems(razor)[0]).toBe('Seize the Initiative (Edge)');
    pick(razor, 'Seize the Initiative (Edge)');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(confirm).toHaveBeenCalled();
    expect(razor.edge).withContext('seized').toBeTrue();
    openMenu(razor);
    expect(menuItems(razor).some(i => i.startsWith('Seize'))).withContext('only once per turn').toBeFalse();
  });

  // ── what stays on the row ──────────────────────────────────────────────

  it('the release-claim button stays on the row, reading "Claimed ×"', () => {
    const razor = scored('Razor', 10, 5);
    component['participantOwners'].set(razor, 'pl-razor');
    fixture.detectChanges();

    const release = rowOf(razor).querySelector('[data-testid="release-claim-btn"]') as HTMLButtonElement;
    expect(release).not.toBeNull();
    expect(release.closest('.dropdown-menu')).withContext('not inside the menu').toBeNull();
    expect((release.textContent || '').replace(/\s+/g, ' ').trim()).toBe('Claimed ×');
  });

  // ── tidy columns ───────────────────────────────────────────────────────

  it('the list has small headings Ini, Name, Roll, Actions, Details in that order', () => {
    scored('Razor', 10, 5);
    fixture.detectChanges();

    const headings = Array.from(el().querySelectorAll('[data-testid="initiative-list-headings"] .gm-col-header'))
      .map(h => (h.textContent || '').trim());
    expect(headings).toEqual(['Ini', 'Name', 'Roll', 'Actions', 'Details']);
  });

  it('"Needs roll" and "Asked" sit in the Actions column, not under the roll box', () => {
    scored('Kestrel', 12, 6);
    component.btnStartRound_Click();
    const late = scored('Late', 10, 0);
    late.diceIni = 0;
    fixture.detectChanges();

    const tag = rowOf(late).querySelector('[data-testid="needs-initiative-roll-indicator"]') as HTMLElement;
    expect(tag).not.toBeNull();
    expect(tag.closest('.gm-col-actions')).withContext('in the Actions column').not.toBeNull();
  });

  it('the roll button is a small die with pips', () => {
    const razor = scored('Razor', 10, 0);
    razor.diceIni = 0;
    fixture.detectChanges();

    const roll = rowOf(razor).querySelector('.gm-roll-btn') as HTMLButtonElement;
    expect(roll.getAttribute('aria-label')).toBe('Roll Initiative');
    expect(roll.querySelectorAll('.gm-pip-die .gm-pip').length).toBe(5);
  });
});
