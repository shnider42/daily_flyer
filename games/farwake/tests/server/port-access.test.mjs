import test from 'node:test';
import assert from 'node:assert/strict';
import {Realm} from '../../server/realm.mjs';
import {cabinLayout} from '../../dist/fleet.mjs';

const ok=result=>{assert.equal(result?.ok,true,result?.reason||JSON.stringify(result));return result;};
const storage=()=>({kind:'memory',async save(_id,version){return{version:version+1};}});
async function fixture(count=1,{regularOwner=false}={}){
 const realm=new Realm({id:'PORTAUTH',seed:'base-clearance-authority',persistence:storage()}),captains=[];
 for(let i=0;i<count;i++){
  const {captain}=await realm.createCaptain(`Port captain ${i+1}`,{startMode:regularOwner&&i===0?'regular':'hardcore'});
  ok(realm.attach(captain,{close(){}}));captains.push(captain);
 }
 return{realm,captains};
}
function quiet(realm,systemId){
 const room=realm._room(systemId);for(const key of ['enemies','bullets','signals','pickups'])room.runtime[key]=[];return room;
}
function enlist(realm,c){
 const desk=realm._surface(c).entities.find(entity=>entity.data?.professionDesk);assert.ok(desk);
 Object.assign(c.game.state.person,{x:desk.x,y:desk.y});ok(realm._command(c,'enlistProfession',{professionId:'military',entityId:desk.id}));
}
function positionVessel(realm,c,vessel,systemId,bodyId){
 const body=quiet(realm,systemId).runtime.bodies.find(value=>value.id===bodyId);assert.ok(body);
 vessel.systemId=systemId;Object.assign(vessel.ship,{x:body.x,y:body.y+body.radius+80,vx:0,vy:0});
 c.game.state.pendingEncounter=null;realm._bindCaptain(c);return body;
}
function takeHelm(realm,c,vessel){
 Object.assign(c.game.state.person,cabinLayout(vessel.ship.classId).stations.helm);
 return realm._command(c,'takeStation',{role:'helm'});
}
const lease=(c,overrides={})=>({id:`${c.id}:room:nacre:bastion-yard`,ownerId:c.id,ownerName:c.name,kind:'room',systemId:'nacre',locationId:'bastion-yard',x:480,y:570,createdAt:Date.now(),expiresAt:Date.now()+86400000,...overrides});

test('the authority rejects forged ferry clearance and fees even with a valid-looking request payload',async()=>{
 const {realm,captains:[c]}=await fixture();quiet(realm,'nacre');realm._landCharacter(c,'nacre','ward');
 c.game.state.credits=5000;const before={credits:c.game.state.credits,location:c.game.state.locationId,home:structuredClone(c.home),journeys:structuredClone(c.game.state.livelihoods.journeys)};
 const denied=await realm.command(c,'takePassengerTransit',{bodyId:'bastion-yard',factionId:'concord',enlisted:true,clearance:true,fare:0},'forged-base-ticket');
 assert.equal(denied.code,'military-clearance');
 assert.deepEqual({credits:c.game.state.credits,location:c.game.state.locationId,home:c.home,journeys:c.game.state.livelihoods.journeys},before);
 assert.equal(realm.vessels.size,0);ok(await realm.command(c,'takePassengerTransit',{bodyId:'bastion'},'public-hospital-ticket'));
 assert.equal(c.game.state.locationId,'bastion');assert.ok(c.game.state.credits<before.credits);
});

test('four captains share an escorted base visit while docking clearance follows the actual helmsman',async()=>{
 const {realm,captains:[owner,guest,medic,engineer]}=await fixture(4,{regularOwner:true}),crew=[guest,medic,engineer];
 const vessel=realm.vessels.get(owner.ownedVesselId);positionVessel(realm,owner,vessel,'brindle','orchard');
 ok(realm._command(owner,'dock',{id:'orchard'}));enlist(realm,owner);
 owner.game.state.fleet.owned.push('hauler');owner.game._activateClass('hauler',true);vessel.actor=null;
 for(const c of crew){
  realm._landCharacter(c,'brindle','orchard');
  ok(realm._command(owner,'setCrewAccess',{captainId:c.id,allowed:true,roles:['helm','medical','engineering']}));
  ok(realm._command(c,'boardShip',{vesselId:vessel.id}));
 }
 ok(realm._command(owner,'boardShip',{vesselId:vessel.id}));ok(takeHelm(realm,owner,vessel));
 positionVessel(realm,owner,vessel,'brindle','common-watch');
 assert.equal(realm._command(guest,'dock',{id:'common-watch',captainId:owner.id}).code,'helm','A passenger cannot submit a docking request as the captain.');
 ok(realm._command(owner,'takeStation',{role:'passenger'}));ok(takeHelm(realm,guest,vessel));
 const before={x:vessel.ship.x,y:vessel.ship.y,credits:guest.game.state.credits};
 const denied=await realm.command(guest,'dock',{id:'common-watch',clearanceCaptainId:owner.id,factionId:'freewake'},'guest-at-military-helm');
 assert.equal(denied.code,'military-clearance','A serving owner aboard does not silently lend their identity to another helmsman.');
 assert.equal(vessel.dockedAt,null);assert.equal(guest.game.state.mode,'ship');assert.equal(vessel.helmOwner,guest.id);
 assert.deepEqual({x:vessel.ship.x,y:vessel.ship.y,credits:guest.game.state.credits},before);
 ok(realm._command(guest,'takeStation',{role:'passenger'}));ok(takeHelm(realm,owner,vessel));
 ok(await realm.command(owner,'dock',{id:'common-watch'},'authorized-group-arrival'));
 assert.equal(vessel.dockedAt,'common-watch');assert.equal(owner.game.state.locationId,'common-watch');
 for(const c of crew){
  assert.equal(c.aboard,vessel.id);assert.equal(c.game.state.interior?.kind,'ship');
  ok(realm._command(c,'leaveCrew',{}));assert.equal(c.game.state.locationId,'common-watch');assert.equal(c.portVesselId,vessel.id);
  const money=c.game.state.credits;assert.equal(realm._command(c,'setHome',{kind:'room'}).code,'military-clearance');assert.equal(c.game.state.credits,money);
 }
 // Guests can leave and rejoin the actual escorted hull; clearance does not
 // recreate the old bug where one person was stranded by another's boarding.
 for(const c of [owner,...crew])ok(realm._command(c,'boardShip',{vesselId:vessel.id}));
 ok(takeHelm(realm,owner,vessel));positionVessel(realm,owner,vessel,'brindle','orchard');ok(realm._command(owner,'dock',{id:'orchard'}));
 for(const c of crew)ok(realm._command(c,'leaveCrew',{}));
 assert.ok([owner,...crew].every(c=>c.game.state.locationId==='orchard'&&c.portVesselId===vessel.id));
 assert.equal(realm._command(guest,'takePassengerTransit',{bodyId:'common-watch'}).code,'military-clearance','An escorted visit does not grant permanent independent entry.');
 assert.equal(realm.vessels.size,1);
});

test('a future-dated existing room lease does not bypass military clearance or charge a civilian twice',async()=>{
 const {realm,captains:[c]}=await fixture();quiet(realm,'nacre');realm._landCharacter(c,'nacre','bastion-yard');
 const forged=lease(c);realm.leases[forged.id]=forged;const money=c.game.state.credits,home=structuredClone(c.home);
 const denied=await realm.command(c,'setHome',{kind:'room',factionId:'concord',clearance:true},'reuse-forged-lease');
 assert.equal(denied.code,'military-clearance');assert.equal(c.game.state.credits,money);assert.deepEqual(c.home,home);
});

test('restart rejects forged military homes, including a nonexpiring or future-dated matching lease',async()=>{
 for(const expiresAt of [undefined,Date.now()+86400000]){
  const {realm,captains:[c]}=await fixture();quiet(realm,'nacre');realm._landCharacter(c,'nacre','ward');
  const forged=lease(c,{expiresAt});c.home=structuredClone(forged);realm.leases[forged.id]=forged;
  c.lastSeen=Date.now()-600000;
  const restored=new Realm({id:realm.id,persistence:storage(),snapshot:realm.document()}),returned=restored.captains.get(c.id);
  returned.lastSeen=Date.now()-600000;ok(restored.attach(returned,{close(){}}));
  assert.equal(returned.game.state.systemId,'hearth');assert.equal(returned.game.state.locationId,'kettle');assert.equal(returned.ownedVesselId,null);
  assert.equal(restored.vessels.size,0);assert.equal(returned.game.state.credits,c.game.state.credits);
 }
});

test('a legitimate military room survives restart until the captain’s faction standing loses clearance',async()=>{
 const {realm,captains:[c]}=await fixture();quiet(realm,'nacre');realm._landCharacter(c,'nacre','ward');enlist(realm,c);
 ok(realm._command(c,'takePassengerTransit',{bodyId:'bastion-yard'}));const money=c.game.state.credits;
 ok(await realm.command(c,'setHome',{kind:'room'},'permitted-base-room'));assert.equal(c.game.state.credits,money-50);
 const paid=c.game.state.credits;ok(realm._command(c,'setHome',{kind:'room'}));assert.equal(c.game.state.credits,paid);
 c.lastSeen=Date.now()-600000;const saved=realm.document();
 const restored=new Realm({id:realm.id,persistence:storage(),snapshot:saved}),returned=restored.captains.get(c.id);
 returned.lastSeen=Date.now()-600000;ok(restored.attach(returned,{close(){}}));assert.equal(returned.game.state.locationId,'bastion-yard');
 const revoked=structuredClone(saved);revoked.captains[c.id].game.rep.concord=-25;
 const denied=new Realm({id:realm.id,persistence:storage(),snapshot:revoked}),blocked=denied.captains.get(c.id);
 blocked.lastSeen=Date.now()-600000;ok(denied.attach(blocked,{close(){}}));
 assert.equal(blocked.game.state.systemId,'hearth');assert.equal(blocked.game.state.locationId,'kettle');assert.equal(blocked.game.state.credits,paid);
});
