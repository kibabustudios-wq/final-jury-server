const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

let waitingPlayers = [];
let privateRooms = {};

app.get("/", (req, res) => {
  res.send("Final Jury multiplayer server is running.");
});

app.get("/health", (req, res) => {
  res.json({ ok: true, playersWaiting: waitingPlayers.length });
});

function createRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  socket.on("quick_match", () => {
    if (waitingPlayers.length > 0) {
      const opponent = waitingPlayers.shift();
      const roomId = `match_${socket.id}_${opponent.id}`;

      socket.join(roomId);
      opponent.join(roomId);

      io.to(roomId).emit("match_found", {
        roomId,
        players: [socket.id, opponent.id]
      });
    } else {
      waitingPlayers.push(socket);
      socket.emit("waiting_for_match");
    }
  });

  socket.on("create_private_room", () => {
    const roomCode = createRoomCode();

    privateRooms[roomCode] = {
      host: socket.id,
      players: [socket.id]
    };

    socket.join(roomCode);

    socket.emit("private_room_created", {
      roomCode
    });
  });

  socket.on("join_private_room", (roomCode) => {
    roomCode = String(roomCode || "").toUpperCase();

    if (!privateRooms[roomCode]) {
      socket.emit("private_room_error", {
        message: "Room not found"
      });
      return;
    }

    privateRooms[roomCode].players.push(socket.id);
    socket.join(roomCode);

    io.to(roomCode).emit("private_room_updated", {
      roomCode,
      players: privateRooms[roomCode].players
    });
  });

  socket.on("player_ready", (data) => {
    const roomId = data && data.roomId;
    if (roomId) {
      socket.to(roomId).emit("opponent_ready", {
        playerId: socket.id
      });
    }
  });

  socket.on("start_match", (data) => {
    const roomId = data && data.roomId;
    if (roomId) {
      io.to(roomId).emit("match_started", {
        roomId
      });
    }
  });

  socket.on("game_state", (data) => {
    const roomId = data && data.roomId;
    if (roomId) {
      socket.to(roomId).emit("game_state", data);
    }
  });

  socket.on("player_action", (data) => {
    const roomId = data && data.roomId;
    if (roomId) {
      socket.to(roomId).emit("player_action", data);
    }
  });

  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);

    waitingPlayers = waitingPlayers.filter((player) => player.id !== socket.id);

    for (const roomCode of Object.keys(privateRooms)) {
      privateRooms[roomCode].players = privateRooms[roomCode].players.filter(
        (playerId) => playerId !== socket.id
      );

      if (privateRooms[roomCode].players.length === 0) {
        delete privateRooms[roomCode];
      } else {
        io.to(roomCode).emit("private_room_updated", {
          roomCode,
          players: privateRooms[roomCode].players
        });
      }
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Final Jury server listening on port ${PORT}`);
});
