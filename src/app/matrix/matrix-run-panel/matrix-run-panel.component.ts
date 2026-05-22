import { Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { NgbTooltipModule } from "@ng-bootstrap/ng-bootstrap";
import { MatrixParticipant, MatrixStep, VRMode } from "Matrix";
import { MatrixStateService } from "app/services/matrix-state.service";
import { JackInPanelComponent } from "app/matrix/jack-in-panel/jack-in-panel.component";

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
  imports: [CommonModule, FormsModule, NgbTooltipModule, JackInPanelComponent]
})
export class MatrixRunPanelComponent {
  @Input({ required: true }) activeDeckers!: MatrixParticipant[];

  @Output() readonly jackInRequested = new EventEmitter<{ decker: MatrixParticipant; mode: VRMode }>();
  @Output() readonly jackOutRequested = new EventEmitter<MatrixParticipant>();

  collapsed = false;

  readonly STEPS: StepDef[] = [
    { key: "jack-in",           label: "Jack In",            tooltip: "Connect to the Matrix (AR, Cold-Sim, or Hot-Sim VR). Initiative updates." },
    { key: "public-space",      label: "Public Space",       tooltip: "Survey public Matrix space. Locate hosts, scan for icons." },
    { key: "locate-host",       label: "Locate Host",        tooltip: "Find and identify the target host (Matrix Perception + Computer test)." },
    { key: "access-host",       label: "Access Host",        tooltip: "Enter via Hack On The Fly (+2 OS/mark), Brute Force (marks×4 OS), or Direct Connection (0 OS)." },
    { key: "inside-host",       label: "Inside Host",        tooltip: "Navigate host contents. Manage targets, IC, and matrix icons." },
    { key: "target-interaction",label: "Target Interaction", tooltip: "Place marks, edit files, control devices, data spike." },
    { key: "jack-out",          label: "Jack Out",           tooltip: "Disconnect cleanly. OS resets to 0. If host-converged, demiGOD converges on exit." }
  ];

  constructor(public matrixState: MatrixStateService) {}

  get activeStep(): MatrixStep {
    return this.matrixState.state.workflowStep;
  }

  setStep(step: MatrixStep): void {
    this.matrixState.state.workflowStep = step;
  }

  isStepActive(index: number): boolean {
    return this.STEPS[index]?.key === this.activeStep;
  }

  isStepComplete(index: number): boolean {
    const currentIndex = this.STEPS.findIndex(s => s.key === this.activeStep);
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
    // Advance workflow to Public Space after jack-in
    if (this.activeStep === "jack-in") {
      this.matrixState.state.workflowStep = "public-space";
    }
  }

  onJackOutRequested(decker: MatrixParticipant): void {
    this.jackOutRequested.emit(decker);
    // Return to Jack In step after jack-out
    this.matrixState.state.workflowStep = "jack-in";
  }

  get gridLabel(): string {
    switch (this.matrixState.state.activeGrid) {
      case "corporate": return "Corp Grid";
      case "prime":     return "Prime Grid";
      default:          return "Public Grid";
    }
  }

  get hasJackedInDeckers(): boolean {
    return this.activeDeckers.some(d => d.jackedIn);
  }
}
