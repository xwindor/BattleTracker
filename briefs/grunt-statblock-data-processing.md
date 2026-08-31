# Giving the technomancer lieutenant a Data Processing number

## The short version

The tracker already knows how to run a character in the Matrix, and it already
knows that a character jacked into VR uses **Data Processing + Intuition** for
initiative instead of Reaction + Intuition. What it does not know is what the
PR 4 lieutenant's Data Processing actually *is*, because when we imported the
fourteen printed statblocks we only brought across Body, Willpower, Reaction,
Intuition, Edge and Initiative Dice.

That list was one short. The tracker also stores Data Processing, and it uses
it for exactly one thing — Matrix initiative. So importing Data Processing is
not new territory; it is finishing the job the original scoping decision
described ("only what the tracker already uses"). This change adds one number
to one statblock.

**Today**, if you take the PR 4 lieutenant and put him into hot-sim VR, the app
has to invent a Data Processing for him, and whatever it invents is not his.
**After the change** he arrives with Data Processing 5, and his hot-sim Matrix
initiative comes out as 10 + 4D6 — which is what the rules actually give him.

Nothing else changes. His meat-body initiative (9 + 1D6) is already right and
stays exactly as it is. This is not a Matrix module build-out; Matrix work
stays paused.

## Where the number comes from

A technomancer does not carry a deck. He *is* the deck — the book calls it a
living persona, and it takes its Matrix ratings straight off his mental
attributes. The table on **p. 251** spells it out: a living persona's Data
Processing equals the technomancer's **Logic**. The same table is repeated in
the character-creation summary on **p. 101**.

The PR 4 lieutenant's printed block on **p. 383** gives him Logic 5 and
Intuition 5. So:

- Data Processing 5 (his Logic)
- plus Intuition 5
- = **10**, and hot-sim VR adds **4D6** (p. 101, p. 159, p. 230, p. 231)

**10 + 4D6.**

## The book contradicts itself here, and we are not fixing it

His printed block says **"Matrix Initiative 9 + 3D6 (Hot Sim)"** (p. 383). Both
halves of that disagree with the rules:

- **The 9** is his Reaction 4 + Intuition 5 — that is his *meat body*
  initiative attribute, not Data Processing + Intuition. The correct figure
  is 10.
- **The 3D6** is the cold-sim dice count. Hot-sim is 4D6 everywhere the book
  states it (p. 101, p. 159, p. 230, p. 231). And on top of that, **p. 251**
  says a technomancer using his living persona can only be in AR or *hot*-sim —
  he cannot use cold-sim at all without borrowing a deck or commlink. So the
  line is labelled with a mode whose dice count it doesn't use, for a character
  who can't use the other mode either.

There is a plausible story for where 9 + 3D6 came from — it is exactly what
you'd get if someone had worked out a *cold-sim* initiative for the Erika Elite
commlink he carries (Device Rating 4 + Intuition 5 = 9, cold-sim 3D6) and then
mislabelled it "Hot Sim". That is a guess, not a rule, and it leans on an
equivalence I could not find printed anywhere in the core book. I mention it
only because it makes the error easier to understand.

Standing approach applies: **the tracker derives from the stored attributes,
and the printed line survives as a note you can see.** The statblock already
carries that note; it stays.

## Only one block needs a number. I checked all fourteen.

I read pp. 381–384 in full. Here is every scrap of Matrix presence:

- **PR 4 lieutenant (p. 383)** — technomancer. Has the Technomancer quality, a
  Resonance rating of 5, nine complex forms, and the only printed Matrix
  Initiative line in the whole set. **This is the one that needs a number.**
- **PR 5 lieutenant (p. 384)** — a decker, described as "hell on wheels in the
  Matrix", with the Cracking and Electronics skill groups and a **Shiawase
  Cyber-5 cyberdeck**. He has **no** printed Matrix Initiative line. **He needs
  something, but not a number** — see the decision below.
- **The other twelve** — every one of them carries a commlink and nothing else.
  A commlink has no attack or stealth software of its own (p. 226) and the gear
  table gives it no attribute array at all (p. 439). None of the twelve carries
  a sim module, which is what a commlink needs bolted on before it can do VR
  (it's a separate purchase on p. 439). **Nothing to import.**

One aside, out of scope: the PR 2 lieutenant (the wagemage, p. 382) prints
"Astral Initiative 8 + 3D6" where the rules give Intuition × 2 + **2D6**
(p. 101, p. 159). Same species of printing error, different track. Not touching
it; flagging it so it doesn't surprise you later.

## The decker is a genuinely different problem

For a decker, Data Processing does **not** come from an attribute. It comes off
the cyberdeck, and the book is explicit that the deck's four numbers are
**deliberately unassigned**: "it does not specifically list which numbers go
with which attributes" (p. 227). The decker picks which number is Attack, which
is Sleaze, which is Data Processing and which is Firewall **when he boots the
deck**, and he can swap two of them again as a Free Action whenever he likes
(p. 228).

His Shiawase Cyber-5's array is **8, 7, 6, 5** (p. 227, and printed on his own
block on p. 384). So his Data Processing is 8 *or* 7 *or* 6 *or* 5, entirely
depending on how you're playing him this scene. His Logic is 5, and it is
irrelevant — Logic only feeds Data Processing for technomancers.

**The printed block does not supply a usable number.** My recommendation is
that we import none for him and let you set it at the table, rather than the
app quietly picking one.

## Decisions I need from you

**1. What do we do about the PR 5 lieutenant (the decker)?**
*Recommended: import no Data Processing, and put a note on his statblock naming
the deck and its array — "Shiawase Cyber-5, array 8 7 6 5, assign at boot."*
Any single number we pick would be us making a tactical choice that belongs to
you, and it's a choice he can legally change mid-fight with a Free Action. A
note tells you what you have to work with without pretending to decide.

**2. If a Matrix participant has no Data Processing set, what should the app
show?**
*Recommended: show it as blank/unset rather than as 0 or as a made-up default.*
Right now, promoting someone to a Matrix participant hands them a hardcoded 6 —
which is nobody's number in particular and looks authoritative. A blank tells
you it needs filling in; a 6 doesn't.

**3. Should the app still offer Cold-Sim for the technomancer, even though
p. 251 says he can't use it?**
*Recommended: yes, keep offering it.* The app is a tracker, not a rules cop,
and you override things constantly. If you do pick it, it should compute
correctly (10 + 3D6). The alternative — greying it out — saves you from a
mistake you probably weren't going to make and costs you flexibility you might
want.

**4. How much should the note on the PR 4 lieutenant say?**
*Recommended: keep the existing factual note (printed 9 + 3D6, derived
10 + 4D6) and add one clause noting he can't legally use cold-sim on his living
persona anyway (p. 251).* The commlink conjecture I described above is optional
— I'd leave it out of the app and keep it here, since it's speculation and
notes should be things you can check against the book.

**5. Should Data Processing be part of the "augmented / base values" toggle?**
*Recommended: no.* Data Processing for a technomancer comes from Logic
(p. 251), and his block prints no bracketed alternative for it. The toggle
exists for cyberware that can be switched off; this isn't that. Same value
either way.

**6. Only if you can edit Data Processing mid-fight: when you change it partway
through a Combat Turn, does the character's current Initiative Score move too,
or only his next roll?**
*Recommended: match whatever the tracker already does when you edit Reaction
mid-turn — don't invent a second convention for this one field.* This matters
because the PR 4 lieutenant literally carries the complex forms **Infusion of
Data Processing** and **Diffusion of Data Processing** (p. 383), which raise and
lower Data Processing on a target mid-scene (p. 252). We are not building those
now, but you may well want to hand-adjust his number when he uses one.

## What this touches, and what could break

- **The statblock data itself** — one new number on one entry, and a note. Low
  risk.
- **The Matrix participant's initiative calculation** — this code already
  exists and already does Data Processing + Intuition. We are feeding it a
  correct value, not changing the sum.
- **The statblock import path** — it currently carries six numbers per block; it
  will carry an optional seventh for the one block that has one. Anything that
  assumes every field is always present needs checking.
- **Saved/synced sessions** — a participant created from this block will now
  carry a Data Processing that older saved rooms don't have. Worth confirming an
  old session still loads.
- **What won't break**: meat-body and astral initiative are untouched, the
  Condition Monitor is untouched, and the other thirteen statblocks are
  untouched.
