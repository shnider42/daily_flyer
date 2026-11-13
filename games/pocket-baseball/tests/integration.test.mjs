import test from 'node:test';
import assert from 'node:assert/strict';
import { BaseballGame, BALL_RADIUS, BASES, STEP } from '../public/engine.mjs';

function liveGroundBall({ x = 0, z = 50, vx = 0, vz = 10 } = {}) {
  const game = new BaseballGame({ seed: 2003, difficulty: 'club' });
  const snapshot = game.snapshot();
  const s = snapshot.state;
  s.phase = 'live';
  s.half = 'bottom';
  s.battingSide = 1;
  s.ball = { ...s.ball, x, y: BALL_RADIUS, z, prevX: x, prevY: BALL_RADIUS,
    prevZ: z, vx, vy: 0, vz, visible: true, bounced: true };
  const batter = { id: 1, number: 1, side: 1, speed: 6.8 };
  s.play = { stage: 'flight', hitAt: 0, contactAt: 0, age: 0,
    initialBases: [null, null, null], batter, fair: true, maxDistance: z,
    fielder: null, heldAt: null, throw: null, award: 1,
    landing: { x, z, time: 0 }, firstArrival: 4.05 };
  s.lastContact = { exitVelocity: 90, timing: 0, quality: 0.9, distance: z };
  s.runners = [{ ...batter, fromBase: 0, progress: 0, x: 0, y: 0, z: 0 }];
  for (const f of s.fielders) {
    f.x = f.prevX = 300;
    f.z = f.prevZ = 300;
    f.speed = 0;
  }
  return game.restore(snapshot);
}

test('a resting ground ball keeps rolling instead of repeatedly receiving bounce friction', () => {
  const game = liveGroundBall({ vz: 10 });
  game.update(0.25);
  assert.equal(game.state.phase, 'live');
  assert.ok(game.state.ball.z > 51.5, `ball advanced only ${game.state.ball.z - 50} m`);
  assert.ok(game.state.ball.vz > 7, `rolling velocity collapsed to ${game.state.ball.vz} m/s`);
  assert.equal(game.state.ball.y, BALL_RADIUS);
});

test('the first baseman cannot complete a self-throw before physically reaching first', () => {
  const game = liveGroundBall();
  const s = game.state;
  const first = s.fielders.find(f => f.id === '1B');
  first.x = first.prevX = BASES[1].x - 10;
  first.z = first.prevZ = BASES[1].z;
  first.speed = 6.6;
  first.hasBall = true;
  s.play.stage = 'held';
  s.play.fielder = '1B';
  s.play.heldAt = 0;
  Object.assign(s.ball, { x: first.x, y: 1.4, z: first.z, vz: 0 });
  assert.equal(game.command({ type: 'throw', base: 1 }), true);
  // Ten metres takes this runner over 1.5 s. A throw into empty space is not an out.
  for (let i = 0; i < 60; i++) game.update(STEP);
  assert.equal(game.state.phase, 'live', 'recorded an out before the first baseman reached the bag');
});

test('a snapshot taken during a live ground ball resumes the same physical outcome', () => {
  const original = liveGroundBall({ x: 10, z: 40, vx: 2, vz: 9 });
  original.update(0.125);
  const restored = new BaseballGame().restore(JSON.parse(JSON.stringify(original.snapshot())));
  for (let i = 0; i < 75; i++) {
    original.update(1 / 60);
    restored.update(1 / 60);
  }
  assert.deepEqual(restored.snapshot(), original.snapshot());
});
