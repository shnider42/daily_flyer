// Shared, deliberately small airfield scenes. Coordinates are runway-local:
// +Z follows its heading and +X is the apron side. These are visual fittings;
// the existing terrain/deck surface and carrier island remain the colliders.
import {terrainHeight,runwayCoordinates,carrierLaunchLane} from './terrain.mjs';
import {basis,orientationOf} from './orientation.mjs';
import {isPassengerAirport} from './airfield-layout.mjs';

const n=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
export const AIRFIELD_BUDGET=Object.freeze({parts:140,lights:176,windsockSegments:5,approachBars:7});
export const AIRPORT_BUDGET=Object.freeze({parts:420,lights:208,parkedAircraft:3});
export const AIRFIELD_COLORS=Object.freeze({wall:'#879487',roof:'#657b72',door:'#344e4a',glass:'#466b73',trim:'#bec4af',concrete:'#9c9e89',tarmac:'#646e67',yellow:'#d5b965',cargo:'#7a795b',fuel:'#9caa9f',orange:'#d77c4d',white:'#eee4c8',green:'#a8e5ba',red:'#ef8870',blue:'#8bb9d1',terminal:'#b9b9a9',terminalRoof:'#879997',road:'#4c5755',car:'#677b83',carLight:'#c7c7b6',airline:'#417a91',field:'#89946c',stubble:'#aaa17c',hedge:'#576e52',tree:'#54775d',brick:'#9a8a74'});
export function airfieldSurfaceColor(name,night=false){
  const color=AIRFIELD_COLORS[name]||AIRFIELD_COLORS.wall;if(!night)return color;
  if(name==='glass')return '#759294';
  const factor=['field','stubble','hedge','tree'].includes(name)?.36:['concrete','tarmac','road'].includes(name)?.58:.72;
  return '#'+[1,3,5].map(offset=>Math.round(parseInt(color.slice(offset,offset+2),16)*factor).toString(16).padStart(2,'0')).join('');
}

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
  const carrier=!!runway.carrier,airport=isPassengerAirport(runway),w=clamp(n(runway.width,carrier?40:48),18,180),l=clamp(n(runway.length,carrier?310:1100),180,4200);
  const profile=carrier?'carrier':airport?'airport':['avro504','camel'].includes(mission.aircraft)?'grass':['spitfire','b17','c47','hellcat'].includes(mission.aircraft)||l<1400?'regional':'airbase';
  const parts=[],lights=[],add=(id,x,y,z,width,height,depth,color='wall',kind='box')=>parts.push({id,kind,position:[x,y,z],size:[width,height,depth],color});
  const lamp=(x,y,z,color='white',radius=.75)=>lights.push({position:[x,y,z],color,radius});
  let windsock=null;
  if(airport){
    const scene=passengerAirport(runway,mission);parts.push(...scene.parts);lights.push(...scene.lights);windsock=scene.windsock;
  }else if(!carrier){
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
  const budget=airport?AIRPORT_BUDGET:AIRFIELD_BUDGET;
  return {profile,parts:parts.slice(0,budget.parts),lights:lights.slice(0,budget.lights),windsock};
}

function passengerAirport(runway,mission){
  const w=n(runway.width,140),l=n(runway.length,3000),parts=[],lights=[];
  const add=(id,x,y,z,width,height,depth,color='terminal',kind='box')=>parts.push({id,kind,position:[x,y,z],size:[width,height,depth],color});
  const lamp=(x,y,z,color='white',radius=1)=>lights.push({position:[x,y,z],color,radius});
  const patch=(id,x,z,width,depth,color='concrete',step=150)=>{
    const corners=[[-width/2,-depth/2],[-width/2,depth/2],[width/2,-depth/2],[width/2,depth/2]];
    if(corners.some(([dx,dz])=>{const p=airfieldPoint(runway,x+dx,0,z+dz);return terrainHeight(p.x,p.z,mission)<0;}))return;
    const nx=Math.max(1,Math.ceil(width/step)),nz=Math.max(1,Math.ceil(depth/step)),triangles=[];
    const vertex=(ix,iz)=>{const xx=x-width/2+width*ix/nx,zz=z-depth/2+depth*iz/nz,p=airfieldPoint(runway,xx,0,zz);return [xx,terrainHeight(p.x,p.z,mission)-n(runway.y,12)+.23,zz];};
    for(let iz=0;iz<nz;iz++)for(let ix=0;ix<nx;ix++){const a=vertex(ix,iz),b=vertex(ix,iz+1),c=vertex(ix+1,iz),d=vertex(ix+1,iz+1);triangles.push([a,b,c],[c,b,d]);}
    parts.push({id,kind:'ground',position:[x,.23,z],size:[width,.1,depth],color,triangles});
  };
  const stripe=(id,x,z,width,depth,color='yellow')=>add(id,x,.36,z,width,.08,depth,color);
  const taxi=w/2+100,apronStart=w/2+139,apronEnd=w/2+628,terminal=w/2+696,concourse=w/2+568,road=w/2+814;
  // A visible network: two runway exits join one parallel taxiway, then the
  // gate apron. The runway remains the only surface required by route goals.
  patch('parallel-taxiway',taxi,0,36,l*.78,'tarmac');
  stripe('taxi-center',taxi,0,.7,l*.76);
  for(const sign of[-1,1]){
    const z=sign*l*.27;patch(`runway-exit-${sign}`,w/2+50,z,100,35,'tarmac');stripe(`exit-center-${sign}`,w/2+50,z,100,.7);
    patch(`apron-entrance-${sign}`,(taxi+apronStart)/2,sign*280,apronStart-taxi,38,'tarmac');stripe(`apron-line-${sign}`,(taxi+apronStart)/2,sign*280,apronStart-taxi,.7);
    for(let i=0;i<4;i++)stripe(`hold-${sign}-${i}`,w/2+19+i*2.5,z,.75,23);
  }
  patch('passenger-apron',(apronStart+apronEnd)/2,0,apronEnd-apronStart,750,'concrete');
  // Expansion joints keep the broad pavement readable from a descending aircraft.
  for(let i=0;i<8;i++)stripe(`apron-joint-${i}`,apronStart+(i+.5)*(apronEnd-apronStart)/8,0,.26,746,'trim');
  for(const z of[-300,-200,-100,0,100,200,300])stripe(`apron-row-${z}`,(apronStart+apronEnd)/2,z,apronEnd-apronStart-4,.24,'trim');
  // Low terminal wings and a glazed concourse are laid out as one building,
  // with jet bridges facing three comfortably spaced airliner parking stands.
  add('terminal-main',terminal,9,0,108,18,420);add('terminal-roof',terminal,19,0,116,2,430,'terminalRoof');
  add('terminal-front-glass',terminal+54.2,11.5,0,.4,10,390,'glass');
  add('terminal-airside-glass',terminal-54.2,11,0,.4,9,380,'glass');
  for(const z of[-150,0,150])add(`terminal-roof-lantern-${z}`,terminal,21.7,z,77,3.4,56,'glass');
  add('concourse',concourse,6.5,0,31,13,535);add('concourse-roof',concourse,13.8,0,36,1.6,542,'terminalRoof');
  add('concourse-glass',concourse-15.7,8,0,.4,6.8,520,'glass');
  add('terminal-connector',(terminal+concourse)/2,7,0,terminal-concourse,14,35,'terminal');
  add('connector-roof',(terminal+concourse)/2,14.8,0,terminal-concourse+3,1.5,39,'terminalRoof');
  for(const [i,z] of[-210,-105,0,105,210].entries()){
    const bridge=concourse-39;add(`jetbridge-${i}`,bridge,5.2,z,49,4.4,6.5,'terminalRoof');
    add(`jetbridge-glass-${i}`,bridge,5.5,z-3.28,44,2,.2,'glass');
    add(`jetbridge-foot-${i}`,bridge-17,1.55,z,1.3,3.1,1.3,'door');
    stripe(`stand-${i}`,concourse-86,z,82,.75);
    for(const sign of[-1,1]){stripe(`stand-edge-${i}-${sign}`,concourse-96,z+sign*31,86,.6,'white');stripe(`stand-end-${i}-${sign}`,concourse-138,z+sign*19,.6,24,'white');}
    stripe(`stand-stop-${i}`,concourse-49,z,1,13);
  }
  for(const [i,z] of[-210,0,210].entries())parts.push(...parkedAirlinerParts(concourse-81,0,z,i));
  // A separate maintenance hangar and tower anchor the airport's silhouette.
  const hx=w/2+430,hz=-535;
  add('maintenance-hangar',hx,15,hz,102,30,88);add('maintenance-roof',hx,30,hz,107,10,94,'terminalRoof','roof');
  add('maintenance-door',hx,13,hz+44.2,85,24,.4,'door');
  add('control-shaft',w/2+296,20,480,13,40,17,'terminal');
  add('control-glazing',w/2+296,43,480,28,6,28,'glass');add('control-cap',w/2+296,47,480,32,2,32,'terminalRoof');
  add('control-mast',w/2+296,53,480,.6,10,.6,'trim');lamp(w/2+296,58.3,480,'red',1.1);
  // Landside arrivals curb, bus shelter, access road and a deliberate car park.
  patch('terminal-curb',road-24,0,21,460,'concrete');patch('terminal-road',road,0,26,1040,'road');
  patch('carpark',road+122,0,178,430,'tarmac');patch('carpark-link',road+65,-235,130,20,'road');
  add('arrival-canopy',road-28,7.3,0,22,1.2,310,'terminalRoof');
  for(const z of[-145,-73,0,73,145])add(`canopy-column-${z}`,road-30,3.4,z,.65,6.8,.65,'trim');
  for(let row=0;row<3;row++)for(let col=0;col<8;col++){
    const x=road+58+row*52,z=-178+col*48;stripe(`parking-space-${row}-${col}`,x,z,23,.3,'white');
    if((row+col)%3!==0){add(`parked-car-${row}-${col}`,x+3,1,z+12,3.9,1.8,8.5,col%2?'car':'carLight');add(`car-roof-${row}-${col}`,x+3,2,z+12,3.3,.65,4.5,'glass');}
  }
  for(let i=0;i<9;i++){const z=-455+i*110;stripe(`road-dash-${i}`,road,z,.45,32,'white');}
  // Roads lead into two small blocks, then meet a cross road. These patterns
  // communicate settlement scale from above without a full city simulation.
  const suburb=road+420;
  patch('town-access',(road+suburb)/2,520,suburb-road,23,'road');
  patch('town-spine',suburb,0,22,1130,'road');
  for(const z of[-300,300]){
    patch(`town-cross-${z}`,suburb,z,430,20,'road');
    for(const side of[-1,1])for(let i=0;i<3;i++){
      const x=suburb+side*(62+i*61),zz=z-75;
      const p=airfieldPoint(runway,x,0,zz);if(terrainHeight(p.x,p.z,mission)<2)continue;
      const heights=[[-14,-19],[-14,19],[14,-19],[14,19]].map(([dx,dz])=>{const q=airfieldPoint(runway,x+dx,0,zz+dz);return terrainHeight(q.x,q.z,mission)-n(runway.y,12);});
      const base=Math.max(...heights),foundation=Math.max(1,base-Math.min(...heights)+.5);
      patch(`garden-${z}-${side}-${i}`,x,zz,49,79,'field');
      add(`house-foundation-${z}-${side}-${i}`,x,base-foundation/2,zz,28,foundation,36,'concrete');
      add(`house-${z}-${side}-${i}`,x,base+5,zz,27,10,35,'brick');add(`house-roof-${z}-${side}-${i}`,x,base+10,zz,30,6,39,'roof','roof');
      patch(`drive-${z}-${side}-${i}`,x,zz+38,6,39,'concrete');
    }
  }
  // Fields and hedges on the opposite side give a coherent horizon and optic
  // flow. Dry land is sampled before placement; coast water stays uncovered.
  for(let row=0;row<3;row++)for(let col=0;col<2;col++){
    const x=-w/2-355-col*420,z=-680+row*610;
    patch(`field-${row}-${col}`,x,z,365,525,(row+col)%2?'field':'stubble');
    patch(`field-hedge-${row}-${col}`,x+186,z,5,550,'hedge');
    for(let line=0;line<4;line++)patch(`crop-row-${row}-${col}-${line}`,x-130+line*83,z,2,495,'field');
  }
  for(const x of[taxi-20,taxi+20])for(const z of[-l*.32,-l*.16,0,l*.16,l*.32])lamp(x,.65,z,'blue',.8);
  for(const z of[-340,-170,170,340]){const x=apronStart+30;add(`apron-mast-${z}`,x,10,z,.65,20,.65,'trim');add(`apron-lamp-arm-${z}`,x,20,z,11,.6,.6,'trim');lamp(x-4,20.6,z,'white',1.3);lamp(x+4,20.6,z,'white',1.3);}
  const sock={x:-w/2-28,y:18,z:l*.2,length:7.2,radius:1.15};add('airport-windsock-pole',sock.x,9,sock.z,.4,18,.4,'trim');
  return {parts,lights,windsock:sock};
}

function parkedAirlinerParts(x,y,z,index){
  const groups=new Map(),tri=(color,a,b,c)=>{if(!groups.has(color))groups.set(color,[]);groups.get(color).push([a,b,c]);};
  const quad=(color,a,b,c,d)=>{tri(color,a,b,c);tri(color,a,c,d);};
  const rings=(cx,cy,sections,color='white')=>{
    for(let j=0;j<sections.length-1;j++)for(let k=0;k<8;k++){
      const p=(section,i)=>[cx+Math.cos(i*Math.PI/4)*section[1],cy+Math.sin(i*Math.PI/4)*section[1],section[0]];
      quad(color,p(sections[j],k),p(sections[j],k+1),p(sections[j+1],k+1),p(sections[j+1],k));
    }
    for(const [section,reverse] of [[sections[0],true],[sections.at(-1),false]])for(let k=0;k<8;k++){
      const a=[cx,cy,section[0]],b=[cx+Math.cos(k*Math.PI/4)*section[1],cy+Math.sin(k*Math.PI/4)*section[1],section[0]],c=[cx+Math.cos((k+1)*Math.PI/4)*section[1],cy+Math.sin((k+1)*Math.PI/4)*section[1],section[0]];
      tri(color,a,...(reverse?[c,b]:[b,c]));
    }
  };
  const slab=(outline,center,thickness,color='white')=>{
    let area=0;outline.forEach((p,i)=>{const q=outline[(i+1)%outline.length];area+=p[0]*q[1]-q[0]*p[1];});if(area>0)outline=[...outline].reverse();
    const top=outline.map(p=>[p[0],center+thickness/2,p[1]]),bottom=outline.map(p=>[p[0],center-thickness/2,p[1]]);
    for(let i=1;i<outline.length-1;i++){tri(color,top[0],top[i],top[i+1]);tri(color,bottom[0],bottom[i+1],bottom[i]);}
    for(let i=0;i<outline.length;i++){const j=(i+1)%outline.length;quad(color,top[i],bottom[i],bottom[j],top[j]);}
  };
  rings(0,4.7,[[-28,.25],[-21,1.35],[-13,2.7],[14,2.7],[23,1.8],[28,.1]]);
  for(const side of[-1,1]){
    slab([[side*2,7],[side*25,-5],[side*25,-12],[side*2,-2]],4,.55);
    slab([[side*.7,-19],[side*9,-24],[side*9,-28],[side*.7,-25]],7,.35);
    rings(side*9,2.5,[[-2,1.2],[5,1.45],[7,1.35]],'white');
    rings(side*9,2.5,[[7.05,1.12],[7.15,1.12]],'door');
    quad('glass',[side*1.9,5.2,22],[side*1.2,6.1,24],[side*.55,6.2,25],[side*1.5,5.1,23]);
  }
  quad('airline',[-.2,5,-20],[-.2,15,-25],[-.2,14,-29],[-.2,5,-27]);
  quad('airline',[.2,5,-27],[.2,14,-29],[.2,15,-25],[.2,5,-20]);
  for(const [wx,wz] of [[-4,-3],[4,-3],[0,20]])slab([[wx-.5,wz-1.1],[wx+.5,wz-1.1],[wx+.5,wz+1.1],[wx-.5,wz+1.1]],.8,1.5,'door');
  // Facing the terminal (+X) with tails and wings clear of the taxiway.
  const transform=p=>[x+p[2],y+p[1],z-p[0]];
  return [...groups].map(([color,triangles])=>({id:`parked-airliner-${index}-${color}`,kind:'airliner',position:[x,y,z],size:[58,16,52],color,triangles:triangles.map(t=>t.map(transform))}));
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
