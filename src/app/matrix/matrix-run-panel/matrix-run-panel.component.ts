import { Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { NgbTooltipModule } from "@ng-bootstrap/ng-bootstrap";
import { MatrixParticipant, MatrixHost, VRMode } from "Matrix";
import { MatrixStateService } from "app/services/matrix-state.service";
import { DeckerCardComponent } from "app/matrix/decker-card/decker-card.component";
import { HierarchyEditorComponent } from "app/matrix/hierarchy-editor/hierarchy-editor.component";
import { AccessHostPanelComponent } from "app/matrix/access-host-panel/access-host-panel.component";
import { MatrixGraphComponent } from "app/matrix/matrix-graph/matrix-graph.component";

@Component({
  standalone: true,
  selector: "app-matrix-run-panel",
  templateUrl: "./matrix-run-panel.component.html",
  styleUrls: ["./matrix-run-panel.component.css"],
  imports: [CommonModule, NgbTooltipModule, DeckerCardComponent, HierarchyEditorComponent, AccessHostPanelComponent, MatrixGraphComponent]
})
export class MatrixRunPanelComponent {
  @Input({ required: true }) activeDeckers!: MatrixParticipant[];

  @Output() readonly jackInRequested = new EventEmitter<{ decker: MatrixParticipant; mode: VRMode }>();
  @Output() readonly jackOutRequested = new EventEmitter<MatrixParticipant>();

  collapsed = false;

  constructor(public matrixState: MatrixStateService) {}

  toggleCollapse(): void {
    this.collapsed = !this.collapsed;
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
