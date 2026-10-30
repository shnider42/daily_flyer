import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, LEVELS } from '../daily_flyer/themes/breach_assets/core.mjs';
import { CoopGame } from '../daily_flyer/themes/breach_assets/coop-core.mjs';

function arena() {
  const game = new Game({ mission: 'underworks-13', aimAssist: false, seed: 51 });
  game.start(); game.drainEvents();
  for (const enemy of game.state.enemies) { enemy.alive = false; enemy.health = 0; }
  Object.assign(game.state.player, { x: 40.5, z: 72.5, angle: 0, armor: 0 });
  return game;
}

function actor(game, id, x, z) {
  const enemy = game.state.enemies.find(other => other.id === id);
  Object.assign(enemy, { x, z, alive: true, health: enemy.maxHealth, active: true, attackCooldown: 0 });
  return enemy;
}

function advance(game, seconds, input = {}) {
  for (let time = 0; time < seconds - .0001 && game.state.status === 'playing'; time += .05) game.update(.05, input);
}

test('new encounters are staged: intro stays familiar, security precedes late phase stalkers', () => {
  assert.equal(LEVELS['blacksite-07'].enemies.some(e => ['sentry', 'stalker'].includes(e.type)), false);
  assert.equal(LEVELS['relay-09'].enemies.filter(e => e.type === 'sentry').length, 1);
  for (const id of ['blacksite-07', 'relay-09', 'crosslink-11']) assert.equal(LEVELS[id].enemies.some(e => e.type === 'stalker'), false);
  assert.deepEqual(LEVELS['underworks-13'].enemies.filter(e => e.type === 'stalker').map(e => e.id), ['r4', 'ar3']);
});

test('a nearby unprovoked sentry ignores the player and does not block refuge safety', () => {
  const game = arena(), sentry = actor(game, 'q4', 42.5, 72.5);
  assert.equal(game.isHostileToPlayer(sentry), false);
  advance(game, 3);
  assert.equal(game.state.player.health, 100);
  assert.equal(sentry.telegraph, null);
  assert.equal(game._refugeSafe({ x: 40.5, z: 72.5 }), true);
  // Gunfire alone is not a declaration of hostility.
  game.state.player.angle = 0; game.update(.05, { fire: true });
  assert.equal(sentry.provoked, false);
});

test('manual damage provokes security, persists in saves, and its warning gives time to dodge', () => {
  const game = arena(), sentry = actor(game, 'q4', 43.5, 72.5);
  game.state.player.angle = Math.PI / 2;
  game.update(.05, { fire: true });
  assert.equal(sentry.health, 96); assert.equal(sentry.provoked, true);
  assert.equal(game.isHostileToPlayer(sentry), true);
  assert.ok(game.drainEvents().some(event => event.type === 'provoked'));
  const restored = new Game(); assert.equal(restored.restore(game.serialize()), true);
  assert.equal(restored.state.enemies.find(e => e.id === sentry.id).provoked, true);
  advance(game, .9);
  assert.equal(sentry.telegraph?.kind, 'shot');
  const aim = { ...sentry.telegraph };
  game.state.player.z += 1.3;
  advance(game, .7);
  assert.equal(game.state.player.health, 100, 'Moving out of the displayed aim point avoids the shot');
  assert.equal(aim.x, 40.5); assert.equal(aim.z, 72.5);
});

test('aim assistance does not turn a near miss into a shot at neutral security', () => {
  const game = arena(), sentry = actor(game, 'q4', 41, 69.5);
  game.options.aimAssist = true;
  game.state.player.angle = .06;
  // The sentry is inside the old assist cone but outside the actual shot line.
  game.update(.05, { fire: true });
  assert.equal(sentry.health, 120); assert.equal(sentry.provoked, false);
});

test('security and infestation fight each other while an observer is safe, without player kill credit', () => {
  const game = arena(); Object.assign(game.state.player, { x: 36.5, z: 73.5 });
  const sentry = actor(game, 'q4', 43.5, 72.5), runner = actor(game, 'a1', 41.5, 72.5);
  advance(game, 6.5);
  assert.equal(game.state.player.health, 100);
  assert.equal(sentry.provoked, false); assert.equal(runner.alive, false);
  assert.ok(sentry.health < sentry.maxHealth, 'The creature fights back');
  assert.equal(game.state.kills, 0); assert.equal(game.state.hits, 0);
  assert.ok(game.drainEvents().some(event => event.type === 'enemy-kill' && event.id === runner.id));
});

test('locked walls stop faction targeting and a distant skirmish waits for the player', () => {
  const game = new Game({ mission: 'relay-09' }); game.start();
  const sentry = game.state.enemies.find(e => e.type === 'sentry');
  const initial = game.state.enemies.map(e => e.health);
  advance(game, 4);
  assert.deepEqual(game.state.enemies.map(e => e.health), initial);
  assert.equal(sentry.provoked, false);
});

test('the authored Dead Relay north-gallery skirmish is visible without shooting either side', () => {
  const game = new Game({ mission: 'relay-09' }); game.start();
  for (const enemy of game.state.enemies) if (!['n1', 'n2', 'n3'].includes(enemy.id)) { enemy.alive = false; enemy.health = 0; }
  Object.assign(game.state.player, { x: 18.5, z: 9.5 });
  advance(game, 8);
  assert.equal(game.state.player.health, 100);
  assert.ok(game.state.enemies.find(e => e.id === 'n2').health < 120);
  assert.ok(game.state.enemies.find(e => e.id === 'n3').health < 52);
  assert.equal(game.state.kills, 0);
});

test('stalker marks its landing before a collision-safe blink and cannot damage on arrival', () => {
  const game = arena(), stalker = actor(game, 'ar3', 44.5, 72.5);
  stalker.blinkCooldown = 0;
  game.update(.05);
  const before = { x: stalker.x, z: stalker.z }, mark = { ...stalker.telegraph };
  assert.equal(mark.kind, 'blink'); assert.ok(mark.remaining >= .7);
  assert.deepEqual({ x: stalker.x, z: stalker.z }, before);
  assert.ok(game._clearCircle(mark.x, mark.z, .25));
  assert.ok(game.hasLineOfSight(before.x, before.z, mark.x, mark.z));
  advance(game, .65);
  assert.deepEqual({ x: stalker.x, z: stalker.z }, before);
  advance(game, .2);
  assert.ok(Math.hypot(stalker.x - before.x, stalker.z - before.z) > 1);
  assert.ok(stalker.attackCooldown >= .6); assert.equal(game.state.player.health, 100);
  assert.equal(stalker.telegraph, null);
});

test('stalker landing rejects walls, closed gates, occupied positions and overlap with players', () => {
  const game = arena(), stalker = actor(game, 'ar3', 44.5, 72.5);
  for (const point of [{ x: 34.5, z: 72.5 }, { x: 40.5, z: 67.5 }, { x: 40.5, z: 72.5 }]) assert.equal(game._validBlinkDestination(stalker, point), false);
  assert.equal(game._beginBlink(stalker), true);
  const point = { x: stalker.telegraph.x, z: stalker.telegraph.z };
  actor(game, 'a1', point.x, point.z);
  assert.equal(game._validBlinkDestination(stalker, point), false);
});

test('shooting a stalker during windup interrupts the blink with a real cooldown', () => {
  const game = arena(), stalker = actor(game, 'ar3', 44.5, 72.5);
  stalker.blinkCooldown = 0; game.update(.05);
  assert.equal(stalker.telegraph.kind, 'blink');
  game.state.player.angle = Math.PI / 2; game.update(.05, { fire: true });
  assert.equal(stalker.telegraph, null); assert.ok(stalker.blinkCooldown > 2.8);
  assert.equal(stalker.health, 62);
});

test('guardian charge locks its direction, can be dodged, then exposes a vulnerability window', () => {
  const game = arena(), guardian = actor(game, 'reactor-guardian', 44.5, 72.5);
  game.update(.05);
  assert.equal(guardian.bossPhase, 'charge-windup');
  const mark = { ...guardian.telegraph };
  game.state.player.z = 74.5;
  advance(game, 1.8);
  assert.equal(game.state.player.health, 100);
  assert.equal(guardian.bossPhase, 'recover');
  assert.equal(mark.z, 72.5);
  guardian.health = 360; game._damageEnemy(guardian, 24, 'player');
  const exposedDamage = 360 - guardian.health;
  guardian.health = 360; guardian.bossPhase = 'stalk'; game._damageEnemy(guardian, 24, 'player');
  assert.ok(exposedDamage > (360 - guardian.health) * 2);
});

test('guardian alternates a telegraphed spread volley with its charge and only charges once per rush', () => {
  const game = arena(), guardian = actor(game, 'reactor-guardian', 44.5, 72.5);
  guardian.bossCycle = 1; game.update(.05);
  assert.equal(guardian.bossPhase, 'volley-windup');
  const mark = { ...guardian.telegraph };
  game.state.player.z = 74.5; advance(game, 1.15);
  assert.equal(guardian.bossPhase, 'recover');
  assert.equal(game.state.projectiles.length, 3);
  assert.ok(game.state.projectiles.every(shot => shot.dx < 0));
  assert.equal(mark.z, 72.5);
  guardian.bossPhase = 'charge'; guardian.phaseTimer = .65; guardian.chargeAngle = -Math.PI / 2; guardian.chargeHit = false;
  Object.assign(game.state.player, { x: guardian.x - .4, z: guardian.z });
  game.state.projectiles = []; advance(game, .35);
  assert.equal(game.state.player.health, 73, 'One rush deals one hit, even across several simulation ticks');
});

test('a sentry keeps the warned co-op player when nearest-player selection changes during windup', () => {
  const game = new CoopGame({ mission: 'underworks-13' }); game.start();
  for (const enemy of game.state.enemies) { enemy.alive = false; enemy.health = 0; }
  const [p1, p2] = [game.state.players.p1, game.state.players.p2];
  Object.assign(p1, { x: 40.5, z: 72.5, health: 15, armor: 0 });
  Object.assign(p2, { x: 36.5, z: 73.5, health: 100, armor: 0 });
  const sentry = actor(game, 'q4', 43.5, 72.5); sentry.provoked = true;
  game.update(.05, {});
  assert.equal(sentry.telegraph.targetId, 'p1');
  assert.equal(game._validEncounterSnapshot(sentry, game.level.enemies.find(e => e.id === sentry.id), game.level), true);
  Object.assign(p2, { x: 43.5, z: 73.5 });
  advance(game, .65);
  assert.equal(sentry.targetId, 'p2', 'The normal AI really did switch its temporary player alias');
  assert.equal(p1.health, 0); assert.equal(p1.alive, false);
  assert.equal(p2.health, 100); assert.equal(p2.alive, true);
  assert.equal(game.state.status, 'playing'); assert.equal(game.state.kills, 0);
  const events = game.drainEvents();
  assert.ok(events.some(event => event.type === 'downed' && event.playerId === 'p1'));
  assert.equal(events.some(event => event.type === 'enemy-kill' && event.id === 'p1'), false);
});

test('a faction target named p1 remains an enemy rather than resolving to the co-op operator p1', () => {
  const game = new CoopGame({ mission: 'underworks-13' }); game.start();
  for (const enemy of game.state.enemies) { enemy.alive = false; enemy.health = 0; }
  Object.assign(game.state.players.p1, { x: 36.5, z: 73.5, armor: 0 });
  Object.assign(game.state.players.p2, { x: 35.5, z: 72.5, armor: 0 });
  const sentry = actor(game, 'q4', 43.5, 72.5), creature = actor(game, 'p1', 41.5, 72.5);
  game.update(.05, {});
  assert.equal(sentry.telegraph.targetId, 'p1'); assert.equal(sentry.telegraph.targetKind, 'enemy');
  advance(game, 6.5);
  assert.equal(creature.alive, false);
  assert.equal(game.state.players.p1.health, 100); assert.equal(game.state.players.p2.health, 100);
  assert.equal(sentry.provoked, false); assert.equal(game.state.kills, 0);
});

test('the guardian keeps its warned co-op victim and direction through a charge', () => {
  const game = new CoopGame({ mission: 'underworks-13' }); game.start();
  for (const enemy of game.state.enemies) { enemy.alive = false; enemy.health = 0; }
  const [p1, p2] = [game.state.players.p1, game.state.players.p2];
  Object.assign(p1, { x: 40.5, z: 72.5, armor: 0 });
  Object.assign(p2, { x: 36.5, z: 74.5, armor: 0 });
  const guardian = actor(game, 'reactor-guardian', 44.5, 72.5);
  game.update(.05, {});
  assert.equal(guardian.telegraph.targetId, 'p1');
  // Both operators move, and p2 becomes nearer. P1 remains inside the shown
  // charge lane rather than fully dodging it; the attack must not switch victims.
  p1.z = 73.2; Object.assign(p2, { x: 41.5, z: 73.1 });
  advance(game, 1.1);
  assert.equal(guardian.chargeTargetId, 'p1');
  assert.equal(guardian.targetId, 'p2');
  advance(game, .65);
  assert.equal(p1.health, 73); assert.equal(p2.health, 100);
  assert.ok(game.drainEvents().some(event => event.type === 'hurt' && event.playerId === 'p1'));
});

test('encounter saves preserve windups and old saves load with safe defaults', () => {
  const game = arena(), guardian = actor(game, 'reactor-guardian', 44.5, 72.5);
  game.update(.05); const data = game.serialize();
  const restored = new Game(); assert.equal(restored.restore(data), true);
  const next = restored.state.enemies.find(e => e.guardian);
  assert.deepEqual(next.telegraph, guardian.telegraph); assert.equal(next.bossPhase, 'charge-windup');
  advance(game, 1.1);
  assert.equal(guardian.bossPhase, 'charge'); assert.equal(guardian.chargeTargetId, 'player');
  const charging = new Game(); assert.equal(charging.restore(game.serialize()), true);
  assert.equal(charging.state.enemies.find(e => e.guardian).chargeTargetId, 'player');
  assert.equal(charging.state.enemies.find(e => e.guardian).chargeTargetKind, 'player');
  const legacy = structuredClone(data);
  for (const enemy of legacy.state.enemies) for (const key of ['faction', 'provoked', 'killedByPlayer', 'telegraph', 'blinkCooldown', 'bossPhase', 'phaseTimer', 'bossCycle', 'chargeAngle', 'chargeHit', 'chargeTargetId', 'chargeTargetKind']) delete enemy[key];
  assert.equal(restored.restore(legacy), true);
  assert.equal(restored.state.enemies.find(e => e.guardian).bossPhase, 'stalk');
  assert.equal(restored.state.enemies.find(e => e.type === 'sentry').provoked, false);
});

test('corrupt encounter fields are rejected atomically and a boss killed during windup remains saveable', () => {
  const game = arena(), guardian = actor(game, 'reactor-guardian', 44.5, 72.5);
  game.update(.05); const valid = game.serialize();
  for (const mutate of [enemy => { enemy.phaseTimer = -1; }, enemy => { enemy.provoked = 'yes'; },
    enemy => { enemy.telegraph.x = -100; }, enemy => { enemy.telegraph.remaining = 100; },
    enemy => { enemy.bossPhase = 'invincible'; }, enemy => { enemy.chargeTargetId = 'missing-player'; },
    enemy => { enemy.telegraph.targetId = 'p2'; }, enemy => { enemy.chargeTargetKind = 'unknown'; },
    enemy => { enemy.telegraph.targetKind = 'unknown'; }]) {
    const data = structuredClone(valid); mutate(data.state.enemies.find(e => e.guardian));
    assert.equal(game.restore(data), false); assert.deepEqual(game.serialize(), valid);
  }
  game._damageEnemy(guardian, 1000, 'player');
  assert.equal(guardian.alive, false);
  assert.equal(new Game().restore(game.serialize()), true);
});
