import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { createNpcContract } from '../dist/npc-contracts.mjs';
import { rescueOccupants, normalizeRescueShip, rescueDisposition } from '../dist/rescue-rules.mjs';
import { SPECIES_IDS } from '../dist/species.mjs';
import { withHull } from './helpers/fleet-fixtures.mjs';

const ok = result => { assert.equal(result?.ok, true, result?.reason || JSON.stringify(result)); return result; };
const identities = people => people.map(({ id, name, species }) => ({ id, name, species }));
function portGame(seed, systemId = 'chorus', bodyId = 'chora') {
  const game = new Game(seed);
  game.state.systemId = systemId; game._loadSystem(systemId);
  game.state.mode = 'person'; game.state.locationId = bodyId; game.state.interior = null;
  return game;
}
function rescueGame() {
  const game = withHull(new Game('species-rescue-continuity'), 'quill');
  ok(game.takeRescueOccupants('lifeboat', 'rescue', { sourceId: 'species-distress' }));
  return game;
}

test('rescued identities survive normalization, public manifest, hijacking, and repeated save/load', () => {
  let game = rescueGame();
  const group = game.state.ship.rescueGroups[0];
  group.members[0].species = 'vaeli'; group.members[1].species = 'keth';
  const before = identities(group.members), intent = { pirates: group.pirates, revealAfter: group.revealAfter };
  for (let index = 0; index < 3; index++) {
    normalizeRescueShip(game.state.ship);
    assert.deepEqual(identities(rescueOccupants(game.state.ship)), before);
    game = Game.fromSave(game.save());
    assert.deepEqual(identities(game.state.ship.rescueGroups[0].members), before);
  }
  const restored = game.state.ship.rescueGroups[0];
  assert.deepEqual({ pirates: restored.pirates, revealAfter: restored.revealAfter }, intent);
  restored.pirates = true;
  ok(game._beginRescueHijack(restored));
  assert.deepEqual(identities(game.state.boarding.enemies), before);
  const combatCopy = Game.fromSave(game.save());
  assert.deepEqual(identities(combatCopy.state.boarding.enemies), before);
  assert.deepEqual(identities(rescueOccupants(combatCopy.state.ship)), before);
});

test('legacy and malformed rescued species safely remain human without changing identities or intent', () => {
  const game = rescueGame(), group = game.state.ship.rescueGroups[0];
  const names = group.members.map(member => member.name), intent = group.pirates;
  delete group.members[0].species; group.members[1].species = '__proto__';
  const restored = Game.fromSave(game.save()), people = rescueOccupants(restored.state.ship);
  assert.deepEqual(people.map(member => member.species), ['human', 'human']);
  assert.deepEqual(people.map(member => member.name), names);
  assert.equal(restored.state.ship.rescueGroups[0].pirates, intent);
  const outcome = rescueDisposition(game.state.seed, game.state.systemId, 'species-distress', 'lifeboat');
  assert.equal(intent, outcome.pirates);
});

test('new working crews use origin populations once and keep the same roles, rewards, and random stream', () => {
  const game = portGame('species-working-crew'), offer = game.npcContractOffers().find(value => value.familyId === 'freight');
  const rng = game.state.rng, result = ok(createNpcContract(game, offer.roleId, { offerId: offer.offerId }));
  assert.equal(result.contract.reward, offer.reward);
  assert.equal(game.state.rng, rng, 'Creating people cannot consume the encounter/loot random stream.');
  assert.deepEqual(result.inventory.crew.map(member => member.role), ['pilot', 'deckhand']);
  assert.ok(result.inventory.crew.every(member => SPECIES_IDS.includes(member.species)));
  assert.ok(result.inventory.crew.some(member => member.species !== 'human'), 'This homeworld crew includes its residents.');
  assert.equal(result.contract.assignment.pilotName, result.inventory.crew[0].name);
  assert.equal(result.contract.assignment.workerName, result.inventory.crew[1].name);
  const repeat = portGame('species-working-crew'), repeatedOffer = repeat.npcContractOffers().find(value => value.familyId === 'freight');
  const repeated = ok(createNpcContract(repeat, repeatedOffer.roleId, { offerId: repeatedOffer.offerId }));
  assert.deepEqual(identities(repeated.inventory.crew), identities(result.inventory.crew));
});

test('a solo employer crew and parked personal crew retain identity through save and return', () => {
  let game = portGame('species-working-crew');
  game.state.crew = [{ id: 'old-deckhand', name: 'Old colleague', role: 'engineer', health: 100, maxHealth: 100, status: 'active' }];
  const offer = game.npcContractOffers().find(value => value.familyId === 'freight');
  ok(game.acceptNpcContract(offer.roleId, { offerId: offer.offerId }));
  const before = identities(game.state.crew);
  game = Game.fromSave(game.save());
  assert.deepEqual(identities(game.state.crew), before);
  assert.equal(game.state.npcContract.personal.crew[0].species, 'human');
  ok(game.cancelNpcContract()); ok(game.completeNpcContract());
  assert.equal(game.state.crew[0].id, 'old-deckhand');
  assert.equal(game.state.crew[0].species, 'human');
});

test('preflight settlements do not become passenger destinations merely because someone can land there', () => {
  const game = rescueGame();
  game.state.systemId = 'greenwake'; game._loadSystem('greenwake');
  const body = game.system.bodies.find(value => value.id === 'reedbank');
  Object.assign(game.state.ship, { x: body.x, y: body.y + body.radius + 30 });
  Object.assign(game.state, { mode: 'person', locationId: body.id, interior: null });
  assert.equal(game.disembarkRescuedOccupants(body).code, 'location');
  assert.equal(rescueOccupants(game.state.ship).length, 2, 'The same people remain on their carrier.');
});
