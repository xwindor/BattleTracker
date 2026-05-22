import { Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { NgbTooltipModule } from "@ng-bootstrap/ng-bootstrap";
import { MatrixParticipant, MatrixStep, MatrixHost, VRMode } from "Matrix";
import { MatrixStateService } from "app/services/matrix-state.service";
import { DeckerCardComponent } from "app/matrix/decker-card/decker-card.component";

interface StepDef {
  key: MatrixStep;
  label: string;
  tooltip: string;
}

@Component({
  standalone: true,
  selector: "app-matrix-run-panel",
  templateUrl: "./matrix-run-panel.component.html",
  styleUrls: ["./matrix-run-panel.component.css"],
  imports: [CommonModule, FormsModule, NgbTooltipModule, DeckerCardComponent]
})
export class MatrixRunPanelComponent {
  @Input({ required: true }) activeDeckers!: MatrixParticipant[];

  @Output() readonly jackInRequested = new EventEmitter<{ decker: MatrixParticipant; mode: VRMode }>();
  @Output() readonly jackOutRequested = new EventEmitter<MatrixParticipant>();

  collapsed = false;

  readonly STEPS: StepDef[] = [
    { key: "jack-in",            label: "1. Jack In",            tooltip: "Connect to the Matrix. AR (REA+INT+1d6), Cold-Sim (DP+INT+3d6), or Hot-Sim (DP+INT+4d6)." },
    { key: "public-space",       label: "2. Public Space",       tooltip: "Survey public Matrix space. Locate hosts and scan for icons." },
    { key: "locate-host",        label: "3. Locate Host",        tooltip: "Identify the target host (Matrix Perception + Computer test)." },
    { key: "access-host",        label: "4. Access Host",        tooltip: "Hack On The Fly (+2 OS/mark), Brute Force (marks×4 OS), or Direct Connection (0 OS, physical access)." },
    { key: "inside-host",        label: "5. Inside Host",        tooltip: "Navigate host contents. Targets auto-revealed. Manage IC and marks." },
    { key: "target-interaction", label: "6. Targets",            tooltip: "Place marks, edit files, control devices, data spike targets." },
    { key: "jack-out",           label: "7. Jack Out",           tooltip: "Disconnect cleanly. OS resets to 0. If host-converged, demiGOD converges on exit." }
  ];

  constructor(public matrixState: MatrixStateService) {}

  /** Derives the current workflow phase from observable state — no user input required. */
  get inferredStep(): MatrixStep {
    const anyJackedIn = this.activeDeckers.some(d => d.jackedIn);
    if (!anyJackedIn) return "jack-in";

    const host = this.matrixState.getCurrentHost();
    if (!host) return "public-space";
    if (host.accessMethod === "none") return "access-host";
    if (host.deckerInside.length === 0) return "inside-host";

    const hasActiveMarks = host.targets.some(
      t => Object.values(t.marks).some(n => n > 0)
    );
    return hasActiveMarks ? "target-interaction" : "inside-host";
  }

  isStepLit(index: number): boolean {
    return this.STEPS[index]?.key === this.inferredStep;
  }

  isStepPast(index: number): boolean {
    const currentIndex = this.STEPS.findIndex(s => s.key === this.inferredStep);
    return index < currentIndex;
  }

  toggleCollapse(): void {
    this.collapsed = !this.collapsed;
  }

  onNoiseDec(): void {
    this.matrixState.setNoise(Math.max(0, this.matrixState.state.noise - 1));
  }

  onNoiseInc(): void {
    this.matrixState.setNoise(this.matrixState.state.noise + 1);
  }

  onGridChange(grid: string): void {
    this.matrixState.setActiveGrid(grid as "public" | "corporate" | "prime");
  }

  onJackInRequested(event: { decker: MatrixParticipant; mode: VRMode }): void {
    this.jackInRequested.emit(event);
  }

  onJackOutRequested(decker: MatrixParticipant): void {
    this.jackOutRequested.emit(decker);
  }

  get activeHost(): MatrixHost | null {
    return this.matrixState.getCurrentHost();
  }
}
