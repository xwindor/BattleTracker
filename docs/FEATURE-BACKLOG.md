# Feature Backlog

Running list of future features. Newest at the top.

## HIGH PRIORITY — Participant-level damage is not on the session-sync wire at all

Found 2026-08-03 while implementing the "Add Grunt" / merge addendum to
`briefs/npc-group-initiative.md`. Confirmed by direct code inspection, not
just the implementer's report. **Xavier wants this fixed next.**

**Scope update, 2026-08-07 (live-table confirmation):** Xavier tested a GM
reconnect against the current build and reported damage was reset **on all
participants and NPCs**, not just standalone/detached grunts as the original
code-inspection finding suggested for the row-member snapshot path. This may
mean the row-member restore path (`rowMembers` snapshot, which does carry
damage in `SharedParticipantState`) is *also* broken, not just the
undocumented standalone-grunt gap — or it may mean the original "row members
restore correctly" read of the code was wrong, or that the live-tested build
was stale. **Re-verify the row-member restore path specifically as step 1 of
the fix**, rather than assuming only the previously-identified gap (no
`physicalDamage`/`stunDamage` fields on `SharedParticipantState` for
non-row participants) needs closing.

### The bug, precisely

`SharedParticipantState` (`src/app/services/session-sync.service.ts`) has
**no `physicalDamage` / `stunDamage` fields at all** — grep confirms zero
matches for either name in that file. `getSharedParticipants()`
(`battle-tracker.component.ts:1649`) never puts a participant's damage on the
wire for any participant type. This has apparently been true since
session-sync was first built (see the round-2/round-4 restore-gap comments
already in `ARCHITECTURE.md` and `buildRestoreWarning()` — they describe this
as accepted, not as a bug — but nobody had previously connected it to the
"reconnect loses damage" symptom because rows carry their own member-level
damage via a *separate* mechanism, `rowMembers[].damage` on
`SharedParticipantState.rowMembers`, which **was** added for the
NPC-group-initiative D4 fix and **does** work — that one is not this bug).

Two compounding symptoms follow from the missing field:

1. **Damage is silently dropped on every GM reconnect**, for every
   participant type except linked NPC rows (which have their own separate
   fix). A PC, a plain NPC, a decker, an astral, a standalone/detached grunt
   (`DetachedGruntParticipant`, new as of the 2026-08-03 addendum) — all of
   them come back at 0/0 Physical and Stun regardless of what they'd actually
   taken. `buildRestoreWarning()` already says this out loud ("damage and
   condition monitors... not included"), so the GM is warned, but has to
   re-key every damaged combatant's boxes by hand from table notes.
2. **Anyone fully out of action vanishes from the broadcast entirely**, not
   just from display. `getSharedParticipants()` opens with
   `.filter(p => !p.ooc)` (`battle-tracker.component.ts:1666`) — an OOC
   participant is dropped from the array before any of the rest of the
   mapping runs. Combined with (1): since damage never reaches the wire,
   `ooc` is derived purely from the *reconstructed* participant's fresh 0/0
   Condition Monitor after a restore, so a genuinely-downed combatant doesn't
   even get a chance to be filtered *as downed* — instead they come back
   looking undamaged and active, then have to be manually marked out again.
   Net effect: reconnecting mid-fight is lossy in two different, compounding
   ways depending on whether the combatant survives the round-trip as
   "damaged-but-shown-healthy" or "silently missing."

### Why this matters more now

The 2026-08-03 addendum (`briefs/npc-group-initiative.md`, Decision 9) added
"Add Grunt" — a one-tap way to create a standalone `DetachedGruntParticipant`
that lives outside a row and takes damage directly on its own Condition
Monitor, same as any ordinary participant. Before this addendum, damaging an
individual NPC outside a row mid-fight was less common (grunts mostly lived
inside rows, where D4 already covers member damage); now it's a first-class,
one-tap workflow, so this gap is hit far more easily at the table.

### What a real fix needs to touch

- **Wire schema**: add `physicalDamage` / `stunDamage` (or an equivalent
  combined-damage field for grunt-shaped participants, to stay consistent
  with how `DetachedGruntParticipant`/row members already represent damage as
  one combined pool rather than two independent tracks) to
  `SharedParticipantState`.
- **Broadcast** (`getSharedParticipants()`): stop filtering OOC participants
  out of the payload outright — an OOC participant needs to still round-trip
  (as OOC, with their final damage/type recorded) rather than disappear.
  Decide deliberately what "restore an OOC participant" should mean for the
  initiative order (do they reappear in the order marked out, or off to one
  side?) rather than let the current filter's absence-as-behavior stand.
- **Restore path** (`restoreFromSharedState` /
  `buildRestoredParticipant`): apply the restored damage to the reconstructed
  participant, consistently across every participant type — plain
  `Participant`, `MatrixParticipant`, `AstralParticipant`, and
  `DetachedGruntParticipant` (which needs its combined-damage setter, not two
  independent ones — see `onGruntCombinedDamageChanged` in
  `battle-tracker.component.ts` for the existing UI-side pattern of writing a
  combined value back onto `physicalDamage`/`stunDamage`).
- **`buildRestoreWarning()`**: once fixed, its wording needs to change from
  "damage and condition monitors... not included" to reflect whatever the new
  reality is — don't let the warning text drift out of sync with the fix the
  way it already has for rows (it currently reads as if rows are the only
  exception, when after this fix nothing should be an exception).
- **Interaction with `DetachedGruntParticipant` restoration**: this type
  *itself* isn't reconstructed on rejoin yet either (a separate, already-
  documented gap in `ARCHITECTURE.md` — it comes back as a plain
  `Participant`, losing its single-track shape and `gruntBody`). That gap and
  this one overlap for a standalone grunt specifically; fixing damage
  transport without also fixing type reconstruction would still leave a
  detached/standalone grunt coming back PC-shaped. Worth scoping both
  together rather than fixing damage transport first and hitting the same
  combatant type broken a different way immediately after.
- **Size budget**: `session:update-state` caps payloads at 64 KB
  (`server.js:262`) — comment there says realistic play stays well under
  10 KB even with 50+ participants and Matrix state; two more numeric fields
  per participant is negligible, not a real constraint, but worth a passing
  check once row members' damage is already on the wire too.

### Recommended approach

Treat as a `/feature`-pipeline-adjacent fix (it's not a new SR5E rule, but it
touches the same trust-sensitive plumbing D4 touched — session-sync schema
and restore correctness) — worth a `sr5-change-scoper` pass to nail down the
OOC-restoration UX question above before implementation, then
`sr5-implementer`, then a validation pass focused specifically on the
restore round-trip for every participant type (plain, Matrix, Astral,
detached/standalone grunt, and — as a regression check — linked NPC row,
which must keep working exactly as D4 left it).

## Player identity / accounts and cross-room saved characters

Considered and deliberately dropped from the "durable rooms" change
(`briefs/persistent-rooms.md`) after user clarification on 2026-08-01: the
original request was for players to save characters under a persistent
identity (cookie/login/code) and reuse them across rooms. The user redirected
to a narrower ask — persist room/session state itself, keep the existing
per-room claim system (`server.js:275-310`) for ownership. If cross-room
persistent player identity is wanted later, the original spec's Open
Decisions 1 (identity mechanism: localStorage token vs. cookie vs. code vs.
real login) and 3 (room-scoped vs. global saved characters) are still the
right questions to open with.

## Chummer (.chum5) character import

Upload a Chummer5a `.chum5` export and auto-populate a character's stats.
Requested alongside the player-identity idea above (2026-08-01) but is
independently rules-dependent: deriving condition-monitor boxes, Initiative
Dice, `painTolerance`, etc. from raw Chummer attributes and augmentation
entries needs a page-cited rules brief via the `/feature` pipeline, not a
plain `/change`. Also has no useful destination until there's a defined
saved-character document to import into. Needs its own rules brief plus a
plan for untrusted-XML parsing (no XML parser currently in `package.json`;
`src/index.html` ships a strict CSP).

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

## Durable rooms — what a restore still cannot bring back (from `briefs/persistent-rooms.md`, Open Decision 4)

Persistence made "rejoin the room" the normal resume path, so the losses in
`restoreFromSharedState()` matter more than they used to. That change fixed
option **(b)** only — participant *subclasses* (`MatrixParticipant` /
`AstralParticipant` and their already-broadcast fields) are now reconstructed
from the `isMatrix`/`isAstral` flags. The GM is warned at restore time about the
rest. Options (c) and (d) were deliberately deferred:

- **(c) Extend the broadcast** with `physicalHealth`, `stunHealth`,
  `overflowHealth`, `physicalDamage`, `stunDamage`, `painTolerance`,
  `hasPainEditor`, and stop `getSharedParticipants()` filtering OOC participants
  out. Fixes damage/health/OOC loss outright, but widens the *player-visible*
  payload — and this file already records that `getSharedParticipants` leaks
  state to players regardless of the GM's roll-visibility toggle, so this makes
  the known leak worse.
- **(d) A separate GM-only snapshot** persisted alongside the player-facing
  state, carrying everything needed to rehydrate exactly. Correct and leak-free,
  but it is a second serialisation format for participants — the same drift
  hazard ARCHITECTURE §6 describes for `PARTICIPANT_BASE_BACKING_FIELDS`. This
  is the right shape for the full fix, as its own change.

Also still lost on a restore, and worth folding into whichever of the above is
built: `actionHistory` (so committed interrupt costs such as Full Defense
vanish), the `Delaying` status, `NpcRowParticipant` rows and their members
(ARCHITECTURE §6, "Session-sync limit"), and `ICParticipant` (no wire flag
distinguishes it from a plain decker, so it restores as a `MatrixParticipant`).
`lastKnownDamage` is reseeded from restored *defaults*, so the first
post-restore damage edit logs a wrong delta.

## Durable rooms — review defects D4-D7 (deferred, `briefs/persistent-rooms.md`)

Diagnosed in the Stage 3 final review of the durable-rooms change on 2026-08-05.
The brief promoted D1-D3 to acceptance criteria (AC 15-17, now implemented) and
left these four as backlog items:

- **D4 — narrow End Room race.** Between the GM's `gm:end-session` ack and the
  client teardown, a `session:update-state` already in flight can call
  `getOrCreateSession` and resurrect the room in the `sessions` Map (without a
  file, and now with a `createdAt`, so the contentless reaper eventually drops it
  if it stays empty — but a late log entry would re-persist it). Needs the server
  to mark a room as ended and refuse re-creation for that code, or the client to
  stop broadcasting before it emits the end.
- **D5 — stale ARCHITECTURE.md write-site count and missing two-GM-tabs caveat.**
  §7 says "three server-side write sites"; that must be re-verified whenever a
  handler is added, and there is no compiler enforcement. Separately, §7 does not
  say what happens when two GM tabs hold the same room code: both consider
  themselves the source of truth and will push over each other.
- **D6 — the disconnect banner is conflated with "GM not connected".** The
  player view's transport-drop warning and the server's `gmConnected` presence
  signal end up saying similar things for different causes, so a player cannot
  tell "my connection dropped" from "the GM has left".
- **D7 — stale release notice after an undo.** `findReleasedOwnCharacters()`
  announces "the GM released your character"; if the GM immediately undoes the
  release, the notice stays on the player's screen with nothing to act on.
