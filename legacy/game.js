/* ===================================
   Tank War — Game Engine
   =================================== */

// ---------- Constants ----------
const TILE_SIZE = 32;
const MAP_COLS = 25;
const MAP_ROWS = 20;
const CANVAS_W = MAP_COLS * TILE_SIZE;  // 800
const CANVAS_H = MAP_ROWS * TILE_SIZE;  // 640
const TANK_SIZE = 28;
const BULLET_SIZE = 6;
const PLAYER_SPEED = 2.5;
const ENEMY_SPEED = 1.2;
const BULLET_SPEED = 5;
const FIRE_COOLDOWN = 30;       // frames between shots
const ENEMY_FIRE_COOLDOWN = 90;
const INVINCIBLE_FRAMES = 120;  // invincibility after spawn (2 sec @ 60fps)

// Tile types
const TILE = { EMPTY: 0, BRICK: 1, STEEL: 2, GRASS: 3, WATER: 4 };

// Direction vectors
const DIR = {
  UP:    { x: 0,  y: -1, angle: 0 },
  DOWN:  { x: 0,  y: 1,  angle: Math.PI },
  LEFT:  { x: -1, y: 0,  angle: -Math.PI / 2 },
  RIGHT: { x: 1,  y: 0,  angle: Math.PI / 2 },
};

const DIRS = [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT];

// ---------- DOM References ----------
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;

const scoreDisplay = document.getElementById('score-display');
const livesDisplay = document.getElementById('lives-display');
const enemiesDisplay = document.getElementById('enemies-display');
const startScreen = document.getElementById('start-screen');
const pauseScreen = document.getElementById('pause-screen');
const gameoverScreen = document.getElementById('gameover-screen');
const gameoverTitle = document.getElementById('gameover-title');
const gameoverSubtitle = document.getElementById('gameover-subtitle');
const finalScoreDisplay = document.getElementById('final-score');
const gameContainer = document.getElementById('game-container');

// ---------- Sound Engine ----------
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function initAudio() {
  if (!audioCtx) audioCtx = new AudioCtx();
}

function playBeep(freq, duration, type = 'square', vol = 0.08) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

function sfxFire()     { playBeep(600, 0.08, 'square', 0.06);
                         setTimeout(() => playBeep(300, 0.06, 'square', 0.04), 40); }
function sfxHit()      { playBeep(120, 0.15, 'sawtooth', 0.1);
                         playBeep(80, 0.2, 'triangle', 0.08); }
function sfxExplode()  { playBeep(60, 0.3, 'sawtooth', 0.12);
                         playBeep(40, 0.4, 'triangle', 0.1); }
function sfxDestroy()  { playBeep(200, 0.1, 'square', 0.06);
                         playBeep(100, 0.2, 'sawtooth', 0.08); }

// ---------- Input Handler ----------
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.key] = true;
  keys[e.code] = true;
  if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
  }
});
window.addEventListener('keyup', e => {
  keys[e.key] = false;
  keys[e.code] = false;
});

// ---------- Map ----------
const map = [];
// 0=empty, 1=brick, 2=steel, 3=grass, 4=water

function createMap() {
  for (let row = 0; row < MAP_ROWS; row++) {
    map[row] = new Array(MAP_COLS).fill(TILE.EMPTY);
  }

  // Border walls (steel on edges)
  for (let c = 0; c < MAP_COLS; c++) {
    map[0][c] = TILE.STEEL;
    map[MAP_ROWS - 1][c] = TILE.STEEL;
  }
  for (let r = 0; r < MAP_ROWS; r++) {
    map[r][0] = TILE.STEEL;
    map[r][MAP_COLS - 1] = TILE.STEEL;
  }

  // Interior brick clusters — symmetrical for fairness
  const brickPatterns = [
    // Left side
    [3,2, 5,2], [3,3, 5,3],
    [3,7, 5,7], [3,8, 5,8],
    [2,12, 4,12], [2,13, 4,13],
    [3,16, 5,16], [3,17, 5,17],
    // Right side
    [19,2, 21,2], [19,3, 21,3],
    [19,7, 21,7], [19,8, 21,8],
    [20,12, 22,12], [20,13, 22,13],
    [19,16, 21,16], [19,17, 21,17],
    // Center
    [10,4, 14,4],
    [10,9, 14,9],
    [10,14, 14,14],
    [11,6, 13,6],
    [11,12, 13,12],
  ];

  brickPatterns.forEach(([c1, r1, c2, r2]) => {
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        map[r][c] = TILE.BRICK;
      }
    }
  });

  // Steel pillars in center
  const steelBlocks = [
    [11,5], [13,5], [11,7], [13,7],
    [11,11], [13,11], [11,13], [13,13],
  ];
  steelBlocks.forEach(([c, r]) => { map[r][c] = TILE.STEEL; });

  // Water obstacles
  const waterBlocks = [
    [8,9], [8,10], [9,9], [9,10],
    [15,9], [15,10], [16,9], [16,10],
    [11,1], [12,1], [13,1],
    [11,18], [12,18], [13,18],
  ];
  waterBlocks.forEach(([c, r]) => { map[r][c] = TILE.WATER; });

  // Grass patches (visual cover)
  for (let r = 2; r <= 4; r++) {
    for (let c = 7; c <= 9; c++) map[r][c] = TILE.GRASS;
    for (let c = 15; c <= 17; c++) map[r][c] = TILE.GRASS;
  }
  for (let r = 15; r <= 17; r++) {
    for (let c = 7; c <= 9; c++) map[r][c] = TILE.GRASS;
    for (let c = 15; c <= 17; c++) map[r][c] = TILE.GRASS;
  }
  // Middle grass
  for (let c = 10; c <= 14; c++) map[11][c] = TILE.GRASS;
}

function getTile(col, row) {
  if (col < 0 || col >= MAP_COLS || row < 0 || row >= MAP_ROWS) return TILE.STEEL;
  return map[row][col];
}

// ---------- Particle System ----------
let particles = [];

function spawnExplosion(x, y, color = '#f80') {
  for (let i = 0; i < 14; i++) {
    const angle = (Math.PI * 2 * i) / 14 + Math.random() * 0.4;
    const speed = 1.5 + Math.random() * 3;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 20 + Math.random() * 15,
      maxLife: 35,
      color,
      size: 2 + Math.random() * 3,
    });
  }
}

function spawnBrickChunks(x, y) {
  for (let i = 0; i < 6; i++) {
    particles.push({
      x: x + (Math.random() - 0.5) * TILE_SIZE,
      y: y + (Math.random() - 0.5) * TILE_SIZE,
      vx: (Math.random() - 0.5) * 3,
      vy: (Math.random() - 0.5) * 3,
      life: 12 + Math.random() * 10,
      maxLife: 22,
      color: '#b85',
      size: 2 + Math.random() * 2,
    });
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life--;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawParticles(ctx) {
  for (const p of particles) {
    const alpha = p.life / p.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

// ---------- Bullet ----------
let bullets = [];

function createBullet(x, y, dir, owner) {
  return {
    x, y, dir, owner,
    w: BULLET_SIZE, h: BULLET_SIZE,
    active: true,
  };
}

function updateBullets() {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.dir.x * BULLET_SPEED;
    b.y += b.dir.y * BULLET_SPEED;

    // Out of bounds
    if (b.x < 0 || b.x > CANVAS_W || b.y < 0 || b.y > CANVAS_H) {
      bullets.splice(i, 1);
      continue;
    }

    // Tile collision
    const col = Math.floor(b.x / TILE_SIZE);
    const row = Math.floor(b.y / TILE_SIZE);
    const tile = getTile(col, row);

    if (tile === TILE.BRICK) {
      map[row][col] = TILE.EMPTY;
      spawnBrickChunks(col * TILE_SIZE + TILE_SIZE / 2, row * TILE_SIZE + TILE_SIZE / 2);
      sfxDestroy();
      bullets.splice(i, 1);
      continue;
    }
    if (tile === TILE.STEEL) {
      spawnExplosion(b.x, b.y, '#ff0');
      sfxHit();
      bullets.splice(i, 1);
      continue;
    }

    // Bullet-bullet collision
    for (let j = bullets.length - 1; j >= 0; j--) {
      if (j === i) continue;
      const other = bullets[j];
      if (Math.abs(b.x - other.x) < BULLET_SIZE && Math.abs(b.y - other.y) < BULLET_SIZE) {
        spawnExplosion(b.x, b.y, '#ff0');
        bullets.splice(Math.max(i, j), 1);
        bullets.splice(Math.min(i, j), 1);
        i = Math.min(i, bullets.length);
        break;
      }
    }
  }
}

// ---------- Tank Base Class ----------
class Tank {
  constructor(x, y, dir, color, speed) {
    this.x = x;
    this.y = y;
    this.dir = dir;
    this.color = color;
    this.speed = speed;
    this.w = TANK_SIZE;
    this.h = TANK_SIZE;
    this.alive = true;
    this.fireCooldown = 0;
    this.invincible = 0;
    this.moving = false;
  }

  collidesWithTile(nx, ny) {
    const half = TANK_SIZE / 2;
    const left = nx - half;
    const right = nx + half;
    const top = ny - half;
    const bottom = ny + half;

    const c1 = Math.floor(left / TILE_SIZE);
    const c2 = Math.floor(right / TILE_SIZE);
    const r1 = Math.floor(top / TILE_SIZE);
    const r2 = Math.floor(bottom / TILE_SIZE);

    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const tile = getTile(c, r);
        if (tile === TILE.BRICK || tile === TILE.STEEL || tile === TILE.WATER) {
          return true;
        }
      }
    }
    return false;
  }

  collidesWithTank(other) {
    if (!other.alive || other === this) return false;
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return dist < TANK_SIZE;
  }

  move(dx, dy, allTanks) {
    const nx = this.x + dx;
    const ny = this.y + dy;

    // Boundary
    const half = TANK_SIZE / 2;
    if (nx - half < 0 || nx + half > CANVAS_W || ny - half < 0 || ny + half > CANVAS_H) {
      return false;
    }

    // Tile collision
    if (this.collidesWithTile(nx, ny)) return false;

    // Tank collision
    for (const t of allTanks) {
      if (t === this || !t.alive) continue;
      const dist = Math.hypot(nx - t.x, ny - t.y);
      if (dist < TANK_SIZE) return false;
    }

    this.x = nx;
    this.y = ny;
    return true;
  }

  fire() {
    if (this.fireCooldown > 0) return null;
    this.fireCooldown = this.fireCooldownMax || FIRE_COOLDOWN;
    const bx = this.x + this.dir.x * (TANK_SIZE / 2 + 4);
    const by = this.y + this.dir.y * (TANK_SIZE / 2 + 4);
    return createBullet(bx, by, this.dir, this);
  }

  drawBody(ctx) {
    if (this.invincible > 0 && Math.floor(this.invincible / 5) % 2 === 0) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.dir.angle);

    const half = TANK_SIZE / 2;

    // Tracks
    ctx.fillStyle = '#333';
    ctx.fillRect(-half, -half + 2, half * 2, 5);
    ctx.fillRect(-half, half - 7, half * 2, 5);

    // Track details
    ctx.fillStyle = '#555';
    for (let i = -3; i <= 3; i++) {
      ctx.fillRect(i * 4 - 1.5, -half + 2.5, 3, 4);
      ctx.fillRect(i * 4 - 1.5, half - 6.5, 3, 4);
    }

    // Body
    ctx.fillStyle = this.color;
    ctx.fillRect(-half + 3, -half + 8, half * 2 - 6, half * 2 - 16);

    // Turret base (circle)
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();

    // Barrel
    ctx.fillStyle = '#ddd';
    ctx.fillRect(-2, -half - 2, 4, half - 6);

    // Barrel tip
    ctx.fillStyle = '#fff';
    ctx.fillRect(-2.5, -half - 2, 5, 4);

    ctx.restore();
  }

  update(allTanks) {
    if (this.fireCooldown > 0) this.fireCooldown--;
    if (this.invincible > 0) this.invincible--;
  }
}

// ---------- Player Tank ----------
class PlayerTank extends Tank {
  constructor(x, y) {
    super(x, y, DIR.UP, '#4a4', PLAYER_SPEED);
    this.fireCooldownMax = FIRE_COOLDOWN;
    this.lives = 3;
    this.respawnTimer = 0;
  }

  handleInput(allTanks) {
    if (!this.alive) return;

    let dx = 0, dy = 0;
    let newDir = null;

    if (keys['w'] || keys['W'] || keys['ArrowUp'])    { dy = -this.speed; newDir = DIR.UP; }
    else if (keys['s'] || keys['S'] || keys['ArrowDown']) { dy = this.speed; newDir = DIR.DOWN; }
    else if (keys['a'] || keys['A'] || keys['ArrowLeft'])  { dx = -this.speed; newDir = DIR.LEFT; }
    else if (keys['d'] || keys['D'] || keys['ArrowRight']) { dx = this.speed; newDir = DIR.RIGHT; }

    if (newDir) {
      this.dir = newDir;
      this.moving = this.move(dx, dy, allTanks);
    } else {
      this.moving = false;
    }

    if (keys[' '] || keys['Space']) {
      const bullet = this.fire();
      if (bullet) {
        bullets.push(bullet);
        sfxFire();
      }
    }
  }
}

// ---------- Enemy Tank ----------
class EnemyTank extends Tank {
  constructor(x, y, difficulty = 0) {
    super(x, y, DIRS[Math.floor(Math.random() * 4)], '#e44', ENEMY_SPEED);
    this.fireCooldownMax = ENEMY_FIRE_COOLDOWN + Math.random() * 40;
    this.dirChangeTimer = 40 + Math.random() * 80;
    this.aiTimer = 0;
    this.difficulty = difficulty;
  }

  updateAI(allTanks, player) {
    if (!this.alive) return;
    this.aiTimer++;

    // Fire at player if roughly aligned
    if (this.fireCooldown <= 0) {
      const dx = player.x - this.x;
      const dy = player.y - this.y;
      let shouldFire = false;

      if (this.dir === DIR.UP && dy < 0 && Math.abs(dx) < TANK_SIZE) shouldFire = true;
      else if (this.dir === DIR.DOWN && dy > 0 && Math.abs(dx) < TANK_SIZE) shouldFire = true;
      else if (this.dir === DIR.LEFT && dx < 0 && Math.abs(dy) < TANK_SIZE) shouldFire = true;
      else if (this.dir === DIR.RIGHT && dx > 0 && Math.abs(dy) < TANK_SIZE) shouldFire = true;

      // Also random fire
      if (shouldFire || Math.random() < 0.012) {
        const bullet = this.fire();
        if (bullet) {
          bullets.push(bullet);
          sfxFire();
        }
      }
    }

    // Direction change logic
    this.dirChangeTimer--;
    if (this.dirChangeTimer <= 0) {
      this.dirChangeTimer = 40 + Math.random() * 100;

      // Occasionally steer toward player
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

    // Move forward, turn on collision
    if (!this.move(this.dir.x * this.speed, this.dir.y * this.speed, allTanks)) {
      // Hit something — pick a random direction
      const dirs = [...DIRS].sort(() => Math.random() - 0.5);
      for (const d of dirs) {
        this.dir = d;
        if (this.move(d.x * this.speed, d.y * this.speed, allTanks)) break;
      }
      this.dirChangeTimer = 20 + Math.random() * 40;
    }
  }
}

// ---------- Game State ----------
let player = null;
let enemies = [];
let gameState = 'start'; // 'start' | 'playing' | 'paused' | 'gameover'
let score = 0;
let wave = 1;
let totalEnemies = 10;
let enemiesSpawned = 0;
let spawnTimer = 0;
let shakeTimer = 0;
let animFrameId = null;

// Spawn positions (corners of the map, inside border walls)
const spawnPoints = [
  { x: TILE_SIZE * 3, y: TILE_SIZE * 3 },
  { x: CANVAS_W - TILE_SIZE * 3, y: TILE_SIZE * 3 },
  { x: TILE_SIZE * 3, y: CANVAS_H - TILE_SIZE * 3 },
  { x: CANVAS_W - TILE_SIZE * 3, y: CANVAS_H - TILE_SIZE * 3 },
];

function getSpawnPoint() {
  // Pick a corner far from player
  const pts = spawnPoints.filter(p => {
    if (!player || !player.alive) return true;
    return Math.hypot(p.x - player.x, p.y - player.y) > TILE_SIZE * 8;
  });
  if (pts.length === 0) return spawnPoints[Math.floor(Math.random() * 4)];
  return pts[Math.floor(Math.random() * pts.length)];
}

function resetGame() {
  player = new PlayerTank(TILE_SIZE * 7, TILE_SIZE * 7);
  enemies = [];
  bullets = [];
  particles = [];
  score = 0;
  wave = 1;
  totalEnemies = 10;
  enemiesSpawned = 0;
  spawnTimer = 0;
  shakeTimer = 0;
  createMap();
  updateHUD();
}

function updateHUD() {
  scoreDisplay.textContent = score;
  if (player) {
    livesDisplay.textContent = Math.max(0, player.lives);
  }
  const aliveEnemies = enemies.filter(e => e.alive).length;
  const remaining = totalEnemies - enemiesSpawned + aliveEnemies;
  enemiesDisplay.textContent = Math.max(0, remaining);
}

function triggerShake() {
  shakeTimer = 18;
}

// ---------- Collision: bullets vs tanks ----------
function checkBulletTankCollisions() {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    if (!b.active) continue;

    // Bullet vs player
    if (b.owner !== player && player && player.alive && player.invincible <= 0) {
      if (Math.abs(b.x - player.x) < TANK_SIZE / 2 && Math.abs(b.y - player.y) < TANK_SIZE / 2) {
        spawnExplosion(player.x, player.y, '#f44');
        sfxExplode();
        triggerShake();
        player.lives--;
        player.alive = false;
        player.respawnTimer = 90;
        bullets.splice(i, 1);
        continue;
      }
    }

    // Bullet vs enemies
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      if (b.owner === enemy) continue; // enemies can't hit themselves
      // Prevent enemy bullets from hitting other enemies (friendly fire off)
      if (b.owner instanceof EnemyTank && enemy instanceof EnemyTank) continue;

      if (Math.abs(b.x - enemy.x) < TANK_SIZE / 2 && Math.abs(b.y - enemy.y) < TANK_SIZE / 2) {
        spawnExplosion(enemy.x, enemy.y, '#f80');
        sfxExplode();
        triggerShake();
        enemy.alive = false;
        if (b.owner === player) {
          score += 100;
        }
        bullets.splice(i, 1);
        break;
      }
    }
  }
}

// ---------- Spawn enemies ----------
function trySpawnEnemy() {
  if (enemiesSpawned >= totalEnemies) return;
  const aliveCount = enemies.filter(e => e.alive).length;
  if (aliveCount >= 4) return; // max 4 on screen

  spawnTimer--;
  if (spawnTimer <= 0) {
    const pt = getSpawnPoint();
    const diff = Math.min(wave - 1, 3);
    const enemy = new EnemyTank(pt.x, pt.y, diff);
    // Check spawn isn't blocked
    let blocked = false;
    if (enemy.collidesWithTile(pt.x, pt.y)) blocked = true;
    for (const t of enemies) {
      if (t.alive && Math.hypot(t.x - pt.x, t.y - pt.y) < TANK_SIZE) blocked = true;
    }
    if (player && player.alive && Math.hypot(player.x - pt.x, player.y - pt.y) < TANK_SIZE) blocked = true;

    if (!blocked) {
      enemies.push(enemy);
      enemiesSpawned++;
      spawnTimer = 90 + Math.random() * 60; // 1.5–2.5 seconds between spawns
    } else {
      spawnTimer = 30; // try again soon
    }
  }
}

// ---------- Main Game Loop ----------
function update() {
  if (gameState !== 'playing') return;

  updateParticles();
  updateBullets();

  // Collect all tanks
  const allTanks = [];
  if (player && player.alive) allTanks.push(player);
  for (const e of enemies) if (e.alive) allTanks.push(e);

  // Player update
  if (player && player.alive) {
    player.update(allTanks);
    player.handleInput(allTanks);
  }

  // Player respawn
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
    enemy.update(allTanks);
    if (player) enemy.updateAI(allTanks, player);
  }

  // Bullet-tank collisions
  checkBulletTankCollisions();

  // Spawn enemies
  trySpawnEnemy();

  // Check game over / victory
  const allEnemiesDead = enemiesSpawned >= totalEnemies && enemies.every(e => !e.alive);
  if (player && player.lives <= 0 && !player.alive && player.respawnTimer <= 0) {
    endGame(false);
  } else if (allEnemiesDead) {
    // Next wave
    if (wave < 3) {
      wave++;
      totalEnemies += 5;
      enemiesSpawned = 0;
      enemies = [];
      // Restore some bricks for the new wave
      createMap();
    } else {
      endGame(true);
    }
  }

  // Shake timer
  if (shakeTimer > 0) shakeTimer--;

  updateHUD();
}

function drawMap() {
  for (let row = 0; row < MAP_ROWS; row++) {
    for (let col = 0; col < MAP_COLS; col++) {
      const x = col * TILE_SIZE;
      const y = row * TILE_SIZE;
      const tile = map[row][col];

      switch (tile) {
        case TILE.BRICK:
          ctx.fillStyle = '#b5651d';
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          // Brick pattern
          ctx.fillStyle = '#8b4513';
          ctx.fillRect(x, y, TILE_SIZE - 1, 1);
          ctx.fillRect(x, y + TILE_SIZE / 2, TILE_SIZE, 1);
          ctx.fillRect(x + TILE_SIZE / 2, y, 1, TILE_SIZE / 2);
          ctx.fillRect(x, y + TILE_SIZE / 2, 1, TILE_SIZE / 2);
          ctx.fillRect(x + TILE_SIZE / 2, y + TILE_SIZE / 2, 1, TILE_SIZE / 2);
          break;
        case TILE.STEEL:
          ctx.fillStyle = '#888';
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          ctx.fillStyle = '#aaa';
          ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          ctx.fillStyle = '#666';
          ctx.fillRect(x + 4, y + 4, TILE_SIZE - 8, TILE_SIZE - 8);
          break;
        case TILE.WATER:
          ctx.fillStyle = '#1a3a6a';
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          // Wave lines
          ctx.strokeStyle = '#2a5a9a';
          ctx.lineWidth = 1;
          const waveOffset = (Date.now() / 800 + row) % TILE_SIZE;
          for (let wy = waveOffset - TILE_SIZE; wy < TILE_SIZE * 2; wy += 8) {
            ctx.beginPath();
            ctx.moveTo(x, y + wy);
            for (let wx = 0; wx <= TILE_SIZE; wx += 4) {
              ctx.lineTo(x + wx, y + wy + Math.sin((wx + row) * 0.8) * 2);
            }
            ctx.stroke();
          }
          break;
      }
    }
  }
}

function drawGrass() {
  // Grass is drawn on top of everything for visual cover
  for (let row = 0; row < MAP_ROWS; row++) {
    for (let col = 0; col < MAP_COLS; col++) {
      if (map[row][col] !== TILE.GRASS) continue;
      const x = col * TILE_SIZE;
      const y = row * TILE_SIZE;
      ctx.fillStyle = '#2d5a1e';
      ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
      // Grass blades
      ctx.fillStyle = '#3a7a28';
      for (let gx = 0; gx < TILE_SIZE; gx += 5) {
        for (let gy = 0; gy < TILE_SIZE; gy += 5) {
          const h = 3 + (Math.sin(gx * 0.7 + gy * 0.3) * 0.5 + 0.5) * 3;
          ctx.fillRect(x + gx + 1, y + gy, 1.5, h);
        }
      }
    }
  }
}

function render() {
  // Clear
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Apply shake
  if (shakeTimer > 0) {
    const sx = (Math.random() - 0.5) * 6 * (shakeTimer / 18);
    const sy = (Math.random() - 0.5) * 6 * (shakeTimer / 18);
    ctx.save();
    ctx.translate(sx, sy);
  }

  // Draw map (bottom layer)
  drawMap();

  // Draw all tanks
  if (player && player.alive) player.drawBody(ctx);
  for (const enemy of enemies) {
    if (enemy.alive) enemy.drawBody(ctx);
  }

  // Draw bullets
  for (const b of bullets) {
    ctx.fillStyle = b.owner === player ? '#ff0' : '#f66';
    ctx.shadowColor = b.owner === player ? '#ff0' : '#f66';
    ctx.shadowBlur = 4;
    ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
    ctx.shadowBlur = 0;

    // Bullet trail
    ctx.fillStyle = b.owner === player ? 'rgba(255,255,0,0.4)' : 'rgba(255,100,100,0.4)';
    ctx.fillRect(
      b.x - b.dir.x * 4 - b.w / 2,
      b.y - b.dir.y * 4 - b.h / 2,
      b.w, b.h
    );
  }

  // Draw particles
  drawParticles(ctx);

  // Draw grass (on top of everything)
  drawGrass();

  if (shakeTimer > 0) {
    ctx.restore();
  }

  // Draw spawn protection shield
  if (player && player.alive && player.invincible > 0) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(player.x, player.y, TANK_SIZE / 2 + 3, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function gameLoop() {
  update();
  render();
  animFrameId = requestAnimationFrame(gameLoop);
}

// ---------- Game Flow ----------
function startGame() {
  initAudio();
  resetGame();
  gameState = 'playing';
  startScreen.classList.add('hidden');
  pauseScreen.classList.add('hidden');
  gameoverScreen.classList.add('hidden');
  updateHUD();
}

function togglePause() {
  if (gameState === 'playing') {
    gameState = 'paused';
    pauseScreen.classList.remove('hidden');
  } else if (gameState === 'paused') {
    gameState = 'playing';
    pauseScreen.classList.add('hidden');
  }
}

function endGame(victory) {
  gameState = 'gameover';
  gameoverScreen.classList.remove('hidden');
  finalScoreDisplay.textContent = score;

  if (victory) {
    gameoverTitle.textContent = 'VICTORY!';
    gameoverTitle.style.color = '#0f0';
    gameoverSubtitle.textContent = '所有敌人已被消灭！';
  } else {
    gameoverTitle.textContent = 'GAME OVER';
    gameoverTitle.style.color = '#e02020';
    gameoverSubtitle.textContent = '坦克被摧毁...';
  }
}

function restartGame() {
  resetGame();
  gameState = 'playing';
  gameoverScreen.classList.add('hidden');
  pauseScreen.classList.add('hidden');
  updateHUD();
}

// ---------- Event Listeners ----------
document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', restartGame);

window.addEventListener('keydown', e => {
  if (e.key === 'p' || e.key === 'P') {
    if (gameState === 'playing' || gameState === 'paused') {
      togglePause();
    }
  }
  if (e.key === 'Enter' && gameState === 'start') {
    startGame();
  }
});

// ---------- Boot ----------
createMap();
gameLoop();

// Show start screen
startScreen.classList.remove('hidden');
