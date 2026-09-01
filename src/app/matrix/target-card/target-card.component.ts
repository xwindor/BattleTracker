import { Component, Input, Output, EventEmitter } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { NgbTooltipModule } from "@ng-bootstrap/ng-bootstrap";
import {
  MatrixTarget, MatrixTargetType, MatrixTargetVisibility,
  MatrixHost, MatrixParticipant
} from "Matrix";
import { MatrixStateService } from "app/services/matrix-state.service";

@Component({
  standalone: true,
  selector: "app-target-card",
  templateUrl: "./target-card.component.html",
  styleUrls: ["./target-card.component.css"],
  imports: [CommonModule, FormsModule, NgbTooltipModule]
})
export class TargetCardComponent {
  @Input({ required: true }) target!: MatrixTarget;
  @Input() host: MatrixHost | null = null;
  @Input({ required: true }) activeDeckers!: MatrixParticipant[];
  /** Passed from parent when this target's edit form is open (highlights the row). */
  @Input() editing = false;

  @Output() readonly editTarget = new EventEmitter<void>();
  @Output() readonly deleteTarget = new EventEmitter<void>();
  @Output() readonly cycleVisibilityRequested = new EventEmitter<void>();

  addMarkOpen = false;
  selectedDeckerId = "";

  constructor(private readonly matrixState: MatrixStateService) {}

  get markEntries(): { deckerId: string; count: number }[] {
    return Object.entries(this.target.marks)
      .filter(([, c]) => c > 0)
      .map(([id, count]) => ({ deckerId: id, count }));
  }

  /** Deckers that still have room for another mark (count < 3). */
  get availableDeckers(): MatrixParticipant[] {
    return this.activeDeckers.filter(d => (this.target.marks[d.name] ?? 0) < 3);
  }

  dots(count: number): string {
    return "●".repeat(count) + "○".repeat(3 - count);
  }

  deckerLabel(deckerId: string): string {
    return this.activeDeckers.find(d => d.name === deckerId)?.name ?? deckerId;
  }

  openAddMark(): void {
    this.addMarkOpen = true;
    if (!this.selectedDeckerId && this.availableDeckers.length > 0) {
      this.selectedDeckerId = this.availableDeckers[0].name;
    }
  }

  confirmAddMark(): void {
    if (!this.selectedDeckerId) return;
    if ((this.target.marks[this.selectedDeckerId] ?? 0) >= 3) return;
    this.matrixState.addMark(this.target, this.selectedDeckerId);
    this.addMarkOpen = false;
  }

  removeMark(deckerId: string): void {
    this.matrixState.removeMark(this.target, deckerId);
  }

  typeIcon(type: MatrixTargetType): string {
    switch (type) {
      case "device":  return "fas fa-microchip";
      case "file":    return "fas fa-file-alt";
      case "persona": return "fas fa-user-circle";
      case "ic":      return "fas fa-shield-alt";
      case "host":    return "fas fa-server";
      default:        return "fas fa-question-circle";
    }
  }

  typeLabel(type: MatrixTargetType): string {
    switch (type) {
      case "device":  return "Device";
      case "file":    return "File";
      case "persona": return "Persona";
      case "ic":      return "IC Target";
      case "host":    return "Host";
      default:        return type as string;
    }
  }

  visibilityLabel(v: MatrixTargetVisibility): string {
    switch (v) {
      case "hidden":         return "HIDDEN";
      case "running-silent": return "RUNNING SILENT";
      case "active":         return "NORMAL";
    }
  }

  visibilityClass(v: MatrixTargetVisibility): string {
    switch (v) {
      case "hidden":         return "spotted-invisible";
      case "running-silent": return "spotted-ghost";
      case "active":         return "spotted-revealed";
    }
  }
}
