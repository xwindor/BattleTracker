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
   * Returns this decker's mark count on the current host.
   * In SR5E marks are placed on the host, not on individual icons inside it;
   * the per-target mark values all reflect the same host-level mark count.
   * We take the highest value across all targets in the host so a freshly
   * placed mark is visible even if other targets haven't been updated yet.
   */
  hostMarks(): number {
    if (!this.myName || !this.currentHostName) return 0;
    let max = 0;
    for (const t of this.targets) {
      if (t.hostName !== this.currentHostName) continue;
      const m = t.marks[this.myName] ?? 0;
      if (m > max) max = m;
    }
    return max;
  }
}
