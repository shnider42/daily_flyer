import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.mjs';
import {generateSurface} from '../dist/surface.mjs';
import {militaryPortAccess} from '../dist/profession-rules.mjs';

const ok=value=>{assert.equal(value?.ok,true,value?.reason||JSON.stringify(value));return value;};
function desk(game){
 const entity=generateSurface(game.currentBody,game.state.seed,game.state.flags).entities.find(value=>value.data?.professionDesk);
 assert.ok(entity);Object.assign(game.state.person,{x:entity.x,y:entity.y});return entity.id;
}
function dock(game,bodyId){
 const body=game.system.bodies.find(value=>value.id===bodyId);Object.assign(game.state.ship,{x:body.x,y:body.y+body.radius+80,vx:0,vy:0});game.state.pendingEncounter=null;ok(game.dock(bodyId));return desk(game);
}
function enlist(game){const entityId=desk(game);ok(game.enlistProfession({professionId:'military',entityId}));return entityId;}
function claim(game,entityId){return game.professionAction({action:'claimServiceShip',entityId});}
function hit(game,enemy,damage,ownerId=game.playerId){
 game.system.bullets.push({id:`shot:${ownerId}:${damage}:${game.state.stats.time}`,x:enemy.x,y:enemy.y,vx:1,vy:0,ttl:1,damage,owner:'player',ownerId,vesselId:game.state.ship.id,radius:4});game._updateBullets(.05,[game]);
}

test('shipless faction recruitment issues a physical cutter once and clearance follows service standing',()=>{
 let game=new Game('service-recruit',{startMode:'hardcore'}),entityId=desk(game);
 assert.equal(militaryPortAccess(game,'freewake').ok,false);
 assert.equal(claim(game,entityId).ok,false);assert.equal(game.ownsShip,false);
 ok(game.enlistProfession({professionId:'military',entityId}));
 assert.equal(militaryPortAccess(game,'freewake').ok,true);assert.equal(militaryPortAccess(game,'concord').ok,false);
 const credits=game.state.credits;
 ok(game.professionAction({action:'claimServiceShip',entityId,classId:'capital',cost:-9999}));
 assert.equal(game.ownsShip,true);assert.equal(game.state.ship.classId,'sparrow');assert.equal(game.canUseOwnShipHere(),true);
 assert.deepEqual(game.state.fleet.owned,['sparrow']);assert.equal(game.state.credits,credits);
 game.state.ship.hull=37;game.state.ship.fuel=4;assert.equal(claim(game,entityId).ok,false);
 assert.equal(game.state.ship.hull,37);assert.equal(game.state.ship.fuel,4);
 game=Game.fromSave(game.save());entityId=desk(game);assert.equal(claim(game,entityId).ok,false);
 assert.deepEqual(game.state.professions.careers.military.serviceShips,['sparrow']);
 game.state.rep.freewake=-25;assert.equal(militaryPortAccess(game,'freewake').code,'military-standing');
 game.state.rep.freewake=-24;assert.equal(militaryPortAccess(game,'freewake').ok,true);
});

test('three physically verified patrols earn one escort, with no progression for cancelled or other captains’ combat',()=>{
 let game=new Game('service-patrols',{startMode:'hardcore'}),entityId=enlist(game);ok(claim(game,entityId));
 let offer=game.professionBoard(entityId).offers.find(value=>value.professionId==='military');
 ok(game.professionAction({action:'accept',jobId:offer.id,entityId}));
 assert.equal(claim(game,entityId).ok,false);
 ok(game.professionAction({action:'cancel',jobId:offer.id,entityId}));assert.equal(game.state.professions.careers.military.completed,0);
 for(let index=0;index<3;index++){
  game.state.stats.time+=60;offer=game.professionBoard(entityId).offers.find(value=>value.professionId==='military');
  ok(game.professionAction({action:'accept',jobId:offer.id,entityId}));const job=game.state.professions.active;
  ok(game.launch());const enemy=game.system.enemies.find(value=>value.id===job.targetId);assert.ok(enemy);
  Object.assign(enemy,{x:1200,y:-1600+index*250});
  Object.assign(game.state.ship,{x:enemy.x-70,y:enemy.y});
  hit(game,enemy,60,'other-captain');assert.equal(game.professionAction({action:'confirmPatrol',jobId:job.id}).ok,false);
  hit(game,enemy,14);ok(game.professionAction({action:'confirmPatrol',jobId:job.id}));
  entityId=dock(game,job.originBody);ok(game.professionAction({action:'report',jobId:job.id,entityId}));
  assert.equal(game.state.professions.careers.military.completed,index+1);
  if(index<2)assert.equal(claim(game,entityId).ok,false);
 }
 const credits=game.state.credits,ore=game.state.cargo.ore,shipId=game.state.ship.id;
 game.state.person.x+=100;assert.equal(claim(game,entityId).ok,false);entityId=desk(game);
 ok(claim(game,entityId));assert.equal(game.state.ship.classId,'marten');assert.equal(game.state.ship.id,shipId);
 assert.equal(game.state.credits,credits);assert.equal(game.state.cargo.ore,ore);assert.deepEqual(game.state.professions.careers.military.serviceShips,['sparrow','marten']);
 game.state.ship.hull=123;game.state.ship.fuel=7;
 game=Game.fromSave(game.save());entityId=desk(game);assert.equal(claim(game,entityId).ok,false);
 assert.equal(game.state.ship.hull,123);assert.equal(game.state.ship.fuel,7);
});

test('an owner gets no extra recruit cutter and an already owned escort receives no repair or duplicate payout',()=>{
 const game=new Game('service-existing');const entityId=dock(game,'kettle');ok(game.enlistProfession({professionId:'military',entityId}));
 assert.equal(claim(game,entityId).ok,false);assert.deepEqual(game.state.fleet.owned,['sparrow']);
 game.state.professions.careers.military.completed=3;
 game.state.fleet.owned.push('marten');game._activateClass('marten',true);game.state.ship.hull=71;game.state.ship.fuel=2;
 const credits=game.state.credits;
 assert.equal(ok(claim(game,entityId)).alreadyOwned,true);
 assert.equal(game.state.ship.hull,71);assert.equal(game.state.ship.fuel,2);assert.equal(game.state.credits,credits);
 assert.equal(game.state.fleet.owned.filter(id=>id==='marten').length,1);assert.equal(claim(game,entityId).ok,false);
});

test('service normalization rejects unrelated hull grants and civilian dispatch avoids unlicensed bases',()=>{
 const game=new Game('service-normalize',{startMode:'hardcore'}),entityId=enlist(game);
 game.state.professions.careers.military.serviceShips=['capital','marten','marten','sparrow','__proto__'];game.initializeProfessions();
 assert.deepEqual(game.state.professions.careers.military.serviceShips,['marten','sparrow']);
 game.state.systemId='nacre';game._loadSystem('nacre');game.state.locationId='ward';game.state.mode='person';
 const origin=game.system.bodies.find(value=>value.id==='ward');assert.ok(origin);const contact=generateSurface(origin,game.state.seed,game.state.flags).entities.find(value=>value.data?.professionDesk);Object.assign(game.state.person,{x:contact.x,y:contact.y});
 ok(game.enlistProfession({professionId:'law',entityId:contact.id}));game.state.credits=10000;
 for(let index=0;index<100;index++){
  game.state.stats.time+=60;game.state.professions.serial=index;
  const offer=game.professionBoard(contact.id).offers.find(value=>value.professionId==='law');
  ok(game.professionAction({action:'accept',jobId:offer.id,entityId:contact.id}));assert.notEqual(game.state.professions.active.targetBody,'bastion-yard');
  ok(game.professionAction({action:'cancel',jobId:offer.id,entityId:contact.id}));
 }
 assert.equal(game.state.professions.careers.military.factionId,'freewake');
});
