import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { TICK_INTERVAL, SNAPSHOT_RATE, TICK_RATE } from '../shared/constants.js';
import { createRoom, getRoom, addPlayerToRoom, removePlayerFromRoom, playerReady,
         allReady, updateHeartbeat, checkTimeouts, roomToInfo } from './room.js';
import { createGameState, updateGameState, processInput } from './gameState.js';
import { encodeSnapshot, decodeInput } from './sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const __root = join(__dirname, '..');
const publicDir = join(__root, 'public');
const sharedDir = join(__root, 'shared');

const app = express();
app.use(express.static(publicDir));
app.use('/shared', express.static(sharedDir));

const server = createServer(app);
const wss = new WebSocketServer({ server });

// Active connections: ws → { playerId, roomId }
const connections = new Map();
let nextPlayerId = 1;

// Game tick loop
const gameRooms = new Set(); // rooms currently in 'countdown' or 'playing' state

setInterval(() => {
  for (const roomId of gameRooms) {
    const room = getRoom(roomId);
    if (!room) {
      gameRooms.delete(roomId);
      continue;
    }
    if (room.gameState === 'waiting' || room.gameState === 'gameover') continue;

    checkTimeouts(room);

    updateGameState(room);

    // Broadcast snapshot
    if (room.serverTick % Math.round(TICK_RATE / SNAPSHOT_RATE) === 0) {
      const snapshot = encodeSnapshot(room);
      broadcast(room, snapshot);
    }

    if (room.gameState === 'gameover') {
      gameRooms.delete(roomId);
      // Send final snapshot
      const finalSnapshot = encodeSnapshot(room);
      broadcast(room, finalSnapshot);
    }
  }
}, TICK_INTERVAL);

// Heartbeat check
setInterval(() => {
  for (const [ws, info] of connections) {
    const room = getRoom(info.roomId);
    if (!room) continue;
    const player = room.players.get(info.playerId);
    if (player && !player.connected) {
      // Player timed out — mark disconnected
      sendMessage(ws, { type: 'disconnected', reason: 'timeout' });
    }
  }
}, 5000);

wss.on('connection', (ws) => {
  const playerId = 'P' + nextPlayerId++;
  connections.set(ws, { playerId, roomId: null });

  // Send initial connection ack
  sendMessage(ws, { type: 'connected', playerId });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (e) {
      return;
    }
    handleMessage(ws, playerId, msg);
  });

  ws.on('close', () => {
    const info = connections.get(ws);
    if (info && info.roomId) {
      const room = getRoom(info.roomId);
      if (room) {
        const player = room.players.get(info.playerId);
        if (player && player.ws === ws) {
          player.connected = false;
        }
        broadcastRoomState(room);
      }
    }
    connections.delete(ws);
  });

  ws.on('error', () => {});
});

function handleMessage(ws, playerId, msg) {
  const info = connections.get(ws);

  switch (msg.type) {
    case 'create_room': {
      const room = createRoom();
      addPlayerToRoom(room, playerId, ws);
      info.roomId = room.id;
      sendMessage(ws, { type: 'room_created', room: roomToInfo(room) });
      break;
    }

    case 'join_room': {
      const room = getRoom(msg.roomId);
      if (!room) {
        sendMessage(ws, { type: 'error', message: 'Room not found' });
        return;
      }
      if (!addPlayerToRoom(room, playerId, ws)) {
        sendMessage(ws, { type: 'error', message: 'Room is full' });
        return;
      }
      info.roomId = room.id;
      sendMessage(ws, { type: 'room_joined', room: roomToInfo(room) });
      broadcastRoomState(room);

      // If both players are here, ask for ready
      if (room.players.size === 2) {
        broadcast(room, { type: 'players_present', room: roomToInfo(room) });
      }
      break;
    }

    case 'ready': {
      if (!info.roomId) return;
      const room = getRoom(info.roomId);
      if (!room) return;
      playerReady(room, playerId);
      broadcastRoomState(room);

      if (allReady(room)) {
        createGameState(room);
        gameRooms.add(room.id);
        broadcast(room, { type: 'game_starting', room: roomToInfo(room) });
      }
      break;
    }

    case 'input': {
      if (!info.roomId) return;
      const room = getRoom(info.roomId);
      if (!room || room.gameState !== 'playing') return;
      updateHeartbeat(room, playerId);
      const input = decodeInput(msg);
      processInput(room, playerId, input);
      break;
    }

    case 'ping': {
      const room = getRoom(info.roomId);
      if (room) {
        updateHeartbeat(room, playerId);
      }
      sendMessage(ws, { type: 'pong', time: msg.time, serverTime: Date.now() });
      break;
    }

    case 'play_again': {
      if (!info.roomId) return;
      const room = getRoom(info.roomId);
      if (!room || room.gameState !== 'gameover') return;
      playerReady(room, playerId);
      broadcastRoomState(room);

      if (allReady(room)) {
        createGameState(room);
        gameRooms.add(room.id);
        broadcast(room, { type: 'game_starting', room: roomToInfo(room) });
      }
      break;
    }


    case 'rejoin_room': {
      if (!msg.roomId || !msg.playerId) return;
      const rejoinRoom = getRoom(msg.roomId);
      if (!rejoinRoom) {
        sendMessage(ws, { type: 'error', message: 'Room not found' });
        return;
      }
      const rejoinPlayer = rejoinRoom.players.get(msg.playerId);
      if (!rejoinPlayer) {
        sendMessage(ws, { type: 'error', message: 'Player not in room' });
        return;
      }
      rejoinPlayer.ws = ws;
      rejoinPlayer.connected = true;
      rejoinPlayer.lastHeartbeat = Date.now();
      connections.set(ws, { playerId: msg.playerId, roomId: rejoinRoom.id });
      sendMessage(ws, { type: 'room_joined', room: roomToInfo(rejoinRoom), rejoined: true });
      broadcastRoomState(rejoinRoom);
      break;
    }

    case 'leave_room': {
      if (!info.roomId) return;
      const room = getRoom(info.roomId);
      if (room) {
        removePlayerFromRoom(room, playerId);
        broadcastRoomState(room);
      }
      info.roomId = null;
      sendMessage(ws, { type: 'left_room' });
      break;
    }

    default:
      break;
  }
}

function broadcast(room, msg) {
  for (const [, player] of room.players) {
    if (player.connected && player.ws.readyState === 1) {
      sendMessage(player.ws, msg);
    }
  }
}

function broadcastRoomState(room) {
  broadcast(room, { type: 'room_state', room: roomToInfo(room) });
}

function sendMessage(ws, msg) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(msg));
  }
}

const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Tank War server running on port ${PORT}`);
});
