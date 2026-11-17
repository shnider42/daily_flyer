import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { getShipClass } from '../dist/fleet.mjs';
import { normalizeCasualCrewCount, reconcileCasualCrew, isCasualCrew } from '../dist/casual-crew.mjs';

const casual = (options = {}) => new Game('departure-crew', { startMode: 'casual', casualCrewCount: 25, ...options });
const ok = result => { assert.equal(result?.ok, true, result?.reason); return result; };
const lark = () => { const game = casual(); game._activateClass('lark', true); return game; };

test('any valid starting count stays a compact roster with only a physical working watch', () => {
  assert.equal(normalizeCasualCrewCount('8'), 8);
  assert.equal(normalizeCasualCrewCount(' 12 '), 12);
  assert.equal(normalizeCasualCrewCount(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
  for (const input of [-1, 1.5, NaN, Infinity, {}, [9], null, true, 'no', '', '2.2', Number.MAX_SAFE_INTEGER + 1]) assert.equal(normalizeCasualCrewCount(input), 0);
  const small = casual({ casualCrewCount: 1 }), large = casual({ casualCrewCount: 1000000 });
  assert.equal(large.casualCrewStatus().requestedCount, 1000000);
  assert.equal(large.livingCrew.length, getShipClass(large.state.ship.classId).berths - 1);
  assert.equal(large.state.ship.casualCrew.records.length, large.livingCrew.length);
  assert.equal(large.casualCrewStatus().reserveCount, 999999);
  assert.ok(JSON.stringify(large.state.ship.casualCrew).length < JSON.stringify(small.state.ship.casualCrew).length + 30);
  assert.equal(large.state.ship.hull, large.state.ship.maxHull);
  assert.equal(large.state.credits, 180);
});

test('only new Casual starts receive a crew grant and legacy voyages cannot opt in on load', () => {
  for (const startMode of ['regular', 'hardcore']) {
    const normal = new Game('old-start', { startMode }), requested = new Game('old-start', { startMode, casualCrewCount: 1000 });
    assert.deepEqual(requested.state, normal.state);
    assert.equal(requested.casualCrewStatus(), null);
  }
  const original = new Game('legacy-casual', { startMode: 'casual' }), saved = original.save();
  const loaded = new Game(saved, { startMode: 'casual', casualCrewCount: 1000 });
  assert.equal(loaded.casualCrewStatus(), null); assert.deepEqual(loaded.state.crew, []);
  const empty = casual({ casualCrewCount: 0 }); assert.equal(empty.casualCrewStatus(), null);
});

test('humans take priority over NPC berths and professions, with wounds preserved across shifts', () => {
  const game = lark(), ship = game.state.ship, engineer = game.state.crew.find(member => member.role === 'engineer');
  engineer.health = 37; engineer.status = 'injured'; ship.hull = 62; ship.energy = 44;
  game.syncCasualCrew({ humanCount: 2, humanRoles: ['helm', 'engineering'] });
  assert.equal(game.livingCrew.length, 2); assert.equal(game.livingCrew.some(member => member.role === 'engineer'), false);
  assert.equal(ship.casualCrew.records.find(member => member.id === engineer.id).status, 'reserve');
  assert.equal(ship.casualCrew.records.find(member => member.id === engineer.id).health, 37);
  assert.equal(ship.hull, 62); assert.equal(ship.energy, 44);
  game.syncCasualCrew({ humanCount: 1, humanRoles: ['helm'] });
  const returned = game.state.crew.find(member => member.id === engineer.id);
  assert.equal(returned.health, 37); assert.equal(returned.status, 'injured');
  assert.equal(ship.hull, 62); assert.equal(ship.energy, 44);
  for (const [station, role] of [['weapons', 'gunner'], ['medical', 'medic'], ['navigation', 'navigator'], ['scanner', 'scientist'], ['security', 'security']]) {
    game.syncCasualCrew({ humanCount: 2, humanRoles: ['helm', station] });
    assert.equal(game.state.crew.some(member => member.role === role), false, station);
  }
});

test('shared snapshots preserve the authority roster without adding a local replacement', () => {
  const game = lark();
  Object.assign(game.state, { multiplayer: { serverAuthoritative: true, ownedVesselId: game.state.ship.id } });
  game.state.ship.humanOccupants = 2;
  reconcileCasualCrew(game.state, { humanCount: 2, humanRoles: ['helm', 'engineering'], reservedBerths: 1 });
  Game.prototype._updateStats.call({ state: game.state }, false);
  const before = game.state.crew.map(member => member.id), loaded = Game.fromSave(game.save());
  assert.deepEqual(loaded.state.crew.map(member => member.id), before);
  assert.equal(loaded.state.crew.length, 1);
  assert.equal(loaded.state.crew.some(member => member.role === 'engineer'), false);
  assert.equal(loaded.casualCrewStatus().humanCount, 2);
});

test('patients and hired specialists retain their places while departure crew yields', () => {
  const game = lark();
  game.state.crew.push({ id: 'paid-engineer', name: 'Hired', role: 'engineer', health: 70, maxHealth: 100, status: 'injured' });
  reconcileCasualCrew(game.state, { humanCount: 2, humanRoles: ['helm'], reservedBerths: 1 });
  assert.deepEqual(game.state.crew.map(member => member.id), ['paid-engineer']);
  assert.equal(game.state.crew[0].health, 70);
  assert.equal(game.casualCrewStatus().reserveCount, 25);
});

test('death is permanent, reserve soldiers do not replace casualties mid-boarding, and reloading does not heal', () => {
  let game = lark();
  const dead = game.state.crew[0], survivor = game.state.crew[1];
  survivor.health = 31; survivor.status = 'injured';
  game.state.boarding = { kind: 'defense', phase: 'active', vesselId: game.state.ship.id, allies: game.state.crew.map(member => ({ crewId: member.id, health: member.health, maxHealth: member.maxHealth })), enemies: [] };
  game._damageCrew(dead.id, 1000, 'Test damage');
  assert.equal(game.state.crew.some(member => member.id === dead.id), true);
  assert.equal(game.livingCrew.length, 2);
  assert.equal(game.casualCrewStatus().lostCount, 1);
  game.state.boarding.phase = 'won'; game._updateStats(false);
  assert.equal(game.state.crew.some(member => member.id === dead.id), false);
  assert.equal(game.livingCrew.length, 3);
  assert.equal(game.state.crew.find(member => member.id === survivor.id).health, 31);
  game.state.ship.hull = 55; game.state.ship.energy = 13;
  game = Game.fromSave(game.save());
  assert.equal(game.state.crew.some(member => member.id === dead.id), false);
  assert.equal(game.state.ship.casualCrew.records.find(member => member.id === dead.id).health, 0);
  assert.equal(game.state.crew.find(member => member.id === survivor.id).health, 31);
  assert.equal(game.state.ship.hull, 55); assert.equal(game.state.ship.energy, 13);
  assert.equal(game.state.memorial.some(entry => entry.crewId === dead.id), true);
});

test('releasing a departure NPC stays permanent and keeps that watch berth open', () => {
  let game = lark();
  ok(game.dock('kettle'));
  const member = game.state.crew[0], id = member.id;
  ok(game.dismissCrew(id));
  assert.equal(game.livingCrew.length, 2); assert.equal(game.state.ship.casualCrew.dutyLimit, 2);
  assert.equal(game.state.crew.some(crew => crew.id === id), false);
  assert.equal(game.casualCrewStatus().lostCount, 1);
  game = Game.fromSave(game.save());
  assert.equal(game.livingCrew.length, 2); assert.equal(game.freeBerths, 1);
  assert.equal(game.state.crew.some(crew => crew.id === id), false);
  assert.equal(game.state.formerCrew.find(crew => crew.id === id).status, 'released');
});

test('changing hull size moves the same crew into reserve without losing cargo or bypassing passenger limits', () => {
  const game = lark(), ids = game.livingCrew.map(member => member.id);
  game.state.ship.hull = 60;
  assert.equal(game._canActivateClass(getShipClass('sparrow')).ok, true);
  game._activateClass('sparrow');
  assert.equal(game.livingCrew.length, 1); assert.equal(game.state.ship.casualCrew.records.length, 3);
  game._activateClass('lark'); assert.deepEqual(game.livingCrew.map(member => member.id), ids);
  game.state.ship.humanOccupants = 3;
  assert.equal(game._canActivateClass(getShipClass('sparrow')).code, 'capacity');
  game.state.ship.humanOccupants = 1;
  game._activateClass('osprey', true);
  assert.ok(game.livingCrew.some(member => member.role === 'quartermaster'));
  game.state.cargo.ore = game.state.ship.cargoCap;
  const cargo = game.state.cargo.ore;
  game.syncCasualCrew({ humanCount: 10, humanRoles: ['helm', 'weapons', 'engineering', 'navigation'] });
  assert.equal(game.state.cargo.ore, cargo);
  assert.ok(game.state.cargo.ore > game.state.ship.cargoCap, 'A departing quartermaster cannot delete cargo or block a person.');
  assert.equal(game.state.crew.filter(isCasualCrew).length, 0);
});

test('a parked hull keeps its Casual watch and a different hull cannot import it', () => {
  const game = lark(), original = game.state.ship, member = game.state.crew[0];
  member.health = 42; member.status = 'injured';
  const parked = game._parkCurrentVessel();
  const other = { ...getShipClass('sparrow').stats, id: 'other-hull', classId: 'sparrow', hull: 100, shield: 35, energy: 100, fuel: 10, humanOccupants: 1 };
  game.state.ship = other; game._updateStats(false);
  assert.equal(game.state.crew.some(isCasualCrew), false); assert.equal(game.casualCrewStatus(), null);
  game.state.ship = parked; game._updateStats(false);
  assert.equal(game.state.ship.id, original.id);
  assert.equal(game.state.crew.find(crew => crew.id === member.id).health, 42);
  assert.equal(game.casualCrewStatus().requestedCount, 25);
});
