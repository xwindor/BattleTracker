# Rules notes — Astral

Cached, page-cited rules citations for the Astral subsystem. Scope: Astral perception and projection, astral initiative, astral combat, spirits, wards.

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
`rules/INDEX.md`: `Core p. 314`. A bare page number is no longer acceptable in
new entries. Only the core rulebook is in use: do not add entries from any
other book until `rules/INDEX.md` marks it IN USE.

**Older entries.** Entries written before the rules were split into one folder
per book carry bare page numbers (`p. 314`) and `rules/pages/` source paths.
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

_No entries yet._
