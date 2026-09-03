import { Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { NgbTooltipModule } from "@ng-bootstrap/ng-bootstrap";
import { SharedMatrixTarget } from "app/services/session-sync.service";

@Component({
  standalone: true,
  selector: "app-matrix-player-view",
  templateUrl: "./matrix-player-view.component.html",
  styleUrls: ["./matrix-player-view.component.css"],
  imports: [CommonModule, NgbTooltipModule]
})
export class MatrixPlayerViewComponent {
  /** All targets broadcast by the GM (hidden already filtered out). */
  @Input() targets: SharedMatrixTarget[] = [];

  /**
   * The player's decker name — used as the key into `target.marks` to show
   * how many marks *this* decker has placed on each icon.
   */
  @Input() myName: string | null = null;

  /** Active host name, if any (from SharedCombatState.currentHostName). */
  @Input() currentHostName: string | undefined = undefined;

  /** Decker's current VR mode ('AR' | 'cold-sim' | 'hot-sim'). */
  @Input() myVrMode: string = "AR";

  /**
   * Per-decker mark count on the current host icon itself, keyed by decker
   * name (`SharedCombatState.currentHostMarks`). `null`/missing means "no
   * data broadcast yet" — additive wire state with no producer as of this
   * pass (briefs/matrix-port-rules-correctness-spec.md appendix D); wiring a
   * broadcaster is separate follow-up work.
   */
  @Input() hostMarksRecord: Record<string, number> | null = null;

  vrModeLabel(): string {
    switch (this.myVrMode) {
      case "hot-sim":   return "HOT SIM";
      case "cold-sim":  return "COLD SIM";
      default:          return "AR";
    }
  }

  vrModeClass(): string {
    switch (this.myVrMode) {
      case "hot-sim":  return "mpv-vr-hot";
      case "cold-sim": return "mpv-vr-cold";
      default:         return "mpv-vr-ar";
    }
  }

  /** Dot string for up to 3 marks. */
  dots(count: number): string {
    return "●".repeat(count) + "○".repeat(Math.max(0, 3 - count));
  }

  typeIcon(type: string): string {
    switch (type) {
      case "device":  return "fas fa-microchip";
      case "file":    return "fas fa-file-alt";
      case "persona": return "fas fa-user-circle";
      case "ic":      return "fas fa-shield-alt";
      case "host":    return "fas fa-server";
      default:        return "fas fa-question-circle";
    }
  }

  typeLabel(type: string): string {
    switch (type) {
      case "device":  return "Device";
      case "file":    return "File";
      case "persona": return "Persona";
      case "ic":      return "IC";
      case "host":    return "Host";
      case "unknown": return "Unknown";
      default:        return type;
    }
  }

  /**
   * Returns only the targets that are visible in the decker's current context:
   * - Inside a host  → only that host's targets
   * - Public space   → only targets with no host
   *
   * This mirrors how the Matrix actually works: you can't see inside a host
   * from public space and vice versa.
   */
  get contextTargets(): SharedMatrixTarget[] {
    if (this.currentHostName) {
      return this.targets.filter(t => t.hostName === this.currentHostName);
    }
    return this.targets.filter(t => !t.hostName);
  }

  /** Label for the current context (used as section header). */
  get contextLabel(): string {
    return this.currentHostName ?? "Public Space";
  }

  /**
   * Returns this decker's mark count on the current host icon itself.
   *
   * Marks are placed on individual icons — devices, personas, files, grids
   * and hosts are each their own mark-bearing icon, up to three marks per
   * icon (p. 236). A host icon's marks are therefore a fact about the host,
   * not an aggregate over the targets inside it: a decker holding 2 marks on
   * a device inside a host and 0 marks on the host itself has 0 marks on the
   * host (pp. 236, 239), and this method must not report anything else.
   *
   * Reads `hostMarksRecord` (`SharedCombatState.currentHostMarks`), the
   * host's own mark record — not `target.marks`, which belongs to the
   * targets inside the host and says nothing about the host icon.
   */
  hostMarks(): number {
    if (!this.myName) return 0;
    return this.hostMarksRecord?.[this.myName] ?? 0;
  }
}
