import { CombatManager } from 'Combat';
import { Participant } from 'Combat/Participants/Participant';

// Helpers
function makeParticipant(name: string): Participant {
  const p = new Participant();
  p.name = name;
  return p;
}

describe('CombatManager.copyParticipant', () => {
  beforeEach(() => {
    CombatManager.participants.clear(false);
    CombatManager.nextSortOrder = 0;
  });

  it('duplicating "Razor" renames source to "Razor 1" and creates "Razor 2"', () => {
    const p = makeParticipant('Razor');
    CombatManager.participants.insert(p, false);

    CombatManager.copyParticipant(p);

    const names = CombatManager.participants.items.map(x => x.name);
    expect(names).toContain('Razor 1');
    expect(names).toContain('Razor 2');
    expect(names.length).toBe(2);
  });

  it('duplicating "Razor 1" when "Razor 2" already exists creates "Razor 3"', () => {
    const p1 = makeParticipant('Razor 1');
    const p2 = makeParticipant('Razor 2');
    CombatManager.participants.insert(p1, false);
    CombatManager.participants.insert(p2, false);

    CombatManager.copyParticipant(p1);

    const names = CombatManager.participants.items.map(x => x.name);
    expect(names).toContain('Razor 3');
    expect(p1.name).toBe('Razor 1');
    expect(names.length).toBe(3);
  });

  it('does not throw for a name containing "." (e.g. "Razor.io Hacker")', () => {
    const p = makeParticipant('Razor.io Hacker');
    CombatManager.participants.insert(p, false);

    expect(() => CombatManager.copyParticipant(p)).not.toThrow();
    const names = CombatManager.participants.items.map(x => x.name);
    expect(names).toContain('Razor.io Hacker 1');
    expect(names).toContain('Razor.io Hacker 2');
  });

  it('does not throw for a name containing parentheses (e.g. "Lone Star (Officer)")', () => {
    const p = makeParticipant('Lone Star (Officer)');
    CombatManager.participants.insert(p, false);

    expect(() => CombatManager.copyParticipant(p)).not.toThrow();
    const names = CombatManager.participants.items.map(x => x.name);
    expect(names).toContain('Lone Star (Officer) 1');
    expect(names).toContain('Lone Star (Officer) 2');
  });

  it('"Troll" and "Trollkin Boss" are not treated as related', () => {
    const troll = makeParticipant('Troll');
    const trollkin = makeParticipant('Trollkin Boss 3');
    CombatManager.participants.insert(troll, false);
    CombatManager.participants.insert(trollkin, false);

    CombatManager.copyParticipant(troll);

    const names = CombatManager.participants.items.map(x => x.name);
    expect(names).toContain('Troll 1');
    expect(names).toContain('Troll 2');
    expect(names).not.toContain('Troll 4');
  });
});
