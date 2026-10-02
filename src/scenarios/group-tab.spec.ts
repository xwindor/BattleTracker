// GM screen overhaul, ticket 06 (GitHub #9, spec #3): the Group tab replaces
// the members panel that used to drop open under a grunt group's row (user
// stories 18, 23, 32, 34, 39). The row's Group button opens the participant
// panel on the Group tab; the tab holds every control the old panel had
// (each member's Act/Acted, name, name suggestion, Body, Willpower, Condition
// Monitor, DV with Physical/Stun/Heal, Detach and Remove, and Add NPC), and
// each does exactly what it did before (the spec's ground rule).
//
// Built the same way as the other participant panel tests: the whole GM
// screen, driven through its buttons. Glossary terms (CONTEXT.md):
// participant panel, participant, grunt group.

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BattleTrackerComponent } from 'app/battle-tracker/battle-tracker.component';
import { appConfig } from 'app/app.config';
import { CombatManager } from 'Combat';
import { NpcRowParticipant } from 'Grunts';
import { SessionSyncService, SharedCombatState, SharedGmState } from 'app/services/session-sync.service';
import { PARTICIPANT_PANEL_MEMORY_KEY } from 'app/battle-tracker/gm-screen-memory';
import { ConfirmationDialogService } from 'app/confirmation-dialog/confirmation-dialog.service';

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

describe('Group tab (GM screen overhaul 06, #9)', () => {
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

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** A grunt group added through the add pop-up, then closed, with these NPCs. */
  function group(name: string, memberNames: string[], baseIni = 9, roll = 8): NpcRowParticipant {
    component.btnAddNpcRow_Click();
    component.pendingAddDraft!.name = name;
    component.commitAddDraft();
    const row = CombatManager.participants.items.find(x => x.name === name) as NpcRowParticipant;
    expect(row).withContext('group ' + name).toBeTruthy();
    for (const m of [...row.members]) row.removeMember(m);
    for (const n of memberNames) component.addNpcToRow(row, n);
    row.baseIni = baseIni;
    row.setDicesWithoutRoll(2);
    row.diceIni = roll;
    component.closeParticipantPanel();
    fixture.detectChanges();
    return row;
  }

  function rowOf(p: NpcRowParticipant): HTMLElement {
    const i = CombatManager.participants.items.indexOf(p);
    const row = el().querySelector('#participant' + i) as HTMLElement;
    expect(row).withContext('row for ' + p.name).toBeTruthy();
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

  function clickTab(label: string): void {
    const tab = Array.from(panel()!.querySelectorAll('nav button'))
      .find(b => (b.textContent || '').trim() === label) as HTMLButtonElement;
    expect(tab).withContext(label + ' tab').toBeTruthy();
    tab.click();
    fixture.detectChanges();
  }

  function pressGroup(p: NpcRowParticipant): void {
    (rowOf(p).querySelector('[data-testid="group-btn"]') as HTMLButtonElement).click();
    fixture.detectChanges();
  }

  function groupTab(): HTMLElement {
    const tab = panel()?.querySelector('[data-testid="group-tab"]') as HTMLElement | null;
    expect(tab).withContext('Group tab content').toBeTruthy();
    return tab!;
  }

  /** The Group tab's entry for the member called `name` (listed in the group's order). */
  function memberLine(name: string): HTMLElement {
    const shown = component.selectedActor as NpcRowParticipant;
    const line = memberLines()[shown.members.findIndex(m => m.name === name)];
    expect(line).withContext('member line ' + name).toBeTruthy();
    return line;
  }

  function memberLines(): HTMLElement[] {
    return Array.from(groupTab().querySelectorAll('.npc-row-member'));
  }

  function click(container: HTMLElement, selector: string): void {
    const b = container.querySelector(selector) as HTMLButtonElement;
    expect(b).withContext(selector).toBeTruthy();
    b.click();
    fixture.detectChanges();
  }

  function type(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  /** Let the form boxes pick up what the screen now holds. */
  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  // ── the Group button ───────────────────────────────────────────────────

  it('the Group button opens the participant panel on the Group tab, and nothing opens under the row', () => {
    const gangers = group('Halloweeners', ['Ganger 1', 'Ganger 2']);

    pressGroup(gangers);

    expect(panelName()).toBe('Halloweeners');
    expect(activeTab()).toBe('Group');
    const outsidePanel = Array.from(el().querySelectorAll('.npc-row-member')).filter(m => !panel()!.contains(m));
    expect(outsidePanel.length).withContext('members shown anywhere but the panel').toBe(0);
    expect(memberLines().length).toBe(2);
  });

  it('pressing it again leaves the tab open (close with × or Escape)', () => {
    const gangers = group('Halloweeners', ['Ganger 1']);

    pressGroup(gangers);
    pressGroup(gangers);

    expect(panelName()).toBe('Halloweeners');
    expect(activeTab()).toBe('Group');
  });

  it('the row\'s Group button is filled while that group\'s Group tab is showing', () => {
    const gangers = group('Halloweeners', ['Ganger 1']);
    const filled = () => rowOf(gangers).querySelector('[data-testid="group-btn"]')!.classList.contains('btn-info');
    expect(filled()).withContext('panel closed').toBeFalse();

    pressGroup(gangers);
    expect(filled()).toBeTrue();

    clickTab('Stats');
    expect(filled()).withContext('on the Stats tab').toBeFalse();
  });

  it('a grunt group\'s panel has exactly two tabs, Group and Stats', () => {
    const gangers = group('Halloweeners', ['Ganger 1']);

    pressGroup(gangers);

    expect(tabLabels()).toEqual(['Group', 'Stats']);
  });

  it('coming from a character\'s Condition tab, a group\'s name opens Group; back on the character it is Condition again', () => {
    const gangers = group('Halloweeners', ['Ganger 1']);
    component.btnAddGrunt_Click();
    component.pendingAddDraft!.name = 'Lone Ganger';
    component.commitAddDraft();
    fixture.detectChanges();
    clickTab('Condition');
    const clickName = (who: string) => {
      const i = CombatManager.participants.items.findIndex(x => x.name === who);
      (el().querySelector('#participant' + i + ' input.gm-name-input') as HTMLInputElement).click();
      fixture.detectChanges();
    };

    clickName(gangers.name);
    expect(panelName()).toBe('Halloweeners');
    expect(activeTab()).toBe('Group');

    clickName('Lone Ganger');
    expect(panelName()).toBe('Lone Ganger');
    expect(activeTab()).toBe('Condition');
  });

  it('a character\'s panel has no Group tab', () => {
    component.btnAddGrunt_Click();
    component.pendingAddDraft!.name = 'Lone Ganger';
    component.commitAddDraft();
    fixture.detectChanges();

    expect(tabLabels()).not.toContain('Group');
  });

  // ── each member, as before ─────────────────────────────────────────────

  it('a member\'s Act is live only while the group is up, and Acted un-marks it', () => {
    const gangers = group('Halloweeners', ['Ganger 1']);
    pressGroup(gangers);
    let act = memberLine('Ganger 1').querySelector('.npc-row-acted') as HTMLButtonElement;
    expect(act.textContent!.trim()).toBe('Act');
    expect(act.disabled).withContext('group not up').toBeTrue();

    CombatManager.started = true;
    CombatManager.passEnded = false;
    CombatManager.goToNextActors();
    fixture.detectChanges();
    act = memberLine('Ganger 1').querySelector('.npc-row-acted') as HTMLButtonElement;
    expect(act.disabled).withContext('group is up').toBeFalse();

    gangers.members[0].hasActed = true;
    fixture.detectChanges();
    act = memberLine('Ganger 1').querySelector('.npc-row-acted') as HTMLButtonElement;
    expect(act.textContent!.trim()).toBe('Acted');
    act.click();
    fixture.detectChanges();
    expect(gangers.members[0].hasActed).withContext('one tap un-marks it').toBeFalse();
  });

  it('a member\'s Act opens the Declare Actions pop-up for that NPC when the group is up', () => {
    const gangers = group('Halloweeners', ['Ganger 1']);
    CombatManager.started = true;
    CombatManager.passEnded = false;
    CombatManager.goToNextActors();
    pressGroup(gangers);

    click(memberLine('Ganger 1'), '.npc-row-acted');

    expect(component.actModalParticipant).toBe(gangers);
    expect(component.actModalRowMember).toBe(gangers.members[0]);
  });

  it('the name box renames the member and the suggestion button gives a new name', async () => {
    const gangers = group('Halloweeners', ['Ganger 1']);
    pressGroup(gangers);
    await settle();

    type(memberLine('Ganger 1').querySelector('.npc-row-member-name') as HTMLInputElement, 'Slasher');
    expect(gangers.members[0].name).toBe('Slasher');

    click(groupTab(), '[data-testid="row-member-name-generate"]');
    expect(gangers.members[0].name).not.toBe('Slasher');
  });

  it('Body and Willpower set the member\'s Condition Monitor size, shown as its count', async () => {
    const gangers = group('Halloweeners', ['Ganger 1']);
    pressGroup(gangers);
    await settle();
    const line = memberLine('Ganger 1');
    const [body, willpower] = Array.from(line.querySelectorAll('.npc-row-bw-group input')) as HTMLInputElement[];

    type(body, '6');
    type(willpower, '2');

    expect(gangers.members[0].body).toBe(6);
    expect(gangers.members[0].willpower).toBe(2);
    // 8 + ceil(max(Body, Willpower) / 2) boxes (Core p. 379).
    expect(gangers.members[0].conditionMonitorBoxes).toBe(11);
    expect((line.querySelector('.npc-row-cm')!.textContent || '').replace(/\s+/g, ' ').trim()).toBe('CM 0/11');
  });

  it('the DV with Physical, Stun and Heal records damage as before', async () => {
    const gangers = group('Halloweeners', ['Ganger 1']);
    pressGroup(gangers);
    await settle();
    const line = memberLine('Ganger 1');

    type(line.querySelector('.npc-row-dv') as HTMLInputElement, '3');
    click(line, '.npc-row-hit-physical');
    expect(gangers.members[0].damage).toBe(3);

    click(memberLine('Ganger 1'), '.npc-row-hit-stun');
    expect(gangers.members[0].damage).toBe(6);

    type(memberLine('Ganger 1').querySelector('.npc-row-dv') as HTMLInputElement, '2');
    click(memberLine('Ganger 1'), '.npc-row-heal');
    expect(gangers.members[0].damage).toBe(4);
    expect((memberLine('Ganger 1').querySelector('.npc-row-cm')!.textContent || '')).toContain('CM 4/');
  });

  it('Detach puts the member on their own row, and the tab no longer lists them', () => {
    const gangers = group('Halloweeners', ['Ganger 1', 'Ganger 2']);
    pressGroup(gangers);

    click(memberLine('Ganger 2'), '.npc-row-detach');

    expect(CombatManager.participants.items.some(x => x.name === 'Ganger 2')).withContext('own row').toBeTrue();
    expect(gangers.members.map(m => m.name)).toEqual(['Ganger 1']);
    expect(memberLines().length).toBe(1);
  });

  it('Remove asks for confirmation, then takes the member out', async () => {
    const confirm = spyOn(TestBed.inject(ConfirmationDialogService), 'simpleConfirm').and.resolveTo(true);
    const gangers = group('Halloweeners', ['Ganger 1', 'Ganger 2']);
    pressGroup(gangers);

    click(memberLine('Ganger 1'), '.npc-row-remove');
    await settle();

    expect(confirm).toHaveBeenCalled();
    expect(gangers.members.map(m => m.name)).toEqual(['Ganger 2']);
    expect(memberLines().length).toBe(1);
  });

  it('Add NPC opens the add pop-up for this group, and the new NPC is listed in the tab', () => {
    const gangers = group('Halloweeners', ['Ganger 1']);
    pressGroup(gangers);

    click(groupTab(), '.npc-row-add-member');
    expect(component.pendingAddDraft?.targetRow).toBe(gangers);
    component.pendingAddDraft!.name = 'Ganger 2';
    component.commitAddDraft();
    fixture.detectChanges();

    expect(gangers.members.map(m => m.name)).toEqual(['Ganger 1', 'Ganger 2']);
    expect(panelName()).toBe('Halloweeners');
    expect(activeTab()).toBe('Group');
    expect(memberLines().length).toBe(2);
  });

  it('the tab says how many NPCs still have to act this pass', () => {
    const gangers = group('Halloweeners', ['Ganger 1', 'Ganger 2']);
    pressGroup(gangers);

    expect(groupTab().querySelector('.npc-row-acted-summary')!.textContent!.trim())
      .toBe(component.getRowActedSummary(gangers));
  });

  // ── merging and remembering ────────────────────────────────────────────

  it('merging grunts opens the new group on its Group tab', () => {
    const a = component.addGrunt('A');
    const b = component.addGrunt('B');
    component.toggleMergeSelection(a);
    component.toggleMergeSelection(b);

    component.mergeSelectedGrunts('Halloweeners');
    fixture.detectChanges();

    expect(panelName()).toBe('Halloweeners');
    expect(activeTab()).toBe('Group');
    expect(memberLines().length).toBe(2);
  });

  it('after a refresh, a panel left on the Group tab reopens on the Group tab', () => {
    const gangers = group('Halloweeners', ['Ganger 1']);
    pressGroup(gangers);

    component.shareRoomCode = 'ABC123';
    component['syncSharedState']();
    const state = states[states.length - 1];
    const gmState = gmStates[gmStates.length - 1];
    fixture.destroy();
    resetCombat();
    buildScreen();
    component['restoreFromSharedState'](state, gmState);
    fixture.detectChanges();

    expect(panelName()).toBe('Halloweeners');
    expect(activeTab()).toBe('Group');
    expect(memberLines().length).toBe(1);
  });
});
