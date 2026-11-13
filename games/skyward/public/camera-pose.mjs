import {orientationOf,basis} from './orientation.mjs';
import {AIRCRAFT} from './campaign.mjs';

const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));

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

// Existing aircraft keep their familiar follow camera. A long passenger hull
// needs additional distance, particularly with a narrow portrait projection.
// Both backends use this shared result before their existing orbit/smoothing.
export function chaseAirframeFraming({length=9,span=11,speed=0,width=1280,height=720,fov=59,passenger=false}={}){
  length=Math.max(1,finite(length,9));span=Math.max(1,finite(span,11));speed=Math.max(0,finite(speed));
  if(!passenger)return {distance:clamp(length*2.35+speed*.055,23,84),elevation:clamp(length*.4+speed*.012,5.4,20)};
  const aspect=Math.max(.25,finite(width,1280)/Math.max(1,finite(height,720)));
  const tangent=Math.tan(clamp(finite(fov,59),45,90)*Math.PI/360);
  const projectedWidth=Math.max(span,length*.85);
  const distance=Math.max(length*1.9+speed*.04,projectedWidth/(2*tangent*aspect*.56)+length*.22);
  return {distance,elevation:Math.max(8,length*.42+speed*.008)};
}
