import { Action } from "Interfaces/Action";
import { interruptTable } from "InterruptTable";

const CORE_INTERRUPTS = [
  "fullDefense",
  "block",
  "parry",
  "dodge",
  "intercept",
  "hitTheDirt"
];

class ActionHandler
{

  get interrupts()
  {
    return interruptTable;
  }

  readonly coreInterrupts: Action[];

  constructor()
  {
    this.coreInterrupts = this.mapActionsByKey(CORE_INTERRUPTS);
  }

  private mapActionsByKey(keys: string[]): Action[]
  {
    return keys
      .map(key => interruptTable.find(action => action.key === key))
      .filter((action): action is Action => action !== undefined);
  }
}

export default new ActionHandler();
