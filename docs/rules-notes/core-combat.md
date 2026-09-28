# Rules notes — Core Combat

Cached, page-cited rules citations for the Core Combat subsystem. Scope: Initiative, Combat Turns and Initiative Passes, action economy, ranged/melee combat, damage and condition monitors, surprise, interrupt and delayed actions.

**How to use this file.** `sr5-rules-lookup` reads it before searching
`rules/core/pages/`, and reuses any citation already recorded here rather than
re-deriving it. It searches the book only for what is not already below, then
appends what it finds. In its answers, a reused citation is labelled "from the
notebook", so it can be told apart from a page read that run.

**Authority.** Every entry here was derived from `rules/core/pages/pNNNN.txt` by an
agent that opened the page. This file is a cache, not a source: if an entry and
the printed page disagree, the page wins — correct the entry. Entries without a
printed page number do not belong here; a rules claim nobody has found on a
printed page stays out of the notebook altogether.

**Appending.** One entry per rule, newest at the bottom of the relevant
section. Keep the format:

```
### <short rule name>
- **Printed page:** Core p. NNN (source file: `rules/core/pages/pNNNN.txt`)
- **verified:** analyst YYYY-MM-DD
- **Rule:** one- or two-sentence paraphrase. Never paste rulebook prose.
- **Interacts with:** other subsystems that modify it, each cited with book and page.
- **Undefined:** anything the book leaves open (also flag as a table ruling).
```

**Citations name the book.** Every page number in this file — the entry's own
and any inside **Interacts with** — carries the book abbreviation from
`rules/INDEX.md`: `Core p. 159`. A bare page number is no longer acceptable in
new entries. Only the core rulebook is in use: do not add entries from any
other book until `rules/INDEX.md` marks it IN USE.

**Older entries.** Entries written before the rules were split into one folder
per book carry bare page numbers (`p. 159`) and `rules/pages/` source paths.
Those refer to the core rulebook (`rules/core/pages/`). Upgrade an entry to the
current format whenever you next touch it; upgrading the format alone does not
change its `verified:` field.

**Older ruling pointers.** Entries written before 2026-09-28 point to table
rulings by date (e.g. `RULINGS.md` 2026-09-11). Those dates belong to the old
rulings list, archived on 2026-09-28; the current `RULINGS.md` holds only the
rulings re-confirmed that day, under new dates. When you next touch such an
entry, point it at the current ruling, or drop the pointer if the ruling
wasn't carried forward.

**The `verified:` field.** Every entry carries exactly one. It records how many
independent readings of the printed page back the citation, and the date of
the latest:

- `analyst YYYY-MM-DD` — one reading of the page. Every new entry starts
  here; this is the label `sr5-rules-lookup` writes.
- `validator-confirmed YYYY-MM-DD` — two independent readings: a separate,
  later check re-derived the citation from the page and it held up.

The label names are historical; keep them so old and new entries compare.
Use today's date, written out in full. `validator-confirmed` is strictly
stronger than `analyst`: upgrade an entry only when a separate check has
independently re-read the page and agrees, and never downgrade one back. If a
later reading *disputes* an entry, correct the paraphrase or the page to what
the page actually says and date it as of that correction, or delete the entry
outright if the rule does not exist. Neither level licenses citing a page
without having seen its text.

Do not delete entries to make room. If a rule is superseded by a table ruling,
leave the citation and note the ruling with a pointer to `RULINGS.md`.

## Citations

### Initiative Score, Initiative Passes, and the 0-or-below floor
- **Printed page:** Core p. 159 (source file: `rules/core/pages/p0161.txt`), continuing Core p. 160 (`rules/core/pages/p0162.txt`)
- **verified:** validator-confirmed 2026-09-27
- **Rule:** Initiative Score = Initiative Test roll + Initiative Attribute; Edge allows rolling the maximum 5D6 once per Combat Turn. Highest acts first each pass. At the end of each pass every Score drops by 10 and anyone still above 0 acts again, until all are at 0 or less and the Combat Turn ends. A character at 0 or below may take one Free Action per pass and may still defend, but no Simple or Complex action. Tied Scores use ERIC (Edge, Reaction, Intuition, coin toss), with the GM's simultaneous-action alternative.
- **Interacts with:** Core p. 160 (late entry; wound-driven changes are immediate), Core p. 170 (the Wound Modifier reaches Initiative), `RULINGS.md` 2026-07-31 (no floor on Initiative Score), `RULINGS.md` 2026-08-07 (Simple/Complex blocked at 0 or below).
- **Undefined:** The book says wound modifiers "may" affect Initiative on this and later Combat Turns, not that they persist — do not overstate it. It also never contemplates a combatant in the fight with no rolled Score (see `RULINGS.md` 2026-09-19).

### Late entry to a Combat Turn already in progress
- **Printed page:** Core p. 160 (source file: `rules/core/pages/p0162.txt`)
- **verified:** validator-confirmed 2026-09-27
- **Rule:** A character entering combat after it has begun rolls their Initiative Score as normal, then subtracts 10 for each Initiative Pass that has already occurred. They may or may not get an Action Phase in the current Combat Turn.
- **Interacts with:** Core p. 159 (the ordinary per-pass decay this stacks with), Core p. 170 (wound modifiers apply on top, additively), `RULINGS.md` 2026-08-04 (a merged Grunt Group is a new row and takes the penalty), `RULINGS.md` 2026-08-28 (a Combat-Turn-boundary spawn has zero elapsed passes, so no penalty).
- **Undefined:** The book does not describe the procedure for slotting a late joiner into a pass already executing — only that they "have a chance". The tracker places them in the ordinary waiting pool.

### Wound Modifier reaches the Initiative attribute, and does so immediately
- **Printed page:** Core p. 170 (source file: `rules/core/pages/p0172.txt`); immediacy at Core p. 160 (`rules/core/pages/p0162.txt`) and Core p. 158 step 1 (`rules/core/pages/p0160.txt`)
- **verified:** validator-confirmed 2026-09-27
- **Rule:** The Wound Modifier penalty applies to the character's Initiative attribute and therefore to their Initiative Score during combat. The change is made immediately after the injury and can reorder the initiative order within the same Initiative Pass, but never grants another action.
- **Interacts with:** Core p. 159 (the Score it modifies), Core p. 160 (late-entry penalty, which stacks additively with this).
- **Undefined:** none noted. Note the immediacy sentence is on Core p. 160, not p. 170 — an earlier draft cited it to the wrong page.

### Seize the Initiative is an Edge Effect, not an Interrupt Action
- **Printed page:** Core p. 160 (source file: `rules/core/pages/p0162.txt`), continuing Core p. 161 (`rules/core/pages/p0163.txt`); printed in full again at Core p. 56 (`rules/core/pages/p0058.txt`)
- **verified:** validator-confirmed 2026-09-27
- **Rule:** Spending a point of Edge moves the character to the top of the initiative order regardless of their Initiative Score. Several seizers in the same Combat Turn all go before everyone else, ordered among themselves by their own Initiative Scores. The move to the top lasts the entire Combat Turn across multiple passes; the character returns to their normal place at the start of the next Combat Turn.
- **Interacts with:** Core p. 56 (every Edge Effect costs one point; no more than one point on any single test or action), Core p. 159 (the Score-based order it overrides, and the ERIC tie-break), Core p. 167 (Interrupt Actions — a separate mechanic; Seize is **not** listed in or cross-referenced from it and costs Edge, not Initiative Score).
- **Undefined:** The book states no precondition for declaring a Seize and gives it no step in the Combat Turn Sequence, unlike a Delayed Action (Core p. 161, Step 3A). Both are table rulings — see `RULINGS.md` 2026-09-21.

### Interrupt Actions
- **Printed page:** Core p. 167 (source file: `rules/core/pages/p0169.txt`)
- **verified:** validator-confirmed 2026-09-27
- **Rule:** An Interrupt Action is taken outside the character's own Action Phase and is clearly identified as one in the rules; Full Defense is the book's example. It may only be taken if the character has enough Initiative Score left in the Combat Turn to pay its price, and the reduction happens at the time of the action. A character may take one before their first Action Phase only if they are not surprised.
- **Interacts with:** Core p. 159–160 (the Score it spends and the 0-or-below limit), Core p. 192 (Surprise — not re-derived here), Core p. 160 (Seize the Initiative, which is **not** one of these).
- **Undefined:** Whether a participant who has not rolled may take one — the book assumes a Score exists. See `RULINGS.md` 2026-09-19.

### Combat Turn Sequence, and Delayed Actions' step anchor
- **Printed page:** Core p. 158 (source file: `rules/core/pages/p0160.txt`); Delayed Actions at Core p. 161 (`rules/core/pages/p0163.txt`)
- **verified:** validator-confirmed 2026-09-27
- **Rule:** Step 1 roll Initiative for everyone involved, Step 2 begin an Initiative Pass, Step 3/3A declare and resolve actions, Step 4 repeat for remaining characters, Step 5 begin a new Combat Turn. A Delayed Action must be declared during Step 3A; the delaying character keeps their own Initiative Score and still takes the ordinary −10 at the end of the pass.
- **Interacts with:** Core p. 159 (what Step 1 produces), Core p. 160 (Seize the Initiative, which has no such step anchor — the asymmetry that makes its timing undefined).
- **Undefined:** none noted for this entry.
