export function encodeSnapshot(room) {
  const players = [];
  for (const [id, p] of room.players) {
    if (p.tank) {
      players.push({
        id,
        x: p.tank.x,
        y: p.tank.y,
        dir: { x: p.tank.dir.x, y: p.tank.dir.y },
        alive: p.tank.alive,
        invincible: p.tank.invincible,
        lives: p.lives,
        score: p.score,
        moving: p.tank.moving,
      });
    }
  }

  const bullets = room.bullets.map(b => ({
    x: b.x,
    y: b.y,
    dir: { x: b.dir.x, y: b.dir.y },
    ownerId: b.ownerId,
    active: b.active,
  }));

  const mapChanges = room.mapChanges || [];
  room.mapChanges = [];

  const particles = room.pendingParticles || [];
  room.pendingParticles = [];

  return {
    type: 'snapshot',
    tick: room.serverTick,
    time: Date.now(),
    players,
    bullets,
    mapChanges,
    particles,
    gameState: room.gameState,
    winner: room.winner,
    countdown: room.countdown,
  };
}

export function decodeInput(data) {
  return {
    type: 'input',
    seq: data.seq || 0,
    dx: data.dx || 0,
    dy: data.dy || 0,
    dir: data.dir || null,
    fire: !!data.fire,
    dt: data.dt || 16,
    x: data.x,
    y: data.y,
  };
}
