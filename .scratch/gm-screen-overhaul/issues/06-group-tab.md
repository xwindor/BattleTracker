# 06: Group tab replaces the under-row grunt group panel

**What to build:** A grunt group's Group button opens the participant panel on
a Group tab, instead of dropping the members panel open under the row. The tab
holds everything that panel has today:
- each member's Act/Acted, name and name suggestion;
- each member's Body, Willpower and Condition Monitor;
- each member's DV with Physical, Stun and Heal;
- each member's Detach and Remove;
- Add NPC.

A grunt group's panel has exactly two tabs: Group and Stats.

See the spec, user stories 18, 23, 32, 34, 39.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] The Group button opens the panel on the Group tab; nothing opens under the row
- [ ] A grunt group's panel shows Group and Stats only
- [ ] Every member control behaves as today, including a member's Act only when the group is up
- [ ] Every moved control does exactly what it did before (the spec's ground rule); at least one whole-GM-screen test proves it
- [ ] Existing tests that looked for these controls in their old places are updated, not deleted
- [ ] The full test run, the code-style check and the build all pass
- [ ] Checked by hand at laptop width (about 1366×768) and big-monitor width; the player view is unchanged
