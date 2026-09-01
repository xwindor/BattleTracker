/**
 * MatrixTarget
 *
 * A plain (non-Undoable) value object representing any interactive icon in
 * the Matrix — public icon, host content, or nested host. Mutations from
 * outside should be wrapped in UndoHandler.DoAction() so undo/redo still
 * works for Matrix actions.
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

  /** Optional — which host this target lives in. */
  linkedHostId?: string;

  /** Optional — for IC and personas: links to the initiative tracker entry. */
  linkedParticipantId?: string;

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
    this.matrixHealth = init?.matrixHealth ?? 8;
    this.visibility = init?.visibility ?? "hidden";
    this.marks = init?.marks ?? {};
    this.linkedHostId = init?.linkedHostId;
    this.linkedParticipantId = init?.linkedParticipantId;
  }
}
