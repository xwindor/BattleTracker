# Interrupt options on the player view

Status: needs-info
Raised: Xavier, 2026-09-27 — "adding interrupt options on player view,
currently only the GM can perform them"

## What already exists

The player view already renders an Interrupt list for a character the player
controls (`player-view.component.html`, the `Interrupts` disclosure beside Act
and Delay), and tapping one sends an `interrupt` command the GM side applies.
So the control is present, not missing.

## Why it may look like it is missing

The buttons are disabled unless **all four** of these hold, from
`BattleTrackerComponent.canParticipantInterrupt()`, whose result is sent to the
player as `canInterrupt`:

1. combat has actually started — added 2026-09-21 at Xavier's request, so
   nobody spends Initiative during Initiative Prep;
2. the participant has rolled this Combat Turn — the 2026-09-19 ruling
   (`RULINGS.md`), so an unrolled character cannot spend a Score they do not
   have;
3. their current Initiative Score is at least 1 — Core p. 167 requires enough
   Score left to pay the action's price;
4. they are not out of combat, and not an NPC row.

Conditions 1 and 2 are both new this month. The most likely explanation for
what Xavier saw is greyed-out buttons under one of them — most easily hit by
testing before pressing Begin Combat Turn, or before that character rolled.

## What to establish before building anything

- Which was it: buttons absent, or present but greyed out? If greyed out,
  which of the four conditions was false at the time?
- If the answer is "they were correctly greyed out", this ticket is really a
  **visibility** problem: the player is given no reason why an interrupt is
  unavailable. A short explanation next to the disabled list would close it,
  and that is a `/change`, not a `/feature`.
- If Xavier means something the app genuinely does not model — the ordinary
  Defense Test, as opposed to the Interrupt Actions already listed — that is
  rules work and belongs with issue `03`, which covers the same ground for
  defence and Seize.

## Related

- `03-players-have-no-defence-or-seize-controls.md` — overlapping request; do
  not build these two separately without deciding whether they are one job.
- `RULINGS.md` 2026-09-19 and 2026-09-21 for the gating rulings.
