# Feature Backlog

Running list of future features. Newest at the top.

## Admin session manager — delete rooms from outside the GM view

Requested by Xavier on 2026-08-18, right before the first live deployment of
durable rooms.

Rooms are now retained **indefinitely** (Open Decision 5 as amended
2026-08-05), and the only way to remove one is a GM tapping **End Room** from
inside a tab that is joined to it. There is no way to see what rooms exist, and
no way to delete a room whose code has been lost, whose GM tab is gone, or that
was created by accident. The only current backstops are automatic and blunt:
the contentless-room reaper (drops rooms that never got content), and
capacity eviction at `TOTAL_ROOM_CAP`, which silently deletes the
least-recently-active *unoccupied* room to make space. Neither is something an
operator can aim.

Wanted: an admin view listing live and persisted rooms — code, last activity,
whether anyone is connected, roughly how much is in it — with the ability to
delete one. Enough to clean up "in case things get carried away".

Design notes for whoever picks this up:

- **Authentication is the hard part, and it is a genuinely new mechanism.**
  Everything in durable rooms deliberately avoided introducing identity: the
  spec's own framing is "reuse the existing `ownerName`/`claimable` claim
  system, no new identity mechanism". An admin surface breaks that, because
  "may delete any room" cannot be derived from holding a room code. The
  cheapest honest option is an operator-only secret from the environment
  (`SR5E_ADMIN_TOKEN`), checked server-side, with the surface refusing to
  function at all when it is unset — never a default value. Note the
  deployment already needs `SR5E_TRUST_PROXY=1` set via
  `ecosystem.config.js`, so there is an established place to put it.
- **Deletion must reuse `gm:end-session`'s teardown, not reimplement it.**
  That path evacuates every attached socket (clearing `socket.data.room` /
  `socket.data.role` so no lingering tab can resurrect the room), releases
  player claims, deletes the in-memory session and the persisted file, and is
  the reason End Room is not resurrectable. A second deletion path that
  forgets any of that reopens defects this change spent several rounds
  closing.
- **Prefer a tombstone over a bare delete.** `store.evict()` already writes one
  with a human-readable reason, which is what turns a vanished room from
  "you typed the code wrong" into "removed on <date> because <reason>".
  An admin deletion should say so too.
- **Listing is a read of `sessions` plus the store's room files.** Beware that
  the two are not identical: a room can be persisted but not loaded, and the
  contentless reaper drops rooms from memory that were never on disk.
- Any new socket event must go through `authorizeRoomPacket` (see
  ARCHITECTURE.md §7) or be deliberately and documentedly exempt; the
  default-deny is by payload shape, so an admin event carrying a `room` field
  is room-scoped unless it opts out.

## Durable rooms — review round 8 backlog items (`briefs/persistent-rooms.md`)

Round 8 was scoped narrowly to four items (`handleSessionError`'s missing
early return, `loadShelvedOwnership` restoring an owner onto a non-claimable
participant, hidden log entries being a per-room fact, and two ARCHITECTURE.md
overclaims). Everything else the round-7 review found was explicitly
out-of-scope for round 8 and logged here instead, per the round-8 brief's own
instruction not to expand scope.

- **`SessionSyncService.currentRoom` is the real push target and is
  unaudited.** `broadcastState` emits `{room: this.currentRoom}`
  (`session-sync.service.ts:488-490`), not `shareRoomCode`. A narrow race
  exists: a tab live for both room A and room B presses Join for room A,
  the `confirmAbandonPreviousRoom` dialog is open, and a transport blip fires
  `handleSessionError` → `handleSessionReconnected()` → `joinAsGm('B')` in
  flight; the GM confirms the dialog → `joinAsGm('A')` also goes in flight;
  whichever ack lands last sets `currentRoom`. If B's lands last, A's
  ownership is pushed to B and the server authorizes it (nothing checks that
  the room a push names matches the room the socket most recently
  authenticated to, beyond `authorizeRoomPacket`'s existing `room-mismatch`
  check, which does not catch this case since the socket *did* just
  reauthenticate, just to the wrong room). Suggested cheap guard: in
  `syncSharedState`, refuse or log when
  `sessionSync.currentRoom && sessionSync.currentRoom !== this.activeOwnershipRoom`.
- **`handleSessionReconnected` has no in-flight/re-entrancy guard.** Durable-
  rooms review round 7's fix (D-C) widened the set of events that trigger it
  (`role-required`, `room-mismatch`, and the transport `reconnect` event
  itself), but nothing stops two of those firing close together from running
  two overlapping `joinAsGm`/push cycles at once. Self-limiting in practice -
  each call re-authenticates to the same `shareRoomCode` and pushes the same
  local state, so the worst case is a duplicate, idempotent push - but it is
  the only unbounded fan-out left in the recovery path and would be worth an
  explicit "already reconnecting" guard if it ever causes a visible
  double-banner or duplicate log entry at the table.
- **End Room while its ownership is *active* resurrects a shelf entry for a
  destroyed room.** `resetShareStateAfterLeaving(room, true)` deletes
  `ownershipByRoom.get(room)` (and, as of round 8, `hiddenLogEntriesByRoom.get(room)`
  too) but leaves `participantOwners`/`sharedLogEntries` populated and
  `activeOwnershipRoom === room` if that room happened to be the active one at
  the moment of ending it. The next `switchActiveOwnershipRoom(other)` shelves
  that now-stale content right back into `ownershipByRoom`/`hiddenLogEntriesByRoom`
  under the destroyed room's code, re-creating the entry the delete just
  removed. Unreachable garbage in practice (nothing will ever read it back,
  since the room is gone server-side and `holdsLiveEncounterFor` gates every
  read path), but it means "deleted from the shelf" does not always mean
  "stays deleted." Note the existing tests for both shelves
  (`persistent-rooms.spec.ts`, "a room ended while it holds shelved ownership
  forgets that ownership too" / the hidden-log equivalent added in round 8)
  only cover the already-shelved-elsewhere case, not this active-room case.
- **`playerFacingState` (the D-G player-data strip) has zero automated
  coverage.** Module-private in `server.js`, hand-wired at three call sites,
  and `server.js` has no unit-test harness (Karma runs in a browser sandbox
  and cannot load `server.js` as a Node module). It is the only thing
  preventing a player-visible data leak, and it does so by "remember to call
  the helper" discipline rather than a structural guarantee. Worth either a
  small Node-based test harness wired into `npm test` separately, or
  restructuring so every player-facing emit is forced through one typed
  function the browser-loadable modules can also exercise.
- **AC 13 (`npm test`, `npm run lint`, `npm run build` all pass) is not met.**
  `npm run lint` fails with `An unhandled exception occurred: Error while
  loading rule '@typescript-eslint/no-deprecated': You have used a rule which
  requires type information, but don't have parserOptions set to generate
  type information for this file`, thrown while linting
  `src/app/app.component.spec.ts`. This is a pre-existing ESLint
  configuration defect (typed linting needs `parserOptions.project` wired up
  project-wide), not something introduced by durable rooms. A prior attempt to
  fix it surfaced 42 unscoped findings, including in files this change's scope
  explicitly excludes (`src/Grunts/*`, `src/Combat/CombatManager.ts`), so it
  was left unmet rather than fixed as a drive-by. `npm test` and `npm run
  build` both pass cleanly.

## HIGH PRIORITY — Participant-level damage is not on the session-sync wire at all

Found 2026-08-03 while implementing the "Add Grunt" / merge addendum to
`briefs/npc-group-initiative.md`. Confirmed by direct code inspection, not
just the implementer's report. **Xavier wants this fixed next.**

**Scope update, 2026-08-18 (durable-rooms follow-up — "reclaim while
downed"):** the `.filter(p => !p.ooc)` line referenced below narrowed, but
this bug did **not** get fixed as a side effect. `getSharedParticipants()` now
keeps a **claimable** OOC participant on the wire (deliberately, so its owner
can reclaim it — `ARCHITECTURE.md` §7) with a new `ooc: true` field, and
`restoreFromSharedState()` now applies that flag back onto the rebuilt
participant so it comes back downed rather than silently revived. Damage and
health are still not on `SharedParticipantState` at all — a reclaimed
character still comes back at 0/0 Physical and Stun, same gap this section
describes, just for one participant that is now reachable instead of vanished
outright. A **non-claimable** OOC participant (almost always an NPC) is still
filtered out entirely, unchanged. This section's fix remains open.

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

- **N2 — astral/jack/act/interrupt log entries are recorded but not visible if
  the socket drops mid-session.** `appendSharedLog` sends and forgets: the
  entry only reaches the GM's own *pane* via the server echo, so a broadcast
  that fails in flight showed nowhere at all. `action-log-readability-spec.md`
  fix-round defect D1 (2026-08-14) partially closed this:
  `appendParticipantEventLog` now also writes a local `LogHandler` line when
  `shareRoomCode` is set and `shareConnectionLost` is true, so the event is no
  longer lost from the *data* — but the GM Action Log panel renders
  `sharedLogEntries` whenever `shareRoomCode` is set (`battle-tracker.component.html`)
  and never falls back to `getVisibleLogEntries()`/`LogHandler.logbook` while a
  session is open, so that local line stays invisible on screen until the GM
  closes the session. Affects `appendParticipantEventLog`'s callers
  (`performAct`, `btnAction_Click`, `enableAstral`, `disableAstral`,
  `toggleAstralProjecting`, `gmJackIn`, `gmJackOut`) along with every other
  `appendSharedLog` caller not routed through that helper (e.g.
  `appendPlayerCommandLog`, which has no such fallback at all). A narrower
  related gap: `shareConnectionLost` is a reactive UI flag, not a live
  transport check, so the *first* event after a silent authorization loss
  (connected socket, but the server no longer treats the GM as authorized) can
  still be lost before the flag flips. A real fix means either surfacing the
  local pane during a disconnect, or de-duplicating by entry `id` so
  local-first writes plus the eventual echo can coexist everywhere.
- **N5 — `appendParticipantRollLog` and `logRowEvent` double-log.** The visible
  branch writes the line locally *and* sends it, and the server echo then
  mirrors it again for any actor other than `"GM"`. Predates the attribution
  change (not a regression), but it means participant-attributed roll lines and
  every NPC-row event (declared actions, damage/heal, "joined the group",
  "formed from…") can appear twice in the GM's Action Log while a session is
  running. Confirmed still present by `briefs/action-log-readability-spec.md`
  (Finding D, 2026-08-14): fixing it would require de-duplicating by entry `id`
  and would churn the row-log test suite (`src/Grunts/npc-row.spec.ts`), so it
  was left alone again rather than folded into that wording-only pass.
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
- **N9 — combat structural boundary lines never appear in the solo/local
  log.** `briefs/combat-boundary-logging-spec.md` Open Decision 1 (declined):
  the five new/changed structural entries (`Combat started`, `Combat ended`,
  `Start`/`End Combat Turn`, `Start`/`End Initiative Pass`) all go through
  `appendSharedLog`, matching the three that existed before that change, so
  with no share session open they produce nothing — not even a local
  `LogHandler` line — and a GM running solo never sees a turn/pass boundary in
  their Action Log at all (pinned by that brief's AC 11 and scenario S6). The
  alternative, `appendParticipantEventLog`, writes a local line when
  `shareRoomCode` is empty, but it also writes through `appendSharedLog` while
  a session *is* open — so switching to it changes `LogHandler.logbook`
  contents for every spec that reads it, for a benefit that only lands in the
  sessionless case. Declined for that reason; a real fix means making that
  trade deliberately, not as a side effect of a logging-only change.
- **N10 — an all-down table or repeated Start Combat Turn taps can spam the
  log.** `briefs/combat-boundary-logging-spec.md` fix-round Defects 3/4
  (2026-08-16): the pre-existing turn-counter-runaway quirk (`combatTurn`
  keeps incrementing on repeated `Start Combat Turn` taps when nobody can act)
  now also produces a repeated `Combat started` / `Start Combat Turn N` /
  `Start Initiative Pass N` / `End Combat Turn N` quartet per mis-tap, where
  before it was silent. The underlying state-transition bug (nothing stops a
  Combat Turn from starting when no participant can act) is unchanged and out
  of scope for a logging-only change; this only notes that the logging change
  makes an existing quirk more visible at the table.

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

## Durable rooms — review defects D4-D7 (`briefs/persistent-rooms.md`)

Diagnosed in the Stage 3 final review of the durable-rooms change on 2026-08-05.
The brief promoted D1-D3 to acceptance criteria (AC 15-17, now implemented) and
left four more as backlog items. D4 is now **closed** (round 5); D5-D7 are
still open (numbering kept as-is - both are referenced by that label throughout
`server.js`/`server/room-guards.js`/ARCHITECTURE.md/spec comments, so it is not
renumbered here).

- ~~**D4 — narrow End Room race.**~~ **Closed, round 5.** Re-examined and could
  not be reproduced (matching the Stage 3 final review, which flagged this as
  unconfirmed even at the time): every server-side handler that touches a room
  (`session:update-state`, `session:append-log`, `gm:end-session`, `evacuateRoom`,
  `store.remove`) runs fully synchronously, with no `await`/promise inside it,
  so Node cannot interleave a *different* packet's processing partway through
  `gm:end-session`'s body - there is no `await` for another queued packet to
  run during. And on the *same* socket, a client-side `session:update-state`
  the GM already emitted before End Room is guaranteed by TCP/WebSocket framing
  to be processed by the server strictly before a later `gm:end-session` on
  that connection, not after, so it cannot land in the gap the original
  defect described. If a genuine repro ever turns up, reopen with the exact
  emit sequence and timing that produced it - none was ever captured.
- **D5 — stale ARCHITECTURE.md write-site count.** **Half-closed, round 6
  (durable-rooms review round 6, defect D3 in that round's numbering - not to
  be confused with this backlog item's own D5 label).** The count had already
  drifted from three to five as `gm:join-session` and `gm:close-session` grew
  their own `touchSession` calls; every comment claiming "three" (`server.js`,
  `server/session-store.js`, `ARCHITECTURE.md` §7) now says five and points
  back to `touchSession`'s own doc comment as the source of truth, and cites
  the drift history explicitly so it is not trusted blindly next time either.
  **Still open:** there is still no compiler- or test-enforced check that the
  count is accurate - a grep-and-count test (`grep -c "touchSession(" server.js`
  compared against a named constant) would close this for real, but the only
  test runner in this repo is Karma in a browser sandbox, which cannot read
  `server.js` as a Node file to grep it; this would need either a small Node
  test script wired into `npm test`/CI separately, or restructuring
  `touchSession`'s callers to funnel through something the browser-loadable
  `server/session-store.js`/`server/room-guards.js` modules can count instead.
  Neither was in scope for round 6. Separately, §7 does not say what happens
  when two GM tabs hold the same room code: both consider themselves the
  source of truth and will push over each other.
- **D6 — the disconnect banner is conflated with "GM not connected".** The
  player view's transport-drop warning and the server's `gmConnected` presence
  signal end up saying similar things for different causes, so a player cannot
  tell "my connection dropped" from "the GM has left".
- **D7 — stale release notice after an undo.** `findReleasedOwnCharacters()`
  announces "the GM released your character"; if the GM immediately undoes the
  release, the notice stays on the player's screen with nothing to act on.
