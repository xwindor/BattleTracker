# What this app is — and isn't

This is the product boundary. Every feature is scoped against it. Agents read
this before proposing what to build.

## The app is a tracker, not a rules engine

It helps a GM keep track of state during play. It does not resolve mechanics for
them. The GM knows the rules and makes the calls; the app remembers what's
happening so they don't have to hold it in their head at the table.

The test for any proposed behaviour:

- **Does it help the GM remember or see state?** → in scope
- **Does it decide an outcome the GM would normally decide?** → out of scope
- **Does it require the app to know a rule the GM already knows?** → probably
  out of scope

## In scope

- Representing state: who's in the fight, what order they act in, what condition
  they're in, what's currently true about them.
- Tracking values that change and are tedious to hold in your head: Initiative
  Score across passes, damage on both tracks, Overwatch Score, marks, positions
  in the Matrix or on the astral.
- Making state visible at a glance, to the GM and to players in the player view.
- Applying a change the GM tells it to apply — including rolling dice when the
  GM asks for a roll.

## Out of scope

- Resolving opposed tests, deciding success or failure, or computing net hits
  into consequences.
- Enforcing legality — the app should let the GM do things the rules wouldn't
  strictly allow. GMs override rules constantly.
- Modelling the full decision tree of a subsystem. The Matrix module tracks
  marks, hosts, icons, Overwatch Score, and who's where. It does not implement
  every Matrix action's test, threshold, and consequence.
- Character building, gear management, or anything that belongs before the
  session starts.
- Automating things a GM would rather decide in the moment.
- Undo / redo. The undo system was removed from the app (commit 426827b) and is
  not coming back. Correcting a mis-tap means editing the value directly, which
  the tracker already allows everywhere. Do not propose reintroducing an undo
  stack, and do not port code that depends on one.

## Rules still matter — but for different reasons

Getting the rules right matters where the app is doing arithmetic the GM is
trusting it with. Initiative Score decrements, wound modifier thresholds, mark
caps, Overwatch thresholds — those need to be correct and page-cited, because
the GM isn't checking them.

Rules that describe *how a test is resolved* generally aren't the app's business.
The analyst should still find and cite them, so we understand the mechanic — but
finding a rule doesn't mean implementing it.

## When a feature request is large

Prefer several small features over one large one. "Matrix module" is not a
feature; "track marks per decker per target" is. If a request would take more
than a few days of work, it needs splitting before it enters the pipeline.

## Open questions

<!-- Add boundary calls here as they come up, so they're decided once.
     Example:
     - Should the app roll a decker's Matrix initiative automatically when they
       jack in, or wait for the GM to trigger the roll? DECIDED: wait. -->
