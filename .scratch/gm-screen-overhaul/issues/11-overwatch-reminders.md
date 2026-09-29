# 11: Overwatch reminders move into the Matrix panel

**What to build:** The "Overwatch owed" reminders move from above the
initiative list into the Matrix panel, each keeping its × to dismiss.
- While any are waiting, the Matrix button shows how many (for example
  "Matrix 2"), even with the Matrix panel closed.
- A reminder never opens the Matrix panel by itself.

See the spec, user stories 6, 54, 56.

**Blocked by:** 10

**Status:** ready-for-agent

- [ ] Reminders appear inside the Matrix panel and each can be dismissed as today
- [ ] The Matrix button shows the number waiting, and no number when there are none
- [ ] A new reminder does not open any panel
- [ ] No Overwatch reminder appears above the initiative list any more
- [ ] Every moved control does exactly what it did before (the spec's ground rule); at least one whole-GM-screen test proves it
- [ ] Existing tests that looked for these controls in their old places are updated, not deleted
- [ ] The full test run, the code-style check and the build all pass
- [ ] Checked by hand at laptop width (about 1366×768) and big-monitor width; the player view is unchanged
