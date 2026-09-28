# Table rulings

This table's calls on cases the core rulebook leaves open or contradicts.
Rules the book states outright are not listed here; the rules look-up
(`sr5-rules-lookup`) finds them when needed.

Each entry gives the date, the ruling in plain language, and the page whose
gap it fills: `(Core p. N)`. New rulings are Xavier's to make: put the question
to him, then append his answer at the bottom of the right section. Don't
re-decide an entry; if Xavier changes his mind, mark the old one "replaced"
and add the new one.

All 21 rulings below were re-confirmed by Xavier on 2026-09-28, when the old
rulings list was retired. The pages were read directly from the core rulebook
that day, or taken from the rules notebook where marked.

## Initiative, Seize and astral

### 2026-09-28 — No floor on Initiative Score
Initiative Score can go below zero and is never stopped at 0. The book never
states a floor; its own example reaches –4 (Core p. 160), and Interrupts can
reduce a score below 0 (Core p. 167).

### 2026-09-28 — No roll, no turn
Someone in the fight who hasn't rolled Initiative this Combat Turn is skipped,
can't take Interrupt Actions that cost Initiative, and doesn't keep the Combat
Turn going. The book only covers joiners who roll at once (Core p. 160).

### 2026-09-28 — Seize the Initiative needs a roll first
Seize the Initiative isn't available until you've rolled this Combat Turn. The
app refuses it, rather than warning. The book moves a seizer to the top
"regardless of your Initiative Score" and orders several seizers by their
Initiative Scores, which assumes a score exists (Core p. 160–161).

### 2026-09-28 — Seize the Initiative any time after rolling
Once you've rolled, you can Seize the Initiative at any time, including
outside your own turn. It costs 1 Edge, never costs Initiative, and isn't an
Interrupt Action. The book gives Seize no timing (Core p. 160), unlike Delaying
an Action (Core p. 161).

### 2026-09-28 — A lieutenant goes first on a tie with his team
A lieutenant tied with his own grunt group goes first, even if that puts him
ahead of an unrelated combatant on the same score. The book says the
lieutenant always goes first against his own team (Core p. 381); in a
three-way tie, that rule and the ordinary tie-break (Core p. 159) go round in a
circle, and the lieutenant wins.

### 2026-09-28 — Astral projection adds two Initiative Dice on top
Projecting adds two Initiative Dice on top of the character's current dice (so
3D6 for someone with no bonus dice); returning to the body removes them again,
and any bonus dice survive. The book says 2D6 (Core p. 101, p. 159), "gains
the die" (Core p. 160) and "+2D6 (3D6 total)" (Core p. 314). Adding on top
follows the rule for gaining Initiative Dice mid-turn: roll the extra dice
and add the sum (Core p. 160). This deliberately differs from VR, whose dice
are exact (see "Cold-sim is exactly 3D6, hot-sim exactly 4D6" below).

### 2026-09-28 — GM rolls are visible to players by default
GM and NPC rolls are shown to players unless the GM hides them. The GM can
hide the next roll, or all GM rolls. The book leaves this to the group
(Core p. 330).

## Grunts and NPC groups

### 2026-09-28 — A wound on any grunt slows the whole group
This is deliberately against the book, which says injury modifiers might put
some grunts on a different Initiative Score from the rest of their team
(Core p. 379). How it works:
- The group's shared score drops when a member takes a wound.
- Joining or leaving the group never moves it.
- A downed member's wound still counts.
- Healing gives it back.
- A grunt who needs his own score is split off onto his own row.

### 2026-09-28 — Grunts count as Edge 0 in tie-breaks
Grunts have no Edge attribute (Core p. 380), and tie-breaks use Edge
(Core p. 159), so a grunt group counts as Edge 0 on a tie. The group's Edge
pool (equal to its Professional Rating) is separate and isn't used for ties.

### 2026-09-28 — Final Physical damage exactly equal to Body: alive
A downed grunt whose final Physical damage exactly equals his Body is alive.
The book says alive if the damage is less than Body and dead if greater, and
is silent on equal (Core p. 379). The app currently shows "undetermined"; a
to-do item covers changing that.

### 2026-09-28 — Healing brings a downed grunt back
Healing a downed grunt below a full Condition Monitor brings him back into the
fight. The book's "out of action for the rest of the fight" (Core p. 379) is
read as "while the monitor stays full", because healing is the only way to
correct a mis-typed killing blow.

## Matrix, IC and marks

### 2026-09-28 — IC Initiative
IC's Initiative is the host's Data Processing + Host Rating + 4D6. The book
gives IC its own Initiative Score, 4D6, and says IC uses its host's Matrix
attributes, but never names which attribute (Core p. 247).

### 2026-09-28 — IC Condition Monitor size
IC's Matrix Condition Monitor is 8 + half the Host Rating, rounded up. The book
never gives the size (Core p. 247); a device's is 8 + half its Device Rating
(Core p. 228, from the notebook).

### 2026-09-28 — IC acts the Combat Turn it's launched
IC launched at the start of a Combat Turn rolls Initiative normally and acts
that turn, with no late-entry penalty. The host launches IC at the beginning
of each Combat Turn (Core p. 247).

### 2026-09-28 — Tied IC act at the same time
IC tied on Initiative with nothing else to compare act simultaneously. This is
the book's GM option for ties (Core p. 159).

### 2026-09-28 — A decker in VR has one row
A decker in VR has one row in the order, never a second row for the body. The
body can't act, and if attacked the GM treats it as unaware (Core p. 189); the
book says the body goes limp (Core p. 229). The new Initiative type replaces
the old one (Core p. 160).

### 2026-09-28 — Cold-sim is exactly 3D6, hot-sim exactly 4D6
In VR, a decker's Initiative Dice are exactly 3D6 (cold-sim) or 4D6 (hot-sim).
Augmentations don't add on top, and returning to AR restores the previous
dice. The book pulls both ways: "base" dice on the chart (Core p. 159), but
"+3D6" and the 5D6 cap (Core p. 229–230). **This deliberately differs from
astral projection**, which adds dice on top. Don't "fix" one to match the
other.

### 2026-09-28 — A host never gets a row
A host never gets a row in the initiative order. It perceives through its IC,
which instantly shares what it spots (Core p. 247).

### 2026-09-28 — Marks on a slaved device count toward the master's three
A mark placed on a slaved device also lands on its master, and counts toward
the master's limit of three marks. The book passes the mark up but never says
whether it counts toward the cap (Core p. 233).

### 2026-09-28 — No cooldown after a reboot or jack-out
After a reboot or jack-out there is no waiting period before the decker can go
again. The reset itself is printed (Core p. 242); the book gives no cooldown.

### 2026-09-28 — Files live only on commlinks, decks and hosts
A file can sit only on a commlink, a deck or a host. This replaces the old
"any device" ruling of 2026-09-11: files on a weapon make no sense. The book
only distinguishes "in a host" from "not in a host" (Core p. 239, from the
notebook), so this is a table call. The app doesn't enforce it yet; a to-do
item covers that.
