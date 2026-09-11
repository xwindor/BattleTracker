# Rules notes — Astral

Cached, page-cited rules citations for the Astral subsystem. Scope: Astral perception and projection, astral initiative, astral combat, spirits, wards.

**How to use this file.** `sr5-rules-analyst` reads it before searching
`rules/`, and reuses any citation already recorded here rather than
re-deriving it. Only search `rules/` for what is not already below, then
append what you find.

**Authority.** Every entry here was derived from `rules/pages/pNNNN.txt` by an
agent that opened the page. This file is a cache, not a source: if an entry and
the printed page disagree, the page wins — correct the entry. Entries without a
printed page number do not belong here; unverified claims go to
`docs/UNVERIFIED-RULES.md`.

**Appending.** One entry per rule, newest at the bottom of the relevant
section. Keep the format:

```
### <short rule name>
- **Printed page:** p. NNN (source file: `rules/pages/pNNNN.txt`)
- **verified:** analyst YYYY-MM-DD
- **Rule:** one- or two-sentence paraphrase. Never paste rulebook prose.
- **Interacts with:** other subsystems that modify it, page-cited.
- **Undefined:** anything the book leaves open (also flag as a table ruling).
```

**The `verified:` field.** Every entry carries exactly one, and it records who
last checked the citation against the printed page and when:

- `analyst YYYY-MM-DD` — derived by `sr5-rules-analyst`, which read the page
  once. One pair of eyes. Trustworthy enough to reuse, and every entry starts
  here.
- `validator-confirmed YYYY-MM-DD` — `sr5-rules-validator` independently
  re-derived this citation from `rules/` during a feature and it held up. Two
  independent readings of the same page.

Use today's date, written out in full. `validator-confirmed` is strictly
stronger than `analyst`: upgrade an entry when the validator confirms it, and
never downgrade one back. If the validator *disputes* an entry, that is not a
downgrade — correct the paraphrase or the page to what the validator found and
date it `validator-confirmed` as of that correction, or delete the entry
outright if the rule does not exist. Neither level licenses citing a page
without having seen its text.

Do not delete entries to make room. If a rule is superseded by a table ruling,
leave the citation and note the ruling with a pointer to `RULINGS.md`.

## Citations

_No entries yet._
