# Matrix port: rules-correctness pass

## Plain summary

The old Matrix module was copied forward onto `feat/matrix-v3` exactly as it
was, on purpose, so its rules numbers could be ruled on rather than quietly
edited. This brief is the ruling pass. I checked all seven claims against the
core rulebook.

**Result: six of the seven are wrong. One is a genuine hole in the rulebook.**

Short version:

- The app is computing an Overwatch Score number it has no way of knowing.
  There is no per-mark price for hacking; the price is however well the
  *defender* rolls, and this app never rolls that.
- Plugging a cable into a device does not hand you a mark on the host. It
  removes interference and strips the target of its bodyguard. That's all.
- The "alert at Overwatch 20" fiction came back in with the port. You already
  killed it once. It has to die again.
- Hosts and files cannot be damaged at all, so giving them health bars is
  meaningless.
- Marks are not won by rolling well — you *declare* how many you're going for
  before you roll, and pay a dice penalty for greed. The app is doing this
  backwards, and it shouldn't be doing it at all.
- Patrol IC is exactly as fast as every other IC. All IC rolls four initiative
  dice. The "2 dice for Patrol" number is a confusion with its dice pool, which
  is a different thing that is also wrong.
- "Marks go on the host, not on icons inside it" is flatly untrue. The rulebook
  puts marks on files, devices, personas, grids and hosts individually.

And the genuine gap: **the rulebook never says how fast IC actually is.** It
says IC rolls 4D6, but never gives the number those dice get added to. The app
invented one.

> **Update after the implementation review below:** you already decided this, on
> 28 August, and the answer was *not* the number in the code. See appendix
> section 3 — the ruling was lost with the abandoned branch and needs restoring,
> not re-deciding. The same applies to the IC health ruling and three other
> Matrix rulings from that day.

Both things you asked me to preserve check out. Hiding Overwatch Score from
players is correct, and the IC health formula is your own 28 August house rule —
it just isn't written down on this branch any more.

---

## The seven claims, one at a time

### 1. Overwatch Score per mark — WRONG

**What the code says:** Hack on the Fly costs 2 Overwatch per mark; Brute Force
costs 4 per mark. The panel shows the GM a "Suggested OS" built from that.

**What the rules say:** When you perform an Attack or a Sleaze action, your
Overwatch Score goes up by **the number of hits the target got on its defense
test** (p. 232). Not net hits — total hits. It happens whether you succeeded or
failed. Nothing in the book prices a mark.

The book's own worked example on that page makes it plain: a decker Brute
Forces a file, gets four hits to the defender's two, and his Overwatch goes up
by **two** — the defender's hits. He then cracks the file, gets four hits again
but the defender gets three this time, and his Overwatch goes up by **three**.
Same action, same decker, same number of hits by him, different Overwatch cost,
because the *defender* rolled differently.

So the multiplier is fiction twice over. There is no per-mark price, and even
if there were, the number depends on a roll this app never makes.

**Verdict: wrong. Remove the number entirely.** The GM rolls the defence at the
table, reads off the hits, and types that number in. The prompt keeps the typing
box and loses the suggestion.

Two smaller things wrong in the same panel while we're here: the button tooltips
print the wrong dice for both actions. Brute Force is Cybercombat + Logic
against Willpower + Firewall (p. 238); Hack on the Fly is Hacking + Logic
against Intuition + Firewall (p. 240). The panel currently names "Cracking",
which is the skill *group*, not a skill.

### 2. Direct connection gives a mark — WRONG

**What the code says:** click Direct Connection, and one mark lands on the host
for free.

**What the rules say:** a direct connection is a cable. What it buys you is
(p. 232): you ignore all noise, and you ignore the penalties for being on a
different grid or on the public grid. Nothing else. Not a mark.

There are exactly three ways to get a mark on something (p. 236): the icon
invites you, you Brute Force it, or you Hack on the Fly. A cable is none of
those.

What the cable *actually* does that matters tactically is on p. 233. Normally a
weak device slaved to a big host borrows the host's ratings to defend itself —
a rating-2 smartgun defends with the decker's Firewall. **Attack it through a
direct connection and it can't do that any more.** It has to defend with its own
feeble ratings. That's the reason to run a cable, and the app doesn't currently
say it.

There *is* a real path from "cable" to "mark on the host", and it's worth
knowing because it's probably what whoever wrote this was half-remembering:
if the device you jack into is slaved to the host — a WAN — then marking the
*device* also marks the *host* (p. 233), and that works even through a direct
connection. But you still have to hack the device. The mark is earned, not
granted.

**Verdict: wrong.** The button should set the connection method, note that noise
is zero and the target defends on its own ratings, and place no marks. The
"0 Overwatch" part of the current label is correct — plugging in is not an
Attack or Sleaze action, so nothing accrues (p. 232).

### 3. Alert tier at Overwatch 20 — WRONG, and already ruled

**What the code says:** the decker card colours the Overwatch chip "alert" at
20 and "convergence" at 40.

**What the rules say:** there is one Overwatch threshold in SR5 and it is 40
(p. 232). Nothing happens at 20.

You already ruled on this — RULINGS.md, 29 August, "Overwatch Score banding
below 40 is display-only" — and the fix was applied in six other places. The
ported decker card is a seventh that got missed.

**Verdict: wrong, and not a new decision.** The decker card must use the same
shared colour-banding helper the participant badge already uses, whose cut
points are labelled in the code as arbitrary decoration.

### 4. Health bars on hosts and files — WRONG

**What the code says:** a file gets 8 boxes of Matrix health, and a host gets
8 + half its rating.

**What the rules say:** one sentence settles it (p. 229) — hosts and files
can't be attacked with Matrix damage, so they don't have Matrix Condition
Monitors. Files don't even have ratings of their own; when something attacks a
file, it defends using its *owner's* ratings (p. 227).

Things that *do* have a Matrix Condition Monitor: devices, at 8 + half the
Device Rating, rounded up (pp. 228, 48). IC and sprites (p. 229). A persona
doesn't have its own — damage to a persona lands on the device it's running on
(p. 228), so a decker's persona health *is* their deck's health. Technomancers
have none at all; Matrix damage to them turns into Stun damage on their body
(p. 229).

**Verdict: wrong.** Hosts and files should show no health at all. There is a
related bug in the same function: personas and IC entered through the hierarchy
editor always come out with exactly 9 boxes regardless of what you typed,
because the code passes a hard-coded 1 where the rating should go.

### 5. Marks equal your hits, capped at 3 — WRONG, twice over

**What the code says:** after you roll, marks gained is set to your number of
hits, capped at 3.

**What the rules say:** that is not how marking works at all. You decide *before
you roll* how many marks you're going for (pp. 238, 240). Going for one is free.
Going for two costs you 4 dice off the pool. Going for three costs you 10. Then
you roll, and if you win the opposed test you get the number you declared. Your
hits do not determine your marks.

Hits do matter, just not for that. On Brute Force, every two clear net hits lets
you optionally do a point of Matrix damage (p. 238). On Hack on the Fly, every
two clear net hits gives you a hit's worth of Matrix Perception, so you learn
something while you're marking (p. 240).

The cap of three is real (p. 236) — but note being an *owner* counts as having
four, which is a separate status rather than a fourth mark.

**Second problem, and this one is a scope question rather than a rules
question.** Even with the right formula, the app deciding whether the hack
worked is the app resolving an opposed test, which `SCOPE.md` puts out of
bounds. See "Scope questions for you" below.

**Verdict: the formula is wrong.** Whether the app should be in this business at
all is your call.

### 6. IC initiative dice: 2 for Patrol, 4 for others — WRONG on the dice, GAP on the rest

**What the code says:** Patrol IC rolls 2 initiative dice, all other IC roll 4.
The comment cites "Table 4 / Table 24".

**What the rules say:** every IC program is treated as if it were in hot-sim, so
**every IC gets 4D6 initiative dice** (p. 247). There is no exception for
Patrol. The claimed source doesn't exist — SR5 doesn't number its tables that
way, and this is the same phantom-citation habit as the "Section 9.2 / Table 25"
one you already threw out.

You were right to insist these not be conflated. Patrol IC's *dice pool* is
genuinely different from other IC's — its entry literally prints "Attack: n/a"
because it has no attack at all; it wanders the host running Matrix Perception
on everyone (p. 248). But that has nothing to do with how fast it is.

**Now the gap.** The book says IC has "its own Initiative Score" and gets 4D6.
It never says what the dice get added to. Hot-sim initiative is Data Processing
plus Intuition (pp. 159, 230), and IC uses its host's Matrix attributes (p.
247), so Data Processing is easy. But IC has no Intuition. The book leaves the
other half blank.

The app currently uses Host Rating × 2. That's not printed anywhere — though
it's not a crazy guess, because autonomous drones do exactly that with Pilot
Rating (p. 270), and sprites are described as having initiative "based on their
Level" (p. 254). **This is a decision for you.** See "Rulings needed".

### 7. "Marks are placed on the host, not on individual icons" — WRONG

**What the code says:** a comment in the player view states this as fact with no
citation, and a function is built on it that shows a player their host mark
count by taking the highest mark count across everything in the host.

**What the rules say:** marks go on individual icons, and the book says so
repeatedly:

- The definition of a mark lists what can carry one: devices, personas, files,
  grids and hosts (p. 236), each up to three.
- The Overwatch example on p. 232 has a decker Brute Force a file and get a
  mark **on the file**.
- Editing a file needs one mark **on the file**; the host it lives in is the
  defender, not the mark-holder (p. 239).
- Entering a host needs one mark **on the host** (p. 239) — a separate mark from
  anything inside it.
- Matrix Perception can tell you "the marks on an icon" (p. 235).

There are two true statements nearby that this claim looks like a garbling of.
First, a host and all its IC **share the marks they place on you** — if one IC
marks you, they all have you marked, and so does the host (p. 247). That's the
defenders' marks on the intruder, the opposite direction. Second, marking a
device slaved to a host also marks the host (p. 233).

**Verdict: wrong.** The comment must go, and the player view's host mark count
must read the host's own marks rather than guessing from the contents.

---

## The two things you wanted preserved

**Hiding Overwatch Score from players — keep it, it's correct.** The book says
outright that the gamemaster keeps your Overwatch Score secret from you, and
that you learn it either by spending a Simple Action on the Check Overwatch
Score action or by running the Baby Monitor program (pp. 232, 238, 245). The
player view is right to show the VR mode chip and no Overwatch number. Worth
knowing: Check Overwatch Score is itself a Sleaze action, so asking the question
raises the number (p. 238) — a nice bit of table tension the tracker doesn't
need to model.

**IC Matrix health of 8 + half the host rating — reasonable, but the ruling is
not in `RULINGS.md`.** The analyst read the file end to end and found no entry
about IC condition monitors, under "M1" or any other name. That is correct and
explains itself: the M1 ruling was written on `feat/matrix-v2`, in the Step 3a
commit that this port deliberately dropped. It never reached this branch. The
formula itself is a sensible house rule — sprites get 8 + half their Level
(p. 254) and devices get 8 + half their Device Rating (p. 228), so 8 + half the
Host Rating is the obvious extrapolation — but the book never states it, and on
this branch it is currently unruled. See "Rulings needed".

---

## Not building — and why

These came out of the research and are staying out of the app.

- **Working out how much Overwatch a hack costs.** That needs the defender's
  dice roll, and rolling the opposition's defence is resolving an opposed test.
  The GM rolls it; the app records the answer.
- **Deciding whether a hack succeeded.** Same reason.
- **The dice-pool penalties for greedy marking** (−4 for two marks, −10 for
  three, pp. 238/240). Those are modifiers on a roll the GM is making. The app
  never sees that pool.
- **Applying noise to dice pools.** Noise is a per-roll modifier and never
  applies to defence or resistance tests (p. 231). Displaying the current noise
  level is useful; subtracting it from anything is not our job.
- **Every IC program's attack, damage and side effects** — Acid stripping
  Firewall, Black IC link-locking, Scramble forcing a reboot, and so on (pp.
  248–249). The app tracks that an IC exists, where it is, its initiative and
  its damage. What it does on its turn is the GM's.
- **Convergence consequences.** At Overwatch 40 the demiGOD hits you for 12 DV,
  forces a reboot, erases your marks and reports your physical location (p.
  232); inside a host it instead gives the host three marks on you and starts
  deploying IC (p. 247). The app should flag that 40 was crossed. It should not
  fire any of that off by itself.
- **Enforcing the host's IC limits.** The rules cap a host at one IC launched
  per Combat Turn, its rating in IC total, and no two of the same type at once
  (p. 247). The spawner currently blocks the last two outright. Per `SCOPE.md`
  the app doesn't enforce legality — GMs override constantly — so these should
  warn rather than refuse. Small point; flagged in the spec.

## Scope questions for you

Answering any of these "yes" may mean adding a line to `SCOPE.md`, since they
sit on the boundary it draws.

**A. Should the Hack on the Fly / Brute Force panel keep its dice roller?**

`SCOPE.md` explicitly allows the app to roll dice when the GM asks it to, and
also explicitly forbids resolving opposed tests. This panel currently does both:
it rolls the decker's attack, then decides from the result how many marks were
gained.

- *For keeping the roller:* the GM is going to roll those dice somewhere, the
  app already has a dice roller, and having it in the panel means the roll lands
  in the shared log where players can see it — which is your default per the
  31 July visibility ruling.
- *Against:* it puts the resolution machinery right next to the roll and invites
  someone to reconnect them later.

*Recommendation:* keep the roller, sever the wire. The roll reports hits and
nothing more. Marks gained and Overwatch delta are both typed by the GM.

**B. Should the app track noise at all?**

`SCOPE.md` names marks, Overwatch, positions and initiative as trackable, but
doesn't mention noise. Noise is a number that changes with distance, terrain and
jamming (p. 231) and is genuinely annoying to hold in your head.

- *For:* it's exactly the kind of fiddly running total the app exists to hold,
  and a direct connection zeroing it (pp. 231, 232) is a nice visible
  consequence of a GM decision.
- *Against:* it's only ever a dice modifier, and the moment the app displays it
  people will expect it to apply it.

*Recommendation:* track and display it, never apply it, and label it as a
reminder. If you say yes, add "noise level" to the in-scope list in `SCOPE.md`.
Note this is the same thing you asked for earlier in the session — tracking dice
pool modifiers for noise, grids and so on — so a yes here also re-opens that as
future work.

**C. Should the player view show Matrix damage on icons?**

Right now the player view shows every icon's damage *and* its maximum. In the
fiction a player only learns an icon's damage by spending an action on Matrix
Perception (p. 235), and the maximum isn't on the list of things Matrix
Perception can tell you at all. You also ruled on 13 August that condition
monitor maximums never appear in any log.

- *For showing it:* it's the Matrix equivalent of seeing a wounded enemy, and
  the tracker's whole value is shared visible state.
- *Against:* it hands players information the rules make them work for, and the
  maximum in particular is the "how many more hits until it drops" number your
  13 August ruling deliberately withheld.

*Recommendation:* keep the damage, drop the maximum, matching the 13 August
reasoning. But this is a table-feel call, not a rules call.

**D. Should the IC roster be completed?**

The app offers 7 IC types. The book prints 14 — the missing ones are Binder,
Black IC, Crash, Jammer, Marker, Probe and Track (pp. 248–249). Black IC in
particular is the one that hurts people in the meat world.

- *For:* it's a data list, cheap, and a GM who wants Black IC currently can't
  spawn it.
- *Against:* it's a content addition, not a correctness fix, and this pass is
  meant to be a correctness pass.

*Recommendation:* out of scope for this pass; worth a backlog item.

## Rulings needed

Two genuine holes in the rulebook. Neither should be filled by an implementer
guessing.

### Ruling 1 — What number do IC's four initiative dice get added to?

The book gives IC 4D6 and an Initiative Score, then never says what the base is
(p. 247). IC has no Intuition, which is the missing half of the hot-sim formula.

Your options:

- **(a) Host Rating × 2.** What the app does today. It matches how the book
  handles autonomous drones — Pilot Rating × 2 plus dice (p. 270) — and IC is
  the same kind of thing: a program acting on its own. Simple, and a Rating 6
  host gives its IC an Initiative of 12 + 4D6, which is fast and feels right for
  a corporate host.
- **(b) The host's Data Processing + the Host Rating.** Closer to the actual
  hot-sim formula, with the Host Rating standing in for the missing mental
  attribute — which is precisely the substitution the book makes elsewhere, both
  as a general rule for icons that lack a mental attribute (p. 237) and in a
  worked example where an IC's rating stands in for Willpower (p. 239). Slightly
  higher numbers, since a host's Data Processing is its rating plus up to 3.
- **(c) Leave it blank and let the GM type it.** Consistent with your 30 August
  ruling on Data Processing, where you decided a made-up number that looks
  authoritative is worse than an obvious blank.

*Recommendation: (a).* It's the number already in the code, it has a real
printed analogue in the drone rules, and unlike the Data Processing case it
isn't standing in for a value a specific published character actually has —
there is no "true" number being hidden. Whichever you pick, the app should label
it as a house rule so nobody later files it as a bug. (b) is the more
rules-flavoured answer if you'd rather derive it.

### Ruling 2 — How many Matrix damage boxes does an IC program have?

The book says each IC has its own Condition Monitor (p. 247) and never sizes it.

- **(a) 8 + half the Host Rating, rounded up.** What the app does. Matches the
  shape of every other Matrix condition monitor in the book — devices use 8 +
  half Device Rating (p. 228), sprites use 8 + half Level (p. 254) — with the
  Host Rating as IC's only available rating.
- **(b) GM-entered per IC.**

*Recommendation: (a).* This is the same answer you gave as "M1" earlier in the
session; that ruling was written on `feat/matrix-v2` and dropped with the rest
of that branch, so it needs re-recording here rather than re-deciding.

### A third, smaller hole worth knowing about

When two IC of the same host roll the same Initiative Score, the tie-break
ladder is Edge, then Reaction, then Intuition, then a coin toss (p. 159). IC has
none of those three attributes. So IC-versus-IC and IC-versus-decker ties fall
straight through to the coin toss. That's not wrong, it just means the app's
tie-breaker will always coin-toss for IC. Flagging it so it isn't reported as a
bug later. No decision needed unless you want a different rule.

---

## What's affected, and what might break

The change touches five of the ten Matrix components, plus one shared service
that is already correct and just needs to be used by one more caller.

- **The host access panel** loses its Overwatch suggestion arithmetic and its
  automatic mark placement, and gains corrected action descriptions. The GM now
  types the Overwatch number. This is the most visible change at the table: a
  step that used to fill itself in now asks a question.
- **The decker card's** Overwatch colouring changes at 20 — a chip that used to
  turn amber at 20 will now stay green until 30, because the colour bands are
  spaced differently from the fake alert tier. Cosmetic, but you'll notice it.
- **The hierarchy editor** stops giving hosts and files health bars. Any host or
  file already saved in a session will still carry a stale health number in its
  data; the display should ignore it.
- **The IC spawner's** initiative preview changes for Patrol IC only — it will
  now preview the same 4D6 range as every other IC. Patrol IC gets meaningfully
  faster.
- **The player view** stops guessing host marks from the contents of the host
  and reads the host's own count. If a decker has marks on a device inside a
  host but not on the host itself, the player view will now correctly show zero
  host marks where it previously showed the device's count. That's the fix
  working, but it will look like marks disappeared.

None of this is wired into the battle tracker yet, so nothing in live play
changes until that separate piece of work happens.

---

# Implementation appendix — what the code actually looks like

## 1. Almost none of this code is switched on, and almost none of it is checked

Nine of the ten Matrix screens are not reachable from the running app. That was
expected. What was not expected: because they are unreachable, the compiler
**never looks at them**. The build and the test suite both start from the app's
entry point and follow the imports, and these files are not on any of those
paths. So "it compiles and 1054 tests pass" says nothing at all about them.

The one exception is the small Overwatch chip that sits next to a decker's name
in the initiative list. That one *is* live.

The practical consequence: the moment we write the first test for any of these
screens, the compiler will look at them for the first time, and it will find at
least two errors that have nothing to do with rules (below). Budget for that. It
is a good thing — the compiler finally doing its job — but it will look like the
rules pass broke something when it did not.

## 2. Three things are broken independently of the rules

- **The hacking panel's dice roller does not work.** The roller hands back a
  small package containing the dice *and* who rolled them; the panel is written
  as though it gets only the dice. As soon as anyone clicks Roll, the panel would
  fall over. It has never been clicked, because the screen has never been on.
- **The hacking panel's dice roll is invisible.** The argument for keeping the
  roller was that the roll lands in the shared log where players can see it. It
  does not. Rolls made in this panel go nowhere — no log, no players, no record.
  If you want that, it is a small addition, but it is an addition, not something
  we are preserving.
- **The live Overwatch chip has no colour.** The chip next to each decker's name
  asks for one of four colours — quiet, building, high, convergence — and the
  stylesheet only defines the old, wrong set. So right now, in the app you are
  actually running, a decker's Overwatch chip is uncoloured at any score below
  40. This is a real, visible, present-day bug, and Claim 3's fix repairs it.

## 3. Ruling 1 was already decided — and the answer is (b), not (a)

The analyst recommended **Host Rating × 2** for IC's initiative base, believing
nothing was recorded. The scoper found a note in this repo saying otherwise, and
I have since confirmed it directly: there is a full ruling dated **28 August**
on the abandoned `feat/matrix-v2` branch, titled "IC Initiative Attribute = Host
Data Processing + Host Rating". That is option **(b)**. You made that call this
session; it was lost when we dropped that branch.

It is also the better-argued answer. Your own recorded reasoning notes that Host
Rating × 2 appears on the *adjacent line* of p. 247 as the IC **attack dice
pool** — an unrelated quantity — so the old code's initiative number is almost
certainly a transcription slip from one line to the next. That is a stronger
case than the analyst's drone analogy, and the analyst did not have it.

**So this is not a fresh decision, it is a restoration.** Unless you want to
change your mind, Ruling 1 is settled as (b) and the code changes to match.

Practical difference on a Rating 4 host with Data Processing 7: option (a) gives
IC initiative 8 + 4d6, option (b) gives 11 + 4d6. Option (b) makes IC
meaningfully faster.

**Three other Matrix rulings you made on 28 August were lost the same way** — a
VR decker is incapacitated and is not a second initiative row; a host is not an
initiative participant and perceives only through its IC; IC launched at the
start of a Combat Turn rolls normally and acts that turn. All should be restored
to `RULINGS.md` alongside Ruling 1 and the IC-health ruling.

## 4. The player view cannot yet show host marks, and the fix is slightly bigger

Claim 7 says the player view should read the host's own mark count. Correct. But
the player's screen is never *sent* that number — the only thing it receives
about the host is its name. So "read the host's own count" means adding one
small piece of information to what the GM's machine sends players. Genuinely
small, and nothing else depends on it, but it is not the pure deletion the brief
implies.

## 5. The IC health preview and the actual IC disagree already

The IC spawner previews a health track of "8 plus half the host rating" — 9
boxes for a Rating 4 host. The IC that would actually be created gets the app's
generic default of 10, because nothing ever copies the previewed number onto it.
Nobody has noticed because nothing has ever spawned an IC. Whatever you rule for
IC health, that wire has to be connected, not just the number corrected.

## 6. The IC spawner refuses spawns, which `SCOPE.md` says it shouldn't

The spawner greys out the Spawn button when the host is at its IC limit or
already runs that type. `SCOPE.md` says the app does not enforce legality,
because GMs override the rules constantly. The analyst classified this out of
scope — meaning "don't build it" — but it is already built, so classifying it
out of scope leaves it in place. That is a decision, not an omission: do you
want the spawner to **warn and allow**, or to keep refusing? Recommended:
warn-and-allow, matching `SCOPE.md`. Ten minutes of work.

## How big this is

About three days in one go, which is right at the edge of what `SCOPE.md` says
should be split. Recommended split, which falls out naturally along the rulings:

- **Part A — nothing blocked, do it now (~1.5 days).** The Overwatch arithmetic,
  the direct-connection mark, the Overwatch colour bands (which fixes the live
  chip), the host-marks reading, the wrong dice-pool text on the buttons, and
  clearing the resolved claims out of the unverified-rules file.
- **Part B — needs both rulings (~1.5 days).** Health tracks for devices,
  personas, hosts, files and IC; and IC initiative. All the blocked work, all in
  the same handful of functions.

Part A is independently useful and independently testable. Ship it first.

## What will visibly change — corrections to the estimate above

- **The Overwatch chip changes colour earlier, not later.** The real bands are
  15, 30 and 40. So a chip that turned amber at 20 will now change at **15** —
  and the live chip in the initiative list, currently uncoloured below 40, will
  start having colours at all.
- **The "IC ALERT" label on the decker card disappears.** A leftover branch there
  would print "IC ALERT" next to the Overwatch score. It can never fire, but it
  is exactly the fiction you killed once already.
- **The hacking panel's roller starts working.** Currently it would crash. After
  this pass it reports hits and nothing else.

## What I need from you, beyond what the analyst asked

1. **IC initiative base** — confirm (b) host Data Processing + Host Rating,
   restoring your 28 August ruling. *Recommended: yes, restore it.*
2. **IC health** — confirm 8 + half the host rating. *Recommended: yes.*
3. **The IC spawner's refusals** — warn or refuse? *Recommended: warn and allow,
   per `SCOPE.md`.*
4. **Should rolls made in the hacking panel go into the shared log?**
   *Recommended: yes — it is why keeping the roller is worth anything.*
5. **Split into Part A and Part B?** *Recommended: yes, and start Part A now.*

---

# Xavier's decisions — 2026-09-01

These answer every open question above. They are binding on the implementation.
Where they contradict a recommendation earlier in this brief, **these win**.

## Rulings — all five restored as originally recorded

The five Matrix rulings made on 2026-08-28 were lost when `feat/matrix-v2` was
abandoned. They are **restored, not re-decided**:

1. **IC Initiative Attribute = Host Data Processing + Host Rating, plus 4D6.**
   This settles Table Ruling 1 as option **(b)**, against the analyst's
   recommended (a). The 4D6 is printed (p. 247); the base attribute is the house
   rule. `Host Rating × 2` is rejected: it appears on the adjacent line of p. 247
   as the IC **attack dice pool**, an unrelated quantity, and the ported code
   almost certainly copied the wrong line. The value must be exposed as an
   **editable per-IC field** so it can be overridden at the table.
2. **IC Matrix Condition Monitor = 8 + ceil(Host Rating / 2).** Settles Table
   Ruling 2 as option (a).
3. **A VR decker is incapacitated, and is not a second initiative row.**
4. **A host is not an initiative participant; it perceives only through its IC.**
5. **IC launched at the start of a Combat Turn rolls normally and acts that
   turn.**

All five go into `RULINGS.md` in Stage 5, carrying their original 2026-08-28
date and reasoning plus a note that they were restored on 2026-09-01.

**Consequence for AC-24:** `ICParticipant.baseIni` and
`ICSpawnerComponent.initiativeBase` become `host Data Processing + Host Rating`,
not `hostRating * 2`. The spawner needs a host Data Processing input, and the IC
initiative base must be editable per IC after spawn. `ARCHITECTURE.md:574-575`
must be updated to match.

**Consequence for AC-25:** unblocked as written — `8 + ceil(Host Rating / 2)`,
via the shared `matrixConditionMonitor()` helper, actually written onto the
`ICParticipant` rather than only previewed.

## Scope questions — all four approved, A and A′ later withdrawn

> **Withdrawn 2026-09-02.** Scope Questions A and A′ below were approved
> 2026-09-01 and then withdrawn the next day by Xavier's binding decision 2:
> "I'm not aware of a dice roller other than the one that already exists in
> the battle tracker, the matrix module should not have a separate dice
> roller." Left in place rather than deleted so the reversal stays legible —
> the Matrix module has **no dice roller of its own**; see `RULINGS.md`
> 2026-09-02, "The Matrix module has no dice roller of its own", and
> `SCOPE.md`.

- **A. ~~Keep the dice roller, sever the wire.~~ WITHDRAWN 2026-09-02.** The
  hacking panel keeps its
  roller; it reports hits and nothing else. Marks gained and the Overwatch delta
  are both typed by the GM. Approved 2026-09-01; withdrawn 2026-09-02 — the
  panel now has no roller at all.
- **A′. ~~Rolls made in that panel go to the shared log.~~ WITHDRAWN
  2026-09-02.** This is **new work**,
  not preservation — the panel currently logs nothing (see appendix section C3).
  Wire the panel's roll through the same path the battle tracker uses at
  `battle-tracker.component.html:1048-1054`, so the roll is visible to players
  per `RULINGS.md` 2026-07-31. Approved 2026-09-01; withdrawn 2026-09-02 along
  with A — moot once the panel has no roller to log.
- **B. Track noise, never apply it.** Display the current noise level as a
  reminder; never subtract it from any pool. `SCOPE.md` gains a "noise level"
  line in Stage 5. Approved.
- **C. Player view: keep Matrix damage, drop the maximum.** Matching
  `RULINGS.md` 2026-08-13. This resolves the AC-15 collision flagged in appendix
  section D — `matrix-player-view.component.html:46-53` renders damage only, for
  every target type, and hosts and files render no monitor at all. Approved.
- **D. Completing the IC roster** was not approved and stays in the backlog. The
  app keeps its seven IC types.

## The IC spawner, and legality in general

Xavier updated `SCOPE.md` rather than answering yes or no: **"we should enforce
legality to a degree, we may need to discuss on a per feature basis possibly.
The tracker should be helping the DM follow the rules but may need to be
flexible sometimes."**

`SCOPE.md`'s "Enforcing legality" line has moved from **Out of scope to In
scope**, reworded to say enforcement is decided per feature, that the tracker
should help the GM follow the rules while staying flexible, and that **the
default is to warn rather than refuse**.

**For the IC spawner specifically:** warn, don't refuse. Keep both rules
visible — one IC per Combat Turn, up to Host Rating in IC at once, no two of the
same type (p. 247) — as a prominent warning, and let the GM spawn anyway.
Concretely: `canSpawn` no longer gates on `atCap` or `isDuplicateType`;
`validationMessage` stays and becomes the warning text; the `[disabled]` binding
on the `<option>` elements is dropped so every IC type stays selectable.

This supersedes the spec's "OUT OF SCOPE — refusing an IC spawn" classification.
The rules are still tracked and still shown; only the hard block goes.

## Size

**One pass, not split.** All seven claims land together. Both Table Rulings are
answered, so nothing is blocked and the Part A / Part B split in appendix
section L is moot. Implement in the order given in appendix section G — the two
latent defects first, then Claim 3, then Claims 1, 2, 7, then 4 and 6.

---

# Xavier's decisions — 2026-09-02

Four binding decisions, superseding the parts of this brief and its
implementation spec (`briefs/matrix-port-rules-correctness-spec.md`) they
touch:

1. **Marks are recorded, never derived.** "marks are just recorded and
   tracked by the app, we aren't doing any rolls outside the already existing
   dice roller if the user chooses to use that over their own physical dice
   and we aren't comparing any dice either."
2. **The Matrix module has no dice roller of its own** — withdraws Scope
   Questions A and A′ above (2026-09-01, "keep the roller, sever the wire" /
   "route the roll to the shared log"), which are left marked withdrawn
   rather than deleted so the reversal stays legible. "I'm not aware of a
   dice roller other than the one that already exists in the battle tracker,
   the matrix module should not have a separate dice roller."
3. **Four more Matrix rulings restored**, dated 2026-08-29 on the abandoned
   `feat/matrix-v2` branch alongside the five already restored 2026-09-01: VR
   Initiative Dice are absolute; marks propagate from a slave toward the
   master's three-mark cap; Matrix damage applies no penalty until the
   monitor is full; this module tracks Matrix state and does not apply
   effects. See `RULINGS.md`, each marked "Restored 2026-09-02".
4. **IC has a Matrix Condition Monitor only.** The inherited 10-box Stun
   track has no printed backing for IC and is dropped; `ICParticipant`
   overrides `wm` (always 0, matching the restored "no penalty until full"
   ruling) and `ooc` (Matrix monitor plus the manual-OOC flag only) rather
   than reading the inherited Stun fields. See `RULINGS.md` 2026-09-02, "IC
   has a Matrix Condition Monitor only; the inherited Stun track is dropped".
