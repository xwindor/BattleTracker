# Move the "Parent" picker into the target's Edit screen

## What changes on screen

Right now, every device icon in the Public Space tree of the Matrix hierarchy
panel shows a small "Parent" row underneath its card, all the time — a
dropdown to pick which other device it's plugged into (a weapon parented to
its mount, a mount parented to its drone), plus a small clear button. It's
visible on every device icon whether or not anyone's about to touch it.

This change hides that row by default and moves the same control into the
"Edit" screen for that icon instead — the same screen where you already change
its name, type, and other rarely-touched details. You'd open Edit, see
"Parent" alongside the other fields, change it, and hit Save.

**One correction to the reasoning behind this request:** the request says
removing the row will free up width in the already-cramped icon row (the one
that forced the mark-highlight redesign). I checked, and that's not quite
right — the Parent row sits on its *own* line underneath the icon, not beside
it. Removing it frees up **vertical space** (so the tree feels less
cluttered, and you see more icons per screen), not the width that was actually
cramped. The clutter reduction is still real and still worth doing — it's
just not the same problem the highlight redesign solved.

## Not building — and why

- **No change to what a parent relationship does.** Marks still propagate up
  the same chain, the same way, with the same 3-mark cap. This is purely about
  where the control to set that relationship lives on screen.
- **No change to which icons can have a parent.** Still only devices — files,
  personas, and IC icons never got this control and still won't.
- **Not touching the mark-highlight feature** you just approved (the amber
  tree lines). I checked its two geometry-measuring tests specifically —
  removing the Parent row shrinks some rows' height, but the tests only check
  that one icon's box sits *inside* another's, not any specific size, so they
  should keep passing. Worth a careful check during implementation, not a
  rewrite.

## Scope questions for you

### 1. Should changing the Parent stick immediately, or wait for you to hit Save? (the main decision)

Today, changing the dropdown writes the change instantly — there's no Save
button on that little row at all. Every *other* field in the Edit screen
works the opposite way: you can change things, then either Save them or hit
Cancel and nothing happens.

If we just drop the Parent dropdown into the Edit screen without changing how
it behaves, you'd get an inconsistent screen: every other field waits for
Save, but Parent would save itself the instant you touch the dropdown — and
it would keep that change even if you then hit Cancel on everything else.

**Two options:**

- **A — Make it wait for Save, like every other field.** Consistent, and
  Cancel genuinely cancels everything. *Downside:* if you're mid-fight and
  just want to quickly re-plug a weapon onto a different mount, it now costs
  an extra click (open Edit → change Parent → Save) instead of one dropdown
  change.
- **B — Keep it instant, even sitting inside the Edit screen.** No new
  clicks. *Downside:* one field on the Edit screen behaves differently from
  every other field on it — you could hit Cancel and find your name/type edits
  discarded but the re-parenting kept, which is surprising.

**My recommendation: A.** Consistency prevents a specific kind of "wait, that
didn't actually cancel?" confusion, and re-parenting an icon is rare enough
(you said it yourself — set once, almost never touched) that the extra click
doesn't cost much in practice.

### 2. Should new icons let you pick a parent when you first create them?

Today you can't. A new device is always created with no parent; you always
have to set it afterwards. Since Add and Edit currently share the exact same
form layout behind the scenes, this control could easily appear in *both*
screens once it's built, or only in Edit as the request literally asks for.

**My recommendation: Edit only, for now** — matches what was asked for
literally, and keeps this piece of work small. Adding it to the Add screen too
is a natural small follow-up if you want it.

### 3. Losing at-a-glance visibility of the parent relationship

Today, because the Parent row is always visible, you can tell at a glance
which icon is plugged into which just by looking at the tree (plus the tree's
own indentation already shows this). Once it's tucked inside Edit, you'd have
to open Edit to *see* or *check* the current parent, not just to change it.

The tree's indentation still shows the *result* of the parenting (a weapon
drawn under its mount, drawn under its drone) — so you can still see the
shape of the hierarchy. What you lose is being able to see or double-check
*which specific dropdown value* produced that shape without opening Edit.

Nothing to decide here, just flagging the trade-off plainly so it's not a
surprise later.

## A gap this move exposes

Worth knowing about, because it has to be fixed as part of this change rather
than treated as optional.

The check that decides whether an icon may have a parent at all only looks at
whether the icon is a device — it never checks whether the icon is out on the
open grid or already sitting inside a host. That has been harmless so far,
purely because the control only ever appeared in the open-grid tree, where the
question could not come up.

The Edit screen is shared between open-grid icons and host-nested ones. So the
moment the Parent field moves there, that check starts being asked a question
it was never written to answer, and a device inside a host would be offered a
Parent field it should not have. The fix is small, but it is required.

## What's affected, in general terms

- The hierarchy tree in the Matrix panel (fewer rows visible today, will look
  less cluttered).
- The Edit screen for a device icon (gains one more field).
- A handful of automated tests that currently check for the always-visible
  Parent row directly in the tree — these will need rewriting regardless of
  which option you pick above, since the row is moving either way.

---

## Xavier's answers — 2026-09-09

Decided. The implementer builds to these.

1. **Save-buffered (Option A).** The Parent field waits for Save, like every
   other field on the form. Cancel discards it. Re-parenting costs an extra
   click; that is accepted, because the control is set once and almost never
   touched.
2. **Both Add and Edit** (Open Decision 2 answered "yes"). A parent can now be
   chosen at creation, so a nested chain can be built in one pass instead of
   creating each icon and re-opening it to parent it. This needs the extra
   accessor for the create flow — a target being created has no id and no
   descendants, so the self/descendant exclusion does not apply to it.
   Acceptance criterion 9 takes its "yes" branch.
3. Unchanged from the spec's recommendations: fix `canHaveParent()`'s missing
   `context` gate (Open Decision 3 — required, not optional), and route the
   commit through `setParent()`/`clearParent()` so the self/descendant guard
   keeps a single choke point (Open Decision 4).

Also recorded: the request's stated motivation was **partly wrong**. The Parent
row is a separate block below the card, not part of the cramped row beside it,
so removing it frees vertical space rather than width. It does not relieve the
constraint that forced the mark-propagation redesign. The change proceeds on
the clutter argument alone, which stands by itself.
