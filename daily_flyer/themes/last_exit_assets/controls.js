// Pointer normalization is identical on Safari, desktop and other touch browsers.
export function stickVector(clientX,clientY,rect){
 let x=(clientX-(rect.left+rect.width/2))/(rect.width*.38),y=((rect.top+rect.height/2)-clientY)/(rect.height*.38);
 const length=Math.hypot(x,y);if(length<.1)return{x:0,y:0};if(length>1){x/=length;y/=length;}return{x,y};
}
export function driveSteer(x){return Math.abs(x)<.1?0:Math.sign(x)*(Math.abs(x)-.1)/.9;}

const wrap=v=>Math.atan2(Math.sin(v),Math.cos(v));
const limit=(v,a,b)=>Math.max(a,Math.min(b,v));
export function makeView(heading=Math.PI){return{yaw:heading,pitch:.28,idle:99};}
export function dragView(view,dx,dy,width,sensitivity=1,invertY=false){
 const scale=3.4/Math.max(320,width)*limit(sensitivity,.35,2.5);
 view.yaw=wrap(view.yaw-dx*scale);view.pitch=limit(view.pitch+dy*scale*.7*(invertY?-1:1),-.06,.75);view.idle=0;return view;
}
export function stepView(view,heading,onFoot,dt,active=false){
 if(active)view.idle=0;else view.idle+=dt;
 if(!onFoot&&view.idle>1.8){const f=1-Math.exp(-dt*2.5);view.yaw=wrap(view.yaw+wrap(heading-view.yaw)*f);view.pitch+=(.28-view.pitch)*f;}
 return view;
}
// Once a gesture becomes a look gesture, crossing an action never changes it.
export function beginGesture(x,y,time,action=null){return{x,y,startX:x,startY:y,startTime:time,action,phase:'pending',travel:0};}
export function moveGesture(g,x,y){const dx=x-g.x,dy=y-g.y;g.x=x;g.y=y;g.travel=Math.max(g.travel,Math.hypot(x-g.startX,y-g.startY));if(g.travel>9&&g.phase==='pending')g.phase='look';return{dx,dy,look:g.phase==='look'||g.phase==='held'};}
export function advanceGesture(g,time){if(g.phase==='pending'&&g.action&&g.action!=='interact'&&time-g.startTime>=140)g.phase='held';return g.phase;}
export function finishGesture(g,cancelled=false){return !cancelled&&g.action==='interact'&&g.phase==='pending'&&g.travel<=9?'interact':null;}
