// BREACH — original browser-local simulation. No DOM or graphics dependencies.
const TAU = Math.PI * 2;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const copy = (value) => JSON.parse(JSON.stringify(value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const finite = (value, lo, hi) => typeof value === 'number' && Number.isFinite(value) && value >= lo && value <= hi;

function createLevel() {
  const width = 31, height = 29;
  const cells = Array.from({ length: height }, () => Array(width).fill('#'));
  const room = (x1, z1, x2, z2) => {
    for (let z = z1; z <= z2; z++) for (let x = x1; x <= x2; x++) cells[z][x] = '.';
  };
  room(2, 22, 9, 26);                         // Arrival / safe teaching space.
  room(5, 19, 6, 21);
  room(2, 13, 14, 18);                        // Concourse.
  room(5, 10, 6, 12);
  room(2, 3, 12, 9);                         // Auxiliary generator.
  room(13, 6, 17, 6);                        // Powered northern airlock.
  room(18, 3, 28, 11);                       // Research lab and access key.
  room(22, 12, 24, 14);
  room(18, 15, 28, 21);                      // Quarantine hall.
  room(15, 16, 17, 16);                      // Powered return shortcut.
  room(23, 22, 23, 23);                      // Keyed extraction gate.
  room(18, 24, 28, 26);
  room(12, 19, 12, 21);                      // Hidden maintenance cache.
  room(11, 22, 15, 26);
  // Freestanding pillars and machinery create sightlines and cover.
  for (const [x, z] of [[7, 15], [11, 16], [6, 5], [7, 5], [6, 6], [7, 6], [21, 6], [22, 6], [25, 8], [21, 18], [25, 18]]) cells[z][x] = '#';
  const enemy = (id, type, x, z) => ({ id, type, x: x + .5, z: z + .5, health: type === 'brute' ? 145 : type === 'spitter' ? 70 : 52, maxHealth: type === 'brute' ? 145 : type === 'spitter' ? 70 : 52, alive: true });
  const pickup = (id, type, x, z, amount = 1) => ({ id, type, x: x + .5, z: z + .5, amount });
  return {
    id: 'blacksite-07-v1', name: 'Blacksite 07', width, height,
    grid: cells.map(row => row.join('')),
    spawn: { x: 5.5, z: 25.5, angle: 0 },
    doors: [
      { id: 'arrival', x: 5.5, z: 20.5, axis: 'x', requires: null, open: false },
      { id: 'arrival-side', x: 6.5, z: 20.5, axis: 'x', requires: null, open: false, paired: 'arrival' },
      { id: 'lab-airlock', x: 15.5, z: 6.5, axis: 'z', requires: 'power', open: false },
      { id: 'return-airlock', x: 16.5, z: 16.5, axis: 'z', requires: 'power', open: false },
      { id: 'security', x: 23.5, z: 23.5, axis: 'x', requires: 'key', open: false },
      { id: 'maintenance', x: 12.5, z: 20.5, axis: 'x', requires: null, open: false, secret: true },
    ],
    interactables: [
      { id: 'aux-power', type: 'power', x: 10.5, z: 4.5, label: 'Restore auxiliary power' },
      { id: 'cache-panel', type: 'secret', x: 12.5, z: 19.5, label: 'Inspect maintenance panel' },
      { id: 'extraction', type: 'exit', x: 26.5, z: 25.5, label: 'Signal extraction' },
    ],
    pickups: [
      pickup('arrival-ammo', 'ammo', 5, 23, 28),
      pickup('arrival-armor', 'armor', 8, 24, 25),
      pickup('concourse-health', 'health', 3, 16, 35),
      pickup('concourse-ammo', 'ammo', 9, 17, 32),
      pickup('pump-shotgun', 'shotgun', 4, 8, 12),
      pickup('generator-health', 'health', 11, 8, 40),
      pickup('generator-ammo', 'ammo', 3, 4, 36),
      pickup('access-key', 'key', 26, 4),
      pickup('lab-shells', 'shells', 19, 4, 16),
      pickup('lab-health', 'health', 27, 10, 40),
      pickup('lab-armor', 'armor', 19, 10, 35),
      pickup('quarantine-shells', 'shells', 19, 20, 14),
      pickup('quarantine-ammo', 'ammo', 27, 16, 32),
      pickup('quarantine-health', 'health', 26, 20, 45),
      pickup('cache-armor', 'armor', 13, 24, 75),
      pickup('cache-shells', 'shells', 12, 23, 20),
      pickup('cache-health', 'health', 14, 25, 60),
    ],
    enemies: [
      enemy('c1', 'runner', 4, 16), enemy('c2', 'runner', 12, 14), enemy('c3', 'spitter', 10, 13),
      enemy('g1', 'runner', 3, 7), enemy('g2', 'spitter', 10, 7), enemy('g3', 'runner', 11, 3),
      enemy('l1', 'runner', 19, 7), enemy('l2', 'spitter', 26, 5), enemy('l3', 'runner', 24, 10), enemy('l4', 'brute', 27, 8),
      enemy('q1', 'runner', 20, 16), enemy('q2', 'spitter', 27, 18), enemy('q3', 'brute', 22, 20), enemy('q4', 'runner', 19, 20),
    ],
    zones: [
      { name: 'Arrival bay', x1: 2, x2: 10, z1: 21, z2: 27 },
      { name: 'Concourse', x1: 2, x2: 18, z1: 12, z2: 22 },
      { name: 'Auxiliary generator', x1: 2, x2: 18, z1: 3, z2: 12 },
      { name: 'Research laboratory', x1: 18, x2: 29, z1: 3, z2: 15 },
      { name: 'Quarantine hall', x1: 18, x2: 29, z1: 15, z2: 24 },
      { name: 'Extraction bay', x1: 18, x2: 29, z1: 24, z2: 27 },
      { name: 'Maintenance cache', x1: 11, x2: 16, z1: 22, z2: 27 },
    ],
  };
}

export const LEVEL = createLevel();
const DIFFICULTY = {
  relaxed: { health: .8, damage: .55, speed: .85 },
  standard: { health: 1, damage: 1, speed: 1 },
  hard: { health: 1.2, damage: 1.35, speed: 1.1 },
};

export class Game {
  constructor(options = {}) {
    this.level = LEVEL;
    this.options = { difficulty: 'standard', guidance: 'simple', aimAssist: true, seed: 1, ...options };
    this._events = [];
    this._checkpoint = null;
    this._reset();
  }

  _reset() {
    if (!DIFFICULTY[this.options.difficulty]) this.options.difficulty = 'standard';
    this._difficulty = DIFFICULTY[this.options.difficulty];
    this._runDifficulty = this.options.difficulty;
    this._runSeed = (Number(this.options.seed) >>> 0) || 1;
    this._random = this._runSeed;
    this._serial = 0;
    this._shotCooldown = 0;
    this._reserveTimer = 0;
    this._messageCooldown = 0;
    this._pathTimer = 0;
    this._distances = null;
    this._events = [];
    this._checkpoint = null;
    this.state = {
      status: 'ready',
      player: { ...copy(LEVEL.spawn), health: 100, armor: 20, ammo: { pistol: 40, shells: 0 }, weapon: 'pistol', hasShotgun: false, key: false },
      enemies: LEVEL.enemies.map(e => ({ ...e, health: Math.round(e.health * this._difficulty.health), maxHealth: Math.round(e.maxHealth * this._difficulty.health), active: false, angle: Math.PI, attackCooldown: 1, hitTimer: 0, pathTimer: 0 })),
      pickups: LEVEL.pickups.map(p => ({ ...p, collected: false })),
      doors: copy(LEVEL.doors), interactables: LEVEL.interactables.map(i => ({ ...i, used: false })),
      projectiles: [], effects: [], power: false, secretFound: false,
      checkpoint: false, time: 0, kills: 0, shots: 0, hits: 0,
      tutorial: { moved: false, fired: false, interacted: false, weaponSwitched: false },
    };
  }

  start() {
    if (this.state.status === 'ready') {
      this.state.status = 'playing';
      this._events.push({ type: 'message', text: 'Blacksite 07. Find the auxiliary generator.' });
    }
  }
  pause() { if (this.state.status === 'playing') this.state.status = 'paused'; }
  resume() { if (this.state.status === 'paused' || this.state.status === 'ready') this.state.status = 'playing'; }
  restart() { this._reset(); this.start(); }

  _rng() {
    this._random = (Math.imul(this._random, 1664525) + 1013904223) >>> 0;
    return this._random / 4294967296;
  }

  _wall(x, z) {
    const cx = Math.floor(x), cz = Math.floor(z);
    if (cx < 0 || cz < 0 || cx >= LEVEL.width || cz >= LEVEL.height || LEVEL.grid[cz][cx] === '#') return true;
    return this.state.doors.some(d => !d.open && Math.floor(d.x) === cx && Math.floor(d.z) === cz);
  }

  _clearCircle(x, z, radius) {
    for (const [dx, dz] of [[0, 0], [-radius, -radius], [-radius, radius], [radius, -radius], [radius, radius]]) if (this._wall(x + dx, z + dz)) return false;
    return true;
  }

  _move(entity, dx, dz, radius = .22) {
    // Small substeps prevent tunnelling through walls even after a dropped frame.
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / .12));
    for (let n = 0; n < steps; n++) {
      if (this._clearCircle(entity.x + dx / steps, entity.z, radius)) entity.x += dx / steps;
      if (this._clearCircle(entity.x, entity.z + dz / steps, radius)) entity.z += dz / steps;
    }
  }

  hasLineOfSight(x1, z1, x2, z2) {
    if (![x1, z1, x2, z2].every(Number.isFinite) || this._wall(x1, z1) || this._wall(x2, z2)) return false;
    let x = Math.floor(x1), z = Math.floor(z1);
    const targetX = Math.floor(x2), targetZ = Math.floor(z2);
    const dx = x2 - x1, dz = z2 - z1;
    const stepX = Math.sign(dx), stepZ = Math.sign(dz);
    const deltaX = dx ? Math.abs(1 / dx) : Infinity, deltaZ = dz ? Math.abs(1 / dz) : Infinity;
    let edgeX = dx ? ((stepX > 0 ? x + 1 : x) - x1) / dx : Infinity;
    let edgeZ = dz ? ((stepZ > 0 ? z + 1 : z) - z1) / dz : Infinity;
    // Traverse every crossed cell exactly. Sampling can miss narrow wall corners.
    while (x !== targetX || z !== targetZ) {
      if (Math.abs(edgeX - edgeZ) < 1e-10) {
        if (this._wall(x + stepX + .5, z + .5) || this._wall(x + .5, z + stepZ + .5)) return false;
        x += stepX; z += stepZ; edgeX += deltaX; edgeZ += deltaZ;
      } else if (edgeX < edgeZ) { x += stepX; edgeX += deltaX; }
      else { z += stepZ; edgeZ += deltaZ; }
      if (this._wall(x + .5, z + .5)) return false;
    }
    return true;
  }

  update(dt, input = {}) {
    if (this.state.status !== 'playing') return;
    if (!Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, .1);
    const state = this.state, player = state.player;
    state.time += dt;
    this._shotCooldown = Math.max(0, this._shotCooldown - dt);
    this._messageCooldown = Math.max(0, this._messageCooldown - dt);
    this._pathTimer -= dt;
    player.angle = ((player.angle + clamp(Number(input.turn) || 0, -Math.PI, Math.PI)) % TAU + TAU) % TAU;
    const forward = clamp(Number(input.forward) || 0, -1, 1), strafe = clamp(Number(input.strafe) || 0, -1, 1);
    const divisor = Math.max(1, Math.hypot(forward, strafe));
    const speed = 3.35 * dt / divisor;
    const beforeX = player.x, beforeZ = player.z;
    this._move(player, (Math.sin(player.angle) * forward + Math.cos(player.angle) * strafe) * speed,
      (-Math.cos(player.angle) * forward + Math.sin(player.angle) * strafe) * speed);
    if (Math.hypot(player.x - LEVEL.spawn.x, player.z - LEVEL.spawn.z) > .75) state.tutorial.moved = true;
    player.moving = Math.hypot(player.x - beforeX, player.z - beforeZ) > .0001;
    this._collectPickups();
    if (input.fire) this._fire();
    if (player.ammo.pistol === 0) {
      this._reserveTimer += dt;
      if (this._reserveTimer >= 1.7) {
        player.ammo.pistol = 1; this._reserveTimer = 0;
        this._events.push({ type: 'message', text: 'Emergency cell: one pistol round recovered.' });
      }
    } else this._reserveTimer = 0;
    if (this._pathTimer <= 0) { this._buildDistanceField(); this._pathTimer = .5; }
    this._updateEnemies(dt);
    this._updateProjectiles(dt);
    for (const effect of state.effects) effect.life -= dt;
    state.effects = state.effects.filter(e => e.life > 0);
  }

  _collectPickups() {
    const p = this.state.player;
    for (const item of this.state.pickups) {
      if (item.collected || distance(p, item) > .62 || !this.hasLineOfSight(p.x, p.z, item.x, item.z)) continue;
      if (item.type === 'health' && p.health >= 100 || item.type === 'armor' && p.armor >= 100) continue;
      item.collected = true;
      let text = '';
      if (item.type === 'ammo') { p.ammo.pistol += item.amount; text = `+${item.amount} pistol rounds`; }
      if (item.type === 'shells') { p.ammo.shells += item.amount; text = `+${item.amount} shotgun shells`; }
      if (item.type === 'health') { p.health = Math.min(100, p.health + item.amount); text = `Health restored`; }
      if (item.type === 'armor') { p.armor = Math.min(100, p.armor + item.amount); text = `Armor reinforced`; }
      if (item.type === 'shotgun') { p.hasShotgun = true; p.weapon = 'shotgun'; p.ammo.shells += item.amount; text = 'Scattergun acquired. Devastating at close range.'; }
      if (item.type === 'key') { p.key = true; text = 'Security key recovered. Reach the extraction gate.'; }
      this._events.push({ type: 'pickup', item: item.type, text });
    }
  }

  _fire() {
    if (this._shotCooldown > 0 || this.state.status !== 'playing') return;
    const p = this.state.player, weapon = p.weapon;
    const ammo = weapon === 'shotgun' ? 'shells' : 'pistol';
    if (p.ammo[ammo] <= 0) {
      this._shotCooldown = .25;
      if (this._messageCooldown <= 0) {
        this._events.push({ type: 'message', text: weapon === 'shotgun' ? 'No shells. Switch to your pistol.' : 'Cell empty. One emergency round recharges shortly.' });
        this._messageCooldown = 2;
      }
      return;
    }
    p.ammo[ammo]--; this.state.shots++; this.state.tutorial.fired = true;
    this._shotCooldown = weapon === 'shotgun' ? .72 : .27;
    let aim = p.angle;
    if (this.options.aimAssist) {
      const target = this.state.enemies.filter(e => e.alive && distance(p, e) < 16 && this.hasLineOfSight(p.x, p.z, e.x, e.z))
        .map(e => ({ enemy: e, angle: Math.atan2(e.x - p.x, -(e.z - p.z)) }))
        .filter(e => Math.abs(angleDelta(e.angle, aim)) < .12)
        .sort((a, b) => Math.abs(angleDelta(a.angle, aim)) - Math.abs(angleDelta(b.angle, aim)))[0];
      if (target) aim = target.angle;
    }
    const hits = new Map();
    const pellets = weapon === 'shotgun' ? 7 : 1;
    for (let n = 0; n < pellets; n++) {
      const shotAngle = aim + (weapon === 'shotgun' ? (n - 3) * .026 + (this._rng() - .5) * .012 : 0);
      let closest = null, closestDistance = weapon === 'shotgun' ? 13 : 23;
      for (const e of this.state.enemies) {
        if (!e.alive) continue;
        const dx = e.x - p.x, dz = e.z - p.z;
        const along = dx * Math.sin(shotAngle) - dz * Math.cos(shotAngle);
        const across = Math.abs(dx * Math.cos(shotAngle) + dz * Math.sin(shotAngle));
        const radius = e.type === 'brute' ? .4 : .28;
        if (along > 0 && along < closestDistance && across < radius && this.hasLineOfSight(p.x, p.z, e.x, e.z)) {
          closest = e; closestDistance = along;
        }
      }
      if (closest) hits.set(closest, (hits.get(closest) || 0) + (weapon === 'shotgun' ? 14 : 24));
    }
    this._events.push({ type: 'shot', weapon, hit: hits.size > 0 });
    if (hits.size) this.state.hits++;
    for (const [enemy, damage] of hits) {
      enemy.health = Math.max(0, enemy.health - damage); enemy.active = true; enemy.hitTimer = .13;
      this._events.push({ type: 'hit', id: enemy.id, x: enemy.x, z: enemy.z, damage });
      this.state.effects.push({ id: `hit-${++this._serial}`, type: 'hit', x: enemy.x, z: enemy.z, life: .22 });
      if (enemy.health === 0) {
        enemy.alive = false; this.state.kills++;
        this._events.push({ type: 'kill', id: enemy.id, enemyType: enemy.type, x: enemy.x, z: enemy.z });
      }
    }
    for (const enemy of this.state.enemies) if (enemy.alive && distance(p, enemy) < 7) enemy.active = true;
  }

  switchWeapon() {
    if (!this.state.player.hasShotgun) {
      this._events.push({ type: 'message', text: 'Find the scattergun in the generator room.' }); return;
    }
    this.state.player.weapon = this.state.player.weapon === 'pistol' ? 'shotgun' : 'pistol';
    this.state.tutorial.weaponSwitched = true;
    this._shotCooldown = Math.max(this._shotCooldown, .15);
  }

  _buildDistanceField() {
    const w = LEVEL.width, h = LEVEL.height;
    const field = new Int16Array(w * h).fill(-1);
    const sx = Math.floor(this.state.player.x), sz = Math.floor(this.state.player.z);
    const queue = [[sx, sz]]; field[sz * w + sx] = 0;
    for (let index = 0; index < queue.length; index++) {
      const [x, z] = queue[index];
      for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) {
        if (nx < 0 || nz < 0 || nx >= w || nz >= h || field[nz * w + nx] >= 0 || this._wall(nx + .5, nz + .5)) continue;
        field[nz * w + nx] = field[z * w + x] + 1; queue.push([nx, nz]);
      }
    }
    this._distances = field;
  }

  _updateEnemies(dt) {
    const p = this.state.player;
    for (const enemy of this.state.enemies) {
      enemy.hitTimer = Math.max(0, enemy.hitTimer - dt);
      if (!enemy.alive || this.state.status !== 'playing') continue;
      enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
      const d = distance(p, enemy), visible = this.hasLineOfSight(enemy.x, enemy.z, p.x, p.z);
      if (d < 9 && visible) enemy.active = true;
      if (!enemy.active) continue;
      enemy.angle = Math.atan2(p.x - enemy.x, -(p.z - enemy.z));
      if (d < .8 && visible && enemy.attackCooldown === 0) {
        this._hurt(enemy.type === 'brute' ? 23 : enemy.type === 'runner' ? 10 : 8, enemy);
        enemy.attackCooldown = enemy.type === 'brute' ? 1.15 : .85;
      } else if (enemy.type === 'spitter' && d > 1.4 && d < 10 && visible && enemy.attackCooldown === 0) {
        const speed = 4.1;
        this.state.projectiles.push({ id: `p-${++this._serial}`, x: enemy.x, z: enemy.z, dx: (p.x - enemy.x) / d * speed, dz: (p.z - enemy.z) / d * speed, life: 4, type: 'plasma' });
        enemy.attackCooldown = 1.65 + this._rng() * .45;
      }
      if (d <= .65 || enemy.type === 'spitter' && visible && d > 3 && d < 6.5 || enemy.hitTimer > 0) continue;
      let targetX = p.x, targetZ = p.z;
      if (!visible) {
        const x = Math.floor(enemy.x), z = Math.floor(enemy.z);
        let best = this._distances?.[z * LEVEL.width + x] ?? -1;
        let target = null;
        for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) {
          const value = this._distances?.[nz * LEVEL.width + nx] ?? -1;
          if (value >= 0 && (best < 0 || value < best) && !this._wall(nx + .5, nz + .5)) { best = value; target = [nx + .5, nz + .5]; }
        }
        if (!target) continue;
        [targetX, targetZ] = target;
      }
      const length = Math.hypot(targetX - enemy.x, targetZ - enemy.z);
      if (length < .05) continue;
      const speed = (enemy.type === 'runner' ? 1.35 : enemy.type === 'brute' ? .69 : .85) * this._difficulty.speed;
      let dx = (targetX - enemy.x) / length * speed * dt, dz = (targetZ - enemy.z) / length * speed * dt;
      for (const other of this.state.enemies) {
        if (other === enemy || !other.alive) continue;
        const apart = distance(enemy, other);
        if (apart > .01 && apart < .55) { dx += (enemy.x - other.x) / apart * dt * .6; dz += (enemy.z - other.z) / apart * dt * .6; }
      }
      this._move(enemy, dx, dz, enemy.type === 'brute' ? .28 : .2);
    }
  }

  _updateProjectiles(dt) {
    const survivors = [];
    for (const shot of this.state.projectiles) {
      shot.life -= dt;
      let removed = shot.life <= 0;
      const steps = Math.max(1, Math.ceil(Math.hypot(shot.dx, shot.dz) * dt / .12));
      for (let n = 0; n < steps && !removed; n++) {
        const previousX = shot.x, previousZ = shot.z;
        shot.x += shot.dx * dt / steps; shot.z += shot.dz * dt / steps;
        if (!this.hasLineOfSight(previousX, previousZ, shot.x, shot.z)) removed = true;
        else if (distance(shot, this.state.player) < .32 && this.hasLineOfSight(shot.x, shot.z, this.state.player.x, this.state.player.z)) { this._hurt(15, shot); removed = true; }
      }
      if (!removed) survivors.push(shot);
    }
    this.state.projectiles = survivors;
  }

  _hurt(amount, source) {
    if (this.state.status !== 'playing') return;
    const p = this.state.player;
    const damage = Math.max(1, Math.round(amount * this._difficulty.damage));
    const absorbed = Math.min(p.armor, Math.ceil(damage * .55));
    p.armor -= absorbed;
    p.health = Math.max(0, p.health - (damage - absorbed));
    this._events.push({ type: 'hurt', damage, x: source.x, z: source.z });
    if (p.health === 0) { this.state.status = 'dead'; this._events.push({ type: 'death' }); }
  }

  _interactionCandidate() {
    const p = this.state.player;
    const candidates = [];
    for (const object of [...this.state.interactables, ...this.state.doors]) {
      if (object.used || object.open || object.paired) continue;
      const d = distance(p, object);
      if (d > 1.65) continue;
      // A door is solid; stop outside its cell. Consoles need full line of sight.
      const t = 'requires' in object ? Math.max(0, (d - .74) / Math.max(d, .01)) : 1;
      if (!this.hasLineOfSight(p.x, p.z, p.x + (object.x - p.x) * t, p.z + (object.z - p.z) * t)) continue;
      candidates.push({ object, d });
    }
    candidates.sort((a, b) => a.d - b.d);
    return candidates[0]?.object ?? null;
  }

  getPrompt() {
    const o = this._interactionCandidate();
    if (!o) return '';
    if (o.requires === 'power' && !this.state.power) return 'Airlock offline — restore power';
    if (o.requires === 'key' && !this.state.power) return 'Security gate offline — restore power';
    if (o.requires === 'key' && !this.state.player.key) return 'Security gate — access key required';
    if (o.type === 'exit') return this.state.power && this.state.player.key ? 'Signal extraction' : 'Extraction offline — power and key required';
    return o.label || (o.secret ? 'Inspect maintenance panel' : 'Open airlock');
  }

  interact() {
    if (this.state.status !== 'playing') return false;
    const o = this._interactionCandidate();
    if (!o) return false;
    if (o.requires === 'power' && !this.state.power || o.requires === 'key' && (!this.state.player.key || !this.state.power)) {
      this._events.push({ type: 'message', text: this.getPrompt() }); return false;
    }
    this.state.tutorial.interacted = true;
    if (o.type === 'power') {
      o.used = true; this.state.power = true; this.state.checkpoint = true;
      this.state.player.health = Math.max(75, this.state.player.health);
      this.state.player.armor = Math.max(30, this.state.player.armor);
      this.state.player.ammo.pistol = Math.max(24, this.state.player.ammo.pistol);
      this._events.push({ type: 'power' }, { type: 'message', text: 'Power restored. Airlocks online. Find the security key.' });
      this._checkpoint = this._snapshot();
      this._events.push({ type: 'checkpoint', text: 'Checkpoint saved at the generator.' });
    } else if (o.type === 'secret' || o.secret) {
      this.state.secretFound = true;
      this.state.interactables.find(i => i.type === 'secret').used = true;
      this.state.doors.find(d => d.id === 'maintenance').open = true;
      this._events.push({ type: 'secret', text: 'Secret found: maintenance supply cache.' }, { type: 'door', id: 'maintenance' });
      this._pathTimer = 0;
    } else if (o.type === 'exit') {
      if (!this.state.power || !this.state.player.key) { this._events.push({ type: 'message', text: this.getPrompt() }); return false; }
      o.used = true; this.state.status = 'won'; this._events.push({ type: 'win', time: this.state.time });
    } else {
      o.open = true;
      for (const paired of this.state.doors) if (paired.paired === o.id) paired.open = true;
      this._events.push({ type: 'door', id: o.id }); this._pathTimer = 0;
    }
    return true;
  }

  getObjective() {
    if (this.state.status === 'won') return { title: 'Extraction complete', detail: 'Blacksite 07 is behind you.', x: 26.5, z: 25.5 };
    if (!this.state.doors[0].open) return { title: 'Leave the arrival bay', detail: 'Move toward the airlock and use it to enter the facility.', x: 5.5, z: 20.5 };
    if (!this.state.power) return { title: 'Restore auxiliary power', detail: 'Find the illuminated console in the generator room.', x: 10.5, z: 4.5 };
    if (!this.state.player.key) return { title: 'Recover the security key', detail: 'Enter the research lab through a powered airlock.', x: 26.5, z: 4.5 };
    if (!this.state.doors.find(d => d.id === 'security').open) return { title: 'Open the extraction gate', detail: 'Head south through quarantine. Your key opens the gate.', x: 23.5, z: 23.5 };
    return { title: 'Signal extraction', detail: 'Use the green terminal at the far end of the extraction bay.', x: 26.5, z: 25.5 };
  }

  getZone() {
    const p = this.state.player;
    return LEVEL.zones.find(zone => p.x >= zone.x1 && p.x < zone.x2 && p.z >= zone.z1 && p.z < zone.z2)?.name || 'Service passage';
  }

  drainEvents() { const events = this._events; this._events = []; return events; }

  _snapshot() {
    return {
      player: copy(this.state.player), enemies: copy(this.state.enemies),
      pickups: this.state.pickups.map(p => ({ id: p.id, collected: p.collected })),
      doors: this.state.doors.map(d => ({ id: d.id, open: d.open })),
      interactables: this.state.interactables.map(i => ({ id: i.id, used: i.used })),
      power: this.state.power, secretFound: this.state.secretFound,
      time: this.state.time, kills: this.state.kills, shots: this.state.shots, hits: this.state.hits,
      tutorial: copy(this.state.tutorial), randomState: this._random,
    };
  }

  serialize() {
    return { version: 1, levelId: LEVEL.id, options: { difficulty: this._runDifficulty, seed: this._runSeed }, state: this._snapshot(), checkpoint: this._checkpoint ? copy(this._checkpoint) : null };
  }

  _validSnapshot(s) {
    if (!s || typeof s !== 'object') return false;
    const p = s.player;
    if (!p || !finite(p.x, 1, LEVEL.width - 1) || !finite(p.z, 1, LEVEL.height - 1) || !finite(p.angle, -1000, 1000) || !finite(p.health, 1, 100) || !finite(p.armor, 0, 100)) return false;
    if (LEVEL.grid[Math.floor(p.z)][Math.floor(p.x)] === '#') return false;
    if (!p.ammo || !finite(p.ammo.pistol, 0, 10000) || !finite(p.ammo.shells, 0, 10000) || !['pistol', 'shotgun'].includes(p.weapon) || typeof p.key !== 'boolean' || typeof p.hasShotgun !== 'boolean' || p.weapon === 'shotgun' && !p.hasShotgun) return false;
    if (typeof s.power !== 'boolean' || typeof s.secretFound !== 'boolean') return false;
    for (const key of ['time', 'kills', 'shots', 'hits', 'randomState']) if (!finite(s[key], 0, key === 'randomState' ? 4294967295 : 10000000)) return false;
    for (const [key, flag] of [['pickups', 'collected'], ['doors', 'open'], ['interactables', 'used']]) {
      if (!Array.isArray(s[key]) || s[key].length !== LEVEL[key].length || new Set(s[key].map(v => v?.id)).size !== LEVEL[key].length) return false;
      for (const base of LEVEL[key]) if (!s[key].some(v => v?.id === base.id && typeof v[flag] === 'boolean')) return false;
    }
    const savedDoor = id => s.doors.find(d => d.id === id);
    const savedItem = id => s.pickups.find(item => item.id === id);
    const savedFeature = id => s.interactables.find(i => i.id === id);
    if (p.key !== savedItem('access-key').collected || p.hasShotgun !== savedItem('pump-shotgun').collected || s.power !== savedFeature('aux-power').used) return false;
    if (s.secretFound !== savedFeature('cache-panel').used || s.secretFound !== savedDoor('maintenance').open) return false;
    if (savedDoor('arrival').open !== savedDoor('arrival-side').open) return false;
    if (!s.power && (savedDoor('lab-airlock').open || savedDoor('return-airlock').open)) return false;
    if (savedDoor('security').open && (!p.key || !s.power) || savedFeature('extraction').used && (!p.key || !s.power)) return false;
    // A resumable player must fit on the floor and outside any closed door.
    for (const [dx, dz] of [[-.22, -.22], [-.22, .22], [.22, -.22], [.22, .22]]) {
      const cx = Math.floor(p.x + dx), cz = Math.floor(p.z + dz);
      if (LEVEL.grid[cz]?.[cx] === '#' || s.doors.some(d => !d.open && Math.floor(LEVEL.doors.find(base => base.id === d.id).x) === cx && Math.floor(LEVEL.doors.find(base => base.id === d.id).z) === cz)) return false;
    }
    if (!Array.isArray(s.enemies) || s.enemies.length !== LEVEL.enemies.length || new Set(s.enemies.map(e => e?.id)).size !== LEVEL.enemies.length) return false;
    for (const base of LEVEL.enemies) {
      const e = s.enemies.find(v => v?.id === base.id);
      if (!e || !finite(e.x, 1, LEVEL.width - 1) || !finite(e.z, 1, LEVEL.height - 1) || LEVEL.grid[Math.floor(e.z)][Math.floor(e.x)] === '#' || !finite(e.health, 0, 1000) || typeof e.alive !== 'boolean' || typeof e.active !== 'boolean') return false;
      if (e.alive !== (e.health > 0)) return false;
    }
    return true;
  }

  _applySnapshot(s) {
    const p = s.player;
    this.state.player = { x: p.x, z: p.z, angle: p.angle, health: p.health, armor: p.armor, ammo: { pistol: Math.floor(p.ammo.pistol), shells: Math.floor(p.ammo.shells) }, weapon: p.weapon, key: p.key, hasShotgun: p.hasShotgun };
    this.state.enemies = LEVEL.enemies.map(base => {
      const e = s.enemies.find(v => v.id === base.id);
      return { ...base, x: e.x, z: e.z, health: e.health, maxHealth: Math.round(base.maxHealth * this._difficulty.health), alive: e.alive, active: e.active, angle: finite(e.angle, -1000, 1000) ? e.angle : 0, attackCooldown: .8, hitTimer: 0 };
    });
    this.state.pickups = LEVEL.pickups.map(base => ({ ...base, collected: s.pickups.find(v => v.id === base.id).collected }));
    this.state.doors = LEVEL.doors.map(base => ({ ...base, open: s.doors.find(v => v.id === base.id).open }));
    this.state.interactables = LEVEL.interactables.map(base => ({ ...base, used: s.interactables.find(v => v.id === base.id).used }));
    for (const key of ['power', 'secretFound', 'time', 'kills', 'shots', 'hits']) this.state[key] = s[key];
    this.state.tutorial = Object.fromEntries(['moved', 'fired', 'interacted', 'weaponSwitched'].map(k => [k, s.tutorial?.[k] === true]));
    this.state.effects = []; this.state.projectiles = []; this.state.status = 'paused';
    this._random = s.randomState >>> 0; this._shotCooldown = 0; this._pathTimer = 0; this._distances = null;
    this._reserveTimer = 0; this._messageCooldown = 0; this._serial = 0;
  }

  restore(data) {
    try {
      if (!data || data.version !== 1 || data.levelId !== LEVEL.id || !DIFFICULTY[data.options?.difficulty] || !this._validSnapshot(data.state) || data.checkpoint && (!this._validSnapshot(data.checkpoint) || !data.checkpoint.power || !data.state.power || data.checkpoint.time > data.state.time)) return false;
      this.options.difficulty = data.options.difficulty;
      this._runDifficulty = data.options.difficulty;
      this._runSeed = (Number(data.options.seed) >>> 0) || 1;
      this._difficulty = DIFFICULTY[this.options.difficulty];
      this._applySnapshot(data.state);
      this._checkpoint = data.checkpoint ? copy(data.checkpoint) : null;
      this.state.checkpoint = Boolean(this._checkpoint);
      this._events = [{ type: 'message', text: 'Mission restored. Resume when ready.' }];
      return true;
    } catch { return false; }
  }

  restartCheckpoint() {
    if (!this._checkpoint || !this._validSnapshot(this._checkpoint)) return false;
    this._applySnapshot(copy(this._checkpoint)); this.state.checkpoint = true;
    this.state.status = 'playing'; this._events = [{ type: 'message', text: 'Generator checkpoint restored.' }];
    return true;
  }
}
