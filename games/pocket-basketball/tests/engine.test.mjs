import test from 'node:test';
import assert from 'node:assert/strict';
import { Match, COURT, isThreePoint, shotQuality } from '../public/engine.js';

function team(id, overrides = {}) {
  return { id, name: `College ${id}`, short: id, offense: 'motion', defense: 'man', tempo: 1,
    players: Array.from({ length: 8 }, (_, i) => ({ name: `${id} Player ${i}`, number: i + 1,
      height: 73 + i * 2, position: ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F', 'C'][i],
      ratings: { speed: 80, shooting: 80, inside: 80, passing: 80, handle: 80, defense: 80, rebound: 80, stamina: 80, freeThrow: 80 } })), ...overrides };
}
const fixture = options => new Match({ home: team('HOME'), away: team('AWAY'), seed: 100, ...options });
function advance(m, seconds, input = {}) { for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 60) m.step(1 / 60, input); }
function live(options) {
  const m = fixture(options); advance(m, 1); return m;
}
function isolatedShooter(x = 250, y = 190) {
  const m = live(); m._moveAI = () => {}; const p = m.carrier();
  p.x = x; p.y = y; p.vx = p.vy = 0; m.frontcourt = true;
  for (const other of m.active()) if (other !== p) { other.x = other.team ? 440 : 60; other.y = 470 + other.slot * 60; }
  m.ball.x = x; m.ball.y = y; return { m, p };
}

test('opening possession uses all ten active players and gives immediate home control', () => {
  const m = live(); assert.equal(m.active().length, 10); assert.equal(m.players.length, 16);
  assert.equal(m.carrier().team, 0); assert.equal(m.carrier().id, 0); assert.equal(m.controlled, 0);
  assert.equal(m.attackDir(0), -1); assert.equal(m.hoop(0).y, 52.5);
});

test('normalized movement has equal diagonal and axial speed and finite bounds', () => {
  const a = isolatedShooter(250, 470).m, b = isolatedShooter(250, 470).m;
  a.frontcourt = b.frontcourt = false;
  advance(a, .5, { x: 1 }); advance(b, .5, { x: 1, y: 1 });
  assert.ok(Math.abs(Math.hypot(a.carrier().vx, a.carrier().vy) - Math.hypot(b.carrier().vx, b.carrier().vy)) < 1);
  const before = a.carrier().x; a.step(NaN, { x: Infinity }); assert.equal(a.carrier().x, before);
  a.step(.1, { x: Infinity, y: NaN });
  assert.ok(a.players.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= COURT.width));
});

test('timing, openness, ratings, and range materially change shot quality', () => {
  const good = shotQuality({ shooting: 90, range: 240, value: 3, timing: .65 });
  assert.ok(good > shotQuality({ shooting: 60, range: 240, value: 3, timing: .65 }));
  assert.ok(good > shotQuality({ shooting: 90, range: 240, value: 3, timing: .05 }));
  assert.ok(good > shotQuality({ shooting: 90, range: 240, value: 3, timing: .65, contest: .9 }));
  assert.ok(shotQuality({ range: 650 }) < .05);
});

test('college arc and short corner identify two and three point shots at either hoop', () => {
  assert.equal(isThreePoint(250, 260, { x: 250, y: 52.5 }), false);
  assert.equal(isThreePoint(250, 290, { x: 250, y: 52.5 }), true);
  assert.equal(isThreePoint(27, 65, { x: 250, y: 52.5 }), true);
  assert.equal(isThreePoint(250, 655, { x: 250, y: 887.5 }), true);
});

for (const [y, expected] of [[190, 2], [310, 3]]) test(`physical made shot scores ${expected} and hands possession to opposition`, () => {
  const { m } = isolatedShooter(250, y); m.random = () => 0;
  assert.equal(m.action('shoot', { timing: .65 }), true);
  assert.equal(m.score[0], 0, 'points must wait for the ball to arrive');
  assert.equal(m.ball.flight.kind, 'shot'); advance(m, 1.7);
  assert.equal(m.score[0], expected); assert.equal(m.stats[0].fgm, 1);
  assert.equal(m.possession, 1); assert.ok(m.shotClock > 29 && m.shotClock <= 30);
});

test('released shot before period horn finishes, and halftime waits for it', () => {
  const { m } = isolatedShooter(); m.random = () => 0; m.clock = .04;
  m.action('shoot', { timing: .65 }); advance(m, .08);
  assert.equal(m.phase, 'live'); assert.equal(m.endPending, true); assert.equal(m.score[0], 0);
  advance(m, 1.2); assert.equal(m.phase, 'halftime'); assert.equal(m.score[0], 2);
  const atHalf = m.snapshot(); advance(m, 5); assert.deepEqual(m.snapshot(), atHalf);
});

test('a missed shot produces a loose rebound instead of a guaranteed score', () => {
  const { m } = isolatedShooter(); m.random = () => .999;
  m.action('shoot', { timing: .1 }); advance(m, 1.1);
  assert.equal(m.score[0], 0); assert.equal(m.ball.owner, null);
  assert.equal(m.ball.isRebound, true); assert.equal(m.ball.flight, null);
  assert.ok(m.drainEvents().some(e => e.type === 'miss'));
});

test('offensive rim rebound gets 20 seconds, defensive rebound gets 30', () => {
  for (const side of [0, 1]) {
    const { m } = isolatedShooter(); const collector = m.active(side)[1];
    for (const p of m.active()) { p.x = 450; p.y = 800 - p.slot * 40; }
    collector.x = 250; collector.y = 200; m.shotClock = 4;
    m._looseBall(250, 200, 0, 0, 0, true, 0); m.ball.z = 0; m.reboundWait = 0;
    m._stepBall(1 / 60);
    assert.equal(m.ball.owner, collector.id); assert.equal(m.shotClock, side === 0 ? 20 : 30);
    assert.equal(m.stats[side].rebounds, 1);
  }
});

test('pass travels before receiver gains control and cannot select an opponent', () => {
  const { m, p } = isolatedShooter(250, 260); const receiver = m.active(0)[1];
  receiver.x = 100; receiver.y = 225; m.random = () => .5;
  assert.equal(m.action('pass', { targetId: receiver.id }), true);
  assert.equal(m.ball.owner, null); assert.equal(m.ball.flight.kind, 'pass'); assert.equal(m.controlled, p.id);
  advance(m, .5); assert.equal(m.carrier().id, receiver.id); assert.equal(m.controlled, receiver.id);
});

test('all four opening-inbound pass targets meet the fixed landing point on foot', () => {
  for (let targetIndex = 0; targetIndex < 4; targetIndex++) {
    const m = live({ seed: 42 }); const target = m.receivers()[targetIndex];
    assert.equal(m.action('pass', { targetId: target.id }), true);
    const landing = { ...m.ball.flight.end }; let frames = 0;
    while (m.ball.flight && frames++ < 90) {
      const before = { x: target.x, y: target.y };
      assert.deepEqual(m.ball.flight.end, landing, 'ball must not home in on the receiver');
      m.step(1 / 60);
      assert.ok(Math.hypot(target.x - before.x, target.y - before.y) < 8, 'receiver moves on foot instead of teleporting');
    }
    assert.equal(m.carrier()?.id, target.id, `opening receiver ${targetIndex + 1} catches the pass`);
    assert.equal(m.controlled, target.id);
  }
});

test('shot clock violations turn possession over but a shot already airborne is legal', () => {
  const a = isolatedShooter().m; a.shotClock = .02; advance(a, .05);
  assert.equal(a.possession, 1); assert.equal(a.phase, 'inbound');
  const b = isolatedShooter().m; b.shotClock = .02; b.random = () => 0; b.action('shoot', { timing: .65 });
  advance(b, .1); assert.equal(b.possession, 0); assert.equal(b.ball.flight.kind, 'shot');
  advance(b, 1.1); assert.equal(b.score[0], 2);
});

test('ten elapsed backcourt seconds and illegal frontcourt return each cause turnovers', () => {
  const a = isolatedShooter(250, 700).m; a.frontcourt = false; advance(a, 10.2);
  assert.equal(a.possession, 1); assert.ok(a.drainEvents().some(e => /Ten seconds/.test(e.text)));
  const b = isolatedShooter(250, 400).m; advance(b, .05); b.carrier().y = 600; advance(b, .05);
  assert.equal(b.possession, 1); assert.ok(b.drainEvents().some(e => /Backcourt/.test(e.text)));
});

test('steals require physical proximity and have a cooldown', () => {
  const m = live(); m.human = 1; const d = m.active(1)[0], c = m.carrier(); m.controlled = d.id;
  d.x = 40; d.y = 40; assert.equal(m.action('steal'), false);
  d.x = c.x + 20; d.y = c.y; m.random = () => 0;
  assert.equal(m.action('steal'), true); assert.equal(m.carrier().id, d.id); assert.equal(m.stats[1].steals, 1);
  assert.equal(m.action('steal'), false);
});

test('a defender blocking a shot out of bounds gives the offense the ball without a clock reset', () => {
  const { m, p } = isolatedShooter(); m.random = () => 0;
  m.action('shoot', { timing: .65 }); const defender = m.active(1)[0];
  defender.x = m.ball.x + 15; defender.y = m.ball.y; m.shotClock = 8;
  assert.equal(m._block(defender), true); assert.equal(m.ball.flight, null); assert.equal(m.lastTouch, 1);
  m.ball.x = -2; m.ball.vx = -50; m._stepBall(1 / 60);
  assert.equal(m.possession, p.team); assert.equal(m.phase, 'inbound'); assert.equal(m.shotClock, 8);
});

test('new frontcourt inbound gets 20 seconds, backcourt inbound gets 30', () => {
  const a = live(); a._turnover(0, 'Out of bounds', { x: 25, y: 800 });
  assert.equal(a.possession, 1); assert.equal(a.shotClock, 20);
  const b = live(); b._turnover(0, 'Out of bounds', { x: 25, y: 200 });
  assert.equal(b.possession, 1); assert.equal(b.shotClock, 30);
});

test('fifth foul replaces the disqualified player from the bench', () => {
  const m = live(); const victim = m.active(0)[0], defender = m.active(1)[0]; defender.fouls = 4;
  m._foul(defender, victim); assert.equal(defender.fouls, 5); assert.equal(defender.active, false);
  assert.equal(m.active(1).length, 5); assert.ok(m.active(1).some(p => p.rosterIndex >= 5));
});

test('a foul during an AI update stops all later live-ball actors in that step', () => {
  const m = live({ human: -1 }); let updates = 0;
  m._moveAI = () => { updates++; if (updates === 1) m._foul(m.active(1)[0], m.active(0)[0], { shooting: true, shots: 2 }); };
  m.step(1 / 60); assert.equal(updates, 1); assert.equal(m.phase, 'freeThrow');
  const shooter = m.player(m.freeThrows.shooter);
  assert.equal(shooter.x, 250); assert.equal(shooter.y, 190);
});

test('seventh team foul creates one-and-one; missed front end cancels the second', () => {
  const m = live(); m._moveAI = () => {}; m.teamFouls[1] = 6;
  m._foul(m.active(1)[0], m.active(0)[0]); assert.equal(m.phase, 'freeThrow'); assert.equal(m.freeThrows.oneAndOne, true);
  m.random = () => .999; advance(m, 1); assert.equal(m.action('shoot', { timing: 0 }), true); advance(m, 1);
  assert.equal(m.freeThrows, null); assert.equal(m.score[0], 0); assert.equal(m.phase, 'live');
});

test('tenth team foul awards two shots even if first misses; free throws stop both clocks', () => {
  const m = live(); m.teamFouls[1] = 9; m._foul(m.active(1)[0], m.active(0)[0]);
  assert.equal(m.freeThrows.oneAndOne, false); const clock = m.clock, shotClock = m.shotClock;
  m.random = () => .999; advance(m, 1); m.action('shoot', { timing: .1 }); advance(m, 1);
  assert.equal(m.freeThrows.remaining, 1); assert.equal(m.clock, clock); assert.equal(m.shotClock, shotClock);
  m.random = () => 0; advance(m, 1); m.action('shoot', { timing: .65 }); advance(m, 1);
  assert.equal(m.score[0], 1); assert.ok(m.drainEvents().some(e => e.type === 'score' && e.shotType === 'freeThrow'));
});

test('live substitutions queue until a dead ball and retain all five slots', () => {
  const m = live(); const out = m.active(0)[1], incoming = m.players.find(p => p.team === 0 && !p.active);
  assert.equal(m.action('substitute', { outId: out.id, inId: incoming.id }), true);
  assert.equal(out.active, true); assert.equal(m.pendingSubs.length, 1);
  m.action('timeout'); assert.equal(out.active, false); assert.equal(incoming.active, true);
  assert.equal(m.pendingSubs.length, 0); assert.equal(m.active(0).length, 5); assert.equal(m.timeouts[0], 2);
});

test('halftime resets team fouls and switches ends; overtime carries fouls', () => {
  const m = live(); m.teamFouls = [8, 9]; m.clock = .01; advance(m, .04);
  assert.equal(m.phase, 'halftime'); m.action('continue');
  assert.deepEqual(m.teamFouls, [0, 0]); assert.equal(m.attackDir(0), 1);
  advance(m, 1.2); m.score = [8, 8]; m.teamFouls = [7, 10]; m.clock = .01; advance(m, .04);
  assert.equal(m.period, 3); assert.equal(m.clock, 60); assert.deepEqual(m.teamFouls, [7, 10]);
});

test('practice keeps the period clock while retaining normal possessions', () => {
  const m = live({ practice: true, halfSeconds: 90 }); const clock = m.clock;
  advance(m, 2, { x: .3, y: -.7 }); assert.equal(m.clock, clock); assert.ok(m.shotClock < 30);
});

test('snapshots isolate live positions, stats, and ball flight from replay mutation', () => {
  const m = live(); const s = m.snapshot(); s.players[0].x = -999; s.players[0].stats.points = 99;
  s.ball.x = -999; s.score[0] = 99; assert.notEqual(m.players[0].x, -999);
  assert.equal(m.players[0].stats.points, 0); assert.notEqual(m.ball.x, -999); assert.equal(m.score[0], 0);
});

test('eight seeded CPU matchups complete, score, and preserve finite simulation state', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const m = fixture({ human: -1, halfSeconds: 90, seed }); let frames = 0;
    while (m.phase !== 'finished' && frames++ < 36000) {
      if (m.phase === 'halftime') m.action('continue');
      m.step(1 / 60); m.drainEvents();
    }
    assert.equal(m.phase, 'finished', `seed ${seed} completes`);
    assert.notEqual(m.score[0], m.score[1]); assert.ok(m.stats[0].fga > 0 && m.stats[1].fga > 0);
    assert.ok(m.players.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.stamina >= 0 && p.stamina <= 1));
    assert.deepEqual(m.stats.map(s => s.points), m.score);
  }
});
