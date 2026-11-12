import test from 'node:test';
import assert from 'node:assert/strict';
import { Realm } from '../../server/realm.mjs';
import { publicCrewLocation } from '../../dist/crew-awareness.mjs';

test('public presence locates a friend at a port and aboard the same docked hull without private state',async()=>{
 const persistence={kind:'memory',async save(_id,version){return{version:version+1};}};
 const realm=new Realm({id:'CREWPLACE',seed:'crew-awareness-location',persistence});
 const{captain:owner}=await realm.createCaptain('Ada'),{captain:viewer}=await realm.createCaptain('Jade');
 realm.attach(owner,{close(){}});realm.attach(viewer,{close(){}});
 const vessel=realm.vessels.get(owner.ownedVesselId),body=realm._room('hearth').runtime.bodies.find(body=>body.id==='kettle');
 Object.assign(vessel.ship,{x:body.x,y:body.y+body.radius+60,vx:0,vy:0});
 assert.equal((await realm.command(owner,'dock',{id:'kettle'})).ok,true);
 let snapshot=realm.snapshotFor(viewer),person=snapshot.presence.find(person=>person.captainId===owner.id);
 assert.equal(person.locationId,'kettle');assert.equal(person.roomKind,'surface');
 assert.equal(publicCrewLocation(viewer.game,person,snapshot.fleet).text,'Kettle Station · Hearth');
 for(const field of['token','tokenHash','game','x','y','health','credits'])assert.equal(Object.hasOwn(person,field),false,field);
 assert.equal((await realm.command(owner,'boardShip',{vesselId:vessel.id})).ok,true);
 snapshot=realm.snapshotFor(viewer);person=snapshot.presence.find(person=>person.captainId===owner.id);
 assert.equal(person.roomKind,'ship');assert.equal(person.vesselId,vessel.id);
 assert.match(publicCrewLocation(viewer.game,person,snapshot.fleet).text,/Aboard Cinder · Docked at Kettle Station/);
});
