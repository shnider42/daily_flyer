export const CAR_FIELDS=['kind','name','paint','damage','engineDamage','wheelDamage','panelDamage','dents','lastImpact','fire','fireFuse','exploded','burnTime','occupied','police','jurisdiction','sirens','hazards','npcDoor','driverId','rare','braking','takeoverBy'];
export const POSE_FIELDS=['x','y','z','a','vx','vz','speed','pitch','roll','steer','hit','yawRate','verticalSpeed','motorClock','distance','top','slip'];
export const PERSON_FIELDS=['x','y','z','a','walk','speed','coat','officer','jurisdiction','stun','knockdown','impactSide','lastVehicleImpact','reaction','reactionTime','reporting','networkPlayer','knockVX','knockVZ','verticalSpeed','contactCooldown','vx','vz'];
export const PROP_FIELDS=['kind','x','y','z','a','pitch','roll','broken','active','leakTime','anchor'];
const pick=(o,keys)=>Object.fromEntries(keys.filter(k=>o[k]!==undefined).map(k=>[k,rounded(o[k])]));
const rounded=v=>typeof v==='number'&&Number.isFinite(v)?Math.round(v*1000)/1000:v;
export const wireString=o=>JSON.stringify(o);
export function snapshot(world,player,cache=new Map()){
 const actor=player.onFoot?player.person:player.car,near=o=>Math.hypot(o.x-actor.x,o.z-actor.z)<165,all=[...new Set([...world.parked,...world.traffic,...world.cops])],playerCars=new Set([...world.members.values()].map(p=>p.car));
 const cars=all.filter(c=>near(c)||playerCars.has(c)),defs=[],poses=[],ids=new Set(cars.map(c=>'c'+c.netId));for(const key of cache.keys())if(key!=='layout'&&!ids.has(key))cache.delete(key);
 for(const c of cars){const meta={id:c.netId,...pick(c,CAR_FIELDS)},encoded=wireString(meta),key='c'+c.netId;if(cache.get(key)!==encoded){cache.set(key,encoded);defs.push(meta);}poses.push([c.netId,...POSE_FIELDS.map(k=>rounded(c[k]||0))]);}
 // Every update carries membership and all changed props, so joining and reconnecting cannot miss destruction.
 const props=world.props.filter(p=>p.broken).map(p=>({id:p.netId,...pick(p,PROP_FIELDS)}));
 const players=[...world.members.values()].map(p=>({id:p.id,name:p.name,carId:p.car.netId,onFoot:p.onFoot,connected:p.connected,person:pick(p.person,PERSON_FIELDS),heat:p.heat,door:p.door?{carId:p.door.car.netId,side:p.door.side,time:p.door.time}:null}));
 const propLayout=cache.has('layout')?undefined:world.props.map(p=>[p.netId,p.kind,p.x,p.z,p.a]);cache.set('layout',true);
 return{type:'state',propLayout,time:rounded(world.elapsed),ack:player.ack,defs,poses,traffic:world.traffic.filter(near).map(c=>c.netId),cops:world.cops.filter(near).map(c=>c.netId),players,props,pedestrians:world.pedestrians.filter(p=>!p.networkPlayer&&near(p)).map(p=>({id:p.netId,...pick(p,PERSON_FIELDS)})),officers:world.officers.filter(near).map(p=>({id:p.netId,...pick(p,PERSON_FIELDS)})),self:{heat:player.heat,hidden:player.hidden,busted:player.busted,message:player.message,messageTime:player.messageTime,done:player.done,reports:player.reports.map(r=>({remaining:r.remaining})),takeover:player.takeover?{carId:player.takeover.car.netId,elapsed:player.takeover.elapsed}:null,impact:player.impact},explosions:world.explosions,explosionCount:world.explosionCount,horns:world.hornEvents,propEvents:world.street.events,propImpactCount:world.propImpactCount};
}
