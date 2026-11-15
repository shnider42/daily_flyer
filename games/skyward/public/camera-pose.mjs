import {orientationOf,basis} from './orientation.mjs';
import {AIRCRAFT} from './campaign.mjs';
import {modeledAirframeBounds} from './airframes.mjs';
import {surfaceHeight} from './terrain.mjs';

const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const angleDelta=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
const lerp=(a,b,t)=>a+(b-a)*t;
const worldUp={x:0,y:1,z:0};
const clearanceProbes=[.3,.57,.8,1];

function followAngle(current,target,dt,response,maxRate){
  const delta=angleDelta(current,target),distance=Math.abs(delta);
  // Cross large turns at a bounded rate, then ease in close to the target.
  const linearTime=Math.max(0,(distance-maxRate/response)/maxRate);
  const linear=maxRate*Math.min(dt,linearTime);
  const easing=1-Math.exp(-Math.max(0,dt-linearTime)*response);
  return current+Math.sign(delta)*(linear+(distance-linear)*easing);
}

// The aircraft points along local +Z; its pilot's right is local -X. Build
// the eye and look frame in those body axes, including when vertical/inverted.
export function cockpitView(pose,options={},groundOffset=0){
  const axes=basis(orientationOf(pose)),{forward,up,right}=axes;
  const eye=AIRCRAFT[pose?.aircraft]?.cockpitEye,forwardOffset=finite(eye?.forward,2),upOffset=finite(eye?.up,.85);
  const yaw=finite(options.lookX),pitch=clamp(finite(options.lookY),-1.15,1.15);
  const sy=Math.sin(yaw),cy=Math.cos(yaw),sp=Math.sin(pitch),cp=Math.cos(pitch);
  const position={
    x:finite(pose.x)+forward.x*forwardOffset+up.x*upOffset,
    y:finite(pose.y)-finite(groundOffset)+forward.y*forwardOffset+up.y*upOffset,
    z:finite(pose.z)+forward.z*forwardOffset+up.z*upOffset,
  };
  const direction={},viewUp={},target={};
  for(const key of ['x','y','z']){
    direction[key]=forward[key]*cy*cp+right[key]*sy*cp+up[key]*sp;
    viewUp[key]=up[key]*cp-forward[key]*cy*sp-right[key]*sy*sp;
    target[key]=position[key]+direction[key]*100;
  }
  return {position,target,direction,up:viewUp};
}

function orbitEye(target,yaw,tilt,distance){
  const horizontal=distance*Math.cos(tilt);
  return {x:target.x-Math.sin(yaw)*horizontal,y:target.y+Math.sin(tilt)*distance,z:target.z-Math.cos(yaw)*horizontal};
}

function fittedDistance(axes,half,yaw,tilt,tanHorizontal,tanVertical){
  const s=Math.sin(yaw),c=Math.cos(yaw),sy=Math.sin(tilt),cy=Math.cos(tilt);
  const eye={x:-s*cy,y:sy,z:-c*cy},right={x:-c,y:0,z:s},up={x:s*sy,y:cy,z:c*sy};
  const support=(axis,side=0,scale=0)=>
    half[0]*Math.abs(dot(eye,axes.right)+side*scale*dot(axis,axes.right))
    +half[1]*Math.abs(dot(eye,axes.up)+side*scale*dot(axis,axes.up))
    +half[2]*Math.abs(dot(eye,axes.forward)+side*scale*dot(axis,axes.forward));

  // For each edge of the frustum, maximize its linear constraint over the
  // rotated aircraft envelope. The view stays open around the whole model,
  // even when the tail points at the camera or the wings appear vertical.
  return Math.max(support(eye)+1,support(right,1,1/tanHorizontal),support(right,-1,1/tanHorizontal),
    support(up,1,1/tanVertical),support(up,-1,1/tanVertical));
}

function terrainLift(target,eye,mission){
  let lift=0;
  for(const t of clearanceProbes){
    const surface=surfaceHeight(lerp(target.x,eye.x,t),lerp(target.z,eye.z,t),mission);
    // Allow an aircraft on its gear to remain the target near the surface.
    // Clearance increases toward the camera, where the eye needs 3.4 metres.
    lift=Math.max(lift,(surface+t*3.4-lerp(target.y,eye.y,t))/t);
  }
  return lift;
}

export function chaseView(pose,options={},orbit={}){
  const {
    aircraft=pose.aircraft,width=1280,height=720,fov=59,groundOffset=0,dt=0,
    reset=false,reducedMotion=false,cinematic=false,mission,lookX=0,lookY=0,chaseZoom=1,
  }=options;
  const axes=basis(orientationOf(pose)),{forward,right,up}=axes,{min,max}=modeledAirframeBounds(aircraft);
  const half=max.map((value,index)=>(value-min[index])*.5),center=max.map((value,index)=>(value+min[index])*.5);
  const target={x:finite(pose.x),y:finite(pose.y)-groundOffset,z:finite(pose.z)};
  for(const key of ['x','y','z'])target[key]+=-right[key]*center[0]+up[key]*center[1]+forward[key]*center[2];

  const fresh=reset||!Number.isFinite(orbit.heading);
  const horizontal=Math.hypot(forward.x,forward.z);
  // Close to vertical, hold the preceding azimuth instead of interpreting
  // tiny changes in horizontal nose direction as abrupt 180-degree turns.
  const heading=horizontal>=.32?Math.atan2(forward.x,forward.z):
    fresh?Math.atan2(right.z,-right.x):orbit.heading;
  const response=reducedMotion?12:cinematic?4:8;
  const follow=fresh?1:1-Math.exp(-dt*response);
  const look=fresh?1:1-Math.exp(-dt*(reducedMotion?16:11));
  orbit.heading=fresh?heading:followAngle(orbit.heading,heading,dt,response,3.6);
  const requestedYaw=finite(lookX),requestedTilt=clamp(finite(lookY),-1.2,1.2);
  orbit.lookX=fresh?requestedYaw:followAngle(orbit.lookX,requestedYaw,dt,reducedMotion?16:11,6);
  orbit.lookY=fresh?requestedTilt:lerp(orbit.lookY,requestedTilt,look);
  orbit.pitch=fresh?forward.y:lerp(orbit.pitch,forward.y,follow);
  const zoom=clamp(finite(chaseZoom,1),.8,1.8);
  orbit.zoom=fresh?zoom:lerp(orbit.zoom,zoom,look);

  const yaw=orbit.heading+orbit.lookX+(cinematic?.68:0);
  let tilt=clamp(.24-(cinematic?.45:.64)*orbit.pitch+orbit.lookY+(cinematic?.12:0),-1.32,1.32);
  const tangent=Math.tan(clamp(fov,45,90)*Math.PI/360)*.82,tanHorizontal=tangent*Math.max(.15,width/Math.max(1,height));
  const length=half[2]*2,speed=Math.max(0,finite(pose.speed));
  const preferred=(Math.max(16,length*(aircraft==='b767'?1.8:1.63))+Math.min(10,speed*.018))*orbit.zoom;
  let distance=Math.max(preferred,fittedDistance(axes,half,yaw,tilt,tanHorizontal,tangent));
  let position=orbitEye(target,yaw,tilt,distance);
  if(mission){
    for(let attempt=0;attempt<3;attempt++){
      const lift=terrainLift(target,position,mission);
      if(lift<1e-10)return {position,target,up:worldUp};
      const along=Math.hypot(position.x-target.x,position.z-target.z),rise=position.y+lift-target.y;
      tilt=Math.atan2(rise,along);
      distance=Math.max(distance,Math.hypot(along,rise),fittedDistance(axes,half,yaw,tilt,tanHorizontal,tangent));
      position=orbitEye(target,yaw,tilt,distance);
    }
    const remainingLift=terrainLift(target,position,mission);
    if(remainingLift>0){
      position.y+=remainingLift;
      const along=Math.hypot(position.x-target.x,position.z-target.z),rise=position.y-target.y;
      if(Math.hypot(along,rise)<fittedDistance(axes,half,yaw,Math.atan2(rise,along),tanHorizontal,tangent)){
        // A constrained downward orbit can run out of clear horizontal room
        // at a cliff. Keep the clear line already found and lift far enough
        // to fit the entire bounding sphere from the new, higher angle.
        const cone=Math.min(tanHorizontal,tangent),radius=Math.hypot(...half);
        const safe=radius*Math.hypot(1,1/cone)+1;
        position.y=Math.max(position.y,target.y+Math.sqrt(Math.max(0,safe*safe-along*along)));
      }
    }
  }
  return {position,target,up:worldUp};
}

export function isOutsideAircraft(pose){
  return ['descending','landed','lost'].includes(pose?.bailout?.phase);
}

export function parachuteView(pose,options={},portrait=false,orbit={},dt=0,reset=true){
  const angle=finite(pose.heading)+.48+finite(options.lookX);
  const tilt=clamp(finite(options.lookY),-.62,.9),distance=portrait?26:21;
  const x=finite(pose.x),y=finite(pose.y),z=finite(pose.z);
  const blend=reset?1:1-Math.exp(-dt*(options.reducedMotion?12:10));
  orbit.x=lerp(finite(orbit.x),-Math.sin(angle)*distance*Math.cos(tilt),blend);
  orbit.y=lerp(finite(orbit.y),7+Math.sin(tilt)*distance,blend);
  orbit.z=lerp(finite(orbit.z),-Math.cos(angle)*distance*Math.cos(tilt),blend);
  return {
    position:{x:x+orbit.x,y:y+orbit.y,z:z+orbit.z},
    target:{x,y:y+2.5,z}
  };
}
