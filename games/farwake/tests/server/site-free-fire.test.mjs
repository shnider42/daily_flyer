import test from 'node:test';
import assert from 'node:assert/strict';
import { Realm } from '../../server/realm.mjs';
import { musicContext, classifyMusicEvent } from '../../dist/music-context.mjs';

const ok = value => { assert.equal(value?.ok, true, value?.reason); return value; };
const storage = () => ({ kind: 'memory', async save(_id, version) { return { version: version + 1 }; } });
async function fixture() {
  const realm = new Realm({ id: 'FREEFIRE', seed: 'shared-free-fire', persistence: storage() }), captains = [];
  for (let index = 0; index < 3; index++) {
    const { captain } = await realm.createCaptain(`Explorer ${index + 1}`, { startMode: 'casual', startSystemId: 'hearth' });
    ok(realm.attach(captain, { close() {} })); captains.push(captain);
    const room = realm._room('hearth'); room.runtime.enemies = []; room.runtime.signals = []; room.runtime.bullets = [];
    if (index < 2) {
      const body = room.runtime.bodies.find(value => value.id === 'morrow'), vessel = realm.vessels.get(captain.ownedVesselId);
      Object.assign(vessel.ship, { x: body.x, y: body.y + body.radius + 60, vx: 0, vy: 0 });
      ok(await realm.command(captain, 'dock', { id: body.id }));
    } else ok(await realm.command(captain, 'enterCabin'));
    captain.events.length = 0; captain.game.drainEvents();
  }
  return { realm, captains };
}
function tick(realm, captain, input, dt = .1) {
  for (const person of realm.captains.values()) if (person.session) realm.acceptInput(person, person.inputSeq + 1, person === captain ? input : {});
  realm.step(dt, realm.tick + 1, Date.now());
}
const shots = captain => captain.events.filter(value => value.type === 'person-shot');
function clear(captains) { for (const captain of captains) { captain.events.length = 0; captain.game.drainEvents(); } }

test('shared peaceful port pulses reach the same room, remain harmless, and keep recharge per captain', async () => {
  const { realm, captains } = await fixture(), [one, two, elsewhere] = captains;
  const before = captains.map(value => value.game.state.person.health);
  tick(realm, one, { fire: true, aiming: true, aimX: 1, aimY: 0 });
  assert.equal(shots(one).length, 1); assert.equal(shots(two).length, 1); assert.equal(shots(elsewhere).length, 0);
  const shot = shots(one)[0]; assert.equal(shots(two)[0].id, shot.id); assert.equal(shot.attackerId, one.id);
  assert.equal(shot.hit, false); assert.equal(shot.damage, 0); assert.equal(shot.targetId, null);
  assert.equal(one.game.state.stats.personShots, 1); assert.equal(two.game.state.stats.personShots || 0, 0);
  assert.deepEqual(captains.map(value => value.game.state.person.health), before);
  clear(captains); tick(realm, one, { fire: true });
  assert.equal(shots(one).length, 0, 'Holding FIRE in a quiet room cannot bypass recharge.');
  tick(realm, two, { fire: true, aiming: true, aimX: 0, aimY: -1 });
  assert.equal(shots(two).length, 1, 'Another captain has an independent weapon cell.');
  assert.equal(shots(elsewhere).length, 0);
});

test('shared quiet-corridor fire never targets a dormant actor and is already available before check-in', async () => {
  const { realm, captains } = await fixture(), [one, two, elsewhere] = captains;
  for (const captain of [one, two]) {
    const entrance = realm._surface(captain).entities.find(value => value.type === 'siteEntrance' && value.data.siteId === 'relay-nine');
    Object.assign(captain.game.state.person, { x: entrance.x, y: entrance.y });
    ok(await realm.command(captain, 'enterSite', { siteId: 'relay-nine' }));
  }
  const state = one.game.state.exploration.encounter, target = state.monsters[0], health = state.monsters.map(value => value.health);
  assert.equal(state, two.game.state.exploration.encounter);
  Object.assign(one.game.state.person, { x: target.x + 48, y: target.y });
  clear(captains); tick(realm, one, { fire: true, aiming: true, aimX: -1, aimY: 0 });
  assert.equal(shots(one).length, 1); assert.equal(shots(two).length, 1); assert.equal(shots(elsewhere).length, 0);
  assert.equal(shots(one)[0].targetId, null); assert.equal(shots(one)[0].hit, false);
  assert.deepEqual(state.monsters.map(value => value.health), health);
  assert.ok(state.monsters.every(value => value.quietEarthDormant && value.hidden));
  assert.deepEqual(state.choices, {}); assert.equal(state.quietEarth.ambushAnnounced, false);
  for (const captain of [one, two]) {
    const snapshot = realm.snapshotFor(captain, { drainEvents: false }), score = musicContext({
      game: { state: snapshot.state, system: snapshot.world, currentBody: snapshot.state.interior.location },
      playing: true, surface: realm._surface(captain), network: { passport: { captainId: captain.id } }
    });
    assert.equal(score.observedThreat, false); assert.equal(classifyMusicEvent(shots(captain)[0], score), null);
  }
  assert.equal(one.game.state.person.weaponDrawn, true);
});

test('shared quiet cabins fire once, while a gunner at the security console cannot also emit a personal pulse', async () => {
  const { realm, captains } = await fixture(), captain = captains[2];
  tick(realm, captain, { fire: true, aiming: true, aimX: -1, aimY: 0 });
  assert.equal(shots(captain).length, 1); assert.equal(shots(captain)[0].blocked, true);
  const vessel = realm.vessels.get(captain.aboard), console = realm._surface(captain).entities.find(value => value.data?.stationRole === 'security');
  assert.ok(console); Object.assign(captain.game.state.person, { x: console.x, y: console.y });
  captain.crewRole = 'weapons'; vessel.helmOwner = null;
  clear(captains); tick(realm, captain, { fire: true });
  assert.equal(shots(captain).length, 0);
  assert.equal(captain.game.state.stats.personShots, 1);
});
