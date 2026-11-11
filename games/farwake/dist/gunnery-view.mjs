/** Exterior station presentation never changes the captain's physical perspective. */
import { clampGunneryAim } from './gunnery.mjs';
import { pixelLine, pixelRect } from './pixel-art.mjs';

const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;

export function getGunneryView(game){
 return game?.gunneryStatus?.()||{available:false,active:false,reason:'Reach the ship’s gunnery station.'};
}

export function displayMode(game,status=getGunneryView(game)){
 return status.active?'ship':game?.state?.mode||'ship';
}

/** The station consumes only aim and trigger input. Walking and helm axes stay zero. */
export function projectGunneryInput(input,status,ship,{pointer=null,toWorld=null}={}){
 if(!status?.active)return input;
 const result={...input,x:0,y:0,thrust:0,strafe:0,turn:0,boost:false,brake:false,mine:false};
 if(pointer?.active&&!result.aiming&&toWorld){
  const point=toWorld(pointer.x,pointer.y),origin=status.origin||ship,dx=point.x-finite(origin?.x),dy=point.y-finite(origin?.y),length=Math.hypot(dx,dy);
  if(Number.isFinite(length)&&length>.5){result.aimX=dx/length;result.aimY=dy/length;result.aiming=true;}
 }
 if(pointer?.fire)result.fire=true;
 return result;
}

export function gunneryWeaponStatus(status){
 if(!status?.active)return null;
 const lowPower=finite(status.energy)<finite(status.energyCost),cycling=finite(status.cooldownRemaining)>0;
 return{name:'Ship pulse battery',state:lowPower?'LOW POWER':cycling?'CYCLING':status.canFire===false?'STANDBY':'READY',
  detail:`${Math.round(finite(status.range))} m range · ${finite(status.energyCost)} charge per volley`,
  instruction:'NPC pilot flies. Aim the battery and hold FIRE. Back to deck leaves the station view.'};
}

/** The reticle uses the same physical traverse clamp as the authoritative guns. */
export function gunneryReticle(status,ship,input={}){
 if(!status?.active||!ship)return null;
 const center=finite(status.arcCenter,finite(ship.angle)),half=Math.max(0,Math.min(Math.PI,finite(status.arcHalfAngle)));
 const desired=input.aiming&&Math.hypot(finite(input.aimX),finite(input.aimY))>.1?Math.atan2(input.aimY,input.aimX):finite(status.aimAngle,center);
 const angle=clampGunneryAim(desired,center,half),range=Math.max(0,finite(status.range)),origin={x:finite(status.origin?.x,finite(ship.x)),y:finite(status.origin?.y,finite(ship.y))};
 return{angle,center,half,range,origin,x:origin.x+Math.cos(angle)*range,y:origin.y+Math.sin(angle)*range,
  limited:Math.abs(Math.atan2(Math.sin(desired-angle),Math.cos(desired-angle)))>.01};
}

export function drawGunneryOverlay(ctx,view,{status,ship,input={},rasterScale=1}={}){
 const reticle=gunneryReticle(status,ship,input);if(!reticle||!view)return;
 const zoom=finite(view.zoom,1),r=Math.max(1,finite(rasterScale,1));
 const point=(x,y)=>({x:x*zoom+finite(view.offsetX),y:y*zoom+finite(view.offsetY)});
 const origin=reticle.origin,start=point(origin.x,origin.y),end=point(reticle.x,reticle.y),color=reticle.limited?'#e5ba78':'#9ddbd2';
 ctx.save();
 for(const angle of [reticle.center-reticle.half,reticle.center+reticle.half]){
  const boundary=point(origin.x+Math.cos(angle)*reticle.range,origin.y+Math.sin(angle)*reticle.range);
  pixelLine(ctx,start.x,start.y,boundary.x,boundary.y,'#477b8066',r);
 }
 for(let index=0;index<=36;index++){
  const angle=reticle.center-reticle.half+reticle.half*2*index/36;
  const edge=point(origin.x+Math.cos(angle)*reticle.range,origin.y+Math.sin(angle)*reticle.range);
  pixelRect(ctx,'#77aaa788',edge.x,edge.y,r,r);
 }
 pixelLine(ctx,start.x,start.y,end.x,end.y,'#88c7bd55',r);
 for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]])pixelLine(ctx,end.x+dx*4*r,end.y+dy*4*r,end.x+dx*10*r,end.y+dy*10*r,color,r);
 ctx.restore();
 return reticle;
}
