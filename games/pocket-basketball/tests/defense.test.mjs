import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../public/engine.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function team(id) {
  return { id, name: id, short: id, offense: 'motion', defense: 'man', tempo: 1,
    players: Array.from({ length: 8 }, (_, i) => ({ name: `${id} Player ${i}`, height: 76,
      ratings: { speed: 80, shooting: 80, inside: 80, passing: 80, handle: 80,
        defense: 80, rebound: 80, stamina: 80, freeThrow: 80 } })) };
}
function frames(m, count, input = {}) { for (let i = 0; i < count; i++) m.step(1 / 60, input); }
function fixture(options = {}) {
  const m = new Match({ home: team('HOME'), away: team('AWAY'), seed: 42, ...options });
  frames(m, 60);
  const spots = [[250, 370], [110, 260], [440, 260], [65, 100], [430, 95]];
  for (const p of m.active()) {
    [p.x, p.y] = p.team ? [80 + p.slot * 80, 650] : spots[p.slot];
    p.vx = p.vy = 0; p.aiTimer = 1e6; p.actionCooldown = 0;
  }
  m.frontcourt = true; m.ball.x = 250; m.ball.y = 370;
  const mark = m.active(0)[1], defender = m.active(1)[1];
  const position = m._defensiveObservation(defender);
  defender.x = position.x; defender.y = position.y;
  m.controlled = mark.id;
  // A real controlled cut against one real moving defender; everyone else is
  // stationary so collisions or other AI choices cannot manufacture the lag.
  const moveAI = m._moveAI.bind(m);
  m._moveAI = (p, dt) => { if (p === defender) moveAI(p, dt); };
  m._resetDefenseTracking(); m._updateDefenseTracking();
  return { m, mark, defender };
}

test('defenders lag an actual cut, then recover to coverage on foot', () => {
  const { m, mark, defender } = fixture();
  const start = { x: defender.x, y: defender.y }, target = m._defensiveTarget(defender), markX = mark.x;
  frames(m, 6, { x: -1 });
  assert.ok(mark.x < markX - 5, 'the attacker has begun a real movement input');
  assert.ok(distance(defender, start) < .5, 'the defender does not mirror the first movement frames');
  assert.deepEqual(m._defensiveTarget(defender), target);
  let maxStep = 0;
  for (let i = 0; i < 120; i++) {
    const before = { x: defender.x, y: defender.y };
    m.step(1 / 60, i < 24 ? { x: -1 } : {});
    maxStep = Math.max(maxStep, distance(defender, before));
  }
  const wanted = m._defensiveObservation(defender);
  assert.ok(defender.x < start.x - 35, 'the delayed read eventually follows the cut');
  assert.ok(distance(defender, wanted) < 8, 'the defender recovers rather than wandering or staying frozen');
  assert.ok(maxStep < 8, 'recovery uses ordinary movement and contact limits');
});

test('defensive habits are distinct and seeded; extra target reads cannot change play', () => {
  const a = fixture(), b = fixture(), different = fixture({ seed: 43 });
  const profiles = a.m.active(1).map(p => p.defenseProfile);
  assert.equal(new Set(profiles.map(p => p.reaction)).size, 5);
  assert.equal(new Set(profiles.map(p => p.shade)).size, 5);
  assert.ok(profiles.every(p => p.cadence >= .055 && p.cadence <= .09 && Math.abs(p.shade) <= 10 && Math.abs(p.cushion) <= 7));
  assert.notDeepEqual(a.defender.defenseProfile, different.defender.defenseProfile);
  for (let i = 0; i < 90; i++) {
    for (let reads = 0; reads < 5; reads++) {
      a.m._defensiveTarget(a.defender); a.m._defensiveObservation(a.defender);
    }
    const input = { x: i < 30 ? 1 : i < 60 ? -1 : 0 };
    a.m.step(1 / 60, input); b.m.step(1 / 60, input);
  }
  assert.deepEqual(a.m.snapshot(), b.m.snapshot());
  const before = a.m.snapshot();
  a.m.random = () => { throw new Error('defensive target reads must not roll randomness'); };
  for (let i = 0; i < 20; i++) {
    const target = a.m._defensiveTarget(a.defender); target.x = -999;
    a.m._defensiveObservation(a.defender);
  }
  assert.deepEqual(a.m.snapshot(), before, 'target reads and returned values have no side effects');
});

test('rating, fatigue and difficulty affect bounded defensive reaction time', () => {
  function reaction({ rating, stamina, difficulty }) {
    const { m, mark, defender } = fixture({ difficulty });
    defender.ratings.defense = rating; defender.stamina = stamina;
    m._resetDefenseTracking(); m._updateDefenseTracking();
    const oldTarget = m._defensiveTarget(defender), timing = m._defenseTiming(defender);
    mark.x += 100;
    let count = 0;
    while (distance(m._defensiveTarget(defender), oldTarget) < 20 && count < 30) { m.step(1 / 60); count++; }
    assert.ok(count >= 9 && count <= 25, `reaction stays bounded: ${count} frames`);
    return { count, timing };
  }
  const fresh = reaction({ rating: 95, stamina: 1, difficulty: 'varsity' });
  const tired = reaction({ rating: 50, stamina: .1, difficulty: 'varsity' });
  const rookie = reaction({ rating: 80, stamina: 1, difficulty: 'rookie' });
  const hard = reaction({ rating: 80, stamina: 1, difficulty: 'allamerican' });
  assert.ok(fresh.count < tired.count && fresh.timing.error < tired.timing.error);
  assert.ok(hard.count <= rookie.count && hard.timing.reaction < rookie.timing.reaction);
  assert.ok([fresh, tired, rookie, hard].every(r => r.timing.reaction >= .15 && r.timing.reaction <= .31));
});

test('man assignments, zone areas and press help remain distinct and bounded', () => {
  const { m } = fixture();
  const defenders = m.active(1), carrier = m.carrier();
  const positions = [[230, 390], [300, 380], [100, 150], [400, 150], [250, 90]];
  defenders.forEach((p, i) => { [p.x, p.y] = positions[i]; });
  for (const mode of ['man', 'zone', 'press']) {
    m.defense[1] = mode; m._resetDefenseTracking(); m._updateDefenseTracking();
    const reads = defenders.map(p => p.defenseRead), targets = defenders.map(p => m._defensiveTarget(p));
    assert.ok(targets.every(t => t.x >= 15 && t.x <= 485 && t.y >= 18 && t.y <= 922));
    if (mode === 'man') {
      defenders.forEach(p => assert.equal(p.defenseRead.key, `man:mark:${m.active(0).find(o => o.slot === p.slot).id}`));
    } else if (mode === 'zone') {
      assert.ok(reads.filter(r => r.key.startsWith('zone:area:')).length >= 3);
      assert.ok(Math.max(...targets.map(t => t.x)) - Math.min(...targets.map(t => t.x)) > 250);
    } else {
      assert.equal(reads.filter(r => r.key === `press:ball:${carrier.id}`).length, 2);
      assert.ok(reads.some(r => r.key.startsWith('press:mark:')), 'the remaining defenders preserve other coverage');
    }
  }
});

test('restarts, turnovers, lineups, defensive changes and period boundaries discard old tracking', () => {
  const resets = [
    m => m._prepareInbound(0, { x: 250, y: 400 }),
    m => m._giveBall(m.active(1)[0]),
    m => m._substitute(m.active(1)[1].id, m.players.find(p => p.team === 1 && !p.active).id),
    m => m._startFreeThrows(m.active(0)[0], 2),
    m => { m.human = 1; m.setDefense('zone'); },
    m => m._endPeriod(),
  ];
  for (const reset of resets) {
    const { m, defender } = fixture(); frames(m, 10, { x: 1 });
    assert.ok(defender.defenseRead.observations.length > 0);
    const profile = { ...defender.defenseProfile };
    reset(m);
    assert.ok(m.active(1).every(p => p.defenseRead === null));
    assert.deepEqual(defender.defenseProfile, profile, 'stoppages do not reroll individual habits');
    if (m.phase === 'live') {
      m._updateDefenseTracking();
      assert.ok(m.active(1 - m.possession).every(p => p.defenseRead.context === m._defenseContext(p)));
      assert.ok(m.active(m.possession).every(p => p.defenseRead === null));
    }
  }
});

test('snapshots own every nested defensive profile, target and queued observation', () => {
  const { m, defender } = fixture(); frames(m, 10, { x: 1 });
  const saved = m.snapshot(), player = saved.players.find(p => p.id === defender.id);
  assert.ok(player.defenseRead.observations.length > 0);
  const live = JSON.stringify({ profile: defender.defenseProfile, read: defender.defenseRead });
  player.defenseProfile.shade = -999;
  player.defenseRead.target.x = -999;
  player.defenseRead.observations[0].x = -999;
  player.defenseRead.observations.push({ at: -1, x: -1, y: -1 });
  assert.equal(JSON.stringify({ profile: defender.defenseProfile, read: defender.defenseRead }), live);
});
