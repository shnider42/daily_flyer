import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, LEVELS } from '../daily_flyer/themes/breach_assets/core.mjs';
import { CoopGame } from '../daily_flyer/themes/breach_assets/coop-core.mjs';

const player = (game, id = 'p1') => game.state.players?.[id] || game.state.player;
const feature = (game, id) => game.state.interactables.find(item => item.id === id);
const key = game => game.state.pickups.find(item => item.type === 'key');
const use = (game, id = 'p1') => game.interact(id);
const at = (game, id, x, z) => Object.assign(player(game, id), { x, z });

function quiet(game) {
  for (const enemy of game.state.enemies) { enemy.alive = false; enemy.health = 0; }
  game.start();
}

function pathTo(game, target, id = 'p1') {
  const p = player(game, id), start = [Math.floor(p.x), Math.floor(p.z)];
  const goal = `${Math.floor(target.x)},${Math.floor(target.z)}`;
  const queue = [start], visited = new Map([[start.join(','), null]]);
  for (let n = 0; n < queue.length; n++) {
    const [x, z] = queue[n], here = `${x},${z}`;
    if (here === goal) {
      const result = [];
      for (let next = here; next; next = visited.get(next)) result.push(next.split(',').map(Number));
      return result.reverse();
    }
    for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) {
      const next = `${nx},${nz}`;
      if (visited.has(next) || game._wall(nx + .5, nz + .5)) continue;
      visited.set(next, here); queue.push([nx, nz]);
    }
  }
  return null;
}

function walkTo(game, target, id = 'p1') {
  const path = pathTo(game, target, id);
  assert.ok(path, `${id} can walk to ${target.id || `${target.x},${target.z}`}`);
  for (const [x, z] of path.slice(1)) {
    const p = player(game, id);
    let steps = 0;
    while (Math.hypot(x + .5 - p.x, z + .5 - p.z) > .035 && steps++ < 120) {
      const angle = Math.atan2(x + .5 - p.x, -(z + .5 - p.z));
      const gap = Math.hypot(x + .5 - p.x, z + .5 - p.z);
      const dt = Math.min(1 / 60, gap / 3.35);
      if (game instanceof CoopGame) game.update(dt, { [id]: { forward: 1, angle } });
      else { p.angle = angle; game.update(dt, { forward: 1 }); }
    }
    assert.ok(steps < 120, `${id} reached floor cell ${x},${z}`);
  }
}

function enter(game, id = 'p1') {
  walkTo(game, { x: 10.5, z: 17.5 }, id);
  assert.equal(use(game, id), true);
}

function power(game, id = 'p1') {
  enter(game, id);
  walkTo(game, feature(game, 'aux-power'), id);
  assert.equal(use(game, id), true);
}

function down(game, id) {
  const p = player(game, id); p.health = 10; p.armor = 0;
  game.state.projectiles.push({ id: `test-${id}`, x: p.x, z: p.z - .4, dx: 0, dz: 4, life: 2, type: 'plasma' });
  game.update(.1, {});
  assert.equal(p.alive, false);
}

test('Crosslink is a compact connected solo mission with gated relays, vault, key and extraction', () => {
  const game = new Game({ mission: 'crosslink-11' }); quiet(game);
  assert.equal(game.level.id, 'crosslink-11-v1');
  assert.equal(game.level.width, 23); assert.equal(game.level.height, 21);
  assert.equal(game.level.enemies.length, 8);
  assert.equal(pathTo(game, feature(game, 'aux-power')), null);
  enter(game);
  assert.equal(game.getObjective().stage, 'power');
  walkTo(game, feature(game, 'relay-west'));
  assert.equal(game.getInteractionInfo().label, 'OFFLINE'); assert.equal(use(game), false);
  walkTo(game, feature(game, 'aux-power')); assert.equal(use(game), true);
  walkTo(game, feature(game, 'relay-west')); assert.equal(use(game), true);
  assert.equal(pathTo(game, key(game)), null);
  walkTo(game, { x: 11.5, z: 11.5 }); assert.equal(use(game), false);
  walkTo(game, feature(game, 'relay-east')); assert.equal(use(game), true);
  assert.equal(game.getObjective().stage, 'vault');
  const save = game.serialize(), restored = new Game();
  assert.equal(restored.restore(save), true); assert.equal(restored.level, LEVELS['crosslink-11']);
  assert.equal(restored.restartCheckpoint(), true); assert.equal(restored.getMissionProgress().relaysUsed, 2);
  walkTo(game, { x: 11.5, z: 11.5 }); assert.equal(use(game), true);
  assert.equal(pathTo(game, feature(game, 'extraction')), null);
  walkTo(game, key(game)); assert.equal(game.state.player.key, true);
  walkTo(game, { x: 11.5, z: 6.5 }); assert.equal(use(game), true);
  walkTo(game, feature(game, 'extraction')); assert.equal(use(game), true);
  assert.equal(game.state.status, 'won'); assert.equal(game.state.secretFound, false);
});

test('co-op players move independently while elapsed time, projectiles and effects advance once', () => {
  const game = new CoopGame(); quiet(game);
  assert.deepEqual(Object.keys(game.state.players), ['p1', 'p2']);
  for (const p of Object.values(game.state.players)) { assert.equal(p.hasShotgun, true); assert.equal(p.ammo.shells, 8); }
  game.state.projectiles.push({ id: 'clock', x: 9.5, z: 19.5, dx: 1, dz: 0, life: 2 });
  game.state.effects.push({ id: 'effect', x: 9.5, z: 19.5, life: 1 });
  game.update(.1, { p1: { forward: 1, angle: 0 }, p2: { forward: 1, angle: Math.PI / 2 } });
  assert.ok(Math.abs(player(game).z - 18.165) < 1e-8);
  assert.ok(Math.abs(player(game, 'p2').x - 12.835) < 1e-8);
  assert.equal(game.state.time, .1); assert.equal(game.state.tick, 1);
  assert.equal(game.state.projectiles[0].life, 1.9); assert.ok(Math.abs(game.state.projectiles[0].x - 9.6) < 1e-8);
  assert.equal(game.state.effects[0].life, .9);
  const prior = copySnapshot(game);
  game.update(NaN, { p1: { forward: 1 } }); assert.deepEqual(copySnapshot(game), prior);
  game.pause(); const paused = copySnapshot(game);
  game.update(.1, { p1: { fire: true }, p2: { forward: 1 } }); assert.deepEqual(copySnapshot(game), paused);
  game.resume(); game.update(.1, { p1: { forward: Infinity, strafe: NaN, angle: NaN, fire: 'yes' }, unknown: { fire: true } });
  assert.ok(Number.isFinite(player(game).angle)); assert.equal(game.state.shots, 0);
});

function copySnapshot(game) { return JSON.parse(JSON.stringify(game.networkSnapshot())); }

test('both players can fire in one tick with independent cooldowns, ammunition and personal events', () => {
  const game = new CoopGame({ aimAssist: false }); quiet(game);
  const [left, right] = game.state.enemies;
  Object.assign(left, { x: 10.5, z: 17.3, alive: true, health: 200 });
  Object.assign(right, { x: 12.5, z: 17.3, alive: true, health: 200 });
  game.switchWeapon('p1');
  game.update(.1, {}); game.update(.06, {});
  game.drainEvents();
  game.update(.01, { p1: { fire: true, angle: 0 }, p2: { fire: true, angle: 0 } });
  assert.equal(game.state.shots, 2); assert.equal(left.health, 102); assert.equal(right.health, 176);
  assert.equal(player(game).ammo.shells, 7); assert.equal(player(game, 'p2').ammo.pistol, 39);
  for (let n = 0; n < 3; n++) game.update(.1, { p1: { fire: true }, p2: { fire: true } });
  assert.equal(game.state.shots, 3, 'Pistol can fire again while the other scattergun cools down');
  assert.equal(player(game).ammo.shells, 7); assert.equal(player(game, 'p2').ammo.pistol, 38);
  const events = game.drainEvents();
  assert.deepEqual(events.filter(e => e.type === 'shot').map(e => e.playerId), ['p1', 'p2', 'p2']);
  assert.ok(events.filter(e => e.type === 'hit').every(e => ['p1', 'p2'].includes(e.playerId)));
  assert.equal(player(game).tutorial.weaponSwitched, true); assert.equal(player(game, 'p2').tutorial.weaponSwitched, false);
});

test('aim assistance is a personal input setting and does not leak between teammates', () => {
  const game = new CoopGame(); quiet(game);
  at(game, 'p1', 7.5, 14.5); at(game, 'p2', 14.5, 14.5);
  const [left, right] = game.state.enemies;
  Object.assign(left, { x: 7.9, z: 11, alive: true, health: 52 });
  Object.assign(right, { x: 14.9, z: 11, alive: true, health: 52 });
  game.update(.01, { p1: { fire: true, angle: 0, aimAssist: false }, p2: { fire: true, angle: 0, aimAssist: true } });
  assert.equal(left.health, 52); assert.equal(right.health, 28);
  assert.equal(game.options.aimAssist, true, 'Context switching restores the game option');
  assert.equal(game._playerRuntime.p1.aimAssist, false); assert.equal(game._playerRuntime.p2.aimAssist, true);
});

test('shared pickups award supplies once and skip a healthy player who does not need them', () => {
  const game = new CoopGame(); quiet(game);
  const ammo = game.state.pickups.find(item => item.id === 'arrival-ammo');
  at(game, 'p1', ammo.x, ammo.z); at(game, 'p2', ammo.x, ammo.z);
  game.drainEvents(); game.update(.01, {});
  assert.equal(player(game).ammo.pistol + player(game, 'p2').ammo.pistol, 80 + ammo.amount);
  assert.equal(game.drainEvents().filter(e => e.type === 'pickup').length, 1);
  game.update(.1, {});
  assert.equal(player(game).ammo.pistol + player(game, 'p2').ammo.pistol, 80 + ammo.amount);
  const health = game.state.pickups.find(item => item.id === 'hub-health');
  at(game, 'p1', health.x, health.z); at(game, 'p2', health.x, health.z);
  player(game, 'p2').health = 40;
  game.update(.01, {});
  assert.equal(player(game).health, 100); assert.equal(player(game, 'p2').health, 80);
  assert.ok(game.drainEvents().some(e => e.type === 'pickup' && e.item === 'health' && e.playerId === 'p2'));
});

test('two players complete Crosslink through real movement and share key, doors and relay progress', () => {
  const game = new CoopGame(); quiet(game); power(game);
  assert.equal(game.state.checkpoint, true); assert.equal(pathTo(game, key(game)), null);
  walkTo(game, feature(game, 'relay-west'), 'p1'); assert.equal(use(game, 'p1'), true);
  assert.equal(use(game, 'p1'), false); assert.equal(game.getMissionProgress().relaysUsed, 1);
  walkTo(game, { x: 11.5, z: 11.5 }, 'p1'); assert.equal(use(game, 'p1'), false);
  walkTo(game, feature(game, 'relay-east'), 'p2'); assert.equal(use(game, 'p2'), true);
  assert.equal(game.getMissionProgress().relaysUsed, 2);
  assert.equal(game.getObjective('p2').stage, 'vault');
  assert.equal(use(game, 'p1'), true, 'The other player can open the newly unlocked vault');
  walkTo(game, key(game), 'p2');
  assert.equal(player(game).key, true); assert.equal(player(game, 'p2').key, true);
  walkTo(game, { x: 11.5, z: 6.5 }, 'p1'); assert.equal(use(game, 'p1'), true);
  walkTo(game, feature(game, 'extraction'), 'p1'); assert.equal(use(game, 'p1'), true);
  assert.equal(game.state.status, 'won'); assert.equal(game.state.secretFound, false);
  const events = game.drainEvents();
  assert.equal(events.filter(e => e.type === 'pickup' && e.item === 'key').length, 1);
  assert.equal(events.find(e => e.type === 'pickup' && e.item === 'key').playerId, 'p2');
  assert.ok(events.filter(e => ['power', 'relay', 'door', 'checkpoint', 'win'].includes(e.type)).every(e => !e.playerId));
});

test('Crosslink secret is optional, shared and opens a connected supply cache', () => {
  const game = new CoopGame(); quiet(game); enter(game);
  const cache = game.state.pickups.find(item => item.id === 'cache-shells');
  assert.equal(pathTo(game, cache), null);
  walkTo(game, feature(game, 'cache-panel'), 'p2'); assert.equal(use(game, 'p2'), true);
  assert.equal(game.state.secretFound, true); assert.ok(pathTo(game, cache));
  assert.equal(game.state.power, false, 'The optional cache does not change mission requirements');
});

test('enemies attack either visible teammate once per tick and retarget only living reachable players', () => {
  const game = new CoopGame(); quiet(game);
  at(game, 'p1', 9.5, 18.5); at(game, 'p2', 12.5, 18.5);
  player(game).armor = 0; player(game, 'p2').armor = 0;
  const [left, right] = game.state.enemies;
  Object.assign(left, { x: 9.5, z: 17.8, alive: true, health: 52, attackCooldown: 0 });
  Object.assign(right, { x: 12.5, z: 17.8, alive: true, health: 52, attackCooldown: 0 });
  game.update(.05, {});
  assert.equal(player(game).health, 90); assert.equal(player(game, 'p2').health, 90);
  assert.equal(left.targetId, 'p1'); assert.equal(right.targetId, 'p2');
  assert.equal(game.state.time, .05);
  left.alive = false; left.health = 0;
  at(game, 'p1', 10.5, 17.5); at(game, 'p2', 10.5, 13.5);
  Object.assign(right, { x: 10.5, z: 15.5, active: true, attackCooldown: 0 });
  for (let n = 0; n < 10; n++) game.update(.05, {});
  assert.equal(right.targetId, 'p2', 'Closed arrival gate blocks the nearer route to p1');
  assert.ok(right.z < 15.5);
  down(game, 'p2');
  const remainingHealth = player(game).health;
  for (let n = 0; n < 40; n++) game.update(.05, {});
  assert.equal(right.targetId, 'p1'); assert.ok(right.z < 16);
  assert.equal(player(game).health, remainingHealth, 'A sealed door blocks both chase and attacks');
});

test('one downed player waits while a teammate reaches a checkpoint and revives them nearby', () => {
  const game = new CoopGame(); quiet(game);
  down(game, 'p1');
  assert.equal(game.state.status, 'playing'); assert.equal(game.getInteractionInfo('p1'), null);
  const fallen = { x: player(game).x, z: player(game).z }, shots = game.state.shots;
  game.update(.1, { p1: { forward: 1, fire: true } });
  assert.deepEqual({ x: player(game).x, z: player(game).z }, fallen); assert.equal(game.state.shots, shots);
  assert.equal(game.interact('p1'), false); assert.equal(game.switchWeapon('p1'), false);
  power(game, 'p2');
  assert.equal(player(game).alive, true); assert.equal(player(game).health, 75);
  assert.ok(Math.hypot(player(game).x - player(game, 'p2').x, player(game).z - player(game, 'p2').z) < 2);
  assert.equal(game._wall(player(game).x, player(game).z), false);
  assert.ok(game.drainEvents().some(e => e.type === 'revive' && e.playerId === 'p1'));
});

test('both relay consoles refresh the team checkpoint, revive teammates and support a team wipe retry', () => {
  const game = new CoopGame(); quiet(game); power(game, 'p2');
  at(game, 'p1', 12.5, 18.5); down(game, 'p1');
  for (const id of ['relay-east', 'relay-west']) {
    walkTo(game, feature(game, id), 'p2'); assert.equal(use(game, 'p2'), true);
  }
  assert.equal(player(game).alive, true); assert.equal(game.getMissionProgress().relaysUsed, 2);
  const checkpointPositions = Object.fromEntries(Object.entries(game.state.players).map(([id, p]) => [id, { x: p.x, z: p.z }]));
  // Isolate the projectile impacts so each down belongs to the intended player.
  at(game, 'p1', 10.5, 18.5); at(game, 'p2', 12.5, 18.5);
  down(game, 'p1'); assert.equal(game.state.status, 'playing');
  down(game, 'p2'); assert.equal(game.state.status, 'dead');
  const frozen = copySnapshot(game); game.update(.1, { p1: { fire: true } }); assert.deepEqual(copySnapshot(game), frozen);
  assert.equal(game.restartCheckpoint(), true); assert.equal(game.state.status, 'playing');
  assert.equal(game.getMissionProgress().relaysUsed, 2);
  for (const [id, p] of Object.entries(game.state.players)) {
    assert.equal(p.alive, true); assert.ok(p.health >= 75); assert.ok(p.ammo.shells >= 6);
    assert.deepEqual({ x: p.x, z: p.z }, checkpointPositions[id]);
  }
  assert.equal(game.state.projectiles.length, 0); assert.equal(game.state.player, game.state.players.p1);
});

test('friendly fire and body blocking are disabled and empty pistol recovery is personal', () => {
  const game = new CoopGame(); quiet(game);
  at(game, 'p2', 10.5, 17.5);
  game.update(.01, { p1: { angle: 0, fire: true } });
  assert.equal(player(game, 'p2').health, 100);
  at(game, 'p1', 10.5, 18.5); at(game, 'p2', 10.5, 18.5);
  player(game).ammo.pistol = 0; player(game, 'p2').ammo.pistol = 5;
  game.update(.1, { p1: { strafe: 1, angle: 0 }, p2: { strafe: 1, angle: 0 } });
  assert.equal(player(game).x, player(game, 'p2').x); assert.ok(player(game).x > 10.5);
  for (let n = 0; n < 17; n++) game.update(.1, {});
  assert.equal(player(game).ammo.pistol, 1); assert.equal(player(game, 'p2').ammo.pistol, 5);
});

test('live snapshots retain projectiles, are detached from authority and cannot replace solo saves', () => {
  const game = new CoopGame(); game.start();
  game.state.projectiles.push({ id: 'live', x: 9.5, z: 18.5, dx: 1, dz: 0, life: 3 });
  const snapshot = game.networkSnapshot();
  assert.equal(snapshot.levelId, 'crosslink-11-v1'); assert.equal(snapshot.status, 'playing');
  assert.equal(Object.hasOwn(snapshot, 'player'), false); assert.equal(Object.hasOwn(snapshot, 'tutorial'), false);
  assert.equal(snapshot.projectiles.length, 1); assert.equal(snapshot.players.p2.id, 'p2');
  snapshot.players.p1.health = 1; snapshot.doors[0].open = true; snapshot.projectiles.length = 0;
  assert.equal(player(game).health, 100); assert.equal(game.state.doors[0].open, false); assert.equal(game.state.projectiles.length, 1);
  const before = copySnapshot(game);
  assert.equal(game.restore(new Game().serialize()), false); assert.deepEqual(copySnapshot(game), before);
  assert.throws(() => game.serialize(), /networkSnapshot/);
  assert.throws(() => new CoopGame({ players: ['p1', 'p1'] }), /distinct/);
  assert.throws(() => new CoopGame({ players: ['__proto__'] }), /distinct/);
});

test('restarting a team resets both players without mutating solo definitions or other games', () => {
  const definitions = JSON.stringify(LEVELS), solo = new Game({ mission: 'crosslink-11' });
  const soloBefore = solo.serialize();
  const game = new CoopGame(); quiet(game); power(game);
  player(game).health = 1; game.switchWeapon('p2');
  game.restart();
  assert.equal(game.state.status, 'playing'); assert.equal(game.state.power, false); assert.equal(game.state.checkpoint, false);
  assert.equal(game.restartCheckpoint(), false); assert.equal(game.state.time, 0);
  for (const p of Object.values(game.state.players)) { assert.equal(p.health, 100); assert.equal(p.alive, true); assert.equal(p.weapon, 'pistol'); }
  assert.equal(game.state.enemies.filter(enemy => enemy.alive).length, 8);
  assert.equal(JSON.stringify(LEVELS), definitions); assert.deepEqual(solo.serialize(), soloBefore);
});

test('Crosslink first live encounter is beatable solo with authored supplies and unchanged damage', () => {
  const game = new Game({ mission: 'crosslink-11', difficulty: 'standard' }); game.start();
  enter(game); walkTo(game, { x: 10.5, z: 14.5 });
  assert.equal(game.state.player.hasShotgun, true);
  for (let n = 0; n < 400 && game.state.kills < 2 && game.state.status === 'playing'; n++) {
    const p = game.state.player;
    const target = game.state.enemies.filter(e => e.alive && game.hasLineOfSight(p.x, p.z, e.x, e.z))
      .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    if (target) p.angle = Math.atan2(target.x - p.x, -(target.z - p.z));
    game.update(.05, { fire: Boolean(target) });
  }
  assert.equal(game.state.status, 'playing'); assert.ok(game.state.kills >= 2); assert.ok(game.state.player.health > 0);
});

test('both operatives can fight the authored first encounter together with standard health and damage', () => {
  const game = new CoopGame({ difficulty: 'standard', seed: 91 }); game.start();
  enter(game); walkTo(game, { x: 10.5, z: 14.5 }, 'p1'); walkTo(game, { x: 11.5, z: 14.5 }, 'p2');
  game.drainEvents();
  for (let n = 0; n < 400 && game.state.kills < 2 && game.state.status === 'playing'; n++) {
    const inputs = {};
    for (const [id, p] of Object.entries(game.state.players)) {
      const target = game.state.enemies.filter(e => e.alive && game.hasLineOfSight(p.x, p.z, e.x, e.z))
        .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
      inputs[id] = { fire: Boolean(target), angle: target ? Math.atan2(target.x - p.x, -(target.z - p.z)) : p.angle };
    }
    game.update(.05, inputs);
  }
  assert.equal(game.state.status, 'playing'); assert.ok(game.state.kills >= 2);
  assert.ok(Object.values(game.state.players).every(p => p.alive && p.health > 0));
  const shooters = new Set(game.drainEvents().filter(e => e.type === 'shot').map(e => e.playerId));
  assert.deepEqual(shooters, new Set(['p1', 'p2']));
});
