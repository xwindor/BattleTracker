import { MatrixHost } from "./MatrixHost";
import { MatrixIcon } from "./MatrixIcon";
import { MatrixParticipant } from "./MatrixParticipant";
import { MatrixTarget } from "./MatrixTarget";

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
 * in MatrixStateService. There is no undo system in this app (removed commit
 * 426827b, `SCOPE.md` "Undo / redo") — mutate through `MatrixStateService`,
 * whose methods write directly and fire `stateChange$`.
 *
 * `noise` below is a persistent GM-set reminder field, not a per-roll
 * modifier — Scope Question B (`briefs/matrix-port-rules-correctness-spec.md`,
 * approved 2026-09-01) settled this: the app tracks and displays the current
 * Matrix noise level but never applies it to any dice pool. An earlier
 * version of this comment claimed the opposite ("noise is a per-roll
 * modifier applied via RollModifierPromptComponent") and predates that
 * decision; `docs/UNVERIFIED-RULES.md` item 10 asserted the same and is
 * resolved by the same brief (round-4 cleanup).
 */
export class MatrixRunState {
  /** All hosts known this session. */
  hosts: MatrixHost[];

  /** Public-space icons (commlinks, vehicle nodes, etc.) — Step 10 icon generator. */
  publicIcons: MatrixIcon[];

  /** Loose devices/targets in public space (not inside any host). linkedHostId = null. */
  publicTargets: MatrixTarget[];

  /** Which host the GM is currently viewing. */
  currentHostId: string | null;

  /** Reference list of all decker participants involved in the run. */
  deckers: MatrixParticipant[];

  /** Current phase of the hacking workflow. */
  workflowStep: MatrixStep;

  /** Scene-level flat dice penalty on all Matrix tests. GM-adjustable at any time. */
  noise: number;

  /** Active grid for this scene. Affects connection costs and some dice pools. */
  activeGrid: "public" | "corporate" | "prime";

  constructor(init?: Partial<MatrixRunState>) {
    this.hosts = init?.hosts ?? [];
    this.publicIcons = init?.publicIcons ?? [];
    this.publicTargets = init?.publicTargets ?? [];
    this.currentHostId = init?.currentHostId ?? null;
    this.deckers = init?.deckers ?? [];
    this.workflowStep = init?.workflowStep ?? "jack-in";
    this.noise = init?.noise ?? 0;
    this.activeGrid = init?.activeGrid ?? "public";
  }
}
