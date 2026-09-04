import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

/**
 * OsPromptComponent
 *
 * Asks the GM for a plain number and returns it — nothing here suggests,
 * computes or previews an Overwatch delta. Overwatch Score rises by the
 * number of hits the *defender* rolled on its defense test against an Attack
 * or Sleaze action, win or lose (p. 232) — a hit count this app never rolls
 * (SCOPE.md, "resolving opposed tests"), so the only honest UI is an empty
 * box the GM fills in from a roll made at the table.
 *
 * An earlier version of this component had a two-mode "confirm the suggested
 * delta, or modify it" flow, built on a `marksGained x N` formula that does
 * not appear anywhere in the rulebook (see
 * briefs/matrix-port-rules-correctness-spec.md, Claim 1). Collapsed to the
 * single entry mode below.
 */
@Component({
  standalone: true,
  selector: 'app-os-prompt',
  templateUrl: './os-prompt.component.html',
  styleUrls: ['./os-prompt.component.css'],
  imports: [CommonModule, FormsModule]
})
export class OsPromptComponent {
  /** Action name(s) this Overwatch entry is for — display only, no numbers. */
  @Input() actionEntries: { name: string }[] = [];
  @Input() deckerName = '';

  /** Starts empty — there is no suggested value to pre-fill (p. 232). */
  customDelta: number | null = null;

  constructor(private activeModal: NgbActiveModal) {}

  /**
   * Whether the box holds a value the Apply button may commit. An empty box
   * is not a deliberate 0 — it is "the GM hasn't typed anything yet" — so it
   * must not silently commit as 0. A deliberate 0 (the defender rolled no
   * hits) is valid and typing it is the only way to record that. Negative
   * numbers are never valid: Overwatch hits are a count, not a signed delta.
   *
   * Overwatch Score rises by a count of hits (p. 232) — always a whole,
   * non-negative number, so `3.5` and other fractions are rejected too
   * (round-3 defect D3), as is anything outside the range a real hit count
   * can take (e.g. `1e21` from a stray paste or scientific-notation entry).
   */
  get canApply(): boolean {
    return this.customDelta !== null
      && Number.isInteger(this.customDelta)
      && this.customDelta >= 0
      && this.customDelta <= Number.MAX_SAFE_INTEGER;
  }

  /** Echoes the value that will actually be committed, so a mis-typed or
   *  empty box is never silently applied (brief defect 3). */
  get applyLabel(): string {
    return this.canApply ? `Apply (+${this.customDelta})` : "Apply";
  }

  applyCustom(): void {
    if (!this.canApply) return;
    this.activeModal.close(this.customDelta as number);
  }

  cancel(): void {
    this.activeModal.dismiss('cancel');
  }
}
