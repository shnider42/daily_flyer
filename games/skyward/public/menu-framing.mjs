import {modeledAirframeBounds} from './airframes.mjs';
import {basis,orientationOf} from './orientation.mjs';

const unit=v=>{const length=Math.hypot(...v);return v.map(n=>n/length);};
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
// Preserve the hangar's front-quarter view and level horizon. Moving the
// camera, rather than offsetting its projection, also works in the CPU renderer.
const backward=unit([.68,.23,.72]);
const right=unit([.72,0,-.68]);
const up=[backward[1]*right[2],backward[2]*right[0]-backward[0]*right[2],-backward[1]*right[0]];

/** Fit an aircraft inside a CSS-pixel rectangle of the full-screen canvas.
 * No view offset or scissor persists into a flight or another menu.
 */
export function frameMenuAircraft({width,height,frame,aircraft,pose,fov}){
  if(![width,height,fov].every(Number.isFinite)||width<=0||height<=0||fov<=0||fov>=170||
    !frame||!['x','y','width','height'].every(k=>Number.isFinite(frame[k]))||frame.width<32||frame.height<32)return null;
  const left=Math.max(0,frame.x),top=Math.max(0,frame.y),rightEdge=Math.min(width,frame.x+frame.width),bottom=Math.min(height,frame.y+frame.height);
  if(rightEdge-left<32||bottom-top<32)return null;
  const padX=Math.min(32,(rightEdge-left)*.08),padY=Math.min(26,(bottom-top)*.1);
  const inner={left:left+padX,right:rightEdge-padX,top:top+padY,bottom:bottom-padY};
  const cx=(left+rightEdge)/2,cy=(top+bottom)/2,focal=height/(2*Math.tan(fov*Math.PI/360));
  const bounds=modeledAirframeBounds(aircraft),mid=bounds.min.map((n,i)=>(n+bounds.max[i])/2);
  const axes=basis(orientationOf(pose));
  // The game's pilot-right axis is local -X; meshes use ordinary local +X.
  const world=(x,y,z)=>['x','y','z'].map(k=>-axes.right[k]*x+axes.up[k]*y+axes.forward[k]*z);
  const centerOffset=world(...mid),center=['x','y','z'].map((k,i)=>(Number.isFinite(pose?.[k])?pose[k]:0)+centerOffset[i]);
  let distance=3;
  for(const x of [bounds.min[0],bounds.max[0]])for(const y of [bounds.min[1],bounds.max[1]])for(const z of [bounds.min[2],bounds.max[2]]){
    const corner=world(x-mid[0],y-mid[1],z-mid[2]),vx=dot(corner,right),vy=dot(corner,up),vz=dot(corner,backward);
    // Each plane bounds one side of the desired screen rectangle. Solving the
    // perspective inequalities keeps long fuselages and wide wings in view.
    distance=Math.max(distance,vz+1,
      (focal*vx+(inner.right-width/2)*vz)/(inner.right-cx),
      (-focal*vx-(inner.left-width/2)*vz)/(cx-inner.left),
      (focal*vy+(height/2-inner.top)*vz)/(cy-inner.top),
      (-focal*vy-(height/2-inner.bottom)*vz)/(inner.bottom-cy));
  }
  const rayX=(cx-width/2)/focal,rayY=(height/2-cy)/focal;
  const position=center.map((n,i)=>n+distance*(backward[i]-right[i]*rayX-up[i]*rayY));
  return {position,target:position.map((n,i)=>n-backward[i])};
}
