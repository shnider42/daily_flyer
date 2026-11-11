import test from 'node:test';
import assert from 'node:assert/strict';
import {Realm} from '../../server/realm.mjs';
import {Game} from '../../dist/engine.mjs';
import {enemyHullProfile} from '../../dist/fleet.mjs';

const ok=result=>{assert.equal(result?.ok,true,result?.reason||JSON.stringify(result));return result;};
const persistence=()=>({kind:'memory',async save(_id,version){return{version:version+1};}});
async function fixture(){
 const realm=new Realm({id:'VISITOR01',seed:'shipless-friends',persistence:persistence()}),owner=(await realm.createCaptain('Ship owner')).captain,guest=(await realm.createCaptain('Working traveler',{startMode:'hardcore'})).captain;
 for(const captain of [owner,guest])ok(realm.attach(captain,{close(){}}));
 const room=realm._room('hearth');for(const field of ['enemies','bullets','signals','pickups'])room.runtime[field]=[];
 const vessel=realm.vessels.get(owner.ownedVesselId),body=room.runtime.bodies.find(body=>body.id==='morrow');
 Object.assign(vessel.ship,{x:body.x,y:body.y+body.radius+80,vx:0,vy:0});ok(await realm.command(owner,'dock',{id:body.id}));
 return{realm,owner,guest,vessel,room};
}
function approach(realm,captain,predicate){const entity=realm._surface(captain).entities.find(predicate);assert.ok(entity);Object.assign(captain.game.state.person,{x:entity.x,y:entity.y});return entity;}
async function invite(f,{helm=true,bunk=true}={}){return ok(await f.realm.command(f.owner,'setCrewAccess',{captainId:f.guest.id,allowed:true,roles:helm?['helm','engineering','weapons','medical']:['engineering'],allowBunk:bunk}));}
// These visitor tests intentionally leave the owner ashore while the guest borrows the hull.
async function visit(f){await invite(f);ok(await f.realm.command(f.guest,'boardShip',{vesselId:f.vessel.id}));}
function assertShipless(realm,guest){
 assert.equal(guest.ownedVesselId,null);assert.equal(guest.game.ownsShip,false);assert.equal(guest.game.state.ship.unowned,true);assert.deepEqual(guest.game.state.fleet.owned,[]);
 assert.ok(![...realm.vessels.values()].some(vessel=>vessel.id===guest.game.state.ship.id));
}
function tick(realm,count=1){for(let i=0;i<count;i++)realm.step(1/30,realm.tick+1,Date.now());}

test('shipless port commands fail without poisoning the realm or granting a recovery hull',async()=>{
 const f=await fixture(),{realm,guest}=f,count=realm.vessels.size,credits=guest.game.state.credits;
 for(const name of ['returnToShip','returnToOwnShip','retreatBoarding','leaveCrew','installBunk','renameShip','setCrewAccess']){
  const result=await realm.command(guest,name,{});assert.equal(result.ok,false,name);assert.notEqual(result.code,'invalid-action',name);assert.notEqual(realm.failed,true,name);
 }
 realm._restoreAtHome(guest,{forceSafe:true});realm._recoverCaptain(guest,'Local test recovery.');assertShipless(realm,guest);assert.equal(realm.vessels.size,count);assert.equal(guest.game.state.credits,credits);
 ok(await realm.command(guest,'renameCaptain',{name:'Still able to play'}));
});

test('a shipless friend needs permission, pilots the actual borrowed hull, and pays for onward passage',async()=>{
 const f=await fixture(),{realm,owner,guest,vessel,room}=f;
 assert.equal((await realm.command(guest,'boardShip',{vesselId:vessel.id})).code,'permission');assert.equal(guest.aboard,null);
 await visit(f);assert.equal(guest.aboard,vessel.id);assertShipless(realm,guest);
 const snapshot=realm.snapshotFor(guest,{drainEvents:false}),client=Game.fromSave(snapshot.state);
 assert.equal(snapshot.state.ship.id,vessel.id);assert.equal(client.hasActiveVessel,true);assert.equal(client.ownsShip,false);assert.deepEqual(client.state.fleet.owned,[]);
 ok(await realm.command(guest,'quickHelm',{leaveCrewBehind:true}));assert.equal(vessel.helmOwner,guest.id);assert.equal(vessel.dockedAt,null);assert.equal(guest.game.state.mode,'ship');
 const before={x:vessel.ship.x,y:vessel.ship.y};realm.acceptInput(guest,1,{thrust:1});tick(realm,6);assert.ok(Math.hypot(vessel.ship.x-before.x,vessel.ship.y-before.y)>0);
 const port=room.runtime.bodies.find(body=>body.id==='kettle');Object.assign(vessel.ship,{x:port.x,y:port.y+port.radius+80,vx:0,vy:0});ok(await realm.command(guest,'dock',{id:port.id}));
 assert.equal(vessel.dockedAt,'kettle');assert.equal(guest.aboard,null);assert.equal(owner.game.state.locationId,'morrow');assertShipless(realm,guest);
 const quote=guest.game.passengerQuote('morrow'),credits=guest.game.state.credits;ok(quote);ok(await realm.command(guest,'takePassengerTransit',{bodyId:'morrow'}));
 assert.equal(guest.game.state.credits,credits-quote.fare);assert.equal(vessel.dockedAt,'kettle');assert.equal(realm.vessels.size,1);assertShipless(realm,guest);
});

test('borrowing a friend’s helm does not complete the first-owned-ship chapter',async()=>{
 const f=await fixture(),{realm,guest,vessel,room}=f;guest.game._flag('talked_mechanic');guest.game._flag('first_job');
 await visit(f);ok(await realm.command(guest,'quickHelm',{leaveCrewBehind:true}));
 const body=room.runtime.bodies.find(body=>body.id==='kettle');Object.assign(vessel.ship,{x:body.x,y:body.y+body.radius+80,vx:0,vy:0});
 const credits=guest.game.state.credits;ok(await realm.command(guest,'dock',{id:body.id}));
 assertShipless(realm,guest);assert.equal(guest.game.state.completedChapters.includes('first_shift'),false);assert.equal(guest.game.state.credits,credits);assert.equal(guest.game.chapter.id,'earn_first_ship');
});

test('a shipless helmsman resumes the same borrowed vessel through an immediate authority restart',async()=>{
 const f=await fixture(),{realm,guest,vessel}=f;await visit(f);ok(await realm.command(guest,'quickHelm',{leaveCrewBehind:true}));
 const pose={x:vessel.ship.x,y:vessel.ship.y},saved=realm.document(),restored=new Realm({id:realm.id,snapshot:saved,persistence:persistence()}),returned=restored.captains.get(guest.id),carrier=restored.vessels.get(vessel.id);
 ok(restored.attach(returned,{close(){}}));assert.equal(returned.aboard,vessel.id);assert.equal(carrier.helmOwner,guest.id);assert.equal(returned.game.state.mode,'ship');assert.equal(returned.crewRole,'helm');
 assert.deepEqual({x:carrier.ship.x,y:carrier.ship.y},pose);assert.equal(restored.vessels.size,1);assertShipless(restored,returned);
 restored.acceptInput(returned,1,{thrust:1});tick(restored,6);assert.ok(Math.hypot(carrier.ship.x-pose.x,carrier.ship.y-pose.y)>0);
});

test('a paid fitted bunk can be a shipless guest’s persistent home without becoming their ship',async()=>{
 const f=await fixture(),{realm,owner,guest,vessel}=f;await invite(f);
 ok(await realm.command(owner,'boardShip',{vesselId:vessel.id}));owner.game.state.cargo.ore=4;
 const cost=owner.game.state.credits;ok(await realm.command(owner,'installBunk',{}));assert.equal(owner.game.state.credits,cost-60);assert.equal(owner.game.state.cargo.ore,0);
 ok(await realm.command(guest,'boardShip',{vesselId:vessel.id}));const bunk=approach(realm,guest,entity=>entity.type==='bunk'&&entity.data.bunkIndex===1);
 ok(await realm.command(guest,'setHome',{kind:'bunk',entityId:bunk.id,bunkIndex:1}));assert.equal(guest.home.vesselId,vessel.id);assert.equal(vessel.bunks[1],guest.id);
 const saved=realm.document();saved.captains[guest.id].lastSeen=Date.now()-60000;
 const restored=new Realm({id:realm.id,snapshot:saved,persistence:persistence()}),returned=restored.captains.get(guest.id);ok(restored.attach(returned,{close(){}}));
 assert.equal(returned.aboard,vessel.id);assert.equal(returned.game.state.interior.kind,'ship');assert.equal(returned.home.kind,'bunk');assert.equal(restored.vessels.size,1);assertShipless(restored,returned);
 approach(restored,returned,entity=>entity.type==='exit'&&entity.data?.airlock);
 ok(await restored.command(returned,'leaveCrew',{}));assert.equal(returned.aboard,null);assert.equal(returned.game.state.locationId,'morrow');assertShipless(restored,returned);
});

test('permission loss and destruction recover a shipless guest without giving them the owner’s replacement',async()=>{
 const f=await fixture(),{realm,owner,guest,vessel}=f;await visit(f);ok(await realm.command(guest,'quickHelm',{leaveCrewBehind:true}));
 ok(await realm.command(owner,'setCrewAccess',{captainId:guest.id,allowed:false}));assert.equal(vessel.helmOwner,null);assert.equal(guest.crewRole,'passenger');assert.equal(guest.aboard,vessel.id);
 assert.equal((await realm.command(guest,'quickHelm')).code,'permission');assert.equal((await realm.command(guest,'leaveCrew')).code,'location');
 realm._destroyVessel(vessel);assert.equal(guest.aboard,null);assert.equal(guest.game.state.mode,'person');assert.ok(guest.game.state.person.health>0);assertShipless(realm,guest);
 assert.equal(vessel.destroyed,true);assert.ok([...realm.vessels.values()].filter(value=>value.name==='Recovery cutter').every(value=>value.ownerId===owner.id));
 const restored=new Realm({id:realm.id,snapshot:realm.document(),persistence:persistence()});assertShipless(restored,restored.captains.get(guest.id));
});

test('return-to-ship assistance cannot bypass a fare between inhabited ports',async()=>{
 const {realm,owner,vessel}=await fixture();const pose={x:vessel.ship.x,y:vessel.ship.y};ok(await realm.command(owner,'takePassengerTransit',{bodyId:'kettle'}));
 const credits=owner.game.state.credits,result=await realm.command(owner,'returnToShip',{});
 assert.equal(result.ok,false);assert.notEqual(result.code,'invalid-action');assert.equal(owner.game.state.locationId,'kettle');assert.equal(owner.game.state.credits,credits);assert.deepEqual({x:vessel.ship.x,y:vessel.ship.y},pose);assert.equal(vessel.dockedAt,'morrow');
});

test('a permitted shipless helmsman rescues into the borrowed carrier without acquiring its berths',async()=>{
 const f=await fixture(),{realm,owner,guest,vessel,room}=f;
 owner.game.state.fleet.owned.push('tern');owner.game._activateClass('tern',true);vessel.actor=null;
 await visit(f);ok(await realm.command(guest,'quickHelm',{leaveCrewBehind:true}));
 const sourceId='visitor-lifeboat',vesselId=`contact:${sourceId}`,signal={id:sourceId,name:'Weak lifeboat transponder',kind:'distress',encounterId:'lifeboat',vesselId,x:vessel.ship.x+70,y:vessel.ship.y,radius:20,resolved:false,scanned:false};
 const contact={id:vesselId,name:'Unpowered lifeboat',signalId:sourceId,encounterId:'lifeboat',...enemyHullProfile('kestrel'),x:signal.x,y:signal.y,angle:0,speed:0,faction:'freewake',contact:true};
 room.runtime.signals.push(signal);room.runtime.traffic.push(contact);room.record.encounterContacts||={};room.record.encounterContacts[vesselId]=structuredClone(contact);
 ok(await realm.command(guest,'scan',{id:sourceId}));ok(await realm.command(guest,'applyChoice',{encounterId:'lifeboat',choice:'rescue'}));
 assert.equal(vessel.ship.rescueGroups.length,1);assert.equal(vessel.ship.rescueGroups[0].members.length,2);assert.equal(vessel.ship.rescueGroups[0].shipId,vessel.id);
 assert.equal(guest.game.state.ship.rescueGroups.length,0);assert.equal(guest.game._permittedVessel,undefined);assert.equal(guest.game.state.multiplayer,undefined);assertShipless(realm,guest);
 assert.equal(guest.game.rescueAdmissionCheck('lifeboat','rescue').code,'no-ship','Temporary command permission must not leak onto the unowned compatibility record');
});
