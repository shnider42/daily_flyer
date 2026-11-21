import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { explorationSites } from '../dist/exploration.mjs';
import { generateSurface, isWalkable, movePerson, drawSurfaceMap } from '../dist/surface.mjs';
import { storyStatus, storyThreats, storySurfaceView, inspectStoryChoice } from '../dist/expedition-story-rules.mjs';
import { musicContext } from '../dist/music-context.mjs';
import { MusicDirector } from '../dist/music-director.mjs';
import { MUSIC_CUES, THEME_ID } from '../dist/music-catalog.mjs';
import { MORROW_FLIGHTLINE } from '../dist/recorded-theme.mjs';

const ok = result => { assert.equal(result?.ok, true, result?.reason); return result; };
const point = (x, y) => ({ x: (x + .5) * 24, y: (y + .5) * 24 });

function fixture(seed = 'quiet-earth-acceptance') {
  const game = new Game(seed, { startMode: 'casual', startSystemId: 'hearth' });
  const body = game.system.bodies.find(value => value.id === 'morrow');
  Object.assign(game.state.ship, { x: body.x, y: body.y + body.radius + 60, vx: 0, vy: 0 });
  ok(game.dock(body.id));
  const outdoors = generateSurface(body, seed, game.state.flags);
  const entrances = outdoors.entities.filter(entity => entity.type === 'siteEntrance' && entity.data.siteId === 'relay-nine');
  assert.equal(entrances.length, 1, 'Relay Nine keeps a single existing surface entrance.');
  Object.assign(game.state.person, { x: entrances[0].x, y: entrances[0].y });
  ok(game.enterSite('relay-nine'));
  game.drainEvents();
  return { game, body, outdoors, surface: game._expeditionSurface(), site: game.state.interior.location.site };
}

function entity(game, kind, id) {
  const item = game._expeditionSurface().entities.find(value => value.type === kind &&
    (!id || value.data.recordId === id || value.data.choiceId === id || value.data.cacheId === id));
  assert.ok(item, `Missing physical ${kind} ${id || ''}`);
  return item;
}

function act(game, kind, id, action, option) {
  const item = entity(game, kind, id);
  Object.assign(game.state.person, { x: item.x, y: item.y });
  return game.siteAction(item.id, action, option);
}

function activateReceiver(game) {
  ok(act(game, 'siteChoice', 'check-in', 'choose', 'begin'));
  ok(act(game, 'siteRecord', 'voices', 'inspect'));
  ok(act(game, 'siteChoice', 'breaker', 'choose', 'restore'));
  ok(act(game, 'siteRecord', 'service', 'inspect'));
  ok(act(game, 'siteChoice', 'receiver', 'choose', 'copy'));
}

function route(surface, from, to) {
  const cell = position => Math.floor(position.y / 24) * surface.cols + Math.floor(position.x / 24);
  const start = cell(from), goal = cell(to), parents = new Map([[start, null]]), queue = [start];
  for (let i = 0; i < queue.length && !parents.has(goal); i++) {
    const current = queue[i], x = current % surface.cols, y = Math.floor(current / surface.cols);
    for (const [xx, yy] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const next = yy * surface.cols + xx, position = point(xx, yy);
      if (xx < 0 || yy < 0 || xx >= surface.cols || yy >= surface.rows || parents.has(next) || !isWalkable(surface, position.x, position.y, 6)) continue;
      parents.set(next, current); queue.push(next);
    }
  }
  if (!parents.has(goal)) return null;
  const path = [];
  for (let next = goal; next !== start; next = parents.get(next)) path.push(point(next % surface.cols, Math.floor(next / surface.cols)));
  return path.reverse();
}

test('Relay Nine has a long physical route through every required interaction and back to its open exit', () => {
  const { game, body, site, surface } = fixture('quiet-earth-geometry');
  assert.equal(site.quietEarth, true);
  assert.equal(explorationSites(body).filter(value => value.id === 'relay-nine').length, 1);
  assert.equal(site.tileX, 68); assert.equal(site.tileY, 69);
  for (const item of [...surface.entities, ...game.state.exploration.encounter.monsters]) {
    assert.ok(isWalkable(surface, item.x, item.y, 6), `${item.id} is on a blocked tile.`);
    assert.ok(route(surface, surface.spawn, item), `${item.id} cannot be reached from the entrance.`);
  }
  const receiver = entity(game, 'siteChoice', 'receiver'), path = route(surface, surface.spawn, receiver);
  assert.ok(path.length > 250, `The receiver is only ${path.length} tiles away; a shortcut bypasses the long corridor.`);
  const walker = { ...surface.spawn, speed: 120, radius: 6 };
  for (const position of path) {
    const dx = Math.abs(position.x - walker.x) < .001 ? 0 : Math.sign(position.x - walker.x);
    const dy = Math.abs(position.y - walker.y) < .001 ? 0 : Math.sign(position.y - walker.y);
    movePerson(surface, walker, dx, dy, .2);
    assert.ok(Math.hypot(walker.x - position.x, walker.y - position.y) < .001, 'Real movement must follow the same corridor as the route search.');
  }
  const exit = entity(game, 'siteExit');
  assert.ok(route(surface, receiver, exit).length > 250);
});

test('solo interaction enforces physical proximity and order, then exposes an escape objective without a kill requirement', () => {
  const { game, surface, site } = fixture('quiet-earth-solo-gates');
  const receiver = entity(game, 'siteChoice', 'receiver'), encounter = game.state.exploration.encounter;
  const initial = JSON.stringify(encounter);
  assert.equal(game.siteAction(receiver.id, 'choose', 'copy').code, 'distance');
  assert.equal(JSON.stringify(encounter), initial, 'A remote action cannot start the ambush.');
  assert.equal(act(game, 'siteChoice', 'receiver', 'choose', 'copy').ok, false);
  assert.equal(storyThreats(encounter).length, 0);
  const before = game.state.credits;
  activateReceiver(game);
  assert.ok(storyThreats(encounter).length > 0);
  const status = storyStatus(encounter, site);
  assert.equal(status.nextTargetId, `${site.key}:choice:evacuate`);
  assert.match(status.objective, /back|entry|escape/i);
  assert.match(status.objective + ' ' + status.pendingSummary, /do not have to kill|don't have to kill|without.*kill|no need to kill/i);
  assert.ok(encounter.monsters.every(monster => monster.health > 0));
  const captainShots = [];
  const seal = entity(game, 'siteChoice', 'evacuate');
  for (const position of route(surface, game.state.person, seal)) {
    const dx = Math.abs(position.x - game.state.person.x) < .001 ? 0 : Math.sign(position.x - game.state.person.x);
    const dy = Math.abs(position.y - game.state.person.y) < .001 ? 0 : Math.sign(position.y - game.state.person.y);
    const dt = 24 / game.state.person.speed;
    movePerson(surface, game.state.person, dx, dy, dt);
    game.stepExploration(dt, {});
    captainShots.push(...game.drainEvents().filter(event => event.type === 'person-shot' && event.attackerId === game.playerId));
    assert.ok(game.state.person.health > 0, 'A healthy captain must be able to escape at normal walking speed without firing.');
  }
  const reward = ok(game.siteAction(seal.id, 'choose', 'seal'));
  assert.equal(game.state.credits, before + (reward.credits || 0));
  assert.equal(storyStatus(encounter, site).completed, true);
  assert.equal(captainShots.length, 0, 'The captain escaped without firing.');
  assert.ok(encounter.monsters.some(monster => monster.health > 0), 'Sealing the entry resolves escape with living pursuers; an ember mite can expend itself during its own attack.');
  assert.equal(storyThreats(encounter).length, 0);
  const exit = surface.entities.find(value => value.type === 'siteExit');
  Object.assign(game.state.person, { x: exit.x, y: exit.y });
  ok(game.exitSite());
  assert.equal(game.state.locationId, 'morrow');
  assert.equal(game.state.exploration, null);
});

test('the entrance remains usable during an unfinished ambush and returning does not erase progress', () => {
  const { game } = fixture('quiet-earth-retreat');
  activateReceiver(game);
  const active = game.state.exploration, living = active.encounter.monsters.filter(monster => monster.health > 0).length;
  assert.ok(living > 0);
  const exit = entity(game, 'siteExit');
  Object.assign(game.state.person, { x: exit.x, y: exit.y });
  ok(game.exitSite());
  ok(game.enterSite('relay-nine'));
  assert.equal(game.state.exploration.encounter.choices.receiver, 'copy');
  assert.equal(game.state.exploration.encounter.monsters.filter(monster => monster.health > 0).length, living);
  assert.equal(storyStatus(game.state.exploration.encounter, game.state.interior.location.site).completed, false);
});

test('the corridor uses Morrow Flightline while quiet and changes to danger only after the revealed attack', () => {
  const { game, surface } = fixture('quiet-earth-score');
  const context = () => musicContext({ game, playing: true, surface: game._expeditionSurface() });
  const quiet = context(), director = new MusicDirector({ cues: MUSIC_CUES, themeId: THEME_ID });
  assert.equal(quiet.musicPlace, 'long-corridor');
  assert.equal(quiet.observedThreat, false);
  director.update(quiet, 0);
  assert.equal(director.update(quiet, 4).cueId, MORROW_FLIGHTLINE.id);
  const record = entity(game, 'siteRecord', 'voices');
  Object.assign(game.state.person, { x: record.x, y: record.y });
  game.stepExploration(.1, {});
  assert.equal(context().observedThreat, false);
  activateReceiver(game);
  // Real encounter stepping establishes a locally visible pursuer and its target;
  // no synthetic combat flag is supplied to the score.
  for (let tick = 0; tick < 20 && !context().observedThreat; tick++) game.stepExploration(.1, {});
  const danger = context();
  assert.equal(danger.observedThreat, true);
  assert.equal(director.update(danger, 5).mood, 'combat');
  ok(act(game, 'siteChoice', 'evacuate', 'choose', 'seal'));
  assert.equal(context().observedThreat, false);
  assert.ok(isWalkable(surface, game.state.person.x, game.state.person.y));
});

test('legacy Relay Nine saves keep their claimed signal buffer and restore inside the new reachable interior', () => {
  const { game } = fixture('quiet-earth-legacy-save');
  const key = game.state.exploration.key;
  const legacy = { id: 'morrow:site:relay-nine', siteId: 'relay-nine', time: 7, shotSerial: 0, visited: 2,
    monsters: [], collected: ['signal-buffer'], choices: {}, actorCooldowns: {}, cleared: true };
  game.state.explorationRecords[key] = legacy;
  game.state.exploration.encounter = legacy;
  Object.assign(game.state.person, point(25, 18));
  const before = { credits: game.state.credits, crystal: game.state.cargo.crystal };
  const restored = Game.fromSave(game.serialize()), surface = restored._expeditionSurface();
  assert.equal(restored.state.exploration.siteId, 'relay-nine');
  assert.equal(surface.site.quietEarth, true);
  assert.deepEqual({ x: restored.state.person.x, y: restored.state.person.y }, surface.spawn,
    'An active legacy Relay Nine save starts the new route safely at intake.');
  assert.ok(isWalkable(surface, restored.state.person.x, restored.state.person.y));
  assert.ok(route(surface, restored.state.person, entity(restored, 'siteExit')));
  assert.ok(restored.state.exploration.encounter.collected.includes('signal-buffer'));
  assert.equal(act(restored, 'siteCache', 'signal-buffer', 'collect').ok, false);
  assert.deepEqual({ credits: restored.state.credits, crystal: restored.state.cargo.crystal }, before);
  assert.equal(storyThreats(restored.state.exploration.encounter).length, 0, 'A legacy clear flag does not trigger the new attack.');
  const continuedAt = point(40, 73);
  assert.ok(isWalkable(surface, continuedAt.x, continuedAt.y));
  Object.assign(restored.state.person, continuedAt);
  const continued = Game.fromSave(restored.serialize());
  assert.deepEqual({ x: continued.state.person.x, y: continued.state.person.y }, continuedAt,
    'A save already using the new corridor keeps its actual position on subsequent loads.');
  assert.ok(continued.state.exploration.encounter.collected.includes('signal-buffer'));
});

test('a downed solo captain cannot advance the receiver', () => {
  const { game } = fixture('quiet-earth-incapacitated');
  ok(act(game, 'siteChoice', 'check-in', 'choose', 'begin'));
  ok(act(game, 'siteRecord', 'voices', 'inspect'));
  ok(act(game, 'siteChoice', 'breaker', 'choose', 'restore'));
  ok(act(game, 'siteRecord', 'service', 'inspect'));
  const receiver = entity(game, 'siteChoice', 'receiver');
  Object.assign(game.state.person, { x: receiver.x, y: receiver.y, health: 0, down: true });
  const before = JSON.stringify(game.state.exploration.encounter);
  assert.equal(game.siteAction(receiver.id, 'choose', 'copy').ok, false);
  assert.equal(JSON.stringify(game.state.exploration.encounter), before);
});

test('the entry panel and chart keep future escape actions private until they are needed', () => {
  const { game, surface } = fixture('quiet-earth-unrevealed-tasks'), state = game.state.exploration.encounter;
  const seal = entity(game, 'siteChoice', 'evacuate'), cache = entity(game, 'siteCache', 'signal-buffer');
  assert.equal(act(game, 'siteChoice', 'evacuate', 'inspect').ok, false, 'A direct request cannot interact with the unrevealed marker.');
  const dormant = ok(inspectStoryChoice(state, surface.site, 'evacuate'));
  assert.deepEqual(dormant.choice.options, []);
  assert.equal(dormant.text, 'The door panel is on standby. The outside door is open.');
  assert.equal(dormant.resolutionText, null);
  assert.equal(dormant.choice.requireChoices, undefined, 'Inspection does not expose the later dependency or outcome.');
  const quiet = storySurfaceView(surface, state);
  assert.equal(quiet.entities.find(e => e.id === seal.id).hidden, true);
  assert.equal(quiet.entities.find(e => e.id === cache.id).hidden, true);
  assert.notEqual(quiet.entities.find(e => e.type === 'siteExit').hidden, true);
  assert.notEqual(game._expeditionMap.value.entities.find(e => e.id === seal.id).hidden, true, 'The projection does not mutate authority geometry.');
  const ctx = { canvas: { width: 720, height: 500 }, fillRect() {}, save() {}, restore() {}, setTransform() {} };
  const map = () => drawSurfaceMap(ctx, surface, { person: game.state.person, exploration: state });
  assert.ok(!map().markers.some(marker => [seal.id, cache.id].includes(marker.id)));
  assert.ok(map().markers.some(marker => marker.kind === 'exit'));
  activateReceiver(game);
  const active = storySurfaceView(quiet, state);
  assert.equal(active.entities.find(e => e.id === seal.id).hidden, false, 'A previously projected surface unlocks the newly needed control.');
  assert.equal(active.entities.find(e => e.id === cache.id).hidden, true);
  const unlocked = ok(act(game, 'siteChoice', 'evacuate', 'inspect'));
  assert.equal(unlocked.choice.options.length, 1);
  assert.equal(unlocked.choice.options[0].disabled, false);
  assert.ok(map().markers.some(marker => marker.id === seal.id));
  ok(game.siteAction(seal.id, 'choose', 'seal'));
  assert.ok(map().markers.some(marker => marker.id === cache.id), 'The paid recovery appears after the recording is returned.');
});
