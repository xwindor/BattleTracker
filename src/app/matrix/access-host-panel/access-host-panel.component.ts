import { Component, Input, OnChanges, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { NgbModal, NgbTooltipModule } from "@ng-bootstrap/ng-bootstrap";
import { MatrixParticipant, MatrixHost, HostAccessMethod } from "Matrix";
import { MatrixStateService } from "app/services/matrix-state.service";
import { OsTrackingService } from "app/services/os-tracking.service";
import { OsPromptComponent } from "app/matrix/os-prompt/os-prompt.component";

type AccessFlow = "none" | "hack-on-fly" | "brute-force";

@Component({
  standalone: true,
  selector: "app-access-host-panel",
  templateUrl: "./access-host-panel.component.html",
  styleUrls: ["./access-host-panel.component.css"],
  imports: [CommonModule, FormsModule, NgbTooltipModule]
})
export class AccessHostPanelComponent implements OnChanges {
  @Input({ required: true }) activeDeckers!: MatrixParticipant[];

  flow: AccessFlow = "none";
  selectedDeckerId = "";

  /**
   * The number of marks the GM is recording as **added on this attempt** —
   * typed in from an outcome already resolved at the table (physical dice,
   * or the battle tracker's own dice roller elsewhere in the app), never
   * rolled or derived here. The Matrix module has no dice roller of its own
   * (Xavier's decision 2, 2026-09-02: "I'm not aware of a dice roller other
   * than the one that already exists in the battle tracker, the matrix
   * module should not have a separate dice roller") and does not compare
   * dice to decide an outcome (Xavier's decision 1, 2026-09-02: "we aren't
   * doing any rolls outside the already existing dice roller ... and we
   * aren't comparing any dice either"; `RULINGS.md` restored 2026-09-02,
   * "This module tracks Matrix state; it does not apply effects"). `0` is a
   * legitimate entry — a failed attempt still accrues Overwatch even though
   * it places no marks (p. 232 — Overwatch rises with the defender's hits on
   * *any* Attack or Sleaze action, success or failure; round-5 validator
   * defect 9 fixed this citation from p. 231, the noise/illegality page, to
   * p. 232, the accrual page; see `confirmAccess()` below).
   *
   * "Added on this attempt", not "total now" — a single successful Brute
   * Force or Hack on the Fly places one mark unless the GM declared (and
   * paid the dice penalty for) going for two or three before rolling
   * (pp. 238, 240; see the `ahp-marks-penalty-hint` text in the template).
   * This is the reading `confirmAccess()` and `addMarkToHost()` both use —
   * the count is added to whatever the host already holds for this decker,
   * capped at 3 (round-4 defect D-2: an earlier version of this docstring
   * left the reading ambiguous).
   *
   * Starts `null`, not `0` — an empty selection is not a deliberate "place
   * no marks" entry, the same principle `OsPromptComponent.customDelta`
   * already applies to the Overwatch box (Xavier, 2026-09-02: "if it's less
   * empty force the user to input something before closing it"). `0` stays
   * a fully legitimate, deliberately-chosen value once picked. Renamed from
   * `marksPlaced` (round-4 Decision 6) — that name collided with
   * `MatrixParticipant.marksPlaced`, a `Map` on a different class that this
   * field has never had anything to do with; that collision helped hide
   * round-4 defect D-9 (the Map was deleted — see `MatrixParticipant.ts`).
   */
  marksThisAttempt: number | null = null;

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

  /**
   * The selected decker's current mark count on the active host, before this
   * attempt is applied — the number `marksThisAttempt` will be added to and
   * capped against (p. 236, three-mark maximum).
   */
  get currentHostMarksForSelectedDecker(): number {
    const host = this.host;
    const decker = this.selectedDecker;
    if (!host || !decker) return 0;
    return host.marks[decker.name] ?? 0;
  }

  /**
   * How many of `marksThisAttempt` will actually land, once the host's
   * 3-mark cap absorbs the rest (round-4 defect D-2: `addMarkToHost()`
   * silently absorbs an entry that would push a decker's marks past 3 —
   * `matrix-state.service.ts`'s `next === prev` early return — so an Apply
   * label that always promises the full typed number can lie).
   */
  get marksThatWillLand(): number {
    if (this.marksThisAttempt === null) return 0;
    const current = this.currentHostMarksForSelectedDecker;
    return Math.min(3, current + this.marksThisAttempt) - current;
  }

  /** Whether Apply may be pressed — mirrors `OsPromptComponent.canApply`'s "an empty box is not a deliberate 0" rule (Decision 6, 2026-09-02). */
  get canApply(): boolean {
    return this.marksThisAttempt !== null;
  }

  /**
   * States exactly what Apply will do before the GM commits it — naming the
   * mark count and flagging that the Overwatch prompt follows next (brief
   * round-3 defect D1: the previous label, "Apply OS & Set Access", named
   * neither). `marksThisAttempt === 0` gets its own wording rather than
   * reading like a slip — it is a legitimate GM entry for a failed attempt
   * that still accrues Overwatch. While nothing is selected, states plainly
   * that a choice is required rather than silently defaulting (Decision 6,
   * round-4). If the host's 3-mark cap will absorb some or all of the typed
   * count, says so rather than promising a number that will not actually
   * land (round-4 defect D-2).
   */
  get applyLabel(): string {
    if (this.marksThisAttempt === null) return "Choose marks placed first";
    const landing = this.marksThatWillLand;
    const marksText = this.marksThisAttempt === 0
      ? "Place no marks"
      : `Place ${this.marksThisAttempt} mark${this.marksThisAttempt === 1 ? "" : "s"}`;
    if (landing === this.marksThisAttempt) {
      return `Set Access · ${marksText} · Add OS…`;
    }
    if (landing === 0) {
      return `Set Access · Already at 3-mark cap, none will be added · Add OS…`;
    }
    return `Set Access · Only ${landing} of ${this.marksThisAttempt} will land (3-mark cap) · Add OS…`;
  }

  startFlow(mode: AccessFlow): void {
    this.flow = mode;
    this.marksThisAttempt = null;
    this.showDirectPanel = false;
    this.directConfirmMsg = "";
    if (!this.selectedDeckerId && this.activeDeckers.length > 0) {
      this.selectedDeckerId = this.activeDeckers[0].name;
    }
  }

  cancelFlow(): void {
    this.flow = "none";
  }

  /**
   * Sets the host's access method, writes the GM-recorded marks and the
   * GM-typed Overwatch delta. Nothing in this method rolls, compares, or
   * derives a number from a roll — the Matrix module has no dice roller of
   * its own (Xavier's decision 2, 2026-09-02) and does not resolve opposed
   * tests (`SCOPE.md`, "resolving opposed tests"; `RULINGS.md` restored
   * 2026-09-02, "This module tracks Matrix state; it does not apply
   * effects"). `marksThisAttempt` and the Overwatch delta below are both
   * typed by the GM from a resolution that already happened at the table.
   */
  async confirmAccess(): Promise<void> {
    const host = this.host;
    const decker = this.selectedDecker;
    if (!host || !decker || !this.canApply) return;

    const actionName = this.flow === "hack-on-fly" ? "Hack on the Fly" : "Brute Force";

    const modalRef = this.modal.open(OsPromptComponent, { centered: true, size: "sm" });
    const inst = modalRef.componentInstance as OsPromptComponent;
    inst.actionEntries = [{ name: actionName }];
    inst.deckerName = decker.name;

    try {
      // The value returned here is exactly what the GM typed into the prompt
      // — the defender's hits on its defense test (p. 232). This method does
      // not compute it from marks or from any roll
      // (SCOPE.md, "computing net hits into consequences").
      const confirmedDelta: number = await modalRef.result;
      const method: HostAccessMethod = this.flow === "hack-on-fly" ? "hack-on-fly" : "brute-force";
      this.matrixState.setHostAccessMethod(host, method);
      if (this.marksThisAttempt !== null && this.marksThisAttempt > 0) {
        this.matrixState.addMarkToHost(host, decker.name, this.marksThisAttempt);
      }
      this.osTracking.addOS(decker, confirmedDelta,
        `${actionName} — defender rolled ${confirmedDelta} hit${confirmedDelta === 1 ? "" : "s"} on its defense test (p. 232)`);
      // Only the success path clears the flow (brief round-3 defect D2):
      // dismissing the modal must return the GM to this panel with their
      // marksThisAttempt selection intact, not discard it.
      this.flow = "none";
    } catch {
      // modal dismissed — flow and marksThisAttempt stay exactly as the GM
      // left them, so Cancel returns them to the panel rather than out of it.
    }
  }

  toggleDirectPanel(): void {
    this.showDirectPanel = !this.showDirectPanel;
    this.flow = "none";
    this.directConfirmMsg = "";
    if (this.showDirectPanel && !this.directDeckerId && this.activeDeckers.length > 0) {
      this.directDeckerId = this.activeDeckers[0].name;
    }
  }

  /**
   * Sets the host's recorded access method. Places **no** marks: connecting
   * a cable is physical access, not one of the three ways to get a mark (the
   * icon inviting you, Brute Force, or Hack on the Fly, p. 236). The port
   * placed one mark here automatically — deleted (AC-7).
   */
  applyDirectConnection(): void {
    const host = this.host;
    const decker = this.directDecker;
    if (!host || !decker) return;
    this.matrixState.setHostAccessMethod(host, "direct-connection");
    this.directConfirmMsg =
      `Direct connection established to ${host.name} for ${decker.name}. No marks placed — a mark still requires a successful Brute Force or Hack on the Fly (pp. 232, 236).`;
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
