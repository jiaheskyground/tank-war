import { TANK_SIZE, TILE_SIZE, FIRE_COOLDOWN, MAP_COLS, MAP_ROWS } from './constants.js';

export class Tank {
  constructor(x, y, dir, speed, fireCooldownMax = FIRE_COOLDOWN) {
    this.x = x;
    this.y = y;
    this.dir = dir;
    this.speed = speed;
    this.w = TANK_SIZE;
    this.h = TANK_SIZE;
    this.alive = true;
    this.fireCooldown = 0;
    this.fireCooldownMax = fireCooldownMax;
    this.invincible = 0;
    this.moving = false;
  }

  collidesWithTile(map, nx, ny) {
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
        const tile = _getTile(map, c, r);
        if (tile === 1 /* BRICK */ || tile === 2 /* STEEL */ || tile === 4 /* WATER */) {
          return true;
        }
      }
    }
    return false;
  }

  collidesWithTank(other) {
    if (!other || other === this || !other.alive) return false;
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return Math.sqrt(dx * dx + dy * dy) < TANK_SIZE;
  }

  fire() {
    if (this.fireCooldown > 0) return null;
    this.fireCooldown = this.fireCooldownMax;
    return {
      x: this.x + this.dir.x * (TANK_SIZE / 2 + 4),
      y: this.y + this.dir.y * (TANK_SIZE / 2 + 4),
      dir: this.dir,
      active: true,
    };
  }
}

function _getTile(map, col, row) {
  if (col < 0 || col >= MAP_COLS || row < 0 || row >= MAP_ROWS) return 2; // STEEL
  return map[row][col];
}
