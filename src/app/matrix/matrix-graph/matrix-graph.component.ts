import {
  Component, ElementRef, Input, OnInit, OnChanges, OnDestroy, SimpleChanges, ChangeDetectorRef
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { Subscription } from "rxjs";
import { MatrixParticipant, MatrixHost, MatrixTarget } from "Matrix";
import { MatrixStateService, MARK_CAP } from "app/services/matrix-state.service";
import { SharedMatrixTarget } from "app/services/session-sync.service";

export interface GraphNode {
  id: string;
  label: string;
  subLabel: string;
  kind: "host" | "device" | "file" | "persona-me" | "persona-other" | "ic" | "unknown";
  visibility: "hidden" | "running-silent" | "active";
  x: number;
  y: number;
  marks: Record<string, number>;
  directConnection: boolean;
}

/**
 * One rendered mark line for a node — one per decker holding at least one
 * mark on that icon, plus a synthetic overflow row when there are more
 * owners than `MARK_DOT_MAX_OWNERS`. No `propagated` field: Xavier's
 * Decision 4 (`briefs/matrix-graph-readability-spec.md`, 2026-09-11) — the
 * graph renders that an icon has a mark, never how it arrived.
 */
export interface MarkRow {
  owner: string;
  initials: string;
  filled: number;
  /** True only for the synthetic "+N" summary row. */
  overflow?: boolean;
}

export interface GraphEdge {
  fromId: string;
  toId: string;
}

// ── Sizing (briefs/matrix-graph-readability-spec.md §1 — UI layout, no rule
// citation: these are display constants, not game-rule numbers). ──────────
export const GRAPH_MIN_WIDTH = 420;
export const GRAPH_MAX_WIDTH = 1200;
export const GRAPH_DEFAULT_WIDTH = 760;
export const GRAPH_MIN_HEIGHT = 300;

/**
 * Floor on every SVG text element's font size. Because the graph now renders
 * at a measured 1:1 scale (§1 of the spec — no more `preserveAspectRatio`
 * scaling), the declared CSS size *is* the on-screen size, so this constant
 * is directly checkable against `getComputedStyle`.
 */
export const MIN_GRAPH_FONT_PX = 11;

// ── Layout constants (spec §2/§3) ──────────────────────────────────────────
const PERSONA_Y = 56;
const PERSONA_START_X = 70;
const PERSONA_MAX_SPACING = 180;
const CONTENT_TOP_WITH_PERSONAS = 150;
const CONTENT_TOP_NO_PERSONAS = 40;

const GRAPH_RING_MAX_ITEMS = 8;
const GRAPH_RING_MAX_RADIUS_FRACTION = 0.34;
const GRAPH_RING_BASE_RADIUS = 90;
const GRAPH_RING_RADIUS_PER_ITEM = 16;
const GRAPH_RING_MARK_ROW_PAD = 14;

const GRAPH_GRID_MARGIN = 40;
const GRAPH_GRID_CELL_W = 165;
export const GRAPH_GRID_CELL_H = 130;

const GRAPH_BOTTOM_PAD = 30;

// Node radii (spec §2 suggested values).
const GRAPH_NODE_RADIUS_HOST = 34;
const GRAPH_NODE_RADIUS_PERSONA = 30;
const GRAPH_NODE_RADIUS_DEFAULT = 26;

// Label / mark-row offsets from a node's own radius — kept as named
// constants so every offset moves together with the radii (spec §2).
const GRAPH_LABEL_Y_OFFSET = 18;
const GRAPH_SUBLABEL_Y_OFFSET = 32;
const GRAPH_MARK_ROW_Y_OFFSET = 46;
const GRAPH_MARK_ROW_HEIGHT = 13;
const GRAPH_NODE_BOTTOM_MARGIN = 10;
const GRAPH_VIS_BADGE_OFFSET = 4;

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

@Component({
  standalone: true,
  selector: "app-matrix-graph",
  templateUrl: "./matrix-graph.component.html",
  styleUrls: ["./matrix-graph.component.css"],
  imports: [CommonModule]
})
export class MatrixGraphComponent implements OnInit, OnChanges, OnDestroy {
  /** Player-mode targets (null = GM mode — reads from MatrixStateService). */
  @Input() targets: SharedMatrixTarget[] | null = null;
  /** Name of the host currently active (player mode — from shared state). */
  @Input() currentHostName: string | undefined;
  /** Player's own decker name — used to style their persona node. */
  @Input() myDeckerName: string | null = null;
  /** Player's VR mode label. */
  @Input() myVrMode = "AR";
  /** When true: reads from MatrixStateService directly, shows all nodes + visibility badges. */
  @Input() gmMode = false;
  /** GM-mode active deckers (for persona nodes). */
  @Input() activeDeckers: MatrixParticipant[] = [];

  displayNodes: GraphNode[] = [];
  edges: GraphEdge[] = [];
  insideHost = false;
  hostLabel = "";

  /** Measured 1:1 rendering — see §1. Defaults keep a first paint sane before ngOnInit runs. */
  svgW = GRAPH_DEFAULT_WIDTH;
  svgH = GRAPH_MIN_HEIGHT;

  readonly MARK_CAP = MARK_CAP;

  private sub: Subscription | null = null;
  private resizeObserver: ResizeObserver | null = null;

  /**
   * §7 rebuild guard. `BattleTrackerComponent.matrixActiveDeckers` returns a
   * fresh array every read, so `ngOnChanges` sees a changed `@Input`
   * reference every change-detection cycle even when nothing about the
   * deckers actually changed (R4). This key lets `ngOnChanges` skip the
   * rebuild when the decker list is unchanged in every field the graph
   * reads from it.
   */
  private lastDeckerKey = "";

  constructor(
    private matrixState: MatrixStateService,
    private cdr: ChangeDetectorRef,
    private elRef: ElementRef<HTMLElement>
  ) {}

  ngOnInit(): void {
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(entries => {
        const width = entries[0]?.contentRect?.width ?? this.elRef.nativeElement.clientWidth;
        this.applyMeasuredWidth(width);
      });
      this.resizeObserver.observe(this.elRef.nativeElement);
    }
    this.applyMeasuredWidth(this.elRef.nativeElement.clientWidth, /* forceRebuild */ false);

    if (this.gmMode) {
      this.sub = this.matrixState.stateChange$.subscribe(() => {
        this.buildGMNodes();
        this.cdr.markForCheck();
      });
      this.buildGMNodes();
    } else {
      this.buildPlayerNodes();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.gmMode) {
      if (changes["targets"] || changes["currentHostName"] || changes["myDeckerName"]) {
        this.buildPlayerNodes();
      }
    } else if (changes["activeDeckers"]) {
      const key = this.deckerKey(this.activeDeckers);
      if (key === this.lastDeckerKey) return;
      this.buildGMNodes();
    }
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.resizeObserver?.disconnect();
  }

  // ── Sizing ───────────────────────────────────────────────────────────────

  /**
   * Applies a freshly measured host-element width, re-clamped into
   * `[GRAPH_MIN_WIDTH, GRAPH_MAX_WIDTH]`, falling through to
   * `GRAPH_DEFAULT_WIDTH` for a 0/NaN measurement (collapsed panel, not yet
   * laid out — S5). Recomputes layout only when the clamped width actually
   * changed, so a no-op resize tick doesn't force a rebuild.
   */
  private applyMeasuredWidth(rawWidth: number, forceRebuild = true): void {
    const nextW = clamp(rawWidth || GRAPH_DEFAULT_WIDTH, GRAPH_MIN_WIDTH, GRAPH_MAX_WIDTH);
    const changed = nextW !== this.svgW;
    this.svgW = nextW;
    if (changed && forceRebuild) {
      if (this.gmMode) {
        this.buildGMNodes();
      } else {
        this.buildPlayerNodes();
      }
      this.cdr.markForCheck();
    }
  }

  // ── GM mode ──────────────────────────────────────────────────────────────

  private buildGMNodes(): void {
    const state = this.matrixState.state;
    const host = this.matrixState.getCurrentHost();
    this.insideHost = !!host;
    this.hostLabel = host?.name ?? "";

    const nodes: GraphNode[] = [];
    // The context a decker's own persona icon would live in — mirrors
    // `MatrixStateService.eraseMarksForDecker()`'s second loop.
    const contextTargets: MatrixTarget[] = host ? host.targets : state.publicTargets;

    // Persona nodes for jacked-in deckers. Track every persona target folded
    // into one of these synthetic nodes so the content loops below don't
    // also render it as a second, duplicate node (D1: a decker's marked
    // persona was rendering twice — once here, once from the target loop).
    const consumedPersonaTargetIds = new Set<string>();
    for (const d of this.activeDeckers) {
      if (!d.jackedIn) continue;
      const personaTarget = contextTargets.find(
        t => t.type === "persona" && t.personaOwner === d.name
      );
      if (personaTarget) {
        consumedPersonaTargetIds.add(personaTarget.id);
      }
      nodes.push({
        id: `persona-${d.name}`,
        label: d.name,
        subLabel: d.vrMode,
        kind: "persona-me",
        visibility: "active",
        x: 0, y: 0,
        marks: personaTarget?.marks ?? {},
        directConnection: false
      });
    }

    if (host) {
      // Current host gets its own node (Decision 2) — pushed before its
      // contents. Deliberately carries only `marks`, not how any of them
      // arrived (Decision 4 — see `markRows()`'s doc comment).
      nodes.push({
        id: host.id,
        label: host.name,
        subLabel: `Rating ${host.rating}`,
        kind: "host",
        visibility: "active",
        x: 0, y: 0,
        marks: host.marks,
        directConnection: false
      });
      // Inside-host view: show all host targets, except a persona target
      // already folded into a persona-me node above (D1).
      for (const t of host.targets) {
        if (consumedPersonaTargetIds.has(t.id)) continue;
        nodes.push({
          id: t.id,
          label: t.name,
          subLabel: this.visibilityLabel(t.visibility),
          kind: this.mapTargetKind(t.type),
          visibility: t.visibility,
          x: 0, y: 0,
          marks: t.marks,
          directConnection: false
        });
      }
    } else {
      // Public-space view: hosts + loose public targets.
      for (const h of state.hosts) {
        nodes.push({
          id: h.id,
          label: h.name,
          subLabel: `Rating ${h.rating}`,
          kind: "host",
          visibility: "active",
          x: 0, y: 0,
          marks: h.marks,
          directConnection: false
        });
      }
      for (const t of state.publicTargets) {
        if (consumedPersonaTargetIds.has(t.id)) continue;
        nodes.push({
          id: t.id,
          label: t.name,
          subLabel: this.visibilityLabel(t.visibility),
          kind: this.mapTargetKind(t.type),
          visibility: t.visibility,
          x: 0, y: 0,
          marks: t.marks,
          directConnection: false
        });
      }
    }

    this.edges = this.computeEdges(nodes, host, state.publicTargets, consumedPersonaTargetIds);
    this.computeLayout(nodes, !!host);
    this.displayNodes = nodes;
    this.lastDeckerKey = this.deckerKey(this.activeDeckers);
  }

  private deckerKey(deckers: MatrixParticipant[]): string {
    return deckers.map(d => `${d.name}:${d.jackedIn}:${d.vrMode}`).join("|");
  }

  // ── Player mode ───────────────────────────────────────────────────────────

  private buildPlayerNodes(): void {
    const nodes: GraphNode[] = [];

    if (this.myDeckerName) {
      nodes.push({
        id: "my-persona",
        label: this.myDeckerName,
        subLabel: this.myVrMode,
        kind: "persona-me",
        visibility: "active",
        x: 0, y: 0,
        marks: {},
        directConnection: false
      });
    }

    for (const t of (this.targets ?? [])) {
      const isGhost = t.visibility === "running-silent";
      nodes.push({
        id: t.id,
        label: isGhost ? "Unknown Icon" : t.name,
        subLabel: isGhost ? "■ Running Silent" : this.typeLabel(t.type),
        kind: isGhost ? "unknown" : this.mapSharedKind(t.type),
        visibility: isGhost ? "running-silent" : "active",
        x: 0, y: 0,
        marks: t.marks,
        directConnection: t.directConnection ?? false
      });
    }

    this.insideHost = !!this.currentHostName;
    this.hostLabel = this.currentHostName ?? "";
    this.edges = [];
    // Player mode never carries a distinguished "current host" node — see
    // `buildPlayerNodes()`'s Increment-1 scope note (spec, "Not changed in
    // Increment 1"). Passing `insideHost = false` here keeps `computeLayout`
    // from mistaking a `kind: 'host'` target for that special node.
    this.computeLayout(nodes, false);
    this.displayNodes = nodes;
  }

  // ── Edges (Decision 3) ───────────────────────────────────────────────────

  private computeEdges(
    nodes: GraphNode[],
    host: MatrixHost | null,
    publicTargets: MatrixTarget[],
    consumedPersonaTargetIds: Set<string> = new Set<string>()
  ): GraphEdge[] {
    const edges: GraphEdge[] = [];
    if (host) {
      // Skip a persona target already folded into a persona-me node (D1) —
      // it has no node of its own, so an edge to it would dangle/duplicate.
      for (const t of host.targets) {
        if (consumedPersonaTargetIds.has(t.id)) continue;
        edges.push({ fromId: host.id, toId: t.id });
      }
      return edges;
    }
    const renderedIds = new Set(nodes.map(n => n.id));
    for (const t of publicTargets) {
      if (t.parentTargetId && renderedIds.has(t.parentTargetId) && renderedIds.has(t.id)) {
        edges.push({ fromId: t.id, toId: t.parentTargetId });
      }
    }
    return edges;
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  private computeLayout(nodes: GraphNode[], insideHost: boolean): void {
    if (nodes.length === 0) {
      this.svgH = GRAPH_MIN_HEIGHT;
      return;
    }

    const personas = nodes.filter(n => n.kind.startsWith("persona"));
    const hostNode = insideHost ? nodes.find(n => n.kind === "host") : undefined;
    const others = nodes.filter(n => n !== hostNode && !n.kind.startsWith("persona"));

    // Personas on a top row.
    if (personas.length === 1) {
      personas[0].x = this.svgW / 2;
      personas[0].y = PERSONA_Y;
    } else if (personas.length > 1) {
      const spacing = Math.min(
        PERSONA_MAX_SPACING,
        (this.svgW - 120) / Math.max(1, personas.length - 1)
      );
      personas.forEach((n, i) => {
        n.x = PERSONA_START_X + i * spacing;
        n.y = PERSONA_Y;
      });
    }

    const contentTop = personas.length > 0 ? CONTENT_TOP_WITH_PERSONAS : CONTENT_TOP_NO_PERSONAS;
    const cx = this.svgW / 2;

    if (others.length === 0) {
      if (hostNode) {
        hostNode.x = cx;
        hostNode.y = contentTop + this.nodeRadius(hostNode);
      }
    } else if (others.length <= GRAPH_RING_MAX_ITEMS) {
      const maxMarkRows = Math.max(0, ...others.map(n => this.markRows(n.marks).length));
      const ringR =
        Math.min(
          GRAPH_RING_MAX_RADIUS_FRACTION * this.svgW,
          GRAPH_RING_BASE_RADIUS + others.length * GRAPH_RING_RADIUS_PER_ITEM
        ) + GRAPH_RING_MARK_ROW_PAD * Math.max(0, maxMarkRows - 1);
      const cy = contentTop + ringR;
      if (hostNode) {
        hostNode.x = cx;
        hostNode.y = cy;
      }
      others.forEach((n, i) => {
        const angle = (i / others.length) * 2 * Math.PI - Math.PI / 2;
        n.x = cx + ringR * Math.cos(angle);
        n.y = cy + ringR * Math.sin(angle);
      });
    } else {
      const cols = Math.max(1, Math.floor((this.svgW - GRAPH_GRID_MARGIN) / GRAPH_GRID_CELL_W));
      let gridTop = contentTop;
      if (hostNode) {
        hostNode.x = cx;
        hostNode.y = contentTop + this.nodeRadius(hostNode);
        gridTop = hostNode.y + this.nodeFootprint(hostNode) + GRAPH_GRID_MARGIN;
      }
      others.forEach((n, i) => {
        n.x = GRAPH_GRID_MARGIN / 2 + (i % cols) * GRAPH_GRID_CELL_W + GRAPH_GRID_CELL_W / 2;
        n.y = gridTop + Math.floor(i / cols) * GRAPH_GRID_CELL_H + GRAPH_GRID_CELL_H / 2;
      });
    }

    const contentBottom = Math.max(...nodes.map(n => n.y + this.nodeFootprint(n)));
    this.svgH = Math.max(GRAPH_MIN_HEIGHT, contentBottom + GRAPH_BOTTOM_PAD);
  }

  /** A node's full vertical footprint below its centre, including its mark rows. */
  private nodeFootprint(n: GraphNode): number {
    const rows = this.markRows(n.marks).length;
    return this.nodeRadius(n) + GRAPH_MARK_ROW_Y_OFFSET + rows * GRAPH_MARK_ROW_HEIGHT + GRAPH_NODE_BOTTOM_MARGIN;
  }

  // ── Template helpers ──────────────────────────────────────────────────────

  nodeGroupClass(n: GraphNode): string {
    const cls = [`mgn-node`, `mgn-${n.kind}`, `mgn-vis-${n.visibility}`];
    return cls.join(" ");
  }

  nodeSymbol(n: GraphNode): string {
    switch (n.kind) {
      case "host":         return "⬛";
      case "device":       return "⬡";
      case "file":         return "▣";
      case "persona-me":   return "◉";
      case "persona-other":return "◎";
      case "ic":           return "◆";
      case "unknown":      return "■";
      default:             return "●";
    }
  }

  nodeRadius(n: GraphNode): number {
    if (n.kind === "host") return GRAPH_NODE_RADIUS_HOST;
    if (n.kind.startsWith("persona")) return GRAPH_NODE_RADIUS_PERSONA;
    return GRAPH_NODE_RADIUS_DEFAULT;
  }

  nodeLabelY(n: GraphNode): number {
    return this.nodeRadius(n) + GRAPH_LABEL_Y_OFFSET;
  }

  nodeSubLabelY(n: GraphNode): number {
    return this.nodeRadius(n) + GRAPH_SUBLABEL_Y_OFFSET;
  }

  markRowY(n: GraphNode, i: number): number {
    return this.nodeRadius(n) + GRAPH_MARK_ROW_Y_OFFSET + i * GRAPH_MARK_ROW_HEIGHT;
  }

  visBadgeX(n: GraphNode): number {
    return this.nodeRadius(n) - GRAPH_VIS_BADGE_OFFSET;
  }

  visBadgeY(n: GraphNode): number {
    return -this.nodeRadius(n) + GRAPH_VIS_BADGE_OFFSET;
  }

  visBadge(n: GraphNode): string {
    switch (n.visibility) {
      case "active":         return "👁";
      case "running-silent": return "👻";
      case "hidden":         return "✕";
      default:               return "";
    }
  }

  /**
   * Presentation cap on how many decker-groups this method will render,
   * before folding the rest into a "+N" summary. Not a rule — bounds the
   * glyph count on an icon several deckers have marked (round-4 defect D-6:
   * an earlier version had no cap and no owner key at all — `Object.values`
   * discarded which decker was which — so five deckers at three marks each
   * rendered 19 unlabelled glyphs).
   */
  private static readonly MARK_DOT_MAX_OWNERS = 4;

  /**
   * Marks are placed per-persona, each capped at `MARK_CAP` on a given icon
   * (p. 236) — they are not one pooled total. Summing across deckers before
   * drawing dots made three deckers holding one mark each render identically
   * to one decker holding three (round-3 defect,
   * `matrix-graph.component.ts:267-271` in
   * `briefs/matrix-port-rules-correctness-spec.md`'s appendix). Returns one
   * row per decker instead, each carrying that decker's initials so the
   * render actually says *whose* marks they are (round-4 defect D-6 — the
   * round-3 fix grouped dots per decker but discarded the owner key
   * entirely, `Object.values(marks)` rather than `Object.entries`), capped
   * at `MARK_DOT_MAX_OWNERS` rows with a synthetic "+N" overflow row rather
   * than growing unbounded. Carries no `propagated` field (Decision 4) — a
   * mark renders identically whether it was placed directly or arrived by
   * propagation.
   */
  markRows(marks: Record<string, number>): MarkRow[] {
    const entries = Object.entries(marks ?? {}).filter(([, count]) => count > 0);
    const shown: MarkRow[] = entries
      .slice(0, MatrixGraphComponent.MARK_DOT_MAX_OWNERS)
      .map(([owner, count]) => ({
        owner,
        initials: this.ownerInitials(owner),
        filled: count
      }));
    const overflow = entries.length - shown.length;
    if (overflow > 0) {
      shown.push({ owner: `+${overflow}`, initials: "", filled: 0, overflow: true });
    }
    return shown;
  }

  /** Filled-then-empty glyph string for one mark row, matching `TargetCardComponent.dots()`. */
  markGlyphs(row: MarkRow): string {
    if (row.overflow) return row.owner;
    const filled = Math.min(MARK_CAP, row.filled);
    return "●".repeat(filled) + "○".repeat(MARK_CAP - filled);
  }

  /** What a mark row's `<text>` actually renders: initials + glyphs, or the overflow label alone. */
  markRowText(row: MarkRow): string {
    return row.overflow ? row.owner : `${row.initials}${this.markGlyphs(row)}`;
  }

  /** Up to two initials from an owner key (a decker's `name`), for `markRows()`. */
  private ownerInitials(owner: string): string {
    const parts = owner.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    const initials = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0];
    return initials.toUpperCase();
  }

  private mapTargetKind(type: string): GraphNode["kind"] {
    switch (type) {
      case "device":  return "device";
      case "file":    return "file";
      case "persona": return "persona-other";
      case "ic":      return "ic";
      case "host":    return "host";
      default:        return "device";
    }
  }

  private mapSharedKind(type: string): GraphNode["kind"] {
    return this.mapTargetKind(type);
  }

  private visibilityLabel(v: string): string {
    switch (v) {
      case "active":         return "Active";
      case "running-silent": return "Running Silent";
      case "hidden":         return "Hidden";
      default:               return v;
    }
  }

  private typeLabel(type: string): string {
    switch (type) {
      case "device":  return "Device";
      case "file":    return "File";
      case "persona": return "Persona";
      case "ic":      return "IC";
      case "host":    return "Host";
      default:        return type;
    }
  }

  get isEmpty(): boolean {
    return this.displayNodes.length === 0;
  }

  /** Look up a rendered node by id, for the edge `<line>` endpoints in the template. */
  nodeById(id: string): GraphNode | undefined {
    return this.displayNodes.find(n => n.id === id);
  }
}
