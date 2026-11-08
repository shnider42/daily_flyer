/** Shared, DOM-free vessel definitions and deterministic flight integration. */
export { cabinLayout, isCabinWalkable } from './interior-layouts.mjs';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const number = (n, fallback = 0) => Number.isFinite(Number(n)) ? Number(n) : fallback;

export const SHIP_CLASSES = Object.freeze([
  { id:'sparrow', name:'Sparrow', subtitle:'Utility cutter', description:'A nimble, four-berth working ship. Every station is a few steps from the helm.', berths:4, cost:0, ore:0,
    stats:{mass:1, radius:21, renderLength:64, renderWidth:42, maxHull:100, maxShield:35, maxEnergy:100, maxFuel:30, cargoCap:24, speed:255, thrustAcceleration:230, strafeAcceleration:165, angularAcceleration:4.6, maxAngularVelocity:2.6, angularDamping:1.65, damage:16, range:850, scanRange:235, mining:1} },
  { id:'hauler', name:'Wayfarer', subtitle:'Long-haul freighter', description:'Six berths, a broad cargo spine, and heavy cargo engines. Its mass takes patience to turn.', berths:6, cost:1150, ore:20, requiresClass:'sparrow', requires:['fold_1'], conditions:{flags:['first_fold_done']},
    stats:{mass:3.2, radius:33, renderLength:104, renderWidth:66, maxHull:190, maxShield:60, maxEnergy:120, maxFuel:44, cargoCap:64, speed:205, thrustAcceleration:135, strafeAcceleration:85, angularAcceleration:1.9, maxAngularVelocity:1.5, angularDamping:1.25, damage:20, range:900, scanRange:270, mining:1.3} },
  { id:'frigate', name:'Peregrine', subtitle:'Expedition frigate', description:'Eight berths around a protected operations deck. Built for long expeditions and boarding defense.', berths:8, cost:2900, ore:38, requiresClass:'hauler', requires:['fold_2'], conditions:{flags:['archive_decoded']},
    stats:{mass:5.8, radius:40, renderLength:154, renderWidth:72, maxHull:310, maxShield:105, maxEnergy:155, maxFuel:58, cargoCap:84, speed:225, thrustAcceleration:115, strafeAcceleration:72, angularAcceleration:1.25, maxAngularVelocity:1.1, angularDamping:1.05, damage:27, range:1000, scanRange:310, mining:1.5} },
  { id:'capital', name:'Horizon', subtitle:'Expedition carrier', description:'Ten berths, separate engineering and medical wings, and room for a full human crew. An immense ship carries immense momentum.', berths:10, cost:6400, ore:60, requiresClass:'frigate', requires:['fold_3'], conditions:{flags:['ally_chosen']},
    stats:{mass:13, radius:68, renderLength:260, renderWidth:128, maxHull:560, maxShield:180, maxEnergy:210, maxFuel:80, cargoCap:150, speed:185, thrustAcceleration:68, strafeAcceleration:42, angularAcceleration:.62, maxAngularVelocity:.65, angularDamping:.8, damage:36, range:1200, scanRange:360, mining:1.8} }
].map(c => Object.freeze({...c, stats:Object.freeze(c.stats)})));

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
export function enemyShipState(enemy) {
  const hull=getShipClass(enemy?.classId),stats=hull.stats;
  const maximum=Math.max(1,number(enemy?.maxHp,stats.maxHull)),fraction=clamp(number(enemy?.hp,maximum)/maximum,0,1);
  return {...stats,...enemyHullProfile(hull.id),id:String(enemy?.id||'captured-vessel'),name:String(enemy?.name||hull.name),humanOccupants:1,
    x:number(enemy?.x),y:number(enemy?.y),vx:number(enemy?.vx),vy:number(enemy?.vy),angle:number(enemy?.angle),angularVelocity:0,
    hull:stats.maxHull*fraction,shield:0,energy:Math.min(30,stats.maxEnergy),fuel:Math.min(10,stats.maxFuel),turn:stats.angularAcceleration,warpRange:0,
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
  const propulsion=Math.max(0,controls.thrust)*(boost?1.7:1);
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
