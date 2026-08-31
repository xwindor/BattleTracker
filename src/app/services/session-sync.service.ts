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
  // `hasActed` (GruntMember.hasActed, brief "GM reconnect state loss" D2,
  // reversing NPC-group Decision 18) is deliberately NOT here. This type is
  // shared verbatim by `SharedParticipantState.rowMembers` - which reaches
  // every player socket (`session:update-state`) - so a per-member Act
  // marker riding it would break the brief's own promise that
  // `SharedParticipantState` gains no new field reachable by a player
  // (review defect D5, fix round 2026-08-19). It instead rides
  // `SharedGmParticipantState.rowMemberHasActed`, GM-only and index-aligned
  // with this same `rowMembers` array - see that field's doc comment.
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
  /**
   * Out of action (downed). Absent/false for the ordinary case.
   *
   * A participant is normally withheld from `participants` entirely while
   * `ooc` (see `getSharedParticipants()`), so this field is only ever `true`
   * for the one exception: a **claimable** out-of-action participant - i.e. a
   * player character - which is deliberately still put on the wire so its
   * owner can see and reclaim it (GM decision, durable-rooms follow-up; see
   * `ARCHITECTURE.md` §7 "OOC participants and the wire"). A downed non-player
   * participant never appears in `participants` at all, `ooc` field or not -
   * this flag does not change that privacy property, it only lets the one
   * exception be told apart from an active participant once it is on the
   * wire. Consumers must gate any action affordance (`canAct`/`canDelay`/
   * `canInterrupt`) off `ooc` explicitly - a claimable downed character must
   * stay claimable without becoming playable.
   */
  ooc?: boolean;
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

/** One entry of `SharedCombatState.oocOwnership` - see its doc comment. */
export interface SharedOocOwnershipState {
  id: string;
  ownerName?: string;
  claimable?: boolean;
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
   * (spec Open Decision 4 - restoring them is a known, accepted gap) **unless
   * a participant is claimable** (GM decision, durable-rooms follow-up: a
   * player must be able to reclaim their own downed character - see
   * `ARCHITECTURE.md` §7). So this count is specifically the OOC participants
   * still withheld - non-claimable ones, almost always NPCs - not every OOC
   * participant the encounter holds; a claimable OOC participant is counted
   * by `participants.length` instead, same as any other. Either way an
   * encounter where everybody is out of action and nobody is claimable still
   * serialises as `participants: []`, indistinguishable on the wire from a
   * room that never had an encounter at all, which is what this field exists
   * to disambiguate. A GM joining that code was therefore never warned, and
   * the join's empty-snapshot branch pushed local state over a real saved
   * fight (round-3 fix 5).
   *
   * Persistence/overwrite-guard use only. Nothing renders it, and no
   * "active participants" logic reads it - those exclusions of (non-claimable)
   * OOC are deliberate and unchanged.
   */
  oocParticipantCount?: number;

  /**
   * Ownership-only shadow list for OOC participants (review defect D2,
   * durable-rooms review round 6).
   *
   * A **claimable** OOC participant is now also present in `participants`
   * directly, with its own `ownerName`/`claimable`/`ooc` (GM decision,
   * durable-rooms follow-up), which makes this shadow redundant for that
   * case - `reconcileOwnershipFromServer()` finds the same information in
   * `participants` first and never needs to fall back here for it. This list
   * is still populated and still needed for the one case that overlap does
   * not cover: an OOC participant whose `participantOwners` entry has
   * outlived its `claimable` flag (e.g. a GM authoring decision changes it,
   * or wire data from before this flag existed) - `ownerName` set without
   * `claimable` true means it is withheld from `participants` (claimable-or-
   * nothing is the wire-visibility rule) but still needs reconciling so a
   * stale local owner does not survive a rejoin. See the `getSharedParticipants`/
   * `syncSharedState`/`oocOwnership` predicate in `battle-tracker.component.ts`
   * (one shared helper, both call sites) - it is intentionally broader than
   * "claimable" alone for exactly this reason.
   *
   * Deliberately minimal, unlike `SharedParticipantState`: only `id` and
   * `ownerName`/`claimable`, never health, damage or any other OOC
   * participant state. The fuller per-participant shape stays withheld from
   * non-claimable OOC participants on purpose - widening *that* would worsen
   * the leak `docs/FEATURE-BACKLOG.md` already records (`getSharedParticipants`
   * leaks state to players regardless of the GM's roll-visibility toggle;
   * spec Open Decision 4 explicitly weighed and rejected extending the full
   * broadcast to non-claimable OOC participants for this reason - claimable
   * ones are the deliberate, later exception). An owner name is not
   * meaningfully more sensitive than the count already broadcast, and the
   * server does not currently attempt to hide "who owns which participant"
   * from other players in any other case.
   */
  oocOwnership?: SharedOocOwnershipState[];

  // Matrix extensions (Phase 4 wires broadcasting; defined here so the
  // shared types are stable from Phase 1 onward).
  matrixTargets?: SharedMatrixTarget[];
  currentHostName?: string;
}

/**
 * One committed Interrupt Action, flattened for the wire. Mirrors
 * `Interfaces/Action`. GM-only (`SharedGmParticipantState.actionHistory`) -
 * never appears on `SharedParticipantState`.
 */
export interface SharedActionState {
  key: string;
  iniMod: number;
  persist?: boolean;
  martialArt?: boolean;
  edge?: boolean;
}

/**
 * GM-only per-participant rehydration data, keyed to a participant by `id`.
 *
 * Everything here is state the tracker already computes and already displays
 * to the GM - none of it is new information, only a new (GM-only) transport
 * for it. Carried on `session:update-gm-state`/`SharedGmState`, never on
 * `SharedCombatState`/`SharedParticipantState`, so there is no code path from
 * any of these fields to a player socket (brief "GM reconnect state loss",
 * "Proposed approach" - an allowlist by construction, not a denylist strip).
 *
 * `ICParticipant` reconstruction is explicitly out of scope (brief Decision
 * D5): no `isIC`/`icType`/`hostRating`/`linkedTargetId` here. An IC still
 * restores as a plain `MatrixParticipant`, a known, accepted gap.
 */
export interface SharedGmParticipantState {
  id: string;

  /**
   * This participant's index in the **full**, unfiltered
   * `combatManager.participants.items` roster at the moment this snapshot was
   * built - i.e. the same index `buildGmState()` uses for a withheld entry's
   * `order` on `withheldParticipants`.
   *
   * Fix round 2026-08-19 (review defect D1): `state.participants[].order` is
   * numbered on the **post-filter** scale (`getSharedParticipants()`'s own
   * index, unchanged, player-facing) while `gmState.withheldParticipants[].order`
   * is numbered on the **full-roster** scale - two different rulers. Sorting
   * both lists together by `order` directly, as the merge in
   * `restoreFromSharedState()` used to, collided: a withheld participant
   * sitting above a live one could land on the exact same `sortOrder` as that
   * live one. `rosterIndex` is a single, authoritative ruler carried once per
   * participant (present or withheld) on this GM-only side, so the merge
   * ranks every entry on it instead whenever a `gmState` is present - falling
   * back to `order` only for a legacy/deploy-skew restore with no `gmState`
   * at all, where every surviving entry is on the same (post-filter) scale
   * anyway and there is nothing to reconcile.
   */
  rosterIndex: number;

  // Condition Monitor shape and contents.
  physicalHealth: number;
  stunHealth: number;
  overflowHealth: number;
  physicalDamage: number;
  stunDamage: number;
  painTolerance: number;
  hasPainEditor: boolean;

  // Score bookkeeping, restored verbatim rather than re-derived.
  /** RAW backing field - NOT `getCurrentInitiative()`. */
  baseIni: number;
  currentInitiativeScore: number;
  appliedInitiativeAttribute: number;

  // Turn state.
  /** Numeric `StatusEnum`. */
  status: number;
  edge: boolean;
  actionHistory: SharedActionState[];
  /** The MANUAL out-of-combat flag only (`Participant.manualOoc`), not the derived getter. */
  ooc: boolean;
  tieBreaker: number;

  // DetachedGruntParticipant (standalone or detached grunt), set only when
  // `hasGruntConditionMonitor(p)`.
  isGrunt?: boolean;
  gruntBody?: number;
  gruntWillpower?: number;
  lastDamageType?: "physical" | "stun" | null;
  lastDamageValue?: number;

  // NpcRowParticipant extras not already carried by `SharedParticipantState.rowMembers`.
  /** Set only when `isNpcRow(p)`. */
  rowSpentFlagged?: boolean;
  /**
   * Each row member's `hasActed` (GruntMember.hasActed, brief "GM reconnect
   * state loss" D2), index-aligned with the same row's
   * `SharedParticipantState.rowMembers` array. Set only when `isNpcRow(p)`.
   *
   * Lives here, GM-only, rather than on `rowMembers[].hasActed` itself (fix
   * round 2026-08-19, review defect D5): `rowMembers` is part of
   * `SharedParticipantState`, which reaches every player socket, and the
   * brief promises that type gains no new field a player can see.
   */
  rowMemberHasActed?: boolean[];

  // Statblock imprint (brief "Grunt naming and statblocks", GM-only per U2 -
  // never on `SharedParticipantState`). Set only for a participant
  // instantiated from a sample grunt/lieutenant template.
  /**
   * `GruntStatblock.id`, e.g. `"pr5-grunt"`. The single source of truth for
   * this participant's template identity (Decision D-X4, "GM-only
   * identification so the GM can see what a participant was created from") -
   * `label` and `professionalRating` are re-derived from it on demand
   * (`getParticipantStatblockLabel()`, `getStatblockById(statblockId)`)
   * rather than sent as their own wire fields. (Item 8 fix, fix round 3: this
   * interface used to also declare `professionalRating`/`label` fields that
   * `buildGmParticipantState()` actually populated - contradicting its own
   * doc comment, which already claimed they weren't sent - and that had no
   * reader anywhere in `src/` on either side. Removed rather than kept and
   * wired up: `statblockId` alone is smaller on the wire and leaves no second
   * copy of the template identity to drift from `GruntStatblock` itself.)
   */
  statblockId?: string;
  /** Was this template loaded with its augmented (bracketed) values (U4)? */
  statblockAugmented?: boolean;
  /**
   * U7 (p. 381): the id (`getParticipantId`) of the row this lieutenant beats
   * on an Initiative tie with his own team, without consulting ERIC. GM-only -
   * a player has no use for it and it is presentation of the same class the
   * rest of this interface already withholds.
   */
  lieutenantTeamRowId?: string;

  /**
   * `AstralParticipant.projectionDiceGain` (item 7, fix round 3): how many
   * Initiative Dice this participant actually gained on the way into astral
   * space (0-2 with the 2026-08-30 ruling's delta of 2, less if the 5D6 hard
   * cap absorbed part of the gain, pp. 52/288). GM-only, restated here rather
   * than re-derived, for the same reason `baseIni`/`currentInitiativeScore`
   * are: it is a fact about *how this Score got here*, not something the
   * current state can reconstruct after the fact. Set only when
   * `p instanceof AstralParticipant`.
   *
   * Without this, a GM reconnect while a mage is projecting silently strands
   * the gained dice forever: `restoreFromSharedState()` used to rebuild the
   * `AstralParticipant` with `projectionDiceGain` defaulted to 0, so "Return
   * to Body" computed a return delta of `0 - 0` and requested no change - the
   * mage kept the extra dice and the inflated Score for the rest of the fight
   * (pre-existing defect, doubled in visibility by RULINGS 2026-08-30 raising
   * the stakes from one stranded die to two).
   */
  astralProjectionDiceGain?: number;
}

/**
 * The GM-only half of a room snapshot (brief "GM reconnect state loss").
 * Transported on its own channel (`session:update-gm-state`), stored as
 * `session.gmState` server-side, and returned only in the `gm:join-session`
 * ack - never broadcast to a room, never sent in a `player:join` ack. See
 * `ARCHITECTURE.md` §7, "The GM-only channel".
 */
export interface SharedGmState {
  version: 1;
  /**
   * Participants `getSharedParticipants()` withholds as out-of-action and
   * non-claimable. Same type as the player-facing entries on purpose: one
   * participant shape, no second format to drift.
   */
  withheldParticipants: SharedParticipantState[];
  /** One entry per participant currently in the encounter, withheld or not. */
  participants: SharedGmParticipantState[];
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

  async joinAsGm(room: string): Promise<{ state: SharedCombatState | null; log: SharedLogEntry[]; gmState?: SharedGmState | null }> {
    const res = await this.emitWithAck<{
      ok: boolean; reason?: string; state: SharedCombatState | null; log: SharedLogEntry[];
      /** Absent on an old server that predates this channel (deploy skew) - defaults to null, same as never having one. */
      gmState?: SharedGmState | null;
    }>("gm:join-session", { room });
    if (!res?.ok) {
      throw new Error(res?.reason || "Unable to join GM session.");
    }
    this.currentRoom = room;
    return { state: res.state, log: res.log || [], gmState: res.gmState ?? null };
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

  /**
   * Push the GM-only half of the room snapshot. Write-only from this client's
   * point of view - there is no broadcast back, and no player-reachable event
   * ever carries it (brief "GM reconnect state loss"). An old server with no
   * listener for this event simply drops it (Socket.IO default), which is the
   * intended deploy-skew degradation: the GM falls back to today's lossy pull,
   * never a leak.
   */
  broadcastGmState(gmState: SharedGmState) {
    if (!this.currentRoom) return;
    this.socket?.emit("session:update-gm-state", { room: this.currentRoom, gmState });
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
