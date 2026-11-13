import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGalaxy, Game } from '../../dist/engine.mjs';
import { systemBodyPosition } from '../../dist/system-space.mjs';
import { WORLD_TYPES_VERSION } from '../../dist/world-types.mjs';
import { migrateRealmPlaceSizes } from '../../server/place-migration.mjs';

const systems=buildGalaxy('shared-place-sizes');
const giantSystem=systems.find(system=>system.bodies.some(body=>body.kind==='planet'&&body.sizeClass==='supermassive'));
const giantIndex=giantSystem.bodies.findIndex(body=>body.kind==='planet'&&body.sizeClass==='supermassive'),giant=giantSystem.bodies[giantIndex],center=systemBodyPosition(giant,giantIndex,giantSystem.id);
const point=pose=>({x:pose.x,y:pose.y});
const inside=(id,extra={})=>({id,x:center.x+197,y:center.y,vx:8,vy:-3,angle:.3,angularVelocity:.2,hull:67,maxHull:100,shield:12,...extra});
const expected={x:center.x+347,y:center.y};
const close=(actual,want=expected)=>{assert.ok(Math.abs(actual.x-want.x)<1e-8);assert.ok(Math.abs(actual.y-want.y)<1e-8);};

test('the authority repairs remote owned hulls without confusing them with a guest’s occupied ship',()=>{
 const fresh=new Game('shared-place-sizes').save(),own=inside('remote-personal'),aboard={id:'carrier',x:0,y:145,vx:0,vy:0,hull:140},snapshot={spaceVersion:1,seed:fresh.seed,vessels:{personal:{id:'personal',ship:own,systemId:giantSystem.id,dockedAt:giant.id},carrier:{id:'carrier',ship:aboard,systemId:'hearth',dockedAt:'kettle'}},captains:{guest:{id:'guest',ownedVesselId:'personal',aboard:'carrier',game:{...fresh,systemId:'hearth',ship:structuredClone(own),person:{...fresh.person,x:180,y:220},interior:{kind:'ship',returnShip:structuredClone(aboard)},livelihoods:{parkedShip:{...structuredClone(own),systemId:giantSystem.id,bodyId:giant.id,vesselId:'personal'}},credits:820,cargo:{ore:11,crystal:2}}}},worlds:{}};
 delete snapshot.captains.guest.game.worldTypesVersion;
 const before=structuredClone(snapshot),result=migrateRealmPlaceSizes(snapshot,{systems}),guest=result.captains.guest;
 assert.deepEqual(snapshot,before,'persistent input is immutable');assert.notEqual(result,snapshot);
 close(result.vessels.personal.ship);close(guest.game.ship);close(guest.game.livelihoods.parkedShip);
 assert.deepEqual(result.vessels.carrier,before.vessels.carrier);assert.deepEqual(guest.game.interior,before.captains.guest.game.interior);
 assert.deepEqual(guest.game.person,before.captains.guest.game.person);assert.equal(guest.aboard,'carrier');assert.equal(guest.ownedVesselId,'personal');
 assert.equal(guest.game.credits,820);assert.deepEqual(guest.game.cargo,{ore:11,crystal:2});assert.equal(result.vessels.personal.ship.hull,67);
 assert.equal(result.vessels.personal.ship.vx,0);assert.equal(result.vessels.personal.ship.vy,0);
 assert.equal(guest.game.worldTypesVersion,WORLD_TYPES_VERSION);assert.equal(result.worldTypesVersion,WORLD_TYPES_VERSION);
 const passport=Game.fromSave({...guest.game,worlds:{}});close(passport.state.ship);
 assert.equal(migrateRealmPlaceSizes(result,{systems}),result,'a persisted migration never moves a hull a second time');
});

test('unloaded world hulls migrate consistently while pickup contents and encounter progress stay fixed',()=>{
 const enemy=inside('remote-raider',{hp:37,maxHp:80,deck:{enemies:[{x:78,y:110,health:19}]}}),parked=inside('relief-transport'),valid={id:'valid',x:7000,y:7000,vx:32,vy:4,hull:51},record={parkedShips:[parked,valid],spawned:[structuredClone(enemy)],enemyStates:{[enemy.id]:structuredClone(enemy)},encounterContacts:{lifeboat:inside('lifeboat')},pickups:[{id:'ore',x:center.x,y:center.y,amount:7}],depleted:['rock-3'],defeated:['old-enemy'],scanned:['beacon-1'],trafficStates:[{id:'ferry',routeTime:78,routeKey:'first'}]},snapshot={seed:'shared-place-sizes',worlds:{[giantSystem.id]:{record,enemies:[structuredClone(enemy)],parkedShips:[structuredClone(parked)],traffic:[{id:'ferry',routeTime:78}]}},captains:{},vessels:{}};
 const before=structuredClone(snapshot),result=migrateRealmPlaceSizes(snapshot,{systems}),world=result.worlds[giantSystem.id];
 close(world.record.parkedShips[0]);close(world.parkedShips[0]);close(world.enemies[0]);close(world.record.spawned[0]);close(world.record.enemyStates[enemy.id]);close(world.record.encounterContacts.lifeboat);
 assert.deepEqual(world.record.parkedShips[1],valid);assert.deepEqual(world.record.enemyStates[enemy.id].deck,enemy.deck);assert.equal(world.record.enemyStates[enemy.id].hp,37);
 for(const key of ['pickups','depleted','defeated','scanned','trafficStates'])assert.deepEqual(world.record[key],record[key]);
 assert.deepEqual(world.traffic,before.worlds[giantSystem.id].traffic);assert.deepEqual(snapshot,before);
});

test('shared military berth coordinates migrate together without granting duty, progress or pay',()=>{
 const hearth=systems.find(system=>system.id==='hearth'),morrow=hearth.bodies.find(body=>body.id==='morrow'),homeCenter=systemBodyPosition(morrow,hearth.bodies.indexOf(morrow),'hearth'),dockPoint={x:homeCenter.x,y:homeCenter.y+197};
 const escort=inside('escort'),contact=inside('procedure-contact'),contract={id:'operation-one',vesselId:'navy',phase:'working',clock:118,phaseClock:32,active:true,paid:false,reward:0,origin:{systemId:'hearth',bodyId:'morrow',...homeCenter,radius:122},destination:{systemId:giantSystem.id,bodyId:giant.id,...center,radius:122},dockPoint,workPoint:point(inside('work')),military:{participants:{one:{watchSeconds:23,damage:17,shots:6,settled:false},two:{watchSeconds:8,damage:0,shots:2,settled:false}}},work:{done:false,progress:4,damage:17},navy:{route:{remote:true,reached:true,returned:false,destinationSystemId:giantSystem.id,homeGate:{...dockPoint,angle:.7},remoteGate:{...point(inside('gate')),angle:.2}},escort,operation:{stageIndex:1,completed:false,contacts:[contact],tasks:[{id:'identify',elapsed:18,done:true},{id:'watch',elapsed:5,done:false}]}}};
 const snapshot={seed:'shared-place-sizes',vessels:{navy:{id:'navy',systemId:giantSystem.id,ship:inside('navy'),militaryOperationId:'operation-one'}},worlds:{[giantSystem.id]:{record:{parkedShips:[structuredClone(escort),structuredClone(contact)]}}},captains:{one:{id:'one',aboard:'navy',game:{systemId:giantSystem.id,ship:{id:'unowned',x:0,y:145,vx:0,vy:0,unowned:true},npcContract:structuredClone(contract),person:{x:200,y:250,health:83},militaryCareer:{rank:2,service:71}}}},militaryOperations:{serial:1,operations:{'operation-one':{id:'operation-one',ownerId:'one',vesselId:'navy',phase:'active',members:{one:{settled:false},two:{settled:false}},contract}}}};
 const before=structuredClone(snapshot),result=migrateRealmPlaceSizes(snapshot,{systems}),op=result.militaryOperations.operations['operation-one'],saved=op.contract;
 close(result.vessels.navy.ship);close(saved.workPoint);close(saved.navy.route.remoteGate);close(saved.navy.escort);close(saved.navy.operation.contacts[0]);
 close(result.worlds[giantSystem.id].record.parkedShips[0]);close(result.worlds[giantSystem.id].record.parkedShips[1]);close(result.captains.one.game.npcContract.workPoint);
 assert.equal(saved.destination.radius,272);assert.deepEqual(point(saved.destination),center);assert.deepEqual(saved.origin,contract.origin);assert.deepEqual(saved.dockPoint,dockPoint);assert.deepEqual(saved.navy.route.homeGate,contract.navy.route.homeGate);
 for(const key of ['military','work','clock','phaseClock','paid','active','reward','phase'])assert.deepEqual(saved[key],contract[key]);
 assert.deepEqual(saved.navy.operation.tasks,contract.navy.operation.tasks);assert.equal(saved.navy.operation.stageIndex,1);assert.deepEqual(op.members,before.militaryOperations.operations['operation-one'].members);
 assert.deepEqual(result.captains.one.game.person,before.captains.one.game.person);assert.deepEqual(result.captains.one.game.militaryCareer,before.captains.one.game.militaryCareer);assert.deepEqual(snapshot,before);
});

test('outbound military workpoints are repaired in the origin system until remote transit occurs',()=>{
 const contract={id:'outbound',origin:{systemId:giantSystem.id,bodyId:giant.id,...center,radius:122},workPoint:point(inside('work')),dockPoint:point(inside('dock')),navy:{route:{remote:true,reached:false,destinationSystemId:'hearth'}}},snapshot={seed:'shared-place-sizes',captains:{},vessels:{},worlds:{},militaryOperations:{operations:{outbound:{contract}}}};
 const result=migrateRealmPlaceSizes(snapshot,{systems}),moved=result.militaryOperations.operations.outbound.contract;
 close(moved.workPoint);close(moved.dockPoint);assert.equal(moved.origin.radius,272);assert.equal(moved.navy.route.reached,false);
});

test('current documents and valid legacy flight positions are left intact',()=>{
 const current={worldTypesVersion:WORLD_TYPES_VERSION,vessels:{v:{id:'v',systemId:giantSystem.id,ship:inside('v')}}};
 assert.equal(migrateRealmPlaceSizes(current,{systems}),current);
 const ship={id:'valid',x:6000,y:5000,vx:12,vy:-2,hull:45},legacy={vessels:{v:{id:'v',systemId:giantSystem.id,ship}},captains:{},worlds:{}};
 assert.deepEqual(migrateRealmPlaceSizes(legacy,{systems}).vessels.v.ship,ship);
 assert.equal(migrateRealmPlaceSizes(null,{systems}),null);
});
