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

  constructor(readonly matrixState: MatrixStateService) {}

  get markEntries(): { deckerId: string; count: number }[] {
    return Object.entries(this.target.marks)
      .filter(([, c]) => c > 0)
      .map(([id, count]) => ({ deckerId: id, count }));
  }

  /**
   * Whether at least one of `deckerId`'s current marks on this icon arrived
   * by propagation rather than a direct GM click — rendered as a badge next
   * to that decker's mark row (Xavier's decision 9, 2026-09-03; see
   * `MatrixTarget.propagatedMarks`'s doc comment).
   */
  hasPropagatedMark(deckerId: string): boolean {
    return this.target.propagatedMarks[deckerId] === true;
  }

  /**
   * What placing a mark on this icon will *also* do, shown before the GM
   * commits (Xavier's decision 9, 2026-09-03: "the +Mark control must say
   * what it will also do before the GM commits"). `null` when nothing will
   * propagate — either this icon is not a `"device"` (only devices
   * propagate, decision 8) or it has no linked host / device parent to
   * propagate to.
   */
  get propagationPreview(): string | null {
    if (this.target.type !== "device") return null;
    if (this.target.linkedHostId) {
      const host = this.matrixState.state.hosts.find(h => h.id === this.target.linkedHostId);
      if (host) return `Also marks Host: ${host.name}`;
    }
    if (this.target.context === "public" && this.target.parentTargetId) {
      const parent = this.matrixState.state.publicTargets.find(t => t.id === this.target.parentTargetId);
      if (parent && parent.type === "device") return `Also marks: ${parent.name}`;
    }
    return null;
  }

  /**
   * Deckers that still have room for another mark (count < 3, p. 236).
   *
   * Nameless participants are excluded: `marks` is keyed by `decker.name`, so
   * one cannot hold a mark. `BattleTrackerComponent.matrixActiveDeckers`
   * already filters these out, but this component takes `activeDeckers` as an
   * `@Input` from whoever mounts it — so the guard lives here too rather than
   * trusting every future caller. Without it the picker renders an option
   * with a blank label and an empty value, and `confirmAddMark()` then bails
   * silently on the falsy id.
   */
  get availableDeckers(): MatrixParticipant[] {
    return this.activeDeckers
      .filter(d => (d.name ?? "").trim() !== "")
      .filter(d => (this.target.marks[d.name] ?? 0) < 3);
  }

  /**
   * Why the confirm button is disabled, or `null` when it is usable. Shown to
   * the GM instead of the button doing nothing when clicked — the failure mode
   * a blank picker produced.
   */
  get addMarkBlockedReason(): string | null {
    if (!this.selectedDeckerId) return "Pick a decker first";
    if ((this.target.marks[this.selectedDeckerId] ?? 0) >= 3) {
      return `${this.selectedDeckerId} already holds the maximum 3 marks on this icon (p. 236)`;
    }
    return null;
  }

  get canConfirmAddMark(): boolean {
    return this.addMarkBlockedReason === null;
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
