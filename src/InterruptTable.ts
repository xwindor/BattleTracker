import { Action } from "./Interfaces/Action";

export const interruptTable: Action[] = [
  {
    key: "fullDefense",
    iniMod: -10,
    persist: true
  },
  {
    key: "block",
    iniMod: -5
  },
  {
    key: "intercept",
    iniMod: -5
  },
  {
    key: "hitTheDirt",
    iniMod: -5
  },
  {
    key: "dodge",
    iniMod: -5
  },
  {
    key: "parry",
    iniMod: -5
  }
];
