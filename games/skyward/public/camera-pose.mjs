import {orientationOf,basis} from './orientation.mjs';

const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));

// The aircraft points along local +Z; its pilot's right is local -X. Build
// the eye and look frame in those body axes, including when vertical/inverted.
export function cockpitView(pose,options={},groundOffset=0){
  const axes=basis(orientationOf(pose)),{forward,up,right}=axes;
  const yaw=finite(options.lookX),pitch=clamp(finite(options.lookY),-1.15,1.15);
  const sy=Math.sin(yaw),cy=Math.cos(yaw),sp=Math.sin(pitch),cp=Math.cos(pitch);
  const position={
    x:finite(pose.x)+forward.x*2+up.x*.85,
    y:finite(pose.y)-finite(groundOffset)+forward.y*2+up.y*.85,
    z:finite(pose.z)+forward.z*2+up.z*.85,
  };
  const direction={},viewUp={},target={};
  for(const key of ['x','y','z']){
    direction[key]=forward[key]*cy*cp+right[key]*sy*cp+up[key]*sp;
    viewUp[key]=up[key]*cp-forward[key]*cy*sp-right[key]*sy*sp;
    target[key]=position[key]+direction[key]*100;
  }
  return {position,target,direction,up:viewUp};
}
