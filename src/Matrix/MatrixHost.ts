import { MatrixTarget } from "./MatrixTarget";
import { ICParticipant } from "./ICParticipant";

export type HostAccessMethod = "none" | "hack-on-fly" | "brute-force" | "direct-connection";

/**
 * MatrixHost
 *
 * A target host (server / corporate node) the GM created or selected. Holds
 * its own A/S/D/F + Matrix CM, the contained MatrixTargets, and currently
 * active IC. There is no undo system in this app (removed commit 426827b,
 * `SCOPE.md` "Undo / redo") — mutate through `MatrixStateService`, whose
 * methods write directly and fire `stateChange$`.
 */
export class MatrixHost {
  id: string;
  name: string;

  attack: number;
  sleaze: number;
  dataProcessing: number;
  firewall: number;

  /** Host Rating (1–12) */
  rating: number;

  matrixDamage: number;
  /**
   * Legacy field only. Hosts cannot be attacked with Matrix damage and have
   * no Matrix Condition Monitor (p. 229) — nothing in this pass computes,
   * writes or renders a value here for a new or edited host. The field stays
   * declared, and any value already stored in an existing session is left
   * untouched (Table Ruling 5, AC-19); it is simply never read again.
   */
  matrixHealth: number;

  /** Contents of the host. */
  targets: MatrixTarget[];

  accessMethod: HostAccessMethod;

  /** IDs of deckers currently inside the host. */
  deckerInside: string[];

  /** IC participants spawned and currently active in this host. */
  icActive: ICParticipant[];

  /**
   * The marks an intruding decker holds **on this host icon itself** —
   * marks[deckerId] = count, capped at 3 (p. 236). This is the intruder's
   * marks on the host, not the reverse: SR5's p. 247 shared-marks passage
   * ("the IC in a host and the host itself share marks, so if one IC program
   * marks, they all do, and so does the host itself") describes the
   * *defenders'* marks on an intruder being shared between a host and its
   * IC — the opposite direction from this field, and not modelled by this
   * tracker (`RULINGS.md` restored 2026-09-02, "This module tracks Matrix
   * state; it does not apply effects"). An earlier version of this comment
   * cited p. 247 for this field directly, which does not support this
   * field's actual meaning (round-4 defect D-8).
   *
   * This field *does* receive marks from elsewhere: a mark placed on a
   * `MatrixTarget` slaved to this host (`target.linkedHostId === this.id`)
   * propagates one mark here too, independently capped (Decision 7a,
   * 2026-09-02; `RULINGS.md` 2026-08-29 "Marks propagated from a slave count
   * toward the master's three", restored 2026-09-02; p. 233). That is a
   * containment-hierarchy mechanism, unrelated to p. 247's defender-sharing
   * passage above — the two must not be conflated. See
   * `MatrixStateService.addMark()`.
   */
  marks: Record<string, number>;

  /**
   * Whether this host's current mark for a given decker includes at least
   * one that arrived by propagation from a slaved device rather than a
   * direct GM click on the host itself — see `MatrixTarget.propagatedMarks`
   * for the full reasoning (Xavier's decision 9, 2026-09-03). Keyed by
   * deckerId; `true` only while `marks[deckerId] > 0`.
   */
  propagatedMarks: Record<string, boolean>;

  constructor(init?: Partial<MatrixHost>) {
    this.id = init?.id ?? "";
    this.name = init?.name ?? "";
    this.attack = init?.attack ?? 0;
    this.sleaze = init?.sleaze ?? 0;
    this.dataProcessing = init?.dataProcessing ?? 0;
    this.firewall = init?.firewall ?? 0;
    this.rating = init?.rating ?? 1;
    this.matrixDamage = init?.matrixDamage ?? 0;
    // Stopped defaulting from rating (p. 229 — hosts have no Matrix Condition
    // Monitor to size). Whatever a caller passes is kept verbatim so an
    // existing session's stored value survives untouched (Table Ruling 5);
    // a freshly created host simply gets 0.
    this.matrixHealth = init?.matrixHealth ?? 0;
    this.targets = init?.targets ?? [];
    this.accessMethod = init?.accessMethod ?? "none";
    this.deckerInside = init?.deckerInside ?? [];
    this.icActive = init?.icActive ?? [];
    this.marks = init?.marks ?? {};
    this.propagatedMarks = init?.propagatedMarks ?? {};
  }
}
