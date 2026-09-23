# Seize the Initiative — what the book says, and where your reading differs

**Up front: the rulebook does not call Seize the Initiative an interrupt
action.** It sits in a different place entirely — among the things Edge can buy
you — and the book's own Interrupt Actions section, the one that contains Full
Defence, never mentions it (Core p. 167). So that part of your reading doesn't
hold. The rest is half right, and the half that's right is the important half.

## What the book says

Seize the Initiative is printed in full both in the "Initiative and Edge"
sidebar (Core p. 160, running onto Core p. 161) and at Core p. 56, among the general
Edge rules — not only in the sidebar, as an earlier version of this note could
be read to imply (round-6 validator citation fix). In summary:

- You move to the top of the initiative order, **regardless of your Initiative
  Score** (Core p. 160).
- If several characters seize in the same Combat Turn, they all go before
  everyone else, and among themselves they are ordered **by their Initiative
  Scores** (Core p. 160–161).
- The move to the top **lasts the entire Combat Turn**, across multiple
  Initiative Passes, and you return to your normal place at the start of the
  next Combat Turn (Core p. 161).

It costs one point of Edge, like every Edge effect, and no more than one point
may be spent on any single test or action (Core p. 56).

## Where you're right

You said it lasts until the end of the Combat Turn, and that the character
keeps going first in each pass until the turn ends. **That is exactly what's
printed** (Core p. 161). Not an interpretation — the plain text.

## Where you're not

You suggested a special value that lets a seizer keep acting each pass until
everyone else is at zero or below. The book doesn't say that, and the general
rule points the other way.

Separately from the Seize passage, every character's Initiative Score drops by
10 at the end of each pass (Core p. 159), and once someone's own Score is zero
or below they get one Free Action and can still defend, but no further full
turn (Core p. 160). Nothing in the Seize text excuses a seizer from that.

Read together: **seizing changes where you stand in the queue, not how many
turns you get.** A seizer whose own Score has decayed to zero by pass three is
in the same position as anyone else at zero — first in line for what little
they can still do, but no full action.

## What the app does today, and how it differs

For the mid-fight joiner work, someone who hasn't rolled is skipped when the
app picks who acts next, and a character who has seized was made an exception.
That exception lets them act on their **unrolled Initiative attribute**, with
10 knocked off each pass, and keeps the Combat Turn alive while they remain
above zero.

Two things there don't match the book:

1. **The wording implies you need a Score before you can seize at all.**
   "Regardless of your Initiative Score", and ordering several seizers "by
   their Initiative Scores", both only make sense if a Score exists — which
   means you've rolled. The book never says so outright, but that's the natural
   reading, and it matches what you said you wanted.
2. **A seizer's own Score should decay and cut off like everyone else's.** The
   app currently stands a bare, never-rolled attribute in place of a real
   Score.

## Not building — and why

- **An interrupt-action version of Seize.** The book doesn't classify it that
  way, so treating it like Full Defence — always available, paid for out of
  Initiative Score — would be building something the rulebook doesn't describe.
- **An unconditional "acts every pass regardless" version.** Not supported. The
  zero-or-below rule still applies to a seizer's own Score.

## Scope questions for you

Answering these may mean updating `SCOPE.md`.

**1. Should the app require a rolled Initiative Score before Seize can be
used?**
- *For:* it's the reading most consistent with the printed wording, it's what
  you described wanting, and it dissolves the problem that started this — an
  unrolled character acting on a bare attribute.
- *Against:* the book never states it as a rule, only implies it. And it stops
  a late arrival grabbing priority with Edge the instant they show up, which
  some tables might want.
- *Suggested:* require it.

**2. Once someone has seized, should their own Score still decay by 10 a pass
and still cut them off at zero, exactly like everyone else?**
- *For:* that's what the printed text describes when read as a whole.
- *Against:* a seizer who rolled badly still runs out of steam mid-turn despite
  being at the front, which can feel flat at the table given how dramatic
  seizing is.
- *Suggested:* yes, same as everyone.

**3. If you try to seize for someone who hasn't rolled, should the app block
it or warn you?**
- Your standing rule in `SCOPE.md` is warn rather than refuse. Blocking would
  be a new kind of enforcement and needs saying out loud.
- *Suggested:* warn, consistent with the rest of the app.

## One more thing worth knowing

`RULINGS.md` has **no entry for Seize the Initiative at all**. The decisions we
made about it over the past week live only in code comments and in the draft
spec. Whatever you decide here is what should finally be written there.
