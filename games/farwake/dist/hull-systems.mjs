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
 capital:{name:'Trauma ward',description:'Medical treatment restores 24 vitality to conscious captains and 16 to injured crew and rescued passengers.',tradeoff:'A treatment costs 20 reactor charge. Lost crew cannot be revived.',healPerson:24,healCrew:16,healEnergy:20},
 tern:{name:'Shuttle service bus',description:'Recovers 17 reactor charge per second while cruising, readying the shuttle for its next scan, repair, or boost.',tradeoff:'Its light shield recovers only three points per second after the normal delay.',energyRecharge:17,shieldRecharge:3},
 quill:{name:'Dispatch drive',description:'Fold jumps use 20% less fuel before rounding. BOOST delivers 1.8× thrust while drawing only 16 reactor charge per second.',tradeoff:'The courier has less cargo space and plating than a dedicated freighter.',foldFuelMultiplier:.8,boostMultiplier:1.8,boostDrain:16},
 mender:{name:'Rapid triage ward',description:'Medical treatment restores 24 vitality to conscious captains and 18 to injured crew and rescued passengers, with a five-second treatment cycle.',tradeoff:'Each treatment draws 17 reactor charge. Lost crew cannot be revived.',healPerson:24,healCrew:18,healEnergy:17,healCooldown:5},
 bulwark:{name:'Triple pulse battery',description:'FIRE launches three pulses, each dealing 45% of rated pulse damage. Shield recovery begins four seconds after the last hit.',tradeoff:'A volley draws eight reactor charge and cycles every 0.38 seconds; wide shots can miss a small target.',pulseCount:3,pulseDamageScale:.45,pulseEnergy:8,pulseCooldown:.38,pulseOffset:14,shieldDelay:4},
 cairn:{name:'Deep-reach mining array',description:'Cutters reach 390 metres beyond a rock’s edge. Salvage is drawn in from 300 metres and can be collected within 320 metres.',tradeoff:'The broad hold and heavy machinery make the barge slow to reposition.',miningReach:390,salvagePullRange:300,salvageReach:320},
 lark:{name:'Shared service manifold',description:'Ordinary engineering repairs cost 14 reactor charge and medical treatments cost 12, leaving a little more charge for the rest of the crew.',tradeoff:'Repair and treatment strength stay at the standard values; the launch has one light pulse mount.',repairEnergy:14,healEnergy:12},
 puffin:{name:'Cabin support generator',description:'Recovers 15 reactor charge per second between boosts. Medical treatment restores 14 vitality to the captain and 10 to living crew and rescued passengers.',tradeoff:'The lightly protected transport restores only three shield points per second; it is not an armored ambulance.',energyRecharge:15,healPerson:14,healCrew:10,shieldRecharge:3},
 osprey:{name:'Field maintenance lockers',description:'Engineering restores 10 hull integrity per cycle and damage-control work is 15% faster, supporting a larger crew with ordinary field tools.',tradeoff:'Repairs still cost 18 charge and the roomy launch retains a single modest pulse mount.',repairHull:10,damageControlMultiplier:1.15},
 leviathan:{name:'Expedition support dock',description:'Engineering restores 22 hull integrity per cycle and damage-control work is 50% faster. Cutters reach 450 metres beyond a rock; salvage is drawn from 400 metres and collected within 420.',tradeoff:'Repairs cost 28 charge and take five seconds. The immense tender turns and accelerates slowly; these tools service its own hull.',repairHull:22,repairEnergy:28,repairCooldown:5,damageControlMultiplier:1.5,miningReach:450,salvagePullRange:400,salvageReach:420,healCrew:14,healEnergy:20},
 judicator:{name:'Paired line batteries',description:'FIRE launches four parallel pulses in two widely spaced pairs. Each deals 38% of rated pulse damage; shields recover at six points per second after five seconds without a hit.',tradeoff:'A volley draws 22 reactor charge and takes 0.75 seconds to cycle. The wide battery can bracket and miss a small target, and the destroyer turns very slowly.',pulseCount:4,pulseDamageScale:.38,pulseEnergy:22,pulseCooldown:.75,pulseOffset:32,pulseMuzzles:Object.freeze([[-95,-96],[125,-32],[125,32],[-95,96]].map(point=>Object.freeze(point))),shieldRecharge:6}
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
