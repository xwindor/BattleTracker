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
- Displaying the current Matrix noise level as a GM-set reminder. The app
  never subtracts it from any dice pool — it is a fiddly running total worth
  holding for the GM, not a mechanic the app resolves (Scope Question B,
  `briefs/matrix-port-rules-correctness-spec.md`, approved 2026-09-01).
- Propagating a mark the GM placed on a slaved device to its host, and up a
  chain of open-grid devices parented to one another, automatically. This is
  the app writing a mark nobody directly clicked on that specific icon — a
  fixed, one-for-one consequence of a rule the GM already knows (p. 233), not
  a value derived from a roll or comparison (`RULINGS.md` 2026-09-02, "Marks
  propagate up the containment hierarchy — this is not a Decision 1
  violation"). Scoped to devices only: only a `type: "device"` icon
  propagates a mark upward, and only a device or a host receives one — a
  file, persona, IC, or nested-host icon neither propagates nor receives
  (Xavier's decision 8, 2026-09-03).
- Making state visible at a glance, to the GM and to players in the player view.
- Applying a change the GM tells it to apply — including rolling dice when the
  GM asks for a roll.
- Enforcing legality — to a degree, decided per feature rather than as a blanket
  rule. The tracker should help the GM follow the rules, but it must stay
  flexible: GMs override rules constantly, and sometimes the GM needs to do
  something the rules wouldn't strictly allow. Where a feature enforces a limit,
  say so and get the call made explicitly; the default is to warn rather than
  refuse.

## Out of scope

- Resolving opposed tests, deciding success or failure, or computing net hits
  into consequences.
- Modelling the full decision tree of a subsystem. The Matrix module tracks
  marks, hosts, icons, Overwatch Score, and who's where. It does not implement
  every Matrix action's test, threshold, and consequence.
- A dice roller inside the Matrix module. The battle tracker already has one
  dice roller; that is the only one. A GM who wants to roll a Matrix test uses
  it, or physical dice, and types the result into the Matrix module by hand
  (Xavier, 2026-09-02: "I'm not aware of a dice roller other than the one that
  already exists in the battle tracker, the matrix module should not have a
  separate dice roller"; `RULINGS.md` 2026-09-02, "The Matrix module has no
  dice roller of its own"). This withdraws Scope Question A / A′ from
  `briefs/matrix-port-rules-correctness-spec.md` (approved 2026-09-01, then
  withdrawn 2026-09-02 — see that brief's own withdrawal note).
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
