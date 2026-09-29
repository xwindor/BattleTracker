# 04: Deck tab replaces the under-row Deck panel

**What to build:** The Deck row button opens the participant panel on a Deck
tab, instead of dropping a panel open under the row. The tab holds everything
the Deck panel has today:
- enable or remove deck, and the deck stats;
- AR / Cold Sim / Hot Sim;
- Jack In / Jack Out and Switch Mode;
- the VR and OS chips.

Every participant except a grunt group has the tab.

See the spec, user stories 18, 23, 32, 37.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] The Deck button opens the panel on the Deck tab; nothing opens under the row
- [ ] With no deck set up, the tab offers Enable deck, as today
- [ ] Every control of today's Deck panel is present in the tab and behaves as today
- [ ] Every moved control does exactly what it did before (the spec's ground rule); at least one whole-GM-screen test proves it
- [ ] Existing tests that looked for these controls in their old places are updated, not deleted
- [ ] The full test run, the code-style check and the build all pass
- [ ] Checked by hand at laptop width (about 1366×768) and big-monitor width; the player view is unchanged
