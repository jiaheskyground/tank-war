import { NetworkClient } from './network.js';
import { DIR, TILE_SIZE, CANVAS_W, CANVAS_H, TANK_SIZE, BULLET_SIZE } from '/shared/constants.js';
import {
  initAudio, sfxFire, sfxHit, sfxExplode, sfxDestroy,
  clearCanvas, applyShake, clearShake,
  drawMap, drawGrass, drawTank, drawBullet, drawParticles, drawShield,
  spawnExplosion, spawnBrickChunks, updateParticles,
  ctx, canvas,
} from './renderer.js';
import { createMap, getTile } from '/shared/Map.js';
import { inputManager } from './input-manager.js';

// Online game state
let network = null;
let playerId = null;
let gameState = 'idle'; // idle | connecting | lobby | countdown | playing | gameover
let roomInfo = null;
let map = null;
let players = {};   // id → { x, y, dir, alive, invincible, lives, score, moving }
let bullets = [];
let particles = [];
let shakeTimer = 0;
let animFrameId = null;
let snapshotBuffer = [];
let remoteTargets = {}; // For interpolation

// Score tracking
let myScore = 0;
let myLives = 3;

export function startOnline(wsUrl) {
  gameState = 'connecting';
  network = new NetworkClient(wsUrl);
  bullets = [];
  particles = [];
  players = {};
  remoteTargets = {};
  snapshotBuffer = [];
  shakeTimer = 0;
  myScore = 0;
  myLives = 3;

  network.on('connected', (msg) => {
    playerId = msg.playerId;
  });

  network.on('room_created', (msg) => {
    roomInfo = msg.room;
    gameState = 'lobby';
    updateOnlineHUD();
    showRoomScreen(msg.room);
  });

  network.on('room_joined', (msg) => {
    roomInfo = msg.room;
    gameState = 'lobby';
    updateOnlineHUD();
    if (msg.rejoined && (msg.room.gameState === 'playing' || msg.room.gameState === 'countdown')) {
      hideAllOnlineUI();
      map = createMap();
      initAudio();
      startOnlineGameLoop();
    } else {
      showRoomScreen(msg.room);
    }
  });

  network.on('room_state', (msg) => {
    roomInfo = msg.room;
    updateRoomScreen(msg.room);
  });

  network.on('players_present', (msg) => {
    roomInfo = msg.room;
    showReadyButton();
  });

  network.on('game_starting', (msg) => {
    roomInfo = msg.room;
    gameState = 'countdown';
    map = createMap();
    initAudio();
    startOnlineGameLoop();
  });

  network.on('game_started', () => {
    gameState = 'playing';
  });

  network.on('snapshot', (msg) => {
    processSnapshot(msg);
  });

  network.on('disconnected', (msg) => {
    if (gameState !== 'gameover') {
      showDisconnected(msg.reason);
    }
  });

  network.on('error', (msg) => {
    showError(msg.message);
  });

  network.on('left_room', () => {
    gameState = 'idle';
    roomInfo = null;
    stopOnlineGameLoop();
    showMainMenu();
  });

  network.on('reconnecting', (msg) => {
    showReconnecting(msg.attempt);
  });

  setupVisibilityHandler();

  return network.connect();
}

export function createRoom() {
  network.send({ type: 'create_room' });
}

export function joinRoom(roomId) {
  network.send({ type: 'join_room', roomId });
}

export function markReady() {
  network.send({ type: 'ready' });
}

export function playAgain() {
  network.send({ type: 'play_again' });
}

export function leaveRoom() {
  network.send({ type: 'leave_room' });
}

export function disconnect() {
  teardownVisibilityHandler();
  if (network) network.disconnect();
  stopOnlineGameLoop();
}

function startOnlineGameLoop() {
  if (animFrameId) cancelAnimationFrame(animFrameId);
  onlineGameLoop();
}

function stopOnlineGameLoop() {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
}

function onlineGameLoop() {
  processInput();
  updateParticles(particles);
  interpolateRemotePlayers();
  renderOnline();
  animFrameId = requestAnimationFrame(onlineGameLoop);
}

function processInput() {
  if (gameState !== 'playing' && gameState !== 'countdown') return;
  if (!network || !network.connected) return;

  const input = inputManager.getInput();

  let dx = 0, dy = 0;
  let newDir = null;

  if (input.up)    { dy = -2.5; newDir = DIR.UP; }
  else if (input.down)  { dy = 2.5; newDir = DIR.DOWN; }
  else if (input.left)  { dx = -2.5; newDir = DIR.LEFT; }
  else if (input.right) { dx = 2.5; newDir = DIR.RIGHT; }

  network.sendInput(dx, dy, newDir, input.fire);
}

function processSnapshot(msg) {
  if (msg.gameState === 'gameover') {
    gameState = 'gameover';
    const winner = msg.winner;
    const amWinner = winner === playerId;
    showOnlineGameOver(amWinner, msg);
    return;
  }

  if (msg.gameState === 'countdown') {
    gameState = 'countdown';
    showCountdown(Math.ceil((msg.countdown || 0) / 20));
  } else if (msg.gameState === 'playing') {
    gameState = 'playing';
    hideCountdown();
  }

  // Update players
  for (const p of msg.players) {
    if (p.id === playerId) {
      myScore = p.score;
      myLives = p.lives;
    }

    if (!players[p.id]) {
      players[p.id] = {};
      remoteTargets[p.id] = {};
    }

    // Store remote target for interpolation
    if (p.id !== playerId) {
      remoteTargets[p.id] = {
        x: p.x,
        y: p.y,
        dir: p.dir,
        alive: p.alive,
        invincible: p.invincible,
        lives: p.lives,
        score: p.score,
        moving: p.moving,
        time: Date.now(),
      };
    } else {
      // Server-authoritative position for us
      players[p.id].x = p.x;
      players[p.id].y = p.y;
      players[p.id].dir = p.dir;
      players[p.id].alive = p.alive;
      players[p.id].invincible = p.invincible;
      players[p.id].moving = p.moving;
    }
  }

  // Update bullets
  bullets = msg.bullets.map(b => ({
    x: b.x,
    y: b.y,
    dir: b.dir,
    ownerId: b.ownerId,
    active: b.active,
  }));

  // Process map changes
  for (const mc of msg.mapChanges || []) {
    if (map) map[mc.row][mc.col] = mc.tile;
    spawnBrickChunks(particles, mc.col * TILE_SIZE + TILE_SIZE / 2, mc.row * TILE_SIZE + TILE_SIZE / 2);
    sfxDestroy();
  }

  // Process particles
  for (const p of msg.particles || []) {
    if (p.type === 'explosion') {
      spawnExplosion(particles, p.x, p.y, p.color || '#f44');
      sfxExplode();
      shakeTimer = 18;
    } else if (p.type === 'spark') {
      spawnExplosion(particles, p.x, p.y, '#ff0');
      sfxHit();
    } else if (p.type === 'brick') {
      spawnBrickChunks(particles, p.x, p.y);
      sfxDestroy();
    }
  }

  updateOnlineHUD();
}

function interpolateRemotePlayers() {
  for (const id in remoteTargets) {
    if (id === playerId) continue;
    const target = remoteTargets[id];
    if (!players[id]) {
      players[id] = {};
    }
    const current = players[id];

    // Lerp towards target
    const lerp = 0.3;
    if (current.x !== undefined) {
      current.x += (target.x - current.x) * lerp;
      current.y += (target.y - current.y) * lerp;
    } else {
      current.x = target.x;
      current.y = target.y;
    }
    current.dir = target.dir;
    current.alive = target.alive;
    current.invincible = target.invincible;
    current.moving = target.moving;
  }
}

function renderOnline() {
  clearCanvas();
  applyShake(shakeTimer);
  if (shakeTimer > 0) shakeTimer--;

  if (map) drawMap(map);

  // Draw players
  for (const id in players) {
    const p = players[id];
    if (!p.alive) continue;
    const color = id === playerId ? '#4a4' : '#e44';
    drawTank(p.x, p.y, p.dir, color, p.invincible > 0);
  }

  // Draw bullets
  for (const b of bullets) {
    if (!b.active) continue;
    const isPlayerBullet = b.ownerId === playerId;
    drawBullet(b.x, b.y, b.dir, isPlayerBullet);
  }

  drawParticles(particles);

  if (map) drawGrass(map);

  clearShake(shakeTimer);

  // Shields
  for (const id in players) {
    const p = players[id];
    if (p.alive && p.invincible > 0) {
      drawShield(p.x, p.y);
    }
  }
}

function updateOnlineHUD() {
  const scoreEl = document.getElementById('score-display');
  const livesEl = document.getElementById('lives-display');
  const enemiesEl = document.getElementById('enemies-display');
  if (scoreEl) scoreEl.textContent = myScore;
  if (livesEl) livesEl.textContent = myLives;
  if (enemiesEl) {
    let oppLives = 0;
    for (const id in remoteTargets) {
      if (id !== playerId) oppLives = remoteTargets[id].lives || 0;
    }
    enemiesEl.textContent = oppLives;
  }
  const enemiesLabel = document.getElementById('enemies-label');
  if (enemiesLabel) enemiesLabel.textContent = 'OPPONENT';
}

// UI helpers — these call into ui.js
function hideAllOnlineUI() {
  document.getElementById('room-screen').classList.add('hidden');
  document.getElementById('online-menu').classList.add('hidden');
  document.getElementById('main-menu').classList.add('hidden');
  document.getElementById('online-gameover-screen').classList.add('hidden');
  document.getElementById('disconnected-screen').classList.add('hidden');
  document.getElementById('game-canvas').classList.remove('hidden');
  document.getElementById('hud').classList.remove('hidden');
}

function showRoomScreen(room) {
  const el = document.getElementById('room-screen');
  if (el) {
    el.classList.remove('hidden');
    document.getElementById('room-id-display').textContent = room.id;
  }
  document.getElementById('online-menu').classList.add('hidden');
  document.getElementById('main-menu').classList.add('hidden');
}

function updateRoomScreen(room) {
  const statusEl = document.getElementById('room-status');
  const readyBtn = document.getElementById('ready-btn');
  const oppStatus = document.getElementById('opponent-status');

  if (room.players.length === 0) {
    if (statusEl) statusEl.textContent = 'WAITING...';
  } else if (room.players.length === 1) {
    if (statusEl) statusEl.textContent = 'WAITING FOR OPPONENT...';
    if (oppStatus) oppStatus.textContent = 'Waiting...';
  } else if (room.players.length === 2) {
    const others = room.players.filter(p => p.id !== playerId);
    if (others.length > 0) {
      if (oppStatus) oppStatus.textContent = others[0].connected ? 'Connected' : 'Disconnected';
    }
    if (statusEl) statusEl.textContent = 'OPPONENT JOINED';
  }

  if (room.gameState === 'countdown') {
    if (statusEl) statusEl.textContent = 'STARTING...';
    if (readyBtn) readyBtn.classList.add('hidden');
  }
}

function showReadyButton() {
  const el = document.getElementById('ready-btn');
  if (el) el.classList.remove('hidden');
}

function showOnlineGameOver(amWinner, msg) {
  document.getElementById('game-canvas').classList.add('hidden');
  const screen = document.getElementById('online-gameover-screen');
  if (screen) {
    screen.classList.remove('hidden');
    const title = document.getElementById('online-gameover-title');
    title.textContent = amWinner ? 'VICTORY!' : 'DEFEATED';
    title.style.color = amWinner ? '#0f0' : '#e02020';
    document.getElementById('online-final-score').textContent = myScore;
  }
}

function showDisconnected(reason) {
  const screen = document.getElementById('disconnected-screen');
  if (screen) screen.classList.remove('hidden');
}

function showError(msg) {
  const el = document.getElementById('error-message');
  if (el) {
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 3000);
  }
}

function showMainMenu() {
  document.getElementById('main-menu').classList.remove('hidden');
  document.getElementById('room-screen').classList.add('hidden');
  document.getElementById('online-menu').classList.add('hidden');
  document.getElementById('online-gameover-screen').classList.add('hidden');
}

function showCountdown(seconds) {
  let el = document.getElementById('countdown-display');
  if (!el) {
    el = document.createElement('div');
    el.id = 'countdown-display';
    el.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:48px;color:#ff0;z-index:200;font-family:"Press Start 2P",monospace;text-shadow:0 0 20px rgba(255,255,0,0.8);';
    document.getElementById('game-container').appendChild(el);
  }
  el.textContent = seconds > 0 ? seconds : 'GO!';
  el.classList.remove('hidden');
}

function hideCountdown() {
  const el = document.getElementById('countdown-display');
  if (el) el.classList.add('hidden');
}

function showReconnecting(attempt) {
  const el = document.getElementById('reconnect-status');
  if (el) {
    el.textContent = `Reconnecting (${attempt}/5)...`;
    el.classList.remove('hidden');
  }
}

// Page visibility — pause heartbeat when hidden, auto-rejoin on return
let _visHandler = null;

export function setupVisibilityHandler() {
  if (_visHandler) {
    document.removeEventListener('visibilitychange', _visHandler);
  }
  _visHandler = () => {
    if (!network) return;
    if (document.hidden) {
      network.pausePing();
    } else {
      network.resumePing();
      if (!network.connected && network.wasConnected && roomInfo && playerId) {
        network.connect().then(() => {
          network.send({ type: 'rejoin_room', roomId: roomInfo.id, playerId });
        }).catch(() => {});
      }
    }
  };
  document.addEventListener('visibilitychange', _visHandler);
}

export function teardownVisibilityHandler() {
  if (_visHandler) {
    document.removeEventListener('visibilitychange', _visHandler);
    _visHandler = null;
  }
}

export function getRoomId() { return roomInfo ? roomInfo.id : null; }
export function getPlayerId() { return playerId; }
export function getOnlineGameState() { return gameState; }
export function sendRejoin(roomId, playerId) {
  if (network) network.send({ type: 'rejoin_room', roomId, playerId });
}
export { playerId, gameState as onlineGameState, players, bullets };
