# Grunt heal button should use the number you typed

## Plain summary

Right now, next to every grunt's Condition Monitor there is a small number box
labelled **DV** and three buttons: **P**, **S** and **-1**. You type a number,
tap **P** and that many boxes of Physical damage go on; tap **S** and it goes on
as Stun. The **-1** button ignores the number completely and always takes off
exactly one box.

After this change, **-1** works like the other two: it takes off however many
boxes the number box says. Type 6, tap it, six boxes come off. Leave the box on
1 — which is what it always says until you change it — and it behaves exactly
the way it does today.

That is the whole change. Nothing about how damage works, how a grunt goes
down, how the group's shared initiative penalty is calculated, or what the
players see is being touched.

## Where this shows up

Two places, and they are the only two places in the app with these controls:

1. **Inside a grunt group.** Expand a group's panel and each ganger has its own
   DV box and its own P / S / -1 buttons on its line.
2. **A single grunt on its own initiative line** (one you added with "Add
   Grunt", or one you detached out of a group). Select it and the Condition
   Monitor tab has the same DV box and P / S / -1 buttons under the health bar.

Ordinary player characters and ordinary NPCs do **not** have these controls at
all — they have the clickable health bar instead. So this change does not reach
them. See open decision 7.

## Current behaviour, precisely

- The number box is per-grunt and it **stays where you left it**. If you typed 9
  for a burst last round, it still says 9 now.
- The number box refuses 0, refuses blank, and caps at 99. So the smallest thing
  the heal button can ever do after this change is one box — the same as today.
- Healing already brings a downed grunt back up if it takes them below a full
  Condition Monitor, and already gives the whole group back its shared wound
  penalty. That was ruled on 2026-08-07 and is not being revisited.
- Healing already refuses to go below zero, and already writes the *actual*
  amount healed into the Action Log, not the amount you asked for.

So most of the behaviour you would want already exists. The only thing missing
is that the button never reads the number.

## What it looks like at the table

**Today, correcting a mis-keyed killing blow.** You typed 10, tapped P, and
realise you meant that hit for the ganger on the next line. To take it back you
tap **-1** ten times, and the Action Log gets ten separate "healed 1" lines.

**After.** The number box still says 10. You tap the heal button once. The
Action Log gets one line: *"G 2 healed 10"*. One tap, one undo step, one line.

**Ordinary healing mid-fight.** A street doc patches a ganger for 4. You type 4,
tap heal, done.

## Open decisions

**1. Should the heal button share the DV box, or get its own number box?**
*Recommended: share the existing box.* That is what you asked for ("the value in
the input field"), it keeps the grunt's line narrow enough to still fit on one
row at the table, and it means correcting a hit you just applied needs no
retyping — the number is already the number you want back. The cost is that
after keying 9 for a burst, an accidental tap on heal removes 9. Undo covers
that, and so does the log line naming the amount.

**2. What should the button say, now that it is no longer always "-1"?**
**DECIDED (Xavier, 2026-08-22): the label is `H`.** It pairs with the **P** and
**S** buttons beside it, it keeps the member row narrow, and it stops the button
lying about what it does the way "-1" would. The tooltip is rewritten to say it
takes off the number in the box.

**3. Should the "DV" label on the number box change?**
*Recommended: keep it reading "DV", and only update its tooltip.* The letters DV
are load-bearing for the P and S buttons — the Damage Value of the final attack
is what decides whether a downed grunt is alive or dead (p. 379), and the
tooltip says so. Renaming the box to something neutral would lose that. The
tooltip gains a sentence saying the same number is what the heal button takes
back off.

**4. What if the heal amount is more than the damage the grunt has?**
*Recommended: heal down to zero and say so honestly.* This is already how the
code behaves — ask to heal 9 on a grunt carrying 4, and 4 come off, and the log
says "healed 4", not "healed 9". No warning, no refusal. Nothing to change, but
worth confirming you want it that way rather than a refusal.

**5. What if the grunt has no damage at all and you tap heal?**
*Recommended: nothing happens, and nothing is written to the log.* That is
today's behaviour. Worth knowing that it is slightly asymmetric: tapping **P**
on a grunt who is already out of action *does* write "hit had no effect",
because that no-op is itself a ruling. A heal on an undamaged grunt is just a
mis-tap, and the Condition Monitor already reads 0, so a log line would be
noise.

**6. Does "healing revives a downed grunt" change, and does the log wording
change?**
*Recommended: neither changes.* Healing a grunt below a full Condition Monitor
still puts them back in the fight, still un-flags a group that had been wiped
out, and still writes the "is back in action" line. A bigger heal only makes
that more likely to happen on the first tap instead of the tenth. The log lines
already print the real number healed, so they need no rewording — you will just
see "healed 10" where you used to see ten lines of "healed 1".

**7. Should the same treatment go to non-grunt participants?**
*Recommended: no, and it is not a small job.* Player characters and ordinary
NPCs have no DV box and no P / S / -1 buttons anywhere — they have two clickable
health bars (Physical and Stun) and you set damage by clicking boxes. Giving
them typed damage and heal controls is a real feature with its own questions
(which track does an untyped heal come off first, how does overflow behave, what
happens to the wound modifier), not a one-line change. If you want it, it should
be its own request.

**8. On a single grunt carrying both kinds of damage, which comes off first?**
*Recommended: Physical first, then Stun — unchanged.* A grunt has one combined
track, so the split is bookkeeping rather than fiction. It is already written
that way; a big heal is simply the first time you can reach the "and then some
Stun" half from a single tap. The log will read, e.g., "healed Physical 2,
Stun 3".

## What might break

Low risk overall — the change is one number in two button handlers.

- **The two buttons themselves.** If the heal button starts reading the box and
  something is wrong with the wiring, the worst case is that it heals the wrong
  amount, which is visible immediately and undoable.
- **The Action Log.** The wording is not changing, but the numbers in it will get
  bigger. Existing tests that check heal lines pass explicit amounts and should
  be unaffected.
- **Group initiative.** Healing gives a group back its shared wound penalty, and
  larger heals cross more wound thresholds at once. That maths is already
  exercised by a test that heals 9 boxes in one go.
- **Undo.** One tap is already one undo step, whatever the amount. That does not
  change.
- **Player screens.** Nothing new is sent to players and nothing is taken away.
