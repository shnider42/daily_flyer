import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, LEVELS, MISSIONS, WEAPONS } from '../daily_flyer/themes/breach_assets/core.mjs';
import { CoopGame } from '../daily_flyer/themes/breach_assets/coop-core.mjs';

const mission = 'switchyard-15';
const object = (game, id) => [...game.state.interactables, ...game.state.doors, ...game.state.pickups, ...game.state.enemies].find(item => item.id === id);
const position = (game, point) => Object.assign(game.state.player, { x: point.x, z: point.z });

function makeQuiet(guardianAlive = false) {
  const game = new Game({ mission, seed: 97, aimAssist: false }); game.start();
  for (const enemy of game.state.enemies) if (!guardianAlive || !enemy.guardian) { enemy.alive = false; enemy.health = 0; }
  return game;
}

function pathTo(game, point) {
  const start = [Math.floor(game.state.player.x), Math.floor(game.state.player.z)], goal = `${Math.floor(point.x)},${Math.floor(point.z)}`;
  const queue = [start], previous = new Map([[start.join(','), null]]);
  const doors = new Map(game.state.doors.map(door => [`${Math.floor(door.x)},${Math.floor(door.z)}`, door]));
  for (let index = 0; index < queue.length; index++) {
    const [x, z] = queue[index], here = `${x},${z}`;
    if (here === goal) {
      const path = [];
      for (let next = here; next; next = previous.get(next)) path.push(next.split(',').map(Number));
      return path.reverse();
    }
    for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) {
      const key = `${nx},${nz}`, door = doors.get(key);
      if (previous.has(key) || game.level.grid[nz]?.[nx] !== '.' || door && !door.open && !game.canTraverseDoor(door)) continue;
      previous.set(key, here); queue.push([nx, nz]);
    }
  }
  return null;
}

function walkTo(game, point) {
  const path = pathTo(game, point);
  assert.ok(path, `Reachable ${point.id || `${point.x},${point.z}`}`);
  for (const [x, z] of path.slice(1)) {
    const door = game.state.doors.find(item => !item.open && Math.floor(item.x) === x && Math.floor(item.z) === z);
    if (door) { assert.equal(game.interact(), true, `Open ${door.id}`); assert.equal(door.open, true); }
    let count = 0;
    while (Math.hypot(x + .5 - game.state.player.x, z + .5 - game.state.player.z) > .025 && count++ < 40) {
      const player = game.state.player, gap = Math.hypot(x + .5 - player.x, z + .5 - player.z);
      player.angle = Math.atan2(x + .5 - player.x, -(z + .5 - player.z));
      game.update(Math.min(.1, gap / 3.35), { forward: 1 });
    }
    assert.ok(count < 40, `Movement reached ${x},${z}`);
  }
}

function use(game, id) { walkTo(game, object(game, id)); assert.equal(game.interact(), true, `Use ${id}`); }
function advance(game, seconds, input = {}) { for (let time = 0; time < seconds - .0001 && game.state.status === 'playing'; time += .05) game.update(.05, input); }
function powerUp(game) { walkTo(game, object(game, 'arrival')); use(game, 'aux-power'); }

function reachWorkshop(game, route) {
  powerUp(game);
  if (route === 'yard') { use(game, 'yard-control-west'); walkTo(game, { x: 32.5, z: 34.5 }); }
  else walkTo(game, { x: 7.5, z: 34.5 });
  walkTo(game, object(game, 'arc-caster'));
  assert.equal(game.state.player.hasArc, true); assert.ok(game.state.player.ammo.cells >= 12);
}

test('Switchyard is a separate compact mission with honest landmark collision and two-sided shutter controls', () => {
  const game = makeQuiet(), level = game.level;
  assert.equal(MISSIONS.find(item => item.id === mission).levelId, level.id); assert.equal(level.id, 'switchyard-15-v1');
  assert.ok(level.width < LEVELS['underworks-13'].width); assert.equal(level.enemies.length, 13);
  for (const landmark of level.landmarks) for (let z = landmark.z - landmark.depth / 2; z < landmark.z + landmark.depth / 2; z++) {
    for (let x = landmark.x - landmark.width / 2; x < landmark.x + landmark.width / 2; x++) assert.equal(level.grid[z][x], '#');
  }
  for (const door of level.doors.filter(item => item.controlledBy)) {
    const controls = level.interactables.filter(item => item.doorIds?.includes(door.id));
    assert.equal(controls.length, 2); assert.ok(controls.every(control => control.repeatable));
  }
  assert.equal(game.state.player.hasArc, false); assert.equal(game.state.player.ammo.cells, 0);
});

for (const [route, relays] of [['service', ['relay-west', 'relay-east']], ['yard', ['relay-east', 'relay-west']]]) {
  test(`actual walking completes Switchyard via ${route}, ${relays.join(' then ')}, live guardian and return grille`, () => {
    const game = makeQuiet(true);
    assert.equal(pathTo(game, object(game, 'access-key')), null);
    reachWorkshop(game, route);
    if (route === 'service') assert.equal(object(game, 'yard-shutter').open, false, 'The bypass requires no faction fight or shutter opening');
    use(game, 'upgrade-cutter'); use(game, 'workshop-refuge');
    use(game, relays[0]); assert.equal(game.canOpenDoor(object(game, 'arena-seal')), false);
    assert.equal(pathTo(game, object(game, 'access-key')), null);
    use(game, relays[1]); assert.equal(game.canOpenDoor(object(game, 'arena-seal')), true);
    walkTo(game, object(game, 'arena-seal')); assert.equal(game.getObjective().action, 'fight');
    assert.equal(game._requirementMet('guardian'), false);
    walkTo(game, { x: 22.5, z: 12.5 });
    const guardian = object(game, 'switchyard-guardian');
    assert.equal(game.selectWeapon('shotgun'), true);
    for (let count = 0; count < 300 && guardian.alive && game.state.status === 'playing'; count++) {
      const player = game.state.player;
      player.angle = Math.atan2(guardian.x - player.x, -(guardian.z - player.z));
      game.update(.05, { fire: true });
    }
    assert.equal(guardian.alive, false); assert.equal(game.state.status, 'playing');
    walkTo(game, object(game, 'access-key')); assert.equal(game.state.player.key, true);
    walkTo(game, object(game, 'return-grille')); assert.equal(object(game, 'return-grille').open, true);
    walkTo(game, object(game, 'security')); use(game, 'extraction'); assert.equal(game.state.status, 'won');
    const restored = new Game(); assert.equal(restored.restore(game.serialize()), true);
    assert.equal(restored.state.status, 'won'); assert.equal(restored.state.player.hasArc, true);
  });
}

test('the freight battle stays dormant behind closed doors and can be watched from the sheltered opening', () => {
  const game = new Game({ mission }); game.start();
  const group = game.state.enemies.filter(enemy => enemy.encounterId === 'freight-battle');
  const before = group.map(enemy => ({ health: enemy.health, x: enemy.x, z: enemy.z }));
  advance(game, 15); powerUp(game); advance(game, 15);
  assert.deepEqual(group.map(enemy => ({ health: enemy.health, x: enemy.x, z: enemy.z })), before);
  assert.ok(group.every(enemy => !enemy.encounterAwake));
  use(game, 'yard-control-west'); walkTo(game, { x: 29.5, z: 34.5 });
  const sentry = object(game, 'yard-security');
  assert.equal(game.hasLineOfSight(game.state.player.x, game.state.player.z, sentry.x, sentry.z), true);
  advance(game, 3);
  assert.ok(group.every(enemy => enemy.encounterAwake));
  assert.ok(group.some((enemy, index) => enemy.health < before[index].health));
  assert.equal(sentry.provoked, false); assert.equal(game.state.kills, 0);
  assert.ok(game.state.player.x < object(game, 'yard-shutter').x, 'Player can observe without entering the yard');
});

test('helping a sentry does not provoke it; choosing to shoot it does', () => {
  const game = makeQuiet(); powerUp(game); use(game, 'yard-control-west');
  game.selectWeapon('pistol'); advance(game, .2);
  const sentry = object(game, 'yard-security'), creature = object(game, 'yard-runner');
  Object.assign(sentry, { alive: true, health: 120, encounterAwake: true });
  Object.assign(creature, { alive: true, health: 52, x: 33.5, z: 31.5, encounterAwake: true });
  position(game, { x: 31.5, z: 31.5 }); game.state.player.angle = Math.PI / 2;
  game.update(.01, { fire: true }); assert.equal(creature.health, 28); assert.equal(sentry.provoked, false);
  advance(game, .3); game.state.player.angle = Math.atan2(sentry.x - game.state.player.x, -(sentry.z - game.state.player.z));
  game.update(.01, { fire: true }); assert.equal(sentry.provoked, true);
});

test('shutters are operated only at switches, synchronize both sides and always retain a bypass', () => {
  const game = makeQuiet(); powerUp(game);
  const door = object(game, 'yard-shutter');
  assert.equal(game.canOpenDoor(door), false); assert.equal(game.canTraverseDoor(door), false);
  use(game, 'yard-control-west'); assert.equal(door.open, true);
  assert.equal(object(game, 'yard-control-east').used, true);
  walkTo(game, object(game, 'yard-control-east')); assert.equal(game.getInteractionInfo().label, 'LOWER');
  assert.equal(game.interact(), true); assert.equal(door.open, false);
  assert.equal(object(game, 'yard-control-west').used, false);
  assert.ok(pathTo(game, object(game, 'aux-power')), 'Closing from inside leaves the service route available');
  assert.equal(game.getInteractionInfo().label, 'RAISE'); assert.equal(game.interact(), true);
  assert.equal(door.open, true);
});

test('a shutter cannot close through a living player or enemy, and a closed shutter blocks sight and plasma', () => {
  const game = makeQuiet(); powerUp(game); use(game, 'yard-control-west');
  const door = object(game, 'yard-shutter'), control = object(game, 'yard-control-west');
  position(game, { x: 29.8, z: 34.6 });
  assert.equal(game.getInteractionInfo().label, 'BLOCKED'); assert.equal(game.interact(), false); assert.equal(door.open, true);
  position(game, control);
  const blocker = object(game, 'yard-brute'); Object.assign(blocker, { alive: true, health: 145, x: 29.8, z: 34.5 });
  assert.equal(game.interact(), false); assert.equal(blocker.health, 145); assert.equal(door.open, true);
  blocker.alive = false; blocker.health = 0; assert.equal(game.interact(), true); assert.equal(door.open, false);
  assert.equal(game.hasLineOfSight(29.5, 34.5, 32.5, 34.5), false);
  game.state.projectiles.push({ id: 'door-plasma', type: 'plasma', x: 32.5, z: 34.5, dx: -4, dz: 0, life: 4 });
  advance(game, 1); assert.equal(game.state.projectiles.length, 0); assert.equal(game.state.player.health, 100);
});

test('reversible shutters can differ from a checkpoint and restore their current synchronized state', () => {
  const game = makeQuiet(); reachWorkshop(game, 'yard'); use(game, 'workshop-refuge');
  use(game, 'yard-control-east'); assert.equal(object(game, 'yard-shutter').open, false);
  const restored = new Game(); assert.equal(restored.restore(game.serialize()), true);
  assert.equal(object(restored, 'yard-shutter').open, false); assert.equal(object(restored, 'yard-control-west').used, false);
  assert.equal(restored.restartCheckpoint(), true); assert.equal(object(restored, 'yard-shutter').open, true);
  assert.equal(restored.state.player.hasArc, true); assert.ok(restored.state.player.ammo.cells >= 12);
});

function arcArena() {
  const game = makeQuiet(); position(game, { x: 32.5, z: 25.5 });
  Object.assign(game.state.player, { hasArc: true, weapon: 'arc', angle: Math.PI / 2 }); game.state.player.ammo.cells = 5;
  return game;
}

test('the arc caster has finite cells, a shorter range, a real cooldown and lower sustained damage', () => {
  const game = arcArena(), enemy = object(game, 'service-runner');
  Object.assign(enemy, { alive: true, health: 100, maxHealth: 100, x: 40.5, z: 25.5 });
  game.update(.01, { fire: true }); assert.equal(enemy.health, 100); assert.equal(game.state.player.ammo.cells, 4);
  enemy.x = 39.5; game.update(.1, { fire: true }); assert.equal(enemy.health, 100); assert.equal(game.state.shots, 1);
  advance(game, .75); game.update(.01, { fire: true }); assert.equal(enemy.health, 72);
  assert.equal(game.state.player.ammo.cells, 3); assert.ok(enemy.stunTimer > .6);
  assert.ok(WEAPONS.arc.damage / WEAPONS.arc.cooldown < WEAPONS.pistol.damage / WEAPONS.pistol.cooldown);
  game.state.player.ammo.cells = 0; advance(game, 2, { fire: true }); assert.equal(game.state.player.ammo.cells, 0);
  assert.equal(game.state.shots, 2, 'Empty arc cells do not use pistol emergency regeneration');
});

test('arc hits one target and cannot chain into nearby neutral security', () => {
  const game = arcArena(), enemy = object(game, 'service-runner'), sentry = object(game, 'yard-security');
  Object.assign(enemy, { alive: true, health: 100, x: 35.5, z: 25.5 });
  Object.assign(sentry, { alive: true, health: 120, x: 37.5, z: 25.5, encounterAwake: true });
  game.update(.01, { fire: true }); assert.equal(enemy.health, 72); assert.equal(sentry.health, 120); assert.equal(sentry.provoked, false);
  assert.equal(game.state.effects.filter(effect => effect.type === 'arc').length, 1);
  assert.equal(game.state.effects.find(effect => effect.type === 'arc').targetX, enemy.x);
});

test('arc stun stops movement, interrupts ordinary windups and expires; guardians keep their attack', () => {
  const game = arcArena(), enemy = object(game, 'phase-intro');
  Object.assign(enemy, { alive: true, health: 86, x: 35.5, z: 25.5, active: true, blinkCooldown: 0 });
  game._warning(enemy, 'blink', { x: 33.5, z: 28.5 }, .8, .65);
  game.update(.01, { fire: true }); assert.equal(enemy.telegraph, null); assert.ok(enemy.stunTimer > 0);
  const before = { x: enemy.x, z: enemy.z }; advance(game, .4);
  assert.deepEqual({ x: enemy.x, z: enemy.z }, before);
  advance(game, .5); assert.equal(enemy.stunTimer, 0); assert.ok(Math.hypot(enemy.x - before.x, enemy.z - before.z) > .1);
  enemy.alive = false; enemy.health = 0;
  const guardian = object(game, 'switchyard-guardian');
  Object.assign(guardian, { alive: true, health: 360, x: 35.5, z: 25.5, active: true, bossPhase: 'charge-windup', phaseTimer: 1 });
  game._warning(guardian, 'charge', game.state.player, 1, .78);
  game.update(.01, { fire: true }); assert.equal(guardian.stunTimer, 0); assert.equal(guardian.bossPhase, 'charge-windup');
  assert.ok(guardian.phaseTimer < 1); assert.ok(guardian.health < 360);
});

test('arc discharge respects closed shutters and manual targeting can still provoke security', () => {
  const game = arcArena(), sentry = object(game, 'yard-security');
  position(game, { x: 29.5, z: 34.5 });
  Object.assign(sentry, { alive: true, health: 120, x: 32.5, z: 34.5, encounterAwake: true });
  game.update(.01, { fire: true }); assert.equal(sentry.health, 120); assert.equal(sentry.provoked, false);
  game.state.doors.find(door => door.id === 'yard-shutter').open = true;
  advance(game, .85); game.update(.01, { fire: true });
  assert.equal(sentry.health, 92); assert.equal(sentry.provoked, true); assert.ok(sentry.stunTimer > 0);
});

test('weapon selection cycles owned weapons and rejects unowned choices', () => {
  const game = makeQuiet(); assert.equal(game.selectWeapon('arc'), false); assert.equal(game.selectWeapon('invalid'), false);
  Object.assign(game.state.player, { hasShotgun: true, hasArc: true });
  game.switchWeapon(); assert.equal(game.state.player.weapon, 'shotgun');
  game.switchWeapon(); assert.equal(game.state.player.weapon, 'arc');
  game.switchWeapon(); assert.equal(game.state.player.weapon, 'pistol');
  assert.equal(game.selectWeapon('arc'), true); assert.equal(game.state.player.weapon, 'arc');
});

test('an acquired arc caster, its remaining cells and an active stun survive a real mission save', () => {
  const game = makeQuiet(); reachWorkshop(game, 'service');
  const enemy = object(game, 'service-runner');
  Object.assign(enemy, { alive: true, health: 100, x: 26.5, z: 24.5, active: true });
  game.state.player.angle = Math.PI / 2; game.update(.01, { fire: true });
  assert.equal(enemy.health, 72); assert.ok(enemy.stunTimer > 0);
  const remaining = game.state.player.ammo.cells, restored = new Game();
  assert.equal(restored.restore(game.serialize()), true);
  assert.equal(restored.state.player.weapon, 'arc'); assert.equal(restored.state.player.ammo.cells, remaining);
  const resumedEnemy = object(restored, enemy.id); assert.equal(resumedEnemy.stunTimer, enemy.stunTimer);
  restored.resume(); const before = { x: resumedEnemy.x, z: resumedEnemy.z }; advance(restored, .3);
  assert.deepEqual({ x: resumedEnemy.x, z: resumedEnemy.z }, before);
});

test('legacy saves gain safe arc/stun defaults; new invalid equipment, shutter and capability states reject atomically', () => {
  for (const id of ['blacksite-07', 'relay-09', 'crosslink-11', 'underworks-13']) {
    const old = new Game({ mission: id }); old.start(); const save = old.serialize();
    delete save.state.player.hasArc; delete save.state.player.ammo.cells;
    for (const enemy of save.state.enemies) delete enemy.stunTimer;
    const restored = new Game(); assert.equal(restored.restore(save), true, id);
    assert.equal(restored.state.player.hasArc, false); assert.equal(restored.state.player.ammo.cells, 0);
    assert.ok(restored.state.enemies.every(enemy => enemy.stunTimer === 0));
  }
  const game = makeQuiet(); reachWorkshop(game, 'service'); const valid = game.serialize();
  for (const mutate of [save => { save.state.player.hasArc = 'true'; }, save => { save.state.player.ammo.cells = -1; },
    save => { save.state.player.hasArc = false; }, save => { save.state.enemies[0].stunTimer = -1; },
    save => { save.state.enemies.find(enemy => enemy.guardian).stunTimer = .5; },
    save => { save.state.interactables.find(item => item.id === 'yard-control-west').used = true; },
    save => { Object.assign(save.state.enemies[0], { alive: true, health: 52, x: 30.5, z: 34.5 }); },
    save => { save.state.upgrades.insulator = true; }]) {
    const save = structuredClone(valid); mutate(save); assert.equal(game.restore(save), false); assert.deepEqual(game.serialize(), valid);
  }
  const coop = new CoopGame();
  assert.ok(Object.values(coop.state.players).every(player => player.hasArc === false && player.ammo.cells === 0));
});
