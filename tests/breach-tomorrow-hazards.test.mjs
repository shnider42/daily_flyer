import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../daily_flyer/themes/breach_assets/core.mjs';
import { CoopGame } from '../daily_flyer/themes/breach_assets/coop-core.mjs';
import { TOMORROW, TOMORROW_ID } from '../daily_flyer/themes/breach_assets/tomorrow.mjs';
import { describeRoom } from '../daily_flyer/themes/breach_assets/room-catalog.mjs';
import { TOMORROW_MIMICS, TOMORROW_TRAPDOORS, TOMORROW_HATCH_WARNING,
  TOMORROW_DROP_DAMAGE, tomorrowHatchVisual, tomorrowHazardInteractionInfo,
  snapshotTomorrowHazards, validTomorrowHazardsSnapshot } from '../daily_flyer/themes/breach_assets/tomorrow-hazards.mjs';

const copy = value => structuredClone(value);
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const item = (game, id) => game.state.interactables.find(feature => feature.id === id);
const mimicBody = (game, id = 'mimic-wardrobe') => game.state.enemies.find(enemy => enemy.id === item(game, id).mimicId);
const stand = (player, point, extra = {}) => Object.assign(player, { x: point.x, z: point.z, angle: 0, jump: null, elevation: 0, ...extra });
function fixture({ coop = false, difficulty = 'standard' } = {}) {
  const game = coop ? new CoopGame({ mission: TOMORROW_ID, players: ['p1', 'p2', 'p3', 'p4'], seed: 42, difficulty, aimAssist: false })
    : new Game({ mission: TOMORROW_ID, seed: 42, difficulty, aimAssist: false });
  game.start(); game.drainEvents();
  // Isolate hazards from unrelated authored combat without removing actors or
  // invalidating their save records. Movement, interactions and checkpoints run.
  game._updateEnemies = () => {};
  game._updateProjectiles = () => {};
  return game;
}
const tick = (game, count = 1, inputs = {}) => { for (let n = 0; n < count; n++) game.update(.1, inputs); };
const powerUp = game => {
  stand(game.state.player, item(game, 'aux-power'));
  assert.equal(game.interact(game.state.player.id), true); assert.equal(game.state.power, true);
};
const arm = (game, hatchId = 'trapdoor-museum') => {
  const hatch = item(game, hatchId); stand(game.state.player, hatch); tick(game);
  assert.equal(tomorrowHatchVisual(game.state, hatch), 'warning'); return hatch;
};
const finishDrop = game => { tick(game, 10); assert.ok(Object.values(game.state.players || { solo: game.state.player }).every(player => !player.jump)); };
function reachable(game, from) {
  const seen = new Set(), queue = [[Math.floor(from.x), Math.floor(from.z)]];
  for (let n = 0; n < queue.length; n++) {
    const [x, z] = queue[n], key = `${x},${z}`;
    if (seen.has(key) || game._wall(x + .5, z + .5)) continue;
    seen.add(key); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) queue.push([x + dx, z + dz]);
  }
  return seen;
}

test('two mimics and two hatches occupy permitted optional room types with real floor and reunion routes', () => {
  const game = fixture(), controls = game.state.interactables;
  assert.equal(TOMORROW_MIMICS.length, 2); assert.equal(TOMORROW_TRAPDOORS.length, 2);
  for (const definition of TOMORROW_MIMICS) {
    const feature = item(game, definition.id), body = mimicBody(game, definition.id), room = describeRoom(game.level, feature.x, feature.z);
    assert.ok(room.permitsMimic && ['cache', 'archive'].includes(room.roomType), definition.id);
    assert.equal(feature.introducedRevision, 2); assert.equal(body.introducedRevision, 2);
    assert.equal(feature.mimicKind, definition.mimicKind); assert.equal(body.mimicKind, definition.mimicKind);
    assert.ok(game._clearCircle(feature.x, feature.z, .3));
  }
  for (const definition of TOMORROW_TRAPDOORS) {
    const hatch = item(game, definition.id), room = describeRoom(game.level, hatch.x, hatch.z);
    assert.equal(room.roomType, 'traversal'); assert.ok(room.permitsTrapdoor);
    assert.equal(hatch.introducedRevision, 2); assert.equal(hatch.width, 1.6); assert.equal(hatch.depth, 1.6);
    for (const x of [hatch.x1, hatch.x2]) for (const z of [hatch.z1, hatch.z2]) assert.ok(game._clearCircle(x, z, .15), `${hatch.id} floor patch`);
    const route = reachable(game, hatch.landing), exchange = item(game, 'aux-power');
    assert.ok(route.has(`${Math.floor(exchange.x)},${Math.floor(exchange.z)}`), `${hatch.id} can walk back before opening a gate`);
    for (const protectedControl of controls.filter(control => ['refuge', 'power', 'relay', 'exit'].includes(control.type))) {
      assert.ok(distance(hatch, protectedControl) > 2.5, `${hatch.id} does not mask ${protectedControl.id}`);
    }
  }
  for (const spawn of TOMORROW.coopSpawnVariants.flat()) {
    assert.ok(TOMORROW_TRAPDOORS.every(hatch => distance(hatch, spawn) > 10));
    assert.ok(TOMORROW_MIMICS.every(mimic => distance(mimic, spawn) > 10));
  }
});

test('unrevealed mimics are harmless dormant objects; inspection works before power and gives reaction time', () => {
  const game = fixture(), feature = item(game, 'mimic-wardrobe'), body = mimicBody(game);
  assert.equal(body.alive, false); assert.equal(body.health, 0); assert.equal(body.dormant, true);
  assert.equal(game.isHostileToPlayer(body), false);
  const enemies = game.state.enemies; game.state.enemies = [body];
  assert.equal(game._refugeSafe(feature), true, 'a concealed dormant mimic is not a phantom threat'); game.state.enemies = enemies;
  stand(game.state.player, { x: feature.x, z: feature.z + 1.5 });
  assert.equal(game.state.power, false);
  assert.match(game.getPrompt(), /breath|throat|dust/i);
  assert.equal(game.interact(), true);
  assert.equal(feature.used, true); assert.equal(body.alive, true); assert.equal(body.health, body.maxHealth);
  assert.equal(body.dormant, false); assert.equal(body.revealed, true); assert.equal(body.shadowPhase, 'revealed');
  const health = game.state.player.health;
  game._updateEnemies = dt => Game.prototype._updateEnemy.call(game, body, dt);
  tick(game, 11);
  assert.equal(game.state.player.health, health, 'revealing does not deliver an immediate hidden hit');
  assert.equal(body.telegraph, null);
  tick(game, 3);
  assert.equal(body.telegraph?.kind, 'maw', 'the first attack still shows the normal lunge warning');
  assert.equal(game.drainEvents().filter(event => event.type === 'mimic-reveal').length, 1);
});

test('entering a mimic’s reach reveals it once and pausing cannot advance a surprise', () => {
  const game = fixture(), feature = item(game, 'mimic-museum');
  stand(game.state.player, { x: feature.x, z: feature.z + 1 });
  game.pause(); tick(game, 20);
  assert.equal(feature.used, false);
  game.resume(); tick(game);
  assert.equal(feature.used, true); assert.equal(mimicBody(game, feature.id).alive, true);
  tick(game, 20);
  assert.equal(game.drainEvents().filter(event => event.type === 'mimic-reveal').length, 1);
});

test('player four can probe a disguise with a real paid shot; a teammate intercepts the first shot', () => {
  const game = fixture({ coop: true }), feature = item(game, 'mimic-wardrobe'), body = mimicBody(game);
  // The firing fixture contains just this dormant target, isolating interception
  // from the separate Warden/Unfiled encounter in the same district.
  game.state.enemies = [body];
  stand(game.state.players.p4, { x: feature.x, z: feature.z + 5 });
  stand(game.state.players.p1, { x: feature.x, z: feature.z + 3 });
  stand(game.state.players.p2, { x: 7.5, z: 49.5 }); stand(game.state.players.p3, { x: 8.5, z: 49.5 });
  const ammo = game.state.players.p4.ammo.pistol, health = game.state.players.p1.health;
  game._withPlayer('p4', () => game._fire());
  assert.equal(game.state.players.p4.ammo.pistol, ammo - 1);
  assert.ok(game.state.players.p1.health < health); assert.equal(feature.used, false);
  stand(game.state.players.p1, { x: 9.5, z: 49.5 }); tick(game, 5);
  game._withPlayer('p4', () => game._fire());
  assert.equal(feature.used, true); assert.ok(body.health < body.maxHealth, 'the same paid shot hits the revealed body');
  assert.ok(game.drainEvents().some(event => event.type === 'mimic-reveal' && event.playerId === 'p4' && event.reason === 'shot'));
});

test('an empty weapon cannot reveal a distant disguise; grenade splash can expose one behind its visible blast', () => {
  const game = fixture(), feature = item(game, 'mimic-museum'), body = mimicBody(game, feature.id);
  game.state.enemies = [body]; stand(game.state.player, { x: feature.x, z: feature.z + 4 });
  game.state.player.ammo.pistol = 0; game._fire();
  assert.equal(feature.used, false); assert.equal(body.dormant, true);
  game._explodeGrenade({ id: 'grenade-1', type: 'grenade', ownerId: 'player', x: feature.x, z: feature.z + 1, life: 0 });
  assert.equal(feature.used, true); assert.equal(body.dormant, false); assert.ok(body.health < body.maxHealth);
  assert.ok(game.drainEvents().some(event => event.type === 'mimic-reveal' && event.reason === 'blast'));
});

test('a hatch warns for one full second and stepping off avoids the fall', () => {
  const game = fixture(), hatch = arm(game), health = game.state.player.health;
  assert.equal(game.state.tomorrowHazards.hatches.find(entry => entry.id === hatch.id).remaining, TOMORROW_HATCH_WARNING);
  tick(game, 4); assert.equal(game.state.player.jump, null); assert.equal(hatch.used, false);
  tick(game, 3, { strafe: 1 });
  assert.ok(game.state.player.x > hatch.x2);
  tick(game, 5);
  assert.equal(hatch.used, true); assert.equal(tomorrowHatchVisual(game.state, hatch), 'spent');
  assert.equal(game.state.player.health, health); assert.equal(game.state.player.jump, null);
  const events = game.drainEvents(); assert.equal(events.filter(event => event.type === 'trapdoor-warning').length, 1);
  assert.equal(events.filter(event => event.type === 'trapdoor-drop').length, 0);
  stand(game.state.player, hatch); tick(game, 30);
  assert.equal(game.state.player.jump, null); assert.equal(game.state.player.health, health);
  assert.equal(game.drainEvents().filter(event => event.type === 'trapdoor-warning').length, 0, 'spent grilles cannot repeatedly drop a team');
});

test('a player can trip a marked hatch from the edge without power or sacrificing health', () => {
  const game = fixture(), hatch = item(game, 'trapdoor-weather');
  stand(game.state.player, { x: hatch.x, z: hatch.z + 1.5 });
  assert.equal(game.state.power, false); assert.equal(tomorrowHazardInteractionInfo(game, hatch).label, 'TRIP');
  assert.equal(game.interact(), true); tick(game, 11);
  assert.equal(hatch.used, true); assert.equal(game.state.player.health, 100); assert.equal(game.state.player.jump, null);
  assert.equal(game.getInteractionInfo().label, 'SAFE');
});

test('all four occupants share one warning and get separate nonlethal landings even on Insane', () => {
  const game = fixture({ coop: true, difficulty: 'insane' }), hatch = item(game, 'trapdoor-museum');
  const positions = [[-.38, -.38], [.38, -.38], [-.38, .38], [.38, .38]], health = [100, 9, 1, 40];
  for (const [i, player] of Object.values(game.state.players).entries()) stand(player,
    { x: hatch.x + positions[i][0], z: hatch.z + positions[i][1] }, { health: health[i] });
  tick(game); tick(game, 10);
  const players = Object.values(game.state.players);
  assert.equal(hatch.used, true); assert.ok(players.every(player => player.jump?.kind === 'trap-drop'));
  assert.deepEqual(players.map(player => player.health), health.map(value => Math.max(1, value - TOMORROW_DROP_DAMAGE)));
  assert.equal(game.state.status, 'playing'); assert.ok(players.every(player => player.alive));
  const destinations = players.map(player => ({ x: player.jump.targetX, z: player.jump.targetZ }));
  for (let i = 0; i < destinations.length; i++) for (let j = i + 1; j < destinations.length; j++) assert.ok(distance(destinations[i], destinations[j]) >= .8);
  tick(game, 3); assert.ok(players.every(player => player.elevation < -.3), 'the camera actually drops during the chute transition');
  finishDrop(game);
  for (const player of players) {
    assert.ok(game._clearCircle(player.x, player.z, .28)); assert.equal(player.elevation, 0);
    assert.ok(distance(player, hatch) > 3); assert.equal(describeRoom(game.level, player.x, player.z).zoneId, 'museum');
  }
  const events = game.drainEvents();
  assert.equal(events.filter(event => event.type === 'trapdoor-warning').length, 1, 'shared warning runs once, not once per operator');
  assert.deepEqual(events.filter(event => event.type === 'trapdoor-drop').map(event => event.playerId).sort(), ['p1', 'p2', 'p3', 'p4']);
  assert.equal(events.filter(event => event.type === 'trapdoor-land').length, 4);
});

test('a chute moves only its occupants and rechecks a landing that becomes dangerous mid-drop', () => {
  const game = fixture({ coop: true }), hatch = item(game, 'trapdoor-weather');
  stand(game.state.players.p1, hatch);
  for (const [id, x] of [['p2', 40.5], ['p3', 42.5], ['p4', 44.5]]) stand(game.state.players[id], { x, z: 80.5 });
  const unaffected = Object.fromEntries(['p2', 'p3', 'p4'].map(id => [id, { x: game.state.players[id].x, z: game.state.players[id].z }]));
  tick(game); tick(game, 10);
  const player = game.state.players.p1, initialLanding = { x: player.jump.targetX, z: player.jump.targetZ };
  game.state.projectiles.push({ id: 'blocked-landing-shot', type: 'plasma', ...initialLanding, life: 5 });
  finishDrop(game);
  assert.ok(distance(player, initialLanding) >= 4, 'an incoming projectile rules out the old landing');
  assert.ok(game._clearCircle(player.x, player.z, .28));
  for (const id of ['p2', 'p3', 'p4']) assert.deepEqual({ x: game.state.players[id].x, z: game.state.players[id].z }, unaffected[id]);
});

test('if every dynamic landing is blocked, the tether leaves the operator on the now-safe source floor', () => {
  const game = fixture(), hatch = arm(game); tick(game, 10);
  const original = { x: game.state.player.jump.x, z: game.state.player.jump.z }, clear = game._clearCircle.bind(game);
  game._clearCircle = () => false;
  finishDrop(game); game._clearCircle = clear;
  assert.deepEqual({ x: game.state.player.x, z: game.state.player.z }, original);
  assert.ok(clear(original.x, original.z, .28)); assert.equal(hatch.used, true);
  tick(game, 20); assert.equal(game.state.player.jump, null);
  assert.ok(game.drainEvents().some(event => event.type === 'trapdoor-land' && event.returned));
});

test('solo save cancels a pending warning safely and normalizes a mid-drop without retriggering it', () => {
  const game = fixture(), hatch = arm(game); tick(game, 4);
  const before = copy(game.state.tomorrowHazards), snapshot = game.serialize();
  assert.deepEqual(game.state.tomorrowHazards, before, 'snapshot normalization does not mutate the running warning');
  assert.equal(snapshot.state.tomorrowHazards.hatches.find(entry => entry.id === hatch.id).phase, 'armed');
  const restored = new Game(); assert.equal(restored.restore(snapshot), true);
  assert.equal(tomorrowHatchVisual(restored.state, item(restored, hatch.id)), 'closed');
  restored._updateEnemies = () => {}; restored._updateProjectiles = () => {}; restored.resume();
  tick(restored); tick(restored, 10);
  assert.equal(restored.state.player.jump?.kind, 'trap-drop');
  const airborne = restored.serialize(), again = new Game();
  assert.equal(airborne.state.player.jump, null); assert.equal(airborne.state.player.elevation, 0);
  assert.equal(again.restore(airborne), true); assert.equal(item(again, hatch.id).used, true);
  again._updateEnemies = () => {}; again._updateProjectiles = () => {}; again.resume();
  const health = again.state.player.health; tick(again, 30);
  assert.equal(again.state.player.jump, undefined); assert.equal(again.state.player.health, health);
});

test('checkpoint retry preserves spent hatch and revealed dead mimic together without duplicate kill credit', () => {
  const game = fixture(); powerUp(game); game._saveCheckpoint('Before optional rooms');
  const feature = item(game, 'mimic-wardrobe'); stand(game.state.player, { x: feature.x, z: feature.z + 1.5 });
  assert.equal(game.interact(), true);
  game._damageEnemy(mimicBody(game), 10000, 'player');
  const kills = game.state.kills;
  const hatch = arm(game); tick(game, 10);
  assert.equal(game.restartCheckpoint(), true);
  assert.equal(item(game, feature.id).used, true); assert.equal(mimicBody(game).alive, false); assert.equal(mimicBody(game).dormant, false);
  assert.equal(item(game, hatch.id).used, true); assert.equal(game.state.kills, kills);
  assert.equal(game.restartCheckpoint(), true); assert.equal(game.state.kills, kills);
  stand(game.state.player, item(game, hatch.id)); tick(game, 25);
  assert.equal(game.state.player.jump, null); assert.equal(game.state.kills, kills);
  assert.equal(new Game().restore(game.serialize()), true);
});

test('four-player checkpoint recovery clears partial drops while retaining one-use hazard progress', () => {
  const game = fixture({ coop: true }); powerUp(game); game._saveCheckpoint('Shared baseline');
  const hatch = item(game, 'trapdoor-weather'); stand(game.state.players.p4, hatch);
  tick(game); tick(game, 10); assert.ok(game.state.players.p4.jump);
  // Another operator can secure a refuge while a teammate is in a scripted drop.
  game._withPlayer('p1', () => game._saveCheckpoint('Shared recovery during chute'));
  assert.equal(game.restartCheckpoint(), true);
  assert.equal(item(game, hatch.id).used, true); assert.equal(game.state.players.p4.jump, null);
  assert.equal(game.state.players.p4.elevation, 0);
  assert.equal(new Set(Object.keys(game.networkSnapshot().players)).size, 4);
  tick(game, 25); assert.equal(game.state.players.p4.jump, null);
});

test('snapshot validation rejects mismatched mimic revelation and impossible hatch clocks', () => {
  const game = fixture(), valid = game.serialize().state;
  assert.equal(validTomorrowHazardsSnapshot(valid, game.level), true);
  for (const edit of [
    value => { value.interactables.find(feature => feature.id === 'mimic-wardrobe').used = true; },
    value => { value.enemies.find(enemy => enemy.id === 'mimic-wardrobe-body').active = true; },
    value => { value.enemies.find(enemy => enemy.id === 'mimic-wardrobe-body').dormant = false; },
    value => { value.tomorrowHazards.hatches[0].remaining = 2; },
    value => { value.tomorrowHazards.hatches[0].phase = 'spent'; },
    value => { value.tomorrowHazards.hatches[0].phase = 'warning'; value.tomorrowHazards.hatches[0].remaining = 0; },
  ]) {
    const bad = copy(valid); edit(bad); assert.equal(validTomorrowHazardsSnapshot(bad, game.level), false);
  }
  assert.deepEqual(snapshotTomorrowHazards(game), valid.tomorrowHazards);
});

test('protected room metadata prevents mimic and trap activation even if a later map edit overlaps them', () => {
  const game = fixture(), mimic = item(game, 'mimic-museum'), hatch = item(game, 'trapdoor-weather');
  game.level = { ...game.level, rooms: [...game.level.rooms, ...[mimic, hatch].map(feature => ({
    id: `protected-${feature.id}`, name: 'Protected refuge', zoneId: feature.zoneId, roomType: 'refuge', protected: true, priority: 999,
    x1: feature.x - 2, x2: feature.x + 2, z1: feature.z - 2, z2: feature.z + 2,
  }))] };
  stand(game.state.player, mimic); tick(game, 20); assert.equal(mimic.used, false);
  assert.equal(tomorrowHazardInteractionInfo(game, mimic).canUse, false);
  stand(game.state.player, hatch); tick(game, 20);
  assert.equal(hatch.used, false); assert.equal(tomorrowHatchVisual(game.state, hatch), 'closed');
  assert.equal(tomorrowHazardInteractionInfo(game, hatch).canUse, false);
});
