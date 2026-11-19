import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { generateSurface, isWalkable } from '../dist/surface.mjs';
import { getPersonalWeapon } from '../dist/combat.mjs';
import { personalFireLayout, personalFireUsesShipStation } from '../dist/personal-fire.mjs';
import { musicContext, classifyMusicEvent } from '../dist/music-context.mjs';

const ok = value => { assert.equal(value?.ok, true, value?.reason); return value; };
const point = (x, y) => ({ x: (x + .5) * 24, y: (y + .5) * 24 });
function landed(seed = 'free-fire') {
  const game = new Game(seed, { startMode: 'casual', startSystemId: 'hearth' });
  game.system.enemies = []; game.system.bullets = []; game.system.signals = [];
  const body = game.system.bodies.find(value => value.id === 'morrow');
  Object.assign(game.state.ship, { x: body.x, y: body.y + body.radius + 60, vx: 0, vy: 0 });
  ok(game.dock(body.id)); game.drainEvents();
  return game;
}
function relay() {
  const game = landed(), outside = generateSurface(game.currentBody, game.state.seed, game.state.flags);
  const entry = outside.entities.find(value => value.type === 'siteEntrance' && value.data.siteId === 'relay-nine');
  Object.assign(game.state.person, { x: entry.x, y: entry.y });
  ok(game.enterSite('relay-nine')); game.drainEvents();
  return game;
}
function action(game, type, id, command, option) {
  const entity = game._expeditionSurface().entities.find(value => value.type === type && (value.data.choiceId === id || value.data.recordId === id));
  assert.ok(entity); Object.assign(game.state.person, { x: entity.x, y: entity.y });
  return ok(game.siteAction(entity.id, command, option));
}

test('the quiet corridor accepts directional blank shots before check-in without waking or targeting dormant actors', () => {
  const game = relay(), state = game.state.exploration.encounter;
  assert.equal(game.state.person.weaponDrawn, true, 'The weapon is ready on arrival, before any encounter tick.');
  const dormant = state.monsters[0], health = state.monsters.map(value => value.health);
  Object.assign(game.state.person, { x: dormant.x + 48, y: dormant.y, facing: 'left' });
  assert.ok(isWalkable(game._expeditionSurface(), game.state.person.x, game.state.person.y));
  game.stepExploration(.1, { fire: true, aiming: true, aimX: -1, aimY: 0 });
  const shot = game.drainEvents().find(value => value.type === 'person-shot');
  assert.ok(shot); assert.equal(shot.hit, false); assert.equal(shot.targetId, null); assert.equal(shot.damage, 0);
  assert.ok(shot.to.x < shot.from.x); assert.equal(game.state.person.aimManual, true);
  assert.deepEqual(state.monsters.map(value => value.health), health);
  assert.ok(state.monsters.every(value => value.quietEarthDormant && value.hidden));
  assert.deepEqual(state.choices, {}); assert.equal(state.quietEarth.ambushAnnounced, false);
  const score = musicContext({ game, playing: true, surface: game._expeditionSurface() });
  assert.equal(score.observedThreat, false); assert.equal(classifyMusicEvent(shot, score), null, 'A nervous blank shot cannot announce combat through the score.');
  game.stepExploration(.01, { fire: true });
  assert.equal(game.drainEvents().some(value => value.type === 'person-shot'), false, 'Blank shots use normal recharge.');
  assert.equal(game.state.stats.personShots, 1); assert.equal(game.state.stats.personHits || 0, 0);
});

test('a confirmed corridor hit interrupts pursuit briefly without a kill requirement', () => {
  const game = relay();
  action(game, 'siteChoice', 'check-in', 'choose', 'begin');
  action(game, 'siteRecord', 'voices', 'inspect');
  action(game, 'siteChoice', 'breaker', 'choose', 'restore');
  action(game, 'siteRecord', 'service', 'inspect');
  action(game, 'siteChoice', 'receiver', 'choose', 'copy');
  const state = game.state.exploration.encounter, target = state.monsters[0];
  for (const other of state.monsters.slice(1)) other.health = 0;
  Object.assign(game.state.person, point(112, 20)); Object.assign(target, point(116, 20), { windup: .1 });
  game.drainEvents();
  game.stepExploration(.1, { fire: true, aiming: true, aimX: 1, aimY: 0 });
  assert.ok(game.drainEvents().some(value => value.type === 'person-hit' && value.targetId === target.id));
  assert.ok(target.health > 0); const x = target.x, y = target.y;
  assert.equal(target.windup, 0); assert.equal(target.moving, false);
  game.stepExploration(.2, {});
  assert.deepEqual({ x: target.x, y: target.y }, { x, y });
  game.stepExploration(.25, {});
  assert.ok(Math.hypot(target.x - x, target.y - y) > 0, 'The pause buys room; it does not permanently pacify the pursuer.');
});

test('solo ports and peaceful cabins accept normal pulses, trace walls, and never select residents', () => {
  const game = landed(), surface = generateSurface(game.currentBody, game.state.seed, game.state.flags);
  game._surfaceForInteraction = () => surface;
  const residents = JSON.stringify(surface.entities);
  game.step(.1, { fire: true, aiming: true, aimX: 1, aimY: 0 });
  let shot = game.drainEvents().find(value => value.type === 'person-shot');
  assert.ok(shot); assert.equal(shot.siteId, surface.id); assert.equal(shot.hit, false); assert.equal(shot.targetId, null);
  assert.equal(JSON.stringify(surface.entities), residents);
  game.step(.1, { fire: true }); assert.equal(game.drainEvents().some(value => value.type === 'person-shot'), false);
  assert.equal(personalFireLayout(surface), personalFireLayout(surface), 'The large port map is compiled once.');

  const cabin = new Game('quiet-cabin'); cabin.system.enemies = []; cabin.system.signals = [];
  ok(cabin.enterCabin()); cabin.drainEvents();
  cabin.step(.1, { fire: true, aiming: true, aimX: -1, aimY: 0 });
  shot = cabin.drainEvents().find(value => value.type === 'person-shot');
  assert.ok(shot); assert.equal(shot.blocked, true); assert.equal(shot.hit, false);
  assert.ok(Math.hypot(shot.to.x - shot.from.x, shot.to.y - shot.from.y) < getPersonalWeapon(cabin.state.person).range);
});

test('incapacitation and a staffed ship gun prevent duplicate personal pulses', () => {
  const game = landed(), surface = generateSurface(game.currentBody, game.state.seed, game.state.flags);
  game.state.person.down = true;
  assert.equal(game.stepPersonalFreeFire(.1, { fire: true }, surface), null);
  game.state.person.down = false; game.state.stationView = 'gunnery';
  assert.equal(game.stepPersonalFreeFire(.1, { fire: true }, surface), null);
  assert.equal(game.drainEvents().some(value => value.type === 'person-shot'), false);
  game.state.stationView = null;
  game.state.multiplayer = { crewRole: 'weapons', weaponsAllowed: true };
  const station = { ...surface, entities: [{ x: game.state.person.x, y: game.state.person.y, data: { stationRole: 'security' } }] };
  assert.equal(personalFireUsesShipStation(game, station), true);
  assert.equal(game.stepPersonalFreeFire(.1, { fire: true }, station), null);
  game.state.boarding = { phase: 'active' };
  assert.equal(personalFireUsesShipStation(game, station), false, 'Boarders switch the console back to personal deck defense.');
  assert.equal(game.stepPersonalFreeFire(.1, { fire: true }, station), null, 'The existing boarding authority owns that shot.');
  game.state.boarding = null;
  game.state.person.x += 60;
  assert.equal(personalFireUsesShipStation(game, station), false);
  assert.ok(game.stepPersonalFreeFire(.1, { fire: true }, station));
});
