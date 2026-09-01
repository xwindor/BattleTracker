import {
  Component, Input, OnInit, OnChanges, OnDestroy, SimpleChanges, ChangeDetectorRef
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { Subscription } from "rxjs";
import { MatrixParticipant, MatrixRunState } from "Matrix";
import { MatrixStateService } from "app/services/matrix-state.service";
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

/** Canvas dimensions for the SVG viewBox. */
const W = 800;
const H = 460;

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
  insideHost = false;
  hostLabel = "";

  private sub: Subscription | null = null;

  constructor(private matrixState: MatrixStateService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
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
    } else {
      if (changes["activeDeckers"]) {
        this.buildGMNodes();
      }
    }
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  // ── GM mode ──────────────────────────────────────────────────────────────

  private buildGMNodes(): void {
    const state = this.matrixState.state;
    const host = this.matrixState.getCurrentHost();
    this.insideHost = !!host;
    this.hostLabel = host?.name ?? "";

    const nodes: GraphNode[] = [];

    // Persona nodes for jacked-in deckers
    for (const d of this.activeDeckers) {
      if (d.jackedIn) {
        nodes.push({
          id: `persona-${d.name}`,
          label: d.name,
          subLabel: d.vrMode,
          kind: "persona-me",
          visibility: "active",
          x: 0, y: 0,
          marks: {},
          directConnection: false
        });
      }
    }

    if (host) {
      // Inside-host view: show all host targets
      for (const t of host.targets) {
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
      // Public-space view: hosts + loose public targets
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

    this.computeLayout(nodes);
    this.displayNodes = nodes;
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
    this.computeLayout(nodes);
    this.displayNodes = nodes;
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  private computeLayout(nodes: GraphNode[]): void {
    if (nodes.length === 0) return;

    const personas = nodes.filter(n => n.kind.startsWith("persona"));
    const others   = nodes.filter(n => !n.kind.startsWith("persona"));

    // Personas: top row
    const pCount   = personas.length;
    const pSpacing = pCount > 1 ? Math.min(140, (W - 100) / (pCount - 1)) : 0;
    const pStartX  = pCount > 1 ? 60 : W / 2;
    personas.forEach((n, i) => {
      n.x = pStartX + i * pSpacing;
      n.y = 55;
    });

    if (others.length === 0) return;

    const cx = W / 2;
    const cy = pCount > 0 ? 280 : H / 2;

    if (others.length <= 8) {
      const r = Math.min(175, 55 + others.length * 20);
      others.forEach((n, i) => {
        const angle = (i / others.length) * 2 * Math.PI - Math.PI / 2;
        n.x = cx + r * Math.cos(angle);
        n.y = cy + r * Math.sin(angle);
      });
    } else {
      const cols   = Math.ceil(Math.sqrt(others.length * 1.4));
      const rows   = Math.ceil(others.length / cols);
      const cellW  = (W - 80) / cols;
      const cellH  = Math.min(95, (H - 120) / rows);
      others.forEach((n, i) => {
        n.x = 40 + (i % cols) * cellW + cellW / 2;
        n.y = 125 + Math.floor(i / cols) * cellH + cellH / 2;
      });
    }
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
    return n.kind === "host" ? 30 : 22;
  }

  visBadge(n: GraphNode): string {
    switch (n.visibility) {
      case "active":         return "👁";
      case "running-silent": return "👻";
      case "hidden":         return "✕";
      default:               return "";
    }
  }

  markDots(marks: Record<string, number>): string {
    const total = Object.values(marks).reduce((s, v) => s + v, 0);
    if (!total) return "";
    return "●".repeat(Math.min(3, total));
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

  readonly svgW = W;
  readonly svgH = H;
}
