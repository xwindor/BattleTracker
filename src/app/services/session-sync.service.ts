import { Injectable } from "@angular/core";
import { io, Socket } from "socket.io-client";
import { GlitchLevel } from "app/shared/roll-utils";

/**
 * One NPC inside a linked NPC row on the wire (`GruntMemberSnapshot` in
 * transport form; see `src/Grunts/GruntMember.ts`).
 *
 * Broadcast so a GM rejoining a shared session gets their rows back with their
 * NPCs, each with its own Condition Monitor (brief "NPC Group Initiative"
 * criteria 3-4, 7, p. 379) rather than as an empty plain participant. Rows are
 * GM-side bookkeeping: the player view renders participants, not row members,
 * so nothing here is surfaced to players today.
 */
export interface SharedGruntMemberState {
  name: string;
  body: number;
  willpower: number;
  /** Boxes filled on the single combined Physical + Stun track (p. 379). */
  damage: number;
  /** 'physical' | 'stun' - the final attack's type, for alive/dead (p. 379). */
  lastDamageType?: string | null;
  lastDamageValue?: number;
}

export interface SharedParticipantState {
  id: string;
  name: string;
  order: number;
  active: boolean;
  initiativeScore?: number;
  playerControlled: boolean;
  claimable?: boolean;
  ownerName?: string;
  canAct?: boolean;
  canDelay?: boolean;
  canInterrupt?: boolean;
  initiativeDice?: number;
  pendingRoll?: boolean;
  /**
   * Sum of the Initiative Dice already rolled this Combat Turn (`diceIni`).
   * Broadcast so a rejoining GM can tell "already rolled" from "still needs to
   * roll": Initiative is rolled once per Combat Turn (p. 159/160), so a restore
   * must not re-offer the roll to a participant who already has a running
   * Score. 0 / absent means the Initiative Test has not been taken.
   */
  rolledInitiativeTotal?: number;
  edgeRating?: number;
  reaction?: number;
  intuition?: number;

  // Linked-NPC-row-specific (populated when isNpcRow(participant)).
  // Without these a rejoining GM's row came back as a plain Participant: no
  // members, no shared wound accumulator, and canInterrupt flipping back to
  // true - handing the row the Interrupt Actions Decision 3 forbids it.
  isNpcRow?: boolean;
  /**
   * True for a standalone / detached grunt - one grunt-shaped NPC on its own
   * Initiative Score, with the single combined Condition Monitor of p. 379
   * (brief addendum Decisions 9 and 12).
   *
   * Presentation only: it exists so the player view can badge a lone grunt the
   * way it badges a group, and carries no rules content. It is deliberately
   * **not** used to reconstruct the participant class on a GM rejoin - a
   * detached grunt still comes back as a plain participant, which is a known,
   * accepted gap tracked outside this change.
   */
  isDetachedGrunt?: boolean;
  rowMembers?: SharedGruntMemberState[];
  /** The row's shared wound accumulator (criterion 5 / Decision 1, p. 169). */
  rowWoundModifier?: number;
  /** Distinguishes an emptied row from one the GM has not filled in yet. */
  rowEverPopulated?: boolean;

  // Astral-specific (populated when participant instanceof AstralParticipant).
  isAstral?: boolean;
  isAstralProjecting?: boolean;

  // Matrix-specific (populated when participant instanceof MatrixParticipant).
  isMatrix?: boolean;
  vrMode?: string;          // 'AR' | 'cold-sim' | 'hot-sim'
  overwatch?: number;
  overwatchAlert?: string;  // 'none' | 'ic-alert' | 'convergence'
  jackedIn?: boolean;
  isVRCatatonic?: boolean;  // mirrors blocksPhysicalActions for the player view
  dataProcessing?: number;
  attack?: number;
  sleaze?: number;
  firewall?: number;
  deviceRating?: number;
}

export interface SharedMatrixParticipantState extends SharedParticipantState {
  isMatrix?: boolean;
  vrMode?: string;
  overwatch?: number;
  overwatchAlert?: string;
  jackedIn?: boolean;
  isVRCatatonic?: boolean;
}

export interface SharedMatrixTarget {
  id: string;
  name: string;
  type: string;
  /** 'invisible' omitted from broadcast; 'ghost' sanitised (type='unknown', name=''); 'revealed' sent in full. */
  spotted: string;
  marks: Record<string, number>;
  matrixDamage: number;
  matrixHealth: number;
  directConnection?: boolean;
}

export interface SharedCombatState {
  round: number;
  pass: number;
  started?: boolean;
  passEnded?: boolean;
  currentInitiative?: number;
  participants: SharedParticipantState[];

  /**
   * How many participants the GM's encounter holds that are **not** in
   * `participants` because they are out of action.
   *
   * `getSharedParticipants()` filters OOC participants out of the broadcast
   * (spec Open Decision 4 - restoring them is a known, accepted gap), which
   * means an encounter where everybody has been dropped serialises as
   * `participants: []` and is indistinguishable on the wire from a room that
   * never had an encounter at all. A GM joining that code was therefore never
   * warned, and the join's empty-snapshot branch pushed local state over a real
   * saved fight (round-3 fix 5).
   *
   * Persistence/overwrite-guard use only. Nothing renders it, and no
   * "active participants" logic reads it - those exclusions of OOC are
   * deliberate and unchanged.
   */
  oocParticipantCount?: number;

  // Matrix extensions (Phase 4 wires broadcasting; defined here so the
  // shared types are stable from Phase 1 onward).
  matrixTargets?: SharedMatrixTarget[];
  currentHostName?: string;
}

export interface SharedLogEntry {
  actor: string;
  text: string;
  timestamp: string;

  /**
   * Stable per-entry id. Present on entries a later entry can point at (a
   * glitched roll). Optional so snapshots from older builds still load.
   */
  id?: string;

  /**
   * Glitch status of the roll this entry records: more than half the dice
   * showed a 1, and `critical` when that roll also produced no hits
   * (brief p. 45). Absent/`none` on entries that are not a roll.
   */
  glitch?: GlitchLevel;

  /**
   * `id` of the entry this one annotates. Used to attach GM glitch narration
   * to the roll it describes without rewriting the original entry - the log
   * is append-only.
   */
  refId?: string;

  /**
   * Human-readable restatement of the entry `refId` points at (actor plus that
   * roll's hit/glitch summary), carried on the wire so both screens can show
   * the link without holding the parent entry. The log is a flat list, so
   * unrelated entries can land in between and adjacency proves nothing.
   */
  refSummary?: string;

  /**
   * True when the entry's text is GM-authored narrative typed at the table.
   * Glitch consequences are entirely the GM's invention; nothing here is ever
   * generated from a table (brief p. 45).
   */
  gmNote?: boolean;

  /**
   * True when the gamemaster made this roll on behalf of a non-player
   * combatant: `actor` is that combatant's name, not the GM's. The gamemaster
   * governs the actions of the non-player characters and determines the
   * results of their tests (brief p. 44), so the dice are the GM's but the
   * roll belongs to the named NPC. Presentation only - nothing about the
   * resolution differs from any other roll.
   */
  npc?: boolean;

  /**
   * Set only on entries the GM kept off the wire. Whether GM rolls are visible
   * to players is a table decision, not a rule (brief p. 330). An entry
   * carrying this flag exists in the GM's local list only and was never sent
   * to the server, so players cannot receive one.
   */
  hiddenFromPlayers?: boolean;

  /**
   * True when the entry states a table ruling rather than a printed rule
   * (brief "Action Log readability", `briefs/action-log-readability-spec.md`).
   * Presentation only - it drives the "house rule" badge in the GM pane. Set
   * only on GM-only entries (the NPC-row group-wound line), so in practice it
   * is never sent to a player.
   */
  houseRule?: boolean;
}

export interface SessionCommand {
  type: string;
  player: string;
  payload?: Record<string, unknown>;
  timestamp: string;
}

@Injectable({ providedIn: "root" })
export class SessionSyncService {
  private socket: Socket | null = null;
  currentRoom = "";
  private readonly requestTimeoutMs = 6000;
  private lastServerUrl = "";
  private hasConnectedOnce = false;
  private reconnectListener: (() => void) | null = null;

  connect(url = this.getDefaultServerUrl()) {
    this.lastServerUrl = url;
    if (this.socket) {
      return;
    }
    this.socket = io(url, {
      path: "/socket.io",
      timeout: this.requestTimeoutMs
    });
  }

  private getDefaultServerUrl(): string {
    if (typeof window === "undefined") {
      return "http://localhost:4200";
    }
    return window.location.origin;
  }

  private async ensureConnected(): Promise<void> {
    if (!this.socket) {
      this.connect();
    }
    const socket = this.socket;
    if (!socket) {
      throw new Error("Session socket is not initialized.");
    }
    if (socket.connected) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("Could not connect to session server."));
      }, this.requestTimeoutMs);

      const onConnect = () => {
        cleanup();
        resolve();
      };

      const onError = (err: Error) => {
        cleanup();
        const protocol = typeof window !== "undefined" ? window.location.protocol : "";
        if (protocol === "https:") {
          reject(new Error("Session server uses HTTP on port 3001. Open the app with HTTP (for example http://localhost:4200) or host the session server behind HTTPS."));
          return;
        }
        const rawMessage = err?.message || "Could not connect to session server.";
        if (rawMessage.includes("xhr poll error") || rawMessage.includes("websocket error")) {
          reject(new Error(`Cannot reach session transport at ${this.lastServerUrl}/socket.io. Start 'npm run server', run 'npm start', and use the Angular dev proxy.`));
          return;
        }
        reject(new Error(rawMessage));
      };

      const cleanup = () => {
        window.clearTimeout(timeout);
        socket.off("connect", onConnect);
        socket.off("connect_error", onError);
      };

      socket.on("connect", onConnect);
      socket.on("connect_error", onError);
      socket.connect();
    });
  }

  private async emitWithAck<T>(event: string, payload?: unknown): Promise<T> {
    await this.ensureConnected();
    const socket = this.socket;
    if (!socket) {
      throw new Error("Session socket is not available.");
    }

    return new Promise<T>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        reject(new Error(`No response from server for ${event}.`));
      }, this.requestTimeoutMs);

      const ack = (res: T) => {
        window.clearTimeout(timeout);
        resolve(res);
      };

      if (payload === undefined) {
        socket.emit(event, ack);
      } else {
        socket.emit(event, payload, ack);
      }
    });
  }

  onState(handler: (state: SharedCombatState) => void) {
    this.socket?.off("session:state");
    this.socket?.on("session:state", handler);
  }

  onLog(handler: (entry: SharedLogEntry) => void) {
    this.socket?.off("session:log-entry");
    this.socket?.on("session:log-entry", handler);
  }

  onCommand(handler: (command: SessionCommand) => void) {
    this.socket?.off("session:command");
    this.socket?.on("session:command", handler);
  }

  onSessionClosed(handler: (payload: { room: string; persisted?: boolean }) => void) {
    this.socket?.off("session:closed");
    this.socket?.on("session:closed", handler);
  }

  /**
   * Server-side rejection of something this client emitted.
   *
   * Nothing listened for `session:error` before durable rooms: after a server
   * restart the GM's socket reconnects with no role, every `session:update-state`
   * is rejected, and the GM kept running combat while players' screens were
   * frozen (spec, "The silent-death path" / AC 10). A rejected broadcast must
   * surface.
   */
  onError(handler: (payload: { event: string; reason: string }) => void) {
    this.socket?.off("session:error");
    this.socket?.on("session:error", handler);
  }

  /** Transport dropped. Socket.IO reconnects on its own; this is the notice. */
  onDisconnect(handler: (reason: string) => void) {
    this.socket?.off("disconnect");
    this.socket?.on("disconnect", handler);
  }

  /**
   * Transport came back after a drop (a server restart, a flaky link).
   *
   * The reconnected socket is a *new* socket with empty `socket.data`, so it
   * has no role until it re-authenticates - which is the caller's job. See
   * `BattleTrackerComponent.handleSessionReconnected` for why the GM must then
   * PUSH rather than pull.
   */
  onReconnect(handler: () => void) {
    const socket = this.socket;
    if (!socket) {
      return;
    }
    if (this.reconnectListener) {
      socket.off("connect", this.reconnectListener);
    }
    this.reconnectListener = () => {
      // The very first `connect` is the initial connection, not a reconnect.
      if (!this.hasConnectedOnce) {
        this.hasConnectedOnce = true;
        return;
      }
      handler();
    };
    this.hasConnectedOnce = socket.connected;
    socket.on("connect", this.reconnectListener);
  }

  /** GM presence in the joined room changed (spec Open Decision 7). */
  onGmPresence(handler: (payload: { room: string; connected: boolean }) => void) {
    this.socket?.off("session:gm-presence");
    this.socket?.on("session:gm-presence", handler);
  }

  async createSession(): Promise<{ room: string }> {
    const res = await this.emitWithAck<{ ok: boolean; room: string; reason?: string }>("gm:create-session");
    if (!res?.ok || !res?.room) {
      // The server refuses a create when the room-creation rate limit is hit
      // (spec AC 16). Its reason names the wait, which is more use at the table
      // than a flat "unable to create".
      throw new Error(res?.reason || "Unable to create session.");
    }
    this.currentRoom = res.room;
    return { room: res.room };
  }

  async joinAsGm(room: string): Promise<{ state: SharedCombatState | null; log: SharedLogEntry[] }> {
    const res = await this.emitWithAck<{ ok: boolean; reason?: string; state: SharedCombatState | null; log: SharedLogEntry[] }>("gm:join-session", { room });
    if (!res?.ok) {
      throw new Error(res?.reason || "Unable to join GM session.");
    }
    this.currentRoom = room;
    return { state: res.state, log: res.log || [] };
  }

  async joinAsPlayer(room: string, playerName: string): Promise<{ state: SharedCombatState | null; log: SharedLogEntry[]; gmConnected: boolean }> {
    const res = await this.emitWithAck<{ ok: boolean; reason?: string; state: SharedCombatState | null; log: SharedLogEntry[]; gmConnected?: boolean }>("player:join", { room, playerName });
    if (!res?.ok) {
      throw new Error(res?.reason || "Join failed.");
    }
    this.currentRoom = room;
    // Older servers do not report presence; assume connected rather than
    // showing a false "GM not connected" warning.
    return { state: res.state, log: res.log || [], gmConnected: res.gmConnected !== false };
  }

  /**
   * Leave the room. The room and its persisted record survive and can be
   * rejoined by code later (spec Open Decision 3). To destroy it, see
   * `endSession`.
   */
  async closeSession(room: string): Promise<void> {
    const res = await this.emitWithAck<{ ok: boolean; reason?: string }>("gm:close-session", { room });
    if (!res?.ok) {
      throw new Error(res?.reason || "Unable to close GM session.");
    }
  }

  /**
   * Destroy the room: in-memory session and persisted file both go, and the
   * code stops resolving. Destructive and irreversible - the caller is
   * responsible for confirming with the GM first (spec AC 8).
   */
  async endSession(room: string): Promise<void> {
    const res = await this.emitWithAck<{ ok: boolean; reason?: string }>("gm:end-session", { room });
    if (!res?.ok) {
      throw new Error(res?.reason || "Unable to end GM session.");
    }
  }

  broadcastState(state: SharedCombatState) {
    if (!this.currentRoom) return;
    this.socket?.emit("session:update-state", { room: this.currentRoom, state });
  }

  appendLog(entry: SharedLogEntry) {
    if (!this.currentRoom) return;
    // A hidden entry is GM-local by construction (brief p. 330 leaves roll
    // visibility to the table). Refuse to put one on the wire even if a
    // caller passes it here by mistake - the server broadcasts to the whole
    // room, so there is no way to send it to the GM alone.
    if (entry.hiddenFromPlayers) return;
    this.socket?.emit("session:append-log", { room: this.currentRoom, entry });
  }

  sendCommand(command: Omit<SessionCommand, "timestamp">) {
    if (!this.currentRoom) return;
    this.socket?.emit("session:command", {
      room: this.currentRoom,
      command: {
        ...command,
        timestamp: new Date().toISOString()
      }
    });
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.currentRoom = "";
    this.hasConnectedOnce = false;
    this.reconnectListener = null;
  }
}
