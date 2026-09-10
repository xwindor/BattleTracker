# Host +Mark control: catch it up to the target card's

## What's changing and why

When a GM taps **+Mark** on a device or file icon in the Matrix hierarchy
tree, that control was recently improved: it now refuses to show a broken,
blank option in its dropdown, and it tells the GM plainly why the confirm
button won't do anything, instead of just sitting there dead.

The host icon (the box, server, or vehicle a device is slaved to) has its
own, separate **+Mark** control, right there in the same tree, for placing a
mark directly on the host. It never got either of those two fixes. This
request brings it up to the same standard as the device/file control, and
nothing else.

Two specific problems, both already known and written down, neither yet
fixed:

1. **A rare setup could produce a broken dropdown.** If a decker somehow
   ends up with a blank name, the host's mark-picker could show a blank,
   unusable option in its list, and tapping the checkmark next to it would
   do nothing. The device/file control was fixed for this exact problem on
   2026-09-03. The host control still has the old, unguarded code. In
   today's app this can't currently happen through the screens a GM
   actually uses — the list handed to the host control is always
   pre-cleaned upstream — but the host control has no defense of its own if
   that ever changes, exactly the situation the device/file control was in
   before it was fixed.

2. **No "why is this disabled" message.** If the GM has the host's picker
   open with a decker selected, and something else changes that decker's
   mark count on that host in the background (say, a player action synced
   in mid-tap), the confirm button can silently do nothing when tapped. The
   device/file control shows a message explaining why in this situation.
   The host control shows nothing at all — it just doesn't respond, which
   at the table looks like the app hanging or the tap not registering.

   **What actually happens now, and where the message does and doesn't
   appear (added 2026-09-10, after a follow-up review):** If there's a
   *second* decker still available to receive a mark on that host, the
   message shows up exactly as promised: the confirm button greys out and
   a line of text explains why, so the GM can pick the other decker
   instead of tapping a dead button. But if that decker was the *only* one
   in the room (or every decker on the table is already capped on that
   host), the whole +Mark control disappears instead of showing a greyed-
   out button with a message — there's no one left it could ever confirm
   for, so it closes rather than sitting there uselessly. In that single-
   decker case, tapping +Mark again reopens it cleanly once someone
   becomes available. This was also the fix for a second problem the
   follow-up review caught: without it, a closed-but-still-"loaded"
   picker could silently come back armed and ready to fire after some
   unrelated action (like removing a mark), with no fresh tap from the GM.

   **A second update, same day, closes the same hole for a different
   trigger.** The fix above only covered the case where the picker got
   stranded through a mark being placed or removed. It turned out the
   picker could also get stranded a different way: if the GM removes a
   decker's deck, or deletes that participant entirely, while that
   decker's the only one selected in an open host picker, the picker used
   to stay silently loaded the same way — and could come back armed later
   if a decker became available again, ready to fire on the very next tap
   with no fresh +Mark click. That route is now covered too. Between the
   two fixes, a picker can no longer come back pre-armed no matter which
   of these two ways its last available decker disappeared.

## Not building — and why

- **No highlighting or preview on the host control.** The device/file
  control's +Mark was recently given a feature where tapping it lights up,
  in the tree, every other icon that will also receive a mark as a
  consequence (because marks flow upward through a device's chain of
  ownership). A host is the *top* of that chain — a mark placed directly on
  a host never flows anywhere else. There is nothing to preview. Adding
  highlight code to a control that can never highlight anything would just
  be confusing dead code.
- **No changes to the mark-count display or the "which host does this
  belong to" dropdown.** Those are two entirely separate, already-planned
  pieces of work Xavier has queued. This request only touches the +Mark
  button, its dropdown, and its confirm button.

## Scope questions for you

**1. Should the host's confirm button visibly grey out (disabled) as well
as showing the message, or just show the message?**

The device/file control does both — the button is greyed out *and* there's
a written explanation next to it. Matching that exactly is the
recommended default, since it's the standard this request exists to match.

- *For matching exactly:* consistency — a GM who's learned the device
  control's behaviour gets the same behaviour here, no new pattern to
  learn.
- *Against:* none identified — this is a straightforward "do the same
  thing" case, not a real design fork.

**2. Is the blank-dropdown bug worth fixing at all, given it can't currently
happen through the app's own screens?**

It's true today's app always hands the host control a pre-cleaned decker
list, so this exact failure can't happen right now. But the device/file
control's version of this same fix was written specifically as a safety
net in case some future screen feeds it a dirty list — not because it was
broken through the app's own screens either. Matching that same
precaution here is cheap (a few lines) and keeps both controls holding the
same promise.

- *For fixing it anyway:* consistency and cheap insurance — if anything
  ever changes upstream, this control won't be the one that breaks.
- *Against:* it's defending against a scenario that doesn't currently
  exist; a strict reading of "don't build what isn't needed" would skip it.
- *Recommended default:* fix it. It's a few lines, matches the existing
  precedent exactly, and the alternative is leaving one of two near-
  identical controls holding a weaker guarantee than the other for no
  reason a GM would notice or care about.

Answering either of these may mean updating `SCOPE.md`. Neither looks
likely to move the product boundary — both are parity fixes inside an
already-in-scope feature — but if you answer question 2 with "don't bother,"
that is a deliberate statement about how much defensive coding this app
wants, and it belongs written down.

## What's affected and what might break

- The Matrix hierarchy screen — specifically, the host's own +Mark control
  inside an expanded host. Nothing about devices, files, the mark-count
  display, noise tracking, or any other part of the Matrix screen changes.
- There is existing automated test coverage that opens and closes this
  control as part of testing a different, already-shipped feature (making
  sure only one mark-picker is open at a time across the whole tree). That
  coverage needs to keep passing unchanged — this request doesn't touch
  the open/close behaviour, only the dropdown's contents and the message.
- No player-facing screens are touched. This is GM-only tooling.
