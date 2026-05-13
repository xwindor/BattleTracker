import { Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatrixParticipant, VRMode } from "Matrix";

/**
 * MatrixParticipantBadgeComponent
 *
 * Inline badge rendered inside the BattleTracker participant row when the
 * participant is a MatrixParticipant. Shows:
 *   - VR mode chip (AR / COLD / HOT)
 *   - Overwatch score, color-coded by tier (green / amber / red)
 *   - "PHYS LOCKED" badge when the decker is VR-catatonic
 *
 * Clicking the OS number emits osClick (Phase 2 will hook the OS editor).
 */
@Component({
  standalone: true,
  selector: "app-matrix-participant-badge",
  templateUrl: "./matrix-participant-badge.component.html",
  styleUrls: ["./matrix-participant-badge.component.css"],
  imports: [CommonModule]
})
export class MatrixParticipantBadgeComponent {
  @Input({ required: true }) participant!: MatrixParticipant;

  @Output() readonly osClick = new EventEmitter<MatrixParticipant>();

  /** Display label for the VR mode chip. */
  get vrModeLabel(): string {
    switch (this.participant?.vrMode) {
      case VRMode.HotSim:  return "HOT";
      case VRMode.ColdSim: return "COLD";
      case VRMode.AR:
      default:             return "AR";
    }
  }

  /** CSS modifier class for the VR mode chip. */
  get vrModeClass(): string {
    switch (this.participant?.vrMode) {
      case VRMode.HotSim:  return "vr-mode-hot";
      case VRMode.ColdSim: return "vr-mode-cold";
      case VRMode.AR:
      default:             return "vr-mode-ar";
    }
  }

  /** OS color tier — drives the os-* CSS class on the OS chip. */
  get osTier(): "ok" | "alert" | "convergence" {
    const os = this.participant?.overwatch ?? 0;
    if (os >= 40) return "convergence";
    if (os >= 20) return "alert";
    return "ok";
  }

  get blocksPhysical(): boolean {
    return !!this.participant?.blocksPhysicalActions;
  }

  onOsClick(event: MouseEvent): void {
    event.stopPropagation();
    this.osClick.emit(this.participant);
  }
}
