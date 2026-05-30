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

  /** Decker's current Overwatch Score (OS). */
  @Input() myOverwatch: number = 0;

  /** Decker's current VR mode ('AR' | 'cold-sim' | 'hot-sim'). */
  @Input() myVrMode: string = "AR";

  /** CSS class for the OS bar fill based on OS thresholds. */
  osBarClass(): string {
    if (this.myOverwatch >= 40) return "mpv-os-bar-red";
    if (this.myOverwatch >= 20) return "mpv-os-bar-amber";
    return "mpv-os-bar-green";
  }

  /** Bar fill width as a percentage of the 40-OS convergence threshold. */
  osBarWidth(): string {
    return Math.min(100, Math.round((this.myOverwatch / 40) * 100)) + "%";
  }

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

  /** Returns the mark count this decker has placed on a target. */
  myMarks(target: SharedMatrixTarget): number {
    if (!this.myName) return 0;
    return target.marks[this.myName] ?? 0;
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

  /** Group targets by host for display. Returns [{hostName, targets},...]. */
  get groupedTargets(): { label: string; targets: SharedMatrixTarget[] }[] {
    const publicTargets = this.targets.filter(t => !t.hostName);
    const hostMap = new Map<string, SharedMatrixTarget[]>();
    for (const t of this.targets) {
      if (!t.hostName) continue;
      if (!hostMap.has(t.hostName)) hostMap.set(t.hostName, []);
      hostMap.get(t.hostName)!.push(t);
    }
    const groups: { label: string; targets: SharedMatrixTarget[] }[] = [];
    if (publicTargets.length) {
      groups.push({ label: "Public Space", targets: publicTargets });
    }
    for (const [name, ts] of hostMap.entries()) {
      groups.push({ label: name, targets: ts });
    }
    return groups;
  }
}
