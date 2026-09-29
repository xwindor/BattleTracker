// GM screen overhaul, ticket 01 (GitHub #4, spec #3): the participant panel
// with its Condition and Stats tabs replaces the old details column.
//
// Driven the way the GM drives it: click a participant's name, click elsewhere
// on a row, press the panel's ×, type into the Stats tab. Glossary terms
// (CONTEXT.md): participant panel, initiative list, participant.

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BattleTrackerComponent } from 'app/battle-tracker/battle-tracker.component';
import { appConfig } from 'app/app.config';
import { CombatManager } from 'Combat';
import { Participant } from 'Combat/Participants/Participant';

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

describe('Participant panel (GM screen overhaul 01, #4)', () => {
  let component: BattleTrackerComponent;
  let fixture: ComponentFixture<BattleTrackerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BattleTrackerComponent],
      providers: appConfig.providers
    }).compileComponents();
    fixture = TestBed.createComponent(BattleTrackerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    resetCombat();
    // The GM screen starts with one blank participant, selected, so its panel
    // is open at load (unchanged behaviour). resetCombat() removes that
    // participant; start each test from a closed panel, as the GM would after
    // pressing its ×.
    component.closeParticipantPanel();
    fixture.detectChanges();
  });

  afterEach(resetCombat);

  // ── helpers ────────────────────────────────────────────────────────────

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

  function panel(): HTMLElement | null {
    return el().querySelector('[data-testid="participant-panel"]');
  }

  function panelName(): string {
    return (panel()?.querySelector('[data-testid="participant-panel-name"]')?.textContent || '').trim();
  }

  function tabLabels(): string[] {
    return Array.from(panel()?.querySelectorAll('nav button') ?? [])
      .map(b => (b.textContent || '').trim());
  }

  function openTab(label: string): void {
    const tab = Array.from(panel()!.querySelectorAll('nav button'))
      .find(b => (b.textContent || '').trim() === label) as HTMLButtonElement | undefined;
    expect(tab).withContext(label + ' tab').toBeTruthy();
    tab!.click();
    fixture.detectChanges();
  }

  function clickName(p: Participant | unknown): void {
    (rowOf(p).querySelector('input.gm-name-input') as HTMLInputElement).click();
    fixture.detectChanges();
  }

  async function typeInto(input: HTMLInputElement, text: string) {
    input.value = text;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  // ── opening, highlighting, closing ─────────────────────────────────────

  it('clicking a participant\'s name opens their participant panel', () => {
    scored('Razor', 10, 5);
    const kestrel = scored('Kestrel', 8, 3);
    fixture.detectChanges();

    expect(panel()).withContext('closed at rest').toBeNull();
    clickName(kestrel);

    expect(panel()).withContext('panel after name click').toBeTruthy();
    expect(panelName()).toBe('Kestrel');
  });

  function clickRow(p: Participant | unknown): void {
    (rowOf(p).querySelector('[data-testid="gm-initiative-score"]') as HTMLElement).click();
    fixture.detectChanges();
  }

  // Xavier, 2026-09-28: "the panel wont open again after i click the x to
  // close it. it also doesnt change when i select a differnt parcipant" - he
  // was clicking the row, not the name box. Decision: a click on the row opens
  // or switches the panel; a click on a button or box in the row does not.
  it('clicking a participant\'s row opens their panel and marks the row', () => {
    const razor = scored('Razor', 10, 5);
    fixture.detectChanges();

    clickRow(razor);

    expect(panelName()).toBe('Razor');
    expect(rowOf(razor).classList).toContain('selected');
  });

  it('clicking a different row switches the panel to that participant', () => {
    const razor = scored('Razor', 10, 5);
    const kestrel = scored('Kestrel', 8, 3);
    fixture.detectChanges();

    clickRow(razor);
    clickRow(kestrel);

    expect(panelName()).toBe('Kestrel');
    expect(rowOf(kestrel).classList).toContain('selected');
    expect(rowOf(razor).classList).not.toContain('selected');
  });

  it('after the × closes it, clicking a row opens the panel again', () => {
    const razor = scored('Razor', 10, 5);
    fixture.detectChanges();
    clickRow(razor);
    (panel()!.querySelector('[data-testid="participant-panel-close"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(panel()).toBeNull();

    clickRow(razor);

    expect(panelName()).toBe('Razor');
  });

  it('clicking a button or box on a row does not open or change the panel', () => {
    const razor = scored('Razor', 10, 5);
    const kestrel = scored('Kestrel', 8, 3);
    fixture.detectChanges();

    // Panel closed: the roll box and the roll button leave it closed.
    (rowOf(kestrel).querySelector('input.inpDiceIni') as HTMLInputElement).click();
    (rowOf(kestrel).querySelector('.gm-roll-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(panel()).toBeNull();

    // Panel open on Razor: clicking a trailing icon on Kestrel's row keeps it on Razor.
    clickRow(razor);
    (rowOf(kestrel).querySelector('.gm-trailing-icon') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(panelName()).toBe('Razor');
  });

  it('the panel\'s × closes it', () => {
    const razor = scored('Razor', 10, 5);
    fixture.detectChanges();
    clickName(razor);
    expect(panel()).toBeTruthy();

    (panel()!.querySelector('[data-testid="participant-panel-close"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(panel()).toBeNull();
  });

  it('clicking another name switches the panel to that participant', () => {
    const razor = scored('Razor', 10, 5);
    const kestrel = scored('Kestrel', 8, 3);
    fixture.detectChanges();

    clickName(razor);
    clickName(kestrel);

    expect(panelName()).toBe('Kestrel');
    expect(el().querySelectorAll('[data-testid="participant-panel"]').length).toBe(1);
  });

  it('the old details column is gone', () => {
    const razor = scored('Razor', 10, 5);
    fixture.detectChanges();
    clickName(razor);

    expect(el().querySelector('.detailsBar')).toBeNull();
  });

  it('stays on the participant you opened when the turn moves on', async () => {
    scored('A', 15, 5);                // Score 20, acts first
    const b = scored('B', 10, 4);      // Score 14
    await component.btnStartRound_Click();
    fixture.detectChanges();

    clickName(b);
    expect(panelName()).toBe('B');

    // A acts: the turn moves on to B.
    component['performAct'](CombatManager.currentActors.items[0], null);
    fixture.detectChanges();
    expect(panelName()).toBe('B');

    // B acts too: the pass ends. The panel still hasn't moved.
    component['performAct'](CombatManager.currentActors.items[0], null);
    fixture.detectChanges();
    expect(panelName()).toBe('B');
  });

  // ── tabs ───────────────────────────────────────────────────────────────

  it('a character\'s panel has Condition and Stats tabs', () => {
    const razor = scored('Razor', 10, 5);
    fixture.detectChanges();
    clickName(razor);

    expect(tabLabels()).toEqual(['Condition', 'Stats']);
  });

  it('a grunt group\'s panel has no Condition tab', () => {
    const row = component.addNpcRow(false);
    row.name = 'Halloweeners';
    component.addNpcToRow(row, 'Ganger 1');
    fixture.detectChanges();
    clickName(row);

    expect(panelName()).toBe('Halloweeners');
    expect(tabLabels()).toEqual(['Stats']);
  });

  // ── the Condition tab still records damage exactly as before ───────────

  it('a character\'s Condition tab records Physical and Stun damage from box clicks', () => {
    const razor = scored('Razor', 10, 5);
    fixture.detectChanges();
    clickName(razor);
    openTab('Condition');

    const monitors = panel()!.querySelectorAll('app-condition-monitor');
    expect(monitors.length).withContext('Physical and Stun tracks').toBe(2);
    const cell = (monitor: Element, n: number) => monitor.querySelectorAll('.cmCell')[n - 1] as HTMLElement;

    cell(monitors[0], 3).click();
    cell(monitors[1], 2).click();
    fixture.detectChanges();

    expect(razor.physicalDamage).toBe(3);
    expect(razor.stunDamage).toBe(2);
  });

  it('a grunt\'s Condition tab applies and heals the DV typed into its box', async () => {
    const grunt = component.addGrunt('Lone Ganger', 3, 3);
    component.closeParticipantPanel();
    fixture.detectChanges();
    clickName(grunt);
    openTab('Condition');

    await typeInto(panel()!.querySelector('input.grunt-dv') as HTMLInputElement, '4');
    (panel()!.querySelector('.grunt-hit-physical') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(grunt.combinedDamage).toBe(4);

    (panel()!.querySelector('.grunt-heal') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(grunt.combinedDamage).toBe(0);
  });

  // ── E/R/I/D moved from the row into the Stats tab ──────────────────────

  it('Edge, Reaction, Intuition and Initiative Dice are no longer on the row', () => {
    const razor = scored('Razor', 10, 5);
    fixture.detectChanges();
    const row = rowOf(razor);

    expect(row.querySelector('[data-testid="stat-twirl"]')).toBeNull();
    expect(row.querySelector('input.gm-dice-count-input')).toBeNull();
    expect(row.querySelector('.gm-stat-input')).toBeNull();
  });

  it('the Stats tab holds Edge, Reaction, Intuition and Initiative Dice', () => {
    const razor = scored('Razor', 10, 5);
    fixture.detectChanges();
    clickName(razor);
    openTab('Stats');

    for (const id of ['panel-edge-input', 'panel-reaction-input', 'panel-intuition-input']) {
      expect(panel()!.querySelector(`[data-testid="${id}"]`)).withContext(id).toBeTruthy();
    }
    expect(panel()!.querySelector('input.gm-stats-dice-count-input')).withContext('dice').toBeTruthy();
  });

  it('typing Edge, Reaction and Intuition in the Stats tab records them as the row boxes did', async () => {
    const razor = scored('Razor', 10, 5);
    fixture.detectChanges();
    clickName(razor);
    openTab('Stats');
    const input = (id: string) => panel()!.querySelector(`[data-testid="${id}"]`) as HTMLInputElement;

    await typeInto(input('panel-edge-input'), '4');
    await typeInto(input('panel-reaction-input'), '6');
    await typeInto(input('panel-intuition-input'), '3');

    expect(component.getParticipantEdgeRatingValue(razor)).toBe(4);
    expect(component.getParticipantReactionValue(razor)).toBe(6);
    expect(component.getParticipantIntuitionValue(razor)).toBe(3);
    // Reaction + Intuition feed the Initiative attribute, exactly as before.
    expect(razor.baseIni).toBe(9);
  });
});
