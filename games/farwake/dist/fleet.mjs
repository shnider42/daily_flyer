/** Shared, DOM-free vessel definitions and deterministic flight integration. */
import { getHullSystems } from './hull-systems.mjs';
export { cabinLayout, isCabinWalkable } from './interior-layouts.mjs';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const number = (n, fallback = 0) => Number.isFinite(Number(n)) ? Number(n) : fallback;

export const SHIP_CLASSES = Object.freeze([
  { id:'sparrow', name:'Sparrow', subtitle:'Utility cutter', description:'A small two-berth cutter with a shared cockpit and work bay. The medical kit, drive panel, and two fold-down bunks fit within a few steps of the helm.', berths:2, cost:420, ore:6, starter:true,
    stats:{mass:1, radius:21, renderLength:64, renderWidth:42, maxHull:100, maxShield:35, maxEnergy:100, maxFuel:30, cargoCap:24, speed:255, thrustAcceleration:230, strafeAcceleration:165, angularAcceleration:4.6, maxAngularVelocity:2.6, angularDamping:1.65, damage:16, range:850, scanRange:235, mining:1} },
  { id:'hauler', name:'Wayfarer', subtitle:'Long-haul freighter', description:'Six berths, a broad cargo spine, and heavy cargo engines. Its mass takes patience to turn.', berths:6, cost:1150, ore:20, requiresClass:'sparrow', requires:['fold_1'], conditions:{flags:['first_fold_done']},
    stats:{mass:3.2, radius:33, renderLength:104, renderWidth:66, maxHull:190, maxShield:60, maxEnergy:120, maxFuel:44, cargoCap:64, speed:205, thrustAcceleration:135, strafeAcceleration:85, angularAcceleration:1.9, maxAngularVelocity:1.5, angularDamping:1.25, damage:20, range:900, scanRange:270, mining:1.3} },
  { id:'frigate', name:'Peregrine', subtitle:'Expedition frigate', description:'Eight berths around a protected operations deck. Built for long expeditions and boarding defense.', berths:8, cost:2900, ore:38, requiresClass:'hauler', requires:['fold_2'], conditions:{flags:['archive_decoded']},
    stats:{mass:5.8, radius:40, renderLength:154, renderWidth:72, maxHull:310, maxShield:105, maxEnergy:155, maxFuel:58, cargoCap:84, speed:225, thrustAcceleration:115, strafeAcceleration:72, angularAcceleration:1.25, maxAngularVelocity:1.1, angularDamping:1.05, damage:27, range:1000, scanRange:310, mining:1.5} },
  { id:'capital', name:'Horizon', subtitle:'Expedition carrier', description:'Ten berths, separate engineering and medical wings, and room for a full human crew. An immense ship carries immense momentum.', berths:10, cost:6400, ore:60, requiresClass:'frigate', requires:['fold_3'], conditions:{flags:['ally_chosen']},
    stats:{mass:13, radius:68, renderLength:260, renderWidth:128, maxHull:560, maxShield:180, maxEnergy:210, maxFuel:80, cargoCap:150, speed:185, thrustAcceleration:68, strafeAcceleration:42, angularAcceleration:.62, maxAngularVelocity:.65, angularDamping:.8, damage:36, range:1200, scanRange:360, mining:1.8} },
  { id:'kestrel', name:'Kestrel', subtitle:'Scout courier', description:'One bunk behind a narrow scout cockpit. Fast thrust and a long-range scanner suit a lone first explorer; a tiny hold and light plating demand care.', berths:1, cost:420, ore:6, starter:true,
    stats:{mass:.72, radius:17, renderLength:56, renderWidth:30, maxHull:78, maxShield:30, maxEnergy:95, maxFuel:34, cargoCap:16, speed:290, thrustAcceleration:265, strafeAcceleration:190, angularAcceleration:5.1, maxAngularVelocity:2.9, angularDamping:1.8, damage:13, range:820, scanRange:300, mining:.8} },
  { id:'mule', name:'Mule', subtitle:'Salvage tug', description:'Two bunks in a cramped working cabin behind the salvage jaws. It brings more ore home, but the drive and medical locker share the little space left over.', berths:2, cost:480, ore:8, starter:true,
    stats:{mass:1.65, radius:24, renderLength:70, renderWidth:48, maxHull:125, maxShield:25, maxEnergy:115, maxFuel:28, cargoCap:38, speed:205, thrustAcceleration:165, strafeAcceleration:105, angularAcceleration:3.2, maxAngularVelocity:2.0, angularDamping:1.45, damage:14, range:780, scanRange:215, mining:1.4} },
  { id:'petrel', name:'Petrel', subtitle:'Deep-range surveyor', description:'Six berths, a field laboratory, and a wide listening array. The scanner and fuel reserve favor long surveying runs; thin armor makes escort worth considering.', berths:6, cost:1450, ore:24, requires:['fold_1'], conditions:{flags:['first_fold_done']},
    stats:{mass:2.3, radius:29, renderLength:90, renderWidth:52, maxHull:155, maxShield:75, maxEnergy:145, maxFuel:64, cargoCap:42, speed:245, thrustAcceleration:170, strafeAcceleration:120, angularAcceleration:2.4, maxAngularVelocity:1.8, angularDamping:1.4, damage:17, range:980, scanRange:420, mining:1.1} },
  { id:'marten', name:'Marten', subtitle:'Armored escort', description:'Six berths within a compact armored frame. Strong shields and paired pulse mounts protect convoys, at the cost of fuel endurance and cargo space.', berths:6, cost:2100, ore:32, requires:['fold_1'], conditions:{flags:['first_fold_done']},
    stats:{mass:4.1, radius:36, renderLength:126, renderWidth:76, maxHull:255, maxShield:125, maxEnergy:150, maxFuel:36, cargoCap:34, speed:235, thrustAcceleration:155, strafeAcceleration:95, angularAcceleration:1.8, maxAngularVelocity:1.45, angularDamping:1.3, damage:30, range:1050, scanRange:260, mining:.9} },
  { id:'atlas', name:'Atlas', subtitle:'Salvage tender', description:'Ten berths share a working deck above a vast salvage cradle. Heavy mining equipment, repair stores, and a broad hold support a roaming crew; the industrial frame is slow to reposition.', berths:10, cost:4800, ore:48, requiresClass:'hauler', requires:['fold_2'], conditions:{flags:['archive_decoded']},
    stats:{mass:10.5, radius:61, renderLength:214, renderWidth:116, maxHull:465, maxShield:115, maxEnergy:230, maxFuel:72, cargoCap:190, speed:165, thrustAcceleration:62, strafeAcceleration:44, angularAcceleration:.78, maxAngularVelocity:.75, angularDamping:.85, damage:24, range:980, scanRange:330, mining:2.3} },
  { id:'tern', name:'Tern', subtitle:'Harbor shuttle', description:'Three berths and a modest passenger saloon make a first working crew possible. A fast-recharging service bus keeps charge available between local runs, but its broad cabin is lightly protected.', berths:3, cost:780, ore:12,
    stats:{mass:1.9, radius:26, renderLength:78, renderWidth:50, maxHull:140, maxShield:40, maxEnergy:130, maxFuel:38, cargoCap:32, speed:225, thrustAcceleration:175, strafeAcceleration:125, angularAcceleration:2.9, maxAngularVelocity:2.1, angularDamping:1.5, damage:14, range:820, scanRange:250, mining:1} },
  { id:'quill', name:'Quill', subtitle:'Dispatch runner', description:'Four berths behind a needle-nosed courier bridge. Efficient fold coils and a sustained overdrive favor delivery runs; its narrow frame leaves little room for armor or freight.', berths:4, cost:1320, ore:22, requires:['fold_1'], conditions:{flags:['first_fold_done']},
    stats:{mass:1.8, radius:29, renderLength:110, renderWidth:58, maxHull:145, maxShield:55, maxEnergy:135, maxFuel:56, cargoCap:30, speed:285, thrustAcceleration:215, strafeAcceleration:145, angularAcceleration:2.8, maxAngularVelocity:2.1, angularDamping:1.45, damage:18, range:920, scanRange:330, mining:.9} },
  { id:'mender', name:'Mender', subtitle:'Rescue ambulance', description:'Five berths and a real treatment ward sit across a narrow flight and engineering spine. Rapid triage treats injured crew and rescued passengers, while modest guns make protection a separate concern.', berths:5, cost:1880, ore:26, requires:['fold_1'], conditions:{flags:['first_fold_done']},
    stats:{mass:3.4, radius:39, renderLength:126, renderWidth:76, maxHull:210, maxShield:65, maxEnergy:170, maxFuel:48, cargoCap:48, speed:230, thrustAcceleration:145, strafeAcceleration:105, angularAcceleration:1.9, maxAngularVelocity:1.5, angularDamping:1.3, damage:16, range:880, scanRange:340, mining:1} },
  { id:'bulwark', name:'Bulwark', subtitle:'Patrol gunship', description:'Eight berths surround an armored central magazine. Three pulse mounts and an early-recovering shield grid hold a patrol line; the heavy weapons drain charge and leave a small cargo hold.', berths:8, cost:3600, ore:44, requires:['fold_2'], conditions:{flags:['archive_decoded']},
    stats:{mass:7.4, radius:48, renderLength:166, renderWidth:100, maxHull:360, maxShield:155, maxEnergy:185, maxFuel:44, cargoCap:46, speed:205, thrustAcceleration:100, strafeAcceleration:65, angularAcceleration:1.05, maxAngularVelocity:.95, angularDamping:1.1, damage:33, range:1120, scanRange:300, mining:.8} },
  { id:'cairn', name:'Cairn', subtitle:'Bulk mining barge', description:'Ten berths occupy a service deck between two enormous ore holds. Deep-reach cutters and heavy salvage tractors support a full mining crew; a loaded barge turns slowly and cannot outrun a raider.', berths:10, cost:5800, ore:60, requires:['fold_2'], conditions:{flags:['archive_decoded']},
    stats:{mass:12, radius:68, renderLength:188, renderWidth:136, maxHull:490, maxShield:95, maxEnergy:250, maxFuel:64, cargoCap:240, speed:145, thrustAcceleration:56, strafeAcceleration:34, angularAcceleration:.58, maxAngularVelocity:.65, angularDamping:.8, damage:22, range:850, scanRange:320, mining:2.8} },
  { id:'lark', name:'Lark', subtitle:'Cooperative launch', description:'Four bunks, a shared chart table, and a little workshop make room for a first crew. Efficient service tools stretch its modest reactor; light plating and a single pulse mount still demand care.', berths:4, cost:920, ore:14, crewLaunchMinPlayers:2,
    stats:{mass:2.6, radius:29, renderLength:92, renderWidth:58, maxHull:140, maxShield:35, maxEnergy:110, maxFuel:32, cargoCap:30, speed:220, thrustAcceleration:150, strafeAcceleration:105, angularAcceleration:2.5, maxAngularVelocity:1.7, angularDamping:1.35, damage:14, range:820, scanRange:250, mining:1.1} },
  { id:'puffin', name:'Puffin', subtitle:'Working transport', description:'Seven berths sit behind a glazed passenger saloon and a practical freight bay. A steady cabin generator and a modest infirmary support working passages; the broad transport is slow and lightly shielded.', berths:7, cost:1520, ore:22, crewLaunchMinPlayers:4,
    stats:{mass:4.3, radius:40, renderLength:124, renderWidth:78, maxHull:175, maxShield:40, maxEnergy:135, maxFuel:40, cargoCap:52, speed:190, thrustAcceleration:112, strafeAcceleration:72, angularAcceleration:1.55, maxAngularVelocity:1.2, angularDamping:1.2, damage:15, range:820, scanRange:265, mining:1} },
  { id:'osprey', name:'Osprey', subtitle:'Expedition launch', description:'Ten berths, a central workroom, and separate medical and engineering stations give a larger beginning crew useful space. Field maintenance keeps ordinary equipment serviceable; this is a roomy launch with a modest gun, not a warship.', berths:10, cost:2260, ore:32, crewLaunchMinPlayers:7,
    stats:{mass:7.1, radius:49, renderLength:166, renderWidth:94, maxHull:230, maxShield:55, maxEnergy:150, maxFuel:46, cargoCap:68, speed:180, thrustAcceleration:90, strafeAcceleration:56, angularAcceleration:1.05, maxAngularVelocity:.9, angularDamping:1.05, damage:16, range:860, scanRange:285, mining:1.1} },
  { id:'leviathan', name:'Leviathan', subtitle:'Heavy support tender', description:'Sixteen berths, a field infirmary, deep salvage gear, and a full repair hall travel between two immense working booms. It can sustain a roaming crew and carry an expedition’s stores, but its mass and broad silhouette make an escort sensible.', berths:16, cost:11200, ore:110, requiresClass:'atlas', requires:['fold_3'], conditions:{flags:['ally_chosen']},
    stats:{mass:22, radius:94, renderLength:330, renderWidth:176, maxHull:780, maxShield:160, maxEnergy:320, maxFuel:100, cargoCap:320, speed:125, thrustAcceleration:42, strafeAcceleration:28, angularAcceleration:.4, maxAngularVelocity:.43, angularDamping:.7, damage:28, range:1100, scanRange:380, mining:3.3} },
  { id:'judicator', name:'Judicator', subtitle:'Line destroyer', description:'A monumental armored wedge carries twenty-four berths, a raised command bridge, paired battery galleries, and a recessed engine bank. Four widely separated pulses cover a heavy ship’s approach; immense inertia, high volley cost, and a small hold limit independent work.', berths:24, cost:19500, ore:120, requiresClass:'capital', requires:['fold_3'], conditions:{flags:['ally_chosen']},
    stats:{mass:44, radius:145, renderLength:500, renderWidth:280, maxHull:1250, maxShield:360, maxEnergy:400, maxFuel:110, cargoCap:125, speed:115, thrustAcceleration:30, strafeAcceleration:16, angularAcceleration:.22, maxAngularVelocity:.28, angularDamping:.58, damage:64, range:1600, scanRange:450, mining:.7} }
].map(c => Object.freeze({...c, systems:getHullSystems(c.id), stats:Object.freeze(c.stats)})));

/** Public new-captain choices; later hulls are never included in this catalog. */
export const STARTER_SHIP_IDS = Object.freeze(['sparrow','kestrel','mule']);
export const STARTER_SHIPS = Object.freeze(STARTER_SHIP_IDS.map(id => SHIP_CLASSES.find(hull => hull.id === id)));
export const normalizeStarterShip = id => STARTER_SHIP_IDS.includes(id) ? id : 'sparrow';

export const CREW_ROLES = Object.freeze({
  engineer:{name:'Engineer',cost:160,health:100,damage:9,description:'Adds 10 hull integrity and can repair ship systems.',color:'#d8b878'},
  navigator:{name:'Navigator',cost:140,health:90,damage:7,description:'Extends scanner range by 45 metres.',color:'#88bbb7'},
  medic:{name:'Medic',cost:150,health:100,damage:7,description:'Adds 10 reactor capacity and treats injured crew during boarding.',color:'#acb8d6'},
  gunner:{name:'Gunner',cost:210,health:110,damage:12,description:'Adds 3 pulse damage and supports the defense of your ship.',color:'#e5b17a'},
  security:{name:'Security officer',cost:230,health:140,damage:16,description:'A trained defender with stronger armor and boarding weapons.',color:'#c1a3da'},
  scientist:{name:'Scientist',cost:180,health:90,damage:7,description:'Adds 30 scanner range and improves mining yield speed by 10%.',color:'#8dcab6'},
  quartermaster:{name:'Quartermaster',cost:175,health:105,damage:9,description:'Adds 8 cargo spaces and keeps boarding supplies organized.',color:'#d1c191'}
});

export const STATION_ROLES = Object.freeze(['helm','weapons','engineering','scanner','navigation','medical','security','passenger']);
export const getShipClass = id => SHIP_CLASSES.find(c => c.id === id) || SHIP_CLASSES[0];

/** One hull class controls exterior scale, collision size and its boarding deck. */
export function enemyHullProfile(classId='sparrow') {
  const hull=getShipClass(classId),stats=hull.stats;
  return {classId:hull.id,interiorClassId:hull.id,berths:hull.berths,radius:stats.radius,renderLength:stats.renderLength,renderWidth:stats.renderWidth,boardable:hull.berths>=3};
}

/** A captured hull keeps its damage fraction when entering normal vessel physics. */
export function enemyShipState(enemy, vesselId=enemy?.id) {
  const hull=getShipClass(enemy?.classId),stats=hull.stats;
  const maximum=Math.max(1,number(enemy?.maxHp,stats.maxHull)),fraction=clamp(number(enemy?.hp,maximum)/maximum,0,1);
  const id=String(vesselId||enemy?.id||'captured-vessel'),actors=enemy?.deck?.enemies||[];
  // The occupied hull retains its passengers. A later boarding action may have
  // wounded or killed its hijackers, so use the persistent deck's identities.
  const rescueGroups=JSON.parse(JSON.stringify(Array.isArray(enemy?.rescueGroups)?enemy.rescueGroups:[])).map(group=>{
    group.shipId=id;
    for(const member of group.members||[]){
      const actor=actors.find(actor=>actor.rescueGuestId===member.id||actor.id===member.id);if(!actor)continue;
      member.health=clamp(number(actor.health),0,number(member.maxHealth,68));member.x=number(actor.x,member.x);member.y=number(actor.y,member.y);member.status=member.health>0?'hostile':'dead';
    }
    if(group.pirates&&['hostile','hijacked'].includes(group.status)&&!(group.members||[]).some(member=>member.health>0))group.status='defeated';
    return group;
  });
  const rescueHistory=JSON.parse(JSON.stringify(Array.isArray(enemy?.rescueHistory)?enemy.rescueHistory:[]));
  return {...stats,...enemyHullProfile(hull.id),id,name:String(enemy?.name||hull.name),humanOccupants:1,rescueGroups,rescueHistory,damageControl:enemy?.damageControl?JSON.parse(JSON.stringify(enemy.damageControl)):undefined,
    x:number(enemy?.x),y:number(enemy?.y),vx:number(enemy?.vx),vy:number(enemy?.vy),angle:number(enemy?.angle),angularVelocity:0,
    hull:stats.maxHull*fraction,shield:0,energy:clamp(number(enemy?.energy,Math.min(30,stats.maxEnergy)),0,stats.maxEnergy),fuel:Math.min(10,stats.maxFuel),turn:stats.angularAcceleration,warpRange:0,
    captured:true,capturedFromId:enemy?.id,disabled:!!enemy?.disabled};
}

/** Input is expressed in the ship's own frame. Negative thrust applies the brakes. */
export function normaliseFlightInput(input = {}) {
  const thrust = clamp(number(input.thrust, -number(input.y)), -1, 1);
  return {
    thrust:thrust||0, strafe:clamp(number(input.strafe, number(input.x)), -1, 1),
    turn:clamp(number(input.turn), -1, 1), brake:clamp(input.brake === true ? 1 : number(input.brake),0,1),
    boost:!!input.boost, fire:!!input.fire, mine:!!input.mine, flightAssist:input.flightAssist !== false
  };
}

/**
 * Pure physics used by the authoritative server and browser prediction.
 * Heading is never derived from velocity, aim coordinates, or translational input.
 * A small bounded integration interval keeps 20/30/60/120 Hz trajectories consistent.
 * Resource costs and weapon effects remain Game rules, outside this function.
 */
export function advanceShip(ship, delta, input = {}, options = {}) {
  const next = {...ship};
  const dt = clamp(number(delta),0,.25);
  if (!dt) return next;
  const c=getShipClass(ship.classId), stats=c.stats, controls=normaliseFlightInput(input);
  for (const k of ['x','y','vx','vy','angle','angularVelocity']) next[k]=number(ship[k]);
  const thrust=number(ship.thrustAcceleration,stats.thrustAcceleration);
  const lateral=number(ship.strafeAcceleration,stats.strafeAcceleration);
  const angularAcceleration=number(ship.angularAcceleration,number(ship.turn,stats.angularAcceleration));
  const angularLimit=number(ship.maxAngularVelocity,stats.maxAngularVelocity);
  const baseDamping=number(ship.angularDamping,stats.angularDamping);
  const boost=controls.boost && controls.thrust>0 && number(ship.energy,100)>8;
  const cruiseSpeed=number(ship.speed,stats.speed),maxSpeed=cruiseSpeed*1.65;
  const radius=number(options.worldRadius,2700);
  const count=Math.max(1,Math.ceil(dt/(1/240))),h=dt/count;
  const brake=Math.max(controls.brake,Math.max(0,-controls.thrust));
  const propulsion=Math.max(0,controls.thrust)*(boost?getHullSystems(ship.classId).boostMultiplier:1);
  const damping=brake*(4.8/Math.sqrt(stats.mass))+(controls.flightAssist?((propulsion||controls.strafe)?.36:1.2):.018);
  const angularDamping=baseDamping*(controls.flightAssist?1:.2)+(controls.brake?2.4:0);
  for(let i=0;i<count;i++) {
    const oldOmega=next.angularVelocity;
    const decay=Math.exp(-angularDamping*h);
    const torque=controls.turn*angularAcceleration;
    next.angularVelocity=clamp(oldOmega*decay+torque*(1-decay)/angularDamping,-angularLimit,angularLimit);
    const turnStep=(oldOmega+next.angularVelocity)*.5*h;
    const facing=next.angle+turnStep*.5;
    let ax=Math.cos(facing)*thrust*propulsion-Math.sin(facing)*lateral*controls.strafe;
    let ay=Math.sin(facing)*thrust*propulsion+Math.cos(facing)*lateral*controls.strafe;
    const speed2=next.vx*next.vx+next.vy*next.vy;
    // Cruise thrust cannot add speed above its rating, but ending a boost never
    // discards existing momentum. Drag or the brake brings that speed back down.
    if(!boost&&speed2>cruiseSpeed*cruiseSpeed){const outward=(ax*next.vx+ay*next.vy)/speed2;if(outward>0){ax-=next.vx*outward;ay-=next.vy*outward;}}
    const oldVX=next.vx,oldVY=next.vy,linearDecay=Math.exp(-damping*h);
    next.vx=oldVX*linearDecay+ax*(1-linearDecay)/damping;
    next.vy=oldVY*linearDecay+ay*(1-linearDecay)/damping;
    const speed=Math.hypot(next.vx,next.vy);
    if(speed>maxSpeed){next.vx*=maxSpeed/speed;next.vy*=maxSpeed/speed;}
    next.x+=(oldVX+next.vx)*.5*h;next.y+=(oldVY+next.vy)*.5*h;
    next.angle+=turnStep;
    if(Number.isFinite(radius)) {
      if(Math.abs(next.x)>radius){next.x=clamp(next.x,-radius,radius);next.vx=0;}
      if(Math.abs(next.y)>radius){next.y=clamp(next.y,-radius,radius);next.vy=0;}
    }
  }
  // Keep angles numerically stable after long persistent voyages.
  next.angle=Math.atan2(Math.sin(next.angle),Math.cos(next.angle));
  return next;
}
