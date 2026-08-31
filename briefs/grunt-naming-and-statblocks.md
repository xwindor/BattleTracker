# Grunt naming on add, and grunts from CRB statblocks — plain-language brief

## What's changing and why

Two things, and only one of them is really a rules matter.

**Part 1 — name a grunt while you're adding it.** Right now the tracker creates the grunt first and writes the log line immediately, so the log records "Grunt 3" and then you rename it afterwards and the log still says "Grunt 3". The fix is to let you type the name as part of adding, and only write the log line once the add is committed with the final name. The rulebook doesn't tell you how to run a log, but it does give a reason the log needs the right name on it: when a grunt goes down you may need to know later whether he's alive or dead, and the book settles that per individual grunt from the type and size of the attack that dropped him (p. 379). A log that attributes that to the wrong label is a log you can't use.

Worth knowing: the book insists grunts are "nameless and faceless" and interchangeable (p. 378), and repeats it — grunts are "nameless cannon fodder", while prime runners "have names" (p. 385). So naming a grunt is a bookkeeping label, not a fiction change. That's fine; the tracker already does it for exactly the reason above.

**Part 2 — add grunts from the printed statblocks.** This *is* a rules matter. The core rulebook prints fourteen sample grunt statblocks, organised by Professional Rating 0 through 6, each as a matched pair (a rank-and-file grunt and a lieutenant), on printed pages 381–384. It also prints eight sample contact statblocks on pages 390–392. All twenty-two are transcribed in full in the technical spec.

## Rules basis, in plain terms

- **Grunts are a bookkeeping device.** A group of grunts shares one set of attributes and skills; the point of the whole system is to save the GM work (p. 378). Occasional specialists exist — one ganger is a street witch, one guard has an assault rifle — and the book tells the GM to note those special cases specifically (p. 378).
- **One Initiative roll for the whole group.** The book streamlines combat by making a single Initiative Test for the entire group, with augmented specialists allowed their own if the GM wants (p. 379). This is what the tracker's NPC row already models.
- **Grunts have one Condition Monitor, not two.** Boxes = 8 plus half of Body or Willpower, whichever is higher, rounded up. Physical and Stun both go on that one track. No overflow. When it fills, the grunt is out of the fight (p. 379).
- **Alive or dead is settled by the final hit.** Stun damage, or Physical damage less than the grunt's Body, means he's alive. Physical damage greater than his Body means he's dead (p. 379).
- **Professional Rating is a real number with real effects.** It's added as a dice pool modifier when the group resists Social Skill Tests (p. 379–380), and it sets the size of the group's shared Edge pool (p. 380).
- **Professional Rating also describes when they run.** PR 0: one man goes down and the rest run. PR 1–2: more than a quarter of the team taken out and they retreat. PR 3–4: casualties over half and they withdraw. PR 5–6: they don't break at all (p. 380). Note the book gives no dice roll for this — it's written as GM guidance, not a morale test.
- **Group Edge.** Grunts don't have their own Edge attributes; they share a pool equal to the group's Professional Rating, spendable on any grunt in the team (p. 380). Careful: the same page also says Professional Rating "determines the rating of their Edge attribute and Edge pool" — the book contradicts itself here. You already ruled this (RULINGS, 2026-08-01): NPC rows use Edge 0 for tie-breaking. Nothing in this feature changes that.
- **Lieutenants.** One per team. Statistically a step up — their attributes totalled should beat a grunt's by at least 4, likewise their skills (p. 380). They roll their own Initiative, and if they tie with their own team they always go first (p. 381). They still have a single grunt-style Condition Monitor (p. 381) — which you already recorded as settled (RULINGS, 2026-08-01). A lieutenant with Leadership can raise his group's Professional Rating by 1, which also adds 1 to their Edge (p. 381).
- **The book does not require a lieutenant.** "The gamemaster shouldn't feel obliged to include a lieutenant every time a group of grunts shows up", and multiple lieutenants can be stacked to build an elite squad (p. 381).
- **Contacts are statted differently.** The eight sample contacts print an actual Edge attribute (grunts don't), and deliberately omit an Armor rating "due to the flexible nature of a contact's equipment" (p. 390).

## Existing rulings that already bind this work

You've already decided these; the feature must not re-open them.

1. **NPC rows use Edge 0 for tie-breaks** (2026-08-01). A template must *not* write Professional Rating into a row's Edge attribute, even though p. 380 has a sentence that reads that way.
2. **A standalone grunt stores both Body and Willpower and re-derives its Condition Monitor whenever either changes** (2026-08-04). This means a template that supplies Body and Willpower automatically produces the right box count — and in one case the app's answer will differ from the printed number (see Open Decision 3).
3. **A brand-new row added mid-combat takes the −10-per-elapsed-pass late entry penalty; an NPC joining an existing row does not** (2026-08-04 and Decision 7). Adding from a template changes nothing here.
4. **Wounds slow the whole row, not one member** (2026-08-01).
5. **GM/NPC rolls and log lines are player-visible by default** (2026-07-31). So whatever you type as a grunt's name goes to the players' log.
6. **Condition Monitor maximums never appear in any log** (2026-08-13). A template import must not log "added Elite Special Forces (11 boxes)".

## Open decisions I need from you

**1. When exactly should the "added" log line be written, and what should it say?**
Recommended default: write it once, when you press the confirm button on the add dialog, using the final typed name — and nothing at all before that. Why: it makes the log's per-grunt attribution match the rulebook's per-grunt alive-or-dead question (p. 379), and it removes the rename-after-the-fact problem entirely.

**2. Should a template's identity (which statblock, and its Professional Rating) be visible to players in the log?**
Recommended default: **no** — log "Ganger Alpha joined the fight" to everyone, and keep "PR 1, Gangers & Street Scum" on the GM-only channel. Why: Professional Rating is a capability number (p. 379–380 makes it a dice pool modifier and an Edge pool size). It's the same class of information as Condition Monitor maximums, which you already ruled out of every log (2026-08-13). This is a narrowing of the visible-by-default ruling, so it needs your say-so.

**3. When the printed statblock and the printed formula disagree, which wins?**
The book has a handful of arithmetic slips. The one that matters: the Professional Rating 4 lieutenant (the technomancer) has Body 3 and Willpower 5, which by the p. 379 formula is 11 boxes, but the block prints 10. There are also four blocks with off-by-one Limits, and three odd Initiative lines (details in the spec).
Recommended default: **the formula wins for Condition Monitor**, because your 2026-08-04 ruling already makes the tracker re-derive boxes from Body and Willpower on every edit — overriding it would break that invariant. For Limits, carry the printed numbers as reference text, since the tracker doesn't roll limits. For the three odd Initiative lines, carry the printed value and mark it "as printed" in the GM-facing notes.

**4. Do the augmented (bracketed) attribute values load, or the base ones?**
The high-rating statblocks print things like Reaction 5 (8) and Initiative 10 (12) + 3D6 — base outside, cyberware-boosted inside. The Professional Rating 3 lieutenant prints both Initiative lines.
Recommended default: **load the augmented values**, since the printed Initiative line for PR 5 and PR 6 already assumes the ware is on, and a corp elite trooper with his wired reflexes switched off is not what you'd expect from the button. Give the add dialog a checkbox to load base values instead.

**5. Should "add from statblock" default to one shared row or to separate grunts?**
Recommended default: **one shared row**, with a "how many?" count. Why: p. 379 makes a single Initiative Test for the whole group the recommended streamlining, and it's what the app's NPC row is for. You can always detach one.

**6. Should a template pair automatically add a lieutenant with the group?**
Recommended default: **no** — offer it as a separate checkbox, unticked. Why: p. 381 says the GM shouldn't feel obliged to include one, and lets you add several to build an elite squad instead.

**7. If a lieutenant is on his own initiative row and ties with his own group's row, who goes first?**
The book says the lieutenant always goes first when tied with his team (p. 381). Your ERIC tie-break (p. 159) doesn't know which row is "his team".
Recommended default: **honour the printed rule** — record which row a detached lieutenant came from, and let him win a tie against that row before ERIC runs. Against anyone else, ERIC as normal.

**8. Should the tracker warn you when a group hits its Professional Rating's break point?**
Recommended default: **an advisory badge only, never automatic removal** — e.g. "PR 1–2: retreat threshold, 2 of 6 down" (p. 380). Why: the book states these as descriptions of behaviour, not as a test with a roll. Making the tracker remove the group would take a GM decision away from you.

**9. What does the tracker do with gear, skills and spells it doesn't model?**
Recommended default: **store them as read-only GM-facing reference text on the participant**, so you can see "Ares Alpha, DV 11P, AP −2" without the app pretending to model ammunition. Note that melee weapon damage in these blocks scales with Strength — every knife in the samples is Strength+1 and every club, sword and spur is Strength+3 (pp. 381–384) — so if you edit a templated grunt's Strength the printed DV goes stale. Recommended: leave it stale and visible rather than silently recompute.

**10. Are the eight sample contacts grunts or player-character-shaped?**
The contact blocks print a single Condition Monitor number, like grunts do, and the Talismonger's 11 matches the grunt formula exactly (Body 3 / Willpower 5 → 8 + 3). Critters, by contrast, print two numbers, e.g. "11/10" (p. 402). But the book never calls contacts grunts.
Recommended default: **treat imported contacts as standalone grunt-shaped participants** (one combined track), because that's the only reading that fits the single printed number. Flag it in the UI so you know it's an inference, not a printed rule.

## What's affected, and what might break

- **The add-participant and add-grunt flows.** These currently create the participant and log in one step. Splitting that into "collect details → commit → log once" touches the shared log, and there's an existing subtlety: the app seeds one blank placeholder participant on every tab load, and has logic (`isUnusedPlaceholder`) that decides whether that blank row counts as real. A dialog-based add has to not confuse that logic.
- **The combat log.** Any change to when lines are written risks double-logging (a line at create *and* at commit) or silent loss (no line at all if the dialog is cancelled). The existing log-privacy rules — no Condition Monitor maximums anywhere, GM-visibility gate on rolls — apply to every new line.
- **Default naming.** The app has three separate name spaces already: "Grunt N" for standalone grunts, "Grunt Group N" for merged rows, and "NPC N" for members of an unrenamed row. They're deliberately distinct so log lines stay attributable. A template import that names things "Ganger 1" has to slot into that scheme without colliding.
- **Session sync.** Names, Body, Willpower and Initiative all cross the wire to players. Professional Rating and any template notes should not — they need the GM-only channel.
- **Condition Monitor sizing.** Because a standalone grunt re-derives its boxes from Body and Willpower, importing a template writes those two fields and the box count follows. Any code path that sets a box count directly will fight with that.
- **Rejoin/restore.** Anything new stored on a templated participant needs a snapshot field, or it vanishes when the GM reconnects — which is exactly the failure the 2026-08-19 ruling was written to stop.

---

# Implementation plan — plain-language appendix

*Added after the rules brief above. Nothing above this line has changed.*

## What the app does today, in plain terms

There are six different ways a combatant gets into the tracker, and they do not
behave the same way as each other. This matters, because your complaint is
really about the inconsistency, not about grunts.

- **The plus button** adds a blank row with no name at all. It writes nothing to
  the combat log.
- **Add Grunt** creates a grunt already named "Grunt 1", "Grunt 2" and so on,
  and immediately writes "Grunt 1 added." to the log. This is the one you
  noticed. Renaming it afterwards does not go back and fix the line.
- **Grunt Group** creates a row named "Grunt Group", "Grunt Group 2" and so on.
  It writes nothing to the log at all.
- **Add NPC** (inside a group) creates an NPC named "NPC 1", "NPC 2" — or
  "Ancients 1", "Ancients 2" if you've already renamed the group — and
  immediately writes "Ancients: NPC 1 joined the group."
- **Merge into a Grunt Group** builds the row, names it, and immediately writes
  "Grunt Group formed from Ganger A, Ganger B."
- **Detach** pulls an NPC out of a group onto its own line and writes a line
  naming it. This one is already fine — the NPC already has whatever name you
  gave it.

So three paths log a made-up name the instant you press the button, two paths
log nothing, and one is fine. There is no single place in the app that decides
"a combatant just joined the fight, write it down." Every button decided for
itself, and they drifted.

A seventh path exists that you don't press: when a player registers their
character from the player view, the tracker creates the participant and logs
"Cayman joined the session" with the real name the player typed. That one is
correct and shouldn't change.

There is also a detail you should know about because it's a trap for whoever
implements this. Every time you open the tracker, it silently creates one blank
row for you to type into. The app has a check that recognises "this row is still
completely untouched" so that it doesn't nag you with a scary warning when you
join a room. That check works by comparing the blank row against a brand-new
one, field by field. If the fix accidentally gives new rows a default name, that
check breaks and you start getting a "this will destroy your work" warning every
single time you join a room. So the fix must not put a name on the plus button's
blank row.

## What I recommend building

**One dialog, one commit, one log line, for every add path.**

Pressing any of the add buttons opens a small dialog instead of immediately
creating something. The dialog collects the name (and, for grunts, the count and
the statblock). Nothing exists in the tracker until you press Confirm. Pressing
Confirm creates it and writes exactly one log line with the name you typed.
Pressing Cancel writes nothing, creates nothing, and sends nothing to the
players' screens.

Crucially: the log line should be written by the dialog's Confirm step, not by
the individual add buttons. If it stays inside the add buttons, the blank row
the app creates on startup would log a phantom join every time you open the tab.

**Leave the name box on the row exactly as it is.** You should still be able to
rename anything in place afterwards. The dialog is about getting it right the
first time, not about locking it down.

## Where the statblock data should live

A single, self-contained data file (or small folder) holding all 22 blocks as
plain data, separate from any tracker logic. Nothing in it does arithmetic; it
just records what's printed.

The important rule: **the data file never records a Condition Monitor box
count.** It records Body and Willpower, and the tracker's existing formula
produces the box count from those two — which is exactly what your 2026-08-04
ruling already requires. This is what makes the Professional Rating 4
lieutenant's discrepancy resolve itself: the block prints 10 boxes, Body 3 and
Willpower 5 give 11, and because the tracker only ever stores the two attributes
it lands on 11 automatically without anyone writing an override. The printed 10
gets recorded as a note for you to read, not as a number the app uses.

Same principle for everything else the tracker doesn't model: skills, gear,
spells, complex forms, adept powers, qualities, Limits. Those get stored as
read-only text you can read in the details panel. The app never tries to
interpret them.

## One technical risk you should know about, because it affects a decision

The tracker keeps a private, GM-only copy of everything the players aren't
allowed to see — damage, condition monitor sizes, downed NPCs, and so on. It's
what makes reconnecting after a crash work. That copy has a size limit, and
here's the sharp part: **if it goes over the limit, the server throws away the
whole thing, not just the part that was too big.** You would reconnect and get
back nothing.

Twenty-two statblocks' worth of gear and skill text is a lot of words. If we
send the full reference text for every templated NPC on that channel, a busy
fight could push it over the edge and cost you your entire reconnect safety net.

The fix is simple and I recommend it: send only the statblock's *name* (a short
code), and have the app look the text back up from its own data file. Same
result on screen, a fraction of the size, and it can never drift out of sync
with the printed data.

## How big this is, and how I'd split it

This is not one change. It's three, and I'd ship them in this order.

**Phase 1 — naming on add.** This is your actual complaint and it's the smallest
piece. One dialog, applied to all six add paths, plus a single place that writes
the join line. A few days' work. Ships on its own and is immediately useful.

**Phase 2 — the statblocks.** Twenty-two blocks is genuinely a lot of typing —
roughly 1,500 lines of pure data, plus a picker in the add dialog and a
read-only reference panel. The data itself is mechanical but has to be
transcribed carefully; a typo in Body silently changes a Condition Monitor. I'd
transcribe the 14 grunt/lieutenant blocks first and the 8 contacts second, since
contacts are the ones with an open question about whether they're grunt-shaped
at all.

**Phase 3 — the extras.** The lieutenant-beats-his-own-team tie-break, the
Professional Rating break-point advisory badge, and the contacts if you decide
they're in scope. Each of these is independent and none of them blocks the
others.

## Which of your open decisions actually change the build

You have twelve open decisions above (U1–U12). They are not equally
consequential. Here's what actually matters, in order:

**These four change the shape of the code and should be answered first:**

1. **U1 — when the log line is written.** This is the foundation of the whole
   first phase. Everything else in Phase 1 follows from it.
2. **U12 — does this apply to all add paths or just grunts.** The difference
   between fixing one button and fixing six. My strong recommendation is all
   six: the inconsistency between them is itself the problem, and fixing only
   the grunt path leaves four other paths that will surprise you later.
3. **U4 — base or augmented attributes.** If the answer is "augmented by
   default with a toggle", every statblock needs two sets of numbers and the
   dialog needs a checkbox. If it's "one or the other, always", the data is
   about 30% smaller and the dialog is simpler. Answer this before anyone starts
   transcribing.
4. **U5 — group or individual by default.** Decides which of the tracker's two
   grunt shapes the picker produces. Changing it later means rewriting the
   commit step.

**These three change data shape or what crosses the wire:**

5. **U3 — printed statblock versus printed formula.** My recommendation makes
   this a non-issue for Condition Monitors, but it needs your yes so the
   implementer knows not to build an override mechanism.
6. **U9 — what happens to unmodelled gear and skills.** This is the one tied to
   the size-limit risk above. "Store as read-only text" is fine; "store the text
   on the reconnect channel" is not.
7. **U2 — do players see the statblock identity.** Decides whether Professional
   Rating goes on the private channel or the shared one. Cheap to get right
   now, awkward to change after players have seen it.

**These two only matter if contacts are in scope at all:**

8. **U8 — Edge for imported contacts.**
9. **U10 — are contacts grunt-shaped.**
   If you defer contacts to Phase 3, both of these can wait. Note that the rules
   spec's acceptance criteria 5 and 15 assume contacts *are* in scope; if you
   defer them, those two criteria need amending.

**These three are self-contained and can be answered late:**

10. **U7 — lieutenant tie-break.** Isolated to one comparison function. Worth
    knowing: for most of the printed pairs the lieutenant already wins the tie
    on Reaction or Intuition without any special rule. It only actually changes
    anything for the Professional Rating 0 pair and the Professional Rating 5
    pair, where the grunt and the lieutenant have identical Reaction *and*
    Intuition and it currently comes down to a coin toss.
11. **U6 — auto-include a lieutenant.** A checkbox either way.
12. **U11 — break-point advisory badge.** Display only, touches nothing else.

## What might break

- **The log.** The two biggest hazards are writing the line twice (once when the
  thing is created, once when the dialog commits) and writing it zero times
  (dialog cancelled, or the line was moved and the old one deleted). There are
  existing tests that check the exact wording of the grunt and NPC join lines,
  and they will catch a duplicate.
- **The blank-row check** described above. Breaking it means a false "this will
  destroy your work" warning on every join.
- **Default names colliding.** The app deliberately keeps three separate naming
  schemes apart so log lines stay readable. A template that names things
  "Ganger 1" has to slot in without producing two combatants answering to the
  same name.
- **Condition Monitor sizing.** Any code that writes a box count directly
  instead of writing Body and Willpower fights the existing re-derivation and
  will silently produce wrong-sized tracks after the first attribute edit.
- **Reconnecting after a crash.** The size limit described above, and the
  general rule that anything new stored on a templated NPC has to be included in
  the reconnect snapshot or it vanishes.
- **Initiative order.** Only Phase 3's lieutenant tie-break touches the ordering
  code. Phases 1 and 2 don't go near it.

## Two things I noticed that are not part of this feature

**A latent bug in the Duplicate button.** Duplicating a participant named
"Ganger" silently renames the *original* to "Ganger 1". Nothing in the log
records that it happened. It is a real defect, but it is a different defect from
the one you reported, so I have kept it out of this plan and flagged it as its
own decision (D1 in the technical appendix). Say the word and it becomes its own
change request.

**The reported defect is broader than reported.** You noticed grunts. Three
paths log immediately with a generated name; four others log nothing at all. The
underlying problem is that no single place in the app owns "someone joined the
fight" — which is why the recommendation above is to create one.

---

# Decisions — 2026-08-26

*Xavier's answers to the open decisions above. These are binding and override
any contrary recommendation earlier in this document.*

## What Xavier decided

**Decision 8 (U11) — the Professional Rating break-point badge: NOT BUILT.**
"Too clunky." The feature is dropped entirely, not deferred. Nothing in the
tracker will display, calculate, or warn about a grunt group's retreat
threshold. The rules basis for it (p. 380) stays recorded above as background
only. *Consequence:* rules acceptance criterion for the badge is struck, and
Phase 3 loses it.

**U9 — no reference text. Import only what the tracker already uses.**
"Don't add in gear, skills, etc., just add in what the initiative tracker is
already using like body, willpower, etc."

Checked against the code: the tracker's entire attribute vocabulary is **Body,
Willpower, Reaction, Intuition, Edge**, plus the initiative dice count. It does
not model Agility, Strength, Logic, Charisma, Essence, Limits, or Armor — armor
appears nowhere in the codebase at all. So a statblock import will set exactly:

- **Body** and **Willpower** → which derive the Condition Monitor via your
  existing formula
- **Reaction** and **Intuition** → which derive the initiative attribute and
  feed the tie-break
- **Edge** → 0, per your 2026-08-01 ruling
- **Initiative dice count**

And nothing else. No gear lists, no skills, no spells, no complex forms, no
adept powers, no qualities, no Limits, no Armor, no reference panel.

*Consequences, all good ones:* the 64 KB reconnect-channel risk disappears
almost entirely, since there is no bulk text to send. The details-panel
reference tab is not built. The Strength-derived melee damage problem (edit
Strength, printed damage goes stale) evaporates, because Strength is never
imported. Three rules items that were flagged as unverified and parked —
drug effects, the qualities like Toughness and Natural Hardening, and the melee
weapon table — are now simply out of scope rather than parked as text.

**U8 and U10 — contacts: NOT IMPORTED.**
"Don't add contacts from the CRB, I just want the grunts that may be in combat."

The eight sample contacts (Bartender, Beat Cop, Fixer, Mafia Consiglieri,
Mechanic, Mr. Johnson, Street Doc, Talismonger) are dropped. Only the **fourteen**
grunt and lieutenant statblocks, Professional Rating 0 through 6, are built.

*Consequences:* the two open questions that only existed for contacts — whether
they carry their printed Edge, and whether they're grunt-shaped or
player-character-shaped — are moot and need no ruling. The rules acceptance
criteria that assumed contacts were in scope are amended to fourteen blocks. The
transcription job shrinks by more than a third.

## Everything else takes the recommended default

The remaining decisions stand as recommended in this brief:

- **U1** — one log line, written at Confirm, with the name you typed. None on
  open, none on cancel.
- **U2** — the statblock's identity stays GM-only; players see the name only.
- **U3** — the formula wins for Condition Monitor. The PR 4 lieutenant gets 11
  boxes, not the printed 10, with a note recording the book's error.
- **U4** — augmented (cyberware-on) values load by default, with a toggle to
  load base values instead.
- **U5** — adding from a statblock defaults to one shared row with a member
  count.
- **U6** — a lieutenant is never auto-added; separate unticked checkbox.
- **U7** — the lieutenant-beats-his-own-team tie-break is honoured (p. 381).
- **U12** — the naming fix applies to every add path, not just grunts.

## What this leaves to build

Two phases now, not three.

**Phase 1 — naming on add.** Unchanged by these decisions. A dialog on every add
path, one commit, one log line with your typed name.

**Phase 2 — the fourteen grunt statblocks.** Substantially smaller than
originally planned: fourteen blocks instead of twenty-two, and each block is now
six numbers instead of six numbers plus a page of gear and skill text. No
reference panel, no break-point badge.

The lieutenant tie-break (U7) is the only remaining piece that touches initiative
ordering, and it can ship with Phase 2 or after it.

## One thing I want to flag, not to change

With gear and skills out of scope, what the tracker imports from a statblock is
six numbers. That is genuinely all the tracker can use — but it means "add a PR 5
Elite Corporate Security grunt" gives you a correctly-sized Condition Monitor and
a correct initiative, and you'll still be reading his Ares Alpha and his skills
off the printed page yourself. That is the right call for an initiative tracker,
and it's what you asked for. I'm noting it only so the button's scope isn't a
surprise at the table.

I am keeping one non-stat field: a short GM-only label recording which statblock
a participant came from (e.g. "PR 5 Elite Corporate Security — Grunt"), so you
can tell at a glance what you added. It is a label, not gear or skills, and it
costs a few bytes. Say the word if you'd rather not have even that.
