"use strict";

/**
 * Durable room storage for the session server.
 *
 * Spec: `briefs/persistent-rooms.md`. Open Decision 1 chose **one JSON file per
 * room**, written atomically (temp file + rename), with no new dependency.
 * Open Decision 2 chose a ~1s per-room write debounce plus an immediate flush
 * on close/end and on SIGINT/SIGTERM. Open Decision 5, **amended 2026-08-05**,
 * chose **indefinite** retention: no room is ever removed for age. A room dies
 * only when the GM ends it. `lastActivity` is still recorded on every write
 * (cheap insurance if the policy is ever revisited), and the sweep survives only
 * to clear the legacy expiry markers left by the previous 30-day build.
 *
 * Every filesystem dependency is injected rather than required at module load,
 * for two reasons: the store stays swappable behind this narrow interface (the
 * spec calls the backend choice deliberately reversible), and the whole module
 * is loadable in the browser test runner, which is the only test runner this
 * repo has (`npm test` is Karma; see ARCHITECTURE "Test coverage").
 */

/** Persisted document format version, so a future shape change is detectable. */
const STORE_FORMAT_VERSION = 1;

/**
 * Room-code shape. Must stay identical to `isRoomCode` in `server.js`: every
 * guarded socket handler validates against it, so a code that does not match is
 * a room that can never accept `session:update-state` (spec, "Adjacent latent
 * defect"; Open Decision 8).
 */
const ROOM_CODE_PATTERN = /^[A-Z0-9]{6}$/;
const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
/** Bound on the regenerate loop so a broken RNG cannot spin forever. */
const ROOM_CODE_MAX_ATTEMPTS = 16;

/** Per-room write debounce window, ms (spec Open Decision 2). */
const DEFAULT_WRITE_DEBOUNCE_MS = 1000;

/**
 * Retention for live rooms: **indefinite, with one exception** (spec AC 11 /
 * Open Decision 5, amended 2026-08-05; exception added round 3, documented
 * round 4 defect D7). There is deliberately no age cutoff anywhere in this
 * module — a persisted room is removed only by `remove()` (an explicit GM
 * "End Room") or by `evict()` (`server/room-guards.js` `findEvictableRoom` /
 * `TOTAL_ROOM_CAP`: at the hard room cap, the single oldest *unoccupied* room
 * may be evicted to make room for a new one — never a room anyone is
 * connected to). The disk-growth concern the original 30-day TTL answered is
 * covered mainly by bounding room *creation* (`server/room-guards.js`, AC 16);
 * the cap-eviction path is the last-resort backstop for the case that bound
 * does not fully close.
 */
const ROOM_RETENTION_INDEFINITE = true;

/**
 * How long a legacy expiry marker is kept before the sweep clears it, ms.
 *
 * Nothing writes these any more; they only exist on servers that ran the
 * previous 30-day-retention build. Keeping them for a while means a GM whose
 * room was expired by that build still gets "removed on <date>" rather than a
 * bare "Room not found" (spec S5, which retains the messaging for removed rooms
 * but not for age).
 */
const DEFAULT_TOMBSTONE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** Sweep cadence: at startup and every 24h (spec Open Decision 5). */
const DEFAULT_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

const ROOM_FILE_SUFFIX = ".room.json";
/**
 * Marker for a room that was removed, so a later `gm:join-session` can say so
 * instead of a bare "Room not found" — which is indistinguishable from a typo
 * (spec scenario S5). Only ever *read* now that retention is indefinite; the
 * age-expiry path that used to write them is gone.
 */
const TOMBSTONE_FILE_SUFFIX = ".expired.json";
const TEMP_FILE_SUFFIX = ".tmp";

/** Room-code validator, byte-identical in intent to `server.js`'s. */
function isRoomCode(value) {
  return typeof value === "string" && ROOM_CODE_PATTERN.test(value);
}

/**
 * Is there anything in this room worth a file yet?
 *
 * `gm:create-session` takes no room code, no role and no credential — anybody
 * who can open a socket can call it, repeatedly. Persisting at create time
 * therefore turned an unauthenticated event into an unbounded disk write, which
 * the room-ownership check on `session:update-state` / `session:append-log`
 * cannot help with: that check only guards rooms that already exist.
 *
 * So a brand-new room stays in memory only. It earns its file the moment the GM
 * pushes real content — a state broadcast or a log entry — which is exactly the
 * point at which there is something to lose across a restart. An empty room has
 * nothing to restore, and its code is regenerated free of charge on the next
 * create.
 *
 * **This is a backstop, not the bound** (spec AC 16, added 2026-08-05). It stops
 * one contentless room reaching the disk; it does nothing about a create-loop
 * that gives each new room content immediately, because at that point every
 * write is legitimate. The actual cap on unauthenticated creation lives in
 * `server/room-guards.js`, and the companion in-memory leak (an unused room
 * sitting in the `sessions` Map forever) is closed by its reaper.
 */
function hasPersistableContent(session) {
  if (!session) {
    return false;
  }
  if (session.state !== null && session.state !== undefined) {
    return true;
  }
  return Array.isArray(session.log) && session.log.length > 0;
}

/**
 * Generate a room code that is *always* exactly 6 chars from the allowed
 * alphabet.
 *
 * The previous implementation was `Math.random().toString(36).slice(2, 8)`,
 * which can yield fewer than 6 characters when the float's base-36 form is
 * short — producing a room that every guarded handler then rejects. Persistence
 * would make such a room permanently broken on disk rather than broken until
 * the next restart, so the spec fixes it here (Open Decision 8).
 */
function createRoomCode(random = Math.random) {
  for (let attempt = 0; attempt < ROOM_CODE_MAX_ATTEMPTS; attempt++) {
    let code = "";
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      const roll = Math.floor(random() * ROOM_CODE_ALPHABET.length);
      const index = Math.min(Math.max(roll, 0), ROOM_CODE_ALPHABET.length - 1);
      code += ROOM_CODE_ALPHABET[index];
    }
    if (isRoomCode(code)) {
      return code;
    }
  }
  // Unreachable with any sane RNG; a deterministic fallback beats returning a
  // code the server would reject.
  return ROOM_CODE_ALPHABET[0].repeat(ROOM_CODE_LENGTH);
}

const defaultPath = {
  join: (...parts) => parts.filter(Boolean).join("/")
};

/**
 * @param {object} options
 * @param {*} options.fs        node:fs (or a compatible fake in tests)
 * @param {*} [options.path]    node:path
 * @param {string} options.dir  data directory holding one file per room
 * @param {() => number} [options.now]
 * @param {number} [options.debounceMs]
 * @param {number} [options.tombstoneRetentionMs]
 * @param {number} [options.sweepIntervalMs]
 * @param {(msg: string) => void} [options.logInfo]
 * @param {(msg: string, err?: unknown) => void} [options.logError]
 */
function createSessionStore(options) {
  const fs = options.fs;
  const path = options.path || defaultPath;
  const dir = options.dir;
  const now = options.now || (() => Date.now());
  const debounceMs = options.debounceMs === undefined ? DEFAULT_WRITE_DEBOUNCE_MS : options.debounceMs;
  const tombstoneRetentionMs = options.tombstoneRetentionMs === undefined
    ? DEFAULT_TOMBSTONE_RETENTION_MS
    : options.tombstoneRetentionMs;
  const sweepIntervalMs = options.sweepIntervalMs === undefined ? DEFAULT_SWEEP_INTERVAL_MS : options.sweepIntervalMs;
  /* eslint-disable no-console */
  const logInfo = options.logInfo || ((msg) => console.log(msg));
  const logError = options.logError || ((msg, err) => console.error(msg, err || ""));
  /* eslint-enable no-console */

  /** room -> { timer, session } for writes waiting out the debounce window. */
  const pending = new Map();
  let sweepTimer = null;
  /**
   * True once the process is shutting down. From that point `touch()` writes
   * synchronously instead of debouncing: `server.js` calls `flushAll()` and then
   * exits after a short grace period, so a write scheduled inside that window
   * would never fire and the change would be lost. Shutdown drain must be
   * zero-loss (spec Open Decision 2).
   */
  let draining = false;

  function roomFile(room) {
    return path.join(dir, room + ROOM_FILE_SUFFIX);
  }

  function tombstoneFile(room) {
    return path.join(dir, room + TOMBSTONE_FILE_SUFFIX);
  }

  function ensureDir() {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Atomic write: full document to a temp file, then rename over the target.
   * A `SIGKILL` mid-write therefore leaves either the previous complete
   * document or the new one, never a truncated room (spec AC 7).
   */
  function writeAtomic(file, contents) {
    ensureDir();
    const tmp = file + TEMP_FILE_SUFFIX;
    fs.writeFileSync(tmp, contents);
    fs.renameSync(tmp, file);
  }

  function serialize(room, session) {
    return JSON.stringify({
      version: STORE_FORMAT_VERSION,
      room,
      lastActivity: session.lastActivity || now(),
      state: session.state === undefined ? null : session.state,
      log: Array.isArray(session.log) ? session.log : []
    });
  }

  function writeNow(room, session) {
    if (!isRoomCode(room)) {
      logError(`[rooms] refusing to persist invalid room code: ${String(room)}`);
      return false;
    }
    try {
      writeAtomic(roomFile(room), serialize(room, session));
      return true;
    } catch (err) {
      logError(`[rooms] failed to persist room ${room}`, err);
      return false;
    }
  }

  /**
   * The single funnel every server-side mutation goes through. `server.js` has
   * **three** write sites, not one (`session:update-state`,
   * `session:append-log`, and the in-place `ownerName` strip in the disconnect
   * handler) — routing them all through one helper is what stops a fourth site
   * added later from silently failing to persist (spec, Proposed approach 1).
   */
  function touch(room, session) {
    if (!isRoomCode(room) || !session) {
      return;
    }
    session.lastActivity = now();
    if (!hasPersistableContent(session)) {
      // Empty room: in-memory only. See `hasPersistableContent` — this is the
      // backstop that keeps an unauthenticated `gm:create-session` from writing
      // to disk however many times it is called.
      return;
    }
    if (draining) {
      // Post-`flushAll()` traffic during the shutdown grace period: debouncing
      // it would drop it on `process.exit`, so write it out now.
      writeNow(room, session);
      return;
    }
    const existing = pending.get(room);
    if (existing) {
      existing.session = session;
      return;
    }
    const entry = { session, timer: null };
    entry.timer = setTimeout(() => {
      pending.delete(room);
      writeNow(room, entry.session);
    }, debounceMs);
    pending.set(room, entry);
  }

  /** Write any debounced work for `room` immediately (close/end, signals). */
  function flush(room) {
    const entry = pending.get(room);
    if (!entry) {
      return false;
    }
    clearTimeout(entry.timer);
    pending.delete(room);
    return writeNow(room, entry.session);
  }

  function flushAll() {
    let written = 0;
    for (const room of Array.from(pending.keys())) {
      if (flush(room)) {
        written++;
      }
    }
    return written;
  }

  /**
   * Enter shutdown drain: flush everything pending, and make every subsequent
   * `touch()` write immediately rather than scheduling a debounced write that
   * `process.exit` would eat. Returns the number of rooms flushed.
   *
   * Called from the SIGINT/SIGTERM handler in `server.js`. Sockets stay open for
   * a short grace period after that, so late `session:update-state` /
   * `session:append-log` traffic is still accepted - it just costs one
   * synchronous write each, which is the right trade for the last few seconds of
   * a restart.
   */
  function beginShutdown() {
    const written = flushAll();
    draining = true;
    return written;
  }

  /** Test/inspection hook: is the store in shutdown-drain mode? */
  function isDraining() {
    return draining;
  }

  /** Drop a room's persisted record entirely ("End Room", spec AC 8). */
  function remove(room) {
    const entry = pending.get(room);
    if (entry) {
      clearTimeout(entry.timer);
      pending.delete(room);
    }
    let removed = false;
    for (const file of [ roomFile(room), tombstoneFile(room) ]) {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
          removed = true;
        }
      } catch (err) {
        logError(`[rooms] failed to delete ${file}`, err);
      }
    }
    return removed;
  }

  /**
   * Drop a room's persisted record because the server **evicted** it for
   * capacity (round-4 defect D7), leaving a tombstone behind so the affected
   * GM's next `gm:join-session` gets an explanation instead of a bare "Room
   * not found" that is indistinguishable from a mistyped code.
   *
   * Deliberately distinct from `remove()`: an End Room is the GM's own
   * informed action on a room they are looking at, so it needs no marker and
   * removes any existing one. An eviction is done *to* a GM who was not there
   * to see it happen, at the hard room cap, to make room for someone else's
   * create - the one case retention is not truly indefinite (spec AC 11,
   * amended). `expiryOf()` already reads this same tombstone shape for the
   * legacy 30-day-retention build's markers; this is the only place that
   * writes one now.
   */
  function evict(room, reason) {
    const entry = pending.get(room);
    if (entry) {
      clearTimeout(entry.timer);
      pending.delete(room);
    }
    const file = roomFile(room);
    try {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    } catch (err) {
      logError(`[rooms] failed to delete ${file}`, err);
    }
    try {
      writeAtomic(tombstoneFile(room), JSON.stringify({
        version: STORE_FORMAT_VERSION,
        room,
        expiredAt: now(),
        reason: reason || null
      }));
    } catch (err) {
      logError(`[rooms] failed to write eviction marker for ${room}`, err);
    }
  }

  function listFiles(suffix) {
    ensureDir();
    let names = [];
    try {
      names = fs.readdirSync(dir) || [];
    } catch (err) {
      logError(`[rooms] cannot read data directory ${dir}`, err);
      return [];
    }
    return names.filter(name => typeof name === "string"
      && name.endsWith(suffix)
      && !name.endsWith(TEMP_FILE_SUFFIX));
  }

  /**
   * Load every persisted room. A truncated or mangled file is skipped with a
   * logged error and never stops the rest loading or the server booting (spec
   * AC 7 / scenario S6) — under pm2 a boot crash is a crash-loop that takes the
   * whole app down, so one bad room must never be fatal.
   */
  function loadAll() {
    const sessions = new Map();
    const skipped = [];
    for (const name of listFiles(ROOM_FILE_SUFFIX)) {
      const file = path.join(dir, name);
      try {
        const doc = JSON.parse(fs.readFileSync(file, "utf8"));
        const room = doc && doc.room;
        if (!isRoomCode(room)) {
          throw new Error("missing or invalid room code");
        }
        if (!Array.isArray(doc.log)) {
          throw new Error("missing log array");
        }
        sessions.set(room, {
          state: doc.state === undefined ? null : doc.state,
          log: doc.log,
          lastActivity: Number(doc.lastActivity) || now()
        });
      } catch (err) {
        skipped.push(name);
        logError(`[rooms] skipping unreadable room file ${name}`, err);
      }
    }
    logInfo(`[rooms] loaded ${sessions.size} persisted room(s) from ${dir}`
      + (skipped.length ? `, skipped ${skipped.length}` : ""));
    return { sessions, skipped };
  }

  /**
   * Housekeeping sweep.
   *
   * **No room is removed for age** (spec AC 11, amended 2026-08-05: retention is
   * indefinite). `removed` is therefore always empty and is kept only so the
   * return shape and the callers stay stable; the sweep's remaining job is
   * clearing the legacy expiry markers written by the previous 30-day build.
   * Always logged, so a sweep that runs is visible in the pm2 log (AC 11).
   *
   * `liveSessions` is accepted for the same stability reason and is no longer
   * mutated — nothing here can take a room out of memory any more.
   */
  function sweep(_liveSessions) {
    const removed = [];
    const tombstonesRemoved = sweepTombstones(now() - tombstoneRetentionMs);
    logInfo("[rooms] housekeeping sweep: retention is indefinite, removed 0 room(s) for age"
      + (tombstonesRemoved ? `, cleared ${tombstonesRemoved} legacy expiry marker(s)` : ""));
    return { removed, tombstonesRemoved };
  }

  function sweepTombstones(cutoff) {
    let cleared = 0;
    for (const name of listFiles(TOMBSTONE_FILE_SUFFIX)) {
      const file = path.join(dir, name);
      try {
        const doc = JSON.parse(fs.readFileSync(file, "utf8"));
        if ((Number(doc && doc.expiredAt) || 0) <= cutoff) {
          fs.unlinkSync(file);
          cleared++;
        }
      } catch {
        try {
          fs.unlinkSync(file);
          cleared++;
        } catch (err) {
          logError(`[rooms] failed to clear expiry marker ${name}`, err);
        }
      }
    }
    return cleared;
  }

  /**
   * `{ expiredAt, reason }` if this room was removed by retention or eviction,
   * else null. `reason` is `null` for a legacy 30-day-retention marker (which
   * never recorded one) and a short explanation for an `evict()` tombstone
   * (round-4 defect D7), e.g. "removed to free capacity for a new room".
   */
  function expiryOf(room) {
    if (!isRoomCode(room)) {
      return null;
    }
    const file = tombstoneFile(room);
    try {
      if (!fs.existsSync(file)) {
        return null;
      }
      const doc = JSON.parse(fs.readFileSync(file, "utf8"));
      return {
        expiredAt: Number(doc && doc.expiredAt) || 0,
        reason: (doc && typeof doc.reason === "string" && doc.reason) || null
      };
    } catch {
      return null;
    }
  }

  function startSweepTimer(liveSessions) {
    stopSweepTimer();
    sweepTimer = setInterval(() => sweep(liveSessions), sweepIntervalMs);
    if (typeof sweepTimer.unref === "function") {
      sweepTimer.unref();
    }
    return sweepTimer;
  }

  function stopSweepTimer() {
    if (sweepTimer) {
      clearInterval(sweepTimer);
      sweepTimer = null;
    }
  }

  return {
    dir,
    retentionIndefinite: ROOM_RETENTION_INDEFINITE,
    tombstoneRetentionMs,
    debounceMs,
    loadAll,
    touch,
    flush,
    flushAll,
    beginShutdown,
    isDraining,
    remove,
    evict,
    sweep,
    expiryOf,
    startSweepTimer,
    stopSweepTimer,
    pendingRooms: () => Array.from(pending.keys())
  };
}

module.exports = {
  createSessionStore,
  createRoomCode,
  isRoomCode,
  hasPersistableContent,
  STORE_FORMAT_VERSION,
  ROOM_FILE_SUFFIX,
  TOMBSTONE_FILE_SUFFIX,
  TEMP_FILE_SUFFIX,
  DEFAULT_WRITE_DEBOUNCE_MS,
  ROOM_RETENTION_INDEFINITE,
  DEFAULT_TOMBSTONE_RETENTION_MS,
  DEFAULT_SWEEP_INTERVAL_MS
};
