import { Injectable } from "@angular/core";
import { Observable, Subject } from "rxjs";
import { UndoHandler } from "Common";
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
 * isolation. Mutations are wrapped in UndoHandler.DoAction so undoing an
 * illegal action also undoes its OS cost.
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
    UndoHandler.DoAction(
      () => { decker.overwatch = previous + amount; },
      () => { decker.overwatch = previous; }
    );
    const newAlert = this.getOSAlert(decker);
    if (newAlert !== previousAlert && newAlert !== "none") {
      this._threshold$.next({ decker, alert: newAlert, reason });
    }
  }

  resetOS(decker: MatrixParticipant): void {
    const previous = decker.overwatch;
    if (previous === 0) return;
    UndoHandler.DoAction(
      () => { decker.overwatch = 0; },
      () => { decker.overwatch = previous; }
    );
  }

  getOSAlert(decker: MatrixParticipant): OsAlertLevel {
    if (decker.overwatch >= 40) return "convergence";
    if (decker.overwatch >= 20) return "ic-alert";
    return "none";
  }
}
