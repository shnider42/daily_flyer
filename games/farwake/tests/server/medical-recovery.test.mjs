import test from 'node:test';
import assert from 'node:assert/strict';
import {Realm} from '../../server/realm.mjs';
import {FIELD_HOSPITALS} from '../../dist/medical-recovery.mjs';
const persistence={kind:'memory',async save(_id,version){return{version:version+1};}};
async function fixture(){const realm=new Realm({id:'MEDICAL1',seed:'medical-authority',persistence});const{captain}=await realm.createCaptain('Medical test');assert.ok(realm.attach(captain,{close(){}}).ok);return{realm,captain};}
function step(realm,c,count,input={}){for(let i=0;i<count;i++){realm.acceptInput(c,c.inputSeq+1,input);realm.step(.1,realm.tick+1,Date.now());}}
test('shared ground casualty gets its own faction post, one receipt, movement protection and persisted recovery',async()=>{
 const{realm,captain:c}=await fixture();realm._landCharacter(c,'crosswind','crosswind-vey');c.game.state.warzone.side='meridian';c.game.state.person.health=0;c.game.state.person.down=true;
 const key=c.game.state.exploration.key,record=realm.sites[key],shipId=c.ownedVesselId;
 step(realm,c,26);const receipt=structuredClone(c.game.state.medicalRecovery);assert.ok(receipt);assert.equal(receipt.destination.factionId,'meridian');assert.equal(c.aboard,null);assert.equal(c.ownedVesselId,shipId);
 assert.equal(c.game.state.person.x,FIELD_HOSPITALS.meridian.x);assert.equal(realm.sites[key],record);assert.ok(c.events.some(e=>e.type==='medical-recovery'));
 step(realm,c,20,{x:1,y:0,fire:true});assert.equal(c.game.state.person.x,FIELD_HOSPITALS.meridian.x);assert.equal(c.game.state.medicalRecovery.id,receipt.id);
 const snapshot=realm.snapshotFor(c,{drainEvents:false});assert.equal(snapshot.state.medicalRecovery.id,receipt.id);assert.equal(snapshot.state.medicalRecovery.destination.factionId,'meridian');
 const saved=realm.document(),loaded=new Realm({id:realm.id,persistence,snapshot:saved}),patient=loaded.captains.get(c.id);assert.ok(loaded.attach(patient,{close(){}}).ok);assert.equal(patient.game.state.medicalRecovery.id,receipt.id);assert.equal(patient.game.state.person.x,FIELD_HOSPITALS.meridian.x);assert.equal(patient.game.state.locationId,'crosswind-vey');
 loaded._restoreAtHome(patient);assert.equal(patient.game.state.locationId,'crosswind-vey');assert.equal(patient.game.state.person.x,FIELD_HOSPITALS.meridian.x);assert.ok(!realm.failed&&!loaded.failed);
});
test('shared downed crew leaves an intact hull after the beacon delay, with no ownership loss',async()=>{
 const{realm,captain:c}=await fixture(),vessel=realm.vessels.get(c.ownedVesselId),shipId=vessel.id;
 c.game.state.person.health=0;c.game.state.person.down=true;step(realm,c,26);
 assert.equal(c.aboard,null);assert.equal(c.ownedVesselId,shipId);assert.equal(c.game.state.medicalRecovery.destination.kind,'hospital');assert.notEqual(vessel.destroyed,true);assert.ok(vessel.ship.hull>0);assert.equal(c.game.state.person.down,false);assert.ok(!realm.failed);
});
