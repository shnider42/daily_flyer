/** A gun station changes the view, never the captain's body or the ship's pilot. */
import {cabinLayout} from './interior-layouts.mjs';
import {getGunneryBatteries,getGunneryBattery,batteryOrigin,batteryCooldown} from './gunnery-batteries.mjs';
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

export function gunneryOrigin(ship,batteryId='fore'){
 return batteryOrigin(ship,getGunneryBattery(ship,batteryId)||getGunneryBattery(ship));
}

export function gunneryStatus(game,{worker=game,ship=game.state.ship}={}){
 const state=worker.state,contract=game.state.npcContract||state.npcContract,person=state.person||{},location=state.interior?.location;
 const point=securityStation(ship?.classId||contract?.classId);
 const vesselId=ship?.id||contract?.vesselId||null,identity=state.multiplayer?.captainId||worker.playerId;
 const npcPilot=!!contract?.active&&contract.vesselId===vesselId;
 const contracted=npcPilot&&contract.roleId==='gunner'&&(contract.military?.branchId==='navy'?isNavyParticipant(contract,identity):String(contract.employeeId)===String(identity));
 const shared=state.multiplayer?.serverAuthoritative===true;
 const permitted=!npcPilot&&(shared?state.multiplayer?.aboardVesselId===vesselId&&state.multiplayer?.weaponsAllowed===true:worker.ownsShip&&state.ship?.id===vesselId);
 const assigned=!!(contracted||permitted);
 let reason=null;
 if(!assigned)reason='You need weapons permission on this vessel to operate its gunnery station.';
 else if(npcPilot&&contract.military?.branchId==='navy'&&!navyDutyRoles(worker,contract).includes('weapons'))reason='Your own Navy enlistment and current service standing must permit weapons duty.';
 else if(state.mode!=='person'||state.interior?.kind!=='ship'||location?.vesselId!==vesselId)reason='Enter the assigned vessel’s crew deck first.';
 else if(person.health<=0||person.down)reason='Recover before operating the guns.';
 else if(ship.destroyed||ship.hull<=0)reason='This vessel’s weapons are no longer operational.';
 else if(contract?.dockedAt||ship.dockedAt||state.multiplayer?.dockedAt)reason='The ship is moored. Gunnery opens after departure.';
 else if(npcPilot&&!['outbound','working','returning'].includes(contract.phase))reason='Wait for the NPC captain to begin the sortie.';
 else if(state.boarding?.phase==='active'||game.state.boarding?.phase==='active')reason='Return to the deck and resolve the boarding alarm.';
 else if(!Number.isFinite(person.x)||!Number.isFinite(person.y)||distance(person,point)>GUNNERY_RULES.stationRange)reason='Walk to the marked security / gunnery console.';
 const available=!reason,active=available&&state.stationView==='gunnery',definitions=getGunneryBatteries(ship);
 const selected=definitions.find(battery=>battery.id===person.gunneryBatteryId)||definitions[0];
 const weaponsFree=!npcPilot||contract.military?.branchId==='navy'||contract.phase==='working'||contract.assignment?.complication?.type==='attack'&&contract.assignment?.complication?.started&&!contract.assignment?.complication?.resolved;
 const legacyCooldown=!ship.gunneryCooldowns?Math.max(0,finite(person.gunneryReadyAt)-finite(state.stats?.time)):0;
 const batteries=definitions.map(battery=>{
  const cooldownRemaining=Math.max(batteryCooldown(ship,battery.id),legacyCooldown);
  return{id:battery.id,name:battery.name,direction:battery.direction,index:battery.index,selected:battery.id===selected.id,
   arcCenter:angle(finite(ship?.angle)+battery.bearing),arcHalfAngle:battery.arcHalfAngle,origin:batteryOrigin(ship,battery),range:battery.range,
   energyCost:battery.energyCost,cooldown:battery.cooldown,cooldownRemaining,mountCount:battery.mountCount,
   canFire:!!(active&&weaponsFree&&cooldownRemaining<=0&&ship.energy>=battery.energyCost)};
 });
 const battery=batteries[selected.index],{arcCenter,arcHalfAngle,cooldownRemaining}=battery;
 const targetIds=contract?.navy?.targetIds||[contract?.work?.enemyId].filter(Boolean);
 return{assigned,available,active,reason,vesselId,shipName:ship?.name||contract?.shipName||'Assigned ship',
  npcPilot,pilotLabel:npcPilot?'NPC pilot':'Crew helm / coasting',selectedBatteryId:battery.id,batteryName:battery.name,direction:battery.direction,batteryIndex:battery.index,batteryCount:batteries.length,batteries,
  station:{...point,role:'weapons',entityId:`${location?.id||state.locationId||`ship:${vesselId}`}:station:security`},
  aimAngle:clampGunneryAim(person.gunneryAimAngle,arcCenter,arcHalfAngle),arcCenter,arcHalfAngle,origin:battery.origin,
  range:battery.range,cooldown:battery.cooldown,cooldownRemaining,energy:finite(ship?.energy),energyCost:battery.energyCost,
  targetIds:[...targetIds],canFire:battery.canFire};
}

export function applyGunneryAim(game,worker,input={}){
 const status=gunneryStatus(game,{worker});
 if(!status.active)return null;
 const aimX=finite(input.aimX),aimY=finite(input.aimY),aimed=input.aiming&&Math.hypot(aimX,aimY)>.1;
 const direction=aimed?Math.atan2(aimY,aimX):finite(worker.state.person.gunneryAimAngle,status.arcCenter);
 const aimAngle=clampGunneryAim(direction,status.arcCenter,status.arcHalfAngle);
 worker.state.person.gunneryAimAngle=aimAngle;
 return{manual:true,batteryId:status.selectedBatteryId,angle:aimAngle};
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
  this.state.stationView='gunnery';this.state.person.gunneryBatteryId=status.selectedBatteryId;this.state.person.gunneryAimAngle=status.arcCenter;
  Object.assign(this.state.person,{moving:false,vx:0,vy:0,weaponDrawn:false,aimTargetId:null});
  const text=`${status.batteryName} selected. ${status.batteryCount>1?'Choose 1–4 or a battery button to cover another direction. ':''}${status.npcPilot?'The NPC captain keeps the helm.':'The ship stays under its existing helm control or coasts.'}`;
  this._event('gunnery-view',{active:true,vesselId:status.vesselId,batteryId:status.selectedBatteryId,text});
  return this._ok({text,gunnery:this.gunneryStatus()});
 },
 selectGunneryBattery(selection){
  const status=this.gunneryStatus();if(!status.active)return this._fail(status.reason||'Open the gunnery display before choosing a battery.','gunnery');
  const batteryId=typeof selection==='string'?selection:selection?.batteryId,battery=status.batteries.find(value=>value.id===batteryId);
  if(!battery)return this._fail('Choose one of this vessel’s listed gun batteries.','battery');
  this.state.person.gunneryBatteryId=battery.id;this.state.person.gunneryAimAngle=battery.arcCenter;
  this._event('gunnery-battery',{vesselId:status.vesselId,batteryId:battery.id,text:`${battery.name} selected · ${battery.direction}.`});
  return this._ok({text:`${battery.name} selected.`,gunnery:this.gunneryStatus()});
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
