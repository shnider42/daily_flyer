import test from 'node:test';
import assert from 'node:assert/strict';
import {Realm} from '../../server/realm.mjs';
import {getShipClass} from '../../dist/fleet.mjs';

const ok=result=>assert.equal(result.ok,true,result.reason);
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);
async function crew(classId,role){
 const persistence={kind:'memory',async save(_id,version){return{version:version+1};}},realm=new Realm({id:'HULLTOOLS',seed:'hull-tools-shared',persistence});
 const{captain:owner}=await realm.createCaptain('Owner'),{captain:guest}=await realm.createCaptain('Crew');
 for(const captain of [owner,guest])realm.attach(captain,{close(){}});
 const vessel=realm.vessels.get(owner.ownedVesselId),hull=getShipClass(classId);
 Object.assign(vessel.ship,hull.stats,{classId,berths:hull.berths,x:0,y:500,vx:0,vy:0,angle:0,hull:hull.stats.maxHull,shield:hull.stats.maxShield,energy:50});
 Object.assign(realm.vessels.get(guest.ownedVesselId).ship,{x:90,y:500});
 ok(await realm.command(owner,'setCrewAccess',{captainId:guest.id,allowed:true,roles:[role]}));
 ok(await realm.command(guest,'boardShip',{vesselId:vessel.id}));
 const stationRole=role==='weapons'?'security':role,station=realm._surface(guest).entities.find(e=>e.data?.stationRole===stationRole);
 assert.ok(station);Object.assign(guest.game.state.person,{x:station.x,y:station.y});
 ok(await realm.command(guest,'takeStation',{role,entityId:station.id}));
 const room=realm._room(vessel.systemId);room.runtime.enemies=[];return{realm,owner,guest,vessel,room};
}

test('a visiting weapons officer fires the carrier’s paired mount, charged once to that hull',async()=>{
 const{realm,owner,guest,vessel,room}=await crew('marten','weapons'),timestamp=Date.now(),before=vessel.ship.energy;
 guest.input={fire:true};guest.inputAt=timestamp;guest.inputSeq=1;owner.input={};owner.inputAt=timestamp;
 realm.step(1/30,1,timestamp,timestamp);
 const shots=room.runtime.bullets.filter(b=>b.vesselId===vessel.id);assert.equal(shots.length,2);
 assert.ok(shots.every(b=>b.shooterId===guest.id&&b.damage===vessel.ship.damage*.6));near(vessel.ship.energy,before+11/30-5);
 assert.equal(realm.vessels.get(guest.ownedVesselId).ship.classId,'sparrow');
});

test('the engineering crew action uses the actual Atlas workshop and its resource cost',async()=>{
 const{realm,guest,vessel}=await crew('atlas','engineering');vessel.ship.hull=300;const before=vessel.ship.energy;
 const answer=await realm.command(guest,'crewAction',{action:'repair'});ok(answer);assert.equal(vessel.ship.hull,316);assert.equal(vessel.ship.energy,before-22);
 assert.equal((await realm.command(guest,'crewAction',{action:'repair'})).code,'cooldown');
});

test('medical treatment aboard a carrier reaches its actual pilot and visiting crew',async()=>{
 const{realm,owner,guest,vessel}=await crew('capital','medical');owner.game.state.person.health=40;guest.game.state.person.health=50;const before=vessel.ship.energy;
 ok(await realm.command(guest,'crewAction',{action:'heal'}));assert.equal(owner.game.state.person.health,64);assert.equal(guest.game.state.person.health,74);assert.equal(vessel.ship.energy,before-20);
 const outside=realm.vessels.get(guest.ownedVesselId);assert.equal(outside.ship.energy,100,'The visitor’s own parked reactor is not charged for carrier treatment.');
});
