// Presentation-only recordings. Playback never calls Game.tick or consumes RNG.
const activePhase=p=>['live','return','fumble','kick_flight','kick_loose'].includes(p);
const clone=p=>p?{...p}:null;
export function replayFrame(g,time){
 const flip=g.offense===1,point=p=>p?{x:flip?53-p.x:p.x,y:flip?100-p.y:p.y}:null;
 const people=[...g.players.map(p=>({p,team:g.offense})),...g.defenders.map(p=>({p,team:1-g.offense}))].map(({p,team})=>({...point(p),team,number:p.number,phase:p.phase,stun:p.stun,carrier:p===g.carrier,selected:p===g.controlled}));
 const b=g.pass||g.loose||g.special?.ball;
 const arc=b?(g.isLoose?Math.abs(Math.sin(b.elapsed*15))*5:Math.sin(Math.min(1,b.elapsed/(b.duration||1))*Math.PI)*(g.special?38:25)):0;
 const ball=point(b||g.carrier);
 return {time,offense:g.offense,people,ball,airborne:!!b,arc,loose:g.isLoose,returning:!!g.returnInfo,spot:flip?100-g.spot:g.spot,target:flip?100-g.target:g.target,camera:flip?100-g.cameraY:g.cameraY,move:clone(g.moveAnimation),flag:!!g.flags.length};
}
export function replayKind(e){if(e.scorePoints===7)return 'TOUCHDOWN';if(e.type==='ball'&&e.text==='FUMBLE!')return 'FUMBLE';if(e.type==='turnover'&&(e.turnoverType==='interception'||e.text==='INTERCEPTED!'))return 'INTERCEPTION';return null;}
export class ReplayTape {
 constructor(){this.reset();}
 reset(){this.time=0;this.history=[];this.clips=[];this.active=null;this.wasActive=false;this.sampleAt=0;}
 observe(g,dt,events=[]){
  const playing=activePhase(g.phase),kinds=events.map(replayKind).filter(Boolean);
  if(!playing&&!this.wasActive&&!kinds.length)return;
  if(playing&&!this.wasActive&&['kick_flight','live'].includes(g.phase)&&!this.clips.length){this.history=[];this.sampleAt=0;}
  this.time+=Math.max(0,dt);const force=kinds.length||(!playing&&this.wasActive);
  if(force||this.time>=this.sampleAt){
   const frame=replayFrame(g,this.time);this.history.push(frame);this.history=this.history.filter(f=>f.time>=this.time-12);
   for(const clip of this.clips)if(!clip.complete&&frame.time>clip.frames.at(-1)?.time){clip.frames.push(frame);if(frame.time>=clip.until||!playing)clip.complete=true;}
   this.sampleAt=this.time+.05;
  }
  for(const kind of kinds){
   const lead=kind==='TOUCHDOWN'?4.5:3.5,frames=this.history.filter(f=>f.time>=this.time-lead);
   if(frames.length<2)continue;
   this.clips.push({kind,frames:[...frames],at:this.time,until:this.time+(kind==='TOUCHDOWN'?0:1.4),complete:!playing||kind==='TOUCHDOWN',anchor:frames[0].offense});
  }
  // Bound memory even in pathological chains of fumble recoveries.
  if(this.clips.length>12)this.clips.splice(0,this.clips.length-12);
  this.wasActive=playing;
 }
 start(g){
  if(this.active||g.paused||g.phase!=='dead'||!this.clips.length)return false;
  for(const clip of this.clips)clip.complete=true;
  this.active={clip:this.clips.shift(),elapsed:0,hold:0};return true;
 }
 advance(dt){
  if(!this.active)return false;const a=this.active,c=a.clip,end=c.frames.at(-1).time-c.frames[0].time;
  const eventAt=c.at-c.frames[0].time,speed=Math.abs(a.elapsed-eventAt)<.6?.4:.75;
  a.elapsed=Math.min(end,a.elapsed+Math.min(.1,Math.max(0,dt))*speed);
  if(a.elapsed>=end){a.hold+=Math.min(.1,Math.max(0,dt));if(a.hold>.65)this.skip();}
  return !!this.active;
 }
 skip(){this.active=this.clips.length?{clip:this.clips.shift(),elapsed:0,hold:0}:null;}
 skipAll(){this.active=null;this.clips=[];}
 view(){
  const a=this.active;if(!a)return null;const frames=a.clip.frames,t=frames[0].time+a.elapsed;
  let index=frames.findIndex(f=>f.time>t);if(index<0)index=frames.length-1;
  const hi=frames[index],lo=frames[Math.max(0,index-1)];
  // Identity/possession changes are discrete; never interpolate across them.
  if(lo.offense!==hi.offense||hi.time===lo.time)return {...hi,anchor:a.clip.anchor,kind:a.clip.kind};
  const u=Math.max(0,Math.min(1,(t-lo.time)/(hi.time-lo.time))),lerp=(x,y)=>x+(y-x)*u;
  return {...lo,anchor:a.clip.anchor,kind:a.clip.kind,people:lo.people.map((p,i)=>({...p,x:lerp(p.x,hi.people[i].x),y:lerp(p.y,hi.people[i].y),phase:lerp(p.phase,hi.people[i].phase)})),ball:{x:lerp(lo.ball.x,hi.ball.x),y:lerp(lo.ball.y,hi.ball.y)},arc:lerp(lo.arc,hi.arc),camera:lerp(lo.camera,hi.camera)};
 }
}
