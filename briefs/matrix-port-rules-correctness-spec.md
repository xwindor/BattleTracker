# Matrix port rules-correctness — implementation spec

## Request

Correct seven Shadowrun 5e rules claims carried forward by the Matrix
components ported onto `feat/matrix-v3` (commit c1306e9), on a rules-correctness
pass only — not the re-wiring of those components into the battle tracker.

**Scope-boundary note.** The request does not itself move the `SCOPE.md`
boundary, but claim 5 sits directly on it. `access-host-panel.component.ts`
currently rolls a decker's hacking test and derives both marks gained and
Overwatch delta from the result. `SCOPE.md` "Out of scope" forbids "resolving
opposed tests, deciding success or failure, or computing net hits into
consequences", while "In scope" permits "rolling dice when the GM asks for a
roll". The ported code is on the wrong side of that line. Correcting the
arithmetic without severing the derivation would leave a `SCOPE.md` violation in
place with better numbers. This spec assumes severance and flags it as Scope
Question A for Xavier's approval; do not implement the derivation under any
formula.

Two secondary boundary items are raised as Scope Questions B–D. One item (IC
spawn limits) is a `SCOPE.md` "enforcing legality" conflict introduced by the
port and is called out in AC-22.

All citations are SR5 core rulebook, printed page numbers. `rules/pages/pNNNN`
files are offset by +2 from the printed page (verified against `p0234.txt`,
which self-declares "PDF page 234 | printed page 232").

---

## Governing rules

### Overwatch Score accrual

- Performing any Attack or Sleaze action raises your Overwatch Score by the
  number of hits the target rolled on its defense test. Total hits, not net
  hits. (p. 232)
- The book's example on that page: a Brute Force gets 4 hits against the
  defender's 2, and Overwatch rises by 2; a following Crack File gets 4 hits
  against the defender's 3, and Overwatch rises by 3 — "from two to five".
  Nothing about marks enters either figure. (p. 232)
- The example's final action is a Data Processing action, and the text notes his
  Overwatch does not rise for it — confirming accrual is restricted to Attack
  and Sleaze actions. (p. 232)
- All Attack and Sleaze actions are illegal actions. (p. 231)
- Overwatch also rises by 2D6 every fifteen minutes, rolled by the GM in secret.
  (p. 232)
- 40 is the convergence threshold and the only Overwatch threshold in the book.
  (p. 232)
- On a fresh boot your Overwatch is zero. (p. 232)
- The GM keeps a player's Overwatch Score secret. The player learns it via the
  Check Overwatch Score action or the Baby Monitor program. (p. 232)
- Check Overwatch Score: Simple Action, no marks, Electronic Warfare + Logic
  [Sleaze] v. 6 dice. It is a Sleaze action, so it raises the score it reports.
  (p. 238)
- Baby Monitor is a hacking program that means you always know your current
  Overwatch Score. (p. 245)
- IC never accrues Overwatch — it is always considered legal. (p. 248)

### Marks

- Three ways to get a mark: the icon invites you, Brute Force, or Hack on the
  Fly. (p. 236)
- Maximum three marks per icon, unless you are the owner. (p. 236)
- Owning an icon is equivalent to holding four marks on it. Ownership is not a
  fourth mark; it is a distinct status. (p. 236)
- Marks are tied to your persona, cannot be transferred, and are deleted when
  you reboot. (p. 236)
- Rebooting the device your persona is on zeroes your Overwatch and erases all
  your marks and all marks on your icon. (p. 242)
- Marks live on individual icons. Markable icon types named in the book:
  devices, personas, hosts, files, grids. (p. 236)
- Matrix Perception can reveal "the marks on an icon, but not their owners".
  (p. 235)
- You can always spot an icon you have a mark on, without a test, at any
  distance. (p. 235)

### Brute Force (p. 238)

- Complex Action. Marks required: none.
- Test: Cybercombat + Logic [Attack] v. Willpower + Firewall.
- On success you place **one** mark; maximum three per icon.
- Optionally, 1 DV Matrix damage per two full net hits, if the target can take
  Matrix damage, resisted with the target's Device Rating + Firewall.
- **Declared before rolling:** trying for two marks costs −4 dice; three marks
  costs −10 dice.
- Can also be used to hop to a grid illegally: defense is 4 dice (local grid) or
  6 (global). Success hops you rather than marking the grid.

### Hack on the Fly (p. 240)

- Complex Action. Marks required: none.
- Test: Hacking + Logic [Sleaze] v. Intuition + Firewall.
- On success you place **one** mark; maximum three per icon.
- Every two full net hits also counts as one hit on a Matrix Perception Test.
- **Declared before rolling:** two marks costs −4 dice; three marks costs −10.
- Same illegal grid-hop option as Brute Force.

Note for the tooltips: Cybercombat, Hacking and Electronic Warfare are the
individual skills; Cracking is the skill *group* they belong to (p. 144).

### Direct connections

- A direct connection means a cable through a universal data connector. Its
  effect: you ignore all noise modifiers and all modifiers from being on
  different grids or the public grid. (p. 232)
- The noise table lists "Directly connected (any distance)" at noise level 0.
  (p. 231)
- Noise is a negative dice pool modifier and never applies to defense or
  resistance tests. (p. 231)
- A slaved device normally defends using whichever is higher of its own or its
  master's rating, per rating. **Under attack via a direct connection it cannot
  use its master's ratings.** (p. 233)
- If you mark a slaved device you also mark its master, and this holds even when
  the slave was marked through a direct connection. This does not work in
  reverse. (p. 233)
- A WAN's master must be a host and its slaves must be devices. If you are
  inside a host with a WAN you are considered directly connected to every device
  on that WAN. (p. 233)
- Throwbacks — devices with no wireless — can only be reached by jacking in
  directly. (p. 232)
- Where a defense test needs a Mental attribute the icon lacks, the owner's
  rating is used; for a completely unattended device, the Device Rating stands
  in. (p. 237)

### Matrix Condition Monitors

- Every device has one, of 8 + (Device Rating / 2) boxes. Matrix damage is
  always resisted with Device Rating + Firewall. (p. 228)
- Division rounds up unless a rule says otherwise. (p. 48) The book's own
  example on p. 228 has a Rating 2 smartgun with 9 boxes, consistent with either
  rounding at that value.
- When a persona is hit for damage, the device it is running on takes it. A
  persona therefore has no separate Matrix Condition Monitor. (p. 228)
- **Hosts and files can't be attacked with Matrix damage, so they don't have
  Matrix Condition Monitors.** (p. 229)
- Files have no ratings at all; they defend using their owner's ratings.
  (p. 227)
- IC programs and sprites do have Matrix Condition Monitors, and lose all
  damage when they stop running. (p. 229)
- Technomancers have no Matrix Condition Monitor; Matrix damage becomes Stun
  damage on their person, still resisted with their living persona's Device
  Rating + Firewall. (p. 229)
- A sprite's Matrix Condition Monitor is 8 + (Level / 2). (p. 254)
- An agent shares the Matrix Condition Monitor of the device it runs on; any
  attack on the agent damages that device. (p. 246)
- No penalty accrues from Matrix damage until the monitor is completely full,
  at which point the device is bricked. (p. 228)
- A cyberdeck's Device Rating determines its Matrix Condition Monitor. (p. 227)

### IC

- Each IC program has a persona with its own Condition Monitor and Initiative
  Score. **It is treated as if it is in hot-sim, so it gets a total of 4D6
  Initiative Dice in Matrix combat.** No exception is stated for any IC type.
  (p. 247)
- IC uses the Matrix attributes of its host. (p. 247)
- A host's four Matrix attributes are usually Host Rating, +1, +2 and +3 in any
  order. (p. 247)
- IC and its host share marks: if one IC marks, they all do and so does the
  host. They share spotting information the same way. (p. 247)
- IC rolls Host Rating × 2 for any attacks, limited by the host's Attack rating.
  The attack is a Complex Action. (p. 247)
- A host launches one IC per Combat Turn, at the beginning of the turn; it can
  run up to its rating in IC at once and no more than one of each type. A
  bricked IC crashes and vanishes, and can be relaunched at the start of the
  next Combat Turn. (p. 247)
- Hosts launch IC on *spotting* unauthorized activity (p. 247), or when an
  intruder *fails* a Sleaze action (pp. 231, 236). Never off an Overwatch value.
- Patrol IC prints "Attack: n/a". It has no attack, uses Matrix Perception on
  everything in the host, shares what it finds with the host, and takes no
  Matrix damage from failure because it never uses Attack actions. Most hosts
  run it constantly. (p. 248)
- IC types printed in the CRB: Acid, Binder, Black IC, Blaster, Crash, Jammer,
  Killer, Marker, Patrol, Probe, Scramble, Sparky (p. 248); Tar Baby, Track
  (p. 249). Fourteen in total.
- An IC's rating stands in for Willpower when it defends. (p. 239, Erase Mark
  worked example)

### Initiative

- Initiative Attribute Chart (p. 159): Matrix AR = Reaction + Intuition, 1D6;
  Matrix cold-sim VR = Data Processing + Intuition, 3D6; Matrix hot-sim VR =
  Data Processing + Intuition, 4D6.
- Ties break on ERIC — Edge, Reaction, Intuition, coin toss — or, at the GM's
  discretion, both act simultaneously. (p. 159)
- 10 is subtracted from every Initiative Score at the end of each pass;
  characters above 0 act again. (p. 159)
- Cold-sim: Data Processing + Intuition, +3D6, hard cap 5D6, biofeedback is Stun.
  (p. 229)
- Hot-sim: Data Processing + Intuition, +4D6, hard cap 5D6, +2 dice pool to all
  Matrix actions, biofeedback is Physical. (p. 230)
- AR uses your normal Initiative and Initiative Dice, and you take no
  biofeedback. (p. 229)
- Switching VR→AR loses the bonus Initiative Dice from VR. Switch Interface Mode
  is a Simple Action and is blocked while link-locked. (p. 243)
- Full Matrix Defense is an Interrupt Action costing 10 Initiative Score, adding
  Willpower to Matrix defense tests for the rest of the Combat Turn. (p. 240)
- Autonomous drones use Pilot Rating × 2 as their Initiative attribute plus 3D6
  additional dice, for 4D6 total. (p. 270)
- A sprite's Initiative "is also based on its Level", and it has 4D6 Initiative
  Dice. (p. 254) The sprite table on printed p. 255 is an image and did not
  extract in the indexed text, so the analyst could not cite its Initiative
  column.

---

## Interactions and exceptions

Every subsystem below modifies something asserted above. This is where the port
is most likely to be wrong a second time.

1. **Host boundary.** From outside a host you cannot interact with icons inside
   it, and from inside you cannot interact with icons outside — messages and
   calls excepted (p. 246). Entering requires 1 mark on the host and no test
   (p. 239). Leaving returns you to the grid you entered from (p. 239).
2. **Overwatch inside a host.** Entering a host does not change your Overwatch
   Score, and it keeps accruing while you are inside (p. 247).
3. **Host convergence differs from grid convergence.** Converging inside a host
   gives the host three marks on you and starts it deploying IC, instead of the
   burn-and-dump; leaving the host after convergence triggers the grid demiGOD
   immediately (p. 247). Grid convergence is 12 DV Matrix damage, forced persona
   reboot erasing all marks, ejection from the Matrix with dumpshock if in VR,
   and your physical location reported (p. 232).
4. **Reboot and jack out.** Reboot Device is a Complex Action needing 3 marks;
   the device returns at the end of the following Combat Turn; rebooting your
   own persona's device zeroes Overwatch and erases all your marks and marks on
   your icon (p. 242). Reboot Device does not work on hosts or on sprites
   (p. 242). Jack Out is a Simple Action that jacks you out and reboots your
   device, with dumpshock if you were in VR; its defense pool applies only if
   you are link-locked, and you must beat each link-locker individually (p. 240).
   Already ruled: `RULINGS.md` 2026-08-29, no cooldown, no residual Overwatch.
5. **Link-locking.** While link-locked you cannot Switch Interface Mode, use
   Enter/Exit Host, or Reboot the device your persona is on; Jack Out is the
   escape (p. 229). Any persona — agent, technomancer, sprite — can be
   link-locked (p. 229). Black IC and Tar Baby link-lock on a hit (pp. 248, 249);
   Blaster link-locks on a single successful attack (p. 248).
6. **Unconsciousness in VR.** Falling unconscious in VR normally switches your
   deck to AR automatically — but if you are link-locked you stay in VR. IC does
   not care whether its target is conscious and will keep attacking. You cannot
   defend against actions while unconscious. (p. 229)
7. **Failed illegal actions.** Fail an Attack action and you take 1 box of
   unresistable Matrix damage per net hit the defender got (p. 231). Fail a
   Sleaze action and the target's Firewall places a mark **on you**; a device
   informs its owner, a host launches IC; if it already has three marks on you it
   gets no more but still informs and launches (p. 231). Succeed with an Attack
   and the target knows it is under attack but does not automatically spot you;
   succeed with a Sleaze and your visibility does not increase (p. 236).
8. **Slaving.** A slaved device borrows its master's ratings per-rating, except
   under direct connection (p. 233). Marking a slave marks the master, direct
   connection included (p. 233). Failing a Sleaze against a slave gives only the
   device's owner a mark on you, not the master (p. 233). PAN capacity is Device
   Rating × 3 (p. 233).
9. **Grids.** Acting across grids is −2 dice, plus a further −2 for the public
   grid; the penalty does not apply while you are inside a host (p. 233). Brute
   Force and Hack on the Fly can hop grids illegally against 4 or 6 dice
   (pp. 238, 240). Notably, a *successful* illegal Brute Force grid hop does not
   alert the grid, and an *unsuccessful* Hack on the Fly grid hop does not alert
   it either — each is the inverse of that action's usual consequence
   (pp. 238, 240).
10. **Running silent.** A Simple Action to enter; −2 dice to all your Matrix
    actions while running silent; finding a silent icon needs first a Matrix
    Perception hit establishing that one is present, then an Opposed
    Computer + Intuition [Data Processing] test (p. 235). Marks themselves cannot
    run silent (p. 236). Once spotted, an icon stays spotted even if it goes
    silent; you lose it only to a successful Hide action or to the target
    rebooting or jacking out (p. 235).
11. **Spotting range.** Devices not running silent within 100 metres of your
    physical body are spotted automatically; beyond that needs Matrix Perception;
    hosts have no physical distance and can be spotted from anywhere unless
    running silent (p. 235).
12. **Agents.** An agent runs as a program, has its own persona and icon, uses
    the Matrix attributes of the device it runs on and its own rating for
    attributes, and shares that device's Matrix Condition Monitor (pp. 246, 235).
    So an agent and its decker are two icons with two Initiative Scores and one
    health track.
13. **Technomancers.** No Matrix Condition Monitor; Matrix damage becomes Stun
    on their person (p. 229). A living persona exists as long as they are awake
    (p. 235). Trace Icon does not work on hosts or IC (p. 243).
14. **Deck reconfiguration.** Swapping two of the deck's Matrix attributes is a
    Free Action on your own Action Phase and is not a Matrix action (p. 228).
    This can change Data Processing and therefore VR Initiative mid-combat.
    Already ruled: `RULINGS.md` 2026-08-30, no mid-combat Data Processing
    mutation is modelled; manual GM edit only.
15. **Programs that shift the numbers.** Exploit gives +2 Sleaze specifically
    for Hack on the Fly; Encryption +1 Firewall; Toolbox +1 Data Processing;
    Stealth +1 Sleaze; Decryption +1 Attack; Signal Scrub Rating 2 noise
    reduction; Virtual Machine adds two program slots at the cost of one extra
    unresistable box per Matrix hit; Baby Monitor reveals Overwatch (p. 245).
    Toolbox's Data Processing bonus can change VR Initiative.
16. **Existing binding rulings** that constrain this work:
    - `RULINGS.md` 2026-08-29, "Overwatch Score banding below 40 is
      display-only" — governs claim 3 entirely.
    - `RULINGS.md` 2026-08-29, "Reboot and jack-out reset Overwatch Score to
      zero, with no cooldown".
    - `RULINGS.md` 2026-08-30, "Data Processing is imported from a statblock
      only where the book supplies one, and is blank otherwise" — its stated
      principle, that a plausible invented number is worse than a blank, is the
      precedent bearing on Table Ruling 1 below.
    - `RULINGS.md` 2026-08-13, "Condition Monitor maximums never appear in any
      log" — bears on Scope Question C.
    - `RULINGS.md` 2026-07-31, GM/NPC dice roll visibility defaults — bears on
      Scope Question A.

---

## Edge cases the book defines

1. Overwatch rises on a failed Attack or Sleaze action just as on a successful
   one — the accrual is keyed to the defender's hits, not to the outcome
   (p. 232).
2. Overwatch does not rise for Data Processing or Firewall actions (p. 232).
3. Check Overwatch Score is itself a Sleaze action, so asking raises the answer;
   the GM reports the value from before the action, then adds the defending
   pool's hits (p. 238).
4. IC never gains Overwatch, being always legal (p. 248).
5. A defender who already has three marks on you gets no fourth from your
   failed Sleaze, but still alerts its owner and still launches IC (p. 231).
6. Marks placed by any IC of a host are held by every IC of that host and by the
   host itself (p. 247).
7. Marking a WAN-slaved device also marks the host, including through a direct
   connection (p. 233). The reverse does not hold.
8. A slaved device under direct-connection attack loses access to its master's
   ratings (p. 233).
9. Being inside a host with a WAN counts as a direct connection to every device
   on that WAN (p. 233).
10. A file has no rating and defends with its owner's ratings (p. 227); when the
    file is on a host, the host is the defender for Edit File (p. 239).
11. A persona takes no Matrix damage of its own — the damage lands on its device
    (p. 228). An agent shares that same device monitor (p. 246).
12. Matrix damage carries no penalty at all until the monitor is completely full
    (p. 228).
13. IC and sprites lose all Matrix damage when they stop running or return to
    the Resonance, and cannot be repaired (p. 229).
14. Falling unconscious in VR normally auto-switches you to AR — unless you are
    link-locked, in which case you stay in VR and cannot defend (p. 229).
15. Entering a host does not reset or pause Overwatch accrual (p. 247).
16. Convergence inside a host does not dump you; it gives the host three marks
    and starts IC deployment (p. 247).
17. Leaving a host after convergence triggers the grid demiGOD immediately
    (p. 247).
18. Erase Mark requires three marks on the icon you are erasing from, and no
    mark at all on whoever placed it (p. 239).
19. Enter/Exit Host has no test; a host admits anyone holding a mark, and anyone
    inside may leave (p. 239).
20. Reboot Device does not work on hosts, on living beings, or on sprites, and
    the only persona it works on is your own (p. 242).
21. Full Matrix Defense costs 10 Initiative Score but lasts the rest of the
    Combat Turn (p. 240).
22. The 5D6 Initiative Dice ceiling applies regardless of enhancements
    (pp. 229, 230).
23. Patrol IC has no attack, so it never takes the failed-Attack damage other IC
    take (p. 248).
24. A bricked IC vanishes from the host and may be relaunched at the start of
    the next Combat Turn (p. 247).

---

## Undefined / needs a table ruling

### 1. IC's Initiative attribute — the number the 4D6 is added to

p. 247 gives IC an Initiative Score and 4D6 dice and stops. Hot-sim Initiative is
Data Processing + Intuition (pp. 159, 230); IC takes Data Processing from its
host (p. 247) but has no Intuition. **Gap.**

Options:
- (a) `Host Rating × 2` — what the port does. Printed analogue: autonomous drones
  use Pilot Rating × 2 + 4D6 total (p. 270); sprites are "based on Level"
  (p. 254).
- (b) `host Data Processing + Host Rating` — derives from the actual hot-sim
  formula, with Host Rating substituting for the absent mental attribute, which
  is the substitution the book makes generally for icons lacking a mental
  attribute (p. 237) and specifically for IC defending (p. 239).
- (c) GM-entered, blank by default, per the 2026-08-30 precedent.

**Recommended default: (a).** It is already the implemented value, it has a real
printed analogue in a structurally identical case (an autonomous program acting
on its own initiative), and unlike the Data Processing case there is no
"correct" published number a blank would be concealing. Must be labelled in code
as a house rule with this brief as its source, so no later reader mistakes it
for a printed value. **AC-24 is blocked on this ruling.**

### 2. IC's Matrix Condition Monitor size

p. 247 gives IC "its own Condition Monitor" and never sizes it. **Gap.**

Options:
- (a) `8 + ceil(Host Rating / 2)` — the port's value; matches devices'
  `8 + (Device Rating / 2)` (p. 228) and sprites' `8 + (Level / 2)` (p. 254),
  with Host Rating as IC's only rating.
- (b) GM-entered per IC.

**Recommended default: (a).** This is the "M1" answer Xavier gave earlier in the
session. That ruling was written into `RULINGS.md` on `feat/matrix-v2`, in the
Step 3a commit this port deliberately dropped, so it is genuinely absent from
this branch and must be re-recorded rather than re-decided. **AC-25 is blocked
on this ruling.**

### 3. Host defense attributes for a Mental-attribute defense test

Brute Force defends with Willpower + Firewall (p. 238) and Hack on the Fly with
Intuition + Firewall (p. 240). Hosts have only Attack, Sleaze, Data Processing
and Firewall (p. 247) — no Willpower, no Intuition. p. 237 supplies the
substitution rule for devices ("the Device Rating stands in") but names Device
Rating, which a host does not have; p. 239 shows an IC's rating standing in for
Willpower. **Gap for hosts specifically.**

**Recommended default: no app behaviour at all.** This is a defense pool the app
never assembles under any scope reading. Recorded here as context for why AC-1
must not compute an Overwatch number: the app cannot even name the defender's
dice, let alone roll them.

### 4. ERIC tie-breaking for IC

p. 159 breaks ties on Edge, then Reaction, then Intuition, then a coin toss. IC
has none of the three. **Gap.**

**Correction (adversarial validation round, 2026-09-01): the recommendation
below, as originally written, was checked against the code and found wrong.**
Two tied IC do **not** fall through to the coin toss. `CombatManager.getNextActors()`
(`src/Combat/CombatManager.ts:192-198`) collects every `Waiting` participant
with equal effective Initiative and equal Edge into `currentActors` together —
it never reaches a coin-toss step at all for a tie of this shape. So two IC
tied on Initiative Score with no Edge, Reaction or Intuition to compare **act
simultaneously**, which is p. 159's own stated alternative ("at the
gamemaster's discretion, both characters can act simultaneously") — already
the code's behaviour, not a fallback that needs implementing. No code change
required; see `RULINGS.md` 2026-09-01, "Tied IC act simultaneously, not by
coin toss" for the recorded behaviour. **Not blocking any acceptance
criterion.**

### 5. Whether a host's stale `matrixHealth` field should be migrated or ignored

`MatrixHost` currently defaults `matrixHealth` to `8 + ceil(rating/2)` at
construction. Removing the concept leaves the field on existing session data.
**Not a rules question** — flagged so the implementer does not invent a
migration. **Recommended default: stop reading and stop writing it; leave stored
values untouched.** See AC-19.

---

## Scope classification

Proposal only. Xavier approves.

### TRACK — the app must represent or compute this

- A decker's Overwatch Score as a stored, GM-editable running total (p. 232;
  `SCOPE.md` names Overwatch Score explicitly).
- 40 as the single Overwatch threshold, and the crossing of it as a signalled
  event (p. 232; `RULINGS.md` 2026-08-29).
- Overwatch colour bands below 40 as presentation carrying no mechanical effect
  (`RULINGS.md` 2026-08-29).
- Overwatch hidden from the player view (p. 232), revealed only by GM action.
- Mark counts, per decker, per individual icon, capped at 3 (p. 236).
- Which icon each mark is on — device, persona, file, grid or host as distinct
  mark-bearing entities (p. 236).
- A host's recorded access method (hack on the fly / brute force / direct
  connection), as a GM-set label.
- Which host a decker is currently inside, and the fact that host-interior and
  public-space icons are mutually invisible (p. 246).
- Matrix Condition Monitor boxes for devices, at `8 + ceil(Device Rating / 2)`
  (pp. 228, 48).
- The absence of a Matrix Condition Monitor on hosts and files (p. 229).
- The absence of a separate Matrix Condition Monitor on a persona — a persona's
  damage is its device's damage (p. 228).
- IC as an initiative participant with its own Initiative Score and 4D6
  Initiative Dice (p. 247).
- IC Matrix Condition Monitor boxes (p. 247 that it has one; size per Table
  Ruling 2).
- VR mode per decker and the Initiative Dice that mode implies — AR physical,
  cold-sim 3D6, hot-sim 4D6, ceiling 5D6 (pp. 159, 229, 230).
- Which host each IC belongs to, and the count of IC running in a host (p. 247).

### GM RESOLVES — the GM decides; the app records the result

- The number of hits a defender rolls, and therefore the Overwatch delta
  (p. 232).
- Whether a Brute Force or Hack on the Fly succeeded (pp. 238, 240).
- How many marks a decker declared before rolling, and the −4 / −10 dice
  penalties for declaring two or three (pp. 238, 240).
- Whether a target is slaved to a host, and whether a mark therefore propagates
  to the master (p. 233).
- Whether a given connection is direct, and what that does to the defender's
  pool (pp. 232, 233).
- The noise level in play (p. 231) and whether a direct connection zeroes it
  (p. 232) — subject to Scope Question B.
- Whether an icon is running silent, and every Matrix Perception test to find or
  read one (p. 235).
- What an IC does on its Action Phase, including all per-type effects
  (pp. 248, 249).
- When a host spots an intruder and launches IC (pp. 231, 236, 247).
- Everything that follows convergence, on the grid or in a host (pp. 232, 247).
- Dumpshock, biofeedback and link-lock resolution (p. 229).
- Whether a decker in VR who falls unconscious auto-switches to AR or is held in
  VR by a link-lock (p. 229).

### OUT OF SCOPE — per `SCOPE.md`, not the app's job

- Rolling or resolving any defense test (`SCOPE.md`, "resolving opposed tests").
- Deriving marks gained from a roll result (`SCOPE.md`, "computing net hits into
  consequences").
- Deriving an Overwatch delta from anything (same).
- Applying noise, running-silent, grid or hot-sim modifiers to any dice pool
  (`SCOPE.md`, "does not resolve mechanics").
- The 2D6-per-fifteen-minutes Overwatch drift (p. 232) — a secret GM roll on a
  real-time clock the tracker does not keep.
- Every IC type's attack line, damage formula and status effect
  (pp. 248, 249) — `SCOPE.md`, "does not implement every Matrix action's test,
  threshold, and consequence".
- Refusing an IC spawn that breaks the host's IC limits (p. 247) —
  `SCOPE.md`, "enforcing legality".
- Automatic convergence consequences at Overwatch 40 (pp. 232, 247).
- Deck attribute arrays, program loadouts and reconfiguration (pp. 227, 228,
  245) — `SCOPE.md`, "gear management".

### SCOPE QUESTION — flagged, not silently excluded

**A. The dice roller inside the Hack on the Fly / Brute Force flow.**
*For:* `SCOPE.md` permits rolling when the GM asks, the roller already exists,
and routing the roll through it puts it in the shared log per `RULINGS.md`
2026-07-31. *Against:* keeping the roller adjacent to the removed derivation
invites someone to reconnect them.
*Recommendation: keep the roller, report hits only, never derive.*

**B. Noise as tracked state.** Currently displayed by the access panel;
`SCOPE.md`'s in-scope list does not name it.
*For:* it is exactly the fiddly running total the app exists to hold, and a
direct connection zeroing it (pp. 231, 232) makes a GM decision visible.
*Against:* it is only ever a dice modifier, and displaying it invites the
expectation that the app applies it.
*Recommendation: track and display, never apply, label as a reminder. Requires a
line in `SCOPE.md` if approved.*

**C. Matrix damage and capacity in the player view.** The view currently shows
`damage / max` for every icon. Matrix Perception can reveal an icon's damage
boxes but capacity is not on the list (p. 235), and `RULINGS.md` 2026-08-13 bars
condition monitor maximums from logs.
*For:* shared visible state is the tracker's core value.
*Against:* it gives away information the rules make players spend an action on,
and the maximum is precisely the "how many more hits" figure the 2026-08-13
ruling withheld.
*Recommendation: keep damage, drop the maximum.*

**D. Completing the IC roster.** 7 of 14 printed types are implemented; missing
are Binder, Black IC, Crash, Jammer, Marker, Probe, Track (pp. 248, 249).
*For:* it is a data list, and Black IC is the signature threat a GM will reach
for. *Against:* content addition, not a correctness fix.
*Recommendation: backlog, not this pass.*

---

## Acceptance criteria

Only TRACK items appear here. Numbered, testable, each page-cited or marked
blocked.

**Claim 1 — Overwatch per mark**

1. `AccessHostPanelComponent` exposes no computed Overwatch value. The
   `suggestedOS` getter and every `marksGained × N` expression are deleted from
   the component and from its template. Rationale: Overwatch rises by the
   defender's hits on its defense test, which this app does not roll (p. 232).
2. The Overwatch prompt opened by `confirmAccess()` presents an empty numeric
   entry with no pre-filled suggestion, and the value written to the decker's
   Overwatch Score is exactly the number the GM entered. `OsPromptComponent`'s
   `suggestedDelta` is either removed or passed `0` with no "suggested" labelling.
3. The prompt's helper text states that Overwatch rises by the number of hits
   the defender rolled on its defense test, and that this applies whether the
   action succeeded or failed (p. 232).
4. Dismissing the prompt changes nothing: no Overwatch delta, no marks, no
   access-method change. (Behaviour preserved from the port.)
5. The Brute Force tooltip and flow hint read `Cybercombat + Logic [Attack] v.
   Willpower + Firewall`, and the Hack on the Fly tooltip and flow hint read
   `Hacking + Logic [Sleaze] v. Intuition + Firewall`. Neither names "Cracking"
   (pp. 238, 240, 144).
6. Neither tooltip states any Overwatch cost (p. 232).

**Claim 2 — direct connection**

7. `applyDirectConnection()` sets the host's access method and places **zero**
   marks. The `addMarkToHost(host, decker, 1)` call is removed (pp. 232, 236).
8. The direct-connection panel text states that a direct connection ignores all
   noise and all grid modifiers (pp. 231, 232), and that a slaved device under
   direct-connection attack cannot use its master's ratings to defend (p. 233).
   It must not claim any mark is granted.
9. The direct-connection panel text notes that marking a device slaved to the
   host also marks the host, including through a direct connection, but that
   this still requires a successful Brute Force or Hack on the Fly against the
   device (pp. 233, 236).
   > **Reconciliation note, round-4 (2026-09-02):** this criterion originally
   > read "The GM places that mark manually." That is no longer how the app
   > behaves: Xavier's decision 7a (2026-09-02) restored the 2026-08-29 ruling
   > "Marks propagated from a slave count toward the master's three" and had
   > it built — `MatrixStateService.addMark()` now places the host's mark
   > automatically whenever a decker marks a target slaved to that host
   > (`target.linkedHostId`), independently capped at 3 on each icon. The
   > panel text and AC-9 above are updated to say the host mark is automatic;
   > the GM only has to mark the device itself, in the Hierarchy editor.
10. The "0 OS" label is retained and correct: connecting a cable is not an
    Attack or Sleaze action and accrues nothing (p. 232).

**Claim 3 — Overwatch banding**

11. `DeckerCardComponent.osTierClass` is replaced by a call to `osBandFor()`
    from `src/app/services/os-tracking.service.ts`. No band cut-point literal
    appears in `decker-card.component.ts` (`RULINGS.md` 2026-08-29).
12. No code path anywhere returns, tests against, or styles an Overwatch tier at
    20. A repo-wide search for `20` as an Overwatch threshold returns nothing
    (p. 232).
13. `decker-card.component.css` defines classes matching the values `osBandFor()`
    returns, and no `os-alert` or `os-ok` class remains. The same stale-class
    check applies to `matrix-participant-badge.component.css`. Each band
    declaration carries a comment stating the cut points are presentation only
    and that 40 is the sole printed threshold (p. 232; `RULINGS.md` 2026-08-29).
    Read `osBandFor()`'s actual return values from the service rather than
    assuming them.

**Claim 4 — Matrix Condition Monitors**

14. Hosts carry no Matrix Condition Monitor. `HierarchyEditorComponent
    .saveHostForm()` does not compute or write `matrixHealth`, and no host UI
    renders a health value (p. 229).
15. Files carry no Matrix Condition Monitor. `calcMatrixHealth`'s `"file"` case
    is removed rather than returning 8, and no file UI renders a health value
    (pp. 229, 227).
16. A `"device"` target's Matrix Condition Monitor equals
    `8 + ceil(Device Rating / 2)`. Spot checks: Device Rating 2 → 9 boxes
    (matching the book's own bricked-smartgun example), Rating 3 → 10, Rating 6
    → 11 (pp. 228, 48).
17. A `"persona"` target's Matrix Condition Monitor is derived from the Device
    Rating of the device the persona runs on, using the same
    `8 + ceil(Device Rating / 2)`, and is never the hard-coded `8 + ceil(1/2)`
    the port produces. `calcMatrixHealth` no longer receives a literal `1` in its
    rating position (p. 228).
18. An `"ic"` target's Matrix Condition Monitor is derived from its host's rating
    and is never the hard-coded `8 + ceil(1/2)` (p. 247; size per AC-25).
19. Any host or file record loaded from an existing session with a stored
    `matrixHealth` renders no health value. No migration is written and no stored
    value is mutated (Table Ruling 5).

**Claim 6 — IC initiative**

20. `ICParticipant` gives **every** IC type 4 Initiative Dice. `PATROL_IC_DICE`
    is deleted; there is no branch on `ICType` for dice count (p. 247).
21. `ICSpawnerComponent.initiativeDice` returns 4 for every selectable type,
    including Patrol, and the preview range for Patrol IC is identical to
    Killer IC at the same host rating (p. 247).
22. Every comment citing "Table 4 / Table 24" or any comparable non-existent SR5
    table is removed. Replacement comments cite p. 247 for the 4D6 figure and
    name Table Ruling 1 for the initiative base.
23. The IC spawner's per-type warning text distinguishes Patrol IC's absent
    *attack* ("Attack: n/a", p. 248) from its *initiative*, and does not imply
    the two are related.
24. **[BLOCKED on Table Ruling 1]** `ICParticipant.baseIni` is set per the
    approved option. If (a): `hostRating * 2`, with a comment marking it a house
    rule sourced to this brief and to the drone analogue at p. 270. If (b):
    `host.dataProcessing + hostRating`, sourced to pp. 230, 237, 239, 247. If
    (c): left unset and GM-entered, with the spawner showing a blank field and
    `+4D6 (p. 247)`.
25. **[BLOCKED on Table Ruling 2]** `ICSpawnerComponent.matrixCM` and the
    ICParticipant monitor are set per the approved option, with a comment marking
    it a house rule and naming the `RULINGS.md` entry.

**Claim 7 — marks on icons**

26. The comment asserting "In SR5E marks are placed on the host, not on
    individual icons inside it" is deleted from
    `matrix-player-view.component.ts`. Replacement comment states that marks are
    placed on individual icons — devices, personas, files, grids and hosts —
    up to three per icon (p. 236).
27. `MatrixPlayerViewComponent.hostMarks()` returns the current decker's mark
    count on the **host icon itself**, read from the host's own mark record. It
    does not compute a maximum, minimum or any other aggregate over the targets
    inside the host (pp. 236, 239).
28. A decker holding 2 marks on a device inside host H and 0 marks on H itself
    sees a host mark count of 0 in the player view, and 2 on that device
    (p. 236).
29. Per-icon mark caps stay at 3 in `TargetCardComponent`,
    `HierarchyEditorComponent.hostAvailableDeckers()` and
    `confirmHostAddMark()` (p. 236). Owner status is not modelled as a fourth
    mark (p. 236).

**Preserved behaviour — must not regress**

30. The player view renders no Overwatch Score for any decker under any state
    (p. 232). The VR mode chip remains.
31. The player view's comment explaining the Overwatch omission cites p. 232 for
    GM secrecy and p. 245 for Baby Monitor, and additionally names the Check
    Overwatch Score action (p. 238) as the other reveal path.
32. `OsTrackingService` continues to accrue nothing on its own; Overwatch moves
    only on an explicit GM-supplied delta (p. 232).
33. The convergence threshold remains 40 and remains the only threshold with a
    consequence (p. 232; `RULINGS.md` 2026-08-29).

**Cross-cutting**

34. Every rules number surviving in the five touched components carries either a
    printed page citation from this brief or an explicit "house rule, see
    RULINGS.md <date>" marker. No number carries an invented citation format.
35. `docs/UNVERIFIED-RULES.md` items 3, 4, 6, 7 and 8 are resolved and removed,
    each replaced by the finding in this brief: item 3 (OS 20 / 40) — false, one
    threshold at 40 (p. 232); item 4 (IC dice pool and initiative) — IC attacks
    are Host Rating × 2 limited by host Attack (p. 247), all IC get 4D6
    Initiative Dice (p. 247), Patrol has no attack (p. 248), initiative base is
    Table Ruling 1; item 6 (HotF +2 OS per mark) — false (p. 232); item 7
    (Brute Force marks × 4) — false (p. 232); item 8 (direct connection grants
    1 mark, 0 OS) — mark half false, OS half true (pp. 232, 233, 236). Item 5
    (3-mark cap) is confirmed true (p. 236) and may be moved out with its
    citation. Verify each item number against the file before editing — do not
    trust the numbering above blindly.

---

## Gameplay scenarios to survive

### S1 — The ordinary case: a clean Hack on the Fly onto a host

Rating 4 host, attributes Attack 5 / Sleaze 4 / Data Processing 7 / Firewall 6
(p. 247). Decker Tesseract, hot-sim, Overwatch currently 6. He declares he is
going for one mark on the host and rolls Hacking + Logic [Sleaze] (p. 240). The
GM rolls the host's defense and gets 3 hits; Tesseract gets 5. He wins.

*Expected:* the panel reports 5 hits and offers **no** Overwatch figure (AC-1).
The GM sets marks gained to 1 by hand (AC-2, p. 240) and types **3** into the
Overwatch prompt — the defender's hits, not the marks (p. 232). Tesseract's
Overwatch reads 9. The host records one mark for Tesseract. The host renders no
Matrix Condition Monitor (AC-14, p. 229). Tesseract may now Enter Host with his
one mark and no test (p. 239).

### S2 — A tie: two IC of the same host roll identically

The Rating 4 host has launched Patrol IC and Killer IC on consecutive Combat
Turns (p. 247). Both are on the same Initiative attribute and both roll 4D6
(AC-20, p. 247). Both land on Initiative Score 20.

*Expected:* both IC show 4 Initiative Dice, not 2 and 4 (AC-21). Patrol IC's
Initiative range in the spawner preview is identical to Killer's at the same
host rating. With no Edge, Reaction or Intuition on either IC to compare, the
tie does not fall through to a coin toss at all — `CombatManager.getNextActors()`
collects both into `currentActors` together and they act simultaneously,
matching p. 159's own stated alternative (Table Ruling 4, corrected). The app
does not silently prefer Patrol.

### S3 — Mid-Combat-Turn state change: reconfigure, then Full Matrix Defense

Decker /dev/grrl is in hot-sim on Initiative Score 24, Data Processing 6,
Intuition 5, so Initiative attribute 11 + 4D6 (pp. 159, 230). Mid-turn she takes
a Free Action to swap Data Processing 6 with Firewall 3 (p. 228). Then, when
Killer IC attacks, she takes Full Matrix Defense (p. 240).

*Expected:* the Data Processing edit is a manual GM edit and does not
retroactively re-roll her Initiative (`RULINGS.md` 2026-08-30, "no mid-combat
Data Processing mutation is modelled"). Full Matrix Defense drops her Initiative
Score by exactly 10, to 14 (p. 240), through the same Interrupt Action cost path
every other participant uses, with no floor at zero (`RULINGS.md` 2026-07-31).
Her Overwatch does not move — Full Matrix Defense is a Firewall action, not
Attack or Sleaze (pp. 232, 240).

### S4 — One character, two icons, one health track: decker plus agent

Tesseract runs a Rating 4 agent on his Hermes Chariot (Device Rating 2, so a
9-box Matrix Condition Monitor, p. 227/228). The agent has its own persona and
its own Initiative Score (pp. 235, 246). Killer IC attacks the agent for 5 boxes
of Matrix damage.

*Expected:* the agent and Tesseract appear as two entries in the initiative
order (p. 246). The 5 boxes land on **the deck's** single Matrix Condition
Monitor, because an attack on an agent damages the device it runs on (p. 246)
and a persona's damage also lands on its device (p. 228). Both entries read
5 / 9. Neither the agent entry nor Tesseract's persona entry has a Matrix
Condition Monitor of its own (AC-17). Four more boxes bricks the deck, dumping
Tesseract with dumpshock (pp. 228, 229).

### S5 — Unconscious in VR while link-locked

Black IC hits Tesseract, link-locking him (p. 248). Biofeedback fills his Stun
track and he goes unconscious while in hot-sim.

*Expected:* normally an unconscious VR user's deck auto-switches him to AR, but
link-locked he stays in VR (p. 229) — so the app must let the GM leave him on
the Matrix initiative track at 4D6 rather than snapping him back to physical
initiative (p. 159). He cannot defend against actions while unconscious (p. 229)
and the app records that without enforcing it. IC keeps attacking regardless of
his consciousness (p. 229). His Jack Out escape is available in principle and
must beat the link-locker (p. 240). No Overwatch change occurs from being
attacked — accrual is on actions **he** takes (p. 232).

### S6 — Host boundary crossing, with convergence inside

Tesseract has 1 mark on the Rating 4 host, enters it (Complex Action, no test,
p. 239), and hacks a file inside. His Overwatch was 34 on entry.

*Expected:* on entering, his Overwatch does not change and keeps accruing
(p. 247). The player view now shows only the icons inside that host and nothing
in public space (existing `contextTargets` behaviour, p. 246). His host mark
count reads 1 — the host's own mark — regardless of how many marks he holds on
the file (AC-27/28, p. 236). He Brute Forces the file; the GM rolls the file's
defense **using the file's owner's ratings** (p. 227) and reports 7 hits;
Overwatch goes to 41. The app signals convergence crossing at 40 (AC-33, p. 232)
and does nothing else — inside a host, convergence means the host gets three
marks on him and starts deploying IC (p. 247), and that is the GM's to apply.
The file shows no Matrix Condition Monitor (AC-15, p. 229).

### S7 — Direct connection into a WAN-slaved device

A maglock is slaved to the Rating 4 host's WAN. The team's decker runs a cable
to it (p. 232). Its own Device Rating and Firewall are both 2.

*Expected:* clicking Direct Connection sets the access method and places **no
marks** (AC-7, pp. 232, 236). The panel states noise is zero (pp. 231, 232) and
that the maglock can no longer borrow the host's Firewall to defend — it defends
on its own Device Rating and Firewall, with Device Rating standing in for the
Mental attribute it lacks (AC-8, pp. 233, 237). The decker then Brute Forces the
maglock; the GM applies one mark to the maglock **and** one mark to the host by
hand, because marking a WAN slave marks the master even through a direct
connection (AC-9, p. 233). Overwatch rises by the maglock's defense hits, typed
in by the GM (p. 232). The maglock, being a device, does show a Matrix Condition
Monitor of `8 + ceil(2/2)` = 9 boxes (AC-16, p. 228).

### S8 — Regression: the Overwatch chip crossing 20

A decker's Overwatch is walked from 14 up to 22 by GM increments.

*Expected:* no alert of any kind fires at 20, no state changes, and no code path
returns an `os-alert` tier (AC-12, p. 232; `RULINGS.md` 2026-08-29). The chip's
colour changes only at the `osBandFor()` cut points, as presentation, and
`osBandFor()` is the sole source of those cut points for both the decker card
and the participant badge (AC-11, AC-13).

---

# Implementation appendix

All `file:line` references verified on `feat/matrix-v3`. Where this appendix
contradicts the body above, **the appendix is the file-verified reading**.

## A. What is and is not in the compiled program

`tsconfig.app.json` builds from `files: ["src/main.ts"]`; `tsconfig.spec.json`
from `files: ["src/test.ts"]` plus `include: ["**/*.spec.ts"]`. Both programs are
reachability-closed over imports.

| File | In app build? | In spec build? |
|---|---|---|
| `matrix-participant-badge/*` | **Yes** (`battle-tracker.component.ts:38`, used at `.html:822`) | Yes |
| the other nine `src/app/matrix/*` components | No | No |
| `MatrixParticipant.ts`, `VRMode.ts` | Yes | Yes (7 specs) |
| `ICParticipant.ts`, `MatrixHost.ts`, `MatrixTarget.ts`, `MatrixRunState.ts`, `MatrixIcon.ts` | Yes (via `matrix-state.service.ts`) | Yes, but **no direct tests** |

With `strictTemplates: true` (`tsconfig.json:37`), nine of ten components have
**never been template-type-checked and have zero coverage**. "The suite is
green" is not evidence about them. The first scenario spec that imports them
pulls them into the type-checked program for the first time; plan for latent
errors to surface there and do not treat that as a regression.

## B. `osBandFor()` actual values (AC-13)

From `src/app/services/os-tracking.service.ts`: `OS_BAND_BUILDING = 15` (`:34`),
`OS_BAND_HIGH = 30` (`:35`), `OS_CONVERGENCE_THRESHOLD = 40` (`:38`);
`type OsBand = "low" | "building" | "high" | "convergence"` (`:31`); dispatch at
`:47-52`.

Required CSS classes: **`.os-low`, `.os-building`, `.os-high`,
`.os-convergence`**. Cut points **15 / 30 / 40**.

**Correction to AC-13 as written:** `matrix-participant-badge.component.css`
does not carry merely *stale* classes. `.os-low`, `.os-building` and `.os-high`
are **absent entirely** (no match anywhere in `src/`). The badge already calls
`osBandFor()` (`.ts:54-56`) and binds `[ngClass]="'os-' + osTier"` (`.html:8`),
so the **live, shipped** chip has no colour rule below 40. AC-13 on this file is
a live-defect fix, not tidying.

## C. Latent non-rules defects on the critical path

**C1 — `access-host-panel` mis-binds the roller.** `DiceRollerComponent.rolledEvent`
is `EventEmitter<DiceRollRequest>` (`dice-roller.component.ts:71`) where
`DiceRollRequest = { values: number[]; rollAs: string | null }` (`:37-40`). The
panel binds it into `onRolled(values: number[])` (`.ts:85-88`) which calls
`values.filter(...)`. Template type error under `strictTemplates`; runtime
`TypeError` on first roll. **Scenario S1 cannot pass until fixed.** AC-2 already
rewrites `onRolled` — fix it there.

**C2 — an OS-20 tier surviving in a template, missed by AC-12.**
`decker-card.component.html:18` reads
`@if (decker.overwatchAlert === 'ic-alert')`, rendering an `IC ALERT` label.
`MatrixParticipant.overwatchAlert` is typed `"none" | "convergence"`
(`MatrixParticipant.ts:132-134`), so this is a TS2367 no-overlap comparison.
Delete the branch, the label, and the orphaned `.os-threshold-label` and
`.os-threshold-conv` rules if the CONV label goes too.

**C3 — Scope Question A's "For" argument is false as ported.** `onRolled`
(`:85-88`) only stores values locally; `confirmAccess` (`:111-112`) passes a
reason string to `OsTrackingService.addOS`, used solely in the threshold event
payload (`os-tracking.service.ts:88`), never logged. Contrast
`battle-tracker.component.html:1048-1054`, where the parent logs via
`onGmDiceRolled($event)`. Making the roll visible is **new work**, not
preservation. Do not assume it silently.

## D. Current behaviour, per claim

### Claim 1 (AC-1 to AC-6)

`access-host-panel.component.ts`: `:65-67` `suggestedOS`; `:85-88` `onRolled`
(also Claim 5's defect); `:96` `const suggested`; `:100` `actionEntries[].delta`;
`:101` `inst.suggestedDelta`; `:105` `confirmedDelta`; `:107`
`setHostAccessMethod`; `:108-110` `addMarkToHost`; `:111-112` `addOS`; `:113-115`
`catch` on dismiss — **AC-4 already holds**.

`.html`: `:23`, `:29` tooltips; `:91`, `:93` flow hints; `:120-122` hits summary
(keep); `:124-132` marks 0/1/2/3 buttons (keep — becomes the sole mark input);
`:134-142` OS preview (delete).

`os-prompt.component.ts`: `:15` `suggestedDelta`; `:18` `mode`; `:23-25`
`accept()`; `:27-30` `startModify()`; `:32-34` `applyCustom()`; `:36-38`
`cancel()`. `.html`: `:6-13` entries; `:14-17` suggested block; `:19-23` custom
input; `:27-32` buttons.

**Spec drift on AC-2:** passing `suggestedDelta = 0` is insufficient — default
`mode` is `confirm`, so the button reads `Accept (+0)` and the body reads
`Suggested OS: +0`. AC-2 requires collapsing `OsPromptComponent` to a **single
entry mode**: delete `mode`, `suggestedDelta`, `accept()`, `startModify()` and
the delta rendering; keep `actionEntries[].name`; make `customDelta` the only
value, starting empty rather than `0`.

### Claim 2 (AC-7 to AC-10)

`access-host-panel.component.ts:130-138` `applyDirectConnection()`: `:134`
`setHostAccessMethod`; `:135` `addMarkToHost(host, decker.name, 1)`; `:136`
confirm message. `.html`: `:35` tooltip; `:45-48` hint; `:62-64` button label.

**Structural limit on AC-8 and AC-9:** the panel is host-scoped
(`HostAccessMethod` lives on `MatrixHost`, `:4`, `:32`), while the effects those
criteria describe are device-scoped. `SharedMatrixTarget.directConnection`
exists on the wire (`session-sync.service.ts:143`, read at
`matrix-graph.component.ts:183`) but **nothing sets it and no GM-side
`MatrixTarget` field backs it**. Satisfy AC-8 and AC-9 as **static panel copy
only**. Do not invent a per-device flag in this pass.

### Claim 3 (AC-11 to AC-13)

`decker-card.component.ts:49-54` `osTierClass`; `.html:16` binding, `:18-19` the
`ic-alert` branch (C2), `:20-22` CONV label; `.css:76-78`, `:80-86`, `:88-90`.
`matrix-participant-badge.component.ts:54-56` already correct; `.html:8` binding;
`.css:60-61` dead `.os-ok` and `.os-alert`, `:62-67` live `.os-convergence`.

### Claim 4 (AC-14 to AC-19)

`hierarchy-editor.component.ts:53-59` `calcMatrixHealth`; `:131` host health;
`:138`, `:147` host writes; **`:208`
`calcMatrixHealth(f.type, Math.max(1, f.deviceRating), 1)`** — the literal `1` in
the rating position, so every persona and IC gets `8 + ceil(1/2) = 9`; `:217`,
`:229` target writes.

**Spec drift on renderers.** Exhaustive grep of `matrixHealth|matrixDamage`
across `src/`: the **only** production renderer is
`matrix-player-view.component.html:46-53`, which renders damage over health for
every target type. No host UI and no GM-side file UI renders health today. So
AC-14's rendering half is **already satisfied** (only the writes at `:131`,
`:138`, `:147` need removing), and AC-15's is satisfied GM-side but not
player-side — which collides with **Scope Question C**, proposing to drop the
maximum from the same six lines. Resolve C first.

**Two writers the spec does not name:**

- `matrix-state.service.ts:88` — `existing.matrixHealth = 8 + Math.ceil(rating / 2)`
  inside `createOrSetHost()`.
- `matrix-state.service.ts:191-201` — `updateHost()`'s
  `Partial<Pick<MatrixHost, ... | "matrixHealth">>`. **Narrowing this type to
  drop `matrixHealth` is the choke point that makes AC-14 compiler-enforced.**

**Two constructor defaults:** `MatrixHost.ts:55`
`?? (8 + Math.ceil((init?.rating ?? 1) / 2))`; **`MatrixTarget.ts:81`
`init?.matrixHealth ?? 8`** — a second hard-coded default the spec does not
mention, same defect class as the literal `1`.

**AC-18 and AC-25 rest on a false premise.** `ic-spawner.component.ts:56-58`
previews `8 + ceil(rating/2)`, rendered at `.html:30-32`. But `ICParticipant`
**never writes any health field** — it inherits `Participant`'s
`_physicalHealth = 10` and `_stunHealth = 10` (`Participant.ts:507-508`), while
`hierarchy-editor.component.html:218-224` renders IC as physical damage over
physical health. And **nothing anywhere constructs an `ICParticipant`** except
its own `clone()` (`:48`): `ICSpawnerComponent.onSpawn()` (`:90-93`) emits to an
`@Output` with no subscriber. So the spawner previews 9 while a real IC would
carry 10, irreconcilably, because no spawn path exists. **Restate AC-25:**
`ICParticipant`'s constructor sets `physicalHealth` from the ruled formula (and
decide whether `stunHealth` mirrors it or stays 10 — p. 229 gives IC no separate
stun concept), and `ICSpawnerComponent.matrixCM` reads the same shared helper.

**AC-19 is currently unreachable.** `MatrixRunState` is never serialised:
`SharedCombatState.matrixTargets` (`session-sync.service.ts:223`) has **no
producer anywhere in `src/`**, and there is no `localStorage` persistence of
Matrix state. No host or target record has ever left memory. Restate AC-19 as a
**negative structural assertion** — no migration code, fields stay declared, no
reader remains — not a behavioural test.

### Claim 6 (AC-20 to AC-25)

`ICParticipant.ts:5-8` `PATROL_IC_DICE = 2` and `IC_DICE = 4` with the phantom
"Table 4 / Table 24" citation; `:13-16` class docstring repeating it; `:37-38` a
second phantom citation; `:39` `baseIni = hostRating * 2`; `:43`
`setDicesWithoutRoll(Patrol ? 2 : 4)`.
`ic-spawner.component.ts:40-42`, `:44-46`, `:48-54`; `.html:22-28` preview,
`:47-49` correct p. 247 note (keep). `ICType.ts:1-9` — **seven** types,
confirming Scope Question D's "7 of 14".

Exhaustive search for `Table 4|Table 24|Table 25|Section 9.2` across `src/`
returns only `ICParticipant.ts:5` and `:37`.

**Spec drift 1 — AC-22 does not cover what the Request paragraph claims.** The
Request says one item (IC spawn limits) is "called out in AC-22". It is not;
AC-22 is the phantom-citation criterion and **no AC covers the spawn limits**.
The code is `ic-spawner.component.ts:60-88` (`atCap`, `isDuplicateType`,
`canSpawn`, `validationMessage`), `.html:54` `[disabled]="!canSpawn"`, and
`.html:14` `[disabled]="isTypeRunning(type)"` on the option elements — a **hard
refusal** of both the rating cap and the duplicate-type rule. Classified OUT OF
SCOPE, this pass leaves the enforcement in place. **Needs a decision.**
Recommended: `canSpawn` always true, `validationMessage` becomes a warning, drop
the option-level `[disabled]`.

**Spec drift 2 — `ARCHITECTURE.md:574-575` documents the current values
verbatim** (`ICParticipant` sets `baseIni = hostRating * 2` and dices to 2 for
Patrol or 4 otherwise). AC-20 and AC-24 must update it. The spec does not name it.

**Table Ruling 1 — RESOLVED, and against the spec body's recommended default.**
`briefs/matrix-condition-monitors-and-access.md:257` records the question as
"already ruled on 2026-08-28 as Host DP + Host Rating" — option **(b)**.
Confirmed directly: `git show feat/matrix-v2:RULINGS.md` carries a full entry
"2026-08-28 — IC Initiative Attribute = Host Data Processing + Host Rating",
whose reasoning notes that Host Rating times 2 appears on the *adjacent line* of
p. 247 as the IC **attack dice pool** and is therefore almost certainly a
transcription slip. `RULINGS.md` on this branch has no 2026-08-28 entry at all —
that day's four Matrix rulings were lost with the dropped Step 3a work.
**Proceed on (b). Do not use the spec body's recommended (a).** Also restore the
other three 2026-08-28 entries and the IC-health entry.

Table Ruling 4 (corrected 2026-09-01: two tied IC act simultaneously via
`CombatManager.getNextActors()`, not by falling through to a coin toss) needs
no code change. Record it.

### Claim 7 (AC-26 to AC-29)

`matrix-player-view.component.ts:93-99` the uncited comment; `:100-109`
`hostMarks()` returning a max over targets; `.html:14-18` renders it; `:81-86`
`contextTargets` filter (correct, keep — underpins S6).

**AC-27 is blocked on a missing wire field.** The component's only inputs are
`targets`, `myName`, `currentHostName`, `myVrMode` (`:15-27`). `MatrixHost.marks`
(`MatrixHost.ts:44`) is never broadcast; `SharedCombatState` carries only
`matrixTargets` and `currentHostName` (`session-sync.service.ts:221-224`), and
`SharedMatrixTarget` has no representation for "this is the host icon". **There
is no data source.** Recommended: add
`currentHostMarks?: Record<string, number>` to `SharedCombatState` beside
`currentHostName`, a matching
`@Input() hostMarksRecord: Record<string, number> | null = null`, and
`hostMarks()` returns `hostMarksRecord?.[myName] ?? 0`. Purely additive; no
producer today. **Rejected alternative:** broadcasting the host as a
`SharedMatrixTarget` with `type: "host"` — it would appear as a row in
`contextTargets` and break AC-28 and S6.

**AC-29's three sites are incomplete.** Full enumeration of the literal-3 cap:
`target-card.component.ts:42`, `:46`, `:62`;
`hierarchy-editor.component.ts:347`, `:351`, `:365`;
`matrix-state.service.ts:130`, `:220`;
`matrix-player-view.component.ts:47`;
`matrix-graph.component.ts:270` — `markDots` repeats a dot
`Math.min(3, total)` times where `total` **sums across all deckers**, so three
deckers holding one mark each renders as three dots. Display-only, wrong, **out
of this pass's scope — flag, do not fix.** All others are correct and stay.

### Preserved behaviour (AC-30 to AC-33)

AC-30 holds (`matrix-player-view.component.html:5-6`; no `overwatch` reference
anywhere in the player view). AC-31's target comment is `.html:3`. AC-32 holds
(`os-tracking.service.ts:82-90`; doc at `:66-73` already correct). AC-33 holds
(`OS_CONVERGENCE_THRESHOLD = 40` at `:38`, consumed at `:48` and `:111`).

**One duplicate literal:** `MatrixParticipant.ts:133` tests `>= 40`. Correct
value, correct surrounding citation (`:118-131`). Importing the constant would
make `src/Matrix/` depend on `src/app/services/`, inverting the layering.
**Recommended: leave the literal, add a cross-reference comment. Do not create
the dependency.**

## E. Affected-paths map

### Production

| File | Sites | ACs |
|---|---|---|
| `access-host-panel.component.ts` | delete `:65-67`; rewrite `:85-88` (fix C1, drop derivation); rewrite `:90-118`; rewrite `:130-138` | 1, 2, 5, 7 |
| `access-host-panel.component.html` | `:23`, `:29`, `:35` tooltips; `:45-48`; `:62-64`; `:91`, `:93`; delete `:134-142` | 1, 3, 5, 6, 8, 9, 10 |
| `os-prompt.component.ts` | delete `:15`, `:18`, `:23-25`, `:27-30`; keep `:32-34`, `:36-38` | 2, 3 |
| `os-prompt.component.html` | delete `:10`, `:14-17`, `:27-29`; `:19-23` becomes the body; add helper text | 2, 3 |
| `decker-card.component.ts` | replace `:49-54` with `'os-' + osBandFor(...)`; add import | 11, 12 |
| `decker-card.component.html` | delete `:18-19` | 12 |
| `decker-card.component.css` | replace `:76-78` with the four band classes plus comment; delete `:80-86`, `:88-90` if CONV goes | 13 |
| `matrix-participant-badge.component.css` | delete `:60-61`; add `.os-low`, `.os-building`, `.os-high`; keep `:62-67`; add comment | 13 |
| `hierarchy-editor.component.ts` | rewrite `:53-59` (drop the file case, drop the default catch-all, single explicit rating); delete `:131`; drop `matrixHealth` from `:138`, `:147`; rewrite `:208`; correct `:217`, `:229` | 14-18 |
| `matrix-state.service.ts` | delete `:88`; narrow the `Pick` at `:193` | 14, 19 |
| `MatrixHost.ts` | `:55` stop defaulting; keep field at `:27` | 14, 19 |
| `MatrixTarget.ts` | `:81` the unmentioned `?? 8`; keep field at `:51` | 15, 17, 19 |
| `ICParticipant.ts` | delete `:7`; rewrite `:5-8`, `:13-16`, `:37-38`; `:39` per TR1; `:43` unconditional 4; add `physicalHealth` per TR2 | 20, 22, 24, 25 |
| `ic-spawner.component.ts` | `:40-42` per TR1; `:44-46` returns 4; `:56-58` shared helper; `:60-88` per the spawn-limit decision | 21, 23, 24, 25 |
| `ic-spawner.component.html` | `:14`, `:54` per the spawn-limit decision; Patrol attack-vs-initiative note near `:41-45` | 21, 23 |
| `matrix-player-view.component.ts` | rewrite `:93-99`, `:100-109`; add the input | 26, 27, 28 |
| `matrix-player-view.component.html` | `:3` comment; `:46-53` per Scope Question C | 15, 31 |
| `session-sync.service.ts` | add `currentHostMarks` beside `:224` | 27 |
| `MatrixParticipant.ts` | `:133` cross-reference comment only | 33 |

### Documentation

| File | Sites | ACs |
|---|---|---|
| `docs/UNVERIFIED-RULES.md` | remove 3, 4, 6, 7, 8; move 5 out with citation; **also** the header `:3-7` and footer `:69-71`, which both state item counts | 35 |
| `docs/MATRIX_MODULE_PLAN.md` | dangling UNVERIFIED markers at `:83`, `:94`, `:95`, `:143`, `:197`, `:204`, `:207`, `:272`, `:273`, `:274`. `:83` and `:94` **state the OS-20 alert as the goal** — caught by AC-12 | 12, 35 |
| `ARCHITECTURE.md` | `:574-575` documents `hostRating * 2` and the 2/4 split verbatim | 20, 24 |
| `RULINGS.md` | restore the five lost 2026-08-28 Matrix rulings: IC initiative base, IC monitor size, VR decker incapacitation, host not a participant, IC spawn-turn timing | 24, 25, 34 |

### Checked and deliberately **not** affected

`target-card.*` (caps correct, no health, no OS); `matrix-graph.*` (its
`markDots` aggregate at `:270` is a separate display defect — flagged, not
fixed); `matrix-run-panel.*` (layout); `MatrixIcon.ts`, `VRMode.ts`, `index.ts`;
`battle-tracker.component.ts` and `.html` (`:1153-1166`, `:1289-1302`, and
`declared-actions.ts:215-239` are the **already-corrected reference
implementations — do not touch**); `battle-tracker.component.spec.ts:716-786`
(asserts no alert at 20 and the exact bands — **must keep passing unchanged**).

## F. The two exhaustive sweeps

### F1 — every Overwatch threshold literal (AC-12)

**Must change:** `decker-card.component.ts:52`;
**`decker-card.component.html:18` (not in the spec)**;
`decker-card.component.css:77`;
`matrix-participant-badge.component.css:60-61`;
**`docs/MATRIX_MODULE_PLAN.md:83` and `:94` (neither in the spec)**;
`docs/UNVERIFIED-RULES.md:28-30` (via AC-35).

**Correct, leave alone:** `os-tracking.service.ts:34-38`, `:47-52`, `:111`;
`MatrixParticipant.ts:132-134`; `session-sync.service.ts:109`;
`battle-tracker.component.ts:1153-1166`, `:1289-1302`;
`battle-tracker.component.html:110`; `battle-tracker.component.spec.ts:716-786`;
`RULINGS.md:781-804`; `declared-actions.ts:215-239`.

**Historical, do not edit:** `briefs/matrix-rules-verification.md`;
`briefs/responsive-design-pass.md` (its `.ic-alert-dismiss` is a **different**
CSS class on the battle tracker, unrelated to Overwatch — do not "fix" it).

AC-12 is satisfiable; that is the complete set.

### F2 — every hard-coded rating in a condition-monitor calculation

The `8 + ceil(x / 2)` formula appears in **four** production locations:
`MatrixHost.ts:55` (with a `?? 1` fallback); `matrix-state.service.ts:88`;
`ic-spawner.component.ts:57` (with a `?? 1` fallback);
`hierarchy-editor.component.ts:56`, `:57`, `:131`.

Plus two bare-8 defaults: `hierarchy-editor.component.ts:55` (the file case);
**`MatrixTarget.ts:81` (`?? 8`) — not in the spec.**

Plus the literal in the rating position: `hierarchy-editor.component.ts:208`.

**The pattern recurs five more times than the spec says.** Three of them
(`MatrixHost:55`, `ic-spawner:57`, `MatrixTarget:81`) also substitute 1 for a
missing rating via `??` — the same defect in different syntax.

Meat-side monitors (`DetachedGruntParticipant.ts:111-114`,
`NpcRowParticipant.ts:433-434`, `Participant.ts:507-508`) are a separate,
correct path. Not affected.

## G. Choke points

1. **One Matrix condition-monitor function.** Export
   `matrixConditionMonitor(rating: number): number` from `src/Matrix/` — the
   domain layer, importable by both the domain classes and the components
   without inverting layering. Callers after the change:
   `hierarchy-editor.saveTargetForm()` for device and persona;
   `ic-spawner.matrixCM`; `ICParticipant`'s constructor. Non-callers: hosts and
   files. **Deleting `calcMatrixHealth`'s default branch is what makes AC-14 and
   AC-15 structural** — an unhandled type becomes a compile error, not a silent 9.
2. **`osBandFor()` as the only band source.** Already exported, already used by
   the badge; `decker-card` becomes its second caller. No band literal survives
   in either component. `OsTrackingService` itself needs no edit.
3. **`MatrixStateService.updateHost()`'s `Pick` at `:193`.** Narrowing it makes
   "hosts have no monitor" compiler-enforced rather than vigilance-enforced.

**Layer assignment.** Domain (`src/Matrix/`): IC dice, IC initiative base, IC
health, the shared helper, the two constructor defaults. Service: the
`updateHost` narrowing, the `createOrSetHost` deletion, the additive
`SharedCombatState` field. Component TypeScript: `suggestedOS`, `onRolled`,
`applyDirectConnection`, `osTierClass`, `hostMarks()`, the spawner getters.
Templates: ACs 3, 5, 6, 8, 9, 10, 23, 26, 31 — **these are the cheapest and
highest-value part of the pass, because the wrong text is what a GM reads at the
table.** Write them as prose with page numbers inline, not terse formulas.
Stylesheets: AC-13 only, two files.

**Order.** Fix section C's two latent defects inside the ACs that already rewrite
those lines. Then Claim 3 (repairs a live bug, needs no ruling). Then Claims 1,
2, 7. Then, with the rulings restored, Claims 4 and 6.

## H. Blocked items

**Blocked on Table Ruling 1:** AC-24 only — `ICParticipant.ts:39`,
`ic-spawner.component.ts:40-42`, `ARCHITECTURE.md:574-575`.

**Blocked on Table Ruling 2:** AC-25, and by dependency AC-18 — the new
`physicalHealth` write, `ic-spawner.component.ts:56-58`, and `calcMatrixHealth`'s
IC handling at `hierarchy-editor.component.ts:208`.

**Safe now, in the same files:** AC-20 (the dice count is printed, p. 247, and
independent of the base); AC-21; AC-23. AC-22's *replacement* comment must name
Table Ruling 1, so land AC-22 with the ruling — the lines are adjacent.

**Not blocked at all:** AC-14, 15, 16, 17 (hosts, files, devices, personas —
only AC-18 depends on a ruling), and Claims 1, 2, 3, 7 and AC-35 in full.

## I. AC-35 verification

`docs/UNVERIFIED-RULES.md` read end to end. **The spec's item numbering is
correct.** Item 3 (`:28-30`) OS 20/40; item 4 (`:32-34`) IC initiative and dice
pool; item 5 (`:36-37`) the 3-mark cap (true, p. 236); item 6 (`:39-40`) HotF +2
per mark; item 7 (`:42-43`) BF marks times 4; item 8 (`:45-47`) direct connection
1 mark and 0 OS. Note item 4 says **"dice pool"** while the port implemented it
as *Initiative Dice* — the conflation is in the original claim, so the
replacement must resolve both halves separately, as AC-35 already says.

**Three additions AC-35 does not cover:**

1. The file's own framing breaks — header `:3-7` ("Items 1-9 below are Matrix
   claims") and footer `:69-71` ("Items 1-10 were part of the Matrix module
   build plan"). Update both; **do not renumber the survivors**, because
   `docs/MATRIX_MODULE_PLAN.md` references items by number in ten places.
2. Those ten markers become dangling. Replace each with the finding or a pointer
   to this brief. AC-35 must be extended to say so.
3. Items 1, 9 and 10 are also resolved by this brief's Governing Rules — item 1
   by pp. 159, 229 and 230; item 9 by p. 228; item 10 by p. 231 — and AC-35
   leaves them. `briefs/matrix-rules-verification.md:193-199` already prescribes
   the full disposition of items 1-10. **Recommended: execute AC-35 exactly as
   written, and open a separate follow-up for items 1, 2, 9 and 10** — widening
   now pulls in item 2 (VR catatonia), which this brief does not settle.

## J. Regression risk

1. **The live Overwatch chip.** `matrix-participant-badge` is the one Matrix
   component in the shipped app (`battle-tracker.component.html:822`). AC-13
   edits its stylesheet. Low risk and a net repair — but the only AC touching
   something a GM uses today.
2. **`battle-tracker.component.spec.ts:716-786`** — five tests asserting no alert
   at OS 20 and the exact cut points 15, 30 and 40. Nothing here should change
   them; if something does, the change is wrong. Guard rail on AC-11, 12 and 33.
3. **`gm-reconnect-state-loss.spec.ts:1007`** asserts the exact
   `SharedParticipantState` Matrix field allowlist. Adding `currentHostMarks` to
   `SharedCombatState` does not touch `SharedParticipantState`, so it should not
   fire — **verify anyway**; those assertions are deliberately brittle.
4. **`CombatManager.spec.ts:373-400`** exercises the Matrix and astral `clone()`
   overrides. `ICParticipant.clone()` (`:46-63`) re-runs the constructor and then
   copies fields by iterating the source's keys. If AC-24 or AC-25 add a
   constructor-time `physicalHealth` write, the key-copy loop then overwrites it
   from the source — **verify damage still round-trips.** That ordering is
   currently benign only because the constructor writes nothing.
5. **The 5D6 cap.** `ICParticipant:43` routes through `setDicesWithoutRoll`,
   which clamps to 1 through 5 (`Participant.ts:75-81`, `:211-213`). Patrol going
   2 to 4 stays under. `ARCHITECTURE.md:606-611` names this constructor as a
   sanctioned no-roll write path — **keep it there; do not switch to
   `changeDiceCount`.**
6. **Nothing else can break, because nothing else runs.** The realistic risk is
   not runtime regression but **compile-time surprise** when new tests pull these
   files into the program for the first time (section A).

**Current coverage:** zero for `src/app/matrix/` except the badge (indirect).
`MatrixParticipant` and `VRMode` are exercised by seven specs. **`ICParticipant`,
`MatrixHost`, `MatrixTarget`, `MatrixRunState` and `MatrixIcon` have no direct
tests at all.**

## K. Test plan

New file `src/scenarios/matrix-port-rules-correctness.spec.ts`, following
`src/scenarios/grunt-statblock-data-processing.spec.ts` (TestBed, real
components, `appConfig.providers`, a `resetCombat()` helper). Run under
`npm test`. **It must import the components under test directly** — that import
is the mechanism by which these files enter the type-checked program for the
first time, and it is the single most valuable line in the pass.

- **AC-1, 2, 5, 6** — mount the panel; assert `suggestedOS` is gone, the rendered
  tooltips and hints carry the corrected skill and attribute strings and never
  say "Cracking", and no node reports an OS figure.
- **AC-2 (the C1 fix)** — emit a `DiceRollRequest`; assert `hitCount` counts 5s
  and 6s and nothing throws. This proves S1 can happen at all.
- **AC-4** — dismiss the prompt; Overwatch, marks and access method unchanged.
- **AC-7** — call `applyDirectConnection()`; access method is set and
  `host.marks` is empty.
- **AC-11, 12, 13** — tier class equals `'os-' + osBandFor(n)` at 0, 14, 15, 19,
  20, 29, 30, 39 and 40; no node contains "IC ALERT" at any of them; all four
  band classes exist in both stylesheets.
- **AC-14, 15, 16, 17** — drive `saveHostForm()` and `saveTargetForm()`; hosts
  and file targets carry no computed monitor; a device at Device Rating 2, 3 and
  6 yields 9, 10 and 11; a persona derives from its device rating rather than
  returning 9 always.
- **AC-20, 21** — construct `ICParticipant` for all seven `ICType` values; dices
  is 4 in every case. Patrol's spawner range equals Killer's at the same host
  rating (S2).
- **AC-26, 27, 28** — S6, plus: 2 marks on a device inside H and 0 on H reads
  host 0 and device 2.
- **AC-30, 32, 33** — no Overwatch node in the player view under any state;
  `addOS(d, 0, ...)` moves nothing; convergence fires once crossing 40 (already
  at `battle-tracker.component.spec.ts:763-773` — **reference, do not
  duplicate**).
- **S8** — walk Overwatch 14 to 22; no threshold event, no state change, band
  class changes only at 15.

Deferred to Part B: AC-18, 24, 25 and S2's initiative-value half.
**Not testable, do not write as tests:** AC-3, 8, 9, 10, 23, 31 and 34 are copy
and comments. Assert their **presence in the rendered DOM** where user-visible
(3, 8, 9, 10, 23); leave 31 and 34 to review.

## L. Size check and recommended split

Roughly three days as one unit — at the `SCOPE.md` split boundary. Split along
the Table Ruling fault line:

**Part A — "Overwatch, marks and access-panel corrections" (~1.5 days, nothing
blocked).** Claims 1, 2, 3, 7. ACs 1-13, 26-33, 35. Plus section C's two latent
defects and the additive `currentHostMarks` field. Independently shippable;
repairs the one live defect; establishes the scenario spec file everything later
hangs off.

**Part B — "Condition monitors and IC initiative" (~1.5 days).** Claims 4 and 6.
ACs 14-25, plus 34. AC-18 and AC-25 share a function with AC-16 and AC-17, so
they want doing together.

**Do Part A first.** Part B's inputs are the restored 2026-08-28 rulings, which
can be re-recorded while Part A is in flight.

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
> `SCOPE.md`. Every acceptance criterion below that referenced the panel's
> roller, hit count or `marksGained` field is superseded accordingly — see
> `access-host-panel.component.ts`/`.html` and
> `src/scenarios/matrix-port-rules-correctness.spec.ts` for the corrected
> behaviour (`marksPlaced`, no roller, dynamic Apply label).

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

Four binding decisions, superseding the parts of this spec they touch. Where
they contradict anything above, **these win**. See
`briefs/matrix-port-rules-correctness.md`'s own 2026-09-02 section for the same
record.

1. **Marks are recorded, never derived.** Verbatim: "marks are just recorded
   and tracked by the app, we aren't doing any rolls outside the already
   existing dice roller if the user chooses to use that over their own
   physical dice and we aren't comparing any dice either."
2. **The Matrix module has no dice roller of its own** — withdraws Scope
   Questions A and A′ (see that section above, left in place and marked
   withdrawn rather than deleted). Verbatim: "I'm not aware of a dice roller
   other than the one that already exists in the battle tracker, the matrix
   module should not have a separate dice roller."
3. **Four more 2026-08-28/29 rulings restored**, alongside the five already
   restored 2026-09-01: VR Initiative Dice are absolute; marks propagate from
   a slave toward the master's three-mark cap; Matrix damage applies no
   penalty until the monitor is full; this module tracks Matrix state and does
   not apply effects. All four are in `RULINGS.md`, dated 2026-08-29, marked
   "Restored 2026-09-02".
4. **IC has a Matrix Condition Monitor only.** The 10-box Stun track
   `ICParticipant` inherited from `Participant` has no printed backing for IC
   and is dropped — see `RULINGS.md` 2026-09-02, "IC has a Matrix Condition
   Monitor only; the inherited Stun track is dropped".

**Consequences for this spec's numbered acceptance criteria:**

- **AC-1, AC-2** are otherwise unchanged, but the field they describe as
  `marksGained` in the ported code and its replacement is named
  `AccessHostPanelComponent.marksPlaced` as of this round (Decision 1) —
  matching the field's new meaning: a GM-recorded outcome, not a pre-roll
  declaration.
- **The Test Plan's "AC-2 (the C1 fix)" bullet** (appendix section K) —
  "emit a `DiceRollRequest`; assert `hitCount` counts 5s and 6s and nothing
  throws" — no longer applies. `AccessHostPanelComponent` has no
  `DiceRollerComponent`, no `onRolled()`, no `hitCount`, no `rolled` and no
  `rollLogged` output as of this round (Decision 2); the C1 mis-binding defect
  those tests guarded against is moot because the roller that had it is gone.
  Replacement coverage lives in
  `src/scenarios/matrix-port-rules-correctness.spec.ts`: no dice-roller import
  or selector exists in the component, `marksPlaced` is written only from the
  GM's own button selection, dismissing the Overwatch modal preserves both the
  flow and the selection, and the Apply button's label names the mark count.
- **Appendix sections C1, C3 and D's "Claim 1" notes**, and appendix section E's
  affected-paths row for `access-host-panel.component.ts`, describe the
  ported code's roller-binding defect and its fix as of 2026-09-01 — both now
  historical: the component they describe no longer has a roller to mis-bind
  or to log. Left as-is for the historical record rather than rewritten.
