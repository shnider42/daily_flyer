import test from 'node:test';
import assert from 'node:assert/strict';
import { Realm } from '../../server/realm.mjs';
import { storyStatus, storyThreats } from '../../dist/expedition-story-rules.mjs';
import { QUIET_EARTH_BEATS } from '../../dist/quiet-earth-content.mjs';

const ok = value => { assert.equal(value?.ok, true, value?.reason); return value; };
const memory = () => ({ kind: 'memory', version: 0, snapshot: null, async save(_id, version, snapshot) {
  this.snapshot = structuredClone(snapshot); this.version = version + 1; return { version: this.version };
} });

function at(realm, captain, kind, id) {
  const target = realm._surface(captain).entities.find(item => item.type === kind &&
    (!id || item.data.recordId === id || item.data.choiceId === id || item.data.siteId === id));
  assert.ok(target, `Missing ${kind} ${id || ''}`);
  Object.assign(captain.game.state.person, { x: target.x, y: target.y });
  return target;
}

async function fixture() {
  const persistence = memory(), realm = new Realm({ id: 'QUIET01', seed: 'quiet-earth-shared', persistence }), captains = [];
  for (let i = 0; i < 2; i++) {
    const { captain } = await realm.createCaptain(`Relay crew ${i + 1}`, { startMode: 'casual', startSystemId: 'hearth' });
    ok(realm.attach(captain, { close() {} })); captains.push(captain);
    const room = realm._room('hearth'); room.runtime.enemies = []; room.runtime.bullets = []; room.runtime.signals = [];
    const body = room.runtime.bodies.find(item => item.id === 'morrow'), vessel = realm.vessels.get(captain.ownedVesselId);
    Object.assign(vessel.ship, { x: body.x, y: body.y + body.radius + 60, vx: 0, vy: 0 });
    ok(await realm.command(captain, 'dock', { id: body.id }));
    at(realm, captain, 'siteEntrance', 'relay-nine');
    ok(await realm.command(captain, 'enterSite', { siteId: 'relay-nine' }));
    captain.events.length = 0; captain.game.drainEvents();
  }
  return { realm, captains, persistence };
}

async function choose(realm, captain, id, optionId, requestId) {
  const target = at(realm, captain, 'siteChoice', id);
  return realm.command(captain, 'siteAction', { entityId: target.id, action: 'choose', optionId }, requestId);
}

async function read(realm, captain, id) {
  const target = at(realm, captain, 'siteRecord', id);
  return ok(await realm.command(captain, 'siteAction', { entityId: target.id, action: 'inspect' }));
}

async function activate(f) {
  const [one, two] = f.captains;
  ok(await choose(f.realm, one, 'check-in', 'begin'));
  await read(f.realm, two, 'voices');
  ok(await choose(f.realm, one, 'breaker', 'restore'));
  await read(f.realm, two, 'service');
  ok(await choose(f.realm, one, 'receiver', 'copy'));
}

async function restart(f) {
  f.realm.markDirty(); await f.realm.flush();
  const realm = new Realm({ id: f.realm.id, seed: f.realm.seed, version: f.persistence.version,
    snapshot: structuredClone(f.persistence.snapshot), persistence: f.persistence });
  const captains = f.captains.map(original => realm.captains.get(original.id));
  for (const captain of captains) ok(realm.attach(captain, { close() {} }));
  return { ...f, realm, captains };
}

test('shared captains complete one escape with living pursuers and receive one durable payment', async () => {
  const f = await fixture(), [one, two] = f.captains, shared = one.game.state.exploration.encounter;
  assert.equal(shared, two.game.state.exploration.encounter);
  const distant = at(f.realm, one, 'siteChoice', 'receiver');
  Object.assign(one.game.state.person, f.realm._surface(one).spawn);
  assert.equal((await f.realm.command(one, 'siteAction', { entityId: distant.id, action: 'choose', optionId: 'copy' })).code, 'distance');
  assert.equal((await choose(f.realm, two, 'receiver', 'copy')).ok, false);
  assert.equal(storyThreats(shared).length, 0);
  await activate(f);
  assert.ok(storyThreats(shared).length > 0);
  const before = f.captains.map(captain => captain.game.state.credits);
  const targets = f.captains.map(captain => at(f.realm, captain, 'siteChoice', 'evacuate'));
  const results = await Promise.all(f.captains.map((captain, i) => f.realm.command(captain, 'siteAction', {
    entityId: targets[i].id, action: 'choose', optionId: 'seal'
  }, `escape-${i}`)));
  assert.equal(results.filter(result => result.ok).length, 1);
  const winnerIndex = results.findIndex(result => result.ok), winner = f.captains[winnerIndex], reward = results[winnerIndex];
  assert.equal(winner.game.state.credits, before[winnerIndex] + reward.credits);
  assert.equal(f.captains[1 - winnerIndex].game.state.credits, before[1 - winnerIndex]);
  assert.ok(shared.monsters.every(monster => monster.health > 0));
  assert.equal(storyThreats(shared).length, 0);
  assert.equal(storyStatus(shared, f.realm._surface(one).site).completed, true);
  ok(await choose(f.realm, winner, 'evacuate', 'seal', `escape-${winnerIndex}`));
  assert.equal(winner.game.state.credits, before[winnerIndex] + reward.credits, 'A retried receipt does not pay twice.');
  const returned = await restart(f), restored = returned.captains[0].game.state.exploration.encounter;
  assert.equal(restored, returned.captains[1].game.state.exploration.encounter);
  assert.equal(storyStatus(restored, returned.realm._surface(returned.captains[0]).site).completed, true);
  assert.equal((await choose(returned.realm, returned.captains[1 - winnerIndex], 'evacuate', 'seal')).ok, false);
  assert.equal(returned.captains[winnerIndex].game.state.credits, before[winnerIndex] + reward.credits);
  for (const captain of returned.captains) {
    at(returned.realm, captain, 'siteExit');
    ok(await returned.realm.command(captain, 'exitSite'));
    assert.equal(captain.game.state.locationId, 'morrow');
  }
});

test('offline and downed captains cannot present corridor beats, and shared cues survive reconnect without replay', async () => {
  let f = await fixture();
  const [one, two] = f.captains;
  ok(await choose(f.realm, one, 'check-in', 'begin'));
  const beat = QUIET_EARTH_BEATS[0]; assert.ok(beat);
  for (const captain of f.captains) {
    Object.assign(captain.game.state.person, { x: beat.x, y: beat.y });
    captain.game.drainEvents(); captain.events.length = 0;
  }
  f.realm.detach(two, two.session);
  Object.assign(one.game.state.person, { health: 0, down: true });
  f.realm._stepExplorations(f.captains, .1);
  assert.equal(one.game.drainEvents().some(event => event.type === 'quiet-earth-beat'), false);
  assert.equal(one.game.state.exploration.encounter.quietEarth.cues.length, 0);
  Object.assign(one.game.state.person, { health: 100, down: false });
  f.realm._stepExplorations(f.captains, .1);
  const events = one.game.drainEvents().filter(event => event.type === 'quiet-earth-beat');
  assert.equal(events.length, 1);
  assert.equal(two.game.events.some(event => event.type === 'quiet-earth-beat'), false,
    'A disconnected captain must not queue a scare presented to somebody else.');
  assert.equal(two.events.some(event => event.type === 'quiet-earth-beat'), false);
  ok(f.realm.attach(two, { close() {} }));
  assert.equal(f.realm.snapshotFor(two).events.some(event => event.type === 'quiet-earth-beat'), false,
    'Reconnecting does not deliver a stale corridor scare.');
  assert.equal(one.game.state.person.health, 100, 'The false alarm cannot damage its listener.');
  assert.equal(storyThreats(one.game.state.exploration.encounter).length, 0);
  const cueIds = [...one.game.state.exploration.encounter.quietEarth.cues];
  f = await restart(f);
  for (const captain of f.captains) {
    Object.assign(captain.game.state.person, { x: beat.x, y: beat.y });
    captain.game.drainEvents();
  }
  f.realm._stepExplorations(f.captains, .1);
  assert.deepEqual(f.captains[0].game.state.exploration.encounter.quietEarth.cues, cueIds);
  assert.equal(f.captains.some(captain => captain.game.drainEvents().some(event => event.type === 'quiet-earth-beat')), false);
});

test('shared legacy Relay Nine positions move to intake once while existing claims and later positions survive', async () => {
  const f = await fixture(), snapshot = f.realm.document(), key = f.captains[0].game.state.exploration.key;
  const legacy = { id: 'morrow:site:relay-nine', siteId: 'relay-nine', time: 7, shotSerial: 0, visited: 2,
    monsters: [], collected: ['signal-buffer'], choices: {}, actorCooldowns: {}, cleared: true };
  snapshot.sites[key] = structuredClone(legacy);
  for (const saved of Object.values(snapshot.captains)) {
    saved.game.exploration.encounter = structuredClone(legacy);
    Object.assign(saved.game.person, { x: 25.5 * 24, y: 18.5 * 24 });
  }
  const realm = new Realm({ id: f.realm.id, seed: f.realm.seed, snapshot, persistence: f.persistence });
  const captains = f.captains.map(previous => realm.captains.get(previous.id));
  for (const captain of captains) {
    ok(realm.attach(captain, { close() {} }));
    assert.deepEqual({ x: captain.game.state.person.x, y: captain.game.state.person.y }, realm._surface(captain).spawn);
    assert.ok(captain.game.state.exploration.encounter.collected.includes('signal-buffer'));
  }
  assert.equal(captains[0].game.state.exploration.encounter, captains[1].game.state.exploration.encounter);
  const positions = [{ x: 40.5 * 24, y: 73.5 * 24 }, { x: 54.5 * 24, y: 73.5 * 24 }];
  captains.forEach((captain, i) => Object.assign(captain.game.state.person, positions[i]));
  const continued = await restart({ ...f, realm, captains });
  continued.captains.forEach((captain, i) => {
    assert.deepEqual({ x: captain.game.state.person.x, y: captain.game.state.person.y }, positions[i],
      'A normalized shared captain retains their location on the next server restart.');
    assert.ok(captain.game.state.exploration.encounter.collected.includes('signal-buffer'));
  });
});
