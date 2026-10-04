// GM screen overhaul, ticket 07 (GitHub #10, spec #3, user story 19): the
// status tags move from a second line under the row to small tags beside the
// participant's name: each Interrupt Action taken this turn, and ASTRAL while
// astral projecting. Xavier's calls (2026-10-03 / 04): a jacked-in decker's
// VR mode and Overwatch Score join them beside the name, and leave the Deck
// tab - except the Overwatch adjuster (-5 / -1 / +1 / +5 / Reset), which
// stays in the Deck tab; the tag on the row only shows the score. There is
// no VR CATATONIC tag (Hot or Cold Sim already says so). Interrupt tags are
// abbreviated ("FULL DEF"), with the full name and cost in the hover text.
//
// Built the same way as the other GM screen tests: the whole GM screen,
// driven through its buttons. Glossary terms (CONTEXT.md): participant,
// participant panel, initiative list.

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BattleTrackerComponent } from 'app/battle-tracker/battle-tracker.component';
import { appConfig } from 'app/app.config';
import { CombatManager } from 'Combat';
import { getInterruptLabel, getInterruptTag } from 'app/shared/interrupt-actions';
import { Participant } from 'Combat/Participants/Participant';
import { MatrixParticipant } from 'Matrix';
import { AstralParticipant } from 'Magic/AstralParticipant';
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

describe('Status tags beside the name (GM screen overhaul 07, #10)', () => {
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

  function byName(name: string): Participant {
    const p = CombatManager.participants.items.find(x => x.name === name);
    expect(p).withContext('participant ' + name).toBeTruthy();
    return p as Participant;
  }

  function rowOf(name: string): HTMLElement {
    const i = CombatManager.participants.items.indexOf(byName(name));
    const row = el().querySelector('#participant' + i) as HTMLElement;
    expect(row).withContext('row for ' + name).toBeTruthy();
    return row;
  }

  /** The tags on the name's own line, as the GM reads them. */
  function tagsBesideName(name: string): string[] {
    const nameCell = rowOf(name).querySelector('.gm-col-name') as HTMLElement;
    return Array.from(nameCell.querySelectorAll('[data-testid^="status-tag"]'))
      .map(t => (t.textContent || '').replace(/\s+/g, ' ').trim());
  }

  function tag(name: string, testid: string): HTMLElement | null {
    return rowOf(name).querySelector(`.gm-col-name [data-testid="${testid}"]`);
  }

  /** Nothing hangs under the row on a second line any more. */
  function expectNoSecondLine(name: string): void {
    const row = rowOf(name);
    expect(row.querySelector('.interrupt-badges')).withContext('Interrupt line under the row').toBeNull();
    expect(row.querySelector('.astral-info-row')).withContext('Astral line under the row').toBeNull();
    expect(row.querySelector('app-astral-badge')).withContext('old Astral badge').toBeNull();
  }

  function panel(): HTMLElement | null {
    return el().querySelector('[data-testid="participant-panel"]');
  }

  function tabContent(testid: string): HTMLElement {
    const tab = panel()?.querySelector(`[data-testid="${testid}"]`) as HTMLElement | null;
    expect(tab).withContext(testid).toBeTruthy();
    return tab!;
  }

  function pressIn(container: HTMLElement, words: string): void {
    const b = Array.from(container.querySelectorAll('button'))
      .find(x => (x.textContent || '').replace(/\s+/g, ' ').trim() === words) as HTMLButtonElement | undefined;
    expect(b).withContext(words + ' button').toBeTruthy();
    b!.click();
    fixture.detectChanges();
  }

  function pressRowButton(name: string, testid: string): void {
    (rowOf(name).querySelector(`[data-testid="${testid}"]`) as HTMLButtonElement).click();
    fixture.detectChanges();
  }

  // ── Interrupt Actions ──────────────────────────────────────────────────

  it('an Interrupt Action taken from the Defend menu shows as a short tag beside the name, full name and cost on hover, and not under the row', () => {
    scored('Razor', 10, 5);
    CombatManager.started = true;
    fixture.detectChanges();
    expect(tagsBesideName('Razor')).toEqual([]);

    // Open the Defend menu and take the first one-off Interrupt Action.
    (rowOf('Razor').querySelector('#interruptDropdownButton') as HTMLButtonElement).click();
    fixture.detectChanges();
    const action = rowOf('Razor').querySelector('button.interrupt-action') as HTMLButtonElement;
    expect(action).withContext('an Interrupt Action in the Defend menu').toBeTruthy();
    const before = byName('Razor').getCurrentInitiative();
    action.click();
    fixture.detectChanges();

    const taken = byName('Razor').actionHistory;
    expect(taken.length).withContext('the action was taken, as before').toBe(1);
    expect(byName('Razor').getCurrentInitiative())
      .withContext('it still costs Initiative, as before').toBe(before + taken[0].iniMod);

    expect(tagsBesideName('Razor')).toEqual([getInterruptTag(taken[0].key)]);
    const hover = tag('Razor', 'status-tag-interrupt')!.getAttribute('title') || '';
    expect(hover).withContext('full name and cost')
      .toContain(`${getInterruptLabel(taken[0].key)} (${taken[0].iniMod})`);
    expect(hover).withContext('the description, as before').toContain(component.getActionTooltip(taken[0]));
    expectNoSecondLine('Razor');
  });

  it('several Interrupt Actions each get their own tag', () => {
    const razor = scored('Razor', 20, 6);
    CombatManager.started = true;
    const [a, b] = component.actionHandler.coreInterrupts.filter(x => !x.persist);
    component.btnAction_Click(razor, a);
    component.btnAction_Click(razor, b);
    fixture.detectChanges();

    expect(tagsBesideName('Razor')).toEqual([getInterruptTag(a.key), getInterruptTag(b.key)]);
    expectNoSecondLine('Razor');
  });

  it('a lasting Interrupt Action (one that holds for the rest of the turn) keeps its stronger look', () => {
    const razor = scored('Razor', 20, 6);
    CombatManager.started = true;
    const lasting = component.actionHandler.coreInterrupts.find(x => x.persist)!;
    component.btnAction_Click(razor, lasting);
    fixture.detectChanges();

    const t = tag('Razor', 'status-tag-interrupt')!;
    expect(t.classList).toContain('gm-status-tag-persistent');
    expect(t.textContent!.trim()).toBe('FULL DEF');
    expect(t.getAttribute('title')).toContain('Full Defense (-10)');
  });

  // ── Astral projecting ──────────────────────────────────────────────────

  it('ASTRAL shows beside the name while projecting, and goes when they return to their body', () => {
    scored('Ashwood', 8, 3);
    fixture.detectChanges();
    pressRowButton('Ashwood', 'awakened-btn');
    pressIn(tabContent('awakened-tab'), 'Enable Awakened');
    expect(tag('Ashwood', 'status-tag-astral')).withContext('not projecting yet').toBeNull();

    pressIn(tabContent('awakened-tab'), 'Astral Project');

    expect((byName('Ashwood') as AstralParticipant).astralProjecting).toBeTrue();
    expect(tagsBesideName('Ashwood')).toEqual(['ASTRAL']);
    expect(tag('Ashwood', 'status-tag-astral')!.getAttribute('title')).toBe('Astral projecting');
    expectNoSecondLine('Ashwood');

    pressIn(tabContent('awakened-tab'), 'Return to Body');

    expect(tag('Ashwood', 'status-tag-astral')).toBeNull();
  });

  // ── Matrix: VR mode, Overwatch Score, VR catatonic ─────────────────────

  it('a jacked-in decker shows VR mode and Overwatch Score beside the name; the Deck tab keeps only the Overwatch adjuster', () => {
    scored('Kestrel', 8, 3);
    fixture.detectChanges();
    pressRowButton('Kestrel', 'deck-btn');
    const deck = () => tabContent('deck-tab');
    pressIn(deck(), 'Enable Deck');
    expect(tagsBesideName('Kestrel')).withContext('not jacked in yet').toEqual([]);

    pressIn(deck(), 'Hot Sim');
    pressIn(deck(), 'Jack In');

    // No VR CATATONIC tag: HOT already says the body is out of action.
    expect(tagsBesideName('Kestrel')).toEqual(['HOT', 'OS 0']);
    expect(tag('Kestrel', 'status-tag-os')!.tagName)
      .withContext('the row only shows the score; adjusting it is in the Deck tab').not.toBe('BUTTON');

    // The Deck tab: no VR chip any more, but the OS chip still opens the
    // adjuster and +1 still raises the score.
    expect(deck().querySelector('.vr-chip')).withContext('VR chip left the Deck tab').toBeNull();
    pressIn(deck(), 'OS 0');
    pressIn(deck(), '+1');
    expect((byName('Kestrel') as MatrixParticipant).overwatch).toBe(1);
    expect(tagsBesideName('Kestrel')).toEqual(['HOT', 'OS 1']);

    pressIn(deck(), 'Cold Sim');
    pressIn(deck(), 'Switch Mode');
    expect(tagsBesideName('Kestrel')).toEqual(['COLD', 'OS 1']);

    pressIn(deck(), 'Jack Out');
    expect(tagsBesideName('Kestrel')).withContext('jacked out').toEqual([]);
  });

  it('there is no VR CATATONIC tag anywhere, even while the decker\'s body is out of action', () => {
    scored('Kestrel', 8, 3);
    fixture.detectChanges();
    pressRowButton('Kestrel', 'deck-btn');
    pressIn(tabContent('deck-tab'), 'Enable Deck');
    pressIn(tabContent('deck-tab'), 'AR');
    pressIn(tabContent('deck-tab'), 'Jack In');
    expect(tagsBesideName('Kestrel')).toEqual(['AR', 'OS 0']);

    // The player's own screen can mark the body catatonic too.
    (byName('Kestrel') as MatrixParticipant).blocksPhysicalActions = true;
    fixture.detectChanges();
    expect(tagsBesideName('Kestrel')).toEqual(['AR', 'OS 0']);
    expect(tabContent('deck-tab').querySelector('.vr-catatonic'))
      .withContext('not in the Deck tab either').toBeNull();
  });
});
