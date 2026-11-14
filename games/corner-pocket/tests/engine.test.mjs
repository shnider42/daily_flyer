import test from 'node:test';
import assert from 'node:assert/strict';
import { TABLE, FIXED_DT, createGame, shoot, step, placeCue, canPlaceCue, legalTargets, settleShot, predictAim } from '../public/engine.mjs';

function roll(game, seconds = 26) {
  for (let t = 0; t < seconds && game.phase === 'rolling'; t += FIXED_DT) step(game);
  assert.notEqual(game.phase, 'rolling', 'a physical shot must eventually settle');
  return game;
}
function only(game, ids) {
  for (const ball of game.balls) {
    ball.pocketed = !ids.includes(ball.id);
    ball.vx = ball.vz = 0;
  }
}
function ordinary(groups = ['solids', 'stripes']) {
  const game = createGame({ names: ['Ada', 'Bea'], seed: 6 });
  game.breakShot = false;
  game.players.forEach((player, i) => { player.group = groups[i]; });
  return game;
}
function begin(game, extra = {}) {
  assert.equal(shoot(game, { angle: 0, power: .4, ...extra }).ok, true);
  return game;
}
function report(game, data = {}) {
  Object.assign(game.shot, { firstContact: 1, railAfterContact: true, ...data });
  for (const p of game.shot.pocketed) {
    const ball = game.balls.find(ball => ball.id === p.id);
    ball.pocketed = true;
    ball.pocket = p.pocket;
  }
  settleShot(game);
  return game;
}

test('the seed produces a tight, valid rack: centered 8, opposite back-corner groups and no overlap', () => {
  const a = createGame({ seed: 42 }), b = createGame({ seed: 42 });
  assert.deepEqual(a.balls, b.balls);
  assert.equal(a.balls.length, 16);
  assert.equal(new Set(a.balls.map(ball => ball.id)).size, 16);
  assert.equal(a.balls[8].z, 0);
  const back = a.balls.filter(ball => ball.x > .83).sort((x, y) => x.z - y.z);
  assert.ok(back[0].id < 8 && back.at(-1).id > 8);
  for (let i = 0; i < 16; i++) for (let j = i + 1; j < 16; j++)
    assert.ok(Math.hypot(a.balls[i].x - a.balls[j].x, a.balls[i].z - a.balls[j].z) >= TABLE.radius * 2 - 1e-9);
  assert.equal(a.phase, 'aiming');
  assert.equal(a.turn, 0);
  assert.equal(createGame({ breaker: 1 }).turn, 1);
  assert.doesNotThrow(() => JSON.stringify(a));
});

test('invalid shots never modify a rack and a moving shot cannot be struck twice', () => {
  const game = createGame();
  const before = JSON.stringify(game);
  for (const shot of [
    { angle: NaN, power: .5 }, { angle: Infinity, power: .5 }, { angle: '0', power: .5 },
    { angle: 0, power: 0 }, { angle: 0, power: -1 }, { angle: 0, power: 1.01 },
    { angle: 0, power: Infinity }, { angle: 0, power: .5, spin: 2 },
    { angle: 0, power: .5, spin: NaN }, { angle: 0, power: .5, calledPocket: 6 }
  ]) assert.equal(shoot(game, shot).ok, false);
  assert.equal(JSON.stringify(game), before);
  assert.equal(shoot(game, { angle: 0, power: .5 }).ok, true);
  assert.equal(shoot(game, { angle: 0, power: .5 }).ok, false);
  assert.equal(game.shotNumber, 1);
});

test('a physical full-power break stays finite, spreads the rack and settles', () => {
  const game = createGame({ seed: 73 });
  const initial = game.balls.map(ball => ({ x: ball.x, z: ball.z }));
  begin(game, { power: .94, angle: .018 });
  roll(game);
  assert.equal(game.breakShot, false);
  assert.ok(game.balls.slice(1).filter((ball, i) => ball.pocketed || Math.hypot(ball.x - initial[i + 1].x, ball.z - initial[i + 1].z) > .15).length >= 9);
  for (const ball of game.balls) {
    assert.ok(Number.isFinite(ball.x) && Number.isFinite(ball.z));
    assert.equal(ball.vx, 0); assert.equal(ball.vz, 0);
    if (!ball.pocketed) {
      assert.ok(Math.abs(ball.x) <= TABLE.halfW + .10);
      assert.ok(Math.abs(ball.z) <= TABLE.halfH + .10);
    }
  }
  assert.equal(game.players[0].group, null);
  assert.equal(game.players[1].group, null);
  assert.ok(game.events.length <= 40);
});

test('head-on collisions transfer motion without tunnelling at maximum shot speed', () => {
  const game = ordinary(); only(game, [0, 1]);
  Object.assign(game.balls[0], { x: -.3, z: .21 });
  Object.assign(game.balls[1], { x: 0, z: .21 });
  begin(game, { power: 1 });
  for (let i = 0; i < 14; i++) step(game);
  assert.equal(game.shot.firstContact, 1);
  assert.ok(game.balls[1].vx > 5);
  assert.ok(game.balls[0].vx < 1);
  assert.ok(game.balls[0].x < game.balls[1].x);
});

test('a cushion rebounds a fast ball rather than letting it leave the table', () => {
  const game = ordinary(); only(game, [0, 1]);
  Object.assign(game.balls[0], { x: 0.8, z: 0 });
  Object.assign(game.balls[1], { x: -.8, z: .4 });
  begin(game, { power: 1 });
  for (let i = 0; i < 25; i++) step(game);
  assert.ok(game.balls[0].vx < 0);
  assert.ok(game.balls[0].x < TABLE.halfW - TABLE.radius + .0001);
});

test('all six pocket mouths can physically swallow a ball on an unobstructed line', () => {
  for (const pocket of TABLE.pockets) {
    const game = ordinary(); only(game, [0, 1]);
    const dx = pocket.x === 0 ? 0 : Math.sign(pocket.x) / Math.sqrt(2);
    const dz = pocket.x === 0 ? Math.sign(pocket.z) : Math.sign(pocket.z) / Math.sqrt(2);
    Object.assign(game.balls[0], { x: pocket.x - dx * .30, z: pocket.z - dz * .30 });
    Object.assign(game.balls[1], { x: 0, z: 0 });
    begin(game, { angle: Math.atan2(dz, dx), power: .23 });
    for (let i = 0; i < 200 && !game.balls[0].pocketed; i++) step(game);
    assert.equal(game.balls[0].pocketed, true, `pocket ${pocket.id} is reachable`);
    assert.equal(game.balls[0].pocket, pocket.id);
    assert.ok(game.shot.scratch);
  }
});

test('a genuine object-ball pot is detected and keeps the legal shooter at the table', () => {
  const game = ordinary(); only(game, [0, 1, 8, 9]);
  Object.assign(game.balls[0], { x: 0, z: .05 });
  Object.assign(game.balls[1], { x: 0, z: .38 });
  Object.assign(game.balls[8], { x: -.6, z: -.2 });
  Object.assign(game.balls[9], { x: .5, z: -.2 });
  begin(game, { angle: Math.PI / 2, power: .23 });
  roll(game);
  assert.equal(game.balls[1].pocketed, true);
  assert.equal(game.turn, 0);
  assert.equal(game.ballInHand, false);
  assert.equal(game.lastShot.foul, false);
  assert.deepEqual(legalTargets(game), [8]);
});

test('draw and follow change the cue ball after the same head-on contact', () => {
  const positions = [];
  for (const spin of [-1, 0, 1]) {
    const game = ordinary(); only(game, [0, 1]);
    Object.assign(game.balls[0], { x: -.4, z: 0 });
    Object.assign(game.balls[1], { x: 0, z: 0 });
    begin(game, { power: .32, spin });
    for (let t = 0; t < .55; t += FIXED_DT) step(game);
    positions.push(game.balls[0].x);
  }
  assert.ok(positions[0] < positions[1] - .025);
  assert.ok(positions[2] > positions[1] + .025);
});

test('a legal dry break passes the turn but leaves the table open', () => {
  const game = begin(createGame());
  report(game, { firstContact: 1, objectRailIds: [1, 2, 3, 4] });
  assert.equal(game.turn, 1); assert.equal(game.ballInHand, false);
  assert.equal(game.players[0].group, null); assert.equal(game.breakShot, false);
});

test('a legal potted break continues with an open table', () => {
  const game = begin(createGame());
  report(game, { pocketed: [{ id: 3, pocket: 1 }] });
  assert.equal(game.turn, 0); assert.equal(game.players[0].group, null);
  assert.equal(game.lastShot.keptTurn, true);
});

test('an insufficient break grants the opponent ball in hand', () => {
  const game = begin(createGame());
  report(game, { objectRailIds: [1, 2, 3] });
  assert.equal(game.turn, 1); assert.equal(game.ballInHand, true);
  assert.match(game.message, /soft break/i);
});

test('8 on the break is spotted and never wins or loses the rack', () => {
  for (const scratch of [false, true]) {
    const game = begin(createGame());
    report(game, { pocketed: [{ id: 8, pocket: 2 }, ...(scratch ? [{ id: 0, pocket: 1 }] : [])], scratch });
    assert.equal(game.phase, 'aiming'); assert.equal(game.winner, null);
    assert.equal(game.balls[8].pocketed, false);
    assert.equal(game.ballInHand, scratch);
    assert.equal(game.turn, scratch ? 1 : 0);
    const eight = game.balls[8];
    for (const other of game.balls) if (other.id !== 8 && !other.pocketed)
      assert.ok(Math.hypot(eight.x - other.x, eight.z - other.z) >= TABLE.radius * 2);
  }
});

test('first legal post-break pot assigns groups and keeps the turn', () => {
  const game = begin(ordinary([null, null]));
  report(game, { firstContact: 9, pocketed: [{ id: 10, pocket: 0 }, { id: 3, pocket: 5 }] });
  assert.equal(game.players[0].group, 'stripes');
  assert.equal(game.players[1].group, 'solids');
  assert.equal(game.turn, 0);
});

test('a foul on an open table does not assign a group even when a ball drops', () => {
  const game = begin(ordinary([null, null]));
  report(game, { scratch: true, pocketed: [{ id: 3, pocket: 1 }, { id: 0, pocket: 2 }] });
  assert.equal(game.players[0].group, null); assert.equal(game.players[1].group, null);
  assert.equal(game.turn, 1); assert.equal(game.ballInHand, true);
  assert.equal(game.balls[3].pocketed, true);
});

test('a legal shot that pockets only the opponent’s ball passes the turn without a foul', () => {
  const game = begin(ordinary());
  report(game, { pocketed: [{ id: 9, pocket: 3 }] });
  assert.equal(game.turn, 1); assert.equal(game.ballInHand, false);
});

test('wrong-first, no-contact, no-rail, and scratch fouls all grant ball in hand', () => {
  for (const data of [
    { firstContact: 9 }, { firstContact: null }, { railAfterContact: false },
    { scratch: true, pocketed: [{ id: 0, pocket: 1 }] }
  ]) {
    const game = begin(ordinary()); report(game, data);
    assert.equal(game.turn, 1); assert.equal(game.ballInHand, true);
    assert.equal(game.cuePlaced, false); assert.equal(game.players[0].fouls, 1);
    assert.equal(game.balls[0].pocketed, false);
    assert.equal(shoot(game, { angle: 0, power: .3 }).ok, false);
  }
});

test('a cue ball contacting a rail before the object ball does not satisfy the after-contact rule', () => {
  const game = ordinary(); only(game, [0, 1, 8, 9]);
  Object.assign(game.balls[0], { x: .9, z: .25 });
  Object.assign(game.balls[1], { x: .65, z: .25 });
  Object.assign(game.balls[8], { x: -.5, z: -.35 });
  Object.assign(game.balls[9], { x: -.7, z: -.35 });
  begin(game, { angle: 0, power: .23 });
  roll(game);
  const rail = game.events.find(event => event.kind === 'rail');
  const contact = game.events.find(event => event.kind === 'collision');
  assert.ok(rail && contact && rail.time < contact.time);
  assert.equal(game.lastShot.firstContact, 1);
  assert.equal(game.lastShot.foul, true);
  assert.equal(game.ballInHand, true);
  assert.match(game.reason, /after contact/);
});

test('open table excludes the 8 as a legal first ball', () => {
  const game = ordinary([null, null]);
  assert.equal(legalTargets(game).includes(8), false);
  begin(game); report(game, { firstContact: 8 });
  assert.equal(game.ballInHand, true);
});

test('ball in hand allows repeated clear placements and rejects collisions, pockets and nonfinite coordinates', () => {
  const game = begin(ordinary()); report(game, { scratch: true });
  const target = game.balls[1];
  for (const [x, z] of [[target.x, target.z], [TABLE.halfW, 0], [0, TABLE.halfH], [NaN, 0], [0, Infinity], ['0', 0]]) {
    assert.equal(canPlaceCue(game, x, z), false);
    assert.equal(placeCue(game, { x, z }).ok, false);
  }
  assert.equal(placeCue(game, { x: -.7, z: .2 }).ok, true);
  assert.equal(placeCue(game, { x: -.6, z: .3 }).ok, true);
  assert.equal(game.ballInHand, true); assert.equal(game.cuePlaced, true);
  assert.equal(shoot(game, { angle: 0, power: .4 }).ok, true);
  assert.equal(game.ballInHand, false);
  assert.equal(placeCue(game, { x: -.7, z: .2 }).ok, false);
});

function onEight() {
  const game = ordinary();
  for (const ball of game.balls) if (ball.id > 0 && ball.id < 8) ball.pocketed = true;
  return game;
}

test('clearing a group makes only the 8 legal and requires a called pocket', () => {
  const game = onEight();
  assert.deepEqual(legalTargets(game), [8]);
  assert.equal(shoot(game, { angle: 0, power: .4 }).ok, false);
  assert.equal(shoot(game, { angle: 0, power: .4, calledPocket: 4 }).ok, true);
});

test('a legally called 8 wins the rack and prevents further shots', () => {
  const game = begin(onEight(), { calledPocket: 4 });
  report(game, { firstContact: 8, pocketed: [{ id: 8, pocket: 4 }] });
  assert.equal(game.phase, 'finished'); assert.equal(game.winner, 0);
  assert.equal(shoot(game, { angle: 0, power: .5 }).ok, false);
});

test('the 8 in the wrong pocket, with a scratch, or before the group is cleared loses', () => {
  for (const scenario of ['wrong-pocket', 'scratch', 'early', 'last-solid-with-eight']) {
    const game = scenario === 'early' || scenario === 'last-solid-with-eight' ? ordinary() : onEight();
    if (scenario === 'last-solid-with-eight') for (let id = 2; id <= 7; id++) game.balls[id].pocketed = true;
    begin(game, { calledPocket: 4 });
    report(game, {
      firstContact: game.shot.onEight ? 8 : 1,
      scratch: scenario === 'scratch',
      pocketed: [...(scenario === 'last-solid-with-eight' ? [{ id: 1, pocket: 3 }] : []),
        { id: 8, pocket: scenario === 'wrong-pocket' ? 2 : 4 }]
    });
    assert.equal(game.phase, 'finished'); assert.equal(game.winner, 1, scenario);
  }
});

test('a missed legal 8 attempt passes the turn without ending the rack', () => {
  const game = begin(onEight(), { calledPocket: 4 });
  report(game, { firstContact: 8, pocketed: [], railAfterContact: true });
  assert.equal(game.phase, 'aiming'); assert.equal(game.turn, 1); assert.equal(game.winner, null);
});

test('off-table object balls are spotted and the opponent receives ball in hand', () => {
  const game = begin(ordinary()); game.balls[4].pocketed = true;
  report(game, { offTable: [4] });
  assert.equal(game.ballInHand, true); assert.equal(game.balls[4].pocketed, false);
});

test('aim guides use the same ball radii and stop at the first physical contact', () => {
  const game = ordinary(); only(game, [0, 1, 2]);
  Object.assign(game.balls[0], { x: -.6, z: 0 });
  Object.assign(game.balls[1], { x: .1, z: 0 });
  Object.assign(game.balls[2], { x: .5, z: 0 });
  const guide = predictAim(game, 0);
  assert.equal(guide.hitId, 1);
  assert.ok(Math.abs(guide.end.x - (.1 - TABLE.radius * 2)) < 1e-9);
  assert.ok(guide.objectEnd.x > game.balls[1].x);
  assert.ok(Math.abs(guide.cueEnd.z) < 1e-9);
  assert.doesNotThrow(() => predictAim(game, NaN));
});

test('identical physical inputs at different caller frame sizes reach the same outcome', () => {
  const a = createGame({ seed: 82 }), b = createGame({ seed: 82 });
  begin(a, { power: .72, angle: .009 }); begin(b, { power: .72, angle: .009 });
  for (let t = 0; t < 26 && a.phase === 'rolling'; t += FIXED_DT) step(a, FIXED_DT);
  for (let t = 0; t < 26 && b.phase === 'rolling'; t += 1 / 60) step(b, 1 / 60);
  assert.equal(a.phase, b.phase); assert.equal(a.turn, b.turn);
  assert.deepEqual(a.balls.map(ball => ball.pocketed), b.balls.map(ball => ball.pocketed));
  // The accumulator fixes simulation boundaries even when the caller renders at 60 Hz.
  for (let i = 0; i < 16; i++) if (!a.balls[i].pocketed)
    assert.ok(Math.hypot(a.balls[i].x - b.balls[i].x, a.balls[i].z - b.balls[i].z) < 1e-9);
});
