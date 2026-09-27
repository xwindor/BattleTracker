# Players have no defence or Seize the Initiative controls

Status: needs-triage
Raised: Xavier, hands-on QA 2026-09-26
Rules-dependent: yes — run through `/feature`, not `/change`

## What's missing

A player's own screen offers Act, Delay and the Interrupt list, but nothing
for defending, and no way to spend Edge to Seize the Initiative. Seize is a
GM-screen button only.

## Why it matters more now

Ruling R2 (`briefs/seize-initiative-spec.md`, `RULINGS.md` 2026-09-21) lets a
player seize at any point after they have rolled, including outside their own
Action Phase. That makes a player-side control natural — the book puts the
Edge decision with the player (Core p. 56, Core p. 160).

Xavier suggested the roll pop-up as its home, alongside **Blitz** — spending
Edge to roll the maximum 5D6 (Core p. 159) — which is unimplemented anywhere
in the app today.

## Open questions for the rules brief

- Is a player-side Seize control within `SCOPE.md`'s boundary, given the app
  would then be spending a player's Edge on their say-so?
- What does Blitz require that the tracker does not currently model?
- Does "defence options" mean the Interrupt Actions already listed, or
  something the app does not model at all (the ordinary Defense Test)?
