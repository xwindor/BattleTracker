# Table Rulings

Rulings for cases the SR5E rulebook leaves open. Check here before deciding
an undefined case ad hoc — append new decisions with today's date and the
reasoning, don't re-decide an existing entry.

## 2026-07-31 — No floor on Initiative Score

**Ruling:** Initiative Score has no lower bound. It is allowed to go
arbitrarily negative and is never clamped at 0.

**Why:** The core rulebook shows negative Initiative Scores in its own
worked examples (p. 160: Halloweener ends a Combat Turn at -4; p. 191:
Blackfeather ends up at -9 and is refused a Parry because of it) but never
states a general floor rule either way. Negative values are load-bearing for
the Interrupt Action affordability check (p. 167: an Interrupt Action is
refused if the character doesn't have enough Initiative Score left to pay
for it) — clamping at 0 would make that check meaningless below zero. This
was adopted as the brief's recommended default for the "Running Initiative
Score Across Passes" feature (`briefs/running-initiative-score.md`, Open
Ruling Question 7) and is load-bearing for that feature's regression tests
(S1 expects -4, S3 expects -9).

**How to apply:** Any code path that reduces a participant's Initiative
Score (pass decay, Interrupt Action costs, wound modifiers, spell/attack
effects) should never clamp the result at 0. Code that GATES on Initiative
Score (e.g. "can this participant act," "can this participant afford this
Interrupt Action") should compare against the actual signed value, not
against `max(0, score)`.

## 2026-07-31 — Bonus Initiative Dice carry additively into astral space

**Ruling:** When a character astrally projects, their Astral Initiative Dice
count is their current Physical Initiative Dice count **plus one** (not an
absolute reset to a flat 2D6). Returning from astral space subtracts back
off only the die that was actually gained on the way out.

**Why:** The core rulebook's Initiative Attribute Chart (printed p. 159)
gives Astral as "2D6 Base Initiative Dice" against 1D6 Physical, and the
worked example on p. 160 describes a magician who "gains the die" when
projecting — implying a delta on top of whatever she already has, not a
fresh absolute count. The book's example uses a magician with no other
Initiative Dice bonuses, so it doesn't say one way or the other whether an
existing bonus die (e.g. from Increase Reflexes, wired reflexes, or a drug)
should be preserved or overwritten when projecting. Overwriting to a flat 2
would silently delete a bonus the character is still actively paying
Drain/sustaining for, which reads as clearly wrong; treating the mode change
as a relative +1/-1 delta preserves any such bonus and matches the "gains
the die" wording literally. Treated as the better default rather than a
directly-cited rule, since RAW is silent on the interaction specifically.

**How to apply:** Any future feature touching astral-projection Initiative
Dice (or a similar mode-switch mechanic) should apply the mode's dice-count
change as a delta relative to the character's current dice count, not as an
absolute overwrite, unless a future ruling here says otherwise. Note: the
Matrix VR-mode dice counts (AR/Cold-Sim/Hot-Sim) are still implemented as
absolute per-mode counts, not relative deltas — this ruling does not
retroactively apply to Matrix, which is a separate, currently-paused module
(see CLAUDE.md "Current focus").
