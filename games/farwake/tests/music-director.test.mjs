import test from 'node:test';
import assert from 'node:assert/strict';
import { MusicDirector, MUSIC_PRESENCE } from '../dist/music-director.mjs';

const cues = [
  { id: 'theme', family: 'theme', durationSeconds: 180 },
  ...['exploration', 'social', 'discovery', 'tension', 'combat', 'recovery', 'terror', 'cave', 'planet'].flatMap(family =>
    [1, 2, 3].map(i => ({ id: `${family}-${i}`, family, durationSeconds: family === 'recovery' ? 20 : 40, cooldownSeconds: 180 }))),
];
const make = () => new MusicDirector({ cues, themeId: 'theme', seed: 'test' });
const flight = { scene: 'exploration', paletteKey: 'sol', tags: ['flight'] };
const planet = { scene: 'exploration', environment: 'planet', paletteKey: 'hearth:morrow:temperate', tags: ['planet', 'ground', 'temperate'] };
const cave = { scene: 'exploration', environment: 'cave', paletteKey: 'hearth:tinbell:cave', tags: ['cave', 'ground', 'stone'] };

test('menu theme has a full statement and does not restart when opening menus', () => {
  const d = make(), first = d.update({ scene: 'menu' }, 1);
  assert.equal(first.cueId, 'theme');
  assert.equal(d.update({ ...flight, menuOpen: true }, 5).token, first.token);
  assert.equal(d.update(flight, 20).token, first.token);
  assert.equal(d.update({ scene: 'menu' }, 184).cueId, null);
  assert.equal(d.update({ scene: 'menu' }, 600).cueId, null);
  d.requestTheme(); assert.equal(d.update({ scene: 'menu' }, 601).cueId, 'theme');
});

test('incoming fire interrupts peace promptly, repeated shots do not restart combat, recovery precedes quiet', () => {
  const d = make(); d.update(flight, 0);
  d.notify('combat', 1, 'shot-1');
  const battle = d.update(flight, 1);
  assert.equal(battle.mood, 'combat'); assert.ok(battle.fadeOut < .5);
  for (let now = 2; now < 10; now++) {
    d.notify('combat', now, `shot-${now}`);
    assert.equal(d.update(flight, now).token, battle.token);
  }
  assert.equal(d.update(flight, 22).mood, 'combat');
  const recovery = d.update(flight, 24); assert.equal(recovery.mood, 'recovery');
  assert.equal(d.update(flight, 47).cueId, null);
  assert.ok(d.nextMusicAt >= 82);
});

test('caves and planetary surfaces have distinct families while actual people keep social priority above ground', () => {
  assert.equal(make().update(cave, 0).mood, 'cave');
  assert.equal(make().update(planet, 0).mood, 'planet');
  assert.equal(make().update({ ...planet, scene: 'social', dialogue: true }, 0).mood, 'social');
  const underground = make().update({ ...cave, scene: 'social', dialogue: true }, 0);
  assert.equal(underground.mood, 'cave');
  assert.ok(underground.duck < .4, 'Conversation still ducks a cave piece.');
});

test('arriving in a cave or on a planet gently replaces the menu theme within six seconds', () => {
  for (const location of [cave, planet]) {
    const d = make(), theme = d.update({ scene: 'menu' }, 0);
    assert.equal(d.update(location, 5).token, theme.token, 'The new location does not abruptly cut a phrase.');
    assert.equal(d.update(location, 10.9).token, theme.token);
    const arrival = d.update(location, 11);
    assert.equal(arrival.mood, location.environment);
    assert.notEqual(arrival.token, theme.token);
    assert.equal(arrival.fadeOut, 4); assert.equal(arrival.fadeIn, 3.5);
  }
});

test('body identity changes the local performance without immediate repeats and short threshold crossings cancel', () => {
  const d = make(), first = d.update(planet, 0);
  const differentBody = { ...planet, paletteKey: 'hearth:other-temperate-world:temperate' };
  assert.equal(d.update(differentBody, 1).token, first.token);
  const arrival = d.update(differentBody, 7);
  assert.equal(arrival.mood, 'planet'); assert.notEqual(arrival.cueId, first.cueId);
  assert.notEqual(arrival.seed, first.seed);
  assert.equal(d.update(cave, 8).token, arrival.token);
  assert.equal(d.update(differentBody, 10).token, arrival.token);
  assert.equal(d.update(differentBody, 16).token, arrival.token, 'Returning before the threshold cancels the pending crossfade.');
  assert.equal(d.transitionKey, null);
  assert.equal(d.update(flight, 17).token, arrival.token);
  assert.equal(d.update(flight, 23).mood, 'exploration', 'Leaving the environment also restores the space family.');
});

test('a new environmental arrival bounds an old resting interval while later quiet presence remains quiet', () => {
  const d = make(), settings = { presence: 'quiet' };
  d.update(flight, 0, settings);
  assert.equal(d.update(flight, 45, settings).cueId, null);
  assert.ok(d.nextMusicAt >= 125);
  assert.equal(d.update(planet, 46, settings).cueId, null);
  assert.equal(d.nextMusicAt, 52);
  assert.equal(d.update(planet, 51.9, settings).cueId, null);
  assert.equal(d.update(planet, 52, settings).mood, 'planet');
  assert.equal(d.update(planet, 95, settings).cueId, null);
  assert.ok(d.nextMusicAt >= 175, 'The location transition does not disable ordinary quiet intervals.');
});

test('a natural cue ending during arrival keeps the six-second transition deadline', () => {
  const d = make(), settings = { presence: 'quiet' };
  const leaving = d.update(flight, 0, settings);
  assert.equal(d.update(cave, 40, settings).token, leaving.token);
  assert.equal(d.update(cave, 42, settings).cueId, null, 'The old piece ends before the arrival grace period expires.');
  assert.equal(d.nextMusicAt, 46);
  assert.equal(d.update(cave, 43, settings).cueId, null);
  assert.equal(d.update(cave, 46, settings).mood, 'cave');
});

test('sustained pursuit overrides quiet presence and exhausted combat cooldowns without restarting on every hit', () => {
  const d = make(), settings = { presence: 'quiet' };
  d.update(flight, 0, settings); d.update(flight, 45, settings);
  assert.ok(d.nextMusicAt > 120);
  for (const cue of cues.filter(value => value.family === 'combat')) d.lastPlayed.set(cue.id, 45);
  const chase = { ...flight, pursuit: true, tags: ['flight', 'pursuit'] };
  const first = d.update(chase, 46, settings), played = [first.cueId];
  assert.equal(first.mood, 'combat'); assert.ok(first.cueId); assert.ok(first.fadeOut < .5);
  let token = first.token;
  for (let now = 47; now <= 180; now++) {
    d.notify('combat', now, `pursuit-hit-${now}`);
    const result = d.update(chase, now, settings);
    assert.equal(result.mood, 'combat'); assert.ok(result.cueId, 'Combat never waits for a peaceful gap.');
    if (result.token !== token) { played.push(result.cueId); token = result.token; }
    if (now < 88) assert.equal(result.token, first.token, 'Repeated observed hits keep the current phrase.');
  }
  assert.ok(played.length >= 4, 'The chase spans multiple complete pieces.');
  for (let i = 1; i < played.length; i++) assert.notEqual(played[i], played[i - 1]);
  assert.equal(d.update(flight, 193, settings).mood, 'combat');
  assert.equal(d.update(flight, 195, settings).mood, 'recovery');
});

test('location transitions cannot interrupt danger or its recovery', () => {
  const d = make(); d.update(planet, 0); d.notify('combat', 1, 'local-impact');
  const battle = d.update(planet, 1);
  assert.equal(d.update(cave, 2).token, battle.token);
  assert.equal(d.update(cave, 9).token, battle.token);
  const recovery = d.update(cave, 16);
  assert.equal(recovery.mood, 'recovery');
  assert.equal(d.update(planet, 17).token, recovery.token);
  assert.equal(d.update(planet, 24).token, recovery.token);
  d.notify('combat', 25, 'renewed-impact');
  assert.equal(d.update(planet, 25).mood, 'combat', 'Renewed fire still interrupts recovery promptly.');
});

test('specific regional and battle tags choose matching pieces before generic family labels', () => {
  const tagged = [
    { id: 'ground-battle', family: 'combat', tags: ['combat', 'ground'] },
    { id: 'pursuit-battle', family: 'combat', tags: ['combat', 'pursuit'] },
    { id: 'ice-walk', family: 'planet', tags: ['planet', 'ice'] },
    { id: 'forest-walk', family: 'planet', tags: ['planet', 'forest'] },
  ];
  for (let i = 0; i < 10; i++) {
    const d = new MusicDirector({ cues: tagged, seed: `regional-${i}` });
    assert.equal(d.update({ ...flight, pursuit: true, tags: ['combat', 'flight', 'pursuit'] }, 0).cueId, 'pursuit-battle');
    const world = new MusicDirector({ cues: tagged, seed: `world-${i}` });
    assert.equal(world.update({ ...planet, tags: ['planet', 'surface', 'ice'] }, 0).cueId, 'ice-walk');
  }
});

test('a new hit overrides the resting interval and a theme preview waits for safety', () => {
  const d = make(); d.update(flight, 0); d.update(flight, 45);
  assert.equal(d.current, null);
  d.notify('combat', 46); d.requestTheme();
  assert.equal(d.update(flight, 46).mood, 'combat');
  assert.equal(d.update(flight, 61).cueId, 'theme');
});

test('an enemy or low hull values do not by themselves cause terror or combat', () => {
  const d = make();
  for (let i = 0; i < 20; i++) {
    const result = d.update({ ...flight, dark: true, derelict: true, health: 1, enemies: [{}] }, i * 60);
    assert.ok(!['terror', 'combat', 'tension'].includes(result.mood));
  }
});

test('explicit terror is brief, once per reveal, and capped by a twenty-minute cooldown', () => {
  const d = make(), reveal = { ...flight, terror: true, terrorKey: 'observed-stage-script' };
  assert.equal(d.update(reveal, 0).mood, 'terror');
  assert.equal(d.update(reveal, 21).mood, 'recovery');
  assert.notEqual(d.update(reveal, 5000).mood, 'terror');
  assert.equal(d.update({ ...reveal, terrorKey: 'new-reveal' }, 5001).mood, 'terror');
  assert.notEqual(d.update({ ...reveal, terrorKey: 'third-reveal' }, 5050).mood, 'terror');
});

test('dialogue ducks music without changing the cue and authored silence outranks danger', () => {
  const d = make(), first = d.update(flight, 0);
  const speech = d.update({ ...flight, dialogue: true }, 1);
  assert.equal(speech.token, first.token); assert.ok(speech.duck < .4);
  d.notify('combat', 2);
  assert.equal(d.update({ ...flight, silence: true }, 2).cueId, null);
  assert.equal(d.update(flight, 3).mood, 'combat');
});

test('hidden/muted audio is silent and a return cannot replay expired scheduled cues', () => {
  const d = make(); d.update(flight, 0);
  assert.equal(d.update({ ...flight, hidden: true }, 1).cueId, null);
  assert.equal(d.update(flight, 1000).cueId, null);
  assert.equal(d.update(flight, 1004).mood, 'exploration');
  assert.equal(d.update(flight, 1005, { enabled: false }).cueId, null);
});

test('stable contextual variation avoids immediate repeats and memory remains bounded', () => {
  const a = make(), b = make(), played = [];
  for (let now = 0; now < 50000; now += 200) {
    const x = a.update(flight, now, { presence: 'frequent' });
    const y = b.update(flight, now, { presence: 'frequent' });
    assert.equal(x.cueId, y.cueId);
    if (x.cueId) played.push(x.cueId);
    a.notify('unknown', now, `bounded-${now}`);
  }
  assert.ok(a.history.length <= 8); assert.ok(a.eventKeys.length <= 96);
  assert.ok(new Set(played).size >= 3);
  for (let i = 1; i < played.length; i++) assert.notEqual(played[i], played[i - 1]);
  assert.ok(MUSIC_PRESENCE.quiet[0] > MUSIC_PRESENCE.frequent[1]);
});

test('empty catalogs and invalid clocks fail quiet, without throwing', () => {
  const d = new MusicDirector();
  assert.equal(d.update({}, NaN).cueId, null);
  d.requestTheme(); assert.equal(d.update({ scene: 'menu' }, 1).cueId, null);
});
