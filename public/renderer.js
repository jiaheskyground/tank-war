import { TILE_SIZE, MAP_COLS, MAP_ROWS, TANK_SIZE, BULLET_SIZE, CANVAS_W, CANVAS_H } from '/shared/constants.js';

// Canvas setup
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// DPR-aware canvas resize — call on init, resize, orientation change
// All drawing uses logical coords (0..800, 0..640); setTransform scales to physical pixels.
export function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(CANVAS_W * dpr);
  canvas.height = Math.round(CANVAS_H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ---------- Sound Engine ----------
let audioCtx = null;

export function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
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

export function sfxFire()  { playBeep(600, 0.08, 'square', 0.06); setTimeout(() => playBeep(300, 0.06, 'square', 0.04), 40); }
export function sfxHit()   { playBeep(120, 0.15, 'sawtooth', 0.1); playBeep(80, 0.2, 'triangle', 0.08); }
export function sfxExplode(){ playBeep(60, 0.3, 'sawtooth', 0.12); playBeep(40, 0.4, 'triangle', 0.1); }
export function sfxDestroy(){ playBeep(200, 0.1, 'square', 0.06); playBeep(100, 0.2, 'sawtooth', 0.08); }

// ---------- Rendering ----------
export function clearCanvas() {
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
}

export function applyShake(shakeTimer) {
  if (shakeTimer > 0) {
    const sx = (Math.random() - 0.5) * 6 * (shakeTimer / 18);
    const sy = (Math.random() - 0.5) * 6 * (shakeTimer / 18);
    ctx.save();
    ctx.translate(sx, sy);
  }
}

export function clearShake(shakeTimer) {
  if (shakeTimer > 0) {
    ctx.restore();
  }
}

export function drawMap(map) {
  for (let row = 0; row < MAP_ROWS; row++) {
    for (let col = 0; col < MAP_COLS; col++) {
      const x = col * TILE_SIZE;
      const y = row * TILE_SIZE;
      const tile = map[row][col];

      switch (tile) {
        case 1: // BRICK
          ctx.fillStyle = '#b5651d';
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          ctx.fillStyle = '#8b4513';
          ctx.fillRect(x, y, TILE_SIZE - 1, 1);
          ctx.fillRect(x, y + TILE_SIZE / 2, TILE_SIZE, 1);
          ctx.fillRect(x + TILE_SIZE / 2, y, 1, TILE_SIZE / 2);
          ctx.fillRect(x, y + TILE_SIZE / 2, 1, TILE_SIZE / 2);
          ctx.fillRect(x + TILE_SIZE / 2, y + TILE_SIZE / 2, 1, TILE_SIZE / 2);
          break;
        case 2: // STEEL
          ctx.fillStyle = '#888';
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          ctx.fillStyle = '#aaa';
          ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          ctx.fillStyle = '#666';
          ctx.fillRect(x + 4, y + 4, TILE_SIZE - 8, TILE_SIZE - 8);
          break;
        case 4: // WATER
          ctx.fillStyle = '#1a3a6a';
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
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

export function drawGrass(map) {
  for (let row = 0; row < MAP_ROWS; row++) {
    for (let col = 0; col < MAP_COLS; col++) {
      if (map[row][col] !== 3) continue; // GRASS = 3
      const x = col * TILE_SIZE;
      const y = row * TILE_SIZE;
      ctx.fillStyle = '#2d5a1e';
      ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
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

export function drawTank(x, y, dir, color, invincible = false) {
  if (invincible && Math.floor(Date.now() / 100) % 2 === 0) return;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(dir.angle || 0);

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
  ctx.fillStyle = color;
  ctx.fillRect(-half + 3, -half + 8, half * 2 - 6, half * 2 - 16);

  // Turret base
  ctx.fillStyle = color;
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

export function drawBullet(x, y, dir, isPlayer) {
  ctx.fillStyle = isPlayer ? '#ff0' : '#f66';
  ctx.shadowColor = isPlayer ? '#ff0' : '#f66';
  ctx.shadowBlur = 4;
  ctx.fillRect(x - BULLET_SIZE / 2, y - BULLET_SIZE / 2, BULLET_SIZE, BULLET_SIZE);
  ctx.shadowBlur = 0;

  // Trail
  ctx.fillStyle = isPlayer ? 'rgba(255,255,0,0.4)' : 'rgba(255,100,100,0.4)';
  ctx.fillRect(
    x - dir.x * 4 - BULLET_SIZE / 2,
    y - dir.y * 4 - BULLET_SIZE / 2,
    BULLET_SIZE, BULLET_SIZE
  );
}

export function drawParticles(particles) {
  for (const p of particles) {
    const alpha = p.life / p.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

export function drawShield(x, y) {
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, TANK_SIZE / 2 + 3, 0, Math.PI * 2);
  ctx.stroke();
}

// ---------- Particle Helpers ----------
export function spawnExplosion(particles, x, y, color = '#f80') {
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

export function spawnBrickChunks(particles, x, y) {
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

export function updateParticles(particles) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life--;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

export { ctx, canvas };
