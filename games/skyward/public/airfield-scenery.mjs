// Shared, deliberately small airfield scenes. Coordinates are runway-local:
// +Z follows its heading and +X is the apron side. These are visual fittings;
// the existing terrain/deck surface and carrier island remain the colliders.
import {terrainHeight,runwayCoordinates,carrierLaunchLane} from './terrain.mjs';
import {basis,orientationOf} from './orientation.mjs';

const n=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
export const AIRFIELD_BUDGET=Object.freeze({parts:140,lights:176,windsockSegments:5,approachBars:7});
export const AIRFIELD_COLORS=Object.freeze({wall:'#879487',roof:'#657b72',door:'#344e4a',glass:'#466b73',trim:'#bec4af',concrete:'#9c9e89',tarmac:'#646e67',yellow:'#d5b965',cargo:'#7a795b',fuel:'#9caa9f',orange:'#d77c4d',white:'#eee4c8',green:'#a8e5ba',red:'#ef8870',blue:'#8bb9d1'});

export function airfieldPoint(runway,x,y,z){
  const h=n(runway.heading),c=Math.cos(h),s=Math.sin(h);
  return {x:n(runway.x)+x*c+z*s,y:n(runway.y,12)+y,z:n(runway.z)+z*c-x*s};
}

function groundAt(runway,mission,x,z,width=0,depth=0){
  let highest=-Infinity;
  for(const [dx,dz] of [[0,0],[-width/2,-depth/2],[width/2,-depth/2],[-width/2,depth/2],[width/2,depth/2]]){
    const p=airfieldPoint(runway,x+dx,0,z+dz);
    highest=Math.max(highest,terrainHeight(p.x,p.z,mission));
  }
  return Math.max(n(runway.y,12),highest)-n(runway.y,12);
}

export function describeAirfield(runway,mission={}){
  const carrier=!!runway.carrier,w=clamp(n(runway.width,carrier?40:48),18,160),l=clamp(n(runway.length,carrier?310:1100),180,3000);
  const profile=carrier?'carrier':['avro504','camel'].includes(mission.aircraft)?'grass':['spitfire','b17','c47','hellcat'].includes(mission.aircraft)||l<1400?'regional':'airbase';
  const parts=[],lights=[],add=(id,x,y,z,width,height,depth,color='wall',kind='box')=>parts.push({id,kind,position:[x,y,z],size:[width,height,depth],color});
  const lamp=(x,y,z,color='white',radius=.75)=>lights.push({position:[x,y,z],color,radius});
  let windsock=null;
  if(!carrier){
    const modern=profile==='airbase',simple=profile==='grass',hw=simple?34:modern?58:46,hd=simple?40:modern?62:46,hh=simple?10:modern?19:14;
    const count=simple?1:modern?3:2,hx=w/2+hw/2+31;
    for(let i=0;i<count;i++){
      const z=-l*.26+i*(hd+19),base=groundAt(runway,mission,hx,z,hw+8,hd+8);
      add(`hangar-${i}-pad`,hx,base-.35,z,hw+8,.7,hd+8,'concrete');
      add(`hangar-${i}`,hx,base+hh/2,z,hw,hh,hd);
      add(`hangar-${i}-roof`,hx,base+hh,z,hw+3,simple?5:7,hd+3,'roof','roof');
      add(`hangar-${i}-doors`,hx-hw/2-.16,base+hh*.44,z,.28,hh*.82,hd*.76,'door');
      for(const dz of[-hd*.2,0,hd*.2])add(`hangar-${i}-rib-${dz}`,hx-hw/2-.32,base+hh*.44,z+dz,.16,hh*.8,.35,'trim');
      for(const dz of[-hd*.39,hd*.39])add(`hangar-${i}-window-${dz}`,hx-hw/2-.34,base+hh*.83,z+dz,.2,1.2,3.6,'glass');
    }
    const tx=-w/2-42,tz=-l*.23,th=simple?7:modern?25:16,tb=groundAt(runway,mission,tx,tz,20,20);
    add('tower-base',tx,tb-.4,tz,23,.8,24,'concrete');
    add('tower-shaft',tx,tb+th/2,tz,simple?9:11,th,simple?10:12,'trim');
    add('tower-cabin',tx,tb+th+1.8,tz,simple?13:18,3.6,simple?13:18,'glass');
    add('tower-roof',tx,tb+th+4,tz,simple?15:20,.8,simple?15:20,'roof');
    add('tower-mast',tx,tb+th+7.8,tz,.4,7,.4,'trim');lamp(tx,tb+th+11.4,tz,'red',.6);
    if(!simple){
      const ox=hx+hw/2+21,oz=-l*.26,ob=groundAt(runway,mission,ox,oz,20,66);
      add('stores-pad',ox,ob-.25,oz,27,.5,70,'concrete');
      for(let i=0;i<3;i++){
        add(`fuel-${i}`,ox,ob+3.5,oz-23+i*15,13,7,10,'fuel');
        add(`fuel-${i}-band`,ox,ob+7.1,oz-23+i*15,13.3,.7,10.3,'roof');
      }
      const sx=w*.83,sz=-l*.17;
      for(const sign of[-1,1])add(`service-edge-${sign}`,sx+sign*w*.13,.25,sz,.7,.14,31,'yellow');
      add('service-crossbar',sx,.25,sz+15.5,w*.26,.14,.7,'yellow');
      add('service-stop',sx,.25,sz-15.5,w*.26,.14,.7,'yellow');
      // One service vehicle gives scale without another animated actor.
      const vx=hx-hw*.3,vz=-l*.26-hd/2-14,vb=groundAt(runway,mission,vx,vz,5,10);
      add('truck-chassis',vx,vb+1.2,vz,3.2,1,7.5,'door');add('truck-tank',vx,vb+2.5,vz-1.2,3.1,2.1,4.5,'fuel');
      add('truck-cab',vx,vb+2.5,vz+2.4,3.2,2.4,2.3,'cargo');add('truck-glass',vx,vb+2.8,vz+3.58,2.6,.9,.14,'glass');
      for(const z of[-l*.32,-l*.06]){const x=w/2+20,b=groundAt(runway,mission,x,z);add(`apron-pole-${z}`,x,b+5,z,.45,10,.45,'trim');lamp(x,b+10.4,z,'white',1.2);}
    }
    const wx=-w/2-19,wz=l*.24,wy=groundAt(runway,mission,wx,wz),pole=simple?10:16;
    add('windsock-pole',wx,wy+pole/2,wz,.4,pole,.4,'trim');
    windsock={x:wx,y:wy+pole,z:wz,length:7.2,radius:1.15};
  }else{
    // Painted deck tie-downs and a landing lane do not add collision obstacles.
    const lane=carrierLaunchLane(runway);
    for(let z=-l*.36;z<l*.36;z+=27)for(const x of[-w*.39,w*.1]){
      add(`tie-${x}-${z}-x`,x,.28,z,1.1,.06,.18,'trim');add(`tie-${x}-${z}-z`,x,.28,z,.18,.06,1.1,'trim');
    }
    for(const side of[-1,1])add(`landing-edge-${side}`,lane+side*w*.23,.29,-l*.18,.35,.06,l*.42,'yellow');
  }
  // Bounded fixtures: emissive geometry, not a point light per lamp.
  const step=carrier?18:Math.max(55,l/32);
  for(let z=-l/2;z<=l/2+.1;z+=step)for(const side of[-1,1])lamp(side*(w/2+(carrier?-.8:3)),carrier?.55:.8,z,'white',carrier?.65:.8);
  for(const end of[-1,1]){
    for(let i=-3;i<=3;i++)lamp(i*w*.115,.65,end*(l/2-2),'green',carrier?.7:1);
    if(!carrier)for(let i=1;i<=5;i++){
      const z=end*(l/2+i*34),p=airfieldPoint(runway,0,0,z),ground=terrainHeight(p.x,p.z,mission),base=ground-n(runway.y,12);
      if(ground<0)continue;
      for(const x of[-4,0,4])lamp(x,base+.65,z,'white',.8);
    }
  }
  return {profile,parts:parts.slice(0,AIRFIELD_BUDGET.parts),lights:lights.slice(0,AIRFIELD_BUDGET.lights),windsock};
}

export function roofTriangles(part){
  const [x,y,z]=part.position,[w,h,d]=part.size,points=[[x-w/2,y,z-d/2],[x+w/2,y,z-d/2],[x,y+h,z-d/2],[x-w/2,y,z+d/2],[x+w/2,y,z+d/2],[x,y+h,z+d/2]];
  return [[0,2,1],[3,4,5],[0,5,2],[0,3,5],[2,4,1],[2,5,4]].map(ids=>ids.map(i=>points[i]));
}

/** The cloth points downstream, in the actual world wind, even on a rotated strip. */
export function windsockSegments(runway,sock,weather={},time=0,reducedMotion=false){
  if(!sock)return [];
  const wind=weather.wind||{},wx=typeof wind==='number'?wind:n(wind.x),wz=typeof wind==='number'?0:n(wind.z),speed=Math.hypot(wx,wz);
  const h=n(runway.heading),localX=wx*Math.cos(h)-wz*Math.sin(h),localZ=wx*Math.sin(h)+wz*Math.cos(h);
  const extension=clamp(speed/7,0,1),direction=speed>.01?{x:localX/speed,z:localZ/speed}:{x:1,z:0};
  const result=[];let from=[sock.x,sock.y,sock.z];
  for(let i=0;i<AIRFIELD_BUDGET.windsockSegments;i++){
    const t=(i+1)/AIRFIELD_BUDGET.windsockSegments,flutter=reducedMotion?0:Math.sin(time*2.4-i*.8)*.08*extension;
    const to=[sock.x+direction.x*sock.length*t*extension+direction.z*flutter,sock.y-sock.length*t*(1-extension)*.64-t*.45,sock.z+direction.z*sock.length*t*extension-direction.x*flutter];
    result.push({from,to,radiusFrom:sock.radius*(1-i*.15),radiusTo:sock.radius*(1-(i+1)*.15),color:i%2?'white':'orange'});from=to;
  }
  return result;
}

/** Optional destination cue stays on the ground and never substitutes for terrain clearance. */
export function landingApproach(sim,mission=sim?.mission,settings={}){
  if(!sim?.player||!mission||settings.guidance==='minimal'||settings.gates===false||sim.player.onGround||sim.status&&sim.status!=='flying')return null;
  const runways=mission.runways||[],nav=sim.navigationTarget;
  const freeApproach=mission.kind==='free'&&!sim.multiplayer&&Number.isInteger(nav?.runwayIndex);
  if(!freeApproach&&!/landing|arrival|recover|return/.test(sim.phase||''))return null;
  let index=Number.isInteger(nav?.runwayIndex)?nav.runwayIndex:Number.isInteger(mission.goal?.destinationRunway)?mission.goal.destinationRunway:-1;
  if(index<0&&nav){let closest=Infinity;runways.forEach((r,i)=>{const d=Math.hypot(r.x-nav.x,r.z-nav.z);if(d<closest&&d<400){closest=d;index=i;}});}
  const runway=runways[index];if(!runway)return null;
  const q=runwayCoordinates(sim.player.x,sim.player.z,runway),length=n(runway.length,1100),width=n(runway.width,48),end=runway.carrier?-1:q.along>0?1:-1;
  const distance=Math.hypot(q.across,q.along);if(distance>6500)return null;
  if(freeApproach){
    const beyond=end*q.along-length/2,above=sim.player.y-n(runway.y,12);
    const forward=basis(orientationOf(sim.player)).forward,horizontal=Math.hypot(forward.x,forward.z);
    const alignment=horizontal>.01?-(forward.x*Math.sin(n(runway.heading))+forward.z*Math.cos(n(runway.heading)))*end/horizontal:0;
    // A nearby field alone is not an approach: require a low, inbound aircraft
    // outside the threshold, with room to line up along the selected runway.
    if(beyond<24||beyond>3000||Math.abs(q.across)>width*1.5+beyond*.12||above<3||above>Math.min(600,180+beyond*.2)||alignment<Math.cos(Math.PI/6))return null;
  }
  const lane=runway.carrier?carrierLaunchLane(runway):0,bars=[];
  for(let i=0;i<AIRFIELD_BUDGET.approachBars;i++){
    const z=runway.carrier?-length*.45+i*length*.055:end*(length/2+24+i*42),p=airfieldPoint(runway,lane,0,z);
    // Deck cues stay on the real deck, never inventing a landing surface over water.
    const y=runway.carrier?n(runway.y,28)+.4:Math.max(0,terrainHeight(p.x,p.z,mission))+.45;
    bars.push({x:p.x,y,z:p.z,width:Math.min(width*.45,28),length:1.4,heading:n(runway.heading),color:'#c6dfb8'});
  }
  return {runway,index,end,bars};
}
