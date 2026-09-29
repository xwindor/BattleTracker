# 08: Row menu

**What to build:** Each row gets a row menu (⋯) holding these items, which
leave the row:
- Seize the Initiative, offered only when today's rules allow it (so never
  before the participant has rolled);
- Duplicate;
- Enter/Leave combat;
- the player-claim setting;
- Delete, which asks for confirmation exactly as today.

The Claimed / release-claim button stays on the row.

See the spec, user stories 20, 25–30.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Every row has a row menu with Duplicate, Enter/Leave combat, the claim setting and Delete
- [ ] Seize the Initiative appears in the menu exactly when today's Seize button would appear, and does what it does today
- [ ] Delete asks for confirmation as today
- [ ] Duplicate, Enter/Leave, Seize, the claim setting and Delete no longer sit on the row; release-claim still does
- [ ] Picking an item closes the menu
- [ ] Every moved control does exactly what it did before (the spec's ground rule); at least one whole-GM-screen test proves it
- [ ] Existing tests that looked for these controls in their old places are updated, not deleted
- [ ] The full test run, the code-style check and the build all pass
- [ ] Checked by hand at laptop width (about 1366×768) and big-monitor width; the player view is unchanged
