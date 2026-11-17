import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { STARTER_SHIPS, starterShipChoices, normalizeStarterShip, getShipClass, cabinLayout, isCabinWalkable } from '../dist/fleet.mjs';
import { CASUAL_START_UPGRADES } from '../dist/livelihoods.mjs';
import { groupLaunchChoices } from '../dist/group-start.mjs';
import { generateSurface } from '../dist/surface.mjs';

const solo = (casualCrewCount = 8, extra = {}) => ({ startContext: 'solo', startMode: 'casual', casualCrewCount, ...extra });
const ok = result => { assert.equal(result?.ok, true, result?.reason); return result; };

test('Solo Casual crew counts select real fitting hulls and default eight NPCs to Osprey', () => {
  assert.deepEqual(starterShipChoices(solo()).map(hull => hull.id), ['osprey', 'atlas', 'cairn', 'capital', 'leviathan']);
  assert.equal(normalizeStarterShip('sparrow', solo()), 'osprey');
  assert.equal(normalizeStarterShip('kestrel', solo()), 'osprey');
  assert.equal(normalizeStarterShip('missing-hull', solo()), 'osprey');
  for (const hull of starterShipChoices(solo())) assert.equal(normalizeStarterShip(hull.id, solo()), hull.id);
  const expected = [[1, 'sparrow'], [2, 'tern'], [3, 'lark'], [4, 'mender'], [5, 'hauler'], [6, 'puffin'], [7, 'frigate'], [8, 'osprey'], [9, 'osprey'], [10, 'leviathan'], [15, 'leviathan']];
  for (const [count, defaultId] of expected) {
    const options = solo(count), choices = starterShipChoices(options);
    assert.equal(normalizeStarterShip(undefined, options), defaultId, `${count} NPCs`);
    assert.ok(choices.length > 0);
    assert.ok(choices.every(hull => hull.berths >= count + 1), `${count}: room for the captain and every requested NPC`);
    assert.ok(choices.every(hull => !hull.military && hull.id !== 'judicator'));
    for (let index = 1; index < choices.length; index++) {
      assert.ok(choices[index - 1].berths < choices[index].berths || choices[index - 1].berths === choices[index].berths && choices[index - 1].cost <= choices[index].cost);
    }
  }
  assert.deepEqual(starterShipChoices(solo('8')), starterShipChoices(solo(8)));
});

test('Regular, Hardcore, zero-count, and shared starts keep their original three personal ships', () => {
  for (const options of [undefined, {}, solo(0), solo(8, { startMode: 'regular' }), solo(8, { startMode: 'hardcore' }),
    { startMode: 'casual', casualCrewCount: 8 }, solo(8, { startContext: 'shared' }), solo(8, { startContext: 'SOLO' })]) {
    assert.equal(starterShipChoices(options), STARTER_SHIPS);
    assert.equal(normalizeStarterShip('osprey', options), 'sparrow');
    assert.equal(normalizeStarterShip('mule', options), 'mule');
  }
  for (const value of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '', '1e3', 'eight', true, {}, [8]]) assert.equal(starterShipChoices(solo(value)), STARTER_SHIPS);
  for (const startMode of ['regular', 'hardcore']) {
    const original = new Game(`unchanged-${startMode}`, { startMode, starterShip: 'mule' });
    const withCrewOptions = new Game(`unchanged-${startMode}`, solo(8, { startMode, starterShip: 'mule' }));
    assert.deepEqual(withCrewOptions.state, original.state);
  }
  for (const [count, hull, eligible] of [[1, 'lark', false], [2, 'lark', true], [3, 'puffin', false], [4, 'puffin', true], [6, 'osprey', false], [7, 'osprey', true]]) {
    assert.equal(groupLaunchChoices(count).find(choice => choice.id === hull).eligible, eligible, `${count} actual humans: ${hull}`);
  }
});

test('every offered eight-NPC Solo hull starts with eight distinct people visible on its walkable deck', () => {
  for (const hull of starterShipChoices(solo())) {
    const game = new Game(`solo-eight-${hull.id}`, solo(8, { starterShip: hull.id }));
    assert.equal(game.state.ship.classId, hull.id);
    assert.equal(game.state.ship.berths, hull.berths);
    assert.equal(game.state.ship.humanOccupants, 1);
    assert.equal(game.casualCrewStatus().activeCount, 8);
    assert.equal(game.casualCrewStatus().reserveCount, 0);
    assert.equal(game.livingCrew.length, 8);
    assert.equal(new Set(game.livingCrew.map(person => person.id)).size, 8);
    assert.deepEqual(game.state.fleet.owned, [hull.id]);
    assert.deepEqual(game.state.upgrades, CASUAL_START_UPGRADES);
    assert.deepEqual(game.state.completedChapters, []);
    assert.equal(game.state.credits, 180);
    assert.equal(game.hasFlag('archive_decoded'), false);
    assert.equal(game.hasFlag('ally_chosen'), false);
    ok(game.travelInfo('vesper'));
    ok(game.enterCabin());
    const surface = generateSurface(game.currentBody, game.state.seed), layout = cabinLayout(hull.id);
    const people = surface.entities.filter(entity => entity.data?.crewId);
    assert.equal(people.length, 8, `${hull.id}: physical crew, not just a roster total`);
    assert.deepEqual(people.map(person => person.data.crewId).sort(), game.livingCrew.map(person => person.id).sort());
    assert.equal(new Set(people.map(person => `${person.x}:${person.y}`)).size, 8);
    assert.ok(people.every(person => isCabinWalkable(layout, person.x, person.y)), hull.id);
  }
  const fallback = new Game('solo-eight-default', solo());
  assert.equal(fallback.state.ship.classId, 'osprey');
  assert.equal(fallback.livingCrew.length, 8);
});

test('large Solo rosters use the largest working hull without unbounded actors or invented berths', () => {
  for (const count of [16, 1000000, Number.MAX_SAFE_INTEGER]) {
    assert.deepEqual(starterShipChoices(solo(count)).map(hull => hull.id), ['leviathan']);
    const game = new Game('solo-large-roster', solo(count, { starterShip: 'judicator' }));
    assert.equal(game.state.ship.classId, 'leviathan');
    assert.equal(game.state.ship.berths, getShipClass('leviathan').berths);
    assert.equal(game.state.crew.length, 15);
    assert.equal(game.state.ship.casualCrew.records.length, 15);
    assert.equal(game.casualCrewStatus().requestedCount, count);
    assert.equal(game.casualCrewStatus().reserveCount, count - 15);
    assert.ok(JSON.stringify(game.state.ship.casualCrew).length < 11000, 'The requested count never expands the reserve into an array.');
  }
});

test('Solo crew hulls preserve identity, wounds, cargo, and depleted equipment through save and load', () => {
  const game = new Game('solo-crew-persistence', solo(8, { starterShip: 'atlas' }));
  const ids = game.livingCrew.map(person => person.id);
  Object.assign(game.state.crew[0], { health: 37, status: 'injured' });
  Object.assign(game.state.ship, { hull: 140, energy: 29, fuel: 6 });
  game.state.credits = 93; game.state.cargo.ore = 11;
  delete game.state.upgrades.fold_1; game._updateStats(false);
  const saved = game.save();
  const restored = new Game(saved, solo(1000000, { starterShip: 'leviathan', startSystemId: 'sol' }));
  assert.equal(restored.state.ship.classId, 'atlas');
  assert.equal(restored.state.systemId, 'hearth');
  assert.equal(restored.casualCrewStatus().requestedCount, 8);
  assert.equal(restored.casualCrewStatus().activeCount, 8);
  assert.deepEqual(restored.livingCrew.map(person => person.id), ids);
  assert.equal(restored.state.crew[0].health, 37);
  assert.equal(restored.state.ship.hull, 140); assert.equal(restored.state.ship.energy, 29); assert.equal(restored.state.ship.fuel, 6);
  assert.equal(restored.state.credits, 93); assert.equal(restored.state.cargo.ore, 11);
  assert.equal(restored.hasHyperdrive, false);
  assert.deepEqual(restored.state.fleet.owned, ['atlas']);
});

test('loading an existing small Casual ship does not silently replace it or grant crew again', () => {
  const old = new Game('old-casual-small', { startMode: 'casual', starterShip: 'mule', casualCrewCount: 8 });
  old.state.crew[0].health = 42;
  const saved = old.save(), restored = new Game(saved, solo());
  assert.equal(restored.state.ship.classId, 'mule');
  assert.equal(restored.livingCrew.length, 1);
  assert.equal(restored.casualCrewStatus().reserveCount, 7);
  assert.equal(restored.state.crew[0].id, old.state.crew[0].id);
  assert.equal(restored.state.crew[0].health, 42);
  assert.deepEqual(restored.state.fleet.owned, saved.fleet.owned);
});

const affected = (count = 8, starterShip = 'sparrow') => new Game('affected-casual-voyage', { startMode: 'casual', starterShip, casualCrewCount: count });

test('an affected old voyage gets a read-only fitting preview and can continue at its existing port', () => {
  const game = affected(), before = JSON.stringify(game.state), events = JSON.stringify(game.events);
  const preview = game.casualCrewShipOptions();
  assert.equal(preview.eligible, true); assert.equal(preview.ok, false); assert.equal(preview.code, 'mode');
  assert.equal(preview.recommendedShipId, 'osprey'); assert.equal(preview.cost, 0);
  assert.equal(preview.requestedCount, 8); assert.equal(preview.activeCount, 1); assert.equal(preview.reserveCount, 7);
  for (const hull of preview.choices) {
    assert.equal(hull.fit.ok, true);
    assert.deepEqual(hull.crewPreview, { activeCount: 8, reserveCount: 0, totalCount: 8, lostCount: 0 });
  }
  assert.deepEqual(game.casualCrewShipOptions(), preview);
  assert.equal(game.fitCasualCrewShip('osprey').code, 'mode');
  assert.equal(JSON.stringify(game.state), before); assert.equal(JSON.stringify(game.events), events);

  ok(game.dock('kettle'));
  const originalId = game.state.ship.id, first = game.state.crew[0];
  Object.assign(first, { health: 37, status: 'injured', name: 'My existing engineer' });
  Object.assign(game.state.ship, { hull: 55, shield: 11, fuel: 6, energy: 29 });
  game.state.credits = 93; game.state.cargo.ore = 11; game.state.stats.time = 42;
  game.state.completedJobs.push('old-work-completed'); game.state.flags.push('met_iona');
  delete game.state.upgrades.fold_1; game._updateStats(false);
  const saved = game.save(), ratios = Object.fromEntries(['hull', 'shield', 'fuel', 'energy'].map(key => [key, game.state.ship[key] / game.state.ship[`max${key[0].toUpperCase()}${key.slice(1)}`]]));
  const offer = game.casualCrewShipOptions(); assert.equal(offer.ok, true);
  const result = ok(game.fitCasualCrewShip('osprey'));
  assert.equal(result.cost, 0); assert.equal(result.activeCount, 8); assert.equal(result.reserveCount, 0);
  assert.equal(game.state.ship.id, originalId); assert.equal(game.state.ship.classId, 'osprey');
  assert.equal(game.state.crew.find(person => person.id === first.id).health, 37);
  assert.equal(game.state.crew.find(person => person.id === first.id).name, 'My existing engineer');
  assert.equal(game.hasHyperdrive, false);
  for (const key of ['credits', 'cargo', 'upgrades', 'completedJobs', 'missions', 'knownLore', 'visited', 'discovered', 'stats', 'person', 'systemId', 'locationId']) assert.deepEqual(game.state[key], saved[key], `Preserved ${key}`);
  for (const [key, expected] of Object.entries(ratios)) assert.ok(Math.abs(game.state.ship[key] / game.state.ship[`max${key[0].toUpperCase()}${key.slice(1)}`] - expected) < 1e-10, `Preserved ${key} condition`);
  assert.deepEqual(game.state.flags, [...saved.flags, 'casual_crew_ship_fitted']);
  assert.deepEqual(game.state.fleet.owned, ['sparrow', 'osprey']);
  assert.equal(game.state.fleet.history.length, 1); assert.equal(game.state.fleet.history[0].type, 'casual-crew-fit');
  assert.equal(game.state.fleet.history[0].fromClassId, 'sparrow');
  const restored = Game.fromSave(game.save()), restoredBefore = JSON.stringify(restored.state);
  assert.equal(restored.livingCrew.length, 8); assert.equal(restored.state.crew.find(person => person.id === first.id).health, 37);
  assert.equal(restored.casualCrewShipOptions().eligible, false);
  assert.equal(restored.fitCasualCrewShip('atlas').ok, false);
  assert.equal(JSON.stringify(restored.state), restoredBefore, 'The one-time correction cannot be claimed again.');
});

test('old-save previews account for patients, paid specialists, losses, and deliberately released duty slots', () => {
  const game = affected(); ok(game.dock('kettle'));
  game.state.crew.push({ id: 'paid-engineer', name: 'Paid specialist', role: 'engineer', health: 42, maxHealth: 100, status: 'injured' });
  game.state.ship.rescueGroups = [{ id: 'patients', status: 'aboard', members: Array.from({ length: 3 }, (_, index) => ({ id: `patient-${index}`, name: `Patient ${index}`, health: 60, maxHealth: 100, status: 'aboard' })) }];
  const before = JSON.stringify(game.state), offer = game.casualCrewShipOptions();
  const osprey = offer.choices.find(hull => hull.id === 'osprey');
  assert.deepEqual(osprey.crewPreview, { activeCount: 5, reserveCount: 3, totalCount: 8, lostCount: 0 });
  assert.equal(osprey.fit.ok, true); assert.equal(JSON.stringify(game.state), before);
  ok(game.fitCasualCrewShip('osprey'));
  assert.equal(game.casualCrewStatus().activeCount, osprey.crewPreview.activeCount);
  assert.equal(game.casualCrewStatus().reserveCount, osprey.crewPreview.reserveCount);
  assert.equal(game.state.crew.find(person => person.id === 'paid-engineer').health, 42);
  assert.equal(game.rescuedBerths(), 3);

  const losses = affected(); ok(losses.dock('kettle'));
  const deadId = losses.state.crew[0].id; losses._damageCrew(deadId, 1000, 'Prior voyage casualty');
  const releasedId = losses.state.crew[0].id; ok(losses.dismissCrew(releasedId));
  const lossBefore = JSON.stringify(losses.state), lossOffer = losses.casualCrewShipOptions();
  assert.equal(lossOffer.eligible, true);
  assert.deepEqual(lossOffer.choices[0].crewPreview, { activeCount: 0, reserveCount: 6, totalCount: 6, lostCount: 2 });
  assert.equal(JSON.stringify(losses.state), lossBefore);
  ok(losses.fitCasualCrewShip('osprey'));
  assert.equal(losses.livingCrew.length, 0); assert.equal(losses.state.ship.casualCrew.dutyLimit, 0);
  assert.equal(losses.casualCrewStatus().lostCount, 2); assert.equal(losses.casualCrewStatus().reserveCount, 6);
  assert.equal(losses.state.ship.casualCrew.records.find(person => person.id === deadId).health, 0);
  assert.equal(losses.state.formerCrew.find(person => person.id === releasedId).status, 'released');
});

test('old-save fitting checks each hull capacity and rejects every unoffered target without falling back', () => {
  const game = affected(); ok(game.dock('kettle'));
  for (const id of [undefined, null, {}, 'missing-hull', 'sparrow', 'lark', 'judicator', 'ark']) {
    const before = JSON.stringify(game.state);
    assert.equal(game.fitCasualCrewShip(id).code, 'target');
    assert.equal(JSON.stringify(game.state), before);
  }
  const cargo = affected(2, 'mule'); ok(cargo.dock('kettle')); cargo.state.cargo.ore = 38;
  const tern = cargo.casualCrewShipOptions().choices.find(hull => hull.id === 'tern');
  assert.equal(tern.fit.ok, false); assert.equal(tern.fit.code, 'cargo');
  const before = JSON.stringify(cargo.state);
  assert.equal(cargo.fitCasualCrewShip('tern').code, 'cargo'); assert.equal(JSON.stringify(cargo.state), before);
  assert.ok(cargo.casualCrewShipOptions().choices.some(hull => hull.fit.ok), 'A larger suitable hold remains available.');
});

test('old-save fitting cannot bypass shared authority, combat, conversations, contracts, or ship location', () => {
  const cases = [
    ['shared', game => { game.state.multiplayer = { serverAuthoritative: true, ownedVesselId: game.state.ship.id }; }],
    ['shared', game => { game._directorShared = {}; }],
    ['shared', game => { game._sharedWorld = true; }],
    ['combat', game => { game._hitTimer = 1; }],
    ['combat', game => { game.state.boarding = { phase: 'active' }; }],
    ['combat', game => { game.system.enemies.push({ id: 'nearby-attack', hp: 100, active: true, x: game.state.ship.x + 30, y: game.state.ship.y }); }],
    ['encounter', game => { game.state.pendingEncounter = { id: 'open-conversation' }; }],
    ['contract', game => { game.state.npcContract = { active: true }; }],
    ['ship-location', game => { game.state.ship.x += 3000; }],
    ['ineligible', game => { game.state.fleet.history.push({ classId: 'mule', time: 1 }); }],
    ['ineligible', game => { game.state.fleet.owned.push('mule'); }],
    ['ineligible', game => { game.state.ship.destroyed = true; }]
  ];
  for (const [code, alter] of cases) {
    const game = affected(); ok(game.dock('kettle')); alter(game);
    const before = JSON.stringify(game.state), events = JSON.stringify(game.events);
    assert.equal(game.casualCrewShipOptions({ startContext: 'solo' }).code, code);
    assert.equal(game.fitCasualCrewShip('osprey', { startContext: 'solo' }).code, code);
    assert.equal(JSON.stringify(game.state), before, code); assert.equal(JSON.stringify(game.events), events, code);
  }
  const explicitShared = new Game('shared-constructor', { startContext: 'shared', startMode: 'casual', casualCrewCount: 8 });
  assert.equal(explicitShared.casualCrewShipOptions().eligible, false);
  assert.equal(explicitShared.fitCasualCrewShip('osprey').code, 'shared');
});
