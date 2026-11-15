import test from 'node:test';
import assert from 'node:assert/strict';
import { Realm } from '../../server/realm.mjs';
import { isWalkable } from '../../dist/surface.mjs';
import { FIELD_SITE_ID, FOREMAN_TIMING } from '../../dist/floodworks.mjs';

const TILE = 24;
const point = (x, y) => ({ x: (x + .5) * TILE, y: (y + .5) * TILE });
const ok = result => { assert.equal(result?.ok, true, result?.reason || JSON.stringify(result)); return result; };
const encounter = captain => captain.game.state.exploration.encounter;
const field = captain => encounter(captain).field;
const receipts = captain => Object.values(captain.game.state.fieldWork.contributions);

function storage() {
  return { kind: 'memory', snapshot: null, version: 0, async save(_id, version, snapshot) {
    this.snapshot = structuredClone(snapshot); this.version = version + 1; return { version: this.version };
  } };
}

async function fixture() {
  const persistence = storage();
  const realm = new Realm({ id: 'FIELDWORK', seed: 'shared-floodworks', persistence, onConflict(_realm, error) { throw error; } });
  const captains = [];
  const room = realm._room('brindle');
  for (const key of ['enemies', 'bullets', 'signals', 'pickups']) room.runtime[key] = [];
  const body = room.runtime.bodies.find(value => value.id === 'orchard');
  assert.ok(body);
  for (let index = 0; index < 2; index++) {
    const { captain } = await realm.createCaptain(`Field worker ${index + 1}`, { startMode: 'regular' });
    ok(realm.attach(captain, { close() {} })); captains.push(captain);
    // Arrange the journey; docking, site entry, all field work and movement use
    // the same authoritative command/input routes as a connected captain.
    const vessel = realm.vessels.get(captain.ownedVesselId);
    vessel.systemId = 'brindle'; vessel.actor = null;
    Object.assign(vessel.ship, { x: body.x, y: body.y + body.radius + 60, vx: 0, vy: 0 });
    realm._bindCaptain(captain);
    ok(await realm.command(captain, 'dock', { id: body.id }));
    await enter(realm, captain);
  }
  return { realm, captains, persistence };
}

function placeEntity(realm, captain, predicate) {
  const surface = realm._surface(captain), entity = surface.entities.find(predicate);
  assert.ok(entity, 'the requested physical entity exists on this surface');
  const candidates = [{ x: entity.x, y: entity.y }];
  for (const distance of [12, 24, 36]) for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
    candidates.push({ x: entity.x + dx * distance, y: entity.y + dy * distance });
  }
  const position = candidates.find(value => isWalkable(surface, value.x, value.y));
  assert.ok(position, `${entity.name} has a walkable interaction point within 46 pixels`);
  Object.assign(captain.game.state.person, position);
  return entity;
}

function placeObject(realm, captain, objectId) {
  return placeEntity(realm, captain, entity => entity.data?.fieldObjectId === objectId);
}

async function enter(realm, captain, siteId = FIELD_SITE_ID) {
  placeEntity(realm, captain, entity => entity.type === 'siteEntrance' && entity.data.siteId === siteId);
  ok(await realm.command(captain, 'enterSite', { siteId }));
}

async function exit(realm, captain) {
  placeEntity(realm, captain, entity => entity.type === 'siteExit');
  ok(await realm.command(captain, 'exitSite', {}));
}

async function act(realm, captain, objectId, action, extra = {}, requestId = '') {
  placeObject(realm, captain, objectId);
  return ok(await realm.command(captain, 'fieldWorkAction', { objectId, action, ...extra }, requestId));
}

function tick(realm, inputs = new Map(), count = 1, dt = 1 / 30) {
  for (let index = 0; index < count; index++) {
    for (const captain of realm.captains.values()) if (captain.session) {
      assert.equal(realm.acceptInput(captain, captain.inputSeq + 1, inputs.get(captain.id) || {}), true);
    }
    realm.step(dt, realm.tick + 1, Date.now());
    assert.ok(!realm.failed);
  }
}

async function drain(realm, captain) {
  await act(realm, captain, 'workshop-cutter', 'claim');
  await act(realm, captain, 'service-panel', 'cut');
  await act(realm, captain, 'workshop-bridge', 'claim');
  await act(realm, captain, 'pump-terminal', 'bridge');
}

function waitForRecovery(realm, captain) {
  for (let ticks = 0; ticks < 210 && field(captain).foreman.phase !== 'recovery'; ticks++) tick(realm);
  assert.equal(field(captain).foreman.phase, 'recovery', 'a real telegraph and sweep reach the safe release window');
}

async function disable(realm, captain) {
  await drain(realm, captain);
  Object.assign(captain.game.state.person, point(36, 40));
  waitForRecovery(realm, captain);
  await act(realm, captain, 'release-port', 'release');
  await act(realm, captain, 'release-starboard', 'release');
  await act(realm, captain, 'shortcut-lever', 'open');
  assert.equal(field(captain).foreman.disabled, true);
}

async function restart(fixture) {
  fixture.realm.markDirty(); await fixture.realm.flush();
  const realm = new Realm({ id: fixture.realm.id, version: fixture.persistence.version,
    snapshot: structuredClone(fixture.persistence.snapshot), persistence: fixture.persistence,
    onConflict(_realm, error) { throw error; } });
  const captains = fixture.captains.map(value => realm.captains.get(value.id));
  for (const captain of captains) ok(realm.attach(captain, { close() {} }));
  return { realm, captains, persistence: fixture.persistence };
}

test('two captains share field gates and revisioned collision, including an already cached surface', async () => {
  const { realm, captains: [one, two] } = await fixture();
  const shared = encounter(one), initial = realm._surface(two), service = point(12, 27), crossing = point(34, 27), shortcut = point(22, 44);
  assert.equal(shared, encounter(two)); assert.equal(shared, realm.sites[one.game.state.exploration.key]);
  assert.equal(realm.roomInfo(one).id, realm.roomInfo(two).id);
  for (const captain of [one, two]) for (const position of [service, crossing, shortcut]) {
    assert.equal(isWalkable(realm._surface(captain), position.x, position.y), false);
  }

  Object.assign(two.game.state.person, point(12, 31));
  tick(realm, new Map([[two.id, { y: -1 }]]), 24);
  assert.ok(two.game.state.person.y >= service.y + TILE / 2 + (two.game.state.person.radius || 6), 'the intact panel stops movement before the blocked gallery tile');
  await act(realm, one, 'workshop-cutter', 'claim');
  await act(realm, one, 'service-panel', 'cut');
  assert.equal(encounter(two), shared, 'work updates the shared encounter rather than replacing another captain’s state');
  assert.equal(field(two).serviceCut, true);
  const rebuilt = realm._surface(two);
  assert.notEqual(rebuilt.combatLayout, initial.combatLayout, 'another captain’s warmed collision cache is invalidated by the gate revision');
  assert.ok(rebuilt.fieldRevision > initial.fieldRevision);
  for (const captain of [one, two]) assert.equal(isWalkable(realm._surface(captain), service.x, service.y), true);
  tick(realm, new Map([[two.id, { y: -1 }]]), 48);
  assert.ok(two.game.state.person.y < 25 * TILE, 'the second captain can now walk through the opened passage');

  await act(realm, one, 'workshop-bridge', 'claim');
  await act(realm, one, 'pump-terminal', 'bridge');
  await act(realm, one, 'shortcut-lever', 'open');
  for (const captain of [one, two]) for (const position of [crossing, shortcut]) {
    assert.equal(isWalkable(realm._surface(captain), position.x, position.y), true);
  }
  const snapshot = realm.snapshotFor(two, { compact: true });
  assert.equal(snapshot.state.exploration.encounter.field.revision, field(one).revision);
  assert.equal(snapshot.state.exploration.encounter.field.shortcutOpen, true);
});

test('tools and work receipts are personal while qualification pay survives retries and a two-person rejoin', async () => {
  const f = await fixture(), { realm, captains: [one, two] } = f;
  const assignmentId = 'engineering-safe-access', before = [one.game.state.credits, two.game.state.credits];
  for (const captain of [one, two]) {
    placeObject(realm, captain, 'workshop-cutter');
    ok(await realm.command(captain, 'fieldWorkAction', { action: 'begin', assignmentId }));
  }
  await act(realm, one, 'service-panel', 'inspect');
  await act(realm, one, 'workshop-cutter', 'claim');
  const claimed = receipts(one).length;
  await act(realm, one, 'workshop-cutter', 'claim');
  assert.equal(receipts(one).length, claimed, 'checking an issued tool cannot duplicate proof');
  assert.equal(one.game.state.fieldWork.tools.cutter, true);
  assert.equal(two.game.state.fieldWork.tools.cutter, false);
  await act(realm, one, 'service-panel', 'cut');
  await act(realm, one, 'pump-terminal', 'inspect');
  assert.equal(field(two).serviceCut, true); assert.equal(receipts(two).length, 0);
  placeObject(realm, two, 'workshop-cutter');
  assert.equal((await realm.command(two, 'fieldWorkAction', { action: 'settle', assignmentId })).code, 'evidence');

  placeObject(realm, one, 'workshop-cutter');
  const payload = { action: 'settle', assignmentId }, requestId = 'first-engineering-qualification';
  assert.equal(ok(await realm.command(one, 'fieldWorkAction', payload, requestId)).paid, 145);
  ok(await realm.command(one, 'fieldWorkAction', payload, requestId));
  assert.equal(one.game.state.credits, before[0] + 145); assert.equal(two.game.state.credits, before[1]);
  assert.equal(realm.snapshotFor(two, { compact: true }).state.fieldWork.tools.cutter, false);

  const saved = await restart(f), [returned, friend] = saved.captains;
  assert.equal(encounter(returned), encounter(friend)); assert.equal(field(friend).serviceCut, true);
  assert.equal(returned.game.state.fieldWork.tools.cutter, true); assert.equal(friend.game.state.fieldWork.tools.cutter, false);
  assert.equal(receipts(friend).length, 0); assert.equal(receipts(returned).length, 4);
  ok(await saved.realm.command(returned, 'fieldWorkAction', payload, requestId));
  assert.equal((await saved.realm.command(returned, 'fieldWorkAction', payload, 'new-duplicate-pay')).code, 'completed');
  assert.equal(returned.game.state.credits, before[0] + 145);
  placeObject(saved.realm, friend, 'workshop-cutter');
  assert.equal((await saved.realm.command(friend, 'fieldWorkAction', payload)).code, 'evidence');

  // A later worker may inspect and verify an already repaired route, but must
  // personally visit each object and collect their own issued tool.
  const revision = field(friend).revision;
  await act(saved.realm, friend, 'service-panel', 'inspect');
  await act(saved.realm, friend, 'workshop-cutter', 'claim');
  await act(saved.realm, friend, 'service-panel', 'cut');
  await act(saved.realm, friend, 'pump-terminal', 'inspect');
  assert.equal(field(friend).revision, revision, 'verification does not reopen or duplicate the world gate');
  placeObject(saved.realm, friend, 'workshop-cutter');
  assert.equal(ok(await saved.realm.command(friend, 'fieldWorkAction', payload)).paid, 145);
  assert.equal(friend.game.state.credits, before[1] + 145);
});

test('field commands reject forged tools, evidence, payment, identity and distant or incapacitated actions', async () => {
  const { realm, captains: [one, two] } = await fixture();
  const before = { field: structuredClone(field(one)), work: structuredClone(one.game.state.fieldWork), credits: one.game.state.credits };
  const forged = { actorId: two.id, captainId: two.id, tools: ['field_cutter', 'power_bridge'], reward: 999999, paid: 999999,
    evidence: [{ kind: 'cut', siteId: FIELD_SITE_ID, objectId: 'service-panel' }], completed: { 'engineering-safe-access': true } };
  assert.equal((await realm.command(one, 'fieldWorkAction', { ...forged, action: 'cut', objectId: 'service-panel' })).code, 'distance');
  assert.equal((await realm.command(one, 'fieldWorkAction', { ...forged, action: 'claim', objectId: 'free-money' })).code, 'action');
  placeObject(realm, one, 'service-panel');
  assert.equal((await realm.command(one, 'fieldWorkAction', { ...forged, action: 'cut', objectId: 'service-panel' })).code, 'requirements');
  placeObject(realm, one, 'workshop-cutter');
  assert.equal((await realm.command(one, 'fieldWorkAction', { ...forged, action: 'begin', assignmentId: 'engineering-commission' })).code, 'qualification');
  one.game.state.person.down = true;
  assert.equal((await realm.command(one, 'fieldWorkAction', { ...forged, action: 'claim', objectId: 'workshop-cutter' })).code, 'incapacitated');
  one.game.state.person.down = false;
  assert.deepEqual(field(one), before.field); assert.deepEqual(one.game.state.fieldWork, before.work); assert.equal(one.game.state.credits, before.credits);

  ok(await realm.command(one, 'fieldWorkAction', { action: 'begin', assignmentId: 'engineering-safe-access' }));
  assert.equal((await realm.command(one, 'fieldWorkAction', { ...forged, action: 'settle', assignmentId: 'engineering-safe-access' })).code, 'evidence');
  assert.equal(one.game.state.credits, before.credits);
  await act(realm, two, 'workshop-cutter', 'claim', { actorId: one.id, captainId: one.id, reward: 999999 });
  assert.equal(two.game.state.fieldWork.tools.cutter, true); assert.equal(one.game.state.fieldWork.tools.cutter, false);
  assert.equal(receipts(one).length, 0);
  await exit(realm, one);
  assert.equal((await realm.command(one, 'fieldWorkAction', { ...forged, action: 'claim', objectId: 'workshop-cutter' })).code, 'location');
});

test('the shared Foreman advances once per server tick and retains latched interlocks through retreat and restart', async () => {
  const f = await fixture(), { realm, captains: [one, two] } = f;
  await drain(realm, one);
  for (const captain of [one, two]) Object.assign(captain.game.state.person, point(36, 40));
  tick(realm);
  assert.equal(field(one).foreman.phase, 'telegraph'); assert.equal(field(one).foreman.timer, FOREMAN_TIMING.telegraph);
  const time = encounter(one).time, timer = field(one).foreman.timer;
  tick(realm);
  assert.ok(Math.abs(encounter(one).time - time - 1 / 30) < 1e-9, 'one shared site clock, regardless of its two occupants');
  assert.ok(Math.abs(field(one).foreman.timer - timer + 1 / 30) < 1e-9, 'one machine timer decrement, regardless of its two occupants');
  assert.equal(field(one).foreman, field(two).foreman);
  placeObject(realm, one, 'release-port');
  assert.equal((await realm.command(one, 'fieldWorkAction', { objectId: 'release-port', action: 'release' })).code, 'requirements');
  Object.assign(one.game.state.person, point(36, 40));
  waitForRecovery(realm, one);
  await act(realm, one, 'release-port', 'release');
  const shared = encounter(one), attempt = shared.field.foreman.attempt;
  await exit(realm, one);
  assert.equal(shared.field.foreman.phase, 'recovery', 'one departure cannot reset a machine still occupied by another player');
  await exit(realm, two);
  assert.equal(shared.field.foreman.phase, 'idle'); assert.equal(shared.field.foreman.attempt, attempt + 1);
  assert.equal(shared.field.releases.port, true); assert.equal(shared.field.drained, true);

  await enter(realm, one); await enter(realm, two);
  for (const captain of [one, two]) Object.assign(captain.game.state.person, point(36, 40));
  waitForRecovery(realm, one);
  const wardGate = point(50, 42);
  assert.equal(isWalkable(realm._surface(two), wardGate.x, wardGate.y), false);
  await act(realm, one, 'release-starboard', 'release');
  assert.equal(field(two).foreman.disabled, true); assert.equal(field(two).foreman.phase, 'shutdown');
  assert.equal(isWalkable(realm._surface(two), wardGate.x, wardGate.y), true);
  tick(realm, new Map(), 15);
  assert.equal(field(two).foreman.phase, 'shutdown');
  const saved = await restart(f), [returned, friend] = saved.captains;
  assert.equal(encounter(returned), encounter(friend)); assert.equal(field(friend).foreman.disabled, true);
  assert.deepEqual(field(friend).releases, { port: true, starboard: true });
  assert.equal(isWalkable(saved.realm._surface(friend), wardGate.x, wardGate.y), true);
});

function route(surface, from, to) {
  const layout = surface.combatLayout, cell = position => Math.floor(position.y / TILE) * layout.cols + Math.floor(position.x / TILE);
  const start = cell(from), goal = cell(to), parent = new Map([[start, start]]), queue = [start];
  for (let index = 0; index < queue.length && !parent.has(goal); index++) {
    const current = queue[index], x = current % layout.cols, y = Math.floor(current / layout.cols);
    for (const [xx, yy] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const next = yy * layout.cols + xx, position = point(xx, yy);
      if (xx < 0 || yy < 0 || xx >= layout.cols || yy >= layout.rows || parent.has(next) || !isWalkable(surface, position.x, position.y)) continue;
      parent.set(next, current); queue.push(next);
    }
  }
  assert.ok(parent.has(goal), 'the actual survivor-to-aid route is walkable after the physical gates are opened');
  const path = [];
  for (let current = goal; current !== start; current = parent.get(current)) path.push(point(current % layout.cols, Math.floor(current / layout.cols)));
  return path.reverse();
}

test('survivors physically follow one escort, create personal rescue evidence only at safety, and support distinct later aftercare', async () => {
  const f = await fixture(), { realm, captains: [one, two] } = f;
  await disable(realm, one);
  placeObject(realm, one, 'entry-aid');
  ok(await realm.command(one, 'fieldWorkAction', { action: 'begin', assignmentId: 'rescue-mara' }));
  await act(realm, one, 'casualty-mara', 'inspect');
  await act(realm, one, 'casualty-mara', 'stabilize');
  await act(realm, one, 'casualty-mara', 'escort');
  placeObject(realm, two, 'pump-terminal');
  const original = { x: field(one).survivors.mara.x, y: field(one).survivors.mara.y };
  placeObject(realm, one, 'entry-aid');
  tick(realm, new Map(), 5);
  assert.deepEqual({ x: field(one).survivors.mara.x, y: field(one).survivors.mara.y }, original, 'a distant escort cannot pull someone through the site');
  assert.equal((await realm.command(one, 'fieldWorkAction', { action: 'handover', objectId: 'entry-aid' })).code, 'requirements');
  assert.ok(!receipts(one).some(value => value.kind === 'rescue'));

  placeObject(realm, one, 'casualty-mara');
  const surface = realm._surface(one), aid = surface.entities.find(value => value.data?.fieldObjectId === 'entry-aid');
  const path = route(surface, one.game.state.person, aid);
  const revision = field(one).revision, dt = .1;
  let next = 0, observedMotion = false;
  // Walk the captain through real Realm inputs, waiting when the injured worker
  // falls behind. The survivor must choose and traverse its own collision path.
  for (let steps = 0; steps < 650 && field(one).survivors.mara.status !== 'safe'; steps++) {
    const person = one.game.state.person, survivor = field(one).survivors.mara;
    while (next < path.length && Math.hypot(path[next].x - person.x, path[next].y - person.y) < 1) next++;
    const target = path[next] || aid, distance = Math.hypot(person.x - survivor.x, person.y - survivor.y);
    const input = distance > 90 ? {} : { x: (target.x - person.x) / (112 * dt), y: (target.y - person.y) / (112 * dt) };
    tick(realm, new Map([[one.id, input]]), 1, dt);
    if (!observedMotion && Math.hypot(survivor.x - original.x, survivor.y - original.y) > 10) {
      observedMotion = true;
      const view = realm._surface(two).entities.find(value => value.data?.fieldObjectId === 'casualty-mara');
      assert.equal(view.x, survivor.x); assert.equal(view.y, survivor.y);
      assert.equal(realm.snapshotFor(two, { compact: true }).state.exploration.encounter.field.survivors.mara.x, survivor.x);
      assert.equal(field(one).revision, revision, 'moving survivor views refresh without pretending that a wall changed');
    }
  }
  assert.equal(observedMotion, true); assert.equal(field(one).survivors.mara.status, 'safe');
  assert.ok(field(one).survivors.mara.travel[one.id] >= 72);
  assert.deepEqual(field(one).survivors.mara.escorts, [one.id]);
  assert.equal(receipts(two).length, 0);
  const credits = one.game.state.credits;
  const handover = await act(realm, one, 'entry-aid', 'handover');
  assert.ok(handover.evidence.some(value => value.objectId === 'casualty-mara' && value.kind === 'rescue'));
  assert.ok(receipts(one).some(value => value.objectId === 'casualty-mara' && value.kind === 'rescue'));
  assert.equal(ok(await realm.command(one, 'fieldWorkAction', { action: 'settle', assignmentId: 'rescue-mara' })).paid, 150);
  assert.equal(one.game.state.credits, credits + 150);

  placeObject(realm, two, 'entry-aid');
  assert.equal((await realm.command(two, 'fieldWorkAction', { action: 'handover', objectId: 'entry-aid' })).code, 'requirements');
  await act(realm, two, 'casualty-mara', 'inspect');
  await act(realm, two, 'casualty-mara', 'stabilize');
  const aftercare = await act(realm, two, 'entry-aid', 'handover');
  assert.ok(aftercare.evidence.some(value => value.objectId === 'casualty-mara' && value.kind === 'aftercare'));
  assert.ok(!receipts(two).some(value => value.kind === 'rescue'), 'follow-up treatment does not claim the original evacuation');
  const saved = await restart(f), [returned, friend] = saved.captains;
  assert.equal(field(friend).survivors.mara.status, 'safe');
  assert.deepEqual(field(friend).survivors.mara.escorts, [returned.id]);
  assert.ok(receipts(friend).some(value => value.kind === 'aftercare'));
  assert.equal(returned.game.state.credits, credits + 150);
});

test('a disconnected escort cannot move or earn rescue credit in the library annex and may resume after rejoining', async () => {
  const { realm, captains: [one, two] } = await fixture();
  await act(realm, one, 'workshop-bridge', 'claim');
  const body = realm._room('vesper').runtime.bodies.find(value => value.id === 'lilt');
  assert.ok(body);
  for (const captain of [one, two]) {
    await exit(realm, captain);
    const vessel = realm.vessels.get(captain.ownedVesselId);
    Object.assign(vessel, { systemId: 'vesper', dockedAt: body.id, helmOwner: null, actor: null });
    Object.assign(vessel.ship, { x: body.x, y: body.y + body.radius + 60, vx: 0, vy: 0 });
    realm._landCharacter(captain, 'vesper', body.id);
    await enter(realm, captain, 'archive-annex');
  }
  await act(realm, one, 'pump-terminal', 'bridge');
  await act(realm, one, 'casualty-lin', 'stabilize');
  await act(realm, one, 'casualty-lin', 'escort');
  assert.equal(field(one).foreman, null, 'annex participation must not depend on a boss being present');
  const ahead = point(20, 17);
  assert.equal(isWalkable(realm._surface(one), ahead.x, ahead.y), true);
  Object.assign(one.game.state.person, ahead);
  const before = { x: field(one).survivors.lin.x, y: field(one).survivors.lin.y };
  realm.detach(one, one.session);
  tick(realm, new Map(), 5);
  const waiting = field(two).survivors.lin;
  assert.equal(one.session, null); assert.ok(two.session);
  assert.equal(waiting.status, 'stabilized'); assert.equal(waiting.escortId, null);
  assert.deepEqual({ x: waiting.x, y: waiting.y }, before, 'disconnect grace cannot leave a ghost escort walking Lin');
  assert.equal(waiting.travel[one.id] || 0, 0); assert.deepEqual(waiting.escorts, []);

  ok(realm.attach(one, { close() {} }));
  await act(realm, one, 'casualty-lin', 'escort');
  Object.assign(one.game.state.person, ahead);
  tick(realm, new Map(), 3);
  assert.equal(field(two).survivors.lin.status, 'following');
  assert.ok(field(two).survivors.lin.x < before.x, 'a present escort can explicitly resume the same physical rescue');
});
