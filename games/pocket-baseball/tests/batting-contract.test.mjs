import test from 'node:test';
import assert from 'node:assert/strict';
import { BaseballGame } from '../public/engine.mjs';

// Recorded from the shipped first pass. The user specifically asked to keep its
// batting feel while adding decisions around it. Isolate contact from pitch RNG
// so new repertoires cannot silently widen windows or alter hit direction/power.
const shots = [
  { name: 'centered contact', offset: 0, power: false, aim: { x: 0, y: 0 },
    label: 'On time', velocity: 103, angle: 13,
    vector: [-1.11704139968746, 10.493243946409827, 44.80418428204208] },
  { name: 'early contact', offset: -0.1, power: false, aim: { x: 0, y: 0 },
    label: 'Early', velocity: 84, angle: 13,
    vector: [-21.26863839921056, 8.511618317590116, 29.483566865614602] },
  { name: 'late contact with directional aim', offset: 0.1, power: false, aim: { x: 0.2, y: -0.2 },
    label: 'Late', velocity: 80, angle: 24,
    vector: [18.644117977505825, 14.737096184109523, 26.59211732365304] },
  { name: 'power swing under the ball', offset: 0, power: true, aim: { x: 0, y: -0.3 },
    label: 'On time', velocity: 110, angle: 40,
    vector: [-0.9366249941813811, 31.909686827318367, 37.567738182497635] },
];

for (const shot of shots) {
  test(`first-pass batting remains unchanged: ${shot.name}`, () => {
    const game = new BaseballGame({ seed: 7143, difficulty: 'rookie' });
    const s = game.state;
    s.time = 5 + Math.max(shot.offset, 0); s.tick = Math.round(s.time * 120);
    s.phase = 'pitch'; s.phaseStartedAt = 4; s.phaseTime = s.time - 4;
    s.pitch = { id: 1, type: 'fastball', mph: 94, quality: 1,
      target: { x: 0.04, y: 1.04, z: 0 }, start: { x: -0.32, y: 1.88, z: 18.44 },
      breakX: 0.04, breakY: 0.06, duration: 1, releaseAt: 4, contactAt: 5,
      resolved: false, aiSwing: null };
    assert.equal(game.command({ type: 'swing', time: 5 + shot.offset,
      aim: shot.aim, power: shot.power }), true);
    assert.equal(s.phase, 'live');
    assert.equal(s.lastContact.timingLabel, shot.label);
    assert.equal(s.lastContact.exitVelocity, shot.velocity);
    assert.equal(s.lastContact.launchAngle, shot.angle);
    [s.ball.vx, s.ball.vy, s.ball.vz].forEach((value, i) =>
      assert.ok(Math.abs(value - shot.vector[i]) < 1e-9, `${shot.name}: changed contact axis ${i}`));
  });
}
