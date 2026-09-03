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

import { ComponentFixture, TestBed } from '@angular/core/testing';
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
import { TargetCardComponent } from 'app/matrix/target-card/target-card.component';

import { MatrixStateService } from 'app/services/matrix-state.service';
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

describe('Matrix port rules correctness (briefs/matrix-port-rules-correctness-spec.md)', () => {

  // ── Claim 1 (AC-1 to AC-6) + Claim 2 (AC-7 to AC-10) — access-host-panel ──

  describe('AccessHostPanelComponent', () => {
    let fixture: ComponentFixture<AccessHostPanelComponent>;
    let component: AccessHostPanelComponent;
    let matrixState: MatrixStateService;
    let osTracking: OsTrackingService;
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
      osTracking = TestBed.inject(OsTrackingService);
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

    it('Decision 8: the rendered public-space tree does not show a Parent control for a file', () => {
      const file = new MatrixTarget({ id: 'file1', name: 'Paydata', type: 'file', context: 'public' });
      matrixState.addTarget(null, file);
      fixture.detectChanges();

      const parentRows = fixture.debugElement.queryAll(By.css('.hier-parent-row'));
      // Two devices in the fixture (device, weapon) get a Parent control; the
      // added file does not.
      expect(parentRows.length).toBe(2);
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

    it('propagationPreview names the host a device-in-host target will also mark, before the GM commits', () => {
      const device = new MatrixTarget({ id: 'd1', type: 'device', context: 'host', linkedHostId: host.id });
      component.target = device;
      component.host = host;
      component.activeDeckers = [];
      fixture.detectChanges();

      expect(component.propagationPreview).toBe('Also marks Host: Ares-7');
    });

    it('propagationPreview names the device parent an open-grid device will also mark', () => {
      const mount = new MatrixTarget({ id: 'm1', name: 'Weapon Mount', type: 'device', context: 'public' });
      const rifle = new MatrixTarget({ id: 'r1', type: 'device', context: 'public', parentTargetId: 'm1' });
      matrixState.addTarget(null, mount);
      matrixState.addTarget(null, rifle);
      component.target = rifle;
      component.host = null;
      component.activeDeckers = [];
      fixture.detectChanges();

      expect(component.propagationPreview).toBe('Also marks: Weapon Mount');
    });

    it('propagationPreview is null for a file, even inside a host (Decision 8 — files do not propagate)', () => {
      const file = new MatrixTarget({ id: 'f1', type: 'file', context: 'host', linkedHostId: host.id });
      component.target = file;
      component.host = host;
      component.activeDeckers = [];
      fixture.detectChanges();

      expect(component.propagationPreview).toBeNull();
    });

    it('propagationPreview is null for a device with nothing to propagate to', () => {
      const device = new MatrixTarget({ id: 'd1', type: 'device', context: 'public' });
      component.target = device;
      component.host = null;
      component.activeDeckers = [];
      fixture.detectChanges();

      expect(component.propagationPreview).toBeNull();
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

    it('the +Mark confirm step shows the propagation preview text in the rendered template', () => {
      const device = new MatrixTarget({ id: 'd1', type: 'device', context: 'host', linkedHostId: host.id });
      const decker = new MatrixParticipant();
      decker.name = 'Tesseract';
      component.target = device;
      component.host = host;
      component.activeDeckers = [decker];
      fixture.detectChanges();

      component.openAddMark();
      fixture.detectChanges();

      expect(textContains(fixture, 'Also marks Host: Ares-7')).toBeTrue();
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
