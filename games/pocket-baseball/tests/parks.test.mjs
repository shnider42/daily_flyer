import test from 'node:test';
import assert from 'node:assert/strict';
import { BaseballGame, STEP, BALL_RADIUS, PARKS, FEET_TO_METRES, fieldRadius, fenceHeight, getWallSegments, resolveParkId } from '../public/engine.mjs';
import { sweptParkWall } from '../public/parks.mjs';

const radians = degrees => degrees * Math.PI / 180;
const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const scaled = (p, factor) => ({ x: p.x * factor, z: p.z * factor });
const dot = (a, b) => a.x * b.x + a.z * b.z;
function live({ park = 'fenway', occupied = [], mode = 'exhibition' } = {}) {
  const game = new BaseballGame({ park, mode, seed: 7143, humanSides: [0, 1] }), s = game.state;
  s.time = 5; s.tick = 600; s.phase = 'pitch';
  s.bases = [1, 2, 3].map(base => occupied.includes(base) ? { id: base + 20, number: base, side: 0, speed: 6.8 } : null);
  s.pitch = { id: 1, type: 'fastball', mph: 94, quality: 1, target: { x: 0.04, y: 1.04, z: 0 },
    start: { x: -0.32, y: 1.88, z: 18.44 }, breakX: 0.04, breakY: 0.06,
    duration: 1, releaseAt: 4, contactAt: 5, resolved: false, aiSwing: null };
  assert.equal(game.command({ type: 'swing', time: 5, aim: { x: 0, y: 0 } }), true);
  assert.equal(s.play.fair, true);
  for (const f of s.fielders) Object.assign(f, { x: 0, prevX: 0, z: 15, prevZ: 15, speed: 0 });
  return game;
}
function wallShot(game, degrees, y, extra = {}) {
  const s = game.state, angle = radians(degrees), radius = fieldRadius(angle, game.options.park), direction = { x: Math.sin(angle), z: Math.cos(angle) };
  Object.assign(s.ball, { x: direction.x * (radius - .1), z: direction.z * (radius - .1), y,
    vx: direction.x * 40, vz: direction.z * 40, vy: 0, bounced: false, groundBounced: false, wallBounced: false, wallImpactY: null, ...extra });
  Object.assign(s.ball, { prevX: s.ball.x, prevY: s.ball.y, prevZ: s.ball.z });
  s.play.hitAt = s.time - 3; s.play.age = 3;
  s.play.landing = { x: direction.x * (radius + 20), z: direction.z * (radius + 20), time: 4 };
  return game;
}

test('Fenway anchors preserve the six published distances and a straight 228-foot fair Monster', () => {
  const expected = [['Left field', 310], ['Left-center', 379], ['Center field', 390], ['Deep center', 420], ['Deep right', 380], ['Right field', 302]];
  assert.deepEqual(PARKS.fenway.dimensions.map(({ label, feet }) => [label, feet]), expected);
  for (const d of PARKS.fenway.dimensions) near(fieldRadius(d.angle, 'fenway'), d.feet * FEET_TO_METRES);
  near(getWallSegments('fenway')[0].length / FEET_TO_METRES, 228, .3);
  assert.ok(fieldRadius(radians(-30), 'fenway') < fieldRadius(radians(30), 'fenway'));
});

test('the drawn segments and radial field queries describe the same Fenway wall faces', () => {
  const walls = getWallSegments('fenway');
  for (const [i, wall] of walls.entries()) {
    if (i) assert.deepEqual(walls[i - 1].b, wall.a);
    const midpoint = { x: (wall.a.x + wall.b.x) / 2, z: (wall.a.z + wall.b.z) / 2 };
    near(fieldRadius(Math.atan2(midpoint.x, midpoint.z), 'fenway'), Math.hypot(midpoint.x, midpoint.z));
    near(dot(wall.normal, wall.normal), 1);
    assert.ok(dot(midpoint, wall.normal) > 0, 'wall normal must point away from the playing field');
  }
});

test('Fenway has a 37-foot-2-inch Monster, 17-foot center, five-foot bullpen and three-foot corner', () => {
  near(fenceHeight(radians(-25), 'fenway') / FEET_TO_METRES, 37 + 2 / 12);
  near(fenceHeight(0, 'fenway') / FEET_TO_METRES, 17);
  near(fenceHeight(radians(20), 'fenway') / FEET_TO_METRES, 5);
  near(fenceHeight(radians(44), 'fenway') / FEET_TO_METRES, 3);
  near(fenceHeight(radians(-8), 'fenway') / FEET_TO_METRES, 37 + 2 / 12, 1e-8);
});

test('the original Harbor radii and fence remain unchanged', () => {
  near(fieldRadius(0), 115); near(fieldRadius(Math.PI / 4), 105);
  near(fieldRadius(-.42), 105 + 10 * Math.cos(-.84)); near(fenceHeight(0), 3.2);
  assert.equal(new BaseballGame().options.park, 'harbor');
  assert.equal(resolveParkId('unknown'), 'harbor');
  assert.equal(new BaseballGame({ park: 'unknown' }).options.park, 'harbor');
});

test('a drive into the Monster stays live and caroms off its actual flat face', () => {
  const game = wallShot(live(), -25, 6), wall = getWallSegments('fenway')[0];
  const tangent = { x: -wall.normal.z, z: wall.normal.x }, incoming = { x: game.state.ball.vx, z: game.state.ball.vz };
  game.update(STEP);
  assert.equal(game.state.phase, 'live'); assert.equal(game.state.ball.bounced, true);
  assert.ok(dot({ x: game.state.ball.vx, z: game.state.ball.vz }, wall.normal) < 0);
  assert.ok(Math.abs(dot(incoming, tangent)) > 1, 'test needs an oblique approach');
  near(dot({ x: game.state.ball.vx, z: game.state.ball.vz }, tangent) / dot(incoming, tangent), 1 - .0038 * 40 * STEP);
  assert.equal(game.state.score[0], 0); assert.equal(game.state.result, null);
  assert.ok(game.drainEvents().some(event => event.type === 'wall'));
});

test('the same two-metre-high ball hits the Monster but clears the low right-field fence', () => {
  const left = wallShot(live(), -43, 2), right = wallShot(live(), 43, 2);
  left.update(STEP); right.update(STEP);
  assert.equal(left.state.phase, 'live'); assert.equal(left.state.ball.bounced, true);
  assert.equal(right.state.result.kind, 'homeRun'); assert.equal(right.state.score[0], 1);
});

test('an airborne ball must clear the full Monster height to be a home run', () => {
  const below = wallShot(live(), -25, fenceHeight(radians(-25), 'fenway') + BALL_RADIUS - .01);
  const above = wallShot(live(), -25, fenceHeight(radians(-25), 'fenway') + BALL_RADIUS + .1);
  below.update(STEP); above.update(STEP);
  assert.equal(below.state.phase, 'live'); assert.equal(above.state.result.kind, 'homeRun');
});

test('the deep triangle stays in play beyond Harbor center and ends at 420 feet', () => {
  const game = live(), angle = radians(8), direction = { x: Math.sin(angle), z: Math.cos(angle) };
  Object.assign(game.state.ball, { x: direction.x * 120, z: direction.z * 120, y: 8, vx: direction.x * 40, vz: direction.z * 40, vy: 0 });
  game.state.play.landing = { x: direction.x * 150, z: direction.z * 150, time: 5 };
  game.update(STEP); assert.equal(game.state.phase, 'live'); assert.equal(game.state.result, null);
  wallShot(game, 8, 8); game.update(STEP);
  assert.equal(game.state.result.kind, 'homeRun'); near(Math.hypot(game.state.ball.x, game.state.ball.z), 420 * FEET_TO_METRES);
});

test('swept contact catches a path through the center-field indentation even with both endpoints in play', () => {
  const walls = getWallSegments('fenway'), a = scaled(walls[0].b, .99), b = scaled(walls[2].b, .99);
  for (const p of [a, b]) assert.ok(Math.hypot(p.x, p.z) < fieldRadius(Math.atan2(p.x, p.z), 'fenway'));
  const hit = sweptParkWall(a, b, 'fenway');
  assert.ok(hit && hit.t > 0 && hit.t < 1);
  assert.equal(hit.zone, 'center');
});

test('a shot at the Monster-to-center joint cannot slip through the corner or use its lower height', () => {
  const corner = getWallSegments('fenway')[0].b;
  const hit = sweptParkWall(scaled(corner, .99), scaled(corner, 1.01), 'fenway');
  near(hit.t, .5); near(hit.height, (37 + 2 / 12) * FEET_TO_METRES);
});

test('the wall wins over a glove interception occurring after the ball crosses its face', () => {
  const game = wallShot(live(), -25, 1.35), wall = getWallSegments('fenway')[0];
  const angle = radians(-25), radius = fieldRadius(angle, 'fenway');
  const p = { x: Math.sin(angle) * radius, z: Math.cos(angle) * radius };
  const catcher = game.state.fielders.find(f => f.id === 'C');
  Object.assign(catcher, { x: p.x + wall.normal.x * 1.5, z: p.z + wall.normal.z * 1.5 });
  catcher.prevX = catcher.x; catcher.prevZ = catcher.z;
  Object.assign(game.state.ball, { vx: wall.normal.x * 90, vz: wall.normal.z * 90 });
  game.update(STEP);
  assert.equal(game.state.outs, 0); assert.equal(game.state.play.caught, undefined);
  assert.equal(game.state.ball.wallBounced, true);
});

test('fielder pursuit remains inside every Fenway wall including the short corners', () => {
  const game = new BaseballGame({ park: 'fenway' }), f = game.state.fielders.find(player => player.id === 'LF');
  for (let degrees = -45; degrees <= 45; degrees += 2) {
    const angle = radians(degrees), radius = fieldRadius(angle, 'fenway');
    Object.assign(f, { x: Math.sin(angle) * (radius - 1), z: Math.cos(angle) * (radius - 1) });
    game._moveFielder(f, { x: Math.sin(angle) * 180, z: Math.cos(angle) * 180 }, 300);
    assert.ok(Math.hypot(f.x, f.z) <= fieldRadius(Math.atan2(f.x, f.z), 'fenway') - .55 + 1e-8);
  }
});

test('Fenway choice and a live wall carom survive snapshot restore without divergence', () => {
  const original = wallShot(live(), -25, 7), restored = new BaseballGame().restore(original.snapshot());
  assert.equal(restored.options.park, 'fenway'); assert.equal(restored.state.options.park, 'fenway');
  for (let i = 0; i < 120; i++) { original.update(STEP); restored.update(STEP); }
  assert.deepEqual(restored.snapshot(), original.snapshot());
  const legacy = new BaseballGame().snapshot(); delete legacy.state.options.park;
  assert.equal(new BaseballGame({ park: 'fenway' }).restore(legacy).options.park, 'harbor');
});

test('a fair ground bounce over low right field awards two bases from the original bases', () => {
  const game = wallShot(live({ occupied: [1, 2, 3] }), 43, 2, { bounced: true, groundBounced: true });
  game.state.outs = 2;
  // A runner may have passed home before the ball leaves play. The dead-ball
  // award must still use original bases instead of counting this again.
  game.state.play.runCrossings.push({ runnerId: 21, time: game.state.time - .1 });
  game.update(STEP);
  assert.equal(game.state.result.kind, 'groundRuleDouble'); assert.equal(game.state.result.bases, 2);
  assert.deepEqual(game.state.score, [2, 0]); assert.deepEqual(game.state.lineScore, [[2], [0]]);
  assert.equal(game.state.bases[0], null); assert.equal(game.state.bases[1].id, game.state.play.batter.id); assert.equal(game.state.bases[2].id, 21);
  assert.equal(game.state.outs, 2); assert.equal(game.state.hits[0], 1); assert.equal(game.state.pending, 'batter');
});

test('a ground ball below the low fence still rebounds instead of receiving a two-base award', () => {
  const game = wallShot(live(), 43, .5, { bounced: true, groundBounced: true }); game.update(STEP);
  assert.equal(game.state.phase, 'live'); assert.equal(game.state.result, null); assert.equal(game.state.ball.wallBounced, true);
});

test('an airborne high-wall carom over a lower fence is a home run but a low-to-high carom is two bases', () => {
  const high = wallShot(live(), 43, 2, { bounced: true, wallBounced: true, groundBounced: false, wallImpactY: 8 });
  const low = wallShot(live(), 0, 6, { bounced: true, wallBounced: true, groundBounced: false, wallImpactY: 1 });
  high.update(STEP); low.update(STEP);
  assert.equal(high.state.result.kind, 'homeRun'); assert.equal(low.state.result.kind, 'groundRuleDouble');
  assert.match(low.state.result.detail, /Caromed out of play/);
});

test('a foul beyond the short corner cannot receive a home run or ground-rule double', () => {
  const game = wallShot(live(), 46, 2, { bounced: true, groundBounced: true }); game.state.play.fair = false;
  game.update(STEP);
  assert.equal(game.state.result.kind, 'foul'); assert.deepEqual(game.state.score, [0, 0]); assert.equal(game.state.hits[0], 0);
});

test('a practice ground-rule double records a hit without scoring or recording a home run', () => {
  const game = wallShot(live({ mode: 'practice', occupied: [2, 3] }), 43, 2, { bounced: true, groundBounced: true });
  game.update(STEP);
  assert.equal(game.state.result.kind, 'groundRuleDouble'); assert.equal(game.state.practice.hits, 1);
  assert.equal(game.state.practice.homeRuns, 0); assert.deepEqual(game.state.score, [0, 0]);
});
