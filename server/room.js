import { HEARTBEAT_TIMEOUT } from '../shared/constants.js';

const rooms = new Map();
let nextRoomId = 1000;

export function createRoom() {
  const id = String(nextRoomId++);
  const room = {
    id,
    players: new Map(),
    gameState: 'waiting', // waiting | countdown | playing | gameover
    createdAt: Date.now(),
    lastActivity: Date.now(),
  };
  rooms.set(id, room);
  return room;
}

export function getRoom(id) {
  return rooms.get(id);
}

export function deleteRoom(id) {
  rooms.delete(id);
}

export function getAllRooms() {
  return [...rooms.values()];
}

export function addPlayerToRoom(room, playerId, ws) {
  if (!room) return false;
  if (room.players.size >= 2) return false;
  room.players.set(playerId, {
    id: playerId,
    ws,
    connected: true,
    lastHeartbeat: Date.now(),
    ready: false,
  });
  room.lastActivity = Date.now();
  return true;
}

export function removePlayerFromRoom(room, playerId) {
  if (!room) return;
  room.players.delete(playerId);
  room.lastActivity = Date.now();
  if (room.players.size === 0) {
    deleteRoom(room.id);
  }
}

export function playerReady(room, playerId) {
  if (!room) return false;
  const player = room.players.get(playerId);
  if (!player) return false;
  player.ready = true;
  return true;
}

export function allReady(room) {
  if (!room) return false;
  if (room.players.size < 2) return false;
  for (const [, p] of room.players) {
    if (!p.ready) return false;
  }
  return true;
}

export function updateHeartbeat(room, playerId) {
  if (!room) return;
  const player = room.players.get(playerId);
  if (player) {
    player.lastHeartbeat = Date.now();
  }
}

export function checkTimeouts(room) {
  if (!room) return;
  const now = Date.now();
  for (const [id, player] of room.players) {
    if (now - player.lastHeartbeat > HEARTBEAT_TIMEOUT) {
      player.connected = false;
    }
  }
}

export function roomToInfo(room) {
  if (!room) return { id: null, players: [], gameState: 'unknown' };
  const players = [];
  for (const [id, p] of room.players) {
    players.push({
      id,
      connected: p.connected,
      ready: p.ready,
      score: p.score || 0,
      lives: p.lives !== undefined ? p.lives : 3,
    });
  }
  return {
    id: room.id,
    players,
    gameState: room.gameState,
  };
}
