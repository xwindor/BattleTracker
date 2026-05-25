import { Injectable } from "@angular/core";
import { Subject } from "rxjs";
import { UndoHandler } from "Common";
import {
  MatrixRunState,
  MatrixHost,
  MatrixTarget,
  MatrixTargetSpotted,
  MatrixParticipant,
  ICParticipant,
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

  jackIn(decker: MatrixParticipant, vrMode: VRMode, intuition: number): void {
    UndoHandler.DoAction(
      () => {
        decker.applyJackInMode(vrMode, intuition);
        if (!this.state.deckers.includes(decker)) {
          this.state.deckers.push(decker);
        }
      },
      () => {
        // Best-effort undo: revert to AR + un-jack.
        decker.applyJackInMode(VRMode.AR, intuition);
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

  /** Returns the currently active host, or null if none is set. */
  getCurrentHost(): MatrixHost | null {
    if (!this.state.currentHostId) return null;
    return this.state.hosts.find(h => h.id === this.state.currentHostId) ?? null;
  }

  /**
   * Creates a new active host (or updates name/rating of the existing one).
   * Returns the host object so callers can reference it immediately.
   */
  createOrSetHost(name: string, rating: number): MatrixHost {
    const existing = this.getCurrentHost();
    if (existing) {
      const prevName = existing.name;
      const prevRating = existing.rating;
      const prevHealth = existing.matrixHealth;
      UndoHandler.DoAction(
        () => {
          existing.name = name;
          existing.rating = rating;
          existing.matrixHealth = 8 + Math.ceil(rating / 2);
        },
        () => {
          existing.name = prevName;
          existing.rating = prevRating;
          existing.matrixHealth = prevHealth;
        }
      );
      this.stateChange$.next();
      return existing;
    }

    const host = new MatrixHost({ id: this.generateId(), name, rating });
    UndoHandler.DoAction(
      () => {
        this.state.hosts.push(host);
        this.state.currentHostId = host.id;
      },
      () => {
        const idx = this.state.hosts.indexOf(host);
        if (idx >= 0) this.state.hosts.splice(idx, 1);
        this.state.currentHostId = null;
      }
    );
    this.stateChange$.next();
    return host;
  }

  /** Clears the active host (does not delete it from the hosts list). */
  clearActiveHost(): void {
    const prev = this.state.currentHostId;
    if (!prev) return;
    UndoHandler.DoAction(
      () => { this.state.currentHostId = null; },
      () => { this.state.currentHostId = prev; }
    );
    this.stateChange$.next();
  }

  /** Registers an ICParticipant into a host's active IC list. */
  addICToHost(host: MatrixHost, ic: ICParticipant): void {
    UndoHandler.DoAction(
      () => { host.icActive.push(ic); },
      () => {
        const idx = host.icActive.indexOf(ic);
        if (idx >= 0) host.icActive.splice(idx, 1);
      }
    );
    this.stateChange$.next();
  }

  /** Removes an ICParticipant from its host's active IC list. */
  removeICFromHost(host: MatrixHost, ic: ICParticipant): void {
    const idx = host.icActive.indexOf(ic);
    if (idx < 0) return;
    UndoHandler.DoAction(
      () => {
        const i = host.icActive.indexOf(ic);
        if (i >= 0) host.icActive.splice(i, 1);
      },
      () => { host.icActive.push(ic); }
    );
    this.stateChange$.next();
  }

  /**
   * Adds `count` marks from a decker to the host's canonical marks record,
   * then mirrors the updated count to all active IC in the host.
   * (SR5E p.247 host-wide mark propagation.)
   */
  addMarkToHost(host: MatrixHost, deckerId: string, count = 1): void {
    const prev = host.marks[deckerId] ?? 0;
    const next = Math.min(3, prev + count);
    if (next === prev) return;
    UndoHandler.DoAction(
      () => {
        host.marks[deckerId] = next;
        for (const ic of host.icActive) {
          ic.marksPlaced.set(deckerId, next);
        }
      },
      () => {
        host.marks[deckerId] = prev;
        for (const ic of host.icActive) {
          ic.marksPlaced.set(deckerId, prev);
        }
      }
    );
    this.stateChange$.next();
  }

  setNoise(n: number): void {
    const previous = this.state.noise;
    const next = Math.max(0, Math.round(n));
    if (next === previous) return;
    UndoHandler.DoAction(
      () => { this.state.noise = next; },
      () => { this.state.noise = previous; }
    );
    this.stateChange$.next();
  }

  setActiveGrid(grid: "public" | "corporate" | "prime"): void {
    const previous = this.state.activeGrid;
    if (grid === previous) return;
    UndoHandler.DoAction(
      () => { this.state.activeGrid = grid; },
      () => { this.state.activeGrid = previous; }
    );
    this.stateChange$.next();
  }

  /** Adds a MatrixTarget to a host's target list or to public space (host = null). */
  addTarget(host: MatrixHost | null, target: MatrixTarget): void {
    UndoHandler.DoAction(
      () => {
        if (host) {
          host.targets.push(target);
        } else {
          this.state.publicTargets.push(target);
        }
      },
      () => {
        const list = host ? host.targets : this.state.publicTargets;
        const idx = list.indexOf(target);
        if (idx >= 0) list.splice(idx, 1);
      }
    );
    this.stateChange$.next();
  }

  /** Removes a MatrixTarget from a host or public space. */
  removeTarget(host: MatrixHost | null, target: MatrixTarget): void {
    const list = host ? host.targets : this.state.publicTargets;
    const idx = list.indexOf(target);
    if (idx < 0) return;
    UndoHandler.DoAction(
      () => {
        const i = list.indexOf(target);
        if (i >= 0) list.splice(i, 1);
      },
      () => { list.splice(idx, 0, target); }
    );
    this.stateChange$.next();
  }

  /** Updates the spotted state on a MatrixTarget. */
  setTargetSpotted(target: MatrixTarget, spotted: MatrixTargetSpotted): void {
    const prev = target.spotted;
    if (prev === spotted) return;
    UndoHandler.DoAction(
      () => { target.spotted = spotted; },
      () => { target.spotted = prev; }
    );
    this.stateChange$.next();
  }

  /** Applies a partial field update to a MatrixTarget (name, type, rating, etc.). */
  updateTarget(target: MatrixTarget, fields: Partial<MatrixTarget>): void {
    const prev: Partial<MatrixTarget> = {};
    for (const k of Object.keys(fields) as Array<keyof MatrixTarget>) {
      (prev as Record<string, unknown>)[k] = target[k];
    }
    UndoHandler.DoAction(
      () => { Object.assign(target, fields); },
      () => { Object.assign(target, prev); }
    );
    this.stateChange$.next();
  }

  /**
   * Updates editable host fields (name, rating, ASDF, matrixHealth).
   * Pass only the keys you want to change.
   */
  updateHost(
    host: MatrixHost,
    fields: Partial<Pick<MatrixHost, "name" | "rating" | "attack" | "sleaze" | "dataProcessing" | "firewall" | "matrixHealth">>
  ): void {
    const prev: typeof fields = {};
    for (const k of Object.keys(fields) as Array<keyof typeof fields>) {
      (prev as Record<string, unknown>)[k] = host[k];
    }
    UndoHandler.DoAction(
      () => { Object.assign(host, fields); },
      () => { Object.assign(host, prev); }
    );
    this.stateChange$.next();
  }

  /** Removes a host from the hosts list. Clears currentHostId if it matched. */
  removeHost(host: MatrixHost): void {
    const idx = this.state.hosts.indexOf(host);
    if (idx < 0) return;
    const wasActive = this.state.currentHostId === host.id;
    UndoHandler.DoAction(
      () => {
        this.state.hosts.splice(this.state.hosts.indexOf(host), 1);
        if (wasActive) this.state.currentHostId = null;
      },
      () => {
        this.state.hosts.splice(idx, 0, host);
        if (wasActive) this.state.currentHostId = host.id;
      }
    );
    this.stateChange$.next();
  }

  /**
   * Places one mark from `deckerId` on `target` (max 3).
   * If target is inside a host, also increments host.marks and propagates to
   * all active IC in the host (SR5E p.247 host-wide mark propagation).
   * Caller must call UndoHandler.StartActions() first.
   */
  addMark(target: MatrixTarget, deckerId: string): void {
    const prev = target.marks[deckerId] ?? 0;
    if (prev >= 3) return;
    const next = prev + 1;
    const host = target.linkedHostId
      ? (this.state.hosts.find(h => h.id === target.linkedHostId) ?? null)
      : null;
    const prevHostMark = host ? (host.marks[deckerId] ?? 0) : 0;
    const nextHostMark = host ? Math.min(3, prevHostMark + 1) : 0;
    UndoHandler.DoAction(
      () => {
        target.marks[deckerId] = next;
        if (host) {
          host.marks[deckerId] = nextHostMark;
          for (const ic of host.icActive) {
            ic.marksPlaced.set(deckerId, nextHostMark);
          }
        }
      },
      () => {
        if (prev === 0) { delete target.marks[deckerId]; } else { target.marks[deckerId] = prev; }
        if (host) {
          if (prevHostMark === 0) { delete host.marks[deckerId]; } else { host.marks[deckerId] = prevHostMark; }
          for (const ic of host.icActive) {
            ic.marksPlaced.set(deckerId, prevHostMark);
          }
        }
      }
    );
    this.stateChange$.next();
  }

  /**
   * Removes one mark from `deckerId` on `target`.
   * Mirrors the decrement to host.marks and active IC in the host.
   * Caller must call UndoHandler.StartActions() first.
   */
  removeMark(target: MatrixTarget, deckerId: string): void {
    const prev = target.marks[deckerId] ?? 0;
    if (prev <= 0) return;
    const next = prev - 1;
    const host = target.linkedHostId
      ? (this.state.hosts.find(h => h.id === target.linkedHostId) ?? null)
      : null;
    const prevHostMark = host ? (host.marks[deckerId] ?? 0) : 0;
    const nextHostMark = host ? Math.max(0, prevHostMark - 1) : 0;
    UndoHandler.DoAction(
      () => {
        if (next === 0) { delete target.marks[deckerId]; } else { target.marks[deckerId] = next; }
        if (host) {
          if (nextHostMark === 0) { delete host.marks[deckerId]; } else { host.marks[deckerId] = nextHostMark; }
          for (const ic of host.icActive) {
            ic.marksPlaced.set(deckerId, nextHostMark);
          }
        }
      },
      () => {
        target.marks[deckerId] = prev;
        if (host) {
          host.marks[deckerId] = prevHostMark;
          for (const ic of host.icActive) {
            ic.marksPlaced.set(deckerId, prevHostMark);
          }
        }
      }
    );
    this.stateChange$.next();
  }

  private generateId(): string {
    return `h-${Math.random().toString(36).slice(2, 10)}`;
  }

  generateTargetId(): string {
    return `t-${Math.random().toString(36).slice(2, 10)}`;
  }
}
