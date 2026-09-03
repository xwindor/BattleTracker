# Matrix Condition Monitors & Access Methods — verification

**Date:** 2026-08-29 · **Branch:** `feat/matrix-v2`
**Source:** SR5 Core Rulebook only (`rules/pages`). Data Trails, Rigger 5.0 and
the other cross-referenced books are **not** in `rules/`; anything traceable
only to them is reported as not found.

Companion to `briefs/matrix-rules-verification.md` (initiative, Overwatch,
noise, silent running, mark cap). This brief covers what that one did not:
damage tracks and how a decker gets in.

---

## Correction to the earlier brief

`briefs/matrix-rules-verification.md` item C11 said hosts "cannot be attacked
(p. 228)". **Both the page and the scope were wrong**, and the same error had
reached `RULINGS.md` and the plan. All three are corrected as of 2026-08-29.

The rule is **p. 229**: hosts and files cannot be attacked *with Matrix damage*,
which is why they have no Matrix Condition Monitor. That is narrower than
"cannot be attacked". A host **can** be Brute Forced or Hacked on the Fly for
marks (pp. 238, 240), Matrix Perceived (p. 241), and it defends Edit File tests
against files it holds (p. 239). Brute Force's own damage rider says so: it
applies only "if the target can take Matrix damage" (p. 238).

**Net effect for the tracker: a host gets a mark counter and no damage bar.**
The conclusion that a host is never an initiative participant is unaffected —
it still has no Initiative Score.

---

## Matrix Condition Monitors — confirmed

| Entity | Monitor | Page |
|---|---|---|
| **Device** | `8 + (Device Rating ÷ 2)`, round up | 228 (rounding, p. 48) |
| **Cyberdeck / persona** | Same formula on the deck's Device Rating | 227 |
| **Persona** | **None of its own** — "When a persona is hit for damage, the device it is running on takes that damage" | 228 |
| **Agent** | Shares the monitor of the deck it runs on | 246 |
| **Sprite** | `8 + (Level ÷ 2)`; Device Rating = Level | 254 |
| **Host** | **None** — cannot take Matrix damage | 229 |
| **File** | **None** — same rule | 229 |
| **Technomancer** | **None** — Matrix damage becomes Stun on their person, *with* the normal wound modifier | 229, 251 |
| **Drone** | **Two** tracks, Physical and Matrix; Device Rating = Pilot Rating | 269, 270 |
| **IC** | Has one (pp. 229, 247) — **size never stated**. See ruling M1 | — |

Worked values: DR 1 → 9, DR 2 → 9, DR 3 → 10, DR 4 → 10, DR 5 → 11, DR 6 → 11.

### The rule most likely to cause a bug

> **"There is no penalty for having Matrix damage until your Matrix Condition
> Monitor is completely filled" (p. 228).**

No dice penalty, no rating reduction, nothing — a deck at 8 of 9 boxes performs
exactly like a fresh one. **This is the inverse of every other damage track in
this app**, which applies a wound modifier as it fills. Copying the existing
damage code is the single most likely defect in this work.

### When a track fills

- **Device** — bricked: stops working, "damaged and useless until it is
  repaired" (p. 228).
- **Deck you were in VR on** — dumped from the Matrix plus dumpshock, 6S
  cold-sim / 6P hot-sim; resisted Willpower + Firewall, but the deck is bricked
  so there is no Firewall and it is Willpower alone; −2 on all actions for
  (10 − Willpower) minutes (pp. 228, 229).
- **IC** — crashes and vanishes from the host; the host may run a fresh copy at
  the start of the next Combat Turn (p. 247). IC "can be delayed, but never
  permanently destroyed" (p. 356).
- **Drone** — Physical full = irreparably destroyed; Matrix full = bricked
  (p. 270). A jumped-in rigger is dumped and takes dumpshock either way
  (pp. 266, 269).

### Repair

Toolkit, one hour, Hardware + Logic [Mental]. Each hit removes one box **or**
halves the remaining time, floor of one Combat Turn. The device is off-line and
unusable throughout, bricked or not. Critical glitch = permanently bricked;
glitch = restored but flaky (p. 228). Drone Matrix damage repairs the same way
(p. 270). **Matrix damage therefore persists between runs.**

**IC and sprites are the exception**: they cannot be repaired at all, but lose
all damage the moment they stop running or return to the Resonance (p. 229).

### Visible to players?

Matrix Perception can reveal "the number of boxes of Matrix damage on the
target's Condition Monitor" (p. 235) — so a GM-visible/player-visible toggle is
rules-supported rather than an app convention.

### Attribute reduction is NOT damage

Four IC types each knock 1 off a specific Matrix attribute per hit — **Acid →
Firewall, Binder → Data Processing, Jammer → Attack, Marker → Sleaze**.
Cumulative, and lasting **until the targeted device reboots** (p. 248) — not
cleared by repair. Once that attribute is at 0, further hits do 1 DV Matrix
damage per net hit instead.

Because Data Processing feeds VR Initiative (p. 231), a Binder hit moves the
decker in the initiative order mid-turn under Changing Initiative (p. 160).
This needs its own counter, separate from the damage track.

---

## Access methods — confirmed

**Hack on the Fly** (p. 240): Complex Action, 0 marks needed, Hacking + Logic
**[Sleaze]** v. Intuition + Firewall. One mark on success, cap 3. Every two full
net hits also counts as one Matrix Perception hit. Declare two marks at −4 or
three at −10 *before* rolling.

**Brute Force** (p. 238): Complex Action, 0 marks needed, Cybercombat + Logic
**[Attack]** v. Willpower + Firewall. One mark, cap 3, same −4/−10. Optional
rider: 1 DV Matrix damage per two full net hits, only against something that
*can* take Matrix damage, resisted Device Rating + Firewall.

**The lasting difference is noise, not the mark.** A successful Brute Force
makes the target aware it is under attack, and it will usually alert its owner
and launch IC — though it does not automatically spot you (p. 236). A successful
Hack on the Fly raises visibility not at all (p. 236). A *failed* Brute Force
costs 1 box of unresistable Matrix damage per net hit the defender scored; a
*failed* Hack on the Fly hands the target a free mark **on you**, spots you, and
triggers the owner-alert / IC launch (p. 231).

**Direct Connection** (pp. 232–233, 355) — a cable into the target's universal
data connector. It zeroes **all** noise and **all** grid/public-grid modifiers,
and a slaved device attacked this way **cannot use its master's ratings to
defend**. It grants **no marks by itself**. Two things easy to get wrong:

- A mark you *earn* on a slave also lands on the master, explicitly "even if the
  slave was marked through a direct connection" (p. 233; worked example p. 224 —
  mark the bank's maglock, an identical mark appears on the bank host). That is
  the point of the tactic, and it is propagation of a mark you had to win, not a
  free one.
- **"Directly connected" is not only a cable.** Inside a host with a WAN you
  count as directly connected to every device in that WAN (p. 233). The app must
  be able to *derive* the state, not merely have the GM tick it.

### Access levels do not exist in the CRB

The entire access model is **0–3 marks plus a separate owner relationship**
worth the equivalent of four marks (p. 236). Spiders are described as already
holding owner marks on everything in their system (p. 356), and p. 236 uses
"administrator" in passing — neither is a mechanic. The tiered user/security/
admin model is a **Data Trails** concept; the CRB's index points marks at
"DT 168-69" and Data Trails is not in `rules/`. **Build the mark model; leave
room. Do not invent tiers.**

### Is the access method live state, or a log note?

**By the book, a log note.** Once the marks land, no rule cares whether they
came from Brute Force or Hack on the Fly. There is even a line arguing against
a lasting "illegally acquired" flag: *"While the act of placing a mark is an
illegal activity, the act of simply having a mark is not. Once you have the
mark, you are considered a legitimate user"* (p. 248).

What **is** live state is everything the entry produced: mark count, Overwatch
Score, alerted-or-not, who spots whom.

**Direct connection is the opposite** — genuinely live state, because its
effects last exactly as long as the cable is in (and a rigger loses their jump
if it is yanked from either end, p. 269).

### "Inside a host" is a real tracked state

Enter/Exit Host is a Complex Action needing **1 mark** on the host and no test;
anyone with a mark may enter, anyone inside may exit, and leaving returns you to
the grid you entered from (p. 239). While inside:

- You cannot touch icons outside and outsiders cannot touch you, messages and
  commcalls excepted (p. 246).
- The cross-grid −2 stops applying (p. 233), but the public-grid −2 still
  applies **even in a host** (p. 234).
- Overwatch Score keeps accumulating unchanged (p. 247).
- Convergence inside grants the host three marks on you and starts IC
  deployment instead of burning and dumping you — but stepping outside
  afterwards means immediate demiGOD convergence (p. 247).
- Some IC can pin you inside; mechanically that is link-locking from Black IC,
  Blaster or Tar Baby (pp. 239, 248, 249).

**Marks inside a host are collective in one direction**: "The IC in a host and
the host itself share marks, so if one IC program marks, they all do, and so
does the host itself", and spotting is shared instantly (p. 247).

---

## Open rulings (M1–M10)

Nothing below is decided. Each needs Xavier's call, then a `RULINGS.md` entry.

**M1. IC Matrix Condition Monitor size. — BLOCKING for IC damage tracking.**
The book gives IC a monitor (pp. 229, 247) but never its size, and never gives
IC a Device Rating, which is the number the formula needs. Searched pp. 228,
229, 234, 246–249, 254, 421. *Options:* (1) `8 + (Host Rating ÷ 2)` round up —
same shape as both formulas the book does give (pp. 228, 254), and IC borrows
every other number from its host (p. 247). (2) Flat 8 — most literal if IC has
no rating to halve; keeps IC fragile and fast-cycling, matching "you can't
really win against IC" (p. 246). (3) `8 + (Firewall ÷ 2)` — ties toughness to
the stat that governs Matrix damage resistance, but no precedent for sizing a
monitor.

**M3. IC damage-resistance pool.** Damage is always resisted with Device Rating
+ Firewall (p. 228); IC has the host's Firewall (p. 247) and no Device Rating.
*Options:* (1) Host Rating + Firewall — substitutes the only rating IC has.
(2) Host Rating × 2, mirroring the attack pool (p. 247), but that discards the
Firewall term the damage rule names. Display-only — the app never rolls it.

**M4. Are host/IC marks symmetric?** p. 247 says marks *they* place are shared.
It does not say marks *you* place on one IC land on the host and its siblings.
*Options:* (1) Asymmetric, exactly as written — the symmetric version would let
a decker earn host entry (1 mark, p. 239) by marking whichever IC is nearest,
gutting the Enter/Exit Host requirement. (2) Marking any IC marks the host but
not sibling IC.

**M5. Host convergence grants "three marks on you" (p. 247) — what if it already
had two?** Cap is 3 per icon (p. 236); the book does not reconcile them.
*Options:* (1) Tops up to three, never past — one cap rule everywhere.
(2) Convergence is an explicit exception and stacks — harsher, and produces a
state the mark counter cannot represent.

**M6. Does rebooting clear Matrix damage? — BLOCKING for device damage.**
Never stated. Reboot Device has a defined effect list (p. 242) and this is not
on it; p. 228 says a bricked device is "damaged and useless until it is
repaired". *Options:* (1) No — only repair clears it. (2) Yes — but that makes
Reboot Device strictly better than an hour with a toolkit and quietly deletes
the repair rules.

**M7. Attribute-drain bookkeeping.** Cumulative, cleared by rebooting the
targeted device (p. 248). Deck reconfiguration swaps two Matrix attributes as a
Free Action (p. 228), and the book never says whether the reduction sticks to
the slot or the number. *Options:* (1) Slot-bound — swapping a big raw number
into a damaged slot does not repair it; ruling otherwise makes a Free Action a
free repair. (2) Value-bound. Also decide whether a relaunched copy of the same
IC type restarts the count or piles on.

**M8. Master gets bricked — what happens to its slaves?** Slaves defend using
the master's ratings (p. 233); the book never covers the master being off-line.
*Options:* (1) Slaves fall back to their own ratings immediately, since a
bricked device "stops working" (p. 228) — makes bricking the team commlink a
real opening move, and team gear much more fragile. (2) Slaves keep borrowing.

**M9. "Bricked but still mechanically useful" — blanket or per-device?** The
book explicitly leaves it open: vibrosword still sharp, roto-drone glides down
on auto-gyro, lock stays locked, firing pin dead but bayonet fine (p. 228).
*Options:* (1) Bricked automatically means all Matrix function and all wireless
bonuses gone (p. 421), plus a free-text "still does:" note. (2) Per-device
decision every time.

**M10. Does entering a host break an outsider's spot on you?** Spotting persists
until a successful Hide, reboot or jack out (p. 235); nothing says a host
boundary breaks it, but outsiders cannot interact with icons inside (p. 246).
*Options:* (1) Spot persists, targeting blocked. (2) Crossing clears outside
spots — cleaner to display, no textual support.

*(M2 is the same open question as C2 in the companion brief — IC Initiative
Attribute — already ruled on 2026-08-28 as Host DP + Host Rating.)*

---

## Not found in indexed rules

- Any Matrix Condition Monitor size for IC, or any Device Rating for IC.
- Any user / security / admin access-level mechanic (marks + owner is the whole
  CRB model, p. 236; tiers are a Data Trails concept, not in `rules/`).
- Any statement that rebooting clears Matrix damage.
- Any rule for slaved devices when their master is bricked.
- Any rule for whether a host boundary breaks an existing spot.
- Sprite Initiative Attribute — the Sprite Database table on printed p. 255 is
  an image and extracted blank.

---

## Scope note for this module

The brief surfaced a great deal that is **not** in this module's scope and
should not be built off the back of it: drones and their two tracks, rigger
damage rerouting, technomancer Stun conversion, program effects on damage math
(Virtual Machine, Armor, Shell, Guard, Mugger, Hammer), electricity crossing
from the physical track (p. 171), Data Bombs, and Suppression. They are recorded
here so the rules are not re-derived later, not as a work list.

**In scope now:** device Matrix Condition Monitors, IC Matrix Condition
Monitors, and recording the access method plus direct-connection state.
