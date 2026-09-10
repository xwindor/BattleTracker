// Acceptance-criteria and scenario tests for
// briefs/matrix-port-rules-correctness-spec.md.
//
// This file is what pulls all ten Matrix components into the type-checked
// program for the first time (see the brief's appendix A) - it imports seven
// directly, plus `target-card` transitively via `HierarchyEditorComponent`
// and `matrix-graph` transitively via `MatrixRunPanelComponent`, and imports
// `matrix-run-panel` itself directly (adversarial validation round,
// 2026-09-01 defect 10: an earlier version of this header claimed "nine of
// the ten" while actually reaching only eight, leaving `matrix-run-panel` -
// the composition root binding the whole Matrix GM UI, and the only file that
// would catch a mismatched input/output binding between the components this
// pass changed - and `matrix-graph` compiled by nothing and template-checked
// by nothing). None of these are reached through `BattleTrackerComponent`,
// which does not wire any of them in.
//
// Covers: Claim 1 (AC-1 to AC-6), Claim 2 (AC-7 to AC-10), Claim 3
// (AC-11 to AC-13), Claim 4 (AC-14 to AC-19), Claim 6 (AC-20 to AC-25),
// Claim 7 (AC-26 to AC-29), preserved behaviour (AC-30 to AC-33), and
// gameplay scenarios S1, S2, S6 (marks half), S7 (condition monitor half),
// S8.
//
// Round-3 additions (Xavier's decisions, 2026-09-02): Decision 1 (marks are
// recorded, never derived) and Decision 2 (the Matrix module has no dice
// roller of its own) replace the earlier onRolled/hitCount/rollLogged tests
// with coverage of the mark-count field (renamed `marksThisAttempt` in
// round-4 — see below), the dynamic Apply label (round-3 defect D1), and
// dismissal preserving flow + that field (round-3 defect D2).
// T2 covers `OsPromptComponent.canApply`'s integer guard (round-3 defect D3).
// T3 covers `ICParticipant`'s unset-Data-Processing guard on `baseIni`
// (round-3 defect D4) and its `wm`/`ooc` overrides for a Matrix-only
// Condition Monitor (round-3 defect D5, Decision 4).
//
// Round-4 additions (Xavier's decisions 5-7, 2026-09-02, plus validator
// defects D-4 through D-14 and "missed interactions" 3-4): the one-IC-per-
// Combat-Turn rule becomes a detected `ICSpawnerComponent` warning
// (Decision 5) instead of an unconditional reminder; `AccessHostPanelComponent
// .marksPlaced` is renamed `marksThisAttempt`, starts `null`, and forces an
// explicit choice before Apply is enabled (Decision 6); marks propagate up
// the containment hierarchy — host WAN (7a) and open-grid parent/child (7b)
// — via `MatrixStateService.addMark()`; `MatrixStateService.jackOut()` now
// actually erases marks from every host/target (D-9), and
// `MatrixParticipant.marksPlaced` (the dead Map implicated in D-9) is
// deleted; `ICParticipant.hostRating`/`hostDataProcessing` setters recompute
// `baseIni`/`physicalHealth` (D-4); `MatrixGraphComponent.markDots()` caps
// its glyph count and adds an owner key (D-6); `MatrixHost.marks`' comment no
// longer cites p. 247 for the wrong direction of mark sharing (D-8).

import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { appConfig } from 'app/app.config';

import { AccessHostPanelComponent } from 'app/matrix/access-host-panel/access-host-panel.component';
import { OsPromptComponent } from 'app/matrix/os-prompt/os-prompt.component';
import { DeckerCardComponent } from 'app/matrix/decker-card/decker-card.component';
import { MatrixParticipantBadgeComponent } from 'app/matrix/matrix-participant-badge/matrix-participant-badge.component';
import { HierarchyEditorComponent } from 'app/matrix/hierarchy-editor/hierarchy-editor.component';
import { ICSpawnerComponent } from 'app/matrix/ic-spawner/ic-spawner.component';
import { MatrixPlayerViewComponent } from 'app/matrix/matrix-player-view/matrix-player-view.component';
import { MatrixRunPanelComponent } from 'app/matrix/matrix-run-panel/matrix-run-panel.component';
import { MatrixGraphComponent } from 'app/matrix/matrix-graph/matrix-graph.component';
import { TargetCardComponent, MarkHighlightRequest } from 'app/matrix/target-card/target-card.component';

import { MatrixStateService, MARK_CAP } from 'app/services/matrix-state.service';
import { OsTrackingService, osBandFor } from 'app/services/os-tracking.service';
import { SharedMatrixTarget } from 'app/services/session-sync.service';

import {
  MatrixParticipant, MatrixHost, MatrixTarget, ICParticipant, ICType, VRMode,
  IC_INITIATIVE_DICE, DATA_PROCESSING_UNSET
} from 'Matrix';

/** Fake NgbModal.open() that hands the test direct control over the result Promise. */
function stubModal(modal: NgbModal): {
  instanceRef: { current: unknown };
  resolve: (v: unknown) => void;
  reject: (r: unknown) => void;
} {
  const instanceRef: { current: unknown } = { current: undefined };
  let resolveFn!: (v: unknown) => void;
  let rejectFn!: (r: unknown) => void;
  spyOn(modal, 'open').and.callFake(() => {
    const componentInstance: Record<string, unknown> = {};
    instanceRef.current = componentInstance;
    return {
      componentInstance,
      result: new Promise((resolve, reject) => {
        resolveFn = resolve;
        rejectFn = reject;
      })
    } as unknown as ReturnType<NgbModal['open']>;
  });
  return {
    instanceRef,
    resolve: v => resolveFn(v),
    reject: r => rejectFn(r)
  };
}

/** Any node in the fixture whose text contains `needle` (case-sensitive). */
function textContains(fixture: ComponentFixture<unknown>, needle: string): boolean {
  return (fixture.nativeElement as HTMLElement).textContent?.includes(needle) ?? false;
}

/**
 * Asserts that exactly one element matching `selector` is actually rendered
 * in `fixture`'s DOM and that its visible text is non-empty once whitespace
 * is trimmed. Returns that text so a caller can also check its wording.
 *
 * This is the "the GM can see it" half of the DOM-vs-component-field
 * convention documented above the parent-picker describe block below — use
 * this (or `expectAbsent`) whenever an acceptance criterion is phrased as
 * "the GM sees X", instead of reading a component field that the template
 * might not actually be bound to.
 */
function expectVisibleText(fixture: ComponentFixture<unknown>, selector: string): string {
  const el = (fixture.nativeElement as HTMLElement).querySelector(selector);
  expect(el).withContext(`expected an element matching "${selector}" to be rendered`).not.toBeNull();
  const text = (el?.textContent ?? '').trim();
  expect(text.length).withContext(`expected "${selector}" to render non-empty text`).toBeGreaterThan(0);
  return text;
}

/** Asserts that no element matching `selector` is rendered anywhere in `fixture`. */
function expectAbsent(fixture: ComponentFixture<unknown>, selector: string): void {
  const el = (fixture.nativeElement as HTMLElement).querySelector(selector);
  expect(el).withContext(`expected no element matching "${selector}" to be rendered`).toBeNull();
}

/** Whether any loaded stylesheet defines a rule whose selector contains `fragment`. */
function cssDefinesSelector(fragment: string): boolean {
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // cross-origin sheet - not one of ours
    }
    if (!rules) continue;
    for (const rule of Array.from(rules)) {
      const selector = (rule as CSSStyleRule).selectorText;
      if (selector && selector.includes(fragment)) return true;
    }
  }
  return false;
}

/**
 * Round-8 review, Defect D-1: `:hover` pseudo-class matching cannot be
 * forced from page-level test code — a synthetic `dispatchEvent(new
 * MouseEvent('mouseover'/'mouseenter'))` never runs through the browser's
 * real hit-testing and never changes what `:hover` matches (the same reason
 * Testing-Library's own `hover()` helper documents that it does not trigger
 * CSS `:hover`). The only thing that does is real OS-level pointer input
 * (or WebDriver-style remote input), neither available from inside a Karma
 * spec.
 *
 * To measure the REAL cascade decision — the actual rule, actual
 * specificity (including whatever Angular's emulated-encapsulation
 * `[_ngcontent-*]` attribute adds to every compound selector segment,
 * equally on both sides of this comparison), actual source order — this
 * finds the loaded `:hover` rule matching `fragment` and temporarily
 * rewrites its selector text, swapping `:hover` for a toggleable class of
 * identical specificity weight (a pseudo-class and a plain class both add
 * exactly one unit to CSS specificity's "class" bucket, so this changes
 * nothing about the numbers this defect is about). The original selector
 * text is restored in `finally` so no other test in this run ever sees the
 * mutation, no matter how the callback exits.
 */
function withSimulatedHover(fragment: string, run: (hoverClass: string) => void): void {
  const HOVER_CLASS = 'sr5-test-simulated-hover';
  let targetRule: CSSStyleRule | undefined;
  let originalSelectorText = '';
  find:
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // cross-origin sheet - not one of ours
    }
    if (!rules) continue;
    for (const rule of Array.from(rules)) {
      const r = rule as CSSStyleRule;
      if (r.selectorText && r.selectorText.includes(fragment) && r.selectorText.includes(':hover')) {
        targetRule = r;
        originalSelectorText = r.selectorText;
        break find;
      }
    }
  }
  if (!targetRule) {
    throw new Error(`withSimulatedHover: no loaded stylesheet rule matches "${fragment}:hover" - has it been renamed or removed?`);
  }
  targetRule.selectorText = originalSelectorText.replace(':hover', `.${HOVER_CLASS}`);
  try {
    run(HOVER_CLASS);
  } finally {
    targetRule.selectorText = originalSelectorText;
  }
}

describe('Matrix port rules correctness (briefs/matrix-port-rules-correctness-spec.md)', () => {

  // ── Claim 1 (AC-1 to AC-6) + Claim 2 (AC-7 to AC-10) — access-host-panel ──

  describe('AccessHostPanelComponent', () => {
    let fixture: ComponentFixture<AccessHostPanelComponent>;
    let component: AccessHostPanelComponent;
    let matrixState: MatrixStateService;
    let modal: NgbModal;
    let host: MatrixHost;
    let decker: MatrixParticipant;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [AccessHostPanelComponent],
        providers: appConfig.providers
      }).compileComponents();

      fixture = TestBed.createComponent(AccessHostPanelComponent);
      component = fixture.componentInstance;
      matrixState = TestBed.inject(MatrixStateService);
      modal = TestBed.inject(NgbModal);

      host = new MatrixHost({
        id: 'h1', name: 'TestHost', rating: 4,
        attack: 5, sleaze: 4, dataProcessing: 7, firewall: 6
      });
      matrixState.addHost(host);
      matrixState.setCurrentHost(host.id);

      decker = new MatrixParticipant();
      decker.name = 'Tesseract';
      decker.overwatch = 6;
      decker.vrMode = VRMode.HotSim;

      component.activeDeckers = [decker];
      component.ngOnChanges({ activeDeckers: {} } as never);
      fixture.detectChanges();
    });

    // AC-1
    it('AC-1: exposes no computed Overwatch value (suggestedOS deleted)', () => {
      expect((component as unknown as Record<string, unknown>)['suggestedOS']).toBeUndefined();
    });

    it('AC-1: the flow template renders no "Suggested OS" figure', () => {
      component.startFlow('hack-on-fly');
      fixture.detectChanges();
      expect(textContains(fixture, 'Suggested OS')).toBeFalse();
    });

    // Decision 2 (2026-09-02): the Matrix module has no dice roller of its
    // own. Withdraws the earlier "keep the roller, sever the wire" Scope
    // Question A / A' approval — DiceRollerComponent, onRolled(), hitCount,
    // rolled and rollLogged are all gone.
    it('Decision 2: the component has no dice roller — no DiceRollerComponent import, no onRolled/hitCount/rolled/rollLogged members', () => {
      const c = component as unknown as Record<string, unknown>;
      expect(c['onRolled']).toBeUndefined();
      expect(c['hitCount']).toBeUndefined();
      expect(c['rolled']).toBeUndefined();
      expect(c['rollLogged']).toBeUndefined();
      expect(c['lastRollValues']).toBeUndefined();
    });

    it('Decision 2: the rendered flow panel contains no dice roller element', () => {
      component.startFlow('hack-on-fly');
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.css('app-dice-roller'))).toBeNull();
    });

    // Decision 1 (2026-09-02): marks are recorded, never derived —
    // marksThisAttempt is written only from the GM's own button clicks, and
    // confirmAccess() never computes it from anything.
    it('Decision 1: marksThisAttempt is set only by clicking a mark button', () => {
      component.startFlow('hack-on-fly');
      fixture.detectChanges();

      const btn3 = fixture.debugElement.queryAll(By.css('.ahp-mark-btn'))[3].nativeElement as HTMLButtonElement;
      btn3.click();
      fixture.detectChanges();
      expect(component.marksThisAttempt).toBe(3);
    });

    // Decision 6 (2026-09-02): "an empty box is not a deliberate 0" — the
    // marks row must start with nothing selected, and renamed from
    // marksPlaced (which collided with MatrixParticipant.marksPlaced, a
    // now-deleted Map on a different class — round-4 defect D-9).
    it('Decision 6: marksThisAttempt starts null on a fresh flow, not 0', () => {
      component.startFlow('hack-on-fly');
      expect(component.marksThisAttempt).toBeNull();
    });

    it('Decision 6: canApply is false while nothing is selected, and Apply is [disabled]', () => {
      component.startFlow('hack-on-fly');
      fixture.detectChanges();
      expect(component.canApply).toBeFalse();
      const applyBtn = fixture.debugElement.query(By.css('.ahp-flow-hotf .ahp-btn-apply')).nativeElement as HTMLButtonElement;
      expect(applyBtn.disabled).toBeTrue();
    });

    it('Decision 6: picking 0 deliberately makes canApply true and Apply enabled — 0 is a legitimate value', () => {
      component.startFlow('hack-on-fly');
      component.marksThisAttempt = 0;
      fixture.detectChanges();
      expect(component.canApply).toBeTrue();
      const applyBtn = fixture.debugElement.query(By.css('.ahp-flow-hotf .ahp-btn-apply')).nativeElement as HTMLButtonElement;
      expect(applyBtn.disabled).toBeFalse();
    });

    it('Decision 6: applyLabel prompts the GM to choose while nothing is selected', () => {
      component.startFlow('hack-on-fly');
      expect(component.applyLabel).toBe('Choose marks placed first');
    });

    // AC-2 / D1 fix — the Apply button names the mark count and flags the OS
    // prompt that follows.
    it("D1: the Apply label names marksThisAttempt and flags that the Overwatch prompt follows", () => {
      component.startFlow('hack-on-fly');
      component.marksThisAttempt = 2;
      expect(component.applyLabel).toContain('2 marks');
      expect(component.applyLabel).toContain('Add OS');
    });

    it('D1: marksThisAttempt === 0 reads as a legitimate "place no marks" entry, not a slip', () => {
      component.startFlow('hack-on-fly');
      component.marksThisAttempt = 0;
      expect(component.applyLabel).toContain('Place no marks');
    });

    // D-2: the Apply label must not promise a mark count the host's 3-mark
    // cap will silently absorb.
    it('D-2: applyLabel warns when the 3-mark cap will absorb part of the entry', () => {
      host.marks[decker.name] = 2; // already 2 marks on the host
      component.startFlow('hack-on-fly');
      component.marksThisAttempt = 3; // would push to 5 without the cap
      expect(component.marksThatWillLand).toBe(1); // only 1 more fits under 3
      expect(component.applyLabel).toContain('Only 1 of 3 will land');
    });

    it('D-2: applyLabel says plainly when the cap absorbs the entire entry', () => {
      host.marks[decker.name] = 3; // already at the cap
      component.startFlow('hack-on-fly');
      component.marksThisAttempt = 2;
      expect(component.marksThatWillLand).toBe(0);
      expect(component.applyLabel).toContain('Already at 3-mark cap');
    });

    it('D-2: applyLabel makes no cap warning when the full entry will land', () => {
      component.startFlow('hack-on-fly');
      component.marksThisAttempt = 2;
      expect(component.marksThatWillLand).toBe(2);
      expect(component.applyLabel).not.toContain('cap');
    });

    // Round-5 validator defect 10: currentHostMarksForSelectedDecker was
    // computed and consumed by marksThatWillLand/applyLabel but never
    // rendered on its own — the GM could only infer the count indirectly.
    it("validator defect 10: renders the selected decker's current host mark count", () => {
      host.marks[decker.name] = 2;
      component.startFlow('hack-on-fly');
      fixture.detectChanges();
      expect(textContains(fixture, '2 / 3')).toBeTrue();
    });

    it('validator defect 10: the rendered count updates as marksThisAttempt would land', () => {
      host.marks[decker.name] = 0;
      component.startFlow('hack-on-fly');
      fixture.detectChanges();
      expect(textContains(fixture, '0 / 3')).toBeTrue();
    });

    // AC-4 / D2 fix — dismissing the OS prompt changes nothing, and must
    // leave the GM back at the panel with their flow and marksThisAttempt
    // intact rather than discarding the entry (round-3 defect D2).
    it('AC-4/D2: dismissing the OS prompt changes nothing (marks, OS, access method), and preserves flow + marksThisAttempt', async () => {
      const stub = stubModal(modal);
      component.startFlow('brute-force');
      component.marksThisAttempt = 2;

      const before = { overwatch: decker.overwatch, marks: { ...host.marks }, method: host.accessMethod };
      const p = component.confirmAccess();
      stub.reject('cancel');
      await p;

      expect(decker.overwatch).toBe(before.overwatch);
      expect(host.marks).toEqual(before.marks);
      expect(host.accessMethod).toBe(before.method);

      // D2: Cancel must not discard the GM's entry or close the panel.
      expect(component.flow).toBe('brute-force');
      expect(component.marksThisAttempt).toBe(2);
    });

    it('confirmAccess() only clears the flow on the success path, not on dismissal', async () => {
      const stub = stubModal(modal);
      component.startFlow('hack-on-fly');
      component.marksThisAttempt = 1; // Decision 6: canApply requires a deliberate choice
      const p = component.confirmAccess();
      stub.resolve(4);
      await p;
      expect(component.flow).toBe('none'); // success path clears it
    });

    // AC-5 / AC-6
    it('AC-5/AC-6: Hack on the Fly tooltip and flow hint name Hacking + Logic [Sleaze] v. Intuition + Firewall, never Cracking, never an OS cost', () => {
      const btn = fixture.debugElement.query(By.css('.ahp-btn-hotf')).nativeElement as HTMLElement;
      const tooltip = btn.getAttribute('ngbTooltip') ?? '';
      expect(tooltip).toContain('Hacking + Logic [Sleaze]');
      expect(tooltip).toContain('Intuition + Firewall');
      expect(tooltip).not.toContain('Cracking');
      expect(tooltip).not.toMatch(/OS/);

      component.startFlow('hack-on-fly');
      fixture.detectChanges();
      const hint = fixture.debugElement.query(By.css('.ahp-flow-hint')).nativeElement as HTMLElement;
      expect(hint.textContent).toContain('Hacking + Logic [Sleaze]');
      expect(hint.textContent).toContain('Intuition + Firewall');
      expect(hint.textContent).not.toContain('Cracking');
    });

    it('AC-5/AC-6: Brute Force tooltip and flow hint name Cybercombat + Logic [Attack] v. Willpower + Firewall, never Cracking, never an OS cost', () => {
      const btn = fixture.debugElement.query(By.css('.ahp-btn-bf')).nativeElement as HTMLElement;
      const tooltip = btn.getAttribute('ngbTooltip') ?? '';
      expect(tooltip).toContain('Cybercombat + Logic [Attack]');
      expect(tooltip).toContain('Willpower + Firewall');
      expect(tooltip).not.toContain('Cracking');
      expect(tooltip).not.toMatch(/OS/);

      component.startFlow('brute-force');
      fixture.detectChanges();
      const hint = fixture.debugElement.query(By.css('.ahp-flow-hint')).nativeElement as HTMLElement;
      expect(hint.textContent).toContain('Cybercombat + Logic [Attack]');
      expect(hint.textContent).toContain('Willpower + Firewall');
      expect(hint.textContent).not.toContain('Cracking');
    });

    // AC-7
    it('AC-7: applyDirectConnection() sets the access method and places zero marks', () => {
      component.directDeckerId = decker.name;
      component.applyDirectConnection();
      expect(host.accessMethod).toBe('direct-connection');
      expect(Object.keys(host.marks).length).toBe(0);
    });

    // AC-8 / AC-9 / AC-10 (static copy). Round-4: the "GM places both marks
    // by hand" line is gone — Decision 7a made host WAN propagation
    // automatic (RULINGS.md 2026-08-29 restored 2026-09-02), so AC-9's own
    // text was updated to match (briefs/matrix-port-rules-correctness-spec.md
    // AC-9 reconciliation note, round-4).
    it('AC-8/AC-9/AC-10: the direct-connection panel states no marks, ignores noise/grid modifiers, notes the slaved-device defense loss and the (now-automatic) WAN-master propagation, and keeps the 0 OS label', () => {
      component.toggleDirectPanel();
      fixture.detectChanges();
      const hint = fixture.debugElement.query(By.css('.ahp-flow-dc .ahp-flow-hint')).nativeElement as HTMLElement;
      const text = hint.textContent ?? '';
      expect(text).toContain('no marks placed automatically');
      expect(text).toContain('ignores all noise');
      expect(text).toContain('grid');
      expect(text).toContain("master's ratings");
      expect(text).toContain('also marks the host');
      expect(text).toContain('placed automatically');
      expect(text).not.toContain('GM places both marks by hand');
      expect(text).toMatch(/0 OS/);

      const applyBtn = fixture.debugElement.query(By.css('.ahp-flow-dc .ahp-btn-apply')).nativeElement as HTMLElement;
      expect(applyBtn.textContent).toContain('0 Marks');
      expect(applyBtn.textContent).toContain('0 OS');
    });

    // S1 — the ordinary case
    it('S1: a clean Hack on the Fly onto a host — no OS figure offered, GM-typed marks and OS delta', async () => {
      const stub = stubModal(modal);
      component.startFlow('hack-on-fly');

      // The GM resolved this at the table (physical dice or the battle
      // tracker's own roller elsewhere) and is now recording the outcome —
      // one mark for Tesseract.
      component.marksThisAttempt = 1;

      const p = component.confirmAccess();
      stub.resolve(3); // defender's hits, not marksThisAttempt x anything
      await p;

      expect(decker.overwatch).toBe(9); // 6 + 3
      expect(host.marks[decker.name]).toBe(1);
      expect(host.accessMethod).toBe('hack-on-fly');
    });
  });

  // ── Claim 1 (AC-2, AC-3) — os-prompt ───────────────────────────────────

  describe('OsPromptComponent', () => {
    let fixture: ComponentFixture<OsPromptComponent>;
    let component: OsPromptComponent;
    let activeModal: jasmine.SpyObj<NgbActiveModal>;

    beforeEach(async () => {
      activeModal = jasmine.createSpyObj<NgbActiveModal>('NgbActiveModal', ['close', 'dismiss']);
      await TestBed.configureTestingModule({
        imports: [OsPromptComponent],
        providers: [...appConfig.providers, { provide: NgbActiveModal, useValue: activeModal }]
      }).compileComponents();

      fixture = TestBed.createComponent(OsPromptComponent);
      component = fixture.componentInstance;
      component.deckerName = 'Tesseract';
      fixture.detectChanges();
    });

    it('AC-2: mode, suggestedDelta, accept() and startModify() are gone; customDelta starts empty', () => {
      const c = component as unknown as Record<string, unknown>;
      expect(c['mode']).toBeUndefined();
      expect(c['suggestedDelta']).toBeUndefined();
      expect(c['accept']).toBeUndefined();
      expect(c['startModify']).toBeUndefined();
      expect(component.customDelta).toBeNull();
    });

    it('AC-2: applyCustom() closes the modal with exactly the number the GM entered', () => {
      component.customDelta = 3;
      component.applyCustom();
      expect(activeModal.close).toHaveBeenCalledWith(3);
    });

    it('AC-2: cancelling dismisses without closing', () => {
      component.cancel();
      expect(activeModal.dismiss).toHaveBeenCalled();
      expect(activeModal.close).not.toHaveBeenCalled();
    });

    // Defect 3: an empty box must not silently commit +0.
    it('defect 3: applyCustom() does nothing while the box is empty — no false OS record is written', () => {
      expect(component.customDelta).toBeNull();
      component.applyCustom();
      expect(activeModal.close).not.toHaveBeenCalled();
    });

    it('defect 3: the Apply button is disabled while the box is empty', () => {
      fixture.detectChanges();
      const btn = fixture.debugElement.query(By.css('.modal-footer .btn-danger')).nativeElement as HTMLButtonElement;
      expect(btn.disabled).toBeTrue();
    });

    it('defect 3: a deliberate 0 is valid — Apply is enabled and commits exactly 0', () => {
      component.customDelta = 0;
      fixture.detectChanges();
      const btn = fixture.debugElement.query(By.css('.modal-footer .btn-danger')).nativeElement as HTMLButtonElement;
      expect(btn.disabled).toBeFalse();
      component.applyCustom();
      expect(activeModal.close).toHaveBeenCalledWith(0);
    });

    it('defect 3: a negative value disables Apply and commits nothing', () => {
      component.customDelta = -3;
      fixture.detectChanges();
      const btn = fixture.debugElement.query(By.css('.modal-footer .btn-danger')).nativeElement as HTMLButtonElement;
      expect(btn.disabled).toBeTrue();
      component.applyCustom();
      expect(activeModal.close).not.toHaveBeenCalled();
    });

    it('defect 3: the Apply button label echoes the value that will be committed', () => {
      component.customDelta = 3;
      fixture.detectChanges();
      const btn = fixture.debugElement.query(By.css('.modal-footer .btn-danger')).nativeElement as HTMLButtonElement;
      expect(btn.textContent).toContain('Apply (+3)');
    });

    it('AC-3: the helper text states OS rises by the defender\'s hits, win or lose, with no "suggested" figure', () => {
      const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(text).toContain('hits the defender rolled');
      expect(text).not.toContain('Suggested OS');
    });

    // T2 / round-3 defect D3: canApply must reject non-integers and unsafe
    // magnitudes, not just negatives.
    it('D3: a fractional entry (e.g. 3.5) disables Apply and commits nothing', () => {
      component.customDelta = 3.5;
      fixture.detectChanges();
      const btn = fixture.debugElement.query(By.css('.modal-footer .btn-danger')).nativeElement as HTMLButtonElement;
      expect(component.canApply).toBeFalse();
      expect(btn.disabled).toBeTrue();
      component.applyCustom();
      expect(activeModal.close).not.toHaveBeenCalled();
    });

    it('D3: an unsafe magnitude (e.g. 1e21) disables Apply', () => {
      component.customDelta = 1e21;
      fixture.detectChanges();
      const btn = fixture.debugElement.query(By.css('.modal-footer .btn-danger')).nativeElement as HTMLButtonElement;
      expect(component.canApply).toBeFalse();
      expect(btn.disabled).toBeTrue();
    });

    it('D3: an ordinary whole number of hits stays valid', () => {
      component.customDelta = 5;
      expect(component.canApply).toBeTrue();
    });

    it('D3: the template shows why Apply is disabled once the GM has typed a fraction', () => {
      component.customDelta = 3.5;
      fixture.detectChanges();
      expect(textContains(fixture, 'whole number')).toBeTrue();
    });

    it('D3: no error text shows while the box is still empty (not yet typed)', () => {
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.css('.os-input-error'))).toBeNull();
    });
  });

  // ── Claim 3 (AC-11 to AC-13) — decker-card + matrix-participant-badge ──

  describe('Overwatch banding (AC-11 to AC-13)', () => {
    let fixture: ComponentFixture<DeckerCardComponent>;
    let component: DeckerCardComponent;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [DeckerCardComponent],
        providers: appConfig.providers
      }).compileComponents();

      fixture = TestBed.createComponent(DeckerCardComponent);
      component = fixture.componentInstance;
    });

    function decker(os: number): MatrixParticipant {
      const mp = new MatrixParticipant();
      mp.name = 'Decker';
      mp.jackedIn = true;
      mp.vrMode = VRMode.HotSim;
      mp.overwatch = os;
      return mp;
    }

    // AC-11 / AC-12 / S8
    for (const os of [0, 14, 15, 19, 20, 29, 30, 39, 40]) {
      it(`AC-11/AC-12: osTierClass at OS ${os} equals 'os-' + osBandFor(${os}), and no node reads IC ALERT`, () => {
        component.decker = decker(os);
        fixture.detectChanges();
        expect(component.osTierClass).toBe('os-' + osBandFor(os));
        expect(textContains(fixture, 'IC ALERT')).toBeFalse();
      });
    }

    it('AC-12: no code path returns or renders an os-alert tier anywhere in this component', () => {
      component.decker = decker(20);
      fixture.detectChanges();
      expect(component.osTierClass).not.toBe('os-alert');
      expect(textContains(fixture, 'os-alert')).toBeFalse();
    });

    it('AC-13: decker-card.component.css defines all four osBandFor() bands', () => {
      component.decker = decker(0);
      fixture.detectChanges();
      for (const band of ['low', 'building', 'high', 'convergence']) {
        expect(cssDefinesSelector(`.os-${band}`)).withContext(band).toBeTrue();
      }
    });

    // Defect 9: .decker-conv-badge was orphaned CSS — its only consumer was
    // the hostConverged block removed earlier in this pass.
    it('defect 9: decker-card.component.css defines no orphaned .decker-conv-badge rule', () => {
      component.decker = decker(40);
      fixture.detectChanges();
      expect(cssDefinesSelector('.decker-conv-badge')).toBeFalse();
    });
  });

  describe('MatrixParticipantBadgeComponent (AC-13 — the one live component)', () => {
    let fixture: ComponentFixture<MatrixParticipantBadgeComponent>;
    let component: MatrixParticipantBadgeComponent;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [MatrixParticipantBadgeComponent],
        providers: appConfig.providers
      }).compileComponents();

      fixture = TestBed.createComponent(MatrixParticipantBadgeComponent);
      component = fixture.componentInstance;
      const mp = new MatrixParticipant();
      mp.name = 'Decker';
      mp.overwatch = 0;
      component.participant = mp;
      fixture.detectChanges();
    });

    it('AC-13: matrix-participant-badge.component.css now defines .os-low, .os-building and .os-high (previously missing entirely)', () => {
      for (const band of ['low', 'building', 'high', 'convergence']) {
        expect(cssDefinesSelector(`.os-${band}`)).withContext(band).toBeTrue();
      }
    });

    it('AC-13: osTier tracks osBandFor() at the badge\'s live cut points', () => {
      for (const [os, band] of [[0, 'low'], [15, 'building'], [30, 'high'], [40, 'convergence']] as const) {
        component.participant.overwatch = os;
        expect(component.osTier).toBe(band);
      }
    });
  });

  // ── Claim 4 (AC-14 to AC-19) — hierarchy-editor + domain classes ───────

  describe('Matrix Condition Monitors (AC-14 to AC-19)', () => {
    let fixture: ComponentFixture<HierarchyEditorComponent>;
    let component: HierarchyEditorComponent;
    let matrixState: MatrixStateService;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [HierarchyEditorComponent],
        providers: appConfig.providers
      }).compileComponents();

      fixture = TestBed.createComponent(HierarchyEditorComponent);
      component = fixture.componentInstance;
      matrixState = TestBed.inject(MatrixStateService);
      component.activeDeckers = [];
      fixture.detectChanges();
    });

    function saveNewHost(rating: number): MatrixHost {
      component.openAddHost();
      component.hostForm.name = 'Host';
      component.hostForm.rating = rating;
      component.saveHostForm();
      return matrixState.state.hosts[matrixState.state.hosts.length - 1];
    }

    function saveNewTarget(host: MatrixHost | null, type: 'device' | 'file' | 'persona' | 'ic', deviceRating: number): MatrixTarget {
      component.openAddTarget(host, type);
      component.targetForm.name = 'Target';
      component.targetForm.deviceRating = deviceRating;
      component.saveTargetForm();
      const list = host ? host.targets : matrixState.state.publicTargets;
      return list[list.length - 1];
    }

    // AC-14
    it('AC-14: saveHostForm() writes no matrixHealth for a new host', () => {
      const host = saveNewHost(4);
      expect(host.matrixHealth).toBe(0);
    });

    it('AC-14: saveHostForm() does not compute matrixHealth when editing an existing host', () => {
      const host = saveNewHost(4);
      host.matrixHealth = 99; // simulate a legacy stored value
      component.openEditHost(host);
      component.hostForm.rating = 6;
      component.saveHostForm();
      expect(host.matrixHealth).toBe(99); // untouched, not recomputed
    });

    // AC-15
    it('AC-15: a "file" target carries no Matrix Condition Monitor', () => {
      const host = saveNewHost(4);
      const file = saveNewTarget(host, 'file', 4);
      expect(file.matrixHealth).toBe(0);
    });

    // AC-16 — spot checks from the book's own example
    it('AC-16: a "device" target at Device Rating 2 is 9 boxes (the book\'s bricked-smartgun example)', () => {
      const dev = saveNewTarget(null, 'device', 2);
      expect(dev.matrixHealth).toBe(9);
    });

    it('AC-16: Device Rating 3 is 10 boxes', () => {
      const dev = saveNewTarget(null, 'device', 3);
      expect(dev.matrixHealth).toBe(10);
    });

    it('AC-16: Device Rating 6 is 11 boxes', () => {
      const dev = saveNewTarget(null, 'device', 6);
      expect(dev.matrixHealth).toBe(11);
    });

    // AC-17
    it('AC-17: a "persona" target is derived from the Device Rating of the device it runs on, never the hard-coded 8 + ceil(1/2)', () => {
      const persona = saveNewTarget(null, 'persona', 6);
      expect(persona.matrixHealth).toBe(11); // matrixConditionMonitor(6), not the old flat 9
    });

    // AC-18
    it('AC-18: an "ic" target is derived from its host\'s rating, never the hard-coded 8 + ceil(1/2)', () => {
      const host = saveNewHost(4);
      const ic = saveNewTarget(host, 'ic', 1);
      // Literal, not matrixConditionMonitor(4) — a broken helper must not be
      // able to pass its own test (round-4 "circular IC test coverage").
      expect(ic.matrixHealth).toBe(10); // 8 + ceil(4/2), not the old flat 9
    });

    // AC-19 — negative structural assertion (no migration)
    it('AC-19: a host loaded with a stored matrixHealth keeps that value untouched; nothing recomputes or clears it', () => {
      const legacyHost = new MatrixHost({ id: 'legacy', name: 'Legacy', rating: 4, matrixHealth: 77 });
      matrixState.addHost(legacyHost);
      expect(legacyHost.matrixHealth).toBe(77);
      // Editing unrelated fields must not touch it.
      matrixState.updateHost(legacyHost, { name: 'Legacy Renamed' });
      expect(legacyHost.matrixHealth).toBe(77);
    });

    it('AC-19: a MatrixTarget loaded with a stored matrixHealth keeps that value; the constructor no longer invents 8', () => {
      const legacyFile = new MatrixTarget({ id: 't1', type: 'file', matrixHealth: 55 });
      expect(legacyFile.matrixHealth).toBe(55);
      const freshFile = new MatrixTarget({ id: 't2', type: 'file' });
      expect(freshFile.matrixHealth).toBe(0); // no guessed default of 8
    });
  });

  // ── Decision 7b — open-grid parent/child UI (HierarchyEditorComponent) ──

  describe('HierarchyEditorComponent open-grid parent/child (Decision 7b, 2026-09-02)', () => {
    let fixture: ComponentFixture<HierarchyEditorComponent>;
    let component: HierarchyEditorComponent;
    let matrixState: MatrixStateService;
    let weapon: MatrixTarget;
    let device: MatrixTarget;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [HierarchyEditorComponent],
        providers: appConfig.providers
      }).compileComponents();

      fixture = TestBed.createComponent(HierarchyEditorComponent);
      component = fixture.componentInstance;
      matrixState = TestBed.inject(MatrixStateService);
      component.activeDeckers = [];

      device = new MatrixTarget({ id: 'dev1', name: 'Rigger Drone', type: 'device', context: 'public' });
      weapon = new MatrixTarget({ id: 'wpn1', name: 'Weapon Mount', type: 'device', context: 'public' });
      matrixState.addTarget(null, device);
      matrixState.addTarget(null, weapon);
      fixture.detectChanges();
    });

    it('childrenOf(null) returns unparented top-level public targets', () => {
      expect(component.childrenOf(null).map(t => t.id)).toEqual(['dev1', 'wpn1']);
    });

    it('setParent() parents a target and childrenOf() reflects the nesting', () => {
      component.setParent(weapon, device.id);
      expect(weapon.parentTargetId).toBe(device.id);
      expect(component.childrenOf(null).map(t => t.id)).toEqual(['dev1']);
      expect(component.childrenOf(device.id).map(t => t.id)).toEqual(['wpn1']);
    });

    it('clearParent() removes the parent link and the target returns to top-level', () => {
      component.setParent(weapon, device.id);
      component.clearParent(weapon);
      expect(weapon.parentTargetId).toBeUndefined();
      expect(component.childrenOf(null).map(t => t.id).sort()).toEqual(['dev1', 'wpn1']);
    });

    it('setParent() with an empty string clears the parent (the "— None —" option)', () => {
      component.setParent(weapon, device.id);
      component.setParent(weapon, '');
      expect(weapon.parentTargetId).toBeUndefined();
    });

    it('parentOptionsFor() excludes the target itself', () => {
      const options = component.parentOptionsFor(device).map(t => t.id);
      expect(options).not.toContain(device.id);
      expect(options).toContain(weapon.id);
    });

    it('parentOptionsFor() excludes a target\'s own descendants, preventing a cycle from this form', () => {
      component.setParent(weapon, device.id); // weapon is now a child of device
      const options = component.parentOptionsFor(device).map(t => t.id);
      expect(options).not.toContain(weapon.id); // device may not be re-parented under its own child
    });

    it('setParent() silently refuses to parent a target under its own descendant (defence in depth alongside parentOptionsFor)', () => {
      component.setParent(weapon, device.id); // weapon is a child of device
      component.setParent(device, weapon.id); // attempt to parent device under weapon — a cycle
      expect(device.parentTargetId).toBeUndefined();
    });

    // Decision 8 (2026-09-03): a mark only ever propagates onto a device or
    // a host — never a file, persona, IC, or nested host — so those types
    // must not be offered as parent choices, and a non-device target must
    // not offer the parent control at all.
    it('Decision 8: parentOptionsFor() excludes non-device targets', () => {
      const file = new MatrixTarget({ id: 'file1', name: 'Paydata', type: 'file', context: 'public' });
      matrixState.addTarget(null, file);
      fixture.detectChanges();

      const options = component.parentOptionsFor(weapon).map(t => t.id);

      expect(options).toContain(device.id); // a device stays offered
      expect(options).not.toContain(file.id); // a file is not
    });

    it('Decision 8: canHaveParent() is true only for a device target', () => {
      const file = new MatrixTarget({ id: 'file1', name: 'Paydata', type: 'file', context: 'public' });
      const persona = new MatrixTarget({ id: 'p1', name: 'NPC', type: 'persona', context: 'public' });

      expect(component.canHaveParent(device)).toBeTrue();
      expect(component.canHaveParent(file)).toBeFalse();
      expect(component.canHaveParent(persona)).toBeFalse();
    });

    // parent-picker-into-edit-view-spec.md, Open Decision 3 / "Affected
    // paths" item 4: canHaveParent() used to check only `type`, never
    // `context`, which was harmless only because it was called exclusively
    // from the public-space tree template. The shared target Edit/Add form
    // is reachable for host-nested targets too, so a `context: "host"`
    // device must be pinned down as `false` here.
    it('canHaveParent() is false for a device whose context is "host", even though its type is "device"', () => {
      const hostDevice = new MatrixTarget({ id: 'hd1', name: 'Camera', type: 'device', context: 'host' });
      expect(component.canHaveParent(hostDevice)).toBeFalse();
    });

    // The tree no longer renders a live Parent control at all
    // (briefs/parent-picker-into-edit-view-spec.md) — it moved into the
    // shared target Edit/Add form. Rewritten from the old DOM-level tree
    // assertion (which counted `.hier-parent-row` elements directly in the
    // tree and would now pass vacuously, finding zero regardless of type).
    it('Decision 8 + parent-picker-into-edit-view: the rendered public-space tree shows no Parent control anywhere, and Edit shows one only for a device, not a file', () => {
      const file = new MatrixTarget({ id: 'file1', name: 'Paydata', type: 'file', context: 'public' });
      matrixState.addTarget(null, file);
      fixture.detectChanges();

      // No Parent control anywhere in the rendered tree, regardless of type.
      expect(fixture.debugElement.queryAll(By.css('.hier-parent-row')).length).toBe(0);

      // Opening Edit on the file shows no Parent field.
      component.openEditTarget(null, file);
      fixture.detectChanges();
      expect(fixture.debugElement.queryAll(By.css('.hier-parent-row')).length).toBe(0);
      component.closeTargetForm();
      fixture.detectChanges();

      // Opening Edit on the device shows exactly one Parent field.
      component.openEditTarget(null, device);
      fixture.detectChanges();
      expect(fixture.debugElement.queryAll(By.css('.hier-parent-row')).length).toBe(1);
    });

    // Defect 4 (round-5): deleting an open-grid parent must not orphan its
    // children — re-home them to top level and tell the GM it happened.
    describe('deleteTarget() re-homes orphaned children (defect 4)', () => {
      beforeEach(() => {
        component.setParent(weapon, device.id); // weapon is now a child of device
      });

      it('confirms with the GM, naming the affected children, before deleting a parent with children', () => {
        spyOn(window, 'confirm').and.returnValue(true);

        component.deleteTarget(null, device);

        expect(window.confirm).toHaveBeenCalled();
        const message = (window.confirm as jasmine.Spy).calls.mostRecent().args[0] as string;
        expect(message).toContain('Weapon Mount');
      });

      it('re-homes the child to top level rather than deleting it, when the GM confirms', () => {
        spyOn(window, 'confirm').and.returnValue(true);

        component.deleteTarget(null, device);

        expect(matrixState.state.publicTargets).toContain(weapon);
        expect(weapon.parentTargetId).toBeUndefined();
        expect(component.childrenOf(null).map(t => t.id)).toEqual(['wpn1']);
      });

      it('does nothing at all if the GM cancels the confirmation', () => {
        spyOn(window, 'confirm').and.returnValue(false);

        component.deleteTarget(null, device);

        expect(matrixState.state.publicTargets).toContain(device);
        expect(weapon.parentTargetId).toBe(device.id);
      });

      it('deletes a childless target with no confirmation prompt at all', () => {
        spyOn(window, 'confirm');

        component.deleteTarget(null, weapon);

        expect(window.confirm).not.toHaveBeenCalled();
        expect(matrixState.state.publicTargets).not.toContain(weapon);
      });
    });

    // ── briefs/parent-picker-into-edit-view-spec.md — the Parent field, ──
    // ── moved into the shared target Edit/Add form (Save-buffered) ──────
    //
    // CONVENTION (earned, not decorative — read before adding a test here or
    // anywhere else in this file):
    //
    //   Any acceptance criterion phrased as "the GM sees X" must be asserted
    //   through rendered DOM (`fixture.nativeElement`/`fixture.debugElement`
    //   — see `expectVisibleText()`/`expectAbsent()` above, and `pickParent()`
    //   below) — never by reading a component field. A component-field
    //   assertion only proves the *data* is right; it says nothing about
    //   whether the template actually renders it, and a broken `@if`/binding
    //   can ship invisibly under field-only coverage. Component-field
    //   assertions remain fine for *internal invariants* — e.g. "the guard
    //   evaluates against live state, not stale options" — that have no
    //   single on-screen representation of their own.
    //
    //   This is not a hypothetical risk: the identical gap has shipped
    //   through three separate rounds of this codebase before being named
    //   as a defect class rather than three unrelated misses:
    //     1. The Parent dropdown itself, this brief's own first round — every
    //        AC-2/AC-3/AC-5/AC-6/etc. test below drove `setParent()`/
    //        `targetForm` directly until "Defect 2" (below) added the
    //        DOM-driven describe block that actually clicks the rendered
    //        `<select>`.
    //     2. The very next round of this same brief — the AC-8 rejection
    //        message added a real `.hier-form-error` binding
    //        (`hierarchy-editor.component.html`), but every AC-8 test still
    //        asserted `targetForm.parentError` only; nothing here ever
    //        queried `.hier-form-error` until the tests added below.
    //     3. Earlier Matrix work: a highlight class asserted only via a
    //        component's own tracked state rather than the class actually
    //        landing on an element, a blocked-reason message checked only as
    //        `card.addMarkBlockedReason` and not on screen, and a "zero armed
    //        pickers" assertion (round-7 review, "N-1", this file) that
    //        originally queried only `.tc-confirm-btn` — an element its own
    //        fixture never rendered for the host's `+Mark` control — so the
    //        assertion passed by finding nothing, regardless of whether the
    //        real hazard was fixed.
    describe('Parent field moved into the target Edit/Add form (Save-buffered, Option A)', () => {

      it('AC-2: opening Edit on a device shows a Parent field whose value matches the target\'s current parentTargetId', () => {
        component.setParent(weapon, device.id);
        component.openEditTarget(null, weapon);
        expect(component.targetForm.parentTargetId).toBe(device.id);
      });

      it('AC-2: opening Edit on an unparented device shows the field as unset ("— None —")', () => {
        component.openEditTarget(null, weapon);
        expect(component.targetForm.parentTargetId).toBe('');
      });

      it('Scenario 1 (Ordinary): setting Parent on the form and clicking Save updates parentTargetId and re-nests the tree', () => {
        component.openEditTarget(null, weapon);
        component.targetForm.parentTargetId = device.id;
        component.saveTargetForm();

        expect(weapon.parentTargetId).toBe(device.id);
        expect(component.childrenOf(device.id).map(t => t.id)).toEqual(['wpn1']);
        expect(component.childrenOf(null).map(t => t.id)).toEqual(['dev1']);
      });

      it('Scenario 3 (Undo — Cancel discards the change): changing Parent then Cancel leaves parentTargetId unchanged', () => {
        component.openEditTarget(null, weapon);
        component.targetForm.parentTargetId = device.id;
        component.closeTargetForm();

        expect(weapon.parentTargetId).toBeUndefined();

        // Reopening Edit shows "— None —" again, not the discarded value.
        component.openEditTarget(null, weapon);
        expect(component.targetForm.parentTargetId).toBe('');
      });

      it('AC-3: changing Parent and clicking Cancel leaves the target\'s parentTargetId unchanged even when a parent was already set', () => {
        component.setParent(weapon, device.id);
        const other = new MatrixTarget({ id: 'other1', name: 'Other Device', type: 'device', context: 'public' });
        matrixState.addTarget(null, other);

        component.openEditTarget(null, weapon);
        component.targetForm.parentTargetId = other.id;
        component.closeTargetForm();

        expect(weapon.parentTargetId).toBe(device.id);
      });

      it('AC-5: opening Edit on a persona shows no Parent field (canHaveParent gate)', () => {
        const persona = new MatrixTarget({ id: 'p1', name: 'NPC', type: 'persona', context: 'public' });
        matrixState.addTarget(null, persona);
        component.openEditTarget(null, persona);
        expect(component.canHaveParent(persona)).toBeFalse();
      });

      it('AC-6: opening Edit on a device whose context is "host" shows no Parent field, even though its type is "device"', () => {
        const host = new MatrixHost({ id: 'h1', name: 'Ares-7', rating: 4 });
        matrixState.addHost(host);
        const hostDevice = new MatrixTarget({ id: 'hd1', name: 'Camera', type: 'device', context: 'host', linkedHostId: host.id });
        host.targets.push(hostDevice);

        component.openEditTarget(host, hostDevice);
        fixture.detectChanges();

        expect(component.canHaveParent(hostDevice)).toBeFalse();
        expect(fixture.debugElement.queryAll(By.css('.hier-parent-row')).length).toBe(0);
      });

      it('Scenario 2: switching Type from device to file mid-edit clears parentTargetId on Save, rather than silently keeping it', () => {
        component.setParent(weapon, device.id);
        component.openEditTarget(null, weapon);
        expect(component.targetForm.parentTargetId).toBe(device.id);

        component.targetForm.type = 'file'; // Type changed in the same session
        component.saveTargetForm();

        expect(weapon.type).toBe('file');
        expect(weapon.parentTargetId).toBeUndefined();
      });

      // Reviewer-requested coverage: Scenario 2's reverse. Changing Type
      // INTO 'device' mid-session must make the Parent field available and
      // let the GM actually use it in the same Save, not just handle the
      // outgoing direction.
      it('Scenario 2 (reverse): switching Type from file to device mid-edit reveals the Parent field and lets the GM set one in the same Save', () => {
        const loose = new MatrixTarget({ id: 'loose1', name: 'Loose File', type: 'file', context: 'public' });
        matrixState.addTarget(null, loose);

        component.openEditTarget(null, loose);
        fixture.detectChanges();
        expect(component.canHaveParent(component.targetForm.target!)).toBeFalse();
        expect(fixture.debugElement.queryAll(By.css('.hier-parent-row')).length).toBe(0);

        component.targetForm.type = 'device'; // Type changed in the same session
        fixture.detectChanges();
        expect(fixture.debugElement.queryAll(By.css('.hier-parent-row')).length).toBe(1);

        component.targetForm.parentTargetId = device.id;
        component.saveTargetForm();

        expect(loose.type).toBe('device');
        expect(loose.parentTargetId).toBe(device.id);
        expect(component.childrenOf(device.id).map(t => t.id)).toContain(loose.id);
      });

      // AC-8, revised 2026-09-09 (Xavier: "a rejected re-parent must say
      // so"). Supersedes the old silent-drop version of this test: a cycle
      // attempt now blocks the WHOLE save (nothing commits, not even the
      // target's other fields) and leaves a visible message in the form,
      // rather than silently dropping only the parent half while writing
      // everything else.
      it('AC-8: a Save that would create a cycle is blocked entirely, shows an inline message, and leaves the form open', () => {
        const a = new MatrixTarget({ id: 'a1', name: 'A', type: 'device', context: 'public' });
        const b = new MatrixTarget({ id: 'b1', name: 'B', type: 'device', context: 'public' });
        const c = new MatrixTarget({ id: 'c1', name: 'C', type: 'device', context: 'public' });
        matrixState.addTarget(null, a);
        matrixState.addTarget(null, b);
        matrixState.addTarget(null, c);
        component.setParent(c, a.id); // C is a child of A

        // Attempt: parent A under C — a cycle, since C is currently A's
        // descendant. Also rename A in the same session, to prove the whole
        // save is blocked, not just the parent half.
        component.openEditTarget(null, a);
        component.targetForm.name = 'Renamed A';
        component.targetForm.parentTargetId = c.id;
        component.saveTargetForm();

        expect(a.parentTargetId).toBeUndefined();
        expect(a.name).toBe('A'); // the name change did not commit either — nothing did
        expect(component.targetForm.active).toBeTrue(); // the form stays open
        expect(component.targetForm.isEditing).toBeTrue();
        expect(component.targetForm.target).toBe(a);
        expect(component.targetForm.parentError).toBe("Can't parent this under one of its own children.");

        // Picking a different parent clears the stale message (the GM's
        // "different choice" path — the ✕/select route through
        // onParentSelectionChange(), which clears it).
        component.onParentSelectionChange('');
        expect(component.targetForm.parentError).toBeNull();

        // Re-parent C under B instead — succeeds, C is no longer under A.
        component.openEditTarget(null, c);
        component.targetForm.parentTargetId = b.id;
        component.saveTargetForm();
        expect(c.parentTargetId).toBe(b.id);

        // Now A -> C is no longer a cycle (evaluated against LIVE state at
        // this second Save, not the option list computed when this form was
        // first opened) — it must now succeed. Reopening the form also
        // clears any stale message from before, on its own.
        component.openEditTarget(null, a);
        expect(component.targetForm.parentError).toBeNull();
        component.targetForm.parentTargetId = c.id;
        component.saveTargetForm();
        expect(a.parentTargetId).toBe(c.id);
      });

      it('AC-9: creating a new device via the Add form with no Parent selected leaves parentTargetId undefined', () => {
        component.openAddTarget(null, 'device');
        component.targetForm.name = 'New Drone';
        component.saveTargetForm();

        const created = matrixState.state.publicTargets.find(t => t.name === 'New Drone')!;
        expect(created.parentTargetId).toBeUndefined();
      });

      it('AC-9: creating a new device via the Add form with a Parent selected sets parentTargetId to match (Xavier, 2026-09-09: Add flow also offers Parent)', () => {
        component.openAddTarget(null, 'device');
        component.targetForm.name = 'New Weapon';
        component.targetForm.parentTargetId = device.id;
        component.saveTargetForm();

        const created = matrixState.state.publicTargets.find(t => t.name === 'New Weapon')!;
        expect(created.parentTargetId).toBe(device.id);
        expect(component.childrenOf(device.id).map(t => t.id)).toContain(created.id);
      });

      // Reviewer-traced race, not previously tested: the GM picks a parent
      // in the Add form, then deletes that very target from the tree before
      // clicking Save. Xavier's judgement call (2026-09-09, "ALSO" section):
      // a DELETED parent is treated differently from a CYCLE. A cycle is an
      // impossible nesting the GM's own choice would create right now — that
      // deserves the new blocking message. A deleted parent is not the GM's
      // choice being wrong; it is a target that simply stopped existing
      // while the form sat open, through no fault of the selection made —
      // closer to the option list going stale than to a rejected choice. It
      // still degrades silently to unparented, exactly as before this
      // change, with no dangling reference and no inline message.
      it('the deleted-parent race: a parent chosen in the Add form and then deleted before Save leaves the new target unparented, with no message and no dangling reference', () => {
        const doomed = new MatrixTarget({ id: 'doomed1', name: 'Doomed Mount', type: 'device', context: 'public' });
        matrixState.addTarget(null, doomed);

        component.openAddTarget(null, 'device');
        component.targetForm.name = 'New Widget';
        component.targetForm.parentTargetId = doomed.id;

        // The chosen parent vanishes before Save.
        matrixState.removeTarget(null, doomed);

        component.saveTargetForm();

        const created = matrixState.state.publicTargets.find(t => t.name === 'New Widget')!;
        expect(created).toBeTruthy();
        expect(created.parentTargetId).toBeUndefined(); // unparented, not pointing at a ghost
        expect(component.targetForm.parentError).toBeNull(); // no message — this is not a rejected choice
        expect(component.targetForm.active).toBeFalse(); // the save proceeded and the form closed normally
      });

      // Gap 3 (review round, closing a defect class): the test above ("the
      // deleted-parent race") only covers the ADD flow, where a stale
      // reference can never dangle because a brand-new MatrixTarget starts
      // with parentTargetId === undefined anyway — deleting the chosen
      // parent before Save just leaves that default in place. The real case
      // is an EXISTING target whose own Edit form sits open holding a
      // parent id that is deleted out from under it while the form is open.
      //
      // This resolves correctly today, but ONLY because two separate
      // mechanisms happen to interact: deleteTarget()
      // (hierarchy-editor.component.ts) already re-homes a deleted parent's
      // children to `undefined` at delete time — BEFORE this stale Save ever
      // runs — so by the time commitParentField()/setParent() re-validates
      // the form's buffered id against parentOptionsFor() at Save time, the
      // target's real parentTargetId is already undefined; the guard's
      // silent no-write (setParent() finds the stale id no longer in
      // parentOptionsFor() and returns without writing) lands on a value
      // that was already cleared, rather than restoring a dangling pointer
      // to nothing. That correctness is incidental to those two mechanisms
      // agreeing, not designed as one guarantee — if deleteTarget() ever
      // stops re-homing children, or setParent()'s guard ever starts writing
      // the stale id instead of no-op'ing, this test should catch it.
      it('an existing target\'s Edit form holding a since-deleted parent id saves to unparented, not a dangling reference', () => {
        const parent = new MatrixTarget({ id: 'p1', name: 'Parent Device', type: 'device', context: 'public' });
        const child = new MatrixTarget({ id: 'c1', name: 'Child Device', type: 'device', context: 'public' });
        matrixState.addTarget(null, parent);
        matrixState.addTarget(null, child);
        component.setParent(child, parent.id);

        component.openEditTarget(null, child); // buffers parentTargetId = parent.id
        expect(component.targetForm.parentTargetId).toBe(parent.id);

        // The parent is deleted while `child`'s Edit form sits open, holding
        // the now-stale id. `parent` itself has `child` parented to it, so
        // deleteTarget()'s own re-homing confirmation fires first (Defect 4,
        // above) — confirmed, which is what re-homes `child` to top level
        // before this test's stale Save ever runs.
        spyOn(window, 'confirm').and.returnValue(true);
        component.deleteTarget(null, parent);
        expect(window.confirm).toHaveBeenCalled();
        expect(child.parentTargetId).toBeUndefined(); // re-homed by deleteTarget() already, before Save

        // The open Edit form belongs to `child`, a different target than the
        // one just deleted — deleteTarget() only resets targetForm when the
        // deleted target IS the form's own target, so the form stays open,
        // still holding the stale parent.id buffered value.
        expect(component.targetForm.active).toBeTrue();
        expect(component.targetForm.parentTargetId).toBe(parent.id);

        component.saveTargetForm();

        expect(child.parentTargetId).toBeUndefined(); // unparented, not pointing at the deleted parent
        expect(component.targetForm.parentError).toBeNull(); // a deleted parent is not a rejected choice
      });

      it('Scenario 5: re-parenting an existing device from one parent to another takes one Edit-change-Save cycle, and the tree re-nests immediately after Save', () => {
        const mount2 = new MatrixTarget({ id: 'mount2', name: 'Spare Mount', type: 'device', context: 'public' });
        matrixState.addTarget(null, mount2);
        component.setParent(weapon, device.id); // weapon ("smartgun") currently under "mount" (device)

        component.openEditTarget(null, weapon);
        expect(component.targetForm.parentTargetId).toBe(device.id);
        component.targetForm.parentTargetId = mount2.id;
        component.saveTargetForm();

        expect(weapon.parentTargetId).toBe(mount2.id);
        expect(component.childrenOf(mount2.id).map(t => t.id)).toEqual(['wpn1']);
        expect(component.childrenOf(device.id).map(t => t.id)).toEqual([]);
      });

      it('the Add form offers a Parent field only for a public-space device (hostId === null)', () => {
        const host = new MatrixHost({ id: 'h1', name: 'Ares-7', rating: 4 });
        matrixState.addHost(host);
        component.openAddTarget(host, 'device');
        fixture.detectChanges();

        expect(fixture.debugElement.queryAll(By.css('.hier-parent-row')).length).toBe(0);
      });

      // Defect 2 (review round): every test above drives `targetForm`
      // and `saveTargetForm()` directly — none of them touch the rendered
      // `<select id="hier-target-parent">`, its `[value]="opt.id"` options,
      // or the ✕ clear button, so a broken `[(ngModel)]`/`(ngModelChange)`
      // binding or a broken clear handler could ship with every other test
      // here still green. These drive the actual DOM, the way a GM's tap
      // would.
      describe('Parent field: DOM-driven (Defect 2 — nothing above drives the real dropdown)', () => {
        /** The rendered Parent `<select>`, or null if the field isn't on screen. */
        function parentSelect(): HTMLSelectElement | null {
          return fixture.nativeElement.querySelector('#hier-target-parent');
        }

        /** The ✕ clear button beside the Parent select, or null if not rendered. */
        function parentClearBtn(): HTMLButtonElement | null {
          return fixture.nativeElement.querySelector('.hier-parent-clear-btn');
        }

        /** Picks an option by its value, exactly as a tap on the dropdown would. */
        function pickParent(value: string): void {
          const el = parentSelect()!;
          const index = Array.from(el.options).findIndex(o => o.value === value);
          expect(index).toBeGreaterThanOrEqual(0);
          el.selectedIndex = index;
          el.dispatchEvent(new Event('change'));
          fixture.detectChanges();
        }

        it('selecting a real <option> through the rendered <select> reaches targetForm.parentTargetId', () => {
          component.openEditTarget(null, weapon);
          fixture.detectChanges();

          pickParent(device.id);

          expect(component.targetForm.parentTargetId).toBe(device.id);
        });

        it('the rendered option list\'s values and labels match parentOptionsFor()', () => {
          component.openEditTarget(null, weapon);
          fixture.detectChanges();

          const expected = component.parentOptionsFor(weapon);
          const renderedOptions = Array.from(parentSelect()!.options)
            .filter(o => o.value !== ''); // drop "— None (top-level) —"

          expect(renderedOptions.map(o => o.value)).toEqual(expected.map(o => o.id));
          expect(renderedOptions.map(o => o.textContent?.trim())).toEqual(expected.map(o => o.name));
        });

        it('clicking the ✕ clear affordance empties the field', () => {
          component.setParent(weapon, device.id);
          component.openEditTarget(null, weapon);
          fixture.detectChanges();
          expect(component.targetForm.parentTargetId).toBe(device.id);

          parentClearBtn()!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          fixture.detectChanges();

          expect(component.targetForm.parentTargetId).toBe('');
          // The clear button itself disappears once there is nothing to clear.
          expect(parentClearBtn()).toBeNull();
        });

        it('picking through the real <select> and then clicking Save commits the change', () => {
          component.openEditTarget(null, weapon);
          fixture.detectChanges();

          pickParent(device.id);
          const saveBtn = fixture.nativeElement.querySelector('.hier-btn-save') as HTMLButtonElement;
          saveBtn.click();
          fixture.detectChanges();

          expect(weapon.parentTargetId).toBe(device.id);
          expect(component.childrenOf(device.id).map(t => t.id)).toEqual(['wpn1']);
        });

        // Gap 1 (review round, closing a defect class — see the convention
        // block above): AC-8's rejection message was previously asserted
        // only via `component.targetForm.parentError`; no test here ever
        // queried `.hier-form-error`. If the `@if (targetForm.parentError)`
        // binding at hierarchy-editor.component.html were broken (wrong
        // property, inverted condition), every field-only AC-8 test could
        // stay green while the GM saw nothing on screen — exactly the
        // silent-drop failure this whole feature exists to prevent.
        // Note on arrangement: `parentOptionsFor(a)` excludes A's own
        // descendants from the rendered `<select>` — so a value that is
        // ALREADY a's descendant when the form opens (as in the
        // component-level AC-8 test above) can never be reached by clicking
        // through the real dropdown; the option simply never renders. The
        // only way this guard is reachable via genuine DOM interaction is
        // the live-state race `saveTargetForm()`'s own comment describes: the
        // GM picks a currently-valid parent through the real `<select>`,
        // and it becomes invalid before Save because something else changed
        // the graph while this form stayed open (below, `component.setParent`
        // stands in for that "something else" — this app has only one target
        // form open at a time, so nothing in today's UI can do this to
        // itself, but the guard exists for exactly this shape of staleness,
        // matching Scenario 4's "evaluated against live state" reasoning).
        function pickThenMakeItACycle(a: MatrixTarget, c: MatrixTarget): void {
          pickParent(c.id); // valid right now — c is not yet a's descendant
          component.setParent(c, a.id); // c becomes a's child, invalidating the pick
        }

        it('AC-8 DOM: a blocked save renders the rejection message on screen, and the real ✕ clear button removes it', () => {
          const a = new MatrixTarget({ id: 'a1', name: 'A', type: 'device', context: 'public' });
          const c = new MatrixTarget({ id: 'c1', name: 'C', type: 'device', context: 'public' });
          matrixState.addTarget(null, a);
          matrixState.addTarget(null, c);

          component.openEditTarget(null, a);
          fixture.detectChanges();
          pickThenMakeItACycle(a, c);

          const saveBtn = fixture.nativeElement.querySelector('.hier-btn-save') as HTMLButtonElement;
          saveBtn.click();
          fixture.detectChanges();

          const message = expectVisibleText(fixture, '.hier-form-error');
          expect(message).toBe("Can't parent this under one of its own children.");

          // The ✕ clear button is a real rendered control (it shows whenever
          // `targetForm.parentTargetId` is set) — clicking it, not touching
          // any component field, is what removes the message from screen.
          const clearBtn = fixture.nativeElement.querySelector('.hier-parent-clear-btn') as HTMLButtonElement;
          expect(clearBtn).withContext('the ✕ clear button should be rendered while a parent is selected').not.toBeNull();
          clearBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          fixture.detectChanges();

          expectAbsent(fixture, '.hier-form-error');
        });

        it('AC-8 DOM: the rejection message is gone from the screen after the form is closed and reopened', () => {
          const a = new MatrixTarget({ id: 'a1', name: 'A', type: 'device', context: 'public' });
          const c = new MatrixTarget({ id: 'c1', name: 'C', type: 'device', context: 'public' });
          matrixState.addTarget(null, a);
          matrixState.addTarget(null, c);

          component.openEditTarget(null, a);
          fixture.detectChanges();
          pickThenMakeItACycle(a, c);
          (fixture.nativeElement.querySelector('.hier-btn-save') as HTMLButtonElement).click();
          fixture.detectChanges();
          expectVisibleText(fixture, '.hier-form-error'); // message is up first

          (fixture.nativeElement.querySelector('.hier-btn-cancel') as HTMLButtonElement).click();
          fixture.detectChanges();
          component.openEditTarget(null, a); // reopen the same target's Edit form
          fixture.detectChanges();

          expectAbsent(fixture, '.hier-form-error');
        });

        // Gap 2 (review round): AC-8's existing coverage checks real state
        // (`a.name` did not change) but never checks that the GM's
        // in-progress typing is still sitting in the form after the blocked
        // save — the entire reason it is acceptable to block the whole save,
        // rather than merely dropping the parent half, is that the GM does
        // not lose their work. Asserted through the rendered Name input, not
        // the buffer object, per the convention above.
        it('AC-8 DOM: the GM\'s other in-progress edit (a renamed target) survives a blocked save, visible in the rendered form', () => {
          const a = new MatrixTarget({ id: 'a1', name: 'A', type: 'device', context: 'public' });
          const c = new MatrixTarget({ id: 'c1', name: 'C', type: 'device', context: 'public' });
          matrixState.addTarget(null, a);
          matrixState.addTarget(null, c);

          component.openEditTarget(null, a);
          fixture.detectChanges();

          const nameInput = fixture.nativeElement.querySelector('#hier-target-name') as HTMLInputElement;
          nameInput.value = 'Renamed A';
          nameInput.dispatchEvent(new Event('input'));
          fixture.detectChanges();

          pickThenMakeItACycle(a, c);
          (fixture.nativeElement.querySelector('.hier-btn-save') as HTMLButtonElement).click();
          fixture.detectChanges();

          // The form is still open and the Name field still shows the GM's
          // buffered edit — nothing was cleared by the rejected save.
          const nameAfter = fixture.nativeElement.querySelector('#hier-target-name') as HTMLInputElement;
          expect(nameAfter.value).toBe('Renamed A');
          expect(a.name).toBe('A'); // and it never reached real state either
        });
      });
    });
  });

  // ── Decision 9 — propagation badge on a host's own mark row ────────────

  describe('HierarchyEditorComponent host marks: propagation badge (Decision 9, 2026-09-03)', () => {
    let fixture: ComponentFixture<HierarchyEditorComponent>;
    let component: HierarchyEditorComponent;
    let matrixState: MatrixStateService;
    let host: MatrixHost;
    let decker: MatrixParticipant;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [HierarchyEditorComponent],
        providers: appConfig.providers
      }).compileComponents();

      fixture = TestBed.createComponent(HierarchyEditorComponent);
      component = fixture.componentInstance;
      matrixState = TestBed.inject(MatrixStateService);
      decker = new MatrixParticipant();
      decker.name = 'Tesseract';
      component.activeDeckers = [decker];

      host = new MatrixHost({ id: 'h1', name: 'Ares-7', rating: 4 });
      matrixState.addHost(host);
      const device = new MatrixTarget({ id: 'd1', type: 'device', context: 'host', linkedHostId: host.id });
      host.targets.push(device);
      matrixState.addMark(device, 'Tesseract'); // propagates: host.marks + host.propagatedMarks both set

      fixture.detectChanges();
      component.toggleHost(host.id);
      fixture.detectChanges();
    });

    it("renders a propagation badge on the host's own mark row for a decker whose mark arrived by propagation", () => {
      const badges = fixture.debugElement.queryAll(By.css('.hier-propagated-badge'));
      expect(badges.length).toBe(1);
    });

    it("removeHostMark's tooltip warns that a propagated mark's own source (the device) is untouched", () => {
      const removeBtn = fixture.debugElement.query(By.css('.hier-mark-rm')).nativeElement as HTMLButtonElement;
      expect(removeBtn.title.toLowerCase()).toContain('propagated');
    });
  });

  // ── Claim 6 (AC-20 to AC-25) — ICParticipant + ic-spawner ──────────────

  describe('ICParticipant initiative and Matrix Condition Monitor (AC-20, AC-24, AC-25)', () => {
    it('AC-20: every IC type gets 4 Initiative Dice, including Patrol', () => {
      for (const type of Object.values(ICType)) {
        const ic = new ICParticipant(type, 4, 7);
        expect(ic.dices).toBe(IC_INITIATIVE_DICE);
        expect(ic.dices).toBe(4);
      }
    });

    it('AC-24 (Table Ruling 1): baseIni is host Data Processing + host Rating, not hostRating x 2', () => {
      const ic = new ICParticipant(ICType.Killer, 4, 7);
      expect(ic.baseIni).toBe(11); // 7 + 4, not 4 x 2 = 8
    });

    it('AC-24: baseIni is an ordinary editable field afterwards', () => {
      const ic = new ICParticipant(ICType.Killer, 4, 7);
      ic.baseIni = 99;
      expect(ic.baseIni).toBe(99);
    });

    it('AC-25 (Table Ruling 2): physicalHealth is written as 8 + ceil(hostRating / 2), not the hard-coded 8 + ceil(1/2)', () => {
      const ic = new ICParticipant(ICType.Killer, 6, 7);
      // Literal, not matrixConditionMonitor(6) — round-4 "circular IC test
      // coverage": a broken helper must not be able to pass its own test.
      expect(ic.physicalHealth).toBe(11); // 8 + ceil(6/2), not 9
    });

    // Appendix J item 4 — clone() round-trips damage correctly even though
    // the constructor now writes physicalHealth.
    it('clone() round-trips physicalDamage and physicalHealth correctly', () => {
      const ic = new ICParticipant(ICType.Killer, 6, 7);
      ic.physicalDamage = 3;
      const clone = ic.clone() as ICParticipant;
      expect(clone.physicalDamage).toBe(3);
      expect(clone.physicalHealth).toBe(11); // literal — 8 + ceil(6/2)
      expect(clone.baseIni).toBe(13); // 7 + 6, matching this test's own hostRating/hostDataProcessing
    });

    // Round-3 defect D4: an unset host Data Processing must not fabricate
    // baseIni = hostRating (i.e. 0 + hostRating). It must stay at the
    // sentinel, matching MatrixParticipant.applyJackInMode()'s handling of a
    // decker's own unset Data Processing.
    it('D4: with host Data Processing left at the default (unset), baseIni is NOT fabricated as hostRating', () => {
      const ic = new ICParticipant(ICType.Killer, 4); // hostDataProcessing omitted
      expect(ic.hostDataProcessing).toBe(DATA_PROCESSING_UNSET);
      expect(ic.baseIni).toBe(DATA_PROCESSING_UNSET); // NOT 4 (= 0 + hostRating)
    });

    it('D4: passing DATA_PROCESSING_UNSET explicitly behaves identically to omitting it', () => {
      const ic = new ICParticipant(ICType.Killer, 4, DATA_PROCESSING_UNSET);
      expect(ic.baseIni).toBe(DATA_PROCESSING_UNSET);
    });

    it('D4: a real host Data Processing still derives baseIni normally (regression guard)', () => {
      const ic = new ICParticipant(ICType.Killer, 4, 7);
      expect(ic.baseIni).toBe(11); // 7 + 4
    });

    // Round-3 defect D5 / Decision 4: IC's Matrix Condition Monitor produces
    // no wound modifier below full (RULINGS.md restored 2026-09-02, "Matrix
    // damage applies no penalty until the monitor is full"), and IC has no
    // Stun track — ooc depends only on the Matrix monitor plus the manual
    // "bench this participant" flag.
    it('D5: wm is always 0 for IC, even deep into Matrix damage, unlike the base Participant formula', () => {
      const ic = new ICParticipant(ICType.Killer, 4, 7); // physicalHealth = 10
      ic.physicalDamage = 9; // one box from bricked
      expect(ic.wm).toBe(0);
    });

    it('Decision 4: ooc is false while the Matrix monitor is not full, regardless of the inherited Stun fields', () => {
      const ic = new ICParticipant(ICType.Killer, 4, 7);
      ic.stunDamage = ic.stunHealth; // the dropped, inert Stun track "full"
      expect(ic.ooc).toBeFalse();
    });

    it('Decision 4: ooc becomes true once the Matrix monitor (physicalHealth) is completely full', () => {
      const ic = new ICParticipant(ICType.Killer, 4, 7);
      ic.physicalDamage = ic.physicalHealth;
      expect(ic.ooc).toBeTrue();
    });

    it('Decision 4: the manual "bench this participant" flag still forces ooc true', () => {
      const ic = new ICParticipant(ICType.Killer, 4, 7);
      ic.ooc = true;
      expect(ic.ooc).toBeTrue();
      expect(ic.manualOoc).toBeTrue();
    });

    // Round-4 defect D-4: a GM correcting a host's Rating/Data Processing
    // post-spawn must not leave the IC on a stale monitor/initiative.
    it('D-4: setting hostRating after construction recomputes both baseIni and physicalHealth', () => {
      const ic = new ICParticipant(ICType.Killer, 4, 7); // baseIni 11, physicalHealth 10
      expect(ic.baseIni).toBe(11);
      expect(ic.physicalHealth).toBe(10);

      ic.hostRating = 6; // GM corrects the host's Rating

      expect(ic.baseIni).toBe(13); // 7 + 6
      expect(ic.physicalHealth).toBe(11); // 8 + ceil(6/2)
    });

    it('D-4: setting hostDataProcessing after construction recomputes baseIni (physicalHealth is unaffected, it does not depend on DP)', () => {
      const ic = new ICParticipant(ICType.Killer, 4, 7); // baseIni 11
      ic.hostDataProcessing = 9;
      expect(ic.baseIni).toBe(13); // 9 + 4
      expect(ic.physicalHealth).toBe(10); // unchanged — depends only on hostRating
    });

    it('D-4: correcting hostRating after Data Processing was left unset still derives no baseIni (no fabricated number)', () => {
      const ic = new ICParticipant(ICType.Killer, 4); // DP unset
      expect(ic.baseIni).toBe(DATA_PROCESSING_UNSET);
      ic.hostRating = 8;
      expect(ic.baseIni).toBe(DATA_PROCESSING_UNSET); // still no DP to derive from
      expect(ic.physicalHealth).toBe(12); // 8 + ceil(8/2) — physicalHealth never depended on DP
    });

    // Round-5 defect D-8: correcting a host's Rating must not silently
    // discard a GM's hand-typed baseIni/physicalHealth (Table Ruling 1's "How
    // to apply" requires baseIni be overridable at the table).
    it('D-8: a hand-edited baseIni is not clobbered when hostRating is corrected afterwards', () => {
      const ic = new ICParticipant(ICType.Killer, 4, 7); // baseIni 11
      ic.baseIni = 15; // GM types a hand value for this boss IC
      ic.hostRating = 6; // GM then fixes a typo in the host's Rating

      expect(ic.baseIni).toBe(15); // untouched
      expect(ic.physicalHealth).toBe(11); // physicalHealth still recomputes: 8 + ceil(6/2)
    });

    it('D-8: a hand-edited physicalHealth is not clobbered when hostRating is corrected afterwards', () => {
      const ic = new ICParticipant(ICType.Killer, 4, 7); // physicalHealth 10
      ic.physicalHealth = 20; // GM types a hand value
      ic.hostRating = 6;

      expect(ic.physicalHealth).toBe(20); // untouched
      expect(ic.baseIni).toBe(13); // baseIni still recomputes: 7 + 6
    });

    it('D-8: a hand-edited baseIni is not clobbered when hostDataProcessing is corrected afterwards', () => {
      const ic = new ICParticipant(ICType.Killer, 4, 7);
      ic.baseIni = 20;
      ic.hostDataProcessing = 9;
      expect(ic.baseIni).toBe(20);
    });

    it('D-8: once both baseIni and physicalHealth are hand-edited, further host corrections touch neither', () => {
      const ic = new ICParticipant(ICType.Killer, 4, 7);
      ic.baseIni = 20;
      ic.physicalHealth = 30;
      ic.hostRating = 10;
      ic.hostDataProcessing = 12;
      expect(ic.baseIni).toBe(20);
      expect(ic.physicalHealth).toBe(30);
    });

    it('D-8: without any hand edit, hostRating/hostDataProcessing continue to recompute both fields (regression guard)', () => {
      const ic = new ICParticipant(ICType.Killer, 4, 7);
      ic.hostRating = 6;
      ic.hostDataProcessing = 9;
      expect(ic.baseIni).toBe(15); // 9 + 6
      expect(ic.physicalHealth).toBe(11); // 8 + ceil(6/2)
    });

    it('D-8: the hand-edit override survives clone(), even when the clone\'s own hostRating is corrected afterwards', () => {
      const ic = new ICParticipant(ICType.Killer, 4, 7);
      ic.baseIni = 20;
      const clone = ic.clone() as ICParticipant;

      clone.hostRating = 10;

      expect(clone.baseIni).toBe(20);
    });

    // Missed interaction 4: Matrix damage has no overflow phase for IC.
    it('missed interaction 4: overflowHealth reads 0 for IC regardless of the inherited meat-body default', () => {
      const ic = new ICParticipant(ICType.Killer, 4, 7);
      expect(ic.overflowHealth).toBe(0);
    });

    it('missed interaction 4: overflowHealth stays 0 for IC even after an attempted write (setter still accepts writes, getter still reports 0)', () => {
      const ic = new ICParticipant(ICType.Killer, 4, 7);
      ic.overflowHealth = 4; // some future caller mistakenly treating IC like a meat body
      expect(ic.overflowHealth).toBe(0);
    });
  });

  describe('ICSpawnerComponent (AC-21, AC-23, spawn-limit warn-not-refuse)', () => {
    let fixture: ComponentFixture<ICSpawnerComponent>;
    let component: ICSpawnerComponent;
    let host: MatrixHost;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [ICSpawnerComponent],
        providers: appConfig.providers
      }).compileComponents();

      fixture = TestBed.createComponent(ICSpawnerComponent);
      component = fixture.componentInstance;
      host = new MatrixHost({ id: 'h1', name: 'H', rating: 4, dataProcessing: 7 });
      component.host = host;
      fixture.detectChanges();
    });

    // AC-21 / S2
    it('AC-21/S2: Patrol\'s initiative preview equals Killer\'s at the same host rating', () => {
      component.selectedType = ICType.Patrol;
      const patrolMin = component.initiativeMin;
      const patrolMax = component.initiativeMax;
      expect(component.initiativeDice).toBe(4);

      component.selectedType = ICType.Killer;
      expect(component.initiativeMin).toBe(patrolMin);
      expect(component.initiativeMax).toBe(patrolMax);
      expect(component.initiativeDice).toBe(4);
    });

    it('AC-21: initiativeBase reads host Data Processing + host Rating', () => {
      expect(component.initiativeBase).toBe(11); // 7 + 4
    });

    // Defect 5: an unset host Data Processing must show no invented initiative
    // number (RULINGS.md 2026-08-30, "a plausible invented number is worse
    // than a blank") — a Rating 4 host with Data Processing left blank must
    // not preview "4 + 4D6" (i.e. silently treating unset DP as 0).
    it('defect 5: with host Data Processing unset, initiativeBase/Min/Max are all null, not the DP-as-0 answer', () => {
      const unsetHost = new MatrixHost({ id: 'h2', name: 'H2', rating: 4 }); // dataProcessing left unset
      component.host = unsetHost;
      fixture.detectChanges();

      expect(component.hostDataProcessingSet).toBeFalse();
      expect(component.initiativeBase).toBeNull();
      expect(component.initiativeMin).toBeNull();
      expect(component.initiativeMax).toBeNull();

      const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(text).not.toContain('4 + 4d6');
      expect(text.toLowerCase()).toContain('not set');
      expect(text).toContain('host Data Processing + Host Rating');
    });

    it('defect 5: with host Data Processing set, the preview surfaces the Data Processing value and the formula', () => {
      const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(text).toContain('7'); // host.dataProcessing
      expect(text).toContain('11'); // initiativeBase, 7 + 4
    });

    it('AC-25: matrixCM preview equals 8 + ceil(host.rating / 2)', () => {
      // Literal, not matrixConditionMonitor(4) — round-4 "circular IC test
      // coverage".
      expect(component.matrixCM).toBe(10); // host rating 4, from this describe's beforeEach
    });

    // AC-23
    it('AC-23: the Patrol note distinguishes its absent Attack from its (unrelated, unreduced) Initiative Dice', () => {
      component.selectedType = ICType.Patrol;
      fixture.detectChanges();
      const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(text).toContain('Attack: n/a');
      expect(text).toMatch(/4D6|4d6/);
    });

    // Spawn limits: warn, don't refuse (SCOPE.md "Enforcing legality", 2026-09-01)
    it('warns but does not refuse when the host is at IC capacity', () => {
      host.icActive = [
        new ICParticipant(ICType.Patrol, 4, 7),
        new ICParticipant(ICType.Killer, 4, 7),
        new ICParticipant(ICType.Acid, 4, 7),
        new ICParticipant(ICType.Blaster, 4, 7)
      ];
      expect(component.atCap).toBeTrue();
      expect(component.validationMessage).toContain('GM override');
    });

    it('warns but does not refuse a duplicate IC type, and the spawn button carries no [disabled]', () => {
      host.icActive = [new ICParticipant(ICType.Patrol, 4, 7)];
      component.selectedType = ICType.Patrol;
      fixture.detectChanges();
      expect(component.isDuplicateType).toBeTrue();

      const spawnBtn = fixture.debugElement.query(By.css('.modal-footer .btn-danger')).nativeElement as HTMLButtonElement;
      expect(spawnBtn.disabled).toBeFalse();

      const options = fixture.debugElement.queryAll(By.css('option'));
      for (const opt of options) {
        expect((opt.nativeElement as HTMLOptionElement).disabled).toBeFalse();
      }
    });

    // T4: the panel has no `canSpawn` gate at all any more — dead code
    // removed, since nothing (template or otherwise) ever consumed it once
    // the [disabled] binding was dropped.
    it('T4: canSpawn no longer exists on the component', () => {
      const c = component as unknown as Record<string, unknown>;
      expect(c['canSpawn']).toBeUndefined();
    });

    // Decision 5 (2026-09-02) supersedes round-3's unconditional
    // one-IC-per-Combat-Turn line: it is now a DETECTED warning, keyed off
    // ICParticipant.spawnedOnCombatTurn and the new combatTurn/combatStarted
    // inputs, and stays silent — not fabricated — whenever the turn isn't
    // knowable.
    it('Decision 5: with combat not started, the one-IC-per-Combat-Turn warning is silent (nothing to detect)', () => {
      expect(component.combatStarted).toBeFalse();
      expect(component.turnKnown).toBeFalse();
      expect(component.sameTurnIC).toBeNull();
      expect(component.validationMessage).not.toContain('Combat Turn');
    });

    it('Decision 5: with combat started but no IC spawned yet this turn, no one-IC-per-Combat-Turn warning fires', () => {
      component.combatStarted = true;
      component.combatTurn = 2;
      component.combatGeneration = 0;
      fixture.detectChanges();
      expect(component.turnKnown).toBeTrue();
      expect(component.sameTurnIC).toBeNull();
      expect(component.validationMessage).not.toContain('already launched this host on Combat Turn');
    });

    it('Decision 5: names the specific IC already launched this Combat Turn', () => {
      const ic = new ICParticipant(ICType.Killer, 4, 7, '', 2, 0); // spawned on Combat Turn 2, generation 0
      host.icActive = [ic];
      component.combatStarted = true;
      component.combatTurn = 2;
      component.combatGeneration = 0;
      fixture.detectChanges();
      expect(component.sameTurnIC).toBe(ic);
      expect(component.validationMessage).toContain('Killer IC already launched this host on Combat Turn 2');
      expect(component.validationMessage).toContain('GM override');
    });

    it('Decision 5: an IC spawned on a different Combat Turn does not trigger the warning', () => {
      const ic = new ICParticipant(ICType.Killer, 4, 7, '', 1, 0); // Combat Turn 1
      host.icActive = [ic];
      component.combatStarted = true;
      component.combatTurn = 2;
      component.combatGeneration = 0;
      fixture.detectChanges();
      expect(component.sameTurnIC).toBeNull();
    });

    // Round-5 defect D-6: combatTurn alone resets to 1 whenever a combat
    // ends, so an IC left in host.icActive from a previous, already-ended
    // combat must not trip the warning just because a brand-new combat also
    // happens to be on turn 1.
    it('D-6: an IC launched on turn 1 of an earlier, already-ended combat does not trigger the warning on turn 1 of a new combat', () => {
      const staleIc = new ICParticipant(ICType.Killer, 4, 7, '', 1, 0); // launched turn 1, generation 0 (the old combat)
      host.icActive = [staleIc];
      component.combatStarted = true;
      component.combatTurn = 1;
      component.combatGeneration = 1; // a new combat has since started — generation advanced
      fixture.detectChanges();

      expect(component.sameTurnIC).toBeNull();
    });

    it('D-6: an IC launched this turn, in this combat generation, does still trigger the warning', () => {
      const ic = new ICParticipant(ICType.Killer, 4, 7, '', 1, 1); // launched turn 1 of generation 1
      host.icActive = [ic];
      component.combatStarted = true;
      component.combatTurn = 1;
      component.combatGeneration = 1;
      fixture.detectChanges();

      expect(component.sameTurnIC).toBe(ic);
    });

    it('D-6: turnKnown is false when combatGeneration is not supplied, even with combatTurn known', () => {
      component.combatStarted = true;
      component.combatTurn = 2;
      component.combatGeneration = null;
      fixture.detectChanges();

      expect(component.turnKnown).toBeFalse();
      expect(component.sameTurnIC).toBeNull();
    });

    it('Decision 5: the yellow warning box only appears when something is actually wrong (not unconditionally any more)', () => {
      fixture.detectChanges();
      expect(component.validationMessage).toBe('');
      expect(fixture.debugElement.query(By.css('.alert-warning'))).toBeNull();
    });

    it('Decision 5: the grey standing note shows the current Combat Turn when known, and a fallback when combat has not started', () => {
      fixture.detectChanges();
      let text = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(text).toContain("Combat hasn't started");

      component.combatStarted = true;
      component.combatTurn = 3;
      component.combatGeneration = 0;
      fixture.detectChanges();
      text = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(text).toContain('Current Combat Turn: 3');
    });

    // D-5: the preview honestly blanks itself when host Data Processing is
    // unset, but the Spawn button was not gated and validationMessage said
    // nothing — so the GM could spawn a real-looking 4-24 Initiative Score
    // with half the formula silently missing.
    it('D-5: validationMessage warns when host Data Processing is unset, and the Spawn button stays enabled (warn, not refuse)', () => {
      const unsetHost = new MatrixHost({ id: 'h2', name: 'H2', rating: 4 });
      component.host = unsetHost;
      fixture.detectChanges();
      expect(component.validationMessage).toContain('Host Data Processing is not set');
      const spawnBtn = fixture.debugElement.query(By.css('.modal-footer .btn-danger')).nativeElement as HTMLButtonElement;
      expect(spawnBtn.disabled).toBeFalse();
    });

    // Missed interaction 3: a bricked IC (Matrix monitor full) crashes and
    // vanishes from the host per p. 247 (rules/pages/p0249.txt:49-51) — this
    // tracker does not auto-delete it, but it must stop counting against the
    // host's IC limits.
    it('missed interaction 3: a bricked IC does not count against atCap or activeCount', () => {
      const bricked1 = new ICParticipant(ICType.Killer, 4, 7);
      bricked1.physicalDamage = bricked1.physicalHealth;
      const bricked2 = new ICParticipant(ICType.Acid, 4, 7);
      bricked2.physicalDamage = bricked2.physicalHealth;
      host.icActive = [bricked1, bricked2]; // both bricked, host rating 4
      expect(component.activeCount).toBe(0);
      expect(component.atCap).toBeFalse();
    });

    it('missed interaction 3: a bricked IC of the selected type does not count as a duplicate', () => {
      const bricked = new ICParticipant(ICType.Patrol, 4, 7);
      bricked.physicalDamage = bricked.physicalHealth;
      host.icActive = [bricked];
      component.selectedType = ICType.Patrol;
      expect(component.isDuplicateType).toBeFalse();
    });

    it('missed interaction 3: a bricked IC is not auto-deleted from host.icActive, only uncounted', () => {
      const bricked = new ICParticipant(ICType.Patrol, 4, 7);
      bricked.physicalDamage = bricked.physicalHealth;
      host.icActive = [bricked];
      expect(host.icActive.length).toBe(1);
      expect(component.activeCount).toBe(0);
    });
  });

  // ── T4 — matrix-graph markDots (marks are per-persona, p. 236) ─────────

  describe('MatrixGraphComponent.markDots (T4)', () => {
    let fixture: ComponentFixture<MatrixGraphComponent>;
    let component: MatrixGraphComponent;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [MatrixGraphComponent],
        providers: appConfig.providers
      }).compileComponents();

      fixture = TestBed.createComponent(MatrixGraphComponent);
      component = fixture.componentInstance;
    });

    it('T4: three deckers with one mark each render distinguishably from one decker holding three', () => {
      const threeDeckers = component.markDots({ A: 1, B: 1, C: 1 });
      const oneDecker = component.markDots({ A: 3 });
      expect(threeDeckers).not.toBe(oneDecker);
    });

    it('T4: one decker with 3 marks renders as their initials plus three unbroken dots', () => {
      expect(component.markDots({ A: 3 })).toBe('A●●●');
    });

    it('T4: each decker\'s marks stay capped at 3 dots individually, even past the cap', () => {
      expect(component.markDots({ A: 5 })).toBe('A●●●');
    });

    it('T4: no marks renders an empty string', () => {
      expect(component.markDots({})).toBe('');
      expect(component.markDots({ A: 0 })).toBe('');
    });

    // Round-4 defect D-6: an earlier version had no cap on the number of
    // decker-groups rendered and discarded the owner key entirely
    // (`Object.values`, not `Object.entries`) — five deckers at three marks
    // each rendered 19 unlabelled glyphs.
    it('D-6: the owner key is visible — each group is prefixed with that decker\'s initials', () => {
      const result = component.markDots({ Tesseract: 2, 'dev grrl': 1 });
      expect(result).toContain('TE●●');
      expect(result).toContain('DG●');
    });

    it('D-6: five deckers at three marks each is capped, not 19 unbroken glyphs', () => {
      const marks = { Alice: 3, Bob: 3, Carl: 3, Dana: 3, Eve: 3 };
      const result = component.markDots(marks);
      // MARK_DOT_MAX_OWNERS = 4 groups shown, the 5th folded into a "+1" summary.
      expect(result).toContain('+1');
      const dotCount = (result.match(/●/g) ?? []).length;
      expect(dotCount).toBe(12); // 4 shown groups x 3 dots, not 5 x 3 = 15
    });
  });

  // ── Claim 7 (AC-26 to AC-29) — matrix-player-view ──────────────────────

  describe('MatrixPlayerViewComponent (AC-26 to AC-29, S6 marks half)', () => {
    let fixture: ComponentFixture<MatrixPlayerViewComponent>;
    let component: MatrixPlayerViewComponent;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [MatrixPlayerViewComponent],
        providers: appConfig.providers
      }).compileComponents();

      fixture = TestBed.createComponent(MatrixPlayerViewComponent);
      component = fixture.componentInstance;
    });

    // AC-27 / AC-28 / S6
    it('AC-27/AC-28/S6: hostMarks() reads the host icon\'s own mark record, not an aggregate over targets inside it', () => {
      const device: SharedMatrixTarget = {
        id: 'd1', name: 'Maglock', type: 'device', visibility: 'active',
        marks: { Tesseract: 2 }, matrixDamage: 0, matrixHealth: 9, hostName: 'H'
      };
      component.targets = [device];
      component.myName = 'Tesseract';
      component.currentHostName = 'H';
      component.hostMarksRecord = null; // no host-level marks broadcast for this decker
      fixture.detectChanges();

      expect(component.hostMarks()).toBe(0);
      expect(component.contextTargets[0].marks['Tesseract']).toBe(2);
    });

    it('AC-27: hostMarks() reflects hostMarksRecord once it carries a value', () => {
      component.myName = 'Tesseract';
      component.hostMarksRecord = { Tesseract: 1, OtherDecker: 3 };
      expect(component.hostMarks()).toBe(1);
    });

    // AC-26 — the comment fix has no runtime assertion; covered by review of
    // matrix-player-view.component.ts's docstring above hostMarks().

    // AC-15 (player-side) / Scope Question C
    it('Scope Question C: the player view renders Matrix damage but never a maximum', () => {
      const device: SharedMatrixTarget = {
        id: 'd1', name: 'Maglock', type: 'device', visibility: 'active',
        marks: {}, matrixDamage: 3, matrixHealth: 9
      };
      component.targets = [device];
      fixture.detectChanges();

      expect(textContains(fixture, '3')).toBeTrue();
      expect(fixture.debugElement.query(By.css('.mpv-cm-max'))).toBeNull();
      expect(textContains(fixture, '/ 9')).toBeFalse();
      expect(textContains(fixture, '/9')).toBeFalse();
    });

    // AC-30 / AC-31 — preserved behaviour
    it('AC-30: renders no Overwatch Score for any decker under any state', () => {
      component.myVrMode = 'hot-sim';
      fixture.detectChanges();
      expect(textContains(fixture, 'Overwatch')).toBeFalse();
      expect(textContains(fixture, 'OS ')).toBeFalse();
    });

    // Defect 7: hosts and files must render no Matrix damage number at all
    // (p. 229 — they cannot be attacked with Matrix damage, so there is no
    // track). An earlier version had no type guard, so a file icon rendered
    // "0" with tooltip "Matrix damage: 0", implying a track it cannot have.
    it('defect 7: a "host" icon renders no Matrix damage figure', () => {
      const host: SharedMatrixTarget = {
        id: 'h1', name: 'CorpHost', type: 'host', visibility: 'active',
        marks: {}, matrixDamage: 0, matrixHealth: 0
      };
      component.targets = [host];
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.css('.mpv-cm'))).toBeNull();
    });

    it('defect 7: a "file" icon renders no Matrix damage figure', () => {
      const file: SharedMatrixTarget = {
        id: 'f1', name: 'SecretFile', type: 'file', visibility: 'active',
        marks: {}, matrixDamage: 0, matrixHealth: 0
      };
      component.targets = [file];
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.css('.mpv-cm'))).toBeNull();
    });

    it('defect 7: a "device" icon still renders its Matrix damage figure (regression guard)', () => {
      const device: SharedMatrixTarget = {
        id: 'd1', name: 'Maglock', type: 'device', visibility: 'active',
        marks: {}, matrixDamage: 2, matrixHealth: 9
      };
      component.targets = [device];
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.css('.mpv-cm'))).not.toBeNull();
    });
  });

  // ── Defect 10 — matrix-run-panel and matrix-graph enter the type-checked
  //    program (adversarial validation round, 2026-09-01) ─────────────────

  describe('MatrixRunPanelComponent (composition root, pulls matrix-graph in with it)', () => {
    let fixture: ComponentFixture<MatrixRunPanelComponent>;
    let component: MatrixRunPanelComponent;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [MatrixRunPanelComponent],
        providers: appConfig.providers
      }).compileComponents();

      fixture = TestBed.createComponent(MatrixRunPanelComponent);
      component = fixture.componentInstance;
      component.activeDeckers = [];
      fixture.detectChanges();
    });

    it('mounts without throwing, with its child components (decker-card, hierarchy-editor, access-host-panel, matrix-graph) all wired', () => {
      expect(component).toBeTruthy();
      expect(component.collapsed).toBeFalse(); // starts expanded
      component.toggleCollapse();
      fixture.detectChanges();
      expect(component.collapsed).toBeTrue();
    });

    it('re-emits jackInRequested/jackOutRequested from its decker-card children', () => {
      const decker = new MatrixParticipant();
      decker.name = 'Tesseract';
      component.activeDeckers = [decker];
      fixture.detectChanges();

      const jackIns: unknown[] = [];
      const jackOuts: unknown[] = [];
      component.jackInRequested.subscribe(e => jackIns.push(e));
      component.jackOutRequested.subscribe(e => jackOuts.push(e));

      component.onJackInRequested({ decker, mode: VRMode.HotSim });
      component.onJackOutRequested(decker);

      expect(jackIns.length).toBe(1);
      expect(jackOuts.length).toBe(1);
    });

    // ── N-6 (round-7 review): Lifecycle table path 9 — the whole Matrix
    //    panel collapsed while a card inside the nested hierarchy editor has
    //    its own picker open — had no test. Reachable: `@if (!collapsed)`
    //    (matrix-run-panel.component.html) destroys the entire
    //    `<app-hierarchy-editor>` subtree, including any open card. ──

    it('Lifecycle path 9: collapsing the whole Matrix panel while a card inside the hierarchy editor has its own picker open clears the highlight cleanly, with no NG0100', fakeAsync(() => {
      const matrixState = TestBed.inject(MatrixStateService);
      const decker = new MatrixParticipant();
      decker.name = 'Tesseract';
      component.activeDeckers = [decker]; // beforeEach leaves this []; openAddMark() needs a decker to seed, or it stays blocked and no highlight ever shows
      const drone = new MatrixTarget({ id: 'dr', name: 'MCT Roto-Drone', type: 'device', context: 'public' });
      const gun = new MatrixTarget({ id: 'gn', name: 'Smartgun', type: 'device', context: 'public', parentTargetId: 'dr' });
      matrixState.addTarget(null, drone);
      matrixState.addTarget(null, gun);
      fixture.detectChanges();

      const gunCard = fixture.debugElement
        .queryAll(By.directive(TargetCardComponent))
        .map(de => de.componentInstance as TargetCardComponent)
        .find(c => c.target.id === 'gn')!;
      gunCard.openAddMark();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelectorAll('.hier-prop-landing, .hier-prop-capped').length).toBe(1);

      expect(() => {
        component.toggleCollapse(); // destroys the whole editor subtree, including gun's own card
        fixture.detectChanges(); // the pass that used to throw NG0100
      }).not.toThrow();

      tick(); // flush the deferred clearing emit
      fixture.detectChanges();

      expect(fixture.debugElement.query(By.directive(HierarchyEditorComponent))).toBeNull();
      expect(fixture.nativeElement.querySelectorAll('.hier-prop-landing, .hier-prop-capped').length).toBe(0);
    }));
  });

  // ── Defect 11 — addMarkToHost must not write the intruder's marks into
  //    an IC's own state ─────────────────────────────────────────────────
  //
  // Round-4 defect D-9: `MatrixParticipant.marksPlaced` (a Map no production
  // code ever wrote marks into) is deleted entirely, so there is no longer a
  // second mark record on an IC for addMarkToHost to corrupt into. These
  // tests now assert the field is gone and that the IC object itself is
  // otherwise untouched by a host-level mark write.

  describe('MatrixStateService.addMarkToHost / removeMarkFromHost (defect 11, D-9)', () => {
    let matrixState: MatrixStateService;
    let host: MatrixHost;

    beforeEach(() => {
      TestBed.configureTestingModule({ providers: appConfig.providers });
      matrixState = TestBed.inject(MatrixStateService);
      host = new MatrixHost({ id: 'h1', name: 'H', rating: 4 });
      const ic = new ICParticipant(ICType.Patrol, 4, 7);
      host.icActive = [ic];
      matrixState.addHost(host);
      matrixState.setCurrentHost(host.id);
    });

    it('addMarkToHost writes only the host\'s own marks record — ICParticipant has no marksPlaced field to corrupt (D-9, deleted)', () => {
      matrixState.addMarkToHost(host, 'Tesseract', 1);
      expect(host.marks['Tesseract']).toBe(1);
      expect((host.icActive[0] as unknown as Record<string, unknown>)['marksPlaced']).toBeUndefined();
    });

    it('removeMarkFromHost also leaves the IC object untouched', () => {
      matrixState.addMarkToHost(host, 'Tesseract', 2);
      const icBefore = host.icActive[0];
      matrixState.removeMarkFromHost(host, 'Tesseract');
      expect(host.marks['Tesseract']).toBe(1);
      expect(host.icActive[0]).toBe(icBefore);
      expect((host.icActive[0] as unknown as Record<string, unknown>)['marksPlaced']).toBeUndefined();
    });
  });

  // ── Decision 9 — propagation visibility (TargetCardComponent) ──────────

  describe('TargetCardComponent propagation visibility (Decision 9, 2026-09-03)', () => {
    let fixture: ComponentFixture<TargetCardComponent>;
    let component: TargetCardComponent;
    let matrixState: MatrixStateService;
    let host: MatrixHost;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [TargetCardComponent],
        providers: appConfig.providers
      }).compileComponents();

      fixture = TestBed.createComponent(TargetCardComponent);
      component = fixture.componentInstance;
      matrixState = TestBed.inject(MatrixStateService);
      host = new MatrixHost({ id: 'h1', name: 'Ares-7', rating: 4 });
      matrixState.addHost(host);
    });

    it('hasPropagatedMark reflects the target\'s propagatedMarks record', () => {
      const device = new MatrixTarget({ id: 'd1', type: 'device', context: 'host', linkedHostId: host.id });
      component.target = device;
      component.host = host;
      component.activeDeckers = [];
      fixture.detectChanges();
      expect(component.hasPropagatedMark('Tesseract')).toBeFalse();

      device.propagatedMarks['Tesseract'] = true;
      expect(component.hasPropagatedMark('Tesseract')).toBeTrue();
    });

    it("the remove-mark button's tooltip warns that an upstream propagated mark stays, for a target that can propagate", () => {
      const device = new MatrixTarget({ id: 'd1', type: 'device', context: 'host', linkedHostId: host.id });
      device.marks['Tesseract'] = 1;
      const decker = new MatrixParticipant();
      decker.name = 'Tesseract';
      component.target = device;
      component.host = host;
      component.activeDeckers = [decker];
      fixture.detectChanges();

      const removeBtn = fixture.debugElement.query(By.css('.tc-mark-rm')).nativeElement as HTMLButtonElement;
      expect(removeBtn.title).toContain('Ares-7');
      expect(removeBtn.title.toLowerCase()).toContain('stays');
      // Tightened: locks in the tense fix. propagationDestinationNames()
      // (backward-looking, "this already happened") now feeds this tooltip
      // instead of propagationPreview (forward-looking, "this is about to
      // happen") - the old string spliced a present-tense "Also marks: ..."
      // into a past-tense sentence about a mark that already landed.
      expect(removeBtn.title).not.toContain('Also marks');
    });

    it("the remove-mark button's tooltip names BOTH destinations of a two-hop chain, with no cap wording (AC-10, scenario S3)", () => {
      // The single-host test above only ever exercises the one-destination
      // case. Nothing previously asserted the multi-destination form - if
      // the tooltip only ever names one of two upstream icons, the GM has
      // no way to find the second one to correct by hand (this app has no
      // undo; hand-correction is the only path, mark-propagation-preview.md
      // scenario S3).
      const drone = new MatrixTarget({ id: 'dr', name: 'MCT Roto-Drone', type: 'device', context: 'public' });
      const mount = new MatrixTarget({ id: 'mt', name: 'Weapon Mount', type: 'device', context: 'public', parentTargetId: 'dr' });
      const gun = new MatrixTarget({ id: 'gn', name: 'Smartgun', type: 'device', context: 'public', parentTargetId: 'mt' });
      gun.marks['Tesseract'] = 1;
      matrixState.addTarget(null, drone);
      matrixState.addTarget(null, mount);
      matrixState.addTarget(null, gun);
      const decker = new MatrixParticipant();
      decker.name = 'Tesseract';
      component.target = gun;
      component.host = null;
      component.activeDeckers = [decker];
      fixture.detectChanges();

      const removeBtn = fixture.debugElement.query(By.css('.tc-mark-rm')).nativeElement as HTMLButtonElement;
      expect(removeBtn.title).toBe(
        'Remove 1 mark from Tesseract — any mark this propagated upstream (Weapon Mount, MCT Roto-Drone) stays; remove it there if wrong'
      );
      expect(removeBtn.title).not.toContain('Also marks');
      expect(removeBtn.title).not.toContain('at 3');
      expect(removeBtn.title).not.toContain('none added');
      expect(removeBtn.title).not.toContain('already');
    });

    it("the remove-mark button's tooltip is the plain message for a target that cannot propagate (a file)", () => {
      const file = new MatrixTarget({ id: 'f1', type: 'file', context: 'host', linkedHostId: host.id });
      file.marks['Tesseract'] = 1;
      const decker = new MatrixParticipant();
      decker.name = 'Tesseract';
      component.target = file;
      component.host = host;
      component.activeDeckers = [decker];
      fixture.detectChanges();

      const removeBtn = fixture.debugElement.query(By.css('.tc-mark-rm')).nativeElement as HTMLButtonElement;
      expect(removeBtn.title).toBe('Remove 1 mark from Tesseract');
    });

    // ── The retired text preview is gone from the DOM under every condition ──

    it('.tc-propagation-preview does not exist in the rendered DOM (AC-12) - the getters, formatters and span were deleted, not merely hidden', () => {
      const drone = new MatrixTarget({ id: 'dr', name: 'MCT Roto-Drone', type: 'device', context: 'public' });
      const mount = new MatrixTarget({ id: 'mt', name: 'Weapon Mount', type: 'device', context: 'public', parentTargetId: 'dr' });
      const gun = new MatrixTarget({ id: 'gn', name: 'Smartgun', type: 'device', context: 'public', parentTargetId: 'mt' });
      matrixState.addTarget(null, drone);
      matrixState.addTarget(null, mount);
      matrixState.addTarget(null, gun);
      const decker = new MatrixParticipant();
      decker.name = 'Tesseract';
      component.target = gun;
      component.host = null;
      component.activeDeckers = [decker];
      component.selectedDeckerId = 'Tesseract';
      fixture.detectChanges();
      component.openAddMark();
      fixture.detectChanges();

      expect(fixture.debugElement.query(By.css('.tc-propagation-preview'))).toBeNull();
      expect((component as unknown as Record<string, unknown>)['propagationPreview']).toBeUndefined();
      expect((component as unknown as Record<string, unknown>)['propagationPreviewFull']).toBeUndefined();
    });

    // Fix round 2, N4: `HierarchyEditorComponent`'s nested public-target tree
    // indents 18px per level (`hier-public-node`,
    // `hierarchy-editor.component.html`, `marginLeft.px="depth * 18"`),
    // so real available width shrinks as chain depth grows — depth and lost
    // width move together. The reviewer's worst measured case was a chain 4
    // deep in a ~426px left pane (matrix-run-panel.component.css
    // `.matrix-left-pane`, the narrow two-column layout just above the
    // 900px single-column breakpoint). This constant models that lost width
    // so the narrow-case test below reproduces the real worst case rather
    // than an arbitrary number close to its own boundary. Kept verbatim
    // across the highlight change (spec "Test changes required": "KEEP the
    // constants and the fixture builder").
    const HIER_TREE_INDENT_PER_LEVEL_PX = 18;
    const CHAIN_DEPTH_FOR_LAYOUT_TEST = 4;
    const NARROW_LEFT_PANE_WIDTH_PX = 426;
    const EFFECTIVE_NARROW_WIDTH_PX =
      NARROW_LEFT_PANE_WIDTH_PX - HIER_TREE_INDENT_PER_LEVEL_PX * CHAIN_DEPTH_FOR_LAYOUT_TEST; // 354px

    // mark-propagation-highlight-spec.md (2026-09-05): the text preview -
    // Option A, then Option B, then the "+N more above it" abbreviation -
    // is gone entirely, replaced with a highlight on the tree. There is no
    // longer any inline string whose width depends on chain depth or name
    // length, so the truncation problem this constant used to reproduce
    // cannot recur structurally: `.tc-propagation-preview` no longer
    // exists in the template at all (see the test above). This fixture
    // still exists to prove that at the same real worst-case narrow pane
    // width, the confirm/cancel buttons render in-pane on one line -
    // AC-12's positive half.
    const LONG_NEAREST_NAME_LENGTH = 50; // chars

    function buildFourDeepChainFixture(): { clicked: MatrixTarget; nearestName: string } {
      const nearestName = 'N'.repeat(LONG_NEAREST_NAME_LENGTH);
      const names = ['Rooftop-Node', 'Relay-Station', 'Signal-Booster', nearestName];
      const chain = names.map((name, i) => new MatrixTarget({
        id: `layout-t${i}`, name, type: 'device', context: 'public',
        parentTargetId: i > 0 ? `layout-t${i - 1}` : undefined
      }));
      chain.forEach(t => matrixState.addTarget(null, t));
      const clicked = new MatrixTarget({
        id: 'layout-clicked', name: 'Clicked Device', type: 'device', context: 'public',
        parentTargetId: chain[chain.length - 1].id
      });
      matrixState.addTarget(null, clicked);
      const decker = new MatrixParticipant();
      decker.name = 'Tesseract';
      component.target = clicked;
      component.host = null;
      component.activeDeckers = [decker];
      component.selectedDeckerId = 'Tesseract';
      fixture.detectChanges();
      component.openAddMark();
      fixture.detectChanges();
      return { clicked, nearestName };
    }

    it('AC-12: a chain whose nearest icon has a long name renders no propagation text and keeps the ✓/✕ buttons in-pane on one line, at the real worst-case narrow-pane width (real ChromeHeadless layout)', () => {
      buildFourDeepChainFixture();

      // Constrain to the reviewer's measured worst-case width: the narrow
      // two-column left pane (matrix-run-panel.component.css
      // .matrix-left-pane) minus the hierarchy tree's own indent at this
      // chain's depth (N4).
      const wrap = fixture.nativeElement.querySelector('.tc-wrap') as HTMLElement;
      wrap.style.width = `${EFFECTIVE_NARROW_WIDTH_PX}px`;
      wrap.style.overflow = 'hidden';
      fixture.detectChanges();

      const row = wrap.querySelector('.tc-marks-row') as HTMLElement;
      const confirmBtn = wrap.querySelector('.tc-confirm-btn') as HTMLElement;
      const cancelBtn = wrap.querySelector('.tc-cancel-btn') as HTMLElement;

      // No text preview exists anywhere to truncate or overflow.
      expect(wrap.querySelector('.tc-propagation-preview')).toBeNull();

      expect(confirmBtn).not.toBeNull();
      expect(cancelBtn).not.toBeNull();
      // The row stays a single line (does not wrap the buttons underneath),
      // and both buttons render inside the constrained pane, not clipped
      // out of view by .matrix-left-pane's overflow: hidden.
      expect(row.getBoundingClientRect().height).toBeLessThan(40);
      const wrapRight = wrap.getBoundingClientRect().right;
      expect(confirmBtn.getBoundingClientRect().right).toBeLessThanOrEqual(wrapRight + 1);
      expect(cancelBtn.getBoundingClientRect().right).toBeLessThanOrEqual(wrapRight + 1);
      expect(confirmBtn.getBoundingClientRect().width).toBeGreaterThan(0); // actually rendered, not zero-width/clipped
      expect(cancelBtn.getBoundingClientRect().width).toBeGreaterThan(0);
    });

    // ── The emit contract (new test #9, "How the highlight is tested" §7) ──

    it('propagationHighlightChange emits the request/null sequence open -> decker change -> cancel -> open -> confirm -> destroy, and only from event handlers/lifecycle hooks', () => {
      const drone = new MatrixTarget({ id: 'dr', name: 'MCT Roto-Drone', type: 'device', context: 'public' });
      const gun = new MatrixTarget({ id: 'gn', name: 'Smartgun', type: 'device', context: 'public', parentTargetId: 'dr' });
      matrixState.addTarget(null, drone);
      matrixState.addTarget(null, gun);
      const tesseract = new MatrixParticipant();
      tesseract.name = 'Tesseract';
      const slamm = new MatrixParticipant();
      slamm.name = 'Slamm-0';
      component.target = gun;
      component.host = null;
      component.activeDeckers = [tesseract, slamm];
      fixture.detectChanges();

      const emitted: (MarkHighlightRequest | null)[] = [];
      component.propagationHighlightChange.subscribe(req => emitted.push(req));

      component.openAddMark(); // 1: seeds Tesseract, emits a request
      component.onSelectedDeckerChange('Slamm-0'); // 2: emits a request for Slamm-0
      component.cancelAddMark(); // 3: emits null
      component.openAddMark(); // 4: emits a request again
      component.confirmAddMark(); // 5: writes the mark, then emits null

      expect(emitted.length).toBe(5);
      expect(emitted[0]).toEqual({ target: gun, deckerId: 'Tesseract' });
      expect(emitted[1]).toEqual({ target: gun, deckerId: 'Slamm-0' });
      expect(emitted[2]).toBeNull();
      expect(emitted[3]).toEqual({ target: gun, deckerId: 'Slamm-0' });
      expect(emitted[4]).toBeNull();

      // ngOnDestroy: addMarkOpen is already false after confirmAddMark(), so
      // destroying the fixture must not emit a redundant extra null (the
      // ngOnDestroy guard is keyed on addMarkOpen, spec Lifecycle table).
      fixture.destroy();
      expect(emitted.length).toBe(5);
    });

    it('ngOnDestroy emits lifecycleClear (round-6 review, defects 1-3) when the card is destroyed while its own picker is still open (spec Lifecycle table, paths 5-9)', () => {
      const device = new MatrixTarget({ id: 'd1', type: 'device', context: 'public' });
      matrixState.addTarget(null, device);
      const decker = new MatrixParticipant();
      decker.name = 'Tesseract';
      component.target = device;
      component.host = null;
      component.activeDeckers = [decker];
      fixture.detectChanges();

      const emitted: (MarkHighlightRequest | null)[] = [];
      component.propagationHighlightChange.subscribe(req => emitted.push(req));
      let lifecycleClearCount = 0;
      component.lifecycleClear.subscribe(() => lifecycleClearCount++);
      component.openAddMark();
      expect(emitted.length).toBe(1);

      // `lifecycleClear` — not `propagationHighlightChange` — is the event
      // `ngOnDestroy()` fires (round-6 review): it is emitted synchronously
      // (its subscriber must still be alive when it fires; deferring the
      // EMIT itself, an earlier version of this fix, found the parent's
      // subscription already torn down by the time a later microtask ran),
      // but carries no payload — it is `HierarchyEditorComponent.onLifecycleClear()`
      // that defers the actual state mutation this event triggers.
      fixture.destroy();
      expect(lifecycleClearCount).toBe(1);
      expect(emitted.length).toBe(1); // propagationHighlightChange itself never fires here
    });

    it('ngOnChanges closes the picker and emits lifecycleClear (round-6 review) when availableDeckers empties while the picker is open (path 10 - the non-obvious clear path)', () => {
      const device = new MatrixTarget({ id: 'd1', type: 'device', context: 'public' });
      matrixState.addTarget(null, device);
      const tesseract = new MatrixParticipant();
      tesseract.name = 'Tesseract';
      const slamm = new MatrixParticipant();
      slamm.name = 'Slamm-0';
      component.target = device;
      component.host = null;
      component.activeDeckers = [tesseract, slamm];
      fixture.detectChanges();

      const emitted: (MarkHighlightRequest | null)[] = [];
      component.propagationHighlightChange.subscribe(req => emitted.push(req));
      let lifecycleClearCount = 0;
      component.lifecycleClear.subscribe(() => lifecycleClearCount++);
      component.openAddMark();
      expect(component.addMarkOpen).toBeTrue();

      // Both deckers cap out on this icon elsewhere (e.g. session sync /
      // another GM action) - activeDeckers itself does not need to change,
      // only the marks record availableDeckers filters on. `ngOnChanges` is
      // called directly, exactly as Angular would call it from a REAL
      // `@Input` reassignment on a parent template's binding — this bare
      // `ComponentFixture<TargetCardComponent>` has no such parent, so it
      // can only verify the emit CONTRACT (spec "How the highlight is
      // tested" §7). The REAL rendered-DOM coverage for this exact defect —
      // driven by an actual `@Input` reassignment through
      // `HierarchyEditorComponent`'s own template binding, with real change
      // detection and no NG0100 — is
      // 'Defect 2: activeDeckers emptying while the picker is open clears
      // the highlight cleanly, with no NG0100' below.
      device.marks['Tesseract'] = 3;
      device.marks['Slamm-0'] = 3;
      component.ngOnChanges({});

      expect(component.addMarkOpen).toBeFalse();
      // `lifecycleClear`, not `propagationHighlightChange`, is what this
      // path fires (round-6 review) — its consumer, not this card, decides
      // when the resulting state mutation actually lands.
      expect(lifecycleClearCount).toBe(1);
      expect(emitted.length).toBe(1); // only the original openAddMark() emit
    });

    // ── N-6 (round-7 review): lifecycle path 11 — `target` @Input replaced
    //    on a reused card instance — had no test at all. ──

    // Round-8 review, Defect D-9: this test drives `ngOnChanges({ target: {}
    // } as never)` by hand on a bare `ComponentFixture<TargetCardComponent>`
    // with no parent binding — the same candid limitation path 10's test
    // carries above. It verifies the emit CONTRACT only (spec "How the
    // highlight is tested" §7): that `ngOnChanges()` reacts correctly to a
    // `changes['target']` entry, exactly as Angular would call it from a
    // REAL `@Input` reassignment on a parent template's binding. It is not
    // rendered-DOM coverage of a real reused-instance scenario (e.g.
    // `@for (t of host.targets; track t.id)` recycling a component
    // instance) — there is no existing rendered-DOM test for that scenario
    // in this suite.
    it('ngOnChanges closes the picker and emits lifecycleClear when the target @Input is replaced on a reused card instance (path 11)', () => {
      const deviceA = new MatrixTarget({ id: 'd1', type: 'device', context: 'public' });
      const deviceB = new MatrixTarget({ id: 'd2', type: 'device', context: 'public' });
      matrixState.addTarget(null, deviceA);
      matrixState.addTarget(null, deviceB);
      const tesseract = new MatrixParticipant();
      tesseract.name = 'Tesseract';
      component.target = deviceA;
      component.host = null;
      component.activeDeckers = [tesseract];
      fixture.detectChanges();

      const emitted: (MarkHighlightRequest | null)[] = [];
      component.propagationHighlightChange.subscribe(req => emitted.push(req));
      let lifecycleClearCount = 0;
      component.lifecycleClear.subscribe(() => lifecycleClearCount++);
      component.openAddMark();
      expect(component.addMarkOpen).toBeTrue();

      // Simulate Angular reusing this exact component instance for a
      // DIFFERENT target — e.g. `@for (t of host.targets; track t.id)`
      // reusing a slot because two different `MatrixTarget` objects share an
      // id across a change-detection cycle. `availableDeckers` alone would
      // not close this picker (deviceB has the same room as deviceA), so
      // this exercises the `changes['target']` branch specifically, not the
      // path-10 `availableDeckers.length === 0` branch above.
      component.target = deviceB;
      component.ngOnChanges({ target: {} } as never);

      expect(component.addMarkOpen).toBeFalse();
      expect(lifecycleClearCount).toBe(1);
      expect(emitted.length).toBe(1); // only the original openAddMark() emit
    });
  });

  // ── Decision 9 + mark-propagation-highlight-spec.md — the highlight itself ──

  describe('HierarchyEditorComponent propagation highlight (mark-propagation-highlight-spec.md, 2026-09-05)', () => {
    let fixture: ComponentFixture<HierarchyEditorComponent>;
    let component: HierarchyEditorComponent;
    let matrixState: MatrixStateService;
    let host: MatrixHost;
    let decker: MatrixParticipant;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [HierarchyEditorComponent],
        providers: appConfig.providers
      }).compileComponents();

      fixture = TestBed.createComponent(HierarchyEditorComponent);
      component = fixture.componentInstance;
      matrixState = TestBed.inject(MatrixStateService);
      decker = new MatrixParticipant();
      decker.name = 'Tesseract';
      component.activeDeckers = [decker];

      host = new MatrixHost({ id: 'h1', name: 'Ares-7', rating: 4 });
      matrixState.addHost(host);
      fixture.detectChanges();
    });

    /** Opens a public target's +Mark control by driving the card directly, the same way the DOM click would. */
    function openPickerOn(targetId: string): TargetCardComponent {
      const card = fixture.debugElement
        .queryAll(By.directive(TargetCardComponent))
        .map(de => de.componentInstance as TargetCardComponent)
        .find(c => c.target.id === targetId)!;
      card.openAddMark();
      fixture.detectChanges();
      return card;
    }

    function highlightClasses(): Element[] {
      return Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.hier-prop-landing, .hier-prop-capped')
      );
    }

    // ── S1 — Ordinary: smartgun -> mount -> drone chain (AC-1, AC-2, AC-10, AC-11) ──

    it('S1: opening +Mark on the smartgun highlights the mount and the drone, landing, with distinct rails and no highlight on the clicked icon itself', () => {
      const drone = new MatrixTarget({ id: 'dr', name: 'MCT Roto-Drone', type: 'device', context: 'public' });
      const mount = new MatrixTarget({ id: 'mt', name: 'Weapon Mount', type: 'device', context: 'public', parentTargetId: 'dr' });
      const gun = new MatrixTarget({ id: 'gn', name: 'Smartgun', type: 'device', context: 'public', parentTargetId: 'mt' });
      matrixState.addTarget(null, drone);
      matrixState.addTarget(null, mount);
      matrixState.addTarget(null, gun);
      fixture.detectChanges();

      const card = openPickerOn('gn');

      const mtNode = fixture.nativeElement.querySelector("[data-target-id='mt']") as HTMLElement;
      const drNode = fixture.nativeElement.querySelector("[data-target-id='dr']") as HTMLElement;
      const gnNode = fixture.nativeElement.querySelector("[data-target-id='gn']") as HTMLElement;

      expect(mtNode.classList).toContain('hier-prop-landing');
      expect(drNode.classList).toContain('hier-prop-landing');
      expect(gnNode.classList).not.toContain('hier-prop-landing');
      expect(gnNode.classList).not.toContain('hier-prop-capped');

      // AC-1/AC-2: highlighted count equals the number of records addMark()
      // will change (mount + drone = 2), and the highlighted ids match.
      expect(component.highlightStateFor('mt')).toBe('landing');
      expect(component.highlightStateFor('dr')).toBe('landing');
      expect(component.highlightStateFor('gn')).toBeNull();

      // AC-11: marker glyph and accessible name, no reference to colour.
      const markers = fixture.nativeElement.querySelectorAll('.tc-prop-marker');
      expect(markers.length).toBe(2);
      for (const marker of Array.from(markers) as HTMLElement[]) {
        expect(marker.textContent?.trim()).toBe('▲');
        expect(marker.getAttribute('aria-label')).toBeTruthy();
      }
      expect(fixture.nativeElement.querySelector("[data-target-id='gn'] .tc-prop-marker")).toBeNull();
      expect(fixture.nativeElement.querySelectorAll('.tc-propagation-preview').length).toBe(0);

      // AC-10: geometry - each ancestor's node rect vertically contains the
      // clicked card's marks-row rect, at a distinct x each.
      const gnMarksRow = gnNode.querySelector('.tc-marks-row') as HTMLElement;
      const gnRect = gnMarksRow.getBoundingClientRect();
      const mtRect = mtNode.getBoundingClientRect();
      const drRect = drNode.getBoundingClientRect();
      expect(mtRect.top).toBeLessThanOrEqual(gnRect.top);
      expect(mtRect.bottom).toBeGreaterThanOrEqual(gnRect.bottom);
      expect(drRect.top).toBeLessThanOrEqual(gnRect.top);
      expect(drRect.bottom).toBeGreaterThanOrEqual(gnRect.bottom);
      expect(drRect.left).toBeLessThan(mtRect.left);
      expect(mtRect.left).toBeLessThan(gnNode.getBoundingClientRect().left);

      // Confirm: the write path is untouched (AC-17's choke point).
      card.confirmAddMark();
      fixture.detectChanges();

      expect(gun.marks['Tesseract']).toBe(1);
      expect(mount.marks['Tesseract']).toBe(1);
      expect(drone.marks['Tesseract']).toBe(1);
      expect(mount.propagatedMarks['Tesseract']).toBeTrue();
      expect(drone.propagatedMarks['Tesseract']).toBeTrue();
      expect(gun.propagatedMarks['Tesseract']).toBeUndefined();
      expect(highlightClasses().length).toBe(0);
    });

    // ── S2 — capped ancestor mid-chain does not end the chain (AC-3, AC-11) ──

    it('S2: a capped ancestor mid-chain renders capped/dashed, and the chain still highlights the reachable ancestor beyond it', () => {
      const drone = new MatrixTarget({ id: 'dr', name: 'MCT Roto-Drone', type: 'device', context: 'public' });
      const mount = new MatrixTarget({ id: 'mt', name: 'Weapon Mount', type: 'device', context: 'public', parentTargetId: 'dr' });
      const gun = new MatrixTarget({ id: 'gn', name: 'Smartgun', type: 'device', context: 'public', parentTargetId: 'mt' });
      mount.marks['Tesseract'] = 3;
      matrixState.addTarget(null, drone);
      matrixState.addTarget(null, mount);
      matrixState.addTarget(null, gun);
      fixture.detectChanges();

      const card = openPickerOn('gn');

      const mtNode = fixture.nativeElement.querySelector("[data-target-id='mt']") as HTMLElement;
      const drNode = fixture.nativeElement.querySelector("[data-target-id='dr']") as HTMLElement;

      expect(mtNode.classList).toContain('hier-prop-capped');
      expect(mtNode.classList).not.toContain('hier-prop-landing');
      expect(drNode.classList).toContain('hier-prop-landing');
      expect(drNode.classList).not.toContain('hier-prop-capped');

      const mtMarker = mtNode.querySelector('.tc-prop-marker') as HTMLElement;
      const drMarker = drNode.querySelector('.tc-prop-marker') as HTMLElement;
      expect(mtMarker.textContent?.trim()).toBe('△');
      expect(drMarker.textContent?.trim()).toBe('▲');

      expect(getComputedStyle(mtNode).borderLeftStyle).toBe('dashed');
      expect(getComputedStyle(drNode).borderLeftStyle).toBe('solid');
      // Only the landing state carries the extra inset box-shadow (spec
      // "Rendering" §4) — the capped rail's non-colour cue is the
      // border-left-style/colour change asserted above, not a shadow.
      expect(getComputedStyle(mtNode).boxShadow).toBe('none');
      expect(getComputedStyle(drNode).boxShadow).toContain('255, 179, 64');

      card.confirmAddMark();
      fixture.detectChanges();

      expect(gun.marks['Tesseract']).toBe(1);
      expect(mount.marks['Tesseract']).toBe(3); // absorbed, unchanged
      expect(drone.marks['Tesseract']).toBe(1); // still reached — the cap is not a stop
    });

    // ── Round-8 review, Defect D-1: hovering a highlighted icon must not
    //    erase its tint. `.tc-wrap:hover .tc-info-row` (specificity 0,3,0)
    //    used to beat a bare `.tc-info-row.tc-prop-*` (0,2,0) outright,
    //    which is why a real Chrome measurement found a hovered landing row
    //    computing `rgb(10, 26, 10)` (the hover colour) instead of the
    //    amber tint, and a hovered capped row losing its tint while its
    //    dashed outline (a property `:hover` never sets) survived. ──

    it('D-1: hovering a highlighted device row does not erase its landing or capped tint', () => {
      const drone = new MatrixTarget({ id: 'dr', name: 'MCT Roto-Drone', type: 'device', context: 'public' });
      const mount = new MatrixTarget({ id: 'mt', name: 'Weapon Mount', type: 'device', context: 'public', parentTargetId: 'dr' });
      const gun = new MatrixTarget({ id: 'gn', name: 'Smartgun', type: 'device', context: 'public', parentTargetId: 'mt' });
      mount.marks['Tesseract'] = 3; // capped, so this fixture covers both states at once
      matrixState.addTarget(null, drone);
      matrixState.addTarget(null, mount);
      matrixState.addTarget(null, gun);
      fixture.detectChanges();

      openPickerOn('gn');

      const mtWrap = (fixture.nativeElement.querySelector("[data-target-id='mt'] .tc-wrap")) as HTMLElement;
      const drWrap = (fixture.nativeElement.querySelector("[data-target-id='dr'] .tc-wrap")) as HTMLElement;
      const mtRow = mtWrap.querySelector('.tc-info-row') as HTMLElement;
      const drRow = drWrap.querySelector('.tc-info-row') as HTMLElement;

      // Unhovered: the tint is present (sanity, not the point of this test).
      expect(getComputedStyle(drRow).backgroundColor).toBe('rgba(255, 179, 64, 0.14)');
      expect(getComputedStyle(mtRow).backgroundColor).toBe('rgba(255, 179, 64, 0.06)');
      expect(getComputedStyle(mtRow).outlineStyle).toBe('dashed');

      withSimulatedHover('.tc-wrap', hoverClass => {
        drWrap.classList.add(hoverClass);
        mtWrap.classList.add(hoverClass);

        expect(getComputedStyle(drRow).backgroundColor).toBe('rgba(255, 179, 64, 0.14)'); // landing survives hover
        expect(getComputedStyle(mtRow).backgroundColor).toBe('rgba(255, 179, 64, 0.06)'); // capped survives hover
        expect(getComputedStyle(mtRow).outlineStyle).toBe('dashed'); // was already surviving; still does

        drWrap.classList.remove(hoverClass);
        mtWrap.classList.remove(hoverClass);
      });
    });

    it('D-1: hovering a highlighted host header does not erase its landing or capped tint', () => {
      const device = new MatrixTarget({ id: 'd1', type: 'device', context: 'host', linkedHostId: host.id });
      host.targets.push(device);
      component.toggleHost(host.id);
      fixture.detectChanges();

      openPickerOn('d1');

      const hostHeader = fixture.nativeElement.querySelector('.hier-host-header') as HTMLElement;
      expect(getComputedStyle(hostHeader).backgroundColor).toBe('rgba(255, 179, 64, 0.14)');

      withSimulatedHover('.hier-host-header', hoverClass => {
        hostHeader.classList.add(hoverClass);
        expect(getComputedStyle(hostHeader).backgroundColor).toBe('rgba(255, 179, 64, 0.14)');
        hostHeader.classList.remove(hoverClass);
      });
    });

    // ── AC-4 — every destination capped ──

    it('AC-4: when every destination is capped, both render capped and neither renders landing', () => {
      const drone = new MatrixTarget({ id: 'dr', name: 'MCT Roto-Drone', type: 'device', context: 'public' });
      const mount = new MatrixTarget({ id: 'mt', name: 'Weapon Mount', type: 'device', context: 'public', parentTargetId: 'dr' });
      const gun = new MatrixTarget({ id: 'gn', name: 'Smartgun', type: 'device', context: 'public', parentTargetId: 'mt' });
      mount.marks['Tesseract'] = 3;
      drone.marks['Tesseract'] = 3;
      matrixState.addTarget(null, drone);
      matrixState.addTarget(null, mount);
      matrixState.addTarget(null, gun);
      fixture.detectChanges();

      openPickerOn('gn');

      expect(component.highlightStateFor('mt')).toBe('capped');
      expect(component.highlightStateFor('dr')).toBe('capped');
      const anyLanding = fixture.nativeElement.querySelectorAll('.hier-prop-landing');
      expect(anyLanding.length).toBe(0);
    });

    // ── AC-5 — decker switch changes the rendered states live ──

    it('AC-5: switching the selected decker in the picker changes the rendered highlight states with no further GM action', () => {
      const mount = new MatrixTarget({ id: 'mt', name: 'Weapon Mount', type: 'device', context: 'public' });
      const gun = new MatrixTarget({ id: 'gn', name: 'Smartgun', type: 'device', context: 'public', parentTargetId: 'mt' });
      mount.marks['Tesseract'] = 3; // capped for Tesseract, open for Slamm-0
      matrixState.addTarget(null, mount);
      matrixState.addTarget(null, gun);
      const slamm = new MatrixParticipant();
      slamm.name = 'Slamm-0';
      component.activeDeckers = [decker, slamm];
      fixture.detectChanges();

      const card = openPickerOn('gn');
      expect(component.highlightStateFor('mt')).toBe('capped');

      card.onSelectedDeckerChange('Slamm-0');
      fixture.detectChanges();

      expect(component.highlightStateFor('mt')).toBe('landing');
      const mtNode = fixture.nativeElement.querySelector("[data-target-id='mt']") as HTMLElement;
      expect(mtNode.classList).toContain('hier-prop-landing');
    });

    // ── AC-8 — non-device targets never highlight ──

    it('AC-8: no highlight is produced for a file, even inside a host, with a decker selected and unblocked', () => {
      const file = new MatrixTarget({ id: 'f1', type: 'file', context: 'host', linkedHostId: host.id });
      host.targets.push(file);
      component.toggleHost(host.id);
      fixture.detectChanges();

      const card = fixture.debugElement
        .queryAll(By.directive(TargetCardComponent))
        .map(de => de.componentInstance as TargetCardComponent)
        .find(c => c.target.id === 'f1')!;
      // A decker must actually be selected and unblocked, or this would
      // pass vacuously without ever reaching previewPropagation() (the
      // same "wrong reason" trap flagged at the retired test's
      // :1673-1680 comment - kept here verbatim in spirit).
      card.selectedDeckerId = 'Tesseract';
      card.openAddMark();
      fixture.detectChanges();

      expect(highlightClasses().length).toBe(0);
      expect(fixture.nativeElement.querySelectorAll('.tc-prop-marker').length).toBe(0);
    });

    // ── AC-9 — device with nothing to propagate to, both halves ──

    it('AC-9: no highlight is produced for a device with no linkedHostId and no parent', () => {
      const device = new MatrixTarget({ id: 'd1', type: 'device', context: 'public' });
      matrixState.addTarget(null, device);
      fixture.detectChanges();

      openPickerOn('d1');

      expect(highlightClasses().length).toBe(0);
    });

    it('AC-9 (second half): no highlight is produced for a device parented to a resolvable non-device (file) parent', () => {
      const fileParent = new MatrixTarget({ id: 'fp1', name: 'Some File', type: 'file', context: 'public' });
      const device = new MatrixTarget({ id: 'd1', type: 'device', context: 'public', parentTargetId: 'fp1' });
      matrixState.addTarget(null, fileParent);
      matrixState.addTarget(null, device);
      fixture.detectChanges();

      openPickerOn('d1');

      expect(highlightClasses().length).toBe(0);
    });

    // ── AC-6 — nothing highlighted while blocked ──

    it('AC-6: while addMarkBlockedReason is non-null (single decker, already capped), no element carries a highlight class and no marker renders', () => {
      const device = new MatrixTarget({ id: 'd1', type: 'device', context: 'host', linkedHostId: host.id });
      host.targets.push(device);
      component.toggleHost(host.id);
      fixture.detectChanges();

      const card = fixture.debugElement
        .queryAll(By.directive(TargetCardComponent))
        .map(de => de.componentInstance as TargetCardComponent)
        .find(c => c.target.id === 'd1')!;
      for (let i = 0; i < 3; i++) {
        card.openAddMark();
        card.confirmAddMark();
      }
      fixture.detectChanges();
      expect(device.marks['Tesseract']).toBe(3);

      card.openAddMark(); // openAddMark() does not reseed selectedDeckerId — it is already truthy
      fixture.detectChanges();

      expect(card.selectedDeckerId).toBe('Tesseract');
      expect(card.addMarkBlockedReason).not.toBeNull();
      // NOTE (carried over from the retired test's review-defect-3 comment):
      // with only one decker, availableDeckers is now empty, so
      // `@if (availableDeckers.length > 0)` removes the whole +Mark group
      // from this card's own DOM — the assertion below is therefore true
      // for the wrong reason on ITS OWN card (nothing to click at all).
      // The real guard for "the highlight specifically is suppressed while
      // the control stays visible" is the two-decker test below (S4).
      expect(highlightClasses().length).toBe(0);
      expect(fixture.nativeElement.querySelectorAll('.tc-prop-marker').length).toBe(0);
    });

    // ── S4 — the four-tap capped-decker sequence, mid-combat (AC-6, AC-7) ──

    it('S4: a capped decker suppresses the highlight; selecting the decker with room reveals it', () => {
      const doorController = new MatrixTarget({ id: 'dc', name: 'Door Controller', type: 'device', context: 'public' });
      const maglock = new MatrixTarget({ id: 'ml', name: 'Maglock', type: 'device', context: 'public', parentTargetId: 'dc' });
      maglock.marks['Tesseract'] = 3;
      matrixState.addTarget(null, doorController);
      matrixState.addTarget(null, maglock);
      const slamm = new MatrixParticipant();
      slamm.name = 'Slamm-0';
      component.activeDeckers = [decker, slamm];
      fixture.detectChanges();

      const card = fixture.debugElement
        .queryAll(By.directive(TargetCardComponent))
        .map(de => de.componentInstance as TargetCardComponent)
        .find(c => c.target.id === 'ml')!;
      card.selectedDeckerId = 'Tesseract'; // still selected from a previous placement
      card.openAddMark();
      fixture.detectChanges();

      expect(card.availableDeckers.map(d => d.name)).toEqual(['Slamm-0']);
      expect(card.addMarkBlockedReason).toBe('Tesseract already holds the maximum 3 marks on this icon (p. 236)');
      expect(card.canConfirmAddMark).toBeFalse();
      // The group is genuinely still rendered — a second decker has room —
      // so these DOM assertions are real, unlike the single-decker AC-6
      // test above.
      const mlNode = fixture.nativeElement.querySelector("[data-target-id='ml']") as HTMLElement;
      expect(mlNode.querySelector('.tc-add-mark-group')).not.toBeNull();
      expect(mlNode.querySelector('.tc-add-mark-blocked')).not.toBeNull();
      // No highlight promising a propagation that cannot occur.
      expect(highlightClasses().length).toBe(0);
      expect(fixture.nativeElement.querySelectorAll('.tc-prop-marker').length).toBe(0);

      card.onSelectedDeckerChange('Slamm-0');
      fixture.detectChanges();

      const dcNode = fixture.nativeElement.querySelector("[data-target-id='dc']") as HTMLElement;
      expect(dcNode.classList).toContain('hier-prop-landing');
      expect(card.canConfirmAddMark).toBeTrue();

      card.confirmAddMark();
      fixture.detectChanges();

      expect(maglock.marks['Slamm-0']).toBe(1);
      expect(doorController.marks['Slamm-0']).toBe(1);
      expect(highlightClasses().length).toBe(0);
    });

    // ── AC-7 — host destination, landing and capped ──

    it('AC-7: a device inside a host highlights the host header, landing; the target row itself is never highlighted', () => {
      const device = new MatrixTarget({ id: 'd1', type: 'device', context: 'host', linkedHostId: host.id });
      host.targets.push(device);
      component.toggleHost(host.id);
      fixture.detectChanges();

      openPickerOn('d1');

      const hostHeader = fixture.nativeElement.querySelector('.hier-host-header') as HTMLElement;
      const hostNode = fixture.nativeElement.querySelector('.hier-host-node') as HTMLElement;
      expect(hostHeader.classList).toContain('hier-prop-landing');
      expect(hostNode.classList).toContain('hier-prop-landing');
      const marker = hostHeader.querySelector('.hier-prop-marker') as HTMLElement;
      expect(marker.textContent?.trim()).toBe('▲');
      expect(marker.getAttribute('aria-label')).toBeTruthy();
      expect(getComputedStyle(hostNode).boxShadow).toContain('255, 179, 64');
      // A host target is never itself a destination (branch (b) only ever
      // emits public targets, branch (a) only ever emits hosts) — the
      // binding exists on it anyway (spec "Reachability finding"), but it
      // must never actually light up.
      const targetCardRow = fixture.nativeElement.querySelector("app-target-card .tc-info-row") as HTMLElement;
      expect(targetCardRow.classList).not.toContain('hier-prop-landing');
      expect(targetCardRow.classList).not.toContain('tc-prop-landing');
    });

    it('AC-7: a capped host renders the capped state, not landing', () => {
      const device = new MatrixTarget({ id: 'd1', type: 'device', context: 'host', linkedHostId: host.id });
      host.targets.push(device);
      host.marks['Tesseract'] = 3;
      component.toggleHost(host.id);
      fixture.detectChanges();

      openPickerOn('d1');

      const hostHeader = fixture.nativeElement.querySelector('.hier-host-header') as HTMLElement;
      const hostNode = fixture.nativeElement.querySelector('.hier-host-node') as HTMLElement;
      expect(hostHeader.classList).toContain('hier-prop-capped');
      expect(hostHeader.classList).not.toContain('hier-prop-landing');
      expect(hostNode.classList).toContain('hier-prop-capped');
      expect(hostNode.classList).not.toContain('hier-prop-landing');
      const marker = hostHeader.querySelector('.hier-prop-marker') as HTMLElement;
      expect(marker.textContent?.trim()).toBe('△');

      // Round-8 review, Defect D-4b: N-10's dashed host rail
      // (`.hier-host-node.hier-prop-capped::before`) had no computed-style
      // assertion anywhere in the suite — only its class name was checked.
      // Mirrors the device rail's own capped/landing computed-style pair
      // (S2, above: `getComputedStyle(mtNode).borderLeftStyle` /
      // `.boxShadow`). The capped host rail is a `::before` pseudo-element
      // (`hierarchy-editor.component.css`, N-10's comment), not the node's
      // own border, because `border-left` on `.hier-host-node` is reserved
      // for `.hier-host-active`.
      expect(getComputedStyle(hostNode).boxShadow).toBe('none');
      const cappedRail = getComputedStyle(hostNode, '::before');
      expect(cappedRail.borderLeftStyle).toBe('dashed');
      expect(cappedRail.borderLeftColor).toContain('255, 179, 64');
    });

    // ── Round-8 review, Defect D-5 ────────────────────────────────────────

    it('D-5: clicking the host marker glyph does not collapse the host (N-8\'s stopPropagation guard)', () => {
      const device = new MatrixTarget({ id: 'd1', type: 'device', context: 'host', linkedHostId: host.id });
      host.targets.push(device);
      component.toggleHost(host.id);
      fixture.detectChanges();

      openPickerOn('d1');

      const marker = fixture.nativeElement.querySelector('.hier-host-header .hier-prop-marker') as HTMLElement;
      expect(marker).not.toBeNull();
      expect(component.isHostExpanded(host.id)).toBeTrue();

      // The marker sits inside `.hier-host-header`, whose own (click)
      // handler collapses the host (`toggleHost()`). Without N-8's
      // `(click)="$event.stopPropagation()"` on the marker itself, a tap
      // meant to read the marker's tooltip would bubble to the header and
      // collapse the host instead — destroying the very picker/highlight
      // the GM was just looking at.
      marker.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      fixture.detectChanges();

      expect(component.isHostExpanded(host.id)).toBeTrue(); // unchanged — did not collapse
    });

    // ── S8 — the host case, collapsed and expanded ──

    it('S8: a host target is not rendered while its host is collapsed; expanding and opening +Mark highlights the host; collapsing again clears it', fakeAsync(() => {
      const cam = new MatrixTarget({ id: 'cam', type: 'device', context: 'host', linkedHostId: host.id });
      host.targets.push(cam);
      fixture.detectChanges(); // expandedHosts starts empty (ts) — host starts collapsed

      expect(fixture.debugElement.query(By.directive(TargetCardComponent))).toBeNull();
      expect(highlightClasses().length).toBe(0);

      component.toggleHost(host.id);
      fixture.detectChanges();
      openPickerOn('cam');

      const hostHeader = fixture.nativeElement.querySelector('.hier-host-header') as HTMLElement;
      expect(hostHeader.classList).toContain('hier-prop-landing');
      expect(hostHeader.querySelector('.tc-prop-marker, .hier-prop-marker')).not.toBeNull();

      // Genuine collapse case (spec Lifecycle table path 7): this destroys
      // `cam`'s own card, whose own `ngOnDestroy` clears the highlight,
      // deferred past this change-detection pass (round-6 review, defects
      // 1-3) — `toggleHost()` itself no longer touches highlight state at
      // all (the removed Defect-3 hack).
      expect(() => {
        component.toggleHost(host.id); // collapse again while the picker is open
        fixture.detectChanges();
      }).not.toThrow(); // no NG0100

      tick(); // flush the deferred clearing emit
      fixture.detectChanges();

      expect(fixture.debugElement.query(By.directive(TargetCardComponent))).toBeNull();
      expect(highlightClasses().length).toBe(0);
    }));

    // ── S5 (defensive, component level) — both host and parent-chain branches fire for one target ──

    it('S5 (component level): both the host branch and the parent-chain branch highlight for one target; the host is not a DOM ancestor of the clicked card so the rail cue does not apply to it', () => {
      // Not reachable through the UI today (a public target's form never
      // sets linkedHostId), but MatrixTarget's constructor has no
      // validation stopping this shape (e.g. via updateTarget()).
      const rooftop = new MatrixTarget({ id: 'p1', name: 'Rooftop Node', type: 'device', context: 'public' });
      const odd = new MatrixTarget({
        id: 't1', name: 'Odd Device', type: 'device', context: 'public',
        linkedHostId: host.id, parentTargetId: 'p1'
      });
      matrixState.addTarget(null, rooftop);
      matrixState.addTarget(null, odd);
      fixture.detectChanges();

      component.onPropagationHighlightChange({ target: odd, deckerId: 'Tesseract' });
      fixture.detectChanges();

      expect(component.highlightStateFor(host.id)).toBe('landing');
      expect(component.highlightStateFor('p1')).toBe('landing');
      // The host node lives in a completely different section of the tree
      // from `odd`'s `.hier-public-node` — there is no DOM ancestor
      // relationship between them, so no rail visually connects the two,
      // even though both are correctly flagged at the state level. This is
      // residual risk 2 from the spec ("One genuinely unreachable case"),
      // restated for the one shape that IS reachable off the happy path.
      const hostNode = fixture.nativeElement.querySelector('.hier-host-node') as HTMLElement | null;
      const rooftopNode = fixture.nativeElement.querySelector("[data-target-id='p1']") as HTMLElement;
      if (hostNode) {
        expect(hostNode.contains(rooftopNode)).toBeFalse();
        expect(rooftopNode.contains(hostNode)).toBeFalse();
      }
    });

    // ── AC-18 — malformed cycle terminates, component-state level ──

    it('AC-18: highlightStateFor() terminates and does not throw for a node reached via a malformed parent cycle (renders nowhere in the tree, so asserted at state level)', () => {
      const a = new MatrixTarget({ id: 'a', name: 'A-Device', type: 'device', context: 'public', parentTargetId: 'b' });
      const b = new MatrixTarget({ id: 'b', name: 'B-Device', type: 'device', context: 'public', parentTargetId: 'a' }); // cycle
      matrixState.addTarget(null, a);
      matrixState.addTarget(null, b);

      // childrenOf(null) matches neither a nor b (each has a parent), so
      // this fixture renders no node at all — confirmed directly.
      expect(component.childrenOf(null).length).toBe(0);

      expect(() => component.onPropagationHighlightChange({ target: a, deckerId: 'Tesseract' })).not.toThrow();
      expect(component.highlightStateFor('b')).toBe('landing');
      expect(component.highlightStateFor('a')).toBeNull();
    });

    // ── AC-15 — purity: reading highlight accessors mutates nothing ──

    it('AC-15: reading highlightStateFor() and propagationDestinationNames() mutates nothing and fires no stateChange$', () => {
      const drone = new MatrixTarget({ id: 'dr', name: 'MCT Roto-Drone', type: 'device', context: 'public' });
      const mount = new MatrixTarget({ id: 'mt', name: 'Weapon Mount', type: 'device', context: 'public', parentTargetId: 'dr' });
      const gun = new MatrixTarget({ id: 'gn', name: 'Smartgun', type: 'device', context: 'public', parentTargetId: 'mt' });
      matrixState.addTarget(null, drone);
      matrixState.addTarget(null, mount);
      matrixState.addTarget(null, gun);
      fixture.detectChanges();

      const card = openPickerOn('gn');

      let fireCount = 0;
      matrixState.stateChange$.subscribe(() => fireCount++);

      void component.highlightStateFor('mt');
      void component.highlightStateFor('dr');
      void component.highlightStateFor('gn');
      void card.propagationDestinationNames();

      expect(fireCount).toBe(0);
      expect(gun.marks['Tesseract']).toBeUndefined();
      expect(mount.marks['Tesseract']).toBeUndefined();
      expect(drone.marks['Tesseract']).toBeUndefined();
      expect(mount.propagatedMarks['Tesseract']).toBeUndefined();
      expect(drone.propagatedMarks['Tesseract']).toBeUndefined();
    });

    // ── AC-13 — layout neutrality: opening the picker changes no geometry ──

    it('AC-13: opening the picker changes no .hier-public-node or .tc-info-row geometry anywhere in the tree, other than the +Mark group\'s own open/closed swap', () => {
      const drone = new MatrixTarget({ id: 'dr', name: 'MCT Roto-Drone', type: 'device', context: 'public' });
      const mount = new MatrixTarget({ id: 'mt', name: 'Weapon Mount', type: 'device', context: 'public', parentTargetId: 'dr' });
      const gun = new MatrixTarget({ id: 'gn', name: 'Smartgun', type: 'device', context: 'public', parentTargetId: 'mt' });
      matrixState.addTarget(null, drone);
      matrixState.addTarget(null, mount);
      matrixState.addTarget(null, gun);
      // Defect 6 (round-6 review): the original version of this test had
      // nothing rendered below `gn` in Public Space, so it passed even
      // though its `top`-exemption logic was incoherent — a swap-driven
      // height change on `gn`'s own row necessarily pushes down the `top`
      // of anything that renders AFTER `gn` in document order, not just
      // `gn` and its ancestors' `height`. `camera` (an unrelated
      // top-level device) makes that case reachable: it renders after the
      // whole `dr -> mt -> gn` chain, so its `.hier-public-node`'s `top`
      // must be allowed to shift, exactly reproducing the reviewer's
      // measured failure (`Expected 147.5... to be close to 149.5...`)
      // without touching the feature.
      const camera = new MatrixTarget({ id: 'cam', name: 'Camera', type: 'device', context: 'public' });
      matrixState.addTarget(null, camera);
      // N-5 (round-7 review): the host-destination path — the only path
      // that puts `hier-prop-landing`/`hier-prop-capped` on a
      // `.hier-host-node`/`.hier-host-header` rather than a card's own
      // `.tc-info-row` — was never included in this snapshot at all, so a
      // `padding`/`border` regression on either host cue would ship green.
      // An expanded host with a device inside makes both elements present
      // and non-empty in the DOM (a collapsed or empty host renders neither
      // the header's full content nor the body).
      const hostDevice = new MatrixTarget({ id: 'hdv', name: 'Host Device', type: 'device', context: 'host', linkedHostId: host.id });
      host.targets.push(hostDevice);
      component.toggleHost(host.id);
      fixture.detectChanges();

      // Flake root cause (diagnosed by measuring `document.body`'s own
      // `getBoundingClientRect()` alongside the tree's): this fixture (155px
      // of fixed Karma/Jasmine chrome + this test's own ~390px-tall tree) is
      // routinely taller than the headless browser's small test viewport.
      // Karma runs the entire suite in one long-lived page, and by the time
      // this test runs the window is frequently already scrolled to the
      // bottom (a leftover position from whatever earlier test last grew the
      // page, never reset — the window's scroll position is global state
      // Angular's per-test teardown does not touch). While scrolled to the
      // bottom, the browser clamps `scrollY` to the document's max scroll
      // exactly, so ANY growth in page height — including this test's own,
      // already-exempted, `gn`-row growth from opening the picker — silently
      // increases that clamp and drags the whole viewport's visible content
      // up by the same amount. That reads as every element's own `top`
      // shifting, `dr` (the outermost node, with no ancestor of its own)
      // included, even though nothing in the tree actually moved relative to
      // its neighbours. Resetting to the top before every measurement makes
      // the comparison deterministic and independent of whatever a
      // predecessor test left the shared page scrolled to: Chrome's scroll
      // anchoring explicitly does not adjust `scrollY` away from 0, so once
      // pinned at the top this cannot recur mid-test.
      window.scrollTo(0, 0);

      const nodesBefore = Array.from(
        fixture.nativeElement.querySelectorAll('.hier-public-node, .tc-info-row, .hier-host-node, .hier-host-header')
      ) as HTMLElement[];
      const rectsBefore = nodesBefore.map(el => el.getBoundingClientRect());

      openPickerOn('gn');
      window.scrollTo(0, 0); // see comment above — keep the comparison pinned to the top through the mutation too

      const gnNode = fixture.nativeElement.querySelector("[data-target-id='gn']") as HTMLElement;
      const nodesAfter = Array.from(
        fixture.nativeElement.querySelectorAll('.hier-public-node, .tc-info-row, .hier-host-node, .hier-host-header')
      ) as HTMLElement[];
      expect(nodesAfter.length).toBe(nodesBefore.length);
      // The coherence check for the host elements specifically: prove they
      // are actually present and being measured, not vacuously absent.
      expect(fixture.nativeElement.querySelector('.hier-host-node')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('.hier-host-header')).not.toBeNull();

      // Document-order-coherent exemption, replacing the incoherent
      // ancestor-only one that only happened to pass because nothing
      // followed `gn` in the original fixture (Defect 6):
      //  - `gn` itself, or one of its DOM ancestors (`mt`, `dr`'s
      //    `.hier-public-node`, which structurally contain `gn`'s own
      //    growing row): `height`/`bottom` may legitimately grow from the
      //    +Mark group's own open/closed swap (the one change AC-13
      //    exempts); `left`/`top`/`width` must still hold — an ancestor's
      //    OWN top is set by where it starts, never by its children's
      //    height.
      //  - anything that renders strictly AFTER `gn` in document order,
      //    including a hypothetical descendant of `gn`'s own node
      //    (`camera`, here, is a later sibling of the whole chain): DOM
      //    ordinal position sets both `DOCUMENT_POSITION_FOLLOWING` and, for
      //    an actual descendant, `DOCUMENT_POSITION_CONTAINED_BY`
      //    together, so testing `FOLLOWING` alone already covers both — its
      //    `top` may shift down by the same swap's height delta, but its own
      //    `height`/`left`/`width` must hold: it is pushed, not resized.
      //  - anything strictly BEFORE `gn` (nothing in this fixture, `dr`'s
      //    and `mt`'s own rows sit earlier in the SAME nodes as the
      //    "ancestor" case above): every geometry field must hold exactly.
      nodesAfter.forEach((el, i) => {
        const before = rectsBefore[i];
        const after = el.getBoundingClientRect();
        const isSelfOrAncestor = el === gnNode || el.contains(gnNode);
        const isAfterInDocumentOrder = !isSelfOrAncestor
          && !!(gnNode.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);

        expect(after.left).toBeCloseTo(before.left, 0);
        expect(after.width).toBeCloseTo(before.width, 0);
        if (!isSelfOrAncestor) {
          expect(after.height).toBeCloseTo(before.height, 0);
        }
        if (!isAfterInDocumentOrder) {
          expect(after.top).toBeCloseTo(before.top, 0);
        }
      });

      // The coherence check itself: prove the "after" branch is actually
      // exercised, not vacuously true — otherwise this test could pass
      // again for the wrong reason if a future fixture change removed
      // `camera`.
      const camNode = fixture.nativeElement.querySelector("[data-target-id='cam']") as HTMLElement;
      expect(!!(gnNode.compareDocumentPosition(camNode) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTrue();

      // Round-8 review, Defect D-4a: everything above measures the `dr`/`mt`
      // PUBLIC ancestors of `gn` — `.hier-host-node`/`.hier-host-header` are
      // present in both snapshots (the coherence check above proves that),
      // but `gn`'s chain never reaches the host, so those two elements never
      // actually carry `hier-prop-landing`/`hier-prop-capped` during either
      // measurement. A padding/border regression scoped to those two host
      // classes specifically would still ship green. This second phase
      // re-measures with the picker open on `hdv` (the host-contained
      // device already in this fixture) instead, so the host cues are
      // measured while genuinely applied.
      function nativeElFor(targetId: string): HTMLElement {
        return fixture.debugElement
          .queryAll(By.directive(TargetCardComponent))
          .find(de => (de.componentInstance as TargetCardComponent).target.id === targetId)!
          .nativeElement as HTMLElement;
      }

      const gunCardInstance = fixture.debugElement
        .queryAll(By.directive(TargetCardComponent))
        .map(de => de.componentInstance as TargetCardComponent)
        .find(c => c.target.id === 'gn')!;
      gunCardInstance.cancelAddMark();
      fixture.detectChanges();
      expect(highlightClasses().length).toBe(0);

      // A second host, added after the first, gives this phase its own
      // "renders after in document order" element for the pushed-`top`
      // check — mirroring what `camera` did for the `gn` phase above.
      // `.hier-host-header` renders unconditionally regardless of
      // expansion (`hierarchy-editor.component.html:115-145`), so it does
      // not need targets or to be expanded to exist in the DOM.
      const host2 = new MatrixHost({ id: 'h2', name: 'Ares-8', rating: 2 });
      matrixState.addHost(host2);
      fixture.detectChanges();

      window.scrollTo(0, 0); // see the scroll-pinning comment on the `gn` phase above — same flake, same fix, second measurement span

      const nodesBefore2 = Array.from(
        fixture.nativeElement.querySelectorAll('.hier-public-node, .tc-info-row, .hier-host-node, .hier-host-header')
      ) as HTMLElement[];
      const rectsBefore2 = nodesBefore2.map(el => el.getBoundingClientRect());

      openPickerOn('hdv');
      window.scrollTo(0, 0);

      const hdvEl = nativeElFor('hdv');
      const hostNode = fixture.nativeElement.querySelector(`[data-host-id='${host.id}']`) as HTMLElement;
      const hostHeader = hostNode.querySelector('.hier-host-header') as HTMLElement;
      // The coherence check for THIS phase: prove the host is actually
      // highlighted during the measurement, not merely present.
      expect(hostNode.classList).toContain('hier-prop-landing');
      expect(hostHeader.classList).toContain('hier-prop-landing');

      const nodesAfter2 = Array.from(
        fixture.nativeElement.querySelectorAll('.hier-public-node, .tc-info-row, .hier-host-node, .hier-host-header')
      ) as HTMLElement[];
      expect(nodesAfter2.length).toBe(nodesBefore2.length);

      nodesAfter2.forEach((el, i) => {
        const before = rectsBefore2[i];
        const after = el.getBoundingClientRect();
        const isSelfOrAncestor = el === hdvEl || el.contains(hdvEl);
        const isAfterInDocumentOrder = !isSelfOrAncestor
          && !!(hdvEl.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);

        expect(after.left).toBeCloseTo(before.left, 0);
        expect(after.width).toBeCloseTo(before.width, 0);
        if (!isSelfOrAncestor) {
          expect(after.height).toBeCloseTo(before.height, 0);
        }
        if (!isAfterInDocumentOrder) {
          expect(after.top).toBeCloseTo(before.top, 0);
        }
      });

      // The coherence check itself for this phase: prove the "after" branch
      // is actually exercised here too.
      const host2Node = fixture.nativeElement.querySelector(`[data-host-id='${host2.id}']`) as HTMLElement;
      expect(!!(hdvEl.compareDocumentPosition(host2Node) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTrue();
    });

    // ── N-9 (round-7 review): does the marker glyph truncate a highlighted
    //    destination's OWN name at the worst-case narrow pane width? Measured
    //    in real ChromeHeadless layout, not assumed. Result, at
    //    EFFECTIVE_NARROW_WIDTH_PX (354px) with the destination at depth 3 of
    //    a 4-deep chain (the same worst case AC-12 uses): a 6-character name
    //    ("NNNNNN") is unaffected (67px available both before and after the
    //    marker inserts) because it was ALREADY being clipped to that width
    //    or fits within the reduced one either way; names of exactly 7-8
    //    characters are the narrow band where the row had just enough room
    //    (67px) before the marker but not after (55px) — the marker's own
    //    insertion is what tips them into ellipsis. By 9+ characters the name
    //    was already truncated at 67px before the marker ever existed, so the
    //    marker only shortens an already-truncated name further, which is the
    //    accepted, pre-existing cost this cue's insertion always carried
    //    (AC-13's "Round-6 review, Defect 5" correction).
    //
    //    Judgement call (round-7 review, evidence-based): the newly-truncated
    //    band is real but narrow (a two-character window, only at the single
    //    deepest/narrowest combination already tested elsewhere in this
    //    suite) and every fix attempted for it (moving the marker out of flex
    //    flow onto the icon) introduced its own layout regression elsewhere
    //    (broke AC-13 by turning the icon's fixed-width wrapper into a
    //    shrinkable flex item) — a worse, harder-to-spot failure than the one
    //    being fixed. Recorded and left alone rather than carrying a change
    //    that trades a narrow, cosmetic truncation for a structural layout
    //    risk. This test locks in the CURRENT, measured behaviour so a future
    //    change to this row's flex composition cannot silently make it worse
    //    (e.g. widen the newly-truncated band, or start truncating names that
    //    fit today) without failing here first.
    it('N-9: measured — a highlighted destination\'s own name in the 7-8 character range newly truncates when the picker opens, at the worst-case narrow pane width; shorter and much longer names are unaffected', () => {
      const NARROW_LEFT_PANE_WIDTH_PX = 426; // matrix-run-panel.component.css .matrix-left-pane
      const HIER_TREE_INDENT_PER_LEVEL_PX = 18; // hierarchy-editor.component.html, marginLeft.px="depth * 18"
      const CHAIN_DEPTH_FOR_LAYOUT_TEST = 4; // same depth AC-12 uses
      const EFFECTIVE_NARROW_WIDTH_PX =
        NARROW_LEFT_PANE_WIDTH_PX - HIER_TREE_INDENT_PER_LEVEL_PX * CHAIN_DEPTH_FOR_LAYOUT_TEST; // 354px

      /** Builds a depth-4 chain whose nearest-to-clicked ancestor (depth 3) has `nearestNameLength` characters, and returns that ancestor's `.tc-name` scrollWidth/clientWidth before and after opening the +Mark picker on the depth-4 clicked leaf. */
      function measureNearestAncestorName(nearestNameLength: number): { before: { scroll: number; client: number }; after: { scroll: number; client: number } } {
        const tag = `n9-${nearestNameLength}`;
        const names = ['Rooftop-Node', 'Relay-Station', 'Signal-Booster', 'N'.repeat(nearestNameLength)];
        const chain = names.map((name, i) => new MatrixTarget({
          id: `${tag}-t${i}`, name, type: 'device', context: 'public',
          parentTargetId: i > 0 ? `${tag}-t${i - 1}` : undefined
        }));
        chain.forEach(t => matrixState.addTarget(null, t));
        const clicked = new MatrixTarget({
          id: `${tag}-clicked`, name: 'Clicked Device', type: 'device', context: 'public',
          parentTargetId: `${tag}-t${chain.length - 1}`
        });
        matrixState.addTarget(null, clicked);
        fixture.detectChanges();

        const editorEl = fixture.nativeElement.querySelector('.hier-editor') as HTMLElement;
        editorEl.style.width = `${EFFECTIVE_NARROW_WIDTH_PX}px`;
        editorEl.style.overflow = 'hidden';
        fixture.detectChanges();

        const ancestorNode = fixture.nativeElement.querySelector(`[data-target-id='${tag}-t3']`) as HTMLElement;
        const nameBefore = ancestorNode.querySelector('.tc-name') as HTMLElement;
        const before = { scroll: nameBefore.scrollWidth, client: nameBefore.clientWidth };

        openPickerOn(`${tag}-clicked`);

        const nameAfter = ancestorNode.querySelector('.tc-name') as HTMLElement;
        const after = { scroll: nameAfter.scrollWidth, client: nameAfter.clientWidth };
        return { before, after };
      }

      const short = measureNearestAncestorName(6);
      expect(short.before.scroll).toBeLessThanOrEqual(short.before.client); // not truncated before
      expect(short.after.scroll).toBeLessThanOrEqual(short.after.client); // unaffected — was already at the row's floor

      const boundary = measureNearestAncestorName(7);
      expect(boundary.before.scroll).toBeLessThanOrEqual(boundary.before.client); // fits before the picker opens
      expect(boundary.after.scroll).toBeGreaterThan(boundary.after.client); // measured: the marker's own insertion newly truncates it

      // Round-8 review, Defect D-7: the title and the CSS comment both
      // claimed the "7-8 character range" / "by 9+ characters" boundary
      // without measuring 8 or 9 — only 6, 7 and 10 were ever run. Measured
      // now so the claim matches what is actually asserted.
      const boundary8 = measureNearestAncestorName(8);
      expect(boundary8.before.scroll).toBeLessThanOrEqual(boundary8.before.client); // fits before the picker opens
      expect(boundary8.after.scroll).toBeGreaterThan(boundary8.after.client); // newly truncated, same as 7

      const nine = measureNearestAncestorName(9);
      expect(nine.before.scroll).toBeGreaterThan(nine.before.client); // already truncated before the marker exists

      const long = measureNearestAncestorName(10);
      expect(long.before.scroll).toBeGreaterThan(long.before.client); // already truncated before the marker exists
      expect(long.after.scroll).toBeGreaterThan(long.after.client); // still truncated — the marker did not create this case
    });

    // ── S3 — the destination's own row is scrolled out of view ──

    it('S3: an ancestor scrolled out of view still shows its rail at the clicked row, and opening the picker does not auto-scroll', () => {
      const mount = new MatrixTarget({ id: 'mt', name: 'Weapon Mount', type: 'device', context: 'public' });
      const gun = new MatrixTarget({ id: 'gn', name: 'Smartgun', type: 'device', context: 'public', parentTargetId: 'mt' });
      matrixState.addTarget(null, mount);
      // Forty siblings parented to `mount`, rendered before `gun`, so
      // scrolling to `gun` pushes `mount`'s own row out of the 500px
      // .hier-editor window.
      for (let i = 0; i < 40; i++) {
        const filler = new MatrixTarget({ id: `filler${i}`, name: `Filler ${i}`, type: 'device', context: 'public', parentTargetId: 'mt' });
        matrixState.addTarget(null, filler);
      }
      matrixState.addTarget(null, gun);
      fixture.detectChanges();

      const editorEl = fixture.nativeElement.querySelector('.hier-editor') as HTMLElement;
      const gnNode = fixture.nativeElement.querySelector("[data-target-id='gn']") as HTMLElement;
      gnNode.scrollIntoView();
      editorEl.scrollTop = editorEl.scrollHeight; // scroll to the bottom, past mount's row
      const scrollTopBefore = editorEl.scrollTop;

      openPickerOn('gn');

      expect(editorEl.scrollTop).toBe(scrollTopBefore); // no auto-scroll (Open Decision 2, declined)

      const mtNode = fixture.nativeElement.querySelector("[data-target-id='mt']") as HTMLElement;
      const gnMarksRow = gnNode.querySelector('.tc-marks-row') as HTMLElement;
      // The rail still runs down past the clicked row even though mount's
      // own header is scrolled out of the visible area above it.
      expect(mtNode.getBoundingClientRect().bottom).toBeGreaterThan(gnMarksRow.getBoundingClientRect().top);
      expect(getComputedStyle(mtNode).boxShadow).toContain('255, 179, 64');
    });

    // ── S6 — cancel and re-open on a different icon ──

    it('S6: cancelling clears the highlight and places nothing; opening a different icon highlights only its own ancestors', () => {
      const drone = new MatrixTarget({ id: 'dr', name: 'MCT Roto-Drone', type: 'device', context: 'public' });
      const mount = new MatrixTarget({ id: 'mt', name: 'Weapon Mount', type: 'device', context: 'public', parentTargetId: 'dr' });
      const gun = new MatrixTarget({ id: 'gn', name: 'Smartgun', type: 'device', context: 'public', parentTargetId: 'mt' });
      matrixState.addTarget(null, drone);
      matrixState.addTarget(null, mount);
      matrixState.addTarget(null, gun);
      fixture.detectChanges();

      const gunCard = openPickerOn('gn');
      expect(highlightClasses().length).toBeGreaterThan(0);

      gunCard.cancelAddMark();
      fixture.detectChanges();

      expect(highlightClasses().length).toBe(0);
      expect(gun.marks['Tesseract']).toBeUndefined();

      openPickerOn('mt');

      const drNode = fixture.nativeElement.querySelector("[data-target-id='dr']") as HTMLElement;
      const mtNode = fixture.nativeElement.querySelector("[data-target-id='mt']") as HTMLElement;
      const gnNode = fixture.nativeElement.querySelector("[data-target-id='gn']") as HTMLElement;
      expect(drNode.classList).toContain('hier-prop-landing');
      expect(mtNode.classList).not.toContain('hier-prop-landing'); // it is now the source, not a destination
      expect(mtNode.classList).not.toContain('hier-prop-capped');
      expect(gnNode.classList).not.toContain('hier-prop-landing'); // propagation is one-way, upward only
      expect(gnNode.classList).not.toContain('hier-prop-capped');
    });

    // ── S7 — two pickers open at once: last-opened wins the HIGHLIGHT, but
    //        only one picker is ever OPEN (Open Decision 3, superseded
    //        2026-09-06, Defect 4) ──

    it('S7: opening a second icon\'s picker closes the first (Defect 4) - last-opened still wins the highlight, but no picker is left open and armed', () => {
      const mount = new MatrixTarget({ id: 'mt', name: 'Weapon Mount', type: 'device', context: 'public' });
      const gun = new MatrixTarget({ id: 'gn', name: 'Smartgun', type: 'device', context: 'public', parentTargetId: 'mt' });
      const camera = new MatrixTarget({ id: 'cm', name: 'Camera', type: 'device', context: 'public' }); // parented to nothing
      matrixState.addTarget(null, gun);
      matrixState.addTarget(null, mount);
      matrixState.addTarget(null, camera);
      fixture.detectChanges();

      // Round-8 review, Defect D-2: the final `.hier-mark-confirm` assertion
      // below used to be vacuous — this fixture never expanded the host, so
      // the host body (and `.hier-mark-confirm` with it) could not exist
      // under any code, correct or broken. Expanding the host and actually
      // arming its own +Mark control here means that assertion can fail.
      component.toggleHost(host.id);
      fixture.detectChanges();
      component.openHostAddMark(host);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.hier-mark-confirm')).not.toBeNull();

      const gunCard = openPickerOn('gn');
      expect(fixture.nativeElement.querySelector("[data-target-id='mt']").classList).toContain('hier-prop-landing');
      expect(gunCard.addMarkOpen).toBeTrue();
      // Opening a card's picker must close the host's own, already-armed
      // control too (N-1, folded into the same one-picker-at-a-time rule).
      expect(fixture.nativeElement.querySelector('.hier-mark-confirm')).toBeNull();

      const camCard = openPickerOn('cm'); // camera has no destinations at all

      // Defect 4: opening camera's picker closes gun's — not just replaces
      // the highlight. Last-opened-wins still governs which chain
      // highlights (unchanged): zero elements are highlighted, because
      // camera has no destinations.
      expect(highlightClasses().length).toBe(0);
      expect(gunCard.addMarkOpen).toBeFalse();
      expect(camCard.addMarkOpen).toBeTrue();

      // Defect 4's actual repro: cancelling camera's picker must not leave
      // gun's picker rediscovered as still-armed. It's already closed.
      camCard.cancelAddMark();
      fixture.detectChanges();

      expect(highlightClasses().length).toBe(0);
      // Zero armed pickers anywhere — N-1 (round-7 review): this used to
      // query only `.tc-confirm-btn` (a card's own confirm button), which
      // cannot see the host's own +Mark control (`.hier-mark-confirm`) —
      // a THIRD picker outside this mechanism until N-1 folded it in. Both
      // must be queried for the comment above to mean what it says.
      expect(fixture.nativeElement.querySelectorAll('.tc-confirm-btn').length).toBe(0);
      expect(fixture.nativeElement.querySelectorAll('.hier-mark-confirm').length).toBe(0);
      expect(gunCard.addMarkOpen).toBeFalse();
      expect(camCard.addMarkOpen).toBeFalse();
    });

    // ── N-4 (round-7 review): S7 could not discriminate the hazard it
    //    guards, because `camera` has no destinations — asserting "zero
    //    highlights" after opening its picker is equally true if a spurious
    //    clear from the closing FIRST picker had wiped a correct new
    //    highlight for the second. This test opens a SECOND picker that has
    //    its own destinations while the first is still open. ──

    it('N-4: opening a second icon\'s picker that has its own destinations highlights ONLY its own chain — the first picker\'s highlight does not linger, and the second\'s is not spuriously cleared', () => {
      const drone = new MatrixTarget({ id: 'dr', name: 'MCT Roto-Drone', type: 'device', context: 'public' });
      const mount = new MatrixTarget({ id: 'mt', name: 'Weapon Mount', type: 'device', context: 'public', parentTargetId: 'dr' });
      const gun = new MatrixTarget({ id: 'gn', name: 'Smartgun', type: 'device', context: 'public', parentTargetId: 'mt' });
      const tower = new MatrixTarget({ id: 'tw', name: 'Relay Tower', type: 'device', context: 'public' });
      const sensor = new MatrixTarget({ id: 'sn', name: 'Sensor', type: 'device', context: 'public', parentTargetId: 'tw' });
      matrixState.addTarget(null, drone);
      matrixState.addTarget(null, mount);
      matrixState.addTarget(null, gun);
      matrixState.addTarget(null, tower);
      matrixState.addTarget(null, sensor);
      fixture.detectChanges();

      const gunCard = openPickerOn('gn');
      expect(fixture.nativeElement.querySelector("[data-target-id='mt']").classList).toContain('hier-prop-landing');
      expect(fixture.nativeElement.querySelector("[data-target-id='dr']").classList).toContain('hier-prop-landing');

      const snCard = openPickerOn('sn'); // sensor -> tower, its OWN one-hop chain

      // The discriminating assertion N-4 exists for: the second picker's own
      // destination (tower) is highlighted...
      expect(fixture.nativeElement.querySelector("[data-target-id='tw']").classList).toContain('hier-prop-landing');
      // ...and the first picker's destinations do not linger, highlighted or
      // otherwise armed.
      expect(fixture.nativeElement.querySelector("[data-target-id='mt']").classList).not.toContain('hier-prop-landing');
      expect(fixture.nativeElement.querySelector("[data-target-id='dr']").classList).not.toContain('hier-prop-landing');
      expect(gunCard.addMarkOpen).toBeFalse();
      expect(snCard.addMarkOpen).toBeTrue();
      // Exactly one destination highlighted anywhere — the count itself
      // proves neither a stale first-chain highlight nor a spurious clear of
      // the second.
      expect(highlightClasses().length).toBe(1);
    });

    // ── N-1 (round-7 review, Xavier's decision, 2026-09-06): fold the
    //    host's own +Mark control into the one-picker-at-a-time rule ──

    it('N-1: opening a card\'s +Mark picker closes the host\'s own, already-open and armed +Mark control', () => {
      const gun = new MatrixTarget({ id: 'gn', name: 'Smartgun', type: 'device', context: 'public' });
      matrixState.addTarget(null, gun);
      fixture.detectChanges();

      // Round-8 review, Defect D-8: calling `openHostAddMark()` directly
      // while the host is still collapsed drives a sequence unreachable
      // through the UI — the +Mark button it arms lives inside the
      // collapsed host body (`hierarchy-editor.component.html:196-210`),
      // gated on `isHostExpanded()`. Expanding first, and asserting on the
      // rendered DOM rather than component state alone, is what a real GM
      // tap sequence actually produces.
      component.toggleHost(host.id);
      fixture.detectChanges();
      component.openHostAddMark(host);
      fixture.detectChanges();
      expect(component.getHostMarkState(host.id).open).toBeTrue();
      expect(component.getHostMarkState(host.id).selectedDeckerId).toBe('Tesseract'); // armed: a decker was seeded
      expect(fixture.nativeElement.querySelector('.hier-mark-confirm')).not.toBeNull();

      openPickerOn('gn');

      expect(component.getHostMarkState(host.id).open).toBeFalse();
      expect(fixture.nativeElement.querySelector('.hier-mark-confirm')).toBeNull();
    });

    it('N-1: opening the host\'s own +Mark control closes a card\'s already-open picker, and clears the highlight it was showing', () => {
      const drone = new MatrixTarget({ id: 'dr', name: 'MCT Roto-Drone', type: 'device', context: 'public' });
      const gun = new MatrixTarget({ id: 'gn', name: 'Smartgun', type: 'device', context: 'public', parentTargetId: 'dr' });
      matrixState.addTarget(null, drone);
      matrixState.addTarget(null, gun);
      fixture.detectChanges();

      const gunCard = openPickerOn('gn');
      expect(gunCard.addMarkOpen).toBeTrue();
      expect(highlightClasses().length).toBeGreaterThan(0); // dr is highlighted

      component.openHostAddMark(host);
      fixture.detectChanges();

      expect(gunCard.addMarkOpen).toBeFalse();
      expect(component.getHostMarkState(host.id).open).toBeTrue();
      // The reachable hazard N-1 fixes: `closePickerSilently()` deliberately
      // emits nothing (it is correct for a card losing to ANOTHER card,
      // whose own emit is about to replace the highlight) — opening the
      // host's own control replaces it with nothing, so gun's now-stale
      // highlight must not linger with no picker left open to explain it.
      expect(highlightClasses().length).toBe(0);
    });

    // ── Round-6 review, Defect 1 ─────────────────────────────────────────

    it('Defect 1: deleting the clicked target while its own picker is open clears the highlight cleanly, with no NG0100', fakeAsync(() => {
      const drone = new MatrixTarget({ id: 'dr', name: 'MCT Roto-Drone', type: 'device', context: 'public' });
      const mount = new MatrixTarget({ id: 'mt', name: 'Weapon Mount', type: 'device', context: 'public', parentTargetId: 'dr' });
      const gun = new MatrixTarget({ id: 'gn', name: 'Smartgun', type: 'device', context: 'public', parentTargetId: 'mt' });
      matrixState.addTarget(null, drone);
      matrixState.addTarget(null, mount);
      matrixState.addTarget(null, gun);
      fixture.detectChanges();

      openPickerOn('gn');
      expect(highlightClasses().length).toBe(2);

      // `gn` has no children of its own, so deleteTarget() does not prompt
      // via window.confirm() here — this exercises the plain delete path.
      expect(() => {
        component.deleteTarget(null, gun);
        fixture.detectChanges(); // the pass that used to throw NG0100
      }).not.toThrow();

      tick(); // flush the deferred clearing emit
      fixture.detectChanges();

      expect(highlightClasses().length).toBe(0);
      expect(fixture.nativeElement.querySelector("[data-target-id='gn']")).toBeNull();
    }));

    // ── Round-6 review, Defect 2 ─────────────────────────────────────────

    it('Defect 2: activeDeckers emptying while the picker is open clears the highlight cleanly, with no NG0100', fakeAsync(() => {
      const mount = new MatrixTarget({ id: 'mt', name: 'Weapon Mount', type: 'device', context: 'public' });
      const gun = new MatrixTarget({ id: 'gn', name: 'Smartgun', type: 'device', context: 'public', parentTargetId: 'mt' });
      matrixState.addTarget(null, mount);
      matrixState.addTarget(null, gun);
      fixture.detectChanges();

      openPickerOn('gn');
      expect(highlightClasses().length).toBe(1);

      // The last active decker jacks out — a fresh, empty array, exactly
      // the shape a real jack-out produces.
      expect(() => {
        component.activeDeckers = [];
        fixture.detectChanges(); // the pass that used to throw NG0100
      }).not.toThrow();

      tick(); // flush the deferred clearing emit
      fixture.detectChanges();

      expect(highlightClasses().length).toBe(0);
    }));

    // ── Round-6 review, Defect 3 ─────────────────────────────────────────

    it('Defect 3 regression guard: collapsing an UNRELATED host while a public-tree picker is open leaves the highlight and the picker untouched (fails against the removed toggleHost() hack)', () => {
      const drone = new MatrixTarget({ id: 'dr', name: 'MCT Roto-Drone', type: 'device', context: 'public' });
      const mount = new MatrixTarget({ id: 'mt', name: 'Weapon Mount', type: 'device', context: 'public', parentTargetId: 'dr' });
      const gun = new MatrixTarget({ id: 'gn', name: 'Smartgun', type: 'device', context: 'public', parentTargetId: 'mt' });
      matrixState.addTarget(null, drone);
      matrixState.addTarget(null, mount);
      matrixState.addTarget(null, gun);
      const unrelatedHost = new MatrixHost({ id: 'h2', name: 'Renraku Arcology', rating: 6 });
      matrixState.addHost(unrelatedHost);
      fixture.detectChanges();

      const gunCard = openPickerOn('gn');
      expect(highlightClasses().length).toBe(2);

      component.toggleHost(unrelatedHost.id); // expand — unrelated to the open picker
      fixture.detectChanges();
      component.toggleHost(unrelatedHost.id); // collapse again — the regression guard
      fixture.detectChanges();

      expect(highlightClasses().length).toBe(2);
      expect(gunCard.addMarkOpen).toBeTrue();
      expect(fixture.nativeElement.querySelector("[data-target-id='mt']").classList).toContain('hier-prop-landing');
      expect(fixture.nativeElement.querySelector("[data-target-id='dr']").classList).toContain('hier-prop-landing');
    });

    // ── Round-8 review, Defect D-3 ────────────────────────────────────────

    it('D-3: collapsing a host with its own +Mark picker armed, then re-expanding, does not resurrect the picker', () => {
      // Repro: expand a host, tap its +Mark (a decker auto-seeds), fold the
      // host shut, re-open it — unlike a card's own picker (destroyed with
      // its component on collapse), `hostMarkState` is a `Map` entry owned
      // by this component, not destroyed by the `@if (isHostExpanded(...))`
      // gate — so without this fix the `<select> ✓ ✕` re-rendered still
      // armed with the last decker, one stray tap from placing a host mark
      // with no undo.
      component.toggleHost(host.id);
      fixture.detectChanges();
      component.openHostAddMark(host);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.hier-mark-confirm')).not.toBeNull();
      expect(component.getHostMarkState(host.id).open).toBeTrue();

      component.toggleHost(host.id); // collapse while armed
      fixture.detectChanges();
      component.toggleHost(host.id); // re-expand
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.hier-mark-confirm')).toBeNull();
      expect(component.getHostMarkState(host.id).open).toBeFalse();
    });

    it('Defect 3 (genuine case): collapsing Public Space while its own picker is open clears cleanly; re-expanding does not reopen the picker', fakeAsync(() => {
      const mount = new MatrixTarget({ id: 'mt', name: 'Weapon Mount', type: 'device', context: 'public' });
      const gun = new MatrixTarget({ id: 'gn', name: 'Smartgun', type: 'device', context: 'public', parentTargetId: 'mt' });
      matrixState.addTarget(null, mount);
      matrixState.addTarget(null, gun);
      fixture.detectChanges();

      openPickerOn('gn');
      expect(highlightClasses().length).toBe(1);

      expect(() => {
        component.togglePublicSpace(); // collapse — destroys gun's own card
        fixture.detectChanges(); // the pass that used to throw NG0100
      }).not.toThrow();

      tick(); // flush the deferred clearing emit
      fixture.detectChanges();

      expect(highlightClasses().length).toBe(0);

      component.togglePublicSpace(); // re-expand
      fixture.detectChanges();

      expect(highlightClasses().length).toBe(0);
      expect(fixture.nativeElement.querySelectorAll('.tc-confirm-btn').length).toBe(0); // no picker re-opened
    }));

    // ── Round-6 review, defect-list test 6 (lifecycle path 12, "passes today; lock it in") ──

    it('an external write capping an ancestor while its picker is open flips that ancestor from landing to capped live, with no error', () => {
      const drone = new MatrixTarget({ id: 'dr', name: 'MCT Roto-Drone', type: 'device', context: 'public' });
      const mount = new MatrixTarget({ id: 'mt', name: 'Weapon Mount', type: 'device', context: 'public', parentTargetId: 'dr' });
      const gun = new MatrixTarget({ id: 'gn', name: 'Smartgun', type: 'device', context: 'public', parentTargetId: 'mt' });
      matrixState.addTarget(null, drone);
      matrixState.addTarget(null, mount);
      matrixState.addTarget(null, gun);
      fixture.detectChanges();

      openPickerOn('gn');
      const mtNode = fixture.nativeElement.querySelector("[data-target-id='mt']") as HTMLElement;
      expect(mtNode.classList).toContain('hier-prop-landing');

      // An external write - e.g. a different GM control or session sync,
      // not this card's own confirm - caps `mount` for the same decker
      // while `gn`'s picker is still open.
      expect(() => {
        matrixState.addMark(mount, 'Tesseract');
        matrixState.addMark(mount, 'Tesseract');
        matrixState.addMark(mount, 'Tesseract');
        fixture.detectChanges();
      }).not.toThrow();

      expect(mtNode.classList).toContain('hier-prop-capped');
      expect(mtNode.classList).not.toContain('hier-prop-landing');
    });

    // ── Round-6 review, Defect 7, defect-list test 7 ──────────────────────

    it('Defect 7: an external write capping the LAST available decker on the open picker\'s own icon closes the picker and clears the highlight', () => {
      const mount = new MatrixTarget({ id: 'mt', name: 'Weapon Mount', type: 'device', context: 'public' });
      const gun = new MatrixTarget({ id: 'gn', name: 'Smartgun', type: 'device', context: 'public', parentTargetId: 'mt' });
      matrixState.addTarget(null, mount);
      matrixState.addTarget(null, gun);
      fixture.detectChanges();

      const gunCard = openPickerOn('gn');
      expect(gunCard.addMarkOpen).toBeTrue();
      expect(highlightClasses().length).toBe(1);

      // Reaches the exact icon the open picker is FOR, with no `@Input`
      // change at all — `ngOnChanges()`'s path-10 guard cannot see this;
      // only `HierarchyEditorComponent.recomputeHighlight()`'s
      // `stateChange$`-driven check can (Defect 7).
      matrixState.addMark(gun, 'Tesseract');
      matrixState.addMark(gun, 'Tesseract');
      matrixState.addMark(gun, 'Tesseract');
      fixture.detectChanges();

      expect(gunCard.addMarkOpen).toBeFalse();
      expect(highlightClasses().length).toBe(0);
    });

    // ── N-6 (round-7 review): Lifecycle table path 8 — host deleted while
    //    a card inside it has its picker open — had no test. Reachable: the
    //    host's own subtree, including the open card, is destroyed the
    //    moment `deleteHost()` removes it from `state.hosts`. ──

    it('Lifecycle path 8: deleting the host while a card inside it has its own picker open clears the highlight cleanly, with no NG0100', fakeAsync(() => {
      const device = new MatrixTarget({ id: 'd1', type: 'device', context: 'host', linkedHostId: host.id });
      host.targets.push(device);
      component.toggleHost(host.id);
      fixture.detectChanges();

      openPickerOn('d1');
      expect(fixture.nativeElement.querySelector('.tc-add-mark-group')).not.toBeNull();

      expect(() => {
        component.deleteHost(host);
        fixture.detectChanges(); // the pass that used to throw NG0100
      }).not.toThrow();

      tick(); // flush the deferred clearing emit
      fixture.detectChanges();

      expect(highlightClasses().length).toBe(0);
      expect(fixture.nativeElement.querySelector('.hier-host-node')).toBeNull();
    }));
  });

  // ── Host +Mark control parity (host-mark-control-parity-spec.md, 2026-09-10) ──
  //
  // Brings the host's own +Mark control's decker-filtering and
  // disabled/blocked-reason messaging up to parity with TargetCardComponent's.
  // Reuses the same fixture pattern as the propagation-highlight describe
  // block above: `component.activeDeckers` assigned directly, a host added
  // via `matrixState.addHost()`.
  describe('HierarchyEditorComponent host +Mark control parity (host-mark-control-parity-spec.md, 2026-09-10)', () => {
    let fixture: ComponentFixture<HierarchyEditorComponent>;
    let component: HierarchyEditorComponent;
    let matrixState: MatrixStateService;
    let host: MatrixHost;
    let decker: MatrixParticipant;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [HierarchyEditorComponent],
        providers: appConfig.providers
      }).compileComponents();

      fixture = TestBed.createComponent(HierarchyEditorComponent);
      component = fixture.componentInstance;
      matrixState = TestBed.inject(MatrixStateService);
      decker = new MatrixParticipant();
      decker.name = 'Tesseract';
      component.activeDeckers = [decker];

      host = new MatrixHost({ id: 'h1', name: 'Ares-7', rating: 4 });
      matrixState.addHost(host);
      component.toggleHost(host.id); // expand — the +Mark button only renders inside an expanded host body
      fixture.detectChanges();
    });

    // ── AC-1, AC-2: nameless/capped exclusion, MARK_CAP not a bare literal ──

    it('AC-1: hostAvailableDeckers() excludes a decker whose name is blank or all-whitespace', () => {
      const blank = new MatrixParticipant();
      blank.name = '   ';
      component.activeDeckers = [decker, blank];
      fixture.detectChanges();

      const names = component.hostAvailableDeckers(host).map(d => d.name);
      expect(names).toEqual(['Tesseract']);
    });

    it('AC-1: hostAvailableDeckers() still excludes a decker at or over MARK_CAP', () => {
      host.marks['Tesseract'] = MARK_CAP;
      fixture.detectChanges();

      expect(component.hostAvailableDeckers(host)).toEqual([]);
    });

    it('AC-2: hostAvailableDeckers(), dots(), and confirmHostAddMark() all key off MARK_CAP, not a bare 3', () => {
      // Exercised indirectly: setting the cap to a decker's mark count via
      // the shared constant, rather than a hardcoded 3, must still block
      // them — this would fail if any of the three read a literal that had
      // drifted from MARK_CAP.
      host.marks['Tesseract'] = MARK_CAP;
      fixture.detectChanges();
      expect(component.hostAvailableDeckers(host)).toEqual([]);

      expect(component.dots(MARK_CAP)).toBe('●'.repeat(MARK_CAP) + '○'.repeat(0));
      expect(component.dots(0)).toBe('○'.repeat(MARK_CAP));

      component.openHostAddMark(host); // picker stays closed (no available deckers) but state can still be seeded directly for this check
      component.getHostMarkState(host.id).selectedDeckerId = 'Tesseract';
      component.confirmHostAddMark(host);
      fixture.detectChanges();

      // Blocked by the MARK_CAP-driven guard inside confirmHostAddMark(): no
      // mark written past the cap.
      expect(host.marks['Tesseract']).toBe(MARK_CAP);
    });

    // ── AC-3, AC-4, AC-5: hostAddMarkBlockedReason() ─────────────────────

    it('AC-3: hostAddMarkBlockedReason() returns "Pick a decker first" when nothing is selected', () => {
      component.openHostAddMark(host);
      component.getHostMarkState(host.id).selectedDeckerId = '';
      fixture.detectChanges();

      expect(component.hostAddMarkBlockedReason(host)).toBe('Pick a decker first');
    });

    it('AC-4: hostAddMarkBlockedReason() names the decker and MARK_CAP when the selected decker is at or over cap', () => {
      component.openHostAddMark(host);
      component.getHostMarkState(host.id).selectedDeckerId = 'Tesseract';
      host.marks['Tesseract'] = MARK_CAP;
      fixture.detectChanges();

      expect(component.hostAddMarkBlockedReason(host)).toBe(
        `Tesseract already holds the maximum ${MARK_CAP} marks on this host (p. 236)`
      );
    });

    it('AC-5: hostAddMarkBlockedReason() returns null when a decker is selected and under cap', () => {
      component.openHostAddMark(host);
      fixture.detectChanges();

      expect(component.getHostMarkState(host.id).selectedDeckerId).toBe('Tesseract');
      expect(component.hostAddMarkBlockedReason(host)).toBeNull();
    });

    // ── AC-6, AC-7, AC-8: canConfirmHostAddMark(), disabled button, blocked-reason DOM element ──

    it('AC-6: canConfirmHostAddMark() is true exactly when hostAddMarkBlockedReason() is null', () => {
      component.openHostAddMark(host);
      fixture.detectChanges();
      expect(component.hostAddMarkBlockedReason(host)).toBeNull();
      expect(component.canConfirmHostAddMark(host)).toBeTrue();

      host.marks['Tesseract'] = MARK_CAP;
      fixture.detectChanges();
      expect(component.hostAddMarkBlockedReason(host)).not.toBeNull();
      expect(component.canConfirmHostAddMark(host)).toBeFalse();
    });

    it('AC-7: the confirm button is disabled in the DOM exactly when canConfirmHostAddMark() is false', () => {
      // A second, uncapped decker must stay available, or capping the only
      // decker collapses the outer `@if (hostAvailableDeckers(host).length >
      // 0)` gate and takes the whole +Mark group — confirm button included —
      // out of the DOM along with it (see Scenario 3, which is the same
      // shape deliberately).
      const slamm = new MatrixParticipant();
      slamm.name = 'Slamm-0';
      component.activeDeckers = [decker, slamm];
      fixture.detectChanges();

      component.openHostAddMark(host);
      fixture.detectChanges();

      let confirmBtn = fixture.nativeElement.querySelector('.hier-mark-confirm') as HTMLButtonElement;
      expect(confirmBtn.disabled).toBeFalse();

      host.marks['Tesseract'] = MARK_CAP;
      fixture.detectChanges();

      confirmBtn = fixture.nativeElement.querySelector('.hier-mark-confirm') as HTMLButtonElement;
      expect(confirmBtn.disabled).toBeTrue();
    });

    it('AC-8: .hier-add-mark-blocked renders with the blocked-reason text exactly when it is non-null, and is absent when null', () => {
      // Same reason as AC-7: a second, uncapped decker keeps the outer gate
      // open once Tesseract is capped.
      const slamm = new MatrixParticipant();
      slamm.name = 'Slamm-0';
      component.activeDeckers = [decker, slamm];
      fixture.detectChanges();

      component.openHostAddMark(host);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.hier-add-mark-blocked')).toBeNull();

      host.marks['Tesseract'] = MARK_CAP;
      fixture.detectChanges();

      const blocked = fixture.nativeElement.querySelector('.hier-add-mark-blocked') as HTMLElement;
      expect(blocked).not.toBeNull();
      expect(blocked.textContent?.trim()).toBe(
        `Tesseract already holds the maximum ${MARK_CAP} marks on this host (p. 236)`
      );
    });

    // ── AC-9: openHostAddMark() never auto-selects a blank-named or capped decker ──

    it('AC-9: openHostAddMark() does not auto-select a blank-named decker even when it is first in activeDeckers', () => {
      const blank = new MatrixParticipant();
      blank.name = '';
      component.activeDeckers = [blank, decker];
      fixture.detectChanges();

      component.openHostAddMark(host);
      fixture.detectChanges();

      expect(component.getHostMarkState(host.id).selectedDeckerId).toBe('Tesseract');
    });

    it('AC-9: openHostAddMark() does not auto-select an already-capped decker even when it is first in activeDeckers', () => {
      const slamm = new MatrixParticipant();
      slamm.name = 'Slamm-0';
      host.marks['Slamm-0'] = MARK_CAP;
      component.activeDeckers = [slamm, decker];
      fixture.detectChanges();

      component.openHostAddMark(host);
      fixture.detectChanges();

      expect(component.getHostMarkState(host.id).selectedDeckerId).toBe('Tesseract');
    });

    // ── Scenarios to survive ──────────────────────────────────────────────

    it('Scenario 1 — ordinary case: two available deckers, one auto-selected, confirm enabled, no blocked text, confirm writes the mark and closes the picker', () => {
      const slamm = new MatrixParticipant();
      slamm.name = 'Slamm-0';
      component.activeDeckers = [decker, slamm];
      fixture.detectChanges();

      component.openHostAddMark(host);
      fixture.detectChanges();

      const options = fixture.nativeElement.querySelectorAll('.hier-mark-select option');
      expect(options.length).toBe(2);
      expect(component.getHostMarkState(host.id).selectedDeckerId).toBe('Tesseract');

      const confirmBtn = fixture.nativeElement.querySelector('.hier-mark-confirm') as HTMLButtonElement;
      expect(confirmBtn.disabled).toBeFalse();
      expect(fixture.nativeElement.querySelector('.hier-add-mark-blocked')).toBeNull();

      confirmBtn.click();
      fixture.detectChanges();

      expect(host.marks['Tesseract']).toBe(1);
      expect(component.getHostMarkState(host.id).open).toBeFalse();
    });

    it('Scenario 2 — edge case, nameless decker present: the dropdown lists only the named decker, never auto-selects the blank one', () => {
      const blank = new MatrixParticipant();
      blank.name = '';
      component.activeDeckers = [decker, blank];
      fixture.detectChanges();

      component.openHostAddMark(host);
      fixture.detectChanges();

      const options = Array.from(
        fixture.nativeElement.querySelectorAll('.hier-mark-select option')
      ) as HTMLOptionElement[];
      expect(options.length).toBe(1);
      expect(options[0].value).toBe('Tesseract');
      expect(component.getHostMarkState(host.id).selectedDeckerId).toBe('Tesseract');
    });

    it('Scenario 3 — edge case, selected decker capped externally: confirm disables, blocked text appears, a second available decker stays listed', () => {
      const slamm = new MatrixParticipant();
      slamm.name = 'Slamm-0';
      component.activeDeckers = [decker, slamm];
      fixture.detectChanges();

      component.openHostAddMark(host);
      fixture.detectChanges();
      expect(component.getHostMarkState(host.id).selectedDeckerId).toBe('Tesseract');

      // External write, mirroring the existing "Defect 7" pattern.
      host.marks['Tesseract'] = MARK_CAP;
      fixture.detectChanges();

      expect(component.hostAddMarkBlockedReason(host)).toBe(
        `Tesseract already holds the maximum ${MARK_CAP} marks on this host (p. 236)`
      );
      const confirmBtn = fixture.nativeElement.querySelector('.hier-mark-confirm') as HTMLButtonElement;
      expect(confirmBtn.disabled).toBeTrue();
      expect(fixture.nativeElement.querySelector('.hier-add-mark-blocked')).not.toBeNull();

      const options = Array.from(
        fixture.nativeElement.querySelectorAll('.hier-mark-select option')
      ) as HTMLOptionElement[];
      expect(options.map(o => o.value)).toContain('Slamm-0');
    });

    it('Scenario 4 — undo-adjacent case: cancelling clears the picker with no mark written and no blocked text leaking into the next open', () => {
      // A second, uncapped decker keeps the outer availability gate open
      // once Tesseract is capped (same reason as AC-7/AC-8/Scenario 3), so
      // the blocked-reason text can actually render for this assertion.
      const slamm = new MatrixParticipant();
      slamm.name = 'Slamm-0';
      component.activeDeckers = [decker, slamm];
      fixture.detectChanges();

      component.openHostAddMark(host);
      host.marks['Tesseract'] = MARK_CAP; // force a blocked reason to exist before cancelling
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.hier-add-mark-blocked')).not.toBeNull();

      component.getHostMarkState(host.id).open = false; // the existing cancel button's own handler
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.hier-mark-confirm')).toBeNull();
      expect(fixture.nativeElement.querySelector('.hier-add-mark-blocked')).toBeNull();
      expect(host.marks['Tesseract']).toBe(MARK_CAP); // unchanged — no mark was written

      // Reopening starts clean: the still-uncapped decker auto-selects with
      // no stale blocked reason.
      component.getHostMarkState(host.id).selectedDeckerId = ''; // force a fresh auto-select
      component.openHostAddMark(host);
      fixture.detectChanges();

      expect(component.getHostMarkState(host.id).selectedDeckerId).toBe('Slamm-0');
      expect(component.hostAddMarkBlockedReason(host)).toBeNull();
    });

    it('Scenario 5 — live-at-the-table case: an external cap landing while the picker is open (session-sync-style write) visibly disables confirm and shows why, instead of a silent dead tap', () => {
      const slamm = new MatrixParticipant();
      slamm.name = 'Slamm-0';
      component.activeDeckers = [decker, slamm];
      fixture.detectChanges();

      component.openHostAddMark(host);
      fixture.detectChanges();
      expect(component.canConfirmHostAddMark(host)).toBeTrue();

      // Simulates a session-sync-driven external write landing mid-picker,
      // the same shape of write scenario 3 exercises directly.
      host.marks['Tesseract'] = MARK_CAP;
      fixture.detectChanges();

      const confirmBtn = fixture.nativeElement.querySelector('.hier-mark-confirm') as HTMLButtonElement;
      expect(confirmBtn.disabled).toBeTrue();
      const blocked = fixture.nativeElement.querySelector('.hier-add-mark-blocked') as HTMLElement;
      expect(blocked.textContent).toContain('Tesseract');
      expect(blocked.textContent).toContain('already holds the maximum');

      // A disabled button no-ops a DOM click — confirming this is exactly
      // the silent-dead-tap failure mode the change removes for the GM:
      // the GM now sees why, instead of tapping a button that quietly does
      // nothing.
      confirmBtn.click();
      fixture.detectChanges();
      expect(host.marks['Tesseract']).toBe(MARK_CAP); // unchanged

      // Picking the other available decker recovers cleanly.
      component.getHostMarkState(host.id).selectedDeckerId = 'Slamm-0';
      fixture.detectChanges();
      expect(component.canConfirmHostAddMark(host)).toBeTrue();
      expect(fixture.nativeElement.querySelector('.hier-add-mark-blocked')).toBeNull();
    });

    // ── AC-7b / AC-8b (round-8 review): the single-decker case AC-7/AC-8
    //    deliberately avoided. With only one decker in `activeDeckers`,
    //    capping it drops `hostAvailableDeckers(host)` to zero, which takes
    //    the whole `+Mark` group — confirm button and blocked-reason text
    //    both — out of the DOM entirely, rather than leaving them present
    //    and merely disabled. AC-7/AC-8 as originally worded ("disabled in
    //    the DOM exactly when ...") are false in this state; these two
    //    tests assert what actually happens here instead. ──────────────

    it('AC-7b: with only one decker, capping it removes the confirm button from the DOM entirely (not merely disabled)', () => {
      component.openHostAddMark(host);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.hier-mark-confirm')).not.toBeNull();

      // Real external write via the service, so `stateChange$` fires and
      // `closeExhaustedHostPickers()` runs — mirrors production paths
      // (session sync, another GM control), not a raw property poke.
      matrixState.addMarkToHost(host, 'Tesseract', MARK_CAP);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.hier-mark-confirm')).toBeNull();
      expect(fixture.nativeElement.querySelector('.hier-add-mark-btn')).toBeNull();
    });

    it('AC-8b: with only one decker, capping it removes .hier-add-mark-blocked from the DOM entirely (not merely rendered-and-non-null)', () => {
      component.openHostAddMark(host);
      fixture.detectChanges();

      matrixState.addMarkToHost(host, 'Tesseract', MARK_CAP);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.hier-add-mark-blocked')).toBeNull();
    });

    // ── Round-8 review, defect 1: ghost-reopen regression ────────────────

    it('Defect 1a: capping the only decker while its picker is open closes the picker outright — nothing stays armed', () => {
      component.openHostAddMark(host);
      fixture.detectChanges();
      expect(component.getHostMarkState(host.id).open).toBeTrue();
      expect(component.getHostMarkState(host.id).selectedDeckerId).toBe('Tesseract');

      matrixState.addMarkToHost(host, 'Tesseract', MARK_CAP);
      fixture.detectChanges();

      const s = component.getHostMarkState(host.id);
      expect(s.open).toBeFalse();
      expect(s.selectedDeckerId).toBe('');
    });

    it('Defect 1b: removing a mark afterwards via the "×" control does not silently re-arm the picker — it reopens closed, requiring a fresh +Mark tap', () => {
      component.openHostAddMark(host);
      fixture.detectChanges();

      // Caps the only decker while the picker is open (Defect 1a's setup).
      matrixState.addMarkToHost(host, 'Tesseract', MARK_CAP);
      fixture.detectChanges();
      expect(component.getHostMarkState(host.id).open).toBeFalse();

      // An ordinary, unrelated action: the GM removes a mark on this exact
      // decker/host via the always-visible "×" remove control.
      component.removeHostMark(host, 'Tesseract');
      fixture.detectChanges();

      // The +Mark group is available again (availability > 0), but must
      // come back in its closed, "tap +Mark to reopen" state — not
      // reappear already armed with a confirm button ready to fire.
      const s = component.getHostMarkState(host.id);
      expect(s.open).toBeFalse();
      expect(s.selectedDeckerId).toBe('');
      expect(fixture.nativeElement.querySelector('.hier-add-mark-btn')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('.hier-mark-confirm')).toBeNull();

      // A genuine fresh tap still works normally afterwards.
      component.openHostAddMark(host);
      fixture.detectChanges();
      expect(component.getHostMarkState(host.id).selectedDeckerId).toBe('Tesseract');
      expect(component.canConfirmHostAddMark(host)).toBeTrue();
    });

    // ── Round-9 review: the `@Input`-driven route ────────────────────────
    //
    // Round-8 gave `closeExhaustedHostPickers()` exactly one caller — the
    // `stateChange$` subscription in `ngOnInit()`. Every test above drives
    // availability to zero through `MatrixStateService` (`addMarkToHost`),
    // which fires `stateChange$` and was always covered. Nothing above
    // covered the OTHER route: `enableDeck()` / `removeDeck()`
    // (`battle-tracker.component.ts`) and `CombatManager.removeParticipant()`
    // all change `activeDeckers` without ever touching `MatrixStateService`,
    // so they reach this component purely as an `@Input` change. Before this
    // round, `HierarchyEditorComponent` had no `ngOnChanges` at all, so that
    // whole route went unreconciled — the tests below exercise it directly.
    //
    // Following this suite's own established convention for testing a
    // component's `ngOnChanges()` on a bare `ComponentFixture` with no
    // parent template binding (see 'ngOnChanges closes the picker...' on
    // `TargetCardComponent` above, and `AccessHostPanelComponent`'s
    // `beforeEach`, both at the top of this file): mutate the `@Input`
    // field directly, then call `component.ngOnChanges(...)` with the same
    // `SimpleChanges`-shaped payload Angular would produce from a real
    // parent binding. This exercises the actual `ngOnChanges()`
    // implementation added this round — it is not a call to
    // `closeExhaustedHostPickers()` itself, which is exactly the kind of
    // test that would not have caught this defect (the defect was that
    // NOTHING called it from this route, not that the method itself was
    // wrong).
    it('Round-9 #1: picker open and armed, activeDeckers changes so availability hits zero -> picker closes and disarms', () => {
      component.openHostAddMark(host);
      fixture.detectChanges();
      expect(component.getHostMarkState(host.id).open).toBeTrue();
      expect(component.getHostMarkState(host.id).selectedDeckerId).toBe('Tesseract');

      // The only decker's deck is removed / the participant is deleted —
      // exactly the shape `enableDeck()`/`removeDeck()` and
      // `CombatManager.removeParticipant()` produce: a fresh `activeDeckers`
      // array with no `MatrixStateService` write at all.
      component.activeDeckers = [];
      component.ngOnChanges({ activeDeckers: {} } as never);

      const s = component.getHostMarkState(host.id);
      expect(s.open).toBeFalse();
      expect(s.selectedDeckerId).toBe('');
    });

    it('Round-9 #2: availability returning afterwards does not resurrect the picker armed — a fresh openHostAddMark() is required', () => {
      component.openHostAddMark(host);
      fixture.detectChanges();
      component.activeDeckers = [];
      component.ngOnChanges({ activeDeckers: {} } as never);
      expect(component.getHostMarkState(host.id).open).toBeFalse();

      // The decker becomes available again (deck re-enabled).
      component.activeDeckers = [decker];
      component.ngOnChanges({ activeDeckers: {} } as never);
      fixture.detectChanges();

      const s = component.getHostMarkState(host.id);
      expect(s.open).toBeFalse();
      expect(s.selectedDeckerId).toBe('');

      // A genuine fresh tap still works normally afterwards.
      component.openHostAddMark(host);
      expect(component.getHostMarkState(host.id).selectedDeckerId).toBe('Tesseract');
      expect(component.canConfirmHostAddMark(host)).toBeTrue();
    });

    it('Round-9 #3: a picker in a legitimate multi-decker state is NOT force-closed by the new ngOnChanges hook', () => {
      const slamm = new MatrixParticipant();
      slamm.name = 'Slamm-0';
      component.activeDeckers = [decker, slamm];
      fixture.detectChanges();

      component.openHostAddMark(host);
      fixture.detectChanges();
      expect(component.getHostMarkState(host.id).open).toBeTrue();
      expect(component.getHostMarkState(host.id).selectedDeckerId).toBe('Tesseract');

      // An unrelated `activeDeckers` change that still leaves availability
      // above zero (e.g. a third decker joining, or the array reference
      // simply being replaced with equivalent content) must not disturb an
      // otherwise-legitimate open picker.
      const newman = new MatrixParticipant();
      newman.name = 'Netcat';
      component.activeDeckers = [decker, slamm, newman];
      component.ngOnChanges({ activeDeckers: {} } as never);
      fixture.detectChanges();

      const s = component.getHostMarkState(host.id);
      expect(s.open).toBeTrue();
      expect(s.selectedDeckerId).toBe('Tesseract');
    });

    it('Round-9 #4: a deleted host\'s hostMarkState entry is dropped, not left stranded in the Map forever', () => {
      const host2 = new MatrixHost({ id: 'h2', name: 'Renraku Arcology', rating: 6 });
      matrixState.addHost(host2);
      component.getHostMarkState(host2.id); // seeds a Map entry for host2, as opening its +Mark control would

      expect(component.getHostMarkState(host2.id)).toBeDefined();

      matrixState.removeHost(host2);
      fixture.detectChanges();

      // `getHostMarkState()` lazily recreates a missing entry, so the only
      // way to observe the deletion is to check the Map directly rather
      // than through that accessor.
      const rawMap = (component as unknown as { hostMarkState: Map<string, unknown> })['hostMarkState'];
      expect(rawMap.has(host2.id)).toBeFalse();
    });
  });

  // ── Decision 7 — marks propagate up the containment hierarchy ──────────

  describe('MatrixStateService.addMark() propagation (Decision 7, 2026-09-02)', () => {
    let matrixState: MatrixStateService;
    let host: MatrixHost;

    beforeEach(() => {
      TestBed.configureTestingModule({ providers: appConfig.providers });
      matrixState = TestBed.inject(MatrixStateService);
      host = new MatrixHost({ id: 'h1', name: 'H', rating: 4 });
      matrixState.addHost(host);
    });

    // Decision 7a — host WAN propagation
    it('7a: marking a target slaved to a host also marks the host (p. 233)', () => {
      const device = new MatrixTarget({ id: 'd1', type: 'device', context: 'host', linkedHostId: host.id });
      host.targets.push(device);

      matrixState.addMark(device, 'Tesseract');

      expect(device.marks['Tesseract']).toBe(1);
      expect(host.marks['Tesseract']).toBe(1);
    });

    it("7a: the target's cap and the host's cap are independent — the propagated mark does not use up a slot on both at once", () => {
      const device = new MatrixTarget({ id: 'd1', type: 'device', context: 'host', linkedHostId: host.id });
      host.targets.push(device);
      host.marks['Tesseract'] = 2; // host already at 2, independently of the device

      matrixState.addMark(device, 'Tesseract'); // device: 0 -> 1; host: 2 -> 3

      expect(device.marks['Tesseract']).toBe(1);
      expect(host.marks['Tesseract']).toBe(3);
    });

    it('7a: marking a target with no linkedHostId does not touch any host', () => {
      const device = new MatrixTarget({ id: 'd1', type: 'device', context: 'public' });
      matrixState.addTarget(null, device);

      matrixState.addMark(device, 'Tesseract');

      expect(device.marks['Tesseract']).toBe(1);
      expect(host.marks['Tesseract']).toBeUndefined();
    });

    it("7a: propagation is silent — it does not itself call addMarkToHost's stateChange$ a visible extra time beyond addMark's own", () => {
      const device = new MatrixTarget({ id: 'd1', type: 'device', context: 'host', linkedHostId: host.id });
      host.targets.push(device);
      let fireCount = 0;
      matrixState.stateChange$.subscribe(() => fireCount++);

      matrixState.addMark(device, 'Tesseract');

      expect(fireCount).toBe(1); // one addMark() call, one state change
    });

    // Decision 9 (2026-09-03): propagation must be visible on the ancestor's
    // own mark row, not just inferred.
    it("Decision 9: a mark placed by host WAN propagation sets the host's propagatedMarks flag", () => {
      const device = new MatrixTarget({ id: 'd1', type: 'device', context: 'host', linkedHostId: host.id });
      host.targets.push(device);

      matrixState.addMark(device, 'Tesseract');

      expect(host.propagatedMarks['Tesseract']).toBeTrue();
      // The directly-marked device itself was not propagated onto — the GM
      // clicked it directly.
      expect(device.propagatedMarks['Tesseract']).toBeUndefined();
    });

    it("Decision 9: removing the host's own mark clears its propagatedMarks flag once the count reaches 0, without touching the device's mark", () => {
      const device = new MatrixTarget({ id: 'd1', type: 'device', context: 'host', linkedHostId: host.id });
      host.targets.push(device);
      matrixState.addMark(device, 'Tesseract');
      expect(host.propagatedMarks['Tesseract']).toBeTrue();

      matrixState.removeMarkFromHost(host, 'Tesseract');

      expect(host.marks['Tesseract']).toBeUndefined();
      expect(host.propagatedMarks['Tesseract']).toBeUndefined();
      expect(device.marks['Tesseract']).toBe(1); // untouched — decision 9, no reversal
    });

    it("Decision 9: removing the directly-marked device's own mark does not clear the propagated flag it already placed on the host", () => {
      const device = new MatrixTarget({ id: 'd1', type: 'device', context: 'host', linkedHostId: host.id });
      host.targets.push(device);
      matrixState.addMark(device, 'Tesseract');

      matrixState.removeMark(device, 'Tesseract');

      expect(device.marks['Tesseract']).toBeUndefined();
      expect(host.marks['Tesseract']).toBe(1); // stays — decision 9, no reversal
      expect(host.propagatedMarks['Tesseract']).toBeTrue(); // still flagged
    });

    // Decision 7b — open-grid parent/child propagation
    it('7b: marking a public-space child propagates a mark to its device parent', () => {
      const rifle = new MatrixTarget({ id: 'weapon1', type: 'device', context: 'public' });
      const mount = new MatrixTarget({ id: 'mount1', type: 'device', context: 'public' });
      rifle.parentTargetId = mount.id;
      matrixState.addTarget(null, mount);
      matrixState.addTarget(null, rifle);

      matrixState.addMark(rifle, 'GM-NPC');

      expect(rifle.marks['GM-NPC']).toBe(1);
      expect(mount.marks['GM-NPC']).toBe(1);
    });

    // Decision 8 (2026-09-03): "Only getting marks on devices propagate to
    // the hosts as well, files and personas do not get propagated to and do
    // not propagate." This is the exact fixture shape the pre-Decision-8
    // version of this test used (a device child parented to a persona) -
    // kept deliberately, with the assertion reversed, so the superseded
    // behaviour is visible rather than quietly dropped.
    it('Decision 8: a device parented to a persona does not propagate to it — a persona is not a valid destination', () => {
      const rifle = new MatrixTarget({ id: 'weapon1', type: 'device', context: 'public' });
      const decker = new MatrixTarget({ id: 'dev1', type: 'persona', context: 'public' });
      rifle.parentTargetId = decker.id;
      matrixState.addTarget(null, decker);
      matrixState.addTarget(null, rifle);

      matrixState.addMark(rifle, 'GM-NPC');

      expect(rifle.marks['GM-NPC']).toBe(1);
      expect(decker.marks['GM-NPC']).toBeUndefined();
    });

    it('Decision 8: marking a file does not propagate to its host, even though the file lives in one', () => {
      const file = new MatrixTarget({ id: 'f1', type: 'file', context: 'host', linkedHostId: host.id });
      host.targets.push(file);

      matrixState.addMark(file, 'Tesseract');

      expect(file.marks['Tesseract']).toBe(1);
      expect(host.marks['Tesseract']).toBeUndefined();
    });

    it('Decision 8: marking a persona does not propagate to its host', () => {
      const persona = new MatrixTarget({ id: 'p1', type: 'persona', context: 'host', linkedHostId: host.id });
      host.targets.push(persona);

      matrixState.addMark(persona, 'Tesseract');

      expect(persona.marks['Tesseract']).toBe(1);
      expect(host.marks['Tesseract']).toBeUndefined();
    });

    it('Decision 8: marking an IC target does not propagate to its host', () => {
      const ic = new MatrixTarget({ id: 'ic1', type: 'ic', context: 'host', linkedHostId: host.id });
      host.targets.push(ic);

      matrixState.addMark(ic, 'Tesseract');

      expect(ic.marks['Tesseract']).toBe(1);
      expect(host.marks['Tesseract']).toBeUndefined();
    });

    it('Decision 8: a device parented to a nested-host icon does not propagate to it', () => {
      const nestedHostIcon = new MatrixTarget({ id: 'nh1', type: 'host', context: 'public' });
      const device = new MatrixTarget({ id: 'd2', type: 'device', context: 'public', parentTargetId: nestedHostIcon.id });
      matrixState.addTarget(null, nestedHostIcon);
      matrixState.addTarget(null, device);

      matrixState.addMark(device, 'Tesseract');

      expect(device.marks['Tesseract']).toBe(1);
      expect(nestedHostIcon.marks['Tesseract']).toBeUndefined();
    });

    it('Decision 8: a device parented to a file stops the walk there — a further device above the file is not reached', () => {
      const grandparentDevice = new MatrixTarget({ id: 'gp1', type: 'device', context: 'public' });
      const file = new MatrixTarget({ id: 'file1', type: 'file', context: 'public', parentTargetId: 'gp1' });
      const device = new MatrixTarget({ id: 'd3', type: 'device', context: 'public', parentTargetId: 'file1' });
      matrixState.addTarget(null, grandparentDevice);
      matrixState.addTarget(null, file);
      matrixState.addTarget(null, device);

      matrixState.addMark(device, 'Tesseract');

      expect(device.marks['Tesseract']).toBe(1);
      expect(file.marks['Tesseract']).toBeUndefined(); // file is not a valid destination
      expect(grandparentDevice.marks['Tesseract']).toBeUndefined(); // never reached — the walk stopped at the file
    });

    it('7b: propagation continues onward up a longer chain', () => {
      const grandparent = new MatrixTarget({ id: 't1', type: 'device', context: 'public' });
      const parent = new MatrixTarget({ id: 't2', type: 'device', context: 'public', parentTargetId: 't1' });
      // Decision 8 (2026-09-03): the source must be a device, so this
      // three-deep chain-continuation fixture uses a device, not a file, at
      // the bottom - "a file does not propagate" is covered separately
      // under "Decision 8" above.
      const child = new MatrixTarget({ id: 't3', type: 'device', context: 'public', parentTargetId: 't2' });
      matrixState.addTarget(null, grandparent);
      matrixState.addTarget(null, parent);
      matrixState.addTarget(null, child);

      matrixState.addMark(child, 'Tesseract');

      expect(child.marks['Tesseract']).toBe(1);
      expect(parent.marks['Tesseract']).toBe(1);
      expect(grandparent.marks['Tesseract']).toBe(1);
    });

    it('7b: propagation continues past an ancestor already at its own 3-mark cap', () => {
      const grandparent = new MatrixTarget({ id: 't1', type: 'device', context: 'public' });
      const parent = new MatrixTarget({ id: 't2', type: 'device', context: 'public', parentTargetId: 't1' });
      parent.marks['Tesseract'] = 3; // parent already capped
      // Decision 8 (2026-09-03): source must be a device — see note above.
      const child = new MatrixTarget({ id: 't3', type: 'device', context: 'public', parentTargetId: 't2' });
      matrixState.addTarget(null, grandparent);
      matrixState.addTarget(null, parent);
      matrixState.addTarget(null, child);

      matrixState.addMark(child, 'Tesseract');

      expect(parent.marks['Tesseract']).toBe(3); // absorbed by its own cap
      expect(grandparent.marks['Tesseract']).toBe(1); // still reached
    });

    it("7b: scoped to context 'public' — a host-contained target's parentTargetId (if any) is not walked", () => {
      const wouldBeParent = new MatrixTarget({ id: 'p1', type: 'device', context: 'public' });
      const hostTarget = new MatrixTarget({
        id: 't1', type: 'device', context: 'host', linkedHostId: host.id, parentTargetId: 'p1'
      });
      host.targets.push(hostTarget);
      matrixState.addTarget(null, wouldBeParent);

      matrixState.addMark(hostTarget, 'Tesseract');

      expect(hostTarget.marks['Tesseract']).toBe(1);
      expect(wouldBeParent.marks['Tesseract']).toBeUndefined();
      expect(host.marks['Tesseract']).toBe(1); // 7a still applies
    });

    it('cycle guard: a malformed parent cycle does not infinite-loop', () => {
      const a = new MatrixTarget({ id: 'a', type: 'device', context: 'public', parentTargetId: 'b' });
      const b = new MatrixTarget({ id: 'b', type: 'device', context: 'public', parentTargetId: 'a' }); // cycle
      matrixState.addTarget(null, a);
      matrixState.addTarget(null, b);

      expect(() => matrixState.addMark(a, 'Tesseract')).not.toThrow();
      expect(a.marks['Tesseract']).toBe(1);
      expect(b.marks['Tesseract']).toBe(1); // reached once, not looped
    });

    // mark-propagation-preview-spec.md — the preview and the write path must
    // walk the same nodes in the same order, since previewPropagation() and
    // propagateMarkUp() both delegate to the same collectPropagationStops().
    it('previewPropagation() returns stops in the same order and count as the records addMark() actually changes', () => {
      const grandparent = new MatrixTarget({ id: 't1', name: 'Grandparent', type: 'device', context: 'public' });
      const parent = new MatrixTarget({ id: 't2', name: 'Parent', type: 'device', context: 'public', parentTargetId: 't1' });
      const child = new MatrixTarget({ id: 't3', name: 'Child', type: 'device', context: 'public', parentTargetId: 't2' });
      matrixState.addTarget(null, grandparent);
      matrixState.addTarget(null, parent);
      matrixState.addTarget(null, child);

      const stops = matrixState.previewPropagation(child, 'Tesseract');
      expect(stops.length).toBe(2);
      expect(stops.map(s => s.id)).toEqual(['t2', 't1']); // parent before grandparent

      matrixState.addMark(child, 'Tesseract');

      const changed = [parent, grandparent].filter(t => t.marks['Tesseract'] === 1);
      expect(changed.map(t => t.id)).toEqual(stops.map(s => s.id));
    });

    // mark-propagation-preview-spec.md scenario S5 (defensive) — the preview
    // must not `return` early on the host branch and drop the parent chain.
    it('previewPropagation() names both the host and the parent-chain destination when both branches fire for one target (scenario S5)', () => {
      // Not reachable through the UI today (spec "Reachability finding" — a
      // public target's form never sets linkedHostId), but MatrixTarget's
      // constructor has no validation stopping this shape, so it is real
      // reachable state (e.g. via updateTarget()). Contrast with the
      // context: 'host' fixture used elsewhere in this file, where only
      // branch (a) fires — this one has context: 'public' AND a
      // linkedHostId, so both (a) and (b) fire for the same node.
      const ares7 = new MatrixHost({ id: 'h-s5', name: 'Ares-7', rating: 4 });
      matrixState.addHost(ares7);
      const rooftop = new MatrixTarget({ id: 'p1', name: 'Rooftop Node', type: 'device', context: 'public' });
      const odd = new MatrixTarget({
        id: 't1', name: 'Odd Device', type: 'device', context: 'public',
        linkedHostId: ares7.id, parentTargetId: 'p1'
      });
      matrixState.addTarget(null, rooftop);
      matrixState.addTarget(null, odd);

      const stops = matrixState.previewPropagation(odd, 'Tesseract');
      expect(stops.map(s => s.kind)).toEqual(['host', 'target']);
      expect(stops.map(s => s.name)).toEqual(['Ares-7', 'Rooftop Node']);

      matrixState.addMark(odd, 'Tesseract');

      expect(ares7.marks['Tesseract']).toBe(1);
      expect(rooftop.marks['Tesseract']).toBe(1);
    });

    // Review defect 6 — a host with no visited-set can be reached twice in
    // one chain if two different nodes both carry the same linkedHostId.
    it('previewPropagation() collapses a host reached via two hops in one chain to a single stop, with willLand reflecting the true remaining capacity (review defect 6)', () => {
      const sameHost = new MatrixHost({ id: 'h-dup', name: 'Shared-Host', rating: 4 });
      matrixState.addHost(sameHost);
      sameHost.marks['Tesseract'] = 2; // exactly one slot left before the 3-mark cap
      const parent = new MatrixTarget({
        id: 'p1', name: 'Parent Device', type: 'device', context: 'public', linkedHostId: sameHost.id
      });
      const child = new MatrixTarget({
        id: 'c1', name: 'Child Device', type: 'device', context: 'public',
        linkedHostId: sameHost.id, parentTargetId: 'p1'
      });
      matrixState.addTarget(null, parent);
      matrixState.addTarget(null, child);

      const stops = matrixState.previewPropagation(child, 'Tesseract');
      const hostStops = stops.filter(s => s.kind === 'host');

      // Before the fix: both hops emitted their own "Shared-Host" stop, and
      // both independently read currentMarks = 2 (nothing writes between
      // reads), so both said willLand: true - overpromising, since a host
      // with one slot left can only actually take one more mark.
      expect(hostStops.length).toBe(1);
      expect(hostStops[0].willLand).toBeTrue();
    });

    it("does not change what propagateMarkUp() actually writes when a host is reached twice in one chain - it still lands two marks there (review defect 6)", () => {
      const sameHost = new MatrixHost({ id: 'h-dup2', name: 'Shared-Host-2', rating: 4 });
      matrixState.addHost(sameHost);
      const parent = new MatrixTarget({
        id: 'p2', name: 'Parent Device 2', type: 'device', context: 'public', linkedHostId: sameHost.id
      });
      const child = new MatrixTarget({
        id: 'c2', name: 'Child Device 2', type: 'device', context: 'public',
        linkedHostId: sameHost.id, parentTargetId: 'p2'
      });
      matrixState.addTarget(null, parent);
      matrixState.addTarget(null, child);

      matrixState.addMark(child, 'Tesseract');

      // The preview reports this host once (test above); the write path is
      // untouched and still lands a mark from each hop that reaches it - two
      // real marks on one host from a single click, exactly as the pre-fix
      // recursive code did. Deduplicating collectPropagationStops() itself
      // (the shared enumerator) would have reduced this to one write and
      // silently changed live behaviour; the fix deliberately dedupes only
      // inside previewPropagation()'s returned array, never inside
      // collectPropagationStops() or propagateMarkUp().
      expect(sameHost.marks['Tesseract']).toBe(2);
      expect(parent.marks['Tesseract']).toBe(1);
      expect(child.marks['Tesseract']).toBe(1);
    });
  });

  // ── D-9 — jacking out erases marks from every host and target ──────────

  describe('MatrixStateService.jackOut() (D-9)', () => {
    let matrixState: MatrixStateService;
    let osTracking: OsTrackingService;

    beforeEach(() => {
      TestBed.configureTestingModule({ providers: appConfig.providers });
      matrixState = TestBed.inject(MatrixStateService);
      osTracking = TestBed.inject(OsTrackingService);
    });

    it('zeroes Overwatch (delegates to OsTrackingService.resetOS)', () => {
      const decker = new MatrixParticipant();
      decker.name = 'Tesseract';
      decker.overwatch = 34;
      spyOn(osTracking, 'resetOS').and.callThrough();

      matrixState.jackOut(decker);

      expect(decker.overwatch).toBe(0);
      expect(osTracking.resetOS).toHaveBeenCalledWith(decker);
    });

    it("erases the decker's marks from every host and every target inside it", () => {
      const decker = new MatrixParticipant();
      decker.name = 'Tesseract';
      const host = new MatrixHost({ id: 'h1', name: 'H', rating: 4 });
      host.marks['Tesseract'] = 2;
      const target = new MatrixTarget({ id: 't1', type: 'device', context: 'host', linkedHostId: host.id });
      target.marks['Tesseract'] = 3;
      host.targets.push(target);
      matrixState.addHost(host);

      matrixState.jackOut(decker);

      expect(host.marks['Tesseract']).toBeUndefined();
      expect(target.marks['Tesseract']).toBeUndefined();
    });

    it("erases the decker's marks from public-space targets too", () => {
      const decker = new MatrixParticipant();
      decker.name = 'Tesseract';
      const target = new MatrixTarget({ id: 't1', type: 'device', context: 'public' });
      target.marks['Tesseract'] = 1;
      matrixState.addTarget(null, target);

      matrixState.jackOut(decker);

      expect(target.marks['Tesseract']).toBeUndefined();
    });

    // Round-5 defect D-2: p. 242's other clause — marks IC or another decker
    // placed on *this decker's own persona icon* must be erased too, not
    // only the marks this decker placed on other icons.
    it("D-2: erases marks IC/other deckers placed on this decker's own persona icon", () => {
      const decker = new MatrixParticipant();
      decker.name = 'Tesseract';
      const persona = new MatrixTarget({
        id: 'persona-tesseract', type: 'persona', context: 'public', personaOwner: 'Tesseract'
      });
      persona.marks['KillerIC-1'] = 2;
      persona.marks['dev grrl'] = 1;
      matrixState.addTarget(null, persona);

      matrixState.jackOut(decker);

      expect(persona.marks['KillerIC-1']).toBeUndefined();
      expect(persona.marks['dev grrl']).toBeUndefined();
    });

    it("D-2: a different decker's own persona icon is untouched by this decker jacking out", () => {
      const decker = new MatrixParticipant();
      decker.name = 'Tesseract';
      const otherPersona = new MatrixTarget({
        id: 'persona-grrl', type: 'persona', context: 'public', personaOwner: 'dev grrl'
      });
      otherPersona.marks['SomeIC'] = 1;
      matrixState.addTarget(null, otherPersona);

      matrixState.jackOut(decker);

      expect(otherPersona.marks['SomeIC']).toBe(1);
    });

    it("D-2: also erases marks on the decker's own persona icon when it lives inside a host", () => {
      const decker = new MatrixParticipant();
      decker.name = 'Tesseract';
      const host = new MatrixHost({ id: 'h1', name: 'H', rating: 4 });
      const persona = new MatrixTarget({
        id: 'persona-tesseract', type: 'persona', context: 'host', linkedHostId: 'h1', personaOwner: 'Tesseract'
      });
      persona.marks['PatrolIC-1'] = 1;
      host.targets.push(persona);
      matrixState.addHost(host);

      matrixState.jackOut(decker);

      expect(persona.marks['PatrolIC-1']).toBeUndefined();
    });

    it("a teammate's marks on the same icon are untouched (marks are per-persona, p. 236)", () => {
      const decker = new MatrixParticipant();
      decker.name = 'Tesseract';
      const host = new MatrixHost({ id: 'h1', name: 'H', rating: 4 });
      host.marks['Tesseract'] = 2;
      host.marks['dev grrl'] = 3;
      matrixState.addHost(host);

      matrixState.jackOut(decker);

      expect(host.marks['Tesseract']).toBeUndefined();
      expect(host.marks['dev grrl']).toBe(3);
    });

    it('no cooldown — a decker can jack back out at 0 OS and 0 marks immediately (RULINGS.md 2026-08-29)', () => {
      const decker = new MatrixParticipant();
      decker.name = 'Tesseract';
      decker.overwatch = 39;
      const host = new MatrixHost({ id: 'h1', name: 'H', rating: 4 });
      host.marks['Tesseract'] = 3;
      matrixState.addHost(host);

      matrixState.jackOut(decker);

      expect(decker.overwatch).toBe(0);
      expect(host.marks['Tesseract']).toBeUndefined();
      expect(decker.jackedIn).toBeFalse();
    });

    // Round-5 defect D-3's reconciliation: gmJackOut() (battle-tracker.
    // component.ts, live) and MatrixStateService.jackOut() must agree on the
    // resulting vrMode — see jackOut()'s doc comment for why None was chosen
    // over the AR this method previously wrote.
    it('D-3: sets vrMode to VRMode.None, matching the live gmJackOut() button', () => {
      const decker = new MatrixParticipant();
      decker.name = 'Tesseract';
      decker.vrMode = VRMode.HotSim;

      matrixState.jackOut(decker);

      expect(decker.vrMode).toBe(VRMode.None);
    });
  });

  // ── D-13 — Matrix noise gets a real editor ──────────────────────────────

  describe('MatrixStateService.setNoise() / HierarchyEditorComponent noise editor (D-13)', () => {
    it('setNoise writes state.noise', () => {
      TestBed.configureTestingModule({ providers: appConfig.providers });
      const matrixState = TestBed.inject(MatrixStateService);
      expect(matrixState.state.noise).toBe(0);
      matrixState.setNoise(4);
      expect(matrixState.state.noise).toBe(4);
    });

    it('setNoise floors at 0 — noise is never negative', () => {
      TestBed.configureTestingModule({ providers: appConfig.providers });
      const matrixState = TestBed.inject(MatrixStateService);
      matrixState.setNoise(-3);
      expect(matrixState.state.noise).toBe(0);
    });

    it('setNoise never fires stateChange$ when the value does not actually change', () => {
      TestBed.configureTestingModule({ providers: appConfig.providers });
      const matrixState = TestBed.inject(MatrixStateService);
      let fireCount = 0;
      matrixState.stateChange$.subscribe(() => fireCount++);
      matrixState.setNoise(0); // already 0
      expect(fireCount).toBe(0);
    });

    it('HierarchyEditorComponent.onNoiseChanged() writes through to MatrixStateService.setNoise', async () => {
      await TestBed.configureTestingModule({
        imports: [HierarchyEditorComponent],
        providers: appConfig.providers
      }).compileComponents();
      const fixture = TestBed.createComponent(HierarchyEditorComponent);
      const component = fixture.componentInstance;
      component.activeDeckers = [];
      fixture.detectChanges();

      component.onNoiseChanged(6);
      expect(component.state.noise).toBe(6);

      // NgModel defers writeValue() to a microtask (Promise.resolve().then())
      // to dodge ExpressionChangedAfterItHasBeenCheckedError — one
      // detectChanges() schedules it, whenStable() flushes it.
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const input = fixture.debugElement.query(By.css('#hier-noise-input')).nativeElement as HTMLInputElement;
      expect(input.value).toBe('6');
    });
  });

  // ── Preserved behaviour (AC-32, AC-33) + S8 ────────────────────────────

  describe('OsTrackingService (AC-32, AC-33, S8)', () => {
    let osTracking: OsTrackingService;

    beforeEach(() => {
      TestBed.configureTestingModule({ providers: appConfig.providers });
      osTracking = TestBed.inject(OsTrackingService);
    });

    function decker(os: number): MatrixParticipant {
      const mp = new MatrixParticipant();
      mp.name = 'Decker';
      mp.overwatch = os;
      return mp;
    }

    // AC-32
    it('AC-32: addOS with a delta of 0 moves nothing', () => {
      const mp = decker(14);
      osTracking.addOS(mp, 0, 'test');
      expect(mp.overwatch).toBe(14);
    });

    // AC-33 / S8 — walking Overwatch from 14 to 22 fires no threshold event
    it('AC-33/S8: walking Overwatch 14 -> 22 by GM increments fires no threshold event and changes band only at 15', () => {
      const mp = decker(14);
      const events: string[] = [];
      const sub = osTracking.threshold$.subscribe(e => events.push(e.alert));

      expect(osTracking.getOSBand(mp)).toBe('low');
      osTracking.addOS(mp, 1, 'test'); // 15
      expect(mp.overwatch).toBe(15);
      expect(osTracking.getOSBand(mp)).toBe('building');

      osTracking.addOS(mp, 7, 'test'); // 22
      expect(mp.overwatch).toBe(22);
      expect(osTracking.getOSBand(mp)).toBe('building');
      expect(events).toEqual([]);
      sub.unsubscribe();
    });
  });

  // ── Nameless participants cannot hold marks ────────────────────────────
  //
  // Found by Xavier testing the newly-mounted Matrix panel by hand
  // (2026-09-03): the +Mark picker rendered a dropdown with one blank entry
  // and its confirm button did nothing. Cause: `BattleTrackerComponent`'s
  // constructor seeds one untouched blank participant row on every tab load,
  // and the run-panel getter passed it through as a decker. `marks` is keyed
  // by `decker.name`, so a nameless participant is not addressable at all —
  // it reached the picker as an option with an empty value, and
  // `confirmAddMark()` bailed on the falsy id without saying why.
  describe('nameless participants are not deckers (2026-09-03)', () => {
    let fixture: ComponentFixture<TargetCardComponent>;
    let component: TargetCardComponent;
    let device: MatrixTarget;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [TargetCardComponent],
        providers: appConfig.providers
      }).compileComponents();

      fixture = TestBed.createComponent(TargetCardComponent);
      component = fixture.componentInstance;
      device = new MatrixTarget({ id: 'd1', name: 'Maglock', type: 'device', context: 'public' });
      component.target = device;
      component.host = null;
    });

    it('availableDeckers excludes a participant with no name', () => {
      const nameless = new MatrixParticipant();
      nameless.name = '';
      const named = new MatrixParticipant();
      named.name = 'Tesseract';
      component.activeDeckers = [nameless, named];
      fixture.detectChanges();

      expect(component.availableDeckers.map(d => d.name)).toEqual(['Tesseract']);
    });

    it('availableDeckers excludes a whitespace-only name', () => {
      const blank = new MatrixParticipant();
      blank.name = '   ';
      component.activeDeckers = [blank];
      fixture.detectChanges();

      expect(component.availableDeckers).toEqual([]);
    });

    it('the confirm button is blocked, with a stated reason, when no decker is selected', () => {
      component.activeDeckers = [];
      fixture.detectChanges();

      expect(component.canConfirmAddMark).toBeFalse();
      expect(component.addMarkBlockedReason).toBe('Pick a decker first');
    });

    it('the confirm button is blocked, with a stated reason, at the 3-mark cap (p. 236)', () => {
      const decker = new MatrixParticipant();
      decker.name = 'Tesseract';
      device.marks['Tesseract'] = 3;
      component.activeDeckers = [decker];
      component.selectedDeckerId = 'Tesseract';
      fixture.detectChanges();

      expect(component.canConfirmAddMark).toBeFalse();
      expect(component.addMarkBlockedReason).toContain('maximum 3 marks');
    });

    it('a named decker under the cap can confirm', () => {
      const decker = new MatrixParticipant();
      decker.name = 'Tesseract';
      component.activeDeckers = [decker];
      component.openAddMark();
      fixture.detectChanges();

      expect(component.selectedDeckerId).toBe('Tesseract');
      expect(component.canConfirmAddMark).toBeTrue();
    });
  });
});
