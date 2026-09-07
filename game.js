'use strict';

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const W = 800;
const H = 600;

// ── Input ─────────────────────────────────────────────────────────────────────
const keys = {};
const justPressed = {};

window.addEventListener('keydown', (e) => {
  if (!keys[e.code]) justPressed[e.code] = true;
  keys[e.code] = true;
});

window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});

function pressed(code) {
  const val = justPressed[code];
  justPressed[code] = false;
  return val;
}

// ── Utils ─────────────────────────────────────────────────────────────────────
const wrap  = (v, max) => ((v % max) + max) % max;
const dist  = (a, b)   => Math.hypot(a.x - b.x, a.y - b.y);
const rand  = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));

// ── Bullet ────────────────────────────────────────────────────────────────────
class Bullet {
  constructor(x, y, angle) {
    this.x = x;
    this.y = y;
    const SPEED = 520;
    this.vx = Math.cos(angle) * SPEED;
    this.vy = Math.sin(angle) * SPEED;
    this.ttl  = 1.1;
    this.radius = 2;
    this.dead = false;
  }

  update(dt) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Asteroid ──────────────────────────────────────────────────────────────────
const RADII  = [0, 16, 30, 50];   // por tamaño 1, 2, 3
const SPEEDS = [0, 85, 55, 32];   // velocidad base por tamaño
const POINTS = [0, 100, 50, 20];  // puntos por tamaño

// Formas fijas para asteroides grandes (tamaño 3): vértices normalizados
// (offset desde el centro, en fracción del radio) siguiendo el contorno en orden.
const LARGE_ASTEROID_SHAPES = [
  [
    [-0.122, -0.956],
    [-0.820, -0.572],
    [-0.971,  0.020],
    [-0.663,  0.578],
    [ 0.005,  0.907],
    [ 0.238,  0.527],
    [ 0.714,  0.544],
    [ 0.871, -0.041],
    [ 0.324, -0.216],
    [ 0.423, -0.791],
  ],
];

class Asteroid {
  constructor(x, y, size = 3) {
    this.x    = x;
    this.y    = y;
    this.size = size;
    this.radius = RADII[size];
    this.dead = false;

    const angle = rand(0, Math.PI * 2);
    const speed = SPEEDS[size] + rand(-15, 15);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.rotSpeed = rand(-1.2, 1.2);
    this.rot = rand(0, Math.PI * 2);

    // Polígono: los asteroides grandes eligen entre las formas fijas definidas
    // arriba; el resto (y los grandes si no hay formas definidas) usan una
    // forma irregular generada al azar.
    if (size === 3 && LARGE_ASTEROID_SHAPES.length > 0) {
      const shape = LARGE_ASTEROID_SHAPES[randInt(0, LARGE_ASTEROID_SHAPES.length - 1)];
      this.verts = shape.map(([nx, ny]) => [nx * this.radius, ny * this.radius]);
    } else {
      const n = randInt(8, 13);
      this.verts = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const r = this.radius * rand(0.6, 1.0);
        this.verts.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
    }
  }

  update(dt) {
    this.x   = wrap(this.x + this.vx * dt, W);
    this.y   = wrap(this.y + this.vy * dt, H);
    this.rot += this.rotSpeed * dt;
  }

  split() {
    if (this.size <= 1) return [];
    return [
      new Asteroid(this.x, this.y, this.size - 1),
      new Asteroid(this.x, this.y, this.size - 1),
    ];
  }

  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    ctx.moveTo(this.verts[0][0], this.verts[0][1]);
    for (let i = 1; i < this.verts.length; i++)
      ctx.lineTo(this.verts[i][0], this.verts[i][1]);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

// ── Ship ──────────────────────────────────────────────────────────────────────
class Ship {
  constructor() {
    this.tripleShot  = 0; // segundos restantes de disparo triple; no se reinicia en reset()
    this.shield      = 0; // segundos restantes de escudo; no se reinicia en reset()
    this.slowMotion  = 0; // segundos restantes de cámara lenta; no se reinicia en reset()
    this.hyperThrust = 0; // segundos restantes de hiperpropulsión; no se reinicia en reset()
    this.novaBombs   = 0; // Bombas Nova en reserva; no se reinicia en reset() ni al morir (es inventario, no un efecto activo)
    this.reset();
  }

  reset() {
    this.x      = W / 2;
    this.y      = H / 2;
    this.angle  = -Math.PI / 2;
    this.vx     = 0;
    this.vy     = 0;
    this.radius = 12;
    this.thrusting     = false;
    this.invincible    = 3;
    this.shootCooldown = 0;
    this.dead          = false;
  }

  update(dt) {
    if (this.dead) return;
    if (this.invincible    > 0) this.invincible    -= dt;
    if (this.shootCooldown > 0) this.shootCooldown -= dt;
    if (this.tripleShot    > 0) this.tripleShot    -= dt;
    if (this.shield        > 0) this.shield        -= dt;
    if (this.slowMotion    > 0) this.slowMotion    -= dt;
    if (this.hyperThrust   > 0) this.hyperThrust   -= dt;

    const ROT = 3.5; // rad/s: la rotación no cambia con la hiperpropulsión, solo el empuje
    // Hiperpropulsión: empuje y velocidad máxima muy por encima de lo normal
    // (menos fricción sostiene una velocidad terminal más alta) para esquivar con precisión.
    const THRUST = this.hyperThrust > 0 ? 260 * HYPER_THRUST_MULT : 260; // px/s²
    const DRAG   = this.hyperThrust > 0 ? HYPER_DRAG : 0.987;

    if (keys['ArrowLeft'])  this.angle -= ROT * dt;
    if (keys['ArrowRight']) this.angle += ROT * dt;

    this.thrusting = !!keys['ArrowUp'];
    if (this.thrusting) {
      this.vx += Math.cos(this.angle) * THRUST * dt;
      this.vy += Math.sin(this.angle) * THRUST * dt;
    }

    this.vx *= DRAG;
    this.vy *= DRAG;
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
  }

  tryShoot() {
    if (this.shootCooldown > 0 || this.dead) return [];
    this.shootCooldown = 0.2;
    const NOSE = 21;
    const ox = this.x + Math.cos(this.angle) * NOSE;
    const oy = this.y + Math.sin(this.angle) * NOSE;

    if (this.tripleShot > 0) {
      const SPREAD = 0.22; // ~13° entre cada bala del abanico
      return [
        new Bullet(ox, oy, this.angle - SPREAD),
        new Bullet(ox, oy, this.angle),
        new Bullet(ox, oy, this.angle + SPREAD),
      ];
    }

    return [new Bullet(ox, oy, this.angle)];
  }

  draw() {
    if (this.dead) return;
    // Parpadeo durante invencibilidad de reaparición
    if (this.invincible > 0 && Math.floor(this.invincible * 8) % 2 === 0) return;

    // Escudo temporal: anillo de energía pulsante alrededor de la nave
    if (this.shield > 0) {
      ctx.save();
      ctx.translate(this.x, this.y);
      const pulse = 1 + Math.sin(this.shield * 10) * 0.05;
      ctx.beginPath();
      ctx.arc(0, 0, (this.radius + 9) * pulse, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(93, 203, 255, 0.8)';
      ctx.lineWidth   = 2;
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';

    // Silueta clásica: triángulo con muesca trasera
    ctx.beginPath();
    ctx.moveTo( 20,  0);   // nariz
    ctx.lineTo(-12, -9);   // ala izquierda
    ctx.lineTo( -7,  0);   // muesca trasera
    ctx.lineTo(-12,  9);   // ala derecha
    ctx.closePath();
    ctx.stroke();

    // Llama del propulsor: más larga y de color eléctrico durante la hiperpropulsión
    if (this.thrusting && Math.random() > 0.35) {
      const boosting = this.hyperThrust > 0;
      const flameLen = boosting ? rand(16, 28) : rand(6, 14);
      ctx.beginPath();
      ctx.moveTo(-8, -4);
      ctx.lineTo(-8 - flameLen, 0);
      ctx.lineTo(-8,  4);
      ctx.strokeStyle = boosting ? 'rgba(198, 255, 77, 0.9)' : 'rgba(255, 130, 0, 0.85)';
      ctx.stroke();
      if (boosting) {
        // Segunda llama, más corta y fina: refuerza la sensación de empuje extra
        ctx.beginPath();
        ctx.moveTo(-8, -2);
        ctx.lineTo(-8 - flameLen * 0.6, 0);
        ctx.lineTo(-8,  2);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    ctx.restore();
  }
}

// ── Partículas (explosión) ────────────────────────────────────────────────────
class Particle {
  constructor(x, y) {
    this.x  = x;
    this.y  = y;
    const angle = rand(0, Math.PI * 2);
    const speed = rand(30, 130);
    this.vx   = Math.cos(angle) * speed;
    this.vy   = Math.sin(angle) * speed;
    this.life = rand(0.4, 1.1);
    this.ttl  = this.life;
    this.dead = false;
  }

  update(dt) {
    this.x  += this.vx * dt;
    this.y  += this.vy * dt;
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    const alpha = this.ttl / this.life;
    ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x - this.vx * 0.05, this.y - this.vy * 0.05);
    ctx.stroke();
  }
}

// ── Power-ups: Disparo Triple, Escudo Temporal, Cámara Lenta, Bomba Nova e Hiperpropulsión ──
const POWERUP_TTL          = 12;   // segundos en pantalla antes de desaparecer si no se recoge
const DROP_CHANCE          = 0.18; // prob. de soltar un power-up al destruir un asteroide (antes de forzarlo)
const TRIPLE_SHOT_DURATION = 15;   // segundos que dura el disparo triple tras recogerlo
const SHIELD_DURATION      = 5;    // segundos que dura el escudo tras recogerlo (o hasta absorber un golpe)
const SLOW_MOTION_DURATION = 6;    // segundos que dura la cámara lenta tras recogerla
const SLOW_MOTION_FACTOR   = 0.5;  // multiplicador de velocidad de los asteroides durante la cámara lenta
const HYPER_DURATION       = 8;    // segundos que dura la hiperpropulsión tras recogerla
const HYPER_THRUST_MULT    = 2.3;  // multiplicador de aceleración durante la hiperpropulsión
const HYPER_DRAG           = 0.996; // fricción reducida durante la hiperpropulsión: sube la velocidad máxima alcanzable
const NOVA_DROP_CHANCE     = 0.035; // prob. de soltar la Bomba Nova al destruir un asteroide; sorteo aparte del trío de abajo, y más bajo porque es un ítem escaso
const NOVA_MAX_HELD        = 1;    // de un solo uso: no se puede llevar más de una en reserva a la vez

const POWERUP_TYPES = ['triple', 'shield', 'slowmo', 'hyper'];

// Excluye `exclude` (el tipo del power-up anterior) del sorteo para que nunca
// se repita el mismo tipo dos veces seguidas, manteniendo el resto al azar.
function randomPowerUpType(exclude = null) {
  const options = exclude ? POWERUP_TYPES.filter(t => t !== exclude) : POWERUP_TYPES;
  return options[randInt(0, options.length - 1)];
}

class PowerUp {
  constructor(x, y, type = 'triple') {
    this.x      = x;
    this.y      = y;
    this.type   = type; // 'triple' | 'shield' | 'slowmo' | 'nova' | 'hyper'
    this.radius = 14;
    this.rot    = 0;
    this.pulse  = rand(0, Math.PI * 2);
    this.ttl    = POWERUP_TTL;
    this.dead   = false;
  }

  update(dt) {
    this.rot   += 1.4 * dt;
    this.pulse += dt;
    this.ttl   -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    const scale = 1 + Math.sin(this.pulse * 5) * 0.12;
    const color = this.type === 'shield' ? '#5ecbff'
                : this.type === 'slowmo' ? '#b388ff'
                : this.type === 'nova'   ? '#ff8a3d'
                : this.type === 'hyper'  ? '#c6ff4d'
                : '#fff';
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(scale, scale);
    ctx.strokeStyle = color;
    ctx.fillStyle   = color;
    ctx.lineWidth   = 1.5;

    // Círculo contenedor
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.rotate(this.rot);
    if (this.type === 'shield') {
      // Icono: escudo dentro del círculo
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(6, -4);
      ctx.lineTo(6,  3);
      ctx.quadraticCurveTo(6, 7, 0, 9);
      ctx.quadraticCurveTo(-6, 7, -6, 3);
      ctx.lineTo(-6, -4);
      ctx.closePath();
      ctx.stroke();
    } else if (this.type === 'slowmo') {
      // Icono: reloj de arena, sugiere el paso lento del tiempo
      ctx.beginPath();
      ctx.moveTo(-6, -7);
      ctx.lineTo(6, -7);
      ctx.lineTo(-6, 7);
      ctx.lineTo(6, 7);
      ctx.closePath();
      ctx.stroke();
    } else if (this.type === 'nova') {
      // Icono: rayos en estallido que sugieren la onda expansiva de la bomba
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 3, Math.sin(a) * 3);
        ctx.lineTo(Math.cos(a) * 8, Math.sin(a) * 8);
        ctx.stroke();
      }
    } else if (this.type === 'hyper') {
      // Icono: doble flecha de avance rápido, sugiere velocidad extrema
      ctx.beginPath();
      ctx.moveTo(-6, -7);
      ctx.lineTo( 1,  0);
      ctx.lineTo(-6,  7);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-1, -7);
      ctx.lineTo( 6,  0);
      ctx.lineTo(-1,  7);
      ctx.stroke();
    } else {
      // Icono: tres marcas en abanico que sugieren el disparo triple
      for (const a of [-0.35, 0, 0.35]) {
        ctx.save();
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(0, -7);
        ctx.lineTo(0, 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, -7, 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    ctx.restore();
  }
}

// ── Estado del juego ──────────────────────────────────────────────────────────
let ship, bullets, asteroids, particles, powerUps;
let score, lives, level;
let state;      // 'playing' | 'dead' | 'gameover'
let deadTimer;
let powerUpSpawnedThisLevel; // true en cuanto el power-up (disparo triple, escudo o cámara lenta) ya apareció en el nivel actual
let lastPowerUpType; // tipo del último power-up generado; se excluye del siguiente sorteo para no repetir
let novaFlashTimer; // segundos restantes del destello de pantalla al detonar la Bomba Nova

function spawnAsteroids(count) {
  const SAFE_DIST = 130;
  for (let i = 0; i < count; i++) {
    let x, y;
    do {
      x = rand(0, W);
      y = rand(0, H);
    } while (Math.hypot(x - W / 2, y - H / 2) < SAFE_DIST);
    asteroids.push(new Asteroid(x, y, 3));
  }
}

function initGame() {
  ship          = new Ship();
  bullets   = [];
  asteroids = [];
  particles = [];
  powerUps  = [];
  score  = 0;
  lives  = 3;
  level  = 1;
  state  = 'playing';
  powerUpSpawnedThisLevel = false;
  lastPowerUpType = null;
  novaFlashTimer = 0;
  spawnAsteroids(4);
}

function nextLevel() {
  level++;
  bullets   = [];
  particles = [];
  // powerUps NO se reinicia aquí: si el power-up del nivel anterior no se
  // recogió a tiempo, debe seguir disponible en el nivel siguiente.
  // powerUpSpawnedThisLevel sí se reinicia: cada nivel nuevo vuelve a
  // garantizar al menos una aparición propia.
  powerUpSpawnedThisLevel = false;
  ship.reset();
  spawnAsteroids(3 + level);
}

function explode(x, y, count = 8) {
  for (let i = 0; i < count; i++) particles.push(new Particle(x, y));
}

function killShip() {
  explode(ship.x, ship.y, 14);
  ship.dead = true;
  ship.tripleShot  = 0; // morir cancela el disparo triple: se reaparece con disparo normal
  ship.shield      = 0; // morir cancela el escudo: se reaparece sin escudo
  ship.slowMotion  = 0; // morir cancela la cámara lenta: se reaparece a velocidad normal
  ship.hyperThrust = 0; // morir cancela la hiperpropulsión: se reaparece con empuje normal
  lives--;
  if (lives <= 0) {
    state = 'gameover';
  } else {
    state     = 'dead';
    deadTimer = 2;
  }
}

// ── Update ────────────────────────────────────────────────────────────────────
function update(dt) {
  if (novaFlashTimer > 0) novaFlashTimer = Math.max(0, novaFlashTimer - dt);

  if (state === 'gameover') {
    if (pressed('Space')) initGame();
    particles.forEach(p => p.update(dt));
    particles = particles.filter(p => !p.dead);
    return;
  }

  if (state === 'dead') {
    deadTimer -= dt;
    particles.forEach(p => p.update(dt));
    particles = particles.filter(p => !p.dead);
    const asteroidDt = ship.slowMotion > 0 ? dt * SLOW_MOTION_FACTOR : dt;
    asteroids.forEach(a => a.update(asteroidDt));
    powerUps.forEach(p => p.update(dt));
    powerUps = powerUps.filter(p => !p.dead);
    if (deadTimer <= 0) { state = 'playing'; ship.reset(); }
    return;
  }

  // Disparar
  if (pressed('Space')) {
    bullets.push(...ship.tryShoot());
  }

  // Bomba Nova: un solo uso, destruye de golpe todos los asteroides visibles
  // en pantalla (sin generar fragmentos, a diferencia de un impacto normal).
  if (pressed('KeyB') && ship.novaBombs > 0 && !ship.dead) {
    ship.novaBombs--;
    for (const a of asteroids) {
      score += POINTS[a.size];
      explode(a.x, a.y, a.size * 6);
    }
    asteroids = [];
    novaFlashTimer = 0.25;
  }

  ship.update(dt);
  bullets.forEach(b => b.update(dt));
  // Cámara lenta: los asteroides se mueven a mitad de velocidad, la nave no se ve afectada.
  const asteroidDt = ship.slowMotion > 0 ? dt * SLOW_MOTION_FACTOR : dt;
  asteroids.forEach(a => a.update(asteroidDt));
  particles.forEach(p => p.update(dt));
  powerUps.forEach(p => p.update(dt));

  bullets   = bullets.filter(b => !b.dead);
  particles = particles.filter(p => !p.dead);
  powerUps  = powerUps.filter(p => !p.dead);

  // Bala vs asteroide
  const newAsteroids = [];
  let lastKillPos = null;
  for (const b of bullets) {
    for (const a of asteroids) {
      if (!a.dead && !b.dead && dist(b, a) < a.radius) {
        b.dead = true;
        a.dead = true;
        score += POINTS[a.size];
        explode(a.x, a.y, a.size * 5);
        newAsteroids.push(...a.split());
        lastKillPos = { x: a.x, y: a.y };

        // Power-up (disparo triple, escudo o cámara lenta, al azar): intento
        // aleatorio por cada asteroide destruido (como mucho una vez por nivel).
        if (!powerUpSpawnedThisLevel && Math.random() < DROP_CHANCE) {
          lastPowerUpType = randomPowerUpType(lastPowerUpType);
          powerUps.push(new PowerUp(a.x, a.y, lastPowerUpType));
          powerUpSpawnedThisLevel = true;
        }

        // Bomba Nova: sorteo aparte y más escaso, limitado a como mucho una en
        // reserva y una en pantalla a la vez (ítem de un solo uso).
        if (ship.novaBombs < NOVA_MAX_HELD && !powerUps.some(p => p.type === 'nova')
            && Math.random() < NOVA_DROP_CHANCE) {
          powerUps.push(new PowerUp(a.x, a.y, 'nova'));
        }
      }
    }
  }
  asteroids = asteroids.filter(a => !a.dead).concat(newAsteroids);
  bullets   = bullets.filter(b => !b.dead);

  // Si el nivel se completó sin que el azar lo hiciera aparecer, se fuerza en
  // la posición del último asteroide destruido: garantiza al menos una
  // aparición por nivel.
  if (!powerUpSpawnedThisLevel && asteroids.length === 0 && lastKillPos) {
    lastPowerUpType = randomPowerUpType(lastPowerUpType);
    powerUps.push(new PowerUp(lastKillPos.x, lastKillPos.y, lastPowerUpType));
    powerUpSpawnedThisLevel = true;
  }

  // Nave vs asteroide
  if (ship.invincible <= 0) {
    for (const a of asteroids) {
      if (dist(ship, a) < ship.radius + a.radius * 0.82) {
        if (ship.shield > 0) {
          // El escudo absorbe el golpe: se consume y da una breve gracia
          // para no volver a chocar mientras sigue solapada con el asteroide.
          ship.shield = 0;
          ship.invincible = 1;
          explode(ship.x, ship.y, 10);
        } else {
          killShip();
        }
        break;
      }
    }
  }

  // Nave vs power-up
  for (const p of powerUps) {
    if (!p.dead && dist(ship, p) < ship.radius + p.radius) {
      p.dead = true;
      if (p.type === 'shield') {
        ship.shield = SHIELD_DURATION;
      } else if (p.type === 'slowmo') {
        ship.slowMotion = SLOW_MOTION_DURATION;
      } else if (p.type === 'nova') {
        ship.novaBombs = Math.min(ship.novaBombs + 1, NOVA_MAX_HELD);
      } else if (p.type === 'hyper') {
        ship.hyperThrust = HYPER_DURATION;
      } else {
        ship.tripleShot = TRIPLE_SHOT_DURATION;
      }
      explode(p.x, p.y, 10);
    }
  }
  powerUps = powerUps.filter(p => !p.dead);

  // Nivel completado
  if (asteroids.length === 0) nextLevel();
}

// ── Draw ──────────────────────────────────────────────────────────────────────
function drawLifeIcon(x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 2);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth   = 1.2;
  ctx.lineJoin    = 'round';
  ctx.beginPath();
  ctx.moveTo( 9,  0);
  ctx.lineTo(-6, -5);
  ctx.lineTo(-3,  0);
  ctx.lineTo(-6,  5);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawHUD() {
  ctx.fillStyle = '#fff';
  ctx.font = '15px monospace';

  ctx.textAlign = 'left';
  ctx.fillText(`SCORE  ${score}`, 14, 26);

  ctx.textAlign = 'center';
  ctx.fillText(`NIVEL ${level}`, W / 2, 26);

  for (let i = 0; i < lives; i++)
    drawLifeIcon(W - 16 - i * 22, 18);

  // Indicadores de power-ups activos, apilados verticalmente
  const indicators = [];
  if (ship.tripleShot > 0)
    indicators.push({ text: `DISPARO TRIPLE  ${ship.tripleShot.toFixed(1)}s`, color: 'rgba(255,255,255,0.85)' });
  if (ship.shield > 0)
    indicators.push({ text: `ESCUDO  ${ship.shield.toFixed(1)}s`, color: 'rgba(93,203,255,0.85)' });
  if (ship.slowMotion > 0)
    indicators.push({ text: `CÁMARA LENTA  ${ship.slowMotion.toFixed(1)}s`, color: 'rgba(179,136,255,0.85)' });
  if (ship.hyperThrust > 0)
    indicators.push({ text: `HIPERPROPULSIÓN  ${ship.hyperThrust.toFixed(1)}s`, color: 'rgba(198,255,77,0.9)' });
  if (ship.novaBombs > 0)
    indicators.push({ text: `BOMBA NOVA LISTA — B`, color: 'rgba(255,138,61,0.9)' });

  ctx.textAlign = 'center';
  ctx.font      = '13px monospace';
  indicators.forEach((ind, i) => {
    ctx.fillStyle = ind.color;
    ctx.fillText(ind.text, W / 2, 46 + i * 18);
  });
}

function drawOverlay(title, sub) {
  ctx.textAlign   = 'center';
  ctx.fillStyle   = '#fff';
  ctx.font        = 'bold 46px monospace';
  ctx.fillText(title, W / 2, H / 2 - 18);
  ctx.font        = '18px monospace';
  ctx.fillStyle   = 'rgba(255,255,255,0.65)';
  ctx.fillText(sub, W / 2, H / 2 + 22);
}

function draw() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  particles.forEach(p => p.draw());
  asteroids.forEach(a => a.draw());
  powerUps.forEach(p => p.draw());
  bullets.forEach(b => b.draw());
  ship.draw();

  // Tinte sutil de pantalla mientras la cámara lenta está activa
  if (ship.slowMotion > 0) {
    ctx.fillStyle = 'rgba(140, 100, 255, 0.06)';
    ctx.fillRect(0, 0, W, H);
  }

  // Destello breve al detonar la Bomba Nova, se atenúa hasta desvanecerse
  if (novaFlashTimer > 0) {
    ctx.fillStyle = `rgba(255, 170, 80, ${(novaFlashTimer / 0.25 * 0.5).toFixed(2)})`;
    ctx.fillRect(0, 0, W, H);
  }

  drawHUD();

  if (state === 'gameover')
    drawOverlay('GAME OVER', `PUNTAJE: ${score}   —   ESPACIO PARA REINICIAR`);
}

// ── Loop principal ────────────────────────────────────────────────────────────
let lastTime = null;

function loop(ts) {
  const dt = lastTime === null ? 0 : Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

initGame();
requestAnimationFrame(loop);
