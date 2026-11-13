import { WORLD_CONTENT_VERSION } from '../dist/world-content.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { FarwakeNetwork } from '../dist/network.mjs';
import { advanceShip, getShipClass } from '../dist/fleet.mjs';
import { InputTimeline, MAX_PREDICTION_MS, correctedPose, shortestAngle } from '../dist/prediction.mjs';
import { timingScenario, maneuver } from './prediction-timing.mjs';

const epoch = 1700000000000, coast = { flightAssist: false };
const near = (actual, expected, tolerance = .001) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
function fixture(shipChanges = {}, world = {}) {
  let time = 0, tick = 0;
  const ship = { ...getShipClass('sparrow').stats, id: 'cinder', classId: 'sparrow', x: 0, y: 0, vx: 0, vy: 0, angle: 0, angularVelocity: 0, energy: 100, ...shipChanges };
  const network = new FarwakeNetwork({ url: 'http://test', storage: null, autoReconnect: false, now: () => time, wallNow: () => epoch + time });
  const packet = (value = ship, stamp = time, changes = {}) => ({ tick: ++tick, serverTime: epoch + time, simulatedAt: epoch + stamp, ack: 0, state: { seed: 'test', systemId: 'hearth', mode: 'ship', ship: { ...value } }, room: { id: 'system:hearth', kind: 'system' }, world, remoteShips: [], players: [], events: [], ...changes });
  network._snapshot(packet(), true);
  return { network, ship, packet, at(value) { time = value; } };
}

test('walking and flight replay use the actual input interval boundaries rather than packet counts', () => {
  const history = new InputTimeline(0);
  history.record({ x: 1, thrust: 1 }, 25); history.record({ y: -1, turn: .4 }, 80);
  const frames = history.frames(40, 110);
  assert.deepEqual(frames.map(f => [f.from, f.to, f.dt]), [[40, 80, .04], [80, 110, .03]]);
  assert.equal(frames[0].input.x, 1); assert.equal(frames[1].input.y, -1);
  near(history.frames(0, 1000).reduce((sum, f) => sum + f.dt, 0), MAX_PREDICTION_MS / 1000);
});

test('authoritative elapsed time determines replay even when sent samples have uneven durations', () => {
  const { network, ship, packet, at } = fixture({ vx: 180 }); network.setInput(coast);
  at(160); network.unacknowledged = [{ seq: 1, dt: .017, input: coast }, { seq: 2, dt: .113, input: coast }];
  const authoritative = advanceShip(ship, .1, coast);
  network._snapshot(packet(authoritative, 100, { ack: 1 }));
  near(network.predictedShip.x, advanceShip(ship, .16, coast).x);
  near(network.predictionFrames(network.latest).reduce((sum, f) => sum + f.dt, 0), .06);
  assert.deepEqual(network.unacknowledged.map(f => f.seq), [2]);
});

test('a snapshot arriving between render frames is not followed by a duplicate full-frame step', () => {
  const { network, ship, packet, at } = fixture({ vx: 180 }); network.setInput(coast);
  at(100); network.predictShip(.1, coast);
  at(110); network._snapshot(packet(advanceShip(ship, .09, coast), 90));
  at(100 + 1000 / 60); network.setInput(coast, 1 / 60); network.predictShip(1 / 60, coast);
  near(network.predictedShip.x, advanceShip(ship, (100 + 1000 / 60) / 1000, coast).x);
});

test('successive corrections preserve displayed position and shortest-arc heading without feeding offsets into physics', () => {
  const { network, ship, packet, at } = fixture({ angle: Math.PI - .03 }); network.setInput(coast);
  at(100); network.predictShip(.1, coast); const visible = { ...network.renderedShip };
  network._snapshot(packet({ ...ship, x: -6, angle: -Math.PI + .03 }, 100));
  near(network.predictedShip.x, -6); near(network.renderedShip.x, visible.x); near(shortestAngle(network.renderedShip.angle - visible.angle), 0);
  assert.ok(Math.abs(network.visualOffset.angle) < .1);
  at(120); network.setInput(coast, .02); network.predictShip(.02, coast); const continued = { ...network.renderedShip };
  network._snapshot(packet({ ...ship, x: -8, angle: -Math.PI + .05 }, 120));
  near(network.renderedShip.x, continued.x); near(shortestAngle(network.renderedShip.angle - continued.angle), 0); near(network.predictedShip.x, -8);
  at(140); network.setInput(coast, .02); network.predictShip(.02, coast); near(network.predictedShip.x, -8);
  assert.ok(network.renderedShip.x > network.predictedShip.x, 'Visual convergence stays outside the simulated position.');
});

test('authoritative room, hull and teleport transitions discard smoothing and old controls', () => {
  const { network, ship, packet, at } = fixture(); network.setInput({ thrust: 1 });
  at(100); network._snapshot(packet({ ...ship, x: 20 }, 100, { room: { id: 'system:vesper', kind: 'system' } }));
  assert.equal(network.predictionReset, 'room'); assert.deepEqual(network.visualOffset, { x: 0, y: 0, angle: 0 }); assert.deepEqual(network.input, {});
  at(200); network._snapshot(packet({ ...ship, classId: 'hauler', x: 30 }, 200, { room: { id: 'system:vesper', kind: 'system' } }));
  assert.equal(network.predictionReset, 'class'); near(network.renderedShip.x, 30);
  at(300); network._snapshot(packet({ ...ship, classId: 'hauler', x: 40, angle: -3 }, 300, { room: { id: 'system:vesper', kind: 'system' }, events: [{ type: 'rescue' }] }));
  assert.equal(network.predictionReset, 'teleport'); near(network.renderedShip.x, 40); near(network.renderedShip.angle, -3);
});

test('rendered correction remains inside the world and cannot unwrap a rotation into a long spin', () => {
  const raw = { x: 99, y: -99, angle: Math.PI - .01 };
  const visible = correctedPose(raw, { x: 12, y: -12, angle: .03 }, 100);
  assert.equal(visible.x, 100); assert.equal(visible.y, -100); near(visible.angle, -Math.PI + .02);
  assert.deepEqual(raw, { x: 99, y: -99, angle: Math.PI - .01 });
});

test('neutral menu input continues coasting, while a stalled stream cannot extrapolate indefinitely', () => {
  const { network, ship, at } = fixture({ vx: 100 }); network.setInput(coast);
  at(100); network.setInput(coast, .1); network.predictShip(.1, coast); assert.ok(network.predictedShip.x > 9);
  at(3000); network.setInput(coast, 2.9); network.predictShip(2.9, coast);
  near(network.predictedShip.x, advanceShip(ship, .25, coast).x); const stopped = network.predictedShip.x;
  at(4000); network.setInput(coast, 1); network.predictShip(1, coast); near(network.predictedShip.x, stopped);
  assert.equal(network.inputFrames(3000, 4000).length, 0);
});

test('legacy serverTime snapshots remain usable and old ticks cannot rewind a new pose', () => {
  const { network, ship, packet, at } = fixture({ vx: 100 }); network.setInput(coast);
  at(160); const p = packet(advanceShip(ship, .1, coast), 100); delete p.simulatedAt; p.serverTime = epoch + 100;
  network._snapshot(p); near(network.predictedShip.x, advanceShip(ship, .16, coast).x);
  network._snapshot({ ...p, tick: p.tick - 1, state: { ...p.state, ship: { ...ship, x: 900 } } });
  near(network.predictedShip.x, advanceShip(ship, .16, coast).x);
});

test('welcome estimates server clock at the handshake midpoint instead of subtracting one-way latency', async () => {
  let time = 0, socket;
  class Socket {
    constructor() { socket = this; this.handlers = {}; this.readyState = 1; }
    addEventListener(name, fn) { this.handlers[name] = fn; }
    send() {}
    close() {}
  }
  const net = new FarwakeNetwork({ url: 'http://test', WebSocketImpl: Socket, storage: null, autoReconnect: false, now: () => time, wallNow: () => epoch + time }); net._startTimers = () => {};
  const opened = net._open(); time = 10; socket.handlers.open(); time = 90;
  socket.handlers.message({ data: JSON.stringify({ type: 'welcome', worldContentVersion: WORLD_CONTENT_VERSION, tick: 1, ack: 0, serverTime: epoch + 550, simulatedAt: epoch + 550, state: { mode: 'ship', systemId: 'hearth', ship: { ...getShipClass('sparrow').stats, classId: 'sparrow', x: 0, y: 0 } }, room: { id: 'system:hearth', kind: 'system' }, world: {} }) });
  await opened; assert.equal(net.rtt, 80); assert.equal(net.clockOffset, 500); net.disconnect();
});

test('coasting stays smooth at 60/120 Hz through 60–200 ms RTT and packet jitter', () => {
  for (const fps of [60, 120]) for (const rtt of [60, 120, 200]) {
    const result = timingScenario({ fps, rtt, jitter: rtt * .2 });
    assert.ok(result.authorityErrorRms < .002, JSON.stringify({ fps, rtt, result }));
    assert.ok(result.frameCorrectionRms < .001); assert.ok(result.maxPositionDiscontinuity < 1e-8);
  }
});

test('latency corrections during maneuvers preserve continuous heading and keep render-frame corrections bounded', () => {
  for (const fps of [60, 120]) for (const rtt of [60, 120, 200]) {
    const result = timingScenario({ fps, rtt, jitter: rtt * .2, inputAt: maneuver, moving: false });
    assert.ok(result.maxPositionDiscontinuity < 1e-8); assert.ok(result.maxAngleDiscontinuity < 1e-8);
    assert.ok(result.authorityErrorRms < 1, JSON.stringify({ fps, rtt, result }));
    assert.ok(result.frameCorrectionRms < .14); assert.ok(result.maxFrameCorrection < 1.2);
  }
});
