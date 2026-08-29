import { Injectable } from "@angular/core";
import { Observable, Subject } from "rxjs";
import { MatrixParticipant } from "Matrix";

/**
 * Overwatch Score alert level.
 *
 * There are exactly two states, because SR5 defines exactly one Overwatch
 * threshold: 40 (printed p. 232). There is no "IC alert" tier, no alert level
 * and no security tier anywhere in the Matrix chapter.
 *
 * An earlier version of this file carried an `'ic-alert'` state at OS 20 and
 * attributed it to "Section 9.2 / Table 25" — a citation format SR5 does not
 * use, for a rule that does not exist (see
 * `briefs/matrix-rules-verification.md`, item 3b). Hosts launch IC when they
 * *spot* unauthorized activity (p. 247) or when the intruder *fails* a Sleaze
 * action (pp. 231, 236) — both event-driven, neither a function of OS.
 */
export type OsAlertLevel = "none" | "convergence";

/**
 * Purely presentational Overwatch bands, for colouring the OS chip so a rising
 * score reads as rising pressure at the table.
 *
 * **These carry no mechanical effect whatsoever** (RULINGS.md, 2026-08-29
 * "Overwatch Score banding below 40 is display-only"). The 15 and 30 cut
 * points are arbitrary presentation values chosen to space the colours evenly
 * below convergence — they are NOT printed rules, and nothing may branch on
 * them. Only `convergence` corresponds to a real threshold (p. 232).
 */
export type OsBand = "low" | "building" | "high" | "convergence";

/** See {@link OsBand} — arbitrary display cut points, not rules. */
const OS_BAND_BUILDING = 15;
const OS_BAND_HIGH = 30;

/** The one real Overwatch threshold in SR5 (p. 232). */
export const OS_CONVERGENCE_THRESHOLD = 40;

/**
 * The single definition of the presentational OS bands, so the service and the
 * badge cannot drift apart. Exported as a plain function rather than a service
 * method so the badge stays a dumb presentational component with no injection.
 *
 * Presentation only — see {@link OsBand}.
 */
export function osBandFor(overwatch: number): OsBand {
  if (overwatch >= OS_CONVERGENCE_THRESHOLD) return "convergence";
  if (overwatch >= OS_BAND_HIGH) return "high";
  if (overwatch >= OS_BAND_BUILDING) return "building";
  return "low";
}

export interface OsThresholdEvent {
  decker: MatrixParticipant;
  alert: OsAlertLevel;
  reason: string;
}

/**
 * OsTrackingService
 *
 * Owns Overwatch Score accumulation and convergence detection. Kept separate
 * from MatrixStateService so the threshold logic can be unit-tested in
 * isolation.
 *
 * The Matrix module is a state tracker, not a rules resolver
 * (`docs/MATRIX_MODULE_PLAN.md`): **nothing here accrues OS on its own.** OS
 * moves only when the GM adjusts it. The printed accrual rule — "your OS
 * increases by the number of hits the target gets on its defense test" for any
 * Attack or Sleaze action (p. 232) — depends on a defender's hit count that
 * this app never rolls, so the GM applies it and enters the result.
 *
 * Subscribers receive an OsThresholdEvent when a decker *crosses* into
 * convergence; increments inside the same state do not fire.
 */
@Injectable({ providedIn: "root" })
export class OsTrackingService {
  private readonly _threshold$ = new Subject<OsThresholdEvent>();
  readonly threshold$: Observable<OsThresholdEvent> = this._threshold$.asObservable();

  addOS(decker: MatrixParticipant, amount: number, reason: string): void {
    if (!amount) return;
    const previousAlert = this.getOSAlert(decker);
    decker.overwatch = decker.overwatch + amount;
    const newAlert = this.getOSAlert(decker);
    if (newAlert !== previousAlert && newAlert !== "none") {
      this._threshold$.next({ decker, alert: newAlert, reason });
    }
  }

  /**
   * Reset a decker's Overwatch Score to zero and erase the marks they placed.
   *
   * Both halves are printed: "When you reboot the device your persona is on,
   * your OS is reset to zero and all of your marks, as well as the ones others
   * may have put on your icon, are erased" (p. 242); "you're as pure and
   * innocent as the driven snow" (p. 232). Jack Out reboots the device you are
   * using (p. 240) and so resets in the same way.
   *
   * There is deliberately **no cooldown, minimum offline duration or residual
   * OS** (RULINGS.md, 2026-08-29). Marks are per-persona, so this clears only
   * this decker's marks; a teammate's marks on the same icon are untouched.
   */
  resetOS(decker: MatrixParticipant): void {
    decker.overwatch = 0;
    decker.marksPlaced.clear();
  }

  getOSAlert(decker: MatrixParticipant): OsAlertLevel {
    return decker.overwatch >= OS_CONVERGENCE_THRESHOLD ? "convergence" : "none";
  }

  /** Presentational band only — see {@link OsBand}. Never branch on this. */
  getOSBand(decker: MatrixParticipant): OsBand {
    return osBandFor(decker.overwatch);
  }
}
