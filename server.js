const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: [ "GET", "POST" ]
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

  socket.on("session:update-state", ({ room, state }) => {
    if (!room) return;
    const session = getOrCreateSession(room);
    session.state = state;
    io.to(room).emit("session:state", state);
  });

  socket.on("session:append-log", ({ room, entry }) => {
    if (!room || !entry) return;
    const session = getOrCreateSession(room);
    session.log.push(entry);
    if (session.log.length > 300) {
      session.log.shift();
    }
    io.to(room).emit("session:log-entry", entry);
  });

  socket.on("session:command", ({ room, command }) => {
    if (!room || !command) return;
    io.to(room).emit("session:command", command);
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

  socket.on("gm:close-session", ({ room }, cb) => {
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
