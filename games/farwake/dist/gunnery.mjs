/** A gun station changes the view, never the captain's body or the ship's pilot. */
import {cabinLayout} from './interior-layouts.mjs';
import {getHullSystems} from './hull-systems.mjs';
import {getShipClass} from './fleet.mjs';
import {isNavyParticipant} from './navy-service.mjs';
import {navyDutyRoles} from './navy-duty.mjs';

const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const angle=value=>Math.atan2(Math.sin(value),Math.cos(value));
export const GUNNERY_RULES=Object.freeze({stationRange:46,arcHalfAngle:Math.PI/3});
const stations=new Map();
function securityStation(classId){
 if(!stations.has(classId))stations.set(classId,Object.freeze({...cabinLayout(classId).stations.security}));
 return stations.get(classId);
}
export const gunneryStation=classId=>({...securityStation(classId)});

export function clampGunneryAim(value,arcCenter=0,arcHalfAngle=GUNNERY_RULES.arcHalfAngle){
 const center=finite(arcCenter),half=clamp(finite(arcHalfAngle,GUNNERY_RULES.arcHalfAngle),0,Math.PI);
 return angle(center+clamp(angle(finite(value,center)-center),-half,half));
}

export function gunneryOrigin(ship){
 const systems=getHullSystems(ship?.classId),mounts=systems.pulseMuzzles;
 const forward=mounts?mounts.reduce((total,point)=>total+point[0],0)/mounts.length:Math.max(24,finite(ship?.renderLength,getShipClass(ship?.classId).stats.renderLength)*.42);
 const side=mounts?mounts.reduce((total,point)=>total+point[1],0)/mounts.length:0,a=finite(ship?.angle);
 return{x:finite(ship?.x)+Math.cos(a)*forward-Math.sin(a)*side,y:finite(ship?.y)+Math.sin(a)*forward+Math.cos(a)*side};
}

export function gunneryStatus(game,{worker=game,ship=game.state.ship}={}){
 const state=worker.state,contract=game.state.npcContract||state.npcContract,person=state.person||{},location=state.interior?.location;
 const point=securityStation(ship?.classId||contract?.classId),systems=getHullSystems(ship?.classId);
 const vesselId=ship?.id||contract?.vesselId||null,identity=state.multiplayer?.captainId||worker.playerId;
 const assigned=!!contract?.active&&contract.roleId==='gunner'&&contract.vesselId===vesselId&&(contract.military?.branchId==='navy'?isNavyParticipant(contract,identity):String(contract.employeeId)===String(identity));
 let reason=null;
 if(!assigned)reason='This gunnery station is reserved for the assigned shipboard gunner.';
 else if(contract.military?.branchId==='navy'&&!navyDutyRoles(worker,contract).includes('weapons'))reason='Your own Navy enlistment and current service standing must permit weapons duty.';
 else if(state.mode!=='person'||state.interior?.kind!=='ship'||location?.vesselId!==vesselId)reason='Enter the assigned vessel’s crew deck first.';
 else if(person.health<=0||person.down)reason='Recover before operating the guns.';
 else if(ship.destroyed||ship.hull<=0)reason='This vessel’s weapons are no longer operational.';
 else if(contract.dockedAt||ship.dockedAt)reason='The ship is moored. Gunnery opens after the NPC captain casts off.';
 else if(!['outbound','working','returning'].includes(contract.phase))reason='Wait for the NPC captain to begin the sortie.';
 else if(state.boarding?.phase==='active'||game.state.boarding?.phase==='active')reason='Return to the deck and resolve the boarding alarm.';
 else if(!Number.isFinite(person.x)||!Number.isFinite(person.y)||distance(person,point)>GUNNERY_RULES.stationRange)reason='Walk to the marked security / gunnery console.';
 const available=!reason,active=available&&state.stationView==='gunnery',arcCenter=finite(ship?.angle),arcHalfAngle=GUNNERY_RULES.arcHalfAngle;
 const cooldownRemaining=Math.max(0,finite(person.gunneryReadyAt)-finite(state.stats?.time));
 const targetIds=contract?.navy?.targetIds||[contract?.work?.enemyId].filter(Boolean);
 return{assigned,available,active,reason,vesselId,shipName:ship?.name||contract?.shipName||'Assigned ship',
  station:{...point,role:'weapons',entityId:`${location?.id||state.locationId||`ship:${vesselId}`}:station:security`},
  aimAngle:clampGunneryAim(person.gunneryAimAngle,arcCenter,arcHalfAngle),arcCenter,arcHalfAngle,origin:gunneryOrigin(ship),
  range:finite(ship?.range),cooldown:systems.pulseCooldown,cooldownRemaining,energy:finite(ship?.energy),energyCost:systems.pulseEnergy,
  targetIds:[...targetIds],canFire:active&&(contract?.phase==='working'||contract?.assignment?.complication?.type==='attack'&&contract?.assignment?.complication?.started&&!contract?.assignment?.complication?.resolved)&&cooldownRemaining<=0&&ship.energy>=systems.pulseEnergy};
}

export function applyGunneryAim(game,worker,input={}){
 const status=gunneryStatus(game,{worker});
 if(!status.active)return null;
 const aimed=input.aiming&&Math.hypot(finite(input.aimX),finite(input.aimY))>.1;
 const direction=aimed?Math.atan2(input.aimY,input.aimX):finite(worker.state.person.gunneryAimAngle,status.arcCenter);
 const aimAngle=clampGunneryAim(direction,status.arcCenter,status.arcHalfAngle);
 worker.state.person.gunneryAimAngle=aimAngle;
 return{manual:true,angle:aimAngle,arcHalfAngle:status.arcHalfAngle};
}

export const GunneryRules={
 initializeGunnery(){
  // A saved view is not a renewed station grant. Live shared snapshots restore
  // their authority-projected flag directly after loading the game state.
  this.state.stationView=null;
 },
 gunneryStatus(){return gunneryStatus(this);},
 enterGunnery(){
  const status=this.gunneryStatus();if(!status.available)return this._fail(status.reason,'gunnery');
  this.state.stationView='gunnery';this.state.person.gunneryAimAngle=status.arcCenter;
  Object.assign(this.state.person,{moving:false,vx:0,vy:0,weaponDrawn:false,aimTargetId:null});
  this._event('gunnery-view',{active:true,vesselId:status.vesselId,text:'Gunnery view. Aim the ship’s battery; the NPC captain keeps the helm.'});
  return this._ok({text:'Gunnery view. The NPC captain keeps the helm.',gunnery:this.gunneryStatus()});
 },
 leaveGunnery(){
  this.state.stationView=null;this.state.person.moving=false;
  this._event('gunnery-view',{active:false});
  return this._ok({text:'You step back from the gunnery display.'});
 },
 validateGunnery(){
  if(this.state.stationView!=='gunnery')return false;
  if(!this.gunneryStatus().available){this.state.stationView=null;return false;}
  return true;
 }
};
