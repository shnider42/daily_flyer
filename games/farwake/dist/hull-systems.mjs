/** Native hull equipment. The same rules drive solo, authority and prediction. */
const defaults={
 energyRecharge:11,boostMultiplier:1.7,boostDrain:18,
 miningReach:225,salvagePullRange:90,salvageReach:150,
 foldFuelMultiplier:1,surveyMultiplier:1,shieldRecharge:4,shieldDelay:5,
 pulseCount:1,pulseDamageScale:1,pulseEnergy:3,pulseCooldown:.25,pulseOffset:0,
 repairHull:8,repairEnergy:18,repairCooldown:4,
 healPerson:12,healCrew:8,healEnergy:15,healCooldown:6,damageControlMultiplier:1
};
const definitions={
 sparrow:{name:'Reserve bus',description:'Recovers 14 reactor charge per second while cruising, keeping working systems ready between bursts.',tradeoff:'Balanced equipment; no specialist weapon or cargo rig.',energyRecharge:14},
 kestrel:{name:'Vector overdrive',description:'BOOST delivers 1.95× thrust for a fast escape or course correction.',tradeoff:'Overdrive draws 24 reactor charge per second; coast between bursts.',boostMultiplier:1.95,boostDrain:24},
 mule:{name:'Tractor rig',description:'The mining beam reaches 315 metres beyond a rock’s edge. Loose salvage is drawn in from 210 metres and can be collected within 230 metres.',tradeoff:'The tug still needs time to turn and build speed.',miningReach:315,salvagePullRange:210,salvageReach:230},
 hauler:{name:'Economy fold coils',description:'Fold jumps use 25% less fuel before rounding. Normal drive range and upgrades still apply.',tradeoff:'Long-haul efficiency comes with a heavy, slow-turning hull.',foldFuelMultiplier:.75},
 frigate:{name:'Redundant shield grid',description:'Shield recharge resumes three seconds after a hit and restores five points per second.',tradeoff:'The grid cannot prevent a boarding fight or repair breached plating.',shieldDelay:3,shieldRecharge:5},
 petrel:{name:'Long-baseline survey array',description:'Charts nearby stars across a 45% wider radius whenever you arrive in a system.',tradeoff:'Finding a star does not reveal its story or extend your fold range.',surveyMultiplier:1.45},
 marten:{name:'Paired pulse mounts',description:'FIRE launches two parallel pulses, each dealing 60% of the ship’s rated pulse damage.',tradeoff:'A paired volley costs five reactor charge and cycles every 0.30 seconds.',pulseCount:2,pulseDamageScale:.6,pulseEnergy:5,pulseCooldown:.3,pulseOffset:10},
 atlas:{name:'Mobile workshop',description:'Engineering restores 16 hull integrity per cycle. Damage-control work is 35% faster.',tradeoff:'A hull-repair cycle draws 22 reactor charge; the industrial frame is slow.',repairHull:16,repairEnergy:22,damageControlMultiplier:1.35},
 capital:{name:'Trauma ward',description:'Medical treatment restores 24 vitality to conscious captains and 16 to injured crew and rescued passengers.',tradeoff:'A treatment costs 20 reactor charge. Lost crew cannot be revived.',healPerson:24,healCrew:16,healEnergy:20}
};
const systems=Object.freeze(Object.fromEntries(Object.entries(definitions).map(([id,definition])=>[id,Object.freeze({id,...defaults,...definition})])));
export const getHullSystems=id=>systems[id]||systems.sparrow;

/** Propulsion energy only; firing, scanning and stations spend charge in Game. */
export function hullEnergyAfterStep(ship,delta,input={}){
 const equipment=getHullSystems(ship?.classId),dt=Math.max(0,Math.min(.25,Number(delta)||0));
 const energy=Number.isFinite(ship?.energy)?ship.energy:0,maximum=Number.isFinite(ship?.maxEnergy)?ship.maxEnergy:100;
 const thrust=Number.isFinite(input.thrust)?input.thrust:-(Number(input.y)||0);
 const boosting=!!input.boost&&thrust>0&&energy>8;
 const rate=boosting?-equipment.boostDrain:input.mine?-1:equipment.energyRecharge;
 return Math.max(0,Math.min(maximum,energy+rate*dt));
}
