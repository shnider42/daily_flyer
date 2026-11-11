import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import {Realm} from '../../server/realm.mjs';
import {startServer} from '../../server/index.mjs';
import {FarwakeNetwork} from '../../dist/network.mjs';
import {militaryPortAccess} from '../../dist/profession-rules.mjs';
import {withHull} from '../helpers/fleet-fixtures.mjs';

const ok=value=>{assert.equal(value?.ok,true,value?.reason||value?.result?.reason||JSON.stringify(value));return value;};
const copy=value=>structuredClone(value);
function persistence(){
 const records=new Map();return{kind:'service-memory',durable:true,async ping(){return{ok:true};},async load(id){return copy(records.get(id)||{version:0,snapshot:null});},async save(id,expectedVersion,snapshot){assert.equal(records.get(id)?.version||0,expectedVersion);records.set(id,{version:expectedVersion+1,snapshot:copy(snapshot)});return{version:expectedVersion+1};}};
}
function localStorage(){const values=new Map();return{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};}
function atDesk(realm,captain){const contact=realm._surface(captain).entities.find(entity=>entity.data?.professionDesk&&!entity.hidden);assert.ok(contact);Object.assign(captain.game.state.person,{x:contact.x,y:contact.y});return contact.id;}

test('four real clients receive only their earned personal hulls; borrowed ships, replay, faction spoofing and restart preserve ownership',async t=>{
 const store=persistence(),server=await startServer({port:0,host:'127.0.0.1',persistence:store}),clients=[];
 t.after(async()=>{for(const client of clients)client.disconnect();await server.close();});
 async function connect(options){const client=new FarwakeNetwork({url:server.url,WebSocketImpl:WebSocket,storage:localStorage(),autoReconnect:false});clients.push(client);await client.connect(options);return client;}
 const ownerClient=await connect({create:true,name:'Recruit one',startMode:'hardcore'});
 for(let i=1;i<4;i++)await connect({realmCode:ownerClient.passport.realmCode,name:`Recruit ${i+1}`,startMode:'hardcore'});
 const realm=server.manager.realms.get(ownerClient.passport.realmCode),captains=clients.map(client=>realm.captains.get(client.passport.captainId)),[owner,guest,rival,unjoined]=captains;
 assert.equal(realm.onlineCount,4);assert.equal(realm.vessels.size,0);
 for(let index=0;index<2;index++){const entityId=atDesk(realm,captains[index]);ok(await clients[index].command('enlistProfession',{professionId:'military',entityId}));}
 const ownerCredits=owner.game.state.credits,ownerDesk=atDesk(realm,owner);
 ok(await ownerClient.command('professionAction',{action:'claimServiceShip',entityId:ownerDesk,classId:'capital',credits:100000,completed:999}));
 const vessel=realm.vessels.get(owner.ownedVesselId),vesselId=vessel.id;
 assert.equal(vessel.ship.classId,'sparrow');assert.equal(vessel.ownerId,owner.id);assert.equal(vessel.dockedAt,'morrow');assert.equal(owner.game.state.credits,ownerCredits);assert.equal(realm.vessels.size,1);
 ok(await ownerClient.command('setCrewAccess',{captainId:guest.id,allowed:true,roles:['helm','engineering']}));
 ok(await clients[1].command('boardShip',{vesselId}));
 assert.equal((await clients[1].command('professionAction',{action:'claimServiceShip',entityId:ownerDesk,vesselId,classId:'capital'})).ok,false);
 assert.equal(guest.ownedVesselId,null);assert.equal(vessel.ship.classId,'sparrow');
 ok(await clients[1].command('leaveCrew'));
 const guestDesk=atDesk(realm,guest);ok(await clients[1].command('professionAction',{action:'claimServiceShip',entityId:guestDesk,vesselId,classId:'capital'}));
 assert.notEqual(guest.ownedVesselId,vesselId);assert.equal(realm.vessels.get(guest.ownedVesselId).ship.classId,'sparrow');assert.equal(realm.vessels.size,2);
 const unjoinedDesk=atDesk(realm,unjoined);assert.equal((await clients[3].command('professionAction',{action:'claimServiceShip',entityId:unjoinedDesk,enlisted:true,completed:3})).ok,false);assert.equal(unjoined.ownedVesselId,null);
 realm._landCharacter(rival,'nacre','ward');const rivalDesk=atDesk(realm,rival);
 assert.equal((await clients[2].command('enlistProfession',{professionId:'military',factionId:'freewake',entityId:rivalDesk})).ok,false);
 ok(await clients[2].command('enlistProfession',{professionId:'military',entityId:rivalDesk}));realm._landCharacter(rival,'hearth','morrow');
 assert.equal((await clients[2].command('professionAction',{action:'claimServiceShip',entityId:atDesk(realm,rival),factionId:'freewake'})).ok,false);assert.equal(rival.ownedVesselId,null);
 assert.equal(militaryPortAccess(rival.game,'freewake').ok,false);assert.equal(militaryPortAccess(rival.game,'concord').ok,true);
 owner.game.state.professions.careers.military.completed=3;
 vessel.ship.hull=31;vessel.ship.fuel=2;
 ok(await ownerClient.command('professionAction',{action:'claimServiceShip',entityId:atDesk(realm,owner),classId:'capital'}));
 assert.equal(vessel.ship.classId,'marten');assert.equal(vessel.id,vesselId);assert.equal(owner.ownedVesselId,vesselId);assert.equal(realm.vessels.size,2);
 vessel.ship.hull=77;vessel.ship.fuel=3;
 assert.equal((await ownerClient.command('professionAction',{action:'claimServiceShip',entityId:atDesk(realm,owner)})).ok,false);
 assert.equal(vessel.ship.hull,77);assert.equal(vessel.ship.fuel,3);
 const restored=new Realm({id:realm.id,snapshot:copy(realm.document()),persistence:store,version:realm.version}),returned=restored.captains.get(owner.id),savedVessel=restored.vessels.get(vesselId);
 assert.equal(savedVessel.ship.classId,'marten');assert.equal(savedVessel.ownerId,owner.id);assert.equal(savedVessel.ship.hull,77);assert.equal(returned.ownedVesselId,vesselId);
 assert.deepEqual(returned.game.state.professions.careers.military.serviceShips,['sparrow','marten']);
 ok(restored.attach(returned,{close(){}}));assert.equal((await restored.command(returned,'professionAction',{action:'claimServiceShip',entityId:atDesk(restored,returned)})).ok,false);
 assert.equal(restored.vessels.size,2);assert.notEqual(realm.failed,true);assert.equal(realm.onlineCount,4);
});

test('an escort commission reserves the recruiting owner’s berth alongside three friends and hired crew',async()=>{
 const realm=new Realm({id:'SERVICE4',seed:'service-berths',persistence:persistence()}),captains=[];
 for(let index=0;index<4;index++){const{captain}=await realm.createCaptain(`Watch ${index+1}`,{startMode:index?'hardcore':'regular'});ok(realm.attach(captain,{close(){}}));captains.push(captain);}
 const [owner,...guests]=captains,vessel=realm.vessels.get(owner.ownedVesselId),body=realm._room('hearth').runtime.bodies.find(value=>value.id==='morrow');
 withHull(owner.game,'capital');Object.assign(vessel.ship,{x:body.x,y:body.y+body.radius+80,vx:0,vy:0});ok(await realm.command(owner,'dock',{id:'morrow'}));
 owner.game.state.crew=Array.from({length:3},(_,index)=>({id:`service-crew-${index}`,name:`Crew ${index+1}`,role:'engineer',health:100,maxHealth:100,species:'human'}));
 for(const guest of guests){ok(await realm.command(owner,'setCrewAccess',{captainId:guest.id,allowed:true}));ok(await realm.command(guest,'boardShip',{vesselId:vessel.id}));}
 const entityId=atDesk(realm,owner);ok(await realm.command(owner,'enlistProfession',{professionId:'military',entityId}));owner.game.state.professions.careers.military.completed=3;
 const denied=await realm.command(owner,'professionAction',{action:'claimServiceShip',entityId});assert.equal(denied.ok,false);assert.match(denied.reason,/berth/i);
 assert.equal(vessel.ship.classId,'capital');assert.deepEqual(owner.game.state.professions.careers.military.serviceShips,[]);assert.ok(guests.every(guest=>guest.aboard===vessel.id));
 owner.game.state.crew.pop();
 ok(await realm.command(owner,'professionAction',{action:'claimServiceShip',entityId}));assert.equal(vessel.ship.classId,'marten');assert.ok(guests.every(guest=>guest.aboard===vessel.id));
 ok(await realm.command(owner,'boardShip',{vesselId:vessel.id}));assert.equal(owner.aboard,vessel.id);assert.equal(realm.onlineCount,4);
});
