/* Battlezone-inspired simulation. No DOM, timers, network, or rendering dependencies. */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const angleDelta = a => Math.atan2(Math.sin(a), Math.cos(a));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const waveNames = ['First contact', 'Crossfire', 'Heavy armor', 'Hold the line', 'Final push'];
  const waveName = wave => waveNames[wave - 1] || 'Open patrol';
  function rng(seed) {
    let n = seed >>> 0;
    return () => {
      n += 0x6D2B79F5;
      let t = Math.imul(n ^ n >>> 15, 1 | n);
      t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  // Return the first intersection along the segment, including starting inside.
  function intersection(ax, az, bx, bz, x, z, radius) {
    const dx = bx - ax, dz = bz - az, ox = ax - x, oz = az - z;
    const a = dx * dx + dz * dz, c = ox * ox + oz * oz - radius * radius;
    if (c <= 0) return 0;
    if (a < 1e-10) return null;
    const b = 2 * (ox * dx + oz * dz), disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    return t >= 0 && t <= 1 ? t : null;
  }
  function create(seed = 1980, mode = 'patrol', difficulty = 'standard') {
    const random = rng(seed), obstacles = [];
    // The central corridor remains clear so a new player can immediately aim and fire.
    for (let i = 0; i < 27; i++) {
      const a = random() * TAU, r = 28 + random() * 147;
      const obstacle = { x: Math.sin(a) * r, z: Math.cos(a) * r,
        radius: 4 + random() * 4, height: 5 + random() * 8,
        type: i % 3 === 0 ? 'pyramid' : 'block' };
      if (obstacle.z > 0 && Math.abs(obstacle.x) < 18) continue;
      if (obstacles.some(o => distance(o, obstacle) < o.radius + obstacle.radius + 10)) continue;
      obstacles.push(obstacle);
    }
    const state = { seed, random, mode, difficulty, obstacles, enemies: [], bullets: [],
      particles: [], events: [], phase: 'ready', player: { x: 0, z: 0, angle: 0, hp: 3,
        radius: 2.6, cooldown: 0, invulnerable: 0 }, wave: 0, score: 0, kills: 0,
      shots: 0, hits: 0, time: 0, nextWave: 0, flash: 0, message: '', messageTime: 0,
      hitMarker: 0, muzzle: 0, wavesCleared: 0, pickups: [], saucer: null,
      nextBonus: 15, bonusKills: 0, repairs: 0 };
    spawnWave(state);
    return state;
  }
  function free(state, x, z, radius, actor) {
    if (Math.hypot(x, z) > 194) return false;
    if (state.obstacles.some(o => Math.hypot(x - o.x, z - o.z) < radius + o.radius)) return false;
    if (actor !== state.player && Math.hypot(x - state.player.x, z - state.player.z) < radius + state.player.radius) return false;
    return !state.enemies.some(e => e !== actor && Math.hypot(x - e.x, z - e.z) < radius + e.radius);
  }
  function move(state, actor, dx, dz) {
    let moved = false;
    if (free(state, actor.x + dx, actor.z, actor.radius, actor)) { actor.x += dx; moved = true; }
    if (free(state, actor.x, actor.z + dz, actor.radius, actor)) { actor.z += dz; moved = true; }
    return moved;
  }
  function spawnWave(state) {
    state.wave++;
    const count = Math.min(2 + Math.floor((state.wave - 1) / 2), 6);
    for (let i = 0; i < count; i++) {
      const heavy = state.wave >= 3 && i % 2 === 0;
      const flanker = !heavy && state.wave >= 2 && i === count - 1;
      let x, z, found = false;
      for (let attempt = 0; attempt < 180; attempt++) {
        const a = state.player.angle + (state.wave === 1 && attempt === 0 ? (i ? 0.4 : -0.13) : state.random() * TAU);
        const r = 65 + state.random() * 36;
        x = state.player.x + Math.sin(a) * r;
        z = state.player.z + Math.cos(a) * r;
        if (free(state, x, z, 3.3, null)) { found = true; break; }
      }
      if (!found) continue;
      state.enemies.push({ x, z, angle: Math.atan2(state.player.x - x, state.player.z - z),
        radius: heavy ? 3.2 : 2.7, hp: heavy ? 2 : 1, type: heavy ? 'heavy' : flanker ? 'flanker' : 'scout',
        flankSide: i % 2 ? 1 : -1,
        cooldown: 3 + state.random() * 3, windup: 0, hit: 0 });
    }
    say(state, `${waveName(state.wave).toUpperCase()} — ${state.enemies.length} CONTACTS`);
  }
  function say(state, message) { state.message = message; state.messageTime = 2.5; }
  function burst(state, x, z, color = 'green') {
    for (let i = 0; i < 16; i++) {
      const a = state.random() * TAU, speed = 3 + state.random() * 13;
      state.particles.push({ x, z, y: 2, vx: Math.sin(a) * speed, vz: Math.cos(a) * speed,
        vy: 3 + state.random() * 8, life: 0.6 + state.random() * 0.5, color });
    }
  }
  function fire(state, actor, owner) {
    const speed = owner === 'player' ? 105 : (state.difficulty === 'cadet' ? 32 : 45);
    state.bullets.push({ x: actor.x + Math.sin(actor.angle) * 3.6,
      z: actor.z + Math.cos(actor.angle) * 3.6, vx: Math.sin(actor.angle) * speed,
      vz: Math.cos(actor.angle) * speed, owner, life: owner === 'player' ? 2.0 : 4.8 });
    state.events.push(owner === 'player' ? 'fire' : 'enemy-fire');
  }
  function blocked(state, a, b) {
    return state.obstacles.some(o => intersection(a.x, a.z, b.x, b.z, o.x, o.z, o.radius) !== null);
  }
  // Bonus targets never count toward a wave, so letting one escape cannot stall a run.
  function spawnSaucer(state) {
    const p = state.player;
    for (let i = 0; i < 24; i++) {
      const angle = p.angle - .65 + i * Math.PI / 12;
      const x = p.x + Math.sin(angle) * 65, z = p.z + Math.cos(angle) * 65;
      if (Math.hypot(x, z) > 175 || blocked(state, p, {x, z})) continue;
      state.saucer = {x, z, vx: Math.cos(angle) * 10, vz: -Math.sin(angle) * 10,
        radius: 3.3, hp: 1, type: 'saucer', life: 12};
      state.events.push('bonus'); say(state, 'BONUS SAUCER — 1,500 POINTS');
      return;
    }
  }
  function sightTarget(state) {
    const p = state.player, dx = Math.sin(p.angle), dz = Math.cos(p.angle);
    let nearest = Infinity, target = null;
    for (const o of [...state.obstacles, ...state.enemies, ...(state.saucer ? [state.saucer] : [])]) {
      const t = intersection(p.x + dx * 3.6, p.z + dz * 3.6, p.x + dx * 213.6, p.z + dz * 213.6, o.x, o.z, o.radius + .25);
      if (t !== null && t < nearest) { nearest = t; target = o.hp ? o : null; }
    }
    return target;
  }
  function firingThreat(state) {
    const e = state.enemies.filter(e => e.windup > 0).sort((a,b) => a.windup - b.windup)[0];
    if (!e) return '';
    const degrees = angleDelta(Math.atan2(e.x - state.player.x, e.z - state.player.z) - state.player.angle) * 180 / Math.PI;
    return Math.abs(degrees) < 25 ? 'AHEAD' : Math.abs(degrees) > 150 ? 'BEHIND' : degrees > 0 ? 'RIGHT' : 'LEFT';
  }
  function step(state, input, delta) {
    if (state.phase !== 'playing') return;
    const dt = clamp(delta, 0, 0.05), p = state.player;
    state.time += dt;
    state.flash = Math.max(0, state.flash - dt);
    state.hitMarker = Math.max(0, state.hitMarker - dt);
    state.muzzle = Math.max(0, state.muzzle - dt);
    state.messageTime = Math.max(0, state.messageTime - dt);
    p.cooldown = Math.max(0, p.cooldown - dt);
    p.invulnerable = Math.max(0, p.invulnerable - dt);
    p.aiming = !!input.precision;
    p.angle = angleDelta(p.angle + ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * (p.aiming ? .42 : 1.3) * dt);
    const throttle = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
    const speed = throttle * (throttle < 0 ? 10 : 15);
    move(state, p, Math.sin(p.angle) * speed * dt, Math.cos(p.angle) * speed * dt);
    if (input.fire && p.cooldown === 0) {
      fire(state, p, 'player'); p.cooldown = 0.7; state.shots++; state.muzzle = .1;
    }
    for (const e of state.enemies) {
      const bearing = Math.atan2(p.x - e.x, p.z - e.z);
      const range = distance(p, e);
      // Circle toward an exposed side between shots, then turn the hull to aim.
      const target = bearing + (e.type === 'flanker' && e.cooldown > 1 && range > 20 ? e.flankSide * .8 : 0);
      const diff = angleDelta(target - e.angle), aimDiff = angleDelta(bearing - e.angle);
      e.hit = Math.max(0, e.hit - dt);
      if (e.windup > 0) {
        e.windup -= dt; // Aiming freezes during the warning: moving can dodge the shot.
        if (e.windup <= 0) { fire(state, e, 'enemy'); e.cooldown = (state.difficulty === 'cadet' ? 5 : 3.4) + state.random() * 2; }
      } else {
        e.angle = angleDelta(e.angle + clamp(diff, -dt * 0.65, dt * 0.65));
        if (range > (e.type === 'flanker' ? 20 : 30) && Math.abs(diff) < 0.8) {
          const v = (e.type === 'heavy' ? 3.8 : e.type === 'flanker' ? 8.2 : 6.2) * dt;
          const before = {x:e.x,z:e.z};
          move(state, e, Math.sin(e.angle) * v, Math.cos(e.angle) * v);
          if (distance(before,e) < v * 0.2) move(state,e,Math.cos(e.angle)*v,-Math.sin(e.angle)*v);
        }
        e.cooldown = Math.max(0, e.cooldown - dt);
        if (e.cooldown === 0 && range < 115 && Math.abs(aimDiff) < 0.13 && !blocked(state, e, p)) {
          e.windup = state.difficulty === 'cadet' ? 1.5 : 1.0;
        }
      }
    }
    if (state.wave >= 2 && state.time >= state.nextBonus && !state.nextWave) {
      if (!state.saucer) spawnSaucer(state);
      state.nextBonus = state.time + 35;
    }
    if (state.saucer) {
      const u = state.saucer;
      u.x += u.vx * dt; u.z += u.vz * dt; u.life -= dt;
      if (u.life <= 0 || Math.hypot(u.x, u.z) > 194) state.saucer = null;
    }
    const remaining = [];
    for (const b of state.bullets) {
      const nx = b.x + b.vx * dt, nz = b.z + b.vz * dt;
      let first = null;
      const consider = (target, kind, radius) => {
        const t = intersection(b.x, b.z, nx, nz, target.x, target.z, radius + 0.25);
        if (t !== null && (!first || t < first.t)) first = {target, kind, t};
      };
      state.obstacles.forEach(o => consider(o, 'cover', o.radius));
      if (b.owner === 'player') {
        state.enemies.forEach(e => consider(e, 'enemy', e.radius));
        if (state.saucer) consider(state.saucer, 'bonus', state.saucer.radius);
      }
      else consider(p, 'player', p.radius);
      if (first) {
        const {target,kind,t} = first;
        if (kind === 'bonus') {
          state.saucer = null; state.score += 1500; state.bonusKills++; state.hits++; state.hitMarker = .25;
          burst(state, target.x, target.z, 'bonus'); state.events.push('bonus'); say(state, 'SAUCER DOWN +1,500');
        } else if (kind === 'enemy') {
          target.hp--; target.hit = 0.18; state.hits++; state.hitMarker = .25;
          if (target.hp <= 0) {
            state.score += target.type === 'heavy' ? 2000 : target.type === 'flanker' ? 1250 : 1000;
            state.kills++; state.enemies = state.enemies.filter(e => e !== target);
            burst(state,target.x,target.z); state.events.push('destroy'); say(state,'TARGET DESTROYED');
            if (state.kills % 2 === 0) {
              state.pickups.push({x: target.x, z: target.z, radius: 2.5, life: 30});
              state.pickups = state.pickups.slice(-2); say(state, 'REPAIR DROP — FOLLOW THE CYAN CROSS');
            }
          } else { state.events.push('hit'); say(state,'ARMOR HIT — FIRE AGAIN'); }
        } else if (kind === 'player' && p.invulnerable === 0) {
          p.hp--; p.invulnerable = 1.8; state.flash = 0.4;
          state.events.push('damage'); say(state,'HULL HIT — KEEP MOVING');
          if (p.hp <= 0) { state.phase = 'lost'; state.events.push('end'); }
        } else if (kind === 'cover') burst(state,b.x+(nx-b.x)*t,b.z+(nz-b.z)*t,'dim');
      } else {
        b.x = nx; b.z = nz; b.life -= dt;
        if (b.life > 0) remaining.push(b);
      }
    }
    state.bullets = remaining;
    state.pickups = state.pickups.filter(o => {
      o.life -= dt;
      if (o.life <= 0) return false;
      if (state.phase === 'playing' && distance(o, p) < o.radius + p.radius) {
        const damaged = p.hp < 3;
        if (damaged) { p.hp++; state.repairs++; } else state.score += 500;
        state.events.push('repair'); say(state, damaged ? 'HULL REPAIRED +1' : 'FULL HULL — SUPPLY BONUS +500');
        return false;
      }
      return true;
    });
    for (const f of state.particles) {
      f.life -= dt; f.x += f.vx*dt; f.z += f.vz*dt; f.y += f.vy*dt; f.vy -= 18*dt;
    }
    state.particles = state.particles.filter(f => f.life > 0 && f.y >= 0).slice(-180);
    if (state.phase === 'playing' && state.enemies.length === 0) {
      state.wavesCleared = state.wave;
      if (state.mode === 'daily' && state.wave >= 5) {
        state.phase = 'won'; state.bullets = []; state.saucer = null; state.events.push('end');
      } else if (state.nextWave === 0) {
        state.nextWave = 3; say(state,'SECTOR CLEAR — NEXT WAVE INBOUND');
      } else {
        state.nextWave = Math.max(0, state.nextWave - dt);
        if (state.nextWave === 0) spawnWave(state);
      }
    }
  }
  const api = {create, step, intersection, angleDelta, distance, clamp, sightTarget, firingThreat, waveName};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VectorPatrol = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
