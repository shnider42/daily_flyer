import test from 'node:test';
import assert from 'node:assert/strict';
import { FarwakeNetwork, RemoteInterpolator, mergeSnapshot, readPassport, savePassport } from '../dist/network.mjs';
import { Game } from '../dist/engine.mjs';
import { advanceShip } from '../dist/fleet.mjs';

test('compact snapshot reconstruction keeps static metadata while applying canonical motion and mining state', () => {
  const previous = { tick: 1, room: { id: 'room-a' }, state: { journal: [{ title: 'Kept story' }], credits: 90, ship: { x: 0 } }, world: { bodies: [{ id: 'port' }], asteroids: [{ id: 'rock', x: 20, seed: 10, angle: 0, hp: 20, ore: 3, crystal: 1 }], enemies: [] }, fleet: [{ id: 'ship-a' }], events: [{ type: 'old' }] };
  const merged = mergeSnapshot(previous, { partial: true, tick: 2, room: { id: 'room-a' }, state: { credits: 102, ship: { x: 4 } }, world: { asteroidStates: [['rock', .5, 7, 2, 1]], enemies: [{ id: 'pirate' }] }, events: [] });
  assert.equal(merged.state.ship.x, 4); assert.equal(merged.state.credits, 102); assert.equal(merged.state.journal[0].title, 'Kept story');
  assert.equal(merged.world.asteroids[0].x, 20); assert.equal(merged.world.asteroids[0].hp, 7); assert.equal(merged.world.asteroids[0].angle, .5); assert.equal(merged.world.asteroids[0].seed, 10);
  assert.equal(merged.world.asteroidStates, undefined); assert.equal(merged.world.bodies[0].id, 'port'); assert.equal(merged.fleet[0].id, 'ship-a'); assert.deepEqual(merged.events, []);
});

test('client prediction handles a 100ms frame and discards acknowledged input on reconciliation', () => {
  const network = new FarwakeNetwork({ url: 'https://example.test', storage: null, autoReconnect: false }), game = new Game('prediction-regression');
  network._snapshot({ tick: 1, ack: 0, serverTime: 1000, room: { id: 'room-a', kind: 'system' }, state: game.save(), world: {}, remoteShips: [], players: [] }, true);
  const input = { thrust: 1, turn: .3, flightAssist: true }, expected = advanceShip(network.predictedShip, .1, input);
  const predicted = network.predictShip(.1, input); assert.equal(predicted.x, expected.x); assert.equal(predicted.y, expected.y); assert.equal(predicted.angle, expected.angle);
  network.unacknowledged = [{ seq: 1, dt: .05, input }, { seq: 2, dt: .05, input }];
  network._snapshot({ tick: 2, ack: 1, serverTime: 1100, room: { id: 'room-a', kind: 'system' }, state: game.save(), world: {}, remoteShips: [], players: [] });
  assert.deepEqual(network.unacknowledged.map(frame => frame.seq), [2]);
  network._snapshot({ tick: 1, ack: 0, serverTime: 900, room: { id: 'room-a', kind: 'system' }, state: { ...game.save(), credits: 9999 }, world: {} }); assert.notEqual(network.state.credits, 9999);
});

test('remote interpolation is bounded and never blends movement between different interiors', () => {
  const interpolation = new RemoteInterpolator();
  interpolation.push({ serverTime: 1000, room: { id: 'one' }, remoteShips: [{ id: 'v', x: 0, y: 0, vx: 50 }], players: [] }, 1000);
  interpolation.push({ serverTime: 1100, room: { id: 'one' }, remoteShips: [{ id: 'v', x: 10, y: 0, vx: 50 }], players: [] }, 1100);
  assert.equal(interpolation.sample(1150).remoteShips[0].x, 5);
  interpolation.push({ serverTime: 1200, room: { id: 'two' }, remoteShips: [{ id: 'v', x: 800, y: 20, vx: 0 }], players: [] }, 1500);
  assert.equal(interpolation.sample(1250).remoteShips[0].x, 800); assert.ok(interpolation.delayMs >= 100 && interpolation.delayMs <= 220);
});

test('passport helpers keep per-realm identity separate and tolerate unavailable browser storage', () => {
  let value; const storage = { getItem: () => value, setItem: (_key, data) => { value = data; } };
  savePassport({ realmCode: 'AAAAAA11', captainId: 'one', token: 'secret-one' }, storage); savePassport({ realmCode: 'BBBBBB22', captainId: 'two', token: 'secret-two' }, storage);
  assert.equal(readPassport('AAAAAA11', storage).captainId, 'one'); assert.equal(readPassport(undefined, storage).captainId, 'two');
  assert.equal(readPassport('AAAAAA11', { getItem() { throw new Error('Storage blocked'); } }), null);
});
