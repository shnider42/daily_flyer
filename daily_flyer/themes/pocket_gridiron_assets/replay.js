import {kickHeight} from './special-teams.js?v=31';
import {windFor} from './weather.js?v=31';
// Presentation-only recordings. Playback never calls Game.tick or consumes RNG.
const activePhase=p=>['live','return','fumble','kick_flight','kick_loose'].includes(p);
const clone=p=>p?{...p}:null;
export function replayFrame(g,time){
 const flip=g.offense===1,point=p=>p?{x:flip?53-p.x:p.x,y:flip?100-p.y:p.y}:null;
 const people=[...g.players.map(p=>({p,team:g.offense})),...g.defenders.map(p=>({p,team:1-g.offense}))].map(({p,team})=>({...point(p),id:p.id,slot:p.slot,name:p.name,team,number:p.number,phase:p.phase,stun:p.stun,carrier:p===g.carrier,selected:p===g.controlled,biting:!!(p.fakeBite&&!g.isHumanDefender(p)&&!g.passed&&!g.isReturn&&g.liveTime>=.25&&g.liveTime<p.fakeUntil)}));
 const b=g.pass||g.loose||(g.pitch?.released?{...g.pitch,elapsed:g.pitch.elapsed-g.pitch.release,duration:g.pitch.flight}:null)||g.special?.ball;
 const arc=b?(g.isLoose?Math.abs(Math.sin(b.elapsed*15))*5:g.special?.ball?kickHeight(g.special,g.phase):Math.sin(Math.min(1,b.elapsed/(b.duration||1))*Math.PI)*25):0;
 const ball=point(b||g.carrier);
 const blocks=g.blocks.flatMap(block=>[block.p,block.help].filter(i=>i!==undefined).map(i=>({blocker:g.players[i].id,defender:g.defenders[block.d].id,doubleTeam:block.help!==undefined})));
 const wind=g.weather?windFor(g):null;if(wind&&flip){wind.x*=-1;wind.y*=-1;}
 return {time,weather:g.weather,weatherTime:g.time,weatherWind:wind,offense:g.offense,people,blocks,ball,airborne:!!b,targetId:g.pass?.target?.id||null,fake:g.fakeActive,arc,loose:g.isLoose,returning:!!g.returnInfo,spot:flip?100-g.spot:g.spot,target:flip?100-g.target:g.target,camera:flip?100-g.cameraY:g.cameraY,move:clone(g.moveAnimation),flag:!!g.flags.length};
}
export function replayKind(e){if(e.scorePoints===6)return 'TOUCHDOWN';if(e.type==='ball'&&e.text==='FUMBLE!')return 'FUMBLE';if(e.type==='turnover'&&(e.turnoverType==='interception'||e.text==='INTERCEPTED!'))return 'INTERCEPTION';return null;}
export class ReplayTape {
 constructor(){this.reset();}
 reset(){this.time=0;this.history=[];this.clips=[];this.highlights=[];this.fullHighlights=[];this.archivedPlay=null;this.archivedSpecial=null;this.sequence=0;this.active=null;this.wasActive=false;this.sampleAt=0;}
 observe(g,dt,events=[]){
  const playing=activePhase(g.phase),kinds=events.map(replayKind).filter(Boolean);
  const result=events.find(e=>e.type==='result');
  if(result&&g.special?.settled?.returned&&g.special.settled.yards>=15&&!kinds.length)kinds.push('BIG RETURN');
  if(!playing&&!this.wasActive&&!kinds.length&&!result)return;
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
  if(result)this.archive(g,result);
  this.wasActive=playing;
 }
 archive(g,event){
  if(g.phase==='dead'&&g.special?.settled){this.archiveSpecial(g);return;}
  // Only penalty-settled scrimmage plays. Skipping instant replays
  // never touches either reel; each keeps at most three clips per team.
  const start=g.playStart;
  if(g.phase!=='dead'||!start?.box||this.archivedPlay===start)return;
  this.archivedPlay=start;
  const original=start.offense,before=start.box[original],after=g.box[original];
  if(after.plays<=before.plays)return; // accepted/offsetting foul erased the play
  const gain=after.rushYards-before.rushYards+after.passYards-before.passYards;
  const takeaway=g.box[1-original].takeaways>start.box[1-original].takeaways;
  const team=event.scorePoints===6?event.scoreTeam:takeaway||gain<0?1-original:original;
  const kind=event.scorePoints===6?'TOUCHDOWN':takeaway?'TAKEAWAY':gain<0?'DEFENSIVE STOP':gain>=10?'BIG GAIN':'ON THE FILM';
  const frames=this.history.filter(f=>f.time>=this.time-8).map(f=>({...f,people:f.people.map(p=>({...p})),blocks:f.blocks.map(b=>({...b})),ball:{...f.ball},move:clone(f.move)}));
  if(frames.length<2)return;
  const carrier=frames.at(-1).people.find(p=>p.carrier);
  const clip={kind,team,original,gain,quarter:g.quarter,clock:g.clock,player:carrier?.name||g.teams[team].city,number:carrier?.number,call:clone(start.call),tendency:g.playAction?clone(g.playAction.seen):null,
   detail:event.text==='PENALTY DECLINED'?event.detail:`${event.text} · ${event.detail}`,frames,anchor:original,sequence:++this.sequence,
   priority:(event.scorePoints===6?100:takeaway?75:gain<0?35:0)+Math.min(40,Math.abs(gain))};
  const retain=list=>{const own=[...list.filter(c=>c.team===team),clip].sort((a,b)=>b.priority-a.priority||b.sequence-a.sequence).slice(0,3);return [...list.filter(c=>c.team!==team),...own].sort((a,b)=>b.priority-a.priority||a.sequence-b.sequence);};
  this.fullHighlights=retain(this.fullHighlights);
  if(g.quarter<=2)this.highlights=retain(this.highlights);
 }
 archiveSpecial(g){
  const s=g.special.settled;if(this.archivedSpecial===s)return;this.archivedSpecial=s;
  const fieldGoal=s.type==='fieldgoal'&&s.good,pinned=s.type==='punt'&&s.spot>0&&s.spot<20,returned=s.returned&&(s.yards>=15||s.reason==='touchdown');
  if(!fieldGoal&&!pinned&&!returned)return;
  const frames=this.history.filter(f=>f.time>=this.time-8).map(f=>({...f,people:f.people.map(p=>({...p})),blocks:f.blocks.map(b=>({...b})),ball:{...f.ball},move:clone(f.move)}));
  if(frames.length<2)return;
  const team=returned?s.receivingTeam:s.kickingTeam,kind=fieldGoal?'FIELD GOAL':returned?s.reason==='touchdown'?'TOUCHDOWN':'BIG RETURN':'PINNED DEEP';
  const detail=fieldGoal?`${s.player} makes a ${s.distance}-yard field goal.`:returned?`${s.player}: ${s.yards} yards on the ${s.type} return${s.reason==='touchdown'?', all the way to the end zone':''}.`:`${g.defenders[6].name} and the coverage unit leave the receiving team at its own ${s.spot}.`;
  const clip={kind,team,original:g.offense,gain:s.yards||0,quarter:g.quarter,clock:g.clock,player:s.player,call:{name:fieldGoal?'Field goal':returned?`${s.type==='punt'?'Punt':'Kickoff'} return`:'Directional punt'},special:{...s},detail,frames,anchor:g.offense,sequence:++this.sequence,priority:kind==='TOUCHDOWN'?110:fieldGoal?55:pinned?45:40+Math.min(40,s.yards)};
  const retain=list=>{const own=[...list.filter(c=>c.team===team),clip].sort((a,b)=>b.priority-a.priority||b.sequence-a.sequence).slice(0,3);return [...list.filter(c=>c.team!==team),...own].sort((a,b)=>b.priority-a.priority||a.sequence-b.sequence);};
  this.fullHighlights=retain(this.fullHighlights);if(g.quarter<=2)this.highlights=retain(this.highlights);
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
