import { IParticipant } from "./IParticipant";
import { Participant } from "./Participant";

/**
 * GroupParticipant
 *
 * A member of an identical-unit group (e.g. "Ganger 1..4"). All members of a
 * group share one initiative roll and act back-to-back in the pass order;
 * each member keeps its own condition monitor.
 *
 * Wound modifiers deliberately do NOT reduce a group member's initiative
 * (mook simplification chosen by the GM) — otherwise differently-wounded
 * members would drift apart in the initiative order and defeat the purpose
 * of rolling once for the group.
 */
export class GroupParticipant extends Participant {

  private _groupId: string;
  get groupId(): string { return this._groupId; }
  set groupId(val: string) { this.Set("groupId", val); }

  constructor() {
    super();
    this._groupId = "";
  }

  /** Groups ignore wound modifiers for initiative: add wm back. */
  override getCurrentInitiative(): number {
    return super.getCurrentInitiative() + this.wm;
  }

  /**
   * Preserve groupId through CombatManager copies (same gotcha as
   * MatrixParticipant.clone — the base impl would strip subclass fields).
   */
  override clone(): IParticipant {
    const clone: GroupParticipant = new GroupParticipant();
    const src = this as unknown as Record<string, unknown>;
    const dst = clone as unknown as Record<string, unknown>;
    const baseFields = [
      "_active", "_baseIni", "_diceIni", "_dices", "_edge", "_finished",
      "_name", "_ooc", "_overflowHealth", "_painTolerance", "_physicalDamage",
      "_physicalHealth", "_status", "_stunDamage", "_stunHealth", "_waiting",
      "_hasPainEditor", "_sortOrder"
    ];
    for (const f of baseFields) {
      dst[f] = src[f];
    }
    dst["_actionHistory"] = [];
    clone._groupId = this._groupId;
    return clone;
  }
}
