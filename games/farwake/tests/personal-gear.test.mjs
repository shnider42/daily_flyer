import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { PERSONAL_WEAPONS, SIDEARM, ensureSidearm, getPersonalWeapon, personalWeaponDamage, sidearmAim, clearSidearmSight } from '../dist/combat.mjs';
import { personalGearProgress } from '../dist/personal-gear.mjs';
import { generateSurface } from '../dist/surface.mjs';
import { cabinLayout, isCabinWalkable } from '../dist/fleet.mjs';
import { placeRaider } from './helpers/combat-fixtures.mjs';

const ok = result => { assert.equal(result?.ok, true, result?.reason); return result; };
const close = (one, two) => assert.ok(Math.abs(one - two) < 1e-8, `${one} != ${two}`);
function outfit({ seed = 'personal-gear', startMode = 'regular', traits = [] } = {}) {
  const game = new Game(seed, { startMode, character: { traits } });
  if (game.state.mode === 'ship') ok(game.dock('kettle'));
  const surface = generateSurface(game.currentBody, game.state.seed, game.state.flags), shop = surface.entities.find(entity => entity.type === 'mechanic');
  assert.ok(shop); game._surfaceForInteraction = () => surface; Object.assign(game.state.person, { x: shop.x, y: shop.y });
  return game;
}
function experienced(game, jobs = 18, systems = 8, credits = 6000) {
  game.state.stats.jobs = jobs; game.state.visited = game.galaxy.slice(0, systems).map(system => system.id); game.state.credits = credits;
}
function boarded(weapon, traits = []) {
  const game = outfit({ seed: `gear-boarding-${weapon}`, traits }); experienced(game); ok(game.buyPersonalWeapon(weapon)); ok(game.launch());
  const enemy = placeRaider(game, { x: game.state.ship.x + 80, y: game.state.ship.y, hp: 14, disabled: true, cooldown: 999, speed: 0 });
  ok(game.boardEnemy(enemy.id));
  const layout = cabinLayout(game.state.boarding.shipClass), target = game.state.boarding.enemies[0];
  Object.assign(target, layout.combatSpawns[0], { health: 1000, maxHealth: 1000, cooldown: 999, speed: 0 });
  const point = { x: (layout.spawn.x + target.x) / 2, y: (layout.spawn.y + target.y) / 2 };
  assert.ok(clearSidearmSight(layout, point, target)); Object.assign(game.state.person, point);
  for (const other of game.state.boarding.enemies.slice(1)) other.health = 0;
  game.drainEvents(); return { game, target, layout };
}

test('old captains keep their standard sidearm and saved ownership is normalized without trusting invented stats', () => {
  const old = new Game('old-personal-kit').save(); delete old.person.ownedWeapons; old.person.weapon = 'breach-rifle';
  let game = Game.fromSave(old); assert.equal(getPersonalWeapon(game.state.person), SIDEARM); assert.deepEqual(game.state.person.ownedWeapons, [SIDEARM.id]);
  const raw = game.save(); raw.person.ownedWeapons = ['field-carbine', 'field-carbine', 'breach-rifle', 'made-up']; raw.person.weapon = 'breach-rifle'; raw.person.damage = 90000;
  game = Game.fromSave(raw); assert.deepEqual(game.state.person.ownedWeapons, ['pulse-sidearm', 'field-carbine', 'breach-rifle']); assert.equal(getPersonalWeapon(game.state.person).damage, 72);
  const again = Game.fromSave(game.save()); assert.equal(again.state.person.weapon, 'breach-rifle'); assert.deepEqual(again.state.person.ownedWeapons, game.state.person.ownedWeapons);
  assert.equal(new Game('forged-creation', { ownedWeapons: ['breach-rifle'], weapon: 'breach-rifle', person: raw.person }).state.person.weapon, SIDEARM.id);
});

test('experience counts completed service work once and validates distinct systems instead of landing entries', () => {
  const game = outfit(); game.state.stats.jobs = 5;
  game.state.professions.careers.paramedic.completed = 1; game.state.professions.careers.doctor.completed = 2;
  game.state.professions.careers.invented = { completed: 99999 };
  game.state.visited = ['hearth', 'hearth', 'hearth/kettle', 'hearth/morrow', 'hearth/tinbell', 'invented', 'vesper/listening', 'vesper', 'meridian'];
  assert.deepEqual(personalGearProgress(game), { jobs: 5, assignments: 3, completed: 8, systems: 3 });
  game.state.credits = 1400; assert.equal(game.personalWeaponInfo('field-carbine').ok, true);
  game.state.professions.careers.paramedic.completed = 0; game.state.professions.careers.doctor.completed = 0;
  assert.equal(game.personalWeaponInfo('field-carbine').code, 'requirements');
  experienced(game, 18, 7); assert.equal(game.personalWeaponInfo('breach-rifle').code, 'requirements');
  game.state.visited.push('hearth/kettle', 'hearth/morrow'); assert.equal(game.personalWeaponInfo('breach-rifle').code, 'requirements');
  game.state.visited.push(game.galaxy[7].id); assert.equal(game.personalWeaponInfo('breach-rifle').ok, true);
});

test('both personal weapons have reachable exact prices and auto-equip without a ship or cargo payment', () => {
  const game = outfit({ startMode: 'hardcore' }), beforeShip = structuredClone(game.state.ship), beforeCargo = structuredClone(game.state.cargo);
  experienced(game, 6, 3, 1399); assert.equal(game.buyPersonalWeapon('field-carbine').code, 'cost');
  game.state.credits = 1400; ok(game.buyPersonalWeapon('field-carbine')); assert.equal(game.state.credits, 0); assert.equal(game.state.person.weapon, 'field-carbine');
  assert.equal(game.buyPersonalWeapon('field-carbine').code, 'owned'); assert.equal(game.state.credits, 0); assert.equal(game.ownsShip, false);
  experienced(game, 18, 8, 4200); ok(game.buyPersonalWeapon('breach-rifle')); assert.equal(game.state.credits, 0); assert.equal(game.state.person.weapon, 'breach-rifle');
  assert.deepEqual(game.state.ship, beforeShip); assert.deepEqual(game.state.cargo, beforeCargo); assert.deepEqual(game.state.fleet.owned, []);
  game._boardingShotTimer = .63; game.state.person.weaponReadyAt = 201; game.state.person.attackUntil = 200;
  ok(game.equipPersonalWeapon(SIDEARM.id)); assert.equal(game._boardingShotTimer, .63); assert.equal(game.state.person.weaponReadyAt, 201); assert.equal(game.state.person.attackUntil, 200);
  ok(game.equipPersonalWeapon('field-carbine')); assert.equal(game.state.credits, 0); assert.equal(game.state.person.weapon, 'field-carbine');
});

test('buying and equipping need a conscious captain physically beside the inhabited outfitter', () => {
  const game = outfit(); experienced(game); const point = { x: game.state.person.x, y: game.state.person.y }, credits = game.state.credits;
  game.state.person.x += 100; assert.equal(game.buyPersonalWeapon('field-carbine').code, 'distance');
  Object.assign(game.state.person, point); game.state.person.down = true; assert.equal(game.buyPersonalWeapon('field-carbine').code, 'incapacitated'); game.state.person.down = false;
  game.state.interior = { kind: 'ship', location: { kind: 'ship' } }; assert.equal(game.buyPersonalWeapon('field-carbine').code, 'location'); game.state.interior = null;
  assert.equal(game.buyPersonalWeapon('invented').code, 'target'); assert.equal(game.equipPersonalWeapon('breach-rifle').code, 'owned'); assert.equal(game.state.credits, credits);
  ok(game.buyPersonalWeapon('field-carbine')); game.state.person.x += 100; assert.equal(game.equipPersonalWeapon(SIDEARM.id).code, 'distance'); assert.equal(game.state.person.weapon, 'field-carbine');
});

test('aim, hit size, and shell penetration use the owned weapon while concealed targets require local sight', () => {
  const layout = { cols: 40, rows: 40, tile: 24, width: 960, height: 960, walkable: Array(1600).fill(1) }, person = ensureSidearm({ x: 240, y: 240, facing: 'right' });
  const target = { id: 'target', x: 430, y: 240, health: 100, armor: 20 };
  assert.equal(sidearmAim(person, [target], {}, layout).hit, false);
  person.ownedWeapons.push('field-carbine'); person.weapon = 'field-carbine'; assert.equal(sidearmAim(person, [target], {}, layout).weaponId, 'field-carbine'); assert.equal(sidearmAim(person, [target], {}, layout).hit, true);
  assert.equal(personalWeaponDamage(person, target), 23); person.ownedWeapons.push('breach-rifle'); person.weapon = 'breach-rifle'; assert.equal(personalWeaponDamage(person, target), 72);
  person.weapon = SIDEARM.id; assert.equal(personalWeaponDamage(person, target), 4); assert.equal(personalWeaponDamage(person, { armor: 200 }), 1);
  person.weapon = 'breach-rifle'; target.concealed = true; target.revealed = false; assert.equal(sidearmAim(person, [target], { aiming: true, aimX: 1 }, layout).hit, false);
  target.revealed = true; assert.equal(sidearmAim(person, [target], {}, layout).hit, true); target.hidden = true; assert.equal(sidearmAim(person, [target], {}, layout).hit, false);
  target.hidden = false; target.concealed = false; target.y += 14; assert.equal(sidearmAim(person, [target], { aiming: true, aimX: 1 }, layout).hit, false);
  target.hitRadius = 16; assert.equal(sidearmAim(person, [target], { aiming: true, aimX: 1 }, layout).hit, true);
});

test('purchased weapons apply real boarding damage, range, cooldown, shot identity, and shooter traits', () => {
  for (const id of ['field-carbine', 'breach-rifle']) {
    const { game, target } = boarded(id, ['hot_cell']), weapon = getPersonalWeapon(game.state.person), effects = game.characterEffects;
    const hit = ok(game.attackBoarder(target.id)); close(1000 - target.health, weapon.damage * effects.sidearmDamage); close(game._boardingShotTimer, weapon.cooldown * effects.sidearmCooldown);
    assert.equal(hit.shot.weaponId, id); close(hit.shot.until - hit.shot.at, weapon.shotDuration); assert.equal(game.attackBoarder(target.id).code, 'cooldown');
    assert.equal(Game.fromSave(game.save()).state.person.weapon, id);
  }
  assert.equal(PERSONAL_WEAPONS.length, 3);
});

test('an upgraded captain does not upgrade the independently firing NPC crew', () => {
  const { game, target, layout } = boarded('breach-rifle');
  const point = { x: target.x + 120, y: target.y }; assert.ok(isCabinWalkable(layout, point.x, point.y)); assert.ok(clearSidearmSight(layout, point, target));
  game.state.crew = [{ id: 'ordinary-guard', name: 'Guard', role: 'security', health: 140, maxHealth: 140, status: 'active' }];
  game.state.boarding.allies = [{ id: 'guard-actor', crewId: 'ordinary-guard', name: 'Guard', role: 'security', ...point, health: 140, maxHealth: 140, team: 'friendly', damage: 16, cooldown: 0, speed: 64 }];
  game.step(1 / 60, {}); assert.equal(target.health, 984);
  const shot = game.drainEvents().find(event => event.type === 'person-shot' && event.attackerId === 'guard-actor'); assert.equal(shot.weaponId, SIDEARM.id); assert.equal(shot.damage, 16); assert.equal(game.state.stats.personShots || 0, 0);
});
