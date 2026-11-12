/** Physical gun mounts shared by the exterior display and authoritative firing. */
import {getHullSystems} from './hull-systems.mjs';
import {getShipClass} from './fleet.mjs';

const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const capitalHulls=new Set(['capital','leviathan','judicator']);
const directions=Object.freeze([
 Object.freeze({id:'fore',name:'Fore battery',direction:'Forward',bearing:0}),
 Object.freeze({id:'port',name:'Port battery',direction:'Left side',bearing:-Math.PI/2}),
 Object.freeze({id:'starboard',name:'Starboard battery',direction:'Right side',bearing:Math.PI/2}),
 Object.freeze({id:'aft',name:'Aft battery',direction:'Rear',bearing:Math.PI})
]);

export function getGunneryBatteries(shipOrClassId){
 const ship=typeof shipOrClassId==='string'?{classId:shipOrClassId}:shipOrClassId||{},hull=getShipClass(ship.classId),system=getHullSystems(ship.classId);
 const length=finite(ship.renderLength,hull.stats.renderLength),width=finite(ship.renderWidth,hull.stats.renderWidth),nose=Math.max(24,length*.42);
 const batteryDirections=capitalHulls.has(hull.id)?directions:directions.slice(0,1);
 return batteryDirections.map((definition,index)=>{
  let muzzles;
  if(definition.id==='fore')muzzles=system.pulseMuzzles?.map(point=>[...point])||Array.from({length:system.pulseCount},(_,mount)=>[nose,(mount*2-(system.pulseCount-1))*system.pulseOffset]);
  else if(definition.id==='aft')muzzles=[[-nose,0]];
  else muzzles=[[0,(definition.id==='port'?-1:1)*width*.44]];
  // A line destroyer has paired broadside and stern mounts. Its existing
  // four-barrel forward volley remains intact for both helm and gun station.
  if(hull.id==='judicator'&&definition.id!=='fore')muzzles=definition.id==='aft'?[[-nose,-width*.1],[-nose,width*.1]]:[[-length*.17,muzzles[0][1]],[length*.05,muzzles[0][1]]];
  const secondary=hull.id==='judicator'&&definition.id!=='fore';
  return{...definition,index,arcHalfAngle:Math.PI/3,muzzles,mountCount:muzzles.length,
   energyCost:secondary?12:system.pulseEnergy,cooldown:system.pulseCooldown,damageScale:secondary ? .6 : system.pulseDamageScale,range:finite(ship.range,hull.stats.range)};
 });
}

export function getGunneryBattery(ship,batteryId='fore'){
 return getGunneryBatteries(ship).find(battery=>battery.id===batteryId)||null;
}

export function batteryOrigin(ship,battery){
 const mounts=battery?.muzzles||[[0,0]],forward=mounts.reduce((sum,point)=>sum+point[0],0)/mounts.length,side=mounts.reduce((sum,point)=>sum+point[1],0)/mounts.length,a=finite(ship?.angle);
 return{x:finite(ship?.x)+Math.cos(a)*forward-Math.sin(a)*side,y:finite(ship?.y)+Math.sin(a)*forward+Math.cos(a)*side};
}

export function batteryCooldown(ship,batteryId){
 return Math.max(0,finite(ship?.gunneryCooldowns?.[batteryId]));
}

/** Remaining seconds belong to the hull, not to a gunner's personal clock. */
export function advanceGunneryCooldowns(ship,delta){
 if(!ship?.gunneryCooldowns)return;
 const dt=Math.max(0,Math.min(.1,finite(delta))),allowed=new Set(getGunneryBatteries(ship).map(battery=>battery.id));
 for(const id of Object.keys(ship.gunneryCooldowns)){
  if(!allowed.has(id)){delete ship.gunneryCooldowns[id];continue;}
  ship.gunneryCooldowns[id]=Math.max(0,batteryCooldown(ship,id)-dt);
 }
}
