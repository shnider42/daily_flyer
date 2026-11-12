import test from 'node:test';
import assert from 'node:assert/strict';
import { Realm } from '../../server/realm.mjs';
import { cabinLayout } from '../../dist/fleet.mjs';

const storage=()=>({kind:'memory',async save(_id,version){return{version:version+1};}});
const ok=result=>{assert.equal(result?.ok,true,result?.reason);return result;};
const tick=(realm,seconds)=>{for(let i=0;i<Math.round(seconds*10);i++)realm.step(.1,realm.tick+1);};
async function fixture({military=true,enemy=true,startMode='hardcore'}={}){const realm=new Realm({id:'REPAT01',seed:'military-repatriation',persistence:storage()}),{captain:c}=await realm.createCaptain('Passenger',{startMode});ok(realm.attach(c,{close(){}}));if(military){Object.assign(c.game.state.professions.careers.military,{enlisted:true,factionId:'freewake',completed:8});Object.assign(c.game.state.militaryCareer,{factionId:'freewake',branchId:'navy'});}realm._landCharacter(c,enemy?'meridian':'hearth',enemy?'ledger':'kettle');c.game.applyMilitaryRecovery({systemId:c.game.state.systemId,originFactionId:enemy?'meridian':'freewake',nearestBody:{systemId:c.game.state.systemId,bodyId:c.game.state.locationId}});return{realm,c};}
function arrive(realm,c){for(let i=0;i<4000&&c.game.state.npcContract?.phase!=='docked';i++)realm.step(.1,realm.tick+1);assert.equal(c.game.state.npcContract?.phase,'docked');}

test('server rejects every custody escape command and publishes the actual remaining sentence in motion snapshots',async()=>{
 const{realm,c}=await fixture();for(const name of ['takePassengerTransit','startMilitaryPassage','militaryCareerAction','acceptNpcContract','boardShip','leaveInterior','surfaceAction','quickLaunch','travel','claimServiceShip'])assert.equal(realm._command(c,name,{}).code,'military-detention',name);
 const full=realm.snapshotFor(c),compact=realm.snapshotFor(c,{compact:true});assert.equal(full.state.militaryRecovery.detention.remainingSeconds,300);assert.equal(compact.state.militaryRecovery.detention.remainingSeconds,300);assert.equal(realm._surface(c).entities.length,0);
});

test('detention is personal, counts connected play, and survives disconnected grace and a durable realm restart',async()=>{
 const{realm,c}=await fixture(),{captain:other}=await realm.createCaptain('Civilian',{startMode:'hardcore'});ok(realm.attach(other,{close(){}}));tick(realm,17);assert.equal(c.game.militaryRecoveryStatus().remainingSeconds,283);assert.equal(other.game.militaryRecoveryStatus(),null);
 c.session=null;c.disconnectUntil=Date.now()+60000;tick(realm,8);assert.equal(c.game.militaryRecoveryStatus().remainingSeconds,283);
 const restored=new Realm({id:realm.id,persistence:storage(),snapshot:realm.document()}),member=restored.captains.get(c.id);member.lastSeen=0;ok(restored.attach(member,{close(){}}));assert.equal(member.game.state.systemId,'meridian');assert.equal(member.game.state.interior.kind,'detention');assert.equal(member.game.militaryRecoveryStatus().remainingSeconds,283);
 tick(restored,282.9);assert.equal(member.game.militaryRecoveryStatus().detained,true);tick(restored,.1);assert.equal(member.game.state.locationId,'ledger');assert.equal(member.game.state.interior,null);assert.equal(member.game.militaryRecoveryStatus().canBook,true);
});

test('shared repatriation is a visible NPC vessel with passenger permissions, no fare, and no owned replacement',async()=>{
 const{realm,c}=await fixture();tick(realm,300);c.game.state.credits=0;const rank=structuredClone(c.game.state.professions.careers.military),{captain:observer}=await realm.createCaptain('Witness',{startMode:'hardcore'});ok(realm.attach(observer,{close(){}}));realm._landCharacter(observer,'meridian','ledger');
 ok(realm._command(c,'startMilitaryPassage',{bodyId:'earth',systemId:'sol'}));const vessel=realm.vessels.get(c.aboard);assert.equal(vessel.npcContractId,c.game.state.npcContract.id);assert.equal(vessel.helmOwner,null);assert.equal(c.crewRole,'passenger');assert.deepEqual(vessel.grants[c.id].roles,[]);assert.equal(c.ownedVesselId,null);assert.equal(Boolean(realm._canRole(c,vessel,'helm')),false);assert.equal(Boolean(realm._canRole(c,vessel,'weapons')),false);assert.equal(Boolean(realm._canBoard(observer,vessel)),false);
 const publicVessel=realm._publicVessel(vessel,observer);assert.equal(publicVessel.id,vessel.id);assert.equal(publicVessel.name,'Homeward Passage');assert.equal(c.game.state.npcContract.destination.bodyId,'morrow');tick(realm,6);assert.equal(vessel.dockedAt,null);
 arrive(realm,c);assert.equal(vessel.systemId,'hearth');assert.equal(vessel.dockedAt,'morrow');Object.assign(c.game.state.person,cabinLayout(vessel.ship.classId).spawn);ok(realm._command(c,'disembark',{}));assert.equal(c.aboard,null);assert.equal(c.ownedVesselId,null);assert.equal(c.game.ownsShip,false);assert.equal(c.game.state.locationId,'morrow');assert.equal(c.game.state.credits,0);assert.deepEqual(c.game.state.professions.careers.military,rank);
});

test('restart in transit keeps the passenger aboard the same real transport and clearance',async()=>{
 const{realm,c}=await fixture({enemy:false});ok(realm._command(c,'startMilitaryPassage',{}));tick(realm,8);const vesselId=c.aboard,clock=c.game.state.npcContract.clock;
 const restored=new Realm({id:realm.id,persistence:storage(),snapshot:realm.document()}),member=restored.captains.get(c.id);member.lastSeen=0;ok(restored.attach(member,{close(){}}));assert.equal(member.aboard,vesselId);assert.equal(member.game.state.npcContract.clock,clock);assert.equal(member.crewRole,'passenger');assert.equal(member.ownedVesselId,null);arrive(restored,member);ok(restored._command(member,'completeNpcContract',{}));assert.equal(member.game.state.locationId,'morrow');assert.equal(member.ownedVesselId,null);
});

test('civilian and suspended personnel cannot claim someone else’s repatriation entitlement',async()=>{
 const{realm,c}=await fixture({military:false});assert.equal(realm._command(c,'startMilitaryPassage',{}).ok,false);
 const enlisted=await fixture({enemy:false});enlisted.c.game.state.rep.freewake=-30;assert.equal(enlisted.realm._command(enlisted.c,'startMilitaryPassage',{}).ok,false);assert.equal(enlisted.realm.vessels.size,0);
});
