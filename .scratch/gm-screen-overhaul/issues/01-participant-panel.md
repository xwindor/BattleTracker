# 01: Participant panel with Condition and Stats

**What to build:** Clicking a participant's name in the initiative list opens
the participant panel on the right, showing their Condition and Stats tabs. It
replaces today's details column.
- The list narrows beside the panel instead of being covered, so Act and Delay
  stay usable.
- Clicking empty space on a row only highlights it.
- The panel's × closes it.
- Edge, Reaction, Intuition and Initiative Dice leave the row and live in the
  Stats tab.
- A grunt group's panel has no Condition tab.

See the spec, user stories 22, 24, 31, 33–36, 40–42.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Clicking a name opens that participant's panel; clicking elsewhere on the row highlights the row and opens nothing
- [ ] The panel shows whose it is, and has Condition and Stats tabs (a grunt group: Stats only, until ticket 06 adds Group)
- [ ] The Condition tab behaves exactly as today's Condition Monitor, both for characters and for grunts (DV, Physical, Stun, Heal, Body, Willpower)
- [ ] The Stats tab holds Edge, Reaction, Intuition and Initiative Dice (no longer on the row), plus every stat the details column had
- [ ] The × closes the panel; while it's open, the list stays clickable beside it
- [ ] The panel stays on the participant you opened when the turn moves on
- [ ] Today's details column is gone
- [ ] Every moved control does exactly what it did before (the spec's ground rule); at least one whole-GM-screen test proves it
- [ ] Existing tests that looked for these controls in their old places are updated, not deleted
- [ ] The full test run, the code-style check and the build all pass
- [ ] Checked by hand at laptop width (about 1366×768) and big-monitor width; the player view is unchanged
