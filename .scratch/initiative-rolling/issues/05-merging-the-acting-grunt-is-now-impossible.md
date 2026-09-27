# Merging the currently-acting grunt into a row is now impossible

Status: needs-triage
Found: 2026-09-19, during the mid-turn-joiner validation
Severity: minor — a feature that quietly became unreachable

## What happens

Merging a standalone grunt into a row refuses any grunt that has already
rolled. The table ruling of 2026-09-19 (`RULINGS.md`) means a grunt that has
*not* rolled is never given a turn. The two conditions are now mutually
exclusive, so the currently-acting grunt can never be merged.

## Evidence

`src/scenarios/combat-boundary-logging.spec.ts` had to stop using the real
engine to set up its acting grunt, placing it by hand instead, because the
engine can no longer produce that state. The log-ordering behaviour that test
protects is therefore unreachable in play.

## Decision needed

Either accept that merging an acting grunt is no longer a thing the app
supports and simplify the merge refusal accordingly, or decide that an
unrolled grunt may act after all — which would reopen the ruling.
