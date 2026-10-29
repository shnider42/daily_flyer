import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, LEVELS, MISSIONS } from '../daily_flyer/themes/breach_assets/core.mjs';
import { CoopGame } from '../daily_flyer/themes/breach_assets/coop-core.mjs';

const mission = 'underworks-13';
const p = (game, id = 'p1') => game.state.players?.[id] || game.state.player;
const object = (game, id) => [...game.state.interactables, ...game.state.doors, ...game.state.pickups].find(item => item.id === id);
const at = (game, target, id = 'p1') => Object.assign(p(game, id), { x: target.x, z: target.z });
const use = (game, id = 'p1') => game.interact(id);
const tick = (game, dt, input = {}, id = 'p1') => game instanceof CoopGame ? game.update(dt, { [id]: input }) : game.update(dt, input);

function quiet(game, guardianAlive = false) {
  for (const enemy of game.state.enemies) {
    if (guardianAlive && enemy.guardian) continue;
    enemy.alive = false; enemy.health = 0;
  }
  game.start();
}

function pathTo(game, target, id = 'p1', openable = true) {
  const start = [Math.floor(p(game, id).x), Math.floor(p(game, id).z)];
  const goal = `${Math.floor(target.x)},${Math.floor(target.z)}`;
  const queue = [start], visited = new Map([[start.join(','), null]]);
  const doors = new Map(game.state.doors.map(door => [`${Math.floor(door.x)},${Math.floor(door.z)}`, door]));
  for (let n = 0; n < queue.length; n++) {
    const [x, z] = queue[n], here = `${x},${z}`;
    if (here === goal) {
      const result = [];
      for (let next = here; next; next = visited.get(next)) result.push(next.split(',').map(Number));
      return result.reverse();
    }
    for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) {
      const next = `${nx},${nz}`, door = doors.get(next);
      if (visited.has(next) || game.level.grid[nz]?.[nx] !== '.' || door && !door.open && (!openable || !game.canTraverseDoor(door))) continue;
      visited.set(next, here); queue.push([nx, nz]);
    }
  }
  return null;
}

function walkTo(game, target, id = 'p1') {
  const path = pathTo(game, target, id);
  assert.ok(path, `Reachable target ${target.id || `${target.x},${target.z}`}`);
  for (const [x, z] of path.slice(1)) {
    const door = game.state.doors.find(item => Math.floor(item.x) === x && Math.floor(item.z) === z && !item.open);
    if (door) {
      assert.equal(use(game, id), true, `Use ${door.id} from the adjacent floor cell`);
      assert.equal(door.open, true, `Opened ${door.id}`);
    }
    let steps = 0;
    while (Math.hypot(x + .5 - p(game, id).x, z + .5 - p(game, id).z) > .02 && steps++ < 30) {
      const player = p(game, id), angle = Math.atan2(x + .5 - player.x, -(z + .5 - player.z));
      const gap = Math.hypot(x + .5 - player.x, z + .5 - player.z);
      if (!(game instanceof CoopGame)) player.angle = angle;
      tick(game, Math.min(.1, gap / 3.35), { forward: 1, angle }, id);
    }
    assert.ok(steps < 30, `Movement reached cell ${x},${z}`);
  }
}

function activate(game, id, playerId = 'p1') {
  walkTo(game, object(game, id), playerId);
  assert.equal(use(game, playerId), true, `Activate ${id}`);
}

function grantInPlace(game, upgrade, playerId = 'p1') {
  const target = object(game, upgrade === 'power' ? 'aux-power' : `upgrade-${upgrade}`);
  at(game, target, playerId); assert.equal(use(game, playerId), true);
}

function roundTrip(game) {
  const save = game.serialize(), restored = new Game();
  assert.equal(restored.restore(save), true, 'Current exploration state and checkpoint are valid saves');
  assert.equal(restored.level.id, 'underworks-13-v1');
  assert.deepEqual(restored.state.upgrades, game.state.upgrades);
  assert.equal(restored.restartCheckpoint(), true);
  assert.deepEqual(restored.state.upgrades, game.state.upgrades);
}

function acquireByWalking(game, revisit = false) {
  activate(game, 'transit-arrival');
  walkTo(game, object(game, 'pump-shotgun'));
  assert.equal(pathTo(game, object(game, 'upgrade-cutter')), null);
  activate(game, 'aux-power');
  assert.equal(pathTo(game, object(game, 'upgrade-insulator')), null);
  activate(game, 'upgrade-cutter'); roundTrip(game);
  assert.equal(game.getObjective().stage, 'insulator');
  assert.equal(pathTo(game, object(game, 'upgrade-phase')), null);
  if (revisit) {
    // The cutter opens a new loop back through the terminal, not just the next room.
    walkTo(game, { x: 20.5, z: 67.5 });
    walkTo(game, { x: 40.5, z: 63.5 });
    assert.equal(object(game, 'foundry-return').open, true);
    assert.equal(object(game, 'quarters-grille').open, true);
    assert.equal(pathTo(game, object(game, 'health-expansion')), null);
  }
  activate(game, 'upgrade-insulator'); roundTrip(game);
  assert.equal(game.getObjective().stage, 'phase');
  if (revisit) {
    walkTo(game, { x: 40.5, z: 63.5 });
    assert.equal(object(game, 'flood-return').open, true);
    walkTo(game, { x: 20.5, z: 32.5 });
    walkTo(game, { x: 35.5, z: 32.5 });
    assert.equal(object(game, 'foundry-conduit').open, true);
  }
  activate(game, 'upgrade-phase'); roundTrip(game);
  assert.equal(game.getExplorationProgress().upgradesFound, 3);
  if (revisit) {
    walkTo(game, { x: 40.5, z: 24.5 });
    walkTo(game, { x: 40.5, z: 32.5 });
    walkTo(game, object(game, 'health-expansion'));
    assert.equal(p(game).maxHealth, 125); assert.equal(game.state.healthBonus, 25);
    assert.equal(object(game, 'hub-field').open, true, 'Phase opens a route back through the exchange');
    roundTrip(game);
  }
}

test('Underworks is one substantial authored world with nine connected sectors and safe station landings', () => {
  const game = new Game({ mission }), level = game.level;
  const floor = level.grid.join('').split('.').length - 1;
  assert.equal(level.width, 81); assert.equal(level.height, 81);
  assert.ok(level.width * level.height >= LEVELS['relay-09'].width * LEVELS['relay-09'].height * 5);
  assert.equal(floor, 3504); assert.ok(floor > level.width * level.height / 2);
  assert.equal(level.enemies.length, 40); assert.equal(level.zones.length, 9);
  assert.equal(MISSIONS.at(-1).id, mission);
  for (const door of game.state.doors) door.open = true;
  for (const entity of [level.spawn, ...level.coopSpawns, ...level.enemies, ...level.pickups, ...level.doors, ...level.interactables]) {
    assert.equal(level.grid[Math.floor(entity.z)][Math.floor(entity.x)], '.', entity.id);
    assert.ok(pathTo(game, entity), `Connected authored entity ${entity.id}`);
  }
  for (const station of level.interactables.filter(i => i.type === 'transit')) {
    assert.equal(game._clearCircle(station.landing.x, station.landing.z, .22), true);
    const partner = level.interactables.find(i => i.id === station.destination);
    assert.equal(partner.destination, station.id);
  }
  const info = game.getMapInfo();
  assert.equal(info.large, true); assert.equal(info.sectors.length, 9);
  assert.ok(info.sectors.every(s => s.bounds && s.palette));
  assert.equal(info.markers.find(m => m.type === 'guardian').active, false);
});

for (const order of [['relay-west', 'relay-east'], ['relay-east', 'relay-west']]) {
  test(`complete walking route supports ${order.join(' then ')}, a live guardian and transit back to extraction`, () => {
    const game = new Game({ mission, difficulty: 'standard', seed: 103 }); quiet(game, true);
    acquireByWalking(game, order[0] === 'relay-west');
    const seal = object(game, 'reactor-seal');
    assert.equal(pathTo(game, object(game, 'access-key')), null);
    activate(game, order[0]);
    assert.equal(game.getMissionProgress().relaysUsed, 1);
    assert.equal(game.canOpenDoor(seal), false);
    assert.equal(pathTo(game, object(game, 'access-key')), null);
    activate(game, order[1]);
    assert.equal(game.getMissionProgress().relaysUsed, 2); assert.equal(game.canOpenDoor(seal), true);
    walkTo(game, seal);
    assert.equal(game.getObjective().action, 'fight');
    assert.equal(game._requirementMet('guardian'), false);
    const guardian = game.state.enemies.find(e => e.guardian);
    assert.equal(guardian.health, 360);
    for (let n = 0; n < 200 && guardian.alive && game.state.status === 'playing'; n++) {
      const player = p(game);
      player.angle = Math.atan2(guardian.x - player.x, -(guardian.z - player.z));
      game.update(.05, { fire: true });
    }
    assert.equal(guardian.alive, false); assert.equal(game.state.status, 'playing');
    assert.equal(game.getObjective().action, 'collect');
    walkTo(game, object(game, 'access-key')); assert.equal(p(game).key, true);
    assert.equal(game.getObjective().stage, 'return');
    activate(game, 'transit-reactor');
    const before = { x: p(game).x, z: p(game).z };
    assert.equal(game.getInteractionInfo().label, 'TRAVEL'); assert.equal(use(game), true);
    assert.ok(Math.hypot(p(game).x - before.x, p(game).z - before.z) > 45);
    assert.equal(game.getZone(), 'Arrival freight terminal');
    walkTo(game, object(game, 'extraction')); assert.equal(use(game), true);
    assert.equal(game.state.status, 'won');
    const resumed = new Game(); assert.equal(resumed.restore(game.serialize()), true); assert.equal(resumed.state.status, 'won');
    assert.equal(resumed.restartCheckpoint(), true);
    assert.equal(object(resumed, 'extraction').used, false, 'Retry cannot inherit a consumed exit terminal');
    assert.equal(p(resumed).key, true); assert.equal(resumed.state.enemies.find(e => e.guardian).alive, false);
  });
}

test('capabilities and opened shortcuts persist across checkpoint retry and serialized continuation', () => {
  const game = new Game({ mission }); quiet(game);
  grantInPlace(game, 'power'); grantInPlace(game, 'cutter');
  const checkpointPosition = { x: p(game).x, z: p(game).z };
  at(game, { x: 25.5, z: 67.5 }); assert.equal(use(game), true);
  at(game, object(game, 'transit-foundry')); assert.equal(use(game), true);
  const saved = game.serialize();
  assert.equal(saved.checkpoint.doors.find(d => d.id === 'quarters-grille').open, true);
  const restored = new Game({ mission: 'relay-09' }); assert.equal(restored.restore(saved), true);
  assert.equal(restored.restartCheckpoint(), true);
  assert.equal(object(restored, 'quarters-grille').open, true); assert.equal(object(restored, 'transit-foundry').used, true);
  assert.deepEqual({ x: p(restored).x, z: p(restored).z }, checkpointPosition);
  assert.deepEqual(restored.state.upgrades, { cutter: true, insulator: false, phase: false });
});

test('exploration save validation rejects inconsistent upgrades, health rewards, opened routes and guardian keys atomically', () => {
  const source = new Game({ mission }); quiet(source);
  for (const upgrade of ['power', 'cutter', 'insulator', 'phase']) grantInPlace(source, upgrade);
  const valid = source.serialize(), target = new Game({ mission: 'crosslink-11' }); target.start();
  const before = target.serialize(), originalLevel = target.level;
  const mutate = change => { const data = structuredClone(valid); change(data); return data; };
  const corruptions = [
    mutate(d => { delete d.state.upgrades; }),
    mutate(d => { d.state.upgrades.phase = false; }),
    mutate(d => { d.state.upgrades.insulator = false; d.state.interactables.find(i => i.id === 'upgrade-insulator').used = false; }),
    mutate(d => { d.state.healthBonus = 25; d.state.player.maxHealth = 125; }),
    mutate(d => { d.state.player.health = 126; }),
    mutate(d => { d.state.player.maxHealth = 200; }),
    mutate(d => { d.state.doors.find(i => i.id === 'reactor-seal').open = true; }),
    mutate(d => { d.state.player.key = true; d.state.pickups.find(i => i.id === 'access-key').collected = true; }),
    mutate(d => { d.checkpoint.doors.find(i => i.id === 'pump-grille').open = true; }),
  ];
  for (const data of corruptions) {
    assert.equal(target.restore(data), false);
    assert.equal(target.level, originalLevel); assert.deepEqual(target.serialize(), before);
  }
  const legacy = new Game({ mission: 'blacksite-07' }).serialize(); delete legacy.options.mission;
  assert.equal(source.restore(legacy), true); assert.equal(source.level.id, 'blacksite-07-v1');
  assert.equal(source.state.upgrades, undefined);
});

test('refuges are repeatable, require a cleared fight and refill the expanded health cap', () => {
  const game = new Game({ mission }); quiet(game);
  for (const upgrade of ['power', 'cutter', 'insulator', 'phase']) grantInPlace(game, upgrade);
  at(game, { x: 9.5, z: 74.5 }); assert.equal(use(game), true);
  at(game, object(game, 'health-expansion')); game.update(.01, {});
  assert.equal(p(game).maxHealth, 125); assert.equal(p(game).health, 125);
  const refuge = object(game, 'refuge-hub'); at(game, refuge);
  p(game).health = 15; p(game).ammo.pistol = 0; p(game).ammo.shells = 0;
  const threat = game.state.enemies[0];
  Object.assign(threat, { alive: true, health: 24, x: refuge.x, z: refuge.z - 2, active: true });
  assert.equal(game.getInteractionInfo().label, 'THREAT'); assert.equal(use(game), false);
  p(game).ammo.pistol = 1; p(game).angle = 0; game.update(.01, { fire: true });
  assert.equal(threat.alive, false);
  assert.equal(use(game), true); assert.equal(p(game).health, 125); assert.ok(p(game).ammo.pistol >= 60);
  p(game).health = 20; assert.equal(use(game), true); assert.equal(p(game).health, 125);
  assert.equal(game.getExplorationProgress().refugesVisited, 1);
  roundTrip(game);
});

test('the optional rail cache uses the cutter and persists without affecting the main objective', () => {
  const game = new Game({ mission }); quiet(game);
  for (const upgrade of ['power', 'cutter', 'insulator']) grantInPlace(game, upgrade);
  at(game, { x: 40.5, z: 66.5 }); assert.equal(use(game), true);
  assert.equal(pathTo(game, object(game, 'cache-shells')), null);
  activate(game, 'cache-panel');
  assert.equal(game.state.secretFound, true); assert.ok(pathTo(game, object(game, 'cache-shells')));
  assert.equal(game.getObjective().stage, 'phase');
  assert.equal(game.restartCheckpoint(), true); assert.equal(game.state.secretFound, true);
});

test('co-op shares permanent upgrades and health expansion, transports only the actor and revives at refuges', () => {
  const game = new CoopGame({ mission }); quiet(game);
  for (const upgrade of ['power', 'cutter', 'insulator', 'phase']) grantInPlace(game, upgrade, 'p2');
  assert.equal(game.networkSnapshot().upgrades.phase, true);
  at(game, object(game, 'transit-arrival'), 'p1'); assert.equal(use(game, 'p1'), true);
  at(game, object(game, 'transit-reactor'), 'p2'); assert.equal(use(game, 'p2'), true);
  const teammateBefore = { x: p(game, 'p1').x, z: p(game, 'p1').z };
  assert.equal(use(game, 'p2'), true);
  assert.deepEqual({ x: p(game, 'p1').x, z: p(game, 'p1').z }, teammateBefore);
  assert.ok(p(game, 'p2').z > 70);
  assert.ok(game.drainEvents().some(e => e.type === 'transit' && e.playerId === 'p2'));
  // A downed teammate gains the permanent capacity, but the reward itself is not a revive.
  p(game, 'p1').health = 0; p(game, 'p1').alive = false;
  at(game, { x: 9.5, z: 74.5 }, 'p2'); assert.equal(use(game, 'p2'), true);
  at(game, object(game, 'health-expansion'), 'p2'); game.update(.01, {});
  assert.equal(p(game, 'p1').maxHealth, 125); assert.equal(p(game, 'p1').health, 0); assert.equal(p(game, 'p1').alive, false);
  assert.equal(p(game, 'p2').maxHealth, 125);
  at(game, object(game, 'refuge-quarters'), 'p2'); assert.equal(use(game, 'p2'), true);
  assert.equal(p(game, 'p1').alive, true); assert.equal(p(game, 'p1').health, 125);
  assert.ok(Math.hypot(p(game, 'p1').x - p(game, 'p2').x, p(game, 'p1').z - p(game, 'p2').z) < 2);
  assert.equal(game.restartCheckpoint(), true); assert.equal(game.state.healthBonus, 25);
  assert.ok(Object.values(game.state.players).every(player => player.maxHealth === 125 && player.alive));
});

test('a refuge cannot heal through a remote spitter standoff or erase its surviving projectile', () => {
  const game = new CoopGame({ mission }); quiet(game); grantInPlace(game, 'power');
  at(game, object(game, 'refuge-hub'), 'p1'); at(game, { x: 40.5, z: 60.5 }, 'p2');
  p(game, 'p1').health = 30; p(game, 'p2').health = 10; p(game, 'p2').armor = 0; p(game, 'p2').ammo.pistol = 2;
  const spitter = game.state.enemies.find(enemy => enemy.type === 'spitter');
  Object.assign(spitter, { x: 46.75, z: 60.5, alive: true, health: 70, active: true, attackCooldown: 0 });
  game.update(.05, {});
  assert.equal(spitter.targetId, 'p2'); assert.equal(game.state.projectiles.length, 1);
  assert.equal(game.getInteractionInfo('p1').label, 'THREAT'); assert.equal(use(game, 'p1'), false);
  assert.equal(p(game, 'p2').health, 10); assert.equal(p(game, 'p2').ammo.pistol, 2); assert.equal(game.state.projectiles.length, 1);
  spitter.alive = false; spitter.health = 0;
  assert.equal(game.getInteractionInfo('p1').canUse, false, 'The live projectile still threatens the other operative');
  assert.equal(use(game, 'p1'), false); assert.equal(p(game, 'p1').health, 30);
  game.state.projectiles[0].life = .01; game.update(.02, {});
  assert.equal(game.state.projectiles.length, 0);
  assert.equal(game.getInteractionInfo('p1').label, 'REST'); assert.equal(use(game, 'p1'), true);
  assert.equal(p(game, 'p1').health, 100); assert.equal(p(game, 'p2').health, 100); assert.equal(p(game, 'p2').ammo.pistol, 60);
});

test('large-map door collision refreshes after snapshot replacement and distant enemies stop chasing', () => {
  const game = new CoopGame({ mission }); quiet(game);
  const view = new Game({ mission }), door = object(game, 'pump-grille');
  view.state = game.networkSnapshot(); view.state.player = view.state.players.p1;
  assert.equal(view._wall(door.x, door.z), true);
  grantInPlace(game, 'power'); grantInPlace(game, 'cutter');
  at(game, { x: door.x - 1, z: door.z }); assert.equal(use(game), true);
  view.state = game.networkSnapshot(); view.state.player = view.state.players.p1;
  assert.equal(view._wall(door.x, door.z), false);
  const distant = game.state.enemies.find(e => e.guardian);
  Object.assign(distant, { alive: true, health: 360, active: true });
  at(game, game.level.spawn, 'p1'); at(game, game.level.coopSpawns[1], 'p2');
  const before = { x: distant.x, z: distant.z };
  for (let n = 0; n < 100; n++) game.update(.1, {});
  assert.deepEqual({ x: distant.x, z: distant.z }, before); assert.equal(distant.active, false);
});

for (const coop of [false, true]) {
  test(`authored freight encounter is playable with standard damage in ${coop ? 'two-player co-op' : 'solo'}`, () => {
    const game = coop ? new CoopGame({ mission, difficulty: 'standard' }) : new Game({ mission, difficulty: 'standard' }); game.start();
    walkTo(game, object(game, 'pump-shotgun')); walkTo(game, { x: 40.5, z: 63.5 });
    if (coop) walkTo(game, { x: 42.5, z: 63.5 }, 'p2');
    for (let n = 0; n < 400 && game.state.kills < 3 && game.state.status === 'playing'; n++) {
      const inputs = {};
      for (const [id, player] of Object.entries(game.state.players || { p1: game.state.player })) {
        const target = game.state.enemies.filter(e => e.alive && Math.hypot(e.x - player.x, e.z - player.z) < 15 && game.hasLineOfSight(player.x, player.z, e.x, e.z))
          .sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z))[0];
        const angle = target ? Math.atan2(target.x - player.x, -(target.z - player.z)) : player.angle;
        if (!coop) player.angle = angle;
        inputs[id] = { angle, fire: Boolean(target) };
      }
      game.update(.05, coop ? inputs : inputs.p1);
    }
    assert.equal(game.state.status, 'playing'); assert.ok(game.state.kills >= 3);
    assert.ok(Object.values(game.state.players || { solo: game.state.player }).every(player => player.health > 0));
  });
}
