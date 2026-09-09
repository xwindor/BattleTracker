# A cyberpunk name generator — plain-language brief

*For Xavier. No code, no file names. The technical version is
`briefs/cyberpunk-name-generator-spec.md`.*

---

## The short version

You press a small dice button next to a name box and the tracker puts a
Shadowrun-flavoured name in it — a street handle, a gang name, a Matrix host
name, whichever suits the box you pressed it in. Press it again for a different
one, or type over it. Nothing else in the app changes.

That's the whole feature. Everything below is about *which* boxes get the
button, what the names look like, and the handful of calls I need from you.

---

## What this does at the table

The tracker already names things for you, but only in one style: "Grunt 1",
"Grunt 2", "Grunt Group", "NPC 3", "Combatant 1". Those are fine as bookkeeping
labels — they exist so the log can say which specific ganger went down — but
they're not names you'd say out loud. When the runners ask "who's the one with
the shotgun?", "Grunt 3" is not an answer.

So in practice you either use the placeholder and the fiction stays flat, or
you stop and invent something. The second costs ten to twenty seconds, and it
happens most often at the worst moment — players waiting, four more bodies just
walked into the room, and you need four names now.

With this, you press the dice and get "Ratchet", or "Deadline", or "The
Vulture". Press again if you don't like it. It never overwrites anything you
typed unless you press the button.

It handles more than runner handles, because not every name box wants one:

- **Street handles** — grunts and individual NPCs. "Slug", "Nine-Volt",
  "Cracked Halo".
- **Crew names** — grunt groups. "The Ash Kings", "Redline Boys", "Sable
  Cartel".
- **Matrix host names** — "Nakatomi Payroll Cluster", "Shiawase Logistics
  Grid".
- **Matrix icon names** — the devices, files and personas you track inside a
  host. "Maglock Controller 4B", "PAYROLL_Q3.enc".
- **Ordinary legal names** — see scope question C.

---

## Where the button would appear, field by field

I went through every place in the app where a name is typed. There are eight.

**Getting the button (my recommendation):**

1. **The Add dialog's Name box** — the one that opens on Add Participant, Add
   Grunt, Grunt Group, Add NPC, and Merge. Highest value by a wide margin: it's
   the box you're looking at at the moment you need a name, and it already
   knows what kind of thing you're adding, so it picks the right style without
   asking.
2. **The NPC name boxes inside an expanded grunt group.** One button per NPC.
   This is the "four more bodies just walked in" case.
3. **The Matrix host Name box**, both when adding a host and when editing one.
   The Matrix panel already has a "Suggest A/S/D/F" button that invents four
   host attribute ratings on a click; this is the same idea one row above it.
4. **The Matrix icon Name box** — the form where you add a device, file,
   persona or IC.

**Not getting the button (my recommendation, but see the scope questions):**

5. **The name box on each row of the main combat list.** Two real reasons.
   First, you specifically asked for that column to keep the spare space beside
   the name so the GROUP / GRUNT / LIEUTENANT badges have room — a button eats
   exactly that space, and it also becomes a Tab stop, which changes how
   Tab-to-next-row behaves. Second, and more seriously: if that participant is
   a jacked-in decker, renaming them currently loses every Matrix mark they've
   placed. That's an existing bug, not one this feature creates, but a one-tap
   rename button right beside the box makes it far easier to trigger. I'd
   rather fix that separately first. **You can still rename anything by
   typing, exactly as today.**
6. **The player view's Character name box.** See scope question F.
7. **The room code boxes** (GM and player). Not names.
8. **The dice roller's "Roll as → Other…" box.** That attributes a roll to a
   critter or bystander who already has a name in your head. A generator there
   would be inventing a second name for something that already has one.

---

## Not building — and why

Straightforward exclusions. None is a close call; they're listed so you know
they were considered and dropped, not missed.

- **Nothing fires automatically.** No name is ever generated unless you press
  the button. Adding a grunt still proposes "Grunt 4", not a random handle —
  see scope question B if you'd rather it didn't.
- **No name history, no favourites, no "give me back the last one".** The
  button is cheap to press again and typing over it is free. A history list is
  a second feature for a problem that doesn't exist.
- **No per-faction or per-city word lists.** One general cyberpunk corpus.
  Splitting it into Ancients-flavoured vs Halloweener-flavoured vs
  Yakuza-flavoured multiplies the writing by five for a distinction that
  mostly lives in your head anyway.
- **No pronouns, genders, descriptions or backstory.** The button produces a
  string of text and nothing else. It does not create a character, attach
  notes, or tell you anything about the NPC.
- **Nothing new crosses the network.** A generated name is just a name. It
  reaches the players' screens through exactly the same machinery a typed one
  does, and there is no new data on the wire at all.
- **Nothing changes about initiative, damage, marks, Overwatch or the log.**
  This touches text boxes and nothing else.
- **No rules involvement whatsoever.** The rulebook calls grunts "nameless
  cannon fodder" and gives no rule at all about how a GM labels one — we
  already established and recorded that during the grunt-naming work. Naming
  is a tracker convenience, full stop. Nothing here needs a page citation and
  nothing in it can be right or wrong against the book.

---

## Scope questions for you

These genuinely could go either way. Answering some of them may mean **adding a
line to `SCOPE.md`**, because that document currently has no category at all
for "the app invents content for the GM" — see question A.

### A. Should the app be inventing flavour content at all?

`SCOPE.md` says this is a tracker: it remembers state, shows state, applies
changes you tell it to apply, and rolls dice when you ask. It says nothing
about generating *content*. A name generator is a new kind of thing for this
app to do.

**Case for:** it only ever fires when you press a button, you can always type
over it, and the app already does something structurally identical — the
Matrix panel's "Suggest A/S/D/F" button invents four host attribute ratings on
a click. That precedent exists and nobody thought it crossed a line.

**Case against:** `SCOPE.md` explicitly rules out "automating things a GM would
rather decide in the moment", and naming an NPC is about as squarely a
GM-in-the-moment decision as exists. Once content generation is in, the next
request — generate a corp, generate a run hook, generate a face description —
has no principled line to stop at.

**My recommendation:** yes, build it, and add one line to `SCOPE.md` saying so
— roughly *"Offering a suggestion the GM can accept, reject or overwrite is in
scope, so long as it only ever fires on an explicit tap and stays editable
afterwards."* That sentence is what draws the line for the next request, which
is why I want it written down rather than left implied.

### B. Should the generator ever fire automatically?

For instance, Add Grunt pre-filling "Cinder" instead of "Grunt 4".

**Case for:** saves the extra tap, and the tap is the whole cost of the
feature. If the name's going to be generated anyway, why make you ask?

**Case against:** the placeholder names aren't arbitrary. "Grunt 4", "NPC 2",
"Grunt Group 3" are deliberately boring and deliberately numbered so that
reading a log line three fights later tells you instantly which is a name you
chose and which is a label the app made up. Auto-firing destroys that
distinction. There's also a specific technical trap: the app seeds one blank
row on every tab load, and if anything ever puts a name on that row you get a
false "this will destroy your work" warning every single time you join a room.

**My recommendation:** never automatic. Explicit tap only. If the extra tap
annoys you in play, that is a far easier thing to change later than unwinding
an auto-name.

### C. Street handles only, or mundane legal names too?

Not every NPC is a runner. A Mr. Johnson, a corp sec lieutenant, a beat cop and
a bartender all read better with an ordinary name than a street handle.

**Case for:** half the NPCs at a table aren't gang-affiliated, and "Marcus
Oyelaran" is more useful for a Mr. Johnson than "Deadbolt". It's a second word
list, not a second feature.

**Case against:** roughly a third more corpus to write, and it needs a way to
say which kind you want — more controls in already-tight boxes. And you can
always just type one; inventing "Marcus" is much less work than inventing
"Nine-Volt".

**My recommendation:** include them, reached by *pressing the button again*
rather than by a separate control — one press gives a handle, the small label
under the box says which style you got, the next press cycles. If that reads as
fiddly when you try it, the fallback is to ship handles only in the first pass
and add legal names once you've used it at a table.

### D. Should you be able to edit or extend the word lists?

**Case for:** it's your table. If your Seattle has a signature gang vocabulary,
a fixed list will keep producing names that don't fit and you'll stop pressing
the button.

**Case against:** the lists would then be something the app has to store, save,
restore after a crash, and keep separate per room — a genuinely larger job than
the generator itself. And it's editing that belongs before the session, which
`SCOPE.md` already puts outside the boundary.

**My recommendation:** fixed built-in list. If you want to change it, it's a
one-line edit in a plain text data file that takes thirty seconds — a perfectly
good escape hatch for a personal tool, and it costs nothing to build. Revisit
only if you find yourself actually wanting it mid-session.

### E. Should generated names be guaranteed unique?

**Case for:** the log names the specific grunt whose wound or death it records,
and two combatants answering to one name make those lines unreadable. That's
already why the existing "Grunt 4" numbering is careful about uniqueness.

**Case against:** honestly none I can see. The only cost is that the generator
sometimes has to try twice, which is invisible.

**My recommendation:** yes, unique — checked against every combatant currently
in the fight, case-insensitively, so "Torch" and "torch" count as the same
name. If it can't find a free one after several tries it falls back to adding a
number, exactly as the existing default names do. I'd also have it refuse to
hand you a name matching a *player's* character, because the dice roller uses
names to decide whose dice a roll is, and a collision there would silently
re-attribute a roll.

### F. Should the players get this too?

The player view has a Character name box where a player types their runner's
name on joining.

**Case for:** a player showing up to a one-shot without a sheet would find it
genuinely useful, and it's the same button.

**Case against:** it's the one name in the app that isn't yours to generate. A
player's handle is the most personal thing they bring to the table, and a dice
button beside it reads as the app suggesting they haven't thought about it.
It's also the only place this feature would touch player-facing code at all —
leaving it out keeps the whole change on the GM's side.

**My recommendation:** GM-only. Leave the player view alone.

### G. Should the button also appear on the main combat list's name boxes?

Covered above. The two objections are the badge spacing you asked for, and the
decker-rename-loses-marks bug.

**My recommendation:** no for now, and let me raise the decker-marks bug as its
own change request. If that gets fixed and you still want the button there,
adding it afterwards is a ten-minute job.

---

## What's affected, and what might break

- **The Add dialog.** Where most of the change lands. Risk is low: the dialog
  already creates nothing until you press Confirm, and the button only writes
  into a text box.
- **The combat log.** The tracker doesn't write a combatant's join line until
  they first roll initiative, and it reads the name *at that moment* rather
  than at the moment you added them — so pressing the dice button any time
  before the first roll puts the name you actually want in the log. That's
  already how it works; this feature doesn't change it, but it's why this is
  safe.
- **The blank-row check.** The app seeds one empty row per tab load and has to
  keep recognising it as untouched, or you get a false "this will destroy your
  work" warning on every join. This is why the generator must never fire on its
  own. Existing tests cover it.
- **The four existing default-name schemes** ("Grunt N", "Grunt Group N",
  "NPC N", "Combatant N"). They're deliberately kept apart so log lines stay
  attributable. Generated names must not collide with them or each other.
- **The dice roller's "Roll as" list.** Built from combatant names, and it
  refuses names belonging to player characters. A generated name colliding with
  a player's character would quietly change who a roll is attributed to. The
  uniqueness check covers this.
- **Matrix marks.** Marks are filed under the decker's *name*, not under the
  decker. Renaming a jacked-in decker loses their marks today, with or without
  this feature. That's why I'm keeping the button off the main list's name
  boxes, and why I want to raise it separately.
- **Reconnecting after a crash.** Nothing new. A generated name is stored and
  restored exactly like a typed one; there's no new data anywhere.

---

## How big this is

Small, and it splits cleanly.

**Part 1 — the generator and the Add dialog button.** About a day, most of it
writing the word lists. This is the piece that solves your actual problem, and
it ships on its own.

**Part 2 — the grunt-group NPC boxes and the Matrix host / icon boxes.** Half
a day on top of Part 1. Pure wiring.

**Part 3 — whatever the scope questions turn on** (legal names, player view,
main-list name boxes). Each independent, each small, none blocking the others.

I'd do Part 1, use it at a table once, then decide whether you want the rest.

---

## One thing I found that isn't part of this

**Renaming a decker loses their Matrix marks.** Marks are filed under the
decker's name rather than under the decker, so changing the name leaves every
mark they've placed filed under a name nobody answers to any more. A real
defect, existing today, nothing to do with the name generator, and a different
fix. Kept out of this plan and flagged. Say the word and it becomes its own
change request.

---

## Xavier's decisions — 2026-09-05

Approved as proposed. All seven scope questions resolved in favour of the
recommendation above:

- **A — yes.** Content generation is in scope. `SCOPE.md` gets the line:
  *"Offering a suggestion the GM can accept, reject or overwrite is in scope,
  so long as it only ever fires on an explicit tap and stays editable
  afterwards."* (Applied in Stage 5.)
- **B — never automatic.** Explicit tap only. The numbered defaults stay.
- **C — include mundane legal names**, reached by pressing the button again to
  cycle style, with a small label under the box saying which style you got.
- **D — fixed built-in word lists.** No in-app editing.
- **E — guaranteed unique**, case-insensitive, numeric-suffix fallback, and
  never a name matching a player character.
- **F — GM-only.** The player view's Character name box is untouched.
- **G — no button on the main combat-list name boxes** for now.

The decker-rename-loses-marks defect stays out of this change and remains
flagged for a separate change request.

---

## Xavier's decisions — 2026-09-07 (revision after Stage 4 review)

Reviewed the built feature and cut two things to keep the code lean.

- **Legal names are removed entirely.** This reverses decision C of
  2026-09-05. There is no `legal` corpus, no style cycling, no style caption
  and no tooltip style preview. Every button produces one kind of name for its
  field: handle, crew, host, or the matching Matrix icon kind. Confirmed at the
  table that step 3 of the tap-through produced a legal name — accepted as
  moot, since legal names are going.
- **The one-press undo affordance is removed.** This reverses the fix made for
  the reviewer's defect 3 on 2026-09-06. Correcting a mis-tap means retyping
  the name or pressing the button again, which is what `SCOPE.md` already says
  the tracker does everywhere else.

Consequences accepted:

- The reviewer's must-fix defect 1 (undo restored the name but not the style
  cycle) disappears with the undo itself.
- The reviewer's open question — no style caption on the grunt-group row —
  disappears with cycling.
- A mis-tap on a grunt-group NPC's suggest button is again unrecoverable and
  broadcast immediately, and log lines already written keep the old name.
  Accepted: the button no longer wears the Roll-Initiative dice icon, so the
  mis-tap is much less likely than when that defect was found.
- The feature no longer sits against `SCOPE.md`'s standing "no undo / no redo"
  rule, so no exception needs writing there.

Everything else in the Stage 4 report stands as approved.
