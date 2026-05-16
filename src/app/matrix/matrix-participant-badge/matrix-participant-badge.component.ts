import { Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatrixParticipant, VRMode } from "Matrix";

@Component({
  standalone: true,
  selector: "app-matrix-participant-badge",
  templateUrl: "./matrix-participant-badge.component.html",
  styleUrls: ["./matrix-participant-badge.component.css"],
  imports: [CommonModule]
})
export class MatrixParticipantBadgeComponent {
  @Input({ required: true }) participant!: MatrixParticipant;

  /** Emits a raw OS delta (+5/+1/−1/−5) from the inline editor buttons. */
  @Output() readonly osAdjust = new EventEmitter<number>();

  /** Emits when the Reset button is clicked; parent handles confirmation. */
  @Output() readonly osResetClick = new EventEmitter<void>();

  osEditorOpen = false;

  get vrModeLabel(): string {
    switch (this.participant?.vrMode) {
      case VRMode.HotSim:  return "HOT";
      case VRMode.ColdSim: return "COLD";
      case VRMode.AR:
      default:             return "AR";
    }
  }

  get vrModeClass(): string {
    switch (this.participant?.vrMode) {
      case VRMode.HotSim:  return "vr-mode-hot";
      case VRMode.ColdSim: return "vr-mode-cold";
      case VRMode.AR:
      default:             return "vr-mode-ar";
    }
  }

  get osTier(): "ok" | "alert" | "convergence" {
    const os = this.participant?.overwatch ?? 0;
    if (os >= 40) return "convergence";
    if (os >= 20) return "alert";
    return "ok";
  }

  get blocksPhysical(): boolean {
    return !!this.participant?.blocksPhysicalActions;
  }

  onOsChipClick(event: MouseEvent): void {
    event.stopPropagation();
    this.osEditorOpen = !this.osEditorOpen;
  }

  onOsAdjust(delta: number, event: MouseEvent): void {
    event.stopPropagation();
    this.osAdjust.emit(delta);
  }

  onOsResetClick(event: MouseEvent): void {
    event.stopPropagation();
    this.osResetClick.emit();
  }
}
