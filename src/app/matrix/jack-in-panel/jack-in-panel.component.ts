import { Component, EventEmitter, Input, OnChanges, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { MatrixParticipant, VRMode } from "Matrix";

@Component({
  standalone: true,
  selector: "app-jack-in-panel",
  templateUrl: "./jack-in-panel.component.html",
  styleUrls: ["./jack-in-panel.component.css"],
  imports: [CommonModule, FormsModule]
})
export class JackInPanelComponent implements OnChanges {
  @Input({ required: true }) activeDeckers!: MatrixParticipant[];

  @Output() readonly jackInRequested = new EventEmitter<{ decker: MatrixParticipant; mode: VRMode }>();
  @Output() readonly jackOutRequested = new EventEmitter<MatrixParticipant>();

  selectedDecker: MatrixParticipant | null = null;
  selectedMode: VRMode = VRMode.AR;

  readonly VRMode = VRMode;

  ngOnChanges(): void {
    if (this.selectedDecker && !this.activeDeckers.includes(this.selectedDecker)) {
      this.selectedDecker = null;
    }
    if (!this.selectedDecker && this.activeDeckers.length === 1) {
      this.selectDecker(this.activeDeckers[0]);
    }
  }

  selectDecker(decker: MatrixParticipant | null): void {
    this.selectedDecker = decker;
    if (decker?.jackedIn && decker.vrMode !== VRMode.None) {
      this.selectedMode = decker.vrMode;
    } else {
      this.selectedMode = VRMode.AR;
    }
  }

  get isJackedIn(): boolean {
    return !!this.selectedDecker?.jackedIn;
  }

  get currentModeLabel(): string {
    switch (this.selectedDecker?.vrMode) {
      case VRMode.HotSim:  return "Hot Sim";
      case VRMode.ColdSim: return "Cold Sim";
      case VRMode.AR:      return "AR";
      default:             return "—";
    }
  }

  get canSwitchMode(): boolean {
    if (!this.selectedDecker || !this.isJackedIn) return false;
    return this.selectedMode !== this.selectedDecker.vrMode;
  }

  get hasHostConvergence(): boolean {
    return !!this.selectedDecker?.hostConverged;
  }

  onJackIn(): void {
    if (!this.selectedDecker) return;
    this.jackInRequested.emit({ decker: this.selectedDecker, mode: this.selectedMode });
  }

  onJackOut(): void {
    if (!this.selectedDecker) return;
    this.jackOutRequested.emit(this.selectedDecker);
  }
}
