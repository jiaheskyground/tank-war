import { TANK_SIZE, TILE_SIZE, BULLET_SIZE, MAP_COLS, MAP_ROWS, CANVAS_W, CANVAS_H, BULLET_SPEED } from './constants.js';

/**
 * Check bullet vs tile collision. Returns { hit: true, tileType } or { hit: false }
 */
export function checkBulletTile(map, bx, by) {
  const col = Math.floor(bx / TILE_SIZE);
  const row = Math.floor(by / TILE_SIZE);
  const tile = getTileSafe(map, col, row);

  if (tile === 1 /* BRICK */) return { hit: true, tileType: 1, col, row };
  if (tile === 2 /* STEEL */) return { hit: true, tileType: 2, col, row };
  return { hit: false };
}

/**
 * Check bullet vs tank collision (AABB)
 */
export function checkBulletTank(bullet, tank) {
  if (!tank.alive) return false;
  return Math.abs(bullet.x - tank.x) < TANK_SIZE / 2 &&
         Math.abs(bullet.y - tank.y) < TANK_SIZE / 2;
}

/**
 * Check bullet-bullet collision
 */
export function checkBulletBullet(b1, b2) {
  return Math.abs(b1.x - b2.x) < BULLET_SIZE &&
         Math.abs(b1.y - b2.y) < BULLET_SIZE;
}

/**
 * Check if a position is valid for tank movement (no collision with tiles or other tanks)
 */
export function isValidPosition(tank, map, nx, ny, allTanks) {
  const half = TANK_SIZE / 2;

  // Boundary
  if (nx - half < 0 || nx + half > CANVAS_W || ny - half < 0 || ny + half > CANVAS_H) {
    return false;
  }

  // Tile collision
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
      const tile = getTileSafe(map, c, r);
      if (tile === 1 || tile === 2 || tile === 4) return false;
    }
  }

  // Tank collision
  for (const other of allTanks) {
    if (other === tank || !other.alive) continue;
    if (Math.hypot(nx - other.x, ny - other.y) < TANK_SIZE) return false;
  }

  return true;
}

export function getTileSafe(map, col, row) {
  if (col < 0 || col >= MAP_COLS || row < 0 || row >= MAP_ROWS) return 2; // STEEL
  return map[row][col];
}
