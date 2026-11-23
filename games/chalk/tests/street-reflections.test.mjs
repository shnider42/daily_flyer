import test from 'node:test';
import assert from 'node:assert/strict';
import { streetReflectionPlan } from '../public/street-reflections.mjs';
import { prepareBuildingInteriors } from '../public/building-geometry.mjs';
import { breachAtBlast, createDestructionState } from '../public/destruction.mjs';
import { createGame } from '../public/sim.mjs';
import { WORLD_UNITS_PER_METRE, SOUND_SPEED_MPS } from '../public/acoustics.mjs';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} approximately ${expected}`);
function street() {
  return prepareBuildingInteriors({ buildings: [
    { id: 'left', x: -280, y: -100, w: 180, h: 400, tone: .3 },
    { id: 'right', x: 100, y: -100, w: 180, h: 400, tone: .7 },
  ] });
}

test('street facades create quiet directional taps with additional physical travel time', () => {
  const world = street(), source = { x: 0, y: 0 }, listener = { x: 0, y: 120 };
  const taps = streetReflectionPlan(world, source, listener);
  assert.equal(taps.length, 2);
  assert.deepEqual(taps.map(tap => tap.wallId), ['left:east', 'right:west']);
  for (const tap of taps) {
    close(tap.y, 60);
    const reflectedPath = Math.hypot(tap.x - source.x, tap.y - source.y) + Math.hypot(tap.x - listener.x, tap.y - listener.y);
    close(tap.delay, (reflectedPath - 120) / (WORLD_UNITS_PER_METRE * SOUND_SPEED_MPS));
    assert.ok(tap.gain > .04 && tap.gain <= .22);
    assert.ok(tap.lowpass >= 2400 && tap.lowpass < 6500);
  }
  assert.ok(taps[0].pan < 0 && taps[1].pan > 0, 'returns arrive from the actual sides of the street');
  assert.deepEqual(streetReflectionPlan(world, source, listener), taps, 'a report does not acquire random echoes');
  const own = streetReflectionPlan(world, source, source);
  assert.equal(own.length, 2);
  close(own[0].delay, 200 / (WORLD_UNITS_PER_METRE * SOUND_SPEED_MPS));
});

test('open ground, interiors, back faces, and occluded direct hearing retain the existing mixer', () => {
  const world = street(), source = { x: 0, y: 0 }, listener = { x: 0, y: 120 };
  assert.deepEqual(streetReflectionPlan({ buildings: [], walls: [] }, source, listener), []);
  assert.deepEqual(streetReflectionPlan(world, { x: 140, y: 0 }, listener), []);
  assert.deepEqual(streetReflectionPlan(world, source, { x: 140, y: 120 }), []);
  assert.deepEqual(streetReflectionPlan({ walls: [{ id: 'back', kind: 'perimeter', side: 'west', x: -100, y: -100, w: 10, h: 400 }] }, source, listener), []);
  world.walls.push({ x: -50, y: 55, w: 100, h: 10 });
  assert.deepEqual(streetReflectionPlan(world, source, listener), []);
});

test('reflection legs cannot pass through an unrelated solid even with clear direct sight', () => {
  const world = street(), source = { x: 0, y: 0 }, listener = { x: 0, y: 120 };
  world.walls.push({ x: 45, y: 20, w: 10, h: 20 });
  assert.deepEqual(streetReflectionPlan(world, source, listener).map(tap => tap.wallId), ['left:east']);
});

test('an actual breach removes its reflection while an intact neighboring facade remains audible', () => {
  const world = street(), source = { x: 0, y: 0 }, listener = { x: 0, y: 120 };
  assert.equal(streetReflectionPlan(world, source, listener).length, 2);
  const damage = createDestructionState(), result = breachAtBlast(world, damage, { x: 99, y: 60, wallId: 'right:west' });
  assert.equal(result.changed, true);
  assert.deepEqual(streetReflectionPlan(world, source, listener).map(tap => tap.wallId), ['left:east']);
  const front = prepareBuildingInteriors({ buildings: [{ id: 'front', x: -100, y: 100, w: 240, h: 200, tone: .4 }] });
  assert.deepEqual(streetReflectionPlan(front, { x: 20, y: 0 }, { x: 20, y: 40 }), [], 'an open doorway cannot reflect as solid masonry');
  assert.equal(streetReflectionPlan(front, { x: 80, y: 0 }, { x: 80, y: 40 }).length, 1);
});

test('mirrored streets reverse panning without changing timing or levels', () => {
  const world = street(), source = { x: 15, y: 0 }, listener = { x: -10, y: 120 };
  const mirror = { buildings: [], walls: world.walls.map(wall => ({ ...wall, x: -wall.x - wall.w,
    side: wall.side === 'west' ? 'east' : wall.side === 'east' ? 'west' : wall.side })) };
  const a = streetReflectionPlan(world, source, listener), b = streetReflectionPlan(mirror, { ...source, x: -source.x }, { ...listener, x: -listener.x });
  assert.equal(a.length, 2); assert.equal(b.length, 2);
  for (let i = 0; i < a.length; i++) {
    close(a[i].delay, b[i].delay); close(a[i].gain, b[i].gain); close(a[i].lowpass, b[i].lowpass); close(a[i].pan, -b[i].pan);
  }
});

test('real districts produce bounded taps and clear ground or remote reports do not invent returns', () => {
  let reflected = 0;
  for (let mission = 0; mission < 6; mission++) {
    const { world } = createGame({ mission, seed: 17 });
    for (const source of [{ x: 680, y: 400 }, { x: 1160, y: 800 }, { x: 1640, y: 1120 }]) {
      const listener = { x: source.x, y: source.y + 50 }, taps = streetReflectionPlan(world, source, listener);
      assert.ok(taps.length <= 2);
      reflected += taps.length;
      for (const tap of taps) {
        assert.ok(Object.entries(tap).filter(([key]) => key !== 'wallId').every(([, value]) => Number.isFinite(value)));
        assert.ok(tap.delay >= .008 && tap.delay <= .18 && tap.gain <= .22 && Math.abs(tap.pan) <= .8);
      }
    }
  }
  assert.ok(reflected >= 12, 'the authored city streets supply real facade returns');
  assert.deepEqual(streetReflectionPlan(street(), { x: 0, y: 0 }, { x: 0, y: 1200 }), []);
  assert.deepEqual(streetReflectionPlan(street(), { x: NaN, y: 0 }, { x: 0, y: 0 }), []);
  assert.deepEqual(streetReflectionPlan(null, { x: 0, y: 0 }, { x: 0, y: 0 }), []);
});
