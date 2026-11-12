/** Survivors travel to the closest station. Recovery never manufactures a hull. */
import {getShipClass} from './fleet.mjs';

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

export function shipRecoveryContext(game,ship=game.state.ship,{sourceKind='ship-destroyed',system=game.system}={}){
 const body=nearestRecoveryStation(system,ship);
 return {sourceSystemId:system.id,sourceFactionId:system.faction,sourcePosition:{x:finite(ship.x),y:finite(ship.y)},sourceKind,
  vesselId:ship.id,vesselName:ship.name||'Your ship',destination:body?{systemId:system.id,bodyId:body.id,name:body.name}:null};
}

export const ShipRecoveryRules={
 /** Detach ownership while the original object remains a wreck or occupied hull. */
 losePersonalVessel(ship=this.state.ship,{reason='destroyed'}={}){
  if(!ship||ship.unowned)return false;
  const s=this.state;
  this.professionRescue?.();
  s.fleet.history.push({type:'loss',reason,vesselId:ship.id,name:ship.name,classId:ship.classId,time:s.stats.time,systemId:s.systemId,x:ship.x,y:ship.y});
  s.fleet.owned=[];
  s.ship=unownedShipRecord(`${this.playerId}:${s.fleet.history.length}`);
  s.cargo={ore:0,crystal:0};s.upgrades={};s.crew=[];s.formerCrew=[];s.boarding=null;
  if(s.livelihoods)s.livelihoods.parkedShip=null;
  if(s.multiplayer?.serverAuthoritative)s.multiplayer.ownedVesselId=null;
  this.narrativeRescue?.();
  return true;
 },
 /** Called after both ownership and the character's physical landing are settled. */
 completeShipRecovery(context={}){
  const s=this.state,destination=context.destination;
  if(!destination)return this._fail('No station is available for survivor recovery.','location');
  s.stationView=null;s.pendingEncounter=null;s.boarding=null;
  Object.assign(s.person,{health:Math.max(1,Math.round((s.person.maxHealth||100)*.55)),down:false,weaponDrawn:false,moving:false,vx:0,vy:0});
  s.lastBodyId=destination.bodyId;
  s.shipRecovery={version:1,...clone(context),at:finite(s.stats.time)};
  s.stats.rescues++;this._recoveryTimer=8;
  const outcome=this.applyMilitaryRecovery?.({systemId:context.sourceSystemId,originFactionId:context.sourceFactionId,sourceKind:context.sourceKind,vesselId:context.vesselId,nearestBody:clone(destination)});
  const text=context.message||`${context.vesselName||'The ship'} was lost. Survivors were recovered at ${destination.name}. No replacement ship was issued.`;
  this._log('Survivors recovered',text,'rescue');
  this._event('rescue',{text,bodyId:destination.bodyId,systemId:destination.systemId,vesselId:context.vesselId,shipLost:context.sourceKind==='ship-destroyed',recovery:clone(s.shipRecovery)});
  this._refreshJobs?.();
  return this._ok({text,destination:clone(destination),militaryRecovery:outcome});
 },
 recoverFromShipLoss(message,{ship=this.state.ship,sourceKind='ship-destroyed'}={}){
  const context=shipRecoveryContext(this,ship,{sourceKind});
  if(!context.destination)return this._fail('No station is available for survivor recovery.','location');
  const body=this.system.bodies.find(body=>body.id===context.destination.bodyId);
  if(this.ownsShip&&this.personalShip.id===ship.id)this.losePersonalVessel(ship,{reason:sourceKind==='ship-destroyed'?'destroyed':'captured'});
  this._arriveAsPassenger(body);
  return this.completeShipRecovery({...context,...(message?{message}:{})});
 }
};
