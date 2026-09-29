# 05: Awakened tab replaces the under-row Awakened panel

**What to build:** The Awakened row button opens the participant panel on an
Awakened tab, instead of dropping a panel open under the row. The tab holds
everything the Awakened panel has today:
- enable or remove Awakened;
- astral project / return to body.

Every participant except a grunt group has the tab.

See the spec, user stories 18, 23, 32, 38.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] The Awakened button opens the panel on the Awakened tab; nothing opens under the row
- [ ] Not set up as Awakened: the tab offers Enable Awakened, as today
- [ ] Astral project and return to body behave as today
- [ ] The tab is named "Awakened" everywhere (never "Magic")
- [ ] Every moved control does exactly what it did before (the spec's ground rule); at least one whole-GM-screen test proves it
- [ ] Existing tests that looked for these controls in their old places are updated, not deleted
- [ ] The full test run, the code-style check and the build all pass
- [ ] Checked by hand at laptop width (about 1366×768) and big-monitor width; the player view is unchanged
