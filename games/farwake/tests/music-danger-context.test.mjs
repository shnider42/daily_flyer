import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { Realm } from '../server/realm.mjs';
import { musicContext, classifyMusicEvent } from '../dist/music-context.mjs';
import { MusicDirector } from '../dist/music-director.mjs';
import { cabinLayout } from '../dist/fleet.mjs';
import { generateSurface } from '../dist/surface.mjs';
import { explorationLocation, createSiteState, stepSiteEncounter } from '../dist/exploration.mjs';
import { MILITARY_RECRUITER } from '../dist/military-content.mjs';
import { placeRaider } from './helpers/combat-fixtures.mjs';

const read = (game, extra = {}) => musicContext({ game, playing: true, now: 0, ...extra });
const ok = result => { assert.equal(result.ok, true, result.reason); return result; };
const pt = (x, y) => ({ x: (x + .5) * 24, y: (y + .5) * 24 });
function quietFlight(seed = 'score-flight') {
  const game = new Game(seed);
  Object.assign(game.state.ship, { x: 0, y: 500, vx: 0, vy: 0, angle: 0 });
  game.system.enemies = []; game.system.bullets = []; game.drainEvents();
  return game;
}

test('pursuit lasts through evasive flight, then releases only after the actual chase and danger hold end', () => {
  const game = quietFlight(), enemy = placeRaider(game, { x: 400, y: 500, cooldown: 100, speed: 0 });
  game._updateEnemies(.01, [game]);
  const director = new MusicDirector({ cues: [
    { id: 'calm', family: 'exploration', durationSeconds: 90, tags: [] },
    { id: 'urgent', family: 'combat', durationSeconds: 90, tags: [] },
    { id: 'breathe', family: 'recovery', durationSeconds: 30, tags: [] }
  ] });
  assert.equal(read(game).pursuit, true);
  assert.equal(director.update(read(game), 0, { presence: 'quiet' }).cueId, 'urgent');
  enemy.x = 900; game._updateEnemies(.01, [game]);
  assert.equal(director.update(read(game), 50, { presence: 'quiet' }).cueId, 'urgent');
  enemy.x = 1500; game._updateEnemies(.01, [game]);
  assert.equal(read(game).pursuit, false);
  assert.equal(director.update(read(game), 55).mood, 'combat');
  assert.equal(director.update(read(game), 70).mood, 'recovery');
  enemy.x = 100; enemy.active = true; enemy.targetVesselId = 'another-hull';
  assert.equal(read(game).combat, false, 'an unrelated nearby pursuit is not this captain’s combat');
  enemy.targetVesselId = game.state.ship.id; enemy.disabled = true;
  assert.equal(read(game).combat, false, 'neutralized contacts do not keep combat music running');
});

test('confirmed outgoing ship hits establish combat for everyone on that hull, but empty fire does not', () => {
  const game = quietFlight(), enemy = placeRaider(game, { x: 170, y: 500, cooldown: 100, speed: 0, hp: 200, maxHp: 200 });
  game._fire();
  const fired = game.drainEvents().find(event => event.type === 'shot');
  assert.equal(classifyMusicEvent(fired, read(game)), null);
  game._updateBullets(.25, [game]);
  const hit = game.drainEvents().find(event => event.type === 'hit' && event.target === 'enemy');
  assert.ok(hit); assert.equal(hit.sourceVesselId, game.state.ship.id); assert.equal(hit.targetId, enemy.id);
  assert.equal(classifyMusicEvent(hit, read(game)), 'combat');
  const crew = read(game, { network: { passport: { captainId: 'gunner-guest' } } });
  assert.equal(classifyMusicEvent(hit, crew), 'combat');
  game.state.mode = 'person'; game.state.interior = null; game.state.locationId = 'morrow';
  assert.equal(classifyMusicEvent(hit, read(game)), null, 'a parked personal ship is outside the listener’s scene');
});

test('a real solo Navy gunner hears targeted incoming fire while their simulation mode remains person', () => {
  const game = new Game('score-navy-solo', { startMode: 'hardcore' });
  const recruiter = generateSurface(game.currentBody, game.state.seed).entities.find(entity => entity.id === MILITARY_RECRUITER.id);
  Object.assign(game.state.person, { x: recruiter.x, y: recruiter.y }); game.state.pendingEncounter = null;
  ok(game.militaryCareerAction({ action: 'join', branchId: 'navy', entityId: recruiter.id }));
  ok(game.militaryCareerAction({ action: 'start', entityId: recruiter.id }));
  for (let n = 0; n < 1200 && game.state.npcContract.phase !== 'working'; n++) game.step(.1, {});
  assert.equal(game.state.npcContract.phase, 'working');
  Object.assign(game.state.person, cabinLayout(game.state.ship.classId).stations.security);
  game.state.pendingEncounter = null; ok(game.enterGunnery());
  assert.equal(game.state.mode, 'person'); assert.equal(game.state.stationView, 'gunnery');
  game.system.enemies = []; game.system.bullets = []; game.drainEvents();
  placeRaider(game, { x: game.state.ship.x + 400, y: game.state.ship.y, cooldown: 0, speed: 0 });
  game._updateEnemies(.01, [game]);
  const shot = game.drainEvents().find(event => event.type === 'enemy-shot');
  assert.equal(shot.targetVesselId, game.state.npcContract.vesselId);
  assert.equal(read(game).combat, true); assert.equal(read(game).pursuit, true);
  assert.equal(classifyMusicEvent(shot, read(game)), 'combat');
});

test('shared crew snapshots keep the occupied hull’s pursuit through interior views and clear it ashore', async () => {
  const persistence = { kind: 'memory', async save(_id, version) { return { version: version + 1 }; } };
  const realm = new Realm({ id: 'SCOR1234', seed: 'score-crew', persistence });
  const owner = (await realm.createCaptain('Pilot')).captain, guest = (await realm.createCaptain('Crew')).captain;
  for (const captain of [owner, guest]) ok(realm.attach(captain, { close() {} }));
  const vessel = realm.vessels.get(owner.ownedVesselId);
  Object.assign(vessel.ship, { x: 0, y: 500, vx: 0, vy: 0 }); vessel.allowCrew = true;
  Object.assign(realm.vessels.get(guest.ownedVesselId).ship, { x: 90, y: 500 });
  ok(realm._command(guest, 'boardShip', { vesselId: vessel.id }));
  const room = realm._room('hearth'); room.runtime.enemies = []; room.runtime.bullets = [];
  const actor = realm._actor(vessel);
  const raider = placeRaider(actor, { x: 400, y: 500, cooldown: 0, speed: 0 });
  actor._updateEnemies(.01, [actor]);
  assert.equal(raider.targetVesselId, vessel.id);
  for (const compact of [false, true]) {
    const snapshot = realm.snapshotFor(guest, { compact, drainEvents: false });
    assert.equal(snapshot.world.enemies.length, 0, 'ordinary deck views still omit exterior actors');
    const context = read({ state: snapshot.state, system: snapshot.world }, { network: { passport: { captainId: guest.id } } });
    assert.equal(context.vesselId, vessel.id); assert.equal(context.combat, true);
    assert.equal(context.pursuit, true);
  }
  realm._landCharacter(owner, 'hearth', 'kettle');
  const ashore = realm.snapshotFor(owner, { drainEvents: false });
  assert.equal(ashore.state.musicThreat, null);
  assert.equal(read({ state: ashore.state, system: ashore.world }, { network: { passport: { captainId: owner.id } } }).combat, false);
  raider.active = false;
  const clear = realm.snapshotFor(guest, { compact: true, drainEvents: false });
  assert.equal(clear.state.musicThreat.pursuit, false);
  assert.equal(Object.hasOwn(guest.game.state, 'musicThreat'), false, 'snapshot facts do not become persistent gameplay state');
});

test('a dodged infantry shot still means the player was fired upon, without requiring an aiming reticle', () => {
  const location = explorationLocation({ id: 'morrow', kind: 'planet', biome: 'temperate' }, 'service-relay');
  const surface = generateSurface(location), encounter = createSiteState(location.site), enemy = encounter.monsters[0];
  encounter.monsters.slice(1).forEach(other => { other.health = 0; });
  Object.assign(enemy, pt(15, 23), { cooldown: 0, alert: true });
  const person = { ...pt(18, 23), health: 100, maxHealth: 100 }, participant = { id: 'recruit', person, input: {} };
  const game = { playerId: participant.id, state: { systemId: 'hearth', mode: 'person', person,
    locationId: location.id, interior: { kind: 'site', location }, exploration: { bodyId: 'morrow', siteId: location.site.id, encounter } }, currentBody: location, system: { bodies: [] } };
  stepSiteEncounter(encounter, [participant], .1, surface);
  assert.equal(read(game, { surface }).pursuit, true, 'a visible attacker acquiring the captain is observed danger');
  person.y += 48;
  const events = [];
  for (let n = 0; n < 7; n++) events.push(...stepSiteEncounter(encounter, [participant], .1, surface));
  const shot = events.find(event => event.type === 'person-shot' && event.team === 'hostile');
  assert.ok(shot); assert.equal(shot.hit, false); assert.equal(shot.intendedTargetId, 'recruit');
  assert.equal(person.health, 100); assert.equal(classifyMusicEvent(shot, read(game, { surface })), 'combat');
  const bystander = read(game, { surface, network: { passport: { captainId: 'unrelated' } } });
  assert.equal(classifyMusicEvent(shot, bystander), null);
  assert.equal(bystander.combat, false);
});

test('planet palettes preserve real terrain and body identity while cave entry selects its own family', () => {
  const game = new Game('score-worlds'); game.state.mode = 'person'; game.state.locationId = 'morrow';
  assert.equal(read(game).environment, 'planet'); assert.ok(read(game).tags.includes('temperate'));
  const morrow = read(game).paletteKey;
  game.state.locationId = 'tinbell';
  assert.equal(read(game).environment, 'planet'); assert.ok(read(game).tags.includes('barren'));
  assert.notEqual(read(game).paletteKey, morrow);
  const moon = game.currentBody, location = explorationLocation(moon, 'hollow', game.state.seed);
  game.state.interior = { kind: 'site', location }; game.state.locationId = location.id;
  game.state.exploration = { bodyId: moon.id, siteId: 'hollow', encounter: createSiteState(location.site) };
  const cave = read(game, { surface: generateSurface(location, game.state.seed) });
  assert.equal(cave.environment, 'cave'); assert.equal(cave.bodyId, 'tinbell');
  assert.ok(cave.tags.includes('barren')); assert.ok(cave.tags.includes('stone'));
  assert.equal(cave.combat, false); assert.equal(cave.terror, false, 'the hidden Bellwether cannot select danger or terror');
  const alien = { ...game, state: { ...game.state, interior: null, exploration: null },
    currentBody: { id: 'avel', kind: 'planet', biome: 'ocean', homeworldOf: 'vaeli', culture: 'avel-tidewards' } };
  const homeworld = read(alien);
  for (const tag of ['ocean', 'water', 'alien', 'homeworld', 'avel-tidewards']) assert.ok(homeworld.tags.includes(tag), tag);
});
