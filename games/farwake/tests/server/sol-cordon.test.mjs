import test from 'node:test';
import assert from 'node:assert/strict';
import {Realm} from '../../server/realm.mjs';
import {cabinLayout} from '../../dist/fleet.mjs';
import {solClearance} from '../../dist/sol-access.mjs';
import {mergeSnapshot} from '../../dist/network.mjs';

const ok=result=>{assert.equal(result?.ok,true,result?.reason);return result;};
const persistence=()=>({kind:'memory',async save(_id,version){return {version:version+1};}});
const quiet=(realm,id)=>{const room=realm._room(id);room.runtime.enemies=room.runtime.enemies.filter(enemy=>enemy.solCordon);room.runtime.bullets=[];return room;};
const helm=(realm,c)=>{Object.assign(c.game.state.person,cabinLayout(realm.vessels.get(c.aboard).ship.classId).stations.helm);return realm._command(c,'takeStation',{role:'helm'});};
async function pilotFixture({realm=null,name='Pilot',cleared=false}={}){
 realm ||= new Realm({id:'SOLATTEMPT',seed:'sol-shared-attempt',persistence:persistence()});
 const {captain}=await realm.createCaptain(name,{startMode:'casual'});ok(realm.attach(captain,{close(){},send(){}}));
 const vessel=realm.vessels.get(captain.ownedVesselId);
 captain.game.state.upgrades.fold_3=1;captain.game._updateStats();vessel.ship=captain.game.state.ship;vessel.ship.fuel=vessel.ship.maxFuel;
 vessel.systemId='witness';vessel.dockedAt=null;vessel.helmOwner=captain.id;vessel.actor=null;
 captain.aboard=vessel.id;captain.crewRole='helm';Object.assign(captain.game.state,{systemId:'witness',mode:'ship',locationId:null,interior:null,pendingEncounter:null});
 quiet(realm,'witness');realm._bindCaptain(captain);
 if(cleared)for(const flag of ['vault_recovered','homeward_signal','threshold_answered'])captain.game._flag(flag);
 return {realm,captain,vessel};
}
async function intruderFixture(){
 const fixture=await pilotFixture();ok(fixture.realm._command(fixture.captain,'travel',{id:'sol',clearance:true}));
 return {...fixture,room:fixture.realm._room('sol')};
}
function cordonAttack(realm,vessel,room){
 const guard=room.runtime.enemies.find(enemy=>enemy.solCordon);assert.ok(guard,'The cordon has a physical interceptor.');
 Object.assign(guard,{active:true,targetVesselId:vessel.id,targetId:vessel.helmOwner,x:vessel.ship.x+150,y:vessel.ship.y});
 const actor=realm._actor(vessel);actor._damageShip(1,{sourceId:guard.id,solCordon:true});
 assert.equal(realm._inCombat(vessel),true);return {guard,actor};
}

test('a real expedition carries a guest through Sol, keeps evidence private, and retains its hull clearance after helm transfer and reload',async()=>{
 const realm=new Realm({id:'SOLCREW',seed:'sol-shared-clearance',persistence:persistence()}),{captain:owner}=await realm.createCaptain('Owner',{startMode:'casual'}),{captain:guest}=await realm.createCaptain('Guest',{startMode:'hardcore'});
 for(const captain of [owner,guest])ok(realm.attach(captain,{close(){}}));
 const vessel=realm.vessels.get(owner.ownedVesselId);owner.game.state.fleet.owned.push('hauler');owner.game._activateClass('hauler',true);vessel.ship=owner.game.state.ship;vessel.actor=null;
 const port=quiet(realm,'hearth').runtime.bodies.find(body=>body.id==='kettle');Object.assign(vessel.ship,{x:port.x,y:port.y+port.radius+40});
 ok(realm._command(owner,'dock',{id:port.id}));realm._landCharacter(guest,'hearth',port.id);
 ok(realm._command(owner,'setCrewAccess',{captainId:guest.id,allowed:true,roles:['helm']}));ok(realm._command(guest,'boardShip',{vesselId:vessel.id}));ok(realm._command(owner,'boardShip',{vesselId:vessel.id}));ok(helm(realm,owner));
 owner.game.state.upgrades.fold_3=1;owner.game._updateStats();vessel.ship=owner.game.state.ship;vessel.ship.fuel=vessel.ship.maxFuel;
 vessel.systemId='witness';quiet(realm,'witness');for(const captain of [owner,guest]){realm._bindCaptain(captain);captain.game.state.pendingEncounter=null;}
 assert.equal(owner.game.travelInfo('sol').ok,true,'Uncleared captains may physically attempt the route.');
 owner.game._flag('vault_recovered');owner.game._flag('homeward_signal');ok(realm._command(owner,'travel',{id:'sol'}));
 assert.equal(guest.game.state.systemId,'sol');assert.equal(guest.game.hasFlag('vault_recovered'),false);assert.equal(guest.game.hasFlag('homeward_signal'),false);
 assert.equal(realm.snapshotFor(guest).state.multiplayer.solClearance.entry,true);assert.equal(vessel.solClearance.landing,false);
 owner.game.state.pendingEncounter=null;owner.game._flag('threshold_answered');
 const earth=quiet(realm,'sol').runtime.bodies.find(body=>body.id==='earth');Object.assign(vessel.ship,{x:earth.x,y:earth.y+earth.radius+40});
 ok(realm._command(owner,'takeStation',{role:'passenger'}));ok(helm(realm,guest));ok(realm._command(guest,'dock',{id:'earth'}));
 assert.equal(vessel.solClearance.landing,true);assert.equal(guest.game.hasFlag('threshold_answered'),false);
 const snapshot=realm.document(),restored=new Realm({id:realm.id,seed:realm.seed,persistence:persistence(),snapshot});
 const savedVessel=restored.vessels.get(vessel.id);assert.deepEqual(savedVessel.solClearance,{entry:true,landing:true});
 assert.equal(restored.captains.get(guest.id).game.hasFlag('vault_recovered'),false);
});

test('an unauthorized shared jump consumes the normal fuel, creates one physical visit, and never creates clearance or private evidence',async()=>{
 const {realm,captain,vessel}=await pilotFixture(),fuel=vessel.ship.fuel,lore=[...captain.game.state.knownLore];
 const result=ok(realm._command(captain,'travel',{id:'sol',clearance:true})),room=realm._room('sol');
 assert.equal(vessel.systemId,'sol');assert.equal(captain.game.state.systemId,'sol');assert.equal(vessel.ship.fuel,fuel-result.fuelCost);
 assert.equal(vessel.solClearance?.entry===true,false);assert.deepEqual(realm._solClearanceFor(captain),{entry:false,landing:false});
 assert.equal(room.runtime.solCordon.visits[vessel.id].originSystemId,'witness');assert.equal(Object.keys(room.runtime.solCordon.visits).length,1);
 assert.deepEqual(captain.game.state.knownLore,lore);
 for(const flag of ['vault_recovered','homeward_signal','threshold_answered','landed_earth','thread:earth_truth_verified'])assert.equal(captain.game.hasFlag(flag),false);
 assert.equal(captain.game.availableEncounters().some(encounter=>encounter.id==='earth_arrival'),false);
});

test('an attempted Earth approach keeps pilot and guest aboard without fabricating landing or hull permission',async()=>{
 const {realm,captain,vessel}=await pilotFixture();captain.game.state.fleet.owned.push('hauler');captain.game._activateClass('hauler',true);vessel.ship=captain.game.state.ship;vessel.actor=null;vessel.ship.fuel=vessel.ship.maxFuel;
 const {captain:guest}=await realm.createCaptain('Approach guest',{startMode:'hardcore'});ok(realm.attach(guest,{close(){},send(){}}));
 vessel.grants[guest.id]={allowed:true,roles:['helm']};realm._cabin(guest,vessel);
 ok(realm._command(captain,'travel',{id:'sol'}));
 const earth=realm._room('sol').runtime.bodies.find(body=>body.id==='earth');Object.assign(vessel.ship,{x:earth.x,y:earth.y+earth.radius+40});
 const result=ok(realm._command(captain,'dock',{id:'earth'}));assert.equal(result.approach,true);
 assert.equal(vessel.dockedAt,null);assert.equal(vessel.helmOwner,captain.id);assert.equal(captain.game.state.mode,'ship');assert.equal(guest.aboard,vessel.id);assert.equal(guest.game.state.interior?.kind,'ship');
 assert.equal(guest.game.state.locationId===earth.id,false);assert.equal(captain.game.hasFlag('landed_earth'),false);assert.equal(guest.game.hasFlag('landed_earth'),false);
 assert.equal(vessel.solClearance?.landing===true,false);assert.equal(realm._room('sol').runtime.solCordon.visits[vessel.id].approach,true);
});

test('the physical actor uses an onboard researcher but cannot borrow an absent owner’s investigation',async()=>{
 const {realm,captain:owner,vessel}=await pilotFixture({cleared:true});
 owner.game.state.fleet.owned.push('hauler');owner.game._activateClass('hauler',true);vessel.ship=owner.game.state.ship;vessel.actor=null;
 const {captain:guest}=await realm.createCaptain('Guest pilot',{startMode:'hardcore'});ok(realm.attach(guest,{close(){},send(){}}));vessel.grants[guest.id]={allowed:true,roles:['helm']};realm._cabin(guest,vessel);
 assert.deepEqual(solClearance(realm._actor(vessel)),{entry:true,landing:true});
 ok(realm._command(owner,'takeStation',{role:'passenger'}));realm._landCharacter(owner,'witness','stillwater');ok(helm(realm,guest));
 assert.equal(owner.game.hasFlag('vault_recovered'),true);assert.equal(owner.aboard,null);
 assert.deepEqual(solClearance(realm._actor(vessel)),{entry:false,landing:false});
 vessel.solClearance={entry:true,landing:true};assert.deepEqual(solClearance(realm._actor(vessel)),{entry:true,landing:true},'An actually issued hull permit survives a crew change.');
});

test('physically defeating the orbital screen permits a landing without issuing clearance or investigation evidence',async()=>{
 const {realm,captain,vessel,room}=await intruderFixture(),earth=room.runtime.bodies.find(body=>body.id==='earth');
 const batteries=room.runtime.enemies.filter(enemy=>enemy.solCordon&&enemy.cordonRole==='battery');assert.equal(batteries.length,6);
 for(const battery of batteries){battery.hp=0;room.coordinator._defeat(battery,captain.game);}room.runtime.enemies=room.runtime.enemies.filter(enemy=>enemy.hp>0);
 Object.assign(vessel.ship,{x:earth.x,y:earth.y+earth.radius+40});const result=ok(realm._command(captain,'dock',{id:'earth'}));
 assert.equal(result.approach,undefined);assert.equal(vessel.dockedAt,'earth');assert.equal(captain.game.state.mode,'person');assert.equal(captain.game.hasFlag('landed_earth'),true);
 assert.equal(vessel.solClearance?.entry===true,false);assert.deepEqual(realm.snapshotFor(captain,{drainEvents:false}).state.multiplayer.solClearance,{entry:false,landing:false});
 for(const flag of ['vault_recovered','homeward_signal','threshold_answered','thread:earth_truth_verified'])assert.equal(captain.game.hasFlag(flag),false);
});

test('a destroyed early visitor recovers at a screened Sol refuge without Earth evidence, a new hull, or a stranded captain',async()=>{
 const {realm,captain,vessel}=await intruderFixture();realm._destroyVessel(vessel,{sourceId:'sol:cordon:battery:2',cause:'Sol quarantine fire'});
 assert.equal(vessel.destroyed,true);assert.equal(captain.game.state.mode,'person');assert.notEqual(captain.game.state.locationId,'earth');assert.equal(captain.ownedVesselId,null);
 assert.ok(captain.game.system.bodies.some(body=>body.id===captain.game.state.locationId),'Recovery reaches a real accessible local refuge.');
 assert.equal(captain.game.state.medicalRecovery.destination.bodyId,captain.game.state.locationId);
 for(const flag of ['vault_recovered','homeward_signal','threshold_answered','landed_earth'])assert.equal(captain.game.hasFlag(flag),false);
 const restored=new Realm({id:realm.id,snapshot:realm.document(),persistence:persistence()}),resumed=restored.captains.get(captain.id);ok(restored.attach(resumed,{close(){},send(){}}));
 assert.equal(resumed.game.state.locationId,captain.game.state.locationId);assert.equal(resumed.ownedVesselId,null);assert.equal(resumed.game.ownsShip,false);
});

test('only the recorded outward retreat can ignore the cordon fight, with normal fuel and range still enforced',async()=>{
 const {realm,captain,vessel,room}=await intruderFixture();cordonAttack(realm,vessel,room);
 assert.equal(realm._command(captain,'travel',{id:'hearth'}).code,'combat','A different destination does not get the escape exception.');
 const fuel=vessel.ship.fuel;vessel.ship.fuel=0;assert.equal(realm._command(captain,'travel',{id:'witness'}).code,'fuel');vessel.ship.fuel=fuel;
 const range=vessel.ship.warpRange;vessel.ship.warpRange=.1;assert.equal(realm._command(captain,'travel',{id:'witness'}).code,'range');vessel.ship.warpRange=range;
 ok(realm._command(captain,'travel',{id:'witness'}));assert.equal(vessel.systemId,'witness');assert.equal(vessel.solClearance?.entry===true,false);
});

for(const independent of ['pvp','boarding','nearby hostile','recent independent hit'])test(`the Sol retreat does not bypass ${independent}`,async()=>{
 const {realm,captain,vessel,room}=await intruderFixture(),{actor,guard}=cordonAttack(realm,vessel,room);
 if(independent==='pvp')vessel.pvp={phase:'active'};
 else if(independent==='boarding')vessel.boarding={phase:'active'};
 else if(independent==='nearby hostile')room.runtime.enemies.push({id:'independent-raider',hp:100,active:true,x:vessel.ship.x+60,y:vessel.ship.y});
 else{actor._damageShip(1,{sourceId:'independent-raider'});actor._damageShip(1,{sourceId:guard.id,solCordon:true});assert.ok(vessel.solIndependentHitRemaining>0);}
 const fuel=vessel.ship.fuel;assert.equal(realm._command(captain,'travel',{id:'witness'}).code,'combat');assert.equal(vessel.systemId,'sol');assert.equal(vessel.ship.fuel,fuel);
});

test('shared cordon time, targeting and warning snapshots use one hull and preserve state across restart',async()=>{
 const {realm,captain:intruder,vessel,room}=await intruderFixture();
 const {captain:cleared,vessel:relief}=await pilotFixture({realm,name:'Relief',cleared:true});ok(realm._command(cleared,'travel',{id:'sol'}));cleared.game.state.pendingEncounter=null;
 Object.assign(relief.ship,{x:vessel.ship.x+60,y:vessel.ship.y});
 vessel.ship.shield=10000;vessel.ship.maxShield=10000;const visit=room.runtime.solCordon.visits[vessel.id];visit.elapsed=30;visit.approach=true;
 const before=visit.elapsed;realm.step(.1,realm.tick+1,Date.now());assert.ok(Math.abs(visit.elapsed-before-.1)<1e-8,'Two captains advance one physical visit once.');
 const guards=room.runtime.enemies.filter(enemy=>enemy.solCordon),engaged=guards.filter(enemy=>enemy.active);assert.ok(engaged.length>0);
 for(const guard of engaged)assert.equal(guard.targetVesselId,vessel.id,'The cleared relief ship is not a cordon target.');
 const full=realm.snapshotFor(intruder,{drainEvents:false}),compact=realm.snapshotFor(intruder,{compact:true,drainEvents:false}),merged=mergeSnapshot(full,compact);
 for(const packet of [full,compact,merged]){
  assert.deepEqual(packet.world.solCordon.visits[vessel.id],visit);assert.equal(packet.world.solCordon.visits[relief.id],undefined);
  const guard=engaged[0],shown=packet.world.enemies.find(enemy=>enemy.id===guard.id);assert.deepEqual(shown.cordonState,guard.cordonState);assert.equal(shown.targetVesselId,vessel.id);
 }
 assert.equal(full.state.worlds.sol.solCordon,undefined,'The full private state does not leak another hull’s route through a duplicate world record.');
 const guard=engaged[0];guard.hp-=9;const state=structuredClone(guard.cordonState),position={x:guard.x,y:guard.y},hp=guard.hp,visitBefore=structuredClone(visit),document=realm.document();
 const restored=new Realm({id:realm.id,snapshot:document,persistence:persistence()}),saved=restored._room('sol'),resumed=restored.captains.get(intruder.id),live=saved.runtime.enemies.find(enemy=>enemy.id===guard.id);
 assert.deepEqual(saved.runtime.solCordon.visits[vessel.id],visitBefore);assert.deepEqual(live.cordonState,state);assert.equal(live.hp,hp);assert.deepEqual({x:live.x,y:live.y},position);assert.equal(saved.runtime.enemies.filter(enemy=>enemy.id===guard.id).length,1);
 assert.deepEqual(restored._solClearanceFor(resumed),{entry:false,landing:false});assert.deepEqual(solClearance(restored._actor(restored.vessels.get(vessel.id))),{entry:false,landing:false});
});

for(const condition of ['departed','destroyed'])test(`an ashore guest cannot borrow Earth permission from a ${condition} remembered carrier`,async()=>{
 const realm=new Realm({id:'SOLBERTH',seed:`sol-stale-${condition}`,persistence:persistence()}),{captain:owner}=await realm.createCaptain('Owner',{startMode:'casual'}),{captain:guest}=await realm.createCaptain('Guest',{startMode:'hardcore'});
 for(const captain of [owner,guest])ok(realm.attach(captain,{close(){}}));
 const vessel=realm.vessels.get(owner.ownedVesselId);vessel.systemId='sol';vessel.dockedAt='threshold';vessel.solClearance={entry:true,landing:true};vessel.grants[guest.id]={allowed:true,roles:[]};
 quiet(realm,'sol');realm._cabin(guest,vessel);realm._landCharacter(guest,'sol','threshold');guest.game.state.credits=1000;
 assert.equal(guest.portVesselId,vessel.id);assert.equal(guest.aboard,null);assert.equal(guest.game.passengerQuote('earth').ok,true,'The live carrier at the actual berth supplies legitimate expedition clearance.');
 if(condition==='destroyed')realm._destroyVessel(vessel);
 else{realm._cabin(owner,vessel);ok(realm._command(owner,'launch',{leaveCrewBehind:true}));assert.equal(vessel.dockedAt,null);}
 assert.equal(guest.portVesselId,vessel.id,'The remembered return reference can remain without granting a permit.');
 const credits=guest.game.state.credits;
 assert.deepEqual(realm._solClearanceFor(guest),{entry:false,landing:false});
 assert.equal(realm._command(guest,'takePassengerTransit',{bodyId:'earth'}).ok,false);
 assert.equal(guest.game.state.credits,credits);assert.equal(guest.game.state.locationId,'threshold');
 assert.deepEqual(realm.snapshotFor(guest,{drainEvents:false}).state.multiplayer.solClearance,{entry:false,landing:false});
 const restored=new Realm({id:realm.id,snapshot:realm.document(),persistence:persistence()}),returning=restored.captains.get(guest.id);
 assert.deepEqual(restored._solClearanceFor(returning),{entry:false,landing:false});assert.equal(returning.game.passengerQuote('earth').ok,false);
 for(const flag of ['vault_recovered','homeward_signal','threshold_answered'])assert.equal(returning.game.hasFlag(flag),false,'Physical expedition access never creates personal investigation evidence.');
});
