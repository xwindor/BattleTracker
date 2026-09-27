# Removing a decker's deck after an unrolled VR gain wrecks their Initiative Score

Status: ready-for-agent
Found: 2026-09-17, during the player-initiative-prompt review
Severity: serious, and pre-existing — it predates the initiative pop-up work

## What happens

A decker has already rolled this Combat Turn (say Score 14). They jack into
Hot Sim mid-fight. Before they roll the dice they gained, the GM removes their
deck. Their Score drops to 2. The Action Log line reads exactly like a
legitimate mid-turn dice loss, so nothing tips the GM off.

Traced by a reviewer with a temporary test against the live code.

## Cause

On a player-driven jack-in, a *gain* is written into the dice pool immediately
(`setDicesWithoutRoll`) while the Score half waits for the player's roll.
`demoteToParticipant` then re-rolls "lost" dice from that inflated pool through
`changeParticipantDiceCount`, subtracting dice that were never credited.
`demoteFromAstralParticipant` has the same shape.

## How to approach it

Needs its own run through **`/feature`**, not `/change`: fixing it means
deciding how Initiative is recalculated when a deferred gain is abandoned,
which is Core p. 160 territory. Do not patch it inside an unrelated change.
