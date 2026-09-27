# A GM-driven VR mode change leaves the player's own mode buttons stale

Status: ready-for-agent
Raised: Xavier, hands-on QA 2026-09-26 ("the mode status did not correlate at
all between GM and player view")
Severity: cosmetic, but confusing mid-fight

## What happens

After the GM changes a decker's VR mode from the GM screen, the player's own
view shows the new mode in its "Mode:" label but their "Switch to:" button row
still shows whatever they last picked themselves. The Switch Mode button's
enabled state can read wrong for the same reason.

## Exactly what disagrees

The player view keeps two separate pieces of state:

- `primaryCharacter.vrMode`, taken from the GM's broadcast — always correct,
  and what the "Mode:" label reads.
- a local `vrMode` field on the component, set only when the player taps one
  of their own three mode buttons — what the "Switch to:" row reads.

Nothing updates the local field when the change comes from the GM.

## Not to be confused with

The *dice* half of this was a separate, real bug and is fixed (commit
`c6f0c1a`): the tracker could forget a decker's true physical dice count while
an earlier mode change was still waiting on the player's roll, so a later jack
out rolled the wrong number of lost dice. That fix is why a GM-driven mode
change now resolves its dice correctly. This entry is the status display only.
