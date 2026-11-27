import test from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS, createGame, findPath, segmentRectEntry, hasLineOfSight, step } from '../public/sim.mjs';
import { buildMissionLayout, missionLayoutDefinition } from '../public/mission-layouts.mjs';
import { getMovementSolids } from '../public/building-geometry.mjs';
import { populateDistrictLife, streetPropBounds } from '../public/district-life.mjs';
import { moveVehicleToward, vehiclePoseClear, findArmoredVehicle } from '../public/armored-vehicles.mjs';
import { ENCOUNTERS } from '../public/encounters.mjs';
import { quietMission } from './mission-navigation-helper.mjs';

const missions = [10, 11, 12, 13];
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clear = (state, point, radius = 13) => getMovementSolids(state.world).every(rect => !Number.isFinite(segmentRectEntry(point, point, rect, radius)));
function assertRoute(state, from, to, label) {
  const route = findPath(state, from, to);
  assert.ok(route.length, `${label}: connected`);
  let previous = from;
  for (const point of route) {
    assert.ok(getMovementSolids(state.world).every(rect => !Number.isFinite(segmentRectEntry(previous, point, rect, 13))), `${label}: physical travel clearance`);
    previous = point;
  }
  assert.ok(distance(previous, to) < .001, `${label}: reaches exact authored destination`);
  return route;
}

test('four appended fictional missions have different connected topologies and preserve existing identities', () => {
  assert.deepEqual(MISSIONS.slice(10).map(mission => mission.id), ['breakwater', 'split-channel', 'gatehouse', 'freight-line']);
  assert.equal(buildMissionLayout({ seed: 17, missionIndex: 9 }), null);
  const topologies = new Set(), rhythms = new Set();
  for (const mission of missions) {
    const state = createGame({ mission, seed: 17 });
    topologies.add(state.world.missionLayout.topology); rhythms.add(state.stages.map(stage => stage.kind).join('>'));
    assert.match(state.mission.time, /FICTIONAL/); assert.equal(state.mission.category, 'side');
    assert.equal(state.world.layoutVersion, 3); assert.equal(state.world.width, 2400); assert.equal(state.world.height, 1900);
    for (const encounter of ENCOUNTERS[mission]) assert.ok(state.stages.some(stage => stage.id === encounter.stageId));
    assert.ok(state.vehicles.length >= 1 && state.vehicles.length <= 2);
  }
  assert.equal(topologies.size, 4); assert.equal(rhythms.size, 4);
});

test('authored anchors, actual rooms and exits stay reachable without moving crossings between replay seeds', () => {
  for (const mission of missions) for (const seed of [1, 17, 63]) {
    const state = createGame({ mission, seed }), label = `${mission}/${seed}`;
    assert.deepEqual(buildMissionLayout({ missionIndex: mission, seed }), buildMissionLayout({ missionIndex: mission, seed }));
    assert.deepEqual(state.world.missionLayout.anchors, buildMissionLayout({ missionIndex: mission, seed: 999 }).missionLayout.anchors);
    for (const actor of state.squad) assert.ok(clear(state, actor), `${label}: insertion is on walkable ground`);
    for (const stage of state.stages) {
      assert.ok(clear(state, stage), `${label}/${stage.id}: objective is outside walls and water`);
      assertRoute(state, state.squad[0], stage, `${label}/${stage.id}`);
      if (stage.kind === 'recon') assert.equal(hasLineOfSight(state, stage, stage.lookAt), true, `${label}/${stage.id}: authored view is clear`);
    }
    for (const building of state.world.buildings) {
      assert.equal(building.enterable, true);
      assert.equal(building.districtKind, state.world.districts.find(district => district.id === building.districtId).kind);
      for (const door of building.doors) {
        assertRoute(state, state.squad[0], door.outside, `${label}/${building.id}/${door.side} approach`);
        assertRoute(state, door.outside, door.inside, `${label}/${building.id}/${door.side} threshold`);
      }
      for (const room of building.rooms) assertRoute(state, state.squad[0], { x: room.x + room.w / 2, y: room.y + room.h / 2 }, `${label}/${building.id} room`);
    }
  }
});

test('waterfront and channel block travel without becoming opaque walls, and freight lanes require real detours', () => {
  const harbor = createGame({ mission: 10, seed: 17 });
  assert.equal(clear(harbor, { x: 2200, y: 900 }), false);
  assert.equal(hasLineOfSight(harbor, { x: 1880, y: 1100 }, { x: 2200, y: 1100 }), true);
  const channel = createGame({ mission: 11, seed: 17 });
  for (const y of [440, 1000, 1600]) assertRoute(channel, { x: 980, y }, { x: 1360, y }, `channel crossing ${y}`);
  assert.equal(clear(channel, { x: 1160, y: 800 }), false);
  assert.equal(hasLineOfSight(channel, { x: 980, y: 800 }, { x: 1360, y: 800 }), true);
  const freight = createGame({ mission: 13, seed: 17 }), from = { x: 740, y: 800 }, to = { x: 1140, y: 800 };
  const route = assertRoute(freight, from, to, 'warehouse detour');
  let length = 0, previous = from;
  for (const point of route) { length += distance(previous, point); previous = point; }
  assert.ok(length > distance(from, to) * 2, 'the warehouse creates different connectivity, not a painted grid');
});

test('authored scenery is bounded, seeded, repeatable and leaves real doors and vehicle lanes open', () => {
  for (const mission of missions) for (const seed of [4, 17, 63]) {
    const { world } = createGame({ mission, seed });
    assert.ok(world.streetProps.length <= world.scenerySites.length);
    for (const prop of world.streetProps) {
      assert.deepEqual(prop.bounds, streetPropBounds(prop));
      if (prop.cover) assert.ok(world.streetSolids.some(solid => solid.propId === prop.id));
      for (const building of world.buildings) for (const door of building.doors) assert.equal(Number.isFinite(segmentRectEntry(door.inside, door.outside, prop.bounds, 17)), false);
      assert.ok(world.reservedRoutes.every(lane => prop.bounds.x + prop.bounds.w <= lane.x || prop.bounds.x >= lane.x + lane.w || prop.bounds.y + prop.bounds.h <= lane.y || prop.bounds.y >= lane.y + lane.h));
    }
    const previous = structuredClone({ props: world.streetProps, solids: world.streetSolids });
    populateDistrictLife(world);
    assert.deepEqual({ props: world.streetProps, solids: world.streetSolids }, previous);
  }
});

test('every authored vehicle route physically fits its hull including full corner rotations', () => {
  for (const mission of missions) {
    const state = createGame({ mission, seed: 17 });
    state.squad = []; state.allies = []; state.enemies = []; state.civilians = []; state.survivors = [];
    for (const control of state.armorControl.units) {
      const vehicle = findArmoredVehicle(state, control.vehicleId); vehicle.disabled = false;
      assert.equal(vehiclePoseClear(state, vehicle, vehicle), true, `${mission}/${vehicle.armorKey}: initial hull fits`);
      for (const target of control.route) {
        for (let frame = 0; frame < 30 * 100 && distance(vehicle, target) > 5; frame++) moveVehicleToward(state, vehicle, target, 50, 1 / 30);
        assert.ok(distance(vehicle, target) <= 5, `${mission}/${vehicle.armorKey}: physical route reaches ${target.x},${target.y}`);
      }
    }
  }
});

test('the component delivery repairs and releases the actual carrier for every infantry class', () => {
  for (const role of ['rifleman', 'grenadier', 'medic', 'support', 'sniper', 'heavy']) {
    const state = quietMission(createGame({ mission: 13, seed: 17, squadRoles: [role, 'rifleman', 'rifleman', 'rifleman'] }));
    const carrier = findArmoredVehicle(state, 'freight-recovery'), actor = state.squad[0];
    const pickup = state.stages.find(stage => stage.id === 'freight-part');
    state.stageIndex = state.stages.indexOf(pickup); state.phaseTime = 0;
    Object.assign(actor, { x: pickup.x, y: pickup.y });
    for (let frame = 0; frame < 100; frame++) step(state, { interact: true }, 1 / 30);
    assert.equal(state.operation.items.find(item => item.id === 'drive-assembly').status, 'carried', `${role}: retrieves the component`);
    assert.equal(carrier.disabled, true);
    const repair = state.stages.find(stage => stage.id === 'freight-repair');
    Object.assign(actor, { x: repair.x, y: repair.y });
    for (let frame = 0; frame < 190; frame++) step(state, { interact: true }, 1 / 30);
    assert.equal(carrier.disabled, false, `${role}: actual mobility is restored`);
    assert.equal(carrier.repairLocked, false); assert.equal(carrier.active, true);
    assert.equal(state.stages[state.stageIndex].id, 'freight-convoy');
  }
});
