import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as pause } from 'node:timers/promises';
import WebSocket from 'ws';
import { Realm } from '../../server/realm.mjs';
import { Game } from '../../dist/engine.mjs';
import { startServer, compactSnapshot } from '../../server/index.mjs';
import { FarwakeNetwork, mergeSnapshot } from '../../dist/network.mjs';
import { generateSurface, isWalkable } from '../../dist/surface.mjs';
import { updateNpcLife, npcLifeActors } from '../../dist/npc-life.mjs';
import { createPrivacyExport } from '../../server/privacy.mjs';

const copy = value => structuredClone(value);
const ok = value => { assert.equal(value?.ok, true, value?.reason || JSON.stringify(value)); return value; };
function clock(t) {
  let value = 1_800_000_000_000;
  t.mock.method(Date, 'now', () => value);
  return { now: () => value, advance(seconds) { value += seconds * 1000; return value; } };
}
function persistence() {
  const records = new Map();
  return { kind: 'test-memory', durable: true, async ping() { return { ok: true }; },
    async load(id) { return copy(records.get(id) || { version: 0, snapshot: null }); },
    async save(id, expectedVersion, snapshot) {
      const current = records.get(id)?.version || 0;
      assert.equal(current, expectedVersion);
      records.set(id, { version: current + 1, snapshot: copy(snapshot) });
      return { version: current + 1 };
    },
  };
}
async function fixture(count = 4) {
  const storage = persistence(), realm = new Realm({ id: 'NPCLIFE1', seed: 'daily-residents', settings: { openingMission: true }, persistence: storage }), captains = [];
  for (let index = 0; index < count; index++) {
    const { captain } = await realm.createCaptain(`Resident tester ${index + 1}`);
    ok(realm.attach(captain, { send() {}, close() {} })); captains.push(captain);
  }
  return { realm, captains, storage };
}
const positions = surface => npcLifeActors(surface).map(entity => ({ id: entity.id, x: entity.x, y: entity.y, facing: entity.facing, moving: entity.moving, activity: entity.life?.activity }));
function approach(realm, captain, id) {
  const entity = realm._surface(captain).entities.find(value => value.id === id);
  assert.ok(entity, `Actual contact ${id} is present.`);
  Object.assign(captain.game.state.person, { x: entity.x, y: entity.y });
  return entity;
}
function clientSurface(realm, captain, snapshot) {
  const surface = generateSurface(realm._location(captain), realm.seed, snapshot.state.flags || captain.game.state.flags);
  return updateNpcLife(surface, snapshot.state.npcLife.time, { holds: snapshot.state.npcLife.holds });
}

test('four captains share one resident clock and late arrivals see the same collision-safe routines', async t => {
  const time = clock(t), { realm, captains } = await fixture(3);
  for (const seconds of [0, 27, 80, 210, 500, 700, 1000]) {
    time.advance(seconds);
    const expected = positions(realm._surface(captains[0]));
    assert.ok(expected.length >= 5, 'The port has living residents rather than only service fixtures.');
    for (const captain of captains) {
      const packet = realm.snapshotFor(captain, { drainEvents: false });
      assert.equal(packet.state.npcLife.time, realm._npcTime());
      assert.equal(packet.state.npcLife.sampledAt, time.now());
      assert.deepEqual(positions(realm._surface(captain)), expected);
      assert.deepEqual(positions(clientSurface(realm, captain, packet)), expected);
      for (const entity of npcLifeActors(realm._surface(captain))) assert.ok(isWalkable(realm._surface(captain), entity.x, entity.y), `${entity.id} stays on open floor.`);
    }
  }
  const { captain: late } = await realm.createCaptain('Late arrival');
  ok(realm.attach(late, { send() {}, close() {} })); captains.push(late);
  assert.equal(realm.onlineCount, 4);
  assert.equal(late.game.state.stats.time, 0, 'Personal playtime is not the resident clock.');
  assert.deepEqual(positions(realm._surface(late)), positions(realm._surface(captains[0])));
  const oldTime = realm._npcTime();
  for (let tick = 1; tick <= 30; tick++) realm.step(1 / 30, tick, time.now());
  assert.equal(realm._npcTime(), oldTime, 'Adding players or simulation ticks does not accelerate a day.');
});

test('talk uses the NPC actual position, ignores forged coordinates and keeps memories personal', async t => {
  const time = clock(t), { realm, captains: [one, two] } = await fixture(2);
  const before = generateSurface(realm._location(one), realm.seed, []);
  let entity, original;
  for (let tries = 0; tries < 24 && !entity; tries++) {
    time.advance(60);
    entity = npcLifeActors(realm._surface(one)).find(value => {
      const old = before.entities.find(start => start.id === value.id);
      return old && Math.hypot(value.x - old.x, value.y - old.y) > 60;
    });
  }
  assert.ok(entity, 'At least one resident leaves their old fixed spawn during the day.');
  original = before.entities.find(value => value.id === entity.id);
  Object.assign(one.game.state.person, { x: original.x, y: original.y });
  const rejected = await realm.command(one, 'surfaceAction', { entityId: entity.id, action: 'talk', x: entity.x, y: entity.y, time: 999999, relationship: 100 });
  assert.equal(rejected.ok, false); assert.equal(rejected.code, 'distance');
  assert.equal(one.game.state.conversations.people.length, 0);
  const actual = approach(realm, one, entity.id), credits = one.game.state.credits, rep = copy(one.game.state.rep);
  const answer = ok(await realm.command(one, 'surfaceAction', { entityId: entity.id, action: 'talk', time: 999999, relationship: 100 }));
  assert.equal(answer.dialogue.name, actual.name); assert.ok(answer.dialogue.greeting);
  assert.equal(one.game.state.conversations.people.length, 1);
  assert.equal(one.game.state.conversations.people[0].lastAt, realm._npcTime());
  assert.equal(two.game.state.conversations.people.length, 0);
  assert.equal(one.game.state.credits, credits); assert.deepEqual(one.game.state.rep, rep);
  assert.notEqual(realm.failed, true);
});

test('a moving NPC prompt tolerates 150ms of network travel without extending fixture or remote reach', async t => {
  clock(t); const { realm, captains: [captain] } = await fixture(1);
  let sampleTime = 0; realm._npcTime = () => sampleTime;
  let candidate;
  for (let time = 0; time < 180 && !candidate; time += .1) {
    sampleTime = time;
    const surface = realm._surface(captain), poses = npcLifeActors(surface).filter(entity => entity.moving).map(entity => ({ id: entity.id, x: entity.x, y: entity.y }));
    sampleTime = time + .15; realm._surface(captain);
    for (const prior of poses) {
      const entity = surface.entities.find(value => value.id === prior.id), dx = entity.x - prior.x, dy = entity.y - prior.y, travelled = Math.hypot(dx, dy);
      if (travelled < 3.1 || travelled > 10) continue;
      const position = { x: prior.x - dx / travelled * 42.9, y: prior.y - dy / travelled * 42.9 };
      if (!isWalkable(surface, position.x, position.y) || Math.hypot(entity.x - position.x, entity.y - position.y) <= 46) continue;
      candidate = { entity, position, x: entity.x, y: entity.y }; break;
    }
  }
  assert.ok(candidate, 'A real resident can leave the visible prompt range during delivery.');
  Object.assign(captain.game.state.person, candidate.position);
  ok(await realm.command(captain, 'surfaceAction', { entityId: candidate.entity.id, action: 'talk' }));
  const held = realm._surface(captain).entities.find(entity => entity.id === candidate.entity.id);
  assert.equal(held.x, candidate.x); assert.equal(held.y, candidate.y, 'Range checks restore the actual current pose.');
  sampleTime += 2;
  assert.ok(realm._entity(captain, held.id), 'The same conversation remains reachable for its follow-up choices.');
  Object.assign(captain.game.state.person, { x: held.x + 59, y: held.y });
  assert.equal(realm._entity(captain, held.id), null, 'The grace has a hard distance cap.');
  const workstation = realm._surface(captain).entities.find(entity => entity.type === 'work');
  Object.assign(captain.game.state.person, { x: workstation.x + 47, y: workstation.y });
  assert.equal(realm._entity(captain, workstation.id), null, 'Stationary jobs retain the ordinary interaction distance.');
});

test('a conversation pauses the same resident for everyone, survives restart and resumes on the route', async t => {
  const time = clock(t), { realm, captains, storage } = await fixture(4);
  time.advance(90);
  const entity = npcLifeActors(realm._surface(captains[0]))[0];
  approach(realm, captains[0], entity.id);
  ok(await realm.command(captains[0], 'surfaceAction', { entityId: entity.id, action: 'talk' }));
  const initial = realm.snapshotFor(captains[0], { drainEvents: false }).state.npcLife.holds.find(hold => hold.id === entity.id);
  assert.ok(initial); assert.equal(initial.until - initial.at, 24);
  time.advance(8);
  for (const captain of captains) {
    const packet = realm.snapshotFor(captain, { compact: true, drainEvents: false });
    assert.deepEqual(packet.state.npcLife.holds, [initial]);
    const person = realm._surface(captain).entities.find(value => value.id === entity.id);
    assert.equal(person.x, initial.x); assert.equal(person.y, initial.y);
    assert.equal(person.moving, false);
  }
  approach(realm, captains[1], entity.id);
  ok(await realm.command(captains[1], 'surfaceAction', { entityId: entity.id, action: 'talk' }));
  assert.equal(realm.snapshotFor(captains[1]).state.npcLife.holds[0].until, initial.until, 'Repeated clicks cannot extend a pause.');
  const saved = realm.document();
  assert.equal(saved.captains[captains[0].id].game.npcLife, undefined);
  assert.ok(Object.keys(saved.npcHolds).length);
  const restored = new Realm({ id: realm.id, snapshot: copy(saved), persistence: storage, version: realm.version });
  const newcomer = restored.captains.get(captains[0].id);
  assert.equal(restored._npcTime(), realm._npcTime());
  assert.deepEqual(positions(restored._surface(newcomer)), positions(realm._surface(captains[0])));
  assert.deepEqual(newcomer.game.state.conversations, captains[0].game.state.conversations);
  time.advance(initial.resumeAt - realm._npcTime() + 1);
  const after = restored.snapshotFor(newcomer, { drainEvents: false });
  assert.deepEqual(after.state.npcLife.holds, []);
  const routine = updateNpcLife(generateSurface(restored._location(newcomer), restored.seed, []), restored._npcTime());
  assert.deepEqual(positions(restored._surface(newcomer)), positions(routine), 'The resume catches up without a permanent clock offset.');
});

test('compact snapshots replace expired pauses and conversation records are included only in their captain export', async t => {
  const time = clock(t), { realm, captains: [one, two] } = await fixture(2);
  time.advance(100);
  const entity = npcLifeActors(realm._surface(one))[0]; approach(realm, one, entity.id);
  ok(await realm.command(one, 'surfaceAction', { entityId: entity.id, action: 'talk' }));
  const full = realm.snapshotFor(one, { drainEvents: false });
  const hold = full.state.npcLife.holds[0];
  const compact = JSON.parse(JSON.stringify(compactSnapshot(full)));
  assert.deepEqual(compact.state.npcLife, full.state.npcLife);
  time.advance(hold.resumeAt - realm._npcTime() + 1);
  const merged = mergeSnapshot(full, realm.snapshotFor(one, { compact: true, drainEvents: false }));
  assert.deepEqual(merged.state.npcLife.holds, []);
  assert.ok(merged.state.npcLife.time > full.state.npcLife.time);
  const exported = createPrivacyExport(realm, one, { sourceKind: 'live-authority' });
  assert.deepEqual(exported.captain.game.conversations, one.game.state.conversations);
  const second = createPrivacyExport(realm, two, { sourceKind: 'live-authority' });
  assert.deepEqual(second.captain.game.conversations.people, []);
  assert.equal(exported.captain.game.npcLife, undefined);
});

test('four captains see one traveling acquaintance in the same place and keep their own memories across restart', async t => {
  const time = clock(t), { realm, captains, storage } = await fixture(4), id = 'social:recurring:tamsin-rue';
  async function visit(captain, bodyId, siteId) {
    const system = realm.galaxy.find(value => value.bodies.some(body => body.id === bodyId));
    assert.ok(system);
    realm._landCharacter(captain, system.id, bodyId);
    const entrance = realm._surface(captain).entities.find(entity => entity.type === 'siteEntrance' && entity.data?.siteId === siteId);
    assert.ok(entrance); Object.assign(captain.game.state.person, { x: entrance.x, y: entrance.y });
    ok(await realm.command(captain, 'enterSite', { siteId }));
  }
  for (const captain of captains.slice(0, 2)) await visit(captain, 'tessera', 'small-mercy');
  for (const captain of captains.slice(2)) await visit(captain, 'kindred-landing', 'table-of-arrivals');
  const pose = entity => entity.hidden ? { id: entity.id, hidden: true, activity: entity.life?.activity } : { id: entity.id, hidden: false, x: entity.x, y: entity.y, facing: entity.facing, activity: entity.life?.activity };
  function comparePackets(expectedBody) {
    const visibleBodies = new Set();
    for (const captain of captains) {
      const packet = realm.snapshotFor(captain, { drainEvents: false }), server = realm._surface(captain).entities.find(entity => entity.id === id);
      const client = Game.fromSave(packet.state), surface = updateNpcLife(generateSurface(client.currentBody, client.state.seed, client.state.flags), packet.state.npcLife.time, { holds: packet.state.npcLife.holds });
      const shown = surface.entities.find(entity => entity.id === id);
      assert.ok(server); assert.ok(shown); assert.deepEqual(pose(shown), pose(server), 'Snapshot inputs reconstruct the actual authority pose and presence.');
      if (!server.hidden) visibleBodies.add(captain.game.state.exploration.bodyId);
    }
    assert.deepEqual([...visibleBodies], [expectedBody], 'The same person is never present at two worlds.');
  }
  time.advance(300); comparePackets('tessera');
  const first = approach(realm, captains[0], id);
  const answer = ok(await realm.command(captains[0], 'surfaceAction', { action: 'talk', entityId: id }));
  assert.equal(answer.dialogue.context, 'recurring'); assert.equal(first.name, 'Tamsin Rue');
  assert.equal(captains[0].game.state.socialVisits.people[0].meetings, 1);
  assert.equal(captains[1].game.state.socialVisits.people.length, 0);
  const hidden = approach(realm, captains[2], id); assert.equal(hidden.hidden, true);
  assert.equal((await realm.command(captains[2], 'surfaceAction', { action: 'talk', entityId: id, time: 1740, recurringId: 'tamsin-rue' })).ok, false);
  assert.equal(captains[2].game.state.socialVisits.people.length, 0, 'A forged meeting with an absent person is not recorded.');
  time.advance(1440); comparePackets('kindred-landing');
  await visit(captains[0], 'kindred-landing', 'table-of-arrivals'); approach(realm, captains[0], id);
  const reunion = ok(await realm.command(captains[0], 'surfaceAction', { action: 'talk', entityId: id }));
  assert.match(reunion.dialogue.greeting, /found me again/i);
  assert.equal(captains[0].game.state.socialVisits.people[0].meetings, 2);
  assert.equal(captains[0].game.state.socialVisits.people[0].bodyId, 'kindred-landing');
  const exported = createPrivacyExport(realm, captains[0], { sourceKind: 'live-authority' });
  assert.deepEqual(exported.captain.game.socialVisits, captains[0].game.state.socialVisits);
  assert.equal(createPrivacyExport(realm, captains[1], { sourceKind: 'live-authority' }).captain.game.socialVisits.people.length, 0);
  const restored = new Realm({ id: realm.id, snapshot: copy(realm.document()), persistence: storage, version: realm.version });
  for (const captain of captains) {
    const resumed = restored.captains.get(captain.id);
    assert.deepEqual(resumed.game.state.socialVisits, captain.game.state.socialVisits);
    assert.deepEqual(pose(restored._surface(resumed).entities.find(entity => entity.id === id)), pose(realm._surface(captain).entities.find(entity => entity.id === id)));
  }
});

test('an old realm starts new social projects together and preserves their epoch and recognition through offline restart', async t => {
  const time = clock(t), initial = await fixture(1), captainId = initial.captains[0].id;
  const old = initial.realm.document(), oldAge = 30 * 24 * 60 * 60;
  old.createdAt = time.now() - oldAge * 1000; delete old.socialEpochAt;
  old.captains[captainId].game.stats.time = 500000; delete old.captains[captainId].game.socialEpoch;
  let realm = new Realm({ id: initial.realm.id, snapshot: old, persistence: initial.storage, version: initial.realm.version });
  let captain = realm.captains.get(captainId);
  const epoch = realm.socialEpochAt;
  assert.equal(epoch, time.now()); assert.equal(realm._socialTime(), 0);
  assert.equal(realm._npcTime(), oldAge, 'Introducing social projects does not restart existing schedules.');
  async function enterHall(person) {
    const system = realm.galaxy.find(value => value.bodies.some(body => body.id === 'kindred-landing'));
    realm._landCharacter(person, system.id, 'kindred-landing');
    const entrance = realm._surface(person).entities.find(entity => entity.data?.siteId === 'table-of-arrivals');
    Object.assign(person.game.state.person, { x: entrance.x, y: entrance.y });
    ok(await realm.command(person, 'enterSite', { siteId: 'table-of-arrivals' }));
  }
  const entityId = 'social:recurring:anja-pell';
  async function talk(person) {
    approach(realm, person, entityId);
    return ok(await realm.command(person, 'surfaceAction', { action: 'talk', entityId, storyTime: 99999999 })).dialogue;
  }
  await enterHall(captain);
  const first = await talk(captain);
  assert.equal(first.storyStage, 0); assert.match(first.greeting, /window seat for my brother/);
  for (const compact of [false, true]) {
    const packet = realm.snapshotFor(captain, { compact, drainEvents: false });
    assert.equal(packet.state.npcLife.socialTime, 0); assert.equal(packet.state.npcLife.time, oldAge);
    assert.equal(packet.state.npcLife.sampledAt, time.now());
  }
  time.advance(2881);
  const second = await talk(captain);
  assert.equal(second.storyStage, 1); assert.match(second.greeting, /Since we last spoke/);
  const { captain: late } = await realm.createCaptain('Arriving for supper');
  await enterHall(late);
  assert.equal(late.game.state.stats.time, 0);
  assert.equal((await talk(late)).storyStage, 1, 'A late arrival shares the actual project stage rather than restarting it.');
  const saved = realm.document(), version = realm.version;
  assert.equal(saved.socialEpochAt, epoch);
  time.advance(2881);
  realm = new Realm({ id: realm.id, snapshot: copy(saved), persistence: initial.storage, version }); captain = realm.captains.get(captainId);
  assert.equal(realm.socialEpochAt, epoch); assert.equal(realm._socialTime(), 5762);
  assert.equal(realm._npcTime(), oldAge + 5762);
  assert.equal(captain.game.state.socialVisits.people[0].storyStage, 1, 'Recognition survives before the next conversation.');
  const third = await talk(captain);
  assert.equal(third.storyStage, 2); assert.match(third.greeting, /Since we last spoke/);
  assert.equal(captain.game.state.socialVisits.people[0].meetings, 3);
  assert.equal(realm.snapshotFor(realm.captains.get(late.id), { compact: true }).state.npcLife.socialTime, 5762);
  assert.equal(createPrivacyExport(realm, captain, { sourceKind: 'live-authority' }).captain.game.socialEpoch, captain.game.state.socialEpoch);
});

test('the opening mission follows its moving contact and still validates proximity', async t => {
  const time = clock(t), { realm, captains: [captain] } = await fixture(1);
  time.advance(580);
  const target = captain.game.openingMissionStatus().target;
  const contact = realm._surface(captain).entities.find(entity => entity.id === target.entityId);
  assert.equal(target.x, contact.x); assert.equal(target.y, contact.y);
  Object.assign(captain.game.state.person, { x: 1, y: 1 });
  assert.equal((await realm.command(captain, 'openingAction', { action: 'accept', entityId: contact.id })).ok, false);
  approach(realm, captain, contact.id);
  ok(await realm.command(captain, 'openingAction', { action: 'accept', entityId: contact.id }));
  assert.equal(captain.game.openingMissionStatus().stageId, 'repair');
});

test('moving service staff and quest contacts wait while their menus are used', async t => {
  const time = clock(t), { realm, captains: [captain] } = await fixture(1);
  time.advance(410);
  const mechanic = realm._surface(captain).entities.find(entity => entity.type === 'mechanic');
  approach(realm, captain, mechanic.id);
  ok(await realm.command(captain, 'surfaceAction', { entityId: mechanic.id, action: 'talk' }));
  const repairHold = realm.snapshotFor(captain).state.npcLife.holds.find(hold => hold.id === mechanic.id);
  assert.equal(repairHold.until - repairHold.at, 60);
  const vessel = realm.vessels.get(captain.ownedVesselId); vessel.ship.hull -= 12;
  time.advance(40);
  ok(await realm.command(captain, 'service', { action: 'repair' }));
  assert.equal(vessel.ship.hull, vessel.ship.maxHull);
  assert.equal(realm._surface(captain).entities.find(entity => entity.id === mechanic.id).x, repairHold.x);

  const medic = realm._surface(captain).entities.find(entity => entity.type === 'medic');
  approach(realm, captain, medic.id);
  ok(await realm.command(captain, 'surfaceAction', { entityId: medic.id, action: 'talk' }));
  const careHold = realm.snapshotFor(captain).state.npcLife.holds.find(hold => hold.id === medic.id);
  assert.equal(careHold.until - careHold.at, 60);
  captain.game.state.person.health = 35;
  time.advance(40);
  ok(await realm.command(captain, 'service', { action: 'rest' }));
  assert.ok(captain.game.state.person.health > 35);

  const contact = approach(realm, captain, 'quest:orin-dax');
  const inspected = ok(await realm.command(captain, 'inspectContact', { entityId: contact.id }));
  assert.ok(inspected.dialogue?.greeting);
  const storyHold = realm.snapshotFor(captain).state.npcLife.holds.find(hold => hold.id === contact.id);
  assert.equal(storyHold.until - storyHold.at, 60);
  time.advance(40);
  assert.ok(realm._entity(captain, contact.id), 'Reading a quest does not immediately strand its choices out of reach.');
});

test('four WebSocket clients receive the same room pause without a party-wide wait', async t => {
  const server = await startServer({ port: 0, host: '127.0.0.1', persistence: persistence() }), clients = [];
  t.after(async () => { for (const client of clients) client.disconnect(); await server.close(); });
  const browserStorage = () => { const values = new Map(); return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; };
  async function connect(options) {
    const client = new FarwakeNetwork({ url: server.url, WebSocketImpl: WebSocket, storage: browserStorage(), autoReconnect: false });
    clients.push(client); await client.connect(options); return client;
  }
  const first = await connect({ create: true, name: 'First shift', openingMission: true });
  for (let index = 1; index < 4; index++) await connect({ realmCode: first.passport.realmCode, name: `Shift ${index + 1}` });
  const realm = server.manager.realms.get(first.passport.realmCode), captain = realm.captains.get(first.passport.captainId);
  const entity = npcLifeActors(realm._surface(captain))[0]; approach(realm, captain, entity.id);
  const answer = await first.command('surfaceAction', { entityId: entity.id, action: 'talk' });
  ok(answer); ok(answer.result);
  const started = Date.now();
  while (!clients.every(client => client.latest?.state?.npcLife?.holds?.some(hold => hold.id === entity.id))) {
    if (Date.now() - started > 3000) assert.fail('All four room clients should receive the shared NPC pause.');
    await pause(10);
  }
  const hold = clients[0].latest.state.npcLife.holds.find(value => value.id === entity.id);
  for (const client of clients) assert.deepEqual(client.latest.state.npcLife.holds.find(value => value.id === entity.id), hold);
  const sharedAt = Date.now();
  const views = clients.map(client => {
    const observer = realm.captains.get(client.passport.captainId), sample = client.latest.state.npcLife;
    assert.equal(sample.sampledAt, client.latest.serverTime, 'The packet and resident clock use one timestamp.');
    const surface = generateSurface(realm._location(observer), realm.seed, observer.game.state.flags);
    return positions(updateNpcLife(surface, sample.time + (sharedAt - sample.sampledAt) / 1000, { holds: sample.holds }));
  });
  for (const view of views.slice(1)) for (let index = 0; index < view.length; index++) {
    assert.equal(view[index].id, views[0][index].id);
    assert.ok(Math.hypot(view[index].x - views[0][index].x, view[index].y - views[0][index].y) < .001, 'Clients with differently timed packets render the same current route.');
  }
  const other = realm.captains.get(clients[3].passport.captainId), previous = other.game.state.stats.time;
  const skipped = await clients[3].command('openingAction', { action: 'skip' }); ok(skipped); ok(skipped.result);
  await pause(100);
  assert.ok(other.game.state.stats.time > previous, 'Other captains continue while one resident is in conversation.');
  assert.equal(other.game.state.conversations.people.length, 0);
  assert.equal(realm.onlineCount, 4);
});
