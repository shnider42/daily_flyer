import test from 'node:test';
import assert from 'node:assert/strict';
import { Realm } from '../../server/realm.mjs';
import { createSiteVisibility, visibleSiteCombatEvent } from '../../dist/site-visibility.mjs';
import { quietEarthLightState } from '../../dist/quiet-earth-lighting.mjs';
import { clearSidearmSight } from '../../dist/combat.mjs';

const point = (x, y) => ({ x: (x + .5) * 24, y: (y + .5) * 24 });
const ok = value => { assert.equal(value?.ok, true, value?.reason); return value; };
const storage = () => ({ kind: 'memory', version: 0, snapshot: null, async save(_id, version, snapshot) {
  this.snapshot = structuredClone(snapshot); this.version = version + 1; return { version: this.version };
} });
async function fixture() {
  const persistence = storage(), realm = new Realm({ id: 'RELAYLUX', seed: 'relay-shared-lights', persistence }), captains = [];
  for (let index = 0; index < 2; index++) {
    const { captain } = await realm.createCaptain(`Relay engineer ${index + 1}`, { startMode: 'casual', startSystemId: 'hearth' });
    ok(realm.attach(captain, { close() {} })); captains.push(captain);
    const room = realm._room('hearth'); room.runtime.enemies = []; room.runtime.bullets = []; room.runtime.signals = [];
    const body = room.runtime.bodies.find(item => item.id === 'morrow'), vessel = realm.vessels.get(captain.ownedVesselId);
    Object.assign(vessel.ship, { x: body.x, y: body.y + body.radius + 60, vx: 0, vy: 0 });
    ok(await realm.command(captain, 'dock', { id: body.id }));
    const entrance = realm._surface(captain).entities.find(item => item.type === 'siteEntrance' && item.data.siteId === 'relay-nine');
    Object.assign(captain.game.state.person, { x: entrance.x, y: entrance.y });
    ok(await realm.command(captain, 'enterSite', { siteId: 'relay-nine' }));
    captain.events.length = 0; captain.game.drainEvents();
  }
  return { realm, captains, persistence };
}
async function action(realm, captain, kind, id, optionId) {
  const target = realm._surface(captain).entities.find(item => item.type === kind && (item.data.choiceId === id || item.data.recordId === id));
  assert.ok(target);
  Object.assign(captain.game.state.person, { x: target.x, y: target.y });
  return ok(await realm.command(captain, 'siteAction', { entityId: target.id, action: kind === 'siteChoice' ? 'choose' : 'inspect', optionId }));
}

test('physical shared relays power the same sections for both captains and persist through a realm restart', async () => {
  const { realm, captains, persistence } = await fixture(), [one, two] = captains;
  const state = one.game.state.exploration.encounter;
  assert.equal(state, two.game.state.exploration.encounter);
  const firstRelay = realm._surface(one).entities.find(item => item.data?.choiceId === 'intake-lights');
  assert.equal((await realm.command(one, 'siteAction', { entityId: firstRelay.id, action: 'choose', optionId: 'restore' })).code, 'distance');
  assert.equal(realm._surface(two).quietEarthLighting.key, '000');
  await action(realm, one, 'siteChoice', 'check-in', 'begin');
  await action(realm, two, 'siteChoice', 'intake-lights', 'restore');
  for (const captain of captains) {
    const surface = realm._surface(captain), snapshot = realm.snapshotFor(captain, { drainEvents: false });
    assert.equal(surface.quietEarthLighting.key, '100');
    assert.equal(quietEarthLightState(snapshot.state.exploration.encounter, surface.site).key, '100');
    assert.equal(createSiteVisibility(surface, point(55, 73), { observerId: captain.id }).canSeePoint(point(70, 73)), true);
    assert.equal(createSiteVisibility(surface, point(119, 73), { observerId: captain.id }).canSeePoint(point(119, 58)), false);
    assert.ok(snapshot.state.exploration.encounter.monsters.every(actor => actor.hidden && actor.quietEarthDormant));
  }
  await action(realm, one, 'siteRecord', 'voices');
  await action(realm, two, 'siteChoice', 'breaker', 'restore');
  assert.equal(createSiteVisibility(realm._surface(one), point(119, 73)).canSeePoint(point(119, 58)), true);
  assert.equal(createSiteVisibility(realm._surface(two), point(12, 46)).canSeePoint(point(12, 32)), false);
  await action(realm, one, 'siteRecord', 'service');
  await action(realm, two, 'siteChoice', 'upper-lights', 'restore');
  assert.equal(createSiteVisibility(realm._surface(one), point(12, 46)).canSeePoint(point(12, 32)), true);
  assert.equal(createSiteVisibility(realm._surface(two), point(48, 73)).canSeePoint(point(48, 46)), false);
  realm.markDirty(); await realm.flush();
  const restored = new Realm({ id: realm.id, seed: realm.seed, version: persistence.version,
    snapshot: structuredClone(persistence.snapshot), persistence });
  for (const original of captains) {
    const captain = restored.captains.get(original.id); ok(restored.attach(captain, { close() {} }));
    assert.equal(restored._surface(captain).quietEarthLighting.key, '111');
    const snapshot = restored.snapshotFor(captain);
    assert.equal(snapshot.state.exploration.encounter.choices['intake-lights'], 'restore');
    assert.equal(snapshot.state.exploration.encounter.choices['upper-lights'], 'restore');
    assert.ok(snapshot.state.exploration.encounter.monsters.every(actor => actor.hidden && actor.quietEarthDormant));
    assert.ok(!snapshot.events.some(event => event.type === 'quiet-earth-beat'), 'Restoring lighting never replays a narrative event.');
  }
});

test('shared weapon authority and recipient presentation respect lit sight and physical cover', async () => {
  const { realm, captains } = await fixture(), [one, two] = captains, state = one.game.state.exploration.encounter;
  await action(realm, one, 'siteChoice', 'check-in', 'begin');
  await action(realm, one, 'siteRecord', 'voices');
  await action(realm, one, 'siteChoice', 'breaker', 'restore');
  await action(realm, one, 'siteRecord', 'service');
  await action(realm, one, 'siteChoice', 'receiver', 'copy');
  assert.equal(realm._surface(one).quietEarthLighting.key, '111', 'Validated pre-switch saves receive their existing completed feeds.');
  const target = state.monsters[0];
  state.monsters.slice(1).forEach(actor => { actor.health = 0; });
  Object.assign(one.game.state.person, { ...point(119, 55), weapon: 'union-longwatch', ownedWeapons: ['pulse-sidearm', 'union-longwatch'] });
  Object.assign(target, { ...point(119, 43), health: 200, maxHealth: 200, speed: 0 });
  Object.assign(two.game.state.person, point(12, 32));
  assert.equal(clearSidearmSight(realm._surface(one).combatLayout, one.game.state.person, target), false);
  one.game.drainEvents(); two.game.drainEvents();
  one.appliedInput = { fire: true, aiming: true, aimX: 0, aimY: -1 };
  realm._stepExplorations(captains, .1);
  const blocked = one.game.drainEvents().find(event => event.type === 'person-shot');
  assert.ok(blocked); assert.equal(blocked.targetId, null); assert.equal(target.health, 200);
  Object.assign(one.game.state.person, point(48, 73));
  Object.assign(target, { ...point(61, 73), speed: 0 });
  one.appliedInput = { fire: true, aiming: true, aimX: 1, aimY: 0 };
  for (let tick = 0; tick < 4; tick++) realm._stepExplorations(captains, .25);
  const seen = one.game.drainEvents().find(event => event.type === 'person-shot');
  assert.ok(seen); assert.equal(seen.targetId, target.id); assert.ok(target.health < 200);
  assert.equal(visibleSiteCombatEvent(seen, { surface: realm._surface(one), observer: one.game.state.person,
    actors: state.monsters, captainId: one.id }), seen);
  assert.equal(visibleSiteCombatEvent(seen, { surface: realm._surface(two), observer: two.game.state.person,
    actors: state.monsters, captainId: two.id }), null, 'A shared shot cannot expose an unseen actor to a captain in another hall.');
});
