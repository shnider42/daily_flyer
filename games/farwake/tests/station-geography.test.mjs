import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, buildGalaxy } from '../dist/engine.mjs';
import { bodyVisualRadius, decorateGalaxyTypes } from '../dist/world-types.mjs';
import { SYSTEM_SPACE_SCALE, WORLD_RADIUS, systemBodyPosition } from '../dist/system-space.mjs';
import { systemCosmicBodies } from '../dist/galaxy-expansion.mjs';
import { STATION_GEOGRAPHY_VERSION, STATION_NEIGHBORHOOD_GAP, decorateStationGeography, stationRelocations, migrateStationPose } from '../dist/station-geography.mjs';
import { createSystemTraffic, advanceTraffic } from '../dist/traffic.mjs';
import { getShipClass } from '../dist/fleet.mjs';

const dist = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const gap = (a,b) => dist(a,b)-bodyVisualRadius(a)-bodyVisualRadius(b);
const positioned = system => system.bodies.map((body,index) => ({...body,...systemBodyPosition(body,index,system.id)}));
const worlds = bodies => bodies.filter(body => ['planet','moon'].includes(body.kind));
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);

test('large majorities of actual stations have short, clear crossings to real worlds', () => {
  for (const seed of ['farwake','quiet-earth','station-neighborhoods','a','b']) {
    const galaxy = buildGalaxy(seed);
    let total = 0, orbital = 0;
    for (const system of galaxy) {
      const bodies = positioned(system), planets = worlds(bodies);
      const hazards = systemCosmicBodies(system,seed).map(body => ({...body,x:body.x*SYSTEM_SPACE_SCALE,y:body.y*SYSTEM_SPACE_SCALE}));
      for (const station of bodies.filter(body => body.kind === 'station')) {
        total++;
        const geography = station.stationGeography;
        assert.equal(geography.version,STATION_GEOGRAPHY_VERSION);
        assert.ok(geography.reason.length > 90,'location explanations describe the actual purpose');
        const measured = planets.filter(body => gap(station,body) <= STATION_NEIGHBORHOOD_GAP).sort((a,b) => dist(station,a)-dist(station,b)||a.id.localeCompare(b.id)).slice(0,3);
        assert.deepEqual(geography.nearbyBodyIds,measured.map(body => body.id),'nearby labels use real geometry');
        assert.ok(Math.hypot(station.x,station.y)+bodyVisualRadius(station)<WORLD_RADIUS);
        if (geography.kind !== 'orbital') continue;
        orbital++;
        assert.ok(geography.nearbyBodyIds.length >= 1 && geography.nearbyBodyIds.length <= 3);
        const anchor = planets.find(body => body.id === geography.anchorBodyIds[0]);
        assert.ok(anchor);
        assert.ok(gap(station,anchor)>=419.999 && gap(station,anchor)<=850,`${station.id} has a short crossing`);
        assert.ok(geography.reason.includes(anchor.name),'captains see the actual nearby world name');
        for (const other of bodies.filter(body => body.id !== station.id)) assert.ok(gap(station,other)>=349.999,`${station.id} approach is clear of ${other.id}`);
        for (const hazard of hazards) assert.ok(dist(station,hazard)>=hazard.warningRadius+bodyVisualRadius(station)+350);
      }
    }
    assert.equal(total,906);
    assert.ok(orbital/total>=.85 && orbital/total<=.94,`${seed}: ${orbital}/${total} near-world stations`);
  }
});

test('detached working stations occupy actual field edges or outer lanes, with type-specific reasons', () => {
  const galaxy = buildGalaxy('farwake'), purposes = new Set();
  for (const system of galaxy.filter(system => !system.authored)) {
    const bodies = positioned(system), planets = worlds(bodies);
    for (const station of bodies.filter(body => body.kind === 'station' && body.stationGeography.kind === 'deep-space')) {
      const geography = station.stationGeography;
      purposes.add(geography.purpose);
      assert.deepEqual(geography.nearbyBodyIds,[]);
      assert.deepEqual(geography.anchorBodyIds,[]);
      assert.ok(planets.every(planet => gap(station,planet)>STATION_NEIGHBORHOOD_GAP+250));
      assert.ok(geography.servedBodyIds.every(id=>planets.some(planet=>planet.id===id)));
      if (['ore-belt','salvage-yard'].includes(geography.purpose)) {
        assert.ok(geography.resourceField,'a claimed resource-field purpose has a physical field');
        assert.ok([[-1920,1980],[3750,1680],[-3990,-2640]].some(([x,y])=>geography.resourceField.x===x&&geography.resourceField.y===y));
        near(dist(station,geography.resourceField)-geography.resourceField.radius-bodyVisualRadius(station),250);
      } else {
        assert.ok(Math.hypot(station.x,station.y)>=5349.999,'detached route facilities really stand on an outer approach');
      }
      assert.ok(!['civic-concourse','wheel-habitat','trade-hexagon','orbital-wheel','agricultural-ladder','greenhouse-clover','transit-hub','hive-habitat','embassy-pentagon'].includes(station.stationTypeId),'ordinary homes, farms and passenger centers remain beside worlds');
    }
  }
  for (const purpose of ['ore-belt','quiet-observatory','communications-relay','salvage-yard','rescue-waystation']) assert.ok(purposes.has(purpose),purpose);
});

test('generation is deterministic, idempotent, preserves worlds and authored routes, and does not mutate inputs', () => {
  const inputs = decorateGalaxyTypes([
    {id:'test-one',faction:'freewake',authored:false,bodies:[{id:'station-one',kind:'station',name:'First Harbor',biome:'station',stationTypeId:'transit-hub'},{id:'world-one',kind:'planet',name:'First World',biome:'forest',x:500,y:300}]},
    {id:'test-two',faction:'concord',authored:false,bodies:[{id:'station-two',kind:'station',name:'Second Harbor',biome:'station',stationTypeId:'civic-concourse'},{id:'world-two',kind:'planet',name:'Second World',biome:'ice'}]}
  ],'independent-placement'), before = structuredClone(inputs);
  const result = decorateStationGeography(inputs,'independent-placement');
  assert.deepEqual(inputs,before);
  assert.deepEqual(decorateStationGeography(inputs,'independent-placement'),result);
  assert.deepEqual(decorateStationGeography(result,'independent-placement'),result);
  assert.deepEqual(decorateStationGeography([...inputs].reverse(),'independent-placement').reverse(),result);
  for (let i=0;i<inputs.length;i++) {
    assert.equal(result[i].bodies[1],inputs[i].bodies[1],'existing planets are unchanged, including explicit coordinates');
    assert.equal(result[i].bodies[0].id,inputs[i].bodies[0].id);
    assert.equal(result[i].bodies[0].faction,inputs[i].bodies[0].faction);
  }
  assert.notDeepEqual(decorateStationGeography(inputs,'other-galaxy').map(s=>s.bodies[0].x),result.map(s=>s.bodies[0].x));
  const galaxy = buildGalaxy('authored-harbors');
  for (const system of galaxy.filter(system=>system.authored)) {
    assert.deepEqual(stationRelocations(system),[],'campaign, military and tutorial rendezvous retain their coordinates');
    for (const station of positioned(system).filter(body=>body.kind==='station')) assert.deepEqual(station.stationGeography.legacyPosition,{x:station.x,y:station.y});
  }
  const hearth = galaxy.find(system=>system.id==='hearth');
  assert.match(hearth.bodies.find(body=>body.id==='kettle').stationGeography.reason,/Morrow and Tinbell/);
});

test('a moon can support a station and a true cluster names up to three nearby worlds', () => {
  const make = (id,body) => ({id,faction:'freewake',bodies:[{id:`${id}-port`,kind:'station',name:'Public port',stationTypeId:'transit-hub'},...body]});
  const moon = decorateStationGeography(decorateGalaxyTypes([make('moon-only',[{id:'ice-moon',kind:'moon',name:'Quiet Ice',biome:'ice'}])]),'moon-orbit')[0];
  const port = moon.bodies[0];
  assert.equal(port.stationGeography.kind,'orbital');
  assert.deepEqual(port.stationGeography.anchorBodyIds,['ice-moon']);
  assert.match(port.stationGeography.reason,/Quiet Ice, the local moon/);
  const cluster = make('close-worlds',[
    {id:'one',kind:'planet',name:'First',biome:'arid',x:500,y:300},
    {id:'two',kind:'planet',name:'Second',biome:'ice',x:620,y:300},
    {id:'three',kind:'moon',name:'Third',biome:'barren',x:500,y:400}
  ]);
  const combined = decorateStationGeography(decorateGalaxyTypes([cluster]),'cluster-orbit')[0].bodies[0];
  assert.equal(combined.stationGeography.nearbyBodyIds.length,3);
  for (const name of ['First','Second','Third']) assert.ok(combined.stationGeography.reason.includes(name));
});

test('migration translates old berths once without altering progression or unrelated flight poses', () => {
  const chart = buildGalaxy('migration-metadata').find(system=>stationRelocations(system).length), [move] = stationRelocations(chart);
  const old = {id:'captain-hull',x:move.from.x,y:move.from.y+move.radius+110,vx:8,vy:-2,angularVelocity:.6,hull:71,fuel:13,credits:90}, before = structuredClone(old);
  const changed = migrateStationPose(old,[move]);
  assert.deepEqual(old,before);
  near(changed.x,move.to.x);near(changed.y,move.to.y+move.radius+110);
  assert.equal(changed.hull,71);assert.equal(changed.fuel,13);assert.equal(changed.credits,90);assert.equal(changed.vx,0);
  assert.equal(migrateStationPose(changed,[move],{nearby:false}),changed);
  const unrelated = {x:-7000,y:-7000,vx:9,vy:4};
  assert.equal(migrateStationPose(unrelated,[move]),unrelated);
  const noTranslation = {...old};
  assert.equal(migrateStationPose(noTranslation,[move],{nearby:false}),noTranslation,'clear-only never translates an old berth');
  const inside = {x:move.to.x,y:move.to.y,hull:29}, cleared = migrateStationPose(inside,[move],{nearby:false});
  near(dist(cleared,move.to),move.radius+90);assert.equal(cleared.hull,29);
  const endpoint = {x:move.from.x+500,y:move.from.y+700};
  const associated = migrateStationPose(endpoint,[move],{bodyId:move.bodyId,nearby:false});
  near(associated.x,move.to.x+500);near(associated.y,move.to.y+700);
});

test('close station approaches still produce usable collision-free civilian and capital traffic', () => {
  const galaxy = buildGalaxy('traffic-neighborhoods');
  const examples = new Map();
  for (const system of galaxy.filter(system=>!system.authored)) {
    const station = system.bodies.find(body=>body.kind==='station');
    if (station.stationGeography.kind==='orbital' && !examples.has(station.stationTypeId)) examples.set(station.stationTypeId,system);
  }
  assert.ok(examples.size>=20);
  let capital = 0;
  for (const system of examples.values()) {
    const bodies = positioned(system).map(body=>({...body,radius:bodyVisualRadius(body)}));
    bodies.push(...systemCosmicBodies(system,'traffic-neighborhoods').map(body=>({...body,x:body.x*3,y:body.y*3})));
    const traffic = createSystemTraffic({seed:'traffic-neighborhoods',system:{...system,spatialScale:3,radius:WORLD_RADIUS},bodies,count:24});
    assert.ok(traffic.length>=12,`${system.id}: short crossings leave enough safe working routes`);
    for (const contact of traffic) if (getShipClass(contact.classId).stats.mass>=8) capital++;
    for (let tick=0;tick<40;tick++) {
      advanceTraffic(traffic,7);
      for (const contact of traffic) for (const body of bodies) {
        const required = body.kind==='blackhole' ? body.gravityRadius : body.radius;
        assert.ok(dist(contact,body)>=required+getShipClass(contact.classId).stats.radius+11.9,`${contact.classId} route clears ${body.id}`);
      }
    }
  }
  assert.ok(capital>0,'larger working hulls retain real routes');
});

test('the discovery log explains why an encountered station is where it is', () => {
  const game = new Game('dock-location-explanation'), system = game.galaxy.find(system=>!system.authored&&system.bodies.some(body=>body.stationGeography?.kind==='deep-space'));
  game.state.systemId=system.id;game._loadSystem(system.id);
  const station = game.system.bodies.find(body=>body.kind==='station');
  Object.assign(game.state.ship,{x:station.x,y:station.y+station.radius+100,vx:0,vy:0});
  assert.equal(game.dock(station.id).ok,true);
  assert.ok(JSON.stringify(game.state.journal).includes(station.stationGeography.reason));
});
