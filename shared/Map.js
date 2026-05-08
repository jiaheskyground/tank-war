import { MAP_COLS, MAP_ROWS, TILE } from './constants.js';

export function createEmptyMap() {
  const map = [];
  for (let row = 0; row < MAP_ROWS; row++) {
    map[row] = new Array(MAP_COLS).fill(TILE.EMPTY);
  }
  return map;
}

export function createMap() {
  const map = createEmptyMap();

  // Border walls (steel edges)
  for (let c = 0; c < MAP_COLS; c++) {
    map[0][c] = TILE.STEEL;
    map[MAP_ROWS - 1][c] = TILE.STEEL;
  }
  for (let r = 0; r < MAP_ROWS; r++) {
    map[r][0] = TILE.STEEL;
    map[r][MAP_COLS - 1] = TILE.STEEL;
  }

  // Interior brick clusters — symmetrical
  const brickPatterns = [
    [3,2, 5,2], [3,3, 5,3],
    [3,7, 5,7], [3,8, 5,8],
    [2,12, 4,12], [2,13, 4,13],
    [3,16, 5,16], [3,17, 5,17],
    [19,2, 21,2], [19,3, 21,3],
    [19,7, 21,7], [19,8, 21,8],
    [20,12, 22,12], [20,13, 22,13],
    [19,16, 21,16], [19,17, 21,17],
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

  // Steel pillars
  const steelBlocks = [
    [11,5], [13,5], [11,7], [13,7],
    [11,11], [13,11], [11,13], [13,13],
  ];
  steelBlocks.forEach(([c, r]) => { map[r][c] = TILE.STEEL; });

  // Water
  const waterBlocks = [
    [8,9], [8,10], [9,9], [9,10],
    [15,9], [15,10], [16,9], [16,10],
    [11,1], [12,1], [13,1],
    [11,18], [12,18], [13,18],
  ];
  waterBlocks.forEach(([c, r]) => { map[r][c] = TILE.WATER; });

  // Grass patches
  for (let r = 2; r <= 4; r++) {
    for (let c = 7; c <= 9; c++) map[r][c] = TILE.GRASS;
    for (let c = 15; c <= 17; c++) map[r][c] = TILE.GRASS;
  }
  for (let r = 15; r <= 17; r++) {
    for (let c = 7; c <= 9; c++) map[r][c] = TILE.GRASS;
    for (let c = 15; c <= 17; c++) map[r][c] = TILE.GRASS;
  }
  for (let c = 10; c <= 14; c++) map[11][c] = TILE.GRASS;

  return map;
}

export function getTile(map, col, row) {
  if (col < 0 || col >= MAP_COLS || row < 0 || row >= MAP_ROWS) return TILE.STEEL;
  return map[row][col];
}
