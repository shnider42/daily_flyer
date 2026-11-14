import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Game, buildGalaxy } from '../dist/engine.mjs';
import { STATION_TYPES, PLANET_TYPES, SYSTEM_TYPES, WORLD_SIZES, WORLD_TYPES_VERSION, decorateGalaxyTypes, stationTypeFor, planetTypeFor, systemTypeFor, bodyVisualRadius, applySystemActivity, flavorSystemSignals, migrateExpandedBodyPose } from '../dist/world-types.mjs';
import { systemContext } from '../dist/encounter-context.mjs';
import { portProfile, trafficHullWeights, MILITARY_PORT_FACTIONS } from '../dist/port-traffic.mjs';
import { systemBodyPosition } from '../dist/system-space.mjs';

const checksum=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const ids=values=>[...new Set(values.map(value=>value.id))].sort();
const visit=(game,id)=>{game.state.systemId=id;game._loadSystem(id);return game.system;};

test('all25 identities in each category occur in real901-system charts across independent seeds',()=>{
 for(const catalog of [STATION_TYPES,PLANET_TYPES,SYSTEM_TYPES])assert.equal(ids(catalog).length,25);
 assert.equal(new Set(STATION_TYPES.map(type=>type.shape)).size,25,'station types have distinct silhouette geometry');
 assert.equal(new Set(PLANET_TYPES.map(type=>type.terrain)).size,25,'planet types select distinct terrain samplers');
 for(const seed of ['farwake','quiet-earth','world-types-regression','a','b']){
  const galaxy=buildGalaxy(seed),bodies=galaxy.flatMap(system=>system.bodies);
  assert.equal(galaxy.length,901);
  assert.deepEqual([...new Set(galaxy.map(system=>system.systemTypeId))].sort(),ids(SYSTEM_TYPES));
  assert.deepEqual([...new Set(bodies.filter(body=>body.kind==='station').map(body=>body.stationTypeId))].sort(),ids(STATION_TYPES));
  assert.deepEqual([...new Set(bodies.filter(body=>body.planetTypeId).map(body=>body.planetTypeId))].sort(),ids(PLANET_TYPES));
  assert.deepEqual([...new Set(bodies.filter(body=>body.planetTypeId).map(body=>body.sizeClass))].sort(),Object.keys(WORLD_SIZES).sort());
  assert.deepEqual(buildGalaxy(seed),galaxy);
  assert.deepEqual(decorateGalaxyTypes(galaxy,seed),galaxy,'redecorating an existing chart preserves each selected identity');
 }
});

test('type assignment is order-independent and leaves its chart input unchanged',()=>{
 const input=[{id:'test-alpha',authored:false,bodies:[{id:'first-port',kind:'station',biome:'station'},{id:'first-world',kind:'planet',biome:'forest'}]},{id:'test-beta',authored:false,bodies:[{id:'second-port',kind:'station',biome:'station'},{id:'second-world',kind:'planet',biome:'ice'}]}],before=structuredClone(input);
 const forward=decorateGalaxyTypes(input,'order-test'),reverse=decorateGalaxyTypes([...input].reverse(),'order-test').reverse();
 assert.deepEqual(forward,reverse);assert.deepEqual(input,before);
 for(const system of forward)for(const body of system.bodies){
  assert.ok(Number.isFinite(bodyVisualRadius(body)));
  if(body.kind==='planet')assert.ok(planetTypeFor(body).compatibleBiomes.includes(body.biome),'metadata honors the released biome');
 }
});

test('working station purposes alter real traffic capacity while public berths remain public',()=>{
 const galaxy=buildGalaxy('station-working-purposes'),profiles=new Map();
 for(const system of galaxy)for(const body of system.bodies.filter(body=>body.kind==='station')){
  const profile=portProfile(system,body);assert.ok(profile);
  if(!system.authored)assert.equal(profile.kind,stationTypeFor(body).portType);
  assert.equal(profile.restricted,Boolean(MILITARY_PORT_FACTIONS[body.id]),body.id);
  profiles.set(profile.kind,profile);
 }
 assert.deepEqual([...profiles.keys()].sort(),['hub','industrial','military','outpost','regional','research']);
 assert.ok(profiles.get('hub').maxShipLength>profiles.get('outpost').maxShipLength);
 assert.ok(trafficHullWeights(profiles.get('industrial')).some(row=>row.classId==='atlas'));
 assert.ok(!trafficHullWeights(profiles.get('outpost')).some(row=>row.classId==='atlas'));
 const hearth=galaxy.find(system=>system.id==='hearth');
 assert.equal(portProfile(hearth,hearth.bodies.find(body=>body.id==='kettle')).kind,'hub','Kettle keeps its existing public capacity override');
});

test('system identity changes traffic and resource activity without multiplying ambient combat',()=>{
 const game=new Game('system-activity'),counts=new Set(),traffic=new Set();
 for(const type of SYSTEM_TYPES){
  const chart=game.galaxy.find(system=>system.systemTypeId===type.id&&!system.authored),runtime=visit(game,chart.id),context=systemContext(chart);
  counts.add(runtime.asteroids.length);traffic.add(runtime.context.trafficCount);
  assert.equal(runtime.systemTypeId,type.id);assert.equal(runtime.typeLabel,type.name);
  assert.deepEqual(runtime.stellar,type.stellar);assert.deepEqual(runtime.activity,type.activity);
  const {trafficCount:actualTraffic,typeLabel,...actualSafety}=runtime.context,{trafficCount:originalTraffic,...originalSafety}=context;
  assert.deepEqual(actualSafety,originalSafety,'security, encounter chances and cooldowns retain their geographical rules');
  assert.ok(runtime.asteroids.length>=46&&runtime.asteroids.length<=102);
  assert.equal(runtime.context.trafficCount,applySystemActivity(chart,context).trafficCount);
  if(context.region==='core')assert.ok(runtime.context.trafficCount>=16);
 }
 assert.ok(counts.size>=10,'systems contain meaningfully different resource-field densities');
 assert.ok(traffic.size>=5,'working traffic varies without changing danger policies');
 const hearth=visit(game,'hearth');assert.equal(hearth.asteroids.length,46);assert.equal(hearth.traffic.length,22);assert.equal(hearth.enemies.length,0);
});

// Captured before type integration. These fixtures protect the released RNG
// stream, resource identities/yields and signal locations, not the new labels.
const legacyRuntime={
 hearth:['5d59be93e07f0cbb9a464a30700ee24ffe3f1d073841e460a0304bc27c3f450f','a4527b0bf0d317505b8393bc4ece3aea025ee2a97b3415c4aab4c7e61c460a83'],
 'sector-0':['f2eb63764154240b11827fe45051b3287948b4fb15590e439b9d23d9117c4bbe','35c81786f948f7408059dc0541e5238a7265f659bd7a9e1b9fe8eef81c9d2bd3'],
 'sector-137':['a2ad78209aacabc53f1377f0732e54283bb5398b199a093af5489508d7aa720e','421b959b03ac026e739b0e1df76060c4e088f96a577c55acf6750e05fc47a8b5'],
 lacuna:['0a09acb2f402a70371a891556ea562fe6201b65a462048f42efe28c3a3f164ce','a3b55a76b3449f6322ab76114e3b1c37192ee4a850cce87f721663f644a58121']
};
test('released asteroid state and signal positions keep their exact original seeded values',()=>{
 const game=new Game('farwake');
 for(const[id,[rocks,signals]]of Object.entries(legacyRuntime)){
  const runtime=visit(game,id);
  assert.equal(checksum(runtime.asteroids.slice(0,46)),rocks,`${id}: released rocks`);
  assert.equal(checksum(runtime.signals.filter(signal=>signal.id.startsWith(`${id}:signal:`)).map(({id,x,y})=>({id,x,y}))),signals,`${id}: fixed signal coordinates`);
 }
});

test('new resource fields persist mined and damaged rocks through saving and reloading',()=>{
 const game=new Game('resource-persistence'),chart=game.galaxy.find(system=>system.systemTypeId==='mineral-belt'),runtime=visit(game,chart.id);
 const extra=runtime.asteroids.filter(rock=>Number(rock.id.split(':').at(-1))>=46);assert.ok(extra.length>=50);
 const depleted=extra[0],damaged=extra[1];depleted.hp=0;game._record().depleted.push(depleted.id);damaged.hp=damaged.maxHp-3;
 const originalPose=extra.map(({id,x,y,ore,crystal})=>({id,x,y,ore,crystal})),restored=Game.fromSave(game.save());
 assert.equal(restored.system.asteroids.find(rock=>rock.id===depleted.id).hp,0);
 assert.equal(restored.system.asteroids.find(rock=>rock.id===damaged.id).hp,damaged.hp);
 assert.deepEqual(restored.system.asteroids.filter(rock=>Number(rock.id.split(':').at(-1))>=46).map(({id,x,y,ore,crystal})=>({id,x,y,ore,crystal})),originalPose);
});

test('themed instruments retain fixed story and physical encounter identities',()=>{
 const system={id:'typed',systemTypeId:'cryogenic'},story={id:'story',name:'Story name',story:true},physical={id:'contact',name:'Civilian distress',encounterId:'distress'},ordinary=Array.from({length:7},(_,i)=>({id:`ordinary-${i}`,name:'Survey',x:i,y:i}));
 const signals=[story,physical,...ordinary],result=flavorSystemSignals(system,signals);
 assert.equal(result[0],story);assert.equal(result[1],physical);
 assert.equal(new Set(result.slice(2).map(signal=>signal.name)).size,7);
 assert.ok(result.slice(2).every(signal=>signal.description===systemTypeFor(system).description));
 assert.deepEqual(result.slice(2).map(({id,x,y})=>({id,x,y})),ordinary.map(({id,x,y})=>({id,x,y})));
});

test('physical world sizes vary while the authored starter system retains its original radii',()=>{
 const game=new Game('sizes'),hearth=game.system;
 assert.equal(hearth.bodies.find(body=>body.id==='kettle').radius,70);
 assert.equal(hearth.bodies.find(body=>body.id==='morrow').radius,122);
 assert.equal(hearth.bodies.find(body=>body.id==='tinbell').radius,76);
 const giantSystem=game.galaxy.find(system=>system.bodies.some(body=>body.sizeClass==='supermassive'));
 const giant=visit(game,giantSystem.id).bodies.find(body=>body.sizeClass==='supermassive');
 assert.equal(giant.radius,WORLD_SIZES.supermassive.radius);
 assert.ok(planetTypeFor(giant).surfaceScale>planetTypeFor({kind:'moon',biome:'barren'}).surfaceScale*2);
});

test('expanded-body pose repair is pure, bounded and does not move valid or authored poses',()=>{
 const giant={id:'giant',kind:'planet',visualRadius:272,x:1200,y:-600},pose={id:'ship',x:1300,y:-600,vx:9,vy:-2,angle:.4,angularVelocity:.2,hull:81},before=structuredClone(pose);
 const migrated=migrateExpandedBodyPose(pose,[giant]);
 assert.deepEqual(pose,before);assert.equal(migrated.x,1547);assert.equal(migrated.y,-600);
 assert.equal(migrated.vx,0);assert.equal(migrated.vy,0);assert.equal(migrated.angularVelocity,0);assert.equal(migrated.hull,81);assert.equal(migrated.angle,.4);
 assert.equal(migrateExpandedBodyPose(migrated,[giant]),migrated);
 assert.equal(migrateExpandedBodyPose(pose,[giant],{fromVersion:WORLD_TYPES_VERSION}),pose);
 assert.equal(migrateExpandedBodyPose(pose,[{...giant,visualRadius:122}]),pose);
 const distant={...pose,x:2000};assert.equal(migrateExpandedBodyPose(distant,[giant]),distant);
});

test('an old captain beside an enlarged world keeps progress and migrates only once',()=>{
 const game=new Game('body-pose-save'),chart=game.galaxy.find(system=>system.bodies.some(body=>body.kind==='planet'&&body.sizeClass==='supermassive')),bodyIndex=chart.bodies.findIndex(body=>body.kind==='planet'&&body.sizeClass==='supermassive'),body=chart.bodies[bodyIndex],center=systemBodyPosition(body,bodyIndex,chart.id);
 visit(game,chart.id);
 Object.assign(game.state.ship,{x:center.x+197,y:center.y,vx:4,vy:8});game.state.credits=817;game.state.cargo.ore=7;
 const raw=game.save();delete raw.worldTypesVersion;const before=structuredClone(raw),restored=Game.fromSave(raw);
 assert.deepEqual(raw,before,'the caller still owns its unmodified save');
 assert.ok(Math.abs(restored.state.ship.x-(center.x+347))<1e-8);assert.equal(restored.state.ship.y,center.y);assert.equal(restored.state.ship.vx,0);
 assert.equal(restored.state.credits,817);assert.equal(restored.state.cargo.ore,7);assert.deepEqual(restored.state.missions,raw.missions);assert.equal(restored.state.worldTypesVersion,WORLD_TYPES_VERSION);
 const again=Game.fromSave(restored.save());assert.equal(again.state.ship.x,restored.state.ship.x);assert.equal(again.state.ship.y,restored.state.ship.y);
 const authored=new Game('authored-pose').save();delete authored.worldTypesVersion;authored.ship.x=20;authored.ship.y=30;authored.ship.vx=6;
 const safe=Game.fromSave(authored);assert.equal(safe.state.ship.x,20);assert.equal(safe.state.ship.y,30);assert.equal(safe.state.ship.vx,6);
});
