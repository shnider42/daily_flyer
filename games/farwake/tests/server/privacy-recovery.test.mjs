import test from 'node:test';
import assert from 'node:assert/strict';
import {Realm} from '../../server/realm.mjs';
import {createPrivacyExport} from '../../server/privacy.mjs';

const copy=value=>structuredClone(value);
const ok=result=>{assert.equal(result?.ok,true,result?.reason);return result;};
const privateOther='OTHER_CAPTAIN_RECOVERY_PRIVATE';
const privateView='EPHEMERAL_VOYAGE_VIEW_PRIVATE';
const credential='RECOVERY_CREDENTIAL_MUST_BE_OMITTED';

test('live and durable privacy exports retain only the selected captain’s factual recovery history and crew, omitting the computed deck view',async()=>{
 const realm=new Realm({id:'RECPRIV1',seed:'recovery-export',persistence:{kind:'memory',async save(_id,version){return{version:version+1};}}});
 const captains=[];
 for(const name of ['Exporting survivor','Other survivor']){
  const{captain}=await realm.createCaptain(name,{startMode:'casual',casualCrewCount:8});ok(realm.attach(captain,{close(){}}));
  captain.game.state.fleet.owned.push('osprey');captain.game._activateClass('osprey',true);realm._syncCasualCrew(realm.vessels.get(captain.ownedVesselId));captains.push(captain);
 }
 const[c,other]=captains,wounded=c.game.state.crew[0],dead=c.game.state.crew[1];wounded.health=37;wounded.status='injured';
 c.game._damageCrew(dead.id,9999,'Confirmed boarding casualty');realm._syncCasualCrew(realm.vessels.get(c.ownedVesselId));
 for(const captain of captains)realm._destroyVessel(realm.vessels.get(captain.ownedVesselId));
 c.game.state.stats.time+=8;const incidentId=c.game.recoveryReport().id;ok(realm._command(c,'acknowledgeRecoveryReport',{id:incidentId}));
 other.game.state.voyageMemory.incidents[0].cause=privateOther;other.game.state.voyageMemory.recoveredCrews[0].crew[0].name=privateOther;
 const memory=copy(c.game.state.voyageMemory),receipt=copy(c.game.state.medicalRecovery),otherIncidentId=other.game.recoveryReport().id;
 assert.equal(memory.incidents[0].arrival.acknowledged,true);assert.equal(memory.recoveredCrews[0].crew.length,7);assert.equal(memory.recoveredCrews[0].crew.find(member=>member.id===wounded.id).health,37);
 c.game.state.voyageMemory.incidents[0].credentials={password:credential};c.game.state.medicalRecovery.token=credential;
 c.game.state.voyageView={crewWhereabouts:{groups:[{id:privateView,crew:[{name:privateOther}]}]}};
 const durable=realm.document();durable.captains[c.id].game.voyageView=copy(c.game.state.voyageView);
 const before=copy(c.game.state),otherBefore=copy(other.game.state),durableBefore=copy(durable),revision=realm.revision;
 for(const[source,selected,sourceKind]of[[realm,c,'live-authority'],[durable,durable.captains[c.id],'durable-snapshot']]){
  const report=createPrivacyExport(source,selected,{sourceKind});
  assert.deepEqual(report.captain.game.voyageMemory,memory);assert.deepEqual(report.captain.game.medicalRecovery,receipt);
  assert.ok(report.captain.game.memorial.some(member=>member.crewId===dead.id));assert.equal(report.captain.game.voyageView,undefined);
  assert.deepEqual(report.manifest.unrecognizedGameFields,[]);
  const serialized=JSON.stringify(report);for(const excluded of[privateOther,privateView,credential,otherIncidentId])assert.ok(!serialized.includes(excluded),excluded);
 }
 assert.deepEqual(c.game.state,before);assert.deepEqual(other.game.state,otherBefore);assert.deepEqual(durable,durableBefore);assert.equal(realm.revision,revision);
 durable.captains[c.id].game.futureRecoveryField={privateDetail:privateView};
 const future=createPrivacyExport(durable,durable.captains[c.id]);assert.deepEqual(future.manifest.unrecognizedGameFields,['futureRecoveryField']);assert.equal(future.captain.game.futureRecoveryField,undefined);
});
