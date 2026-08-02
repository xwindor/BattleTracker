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

## Action Log — known minor issues (from the 2026-08-01 attribution review)

Raised during the `briefs/action-log-improvements.md` review and deliberately
not fixed there; each was assessed as pre-existing, an accepted trade-off, or
out of that change's scope. All in
`src/app/battle-tracker/battle-tracker.component.ts` unless noted.

- **N2 — astral/jack log entries are lost if the socket drops mid-session.**
  `appendSharedLog` sends and forgets: the entry only reaches the GM's own pane
  via the server echo, so a broadcast that fails in flight leaves no record
  anywhere. Affects `appendParticipantEventLog`'s session branch
  (`enableAstral`, `disableAstral`, `toggleAstralProjecting`, `gmJackIn`,
  `gmJackOut`) along with every other `appendSharedLog` caller. Accepted as
  consistent with the existing convention; a fix means local-first writes plus
  echo de-duplication by entry `id`.
- **N5 — `appendParticipantRollLog` double-logs.** The visible branch writes the
  line locally *and* sends it, and the server echo then mirrors it again for any
  actor other than `"GM"`. Predates the attribution change (not a regression),
  but it means participant-attributed roll lines can appear twice in the GM's
  Action Log.
- **N7 — a participant literally named "GM" suppresses its own log mirror.**
  The echo handler in `attachShareListeners` gates the local `LogHandler` mirror
  on `entry.actor !== "GM"`, a magic string. A combatant the GM names "GM"
  therefore silently loses every local mirror line. Pre-existing; wants a real
  flag on `SharedLogEntry` rather than an actor-name comparison.
- **N8 — re-registering with a blank name overwrites an established name.**
  `handleSessionCommand`'s `register_character` branch resolves an empty
  `characterName` to `REGISTERED_CHARACTER_FALLBACK_NAME` and
  `upsertPlayerParticipant` writes it over the existing row, so a player whose
  client reloads with an empty name field renames their own established
  character to "Unnamed Character". Minor UX rough edge; a fix is to keep the
  current name when the incoming one is empty and the participant already
  exists.
