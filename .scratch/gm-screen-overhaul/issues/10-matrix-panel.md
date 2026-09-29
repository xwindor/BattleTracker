# 10: Matrix panel in the right-hand slot

**What to build:** The Matrix button opens the Matrix panel from the right,
wide enough to cover most of the screen, with a strip of the initiative list
still visible.
- It holds the existing Matrix run panel, unchanged.
- It shares one slot with the participant panel: opening either one closes
  the other.
- Its × and Escape close it.
- A refresh reopens it if it was open.
- Today's "Show Matrix panel" toggle above the list is gone.

See the spec, user stories 51–53, 55, 57, 62.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] The Matrix button opens the wide Matrix panel; a strip of the list stays visible and clickable
- [ ] Clicking a name while it's open swaps to that participant's panel; the Matrix button swaps back
- [ ] × and Escape close it
- [ ] Building the screen again on the same browser storage reopens it
- [ ] Everything inside the Matrix run panel behaves as today
- [ ] Nothing about the Matrix opens above the initiative list any more
- [ ] Every moved control does exactly what it did before (the spec's ground rule); at least one whole-GM-screen test proves it
- [ ] Existing tests that looked for these controls in their old places are updated, not deleted
- [ ] The full test run, the code-style check and the build all pass
- [ ] Checked by hand at laptop width (about 1366×768) and big-monitor width; the player view is unchanged
