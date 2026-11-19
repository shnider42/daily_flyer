import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { generateSurface, isWalkable } from '../dist/surface.mjs';
import { storyStatus, storyThreats } from '../dist/expedition-story-rules.mjs';
import { quietEarthLightState } from '../dist/quiet-earth-lighting.mjs';
import { musicContext } from '../dist/music-context.mjs';
import { MusicDirector } from '../dist/music-director.mjs';
import { MUSIC_CUES, THEME_ID } from '../dist/music-catalog.mjs';
import { MORROW_FLIGHTLINE } from '../dist/recorded-theme.mjs';

const ok = result => { assert.equal(result?.ok, true, result?.reason); return result; };
const encounter = game => game.state.exploration.encounter;
const site = game => game.state.interior.location.site;
const status = game => storyStatus(encounter(game), site(game));
const power = game => quietEarthLightState(encounter(game), site(game));
const holdings = game => ({ credits: game.state.credits, ore: game.state.cargo.ore, crystal: game.state.cargo.crystal });
const target = (game, kind, id) => assert.equal(status(game).nextTargetId, `${site(game).key}:${kind}:${id}`);

function fixture(seed) {
  const game = new Game(seed, { startMode: 'casual', startSystemId: 'hearth' });
  const body = game.system.bodies.find(value => value.id === 'morrow');
  Object.assign(game.state.ship, { x: body.x, y: body.y + body.radius + 60, vx: 0, vy: 0 });
  ok(game.dock(body.id));
  const entrance = generateSurface(body, game.state.seed, game.state.flags).entities.find(item => item.data?.siteId === 'relay-nine');
  Object.assign(game.state.person, { x: entrance.x, y: entrance.y });
  ok(game.enterSite('relay-nine'));
  game.drainEvents();
  return game;
}

function entity(game, type, id) {
  const item = game._expeditionSurface().entities.find(value => value.type === type &&
    (!id || value.data.choiceId === id || value.data.recordId === id || value.data.cacheId === id));
  assert.ok(item, `Missing physical ${type} ${id || ''}.`);
  return item;
}

function act(game, type, id, action, option) {
  const item = entity(game, type, id);
  Object.assign(game.state.person, { x: item.x, y: item.y });
  return game.siteAction(item.id, action, option);
}

const choose = (game, id, option) => act(game, 'siteChoice', id, 'choose', option);
const read = (game, id) => act(game, 'siteRecord', id, 'inspect');

test('a new Relay Nine run guides the captain through each physical lighting switch in route order', () => {
  const game = fixture('relay-lighting-new-route'), before = holdings(game);
  const director = new MusicDirector({ cues: MUSIC_CUES, themeId: THEME_ID, seed: 'relay-lighting-new-route' });
  const context = () => musicContext({ game, playing: true, surface: game._expeditionSurface() });
  const first = director.update(context(), 0);
  assert.equal(first.cueId, MORROW_FLIGHTLINE.id); assert.equal(first.loop, true);
  target(game, 'choice', 'check-in');
  assert.equal(power(game).key, '000');
  assert.equal(choose(game, 'intake-lights', 'restore').ok, false);
  assert.equal(choose(game, 'upper-lights', 'restore').ok, false);
  assert.equal(power(game).key, '000');

  for (const [id, x, y] of [['intake-lights', 55, 72], ['upper-lights', 12, 32]]) {
    const item = entity(game, 'siteChoice', id);
    assert.equal(item.x, (x + .5) * 24); assert.equal(item.y, (y + .5) * 24);
    assert.ok(isWalkable(game._expeditionSurface(), item.x, item.y, 6));
  }

  ok(choose(game, 'check-in', 'begin'));
  target(game, 'choice', 'intake-lights');
  ok(choose(game, 'intake-lights', 'restore'));
  assert.equal(power(game).key, '100'); target(game, 'record', 'voices');
  assert.equal(choose(game, 'breaker', 'restore').ok, false, 'The new switch cannot replace the original evidence gate.');
  ok(read(game, 'voices'));
  target(game, 'choice', 'breaker');
  ok(choose(game, 'breaker', 'restore'));
  assert.equal(power(game).key, '110'); target(game, 'record', 'service');
  assert.equal(choose(game, 'upper-lights', 'restore').ok, false);
  assert.equal(choose(game, 'receiver', 'copy').ok, false, 'Receiver evidence remains required after the breaker.');
  ok(read(game, 'service'));
  target(game, 'choice', 'upper-lights');
  ok(choose(game, 'upper-lights', 'restore'));
  assert.equal(power(game).key, '111'); target(game, 'choice', 'receiver');
  assert.equal(game._expeditionSurface().combatLayout.siteLighting.key, '111');
  assert.equal(status(game).completedTasks, 4);
  assert.equal(status(game).phase, 'quiet'); assert.equal(storyThreats(encounter(game)).length, 0);
  assert.equal(context().observedThreat, false);
  assert.equal(director.update(context(), 430).token, first.token, 'Restoring lights does not replace the quiet loop.');
  assert.deepEqual(holdings(game), before, 'Restoring power has no reward or cargo side effect.');

  ok(choose(game, 'receiver', 'copy'));
  target(game, 'choice', 'evacuate');
  assert.equal(status(game).phase, 'escape');
});

test('an old breaker save backfeeds intake and continues forward without materializing or replaying the skipped choice', () => {
  let game = fixture('relay-lighting-old-breaker');
  ok(choose(game, 'check-in', 'begin'));
  ok(read(game, 'voices'));
  ok(choose(game, 'breaker', 'restore'));
  const before = holdings(game), position = { x: game.state.person.x, y: game.state.person.y };
  assert.equal(encounter(game).choices['intake-lights'], undefined);
  game = Game.fromSave(game.serialize());
  assert.deepEqual({ x: game.state.person.x, y: game.state.person.y }, position);
  assert.equal(power(game).key, '110');
  assert.deepEqual(power(game).completedChoices, ['intake-lights', 'breaker']);
  target(game, 'record', 'service');
  assert.equal(status(game).completedTasks, 3);
  assert.equal(encounter(game).choices['intake-lights'], undefined, 'Derived lighting completion must not write a reward receipt.');
  assert.deepEqual(holdings(game), before);
  const saved = JSON.stringify(encounter(game));
  status(game); game._expeditionSurface(); power(game);
  assert.equal(JSON.stringify(encounter(game)), saved, 'Guide and lighting projections remain read-only.');
  ok(read(game, 'service'));
  target(game, 'choice', 'upper-lights');
  assert.equal(choose(game, 'breaker', 'restore').ok, false);
  assert.deepEqual(holdings(game), before);
});

test('an old receiver or completed save restores all circuits and never sends the captain back or pays twice', () => {
  let game = fixture('relay-lighting-old-receiver');
  ok(choose(game, 'check-in', 'begin'));
  ok(read(game, 'voices'));
  ok(choose(game, 'breaker', 'restore'));
  ok(read(game, 'service'));
  ok(choose(game, 'receiver', 'copy'));
  const before = holdings(game);
  game = Game.fromSave(game.serialize());
  assert.equal(power(game).key, '111');
  assert.equal(encounter(game).choices['intake-lights'], undefined);
  assert.equal(encounter(game).choices['upper-lights'], undefined);
  target(game, 'choice', 'evacuate');
  assert.equal(status(game).completedTasks, 5);
  assert.deepEqual(holdings(game), before);
  const seal = ok(choose(game, 'evacuate', 'seal'));
  const buffer = ok(act(game, 'siteCache', 'signal-buffer', 'collect'));
  assert.deepEqual(holdings(game), { credits: before.credits + seal.credits + buffer.credits,
    ore: before.ore + (seal.ore || 0) + (buffer.ore || 0), crystal: before.crystal + (seal.crystal || 0) + (buffer.crystal || 0) });
  const paid = holdings(game);
  game = Game.fromSave(game.serialize());
  assert.equal(status(game).completed, true); assert.equal(status(game).nextTargetId, null);
  assert.equal(status(game).completedTasks, status(game).taskCount);
  assert.equal(power(game).key, '111');
  assert.equal(choose(game, 'evacuate', 'seal').ok, false);
  assert.equal(act(game, 'siteCache', 'signal-buffer', 'collect').ok, false);
  // Visiting an optional switch later is harmless, even after its circuit was
  // supplied by an older saved choice and the paid objective was completed.
  ok(choose(game, 'intake-lights', 'restore'));
  ok(choose(game, 'upper-lights', 'restore'));
  assert.equal(status(game).nextTargetId, null); assert.equal(power(game).key, '111');
  assert.deepEqual(holdings(game), paid);
});

test('forged later choices cannot infer light circuits or jump the guide past their missing authored prerequisites', () => {
  const cases = [
    { choices: { 'intake-lights': 'restore', breaker: 'restore', 'upper-lights': 'restore', receiver: 'copy' },
      records: ['voices', 'service'], lighting: '000', kind: 'choice', next: 'check-in', completed: 0 },
    { choices: { 'check-in': 'begin', breaker: 'restore', 'upper-lights': 'restore', receiver: 'copy' },
      records: ['service'], lighting: '000', kind: 'choice', next: 'intake-lights', completed: 1 },
    { choices: { 'check-in': 'begin', 'intake-lights': 'restore', breaker: 'restore', 'upper-lights': 'restore', receiver: 'copy' },
      records: ['voices'], lighting: '110', kind: 'record', next: 'service', completed: 3 },
    { choices: { 'check-in': 'begin', 'intake-lights': 'restore', breaker: 'invented', 'upper-lights': 'restore', receiver: 'copy' },
      records: ['voices', 'service'], lighting: '100', kind: 'choice', next: 'breaker', completed: 2 }
  ];
  for (const [index, candidate] of cases.entries()) {
    let game = fixture(`relay-lighting-forged-${index}`);
    Object.assign(encounter(game), { choices: candidate.choices });
    encounter(game).story.readRecords = candidate.records;
    const before = holdings(game);
    game = Game.fromSave(game.serialize());
    assert.equal(power(game).key, candidate.lighting);
    assert.equal(game._expeditionSurface().combatLayout.siteLighting.key, candidate.lighting);
    target(game, candidate.kind, candidate.next);
    assert.equal(status(game).completedTasks, candidate.completed);
    assert.equal(status(game).phase, 'quiet'); assert.equal(status(game).completed, false);
    assert.equal(storyThreats(encounter(game)).length, 0);
    assert.ok(encounter(game).monsters.every(actor => actor.quietEarthDormant && actor.hidden));
    assert.deepEqual(holdings(game), before);
  }
});

test('physical exit clears Relay Nine looping policy even if a caller still holds a projected corridor surface', () => {
  const game = fixture('relay-lighting-music-exit');
  const projected = game._expeditionSurface();
  const director = new MusicDirector({ cues: MUSIC_CUES, themeId: THEME_ID });
  const inside = musicContext({ game, playing: true, surface: projected });
  assert.equal(director.update(inside, 0).loop, true);
  const exit = entity(game, 'siteExit');
  Object.assign(game.state.person, { x: exit.x, y: exit.y });
  ok(game.exitSite());
  assert.equal(game._expeditionSurface(), null);
  const staleSurfaceContext = musicContext({ game, playing: true, surface: projected });
  assert.equal(staleSurfaceContext.loopCorridor, false);
  const outdoors = generateSurface(game.currentBody, game.state.seed, game.state.flags);
  const outside = musicContext({ game, playing: true, surface: outdoors });
  assert.equal(outside.loopCorridor, false); assert.notEqual(outside.musicPlace, 'long-corridor');
  director.update(outside, 1);
  const settled = director.update(outside, 3);
  assert.equal(settled.loop, false); assert.notEqual(settled.cueId, MORROW_FLIGHTLINE.id);
});
