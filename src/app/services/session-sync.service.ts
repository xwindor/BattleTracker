import { Injectable } from "@angular/core";
import { io, Socket } from "socket.io-client";

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
  edgeRating?: number;
  reaction?: number;
  intuition?: number;
}

export interface SharedCombatState {
  round: number;
  pass: number;
  started?: boolean;
  passEnded?: boolean;
  currentInitiative?: number;
  participants: SharedParticipantState[];
}

export interface SharedLogEntry {
  actor: string;
  text: string;
  timestamp: string;
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

  onSessionClosed(handler: (payload: { room: string }) => void) {
    this.socket?.off("session:closed");
    this.socket?.on("session:closed", handler);
  }

  async createSession(): Promise<{ room: string }> {
    const res = await this.emitWithAck<{ ok: boolean; room: string }>("gm:create-session");
    if (!res?.ok || !res?.room) {
      throw new Error("Unable to create session.");
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

  async joinAsPlayer(room: string, playerName: string): Promise<{ state: SharedCombatState | null; log: SharedLogEntry[] }> {
    const res = await this.emitWithAck<{ ok: boolean; reason?: string; state: SharedCombatState | null; log: SharedLogEntry[] }>("player:join", { room, playerName });
    if (!res?.ok) {
      throw new Error(res?.reason || "Join failed.");
    }
    this.currentRoom = room;
    return { state: res.state, log: res.log || [] };
  }

  async closeSession(room: string): Promise<void> {
    const res = await this.emitWithAck<{ ok: boolean; reason?: string }>("gm:close-session", { room });
    if (!res?.ok) {
      throw new Error(res?.reason || "Unable to close GM session.");
    }
  }

  broadcastState(state: SharedCombatState) {
    if (!this.currentRoom) return;
    this.socket?.emit("session:update-state", { room: this.currentRoom, state });
  }

  appendLog(entry: SharedLogEntry) {
    if (!this.currentRoom) return;
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
  }
}
