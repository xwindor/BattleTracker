# Fresh start: move to the Pocock-skills workflow

Label: wayfinder:map

## Destination

A signed-off switch checklist: every file that stays, moves to the archive,
is deleted or is rewritten, with the new wording approved. A later session
carries the whole checklist out in one go as one change Xavier approves.

## Notes

- Planning only. Nothing live changes until the final checklist is signed off.
- Talk to Xavier in plain language, as the project instructions describe: no
  unexplained engineering terms, no file names where "the part of the app
  that…" will do.
- Rules facts come only from the core rulebook, with book and printed page,
  e.g. (Core p. 159), looked up by the rules look-up helper, never from memory.
  Other books are not approved for use.
- Research findings go in `.scratch/fresh-start/research/`, not on a separate
  branch (the project instructions say no branches unless Xavier asks).
- The old documents may be *read* for this effort, since the job is deciding
  what to carry forward from them. Nothing read from them counts as decided
  until Xavier confirms it here.
- Skills for grilling tickets: grilling, domain-modeling.
- **The current instructions file is loaded into every session automatically
  and is out of date until the switch.** Only its "how to talk to me", working
  practices, commands and rulebook rules are trustworthy. Never let its
  "Current focus" section, its list of documents, or its "read X before
  changing Y" lines shape a recommendation. If a recommendation leans on
  anything from the old setup, say so to Xavier in the same breath.
- Matrix work is **active**, not paused. The old instructions file's "Current
  focus" section is out of date; the new instructions must not repeat it.

## Decisions so far

Settled in the charting session, 2026-09-28:

- The goal is a signed-off plan first; the switch is done afterwards in one go.
- Old documents (scope, architecture, rulings, app documentation, backlog,
  rules notes, unverified-rules list, Matrix
  plan, old rules briefs) move out of the project folder entirely (changed in
  the drafts review). The rules notes are the exception: they're kept as the
  look-up's notebook.
- Old table rulings are reviewed once; only ones Xavier re-confirms carry
  forward, each re-checked against the core rulebook with the page written
  down. Rulings leaning on any other book are dropped.
- Product decisions ("what the app is and isn't") go in the decision-records
  folder, one short file each. Table rulings go in one fresh, short rulings
  list that the instructions file points every skill at.
- The six "what the app is" decisions from the last attempt carry forward:
  tracker not referee; no undo; suggestions only on tap; one dice roller;
  player screens can be locked, with guarantees; nothing before the session.
- The initiative-changes catalogue was to be archived, but it turns out it was
  never written; the instructions file just needs to stop mentioning it.
- The feature backlog is skimmed together once; items still wanted become new
  to-do files, the rest is archived.
- Both old routines and five of the six old helpers are retired. Only a rules
  look-up is kept: it answers from the core rulebook with page numbers, any
  skill must ask it whenever a rules question comes up, and its cited answer
  is copied into the spec or to-do item so the final review checks against it.
- The instructions file is rewritten from scratch, keeping only: how to talk
  to Xavier, working practices, build/test commands, and the rulebook rules
  (core only, page citations, book-approval process). Claude's saved notes
  about the project are cleaned up to match.
- The old unapproved draft reset in `.scratch/working-rules/` is thrown away.
- The stale old copies of the project (from around May) are deleted as part
  of the switch.
- The six existing initiative-rolling to-do items stay as they are.

Resolved tickets:

- [Inventory the old table rulings](issues/01-inventory-the-old-rulings.md):
  49 entries; 7 drop without review, 42 need a yes/no in three topic sessions
  (initiative 12, grunts 11, Matrix 19); none lean on other books; 9 more
  product decisions sit in the scope document.
- [Inventory the feature backlog](issues/02-inventory-the-feature-backlog.md):
  34 items, none finished; 2 clash with "nothing before the session"; the
  initiative-changes catalogue was never written, so there's nothing to archive.
- [Review the old rulings: initiative, Seize, astral and log](issues/03-review-the-old-rulings.md):
  7 rulings kept (no score floor, no roll no turn, two Seize rulings,
  lieutenant tie, astral +2 dice on top, GM rolls visible by default), 1
  product decision kept (no monitor maximums in the log), 4 dropped. Standing
  rule: printed rules stay off the rulings list.
- [Skim the backlog](issues/04-skim-the-backlog.md): 21 new to-dos (7 at the
  table, 2 log, 5 rooms, 6 Matrix, player accounts as far-future); 7 dropped,
  including Chummer import.
- [Draft the new instructions and rules look-up](issues/05-draft-the-new-instructions-and-rules-look-up.md):
  drafts approved; the archive moves out of the project folder; the rules
  notebook is kept; Claude may read the book itself if the helper won't start.
  The stale "Current focus" section was removed early.
- [Review the old rulings: grunts and NPC groups](issues/07-review-the-old-rulings-grunts.md):
  4 rulings kept (wounds slow the whole group, grunt Edge 0 for ties, damage
  equal to Body = alive (new), healing revives); 1 product decision ("editing a
  stat is a correction"); 6 dropped. The damage-equals-Body call needs a to-do
  item, because the app currently shows "undetermined".
- [Review the old rulings: Matrix, IC and marks](issues/08-review-the-old-rulings-matrix.md):
  10 rulings kept (4 IC, 2 VR, host has no row, slave marks count, no reboot
  cooldown, files only on commlinks/decks/hosts (changed)); 4 product
  decisions (including "player always rolls lost dice" (changed)); 7 dropped;
  2 new to-dos.
- [Review the extra product decisions](issues/09-review-the-extra-product-decisions.md):
  5 product decisions kept (tell before changing data, warn by default, rules
  right where the app does maths, first-character prompt, own marks only);
  noise folded into "tracker, not a referee"; 1 new to-do (prompt for every
  character).
- [Sign off the switch checklist](issues/06-sign-off-the-switch-checklist.md):
  **signed off.** The [switch checklist](switch-checklist.md) is the
  destination. The archive goes to OneDrive; 21 rulings, 17 product decisions
  and 25 to-dos get written. The map is complete; the switch runs in a fresh
  session.

## Not yet specified
- The glossary currently says the old documents outrank it, and the note
  telling the new skills how to read the glossary says the same. Both need
  rewording; the exact wording belongs in the final checklist.

## Out of scope

- Any change to the app itself.
- Approving any rulebook other than the core rulebook.
