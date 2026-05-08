import { TANK_SIZE, BULLET_SPEED, PLAYER_SPEED, FIRE_COOLDOWN, CANVAS_W, CANVAS_H, TILE_SIZE } from '../shared/constants.js';
import { isValidPosition } from '../shared/Collision.js';

const MAX_SPEED = PLAYER_SPEED * 1.3;
const MIN_FIRE_INTERVAL = FIRE_COOLDOWN * 0.8;

export function validateInput(player, input, map, allTanks, serverTick) {
  const violations = [];

  // Speed check
  const dx = input.dx || 0;
  const dy = input.dy || 0;
  if (Math.abs(dx) > MAX_SPEED || Math.abs(dy) > MAX_SPEED) {
    violations.push('speed_hack');
    input.dx = 0;
    input.dy = 0;
  }

  // Fire rate check
  if (input.fire && player.lastFireTick) {
    const ticksSinceFire = serverTick - player.lastFireTick;
    if (ticksSinceFire < MIN_FIRE_INTERVAL) {
      violations.push('fire_rate_hack');
      input.fire = false;
    }
  }

  // Position sanity check (teleport detection)
  if (player.x !== undefined && player.y !== undefined) {
    const maxDist = MAX_SPEED * 3; // Allow some leeway for prediction differences
    const dist = Math.hypot(input.x - player.x, input.y - player.y);
    if (dist > maxDist * 5) {
      violations.push('teleport');
    }
  }

  return violations;
}

export function validateMoveResult(player, nx, ny, map, allTanks) {
  // Verify the new position is actually valid
  if (!isValidPosition(player, map, nx, ny, allTanks)) {
    return false;
  }
  return true;
}
