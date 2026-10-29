import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, LEVEL, LEVELS, MISSIONS, getLevel } from '../daily_flyer/themes/breach_assets/core.mjs';

function pathTo(game, target) {
  const p = game.state.player;
  const start = [Math.floor(p.x), Math.floor(p.z)];
  const goal = [Math.floor(target.x), Math.floor(target.z)].join(',');
  const queue = [start], visited = new Map([[start.join(','), null]]);
  for (let n = 0; n < queue.length; n++) {
    const [x, z] = queue[n], key = `${x},${z}`;
    if (key === goal) {
      const path = [];
      for (let k = key; k; k = visited.get(k)) path.push(k.split(',').map(Number));
      return path.reverse();
    }
    for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) {
      const k = `${nx},${nz}`;
      if (visited.has(k) || game._wall(nx + .5, nz + .5)) continue;
      visited.set(k, key); queue.push([nx, nz]);
    }
  }
  return null;
}

function quiet(game) {
  for (const enemy of game.state.enemies) { enemy.alive = false; enemy.health = 0; }
  game.start();
}

function walkTo(game, target) {
  const path = pathTo(game, target);
  assert.ok(path, `Walkable path to ${JSON.stringify(target)}`);
  for (const [x, z] of path.slice(1)) {
    const p = game.state.player;
    let steps = 0;
    while (Math.hypot(x + .5 - p.x, z + .5 - p.z) > .035 && steps++ < 120) {
      p.angle = Math.atan2(x + .5 - p.x, -(z + .5 - p.z));
      const gap = Math.hypot(x + .5 - p.x, z + .5 - p.z);
      game.update(Math.min(1 / 60, gap / 3.35), { forward: 1 });
    }
    assert.ok(steps < 120, `Movement reached cell ${x},${z}`);
  }
}

function at(game, x, z) { Object.assign(game.state.player, { x, z }); }

test('authored level has bounded rooms and all entities occupy floor cells', () => {
  assert.equal(LEVEL.grid.length, LEVEL.height);
  for (const row of LEVEL.grid) assert.equal(row.length, LEVEL.width);
  for (const entity of [LEVEL.spawn, ...LEVEL.enemies, ...LEVEL.pickups, ...LEVEL.doors, ...LEVEL.interactables]) {
    assert.notEqual(LEVEL.grid[Math.floor(entity.z)][Math.floor(entity.x)], '#', entity.id);
  }
  assert.equal(LEVEL.enemies.length, 14);
  assert.equal(new Set(LEVEL.enemies.map(e => e.id)).size, 14);
});

test('complete mission is traversable by real movement and cannot bypass power or key', () => {
  const game = new Game(); quiet(game);
  const power = LEVEL.interactables.find(i => i.type === 'power');
  const key = LEVEL.pickups.find(p => p.type === 'key');
  const exit = LEVEL.interactables.find(i => i.type === 'exit');
  assert.equal(pathTo(game, power), null, 'Arrival door begins closed');
  walkTo(game, { x: 5.5, z: 21.5 });
  assert.match(game.getPrompt(), /airlock/i);
  assert.equal(game.interact(), true);
  assert.ok(game.state.doors.filter(d => d.id.startsWith('arrival')).every(d => d.open));
  assert.equal(pathTo(game, key), null, 'Both routes to lab need power');
  walkTo(game, power); assert.equal(game.interact(), true);
  assert.equal(game.state.power, true); assert.equal(game.state.checkpoint, true);
  walkTo(game, { x: 14.5, z: 6.5 }); assert.equal(game.interact(), true);
  assert.equal(pathTo(game, exit), null, 'Extraction remains keyed');
  walkTo(game, key); assert.equal(game.state.player.key, true);
  walkTo(game, { x: 23.5, z: 22.5 }); assert.equal(game.interact(), true);
  walkTo(game, exit); assert.equal(game.interact(), true);
  assert.equal(game.state.status, 'won');
  assert.ok(game.drainEvents().some(e => e.type === 'win'));
});

test('closed doors block motion and sight, then opening restores both', () => {
  const game = new Game(); quiet(game); at(game, 5.5, 21.5);
  assert.equal(game.hasLineOfSight(5.5, 21.5, 5.5, 19.5), false);
  for (let n = 0; n < 30; n++) game.update(.1, { forward: 1 });
  assert.ok(game.state.player.z >= 21.2);
  game.interact();
  assert.equal(game.hasLineOfSight(5.5, 21.5, 5.5, 19.5), true);
  for (let n = 0; n < 10; n++) game.update(.1, { forward: 1 });
  assert.ok(game.state.player.z < 20);
});

test('movement is time based, normalized diagonally, and ignores paused frames', () => {
  const a = new Game(), b = new Game(); quiet(a); quiet(b);
  at(a, 5.5, 25.5); at(b, 5.5, 25.5);
  const ax = a.state.player.x, az = a.state.player.z;
  a.update(.1, { forward: 1 }); b.update(.1, { forward: 1, strafe: 1 });
  assert.ok(Math.abs(Math.hypot(b.state.player.x - ax, b.state.player.z - az) - Math.hypot(a.state.player.x - ax, a.state.player.z - az)) < .00001);
  a.pause(); const snapshot = a.serialize(); a.update(100, { forward: 1, fire: true });
  assert.deepEqual(a.serialize(), snapshot);
});

test('hitscan damages only visible targets and honors fire cooldown', () => {
  const game = new Game({ aimAssist: false }); quiet(game);
  const enemy = game.state.enemies[0];
  Object.assign(enemy, { x: 5.5, z: 23.5, health: 52, alive: true });
  game.state.player.angle = 0;
  game.update(.01, { fire: true });
  assert.equal(enemy.health, 28); assert.equal(game.state.shots, 1);
  game.update(.01, { fire: true }); assert.equal(game.state.shots, 1);
  game.update(.1, { fire: true }); game.update(.1, { fire: true }); game.update(.1, { fire: true });
  assert.equal(enemy.health, 4);
  for (let n = 0; n < 3; n++) game.update(.1, { fire: true });
  assert.equal(enemy.alive, false); assert.equal(game.state.kills, 1);
  Object.assign(enemy, { x: 5.5, z: 19.5, health: 52, alive: true, active: false });
  at(game, 5.5, 21.5);
  for (let n = 0; n < 3; n++) game.update(.1, { fire: true });
  assert.equal(enemy.health, 52, 'Arrival door stops shots');
});

test('shotgun hits close threats, consumes shells and supports switching', () => {
  const game = new Game(); quiet(game);
  Object.assign(game.state.player, { hasShotgun: true, weapon: 'shotgun' });
  game.state.player.ammo.shells = 5;
  const enemy = game.state.enemies[0];
  Object.assign(enemy, { x: 5.5, z: 23.5, health: 52, alive: true });
  game.update(.016, { fire: true });
  assert.equal(game.state.player.ammo.shells, 4); assert.equal(enemy.alive, false);
  game.switchWeapon(); assert.equal(game.state.player.weapon, 'pistol');
});

test('secret cache can be opened and is optional for the main mission', () => {
  const game = new Game(); quiet(game);
  at(game, 12.5, 18.5);
  assert.equal(game.interact(), true);
  assert.equal(game.state.secretFound, true);
  assert.equal(game.state.doors.find(d => d.id === 'maintenance').open, true);
  assert.ok(pathTo(game, { x: 13.5, z: 24.5 }));
  assert.ok(game.drainEvents().some(e => e.type === 'secret'));
});

test('health pickups remain available while healthy and collect when needed', () => {
  const game = new Game(); quiet(game);
  const item = game.state.pickups.find(p => p.type === 'health');
  at(game, item.x, item.z); game.update(.016, {}); assert.equal(item.collected, false);
  game.state.player.health = 70; game.update(.016, {});
  assert.equal(item.collected, true); assert.equal(game.state.player.health, 100);
});

test('enemy projectiles obey walls and can kill with armor depleted', () => {
  const game = new Game(); quiet(game);
  game.state.projectiles.push({ id: 'wall', x: 5.5, z: 21.5, dx: 0, dz: -4, life: 3 });
  for (let n = 0; n < 10; n++) game.update(.1, {});
  assert.equal(game.state.projectiles.length, 0);
  game.state.player.health = 10; game.state.player.armor = 0;
  game.state.projectiles.push({ id: 'lethal', x: 5.5, z: 25, dx: 0, dz: 4, life: 3 });
  game.update(.1, {});
  assert.equal(game.state.status, 'dead');
  assert.ok(game.drainEvents().some(e => e.type === 'death'));
});

test('enemies cannot chase through closed airlocks', () => {
  const game = new Game(); quiet(game); at(game, 5.5, 21.5);
  const enemy = game.state.enemies[0];
  Object.assign(enemy, { x: 5.5, z: 19.5, alive: true, health: 52, active: true });
  for (let n = 0; n < 200; n++) game.update(.05, {});
  assert.ok(enemy.z < 20); assert.equal(game.state.player.health, 100);
});

test('checkpoint and saved mission round trip restores progress without transient projectiles', () => {
  const game = new Game(); quiet(game);
  at(game, 10.5, 4.5); game.interact();
  const checkpointPlayer = { ...game.state.player };
  at(game, 11.5, 7.5);
  game.state.player.health = 20;
  const data = game.serialize();
  const other = new Game(); assert.equal(other.restore(data), true);
  assert.equal(other.state.status, 'paused'); assert.equal(other.state.power, true);
  assert.equal(other.state.player.health, 20);
  assert.equal(other.state.projectiles.length, 0);
  assert.equal(other.restartCheckpoint(), true);
  assert.equal(other.state.status, 'playing');
  assert.equal(other.state.player.x, checkpointPlayer.x);
  assert.equal(other.state.player.health, checkpointPlayer.health);
});

test('corrupt, incompatible and impossible saves are rejected without changing current game', () => {
  const game = new Game(), data = game.serialize();
  const corruptions = [null, {}, { ...data, version: 99 }, { ...data, levelId: 'other' }];
  const wall = structuredClone(data); wall.state.player.x = 0; corruptions.push(wall);
  const nan = structuredClone(data); nan.state.player.health = NaN; corruptions.push(nan);
  const missing = structuredClone(data); missing.state.enemies.pop(); corruptions.push(missing);
  const duplicated = structuredClone(data); duplicated.state.doors[1].id = duplicated.state.doors[0].id; corruptions.push(duplicated);
  for (const broken of corruptions) {
    assert.equal(game.restore(broken), false); assert.deepEqual(game.serialize(), data);
  }
});

test('empty pistol recovers one emergency round and seed preserves repeatable shotgun spread', () => {
  const game = new Game(); quiet(game); game.state.player.ammo.pistol = 0;
  for (let n = 0; n < 18; n++) game.update(.1, {});
  assert.equal(game.state.player.ammo.pistol, 1);
  const a = new Game({ seed: 808 }), b = new Game({ seed: 808 });
  quiet(a); quiet(b);
  for (const g of [a, b]) { g.state.player.hasShotgun = true; g.state.player.weapon = 'shotgun'; g.state.player.ammo.shells = 5; g.update(.016, { fire: true }); }
  assert.deepEqual(a.serialize(), b.serialize());
});

test('continued runs preserve the active difficulty despite changes to next-run settings', () => {
  const game = new Game({ difficulty: 'standard', seed: 713 });
  game.start(); game.options.difficulty = 'hard'; game.options.seed = 914;
  const data = game.serialize();
  assert.equal(data.options.difficulty, 'standard'); assert.equal(data.options.seed, 713);
  const continued = new Game({ difficulty: 'relaxed' });
  assert.equal(continued.restore(data), true);
  assert.equal(continued.state.enemies[0].maxHealth, 52);
  game.restart();
  assert.equal(game.serialize().options.difficulty, 'hard');
  assert.equal(game.serialize().options.seed, 914);
  assert.equal(game.state.enemies[0].maxHealth, 62);
  assert.equal(game.state.power, false); assert.equal(game.state.checkpoint, false);
});

test('exact line of sight rejects wall-corner peeking in both directions', () => {
  const game = new Game();
  // The corner of the solid pillar at cell (7,15) touches this diagonal.
  assert.equal(game.hasLineOfSight(6.8, 15.2, 7.2, 14.8), false);
  assert.equal(game.hasLineOfSight(7.2, 14.8, 6.8, 15.2), false);
  assert.equal(game.hasLineOfSight(6.8, 15.2, 6.8, 14.8), true);
  assert.equal(game.hasLineOfSight(NaN, 15.2, 7.2, 14.8), false);
  quiet(game);
  game.state.projectiles.push({ id: 'corner', x: 6.8, z: 15.2, dx: 4, dz: -4, life: 2 });
  game.update(.1, {});
  assert.equal(game.state.projectiles.length, 0, 'Projectile cannot cross the pillar corner between substeps');
});

test('security gate requires power as well as the access key', () => {
  const game = new Game(); quiet(game); at(game, 23.5, 22.5);
  game.state.player.key = true;
  assert.match(game.getPrompt(), /restore power/i);
  assert.equal(game.interact(), false);
  assert.equal(game.state.doors.find(d => d.id === 'security').open, false);
  game.state.power = true;
  assert.equal(game.interact(), true);
});

test('save validation rejects conflicting progression flags and a player inside a closed door', () => {
  const game = new Game(), original = game.serialize();
  const power = structuredClone(original); power.state.power = true;
  const key = structuredClone(original); key.state.player.key = true;
  const pair = structuredClone(original); pair.state.doors[0].open = true;
  const trapped = structuredClone(original); trapped.state.player.x = 5.5; trapped.state.player.z = 20.5;
  for (const invalid of [power, key, pair, trapped]) assert.equal(game.restore(invalid), false);
  assert.deepEqual(game.serialize(), original);
});

test('first live encounter is beatable with the starting pistol and normal damage', () => {
  const game = new Game({ difficulty: 'standard', aimAssist: true }); game.start();
  walkTo(game, { x: 5.5, z: 21.5 }); game.interact();
  walkTo(game, { x: 5.5, z: 17.5 });
  for (let n = 0; n < 400 && game.state.kills < 3 && game.state.status === 'playing'; n++) {
    const p = game.state.player;
    const target = game.state.enemies.filter(e => e.alive && Math.hypot(e.x - p.x, e.z - p.z) < 10 && game.hasLineOfSight(p.x, p.z, e.x, e.z))
      .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    if (target) p.angle = Math.atan2(target.x - p.x, -(target.z - p.z));
    game.update(.05, { fire: Boolean(target) });
  }
  assert.equal(game.state.status, 'playing');
  assert.equal(game.state.kills, 3);
  assert.ok(game.state.player.health > 0);
  assert.ok(game.state.player.ammo.pistol > 0);
});

test('objective actions distinguish walk-over key collection from doors and terminals', () => {
  const game = new Game(); quiet(game);
  assert.equal(game.getObjective().action, 'interact', 'Arrival airlock uses an interaction');
  at(game, 5.5, 21.5); game.interact();
  assert.equal(game.getObjective().action, 'interact', 'Generator console uses an interaction');
  at(game, 10.5, 4.5); game.interact();
  at(game, 25.5, 4.5);
  assert.equal(game.getObjective().action, 'collect', 'Nearby key must be walked over');
  assert.equal(game.getPrompt(), '', 'Key does not provide a use prompt');
  at(game, 26.5, 4.5); game.update(.016, {});
  assert.equal(game.getObjective().action, 'interact', 'Security gate uses an interaction');
  at(game, 23.5, 22.5); game.interact();
  assert.equal(game.getObjective().action, 'interact', 'Extraction terminal uses an interaction');
  at(game, 26.5, 25.5); game.interact();
  assert.equal(game.state.status, 'won');
  assert.equal(game.getObjective().action, undefined, 'Completed objective has no remaining action');
});

test('interaction information reports actionable controls and unmet requirements accurately', () => {
  const game = new Game(); quiet(game);
  assert.equal(game.getInteractionInfo(), null, 'No nearby interaction at spawn');
  assert.equal(game.getPrompt(), '');
  at(game, 5.5, 21.5);
  assert.deepEqual(game.getInteractionInfo(), { text: 'Open airlock', label: 'OPEN', canUse: true });
  game.pause(); assert.equal(game.getInteractionInfo().canUse, false); assert.equal(game.interact(), false);
  game.resume(); assert.equal(game.interact(), true);
  at(game, 14.5, 6.5);
  assert.deepEqual(game.getInteractionInfo(), { text: 'Airlock offline — restore power', label: 'OFFLINE', canUse: false });
  assert.equal(game.getPrompt(), game.getInteractionInfo().text); assert.equal(game.interact(), false);
  at(game, 12.5, 18.5);
  assert.equal(game.getInteractionInfo().label, 'INSPECT'); assert.equal(game.getInteractionInfo().canUse, true);
  at(game, 10.5, 4.5);
  assert.equal(game.getInteractionInfo().label, 'POWER'); assert.equal(game.getInteractionInfo().canUse, true);
  assert.equal(game.interact(), true);
  at(game, 23.5, 22.5);
  assert.deepEqual(game.getInteractionInfo(), { text: 'Security gate — access key required', label: 'LOCKED', canUse: false });
  assert.equal(game.interact(), false);
  at(game, 26.5, 25.5);
  assert.equal(game.getInteractionInfo().label, 'LOCKED'); assert.equal(game.getInteractionInfo().canUse, false);
  at(game, 26.5, 4.5); game.update(.016, {});
  at(game, 26.5, 25.5);
  assert.deepEqual(game.getInteractionInfo(), { text: 'Signal extraction', label: 'EXTRACT', canUse: true });
  assert.equal(game.interact(), true); assert.equal(game.state.status, 'won');
});

function enterRelay(game) {
  quiet(game);
  walkTo(game, { x: 17.5, z: 27.5 });
  assert.equal(game.interact(), true);
}

function powerRelay(game) {
  enterRelay(game);
  walkTo(game, game.level.interactables.find(i => i.type === 'power'));
  assert.equal(game.interact(), true);
}

test('mission registry preserves the original default and both maps have connected floor entities', () => {
  assert.deepEqual(MISSIONS.map(m => m.id), ['blacksite-07', 'relay-09']);
  assert.equal(getLevel(), LEVEL); assert.equal(new Game().level, LEVEL);
  assert.equal(getLevel('unknown'), LEVEL); assert.equal(getLevel('__proto__'), LEVEL);
  assert.equal(LEVEL.id, 'blacksite-07-v1');
  for (const mission of MISSIONS) {
    const game = new Game({ mission: mission.id }), level = game.level;
    assert.equal(level.id, mission.levelId); assert.equal(level.missionId, mission.id);
    assert.equal(level.grid.length, level.height);
    for (const row of level.grid) assert.equal(row.length, level.width);
    for (const door of game.state.doors) door.open = true;
    for (const entity of [level.spawn, ...level.enemies, ...level.pickups, ...level.doors, ...level.interactables]) {
      assert.notEqual(level.grid[Math.floor(entity.z)][Math.floor(entity.x)], '#', `${level.id}: ${entity.id}`);
      assert.ok(pathTo(game, entity), `${level.id}: isolated entity ${entity.id}`);
    }
  }
  assert.equal(LEVELS['relay-09'].enemies.length, 20);
  assert.notDeepEqual(LEVELS['relay-09'].grid, LEVEL.grid);
});

test('Dead Relay completes by normal movement only after power, both relays, vault and key', () => {
  const game = new Game({ mission: 'relay-09' }); enterRelay(game);
  const power = game.level.interactables.find(i => i.type === 'power');
  const west = game.level.interactables.find(i => i.id === 'relay-west');
  const east = game.level.interactables.find(i => i.id === 'relay-east');
  const key = game.level.pickups.find(i => i.type === 'key');
  const exit = game.level.interactables.find(i => i.type === 'exit');
  assert.equal(game.getObjective().stage, 'power');
  assert.equal(pathTo(game, key), null, 'The central vault begins sealed');
  walkTo(game, west);
  assert.equal(game.getInteractionInfo().label, 'OFFLINE');
  assert.equal(game.interact(), false); assert.equal(game.getMissionProgress().relaysUsed, 0);
  walkTo(game, power); assert.equal(game.interact(), true);
  assert.equal(game.getObjective().stage, 'relays');
  walkTo(game, west); assert.equal(game.getInteractionInfo().label, 'LINK'); assert.equal(game.interact(), true);
  assert.equal(game.getMissionProgress().relaysUsed, 1);
  assert.equal(pathTo(game, key), null, 'One relay cannot unlock the vault');
  walkTo(game, { x: 17.5, z: 10.5 });
  assert.equal(game.getInteractionInfo().label, 'LOCKED'); assert.equal(game.interact(), false);
  walkTo(game, east); assert.equal(game.interact(), true);
  assert.deepEqual(game.getMissionProgress(), { missionId: 'relay-09', relaysUsed: 2, relaysTotal: 2 });
  assert.equal(game.getObjective().stage, 'vault');
  assert.equal(game.serialize().checkpoint.interactables.filter(i => i.id.startsWith('relay-') && i.used).length, 2);
  walkTo(game, { x: 17.5, z: 10.5 }); assert.equal(game.interact(), true);
  assert.equal(game.getObjective().action, 'collect');
  assert.equal(pathTo(game, exit), null, 'Extraction remains locked until the key is collected');
  walkTo(game, key); assert.equal(game.state.player.key, true);
  assert.equal(game.getObjective().stage, 'gate');
  walkTo(game, { x: 17.5, z: 6.5 }); assert.equal(game.interact(), true);
  walkTo(game, exit); assert.equal(game.interact(), true);
  assert.equal(game.state.status, 'won'); assert.equal(game.getObjective().stage, 'complete');
  assert.equal(game.state.secretFound, false, 'The supply cache is optional');
  const relayEvents = game.drainEvents().filter(e => e.type === 'relay');
  assert.deepEqual(relayEvents.map(e => [e.id, e.count, e.total]), [['relay-west', 1, 2], ['relay-east', 2, 2]]);
});

test('either relay can be activated first and the completed pair survives checkpoint restart', () => {
  const game = new Game({ mission: 'relay-09' }); powerRelay(game);
  for (const id of ['relay-east', 'relay-west']) {
    walkTo(game, game.level.interactables.find(i => i.id === id));
    assert.equal(game.interact(), true);
  }
  assert.equal(game.getMissionProgress().relaysUsed, 2);
  game.state.player.health = 1;
  assert.equal(game.restartCheckpoint(), true);
  assert.equal(game.getMissionProgress().relaysUsed, 2);
  assert.equal(game.getObjective().stage, 'vault');
  assert.equal(game.state.player.x, 3.5);
  assert.ok(game.state.player.health > 1);
});

test('saved runs select the correct level and legacy saves without mission remain compatible', () => {
  const original = new Game({ difficulty: 'hard', seed: 314 }); quiet(original);
  at(original, 10.5, 4.5); original.interact();
  const legacy = original.serialize(); delete legacy.options.mission;
  const relayDefault = new Game({ mission: 'relay-09' });
  assert.equal(relayDefault.restore(legacy), true);
  assert.equal(relayDefault.level.id, LEVEL.id); assert.equal(relayDefault.options.mission, 'blacksite-07');
  assert.equal(relayDefault.serialize().options.difficulty, 'hard'); assert.equal(relayDefault.state.checkpoint, true);
  const relay = new Game({ mission: 'relay-09', seed: 771 }); powerRelay(relay);
  walkTo(relay, relay.level.interactables.find(i => i.id === 'relay-west')); relay.interact();
  const saved = relay.serialize(), continued = new Game();
  assert.equal(continued.restore(saved), true);
  assert.equal(continued.level.id, 'relay-09-v1'); assert.equal(continued.options.mission, 'relay-09');
  assert.equal(continued.state.status, 'paused'); assert.equal(continued.getMissionProgress().relaysUsed, 1);
  assert.equal(continued.state.player.x, relay.state.player.x);
  assert.equal(continued.restartCheckpoint(), true); assert.equal(continued.getMissionProgress().relaysUsed, 0);
  // Completing both relays writes the later checkpoint and persists its used flags.
  for (const id of ['relay-west', 'relay-east']) { at(continued, ...[continued.level.interactables.find(i => i.id === id).x, continued.level.interactables.find(i => i.id === id).z]); continued.interact(); }
  const afterPair = new Game(); assert.equal(afterPair.restore(continued.serialize()), true);
  assert.equal(afterPair.restartCheckpoint(), true); assert.equal(afterPair.getMissionProgress().relaysUsed, 2);
});

test('invalid cross-mission saves fail atomically without changing the active map, options or state', () => {
  const target = new Game({ mission: 'relay-09', difficulty: 'hard', seed: 813 }); target.start();
  const before = target.serialize(), beforeLevel = target.level, beforeOptions = { ...target.options };
  const wrongMap = new Game().serialize(); wrongMap.levelId = 'relay-09-v1'; wrongMap.options.mission = 'relay-09';
  const wrongMission = new Game().serialize(); wrongMission.options.mission = 'relay-09';
  const invalidRelays = new Game({ mission: 'relay-09' }).serialize(); invalidRelays.state.interactables.find(i => i.id === 'relay-west').used = true;
  const invalidGate = new Game({ mission: 'relay-09' }).serialize(); invalidGate.state.doors.find(d => d.id === 'relay-vault').open = true;
  const invalidCheckpoint = new Game().serialize(); invalidCheckpoint.checkpoint = before.state;
  for (const data of [wrongMap, wrongMission, invalidRelays, invalidGate, invalidCheckpoint]) {
    assert.equal(target.restore(data), false);
    assert.equal(target.level, beforeLevel); assert.deepEqual(target.options, beforeOptions); assert.deepEqual(target.serialize(), before);
  }
});

test('mission state changes do not mutate definitions or another mission instance', () => {
  const definitions = JSON.stringify(LEVELS);
  const original = new Game(), other = new Game({ mission: 'relay-09' }), untouched = new Game({ mission: 'relay-09' });
  const initialOther = untouched.serialize();
  powerRelay(other);
  at(other, 29.5, 24.5); assert.equal(other.interact(), true); assert.equal(other.state.secretFound, true);
  assert.equal(original.state.power, false); assert.equal(original.state.secretFound, false);
  assert.deepEqual(untouched.serialize(), initialOther);
  assert.equal(JSON.stringify(LEVELS), definitions);
  other.options.mission = 'blacksite-07'; other.restart();
  assert.equal(other.level, LEVEL); assert.equal(other.state.power, false); assert.equal(other.state.enemies.length, 14);
});

test('Dead Relay first live encounter is beatable with unchanged standard pistol damage', () => {
  const game = new Game({ mission: 'relay-09', difficulty: 'standard', aimAssist: true }); game.start();
  walkTo(game, { x: 17.5, z: 27.5 }); game.interact();
  walkTo(game, { x: 17.5, z: 24.5 });
  for (let n = 0; n < 400 && game.state.kills < 3 && game.state.status === 'playing'; n++) {
    const p = game.state.player;
    const target = game.state.enemies.filter(e => e.alive && Math.hypot(e.x - p.x, e.z - p.z) < 10 && game.hasLineOfSight(p.x, p.z, e.x, e.z))
      .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    if (target) p.angle = Math.atan2(target.x - p.x, -(target.z - p.z));
    game.update(.05, { fire: Boolean(target) });
  }
  assert.equal(game.state.status, 'playing'); assert.equal(game.state.kills, 3);
  assert.equal(game.state.player.weapon, 'pistol'); assert.ok(game.state.player.health > 0); assert.ok(game.state.player.ammo.pistol > 0);
});
