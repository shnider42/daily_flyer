// Four original Shadow threats. This module has no DOM or rendering authority.
// Shared hooks work with Game and CoopGame: target IDs always resolve explicitly.
import { shadowGroundAt } from './shadow.mjs';
export const SHADOW_ENEMY_TYPES = Object.freeze(['cinder-sower', 'tether-widow', 'glass-skimmer', 'lantern-maw']);
export const SHADOW_ENEMY_FIELDS = Object.freeze(['shadowPhase', 'shadowTimer', 'shadowCycle', 'shadowSide', 'revealed']);
const TYPES = new Set(SHADOW_ENEMY_TYPES);
const KIND = { 'cinder-sower': 'cinder', 'tether-widow': 'tether', 'glass-skimmer': 'skimmer', 'lantern-maw': 'maw' };
const PHASES = {
  'cinder-sower': ['idle', 'windup', 'recover'],
  'tether-widow': ['idle', 'windup', 'tether', 'recover'],
  'glass-skimmer': ['idle', 'windup', 'recover'],
  'lantern-maw': ['disguised', 'revealed', 'windup', 'lunge', 'recover'],
};
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const finite = (n, lo, hi) => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;
const live = actor => actor && actor.alive !== false && actor.health > 0;
const attackRate = game => clamp(game._difficulty?.attackRate || 1, .5, 2);
const speedRate = game => clamp(game._difficulty?.speed || 1, .5, 2);
const sight = (game, a, b) => game.hasLineOfSight(a.x, a.z, b.x, b.z);
export const isShadowEnemyType = type => TYPES.has(type);

export function shadowEnemyDefaults(enemy) {
  if (!TYPES.has(enemy.type)) return {};
  const side = [...String(enemy.id || '')].reduce((n, c) => n + c.charCodeAt(0), 0) % 2 ? -1 : 1;
  return { shadowPhase: enemy.type === 'lantern-maw' ? 'disguised' : 'idle',
    shadowTimer: 0, shadowCycle: 0, shadowSide: side, revealed: enemy.type !== 'lantern-maw' };
}

function ensure(enemy) {
  for (const [key, value] of Object.entries(shadowEnemyDefaults(enemy))) if (enemy[key] === undefined) enemy[key] = value;
}

function groundAt(game, x, z) {
  return shadowGroundAt(game, x, z);
}

function move(game, enemy, dx, dz, hover = false) {
  if (hover) { game._move(enemy, dx, dz, .27); return; }
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / .1));
  for (let n = 0; n < steps; n++) {
    const oldX = enemy.x, oldZ = enemy.z;
    game._move(enemy, dx / steps, dz / steps, .25);
    if (!groundAt(game, enemy.x, enemy.z)) { enemy.x = oldX; enemy.z = oldZ; break; }
  }
}

function reposition(game, enemy, target, dt, visible, preferred, speed, lateral = 0) {
  if (!live(target) || enemy.stationary) return;
  const hover = enemy.type === 'glass-skimmer';
  let x = target.x, z = target.z, d = distance(enemy, target), direction = 1;
  if (!visible) {
    const cx = Math.floor(enemy.x), cz = Math.floor(enemy.z), width = game.level.width;
    let best = game._distances?.[cz * width + cx] ?? -1, next = null;
    for (const [nx, nz] of [[cx + 1, cz], [cx - 1, cz], [cx, cz + 1], [cx, cz - 1]]) {
      const value = game._distances?.[nz * width + nx] ?? -1;
      if (value >= 0 && (best < 0 || value < best) && !game._wall(nx + .5, nz + .5)
        && (hover || groundAt(game, nx + .5, nz + .5))) { best = value; next = { x: nx + .5, z: nz + .5 }; }
    }
    if (!next) return;
    ({ x, z } = next); d = Math.hypot(x - enemy.x, z - enemy.z); lateral = 0;
  } else direction = d < preferred - 1 ? -1 : d > preferred + 1 ? 1 : 0;
  if (d < .01) return;
  const nx = (x - enemy.x) / d, nz = (z - enemy.z) / d;
  const step = speed * speedRate(game) * dt;
  const before = { x: enemy.x, z: enemy.z };
  move(game, enemy, (nx * direction - nz * lateral) * step, (nz * direction + nx * lateral) * step, hover);
  if (lateral && distance(before, enemy) < step * .18) enemy.shadowSide *= -1;
}

function idleMotion(game, enemy, target, dt, visible) {
  if (enemy.type === 'cinder-sower') reposition(game, enemy, target, dt, visible, 8, .62);
  if (enemy.type === 'tether-widow') reposition(game, enemy, target, dt, visible, 5.7, .85);
  if (enemy.type === 'glass-skimmer') reposition(game, enemy, target, dt, visible, 6, .95, enemy.shadowSide * .9);
  if (enemy.type === 'lantern-maw' && enemy.revealed) reposition(game, enemy, target, dt, visible, 2.6, 1.12);
}

function recover(game, enemy, duration, cooldown) {
  enemy.telegraph = null;
  enemy.shadowPhase = 'recover'; enemy.shadowTimer = duration / attackRate(game);
  enemy.attackCooldown = Math.max(enemy.attackCooldown || 0, cooldown / attackRate(game));
}

function cancel(game, enemy, reason = 'interrupted') {
  const wasTether = enemy.type === 'tether-widow' && enemy.telegraph;
  recover(game, enemy, .65, 1.6);
  if (wasTether) game._events.push({ type: 'tether-broken', id: enemy.id, x: enemy.x, z: enemy.z, reason });
}

function markedTarget(game, enemy) {
  const mark = enemy.telegraph;
  return mark ? game._resolveTarget(mark.targetId, mark.targetKind) : null;
}

function warn(game, enemy, target, duration, radius) {
  game._warning(enemy, KIND[enemy.type], target, duration, radius);
  enemy.shadowPhase = 'windup'; enemy.shadowTimer = 0;
}

function actors(game, owner) {
  const players = Object.values(game.state.players || { solo: game.state.player }).filter(live);
  const opponents = game.state.enemies.filter(e => live(e) && e !== owner
    && (e.faction || 'infestation') !== (owner?.faction || 'infestation'));
  return [...players, ...opponents];
}

function burnArea(game, area, owner, amount) {
  for (const target of actors(game, owner)) {
    if ((target.elevation || 0) > .6 || distance(area, target) > area.radius || !sight(game, area, target)) continue;
    game._hurtTarget(target, amount, owner || area);
  }
}

function sowCinder(game, enemy, mark) {
  // A newly closed door cancels the bombardment; fire cannot leak through walls.
  if (!groundAt(game, mark.x, mark.z) || !sight(game, enemy, mark)) return;
  const hazards = (game.state.shadowHazards || []).filter(h => h.remaining > 0);
  const owned = hazards.filter(h => h.ownerId === enemy.id);
  if (owned.length >= 2) hazards.splice(hazards.indexOf(owned[0]), 1);
  while (hazards.length >= 12) hazards.shift();
  const hazard = { id: `cinder-${++game._serial}`, type: 'cinder', ownerId: enemy.id,
    x: mark.x, z: mark.z, radius: 1.1, duration: 3.8, remaining: 3.8, tickIn: .65, damage: 5 };
  hazards.push(hazard); game.state.shadowHazards = hazards;
  burnArea(game, hazard, enemy, 12);
  game.state.effects.push({ id: `cinder-hit-${++game._serial}`, type: 'explosion', x: hazard.x, z: hazard.z, radius: 1.1, life: .3 });
  game._events.push({ type: 'enemy-shot', id: enemy.id, x: enemy.x, z: enemy.z });
}

function updateSower(game, enemy, dt, target, visible) {
  if (enemy.telegraph) {
    const mark = enemy.telegraph;
    mark.remaining = Math.max(0, mark.remaining - dt);
    if (!mark.remaining) { if (markedTarget(game, enemy)) sowCinder(game, enemy, mark); recover(game, enemy, .8, 2.7); }
    return;
  }
  if (visible && distance(enemy, target) <= 12 && enemy.attackCooldown === 0 && groundAt(game, target.x, target.z)) {
    warn(game, enemy, target, 1.25, 1.1); return;
  }
  idleMotion(game, enemy, target, dt, visible);
}

function updateWidow(game, enemy, dt, target, visible) {
  if (enemy.telegraph) {
    const mark = enemy.telegraph, victim = markedTarget(game, enemy);
    if (!live(victim) || distance(enemy, victim) > 8.8 || !sight(game, enemy, victim)) { cancel(game, enemy, 'cover'); return; }
    mark.fromX = enemy.x; mark.fromZ = enemy.z; mark.x = victim.x; mark.z = victim.z;
    mark.remaining = Math.max(0, mark.remaining - dt);
    if (enemy.shadowPhase === 'windup') {
      if (!mark.remaining) {
        enemy.shadowPhase = 'tether'; enemy.shadowTimer = .65;
        mark.duration = 3; mark.remaining = 3;
      }
      return; // The visible tether always gets a grace period before damage.
    }
    if (!mark.remaining) { recover(game, enemy, .9, 2.5); return; }
    enemy.shadowTimer = Math.max(0, enemy.shadowTimer - dt);
    if (!enemy.shadowTimer) {
      game._hurtTarget(victim, 6, enemy); enemy.shadowTimer = .65;
      if (!live(victim)) cancel(game, enemy, 'target-lost');
    }
    return;
  }
  if (visible && distance(enemy, target) <= 8 && enemy.attackCooldown === 0) { warn(game, enemy, target, 1, .35); return; }
  idleMotion(game, enemy, target, dt, visible);
}

function fireSkimmer(game, enemy, mark) {
  if (!markedTarget(game, enemy) || !sight(game, enemy, mark)) return;
  const aim = Math.atan2(mark.x - enemy.x, -(mark.z - enemy.z));
  const fan = enemy.shadowCycle === 1, offsets = fan ? [-.17, .17] : [0];
  for (const offset of offsets) {
    const speed = fan ? 4.5 : 5.1;
    game.state.projectiles.push({ id: `p-${++game._serial}`, type: 'plasma', x: enemy.x, z: enemy.z,
      dx: Math.sin(aim + offset) * speed, dz: -Math.cos(aim + offset) * speed, life: 3.2, damage: fan ? 8 : 11 });
  }
  enemy.shadowCycle = (enemy.shadowCycle + 1) % 2; enemy.shadowSide *= -1;
  game._events.push({ type: 'enemy-shot', id: enemy.id, x: enemy.x, z: enemy.z });
}

function updateSkimmer(game, enemy, dt, target, visible) {
  if (enemy.telegraph) {
    const mark = enemy.telegraph;
    mark.remaining = Math.max(0, mark.remaining - dt);
    if (!mark.remaining) { fireSkimmer(game, enemy, mark); recover(game, enemy, .72, 1.9); }
    return; // A stable silhouette throughout both the warning and recovery.
  }
  if (visible && distance(enemy, target) <= 10.5 && enemy.attackCooldown === 0) { warn(game, enemy, target, .95, .6); return; }
  idleMotion(game, enemy, target, dt, visible);
}

function revealMaw(game, enemy) {
  if (enemy.revealed) return;
  enemy.revealed = true; enemy.shadowPhase = 'revealed'; enemy.active = true;
  game._events.push({ type: 'enemy-warning', kind: 'maw-reveal', id: enemy.id, x: enemy.x, z: enemy.z });
}

function updateMaw(game, enemy, dt, target, visible) {
  if (!enemy.revealed) {
    if (visible && distance(enemy, target) < 3.6) revealMaw(game, enemy);
    else return;
  }
  if (enemy.telegraph) {
    const mark = enemy.telegraph, victim = markedTarget(game, enemy);
    if (!live(victim)) { recover(game, enemy, .9, 1.8); return; }
    mark.remaining = Math.max(0, mark.remaining - dt);
    if (enemy.shadowPhase === 'windup') {
      if (!mark.remaining) {
        // The direction is fixed at the tell; it never snaps to a different player.
        if (!sight(game, enemy, mark)) { recover(game, enemy, .9, 1.8); return; }
        enemy.shadowPhase = 'lunge'; enemy.shadowCycle = 0;
        mark.duration = .5; mark.remaining = .5;
      }
      return;
    }
    const dx = mark.x - mark.fromX, dz = mark.z - mark.fromZ, d = Math.hypot(dx, dz);
    const before = { x: enemy.x, z: enemy.z };
    if (d > .01) {
      enemy.angle = Math.atan2(dx, -dz);
      move(game, enemy, dx / d * 4.3 * speedRate(game) * dt, dz / d * 4.3 * speedRate(game) * dt);
    }
    if (!enemy.shadowCycle && distance(enemy, victim) < .8 && sight(game, enemy, victim)) {
      game._hurtTarget(victim, 18, enemy); enemy.shadowCycle = 1;
    }
    if (!mark.remaining || d <= .01 || distance(before, enemy) < .01) recover(game, enemy, 1.1, 2.1);
    return;
  }
  if (visible && distance(enemy, target) <= 4.3 && enemy.attackCooldown === 0) { warn(game, enemy, target, 1.1, .75); return; }
  idleMotion(game, enemy, target, dt, visible);
}

// Core decrements attackCooldown/suppressedTimer/stunTimer; this hook owns only
// the new state above. It consumes these types so generic instant melee cannot run.
export function updateShadowThreat(game, enemy, dt, target, visible) {
  if (!TYPES.has(enemy.type)) return false;
  ensure(enemy);
  if (!live(enemy) || game.state.status !== 'playing' || !live(target)) return true;
  dt = finite(dt, 0, 1) ? Math.min(dt, .1) : 0;
  if (enemy.suppressedTimer > 0 || enemy.stunTimer > 0) {
    if (enemy.telegraph) cancel(game, enemy, enemy.suppressedTimer > 0 ? 'null' : 'stun');
    if (!(enemy.stunTimer > 0)) idleMotion(game, enemy, target, dt, visible);
    return true;
  }
  if (enemy.shadowPhase === 'recover') {
    enemy.shadowTimer = Math.max(0, enemy.shadowTimer - dt);
    if (enemy.shadowTimer === 0) enemy.shadowPhase = enemy.type === 'lantern-maw' ? 'revealed' : 'idle';
    return true;
  }
  if (enemy.type === 'cinder-sower') updateSower(game, enemy, dt, target, visible);
  if (enemy.type === 'tether-widow') updateWidow(game, enemy, dt, target, visible);
  if (enemy.type === 'glass-skimmer') updateSkimmer(game, enemy, dt, target, visible);
  if (enemy.type === 'lantern-maw') updateMaw(game, enemy, dt, target, visible);
  return true;
}

export function onShadowEnemyHit(game, enemy) {
  if (!TYPES.has(enemy.type)) return;
  ensure(enemy);
  if (enemy.type === 'lantern-maw') revealMaw(game, enemy);
  if (enemy.health <= 0 || !enemy.alive) {
    enemy.telegraph = null; enemy.shadowTimer = 0;
    enemy.shadowPhase = enemy.type === 'lantern-maw' ? 'revealed' : 'idle';
  } else if (enemy.suppressedTimer > 0 || enemy.stunTimer > 0) cancel(game, enemy, enemy.suppressedTimer > 0 ? 'null' : 'stun');
}

// Call once per authoritative frame, including co-op. Hazards are transient:
// checkpoints/restores may clear this list without leaving an enemy dependent on it.
export function updateShadowHazards(game, dt) {
  if (game.state.status !== 'playing' || !finite(dt, 0, 1)) return;
  dt = Math.min(dt, .1);
  // Clear links even if the normal AI skipped a stunned/distant/downed target.
  for (const enemy of game.state.enemies) {
    if (!TYPES.has(enemy.type) || !enemy.telegraph) continue;
    if (!live(enemy)) { enemy.telegraph = null; enemy.shadowTimer = 0; enemy.shadowPhase = enemy.type === 'lantern-maw' ? 'revealed' : 'idle'; continue; }
    if (enemy.suppressedTimer > 0 || enemy.stunTimer > 0) { cancel(game, enemy, enemy.suppressedTimer > 0 ? 'null' : 'stun'); continue; }
    if (enemy.type === 'tether-widow') {
      const victim = markedTarget(game, enemy);
      if (!live(victim) || distance(enemy, victim) > 8.8 || !sight(game, enemy, victim)) cancel(game, enemy, 'cover');
    }
  }
  const survivors = [];
  for (const hazard of (game.state.shadowHazards || []).slice(-12)) {
    if (hazard.type !== 'cinder' || !finite(hazard.remaining, 0, 3.8) || !finite(hazard.tickIn, 0, .65)) continue;
    hazard.remaining = Math.max(0, hazard.remaining - dt);
    if (!hazard.remaining || game._wall(hazard.x, hazard.z)) continue;
    hazard.tickIn = Math.max(0, hazard.tickIn - dt);
    if (!hazard.tickIn) {
      const owner = game.state.enemies.find(e => e.id === hazard.ownerId);
      burnArea(game, hazard, owner, 5); hazard.tickIn = .65;
    }
    survivors.push(hazard);
  }
  game.state.shadowHazards = survivors;
}

// Used after the core's common enemy-state checks. The callback must validate
// target ID + kind against the save's authoritative player/enemy namespace.
export function validShadowEnemySnapshot(enemy, base, level, validTarget) {
  if (!TYPES.has(base.type)) return true;
  const defaults = shadowEnemyDefaults(base);
  const phase = enemy.shadowPhase ?? defaults.shadowPhase;
  if (!PHASES[base.type].includes(phase)) return false;
  if (enemy.shadowTimer !== undefined && !finite(enemy.shadowTimer, 0, 5)) return false;
  if (enemy.shadowCycle !== undefined && ![0, 1].includes(enemy.shadowCycle)) return false;
  if (enemy.shadowSide !== undefined && ![-1, 1].includes(enemy.shadowSide)) return false;
  if (enemy.revealed !== undefined && typeof enemy.revealed !== 'boolean') return false;
  const revealed = enemy.revealed ?? defaults.revealed;
  if (base.type === 'lantern-maw' && ((phase === 'disguised') === revealed)) return false;
  if (base.type !== 'lantern-maw' && !revealed) return false;
  const mark = enemy.telegraph;
  if (mark === undefined || mark === null) return !['windup', 'tether', 'lunge'].includes(phase);
  if (!mark || typeof mark !== 'object' || Array.isArray(mark) || mark.kind !== KIND[base.type]
    || !['windup', 'tether', 'lunge'].includes(phase)) return false;
  for (const [key, upper] of [['x', level.width], ['z', level.height], ['fromX', level.width], ['fromZ', level.height]]) {
    if (!finite(mark[key], 1, upper - 1)) return false;
  }
  if (level.grid[Math.floor(mark.z)]?.[Math.floor(mark.x)] === '#'
    || !finite(mark.radius, .1, 1.2) || !finite(mark.duration, .1, 3)
    || !finite(mark.remaining, 0, mark.duration)) return false;
  if (!['player', 'enemy'].includes(mark.targetKind) || typeof mark.targetId !== 'string'
    || typeof validTarget !== 'function' || !validTarget(mark.targetId, mark.targetKind)
    || mark.targetKind === 'enemy' && mark.targetId === base.id) return false;
  if (phase === 'tether' && base.type !== 'tether-widow' || phase === 'lunge' && base.type !== 'lantern-maw') return false;
  return true;
}
