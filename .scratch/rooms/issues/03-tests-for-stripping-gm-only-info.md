# Automatic tests for stripping GM-only info before it reaches players

Status: needs-triage
From: the backlog skim, 2026-09-28

## What's wanted

The part of the server that removes GM-only information before sending
anything to players has no automatic tests at all. Wanted: tests that fail if
GM-only information ever reaches a player's screen.
