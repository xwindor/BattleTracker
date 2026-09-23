# Rolling in a player who joins combat after it's already started

## What the rulebook says

The core rulebook has a rule for exactly this situation (Core p. 160): if a
character enters combat after it has already begun, they roll their
Initiative Score the normal way — same dice, same maths as everyone else — and
then lose 10 for **every Initiative Pass that has already finished**. The book
is explicit that this may or may not leave them enough to act this Combat
Turn, "but at least they have a chance."

So your belief that a late joiner takes −10 is right, but it isn't a flat,
one-time −10:

- Join during **Pass 1**, before any pass has finished: **no penalty**.
- Join during **Pass 2** (one pass already done): **−10**.
- Join during **Pass 3** (two passes done): **−20**.

Two more pieces of the rulebook matter here:

- **Core p. 159** is the base Initiative maths and pass structure: roll your
  Initiative Dice, add your Initiative Attribute; everyone acts highest first;
  at the end of each pass everyone loses 10; repeat until everyone is at 0 or
  below, then the Combat Turn ends.
- **Core p. 170**: a wound penalty also lowers a character's Initiative Score,
  and **Core p. 160** says that happens immediately, even within the same
  pass. If a late joiner was already hurt, that stacks on top of the
  late-entry penalty.

Two existing table rulings already cover what happens next, so nothing new
needs deciding there:

- A Score at zero or below — even negative — is fine and is never floored at
  zero (`RULINGS.md`, 2026-07-31).
- A character at 0 or below can still take one Free Action and defend, but
  not a Simple or Complex action (`RULINGS.md`, 2026-08-07).

## What the app does today

**The maths is already right.** When you add a participant while combat is
under way and a pass has already finished, the app already subtracts 10 per
finished pass the moment they're added. The analyst checked the calculation
against page 160 and it matches.

**The problem is purely how you get the player to roll.** "Request Player
Rolls" and "Force Roll Outstanding" live on the Initiative Prep panel, which
only appears *before* a combat turn begins. Once the turn is running, that
panel is gone, so nothing can ask a late joiner to roll. The player's roll
pop-up is tied to you having pressed "Request Player Rolls," so it can't open
for them either. Today you can roll for them yourself with the dice button on
their row (it works mid-fight, penalty included), or type a Score onto their
card — but you can't get the *player* to roll it themselves. *(Corrected
after the planning stage read the code; an earlier draft said typing was the
only option.)*

## What would change

You'd have a way to ask players to roll — and to force-roll if needed — after
the combat turn has started, not only before it. It would use the same locked
roll pop-up players already get, and the same penalty maths the app already
gets right.

## Not building — and why

- **Not changing the maths.** The −10-per-finished-pass calculation is already
  correct and won't be touched.
- **Not building a new kind of prompt.** This reuses the existing roll pop-up.
- **Not stopping you overriding the penalty.** You can always type a different
  Score onto a card, as everywhere else in the app. The app just applies the
  printed rule by default.
- **Not handling a character who was knocked out and wakes up mid-turn.** The
  rulebook's late-entry rule is about someone who *wasn't in the fight yet*. It
  says nothing about someone who was already rolled and then went down. That's
  a separate decision (see question 3), not part of this.

## Scope questions for you

Answering these may mean updating `SCOPE.md`.

**1. Should the roll pop-up open by itself the instant a late-joining player's
character is added, or only once you press a "request rolls" button — the way
it already works before combat starts?**
- *For opening by itself:* one less click, at exactly the moment this feature
  is about.
- *Against:* you already decided (2026-09-16, recorded in `SCOPE.md`) that a
  pop-up the player can't close must never appear unless you asked for it.
  Opening by itself would mean deliberately carving an exception into that
  rule.
- *Suggested:* keep the button. It matches that decision and how the rest of
  the roll prompts work.

**2. Should "Force Roll Outstanding" work on a late joiner mid-fight, the same
as before combat starts?**
- *For:* you keep your "keep the game moving" tool at all times.
- *Against:* force-rolling someone mid-scene, with everyone watching, can feel
  more heavy-handed than doing it in the lull before a fight.
- *Suggested:* allow it — same tool, same job, just later in the fight.

**3. A character who was already in the fight, went unconscious, and wakes up
partway through a turn — do they re-roll with the late-entry penalty, or pick
their old Score back up?**
- The rulebook doesn't address this at all, so it's a genuine table ruling, not
  something to look up.
- *Suggested:* decide it separately rather than inside this feature, so it
  doesn't get settled by accident.

## Risks to the table

- The Initiative Prep panel's buttons currently only exist before combat.
  Making them reachable mid-fight touches the same code, so the main risk is
  wiring the new button to the wrong trigger — for example re-opening every
  player's prompt instead of just the late joiner's.
- Nothing about the underlying Initiative maths changes, so the existing
  penalty calculation should be unaffected.

---

# Implementation plan (planning stage)

## What we found once we opened the actual code

**The number the app calculates for a late joiner is already correct, and
it's now double-checked two ways.** The analyst confirmed it against the
rulebook; separately, an automated test already in the app adds a made-up
latecomer during Pass 2 and checks their Score comes out to exactly
attribute + roll − 10, and it passes. This change doesn't touch the maths.

**You can already roll for a late joiner yourself.** There's a dice button
next to every participant's Initiative box, and it works whether or not
combat has started, with the penalty applied. What's genuinely missing is
the **player's own pop-up**, plus the "roll for everyone still outstanding"
button — both live on a panel that vanishes once a Combat Turn is running.
That's the whole gap this feature closes.

**The risk you'd expect here is already handled.** Asking one late joiner to
roll mid-fight can't re-open the pop-up for anyone who's already rolled: the
app decides whether to show each player's pop-up from that player's own
status, not from a blanket "someone owes a roll" signal.

**A second way to join mid-fight the brief didn't mention.** A brand-new
player who opens the room link mid-fight and creates their character gets
the correct penalty today, but has the same problem — nothing can prompt
them to roll. The plan covers them too.

## What would change on screen

A small "Pending Rolls" panel appears on your screen **during** a combat
turn, whenever someone in the fight hasn't rolled yet. It has the same
buttons you already know from before a turn starts — "Request Player Rolls"
and "Force Roll Outstanding" — but **not** "Begin Combat Turn," which makes
no sense once the turn is already running. Players see the same locked roll
pop-up they already get before combat. Everything else — the calculation,
where they slot into the current pass, negative Scores being allowed —
already works and doesn't change.

## One more decision, uncovered by reading the code

**4. Should the mid-fight panel also offer "Roll Remaining Non-Player"** (the
button that rolls every not-yet-rolled NPC and never touches players)?
- *For:* it's harmless, since it explicitly skips player characters, and you
  keep the same layout you already know from before combat.
- *Against:* one more button on a panel that's meant to be small.
- *Suggested:* include it.

Questions 1 and 2 above still matter, with the same suggestions: you press a
button (it doesn't open by itself), and yes, Force Roll reaches late joiners.

## Your answers

Answered by Xavier, 2026-09-18 ("go with the suggestions"):

1. **Pop-up opens only when you press "Request Player Rolls."** It never
   opens by itself when a late joiner is added — consistent with the
   2026-09-16 decision in `SCOPE.md`.
2. **"Force Roll Outstanding" reaches late joiners mid-fight.** Yes.
3. **A character who wakes up mid-turn** is decided separately, not in this
   feature.
4. **The mid-fight panel includes "Roll Remaining Non-Player."** Yes.

## Validation round 1 — and your further answers

The first build **failed validation**. Once you asked for rolls mid-fight,
the "you've asked" signal never switched off when a player rolled, so a
later joiner's locked pop-up opened by itself, and between turns every
player's could. The rules side passed: the validator re-read all three
rulebook pages itself, and corrected two page references (the "immediately"
for wounds is on Core p. 160, not Core p. 170).

Answered by Xavier, 2026-09-18 ("go with the suggestions"):

5. **When you advance the order while a late joiner still owes a roll, the
   app warns you** who hasn't rolled, and you can carry on anyway. It never
   blocks you — consistent with `SCOPE.md`'s "warn rather than refuse."
6. **The mid-fight panel lists the names** of everyone still owed a roll.
7. **It shows whether you've already sent the request.**
8. **"Roll Remaining Non-Player" works mid-fight even while a player still
   owes a roll**, so one slow player doesn't stop you rolling newly arrived
   NPCs. Before combat it stays as it is.

## Validation round 2 — failed, and your redesign

The second validation failed too. If the last player who owed a roll had
their phone sleep or connection drop, the request switched itself off and
their pop-up never came back. The dice button on a character's row didn't
update the players' screens, so a stuck pop-up stayed open. And one request
covered people you never asked. All three come from the same cause: the
request was a single switch for the whole table, when what you actually mean
is "*this* player was asked."

Your redesign (Xavier, 2026-09-18):

9. **A button next to each player character's dice** asks that one player to
   roll. "Request Player Rolls" stays, and asks each player who owes a roll at
   that moment. Anyone arriving later isn't asked until you press again.
   Asking survives a phone sleeping or a reconnect.
10. **An indicator** on anyone who has no Initiative yet — just a marker, not
    an interruption.
11. **A warning only when the pass is about to end** while someone still owes
    a roll, naming them, so there's time to roll. You can always carry on
    anyway.
12. **No special rule for late rolls.** A late joiner acts this pass only if
    their score after the penalty is above 0 and their roll lands before the
    pass ends. You're right on the rule — the exact test is the score after
    the penalty, not the raw roll (Core p. 160 for the late-entry penalty,
    Core p. 159 for "only characters above 0 act"). The warning is what gives
    you the chance to wait.

Also fixed in this round: the mid-fight status line that wrongly said "Begin
Combat Turn."

## Validation round 3 — passed on the rules, nine things to tidy

The redesign worked. The fault that failed the two previous rounds is gone:
a phone going to sleep no longer cancels a request, your dice button now
closes the player's pop-up, and nobody gets a pop-up you didn't ask for. The
rulebook side passed with every page re-checked.

Your answers, 2026-09-19 ("fix as recommended", with item 5 changed):

13. **One warning, on your screen, that stops nobody.** When the last person
    able to act this pass comes up while someone still owes a roll, your
    screen says so. It covers every way a pass can end, including a player
    acting on their phone, a grunt group finishing, and a group dropping out
    after damage — none of which warned you before. The confirmation on Next
    Pass / End Combat Turn stays; the one on Act and Delay goes, so you
    aren't warned twice about the same person.
14. **New table ruling: someone who hasn't rolled doesn't get a turn until
    they roll.** Today an unrolled late joiner can be handed a turn on their
    bare attribute, ahead of someone who did roll, and could act without ever
    rolling.
15. **The status line** only shows while a roll panel is on screen, and stops
    overwriting messages like "Reconnected to session."
16. **Re-registering keeps the ask**, instead of losing it and applying the
    late-entry penalty twice.
17. **Your roll and the player's: the player's counts** (your call — I had
    suggested the opposite). If you roll for someone with the row dice button
    and their own roll then arrives, theirs replaces yours, and the log says
    so. Guarded so it can only happen once and never from an old turn.
18. **Asking one player chimes only that player.**
19. **Who's been asked** shows on the row, and in the setup panel too.
20. **The same action can't run twice** when you and a player both trigger it
    at once.
21. **The documentation** catches up with the per-person design.
