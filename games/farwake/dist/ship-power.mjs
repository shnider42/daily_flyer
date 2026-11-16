/** Reactor priorities belong to the physical vessel, including borrowed ships. */
export const POWER_LABELS=Object.freeze({balanced:'Balanced',thrusters:'Thrusters',guns:'Guns',shields:'Shields'});
export function powerSystems(ship={}) {
 if(!(ship.maxEnergy>0))return [];
 return [['thrusters',ship.thrustAcceleration>0||ship.speed>0],['guns',ship.damage>0&&ship.range>0],['shields',ship.maxShield>0]].filter(([,present])=>present).map(([id])=>id);
}
export function powerProfile(ship={}) {
 const systems=powerSystems(ship),mode=systems.length>1&&systems.includes(ship.powerPriority)?ship.powerPriority:'balanced';
 const shares=Object.fromEntries(systems.map(id=>[id,mode==='balanced'?1/systems.length:id===mode?.6:.4/(systems.length-1)]));
 const ratio=id=>systems.includes(id)?shares[id]*systems.length:1;
 return {mode,systems,shares,thrust:.65+.35*ratio('thrusters'),speed:.92+.08*ratio('thrusters'),gunRate:.55+.45*ratio('guns'),shieldRate:.25+.75*ratio('shields')};
}
export function routeShipPower(ship,mode) {
 const profile=powerProfile(ship);
 const fail=(reason,code)=>({ok:false,reason,code});
 if(!Object.hasOwn(POWER_LABELS,mode))return fail('Choose a listed power priority.','power-mode');
 if(profile.systems.length<2)return fail('This hull has no competing powered systems to redistribute.','power-systems');
 if(mode!=='balanced'&&!profile.systems.includes(mode))return fail('This vessel does not have that powered system.','power-systems');
 if(ship.destroyed||!(ship.hull>0))return fail('This reactor is offline.','no-ship');
 if(profile.mode===mode)return fail('That power route is already active.','equipped');
 if(ship.powerRerouteRemaining>0)return fail('The power bus is settling. Wait a moment before switching again.','cooldown');
 ship.powerPriority=mode;ship.powerRerouteRemaining=2;
 return {ok:true,mode,text:`Power: ${POWER_LABELS[mode]}.`};
}
