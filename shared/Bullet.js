import { BULLET_SIZE, BULLET_SPEED } from './constants.js';

export function createBullet(x, y, dir, ownerId) {
  return {
    x, y, dir,
    ownerId,
    w: BULLET_SIZE,
    h: BULLET_SIZE,
    active: true,
  };
}

export function moveBullet(bullet) {
  bullet.x += bullet.dir.x * BULLET_SPEED;
  bullet.y += bullet.dir.y * BULLET_SPEED;
}
