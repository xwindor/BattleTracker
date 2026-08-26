# The Room box shrinks to a line once a player is in

## What happens today

A player opens the player link and the first thing on the screen is a box
containing a "Room" text field and a "Join Session" button. They type the code
(or it is already filled in from the link) and tap Join.

After the join succeeds, that box does not go away. It stays exactly where it
was, same size, with the room field greyed out and the Join button greyed out.
It is a dead control taking up the top of a phone screen for the rest of the
session. The only thing it still does is show the code they typed.

That box is also where four different kinds of message appear:

- errors ("Could not claim Wombat: already claimed by another player")
- notices ("Reconnected.", "Claim request sent.", "GM ended combat.", "The GM
  released Wombat")
- the "GM not connected" warning
- the "Reconnecting to the session server..." line when their phone drops the
  connection

Those messages appear in that box **whether or not the player has joined**, and
several of them only ever happen long after they have joined.

One more thing worth knowing: a player's identity lives in the browser tab, so a
page refresh always drops them back to the not-yet-joined state. The Room box
before joining is not a once-a-night screen — they see it every time they
refresh.

## What changes

Once a player has joined successfully, the box goes. In its place is a single
compact line showing which room they are in — the same shape as the small
"Room ABC123" line you already have on your own GM screen.

Before they join, nothing changes: they still get the box with the field and the
Join button, because that is what they need at that moment.

The messages move out of the box into their own thin strip that is always
there, so nothing that used to be said to a player stops being said.

That is the whole change. Nothing about joining, claiming, creating, rolling,
the initiative order, the log, your GM screen, or what the server stores is
touched.

## What this means at the table

**A player's screen starts with the fight, not with a dead form.** On a phone,
the collapsed line gives back roughly the height of one initiative row —
which, mid-combat, is one more character they can see without scrolling.

**They can still read their room code out loud.** If someone asks "what room are
we in", the code is still on screen. That was the only useful thing the greyed-
out box was doing, and it is kept.

**If you close the room, the box comes back.** Closing a room drops every player
back to not-joined, so the field and the Join button reappear, still holding the
code, ready for them to rejoin when you reopen it. That is already how it
behaves; it just becomes visible instead of being a greyed-out field going
un-grey.

## Which parts of the app are affected, and what might break

**Affected:** the top of the player screen only.

**Not affected:** your GM screen, the server, what is saved about a room, the
initiative order, the dice roller, the Action Log, claiming and creating
characters, and everything a player does once they have a character.

What might break:

- **A message could go missing.** This is the real risk. Those four kinds of
  message currently live inside the box that is being removed. If they are not
  given a new home properly, a player would stop being told things like "the GM
  released your character" or "reconnecting" — and they would never know it was
  missing, because a message that isn't shown looks like a message that wasn't
  sent. The spec pins this with tests.

- **A player who joins a brand-new room could get a blank screen.** There is
  already a very narrow window (well under a second) where a player joins before
  your tab has sent anything, and everything below the Room box is hidden. Today
  the box at least proves the app is alive. The collapsed line has to sit
  outside that gate so it still does.

- **One existing automated test** checks the "GM not connected" warning is on
  screen after joining. The warning is moving, so the test has to keep passing
  through the move — it is a good tripwire, not a problem.

There is nothing here that can go wrong mid-combat in a way that affects the
fight. Nothing about initiative, actions or damage is involved.

## Decisions I need from you

**1. Where should the messages live after the box goes?**
*Recommended: one thin strip that is always on screen, just under the room line,
used both before and after joining.* One copy of each message, one place to look,
and nothing has to be duplicated for the two states. The alternative — tucking
them inside the collapsed room line — makes the line grow and shrink as messages
come and go, which is exactly the jumpiness the collapse is meant to remove.

**2. Should the room code be copyable?**
*Recommended: plain text, no Copy button.* It is six characters that a player has
already typed once, and they can select it with a long press like any other text.
Your GM screen has a Copy button because it copies a whole URL, which is a
different job. Say the word if you'd rather have one.

**3. Should there be a way back to the room field — a "Leave Room" or "Change
Room" button?**
*Recommended: no, not in this change.* Today there is no way back either (the
field is greyed out, not usable), so nothing is being taken away. Adding one is
not a display change: leaving a room has to decide whether the player's claim is
released on the way out, whether their log is cleared, and whether you see a
"player left" line — real behaviour with its own decisions. Refreshing the page
remains the way out, exactly as now. If you want the button, it should be its own
small change.

**4. Should the collapsed line also show whether they are connected?**
*Recommended: no extra status indicator.* The two things that can go wrong
already announce themselves in the message strip: "GM not connected" and
"Reconnecting to the session server...". A green dot that says "connected" when
everything is fine is the least useful state to have on screen, and it would be
a second thing to keep in step with the messages.

**5. Should the collapsed room line be a small box, a plain line, or tucked into
the top of the card below it?**
*Recommended: a plain line, not in a box of its own and not merged into anything.*
Merging it into the card below is tempting, but the card below is not always the
same card and is not always there — the "Get A Character" card disappears the
moment they have a character, and the whole lower half of the screen disappears
in the blank-room window above. The room code would vanish with whichever one it
was attached to. A plain line standing on its own is always there.

**6. If a player types their room code in lower case, should the line show what
they typed or the real code?**
*Recommended: the real code, in capitals.* Room codes are always six capitals;
the app quietly capitalises what they type when it joins, but keeps the lower-
case version in the field. Showing the capitalised one means a player reading the
code back to you can never read back something that doesn't match. One-line fix,
no downside I can find.

## Xavier's decisions (2026-08-25)

Xavier accepted **all six recommendations as written**. For the implementer,
that resolves to:

1. One ungated message strip, sibling to both the pre-join card and the
   collapsed row, rendering all three message blocks verbatim.
2. Plain selectable text for the room code. No Copy button.
3. No "Leave Room" / "Change Room" affordance. Reload remains the exit.
4. No connection-status indicator on the collapsed row.
5. A plain bar of its own — outside every card, and outside the
   `connected && state` gate.
6. **Open Decision 6 is taken.** `join()` assigns the normalized (trimmed,
   upper-cased) code back to `this.room` after `joinAsPlayer` resolves. AC 16
   applies in its "decision taken" form.
