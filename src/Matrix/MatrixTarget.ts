/**
 * MatrixTarget
 *
 * A plain value object representing any interactive icon in the Matrix —
 * public icon, host content, or nested host. Mutated directly by callers.
 */
export type MatrixTargetType = "device" | "file" | "persona" | "host" | "ic";
export type MatrixTargetSpotted = "hidden" | "running-silent" | "spotted";
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

  /** General rating / Device Rating */
  rating: number;

  /** Current Matrix CM damage */
  matrixDamage: number;

  /** Max Matrix CM boxes */
  matrixHealth: number;

  spotted: MatrixTargetSpotted;
  revealedToPlayers: boolean;

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
    this.matrixDamage = init?.matrixDamage ?? 0;
    this.matrixHealth = init?.matrixHealth ?? 8;
    this.spotted = init?.spotted ?? "hidden";
    this.revealedToPlayers = init?.revealedToPlayers ?? false;
    this.marks = init?.marks ?? {};
    this.linkedHostId = init?.linkedHostId;
    this.linkedParticipantId = init?.linkedParticipantId;
  }
}
