import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, MISSIONS, LEVELS } from '../daily_flyer/themes/breach_assets/core.mjs';
import { CoopGame } from '../daily_flyer/themes/breach_assets/coop-core.mjs';
import { TOMORROW, TOMORROW_ID, TOMORROW_ANCHORS, TOMORROW_ENDINGS, tomorrowEnding, tomorrowInteractionInfo, tomorrowFoldDestination, tomorrowProgress, tomorrowStateValid } from '../daily_flyer/themes/breach_assets/tomorrow.mjs';

const makeGame = () => { const game = new Game({ mission: TOMORROW_ID, seed: 42 }); game.start(); game.drainEvents(); return game; };
const feature = (game, id) => game.state.interactables.find(o => o.id === id);
const stand = (game, object) => Object.assign(game.state.player, { x: object.x, z: object.z, angle: 0, jump: null, elevation: 0 });
const use = (game, id) => { stand(game, feature(game, id)); return game.interact(); };
const collect = (game, id) => { const item = game.state.pickups.find(o => o.id === id); stand(game, item); game._collectPickups(); return item.collected; };
const wake = game => { assert.ok(use(game, 'aux-power')); };
const registers = game => { wake(game); assert.ok(use(game, 'relay-west')); assert.ok(use(game, 'relay-east')); assert.ok(collect(game, 'access-key')); };
const defeat = game => { const enemy = game.state.enemies.find(o => o.id === TOMORROW.guardianId); game._damageEnemy(enemy, 100000, 'player'); assert.equal(enemy.alive, false); };
const walk = (game, from, { open = false, skipCourt = false } = {}) => {
  const closed = new Set(game.state.doors.filter(d => !d.open && (!open || !game.canTraverseDoor(d))).map(d => `${Math.floor(d.x)},${Math.floor(d.z)}`));
  const queue = [[Math.floor(from.x), Math.floor(from.z)]], seen = new Set();
  for (let i = 0; i < queue.length; i++) {
    const [x, z] = queue[i], key = `${x},${z}`;
    if (seen.has(key) || game.level.grid[z]?.[x] !== '.' || closed.has(key)) continue;
    if (skipCourt && x >= 34 && x < 57 && z >= 4 && z < 27) continue;
    seen.add(key); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) queue.push([x + dx, z + dz]);
  }
  return seen;
};
const cell = point => `${Math.floor(point.x)},${Math.floor(point.z)}`;

test('Tomorrow is mission 009 with nine distinct playable districts and the four latest threat roles', () => {
  assert.equal(LEVELS[TOMORROW_ID], TOMORROW);
  assert.equal(MISSIONS.find(m => m.id === TOMORROW_ID).number, '009');
  assert.equal(TOMORROW.zones.length, 9);
  assert.equal(new Set(TOMORROW.zones.map(z => z.motif)).size, 9);
  for (const type of ['cinder-sower', 'tether-widow', 'glass-skimmer', 'lantern-maw']) assert.ok(TOMORROW.enemies.some(e => e.type === type), type);
  assert.equal(TOMORROW.friendlyFire, true);
  for (const zone of TOMORROW.zones) {
    assert.ok(zone.description && zone.identity && /^#[a-f0-9]{6}$/i.test(zone.accent));
    assert.ok(TOMORROW.landmarks.some(p => p.tomorrowDistrict === zone.id), zone.id);
    assert.ok(TOMORROW.surrealProps.some(p => p.zoneId === zone.id), zone.id);
  }
  for (const prop of TOMORROW.surrealProps) assert.equal(TOMORROW.grid[Math.floor(prop.z)]?.[Math.floor(prop.x)], '.', `${prop.id}: floating art must not be hidden inside solid cover`);
});

test('every authored entity and fold landing fits physical floor; all three spawn layouts reunite before power', () => {
  const game = makeGame(), targets = [...TOMORROW.pickups, ...TOMORROW.interactables, ...TOMORROW.enemies, ...TOMORROW.coopSpawnVariants.flat()];
  for (const object of targets) assert.ok(game._clearCircle(object.x, object.z, .23), object.id || 'spawn');
  for (const object of TOMORROW.interactables.filter(o => o.landing)) assert.ok(game._clearCircle(object.landing.x, object.landing.z, .23), `${object.id} landing`);
  assert.equal(TOMORROW.coopSpawnVariants.length, 3);
  for (const variant of TOMORROW.coopSpawnVariants) {
    assert.equal(variant.length, 4);
    assert.equal(new Set(variant.map(cell)).size, 4);
    for (const spawn of variant) {
      const reachable = walk(game, spawn);
      assert.ok(reachable.has(cell(feature(game, 'aux-power'))), 'all arrivals reach the exchange with closed court gates');
      for (const relay of ['relay-west', 'relay-east']) assert.ok(reachable.has(cell(feature(game, relay))), relay);
      assert.ok(!reachable.has(cell(game.state.enemies.find(e => e.guardian))), 'court really is behind the two-register gates');
      const danger = game.state.enemies.filter(e => Math.hypot(e.x - spawn.x, e.z - spawn.z) < 9 && game.hasLineOfSight(spawn.x, spawn.z, e.x, e.z));
      assert.equal(danger.length, 0, `spawn is protected: ${cell(spawn)}`);
    }
  }
});

test('every ending, memory, weapon and refuge has a walking route after the registers without using a fold', () => {
  const game = makeGame(); registers(game);
  const reachable = walk(game, TOMORROW.spawn, { open: true });
  for (const object of [...game.state.interactables, ...game.state.pickups, ...game.state.enemies]) assert.ok(reachable.has(cell(object)), object.id);
});

test('registers enforce power, open a physical shortcut, and change a folded doorway’s advertised destination', () => {
  const game = makeGame(), frame = feature(game, 'fold-waiting');
  assert.equal(use(game, 'relay-west'), false);
  assert.equal(use(game, 'fold-waiting'), false);
  assert.equal(use(game, 'memory-orchard'), false);
  assert.equal(tomorrowFoldDestination(game, frame).id, 'fold-sunday');
  wake(game);
  assert.ok(use(game, 'relay-west'));
  assert.ok(game.state.doors.find(d => d.id === 'remembered-west').open);
  assert.equal(game.state.doors.find(d => d.id === 'remembered-east').open, false);
  assert.equal(tomorrowProgress(game).registers, 1);
  assert.equal(tomorrowFoldDestination(game, frame).id, 'fold-sunday');
  assert.ok(use(game, 'relay-east'));
  assert.equal(tomorrowFoldDestination(game, frame).id, 'fold-museum');
  assert.match(tomorrowInteractionInfo(game, frame).text, /Museum.*route changed/);
  assert.ok(game.drainEvents().some(e => e.type === 'tomorrow-shift' && e.phase === 2));
  assert.equal(use(game, 'relay-east'), false, 'single-use register cannot be farmed');
});

test('fold travel changes only its user, denies occupied arrivals, and uses the current shared route', () => {
  const game = makeGame(); wake(game);
  const frame = feature(game, 'fold-waiting'), destination = tomorrowFoldDestination(game, frame);
  const enemy = game.state.enemies[0], original = { x: enemy.x, z: enemy.z };
  Object.assign(enemy, destination.landing);
  assert.equal(use(game, frame.id), false, 'danger at the far frame keeps this optional route closed');
  Object.assign(enemy, original);
  assert.ok(use(game, frame.id));
  assert.equal(game.state.player.x, destination.landing.x);
  assert.equal(game.state.player.z, destination.landing.z);
  assert.ok(game.drainEvents().some(e => e.type === 'transit' && e.to === 'fold-sunday'));
  assert.ok(use(game, 'relay-west')); assert.ok(use(game, 'relay-east'));
  const next = tomorrowFoldDestination(game, frame);
  assert.ok(use(game, frame.id));
  assert.equal(game.state.player.x, next.landing.x);
  assert.equal(game.state.player.z, next.landing.z);
});

test('escape is a playable ending without killing the keeper or collecting a memory', () => {
  const game = makeGame();
  assert.equal(use(game, 'extraction'), false);
  registers(game);
  assert.equal(game.state.enemies.find(e => e.guardian).alive, true);
  assert.equal(tomorrowProgress(game).anchors, 0);
  assert.ok(use(game, 'extraction'));
  assert.equal(game.state.status, 'won');
  assert.equal(tomorrowEnding(game), TOMORROW_ENDINGS.escape);
  assert.equal(game.getObjective().stage, 'complete');
  assert.ok(game.drainEvents().some(e => e.type === 'win' && e.ending === 'escape'));
  const restored = makeGame(); assert.ok(restored.restore(game.serialize()));
  assert.equal(restored.state.status, 'won'); assert.equal(tomorrowEnding(restored).id, 'escape');
});

test('containment requires the keeper and restores as its own distinct completed ending', () => {
  const game = makeGame(); registers(game);
  assert.equal(use(game, 'ending-seal'), false);
  assert.match(tomorrowInteractionInfo(game, feature(game, 'ending-seal')).text, /still holds/);
  defeat(game);
  assert.ok(use(game, 'ending-seal'));
  assert.equal(tomorrowEnding(game).id, 'seal');
  assert.equal(use(game, 'ending-rewrite'), false, 'a completed team run cannot choose another ending');
  const restored = makeGame(); assert.ok(restored.restore(game.serialize()));
  assert.equal(restored.state.status, 'won'); assert.equal(tomorrowEnding(restored).id, 'seal');
});

test('restoration requires all three exploration memories, the Null projector and the keeper', () => {
  const game = makeGame(); registers(game); defeat(game);
  assert.equal(use(game, 'ending-rewrite'), false);
  assert.equal(use(game, 'memory-museum'), false);
  assert.ok(use(game, 'memory-orchard')); assert.ok(use(game, 'memory-aquarium'));
  assert.equal(use(game, 'ending-rewrite'), false);
  assert.ok(collect(game, 'null-projector'));
  assert.ok(use(game, 'memory-museum'));
  assert.equal(tomorrowProgress(game).anchors, 3);
  assert.ok(use(game, 'ending-rewrite'));
  assert.equal(tomorrowEnding(game).id, 'rewrite');
  const restored = makeGame(); assert.ok(restored.restore(game.serialize()));
  assert.equal(restored.state.status, 'won'); assert.equal(tomorrowEnding(restored).id, 'rewrite');
});

test('the registers can be completed in either order and checkpoint retry keeps earned memories and opened routes', () => {
  const game = makeGame(); wake(game);
  assert.ok(use(game, 'relay-east')); assert.ok(use(game, 'relay-west'));
  assert.ok(collect(game, 'null-projector'));
  for (const id of TOMORROW_ANCHORS) assert.ok(use(game, id));
  assert.ok(game.restartCheckpoint());
  assert.ok(game.state.player.hasNull);
  assert.equal(tomorrowProgress(game).anchors, 3);
  assert.ok(game.state.doors.find(d => d.id === 'remembered-east').open);
  assert.ok(game.state.doors.find(d => d.id === 'remembered-west').open);
  assert.equal(tomorrowEnding(game), null);
});

test('one restored register keeps its permanent doorway consistent in saves and checkpoint retries', () => {
  for (const side of ['west', 'east']) {
    const game = makeGame(); wake(game);
    assert.ok(use(game, `relay-${side}`));
    const serialized = game.serialize();
    assert.ok(serialized.checkpoint.interactables.find(o => o.id === `relay-${side}`).used);
    assert.ok(serialized.checkpoint.doors.find(d => d.id === `remembered-${side}`).open, `${side} checkpoint door`);
    const restored = makeGame(); assert.ok(restored.restore(serialized), `${side} save restores`);
    assert.ok(restored.restartCheckpoint(), `${side} checkpoint retries`);
    assert.ok(restored.state.doors.find(d => d.id === `remembered-${side}`).open);
    assert.equal(tomorrowProgress(restored).registers, 1);
  }
  const team = new CoopGame({ mission: TOMORROW_ID, players: ['p1', 'p2', 'p3', 'p4'], seed: 2 }); team.start();
  const teamUse = id => { Object.assign(team.state.players.p3, { x: feature(team, id).x, z: feature(team, id).z }); return team.interact('p3'); };
  assert.ok(teamUse('aux-power')); assert.ok(teamUse('relay-west'));
  assert.ok(team.restartCheckpoint());
  assert.equal(tomorrowProgress(team).registers, 1);
  assert.ok(team.state.doors.find(d => d.id === 'remembered-west').open, 'four-player retry keeps remembered doorway');
});

test('invalid future revisions, forged memories, unearned endings and multiple endings fail restore atomically', () => {
  const game = makeGame(); registers(game);
  const data = game.serialize();
  for (const mutate of [
    s => { s.tomorrowRevision = 99; },
    s => { s.interactables.find(o => o.id === 'memory-museum').used = true; },
    s => { s.interactables.find(o => o.id === 'ending-seal').used = true; },
    s => { s.interactables.find(o => o.id === 'ending-rewrite').used = true; },
    s => { s.interactables.find(o => o.id === 'extraction').used = true; s.interactables.find(o => o.id === 'ending-seal').used = true; },
  ]) {
    const forged = structuredClone(data); mutate(forged.state);
    const target = makeGame(), before = target.serialize();
    assert.equal(target.restore(forged), false);
    assert.deepEqual(target.serialize(), before);
  }
  assert.ok(tomorrowStateValid(data.state));
});

test('four operators can share the route, equipment and restoration ending; the choice ends the authoritative world', () => {
  const game = new CoopGame({ mission: TOMORROW_ID, players: ['p1', 'p2', 'p3', 'p4'], seed: 2 }); game.start();
  const teamUse = (id, objectId) => {
    const object = feature(game, objectId); Object.assign(game.state.players[id], { x: object.x, z: object.z });
    return game.interact(id);
  };
  const teamCollect = (id, itemId) => {
    const item = game.state.pickups.find(p => p.id === itemId);
    Object.assign(game.state.players[id], { x: item.x, z: item.z });
    game._withPlayer(id, () => game._collectPickups());
    assert.ok(item.collected);
  };
  assert.ok(teamUse('p3', 'aux-power'));
  assert.ok(teamUse('p2', 'relay-west')); assert.ok(teamUse('p4', 'relay-east'));
  teamCollect('p4', 'access-key'); teamCollect('p2', 'null-projector');
  assert.ok(Object.values(game.state.players).every(p => p.key && p.hasNull), 'earned equipment and pass are shared');
  assert.ok(teamUse('p1', 'memory-orchard')); assert.ok(teamUse('p3', 'memory-aquarium')); assert.ok(teamUse('p4', 'memory-museum'));
  game._withPlayer('p3', () => defeat(game));
  assert.ok(teamUse('p4', 'ending-rewrite'));
  assert.equal(game.state.status, 'won');
  assert.equal(tomorrowEnding(game).id, 'rewrite');
  const snapshot = game.networkSnapshot();
  assert.equal(snapshot.status, 'won');
  assert.equal(Object.keys(snapshot.players).length, 4);
  assert.equal(tomorrowEnding({ state: snapshot }).id, 'rewrite');
  assert.equal(teamUse('p1', 'extraction'), false, 'another operator cannot overwrite the ending');
});

test('folded co-op arrivals avoid teammates without moving them or granting them a transit', () => {
  const game = new CoopGame({ mission: TOMORROW_ID, players: ['p1', 'p2', 'p3', 'p4'], seed: 0 }); game.start();
  game.state.power = true; feature(game, 'aux-power').used = true;
  const frame = feature(game, 'fold-waiting'), landing = tomorrowFoldDestination(game, frame).landing;
  Object.assign(game.state.players.p1, { ...landing });
  Object.assign(game.state.players.p2, { x: frame.x, z: frame.z });
  const before = structuredClone(game.state.players.p1);
  game.drainEvents();
  assert.ok(game.interact('p2'));
  assert.deepEqual(game.state.players.p1, before);
  assert.ok(Math.hypot(game.state.players.p2.x - before.x, game.state.players.p2.z - before.z) >= .7);
  assert.ok(game._clearCircle(game.state.players.p2.x, game.state.players.p2.z, .22));
  const transits = game.drainEvents().filter(e => e.type === 'transit');
  assert.equal(transits.length, 1); assert.equal(transits[0].playerId, 'p2');
});
