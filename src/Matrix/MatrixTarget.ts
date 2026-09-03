/**
 * MatrixTarget
 *
 * A plain (non-Undoable) value object representing any interactive icon in
 * the Matrix — public icon, host content, or nested host. There is no undo
 * system in this app (removed commit 426827b, `SCOPE.md` "Undo / redo") —
 * mutate through `MatrixStateService`, whose methods write directly and fire
 * `stateChange$`.
 */
export type MatrixTargetType = "device" | "file" | "persona" | "host" | "ic";

/**
 * Visibility of a target. Three-state cycle that replaces the old
 * `spotted` + `runningSilent` pair:
 *
 *   hidden          : GM prep — not on the Matrix yet. Players see nothing.
 *   running-silent  : Broadcasting silently. Players need a Matrix Perception
 *                     test to spot it; once spotted it appears as an unknown
 *                     icon. (SR5E p.224)
 *   active          : Broadcasting normally. Players see full detail.
 */
export type MatrixTargetVisibility = "hidden" | "running-silent" | "active";
export type MatrixTargetContext = "public" | "host";

export class MatrixTarget {
  id: string;
  name: string;
  type: MatrixTargetType;

  /** Optional — name/id of the runner or NPC this persona belongs to. */
  personaOwner?: string;

  /** Where this icon currently lives. */
  context: MatrixTargetContext;

  // Matrix attributes (A/S/D/F)
  attack: number;
  sleaze: number;
  dataProcessing: number;
  firewall: number;

  /** General rating (used for CM calc on non-device targets). */
  rating: number;

  /** Device Rating (device type only, 1–12). Used for CM and direct-connection tests. */
  deviceRating: number;

  /** Current Matrix CM damage */
  matrixDamage: number;

  /** Max Matrix CM boxes */
  matrixHealth: number;

  /**
   * Three-state visibility. Subsumes old `spotted` + `runningSilent`.
   * Cycles: hidden → running-silent → active → hidden.
   */
  visibility: MatrixTargetVisibility;

  /** Marks placed by each decker, keyed by deckerId. Max 3 per decker. */
  marks: Record<string, number>;

  /**
   * Whether this icon's current mark for a given decker includes at least
   * one that arrived by propagation rather than a direct GM click — a
   * visibility aid, not a second ledger (Xavier's decision 9, 2026-09-03:
   * removing a mark does not reverse propagation, but the GM should be able
   * to tell it happened). Keyed by deckerId; `true` only while `marks
   * [deckerId] > 0` — cleared when that count reaches 0
   * (`MatrixStateService.removeMark()`), reset again on the next
   * propagation. Does not distinguish *which* of several stacked marks was
   * the propagated one — the GM corrects from this icon's own row if wrong
   * (`RULINGS.md` 2026-09-03, "Propagation is visible, not reversible").
   */
  propagatedMarks: Record<string, boolean>;

  /** Optional — which host this target lives in. */
  linkedHostId?: string;

  /** Optional — for IC and personas: links to the initiative tracker entry. */
  linkedParticipantId?: string;

  /**
   * Optional — the id of another `MatrixTarget` this one is slaved/parented
   * to on the open grid (Xavier's decision 7b, 2026-09-02: "devices out on
   * the open grid ... have other devices like weapons and files parented to
   * it"). Scoped to `context === "public"` targets only — a target already
   * inside a host uses `linkedHostId` for its containment, not this field
   * (host WAN propagation is decision 7a, a separate mechanism — see
   * `MatrixStateService.addMark()`). Marking a child propagates a mark up to
   * its parent, and onward up the chain if the parent itself has a parent
   * (`RULINGS.md` 2026-08-29 "Marks propagated from a slave count toward the
   * master's three", restored 2026-09-02, extended here to an open-grid
   * parent/child chain rather than only a host WAN). Not itself enforced by
   * this constructor — `HierarchyEditorComponent` guards against a target
   * parenting itself or a descendant, and `MatrixStateService`'s propagation
   * walk carries its own visited-set cycle guard in case an import ever
   * produces one anyway.
   *
   * **Device-only, both ends (Xavier's decision 8, 2026-09-03).** Only a
   * `type: "device"` target ever propagates a mark upward, and a walk only
   * ever *lands* on a device or a host — never on a file, persona, IC or
   * nested-host icon. "Only getting marks on devices propagate to the hosts
   * as well, files and personas do not get propagated to and do not
   * propagate" (Xavier, 2026-09-03). p. 233 states this outright — "Only
   * devices can be slaves, masters, or part of a PAN. In a WAN, the slaves
   * must be devices, and the master must be a host"
   * (`rules/pages/p0235.txt:54-58`); nothing there or in the open-grid
   * extension above supports a file or persona relaying a mark it received.
   * A device parented to a file therefore does
   * not propagate through the file — the walk stops there, and the file
   * itself receives nothing (`HierarchyEditorComponent.parentOptionsFor()`
   * enforces the destination half by excluding non-device targets from the
   * parent picker; `MatrixStateService.propagateMarkUp()` enforces both
   * halves at write time regardless of what the UI allowed in).
   */
  parentTargetId?: string;

  constructor(init?: Partial<MatrixTarget>) {
    this.id = init?.id ?? "";
    this.name = init?.name ?? "";
    this.type = init?.type ?? "device";
    this.personaOwner = init?.personaOwner;
    this.context = init?.context ?? "public";
    this.attack = init?.attack ?? 0;
    this.sleaze = init?.sleaze ?? 0;
    this.dataProcessing = init?.dataProcessing ?? 0;
    this.firewall = init?.firewall ?? 0;
    this.rating = init?.rating ?? 1;
    this.deviceRating = init?.deviceRating ?? 4;
    this.matrixDamage = init?.matrixDamage ?? 0;
    // No guessed default: a device/persona/IC monitor is
    // 8 + ceil(rating / 2) off a *specific* rating (Device Rating or Host
    // Rating - see matrixConditionMonitor()), and a host/file target has no
    // monitor at all (p. 229). Callers compute the right number (or 0 for
    // "not applicable") and pass it in explicitly; this constructor no
    // longer invents "8" for whichever case forgets to.
    this.matrixHealth = init?.matrixHealth ?? 0;
    this.visibility = init?.visibility ?? "hidden";
    this.marks = init?.marks ?? {};
    this.propagatedMarks = init?.propagatedMarks ?? {};
    this.linkedHostId = init?.linkedHostId;
    this.linkedParticipantId = init?.linkedParticipantId;
    this.parentTargetId = init?.parentTargetId;
  }
}
