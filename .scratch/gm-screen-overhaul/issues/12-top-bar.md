# 12: Top bar

**What to build:** One top bar holds:
- the round status (Combat Turn, Initiative Pass, current Initiative);
- the round buttons;
- the Matrix button;
- the room code and Copy player link;
- a room menu (⋯) holding Join another room, Close room and End room.

The top bar replaces today's session bar and the combat status line below the
list.

See the spec, user stories 1–5.

**Blocked by:** 10

**Status:** ready-for-agent

- [ ] Round status is always visible at the top, including between turns
- [ ] Start, Next Initiative Pass / End Combat Turn and End Combat are in the top bar and behave as today
- [ ] The room code and Copy player link show when a room is open; Create and Join are reachable when none is
- [ ] Close room and End room sit in the room menu and behave as today
- [ ] The old status line below the list is gone
- [ ] Every moved control does exactly what it did before (the spec's ground rule); at least one whole-GM-screen test proves it
- [ ] Existing tests that looked for these controls in their old places are updated, not deleted
- [ ] The full test run, the code-style check and the build all pass
- [ ] Checked by hand at laptop width (about 1366×768) and big-monitor width; the player view is unchanged
