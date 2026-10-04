// GM screen overhaul, ticket 09 (GitHub #12, spec #3): merging grunts starts
// from the row menu. This is the spec's one named exception to "controls only
// move": a lone grunt's row menu offers "Merge into a group…", which starts
// picking - tick boxes on lone grunts only, the starting grunt already ticked,
// and a "Merge N into a Grunt Group" bar with Cancel at the top of the list
// (user stories 46-50). Outside picking there are no tick boxes. The merge
// itself is exactly today's: the same naming dialog, the same refusals, the
// same grunt group.
//
// Built the same way as the other GM screen tests: the whole GM screen,
// driven through its buttons. Glossary terms (CONTEXT.md): row menu,
// participant, initiative list, grunt group.

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BattleTrackerComponent } from 'app/battle-tracker/battle-tracker.component';
import { appConfig } from 'app/app.config';
import { CombatManager } from 'Combat';
import { IParticipant } from 'Combat/Participants/IParticipant';
import { Participant } from 'Combat/Participants/Participant';
import { SessionSyncService } from 'app/services/session-sync.service';
import { PARTICIPANT_PANEL_MEMORY_KEY } from 'app/battle-tracker/gm-screen-memory';
import { NpcRowParticipant } from 'Grunts';

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

describe('Merge picking from the row menu (GM screen overhaul 09, #12)', () => {
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
    component.cancelAddDraft();
    resetCombat();
    forgetPanel();
  });

  // ── helpers ────────────────────────────────────────────────────────────

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function pc(name: string): Participant {
    const p = new Participant();
    p.name = name;
    p.baseIni = 10;
    p.setDicesWithoutRoll(1);
    CombatManager.participants.insert(p);
    return p;
  }

  function rowOf(p: IParticipant): HTMLElement {
    const i = CombatManager.participants.items.indexOf(p);
    const row = el().querySelector('#participant' + i) as HTMLElement;
    expect(row).withContext('row for ' + p.name).toBeTruthy();
    return row;
  }

  function openMenu(p: IParticipant): void {
    (rowOf(p).querySelector('[data-testid="row-menu-btn"]') as HTMLButtonElement).click();
    fixture.detectChanges();
  }

  function menuItems(p: IParticipant): string[] {
    return Array.from(rowOf(p).querySelectorAll('.dropdown-menu button'))
      .map(b => (b.textContent || '').replace(/\s+/g, ' ').trim());
  }

  function pick(p: IParticipant, label: string): void {
    const item = Array.from(rowOf(p).querySelectorAll('.dropdown-menu button'))
      .find(b => (b.textContent || '').replace(/\s+/g, ' ').trim() === label) as HTMLButtonElement | undefined;
    expect(item).withContext('menu item ' + label).toBeTruthy();
    item!.click();
    fixture.detectChanges();
  }

  function startPicking(from: IParticipant): void {
    openMenu(from);
    pick(from, 'Merge into a group…');
  }

  function tickBox(p: IParticipant): HTMLInputElement | null {
    return rowOf(p).querySelector('[data-testid="merge-select-box"]');
  }

  function allTickBoxes(): HTMLInputElement[] {
    return Array.from(el().querySelectorAll('[data-testid="merge-select-box"]'));
  }

  function tick(p: IParticipant): void {
    const box = tickBox(p);
    expect(box).withContext('tick box for ' + p.name).toBeTruthy();
    box!.click();
    fixture.detectChanges();
  }

  function bar(): HTMLElement | null {
    return el().querySelector('[data-testid="merge-grunts-bar"]');
  }

  function barButton(testid: string): HTMLButtonElement {
    const btn = bar()?.querySelector(`[data-testid="${testid}"]`) as HTMLButtonElement | null;
    expect(btn).withContext(testid).toBeTruthy();
    return btn!;
  }

  function text(node: Element | null): string {
    return (node?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  /**
   * The naming dialog's Confirm. The dialog is drawn by the page toolkit
   * outside the screen, a moment later, so - like the other add-dialog tests -
   * this presses Confirm through the screen's own Confirm step.
   */
  function confirmNamingDialog(name?: string): void {
    expect(component.pendingAddDraft).withContext('naming dialog open').not.toBeNull();
    if (name !== undefined) {
      component.pendingAddDraft!.name = name;
    }
    component.commitAddDraft();
    fixture.detectChanges();
  }

  /** A grunt added through the Add Grunt dialog, from a statblock template. */
  function gruntFromTemplate(name: string, statblockId: string): IParticipant {
    component.btnAddGrunt_Click();
    component.pendingAddDraft!.name = name;
    component.pendingAddDraft!.statblockId = statblockId;
    component.commitAddDraft();
    const items = CombatManager.participants.items;
    return items[items.length - 1];
  }

  function names(): string[] {
    return CombatManager.participants.items.map(p => p.name);
  }

  // ── where it starts ────────────────────────────────────────────────────

  it('outside picking, no grunt row has a tick box and there is no merge bar', () => {
    component.addGrunt('Ganger A');
    component.addGrunt('Ganger B');
    fixture.detectChanges();

    expect(allTickBoxes().length).toBe(0);
    expect(bar()).toBeNull();
  });

  it('"Merge into a group…" is in a lone grunt\'s row menu, just above Delete, and nowhere else', () => {
    const grunt = component.addGrunt('Ganger A');
    const razor = pc('Razor');
    const group = component.addNpcRow(false);
    fixture.detectChanges();

    openMenu(grunt);
    const items = menuItems(grunt);
    expect(items).toContain('Merge into a group…');
    expect(items[items.indexOf('Merge into a group…') + 1]).toBe('Delete…');

    openMenu(razor);
    expect(menuItems(razor)).not.toContain('Merge into a group…');
    openMenu(group);
    expect(menuItems(group)).not.toContain('Merge into a group…');
  });

  // ── picking ────────────────────────────────────────────────────────────

  it('choosing it shows tick boxes on lone grunts only, with the starting grunt ticked', () => {
    const a = component.addGrunt('Ganger A');
    const b = component.addGrunt('Ganger B');
    const razor = pc('Razor');
    const group = component.addNpcRow(false);
    fixture.detectChanges();

    startPicking(b);

    expect(tickBox(a)).toBeTruthy();
    expect(tickBox(a)!.checked).toBeFalse();
    expect(tickBox(b)).toBeTruthy();
    expect(tickBox(b)!.checked).toBeTrue();
    expect(tickBox(razor)).toBeNull();
    expect(tickBox(group)).toBeNull();
  });

  it('the bar at the top of the list counts the ticked grunts, with Merge only once two are ticked', () => {
    const a = component.addGrunt('Ganger A');
    const b = component.addGrunt('Ganger B');
    fixture.detectChanges();

    startPicking(a);
    expect(bar()).toBeTruthy();
    expect(text(bar())).toContain('Merge 1 into a Grunt Group');
    expect(barButton('merge-grunts-btn').disabled).toBeTrue();
    expect(barButton('merge-grunts-cancel')).toBeTruthy();

    tick(b);
    expect(text(bar())).toContain('Merge 2 into a Grunt Group');
    expect(barButton('merge-grunts-btn').disabled).toBeFalse();

    // A mis-tap is one tap to undo, as before.
    tick(b);
    expect(text(bar())).toContain('Merge 1 into a Grunt Group');
  });

  it('the bar sits at the top of the initiative list, above the column headings', () => {
    const a = component.addGrunt('Ganger A');
    fixture.detectChanges();
    startPicking(a);

    // In page order, the bar comes before the headings.
    const inOrder = Array.from(el().querySelectorAll(
      '[data-testid="merge-grunts-bar"], [data-testid="initiative-list-headings"]'
    )).map(n => n.getAttribute('data-testid'));
    expect(inOrder).toEqual(['merge-grunts-bar', 'initiative-list-headings']);
  });

  it('while picking, the row menu no longer offers to start another merge', () => {
    const a = component.addGrunt('Ganger A');
    const b = component.addGrunt('Ganger B');
    fixture.detectChanges();

    startPicking(a);
    openMenu(b);
    expect(menuItems(b)).not.toContain('Merge into a group…');
  });

  it('Cancel ends picking: the tick boxes and the bar go, and nothing is merged', () => {
    const a = component.addGrunt('Ganger A');
    const b = component.addGrunt('Ganger B');
    fixture.detectChanges();

    startPicking(a);
    tick(b);
    barButton('merge-grunts-cancel').click();
    fixture.detectChanges();

    expect(allTickBoxes().length).toBe(0);
    expect(bar()).toBeNull();
    expect(names()).toEqual(['Ganger A', 'Ganger B']);

    // Starting again begins from a clean slate: only the new starting grunt.
    startPicking(b);
    expect(tickBox(a)!.checked).toBeFalse();
    expect(tickBox(b)!.checked).toBeTrue();
  });

  it('unticking the last grunt ends picking, as the old merge bar hid itself', () => {
    const a = component.addGrunt('Ganger A');
    const b = component.addGrunt('Ganger B');
    fixture.detectChanges();

    startPicking(a);
    tick(a);

    expect(bar()).toBeNull();
    expect(allTickBoxes().length).toBe(0);
    openMenu(b);
    expect(menuItems(b)).toContain('Merge into a group…');
  });

  it('deleting the only ticked grunt ends picking, leaving no empty "Merge 0" bar', async () => {
    const a = component.addGrunt('Ganger A');
    component.addGrunt('Ganger B');
    fixture.detectChanges();

    startPicking(a);
    spyOn(component['confirmationDialog'], 'simpleConfirm').and.resolveTo(true);
    openMenu(a);
    pick(a, 'Delete…');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(names()).toEqual(['Ganger B']);
    expect(bar()).toBeNull();
    expect(allTickBoxes().length).toBe(0);
  });

  // ── lieutenants are never offered ──────────────────────────────────────
  // A lieutenant has his own attributes and his own Initiative Test (Core
  // p. 380-381), so the merge has always refused him. Xavier, 2026-10-04: with
  // picking new, don't offer him at all - no menu item, no tick box.

  it('a grunt made from a lieutenant template gets no menu item and no tick box', () => {
    const boss = gruntFromTemplate('Boss', 'pr1-lieutenant');
    const ganger = gruntFromTemplate('Ganger', 'pr1-grunt');
    fixture.detectChanges();

    openMenu(boss);
    expect(menuItems(boss)).not.toContain('Merge into a group…');

    startPicking(ganger);
    expect(tickBox(boss)).toBeNull();
    expect(tickBox(ganger)).toBeTruthy();
  });

  it('a grunt linked to a group as its lieutenant gets no menu item and no tick box', () => {
    const squad = component.addNpcRow(false);
    const fixer = component.addGrunt('Fixer');
    const ganger = component.addGrunt('Ganger');
    component.setLieutenantTeam(fixer, squad);
    fixture.detectChanges();

    openMenu(fixer);
    expect(menuItems(fixer)).not.toContain('Merge into a group…');

    startPicking(ganger);
    expect(tickBox(fixer)).toBeNull();
  });

  it('a grunt that has already rolled is still offered, and still refused with a reason, as before', () => {
    const a = component.addGrunt('Ganger A');
    component['rollAndLogInitiative'](a);
    fixture.detectChanges();

    openMenu(a);
    expect(menuItems(a)).toContain('Merge into a group…');
  });

  // ── the merge itself, unchanged ────────────────────────────────────────

  it('Merge forms the same grunt group as before, carrying damage, and ends picking', () => {
    const a = component.addGrunt('Ganger A');
    const b = component.addGrunt('Ganger B');
    const razor = pc('Razor');
    a.physicalDamage = 2;
    b.stunDamage = 1;
    fixture.detectChanges();

    startPicking(a);
    tick(b);
    barButton('merge-grunts-btn').click();

    // Still the naming dialog first, creating nothing until Confirm.
    expect(component.pendingAddDraft?.kind).toBe('merge');
    expect(names()).toContain('Ganger A');

    confirmNamingDialog('Halloweeners');

    const groups = CombatManager.participants.items.filter(p => p instanceof NpcRowParticipant) as NpcRowParticipant[];
    expect(groups.length).toBe(1);
    const group = groups[0];
    expect(group.name).toBe('Halloweeners');
    expect(group.members.map(m => m.name)).toEqual(['Ganger A', 'Ganger B']);
    expect(group.members.map(m => m.damage)).toEqual([2, 1]);
    // Goes in unrolled, for its single group Initiative Test.
    expect(component.participantHasRolledThisTurn(group)).toBeFalse();
    expect(names()).not.toContain('Ganger A');
    expect(names()).not.toContain('Ganger B');
    expect(names()).toContain(razor.name);

    // Picking is over.
    expect(allTickBoxes().length).toBe(0);
    expect(bar()).toBeNull();
    // Today's result message still shows.
    expect(text(el().querySelector('[data-testid="merge-grunts-message"]'))).toBe(component.mergeMessage);
    expect(component.mergeMessage).not.toBe('');
  });

  it('a refused merge says why and keeps picking, so the offender can be unticked', () => {
    const a = component.addGrunt('Ganger A');
    const b = component.addGrunt('Ganger B');
    const c = component.addGrunt('Ganger C');
    component['rollAndLogInitiative'](b);
    fixture.detectChanges();

    startPicking(a);
    tick(b);
    barButton('merge-grunts-btn').click();
    confirmNamingDialog();

    expect(CombatManager.participants.items.some(p => p instanceof NpcRowParticipant)).toBeFalse();
    const message = text(el().querySelector('[data-testid="merge-grunts-message"]'));
    expect(message).not.toBe('');
    expect(bar()).toBeTruthy();

    // Untick the offender, tick another, and the merge goes through.
    tick(b);
    tick(c);
    barButton('merge-grunts-btn').click();
    confirmNamingDialog();
    expect(CombatManager.participants.items.some(p => p instanceof NpcRowParticipant)).toBeTrue();
    expect(bar()).toBeNull();
  });

  it('backing out of the naming dialog leaves picking as it was', () => {
    const a = component.addGrunt('Ganger A');
    const b = component.addGrunt('Ganger B');
    fixture.detectChanges();

    startPicking(a);
    tick(b);
    barButton('merge-grunts-btn').click();
    fixture.detectChanges();
    component.cancelAddDraft();
    fixture.detectChanges();

    expect(bar()).toBeTruthy();
    expect(tickBox(a)!.checked).toBeTrue();
    expect(tickBox(b)!.checked).toBeTrue();
    expect(names()).toEqual(['Ganger A', 'Ganger B']);
  });
});
