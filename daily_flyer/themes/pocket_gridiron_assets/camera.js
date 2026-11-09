import {SoftCamera,easeValue,clampCameraCenter} from '../pocket_sports_assets/core/camera.js?v=1';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;

export function cameraPreferences(value={},touch=false){
 const saved=value&&typeof value==='object'?value:{};
 return {
  cameraMode:['follow','fit','full'].includes(saved.cameraMode)?saved.cameraMode:touch?'follow':'fit',
  cameraZoom:clamp(finite(Number(saved.cameraZoom),touch?1.4:1),1,2.2),
  cameraFocus:['play','ball','player'].includes(saved.cameraFocus)?saved.cameraFocus:'play',
  cameraSteady:saved.cameraSteady===true,
  cameraOverview:saved.cameraOverview!==false,
 };
}

export function gridironBall(game){
 if(game.momentBall)return game.momentBall;
 if(game.pass||game.loose)return game.pass||game.loose;
 if(game.pitch?.released)return game.pitch;
 if(game.special?.ball)return game.special.ball;
 if(game.special&&game.phase.startsWith('kick_'))return game.special.goal?game.players[0]:game.defenders[6];
 return game.carrier||{x:26.5,y:game.spot||25};
}

// Presentation coordinates remain separate from engine yards. The same
// projection drives field painting, selection hit targets, and edge markers.
export class GridironCamera {
 constructor(){this.follow=new SoftCamera();this.manualCenter=null;this.match=null;this.reset();}
 // Resize, a new play, and possession changes invalidate interpolation only.
 // The user's chosen position belongs to the match, not to one render frame.
 reset(){this.follow.reset();this.scale=null;this.scene=null;}
 panTo(point,match=this.match){
  if(!Number.isFinite(point?.x)||!Number.isFinite(point?.y))return;
  this.match=match;this.manualCenter={x:point.x,y:point.y};
 }
 resumeFollow(){this.manualCenter=null;this.follow.reset();this.recenter=true;}
 frame({width=360,height=460,format=11,ball,player,settings,dt=1/60,scene,match=scene,returnSetup=false}){
  if(this.match!==match){this.manualCenter=null;this.match=match;this.follow.reset();this.recenter=true;}
  const prefs=cameraPreferences(settings),yardScale=format===11?4.35:5.65;
  const worldWidth=360,worldHeight=120*yardScale+40;
  const worldPoint=p=>({x:29+finite(p?.x,26.5)*5.65,y:20+(110-finite(p?.y,25))*yardScale});
  const b=ball||player||{x:26.5,y:25},p=player||b;
  let target={...b};
  if(prefs.cameraFocus==='player'||returnSetup&&prefs.cameraFocus==='play')target={...p};
  else if(prefs.cameraFocus==='play')target={x:b.x+clamp(p.x-b.x,-18,18)*.3,y:b.y+clamp(p.y-b.y,-22,22)*.3};
  // Start centered on the chosen subject. The dead zone, rather than an
  // arbitrary upfield offset, keeps subsequent small movements comfortable.
  const focus=worldPoint(target),fullScale=Math.min(width/worldWidth,height/worldHeight);
  const fitScale=width/worldWidth;
  const followBase=Math.min(fitScale,height/280);
  const desired=prefs.cameraMode==='full'?fullScale:prefs.cameraMode==='fit'?fitScale:followBase*prefs.cameraZoom;
  const snap=this.scene!==scene||this.scale===null||this.recenter;
  this.scene=scene;
  this.scale=this.scale===null||this.recenter?desired:easeValue(this.scale,desired,dt,.24);
  const viewWidth=width/this.scale,viewHeight=height/this.scale;
  const center=prefs.cameraMode==='full'?{x:worldWidth/2,y:worldHeight/2}:this.manualCenter?{
   x:clampCameraCenter(this.manualCenter.x,viewWidth,worldWidth),
   y:clampCameraCenter(this.manualCenter.y,viewHeight,worldHeight),
  }:this.follow.update({
   ...focus,dt,viewWidth,viewHeight,worldWidth,worldHeight,snap,steady:prefs.cameraSteady,
  });
  this.recenter=false;
  if(prefs.cameraMode==='full')this.follow.reset();
  const scale=this.scale,screenPoint=point=>{const q=worldPoint(point);return {x:width/2+(q.x-center.x)*scale,y:height/2+(q.y-center.y)*scale};};
  return {width,height,worldWidth,worldHeight,viewWidth,viewHeight,center,scale,worldPoint,screenPoint,manual:!!this.manualCenter,
   yardScale,fieldCamera:110-(worldHeight*.6-20)/yardScale,
   zoomed:prefs.cameraMode!=='full',prefs};
 }
}

// The overview represents the playable field (including both endzones),
// while the camera bounds also include the narrow surrounding sidelines.
export function minimapLayout(frame){
 const fieldWidth=53.333333*5.65,fieldHeight=120*frame.yardScale;
 return {
  center:{x:(frame.center.x-29)/fieldWidth,y:(frame.center.y-20)/fieldHeight},
  viewport:{x:frame.viewWidth/fieldWidth,y:frame.viewHeight/fieldHeight},
  toWorld:point=>({x:29+point.x*fieldWidth,y:20+point.y*fieldHeight}),
  toMap:point=>({x:clamp(point.x/53.333333,0,1),y:clamp((110-point.y)/120,0,1)}),
 };
}

export function edgeMarker(point,width,height,inset=19){
 if(point.x>=inset&&point.x<=width-inset&&point.y>=inset&&point.y<=height-inset)return null;
 const dx=point.x-width/2,dy=point.y-height/2;
 const factor=Math.min((width/2-inset)/Math.max(Math.abs(dx),.001),(height/2-inset)/Math.max(Math.abs(dy),.001));
 return {x:width/2+dx*factor,y:height/2+dy*factor,angle:Math.atan2(dy,dx)};
}
