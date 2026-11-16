import test from 'node:test';
import assert from 'node:assert/strict';
import { MusicDirector } from '../dist/music-director.mjs';
import { musicContext } from '../dist/music-context.mjs';
import { MUSIC_CUES, THEME_ID } from '../dist/music-score.mjs';
import { WARZONE_CUE_IDS } from '../dist/music-warzone.mjs';
import { musicGroup, musicListeningText } from '../dist/music-library-ui.mjs';

const ids = new Set(WARZONE_CUE_IDS);
const flight = { scene: 'exploration', paletteKey: 'hearth:ship', musicPlace: null, tags: ['ship', 'flight'] };
const front = { ...flight, paletteKey: 'crosswind:ship', musicPlace: 'crosswind', tags: ['crosswind', 'ship', 'flight'] };
const make = seed => new MusicDirector({ cues: MUSIC_CUES, themeId: THEME_ID, seed: seed || 'crosswind-music' });
const fixture = () => ({ state: { systemId: 'crosswind', mode: 'ship', ship: { id: 'own', x: 0, y: 0 }, person: { x: 0, y: 0, health: 100 } }, system: { enemies: [], bullets: [], bodies: [] } });

test('Crosswind supplies a battle score immediately without inventing personal danger', () => {
  const game = fixture(), before = JSON.stringify(game);
  const context = musicContext({ game, playing: true });
  assert.equal(context.musicPlace, 'crosswind'); assert.ok(context.tags.includes('crosswind'));
  assert.equal(context.observedThreat, false); assert.equal(context.combat, false);
  assert.equal(JSON.stringify(game), before);
  assert.ok(ids.has(make().update(context, 0).cueId));
  assert.notEqual(musicContext({ game, playing: false }).musicPlace, 'crosswind');
  assert.notEqual(musicContext({ game, playing: true, hidden: true }).musicPlace, 'crosswind');
});

test('the score follows the captain throughout Crosswind including borrowed decks and relief interiors', () => {
  const game = fixture(); game.state.mode = 'person';
  for (const interior of [{ kind: 'ship' }, { kind: 'enemy' }, { kind: 'eva' }, { kind: 'site' }, null]) {
    game.state.interior = interior;
    const context = musicContext({ game, playing: true, network: { passport: { captainId: 'guest' } }, deckHull: { id: 'borrowed', x: 10, y: 20 } });
    assert.equal(context.musicPlace, 'crosswind'); assert.ok(ids.has(make().update(context, 0).cueId));
  }
  game.state.systemId = 'hearth';
  assert.notEqual(musicContext({ game, playing: true }).musicPlace, 'crosswind');
});

test('arrival replaces peaceful music and ordinary combat music on the first update', () => {
  for (const initial of [{ scene: 'menu' }, flight, { ...flight, observedThreat: true }]) {
    const director = make(), old = director.update(initial, 0);
    const arrival = director.update(front, 1, { presence: 'quiet' });
    assert.ok(ids.has(arrival.cueId)); assert.notEqual(arrival.token, old.token);
    assert.equal(arrival.mood, 'combat'); assert.equal(arrival.warzone, true);
    assert.ok(arrival.fadeOut <= .35); assert.ok(arrival.fadeIn <= .9);
    for (let now = 2; now <= 30; now++) {
      const context = now % 2 ? front : { ...front, observedThreat: true, emergency: true };
      assert.equal(director.update(context, now).token, arrival.token, 'Shots and lulls do not restart the track.');
    }
  }
});

test('a shuffled bag plays all three pieces before refilling and avoids boundary repeats', () => {
  const orders = new Set();
  for (let seed = 0; seed < 20; seed++) {
    const director = make(`rotation-${seed}`), played = [];
    let now = 0;
    for (let n = 0; n < 15; n++) {
      const next = director.update(front, now, { presence: 'quiet' });
      assert.ok(ids.has(next.cueId));
      if (played.length) assert.notEqual(next.cueId, played.at(-1));
      played.push(next.cueId); now = director.current.until + .01;
    }
    for (let n = 0; n < played.length; n += 3) assert.equal(new Set(played.slice(n, n + 3)).size, 3);
    orders.add(played.slice(0, 3).join('|'));
  }
  assert.ok(orders.size >= 4, 'Different listening seeds produce different opening orders.');
});

test('ordinary combat elsewhere cannot select the Crosswind pieces', () => {
  const director = make();
  for (const tags of [['ship', 'flight'], ['ship', 'capital', 'navy'], ['ground', 'infantry'], ['ground', 'boarding'], ['crosswind', 'ship']]) {
    for (let n = 0; n < 20; n++) assert.equal(ids.has(director.select('combat', n * 200, { ...flight, tags })?.id), false);
  }
});

test('crossing between Crosswind locations keeps the playing phrase while leaving restores the voyage', () => {
  const director = make(), arrival = director.update(front, 0);
  const clinic = { ...front, paletteKey: 'crosswind:orsa:clinic', scene: 'social', environment: 'planet', dialogue: true, tags: ['crosswind', 'ground', 'clinic'] };
  const inside = director.update(clinic, 10);
  assert.equal(inside.token, arrival.token); assert.equal(inside.duck, .34);
  const outside = director.update(flight, 11);
  assert.equal(ids.has(outside.cueId), false); assert.equal(outside.warzone, false);
  assert.equal(outside.mood, 'recovery');
  assert.ok(ids.has(director.update(front, 12).cueId));
});

test('music off, hidden tabs and explicit silence still stop the battle score', () => {
  for (const [context, settings] of [[front, { enabled: false }], [{ ...front, hidden: true }, {}], [{ ...front, silence: true }, {}]]) {
    const director = make(); director.update(front, 0);
    assert.equal(director.update(context, 1, settings).cueId, null);
    assert.ok(ids.has(director.update(front, 2).cueId));
  }
  const director = make(); director.update(front, 0);
  assert.equal(ids.has(director.update({ scene: 'menu' }, 1).cueId), false);
});

test('peaceful auditions wait until departure while a requested Crosswind piece can play in place', () => {
  const director = make(); director.update(front, 0);
  director.requestPreview(THEME_ID);
  const waiting = director.update(front, 1);
  assert.ok(ids.has(waiting.cueId)); assert.equal(waiting.requestedCueId, THEME_ID);
  assert.match(musicListeningText({ ...waiting, state: 'running', title: 'Kill Corridor' }), /after you leave Crosswind/);
  const requested = director.crosswindBag[0];
  director.requestPreview(requested);
  const audition = director.update(front, 2);
  assert.equal(audition.cueId, requested); assert.equal(audition.preview, true);
  assert.equal(director.update({ ...front, observedThreat: true }, 3).token, audition.token);
  const next = director.update(front, director.current.until + .01);
  assert.ok(ids.has(next.cueId)); assert.notEqual(next.cueId, requested); assert.equal(next.preview, false);
  director.requestPreview(THEME_ID);
  const returned = director.update(flight, director.lastNow + 1);
  assert.equal(returned.cueId, THEME_ID); assert.equal(returned.preview, true);
});

test('the listening catalog offers exactly the three Crosswind pieces in their own category', () => {
  assert.deepEqual(new Set(MUSIC_CUES.filter(cue => musicGroup(cue, 'crosswind')).map(cue => cue.id)), ids);
});
