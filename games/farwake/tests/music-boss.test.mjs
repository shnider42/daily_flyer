import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { createSiteState, explorationLocation, resetSiteBoss, stepSiteEncounter } from '../dist/exploration.mjs';
import { generateSurface } from '../dist/surface.mjs';
import { FOREMAN_POSITION } from '../dist/floodworks.mjs';
import { musicContext } from '../dist/music-context.mjs';
import { MusicDirector } from '../dist/music-director.mjs';
import { MUSIC_CUES, THEME_ID } from '../dist/music-catalog.mjs';
import { FARWAKE_V33B, RECORDED_MUSIC } from '../dist/recorded-theme.mjs';

const point = (x, y) => ({ x: (x + .5) * 24, y: (y + .5) * 24 });
const director = () => new MusicDirector({ cues: MUSIC_CUES, themeId: THEME_ID, seed: 'rare-boss-music' });
const read = (game, surface = game._expeditionSurface?.(), extra = {}) => musicContext({ game, surface, playing: true, ...extra });

function hollow() {
  const game = new Game('boss-music-sight'), moon = game.system.bodies.find(body => body.id === 'tinbell');
  const location = explorationLocation(moon, 'hollow', game.state.seed), surface = generateSurface(location, game.state.seed);
  game.state.mode = 'person'; game.state.interior = { kind: 'site', location }; game.state.locationId = location.id;
  game.state.exploration = { bodyId: moon.id, siteId: 'hollow', encounter: createSiteState(location.site) };
  Object.assign(game.state.person, point(19, 7), { health: 100, down: false });
  return { game, surface, encounter: game.state.exploration.encounter, boss: game.state.exploration.encounter.monsters[0] };
}

test('the exact V33B recording is reserved for locally witnessed bosses through sight loss, defeat and reset', () => {
  const { game, surface, encounter, boss } = hollow(), d = director();
  assert.equal(read(game, surface).bossEncounterKey, null, 'A dormant hidden boss cannot identify a musical encounter.');
  assert.notEqual(d.update(read(game, surface), 0).cueId, FARWAKE_V33B.id);
  const other = { id: 'other-captain', person: { ...point(24, 16), health: 100, maxHealth: 100 }, input: {} };
  stepSiteEncounter(encounter, [other], .01, surface);
  const sharedReveal = read(game, surface);
  assert.ok(sharedReveal.bossEncounterKey);
  assert.equal(sharedReveal.bossObserved, false);
  assert.notEqual(d.update(sharedReveal, 1).cueId, FARWAKE_V33B.id, 'Another captain cannot start the hidden boss music here.');

  Object.assign(game.state.person, point(27, 11));
  const visible = read(game, surface);
  assert.equal(visible.bossObserved, true);
  const music = d.update(visible, 2);
  assert.equal(music.cueId, FARWAKE_V33B.id); assert.equal(music.loop, false, 'The recording keeps its authored ending.');
  Object.assign(game.state.person, point(19, 7));
  const occluded = read(game, surface);
  assert.equal(occluded.bossObserved, false);
  d.notify('combat', 3, 'a-real-hit');
  assert.equal(d.update(occluded, 3).token, music.token, 'Brief sight loss and further hits do not restart the song.');
  assert.notEqual(director().update(occluded, 3).cueId, FARWAKE_V33B.id, 'A new observer has no borrowed memory of the reveal.');
  assert.equal(d.update(occluded, 150).cueId, FARWAKE_V33B.id, 'An ongoing boss fight keeps its score beyond the first complete performance.');

  boss.health = 0;
  const finished = d.update(read(game, surface), 151);
  assert.notEqual(finished.cueId, FARWAKE_V33B.id); assert.equal(finished.mood, 'recovery');
  boss.health = 700; resetSiteBoss(encounter);
  assert.equal(read(game, surface).bossEncounterKey, null);
  assert.notEqual(d.update(read(game, surface), 152).cueId, FARWAKE_V33B.id);
});

test('boss music replaces ordinary combat, survives repeated attacks, and releases on departure or incapacitation', () => {
  const d = director(), ordinary = { scene: 'exploration', observedThreat: true, tags: ['ground'] };
  const previous = d.update(ordinary, 0);
  assert.notEqual(previous.cueId, FARWAKE_V33B.id);
  const fight = { ...ordinary, bossEncounterKey: 'listener:tinbell:attempt-1', bossObserved: true };
  const music = d.update(fight, 1);
  assert.equal(music.cueId, FARWAKE_V33B.id); assert.notEqual(music.token, previous.token);
  for (let now = 2; now < 20; now++) {
    d.notify('combat', now, `hit-${now}`);
    assert.equal(d.update({ ...fight, bossObserved: false }, now).token, music.token);
  }
  const unobservedNextAttempt = { ...fight, bossEncounterKey: 'listener:tinbell:attempt-2', bossObserved: false };
  assert.notEqual(d.update(unobservedNextAttempt, 20).cueId, FARWAKE_V33B.id, 'A new attempt needs its own local observation.');

  const { game, surface, encounter } = hollow();
  Object.assign(game.state.person, point(27, 11));
  stepSiteEncounter(encounter, [{ id: game.playerId, person: game.state.person, input: {} }], .01, surface);
  assert.equal(read(game, surface).bossObserved, true);
  for (const change of [() => { game.state.person.down = true; }, () => { game.state.mode = 'ship'; }]) {
    const active = director();
    game.state.person.down = false; game.state.mode = 'person';
    assert.equal(active.update(read(game, surface), 0).cueId, FARWAKE_V33B.id);
    change();
    assert.equal(read(game, surface).bossEncounterKey, null);
    assert.notEqual(active.update(read(game, surface), 1).cueId, FARWAKE_V33B.id);
  }
});

test('the existing Floodworks boss earns V33B only inside its active bay', () => {
  const game = new Game('foreman-boss-music');
  game.state.systemId = 'brindle'; game._runtime = null; game._loadSystem('brindle');
  const body = game.system.bodies.find(value => value.id === 'orchard');
  game._arriveAsPassenger(body, { discovery: false });
  const entrance = generateSurface(body, game.state.seed, game.state.flags).entities.find(entity => entity.data?.siteId === 'floodworks-6');
  Object.assign(game.state.person, entrance, { health: 100, down: false });
  assert.equal(game.enterSite('floodworks-6').ok, true);
  const field = game.state.exploration.encounter.field;
  Object.assign(field, { serviceCut: true, powerBridged: true, drained: true });
  Object.assign(game.state.person, FOREMAN_POSITION);
  const d = director();
  assert.notEqual(d.update(read(game), 0).cueId, FARWAKE_V33B.id, 'The idle machine has not begun a boss battle.');
  game.stepExploration(.1, {});
  let token;
  for (const [now, phase] of ['telegraph', 'sweep', 'recovery'].entries()) {
    field.foreman.phase = phase;
    const context = read(game), score = d.update(context, now + 1);
    assert.equal(context.bossObserved, true); assert.equal(score.cueId, FARWAKE_V33B.id);
    if (token) assert.equal(score.token, token); token = score.token;
  }
  Object.assign(game.state.person, point(11, 43));
  assert.equal(read(game).bossEncounterKey, null);
  assert.notEqual(d.update(read(game), 4).cueId, FARWAKE_V33B.id, 'The workshop does not inherit the bay’s boss music.');
  Object.assign(game.state.person, FOREMAN_POSITION);
  assert.equal(d.update(read(game), 5).cueId, FARWAKE_V33B.id);
  field.foreman.disabled = true; field.foreman.phase = 'shutdown';
  assert.equal(d.update(read(game), 6).mood, 'recovery');
});

test('ordinary battles never spend the boss recording and an explicit listen remains available', () => {
  const d = director();
  for (const tags of [['ground'], ['ground', 'pursuit'], ['ship', 'flight'], ['navy', 'capital'], ['quiet-earth', 'ground'], ['boss', 'ground']]) {
    for (const cue of MUSIC_CUES) d.lastPlayed.set(cue.id, 0);
    for (let now = 1; now < 30; now++) {
      const cue = d.select('combat', now, { scene: 'exploration', tags });
      assert.ok(cue); assert.notEqual(cue.id, FARWAKE_V33B.id);
    }
  }
  const warzone = { scene: 'exploration', musicPlace: 'crosswind', tags: ['crosswind', 'flight'] };
  assert.ok(director().update(warzone, 0).cueId.startsWith('crosswind-'));
  const audition = director(); assert.equal(audition.requestPreview(FARWAKE_V33B.id), true);
  assert.equal(audition.update({ scene: 'exploration', tags: ['flight'] }, 0).cueId, FARWAKE_V33B.id);
  const recording = RECORDED_MUSIC.find(item => item.cue.id === FARWAKE_V33B.id);
  assert.ok(recording.url.endsWith('/music/farwake-v33b-triplets-clean-ending.m4a'));
});
