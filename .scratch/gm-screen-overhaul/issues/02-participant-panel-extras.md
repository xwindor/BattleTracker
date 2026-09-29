# 02: Participant panel: Escape, open on add, close on delete, remember after refresh

**What to build:**
- Escape closes the participant panel.
- Adding a character or grunt opens their panel on the Stats tab.
- Deleting the participant whose panel is open closes it, while Leave combat
  keeps it open.
- After a refresh, the same participant's panel reopens on the same tab. If
  that participant no longer exists, or the browser won't store anything, the
  panel simply starts closed, with no message.

See the spec, user stories 40, 43–45, 62, 64, 65.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Escape closes an open participant panel
- [ ] Adding a character or grunt opens their panel on Stats
- [ ] Deleting the open participant closes the panel; Leave combat does not
- [ ] Building the GM screen again on the same browser storage reopens the same participant and tab
- [ ] A remembered participant who's gone leaves the panel closed, with no message
- [ ] Storage that is blocked or throws means "nothing open", and the app works normally
- [ ] The remembering is written so the bottom strip (03) and the Matrix panel (10) can reuse it
- [ ] Every moved control does exactly what it did before (the spec's ground rule); at least one whole-GM-screen test proves it
- [ ] Existing tests that looked for these controls in their old places are updated, not deleted
- [ ] The full test run, the code-style check and the build all pass
- [ ] Checked by hand at laptop width (about 1366×768) and big-monitor width; the player view is unchanged
