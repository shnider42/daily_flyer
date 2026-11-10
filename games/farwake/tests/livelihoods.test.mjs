import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,distance} from '../dist/engine.mjs';
import {generateSurface,isWalkable} from '../dist/surface.mjs';
import {enemyHullProfile} from '../dist/fleet.mjs';

const ok=result=>{assert.equal(result?.ok,true,result?.reason||JSON.stringify(result));return result;};
const hardcore=(seed='shipless')=>new Game(seed,{startMode:'hardcore'});
function atEntity(game,id){
 const entity=generateSurface(game.currentBody,game.state.seed,game.state.flags).entities.find(entity=>entity.id===id);
 assert.ok(entity,`Missing physical contact ${id}`);Object.assign(game.state.person,{x:entity.x,y:entity.y});return entity;
}
function shift(game){
 const job=game.availableJobs().find(job=>job.type==='work'&&job.status==='available');assert.ok(job);ok(game.acceptJob(job.id));
 const relays=generateSurface(game.currentBody,game.state.seed,game.state.flags).entities.filter(entity=>entity.type==='work');assert.ok(relays.length>=3);
 for(const relay of relays.slice(0,3)){
  Object.assign(game.state.person,{x:relay.x,y:relay.y});
  const token=`${relay.id}:${job.id}`;assert.equal(ok(game.recordActivity('work',{token,kind:'repair'})).first,true);
  assert.equal(ok(game.recordActivity('work',{token,kind:'repair'})).first,false);
 }
 const paid=ok(game.turnInJob(job.id));assert.equal(game.turnInJob(job.id).ok,false);return paid;
}
function dock(game,bodyId){
 const body=game.system.bodies.find(body=>body.id===bodyId);assert.ok(body);
 Object.assign(game.state.ship,{x:body.x,y:body.y+body.radius+80,vx:0,vy:0});ok(game.dock(bodyId));
}

test('Hardcore changes only the initial ship ownership and on-foot arrival',()=>{
 const regular=new Game('same-captain'),game=hardcore('same-captain');
 assert.equal(regular.state.mode,'ship');assert.equal(regular.ownsShip,true);
 assert.equal(game.state.mode,'person');assert.equal(game.state.systemId,'hearth');assert.equal(game.state.locationId,'morrow');
 assert.equal(game.ownsShip,false);assert.equal(game.hasActiveVessel,false);assert.deepEqual(game.state.fleet.owned,[]);
 for(const key of ['credits','character','cargo','upgrades'])assert.deepEqual(game.state[key],regular.state[key],key);
 assert.equal(game.state.person.health,regular.state.person.health);assert.equal(game.state.person.maxHealth,regular.state.person.maxHealth);
 const surface=generateSurface(game.currentBody,game.state.seed,game.state.flags);assert.ok(isWalkable(surface,game.state.person.x,game.state.person.y));
 assert.equal(game.freeBerths,0);assert.equal(game.hasHyperdrive,false);assert.equal(game.chapter.id,'earn_first_ship');
});

test('shipless actions and simulation cannot mint a ship, fire weapons or take damage on a phantom hull',()=>{
 const game=hardcore('no-phantom'),pose={x:game.state.ship.x,y:game.state.ship.y},hull=game.state.ship.hull;
 for(const result of [game.launch(),game.quickLaunch(),game.enterCabin(),game.fireWeapons(),game.service('emergency'),game.buyUpgrade('thrusters_1')])assert.equal(result.code,'no-ship');
 game.state.mode='ship';
 assert.equal(game.dock('kettle').code,'no-ship');assert.equal(game.travelInfo('vesper').code,'no-ship');
 const bullets=game.system.bullets.length;
 game._fire();game._mine(10);game._damageShip(999);game.step(.1,{thrust:1,fire:true,mine:true});
 assert.equal(game.system.bullets.length,bullets);assert.equal(game.state.ship.hull,hull);assert.deepEqual({x:game.state.ship.x,y:game.state.ship.y},pose);
 assert.equal(game.state.stats.oreMined,0);assert.equal(game.interact(),null);
 const restored=Game.fromSave(game.save());assert.equal(restored.state.mode,'person');assert.equal(restored.ownsShip,false);assert.deepEqual(restored.state.fleet.owned,[]);
});

test('repeatable local maintenance supports a zero-credit captain and pays only once per completed shift',()=>{
 let game=hardcore('always-work');game.state.credits=0;
 const ids=[];
 for(let index=0;index<5;index++){
  const paid=shift(game);ids.push(paid.job.id);
  assert.equal(game.state.credits,(index+1)*120);assert.equal(game.state.stats.jobs,index+1);
  game=Game.fromSave(game.serialize());assert.equal(game.ownsShip,false);
 }
 assert.equal(new Set(ids).size,5);assert.ok(game.availableJobs().some(job=>job.type==='work'&&job.status==='available'));
 assert.equal(game.state.completedChapters.length,0,'Ship chapters wait until a ship is actually acquired');
});

test('two genuine maintenance contracts buy a used first hull without ore, trade-in or free replacement',()=>{
 let game=hardcore('first-paid-hull');assert.equal(game.classInfo('sparrow').active,false);
 assert.equal(game.classInfo('sparrow').cost,420);assert.equal(game.classInfo('sparrow').ore,0);assert.equal(game.buyShip('sparrow').code,'cost');
 shift(game);shift(game);assert.equal(game.state.credits,420);assert.equal(game.state.cargo.ore,0);
 ok(game.buyShip('sparrow'));assert.equal(game.state.credits,0);assert.equal(game.ownsShip,true);assert.equal(game.hasActiveVessel,true);assert.equal(game.state.ship.unowned,undefined);
 assert.deepEqual(game.state.fleet.owned,['sparrow']);assert.ok(distance(game.state.ship,game.currentBody)<=game.currentBody.radius+160);
 assert.equal(game.canUseOwnShipHere(),true);assert.equal(game.buyShip('sparrow').code,'owned');
 game=Game.fromSave(game.save());assert.equal(game.ownsShip,true);assert.deepEqual(game.state.fleet.owned,['sparrow']);ok(game.launch());
});

test('all captains can buy the same cash-only used starter ships',()=>{
 const regular=new Game('used-market');dock(regular,'kettle');regular.state.credits=1000;
 const quotes=['sparrow','kestrel','mule'].map(id=>regular.usedStarterQuote(id));
 assert.deepEqual(quotes.map(quote=>[quote.cost,quote.ore]),[[420,0],[420,0],[480,0]]);
 ok(regular.buyShip('mule'));assert.equal(regular.state.credits,520);assert.equal(regular.state.cargo.ore,0);assert.equal(regular.shipClass.id,'mule');
});

test('paid local passage validates real inhabited destinations, money and a persistent arrival receipt',()=>{
 let game=hardcore('ticket'),quote=game.passengerQuote('kettle');ok(quote);
 assert.ok(quote.fare>0);assert.equal(quote.credits,180);assert.equal(quote.originId,'morrow');
 assert.equal(game.passengerQuote('tinbell').code,'target');assert.equal(game.passengerQuote('earth').code,'target');assert.equal(game.passengerQuote('morrow').code,'target');
 const before=game.serialize();assert.equal(game.takePassengerTransit('made-up').ok,false);assert.equal(game.serialize(),before);
 const result=ok(game.takePassengerTransit('kettle'));assert.equal(game.state.credits,180-quote.fare);assert.equal(game.state.locationId,'kettle');assert.equal(game.state.mode,'person');
 assert.equal(game.ownsShip,false);assert.equal(result.receipt.fare,quote.fare);assert.equal(game.state.livelihoods.journeys.length,1);
 assert.equal(game.takePassengerTransit('kettle').ok,false,'Replaying the ticket cannot buy a second trip at the same destination');
 game=Game.fromSave(game.serialize());assert.equal(game.state.locationId,'kettle');assert.equal(game.ownsShip,false);assert.equal(game.state.livelihoods.journeys[0].toBody,'kettle');
 game.state.credits=0;const origin=game.state.locationId;assert.equal(game.takePassengerTransit('morrow').code,'cost');assert.equal(game.state.locationId,origin);assert.equal(game.state.credits,0);
 assert.ok(game.availableJobs().some(job=>job.type==='work'&&job.status==='available'));
});

test('taking a ferry leaves an owned vessel at its original port through save and resume',()=>{
 let game=new Game('parked-personal');dock(game,'kettle');game.state.credits=1200;
 const id=game.state.ship.id,pose={x:game.state.ship.x,y:game.state.ship.y};
 ok(game.takePassengerTransit('morrow'));assert.equal(game.state.locationId,'morrow');assert.equal(game.ownsShip,true);
 assert.deepEqual({x:game.state.ship.x,y:game.state.ship.y},pose);assert.equal(game.state.livelihoods.parkedShip.bodyId,'kettle');assert.equal(game.state.livelihoods.parkedShip.vesselId,id);
 assert.equal(game.canUseOwnShipHere(),false);assert.equal(game.launch().code,'ship-location');assert.equal(game.quickLaunch().code,'ship-location');assert.equal(game.buyUpgrade('thrusters_1').code,'ship-location');assert.equal(game.buyShip('mule').code,'ship-location');
 game=Game.fromSave(game.save());assert.equal(game.state.locationId,'morrow');assert.deepEqual({x:game.state.ship.x,y:game.state.ship.y},pose);assert.equal(game.canUseOwnShipHere(),false);
 ok(game.takePassengerTransit('kettle'));assert.equal(game.canUseOwnShipHere(),true);ok(game.launch());assert.equal(game.state.ship.id,id);assert.equal(game.state.livelihoods.parkedShip,null);
});

test('passenger transport preserves Earth quarantine and landing permission',()=>{
 const game=hardcore('restricted-ticket');game._persistRuntime();game.state.systemId='sol';game._loadSystem('sol');
 const port=game.system.bodies.find(body=>body.id==='threshold');assert.ok(port);game._arriveAsPassenger(port);
 assert.equal(game.passengerQuote('earth').code,'quarantine');assert.equal(game.takePassengerTransit('earth').code,'quarantine');assert.equal(game.state.credits,180);
 for(const flag of ['vault_recovered','homeward_signal','threshold_answered'])game._flag(flag);
 ok(game.takePassengerTransit('earth'));assert.equal(game.state.locationId,'earth');assert.equal(game.ownsShip,false);
});

test('clinic shifts remain available without a ship while carrying patients or paid passengers requires one',()=>{
 const game=hardcore('clinic-without-hull'),entityId='quest:profession-desk:morrow';atEntity(game,entityId);
 ok(game.enlistProfession({professionId:'doctor',entityId}));
 const offer=game.professionBoard(entityId).offers.find(offer=>offer.professionId==='doctor');assert.equal(offer.actions[0].available,true);
 ok(game.professionAction({action:'accept',jobId:offer.id,entityId}));const job=game.state.professions.active;
 for(let round=0;round<3;round++){
  const puzzle=game.professionBoard(entityId).active.puzzle,options=puzzle.inputs[0].options;
  const names=options.some(option=>option.label==='Aster')?['Aster','Celia','Bram']:options.some(option=>option.label==='Daro')?['Eli','Fenn','Daro']:['Iris','Gita','Holl'];
  ok(game.professionAction({action:'triage',jobId:job.id,entityId,solution:names.map(name=>options.find(option=>option.label===name).id)}));
 }
 assert.equal(game.state.credits,260);assert.equal(game.state.professions.careers.doctor.completed,1);assert.equal(game.ownsShip,false);
 ok(game.enlistProfession({professionId:'paramedic',entityId}));const ambulance=game.professionBoard(entityId).offers.find(offer=>offer.professionId==='paramedic');assert.equal(ambulance.actions[0].available,false);
 assert.equal(game.professionAction({action:'accept',jobId:ambulance.id,entityId}).code,'capacity');assert.equal(game.acceptPassenger('anything','anything').code,'no-ship');
});

test('a ferry ticket cannot deliver someone who is still aboard the captain’s parked ship',()=>{
 const game=new Game('passenger-not-teleported');dock(game,'kettle');const desk='quest:passage-desk:kettle';atEntity(game,desk);
 const offer=game.passengerOffers().find(offer=>offer.available);assert.ok(offer);ok(game.acceptPassenger(offer.id,desk));
 ok(game.takePassengerTransit(offer.targetBody));atEntity(game,offer.targetEntityId);
 assert.equal(game.deliverPassenger(offer.targetEntityId).code,'vessel');assert.equal(game.abandonPassenger().code,'vessel');assert.ok(game.state.narrative.passenger);
 ok(game.takePassengerTransit('kettle'));ok(game.launch());dock(game,offer.targetBody);atEntity(game,offer.targetEntityId);ok(game.deliverPassenger(offer.targetEntityId));
});

test('shipless recovery and authoritative borrowed-vessel snapshots do not grant an owned hull',()=>{
 const game=hardcore('no-free-rescue');game.state.person.health=0;game._rescue('Recovered by local services.');
 assert.equal(game.ownsShip,false);assert.equal(game.hasActiveVessel,false);assert.deepEqual(game.state.fleet.owned,[]);assert.equal(game.state.mode,'person');assert.ok(game.state.person.health>0);
 const saved=game.save();delete saved.ship.unowned;saved.ship.classId='tern';saved.multiplayer={serverAuthoritative:true,ownedVesselId:null};
 const guest=Game.fromSave(saved);assert.equal(guest.ownsShip,false);assert.equal(guest.hasActiveVessel,true);assert.deepEqual(guest.state.fleet.owned,[]);
});

test('tiny starter craft reject exterior boarding parties in either direction',()=>{
 const game=new Game('tiny-boarding'),enemy={...enemyHullProfile('sparrow'),id:'tiny-target',name:'Tiny target',x:game.state.ship.x+30,y:game.state.ship.y,hp:60,maxHp:60,disabled:true};
 game.system.enemies.push(enemy);assert.equal(game.boardEnemy(enemy.id).code,'capacity');assert.equal(game.state.interior,null);
 game.state.ship.shield=0;assert.equal(game.startBoarding(enemy.id).code,'capacity');
});
