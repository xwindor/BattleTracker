const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

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
// GM → Players: request_rolls, clear_roll_prompt, combat_ended, dice_roll
const ALLOWED_COMMAND_TYPES = new Set([
  "register_character",
  "configure_deck",
  "claim_character",
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

function createRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function getOrCreateSession(room) {
  if (!sessions.has(room)) {
    sessions.set(room, {
      state: null,
      log: []
    });
  }
  return sessions.get(room);
}

io.on("connection", (socket) => {
  // ── Auth handlers (no role guard — these assign the role) ─────────────────

  socket.on("gm:create-session", (cb) => {
    let room = createRoomCode();
    while (sessions.has(room)) {
      room = createRoomCode();
    }
    const session = getOrCreateSession(room);
    socket.join(room);
    socket.data.role = "gm";
    socket.data.room = room;
    if (typeof cb === "function") {
      cb({ room, ok: true, state: session.state, log: session.log });
    }
  });

  socket.on("gm:join-session", ({ room }, cb) => {
    const session = sessions.get(room);
    if (!session) {
      if (typeof cb === "function") cb({ ok: false, reason: "Room not found" });
      return;
    }
    socket.join(room);
    socket.data.role = "gm";
    socket.data.room = room;
    if (typeof cb === "function") cb({ ok: true, state: session.state, log: session.log });
  });

  socket.on("player:join", ({ room, playerName }, cb) => {
    const session = sessions.get(room);
    if (!session) {
      if (typeof cb === "function") cb({ ok: false, reason: "Room not found" });
      return;
    }
    socket.join(room);
    socket.data.role = "player";
    socket.data.room = room;
    socket.data.playerName = playerName;
    if (typeof cb === "function") {
      cb({ ok: true, state: session.state, log: session.log, playerName });
    }
  });

  // ── Guarded handlers ──────────────────────────────────────────────────────

  socket.on("session:update-state", ({ room, state }) => {
    // Role: GM only.
    if (socket.data.role !== "gm") {
      reject(socket, "session:update-state", "role-required: gm");
      return;
    }
    // Schema.
    if (!isRoomCode(room)) {
      reject(socket, "session:update-state", "invalid-room-code");
      return;
    }
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
    io.to(room).emit("session:state", state);
  });

  socket.on("session:append-log", ({ room, entry }) => {
    // Role: GM or authenticated player.
    const role = socket.data.role;
    if (role !== "gm" && role !== "player") {
      reject(socket, "session:append-log", "role-required: gm or player");
      return;
    }
    // Schema.
    if (!isRoomCode(room)) {
      reject(socket, "session:append-log", "invalid-room-code");
      return;
    }
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
    io.to(room).emit("session:log-entry", entry);
  });

  socket.on("session:command", ({ room, command }) => {
    const role = socket.data.role;
    // Role: GM or authenticated player.
    if (role !== "gm" && role !== "player") {
      reject(socket, "session:command", "role-required: gm or player");
      return;
    }
    // Schema.
    if (!isRoomCode(room)) {
      reject(socket, "session:command", "invalid-room-code");
      return;
    }
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

  socket.on("gm:close-session", ({ room }, cb) => {
    // Role: GM only, and must own this room.
    if (socket.data.role !== "gm") {
      reject(socket, "gm:close-session", "role-required: gm");
      if (typeof cb === "function") cb({ ok: false, reason: "role-required: gm" });
      return;
    }
    if (socket.data.room !== room) {
      reject(socket, "gm:close-session", "room-mismatch");
      if (typeof cb === "function") cb({ ok: false, reason: "room-mismatch" });
      return;
    }
    // Schema.
    if (!isRoomCode(room)) {
      reject(socket, "gm:close-session", "invalid-room-code");
      if (typeof cb === "function") cb({ ok: false, reason: "invalid-room-code" });
      return;
    }
    // Happy path (unchanged).
    if (!room || !sessions.has(room)) {
      if (typeof cb === "function") cb({ ok: false, reason: "Room not found" });
      return;
    }
    if (typeof cb === "function") {
      cb({ ok: true });
    }
    io.to(room).emit("session:closed", { room });
    io.in(room).socketsLeave(room);
    sessions.delete(room);
  });

  // ── Disconnect (server-generated — no role guard needed) ──────────────────

  socket.on("disconnect", () => {
    if (socket.data.role !== "player") {
      return;
    }
    const room = socket.data.room;
    const playerName = socket.data.playerName;
    if (!room || !playerName) {
      return;
    }
    const session = sessions.get(room);
    if (!session?.state?.participants?.length) {
      return;
    }

    let changed = false;
    session.state.participants = session.state.participants.map((participant) => {
      if (participant.claimable === true && participant.ownerName === playerName) {
        changed = true;
        return {
          ...participant,
          ownerName: undefined
        };
      }
      return participant;
    });

    if (changed) {
      io.to(room).emit("session:state", session.state);
      io.to(room).emit("session:command", {
        type: "release_claims",
        player: playerName,
        payload: {},
        timestamp: new Date().toISOString()
      });
    }
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

const port = Number(process.env.PORT || 3001);
server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`BattleTracker session server listening on ${port}`);
});
