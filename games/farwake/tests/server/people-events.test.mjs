import test from 'node:test';
import assert from 'node:assert/strict';
import { Realm } from '../../server/realm.mjs';
import { PEOPLE_ENCOUNTERS } from '../../dist/people-event-content.mjs';

const ok = value => { assert.equal(value?.ok, true, value?.reason); return value; };
const persistence = () => ({ kind: 'test-memory', async save(_id, version) { return { version: version + 1 }; } });
async function fixture(t) {
  const stamp = 1800000000000; t.mock.method(Date, 'now', () => stamp);
  const realm = new Realm({ id: 'PEOPLE01', seed: 'shared-local-people', persistence: persistence() }), captains = [];
  for (const name of ['Local listener', 'Other listener']) {
    const { captain } = await realm.createCaptain(name, { startMode: 'casual' }); ok(realm.attach(captain, { send() {}, close() {} }));
    const vessel = realm.vessels.get(captain.ownedVesselId), room = realm._room('hearth'), port = room.runtime.bodies.find(body => body.id === 'kettle');
    room.runtime.enemies = []; Object.assign(vessel.ship, { x: port.x, y: port.y + port.radius + 40, vx: 0, vy: 0 });
    ok(realm._command(captain, 'dock', { id: port.id })); captain.game.state.credits = 100; captains.push(captain);
  }
  return { realm, captain: captains[0], peer: captains[1] };
}
function approach(realm, captain, id) {
  const person = realm._surface(captain).entities.find(entity => entity.id === id); assert.ok(person, id);
  Object.assign(captain.game.state.person, { x: person.x, y: person.y }); return person;
}
function localEvent(realm, captain) {
  const speaker = approach(realm, captain, 'quest:len-vale');
  const event = captain.game.availableEncounters('person', { entityId: speaker.id }).find(value => value.peopleEvent);
  assert.ok(event); return { speaker, event };
}

test('authority rejects forged or distant local speakers and accepts only the captain’s actual encounter source', async t => {
  const { realm, captain } = await fixture(t), { speaker, event } = localEvent(realm, captain);
  const foreign = PEOPLE_ENCOUNTERS.find(value => value.peopleEvent.group === 'ledger');
  assert.equal(realm._command(captain, 'triggerEncounter', { id: foreign.id, entityId: 'quest:commissioner-ryn' }).ok, false);
  assert.equal(captain.game.state.pendingEncounter, null);
  approach(realm, captain, 'kettle:mechanic');
  assert.equal(realm._command(captain, 'triggerEncounter', { id: event.id, entityId: 'kettle:mechanic' }).ok, false, 'A nearby unrelated person cannot stand in for the participants.');
  assert.equal(realm._command(captain, 'triggerEncounter', { id: event.id, entityId: speaker.id }).ok, false, 'A valid but distant participant does not satisfy authority proximity.');
  approach(realm, captain, speaker.id);
  const answer = ok(realm._command(captain, 'surfaceAction', { entityId: speaker.id, action: 'talk' }));
  assert.equal(answer.dialogue.peopleEvent?.id, event.id);
  ok(realm._command(captain, 'triggerEncounter', { id: event.id, entityId: speaker.id }));
  assert.equal(captain.game.state.pendingEncounter.entityId, speaker.id);
  const choice = event.choices.find(value => !value.effects.credits);
  captain.game.state.person.x += 500;
  assert.equal(realm._command(captain, 'applyChoice', { encounterId: event.id, choice: choice.id }).ok, false);
  assert.deepEqual(captain.game.state.narrative.relations, {});
  approach(realm, captain, speaker.id);
  ok(realm._command(captain, 'applyChoice', { encounterId: event.id, choice: choice.id }));
  assert.ok(captain.game.state.encounterHistory.includes(event.id));
});

test('shared choices charge once and persist personal trust without granting another captain the result or Earth permission', async t => {
  const { realm, captain, peer } = await fixture(t), { speaker, event } = localEvent(realm, captain);
  const choice = event.choices.find(value => value.effects.credits < 0);
  const before = { credits: captain.game.state.credits, lore: [...captain.game.state.knownLore], flags: [...captain.game.state.flags] };
  ok(realm._command(captain, 'triggerEncounter', { id: event.id, entityId: speaker.id }));
  ok(realm._command(captain, 'applyChoice', { encounterId: event.id, choice: choice.id }));
  const expected = structuredClone(captain.game.state.narrative.relations);
  assert.equal(captain.game.state.credits, before.credits + choice.effects.credits);
  for (const [id, trust] of Object.entries(choice.peopleTrust)) assert.equal(expected[id].trust, trust);
  assert.equal(realm._command(captain, 'applyChoice', { encounterId: event.id, choice: choice.id }).ok, false);
  assert.equal(captain.game.state.credits, before.credits + choice.effects.credits);
  assert.deepEqual(captain.game.state.knownLore, before.lore);
  assert.deepEqual(captain.game.state.flags.filter(flag => flag !== 'made_choice' && !flag.startsWith('people:')), before.flags);
  assert.deepEqual(realm.snapshotFor(peer, { drainEvents: false }).state.narrative.relations, {});
  assert.equal(peer.game.state.encounterHistory.includes(event.id), false);
  const restored = new Realm({ id: realm.id, seed: realm.seed, persistence: persistence(), snapshot: realm.document() });
  const saved = restored.captains.get(captain.id), untouched = restored.captains.get(peer.id);
  assert.deepEqual(saved.game.state.narrative.relations, expected); assert.equal(saved.game.state.encounterHistory.filter(id => id === event.id).length, 1);
  assert.equal(saved.game.state.credits, before.credits + choice.effects.credits);
  assert.deepEqual(untouched.game.state.narrative.relations, {});
  assert.deepEqual(restored._solClearanceFor(saved), { entry: false, landing: false });
});
