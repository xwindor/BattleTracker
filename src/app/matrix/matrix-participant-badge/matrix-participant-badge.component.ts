import { Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatrixParticipant, VRMode } from "Matrix";
import { OsBand, osBandFor } from "app/services/os-tracking.service";

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

  /**
   * Colour band for the OS chip.
   *
   * **Presentation only.** Only `convergence` (OS 40) is a printed threshold
   * (p. 232); `building` and `high` are arbitrary cut points that exist so a
   * rising score reads as rising pressure across the table, and they trigger
   * nothing (RULINGS.md, 2026-08-29 "Overwatch Score banding below 40 is
   * display-only").
   *
   * This replaces an `alert` tier at OS 20 that presented itself as a rule —
   * SR5 has no Overwatch threshold below 40.
   */
  get osTier(): OsBand {
    return osBandFor(this.participant?.overwatch ?? 0);
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
