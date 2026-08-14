"use strict";

/**
 * Abuse bounds for room creation.
 *
 * Spec: `briefs/persistent-rooms.md`, AC 16 (added 2026-08-05).
 *
 * `gm:create-session` takes no room code, no role and no credential: anyone who
 * can open a socket can call it in a loop. `hasPersistableContent` in
 * `server/session-store.js` only stops a *single* contentless room reaching the
 * disk — it does nothing about the loop
 * (`gm:create-session` → `session:append-log` → repeat), where every iteration
 * legitimately acquires content and therefore legitimately earns a file. It also
 * does nothing about the companion in-memory leak: a room created and never used
 * used to live in the server's `sessions` Map until the process died.
 *
 * So this module adds the two bounds the passive backstop cannot provide:
 *
 * 1. `createRoomCreationLimiter` — a cap on how many rooms one unauthenticated
 *    origin (and one socket) may create in a time window. That is what bounds
 *    the *disk*, because a room cannot acquire content before it is created.
 * 2. `reapContentlessRooms` — a short grace period after which a room that never
 *    got content is dropped from memory. That is what bounds the *Map*.
 *
 * Every dependency is injected rather than required at module load, for the same
 * two reasons as `session-store.js`: the policy stays swappable, and the module
 * is loadable in the browser test runner, which is the only test runner this
 * repo has (`npm test` is Karma; see ARCHITECTURE "Test coverage").
 */

/**
 * How many rooms one origin may create inside `ROOM_CREATE_WINDOW_MS`
 * (spec AC 16). A GM creates one room per session and occasionally re-creates
 * after an End Room, so ten a minute is far above real use and far below a
 * useful disk-fill rate.
 */
const ROOM_CREATE_LIMIT = 10;

/** Rate-limit window for room creation, ms (spec AC 16). */
const ROOM_CREATE_WINDOW_MS = 60 * 1000;

/**
 * Lifetime cap on rooms created by a single socket connection (spec AC 16).
 * Unspoofable, unlike an origin key, which behind a reverse proxy depends on
 * `X-Forwarded-For` being set by that proxy. Belt to the window's braces.
 */
const SOCKET_ROOM_CREATE_LIMIT = 25;

/**
 * How many reverse-proxy hops sit in front of this process by default.
 *
 * The documented deployment (`docs/APP_DOCUMENTATION.md`) is a single nginx
 * using `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`, which
 * *appends* the peer address to whatever the client sent. So with one trusted
 * hop the only entry the client cannot choose is the **rightmost** one. Override
 * with `SR5E_PROXY_HOPS` if another proxy (a CDN, a second nginx) is added in
 * front, or the key drifts back to attacker-controlled input.
 */
const TRUSTED_PROXY_HOPS = 1;

/**
 * Hard ceiling on how many rooms may exist at once (review defect D1).
 *
 * A rate limit bounds the *rate* of creation, not the *total*: with indefinite
 * retention (spec AC 11, amended 2026-08-05) a slow create-loop that stays under
 * the limiter still accumulates rooms on disk forever. This is the defence in
 * depth that bounds the accumulation. Generous next to real use - a table runs
 * one room at a time, and the store keeps every room ever created - but a real
 * number, refused loudly rather than silently.
 */
const TOTAL_ROOM_CAP = 500;

/**
 * How long a room with no content at all may sit in the `sessions` Map before it
 * is dropped (spec AC 16). The GM tab calls `syncSharedState()` immediately after
 * a successful create, so a real room acquires content within a second; ten
 * minutes is three orders of magnitude of headroom.
 *
 * Reaping is safe even for a GM still sitting in the room: `session:update-state`
 * goes through `getOrCreateSession`, so the next broadcast simply recreates the
 * room — this time with content, which is when it earns its file.
 */
const CONTENTLESS_ROOM_TTL_MS = 10 * 60 * 1000;

/** How often the contentless-room reaper runs, ms (spec AC 16). */
const CONTENTLESS_SWEEP_INTERVAL_MS = 60 * 1000;

/**
 * Fixed-window rate limiter keyed by an opaque string (an origin, a socket id).
 *
 * @param {object} [options]
 * @param {() => number} [options.now]
 * @param {number} [options.limit]      creates allowed per window
 * @param {number} [options.windowMs]   window length
 */
function createRoomCreationLimiter(options = {}) {
  const now = options.now || (() => Date.now());
  const limit = options.limit === undefined ? ROOM_CREATE_LIMIT : options.limit;
  const windowMs = options.windowMs === undefined ? ROOM_CREATE_WINDOW_MS : options.windowMs;

  /** key -> { windowStart, count } */
  const windows = new Map();

  /**
   * Record an attempt. Returns `{ allowed, remaining, retryAfterMs }`.
   * A denied attempt is *not* counted, so a caller that keeps hammering does not
   * extend its own lockout.
   */
  function tryCreate(key) {
    const at = now();
    const entry = windows.get(key);
    if (!entry || at - entry.windowStart >= windowMs) {
      windows.set(key, { windowStart: at, count: 1 });
      return { allowed: true, remaining: limit - 1, retryAfterMs: 0 };
    }
    if (entry.count < limit) {
      entry.count++;
      return { allowed: true, remaining: limit - entry.count, retryAfterMs: 0 };
    }
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, entry.windowStart + windowMs - at)
    };
  }

  /**
   * Drop keys whose window has fully elapsed. Without this the limiter is itself
   * an unbounded Map keyed by attacker-controlled input — the exact shape of leak
   * AC 16 exists to close.
   */
  function prune() {
    const at = now();
    let dropped = 0;
    for (const [ key, entry ] of Array.from(windows.entries())) {
      if (at - entry.windowStart >= windowMs) {
        windows.delete(key);
        dropped++;
      }
    }
    return dropped;
  }

  return {
    limit,
    windowMs,
    tryCreate,
    prune,
    size: () => windows.size,
    reset: () => windows.clear()
  };
}

/**
 * The rate-limit key for an unauthenticated caller, chosen so the caller cannot
 * pick it (review defect D1, tightened round 3).
 *
 * Behind the documented nginx deployment every socket's `handshake.address` is
 * 127.0.0.1, so `X-Forwarded-For` is the only thing that distinguishes callers -
 * but nginx's `$proxy_add_x_forwarded_for` *prepends* whatever the client sent
 * and appends the real peer, so the **leftmost** entry is attacker-controlled
 * and the rightmost is the proxy's own. Keying on the leftmost entry made the
 * limiter free to bypass (verified live: 40 sockets with distinct spoofed
 * headers created 120 rooms with zero refusals). Count `hops` back from the
 * right instead: with one trusted proxy that is the entry nginx itself wrote.
 *
 * **Trust is opt-in, not opt-out.** Counting back from the right is only sound
 * if a proxy is genuinely appending an entry. Reached *directly* - a dev box, a
 * droplet whose port is exposed, a misconfigured nginx - there is no appended
 * entry, so the rightmost value is again whatever the caller typed and the
 * limiter is free to bypass. So `trustProxy` now defaults to **false** and the
 * header is ignored entirely unless the operator says otherwise
 * (`SR5E_TRUST_PROXY=1`); with no trusted proxy the key is the raw socket
 * remote address, which a client cannot choose.
 *
 * @param {object} [options]
 * @param {Record<string, unknown>} [options.headers] handshake headers
 * @param {boolean} [options.trustProxy] true = honour XFF; default false
 * @param {number} [options.proxyHops] trusted hops in front of this process
 * @param {string} [options.address] socket handshake address (fallback)
 * @param {string} [options.socketId] last-resort fallback
 * @returns {string}
 */
function creationOriginKey(options = {}) {
  const headers = options.headers || {};
  const trustProxy = options.trustProxy === true;
  const hops = Number.isFinite(Number(options.proxyHops)) && Number(options.proxyHops) > 0
    ? Math.floor(Number(options.proxyHops))
    : TRUSTED_PROXY_HOPS;
  const raw = headers["x-forwarded-for"];
  if (trustProxy && typeof raw === "string") {
    const entries = raw.split(",").map(s => s.trim()).filter(Boolean);
    if (entries.length > 0) {
      // Clamp at 0: a client that sends *fewer* entries than the configured hop
      // count must not push the index negative and land back on its own value.
      const key = entries[Math.max(0, entries.length - hops)];
      if (key) {
        return key;
      }
    }
  }
  return options.address || options.socketId || "unknown";
}

/**
 * Detach a socket from the room it was previously in, before it joins another
 * (review defect D2).
 *
 * `gm:create-session` and `gm:join-session` both reassign `socket.data.room` and
 * call `socket.join(newRoom)`. Neither used to leave the old one, so the socket
 * stayed a member of both: a player still sitting in the abandoned room could
 * send commands and log entries that were relayed to - and applied by - the GM
 * tab now running a *different* room (verified live: room A's commands mutated
 * room B's encounter). The abandoned room also kept this socket in its GM
 * presence set, so it answered `gmConnected: true` to new joiners forever.
 *
 * The room itself is untouched: it stays in the `sessions` Map, stays persisted
 * and stays rejoinable by code. Only this socket leaves.
 *
 * @param {{ id?: string, data?: any, leave?: (room: string) => void }} socket
 * @param {string} nextRoom  the room about to be joined
 * @param {object} [hooks]
 * @param {(room: string, socketId: string) => void} [hooks.clearGmPresence]
 * @param {(room: string, playerName: string) => void} [hooks.releasePlayerClaim]
 *   Round-4 defects D2/D4: a *player* socket leaving a room it held a claim in
 *   needs that claim released the same way a genuine disconnect always did -
 *   otherwise the claim is stuck "owned" by a token that will never again
 *   disconnect from that room. Called before `data.room` is cleared, so the
 *   hook still has both pieces of information it needs.
 * @returns {string|null} the room left, or null if there was nothing to leave
 */
function detachFromPreviousRoom(socket, nextRoom, hooks = {}) {
  const data = (socket && socket.data) || {};
  const previous = data.room;
  if (!previous || previous === nextRoom) {
    return null;
  }
  if (data.role === "gm" && typeof hooks.clearGmPresence === "function") {
    hooks.clearGmPresence(previous, socket.id);
  }
  if (data.role === "player" && data.playerName && typeof hooks.releasePlayerClaim === "function") {
    hooks.releasePlayerClaim(previous, data.playerName);
  }
  if (socket && typeof socket.leave === "function") {
    socket.leave(previous);
  }
  data.room = undefined;
  return previous;
}

/**
 * Is the server already holding as many rooms as it is willing to (review
 * defect D1)? Counted off the live `sessions` Map, which startup restore fills
 * from disk, so it bounds persisted rooms and in-memory ones together.
 *
 * @param {Map<string, any>} sessions
 * @param {number} [cap]
 * @returns {boolean}
 */
function roomCapReached(sessions, cap) {
  const limit = Number.isFinite(Number(cap)) ? Number(cap) : TOTAL_ROOM_CAP;
  return !!sessions && typeof sessions.size === "number" && sessions.size >= limit;
}

/**
 * Pick the one room to evict so a create can proceed at the cap (round-3 fix 4).
 *
 * `roomCapReached` on its own is a permanent lockout: retention is indefinite
 * (spec AC 11), so once `TOTAL_ROOM_CAP` rooms exist nothing ever removes one
 * and every subsequent `gm:create-session` is refused forever, with no in-app
 * recovery. The eviction policy is deliberately the most conservative one that
 * still recovers:
 *
 * - **Never evict a room anyone is connected to.** A room with a live socket is
 *   a table mid-game; losing it is worse than refusing the create.
 * - Of the rest, evict exactly **one**, the least recently active. `lastActivity`
 *   is stamped on every write (spec AC 11), so this is the room whose GM has
 *   been gone longest.
 * - A room with no usable `lastActivity` is treated as infinitely old *only* if
 *   nothing better exists, so a missing stamp cannot shield a room forever, and
 *   cannot beat a room with a real, older stamp either.
 * - If every room is occupied, return null and let the caller refuse as before.
 *
 * Eviction is destructive and *not* undoable - see the caller in `server.js`,
 * which logs every eviction with the room code and its age.
 *
 * @param {Map<string, any>} sessions
 * @param {object} [options]
 * @param {(room: string) => boolean} [options.hasConnectedSockets]
 * @returns {string|null} the room code to evict, or null when none is evictable
 */
function findEvictableRoom(sessions, options = {}) {
  const occupied = typeof options.hasConnectedSockets === "function"
    ? options.hasConnectedSockets
    : () => false;
  if (!sessions || typeof sessions.entries !== "function") {
    return null;
  }
  let bestRoom = null;
  let bestActivity = Infinity;
  for (const [ room, session ] of Array.from(sessions.entries())) {
    if (occupied(room)) {
      continue;
    }
    const raw = Number(session && session.lastActivity);
    // An unstamped room sorts as oldest-possible, but strictly behind any room
    // that carries a real timestamp of its own.
    const activity = Number.isFinite(raw) ? raw : -Infinity;
    if (bestRoom === null || activity < bestActivity) {
      bestRoom = room;
      bestActivity = activity;
    }
  }
  return bestRoom;
}

// ── The one room-ownership rule (round-3 fixes 1 and 2) ───────────────────────
//
// The recurring defect this closes: every socket handler that acts on a room
// has to answer "does this socket actually belong to the room it named?", and
// that was answered per-handler. `session:update-state` and `session:append-log`
// grew the check; `session:command` never did, so any socket that had called the
// credential-free `gm:create-session` could address `act` / `delay` /
// `interrupt` / `claim_character` at *another* room's code and have that room's
// GM tab apply it (live-reproduced). Room codes are plain URL parameters and
// retention is now indefinite, so that is a durable cross-room injection.
//
// The answer is not a third copy of the check. It is one rule, in one function,
// reached two ways:
//
//   1. `server.js` installs `authorizeRoomPacket` as a `socket.use` middleware,
//      so it runs before *every* handler on the socket, including handlers
//      nobody has written yet.
//   2. `guardLifecycle` in `server.js` calls the same function directly, because
//      it also has to answer an ack callback.
//
// Default-deny is by payload *shape*, not by registration: any event whose first
// argument carries a `room` string is treated as room-scoped even if it is not
// listed in `ROOM_SCOPED_EVENTS`. A future handler therefore cannot reintroduce
// this hole by forgetting to opt in - it would have to deliberately opt out.

/**
 * Events that *assign* room membership and so cannot require it. Exhaustive and
 * deliberately tiny: every other room-carrying event is guarded.
 */
const ROOM_ENTRY_EVENTS = new Set([
  "gm:create-session",
  "gm:join-session",
  "player:join"
]);

/**
 * Which room-entry events take a payload object at all (round-4 review
 * defect D1 - **crash**, not just an auth hole).
 *
 * `gm:join-session` and `player:join` destructure `{ room }` (and, for
 * `player:join`, `playerName`) straight out of their first argument in
 * `server.js`, with no guard. `authorizeRoomPacket` used to return `{ ok:
 * true }` for every `ROOM_ENTRY_EVENTS` event unconditionally, before any
 * handler ran - so an emit with no payload at all (`socket.emit("gm:join-
 * session")`) or an explicit `null` reached the handler with its first
 * parameter `undefined`/`null`, and `const { room } = undefined` throws.
 * Node's `EventEmitter` does not catch a synchronous throw from a listener,
 * and this fires from socket.io's own internal packet dispatch, so the throw
 * is uncaught and kills the whole process - every room, every connected GM
 * and player, for one malformed emit, no authentication required.
 *
 * `gm:create-session` is deliberately **not** in this set: it takes no
 * payload at all, only an ack callback (`socket.on("gm:create-session", (cb)
 * => ...)`), so its first argument is legitimately a function, not an object,
 * on every real call. Requiring "non-null object" there would refuse the
 * ordinary case.
 */
const ROOM_ENTRY_PAYLOAD_EVENTS = new Set([
  "gm:join-session",
  "player:join"
]);

/**
 * Per-event role and existence requirements. Events absent from this map are
 * still guarded for membership if their payload names a room - they just fall
 * back to "GM or authenticated player".
 */
const ROOM_SCOPED_EVENTS = new Map([
  [ "session:update-state", { roles: [ "gm" ] } ],
  [ "session:append-log", { roles: [ "gm", "player" ] } ],
  // The hole this whole choke point exists for.
  [ "session:command", { roles: [ "gm", "player" ] } ],
  // Lifecycle events answer "room not found" ahead of the membership check, so
  // a retry after a lost ack still reads as the terminal success it is (review
  // defect D5) even though `gm:end-session` now clears the issuing socket's
  // membership as part of the teardown.
  [ "gm:close-session", { roles: [ "gm" ], requiresExistingRoom: true } ],
  [ "gm:end-session", { roles: [ "gm" ], requiresExistingRoom: true } ]
]);

/** Default roles for an unregistered event that nonetheless names a room. */
const DEFAULT_ROOM_SCOPED_ROLES = [ "gm", "player" ];

const ROOM_CODE_PATTERN = /^[A-Z0-9]{6}$/;

function describeRoles(roles) {
  return roles.length === 1 ? roles[0] : roles.join(" or ");
}

/**
 * The single room-ownership decision.
 *
 * @param {string} event
 * @param {any} payload first argument of the packet
 * @param {{ role?: string, room?: string }} socketData `socket.data`
 * @param {object} [options]
 * @param {(v: any) => boolean} [options.isRoomCode] defaults to /^[A-Z0-9]{6}$/
 * @param {(room: string) => boolean} [options.roomExists] required for
 *        `requiresExistingRoom` events; absent means "assume it exists"
 * @returns {{ ok: boolean, reason?: string, notFound?: boolean, room?: string }}
 */
function authorizeRoomPacket(event, payload, socketData, options = {}) {
  const data = socketData || {};
  if (ROOM_ENTRY_EVENTS.has(event)) {
    // Round-4 review defect D1: refuse cleanly, before the handler ever runs,
    // rather than let `{ room } = payload` throw on an `undefined`/`null`
    // payload and crash the process. Only the two events that actually
    // destructure a payload are checked - see `ROOM_ENTRY_PAYLOAD_EVENTS`.
    if (ROOM_ENTRY_PAYLOAD_EVENTS.has(event)
      && (payload === null || payload === undefined || typeof payload !== "object")) {
      return { ok: false, reason: "invalid-payload" };
    }
    return { ok: true };
  }
  const config = ROOM_SCOPED_EVENTS.get(event);
  const room = payload && typeof payload === "object" ? payload.room : undefined;
  const namesRoom = payload && typeof payload === "object"
    && Object.prototype.hasOwnProperty.call(payload, "room");
  if (!config && !namesRoom) {
    // Not room-scoped at all (`disconnect`, future non-room events).
    return { ok: true };
  }
  const roles = (config && config.roles) || DEFAULT_ROOM_SCOPED_ROLES;
  const isRoomCode = typeof options.isRoomCode === "function"
    ? options.isRoomCode
    : (v) => typeof v === "string" && ROOM_CODE_PATTERN.test(v);

  if (!isRoomCode(room)) {
    return { ok: false, reason: "invalid-room-code", room };
  }
  if (config && config.requiresExistingRoom && typeof options.roomExists === "function"
    && !options.roomExists(room)) {
    return { ok: false, reason: "room-not-found", notFound: true, room };
  }
  if (!roles.includes(data.role)) {
    return { ok: false, reason: `role-required: ${describeRoles(roles)}`, room };
  }
  if (data.room !== room) {
    return { ok: false, reason: "room-mismatch", room };
  }
  return { ok: true, room };
}

/**
 * Drop rooms that were created and never given any content.
 *
 * @param {Map<string, any>} sessions  the server's live session Map
 * @param {object} [options]
 * @param {() => number} [options.now]
 * @param {number} [options.ttlMs]
 * @param {(session: any) => boolean} options.hasContent  usually `hasPersistableContent`
 * @param {(room: string) => void} [options.onReap]  per-room cleanup (GM presence, etc.)
 * @returns {string[]} the room codes removed
 */
function reapContentlessRooms(sessions, options = {}) {
  const now = options.now || (() => Date.now());
  const ttlMs = options.ttlMs === undefined ? CONTENTLESS_ROOM_TTL_MS : options.ttlMs;
  const hasContent = options.hasContent;
  const onReap = options.onReap;
  const reaped = [];
  if (!sessions || typeof sessions.forEach !== "function" || typeof hasContent !== "function") {
    return reaped;
  }
  const at = now();
  for (const [ room, session ] of Array.from(sessions.entries())) {
    if (hasContent(session)) {
      continue;
    }
    // A room restored from disk has no `createdAt` — but it also always has
    // content (the store refuses to write an empty room), so it never reaches
    // here. Treat an unstamped room as unknown-age and leave it alone rather
    // than guessing: this reaper must only ever delete rooms it can prove are
    // both empty and old.
    const createdAt = Number(session && session.createdAt);
    if (!Number.isFinite(createdAt) || at - createdAt < ttlMs) {
      continue;
    }
    sessions.delete(room);
    reaped.push(room);
    if (typeof onReap === "function") {
      onReap(room);
    }
  }
  return reaped;
}

module.exports = {
  createRoomCreationLimiter,
  creationOriginKey,
  roomCapReached,
  findEvictableRoom,
  authorizeRoomPacket,
  detachFromPreviousRoom,
  reapContentlessRooms,
  ROOM_ENTRY_EVENTS,
  ROOM_ENTRY_PAYLOAD_EVENTS,
  ROOM_SCOPED_EVENTS,
  ROOM_CREATE_LIMIT,
  ROOM_CREATE_WINDOW_MS,
  SOCKET_ROOM_CREATE_LIMIT,
  TRUSTED_PROXY_HOPS,
  TOTAL_ROOM_CAP,
  CONTENTLESS_ROOM_TTL_MS,
  CONTENTLESS_SWEEP_INTERVAL_MS
};
