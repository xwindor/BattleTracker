import { GruntStatblock } from "./statblock-types";
import { ALL_GRUNT_STATBLOCKS } from "./grunt-statblocks";

export type { GruntStatblock, GruntStatblockKind, GruntStatblockAugmented } from "./statblock-types";
export { ALL_GRUNT_STATBLOCKS } from "./grunt-statblocks";

/**
 * Look up one statblock by its stable id (e.g. `"pr5-grunt"`). `undefined`
 * for an unknown id - callers decide how to fail (brief "Grunt naming and
 * statblocks", implementation appendix item 23).
 */
export function getStatblockById(id: string): GruntStatblock | undefined {
  return ALL_GRUNT_STATBLOCKS.find(sb => sb.id === id);
}
