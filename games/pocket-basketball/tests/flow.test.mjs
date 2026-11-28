import test from 'node:test';
import assert from 'node:assert/strict';
import { Match, OFF_BALL_SPEED_MULTIPLIER } from '../public/engine.js';
import { getTeam } from '../public/teams.js';

const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const frames = (m, n, input = {}) => { for (let i = 0; i < n; i++) m.step(1 / 60, input); };
function team(id) {
  return { id, name: id, short: id, offense: 'motion', defense: 'man', tempo: 1,
    players: Array.from({ length: 8 }, (_, i) => ({ name: `${id} Player ${i}`, height: 78,
      ratings: { speed: 64, shooting: 85, inside: 80, passing: 80, handle: 80,
        defense: 80, rebound: 80, stamina: 80, freeThrow: 80, awareness: 75, anticipation: 75 } })) };
}
function fixture({ play = 'motion', seed = 42 } = {}) {
  const m = new Match({ home: team('HOME'), away: team('AWAY'), seed, practice: true });
  frames(m, 60); m.setPlay(play);
  const own = [[155, 285], [34, 152.5], [464, 152.5], [405, 317.5], [330, 132.5]];
  const defenders = [[174, 255], [53, 179], [404, 177], [350, 276], [311, 115]];
  for (const p of m.active()) {
    [p.x, p.y] = (p.team ? defenders : own)[p.slot]; p.vx = p.vy = 0; p.aiTimer = 1e6;
  }
  m.frontcourt = true; m.ball.x = 155; m.ball.y = 285;
  m._resetDefenseTracking(); m._resetOffenseFlow();
  return m;
}

test('a slower aware receiver creates an earlier passing window without a speed bonus', () => {
  function run(awareness, speed) {
    const m = fixture(), p = m.active(0)[1];
    p.ratings.awareness = awareness; p.ratings.speed = speed;
    let maximumSpeed = 0, firstWindow = null;
    for (let i = 0; i < 240; i++) {
      m.step(1 / 60);
      maximumSpeed = Math.max(maximumSpeed, Math.hypot(p.vx, p.vy));
      const window = m._passingWindow(p);
      if (firstWindow === null && window.gap > 35 && window.openness > 38) firstWindow = (i + 1) / 60;
    }
    return { firstWindow, maximumSpeed, speed };
  }
  const smart = run(95, 64), slowerReader = run(60, 64), fastRunner = run(60, 90);
  assert.ok(smart.firstWindow < 1.1, 'the early angle read creates a real open passing lane');
  assert.ok(fastRunner.firstWindow > smart.firstWindow + 1.3, 'running faster cannot replace finding the angle');
  assert.ok(slowerReader.firstWindow > smart.firstWindow + 1.3);
  assert.ok(slowerReader.firstWindow < 4 && fastRunner.firstWindow < 4,
    'a persistently denied lower reader eventually tries another angle instead of remaining stuck');
  const physicalCap = (92 + (64 - 50) * 1.14) * OFF_BALL_SPEED_MULTIPLIER;
  assert.ok(smart.maximumSpeed <= physicalCap + .01, 'awareness never changes physical top speed');
});

test('a completed pass starts one give-and-go, fills its vacancy and then clears the lane on foot', () => {
  const m = fixture(), passer = m.carrier(), receiver = m.active(0)[2];
  passer.x = 250; passer.y = 335; m.ball.x = 250; m.ball.y = 335;
  for (const p of m.active(1)) { p.x = 50 + p.slot * 90; p.y = 650; }
  const move = m._moveAI.bind(m); m._moveAI = (p, dt) => { if (p.team === 0) move(p, dt); };
  m._resetOffenseFlow(); m._resetDefenseTracking();
  assert.ok(m._pass(passer, receiver.id));
  let sawCut = false, sawFill = false, sawClear = false, maxStep = 0;
  for (let i = 0; i < 250; i++) {
    const old = m.active(0).map(p => ({ id: p.id, x: p.x, y: p.y })); m.step(1 / 60);
    const actions = m.active(0).map(p => p.offenseRead?.intent);
    assert.ok(actions.filter(action => ['setup', 'cut', 'roll'].includes(action)).length <= 1);
    sawCut ||= passer.offenseRead?.intent === 'cut' && passer.offenseRead.reason === 'give-and-go';
    sawFill ||= actions.includes('fill'); sawClear ||= passer.offenseRead?.intent === 'clear';
    for (const p of m.active(0)) maxStep = Math.max(maxStep, gap(p, old.find(q => q.id === p.id)));
  }
  assert.ok(sawCut && sawFill && sawClear, 'the possession produces a coordinated cut, replacement and exit');
  assert.equal(m.carrier().id, receiver.id);
  assert.ok(maxStep < 5, 'all routes use normal feet and collision limits');
});

test('a screen holds its chosen spot while the handler moves and then releases into a roll', () => {
  const m = fixture({ play: 'pickroll' }), c = m.carrier(), big = m.active(0)[4];
  c.x = 250; c.y = 335; m.ball.x = 250; m.ball.y = 335;
  for (const p of m.active(1)) { p.x = 50 + p.slot * 90; p.y = 650; }
  m._resetOffenseFlow(); frames(m, 1);
  assert.equal(big.offenseRead.intent, 'screen');
  const target = { ...big.offenseRead.target }, carrierX = c.x;
  frames(m, 12, { x: 1 });
  assert.ok(c.x > carrierX + 10);
  assert.deepEqual(big.offenseRead.target, target, 'the screener does not mirror each dribble');
  let rolled = false;
  for (let i = 0; i < 210; i++) { m.step(1 / 60); rolled ||= big.offenseRead?.intent === 'roll'; }
  assert.ok(rolled, 'a stationary handler does not leave the screener glued forever');
});

test('off-ball coverage shades into the help gap while on-ball pressure stays connected', () => {
  const m = fixture(); m._updateDefenseTracking();
  const ballDefender = m.active(1)[0], weakSideDefender = m.active(1)[2], weakSideReceiver = m.active(0)[2];
  const ballTarget = m._defensiveTarget(ballDefender), weakTarget = m._defensiveTarget(weakSideDefender);
  assert.equal(ballDefender.defenseRead.role, 'on-ball');
  assert.equal(weakSideDefender.defenseRead.role, 'gap');
  assert.ok(gap(ballTarget, m.carrier()) < 43);
  assert.ok(gap(weakTarget, weakSideReceiver) > 65, 'weak-side coverage is not a second tight on-ball mark');
});

test('one defender recognizes a beaten drive, helps and recovers after the ball moves', () => {
  function recognition(anticipation) {
    const m = fixture({ play: 'spacing' }), c = m.carrier();
    c.x = 250; c.y = 270; m.ball.x = c.x; m.ball.y = c.y;
    const positions = [[250, 370], [80, 160], [440, 170], [400, 270], [250, 110]];
    for (const p of m.active(1)) { [p.x, p.y] = positions[p.slot]; p.ratings.anticipation = anticipation; }
    const move = m._moveAI.bind(m);
    m._moveAI = (p, dt) => { if (p.team === 1 && p.slot === 4) move(p, dt); };
    m._resetDefenseTracking(); m._resetOffenseFlow();
    let recognized = null, helped = null;
    for (let i = 0; i < 70; i++) {
      m.step(1 / 60, { y: -1 });
      const helpers = m.active(1).filter(p => p.defenseRead?.role === 'help');
      assert.ok(helpers.length <= 1, 'help has a single responsible defender');
      if (helpers.length && recognized === null) { recognized = i / 60; helped = helpers[0]; break; }
    }
    assert.ok(helped, 'a real drive produces help');
    const receiver = m.active(0)[2]; m._giveBall(receiver);
    let recovered = false;
    for (let i = 0; i < 100; i++) { m.step(1 / 60); recovered ||= helped.defenseRead?.role === 'recover'; }
    assert.ok(recovered, 'the helper returns toward their assignment after the pass');
    assert.notEqual(helped.defenseRead.role, 'help');
    return recognized;
  }
  assert.ok(recognition(95) < recognition(55), 'anticipation improves when help is recognized, not foot speed');
});

test('a center clears a projected driving lane early and reserves an outlet away from the corner', () => {
  const home = structuredClone(getTeam('boston-college')), away = structuredClone(getTeam('duke'));
  home.offense = 'spacing'; away.defense = 'man';
  const m = new Match({ home, away, seed: 71, halfSeconds: 1200 }); frames(m, 60);
  const own = [[250, 355], [55, 240], [445, 240], [70, 115], [375, 135]];
  for (const p of m.active()) {
    [p.x, p.y] = p.team ? p.slot === 0 ? [190, 365] : [own[p.slot][0], own[p.slot][1] - 40] : own[p.slot];
    p.vx = p.vy = 0; p.aiTimer = 1e6;
  }
  m.frontcourt = true; m.ball.owner = 0; m.ball.x = 250; m.ball.y = 355; m.controlled = 0;
  m._resetDefenseTracking(); m._resetOffenseFlow();
  const c = m.carrier(); let maxStep = 0, readDrive = false;
  for (let i = 0; i < 240; i++) {
    const old = m.active().map(p => ({ id: p.id, x: p.x, y: p.y }));
    m.step(1 / 60, i < 126 ? { x: .24, y: -.97 } : {});
    readDrive ||= m.active(0)[4].offenseRead?.reason === 'drive-lane';
    for (const p of m.active()) maxStep = Math.max(maxStep, gap(p, old.find(q => q.id === p.id)));
    if (i === 125) assert.ok(c.y < 110, 'the center does not block a clear downhill drive for a second');
  }
  const ownPlayers = m.active(0);
  assert.ok(readDrive);
  for (let i = 0; i < ownPlayers.length; i++) for (let j = i + 1; j < ownPlayers.length; j++)
    assert.ok(gap(ownPlayers[i], ownPlayers[j]) > 75, 'settled outlets do not share the same corner');
  assert.ok(maxStep < 5, 'early clear-outs still use ordinary movement');
});

test('CPU pass selection considers clear alternatives and rejects a backcourt landing', () => {
  const m = fixture(), c = m.carrier(), teammates = m.active(0).filter(p => p.id !== c.id);
  c.x = 250; c.y = 400; m.frontcourt = true;
  teammates[0].x = 250; teammates[0].y = 490;
  teammates[1].x = 450; teammates[1].y = 300;
  teammates[2].x = 40; teammates[2].y = 300;
  teammates[3].x = 250; teammates[3].y = 120;
  m.active(1).forEach((p, i) => { p.x = 200 + i * 30; p.y = 800; });
  const blocked = m.active(1)[4]; blocked.x = 250; blocked.y = 190;
  const selected = m._bestPass(c);
  assert.ok(selected);
  assert.notEqual(selected.player.id, teammates[0].id, 'the tempting trailing outlet is illegal after entering frontcourt');
  assert.notEqual(selected.player.id, teammates[3].id, 'a blocked high-grade option does not hide an available clear receiver');
  assert.ok(selected.window.gap > 24 && selected.window.openness > 32);
  for (const p of teammates) { p.x = 40 + p.slot * 90; p.y = 455; p.vy = 100; }
  assert.equal(m._bestPass(c), undefined, 'a legal current position cannot be led back over halfcourt');
});

test('intent reads are pure, seeded and isolated from replay mutation; restarts discard routes', () => {
  const a = fixture(), b = fixture();
  for (let i = 0; i < 150; i++) {
    a.active(0).forEach(p => { a._offensiveTarget(p); a._passingWindow(p); });
    a.step(1 / 60); b.step(1 / 60);
  }
  assert.deepEqual(a.snapshot(), b.snapshot(), 'extra previews cannot change tactical decisions');
  const before = a.snapshot(); a.random = () => { throw new Error('a preview must not roll randomness'); };
  for (const p of a.active(0)) { a._offensiveTarget(p); a._spaceOffensiveTarget(p, a._offensiveTarget(p)); }
  assert.deepEqual(a.snapshot(), before);
  const replay = a.snapshot(), active = replay.players.find(p => p.offenseRead);
  active.offenseRead.target.x = -999; active.offenseProfile.patience = -999;
  replay.offenseFlow.anchors[active.id].x = -999;
  assert.deepEqual(a.snapshot(), before, 'all nested route and anchor state belongs to the snapshot');
  a._prepareInbound(0, { x: 250, y: 400 });
  assert.equal(a.offenseFlow, null); assert.ok(a.players.every(p => p.offenseRead === null));
});
