import { Component, Input, OnChanges, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { NgbModal, NgbTooltipModule } from "@ng-bootstrap/ng-bootstrap";
import { MatrixParticipant, MatrixHost, HostAccessMethod } from "Matrix";
import { MatrixStateService } from "app/services/matrix-state.service";
import { OsTrackingService } from "app/services/os-tracking.service";
import { OsPromptComponent } from "app/matrix/os-prompt/os-prompt.component";
import { DiceRollerComponent } from "app/dice-roller/dice-roller.component";
import { UndoHandler } from "Common";

type AccessFlow = "none" | "hack-on-fly" | "brute-force";

@Component({
  standalone: true,
  selector: "app-access-host-panel",
  templateUrl: "./access-host-panel.component.html",
  styleUrls: ["./access-host-panel.component.css"],
  imports: [CommonModule, FormsModule, NgbTooltipModule, DiceRollerComponent]
})
export class AccessHostPanelComponent implements OnChanges {
  @Input({ required: true }) activeDeckers!: MatrixParticipant[];

  flow: AccessFlow = "none";
  selectedDeckerId = "";
  marksGained = 1;
  lastRollValues: number[] = [];

  showDirectPanel = false;
  directDeckerId = "";
  directConfirmMsg = "";

  constructor(
    readonly matrixState: MatrixStateService,
    private osTracking: OsTrackingService,
    private modal: NgbModal
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["activeDeckers"] && this.activeDeckers.length > 0) {
      if (!this.selectedDeckerId) this.selectedDeckerId = this.activeDeckers[0].name;
      if (!this.directDeckerId) this.directDeckerId = this.activeDeckers[0].name;
    }
  }

  get host(): MatrixHost | null {
    return this.matrixState.getCurrentHost();
  }

  get selectedDecker(): MatrixParticipant | undefined {
    return this.activeDeckers.find(d => d.name === this.selectedDeckerId);
  }

  get directDecker(): MatrixParticipant | undefined {
    return this.activeDeckers.find(d => d.name === this.directDeckerId);
  }

  get hitCount(): number {
    return this.lastRollValues.filter(v => v >= 5).length;
  }

  get rolled(): boolean {
    return this.lastRollValues.length > 0;
  }

  get suggestedOS(): number {
    return this.flow === "hack-on-fly" ? this.marksGained * 2 : this.marksGained * 4;
  }

  startFlow(mode: AccessFlow): void {
    this.flow = mode;
    this.lastRollValues = [];
    this.marksGained = 1;
    this.showDirectPanel = false;
    this.directConfirmMsg = "";
    if (!this.selectedDeckerId && this.activeDeckers.length > 0) {
      this.selectedDeckerId = this.activeDeckers[0].name;
    }
  }

  cancelFlow(): void {
    this.flow = "none";
    this.lastRollValues = [];
  }

  onRolled(values: number[]): void {
    this.lastRollValues = values;
    this.marksGained = Math.min(3, values.filter(v => v >= 5).length);
  }

  async confirmAccess(): Promise<void> {
    const host = this.host;
    const decker = this.selectedDecker;
    if (!host || !decker) return;

    const actionName = this.flow === "hack-on-fly" ? "Hack on the Fly" : "Brute Force";
    const suggested = this.suggestedOS;

    const modalRef = this.modal.open(OsPromptComponent, { centered: true, size: "sm" });
    const inst = modalRef.componentInstance as OsPromptComponent;
    inst.actionEntries = [{ name: actionName, delta: suggested }];
    inst.suggestedDelta = suggested;
    inst.deckerName = decker.name;

    try {
      const confirmedDelta: number = await modalRef.result;
      UndoHandler.StartActions();
      const method: HostAccessMethod = this.flow === "hack-on-fly" ? "hack-on-fly" : "brute-force";
      this.matrixState.setHostAccessMethod(host, method);
      if (this.marksGained > 0) {
        this.matrixState.addMarkToHost(host, decker.name, this.marksGained);
      }
      this.osTracking.addOS(decker, confirmedDelta,
        `${actionName} — ${this.marksGained} mark(s) on ${host.name}`);
    } catch {
      // modal dismissed — no change
    }
    this.flow = "none";
    this.lastRollValues = [];
  }

  toggleDirectPanel(): void {
    this.showDirectPanel = !this.showDirectPanel;
    this.flow = "none";
    this.lastRollValues = [];
    this.directConfirmMsg = "";
    if (this.showDirectPanel && !this.directDeckerId && this.activeDeckers.length > 0) {
      this.directDeckerId = this.activeDeckers[0].name;
    }
  }

  applyDirectConnection(): void {
    const host = this.host;
    const decker = this.directDecker;
    if (!host || !decker) return;
    UndoHandler.StartActions();
    this.matrixState.setHostAccessMethod(host, "direct-connection");
    this.matrixState.addMarkToHost(host, decker.name, 1);
    this.directConfirmMsg = `Direct connection established. 1 mark placed on ${host.name} for ${decker.name}.`;
    this.showDirectPanel = false;
  }

  accessMethodLabel(m: HostAccessMethod | undefined): string {
    switch (m) {
      case "hack-on-fly":        return "Hack on the Fly";
      case "brute-force":        return "Brute Force";
      case "direct-connection":  return "Direct Connection";
      default:                   return "None";
    }
  }

  accessMethodClass(m: HostAccessMethod | undefined): string {
    switch (m) {
      case "hack-on-fly":        return "ahp-badge-hotf";
      case "brute-force":        return "ahp-badge-bf";
      case "direct-connection":  return "ahp-badge-dc";
      default:                   return "ahp-badge-none";
    }
  }
}
