import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.mjs';
import {nearestRecoveryStation} from '../dist/ship-recovery.mjs';

const ok=result=>{assert.equal(result?.ok,true,result?.reason);return result;};
function moveSystem(game,id){game._persistRuntime();game.state.systemId=id;game._loadSystem(id);}

test('a destroyed owned hull leaves its captain shipless at the closest station, rather than the first station or home',()=>{
 const game=new Game('nearest-loss'),ship=game.state.ship,credits=game.state.credits;
 moveSystem(game,'brindle');const stations=game.system.bodies.filter(body=>body.kind==='station'),station=stations.at(-1);
 assert.ok(stations.length>1);Object.assign(ship,{x:station.x+15,y:station.y,vx:140,vy:-80});
 game.state.cargo={ore:17,crystal:9};game.state.upgrades.fold_1=1;
 game._damageShip(99999);
 assert.equal(ship.hull,0);assert.equal(ship.destroyed,true);assert.equal(ship.x,station.x+15);
 assert.equal(game.state.locationId,station.id);assert.equal(game.state.systemId,'brindle');assert.equal(game.state.mode,'person');
 assert.equal(game.ownsShip,false);assert.equal(game.hasActiveVessel,false);assert.deepEqual(game.state.fleet.owned,[]);
 assert.deepEqual(game.state.cargo,{ore:0,crystal:0});assert.deepEqual(game.state.upgrades,{});assert.equal(game.state.credits,credits);
 assert.equal(game.state.shipRecovery.vesselId,ship.id);assert.equal(game.state.shipRecovery.destination.bodyId,station.id);
 assert.equal(game.state.shipRecovery.sourceFactionId,'freewake');assert.equal(game.state.stats.rescues,1);
 assert.equal(game.launch().ok,false);assert.equal(game.chapter.id,'replace_lost_ship');
});

test('saving after destruction does not restore a hull; a replacement must be purchased normally',()=>{
 let game=new Game('loss-purchase');const lost=game.state.ship;
 game._damageShip(99999);game=Game.fromSave(game.save());
 assert.equal(game.ownsShip,false);assert.equal(game.hasActiveVessel,false);assert.equal(game.state.locationId,'kettle');
 assert.equal(game.selectShip(lost.classId).ok,false);assert.equal(game.launch().ok,false);
 game.state.credits=650;ok(game.buyShip('sparrow'));
 assert.equal(game.ownsShip,true);assert.equal(game.state.credits,230);assert.notEqual(game.state.ship.id,lost.id);
 assert.equal(game.state.ship.destroyed,undefined);assert.equal(game.canUseOwnShipHere(),true);ok(game.launch());
});

for(const startMode of ['regular','hardcore'])test(`${startMode}: employer loss on a distant deployment preserves the original inventory and uses the loss system's station`,()=>{
 const game=new Game(`employer-remote-${startMode}`,{startMode}),morrow=game.system.bodies.find(body=>body.id==='morrow');
 if(startMode==='regular'){Object.assign(game.state.ship,{x:morrow.x+morrow.radius+70,y:morrow.y,vx:0,vy:0});ok(game.dock(morrow.id));}
 const personal=game.state.ship,personalCopy=structuredClone(personal),owned=[...game.state.fleet.owned];
 ok(game.acceptNpcContract('gunner'));const employer=game.state.ship,contract=game.state.npcContract;
 moveSystem(game,'meridian');const station=game.system.bodies.find(body=>body.id==='ledger');
 Object.assign(employer,{x:station.x+50,y:station.y,vx:0,vy:0});contract.dockedAt=null;contract.phase='working';
 game._damageShip(99999);
 assert.equal(employer.hull,0);assert.equal(employer.destroyed,true);assert.equal(game.state.ship,personal);assert.deepEqual(personal,personalCopy);
 assert.equal(game.state.systemId,'meridian');assert.equal(game.system.id,'meridian');assert.equal(game.state.locationId,'ledger');assert.equal(game.state.mode,'person');
 assert.equal(game.state.npcContract,null);assert.equal(game.state.npcContractHistory.at(-1).outcome,'interrupted');assert.equal(game.state.npcContractHistory.at(-1).wages,0);
 assert.deepEqual(game.state.fleet.owned,owned);assert.equal(game.ownsShip,startMode==='regular');assert.equal(game.canUseOwnShipHere(),false);
 if(startMode==='regular'){assert.equal(game.state.livelihoods.parkedShip.systemId,'hearth');assert.equal(game.state.livelihoods.parkedShip.bodyId,'morrow');}
 const restored=Game.fromSave(game.save());assert.equal(restored.state.locationId,'ledger');assert.equal(restored.canUseOwnShipHere(),false);
});

test('legacy zero-hull saves cannot be revived by stat normalization and finish recovery on the next solo tick',()=>{
 const seed=new Game('legacy-zero'),save=seed.save();save.ship.hull=0;delete save.ship.destroyed;
 const restored=Game.fromSave(save);assert.equal(restored.state.ship.hull,0);assert.equal(restored.state.ship.destroyed,true);
 restored.step(.1,{});assert.equal(restored.ownsShip,false);assert.equal(restored.state.mode,'person');assert.equal(restored.state.locationId,'kettle');
});

test('station choice is based on the loss position and never a closer planet',()=>{
 const system={bodies:[{id:'first',kind:'station',x:100,y:0},{id:'planet',kind:'planet',x:1,y:0},{id:'near',kind:'station',x:20,y:0}]};
 assert.equal(nearestRecoveryStation(system,{x:0,y:0}).id,'near');
 assert.equal(nearestRecoveryStation(system,{x:200,y:0}).id,'first');
});
