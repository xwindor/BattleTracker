# 13: Warning area

**What to build:** The roll and turn warning lines stack in one warning area
directly under the top bar:
- the pass ending while a roll is owed;
- nobody able to act;
- roll status;
- why the Act window closed.

The warning area takes no space when there's nothing to show.

See the spec, user stories 7–8.

**Blocked by:** 12

**Status:** ready-for-agent

- [ ] Each of the four warning lines appears in the warning area under exactly the conditions it does today
- [ ] With no warnings, the area takes no space
- [ ] Share errors and the connection-lost warning still show as today
- [ ] Every moved control does exactly what it did before (the spec's ground rule); at least one whole-GM-screen test proves it
- [ ] Existing tests that looked for these controls in their old places are updated, not deleted
- [ ] The full test run, the code-style check and the build all pass
- [ ] Checked by hand at laptop width (about 1366×768) and big-monitor width; the player view is unchanged
