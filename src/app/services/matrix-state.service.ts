import { Injectable } from "@angular/core";
import { Subject } from "rxjs";
import {
  MatrixRunState,
  MatrixHost,
  MatrixTarget,
  MatrixTargetVisibility,
  MatrixParticipant,
  ICParticipant,
  VRMode
} from "Matrix";
import { OsTrackingService } from "./os-tracking.service";

/** Maximum marks any one icon can hold per decker (p. 236). */
export const MARK_CAP = 3; // 3-mark maximum, brief p. 236

/**
 * One destination `MatrixStateService.addMark()`'s propagation walk reaches,
 * in traversal order — the read-only shape `previewPropagation()` returns for
 * the GM-facing preview (`briefs/mark-propagation-preview-spec.md`, "One
 * shared walk — the choke point"). Not written anywhere; a pure description
 * of what `collectPropagationStops()` found.
 */
export interface PropagationStop {
  kind: "host" | "target";
  id: string;
  name: string;
  /** Marks this destination currently holds for the decker (0 when unknown). */
  currentMarks: number;
  /** Whether placeMark() will actually add one here (currentMarks < 3, p. 236). */
  willLand: boolean;
}

/**
 * MatrixStateService
 *
 * Central holder for the Matrix run state. Phase 1 ships the skeleton:
 * methods have real bodies but only the minimum needed for Phase 1 (jack-in,
 * jack-out, host registration). Phase 2/3 will fill in target/mark/IC logic.
 *
 * Mutations are applied directly - the app has no undo system. The
 * stateChange$ subject lets BattleTrackerComponent trigger a
 * syncSharedState() after any change.
 */
@Injectable({ providedIn: "root" })
export class MatrixStateService {
  readonly state: MatrixRunState = new MatrixRunState();

  /** Fires after any state mutation so subscribers can re-broadcast. */
  readonly stateChange$ = new Subject<void>();

  constructor(private readonly osTracking: OsTrackingService) {}

  jackIn(decker: MatrixParticipant, vrMode: VRMode, intuition: number): void {
    // Setup path, not a mid-turn change: write the dice count without rolling
    // (a real mid-combat mode switch goes through BattleTrackerComponent's
    // dice-count funnel so the gained/lost dice are rolled - brief F5, p. 160).
    decker.applyJackInMode(vrMode, intuition, n => decker.setDicesWithoutRoll(n));
    if (!this.state.deckers.includes(decker)) {
      this.state.deckers.push(decker);
    }
    this.stateChange$.next();
  }

  /**
   * Jacking out reboots the device the decker is using (p. 240), and
   * rebooting "resets your OS to zero and all of your marks, as well as the
   * ones others may have put on your icon, are erased" (p. 242) — no
   * cooldown, no residual OS (`RULINGS.md` 2026-08-29). Both halves are
   * applied here: `osTracking.resetOS()` zeroes Overwatch, and
   * `eraseMarksForDecker()` walks every host and target this decker could
   * hold a mark on **and** every persona icon of theirs that someone else
   * marked (round-5 defect D-2 — see that method's doc comment for the
   * second half). An earlier version of this method only zeroed
   * `decker.overwatch` inline and never called `resetOS()` or touched any
   * mark record at all (round-4 defect D-9).
   *
   * `vrMode` resets to `VRMode.None`, not `VRMode.AR` — matching
   * `MatrixParticipant`'s own "not connected" default
   * (`MatrixParticipant.ts`'s constructor) and the live GM-facing jack-out
   * button (`battle-tracker.component.ts#gmJackOut`), which has always used
   * `None`. An earlier version of this method used `AR` instead, disagreeing
   * with `gmJackOut` even though jacking out is a full disconnect, not a
   * switch into AR (round-5 defect D-3's reconciliation). The two produce
   * identical Initiative math either way — `getParticipantBaseInitiative()`
   * treats `None` and `AR` the same, neither is a VR mode — so this is a
   * data-hygiene fix, not a behaviour change.
   */
  jackOut(decker: MatrixParticipant): void {
    decker.jackedIn = false;
    decker.blocksPhysicalActions = false;
    decker.vrMode = VRMode.None;
    this.osTracking.resetOS(decker);
    this.eraseMarksForDecker(decker.name);
    this.stateChange$.next();
  }

  /**
   * Erases every mark `deckerId` holds, on every host's own mark record and
   * every target's (host-contained or public), per the reboot/jack-out
   * erasure printed on p. 242. Marks are per-persona (p. 236), so this only
   * ever touches one decker's entries — a teammate's marks on the same icon
   * are untouched (`RULINGS.md` 2026-08-29).
   *
   * **Round-5 defect D-2 — the other half of p. 242.** The printed sentence
   * has two clauses: "your OS is reset to zero and all of your marks, **as
   * well as the ones others may have put on your icon**, are erased." The
   * loop above only ever deletes entries keyed by `deckerId` — the marks
   * *this* decker placed on other icons. It does nothing about marks IC or
   * another decker placed *on this decker's own persona icon*, keyed by
   * *their* deckerId on that icon's `marks` record. This second loop finds
   * that icon — a `MatrixTarget` of type `"persona"` whose `personaOwner`
   * names this decker — and clears its entire `marks` record (every key, not
   * just `deckerId`), since every mark on it belongs to someone else by
   * definition (a decker cannot hold a mark on their own persona). An
   * earlier version of this method covered only the first clause.
   */
  private eraseMarksForDecker(deckerId: string): void {
    for (const host of this.state.hosts) {
      delete host.marks[deckerId];
      for (const target of host.targets) {
        delete target.marks[deckerId];
      }
    }
    for (const target of this.state.publicTargets) {
      delete target.marks[deckerId];
    }
    for (const target of this.allTargets()) {
      if (target.type === "persona" && target.personaOwner === deckerId) {
        target.marks = {};
        target.propagatedMarks = {};
      }
    }
  }

  /** Every `MatrixTarget` in the run — every host's contents plus public space. */
  private allTargets(): MatrixTarget[] {
    const result: MatrixTarget[] = [...this.state.publicTargets];
    for (const host of this.state.hosts) result.push(...host.targets);
    return result;
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
      existing.name = name;
      existing.rating = rating;
      // No matrixHealth write: hosts have no Matrix Condition Monitor
      // (p. 229) — see MatrixHost.matrixHealth's doc comment.
      this.stateChange$.next();
      return existing;
    }

    const host = new MatrixHost({ id: this.generateId(), name, rating });
    this.state.hosts.push(host);
    this.state.currentHostId = host.id;
    this.stateChange$.next();
    return host;
  }

  /** Clears the active host (does not delete it from the hosts list). */
  clearActiveHost(): void {
    const prev = this.state.currentHostId;
    if (!prev) return;
    this.state.currentHostId = null; 
    this.stateChange$.next();
  }

  /** Registers an ICParticipant into a host's active IC list. */
  addICToHost(host: MatrixHost, ic: ICParticipant): void {
    host.icActive.push(ic); 
    this.stateChange$.next();
  }

  /** Removes an ICParticipant from its host's active IC list. */
  removeICFromHost(host: MatrixHost, ic: ICParticipant): void {
    const idx = host.icActive.indexOf(ic);
    if (idx < 0) return;
    const i = host.icActive.indexOf(ic);
    if (i >= 0) host.icActive.splice(i, 1);
    this.stateChange$.next();
  }

  /**
   * Adds `count` marks from a decker to the host's canonical marks record.
   *
   * p. 247's shared-marks rule runs the *other* direction from what this
   * method used to do: "if one IC program marks, they all do, and so does
   * the host" describes marks the **defending IC place on the intruder**
   * propagating to the host and its other IC — not the intruder's marks on
   * the host propagating onto each IC's own placed-marks map. An earlier
   * version of this method wrote `ic.marksPlaced.set(deckerId, next)` here,
   * which recorded the decker's marks on the host as if they were marks the
   * IC had placed on that decker — a different and wrong relationship
   * (brief `matrix-port-rules-correctness-spec.md` defect 11). The
   * defender-side propagation (IC's marks on an intruder shared across the
   * host's IC and the host itself) is a separate thing this service does not
   * model.
   */
  addMarkToHost(host: MatrixHost, deckerId: string, count = 1): void {
    const prev = host.marks[deckerId] ?? 0;
    const next = Math.min(MARK_CAP, prev + count);
    if (next === prev) return;
    host.marks[deckerId] = next;
    this.stateChange$.next();
  }

  /**
   * Removes one mark placed directly on the host (GM-applied via host mark UI).
   * See `addMarkToHost()`'s doc comment for why this does not touch any IC's
   * `marksPlaced`.
   *
   * Does not reverse `addMark()`'s propagation onto a *target* the GM
   * clicked separately (`RULINGS.md` 2026-08-29, restored 2026-09-02) — this
   * method only ever touches the host's own `marks` record. When the host's
   * count for this decker reaches 0, its `propagatedMarks` flag clears too,
   * so a stale "propagation happened" badge does not outlive every mark it
   * described (Xavier's decision 9, 2026-09-03).
   */
  removeMarkFromHost(host: MatrixHost, deckerId: string): void {
    const prev = host.marks[deckerId] ?? 0;
    if (prev <= 0) return;
    const next = prev - 1;
    if (next === 0) {
      delete host.marks[deckerId];
      delete host.propagatedMarks[deckerId];
    } else {
      host.marks[deckerId] = next;
    }
    this.stateChange$.next();
  }

  /** Adds a MatrixTarget to a host's target list or to public space (host = null). */
  addTarget(host: MatrixHost | null, target: MatrixTarget): void {
    if (host) {
      host.targets.push(target);
    } else {
      this.state.publicTargets.push(target);
    }
    this.stateChange$.next();
  }

  /** Removes a MatrixTarget from a host or public space. */
  removeTarget(host: MatrixHost | null, target: MatrixTarget): void {
    const list = host ? host.targets : this.state.publicTargets;
    const idx = list.indexOf(target);
    if (idx < 0) return;
    const i = list.indexOf(target);
    if (i >= 0) list.splice(i, 1);
    this.stateChange$.next();
  }

  /** Updates the visibility state on a MatrixTarget. */
  setTargetVisibility(target: MatrixTarget, visibility: MatrixTargetVisibility): void {
    const prev = target.visibility;
    if (prev === visibility) return;
    target.visibility = visibility; 
    this.stateChange$.next();
  }

  /** Applies a partial field update to a MatrixTarget (name, type, rating, etc.). */
  updateTarget(target: MatrixTarget, fields: Partial<MatrixTarget>): void {
    const prev: Partial<MatrixTarget> = {};
    for (const k of Object.keys(fields) as (keyof MatrixTarget)[]) {
      (prev as Record<string, unknown>)[k] = target[k];
    }
    Object.assign(target, fields); 
    this.stateChange$.next();
  }

  /**
   * Updates editable host fields (name, rating, ASDF).
   * Pass only the keys you want to change.
   *
   * `matrixHealth` is deliberately absent from this Pick: hosts have no
   * Matrix Condition Monitor (p. 229), and narrowing the type here is what
   * makes that a compile error for any future caller rather than something
   * only vigilance enforces (AC-14).
   */
  updateHost(
    host: MatrixHost,
    fields: Partial<Pick<MatrixHost, "name" | "rating" | "attack" | "sleaze" | "dataProcessing" | "firewall">>
  ): void {
    const prev: typeof fields = {};
    for (const k of Object.keys(fields) as (keyof typeof fields)[]) {
      (prev as Record<string, unknown>)[k] = host[k];
    }
    Object.assign(host, fields); 
    this.stateChange$.next();
  }

  /** Removes a host from the hosts list. Clears currentHostId if it matched. */
  removeHost(host: MatrixHost): void {
    const idx = this.state.hosts.indexOf(host);
    if (idx < 0) return;
    const wasActive = this.state.currentHostId === host.id;
    this.state.hosts.splice(this.state.hosts.indexOf(host), 1);
    if (wasActive) this.state.currentHostId = null;
    this.stateChange$.next();
  }

  /**
   * Places one mark from `deckerId` on `target` (max 3), then propagates it
   * up the containment hierarchy (Xavier's decision 7, 2026-09-02),
   * **device-only at both ends** (Xavier's decision 8, 2026-09-03 - see
   * `MatrixTarget.parentTargetId`'s doc comment for the full citation):
   *
   *  (a) **Host WAN propagation.** If `target` is a `"device"` and lives in
   *      a host (`target.linkedHostId`), the host also gets a mark - capped
   *      independently of the target's own cap (p. 233; `RULINGS.md`
   *      2026-08-29 "Marks propagated from a slave count toward the
   *      master's three", restored 2026-09-02). "In hosts any device is
   *      part of the WAN and would propagate automatically upwards" (Xavier,
   *      2026-09-02). A host is always a valid destination - it has no
   *      `type` to gate on.
   *
   *      **One-way, p. 233 (`rules/pages/p0235.txt:37-45`).** This only ever
   *      runs slave-to-master, never master-to-slave: marking the host does
   *      not mark every device slaved to it, and this method has no code
   *      path that would even attempt that. The book states the asymmetry
   *      explicitly for the adjacent failure case too, printed right next to
   *      the propagation rule this method implements: "This doesn't work
   *      both ways; if you fail a Sleaze action against a slaved device,
   *      only the device's owner gets the mark on you, not the master too."
   *      This tracker does not model failed-Sleaze marks at all (that is a
   *      defender's mark on the intruder, the opposite direction from
   *      everything this method places) - recorded here only so a future
   *      reader does not assume the master/slave relationship this method
   *      *does* implement is symmetric in some other way it doesn't cover.
   *  (b) **Open-grid parent/child propagation.** If `target` is a
   *      `"device"` on the open grid (`context === "public"`) with a
   *      `parentTargetId`, and that parent is *also* a `"device"`, the
   *      parent gets a mark and the walk continues onward from the parent
   *      ("devices on the open grid have other devices like weapons and
   *      files parented to it", Xavier, 2026-09-02). A parent that is not a
   *      device - a file, persona, IC, or nested host - receives nothing and
   *      the walk stops there: "files and personas do not get propagated to
   *      and do not propagate" (Xavier, 2026-09-03). A visited-set guards
   *      against a cycle a malformed import could produce, rather than
   *      recursing blindly.
   *
   * Each hop's cap is independent - propagating a mark to an ancestor does
   * not consume a slot on the icon that was actually marked, and an
   * already-full ancestor does not stop the walk from continuing further up
   * a longer chain (this is *not* symmetric with the marked icon itself: if
   * the directly-marked `target` is already at 3, `placeMark` below refuses
   * and nothing propagates at all - see that method's doc comment for why
   * the two directions read differently on purpose).
   *
   * Every icon a mark actually lands on this way - the host in (a), or the
   * parent in (b) - has its `propagatedMarks[deckerId]` flag set, so the GM
   * can see on that icon's own row that at least one of its marks arrived by
   * propagation rather than a direct click (Xavier's decision 9, 2026-09-03;
   * `RULINGS.md` 2026-09-03, "Propagation is visible, not reversible").
   *
   * **This is not a Decision 1 violation.** Decision 1 (2026-09-02, "marks
   * are recorded, never derived") forbids deriving a mark count from a dice
   * roll this app never sees. Propagation here derives a mark from a rule
   * Xavier has explicitly ruled on, not from resolving anything - see
   * `RULINGS.md` 2026-09-02, "Marks propagate up the containment hierarchy -
   * this is not a Decision 1 violation".
   */
  addMark(target: MatrixTarget, deckerId: string): void {
    if (!MatrixStateService.placeMark(target.marks, deckerId)) return;
    if (target.type === "device") {
      this.propagateMarkUp(target, deckerId, new Set([target.id]));
    }
    this.stateChange$.next();
  }

  /**
   * Read-only preview of every destination `addMark(target, deckerId)` would
   * reach, in the same order `propagateMarkUp()` visits them —
   * `briefs/mark-propagation-preview-spec.md`'s "single choke point" shared
   * by the write path and the GM-facing preview so they cannot drift apart
   * again the way they did before this method existed. Mutates nothing and
   * never fires `stateChange$` (enforced by delegating to the same pure
   * `collectPropagationStops()` the write path uses, rather than a second,
   * hand-written walk).
   *
   * Returns `[]` for a non-`"device"` target (decision 8 — only devices
   * propagate) instead of walking anything.
   *
   * **Collapses a host visited more than once (review defect 6).**
   * `collectPropagationStops()` has no visited-set for hosts — see that
   * method's doc comment for why it cannot get one — so a hand-constructed
   * chain where two different nodes both carry the same `linkedHostId`
   * produces two stops for the same host. Reported to the GM verbatim, that
   * reads as "Also marks: Host Ares-7, Weapon Mount, Host Ares-7" and, worse,
   * both copies independently compute `willLand` from the host's *current*
   * mark count, so a host with exactly one slot left is reported as able to
   * take both of them. `dedupeHostStops()` below keeps only the first
   * occurrence, so the preview names each host once and `willLand` reflects
   * whether the (single, as far as the GM is told) mark on it will land.
   * This is a preview-only correction: it runs after `collectPropagationStops()`
   * returns, never inside it, so it has no way to change what
   * `propagateMarkUp()` writes (see that method — it consumes the raw,
   * undeduped stops directly).
   */
  previewPropagation(target: MatrixTarget, deckerId: string): PropagationStop[] {
    if (target.type !== "device") return [];
    const stops = this.collectPropagationStops(target, deckerId, new Set([target.id]));
    return MatrixStateService.dedupeHostStops(stops);
  }

  /**
   * Keeps only the first stop for any given host id, preserving order.
   * Preview-only (see `previewPropagation()`'s doc comment) — never applied
   * to the stops `propagateMarkUp()` writes from, so a chain that legitimately
   * marks the same host twice still does so on the write path; only the
   * GM-facing description of it collapses to one line.
   */
  private static dedupeHostStops(stops: PropagationStop[]): PropagationStop[] {
    const seenHosts = new Set<string>();
    const result: PropagationStop[] = [];
    for (const stop of stops) {
      if (stop.kind === "host") {
        if (seenHosts.has(stop.id)) continue;
        seenHosts.add(stop.id);
      }
      result.push(stop);
    }
    return result;
  }

  /**
   * Pure enumeration of the propagation walk `addMark()` performs, shared by
   * the live write path (`propagateMarkUp()`) and the read-only
   * `previewPropagation()` so the two cannot describe different reaches of
   * the same action (`briefs/mark-propagation-preview-spec.md`).
   *
   * Traversal order and rules are identical to the walk this replaced:
   *
   *  (a) **Host WAN propagation.** Single hop only: a host is not itself a
   *      MatrixTarget in this data model, so there is no further
   *      containment level above a host to walk here (p. 233's WAN rule is
   *      host-and-slave only; it does not chain past the host). No type gate
   *      on the destination - a host is always eligible, it has no `type`
   *      field. **Emitting a host stop does not end the walk** - execution
   *      always falls through to (b) for the same node (spec "Reachability
   *      finding", scenario S5). **No visited-set for hosts** - unlike the
   *      parent-chain guard in (b), nothing here stops the same host being
   *      emitted twice if two different nodes in one chain both carry the
   *      same `linkedHostId` (a hand-constructed edge case, not reachable
   *      through the UI today). That is deliberate: `propagateMarkUp()`
   *      below consumes these stops one-for-one to decide how many times to
   *      write, and a host reached twice really does receive two marks
   *      today (review defect 6) - adding a visited-set here would silently
   *      change that write behaviour. `previewPropagation()`'s
   *      `dedupeHostStops()` collapses the *reported* duplicate without
   *      touching this method or its output.
   *  (b) **Open-grid parent/child propagation**, scoped to public-space
   *      targets per Xavier's decision 7b, and to a device parent per
   *      decision 8 - a file/persona/IC/nested-host parent receives nothing
   *      and the chain stops there rather than skipping past it to whatever
   *      it is parented to. A visited-set guards against a cycle a malformed
   *      import could produce.
   *
   * A destination already at the 3-mark cap is still emitted, with
   * `willLand: false` - a capped ancestor does not stop the walk from
   * continuing further up a longer chain (`placeMark()`'s doc comment,
   * scenario S2). `currentMarks`/`willLand` are computed once here, before
   * any write happens. **This is not always order-independent**: it holds
   * only when every stop's `marks` record is a distinct object, which is
   * true for (b) (the visited-set forbids revisiting the same target) but
   * is NOT guaranteed for (a) - two stops that both resolve to the same host
   * share one `marks` record, and (as above) a duplicate host stop is a
   * real, intentional write-path behaviour, not a bug to guard against here.
   */
  private collectPropagationStops(
    target: MatrixTarget,
    deckerId: string,
    visited: Set<string>
  ): PropagationStop[] {
    const stops: PropagationStop[] = [];

    // (a) Host WAN propagation.
    if (target.linkedHostId) {
      const host = this.state.hosts.find(h => h.id === target.linkedHostId);
      if (host) {
        const currentMarks = host.marks[deckerId] ?? 0;
        stops.push({
          kind: "host",
          id: host.id,
          name: host.name,
          currentMarks,
          willLand: currentMarks < MARK_CAP
        });
      }
    }

    // (b) Open-grid parent/child propagation. No early return after (a) -
    // the walk continues into the parent chain regardless of whether a host
    // stop was just emitted.
    if (target.context === "public" && target.parentTargetId && !visited.has(target.parentTargetId)) {
      const parent = this.state.publicTargets.find(t => t.id === target.parentTargetId);
      if (parent && parent.type === "device") {
        visited.add(parent.id);
        const currentMarks = parent.marks[deckerId] ?? 0;
        stops.push({
          kind: "target",
          id: parent.id,
          name: parent.name,
          currentMarks,
          willLand: currentMarks < MARK_CAP
        });
        stops.push(...this.collectPropagationStops(parent, deckerId, visited));
      }
    }

    return stops;
  }

  /**
   * Writes the marks `collectPropagationStops()` describes. Rewritten onto
   * the shared enumerator (`briefs/mark-propagation-preview-spec.md`) - its
   * observable behaviour (which marks land, which `propagatedMarks` flags get
   * set, one `stateChange$` per `addMark()` call) is unchanged from before
   * this refactor.
   */
  private propagateMarkUp(target: MatrixTarget, deckerId: string, visited: Set<string>): void {
    for (const stop of this.collectPropagationStops(target, deckerId, visited)) {
      const record =
        stop.kind === "host"
          ? this.state.hosts.find(h => h.id === stop.id)
          : this.state.publicTargets.find(t => t.id === stop.id);
      if (!record) continue;
      if (MatrixStateService.placeMark(record.marks, deckerId)) {
        record.propagatedMarks[deckerId] = true;
      }
    }
  }

  /**
   * Adds one mark for `deckerId` to `record`, capped at 3 (p. 236). Returns
   * whether it actually changed anything.
   *
   * **Undocumented-asymmetry note, round-5.** `addMark()` refuses outright
   * (via this method's own `prev >= 3` guard) when the icon the GM actually
   * clicked is already capped - no mark is placed and nothing propagates.
   * But an already-capped *ancestor* reached during `propagateMarkUp()`
   * does not stop the walk from continuing further up a longer chain (see
   * that method): the two directions are deliberately not symmetric. The
   * directly-clicked icon's cap is a hard stop because that click is the one
   * and only source of the whole action - refusing it means refusing
   * everything downstream of it. An ancestor's cap is not a hard stop
   * because propagation is a side effect the ancestor did not ask for and
   * has no control over; an ancestor already holding three marks from other
   * sources has no bearing on whether *further* ancestors up the chain
   * should also learn about this one. Tested at
   * `matrix-port-rules-correctness.spec.ts`, "7b: propagation continues past
   * an ancestor already at its own 3-mark cap".
   */
  private static placeMark(record: Record<string, number>, deckerId: string): boolean {
    const prev = record[deckerId] ?? 0;
    if (prev >= MARK_CAP) return false;
    record[deckerId] = prev + 1;
    return true;
  }

  /**
   * Removes one mark from `deckerId` on `target`.
   * Only updates target.marks - host marks are tracked independently via
   * removeMarkFromHost().
   *
   * Deliberately does **not** reverse `addMark()`'s propagation (Xavier's
   * decision 9, 2026-09-03, "No the mark should not be removed upstream"):
   * nothing in `RULINGS.md` 2026-08-29 ("Marks propagated from a slave count
   * toward the master's three") specifies a rule for un-propagating a
   * manually-removed mark, and a propagated mark on an ancestor may already
   * have other sources by the time this fires. Removing a propagated mark,
   * if wanted, is a manual GM correction on the ancestor icon itself - see
   * `RULINGS.md` 2026-09-03, "Propagation is visible, not reversible".
   *
   * When this target's count for the decker reaches 0, its own
   * `propagatedMarks` flag clears too (it can only be about marks that no
   * longer exist), independent of whatever propagation this target itself
   * may have already sent further up the chain - that upstream mark is
   * exactly what this method does not touch.
   */
  removeMark(target: MatrixTarget, deckerId: string): void {
    const prev = target.marks[deckerId] ?? 0;
    if (prev <= 0) return;
    const next = prev - 1;
    if (next === 0) {
      delete target.marks[deckerId];
      delete target.propagatedMarks[deckerId];
    } else {
      target.marks[deckerId] = next;
    }
    this.stateChange$.next();
  }

  /** Sets the access method on a host (hack-on-fly, brute-force, direct-connection, or none). */
  setHostAccessMethod(host: MatrixHost, method: import("Matrix").HostAccessMethod): void {
    const prev = host.accessMethod;
    if (prev === method) return;
    host.accessMethod = method;
    this.stateChange$.next();
  }

  /**
   * Sets the scene's current Matrix noise level — a GM-set reminder the app
   * displays but never subtracts from any dice pool (Scope Question B,
   * `briefs/matrix-port-rules-correctness-spec.md`, approved 2026-09-01;
   * `SCOPE.md` "Displaying the current Matrix noise level"). Floored at 0 —
   * noise is a penalty magnitude, never negative (p. 231).
   */
  setNoise(value: number): void {
    const next = Math.max(0, Math.floor(value || 0));
    if (this.state.noise === next) return;
    this.state.noise = next;
    this.stateChange$.next();
  }

  private generateId(): string {
    return `h-${Math.random().toString(36).slice(2, 10)}`;
  }

  generateTargetId(): string {
    return `t-${Math.random().toString(36).slice(2, 10)}`;
  }
}
