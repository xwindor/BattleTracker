export type MatrixIconType = "commlink" | "spam" | "vehicle-node" | "sensor" | "misc-device";

/**
 * MatrixIcon
 *
 * A public-space Matrix icon (commlink, vehicle node, spam, etc.) generated
 * by IconGeneratorService. Plain class — mutate via UndoHandler.DoAction
 * from outside.
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
