/**
 * Types for `server/session-store.js`.
 *
 * The store itself is plain CommonJS because `server.js` requires it directly.
 * These declarations exist so the Karma specs (the only test runner this repo
 * has) can import and exercise it with an in-memory filesystem fake.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface PersistedSession {
  state: any;
  log: any[];
  lastActivity?: number;
  /** When the room entered the in-memory Map; used by the contentless reaper. */
  createdAt?: number;
}

export interface SessionStoreOptions {
  fs: any;
  path?: { join: (...parts: string[]) => string };
  dir: string;
  now?: () => number;
  debounceMs?: number;
  /** How long a *legacy* expiry marker is kept. Live rooms never expire. */
  tombstoneRetentionMs?: number;
  sweepIntervalMs?: number;
  logInfo?: (msg: string) => void;
  logError?: (msg: string, err?: unknown) => void;
}

export interface SessionStore {
  readonly dir: string;
  /** Always true: no persisted room is removed for age (AC 11, amended). */
  readonly retentionIndefinite: boolean;
  readonly tombstoneRetentionMs: number;
  readonly debounceMs: number;
  loadAll(): { sessions: Map<string, PersistedSession>; skipped: string[] };
  touch(room: string, session: PersistedSession): void;
  flush(room: string): boolean;
  flushAll(): number;
  /** Flush everything pending and switch `touch` to immediate writes. */
  beginShutdown(): number;
  isDraining(): boolean;
  /** Destroy a room entirely, no marker left ("End Room", spec AC 8). */
  remove(room: string): boolean;
  /**
   * Drop a room's persisted record because the server evicted it for capacity
   * (round-4 defect D7), leaving a tombstone with `reason` behind - unlike
   * `remove()`, which is the GM's own informed action and leaves none.
   */
  evict(room: string, reason?: string): void;
  /** `removed` is always empty: retention is indefinite (AC 11, amended). */
  sweep(liveSessions?: Map<string, PersistedSession>): { removed: string[]; tombstonesRemoved: number };
  expiryOf(room: string): { expiredAt: number; reason: string | null } | null;
  startSweepTimer(liveSessions?: Map<string, PersistedSession>): unknown;
  stopSweepTimer(): void;
  pendingRooms(): string[];
}

export declare function createSessionStore(options: SessionStoreOptions): SessionStore;
export declare function createRoomCode(random?: () => number): string;
export declare function isRoomCode(value: unknown): boolean;
/** True once a room holds a state snapshot or at least one log entry. */
export declare function hasPersistableContent(session: PersistedSession | null | undefined): boolean;

export declare const STORE_FORMAT_VERSION: number;
export declare const ROOM_FILE_SUFFIX: string;
export declare const TOMBSTONE_FILE_SUFFIX: string;
export declare const TEMP_FILE_SUFFIX: string;
export declare const DEFAULT_WRITE_DEBOUNCE_MS: number;
export declare const ROOM_RETENTION_INDEFINITE: boolean;
export declare const DEFAULT_TOMBSTONE_RETENTION_MS: number;
export declare const DEFAULT_SWEEP_INTERVAL_MS: number;
