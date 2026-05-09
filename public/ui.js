import { startSinglePlayer, stopSinglePlayer, resumeSinglePlayer, isPaused, getGameState, getScore, getPlayerLives, getEnemyCount, getLastResult } from './singleplayer.js';
import { startOnline, createRoom, joinRoom, markReady, playAgain, leaveRoom, disconnect, getRoomId, getPlayerId, sendRejoin } from './online.js';
import { inputManager } from './input-manager.js';
import { resizeCanvas } from './renderer.js';

// UI State
let currentMode = 'menu'; // menu | singleplayer | online

// DOM refs
const canvas = document.getElementById('game-canvas');
const gameContainer = document.getElementById('game-container');
const mainMenu = document.getElementById('main-menu');
const onlineMenu = document.getElementById('online-menu');
const roomScreen = document.getElementById('room-screen');
const startScreen = document.getElementById('start-screen');
const pauseScreen = document.getElementById('pause-screen');
const gameoverScreen = document.getElementById('gameover-screen');
const onlineGameoverScreen = document.getElementById('online-gameover-screen');
const hud = document.getElementById('hud');

// ---------- Main Menu ----------
document.getElementById('btn-singleplayer').addEventListener('click', () => {
  currentMode = 'singleplayer';
  hideAllMenus();
  startScreen.classList.remove('hidden');
  hud.classList.remove('hidden');
});

document.getElementById('btn-online').addEventListener('click', () => {
  currentMode = 'online';
  hideAllMenus();
  onlineMenu.classList.remove('hidden');
});

// ---------- Start Screen (SP) ----------
document.getElementById('start-btn').addEventListener('click', () => {
  startScreen.classList.add('hidden');
  canvas.classList.remove('hidden');
  hud.classList.remove('hidden');
  inputManager.init(gameContainer);
  startSinglePlayer();
  startSPHUDUpdate();
});

// ---------- Pause (SP) ----------
window.addEventListener('keydown', e => {
  if ((e.key === 'p' || e.key === 'P') && currentMode === 'singleplayer') {
    if (isPaused()) {
      pauseScreen.classList.add('hidden');
      resumeSinglePlayer();
    } else if (getGameState() === 'playing') {
      stopSinglePlayer();
      pauseScreen.classList.remove('hidden');
    }
  }
});

// ---------- Game Over (SP) ----------
document.getElementById('restart-btn').addEventListener('click', () => {
  gameoverScreen.classList.add('hidden');
  canvas.classList.remove('hidden');
  hud.classList.remove('hidden');
  inputManager.init(gameContainer);
  startSinglePlayer();
  startSPHUDUpdate();
});

// ---------- Online Menu ----------
document.getElementById('btn-create-room').addEventListener('click', async () => {
  onlineMenu.classList.add('hidden');
  roomScreen.classList.remove('hidden');
  canvas.classList.remove('hidden');
  hud.classList.remove('hidden');
  inputManager.init(gameContainer);

  const wsUrl = location.origin.replace('http', 'ws');
  await startOnline(wsUrl);
  createRoom();
});

document.getElementById('btn-join-room').addEventListener('click', () => {
  const roomId = document.getElementById('join-room-id').value.trim();
  if (!roomId) return;

  onlineMenu.classList.add('hidden');
  roomScreen.classList.remove('hidden');
  canvas.classList.remove('hidden');
  hud.classList.remove('hidden');
  inputManager.init(gameContainer);

  const wsUrl = location.origin.replace('http', 'ws');
  startOnline(wsUrl).then(() => {
    joinRoom(roomId);
  });
});

document.getElementById('btn-back-menu').addEventListener('click', () => {
  onlineMenu.classList.add('hidden');
  mainMenu.classList.remove('hidden');
});

// ---------- Room Screen ----------
document.getElementById('btn-copy-link').addEventListener('click', () => {
  const roomId = document.getElementById('room-id-display').textContent;
  const link = `${location.origin}?room=${roomId}`;
  navigator.clipboard.writeText(link).then(() => {
    const el = document.getElementById('copy-confirm');
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 2000);
  }).catch(() => {});
});

document.getElementById('ready-btn').addEventListener('click', () => {
  markReady();
  document.getElementById('ready-btn').classList.add('hidden');
  document.getElementById('room-status').textContent = 'WAITING FOR OPPONENT...';
});

document.getElementById('btn-leave-room').addEventListener('click', () => {
  leaveRoom();
  disconnect();
  roomScreen.classList.add('hidden');
  mainMenu.classList.remove('hidden');
  canvas.classList.add('hidden');
  hud.classList.add('hidden');
});

// ---------- Online Game Over ----------
document.getElementById('btn-play-again').addEventListener('click', () => {
  onlineGameoverScreen.classList.add('hidden');
  canvas.classList.remove('hidden');
  hud.classList.remove('hidden');
  markReady();
});

document.getElementById('btn-online-back-menu').addEventListener('click', () => {
  disconnect();
  onlineGameoverScreen.classList.add('hidden');
  canvas.classList.add('hidden');
  hud.classList.add('hidden');
  mainMenu.classList.remove('hidden');
});

document.getElementById('btn-rejoin').addEventListener('click', async () => {
  const roomId = getRoomId();
  const playerId = getPlayerId();
  if (!roomId || !playerId) {
    // Fallback: go to main menu
    document.getElementById('disconnected-screen').classList.add('hidden');
    mainMenu.classList.remove('hidden');
    return;
  }
  document.getElementById('disconnected-screen').classList.add('hidden');
  const wsUrl = location.origin.replace('http', 'ws');
  await startOnline(wsUrl);
  sendRejoin(roomId, playerId);
});

// ---------- Helpers ----------
function hideAllMenus() {
  mainMenu.classList.add('hidden');
  onlineMenu.classList.add('hidden');
  roomScreen.classList.add('hidden');
  startScreen.classList.add('hidden');
  pauseScreen.classList.add('hidden');
  gameoverScreen.classList.add('hidden');
  onlineGameoverScreen.classList.add('hidden');
  document.getElementById('disconnected-screen').classList.add('hidden');
}

let spHudInterval = null;
function startSPHUDUpdate() {
  if (spHudInterval) clearInterval(spHudInterval);
  spHudInterval = setInterval(() => {
    if (currentMode !== 'singleplayer') {
      clearInterval(spHudInterval);
      return;
    }
    const gs = getGameState();
    if (gs === 'gameover') {
      clearInterval(spHudInterval);
      canvas.classList.add('hidden');
      hud.classList.add('hidden');
      gameoverScreen.classList.remove('hidden');
      document.getElementById('final-score').textContent = getScore();
      return;
    }
    document.getElementById('score-display').textContent = getScore();
    document.getElementById('lives-display').textContent = getPlayerLives();
    document.getElementById('enemies-display').textContent = getEnemyCount();
    document.getElementById('enemies-label').textContent = 'ENEMIES';
  }, 200);
}

// Check for room invite link on load
window.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(location.search);
  const roomId = params.get('room');
  if (roomId) {
    currentMode = 'online';
    hideAllMenus();
    roomScreen.classList.remove('hidden');
    canvas.classList.remove('hidden');
    hud.classList.remove('hidden');
    inputManager.init(gameContainer);

    const wsUrl = location.origin.replace('http', 'ws');
    startOnline(wsUrl).then(() => {
      joinRoom(roomId);
    });
  }

  // Canvas DPR resize on load
  resizeCanvas();
});

// Orientation & layout — unified handler, no screen.orientation dependency
const rotateScreen = document.getElementById('rotate-device');
const touchControls = document.getElementById('touch-controls');

let _layoutTimer = null;

function isLandscape() {
  return window.innerWidth > window.innerHeight;
}

export function checkOrientation() {
  const landscape = isLandscape();

  // Rotate overlay
  if (rotateScreen) {
    if (landscape) {
      rotateScreen.classList.add('hidden');
    } else {
      rotateScreen.classList.remove('hidden');
    }
  }

  // Touch controls layout class
  if (touchControls) {
    touchControls.classList.toggle('landscape', landscape);
  }

  if (landscape) {
    resizeCanvas();
    layoutControls();
  }
}

export function layoutControls() {
  // Force safe-area CSS re-evaluation
  document.body.style.padding = '';
  void document.body.offsetHeight;
  document.body.style.padding = '';

  // Re-initialize input if game container is visible
  if (!canvas.classList.contains('hidden') && inputManager._initialized) {
    inputManager.refresh();
  }
}

function scheduleLayout(delay) {
  clearTimeout(_layoutTimer);
  _layoutTimer = setTimeout(() => {
    checkOrientation();
  }, delay);
}

window.addEventListener('resize', () => scheduleLayout(100));

window.addEventListener('orientationchange', () => {
  // orientationchange fires before dimensions are updated
  scheduleLayout(300);
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    scheduleLayout(150);
  }
});

checkOrientation();
