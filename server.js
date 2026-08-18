const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const {
  createSessionStore, createRoomCode, hasPersistableContent, ROOM_CODE_MAX_ATTEMPTS
} = require("./server/session-store");
const {
  createRoomCreationLimiter, creationOriginKey, roomCapReached, findEvictableRoom,
  authorizeRoomPacket, detachFromPreviousRoom, reapContentlessRooms,
  releaseAllClaimsOnBoot,
  SOCKET_ROOM_CREATE_LIMIT, TOTAL_ROOM_CAP, TRUSTED_PROXY_HOPS,
  CONTENTLESS_ROOM_TTL_MS, CONTENTLESS_SWEEP_INTERVAL_MS
} = require("./server/room-guards");

/**
 * Declared here, before `process.on("uncaughtException", ...)` reads it, and
 * assigned later at its old `const store = createSessionStore(...)` call site
 * (one known nit, durable-rooms review round 6). `typeof store` is normally
 * safe to call on an identifier that might not exist yet - but only for one
 * that was never declared with `let`/`const` at all. A `const` *is* declared
 * from the top of its enclosing scope, and reading it - even with `typeof` -
 * before its own initializer has run throws `ReferenceError: Cannot access
 * 'store' before initialization` (the temporal dead zone), not the "safely
 * undefined" behaviour `typeof` is normally reached for. A crash during the
 * module-level setup between this file's top and the old `const store = …`
 * line - a bad `require`, a `createSessionStore`/`createRoomCreationLimiter`
 * throw - hit exactly that: `typeof store !== "undefined"` threw instead of
 * evaluating false, was caught by the handler's own inner `catch`, and logged
 * "flush during crash handling also failed" for a store that was never even
 * reached, rather than skipping the flush cleanly. A plain `let`, initialized
 * to `null` immediately, is never in a temporal dead zone once the process
 * has started, so `typeof store !== "undefined"` (true) `&& store` (still
 * `null`, falsy) correctly skips the flush with no exception at all.
 */
let store = null;

/**
 * Process-level last-resort safety net (spec review round 5, P2-1).
 *
 * The room-ownership choke point (`authorizeRoomPacket`, `io.on("connection")`
 * below) closes the *authorization* hole it was built for, and every
 * room-scoped handler now destructures its payload with an `= {}` default
 * (round-4 D1's fix, widened round 5 to every such handler, not just the two
 * `ROOM_ENTRY_PAYLOAD_EVENTS`) so a missing/`null` payload no longer throws.
 * Neither of those is a *general* guarantee that no future listener - a Socket.IO
 * handler this file adds later, a library callback, anything synchronous -
 * can ever throw uncaught. Node does not catch a synchronous throw from an
 * `EventEmitter` listener; by default it kills the whole process, taking down
 * every room and every connected GM and player over one bad code path anywhere.
 *
 * Registered here, before any other module-level code runs, so it is in place
 * even if a crash happens during startup (store load, room-guards setup).
 *
 * **Deliberately exits rather than trying to keep serving** (documented choice,
 * not left implicit): a synchronous throw can leave a handler's mutation of
 * `sessions`, `socket.data` or the pending-write queue half-applied - there is
 * no way to know which, generically, at this level - so continuing risks
 * quietly persisting corrupted room state to every room touched afterward,
 * which is worse than a brief, visible outage. `store.beginShutdown()` is
 * synchronous (temp-file-then-rename writes, no async I/O in the write path),
 * so calling it here really does flush every pending debounced write before
 * `process.exit` - the same zero-loss guarantee `SIGTERM` gets, extended to a
 * genuine crash. Exit code 1 (not 0, unlike a clean `SIGINT`/`SIGTERM`) so pm2
 * and any process-level monitoring can tell a crash-restart from a deliberate
 * one. pm2 restarting the process is the intended recovery: durable rooms plus
 * the GM tab's reconnect-push (`handleSessionReconnected`, spec Open Decision 6)
 * already exist to make exactly this kind of restart a non-event for a live
 * table, so this handler's job is only to fail loudly and fail fast, not to
 * avoid the restart.
 */
process.on("uncaughtException", (err) => {
  console.error("[rooms] FATAL: uncaught exception - a listener threw synchronously. "
    + "Flushing pending room writes and exiting so the process manager can restart "
    + "cleanly, rather than continuing with sockets and in-memory state in an "
    + "unknown condition.", err);
  try {
    if (typeof store !== "undefined" && store) {
      store.beginShutdown();
    }
  } catch (flushErr) {
    console.error("[rooms] flush during crash handling also failed", flushErr);
  }
  process.exit(1);
});

// ── CORS origin allowlist ─────────────────────────────────────────────────────
// Set ALLOWED_ORIGINS to a comma-separated list of allowed origins, e.g.:
//   ALLOWED_ORIGINS=https://xsvibes.com,https://www.xsvibes.com
// Leave unset (or set to "*") to allow all origins (dev default).
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "*")
  .split(",").map(s => s.trim()).filter(Boolean);
const corsOrigin = ALLOWED_ORIGINS.length === 1 && ALLOWED_ORIGINS[0] === "*"
  ? "*"
  : ALLOWED_ORIGINS;

// ── Allowed session:command types ─────────────────────────────────────────────
// Add new types here as the client grows. Keep in sync with the Angular source.
// Player → GM:  register_character, configure_deck, claim_character,
//               release_claims, roll_submission, act, delay, interrupt, dice_roll
// GM → Players: request_rolls, clear_roll_prompt, combat_ended, dice_roll,
//               claim_denied
const ALLOWED_COMMAND_TYPES = new Set([
  "register_character",
  "configure_deck",
  "configure_astral",
  "claim_character",
  // GM -> players. A claim refused because the character already has an owner
  // used to be a silent no-op on both screens, which is unrecoverable at the
  // table after a stale owner survives a GM reconnect (durable-rooms review,
  // defect 1). Broadcast like every other command; the player view shows it only
  // to the token in `payload.requester`.
  "claim_denied",
  "release_claims",
  "roll_submission",
  "act",
  "delay",
  "interrupt",
  "dice_roll",
  "request_rolls",
  "clear_roll_prompt",
  "combat_ended",
]);

// ── Payload validators ────────────────────────────────────────────────────────
function isRoomCode(v) {
  return typeof v === "string" && /^[A-Z0-9]{6}$/.test(v);
}

function isSharedState(v) {
  return v && typeof v === "object"
    && typeof v.round === "number"
    && Array.isArray(v.participants);
}

function isSharedLogEntry(v) {
  return v && typeof v === "object"
    && typeof v.actor === "string"
    && typeof v.text === "string"
    && typeof v.timestamp === "string";
}

function isSessionCommand(v) {
  return v && typeof v === "object"
    && typeof v.type === "string"
    && typeof v.player === "string";
}

// ── Rejection helper ──────────────────────────────────────────────────────────
function reject(socket, event, reason) {
  socket.emit("session:error", { event, reason });
}

/**
 * Strip the GM-only `oocOwnership` shadow list before `state` reaches a
 * player - the room broadcast (`session:state`) or a `player:join` ack (D-G,
 * durable-rooms review round 7).
 *
 * `oocOwnership` exists so a rejoining GM's `reconcileOwnershipFromServer()`
 * can correct a stale local owner for a participant currently OOC (review
 * defect D2, round 6) - which token owns which out-of-action character.
 * Round 6 put it on `SharedCombatState` itself, which every room broadcast
 * reaches every socket in the room, GM and players alike; a plain
 * `player:join` ack was verified to return it too. Open Decision 4 already
 * weighed and explicitly rejected broadcasting the fuller per-participant
 * OOC shape to players on exactly this leak ground - round 6 reopened the
 * same tension one field at a time via a code comment rather than a spec
 * decision. The user's decision (round 7): keep the data - AC 5's revived-OOC
 * re-claim fix depends on it - but confine it to a channel only the GM's own
 * socket receives: the `gm:join-session`/`gm:create-session` ack, which is
 * per-socket, not room-broadcast. `session.state.oocOwnership` itself is left
 * intact in memory and on disk (`releasePlayerClaims` still needs to strip
 * ownership from it, and the GM's next `gm:join-session` still needs to read
 * it) - only the copy handed to a player-reachable channel is trimmed, and
 * only a shallow copy, so the stored object is never mutated by a broadcast.
 */
function playerFacingState(state) {
  if (!state || typeof state !== "object" || !("oocOwnership" in state)) {
    return state;
  }
  const { oocOwnership, ...rest } = state;
  return rest;
}

// ── Express + Socket.IO setup ─────────────────────────────────────────────────
const app = express();
app.use(cors({ origin: corsOrigin }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ["GET", "POST"]
  }
});

const sessions = new Map();

/**
 * Which room codes currently have at least one GM socket connected.
 *
 * Durable rooms make "the room exists but nobody is running it" an ordinary
 * situation, so players who join early (or after a GM's laptop closed) are told
 * "GM not connected" rather than being refused or shown a blank screen (spec
 * Open Decision 7). Presence is deliberately in-memory only - it describes live
 * sockets, not the room's stored history.
 */
const gmPresence = new Map();

// ── Durable room storage (spec briefs/persistent-rooms.md) ────────────────────
// One JSON file per room, atomic write, ~1s debounce, **indefinite** retention
// (Open Decision 5 as amended 2026-08-05) with one exception: at the hard room
// cap, the oldest unoccupied room may be evicted to make room for a new one
// (round-3 fix 4 / round-4 defect D7) - see `ROOM_EVICTION_REASON` below.
// Outside that, a room dies only when a GM ends it. Override the location with
// SR5E_DATA_DIR; the default sits outside the Angular build output so a
// `git pull` deploy never touches it.
const DATA_DIR = process.env.SR5E_DATA_DIR || path.join(__dirname, "data", "rooms");
// Assigns the `let store` declared near the top of this file - see that
// declaration's doc comment for why this is not `const`.
store = createSessionStore({ fs, path, dir: DATA_DIR });

/**
 * The one exception to indefinite retention (spec AC 11, amended; round-4
 * defect D7): at the hard room cap, the single oldest unoccupied room may be
 * evicted to make room for a new one. Recorded on the tombstone `evictOneRoomForCapacity`
 * writes, so a later `gm:join-session` for that code can say why, via
 * `roomNotFoundReason`, instead of a bare "Room not found".
 */
const ROOM_EVICTION_REASON = "removed to free capacity for a new room";

// ── Unauthenticated room-creation bounds (spec AC 16) ─────────────────────────
// `hasPersistableContent` only ever stopped a *single* contentless room reaching
// the disk; a create-loop that gives each room content immediately walked
// straight past it. These two bound the real thing: the limiter bounds the disk
// (a room cannot get content before it is created), the reaper bounds the Map.
const roomCreateLimiter = createRoomCreationLimiter();

/**
 * Rate-limit key for an unauthenticated caller.
 *
 * Behind the nginx reverse proxy every socket's `handshake.address` is
 * 127.0.0.1, so `X-Forwarded-For` is what actually distinguishes callers - but
 * nginx's standard `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`
 * *prepends* whatever the client sent, so the leftmost entry is chosen by the
 * client and keying on it made the limiter free to bypass (review defect D1).
 * `creationOriginKey` counts `SR5E_PROXY_HOPS` entries back from the right
 * instead - with the documented single-nginx deployment that is the entry nginx
 * itself appended.
 *
 * Trusting the header is **opt-in** (`SR5E_TRUST_PROXY=1`), not opt-out
 * (round-3 fix 3). Counting back from the right only works if a proxy is really
 * appending an entry; reached directly - a dev box, an exposed droplet port, a
 * broken nginx - nothing is appended, so the rightmost entry is again whatever
 * the caller typed and the limiter was free to bypass. Unset means "no proxy":
 * ignore the header entirely and key on the raw socket remote address. Either
 * way `SOCKET_ROOM_CREATE_LIMIT` applies per connection and is not spoofable.
 *
 * Operators behind nginx must set `SR5E_TRUST_PROXY=1` (see
 * docs/APP_DOCUMENTATION.md); without it every socket shares the 127.0.0.1 key
 * and one busy GM can rate-limit another.
 */
const TRUST_PROXY = /^(1|true|yes)$/i.test(String(process.env.SR5E_TRUST_PROXY || ""));
const PROXY_HOPS = Number(process.env.SR5E_PROXY_HOPS || TRUSTED_PROXY_HOPS);
function creationKey(socket) {
  return creationOriginKey({
    headers: (socket.handshake && socket.handshake.headers) || {},
    trustProxy: TRUST_PROXY,
    proxyHops: PROXY_HOPS,
    address: socket.handshake && socket.handshake.address,
    socketId: socket.id
  });
}

/**
 * Detach a socket from the room it was previously in (review defect D2). The
 * policy lives in `server/room-guards.js` so it is testable; this is the
 * server-side wiring of its two hooks.
 */
function detachSocketFromPreviousRoom(socket, nextRoom) {
  return detachFromPreviousRoom(socket, nextRoom, {
    // Cleared before the leave, so the room's remaining members get the flip.
    clearGmPresence: (previous, socketId) => setGmPresence(previous, socketId, false),
    // Round-4 defect D4: `player:join` never left its previous room at all,
    // so a player who joined room A, claimed a character, then joined room B
    // stayed a Socket.IO member of A (a cross-room broadcast leak) and left
    // A's claim permanently orphaned - nothing would ever release it, because
    // by the time this socket disconnects `socket.data.room` is B, not A.
    // Releasing here, at the moment this socket stops being "in" the previous
    // room, closes both: it is the same claim-release `releasePlayerClaims`
    // already performs for a genuine disconnect, reused for a room switch.
    releasePlayerClaim: (previous, playerName) => releasePlayerClaims(previous, playerName)
  });
}

function getOrCreateSession(room) {
  if (!sessions.has(room)) {
    sessions.set(room, {
      state: null,
      log: [],
      lastActivity: Date.now(),
      // Stamped so `reapContentlessRooms` can prove a room is both empty and
      // old before dropping it (spec AC 16). Rooms restored from disk have no
      // stamp and are never reaped - they always have content by definition.
      createdAt: Date.now()
    });
  }
  return sessions.get(room);
}

/**
 * The one place a room's persisted copy is marked dirty.
 *
 * There are **five** callers, not three (review defect D3, durable-rooms
 * review round 6 - the count drifted twice already as handlers were added,
 * which is exactly what this comment exists to stop happening a third time):
 * `session:update-state`, `session:append-log`, the in-place `ownerName`
 * strip in `releasePlayerClaims` (itself reached from a genuine disconnect,
 * `evacuateRoom`, and `detachSocketFromPreviousRoom` - one call site, three
 * triggers), `gm:join-session` (so a room's `lastActivity` and persisted copy
 * both advance on a bare rejoin, not only on the next write), and
 * `gm:close-session` (an immediate flush point, spec Open Decision 2). They
 * all come through here so a further site added later cannot quietly skip
 * persistence (spec, Proposed approach part 1). If a handler is added that
 * calls this, update the count here, in `releasePlayerClaims`'s doc comment,
 * at each of the five inline `write site N of 5` markers below (D-H,
 * durable-rooms review round 7: an earlier version of this comment said
 * "both", which was never true - there have always been five, not two), in
 * `server/session-store.js`'s matching comment and in `ARCHITECTURE.md`
 * §7 - or better, do not trust any of those to stay in sync by hand: grep
 * this file for `touchSession(` and count.
 */
function touchSession(room) {
  const session = sessions.get(room);
  if (!session) {
    return;
  }
  store.touch(room, session);
}

/**
 * Release every claim `playerName` holds in `room`: strip `ownerName` from
 * any claimable participant they own, persist (write site 3 of 5 - see
 * `touchSession`'s doc comment for the full count) and rebroadcast, so a
 * returning player can re-claim cleanly.
 *
 * Factored out of the `disconnect` handler (round-4 defect D2) so `evacuateRoom`
 * and `detachSocketFromPreviousRoom` can reuse the exact same release instead
 * of growing their own copies that could drift. Previously only a genuine
 * socket `disconnect` released a claim, which required `socket.data.room` and
 * `socket.data.playerName` to still be set at that moment - both `gm:close-
 * session`/`gm:end-session` (via `evacuateRoom`) and `player:join` switching
 * rooms (via `detachSocketFromPreviousRoom`) used to clear those fields
 * *without* releasing first, leaving the claim "owned" by a token that could
 * never disconnect from that room again - permanently, under indefinite
 * retention.
 *
 * **Also covers `state.oocOwnership`** (review defect D2, durable-rooms review
 * round 6). `state.participants` never includes an out-of-action participant
 * (`getSharedParticipants` filters them client-side), so a claim on an OOC
 * character used to survive a disconnect-driven release entirely - the
 * server had nothing to strip it from. `oocOwnership` is the minimal
 * ownership-only shadow the GM tab now also broadcasts for claimed/claimable
 * OOC participants specifically so this function has something to release
 * even while they are out of action; without this, a claim on a downed
 * character released here would still come back stale the moment the GM
 * revives them and pushes a fresh state (`reconcileOwnershipFromServer`
 * would see an already-cleared `state.oocOwnership` entry and correctly
 * clear the local cache too, but only if *this* strip also happened - see
 * `battle-tracker.component.ts`'s doc comment on `reconcileOwnershipFromServer`
 * for the client half of this fix).
 *
 * @returns {boolean} whether anything actually changed
 */
function releasePlayerClaims(room, playerName) {
  const session = sessions.get(room);
  const participants = session?.state?.participants;
  const oocOwnership = session?.state?.oocOwnership;
  if (!Array.isArray(participants) && !Array.isArray(oocOwnership)) {
    return false;
  }
  let changed = false;
  if (Array.isArray(participants)) {
    session.state.participants = participants.map((participant) => {
      if (participant.claimable === true && participant.ownerName === playerName) {
        changed = true;
        return {
          ...participant,
          ownerName: undefined
        };
      }
      return participant;
    });
  }
  if (Array.isArray(oocOwnership)) {
    session.state.oocOwnership = oocOwnership.map((entry) => {
      if (entry.claimable === true && entry.ownerName === playerName) {
        changed = true;
        return {
          ...entry,
          ownerName: undefined
        };
      }
      return entry;
    });
  }
  if (changed) {
    touchSession(room);
    io.to(room).emit("session:state", playerFacingState(session.state));
    io.to(room).emit("session:command", {
      type: "release_claims",
      player: playerName,
      payload: {},
      timestamp: new Date().toISOString()
    });
  }
  return changed;
}


function gmSocketsFor(room) {
  if (!gmPresence.has(room)) {
    gmPresence.set(room, new Set());
  }
  return gmPresence.get(room);
}

function isGmConnected(room) {
  const sockets = gmPresence.get(room);
  return !!sockets && sockets.size > 0;
}

function setGmPresence(room, socketId, present) {
  const sockets = gmSocketsFor(room);
  const before = sockets.size > 0;
  if (present) {
    sockets.add(socketId);
  } else {
    sockets.delete(socketId);
  }
  const after = sockets.size > 0;
  if (before !== after) {
    io.to(room).emit("session:gm-presence", { room, connected: after });
  }
}

/**
 * Reason text for a room lookup that failed. A room removed by the *previous*
 * 30-day-retention build left a marker behind, so "removed" stays
 * distinguishable from a mistyped code (spec scenario S5). An explicit End
 * Room deletes any marker too, so it always reads as a bare "Room not found" -
 * the GM was there and did it themselves, so no explanation is owed.
 *
 * A room dropped by capacity eviction (round-4 defect D7) *does* leave a
 * marker with a `reason`, since eviction happens to a GM who was not there to
 * see it: "Room not found" alone is indistinguishable from a typo, and the
 * whole point of a tombstone is to tell the two apart.
 */
function roomNotFoundReason(room) {
  const expiry = store.expiryOf(room);
  if (expiry) {
    const when = new Date(expiry.expiredAt).toISOString().slice(0, 10);
    const why = expiry.reason ? ` (${expiry.reason})` : "";
    return `Room ${room} was removed on ${when}${why} and is no longer available.`;
  }
  return "Room not found";
}

/**
 * Is any socket still attached to this room, by either measure?
 *
 * Socket.IO membership and `socket.data.room` are two different facts and they
 * can disagree - `socketsLeave()` clears the first and not the second, which is
 * exactly the bug `evacuateRoom` exists to fix. Anything that asks "is this room
 * in use" has to consider both, or it will happily evict a room a GM is still
 * logically sitting in.
 */
function roomHasConnectedSockets(room) {
  const members = io.sockets.adapter.rooms.get(room);
  if (members && members.size > 0) {
    return true;
  }
  for (const socket of io.sockets.sockets.values()) {
    if (socket.data && socket.data.room === room) {
      return true;
    }
  }
  return false;
}

/**
 * Detach **every** socket from a room that is being closed or ended
 * (round-3 fix 2).
 *
 * `socketsLeave()` alone was not enough. It clears Socket.IO membership but
 * leaves `socket.data.room` / `socket.data.role` set on every *other* socket in
 * the room - and `socket.data.room` is what the room-ownership rule authorises
 * against. So a second GM tab still attached to an "ended" room passed every
 * check afterwards, and its next broadcast ran `getOrCreateSession` and
 * recreated the room in memory and (on the next `touchSession`) on disk. With
 * indefinite retention that resurrection is permanent: the GM's "delete this
 * room" never actually happened. Live-reproduced with two GM sockets.
 *
 * Clearing role as well as room is deliberate: a socket with `role: "gm"` and no
 * room is inert (every guarded event names a room), but leaving the role set
 * would let it call `gm:create-session` under a stale identity.
 *
 * Not undoable, by design - it is the server side of two actions that are
 * themselves final (Close leaves the room; End destroys it). The GM's recovery
 * after a mis-tapped Close is to rejoin the code, which re-authenticates the
 * socket and restores exactly this state.
 *
 * Every departing player's claims are released *before* `playerName` is
 * cleared (round-4 defect D2). The `disconnect` handler is the only other
 * place a claim is released, and it needs `socket.data.room` /
 * `socket.data.playerName` still set at the moment it runs - both of which
 * this function used to blank out first. A player who was evacuated by a
 * Close or an End could therefore never have their claim released by a later,
 * genuine tab-close: `socket.data.playerName` was already gone, so the
 * `disconnect` handler's `if (!room || !playerName) return;` guard bailed out
 * every time, leaving the claim "owned" by a dead token forever under
 * indefinite retention (live-reproduced: claim, Close Room, close the tab -
 * the claim never came back). Releasing first, using the same
 * `releasePlayerClaims` the `disconnect` handler calls, means evacuation now
 * has the same effect on a claim that an ordinary disconnect always did.
 *
 * **Release happens before `socketsLeave()`** (durable-rooms review round 5,
 * Part 1, Symptom A). `releasePlayerClaims` broadcasts `session:state` and a
 * `session:command release_claims` to `io.to(room)` - Socket.IO's own room
 * roster. Emitting that *after* every socket, including the GM's own, has
 * already left the room via `socketsLeave()` sends both broadcasts to nobody:
 * the GM tab's local `participantOwners` cache never learns the claim was
 * released, and a later rejoin's push (`btnJoinShareSession_Click`,
 * `holdsLiveEncounterFor()` true) re-asserts the stale owner right back onto
 * the server - live-reproduced: server state after Close was
 * `[["p1","ABSENT"]]`, then `[["p1","tok-old"]]` again after the GM tab's own
 * rejoin push. Releasing while sockets are still members closes that: the
 * broadcasts land on every socket that is about to be evacuated, including
 * this room's own GM tab if it is still connected, exactly as they would for
 * a live, mid-session claim release. `detachFromPreviousRoom()` in
 * `server/room-guards.js` (the round-4 D4 room-switch path) already released
 * before leaving for the same reason; this unifies the two so the same
 * operation is never ordered two different ways.
 *
 * The GM tab is not the *only* backstop against a stale push, deliberately:
 * `reconcileOwnershipFromServer()` in `battle-tracker.component.ts` corrects
 * the tab's ownership cache from the server's returned state on every
 * (re)join too, so even a tab that was disconnected at the exact moment this
 * function ran (and so never received the broadcast at all) self-heals on its
 * next successful join rather than depending on this ordering being perfect
 * forever.
 *
 * **In fact, for the closing GM's own tab, `reconcileOwnershipFromServer()`
 * is not merely a backstop - it is the thing that actually does the work**
 * (review defect D5, durable-rooms review round 6). Live-observed: the
 * closing tab's own socket receives only the `gm:close-session` ack; the
 * `session:closed` / `session:state` / `session:command release_claims`
 * broadcasts this function emits above land in the same tick as that ack, and
 * the tab's ack handler (`btnCloseShareSession_Click`) calls
 * `sessionSync.disconnect()` immediately, before ever processing them. Any
 * *other* GM tab still in the room disconnects on `session:closed` first and
 * misses the same broadcasts for the same reason. The reordering above is
 * still correct and still worth keeping (the release persists to disk either
 * way, and a player socket that is not about to disconnect itself does
 * receive it) - just do not mistake it for the fix that makes a GM's own
 * rejoin come back with correct ownership. That is `reconcileOwnershipFromServer()`.
 *
 * @returns {number} how many sockets were detached
 */
function evacuateRoom(room) {
  let detached = 0;
  const departingPlayers = new Set();
  for (const socket of io.sockets.sockets.values()) {
    if (socket.data && socket.data.room === room) {
      if (socket.data.role === "player" && socket.data.playerName) {
        departingPlayers.add(socket.data.playerName);
      }
      detached++;
    }
  }
  // Release + broadcast BEFORE anyone leaves the Socket.IO room - see the
  // doc comment above (Symptom A).
  for (const playerName of departingPlayers) {
    releasePlayerClaims(room, playerName);
  }
  for (const socket of io.sockets.sockets.values()) {
    if (socket.data && socket.data.room === room) {
      socket.data.room = undefined;
      socket.data.role = undefined;
      socket.data.playerName = undefined;
    }
  }
  io.in(room).socketsLeave(room);
  gmPresence.delete(room);
  return detached;
}

/**
 * Make room for one more room when the hard cap is hit (round-3 fix 4).
 *
 * `TOTAL_ROOM_CAP` used to be a permanent lockout: with indefinite retention
 * nothing ever removed a room, so once the cap was reached every
 * `gm:create-session` was refused forever with no in-app recovery. Now the cap
 * evicts exactly one room - the least recently active room that **nobody is
 * connected to** - and lets the create through. If every room is occupied there
 * is nothing safe to evict and the create is still refused, loudly.
 *
 * Eviction deletes the persisted file too. Dropping only the in-memory copy
 * would leave the file to be restored on the next boot, putting the server
 * straight back at the cap. It leaves a tombstone behind instead of a bare
 * delete (round-4 defect D7): eviction happens to a GM who was not there to
 * see it, so their next `gm:join-session` should say why the room is gone
 * (`roomNotFoundReason`), not just that it is.
 *
 * @returns {boolean} true if a room was evicted and the create may proceed
 */
function evictOneRoomForCapacity() {
  const victim = findEvictableRoom(sessions, { hasConnectedSockets: roomHasConnectedSockets });
  if (!victim) {
    return false;
  }
  const session = sessions.get(victim);
  const idleMs = session && Number.isFinite(Number(session.lastActivity))
    ? Date.now() - Number(session.lastActivity)
    : NaN;
  sessions.delete(victim);
  gmPresence.delete(victim);
  store.evict(victim, ROOM_EVICTION_REASON);
  console.warn(`[rooms] room cap ${TOTAL_ROOM_CAP} reached: evicted idle room ${victim} `
    + `(no sockets connected, idle ${Number.isFinite(idleMs) ? Math.round(idleMs / 1000) + "s" : "unknown"})`);
  return true;
}

/**
 * Answer a packet the room-ownership rule refused.
 *
 * The ack callback matters as much as the `session:error`: the GM client awaits
 * `closeSession`/`endSession` with a timeout, so a silently dropped packet would
 * read as a network failure rather than a refusal.
 */
function refuseRoomPacket(socket, event, args, verdict) {
  const cb = args.length > 0 && typeof args[args.length - 1] === "function"
    ? args[args.length - 1]
    : null;
  const reason = verdict.notFound ? roomNotFoundReason(verdict.room) : verdict.reason;
  reject(socket, event, verdict.reason);
  if (cb) {
    cb({ ok: false, reason });
  }
}

io.on("connection", (socket) => {
  /**
   * **The one room-ownership choke point** (round-3 fixes 1 and 2).
   *
   * Registered before any handler, so every inbound packet on this socket is
   * checked whether or not its handler remembers to. `authorizeRoomPacket`
   * treats any event whose payload carries a `room` as room-scoped by default,
   * so a handler added later cannot reopen the `session:command` **cross-room
   * authorization** hole by forgetting to opt in - it would have to opt out on
   * purpose.
   *
   * **What this does not guarantee (round-4 review defect D1's narrower fix,
   * corrected round 5 after that guarantee was probed and found false):**
   * an event this choke point does not recognise as room-scoped at all - one
   * with no `room` property on its payload, including an absent/`null`/
   * non-object payload - passes through untouched, `{ ok: true }`, exactly as
   * it would for any other non-room event (`disconnect`, a future
   * `future:x` nobody has written yet). If *that* future handler then
   * destructures `{ room }` from its own first argument with no default, an
   * emit with no payload reaches it as `undefined`/`null` and throws exactly
   * the way `gm:join-session`/`player:join` used to (round-4 D1) - this
   * middleware cannot prevent a crash in code it has no way to know the shape
   * of. The actual defence against that is two-layered, not one: every
   * handler below that destructures a room-scoped payload has an `= {}`
   * default (belt), and `process.on("uncaughtException", ...)` below is the
   * last-resort braces for a handler that does not. Do not extend this
   * comment's authority claim back to "no future handler can ever crash the
   * process" - it was written that way once and was wrong.
   *
   * A refused packet is answered and dropped (`next()` is not called). It is
   * deliberately not turned into a middleware error: socket.io would send an
   * `error` packet and the GM would lose the connection over one bad emit.
   */
  socket.use(([ event, ...args ], next) => {
    const verdict = authorizeRoomPacket(event, args[0], socket.data, {
      isRoomCode,
      roomExists: (room) => sessions.has(room)
    });
    if (verdict.ok) {
      next();
      return;
    }
    refuseRoomPacket(socket, event, args, verdict);
  });

  // ── Auth handlers (no role guard — these assign the role) ─────────────────

  socket.on("gm:create-session", (cb) => {
    // Bound 1 of 2 for spec AC 16: cap unauthenticated creation before a room
    // exists at all. Once a room exists it can be filled with legitimate content
    // one `session:append-log` later, so this is the only point at which the
    // loop can actually be stopped.
    const created = socket.data.roomsCreated || 0;
    if (created >= SOCKET_ROOM_CREATE_LIMIT) {
      const reason = "Too many rooms created on this connection. Reload the page and try again.";
      reject(socket, "gm:create-session", "rate-limited: per-connection");
      if (typeof cb === "function") cb({ ok: false, reason });
      return;
    }
    const decision = roomCreateLimiter.tryCreate(creationKey(socket));
    if (!decision.allowed) {
      const seconds = Math.ceil(decision.retryAfterMs / 1000);
      const reason = `Too many rooms created just now. Try again in ${seconds}s.`;
      reject(socket, "gm:create-session", "rate-limited: origin");
      if (typeof cb === "function") cb({ ok: false, reason, retryAfterMs: decision.retryAfterMs });
      return;
    }
    // Bound 3 of 3 (review defect D1), **reordered last** (round-4 defect D3):
    // eviction is destructive - it deletes a real persisted room - so it must
    // only run once every other refusal reason has been cleared and the
    // create is actually about to proceed. It used to run before the rate
    // limit above, so a request that was *going to be refused anyway* for an
    // unrelated reason had already evicted a real room for a create that then
    // never happened (live-reproduced: patch the cap low, fill it, then send
    // a create that trips the rate limiter while at cap - a room was deleted
    // regardless of the refusal).
    if (roomCapReached(sessions, TOTAL_ROOM_CAP) && !evictOneRoomForCapacity()) {
      const reason = "This server is holding its maximum number of rooms, and every one of them "
        + "has someone connected. Ask the operator to delete unused rooms.";
      console.warn(`[rooms] refused gm:create-session: room cap ${TOTAL_ROOM_CAP} reached `
        + `(${sessions.size} rooms held, none evictable)`);
      reject(socket, "gm:create-session", "room-cap-reached");
      if (typeof cb === "function") cb({ ok: false, reason });
      return;
    }
    socket.data.roomsCreated = created + 1;
    let room = createRoomCode();
    // Also refused if `room` is a tombstoned code (review defect D9): `evict()`
    // frees a room's code for reuse the instant it deletes the file, but the
    // tombstone it leaves behind exists precisely so a GM whose room was
    // evicted gets told why instead of a bare "Room not found"
    // (`roomNotFoundReason`). A fresh, unrelated room landing on that exact
    // code - astronomically unlikely at 36^6, but a real number, not zero -
    // would silently retire that explanation and, worse, would let a
    // reconnecting evicted GM's `gm:join-session` land in a stranger's room
    // and start pushing state over it. Regenerating past a tombstoned code is
    // as cheap as regenerating past a collision.
    //
    // Bounded, not `while (true)` (D-J, durable-rooms review round 7):
    // `createRoomCode()` itself falls back to the deterministic "AAAAAA" after
    // `ROOM_CODE_MAX_ATTEMPTS` tries (`server/session-store.js`), so an
    // unbounded loop here could hold or tombstone that exact code and spin
    // forever, doing a synchronous `existsSync`+`readFileSync` every
    // iteration and taking the event loop - and every room on it - down with
    // it. Reuses the same bound `createRoomCode` applies internally rather
    // than inventing a second number to keep in sync.
    let attempts = 0;
    while (sessions.has(room) || store.expiryOf(room)) {
      attempts++;
      if (attempts >= ROOM_CODE_MAX_ATTEMPTS) {
        const reason = "Could not allocate a free room code right now. Try again.";
        console.error(`[rooms] gm:create-session: exhausted ${ROOM_CODE_MAX_ATTEMPTS} room-code `
          + "attempts against held/tombstoned codes - refusing rather than spinning.");
        reject(socket, "gm:create-session", "room-code-exhausted");
        if (typeof cb === "function") cb({ ok: false, reason });
        return;
      }
      room = createRoomCode();
    }
    const session = getOrCreateSession(room);
    // Leave whatever room this socket was running before (review defect D2).
    detachSocketFromPreviousRoom(socket, room);
    socket.join(room);
    socket.data.role = "gm";
    socket.data.room = room;
    setGmPresence(room, socket.id, true);
    // Deliberately NOT persisted here. This handler takes no room code, no role
    // and no credential - anyone who can open a socket can call it in a loop -
    // so writing a file per create is an unauthenticated, unbounded disk-fill
    // vector, and the room-ownership checks on `session:update-state` /
    // `session:append-log` cannot close it (they only guard rooms that already
    // exist). A brand-new room is empty and has nothing to restore; it lives in
    // memory until the GM's first real broadcast or log entry calls
    // `touchSession`. `store.touch` refuses empty rooms as a backstop
    // (`hasPersistableContent`). That backstop is *not* the bound - see the
    // rate limit above and the contentless reaper below (spec AC 16).
    if (typeof cb === "function") {
      cb({ room, ok: true, state: session.state, log: session.log });
    }
  });

  // `= {}` defaults (round-4 review defect D1): belt-and-braces against a
  // future room-entry handler being wired up without reading this file. The
  // actual fix is the payload-shape check `authorizeRoomPacket` now performs
  // in the `socket.use` choke point above, *before* either handler below ever
  // runs - an emit with no payload, or an explicit `null`, used to reach
  // `{ room }`/`{ room, playerName }` destructuring directly and throw
  // (uncaught, since this fires from socket.io's own dispatch), crashing the
  // whole process for every room on one malformed emit with no auth needed.
  socket.on("gm:join-session", ({ room } = {}, cb) => {
    const session = sessions.get(room);
    if (!session) {
      if (typeof cb === "function") cb({ ok: false, reason: roomNotFoundReason(room) });
      return;
    }
    // Leave whatever room this socket was running before (review defect D2).
    // Deliberately after the lookup: a join that fails must leave the socket
    // exactly where it was.
    detachSocketFromPreviousRoom(socket, room);
    socket.join(room);
    socket.data.role = "gm";
    socket.data.room = room;
    setGmPresence(room, socket.id, true);
    touchSession(room); // write site 4 of 5 (see touchSession's doc comment for the full count)
    if (typeof cb === "function") cb({ ok: true, state: session.state, log: session.log });
  });

  socket.on("player:join", ({ room, playerName } = {}, cb) => {
    const session = sessions.get(room);
    if (!session) {
      if (typeof cb === "function") cb({ ok: false, reason: roomNotFoundReason(room) });
      return;
    }
    // Leave whatever room this socket was running before (round-4 defect D4 -
    // unlike `gm:create-session`/`gm:join-session`, this handler never had
    // this. A player who joined room A, claimed a character, then joined room
    // B stayed a Socket.IO member of A - room A's broadcasts kept reaching a
    // socket now driving a different room's UI - and A's claim was never
    // released, since by the time this socket disconnects `socket.data.room`
    // is B, not A. Deliberately after the lookup, matching `gm:join-session`:
    // a join that fails must leave the socket exactly where it was.
    detachSocketFromPreviousRoom(socket, room);
    socket.join(room);
    socket.data.role = "player";
    socket.data.room = room;
    socket.data.playerName = playerName;
    if (typeof cb === "function") {
      // `gmConnected` lets the player view say "GM not connected" on a
      // persisted room nobody is running yet (spec Open Decision 7 / AC 6).
      cb({
        ok: true,
        // GM-only `oocOwnership` stripped (D-G) - see `playerFacingState`.
        state: playerFacingState(session.state),
        log: session.log,
        playerName,
        gmConnected: isGmConnected(room)
      });
    }
  });

  // ── Guarded handlers ──────────────────────────────────────────────────────

  socket.on("session:update-state", ({ room, state } = {}) => {
    // Role (gm) and room ownership are enforced by the `socket.use` choke point
    // above, from the one rule in `authorizeRoomPacket`; they are deliberately
    // not repeated here. Repeating them per handler is what let
    // `session:command` drift into having no check at all.
    // Schema.
    if (!isSharedState(state)) {
      reject(socket, "session:update-state", "invalid-payload: state");
      return;
    }
    // Size cap: 64 KB. Realistic play (even 50+ participants with Matrix state)
    // stays well under 10 KB, so this cap should never be hit in normal use.
    const size = JSON.stringify(state).length;
    if (size > 64 * 1024) {
      reject(socket, "session:update-state", "payload-too-large: state");
      return;
    }
    // Happy path (unchanged).
    if (!room) return;
    const session = getOrCreateSession(room);
    session.state = state;
    touchSession(room); // write site 1 of 5 (see touchSession's doc comment for the full count)
    // GM-only `oocOwnership` stripped before this reaches every socket in the
    // room, players included (D-G) - see `playerFacingState`.
    io.to(room).emit("session:state", playerFacingState(state));
  });

  socket.on("session:append-log", ({ room, entry } = {}) => {
    // Role (gm or player) and room ownership: see the `socket.use` choke point.
    // Schema.
    if (!isSharedLogEntry(entry)) {
      reject(socket, "session:append-log", "invalid-payload: entry");
      return;
    }
    // Size cap: 2 KB.
    if (JSON.stringify(entry).length > 2 * 1024) {
      reject(socket, "session:append-log", "payload-too-large: entry");
      return;
    }
    // Happy path (unchanged).
    if (!room || !entry) return;
    const session = getOrCreateSession(room);
    session.log.push(entry);
    if (session.log.length > 300) {
      session.log.shift();
    }
    touchSession(room); // write site 2 of 5 (see touchSession's doc comment for the full count)
    io.to(room).emit("session:log-entry", entry);
  });

  socket.on("session:command", ({ room, command } = {}) => {
    const role = socket.data.role;
    // Role (gm or player) and **room ownership** come from the `socket.use`
    // choke point. Ownership is the check this handler never had: a socket that
    // had called the credential-free `gm:create-session` could aim `act`,
    // `delay`, `interrupt`, `register_character` or `claim_character` at any
    // room code it guessed, and that room's GM tab applied it (live-reproduced).
    // Schema.
    if (!isSessionCommand(command)) {
      reject(socket, "session:command", "invalid-payload: command");
      return;
    }
    // Command type allowlist.
    if (!ALLOWED_COMMAND_TYPES.has(command.type)) {
      reject(socket, "session:command", `unknown-command-type: ${command.type}`);
      return;
    }
    // Player field must match the authenticated identity — prevents impersonation.
    if (role === "gm" && command.player !== "GM") {
      reject(socket, "session:command", "player-mismatch: gm must use player=GM");
      return;
    }
    if (role === "player" && command.player !== socket.data.playerName) {
      reject(socket, "session:command", "player-mismatch: token does not match session");
      return;
    }
    // Size cap: 8 KB.
    if (JSON.stringify(command).length > 8 * 1024) {
      reject(socket, "session:command", "payload-too-large: command");
      return;
    }
    // Happy path (unchanged).
    if (!room || !command) return;
    io.to(room).emit("session:command", command);
  });

  /**
   * Guard shared by the two lifecycle events below. Returns the room code on
   * success, or null after replying with the rejection.
   */
  function guardLifecycle(event, room, cb) {
    // Same rule, same function as the `socket.use` choke point - called again
    // here rather than reimplemented, so the two can never disagree. In practice
    // the middleware has already refused anything this would refuse; this is the
    // belt to its braces, and the reason the ack contract is identical.
    const verdict = authorizeRoomPacket(event, { room }, socket.data, {
      isRoomCode,
      roomExists: (code) => sessions.has(code)
    });
    if (!verdict.ok) {
      refuseRoomPacket(socket, event, cb ? [ { room }, cb ] : [ { room } ], verdict);
      return null;
    }
    return room;
  }

  /**
   * Close = *leave*. Everyone is disconnected from the room, but the room and
   * its persisted record stay: the GM (or a player) can rejoin the same code
   * later, which is the whole point of durable rooms (spec Open Decision 3 /
   * AC 8). Destroying a room is `gm:end-session`, below.
   */
  socket.on("gm:close-session", ({ room } = {}, cb) => {
    if (!guardLifecycle("gm:close-session", room, cb)) {
      return;
    }
    if (typeof cb === "function") {
      cb({ ok: true, persisted: true });
    }
    // Flush before anyone leaves: a deliberate close is a zero-loss point
    // (spec Open Decision 2). Write site 5 of 5 (see touchSession's doc
    // comment for the full count).
    touchSession(room);
    store.flush(room);
    io.to(room).emit("session:closed", { room, persisted: true });
    // Every socket leaves - Socket.IO membership *and* `socket.data` (round-3
    // fix 2). A close that left `socket.data.room` set on a second GM tab would
    // leave that tab silently authorised to keep broadcasting into a room its
    // own UI has already torn down.
    evacuateRoom(room);
  });

  /**
   * End = *destroy*. The in-memory room and its file on disk both go, so a
   * later `gm:join-session` genuinely reports the room as gone (spec AC 8).
   * The client puts this behind a confirmation dialog.
   */
  socket.on("gm:end-session", ({ room } = {}, cb) => {
    if (!guardLifecycle("gm:end-session", room, cb)) {
      return;
    }
    if (typeof cb === "function") {
      cb({ ok: true, persisted: false });
    }
    io.to(room).emit("session:closed", { room, persisted: false });
    // Order matters: detach every socket *before* the room is deleted, so no
    // socket is left holding `socket.data.room === room`. A lingering second GM
    // tab used to pass the ownership check afterwards and recreate the room
    // through `getOrCreateSession` - permanently, since retention is indefinite
    // (round-3 fix 2, live-reproduced with two GM sockets).
    const detached = evacuateRoom(room);
    sessions.delete(room);
    store.remove(room);
    console.log(`[rooms] ended room ${room}; detached ${detached} socket(s)`);
  });

  // ── Disconnect (server-generated — no role guard needed) ──────────────────

  socket.on("disconnect", () => {
    if (socket.data.role === "gm" && socket.data.room) {
      setGmPresence(socket.data.room, socket.id, false);
      return;
    }
    if (socket.data.role !== "player") {
      return;
    }
    const room = socket.data.room;
    const playerName = socket.data.playerName;
    if (!room || !playerName) {
      return;
    }
    // Write site 3 of 5 (see `touchSession`'s doc comment for the full
    // count), and the one the spec calls out as easiest to miss:
    // `releasePlayerClaims` mutates `session.state.participants` (and, since
    // review defect D2, `session.state.oocOwnership`) in place without going
    // through `session:update-state`, so without its own `touchSession` call
    // an ownership release would never reach disk.
    releasePlayerClaims(room, playerName);
  });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Serve Angular production build from the same origin as Socket.IO.
const distRoot = path.join(__dirname, "dist");
const staticCandidates = [
  path.join(distRoot, "battle-tracker", "browser"),
  path.join(distRoot, "browser"),
  distRoot
];
const staticRoot = staticCandidates.find((candidate) => fs.existsSync(path.join(candidate, "index.html")));
if (staticRoot) {
  app.use(express.static(staticRoot));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/socket.io") || req.path === "/health") {
      next();
      return;
    }
    res.sendFile(path.join(staticRoot, "index.html"));
  });
}

// ── Startup restore, retention sweep and shutdown flush ───────────────────────
// Restore runs *before* server.listen so no create/join can be served against
// an empty Map - which is also what repairs the room-code collision guard in
// `gm:create-session` (it was previously blind to rooms from a previous process
// lifetime). See spec, Proposed approach part 2.
const restored = store.loadAll();
for (const [ room, session ] of restored.sessions) {
  sessions.set(room, session);
}
releaseAllClaimsOnBoot(sessions);
store.sweep(sessions);
store.startSweepTimer(sessions);

// Bound 2 of 2 for spec AC 16: a room created and never given content must not
// live in the `sessions` Map forever. Deliberately separate from the store's
// housekeeping sweep, which is about files on disk and now removes nothing for
// age at all (retention is indefinite). Reaping is self-healing: a GM who is
// still in a reaped room recreates it on the next broadcast via
// `getOrCreateSession`.
const contentlessReaper = setInterval(() => {
  const reaped = reapContentlessRooms(sessions, {
    ttlMs: CONTENTLESS_ROOM_TTL_MS,
    hasContent: hasPersistableContent,
    onReap: (room) => gmPresence.delete(room)
  });
  // The limiter is itself keyed by attacker-controlled input, so it gets pruned
  // on the same tick or it becomes the next unbounded Map.
  roomCreateLimiter.prune();
  if (reaped.length) {
    console.log(`[rooms] dropped ${reaped.length} unused empty room(s) from memory [${reaped.join(", ")}]`);
  }
}, CONTENTLESS_SWEEP_INTERVAL_MS);
contentlessReaper.unref();

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  // `pm2 restart` sends SIGTERM and only then SIGKILL, so flushing here turns a
  // deliberate restart into a zero-loss operation (spec Open Decision 2).
  //
  // `beginShutdown` (not `flushAll`) because sockets stay open through the 2s
  // grace period below: any state/log traffic that arrives after the flush would
  // otherwise schedule a debounced write that `process.exit` eats. In drain mode
  // every touch writes synchronously instead.
  const written = store.beginShutdown();
  store.stopSweepTimer();
  clearInterval(contentlessReaper);
  console.log(`[rooms] ${signal}: flushed ${written} pending room write(s)`);
  server.close(() => process.exit(0));
  // Do not wait forever on lingering sockets.
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

const port = Number(process.env.PORT || 3001);
server.listen(port, () => {
  console.log(`BattleTracker session server listening on ${port} (rooms in ${DATA_DIR})`);
});
