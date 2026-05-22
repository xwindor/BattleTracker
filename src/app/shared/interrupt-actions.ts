export interface InterruptActionMeta {
  label: string;
  description: string;
}

export const INTERRUPT_ACTION_META: Record<string, InterruptActionMeta> = {
  fullDefense: {
    label: "Full Defense",
    description: "Interrupt stance for the rest of the Combat Turn. Add Willpower to all defense tests this turn. Can be taken before your Action Phase if not surprised, and it stacks with other interrupt actions."
  },
  block: {
    label: "Block",
    description: "Interrupt defense vs melee. Add Unarmed Combat to your defense test once for this attack only (not for the whole Combat Turn)."
  },
  intercept: {
    label: "Intercept",
    description: "Interrupt to attack a target moving past you or breaking from melee (within 1 + Reach meters). You must have enough Initiative left this Action Phase to do it."
  },
  dodge: {
    label: "Dodge",
    description: "Interrupt defense. Add Gymnastics to your defense test once for this attack only (not for the whole Combat Turn)."
  },
  parry: {
    label: "Parry",
    description: "Interrupt defense vs melee. Add your relevant melee weapon skill to your defense test once for this attack only; relevant bonus dice (such as weapon focus dice) can apply."
  },
  hitTheDirt: {
    label: "Hit The Dirt",
    description: "If you've already used your Free Action, drop prone under suppressive fire without making the Reaction + Edge test. You will be prone on your next Action Phase and must use Stand Up to get up."
  },
  counterstrike: {
    label: "Counterstrike",
    description: ""
  },
  diveForCover: {
    label: "Dive For Cover",
    description: ""
  },
  reversal: {
    label: "Reversal",
    description: ""
  },
  rightBackAtYa: {
    label: "Right Back At Ya",
    description: ""
  },
  runForYourLife: {
    label: "Run For Your Life",
    description: ""
  },
  diveOnTheGrenade: {
    label: "Dive On The Grenade",
    description: ""
  },
  sacrificeThrow: {
    label: "Sacrifice Throw",
    description: ""
  },
  riposte: {
    label: "Riposte",
    description: ""
  },
  protectingThePrinciple: {
    label: "Protecting The Principle",
    description: ""
  },
  shadowBlock: {
    label: "Shadow Block",
    description: ""
  },
  iAmTheFirewall: {
    label: "I Am The Firewall",
    description: ""
  },
  custom: {
    label: "Custom",
    description: ""
  }
};

export function getInterruptLabel(key: string): string {
  return INTERRUPT_ACTION_META[key]?.label ?? key;
}

export function getInterruptDescription(key: string): string {
  return INTERRUPT_ACTION_META[key]?.description ?? "";
}
