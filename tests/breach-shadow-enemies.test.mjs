import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../daily_flyer/themes/breach_assets/core.mjs';
import { CoopGame } from '../daily_flyer/themes/breach_assets/coop-core.mjs';
import {
  SHADOW_ENEMY_TYPES, SHADOW_ENEMY_FIELDS, shadowEnemyDefaults,
  updateShadowThreat, updateShadowHazards, onShadowEnemyHit, validShadowEnemySnapshot,
} from '../daily_flyer/themes/breach_assets/shadow-enemies.mjs';

function arena(type, { coop = false, difficulty = 'standard' } = {}) {
  const game = coop ? new CoopGame({ mission: 'beneath-the-shadow', difficulty }) : new Game({ mission: 'beneath-the-shadow', difficulty });
  game.start();
  game.level = { ...game.level, width: 24, height: 18, platformRooms: [],
    grid: Array.from({ length: 18 }, (_, z) => z === 0 || z === 17 ? '#'.repeat(24) : `#${'.'.repeat(22)}#`) };
  game.state.doors = []; game.state.effects = []; game.state.projectiles = []; game.state.shadowHazards = [];
  for (const [i, player] of Object.values(game.state.players || { solo: game.state.player }).entries()) {
    Object.assign(player, { x: 12.5, z: 8.5 + i * 3, health: 100, armor: 0, alive: true, elevation: 0 });
  }
  const base = { id: `fixture-${type}`, type, x: 6.5, z: 8.5, health: 120, maxHealth: 120, alive: true };
  const enemy = { ...base, ...game._encounterDefaults(base), ...shadowEnemyDefaults(base),
    active: true, angle: 0, attackCooldown: 0, hitTimer: 0, suppressedTimer: 0 };
  game.state.enemies = [enemy]; game._events = [];
  return { game, enemy, player: game.state.player };
}

function step(game, enemy, dt = .05, target = game.state.player) {
  game.state.time += dt;
  enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
  enemy.suppressedTimer = Math.max(0, (enemy.suppressedTimer || 0) - dt);
  enemy.stunTimer = Math.max(0, (enemy.stunTimer || 0) - dt);
  updateShadowThreat(game, enemy, dt, target, game.hasLineOfSight(enemy.x, enemy.z, target.x, target.z));
  updateShadowHazards(game, dt);
}

function advance(game, enemy, seconds, target = game.state.player) {
  for (let elapsed = 0; elapsed < seconds - .00001; elapsed += .05) step(game, enemy, .05, target);
}

function wall(game, x, z) {
  const row = [...game.level.grid[z]]; row[x] = '#'; game.level.grid[z] = row.join('');
}

test('four special threats consume their AI path without changing ordinary enemies', () => {
  assert.equal(SHADOW_ENEMY_TYPES.length, 4);
  assert.equal(new Set(SHADOW_ENEMY_TYPES).size, 4);
  assert.deepEqual(SHADOW_ENEMY_FIELDS, ['shadowPhase', 'shadowTimer', 'shadowCycle', 'shadowSide', 'revealed']);
  const { game, player } = arena('cinder-sower');
  const runner = { id: 'ordinary', type: 'runner', health: 52, alive: true };
  assert.deepEqual(shadowEnemyDefaults(runner), {});
  assert.equal(updateShadowThreat(game, runner, .1, player, true), false);
  assert.deepEqual(runner, { id: 'ordinary', type: 'runner', health: 52, alive: true });
});

test('Cinder Sower locks a readable ground mark; stepping out avoids impact and the finite fire', () => {
  const { game, enemy, player } = arena('cinder-sower');
  step(game, enemy);
  assert.equal(enemy.telegraph.kind, 'cinder'); assert.equal(enemy.telegraph.duration, 1.25);
  const mark = { ...enemy.telegraph };
  advance(game, enemy, .8); assert.equal(player.health, 100); assert.equal(game.state.shadowHazards.length, 0);
  player.z += 2;
  advance(game, enemy, .55);
  assert.equal(player.health, 100); assert.equal(game.state.shadowHazards.length, 1);
  const hazard = game.state.shadowHazards[0];
  assert.equal(hazard.x, mark.x); assert.equal(hazard.z, mark.z); assert.equal(hazard.radius, 1.1);
  for (let i = 0; i < 80; i++) updateShadowHazards(game, .05);
  assert.equal(game.state.shadowHazards.length, 0); assert.equal(player.health, 100);
});

test('Cinder impact and delayed fire ticks hurt a stationary target, with no frame-rate damage burst', () => {
  const { game, enemy, player } = arena('cinder-sower');
  step(game, enemy); advance(game, enemy, 1.3);
  assert.equal(player.health, 88);
  advance(game, enemy, .35); assert.equal(player.health, 88, 'The patch gives a separate interval before its first burn tick');
  advance(game, enemy, .35); assert.equal(player.health, 83);
  player.z += 2;
  advance(game, enemy, .8); assert.equal(player.health, 83);
});

test('a closing door cancels Cinder impact, and nearby fire never splashes around a solid corner', () => {
  const blocked = arena('cinder-sower');
  step(blocked.game, blocked.enemy); wall(blocked.game, 9, 8);
  advance(blocked.game, blocked.enemy, 1.35);
  assert.equal(blocked.player.health, 100); assert.equal(blocked.game.state.shadowHazards.length, 0);

  const { game, enemy } = arena('cinder-sower', { coop: true });
  Object.assign(game.state.players.p1, { x: 12.8, z: 8.8 });
  Object.assign(game.state.players.p2, { x: 13.2, z: 9.2 });
  wall(game, 13, 8); step(game, enemy); advance(game, enemy, 1.35);
  assert.equal(game.state.players.p1.health, 88); assert.equal(game.state.players.p2.health, 100);
  for (let i = 0; i < 16; i++) updateShadowHazards(game, .05);
  assert.equal(game.state.players.p2.health, 100);
});

test('Cinder patches are bounded per owner and globally even after repeated casts', () => {
  const { game, enemy, player } = arena('cinder-sower');
  player.health = 1000;
  for (let i = 0; i < 16; i++) {
    enemy.shadowPhase = 'idle'; enemy.telegraph = null; enemy.attackCooldown = 0;
    updateShadowThreat(game, enemy, .05, player, true);
    enemy.telegraph.remaining = .01;
    updateShadowThreat(game, enemy, .05, player, true);
  }
  assert.equal(game.state.shadowHazards.length, 2);
  const template = { ...game.state.shadowHazards[0] };
  game.state.shadowHazards = Array.from({ length: 40 }, (_, i) => ({ ...template, id: `cinder-${i}` }));
  updateShadowHazards(game, .05); assert.equal(game.state.shadowHazards.length, 12);
});

test('Tether Widow has a full warning and a visible grace period before its first damage pulse', () => {
  const { game, enemy, player } = arena('tether-widow');
  step(game, enemy); assert.equal(enemy.telegraph.kind, 'tether'); assert.equal(enemy.telegraph.duration, 1);
  advance(game, enemy, 1.05);
  assert.equal(enemy.shadowPhase, 'tether'); assert.equal(player.health, 100);
  advance(game, enemy, .45); assert.equal(player.health, 100);
  advance(game, enemy, .25); assert.equal(player.health, 94);
});

test('cover, range, and Null each break a tether immediately without a hidden follow-up hit', () => {
  for (const counter of ['cover', 'range', 'null']) {
    const { game, enemy, player } = arena('tether-widow');
    step(game, enemy); advance(game, enemy, 1.1);
    if (counter === 'cover') wall(game, 9, 8);
    if (counter === 'range') player.x = 18;
    if (counter === 'null') {
      Object.assign(player, { weapon: 'nullgun', hasNull: true, angle: -Math.PI / 2 });
      player.ammo.cells = 3; game._fire();
      assert.equal(enemy.suppressedTimer, 8, 'A real Null shot marks before its damage hook');
    }
    updateShadowHazards(game, .05);
    assert.equal(enemy.telegraph, null, counter);
    advance(game, enemy, .7); assert.equal(player.health, 100, counter);
  }
});

test('co-op tether remains bound to the warned operator even when the AI alias switches', () => {
  const { game, enemy } = arena('tether-widow', { coop: true });
  const p1 = game.state.players.p1, p2 = game.state.players.p2;
  step(game, enemy, .05, p1);
  assert.equal(enemy.telegraph.targetId, 'p1'); assert.equal(enemy.telegraph.targetKind, 'player');
  Object.assign(p2, { x: 8.5, z: 8.5 });
  game._withPlayer('p2', () => advance(game, enemy, 1.8, p2));
  assert.equal(p1.health, 94); assert.equal(p2.health, 100);
  p1.alive = false; p1.health = 0;
  game._withPlayer('p2', () => step(game, enemy, .05, p2));
  assert.equal(enemy.telegraph, null); assert.equal(p2.health, 100, 'A lost target never transfers a charged tether');
});

test('Glass Skimmer crosses gaps, respects walls, and holds still for a player-readable shot window', () => {
  const { game, enemy, player } = arena('glass-skimmer');
  game.level.platformRooms = [{ x1: 4, x2: 11, z1: 6, z2: 12, platforms: [] }];
  enemy.attackCooldown = 20; const start = { x: enemy.x, z: enemy.z };
  advance(game, enemy, .6); assert.ok(Math.hypot(enemy.x - start.x, enemy.z - start.z) > .3);
  wall(game, 7, 8); enemy.x = 6.65; enemy.z = 8.5; enemy.shadowSide = 1;
  Object.assign(player, { x: 18.5, z: 8.5 });
  for (let i = 0; i < 30; i++) updateShadowThreat(game, enemy, .05, player, true);
  assert.ok(!game._wall(enemy.x, enemy.z));
  game.level.platformRooms = []; enemy.x = 6.5; enemy.z = 10.5; player.x = 12.5; player.z = 10.5;
  enemy.attackCooldown = 0; step(game, enemy);
  const aim = { x: enemy.x, z: enemy.z };
  advance(game, enemy, .8); assert.equal(enemy.x, aim.x); assert.equal(enemy.z, aim.z);
  advance(game, enemy, .25); assert.equal(enemy.shadowPhase, 'recover');
  advance(game, enemy, .4); assert.equal(enemy.x, aim.x); assert.equal(enemy.z, aim.z);
});

test('Glass Skimmer alternates one aimed bolt and a two-bolt fan without retargeting the warned point', () => {
  const { game, enemy, player } = arena('glass-skimmer');
  step(game, enemy); player.z += 1.8; advance(game, enemy, 1.05);
  assert.equal(game.state.projectiles.length, 1);
  assert.ok(Math.abs(game.state.projectiles[0].dz) < .0001, 'First bolt goes to the old aim point');
  enemy.shadowPhase = 'idle'; enemy.attackCooldown = 0; enemy.telegraph = null;
  step(game, enemy); advance(game, enemy, 1.05);
  assert.equal(game.state.projectiles.length, 3); assert.equal(enemy.shadowCycle, 0);
  const [left, right] = game.state.projectiles.slice(1);
  assert.notEqual(left.dz, right.dz);
});

test('Skimmer bolts collide with solid cover and can hit the correct second co-op player', () => {
  const { game, enemy } = arena('glass-skimmer', { coop: true });
  const p1 = game.state.players.p1, p2 = game.state.players.p2;
  p1.z = 12.5; p2.z = 8.5;
  game._withPlayer('p2', () => { step(game, enemy, .05, p2); advance(game, enemy, 1.05, p2); });
  for (let i = 0; i < 30; i++) game._updateProjectiles(.05);
  assert.equal(p1.health, 100); assert.equal(p2.health, 89);
  enemy.shadowCycle = 0; enemy.shadowPhase = 'idle'; enemy.attackCooldown = 0;
  game._withPlayer('p2', () => { step(game, enemy, .05, p2); advance(game, enemy, 1.05, p2); });
  wall(game, 9, 8);
  for (let i = 0; i < 30; i++) game._updateProjectiles(.05);
  assert.equal(p2.health, 89); assert.equal(game.state.projectiles.length, 0);
});

test('Lantern Maw stays disguised at a distance, reveals on approach or hit, and never deals surprise contact damage', () => {
  const { game, enemy, player } = arena('lantern-maw');
  advance(game, enemy, 1); assert.equal(enemy.revealed, false); assert.equal(enemy.x, 6.5);
  player.x = 9.5; step(game, enemy);
  assert.equal(enemy.revealed, true); assert.equal(enemy.telegraph.kind, 'maw');
  advance(game, enemy, .85); assert.equal(player.health, 100);
  const shot = arena('lantern-maw');
  onShadowEnemyHit(shot.game, shot.enemy, 'player');
  assert.equal(shot.enemy.revealed, true); assert.equal(shot.enemy.shadowPhase, 'revealed');
  assert.equal(shot.player.health, 100);
});

test('Maw lunge follows its tell, permits a sidestep, and cannot bite through a wall', () => {
  const { game, enemy, player } = arena('lantern-maw');
  player.x = 9; step(game, enemy); player.z += 1.8;
  advance(game, enemy, 1.8); assert.equal(player.health, 100); assert.equal(enemy.shadowPhase, 'recover');
  assert.ok(Math.abs(enemy.z - 8.5) < .001, 'The lunge does not home after the player dodges');
  const blocked = arena('lantern-maw'); blocked.player.x = 9;
  step(blocked.game, blocked.enemy); wall(blocked.game, 8, 8);
  advance(blocked.game, blocked.enemy, 1.8);
  assert.equal(blocked.player.health, 100); assert.ok(blocked.enemy.x < 8);
});

test('Maw can land one hit on the warned target, then exposes a recovery window', () => {
  const { game, enemy, player } = arena('lantern-maw');
  player.x = 8.5; step(game, enemy); advance(game, enemy, 1.8);
  assert.equal(player.health, 82); assert.equal(enemy.shadowPhase, 'recover');
  advance(game, enemy, .5); assert.equal(player.health, 82);
});

test('Insane scales damage/recovery pressure while preserving every readable warning duration', () => {
  for (const [type, duration] of [['cinder-sower', 1.25], ['tether-widow', 1], ['glass-skimmer', .95], ['lantern-maw', 1.1]]) {
    const regular = arena(type), insane = arena(type, { difficulty: 'insane' });
    if (type === 'lantern-maw') { regular.player.x = 8.5; insane.player.x = 8.5; }
    step(regular.game, regular.enemy); step(insane.game, insane.enemy);
    assert.equal(regular.enemy.telegraph.duration, duration); assert.equal(insane.enemy.telegraph.duration, duration);
    if (type === 'cinder-sower') {
      advance(regular.game, regular.enemy, 1.3); advance(insane.game, insane.enemy, 1.3);
      assert.equal(regular.player.health, 88); assert.equal(insane.player.health, 80);
      assert.ok(insane.enemy.attackCooldown < regular.enemy.attackCooldown);
      assert.ok(insane.enemy.shadowTimer < regular.enemy.shadowTimer);
    }
  }
});

test('new enemy snapshots retain target namespaces and reject malformed phases and attacks', () => {
  for (const type of SHADOW_ENEMY_TYPES) {
    const { game, enemy, player } = arena(type);
    if (type === 'lantern-maw') player.x = 8.5;
    const base = { ...enemy }; step(game, enemy);
    const allowed = (id, kind) => id === 'player' && kind === 'player';
    assert.ok(validShadowEnemySnapshot(enemy, base, game.level, allowed), type);
    for (const mutate of [e => { e.shadowPhase = 'teleport'; }, e => { e.shadowTimer = Infinity; },
      e => { e.shadowCycle = 999; }, e => { e.telegraph.targetId = 'p2'; },
      e => { e.telegraph.targetKind = 'enemy'; }, e => { e.telegraph.remaining = 50; },
      e => { e.telegraph.x = -1; }, e => { e.telegraph = null; }]) {
      const bad = structuredClone(enemy); mutate(bad);
      assert.equal(validShadowEnemySnapshot(bad, base, game.level, allowed), false, type);
    }
  }
});

test('every authored new enemy restores an in-progress warning through the real Game save path', () => {
  for (const [id, type] of [['forge-sower', 'cinder-sower'], ['lantern-widow', 'tether-widow'],
    ['lab-skimmer', 'glass-skimmer'], ['echo-maw', 'lantern-maw']]) {
    const game = new Game({ mission: 'beneath-the-shadow', difficulty: 'insane' }); game.start();
    const enemy = game.state.enemies.find(e => e.id === id);
    assert.equal(enemy?.type, type);
    Object.assign(game.state.player, { x: enemy.x, z: enemy.z + 3, armor: 0 });
    enemy.attackCooldown = 0; enemy.active = true;
    game._updateEnemy(enemy, .05);
    assert.ok(enemy.telegraph, `${id} entered its real integrated warning`);
    const saved = game.serialize(), restored = new Game();
    assert.equal(restored.restore(saved), true, id);
    const loaded = restored.state.enemies.find(e => e.id === id);
    assert.deepEqual(loaded.telegraph, enemy.telegraph); assert.equal(loaded.shadowPhase, 'windup');
    assert.deepEqual(restored.state.shadowHazards, []);
    restored.resume(); const remaining = loaded.telegraph.remaining;
    restored._updateEnemy(loaded, .05);
    assert.ok(loaded.telegraph.remaining < remaining, `${id} resumes rather than restarting its warning`);
  }
});

test('a complete co-op frame advances each Cinder patch once and burns both operators once per interval', () => {
  const { game, enemy } = arena('cinder-sower', { coop: true });
  enemy.alive = false; enemy.health = 0;
  Object.assign(game.state.players.p2, { x: 12.9, z: 8.5 });
  game.state.shadowHazards = [{ id: 'cinder-1', type: 'cinder', ownerId: enemy.id,
    x: 12.5, z: 8.5, radius: 1.1, duration: 3.8, remaining: 3.8, tickIn: .15, damage: 5 }];
  game.update(.1, {});
  for (const player of Object.values(game.state.players)) assert.equal(player.health, 100);
  assert.ok(Math.abs(game.state.shadowHazards[0].remaining - 3.7) < .00001);
  game.update(.1, {});
  for (const player of Object.values(game.state.players)) assert.equal(player.health, 95);
  assert.ok(Math.abs(game.state.shadowHazards[0].remaining - 3.6) < .00001);
  game.update(.1, {});
  for (const player of Object.values(game.state.players)) assert.equal(player.health, 95);
});
