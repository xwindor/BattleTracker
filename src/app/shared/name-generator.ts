// Cyberpunk/Shadowrun-flavoured name generator (briefs/cyberpunk-name-generator-spec.md).
//
// Not a rules module: briefs/grunt-naming-and-statblocks-spec.md:45 (governing
// rule G14) records that there is no rule anywhere in the indexed pages
// governing how a GM labels an individual grunt. This file invents flavour
// text a GM could have typed themselves; nothing here derives from `rules/`.
//
// Pure data + pure functions, no Angular imports (per the spec's "New files"
// list) - same shape as `log-formatter.ts`'s `matrixChars`/`randomMatrixChar`,
// and the same injected-RNG convention as `Participant.changeDiceCount`
// (`newDices, rollDie?`), so a caller can seed a deterministic sequence in a
// test instead of asserting only on shape.
//
// Fixed, built-in corpus (Open Decision D4): no in-app editing, no
// persistence, nothing new on the wire. Editing the lists below is the
// escape hatch for a GM who wants different flavour.

/** Which corpus a generated name is drawn from. */
export type GeneratedNameKind =
  | "handle"   // a street handle / runner alias for one NPC
  | "crew"     // a gang, squad or grunt-group name
  | "host"     // a Matrix host
  | "device"   // a Matrix device icon
  | "file"     // a Matrix file icon
  | "persona"  // a Matrix persona icon
  | "ic";      // a Matrix IC icon

/**
 * A slot-filling template. Each entry in `slots` is looked up in
 * `WORD_LISTS`; anything that is not a known slot key is emitted as a
 * literal (e.g. a fixed separator word or punctuation baked into the
 * pattern itself).
 */
export interface NamePattern {
  readonly kind: GeneratedNameKind;
  readonly slots: readonly string[];
  /** Joiner between resolved slots. Default " ". */
  readonly join?: string;
  /** Relative selection weight within its kind. Default 1. */
  readonly weight?: number;
}

/**
 * The fixed corpus. Minimum sizes are asserted by
 * `name-generator.spec.ts` (brief acceptance criterion 3) so the corpus
 * cannot quietly shrink; see the spec's "Corpus format" table for the
 * per-slot minimums this file must keep meeting.
 */
export const WORD_LISTS: Readonly<Record<string, readonly string[]>> = {
  handleSolo: ["Ratchet", "Slug", "Nine-Volt", "Widget", "Cipher", "Glitch", "Vex", "Ghost",
    "Chrome", "Static", "Riptide", "Nova", "Echo", "Fuse", "Torque", "Vapor", "Shard", "Rook",
    "Talon", "Havoc", "Reef", "Ozone", "Splice", "Drift", "Marrow", "Ember", "Sable", "Ash",
    "Ronin", "Bishop", "Sprocket", "Junk", "Volt", "Kestrel", "Wraith", "Circuit", "Rattle",
    "Switch", "Bolt", "Grit", "Flare", "Piston", "Cinder", "Vellum", "Ratline", "Grind", "Fathom",
    "Locknut", "Warble", "Snap", "Ferrous", "Halide", "Umbra", "Quench", "Anneal", "Deadbolt",
    "Skiff", "Toggle", "Vantage", "Prowl", "Slink", "Cache", "Ratio", "Fizzgig", "Marker",
    "Dovetail", "Gasket", "Static-Cling", "Handshake", "Undertow"],
  handleAdjective: ["Cracked", "Redline", "Rusty", "Broken", "Iron", "Neon", "Silent", "Wired",
    "Feral", "Blunt", "Sharp", "Coldwave", "Static-Charged", "Burnt", "Hollow", "Chrome-Plated",
    "Twisted", "Faded", "Loose", "Tight", "Jagged", "Slick", "Wired-Up", "Blistered", "Bent",
    "Cracked-Open", "Livid", "Grimy", "Sable-Eyed", "Frayed", "Torqued", "Overclocked", "Fried",
    "Scarred", "Ashen", "Molten", "Copper", "Rustbound", "Wireframe", "Voltaic", "Errant", "Nomad",
    "Feral-Eyed", "Ghostly", "Solder-Burnt", "Static-Bound", "Hairline", "Dented", "Rattling",
    "Flickering", "Salvaged", "Corroded", "Off-Grid", "Backalley", "Downtown", "Underworld",
    "Blacklight", "Fluorescent", "Analog", "Digital", "Encoded", "Encrypted", "Firmware",
    "Hardwired", "Overdriven", "Shortfused", "Sparking", "Steel-Nerved", "Streetwise", "Undercut",
    "Vandalized", "Weathered", "Wireless", "Wound-Tight", "Zeroed-Out", "Dead-Eyed", "Downlow",
    "Hushed", "Jittery", "Livewire", "Nightshift", "Offbeat", "Rawboned", "Scrapyard", "Threadbare"],
  handleNoun: ["Halo", "Wire", "Vulture", "Fang", "Circuit", "Blade", "Hex", "Feedback", "Vector",
    "Cinderblock", "Rattlesnake", "Camshaft", "Gambit", "Cog", "Junction", "Torchbearer",
    "Fusewire", "Copperhead", "Ironclad", "Deadline", "Redwire", "Skyline", "Backflow",
    "Vantagepoint", "Backbone", "Gridlock", "Slagheap", "Sprocketwheel", "Wraithbone", "Nightowl",
    "Bloodhound", "Falcon", "Osprey", "Cobra", "Buzzard", "Scorpion", "Hawk", "Wolf", "Panther",
    "Viper", "Mongoose", "Raven", "Jackal", "Coyote", "Lynx", "Badger", "Weasel", "Ferret",
    "Marten", "Ocelot", "Serval", "Caracal", "Meerkat", "Mantis", "Locust", "Hornet", "Cicada",
    "Beetle", "Moth", "Firefly", "Dragonfly", "Wasp", "Spider", "Widow", "Reaper", "Specter",
    "Phantom", "Shade", "Wisp", "Cinderfield", "Kindling", "Smolder", "Char", "Soot", "Crackle",
    "Afterburn", "Depthcharge", "Shoal", "Backcurrent", "Sluiceway", "Backwash", "Vertigo", "Skew",
    "Kink", "Snarl", "Tangle", "Knot", "Junctionbox", "Weld", "Rivet", "Bracket", "Girder",
    "Truss", "Anchor", "Ballast", "Manifold", "Filament", "Conduit", "Bracer", "Flywheel"],
  crewAdjective: ["Ash", "Sable", "Broken", "Iron", "Crimson", "Rusted", "Silent", "Hollow",
    "Neon", "Feedback-Loop", "Copper", "Molten", "Wildbone", "Slagbound", "Nightshade", "Steel",
    "Chromeplate", "Wraithlit", "Bleak", "Umbral", "Grim", "Scavenged", "Fractured", "Amped",
    "Frostbitten", "Undercurrent", "Sidestreet", "Midtown", "Ultraviolet", "Motheaten", "Gaunt",
    "Windburnt", "Battered", "Pitted", "Unraveled", "Bentbone", "Deadlight", "Scrapheap",
    "Wireborn", "Undercroft", "Overspill", "Livewire", "Nullpoint", "Backdraft", "Cinderfall",
    "Ashfall", "Ironvein", "Coppervein", "Riggerline", "Blackwater"],
  crewPlural: ["Kings", "Boys", "Saints", "Cartel", "Wolves", "Reapers", "Vultures", "Serpents",
    "Hawks", "Rooks", "Ravens", "Jackals", "Coyotes", "Hyenas", "Vipers", "Scorpions", "Sharks",
    "Panthers", "Ghosts", "Wraiths", "Phantoms", "Specters", "Renegades", "Outlaws", "Rebels",
    "Marauders", "Raiders", "Rovers", "Nomads", "Drifters", "Runners", "Chasers", "Hunters",
    "Stalkers", "Watchers", "Guardians", "Sentinels", "Wardens", "Enforcers", "Breakers",
    "Wreckers", "Scrappers", "Salvagers", "Scavengers", "Prowlers", "Skulkers", "Lurkers",
    "Howlers", "Screamers", "Riders", "Racers", "Burners", "Sparkers", "Sizzlers", "Chromeheads",
    "Wireheads", "Overloaders", "Voltaics", "Overdrivers", "Ironsides"],
  // The last 10 entries (Zaibatsu - Freehold) are Open Decision D7's "small
  // set of setting-flavoured org words for `host` only": generic
  // megacorp/Sixth-World business vocabulary that reads as distinctly
  // Shadowrun-flavoured without naming any specific trademarked corp
  // ("Zaibatsu"/"Keiretsu" are real-world conglomerate terms Shadowrun
  // borrows generically, not proper nouns it owns). `handle`/`crew` are
  // untouched, per D7's recommendation and the brief's explicit restriction
  // to `host` only.
  hostOrg: ["Meridian", "Vertex", "Axiom", "Zenith", "Helix", "Praxis", "Cortex", "Halcyon",
    "Solace", "Bastion", "Overwatch", "Nexus", "Cascade", "Obsidian", "Nimbus", "Tessera",
    "Kinetic", "Ferrovax", "Chromatix", "Orbital", "Aegis", "Penumbra", "Pinnacle", "Steelframe",
    "Silvercrest", "Novacore", "Blackwell", "Vortex", "Aurora", "Concordant", "Terravex",
    "Stratum", "Lumen", "Solstice", "Fulcrum", "Quorum", "Emberlight", "Ashgrove", "Deltawave",
    "Trident", "Zaibatsu", "Keiretsu", "Sprawlgate", "Metroplex", "Undercity", "Syndicate",
    "Directorate", "Protectorate", "Corpzone", "Freehold"],
  hostFunction: ["Payroll", "Logistics", "Archive", "Security", "Research", "Compliance",
    "Personnel", "Manifest", "Records", "Distribution", "Fabrication", "Diagnostics",
    "Surveillance", "Provisioning", "Accounting", "Procurement", "Inventory", "Cartography",
    "Telemetry", "Custodial", "Registry", "Analytics", "Dispatch", "Insurance", "Actuarial",
    "Auditing", "Scheduling", "Materiel", "Clearance", "Onboarding"],
  hostSuffix: ["Cluster", "Grid", "Node", "Array", "Junction", "Core", "Vault", "Relay", "Lattice",
    "Hub", "Spire", "Redoubt"],
  deviceNoun: ["Maglock Controller", "Drone Rig", "Security Camera", "Vending Terminal",
    "Turret Controller", "Elevator Control", "Access Panel", "Printer Bridge", "Climate Node",
    "Fabrication Arm", "Forklift Rig", "Loading Crane", "Vault Door Actuator", "Smart Fridge",
    "Delivery Drone", "Sensor Array", "Alarm Panel", "HVAC Controller", "Lighting Rig",
    "Door Chime", "Coffee Kiosk", "Cargo Winch", "Assembly Robot", "Camera Drone",
    "Signal Booster", "Router Node", "Server Rack", "Firewall Appliance", "Badge Reader",
    "Turnstile Controller", "Sprinkler Node", "Generator Controller", "Elevator Bank",
    "Parking Gate", "Loudspeaker Rig", "Vending Drone", "Cleaning Bot", "Delivery Locker",
    "Cargo Drone", "Watchtower Rig"],
  fileStem: ["PAYROLL", "MANIFEST", "PERSONNEL", "LEDGER", "BLUEPRINT", "INVENTORY", "SCHEDULE",
    "CONTRACT", "DOSSIER", "TRANSCRIPT", "ROSTER", "INVOICE", "BACKUP", "ARCHIVE", "MEMO",
    "REPORT", "LOGFILE", "DIRECTORY", "REGISTRY", "AUDIT", "CLEARANCE", "SHIPMENT", "BLACKLIST",
    "WATCHLIST", "CASEFILE", "APPRAISAL", "DEPOSIT", "WITHDRAWAL", "TRANSFER", "ESTIMATE",
    "PROPOSAL", "AGENDA", "MINUTES", "CORRESPONDENCE", "DIRECTIVE", "BULLETIN", "CIRCULAR",
    "PROTOCOL", "SPECIFICATION", "BLUEBOOK"],
  fileExt: [".enc", ".sin", ".dat", ".bak", ".log", ".cfg", ".tmp", ".sec"],
  personaNoun: ["Sysop", "Night Auditor", "Ghostwriter", "Watchtower", "Front Desk", "Gatekeeper",
    "Archivist", "Dispatcher", "Concierge", "Overseer", "Custodian", "Registrar", "Notary",
    "Broker", "Adjuster", "Analyst", "Inspector", "Cartographer", "Courier", "Scribe", "Herald",
    "Chancellor", "Steward", "Curator", "Liaison", "Attache", "Envoy", "Proctor", "Examiner",
    "Assessor"],
  icNoun: ["Black Ice", "Patrol Daemon", "Watchdog", "Killer Frame", "Probe Ghost",
    "Sentinel Script", "Tarbaby", "Scramble IC", "Marker Wisp", "Acid Loop", "Binder Wraith",
    "Crash Daemon", "Jammer Sprite", "Sniffer Bot", "Trace Hound", "Nullware", "Deadman's Switch",
    "Static Sentry", "Ghost Warden", "Lockstep IC"]
};

/**
 * Patterns, grouped by `kind`. `generateName` filters this array by
 * `options.kind`, so order across kinds does not matter; order *within* a
 * kind only matters in that earlier entries are tried first when picking by
 * weight (see `pickPattern`).
 *
 * Combination counts (brief acceptance criterion 4): `handle` combines
 * `handleAdjective` x `handleNoun` (85 x 100 = 8,500) plus `handleSolo` (70)
 * alone, comfortably over the ≥5,000 target; `crew` combines
 * `crewAdjective` x `crewPlural` (50 x 60 = 3,000, ≥2,000); `host`
 * combines all three of `hostOrg` x `hostFunction` x `hostSuffix`
 * (50 x 30 x 12 = 18,000, ≥10,000 - `hostOrg` grew from 40 to 50 entries for
 * Open Decision D7's setting-flavoured additions).
 */
export const NAME_PATTERNS: readonly NamePattern[] = [
  { kind: "handle", slots: ["handleAdjective", "handleNoun"] },
  // Lower weight than the pattern above: handleSolo's own word list (70
  // entries) is far smaller than the 8,500 adjective x noun combinations, so
  // giving it equal weight would send roughly half of every draw through a
  // 70-way choice and collapse the aggregate distinct-name count well below
  // acceptance criterion 4's 400-of-500 target (measured: ~320). Weighting
  // it down keeps solo handles ("Ratchet", "Vex") in the mix as an
  // occasional flavour without dominating the sample.
  { kind: "handle", slots: ["handleSolo"], weight: 0.15 },
  { kind: "crew", slots: ["crewAdjective", "crewPlural"] },
  { kind: "host", slots: ["hostOrg", "hostFunction", "hostSuffix"] },
  { kind: "device", slots: ["deviceNoun"] },
  // No join between stem and extension: WORD_LISTS.fileExt entries already
  // carry their own leading "." (e.g. ".enc"), so "PAYROLL" + ".enc" ->
  // "PAYROLL.enc".
  { kind: "file", slots: ["fileStem", "fileExt"], join: "" },
  { kind: "persona", slots: ["personaNoun"] },
  { kind: "ic", slots: ["icNoun"] }
];

/** Options for `generateName`. */
export interface GenerateNameOptions {
  readonly kind: GeneratedNameKind;
  /** Names already in use. Compared case-insensitively after trimming. */
  readonly taken?: Iterable<string>;
  /** Injected for determinism in tests. Defaults to Math.random. */
  readonly random?: () => number;
}

/**
 * Attempts before falling back to a numeric suffix (brief "Dedup
 * algorithm"). Generous enough that a corpus this size essentially never
 * exhausts it in ordinary play; AC 6 exercises the exhaustion path directly.
 */
export const GENERATE_NAME_MAX_ATTEMPTS = 40;

/** Normalised form used for every collision check here. Trim + lowercase. */
export function normaliseNameForComparison(name: string): string {
  return name.trim().toLowerCase();
}

function resolveSlot(slot: string, random: () => number): string {
  const list = WORD_LISTS[slot];
  if (!list || list.length === 0) {
    // Not a known slot key: emitted as a literal, per the `NamePattern` doc
    // comment. No pattern in `NAME_PATTERNS` currently relies on this, but
    // the module API promises it.
    return slot;
  }
  return list[Math.floor(random() * list.length)];
}

function fillPattern(pattern: NamePattern, random: () => number): string {
  const parts = pattern.slots.map(slot => resolveSlot(slot, random));
  return parts.join(pattern.join ?? " ").trim();
}

function patternsForKind(kind: GeneratedNameKind): NamePattern[] {
  return NAME_PATTERNS.filter(p => p.kind === kind);
}

/** Weighted pick among `patterns`. A pattern with no explicit `weight` defaults to 1 (see the `handleSolo` pattern above for an explicit override). */
function pickPattern(patterns: readonly NamePattern[], random: () => number): NamePattern {
  const totalWeight = patterns.reduce((sum, p) => sum + (p.weight ?? 1), 0);
  let roll = random() * totalWeight;
  for (const pattern of patterns) {
    roll -= pattern.weight ?? 1;
    if (roll <= 0) {
      return pattern;
    }
  }
  // Floating-point rounding only: falls through here when `roll` never quite
  // reaches <= 0 on the last iteration.
  return patterns[patterns.length - 1];
}

/**
 * Every combination `pattern` can produce, in a fixed deterministic order
 * (odometer over its slots' word-list indices), stopping at the first one
 * whose normalised form is not in `takenSet`. `null` if every combination the
 * pattern can produce is already taken.
 *
 * Used only as the fallback-round scan below - not by the main randomised
 * loop, which stays exactly as fast and as random as before for the
 * overwhelming common case where an untaken candidate turns up in the first
 * attempt or two.
 */
function firstUntakenForPattern(pattern: NamePattern, takenSet: ReadonlySet<string>): string | null {
  const lists = pattern.slots.map(slot => {
    const list = WORD_LISTS[slot];
    return list && list.length > 0 ? list : [slot];
  });
  const total = lists.reduce((product, list) => product * list.length, 1);
  const indices = new Array(lists.length).fill(0);
  for (let n = 0; n < total; n++) {
    const words = lists.map((list, i) => list[indices[i]]);
    const candidate = words.join(pattern.join ?? " ").trim();
    if (!takenSet.has(normaliseNameForComparison(candidate))) {
      return candidate;
    }
    for (let i = indices.length - 1; i >= 0; i--) {
      indices[i]++;
      if (indices[i] < lists[i].length) {
        break;
      }
      indices[i] = 0;
    }
  }
  return null;
}

/**
 * The first untaken candidate any of `patterns` can produce, trying each
 * pattern in order. `null` only when `kind`'s entire corpus - every pattern,
 * every combination - is already in `takenSet`.
 */
function firstUntakenCandidate(patterns: readonly NamePattern[], takenSet: ReadonlySet<string>): string | null {
  for (const pattern of patterns) {
    const candidate = firstUntakenForPattern(pattern, takenSet);
    if (candidate !== null) {
      return candidate;
    }
  }
  return null;
}

/**
 * One name of `kind`, not present in `taken`.
 *
 * Dedup algorithm (brief "Proposed approach", extended by defect 6 of the
 * validator round to close a real gap the brief's version left open):
 *  1. Normalise `taken` into a `Set<string>` once.
 *  2. Up to `GENERATE_NAME_MAX_ATTEMPTS` times: pick a pattern for `kind` by
 *     weight, fill its slots, return the first candidate whose normalised
 *     form is not in the set.
 *  3. If every randomised attempt collided, do a deterministic exhaustive
 *     scan of `kind`'s whole corpus (`firstUntakenCandidate`) before giving
 *     up. This step only ever changes the outcome when the corpus is *not*
 *     actually exhausted but the randomised attempts kept colliding anyway
 *     (defect 6: an unlucky - or, in a test, adversarial - random sequence
 *     must not fall through to step 4 and staple a number onto an
 *     already-taken name, e.g. a player character's, while a genuinely
 *     different name is still sitting unused elsewhere in the corpus). Cheap
 *     even for the largest corpus (`host`, tens of thousands of
 *     combinations - well inside the 100ms budget acceptance criterion 6
 *     enforces, and already exercised at thousands of combinations by
 *     `src/scenarios/cyberpunk-name-generator.spec.ts`'s NS2).
 *  4. Only once step 3 also finds nothing free - the corpus has truly
 *     produced every combination it can and all of them are taken (brief
 *     acceptance criterion 6's exhaustion case) - take the last randomised
 *     candidate and append " 2", " 3", ... until free. This can never loop
 *     forever: the suffix space is unbounded. In this step, and only this
 *     step, the stem can coincide with an existing name (nothing else is
 *     left to build a name out of); see this function's own limits note.
 */
export function generateName(options: GenerateNameOptions): string {
  const { kind, taken, random = Math.random } = options;
  const takenSet = new Set<string>();
  if (taken) {
    for (const name of taken) {
      takenSet.add(normaliseNameForComparison(name));
    }
  }

  const patterns = patternsForKind(kind);
  let lastCandidate = "";
  for (let attempt = 0; attempt < GENERATE_NAME_MAX_ATTEMPTS; attempt++) {
    const pattern = pickPattern(patterns, random);
    const candidate = fillPattern(pattern, random);
    lastCandidate = candidate;
    if (!takenSet.has(normaliseNameForComparison(candidate))) {
      return candidate;
    }
  }

  const freshCandidate = firstUntakenCandidate(patterns, takenSet);
  if (freshCandidate !== null) {
    return freshCandidate;
  }

  // The corpus really is exhausted: every combination `kind`'s patterns can
  // produce is already in `takenSet`, so there is nothing to build a fresh
  // stem out of. Known, accepted limit: if a taken name (e.g. a player
  // character's) happens to equal one of the corpus's own fixed words, and
  // the corpus is fully exhausted, the suffixed result can still coincide
  // with it - there is no other word left to use as the stem.
  let suffix = 2;
  let fallback = `${lastCandidate} ${suffix}`;
  while (takenSet.has(normaliseNameForComparison(fallback))) {
    suffix++;
    fallback = `${lastCandidate} ${suffix}`;
  }
  return fallback;
}

// A batch-generation helper (`generateNames(count, options)`) used to live
// here. Removed (defect 12, second validator round): every real call site in
// this app - the Add dialog, the row-member box, and both Matrix suggest
// buttons - generates exactly one name per button press, folding each result
// into its own `taken` set before the next press (see `generateDraftNameWith`/
// `generateRowMemberName` in `battle-tracker.component.ts`, and
// `suggestHostName`/`suggestTargetName` in `hierarchy-editor.component.ts`).
// Nothing in the app ever needed "N distinct names in one call", so the
// function was fully-implemented dead code with no production consumer.
// Removed rather than inventing a feature to justify keeping it, per the
// brief's own instruction; see `briefs/cyberpunk-name-generator-spec.md`'s
// amended "Module API" section. The same batch-distinctness guarantee this
// used to provide is still exercised - by accumulation across repeated
// `generateName()` calls - in `src/app/shared/name-generator.spec.ts` and in
// the scenario spec's NS4.
