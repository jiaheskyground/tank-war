// ---------- Shared Constants ----------
export const TILE_SIZE = 32;
export const MAP_COLS = 25;
export const MAP_ROWS = 20;
export const CANVAS_W = MAP_COLS * TILE_SIZE;  // 800
export const CANVAS_H = MAP_ROWS * TILE_SIZE;  // 640
export const TANK_SIZE = 28;
export const BULLET_SIZE = 6;
export const PLAYER_SPEED = 2.5;
export const ENEMY_SPEED = 1.2;
export const BULLET_SPEED = 5;
export const FIRE_COOLDOWN = 30;
export const ENEMY_FIRE_COOLDOWN = 90;
export const INVINCIBLE_FRAMES = 120;

// Tile types
export const TILE = { EMPTY: 0, BRICK: 1, STEEL: 2, GRASS: 3, WATER: 4 };

// Direction vectors
export const DIR = {
  UP:    { x: 0,  y: -1, angle: 0 },
  DOWN:  { x: 0,  y: 1,  angle: Math.PI },
  LEFT:  { x: -1, y: 0,  angle: -Math.PI / 2 },
  RIGHT: { x: 1,  y: 0,  angle: Math.PI / 2 },
};

export const DIRS = [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT];

export const DIR_INDEX = { '0,-1': 0, '0,1': 1, '-1,0': 2, '1,0': 3 }; // dir vector → index

// Server tick rate
export const TICK_RATE = 20;        // ticks per second
export const TICK_INTERVAL = 1000 / TICK_RATE;
export const SNAPSHOT_RATE = 10;    // snapshots per second sent to clients

// Network
export const HEARTBEAT_INTERVAL = 5000;
export const HEARTBEAT_TIMEOUT = 12000;
