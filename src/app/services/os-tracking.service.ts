import { Injectable } from "@angular/core";
import { Observable, Subject } from "rxjs";
import { MatrixParticipant } from "Matrix";

export type OsAlertLevel = "none" | "ic-alert" | "convergence";

export interface OsThresholdEvent {
  decker: MatrixParticipant;
  alert: OsAlertLevel;
  reason: string;
}

/**
 * OsTrackingService
 *
 * Owns Overwatch Score accumulation and threshold detection. Kept separate
 * from MatrixStateService so the threshold logic can be unit-tested in
 * isolation.
 *
 * Threshold semantics (Section 9.2 / Table 25):
 *   OS >= 20 → 'ic-alert'    (host spawns or escalates IC)
 *   OS >= 40 → 'convergence' (GOD sends a Convergence attack)
 *
 * Subscribers receive an OsThresholdEvent whenever OS *crosses* into a
 * higher alert tier (idle increments inside the same tier do not fire).
 */
@Injectable({ providedIn: "root" })
export class OsTrackingService {
  private readonly _threshold$ = new Subject<OsThresholdEvent>();
  readonly threshold$: Observable<OsThresholdEvent> = this._threshold$.asObservable();

  addOS(decker: MatrixParticipant, amount: number, reason: string): void {
    if (!amount) return;
    const previous = decker.overwatch;
    const previousAlert = this.getOSAlert(decker);
    decker.overwatch = previous + amount;
    const newAlert = this.getOSAlert(decker);
    if (newAlert !== previousAlert && newAlert !== "none") {
      this._threshold$.next({ decker, alert: newAlert, reason });
    }
  }

  resetOS(decker: MatrixParticipant): void {
    if (decker.overwatch === 0) return;
    decker.overwatch = 0;
  }

  getOSAlert(decker: MatrixParticipant): OsAlertLevel {
    if (decker.overwatch >= 40) return "convergence";
    if (decker.overwatch >= 20) return "ic-alert";
    return "none";
  }
}
