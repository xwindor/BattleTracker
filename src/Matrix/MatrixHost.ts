import { MatrixTarget } from "./MatrixTarget";
import { ICParticipant } from "./ICParticipant";

export type HostAccessMethod = "none" | "hack-on-fly" | "brute-force" | "direct-connection";

/**
 * MatrixHost
 *
 * A target host (server / corporate node) the GM created or selected. Holds
 * its own A/S/D/F + Matrix CM, the contained MatrixTargets, and currently
 * active IC. Plain class (not Undoable) — mutate via UndoHandler.DoAction
 * from MatrixStateService.
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
  matrixHealth: number;

  /** Contents of the host. */
  targets: MatrixTarget[];

  accessMethod: HostAccessMethod;

  /** IDs of deckers currently inside the host. */
  deckerInside: string[];

  /** IC participants spawned and currently active in this host. */
  icActive: ICParticipant[];

  constructor(init?: Partial<MatrixHost>) {
    this.id = init?.id ?? "";
    this.name = init?.name ?? "";
    this.attack = init?.attack ?? 0;
    this.sleaze = init?.sleaze ?? 0;
    this.dataProcessing = init?.dataProcessing ?? 0;
    this.firewall = init?.firewall ?? 0;
    this.rating = init?.rating ?? 1;
    this.matrixDamage = init?.matrixDamage ?? 0;
    this.matrixHealth = init?.matrixHealth ?? (8 + Math.ceil((init?.rating ?? 1) / 2));
    this.targets = init?.targets ?? [];
    this.accessMethod = init?.accessMethod ?? "none";
    this.deckerInside = init?.deckerInside ?? [];
    this.icActive = init?.icActive ?? [];
  }
}
