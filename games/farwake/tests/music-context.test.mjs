import test from 'node:test';
import assert from 'node:assert/strict';
import { musicContext, classifyMusicEvent } from '../dist/music-context.mjs';
import { Game } from '../dist/engine.mjs';
import { Realm } from '../server/realm.mjs';
import { placeRaider } from './helpers/combat-fixtures.mjs';

function fixture() {
  const ship = { id: 'cinder', x: 0, y: 0, damageControl: { clock: 10, sections: [], impacts: [] } };
  return {
    playerId: 'captain', state: { seed: 'music', systemId: 'hearth', mode: 'ship', locationId: null,
      ship, person: { x: 50, y: 60, health: 100 }, stats: { time: 100 }, activityTokens: [] },
    currentSystem: { faction: 'freewake' }, currentBody: null,
    system: { enemies: [], bullets: [], bodies: [] }
  };
}
const read = (game, extra = {}) => musicContext({ game, playing: true, now: 50, ...extra });

test('the adapter is read-only on a real new voyage and menu/pause are distinct', () => {
  const game = new Game('music-context-real'), before = game.serialize();
  assert.equal(musicContext({ game }).scene, 'menu');
  assert.equal(read(game).scene, 'exploration');
  const solo = read(game, { dialogOpen: true, dialogKind: 'settings' });
  assert.equal(solo.scene, 'exploration');
  assert.equal(solo.paused, true);
  assert.equal(solo.dialogue, false);
  assert.equal(read(game, { dialogOpen: true, dialogKind: 'npc' }).dialogue, true);
  assert.equal(read(game, { dialogOpen: true, network: { passport: { captainId: 'shared' } } }).paused, false);
  assert.equal(read(game, { hidden: true }).silence, true);
  assert.equal(game.serialize(), before);
});

test('distant enemies, darkness, low health and planned crew attacks cannot reveal danger', () => {
  const game = fixture();
  game.state.person.health = 3;
  game.system.enemies.push({ id: 'unseen', hp: 100, active: true, x: 20, y: 20 });
  game.state.npcContract = { active: true, version: 2, vesselId: 'cinder', assignment: { complication: { type: 'attack', started: false, resolved: false } } };
  const value = read(game, { surface: { atmosphere: 'theatre', darkness: true } });
  assert.equal(value.observedThreat, false);
  assert.equal(value.emergency, false);
  assert.equal(value.tension, false);
  assert.equal(value.terror, false);
  game.state.exploration = { encounter: { monsters: [{ health: 99, alert: true }] } };
  assert.equal(read(game).observedThreat, false);
});

test('an already visible target creates tension, while an incoming local projectile creates combat', () => {
  const game = fixture();
  const target = read(game, { perceivedThreat: true });
  assert.equal(target.tension, true);
  assert.equal(target.observedThreat, false);
  const projectile = { ttl: 1, targetId: 'someone-else', ownerId: 'raider', x: 60, y: 0 };
  game.system.bullets.push(projectile);
  assert.equal(read(game).observedThreat, false);
  projectile.targetId = 'captain'; projectile.x = 600;
  assert.equal(read(game).observedThreat, false);
  projectile.x = 80;
  assert.equal(read(game).observedThreat, true);
  game.state.mode = 'person'; game.state.locationId = 'morrow';
  assert.equal(read(game).observedThreat, false, 'ship shots do not score someone walking ashore');
});

test('ship impacts and emergencies follow the occupied vessel, including hired/shared decks', () => {
  const game = fixture();
  game.state.ship.damageControl.impacts = [{ at: 9.5, strength: .2 }];
  assert.equal(read(game).observedThreat, true);
  game.state.ship.damageControl.clock = 20;
  assert.equal(read(game).observedThreat, false, 'stale snapshots do not hold danger forever');
  game.state.ship.damageControl.sections = [{ fire: 20 }];
  assert.equal(read(game).emergency, true);
  game.state.mode = 'person'; game.currentBody = { id: 'morrow', kind: 'planet' };
  assert.equal(read(game).emergency, false, 'parked personal ship is outside this scene');
  game.state.interior = { kind: 'ship' };
  const employer = { id: 'employer', damageControl: { clock: 2, sections: [], impacts: [] } };
  assert.equal(read(game, { deckHull: employer }).emergency, false);
  employer.damageControl.sections.push({ breach: 5 });
  assert.equal(read(game, { deckHull: employer }).emergency, true);
  assert.equal(read(game, { deckHull: employer }).vesselId, 'employer');
});

test('crew danger starts with the announced complication and resolves with it', () => {
  const game = fixture();
  game.state.mode = 'person'; game.state.interior = { kind: 'ship' };
  const c = { type: 'attack', started: false, resolved: false };
  game.state.npcContract = { active: true, version: 2, vesselId: 'cinder', assignment: { complication: c } };
  assert.equal(read(game).observedThreat, false);
  c.started = true;
  assert.equal(read(game).observedThreat, true);
  c.resolved = true;
  assert.equal(read(game).observedThreat, false);
  c.type = 'illness'; c.resolved = false;
  assert.equal(read(game).emergency, true);
  game.state.interior = null;
  assert.equal(read(game).emergency, false);
});

test('ports, actual nearby people, and third places have social palettes without classifying empty worlds as social', () => {
  const game = fixture(); game.state.mode = 'person';
  game.currentBody = { id: 'morrow', kind: 'planet' };
  assert.equal(read(game).scene, 'exploration');
  const surface = { entities: [{ type: 'npc', x: 75, y: 60 }] };
  assert.equal(read(game, { surface }).scene, 'social');
  surface.entities[0].hidden = true;
  assert.equal(read(game, { surface }).scene, 'exploration');
  game.currentBody = { id: 'kettle', kind: 'station' };
  assert.equal(read(game).scene, 'social');
  game.state.interior = { kind: 'site' };
  game.currentBody = { kind: 'site', site: { kind: 'social', style: 'farm', culture: 'choral' } };
  const social = read(game);
  assert.equal(social.scene, 'social');
  assert.equal(social.culture, 'choral');
  assert.equal(social.locationKind, 'farm');
  assert.equal(social.paletteKey, read(game).paletteKey);
  assert.ok(social.tags.includes('garden'));
  assert.ok(social.tags.includes('choral'));
  assert.ok(social.tags.includes('surface'));
  assert.ok(social.tags.includes('whimsical'));
  game.currentBody.site = { kind: 'clinic' };
  assert.ok(read(game).tags.includes('reflective'));
  assert.ok(!read(game).tags.includes('whimsical'));
});

test('the rare terror permission needs the actual Submerged Stage record reveal and stays scoped to that place', () => {
  const game = fixture(); game.state.mode = 'person';
  game.state.locationId = 'lilt:site:submerged-stage';
  game.state.interior = { kind: 'site' };
  game.currentBody = { id: game.state.locationId, kind: 'site', site: { id: 'submerged-stage', kind: 'theatre' } };
  game.state.exploration = { bodyId: 'lilt', siteId: 'submerged-stage', key: 'hearth:lilt:submerged-stage' };
  assert.equal(read(game).terror, false);
  game.state.activityTokens.push('somewhere-else:explore:record:hearth:lilt:submerged-stage:script');
  assert.equal(read(game).terror, false, 'a token from another location is not the reveal');
  const prefix = `${game.state.systemId}:${game.state.locationId}:explore:record:${game.state.exploration.key}:`;
  game.state.activityTokens.push(prefix + 'script');
  const revealed = read(game);
  assert.equal(revealed.terror, true);
  game.state.activityTokens.push(prefix + 'tickets');
  assert.equal(read(game).terrorKey, revealed.terrorKey, 'second record cannot immediately retrigger the same reveal');
  game.state.exploration = null; game.currentBody = { id: 'lilt', kind: 'planet' };
  assert.equal(read(game).terror, false, 'saved knowledge does not score ordinary life outside');
});

test('future silence and terror cues must be explicitly revealed, and generic scene tags do nothing', () => {
  const game = fixture();
  assert.equal(read(game, { observedCue: { id: 'secret', tag: 'terror' } }).terror, false);
  assert.equal(read(game, { observedCue: { id: 'secret', tag: 'terror', revealed: true } }).terrorKey, 'authored:secret');
  assert.equal(read(game, { observedCue: { tag: 'silence', revealed: true } }).silence, true);
  assert.equal(read(game, { observedCue: { tag: 'silence' } }).silence, false);
});

test('events are scoped to this captain, occupied vessel and actual boarding/site', () => {
  const game = fixture(), context = read(game);
  assert.equal(classifyMusicEvent({ type: 'hit', playerId: 'other', vesselId: 'other-ship', damage: 10 }, context), null);
  assert.equal(classifyMusicEvent({ type: 'hit', playerId: 'captain', vesselId: 'cinder', damage: 10 }, context), 'combat');
  assert.equal(classifyMusicEvent({ type: 'person-hit', targetId: 'captain', damage: 10, siteId: 'other-site' }, context), null);
  assert.equal(classifyMusicEvent({ type: 'enemy-shot', x: 0, y: 0, angle: 0 }, context), null);
  assert.equal(classifyMusicEvent({ type: 'world-active', text: 'An attack is brewing' }, context), null);
  game.state.mode = 'person'; game.state.interior = { kind: 'ship' };
  game.state.boarding = { id: 'our-boarding', phase: 'active' };
  const boarding = read(game);
  assert.equal(classifyMusicEvent({ type: 'person-shot', boardingId: 'other-boarding', team: 'hostile', targetId: 'captain' }, boarding), null);
  assert.equal(classifyMusicEvent({ type: 'person-shot', boardingId: 'our-boarding', team: 'hostile', targetId: 'ally' }, boarding), 'combat');
  assert.equal(classifyMusicEvent({ type: 'boarding-complete', vesselId: 'cinder', phase: 'won' }, boarding), 'recovery');
});

test('shooting into empty space is not a perpetual combat-music switch', () => {
  const game = fixture(); game.state.mode = 'person'; game.state.interior = { kind: 'ship' };
  const context = read(game);
  assert.equal(classifyMusicEvent({ type: 'shot', ownerId: 'captain', vesselId: 'cinder' }, context), null);
  assert.equal(classifyMusicEvent({ type: 'person-shot', attackerId: 'captain', hit: false, targetId: null }, context), null);
  assert.equal(classifyMusicEvent({ type: 'person-shot', attackerId: 'captain', hit: true, blocked: true, targetId: 'raider' }, context), null);
  assert.equal(classifyMusicEvent({ type: 'person-shot', attackerId: 'captain', hit: true, blocked: false, targetId: 'raider' }, context), 'combat');
  assert.equal(classifyMusicEvent({ type: 'hit', vesselId: 'cinder', damage: 0 }, context), null);
  assert.equal(classifyMusicEvent({ type: 'hit', vesselId: 'cinder', damage: 10 }, { ...context, hidden: true }), null);
  assert.equal(classifyMusicEvent({ type: 'scan' }, context), 'discovery');
  assert.equal(classifyMusicEvent({ type: 'salvage' }, context), null, 'ordinary pickups need no automatic fanfare');
});

test('damage to a parked owned ship does not score the owner walking elsewhere', () => {
  const game = fixture(); game.state.mode = 'person';
  const ashore = read(game);
  assert.equal(classifyMusicEvent({ type: 'hit', playerId: 'captain', vesselId: 'cinder', damage: 20 }, ashore), null);
  game.state.interior = { kind: 'ship' };
  const guest = read(game, { deckHull: { id: 'other-deck' } });
  assert.equal(classifyMusicEvent({ type: 'hit', playerId: 'captain', vesselId: 'cinder', damage: 20 }, guest), null);
  assert.equal(classifyMusicEvent({ type: 'hit', playerId: 'other-owner', vesselId: 'other-deck', damage: 20 }, guest), 'combat');
});

test('surface combat accepts the canonical encounter key, not a same-named site on another planet', () => {
  const game = fixture(); game.state.mode = 'person';
  game.state.exploration = { siteId: 'hollow', encounter: { id: 'morrow:site:hollow' } };
  const context = read(game);
  assert.equal(classifyMusicEvent({ type: 'person-hit', siteId: 'morrow:site:hollow', targetId: 'captain', damage: 9 }, context), 'combat');
  assert.equal(classifyMusicEvent({ type: 'person-hit', siteId: 'orchard:site:hollow', targetId: 'captain', damage: 9 }, context), null);
});

test('a real solo incoming pulse and shield-only collision both drive the score with actual engine schemas', () => {
  const game = new Game('music-actual-shield-hit');
  const ship = game.state.ship;
  Object.assign(ship, { x: 0, y: 500, vx: 0, vy: 0, shield: 35 });
  game.system.enemies = []; game.system.bullets = []; game.drainEvents();
  const pulse = { id: 'music-test-pulse', owner: 'pirate', ownerId: 'pirate', vesselId: 'pirate',
    targetId: game.playerId, team: 'hostile', x: ship.x - ship.radius - 20, y: ship.y,
    vx: 500, vy: 0, ttl: 2, damage: 12, radius: 4 };
  game.system.bullets.push(pulse);
  assert.equal(read(game).observedThreat, true, 'the actual nearby targeted projectile is visible before it hits');
  const hull = ship.hull;
  game._updateBullets(.1, [game]);
  const event = game.drainEvents().find(value => value.type === 'hit');
  assert.ok(event, 'the real collision emits a ship hit event');
  assert.equal(event.damage, 12);
  assert.equal(event.vesselId, ship.id);
  assert.equal(event.playerId, game.playerId);
  assert.equal(ship.hull, hull);
  assert.equal(ship.shield, 23);
  assert.equal(ship.damageControl.impacts.at(-1).shieldOnly, true);
  assert.ok(Array.isArray(ship.damageControl.sections));
  assert.equal(read(game).observedThreat, true, 'shield absorption leaves an observed impact, even with unchanged hull');
  assert.equal(classifyMusicEvent(event, read(game)), 'combat');
  assert.equal(read(game).emergency, false, 'shield absorption does not invent a compartment fire');
});

test('actual targeted enemy fire establishes danger before impact, with captain and hull identity', () => {
  const game = new Game('music-actual-enemy-shot');
  Object.assign(game.state.ship, { x: 0, y: 500, vx: 0, vy: 0 });
  game.system.enemies = []; game.system.bullets = []; game.drainEvents();
  const raider = placeRaider(game, { x: 400, y: 500, cooldown: 0, active: true, speed: 0 });
  game.state.rep[raider.faction] = 0;
  game._updateEnemies(.01, [game]);
  const shot = game.drainEvents().find(value => value.type === 'enemy-shot');
  assert.ok(shot);
  assert.ok(game.system.bullets.length > 0);
  assert.equal(game.system.bullets[0].targetId, game.playerId);
  assert.equal(shot.targetId, game.playerId);
  assert.equal(shot.targetVesselId, game.state.ship.id);
  assert.equal(read(game).pursuit, true);
  assert.equal(classifyMusicEvent(shot, read(game)), 'combat', 'the actual shot names this occupied hull');
  const unrelated = { ...read(game), scope: { ...read(game).scope, captainId: 'civilian', vesselId: 'civilian-ship' } };
  assert.equal(classifyMusicEvent(shot, unrelated), null, 'a battle in the same system does not target every listener');
  for (const bullet of game.system.bullets) { bullet.x = 120; bullet.y = 500; }
  assert.equal(read(game).observedThreat, true);
});

test('real shared snapshots preserve shield-only impacts on a guest deck without scoring the ashore owner', async () => {
  const persistence = { kind: 'memory', async save(_id, version) { return { version: version + 1 }; } };
  const realm = new Realm({ id: 'MUSIC123', seed: 'music-shared-deck', persistence });
  const owner = (await realm.createCaptain('Owner')).captain;
  const guest = (await realm.createCaptain('Guest')).captain;
  for (const captain of [owner, guest]) realm.attach(captain, { close() {} });
  const vessel = realm.vessels.get(owner.ownedVesselId);
  Object.assign(vessel.ship, { x: 0, y: 500, angle: 0, vx: 0, vy: 0, shield: 35 });
  Object.assign(realm.vessels.get(guest.ownedVesselId).ship, { x: 90, y: 500, vx: 0, vy: 0 });
  vessel.allowCrew = true;
  assert.equal(realm._command(guest, 'boardShip', { vesselId: vessel.id }).ok, true);
  realm._landCharacter(owner, 'hearth', 'kettle');
  const room = realm._room('hearth');
  for (const key of ['enemies', 'bullets', 'asteroids', 'pickups', 'signals']) room.runtime[key] = [];
  const actor = realm._actor(vessel), hull = vessel.ship.hull;
  actor._damageShip(12, { sourceId: 'pirate', sourceX: vessel.ship.x - 200, sourceY: vessel.ship.y });
  realm._syncActor(vessel);
  assert.equal(vessel.ship.hull, hull);
  assert.equal(vessel.ship.shield, 23);
  for (const compact of [false, true]) {
    const snapshot = realm.snapshotFor(guest, { compact, drainEvents: false });
    assert.equal(snapshot.state.ship.id, vessel.id);
    assert.ok(Array.isArray(snapshot.state.ship.damageControl.sections));
    assert.equal(snapshot.state.ship.damageControl.impacts.at(-1).shieldOnly, true);
    const game = { state: snapshot.state, system: snapshot.world, currentBody: snapshot.state.interior?.location };
    const context = read(game, { network: { passport: { captainId: guest.id } } });
    assert.equal(context.observedThreat, true);
    assert.equal(context.vesselId, vessel.id);
    const event = { type: 'hit', playerId: owner.id, vesselId: vessel.id, damage: 12 };
    assert.equal(classifyMusicEvent(event, context), 'combat', 'guest hears the occupied hull, not only their own ship');
    const ashore = realm.snapshotFor(owner, { compact, drainEvents: false });
    const ashoreContext = read({ state: ashore.state, system: ashore.world }, { network: { passport: { captainId: owner.id } } });
    assert.equal(ashoreContext.observedThreat, false);
    assert.equal(classifyMusicEvent(event, ashoreContext), null);
  }
});
