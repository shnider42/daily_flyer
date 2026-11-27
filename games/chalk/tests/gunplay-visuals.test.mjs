import test from 'node:test';
import assert from 'node:assert/strict';
import { GunplayPresentation, GUNPLAY_LIMITS, gunplayProfile, weaponKick, flashVariation, projectileStreak, impactStyle, impactOrigin } from '../public/gunplay-visuals.mjs';

const shot = (id = 1, extra = {}) => ({ id, type: 'shot', actorId: 11, x: 120, y: 100, angle: 0, time: 1, sourceTime: 1, weapon: 'rifle', ...extra });
const state = events => ({ seed: 17, missionIndex: 0, time: 1, status: 'playing', soundEvents: events });

test('weapon motion is a short bounded impulse with distinct recovery and no reduced-motion kick', () => {
  for (const weapon of ['rifle', 'support', 'hostile', 'hostile_support', 'sniper']) {
    const profile = gunplayProfile(weapon);
    assert.equal(weaponKick(-.01, weapon), 0); assert.equal(weaponKick(0, weapon), 0);
    assert.ok(weaponKick(.014, weapon) > 1);
    assert.ok(weaponKick(.03, weapon) > weaponKick(.09, weapon));
    assert.equal(weaponKick(profile.recover, weapon), 0);
    for (let age = 0; age < .5; age += .002) {
      assert.ok(weaponKick(age, weapon) <= profile.kick);
      assert.equal(weaponKick(age, weapon, true), 0);
    }
  }
  assert.ok(gunplayProfile('support').recover < gunplayProfile('rifle').recover);
  assert.ok(gunplayProfile('sniper').recover > gunplayProfile('rifle').recover);
});

test('tracers stay short and entirely within actual forward or reverse projectile travel', () => {
  for (const weapon of ['rifle', 'support', 'sniper']) for (const [dx, dy] of [[200, 0], [-200, 30], [3, 4]]) {
    const bullet = { x: 100 + dx, y: 200 + dy, px: 100, py: 200, weapon }, copy = structuredClone(bullet);
    const streak = projectileStreak(bullet);
    assert.ok(streak.length <= gunplayProfile(weapon).streak);
    assert.ok(streak.length <= Math.hypot(dx, dy));
    assert.ok(streak.tailX >= Math.min(bullet.px, bullet.x) - 1e-6 && streak.tailX <= Math.max(bullet.px, bullet.x) + 1e-6);
    assert.ok(streak.tailY >= Math.min(bullet.py, bullet.y) - 1e-6 && streak.tailY <= Math.max(bullet.py, bullet.y) + 1e-6);
    assert.equal(streak.x, bullet.x); assert.equal(streak.y, bullet.y);
    assert.ok(projectileStreak(bullet, true).length <= streak.length);
    assert.deepEqual(bullet, copy);
  }
  assert.equal(projectileStreak({ x: 5, y: 5, px: 5, py: 5 }), null);
  assert.equal(projectileStreak({ x: 5, y: 5, vx: 900, vy: 0 }), null, 'missing authority history must not invent a flight segment');
});

test('material feedback and open-side surface origin follow authoritative collision metadata', () => {
  assert.equal(impactStyle('metal').kind, 'metal'); assert.equal(impactStyle('wood').kind, 'wood');
  assert.equal(impactStyle('sandbag').kind, 'sand'); assert.equal(impactStyle(undefined).kind, 'concrete');
  assert.ok(impactStyle('metal').duration < impactStyle('concrete').duration);
  const impact = impactOrigin({ x: 200, y: 200, angle: Math.PI / 4, normalX: -1, normalY: 0 });
  assert.equal(impact.x, 199.2); assert.equal(impact.y, 200); assert.equal(impact.angle, Math.PI);
  const legacy = impactOrigin({ x: 200, y: 200, angle: 0 });
  assert.equal(legacy.x, 199.2);
});

test('flash variation repeats across clients and remains a restrained local shape change', () => {
  const shapes = new Set();
  for (let id = 1; id <= 128; id++) {
    const shape = flashVariation(id); assert.deepEqual(shape, flashVariation(id));
    assert.ok(shape.length >= .94 && shape.length <= 1.06);
    assert.ok(shape.width >= .93 && shape.width <= 1.071);
    assert.ok(Math.abs(shape.angle) <= .0361); shapes.add(JSON.stringify(shape));
  }
  assert.ok(shapes.size > 8);
});

test('short real shot and impact events survive snapshot delivery once and expire on presentation time', () => {
  const presentation = new GunplayPresentation(), s = state([shot(1, { sourceTime: .87 }), shot(2, { type: 'impact', material: 'metal', normalX: -1, normalY: 0, sourceTime: .9 })]);
  presentation.update(s, { time: 10 }, () => true);
  assert.equal(presentation.remnants.length, 2);
  assert.ok(presentation.kick(11, 10) > 0);
  const effects = [...presentation.remnants];
  s.soundEvents = structuredClone(s.soundEvents); presentation.update(s, { time: 10.02 }, () => true);
  assert.deepEqual(presentation.remnants, effects, 'repeated packets cannot restart a flash, casing or impact');
  presentation.update(s, { time: 11 }, () => true);
  assert.equal(presentation.remnants.length, 0); assert.equal(presentation.shots.size, 0);
  s.soundEvents.push(shot(3, { sourceTime: .1 })); presentation.update(s, { time: 11.1 }, () => true);
  assert.equal(presentation.remnants.length, 0, 'old ring history never becomes a new gunfight');
});

test('unseen gunplay is consumed without being shown later, while a hit only animates its actual victim', () => {
  const presentation = new GunplayPresentation(), s = state([shot(1), shot(2, { type: 'impact' }), shot(3, { type: 'victim_hit', victimId: 22, damage: 24, cause: 'bullet' })]);
  presentation.update(s, { time: 10 }, () => false);
  assert.equal(presentation.remnants.length, 0); assert.equal(presentation.shots.size, 0); assert.equal(presentation.hits.size, 0);
  presentation.update(s, { time: 10.02 }, () => true);
  assert.equal(presentation.remnants.length, 0, 'turning a corner cannot replay a previously hidden impact');
  s.soundEvents.push(shot(4, { type: 'victim_hit', victimId: 22, damage: 24, cause: 'bullet', angle: Math.PI / 2 }));
  presentation.update(s, { time: 10.03 }, () => true);
  assert.ok(presentation.flinch(22, 10.08).y > 0);
  assert.deepEqual(presentation.flinch(11, 10.08), { x: 0, y: 0 });
  assert.deepEqual(presentation.flinch(22, 10.08, true), { x: 0, y: 0 });
});

test('map, pause, end states, epoch changes and restart discard obsolete gunplay', () => {
  for (const mode of [{ showMap: true }, { paused: true }, { menu: true }, { finished: true }]) {
    const presentation = new GunplayPresentation(), s = state([shot()]);
    presentation.update(s, { time: 10, effectEpoch: 1 }, () => true);
    assert.equal(presentation.remnants.length, 1);
    if (mode.finished) s.status = 'success';
    s.soundEvents.push(shot(2)); presentation.update(s, { time: 10.01, effectEpoch: 1, ...mode }, () => true);
    assert.equal(presentation.remnants.length, 0);
    s.status = 'playing'; presentation.update(s, { time: 10.02, effectEpoch: 1 }, () => true);
    assert.equal(presentation.remnants.length, 0);
    s.soundEvents.push(shot(3)); presentation.update(s, { time: 10.03, effectEpoch: 1 }, () => true);
    assert.equal(presentation.remnants.length, 1);
    presentation.update(s, { time: 10.04, effectEpoch: 2 }, () => true);
    assert.equal(presentation.remnants.length, 0);
    s.time = .05; s.soundEvents = [shot(1, { time: .05, sourceTime: .05 })];
    presentation.update(s, { time: 11, effectEpoch: 3 }, () => true);
    assert.equal(presentation.remnants.length, 1);
  }
});

test('multiple automatic weapons cannot exceed either quality budget or retained actor memory', () => {
  for (const quality of ['performance', 'balanced', 'high']) {
    const presentation = new GunplayPresentation(), events = Array.from({ length: 128 }, (_, i) => shot(i + 1, { actorId: i }));
    const s = state(events), copy = structuredClone(s);
    presentation.update(s, { time: 10, quality }, () => true);
    assert.equal(presentation.remnants.length, quality === 'performance' ? GUNPLAY_LIMITS.performanceRemnants : GUNPLAY_LIMITS.remnants);
    assert.equal(presentation.shots.size, GUNPLAY_LIMITS.memories);
    assert.deepEqual(s, copy, 'presentation cannot alter authority state or its RNG');
  }
});

test('reduced motion retains impact information without casings, smoke, or weapon animation', () => {
  const presentation = new GunplayPresentation(), s = state([shot(), shot(2, { type: 'impact', material: 'metal' })]);
  presentation.update(s, { time: 10, reducedMotion: true }, () => true);
  assert.deepEqual(presentation.remnants.map(effect => effect.type), ['impact']);
  assert.equal(presentation.kick(11, 10.03, true), 0);
});
