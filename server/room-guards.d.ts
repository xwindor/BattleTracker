/**
 * Types for `server/room-guards.js`.
 *
 * The module itself is plain CommonJS because `server.js` requires it directly.
 * These declarations exist so the Karma specs (the only test runner this repo
 * has) can import and exercise it. See `briefs/persistent-rooms.md` AC 16.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface RoomCreationDecision {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export interface RoomCreationLimiterOptions {
  now?: () => number;
  limit?: number;
  windowMs?: number;
}

export interface RoomCreationLimiter {
  readonly limit: number;
  readonly windowMs: number;
  tryCreate(key: string): RoomCreationDecision;
  /** Drop elapsed windows, so the limiter is not itself an unbounded Map. */
  prune(): number;
  size(): number;
  reset(): void;
}

export interface CreationOriginKeyOptions {
  headers?: Record<string, unknown>;
  /**
   * Opt-in. X-Forwarded-For is ignored entirely unless this is exactly `true`
   * (`SR5E_TRUST_PROXY=1`); with no trusted proxy the key is the raw socket
   * remote address, which the caller cannot choose.
   */
  trustProxy?: boolean;
  /** Trusted reverse-proxy hops in front of this process (SR5E_PROXY_HOPS). */
  proxyHops?: number;
  address?: string;
  socketId?: string;
}

export declare function creationOriginKey(options?: CreationOriginKeyOptions): string;

export declare function roomCapReached(sessions: Map<string, any>, cap?: number): boolean;

export interface FindEvictableRoomOptions {
  /** True while any socket is still connected to that room; never evicted. */
  hasConnectedSockets?: (room: string) => boolean;
}

/** The least recently active room with nobody connected, or null. */
export declare function findEvictableRoom(
  sessions: Map<string, any>,
  options?: FindEvictableRoomOptions
): string | null;

export interface RoomPacketAuthorization {
  ok: boolean;
  reason?: string;
  /** True when the refusal is "this room does not exist" (lifecycle events). */
  notFound?: boolean;
  room?: string;
}

export interface AuthorizeRoomPacketOptions {
  isRoomCode?: (v: any) => boolean;
  roomExists?: (room: string) => boolean;
}

/** The one room-ownership rule. See `server/room-guards.js`. */
export declare function authorizeRoomPacket(
  event: string,
  payload: any,
  socketData: { role?: string; room?: string } | undefined,
  options?: AuthorizeRoomPacketOptions
): RoomPacketAuthorization;

export declare const ROOM_ENTRY_EVENTS: Set<string>;
/** Room-entry events whose payload is validated as a non-null object (round-4 defect D1). */
export declare const ROOM_ENTRY_PAYLOAD_EVENTS: Set<string>;
export declare const ROOM_SCOPED_EVENTS: Map<string, { roles: string[]; requiresExistingRoom?: boolean }>;

export interface DetachableSocket {
  id?: string;
  data?: { room?: string; role?: string; playerName?: string; [key: string]: any };
  leave?: (room: string) => void;
}

export interface DetachHooks {
  clearGmPresence?: (room: string, socketId: string) => void;
  /**
   * Called when a *player* socket leaves a previous room, with that room's
   * code and the player's token, so the previous room's claim can be released
   * (round-4 defects D2/D4) - not just gm presence.
   */
  releasePlayerClaim?: (room: string, playerName: string) => void;
}

/** Returns the room left, or null when there was nothing to leave. */
export declare function detachFromPreviousRoom(
  socket: DetachableSocket,
  nextRoom: string,
  hooks?: DetachHooks
): string | null;

export interface ReapContentlessRoomsOptions {
  now?: () => number;
  ttlMs?: number;
  hasContent: (session: any) => boolean;
  onReap?: (room: string) => void;
}

export declare function createRoomCreationLimiter(
  options?: RoomCreationLimiterOptions
): RoomCreationLimiter;

export declare function reapContentlessRooms(
  sessions: Map<string, any>,
  options: ReapContentlessRoomsOptions
): string[];

/**
 * Clear every persisted character claim in restored rooms at boot. Returns the
 * number of rooms whose ownership was corrected.
 */
export declare function releaseAllClaimsOnBoot(
  sessions: Map<string, any>
): number;

export declare const ROOM_CREATE_LIMIT: number;
export declare const ROOM_CREATE_WINDOW_MS: number;
export declare const SOCKET_ROOM_CREATE_LIMIT: number;
export declare const TRUSTED_PROXY_HOPS: number;
export declare const TOTAL_ROOM_CAP: number;
export declare const CONTENTLESS_ROOM_TTL_MS: number;
export declare const CONTENTLESS_SWEEP_INTERVAL_MS: number;
