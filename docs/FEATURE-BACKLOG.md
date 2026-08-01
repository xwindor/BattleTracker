# Feature Backlog

Running list of future features. Newest at the top.

## Surprise Test and spell Drain logging

Marked explicitly out of scope for the combat-log-readability feature
(`briefs/combat-log-readability.md`, ACs 22–23): neither the Surprise Test
mechanic (p. 192–193 — glitch/critical glitch effects, the -10 Initiative
Score modifier) nor spell Drain (p. 282 — Physical vs. Stun based on casting
hits vs. Magic rating) exists anywhere in the app. Building log formatting
for either means building the underlying mechanic first, via its own rules
brief through the `/feature` pipeline — not a log-formatting change.

## GM roll-visibility toggle — close remaining leak paths

The GM roll-visibility toggle added by combat-log-readability
(`briefs/combat-log-readability.md`, "Known limitations") ships as a
best-effort convenience, not a guarantee. Known open gaps as of 2026-07-31:
the periodic participant state-sync broadcast (`getSharedParticipants`)
sends a hidden roll's underlying numbers to players regardless of the
toggle; hidden log entries are only preserved across a deliberate "Close
Room," not an ordinary disconnect (server restart, dropped connection); and
`logRolledTotalClamp` can leak a hidden roll's numbers via the one-shot
"hide next roll" path specifically. A real fix needs a single choke point
that every GM-originated roll (and its consequences — clamps, state-sync)
routes through, rather than patching each leak path individually. See
`RULINGS.md`, "GM/NPC dice roll visibility defaults."

## Initiative Score mutation sources

Implement the full set of things that change Initiative Score mid-turn:
interrupt actions, surprise, electricity, called shots, Adrenaline Boost,
Increase Reflexes, wired reflexes, drugs, Edge Blitz, Seize the Initiative,
etc.

Reference: page-cited catalogue from the initiative formula brief — belongs
in `docs/INITIATIVE-MUTATION-SOURCES.md`; not yet produced/attached.

## Group initiative — 
New 👥 button beside + opens an "Add NPC Group" form (name, count, REA/INT/dice, health). It creates linked rows ("Ganger 1–4") sharing one groupId. Rolling any member rolls once and applies to all, so they act back-to-back; wounds don't shift group initiative (new GroupParticipant class adds the wound modifier back); each row keeps its own condition monitor. "Force Roll Outstanding" also rolls each group once.

## Hot-sim initiative — 

Two fixes: if the decker jacks in mid-combat without having rolled yet (your likely session case — ties into the join bug), the GM now auto-sends them a targeted roll prompt. If they had rolled, the owed +Nd6 now shows in an "Outstanding Rolls" card with a "Roll for player" fallback button, and the log notes it's waiting. Owed-but-never-rolled dice are also no longer subtracted back out on jack-out (a real score-drift bug).

## Mid-combat joins — 

Registering or claiming a character mid-combat now immediately prompts that player to roll, and the Outstanding Rolls card (previously pre-combat only) stays available during combat. Prompts are now targeted by participant, and a guard prevents a stale prompt from overwriting an existing score — rolls land in the shared log as before.

## GM rolls as NPCs — 

The GM Dice Roller header has a "Roll as" selector (GM, any GM-run combatant, or a free-text label); rolls broadcast and log under that name, badged NPC. Player characters — claimed or merely marked Claimable — are excluded from the picker.

Dice cap — Raised from 20 to 40.
