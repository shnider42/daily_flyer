import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { Realm } from '../server/realm.mjs';
import { generateSurface, isWalkable } from '../dist/surface.mjs';
import { fieldObjectPosition, FOREMAN_POSITION, normalizeFieldState } from '../dist/floodworks.mjs';
import { musicContext, classifyMusicEvent } from '../dist/music-context.mjs';

const ok = result => { assert.equal(result?.ok, true, result?.reason); return result; };
const read = (game, extra = {}) => musicContext({ game, playing: true, surface: game._expeditionSurface?.() || null, ...extra });
const point = (x, y) => ({ x: (x + .5) * 24, y: (y + .5) * 24 });
function enterField(game, siteId = 'floodworks-6') {
  const [systemId, bodyId] = siteId === 'archive-annex' ? ['vesper', 'lilt'] : ['brindle', 'orchard'];
  game.state.exploration = null; game.state.interior = null; game.state.systemId = systemId;
  game._runtime = null; game._loadSystem(systemId);
  const body = game.system.bodies.find(value => value.id === bodyId);
  game._arriveAsPassenger(body, { discovery: false });
  const entrance = generateSurface(body, game.state.seed, game.state.flags).entities.find(entity => entity.data?.siteId === siteId);
  Object.assign(game.state.person, entrance, { health: 100, down: false }); ok(game.enterSite(siteId)); game.drainEvents();
  return game;
}
function approach(game, objectId) {
  const site = game.state.interior.location.site, position = fieldObjectPosition(game.state.exploration.encounter, site, objectId);
  const surface = game._expeditionSurface();
  const candidates = [position, ...[20, 25, 34, 42].flatMap(r => [0, 1, 2, 3, 4, 5, 6, 7].map(n => ({ x: position.x + Math.cos(n * Math.PI / 4) * r, y: position.y + Math.sin(n * Math.PI / 4) * r })))];
  Object.assign(game.state.person, candidates.find(value => isWalkable(surface, value.x, value.y, 6)));
}
function act(game, objectId, action) { approach(game, objectId); return ok(game.fieldWorkAction({ objectId, action })); }

test('an occupied crew cabin gets a peaceful profile while flight, gunnery, EVA and ashore retain their actual scenes', () => {
  const game = new Game('music-cabin-place');
  assert.equal(read(game).musicPlace, null);
  Object.assign(game.state, { mode: 'person', interior: { kind: 'ship' } });
  const cabin = read(game);
  assert.equal(cabin.musicPlace, 'cabin'); assert.ok(cabin.tags.includes('cabin') && cabin.tags.includes('ship'));
  assert.ok(!cabin.tags.includes('flight')); assert.equal(cabin.observedThreat, false);
  game.state.stationView = 'gunnery'; assert.equal(read(game).musicPlace, null);
  game.state.stationView = null; game.state.interior = { kind: 'eva' }; assert.equal(read(game).musicPlace, null);
  game.state.interior = null; game.state.locationId = 'morrow'; assert.equal(read(game).musicPlace, null);
});

test('Voltage streets and the actual nearby gaming venue have distinct palettes without affecting another world', () => {
  const game = new Game('music-city-place', { startMode: 'casual', startSystemId: 'voltage' });
  const body = game.system.bodies.find(value => value.id === 'glimmer');
  game._arriveAsPassenger(body, { discovery: false });
  const surface = generateSurface(body, game.state.seed, game.state.flags), table = surface.entities.find(entity => entity.type === 'gambling');
  assert.ok(table);
  Object.assign(game.state.person, surface.spawn);
  const street = read(game, { surface });
  assert.equal(street.musicPlace, 'city'); assert.equal(street.scene, 'exploration');
  assert.ok(street.tags.includes('voltage') && street.tags.includes('city'));
  Object.assign(game.state.person, table);
  const venue = read(game, { surface });
  assert.equal(venue.musicPlace, 'nightlife'); assert.equal(venue.scene, 'social');
  assert.notEqual(street.paletteKey, venue.paletteKey);
  table.hidden = true;
  for (const entity of surface.entities.filter(entity => entity.type === 'gambling')) entity.hidden = true;
  assert.equal(read(game, { surface }).musicPlace, 'city', 'A hidden or absent venue is not inferred from a city name.');
  game.state.systemId = 'hearth'; game.state.locationId = 'kettle';
  assert.equal(read(game, { surface }).musicPlace, null, 'A stale city surface cannot score a different body.');
});

test('Foreman phases mean one continuous threat only inside the active bay, and darkness or an idle machine are not danger', () => {
  const game = enterField(new Game('music-foreman-bay'));
  const field = game.state.exploration.encounter.field;
  assert.equal(read(game).musicPlace, 'fieldwork'); assert.equal(read(game).observedThreat, false);
  Object.assign(field, { serviceCut: true, powerBridged: true, drained: true });
  Object.assign(game.state.person, FOREMAN_POSITION);
  assert.equal(read(game).observedThreat, false, 'An idle machine has not yet presented a warning.');
  game.stepExploration(.1, {});
  for (const phase of ['telegraph', 'sweep', 'recovery']) {
    field.foreman.phase = phase;
    const context = read(game);
    assert.equal(context.observedThreat, true, phase); assert.equal(context.terror, false);
    assert.equal(context.foremanActive, true); assert.ok(context.tags.includes('foreman'));
  }
  Object.assign(game.state.person, point(11, 43));
  assert.equal(read(game).observedThreat, false, 'The workshop does not hear another room’s fight as personal danger.');
  Object.assign(game.state.person, FOREMAN_POSITION, { down: true }); assert.equal(read(game).foremanActive, false);
  game.state.person.down = false;
  assert.equal(read(game, { playing: false }).foremanActive, false);
  assert.equal(read(game, { hidden: true }).foremanActive, false);
  field.foreman.disabled = true; field.foreman.phase = 'shutdown';
  assert.equal(read(game).observedThreat, false); assert.ok(!read(game).tags.includes('foreman'));
});

test('validated repair, archive and handover events are personal, scoped, and silent on inspection or repetition', () => {
  const game = enterField(new Game('music-field-actions'));
  act(game, 'service-panel', 'inspect'); act(game, 'workshop-cutter', 'claim');
  assert.equal(game.drainEvents().some(event => event.type === 'field-work-action'), false);
  act(game, 'service-panel', 'cut');
  const cut = game.drainEvents().find(event => event.type === 'field-work-action');
  assert.ok(cut); assert.equal(cut.captainId, game.playerId); assert.equal(cut.siteId, 'floodworks-6');
  assert.equal(classifyMusicEvent(cut, read(game)), 'discovery');
  assert.equal(classifyMusicEvent({ ...cut, captainId: 'other-captain' }, read(game)), null);
  assert.equal(classifyMusicEvent({ ...cut, siteKey: 'another-expedition' }, read(game)), null);
  assert.equal(classifyMusicEvent({ ...cut, geometryChanged: false }, read(game)), null);
  act(game, 'service-panel', 'cut'); assert.equal(game.drainEvents().some(event => event.type === 'field-work-action'), false);
  act(game, 'workshop-bridge', 'claim'); act(game, 'pump-terminal', 'bridge'); act(game, 'archive-panel', 'cut'); game.drainEvents();
  act(game, 'archive-terminal', 'read');
  const archive = game.drainEvents().find(event => event.type === 'field-work-action');
  assert.equal(archive.firstArchiveRead, true); assert.equal(classifyMusicEvent(archive, read(game)), 'discovery');
  act(game, 'archive-terminal', 'read'); assert.equal(game.drainEvents().some(event => event.type === 'field-work-action'), false);
  const site = game.state.interior.location.site, encounter = game.state.exploration.encounter;
  encounter.field.survivors.mara.status = 'safe'; encounter.field.survivors.mara.escorts = [game.playerId];
  encounter.field = normalizeFieldState(site, encounter.field); game._expeditionMap = null;
  act(game, 'entry-aid', 'handover');
  const handover = game.drainEvents().find(event => event.type === 'field-work-action');
  assert.equal(handover.firstHandover, true); assert.equal(classifyMusicEvent(handover, read(game)), 'recovery');
  act(game, 'entry-aid', 'handover'); assert.equal(game.drainEvents().some(event => event.type === 'field-work-action'), false);
  const restored = new Game(game.serialize());
  act(restored, 'entry-aid', 'handover'); assert.equal(restored.drainEvents().some(event => event.type === 'field-work-action'), false, 'A restart cannot replay the handover cue.');
});

test('the second physical interlock earns recovery but verifying an already stopped machine does not replay it', () => {
  const game = enterField(new Game('music-foreman-stop'));
  act(game, 'workshop-cutter', 'claim'); act(game, 'service-panel', 'cut');
  act(game, 'workshop-bridge', 'claim'); act(game, 'pump-terminal', 'bridge'); game.drainEvents();
  game.state.exploration.encounter.field.foreman.phase = 'recovery';
  act(game, 'release-port', 'release'); assert.equal(game.drainEvents().some(event => event.type === 'field-work-action'), false);
  act(game, 'release-starboard', 'release');
  const stopped = game.drainEvents().find(event => event.type === 'field-work-action');
  assert.ok(stopped.foremanStopped); assert.equal(classifyMusicEvent(stopped, read(game)), 'recovery');
  assert.equal(read(game).observedThreat, false);
  act(game, 'release-starboard', 'release'); assert.equal(game.drainEvents().some(event => event.type === 'field-work-action'), false);
});

test('shared Foreman announcements stay local to the bay and disconnected crew cannot announce a new attempt', async () => {
  const persistence = { kind: 'memory', async save(_id, version) { return { version: version + 1 }; } };
  const realm = new Realm({ id: 'MUSFIELD', seed: 'music-field-shared', persistence }), crew = [];
  for (let i = 0; i < 2; i++) {
    const { captain } = await realm.createCaptain(`Listener ${i}`); ok(realm.attach(captain, { close() {} }));
    realm._landCharacter(captain, 'brindle', 'orchard');
    const entrance = realm._surface(captain).entities.find(entity => entity.data?.siteId === 'floodworks-6');
    Object.assign(captain.game.state.person, entrance); ok(realm._command(captain, 'enterSite', { siteId: 'floodworks-6' })); crew.push(captain);
  }
  const [inside, outside] = crew, field = inside.game.state.exploration.encounter.field;
  Object.assign(field, { serviceCut: true, powerBridged: true, drained: true, revision: field.revision + 1 });
  Object.assign(inside.game.state.person, FOREMAN_POSITION); Object.assign(outside.game.state.person, point(11, 43));
  for (const captain of crew) { captain.surfaceCache = null; captain.game.drainEvents(); }
  realm._stepExplorations(crew, .1);
  const phase = inside.game.drainEvents().find(event => event.type === 'field-progress' && event.fieldKind === 'foreman'); assert.ok(phase);
  const contextFor = captain => {
    const snapshot = realm.snapshotFor(captain, { drainEvents: false });
    return read({ state: snapshot.state, system: snapshot.world, currentBody: snapshot.state.interior?.location }, { network: { passport: { captainId: captain.id } } });
  };
  assert.equal(contextFor(inside).foremanActive, true); assert.equal(contextFor(outside).foremanActive, false);
  assert.equal(classifyMusicEvent(phase, contextFor(inside)), 'combat');
  assert.equal(classifyMusicEvent(phase, contextFor(outside)), null, 'The same shared phase packet cannot spoil the machine from the workshop.');
  realm.detach(inside, inside.session); field.foreman.phase = 'idle'; field.foreman.timer = 0;
  realm._stepExplorations(crew, .1);
  assert.equal(field.foreman.phase, 'idle', 'Only the connected workshop listener is an active participant.');
  assert.equal(contextFor(outside).observedThreat, false);
});
