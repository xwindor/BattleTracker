# 07: Status tags beside the name

**What to build:** Two kinds of tag move from a second line under the row to
small tags beside the participant's name, next to the GROUP, GRUNT or
LIEUTENANT badge:
- the Interrupt Actions taken this turn;
- "Astral projecting".

The row no longer grows a second line for them.

See the spec, user story 19.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Each Interrupt Action taken this turn shows as a tag beside the name, as it does today under the row
- [ ] "Astral projecting" shows as a tag beside the name while projecting
- [ ] No second line appears under a row for these
- [ ] Several tags wrap neatly at laptop width without pushing the row's buttons off
- [ ] Every moved control does exactly what it did before (the spec's ground rule); at least one whole-GM-screen test proves it
- [ ] Existing tests that looked for these controls in their old places are updated, not deleted
- [ ] The full test run, the code-style check and the build all pass
- [ ] Checked by hand at laptop width (about 1366×768) and big-monitor width; the player view is unchanged
