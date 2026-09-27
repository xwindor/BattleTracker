# Opposite VR mode switches by the GM wobble a decker's Score instead of cancelling

Status: needs-triage
Found: 2026-09-17, during the player-initiative-prompt review
Severity: minor, GM-only

## What happens

If the GM switches a decker's VR mode from the GM screen while that player
still owes an unrolled delta roll — Hot Sim to Cold Sim, then straight back to
Hot Sim — the first change is settled GM-side (rolled and applied) before the
second is computed. The Score dips by a random amount and the player is then
prompted to roll to recover it.

Numbers stay internally consistent and everything is logged; nothing is
corrupted. Players cannot trigger it themselves — their own mode controls sit
behind the non-dismissible delta prompt until they roll.

## Why it was not fixed

A true fix computes what is owed from "mode now versus mode at last roll"
rather than settling each change eagerly. That is a larger change to Matrix
bookkeeping, which is paused. See `briefs/player-initiative-prompt-spec.md`,
fix round 5, for the guard that makes the current behaviour safe but wobbly.
