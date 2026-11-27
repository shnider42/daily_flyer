import test from 'node:test';
import assert from 'node:assert/strict';
import {Realm} from '../../server/realm.mjs';
import {mergeSnapshot} from '../../dist/network.mjs';
import {solCaptureProfile} from '../../dist/sol-custody.mjs';
import {findFactionSupercapital} from '../../dist/faction-supercapitals.mjs';

const ok=r=>{assert.equal(r?.ok,true,r?.reason);return r;};
const persistence=()=>({kind:'memory',async save(_id,version){return{version:version+1};}});
const session=()=>({close(){},send(){}});
async function fixture(){
 const realm=new Realm({id:'SOLCUSTODY',seed:'quarantine-authority',persistence:persistence()}),{captain}=await realm.createCaptain('Pilot',{startMode:'casual'});ok(realm.attach(captain,session()));
 const vessel=realm.vessels.get(captain.ownedVesselId);captain.game.state.upgrades.fold_3=1;captain.game._updateStats();vessel.ship=captain.game.state.ship;vessel.ship.fuel=vessel.ship.maxFuel;
 vessel.systemId='witness';vessel.dockedAt=null;vessel.helmOwner=captain.id;vessel.actor=null;captain.aboard=vessel.id;captain.crewRole='helm';Object.assign(captain.game.state,{systemId:'witness',mode:'ship',locationId:null,interior:null,pendingEncounter:null});
 realm._room('witness').runtime.enemies=[];realm._bindCaptain(captain);ok(realm._command(captain,'travel',{id:'sol'}));
 const room=realm._room('sol');room.runtime.enemies=room.runtime.enemies.filter(e=>e.solCordon);
 return{realm,captain,vessel,room};
}
function tick(realm,seconds){const time=Date.now();for(let i=0;i<Math.round(seconds*10);i++)realm.step(.1,(realm.tick||0)+1,time+i*100);}
function capture(realm,captain,vessel){for(let i=0;i<500&&!vessel.impound;i++)realm.step(.1,(realm.tick||0)+1,Date.now());assert.equal(captain.game.state.custody?.phase,'detained');assert.ok(vessel.impound);}

test('authority tows one physical hull and detains only its aboard people with original assets intact',async()=>{
 const {realm,captain,vessel}=await fixture(),shipId=vessel.id,cargo=structuredClone(captain.game.state.cargo);capture(realm,captain,vessel);
 assert.equal(captain.ownedVesselId,shipId);assert.equal(captain.aboard,null);assert.equal(captain.game.state.interior.kind,'brig');assert.notEqual(vessel.destroyed,true);assert.equal(vessel.ship.impoundedBy,'sol:supercapital:concord');assert.deepEqual(captain.game.state.cargo,cargo);
 assert.equal(vessel.impound.captainIds.length,1);assert.equal(captain.game.state.stats.rescues,0);assert.equal(captain.game.state.shipRecovery,undefined);
 for(const name of ['launch','travel','boardShip','quickHelm','leaveInterior','takePassengerTransit','setHome','useWeapon'])assert.equal(realm._command(captain,name,{vesselId:shipId,id:'witness'}).ok,false,name);
 assert.equal(realm._command(captain,'custodyAction',{action:'service',remainingSeconds:0}).ok,false);
});

test('a guest is captured without moving an absent owner or changing the guest’s parked personal hull',async()=>{
 const {realm,captain:owner,vessel,room}=await fixture();owner.game._activateClass('hauler',true);vessel.ship=owner.game.state.ship;vessel.actor=null;
 const {captain:guest}=await realm.createCaptain('Guest',{startMode:'casual'});ok(realm.attach(guest,session()));const guestOwned=realm.vessels.get(guest.ownedVesselId),guestShip=structuredClone(guestOwned.ship),guestSystem=guestOwned.systemId;
 vessel.grants[guest.id]={allowed:true,roles:['helm']};realm._cabin(guest,vessel);realm._landCharacter(owner,'witness','stillwater');vessel.helmOwner=guest.id;guest.crewRole='helm';guest.game.state.mode='ship';guest.game.state.interior=null;guest.game.state.locationId=null;
 owner.game.state.rep.concord=100;owner.game.state.alliance='concord';guest.game.state.rep.concord=-40;
 const profile=solCaptureProfile(realm._actor(vessel));assert.equal(profile.standing,-40);assert.equal(profile.affiliated,false);
 const ownerPosition={systemId:owner.game.state.systemId,locationId:owner.game.state.locationId,person:structuredClone(owner.game.state.person)};
 capture(realm,guest,vessel);assert.deepEqual(vessel.impound.captainIds,[guest.id]);assert.equal(owner.game.state.custody,null);assert.equal(owner.game.state.systemId,ownerPosition.systemId);assert.equal(owner.game.state.locationId,ownerPosition.locationId);
 assert.deepEqual(guestOwned.ship,guestShip);assert.equal(guestOwned.systemId,guestSystem);assert.equal(guest.ownedVesselId,guestOwned.id);
 assert.equal(realm._canBoard(owner,vessel),false);assert.equal(realm._command(owner,'boardShip',{vesselId:vessel.id}).ok,false);
 vessel.impound.remainingSeconds=0;ok(realm._releaseSolVessel(vessel));assert.equal(guest.game.state.locationId,'threshold');assert.equal(owner.game.state.systemId,ownerPosition.systemId);assert.equal(owner.game.state.locationId,ownerPosition.locationId);assert.deepEqual(guestOwned.ship,guestShip);assert.equal(vessel.dockedAt,'threshold');assert.equal(owner.game.state.livelihoods.parkedShip.vesselId,vessel.id);
});

test('crew share one inspection clock and once-only reductions; an unrelated peer cannot spend or shorten it',async()=>{
 const {realm,captain,vessel}=await fixture();captain.game._activateClass('hauler',true);vessel.ship=captain.game.state.ship;vessel.actor=null;
 const {captain:guest}=await realm.createCaptain('Crew',{startMode:'hardcore'});ok(realm.attach(guest,session()));vessel.grants[guest.id]={allowed:true,roles:['engineering']};realm._cabin(guest,vessel);
 capture(realm,captain,vessel);assert.equal(guest.game.state.custody.vesselId,vessel.id);const initial=vessel.impound.remainingSeconds;tick(realm,1);assert.ok(Math.abs(vessel.impound.remainingSeconds-(initial-1))<.001);assert.equal(captain.game.state.custody.remainingSeconds,guest.game.state.custody.remainingSeconds);
 for(const c of [captain,guest])Object.assign(c.game.state.person,{x:252,y:348});ok(realm._command(guest,'custodyAction',{action:'service'}));const shortened=vessel.impound.remainingSeconds;assert.equal(realm._command(captain,'custodyAction',{action:'service'}).ok,false);assert.equal(vessel.impound.remainingSeconds,shortened);
 const {captain:outsider}=await realm.createCaptain('Outsider',{startMode:'casual'});ok(realm.attach(outsider,session()));assert.equal(realm._command(outsider,'custodyAction',{action:'release',vesselId:vessel.id}).ok,false);assert.equal(realm._command(outsider,'custodyAction',{action:'petition',vesselId:vessel.id}).ok,false);
 vessel.impound.remainingSeconds=.05;tick(realm,.1);assert.equal(vessel.impound,null);assert.equal(captain.game.state.locationId,'threshold');assert.equal(guest.game.state.locationId,'threshold');assert.equal(vessel.id,captain.ownedVesselId);assert.equal(guest.ownedVesselId,null);
});

test('reconnect, durable reload and compact snapshots retain the actual brig and remaining inspection',async()=>{
 let {realm,captain,vessel}=await fixture();capture(realm,captain,vessel);tick(realm,3);const remaining=vessel.impound.remainingSeconds,captainId=captain.id,vesselId=vessel.id;
 const full=realm.snapshotFor(captain,{drainEvents:false});tick(realm,.5);const compact=realm.snapshotFor(captain,{compact:true,drainEvents:false}),merged=mergeSnapshot(full,compact);assert.equal(merged.state.custody.remainingSeconds,captain.game.state.custody.remainingSeconds);assert.equal(merged.state.interior.kind,'brig');
 realm=new Realm({id:realm.id,seed:realm.seed,persistence:persistence(),snapshot:realm.document()});captain=realm.captains.get(captainId);vessel=realm.vessels.get(vesselId);captain.lastSeen=0;ok(realm.attach(captain,session()));assert.equal(captain.game.state.interior.kind,'brig');assert.equal(captain.aboard,null);assert.ok(vessel.impound.remainingSeconds<remaining);assert.equal(captain.game.state.custody.remainingSeconds,vessel.impound.remainingSeconds);
 tick(realm,vessel.impound.remainingSeconds+.2);assert.equal(captain.game.state.locationId,'threshold');assert.equal(captain.game.state.custody,null);assert.equal(vessel.dockedAt,'threshold');assert.equal(vessel.id,captain.ownedVesselId);assert.equal(captain.game.hasFlag('landed_earth'),false);
});

test('only the permitted live helmsman can counterpulse and hull-clearance is never minted by capture',async()=>{
 const {realm,captain,vessel}=await fixture();tick(realm,8.2);assert.equal(realm._withShip(captain,vessel,()=>captain.game.custodyStatus().phase),'locking');
 const energy=vessel.ship.energy;ok(realm._command(captain,'custodyAction',{action:'break-lock',resistance:99999}));assert.equal(vessel.ship.energy,energy-60);assert.equal(realm._room('sol').runtime.solCordon.visits[vessel.id].counterUsed,true);assert.notEqual(vessel.solClearance?.entry,true);
 const {captain:guest}=await realm.createCaptain('Spoofer',{startMode:'hardcore'});ok(realm.attach(guest,session()));assert.equal(realm._command(guest,'custodyAction',{action:'comply',vesselId:vessel.id}).ok,false);
});

test('supercapital armor damage and destruction persist through an authoritative world restart',async()=>{
 const {realm,captain,vessel,room}=await fixture(),capital=findFactionSupercapital(room.runtime,'concord'),actor=realm._actor(vessel);capital.shield=0;const hp=capital.hp;
 room.runtime.bullets.push({id:'capital-hit',x:capital.x,y:capital.y,vx:0,vy:0,ttl:1,radius:4,damage:100,owner:'player',ownerId:captain.id,vesselId:vessel.id,team:'player'});room.coordinator._worldGames=[actor];room.coordinator._updateBullets(.1,[actor]);assert.equal(capital.hp,hp-100);assert.ok(capital.supercapitalState.hostileVesselIds.includes(vessel.id));
 const restored=new Realm({id:realm.id,snapshot:realm.document(),persistence:persistence()});assert.equal(findFactionSupercapital(restored._room('sol').runtime,'concord').hp,hp-100);
});

test('destruction of the real holding ship evacuates its detained party with the original hull',async()=>{
 const {realm,captain,vessel,room}=await fixture();capture(realm,captain,vessel);const hull=vessel.ship.hull;findFactionSupercapital(room.runtime,'concord').hp=0;tick(realm,.1);
 assert.equal(captain.game.state.custody,null);assert.equal(captain.game.state.locationId,'threshold');assert.equal(vessel.impound,null);assert.equal(vessel.ship.hull,hull);assert.equal(vessel.dockedAt,'threshold');assert.equal(captain.ownedVesselId,vessel.id);
});
