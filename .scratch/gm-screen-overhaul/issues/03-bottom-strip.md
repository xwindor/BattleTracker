# 03: Bottom strip: log and dice pinned, collapsible

**What to build:** The action log and the dice roller sit in the bottom strip,
which stays at the bottom of the screen and never scrolls away. The dice roller
comes with Roll as and the GM-rolls visible/hidden toggles.
- A click shrinks the strip to one line showing the latest log entry, and
  another click expands it.
- The choice is remembered after a refresh.
- The log and roller behave exactly as today.

See the spec, user stories 58–61, 63, 65.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Log and dice roller are always visible along the bottom, whatever the length of the initiative list
- [ ] Shrink collapses the strip to one line with the latest log entry; expand brings it back
- [ ] The collapsed or expanded choice survives building the screen again on the same browser storage; blocked storage means expanded
- [ ] Shared-log badges, + narration, the retained-hidden banner, Roll as and the visibility toggles all work as today
- [ ] The remembering is shared with the participant panel's (whichever of 02 and 03 lands first builds it)
- [ ] Every moved control does exactly what it did before (the spec's ground rule); at least one whole-GM-screen test proves it
- [ ] Existing tests that looked for these controls in their old places are updated, not deleted
- [ ] The full test run, the code-style check and the build all pass
- [ ] Checked by hand at laptop width (about 1366×768) and big-monitor width; the player view is unchanged
