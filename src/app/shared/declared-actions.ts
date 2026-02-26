export type DeclaredActionEconomy = "free" | "simple" | "complex";

export type DeclaredActionCategoryId =
  | "free"
  | "simple"
  | "complex"
  | "matrix-free"
  | "matrix-simple"
  | "matrix-complex"
  | "matrix-variable";

export interface DeclaredActionItem {
  name: string;
  economy: DeclaredActionEconomy;
}

export interface DeclaredActionCategory {
  id: DeclaredActionCategoryId;
  category: string;
  economy: DeclaredActionEconomy;
  items: DeclaredActionItem[];
}

export const REPEATABLE_SIMPLE_ACTIONS: readonly string[] = [
  "Take Aim"
];

export const DECLARED_ACTIONS: DeclaredActionCategory[] = [
  {
    id: "free",
    category: "Free",
    economy: "free",
    items: [
      { name: "Gesture", economy: "free" },
      { name: "Speak / Text / Transmit Phrase", economy: "free" },
      { name: "Run", economy: "free" },
      { name: "Call a Shot", economy: "free" },
      { name: "Multiple Attacks", economy: "free" },
      { name: "Change Linked Device Mode", economy: "free" },
      { name: "Drop Prone", economy: "free" },
      { name: "Drop Object", economy: "free" },
      { name: "Eject Smartgun Clip", economy: "free" }
    ]
  },
  {
    id: "simple",
    category: "Simple",
    economy: "simple",
    items: [
      { name: "Ready Weapon", economy: "simple" },
      { name: "Quick Draw", economy: "simple" },
      { name: "Take Aim", economy: "simple" },
      { name: "Fire Semi-Auto, Single-Shot, Burst Fire, or Full-Auto", economy: "simple" },
      { name: "Fire Bow", economy: "simple" },
      { name: "Throw Weapon", economy: "simple" },
      { name: "Remove Clip", economy: "simple" },
      { name: "Insert Clip", economy: "simple" },
      { name: "Observe in Detail", economy: "simple" },
      { name: "Take Cover", economy: "simple" },
      { name: "Stand Up", economy: "simple" },
      { name: "Pick Up / Put Down Object", economy: "simple" },
      { name: "Use Simple Device", economy: "simple" },
      { name: "Change Device Mode", economy: "simple" },
      { name: "Change Gun Mode", economy: "simple" },
      { name: "Activate Focus", economy: "simple" },
      { name: "Call Spirit", economy: "simple" },
      { name: "Command Spirit", economy: "simple" },
      { name: "Dismiss Spirit", economy: "simple" },
      { name: "Reckless Spellcasting", economy: "simple" },
      { name: "Shift Perception", economy: "simple" }
    ]
  },
  {
    id: "complex",
    category: "Complex",
    economy: "complex",
    items: [
      { name: "Melee Attack", economy: "complex" },
      { name: "Cast Spell", economy: "complex" },
      { name: "Fire Long Burst or Semi-Auto Burst", economy: "complex" },
      { name: "Fire Full-Auto Weapon", economy: "complex" },
      { name: "Fire Mounted or Vehicle Weapon", economy: "complex" },
      { name: "Load and Fire Bow", economy: "complex" },
      { name: "Reload Firearm", economy: "complex" },
      { name: "Sprint", economy: "complex" },
      { name: "Astral Projection", economy: "complex" },
      { name: "Banish Spirit", economy: "complex" },
      { name: "Rigger Jump In", economy: "complex" },
      { name: "Summoning", economy: "complex" },
      { name: "Use Skill", economy: "complex" }
    ]
  },
  {
    id: "matrix-free",
    category: "Matrix Free",
    economy: "free",
    items: [
      { name: "Load Program", economy: "free" },
      { name: "Switch Two Matrix Attributes", economy: "free" },
      { name: "Swap Two Programs", economy: "free" },
      { name: "Unload Program", economy: "free" },
      { name: "Invite Mark", economy: "free" }
    ]
  },
  {
    id: "matrix-simple",
    category: "Matrix Simple",
    economy: "simple",
    items: [
      { name: "Call / Dismiss Sprite", economy: "simple" },
      { name: "Change Icon", economy: "simple" },
      { name: "Command Sprite", economy: "simple" },
      { name: "Jack Out", economy: "simple" },
      { name: "Crash Program", economy: "simple" },
      { name: "Hide", economy: "simple" }
    ]
  },
  {
    id: "matrix-complex",
    category: "Matrix Complex",
    economy: "complex",
    items: [
      { name: "Break File", economy: "complex" },
      { name: "Erase Matrix Signature", economy: "complex" },
      { name: "Snoop", economy: "complex" },
      { name: "Brute Force", economy: "complex" },
      { name: "Format Device", economy: "complex" },
      { name: "Spoof Command", economy: "complex" },
      { name: "Check Overwatch Score", economy: "complex" },
      { name: "Grid-Hop", economy: "complex" },
      { name: "Trace Icon", economy: "complex" },
      { name: "Crack File", economy: "complex" },
      { name: "Hack on the Fly", economy: "complex" },
      { name: "Compile Sprite", economy: "complex" },
      { name: "Decompile Sprite", economy: "complex" }
    ]
  },
  {
    id: "matrix-variable",
    category: "Matrix Variable",
    economy: "simple",
    items: [
      { name: "Send Message", economy: "simple" },
      { name: "Data Spike", economy: "simple" },
      { name: "Jam Signals", economy: "simple" },
      { name: "Erase Resonance Signature", economy: "simple" },
      { name: "Control Device", economy: "simple" },
      { name: "Switch Interface Mode", economy: "simple" },
      { name: "Disarm Data Bomb", economy: "simple" },
      { name: "Jump Into Rigged Device", economy: "simple" },
      { name: "Kill Complex Form", economy: "simple" },
      { name: "Matrix Search", economy: "simple" },
      { name: "Edit File", economy: "simple" },
      { name: "Matrix Perception", economy: "simple" },
      { name: "Register Sprite", economy: "simple" },
      { name: "Enter / Exit Host", economy: "simple" },
      { name: "Reboot Device", economy: "simple" },
      { name: "Thread Complex Form", economy: "simple" },
      { name: "Erase Mark", economy: "simple" },
      { name: "Set Data Bomb", economy: "simple" }
    ]
  }
];

export const DECLARED_ACTION_DESCRIPTIONS: Record<string, string> = {
  "Call a Shot": "Declare a called shot before attacking a vulnerable area. Must be combined with a Fire Weapon, Throw Weapon, or Melee Attack action.",
  "Change Linked Device Mode": "Free Action via DNI. Activate/deactivate/switch mode on linked devices.",
  "Drop Object": "Drop held item(s) immediately. GM may apply damage to fragile items or in hostile environments.",
  "Drop Prone": "Free Action (if not surprised). Kneel or drop prone immediately.",
  "Eject Smartgun Clip": "Free Action via DNI-linked smartgun. Ejects the clip; inserting a fresh clip still takes a separate action.",
  "Gesture": "Communicate with quick gestures; unfamiliar observers may need an Intuition test.",
  "Multiple Attacks": "Split your dice pool to target multiple opponents in a single attack action.",
  "Run": "Enter running movement and apply running movement modifiers.",
  "Speak / Text / Transmit Phrase": "Send one short phrase/message; extra phrases require additional Free Actions.",
  "Activate Focus": "Activate a carried focus.",
  "Aim": "Gain +1 dice or +1 Accuracy for next attack; can stack over phases up to Willpower/2 (round up), but bonuses are lost if you take other actions first.",
  "Call Spirit": "Call a spirit already summoned and on standby.",
  "Change Device Mode": " Activate/deactivate/change mode on devices via switch/virtual command/wired or wireless control.",
  "Change Gun Mode": "Change firing mode/choke on a readied firearm; becomes Free with proper smartgun link.",
  "Command Spirit": "Issue a command to one spirit or a controlled group.",
  "Dismiss Spirit": "Release a spirit from control.",
  "Fire Bow": "Fire one arrow from a loaded bow.",
  "Fire Semi-Auto, Single-Shot, Burst Fire, or Full-Auto": "Simple Action firearm attack option (Burst/FA uses simple-action ammo amounts).",
  "Insert Clip": "Insert fresh clip after removing old one.",
  "Observe in Detail": "Make a detailed Perception check when quick observation is not enough.",
  "Pick Up / Put Down Object": "Carefully pick up or set down an object.",
  "Quick Draw": "Attempt draw-and-fire with a Quick Draw test.",
  "Ready Weapon": "Draw/ready a weapon for use.",
  "Reckless Spellcasting": "Cast faster at the cost of higher Drain.",
  "Remove Clip": "Remove a clip from a ready firearm.",
  "Shift Perception": "Shift to/from astral perception if capable.",
  "Stand Up": "Stand from prone; wounded characters may need Body + Willpower (2).",
  "Take Aim": "Gain cumulative aim bonus (+1 dice or +1 Accuracy) up to Willpower/2 (round up).",
  "Take Cover": "Simple Action (if not surprised). Gain cover bonus to defense tests.",
  "Throw Weapon": "Throw a readied throwing weapon.",
  "Use Simple Device": "Interact with a device that uses a basic trigger/button/icon.",
  "Astral Projection": "Shift consciousness to the astral plane.",
  "Banish Spirit": "Enter a banishing contest with a spirit.",
  "Cast Spell": "Cast one spell.",
  "Fire Full-Auto Weapon": "Fire full-auto (10 rounds); apply recoil rules.",
  "Fire Long Burst or Semi-Auto Burst": "Complex Action burst-fire option.",
  "Fire Mounted or Vehicle Weapon": "Fire mounted/vehicle weapon.",
  "Load and Fire Bow": "Nock and fire bow in one action.",
  "Melee Attack": "Resolve melee attack action.",
  "Reload Firearm": "Use complex reload methods (speed loader, belt, drum, internal, etc.).",
  "Rigger Jump In": "Jump into rigged vehicle/device.",
  "Sprint": "Increase running distance with Running test.",
  "Summoning": "Summon a spirit.",
  "Use Skill": "Use an appropriate skill.",
  "Load Program": "Matrix Free Action.",
  "Switch Two Matrix Attributes": "Matrix Free Action.",
  "Swap Two Programs": "Matrix Free Action.",
  "Unload Program": "Matrix Free Action.",
  "Invite Mark": "Matrix Free Action.",
  "Call / Dismiss Sprite": "Matrix Simple Action.",
  "Change Icon": "Matrix Simple Action.",
  "Command Sprite": "Matrix Simple Action.",
  "Jack Out": "Matrix Simple Action.",
  "Crash Program": "Matrix Simple Action.",
  "Hide": "Matrix Simple Action.",
  "Break File": "Matrix Complex Action.",
  "Erase Matrix Signature": "Matrix Complex Action.",
  "Snoop": "Matrix Complex Action.",
  "Brute Force": "Matrix Complex Action.",
  "Format Device": "Matrix Complex Action.",
  "Spoof Command": "Matrix Complex Action.",
  "Check Overwatch Score": "Matrix Complex Action.",
  "Grid-Hop": "Matrix Complex Action.",
  "Trace Icon": "Matrix Complex Action.",
  "Crack File": "Matrix Complex Action.",
  "Hack on the Fly": "Matrix Complex Action.",
  "Compile Sprite": "Matrix Complex Action.",
  "Decompile Sprite": "Matrix Complex Action.",
  "Send Message": "Matrix Variable Action. In this tracker treated as Simple-equivalent for planning.",
  "Data Spike": "Matrix Variable Action. In this tracker treated as Simple-equivalent for planning.",
  "Jam Signals": "Matrix Variable Action. In this tracker treated as Simple-equivalent for planning.",
  "Erase Resonance Signature": "Matrix Variable Action. In this tracker treated as Simple-equivalent for planning.",
  "Control Device": "Matrix Variable Action. In this tracker treated as Simple-equivalent for planning.",
  "Switch Interface Mode": "Matrix Variable Action. In this tracker treated as Simple-equivalent for planning.",
  "Disarm Data Bomb": "Matrix Variable Action. In this tracker treated as Simple-equivalent for planning.",
  "Jump Into Rigged Device": "Matrix Variable Action. In this tracker treated as Simple-equivalent for planning.",
  "Kill Complex Form": "Matrix Variable Action. In this tracker treated as Simple-equivalent for planning.",
  "Matrix Search": "Matrix Variable Action. In this tracker treated as Simple-equivalent for planning.",
  "Edit File": "Matrix Variable Action. In this tracker treated as Simple-equivalent for planning.",
  "Matrix Perception": "Matrix Variable Action. In this tracker treated as Simple-equivalent for planning.",
  "Register Sprite": "Matrix Variable Action. In this tracker treated as Simple-equivalent for planning.",
  "Enter / Exit Host": "Matrix Variable Action. In this tracker treated as Simple-equivalent for planning.",
  "Reboot Device": "Matrix Variable Action. In this tracker treated as Simple-equivalent for planning.",
  "Thread Complex Form": "Matrix Variable Action. In this tracker treated as Simple-equivalent for planning.",
  "Erase Mark": "Matrix Variable Action. In this tracker treated as Simple-equivalent for planning.",
  "Set Data Bomb": "Matrix Variable Action. In this tracker treated as Simple-equivalent for planning."
};
