// Acceptance-criteria and scenario tests for
// briefs/matrix-graph-readability-spec.md.
//
// Covers the "Sizing" (AC-1..AC-6), "Marks" (AC-7..AC-15, AC-16' replacing
// the struck AC-16, AC-17), "Edges" (AC-18..AC-20) and "Reactivity"
// (AC-21..AC-22) acceptance criteria, plus scenarios S1-S6. AC-23 (the
// `ARCHITECTURE.md` correction) is documentation-only and is not machine
// asserted, per the spec.
//
// Binding decisions this file enforces (Xavier, 2026-09-11, all at the top
// of the spec): no propagation badge anywhere on the graph (Decision 4,
// AC-16'); the current host gets its own node (Decision 2); host->contents
// and child->parent edges (Decision 3).

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SimpleChange } from '@angular/core';
import { appConfig } from 'app/app.config';

import {
  MatrixGraphComponent,
  GRAPH_MIN_WIDTH,
  GRAPH_MAX_WIDTH,
  GRAPH_DEFAULT_WIDTH,
  GRAPH_MIN_HEIGHT,
  MIN_GRAPH_FONT_PX,
  GRAPH_GRID_CELL_H
} from 'app/matrix/matrix-graph/matrix-graph.component';
import { MatrixStateService, MARK_CAP } from 'app/services/matrix-state.service';
import { MatrixHost, MatrixTarget, MatrixParticipant, VRMode } from 'Matrix';

/**
 * A `ResizeObserver` stand-in that hands its callback back to the test so
 * a resize can be simulated deterministically ("Simulate by changing the
 * measured width and firing the ResizeObserver callback", S4/S5). Real
 * `ResizeObserver` timing is not itself under test — the component's own
 * reaction to a callback firing is.
 */
class FakeResizeObserver {
  static last: FakeResizeObserver | null = null;
  disconnected = false;
  constructor(public callback: ResizeObserverCallback) {
    FakeResizeObserver.last = this;
  }
  observe(): void { /* no-op */ }
  unobserve(): void { /* no-op */ }
  disconnect(): void { this.disconnected = true; }
}

function setClientWidth(el: HTMLElement, width: number): void {
  Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
}

function fireResize(width: number): void {
  const obs = FakeResizeObserver.last;
  if (!obs) throw new Error('No ResizeObserver was constructed');
  obs.callback([{ contentRect: { width } } as unknown as ResizeObserverEntry], obs as unknown as ResizeObserver);
}

describe('Matrix graph readability (briefs/matrix-graph-readability-spec.md)', () => {
  let originalResizeObserver: typeof ResizeObserver | undefined;

  beforeEach(() => {
    originalResizeObserver = (window as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = FakeResizeObserver;
    FakeResizeObserver.last = null;
  });

  afterEach(() => {
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = originalResizeObserver;
  });

  let fixture: ComponentFixture<MatrixGraphComponent>;
  let component: MatrixGraphComponent;
  let matrixState: MatrixStateService;

  async function mount(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [MatrixGraphComponent],
      providers: appConfig.providers
    }).compileComponents();

    fixture = TestBed.createComponent(MatrixGraphComponent);
    component = fixture.componentInstance;
    matrixState = TestBed.inject(MatrixStateService);
  }

  function makeDecker(name: string, vrMode: VRMode = VRMode.HotSim): MatrixParticipant {
    const d = new MatrixParticipant();
    d.name = name;
    d.jackedIn = true;
    d.vrMode = vrMode;
    return d;
  }

  // ── Sizing (AC-1 to AC-6) ────────────────────────────────────────────────

  describe('Sizing', () => {
    it('AC-1: rendered <svg> width/height/viewBox all agree with a 700px measured host — render scale is exactly 1', async () => {
      await mount();
      matrixState.addTarget(null, new MatrixTarget({ id: 't1', name: 'Loose Device', type: 'device', context: 'public' }));
      setClientWidth(fixture.nativeElement, 700);
      component.gmMode = true;
      fixture.detectChanges();

      const svg = fixture.nativeElement.querySelector('svg') as SVGSVGElement;
      expect(svg.getAttribute('width')).toBe('700');
      expect(svg.getAttribute('height')).toBe(String(component.svgH));
      expect(svg.getAttribute('viewBox')).toBe(`0 0 700 ${component.svgH}`);
    });

    it('AC-2: a 0px measured host falls through to GRAPH_DEFAULT_WIDTH, never NaN or 0 0', async () => {
      await mount();
      matrixState.addTarget(null, new MatrixTarget({ id: 't1', name: 'Loose Device', type: 'device', context: 'public' }));
      setClientWidth(fixture.nativeElement, 0);
      component.gmMode = true;
      fixture.detectChanges();

      expect(component.svgW).toBe(GRAPH_DEFAULT_WIDTH);
      const svg = fixture.nativeElement.querySelector('svg') as SVGSVGElement;
      const viewBox = svg.getAttribute('viewBox') ?? '';
      expect(viewBox).not.toContain('NaN');
      expect(viewBox).not.toMatch(/^0 0 0(\s|$)/);
    });

    it('AC-3: svgW is clamped to [GRAPH_MIN_WIDTH, GRAPH_MAX_WIDTH]', async () => {
      await mount();
      matrixState.addTarget(null, new MatrixTarget({ id: 't1', name: 'Loose Device', type: 'device', context: 'public' }));
      component.gmMode = true;

      setClientWidth(fixture.nativeElement, 200);
      fixture.detectChanges();
      expect(component.svgW).toBe(GRAPH_MIN_WIDTH);

      setClientWidth(fixture.nativeElement, 3000);
      fireResize(3000);
      fixture.detectChanges();
      expect(component.svgW).toBe(GRAPH_MAX_WIDTH);
    });

    it('AC-4: the background grid <rect> width/height follow svgW/svgH, not literal 800/460, at two different widths', async () => {
      await mount();
      matrixState.addTarget(null, new MatrixTarget({ id: 't1', name: 'Loose Device', type: 'device', context: 'public' }));
      component.gmMode = true;

      setClientWidth(fixture.nativeElement, 700);
      fixture.detectChanges();
      let rect = fixture.nativeElement.querySelector('svg rect') as SVGRectElement;
      expect(rect.getAttribute('width')).toBe('700');
      expect(rect.getAttribute('height')).toBe(String(component.svgH));

      setClientWidth(fixture.nativeElement, 900);
      fireResize(900);
      fixture.detectChanges();
      rect = fixture.nativeElement.querySelector('svg rect') as SVGRectElement;
      expect(rect.getAttribute('width')).toBe('900');
      expect(rect.getAttribute('height')).toBe(String(component.svgH));
    });

    it('AC-5: every rendered <text> in GM mode has a computed font-size >= MIN_GRAPH_FONT_PX', async () => {
      await mount();
      const host = new MatrixHost({ id: 'h1', name: 'Ares-7', rating: 8 });
      matrixState.addHost(host);
      matrixState.setCurrentHost(host.id);
      matrixState.addTarget(host, new MatrixTarget({ id: 'd1', name: 'Maglock', type: 'device', context: 'host', marks: { Tesseract: 2 } }));
      component.gmMode = true;
      component.activeDeckers = [makeDecker('Tesseract')];
      setClientWidth(fixture.nativeElement, 700);
      fixture.detectChanges();

      const texts = Array.from(fixture.nativeElement.querySelectorAll('svg text')) as SVGTextElement[];
      expect(texts.length).toBeGreaterThan(0);
      for (const t of texts) {
        const size = parseFloat(getComputedStyle(t).fontSize);
        expect(size).toBeGreaterThanOrEqual(MIN_GRAPH_FONT_PX);
      }
    });

    it('AC-5 (player mode): every rendered <text> also meets the floor', async () => {
      await mount();
      component.gmMode = false;
      component.myDeckerName = 'Tesseract';
      component.targets = [{
        id: 't1', name: 'Device', type: 'device', visibility: 'active', marks: { Tesseract: 1 }
      } as never];
      setClientWidth(fixture.nativeElement, 700);
      fixture.detectChanges();

      const texts = Array.from(fixture.nativeElement.querySelectorAll('svg text')) as SVGTextElement[];
      expect(texts.length).toBeGreaterThan(0);
      for (const t of texts) {
        const size = parseFloat(getComputedStyle(t).fontSize);
        expect(size).toBeGreaterThanOrEqual(MIN_GRAPH_FONT_PX);
      }
    });

    it('AC-6: svgH grows with node count, and never drops below GRAPH_MIN_HEIGHT', async () => {
      await mount();
      const host = new MatrixHost({ id: 'h1', name: 'Ares-7', rating: 8 });
      matrixState.addHost(host);
      matrixState.setCurrentHost(host.id);
      for (let i = 0; i < 3; i++) {
        matrixState.addTarget(host, new MatrixTarget({ id: `d${i}`, name: `Device ${i}`, type: 'device', context: 'host' }));
      }
      component.gmMode = true;
      setClientWidth(fixture.nativeElement, 700);
      fixture.detectChanges();
      const smallH = component.svgH;
      expect(smallH).toBeGreaterThanOrEqual(GRAPH_MIN_HEIGHT);

      for (let i = 3; i < 12; i++) {
        matrixState.addTarget(host, new MatrixTarget({ id: `d${i}`, name: `Device ${i}`, type: 'device', context: 'host' }));
      }
      fixture.detectChanges();
      expect(component.svgH).toBeGreaterThan(smallH);
      expect(component.svgH).toBeGreaterThanOrEqual(GRAPH_MIN_HEIGHT);
    });
  });

  // ── Lifecycle ────────────────────────────────────────────────────────────

  describe('Lifecycle', () => {
    it('R5: ngOnDestroy disconnects the ResizeObserver (the panel is mounted/unmounted every Matrix-panel toggle)', async () => {
      await mount();
      matrixState.addTarget(null, new MatrixTarget({ id: 't1', name: 'Loose Device', type: 'device', context: 'public' }));
      component.gmMode = true;
      setClientWidth(fixture.nativeElement, 700);
      fixture.detectChanges();

      const obs = FakeResizeObserver.last;
      expect(obs).not.toBeNull();
      expect(obs!.disconnected).toBeFalse();

      fixture.destroy();

      expect(obs!.disconnected).toBeTrue();
    });
  });

  // ── Marks (AC-7 to AC-17) ────────────────────────────────────────────────

  describe('Marks', () => {
    it('AC-7: a target with marks {Tesseract:2} produces exactly one mark row with initials TE and filled 2', async () => {
      await mount();
      const rows = component.markRows({ Tesseract: 2 });
      expect(rows.length).toBe(1);
      expect(rows[0].initials).toBe('TE');
      expect(rows[0].filled).toBe(2);
    });

    it('AC-8: that row\'s rendered glyph string is "●●○"', async () => {
      await mount();
      const rows = component.markRows({ Tesseract: 2 });
      expect(component.markGlyphs(rows[0])).toBe('●●○');
    });

    it('AC-9: MARK_CAP is imported and used — {A:5} renders MARK_CAP filled dots, no empty ones, one row', async () => {
      await mount();
      const rows = component.markRows({ A: 5 });
      expect(rows.length).toBe(1);
      expect(component.markGlyphs(rows[0])).toBe('●'.repeat(MARK_CAP));
    });

    it('AC-10: three deckers holding one mark each produce three rows; one decker holding three produces one row', async () => {
      await mount();
      const three = component.markRows({ A: 1, B: 1, C: 1 });
      const one = component.markRows({ A: 3 });
      expect(three.length).toBe(3);
      expect(one.length).toBe(1);
    });

    it('AC-11: five deckers at three marks each produce 4 owner rows + one "+1" overflow row; total filled glyphs is 12, not 15', async () => {
      await mount();
      const rows = component.markRows({ Alice: 3, Bob: 3, Carl: 3, Dana: 3, Eve: 3 });
      expect(rows.length).toBe(5);
      expect(rows[4].overflow).toBeTrue();
      expect(rows[4].owner).toBe('+1');
      const total = rows.map(r => component.markGlyphs(r)).join('').split('').filter(c => c === '●').length;
      expect(total).toBe(12);
    });

    it('AC-12: a node with no marks produces zero mark rows and renders no mark <text>', async () => {
      await mount();
      matrixState.addTarget(null, new MatrixTarget({ id: 't1', name: 'Clean Device', type: 'device', context: 'public' }));
      component.gmMode = true;
      setClientWidth(fixture.nativeElement, 700);
      fixture.detectChanges();

      expect(component.markRows({})).toEqual([]);
      const markTexts = fixture.nativeElement.querySelectorAll('.mgn-mark-row');
      expect(markTexts.length).toBe(0);
    });

    it('AC-13: persona marks — a jacked-in decker\'s persona-me node picks up marks from a matching persona target', async () => {
      await mount();
      matrixState.addTarget(null, new MatrixTarget({
        id: 'p1', name: 'Tesseract', type: 'persona', personaOwner: 'Tesseract', context: 'public',
        marks: { 'IC-1': 1 }
      }));
      component.gmMode = true;
      component.activeDeckers = [makeDecker('Tesseract')];
      setClientWidth(fixture.nativeElement, 700);
      fixture.detectChanges();

      const persona = component.displayNodes.find(n => n.kind === 'persona-me');
      expect(persona?.marks).toEqual({ 'IC-1': 1 });
      expect(component.markRows(persona!.marks).length).toBe(1);
    });

    it('D1: a marked persona target folded into persona-me does not also render as a second, duplicate node (public space)', async () => {
      await mount();
      matrixState.addTarget(null, new MatrixTarget({
        id: 'p1', name: 'Tesseract', type: 'persona', personaOwner: 'Tesseract', context: 'public',
        marks: { 'IC-1': 1 }
      }));
      component.gmMode = true;
      component.activeDeckers = [makeDecker('Tesseract')];
      setClientWidth(fixture.nativeElement, 700);
      fixture.detectChanges();

      // Exactly one node carries Tesseract's identity/marks — not a
      // persona-me node plus a leftover persona-other node from the target
      // loop (D1: the persona target must not be double-rendered).
      const tesseractNodes = component.displayNodes.filter(
        n => n.kind === 'persona-me' || (n.kind === 'persona-other' && n.label === 'Tesseract')
      );
      expect(tesseractNodes.length).toBe(1);
      expect(component.displayNodes.find(n => n.id === 'p1' && n.kind === 'persona-other')).toBeUndefined();
    });

    it('D1: a persona target with no matching jacked-in decker still renders as an ordinary node', async () => {
      await mount();
      matrixState.addTarget(null, new MatrixTarget({
        id: 'p2', name: 'Ghost', type: 'persona', personaOwner: 'Ghost', context: 'public',
        marks: { 'IC-1': 1 }
      }));
      component.gmMode = true;
      component.activeDeckers = []; // nobody jacked in — 'Ghost' is not folded into any persona-me node
      setClientWidth(fixture.nativeElement, 700);
      fixture.detectChanges();

      const ghostNode = component.displayNodes.find(n => n.id === 'p2');
      expect(ghostNode).toBeDefined();
      expect(ghostNode!.kind).toBe('persona-other');
      expect(ghostNode!.marks).toEqual({ 'IC-1': 1 });
      expect(component.displayNodes.some(n => n.kind === 'persona-me')).toBeFalse();
    });

    it('AC-13: with no matching persona target, the persona node carries {} and renders no mark rows', async () => {
      await mount();
      component.gmMode = true;
      component.activeDeckers = [makeDecker('Tesseract')];
      setClientWidth(fixture.nativeElement, 700);
      fixture.detectChanges();

      const persona = component.displayNodes.find(n => n.kind === 'persona-me');
      expect(persona?.marks).toEqual({});
      expect(component.markRows(persona!.marks).length).toBe(0);
    });

    it('AC-14: host marks while inside a host — a "host" node carries the host\'s own marks record and renders TE●●○', async () => {
      await mount();
      const host = new MatrixHost({ id: 'h1', name: 'Ares-7', rating: 8 });
      host.marks = { Tesseract: 2 };
      matrixState.addHost(host);
      matrixState.setCurrentHost(host.id);
      component.gmMode = true;
      setClientWidth(fixture.nativeElement, 700);
      fixture.detectChanges();

      const hostNode = component.displayNodes.find(n => n.kind === 'host');
      expect(hostNode).toBeDefined();
      expect(hostNode!.marks).toBe(host.marks);
      const rows = component.markRows(hostNode!.marks);
      expect(rows.length).toBe(1);
      expect(component.markRowText(rows[0])).toBe('TE●●○');
    });

    it('AC-15: public-space host marks (regression) — each host in state.hosts still produces a node carrying that host\'s marks', async () => {
      await mount();
      const host = new MatrixHost({ id: 'h1', name: 'Ares-7', rating: 8 });
      host.marks = { Tesseract: 1 };
      matrixState.addHost(host);
      // No setCurrentHost — public space.
      component.gmMode = true;
      setClientWidth(fixture.nativeElement, 700);
      fixture.detectChanges();

      const hostNode = component.displayNodes.find(n => n.id === 'h1');
      expect(hostNode?.marks).toEqual({ Tesseract: 1 });
    });

    it('AC-16\': a mark that arrived by propagation renders identically to a directly placed one; no propagation class exists', async () => {
      await mount();
      const withPropagation = { Tesseract: 1 };
      const rowsA = component.markRows(withPropagation);
      const rowsB = component.markRows({ Tesseract: 1 });
      expect(rowsA).toEqual(rowsB);
      expect(component.markGlyphs(rowsA[0])).toBe(component.markGlyphs(rowsB[0]));

      matrixState.addTarget(null, new MatrixTarget({
        id: 't1', name: 'Weapon Mount', type: 'device', context: 'public',
        marks: { Tesseract: 1 }, propagatedMarks: { Tesseract: true }
      }));
      component.gmMode = true;
      setClientWidth(fixture.nativeElement, 700);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.mgn-mark-propagated')).toBeNull();
      expect(fixture.nativeElement.innerHTML).not.toContain('mgn-mark-propagated');
    });

    it('AC-17: the legend has a marks key and no propagation key', async () => {
      await mount();
      component.gmMode = true;
      setClientWidth(fixture.nativeElement, 700);
      fixture.detectChanges();

      const legendText = (fixture.nativeElement.querySelector('.mgn-legend') as HTMLElement).textContent ?? '';
      expect(legendText).toContain('marks');
      expect(legendText.toLowerCase()).not.toContain('propagat');
    });
  });

  // ── Edges (AC-18 to AC-20) ───────────────────────────────────────────────

  describe('Edges', () => {
    it('AC-18: inside a host with three targets, edges has exactly three entries, each from the host node to one target', async () => {
      await mount();
      const host = new MatrixHost({ id: 'h1', name: 'Ares-7', rating: 8 });
      matrixState.addHost(host);
      matrixState.setCurrentHost(host.id);
      matrixState.addTarget(host, new MatrixTarget({ id: 'd1', name: 'Maglock', type: 'device', context: 'host' }));
      matrixState.addTarget(host, new MatrixTarget({ id: 'd2', name: 'Paydata', type: 'file', context: 'host' }));
      matrixState.addTarget(host, new MatrixTarget({ id: 'd3', name: 'Patrol IC', type: 'ic', context: 'host' }));
      component.gmMode = true;
      setClientWidth(fixture.nativeElement, 700);
      fixture.detectChanges();

      expect(component.edges.length).toBe(3);
      for (const e of component.edges) {
        expect(e.fromId).toBe('h1');
      }
      expect(component.edges.map(e => e.toId).sort()).toEqual(['d1', 'd2', 'd3']);
    });

    it('AC-19: in public space, a child with a rendered parent produces one child->parent edge; an unresolvable parent produces none and does not throw', async () => {
      await mount();
      const a = new MatrixTarget({ id: 'a1', name: 'Drone', type: 'device', context: 'public' });
      const b = new MatrixTarget({ id: 'b1', name: 'Weapon Mount', type: 'device', context: 'public', parentTargetId: 'a1' });
      const c = new MatrixTarget({ id: 'c1', name: 'Ghost Ref', type: 'device', context: 'public', parentTargetId: 'nonexistent' });
      matrixState.addTarget(null, a);
      matrixState.addTarget(null, b);
      matrixState.addTarget(null, c);
      component.gmMode = true;
      setClientWidth(fixture.nativeElement, 700);
      expect(() => fixture.detectChanges()).not.toThrow();

      expect(component.edges.length).toBe(1);
      expect(component.edges[0]).toEqual({ fromId: 'b1', toId: 'a1' });
    });

    it('AC-20: every rendered .mgn-edge line appears before the first .mgn-node group in document order', async () => {
      await mount();
      const host = new MatrixHost({ id: 'h1', name: 'Ares-7', rating: 8 });
      matrixState.addHost(host);
      matrixState.setCurrentHost(host.id);
      matrixState.addTarget(host, new MatrixTarget({ id: 'd1', name: 'Maglock', type: 'device', context: 'host' }));
      component.gmMode = true;
      setClientWidth(fixture.nativeElement, 700);
      fixture.detectChanges();

      const svg = fixture.nativeElement.querySelector('svg') as SVGSVGElement;
      const children = Array.from(svg.querySelectorAll('line.mgn-edge, g[class*="mgn-node"]'));
      const firstNodeIndex = children.findIndex(el => el.tagName.toLowerCase() === 'g');
      const lastEdgeIndex = children.map((el, i) => (el.tagName.toLowerCase() === 'line' ? i : -1))
        .filter(i => i >= 0)
        .pop() ?? -1;
      expect(lastEdgeIndex).toBeLessThan(firstNodeIndex);
    });
  });

  // ── Reactivity (AC-21 to AC-22) ──────────────────────────────────────────

  describe('Reactivity', () => {
    it('AC-21: addMark on a target in the current context updates the graph after one change-detection cycle', async () => {
      await mount();
      const target = new MatrixTarget({ id: 't1', name: 'Loose Device', type: 'device', context: 'public' });
      matrixState.addTarget(null, target);
      component.gmMode = true;
      setClientWidth(fixture.nativeElement, 700);
      fixture.detectChanges();

      let node = component.displayNodes.find(n => n.id === 't1');
      expect(component.markRows(node!.marks).length).toBe(0);

      matrixState.addMark(target, 'Tesseract');
      fixture.detectChanges();

      node = component.displayNodes.find(n => n.id === 't1');
      expect(component.markRows(node!.marks).length).toBe(1);
    });

    it('AC-22: re-assigning activeDeckers to an equivalent array does not trigger a rebuild; a real change does', async () => {
      await mount();
      component.gmMode = true;
      const decker = makeDecker('Tesseract');
      component.activeDeckers = [decker];
      setClientWidth(fixture.nativeElement, 700);
      fixture.detectChanges();

      // Rebuild detection via `displayNodes` identity: `buildGMNodes()`
      // always assigns a fresh array, so an unchanged reference after
      // `ngOnChanges` is direct evidence the §7 guard skipped the rebuild.
      const before = component.displayNodes;

      const sameShapeCopy = [makeDecker('Tesseract')]; // new array, same name/jackedIn/vrMode
      component.activeDeckers = sameShapeCopy;
      component.ngOnChanges({ activeDeckers: new SimpleChange([decker], sameShapeCopy, false) });
      fixture.detectChanges();
      expect(component.displayNodes).toBe(before); // unchanged reference — no rebuild happened

      const differentDecker = [makeDecker('Fianchetto')];
      component.activeDeckers = differentDecker;
      component.ngOnChanges({ activeDeckers: new SimpleChange(sameShapeCopy, differentDecker, false) });
      fixture.detectChanges();
      expect(component.displayNodes).not.toBe(before); // rebuilt
    });
  });

  // ── Scenarios ─────────────────────────────────────────────────────────────

  describe('S1 — ordinary: inside a host, marks visible on contents and on the host itself', () => {
    it('renders 5 nodes, host marks with no propagation indicator, content marks, and 3 edges from the host', async () => {
      await mount();
      const host = new MatrixHost({ id: 'h1', name: 'Ares-7', rating: 8 });
      host.marks = { Tesseract: 1 };
      host.propagatedMarks = { Tesseract: true };
      matrixState.addHost(host);
      matrixState.setCurrentHost(host.id);
      matrixState.addTarget(host, new MatrixTarget({ id: 'maglock', name: 'Maglock', type: 'device', context: 'host', marks: { Tesseract: 2 } }));
      matrixState.addTarget(host, new MatrixTarget({ id: 'paydata', name: 'Paydata', type: 'file', context: 'host' }));
      matrixState.addTarget(host, new MatrixTarget({ id: 'patrol', name: 'Patrol IC', type: 'ic', context: 'host' }));

      component.gmMode = true;
      component.activeDeckers = [makeDecker('Tesseract')];
      setClientWidth(fixture.nativeElement, 700);
      fixture.detectChanges();

      expect(component.displayNodes.length).toBe(5);
      expect(component.displayNodes.filter(n => n.kind === 'persona-me').length).toBe(1);
      expect(component.displayNodes.filter(n => n.kind === 'host').length).toBe(1);

      const hostNode = component.displayNodes.find(n => n.kind === 'host')!;
      const hostRows = component.markRows(hostNode.marks);
      expect(component.markRowText(hostRows[0])).toBe('TE●○○');

      const maglock = component.displayNodes.find(n => n.id === 'maglock')!;
      expect(component.markRowText(component.markRows(maglock.marks)[0])).toBe('TE●●○');

      const paydata = component.displayNodes.find(n => n.id === 'paydata')!;
      const patrol = component.displayNodes.find(n => n.id === 'patrol')!;
      expect(component.markRows(paydata.marks).length).toBe(0);
      expect(component.markRows(patrol.marks).length).toBe(0);

      expect(component.edges.length).toBe(3);
      expect(component.edges.every(e => e.fromId === 'h1')).toBeTrue();

      const svg = fixture.nativeElement.querySelector('svg') as SVGSVGElement;
      expect(svg.getAttribute('width')).toBe('700');

      const texts = Array.from(fixture.nativeElement.querySelectorAll('svg text')) as SVGTextElement[];
      for (const t of texts) {
        expect(parseFloat(getComputedStyle(t).fontSize)).toBeGreaterThanOrEqual(MIN_GRAPH_FONT_PX);
      }

      // No propagation indicator anywhere despite the host's propagatedMarks.
      expect(fixture.nativeElement.querySelector('.mgn-mark-propagated')).toBeNull();
    });
  });

  describe('S2 — edge case: twelve icons, five deckers, all at cap', () => {
    it('uses the grid branch, caps one node at 4 rows + overflow, grows svgH, and never throws', async () => {
      await mount();
      const host = new MatrixHost({ id: 'h1', name: 'Ares-7', rating: 8 });
      matrixState.addHost(host);
      matrixState.setCurrentHost(host.id);
      for (let i = 0; i < 12; i++) {
        matrixState.addTarget(host, new MatrixTarget({ id: `dev${i}`, name: `Device ${i}`, type: 'device', context: 'host' }));
      }
      const capped = new MatrixTarget({
        id: 'dev0', name: 'Device 0', type: 'device', context: 'host',
        marks: { Alice: 3, Bob: 3, Carl: 3, Dana: 3, Eve: 3 }
      });
      host.targets[0] = capped;

      component.gmMode = true;
      component.activeDeckers = ['Alice', 'Bob', 'Carl', 'Dana', 'Eve'].map(n => makeDecker(n));
      setClientWidth(fixture.nativeElement, 700);
      expect(() => fixture.detectChanges()).not.toThrow();

      const cappedNode = component.displayNodes.find(n => n.id === 'dev0')!;
      const rows = component.markRows(cappedNode.marks);
      expect(rows.length).toBe(5);
      expect(rows[4].overflow).toBeTrue();
      const total = rows.map(r => component.markGlyphs(r)).join('').split('').filter(c => c === '●').length;
      expect(total).toBe(12);

      expect(component.svgH).toBeGreaterThanOrEqual(GRAPH_MIN_HEIGHT);

      const texts = Array.from(fixture.nativeElement.querySelectorAll('svg text')) as SVGTextElement[];
      for (const t of texts) {
        expect(parseFloat(getComputedStyle(t).fontSize)).toBeGreaterThanOrEqual(MIN_GRAPH_FONT_PX);
      }

      // S2's own property: in the grid branch, no two node centres are
      // closer than the grid's cell dimensions — a regression in the row/
      // column spacing arithmetic (e.g. dividing by the wrong axis, or
      // reusing one cell dimension for both) would collapse two centres
      // together well before they'd ever overlap outright, and this catches
      // that even when the (weaker) "nodes don't visually overlap" check
      // would still pass. GRAPH_GRID_CELL_H is the smaller of the two
      // cell dimensions in matrix-graph.component.ts's grid layout, so it is
      // the tightest legitimate spacing between any two grid centres.
      // Imported directly (not hand-copied) so a future tuning of the
      // production constant can't silently weaken or falsely fail this test.
      const GRID_CELL_MIN_SPACING = GRAPH_GRID_CELL_H;
      const gridNodes = component.displayNodes.filter(n => n.kind !== 'host' && !n.kind.startsWith('persona'));
      expect(gridNodes.length).toBe(12);
      let minDist = Infinity;
      for (let i = 0; i < gridNodes.length; i++) {
        for (let j = i + 1; j < gridNodes.length; j++) {
          const dx = gridNodes[i].x - gridNodes[j].x;
          const dy = gridNodes[i].y - gridNodes[j].y;
          minDist = Math.min(minDist, Math.sqrt(dx * dx + dy * dy));
        }
      }
      expect(minDist).toBeGreaterThanOrEqual(GRID_CELL_MIN_SPACING);
    });
  });

  describe('S3 — correction, not undo: a mis-tapped mark removed by hand', () => {
    it('addMark propagates to the parent; removeMark clears the child but does not reverse the propagated mark', async () => {
      await mount();
      const drone = new MatrixTarget({ id: 'drone', name: 'Drone', type: 'device', context: 'public' });
      const weaponMount = new MatrixTarget({ id: 'mount', name: 'Weapon Mount', type: 'device', context: 'public', parentTargetId: 'drone' });
      matrixState.addTarget(null, drone);
      matrixState.addTarget(null, weaponMount);

      component.gmMode = true;
      setClientWidth(fixture.nativeElement, 700);
      fixture.detectChanges();

      matrixState.addMark(weaponMount, 'Tesseract');
      fixture.detectChanges();

      let mountNode = component.displayNodes.find(n => n.id === 'mount')!;
      let droneNode = component.displayNodes.find(n => n.id === 'drone')!;
      expect(component.markRowText(component.markRows(mountNode.marks)[0])).toBe('TE●○○');
      expect(component.markRowText(component.markRows(droneNode.marks)[0])).toBe('TE●○○');

      matrixState.removeMark(weaponMount, 'Tesseract');
      fixture.detectChanges();

      mountNode = component.displayNodes.find(n => n.id === 'mount')!;
      droneNode = component.displayNodes.find(n => n.id === 'drone')!;
      expect(component.markRows(mountNode.marks).length).toBe(0);
      // Propagation is visible, not reversible (RULINGS.md 2026-09-03).
      expect(component.markRowText(component.markRows(droneNode.marks)[0])).toBe('TE●○○');
    });
  });

  describe('S4 — live at the table: the pane narrows mid-combat', () => {
    it('recomputes svgW, the svg/rect width, and node positions within the new width with no clipped mark rows', async () => {
      await mount();
      const host = new MatrixHost({ id: 'h1', name: 'Ares-7', rating: 8 });
      matrixState.addHost(host);
      matrixState.setCurrentHost(host.id);
      for (let i = 0; i < 4; i++) {
        matrixState.addTarget(host, new MatrixTarget({
          id: `d${i}`, name: `Device ${i}`, type: 'device', context: 'host',
          marks: { Tesseract: i + 1 }
        }));
      }
      component.gmMode = true;
      setClientWidth(fixture.nativeElement, 900);
      fixture.detectChanges();
      expect(component.svgW).toBe(900);

      setClientWidth(fixture.nativeElement, 660);
      fireResize(660);
      fixture.detectChanges();

      expect(component.svgW).toBe(660);
      const svg = fixture.nativeElement.querySelector('svg') as SVGSVGElement;
      expect(svg.getAttribute('width')).toBe('660');
      const rect = fixture.nativeElement.querySelector('svg rect') as SVGRectElement;
      expect(rect.getAttribute('width')).toBe('660');

      for (const n of component.displayNodes) {
        expect(n.x).toBeLessThanOrEqual(660);
        expect(Number.isNaN(n.x)).toBeFalse();
        expect(Number.isNaN(n.y)).toBeFalse();
      }

      const texts = Array.from(fixture.nativeElement.querySelectorAll('svg text')) as SVGTextElement[];
      for (const t of texts) {
        expect(parseFloat(getComputedStyle(t).fontSize)).toBeGreaterThanOrEqual(MIN_GRAPH_FONT_PX);
      }

      // S4's own property: after the width change, no node's mark row sits
      // outside the viewBox. Mark-row `y` in the template is local to the
      // node's own `translate(node.x, node.y)` group, so the absolute
      // position is `node.y + markRowY(node, i)` for the row's own text
      // baseline — this would fail if `svgH`'s footprint calculation lost
      // track of a node's mark rows after a resize-triggered relayout.
      let markRowsChecked = 0;
      for (const n of component.displayNodes) {
        const rows = component.markRows(n.marks);
        for (let i = 0; i < rows.length; i++) {
          const absoluteRowY = n.y + component.markRowY(n, i);
          expect(absoluteRowY).toBeGreaterThanOrEqual(0);
          expect(absoluteRowY).toBeLessThanOrEqual(component.svgH);
          markRowsChecked++;
        }
      }
      // Make sure the assertion above wasn't vacuous — every device carries
      // marks in this setup, so there must be rows to check.
      expect(markRowsChecked).toBeGreaterThan(0);
    });
  });

  describe('S5 — panel collapsed then expanded: zero-width measurement', () => {
    it('measures 0 -> GRAPH_DEFAULT_WIDTH with a valid viewBox and no NaN coordinates, then recomputes at 700', async () => {
      await mount();
      matrixState.addTarget(null, new MatrixTarget({ id: 't1', name: 'Loose Device', type: 'device', context: 'public' }));
      component.gmMode = true;
      setClientWidth(fixture.nativeElement, 0);
      expect(() => fixture.detectChanges()).not.toThrow();

      expect(component.svgW).toBe(GRAPH_DEFAULT_WIDTH);
      const svg = fixture.nativeElement.querySelector('svg') as SVGSVGElement;
      const viewBox = svg.getAttribute('viewBox') ?? '';
      expect(viewBox).toMatch(/^0 0 \d+ \d+$/);
      for (const n of component.displayNodes) {
        expect(Number.isNaN(n.x)).toBeFalse();
        expect(Number.isNaN(n.y)).toBeFalse();
      }

      setClientWidth(fixture.nativeElement, 700);
      fireResize(700);
      fixture.detectChanges();
      expect(component.svgW).toBe(700);
    });
  });

  describe('S6 — a decker jacks out mid-run', () => {
    it('erases the persona/host/target marks and drops the persona node once jacked out', async () => {
      await mount();
      const host = new MatrixHost({ id: 'h1', name: 'Ares-7', rating: 8 });
      host.marks = { Tesseract: 1 };
      matrixState.addHost(host);
      matrixState.setCurrentHost(host.id);
      const maglock = new MatrixTarget({ id: 'maglock', name: 'Maglock', type: 'device', context: 'host', marks: { Tesseract: 2 } });
      const persona = new MatrixTarget({
        id: 'persona-t', name: 'Tesseract', type: 'persona', personaOwner: 'Tesseract', context: 'host',
        marks: { 'IC-1': 1 }
      });
      matrixState.addTarget(host, maglock);
      matrixState.addTarget(host, persona);

      const decker = makeDecker('Tesseract');
      component.gmMode = true;
      component.activeDeckers = [decker];
      setClientWidth(fixture.nativeElement, 700);
      fixture.detectChanges();

      const personaNode = component.displayNodes.find(n => n.kind === 'persona-me')!;
      expect(component.markRowText(component.markRows(personaNode.marks)[0])).toBe('IC●○○');

      // D1: while jacked in, the "persona-t" target is folded into the
      // persona-me node above and must not also appear as its own node
      // (host + maglock + persona-me = 3 nodes, not 4), and the host must
      // not carry a spurious edge to it (host->maglock only, 1 edge).
      expect(component.displayNodes.length).toBe(3);
      expect(component.displayNodes.find(n => n.id === 'persona-t')).toBeUndefined();
      expect(component.edges.length).toBe(1);
      expect(component.edges[0]).toEqual({ fromId: 'h1', toId: 'maglock' });

      expect(() => matrixState.jackOut(decker)).not.toThrow();
      fixture.detectChanges();

      expect(decker.jackedIn).toBeFalse();
      expect(component.displayNodes.some(n => n.kind === 'persona-me')).toBeFalse();

      const hostNode = component.displayNodes.find(n => n.kind === 'host')!;
      const maglockNode = component.displayNodes.find(n => n.id === 'maglock')!;
      expect(component.markRows(hostNode.marks).length).toBe(0);
      expect(component.markRows(maglockNode.marks).length).toBe(0);
    });
  });
});
