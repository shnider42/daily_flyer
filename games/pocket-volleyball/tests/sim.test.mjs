import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, step, snapshot, predictLanding, controllerPlayer, awardPoint, COURT } from '../public/sim.mjs';

function advance(s, seconds, inputs = [{}, {}]) {
  for (let n = 0; n < Math.ceil(seconds * 60); n++) step(s, 1 / 60, inputs);
}
function receiving(options = {}) {
  const s = createMatch(options);
  s.phase = 'rally'; s.possession = 0; s.touches = 0; s._receiver = 0;
  s._lastHitTeam = 1; s._lastHitPlayer = 2; s._shotType = 'spike';
  s.players[0].x = -3; s.players[0].y = 0;
  s.players[1].x = -2.8; s.players[1].y = 2.8;
  Object.assign(s.ball, { x: -3, y: 0, z: 1.3, vx: -1, vy: 0, vz: -2 });
  return s;
}

test('controller ownership distinguishes solo, versus and fixed co-op partners', () => {
  assert.deepEqual(createMatch().controls, [0, -1]);
  assert.deepEqual(createMatch({ mode: 'versus' }).controls, [0, 2]);
  const coop = createMatch({ mode: 'coop' });
  assert.deepEqual(coop.controls, [0, 1]);
  coop.phase = 'rally'; coop._receiver = 1;
  step(coop, 1 / 60, [{ switch: true }, { switch: true }]);
  assert.deepEqual(coop.controls, [0, 1]);
  assert.equal(controllerPlayer(coop, 1).id, 1);
  assert.equal(controllerPlayer(createMatch(), 1), null);
});

test('first serving press after waiting starts a rally, and a held press cannot get stuck', () => {
  const s = createMatch();
  advance(s, 0.5);
  assert.equal(s.phase, 'serve');
  step(s, 1 / 60, [{ pass: true }]);
  assert.equal(s.phase, 'rally');
  assert.equal(s.lastEvent.type, 'serve');
  assert(s.ball.vx > 0);
  const held = createMatch();
  advance(held, 1.4, [{ pass: true }]);
  assert.equal(held.phase, 'rally');
});

test('movement normalizes diagonals and players stay on their side of the net', () => {
  const a = receiving({ assist: false }), b = receiving({ assist: false });
  a.ball = { x: 5, y: 0, z: 8, vx: 0, vy: 0, vz: 20 };
  b.ball = { ...a.ball };
  a._receiver = 0; b._receiver = 0;
  const startA = { ...a.players[0] }, startB = { ...b.players[0] };
  step(a, 1 / 60, [{ mx: 1 }]); step(b, 1 / 60, [{ mx: 1, my: 1 }]);
  const da = Math.hypot(a.players[0].x - startA.x, a.players[0].y - startA.y);
  const db = Math.hypot(b.players[0].x - startB.x, b.players[0].y - startB.y);
  assert(Math.abs(da - db) < 1e-8);
  a.players[0].x = -0.43;
  step(a, 1 / 60, [{ mx: 100, my: Number.NaN }]);
  assert(a.players[0].x <= -0.42);
  assert(Number.isFinite(a.players[0].y));
});

test('pass reaches a teammate, who can set for the third-touch attack', () => {
  const s = receiving({ mode: 'coop', assist: false });
  step(s, 1 / 60, [{ pass: true }, {}]);
  assert.equal(s.touches, 1); assert.equal(s.lastEvent.type, 'pass');
  assert.equal(s._receiver, 1);
  // Put the designated teammate under the descending pass.
  s._contactCooldown = 0;
  const p = s.players[1];
  Object.assign(s.ball, { x: p.x, y: p.y, z: 1.8, vx: 0, vy: 0, vz: -2 });
  step(s, 1 / 60, [{}, { pass: true }]);
  assert.equal(s.touches, 2); assert.equal(s.lastEvent.type, 'set');
  assert.equal(s._receiver, 0);
  s._contactCooldown = 0; s.players[0]._cooldown = 0;
  Object.assign(s.ball, { x: -1.5, y: 0, z: 3, vx: 0, vy: 0, vz: -2 });
  Object.assign(s.players[0], { x: -1.5, y: 0 });
  step(s, 1 / 60, [{ spike: true }, {}]);
  assert.equal(s.touches, 3); assert.equal(s.lastEvent.type, 'spike');
  assert(s.ball.vx > 0);
  const landing = predictLanding(s.ball);
  assert(landing.x > 0 && landing.x < COURT.halfLength);
});

test('assisted low bump helps a positioned player, while manual mode requires an action', () => {
  const assisted = receiving(), manual = receiving({ assist: false });
  assisted.ball.z = 0.75; manual.ball.z = 0.75;
  step(assisted, 1 / 60); step(manual, 1 / 60);
  assert.equal(assisted.lastEvent.type, 'pass');
  assert.equal(assisted.touches, 1);
  assert.equal(manual.touches, 0);
});

test('a dive extends low-ball reach and a net-side block does not spend a team touch', () => {
  const dive = receiving({ assist: false });
  dive.ball.x = -4.5; dive.ball.z = 0.35;
  step(dive, 1 / 60, [{ dive: true, mx: -1 }]);
  assert.equal(dive.lastEvent.type, 'dig'); assert.equal(dive.stats.digs[0], 1);
  const block = receiving({ assist: false });
  block.players[0].x = -0.7;
  Object.assign(block.ball, { x: -0.6, z: 2.7, vx: -3, vz: -0.5 });
  step(block, 1 / 60, [{ dive: true }]);
  assert.equal(block.lastEvent.type, 'block'); assert.equal(block.touches, 0);
  assert(block.ball.vx > 0); assert.equal(block.stats.blocks[0], 1);
});

test('net, floor and out-of-bounds faults award the correct side', () => {
  const net = receiving({ assist: false });
  net._lastHitTeam = 0; net._lastHitPlayer = 0; net._shotType = 'spike';
  Object.assign(net.ball, { x: -0.05, y: 0, z: 1, vx: 8, vy: 0, vz: 0 });
  step(net, 1 / 60);
  assert.deepEqual(net.score, [0, 1]); assert.equal(net.lastEvent.reason, 'Into the net');
  const out = receiving({ assist: false });
  out._lastHitTeam = 1;
  Object.assign(out.ball, { x: -8.5, y: 0, z: 0.001, vx: 0, vy: 0, vz: -1 });
  step(out, 1 / 60);
  assert.deepEqual(out.score, [1, 0]); assert.equal(out.lastEvent.reason, 'Out');
  const floor = receiving({ assist: false });
  Object.assign(floor.ball, { x: -7, y: -3.8, z: 0.001, vx: 0, vy: 0, vz: -1 });
  step(floor, 1 / 60);
  assert.deepEqual(floor.score, [0, 1]); assert.equal(floor.lastEvent.reason, 'Ball down');
});

test('an illegal fourth touch loses the point, and the same hitter cannot double contact', () => {
  const fourth = receiving({ assist: false });
  fourth.touches = 3; fourth._lastHitTeam = 0; fourth._lastHitPlayer = 1; fourth._shotType = 'pass';
  step(fourth, 1 / 60, [{ pass: true }]);
  assert.deepEqual(fourth.score, [0, 1]); assert.equal(fourth.lastEvent.reason, 'Four touches');
  const twice = receiving({ assist: false });
  twice._lastHitTeam = 0; twice._lastHitPlayer = 0; twice._shotType = 'pass';
  twice.touches = 1;
  step(twice, 1 / 60, [{ pass: true }]);
  assert.equal(twice.touches, 1);
});

test('sets require a two-point margin, two sets win, and the deciding set is to eleven', () => {
  const s = receiving(); s.score = [10, 10];
  awardPoint(s, 0); assert.deepEqual(s.score, [11, 10]); assert.deepEqual(s.sets, [0, 0]);
  s.phase = 'rally'; awardPoint(s, 0);
  assert.deepEqual(s.score, [12, 10]); assert.deepEqual(s.sets, [1, 0]); assert.equal(s.phase, 'set');
  advance(s, 3.1); assert.equal(s.setNumber, 2); assert.deepEqual(s.score, [0, 0]);
  s.phase = 'rally'; s.score = [10, 0]; awardPoint(s, 0);
  assert.equal(s.phase, 'match'); assert.equal(s.winner, 0); assert.deepEqual(s.sets, [2, 0]);
  const final = createMatch({ target: 21 });
  final.phase = 'set'; final.phaseTimer = 0.01; final.setNumber = 2; final.sets = [1, 1];
  step(final, 1 / 60); assert.equal(final.setNumber, 3); assert.equal(final.target, 11);
});

test('seeded AI matches finish with rallies and legal sets at every difficulty', () => {
  for (const difficulty of ['chill', 'club', 'pro']) {
    const s = createMatch({ aiOnly: true, difficulty, seed: 12345 });
    for (let n = 0; n < 100000 && s.phase !== 'match'; n++) step(s, 1 / 60);
    assert.equal(s.phase, 'match', `${difficulty} match must complete`);
    assert.equal(s.sets[s.winner], 2);
    assert(s.stats.longestRally >= 7, 'teams should build real rallies');
    assert(s.stats.spikes[0] > 0 && s.stats.spikes[1] > 0);
    assert(s.stats.longestRally < 150, 'rallies must not become endless loops');
  }
});

test('a human controller can move to receive, build sets and score with held contact inputs', () => {
  const s = createMatch({ difficulty: 'chill', seed: 41 });
  let passes = 0, spikes = 0, lastEventId = 0;
  for (let n = 0; n < 12000 && s.phase !== 'match'; n++) {
    const p = controllerPlayer(s, 0), b = s.ball;
    let input = { pass: true };
    if (s.phase === 'rally' && s.possession === 0) {
      const height = s.touches >= 2 ? 2.7 : s.touches === 1 ? 1.8 : 1.3;
      const discriminant = b.vz * b.vz + 19.6 * (b.z - height);
      const t = discriminant >= 0 ? Math.max(0, (b.vz + Math.sqrt(discriminant)) / 9.8) : predictLanding(b).time;
      const dx = Math.max(-8.6, Math.min(-0.5, b.x + b.vx * t)) - p.x;
      const dy = Math.max(-4.6, Math.min(4.6, b.y + b.vy * t)) - p.y;
      const length = Math.hypot(dx, dy);
      input = { mx: length > 0.15 ? dx / length : 0, my: length > 0.15 ? dy / length : 0,
        pass: s.touches < 2, spike: s.touches >= 2 };
    }
    step(s, 1 / 60, [input]);
    if (s.lastEvent.id !== lastEventId) {
      lastEventId = s.lastEvent.id;
      if (s.lastEvent.team === 0 && s.lastEvent.type === 'pass') passes++;
      if (s.lastEvent.team === 0 && s.lastEvent.type === 'spike') spikes++;
    }
  }
  assert(passes >= 8 && spikes >= 5);
  assert(s.score[0] > 0 || s.sets[0] > 0, 'human controls must produce scoring attacks');
});

test('simulation is repeatable and snapshots are detached JSON-safe values', () => {
  const a = createMatch({ aiOnly: true, seed: 217 }), b = createMatch({ aiOnly: true, seed: 217 });
  for (let n = 0; n < 3000; n++) { step(a, 1 / 60); step(b, 1 / 60); }
  assert.deepEqual(a, b);
  const copy = snapshot(a); assert.deepEqual(JSON.parse(JSON.stringify(copy)), a);
  copy.players[0].x = 999; assert.notEqual(a.players[0].x, 999);
  const landing = predictLanding({ x: 1, y: 2, z: 2, vx: 3, vy: -2, vz: 4 });
  const z = 2 + 4 * landing.time - 4.9 * landing.time * landing.time;
  assert(Math.abs(z) < 1e-8); assert(landing.time > 0);
});
