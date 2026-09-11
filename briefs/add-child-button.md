# Add a "+" button to build a device chain from the top down

## What changes on screen

Right now, if you want to plug a weapon into a mount, and the mount into a
drone, you build it backwards: create the weapon, create the mount, create the
drone, then open each one's Edit screen and tell it who it's plugged into.

This change adds a small "+" next to a device in the Matrix hierarchy tree.
Click it on the drone, and a blank "Add Device" form opens, already set to be
a child of the drone — you type the name, hit Save, and it appears nested
under the drone immediately. Click + on the mount instead, and the new device
lands under the mount. You build the chain in the order you'd actually assemble
it at the table: top-down.

The Parent dropdown you already have in the Add/Edit form stays exactly where
it is — it's still there for fixing a mis-plugged device. The + is just a
faster way to get the common case right the first time.

**Only devices get a +.** Files, personas, and IC icons never get one — they
can't be parents in this app, and neither can a device that's sitting inside a
host rather than out on the open grid (a host-nested device is linked to its
host a different way, and that link isn't what the + button builds).

## Not building — and why

- **No way to attach an *existing* device as a child.** The + always creates a
  brand new device. If you want to re-plug something that already exists, you
  still use the Parent dropdown in its Edit screen — that's what it's for.
- **No type picker on the +.** Clicking + always creates a new *device* (never
  a file, persona, or IC) — matching how the existing "+ Loose Device" button
  at the top of the tree already works. A device is also the only type that
  can pass a mark up the chain, so this keeps every child the + creates
  actually useful for that purpose.
- **No change to marks, propagation, or the 3-mark cap.** Purely about how a
  new device gets created and where it lands.

## Scope questions for you

### 1. Where exactly does the "+" sit on the row? (the main open question)

The row that shows a device's name is already the tightest piece of real
estate in this screen — it's the same row that couldn't fit a sentence and
forced the earlier "amber highlight" redesign. Adding *anything* permanent to
it risks the same problem: names getting cut off sooner than they already do.

Three ways to do it, each with a real cost:

- **A — Put it next to the existing Edit/Delete buttons, always visible for
  devices.** Simple, works the same on a touchscreen as with a mouse, matches
  a pattern already in the app. *Downside:* costs a small, permanent slice of
  that already-tight row, on every device. We already accepted a very similar
  cost once (the amber marker), so this isn't a new kind of trade-off — just
  the same one again, on a smaller set of rows.
- **B — A new small line under the device, shown all the time for devices
  only.** No risk to name truncation. *Downside:* this is almost exactly the
  row you asked to be removed two changes ago, for being visual clutter — same
  icons, same always-on cost. Bringing it back this way undoes that clean-up
  for the devices that would show it.
- **C — Show the + only when you're hovering over or tapping that row,
  otherwise invisible and taking no space.** No permanent cost at all.
  *Downside:* "hovering" doesn't really exist on a touchscreen, and nothing
  else in this app currently works that way, so this would need its own new,
  untested interaction and a fallback for anyone using a tablet at the table.

**My recommendation: A.** It's the least likely to break in some way I can't
predict, it behaves the same on every device you'd run this app from, and the
cost is the same *kind* of cost you already accepted once for the amber
marker — just applied to fewer rows. Worth actually measuring on your screen
before committing, the same way the amber marker's cost was measured.

### 2. Where does the new device appear once you hit Save?

Today, oddly, the Add/Edit form for any device already **doesn't** appear
right next to the device you clicked — it always pops up at the very top of
the Public Space list, even for something buried three levels deep. That's
existing behaviour, not something this change is creating.

For the new + button specifically, I'm proposing something better: the form
opens **right under the device you clicked +** on, not at the top of the
list. That means you never have to scroll to find it, and the new device
appears exactly where you'd expect it, immediately after you save.

I am *not* proposing to fix the existing "Edit always jumps to the top"
behaviour — that's a separate, pre-existing thing, and fixing it isn't part of
this request.

### 3. What if a +Mark picker is already open somewhere else in the tree?

Today, clicking Edit on a device doesn't close any +Mark picker that happens
to be open elsewhere. I'm proposing the + button behaves the same way —
consistent with Edit, and simpler to build. The risk: you could have an armed
+Mark picker sitting open somewhere while you're building a chain with +, and
a stray tap could place a mark you didn't mean to place. This risk already
exists today with Edit; the + button doesn't make it any worse, but it doesn't
make it better either. Flagging it rather than quietly leaving it, since this
app has no undo.

## What's affected, in general terms

- The hierarchy tree in the Matrix panel — devices gain a small new control.
- The Add/Edit form — no visible change, but it needs to remember "this form
  was opened as a child of THIS device" so it renders in the right spot.
- A handful of automated tests that check the Add flow and the tree's layout
  will need new coverage; none of the existing Parent-dropdown tests should
  need to change.

Any of the above may need `SCOPE.md` touched only if you want to change the
device-only or open-grid-only restriction — I'm not proposing that, but
flagging that those are the two boundaries this feature is built against.

---

## Xavier's answers — 2026-09-10

Decided. The implementer builds to these.

1. **Option A — the + sits in the card's action group**, next to Edit and
   Delete, always visible for an open-grid device. Its width cost on the
   already-tight name row must be **measured**, not assumed, the same way the
   amber marker's cost was measured (N-9). If it truncates names shorter than
   the 7-8 character band already accepted, stop and report the number before
   shipping.
2. **The form opens inline, under the device whose + was clicked** — not at
   the fixed top-of-Public-Space slot the Add and Edit forms use today. Edit's
   own top-of-list placement is a separate pre-existing oddity and is NOT
   being fixed here.
3. **Devices only, for now.** Xavier asked for the host's behaviour — the
   ability to add files and other icon types under a device too. That turns
   out to be more than a control: `canHaveParent()` is
   `type === "device" && context === "public"`, the Parent field renders only
   for devices, and switching an icon's Type from device to file deliberately
   clears its parent. So a file cannot currently be a child of a device at
   all.

   Whether it *should* be — whether a file lives on a device, whether a
   persona can be contained, whether IC can run anywhere but a host — is a
   rules question, and `CLAUDE.md` requires those to come from a page-cited
   brief rather than anyone's memory. **Deferred to `/feature`** with the
   rules analyst. If the book widens the gate, the + button inherits it for
   free: it opens the ordinary Add form, whose Type dropdown is already
   editable.

## Follow-up queued

- **`/feature`: what can contain what in the Matrix hierarchy.** Page-cited
  containment rules for device / file / persona / IC / host, and whether
  `canHaveParent()`'s device-only gate should widen. Raised by Xavier
  2026-09-10 while scoping this change.

### Width decision — 2026-09-10

The measurement failed the stop condition and was escalated. Xavier accepted
it and the control ships.

Measured at `EFFECTIVE_NARROW_WIDTH_PX` (354px), depth-3 ancestor, same
harness as N-9:

- **Today:** 67px of name width.
- **With the + button:** 53px — newly truncates 7-character names, matching
  the band already accepted for the propagation marker.
- **With the + button AND the propagation marker** (a mark picker open
  elsewhere in the tree): 40px — newly truncates **6-character** names, one
  shorter than the accepted ceiling.

Accepted because the combined case needs three things at once — the narrowest
pane, a chain four deep, and a picker open — and it occurs while the GM is
placing a mark rather than reading names. At ordinary widths nothing
truncates. The `+` alone costs exactly the band already signed off.

This is now the recorded ceiling: **6 characters at the narrow-pane worst
case**. The next control that wants space in `.tc-info-row` is measured
against this, not against the older 7-8 figure.
