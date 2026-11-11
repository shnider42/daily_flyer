import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.mjs';
import {SHIP_CLASSES,STARTER_SHIP_IDS,getShipClass,advanceShip,enemyHullProfile,enemyShipState} from '../dist/fleet.mjs';
import {getHullSystems,hullEnergyAfterStep} from '../dist/hull-systems.mjs';
import {FarwakeNetwork} from '../dist/network.mjs';
import {placeRaider} from './helpers/combat-fixtures.mjs';

const ok=result=>assert.equal(result.ok,true,result.reason);
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);
function vessel(id='sparrow'){
 const game=new Game('native-hull-'+id),hull=getShipClass(id),ship=game.state.ship;
 Object.assign(ship,hull.stats,{classId:id,berths:hull.berths,x:0,y:500,vx:0,vy:0,angle:0,angularVelocity:0,hull:hull.stats.maxHull,shield:hull.stats.maxShield,energy:50,fuel:20});
 game.system.enemies=[];return game;
}

test('all nineteen hulls have distinct immutable equipment without expanding the solo starting choices',()=>{
 assert.equal(new Set(SHIP_CLASSES.map(hull=>hull.systems.name)).size,19);
 assert.deepEqual(STARTER_SHIP_IDS,['sparrow','kestrel','mule']);
 for(const hull of SHIP_CLASSES){assert.equal(hull.systems,getHullSystems(hull.id));assert.ok(Object.isFrozen(hull.systems));assert.ok(hull.systems.description&&hull.systems.tradeoff);}
 assert.equal(getHullSystems('old-missing-class'),getHullSystems('sparrow'));
});

test('reserve bus recovers real charge and vector overdrive adds thrust at its higher energy cost',()=>{
 const sparrow=vessel(),kestrel=vessel('kestrel');sparrow.stepPilot(.1,{});kestrel.stepPilot(.1,{});
 near(sparrow.state.ship.energy,51.4);near(kestrel.state.ship.energy,51.1);
 const baseline={...kestrel.state.ship,classId:'sparrow'},input={thrust:1,boost:true,flightAssist:false};
 const standard=advanceShip(baseline,.1,input),overdrive=advanceShip({...baseline,classId:'kestrel'},.1,input);
 assert.ok(overdrive.vx>standard.vx);near(overdrive.vx/standard.vx,1.95/1.7);
 kestrel.state.ship.energy=50;kestrel.stepPilot(.1,input);near(kestrel.state.ship.energy,47.6);
 assert.equal(hullEnergyAfterStep({...kestrel.state.ship,energy:8},.1,input),9.1,'An exhausted boost returns to cruise recovery.');
});

test('the Mule mines a real rock beyond a cutter’s reach and pulls in distant salvage',()=>{
 const tug=vessel('mule'),cutter=vessel();
 for(const game of [tug,cutter]){
  game.system.asteroids=[{id:'far-rock',x:300,y:500,radius:12,hp:1,ore:3,crystal:0}];
  game._mine(.1);
 }
 assert.equal(tug.state.cargo.ore,3);assert.equal(cutter.state.cargo.ore,0);
 for(const game of [tug,cutter]){game.system.pickups=[{id:'loose',x:180,y:500,ore:1,crystal:0,credits:0}];game._updatePickups(.1,[game]);}
 assert.ok(tug.system.pickups[0].x<180);assert.equal(cutter.system.pickups[0].x,180);
 tug.system.pickups[0].x=220;ok(tug.salvage('loose'));assert.equal(tug.state.cargo.ore,4);
 cutter.system.pickups[0].x=220;assert.equal(cutter.salvage('loose').code,'distance');
});

test('economy coils quote and debit the same reduced fuel without changing drive eligibility',()=>{
 const freighter=vessel('hauler'),cutter=vessel(),target=cutter.galaxy.find(s=>s.id==='vesper');
 const regular=cutter.travelInfo(target.id),economy=freighter.travelInfo(target.id);
 const distance=Math.hypot(target.gx-cutter.currentSystem.gx,target.gy-cutter.currentSystem.gy);
 assert.equal(economy.fuelCost,Math.ceil((2+distance*.65)*.75));assert.ok(economy.fuelCost<regular.fuelCost);
 assert.equal(economy.code,'hyperdrive');
 freighter.state.upgrades={engine_1:true,scanner_1:true,fold_1:true};freighter._updateStats(false);
 freighter.state.ship.fuel=freighter.state.ship.maxFuel;const quote=freighter.travelInfo(target.id),before=freighter.state.ship.fuel;
 ok(quote);ok(freighter.travel(target.id));assert.equal(freighter.state.ship.fuel,before-quote.fuelCost);
});

test('the survey array charts extra neighboring stars without visiting them or resolving their content',()=>{
 const scout=vessel('petrel'),cutter=vessel();
 for(const game of [scout,cutter]){
  game.galaxy=[{id:'hearth',gx:0,gy:0},{id:'close-chart',gx:6,gy:0},{id:'array-chart',gx:9,gy:0},{id:'far-chart',gx:15,gy:0}];
  game.state.discovered=['hearth'];game._discoverNear('hearth');
 }
 assert.deepEqual(cutter.state.discovered,['hearth','close-chart']);
 assert.deepEqual(scout.state.discovered,['hearth','close-chart','array-chart']);
 assert.deepEqual(scout.state.visited,['hearth']);assert.equal(scout.state.stats.scans,0);
 assert.equal(scout.state.ship.warpRange,0);
});

test('the expedition shield grid recovers sooner after a real absorbed hit',()=>{
 const frigate=vessel('frigate'),cutter=vessel();
 for(const game of [frigate,cutter]){game.state.ship.shield=20;game._damageShip(1);for(let frame=0;frame<31;frame++)game.stepPilot(.1,{});}
 assert.ok(frigate.state.ship.shield>19);assert.equal(cutter.state.ship.shield,19);
 near(frigate.state.ship.shield,20);assert.equal(frigate.state.ship.hull,frigate.state.ship.maxHull);
});

test('paired mounts launch two attributed hits but count as one trigger use',()=>{
 const game=vessel('marten'),enemy=placeRaider(game,{x:150,y:500,hp:200,maxHp:200,active:false}),energy=game.state.ship.energy;
 game.drainEvents();ok(game.fireWeapons('visiting-gunner'));
 const bullets=game.system.bullets;assert.equal(bullets.length,2);assert.notEqual(bullets[0].id,bullets[1].id);
 assert.ok(bullets.every(b=>b.ownerId==='visiting-gunner'&&b.vesselId===game.state.ship.id));near(Math.abs(bullets[0].y-bullets[1].y),20);
 near(bullets.reduce((sum,b)=>sum+b.damage,0),game.state.ship.damage*1.2);near(game.state.ship.energy,energy-5);
 assert.equal(game.drainEvents().filter(e=>e.type==='shot').length,1);assert.equal(game.fireWeapons().code,'cooldown');
 game._updateBullets(.2,[game]);near(enemy.hp,200-game.state.ship.damage*1.2);
 game._shotTimer=0;game.state.ship.energy=4;assert.equal(game.fireWeapons().code,'energy');
});

test('hostile escorts use the same paired mount geometry and damage fraction',()=>{
 const game=vessel(),enemy=placeRaider(game,{classId:'marten',x:300,y:500,cooldown:0,active:true,damage:10});
 game._updateEnemies(.01,[game]);const shots=game.system.bullets.filter(b=>b.vesselId===enemy.id);
 assert.equal(shots.length,2);assert.ok(shots.every(b=>b.damage===6));near(Math.hypot(shots[0].x-shots[1].x,shots[0].y-shots[1].y),20);
});

test('mobile workshop repairs actual plating, spends charge, and cannot repeat during its cycle',()=>{
 const game=vessel('atlas');game.state.ship.hull=300;ok(game.enterCabin());const before=game.state.ship.energy;
 const result=game.repairFromStation();ok(result);assert.equal(result.hull,16);assert.equal(game.state.ship.hull,316);assert.equal(game.state.ship.energy,before-22);
 assert.equal(game.repairFromStation().code,'cooldown');game._repairTimer=0;game.state.ship.energy=21;assert.equal(game.repairFromStation().code,'energy');
});

test('trauma ward heals conscious people, hired crew and real rescued passengers without reviving the dead',()=>{
 const game=vessel('capital');game.state.person.health=40;
 game.state.crew=[{id:'injured',name:'Ada',role:'engineer',health:20,maxHealth:100,status:'injured'},{id:'lost',name:'Sol',role:'gunner',health:0,maxHealth:100,status:'dead'}];
 ok(game.takeRescueOccupants('lifeboat','rescue',{sourceId:'care-fixture'}));
 const [patient,lost]=game.state.ship.rescueGroups[0].members;patient.health=20;lost.health=0;lost.status='dead';
 ok(game.enterCabin());const before=game.state.ship.energy;const result=game.medicalFromStation();ok(result);
 assert.equal(game.state.person.health,64);assert.equal(game.state.crew[0].health,36);assert.equal(patient.health,36);
 assert.equal(game.state.crew[1].health,0);assert.equal(lost.health,0);assert.equal(game.state.ship.energy,before-20);
 assert.equal(result.healedPassengers,1);assert.equal(game.medicalFromStation().code,'cooldown');
});

test('vector boost prediction tracks exhaustion and reconciles an authoritative station expenditure',()=>{
 const game=vessel('kestrel'),input={thrust:1,boost:true,flightAssist:false};game.state.ship.energy=9;
 const network=new FarwakeNetwork({url:'http://test',storage:null,autoReconnect:false});network.world={bodies:[]};
 let predicted={...game.state.ship};
 for(let frame=0;frame<30;frame++){
  predicted=network._predictFlight(predicted,{dt:1/30,input});game.stepPilot(1/30,input);
  for(const field of ['x','y','vx','vy','energy'])near(predicted[field],game.state.ship[field]);
 }
 let time=0;const epoch=1700000000000,client=new FarwakeNetwork({url:'http://test',storage:null,autoReconnect:false,now:()=>time,wallNow:()=>epoch+time});
 const packet=(tick,energy)=>({tick,serverTime:epoch+time,simulatedAt:epoch+time,ack:0,state:{systemId:'hearth',mode:'ship',ship:{...game.state.ship,energy}},room:{id:'system:hearth',kind:'system'},world:{bodies:[]},players:[],remoteShips:[],events:[]});
 client._snapshot(packet(1,30),true);client.setInput(input);time=100;client.predictShip(.1,input);
 client._snapshot(packet(2,4));assert.equal(client.predictedShip.energy,4,'The server’s spent charge replaces the prediction.');
});

test('captured ships retain localized damage and the charge already spent aboard',()=>{
 const damageControl={version:1,impacts:[{id:'scar',x:20,y:40}],fires:[{id:'fire'}]},enemy={id:'prize',classId:'marten',hp:60,maxHp:100,energy:17,damageControl};
 const ship=enemyShipState(enemy);assert.equal(ship.energy,17);assert.deepEqual(ship.damageControl,damageControl);assert.notEqual(ship.damageControl,damageControl);
 assert.equal(getHullSystems(ship.classId).pulseCount,2);ship.damageControl.fires.length=0;assert.equal(enemy.damageControl.fires.length,1);
});

test('the shuttle service bus trades slower shield recovery for real reactor recharge',()=>{
 const shuttle=vessel('tern'),cutter=vessel();
 for(const game of [shuttle,cutter]){game.state.ship.shield=10;game._hitTimer=0;game.stepPilot(.1,{});}
 near(shuttle.state.ship.energy,51.7);near(cutter.state.ship.energy,51.4);
 near(shuttle.state.ship.shield,10.3);near(cutter.state.ship.shield,10.4);
});

test('the dispatch drive reduces both a quoted fold charge and actual sustained boost drain',()=>{
 const courier=vessel('quill'),cutter=vessel(),target=courier.galaxy.find(s=>s.id==='vesper');
 const distance=Math.hypot(target.gx-courier.currentSystem.gx,target.gy-courier.currentSystem.gy);
 assert.equal(courier.travelInfo(target.id).fuelCost,Math.ceil((2+distance*.65)*.8));
 assert.ok(courier.travelInfo(target.id).fuelCost<cutter.travelInfo(target.id).fuelCost);
 const input={thrust:1,boost:true,flightAssist:false};courier.stepPilot(.1,input);near(courier.state.ship.energy,48.4);
 const ordinary=advanceShip({...courier.state.ship,classId:'sparrow',vx:0,vy:0},.1,input),dispatch=advanceShip({...courier.state.ship,vx:0,vy:0},.1,input);
 near(dispatch.vx/ordinary.vx,1.8/1.7);
});

test('the ambulance gives a real injured crew and rescued passenger a faster triage cycle',()=>{
 const game=vessel('mender');game.state.person.health=30;
 game.state.crew=[{id:'patient',name:'Ira',role:'engineer',health:25,maxHealth:100,status:'injured'}];
 ok(game.takeRescueOccupants('lifeboat','rescue',{sourceId:'ambulance-fixture'}));
 const patient=game.state.ship.rescueGroups[0].members[0];patient.health=20;
 ok(game.enterCabin());const before=game.state.ship.energy;ok(game.medicalFromStation());
 assert.equal(game.state.person.health,54);assert.equal(game.state.crew[0].health,43);assert.equal(patient.health,38);
 assert.equal(game.state.ship.energy,before-17);assert.equal(game._crewHealTimer,5);
 assert.equal(game.medicalFromStation().code,'cooldown');
});

test('the gunship fires three centered attributed pulses with its advertised cost and actual damage',()=>{
 const game=vessel('bulwark'),enemy=placeRaider(game,{...enemyHullProfile('hauler'),x:190,y:500,hp:250,maxHp:250,active:false}),before=game.state.ship.energy;
 game.drainEvents();ok(game.fireWeapons('guest-gunner'));
 const shots=game.system.bullets;assert.equal(shots.length,3);assert.equal(new Set(shots.map(b=>b.id)).size,3);
 assert.deepEqual(shots.map(b=>b.y-game.state.ship.y),[-28,0,28]);
 assert.ok(shots.every(b=>b.ownerId==='guest-gunner'&&b.vesselId===game.state.ship.id));
 near(shots.reduce((total,b)=>total+b.damage,0),game.state.ship.damage*1.35);
 near(game.state.ship.energy,before-8);near(game._shotTimer,.38);
 assert.equal(game.drainEvents().filter(e=>e.type==='shot').length,1);
 game._updateBullets(.2,[game]);near(enemy.hp,250-game.state.ship.damage*1.35);
});

test('the mining barge cuts and retrieves real ore beyond the starting tug’s working range',()=>{
 const barge=vessel('cairn'),tug=vessel('mule');
 for(const game of [barge,tug]){
  game.system.asteroids=[{id:'deep-rock',x:380,y:500,radius:12,hp:1,ore:4,crystal:0}];game._mine(.1);
  game.system.pickups=[{id:'distant-ore',x:285,y:500,ore:2,crystal:0,credits:0}];game._updatePickups(.1,[game]);
 }
 assert.equal(barge.state.cargo.ore,4);assert.equal(tug.state.cargo.ore,0);
 assert.ok(barge.system.pickups[0].x<285);assert.equal(tug.system.pickups[0].x,285);
 barge.system.pickups[0].x=310;ok(barge.salvage('distant-ore'));assert.equal(barge.state.cargo.ore,6);
 tug.system.pickups[0].x=310;assert.equal(tug.salvage('distant-ore').code,'distance');
});
