import { MatrixHost } from "./MatrixHost";
import { MatrixIcon } from "./MatrixIcon";
import { MatrixParticipant } from "./MatrixParticipant";

export type MatrixStep =
  | "jack-in"
  | "public-space"
  | "locate-host"
  | "access-host"
  | "inside-host"
  | "target-interaction"
  | "jack-out";

/**
 * MatrixRunState
 *
 * Top-level state object for the active Matrix run. A single instance lives
 * in MatrixStateService. Plain class - mutated directly by that service.
 *
 * Note: there is no static `noiseLevel` field. Per the new design, noise is
 * a per-roll modifier applied via RollModifierPromptComponent (see
 * Section 4.16 of the plan).
 */
export class MatrixRunState {
  /** All hosts known this session. */
  hosts: MatrixHost[];

  /** Public-space icons (commlinks, vehicle nodes, etc.). */
  publicIcons: MatrixIcon[];

  /** Which host the GM is currently viewing. */
  currentHostId: string | null;

  /** Reference list of all decker participants involved in the run. */
  deckers: MatrixParticipant[];

  /** Current phase of the hacking workflow. */
  workflowStep: MatrixStep;

  constructor(init?: Partial<MatrixRunState>) {
    this.hosts = init?.hosts ?? [];
    this.publicIcons = init?.publicIcons ?? [];
    this.currentHostId = init?.currentHostId ?? null;
    this.deckers = init?.deckers ?? [];
    this.workflowStep = init?.workflowStep ?? "jack-in";
  }
}
