import { Injectable } from "@angular/core";
import { Subject } from "rxjs";
import { UndoHandler } from "Common";
import {
  MatrixRunState,
  MatrixHost,
  MatrixParticipant,
  VRMode
} from "Matrix";

/**
 * MatrixStateService
 *
 * Central holder for the Matrix run state. Phase 1 ships the skeleton:
 * methods have real bodies but only the minimum needed for Phase 1 (jack-in,
 * jack-out, host registration). Phase 2/3 will fill in target/mark/IC logic.
 *
 * All mutations go through UndoHandler.DoAction so that undo/redo also
 * covers Matrix actions. The stateChange$ subject lets BattleTrackerComponent
 * trigger a syncSharedState() after any change.
 */
@Injectable({ providedIn: "root" })
export class MatrixStateService {
  readonly state: MatrixRunState = new MatrixRunState();

  /** Fires after any state mutation so subscribers can re-broadcast. */
  readonly stateChange$ = new Subject<void>();

  /**
   * Phase-1 skeleton, currently uncalled (the live GM jack-in path is
   * BattleTrackerComponent.gmJackIn / handleSessionCommand).
   *
   * The dice count is written *without* rolling here on purpose: this body is
   * a `UndoHandler.DoAction` action closure that is also replayed on redo, so
   * rolling inside it would re-roll on every redo. A mid-turn dice change
   * needs the roll-and-Score-delta (brief F5, p. 160) and must therefore go
   * through BattleTrackerComponent's dice-count funnel, not through here.
   */
  jackIn(decker: MatrixParticipant, vrMode: VRMode, intuition: number): void {
    UndoHandler.DoAction(
      () => {
        decker.applyJackInMode(vrMode, intuition, n => decker.setDicesWithoutRoll(n));
        if (!this.state.deckers.includes(decker)) {
          this.state.deckers.push(decker);
        }
      },
      () => {
        // Best-effort undo: revert to AR + un-jack.
        decker.applyJackInMode(VRMode.AR, intuition, n => decker.setDicesWithoutRoll(n));
        decker.jackedIn = false;
        decker.blocksPhysicalActions = false;
        const idx = this.state.deckers.indexOf(decker);
        if (idx >= 0) this.state.deckers.splice(idx, 1);
      }
    );
    this.stateChange$.next();
  }

  jackOut(decker: MatrixParticipant): void {
    const wasJackedIn = decker.jackedIn;
    const previousMode = decker.vrMode;
    const previousOS = decker.overwatch;
    UndoHandler.DoAction(
      () => {
        decker.jackedIn = false;
        decker.blocksPhysicalActions = false;
        decker.overwatch = 0;
        decker.vrMode = VRMode.AR;
      },
      () => {
        decker.jackedIn = wasJackedIn;
        decker.vrMode = previousMode;
        decker.overwatch = previousOS;
        decker.blocksPhysicalActions = (previousMode !== VRMode.AR);
      }
    );
    this.stateChange$.next();
  }

  addHost(host: MatrixHost): void {
    UndoHandler.DoAction(
      () => { this.state.hosts.push(host); },
      () => {
        const idx = this.state.hosts.indexOf(host);
        if (idx >= 0) this.state.hosts.splice(idx, 1);
      }
    );
    this.stateChange$.next();
  }

  setCurrentHost(id: string | null): void {
    const previous = this.state.currentHostId;
    UndoHandler.DoAction(
      () => { this.state.currentHostId = id; },
      () => { this.state.currentHostId = previous; }
    );
    this.stateChange$.next();
  }

  /** Convenience for templates — current host name (used by SharedCombatState). */
  getCurrentHostName(): string | undefined {
    if (!this.state.currentHostId) return undefined;
    return this.state.hosts.find(h => h.id === this.state.currentHostId)?.name;
  }
}
