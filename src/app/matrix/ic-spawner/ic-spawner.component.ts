import { Component, EventEmitter, Input, OnInit, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import {
  ICType, ICParticipant, MatrixHost, IC_INITIATIVE_DICE, matrixConditionMonitor, DATA_PROCESSING_UNSET
} from "Matrix";

@Component({
  standalone: true,
  selector: "app-ic-spawner",
  templateUrl: "./ic-spawner.component.html",
  styleUrls: ["./ic-spawner.component.css"],
  imports: [CommonModule, FormsModule]
})
export class ICSpawnerComponent implements OnInit {
  @Input({ required: true }) host!: MatrixHost;

  /**
   * The current Combat Turn, per `CombatManager.combatTurn`
   * (`src/Combat/CombatManager.ts`) — passed in the same way `host` already
   * is, rather than this component reaching into the `CombatManager`
   * singleton itself (Xavier's decision 5, 2026-09-02). `null` means "not
   * supplied" — this component has **no consumer anywhere in the app** as of
   * round-4 (verified: `spawn`/`cancel` are never subscribed to), so nothing
   * currently passes a value here. The future parent that wires this
   * component in must bind `[combatTurn]="combatManager.combatTurn"`
   * alongside `[combatStarted]="combatManager.started"` and
   * `[combatGeneration]="combatManager.combatGeneration"` below.
   */
  @Input() combatTurn: number | null = null;

  /**
   * The current combat's session identity, per `CombatManager.combatGeneration`
   * (round-5 defect D-6). `combatTurn` alone resets to 1 every time a combat
   * ends, so a bare turn-number comparison cannot tell "turn 1 of this
   * combat" from "turn 1 of a later combat" — an IC left in `host.icActive`
   * from a previous, already-ended encounter would otherwise trip a false
   * "already launched this turn" warning the instant a brand-new combat
   * reaches its own turn 1. `null` means "not supplied", same as
   * `combatTurn`.
   */
  @Input() combatGeneration: number | null = null;

  /**
   * Whether combat has actually started, per `CombatManager.started`. Before
   * combat starts there is no meaningful Combat Turn number to detect a
   * one-IC-per-turn violation against (`CombatManager` still reports
   * `combatTurn === 1` before `startRound()` is ever called) — see
   * `turnKnown` below.
   */
  @Input() combatStarted = false;

  /** Emits the chosen ICType when the GM confirms spawn. */
  @Output() readonly spawn = new EventEmitter<ICType>();

  /** Emits when the GM cancels. */
  @Output() readonly cancel = new EventEmitter<void>();

  selectedType: ICType = ICType.Patrol;

  readonly icTypes: ICType[] = [
    ICType.Patrol,
    ICType.Killer,
    ICType.Acid,
    ICType.Blaster,
    ICType.Sparky,
    ICType.Scramble,
    ICType.TarBaby
  ];

  ngOnInit(): void {
    // Pre-select the first non-running IC type.
    const available = this.icTypes.find(t => !this.isTypeRunning(t));
    if (available) this.selectedType = available;
  }

  /**
   * IC's Initiative Attribute: host Data Processing + host Rating (Table
   * Ruling 1, RULINGS.md 2026-08-28, restored 2026-09-01). `Host Rating x 2`
   * — the earlier value here — is the IC **attack** dice pool printed
   * elsewhere on p. 247, not an initiative figure; see `ICParticipant`'s doc
   * comment.
   */
  get hostDataProcessingSet(): boolean {
    return (this.host?.dataProcessing ?? DATA_PROCESSING_UNSET) > DATA_PROCESSING_UNSET;
  }

  /**
   * `null` when the host's Data Processing hasn't been entered yet — a
   * missing half of the formula is not the same as a real 0, and showing a
   * number anyway (e.g. treating it as 0) would print a plausible-looking
   * initiative that is missing half its inputs (`RULINGS.md` 2026-08-30, "a
   * plausible invented number is worse than a blank"; brief defect 5).
   */
  get initiativeBase(): number | null {
    if (!this.hostDataProcessingSet) return null;
    return this.host.dataProcessing + (this.host?.rating ?? 1);
  }

  /** Every IC type gets 4 Initiative Dice, no exceptions (p. 247). */
  get initiativeDice(): number {
    return IC_INITIATIVE_DICE;
  }

  get initiativeMin(): number | null {
    return this.initiativeBase === null ? null : this.initiativeBase + this.initiativeDice;
  }

  get initiativeMax(): number | null {
    return this.initiativeBase === null ? null : this.initiativeBase + this.initiativeDice * 6;
  }

  /** Table Ruling 2 (RULINGS.md 2026-08-29, restored 2026-09-01). */
  get matrixCM(): number {
    return matrixConditionMonitor(this.host?.rating ?? 1);
  }

  /**
   * A bricked IC (Matrix monitor full) "crashes and vanishes" from the host
   * (p. 247, `rules/pages/p0249.txt:49-51`) — this tracker does not
   * auto-delete it from `host.icActive` (the GM may still want to see it),
   * but it must stop counting against the host's IC limits: `atCap`,
   * `activeCount` and `isDuplicateType` below all ignore a bricked IC
   * (round-4 "missed interaction 3" — an earlier version counted crashed IC
   * against capacity, so the GM could be told the host was full when it
   * wasn't).
   *
   * **Deliberate asymmetry with `sameTurnIC`, documented so it doesn't read
   * as a bug (round-5):** `sameTurnIC` below does the *opposite* — it still
   * counts a bricked IC as this turn's launch. Both are correct readings of
   * p. 247: "how many IC are currently running" (`atCap`/`activeCount`/
   * `isDuplicateType`) is naturally about what's alive right now, while "was
   * this host's one Combat-Turn launch already spent" (`sameTurnIC`) is about
   * an event that already happened — the host paid for the launch the moment
   * it fired, whether or not that IC has since been destroyed.
   */
  private isBricked(ic: ICParticipant): boolean {
    return ic.physicalDamage >= ic.physicalHealth;
  }

  private get nonBrickedIC(): ICParticipant[] {
    return (this.host?.icActive ?? []).filter(ic => !this.isBricked(ic));
  }

  get atCap(): boolean {
    return this.nonBrickedIC.length >= (this.host?.rating ?? 1);
  }

  get activeCount(): number {
    return this.nonBrickedIC.length;
  }

  isTypeRunning(type: ICType): boolean {
    return this.nonBrickedIC.some(ic => ic.icType === type);
  }

  get isDuplicateType(): boolean {
    return this.isTypeRunning(this.selectedType);
  }

  /** Whether the current Combat Turn is knowable at all — see `combatTurn`'s doc comment. */
  get turnKnown(): boolean {
    return this.combatStarted && this.combatTurn !== null && this.combatGeneration !== null;
  }

  /**
   * The IC, if any, already launched in this host on the current Combat
   * Turn — the detected form of the one-IC-per-Combat-Turn rule (p. 247;
   * Xavier's decision 5, 2026-09-02: "I think that IC warning is actually a
   * good example of something the app should enforce as a rule"). `null`
   * whenever the turn isn't knowable (`!turnKnown`) — there is nothing to
   * detect against combat that hasn't started.
   *
   * Compares **both** `spawnedOnCombatTurn` and `spawnedInCombatGeneration`
   * (round-5 defect D-6) — turn number alone is not enough, because
   * `CombatManager.combatTurn` resets to 1 every time a combat ends, and a
   * host's `icActive` list is not cleared when that happens. Without the
   * generation check, an IC launched on turn 1 of a combat that has since
   * ended would falsely read as "already launched this turn" the moment a
   * brand-new combat reaches its own turn 1.
   *
   * Deliberately still checks a **bricked** IC too (`icActive`, not
   * `nonBrickedIC`) — this is intentional, not the same oversight
   * `atCap`/`isDuplicateType` guard against below. The one-IC-per-Combat-Turn
   * rule is about the *launch*, which already happened and cost the host its
   * turn, regardless of whether that IC has since been destroyed (p. 247
   * charges the launch, not the IC's survival) — see `isBricked()`'s doc
   * comment for the mirror-image case (bricked IC excluded from cap/duplicate
   * checks, because those are about what's *currently running*).
   */
  get sameTurnIC(): ICParticipant | null {
    if (!this.turnKnown) return null;
    return this.host?.icActive?.find(
      ic => ic.spawnedOnCombatTurn === this.combatTurn && ic.spawnedInCombatGeneration === this.combatGeneration
    ) ?? null;
  }

  /**
   * `atCap`, `isDuplicateType` and `sameTurnIC` are all computed and shown
   * via `validationMessage`, but none of them block the Spawn button — there
   * is no `canSpawn` gate any more. An earlier version of this component had
   * a `canSpawn` getter that always returned `true`; removed as dead code
   * once the template's `[disabled]` binding on it was already dropped
   * (round-3 defect T4).
   *
   * SR5E p. 247 caps a host at one IC per Combat Turn, up to its Rating in IC
   * at once, and no two of the same type — real rules, tracked below — but
   * `SCOPE.md`'s "Enforcing legality" is warn-rather-than-refuse by default,
   * and Xavier's 2026-09-01 decision applies that here specifically: the GM
   * can always override and spawn anyway.
   *
   * The one-IC-per-Combat-Turn rule (p. 247) is now a **detected** warning,
   * not an unconditional standing reminder (Xavier's decision 5, 2026-09-02,
   * superseding round-3's unconditional line): `ICParticipant
   * .spawnedOnCombatTurn` plus the `combatTurn`/`combatStarted` inputs let
   * this component name the specific IC already launched this turn, if any.
   * When the turn isn't knowable at all (`!turnKnown` — combat hasn't
   * started, or nothing passed a turn number), this warning is silent rather
   * than fabricated; the grey standing note in the template below the
   * warning box covers that case instead.
   */
  get validationMessage(): string {
    const warnings: string[] = [];
    const dup = this.sameTurnIC;
    if (dup) {
      warnings.push(
        `${dup.icType} IC already launched this host on Combat Turn ${this.combatTurn} (p. 247 allows only one IC launch per Combat Turn) — spawning anyway is a GM override.`
      );
    }
    if (this.atCap) {
      warnings.push(
        `Host is already running its Rating in IC (${this.activeCount}/${this.host.rating}, p. 247) — spawning anyway is a GM override.`
      );
    }
    if (this.isDuplicateType) {
      warnings.push(
        `${this.selectedType} IC is already running in this host (p. 247 allows only one of each type) — spawning anyway is a GM override.`
      );
    }
    if (!this.hostDataProcessingSet) {
      warnings.push(
        "Host Data Processing is not set — this IC's Initiative Score cannot be computed (host Data Processing + Host Rating, p. 247) and will spawn unset until the GM edits it (brief round-4 defect D-5)."
      );
    }
    return warnings.join(" ");
  }

  onSpawn(): void {
    this.spawn.emit(this.selectedType);
  }

  onCancel(): void {
    this.cancel.emit();
  }
}
