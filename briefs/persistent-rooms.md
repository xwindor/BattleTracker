# Brief: Durable Rooms (session state survives server restart)

## Rules-dependency check

None. This is transport, storage and lifecycle work. No SR5 mechanic, number
or timing question is involved. Correctly in this pipeline.

## Request

Make a room's state durable on the server so a GM can leave and rejoin the same
room code at any later point — hours or days, across a `pm2 restart` — and get
the encounter back, with the existing `ownerName`/`claimable` claim system
deciding who owns which character on rejoin.

**Not in scope:**

- Any new identity mechanism. Player identity stays the per-tab random token
  (`player-view.component.ts:116`). No passwords, no accounts, no cookies.
- Cross-room character portability or a saved-character library.
- Chummer `.chum5` import (separate future change).
- Any change to combat/initiative semantics: turn/pass boundaries, running
  Initiative Score, tie-breaking, undo chaptering.
- Persisting undo/redo history. It is GM-tab-local and never leaves the
  browser (ARCHITECTURE §7); this change does not alter that.

**Explicitly in scope even though the request did not name it:** making a
server restart *detectable and recoverable* on the client. Durable server state
is useless if the GM's tab silently stops broadcasting afterwards — which is
what happens today (see Current behaviour, "The silent-death path").

## Current behaviour

### Room state is in-memory and dies with the process

`server.js:80`: `const sessions = new Map();`. Each entry is
`{ state, log }` (`getOrCreateSession`, `server.js:86-94`): one
`SharedCombatState` snapshot plus a log array capped at 300 entries
(`server.js:196-198`). There is no file, no database, no `express.json()`, and
`package.json` has no persistence dependency of any kind.

Rooms are destroyed in exactly one place: `gm:close-session` →
`sessions.delete(room)` (`server.js:270`), after emitting `session:closed` and
`io.in(room).socketsLeave(room)`.

There is no expiry, no sweep, and no cap on the number of rooms — the process
lifetime *is* the retention policy.

### The silent-death path (this is the core defect the feature must fix)

On `pm2 restart` (or a crash), the process dies with the `sessions` Map. The
GM's browser socket reconnects automatically — `socket.io-client` defaults to
`reconnection: true` and nothing in `SessionSyncService` disables it — but the
reconnected socket is a **new** socket with empty `socket.data`. Nothing
re-emits `gm:join-session`.

Consequently every subsequent guarded emit from the GM tab is rejected:
`session:update-state` requires `socket.data.role === "gm"`
(`server.js:144-147`), which is now `undefined`. The server replies with
`session:error`.

**Nothing in the client listens for `session:error`.** Search across `src/`
turned up zero hits. So the GM keeps running combat, keeps clicking Next Pass,
and every broadcast is silently discarded. Players' screens freeze at the last
pre-restart state with no error shown to anyone.

Note also `handleSessionClosedExternally`
(`battle-tracker.component.ts:874-891`) whose doc comment says it handles
"server restart, dropped connection" — it is wired to the `session:closed`
event (`:871`), which a restarting server never emits. It fires on a deliberate
GM close from another tab, not on a restart.

### Rejoining a room today

`btnJoinShareSession_Click` (`battle-tracker.component.ts:758-779`) calls
`joinAsGm(room)`, merges the returned log via `mergeHiddenLogEntries`
(`:2487`), and calls `restoreFromSharedState(state)` (`:1866`). The server
replays `session.state` and `session.log` verbatim
(`server.js:113-123`). This works only while the process has been up
continuously since the room was created.

### `restoreFromSharedState` is materially lossy

`battle-tracker.component.ts:1866-1949`. What it rebuilds and what it drops:

- **Every participant is rebuilt as `new Participant()`** (`:1896`). A
  `MatrixParticipant`, `ICParticipant` or `AstralParticipant` comes back a
  plain participant — even though `isMatrix`, `vrMode`, `dataProcessing`,
  `attack`, `sleaze`, `firewall`, `deviceRating`, `jackedIn`, `isAstral` and
  `isAstralProjecting` are all present on the wire
  (`SharedParticipantState`, `session-sync.service.ts:31-46`; populated by
  `getSharedParticipants`, `:1264`). The data is transmitted and then thrown
  away.
- **No health tracks, no damage.** `SharedParticipantState` has no
  `physicalHealth`, `stunHealth`, `overflowHealth`, `physicalDamage`,
  `stunDamage`, `painTolerance` or `hasPainEditor` field at all. A restored
  participant gets `Participant` construction defaults. `lastKnownDamage` is
  reseeded from those defaults (`:1936-1939`), so the first post-restore damage
  edit logs a wrong delta.
- **OOC participants are gone entirely.** `getSharedParticipants` opens with
  `.filter(p => !p.ooc)` (`:1265`). A downed NPC or an unconscious PC is not in
  the snapshot, so it cannot be restored. It is not hidden — it ceases to
  exist.
- **`actionHistory` is dropped**, so committed interrupt costs (Full Defense)
  vanish; only `status` Active/Waiting survives (`:1940-1945`),
  `Delaying` does not.
- What *is* restored correctly and deliberately: turn/pass counters before
  participants (`:1885-1893`), the running Initiative Score verbatim with
  `addParticipant(p, true)` so pass decay is not double-applied
  (`:1929-1934`), and the already-rolled state via
  `setDiceIniWithoutScoreChange` / `restoredRolledTotal` (`:1852-1864`).

Today this path runs only on a deliberate GM rejoin, so the losses are rare and
usually recoverable by hand. **Durable rooms will make this the normal path**,
hit on every restart and every next-day resume.

### The claim system, as it stands

- `participantOwners` / `participantClaimable` are GM-component-local
  `Map<IParticipant, …>` side-tables (`battle-tracker.component.ts:541-548`),
  not fields on `Participant`. They are serialised out as `ownerName` /
  `claimable` in `getSharedParticipants` and read back in
  `restoreFromSharedState` (`:1916-1923`) — so ownership *does* survive a
  snapshot round trip today.
- On player disconnect the server strips `ownerName` from any participant with
  `claimable === true` that the departing token owned, and rebroadcasts
  (`server.js:275-310`). Because the player token is regenerated on every page
  load, a returning player always re-claims via `claim_character`
  (`player-view.component.ts:471-485` → `battle-tracker.component.ts` claim
  branch). That is the mechanism the user wants reused, and it needs no change.

### Adjacent latent defect found in the same file

`createRoomCode()` (`server.js:82-84`) is
`Math.random().toString(36).slice(2, 8).toUpperCase()`, which is not guaranteed
to yield 6 characters — `Math.random()` can return a value whose base-36
representation is shorter than 8 characters. Every guarded handler validates
with `isRoomCode` = `/^[A-Z0-9]{6}$/` (`server.js:40-42`). A room created with
a short code can therefore never accept `session:update-state`,
`session:append-log` or `session:command` — it is born broken. Low probability,
but persistence would make such a room broken *permanently* rather than until
the next restart. Out of scope to fix here; flagged so it is a deliberate
choice (Open Decision 8).

## Affected paths

### Group A — server persistence (the substance of the change)

- `server.js:80` — `const sessions = new Map()`. The single in-memory store.
  Everything else in this group hangs off it.
- `server.js:86-94` — `getOrCreateSession`. The one construction point; the
  natural place to also load-from-disk if lazy loading is chosen.
- `server.js:99-111` — `gm:create-session`. Note `while (sessions.has(room))`
  is the only collision guard; today it is blind to rooms from a previous
  process lifetime.
- `server.js:113-123` — `gm:join-session`. `sessions.get(room)` returning
  `undefined` is what produces "Room not found" and is exactly what durable
  rooms must stop happening.
- `server.js:125-138` — `player:join`. Same lookup, same consequence.
- `server.js:142-169` — `session:update-state`. The write path: this is where
  `session.state` is replaced and where a persistence write must be triggered.
- `server.js:171-200` — `session:append-log`. Second write path; also the 300
  entry cap.
- `server.js:242-271` — `gm:close-session`, including `sessions.delete(room)`
  at `:270`. Semantics decision (Open Decision 3).
- `server.js:275-310` — disconnect handler; mutates `session.state.participants`
  in place. A third write path, easy to miss.
- `server.js:313-334` — route registration. **`app.get("*")` at `:327` is a
  catch-all SPA fallback**; any new HTTP route (a health/admin endpoint for
  rooms) must be registered *before* it or it will never be reached.
- `server.js:336-340` — `server.listen`. Startup restore and signal handlers
  (`SIGINT`/`SIGTERM` — what `pm2 restart` sends) belong around here.
- `package.json` — new dependency only if Open Decision 1 chooses SQLite or
  Redis. The file-based option needs none.

### Group B — client-side restart detection and recovery

- `src/app/services/session-sync.service.ts:150-335` — `SessionSyncService`.
  It exposes `onState`, `onLog`, `onCommand`, `onSessionClosed` and nothing
  else; there is no `onReconnect`, no `onError`, no `onDisconnect`. The socket
  is created at `:162-165` with default reconnection behaviour.
- `src/app/battle-tracker/battle-tracker.component.ts:860-872` —
  `attachShareListeners`. The one place session listeners are registered; a
  reconnect/error listener belongs here.
- `battle-tracker.component.ts:874-891` — `handleSessionClosedExternally`,
  whose comment already claims to cover server restarts and does not.
- `battle-tracker.component.ts:758-779` — `btnJoinShareSession_Click`, the
  existing pull path.
- `battle-tracker.component.ts:1248-1262` — `syncSharedState`, the existing
  push path, gated on `this.shareRoomCode`.
- `src/app/player-view/player-view.component.ts:157-212` — `join()`. Players
  have the same silent-reconnect problem and no recovery path.

### Group C — the lossy rebuild (decision, see Open Decision 4)

- `battle-tracker.component.ts:1866-1949` — `restoreFromSharedState`,
  specifically `new Participant()` at `:1896`.
- `battle-tracker.component.ts:1264-1312` — `getSharedParticipants`,
  specifically `.filter(p => !p.ooc)` at `:1265` and the absent health/damage
  fields.
- `src/app/services/session-sync.service.ts:5-47` — `SharedParticipantState`,
  the shape that determines what can possibly be restored.
- `battle-tracker.component.ts:541-548` — the eight GM-local side-maps that
  `restoreFromSharedState` clears and repopulates (`:1871-1879`,
  `:1916-1923`). ARCHITECTURE §8 flags this bookkeeping as manual and
  uncompiler-checked; any change to the restore path inherits that obligation.

### Group D — close/end semantics

- `battle-tracker.component.ts:821-858` — `btnCloseShareSession_Click`.
  Contains a decision that becomes wrong if "close" stops meaning "destroy":
  at `:843-846` a deliberate close **discards the GM-local hidden log entries**
  on the stated grounds that the GM ended this session's record on purpose. If
  a closed room is now rejoinable, discarding the only copy of those entries at
  close time silently destroys data the GM could otherwise have merged back.
- `battle-tracker.component.ts:720-756` — `btnCreateShareSession_Click`, whose
  confirmation dialog text at `:731-734` explicitly tells the GM "Rejoin the
  old room code instead to keep them." That advice is currently only sometimes
  true; durable rooms would make it reliably true.
- `battle-tracker.component.ts:2487-2501` — `mergeHiddenLogEntries`.
- `server.js:23-37` — `ALLOWED_COMMAND_TYPES`. Only relevant if the close/end
  split is expressed as a new `session:command` type rather than a new socket
  event. Recommend a socket event (`gm:end-session`) alongside
  `gm:close-session`, since commands are room-broadcast and this is not.

### Group E — documentation

- `docs/APP_DOCUMENTATION.md:409-423` — "Room state is in-memory only (lost on
  restart)" becomes false; the "persistent store (Redis/Postgres)" suggestion
  is superseded by whatever Open Decision 1 answers.
- `docs/APP_DOCUMENTATION.md:344-358` — deployment table. A file-backed store
  adds a data directory that must survive `git pull` and be backed up.
- `ARCHITECTURE.md:453-534` (§7) — "combat state itself never lives on the
  server beyond a last-known snapshot … in-memory, lost on restart."

### What is no longer relevant from the previous draft

The identity group (player token minting, `ownParticipants`, the
impersonation check as a credential question) and the character-shape group
(`register_character` payload, `upsertPlayerParticipant`, a saved-character
document) are all out. The claim system is reused unchanged.

## Proposed approach

Four parts. Parts 1 and 2 are the feature; part 3 is what makes it work in
practice; part 4 is the cleanup that stops it becoming an ops problem.

**1. A persistence layer behind one interface.** Introduce a small
`sessionStore` module with `load()` (all rooms, at startup), `save(room, session)`
and `remove(room)`. Every existing mutation site in Group A calls `save` — and
there are **three**, not one: `session:update-state`, `session:append-log`, and
the in-place participant mutation in the disconnect handler
(`server.js:290-299`). That third one is the site most likely to be missed;
route all three through a single `touchSession(room)` helper rather than
sprinkling `save` calls, so a fourth write site added later cannot forget.

Backend choice is Open Decision 1; the interface is deliberately narrow enough
that the choice is reversible.

**2. Startup restore.** On boot, load every persisted room into `sessions`
before `server.listen`. This makes `gm:join-session` and `player:join` work
across restarts with **no change to their logic** — they just find the room —
and incidentally repairs the room-code collision guard at `server.js:101`,
which is currently blind to rooms from previous process lifetimes.

**3. Client restart recovery, push-not-pull.** This is the part that is easy to
get backwards. On transport reconnect, the GM tab must **re-authenticate**
(`gm:join-session` with its retained `shareRoomCode`) and then **push its local
state** via `syncSharedState()` — *not* call `restoreFromSharedState`.

The reason is that ARCHITECTURE §7 is emphatic that the GM's local
`CombatManager` is the single source of truth. After a server restart the GM's
tab still holds perfect state — full subclasses, health, damage, OOC
participants, action history — while the server's snapshot is the lossy
projection described above. Pulling would downgrade good state to bad. Pull is
correct only when the GM tab has no state: a fresh page load, a new tab, the
existing explicit "Join room" button.

So: **fresh tab → pull; live tab reconnecting → push.** Players always pull;
they have no authoritative state.

Add a `session:error` listener at the same time. A rejected broadcast must
surface, not vanish.

**4. Retention.** Persisted rooms need a TTL and a startup sweep, because the
app is going from zero bytes of durable state to unbounded growth (Open
Decision 5).

## Acceptance criteria

1. A GM creates room `ABC123`, runs three combat turns, then `pm2 restart sr5e`
   runs. Within 30 seconds and with no GM interaction, the GM tab is
   re-authenticated to `ABC123` and a state broadcast reaches players; players'
   screens resume updating.
2. In scenario 1, the encounter's participants, turn/pass counters, running
   Initiative Scores, damage, OOC participants and participant subclasses are
   **unchanged** on the GM's screen — the restart causes no restore of the GM's
   own state.
3. A GM closes the browser entirely, the server restarts, and 3 days later the
   GM opens a fresh tab and joins room `ABC123`. The room is found (not "Room
   not found") and the last broadcast state and log are replayed.
4. In scenario 3, every participant that was in the last broadcast comes back
   with its correct type: a jacked-in decker is a `MatrixParticipant` with its
   deck stats and VR mode, an astrally projecting magician is an
   `AstralParticipant`. (Subject to Open Decision 4 — if that decision is
   "inherit the bug," this AC is struck and replaced by an explicit warning
   shown to the GM at restore time.)
5. In scenario 3, participant ownership is restored from the persisted
   `ownerName`/`claimable`, and a returning player can re-claim their character
   through the existing `claim_character` command with no GM action.
6. A player joins a persisted room whose GM is not currently connected: they
   receive the last known state and log, and are told the GM is not present.
   (Or are refused — Open Decision 7 — but the behaviour is deliberate and
   messaged either way, not a blank screen.)
7. Persisted state is written durably: killing the process with `SIGKILL`
   immediately after a state change loses at most the configured debounce
   window (Open Decision 2), never a corrupt or partially-written room. A
   truncated or malformed persisted room is skipped at startup with a logged
   error and does not prevent other rooms loading or the server booting.
8. Closing a room and ending a room are distinguishable actions with distinct
   effects (Open Decision 3): after "close," the room is still joinable by code;
   after "end/delete," `gm:join-session` returns "Room not found" and no
   persisted trace of the room remains.
9. GM-local hidden log entries are not silently destroyed by whichever action
   is now merely a "close" — `btnCloseShareSession_Click`'s discard at
   `battle-tracker.component.ts:843-846` is moved to the destructive action, or
   the GM is asked first.
10. A server rejection of a GM broadcast (`session:error`) is surfaced in the
    GM UI rather than swallowed. No code path allows the GM to keep running
    combat while every broadcast is being discarded.
11. Retention is indefinite (amended 2026-08-05), **with one exception (amended
    round 4, review defect D7):** no persisted room is removed for age, but at
    the hard room-cap (`TOTAL_ROOM_CAP`) the single oldest room with nobody
    connected may be evicted to make room for a new `gm:create-session`. This
    reconciles AC 11 with the capacity-eviction mechanism added in round 3,
    which the acceptance criterion did not originally account for. An eviction
    leaves a tombstone (distinct from a GM's own End Room, which leaves none),
    so the affected GM's next `gm:join-session` explains what happened instead
    of a bare "Room not found". `lastActivity` is still recorded on every
    write. Any sweep that remains only clears tombstone/corrupt files, not
    aged-out live rooms, and is logged if it runs.
12. Nothing in this change moves a running Initiative Score, alters turn/pass
    boundaries, or touches undo chaptering. `src/scenarios/running-initiative-score.spec.ts`
    passes unmodified.
13. `npm test`, `npm run lint`, `npm run build` all pass.
14. `docs/APP_DOCUMENTATION.md:409-423`, the deployment table at `:344-358`,
    and `ARCHITECTURE.md` §7's "in-memory, lost on restart" are updated to
    match reality, including where persisted data lives and how to back it up
    or clear it.

### Added 2026-08-05 — after Stage 3 final review, resolving diagnosed spec gaps

15. **Confirm before a Join overwrites local state (fixes review defect D2).**
    `btnJoinShareSession_Click` must not silently call
    `restoreFromSharedState()` when doing so would discard participants,
    damage, or turn/pass state currently on the GM's screen that the server
    doesn't already have (i.e. whenever `holdsLiveEncounterFor(room)` is
    false AND the GM's local `CombatManager` has at least one participant).
    In that case, show a confirmation dialog via the existing
    `ConfirmationDialogService` (already used at
    `battle-tracker.component.ts:730` and `:846`) naming what will be lost,
    before pulling. Confirming proceeds with the pull; cancelling aborts the
    join attempt and leaves local state untouched. Joining a room while the
    GM's local state is empty (a genuine fresh tab) needs no prompt — nothing
    is at risk. Joining the *same* room the tab already holds
    (`holdsLiveEncounterFor(room)` true) still pushes as today, unprompted.
16. **Unauthenticated room creation cannot grow disk usage (fixes review
    defect D1).** Looping `gm:create-session` followed by
    `session:append-log`/`session:update-state` on the newly-created room must
    not write a file per iteration. The fix must close this at the point
    where a session is allowed to acquire real content, not only rely on
    `hasPersistableContent` as a passive backstop — e.g. rate-limit or cap the
    number of rooms a single unauthenticated connection may create, or
    require some minimal proof of intent before a create is honored. Also fix
    the associated in-memory leak: a room created and never given content
    must not remain in the server's `sessions` Map forever. Document the
    final answer in `docs/APP_DOCUMENTATION.md` (the current claim there that
    this is already closed is inaccurate and must be corrected either way).
17. **A failed "End Room" does not discard GM-local hidden log entries (fixes
    review defect D3).** `resetShareStateAfterLeaving(room, discardHiddenEntries: true)`
    must only run when `endSession()` actually succeeded. On failure/timeout/
    rejection, the room, the hidden log entries, and `liveEncounterRoomCode`
    must be left exactly as they were before the End Room attempt, matching
    what already happens for a network blip on any other action.

Defects D4 (narrow end-session race), D5 (stale ARCHITECTURE.md write-site
count and missing two-GM-tabs caveat), D6 (disconnect banner conflated with
"GM not connected"), and D7 (stale release notice after an undo) are backlog
items, not acceptance criteria for this pass — log them in
`docs/FEATURE-BACKLOG.md` if not already covered.

## Regression risk

| Risk | Why | Cover |
|---|---|---|
| Reconnect pulls instead of pushes, wiping good GM state | `restoreFromSharedState` (`:1871-1883`) unconditionally clears all eight side-maps and both participant lists before rebuilding. Wiring it to a reconnect event would destroy a live encounter with a lossy copy. This is the single most damaging way to get this feature wrong. | No test coverage of `restoreFromSharedState` at all. Needs new coverage. |
| Restored deckers/astrals downgrade to plain `Participant` | `:1896`. Pre-existing, but persistence makes it routine. | None. |
| OOC participants silently deleted by any restore | `getSharedParticipants:1265` filters them out. A GM who rejoins next day finds every downed combatant gone. | None. |
| Damage-delta log lies after a restore | `lastKnownDamage` is reseeded from a restored participant's *default* damage (`:1936-1939`), which is 0, while the participant's real damage was never transmitted. | None. |
| Hidden GM log entries destroyed on "close" | `btnCloseShareSession_Click:843-846` discards them deliberately, on an assumption ("the record ended") that this change invalidates. | `src/scenarios/combat-log-readability.spec.ts:557-`, "GM-local hidden entries on reconnect". This suite will need revisiting. |
| Write amplification / disk churn | `syncSharedState` is called from `sort()` and directly from ~20 mutation sites; at the table this is many writes per second. Naive write-on-every-update will hammer the disk and can stall the event loop with sync I/O. | None; drives Open Decision 2. |
| Missed write site | The disconnect handler mutates `session.state.participants` in place (`server.js:290-299`) without going through `session:update-state`. A persistence hook added only to the two obvious emit handlers will silently fail to persist ownership releases. | None. |
| Unbounded disk growth | No expiry exists today because process death was the cleanup. | None; drives Open Decision 5. |
| Room-code collision across lifetimes | `while (sessions.has(room))` at `server.js:101` only sees the current Map. Fixed for free by startup restore — but *only* if restore happens before any create can be served. | None. |
| Undo is still lost | Undo history is never sent to the server (ARCHITECTURE §7) and this change does not alter that. A GM who "resumes yesterday's room" has no undo for anything before the reload — which will surprise them, because everything else came back. | ARCHITECTURE §7 documents it; nothing enforces it. |

## Scenarios to survive

**S1 — Ordinary: `pm2 restart` mid-combat, GM tab still open.** Combat turn 2,
pass 2, five participants, one a jacked-in decker in hot-sim, one NPC at OOC.
The GM's tab is open. `pm2 restart sr5e` runs.
*Expected:* the GM's screen does not change at all — no participant list flicker,
no lost decker, no resurrected OOC NPC, no Initiative Score movement. Within a
few seconds the tab has silently re-authenticated and pushed its state; players
resume receiving updates. Nothing the GM did during the outage is lost, because
the GM's tab was always the source of truth.

**S2 — GM closes the laptop, reopens days later.** The GM closes the browser
mid-encounter on Sunday. The server restarts twice during the week. On
Wednesday the GM opens a fresh tab and enters room code `ABC123`.
*Expected:* the room is found. Turn/pass counters, participant list, running
Initiative Scores, rolled/unrolled state and ownership come back. Participant
subclasses come back per Open Decision 4 — and if that decision is "inherit,"
the GM is told plainly what was lost rather than discovering a decker has
become a plain participant mid-fight. Undo history is empty and the GM is told
so. Damage/health accuracy is bounded by whatever Open Decision 4 chose.

**S3 — Undo across a restore.** The GM rejoins a persisted room (S2), makes one
edit, then presses Ctrl+Z twice.
*Expected:* the first undo reverses the edit. The second does nothing — there is
no history from before the restore, and the app must not appear to undo into
pre-restore state it does not have. Critically, `restoreFromSharedState`'s own
writes must not sit in an open undo chapter that a later undo can walk into: per
ARCHITECTURE §4, a write outside an explicit `StartActions()` auto-opens a
chapter that then absorbs everything after it. The restore path must bound its
own chapter or be excluded from undo entirely.

**S4 — Live at the table, restart mid-combat with four players.** Pass 2, three
participants have acted, one player is mid-roll, one NPC is OOC, one player just
disconnected (so the server had just stripped their `ownerName`). The droplet
reboots.
*Expected:* GM keeps running combat without pausing. Players' clients reconnect
and re-join; the returning player re-claims through the existing
`claim_character` flow. The mid-roll `roll_submission` sent during the outage is
lost — that is acceptable, but it must be *visible*: the participant still shows
as pending a roll rather than appearing to have rolled. The GM must never be in
the current silent state where they run three more passes before noticing
players are frozen.

**S5 — Retention boundary (amended).** A room is created, used, and then
untouched for months. The GM tries to rejoin it.
*Expected:* retention is indefinite — the room is still there and joins
normally. The tombstone/"expired" messaging built for the original TTL design
is retained in code for corrupt/legacy-expired rooms, not for age — and, as of
round 4 (defect D7), is now also the mechanism a capacity eviction uses (AC 11),
not an explicit End Room, which leaves no marker since the GM was there and did
it themselves. The disk-growth concern this TTL was meant to answer is covered
separately by closing the unbounded-contentless-room vector (see the new
acceptance criterion on unauthenticated room creation below).

**S6 — Corrupt persisted room.** The process is `SIGKILL`ed mid-write, or a
persisted room file is manually mangled. The server is started.
*Expected:* the server boots. The bad room is skipped with a logged error. Every
other room loads. The server does not crash-loop under pm2 — which, with
`pm2 restart` on a boot crash, is the failure mode that takes the whole app
down rather than one room.

## Open decisions — resolved 2026-08-01

Xavier confirmed the recommended default on all 8. Recorded here so Stage 2
implements against a decided spec, not "recommended defaults" language.

1. **Storage backend: JSON file per room**, atomic write (temp file + rename).
2. **Write timing: debounce ~1s per room**, plus immediate flush on
   `gm:close-session`/`gm:end-session` and on `SIGINT`/`SIGTERM`.
3. **Close vs. end: split.** "Close Room" leaves the room connected/persisted
   and rejoinable by code. A new, separate "End Room"/"Delete Room" action
   (behind a confirmation dialog) permanently deletes the persisted record.
   The hidden-log-entry discard currently in `btnCloseShareSession_Click`
   (`:843-846`) moves to the new destructive action.
4. **Fix `restoreFromSharedState`'s lossy rebuild — option (b).** Use the
   `isMatrix`/`isAstral` flags already broadcast to reconstruct the correct
   `MatrixParticipant`/`AstralParticipant`/`ICParticipant` subclass and reapply
   their already-transmitted fields. Health/damage/OOC-participant loss is
   **not** fixed by this change — log options (c)/(d) in
   `docs/FEATURE-BACKLOG.md` as a known limitation, and the GM must be told at
   restore time that those did not come back.
5. **Retention: indefinite. (Amended 2026-08-05 — user decision, overrides the
   30-day default below.)** Rooms are never removed for age. `lastActivity` is
   still recorded on every persisted document (needed regardless of policy,
   and cheap insurance if retention is ever revisited), but the sweep no
   longer age-expires rooms — it exists only to remove tombstones/corrupt
   files, if that still applies. The original disk-growth motivation for a TTL
   is addressed separately by closing the unbounded-contentless-room vector
   (Open Decision 5 discussion below still explains the abandoned reasoning;
   kept for context, not current policy).
6. **Push vs. pull on reconnect: push when the GM tab holds live state; pull
   only on a fresh tab / explicit Join.** This is the highest-risk-to-get-wrong
   decision in the whole spec — call it out prominently in code comments/PR
   description for Stage 3 review.
7. **Players may join a persisted room with no GM connected**, shown "GM not
   connected" rather than being refused.
8. **Fix `createRoomCode`'s short-code possibility now**, in this change,
   since persistence makes a born-broken room permanent rather than
   restart-cleared.

## Open decisions (superseded reasoning below, kept for context)

**1. Storage backend.** *(Main decision.)*

- **JSON file per room** under a data directory, written atomically
  (write to `.tmp`, `fs.rename`). Zero new dependencies. Maps exactly onto the
  existing `{ state, log }` shape. Startup restore is a directory read.
  Deleting a room is an `unlink`. Trivially inspectable and trivially backed up.
  Weaknesses: no queries, and a room's whole document is rewritten on every
  save (a 64 KB state cap already exists at `server.js:160`, so each write is
  bounded and small).
- **One JSON file for all rooms.** Simpler enumeration, but every save rewrites
  every room, and one corruption event takes out every room instead of one.
  Worse on both axes; listed only to be dismissed.
- **SQLite** (`better-sqlite3`). Atomic writes, cheap TTL sweeps, and a real
  query surface. Costs: a native dependency built on the droplet (Node
  v22.22.0, `docs/APP_DOCUMENTATION.md:356`), and a schema for what is
  currently two opaque JSON blobs. Genuine overkill for a `Map<string, {state,
  log}>` with a handful of rooms.
- **Redis.** A second process to install, supervise and configure for
  durability (AOF/RDB) on a single droplet running one pm2 app. Highest ops
  cost, no benefit at this scale. `docs/APP_DOCUMENTATION.md:421` suggests it,
  but that suggestion was written for a "larger public use" scenario that is not
  this request.

*Recommended default:* **JSON file per room, atomic write.** Reason: it matches
the existing data shape one-to-one, adds no dependency and no deployment
component, is inspectable when something goes wrong at the table, and the
`sessionStore` interface keeps SQLite available later if room counts ever
justify it. Note the data directory must be outside the `git pull` path or
gitignored (`docs/APP_DOCUMENTATION.md:359-377` deploys by pulling into
`/var/www/sr5e`).

**2. Write timing.** Every update (correct but chatty), debounced, or only on
close.
*Recommended default:* **debounce ~1s per room, plus an immediate flush on
`gm:close-session` and on `SIGINT`/`SIGTERM`.** `pm2 restart` sends `SIGTERM`
then `SIGKILL` after a grace period, so a signal flush turns the common case —
a deliberate restart — into a zero-loss operation. Worst-case loss on a hard
kill is one debounce window, which at a tabletop pace is one or two clicks.
"Only on close" is rejected outright: it loses everything in exactly the crash
case this feature exists to survive.

**3. `gm:close-session` semantics.**
*Recommended default:* **split them.** Keep the button labelled "Close Room"
but make it *leave* the room (disconnect, notify players, keep the room
persisted and rejoinable), and add a distinct destructive "End Room" /
"Delete Room" that removes the persisted record — behind a confirmation, using
the existing `ConfirmationDialogService` already used at
`battle-tracker.component.ts:730`. Reason: the user's request is literally "so
we can rejoin it at any time," which is incompatible with the current close
deleting the room; but a GM still needs a way to say "this campaign is over,
throw it away," or retention becomes the only way rooms ever die.

Consequence that must be handled, not discovered later: the hidden-log-entry
discard at `battle-tracker.component.ts:843-846` currently keys off "deliberate
close." It must move to the destructive action, or the close must ask first.
The confirmation text at `:731-734` ("Rejoin the old room code instead to keep
them") becomes reliably true for the first time.

**4. Does this change fix `restoreFromSharedState`'s lossy rebuild?**
*(Raised explicitly rather than inherited — persistence turns this from a rare
annoyance into the normal resume path.)*

- **(a) Inherit it.** Cheapest. Every next-day resume silently downgrades
  deckers and astrals to plain participants, drops all damage and health, and
  deletes every OOC participant. For a feature whose entire value proposition is
  "pick up where you left off," this is close to self-defeating.
- **(b) Fix the reconstruction only.** Use the `isMatrix`/`isAstral` flags
  already on the wire to instantiate the right subclass and reapply the deck /
  astral fields that are *already broadcast*. No wire-format change; purely a
  bug fix in `restoreFromSharedState`. Does not fix health, damage or OOC.
- **(c) Extend the broadcast** with health, damage, `painTolerance`,
  `hasPainEditor` and stop filtering OOC participants out. Fixes everything, but
  widens `SharedParticipantState`, which is player-visible — and
  `docs/FEATURE-BACKLOG.md` already records that `getSharedParticipants` leaks
  state to players regardless of the GM's roll-visibility toggle. Widening it
  makes that known leak worse.
- **(d) A separate GM-only snapshot** persisted alongside the player-facing
  state, carrying everything the GM needs to rehydrate exactly. Correct and
  leak-free, but it is a second serialisation format for participants, which is
  a real maintenance burden and a new drift hazard of exactly the kind
  ARCHITECTURE §6 describes for `PARTICIPANT_BASE_BACKING_FIELDS`.

*Recommended default:* **(b) now, and log (c)/(d) in
`docs/FEATURE-BACKLOG.md`.** Reason: (b) is a small, self-contained fix to data
the server already transmits and then discards, it removes the most alarming
symptom (a decker turning into a plain participant mid-fight), and it does not
touch the player-visible wire format or the known leak. Health/damage/OOC loss
is real but is at least *visible* to the GM, where a silently downgraded
subclass is not. If you want the full fix, (d) is the right shape — but it is
its own change, not a rider on this one.

Whichever is chosen, AC 4 and the S2 expectations must be written to match, and
if (a) or (b) is chosen the GM must be *told* at restore time what did not come
back.

**5. Retention policy.**
*Recommended default:* **30 days since last write, swept at startup and every
24h, with the sweep logged.** Reason: it comfortably covers "we play
fortnightly," it bounds disk growth for an app that has never had durable state
before, and a startup sweep means a long-idle droplet self-cleans on its next
restart. Rooms must record a `lastActivity` timestamp for this — add it to the
persisted document from day one even if retention is initially set to
"indefinite," because retrofitting it means every pre-existing room has an
unknown age.

**6. Push vs pull on reconnect.**
*Recommended default:* **push when the GM tab holds live state; pull only on a
fresh tab / explicit Join.** Reasoning is in Proposed approach part 3. This is
the decision most likely to be got backwards by an implementer who sees an
existing `restoreFromSharedState` and a new reconnect event and wires them
together. Call it out in the implementation notes.

**7. May players join a persisted room with no GM connected?** Today the server
does not track GM presence at all, so this is already possible and simply
undefined.
*Recommended default:* **allow it, and show players "GM not connected."**
Refusing means a player who opens the link two minutes early gets an error that
looks like a broken room code. Note this requires the server to start tracking
whether a GM socket is in the room, which it currently does not — small, but
not free.

**8. Fix `createRoomCode`'s short-code possibility now?**
*Recommended default:* **yes, in this change.** It is a two-line fix
(pad/regenerate until the code matches `isRoomCode`), it sits in the same file
and the same function family being touched, and persistence changes its blast
radius from "one broken room until the next restart" to "one permanently broken
room on disk." Deferring a two-line fix in the file you are already editing is
the false economy this step exists to catch.

---

**Files whose exact text is load-bearing:**

- `E:\Programs\SR5E\server.js` — `:80` (`sessions` Map), `:82-84`
  (`createRoomCode`, the short-code defect), `:86-94`, `:99-138` (create/join),
  `:142-200` (both write paths), `:242-271` (close/delete), `:275-310` (the
  third, easily-missed write path), `:327` (SPA catch-all — new routes must
  precede it), `:336-340` (listen; startup restore and signal handlers)
- `E:\Programs\SR5E\src\app\battle-tracker\battle-tracker.component.ts` —
  `restoreFromSharedState` (line 1866 as of this reading; `new Participant()`
  at `:1896` is the downgrade bug), `getSharedParticipants` (`:1264`, the
  `.filter(p => !p.ooc)` at `:1265`), `btnCloseShareSession_Click` (`:821`,
  hidden-entry discard at `:843-846`), `btnJoinShareSession_Click` (`:758`),
  `attachShareListeners` (`:860`), `handleSessionClosedExternally` (`:880`,
  whose comment already claims to cover restarts and does not)
- `E:\Programs\SR5E\src\app\services\session-sync.service.ts` — `:5-47`
  (`SharedParticipantState`, which determines what can be restored at all),
  `:150-335` (no reconnect/error surface)
- `E:\Programs\SR5E\docs\APP_DOCUMENTATION.md` — `:344-358`, `:409-423`
- `E:\Programs\SR5E\ARCHITECTURE.md` — §7

**Note:** `battle-tracker.component.ts` line numbers reflect the state of the
file as of this scoping session; trust symbol names over line numbers if the
file has moved since.
