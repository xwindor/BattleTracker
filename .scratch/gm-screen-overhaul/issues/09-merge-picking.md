# 09: Merging grunts starts from the row menu

**What to build:** This is the one named exception to the spec's ground rule.
A lone grunt's row menu offers "Merge into a group…". Choosing it starts
picking:
- tick boxes appear only on lone grunts, with the grunt you started from
  already ticked;
- a bar at the top of the list reads "Merge N into a Grunt Group", with
  Cancel;
- merging or cancelling ends the picking, and the tick boxes disappear.

At other times, no tick boxes sit on grunt rows. The merge itself works
exactly as today.

See the spec, user stories 46–50.

**Blocked by:** 08

**Status:** ready-for-agent

- [ ] "Merge into a group…" appears only in a lone grunt's row menu
- [ ] Picking shows tick boxes only on lone grunts, with the starting grunt ticked
- [ ] The bar at the top shows the ticked count and Cancel; Merge produces the same grunt group today's merge does
- [ ] Merge or Cancel ends picking and hides the tick boxes; outside picking there are none
- [ ] Today's merge messages still appear as today
- [ ] Apart from how merging is started, every control does exactly what it did before; at least one whole-GM-screen test proves the merge result is unchanged
- [ ] Existing tests that ticked grunt rows directly are updated to start picking from the row menu, not deleted
- [ ] The full test run, the code-style check and the build all pass
- [ ] Checked by hand at laptop width (about 1366×768) and big-monitor width; the player view is unchanged
