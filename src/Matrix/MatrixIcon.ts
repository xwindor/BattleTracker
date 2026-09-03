export type MatrixIconType = "commlink" | "spam" | "vehicle-node" | "sensor" | "misc-device";

/**
 * MatrixIcon
 *
 * A public-space Matrix icon (commlink, vehicle node, spam, etc.) generated
 * by IconGeneratorService. There is no undo system in this app (removed
 * commit 426827b, `SCOPE.md` "Undo / redo") — mutate through whichever
 * service owns this icon's list, which fires `stateChange$` after writing
 * directly. Not touched this round beyond this comment fix — spotted while
 * clearing the same stale `UndoHandler.DoAction` reference from
 * `MatrixTarget.ts` and `MatrixHost.ts` (round-4).
 */
export class MatrixIcon {
  id: string;
  name: string;
  iconType: MatrixIconType;

  /** Device Rating 1–4 (random for public icons). */
  deviceRating: number;

  /** True if the GM promoted this icon to a real MatrixTarget. */
  promoted: boolean;

  constructor(init?: Partial<MatrixIcon>) {
    this.id = init?.id ?? "";
    this.name = init?.name ?? "";
    this.iconType = init?.iconType ?? "misc-device";
    this.deviceRating = init?.deviceRating ?? 1;
    this.promoted = init?.promoted ?? false;
  }
}
