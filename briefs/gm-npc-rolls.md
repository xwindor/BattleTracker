# Brief: GM Rolls on Behalf of NPCs (attributed rolls)

## Scope decision — read this first

The following are **out of scope by product decision, not oversight**. Do not
re-add them to this feature, and do not raise them as open questions:

- **All grunt-specific mechanics**: Group Edge pool, Professional Rating,
  lieutenant tie-breaks, single combined Condition Monitor, "Mowing Them Down".
  This feature does **not** model any grunt-vs-individual-NPC distinction. An
  NPC is just a named non-player combatant.
- **Hidden / secret / reveal roll modes.** A separate feature already covers
  this (see the resolved interaction note below). Do not build a second one.
- **Limits and Edge, entirely.** Scoped precisely: no limit, threshold,
  opposed-test or Edge concept exists in the **dice-pool roll resolution path**
  (`classifyRoll` in `src/app/shared/roll-utils.ts`), which is the code this
  feature reuses. There is nothing to reuse there, and this feature must not
  extend it. Every roll is: pool → hits → ones → glitch/critical glitch.
  Nothing else.

  Note the narrow scope: Edge *does* exist elsewhere in this codebase —
  `Participant.edge`, the Edge-weighted initiative ordering, a GM-editable Edge
  rating field, and Edge tie-breaking. None of that touches roll resolution,
  and this feature neither reads nor extends it.

All citations are to the **SR5 core rulebook**, printed page numbers.

## Request

Let the GM resolve an ordinary dice-pool test on behalf of a named non-player
combatant using the app's existing roll resolution (`classifyRoll` in
`roll-utils.ts`), and emit a log entry attributed to that NPC by name so
players can tell who rolled what.

## Governing rules

The rules content here is exactly the standard test resolution the app already
implements for player rolls. Nothing new is being added to the math.

- The dice you roll are your **dice pool**; every die showing 5 or 6 is a
  **hit** (p. 44).
- **Glitch**: if more than half the dice you rolled show a 1, it is a glitch.
  A glitch does not cancel success — a test can be both a hit-scoring success
  and a glitch simultaneously (p. 45).
- **Critical glitch**: a glitch on a roll that produced no hits at all (p. 45).
- **The gamemaster "governs the actions of the non-player characters, and
  determines the results of tests"** (p. 44). This is the rules basis for the
  feature existing at all: NPC dice are the GM's to roll.

No other rules content applies. This app's roll resolution does not model
thresholds, limits, opposed tests, or Edge, and this feature does not change
that.

## Attribution in the log — UX requirement, not a rules requirement

SR5 says nothing about combat-log presentation; this section is product design,
not RAW.

- Every NPC roll produces a log entry labelled with that NPC's name/label
  (e.g. "Ganger Bravo"), visually and structurally distinguishable from a
  player character's own roll entry.
- The name may come from selecting an existing combatant in the tracker, or
  from the GM typing a free-text label for an NPC not in the initiative order.
- Attribution is per-NPC, not per-side: two NPCs rolling in the same pass must
  produce two distinguishable entries.
- Player-visible log content for an NPC roll carries the same fields a normal
  roll carries today (pool, hits, glitch status), because the resolution is
  identical — nothing NPC-specific is computed.
- "Always visible" (as used elsewhere in this brief) means visible by default,
  like any other roll — see the resolved hidden-roll interaction note below
  for the one case where it is not shown to players.

## UI approach (agreed with Xavier — implementer guidance, not a rules matter)

Extend the existing dice-roller UI rather than building a separate NPC-rolling
panel:

- In `dice-roller.component`, add an optional "Roll as" field next to the
  existing dice-count input, visible only to the GM. It offers the tracker's
  current **GM-controlled** combatants plus free-text entry, per the open
  question below. Player-claimed characters are excluded from the picker: an
  NPC is by definition a non-player combatant (p. 44), so offering a claimed
  character could only produce a roll impersonating that player, badged NPC.
- When "Roll as" is set, the roll is logged/broadcast attributed to that NPC's
  name instead of the GM's own name.
- Reuse the existing remote-roll display and broadcast plumbing (the "Other
  Players" section keyed on `roll.roller`) — an NPC roll is just a roll whose
  `roller` is the NPC's name rather than the GM's player name. No new log or
  transport mechanism is needed.

## Edge cases the book defines

1. Glitch with hits: both stand; the success is not cancelled (p. 45).
2. Critical glitch requires zero hits *and* a glitch (p. 45).
3. An empty pool never glitches (already handled by `isGlitch` in
   `roll-utils.ts`; no NPC-specific change needed).

## Open questions

None, rules or product. The math is the app's existing `classifyRoll`
resolution, fully specified on pp. 44–45 and already implemented with no
limit/Edge concept *in that path* to reconcile. The only implementer decision is whether NPC
names are select-only or also free-text:

1. **Free-text NPC names vs. selection-only.** Recommended default: allow both,
   because the GM frequently rolls for a critter or bystander that is not in
   the initiative order. Not a rules question. Resolved: allow both (see UI
   approach above).

## Resolved: interaction with the hidden-roll feature (2026-07-31, Xavier)

The GM-only roll-visibility one-shot (`consumeGmRollVisibility` /
`appendGmOnlyLog` in `battle-tracker.component.ts`, from the separate
combat-log-readability feature) applies to NPC rolls exactly as it applies to
the GM's own rolls: if "hide next roll" is armed when the GM rolls as an NPC,
that roll consumes the one-shot and is GM-only, the same as any other GM roll.
NPC rolls do **not** unconditionally bypass it.

## Acceptance criteria

1. The GM can initiate a roll for a non-player combatant identified by
   name/label, without that combatant needing to be a player character.
2. The roll is resolved by the app's **existing** `classifyRoll` function —
   the same code path as a player roll. No duplicate rules math is
   introduced, and no limit or Edge concept is introduced.
3. Hits are counted as dice showing 5 or 6 (p. 44).
4. A glitch is flagged when more than half the dice rolled show 1 (p. 45).
5. A critical glitch is flagged when a glitch occurs and hits are zero (p. 45).
6. A glitch with one or more hits is reported as a success **and** a glitch;
   hits are not zeroed by the glitch (p. 45).
7. The resulting log entry names the specific NPC that rolled.
8. The log entry is distinguishable from a player character's own roll entry.
9. Two different NPCs rolling produce two separately-attributed entries.
10. The NPC log entry exposes the same fields a player roll entry exposes
    today (pool, hits, glitch state).
11. Players connected to the session see NPC roll entries in their log with
    the NPC attribution intact, unless the roll was made under an armed
    "hide next roll" one-shot, per the resolved interaction note above.
12. No grunt-specific mechanic (Group Edge, Professional Rating, shared
    Condition Monitor) appears anywhere in the implementation.
13. No new hidden/secret roll mode is introduced by this feature; NPC rolls
    integrate with the existing hide-next-roll one-shot rather than adding a
    second mechanism.
14. No limit or Edge concept is introduced anywhere in the implementation.

## Gameplay scenarios to survive

1. **Ordinary NPC attack.** GM selects "Ganger Bravo", rolls 9 dice. Result:
   4 hits, one 1. Log reads as Ganger Bravo, 9 dice, 4 hits, no glitch.
2. **Glitch with success.** "Troll Bouncer" rolls 8 dice: 3 hits and 5 ones.
   More than half the pool shows 1, so the entry is flagged GLITCH while still
   reporting 3 hits — the success stands (p. 45). GM narrates the consequence.
3. **Critical glitch.** "Spirit of Man" rolls 6 dice: 4 ones, zero 5s or 6s.
   Entry is flagged CRITICAL GLITCH (p. 45), attributed to the spirit by name.
4. **Two NPCs in one pass.** In the same Initiative Pass the GM rolls for
   "Ganger Alpha" and then "Ganger Bravo". Players see two separate,
   correctly-named entries in order; neither is merged, and neither is
   attributed to a player character.
5. **Ad-hoc NPC not in the initiative order.** GM types "Bartender" as a
   free-text label and rolls a roll. The entry is attributed to "Bartender"
   even though no combatant of that name exists in the tracker.
6. **Hidden NPC roll.** GM arms "hide next roll," then rolls as "Ganger Bravo."
   The roll is logged GM-only (per the existing hide-next-roll one-shot) and
   is not broadcast to players, exactly as an equivalent GM roll for their own
   character would behave.
