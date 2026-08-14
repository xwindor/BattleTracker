// Promoted scenarios and per-criterion tests for briefs/persistent-rooms.md
// ("Durable Rooms — session state survives server restart").
//
// This is transport, storage and lifecycle work: no SR5 mechanic is involved,
// so nothing here cites a rulebook page. The numbering below is the brief's own
// (AC 1-14, scenarios S1-S6, Open Decisions 1-8, all resolved 2026-08-01, plus
// AC 15-17 and the amended AC 11 / S5 added 2026-08-05).

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BattleTrackerComponent } from 'app/battle-tracker/battle-tracker.component';
import { PlayerViewComponent } from 'app/player-view/player-view.component';
import { appConfig } from 'app/app.config';
import { CombatManager } from 'Combat';
import { Participant } from 'Combat/Participants/Participant';
import { MatrixParticipant } from 'Matrix/MatrixParticipant';
import { VRMode } from 'Matrix/VRMode';
import { AstralParticipant } from 'Magic';
import { UndoHandler } from 'Common';
import {
  SessionSyncService, SessionCommand, SharedCombatState, SharedLogEntry
} from 'app/services/session-sync.service';
import {
  createSessionStore, createRoomCode, isRoomCode, hasPersistableContent,
  ROOM_FILE_SUFFIX, TOMBSTONE_FILE_SUFFIX, TEMP_FILE_SUFFIX,
  DEFAULT_WRITE_DEBOUNCE_MS, ROOM_RETENTION_INDEFINITE, DEFAULT_TOMBSTONE_RETENTION_MS,
  SessionStore, PersistedSession
} from '../../server/session-store';
import {
  createRoomCreationLimiter, creationOriginKey, roomCapReached, findEvictableRoom,
  authorizeRoomPacket, detachFromPreviousRoom, reapContentlessRooms,
  ROOM_CREATE_LIMIT, ROOM_CREATE_WINDOW_MS, CONTENTLESS_ROOM_TTL_MS, TOTAL_ROOM_CAP,
  ROOM_ENTRY_EVENTS, ROOM_ENTRY_PAYLOAD_EVENTS, ROOM_SCOPED_EVENTS,
  RoomCreationLimiter
} from '../../server/room-guards';

const DAY_MS = 24 * 60 * 60 * 1000;
const DATA_DIR = '/var/data/rooms';

function resetCombat() {
  CombatManager.participants.clear(false);
  CombatManager.currentActors.clear(false);
  CombatManager.nextSortOrder = 0;
  CombatManager.initiativePass = 1;
  CombatManager.combatTurn = 1;
  CombatManager.started = false;
  CombatManager.passEnded = true;
}

/** Minimal in-memory stand-in for node:fs, enough for the store's surface. */
class FakeFs {
  readonly files = new Map<string, string>();
  readonly dirs = new Set<string>();
  writes = 0;

  existsSync(p: string) { return this.files.has(p) || this.dirs.has(p); }
  mkdirSync(p: string) { this.dirs.add(p); }
  readdirSync(dir: string) {
    const prefix = dir + '/';
    return Array.from(this.files.keys())
      .filter(f => f.startsWith(prefix))
      .map(f => f.slice(prefix.length));
  }
  readFileSync(p: string) {
    const contents = this.files.get(p);
    if (contents === undefined) { throw new Error('ENOENT: ' + p); }
    return contents;
  }
  writeFileSync(p: string, data: string) { this.writes++; this.files.set(p, String(data)); }
  renameSync(from: string, to: string) {
    const contents = this.files.get(from);
    if (contents === undefined) { throw new Error('ENOENT: ' + from); }
    this.files.delete(from);
    this.files.set(to, contents);
  }
  unlinkSync(p: string) {
    if (!this.files.delete(p)) { throw new Error('ENOENT: ' + p); }
  }

  roomDoc(room: string) {
    return JSON.parse(this.readFileSync(`${DATA_DIR}/${room}${ROOM_FILE_SUFFIX}`));
  }
  names() { return this.readdirSync(DATA_DIR).sort(); }
}

function session(overrides: Partial<PersistedSession> = {}): PersistedSession {
  return {
    state: { round: 1, pass: 1, participants: [] },
    log: [],
    ...overrides
  };
}

describe('Durable rooms - server store (AC 7, 8, 11; S5, S6; Open Decisions 1, 2, 5, 8)', () => {
  let fs: FakeFs;
  let clockNow: number;
  let store: SessionStore;
  let info: string[];
  let errors: string[];

  function makeStore(extra: Record<string, unknown> = {}): SessionStore {
    return createSessionStore({
      fs,
      dir: DATA_DIR,
      now: () => clockNow,
      logInfo: (m: string) => info.push(m),
      logError: (m: string) => errors.push(m),
      ...extra
    });
  }

  beforeEach(() => {
    jasmine.clock().install();
    fs = new FakeFs();
    clockNow = Date.parse('2026-08-01T12:00:00.000Z');
    info = [];
    errors = [];
    store = makeStore();
  });

  afterEach(() => {
    store.stopSweepTimer();
    jasmine.clock().uninstall();
  });

  // ── Open Decision 8: createRoomCode's short-code defect ──────────────────
  describe('room codes are always six valid characters (Open Decision 8)', () => {
    it('never produces a code the server\'s own isRoomCode would reject', () => {
      for (let i = 0; i < 500; i++) {
        expect(isRoomCode(createRoomCode())).withContext(createRoomCode()).toBeTrue();
      }
    });

    it('survives the pathological RNG values the old base-36 slice broke on', () => {
      // Math.random() === 0 gave "0" -> slice(2,8) === "" under the old code.
      expect(createRoomCode(() => 0)).toMatch(/^[A-Z0-9]{6}$/);
      expect(createRoomCode(() => 0.9999999999)).toMatch(/^[A-Z0-9]{6}$/);
      // A value that must not index past the end of the alphabet.
      expect(createRoomCode(() => 1)).toMatch(/^[A-Z0-9]{6}$/);
    });
  });

  // ── Open Decision 2: debounced writes, immediate flush ───────────────────
  describe('write timing (Open Decision 2)', () => {
    it('debounces: many touches inside the window produce one write', () => {
      const s = session();
      for (let i = 0; i < 20; i++) {
        store.touch('ABC123', s);
      }
      expect(fs.files.size).toBe(0);            // nothing written yet
      jasmine.clock().tick(DEFAULT_WRITE_DEBOUNCE_MS);
      // One temp write plus the rename; the rename is a move, not a write.
      expect(fs.writes).toBe(1);
      expect(fs.roomDoc('ABC123').room).toBe('ABC123');
    });

    it('flushes immediately on demand (close/end)', () => {
      store.touch('ABC123', session());
      expect(store.pendingRooms()).toEqual(['ABC123']);

      expect(store.flush('ABC123')).toBeTrue();

      expect(store.pendingRooms()).toEqual([]);
      expect(fs.roomDoc('ABC123').room).toBe('ABC123');
    });

    it('flushAll writes every pending room (the SIGINT/SIGTERM path)', () => {
      store.touch('ABC123', session());
      store.touch('DEF456', session());

      expect(store.flushAll()).toBe(2);

      expect(fs.names()).toEqual([`ABC123${ROOM_FILE_SUFFIX}`, `DEF456${ROOM_FILE_SUFFIX}`]);
    });

    it('records lastActivity on every touch, so retention has an age to work from', () => {
      store.touch('ABC123', session());
      store.flush('ABC123');
      expect(fs.roomDoc('ABC123').lastActivity).toBe(clockNow);
    });

    // Review defect 2: writes after the shutdown flush were lost. `shutdown()`
    // flushes, closes the server and exits 2s later; a debounced write scheduled
    // inside that window never fires.
    describe('shutdown drain loses nothing (review defect 2)', () => {
      it('beginShutdown flushes what is already pending', () => {
        store.touch('ABC123', session());
        store.touch('DEF456', session());

        expect(store.beginShutdown()).toBe(2);

        expect(fs.names()).toEqual([`ABC123${ROOM_FILE_SUFFIX}`, `DEF456${ROOM_FILE_SUFFIX}`]);
      });

      it('writes immediately - not on a debounce - for traffic arriving during the drain', () => {
        store.beginShutdown();
        expect(store.isDraining()).toBeTrue();

        store.touch('ABC123', session({ log: [{ actor: 'GM', text: 'last gasp' }] }));

        // On disk already, with no clock tick: process.exit would have eaten a
        // debounced write.
        expect(store.pendingRooms()).toEqual([]);
        expect(fs.roomDoc('ABC123').log).toEqual([{ actor: 'GM', text: 'last gasp' }]);
      });

      it('a late write during the drain survives the restart', () => {
        store.touch('ABC123', session({ log: [] }));
        store.beginShutdown();
        store.touch('ABC123', session({ log: [{ actor: 'Wombat', text: 'acted' }] }));

        const afterRestart = makeStore().loadAll();

        expect(afterRestart.sessions.get('ABC123')!.log.length).toBe(1);
      });

      it('debounces normally before shutdown begins', () => {
        store.touch('ABC123', session());
        expect(store.isDraining()).toBeFalse();
        expect(fs.files.size).toBe(0);
      });
    });
  });

  // ── Review defect 1 (round 2): an empty room is never written to disk ─────
  // `gm:create-session` needs no room code, no role and no credential, so
  // persisting at create time let anyone fill the disk by calling it in a loop.
  // The room-ownership checks on the two emit handlers cannot help: they only
  // guard rooms that already exist.
  describe('a brand-new empty room is memory-only (review defect 1, round 2)', () => {
    const EMPTY: PersistedSession = { state: null, log: [] };

    it('hasPersistableContent is false until the room holds something', () => {
      expect(hasPersistableContent({ state: null, log: [] })).toBeFalse();
      expect(hasPersistableContent(null)).toBeFalse();
      expect(hasPersistableContent({ state: { round: 1, pass: 1, participants: [] }, log: [] })).toBeTrue();
      expect(hasPersistableContent({ state: null, log: [{ actor: 'GM', text: 'hi' }] })).toBeTrue();
    });

    it('touching an empty room schedules nothing and writes nothing', () => {
      store.touch('ABC123', EMPTY);

      expect(store.pendingRooms()).toEqual([]);
      jasmine.clock().tick(DEFAULT_WRITE_DEBOUNCE_MS * 5);
      expect(fs.names()).toEqual([]);
      expect(fs.writes).toBe(0);
    });

    it('1000 unauthenticated creates cost zero files', () => {
      for (let i = 0; i < 1000; i++) {
        store.touch(createRoomCode(), { state: null, log: [] });
      }
      jasmine.clock().tick(DEFAULT_WRITE_DEBOUNCE_MS * 5);

      expect(fs.names()).toEqual([]);
    });

    it('writes nothing on the close/end flush path either', () => {
      store.touch('ABC123', EMPTY);
      expect(store.flush('ABC123')).toBeFalse();
      expect(store.flushAll()).toBe(0);
      expect(store.beginShutdown()).toBe(0);

      expect(fs.names()).toEqual([]);
    });

    it('not even during the shutdown drain, which writes immediately', () => {
      store.beginShutdown();

      store.touch('ABC123', EMPTY);

      expect(fs.names()).toEqual([]);
    });

    it('persists as soon as the GM broadcasts real content', () => {
      store.touch('ABC123', EMPTY);
      expect(fs.names()).toEqual([]);

      const used = session({ state: { round: 1, pass: 1, participants: [] } });
      store.touch('ABC123', used);
      jasmine.clock().tick(DEFAULT_WRITE_DEBOUNCE_MS);

      expect(fs.roomDoc('ABC123').room).toBe('ABC123');
    });

    it('persists on a first log entry with no state yet', () => {
      store.touch('ABC123', { state: null, log: [{ actor: 'GM', text: 'session opened' }] });
      jasmine.clock().tick(DEFAULT_WRITE_DEBOUNCE_MS);

      expect(fs.roomDoc('ABC123').log.length).toBe(1);
    });
  });

  // ── AC 7: durability ─────────────────────────────────────────────────────
  describe('AC 7 - durable, atomic writes and tolerant startup', () => {
    it('writes through a temp file and leaves none behind', () => {
      store.touch('ABC123', session());
      store.flush('ABC123');

      expect(fs.names()).toEqual([`ABC123${ROOM_FILE_SUFFIX}`]);
      expect(fs.names().some(n => n.endsWith(TEMP_FILE_SUFFIX))).toBeFalse();
    });

    it('a SIGKILL mid-write leaves the previous complete document, never a truncated one', () => {
      store.touch('ABC123', session({ log: [{ actor: 'GM', text: 'first' }] }));
      store.flush('ABC123');
      const before = fs.roomDoc('ABC123');

      // Simulate the process dying between the temp write and the rename.
      fs.writeFileSync(`${DATA_DIR}/ABC123${ROOM_FILE_SUFFIX}${TEMP_FILE_SUFFIX}`, '{"room":"ABC12');

      const loaded = makeStore().loadAll();

      expect(loaded.sessions.get('ABC123')!.log).toEqual(before.log);
      expect(loaded.skipped).toEqual([]); // the .tmp file is not a room file
    });

    // S6 - corrupt persisted room.
    it('S6: skips a mangled room with a logged error, loads every other room, and boots', () => {
      store.touch('ABC123', session({ log: [{ actor: 'GM', text: 'good' }] }));
      store.touch('ZZZ999', session());
      store.flushAll();
      fs.files.set(`${DATA_DIR}/BAD666${ROOM_FILE_SUFFIX}`, '{"room":"BAD666","lo');

      const loaded = makeStore().loadAll();

      expect(Array.from(loaded.sessions.keys()).sort()).toEqual(['ABC123', 'ZZZ999']);
      expect(loaded.skipped).toEqual([`BAD666${ROOM_FILE_SUFFIX}`]);
      expect(errors.some(e => e.includes('BAD666'))).toBeTrue();
    });

    it('skips a well-formed document with an invalid room code', () => {
      fs.files.set(`${DATA_DIR}/short${ROOM_FILE_SUFFIX}`,
        JSON.stringify({ room: 'short', log: [], state: null, lastActivity: clockNow }));

      const loaded = makeStore().loadAll();

      expect(loaded.sessions.size).toBe(0);
      expect(loaded.skipped.length).toBe(1);
    });
  });

  // ── AC 8: close vs end ───────────────────────────────────────────────────
  it('AC 8: remove() erases the persisted record entirely', () => {
    store.touch('ABC123', session());
    store.flush('ABC123');
    expect(fs.names().length).toBe(1);

    expect(store.remove('ABC123')).toBeTrue();

    expect(fs.names()).toEqual([]);
    expect(makeStore().loadAll().sessions.size).toBe(0);
  });

  // ── AC 11 / S5 (amended 2026-08-05): retention is indefinite ─────────────
  // Open Decision 5 was amended from "30 days since last write" to "never
  // removed for age". `lastActivity` is still recorded on every write; the sweep
  // survives only to clear the legacy expiry markers the previous build wrote.
  describe('AC 11 / S5 - retention is indefinite (Open Decision 5, amended)', () => {
    function persistedAt(room: string, when: number) {
      fs.files.set(`${DATA_DIR}/${room}${ROOM_FILE_SUFFIX}`, JSON.stringify({
        version: 1, room, lastActivity: when, state: null, log: []
      }));
    }

    it('declares itself indefinite', () => {
      expect(ROOM_RETENTION_INDEFINITE).toBeTrue();
      expect(store.retentionIndefinite).toBeTrue();
    });

    it('AC 11: keeps a room untouched for a year, and never reports one removed for age', () => {
      persistedAt('OLDEST', clockNow - 365 * DAY_MS);
      const live = new Map<string, PersistedSession>([['OLDEST', session()]]);

      const result = store.sweep(live);

      expect(result.removed).toEqual([]);
      expect(fs.names()).toContain(`OLDEST${ROOM_FILE_SUFFIX}`);
      expect(Array.from(live.keys())).toEqual(['OLDEST']); // still in memory too
    });

    it('S5: a room created, used, then untouched for months still joins normally', () => {
      store.touch('ABC123', session({ log: [{ actor: 'GM', text: 'session one' }] }));
      store.flush('ABC123');
      clockNow += 200 * DAY_MS;

      // The boot sequence a rejoin months later actually goes through.
      const afterMonths = makeStore();
      const loaded = afterMonths.loadAll();
      afterMonths.sweep(loaded.sessions);

      expect(loaded.sessions.has('ABC123')).toBeTrue();
      expect(loaded.sessions.get('ABC123')!.log.length).toBe(1);
      expect(afterMonths.expiryOf('ABC123')).toBeNull();   // no "expired" message
    });

    it('AC 11: still records lastActivity on every write', () => {
      store.touch('ABC123', session());
      store.flush('ABC123');
      expect(fs.roomDoc('ABC123').lastActivity).toBe(clockNow);

      clockNow += 5 * DAY_MS;
      store.touch('ABC123', session({ log: [{ actor: 'GM', text: 'later' }] }));
      store.flush('ABC123');
      expect(fs.roomDoc('ABC123').lastActivity).toBe(clockNow);
    });

    it('AC 11: the sweep is logged when it runs, and says nothing was aged out', () => {
      persistedAt('OLDEST', clockNow - 365 * DAY_MS);

      store.sweep(new Map());

      expect(info.some(m => m.includes('sweep') && m.includes('indefinite'))).toBeTrue();
      expect(info.some(m => m.includes('OLDEST'))).toBeFalse();
    });

    it('AC 11: never writes an expiry marker of its own', () => {
      persistedAt('OLDEST', clockNow - 365 * DAY_MS);

      store.sweep(new Map());

      expect(fs.names().some(n => n.endsWith(TOMBSTONE_FILE_SUFFIX))).toBeFalse();
      expect(store.expiryOf('OLDEST')).toBeNull();
    });

    it('the 24h timer no longer removes anything either', () => {
      store.startSweepTimer(new Map());
      persistedAt('OLDEST', clockNow - 365 * DAY_MS);

      jasmine.clock().tick(DAY_MS);

      expect(fs.names()).toContain(`OLDEST${ROOM_FILE_SUFFIX}`);
    });

    // S5: the tombstone machinery stays for *removed* rooms, not for age.
    describe('legacy expiry markers (S5: kept for removed rooms, not for age)', () => {
      function legacyTombstone(room: string, expiredAt: number) {
        fs.files.set(`${DATA_DIR}/${room}${TOMBSTONE_FILE_SUFFIX}`, JSON.stringify({
          version: 1, room, expiredAt, lastActivity: expiredAt
        }));
      }

      it('still reads a marker left by the previous 30-day build', () => {
        legacyTombstone('OLDEXP', clockNow - DAY_MS);
        // `reason: null` (round-4 defect D7): a legacy marker never recorded
        // one, unlike a capacity-eviction tombstone written by `evict()`.
        expect(store.expiryOf('OLDEXP')).toEqual({ expiredAt: clockNow - DAY_MS, reason: null });
      });

      it('clears a marker once it is past the marker-retention window', () => {
        legacyTombstone('OLDEXP', clockNow - (DEFAULT_TOMBSTONE_RETENTION_MS + DAY_MS));

        expect(store.sweep(new Map()).tombstonesRemoved).toBe(1);
        expect(fs.names()).toEqual([]);
      });

      it('keeps a recent marker, so the message survives a restart', () => {
        legacyTombstone('OLDEXP', clockNow - DAY_MS);

        expect(store.sweep(new Map()).tombstonesRemoved).toBe(0);
        expect(fs.names()).toContain(`OLDEXP${TOMBSTONE_FILE_SUFFIX}`);
      });

      it('clears a corrupt marker rather than leaving it unreadable forever', () => {
        fs.files.set(`${DATA_DIR}/BADEXP${TOMBSTONE_FILE_SUFFIX}`, '{"room":"BADEX');

        expect(store.sweep(new Map()).tombstonesRemoved).toBe(1);
        expect(fs.names()).toEqual([]);
      });

      it('an explicit End Room still removes both the room and any marker', () => {
        store.touch('ABC123', session());
        store.flush('ABC123');
        legacyTombstone('ABC123', clockNow - DAY_MS);

        expect(store.remove('ABC123')).toBeTrue();

        expect(fs.names()).toEqual([]);
        expect(store.expiryOf('ABC123')).toBeNull();
      });
    });
  });

  // ── AC 3: the room survives a restart and a multi-day gap ────────────────
  it('AC 3 / S2: a room written on Sunday is still loadable after two restarts and three days', () => {
    const encounter = {
      round: 2, pass: 2,
      participants: [{ id: 'p-1', name: 'Wombat', order: 1, active: false, playerControlled: true }]
    };
    store.touch('ABC123', session({ state: encounter, log: [{ actor: 'Wombat', text: 'acted' }] }));
    store.flush('ABC123');

    // Restart #1, restart #2, three days later.
    makeStore().loadAll();
    clockNow += 3 * DAY_MS;
    const afterRestart = makeStore().loadAll();

    expect(afterRestart.sessions.get('ABC123')!.state).toEqual(encounter);
    expect(afterRestart.sessions.get('ABC123')!.log.length).toBe(1);
  });
});

// ── AC 16 (added 2026-08-05): unauthenticated room creation is bounded ───────
// `hasPersistableContent` only ever stopped a *single* contentless room reaching
// the disk. The attack the spec actually names is a loop - create a room, give
// it content with `session:append-log`, repeat - where every write is
// individually legitimate. That can only be stopped at the create, plus the
// companion in-memory leak of rooms that are created and never used.
describe('Durable rooms - room-creation bounds (AC 16)', () => {
  let clockNow: number;
  let limiter: RoomCreationLimiter;

  beforeEach(() => {
    clockNow = Date.parse('2026-08-05T12:00:00.000Z');
    limiter = createRoomCreationLimiter({ now: () => clockNow });
  });

  describe('rate limit on gm:create-session', () => {
    it('allows an ordinary GM: one room, then another later', () => {
      expect(limiter.tryCreate('1.2.3.4').allowed).toBeTrue();
      clockNow += 10 * 60 * 1000;
      expect(limiter.tryCreate('1.2.3.4').allowed).toBeTrue();
    });

    it('AC 16: a create-loop is refused once it passes the cap', () => {
      const results: boolean[] = [];
      for (let i = 0; i < ROOM_CREATE_LIMIT + 50; i++) {
        results.push(limiter.tryCreate('9.9.9.9').allowed);
      }

      expect(results.filter(Boolean).length).toBe(ROOM_CREATE_LIMIT);
      expect(results[ROOM_CREATE_LIMIT]).toBeFalse();
    });

    it('AC 16: 1000 create attempts cost at most ROOM_CREATE_LIMIT rooms per window', () => {
      let allowed = 0;
      for (let i = 0; i < 1000; i++) {
        if (limiter.tryCreate('9.9.9.9').allowed) { allowed++; }
      }
      expect(allowed).toBe(ROOM_CREATE_LIMIT);
    });

    it('tells the caller how long to wait, so the GM UI can say so', () => {
      for (let i = 0; i < ROOM_CREATE_LIMIT; i++) { limiter.tryCreate('9.9.9.9'); }
      clockNow += 20 * 1000;

      const denied = limiter.tryCreate('9.9.9.9');

      expect(denied.allowed).toBeFalse();
      expect(denied.retryAfterMs).toBe(ROOM_CREATE_WINDOW_MS - 20 * 1000);
    });

    it('a denied attempt does not extend the lockout', () => {
      for (let i = 0; i < ROOM_CREATE_LIMIT; i++) { limiter.tryCreate('9.9.9.9'); }
      clockNow += ROOM_CREATE_WINDOW_MS - 1;
      expect(limiter.tryCreate('9.9.9.9').allowed).toBeFalse();  // hammering...
      clockNow += 1;

      expect(limiter.tryCreate('9.9.9.9').allowed).toBeTrue();   // ...window still opens
    });

    it('does not punish an innocent GM on another origin', () => {
      for (let i = 0; i < ROOM_CREATE_LIMIT + 5; i++) { limiter.tryCreate('9.9.9.9'); }

      expect(limiter.tryCreate('1.2.3.4').allowed).toBeTrue();
    });

    it('the limiter is not itself an unbounded map', () => {
      for (let i = 0; i < 500; i++) { limiter.tryCreate(`origin-${i}`); }
      expect(limiter.size()).toBe(500);

      clockNow += ROOM_CREATE_WINDOW_MS;
      const dropped = limiter.prune();

      expect(dropped).toBe(500);
      expect(limiter.size()).toBe(0);
    });

    it('prune keeps a window that is still open', () => {
      limiter.tryCreate('1.2.3.4');
      clockNow += ROOM_CREATE_WINDOW_MS - 1;

      limiter.prune();

      expect(limiter.size()).toBe(1);
    });
  });

  describe('contentless rooms do not live in memory forever', () => {
    function makeSessions(entries: [string, PersistedSession][]) {
      return new Map<string, PersistedSession>(entries);
    }

    function reap(sessions: Map<string, PersistedSession>, onReap?: (room: string) => void) {
      return reapContentlessRooms(sessions, {
        now: () => clockNow,
        ttlMs: CONTENTLESS_ROOM_TTL_MS,
        hasContent: hasPersistableContent,
        onReap
      });
    }

    it('AC 16: a room created and never used is dropped after the grace period', () => {
      const sessions = makeSessions([
        ['UNUSED', { state: null, log: [], createdAt: clockNow }]
      ]);

      expect(reap(sessions)).toEqual([]);          // still inside the grace period
      clockNow += CONTENTLESS_ROOM_TTL_MS;

      expect(reap(sessions)).toEqual(['UNUSED']);
      expect(sessions.size).toBe(0);
    });

    it('AC 16: 1000 unauthenticated creates leave nothing behind in memory', () => {
      const sessions = new Map<string, PersistedSession>();
      for (let i = 0; i < 1000; i++) {
        sessions.set(createRoomCode(), { state: null, log: [], createdAt: clockNow });
      }
      clockNow += CONTENTLESS_ROOM_TTL_MS;

      reap(sessions);

      expect(sessions.size).toBe(0);
    });

    it('never touches a room that has content, however old', () => {
      const sessions = makeSessions([
        ['INUSE1', {
          state: { round: 1, pass: 1, participants: [] }, log: [], createdAt: clockNow
        }],
        ['LOGGED', { state: null, log: [{ actor: 'GM', text: 'hi' }], createdAt: clockNow }]
      ]);
      clockNow += 365 * DAY_MS;

      expect(reap(sessions)).toEqual([]);
      expect(sessions.size).toBe(2);
    });

    it('leaves a restored-from-disk room alone even if it somehow looks empty', () => {
      // loadAll() produces no `createdAt`. Unknown age must never be reaped.
      const sessions = makeSessions([['FROMFS', { state: null, log: [] }]]);
      clockNow += 365 * DAY_MS;

      expect(reap(sessions)).toEqual([]);
      expect(sessions.size).toBe(1);
    });

    it('hands each reaped room to the caller so GM presence is cleaned up too', () => {
      const sessions = makeSessions([
        ['UNUSED', { state: null, log: [], createdAt: clockNow }]
      ]);
      const presence = new Map<string, Set<string>>([['UNUSED', new Set(['sock-1'])]]);
      clockNow += CONTENTLESS_ROOM_TTL_MS;

      reap(sessions, (room) => presence.delete(room));

      expect(presence.size).toBe(0);
    });

    it('a room that gains content inside the grace period is safe forever', () => {
      const sessions = makeSessions([
        ['ABC123', { state: null, log: [], createdAt: clockNow }]
      ]);
      clockNow += CONTENTLESS_ROOM_TTL_MS / 2;
      sessions.get('ABC123')!.state = { round: 1, pass: 1, participants: [] };
      clockNow += CONTENTLESS_ROOM_TTL_MS;

      expect(reap(sessions)).toEqual([]);
    });
  });
});

// ── Adversarial review of the AC 15/16/17 increment, 2026-08-05 ──────────────
// Defects confirmed live against a running server. D1: the create-limiter's
// origin key was the leftmost X-Forwarded-For entry, which nginx's
// `$proxy_add_x_forwarded_for` lets the client choose (40 sockets with distinct
// spoofed headers created 120 rooms, zero refusals). D2: a GM socket that
// created or joined a second room never left the first one.
describe('Durable rooms - review defects D1, D2 (server guards)', () => {
  // ── D1: the rate-limit key must be one the caller cannot pick ─────────────
  describe('D1 - the creation origin key is not client-controlled', () => {
    /** What nginx's `$proxy_add_x_forwarded_for` produces: client value, then peer. */
    function forwarded(clientSupplied: string, peer = '203.0.113.7') {
      return { 'x-forwarded-for': clientSupplied ? `${clientSupplied}, ${peer}` : peer };
    }

    it('D1: keys on the entry the proxy appended, not the one the client sent', () => {
      const key = creationOriginKey({
        headers: forwarded('1.1.1.1'), trustProxy: true, address: '127.0.0.1'
      });

      expect(key).toBe('203.0.113.7');
      expect(key).not.toBe('1.1.1.1');
    });

    it('D1: a client that varies its spoofed value cannot vary its key', () => {
      const keys = new Set<string>();
      for (let i = 0; i < 40; i++) {
        keys.add(creationOriginKey({
          headers: forwarded(`10.0.0.${i}`), trustProxy: true, address: '127.0.0.1'
        }));
      }

      expect(Array.from(keys)).toEqual(['203.0.113.7']);
    });

    it('D1: 40 spoofed origins behind one proxy are refused after the cap, not waved through', () => {
      let clock = 0;
      const limiter = createRoomCreationLimiter({ now: () => clock });
      let allowed = 0;

      // The live repro: 40 sockets, 3 creates each, every socket a different XFF.
      for (let socket = 0; socket < 40; socket++) {
        for (let attempt = 0; attempt < 3; attempt++) {
          const key = creationOriginKey({
            headers: forwarded(`10.0.0.${socket}`), trustProxy: true, address: '127.0.0.1'
          });
          if (limiter.tryCreate(key).allowed) { allowed++; }
        }
      }

      expect(allowed).toBe(ROOM_CREATE_LIMIT);   // was 120 before the fix
    });

    it('honours a deeper trusted-hop count when another proxy sits in front', () => {
      const headers = { 'x-forwarded-for': 'spoofed, 198.51.100.9, 203.0.113.7' };

      expect(creationOriginKey({ headers, trustProxy: true, proxyHops: 2 })).toBe('198.51.100.9');
      expect(creationOriginKey({ headers, trustProxy: true, proxyHops: 1 })).toBe('203.0.113.7');
    });

    it('never indexes past the left end when the client sends fewer entries than hops', () => {
      const headers = { 'x-forwarded-for': '203.0.113.7' };

      expect(creationOriginKey({ headers, trustProxy: true, proxyHops: 3 })).toBe('203.0.113.7');
    });

    it('ignores the header entirely when the proxy is not trusted (SR5E_TRUST_PROXY=0)', () => {
      const key = creationOriginKey({
        headers: forwarded('1.1.1.1'), trustProxy: false, address: '198.51.100.4'
      });

      expect(key).toBe('198.51.100.4');
    });

    // ── Round-3 fix 3: trusting XFF is opt-in, not opt-out ──────────────────
    describe('fix 3 - with no configured proxy the header is ignored entirely', () => {
      it('defaults to NOT trusting X-Forwarded-For', () => {
        // No `trustProxy` at all: the deployment has not said a proxy exists, so
        // the header is attacker-supplied noise and the raw peer address wins.
        const key = creationOriginKey({
          headers: forwarded('1.1.1.1'), address: '198.51.100.42'
        });

        expect(key).toBe('198.51.100.42');
      });

      it('a direct caller cannot vary its key by varying the header', () => {
        const keys = new Set<string>();
        for (let i = 0; i < 40; i++) {
          keys.add(creationOriginKey({
            headers: { 'x-forwarded-for': `10.0.0.${i}` }, address: '198.51.100.42'
          }));
        }

        expect(Array.from(keys)).toEqual(['198.51.100.42']);
      });

      it('a rightmost-entry spoof cannot bypass the limiter when accessed directly', () => {
        // Before the fix, counting back from the right was sound only if a proxy
        // was really appending an entry. Reached directly there is no appended
        // entry, so the rightmost value was the caller's again - 40 "origins",
        // 120 rooms, zero refusals.
        let clock = 0;
        const limiter = createRoomCreationLimiter({ now: () => clock });
        let allowed = 0;

        for (let socket = 0; socket < 40; socket++) {
          for (let attempt = 0; attempt < 3; attempt++) {
            const key = creationOriginKey({
              headers: { 'x-forwarded-for': `10.0.0.${socket}` },   // no proxy appended anything
              address: '198.51.100.42'
            });
            if (limiter.tryCreate(key).allowed) { allowed++; }
          }
        }

        expect(allowed).toBe(ROOM_CREATE_LIMIT);
      });

      it('proxyHops is inert unless the proxy is trusted', () => {
        const headers = { 'x-forwarded-for': 'spoofed, 198.51.100.9, 203.0.113.7' };

        expect(creationOriginKey({ headers, proxyHops: 2, address: '127.0.0.1' })).toBe('127.0.0.1');
      });
    });

    it('falls back to the socket address, then the socket id, with no usable header', () => {
      expect(creationOriginKey({ headers: {}, address: '198.51.100.4' })).toBe('198.51.100.4');
      expect(creationOriginKey({ headers: { 'x-forwarded-for': ' , ' }, socketId: 'sock-1' }))
        .toBe('sock-1');
    });
  });

  // ── D1: a rate limit bounds the rate, a cap bounds the total ──────────────
  describe('D1 - a hard cap on total rooms held', () => {
    function sessionsOfSize(n: number) {
      const map = new Map<string, PersistedSession>();
      for (let i = 0; i < n; i++) { map.set(`R${String(i).padStart(5, '0')}`, session()); }
      return map;
    }

    it('D1: refuses further creates once the cap is reached', () => {
      expect(roomCapReached(sessionsOfSize(TOTAL_ROOM_CAP - 1))).toBeFalse();
      expect(roomCapReached(sessionsOfSize(TOTAL_ROOM_CAP))).toBeTrue();
      expect(roomCapReached(sessionsOfSize(TOTAL_ROOM_CAP + 10))).toBeTrue();
    });

    it('D1: the cap is generous next to real use - one room per table', () => {
      expect(TOTAL_ROOM_CAP).toBeGreaterThanOrEqual(100);
      expect(roomCapReached(sessionsOfSize(20))).toBeFalse();
    });

    it('D1: a slow create-loop that stays under the rate limit still hits the cap', () => {
      let clock = 0;
      const limiter = createRoomCreationLimiter({ now: () => clock });
      const sessions = new Map<string, PersistedSession>();

      for (let i = 0; i < TOTAL_ROOM_CAP + 200; i++) {
        clock += ROOM_CREATE_WINDOW_MS;             // never rate-limited
        if (roomCapReached(sessions, TOTAL_ROOM_CAP)) { break; }
        if (limiter.tryCreate('203.0.113.7').allowed) {
          sessions.set(createRoomCode() + i, session());
        }
      }

      expect(sessions.size).toBe(TOTAL_ROOM_CAP);
    });
  });

  // ── D2: a GM socket leaves its old room before joining another ────────────
  describe('D2 - switching rooms detaches the socket from the old one', () => {
    interface FakeSocket {
      id: string;
      data: { room?: string; role?: string };
      rooms: Set<string>;
      leave: (room: string) => void;
      join: (room: string) => void;
    }

    let presence: Map<string, Set<string>>;

    function gmSocket(id: string, room?: string): FakeSocket {
      const socket: FakeSocket = {
        id,
        data: { room, role: 'gm' },
        rooms: new Set(room ? [room] : []),
        leave(r: string) { this.rooms.delete(r); },
        join(r: string) { this.rooms.add(r); }
      };
      if (room) { presence.set(room, new Set([id])); }
      return socket;
    }

    /** The server's own `setGmPresence(room, id, false)` hook. */
    function clearGmPresence(room: string, socketId: string) {
      presence.get(room)?.delete(socketId);
    }

    function gmConnected(room: string) {
      const set = presence.get(room);
      return !!set && set.size > 0;
    }

    /** What `gm:join-session` / `gm:create-session` now do around the join. */
    function switchTo(socket: FakeSocket, room: string) {
      const left = detachFromPreviousRoom(socket, room, { clearGmPresence });
      socket.join(room);
      socket.data.room = room;
      presence.set(room, new Set([socket.id]));
      return left;
    }

    beforeEach(() => { presence = new Map(); });

    it('D2: joining a different room leaves the old Socket.IO room', () => {
      const socket = gmSocket('gm-1', 'AAAAAA');

      expect(switchTo(socket, 'BBBBBB')).toBe('AAAAAA');

      // No longer a member of A, so A's commands and log entries no longer
      // reach this socket and cannot mutate room B's encounter.
      expect(socket.rooms.has('AAAAAA')).toBeFalse();
      expect(Array.from(socket.rooms)).toEqual(['BBBBBB']);
      expect(socket.data.room).toBe('BBBBBB');
    });

    it('D2: the abandoned room reports no GM connected', () => {
      const socket = gmSocket('gm-1', 'AAAAAA');
      expect(gmConnected('AAAAAA')).toBeTrue();

      switchTo(socket, 'BBBBBB');

      expect(gmConnected('AAAAAA')).toBeFalse();   // was true forever before
      expect(gmConnected('BBBBBB')).toBeTrue();
    });

    it('D2: creating a new session detaches exactly the same way', () => {
      const socket = gmSocket('gm-1', 'AAAAAA');

      switchTo(socket, createRoomCode());

      expect(socket.rooms.has('AAAAAA')).toBeFalse();
      expect(gmConnected('AAAAAA')).toBeFalse();
    });

    it('D2: a second GM still in the old room keeps it marked connected', () => {
      const first = gmSocket('gm-1', 'AAAAAA');
      presence.get('AAAAAA')!.add('gm-2');

      switchTo(first, 'BBBBBB');

      expect(gmConnected('AAAAAA')).toBeTrue();
    });

    it('D2: rejoining the room it already holds is a no-op', () => {
      const socket = gmSocket('gm-1', 'AAAAAA');

      expect(detachFromPreviousRoom(socket, 'AAAAAA', { clearGmPresence })).toBeNull();

      expect(socket.rooms.has('AAAAAA')).toBeTrue();
      expect(gmConnected('AAAAAA')).toBeTrue();
      expect(socket.data.room).toBe('AAAAAA');
    });

    it('D2: a fresh socket with no previous room has nothing to leave', () => {
      const socket = gmSocket('gm-1');

      expect(detachFromPreviousRoom(socket, 'BBBBBB', { clearGmPresence })).toBeNull();
    });

    it('D2: a non-GM socket leaves the room without touching GM presence', () => {
      const socket = gmSocket('pl-1', 'AAAAAA');
      socket.data.role = 'player';

      detachFromPreviousRoom(socket, 'BBBBBB', { clearGmPresence });

      expect(socket.rooms.has('AAAAAA')).toBeFalse();
      expect(gmConnected('AAAAAA')).toBeTrue();     // the GM there is unaffected
    });

    it('D2: the room is left, not destroyed - it stays joinable by code', () => {
      const sessions = new Map<string, PersistedSession>([['AAAAAA', session()]]);
      const socket = gmSocket('gm-1', 'AAAAAA');

      switchTo(socket, 'BBBBBB');

      expect(sessions.has('AAAAAA')).toBeTrue();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Round-3 review defects. Fixes 1 and 2 are one root cause: "does this socket
// belong to the room it named" was answered per handler, so one handler
// (`session:command`) never grew the answer, and one teardown (`End Room`)
// cleared Socket.IO membership without clearing the thing the answer reads.
// ─────────────────────────────────────────────────────────────────────────────
describe('Durable rooms - the shared room-ownership rule (round-3 fixes 1, 2)', () => {
  const OPTS = { isRoomCode, roomExists: (room: string) => room === 'AAAAAA' || room === 'BBBBBB' };

  function gm(room?: string) { return { role: 'gm', room }; }
  function player(room?: string) { return { role: 'player', room }; }

  describe('fix 1 - session:command is guarded by the same rule as the write paths', () => {
    it('fix 1: refuses a command aimed at a room this socket does not belong to', () => {
      // The live repro: a socket that called the credential-free
      // `gm:create-session` (so it owns BBBBBB) aims `act` at AAAAAA.
      const verdict = authorizeRoomPacket(
        'session:command',
        { room: 'AAAAAA', command: { type: 'act', player: 'GM' } },
        gm('BBBBBB'),
        OPTS
      );

      expect(verdict.ok).toBeFalse();
      expect(verdict.reason).toBe('room-mismatch');
    });

    it('fix 1: every injectable command type is refused, not just the obvious ones', () => {
      const types = [
        'act', 'delay', 'interrupt', 'register_character', 'claim_character',
        'release_claims', 'roll_submission', 'dice_roll', 'request_rolls',
        'clear_roll_prompt', 'combat_ended', 'configure_deck'
      ];

      for (const type of types) {
        const verdict = authorizeRoomPacket(
          'session:command',
          { room: 'AAAAAA', command: { type, player: 'p1' } },
          player('BBBBBB'),
          OPTS
        );
        expect(verdict.ok).withContext(type).toBeFalse();
        expect(verdict.reason).withContext(type).toBe('room-mismatch');
      }
    });

    it('fix 1: a socket with no room at all cannot command any room', () => {
      const verdict = authorizeRoomPacket(
        'session:command', { room: 'AAAAAA', command: { type: 'act', player: 'GM' } }, {}, OPTS
      );

      expect(verdict.ok).toBeFalse();
      expect(verdict.reason).toBe('role-required: gm or player');
    });

    it('fix 1: the room\'s own GM and players are unaffected', () => {
      expect(authorizeRoomPacket(
        'session:command', { room: 'AAAAAA', command: {} }, gm('AAAAAA'), OPTS
      ).ok).toBeTrue();
      expect(authorizeRoomPacket(
        'session:command', { room: 'AAAAAA', command: {} }, player('AAAAAA'), OPTS
      ).ok).toBeTrue();
    });
  });

  describe('the rule is one rule, applied to every room-scoped event', () => {
    const roomScoped = [
      'session:update-state', 'session:append-log', 'session:command',
      'gm:close-session', 'gm:end-session'
    ];

    it('refuses a cross-room packet on every one of them', () => {
      for (const event of roomScoped) {
        const verdict = authorizeRoomPacket(event, { room: 'AAAAAA' }, gm('BBBBBB'), OPTS);
        expect(verdict.ok).withContext(event).toBeFalse();
        expect(verdict.reason).withContext(event).toBe('room-mismatch');
      }
    });

    it('allows the same packet from the room\'s own GM', () => {
      for (const event of roomScoped) {
        expect(authorizeRoomPacket(event, { room: 'AAAAAA' }, gm('AAAAAA'), OPTS).ok)
          .withContext(event).toBeTrue();
      }
    });

    it('default-denies an event nobody registered, purely from its payload shape', () => {
      // The point of the choke point: a handler added later that names a room is
      // guarded whether or not anyone remembered to list it. This is what stops
      // the `session:command` hole reappearing under a new event name.
      const verdict = authorizeRoomPacket(
        'session:some-future-event', { room: 'AAAAAA' }, gm('BBBBBB'), OPTS
      );

      expect(ROOM_SCOPED_EVENTS.has('session:some-future-event')).toBeFalse();
      expect(verdict.ok).toBeFalse();
      expect(verdict.reason).toBe('room-mismatch');
    });

    it('leaves events that name no room alone', () => {
      expect(authorizeRoomPacket('disconnect', undefined, gm('AAAAAA'), OPTS).ok).toBeTrue();
      expect(authorizeRoomPacket('some:ping', { note: 'hi' }, {}, OPTS).ok).toBeTrue();
    });

    it('exempts exactly the three events that assign membership', () => {
      expect(Array.from(ROOM_ENTRY_EVENTS).sort())
        .toEqual([ 'gm:create-session', 'gm:join-session', 'player:join' ]);
      for (const event of ROOM_ENTRY_EVENTS) {
        expect(authorizeRoomPacket(event, { room: 'AAAAAA' }, {}, OPTS).ok)
          .withContext(event).toBeTrue();
      }
    });

    it('keeps the per-event role requirement (state broadcasts are GM-only)', () => {
      expect(authorizeRoomPacket('session:update-state', { room: 'AAAAAA' }, player('AAAAAA'), OPTS))
        .toEqual(jasmine.objectContaining({ ok: false, reason: 'role-required: gm' }));
      expect(authorizeRoomPacket('session:append-log', { room: 'AAAAAA' }, player('AAAAAA'), OPTS).ok)
        .toBeTrue();
    });

    it('rejects a malformed room code before anything else', () => {
      expect(authorizeRoomPacket('session:command', { room: 'nope' }, gm('AAAAAA'), OPTS))
        .toEqual(jasmine.objectContaining({ ok: false, reason: 'invalid-room-code' }));
    });

    it('answers "room not found" for lifecycle events on a room that is gone (defect D5)', () => {
      // End Room clears the issuing socket's own membership (fix 2), so a retry
      // after a lost ack arrives with no room at all. It must still read as the
      // terminal success it is, not as an auth error.
      const verdict = authorizeRoomPacket('gm:end-session', { room: 'ZZZZZZ' }, {}, OPTS);

      expect(verdict.ok).toBeFalse();
      expect(verdict.notFound).toBeTrue();
    });

    it('does not require an existing room for the write paths, so a reaped room self-heals', () => {
      // `session:update-state` recreates a room the contentless reaper dropped
      // (AC 16); adding an existence requirement there would break that.
      expect(authorizeRoomPacket('session:update-state', { room: 'ZZZZZZ' }, gm('ZZZZZZ'), OPTS).ok)
        .toBeTrue();
    });
  });

  describe('fix 2 - ending a room detaches every socket, not just Socket.IO membership', () => {
    // Mirrors `evacuateRoom` in server.js: `socketsLeave()` clears
    // `socket.rooms` but not `socket.data.room`, and `socket.data.room` is what
    // the ownership rule authorises against.
    interface FakeSocket { id: string; data: { room?: string; role?: string }; rooms: Set<string>; }

    function socketsIn(room: string, ids: string[]): FakeSocket[] {
      return ids.map(id => ({ id, data: { room, role: 'gm' }, rooms: new Set([room]) }));
    }

    /** The old teardown: Socket.IO membership only. */
    function socketsLeaveOnly(sockets: FakeSocket[], room: string) {
      for (const s of sockets) { s.rooms.delete(room); }
    }

    /** The new teardown. */
    function evacuate(sockets: FakeSocket[], room: string) {
      let detached = 0;
      for (const s of sockets) {
        if (s.data.room === room) {
          s.data.room = undefined;
          s.data.role = undefined;
          detached++;
        }
        s.rooms.delete(room);
      }
      return detached;
    }

    it('fix 2: the old teardown left a second GM socket able to act on the ended room', () => {
      const sockets = socketsIn('AAAAAA', [ 'gm-1', 'gm-2' ]);

      socketsLeaveOnly(sockets, 'AAAAAA');

      // Room gone from `sessions`, but the second tab still passes the rule and
      // its next broadcast runs getOrCreateSession - resurrecting it, forever,
      // because retention is indefinite.
      const verdict = authorizeRoomPacket(
        'session:update-state', { room: 'AAAAAA' }, sockets[1].data,
        { isRoomCode, roomExists: () => false }
      );
      expect(verdict.ok).toBeTrue();
    });

    it('fix 2: evacuating clears room and role on EVERY attached socket', () => {
      const sockets = socketsIn('AAAAAA', [ 'gm-1', 'gm-2', 'gm-3' ]);

      expect(evacuate(sockets, 'AAAAAA')).toBe(3);

      for (const s of sockets) {
        expect(s.data.room).toBeUndefined();
        expect(s.data.role).toBeUndefined();
        expect(s.rooms.has('AAAAAA')).toBeFalse();
      }
    });

    it('fix 2: no evacuated socket can broadcast into the ended room afterwards', () => {
      const sockets = socketsIn('AAAAAA', [ 'gm-1', 'gm-2' ]);

      evacuate(sockets, 'AAAAAA');

      for (const s of sockets) {
        const verdict = authorizeRoomPacket(
          'session:update-state', { room: 'AAAAAA' }, s.data,
          { isRoomCode, roomExists: () => false }
        );
        expect(verdict.ok).withContext(s.id).toBeFalse();
      }
    });

    it('fix 2: sockets in other rooms are untouched', () => {
      const mine = socketsIn('AAAAAA', [ 'gm-1' ]);
      const theirs = socketsIn('BBBBBB', [ 'gm-2' ]);

      expect(evacuate([ ...mine, ...theirs ], 'AAAAAA')).toBe(1);

      expect(theirs[0].data.room).toBe('BBBBBB');
      expect(theirs[0].data.role).toBe('gm');
    });
  });
});

describe('Durable rooms - the room cap has a recovery path (round-3 fix 4)', () => {
  function sessionAt(lastActivity: number): PersistedSession {
    return session({ lastActivity });
  }

  function rooms(entries: Array<[string, number]>) {
    return new Map<string, PersistedSession>(entries.map(([ room, at ]) => [ room, sessionAt(at) ]));
  }

  it('fix 4: evicts the least recently active unoccupied room', () => {
    const sessions = rooms([[ 'AAAAAA', 5000 ], [ 'BBBBBB', 1000 ], [ 'CCCCCC', 9000 ]]);

    expect(findEvictableRoom(sessions, { hasConnectedSockets: () => false })).toBe('BBBBBB');
  });

  it('fix 4: never evicts a room somebody is connected to, however idle', () => {
    const sessions = rooms([[ 'AAAAAA', 5000 ], [ 'BBBBBB', 1 ], [ 'CCCCCC', 9000 ]]);

    // BBBBBB is the oldest by a mile and is still occupied - a table mid-game.
    expect(findEvictableRoom(sessions, { hasConnectedSockets: (r) => r === 'BBBBBB' }))
      .toBe('AAAAAA');
  });

  it('fix 4: refuses (returns null) when every room is occupied', () => {
    const sessions = rooms([[ 'AAAAAA', 5000 ], [ 'BBBBBB', 1000 ]]);

    expect(findEvictableRoom(sessions, { hasConnectedSockets: () => true })).toBeNull();
  });

  it('fix 4: an unstamped room is evictable, but loses to a room with an older stamp', () => {
    const sessions = new Map<string, PersistedSession>([
      [ 'AAAAAA', session() ],                       // no lastActivity at all
      [ 'BBBBBB', sessionAt(1000) ]
    ]);

    expect(findEvictableRoom(sessions, { hasConnectedSockets: () => false })).toBe('AAAAAA');
    expect(findEvictableRoom(new Map([[ 'BBBBBB', sessionAt(1000) ]]), {})).toBe('BBBBBB');
  });

  it('fix 4: the cap stops being a permanent lockout - a create at the cap succeeds', () => {
    // The defect: with indefinite retention nothing ever removed a room, so once
    // 500 existed every create was refused forever with no in-app recovery.
    const sessions = new Map<string, PersistedSession>();
    for (let i = 0; i < TOTAL_ROOM_CAP; i++) {
      sessions.set(`R${String(i).padStart(5, '0')}`, sessionAt(i));
    }
    expect(roomCapReached(sessions, TOTAL_ROOM_CAP)).toBeTrue();

    const victim = findEvictableRoom(sessions, { hasConnectedSockets: () => false });
    expect(victim).toBe('R00000');                   // the least recently active
    sessions.delete(victim as string);

    expect(roomCapReached(sessions, TOTAL_ROOM_CAP)).toBeFalse();
    sessions.set('NEW001', sessionAt(999999));
    expect(sessions.size).toBe(TOTAL_ROOM_CAP);
  });

  it('fix 4: evicts one room per create, not a batch', () => {
    const sessions = rooms([[ 'AAAAAA', 1 ], [ 'BBBBBB', 2 ], [ 'CCCCCC', 3 ]]);
    const before = sessions.size;

    sessions.delete(findEvictableRoom(sessions, {}) as string);

    expect(sessions.size).toBe(before - 1);
  });
});

describe('Durable rooms - GM client (AC 1, 2, 4, 5, 9, 10, 12, 15, 17; S1, S2, S3)', () => {
  let component: BattleTrackerComponent;
  let fixture: ComponentFixture<BattleTrackerComponent>;
  let sync: SessionSyncService;
  let broadcasts: SharedCombatState[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BattleTrackerComponent],
      providers: appConfig.providers
    }).compileComponents();

    fixture = TestBed.createComponent(BattleTrackerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    resetCombat();

    sync = TestBed.inject(SessionSyncService);
    broadcasts = [];
    spyOn(sync, 'broadcastState').and.callFake((s: SharedCombatState) => { broadcasts.push(s); });
    spyOn(sync, 'appendLog');
    spyOn(sync, 'connect');
  });

  afterEach(() => {
    resetCombat();
  });

  /** The live encounter from scenario S1: turn 2, pass 2, decker + OOC NPC. */
  function buildLiveEncounter() {
    CombatManager.combatTurn = 2;
    CombatManager.initiativePass = 2;
    CombatManager.started = true;
    CombatManager.passEnded = false;

    const decker = new MatrixParticipant();
    decker.name = 'Slice';
    decker.dataProcessing = 7;
    decker.vrMode = VRMode.HotSim;
    decker.jackedIn = true;
    decker.blocksPhysicalActions = true;
    decker.setDicesWithoutRoll(4);
    decker.baseIni = 12;
    CombatManager.participants.insert(decker, false);
    decker.diceIni = 14;              // Score 26

    const street = new Participant();
    street.name = 'Ganger';
    street.baseIni = 8;
    CombatManager.participants.insert(street, false);
    street.diceIni = 3;

    const downed = new Participant();
    downed.name = 'Downed NPC';
    downed.baseIni = 8;
    CombatManager.participants.insert(downed, false);
    downed.physicalHealth = 10;
    downed.physicalDamage = 10;      // OOC: never appears in a broadcast at all

    component.shareRoomCode = 'ABC123';
    return { decker, street, downed };
  }

  // ── S1 / AC 1, 2, 12: pm2 restart with the GM tab open ───────────────────
  describe('S1 - pm2 restart mid-combat, GM tab still open (AC 1, 2, 12)', () => {
    /**
     * The lossy snapshot the server would hand back. If reconnect ever pulled,
     * this is what the GM's screen would be downgraded to.
     */
    function staleServerState(): SharedCombatState {
      return {
        round: 1, pass: 1, started: false, passEnded: true, currentInitiative: 0,
        participants: [{
          id: 'p-old', name: 'Someone else', order: 1, active: false,
          initiativeScore: 3, playerControlled: false, initiativeDice: 1, pendingRoll: true
        }]
      };
    }

    it('re-authenticates and pushes local state; the GM screen does not change (AC 1, AC 2)', async () => {
      const { decker } = buildLiveEncounter();
      const scoreBefore = decker.currentInitiativeScore;
      const joinSpy = spyOn(sync, 'joinAsGm').and.resolveTo({ state: staleServerState(), log: [] });

      await component['handleSessionReconnected']();

      // Re-authenticated...
      expect(joinSpy).toHaveBeenCalledWith('ABC123');
      // ...and PUSHED, not pulled.
      expect(broadcasts.length).toBe(1);
      expect(broadcasts[0].round).toBe(2);
      expect(broadcasts[0].pass).toBe(2);
      expect(broadcasts[0].participants.map(p => p.name)).toEqual(['Slice', 'Ganger']);

      // Local state is untouched: subclass, dice, running Score, OOC entry.
      expect(CombatManager.participants.items.length).toBe(3);
      expect(CombatManager.participants.items[0] instanceof MatrixParticipant).toBeTrue();
      expect((CombatManager.participants.items[0] as MatrixParticipant).vrMode).toBe(VRMode.HotSim);
      expect(decker.currentInitiativeScore).toBe(scoreBefore);
      expect(CombatManager.combatTurn).toBe(2);
      expect(CombatManager.initiativePass).toBe(2);
      expect(CombatManager.participants.items[2].ooc).toBeTrue();
    });

    it('never calls restoreFromSharedState on a reconnect (Open Decision 6)', async () => {
      buildLiveEncounter();
      spyOn(sync, 'joinAsGm').and.resolveTo({ state: staleServerState(), log: [] });
      const restoreSpy = spyOn<never>(component as never, 'restoreFromSharedState' as never);

      await component['handleSessionReconnected']();

      expect(restoreSpy).not.toHaveBeenCalled();
    });

    it('clears the connection warning once the push succeeds', async () => {
      buildLiveEncounter();
      component.shareConnectionLost = true;
      spyOn(sync, 'joinAsGm').and.resolveTo({ state: null, log: [] });

      await component['handleSessionReconnected']();

      expect(component.shareConnectionLost).toBeFalse();
      expect(component.shareInfo).toContain('Reconnected to session ABC123');
    });

    it('keeps warning, and does not broadcast, if the room cannot be rejoined', async () => {
      buildLiveEncounter();
      spyOn(sync, 'joinAsGm').and.rejectWith(new Error('Room not found'));

      await component['handleSessionReconnected']();

      expect(component.shareConnectionLost).toBeTrue();
      expect(component.shareError).toContain('Room not found');
      expect(broadcasts.length).toBe(0);
    });
  });

  // ── AC 10: session:error is surfaced ─────────────────────────────────────
  describe('AC 10 - a rejected broadcast is never swallowed', () => {
    it('surfaces the rejection in the GM UI', () => {
      buildLiveEncounter();

      component['handleSessionError']({ event: 'session:update-state', reason: 'payload-too-large: state' });
      fixture.detectChanges();

      expect(component.shareError).toContain('session:update-state');
      expect(component.shareError).toContain('payload-too-large');
    });

    it('treats a lost role as a lost connection and re-authenticates', async () => {
      buildLiveEncounter();
      const joinSpy = spyOn(sync, 'joinAsGm').and.resolveTo({ state: null, log: [] });

      component['handleSessionError']({ event: 'session:update-state', reason: 'role-required: gm' });

      // Flagged immediately, so the GM sees it even if the recovery fails...
      expect(component.shareConnectionLost).toBeTrue();
      expect(component.shareError).toContain('Re-authenticating');

      await fixture.whenStable();

      // ...and cleared once the re-authentication and push succeed.
      expect(joinSpy).toHaveBeenCalledWith('ABC123');
      expect(component.shareConnectionLost).toBeFalse();
      expect(broadcasts.length).toBe(1);
    });

    it('registers the listener when share listeners are attached', () => {
      const errorSpy = spyOn(sync, 'onError');
      spyOn(sync, 'onCommand');
      spyOn(sync, 'onLog');
      spyOn(sync, 'onSessionClosed');
      spyOn(sync, 'onDisconnect');
      spyOn(sync, 'onReconnect');

      component['attachShareListeners']();

      expect(errorSpy).toHaveBeenCalled();
    });

    it('shows the warning banner to the GM', () => {
      component.shareRoomCode = 'ABC123';
      component.shareConnectionLost = true;
      fixture.detectChanges();

      const banner = fixture.nativeElement.querySelector('[data-testid="share-connection-lost"]');
      expect(banner).not.toBeNull();
      expect(banner.textContent).toContain('NOT receiving updates');
    });
  });

  // ── AC 4 / S2: participant subclasses come back ──────────────────────────
  describe('AC 4 / S2 - a fresh tab rejoining a persisted room (Open Decision 4b)', () => {
    function persistedState(): SharedCombatState {
      return {
        round: 2, pass: 2, started: true, passEnded: false, currentInitiative: 16,
        participants: [
          {
            id: 'p-decker', name: 'Slice', order: 1, active: true, initiativeScore: 16,
            playerControlled: true, claimable: true, ownerName: 'pl-abc123',
            initiativeDice: 4, pendingRoll: false, rolledInitiativeTotal: 14,
            reaction: 5, intuition: 5,
            isMatrix: true, vrMode: 'hot-sim', jackedIn: true, isVRCatatonic: true,
            dataProcessing: 7, attack: 6, sleaze: 5, firewall: 4, deviceRating: 3,
            overwatch: 12
          },
          {
            id: 'p-mage', name: 'Hexer', order: 2, active: false, initiativeScore: 9,
            playerControlled: false, initiativeDice: 2, pendingRoll: false,
            rolledInitiativeTotal: 7, reaction: 4, intuition: 5,
            isAstral: true, isAstralProjecting: true
          },
          {
            id: 'p-ganger', name: 'Ganger', order: 3, active: false, initiativeScore: 5,
            playerControlled: false, initiativeDice: 1, pendingRoll: false,
            rolledInitiativeTotal: 3, reaction: 3, intuition: 4
          }
        ]
      };
    }

    it('rebuilds a jacked-in decker as a MatrixParticipant with its deck stats and VR mode', () => {
      component['restoreFromSharedState'](persistedState());

      const decker = CombatManager.participants.items[0] as MatrixParticipant;
      expect(decker instanceof MatrixParticipant).toBeTrue();
      expect(decker.name).toBe('Slice');
      expect(decker.vrMode).toBe(VRMode.HotSim);
      expect(decker.jackedIn).toBeTrue();
      expect(decker.blocksPhysicalActions).toBeTrue();
      expect(decker.dataProcessing).toBe(7);
      expect(decker.attack).toBe(6);
      expect(decker.sleaze).toBe(5);
      expect(decker.firewall).toBe(4);
      expect(decker.deviceRating).toBe(3);
      expect(decker.overwatch).toBe(12);
      // DP 7 + INT 5, not REA 5 + INT 5.
      expect(decker.baseIni).toBe(12);
    });

    it('rebuilds an astrally projecting magician as an AstralParticipant', () => {
      component['restoreFromSharedState'](persistedState());

      const mage = CombatManager.participants.items[1] as AstralParticipant;
      expect(mage instanceof AstralParticipant).toBeTrue();
      expect(mage.astralProjecting).toBeTrue();
      expect(mage.blocksPhysicalActions).toBeTrue();
    });

    it('leaves an ordinary combatant a plain Participant', () => {
      component['restoreFromSharedState'](persistedState());

      const ganger = CombatManager.participants.items[2];
      expect(ganger instanceof Participant).toBeTrue();
      expect(ganger instanceof MatrixParticipant).toBeFalse();
      expect(ganger instanceof AstralParticipant).toBeFalse();
    });

    // AC 12: the restore must not move a running Initiative Score.
    it('restores turn/pass counters and every running Score verbatim (AC 12)', () => {
      component['restoreFromSharedState'](persistedState());

      expect(CombatManager.combatTurn).toBe(2);
      expect(CombatManager.initiativePass).toBe(2);
      expect(CombatManager.participants.items.map(p => p.getCurrentInitiative()))
        .toEqual([16, 9, 5]);
      expect(CombatManager.participants.items.map(p => p.diceIni)).toEqual([14, 7, 3]);
    });

    // AC 5: ownership survives, so the existing claim flow can take over.
    it('AC 5: restores ownership and claimability from the persisted payload', () => {
      component['restoreFromSharedState'](persistedState());

      const decker = CombatManager.participants.items[0];
      expect(component['participantOwners'].get(decker)).toBe('pl-abc123');
      expect(component['participantClaimable'].get(decker)).toBeTrue();
      expect(component['getSharedParticipants']()[0].ownerName).toBe('pl-abc123');
    });

    it('AC 5: a returning player re-claims through the existing claim_character command', () => {
      const state = persistedState();
      // The server strips ownerName when the old tab disconnected.
      state.participants[0].ownerName = undefined;
      component['restoreFromSharedState'](state);

      component['handleSessionCommand']({
        type: 'claim_character',
        player: 'pl-newtoken',
        payload: { participantId: 'p-decker' },
        timestamp: new Date().toISOString()
      });

      expect(component['participantOwners'].get(CombatManager.participants.items[0]))
        .toBe('pl-newtoken');
    });

    // Open Decision 4: the GM is told what did NOT come back.
    it('tells the GM what the restore could not bring back', () => {
      component['restoreFromSharedState'](persistedState());
      fixture.detectChanges();

      expect(component.restoreWarning).toContain('damage');
      expect(component.restoreWarning).toContain('out of action');
      expect(component.restoreWarning).toContain('undo history');
      const warning = fixture.nativeElement.querySelector('[data-testid="restore-warning"]');
      expect(warning).not.toBeNull();
    });
  });

  // ── S4 / review defect 1: a stale owner survives the GM's reconnect push ──
  describe('S4 - re-claiming a character whose owner is stale (review defect 1)', () => {
    const STALE_TOKEN = 'pl-oldtab';
    const NEW_TOKEN = 'pl-newtab';
    let sent: { type: string; player: string; payload?: Record<string, unknown> }[];

    function claimableState(owner?: string): SharedCombatState {
      return {
        round: 1, pass: 1, started: true, passEnded: false, currentInitiative: 11,
        participants: [{
          id: 'p-1', name: 'Wombat', order: 1, active: false, initiativeScore: 11,
          playerControlled: !!owner, claimable: true, ownerName: owner,
          initiativeDice: 1, pendingRoll: false, rolledInitiativeTotal: 5,
          reaction: 3, intuition: 3
        }]
      };
    }

    function claim(token: string, participantId = 'p-1') {
      component['handleSessionCommand']({
        type: 'claim_character',
        player: token,
        payload: { participantId },
        timestamp: new Date().toISOString()
      });
    }

    beforeEach(() => {
      sent = [];
      spyOn(sync, 'sendCommand').and.callFake((c) => { sent.push(c); });
      component.shareRoomCode = 'ABC123';
      // The GM's tab reconnected and pushed its local state, which carries the
      // owner the server had already stripped. Nobody holds this claim.
      component['restoreFromSharedState'](claimableState(STALE_TOKEN));
    });

    it('tells the requesting player why the claim was refused, instead of no-opping', () => {
      claim(NEW_TOKEN);

      const denial = sent.find(c => c.type === 'claim_denied');
      expect(denial).toBeDefined();
      expect(denial!.player).toBe('GM');
      expect(denial!.payload!['requester']).toBe(NEW_TOKEN);
      expect(denial!.payload!['participantId']).toBe('p-1');
      expect(denial!.payload!['characterName']).toBe('Wombat');
      expect(String(denial!.payload!['reason'])).toContain('already claimed');
      // ...and the stale owner is untouched: this is a report, not a takeover.
      expect(component['participantOwners'].get(CombatManager.participants.items[0]))
        .toBe(STALE_TOKEN);
    });

    it('puts the refusal in front of the GM, GM-only', () => {
      claim(NEW_TOKEN);

      const entry = component.sharedLogEntries.find(e => e.text.includes('claim refused'));
      expect(entry).toBeDefined();
      expect(entry!.actor).toBe('Wombat');
      expect(entry!.hiddenFromPlayers).toBeTrue();
    });

    it('refuses a claim on a character the GM has not marked claimable, and says so', () => {
      component['participantClaimable'].set(CombatManager.participants.items[0], false);

      claim(NEW_TOKEN);

      const denial = sent.find(c => c.type === 'claim_denied');
      expect(String(denial!.payload!['reason'])).toContain('not marked claimable');
    });

    it('refuses a claim for a participant that is gone', () => {
      claim(NEW_TOKEN, 'p-does-not-exist');

      const denial = sent.find(c => c.type === 'claim_denied');
      expect(String(denial!.payload!['reason'])).toContain('no longer in the encounter');
    });

    it('says nothing when the same player re-sends a claim it already holds', () => {
      claim(STALE_TOKEN);

      expect(sent.filter(c => c.type === 'claim_denied').length).toBe(0);
      expect(component['participantOwners'].get(CombatManager.participants.items[0]))
        .toBe(STALE_TOKEN);
    });

    it('the GM clears the stale claim in one tap and the player then gets it', () => {
      const wombat = CombatManager.participants.items[0];
      expect(component.isParticipantClaimed(wombat)).toBeTrue();

      component.btnReleaseClaim_Click(wombat);

      expect(component.isParticipantClaimed(wombat)).toBeFalse();
      expect(component['getSharedParticipants']()[0].ownerName).toBeUndefined();

      claim(NEW_TOKEN);

      expect(component['participantOwners'].get(wombat)).toBe(NEW_TOKEN);
      expect(sent.filter(c => c.type === 'claim_denied').length).toBe(0);
    });

    it('a mis-tapped release is one Ctrl+Z', () => {
      const wombat = CombatManager.participants.items[0];

      component.btnReleaseClaim_Click(wombat);
      expect(component.isParticipantClaimed(wombat)).toBeFalse();

      UndoHandler.Undo();

      expect(component['participantOwners'].get(wombat)).toBe(STALE_TOKEN);
    });

    it('shows the release control only while a claim exists', () => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[data-testid="release-claim-btn"]')).not.toBeNull();

      component.btnReleaseClaim_Click(CombatManager.participants.items[0]);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[data-testid="release-claim-btn"]')).toBeNull();
    });
  });

  // ── S3: undo across a restore ────────────────────────────────────────────
  describe('S3 - undo across a restore', () => {
    function restored() {
      component['restoreFromSharedState']({
        round: 1, pass: 1, started: true, passEnded: false, currentInitiative: 11,
        participants: [{
          id: 'p-1', name: 'Wombat', order: 1, active: false, initiativeScore: 11,
          playerControlled: false, initiativeDice: 1, pendingRoll: false,
          rolledInitiativeTotal: 5, reaction: 3, intuition: 3
        }]
      });
      return CombatManager.participants.items[0];
    }

    it('the first undo reverses the GM\'s edit; the second does nothing', () => {
      const p = restored();
      expect(p.name).toBe('Wombat');

      UndoHandler.StartActions();
      p.name = 'Wombat (wounded)';
      expect(p.name).toBe('Wombat (wounded)');

      UndoHandler.Undo();
      expect(p.name).toBe('Wombat');

      UndoHandler.Undo();      // nothing left, and nothing pre-restore to reach
      expect(p.name).toBe('Wombat');
      expect(CombatManager.participants.items.length).toBe(1);
      expect(p.getCurrentInitiative()).toBe(11);
    });

    it('leaves no undo history from the restore itself', () => {
      restored();
      expect(UndoHandler.hasPast()).toBeFalse();
      expect(UndoHandler.hasFuture()).toBeFalse();
    });

    it('does not let a pre-restore chapter absorb the restore\'s writes', () => {
      const stale = new Participant();
      stale.name = 'Left over from before the join';
      CombatManager.participants.insert(stale, false);
      stale.baseIni = 9;      // opens an auto-chapter that is never closed

      const p = restored();

      UndoHandler.Undo();     // must not resurrect the pre-restore participant
      expect(CombatManager.participants.items.length).toBe(1);
      expect(CombatManager.participants.items[0]).toBe(p);
    });
  });

  // ── AC 8 / AC 9: close vs end ────────────────────────────────────────────
  describe('AC 8 / AC 9 - Close Room and End Room are different actions', () => {
    function hiddenEntry(): SharedLogEntry {
      return {
        actor: 'GM', text: 'secret roll', timestamp: new Date().toISOString(),
        id: 'h-1', hiddenFromPlayers: true
      };
    }

    it('Close Room leaves the room persisted and keeps the GM-local hidden entries', async () => {
      const closeSpy = spyOn(sync, 'closeSession').and.resolveTo();
      const endSpy = spyOn(sync, 'endSession').and.resolveTo();
      spyOn(sync, 'disconnect');
      component.shareRoomCode = 'ABC123';
      component.sharedLogEntries = [hiddenEntry()];

      await component.btnCloseShareSession_Click();

      expect(closeSpy).toHaveBeenCalledWith('ABC123');
      expect(endSpy).not.toHaveBeenCalled();
      expect(component.sharedLogEntries.length).toBe(1);
      expect(component.sharedLogEntries[0].hiddenFromPlayers).toBeTrue();
      expect(component.shareInfo).toContain('rejoin with code ABC123');
      // The code is left in the join box so rejoining is one tap.
      expect(component.shareJoinCode).toBe('ABC123');
    });

    it('End Room asks first, then deletes the room and discards the hidden entries', async () => {
      const confirmSpy = spyOn(component['confirmationDialog'], 'confirm').and.resolveTo(true);
      const endSpy = spyOn(sync, 'endSession').and.resolveTo();
      spyOn(sync, 'closeSession').and.resolveTo();
      spyOn(sync, 'disconnect');
      component.shareRoomCode = 'ABC123';
      component.sharedLogEntries = [hiddenEntry()];

      await component.btnEndShareSession_Click();

      expect(confirmSpy).toHaveBeenCalled();
      expect(endSpy).toHaveBeenCalledWith('ABC123');
      expect(component.sharedLogEntries.length).toBe(0);
      expect(component.shareRoomCode).toBe('');
    });

    it('End Room does nothing if the GM cancels', async () => {
      spyOn(component['confirmationDialog'], 'confirm').and.resolveTo(false);
      const endSpy = spyOn(sync, 'endSession').and.resolveTo();
      component.shareRoomCode = 'ABC123';
      component.sharedLogEntries = [hiddenEntry()];

      await component.btnEndShareSession_Click();

      expect(endSpy).not.toHaveBeenCalled();
      expect(component.shareRoomCode).toBe('ABC123');
      expect(component.sharedLogEntries.length).toBe(1);
    });

    // Review defect 7: the GM half. A close leaves the code valid, so wiping
    // the join box costs the GM the only handle on the room.
    it('an externally closed (but persisted) room keeps its code in the join box', () => {
      spyOn(sync, 'disconnect');
      component.shareRoomCode = 'ABC123';
      component.shareJoinCode = 'ABC123';

      component['handleSessionClosedExternally']({ room: 'ABC123', persisted: true });

      expect(component.shareRoomCode).toBe('');
      expect(component.shareJoinCode).toBe('ABC123');
      expect(component.shareInfo).toContain('ABC123');
      expect(component.shareInfo).toContain('kept');
    });

    it('an externally ended room clears the code, because it no longer resolves', () => {
      spyOn(sync, 'disconnect');
      component.shareRoomCode = 'ABC123';
      component.shareJoinCode = 'ABC123';

      component['handleSessionClosedExternally']({ room: 'ABC123', persisted: false });

      expect(component.shareJoinCode).toBe('');
      expect(component.shareInfo).toContain('deleted');
    });

    it('assumes the room survives when an older server omits the flag', () => {
      spyOn(sync, 'disconnect');
      component.shareRoomCode = 'ABC123';

      component['handleSessionClosedExternally']();

      expect(component.shareJoinCode).toBe('ABC123');
    });

    it('offers both buttons while a room is open', () => {
      component.shareRoomCode = 'ABC123';
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[data-testid="close-room-btn"]')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('[data-testid="end-room-btn"]')).not.toBeNull();
    });
  });

  // ── Review defect 2 (round 2): Close Room's own recovery advice ───────────
  // Close Room tells the GM "rejoin with code ABC123 to pick it back up". Doing
  // exactly that used to call restoreFromSharedState(), which clears both
  // participant lists and all eight side-maps and rebuilds from the lossy
  // snapshot. Same hazard as the transport drop, same answer: PUSH, NOT PULL
  // (spec Open Decision 6).
  describe('Close then rejoin from the same tab is non-destructive (review defect 2, round 2)', () => {
    /** What the server would hand back: the lossy projection, one turn stale. */
    function lossySnapshot(): SharedCombatState {
      return {
        round: 1, pass: 1, started: false, passEnded: true, currentInitiative: 0,
        participants: [{
          id: 'p-old', name: 'Stale Copy', order: 1, active: false,
          initiativeScore: 3, playerControlled: false, initiativeDice: 1, pendingRoll: true
        }]
      };
    }

    async function closeRoom() {
      spyOn(sync, 'closeSession').and.resolveTo();
      spyOn(sync, 'disconnect');
      await component.btnCloseShareSession_Click();
    }

    it('the room the GM created is remembered as this tab\'s live encounter', async () => {
      spyOn(sync, 'createSession').and.resolveTo({ room: 'ABC123' });

      await component.btnCreateShareSession_Click();

      expect(component['liveEncounterRoomCode']).toBe('ABC123');
    });

    it('a mis-tapped Close followed by the advice it prints keeps the live encounter', async () => {
      const { decker } = buildLiveEncounter();
      component['liveEncounterRoomCode'] = 'ABC123';
      const scoreBefore = decker.currentInitiativeScore;
      await closeRoom();
      expect(component.shareInfo).toContain('rejoin with code ABC123');
      expect(component.shareJoinCode).toBe('ABC123');

      const joinSpy = spyOn(sync, 'joinAsGm').and.resolveTo({ state: lossySnapshot(), log: [] });
      const restoreSpy = spyOn<never>(component as never, 'restoreFromSharedState' as never);
      broadcasts.length = 0;

      await component.btnJoinShareSession_Click();

      expect(joinSpy).toHaveBeenCalledWith('ABC123');
      expect(restoreSpy).not.toHaveBeenCalled();
      // Pushed, not pulled.
      expect(broadcasts.length).toBe(1);
      expect(broadcasts[0].round).toBe(2);
      expect(broadcasts[0].participants.map(p => p.name)).toEqual(['Slice', 'Ganger']);
      // The live encounter is untouched: subclass, Score, OOC participant.
      expect(CombatManager.participants.items.length).toBe(3);
      expect(CombatManager.participants.items[0] instanceof MatrixParticipant).toBeTrue();
      expect(decker.currentInitiativeScore).toBe(scoreBefore);
      expect(CombatManager.participants.items[2].ooc).toBeTrue();
      expect(component.shareInfo).toContain('nothing was replaced');
    });

    it('undo history survives the round trip (Initialize() is never reached)', async () => {
      buildLiveEncounter();
      component['liveEncounterRoomCode'] = 'ABC123';
      UndoHandler.StartActions();
      CombatManager.participants.items[1].name = 'Ganger (bleeding)';
      expect(UndoHandler.hasPast()).toBeTrue();
      await closeRoom();
      spyOn(sync, 'joinAsGm').and.resolveTo({ state: lossySnapshot(), log: [] });

      await component.btnJoinShareSession_Click();

      expect(UndoHandler.hasPast()).toBeTrue();
      UndoHandler.Undo();
      expect(CombatManager.participants.items[1].name).toBe('Ganger');
    });

    it('a fresh tab with no local state still pulls', async () => {
      component.shareJoinCode = 'ABC123';           // no liveEncounterRoomCode
      spyOn(sync, 'joinAsGm').and.resolveTo({ state: lossySnapshot(), log: [] });

      await component.btnJoinShareSession_Click();

      expect(CombatManager.participants.items.length).toBe(1);
      expect(CombatManager.participants.items[0].name).toBe('Stale Copy');
      expect(component.shareInfo).toBe('Joined session ABC123.');
    });

    it('a tab holding one room\'s encounter still pulls when joining a different room', async () => {
      buildLiveEncounter();
      component['liveEncounterRoomCode'] = 'ABC123';
      await closeRoom();
      component.shareJoinCode = 'ZZZ999';
      spyOn(sync, 'joinAsGm').and.resolveTo({ state: lossySnapshot(), log: [] });
      // Destructive, so it asks first now (AC 15) - the GM says yes here.
      spyOn(component['confirmationDialog'], 'confirm').and.resolveTo(true);

      await component.btnJoinShareSession_Click();

      expect(CombatManager.participants.items.map(p => p.name)).toEqual(['Stale Copy']);
    });

    it('End Room forgets the association, because the room no longer exists', async () => {
      buildLiveEncounter();
      component['liveEncounterRoomCode'] = 'ABC123';
      spyOn(component['confirmationDialog'], 'confirm').and.resolveTo(true);
      spyOn(sync, 'endSession').and.resolveTo();
      spyOn(sync, 'disconnect');

      await component.btnEndShareSession_Click();

      expect(component['liveEncounterRoomCode']).toBe('');
    });
  });

  // ── AC 15 (added 2026-08-05): a destructive Join is confirmed first ───────
  // Push-not-pull already protects the tab rejoining *its own* room. The gap it
  // left: a tab holding an encounter that the server does not have - a different
  // room's, or one built before any session existed - still pulled silently,
  // and `restoreFromSharedState()` clears both participant lists, all eight
  // side-maps and the undo history with no way back.
  describe('AC 15 - Join asks before it overwrites local GM state', () => {
    function serverSnapshot(): SharedCombatState {
      return {
        round: 1, pass: 1, started: false, passEnded: true, currentInitiative: 0,
        participants: [{
          id: 'p-server', name: 'Server Copy', order: 1, active: false,
          initiativeScore: 3, playerControlled: false, initiativeDice: 1, pendingRoll: true
        }]
      };
    }

    it('AC 15: names what will be lost before pulling over a live local encounter', async () => {
      buildLiveEncounter();                       // 3 participants, no live room code
      component.shareJoinCode = 'ZZZ999';
      const confirmSpy = spyOn(component['confirmationDialog'], 'confirm').and.resolveTo(true);
      spyOn(sync, 'joinAsGm').and.resolveTo({ state: serverSnapshot(), log: [] });

      await component.btnJoinShareSession_Click();

      expect(confirmSpy).toHaveBeenCalled();
      const [ message, title ] = confirmSpy.calls.mostRecent().args;
      expect(message).toContain('3 participants');
      expect(message).toContain('damage');
      expect(message).toContain('undo history');
      expect(message).toContain('cannot be undone');
      expect(title).toContain('ZZZ999');
      // Confirmed, so the pull went ahead.
      expect(CombatManager.participants.items.map(p => p.name)).toEqual(['Server Copy']);
    });

    it('AC 15: cancelling aborts the join and leaves local state untouched', async () => {
      const { decker } = buildLiveEncounter();
      const scoreBefore = decker.currentInitiativeScore;
      component.shareJoinCode = 'ZZZ999';
      spyOn(component['confirmationDialog'], 'confirm').and.resolveTo(false);
      const joinSpy = spyOn(sync, 'joinAsGm').and.resolveTo({ state: serverSnapshot(), log: [] });
      const restoreSpy = spyOn<never>(component as never, 'restoreFromSharedState' as never);

      await component.btnJoinShareSession_Click();

      expect(joinSpy).not.toHaveBeenCalled();     // aborted before the network call
      expect(restoreSpy).not.toHaveBeenCalled();
      expect(CombatManager.participants.items.length).toBe(3);
      expect(CombatManager.participants.items[0] instanceof MatrixParticipant).toBeTrue();
      expect(decker.currentInitiativeScore).toBe(scoreBefore);
      expect(CombatManager.combatTurn).toBe(2);
      expect(CombatManager.initiativePass).toBe(2);
      expect(component.shareRoomCode).toBe('ABC123');   // untouched
      expect(component.shareInfo).toContain('Kept this tab\'s encounter');
    });

    it('AC 15: a genuinely fresh tab is not prompted', async () => {
      component.shareJoinCode = 'ZZZ999';                // no participants at all
      const confirmSpy = spyOn(component['confirmationDialog'], 'confirm').and.resolveTo(true);
      spyOn(sync, 'joinAsGm').and.resolveTo({ state: serverSnapshot(), log: [] });

      await component.btnJoinShareSession_Click();

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(CombatManager.participants.items.map(p => p.name)).toEqual(['Server Copy']);
    });

    it('AC 15: rejoining the room this tab already holds still pushes, unprompted', async () => {
      buildLiveEncounter();
      component['liveEncounterRoomCode'] = 'ABC123';
      component.shareJoinCode = 'ABC123';
      const confirmSpy = spyOn(component['confirmationDialog'], 'confirm').and.resolveTo(true);
      spyOn(sync, 'joinAsGm').and.resolveTo({ state: serverSnapshot(), log: [] });
      broadcasts.length = 0;

      await component.btnJoinShareSession_Click();

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(broadcasts.length).toBe(1);
      expect(CombatManager.participants.items.length).toBe(3);
    });

    it('AC 15: says "1 participant", not "1 participants"', async () => {
      const lone = new Participant();
      lone.name = 'Wombat';
      CombatManager.participants.insert(lone, false);
      component.shareJoinCode = 'ZZZ999';
      const confirmSpy = spyOn(component['confirmationDialog'], 'confirm').and.resolveTo(false);

      await component.btnJoinShareSession_Click();

      const message = confirmSpy.calls.mostRecent().args[0];
      expect(message).toContain('1 participant on screen is discarded');
      expect(message).not.toContain('participants');
    });
  });

  // ── AC 17 (added 2026-08-05): a failed End Room destroys nothing ──────────
  describe('AC 17 - a failed End Room leaves everything exactly as it was', () => {
    function hidden(): SharedLogEntry {
      return {
        actor: 'GM', text: 'secret roll', timestamp: new Date().toISOString(),
        id: 'h-1', hiddenFromPlayers: true
      };
    }

    async function failingEnd(err: unknown) {
      spyOn(component['confirmationDialog'], 'confirm').and.resolveTo(true);
      spyOn(sync, 'endSession').and.rejectWith(err);
      component.shareRoomCode = 'ABC123';
      component.shareJoinCode = 'ABC123';
      component['liveEncounterRoomCode'] = 'ABC123';
      component.sharedLogEntries = [hidden()];
      await component.btnEndShareSession_Click();
    }

    it('AC 17: keeps the GM-local hidden entries when the emit is rejected', async () => {
      const disconnectSpy = spyOn(sync, 'disconnect');

      await failingEnd(new Error('room-mismatch'));

      expect(component.sharedLogEntries.length).toBe(1);
      expect(component.sharedLogEntries[0].hiddenFromPlayers).toBeTrue();
      expect(disconnectSpy).not.toHaveBeenCalled();
    });

    it('AC 17: keeps the room, the join code and the live-encounter association', async () => {
      spyOn(sync, 'disconnect');

      await failingEnd(new Error('timed out'));

      expect(component.shareRoomCode).toBe('ABC123');
      expect(component.shareJoinCode).toBe('ABC123');
      expect(component['liveEncounterRoomCode']).toBe('ABC123');
    });

    it('AC 17: surfaces the failure and re-arms the button so the GM can retry', async () => {
      spyOn(sync, 'disconnect');

      await failingEnd(new Error('timed out'));

      expect(component.shareError).toContain('timed out');
      expect(component.shareInfo).not.toContain('Deleted');
      expect(component['isClosingSession']).toBeFalse();
    });

    it('AC 17: a retry that succeeds does the full teardown', async () => {
      spyOn(sync, 'disconnect');
      spyOn(component['confirmationDialog'], 'confirm').and.resolveTo(true);
      const endSpy = spyOn(sync, 'endSession').and.rejectWith(new Error('timed out'));
      component.shareRoomCode = 'ABC123';
      component['liveEncounterRoomCode'] = 'ABC123';
      component.sharedLogEntries = [hidden()];

      await component.btnEndShareSession_Click();
      expect(component.sharedLogEntries.length).toBe(1);

      endSpy.and.resolveTo();
      await component.btnEndShareSession_Click();

      expect(component.shareRoomCode).toBe('');
      expect(component.sharedLogEntries.length).toBe(0);
      expect(component['liveEncounterRoomCode']).toBe('');
      expect(component.shareInfo).toContain('Deleted room ABC123');
    });
  });

  // ── Review defect D3 (2026-08-05): Create Player Session ──────────────────
  // The confirmation gate was `hasRetainedHiddenLogEntries()`, which is
  // `shareRoomCode ? [] : getHiddenLogEntries()` - false whenever a session is
  // live, which is exactly when the GM has hidden entries worth losing. The
  // handler then reseeded `sharedLogEntries` to `[]` unconditionally. Creating
  // while already in a room is also the second path to D2's abandoned room.
  describe('D3 - Create Player Session while a session is already live', () => {
    function hidden(id = 'h-1'): SharedLogEntry {
      return {
        actor: 'GM', text: 'secret roll', timestamp: new Date().toISOString(),
        id, hiddenFromPlayers: true
      };
    }

    function armCreate(room = 'NEW999') {
      spyOn(sync, 'onCommand');
      spyOn(sync, 'onLog');
      spyOn(sync, 'onSessionClosed');
      spyOn(sync, 'onDisconnect');
      spyOn(sync, 'onReconnect');
      spyOn(sync, 'onError');
      return spyOn(sync, 'createSession').and.resolveTo({ room });
    }

    it('D3: asks before discarding hidden entries held inside a live session', async () => {
      const confirmSpy = spyOn(component['confirmationDialog'], 'confirm').and.resolveTo(false);
      const createSpy = armCreate();
      component.shareRoomCode = 'ABC123';
      component.sharedLogEntries = [hidden()];

      await component.btnCreateShareSession_Click();

      expect(confirmSpy).toHaveBeenCalled();          // was silently skipped
      expect(createSpy).not.toHaveBeenCalled();
      expect(component.sharedLogEntries.length).toBe(1);
      expect(component.shareRoomCode).toBe('ABC123');
    });

    it('D3: names the entries, the old room and the irreversibility', async () => {
      const confirmSpy = spyOn(component['confirmationDialog'], 'confirm').and.resolveTo(false);
      armCreate();
      component.shareRoomCode = 'ABC123';
      component.sharedLogEntries = [hidden('h-1'), hidden('h-2')];

      await component.btnCreateShareSession_Click();

      const [ message, title ] = confirmSpy.calls.mostRecent().args;
      expect(message).toContain('2 hidden GM log entries');
      expect(message).toContain('Rejoin room ABC123');
      expect(message).toContain('cannot be undone');
      expect(title).toContain('ABC123');
    });

    it('D3: discards them only once the GM has said yes', async () => {
      spyOn(component['confirmationDialog'], 'confirm').and.resolveTo(true);
      const createSpy = armCreate();
      component.shareRoomCode = 'ABC123';
      component.sharedLogEntries = [hidden()];

      await component.btnCreateShareSession_Click();

      expect(createSpy).toHaveBeenCalled();
      expect(component.sharedLogEntries.length).toBe(0);
      expect(component.shareRoomCode).toBe('NEW999');
    });

    it('D3: still asks when the only cost is abandoning the live room', async () => {
      const confirmSpy = spyOn(component['confirmationDialog'], 'confirm').and.resolveTo(false);
      armCreate();
      component.shareRoomCode = 'ABC123';
      component.sharedLogEntries = [];

      await component.btnCreateShareSession_Click();

      const message = confirmSpy.calls.mostRecent().args[0];
      expect(message).toContain('This tab is running room ABC123');
      expect(message).toContain('no GM connected');
      expect(message).not.toContain('hidden GM log');
      expect(component.shareInfo).toContain('Kept room ABC123');
    });

    it('D3: the abandoned room code survives in the on-screen message', async () => {
      spyOn(component['confirmationDialog'], 'confirm').and.resolveTo(true);
      armCreate();
      component.shareRoomCode = 'ABC123';

      await component.btnCreateShareSession_Click();

      expect(component.shareRoomCode).toBe('NEW999');
      expect(component.shareInfo).toContain('Left room ABC123');
      expect(component.shareInfo).toContain('rejoining with code ABC123');
      expect(component['liveEncounterRoomCode']).toBe('NEW999');
    });

    it('D3: a first session on a clean tab is still one tap, no dialog', async () => {
      const confirmSpy = spyOn(component['confirmationDialog'], 'confirm').and.resolveTo(true);
      armCreate();
      component.shareRoomCode = '';
      component.sharedLogEntries = [];

      await component.btnCreateShareSession_Click();

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(component.shareRoomCode).toBe('NEW999');
      expect(component.shareInfo).toBe('Created room NEW999.');
    });
  });

  // ── Review defect D4 (2026-08-05): a confirmed discard that never happens ──
  // `restoreFromSharedState` no-ops on a snapshot with no participants, but the
  // AC 15 dialog had already promised "N participants will be discarded".
  describe('D4 - joining a room whose snapshot is empty', () => {
    const EMPTY_SNAPSHOT: SharedCombatState = {
      round: 1, pass: 1, started: false, passEnded: true, currentInitiative: 0,
      participants: []
    };

    it('D4: the dialog makes the discard conditional on the room having an encounter', async () => {
      buildLiveEncounter();
      component.shareJoinCode = 'ZZZ999';
      const confirmSpy = spyOn(component['confirmationDialog'], 'confirm').and.resolveTo(false);

      await component.btnJoinShareSession_Click();

      const message = confirmSpy.calls.mostRecent().args[0];
      expect(message).toContain('If that room has a saved encounter');
      expect(message).toContain('3 participants');
      expect(message).toContain('no saved encounter, nothing is replaced');
    });

    it('D4: nothing is discarded, and the GM is told the room was empty', async () => {
      const { decker } = buildLiveEncounter();
      const scoreBefore = decker.currentInitiativeScore;
      component.shareJoinCode = 'ZZZ999';
      spyOn(component['confirmationDialog'], 'confirm').and.resolveTo(true);
      spyOn(sync, 'joinAsGm').and.resolveTo({ state: EMPTY_SNAPSHOT, log: [] });
      broadcasts.length = 0;

      await component.btnJoinShareSession_Click();

      // The encounter the dialog said might go is still here, intact.
      expect(CombatManager.participants.items.length).toBe(3);
      expect(CombatManager.participants.items[0] instanceof MatrixParticipant).toBeTrue();
      expect(decker.currentInitiativeScore).toBe(scoreBefore);
      expect(CombatManager.combatTurn).toBe(2);
      expect(component.shareInfo).toContain('no saved encounter');
      expect(component.shareInfo).toContain('kept');
    });

    it('D4: the kept encounter is pushed to the room it just joined', async () => {
      buildLiveEncounter();
      component.shareJoinCode = 'ZZZ999';
      spyOn(component['confirmationDialog'], 'confirm').and.resolveTo(true);
      spyOn(sync, 'joinAsGm').and.resolveTo({ state: EMPTY_SNAPSHOT, log: [] });
      broadcasts.length = 0;

      await component.btnJoinShareSession_Click();

      expect(broadcasts.length).toBe(1);
      expect(broadcasts[0].participants.map(p => p.name)).toEqual(['Slice', 'Ganger']);
      expect(component['liveEncounterRoomCode']).toBe('ZZZ999');
    });

    it('D4: a null snapshot is handled the same way', async () => {
      buildLiveEncounter();
      component.shareJoinCode = 'ZZZ999';
      spyOn(component['confirmationDialog'], 'confirm').and.resolveTo(true);
      spyOn(sync, 'joinAsGm').and.resolveTo({ state: null, log: [] });

      await component.btnJoinShareSession_Click();

      expect(CombatManager.participants.items.length).toBe(3);
      expect(component.shareInfo).toContain('no saved encounter');
    });
  });

  // ── Review defect D5 (2026-08-05): a lost End Room ack ────────────────────
  // The end succeeded server-side; only the ack was lost. Every subsequent
  // action then answered "Room not found" while the UI still showed the room as
  // live, leaving the GM with an error banner and no way out.
  describe('D5 - End Room after a lost ack', () => {
    function hidden(): SharedLogEntry {
      return {
        actor: 'GM', text: 'secret roll', timestamp: new Date().toISOString(),
        id: 'h-1', hiddenFromPlayers: true
      };
    }

    function armEnd(rejection: unknown) {
      spyOn(component['confirmationDialog'], 'confirm').and.resolveTo(true);
      spyOn(sync, 'disconnect');
      component.shareRoomCode = 'ABC123';
      component.shareJoinCode = 'ABC123';
      component['liveEncounterRoomCode'] = 'ABC123';
      component.sharedLogEntries = [hidden()];
      return spyOn(sync, 'endSession').and.rejectWith(rejection);
    }

    it('D5: a retry answered "Room not found" is a terminal success, not an error', async () => {
      armEnd(new Error('Room not found'));

      await component.btnEndShareSession_Click();

      expect(component.shareError).toBe('');
      expect(component.shareInfo).toContain('already deleted');
      expect(component.shareRoomCode).toBe('');
      expect(component['liveEncounterRoomCode']).toBe('');
      expect(component.sharedLogEntries.length).toBe(0);
      expect(component['isClosingSession']).toBeFalse();
    });

    it('D5: the legacy removed-room message counts as gone too', async () => {
      armEnd(new Error('Room ABC123 was removed on 2026-07-01 and is no longer available.'));

      await component.btnEndShareSession_Click();

      expect(component.shareRoomCode).toBe('');
      expect(component.shareError).toBe('');
    });

    it('D5: the full sequence - timeout, then retry, from one banner to none', async () => {
      const endSpy = armEnd(new Error('No response from server for gm:end-session.'));

      // First attempt: the ack was lost, so the outcome is unknown. AC 17 says
      // keep everything.
      await component.btnEndShareSession_Click();
      expect(component.shareError).toContain('No response from server');
      expect(component.shareRoomCode).toBe('ABC123');
      expect(component.sharedLogEntries.length).toBe(1);

      // Retry: the room really was destroyed. One more tap and the GM is clear.
      endSpy.and.rejectWith(new Error('Room not found'));
      await component.btnEndShareSession_Click();

      expect(component.shareError).toBe('');
      expect(component.shareRoomCode).toBe('');
      expect(component.shareJoinCode).toBe('');
      expect(component.sharedLogEntries.length).toBe(0);
    });

    it('D5: a rejection that is not "room gone" still keeps everything (AC 17)', async () => {
      armEnd(new Error('room-mismatch'));

      await component.btnEndShareSession_Click();

      expect(component.shareError).toContain('room-mismatch');
      expect(component.shareRoomCode).toBe('ABC123');
      expect(component.sharedLogEntries.length).toBe(1);
      expect(component['liveEncounterRoomCode']).toBe('ABC123');
    });
  });

  // ── Review defect 3a (round 2): undo of a player-visible mutation ─────────
  describe('undo re-broadcasts, so players never disagree with the GM (review defect 3, round 2)', () => {
    const OWNER = 'pl-owner';

    function claimedParticipant() {
      const p = new Participant();
      p.name = 'Wombat';
      CombatManager.participants.insert(p, false);
      component['participantClaimable'].set(p, true);
      component['participantOwners'].set(p, OWNER);
      component.shareRoomCode = 'ABC123';
      return p;
    }

    it('undoing a claim release puts the owner back on the wire, not just locally', () => {
      const wombat = claimedParticipant();
      component.btnReleaseClaim_Click(wombat);
      expect(broadcasts[broadcasts.length - 1].participants[0].ownerName).toBeUndefined();
      const broadcastsAfterRelease = broadcasts.length;

      component.btnUndo_Click();

      expect(component['participantOwners'].get(wombat)).toBe(OWNER);
      expect(broadcasts.length).toBe(broadcastsAfterRelease + 1);
      expect(broadcasts[broadcasts.length - 1].participants[0].ownerName).toBe(OWNER);
    });

    it('redo re-broadcasts too, so the pair stay symmetrical', () => {
      const wombat = claimedParticipant();
      component.btnReleaseClaim_Click(wombat);
      component.btnUndo_Click();

      component.btnRedo_Click();

      expect(component['participantOwners'].get(wombat)).toBeUndefined();
      expect(broadcasts[broadcasts.length - 1].participants[0].ownerName).toBeUndefined();
    });

    it('undo does not destroy the redo stack it just created', () => {
      const wombat = claimedParticipant();
      component.btnReleaseClaim_Click(wombat);

      component.btnUndo_Click();

      expect(UndoHandler.hasFuture()).toBeTrue();
      expect(component.isRedoDisabled()).toBeFalse();
    });

    it('is silent when no session is open', () => {
      const wombat = claimedParticipant();
      component.btnReleaseClaim_Click(wombat);
      component.shareRoomCode = '';
      const before = broadcasts.length;

      component.btnUndo_Click();

      expect(broadcasts.length).toBe(before);
    });
  });

  // ── Round-3 fix 5: an all-OOC room is not an empty room ───────────────────
  // `getSharedParticipants()` filters OOC participants out of the broadcast, so
  // a real encounter where everyone has been dropped serialises as
  // `participants: []`. The join guard read that as "this room has no content",
  // and its empty-snapshot branch pushed this tab's encounter over the top of a
  // saved fight, silently.
  describe('fix 5 - a room whose participants are all out of action still counts as content', () => {
    /** What such a room's last broadcast actually looks like on the wire. */
    function allOocSnapshot(count = 3): SharedCombatState {
      return {
        round: 4, pass: 2, started: true, passEnded: false, currentInitiative: 0,
        participants: [],
        oocParticipantCount: count
      };
    }

    function armJoin(state: SharedCombatState | null) {
      spyOn(sync, 'onCommand');
      spyOn(sync, 'onLog');
      spyOn(sync, 'onSessionClosed');
      spyOn(sync, 'onDisconnect');
      spyOn(sync, 'onReconnect');
      spyOn(sync, 'onError');
      spyOn(component['confirmationDialog'], 'confirm').and.resolveTo(true);
      return spyOn(sync, 'joinAsGm').and.resolveTo({ state, log: [] });
    }

    it('fix 5: the OOC count is broadcast, so the room is not blank on the wire', () => {
      buildLiveEncounter();               // three participants, one of them OOC

      component['syncSharedState']();

      const last = broadcasts[broadcasts.length - 1];
      expect(last.participants.map(p => p.name)).toEqual(['Slice', 'Ganger']);
      expect(last.oocParticipantCount).toBe(1);
    });

    it('fix 5: a fully-OOC encounter broadcasts no participants but a real count', () => {
      buildLiveEncounter();
      for (const p of CombatManager.participants.items) {
        p.physicalHealth = 10;
        p.physicalDamage = 10;
      }

      component['syncSharedState']();

      const last = broadcasts[broadcasts.length - 1];
      expect(last.participants.length).toBe(0);
      expect(last.oocParticipantCount).toBe(3);
    });

    it('fix 5: the join content check counts OOC participants', () => {
      expect(component['snapshotHasEncounter'](allOocSnapshot())).toBeTrue();
      expect(component['snapshotHasEncounter']({
        round: 1, pass: 1, participants: [], oocParticipantCount: 0
      })).toBeFalse();
      expect(component['snapshotHasEncounter'](null)).toBeFalse();
    });

    it('fix 5: joining such a room does NOT push local state over the saved one', async () => {
      buildLiveEncounter();
      component.shareRoomCode = '';
      component.shareJoinCode = 'ZZZ999';
      armJoin(allOocSnapshot());
      broadcasts.length = 0;

      await component.btnJoinShareSession_Click();

      // The whole defect: this used to be one broadcast that overwrote a real
      // saved encounter with this tab's.
      expect(broadcasts.length).toBe(0);
    });

    it('fix 5: the GM is told what the room held and that nothing was replaced', async () => {
      buildLiveEncounter();
      component.shareRoomCode = '';
      component.shareJoinCode = 'ZZZ999';
      armJoin(allOocSnapshot(3));

      await component.btnJoinShareSession_Click();

      expect(component.shareInfo).toContain('3 participants out of action');
      expect(component.shareInfo).toContain('nothing here was replaced');
      expect(component.shareInfo).toContain('nothing was sent to the room');
      expect(component.shareInfo).not.toContain('no saved encounter');
    });

    it('fix 5: says "1 participant", not "1 participants"', async () => {
      buildLiveEncounter();
      component.shareRoomCode = '';
      component.shareJoinCode = 'ZZZ999';
      armJoin(allOocSnapshot(1));

      await component.btnJoinShareSession_Click();

      expect(component.shareInfo).toContain('1 participant out of action');
    });

    it('fix 5: local state is untouched - the tab keeps its own encounter', async () => {
      const { decker } = buildLiveEncounter();
      const scoreBefore = decker.currentInitiativeScore;
      component.shareRoomCode = '';
      component.shareJoinCode = 'ZZZ999';
      armJoin(allOocSnapshot());

      await component.btnJoinShareSession_Click();

      expect(CombatManager.participants.items.length).toBe(3);
      expect(CombatManager.participants.items[0] instanceof MatrixParticipant).toBeTrue();
      expect(decker.currentInitiativeScore).toBe(scoreBefore);
    });

    it('fix 5: a genuinely empty room still takes the push path (defect D4 unchanged)', async () => {
      buildLiveEncounter();
      component.shareRoomCode = '';
      component.shareJoinCode = 'ZZZ999';
      armJoin({ round: 1, pass: 1, participants: [] });
      broadcasts.length = 0;

      await component.btnJoinShareSession_Click();

      expect(broadcasts.length).toBe(1);
      expect(component.shareInfo).toContain('no saved encounter');
    });

    it('fix 5: an older server that omits the count is read as empty, as before', async () => {
      const legacy = { round: 1, pass: 1, participants: [] } as SharedCombatState;

      expect(component['snapshotHasEncounter'](legacy)).toBeFalse();
    });
  });

  // ── Round-3 fix 6: Create Player Session's recovery advice is now true ────
  // The dialog and the on-screen message both say "rejoining with code {old}
  // brings it back". Create then *reassigned* liveEncounterRoomCode to the new
  // room, so rejoining the old one took the destructive pull path and discarded
  // exactly what had just been promised safe.
  describe('fix 6 - rejoining the room that was live before a mis-tapped Create pushes', () => {
    function armCreate(room = 'NEW999') {
      spyOn(sync, 'onCommand');
      spyOn(sync, 'onLog');
      spyOn(sync, 'onSessionClosed');
      spyOn(sync, 'onDisconnect');
      spyOn(sync, 'onReconnect');
      spyOn(sync, 'onError');
      return spyOn(sync, 'createSession').and.resolveTo({ room });
    }

    function lossySnapshot(): SharedCombatState {
      return {
        round: 1, pass: 1, started: false, passEnded: true, currentInitiative: 0,
        participants: [{
          id: 'p-old', name: 'Stale Copy', order: 1, active: false,
          initiativeScore: 3, playerControlled: false, initiativeDice: 1, pendingRoll: true
        }]
      };
    }

    async function misTapCreate() {
      spyOn(component['confirmationDialog'], 'confirm').and.resolveTo(true);
      armCreate('NEW999');
      buildLiveEncounter();                     // shareRoomCode = 'ABC123'
      component['liveEncounterRoomCode'] = 'ABC123';
      await component.btnCreateShareSession_Click();
    }

    it('fix 6: the dialog promises the old code brings the encounter back', async () => {
      const confirmSpy = spyOn(component['confirmationDialog'], 'confirm').and.resolveTo(false);
      armCreate();
      component.shareRoomCode = 'ABC123';

      await component.btnCreateShareSession_Click();

      expect(confirmSpy.calls.mostRecent().args[0]).toContain('rejoining with code ABC123 brings it back');
    });

    it('fix 6: after Create, BOTH codes are still this tab\'s live encounter', async () => {
      await misTapCreate();

      expect(component['holdsLiveEncounterFor']('ABC123')).toBeTrue();   // was false
      expect(component['holdsLiveEncounterFor']('NEW999')).toBeTrue();
      expect(component['liveEncounterRoomCode']).toBe('NEW999');
    });

    it('fix 6: rejoining the old code pushes - it does not pull and destroy', async () => {
      await misTapCreate();
      const decker = CombatManager.participants.items[0];
      const scoreBefore = decker.currentInitiativeScore;
      const joinSpy = spyOn(sync, 'joinAsGm').and.resolveTo({ state: lossySnapshot(), log: [] });
      const restoreSpy = spyOn<never>(component as never, 'restoreFromSharedState' as never);
      const confirmSpy = component['confirmationDialog'].confirm as jasmine.Spy;
      confirmSpy.calls.reset();
      broadcasts.length = 0;
      component.shareJoinCode = 'ABC123';

      await component.btnJoinShareSession_Click();

      expect(joinSpy).toHaveBeenCalledWith('ABC123');
      // No AC-15 "this will be discarded" prompt: nothing is at risk on a push.
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(restoreSpy).not.toHaveBeenCalled();
      expect(broadcasts.length).toBe(1);
      expect(broadcasts[0].participants.map(p => p.name)).toEqual(['Slice', 'Ganger']);
      expect(CombatManager.participants.items.length).toBe(3);
      expect(decker.currentInitiativeScore).toBe(scoreBefore);
      expect(component.shareInfo).toContain('nothing was replaced');
    });

    it('fix 6: undo history survives the mis-tap and the recovery', async () => {
      await misTapCreate();
      UndoHandler.StartActions();
      CombatManager.participants.items[1].name = 'Ganger (bleeding)';
      expect(UndoHandler.hasPast()).toBeTrue();
      spyOn(sync, 'joinAsGm').and.resolveTo({ state: lossySnapshot(), log: [] });
      component.shareJoinCode = 'ABC123';

      await component.btnJoinShareSession_Click();

      expect(UndoHandler.hasPast()).toBeTrue();
      UndoHandler.Undo();
      expect(CombatManager.participants.items[1].name).toBe('Ganger');
    });

    it('fix 6: ending one of the two rooms only forgets that one', async () => {
      await misTapCreate();
      spyOn(sync, 'endSession').and.resolveTo();
      spyOn(sync, 'disconnect');
      (component['confirmationDialog'].confirm as jasmine.Spy).and.resolveTo(true);

      await component.btnEndShareSession_Click();      // ends NEW999

      expect(component['holdsLiveEncounterFor']('NEW999')).toBeFalse();
      expect(component['holdsLiveEncounterFor']('ABC123')).toBeTrue();
    });

    it('fix 6: a pull still resets the associations - the encounter really was replaced', async () => {
      await misTapCreate();
      spyOn(sync, 'joinAsGm').and.resolveTo({ state: lossySnapshot(), log: [] });
      component.shareJoinCode = 'OTH777';

      await component.btnJoinShareSession_Click();

      expect(component['holdsLiveEncounterFor']('ABC123')).toBeFalse();
      expect(component['holdsLiveEncounterFor']('NEW999')).toBeFalse();
      expect(component['holdsLiveEncounterFor']('OTH777')).toBeTrue();
    });

    it('fix 6: a room this tab never ran is still pulled, with the AC-15 prompt', async () => {
      buildLiveEncounter();
      component['liveEncounterRoomCode'] = 'ABC123';
      const confirmSpy = spyOn(component['confirmationDialog'], 'confirm').and.resolveTo(true);
      spyOn(sync, 'joinAsGm').and.resolveTo({ state: lossySnapshot(), log: [] });
      component.shareJoinCode = 'OTH777';

      await component.btnJoinShareSession_Click();

      expect(confirmSpy).toHaveBeenCalled();
      expect(CombatManager.participants.items.map(p => p.name)).toEqual(['Stale Copy']);
    });
  });
});

describe('Durable rooms - player client (AC 6, S4; Open Decision 7)', () => {
  let component: PlayerViewComponent;
  let fixture: ComponentFixture<PlayerViewComponent>;
  let sync: SessionSyncService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlayerViewComponent],
      providers: appConfig.providers
    }).compileComponents();

    fixture = TestBed.createComponent(PlayerViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    sync = TestBed.inject(SessionSyncService);
    spyOn(sync, 'connect');
  });

  const emptyState: SharedCombatState = { round: 1, pass: 1, participants: [] };

  it('AC 6: joining a persisted room with no GM present still gives state, and says so', async () => {
    spyOn(sync, 'joinAsPlayer').and.resolveTo({ state: emptyState, log: [], gmConnected: false });
    component.room = 'ABC123';

    await component.join();
    fixture.detectChanges();

    expect(component.connected).toBeTrue();
    expect(component.error).toBe('');
    expect(component.gmConnected).toBeFalse();
    const notice = fixture.nativeElement.querySelector('[data-testid="gm-not-connected"]');
    expect(notice).not.toBeNull();
    expect(notice.textContent).toContain('GM not connected');
  });

  it('shows no such notice when the GM is there', async () => {
    spyOn(sync, 'joinAsPlayer').and.resolveTo({ state: emptyState, log: [], gmConnected: true });
    component.room = 'ABC123';

    await component.join();
    fixture.detectChanges();

    expect(component.gmConnected).toBeTrue();
    expect(fixture.nativeElement.querySelector('[data-testid="gm-not-connected"]')).toBeNull();
  });

  // ── Review defect 7: Close and End read differently to a player ──────────
  describe('AC 8 - a player can tell Close Room from End Room (review defect 7)', () => {
    let closed: (payload: { room: string; persisted?: boolean }) => void;

    async function joinWithClosedListener() {
      spyOn(sync, 'onSessionClosed').and.callFake((h) => { closed = h; });
      spyOn(sync, 'joinAsPlayer').and.resolveTo({ state: emptyState, log: [], gmConnected: true });
      component.room = 'ABC123';
      await component.join();
    }

    it('a closed room says the room is kept and the code still works', async () => {
      await joinWithClosedListener();

      closed({ room: 'ABC123', persisted: true });

      expect(component.connected).toBeFalse();
      expect(component.error).toContain('ABC123');
      expect(component.error).toContain('still saved');
      expect(component.error).toContain('same code');
    });

    it('an ended room says it is gone', async () => {
      await joinWithClosedListener();

      closed({ room: 'ABC123', persisted: false });

      expect(component.error).toContain('deleted');
      expect(component.error).not.toContain('rejoin with the same code');
    });

    it('assumes the room survives when an older server omits the flag', async () => {
      await joinWithClosedListener();

      closed({ room: 'ABC123' });

      expect(component.error).toContain('still saved');
    });
  });

  // ── Review defect 1: a refused claim reaches the player who asked ─────────
  describe('S4 - a refused claim is explained to the player (review defect 1)', () => {
    let command: (c: SessionCommand) => void;

    async function joinWithCommandListener() {
      spyOn(sync, 'onCommand').and.callFake((h) => { command = h; });
      spyOn(sync, 'joinAsPlayer').and.resolveTo({ state: emptyState, log: [], gmConnected: true });
      component.room = 'ABC123';
      await component.join();
    }

    function denial(requester: string): SessionCommand {
      return {
        type: 'claim_denied',
        player: 'GM',
        payload: {
          requester,
          participantId: 'p-1',
          characterName: 'Wombat',
          reason: 'already claimed by another player'
        },
        timestamp: new Date().toISOString()
      };
    }

    it('shows the reason and what to do about it', async () => {
      await joinWithCommandListener();

      command(denial(component['playerToken']));

      expect(component.error).toContain('Wombat');
      expect(component.error).toContain('already claimed by another player');
      expect(component.error).toContain('Ask the GM');
    });

    it('is not shown to the other players in the room', async () => {
      await joinWithCommandListener();

      command(denial('pl-someone-else'));

      expect(component.error).toBe('');
    });

    it('clears on the next claim attempt, so a retry does not read as a failure', async () => {
      await joinWithCommandListener();
      spyOn(sync, 'sendCommand');
      command(denial(component['playerToken']));
      expect(component.error).not.toBe('');

      component.selectedClaimParticipantId = 'p-1';
      component.claimSelectedCharacter();

      expect(component.error).toBe('');
      expect(component.info).toContain('Claim request sent');
    });
  });

  // ── Review defect 3b (round 2): a released claim is explained ─────────────
  // The mirror of `claim_denied`. When the GM releases a claim (or undoes one),
  // `ownerName` simply disappears from the state and the player's whole
  // character panel used to vanish with no message at all.
  describe('S4 - a released claim is explained to the player (review defect 3, round 2)', () => {
    const MY_ID = 'p-mine';

    function stateOwnedBy(owner: string | undefined, id = MY_ID): SharedCombatState {
      return {
        round: 1, pass: 1, participants: [{
          id, name: 'Wombat', order: 1, active: false,
          claimable: true, ownerName: owner, playerControlled: !!owner
        }]
      };
    }

    async function joinOwning() {
      spyOn(sync, 'joinAsPlayer').and.resolveTo({
        state: stateOwnedBy(component['playerToken']), log: [], gmConnected: true
      });
      component.room = 'ABC123';
      await component.join();
      expect(component.ownParticipants.length).toBe(1);
    }

    it('says the GM released the character and that it can be re-claimed', async () => {
      await joinOwning();

      component['applyIncomingState'](stateOwnedBy(undefined));

      expect(component.ownParticipants.length).toBe(0);
      expect(component.info).toContain('Wombat');
      expect(component.info).toContain('released');
      expect(component.info).toContain('Claim');
    });

    it('clears a stale error so the message is the only thing on screen', async () => {
      await joinOwning();
      component.error = 'Could not claim Wombat: already claimed by another player.';

      component['applyIncomingState'](stateOwnedBy(undefined));

      expect(component.error).toBe('');
    });

    it('says nothing when somebody else\'s claim is released', async () => {
      spyOn(sync, 'joinAsPlayer').and.resolveTo({
        state: stateOwnedBy('pl-someone-else'), log: [], gmConnected: true
      });
      component.room = 'ABC123';
      await component.join();
      component.info = '';

      component['applyIncomingState'](stateOwnedBy(undefined));

      expect(component.info).toBe('');
    });

    it('says nothing while the claim still holds', async () => {
      await joinOwning();
      component.info = '';

      component['applyIncomingState'](stateOwnedBy(component['playerToken']));

      expect(component.info).toBe('');
    });

    it('does not offer a re-claim for a character that left the encounter', async () => {
      await joinOwning();
      component.info = '';

      component['applyIncomingState']({ round: 1, pass: 1, participants: [] });

      expect(component.info).toBe('');
    });

    it('the character reappears in the claim list, so the offer is actionable', async () => {
      await joinOwning();

      component['applyIncomingState'](stateOwnedBy(undefined));
      fixture.detectChanges();

      expect(component.unclaimedParticipants.map(p => p.id)).toEqual([MY_ID]);
    });
  });

  // S4 - the droplet reboots mid-combat with players connected.
  it('S4: a player pulls fresh state after the transport comes back', async () => {
    const joinSpy = spyOn(sync, 'joinAsPlayer').and.resolveTo({
      state: emptyState, log: [], gmConnected: true
    });
    component.room = 'ABC123';
    await component.join();

    joinSpy.and.resolveTo({
      state: {
        round: 2, pass: 2, participants: [{
          id: 'p-1', name: 'Wombat', order: 1, active: true, playerControlled: true,
          pendingRoll: true
        }]
      },
      log: [], gmConnected: true
    });

    await component['rejoinAfterReconnect']();

    expect(component.state?.round).toBe(2);
    // The mid-roll submission lost during the outage is visibly still pending.
    expect(component.state?.participants[0].pendingRoll).toBeTrue();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Round-4 review defects (2026-08-08), fixing gaps found in round 3's review.
//
// D1-D4 are server-side. D2 and D4 share one root cause - a departing player's
// claim could not be released because the socket fields `releasePlayerClaims`
// needs (`socket.data.room` / `socket.data.playerName`) were cleared *before*
// release ran, in `evacuateRoom` (Close/End, D2) and never at all in
// `player:join` (a room switch, D4) - and one fix: `detachFromPreviousRoom`'s
// new `releasePlayerClaim` hook, reused by both call sites in `server.js`.
// D5/D6 are GM-client-side. D7 is retention/eviction messaging.
//
// `server.js` itself cannot be `require`d in this Karma/browser test runner (no
// `http`/`express`/`socket.io` polyfills here) - matching every other
// server.js-adjacent test in this file (see round-3's own "fix 2"/"fix 4"
// sections above), the pieces that live in `server/room-guards.js` and
// `server/session-store.js` are exercised directly, and the parts that are
// pure `server.js` control flow (D3's check ordering) are captured with a
// small mirror of that control flow instead - documented as such below. D1-D4
// were also live-verified against a real running server (see PR notes / final
// report).
// ═════════════════════════════════════════════════════════════════════════════

describe('Round 4 - D1: a malformed room-entry payload cannot crash the server', () => {
  const OPTS = { isRoomCode, roomExists: () => true };

  it('D1: exactly the two events that destructure a payload are shape-checked', () => {
    expect(Array.from(ROOM_ENTRY_PAYLOAD_EVENTS).sort()).toEqual(['gm:join-session', 'player:join']);
  });

  it('D1: all three room-entry events are still exempt from the ordinary room-mismatch rule', () => {
    expect(Array.from(ROOM_ENTRY_EVENTS).sort())
      .toEqual(['gm:create-session', 'gm:join-session', 'player:join']);
  });

  for (const event of ['gm:join-session', 'player:join']) {
    describe(event, () => {
      it(`D1: refuses ${event} emitted with no payload at all (undefined)`, () => {
        // The live crash: `socket.emit("${event}")` with no payload reaches
        // `({ room }) => ...` with its first parameter `undefined`, and
        // `const { room } = undefined` throws - uncaught, since this fires
        // from socket.io's own dispatch, killing the whole process.
        expect(() => authorizeRoomPacket(event, undefined, {}, OPTS)).not.toThrow();
        const verdict = authorizeRoomPacket(event, undefined, {}, OPTS);
        expect(verdict.ok).toBeFalse();
        expect(verdict.reason).toBe('invalid-payload');
      });

      it(`D1: refuses ${event} emitted with an explicit null payload`, () => {
        expect(() => authorizeRoomPacket(event, null, {}, OPTS)).not.toThrow();
        const verdict = authorizeRoomPacket(event, null, {}, OPTS);
        expect(verdict.ok).toBeFalse();
        expect(verdict.reason).toBe('invalid-payload');
      });

      it(`D1: refuses ${event} emitted with a string payload`, () => {
        const verdict = authorizeRoomPacket(event, 'not-an-object', {}, OPTS);
        expect(verdict.ok).toBeFalse();
        expect(verdict.reason).toBe('invalid-payload');
      });

      it(`D1: an array payload does not crash - arrays are objects, so the destructure is safe`, () => {
        // Not refused by this check (arrays are objects), and deliberately so:
        // `{ room } = []` does not throw the way `{ room } = undefined` does,
        // so the handler's own destructure produces `room: undefined`, which
        // the ordinary "room not found" refusal already handles cleanly.
        expect(() => authorizeRoomPacket(event, [], {}, OPTS)).not.toThrow();
        expect(authorizeRoomPacket(event, [], {}, OPTS).ok).toBeTrue();
      });
    });
  }

  it('D1: gm:create-session is unaffected - its first argument is legitimately a function (the ack), not an object', () => {
    const ack = () => { /* no-op ack */ };
    expect(authorizeRoomPacket('gm:create-session', ack, {}, OPTS).ok).toBeTrue();
    expect(authorizeRoomPacket('gm:create-session', undefined, {}, OPTS).ok).toBeTrue();
    expect(authorizeRoomPacket('gm:create-session', null, {}, OPTS).ok).toBeTrue();
  });

  it('D1: the payload-shape check does not widen to already-guarded room-scoped events', () => {
    const verdict = authorizeRoomPacket('session:update-state', undefined, { role: 'gm', room: 'AAAAAA' }, OPTS);
    expect(verdict.ok).toBeFalse();
    expect(verdict.reason).not.toBe('invalid-payload'); // refused for missing room, not payload shape
  });
});

describe('Round 4 - D2 & D4: a departing player\'s claim is always releasable', () => {
  interface FakeSocket {
    id: string;
    data: { room?: string; role?: string; playerName?: string };
  }

  function socket(data: FakeSocket['data']): FakeSocket {
    return { id: 'sock-1', data };
  }

  it('D2/D4: switching a player socket to a new room releases the claim it held in the old one', () => {
    // The D4 leak: player:join never had this at all, so a player who joined
    // room A, claimed a character, then joined room B stayed a member of A
    // and A's claim was never released - nothing would ever release it, since
    // by the time this socket disconnects `socket.data.room` is B, not A.
    const releaseSpy = jasmine.createSpy('releasePlayerClaim');
    const s = socket({ room: 'AAAAAA', role: 'player', playerName: 'tok-1' });

    const left = detachFromPreviousRoom(s, 'BBBBBB', { releasePlayerClaim: releaseSpy });

    expect(left).toBe('AAAAAA');
    expect(releaseSpy).toHaveBeenCalledWith('AAAAAA', 'tok-1');
    expect(s.data.room).toBeUndefined();
  });

  it('D2/D4: a GM switching rooms never triggers a player-claim release', () => {
    const releaseSpy = jasmine.createSpy('releasePlayerClaim');
    const s = socket({ room: 'AAAAAA', role: 'gm' });

    detachFromPreviousRoom(s, 'BBBBBB', { releasePlayerClaim: releaseSpy, clearGmPresence: () => { /* n/a */ } });

    expect(releaseSpy).not.toHaveBeenCalled();
  });

  it('D2/D4: no previous room means nothing to release', () => {
    const releaseSpy = jasmine.createSpy('releasePlayerClaim');
    const s = socket({ role: 'player', playerName: 'tok-1' });

    const left = detachFromPreviousRoom(s, 'BBBBBB', { releasePlayerClaim: releaseSpy });

    expect(left).toBeNull();
    expect(releaseSpy).not.toHaveBeenCalled();
  });

  it('D2/D4: a player socket with no playerName yet has nothing to release', () => {
    const releaseSpy = jasmine.createSpy('releasePlayerClaim');
    const s = socket({ room: 'AAAAAA', role: 'player' });

    detachFromPreviousRoom(s, 'BBBBBB', { releasePlayerClaim: releaseSpy });

    expect(releaseSpy).not.toHaveBeenCalled();
  });

  it('D2/D4: rejoining the room this socket already holds releases nothing - nothing was actually left', () => {
    const releaseSpy = jasmine.createSpy('releasePlayerClaim');
    const s = socket({ room: 'AAAAAA', role: 'player', playerName: 'tok-1' });

    detachFromPreviousRoom(s, 'AAAAAA', { releasePlayerClaim: releaseSpy });

    expect(releaseSpy).not.toHaveBeenCalled();
  });

  it('D2/D4: omitting the hook entirely is safe (defensive default)', () => {
    const s = socket({ room: 'AAAAAA', role: 'player', playerName: 'tok-1' });

    expect(() => detachFromPreviousRoom(s, 'BBBBBB', {})).not.toThrow();
  });

  // ── D2: evacuateRoom (Close/End) releases every departing player's claim ──
  // *before* clearing their socket data - mirroring server.js's evacuateRoom,
  // reproduced here for the reason given in the file-header note above.
  describe('D2: evacuateRoom releases every departing player\'s claim', () => {
    interface EvacSocket { id: string; data: { room?: string; role?: string; playerName?: string } }

    /** Mirrors the new `evacuateRoom` in server.js. */
    function evacuate(sockets: EvacSocket[], room: string, release: (room: string, playerName: string) => void) {
      let detached = 0;
      const departing = new Set<string>();
      for (const s of sockets) {
        if (s.data.room === room) {
          if (s.data.role === 'player' && s.data.playerName) {
            departing.add(s.data.playerName);
          }
          s.data.room = undefined;
          s.data.role = undefined;
          s.data.playerName = undefined;
          detached++;
        }
      }
      for (const playerName of departing) {
        release(room, playerName);
      }
      return detached;
    }

    it('D2: releases a lone player\'s claim exactly once, and clears their socket data afterwards', () => {
      const releases: Array<[string, string]> = [];
      const sockets: EvacSocket[] = [
        { id: 'pl-1', data: { room: 'AAAAAA', role: 'player', playerName: 'tok-1' } }
      ];

      const detached = evacuate(sockets, 'AAAAAA', (r, p) => releases.push([r, p]));

      expect(detached).toBe(1);
      expect(releases).toEqual([['AAAAAA', 'tok-1']]);
      // The old defect: this used to be cleared *before* release ran, so a
      // later genuine disconnect could never release the claim (playerName
      // was already gone). The release above must have captured the name
      // before this clear - it cannot have read it after.
      expect(sockets[0].data.playerName).toBeUndefined();
    });

    it('D2: two different players in the room are each released once', () => {
      const releases: Array<[string, string]> = [];
      const sockets: EvacSocket[] = [
        { id: 'pl-1', data: { room: 'AAAAAA', role: 'player', playerName: 'tok-1' } },
        { id: 'pl-2', data: { room: 'AAAAAA', role: 'player', playerName: 'tok-2' } }
      ];

      evacuate(sockets, 'AAAAAA', (r, p) => releases.push([r, p]));

      expect(releases.length).toBe(2);
      expect(releases).toContain(['AAAAAA', 'tok-1']);
      expect(releases).toContain(['AAAAAA', 'tok-2']);
    });

    it('D2: a GM socket in the room triggers no claim release', () => {
      const releases: Array<[string, string]> = [];
      const sockets: EvacSocket[] = [ { id: 'gm-1', data: { room: 'AAAAAA', role: 'gm' } } ];

      evacuate(sockets, 'AAAAAA', (r, p) => releases.push([r, p]));

      expect(releases).toEqual([]);
    });

    it('D2: a player in a different room is untouched', () => {
      const releases: Array<[string, string]> = [];
      const sockets: EvacSocket[] = [
        { id: 'pl-1', data: { room: 'BBBBBB', role: 'player', playerName: 'tok-1' } }
      ];

      evacuate(sockets, 'AAAAAA', (r, p) => releases.push([r, p]));

      expect(releases).toEqual([]);
      expect(sockets[0].data.room).toBe('BBBBBB');
    });
  });
});

// ── D3: eviction must never run before every other create-refusal reason ──
// (rate limit, per-connection lifetime cap) has already been cleared, because
// eviction deletes a real persisted room. This is pure `gm:create-session`
// control flow in server.js, which cannot be loaded here (see file header) -
// so the intended order is captured as a small mirror and live-verified
// separately against a real server.
describe('Round 4 - D3: capacity eviction runs only after every other refusal reason', () => {
  /** Mirrors the reordered `gm:create-session` admission sequence in server.js. */
  function admitCreate(
    opts: { socketLimitOk: boolean; rateLimiter: RoomCreationLimiter; key: string; capReached: boolean; evict: () => boolean }
  ): { allowed: boolean; reason?: string } {
    if (!opts.socketLimitOk) {
      return { allowed: false, reason: 'socket-limit' };
    }
    if (!opts.rateLimiter.tryCreate(opts.key).allowed) {
      return { allowed: false, reason: 'rate-limited' };
    }
    if (opts.capReached && !opts.evict()) {
      return { allowed: false, reason: 'room-cap-reached' };
    }
    return { allowed: true };
  }

  it('D3: a create refused by the rate limiter never evicts, even at the cap', () => {
    const limiter = createRoomCreationLimiter({ limit: 1, windowMs: 60000, now: () => 0 });
    limiter.tryCreate('origin-1'); // consume the only slot
    const evictSpy = jasmine.createSpy('evict').and.returnValue(true);

    const result = admitCreate({
      socketLimitOk: true, rateLimiter: limiter, key: 'origin-1', capReached: true, evict: evictSpy
    });

    expect(result.allowed).toBeFalse();
    expect(result.reason).toBe('rate-limited');
    expect(evictSpy).not.toHaveBeenCalled();
  });

  it('D3: a create refused by the per-connection lifetime cap never evicts either', () => {
    const limiter = createRoomCreationLimiter({ limit: 100, windowMs: 60000, now: () => 0 });
    const evictSpy = jasmine.createSpy('evict').and.returnValue(true);

    const result = admitCreate({
      socketLimitOk: false, rateLimiter: limiter, key: 'origin-1', capReached: true, evict: evictSpy
    });

    expect(result.allowed).toBeFalse();
    expect(result.reason).toBe('socket-limit');
    expect(evictSpy).not.toHaveBeenCalled();
  });

  it('D3: eviction runs, and only runs, once every other check has passed and the room is actually at capacity', () => {
    const limiter = createRoomCreationLimiter({ limit: 100, windowMs: 60000, now: () => 0 });
    const evictSpy = jasmine.createSpy('evict').and.returnValue(true);

    const result = admitCreate({
      socketLimitOk: true, rateLimiter: limiter, key: 'origin-1', capReached: true, evict: evictSpy
    });

    expect(result.allowed).toBeTrue();
    expect(evictSpy).toHaveBeenCalledTimes(1);
  });

  it('D3: not at capacity, eviction is never even attempted', () => {
    const limiter = createRoomCreationLimiter({ limit: 100, windowMs: 60000, now: () => 0 });
    const evictSpy = jasmine.createSpy('evict').and.returnValue(true);

    const result = admitCreate({
      socketLimitOk: true, rateLimiter: limiter, key: 'origin-1', capReached: false, evict: evictSpy
    });

    expect(result.allowed).toBeTrue();
    expect(evictSpy).not.toHaveBeenCalled();
  });
});

describe('Round 4 - D5: a genuine fresh tab is never shown the destructive-join warning', () => {
  let component: BattleTrackerComponent;
  let fixture: ComponentFixture<BattleTrackerComponent>;

  beforeEach(async () => {
    // Unlike every other GM-client describe in this file, this one does NOT
    // call resetCombat() after construction - the whole point is to observe
    // what the constructor itself leaves on screen for a genuine fresh tab
    // (review defect D5). Every other spec's `beforeEach` empties the manager
    // right after the constructor runs, which is exactly what let this defect
    // hide: the constructor's own placeholder never survived to be tested. It
    // still resets *before* construction, so a participant left behind by an
    // earlier spec cannot masquerade as "the" placeholder.
    resetCombat();
    await TestBed.configureTestingModule({
      imports: [BattleTrackerComponent],
      providers: appConfig.providers
    }).compileComponents();
    fixture = TestBed.createComponent(BattleTrackerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => resetCombat());

  it('D5: the constructor seeds exactly one untouched, unnamed participant - never literally zero', () => {
    expect(CombatManager.participants.items.length).toBe(1);
    expect(CombatManager.participants.items[0].name).toBe('');
  });

  it('D5: a genuinely fresh tab joining a room is not shown the destructive-join warning', async () => {
    const sync = TestBed.inject(SessionSyncService);
    spyOn(sync, 'connect');
    spyOn(sync, 'onCommand');
    spyOn(sync, 'onLog');
    spyOn(sync, 'onSessionClosed');
    spyOn(sync, 'onError');
    spyOn(sync, 'onDisconnect');
    spyOn(sync, 'onReconnect');
    const confirmSpy = spyOn(component['confirmationDialog'], 'confirm');
    spyOn(sync, 'joinAsGm').and.resolveTo({ state: { round: 1, pass: 1, participants: [] }, log: [] });
    component.shareJoinCode = 'ABC123';

    await component.btnJoinShareSession_Click();

    expect(confirmSpy).not.toHaveBeenCalled();
  });
});

describe('Round 4 - D5: isUnusedPlaceholder matches only an untouched placeholder', () => {
  let component: BattleTrackerComponent;
  let fixture: ComponentFixture<BattleTrackerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BattleTrackerComponent],
      providers: appConfig.providers
    }).compileComponents();
    fixture = TestBed.createComponent(BattleTrackerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    resetCombat();
  });

  afterEach(() => resetCombat());

  /** Adds one placeholder exactly the way the constructor does, and returns it. */
  function placeholder(): Participant {
    component.addParticipant();
    const items = CombatManager.participants.items;
    return items[items.length - 1] as Participant;
  }

  it('D5: an untouched placeholder is recognised', () => {
    expect(component['isUnusedPlaceholder'](placeholder())).toBeTrue();
  });

  it('D5: naming it disqualifies it', () => {
    const p = placeholder();
    p.name = 'Wombat';
    expect(component['isUnusedPlaceholder'](p)).toBeFalse();
  });

  it('D5: taking damage disqualifies it', () => {
    const p = placeholder();
    p.physicalDamage = 1;
    expect(component['isUnusedPlaceholder'](p)).toBeFalse();
  });

  it('D5: rolling initiative disqualifies it', () => {
    const p = placeholder();
    p.diceIni = 4;
    expect(component['isUnusedPlaceholder'](p)).toBeFalse();
  });

  it('D5: making it claimable disqualifies it', () => {
    const p = placeholder();
    component.btnToggleClaimable_Click(p);
    expect(component['isUnusedPlaceholder'](p)).toBeFalse();
  });

  it('D5: promoting a participant to MatrixParticipant disqualifies it (it is not the constructor\'s placeholder)', () => {
    const p = new MatrixParticipant();
    CombatManager.participants.insert(p, false);
    expect(component['isUnusedPlaceholder'](p)).toBeFalse();
  });

  it('D5: confirmDestructiveJoin treats a lone untouched placeholder the same as literally empty', async () => {
    placeholder();
    expect(CombatManager.participants.items.length).toBe(1);
    const confirmSpy = spyOn(component['confirmationDialog'], 'confirm');

    const proceed = await component['confirmDestructiveJoin']('ZZZ999');

    expect(proceed).toBeTrue();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('D5: confirmDestructiveJoin still asks, and counts only the real participant, when one sits next to the placeholder', async () => {
    placeholder();
    const named = new Participant();
    named.name = 'Wombat';
    CombatManager.participants.insert(named, false);
    const confirmSpy = spyOn(component['confirmationDialog'], 'confirm').and.resolveTo(false);

    await component['confirmDestructiveJoin']('ZZZ999');

    expect(confirmSpy).toHaveBeenCalled();
    const message = confirmSpy.calls.mostRecent().args[0];
    expect(message).toContain('1 participant on screen');
  });
});

describe('Round 4 - D6: a stale live-encounter association cannot silently overwrite a different room', () => {
  let component: BattleTrackerComponent;
  let fixture: ComponentFixture<BattleTrackerComponent>;
  let sync: SessionSyncService;
  let broadcasts: SharedCombatState[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BattleTrackerComponent],
      providers: appConfig.providers
    }).compileComponents();

    fixture = TestBed.createComponent(BattleTrackerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    resetCombat();

    sync = TestBed.inject(SessionSyncService);
    broadcasts = [];
    spyOn(sync, 'broadcastState').and.callFake((s: SharedCombatState) => { broadcasts.push(s); });
    spyOn(sync, 'appendLog');
    spyOn(sync, 'connect');
    spyOn(sync, 'onCommand');
    spyOn(sync, 'onLog');
    spyOn(sync, 'onSessionClosed');
    spyOn(sync, 'onError');
    spyOn(sync, 'onDisconnect');
    spyOn(sync, 'onReconnect');
  });

  afterEach(() => resetCombat());

  function addNamed(name: string): Participant {
    const p = new Participant();
    p.name = name;
    CombatManager.participants.insert(p, false);
    return p;
  }

  it('D6: mis-tap-and-immediately-recover still pushes cleanly (no regression - existing case)', async () => {
    addNamed('Slice');
    addNamed('Ganger');
    component.shareRoomCode = 'ABC123';
    component['liveEncounterRoomCode'] = 'ABC123';
    spyOn(sync, 'joinAsGm').and.resolveTo({ state: null, log: [] });
    component.shareJoinCode = 'ABC123';

    await component.btnJoinShareSession_Click();

    expect(broadcasts.length).toBe(1);
    expect(component.shareInfo).toContain('nothing was replaced');
  });

  it('D6: building a completely different encounter under another room, then rejoining the old code, warns instead of silently overwriting', async () => {
    // GM runs room A.
    addNamed('Slice');
    addNamed('Ganger');
    component.shareRoomCode = 'ABC123';
    component['liveEncounterRoomCode'] = 'ABC123'; // room A's fingerprint: Slice, Ganger

    // Mis-tap: Create Player Session makes a second room B. Still the same
    // encounter for now (round-3 fix 6) - additive, so A is untouched.
    spyOn(component['confirmationDialog'], 'confirm').and.resolveTo(true);
    spyOn(sync, 'createSession').and.resolveTo({ room: 'BBBBBB' });
    await component.btnCreateShareSession_Click();
    expect(component['holdsLiveEncounterFor']('ABC123')).toBeTrue();

    // Builds a *completely different* encounter under B "over the following
    // hour": the original cast leaves, an unrelated one arrives.
    CombatManager.removeParticipant(CombatManager.participants.items[1]);
    CombatManager.removeParticipant(CombatManager.participants.items[0]);
    addNamed('Troll Bouncer');
    addNamed('Rigger');
    broadcasts.length = 0;

    // Later, rejoins A by typing its code.
    spyOn(sync, 'joinAsGm').and.resolveTo({ state: null, log: [] });
    component.shareJoinCode = 'ABC123';

    await component.btnJoinShareSession_Click();

    // Not pushed: room A's real saved state was not silently overwritten by
    // the unrelated cast now on screen.
    expect(broadcasts.length).toBe(0);
    expect(component.shareInfo).toContain('no longer matches');
    expect(component['holdsLiveEncounterFor']('ABC123')).toBeFalse();
    // This is a refusal to push, not a pull - the on-screen encounter itself
    // is completely untouched.
    expect(CombatManager.participants.items.map(p => p.name)).toEqual(['Troll Bouncer', 'Rigger']);
  });

  it('D6: adding and removing individual participants from the same fight is not treated as divergence', async () => {
    addNamed('Slice');
    addNamed('Ganger');
    component.shareRoomCode = 'ABC123';
    component['liveEncounterRoomCode'] = 'ABC123';

    // Ordinary play: one participant leaves, a new one joins - Slice, the
    // original survivor, is still here.
    CombatManager.removeParticipant(CombatManager.participants.items[1]);
    addNamed('Reinforcement');

    spyOn(sync, 'joinAsGm').and.resolveTo({ state: null, log: [] });
    component.shareJoinCode = 'ABC123';
    broadcasts.length = 0;

    await component.btnJoinShareSession_Click();

    expect(broadcasts.length).toBe(1);
    expect(component.shareInfo).toContain('nothing was replaced');
  });

  it('D6: a room this tab has never fingerprinted (defensive-only gap) still pushes - no evidence of divergence', async () => {
    addNamed('Slice');
    component.shareRoomCode = 'ABC123';
    component['liveEncounterRooms'].add('ABC123'); // bypasses markRoomLive on purpose
    spyOn(sync, 'joinAsGm').and.resolveTo({ state: null, log: [] });
    component.shareJoinCode = 'ABC123';

    await component.btnJoinShareSession_Click();

    expect(broadcasts.length).toBe(1);
  });

  it('D6: markRoomLive fingerprints exactly the participants on screen at that moment', () => {
    addNamed('Slice');
    component['markRoomLive']('ABC123');

    const fingerprint = component['liveEncounterFingerprints'].get('ABC123');

    expect(fingerprint?.size).toBe(1);
  });

  it('D6: liveEncounterDivergedFrom is false (fails open) with no recorded fingerprint', () => {
    expect(component['liveEncounterDivergedFrom']('ZZZ999')).toBeFalse();
  });

  it('D6: liveEncounterDivergedFrom is true only once zero participants survive from the fingerprint', () => {
    const slice = addNamed('Slice');
    component['markRoomLive']('ABC123');

    CombatManager.removeParticipant(slice);
    addNamed('Someone Else');

    expect(component['liveEncounterDivergedFrom']('ABC123')).toBeTrue();
  });

  it('D6: ending the diverged room\'s association does not disturb any other room this tab still holds', async () => {
    addNamed('Slice');
    component.shareRoomCode = 'ABC123';
    component['markRoomLive']('ABC123');
    component['markRoomLive']('KEEPME');

    CombatManager.removeParticipant(CombatManager.participants.items[0]);
    addNamed('Someone Else');
    spyOn(sync, 'joinAsGm').and.resolveTo({ state: null, log: [] });
    component.shareJoinCode = 'ABC123';

    await component.btnJoinShareSession_Click();

    expect(component['holdsLiveEncounterFor']('ABC123')).toBeFalse();
    expect(component['holdsLiveEncounterFor']('KEEPME')).toBeTrue();
  });
});

describe('Round 4 - D7: capacity eviction leaves a tombstone; End Room leaves none', () => {
  let fs: FakeFs;
  let clockNow: number;
  let store: SessionStore;

  beforeEach(() => {
    fs = new FakeFs();
    clockNow = Date.parse('2026-08-08T12:00:00.000Z');
    store = createSessionStore({ fs, dir: DATA_DIR, now: () => clockNow });
  });

  /** Mirrors server.js's `roomNotFoundReason` - not exported, so reproduced here (see file header). */
  function roomNotFoundReason(room: string): string {
    const expiry = store.expiryOf(room);
    if (expiry) {
      const when = new Date(expiry.expiredAt).toISOString().slice(0, 10);
      const why = expiry.reason ? ` (${expiry.reason})` : '';
      return `Room ${room} was removed on ${when}${why} and is no longer available.`;
    }
    return 'Room not found';
  }

  it('D7: an End Room (remove) leaves no tombstone - a bare refusal is correct there', () => {
    store.touch('ABC123', session());
    store.flush('ABC123');

    store.remove('ABC123');

    expect(store.expiryOf('ABC123')).toBeNull();
    expect(roomNotFoundReason('ABC123')).toBe('Room not found');
  });

  it('D7: a capacity eviction (evict) deletes the room file and leaves a tombstone with the reason', () => {
    store.touch('ABC123', session());
    store.flush('ABC123');

    store.evict('ABC123', 'removed to free capacity for a new room');

    expect(fs.names()).toEqual([`ABC123${TOMBSTONE_FILE_SUFFIX}`]); // room file gone, tombstone written
    const expiry = store.expiryOf('ABC123');
    expect(expiry).not.toBeNull();
    expect(expiry!.reason).toBe('removed to free capacity for a new room');
    expect(roomNotFoundReason('ABC123')).toBe(
      'Room ABC123 was removed on 2026-08-08 (removed to free capacity for a new room) and is no longer available.'
    );
  });

  it('D7: evict cancels a pending debounced write, like remove() does', () => {
    store.touch('ABC123', session());
    expect(store.pendingRooms()).toEqual(['ABC123']);

    store.evict('ABC123', 'removed to free capacity for a new room');

    expect(store.pendingRooms()).toEqual([]);
  });

  it('D7: a legacy 30-day-retention marker (no reason recorded) still reads as a bare removal message', () => {
    fs.files.set(`${DATA_DIR}/OLDEXP${TOMBSTONE_FILE_SUFFIX}`, JSON.stringify({
      version: 1, room: 'OLDEXP', expiredAt: clockNow
    }));

    const expiry = store.expiryOf('OLDEXP');

    expect(expiry!.reason).toBeNull();
    expect(roomNotFoundReason('OLDEXP')).toBe('Room OLDEXP was removed on 2026-08-08 and is no longer available.');
  });

  it('D7: eviction is still logged and reported the same way as before (idle room, room code)', () => {
    // Sanity: `evict()` does not change what a caller can observe about
    // *which* room was evicted, only that a tombstone now exists for it.
    store.touch('ABC123', session());
    store.flush('ABC123');

    store.evict('ABC123', 'removed to free capacity for a new room');

    expect(store.expiryOf('ABC123')?.expiredAt).toBe(clockNow);
  });
});
