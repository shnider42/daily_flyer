/** Survivors travel to the nearest medical facility. Recovery never manufactures a hull. */
import {getShipClass} from './fleet.mjs';
import {medicalDestination} from './medical-recovery.mjs';

const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const clone=value=>JSON.parse(JSON.stringify(value));

export function nearestRecoveryStation(system,position={}){
 const candidates=(system?.bodies||[]).filter(body=>body.kind==='station'&&body.landable!==false&&body.portServices!==false);
 return candidates.sort((a,b)=>Math.hypot(a.x-finite(position.x),a.y-finite(position.y))-Math.hypot(b.x-finite(position.x),b.y-finite(position.y))||a.id.localeCompare(b.id))[0]||null;
}

/** The legacy ship-shaped record carries no ownership or physical presence. */
export function unownedShipRecord(identity='local'){
 const hull=getShipClass('sparrow');
 return {...hull.stats,id:`unowned:${identity}`,name:'Cinder',classId:hull.id,unowned:true,humanOccupants:1,berths:hull.berths,
  x:0,y:0,vx:0,vy:0,angle:0,angularVelocity:0,hull:hull.stats.maxHull,shield:0,energy:hull.stats.maxEnergy,fuel:0};
}

export function shipRecoveryContext(game,ship=game.state.ship,{sourceKind='ship-destroyed',system=game.system,crew=game.state.crew,personal,boarding=game.state.boarding,cause}={}){
 const destination=medicalDestination(game,{system,position:ship});
 const incident=game.beginRecoveryIncident?.({key:`${sourceKind}:${ship.id}:${game.state.stats.time}`,sourceKind,system,ship,crew,personal,boarding,destination,
  cause:cause||(sourceKind==='ship-destroyed'&&ship.lastDamage?.cause?`The vessel was destroyed by ${ship.lastDamage.cause}.`:undefined)});
 return {sourceSystemId:system.id,sourceFactionId:system.faction,sourcePosition:{x:finite(ship.x),y:finite(ship.y)},sourceKind,
  vesselId:ship.id,vesselName:ship.name||'Your ship',destination,incidentId:incident?.id};
}

export const ShipRecoveryRules={
 /** Detach ownership while the original object remains a wreck or occupied hull. */
 losePersonalVessel(ship=this.state.ship,{reason='destroyed',destination=null,incidentId=null}={}){
  if(!ship||ship.unowned)return false;
  const s=this.state;
  if(s.fleet.history.some(row=>row.type==='loss'&&row.vesselId===ship.id))return false;
  const context=shipRecoveryContext(this,ship,{sourceKind:reason==='destroyed'?'ship-destroyed':'deck-defeat'});
  incidentId||=context.incidentId;destination||=context.destination;
  const report=this.state.voyageMemory?.incidents.find(row=>row.id===incidentId);
  if(report){report.losses={...report.losses,shipLost:true,cargo:clone(s.cargo),upgrades:Object.keys(s.upgrades)};report.ship.status=reason==='destroyed'?'destroyed':'occupied';}
  this.evacuatePersonalCrew?.(destination,{incidentId,ship,crew:s.crew,personal:true});
  this.professionRescue?.();
  s.fleet.history.push({type:'loss',reason,vesselId:ship.id,name:ship.name,classId:ship.classId,time:s.stats.time,systemId:s.systemId,x:ship.x,y:ship.y});
  s.fleet.owned=[];
  s.ship=unownedShipRecord(`${this.playerId}:${s.fleet.history.length}`);
  s.cargo={ore:0,crystal:0};s.upgrades={};s.crew=[];s.boarding=null;
  if(s.livelihoods)s.livelihoods.parkedShip=null;
  if(s.multiplayer?.serverAuthoritative)s.multiplayer.ownedVesselId=null;
  this.narrativeRescue?.();
  return true;
 },
 /** Called after both ownership and the character's physical landing are settled. */
 completeShipRecovery(context={}){
  const s=this.state,destination=context.destination;
  if(!destination)return this._fail('No hospital is available for survivor recovery.','location');
  if(context.incidentId&&s.medicalRecovery?.incidentId===context.incidentId)return this._ok({destination:clone(destination),incidentId:context.incidentId});
  s.stationView=null;s.pendingEncounter=null;s.boarding=null;
  Object.assign(s.person,{health:Math.max(1,Math.round((s.person.maxHealth||100)*.55)),down:false,weaponDrawn:false,moving:false,vx:0,vy:0});
  s.lastBodyId=destination.bodyId;
  s.shipRecovery={version:1,...clone(context),at:finite(s.stats.time)};
  s.stats.rescues++;this._recoveryTimer=8;
  const outcome=this.applyMilitaryRecovery?.({systemId:context.sourceSystemId,originFactionId:context.sourceFactionId,sourceKind:context.sourceKind,vesselId:context.vesselId,nearestBody:clone(destination)});
  this.finishMedicalRecovery({...destination,...(outcome?.status==='detained'?{name:destination.name+' · guarded ward'}:{})},{sourceKind:context.sourceKind,incidentId:context.incidentId,serviceDestination:context.serviceDestination});
  const text=context.message||`${context.vesselName||'The ship'} was lost. Survivors were recovered at ${destination.name}. No replacement ship was issued.`;
  this._log('Survivors recovered',text,'rescue');
  this._event('rescue',{text,bodyId:destination.bodyId,systemId:destination.systemId,vesselId:context.vesselId,shipLost:context.sourceKind==='ship-destroyed',recovery:clone(s.shipRecovery)});
  this._refreshJobs?.();
  return this._ok({text,destination:clone(destination),militaryRecovery:outcome});
 },
 recoverFromShipLoss(message,{ship=this.state.ship,sourceKind='ship-destroyed'}={}){
  const context=shipRecoveryContext(this,ship,{sourceKind});
  if(!context.destination)return this._fail('No hospital is available for survivor recovery.','location');
  const body=this.system.bodies.find(body=>body.id===context.destination.bodyId);
  if(this.ownsShip&&this.personalShip.id===ship.id)this.losePersonalVessel(ship,{reason:sourceKind==='ship-destroyed'?'destroyed':'captured',destination:context.destination,incidentId:context.incidentId});
  this._arriveAsPassenger(body);
  return this.completeShipRecovery({...context,...(message?{message}:{})});
 }
};
