// Unit tests for briefs/cyberpunk-name-generator-spec.md's generator module.
// Acceptance criteria 1-7 (the "generator module" half of the brief's
// acceptance criteria list). GM-component and Matrix-wiring criteria (8-22)
// live in src/scenarios/cyberpunk-name-generator.spec.ts.

import {
  GENERATE_NAME_MAX_ATTEMPTS,
  GeneratedNameKind,
  NAME_PATTERNS,
  WORD_LISTS,
  generateName,
  normaliseNameForComparison
} from './name-generator';

/** Every `GeneratedNameKind` value, exhaustively, so a future 9th kind is a
 * visible gap in this list rather than a silently-uncovered one. */
const ALL_KINDS: GeneratedNameKind[] = [
  'handle', 'crew', 'host', 'device', 'file', 'persona', 'ic'
];

/** Minimum corpus sizes from the brief's "Corpus format" table. */
const MIN_LIST_SIZES: Record<string, number> = {
  handleSolo: 60,
  handleAdjective: 80,
  handleNoun: 100,
  crewAdjective: 50,
  crewPlural: 60,
  hostOrg: 40,
  hostFunction: 30,
  hostSuffix: 12,
  deviceNoun: 40,
  fileStem: 40,
  fileExt: 8,
  personaNoun: 30,
  icNoun: 20
};

/**
 * A fixed-seed, deterministic PRNG (mulberry32), for tests that need a large
 * volume of varied output rather than a hand-picked short sequence. Not
 * exported from `name-generator.ts` - this is test-only infrastructure, the
 * same role `seededSequenceProducing` plays in the scenario spec.
 */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random-like function that replays a fixed sequence of values, cycling. */
function sequenceRandom(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('name-generator: generateName', () => {

  it('AC1: returns a non-empty, untrimmed-clean string for every GeneratedNameKind', () => {
    const random = mulberry32(1);
    for (const kind of ALL_KINDS) {
      const name = generateName({ kind, random });
      expect(name.length).toBeGreaterThan(0);
      expect(name.trim()).toBe(name);
    }
  });

  it('AC2: is deterministic for a fixed injected random sequence', () => {
    const sequence = [0.05, 0.91, 0.42, 0.13, 0.77, 0.6, 0.28, 0.5];
    const first = generateName({ kind: 'handle', random: sequenceRandom([...sequence]) });
    const second = generateName({ kind: 'handle', random: sequenceRandom([...sequence]) });
    expect(second).toBe(first);
  });

  it('AC3: every NAME_PATTERNS slot key exists in WORD_LISTS, and every list meets its minimum size', () => {
    const knownSlots = new Set(Object.keys(WORD_LISTS));
    for (const pattern of NAME_PATTERNS) {
      for (const slot of pattern.slots) {
        expect(knownSlots.has(slot)).toBeTrue();
      }
    }
    for (const [slot, minSize] of Object.entries(MIN_LIST_SIZES)) {
      expect(WORD_LISTS[slot]).withContext(`WORD_LISTS.${slot}`).toBeDefined();
      expect(WORD_LISTS[slot].length)
        .withContext(`WORD_LISTS.${slot} (min ${minSize})`)
        .toBeGreaterThanOrEqual(minSize);
    }
  });

  it('AC4: 500 draws with an empty taken set yield at least 400 distinct names, for handle/crew/host', () => {
    for (const kind of ['handle', 'crew', 'host'] as GeneratedNameKind[]) {
      const random = mulberry32(42);
      const names = new Set<string>();
      for (let i = 0; i < 500; i++) {
        names.add(normaliseNameForComparison(generateName({ kind, random })));
      }
      expect(names.size).withContext(kind).toBeGreaterThanOrEqual(400);
    }
  });

  it('AC5: never returns a name already in a 200-entry taken set', () => {
    const random = mulberry32(7);
    const taken = new Set<string>();
    while (taken.size < 200) {
      taken.add(normaliseNameForComparison(generateName({ kind: 'handle', random })));
    }
    for (let i = 0; i < 50; i++) {
      const name = generateName({ kind: 'handle', random, taken });
      expect(taken.has(normaliseNameForComparison(name))).toBeFalse();
    }
  });

  it('AC6: terminates within 100ms via numeric-suffix fallback when every candidate is taken', () => {
    // 'ic' has exactly one single-slot pattern over a 20-entry list - small
    // enough to exhaust completely by construction rather than by luck.
    const taken = new Set(WORD_LISTS['icNoun'].map(normaliseNameForComparison));
    const random = mulberry32(99);
    const t0 = performance.now();
    const name = generateName({ kind: 'ic', random, taken });
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(100);
    expect(taken.has(normaliseNameForComparison(name))).toBeFalse();
    expect(name).toMatch(/ \d+$/);
  });

  it('GENERATE_NAME_MAX_ATTEMPTS is a small, named constant (not a bare literal in game logic)', () => {
    expect(GENERATE_NAME_MAX_ATTEMPTS).toBe(40);
  });

  it('defect 6 (validator round): never staples a suffix onto an already-taken stem while a genuinely different name is still available', () => {
    // A degenerate injected random: every call returns 0, so pickPattern
    // always selects the same ('handleAdjective' + 'handleNoun') pattern and
    // every slot draw always lands on index 0 - the same single candidate,
    // on every one of the 40 randomised attempts. Real Math.random essentially
    // never behaves this way (that's the whole point of "random"), but this
    // is exactly the worst case the fallback has to survive: 'handle' has
    // thousands of untaken combinations sitting unused, so collapsing to
    // "<the one taken candidate> 2" would be wrong even though it would
    // satisfy a same-repeated-candidate loop.
    const degenerate = () => 0;
    const stem = `${WORD_LISTS['handleAdjective'][0]} ${WORD_LISTS['handleNoun'][0]}`;
    const taken = new Set([normaliseNameForComparison(stem)]);

    const name = generateName({ kind: 'handle', random: degenerate, taken });

    expect(normaliseNameForComparison(name)).not.toBe(normaliseNameForComparison(stem));
    expect(name).not.toMatch(new RegExp(`^${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\d+$`, 'i'));
  });

  // AC 7 (amended, defect 12, second validator round): the brief's
  // batch-generation helper (`generateNames(count, options)`) had no
  // production consumer anywhere in the app - every real call site
  // generates one name per button press - and was removed rather than kept
  // as dead code (see `name-generator.ts`'s removal note). This test now
  // exercises the same guarantee the REAL call sites rely on: each
  // `generateName()` result folded into the caller's own `taken` set before
  // the next call, exactly as `generateDraftNameWith()`/
  // `generateRowMemberName()` (`battle-tracker.component.ts`) and
  // `suggestHostName()`/`suggestTargetName()` (`hierarchy-editor.component.ts`)
  // all do.
  it('AC7: repeated generateName() calls, each folded into the next call\'s taken set, stay mutually distinct', () => {
    const random = mulberry32(3);
    const taken = new Set(['Redline Halo', 'Ash Kings']);
    const names: string[] = [];
    for (let i = 0; i < 6; i++) {
      const name = generateName({ kind: 'crew', random, taken });
      names.push(name);
      taken.add(normaliseNameForComparison(name));
    }
    expect(names.length).toBe(6);
    const normalised = names.map(normaliseNameForComparison);
    expect(new Set(normalised).size).toBe(6);
    expect(normalised).not.toContain(normaliseNameForComparison('Redline Halo'));
    expect(normalised).not.toContain(normaliseNameForComparison('Ash Kings'));
  });

  it('normaliseNameForComparison trims and lowercases', () => {
    expect(normaliseNameForComparison('  Torch ')).toBe('torch');
    expect(normaliseNameForComparison('Torch')).toBe(normaliseNameForComparison('torch'));
  });

  it('generated names never collide with the tracker\'s own default-name namespaces', () => {
    // Mirrors AC 11 (component-level), checked here against a large sample
    // straight out of the corpus rather than through the component.
    const random = mulberry32(11);
    const forbidden = [/^Grunt \d+$/, /^Grunt Group( \d+)?$/, /^NPC \d+$/, /^Combatant \d+$/];
    for (const kind of ALL_KINDS) {
      for (let i = 0; i < 200; i++) {
        const name = generateName({ kind, random });
        for (const pattern of forbidden) {
          expect(name).not.toMatch(pattern);
        }
      }
    }
  });
});
