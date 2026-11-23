import test from 'node:test';
import assert from 'node:assert/strict';
import { cityAmbienceProfile, createCityAmbience, advanceCityAmbience } from '../public/city-ambience.mjs';

function fixture(lighting = 'day') {
  return { seed: 123, rngState: 87415, missionIndex: 0, mission: { lighting }, time: 0, status: 'playing',
    playerId: 1, squad: [{ id: 1, x: 100, y: 100 }],
    world: { width: 2400, height: 1900, districts: [
      { id: 'home-a', kind: 'residential', x: 200, y: 250, w: 320, h: 200 },
      { id: 'home-b', kind: 'courtyard', x: 850, y: 850, w: 300, h: 240 },
      { id: 'market', kind: 'market', x: 1700, y: 250, w: 350, h: 260 },
      { id: 'yard', kind: 'workshop', x: 1700, y: 1250, w: 310, h: 220 },
    ] } };
}

function run(state, seconds = 360, step = .1, seed = state.seed, listenerMove = false) {
  const director = createCityAmbience(seed, state.missionIndex, state.time), events = [];
  for (let tick = 0; tick <= Math.ceil(seconds / step); tick++) {
    state.time = tick * step;
    if (listenerMove) {
      state.playerId = tick % 2;
      state.squad[0].x = tick * 83 % state.world.width;
      state.squad[0].y = tick * 41 % state.world.height;
    }
    const batch = advanceCityAmbience(director, state);
    assert.ok(batch.length <= 2, 'ambient voice creation has a fixed per-update bound');
    events.push(...batch);
  }
  return { director, events };
}

test('night and dawn change the ordinary city bed without quietening gun reports', () => {
  const day = cityAmbienceProfile(fixture()), night = cityAmbienceProfile(fixture('night'));
  const dawn = cityAmbienceProfile(fixture('dawn'));
  assert.ok(night.bedGain < dawn.bedGain && dawn.bedGain < day.bedGain);
  assert.ok(night.domesticGain < day.domesticGain);
  assert.equal(night.battleGain, day.battleGain);
  assert.equal(cityAmbienceProfile({ missionIndex: 2 }).phase, 'night');
  assert.equal(cityAmbienceProfile({ missionIndex: 3 }).phase, 'dawn');
  assert.equal(cityAmbienceProfile({ missionIndex: 2, mission: { lighting: 'day' } }).phase, 'day');
  assert.equal(cityAmbienceProfile(fixture('late-afternoon')).phase, 'day');
  assert.ok(Object.isFrozen(day) && Object.isFrozen(day.intervals) && Object.isFrozen(day.intervals.battle));
});

test('ambience is deterministic, independent of listener motion and the gameplay RNG', () => {
  const state = fixture(), moved = fixture();
  const originalRng = state.rngState;
  const a = run(state), b = run(moved, 360, .1, moved.seed, true);
  assert.deepEqual(a.events, b.events);
  assert.equal(state.rngState, originalRng);
  assert.equal(moved.rngState, originalRng);
  assert.notDeepEqual(a.events, run(fixture(), 360, .1, 125).events);
  assert.deepEqual(new Set(a.events.map(event => event.kind)), new Set(['battle', 'rotor', 'engine', 'metal', 'domestic']));
  assert.ok(a.events.some(event => event.variant === 'automatic'));
  assert.ok(a.events.some(event => event.variant === 'rifle'));
  assert.ok(a.events.some(event => event.variant === 'rumble'));
});

test('sources belong to real districts or the map perimeter and do not orbit the player', () => {
  const state = fixture(), { events } = run(state, 600);
  const previous = new Map();
  for (const event of events) {
    assert.ok([event.x, event.y, event.intensity, event.seed, event.duration].every(Number.isFinite));
    assert.ok(event.intensity > 0 && event.intensity <= 1);
    assert.ok(event.duration > 0 && event.duration <= 16);
    assert.notEqual(previous.get(event.kind), event.anchorId, 'successive cues use a different source when alternatives exist');
    previous.set(event.kind, event.anchorId);
    if (event.kind === 'domestic' || event.kind === 'metal') {
      const district = state.world.districts.find(block => `district:${block.id}` === event.anchorId);
      assert.ok(district);
      assert.equal(event.x, district.x + district.w / 2);
      assert.equal(event.y, district.y + district.h / 2);
      assert.ok((event.kind === 'domestic' ? ['residential', 'courtyard'] : ['workshop', 'market']).includes(district.kind));
    } else {
      assert.match(event.anchorId, /^edge:/);
      assert.ok(event.x < 0 || event.y < 0 || event.x > state.world.width || event.y > state.world.height);
      if (event.kind === 'engine') assert.ok(event.toX < 0 || event.toY < 0 || event.toX > state.world.width || event.toY > state.world.height,
        'an unseen ambient vehicle stays outside the playable map');
      if (event.kind === 'rotor') assert.ok(Math.hypot(event.toX - event.x, event.toY - event.y) >= state.world.height);
    }
  }
});

test('day has more everyday activity while nighttime still contains battle and aircraft', () => {
  const day = run(fixture('day'), 900).events, night = run(fixture('night'), 900).events;
  const everyday = events => events.filter(event => ['engine', 'metal', 'domestic'].includes(event.kind)).length;
  assert.ok(everyday(day) > everyday(night) * 1.4);
  assert.ok(night.some(event => event.kind === 'battle'));
  assert.ok(night.some(event => event.kind === 'rotor'));
  const barks = day.filter(event => event.kind === 'domestic');
  for (let i = 1; i < barks.length; i++) assert.ok(barks[i].time - barks[i - 1].time >= 32);
});

test('snapshot gaps and repeated or stale clocks cannot replay an ambient backlog', () => {
  const state = fixture(), director = createCityAmbience(123, 0);
  assert.deepEqual(advanceCityAmbience(director, state), []);
  for (let time = .1; time < 6; time += .1) { state.time = time; advanceCityAmbience(director, state); }
  const emitted = director.sequence;
  state.time = 300;
  assert.deepEqual(advanceCityAmbience(director, state), []);
  for (const time of [300, 299, 300.1, 300.2, 301, 302]) {
    state.time = time;
    assert.deepEqual(advanceCityAmbience(director, state), []);
  }
  assert.equal(director.sequence, emitted);
  // Several minutes of coarse but valid snapshots still have a hard batch cap.
  for (let i = 1; i < 800; i++) {
    state.time = 302 + i * .4;
    const batch = advanceCityAmbience(director, state);
    assert.ok(batch.length <= 2);
    assert.ok(batch.every(event => event.time === state.time));
    assert.deepEqual(advanceCityAmbience(director, state), []);
  }
});

test('pause/end and lighting changes rearm from the current time instead of catching up', () => {
  const state = fixture(), director = createCityAmbience(1, 0, 40);
  state.time = 40;
  assert.deepEqual(advanceCityAmbience(director, state), []);
  state.time = 41; state.paused = true;
  assert.deepEqual(advanceCityAmbience(director, state), []);
  state.time = 90; state.paused = false;
  assert.deepEqual(advanceCityAmbience(director, state), []);
  state.time = 90.1; state.mission.lighting = 'night';
  assert.deepEqual(advanceCityAmbience(director, state), []);
  assert.equal(director.phase, 'night');
  state.time = 100; state.status = 'won';
  assert.deepEqual(advanceCityAmbience(director, state), []);
  state.time = 100.1; state.status = 'playing';
  assert.deepEqual(advanceCityAmbience(director, state), []);
});

test('minimal worlds have bounded fallback sources and malformed worlds stay silent', () => {
  const state = fixture();
  state.world = { width: 320, height: 240 };
  assert.ok(run(state, 120).events.length > 0);
  const director = createCityAmbience(1, 0);
  state.time = 0;
  advanceCityAmbience(director, state);
  state.world = { width: NaN, height: -1 };
  for (let time = .1; time < 60; time += .2) {
    state.time = time;
    assert.deepEqual(advanceCityAmbience(director, state), []);
  }
  assert.deepEqual(advanceCityAmbience(director, { ...state, time: NaN }), []);
});
