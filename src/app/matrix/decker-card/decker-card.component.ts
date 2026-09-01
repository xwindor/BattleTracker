import { Component, EventEmitter, Input, OnChanges, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatrixParticipant, VRMode } from "Matrix";

@Component({
  standalone: true,
  selector: "app-decker-card",
  templateUrl: "./decker-card.component.html",
  styleUrls: ["./decker-card.component.css"],
  imports: [CommonModule]
})
export class DeckerCardComponent implements OnChanges {
  @Input({ required: true }) decker!: MatrixParticipant;

  @Output() readonly jackInRequested = new EventEmitter<{ decker: MatrixParticipant; mode: VRMode }>();
  @Output() readonly jackOutRequested = new EventEmitter<MatrixParticipant>();

  pendingMode: VRMode = VRMode.AR;
  readonly VRMode = VRMode;

  ngOnChanges(): void {
    if (this.decker.jackedIn && this.decker.vrMode !== VRMode.None) {
      this.pendingMode = this.decker.vrMode;
    } else if (!this.decker.jackedIn) {
      this.pendingMode = VRMode.AR;
    }
  }

  get modeBadgeLabel(): string {
    if (!this.decker.jackedIn) return "NOT JACKED IN";
    switch (this.decker.vrMode) {
      case VRMode.HotSim:  return "HOT-SIM VR";
      case VRMode.ColdSim: return "COLD-SIM VR";
      case VRMode.AR:      return "AR";
      default:             return "NOT JACKED IN";
    }
  }

  get modeBadgeClass(): string {
    if (!this.decker.jackedIn) return "badge-mode-off";
    switch (this.decker.vrMode) {
      case VRMode.HotSim:  return "badge-mode-hot";
      case VRMode.ColdSim: return "badge-mode-cold";
      case VRMode.AR:      return "badge-mode-ar";
      default:             return "badge-mode-off";
    }
  }

  get osTierClass(): string {
    const os = this.decker.overwatch;
    if (os >= 40) return "os-convergence";
    if (os >= 20) return "os-alert";
    return "os-ok";
  }

  get canSwitchMode(): boolean {
    return this.decker.jackedIn && this.pendingMode !== this.decker.vrMode;
  }

  setPendingMode(mode: VRMode): void {
    this.pendingMode = mode;
  }

  onJackIn(): void {
    this.jackInRequested.emit({ decker: this.decker, mode: this.pendingMode });
  }

  onSwitchMode(): void {
    this.jackInRequested.emit({ decker: this.decker, mode: this.pendingMode });
  }

  onJackOut(): void {
    this.jackOutRequested.emit(this.decker);
  }
}
