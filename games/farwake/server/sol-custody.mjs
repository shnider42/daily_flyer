/** One impound record per physical hull; personal prisoners never replace ownership. */
import {makeQuarantineRecord,enterQuarantineCell} from '../dist/sol-custody.mjs';
import {findFactionSupercapital} from '../dist/faction-supercapitals.mjs';
import {clone,EMPTY_INPUT,fail,ok} from './protocol.mjs';

export const SolCustodyAuthority={
 _quarantineContext(vessel){
  const aboard=[...this.captains.values()].filter(c=>c.aboard===vessel?.id),commander=aboard.find(c=>c.id===vessel?.helmOwner)||aboard[0];
  return{standing:commander?.game.state.rep?.concord||0,affiliated:commander?.game.state.alliance==='concord'||commander?.game.state.militaryCareer?.factionId==='concord',
   humanRoles:aboard.filter(c=>c.session&&c.game.state.person.health>0&&!c.game.state.person.down).map(c=>c.crewRole),
   captureSafe:!!vessel&&aboard.length>0&&!vessel.npcContractId&&!vessel.pvp&&vessel.boarding?.phase!=='active'&&!vessel.occupation?.contested};
 },
 _captureSolVessel(vessel,actor,details){
  if(vessel.impound||!this._quarantineContext(vessel).captureSafe)return false;
  const captains=[...this.captains.values()].filter(c=>c.aboard===vessel.id),record=makeQuarantineRecord(actor,details);
  vessel.impound={...record,captainIds:captains.map(c=>c.id)};vessel.helmOwner=null;
  vessel.dockedAt=`hangar:${record.captorId}`;Object.assign(vessel.ship,{impoundedBy:record.captorId,dockedAt:vessel.dockedAt,vx:0,vy:0});
  for(const captain of captains){
   captain.aboard=null;captain.portVesselId=null;captain.returnVesselId=null;captain.crewRole='passenger';captain.boardingTeam=null;
   captain.input={...EMPTY_INPUT};captain.appliedInput={...EMPTY_INPUT};captain.surfaceCache=null;
   captain.game.state.systemId=vessel.systemId;enterQuarantineCell(captain.game,record,{reset:true});
   captain.game._log('Taken aboard the quarantine flagship',`${record.captorName} secured ${record.vesselName} in its hangar. Your party is held for inspection. The original hull, cargo, and hired crew remain with that ship; the liaison and supervised service panel can shorten the stay.`, 'discovery');
   captain.game._event('sol-tractor-captured',{systemId:vessel.systemId,targetVesselId:vessel.id,targetCaptainId:captain.id,hostVesselId:record.captorId,text:`Held aboard ${record.captorName}. Approach the liaison or service panel; ${record.vesselName} is secured.`});
   this._bindCaptain(captain);
  }
  this.markDirty();return true;
 },
 _syncQuarantineRecord(vessel){
  for(const id of vessel.impound?.captainIds||[]){const captain=this.captains.get(id);if(captain?.game.state.custody?.vesselId===vessel.id){const {captainIds,...record}=vessel.impound;captain.game.state.custody=clone(record);}}
 },
 _quarantineAction(captain,action){
  const vessel=this.vessels.get(captain.game.state.custody?.vesselId),record=vessel?.impound;
  if(!record||!record.captainIds.includes(captain.id))return fail('This inspection record does not belong to you.','custody');
  // The personal rule has already checked proximity and the current option.
  // Recheck the canonical group record to prevent two clients spending twice.
  if(action==='petition'){
   if(record.petitionUsed)return fail('Your party has already completed liaison review.','custody');
   if(!record.affiliated&&record.standing<20){if(captain.game.state.credits<40)return fail('The processing bond requires 40 cr.','cost');captain.game.state.credits-=40;}
   record.petitionUsed=true;record.remainingSeconds=Math.max(0,record.remainingSeconds-45);
  }else if(action==='service'){
   if(record.serviceUsed)return fail('Your party has already completed the service task.','custody');
   record.serviceUsed=true;record.remainingSeconds=Math.max(0,record.remainingSeconds-45);
  }else if(action==='release'){
   if(record.remainingSeconds>0)return fail('Inspection has not finished.','custody');
   return this._releaseSolVessel(vessel);
  }else return fail('Choose an available inspection action.','custody');
  this._syncQuarantineRecord(vessel);this.markDirty();
  captain.game._log('Quarantine inspection',action==='petition'?'The liaison accepted your party’s review and shortened inspection.':'You cleared the intake under supervision. The deck engineer shortened your party’s inspection.','activity');
  if(record.remainingSeconds<=0)this._releaseSolVessel(vessel);
  return ok({text:'Your party’s inspection was shortened by 45 seconds.'});
 },
 _stepSolCustody(delta){
  for(const vessel of this.vessels.values()){
   const record=vessel.impound;if(!record)continue;
   if(!record.captainIds.some(id=>this.captains.get(id)?.session))continue;
   const captor=findFactionSupercapital(this._room(vessel.systemId).runtime,record.factionId);
   if(captor?.id===record.captorId&&captor.hp<=0){record.remainingSeconds=0;record.emergencyTransfer=true;}
   record.remainingSeconds=Math.max(0,record.remainingSeconds-Math.max(0,Math.min(.1,delta)));
   this._syncQuarantineRecord(vessel);
   if(record.remainingSeconds<=0)this._releaseSolVessel(vessel);
   this.markDirty();
  }
 },
 _releaseSolVessel(vessel){
  const record=vessel.impound;if(!record||record.remainingSeconds>0)return fail('Inspection has not finished.','custody');
  const body=this._room(vessel.systemId).runtime.bodies.find(body=>body.id==='threshold');
  if(!body)return fail('The screened transfer berth is unavailable.','custody');
  vessel.dockedAt=body.id;delete vessel.ship.impoundedBy;Object.assign(vessel.ship,{dockedAt:body.id,x:body.x,y:body.y+body.radius+70,vx:0,vy:0});
  vessel.impound=null;vessel.actor=null;
  const owner=this.captains.get(vessel.ownerId);
  if(owner?.ownedVesselId===vessel.id){owner.game.state.livelihoods||={};owner.game.state.livelihoods.parkedShip={vesselId:vessel.id,systemId:vessel.systemId,bodyId:body.id};}
  for(const id of record.captainIds){
   const captain=this.captains.get(id);if(captain?.game.state.custody?.vesselId!==vessel.id)continue;
   captain.game.state.custody=null;captain.game.state.interior=null;captain.game.state.systemId=vessel.systemId;
   captain.aboard=null;captain.portVesselId=vessel.id;captain.returnVesselId=null;captain.crewRole='passenger';captain.input={...EMPTY_INPUT};captain.appliedInput={...EMPTY_INPUT};captain.surfaceCache=null;
   this._bindCaptain(captain);captain.game._arriveAsPassenger(body,{discovery:false});this._ensurePersonPosition(captain);
   captain.game._event('sol-custody-release',{systemId:vessel.systemId,targetVesselId:vessel.id,targetCaptainId:captain.id,text:record.emergencyTransfer?`Flagship evacuation. The hangar launched ${record.vesselName} and its people to Threshold. Earth landing clearance is unchanged.`:`Inspection complete. ${record.vesselName} and its belongings are at Threshold. Earth landing clearance is unchanged.`});
   captain.game._log('Returned to Threshold',`${record.emergencyTransfer?'The damaged flagship’s emergency transfer ended your detention.':'Your party’s inspection ended.'} ${record.vesselName}, its original cargo and hired crew were returned to Threshold. The quarantine still controls Earth’s descent.`,'discovery');
  }
  this.markDirty();return ok({text:'Your party and its original ship were released at Threshold.'});
 }
};
