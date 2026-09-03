import { MatrixParticipant, DATA_PROCESSING_UNSET } from "./MatrixParticipant";
import { ICType } from "./ICType";
import { IParticipant } from "Combat/Participants/IParticipant";
import { matrixConditionMonitor } from "./matrixConditionMonitor";

/**
 * IC Initiative Dice. Every IC type — including Patrol — is "treated as if
 * it is in hot-sim", giving it a flat 4D6 Initiative Dice with no exception
 * stated for any type (p. 247).
 *
 * An earlier version of this file gave Patrol IC only 2 dice and cited
 * "Table 4 / Table 24", a table that does not exist anywhere in the printed
 * rulebook (briefs/matrix-port-rules-correctness-spec.md). Patrol's absent
 * *attack* ("Attack: n/a", p. 248) is not the same fact as its Initiative
 * Dice and must not be conflated with it.
 */
export const IC_INITIATIVE_DICE = 4; // p. 247

/**
 * ICParticipant
 *
 * Intrusion Countermeasure (IC) participant. Bridges a Matrix target and an
 * initiative-tracker entry.
 *
 * `baseIni` (IC's Initiative Attribute) is **Host Data Processing + Host
 * Rating** — a house rule (Table Ruling 1, RULINGS.md 2026-08-28 "IC
 * Initiative Attribute = Host Data Processing + Host Rating", restored
 * 2026-09-01) filling a gap the book leaves open: p. 247 gives IC "its own
 * Initiative Score" and 4D6 Initiative Dice but never names an Initiative
 * Attribute for the hot-sim formula (Data Processing + Intuition, p. 230) to
 * add those dice to, and IC has no Intuition. `Host Rating x 2` — an earlier
 * version of this file — is rejected: that number is the IC **attack** dice
 * pool printed elsewhere on p. 247, an unrelated quantity almost
 * certainly copied by mistake. `baseIni` is inherited from `Participant` as
 * an ordinary settable field, so this house-rule base is editable per IC at
 * the table, same as any other participant's.
 *
 * Matrix Condition Monitor is `8 + ceil(Host Rating / 2)` (Table Ruling 2,
 * RULINGS.md 2026-08-29 "IC Matrix Condition Monitor is 8 + (Host Rating /
 * 2)", restored 2026-09-01), written onto the inherited `physicalHealth`
 * field — IC has no separate "Matrix" health track of its own in this
 * tracker's participant model, so it reuses the meat-side one, matching how
 * `hierarchy-editor.component.html` already renders an active IC
 * (`ic.physicalDamage` / `ic.physicalHealth`). `hostRating` and
 * `hostDataProcessing` stay live, editable fields after construction (a GM
 * correcting a host's Rating post-spawn), and their setters recompute both
 * `baseIni` and `physicalHealth` so neither goes stale (brief round-4 defect
 * D-4) — see `recomputeFromHost()` below, shared with the constructor so
 * there is exactly one place that formula lives.
 */
export class ICParticipant extends MatrixParticipant {

  private _icType: ICType;
  get icType(): ICType { return this._icType; }
  set icType(val: ICType) { this._icType = val; }

  private _hostRating: number;
  get hostRating(): number { return this._hostRating; }
  set hostRating(val: number) {
    this._hostRating = val;
    this.recomputeFromHost();
  }

  /**
   * Host Data Processing at spawn time — the other half of Table Ruling 1's
   * `baseIni` formula. Kept as its own field (rather than only folded into
   * `baseIni`) so (1) `hostRating`/`hostDataProcessing`'s setters can
   * recompute `baseIni`/`physicalHealth` after spawn when a GM corrects the
   * host (D-4 — see `recomputeFromHost()`), and (2) a future caller can see
   * which host Data Processing was actually used to derive the current
   * `baseIni`. Note this is *not* what makes `clone()` correct: `clone()`
   * copies the already-realized `baseIni`/`physicalHealth` values straight
   * from the source object (via the `PARTICIPANT_BASE_BACKING_FIELDS` copy
   * in `MatrixParticipant.clone()`), so a manually-edited `baseIni` survives
   * a clone even if it no longer matches `hostDataProcessing + hostRating` —
   * an earlier version of this docstring claimed the field let "a clone
   * recompute/verify the same base", which `clone()` never did (round-4
   * defect D-4).
   */
  private _hostDataProcessing: number;
  get hostDataProcessing(): number { return this._hostDataProcessing; }
  set hostDataProcessing(val: number) {
    this._hostDataProcessing = val;
    this.recomputeFromHost();
  }

  private _linkedTargetId: string;
  get linkedTargetId(): string { return this._linkedTargetId; }
  set linkedTargetId(val: string) { this._linkedTargetId = val; }

  /**
   * The Combat Turn this IC was spawned on, per `CombatManager.combatTurn`
   * (`src/Combat/CombatManager.ts`) — used to detect the one-IC-per-Combat-
   * Turn rule (p. 247) instead of only reminding about it (Xavier's decision
   * 5, 2026-09-02). Nothing in this class reads the `CombatManager` singleton
   * itself (`ICParticipant` has no knowledge of combat state beyond what it's
   * told) — whatever constructs an IC is responsible for passing the actual
   * current Combat Turn. Today that is nobody: `ICSpawnerComponent` has no
   * consumer anywhere in the app (brief round-4), so this defaults to `1`,
   * matching `CombatManager`'s own default (`_combatTurn = 1`,
   * `CombatManager.ts:34`) for a spawn happening at or before Combat Turn 1.
   * The future parent component that wires the spawner in must pass
   * `CombatManager.combatTurn` explicitly once combat has progressed past
   * turn 1 — this field will silently under-report otherwise.
   */
  private _spawnedOnCombatTurn: number;
  get spawnedOnCombatTurn(): number { return this._spawnedOnCombatTurn; }
  set spawnedOnCombatTurn(val: number) { this._spawnedOnCombatTurn = val; }

  /**
   * The Combat Turn's own "session" identity, distinguishing "Combat Turn 1
   * of this encounter" from "Combat Turn 1 of a later encounter that also
   * started at turn 1" (round-5 defect D-6). `CombatManager.combatTurn`
   * resets to 1 on `endCombat()`, so an IC left in `host.icActive` from a
   * previous, already-ended combat would otherwise produce a false
   * "already launched this turn" warning the moment a brand-new combat
   * reaches its own turn 1 — see `ICSpawnerComponent.sameTurnIC` and
   * `CombatManager.combatGeneration`'s doc comment. Defaults to `0`,
   * matching `CombatManager`'s own default generation before any combat has
   * ever ended.
   */
  private _spawnedInCombatGeneration: number;
  get spawnedInCombatGeneration(): number { return this._spawnedInCombatGeneration; }
  set spawnedInCombatGeneration(val: number) { this._spawnedInCombatGeneration = val; }

  /**
   * Whether a GM has set `baseIni` directly (through the ordinary inherited
   * setter, not `recomputeFromHost()`), after which `hostRating`/
   * `hostDataProcessing` edits stop overwriting it (round-5 defect D-8 — see
   * `recomputeFromHost()`).
   */
  private _baseIniOverridden: boolean;

  /** Same tracking, for `physicalHealth` (round-5 defect D-8). */
  private _physicalHealthOverridden: boolean;

  constructor(
    icType: ICType = ICType.Patrol,
    hostRating = 1,
    hostDataProcessing = DATA_PROCESSING_UNSET,
    linkedTargetId = "",
    spawnedOnCombatTurn = 1, // see spawnedOnCombatTurn's doc comment
    spawnedInCombatGeneration = 0 // see spawnedInCombatGeneration's doc comment
  ) {
    super();
    this._icType = icType;
    this._hostRating = hostRating;
    this._hostDataProcessing = hostDataProcessing;
    this._linkedTargetId = linkedTargetId;
    this._spawnedOnCombatTurn = spawnedOnCombatTurn;
    this._spawnedInCombatGeneration = spawnedInCombatGeneration;
    this._baseIniOverridden = false;
    this._physicalHealthOverridden = false;

    this.recomputeFromHost();
    // One-time construction: nothing has been rolled yet, so no dice change is
    // owed - but the write still goes through the capped no-roll setter so the
    // 5D6 hard cap is enforced universally (p. 247 for the flat 4D6; pp. 52,
    // 288 for the cap).
    this.setDicesWithoutRoll(IC_INITIATIVE_DICE);
  }

  /**
   * Overrides the inherited `baseIni` accessor purely to detect a GM's
   * direct edit (round-5 defect D-8) — reads/writes are otherwise identical
   * to `Participant.baseIni`. `recomputeFromHost()` bypasses this override
   * via `super.baseIni = ...`, so its own writes never mark the value as
   * hand-edited.
   */
  override get baseIni(): number { return super.baseIni; }
  override set baseIni(val: number) {
    super.baseIni = val;
    this._baseIniOverridden = true;
  }

  /** Same tracking as `baseIni` above, for `physicalHealth` (round-5 defect D-8). */
  override get physicalHealth(): number { return super.physicalHealth; }
  override set physicalHealth(val: number) {
    super.physicalHealth = val;
    this._physicalHealthOverridden = true;
  }

  /**
   * The one formula both the constructor and the `hostRating`/
   * `hostDataProcessing` setters use, so `baseIni` and `physicalHealth`
   * never drift out of sync with the host values they were derived from
   * (round-4 defect D-4).
   *
   * Table Ruling 1 (RULINGS.md 2026-08-28, restored 2026-09-01) for
   * `baseIni`; Table Ruling 2 (RULINGS.md 2026-08-29, restored 2026-09-01)
   * for `physicalHealth`.
   *
   * Host Data Processing unset (`DATA_PROCESSING_UNSET`) derives NO
   * `baseIni`, rather than fabricating `0 + hostRating`. This mirrors
   * `MatrixParticipant.applyJackInMode()`'s handling of a decker's own
   * unset Data Processing, and the same principle behind `RULINGS.md`
   * 2026-08-30 ("a plausible invented number is worse than a blank"). An
   * earlier version of this class defaulted `hostDataProcessing` to a bare
   * `0` and always wrote `hostDataProcessing + hostRating`, so an IC spawned
   * without a real host Data Processing silently got `baseIni = hostRating`
   * — exactly the invented number `ic-spawner.component.ts`'s own preview
   * (`initiativeBase`) already refuses to show (brief round-3 defect D4).
   */
  private recomputeFromHost(): void {
    // Round-5 defect D-8: a GM correcting a host's Rating/Data Processing
    // post-spawn must not silently discard a `baseIni`/`physicalHealth` the
    // GM already hand-typed for this specific IC (e.g. a boss IC's own
    // Initiative). Each field only recomputes while it has never been
    // directly set through its own accessor - `super.baseIni =`/
    // `super.physicalHealth =` write through the base class's setter
    // directly, bypassing this class's own override so a recompute never
    // marks itself as a hand edit.
    if (!this._baseIniOverridden) {
      super.baseIni = this._hostDataProcessing > DATA_PROCESSING_UNSET
        ? this._hostDataProcessing + this._hostRating
        : DATA_PROCESSING_UNSET;
    }
    if (!this._physicalHealthOverridden) {
      super.physicalHealth = matrixConditionMonitor(this._hostRating);
    }
  }

  /**
   * Matrix damage carries no dice-pool or Initiative penalty at any level
   * below a completely filled Matrix Condition Monitor (p. 228; `RULINGS.md`
   * restored 2026-09-02, "Matrix damage applies no penalty until the
   * monitor is full"). IC's Matrix Condition Monitor is the reused
   * `physicalHealth` slot (see this class's docstring), so without this
   * override the base `Participant.wm` getter would derive a wound modifier
   * from `physicalDamage` / `physicalHealth` exactly as it does for a meat
   * body — giving an IC a −1 Initiative penalty partway down its Matrix
   * Condition Monitor that the rules do not have (brief round-3 defect D5).
   */
  override get wm(): number {
    return 0;
  }

  /**
   * IC has a Matrix Condition Monitor only — the inherited 10-box Stun
   * track is dropped; it has no printed backing for IC (Xavier's decision
   * 4, 2026-09-02). `Participant.ooc` also tests `stunDamage >=
   * stunHealth`, so simply zeroing `stunHealth` would make every freshly
   * constructed IC (`stunDamage` 0, `stunHealth` 0) instantly
   * out-of-combat. Depend only on the Matrix monitor
   * (`physicalDamage`/`physicalHealth`) plus the manual "bench this
   * participant" flag every participant type shares (`Participant
   * .manualOoc`, already `public` — no new accessor needed).
   */
  override get ooc(): boolean {
    if (this.manualOoc) return true;
    return this.physicalDamage >= this.physicalHealth;
  }

  override set ooc(val: boolean) {
    super.ooc = val;
  }

  /**
   * Matrix damage has no overflow phase — an IC's Matrix Condition Monitor
   * filling crashes it outright (p. 247), unlike a meat Physical Condition
   * Monitor's overflow track. The inherited `overflowHealth` (a meat-only
   * concept, default 4, `Participant.ts`) is pinned to 0 here so a future
   * caller reading it for an IC gets an explicit "not applicable" signal
   * instead of the generic meat-body default (missed interaction 4, brief
   * round-4; same treatment and reasoning as this class's `wm`/`ooc`
   * overrides for the dropped Stun track — RULINGS.md 2026-09-02, "IC has a
   * Matrix Condition Monitor only; the inherited Stun track is dropped",
   * addended for this field). The setter is still overridden (rather than
   * left inherited) because TypeScript/JS accessor pairs are replaced as a
   * unit — overriding only the getter would make the property silently
   * read-only.
   */
  override get overflowHealth(): number {
    return 0;
  }

  override set overflowHealth(val: number) {
    super.overflowHealth = val;
  }

  override clone(): IParticipant {
    const baseClone = super.clone() as MatrixParticipant;
    const clone = new ICParticipant(
      this._icType, this._hostRating, this._hostDataProcessing, this._linkedTargetId,
      this._spawnedOnCombatTurn, this._spawnedInCombatGeneration
    );

    // Copy state copied by the parent clone() (we re-use the base/matrix copy
    // by syncing the underscore fields). Easiest: copy the underscore fields
    // off baseClone onto our new ICParticipant.
    const src = baseClone as unknown as Record<string, unknown>;
    const dst = clone as unknown as Record<string, unknown>;
    for (const key of Object.keys(src)) {
      // Don't overwrite IC-specific underscore fields with undefined values
      if (key === "_icType" || key === "_hostRating" || key === "_hostDataProcessing"
        || key === "_linkedTargetId" || key === "_spawnedOnCombatTurn"
        || key === "_spawnedInCombatGeneration") {
        continue;
      }
      dst[key] = src[key];
    }
    // Round-5 defect D-8: `_baseIniOverridden`/`_physicalHealthOverridden`
    // are ICParticipant-only fields that don't exist on `baseClone` (a plain
    // `MatrixParticipant`), so the loop above never touches them - copied
    // directly here so a clone of a hand-edited IC does not silently revert
    // to auto-recomputing the moment its own `hostRating` is corrected.
    clone._baseIniOverridden = this._baseIniOverridden;
    clone._physicalHealthOverridden = this._physicalHealthOverridden;
    return clone;
  }
}
