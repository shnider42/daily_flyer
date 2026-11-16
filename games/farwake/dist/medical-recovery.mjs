/** Medical evacuation shared by solo rules and the galaxy authority. */
import {generateSurface,isWalkable} from './surface.mjs';

const sides=['freewake','meridian'];
const clone=value=>JSON.parse(JSON.stringify(value));
const finite=value=>Number.isFinite(value)?value:0;
export const MEDICAL_WAKE_SECONDS=6.4;
export const FIELD_HOSPITALS=Object.freeze({
 freewake:{name:'Union field hospital',x:33.5*24,y:59.5*24},
 meridian:{name:'Combine field hospital',x:65.5*24,y:59.5*24}
});
export function medicalFaction(game,random=()=>game._rand()){
 const enlisted=game.state.professions?.careers?.military;
 const affiliated=enlisted?.enlisted?enlisted.factionId:game.state.warzone?.side;
 if(sides.includes(affiliated))return affiliated;
 const a=finite(game.state.rep?.freewake),b=finite(game.state.rep?.meridian);
 if(a!==b)return a>b?'freewake':'meridian';
 return random()<.5?'freewake':'meridian';
}
const medicalBody=body=>body.landable!==false&&body.portServices!==false&&['station','planet','moon'].includes(body.kind)&&!(body.kind==='moon'&&/barren|rock|dust/.test(body.biome||''));
/** Distances are measured in space; a casualty already on a body uses its own clinic first. */
export function medicalDestination(game,{system=game.system,position=game.state.ship,bodyId=null}={}){
 const front=system.bodies.find(body=>body.id==='crosswind-vey');
 if(front&&(system.warzone||game.galaxy.find(s=>s.id===system.id)?.warzoneId)){
  const factionId=medicalFaction(game),post=FIELD_HOSPITALS[factionId];
  return{systemId:system.id,bodyId:front.id,name:post.name,bodyName:front.name,kind:'field-hospital',factionId};
 }
 const candidates=system.bodies.filter(body=>medicalBody(body)&&(!game.portAccess||game.portAccess(body,game.galaxy.find(s=>s.id===system.id)).ok)).sort((a,b)=>
  (a.id===bodyId?-1:b.id===bodyId?1:Math.hypot(a.x-finite(position.x),a.y-finite(position.y))-Math.hypot(b.x-finite(position.x),b.y-finite(position.y)))||a.id.localeCompare(b.id));
 for(const body of candidates){
  const surface=generateSurface(body,game.state.seed,game.state.flags);
  if(surface.entities.some(e=>e.type==='medic'))return{systemId:system.id,bodyId:body.id,name:`${body.name} · hospital`,bodyName:body.name,kind:'hospital',factionId:null};
 }
 return null;
}
export function medicalSpawn(surface,destination){
 const post=FIELD_HOSPITALS[destination.factionId],medic=surface.entities.find(e=>e.type==='medic');
 const anchor=destination.kind==='field-hospital'&&post?post:medic;
 if(!anchor)return surface.spawn;
 // Beside a bed/medic, never inside solid furniture or on the landing pad.
 const points=destination.kind==='field-hospital'?[anchor]:[{x:anchor.x-24,y:anchor.y},{x:anchor.x,y:anchor.y+24},{x:anchor.x+24,y:anchor.y},anchor];
 return points.find(point=>isWalkable(surface,point.x,point.y))||surface.spawn;
}
export const MedicalRecoveryRules={
 atFieldHospital(){
  const s=this.state;if(s.mode!=='person'||s.interior||s.locationId!=='crosswind-vey')return false;
  return !!this._expeditionSurface()?.entities.some(e=>e.type==='medic'&&e.data?.factionId&&Math.hypot(e.x-s.person.x,e.y-s.person.y)<=46);
 },
 medicalRecoveryActive(){return finite(this.state.medicalRecovery?.wakeUntil)>finite(this.state.stats.time);},
 finishMedicalRecovery(destination,{sourceKind='casualty',cost=0}={}){
  const s=this.state,body=this.system.bodies.find(b=>b.id===destination.bodyId);
  if(!body)return this._fail('The medical destination is unavailable.','location');
  // Landing has already been authorized by solo rules or _landCharacter on the server.
  const custody=s.interior?.kind==='detention';
  if(!custody)this.activateWarzoneSurface();
  const surface=custody?generateSurface(s.interior.location,s.seed,s.flags):this._expeditionSurface()||generateSurface(body,s.seed,s.flags),point=custody?surface.spawn:medicalSpawn(surface,destination,s.person);
  Object.assign(s.person,point,{health:Math.max(1,Math.round((s.person.maxHealth||100)*.6)),down:false,weaponDrawn:false,aimManual:false,aimTargetId:null,moving:false,vx:0,vy:0});
  delete s.person.interiorDown;delete s.person.lastShot;
  s.stationView=null;s.pendingEncounter=null;s.boarding=null;
  const serial=Math.max(0,Math.floor(finite(s.medicalRecovery?.serial)))+1;
  s.medicalRecovery={version:1,serial,id:`${this.playerId}:${serial}`,at:s.stats.time,wakeUntil:s.stats.time+MEDICAL_WAKE_SECONDS,sourceKind,cost,destination:clone(destination)};
  this._recoveryTimer=MEDICAL_WAKE_SECONDS+3;this._siteDownTime=0;this._medicalDownTime=0;
  const text=`Recovered at ${destination.name}.${cost?` Treatment cost ${cost} cr.`:''} Your surviving property and service record are unchanged.`;
  this._log('Medical recovery',text,'rescue');
  this._event('medical-recovery',{text,recovery:clone(s.medicalRecovery),targetId:this.playerId});
  return this._ok({body,destination:clone(destination),cost,text});
 },
 recoverMedicalCasualty(message,{sourceKind='ground-casualty',costRate=.1,destination=null}={}){
  const s=this.state;
  if(s.npcContract?.active&&!this._sharedWorld){
   const recovered=this.recoverNpcContract(message||'Your duty watch ended with a medical evacuation.');
   return recovered?this._ok({destination:clone(s.medicalRecovery.destination)}):this._fail('No hospital is available for recovery.','location');
  }
  const bodyId=s.exploration?.bodyId||s.interior?.location?.parentId||s.locationId;
  const origin=this.system.bodies.find(b=>b.id===bodyId),originFactionId=origin?.faction||this.currentSystem.faction;
  destination||=medicalDestination(this,{bodyId});
  if(!destination)return this._fail('No hospital is available for recovery.','location');
  if(s.exploration){s.explorationRecords[s.exploration.key]=s.exploration.encounter;this.releaseWarzoneSurface();}
  this._arriveAsPassenger(this.system.bodies.find(body=>body.id===destination.bodyId));
  const cost=Math.floor(s.credits*costRate);s.credits-=cost;s.stats.rescues++;
  this.narrativeRescue?.();this.professionRescue?.();
  if(destination.kind!=='field-hospital')this.applyMilitaryRecovery?.({systemId:s.systemId,originFactionId,sourceKind,nearestBody:destination});
  return this.finishMedicalRecovery(destination,{sourceKind,cost});
 }
};
