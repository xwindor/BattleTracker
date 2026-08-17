# Combat boundary logging

## What changes at the table

The Action Log currently announces the *start* of things and almost never the
*end* of them. Reading a fight back afterwards, you get:

> Start Combat Turn 1
> Start Initiative Pass 1
> Sarah dropped prone (free) and took aim twice (simple).
> Rival fired their gun (simple).
> Start Initiative Pass 2
> …

Nothing says a pass finished, nothing says a Combat Turn finished, and nothing
says the fight itself began or ended (there is a line when you press End
Combat, but it reads as a button label — "End Combat" — rather than as
something that happened).

After this change the same fight reads:

> Combat started
> Start Combat Turn 1
> Start Initiative Pass 1
> …actions…
> End Initiative Pass 1
> Start Initiative Pass 2
> …actions…
> End Initiative Pass 2
> End Combat Turn 1
> Start Combat Turn 2
> …
> Combat ended

Four new kinds of line, one changed wording. Everyone in the room sees them,
same as the existing start lines.

**Nothing about how combat runs changes.** No change to initiative, scores, the
-10 per pass, who acts when, when a pass or turn actually finishes, or what any
button does. This is purely about what gets written down.

## One thing I need to tell you about how combat ends

You asked whether there is a graceful end-of-combat action separate from the
Reset button. There is not — I checked every path.

- When the last Initiative Pass of a Combat Turn runs out, the tracker does
  **not** end combat. It puts you back to the "Start Combat Turn" button. The
  fight is paused between turns, not over.
- The button that reads "End Combat Turn" is literally the same button as "Next
  Initiative Pass" — it just changes its own label when nobody has enough
  initiative left for another pass. It ends the *turn*, never the fight.
- The red **End Combat** button is the only thing in the app that ends a fight,
  and it is the thing the earlier audit called Reset. I looked at what it
  actually does: it asks you to confirm, then puts everyone back to Waiting,
  clears the initiative rolls and declared actions, sets the turn counter back
  to 1, and tells the players' screens that combat is over. **It does not delete
  anyone and it does not clear damage or Condition Monitors.**

So it is not destructive in the way the internal name "Reset" suggests — it is
the graceful end-of-combat action, just badly named in the code. I am treating
it as the correct place for the "Combat ended" line and recommending no new
button. Renaming it internally is a separate tidy-up, not part of this.

## Decisions I need from you

**1. Should these lines exist when you are running without a player session?**
Today the tracker only writes turn/pass lines into the log when a share room is
open; running solo, your local log has never had them. The new lines inherit
that.
*My default: leave it as-is.* Making them appear locally too is a bigger change
than it sounds (it changes what a lot of existing tests see) and while a session
is open the local log is not even the pane you are looking at. Say the word if
you want boundary lines in the solo log and I will scope it separately.

**2. When a Combat Turn ends, do you want both "End Initiative Pass N" and "End
Combat Turn N", or just the turn line?**
The last pass of a turn ends at the same instant the turn does, so logging both
gives you two lines back-to-back saying nearly the same thing.
*My default: just "End Combat Turn N".* The turn ending obviously implies the
pass ended. Two lines is noise at the moment you most want the log to be
scannable.

**3. Should "Combat ended" say how long the fight lasted?**
E.g. "Combat ended after 3 Combat Turns".
*My default: plain "Combat ended".* The turn count is on screen anyway, and the
number would be ambiguous when you end a fight halfway through a turn (is a
half-finished turn one of the three?). Happy to add it if you want it.

**4. Should ending combat mid-turn also log the turn and pass ending first?**
If you press End Combat in the middle of Pass 2 of Turn 3, should the log read
"End Initiative Pass 2 / End Combat Turn 3 / Combat ended", or just "Combat
ended"?
*My default: just "Combat ended".* You stopped the fight; the pass and turn did
not run their course, and saying they did would be a small lie in the record.

**5. A small existing bug this makes visible.**
If you press Start Combat Turn when literally everyone is out of action, the
tracker starts the turn, immediately finds nobody who can act, and ends the turn
again in the same click — and the log line prints the *next* turn's number
("Start Combat Turn 2" for the turn you just started).
*My default: fix the number as part of this.* It is a logging-only fix, it
costs nothing, and the new end-of-turn lines would otherwise make the wrong
number much more obvious.

**Resolved 2026-08-16 — all defaults accepted.**

## What could break

- **Undo does not un-write log entries, and this change does not fix that.** If
  you tap Next Initiative Pass and then Undo, the pass really does go back — but
  the "End Initiative Pass 1" and "Start Initiative Pass 2" lines stay in the
  log, and pressing Next Initiative Pass again writes them a second time. That
  is already true today for the start lines; the new end lines behave the same
  way. Fixing it means making the log undo-aware, which is a different and much
  larger job (and undo is slated for removal anyway).
- **A delayed character acting after everyone else** is the one place where the
  tracker internally "ends the pass" more than once. The design makes that
  produce only one end-of-pass line, but it is the case most likely to show a
  duplicate if something is got wrong, so it has its own test.
- **The log gets longer.** Roughly one extra line per Initiative Pass and one
  per Combat Turn, plus two per fight. A three-pass turn goes from 4 structural
  lines to 7. If that turns out to be too chatty in play, the easiest dial is
  dropping the pass-end line and keeping only turn boundaries.
- **A number of existing automated tests count log entries** and will see the
  new ones. That is expected; they are listed precisely in the technical spec.
- Nothing about what players are allowed to see changes. Nothing that is
  currently GM-only becomes visible, and nothing visible becomes hidden.
