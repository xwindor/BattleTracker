# Rules notes — Matrix

Cached, page-cited rules citations for the Matrix subsystem. Scope: Matrix actions, marks, hosts, Matrix initiative, cyberprograms, Overwatch Score, IC.

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

### PAN and WAN: device-only membership, and the Device Rating × 3 slave cap
- **Printed page:** p. 233 (source file: `rules/pages/p0235.txt`)
- **verified:** validator-confirmed 2026-09-11
- **Rule:** A PAN is a master device (commlink or deck) plus the devices slaved to it; the master handles up to (Device Rating × 3) slaved devices. A WAN is the same shape with a host as master and practically unlimited device slaves. Only devices can be slaves, masters, or part of a PAN. A mark on a slave also marks the master, never the reverse; a failed Sleaze against a slave marks only the slave's owner.
- **Interacts with:** `RULINGS.md` 2026-09-02 "Marks propagate up the containment hierarchy" and 2026-09-03 "Propagation is device-only at both ends" are both built on this page. Slave-cap warning is `RULINGS.md` 2026-09-11 (warn, never block).
- **Undefined:** whether a GM tool should flag a master over its cap — settled as a table ruling, not by the book.

### Files carry no ratings of their own; they use their owner's
- **Printed page:** p. 227 (source file: `rules/pages/p0229.txt`)
- **verified:** validator-confirmed 2026-09-11
- **Rule:** Files have no ratings of their own (file protection being the exception) and use the file owner's ratings when a Matrix action defends against them.
- **Interacts with:** p. 239 Edit File's defender rule. p. 228 Condition Monitors — a file has none. p. 238 Crack File, which targets the file's own protection rating once set.
- **Undefined:** none.

### Matrix Condition Monitor: 8 + (Device Rating / 2) boxes for a device
- **Printed page:** p. 228 (source file: `rules/pages/p0230.txt`)
- **verified:** validator-confirmed 2026-09-11
- **Rule:** Each device's Matrix Condition Monitor has 8 + (Device Rating / 2) boxes, resisted with Device Rating + Firewall. A persona's Matrix damage lands on the device it is running on, not a separate track (technomancers excepted — they take it as Stun).
- **Interacts with:** p. 227 — this page prints only the *device* formula; that a file has no Condition Monitor follows from p. 227 (files have no ratings) plus the absence of any file formula here, not from a positive statement on this page. `RULINGS.md` 2026-08-28 — IC borrows Host Rating in place of Device Rating.
- **Undefined:** none.

### Edit File defends with the host, or the owner — never a specific device
- **Printed page:** p. 239 (source file: `rules/pages/p0241.txt`)
- **verified:** validator-confirmed 2026-09-11
- **Rule:** Edit File (create, change, copy, delete or protect a file; Computer + Logic [Data Processing]) defends with the host holding the file, or the file's owner if it is not in a host. Protecting a file is a Simple Action, Computer + Logic [Data Processing]; hits become the protection rating, and a protected file cannot be read, changed, deleted or copied until that protection is broken.
- **Interacts with:** p. 227 (owner's ratings generally). p. 238 Crack File (defends with Protection Rating × 2 once protection is set) and Disarm Data Bomb (a bomb can be attached to a file and destroy it).
- **Undefined:** **which** non-host device a file sits on is never tested by any printed rule — the book distinguishes only "in a host" from "not." This is why the tracker places no restriction on a file's device parent (`RULINGS.md` 2026-09-11).

### A folder is a file whose contents are other files
- **Printed page:** p. 219 (source file: `rules/pages/p0221.txt`)
- **verified:** validator-confirmed 2026-09-11
- **Rule:** A file is a collection of data — a film, song, book, records, image — and may itself be a collection of other files, called a folder. A folder has no separate stats, icon type or Condition Monitor distinct from an ordinary file. This page also introduces the PAN descriptively: an individual's devices are often collapsed into one icon to reduce clutter, though some (a wireless gun, say) are shown separately on purpose. Files are never named as part of that collapse.
- **Interacts with:** p. 235 enumerates the icon types (host, persona, device, file) — there is no fifth "folder" type.
- **Undefined:** none.

### Persona subsumes the device icon; an agent is a persona; IC exists only in hosts
- **Printed page:** p. 235 (source file: `rules/pages/p0237.txt`)
- **verified:** validator-confirmed 2026-09-11
- **Rule:** When a person connects through a device, that device's icon is subsumed by the persona's and is effectively gone from the Matrix until they jack out. An agent is itself a persona: running alone it replaces the device's icon like a living user; running alongside its owner's persona on the same device it appears as its own separate persona. Each IC program has its own persona, and IC programs are not connected to devices because they are only found in hosts. A technomancer's living persona attaches to no device at all. Matrix Perception enumerates four icon types: host, persona, device, file.
- **Interacts with:** p. 233 — since a persona is never a device, it can never be slaved into a PAN. Nothing here supports a file attaching to a persona icon directly; that appearance is the device's icon disappearing, not the file changing parent.
- **Undefined:** none — unusually explicit.

### Most devices, including commlinks, carry only Data Processing and Firewall
- **Printed page:** p. 226 (source file: `rules/pages/p0228.txt`)
- **verified:** validator-confirmed 2026-09-11
- **Rule:** The four Matrix attributes are Attack, Sleaze, Data Processing and Firewall. Most devices, commlinks included, have only Data Processing and Firewall; decks and hosts have all four.
- **Interacts with:** p. 233 PAN slaving — commlinks are ordinary devices in this narrow attribute respect.
- **Undefined:** nothing here. **Note the limit of this citation:** it establishes only that commlinks are not *attribute*-distinct. It does **not** establish that commlinks are mechanically unremarkable — the book singles them out in plenty of other rules, with the same numbers but different rules attached (Xavier's correction, 2026-09-11). An earlier draft over-read this page in exactly that way.

### Devices and personas are the icons that act; hosts act internally
- **Printed page:** p. 234 (source file: `rules/pages/p0236.txt`)
- **verified:** validator-confirmed 2026-09-11
- **Rule:** Devices and personas are the only icon types that take action in the Matrix; hosts act internally. A device is any wireless real-world object; persona is the mode an icon takes when a person is actively connected through it.
- **Interacts with:** p. 235 (persona/agent/IC).
- **Undefined:** none.

### Crack File; Brute Force damage is conditional on the target being damageable
- **Printed page:** p. 238 (source file: `rules/pages/p0240.txt`)
- **verified:** validator-confirmed 2026-09-11
- **Rule:** Crack File defends with the file's Protection Rating × 2 — the one file test that does not fall back to the owner's ratings. Brute Force's damage clause is conditional: damage applies only if the target can take Matrix damage, which implies some targets (files) cannot.
- **Interacts with:** p. 227 (files have no ratings), p. 228 (Condition Monitors), p. 239 (protection is set by Edit File).
- **Undefined:** none.

### Files appear on commlinks and inside hosts
- **Printed page:** p. 224 (source file: `rules/pages/p0226.txt`)
- **verified:** validator-confirmed 2026-09-11
- **Rule:** The printed examples show files in two places: on a personal device (a hacker copying a music file from a commlink) and inside a host (files taken from a bank's archives, belonging to no device). No page states a third location is disallowed.
- **Interacts with:** p. 239 — Edit File's defender branches only on host-vs-not, which is why the absence of a stated restriction matters.
- **Undefined:** whether files *should* be restricted to commlinks is not addressed; the tracker allows any device (`RULINGS.md` 2026-09-11).
