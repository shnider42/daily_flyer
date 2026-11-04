// Pointer normalization is identical on Safari, desktop and other touch browsers.
export function stickVector(clientX,clientY,rect){
 let x=(clientX-(rect.left+rect.width/2))/(rect.width*.38),y=((rect.top+rect.height/2)-clientY)/(rect.height*.38);
 const length=Math.hypot(x,y);if(length<.1)return{x:0,y:0};if(length>1){x/=length;y/=length;}return{x,y};
}
export function driveSteer(x){return Math.abs(x)<.1?0:Math.sign(x)*(Math.abs(x)-.1)/.9;}

const tapSlop=g=>g.action==='interact'||g.action==='places'?16:9;
const wrap=v=>Math.atan2(Math.sin(v),Math.cos(v));
const limit=(v,a,b)=>Math.max(a,Math.min(b,v));
export function makeView(heading=Math.PI){return{yaw:heading,pitch:.28,idle:99};}
export function dragView(view,dx,dy,width,sensitivity=1,invertY=false){
 const scale=3.4/Math.max(320,width)*limit(sensitivity,.35,2.5);
 view.yaw=wrap(view.yaw-dx*scale);view.pitch=limit(view.pitch+dy*scale*.7*(invertY?-1:1),-.06,.75);view.idle=0;return view;
}
// Only deliberate camera motion suspends follow. Holding a pedal is never a look input.
export function isLooking(gestures,now){return [...gestures].some(g=>g.phase==='look'&&g.travel>9||g.lastLookAt!==undefined&&now-g.lastLookAt<100);}
export function stepView(view,heading,onFoot,dt,active=false,speed=0){
 if(active)view.idle=0;else view.idle+=dt;
 const delay=onFoot?.7:1.05,canFollow=!onFoot||Math.abs(speed)>.15;
 if(!active&&canFollow&&view.idle>delay){
  const ease=limit((view.idle-delay)/.65,0,1),rate=onFoot?2.2:2.7+Math.min(1.2,Math.abs(speed)*.04),delta=wrap(heading-view.yaw),dead=onFoot?.07:.025;
  if(Math.abs(delta)>dead)view.yaw=wrap(view.yaw+delta*(1-Math.exp(-dt*rate*ease)));
  if(view.idle>2.5)view.pitch+=(.28-view.pitch)*(1-Math.exp(-dt*1.1));
 }
 return view;
}
// Preserve the walking direction while automatic follow rotates behind the person.
// Deliberate looking reorients the movement basis; releasing the stick starts a new basis.
export function movementHeading(state,x,y,yaw,looking=false){const moving=Math.hypot(x,y)>.1;if(!moving||!state.moving||looking)state.heading=yaw;state.moving=moving;return state.heading;}
// Once a gesture becomes a look gesture, crossing an action never changes it.
export function beginGesture(x,y,time,action=null){return{x,y,startX:x,startY:y,startTime:time,action,phase:'pending',travel:0};}
export function moveGesture(g,x,y){const dx=x-g.x,dy=y-g.y;g.x=x;g.y=y;g.travel=Math.max(g.travel,Math.hypot(x-g.startX,y-g.startY));if(g.travel>tapSlop(g)&&g.phase==='pending')g.phase='look';return{dx,dy,look:g.phase==='look'||g.phase==='held'};}
export function advanceGesture(g,time){if(g.phase==='pending'&&g.action&&g.action!=='interact'&&g.action!=='horn'&&g.action!=='places'&&time-g.startTime>=140)g.phase='held';return g.phase;}
export function finishGesture(g,cancelled=false){return !cancelled&&g.action&&g.phase==='pending'&&g.travel<=tapSlop(g)?g.action:null;}

// Safari can still claim double taps on absolutely positioned game controls.
// Cancel native touch gestures only on surfaces already driven by Pointer Events.
export function guardGameTouches(elements,isPlaying,gestureRoot){
 const stop=e=>{if(isPlaying()&&e.cancelable)e.preventDefault();};
 for(const el of elements)for(const type of['touchstart','touchmove','touchend','dblclick','contextmenu'])el.addEventListener(type,stop,{passive:false});
 for(const type of['gesturestart','gesturechange','gestureend'])gestureRoot.addEventListener(type,stop,{passive:false});
}
