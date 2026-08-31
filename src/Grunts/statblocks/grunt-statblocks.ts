// The fourteen sample grunt/lieutenant statblocks, SR5 core pp. 381-384
// (brief "Grunt naming and statblocks", "The statblock data set" > "Sample
// grunts"). Contacts (pp. 390-392) are NOT transcribed here - Decision D-X3
// (2026-08-26, binding): "dont add contacts from the CRB, i just want the
// grunts that may be in combat."
//
// Only Body, Willpower, Reaction, Intuition and Initiative Dice are
// transcribed, per Decision D-X2's reduced `GruntStatblock` (see
// statblock-types.ts). Everything else printed in the blocks - Agility,
// Strength, Logic, Charisma, Essence, Limits, Armor, skills, gear, qualities,
// spells, complex forms, adept powers, printed Astral/Matrix Initiative lines
// - is out of scope and intentionally not carried here.
//
// One exception, added 2026-08-30 (RULINGS.md "Data Processing is imported
// from a statblock only where the book supplies one, and is blank
// otherwise"): `pr4-lieutenant` also carries `dataProcessing`, because the
// tracker already uses that value for Matrix initiative and the rules
// derive one for his living persona (Data Processing = Logic, p. 251). See
// `GruntStatblock.dataProcessing`'s doc comment.
//
// Reaction/Intuition values are read directly off each block's attribute line
// (order B A R S W L I C Ess/E/M/Res, brief G15). Initiative Dice are read off
// the printed "X + YD6" Initiative line. Where a block prints a second,
// bracketed attribute value, it is carried in `augmented`; where the printed
// Initiative Dice count differs between the base and augmented lines, it
// would go in `augmentedInitiativeDice` - none of these fourteen blocks print
// a different dice count between the two (brief interaction I3: augmentation
// changes the attribute, not the dice, except where a block's *only* printed
// Initiative line already includes the augmentation - see the per-block notes
// below).
import { GruntStatblock } from "./statblock-types";

export const ALL_GRUNT_STATBLOCKS: readonly GruntStatblock[] = [
  // ── PR 0 - Thugs & Mouth Breathers (p. 381) ──────────────────────────────
  {
    id: "pr0-grunt",
    label: "PR 0 - Thugs & Mouth Breathers (Grunt)",
    kind: "grunt",
    professionalRating: 0,
    printedPage: 381,
    body: 3, willpower: 3, reaction: 3, intuition: 3, initiativeDice: 1,
    notes: []
  },
  {
    id: "pr0-lieutenant",
    label: "PR 0 - Thugs & Mouth Breathers (Lieutenant)",
    kind: "lieutenant",
    professionalRating: 0,
    printedPage: 381,
    body: 3, willpower: 3, reaction: 3, intuition: 3, initiativeDice: 1,
    // X1: the block prints no Condition Monitor line at all (p. 381); the
    // p. 379 formula derives one from Body/Willpower regardless (criterion 9).
    notes: [ "Block prints no Condition Monitor line; p. 379 formula derives 10 (8 + ceil(3/2))." ]
  },

  // ── PR 1 - Gangers & Street Scum (p. 382) ───────────────────────────────
  {
    id: "pr1-grunt",
    label: "PR 1 - Gangers & Street Scum (Grunt)",
    kind: "grunt",
    professionalRating: 1,
    printedPage: 382,
    body: 4, willpower: 3, reaction: 3, intuition: 3, initiativeDice: 1,
    notes: []
  },
  {
    id: "pr1-lieutenant",
    label: "PR 1 - Gangers & Street Scum (Lieutenant)",
    kind: "lieutenant",
    professionalRating: 1,
    printedPage: 382,
    body: 4, willpower: 4, reaction: 4, intuition: 4, initiativeDice: 1,
    notes: []
  },

  // ── PR 2 - Corporate Security (p. 382) ──────────────────────────────────
  {
    id: "pr2-grunt",
    label: "PR 2 - Corporate Security (Grunt)",
    kind: "grunt",
    professionalRating: 2,
    printedPage: 382,
    body: 4, willpower: 3, reaction: 4, intuition: 3, initiativeDice: 1,
    notes: []
  },
  {
    id: "pr2-lieutenant",
    label: "PR 2 - Corporate Security (Lieutenant, wagemage)",
    kind: "lieutenant",
    professionalRating: 2,
    printedPage: 382,
    body: 3, willpower: 4, reaction: 4, intuition: 4, initiativeDice: 1,
    // X4 (withdrawn, RULINGS 2026-08-30): the block also prints "Astral
    // Initiative 8 + 3D6" (p. 382). Per Decision D-X2 that alt-Initiative
    // line is not imported at all - this template loads only the meat-track
    // Reaction/Intuition above, the same as every other block. A GM who
    // sends this lieutenant astral projecting gets the tracker's own
    // p. 314/160 astral-mode arithmetic (RULINGS 2026-08-30: 3D6 total),
    // which happens to match this particular printed line. That is not the
    // same claim as "the book is internally consistent" - it prints 2D6 in
    // three other places and 3D6 here, a genuine contradiction the book
    // never resolves. RULINGS.md 2026-08-30 is where that contradiction is
    // recorded and where Xavier's ruling for the 3D6/p. 314 reading lives;
    // no correctness claim about the book is made here either way.
    notes: []
  },

  // ── PR 3 - Police Patrols (p. 383) ──────────────────────────────────────
  {
    id: "pr3-grunt",
    label: "PR 3 - Police Patrols (Grunt)",
    kind: "grunt",
    professionalRating: 3,
    printedPage: 383,
    body: 4, willpower: 3, reaction: 4, intuition: 3, initiativeDice: 1,
    notes: []
  },
  {
    id: "pr3-lieutenant",
    label: "PR 3 - Police Patrols (Lieutenant)",
    kind: "lieutenant",
    professionalRating: 3,
    printedPage: 383,
    body: 4, willpower: 4, reaction: 4, intuition: 5, initiativeDice: 1,
    // I3: reaction enhancers 2 raise Reaction 4 -> 6 (Initiative 9 -> 11)
    // with NO extra Initiative die - the printed block shows both lines
    // ("9 + 1D6 (11 + 1D6)", p. 383), which is exactly what `augmented`
    // without `augmentedInitiativeDice` encodes.
    augmented: { reaction: 6 },
    notes: []
  },

  // ── PR 4 - Organized Crime Gang (p. 383) ────────────────────────────────
  {
    id: "pr4-grunt",
    label: "PR 4 - Organized Crime Gang (Grunt)",
    kind: "grunt",
    professionalRating: 4,
    printedPage: 383,
    body: 4, willpower: 4, reaction: 4, intuition: 4, initiativeDice: 1,
    notes: []
  },
  {
    id: "pr4-lieutenant",
    label: "PR 4 - Organized Crime Gang (Lieutenant, technomancer)",
    kind: "lieutenant",
    professionalRating: 4,
    printedPage: 383,
    body: 3, willpower: 5, reaction: 4, intuition: 5, initiativeDice: 1,
    // X2 (brief acceptance criterion 8): block prints Condition Monitor 10;
    // p. 379's formula (8 + ceil(max(3, 5) / 2)) gives 11. The formula wins
    // (RULINGS 2026-08-04) - this template derives 11, not the printed 10.
    // X5: the block also prints "Matrix Initiative 9 + 3D6 (Hot Sim)"
    // (p. 383); per Decision D-X2 that line is not imported - this template
    // loads only the meat-track Reaction/Intuition above. Fix round 2,
    // defect 6: the note previously miscalculated the formula value as
    // "9 + 4D6" - a technomancer's living persona Data Processing equals
    // Logic (5, printed p. 101, `rules/pages/p0103.txt`), so Data
    // Processing (5) + Intuition (5) is 10, not the printed Reaction+
    // Intuition attribute (9); Hot Sim is +4D6 (same page). Correct value
    // is 10 + 4D6.
    //
    // Data Processing follow-on (RULINGS 2026-08-30): this block is the one
    // printed statblock the rules actually derive a Data Processing value
    // for. His living persona takes Data Processing from Logic (printed
    // p. 251, restated p. 101); his block prints Logic 5 (p. 383) - so
    // `dataProcessing: 5` below, imported as a value for the first time
    // (see `GruntStatblock.dataProcessing`'s doc comment).
    dataProcessing: 5,
    notes: [
      "Block prints Condition Monitor 10; p. 379 formula gives 11 (8 + ceil(5/2)).",
      "Block prints Matrix Initiative 9 + 3D6 (Hot Sim); the p. 101/159 formula "
      + "gives 10 + 4D6 for Hot Sim (Data Processing 5 = Logic, + Intuition 5). "
      + "A living persona can only use AR or Hot Sim (p. 251) - Cold Sim is not "
      + "legally available to him even though the tracker still computes it "
      + "correctly (10 + 3D6) if selected."
    ]
  },

  // ── PR 5 - Elite Corporate Security (p. 384) ────────────────────────────
  {
    id: "pr5-grunt",
    label: "PR 5 - Elite Corporate Security (Grunt)",
    kind: "grunt",
    professionalRating: 5,
    printedPage: 384,
    body: 6, willpower: 4, reaction: 5, intuition: 5, initiativeDice: 3,
    // I3: wired reflexes 2 raises Reaction 5 -> 7 (Initiative 10 -> 12) with
    // the SAME 3D6, matching the printed "10 (12) + 3D6" line exactly
    // (brief acceptance criterion 11 spot check).
    augmented: { reaction: 7 },
    notes: []
  },
  {
    id: "pr5-lieutenant",
    label: "PR 5 - Elite Corporate Security (Lieutenant)",
    kind: "lieutenant",
    professionalRating: 5,
    printedPage: 384,
    body: 5, willpower: 5, reaction: 5, intuition: 5, initiativeDice: 3,
    // The block prints only the augmented Initiative line ("12 + 3D6",
    // p. 384) even though Reaction is bracketed (5 (7)) - base Reaction 5 +
    // Intuition 5 = 10 is the tracker's own "ware off" derivation, not a
    // printed alternative.
    augmented: { reaction: 7 },
    // Data Processing follow-on (RULINGS 2026-08-30): this block is a
    // decker, not a technomancer, so Data Processing comes off his cyberdeck
    // rather than an attribute - and the rules deliberately refuse to assign
    // a deck's array to particular attributes (p. 227). No `dataProcessing`
    // is stored here; the GM assigns one at the table from the array below.
    notes: [
      "Carries a Shiawase Cyber-5 cyberdeck: Device Rating 5, Attribute Array "
      + "8 7 6 5 (p. 227, p. 384). The array is deliberately unassigned by the "
      + "rules - Data Processing is whichever of 8/7/6/5 the GM assigns at "
      + "boot, and two values can be swapped again as a Free Action mid-fight "
      + "(p. 227, p. 228). No Data Processing is imported for this block."
    ]
  },

  // ── PR 6 - Elite Special Forces (p. 384) ────────────────────────────────
  {
    id: "pr6-grunt",
    label: "PR 6 - Elite Special Forces (Grunt)",
    kind: "grunt",
    professionalRating: 6,
    printedPage: 384,
    body: 6, willpower: 5, reaction: 5, intuition: 6, initiativeDice: 4,
    // X6: the block prints no Augmentations line despite Essence 2.3,
    // bracketed Agility/Reaction/Strength and 4 Initiative Dice (p. 384).
    // Carried as a note rather than invented gear (I13/D-X2: unmodelled).
    augmented: { reaction: 8 },
    notes: [ "Block prints no Augmentations line despite bracketed attributes and Ess 2.3 (p. 384, X6)." ]
  },
  {
    id: "pr6-lieutenant",
    label: "PR 6 - Elite Special Forces (Lieutenant, adept)",
    kind: "lieutenant",
    professionalRating: 6,
    printedPage: 384,
    body: 6, willpower: 5, reaction: 6, intuition: 6, initiativeDice: 4,
    // I4: this lieutenant's Reaction bracket (6 (9)) is the printed
    // POST-Improved-Reflexes-3 figure, not togglable cyberware - loading
    // `augmented` here is what the printed "15 + 4D6" line already reflects
    // (brief acceptance criterion 11 spot check), so no separate adept-power
    // bonus is layered on top of it.
    augmented: { reaction: 9 },
    notes: []
  }
];
