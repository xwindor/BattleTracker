# Spec: Data Processing on the PR 4 technomancer lieutenant

**Book:** All citations are Shadowrun 5th Edition **core rulebook**, the only
book indexed in `rules/`. Printed page numbers throughout; `rules/pages/pNNNN.txt`
= printed page NNNN − 2.

## Request

Import a Data Processing value for the one printed grunt statblock that has a
living persona, so that the PR 4 lieutenant's VR Matrix Initiative derives
correctly from stored attributes instead of from an invented Data Processing.

## Governing rules

1. **A technomancer's living persona takes its Matrix attributes from his
   Mental attributes; Data Processing equals Logic.** The Living Persona table
   gives Device Rating = Resonance, Attack = Charisma, Sleaze = Intuition, Data
   Processing = Logic, Firewall = Willpower. (p. 251)
2. **The same table is restated in the character-creation Final Calculations
   summary**, alongside the Matrix initiative formulae. (p. 101)
3. **Matrix VR Initiative (Cold Sim) = (Data Processing + Intuition) + 3D6.**
   (p. 101; restated p. 159; described in prose p. 229; tabulated p. 231)
4. **Matrix VR Initiative (Hot Sim) = (Data Processing + Intuition) + 4D6.**
   (p. 101; restated p. 159; described in prose p. 230; tabulated p. 231)
5. **Matrix AR Initiative does *not* use Data Processing.** The Final
   Calculations table and the Initiative Attribute Chart both give AR as
   Intuition + Reaction + 1D6 (p. 101, p. 159). The Matrix chapter's User Modes
   Table states it slightly differently — AR uses "Physical Initiative" and
   "Physical Initiative Dice", i.e. the character's actual augmented physical
   figures, not a fresh 1D6 (p. 231) — and the prose agrees: in AR you use your
   normal Initiative and Initiative Dice (p. 229). The repo has already resolved
   this in favour of the p. 231 reading (branch commit "Step 1: AR uses physical
   initiative").
6. **Initiative Dice for the two VR modes are fixed constants of the mode, not
   character data.** Cold-sim grants +3D6, hot-sim +4D6, in every one of the
   four places the book states them (p. 101, p. 159, p. 229, p. 230, p. 231).
7. **Initiative Dice from any source cannot exceed 5D6.** Stated in both VR mode
   descriptions (p. 229, p. 230); Edge can be spent to roll the maximum of 5D6
   for one Combat Turn (p. 159).
8. **A technomancer using his living persona can only be in AR or hot-sim VR.**
   Cold-sim requires a cyberdeck or commlink; his Initiative uses his Mental and
   Matrix attributes with the normal AR-or-hot-sim dice rules. (p. 251)
9. **A decker's Matrix attributes come from his cyberdeck, and the deck's four
   numbers are unassigned by design.** Each deck lists a Device Rating and an
   "Attribute Array" of four values, "but it does not specifically list which
   numbers go with which attributes" (p. 227). Under twelve words verbatim,
   because this is the disputed point.
10. **Deck configuration is a player choice at boot.** "When you first boot your
    deck, assign each of its four attribute values to one of the Matrix
    attributes." (p. 227)
11. **A deck's assignment is changeable mid-combat.** Reconfiguring is a Free
    Action, usable only on your own Action Phase, and is not a Matrix action;
    one use can switch two of the deck's Matrix attributes. (p. 228)
12. **The Shiawase Cyber-5 is Device Rating 5, Attribute Array 8 7 6 5,
    Programs 5.** (p. 227; identical row in the Street Gear table, p. 439)
13. **There are four Matrix attributes (ASDF). Most devices, including
    commlinks, have only Data Processing and Firewall; decks and hosts have all
    four.** (p. 226)
14. **Cyberdecks ship with a hot-sim module; commlinks do not.** "All cyberdecks
    include illegal hot-sim modules right out of the box" (p. 439); a deck's
    built-in sim module means "all you need is a DNI to use it for VR right out
    of the box" (p. 227). The commlink table lists a sim module as a separate
    purchase (+100¥, +250¥ for hot-sim) (p. 439).
15. **Initiative Score is Initiative attribute + rolled Initiative Dice; scores
    drop 10 at the end of each pass; ties break by ERIC — Edge, Reaction,
    Intuition, coin toss.** (p. 159)
16. **Lieutenants roll their own Initiative and, on a tie with their own team,
    always go first.** (p. 381)
17. **Grunts and lieutenants have no Edge attribute of their own**; they draw on
    a Group Edge pool equal to the team's Professional Rating. (p. 380, p. 381)
18. **PR 4 lieutenant's printed attributes:** B 3, A 3, R 4, S 3, W 5, L 5, I 5,
    C 4, ESS 6, RES 5. Printed lines: "Initiative 9 + 1D6", "Matrix Initiative
    9 + 3D6 (Hot Sim)", "Condition Monitor 10". Qualities: Natural Hardening,
    Technomancer. (p. 383)
19. **PR 5 lieutenant's printed attributes:** B 5, A 6 (9), R 5 (7), S 4 (7),
    W 5, L 5, I 5, C 4, ESS 1.3. Printed line: "Initiative 12 + 3D6". Skills
    include Cracking skill group 7 and Electronics skill group 6. Gear includes
    "Shiawase Cyber-5 cyberdeck [DR 5, Atts 8 7 6 5, Prog 5]" plus a program
    list. **No printed Matrix Initiative line.** (p. 384)

## Interactions and exceptions

Every other subsystem that touches a Data-Processing-driven initiative:

- **AR mode (p. 229, p. 231).** Data Processing is not a term. A participant in
  AR uses physical Initiative and physical Initiative Dice. Both Matrix-capable
  lieutenants are already correct in AR today and must remain so.
- **Technomancer mode restriction (p. 251).** A living persona supports AR and
  hot-sim only. This is a legality constraint, not an arithmetic one — cold-sim's
  formula is unchanged if a GM overrides it.
- **Technomancer damage track (p. 229, p. 251).** A technomancer has no Matrix
  Condition Monitor; Matrix damage lands as Stun on his person, resisted with
  living persona Device Rating + Firewall (i.e. Resonance + Willpower — 5 + 5 for
  this block). This interacts with the grunt single-Condition-Monitor rule
  (p. 381) but changes no initiative term.
- **Biofeedback (p. 229, p. 230).** Stun in cold-sim, Physical in hot-sim.
  Damage feeds wound modifiers, and wound modifiers affect Initiative Score on
  this and subsequent Combat Turns (p. 159). Existing tracker behaviour; no new
  work, but it is the live path by which a VR participant's Score changes
  mid-turn.
- **Dumpshock (p. 229).** 6S from cold-sim, 6P from hot-sim, resisted with
  Willpower + Firewall, plus a −2 dice pool modifier for (10 − Willpower)
  minutes. Damage → wound modifiers → Initiative Score. Note that a bricked deck
  leaves you with no functional Firewall, so only Willpower resists — irrelevant
  to a technomancer, who has no deck.
- **Unconsciousness in VR (p. 229).** A commlink or deck usually auto-switches an
  unconscious VR user to AR; if link-locked, you stay in VR and cannot defend. A
  technomancer's living persona is attached to no device at all (p. 235), so the
  auto-switch text has no device to describe. **This is an exception the book
  leaves hanging for technomancers specifically** — see undefined item 5.
- **Link-locking (p. 229).** Explicitly applies to technomancer personas as well
  as agents and sprites. Prevents Switch Interface Mode / Enter-Exit Host /
  Reboot; escape via Jack Out. Constrains *whether* a mode change is legal, never
  the arithmetic of one.
- **Infusion of [Matrix Attribute] (p. 252).** Sustained, Device target (and "a
  complex form with a Device target can also be used to target a persona",
  p. 252). Level must equal or exceed the attribute's current value; the
  attribute rises by the number of hits, capped at **twice** the target's normal
  rating; one Infusion per attribute at a time; it ends if that attribute is
  swapped in a Reconfigure action. **The PR 4 lieutenant carries Infusion of Data
  Processing** (p. 383) — so this block can raise its own VR Initiative attribute
  from 5 to as much as 10 mid-scene.
- **Diffusion of [Matrix Attribute] (p. 252).** Sustained; Opposed Software +
  Resonance [Level] v. Willpower + Firewall; on a win the target's attribute
  drops by net hits, **floor of 1**. **The PR 4 lieutenant also carries Diffusion
  of Data Processing** (p. 383) — and can be hit by one himself, dropping his VR
  Initiative attribute as low as 1 + Intuition.
- **Reconfigure (p. 228).** A decker swaps two Matrix attributes as a Free Action
  on his own Action Phase. If Data Processing is one of the two, his VR
  Initiative attribute changes mid-Combat-Turn. Applies to the PR 5 lieutenant,
  never to the PR 4 lieutenant (a living persona cannot be reconfigured, p. 251).
- **Matrix damage and bricking (p. 228).** There is **no** progressive attribute
  degradation: "there is no penalty for having Matrix damage until your Matrix
  Condition Monitor is completely filled". A deck runs at full attributes right
  up to bricking, at which point a VR user is dumped and takes dumpshock. So a
  decker's Data Processing is stable under damage until the deck dies outright.
- **Hosts and grids (p. 231, p. 235).** Entering a host, changing grids, noise,
  spam/static zones and running silent all modify **dice pools**, never the
  Initiative attribute or Initiative Dice. There is no physical distance to a
  host (p. 235). A host/grid boundary crossing therefore leaves a VR
  participant's Initiative Score untouched.
- **Group Edge (p. 380, p. 381).** A lieutenant has no Edge attribute, so the
  Edge step of an ERIC tie-break resolves as 0 for him and the tie falls through
  to Reaction. Against his own team he wins the tie outright regardless (p. 381).
- **Astral (p. 101, p. 159).** Astral Initiative is Intuition × 2 + 2D6. Wholly
  separate track; listed here only because the PR 2 lieutenant's block prints
  "Astral Initiative 8 + 3D6" (p. 382), a printed dice-count error of the same
  family as the PR 4 Matrix line. Out of scope.

## Edge cases the book defines

1. **Hot-sim caps at 5D6 like everything else** — enhancements and bonuses cannot
   push Initiative Dice past 5D6 (p. 229, p. 230). Nothing on the PR 4 block adds
   VR dice, so this is a guard, not an active case.
2. **Edge can be spent to roll the maximum 5D6 for a single Combat Turn**
   (p. 159). A lieutenant would draw on Group Edge to do it (p. 380).
3. **Diffusion cannot reduce a Matrix attribute below 1** (p. 252). A Data
   Processing of 0 is therefore never a rules-reachable state for a live persona.
4. **Infusion caps at twice the normal rating** (p. 252). For this block: Data
   Processing 5 → maximum 10, giving a ceiling VR Initiative attribute of 15.
5. **An Infused attribute loses the Infusion if it is swapped by a Reconfigure
   action** (p. 252) — deckers only; a living persona cannot Reconfigure (p. 251).
6. **A technomancer has no Matrix Condition Monitor; his Matrix damage is Stun to
   his person** (p. 229, p. 251), resisted with living persona Device Rating +
   Firewall (p. 228).
7. **A cold-sim/hot-sim user's body is limp; only AR users act physically**
   (p. 229). A VR participant does not simultaneously hold a meat Initiative
   Score.
8. **Unconscious in VR: the deck or commlink normally kicks you to AR;
   link-locked, you stay** (p. 229).
9. **A deck's attribute assignment is chosen at boot and re-choosable as a Free
   Action on your own Action Phase** (p. 227, p. 228).
10. **A device's Matrix attributes do not degrade with damage** (p. 228).
11. **Lieutenant beats his own team on an initiative tie** (p. 381); other ties
    use ERIC (p. 159).

## Undefined / needs a table ruling

**1. What does the tracker store for the PR 5 lieutenant (decker, Shiawase
Cyber-5)?**
The rules positively refuse to assign his array (p. 227), and he can re-assign
it mid-fight (p. 228). Any number the app chooses is an invention.
*Recommended default: store no Data Processing; store a GM-facing note naming
the deck and its unassigned array "8 7 6 5" (p. 227, p. 384).* Reason: it
surfaces exactly what the book supplies, and no more.

**2. What is the display and behaviour when a Matrix participant has no Data
Processing set?**
The book has no concept of an unset Matrix attribute (the reachable floor is 1,
p. 252).
*Recommended default: treat absent as unset and render blank, deriving no VR
Initiative until the GM enters a value; do not seed a hardcoded default.*
Reason: the current promote path seeds 6, which is authoritative-looking and
belongs to no character in the book.

**3. Does the app offer Cold-Sim for a living-persona participant, given p. 251
forbids it?**
*Recommended default: keep offering it, and compute it correctly if selected
(Data Processing + Intuition + 3D6, p. 101/159/229/231).* Reason: `SCOPE.md`
states the app does not enforce legality. Alternative if you prefer guardrails:
disable Cold-Sim when the participant is flagged as a technomancer — but nothing
in the current data model carries a technomancer flag, so that would be a new
field.

**4. How much does the PR 4 lieutenant's discrepancy note say?**
*Recommended default: keep the existing note (printed "9 + 3D6 (Hot Sim)",
p. 383; derived 10 + 4D6 from p. 101/159/230/231) and append that a living
persona cannot use cold-sim at all (p. 251).* Reason: every clause is checkable
against a printed page. **Do not** put the commlink conjecture (see
"Contradictions" below) in the app; it is speculation and would be the only
uncheckable line in the notes array.

**5. If a technomancer is knocked unconscious in hot-sim VR, what does the
tracker do with his mode?**
p. 229 says the deck or commlink switches you to AR; a living persona is
attached to no device (p. 235), so the book's mechanism has no subject. This is
a genuine gap, not an omission on our part.
*Recommended default: change nothing automatically — leave him in VR and let the
GM switch him.* Reason: the app doesn't auto-decide state transitions, and the
alternative reading (he drops to AR) is an inference, not a printed rule.

**6. Only if Data Processing is editable mid-Combat-Turn: does an edit move the
running Initiative Score, or only the next roll?**
The book has mid-turn Initiative-attribute changes (Infusion/Diffusion, p. 252;
Reconfigure, p. 228) and confirms Initiative Score is a live value that later
effects modify (wound modifiers, p. 159), but never states the recomputation
rule for an attribute swap mid-pass.
*Recommended default: apply the same convention the tracker already uses for a
mid-turn Reaction edit — do not introduce a second, Matrix-only convention.*
Reason: two rules for "an initiative attribute changed" is how this gets wrong
later. Check `docs/INITIATIVE-MUTATION-SOURCES.md` and `RULINGS.md` for the
existing convention before implementing.

**7. Should the Data Processing value participate in the augmented/base-values
toggle?**
*Recommended default: no — Data Processing is identical in both modes.* Reason:
a living persona's Data Processing derives from Logic (p. 251), and the PR 4
block prints no bracketed Logic. The toggle models switchable augmentation; this
isn't one.

## Acceptance criteria

Each item is an assertion checkable against the cited printed page.

1. `pr4-lieutenant` stores a Data Processing of **5**, sourced from its printed
   Logic 5 (p. 383) via Living Persona Data Processing = Logic (p. 101, p. 251).
2. No Logic field is introduced; the block stores a Data Processing value only
   (p. 251 makes Data Processing the derived attribute the tracker needs).
3. With `pr4-lieutenant` in **Hot-Sim VR**, the derived base Initiative is **10**
   = Data Processing 5 + Intuition 5 (p. 101, p. 159, p. 230, p. 231, p. 383).
4. With `pr4-lieutenant` in **Hot-Sim VR**, the derived Initiative Dice count is
   **4D6**, taken from the mode and never from a statblock field (p. 101,
   p. 159, p. 230, p. 231).
5. With `pr4-lieutenant` in **Cold-Sim VR** (if offered), the derived base is
   **10** and the dice count is **3D6** (p. 101, p. 159, p. 229, p. 231).
6. With `pr4-lieutenant` in **AR**, Data Processing is not a term; the derived
   Initiative remains Reaction 4 + Intuition 5 = **9** with the block's own
   **1D6** (p. 159, p. 229, p. 231, p. 383). This is a regression assertion: the
   AR figure must be byte-identical to pre-change behaviour.
7. The printed string "Matrix Initiative 9 + 3D6 (Hot Sim)" is never imported as
   a value; it exists only as GM-facing note text on the block (p. 383).
8. VR Initiative Dice counts are constants of the user mode (3D6 cold, 4D6 hot)
   and are not readable from, writable to, or overridable by any statblock field
   (p. 231).
9. No code path allows a participant's Initiative Dice to exceed **5D6** from any
   combination of sources (p. 229, p. 230).
10. `pr5-lieutenant` imports **no** Data Processing value. Its Data Processing is
    supplied by a cyberdeck, whose array the book leaves unassigned (p. 227,
    p. 384).
11. If `pr5-lieutenant`'s deck is recorded at all, it is recorded as the
    unassigned array **8 7 6 5** with Device Rating 5, never as a single Data
    Processing number (p. 227, p. 384, p. 439).
12. The remaining twelve blocks import no Data Processing. Each carries only a
    commlink (pp. 381–384); a commlink has no printed attribute array (p. 439)
    and only two Matrix attributes (p. 226); and none of the twelve lists the sim
    module a commlink needs for VR (p. 439).
13. Intuition is the second term for **both** VR modes and is already imported
    for all fourteen blocks (p. 101, p. 159, p. 231). No new second-term field is
    required.
14. The living persona's other attributes — Device Rating = Resonance, Attack =
    Charisma, Sleaze = Intuition, Firewall = Willpower (p. 251) — are **not**
    imported. None is a term in any initiative formula (p. 101, p. 159, p. 231).
15. Nothing in this change models mid-combat Data Processing mutation. The book's
    mutators are Infusion / Diffusion of [Matrix Attribute] (p. 252) and a
    decker's Reconfigure Free Action (p. 228); both remain GM-driven manual
    edits.
16. Matrix damage does not reduce Data Processing; a device operates at full
    attributes until its Matrix Condition Monitor fills (p. 228).
17. If a Data Processing bound is enforced anywhere, its rules-supported floor is
    **1** (Diffusion cannot go lower, p. 252) and its rules-supported ceiling for
    a persona under Infusion is **twice the normal rating** (p. 252). A stored
    value of 0 must be interpreted as "unset", never as a rated 0.
18. Regression: `pr4-lieutenant`'s Condition Monitor derivation and its existing
    Condition Monitor note are unchanged by this work; its printed Condition
    Monitor of 10 (p. 383) continues to be overridden by the derived value per
    the standing ruling.
19. Regression: on an Initiative Score tie between `pr4-lieutenant` and his own
    PR 4 grunt row, the lieutenant acts first regardless of track (p. 381); on a
    tie against anyone else, ERIC applies with his Edge resolving as 0 (p. 159,
    p. 380).
20. Regression: an existing saved/synced session created before this change still
    loads, with participants that carry no Data Processing behaving exactly as
    undefined item 2 resolves.

## Gameplay scenarios to survive

**S1 — Ordinary case: the technomancer jacks in.**
GM adds `pr4-lieutenant` from the statblock picker and switches him to Hot-Sim
VR. The app shows base Initiative **10** and rolls **4D6**. Roll comes up
3+5+2+4 = 14. **Expected Initiative Score 24** (p. 101, p. 159, p. 230, p. 231,
p. 383). Second pass: 14. Third: 4. Fourth: −6, no pass.

**S2 — Tie, two ways.**
(a) The lieutenant is in AR at Score 9+4 = 13; his own PR 4 grunt row also rolls
13. **Expected: lieutenant acts first, no ERIC needed** (p. 381).
(b) The lieutenant ties a player character at 13. **Expected: ERIC runs — Edge
first, and the lieutenant's Edge is 0 because grunts and lieutenants have no
Edge attribute of their own (p. 380); if the PC has any Edge at all the PC wins;
if both are 0, compare Reaction 4, then Intuition 5, then coin toss** (p. 159).

**S3 — Mid-Combat-Turn state change: Infusion of Data Processing.**
The lieutenant is in Hot-Sim VR with Score 24 and has already taken his first
pass (Score now 14). On his Action Phase he threads **Infusion of Data
Processing** (p. 383) and scores 3 hits at a Level ≥ 5. **Expected: Data
Processing rises 5 → 8, within the cap of twice normal rating = 10 (p. 252). The
GM sets Data Processing to 8 by hand. What happens to the running Score of 14 is
undefined item 6 — the app must do whatever it already does for a mid-turn
Reaction edit, and must do the same thing every time.** His next Combat Turn
definitely rolls 8 + 5 = 13 + 4D6.

**S4 — Two tracks at once, and the contrast case.**
(a) The lieutenant is in Hot-Sim VR. His body is limp (p. 229). **Expected: one
participant, one Initiative Score, on the Matrix track only. The app must not
present a simultaneous meat-body Score for him.**
(b) Contrast, and this one *is* two tracks: the PR 2 lieutenant wagemage
(p. 382) astrally projects, leaving a body behind. **Expected: Astral Initiative
derives as Intuition 4 × 2 = 8 with 2D6 (p. 101, p. 159), not the printed
"8 + 3D6" (p. 382). The printed dice count is a second, independent printing
error and must not be imported. Out of scope for this change — assert only that
this change does not touch it.**

**S5 — Unconscious in VR.**
The lieutenant, in Hot-Sim VR, takes 9 boxes of Matrix damage. As a technomancer
he has no Matrix Condition Monitor, so it lands as **Stun on his person**,
resisted with living persona Device Rating (Resonance 5) + Firewall (Willpower 5)
= 10 dice (p. 228, p. 229, p. 251), against his single grunt Condition Monitor
(p. 381). He goes down. **Expected: wound modifiers apply to his Initiative Score
on this and subsequent turns (p. 159); the app does not auto-switch him to AR,
because the p. 229 auto-switch describes a deck or commlink and his living
persona is attached to no device (p. 235) — undefined item 5. GM switches him
manually if she wants.**

**S6 — Host / grid boundary.**
The lieutenant, in Hot-Sim VR at Score 24, enters a host mid-pass. **Expected:
Initiative Score unchanged at 24, Data Processing unchanged at 5, dice count
unchanged at 4D6.** Nothing on pp. 229–231 makes a host or grid boundary alter
the Initiative attribute or dice; noise and grid penalties are dice-pool
modifiers only (p. 231), and there is no physical distance to a host (p. 235).

**S7 — The decker, who has no number.**
GM adds `pr5-lieutenant` and switches him to Cold-Sim VR. **Expected: the app has
no Data Processing for him and derives nothing, prompting the GM instead of
guessing (p. 227 — the deck's array is deliberately unassigned; p. 384 — his
block prints no Matrix Initiative line).** GM reads the note, assigns Data
Processing 8 from the Shiawase Cyber-5's 8/7/6/5 array (p. 227, p. 439), and the
app derives **13 + 3D6** (p. 101, p. 159, p. 229, p. 231). Note his Logic of 5 is
never consulted (p. 227 vs p. 251).

**S8 — Mode switch mid-Combat-Turn, decker edition.**
`pr5-lieutenant` starts in AR at his printed augmented **12 + 3D6** (p. 384,
p. 231). On his Action Phase he jacks into Hot-Sim VR with Data Processing set to
8. **Expected: the Initiative attribute changes from Reaction 7 + Intuition 5 =
12 to Data Processing 8 + Intuition 5 = 13, and the dice count from 3D6 to 4D6
(p. 231).** Then, still in the same Combat Turn, he takes a Free Action on his
own Action Phase to Reconfigure, swapping Data Processing 8 with Firewall 5
(p. 228). **Expected: his VR Initiative attribute drops to 5 + 5 = 10; and if he
had an active Infusion on Data Processing it would end (p. 252).**

## Contradictions between the printed block and the general rules

**Flagged, not resolved.** Standing approach: derive from stored attributes,
record the printed line as a GM-facing note.

**C1 — PR 4 lieutenant, base value.** Block prints "Matrix Initiative **9** +
3D6 (Hot Sim)" (p. 383). Rules give Data Processing (Logic 5) + Intuition 5 =
**10** (p. 101, p. 251). The printed 9 is exactly his Reaction 4 + Intuition 5 —
his *physical* Initiative attribute, which the same block prints on the line
above as "Initiative 9 + 1D6".

**C2 — PR 4 lieutenant, dice count.** Block prints **3D6** on a line labelled
"(Hot Sim)". Hot-sim is **4D6** in all four statements of the rule (p. 101,
p. 159, p. 230, p. 231). 3D6 is the cold-sim count.

**C3 — PR 4 lieutenant, mode legality.** A technomancer on his living persona can
use AR and hot-sim only; cold-sim requires a deck or commlink (p. 251). So the
printed line cannot be salvaged by re-reading it as a cold-sim line for his
living persona.

**C4 — Conjecture, explicitly unverified.** 9 + 3D6 is precisely what a
*cold-sim* initiative would be for a persona running on his **Erika Elite
commlink, Device Rating 4** (4 + Intuition 5 = 9, cold-sim 3D6), with the "(Hot
Sim)" label wrong. This rests on Data Processing = Device Rating for a commlink,
**which I could not find stated in the indexed core rules** — see "Could not
verify" item 1. Recorded as a possible explanation only. Not a basis for any
stored value.

**C5 — Out of scope, same family.** PR 2 lieutenant prints "Astral Initiative
8 + 3D6" (p. 382); rules give Intuition × 2 + **2D6** (p. 101, p. 159). Flagged
for completeness; not addressed by this change.

## Could not verify / OCR damage

1. **A commlink's Data Processing rating.** p. 226 establishes that a commlink
   has Data Processing and Firewall but no Attack or Sleaze; the Street Gear
   commlink table (p. 439) lists only Device Rating, Availability and Cost — no
   attribute array. Searched `rules/pages` for "attribute array" (single hit,
   p. 227, cyberdecks only), "Data Processing and Firewall", "equal to (its|their)
   Device Rating", "DEVICE RATINGS" and "COMMLINKS". The nearest analogue found
   is for drones: a drone's Device Rating equals its Pilot Rating, "meaning all of
   its Matrix attributes are equal to the Pilot Rating" (p. 271) — that is a drone
   rule, and it is not extended to commlinks here. **Verdict: not found in indexed
   rules.** Consequence: conjecture C4 is unverified, and any commlink-persona
   Data Processing is a table ruling, not a rule.
2. **Whether VR strictly *requires* a sim module.** The book strongly implies it —
   a deck's built-in sim module means "all you need is a DNI to use it for VR
   right out of the box" (p. 227), commlinks buy one separately (p. 439), and
   dumpshock is described as your sim module kicking out (p. 229) — but no page
   was found stating the prerequisite as a rule. **Verdict: implied across
   pp. 227/229/439; not found stated as a requirement.** It affects no acceptance
   criterion; it only supports the reasoning that the twelve commlink-only blocks
   cannot enter VR as printed.
3. **OCR damage, `rules/pages/p0386.txt` (printed 384), PR 6 lieutenant.** The
   Initiative line reads `6         15 + 4D6` — the word "Initiative" is lost and
   a stray "6" is interleaved from the adjacent attribute row. The intended line
   is "Initiative 15 + 4D6", consistent with his Reaction 6 (9) + Intuition 6.
   Already imported correctly as `pr6-lieutenant`; flagged so no one re-derives it
   from the raw text.
4. **OCR damage, `rules/pages/p0386.txt` (printed 384), PR 5 lieutenant Programs
   line.** Line 90 reads `EnNcrOypNtio-n,P FoLrkA, HYamEmRer , LCocHkdAowRnACTERS >>`
   — the page footer "NON-PLAYER CHARACTERS >>" is character-interleaved with the
   program list. Recoverable as Armor, Biofeedback, Configurator, Decryption,
   Encryption, Fork, Hammer, Lockdown. Not imported (D-X2 excludes gear and
   programs); flagged only so the damage is on record.
5. **Minor printed inconsistency, no impact.** The Novatech Navigator's
   Availability is 6R on p. 227 and 9R on p. 439. Noted while cross-checking the
   Shiawase Cyber-5 row (which is identical on both pages). Irrelevant to this
   change.
6. **Grunt statblock range confirmed closed.** p. 385 was read to check for
   continuation; it begins the Prime Runners section. The fourteen sample
   grunt/lieutenant blocks occupy pp. 381–384 exactly, with the grunt framework
   rules on pp. 380–381.
