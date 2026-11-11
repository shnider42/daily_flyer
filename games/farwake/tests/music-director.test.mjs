import test from 'node:test';
import assert from 'node:assert/strict';
import { MusicDirector, MUSIC_PRESENCE } from '../dist/music-director.mjs';

const cues = [
  { id: 'theme', family: 'theme', durationSeconds: 180 },
  ...['exploration', 'social', 'discovery', 'tension', 'combat', 'recovery', 'terror'].flatMap(family =>
    [1, 2, 3].map(i => ({ id: `${family}-${i}`, family, durationSeconds: family === 'recovery' ? 20 : 40, cooldownSeconds: 180 }))),
];
const make = () => new MusicDirector({ cues, themeId: 'theme', seed: 'test' });
const flight = { scene: 'exploration', paletteKey: 'sol', tags: ['flight'] };

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
