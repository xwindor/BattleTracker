import { Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { NgbTooltipModule } from "@ng-bootstrap/ng-bootstrap";
import {
  MatrixParticipant,
  MatrixHost,
  MatrixTarget,
  MatrixTargetType,
  MatrixTargetSpotted
} from "Matrix";
import { MatrixStateService } from "app/services/matrix-state.service";

interface HostFormState {
  active: boolean;
  isEditing: boolean;
  host: MatrixHost | null;
  name: string;
  rating: number;
  attack: number;
  sleaze: number;
  dataProcessing: number;
  firewall: number;
  setActive: boolean;
}

interface TargetFormState {
  active: boolean;
  isEditing: boolean;
  target: MatrixTarget | null;
  /** null = public space; host.id = inside that host */
  hostId: string | null;
  name: string;
  type: MatrixTargetType;
  spotted: MatrixTargetSpotted;
  runningSilent: boolean;
  deviceRating: number;
  directConnection: boolean;
  linkedParticipantId: string;
}

const BLANK_HOST_FORM: HostFormState = {
  active: false, isEditing: false, host: null,
  name: "", rating: 4, attack: 4, sleaze: 5, dataProcessing: 6, firewall: 7,
  setActive: true
};

const BLANK_TARGET_FORM: TargetFormState = {
  active: false, isEditing: false, target: null, hostId: null,
  name: "", type: "device", spotted: "invisible",
  runningSilent: false, deviceRating: 4, directConnection: false,
  linkedParticipantId: ""
};

function calcMatrixHealth(type: MatrixTargetType, deviceRating: number, rating: number): number {
  switch (type) {
    case "file": return 8;
    case "device": return 8 + Math.ceil(deviceRating / 2);
    default:       return 8 + Math.ceil(rating / 2);
  }
}

@Component({
  standalone: true,
  selector: "app-hierarchy-editor",
  templateUrl: "./hierarchy-editor.component.html",
  styleUrls: ["./hierarchy-editor.component.css"],
  imports: [CommonModule, FormsModule, NgbTooltipModule]
})
export class HierarchyEditorComponent {
  @Input({ required: true }) activeDeckers!: MatrixParticipant[];

  publicSpaceExpanded = true;
  expandedHosts = new Set<string>();

  hostForm: HostFormState = { ...BLANK_HOST_FORM };
  targetForm: TargetFormState = { ...BLANK_TARGET_FORM };

  // Expose type enum to template
  readonly TARGET_TYPES: MatrixTargetType[] = ["device", "file", "persona", "ic"];

  constructor(readonly matrixState: MatrixStateService) {}

  get state() { return this.matrixState.state; }

  // ── Host form ────────────────────────────────────────────────────────────

  openAddHost(): void {
    const r = 4;
    this.hostForm = {
      ...BLANK_HOST_FORM,
      active: true,
      setActive: this.state.currentHostId === null,
      rating: r
    };
    this.suggestAsdfForForm(r);
    this.targetForm = { ...BLANK_TARGET_FORM };
  }

  openEditHost(host: MatrixHost): void {
    this.hostForm = {
      active: true, isEditing: true, host,
      name: host.name, rating: host.rating,
      attack: host.attack, sleaze: host.sleaze,
      dataProcessing: host.dataProcessing, firewall: host.firewall,
      setActive: false
    };
    this.targetForm = { ...BLANK_TARGET_FORM };
  }

  closeHostForm(): void {
    this.hostForm = { ...BLANK_HOST_FORM };
  }

  suggestAsdf(): void {
    this.suggestAsdfForForm(this.hostForm.rating);
  }

  private suggestAsdfForForm(rating: number): void {
    const vals = [rating, rating + 1, rating + 2, rating + 3];
    for (let i = vals.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [vals[i], vals[j]] = [vals[j], vals[i]];
    }
    [this.hostForm.attack, this.hostForm.sleaze, this.hostForm.dataProcessing, this.hostForm.firewall] = vals;
  }

  saveHostForm(): void {
    const f = this.hostForm;
    if (!f.name.trim()) return;

    const rating = Math.max(1, Math.min(12, f.rating));
    const health = 8 + Math.ceil(rating / 2);

    if (f.isEditing && f.host) {
      this.matrixState.updateHost(f.host, {
        name: f.name.trim(), rating,
        attack: f.attack, sleaze: f.sleaze,
        dataProcessing: f.dataProcessing, firewall: f.firewall,
        matrixHealth: health
      });
      this.expandedHosts.add(f.host.id);
    } else {
      const host = new MatrixHost({
        id: this.matrixState.generateTargetId().replace("t-", "h-"),
        name: f.name.trim(), rating,
        attack: f.attack, sleaze: f.sleaze,
        dataProcessing: f.dataProcessing, firewall: f.firewall,
        matrixHealth: health
      });
      this.matrixState.addHost(host);
      if (f.setActive) {
        this.matrixState.setCurrentHost(host.id);
      }
      this.expandedHosts.add(host.id);
    }
    this.hostForm = { ...BLANK_HOST_FORM };
  }

  deleteHost(host: MatrixHost): void {
    this.matrixState.removeHost(host);
    this.expandedHosts.delete(host.id);
    if (this.hostForm.host === host) this.hostForm = { ...BLANK_HOST_FORM };
  }

  setActiveHost(host: MatrixHost): void {
    this.matrixState.setCurrentHost(host.id);
  }

  clearActiveHost(): void {
    this.matrixState.clearActiveHost();
  }

  // ── Target form ──────────────────────────────────────────────────────────

  openAddTarget(host: MatrixHost | null, type: MatrixTargetType): void {
    this.targetForm = {
      ...BLANK_TARGET_FORM,
      active: true,
      hostId: host?.id ?? null,
      type,
      spotted: "invisible"
    };
    this.hostForm = { ...BLANK_HOST_FORM };
    if (host) this.expandedHosts.add(host.id);
  }

  openEditTarget(host: MatrixHost | null, target: MatrixTarget): void {
    this.targetForm = {
      active: true, isEditing: true, target,
      hostId: host?.id ?? null,
      name: target.name,
      type: target.type,
      spotted: target.spotted,
      runningSilent: target.runningSilent,
      deviceRating: target.deviceRating,
      directConnection: target.directConnection,
      linkedParticipantId: target.linkedParticipantId ?? ""
    };
    this.hostForm = { ...BLANK_HOST_FORM };
  }

  closeTargetForm(): void {
    this.targetForm = { ...BLANK_TARGET_FORM };
  }

  onTargetTypeChange(): void {
    // Persona and IC targets default to invisible; devices/files same
    const t = this.targetForm;
    if (t.runningSilent) t.spotted = "invisible";
  }

  onRunningSilentChange(): void {
    if (this.targetForm.runningSilent) {
      this.targetForm.spotted = "invisible";
    }
  }

  saveTargetForm(): void {
    const f = this.targetForm;
    if (!f.name.trim()) return;

    const host = f.hostId ? (this.state.hosts.find(h => h.id === f.hostId) ?? null) : null;
    const health = calcMatrixHealth(f.type, Math.max(1, f.deviceRating), 1);

    if (f.isEditing && f.target) {
      this.matrixState.updateTarget(f.target, {
        name: f.name.trim(),
        type: f.type,
        spotted: f.spotted,
        runningSilent: f.runningSilent,
        deviceRating: Math.max(1, Math.min(12, f.deviceRating)),
        directConnection: f.directConnection,
        linkedParticipantId: f.linkedParticipantId || undefined,
        matrixHealth: health
      });
    } else {
      const target = new MatrixTarget({
        id: this.matrixState.generateTargetId(),
        name: f.name.trim(),
        type: f.type,
        context: host ? "host" : "public",
        spotted: f.spotted,
        runningSilent: f.runningSilent,
        deviceRating: Math.max(1, Math.min(12, f.deviceRating)),
        directConnection: f.type === "device" ? f.directConnection : false,
        linkedParticipantId: f.linkedParticipantId || undefined,
        linkedHostId: f.hostId ?? undefined,
        matrixHealth: health
      });
      this.matrixState.addTarget(host, target);
    }
    this.targetForm = { ...BLANK_TARGET_FORM };
  }

  deleteTarget(host: MatrixHost | null, target: MatrixTarget): void {
    this.matrixState.removeTarget(host, target);
    if (this.targetForm.target === target) this.targetForm = { ...BLANK_TARGET_FORM };
  }

  // ── Spotted cycling ──────────────────────────────────────────────────────

  cycleSpotted(host: MatrixHost | null, target: MatrixTarget): void {
    const order: MatrixTargetSpotted[] = ["invisible", "ghost", "revealed"];
    const next = order[(order.indexOf(target.spotted) + 1) % order.length];
    this.matrixState.setTargetSpotted(target, next);
  }

  // ── Tree expand/collapse ─────────────────────────────────────────────────

  togglePublicSpace(): void {
    this.publicSpaceExpanded = !this.publicSpaceExpanded;
  }

  toggleHost(hostId: string): void {
    if (this.expandedHosts.has(hostId)) {
      this.expandedHosts.delete(hostId);
    } else {
      this.expandedHosts.add(hostId);
    }
  }

  // ── Display helpers ──────────────────────────────────────────────────────

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
      default:        return type;
    }
  }

  spottedLabel(spotted: MatrixTargetSpotted): string {
    switch (spotted) {
      case "invisible": return "INVISIBLE";
      case "ghost":     return "GHOST";
      case "revealed":  return "REVEALED";
    }
  }

  spottedClass(spotted: MatrixTargetSpotted): string {
    switch (spotted) {
      case "invisible": return "spotted-invisible";
      case "ghost":     return "spotted-ghost";
      case "revealed":  return "spotted-revealed";
    }
  }

  deckerName(nameOrId: string): string {
    return this.activeDeckers.find(d => d.name === nameOrId)?.name ?? nameOrId;
  }

  isHostExpanded(hostId: string): boolean {
    return this.expandedHosts.has(hostId);
  }

  isActiveHost(host: MatrixHost): boolean {
    return this.state.currentHostId === host.id;
  }

  isTargetFormForHost(hostId: string | null): boolean {
    return this.targetForm.active && this.targetForm.hostId === hostId;
  }

  isEditingTarget(target: MatrixTarget): boolean {
    return this.targetForm.isEditing && this.targetForm.target === target;
  }

  isEditingHost(host: MatrixHost): boolean {
    return this.hostForm.active && this.hostForm.isEditing && this.hostForm.host === host;
  }
}
