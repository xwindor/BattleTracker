# SR5E BattleTracker Documentation

This document is split into two layers:

- `At A Glance`: how to use and run the app quickly.
- `Deep Dive`: how the code and runtime behavior work in detail.

## At A Glance

### What This App Does

This is a Shadowrun 5e combat tracker with two UIs:

- `GM view` (default): full control of initiative, condition monitors, logs, and session management.
- `Player view` (`?mode=player&room=ROOMCODE`): limited visibility and controls for claimed characters.

Core capabilities:

- Track combat turn/pass/initiative order.
- Manual or automatic initiative rolls.
- Interrupt actions with initiative costs.
- Action declaration modal (Free/Simple/Complex + Matrix categories).
- Character claim system for players.
- Shared action log.
- Tie-breaking on equal initiative totals using SR5-friendly stat order.

### Quick Start (Local)

Use two terminals:

1. Start session server:

```bash
npm run server
```

2. Start Angular dev app:

```bash
npm start
```

Then open:

- GM: `http://localhost:4200`
- Player (after room created): `http://localhost:4200/?mode=player&room=ROOMCODE`

Notes:

- `npm start` uses Angular dev proxy (`proxy.conf.json`) so `/socket.io` forwards to `localhost:3001`.
- If server is not running, share/session features fail.

### Quick Start (Production)

Build and run the Node server:

```bash
npm run prebuild
npx ng build --configuration production
node server.js
```

In production, `server.js` serves:

- Socket server (`/socket.io`)
- Health endpoint (`/health`)
- Built Angular app from `dist/...`

## Deep Dive

## 1. Runtime Architecture

### Frontend stack

- Angular standalone components (no NgModule-based app shell).
- Bootstrap + ng-bootstrap UI.
- Socket.IO client for real-time GM/player sync.

Main entry points:

- `src/main.ts`: bootstraps `AppComponent`.
- `src/app/app.component.ts`: selects mode via query param:
  - `mode=player` => `PlayerViewComponent`
  - default => `BattleTrackerComponent`

### Styling architecture

Global stylesheet is `src/styles.scss` (loaded before `bootstrap.min.css`),
plus one encapsulated stylesheet per component.

**`--ui-*` sizing tokens.** All control geometry — height, horizontal padding,
font size — comes from CSS custom properties declared once on `body` at the top
of `src/styles.scss` (`--ui-control-h`, `--ui-control-pad-x`,
`--ui-control-font`, their `-sm`/`-xs` tiers, `--ui-icon-btn-w`, `--ui-gap`,
`--ui-participant-border`, `--ui-cm-cell`, …). `.btn`, `.form-control`,
`.form-select` and `.input-group-text` consume them in one global rule, so a
button and the input beside it are the same height by construction. Two rules
govern this:

1. A theme/skin layer may override token **values** only. It must never set
   `padding`, `height`, `min-height` or `font-size` directly on `.btn` or
   `.btn-sm`.
2. No bare element selectors (`div`, `tr`, `td`, `span`, `button`, `input`) in
   any component stylesheet — always a class. A bare `div { padding }` rule
   used to apply to every div in the GM view and was the main source of that
   view's inconsistent vertical rhythm.

Component CSS must not hard-code a control height; it consumes the tokens. The
`--dice-*` tokens do the same job for the dice roller's palette.

**One theme, no switcher.** The app used to ship three skins (default /
vintage / cyberdeck) selected from a navbar button group, a `?skin=` query
param and a `battle-tracker-skin` localStorage key, each applying a `skin-*`
class to `<body>`. Cyberdeck is now the app's **only** visual theme and there is
no user-facing skin choice: default and vintage are deleted, the switcher is
gone, and the former `body.skin-cyberdeck ...` rules are the unconditional base.
Nothing sets a class on `<body>` any more. Those rules keep a `:root body`
prefix purely to preserve the specificity the skin class used to carry — Angular
compiles component CSS to `.x[_ngcontent-*]`, so a bare `body .x` prefix would
lose contests these global rules are meant to win.

**Duplication between the two view stylesheets (Open Decision 4).**
`battle-tracker.component.css` and `player-view.component.css` intentionally
contain ~18 byte-identical blocks (`.action-item-*`, `.economy-*`,
`.log-*`, `.twirly`, the `::ng-deep .log-keyword-*` rules, …). Angular's
emulated view encapsulation means neither copy can see the other's component,
so the duplication cannot be removed by deleting one copy. Each block is marked
`DUPLICATED (Open Decision 4)` in both files. **Edit both copies together and
keep them byte-identical.** Do not hoist either copy into `styles.scss` without
re-deciding Open Decision 4 — that changes encapsulation and specificity and
leaks into the other view.

**GM details panel.** `.detailsBar` is a normal grid column
(`col-12 col-lg-3`), not a fixed-position overlay. At `lg` and up it is also
`position: sticky` so it stays on screen while the GM scrolls a long
participant list; below `lg` it stacks under the list and is `position: static`.

**Note:** `.player-participant` (player view) draws no border. It deliberately
does not mirror the GM view's `.participant`, which keeps its
`--ui-participant-border` because that border doubles as the `.selected`
highlight. The theme rules in `styles.scss` are split accordingly.

### Backend/session server

`server.js` is an Express + Socket.IO server.

Responsibilities:

- Create/join/close GM rooms.
- Player joins rooms.
- Relay:
  - shared state snapshots,
  - log entries,
  - command events.
- Keep room state in memory, and persist it once a room has content (see
  "Room data directory (durable rooms)").
- Serve Angular static files in production.

Session storage:

```ts
Map<roomCode, {
  state: SharedCombatState | null;
  log: SharedLogEntry[];
}>
```

## 2. Domain Model (Combat Engine)

Core classes:

- `src/Combat/CombatManager.ts`
- `src/Combat/Participants/Participant.ts`
- `src/Combat/Participants/ParticipantList.ts`
- `src/Combat/ActionHandler.ts`
- `src/InterruptTable.ts`

### Participant initiative

Each participant has:

- `baseIni`
- `diceIni` (rolled value)
- `dices` (number of d6)
- wound modifier (`wm`)
- action initiative modifiers from interrupt/action history

Current initiative formula (`Participant.getCurrentInitiative()`):

```text
diceIni + baseIni - wm - (initiativePass - 1)*10 + actionIniModifier
```

Where:

- `wm` is derived from physical/stun damage and pain tolerance.
- `actionIniModifier` is sum of applied interrupt/action modifiers.

### Status lifecycle

`StatusEnum`:

- `Waiting`
- `Active`
- `Delaying`
- `Finished`
- `OOC`

`CombatManager` transitions participants through action phases by:

- finding highest initiative waiting actors,
- marking them active,
- finishing them on action,
- advancing pass/turn when no active actors remain.

### Tie-break behavior

Sorting uses a custom comparator in `BattleTrackerComponent`:

1. Total current initiative (with edge/ooc offsets from existing model behavior)
2. Edge rating
3. Reaction
4. Intuition
5. Random tie-break seed
6. Sort order fallback

When multiple current actors still tie, `enforceSingleCurrentActor()` keeps exactly one active actor (top-ranked).

## 3. GM UI Behavior

File: `src/app/battle-tracker/battle-tracker.component.ts` + `.html` + `.css`

### Initiative prep flow (before combat turn starts)

`Start Combat Turn`:

- If no pending rolls -> starts combat turn immediately.
- If pending rolls exist:
  - enters initiative prep mode,
  - requests player roll submissions (if needed),
  - shows pending counts and action buttons.

Prep actions:

- `Request Player Rolls`
- `Roll Remaining Non-Player`
- `Force Roll Outstanding` (confirmation required)
- `Begin Combat Turn` (enabled only when no pending rolls)

### Act/Delay/Interrupt

- `Act` opens modal action planner.
- `Delay` sets status delaying and advances when needed.
- `Interrupts` use `ActionHandler.coreInterrupts` from `InterruptTable`.

Interrupts currently:

- Full Defense (-10, persistent)
- Block (-5)
- Parry (-5)
- Dodge (-5)
- Hit the Dirt (-5)
- Intercept (-5)

### Action planner validation

Rules enforced in GM and Player planners:

- Max 1 Free action selection.
- Max 2 Simple actions.
- Max 1 Complex action.
- Complex cannot be combined with Simple.
- Max one Simple attack action per action phase.
- `Call a Shot` requires a compatible attack action.
- `Multiple Attacks` requires a compatible action.
- Explicit conflict map (for example `Quick Draw` vs `Ready Weapon`).

### Claims and ownership

GM can toggle each participant:

- `Claimable` or `Private`

Players can only claim `Claimable` participants that are unowned.

**Out-of-action (downed) characters.** A downed participant is normally
withheld from the wire entirely, so players learn nothing about a downed NPC.
The one deliberate exception: a downed **claimable** participant (a player
character) is still broadcast, carrying `ooc: true`
(`SharedParticipantState.ooc`, `src/app/services/session-sync.service.ts`), so
its owner can see and reclaim it while it is down instead of it silently
disappearing until the GM revives it. It is excluded from the player's
initiative order regardless (`visibleParticipants` in
`player-view.component.ts`), still offered for claim
(`unclaimedParticipants`), still shown as the player's own if they already own
it (`ownParticipants`/`primaryCharacter`), badged "OUT OF ACTION" wherever it
appears, and every action control (`canAct`/`canDelay`/`canInterrupt`) is
forced off for it — claimable does not mean playable. A GM rejoining a
persisted room gets it back downed, never silently revived
(`restoreFromSharedState`/`buildRestoredParticipant`,
`battle-tracker.component.ts`). See `ARCHITECTURE.md` §7,
"Session sync and its effect on combat state", for the full mechanism
(`isClaimableOrOwnedOoc`, `oocOwnership`).

## 4. Player UI Behavior

File: `src/app/player-view/player-view.component.ts` + `.html` + `.css`

### Join flow

Player opens player mode and:

1. Enters room code (or uses prefilled query param).
2. Joins room.
3. If they do not own a character:
  - claim an unclaimed claimable character, or
  - create a new character.

Player identity is a generated token for the browser tab session:

```text
pl-xxxxxxxx
```

No login/auth is used.

### Visibility restrictions

Players can see:

- initiative order,
- own initiative score,
- action log.

Players cannot see:

- full condition monitor/stats editor panel from GM UI,
- others’ numeric initiative scores.

### Roll prompts

GM `request_rolls` command shows player roll prompt.
GM `clear_roll_prompt` command hides prompt (for example after force-roll).

## 5. Shared State + Command Protocol

Socket contract is implemented by:

- server: `server.js`
- client service: `src/app/services/session-sync.service.ts`

### Core events

GM/session:

- `gm:create-session`
- `gm:join-session` — also how a reconnected GM tab re-authenticates after a
  server restart. The state it returns is deliberately *ignored* on that path:
  the GM tab pushes its own state instead (see §"Reconnect" below).
- `gm:close-session` — **leave** the room. Everyone is disconnected; the room
  and its persisted file stay, and the code is still joinable.
- `gm:end-session` — **destroy** the room: in-memory session and persisted file
  both deleted, the code stops resolving. GM-confirmed in the UI.

Shared sync:

- `session:update-state`
- `session:state`
- `session:update-gm-state` — GM-only, write-only, never broadcast (spec
  "GM reconnect state loss"). Carries damage, Condition Monitor shape,
  out-of-action combatants, turn state and committed interrupts, alongside the
  player-facing `session:update-state`. Stored as `session.gmState` and
  returned only in the `gm:join-session`/`gm:create-session` acks — no room
  broadcast, no `session:state`-style fan-out. Payload cap 64 KB, same as
  `session:update-state`; a schema failure or oversize payload is refused via
  `session:error` with `invalid-payload: gmState` / `payload-too-large:
  gmState` — and, since the adversarial review round 2026-08-19 (defect D7),
  the room's stored `session.gmState` is CLEARED to `null` rather than left
  holding its previous value, so a refused push cannot silently drift out of
  sync with `session.state`. Validation (`server/gm-state-channel.js`) is a
  small pure module, in the same shape as `room-guards.js`/`session-store.js`.
- `session:append-log`
- `session:log-entry`
- `session:command`
- `session:closed` — payload carries `persisted: true` for a close, `false` for
  an end.
- `session:error` — a guarded emit was refused (bad role, bad schema, oversize
  payload, or a room this socket does not belong to). The GM tab listens for this
  and shows a banner; the most common cause is a reconnected socket that has not
  re-authenticated yet.

**Room ownership is checked in one place, for all of these.** Every event whose
payload names a `room` goes through `authorizeRoomPacket()`
(`server/room-guards.js`), installed as a `socket.use` middleware in `server.js`
so it runs before any handler — including handlers not written yet. Only the
three events that *assign* membership (`gm:create-session`, `gm:join-session`,
`player:join`) are exempt. Refusal reasons, in order: `invalid-payload`
(`gm:join-session`/`player:join` only — an absent/`null`/non-object payload,
checked before anything else so it cannot reach the destructuring that used to
crash the process), `invalid-room-code`, `role-required: …`, `room-mismatch`,
and for the two lifecycle events a "room not found" ack ahead of the role
check. `session:append-log` is GM-only, same as `session:update-state` (round
5, P2-3) — no player client legitimately posts a log entry directly, every
player-originated line reaches the wire through `session:command` instead.
Individual handlers deliberately do **not** repeat the check; that duplication
is how `session:command` ended up with none, which let a socket aim
`act`/`delay`/`interrupt`/`claim_character` at any room code it guessed and
have that room's GM tab apply it. Close and End also clear
`socket.data.room`/`role` on every socket attached to the room, not just its
Socket.IO membership — otherwise a second GM tab could recreate an ended room.
Note this choke point only covers events whose payload names a room; it does
not, by itself, stop an unrelated future handler from crashing on a malformed
payload — see ARCHITECTURE.md §7 "Crash containment" for the two things that
actually do (defensive `= {}` defaults, and a process-level
`uncaughtException` guard).
- `session:gm-presence` — `{ room, connected }`, emitted when the last GM socket
  leaves or the first one arrives. Drives the player view's "GM not connected"
  notice on a persisted room nobody is running.

### Reconnect

The transport reconnects on its own. What each side does next is not symmetric:

- **GM tab: push.** Re-emit `gm:join-session`, then re-broadcast local state via
  `syncSharedState()`. The GM's `CombatManager` is the source of truth and holds
  strictly more than the server's snapshot, so pulling would downgrade it.
- **Player view: pull.** Re-emit `player:join` and take whatever comes back;
  players hold no authoritative state.
- `restoreFromSharedState()` (pull) runs **only** on an explicit "Join Session",
  i.e. a fresh tab with nothing to lose.

"Nothing to lose" is decided by `liveEncounterRooms`, the set of room codes this
tab's encounter is the live source of truth for. Joining any of them pushes;
joining anything else with participants on screen prompts first, then pulls. The
set is additive, so **Create Player Session no longer breaks its own advice**:
after a mis-tap, rejoining the room that was live pushes the encounter back
rather than pulling the old room's snapshot over it. Note the push overwrites
that room's stored snapshot with what is on screen — which is the point, but it
is a push, not a merge. Membership is also refreshed continuously, not only at
join time: `syncSharedState()` re-fingerprints a room's roster on every
successful push (round 5), so a room this tab has been the truth for
throughout a long session with heavy roster churn never falsely reads as
"diverged" on a later Close+rejoin — see ARCHITECTURE.md §7 "Authority: who is
the truth for a room" for the full model.

**A join this tab cannot safely complete does not complete at all** (round 5,
fixing a defect where the GM was warned once — "nothing was sent to the
room" — and then the tab stayed connected anyway, so the very next click
pushed regardless). Two cases: the tab's on-screen roster has diverged from
what it last fingerprinted for that room (a wholesale cast swap with no push
in between), or the room's saved encounter is entirely out-of-action
participants and so cannot be restored. **Corrected (D-D, durable-rooms review
round 7): this paragraph used to describe round-5 behaviour that round 6
replaced — a full, load-bearing account of both cases, current as of round 6,
lives in `ARCHITECTURE.md` §7 ("What happens on a diverged rejoin…" and the
"Round 6 correction" that follows it); this section only summarises it so the
two documents cannot drift apart again.** In short: the divergence case is
decided client-side *before* `sessionSync.joinAsGm` is ever called, so a
refused diverged join never touches this tab's connection at all — nothing is
torn down and nothing needs restoring. The OOC-only case can only be discovered
*after* the switch has already happened server-side, so it is handled by
reversal instead: `abandonJoinAndRestore()` re-authenticates the same live
socket back to the room this tab was already running, on the existing
transport, restoring `shareRoomCode` and every listener together. The tab is
left fully disconnected (`sessionSync.disconnect()`, `shareRoomCode` cleared)
only if that reconnect attempt itself fails on a genuine network problem — not
as the ordinary outcome of either case — and the GM is told with an
error-level banner naming the room to rejoin. "End Room to replace it
outright" is not offered: destroying a room the GM may still want is exactly
the destructive-by-default behaviour this whole change (Open Decision 3)
removed.

Player:

- `player:join`

### Command types in use

From player to GM handler:

- `register_character`
- `claim_character`
- `release_claims`
- `roll_submission`
- `act`
- `delay`
- `interrupt`

From GM to players:

- `request_rolls`
- `clear_roll_prompt`

## 6. Logging

Two log systems exist:

- Local GM debug log (`LogHandler`) for non-shared operation.
- Shared room log (`sharedLogEntries`) synchronized by server.

Formatting highlights:

- action keywords (`Free:`, `Simple:`, `Complex:`, interrupts)
- initiative roll numbers
- physical/stun damage values
- healing values

Log list auto-scrolls to newest entries and flashes new entries briefly.

## 7. Deployment Notes

### Infrastructure

| Item | Value |
|---|---|
| Host | `xsvibes.com` (`146.190.245.110`) |
| SSH | `root@146.190.245.110` |
| Project path | `/var/www/sr5e` |
| Process manager | pm2 — app name `sr5e` |
| Reverse proxy | nginx → `http://127.0.0.1:3001` |
| TLS | Certbot / Let's Encrypt on `xsvibes.com` |
| Node | v22.22.0 |
| npm | 10.9.4 |
| Room data directory | `/var/www/sr5e/data/rooms` (override with `SR5E_DATA_DIR`) |
| Proxy trust | `SR5E_TRUST_PROXY=1` **required** behind nginx (see below); default is "no proxy". Set in the committed `ecosystem.config.js`, not a shell `export` — see "Deploying updates" |

### Room data directory (durable rooms)

Rooms are persisted as **one JSON file per room** — `<ROOM>.room.json`, written
atomically (temp file + `rename`) about a second after the last change, plus an
immediate flush on Close/End Room and on `SIGINT`/`SIGTERM` (so `pm2 restart` is
a zero-loss operation).

A room gets a file only once it has content — a state broadcast or a log entry.
Creating a room writes nothing. Expect no file for a room the GM opened and
never used.

That content check is a **backstop, not the bound**. `gm:create-session` needs no
credential, and a caller looping *create → `session:append-log` → repeat* gives
each new room legitimate content, so every write past the backstop is a write it
has no reason to refuse. Three bounds in `server/room-guards.js` close it
properly:

- **Creation is rate-limited.** At most 10 rooms per origin per 60s, plus a
  lifetime cap of 25 rooms per socket connection. A refused create replies
  `{ ok: false, reason }` and the GM's Share panel shows the wait.

  **`SR5E_TRUST_PROXY=1` is required in production, and is not the default.**
  Unset (or anything other than `1`/`true`/`yes`), the server ignores
  `X-Forwarded-For` entirely and keys on the raw socket remote address.

  - *Behind nginx, with `SR5E_TRUST_PROXY=1`*: the key is the entry
    `SR5E_PROXY_HOPS` back from the **rightmost**, defaulting to 1 hop. nginx's
    standard `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`
    *appends* the real peer to whatever the client sent, so the leftmost entry is
    chosen by the caller and keying on it made the limiter free to bypass (40
    sockets with distinct spoofed headers created 120 rooms with zero refusals).
    Counting back from the right gives the entry nginx itself wrote. If another
    proxy (a CDN, a second nginx) is put in front, raise `SR5E_PROXY_HOPS` to
    match or the key drifts back to attacker-controlled input.
  - *Not set*: counting back from the right is only sound if a proxy is really
    appending an entry. Reached directly — a dev box, an exposed droplet port, a
    misconfigured nginx — nothing is appended, so the rightmost entry is the
    caller's own again and the limiter was free to bypass (verified live: 20
    spoofed origins, 60 rooms, zero refusals; with the header ignored the same
    run is capped at 10).
  - *Forgetting to set it behind nginx* is safe but blunt: every socket shares
    the `127.0.0.1` key, so the 10-per-60s limit applies to the whole server and
    one busy GM can rate-limit another. Set it.
- **Total rooms are capped, and the cap evicts rather than locking out.** At
  `TOTAL_ROOM_CAP` (500) rooms — in-memory and restored-from-disk together — a
  new `gm:create-session` evicts the single **least recently active room that
  has nobody connected**, in memory and on disk, then proceeds:
  `[rooms] room cap 500 reached: evicted idle room ABC123 (no sockets connected, idle 812s)`.
  One room per create, never a batch. A room with any socket connected is never
  evicted, however idle it looks — that is a table mid-game. If all 500 are
  occupied the create is refused, logged as
  `[rooms] refused gm:create-session: room cap 500 reached (N rooms held, none evictable)`,
  and the GM is told every room is in use.

  The rate limit bounds the *rate* of creation; with indefinite retention only a
  cap bounds the *total*. 500 is far above real use (a table runs one room at a
  time), so eviction should never fire in a legitimate deployment — if it does,
  that is the signal to delete unused rooms (see "Clear one room" below) or raise
  `TOTAL_ROOM_CAP` in `server/room-guards.js`. **Eviction is permanent and there
  is no undo**: an evicted room's file is deleted, so the code stops resolving -
  but, unlike an End Room, it leaves a tombstone behind (round-4 defect D7):
  the affected GM's next `gm:join-session` for that code gets "Room ABC123 was
  removed on 2026-08-08 (removed to free capacity for a new room) and is no
  longer available" instead of a bare "Room not found" indistinguishable from a
  typo. An End Room leaves no marker - the GM was there and did it themselves,
  so no explanation is owed.
- **Unused rooms are reaped from memory.** A room created and never given any
  content is dropped from the server's `sessions` Map after 10 minutes, logged as
  `[rooms] dropped N unused empty room(s) from memory`. This is separate from the
  store's own housekeeping sweep, which is about files. It is safe for a GM still
  sitting in a reaped room: `session:update-state` recreates the room through
  `getOrCreateSession`, this time with content.

- Location: `data/rooms/` under the project path, or wherever `SR5E_DATA_DIR`
  points. It is **gitignored**, so `git pull` never touches it.
- Back it up by copying the directory: `tar czf rooms-$(date +%F).tgz data/rooms`.
- Clear one room: delete its `<ROOM>.room.json` (do this with the server
  stopped, or the in-memory copy will simply write it back).
- Clear everything: `pm2 stop sr5e && rm -rf data/rooms && pm2 start ecosystem.config.js`.
- Retention: **indefinite, with one exception** (round-4 defect D7: this used
  to read as unconditionally indefinite, which stopped being fully true once
  capacity eviction existed - see "Total rooms are capped" above). No room is
  ever removed for age. A room goes away when a GM uses **End Room**, which
  deletes the in-memory session and the file with no marker left behind - or,
  only at the hard room cap and only if it has nobody connected, when it is the
  single oldest room evicted to make room for a new one, which *does* leave a
  tombstone. Disk growth is bounded mainly at the *creation* end instead (see
  above), not by a TTL; capacity eviction is the last-resort backstop for the
  case that bound does not fully close. `lastActivity` is still recorded on
  every write, so the age of a room is known if the policy is ever revisited.
- A housekeeping sweep still runs at startup and every 24h, and is still logged
  (`[rooms] housekeeping sweep: retention is indefinite, removed 0 room(s) for
  age …`). All it does now is clear leftovers: the `<ROOM>.expired.json` markers
  written by the previous 30-day build (kept 30 days so an affected GM still gets
  "was removed on <date>" rather than a bare "Room not found"), and any marker
  that is corrupt.
- A truncated or hand-mangled room file is skipped at startup with a logged
  error — the server still boots and every other room still loads. As of
  review defect D10 (durable-rooms review round 6), the unreadable file is
  also renamed to `<ROOM>.corrupt.json` at that point, so it is not
  re-scanned, re-failed and re-logged on every future boot forever, and the
  room code it held is immediately reusable. Quarantined files are **not**
  swept automatically — they are kept in case the bytes are worth hand
  inspection or repair. Delete them yourself once you have confirmed there is
  nothing worth keeping: `rm data/rooms/*.corrupt.json`.
- A room code that was evicted for capacity (review defect D9, durable-rooms
  review round 6) cannot be handed out again to a new `gm:create-session`
  while its tombstone (`<ROOM>.expired.json`) still exists — `gm:create-session`
  regenerates past both an in-memory collision and a tombstoned code. Without
  this, a reconnecting GM whose room was evicted could, at roughly 1-in-2.2-billion
  odds, land in a stranger's freshly-created room of the same code and start
  pushing state over it.

### Deploying updates

From your local machine, push to GitHub:

```bash
git push origin main
```

Then SSH in and pull:

```bash
ssh root@146.190.245.110
cd /var/www/sr5e
git pull origin main
npx ng build
pm2 restart ecosystem.config.js --update-env
```

`npm install` is only needed if `package.json` changed.

**Always pass `--update-env`, every restart — the ecosystem file alone is not
enough** (P2-6 round 5, corrected as review defect D6, durable-rooms review
round 6: the round-5 text below was wrong and is kept struck-through so the
mistake and its correction are both on record). `pm2 restart <name-or-file>`
— **with or without** naming `ecosystem.config.js` — reuses whatever
environment pm2 already has stored for that process from the last time it was
started or explicitly updated; it does **not** re-read the `env` block out of
the ecosystem file on an ordinary restart. `--update-env` is the flag that
makes pm2 actually re-read it. Passing `ecosystem.config.js` on the command
line only matters for a **first** `pm2 start` (or after `pm2 delete`) — it
does nothing extra on a `restart` by itself.
~~Restarting against the committed file every time removes that failure
mode.~~ It does not — verified against pm2's own documented restart
semantics, not tested against a syntax that merely looked safer. Omitting
`--update-env` on a deploy that changed `ecosystem.config.js`'s `env` block
(or on the very first restart after adopting this file at all) silently keeps
serving the *previous* stored environment, which is exactly the
"server runs fine; it just silently falls back to 'no proxy' and mis-keys the
room-creation rate limit" failure this file exists to eliminate (see §9) —
just moved one flag later instead of removed.

**One-time migration for the existing droplet.** The droplet in the table
above was started as a bare `pm2 start server.js --name sr5e`, before
`ecosystem.config.js` existed — pm2 has never stored `SR5E_TRUST_PROXY`/
`SR5E_PROXY_HOPS` for that process at all, from any source, so even
`pm2 restart ecosystem.config.js --update-env` restarts a process whose
*current* stored environment has neither set. Do this once:

```bash
pm2 delete sr5e
pm2 start ecosystem.config.js
```

`pm2 start` (unlike `restart`) always reads the file fresh, so this both
adopts the committed environment for the first time and makes every future
`pm2 restart ecosystem.config.js --update-env` correct from then on. Confirm
it worked with `pm2 env sr5e` (or `pm2 show sr5e`) and check
`SR5E_TRUST_PROXY` is `1` — do this once after the migration and again after
any future change to `ecosystem.config.js`'s `env` block, since a deploy that
forgets `--update-env` fails exactly this silently.

### Static serving and socket same-origin

`server.js` serves Angular build and Socket.IO from same origin to avoid mixed-origin issues.

Static build path detection checks:

1. `dist/battle-tracker/browser`
2. `dist/browser`
3. `dist`

### CSP and production CSS

The app uses a strict CSP meta tag in `src/index.html`.

Production build setting in `angular.json` disables critical CSS inlining:

```json
“optimization”: {
  “styles”: {
    “inlineCritical”: false
  }
}
```

This avoids CSP conflicts with stylesheet `onload` patterns and prevents “unstyled” production pages.

### Health checks

- `GET /health` returns `{ “ok”: true }`

## 8. Security and Limitations

Current limitations:

- No authentication/authorization. Knowing a room code is the only credential;
  a persisted room stays joinable by that code until a GM ends it, or — only at
  the 500-room hard cap, and only if it has nobody connected — it is evicted to
  free capacity for a new one (retention is indefinite except for that one case;
  see "Room data directory" above). `gm:create-session` needs not even a room
  code, so it is bounded three ways instead: an empty room is memory-only until
  it has real content, creation is rate-limited per origin and per connection,
  and the total number of rooms held is hard-capped at 500, with unused rooms
  reaped from memory after 10 minutes. The content check alone was never
  sufficient — a create-loop that immediately gives each room content walks
  straight past it — and this document previously claimed otherwise.
  **The origin key for the rate limit is the rightmost `X-Forwarded-For` entry
  only when `SR5E_TRUST_PROXY=1` is set** (see "Room data directory" above,
  and 8's Infrastructure table) — that is a deliberately opt-in trust
  decision, not the default. Unset, the header is ignored entirely and the key
  is the raw socket remote address, which a caller genuinely cannot choose
  either, but which collapses to one shared key (`127.0.0.1`) for every socket
  behind a reverse proxy that does not set the flag — safe against spoofing,
  but blunt: one busy GM can rate-limit another until the operator sets the
  flag. Do not read this bullet as saying `X-Forwarded-For` is trusted by
  default; it is not.
- Log entries (`session:append-log`) are GM-only, same as state broadcasts
  (round 5, P2-3): a player-role socket used to be able to post a shared log
  line with an arbitrary `actor` field, including `"GM"` or another player's
  name — the schema check validates shape, not identity, and unlike
  `session:command` there is no player-identity field on this payload to
  check `actor` against. No legitimate player client ever sends this event, so
  the fix is restricting the role rather than adding an identity check that
  has nothing to compare against.
- `cors()` allows all origins on session server.
- Room state is persisted to disk (see "Room data directory" above), so it now
  survives a restart — and outlives the process. It is stored unencrypted, in
  plain JSON, readable by anyone with filesystem access.
- What is persisted is only the *last broadcast* snapshot plus the shared log.
  That snapshot has never carried damage/health, out-of-combat participants, or
  action history, so a GM resuming a room re-enters those by hand; the GM is
  told this at restore time.
- GM-local hidden log entries and this tab's own transient panel/selection
  state never leave the browser and are never persisted.
- Player identity is per-tab token, not account-based.

Before larger public use, consider:

- auth (GM + player identity),
- a queryable store (SQLite/Postgres) if room counts grow past a handful,
- role authorization on server commands,
- rate limits.

## 9. Where To Edit Things Quickly

### Add/rename declared actions and descriptions

- `src/app/shared/declared-actions.ts`

### Change interrupts and initiative costs

- `src/InterruptTable.ts`
- `src/Combat/ActionHandler.ts`

### GM initiative prep and turn start flow

- `src/app/battle-tracker/battle-tracker.component.ts`
  - `btnStartRound_Click`
  - `rollOutstandingInitiative`
  - `beginCombatTurn`
  - `updateInitiativePrepInfo`

### Claim flow and player command handling

- `src/app/battle-tracker/battle-tracker.component.ts`
  - `handleSessionCommand`
  - `upsertPlayerParticipant`
  - `getSharedParticipants`

### Session transport and socket errors

- `src/app/services/session-sync.service.ts`
- `server.js`

### Player UI restrictions and controls

- `src/app/player-view/player-view.component.ts`
- `src/app/player-view/player-view.component.html`

## 10. Suggested Next Improvements

- Persist rooms and participants to a datastore.
- Add reconnect-friendly player identity or authenticated login.
- Add server-side validation/authorization for commands.
- Add automated tests for:
  - tie-break ordering,
  - declared action validation,
  - claim/reclaim behavior.
