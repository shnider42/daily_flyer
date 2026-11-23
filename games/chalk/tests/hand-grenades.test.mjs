import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, setHumanPlayers, stepCoop } from '../public/sim.mjs';
import { HAND_GRENADES, flashIntensity, flashExposure, applyFlashStatus } from '../public/hand-grenades.mjs';

function arena() {
  const game = createGame({ seed: 17 });
  game.world.walls = []; game.world.buildings = []; game.world.streetSolids = []; game.grid.fill(0);
  game.enemies = []; game.civilians = []; game.survivors = []; game.maxEnemies = 0;
  const actor = game.squad[0]; Object.assign(actor, { x: 300, y: 500, angle: 0, cooldown: 0 });
  for (const other of game.squad.slice(1)) Object.assign(other, { x: 2100, y: 1700 });
  return { game, actor };
}
function run(game, seconds, input = {}) { for (let i = 0; i < Math.ceil(seconds * 60); i++) step(game, input, 1 / 60); }
function target(game, x, y, team = 'enemy') {
  const a = { id: ++game.nextId, team, name: 'Test actor', kind: team === 'enemy' ? 'rifleman' : team, x, y, hp: 100, maxHp: 100,
    alive: true, downed: false, radius: 13, angle: Math.PI, cooldown: 100, reloadTimer: 0, ammo: 30, magSize: 30, reserve: 90,
    suppression: 0, accuracy: 0, path: [], pathTimer: 0, visible: true, needsAid: team === 'civilian' };
  (team === 'civilian' ? game.civilians : game.enemies).push(a); return a;
}
function detonate(game, weapon, x, y) {
  game.grenades.push({ id: ++game.nextId, kind: 'hand', weapon, x, y, px: x, py: y, startX: x, startY: y, targetX: x, targetY: y,
    progress: 1, duration: .5, owner: game.playerId, team: 'squad', landed: true, fuseUntil: game.time + .01 });
  step(game, {}, 1 / 60);
}

test('all four roles carry finite hand grenades separately from smoke and the launcher', () => {
  const { game, actor } = arena();
  assert.ok(game.squad.every(a => a.frags === 2 && a.flashbangs === 2));
  assert.equal(game.squad[1].grenades, 4); assert.equal(actor.grenades, 0);
  step(game, { frag: true, aimX: 480, aimY: 500 }, 1 / 60);
  assert.equal(actor.frags, 1); assert.equal(actor.flashbangs, 2); assert.equal(actor.smokes, 3);
  assert.equal(game.grenades.length, 1); assert.equal(game.grenades[0].weapon, 'frag');
  step(game, { flashbang: true, aimX: 480, aimY: 500 }, 1 / 60);
  assert.equal(actor.flashbangs, 2, 'the shared hand-throw cooldown prevents overlapping throws');
  assert.ok(game.soundEvents.some(e => e.type === 'grenade_throw' && e.weapon === 'frag'));
});

test('a hand grenade lands before detonation and its fuse is measured from the throw', () => {
  const { game, actor } = arena();
  step(game, { flashbang: true, aimX: 480, aimY: 500 }, 1 / 60);
  run(game, .85);
  assert.equal(game.grenades.length, 1); assert.equal(game.grenades[0].landed, true);
  assert.equal(game.grenades[0].x, 480); assert.equal(game.grenades[0].progress, 1);
  assert.equal(game.soundEvents.some(e => e.type === 'flashbang'), false);
  run(game, .5);
  assert.equal(game.grenades.length, 0);
  const report = game.soundEvents.find(e => e.type === 'flashbang');
  assert.equal(report.sourceTime, HAND_GRENADES.flashbang.fuse);
  assert.equal(actor.flashbangs, 1);
});

test('thrown grenades stop on the near side of a wall and keep their remaining fuse', () => {
  const { game } = arena(); game.world.walls = [{ id: 'wall', x: 400, y: 400, w: 8, h: 200 }];
  const protectedActor = target(game, 445, 500, 'civilian');
  step(game, { frag: true, aimX: 520, aimY: 500 }, 1 / 60); run(game, .8);
  assert.equal(game.grenades.length, 1); assert.equal(game.grenades[0].landed, true);
  assert.ok(game.grenades[0].x < 400 && game.grenades[0].x > 398);
  assert.equal(game.soundEvents.some(e => e.type === 'explosion'), false);
  run(game, 1.7);
  assert.equal(game.grenades.length, 0); assert.equal(protectedActor.hp, 100);
  assert.equal(game.destruction.revision, 0, 'hand fragments do not breach masonry');
});

test('frag damage reaches exposed enemies, squad and civilians but is blocked by cover', () => {
  const { game, actor } = arena(); Object.assign(actor, { x: 480, y: 470 });
  const exposed = target(game, 500, 500, 'civilian'), shielded = target(game, 550, 500, 'civilian');
  const fighter = target(game, 480, 525);
  game.world.walls = [{ id: 'cover', x: 530, y: 400, w: 8, h: 200 }];
  detonate(game, 'frag', 480, 500);
  assert.ok(actor.hp < actor.maxHp); assert.ok(exposed.hp < 100); assert.ok(fighter.hp < 100);
  assert.equal(shielded.hp, 100); assert.equal(game.stats.civilianHarm, 1);
  assert.ok(game.soundEvents.some(e => e.type === 'explosion' && e.weapon === 'frag' && !e.breached));
});

test('flashbangs affect every exposed faction without health, blood, death or structural damage', () => {
  const { game, actor } = arena(); Object.assign(actor, { x: 480, y: 470 });
  const civilian = target(game, 500, 500, 'civilian'), enemy = target(game, 480, 525), covered = target(game, 550, 500, 'civilian');
  game.world.walls = [{ id: 'cover', x: 530, y: 400, w: 8, h: 200 }];
  const health = [actor, civilian, enemy, covered].map(a => a.hp);
  detonate(game, 'flashbang', 480, 500);
  assert.deepEqual([actor, civilian, enemy, covered].map(a => a.hp), health);
  for (const a of [actor, civilian, enemy]) assert.ok(flashIntensity(a, game.time) > .8);
  assert.equal(flashIntensity(covered, game.time), 0);
  assert.equal(game.stats.civilianHarm, 0); assert.equal(game.bloodstains.length, 0); assert.equal(game.bodies.length, 0);
  assert.equal(game.destruction.revision, 0); assert.ok(civilian.panicked > 0);
});

test('an open room gives strong exposure independent of facing while partitions and range shield it', () => {
  const building = { id: 'room', x: 100, y: 100, w: 350, h: 250, enterable: true };
  const world = { buildings: [building], walls: [], streetSolids: [] }, origin = { x: 120, y: 120 };
  const farCorner = { x: 420, y: 300, angle: Math.PI };
  assert.ok(flashExposure(world, origin, farCorner) > .83);
  assert.equal(flashExposure(world, origin, farCorner), flashExposure(world, origin, { ...farCorner, angle: 0 }));
  assert.equal(flashExposure(world, origin, { x: 500, y: 120 }), 0);
  world.walls = [{ x: 270, y: 100, w: 8, h: 250 }];
  assert.equal(flashExposure(world, origin, farCorner), 0);
});

test('flash impairment prevents AI fire and tracking, then recovers without a permanent stun', () => {
  const { game, actor } = arena();
  const enemy = target(game, 450, 500); enemy.cooldown = 100;
  detonate(game, 'flashbang', enemy.x, enemy.y);
  enemy.cooldown = 0; const position = { x: enemy.x, y: enemy.y }, ammo = enemy.ammo;
  run(game, .6);
  assert.deepEqual({ x: enemy.x, y: enemy.y }, position); assert.equal(enemy.ammo, ammo);
  assert.equal(enemy.tactic, 'disoriented'); assert.equal(enemy.perceivedTargetId, null);
  run(game, 3.2);
  assert.equal(flashIntensity(enemy, game.time), 0); assert.ok(enemy.ammo < ammo, 'normal firing resumes after recovery');
  assert.equal(actor.alive, true);
});

test('recovery is continuous and a weaker overlapping flash never cuts off existing impairment', () => {
  const actor = { alive: true, team: 'squad' };
  applyFlashStatus(actor, 1, 10);
  assert.equal(flashIntensity(actor, 10.1), 1);
  const before = flashIntensity(actor, 11); const until = actor.flashUntil;
  applyFlashStatus(actor, .25, 11);
  assert.ok(flashIntensity(actor, 11) >= before); assert.ok(actor.flashUntil >= until);
  assert.ok(flashIntensity(actor, 12.6) < flashIntensity(actor, 12));
  assert.equal(flashIntensity(actor, actor.flashUntil), 0);
  assert.equal(flashIntensity(actor, NaN), 0);
});

test('independent co-op soldiers consume only their own grenade inventories', () => {
  const { game, actor } = arena(), mate = game.squad[1]; Object.assign(mate, { x: 600, y: 500 });
  setHumanPlayers(game, [actor.id, mate.id]);
  stepCoop(game, { [actor.id]: { frag: true, aimX: 300, aimY: 750, throwAimX: 480, throwAimY: 500 }, [mate.id]: { flashbang: true, aimX: 780, aimY: 500 } }, 1 / 30);
  assert.equal(actor.frags, 1); assert.equal(actor.flashbangs, 2); assert.equal(mate.frags, 2); assert.equal(mate.flashbangs, 1);
  assert.deepEqual(game.grenades.map(g => [g.owner, g.weapon]), [[actor.id, 'frag'], [mate.id, 'flashbang']]);
  assert.equal(game.grenades[0].targetX,480);assert.equal(game.grenades[0].targetY,500);
  assert.equal(actor.angle,Math.PI/2,'independent continuous aim does not redirect a queued throw');
});
