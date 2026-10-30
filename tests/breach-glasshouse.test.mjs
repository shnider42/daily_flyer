import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Game, LEVELS, MISSIONS, WEAPONS, ownedWeapons } from '../daily_flyer/themes/breach_assets/core.mjs';
import { CoopGame } from '../daily_flyer/themes/breach_assets/coop-core.mjs';

const mission = 'glasshouse-17';
const legacy = JSON.parse(readFileSync(new URL('./fixtures/breach-061-saves.json', import.meta.url), 'utf8'));
const object = (game, id) => [...game.state.interactables, ...game.state.doors, ...game.state.pickups, ...game.state.enemies].find(item => item.id === id);
const position = (player, point) => Object.assign(player, { x: point.x, z: point.z });
const quiet = (game, guardianAlive = false) => {
  for (const enemy of game.state.enemies) if (!guardianAlive || !enemy.guardian) { enemy.alive = false; enemy.health = 0; }
  return game;
};
function make(guardianAlive = false) { const game = new Game({ mission, seed: 1707, aimAssist: false }); game.start(); return quiet(game, guardianAlive); }
function advance(game, seconds, input = {}) {
  for (let remaining = seconds; remaining > .000001 && game.state.status === 'playing'; remaining -= .05) game.update(Math.min(.05, remaining), input);
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
    let frames = 0;
    while (Math.hypot(x + .5 - game.state.player.x, z + .5 - game.state.player.z) > .025 && frames++ < 40) {
      const player = game.state.player, gap = Math.hypot(x + .5 - player.x, z + .5 - player.z);
      player.angle = Math.atan2(x + .5 - player.x, -(z + .5 - player.z));
      game.update(Math.min(.1, gap / 3.35), { forward: 1 });
    }
    assert.ok(frames < 40, `Actual movement reached ${x},${z}`);
  }
}
function use(game, id) { walkTo(game, object(game, id)); assert.equal(game.interact(), true, `Use ${id}`); }
function equipEarly(game) {
  walkTo(game, object(game, 'rebound-carbine')); walkTo(game, object(game, 'pump-shotgun'));
  walkTo(game, object(game, 'arrival')); use(game, 'aux-power'); walkTo(game, object(game, 'thumper'));
}
function revive(game, id, x, z, extra = {}) {
  const enemy = object(game, id);
  Object.assign(enemy, { alive: true, health: enemy.maxHealth, x, z, active: false, attackCooldown: 1, ...extra });
  return enemy;
}
function arena() {
  const game = make();
  Object.assign(game.state.player, { x: 23.5, z: 49.5, angle: 0, hasShotgun: true, hasArc: true, hasRicochet: true, hasGrenade: true });
  Object.assign(game.state.player.ammo, { pistol: 40, shells: 12, cells: 12, slugs: 12, grenades: 8 });
  return game;
}
function fire(game, weapon, angle) {
  game.selectWeapon(weapon); game._shotCooldown = 0; game.state.player.angle = angle; game._fire();
}

test('Glasshouse is a sixth connected mission with solid landmarks, shallow floor channels and separated practice racks', () => {
  const game = make(), level = game.level;
  assert.equal(MISSIONS.at(-1).id, mission); assert.equal(level.id, 'glasshouse-17-v1');
  assert.equal(level.coopSpawns.length, 2); assert.equal(level.enemies.length, 23);
  for (const landmark of level.landmarks) for (let z = landmark.z - landmark.depth / 2; z < landmark.z + landmark.depth / 2; z++) {
    for (let x = landmark.x - landmark.width / 2; x < landmark.x + landmark.width / 2; x++) assert.equal(level.grid[z][x], '#', landmark.id);
  }
  for (const overlay of level.gardenZones) for (let z = overlay.z - overlay.depth / 2; z < overlay.z + overlay.depth / 2; z++) {
    for (let x = overlay.x - overlay.width / 2; x < overlay.x + overlay.width / 2; x++) assert.equal(level.grid[z][x], '.', `${overlay.type} overlay must describe actual walkable floor`);
  }
  assert.ok(Math.hypot(object(game, 'rebound-carbine').x - level.spawn.x, object(game, 'rebound-carbine').z - level.spawn.z) > 10);
  assert.equal(object(game, 'thumper').requires, 'power'); assert.equal(game.canOpenDoor(object(game, 'return-shortcut')), false);
  assert.equal(pathTo(game, object(game, 'relay-west')), null); assert.equal(pathTo(game, object(game, 'relay-east')), null);
});

test('the real practice-power-Thumper walk is safe with all enemies alive', () => {
  const game = new Game({ mission, aimAssist: false }); game.start();
  const before = game.state.enemies.map(enemy => ({ id: enemy.id, x: enemy.x, z: enemy.z, health: enemy.health }));
  advance(game, 3); equipEarly(game); advance(game, 2);
  assert.equal(game.state.player.health, 100); assert.ok(game.state.checkpoint);
  assert.ok(game.state.player.hasRicochet && game.state.player.hasGrenade && game.state.player.hasShotgun);
  assert.equal(game.state.player.hasArc, false);
  assert.deepEqual(game.state.enemies.map(enemy => ({ id: enemy.id, x: enemy.x, z: enemy.z, health: enemy.health })), before);
});

for (const [approach, relays] of [['west', ['relay-west', 'relay-east']], ['water', ['relay-east', 'relay-west']]]) {
  test(`actual movement completes Glasshouse through ${approach}, both relays, a live guardian and keyed return`, () => {
    const game = make(true); equipEarly(game);
    assert.equal(pathTo(game, object(game, 'access-key')), null);
    if (approach === 'water') { use(game, 'water-control-west'); walkTo(game, { x: 38.5, z: 33.5 }); }
    else walkTo(game, { x: 14.5, z: 33.5 });
    use(game, relays[0]); assert.equal(game.canOpenDoor(object(game, 'arena-seal')), false);
    assert.equal(pathTo(game, object(game, 'access-key')), null);
    use(game, relays[1]); assert.equal(game.canOpenDoor(object(game, 'arena-seal')), true);
    use(game, 'north-refuge'); walkTo(game, object(game, 'arena-seal'));
    assert.equal(game.getObjective().action, 'fight'); walkTo(game, { x: 26.5, z: 11.5 });
    const guardian = object(game, 'glasshouse-guardian'); game.selectWeapon('shotgun');
    for (let frame = 0; frame < 500 && guardian.alive && game.state.status === 'playing'; frame++) {
      const player = game.state.player; player.angle = Math.atan2(guardian.x - player.x, -(guardian.z - player.z));
      game.update(.05, { fire: true });
    }
    assert.equal(guardian.alive, false); assert.equal(game.state.status, 'playing');
    walkTo(game, object(game, 'access-key')); assert.equal(game.state.player.key, true);
    walkTo(game, object(game, 'return-shortcut')); assert.equal(object(game, 'return-shortcut').open, true);
    walkTo(game, object(game, 'security')); use(game, 'extraction'); assert.equal(game.state.status, 'won');
    const restored = new Game(); assert.equal(restored.restore(game.serialize()), true); assert.equal(restored.state.status, 'won');
  });
}

test('the two-cell cultivation shutter has a powered bypass and cannot close through either co-op operative', () => {
  const game = make(); equipEarly(game); use(game, 'water-control-west');
  walkTo(game, object(game, 'water-control-east')); assert.equal(game.interact(), true);
  assert.ok(game.state.doors.filter(door => door.controlledBy).every(door => !door.open));
  assert.ok(pathTo(game, object(game, 'aux-power')), 'The upper cultivation link remains usable');
  const coop = quiet(new CoopGame({ mission })); coop.start();
  position(coop.state.players.p1, object(coop, 'aux-power')); assert.equal(coop.interact('p1'), true);
  position(coop.state.players.p1, object(coop, 'water-control-west')); assert.equal(coop.interact('p1'), true);
  position(coop.state.players.p2, object(coop, 'east-shutter-side'));
  assert.equal(coop.interact('p1'), false); assert.ok(object(coop, 'east-shutter').open && object(coop, 'east-shutter-side').open);
  position(coop.state.players.p2, { x: 38.5, z: 34.5 });
  coop.state.projectiles.push({ id: 'grenade-1', type: 'grenade', x: 36.5, z: 33.5, dx: 0, dz: 0, life: .05, fuse: 1.5, bounces: 4, ownerId: 'p1', ownerKind: 'player' });
  assert.equal(coop.interact('p1'), false, 'A live grenade cannot be enclosed inside newly solid collision');
  coop._updateProjectiles(.05); assert.equal(coop.interact('p1'), true);
  assert.equal(coop.hasLineOfSight(35.5, 33.5, 38.5, 33.5), false);
});

test('a Rebound shot banks once from the real wall and reaches a bulwark from behind', () => {
  const direct = arena(), bank = arena();
  const front = revive(direct, 'atrium-bulwark', 22.5, 47.5, { angle: Math.atan2(1, -2) });
  const rear = revive(bank, 'atrium-bulwark', 22.5, 47.5, { angle: Math.atan2(1, -2) });
  fire(direct, 'ricochet', Math.atan2(-1, 2)); fire(bank, 'ricochet', Math.atan2(-1, 9));
  assert.equal(front.health, 165 - Math.round(38 * .22)); assert.equal(rear.health, 127);
  assert.ok(direct.drainEvents().some(event => event.type === 'shield-hit'));
  const effect = bank.state.effects.find(item => item.type === 'ricochet'); assert.equal(effect.segments.length, 2);
  assert.equal(effect.segments[0].targetZ, 44); assert.ok(bank.drainEvents().some(event => event.type === 'ricochet'));
  assert.equal(bank.state.player.ammo.slugs, 11);
});

test('Rebound range and cooldown are finite; doors absorb and there is never a second reflection', () => {
  const game = arena(); position(game.state.player, { x: 18.5, z: 15.5 });
  const enemy = revive(game, 'west-runner', 45.5, 15.5);
  fire(game, 'ricochet', Math.PI / 2); assert.equal(enemy.health, 52); assert.equal(game.state.player.ammo.slugs, 11);
  game._fire(); assert.equal(game.state.shots, 1); assert.equal(game.state.player.ammo.slugs, 11);
  const first = game.state.effects.find(item => item.type === 'ricochet');
  assert.ok(first.segments.reduce((sum, segment) => sum + Math.hypot(segment.targetX - segment.x, segment.targetZ - segment.z), 0) <= 26.001);
  position(game.state.player, { x: 35.5, z: 33.5 }); position(enemy, { x: 38.5, z: 33.5 });
  fire(game, 'ricochet', Math.PI / 2); assert.equal(enemy.health, 52);
  assert.equal(game.state.effects.filter(item => item.type === 'ricochet').at(-1).segments.length, 1);
  position(game.state.player, { x: 12.5, z: 48.5 }); fire(game, 'ricochet', Math.PI / 2);
  assert.equal(game.state.effects.filter(item => item.type === 'ricochet').at(-1).segments.length, 2);
  game.state.player.ammo.slugs = 0; game._shotCooldown = 0; game._fire(); assert.equal(game.state.shots, 3);
});

test('aim assist never retargets a reflected segment and both new weapons require deliberate auto-fire policy', () => {
  const game = arena(); game.options.aimAssist = true;
  const enemy = revive(game, 'west-runner', 21.5, 47.5);
  fire(game, 'ricochet', Math.atan2(-1, 9)); assert.equal(enemy.health, 52, 'Nearby off-line enemy is not pulled into the banked ray');
  assert.equal(WEAPONS.ricochet.autoFire, false); assert.equal(WEAPONS.grenade.autoFire, false); assert.equal(WEAPONS.grenade.aimAssistRange, 0);
});

test('bulwark bash gives time to sidestep, locks its facing and then exposes a full-damage recovery window', () => {
  const game = arena(); position(game.state.player, { x: 23.5, z: 48 });
  const enemy = revive(game, 'atrium-bulwark', 23.5, 46.5, { angle: Math.PI, attackCooldown: 0, active: true });
  game.update(.01, {}); assert.equal(enemy.telegraph?.kind, 'bash'); assert.equal(enemy.shieldPhase, 'windup');
  const angle = enemy.angle, health = game.state.player.health, armor = game.state.player.armor;
  advance(game, .7, { strafe: 1 }); assert.equal(enemy.angle, angle);
  advance(game, .15, { strafe: 1 });
  assert.equal(game.state.player.health, health); assert.equal(game.state.player.armor, armor);
  assert.equal(enemy.shieldPhase, 'exposed');
  position(game.state.player, { x: 23.5, z: 48 }); fire(game, 'ricochet', 0); assert.equal(enemy.health, 127);
  advance(game, 1.5); assert.equal(enemy.shieldPhase, 'guard');
});

test('bulwarks rotate slowly enough to flank and Arc opens their shield without disabling guardians', () => {
  const game = arena(); position(game.state.player, { x: 26.5, z: 46.5 });
  const enemy = revive(game, 'atrium-bulwark', 23.5, 46.5, { angle: 0, active: true });
  game.update(.1, {}); assert.ok(enemy.angle <= .135001);
  fire(game, 'arc', -Math.PI / 2); assert.equal(enemy.shieldPhase, 'exposed'); assert.equal(enemy.stunTimer, .65);
  const guardian = revive(game, 'glasshouse-guardian', 23.5, 48.5, { bossPhase: 'charge-windup', phaseTimer: 1 });
  game._warning(guardian, 'charge', game.state.player, 1, .78); enemy.alive = false; enemy.health = 0;
  fire(game, 'arc', Math.atan2(guardian.x - game.state.player.x, -(guardian.z - game.state.player.z)));
  assert.equal(guardian.bossPhase, 'charge-windup'); assert.equal(guardian.stunTimer, 0);
});

test('menders visibly wind up before one bounded heal; moving allies are tracked and damage interrupts it', () => {
  const game = arena(), mender = revive(game, 'west-mender', 23.5, 46.5, { active: true, healCooldown: 0 });
  const ally = revive(game, 'west-runner', 26.5, 46.5, { health: 12 });
  game.update(.01, {}); assert.equal(mender.telegraph?.kind, 'heal'); assert.equal(ally.health, 12);
  advance(game, .7); assert.equal(ally.health, 12);
  assert.ok(Math.hypot(mender.telegraph.x - ally.x, mender.telegraph.z - ally.z) < .1 && mender.telegraph.x < 26.5, 'The windup follows the moving ally within one simulation step');
  advance(game, .25); assert.equal(ally.health, 40); assert.ok(game.state.effects.some(effect => effect.type === 'heal'));
  ally.health = 10; mender.healCooldown = 0; game.update(.01, {}); assert.equal(mender.telegraph?.kind, 'heal');
  position(game.state.player, { x: mender.x, z: mender.z + 2 }); fire(game, 'pistol', 0);
  assert.equal(mender.telegraph, null); assert.equal(mender.healCooldown, 2.5);
  advance(game, 1); assert.equal(ally.health, 10); assert.ok(game.drainEvents().some(event => event.type === 'heal-interrupt'));
});

test('menders cannot heal themselves, guardians, security, dead creatures or allies through solid walls', () => {
  const game = arena(), mender = revive(game, 'west-mender', 23.5, 46.5, { health: 10, healCooldown: 0, active: true });
  revive(game, 'research-security', 24.5, 46.5, { health: 10 });
  revive(game, 'glasshouse-guardian', 25.5, 46.5, { health: 10 });
  game._updateMender(mender, .1); assert.equal(mender.telegraph, null);
  const ally = revive(game, 'west-runner', 9.5, 45.5, { health: 10 }); position(mender, { x: 9.5, z: 43.5 });
  game._updateMender(mender, .1); assert.equal(mender.telegraph, null);
  position(ally, { x: 11.5, z: 43.5 }); game._updateMender(mender, .1); assert.equal(mender.telegraph?.kind, 'heal');
  ally.alive = false; ally.health = 0; game._updateMender(mender, 1);
  assert.equal(ally.health, 0); assert.equal(ally.alive, false); assert.equal(mender.telegraph, null);
});

test('a thrown grenade travels visibly, bounces with energy loss, keeps its fuse and explodes only once', () => {
  const game = arena(); position(game.state.player, { x: 31.5, z: 49.5 }); fire(game, 'grenade', Math.PI);
  assert.equal(game.state.projectiles.length, 1); const grenade = game.state.projectiles[0];
  assert.equal(grenade.ownerId, 'player'); assert.equal(grenade.life, 1.5); assert.equal(game.state.player.ammo.grenades, 7);
  advance(game, .4); assert.equal(grenade.bounces, 1); assert.ok(grenade.dz < 0); assert.ok(Math.hypot(grenade.dx, grenade.dz) < 6);
  assert.ok(grenade.life > 1); advance(game, 1.11); assert.equal(game.state.projectiles.length, 0);
  assert.equal(game.drainEvents().filter(event => event.type === 'explosion').length, 1);
  advance(game, 2); assert.equal(game.drainEvents().filter(event => event.type === 'explosion').length, 0);
});

test('grenade splash uses wall visibility and the explosion origin against directional shields', () => {
  const game = arena(); position(game.state.player, { x: 14.5, z: 48.5 });
  const protectedEnemy = revive(game, 'west-runner', 9.5, 43.5);
  const visibleEnemy = revive(game, 'pump-runner', 11.5, 45.5);
  game.state.projectiles.push({ id: 'grenade-1', type: 'grenade', x: 9.5, z: 45.5, dx: 0, dz: 0, life: .05, fuse: 1.5, bounces: 4, ownerId: 'player', ownerKind: 'player' });
  game._updateProjectiles(.05); assert.equal(protectedEnemy.health, 52); assert.ok(visibleEnemy.health < 52);
  protectedEnemy.alive = false; visibleEnemy.alive = false;
  const shield = revive(game, 'atrium-bulwark', 23.5, 47.5, { angle: Math.PI });
  game._explodeGrenade({ x: 23.5, z: 49, ownerId: 'player' }); const frontalDamage = 165 - shield.health;
  shield.health = 165; game._explodeGrenade({ x: 23.5, z: 46, ownerId: 'player' });
  assert.ok(165 - shield.health > frontalDamage * 4, 'A blast behind the shield defeats its directional armor');
});

test('co-op grenades preserve owner attribution and hurt the thrower but never the teammate', () => {
  const game = quiet(new CoopGame({ mission, aimAssist: false })); game.start();
  const p1 = game.state.players.p1, p2 = game.state.players.p2;
  position(p1, { x: 31.5, z: 46.5 }); position(p2, { x: 31.5, z: 49.5 });
  Object.assign(p2, { hasGrenade: true, weapon: 'grenade' }); p2.ammo.grenades = 2;
  const enemy = revive(game, 'west-brute', 29.5, 46.5, { health: 10, attackCooldown: 20 });
  const before = { health: p1.health, armor: p1.armor };
  game.update(.01, { p2: { angle: Math.PI, fire: true } });
  const snapshot = game.networkSnapshot(); assert.equal(snapshot.projectiles[0].ownerId, 'p2');
  advance(game, .5, { p2: { angle: Math.PI, forward: -1 } }); advance(game, 1.05);
  assert.equal(enemy.alive, false); assert.equal(game.state.kills, 1); assert.equal(p2.ammo.grenades, 1);
  assert.deepEqual({ health: p1.health, armor: p1.armor }, before); assert.ok(p2.health < 100 || p2.armor < 20);
  const events = game.drainEvents(); assert.equal(events.find(event => event.type === 'kill').playerId, 'p2');
  assert.equal(events.find(event => event.type === 'hurt').playerId, 'p2'); assert.equal(events.find(event => event.type === 'hit').playerId, 'p2');
});

test('weapon racks equip both operators once, loose ammo belongs to its collector, and explicit selection stays personal', () => {
  const game = quiet(new CoopGame({ mission, aimAssist: false })); game.start(); const { p1, p2 } = game.state.players;
  assert.equal(game.switchWeapon('p2', 'ricochet'), false);
  position(p1, object(game, 'rebound-carbine')); game.update(.01, {});
  assert.ok(p1.hasRicochet && p2.hasRicochet); assert.equal(p1.ammo.slugs, 18); assert.equal(p2.ammo.slugs, 18);
  game.update(.01, {}); assert.equal(p2.ammo.slugs, 18);
  assert.equal(game.switchWeapon('p2', 'ricochet'), true); assert.equal(p2.weapon, 'ricochet');
  position(p1, object(game, 'aux-power')); game.interact('p1');
  position(p1, object(game, 'thumper')); game.update(.01, {}); position(p2, object(game, 'arc-caster')); game.update(.01, {});
  assert.deepEqual(ownedWeapons(p1), ['pistol', 'shotgun', 'arc', 'ricochet', 'grenade']); assert.deepEqual(ownedWeapons(p2), ownedWeapons(p1));
  const before = p1.ammo.grenades; position(p2, object(game, 'west-grenades')); game.update(.01, {});
  assert.equal(p1.ammo.grenades, before); assert.equal(p2.ammo.grenades, before + 5);
  assert.equal(game.switchWeapon('p2', 'not-a-weapon'), false); assert.equal(game.switchWeapon('p1', 'grenade'), true);
  assert.notEqual(p1.weapon, p2.weapon); game.switchWeapon('p1'); assert.equal(p1.weapon, 'pistol');
  position(p1, object(game, 'atrium-refuge')); assert.equal(game.interact('p1'), true);
  const saved = game.networkSnapshot(); p1.ammo.grenades = 0; p2.hasRicochet = false;
  assert.equal(game.restartCheckpoint(), true); assert.deepEqual(game.state.players.p1.ammo, saved.players.p1.ammo);
  assert.deepEqual(ownedWeapons(game.state.players.p2), ['pistol', 'shotgun', 'arc', 'ricochet', 'grenade']);
});

test('co-op bank-shot feedback and shield feedback belong to the actual shooter', () => {
  const game = quiet(new CoopGame({ mission, aimAssist: false })); game.start();
  const p2 = game.state.players.p2; position(p2, { x: 23.5, z: 49.5 }); Object.assign(p2, { hasRicochet: true, weapon: 'ricochet' }); p2.ammo.slugs = 3;
  const enemy = revive(game, 'atrium-bulwark', 22.5, 47.5, { angle: Math.atan2(1, -2) });
  game.update(.01, { p2: { angle: Math.atan2(-1, 2), fire: true } });
  const events = game.drainEvents(); assert.equal(events.find(event => event.type === 'shield-hit').playerId, 'p2');
  assert.equal(events.find(event => event.type === 'hit').playerId, 'p2'); assert.ok(enemy.health < 165);
});

test('an existing enemy named p2 never attributes faction damage to operative p2', () => {
  const game = new CoopGame({ mission: 'underworks-13' }); game.start(); game.drainEvents();
  const source = game.state.enemies.find(enemy => enemy.id === 'p2'), sentry = game.state.enemies.find(enemy => enemy.type === 'sentry');
  game._damageEnemy(sentry, 999, source);
  assert.equal(game.state.kills, 0); assert.equal(sentry.killedByPlayer, false);
  const event = game.drainEvents().find(item => item.type === 'enemy-kill');
  assert.equal(event.sourceId, 'p2'); assert.equal(event.playerId, undefined);
});

test('owned weapons and a live thrown grenade survive solo save with the remaining fuse and spent ammunition intact', () => {
  const game = make(); equipEarly(game); position(game.state.player, { x: 31.5, z: 49.5 }); fire(game, 'grenade', Math.PI);
  advance(game, .4); const saved = game.serialize(), restored = new Game(); assert.equal(restored.restore(saved), true);
  assert.equal(restored.state.player.hasGrenade, true); assert.equal(restored.state.player.ammo.grenades, 5);
  assert.deepEqual(restored.state.projectiles, game.state.projectiles); const oldId = restored.state.projectiles[0].id;
  restored.resume(); advance(restored, 1.11); assert.equal(restored.state.projectiles.length, 0);
  assert.equal(restored.drainEvents().filter(event => event.type === 'explosion').length, 1);
  fire(restored, 'grenade', 0); assert.notEqual(restored.state.projectiles[0].id, oldId);
});

test('bulwark windup and mender support targets restore without losing telegraphs or vulnerability timing', () => {
  const game = make(); equipEarly(game);
  position(game.state.player, { x: 23.5, z: 48 });
  const shield = revive(game, 'atrium-bulwark', 23.5, 46.5, { angle: Math.PI, active: true, attackCooldown: 0 });
  const mender = revive(game, 'west-mender', 28.5, 47.5, { healCooldown: 0, active: true });
  revive(game, 'west-runner', 29.5, 46.5, { health: 10 });
  game.update(.01, {}); assert.equal(shield.telegraph.kind, 'bash'); assert.equal(mender.telegraph.kind, 'heal');
  const restored = new Game(); assert.equal(restored.restore(game.serialize()), true);
  assert.deepEqual(object(restored, shield.id).telegraph, shield.telegraph); assert.equal(object(restored, shield.id).shieldTimer, shield.shieldTimer);
  assert.deepEqual(object(restored, mender.id).telegraph, mender.telegraph);
});

test('actual 0.6.1 saves restore with new defaults and every existing mission keeps its authored geometry', () => {
  for (const fixture of legacy.fixtures) {
    const game = new Game(); assert.equal(game.restore(fixture.save), true, fixture.name);
    assert.equal(game.state.player.hasRicochet, false); assert.equal(game.state.player.hasGrenade, false);
    assert.equal(game.state.player.ammo.slugs, 0); assert.equal(game.state.player.ammo.grenades, 0); assert.deepEqual(game.state.projectiles, []);
    assert.equal(game.state.player.ammo.cells, fixture.save.state.player.ammo.cells);
    if (fixture.save.checkpoint) assert.equal(game.restartCheckpoint(), true);
  }
  for (const [id, expected] of Object.entries(legacy.geometry)) {
    const l = LEVELS[id], actual = createHash('sha256').update(JSON.stringify({ grid: l.grid, spawn: l.spawn, doors: l.doors, interactables: l.interactables, pickups: l.pickups, enemies: l.enemies, zones: l.zones })).digest('hex');
    assert.equal(actual, expected, `${id} must retain its 0.6 geometry and authored objects`);
  }
});

test('malformed new weapon, enemy and grenade save fields reject without mutating the active mission', () => {
  const game = make(); equipEarly(game); position(game.state.player, { x: 31.5, z: 49.5 }); fire(game, 'grenade', Math.PI); advance(game, .2);
  const valid = game.serialize();
  for (const mutate of [
    save => { save.state.player.hasRicochet = 'yes'; }, save => { save.state.player.hasGrenade = false; },
    save => { save.state.player.ammo.slugs = -1; }, save => { save.state.player.ammo.grenades = .5; },
    save => { save.state.enemies.find(enemy => enemy.type === 'bulwark').shieldPhase = 'invincible'; },
    save => { save.state.enemies.find(enemy => enemy.type === 'mender').healCooldown = Infinity; },
    save => { save.state.projectiles[0].ownerId = 'p2'; }, save => { save.state.projectiles[0].life = 9; },
    save => { save.state.projectiles[0].dx = 99; }, save => { save.state.projectiles[0].bounces = 8; },
    save => { save.state.projectiles[0].x = 1.5; }, save => { save.state.projectiles.push({ ...save.state.projectiles[0] }); },
  ]) {
    const corrupted = structuredClone(valid); mutate(corrupted);
    assert.equal(game.restore(corrupted), false); assert.deepEqual(game.serialize(), valid);
  }
});
