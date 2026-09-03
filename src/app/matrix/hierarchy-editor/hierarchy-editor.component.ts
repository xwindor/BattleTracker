import { Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { NgbTooltipModule } from "@ng-bootstrap/ng-bootstrap";
import {
  MatrixParticipant,
  MatrixHost,
  MatrixTarget,
  MatrixTargetType,
  MatrixTargetVisibility,
  matrixConditionMonitor
} from "Matrix";
import { MatrixStateService } from "app/services/matrix-state.service";
import { TargetCardComponent } from "app/matrix/target-card/target-card.component";

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
  visibility: MatrixTargetVisibility;
  deviceRating: number;
  linkedParticipantId: string;
}

const BLANK_HOST_FORM: HostFormState = {
  active: false, isEditing: false, host: null,
  name: "", rating: 4, attack: 4, sleaze: 5, dataProcessing: 6, firewall: 7,
  setActive: true
};

const BLANK_TARGET_FORM: TargetFormState = {
  active: false, isEditing: false, target: null, hostId: null,
  name: "", type: "device", visibility: "hidden",
  deviceRating: 4, linkedParticipantId: ""
};

/**
 * Matrix Condition Monitor for a target being saved from this form, or
 * `undefined` when the type has none at all.
 *
 * - `device` and `persona`: 8 + ceil(Device Rating / 2) (p. 228). A persona's
 *   damage lands on the device it runs on, not on a monitor of its own
 *   (p. 228), so it is sized off the same Device Rating field the GM enters
 *   for a device — never the hard-coded rating of 1 the port used to pass.
 * - `ic`: 8 + ceil(Host Rating / 2) — IC borrows its host's rating, it has no
 *   Device Rating of its own (p. 247; size per Table Ruling 2, RULINGS.md
 *   2026-08-29).
 * - `file` and `host`: no Matrix Condition Monitor at all — hosts and files
 *   cannot be attacked with Matrix damage (p. 229). No `default` branch: an
 *   unhandled `MatrixTargetType` is a compile error here, not a silent 9
 *   (choke point — see briefs/matrix-port-rules-correctness-spec.md
 *   appendix G1).
 */
function calcMatrixHealth(type: MatrixTargetType, deviceRating: number, hostRating: number): number | undefined {
  switch (type) {
    case "device":
    case "persona":
      return matrixConditionMonitor(deviceRating);
    case "ic":
      return matrixConditionMonitor(hostRating);
    case "file":
    case "host":
      return undefined;
  }
}

@Component({
  standalone: true,
  selector: "app-hierarchy-editor",
  templateUrl: "./hierarchy-editor.component.html",
  styleUrls: ["./hierarchy-editor.component.css"],
  imports: [CommonModule, FormsModule, NgbTooltipModule, TargetCardComponent]
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
    // "The ratings of these attributes are usually (Host Rating), (Host
    // Rating + 1), (Host Rating + 2), and (Host Rating + 3), in any order"
    // (p. 247, `rules/pages/p0249.txt:36-40`) — round-4 citation, D-12.
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
    // No matrixHealth here: hosts have no Matrix Condition Monitor (p. 229).

    if (f.isEditing && f.host) {
      this.matrixState.updateHost(f.host, {
        name: f.name.trim(), rating,
        attack: f.attack, sleaze: f.sleaze,
        dataProcessing: f.dataProcessing, firewall: f.firewall
      });
      this.expandedHosts.add(f.host.id);
    } else {
      const host = new MatrixHost({
        id: this.matrixState.generateTargetId().replace("t-", "h-"),
        name: f.name.trim(), rating,
        attack: f.attack, sleaze: f.sleaze,
        dataProcessing: f.dataProcessing, firewall: f.firewall
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
      visibility: "hidden"
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
      visibility: target.visibility,
      deviceRating: target.deviceRating,
      linkedParticipantId: target.linkedParticipantId ?? ""
    };
    this.hostForm = { ...BLANK_HOST_FORM };
  }

  closeTargetForm(): void {
    this.targetForm = { ...BLANK_TARGET_FORM };
  }

  saveTargetForm(): void {
    const f = this.targetForm;
    if (!f.name.trim()) return;

    const host = f.hostId ? (this.state.hosts.find(h => h.id === f.hostId) ?? null) : null;
    const deviceRating = Math.max(1, f.deviceRating);
    // "ic" targets have no Device Rating of their own — they borrow the
    // containing host's Rating (p. 247); fall back to deviceRating only for
    // an "ic" target sitting in public space, which should not happen from
    // this form (IC Target is only offered when a host is selected) but
    // leaves no undefined rating if it ever does.
    const health = calcMatrixHealth(f.type, deviceRating, host?.rating ?? deviceRating) ?? 0;

    if (f.isEditing && f.target) {
      this.matrixState.updateTarget(f.target, {
        name: f.name.trim(),
        type: f.type,
        visibility: f.visibility,
        deviceRating: Math.max(1, Math.min(12, f.deviceRating)),
        linkedParticipantId: f.linkedParticipantId || undefined,
        matrixHealth: health
      });
    } else {
      const target = new MatrixTarget({
        id: this.matrixState.generateTargetId(),
        name: f.name.trim(),
        type: f.type,
        context: host ? "host" : "public",
        visibility: f.visibility,
        deviceRating: Math.max(1, Math.min(12, f.deviceRating)),
        linkedParticipantId: f.linkedParticipantId || undefined,
        linkedHostId: f.hostId ?? undefined,
        matrixHealth: health
      });
      this.matrixState.addTarget(host, target);
    }
    this.targetForm = { ...BLANK_TARGET_FORM };
  }

  /**
   * Removes a target. Round-5 defect D-4: an open-grid target that is
   * itself a parent left its children pointing at a now-deleted
   * `parentTargetId` — `childrenOf()` filters on the parent's id, so those
   * children simply stopped rendering anywhere, while still counting toward
   * the "Public Space" header count and still broadcasting to the player
   * view. Direct children are re-homed to top level (their `parentTargetId`
   * cleared) rather than deleted with the parent — deleting a GM's tracked
   * icons as a side effect of deleting an unrelated one is a bigger surprise
   * than un-nesting them. Made explicit rather than silent: if the target
   * being deleted has children, the GM is told how many and asked to
   * confirm before anything happens.
   */
  deleteTarget(host: MatrixHost | null, target: MatrixTarget): void {
    if (!host) {
      const children = this.childrenOf(target.id);
      if (children.length > 0) {
        const names = children.map(c => c.name).join(", ");
        const ok = window.confirm(
          `"${target.name}" has ${children.length} item(s) parented to it (${names}). ` +
          `Deleting it will move them to top level, not delete them. Continue?`
        );
        if (!ok) return;
        for (const child of children) {
          this.matrixState.updateTarget(child, { parentTargetId: undefined });
        }
      }
    }
    this.matrixState.removeTarget(host, target);
    if (this.targetForm.target === target) this.targetForm = { ...BLANK_TARGET_FORM };
  }

  // ── Visibility cycling ──────────────────────────────────────────────────

  cycleVisibility(host: MatrixHost | null, target: MatrixTarget): void {
    const order: MatrixTargetVisibility[] = ["hidden", "running-silent", "active"];
    const next = order[(order.indexOf(target.visibility) + 1) % order.length];
    this.matrixState.setTargetVisibility(target, next);
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

  visibilityLabel(v: MatrixTargetVisibility): string {
    switch (v) {
      case "hidden":         return "HIDDEN";
      case "running-silent": return "RUNNING SILENT";
      case "active":         return "ACTIVE";
    }
  }

  visibilityClass(v: MatrixTargetVisibility): string {
    // CSS classes are reused from the old spotted-* classes for now.
    switch (v) {
      case "hidden":         return "spotted-invisible";
      case "running-silent": return "spotted-ghost";
      case "active":         return "spotted-revealed";
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

  // ── Host mark management ─────────────────────────────────────────────────

  private hostMarkState = new Map<string, { open: boolean; selectedDeckerId: string }>();

  getHostMarkState(hostId: string): { open: boolean; selectedDeckerId: string } {
    if (!this.hostMarkState.has(hostId)) {
      this.hostMarkState.set(hostId, { open: false, selectedDeckerId: "" });
    }
    return this.hostMarkState.get(hostId)!;
  }

  hostMarkEntries(host: MatrixHost): { deckerId: string; count: number }[] {
    return Object.entries(host.marks)
      .filter(([, c]) => c > 0)
      .map(([id, count]) => ({ deckerId: id, count }));
  }

  /** Deckers that can still receive another mark on this host (count < 3). */
  hostAvailableDeckers(host: MatrixHost): MatrixParticipant[] {
    return this.activeDeckers.filter(d => (host.marks[d.name] ?? 0) < 3);
  }

  dots(count: number): string {
    return "●".repeat(count) + "○".repeat(3 - count);
  }

  openHostAddMark(host: MatrixHost): void {
    const s = this.getHostMarkState(host.id);
    s.open = true;
    if (!s.selectedDeckerId && this.hostAvailableDeckers(host).length > 0) {
      s.selectedDeckerId = this.hostAvailableDeckers(host)[0].name;
    }
  }

  confirmHostAddMark(host: MatrixHost): void {
    const s = this.getHostMarkState(host.id);
    if (!s.selectedDeckerId) return;
    if ((host.marks[s.selectedDeckerId] ?? 0) >= 3) return;
    this.matrixState.addMarkToHost(host, s.selectedDeckerId, 1);
    s.open = false;
  }

  removeHostMark(host: MatrixHost, deckerId: string): void {
    this.matrixState.removeMarkFromHost(host, deckerId);
  }

  // ── Noise (GM-set reminder, round-4 D-13) ───────────────────────────────

  /**
   * The Hierarchy editor is the natural home for the noise reminder — it is
   * the GM's one screen for scene-level Matrix state that isn't a decker or
   * a host. `MatrixRunState.noise` initialises to 0 and, before this, had no
   * editor anywhere: `access-host-panel.component.html` only ever *reads*
   * it (`matrixState.state.noise > 0`), so the reminder could never actually
   * appear (brief round-4 defect D-13). Never applied to any dice pool —
   * display only (`SCOPE.md`, Scope Question B).
   */
  onNoiseChanged(value: number): void {
    this.matrixState.setNoise(Number(value) || 0);
  }

  // ── Open-grid parent/child targets (Decision 7b, 2026-09-02) ────────────

  /**
   * Every public-space target directly parented under `parentId` (`null` for
   * the top-level, unparented targets). Used to render public space as a
   * nested tree instead of a flat list, so "a weapon parented to a device"
   * is visibly nested under that device (Xavier, 2026-09-02: "devices on
   * the open grid have other devices like weapons and files parented to
   * it"). Host-contained targets are unaffected — `parentTargetId` is scoped
   * to `context === "public"` targets only; a host-contained target's
   * containment is `linkedHostId`, a different mechanism (Decision 7a).
   */
  childrenOf(parentId: string | null): MatrixTarget[] {
    return this.state.publicTargets.filter(t => (t.parentTargetId ?? null) === parentId);
  }

  /** All ids reachable by walking down from `id` (used to keep the parent picker acyclic). */
  private descendantIds(id: string): Set<string> {
    const result = new Set<string>();
    const stack = [id];
    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const child of this.childrenOf(current)) {
        if (!result.has(child.id)) {
          result.add(child.id);
          stack.push(child.id);
        }
      }
    }
    return result;
  }

  /**
   * Valid parent choices for `target`: every other public-space **device**,
   * excluding `target` itself and anything already beneath it — picking a
   * descendant as your own parent would create a cycle
   * `MatrixStateService.addMark()`'s propagation walk guards against at
   * runtime, but there is no reason to let the GM create one from this form
   * in the first place.
   *
   * Device-only (Xavier's decision 8, 2026-09-03): a mark only ever
   * propagates onto a device or a host — never a file, persona, IC, or
   * nested host — so offering one of those as a parent choice would build a
   * link `MatrixStateService.propagateMarkUp()` will never actually walk
   * through. See `MatrixTarget.parentTargetId`'s doc comment for the full
   * citation.
   */
  parentOptionsFor(target: MatrixTarget): MatrixTarget[] {
    const excluded = this.descendantIds(target.id);
    excluded.add(target.id);
    return this.state.publicTargets.filter(t => !excluded.has(t.id) && t.type === "device");
  }

  /**
   * Whether `target` should offer a "Parent" control at all — device-only
   * (Xavier's decision 8, 2026-09-03): only a device ever propagates a mark
   * it receives, so parenting a file/persona/IC/nested-host under something
   * else would be a control that can never do anything.
   */
  canHaveParent(target: MatrixTarget): boolean {
    return target.type === "device";
  }

  setParent(target: MatrixTarget, parentId: string): void {
    if (!parentId) {
      this.clearParent(target);
      return;
    }
    if (!this.parentOptionsFor(target).some(t => t.id === parentId)) return; // self/descendant guard
    this.matrixState.updateTarget(target, { parentTargetId: parentId });
  }

  clearParent(target: MatrixTarget): void {
    this.matrixState.updateTarget(target, { parentTargetId: undefined });
  }
}
