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

const recordedMenu = () => new MusicDirector({ cues: cues.map(cue => cue.id === 'theme' ? { ...cue, loopInMenu: true } : cue), themeId: 'theme', seed: 'menu-recording' });

test('recorded title music loops until stopped and returns on the next title visit', () => {
  const d = recordedMenu(), menu = { scene: 'menu' }, first = d.update(menu, 0);
  assert.equal(first.loop, true);
  assert.equal(d.update(menu, 700).token, first.token, 'The media loop is not restarted by the director.');
  d.stopTheme(701);
  assert.equal(d.update(menu, 1200).cueId, null, 'An explicit Stop stays stopped on the title.');
  d.update(flight, 1201);
  const returned = d.update(menu, 1202);
  assert.equal(returned.cueId, 'theme'); assert.equal(returned.loop, true); assert.notEqual(returned.token, first.token);
});

test('recorded title listening fades into gameplay while an in-game audition plays only once', () => {
  const d = recordedMenu(), menu = { scene: 'menu' };
  d.requestTheme(); const title = d.update(menu, 0);
  assert.equal(title.preview, true); assert.equal(title.loop, true);
  const voyage = d.update(flight, 1);
  assert.equal(voyage.mood, 'exploration'); assert.equal(voyage.loop, false);
  assert.notEqual(voyage.cueId, title.cueId);
  d.requestTheme(); const audition = d.update({ ...flight, menuOpen: true }, 2);
  assert.equal(audition.cueId, 'theme'); assert.equal(audition.loop, false);
  assert.notEqual(d.update(flight, 185).cueId, 'theme');
});

test('hidden title music resumes after the normal quiet interval without overriding explicit Stop', () => {
  const d = recordedMenu(), menu = { scene: 'menu' };
  d.update(menu, 0); d.suspend(1);
  assert.equal(d.update(menu, 10).cueId, null);
  assert.equal(d.update(menu, 13).cueId, 'theme');
  d.stopTheme(14); d.suspend(15); d.update(menu, 20);
  assert.equal(d.update(menu, 200).cueId, null);
});

test('auditioning another piece on the title returns to the recorded menu loop afterward', () => {
  const d = recordedMenu(), menu = { scene: 'menu' };
  d.update(menu, 0); d.requestPreview('exploration-1');
  assert.equal(d.update(menu, 1).cueId, 'exploration-1');
  assert.equal(d.update(menu, 44).cueId, 'theme');
  d.stopTheme(45); d.requestPreview('exploration-2'); d.update(menu, 46);
  assert.equal(d.update(menu, 100).cueId, null, 'An earlier explicit theme Stop is still respected.');
});

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

test('any known cue can be auditioned in a paused menu, including danger pieces, without false gameplay danger', () => {
  const d = make(), settings = { ...flight, paused: true, menuOpen: true };
  assert.equal(d.requestPreview('does-not-exist'), false); assert.equal(d.previewRequested, false);
  assert.equal(d.requestPreview('combat-2'), true);
  const preview = d.update(settings, 0);
  assert.equal(preview.cueId, 'combat-2'); assert.equal(preview.preview, true);
  assert.equal(preview.previewCueId, 'combat-2'); assert.equal(preview.requestedCueId, null);
  assert.equal(d.lastDanger, false);
  assert.equal(d.update(settings, 20).token, preview.token, 'A combat audition is not mistaken for an expired battle cue.');
  assert.equal(d.update({ ...planet, paused: false }, 21).token, preview.token);
  assert.equal(d.update(planet, 28).token, preview.token, 'A location crossfade cannot interrupt an explicit listen.');
  d.stopPreview(29);
  assert.equal(d.update(settings, 29).previewCueId, null);
  assert.equal(d.previewCueId, null);
});

test('actual danger interrupts an audition, queues it once, and a cancellation does not silence real combat', () => {
  const d = make(); d.requestPreview('social-2'); const preview = d.update(flight, 0);
  d.notify('combat', 1, 'real-shot'); const battle = d.update(flight, 1);
  assert.equal(battle.preview, false); assert.equal(battle.mood, 'combat');
  assert.equal(battle.requestedCueId, 'social-2'); assert.equal(d.previewRequested, true);
  assert.equal(d.update(flight, 5).token, battle.token);
  const resumed = d.update(flight, 16);
  assert.equal(resumed.previewCueId, 'social-2'); assert.notEqual(resumed.token, preview.token);
  d.notify('combat', 17, 'next-shot'); const renewed = d.update(flight, 17);
  d.stopPreview(18);
  assert.equal(d.update(flight, 18).token, renewed.token);
  assert.equal(d.update(flight, 18).requestedCueId, null);
  assert.equal(d.update(flight, 32).mood, 'recovery');
});

test('the latest audition replaces a pending choice and muted or hidden playback cannot start it', () => {
  const d = make(); d.notify('combat', 0); d.requestPreview('planet-1'); d.update(flight, 0);
  d.requestPreview('cave-2'); assert.equal(d.update(flight, 1).requestedCueId, 'cave-2');
  assert.equal(d.update(flight, 20, { enabled: false }).cueId, null);
  assert.equal(d.update({ ...flight, hidden: true }, 21).cueId, null);
  const resumed = d.update(flight, 22);
  assert.equal(resumed.previewCueId, 'cave-2'); assert.equal(d.previewRequested, false);
});

test('recovery auditions finish normally and real handover notices do not repeatedly restart recovery', () => {
  const d = make(); d.requestPreview('recovery-1');
  const preview = d.update(flight, 0);
  assert.equal(d.update(flight, 10).token, preview.token);
  assert.equal(d.update(flight, 23).cueId, null);
  d.notify('recovery', 24, 'arrival');
  const recovery = d.update(flight, 24); assert.equal(recovery.mood, 'recovery');
  d.notify('recovery', 25, 'handover');
  assert.equal(d.update(flight, 25).token, recovery.token, 'Arrival and the subsequent physical handover share one recovery phrase.');
  d.notify('combat', 26, 'incoming'); assert.equal(d.update(flight, 26).mood, 'combat');
});

test('named place cues require the actual place and gain a six-second arrival transition', () => {
  const contextual = [
    { id: 'flight', family: 'exploration', durationSeconds: 90, tags: ['flight'] },
    { id: 'cabin', family: 'exploration', durationSeconds: 90, tags: ['ship', 'cabin'] },
    { id: 'field', family: 'exploration', durationSeconds: 90, tags: ['fieldwork'] },
    { id: 'foreman', family: 'combat', durationSeconds: 90, tags: ['ground', 'fieldwork', 'foreman'] },
    { id: 'ground', family: 'combat', durationSeconds: 90, tags: ['ground'] },
  ];
  const d = new MusicDirector({ cues: contextual });
  assert.equal(d.update(flight, 0).cueId, 'flight');
  const cabin = { scene: 'exploration', paletteKey: 'ship:cabin', musicPlace: 'cabin', tags: ['ship', 'cabin'] };
  assert.equal(d.update(cabin, 1).cueId, 'flight');
  assert.equal(d.update(cabin, 7).cueId, 'cabin');
  const field = { scene: 'exploration', environment: 'planet', musicPlace: 'fieldwork', paletteKey: 'field', tags: ['ground', 'fieldwork'] };
  const atSite = new MusicDirector({ cues: contextual }); assert.equal(atSite.update(field, 0).cueId, 'field');
  assert.equal(atSite.update({ ...field, combat: true, tags: [...field.tags, 'foreman'] }, 1).cueId, 'foreman');
  const outside = new MusicDirector({ cues: contextual });
  assert.equal(outside.update({ ...planet, combat: true, tags: ['ground'] }, 0).cueId, 'ground');
});
