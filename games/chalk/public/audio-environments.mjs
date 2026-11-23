// Deliberately bounded acoustic approximation: two reusable response kernels,
// with sends/returns selected from the actual source, listener and wall geometry.
import { buildingAt, getSolidWalls } from './building-geometry.mjs';

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const inside = (r, p) => p.x >= r.x && p.y >= r.y && p.x <= r.x+r.w && p.y <= r.y+r.h;
const rectDistance = (r, p) => Math.hypot(Math.max(r.x-p.x,0,p.x-r.x-r.w),Math.max(r.y-p.y,0,p.y-r.y-r.h));

export const REVERB_PROFILES = Object.freeze({
  room: { seconds: .78, onset: .009, decay: 7.6, noise: 3.7,
    taps: [[.012,.52],[.023,.39],[.038,.28],[.061,.18],[.089,.12]] },
  street: { seconds: 1.22, onset: .065, decay: 4.7, noise: 1.35,
    taps: [[.083,.43],[.147,.31],[.238,.22],[.366,.13],[.521,.07]] },
});

/** Game-designed impulse responses, not sampled measurements of a real room. */
export function reverbImpulseData(sampleRate, kind) {
  const p = REVERB_PROFILES[kind] || REVERB_PROFILES.street;
  const rate = Math.max(8000, Number(sampleRate) || 44100), length = Math.ceil(rate*p.seconds);
  return [0,1].map(channel => {
    const data = new Float32Array(length); let seed = (kind==='room'?4171:9917)+channel*7919, color=0;
    for (let i=0;i<length;i++) {
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const noise=seed/4294967296*2-1, t=i/rate;
      color=color*.38+noise*.62;
      if(t>=p.onset) data[i]=color*p.noise/Math.sqrt(rate)*Math.exp(-(t-p.onset)*p.decay);
    }
    for(let k=0;k<p.taps.length;k++) {
      const [time,level]=p.taps[k], offset=channel*(kind==='room'?.0018:.008)*(k%2?-.6:1);
      const i=Math.round((time+offset)*rate);
      data[i]+=level;
      // Short, darkening reflections retain the report's identity without
      // repeating a complete recording of another shot.
      data[i+1]+=level*.24; data[i+2]+=level*.09;
    }
    return data;
  });
}

export function acousticLineBlocked(world, a, b) {
  if(!world || !Number.isFinite(a?.x) || !Number.isFinite(b?.x) || Math.hypot(a.x-b.x,a.y-b.y)<2) return false;
  // Legacy/custom worlds expose solid footprints rather than interior walls.
  if(!Array.isArray(world.walls) && buildingAt(world,a)===buildingAt(world,b) && buildingAt(world,a)) return false;
  const dx=b.x-a.x,dy=b.y-a.y;
  return getSolidWalls(world).some(r=>{
    if(Math.max(a.x,b.x)<r.x||Math.min(a.x,b.x)>r.x+r.w||Math.max(a.y,b.y)<r.y||Math.min(a.y,b.y)>r.y+r.h)return false;
    let lo=0,hi=1;
    for(const [p,q] of [[-dx,a.x-r.x],[dx,r.x+r.w-a.x],[-dy,a.y-r.y],[dy,r.y+r.h-a.y]]) {
      if(Math.abs(p)<1e-8){if(q<0)return false;}
      else {const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return false;}
    }
    return hi>=0&&lo<=1;
  });
}

function openings(building) {
  return [...(building.doors||[]),...(building.breaches||[])];
}

export function environmentAt(world, point) {
  const house=buildingAt(world,point), structures=world?.buildings||[];
  let enclosure=0, nearby=0, nearest=Infinity;
  for(const b of structures) {const d=rectDistance(b,point);if(d<360)nearby++;nearest=Math.min(nearest,d);}
  if(house) {
    let doorway=Infinity;
    for(const portal of openings(house)) if(Number.isFinite(portal.x)&&Number.isFinite(portal.y))doorway=Math.min(doorway,Math.hypot(point.x-portal.x,point.y-portal.y));
    enclosure=clamp(doorway/48,.3,1)*(1-Math.min(.28,(house.breaches?.length||0)*.12));
  } else {
    // A small amount of room spill just outside an open threshold makes the
    // transition gradual; solid exterior walls do not create this spill.
    for(const b of structures) {
      if(rectDistance(b,point)>40)continue;
      for(const portal of openings(b)) {
        if(!Number.isFinite(portal.x)||!Number.isFinite(portal.y))continue;
        const d=Math.hypot(point.x-portal.x,point.y-portal.y);
        if(d<40)enclosure=Math.max(enclosure,.3*(1-d/40));
      }
    }
  }
  const room=house?.rooms?.find(r=>inside(r,point))||house?.interior||house;
  const size=room?clamp(Math.sqrt(room.w*room.h)/180,.55,1.2):1;
  const streetDensity=clamp(nearby/5,0,1)*clamp(1-nearest/480,0,1);
  return { kind:house?'room':streetDensity>.25?'street':'open',houseId:house?.id||null,enclosure,streetDensity,
    roomReturn:(.12+.65*enclosure)*size,streetReturn:(.12+.48*streetDensity)*(1-.7*enclosure),
    roomCutoff:clamp(4100-size*1100,2500,3600),streetCutoff:2100+streetDensity*700 };
}

export function eventEnvironment(world, source, listener) {
  const a=environmentAt(world,source),b=environmentAt(world,listener),blocked=acousticLineBlocked(world,source,listener);
  return { room:clamp(a.enclosure+(1-a.enclosure)*b.enclosure*.2,0,1),
    street:clamp((1-a.enclosure*.8)*(1-b.enclosure*.45),.08,1),
    occluded:blocked,sourceKind:a.kind,listenerKind:b.kind };
}
