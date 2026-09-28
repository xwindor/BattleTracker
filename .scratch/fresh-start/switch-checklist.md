# The switch checklist

**Signed off by Xavier, 2026-09-28.**

Everything the switch does, assembled from the map's decisions and the
resolved tickets. Carried out in one session, as one commit Xavier approves.
Nothing in the app's behaviour changes; the app changes it implies become
to-do items (step 5).

## 1. Move out of the project folder

These go to `C:\Users\xavie\OneDrive\Documents\Shadowrun\SR5E tracker archive (pre-2026-09-28)\`, keeping their folder layout. Moving them removes them
from the project in the commit; git history keeps a copy.

- `SCOPE.md`, `ARCHITECTURE.md`, `RULINGS.md` (the old one)
- `docs/APP_DOCUMENTATION.md`, `docs/FEATURE-BACKLOG.md`,
  `docs/MATRIX_MODULE_PLAN.md`, `docs/UNVERIFIED-RULES.md`
- `briefs/` (53 old rules briefs and specs)
- `.claude/agents/` (all six old helpers)
- `.claude/skills/change/`, `.claude/skills/feature/` (the old routines)
- `.scratch/fresh-start/research/` (inventories of the old documents, kept with
  the documents they describe)
- `docs/cyberdeck-theme-notes.md`, `.local-notes/` (never committed; just
  moved), `.project_planning_files/`

## 2. Delete

- `.claude/worktrees/` (stale copies from around May). One of them,
  `pure-bouncing-kay`, is still registered with git as a working copy, so
  remove it with `git worktree remove`. Checked 2026-09-28: it is the untouched
  upstream app from June 2025, plus an unsaved old `briefs/` folder; nothing
  of value. Delete its branch too.
- `.scratch/working-rules/` (the last attempt's unapproved draft)

## 3. Install and rewrite

- `CLAUDE.md` ← `.scratch/fresh-start/drafts/CLAUDE.md`
- `.claude/agents/sr5-rules-lookup.md` ← `drafts/sr5-rules-lookup.md`
- `docs/agents/domain.md` ← `drafts/domain.md`
- `CONTEXT.md`: drop the sentence saying the old documents outrank it; commit
  it (it's currently uncommitted).
- `docs/rules-notes/` (the notebook, kept):
  - rewrite each file's header to name `sr5-rules-lookup` and drop mentions
    of the analyst, the validator and the unverified-rules list
  - in `matrix.md`, fix the two entries saying the tracker allows files on any
    device
- `.scratch/fresh-start/drafts/` is deleted once installed.

## 4. Write the new decision files

### `RULINGS.md` (new, short): 21 table rulings

Each ruling gets a date, a plain-language ruling, and "(Core p. N)" for the gap
it fills. Wording comes from the review tickets.

- **Initiative (7)**, from [the initiative review](issues/03-review-the-old-rulings.md):
  - no floor on Initiative Score
  - no roll, no turn
  - Seize needs a roll first
  - Seize any time after rolling
  - lieutenant tie precedence
  - astral projection adds two dice on top
  - GM rolls visible by default
- **Grunts (4)**, from [the grunts review](issues/07-review-the-old-rulings-grunts.md):
  - a wound slows the whole group
  - grunt Edge counts as 0 for ties
  - damage exactly equal to Body means alive
  - healing revives
- **Matrix (10)**, from [the Matrix review](issues/08-review-the-old-rulings-matrix.md):
  - IC Initiative
  - IC monitor size
  - IC acts the turn it's launched
  - tied IC act simultaneously
  - a VR decker has one row
  - VR dice are exact (deliberately unlike astral)
  - a host has no row
  - slave marks count toward the master's three
  - no reboot cooldown
  - files only on commlinks, decks and hosts

### `docs/adr/`: 17 product decisions, one file each

1. Tracker, not a referee. Its examples: the Matrix side records numbers and
   never applies effects; Matrix noise is a reminder only; modelling a
   subsystem's whole decision tree is out of scope.
2. No undo.
3. Suggestions only on tap.
4. One dice roller.
5. Player screens can be locked, with guarantees.
6. Nothing before the session.
7. Condition Monitor maximums never appear in the log.
8. Editing a stat is a correction, not an in-game event.
9. Marks passed up automatically are shown first and never removed
   automatically.
10. The app never fills in a made-up number.
11. The PAN slave cap warns, never blocks.
12. A player always rolls the Initiative dice they lose (GM can roll for an
    absent player).
13. The app changes the GM's data only after saying so.
14. Enforcing a rule: warn by default; refuse only where Xavier has said so.
15. Rules must be right wherever the app does the maths.
16. Only a player's first character gets the roll prompt (for now).
17. A future Matrix player view shows a player only their own marks.

## 5. Write the new to-do items (25)

One file per item, `Status: needs-triage`, grouped into folders by area:
`.scratch/at-the-table/`, `.scratch/log/`, `.scratch/rooms/`,
`.scratch/matrix/`, `.scratch/player-prompts/`, `.scratch/far-future/`.

- **21 from [the backlog skim](issues/04-skim-the-backlog.md)**, numbered 1–21
  there.
- **4 from the reviews:**
  - show "alive" when a grunt's final Physical damage equals his Body
  - a device kind in the Matrix editor, so files only go on commlinks, decks
    and hosts
  - the player rolls their lost dice on a GM-side jack-out or deck removal
  - prompt for every character a player controls
- The six existing initiative-rolling to-do items stay as they are.

## 6. Clean up Claude's saved notes (memory, outside the project)
- **Delete** the four notes written before the reset: project state (May),
  architecture pain points, undo removal planned, Matrix restart.
- **Update** the fresh-start note to say the switch is done. Fold the "Matrix
  is active" note into it, since the new instructions no longer say "paused".
- **Keep** "docs are local only, never commit".

## 7. Commit

- Before starting, check for app changes from other sessions (e.g. the UI
  revamp). Leave any you find untouched and out of this commit: stage only the
  switch's own files.
- Show Xavier the full list of changes first; commit only after his approval.
- Never stage the local-only planning files (`.docx`, `Code_Review_Findings.md`,
  `Persistent_Characters_Plan.md`).
- Run `npm test`, `npm run build` and `npm run lint` before committing. The
  switch touches no app code, so these confirm nothing broke. Lint is already
  known to fail (backlog item 13); report it rather than fix it.
