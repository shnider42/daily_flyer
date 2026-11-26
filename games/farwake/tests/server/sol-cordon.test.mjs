import test from 'node:test';
import assert from 'node:assert/strict';
import {Realm} from '../../server/realm.mjs';
import {cabinLayout} from '../../dist/fleet.mjs';

const ok=result=>{assert.equal(result?.ok,true,result?.reason);return result;};
const persistence=()=>({kind:'memory',async save(_id,version){return {version:version+1};}});
const quiet=(realm,id)=>{const room=realm._room(id);room.runtime.enemies=[];room.runtime.bullets=[];return room;};
const helm=(realm,c)=>{Object.assign(c.game.state.person,cabinLayout(realm.vessels.get(c.aboard).ship.classId).stations.helm);return realm._command(c,'takeStation',{role:'helm'});};

test('a real expedition carries a guest through Sol, keeps evidence private, and retains its hull clearance after helm transfer and reload',async()=>{
 const realm=new Realm({id:'SOLCREW',seed:'sol-shared-clearance',persistence:persistence()}),{captain:owner}=await realm.createCaptain('Owner',{startMode:'casual'}),{captain:guest}=await realm.createCaptain('Guest',{startMode:'hardcore'});
 for(const captain of [owner,guest])ok(realm.attach(captain,{close(){}}));
 const vessel=realm.vessels.get(owner.ownedVesselId);owner.game.state.fleet.owned.push('hauler');owner.game._activateClass('hauler',true);vessel.ship=owner.game.state.ship;vessel.actor=null;
 const port=quiet(realm,'hearth').runtime.bodies.find(body=>body.id==='kettle');Object.assign(vessel.ship,{x:port.x,y:port.y+port.radius+40});
 ok(realm._command(owner,'dock',{id:port.id}));realm._landCharacter(guest,'hearth',port.id);
 ok(realm._command(owner,'setCrewAccess',{captainId:guest.id,allowed:true,roles:['helm']}));ok(realm._command(guest,'boardShip',{vesselId:vessel.id}));ok(realm._command(owner,'boardShip',{vesselId:vessel.id}));ok(helm(realm,owner));
 owner.game.state.upgrades.fold_3=1;owner.game._updateStats();vessel.ship=owner.game.state.ship;vessel.ship.fuel=vessel.ship.maxFuel;
 vessel.systemId='witness';quiet(realm,'witness');for(const captain of [owner,guest]){realm._bindCaptain(captain);captain.game.state.pendingEncounter=null;}
 const fuel=vessel.ship.fuel;assert.equal(realm._command(owner,'travel',{id:'sol',clearance:true}).code,'quarantine');assert.equal(vessel.ship.fuel,fuel);
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
 assert.equal(realm._command(guest,'takePassengerTransit',{bodyId:'earth'}).code,'quarantine');
 assert.equal(guest.game.state.credits,credits);assert.equal(guest.game.state.locationId,'threshold');
 assert.deepEqual(realm.snapshotFor(guest,{drainEvents:false}).state.multiplayer.solClearance,{entry:false,landing:false});
 const restored=new Realm({id:realm.id,snapshot:realm.document(),persistence:persistence()}),returning=restored.captains.get(guest.id);
 assert.deepEqual(restored._solClearanceFor(returning),{entry:false,landing:false});assert.equal(returning.game.passengerQuote('earth').code,'quarantine');
 for(const flag of ['vault_recovered','homeward_signal','threshold_answered'])assert.equal(returning.game.hasFlag(flag),false,'Physical expedition access never creates personal investigation evidence.');
});
