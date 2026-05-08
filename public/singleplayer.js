// Single Player mode — local game with AI enemies
import { createMap, getTile } from '/shared/Map.js';
import { Tank } from '/shared/Tank.js';
import {
  TILE_SIZE, MAP_COLS, MAP_ROWS, CANVAS_W, CANVAS_H,
  TANK_SIZE, BULLET_SIZE,
  PLAYER_SPEED, ENEMY_SPEED, BULLET_SPEED,
  FIRE_COOLDOWN, ENEMY_FIRE_COOLDOWN, INVINCIBLE_FRAMES,
  DIR, DIRS, TILE,
} from '/shared/constants.js';
import {
  initAudio, sfxFire, sfxHit, sfxExplode, sfxDestroy,
  clearCanvas, applyShake, clearShake,
  drawMap, drawGrass, drawTank, drawBullet, drawParticles, drawShield,
  spawnExplosion, spawnBrickChunks, updateParticles,
  ctx, canvas,
} from './renderer.js';

// ---------- Extended Tank for SP (adds drawing support) ----------
class SPTank extends Tank {
  constructor(x, y, dir, color, speed, fireCooldownMax) {
    super(x, y, dir, speed, fireCooldownMax);
    this.color = color;
  }

  draw() {
    drawTank(this.x, this.y, this.dir, this.color, this.invincible > 0);
  }
}

// ---------- Player Tank ----------
class PlayerTank extends SPTank {
  constructor(x, y) {
    super(x, y, DIR.UP, '#4a4', PLAYER_SPEED, FIRE_COOLDOWN);
    this.lives = 3;
    this.respawnTimer = 0;
  }

  handleInput(keys, allTanks, map, bullets) {
    if (!this.alive) return;

    let dx = 0, dy = 0;
    let newDir = null;

    if (keys['w'] || keys['W'] || keys['ArrowUp'])    { dy = -this.speed; newDir = DIR.UP; }
    else if (keys['s'] || keys['S'] || keys['ArrowDown']) { dy = this.speed; newDir = DIR.DOWN; }
    else if (keys['a'] || keys['A'] || keys['ArrowLeft'])  { dx = -this.speed; newDir = DIR.LEFT; }
    else if (keys['d'] || keys['D'] || keys['ArrowRight']) { dx = this.speed; newDir = DIR.RIGHT; }

    if (newDir) {
      this.dir = newDir;
      this.moving = this.tryMove(dx, dy, allTanks, map);
    } else {
      this.moving = false;
    }

    if (keys[' '] || keys['Space']) {
      const bullet = this.fire();
      if (bullet) {
        bullet.ownerId = 'player';
        bullet.isPlayer = true;
        bullets.push(bullet);
        sfxFire();
      }
    }
  }

  tryMove(dx, dy, allTanks, map) {
    const nx = this.x + dx;
    const ny = this.y + dy;
    const half = TANK_SIZE / 2;

    if (nx - half < 0 || nx + half > CANVAS_W || ny - half < 0 || ny + half > CANVAS_H) return false;
    if (this.collidesWithTile(map, nx, ny)) return false;
    for (const t of allTanks) {
      if (t === this || !t.alive) continue;
      if (Math.hypot(nx - t.x, ny - t.y) < TANK_SIZE) return false;
    }
    this.x = nx;
    this.y = ny;
    return true;
  }
}

// ---------- Enemy Tank ----------
class EnemyTank extends SPTank {
  constructor(x, y, difficulty = 0) {
    super(x, y, DIRS[Math.floor(Math.random() * 4)], '#e44', ENEMY_SPEED, ENEMY_FIRE_COOLDOWN + Math.random() * 40);
    this.dirChangeTimer = 40 + Math.random() * 80;
    this.aiTimer = 0;
    this.difficulty = difficulty;
  }

  updateAI(allTanks, player, map, bullets) {
    if (!this.alive) return;
    this.aiTimer++;

    if (this.fireCooldown <= 0) {
      const dx = player.x - this.x;
      const dy = player.y - this.y;
      let shouldFire = false;
      if (this.dir === DIR.UP && dy < 0 && Math.abs(dx) < TANK_SIZE) shouldFire = true;
      else if (this.dir === DIR.DOWN && dy > 0 && Math.abs(dx) < TANK_SIZE) shouldFire = true;
      else if (this.dir === DIR.LEFT && dx < 0 && Math.abs(dy) < TANK_SIZE) shouldFire = true;
      else if (this.dir === DIR.RIGHT && dx > 0 && Math.abs(dy) < TANK_SIZE) shouldFire = true;

      if (shouldFire || Math.random() < 0.012) {
        const bullet = this.fire();
        if (bullet) {
          bullet.ownerId = 'enemy';
          bullet.isPlayer = false;
          bullets.push(bullet);
          sfxFire();
        }
      }
    }

    this.dirChangeTimer--;
    if (this.dirChangeTimer <= 0) {
      this.dirChangeTimer = 40 + Math.random() * 100;
      if (Math.random() < 0.35 + this.difficulty * 0.1) {
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        if (Math.abs(dx) > Math.abs(dy)) {
          this.dir = dx > 0 ? DIR.RIGHT : DIR.LEFT;
        } else {
          this.dir = dy > 0 ? DIR.DOWN : DIR.UP;
        }
      } else {
        this.dir = DIRS[Math.floor(Math.random() * 4)];
      }
    }

    if (!this.tryMove(this.dir.x * this.speed, this.dir.y * this.speed, allTanks, map)) {
      const dirs = [...DIRS].sort(() => Math.random() - 0.5);
      for (const d of dirs) {
        this.dir = d;
        if (this.tryMove(d.x * this.speed, d.y * this.speed, allTanks, map)) break;
      }
      this.dirChangeTimer = 20 + Math.random() * 40;
    }
  }

  tryMove(dx, dy, allTanks, map) {
    const nx = this.x + dx;
    const ny = this.y + dy;
    const half = TANK_SIZE / 2;
    if (nx - half < 0 || nx + half > CANVAS_W || ny - half < 0 || ny + half > CANVAS_H) return false;
    if (this.collidesWithTile(map, nx, ny)) return false;
    for (const t of allTanks) {
      if (t === this || !t.alive) continue;
      if (Math.hypot(nx - t.x, ny - t.y) < TANK_SIZE) return false;
    }
    this.x = nx;
    this.y = ny;
    return true;
  }
}

// ---------- SP Game State ----------
let player, enemies, bullets, particles, map;
let gameState, score, wave, totalEnemies, enemiesSpawned, spawnTimer, shakeTimer;
let animFrameId;

const spawnPoints = [
  { x: TILE_SIZE * 3, y: TILE_SIZE * 3 },
  { x: CANVAS_W - TILE_SIZE * 3, y: TILE_SIZE * 3 },
  { x: TILE_SIZE * 3, y: CANVAS_H - TILE_SIZE * 3 },
  { x: CANVAS_W - TILE_SIZE * 3, y: CANVAS_H - TILE_SIZE * 3 },
];

function getSpawnPoint() {
  const pts = spawnPoints.filter(p => {
    if (!player || !player.alive) return true;
    return Math.hypot(p.x - player.x, p.y - player.y) > TILE_SIZE * 8;
  });
  if (pts.length === 0) return spawnPoints[Math.floor(Math.random() * 4)];
  return pts[Math.floor(Math.random() * pts.length)];
}

export function startSinglePlayer() {
  initAudio();
  player = new PlayerTank(TILE_SIZE * 7, TILE_SIZE * 7);
  enemies = [];
  bullets = [];
  particles = [];
  map = createMap();
  score = 0;
  wave = 1;
  totalEnemies = 10;
  enemiesSpawned = 0;
  spawnTimer = 60;
  shakeTimer = 0;
  gameState = 'playing';

  if (animFrameId) cancelAnimationFrame(animFrameId);
  spGameLoop();
}

export function stopSinglePlayer() {
  gameState = 'paused';
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
}

export function resumeSinglePlayer() {
  if (gameState !== 'paused') return;
  gameState = 'playing';
  spGameLoop();
}

export function isPaused() {
  return gameState === 'paused';
}

function spGameLoop() {
  if (gameState !== 'playing') return;
  updateSP();
  renderSP();
  animFrameId = requestAnimationFrame(spGameLoop);
}

function updateSP() {
  updateParticles(particles);

  // Update bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.dir.x * BULLET_SPEED;
    b.y += b.dir.y * BULLET_SPEED;

    if (b.x < 0 || b.x > CANVAS_W || b.y < 0 || b.y > CANVAS_H) {
      bullets.splice(i, 1);
      continue;
    }

    const col = Math.floor(b.x / TILE_SIZE);
    const row = Math.floor(b.y / TILE_SIZE);
    const tile = getTile(map, col, row);

    if (tile === TILE.BRICK) {
      map[row][col] = TILE.EMPTY;
      spawnBrickChunks(particles, col * TILE_SIZE + TILE_SIZE / 2, row * TILE_SIZE + TILE_SIZE / 2);
      sfxDestroy();
      bullets.splice(i, 1);
      continue;
    }
    if (tile === TILE.STEEL) {
      spawnExplosion(particles, b.x, b.y, '#ff0');
      sfxHit();
      bullets.splice(i, 1);
      continue;
    }

    // Bullet-bullet
    for (let j = bullets.length - 1; j >= 0; j--) {
      if (j === i) continue;
      if (Math.abs(b.x - bullets[j].x) < BULLET_SIZE && Math.abs(b.y - bullets[j].y) < BULLET_SIZE) {
        spawnExplosion(particles, b.x, b.y, '#ff0');
        bullets.splice(Math.max(i, j), 1);
        bullets.splice(Math.min(i, j), 1);
        i = Math.min(i, bullets.length);
        break;
      }
    }
  }

  const allTanks = [];
  if (player && player.alive) allTanks.push(player);
  for (const e of enemies) if (e.alive) allTanks.push(e);

  // Update cooldowns
  if (player) {
    if (player.fireCooldown > 0) player.fireCooldown--;
    if (player.invincible > 0) player.invincible--;
  }
  for (const e of enemies) {
    if (e.fireCooldown > 0) e.fireCooldown--;
    if (e.invincible > 0) e.invincible--;
  }

  // Player
  if (player && player.alive) {
    player.handleInput(keys, allTanks, map, bullets);
  }

  // Respawn
  if (player && !player.alive) {
    player.respawnTimer--;
    if (player.respawnTimer <= 0 && player.lives > 0) {
      player.x = TILE_SIZE * 7;
      player.y = TILE_SIZE * 7;
      player.dir = DIR.UP;
      player.alive = true;
      player.invincible = INVINCIBLE_FRAMES;
      player.respawnTimer = 0;
    }
  }

  // Enemy AI
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    enemy.updateAI(allTanks, player, map, bullets);
  }

  // Bullet-tank collisions
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];

    // vs player
    if (b.ownerId === 'enemy' && player && player.alive && player.invincible <= 0) {
      if (Math.abs(b.x - player.x) < TANK_SIZE / 2 && Math.abs(b.y - player.y) < TANK_SIZE / 2) {
        spawnExplosion(particles, player.x, player.y, '#f44');
        sfxExplode();
        shakeTimer = 18;
        player.lives--;
        player.alive = false;
        player.respawnTimer = 90;
        bullets.splice(i, 1);
        continue;
      }
    }

    // vs enemies
    if (b.ownerId === 'player') {
      for (const enemy of enemies) {
        if (!enemy.alive) continue;
        if (Math.abs(b.x - enemy.x) < TANK_SIZE / 2 && Math.abs(b.y - enemy.y) < TANK_SIZE / 2) {
          spawnExplosion(particles, enemy.x, enemy.y, '#f80');
          sfxExplode();
          shakeTimer = 18;
          enemy.alive = false;
          score += 100;
          bullets.splice(i, 1);
          break;
        }
      }
    }
  }

  // Spawn
  if (enemiesSpawned < totalEnemies) {
    const aliveCount = enemies.filter(e => e.alive).length;
    if (aliveCount < 4) {
      spawnTimer--;
      if (spawnTimer <= 0) {
        const pt = getSpawnPoint();
        const diff = Math.min(wave - 1, 3);
        const enemy = new EnemyTank(pt.x, pt.y, diff);
        let blocked = enemy.collidesWithTile(map, pt.x, pt.y);
        for (const t of enemies) {
          if (t.alive && Math.hypot(t.x - pt.x, t.y - pt.y) < TANK_SIZE) blocked = true;
        }
        if (player && player.alive && Math.hypot(player.x - pt.x, player.y - pt.y) < TANK_SIZE) blocked = true;

        if (!blocked) {
          enemies.push(enemy);
          enemiesSpawned++;
          spawnTimer = 90 + Math.random() * 60;
        } else {
          spawnTimer = 30;
        }
      }
    }
  }

  // Victory / Death
  const allEnemiesDead = enemiesSpawned >= totalEnemies && enemies.every(e => !e.alive);
  if (player && player.lives <= 0 && !player.alive && player.respawnTimer <= 0) {
    gameState = 'gameover';
    lastResult = { victory: false, score };
    return lastResult;
  } else if (allEnemiesDead) {
    if (wave < 3) {
      wave++;
      totalEnemies += 5;
      enemiesSpawned = 0;
      enemies = [];
      map = createMap();
    } else {
      gameState = 'gameover';
      lastResult = { victory: true, score };
      return lastResult;
    }
  }

  if (shakeTimer > 0) shakeTimer--;
  return null;
}

function renderSP() {
  clearCanvas();
  applyShake(shakeTimer);
  drawMap(map);
  if (player && player.alive) player.draw();
  for (const e of enemies) if (e.alive) e.draw();
  for (const b of bullets) drawBullet(b.x, b.y, b.dir, b.isPlayer);
  drawParticles(particles);
  drawGrass(map);
  clearShake(shakeTimer);
  if (player && player.alive && player.invincible > 0) drawShield(player.x, player.y);
}

// Input
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.key] = true;
  keys[e.code] = true;
  if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault();
});
window.addEventListener('keyup', e => {
  keys[e.key] = false;
  keys[e.code] = false;
});

let lastResult = null; // { victory: bool, score: number }

export function getGameState() { return gameState; }
export function getScore() { return score; }
export function getPlayerLives() { return player ? player.lives : 0; }
export function getEnemyCount() {
  const alive = enemies ? enemies.filter(e => e.alive).length : 0;
  return Math.max(0, totalEnemies - enemiesSpawned + alive);
}
export function getLastResult() { return lastResult; }
export { keys, player, enemies, map, bullets, particles, shakeTimer };
