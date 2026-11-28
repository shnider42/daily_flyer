import test from 'node:test';
import assert from 'node:assert/strict';
import { Match, AFTER_SCORE_HOLD_SECONDS, MADE_BASKET_INBOUND_SECONDS } from '../public/engine.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function team(id) {
  return { id, name: id, short: id, offense: 'motion', defense: 'man', tempo: 1,
    players: Array.from({ length: 8 }, (_, i) => ({ name: `${id} Player ${i}`, number: i + 1,
      height: 73 + i * 2, position: ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F', 'C'][i],
      ratings: { speed: 80, shooting: 80, inside: 80, passing: 80, handle: 80,
        defense: 80, rebound: 80, stamina: 80, freeThrow: 80 } })) };
}
function frames(m, count) { for (let i = 0; i < count; i++) m.step(1 / 60); }
function until(m, condition, limit = 180) {
  let count = 0;
  while (!condition() && count < limit) { m.step(1 / 60); count++; }
  assert.ok(condition(), `expected state within ${limit} frames`);
  return count;
}
function fixture() {
  const m = new Match({ home: team('HOME'), away: team('AWAY'), seed: 42 });
  frames(m, 60);
  const spots = [[250, 260], [60, 340], [440, 340], [100, 220], [275, 105]];
  for (const p of m.active()) {
    [p.x, p.y] = p.team ? [460, 500 + p.slot * 70] : spots[p.slot];
    p.vx = p.vy = 0; p.actionCooldown = 0; p.aiTimer = 1e6;
  }
  m.frontcourt = true;
  m.ball.x = m.carrier().x; m.ball.y = m.carrier().y;
  // Keep defenders fixed for reproducible lanes, but retain the real receiving
  // movement, acceleration, stamina, body contact, flight and clock pathways.
  const moveAI = m._moveAI.bind(m);
  m._moveAI = (p, dt) => {
    if (m.ball.flight?.kind === 'pass' && m.ball.flight.target === p.id) moveAI(p, dt);
  };
  m.random = () => 0;
  return { m, passer: m.carrier(), target: m.active(0)[4] };
}
const up = { x: 0, y: -1 };

test('through preview is pure, leads a moving receiver, and fixes the release destination', () => {
  const { m, passer } = fixture(), wing = m.active(0)[2];
  wing.x = 400; wing.y = 240; wing.vx = 60; wing.vy = -30;
  m.random = () => { throw new Error('preview and release must not consume randomness'); };
  const before = m.snapshot(), plan = m.throughPassInfo(passer, { x: 1, y: 0 });
  assert.equal(plan.type, 'bounce'); assert.equal(plan.targetId, wing.id);
  assert.ok(plan.end.x > wing.x && plan.end.y < wing.y, 'lead follows the receiver’s movement');
  assert.ok(plan.end.x <= 478 && plan.end.y >= 22);
  assert.deepEqual(m.snapshot(), before);
  const landing = { ...plan.end };
  plan.end.x = -100; // The preview is a fresh value, not an engine-owned target.
  assert.equal(m.action('through', { aim: { x: 1, y: 0 }, possessionEpoch: m.possessionEpoch }), true);
  assert.equal(m.ball.flight.kind, 'pass'); assert.equal(m.ball.flight.style, 'bounce');
  assert.deepEqual(m.ball.flight.end, landing);
  frames(m, 5);
  assert.deepEqual(m.ball.flight.end, landing, 'the ball does not home in as players move');
});

test('lob selection requires deliberate hoop aim, frontcourt range and an active near-rim receiver', () => {
  const { m, passer, target } = fixture();
  assert.equal(m.throughPassInfo(passer, up).type, 'lob');
  for (const aim of [undefined, { x: 0, y: 0 }, { x: 0, y: -.2 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: NaN, y: Infinity }])
    assert.equal(m.throughPassInfo(passer, aim).type, 'bounce');
  passer.y = 340;
  assert.equal(m.throughPassInfo(passer, up).type, 'bounce', 'too far from the rim');
  passer.y = 620;
  assert.equal(m.throughPassInfo(passer, up).type, 'bounce', 'backcourt passes stay bounce passes');
  passer.y = 260; target.y = 160;
  assert.equal(m.throughPassInfo(passer, up).type, 'bounce', 'receiver must be near the rim');
  target.y = 105; target.active = false;
  assert.equal(m.throughPassInfo(passer, up).type, 'bounce', 'a reserve is not a lob target');
  target.active = true;
  m.period = 2;
  for (const p of m.active()) p.y = 940 - p.y;
  assert.equal(m.throughPassInfo(passer, { x: 0, y: 1 }).type, 'lob', 'eligibility follows the second-half attacking hoop');
  assert.equal(m.throughPassInfo(passer, up).type, 'bounce');
});

test('through actions safely reject stale tokens, unavailable carriers, flight and dead balls', () => {
  const { m, passer, target } = fixture();
  assert.equal(m.throughPassInfo(target, up), null);
  assert.equal(m.action('through', { aim: up, possessionEpoch: m.possessionEpoch - 1 }), false);
  assert.equal(m.ball.owner, passer.id);
  passer.actionCooldown = .2;
  assert.equal(m.throughPassInfo(passer, up), null);
  assert.equal(m.action('through', { aim: up }), false);
  passer.actionCooldown = 0;
  assert.equal(m.action('through', { aim: up }), true);
  const flight = m.ball.flight;
  assert.equal(m.action('through', { aim: up }), false);
  assert.equal(m.throughPassInfo(passer, up), null);
  assert.equal(m.ball.flight, flight);
  m._prepareInbound(0, { x: 250, y: 260 });
  assert.equal(m.action('through', { aim: up }), false);
  assert.equal(m.throughPassInfo(passer, up), null);
});

test('a lead bounce physically hits the floor, rises, and is caught on foot at a fixed point', () => {
  const { m } = fixture(), wing = m.active(0)[2];
  wing.x = 400; wing.y = 240; wing.vx = 60; wing.vy = -30;
  assert.equal(m.action('through', { aim: { x: 1, y: 0 } }), true);
  const flight = m.ball.flight, landing = { ...flight.end };
  let floorSeen = false, roseAfterBounce = false, maxStep = 0;
  for (let frame = 0; frame < 90 && m.ball.flight === flight; frame++) {
    assert.deepEqual(flight.end, landing);
    const before = { x: wing.x, y: wing.y };
    m.step(1 / 60);
    maxStep = Math.max(maxStep, distance(wing, before));
    if (m.ball.flight === flight) {
      if (flight.bounced && m.ball.z === 0) floorSeen = true;
      if (floorSeen && m.ball.z > 8) roseAfterBounce = true;
      assert.ok(m.ball.z >= 0 && m.ball.z <= 18);
    }
  }
  assert.ok(floorSeen && roseAfterBounce, 'the ball drops to the floor then rises to the catch');
  assert.ok(maxStep < 8, 'receiving runs remain physical rather than teleporting');
  assert.equal(m.carrier()?.id, wing.id); assert.equal(m.controlled, wing.id);
  assert.equal(m.stats[0].fga, 0); assert.equal(m.stats[0].assists, 0);
});

test('low bounce passes can be intercepted in a defender’s actual passing lane', () => {
  const { m } = fixture();
  m.action('through', { aim: { x: 1, y: 0 } });
  const flight = m.ball.flight, defender = m.active(1)[0];
  defender.x = flight.start.x + (flight.end.x - flight.start.x) * .45;
  defender.y = flight.start.y + (flight.end.y - flight.start.y) * .45;
  until(m, () => m.ball.flight !== flight);
  assert.equal(m.carrier()?.id, defender.id);
  assert.equal(m.stats[1].steals, 1); assert.equal(m.stats[0].turnovers, 1);
  assert.equal(m.stats[0].fga, 0); assert.equal(m.lastPass, null);
});

test('a real near-rim lob catch starts one alley attempt and awards two points and one assist', () => {
  const { m, passer, target } = fixture();
  m.action('through', { aim: up });
  const flight = m.ball.flight, landing = { ...flight.end };
  let maxHeight = 0, maxStep = 0;
  for (let frame = 0; frame < 90 && m.ball.flight === flight; frame++) {
    assert.equal(m.stats[0].fga, 0); assert.equal(m.score[0], 0);
    assert.deepEqual(flight.end, landing);
    const before = { x: target.x, y: target.y };
    m.step(1 / 60);
    maxHeight = Math.max(maxHeight, m.ball.z); maxStep = Math.max(maxStep, distance(target, before));
  }
  assert.ok(maxHeight > 100 && maxStep < 8);
  assert.ok(distance(target, landing) < 30, 'automatic finish requires an actual catch in reach');
  assert.equal(m.ball.flight?.kind, 'shot'); assert.equal(m.ball.flight?.type, 'alley-oop');
  assert.equal(m.stats[0].fga, 1); assert.equal(m.score[0], 0);
  until(m, () => m.phase === 'afterScore');
  assert.equal(m.score[0], 2); assert.equal(target.stats.fgm, 1);
  assert.equal(m.stats[0].threesAttempted, 0);
  assert.equal(passer.stats.assists, 1); assert.equal(m.stats[0].assists, 1);
  assert.equal(m.afterScore.scorerId, target.id); assert.equal(m.afterScore.shotType, 'alley-oop');
});

test('a lob clears a standing midpoint defender but a jumping defender can contest the catch', () => {
  for (const jumping of [false, true]) {
    const { m, target } = fixture();
    m.action('through', { aim: up });
    const flight = m.ball.flight, defender = m.active(1)[0];
    const progress = jumping ? 1 : .5;
    defender.x = flight.start.x + (flight.end.x - flight.start.x) * progress;
    defender.y = flight.start.y + (flight.end.y - flight.start.y) * progress;
    if (jumping) {
      target.x = 100; target.y = 350; m._moveAI = () => {};
      while (flight.time < flight.duration * .75) m.step(1 / 60);
      assert.equal(m._block(defender), true, 'the separate block action supplies the jump');
    }
    until(m, () => m.ball.flight !== flight);
    if (jumping) {
      assert.equal(m.carrier()?.id, defender.id);
      assert.equal(m.stats[1].steals, 1); assert.equal(m.stats[0].turnovers, 1);
      assert.equal(m.stats[0].fga, 0); assert.equal(m.score[0], 0);
    } else {
      assert.equal(m.ball.flight?.type, 'alley-oop');
      assert.equal(m.stats[1].steals, 0); assert.equal(m.stats[0].turnovers, 0);
    }
  }
});

test('failed lob catches are loose passes while failed finishes are actual reboundable shots', () => {
  for (const failCatch of [true, false]) {
    const { m } = fixture(); let rolls = 0;
    // Catch, ownership AI timer, then the shot-quality roll are independent.
    m.random = failCatch ? () => .999 : () => rolls++ === 2 ? .999 : 0;
    m.action('through', { aim: up });
    const flight = m.ball.flight;
    until(m, () => m.ball.flight !== flight);
    if (!failCatch) {
      assert.equal(m.ball.flight?.type, 'alley-oop'); assert.equal(m.ball.flight.made, false);
      until(m, () => m.ball.flight === null);
    }
    assert.equal(m.ball.owner, null); assert.equal(m.ball.isRebound, !failCatch);
    assert.equal(m.stats[0].fga, failCatch ? 0 : 1);
    assert.equal(m.score[0], 0); assert.equal(m.stats[0].fgm, 0); assert.equal(m.stats[0].assists, 0);
    if (failCatch) {
      const defender = m.active(1)[0];
      m.active(0).forEach(p => { p.x = 80; p.y = 600 + p.slot * 40; });
      defender.x = m.ball.x; defender.y = m.ball.y;
      m.ball.z = 0; m.reboundWait = 0; m._stepBall(0);
      assert.equal(m.carrier()?.id, defender.id);
      assert.equal(m.stats[0].turnovers, 1); assert.equal(m.stats[1].steals, 1);
      assert.equal(m.stats[1].rebounds, 0, 'recovering a mishandled pass is not a rebound');
    }
  }
});

test('a lob still airborne at either clock expiry never counts as an attempted shot', () => {
  for (const clock of ['clock', 'shotClock']) {
    const { m } = fixture();
    m[clock] = .1; m.action('through', { aim: up }); frames(m, 12);
    assert.equal(m.phase, clock === 'clock' ? 'halftime' : 'inbound');
    assert.equal(m.ball.flight, null); assert.equal(m.score[0], 0);
    assert.equal(m.stats[0].fga, 0); assert.equal(m.stats[0].assists, 0);
    if (clock === 'shotClock') assert.equal(m.possession, 1);
  }
  const { m } = fixture();
  m.action('through', { aim: up }); until(m, () => m.ball.flight?.kind === 'shot');
  m.clock = .02; until(m, () => m.phase === 'halftime');
  assert.equal(m.score[0], 2); assert.equal(m.stats[0].fga, 1);
  assert.equal(m.afterScore, null, 'a legal released buzzer shot resolves the period directly');
});

test('a made basket holds the hoop then sets up the inbound for 2.25 frozen-clock seconds', () => {
  const { m, passer } = fixture();
  passer.x = 250; passer.y = 190;
  m.action('shoot', { timing: .65 }); until(m, () => m.phase === 'afterScore');
  const clock = m.clock, positions = m.active().map(p => [p.x, p.y]);
  assert.equal(m.possession, 1); assert.equal(m.shotClock, 30);
  assert.deepEqual({ x: m.ball.x, y: m.ball.y }, m.hoop(0));
  assert.equal(m.afterScore.points, 2); assert.equal(m.afterScore.scorerId, passer.id);
  const snapshot = m.snapshot(); snapshot.afterScore.hoop.x = -1;
  assert.equal(m.afterScore.hoop.x, 250, 'snapshot metadata is copied');
  for (const action of ['shoot', 'pass', 'through', 'steal', 'block', 'screen', 'timeout'])
    assert.equal(m.action(action, { timing: .65, aim: up }), false);
  let heldFrames = 0, inboundFrames = 0;
  while (m.phase !== 'live' && heldFrames + inboundFrames < 150) {
    const phase = m.phase;
    if (phase === 'afterScore') heldFrames++; else inboundFrames++;
    m.step(1 / 60, { x: 1, sprint: true });
    if (m.phase === 'afterScore') assert.deepEqual(m.active().map(p => [p.x, p.y]), positions);
    assert.equal(m.clock, clock); assert.equal(m.shotClock, 30);
  }
  assert.equal(m.phase, 'live'); assert.equal(m.afterScore, null);
  assert.ok(Math.abs(heldFrames / 60 - AFTER_SCORE_HOLD_SECONDS) <= 1 / 60);
  assert.ok(Math.abs(inboundFrames / 60 - MADE_BASKET_INBOUND_SECONDS) <= 1 / 60);
  assert.ok(Math.abs((heldFrames + inboundFrames) / 60 - 2.25) <= 1 / 60);
  assert.equal(m.carrier()?.team, 1); assert.equal(m.ball.flight, null);
  assert.equal(m.stats[0].fga, 1, 'dead-ball actions never queue a new shot');
});

test('alley and-ones keep possession for the FT and final made FTs respect reset and horn paths', () => {
  for (const buzzer of [false, true]) {
    const { m, passer, target } = fixture(), defender = m.active(1)[0];
    const plan = m.throughPassInfo(passer, up);
    defender.x = plan.end.x + 36; defender.y = plan.end.y;
    m.action('through', { aim: up }); until(m, () => m.ball.flight?.kind === 'shot');
    assert.equal(m.ball.flight.foul, defender.id);
    if (buzzer) m.clock = .02;
    until(m, () => m.phase === 'freeThrow');
    assert.equal(m.score[0], 2); assert.equal(m.possession, 0); assert.equal(m.afterScore, null);
    assert.equal(m.freeThrows.remaining, 1); assert.equal(m.freeThrows.shooter, target.id);
    until(m, () => m.phaseTime <= 0);
    assert.equal(m.action('shoot', { timing: .65 }), true);
    until(m, () => m.phase !== 'freeThrow');
    assert.equal(m.score[0], 3); assert.equal(m.stats[0].fga, 1); assert.equal(passer.stats.assists, 1);
    if (buzzer) {
      assert.equal(m.phase, 'halftime'); assert.equal(m.afterScore, null);
    } else {
      assert.equal(m.phase, 'afterScore'); assert.equal(m.possession, 1);
      assert.equal(m.afterScore.shotType, 'freeThrow'); assert.equal(m.afterScore.points, 1);
      assert.equal(m.phaseTime, AFTER_SCORE_HOLD_SECONDS);
    }
  }
});
