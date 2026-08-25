# Removing Undo — plain-language brief

**For:** Xavier
**Companion spec:** `briefs/remove-undo-system-spec.md`

## What you asked for

Take Undo/Redo out of the tracker completely, because having to think about
"will this be undoable?" makes every new feature harder to build.

## Is this a rules question?

No. The one place it came close is already settled: in August you reversed the
"a downed grunt can't be healed back up" ruling *specifically because* you had
already decided to remove Undo, and the heal control was built as the
replacement. Removing Undo now makes the tracker match the rulings.

## What Undo actually is today

One shared history behind the whole app. Almost every change a GM makes —
typing a name, applying damage, rolling initiative, ending a pass, deleting a
combatant — quietly records a "how to take this back" note. The two yellow
arrow buttons top-right walk backwards and forwards through those notes.

It is more tangled than it looks. It is not bolted on the side: it is the
plumbing that *performs* the change. When the tracker sets a combatant's
damage, it calls into the Undo machinery, which writes the value and records
the note in the same breath. So removing Undo is not deleting a button — it is
rewiring about 65 places where the tracker writes a value, plus about 60 places
that group changes into single undo steps.

It is also partly broken today, which is part of why it costs so much:

- Undoing back across the end of a Combat Turn restores everyone's damage and
  Initiative Score, but silently loses any Full Defense or other committed
  interrupt. Their Initiative then reads too high.
- Some changes — adding or removing a combatant, adding an NPC to a group — are
  only undoable if the code remembered to open an undo step first. If it
  forgot, the change is silently permanent, with no warning.
- An undo step doesn't reliably end where you'd expect. A change made outside a
  properly-opened step doesn't become its own step — it starts an open-ended one
  that keeps swallowing everything afterwards until something else closes it.
  So one tap of Undo can take back more than you meant.

## What removal changes at the table

**Nothing about combat itself.** Initiative order, passes, turns, damage,
condition monitors, grunt groups, player sync, room rejoin — all unchanged.

**The two yellow arrow buttons disappear.**

**Some mistakes become permanent.** That is the whole cost, so here it is
honestly.

### Mistakes you can already fix without Undo — no loss

| Mis-tap | How you fix it today |
|---|---|
| Damage on a player character | Click a lower box on the condition monitor, or the same box again to clear it |
| Damage on a grunt or group member | The `H` heal button next to the DV box takes that many boxes back off |
| Wrong rolled-initiative total typed | Retype it — the Score moves by the difference only |
| Duplicated a combatant | Delete the copy |
| Wrong Reaction / Intuition / Body / Willpower | Retype it |
| Marked a group member as having Acted | Tap their "Acted" pill to un-mark — deliberately always available |
| Reset a decker's Overwatch Score | Adjust it back up |
| Released a player's claim | The player re-claims from their own screen |

### Mistakes that become permanent

| Mis-tap | What it costs | How bad |
|---|---|---|
| **Tapped an Interrupt Action** (Full Defense, Dodge, Block…) | Full Defense costs 10 Initiative and can't be taken twice in a turn. There is no control anywhere that removes one. It clears on its own at the end of the Combat Turn. | **Worst.** No replacement exists at all. |
| **Tapped "Next Initiative Pass" too early** | Everyone loses 10 Initiative, statuses reset, group "acted" marks clear. If that tap also ends the Combat Turn: everyone's rolled dice, Score, spent Edge and committed interrupts are wiped and the turn advances. | **Second worst.** No replacement. |
| **Tapped "Seize Initiative"** | Combatant flagged as Edge, jumps the queue for the rest of the turn. The button hides once tapped — no un-seize. | Medium. Clears at turn boundary. |
| **Tapped "Act" on the wrong combatant** | Marked Finished, order moves on. No un-act for an ordinary combatant. | Medium. |
| **Deleted a combatant** | Gone, with their damage and settings. | Medium — already asks "are you sure?" |
| **Tapped "End Combat"** | Everyone soft-resets. | Medium — already asks "are you sure?" |
| **Merged grunts into a group** | You'd detach each one by hand; they come back with fresh names and IDs. | Low. |

### One thing that quietly gets better

Three of the known defects listed in the architecture doc are undo defects.
They stop existing the moment Undo does — including the "undoing across a turn
boundary loses committed interrupts" bug that has sat unfixed.

## Decisions I need from you

### 1. Do you want a way to take back a mis-tapped Interrupt Action?

This is the one real hole. Tapping Full Defense costs 10 Initiative, blocks
retaking it this turn, and nothing removes it. Today Undo is the only path.

The good news: the underlying "clear this combatant's interrupts" function
already exists in the code and is currently unused. Wiring it to a small
control next to the interrupt buttons is a modest job.

**Recommendation: yes, but as a separate change immediately after this one.**
Bundling new UI into a deletion makes the deletion harder to review and harder
to back out. Ship the removal clean, then add the control as its own small
change, logged in the feature backlog so it isn't lost.

*Note:* if you add it, whether clearing Full Defense gives the 10 Initiative
back mid-turn is a table decision, not a printed rule — it belongs in
`RULINGS.md`. Flagging it, not deciding it.

### 2. Do you want a guard on "Next Initiative Pass"?

A mis-tapped Next Pass is the most expensive mistake left, especially the tap
that ends the whole Combat Turn — that wipes everyone's rolled dice, Scores,
Edge and interrupts at once.

Asking "are you sure?" on *every* Next Pass would be maddening; you tap it
several times a turn. But the tracker already knows, before it acts, whether a
given tap will end the Combat Turn.

**Recommendation: a confirmation only on the tap that ends the Combat Turn** —
again as a separate follow-up, not inside the deletion. Roughly one prompt per
turn, at the exact moment the cost is highest. If you'd rather have no prompt
at all, say so — it's a table-feel call, not a correctness one.

### 3. Should "Seize Initiative" and "Act" get a safety net?

**Recommendation: no.** Both are tapped constantly, both self-correct at the
next Combat Turn boundary, and prompts on frequently-used buttons train you to
dismiss without reading — which defeats the prompts on Delete and End Combat
that genuinely matter.

### 4. How much test churn do you want to absorb?

About 20 tests exist solely to prove undo works; they get deleted. But another
handful test a *combat rule* by undoing something and checking the value came
back — e.g. "a group heal gives the row's shared Initiative penalty back" is
currently written as an undo test.

**Recommendation: rewrite those to check the same rule directly** rather than
deleting them. More work than deleting, but deleting silently drops real
coverage of the initiative-score maths.

### 5. Do you want the on-screen "what you lost" warnings reworded?

Two dialogs and one banner tell you that rejoining a room discards "the undo
history". Once there is none, that line is a lie.

**Recommendation: reword them, keeping every other item in the list
unchanged.** Small, but they're the messages you read at the worst moment.

## Xavier's answers — 2026-08-24

Approved: **go with the recommendations**, all five.

1. **Interrupt-Action replacement — yes, but NOT in this change.** Ship the
   removal clean. Wire the already-existing `Participant.resetActions()` to a
   "Clear interrupts" control as a separate change immediately after, and log it
   in `docs/FEATURE-BACKLOG.md` as part of this work so it isn't lost. Whether
   clearing Full Defense refunds the −10 mid-turn is a `RULINGS.md` decision to
   be taken when that change is built — not now.
2. **Next Initiative Pass guard — yes, confirmation only on the tap that ends
   the Combat Turn, as a separate follow-up.** Not in this change. Log it in
   `docs/FEATURE-BACKLOG.md` alongside decision 1.
3. **No safety net on Seize Initiative or Act.**
4. **Delete the ~17 pure-undo tests; rewrite the 3 that assert a real combat
   rule** (the group-wound accumulator refund and the heal-correction paths) so
   they check the rule directly.
5. **Reword all the undo mentions in the restore/join warnings**, including the
   deliberately-frozen legacy branch, keeping every other item and the sentence
   structure intact. Leave the ordinary-English "This cannot be undone." in
   `confirmCreateShareSession` alone.

Also approved by extension (spec Open Decisions 6 and 7): delete
`src/assets/undo.svg` and both stale `.njsproj` lines; keep the `_field` +
getter/setter convention exactly as it is and merely update `ARCHITECTURE.md` to
state its new justification.

## What could break, in general terms

The risky part is not the buttons — it's that the Undo machinery is what
actually *writes* values. Every write must be replaced with a plain write doing
exactly the same thing, including the small clean-ups some do on the way
(rounding down, flooring at zero, clamping dice to five). Miss one and a number
silently starts behaving differently.

Two places to watch, flagged in the spec rather than quietly resolved:

- **Rejoining a room after a crash or restart.** The code that rebuilds your
  NPC groups' condition monitors uses the Undo machinery as a back door to write
  values it otherwise couldn't reach. Rewired carelessly, group members come
  back from a rejoin with no damage. The single most dangerous spot.
- **Deleting a combatant.** Deleting also clears about a dozen internal
  bookkeeping tables, and those clean-ups run *through* the Undo machinery.
  Deleting the wrapper without keeping the clean-up leaves stale entries behind
  — which is how combatants come back with the wrong ID and get re-announced to
  players as somebody new.

Player sync, room ownership rules, the action log and persistence across
restarts are untouched, and have existing tests.

## Size

Big and mechanical: about 20 files, almost entirely find-and-replace with the
compiler checking the work. Not risky the way a new feature is risky — risky
the way a large number of small identical edits is risky, where one missed edit
hides in the noise. The spec enumerates every one so none has to be found by
judgement.
