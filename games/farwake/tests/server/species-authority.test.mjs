import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as pause } from 'node:timers/promises';
import WebSocket from 'ws';
import { Realm } from '../../server/realm.mjs';
import { startServer } from '../../server/index.mjs';
import { Game } from '../../dist/engine.mjs';
import { FarwakeNetwork } from '../../dist/network.mjs';
import { generateSurface } from '../../dist/surface.mjs';
import { normalizeSpecies } from '../../dist/species.mjs';
import { withHull } from '../helpers/fleet-fixtures.mjs';
import { CREW_ROLES } from '../../dist/fleet.mjs';

const ok = value => { assert.equal(value?.ok, true, value?.reason || JSON.stringify(value)); return value; };
const copy = value => structuredClone(value);
function persistence() {
  const records = new Map();
  return { kind: 'species-test-memory', durable: true, async ping() { return { ok: true }; },
    async load(id) { return copy(records.get(id) || { version: 0, snapshot: null }); },
    async save(id, expectedVersion, snapshot) {
      assert.equal(records.get(id)?.version || 0, expectedVersion);
      records.set(id, { version: expectedVersion + 1, snapshot: copy(snapshot) });
      return { version: expectedVersion + 1 };
    }
  };
}
const identity = people => people.map(({ id, name, species, data }) => ({ id, name, species: normalizeSpecies(species || data?.species) })).sort((a, b) => a.id.localeCompare(b.id));
const residents = surface => identity(surface.entities.filter(entity => ['npc', 'mechanic', 'medic', 'crew'].includes(entity.type) && !entity.data?.automated));
async function fixture(count = 4) {
  const storage = persistence(), realm = new Realm({ id: 'SPECIES1', seed: 'species-authority', persistence: storage }), captains = [];
  for (let index = 0; index < count; index++) {
    const { captain } = await realm.createCaptain(`Species tester ${index + 1}`, { startMode: 'hardcore' });
    ok(realm.attach(captain, { close() {} })); captains.push(captain);
    realm._landCharacter(captain, 'chorus', 'chora');
  }
  return { realm, captains, storage };
}

test('four captains and a late arrival see the same residents after regeneration and realm restart', async () => {
  const { realm, captains, storage } = await fixture(3);
  const expected = residents(realm._surface(captains[0]));
  assert.ok(expected.some(person => person.species === 'choral'));
  for (const captain of captains) {
    captain.surfaceCache = null;
    assert.deepEqual(residents(realm._surface(captain)), expected);
    const client = Game.fromSave(realm.snapshotFor(captain, { drainEvents: false }).state);
    assert.deepEqual(residents(generateSurface(client.currentBody, client.state.seed, client.state.flags)), expected);
  }
  const { captain: late } = await realm.createCaptain('Late visitor', { startMode: 'hardcore' });
  ok(realm.attach(late, { close() {} })); realm._landCharacter(late, 'chorus', 'chora'); captains.push(late);
  assert.equal(realm.onlineCount, 4);
  assert.deepEqual(residents(realm._surface(late)), expected);
  const restored = new Realm({ id: realm.id, snapshot: copy(realm.document()), persistence: storage, version: realm.version });
  for (const prior of captains) assert.deepEqual(residents(restored._surface(restored.captains.get(prior.id))), expected);
});

test('employer and combat crew identities survive canonical inventory snapshots and do not accept client overrides', async () => {
  const { realm, captains: [captain], storage } = await fixture(1);
  const offer = captain.game.npcContractOffers().find(value => value.familyId === 'freight');
  ok(await realm.command(captain, 'acceptNpcContract', { roleId: offer.roleId, offerId: offer.offerId, species: '__proto__', crew: [{ id: 'injected', species: 'oru' }] }));
  const vessel = realm.vessels.get(captain.aboard), crew = identity(vessel.inventory.crew);
  assert.equal(crew.length, 2); assert.ok(!crew.some(person => person.id === 'injected'));
  assert.equal(realm._locationForVessel(vessel).ownerName, vessel.inventory.crew.find(person => person.role === 'pilot').name);
  const pvp = realm._ensurePvP(vessel);
  assert.deepEqual(pvp.crewActors.map(actor => actor.species), vessel.inventory.crew.map(member => member.species));
  const packet = realm.snapshotFor(captain, { drainEvents: false });
  assert.deepEqual(identity(packet.state.crew), crew);
  assert.deepEqual(identity(packet.state.interior.location.crew), crew);
  const restored = new Realm({ id: realm.id, snapshot: copy(realm.document()), persistence: storage, version: realm.version });
  const returned = restored.vessels.get(vessel.id);
  assert.deepEqual(identity(returned.inventory.crew), crew);
  assert.deepEqual(returned.pvp.crewActors.map(actor => actor.species), pvp.crewActors.map(actor => actor.species));
  assert.deepEqual(identity(restored.snapshotFor(restored.captains.get(captain.id)).state.crew), crew);
  const legacy = copy(realm.document());
  delete legacy.vessels[vessel.id].inventory.crew[0].species;
  legacy.vessels[vessel.id].inventory.crew[1].species = 'unknown-people';
  for (const actor of legacy.vessels[vessel.id].pvp.crewActors) delete actor.species;
  const old = new Realm({ id: realm.id, snapshot: legacy, persistence: storage, version: realm.version });
  assert.deepEqual(old.vessels.get(vessel.id).inventory.crew.map(member => member.species), ['human', 'human']);
  assert.deepEqual(old.vessels.get(vessel.id).pvp.crewActors.map(member => member.species), ['human', 'human']);
  assert.deepEqual(old.vessels.get(vessel.id).inventory.crew.map(member => member.name), vessel.inventory.crew.map(member => member.name));
});

test('the advertised recruit is the canonical person hired and persists despite forged client species', async () => {
  const storage = persistence(), realm = new Realm({ id: 'SPECIES2', seed: 'species-recruiting', persistence: storage });
  const { captain } = await realm.createCaptain('Hiring captain'); ok(realm.attach(captain, { close() {} }));
  withHull(captain.game, 'quill'); captain.game.state.credits = 1000;
  const vessel = realm.vessels.get(captain.ownedVesselId); vessel.systemId = 'chorus'; vessel.dockedAt = 'chora';
  realm._landCharacter(captain, 'chorus', 'chora');
  Object.assign(vessel.ship, { x: captain.game.currentBody.x, y: captain.game.currentBody.y + captain.game.currentBody.radius + 30 });
  const candidate = Object.keys(CREW_ROLES).map(role => captain.game.crewCandidate(role)).find(person => person.species !== 'human');
  assert.ok(candidate, 'This deterministic local board includes a nonhuman applicant.');
  const contact = realm._surface(captain).entities.find(entity => ['npc', 'mechanic', 'medic'].includes(entity.type) && !entity.hidden);
  Object.assign(captain.game.state.person, { x: contact.x, y: contact.y });
  const beforeCredits = captain.game.state.credits, rng = captain.game.state.rng;
  const result = ok(await realm.command(captain, 'recruitCrew', { role: candidate.role, species: 'human', id: 'forged-id', health: 9999 }));
  assert.deepEqual(identity([result.crew]), identity([candidate]));
  assert.equal(captain.game.state.credits, beforeCredits - candidate.cost);
  assert.equal(captain.game.state.rng, rng);
  assert.equal(result.crew.maxHealth, CREW_ROLES[candidate.role].health);
  const restored = new Realm({ id: realm.id, snapshot: copy(realm.document()), persistence: storage, version: realm.version });
  assert.deepEqual(identity(restored.captains.get(captain.id).game.state.crew), identity([candidate]));
  const next = Object.keys(CREW_ROLES).filter(role => role !== candidate.role).map(role => captain.game.crewCandidate(role)).find(person => person.species !== 'human');
  assert.ok(next);
  const renamed = ok(await realm.command(captain, 'recruitCrew', { role: next.role, name: 'Known by a new name', species: 'human' }));
  assert.equal(renamed.crew.name, 'Known by a new name');
  assert.equal(renamed.crew.species, next.species, 'A permitted nickname does not become a species override.');
});

test('four real WebSocket clients agree on species and a forged conversation cannot change an NPC', async t => {
  const server = await startServer({ port: 0, host: '127.0.0.1', persistence: persistence() }), clients = [];
  t.after(async () => { for (const client of clients) client.disconnect(); await server.close(); });
  const localStorage = () => { const values = new Map(); return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; };
  async function connect(options) {
    const client = new FarwakeNetwork({ url: server.url, WebSocketImpl: WebSocket, storage: localStorage(), autoReconnect: false });
    clients.push(client); await client.connect(options); return client;
  }
  const first = await connect({ create: true, name: 'First visitor', startMode: 'hardcore' });
  for (let index = 1; index < 4; index++) await connect({ realmCode: first.passport.realmCode, name: `Visitor ${index + 1}`, startMode: 'hardcore' });
  const realm = server.manager.realms.get(first.passport.realmCode);
  for (const client of clients) realm._landCharacter(realm.captains.get(client.passport.captainId), 'chorus', 'chora');
  realm.markDirty();
  const started = Date.now();
  while (!clients.every(client => client.latest?.state?.locationId === 'chora')) {
    if (Date.now() - started > 4000) assert.fail('Every connected captain receives their canonical landing.');
    await pause(10);
  }
  const captain = realm.captains.get(first.passport.captainId), expected = residents(realm._surface(captain));
  for (const client of clients) {
    const local = Game.fromSave(client.latest.state);
    assert.deepEqual(residents(generateSurface(local.currentBody, local.state.seed, local.state.flags)), expected);
  }
  const contact = realm._surface(captain).entities.find(entity => entity.species === 'choral' && entity.type === 'npc' && !entity.hidden);
  assert.ok(contact); Object.assign(captain.game.state.person, { x: contact.x, y: contact.y });
  const response = ok(await first.command('surfaceAction', { entityId: contact.id, action: 'talk', species: 'human', name: 'Forged name', data: { species: 'human' } }));
  const result = ok(response.result);
  assert.equal(result.entity.name, contact.name); assert.equal(result.entity.species, 'choral');
  for (const observer of realm.captains.values()) assert.deepEqual(residents(realm._surface(observer)), expected);
  assert.equal(realm.onlineCount, 4); assert.notEqual(realm.failed, true);
});
