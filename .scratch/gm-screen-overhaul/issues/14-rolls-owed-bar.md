# 14: Rolls-owed bar

**What to build:** The between-turns Prep card and the mid-combat Pending Rolls
card become one rolls-owed bar above the initiative list.
- It appears whenever any participant still owes an Initiative roll.
- It says how many are owed, who, and who has been asked.
- It carries Request player rolls, Roll remaining NPCs and Force roll
  outstanding, plus Begin Combat Turn only between turns.
- It disappears when nobody owes a roll.

See the spec, user stories 9–13.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] One bar shows between turns and mid-turn whenever a roll is owed, and never otherwise
- [ ] Counts, owed names and asked names match what today's two cards show
- [ ] Its buttons do what the two cards' buttons do today; Begin Combat Turn appears only between turns
- [ ] The two initiative-rolling tests that find the Prep card as "the first card on the page" find the bar by a stable handle instead
- [ ] Every moved control does exactly what it did before (the spec's ground rule); at least one whole-GM-screen test proves it
- [ ] Existing tests that looked for these controls in their old places are updated, not deleted
- [ ] The full test run, the code-style check and the build all pass
- [ ] Checked by hand at laptop width (about 1366×768) and big-monitor width; the player view is unchanged
