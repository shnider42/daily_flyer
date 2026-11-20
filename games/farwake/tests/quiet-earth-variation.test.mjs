import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { explorationLocation, createSiteState } from '../dist/exploration.mjs';
import { generateSurface, isWalkable, movePerson } from '../dist/surface.mjs';
import { createQuietEarthCorridorPlan } from '../dist/quiet-earth-layouts.mjs';
import { stepQuietEarthEncounter } from '../dist/quiet-earth-rules.mjs';
import { storySurfaceView } from '../dist/expedition-story-rules.mjs';
import { musicContext, classifyMusicEvent } from '../dist/music-context.mjs';
import { createQuietEarthPresentation, drawQuietEarthPresentation } from '../dist/quiet-earth-presentation.mjs';

const point = (x, y) => ({ x: (x + .5) * 24, y: (y + .5) * 24 });
const ok = result => { assert.equal(result?.ok, true, result?.reason); return result; };
const cell = (surface, p) => Math.floor(p.y / 24) * surface.cols + Math.floor(p.x / 24);
function routes(surface) {
  const start = cell(surface, surface.spawn), parents = new Map([[start, null]]), queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i], x = current % surface.cols, y = Math.floor(current / surface.cols);
    for (const [xx, yy] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const next = yy * surface.cols + xx, at = point(xx, yy);
      if (xx < 0 || yy < 0 || xx >= surface.cols || yy >= surface.rows || parents.has(next) || !isWalkable(surface, at.x, at.y)) continue;
      parents.set(next, current); queue.push(next);
    }
  }
  return parents;
}
function path(surface, parents, to) {
  const steps = [];
  for (let at = cell(surface, to); parents.get(at) !== null; at = parents.get(at)) {
    assert.ok(parents.has(at)); steps.push(point(at % surface.cols, Math.floor(at / surface.cols)));
  }
  return steps.reverse();
}
function fixture(seed) {
  const game = new Game(seed, { startMode: 'casual', startSystemId: 'hearth' });
  const body = game.system.bodies.find(value => value.id === 'morrow');
  Object.assign(game.state.ship, { x: body.x, y: body.y + body.radius + 60, vx: 0, vy: 0 }); ok(game.dock(body.id));
  const entrance = generateSurface(body, seed).entities.find(item => item.data?.siteId === 'relay-nine');
  Object.assign(game.state.person, { x: entrance.x, y: entrance.y }); ok(game.enterSite('relay-nine'));
  return game;
}

test('seeded passage networks vary while every released floor and required route stays open', () => {
  const geometries = new Set();
  for (let i = 0; i < 16; i++) {
    const seed = `annex-survey-${i}`, location = explorationLocation({ id: 'morrow', kind: 'planet' }, 'relay-nine', seed);
    const surface = generateSurface(location, seed), parents = routes(surface);
    geometries.add(JSON.stringify(surface.tiles));
    assert.deepEqual(location.site.corridorPlan, createQuietEarthCorridorPlan(seed));
    const legacy = generateSurface({ ...location, site: { ...location.site, corridorPlan: null,
      records: location.site.records.filter(record => !record.optional) } }, seed);
    for (let y = 0; y < legacy.rows; y++) for (let x = 0; x < legacy.cols; x++) {
      const at = point(x, y);
      if (isWalkable(legacy, at.x, at.y)) assert.ok(isWalkable(surface, at.x, at.y), `${seed} closed released floor ${x},${y}`);
    }
    assert.equal(surface.entities.filter(item => item.type === 'siteRecord').length, 7);
    for (const target of [...surface.entities, ...location.site.hostiles]) {
      assert.ok(parents.has(cell(surface, target)), `${seed}: ${target.id} is unreachable`);
    }
    const receiver = surface.entities.find(item => item.data?.choiceId === 'receiver');
    assert.ok(path(surface, parents, receiver).length > 250, 'Side routes must not shortcut the authored long outward journey.');
    if (i === 0) {
      const target = surface.entities.find(item => item.data?.recordId === 'collective-copy'), walker = { ...surface.spawn, speed: 120, radius: 6 };
      for (const to of path(surface, parents, target)) {
        movePerson(surface, walker, Math.abs(to.x - walker.x) < .001 ? 0 : Math.sign(to.x - walker.x), Math.abs(to.y - walker.y) < .001 ? 0 : Math.sign(to.y - walker.y), .2);
        assert.ok(Math.hypot(walker.x - to.x, walker.y - to.y) < .001, 'A real actor can traverse the branch route.');
      }
    }
  }
  assert.equal(geometries.size, 16, 'The seed changes physical passages, not just props or text.');
});

test('all seeded false starts remain harmless, one-time, and silent to the combat score', () => {
  const game = fixture('annex-harmless'), surface = game._expeditionSurface(), state = game.state.exploration.encounter;
  state.choices['check-in'] = 'begin';
  const health = state.monsters.map(actor => actor.health), events = [];
  for (const cue of surface.site.corridorPlan.cues) {
    Object.assign(game.state.person, { x: cue.x, y: cue.y });
    stepQuietEarthEncounter(state, [game.explorationParticipant()], .1, surface, (type, detail) => events.push({ type, ...detail }));
    const count = events.length;
    stepQuietEarthEncounter(state, [game.explorationParticipant()], .1, surface, (type, detail) => events.push({ type, ...detail }));
    assert.equal(events.length, count);
    const context = musicContext({ game, playing: true, surface });
    assert.equal(context.observedThreat, false); assert.equal(context.combat, false); assert.equal(context.emergency, false); assert.equal(context.pursuit, false);
    for (const event of events) assert.equal(classifyMusicEvent(event, context), null);
  }
  assert.equal(events.length, surface.site.corridorPlan.cues.length);
  assert.ok(events.every(event => event.harmless && event.phase === 'quiet' && !Object.hasOwn(event, 'damage')));
  assert.deepEqual(state.monsters.map(actor => actor.health), health);
  assert.ok(state.monsters.every(actor => actor.hidden && actor.quietEarthDormant && !actor.alert));
  const restored = createSiteState(surface.site, state), again = [];
  for (const cue of surface.site.corridorPlan.cues) {
    Object.assign(game.state.person, { x: cue.x, y: cue.y });
    stepQuietEarthEncounter(restored, [game.explorationParticipant()], .1, surface, (...args) => again.push(args));
  }
  assert.equal(again.length, 0);
});

test('archive passage illumination follows its existing relay and cannot reveal a neighbouring unpowered wing', () => {
  const location = explorationLocation({ id: 'morrow', kind: 'planet' }, 'relay-nine', 'annex-lights');
  const surface = generateSurface(location, 'annex-lights'), state = createSiteState(location.site);
  state.choices = { 'check-in': 'begin', 'intake-lights': 'restore' };
  const lit = storySurfaceView(surface, state), zones = lit.combatLayout.siteLighting.zones;
  assert.ok(zones.some(zone => zone.id === 'stores'));
  assert.ok(!zones.some(zone => ['archive', 'service'].includes(zone.id)));
  assert.equal(lit.combatLayout.walkable, surface.combatLayout.walkable);
});

test('the original quiet corridor track remains selected throughout every annex and optional evidence room', () => {
  const game = fixture('annex-music-bounds'), surface = game._expeditionSurface();
  const targets = [...surface.site.corridorPlan.wings.flatMap(wing => wing.nodes), ...surface.site.corridorPlan.evidenceAnchors];
  for (const target of targets) {
    Object.assign(game.state.person, point(target.x, target.y));
    const context = musicContext({ game, playing: true, surface });
    assert.equal(context.musicPlace, 'long-corridor', `The quiet cue stopped at ${target.x},${target.y}`);
    assert.equal(context.loopCorridor, true); assert.equal(context.observedThreat, false);
  }
});

test('new machinery visibly starts, stalls and settles, while reduced motion preserves the settled clue', () => {
  const location = explorationLocation({ id: 'morrow', kind: 'planet' }, 'relay-nine', 'annex-presenter');
  const surface = generateSurface(location, 'annex-presenter'), cue = surface.site.corridorPlan.cues.find(item => item.id === 'relay-stutter');
  const presenter = createQuietEarthPresentation(), id = `${surface.id}:quiet-earth:${cue.id}`;
  assert.equal(presenter.receive({ type: 'quiet-earth-beat', id, siteId: surface.id, beatId: cue.id }, 1), true);
  const render = (time, reduceMotion = false) => {
    const ops = [], ctx = { canvas: { width: 100, height: 90 }, globalAlpha: 1, save() {}, restore() {},
      fillRect(x, y, w, h) { ops.push({ color: this.fillStyle, x, y, w, h, alpha: this.globalAlpha }); } };
    drawQuietEarthPresentation(ctx, surface, { layer: 'floor', cameraX: cue.x - 48, cameraY: cue.y - 52, width: 100, height: 90,
      exploration: { quietEarth: { cues: [cue.id] } }, presentation: presenter.sample(time, { siteId: surface.id }), reduceMotion });
    return ops;
  };
  const on = render(1.3), stalled = render(2.2), restarted = render(4.8), reducedA = render(4.8, true), reducedB = render(5.2, true);
  assert.ok(on.some(op => op.color === '#9eb9a4'));
  assert.ok(!stalled.some(op => op.color === '#9eb9a4'));
  assert.ok(restarted.some(op => op.color === '#9eb9a4'));
  assert.deepEqual(reducedA, reducedB);
});
