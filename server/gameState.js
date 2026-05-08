import { createMap, getTile } from '../shared/Map.js';
import { Tank } from '../shared/Tank.js';
import { DIR, TILE_SIZE, CANVAS_W, CANVAS_H, TANK_SIZE, BULLET_SPEED, BULLET_SIZE, PLAYER_SPEED, FIRE_COOLDOWN, INVINCIBLE_FRAMES, TICK_RATE } from '../shared/constants.js';
import { checkBulletTile, checkBulletTank, checkBulletBullet, isValidPosition } from '../shared/Collision.js';
import { validateInput } from './antiCheat.js';

const SPAWN_POINTS = [
  { x: TILE_SIZE * 4, y: TILE_SIZE * 4 },
  { x: CANVAS_W - TILE_SIZE * 4, y: CANVAS_H - TILE_SIZE * 4 },
];

export function createGameState(room) {
  room.map = createMap();
  room.bullets = [];
  room.pendingParticles = [];
  room.mapChanges = [];
  room.serverTick = 0;
  room.gameState = 'countdown'; // countdown → playing → gameover
  room.countdown = 3 * TICK_RATE; // 3 seconds at 20tps
  room.winner = null;

  // Initialize player tanks
  let spawnIndex = 0;
  for (const [id, player] of room.players) {
    const spawn = SPAWN_POINTS[spawnIndex % SPAWN_POINTS.length];
    const dir = spawnIndex === 0 ? DIR.RIGHT : DIR.LEFT;
    player.tank = new Tank(spawn.x, spawn.y, dir, PLAYER_SPEED, FIRE_COOLDOWN);
    player.lives = 3;
    player.score = 0;
    player.lastFireTick = -100;
    player.spawnTimer = 0;
    player.inputQueue = [];
    player.ready = false;
    spawnIndex++;
  }
}

export function updateGameState(room) {
  if (room.gameState === 'gameover') return;
  if (room.gameState === 'countdown') {
    room.countdown--;
    if (room.countdown <= 0) {
      room.gameState = 'playing';
    }
    room.serverTick++;
    return;
  }

  room.serverTick++;

  const allTanks = [];
  for (const [, p] of room.players) {
    if (p.tank && p.tank.alive) allTanks.push(p.tank);
  }

  // Process player inputs
  for (const [id, player] of room.players) {
    if (!player.tank) continue;

    // Process input queue
    while (player.inputQueue.length > 0) {
      const input = player.inputQueue.shift();

      // Validate
      const violations = validateInput(player, input, room.map, allTanks, room.serverTick);
      if (violations.length > 0) {
        // Log and ignore invalid inputs
        continue;
      }

      // Handle respawn
      if (!player.tank.alive) {
        if (player.spawnTimer > 0) {
          player.spawnTimer--;
        }
        if (player.spawnTimer <= 0 && player.lives > 0) {
          const spawn = getSpawnPoint(room, id);
          player.tank.x = spawn.x;
          player.tank.y = spawn.y;
          player.tank.dir = DIR.UP;
          player.tank.alive = true;
          player.tank.invincible = INVINCIBLE_FRAMES;
          player.spawnTimer = 0;
        }
        continue;
      }

      // Update direction
      if (input.dir) {
        player.tank.dir = input.dir;
      }

      // Apply movement
      if (input.dx !== 0 || input.dy !== 0) {
        const nx = player.tank.x + input.dx;
        const ny = player.tank.y + input.dy;
        if (isValidPosition(player.tank, room.map, nx, ny, allTanks)) {
          player.tank.x = nx;
          player.tank.y = ny;
          player.tank.moving = true;
        } else {
          player.tank.moving = false;
        }
      } else {
        player.tank.moving = false;
      }

      // Fire
      if (input.fire) {
        const bullet = player.tank.fire();
        if (bullet) {
          bullet.ownerId = id;
          room.bullets.push(bullet);
          player.lastFireTick = room.serverTick;
        }
      }
    }

    // Tick cooldowns
    if (player.tank) {
      if (player.tank.fireCooldown > 0) player.tank.fireCooldown--;
      if (player.tank.invincible > 0) player.tank.invincible--;
    }
  }

  // Update bullets
  updateBullets(room);

  // Check bullet-tank collisions
  checkBulletTankCollisions(room);

  // Check victory condition
  checkWinCondition(room);
}

function updateBullets(room) {
  for (let i = room.bullets.length - 1; i >= 0; i--) {
    const b = room.bullets[i];
    b.x += b.dir.x * BULLET_SPEED;
    b.y += b.dir.y * BULLET_SPEED;

    // Out of bounds
    if (b.x < 0 || b.x > CANVAS_W || b.y < 0 || b.y > CANVAS_H) {
      room.bullets.splice(i, 1);
      continue;
    }

    // Tile collision
    const result = checkBulletTile(room.map, b.x, b.y);
    if (result.hit) {
      if (result.tileType === 1) { // BRICK
        room.map[result.row][result.col] = 0; // EMPTY
        room.mapChanges.push({ col: result.col, row: result.row, tile: 0 });
        room.pendingParticles.push({
          type: 'brick',
          x: result.col * TILE_SIZE + TILE_SIZE / 2,
          y: result.row * TILE_SIZE + TILE_SIZE / 2,
        });
      } else if (result.tileType === 2) { // STEEL
        room.pendingParticles.push({
          type: 'spark',
          x: b.x,
          y: b.y,
        });
      }
      room.bullets.splice(i, 1);
      continue;
    }

    // Bullet-bullet collision
    for (let j = room.bullets.length - 1; j >= 0; j--) {
      if (j === i) continue;
      if (checkBulletBullet(b, room.bullets[j])) {
        room.pendingParticles.push({ type: 'spark', x: b.x, y: b.y });
        room.bullets.splice(Math.max(i, j), 1);
        room.bullets.splice(Math.min(i, j), 1);
        i = Math.min(i, room.bullets.length);
        break;
      }
    }
  }
}

function checkBulletTankCollisions(room) {
  for (let i = room.bullets.length - 1; i >= 0; i--) {
    const b = room.bullets[i];
    if (!b.active) continue;

    for (const [id, player] of room.players) {
      if (!player.tank || !player.tank.alive) continue;
      if (b.ownerId === id) continue; // Can't hit self
      if (player.tank.invincible > 0) continue;

      if (checkBulletTank(b, player.tank)) {
        // Hit!
        room.pendingParticles.push({
          type: 'explosion',
          x: player.tank.x,
          y: player.tank.y,
          color: '#f44',
        });

        player.tank.alive = false;
        player.lives--;
        player.spawnTimer = 3 * TICK_RATE; // 3 second respawn

        // Award score to shooter
        const shooter = room.players.get(b.ownerId);
        if (shooter && shooter !== player) {
          shooter.score += 100;
        }

        room.bullets.splice(i, 1);
        break;
      }
    }
  }
}

function checkWinCondition(room) {
  let aliveCount = 0;
  let lastAlive = null;

  for (const [id, player] of room.players) {
    if (player.tank && player.tank.alive) {
      aliveCount++;
      lastAlive = id;
    }
    if (player.lives <= 0 && (!player.tank || !player.tank.alive) && player.spawnTimer <= 0) {
      // This player is dead and can't respawn
    }
  }

  // Check if any player has no lives left and can't respawn
  const playersOut = [];
  for (const [id, player] of room.players) {
    if (player.lives <= 0 && (!player.tank || !player.tank.alive) && player.spawnTimer <= 0) {
      playersOut.push(id);
    }
  }

  if (playersOut.length >= room.players.size) {
    // All dead — last one standing wins, or draw
    room.gameState = 'gameover';
    // Find highest score
    let maxScore = -1;
    let winner = null;
    for (const [id, player] of room.players) {
      if (player.score > maxScore) {
        maxScore = player.score;
        winner = id;
      }
    }
    room.winner = winner;
  }

  // If only one player left with lives and the other is out
  if (room.players.size === 2) {
    const ids = [...room.players.keys()];
    const p0 = room.players.get(ids[0]);
    const p1 = room.players.get(ids[1]);
    const p0dead = p0.lives <= 0 && (!p0.tank || !p0.tank.alive) && p0.spawnTimer <= 0;
    const p1dead = p1.lives <= 0 && (!p1.tank || !p1.tank.alive) && p1.spawnTimer <= 0;

    if (p0dead && !p1dead) {
      room.gameState = 'gameover';
      room.winner = ids[1];
    } else if (p1dead && !p0dead) {
      room.gameState = 'gameover';
      room.winner = ids[0];
    }
  }
}

function getSpawnPoint(room, excludeId) {
  // Find a spawn point far from other alive tanks
  const otherTank = [...room.players.values()]
    .filter(p => p.tank && p.tank.alive)
    .map(p => p.tank)[0];

  const points = [...SPAWN_POINTS];
  if (otherTank) {
    points.sort((a, b) => {
      const da = Math.hypot(a.x - otherTank.x, a.y - otherTank.y);
      const db = Math.hypot(b.x - otherTank.x, b.y - otherTank.y);
      return db - da;
    });
  }
  return points[0];
}

export function processInput(room, playerId, input) {
  const player = room.players.get(playerId);
  if (!player) return;
  player.inputQueue.push(input);
}
