export interface InterruptActionMeta {
  label: string;
  /**
   * Short form for the status tag beside the name on the GM screen's
   * initiative row (GM screen overhaul 07, GitHub #10; Xavier 2026-10-04:
   * "abbreviate and add hover text"). The full label and the Initiative cost
   * go in the tag's hover text.
   */
  tag: string;
  description: string;
  /**
   * Gerund clause for the Action Log sentence, used as
   * `interrupted, ${verb}.` (`briefs/action-log-readability-spec.md`).
   */
  verb: string;
}

export const INTERRUPT_ACTION_META: Record<string, InterruptActionMeta> = {
  fullDefense: {
    label: "Full Defense",
    tag: "FULL DEF",
    description: "Interrupt stance for the rest of the Combat Turn. Add Willpower to all defense tests this turn. Can be taken before your Action Phase if not surprised, and it stacks with other interrupt actions.",
    verb: "going full defense"
  },
  block: {
    label: "Block",
    tag: "BLOCK",
    description: "Interrupt defense vs melee. Add Unarmed Combat to your defense test once for this attack only (not for the whole Combat Turn).",
    verb: "blocking"
  },
  intercept: {
    label: "Intercept",
    tag: "INTERCEPT",
    description: "Interrupt to attack a target moving past you or breaking from melee (within 1 + Reach meters). You must have enough Initiative left this Action Phase to do it.",
    verb: "intercepting"
  },
  dodge: {
    label: "Dodge",
    tag: "DODGE",
    description: "Interrupt defense. Add Gymnastics to your defense test once for this attack only (not for the whole Combat Turn).",
    verb: "dodging"
  },
  parry: {
    label: "Parry",
    tag: "PARRY",
    description: "Interrupt defense vs melee. Add your relevant melee weapon skill to your defense test once for this attack only; relevant bonus dice (such as weapon focus dice) can apply.",
    verb: "parrying"
  },
  hitTheDirt: {
    label: "Hit The Dirt",
    tag: "HIT DIRT",
    description: "If you've already used your Free Action, drop prone under suppressive fire without making the Reaction + Edge test. You will be prone on your next Action Phase and must use Stand Up to get up.",
    verb: "hitting the dirt"
  },
  counterstrike: {
    label: "Counterstrike",
    tag: "COUNTER",
    description: "",
    verb: "counterstriking"
  },
  diveForCover: {
    label: "Dive For Cover",
    tag: "COVER",
    description: "",
    verb: "diving for cover"
  },
  reversal: {
    label: "Reversal",
    tag: "REVERSAL",
    description: "",
    verb: "using Reversal"
  },
  rightBackAtYa: {
    label: "Right Back At Ya",
    tag: "BACK AT YA",
    description: "",
    verb: "using Right Back At Ya"
  },
  runForYourLife: {
    label: "Run For Your Life",
    tag: "RUN",
    description: "",
    verb: "running for their life"
  },
  diveOnTheGrenade: {
    label: "Dive On The Grenade",
    tag: "GRENADE",
    description: "",
    verb: "diving on the grenade"
  },
  sacrificeThrow: {
    label: "Sacrifice Throw",
    tag: "SAC THROW",
    description: "",
    verb: "using Sacrifice Throw"
  },
  riposte: {
    label: "Riposte",
    tag: "RIPOSTE",
    description: "",
    verb: "riposting"
  },
  protectingThePrinciple: {
    label: "Protecting The Principle",
    tag: "PROTECT",
    description: "",
    verb: "protecting the principle"
  },
  shadowBlock: {
    label: "Shadow Block",
    tag: "SHADOW BLK",
    description: "",
    verb: "using Shadow Block"
  },
  iAmTheFirewall: {
    label: "I Am The Firewall",
    tag: "FIREWALL",
    description: "",
    verb: "using I Am The Firewall"
  },
  custom: {
    label: "Custom",
    tag: "CUSTOM",
    description: "",
    verb: "using a custom interrupt"
  }
};

export function getInterruptLabel(key: string): string {
  return INTERRUPT_ACTION_META[key]?.label ?? key;
}

export function getInterruptTag(key: string): string {
  return INTERRUPT_ACTION_META[key]?.tag ?? getInterruptLabel(key).toUpperCase();
}

export function getInterruptDescription(key: string): string {
  return INTERRUPT_ACTION_META[key]?.description ?? "";
}

/**
 * Verb phrase for an interrupt key, for the Action Log sentence. Falls back
 * to `using <label>` for an unknown key, so the clause is always readable.
 */
export function getInterruptVerbPhrase(key: string): string {
  return INTERRUPT_ACTION_META[key]?.verb ?? `using ${getInterruptLabel(key)}`;
}
