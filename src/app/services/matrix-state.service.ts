import { Injectable } from "@angular/core";
import { Subject } from "rxjs";
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
 * The stateChange$ subject lets BattleTrackerComponent trigger a
 * syncSharedState() after any change.
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
   * The dice count is written *without* rolling here on purpose. A mid-turn
   * dice change needs the roll-and-Score-delta (brief F5, p. 160) and must
   * therefore go through BattleTrackerComponent's dice-count funnel, not
   * through here.
   */
  jackIn(decker: MatrixParticipant, vrMode: VRMode, intuition: number): void {
    decker.applyJackInMode(vrMode, intuition, n => decker.setDicesWithoutRoll(n));
    if (!this.state.deckers.includes(decker)) {
      this.state.deckers.push(decker);
    }
    this.stateChange$.next();
  }

  jackOut(decker: MatrixParticipant): void {
    decker.jackedIn = false;
    decker.blocksPhysicalActions = false;
    decker.overwatch = 0;
    decker.vrMode = VRMode.AR;
    this.stateChange$.next();
  }

  addHost(host: MatrixHost): void {
    this.state.hosts.push(host);
    this.stateChange$.next();
  }

  setCurrentHost(id: string | null): void {
    this.state.currentHostId = id;
    this.stateChange$.next();
  }

  /** Convenience for templates — current host name (used by SharedCombatState). */
  getCurrentHostName(): string | undefined {
    if (!this.state.currentHostId) return undefined;
    return this.state.hosts.find(h => h.id === this.state.currentHostId)?.name;
  }
}
