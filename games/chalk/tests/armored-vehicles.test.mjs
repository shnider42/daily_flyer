import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeArmoredVehicles, damageVehicle, repairVehicle, releaseVehicle, vehicleRepairTarget,
  convoyVehicles, convoyLead, findArmoredVehicle, segmentVehicleEntry, pointBlockedByVehicle, vehiclesBlockLine,
  moveVehicleToward, vehiclePoseClear, updateArmoredVehicles, issueArmorOrder, publicVehicleView } from '../public/armored-vehicles.mjs';

function state(missionIndex = 10) {
  const state = { missionIndex, nextId: 0, time: 0, world: { width: 2400, height: 1900, walls: [], buildings: [] },
    vehicles: [], squad: [], allies: [], enemies: [], civilians: [], survivors: [] };
  initializeArmoredVehicles(state); return state;
}
const run = (state, seconds, hooks = {}) => {
  for (let frame = 0; frame < seconds * 30; frame++) { state.time += 1 / 30; updateArmoredVehicles(state, 1 / 30, hooks); }
};

test('convoy identity excludes independent tanks and survives vehicle array reordering', () => {
  const state = { missionIndex: 10, nextId: 4, vehicles: [{ id: 2, kind: 'truck', x: 300, y: 500, hp: 180 }, { id: 4, kind: 'truck', x: 200, y: 500, hp: 180 }], convoyRoute: [{ x: 300, y: 500 }, { x: 600, y: 500 }] };
  initializeArmoredVehicles(state);
  assert.deepEqual(state.convoyVehicleIds, [2, 4]);
  assert.equal(state.vehicles.length, 3);
  state.vehicles.reverse();
  assert.deepEqual(convoyVehicles(state).map(vehicle => vehicle.id), [2, 4]);
  assert.equal(convoyLead(state).id, 2);
  initializeArmoredVehicles(state);
  assert.equal(state.vehicles.length, 3, 'reinitialization does not duplicate armor');
});

test('oriented hulls block travel and incoming rays, while a ray may leave its own hull', () => {
  const game = state(), tank = game.vehicles[0];
  Object.assign(tank, { x: 500, y: 500, angle: Math.PI / 2 });
  assert.equal(pointBlockedByVehicle(game, 500, 550, 10), true);
  assert.equal(pointBlockedByVehicle(game, 550, 500, 10), false);
  assert.ok(Number.isFinite(segmentVehicleEntry(tank, { x: 300, y: 500 }, { x: 700, y: 500 })));
  assert.equal(vehiclesBlockLine(game, tank, { x: 800, y: 500 }), false);
  assert.equal(vehiclesBlockLine(game, { x: 300, y: 500 }, { x: 800, y: 500 }), true);
  tank.wreck = true;
  assert.equal(pointBlockedByVehicle(game, 500, 500), true, 'wrecks remain physical cover');
});

test('hull movement sweeps thin terrain and yields to people rather than crushing them', () => {
  const game = state(), tank = game.vehicles[0];
  Object.assign(tank, { x: 500, y: 500, angle: 0 });
  game.world.navigationSolids = [{ x: 620, y: 0, w: 8, h: 1900 }];
  moveVehicleToward(game, tank, { x: 1000, y: 500 }, 300, 1);
  assert.ok(tank.x <= 570, 'the entire hull stops before a thin impassable strip');
  game.world.navigationSolids = [];
  tank.x = 500;
  game.squad = [{ id: 900, x: 650, y: 500, radius: 13, alive: true }];
  moveVehicleToward(game, tank, { x: 1000, y: 500 }, 300, 1);
  assert.ok(tank.x <= 590, 'the hull yields before reaching the actor');
  assert.equal(game.squad[0].alive, true);
});

test('a turning carrier does not block the empty corners of its bounding box while actual hull contact remains blocked', () => {
  const game = state();
  const lead = { id: 5, kind: 'apc', x: 315.733333, y: 1340, angle: 0, hullLength: 82, hullWidth: 44 };
  const rear = { id: 6, kind: 'apc', x: 228.834439, y: 1411.461880, angle: -.8027963268, hullLength: 82, hullWidth: 44 };
  game.vehicles = [lead, rear];
  assert.equal(vehiclePoseClear(game, lead, { x: 317.8, y: 1340, angle: 0 }), true, 'Night Relief seed63 lead clears the turning carrier');
  assert.equal(moveVehicleToward(game, lead, { x: 680, y: 1340 }, 62, 1 / 30), true);
  assert.ok(lead.x > 317.7);
  assert.equal(vehiclePoseClear(game, lead, { x: rear.x, y: rear.y, angle: .4 }), false, 'real rotated hull overlap stays blocked');
  Object.assign(rear, { x: 500, y: 500, angle: 0 });
  assert.equal(vehiclePoseClear(game, lead, { x: 584, y: 500, angle: 0 }), false, 'the existing 5px vehicle clearance is retained');
  assert.equal(vehiclePoseClear(game, lead, { x: 588, y: 500, angle: 0 }), true);
});

test('armor distinguishes small arms, fragments, 40mm and cannon; mobility repair does not refill armor', () => {
  const game = state(), tank = game.vehicles[0], initial = tank.hp;
  const rifle = damageVehicle(game, tank, { kind: 'bullet', damage: 100 });
  assert.equal(rifle.accepted, true); assert.equal(rifle.damage, 0); assert.equal(tank.hp, initial);
  const fragment = damageVehicle(game, tank, { kind: 'fragment', damage: 100 });
  assert.equal(fragment.damage, 4);
  const grenade = damageVehicle(game, tank, { kind: '40mm', damage: 130 });
  assert.equal(grenade.disabled, true); assert.ok(grenade.damage > fragment.damage);
  const damagedHp = tank.hp;
  releaseVehicle(game, tank.id);
  assert.equal(repairVehicle(game, tank.id), true);
  assert.equal(tank.disabled, false); assert.equal(tank.hp, damagedHp);
  const destroyed = damageVehicle(game, tank, { kind: 'cannon', damage: 1000 });
  assert.equal(destroyed.destroyed, true); assert.equal(tank.mobility, 0);
  assert.equal(repairVehicle(game, tank.id), false);
  assert.equal(damageVehicle(game, tank, { kind: 'cannon', damage: 10 }).accepted, false);
});

test('initial carrier repair requires its physical component task, while later damage allows generic repair', () => {
  const game = state(13), carrier = findArmoredVehicle(game, 'freight-recovery');
  const actor = { id: 900, x: 1060, y: 1820, alive: true, downed: false };
  assert.equal(carrier.disabled, true); assert.deepEqual(game.convoyCleared, []);
  assert.equal(vehicleRepairTarget(game, actor), null);
  assert.equal(issueArmorOrder(game, 'advance', carrier.id), false);
  repairVehicle(game, carrier.id); releaseVehicle(game, carrier.id);
  damageVehicle(game, carrier, { kind: '40mm', damage: 140 });
  const target = vehicleRepairTarget(game, actor);
  assert.equal(target.vehicleId, carrier.id); assert.equal(target.duration, 6);
  assert.equal(pointBlockedByVehicle(game, target.x, target.y, 0), false);
  assert.equal(issueArmorOrder(game, 'hold', carrier.id), true);
  assert.equal(carrier.holdPosition, true);
  assert.equal(issueArmorOrder(game, 'advance', carrier.id), true);
});

test('weapons create finite physical shot requests, telegraph cannon fire, and do not damage targets remotely', () => {
  const game = state(), tank = game.vehicles[0];
  tank.ammo = { cannon: 2, mg: 4 };
  game.enemies = [{ id: 900, x: 1880, y: 1540, hp: 100, alive: true, downed: false }];
  const shots = []; let prepared = false;
  for (let frame = 0; frame < 30 * 40; frame++) {
    game.time += 1 / 30;
    updateArmoredVehicles(game, 1 / 30, { combatLOS: () => true, fire: (state, vehicle, target, shot) => shots.push(shot) });
    prepared ||= tank.preparing;
  }
  assert.equal(prepared, true);
  assert.equal(shots.filter(shot => shot.weapon === 'tank-cannon').length, 2);
  assert.equal(shots.filter(shot => shot.weapon === 'vehicle-mg').length, 4);
  assert.ok(shots.every(shot => Number.isFinite(shot.x) && shot.range > 0 && shot.speed > 0));
  assert.equal(game.enemies[0].hp, 100, 'only common projectile collision may damage a target');
  assert.deepEqual(tank.ammo, { cannon: 0, mg: 0 });
});

test('solid cover and obscured sight prevent vehicle shots; serialized poses exclude tactical state', () => {
  const game = state(), tank = game.vehicles[0];
  game.enemies = [{ id: 900, x: 1880, y: 1540, hp: 100, alive: true }];
  game.world.walls = [{ x: 1700, y: 1300, w: 20, h: 400 }];
  let shots = 0;
  run(game, 20, { combatLOS: () => true, fire: () => shots++ });
  assert.equal(shots, 0);
  // The hull fits beside this wall, but its cannon tip would extend through
  // it. Target acquisition must include the whole hull-to-muzzle segment.
  game.enemies[0].x = tank.x; game.enemies[0].y = tank.y - 340;
  game.world.walls = [{ x: tank.x - 140, y: tank.y - 40, w: 280, h: 5 }];
  run(game, 20, { combatLOS: () => true, fire: () => shots++ });
  assert.equal(shots, 0, 'the physical barrel cannot shoot through a nearby wall');
  game.world.walls = [];
  run(game, 20, { combatLOS: () => false, fire: () => shots++ });
  assert.equal(shots, 0, 'smoke/contact limits supplied by combat LOS are honored');
  tank.route = [{ x: 1, y: 2 }]; tank.targetId = 900;
  const view = publicVehicleView(tank);
  assert.equal('route' in view, false); assert.equal('targetId' in view, false);
  assert.equal(view.w, view.hullLength); assert.equal(view.h, view.hullWidth);
  assert.deepEqual(view.ammo, tank.ammo); assert.notEqual(view.ammo, tank.ammo);
});
