# Feature Backlog

Running list of future features. Newest at the top.

Completed items are deleted from this file rather than kept as historical
record — the change that shipped them is the record (`briefs/`,
`ARCHITECTURE.md`, git history). Last swept 2026-08-23.

## Clear interrupts control (deferred from "Remove the undo/redo system", Open Decision 1)

`Participant.resetActions()` exists and is fully implemented (clears
`actionHistory`, refunding any committed Interrupt Action cost such as Full
Defense's -10) but has **no caller anywhere in `src/`** and no UI control
reaches it. With the Undo control gone, a mis-tapped Interrupt Action
(`btnAction_Click` -> `p.doAction(action)`) has no correction path at all
until the Combat Turn ends and `softReset()` clears `actionHistory` for
everyone. Wire a "Clear interrupts" control (per participant, or per the
selected NPC row member) to `resetActions()`. Whether clearing Full Defense
mid-turn refunds the -10 (it does, structurally, since the whole entry is
removed) is already the behaviour `resetActions()` gives; if a *partial*
clear (single action, not the whole history) turns out to be wanted instead,
that is a different, larger change and a fresh table ruling in
`RULINGS.md`, not assumed here.

## Confirmation on the turn-ending Next Pass tap (deferred from "Remove the undo/redo system", Open Decision 2)

`btnNextPass_Click()` already computes `const isRealNewPass =
!this.combatManager.isOver()` before calling `nextIniPass()` -
`CombatManager.isOver()` is the same predicate `endInitiativePass()` uses to
decide whether the tap also ends the Combat Turn, so a turn-ending tap is
detectable *before* any mutation runs. With the Undo control gone, a
mis-tapped Next Pass that happens to end the Combat Turn triggers
`softReset()` on every participant (dice, running Score, edge, status,
`actionHistory` all reset - see `ARCHITECTURE.md` §2) with no way back.
Add a confirmation dialog, but **only** when the tap would end the Combat
Turn (`CombatManager.isOver()` evaluated *before* `nextIniPass()` runs, not
at `btnNextPass_Click`'s current check position, which runs after the Score
has already moved) - a prompt on every ordinary pass advance (2-4 taps per
turn) is prompt fatigue for no benefit; a prompt on the one tap per turn that
actually destroys state is not. Scenario S6 in
`src/scenarios/remove-undo-system.spec.ts` pins the current (unconfirmed)
behaviour as the baseline this change updates deliberately.

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
in `docs/INITIATIVE-MUTATION-SOURCES.md`; **still not produced** (confirmed
absent 2026-08-23). Note `CLAUDE.md` already lists that file as authoritative
documentation, so writing it is the first step of this item, not an optional
extra.

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

## Durable rooms — review defects D5-D7 (`briefs/persistent-rooms.md`)

Diagnosed in the Stage 3 final review of the durable-rooms change on 2026-08-05.
The brief promoted D1-D3 to acceptance criteria (AC 15-17, now implemented) and
left four more as backlog items. D4 was closed in round 5 (could not be
reproduced) and has been removed from this file. D5-D7 are still open, and
keep their original numbers - they are referenced by those labels throughout
`server.js`/`server/room-guards.js`/ARCHITECTURE.md/spec comments, so nothing
is renumbered here.

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
