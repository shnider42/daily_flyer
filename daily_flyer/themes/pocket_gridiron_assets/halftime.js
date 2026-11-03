import {paintBroadcast} from './broadcast-screen.js?v=18';
import {broadcastBeat} from './booth-lines.js?v=18';
import {BoothStage} from './booth-stage.js?v=18';

// Shared, skippable pregame/halftime presentation. The live engine stays still.
export class HalftimeShow {
 constructor(dialog,onResume){
  this.dialog=dialog;this.onResume=onResume;this.index=0;this.report=null;this.auto=true;this.elapsed=0;this.last=0;this.ink=true;
  this.motionQuery=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');this.reduced=!!this.motionQuery?.matches;
  try{this.motion=localStorage.getItem('pg-booth-motion')||'system';}catch{this.motion='system';}
  this.$=id=>dialog.querySelector('#'+id);
  this.stage=new BoothStage(dialog);this.turnIndex=-1;
  this.$('halfMotion').value=this.motion;this.$('halfMotion').onchange=()=>{this.motion=this.$('halfMotion').value;try{localStorage.setItem('pg-booth-motion',this.motion);}catch{}this.draw();};
  this.motionQuery?.addEventListener?.('change',e=>{this.reduced=e.matches;this.draw();});
  this.$('halfPrev').onclick=()=>this.step(-1);this.$('halfNext').onclick=()=>this.step(1);
  this.$('halfAuto').onclick=()=>{this.auto=!this.auto;this.last=0;this.renderAuto();};
  this.$('halfResume').onclick=()=>this.finish();
  this.$('halfAgain').onclick=()=>{this.elapsed=0;this.last=0;this.auto=true;this.renderAuto();this.draw();};
  this.$('halfInk').onclick=()=>{this.ink=!this.ink;this.$('halfInk').setAttribute('aria-pressed',String(this.ink));this.draw();};
  dialog.addEventListener('cancel',e=>{e.preventDefault();this.finish();});
 }
 get motionEnabled(){return this.motion==='on'||this.motion!=='off'&&!this.reduced;}
 get openNow(){return this.dialog.open&&!!this.report;}
 open(report){
  this.report=report;this.index=0;this.auto=true;this.elapsed=0;this.last=0;this.ink=true;
  this.dialog.dataset.mode=report.mode||'halftime';this.dialog.dataset.reduced=String(this.reduced);
  const pre=report.mode==='pregame',post=report.mode==='postgame';
  this.$('halfEyebrow').textContent=pre?'PGI · THE PREGAME BOOTH':post?'PGI · THE POSTGAME BOOTH':'PGI · THE HALFTIME BOOTH';
  this.$('halfTitle').textContent=pre?'Before the first snap.':post?'One more look. All heart.':'Bring out the yellow marker.';
  this.$('halfScore').textContent=report.teams.map((t,i)=>pre?t.abbr:`${t.abbr} ${report.scores[i]}`).join(pre?' vs ':' — ');
  this.$('halfResume').textContent=pre?'LET’S PLAY · KICK OFF ↗':post?'FINAL SCORE · WHAT’S NEXT ↗':'BACK TO FOOTBALL · SECOND HALF ↗';
  this.$('halfHome').textContent=report.teams[0].abbr;this.$('halfAway').textContent=report.teams[1].abbr;
  this.$('halfTableTitle').textContent=report.tableTitle||'First-half box score';
  this.$('halfTableLabel').textContent=pre?'Lineup / unit':post?'At the final whistle':'At the break';
  this.$('halfInk').setAttribute('aria-pressed','true');
  const body=this.$('halfStats');body.replaceChildren();
  const rows=report.rows||[['Offensive yards',...report.box.map(b=>b.rushYards+b.passYards)]];
  for(const [label,...values] of rows){
   const tr=document.createElement('tr'),th=document.createElement('th');th.scope='row';th.textContent=label;tr.append(th);
   for(const value of values){const td=document.createElement('td');td.textContent=value;tr.append(td);}body.append(tr);
  }
  this.render();if(!this.dialog.open)this.dialog.showModal();this.$('halfScroll').scrollTop=0;this.$('halfResume').focus({preventScroll:true});
 }
 renderAuto(){this.$('halfAuto').textContent=this.auto?'Ⅱ PAUSE SHOW':'▶ PLAY SHOW';this.$('halfAuto').setAttribute('aria-pressed',String(!this.auto));this.dialog.dataset.playing=String(this.auto);this.draw();}
 render(){
  const s=this.report.segments[this.index];this.turnIndex=-1;this.$('halfSegment').textContent=s.title;
  const transcript=this.$('halfTranscript');transcript.replaceChildren();
  for(const turn of broadcastBeat(s,0).turns){const p=document.createElement('p'),b=document.createElement('b');b.textContent=turn.speaker==='al'?'AL: ':'JOHN: ';p.append(b,turn.text);transcript.append(p);}
  this.$('halfClosing').textContent=s.closing||'';this.$('halfClosing').hidden=!!s.turns||!s.closing;
  this.$('halfCount').textContent=`${this.index+1} / ${this.report.segments.length}`;this.$('halfPrev').disabled=this.index===0;this.$('halfNext').disabled=this.index===this.report.segments.length-1;
  this.$('halfCaption').textContent=s.caption||s.title;this.$('halfTag').textContent=s.tag||'FOR THE LOVE OF FOOTBALL';
  this.$('halfFeed').textContent=s.visual==='highlight'?'REPLAY ROOM':['diagram','package'].includes(s.visual)?'THE YELLOW BOARD':s.visual==='stats'?'BY THE NUMBERS':'IN THE BOOTH';
  this.$('halfScreen').setAttribute('aria-label',s.visual==='highlight'?`${s.caption}. ${s.detail||s.clip.detail}. Yellow markings identify a recorded player and the ball carrier’s path.`:s.caption||s.title);
  this.$('halfInk').hidden=!['highlight','diagram','package'].includes(s.visual);
  this.$('halfAgain').textContent=s.visual==='highlight'?'↺ RUN IT AGAIN':'↺ SHOW IT AGAIN';
  this.$('halfProgress').style.width='0%';this.dialog.dataset.speaker='al';this.dialog.dataset.visual=s.visual||'matchup';
  this.renderAuto();this.draw();
 }
 draw(){
  this.$('halfMotionHint').textContent=this.motion==='system'&&this.reduced?'Your device requests reduced motion. Select On to animate the booth.':this.motion==='off'?'Host animation is off.':'Host animation follows the speaking turns.';
  if(!this.report)return;const s=this.report.segments[this.index],beat=broadcastBeat(s,this.elapsed);
  if(this.turnIndex!==beat.index){
   this.turnIndex=beat.index;this.dialog.dataset.speaker=beat.turn.speaker;
   for(const name of ['al','john']){const line=beat.turns.slice(0,beat.index+1).findLast(t=>t.speaker===name)||beat.turns.find(t=>t.speaker===name);this.$(name==='al'?'halfAl':'halfJohn').textContent=line?.text||'';}
   this.$('halfOnAir').textContent=`${beat.turn.speaker==='al'?'AL MICHAELS':'JOHN MADDEN'} · IN THE BOOTH`;
  }
  // Let John hold the film while he explains; roll it on Al's response.
  const filmTime=s.turns?(beat.index===0?Math.min(3.49,this.elapsed*.7):beat.index===1?3.5+Math.min(4.49,beat.turnElapsed*.8):beat.index===2?8+Math.min(4,beat.turnElapsed):12):this.elapsed;
  paintBroadcast(this.$('halfScreen'),this.report,s,filmTime,{reduced:!this.motionEnabled,ink:this.ink});
  this.stage.draw({speaker:beat.turn.speaker,pose:beat.turn.pose,time:this.elapsed,moving:this.auto&&this.motionEnabled});
 }
 step(direction){this.index=Math.max(0,Math.min(this.report.segments.length-1,this.index+direction));this.elapsed=0;this.last=0;this.render();}
 tick(now,hidden=false){
  if(!this.openNow){this.last=0;return;}
  if(hidden){this.last=0;return;}
  const dt=this.last?Math.min(.1,Math.max(0,(now-this.last)/1000)):0;this.last=now;
  if(!this.auto)return;
  const s=this.report.segments[this.index],duration=broadcastBeat(s,this.elapsed).duration;this.elapsed+=dt;
  this.$('halfProgress').style.width=`${Math.min(100,this.elapsed/duration*100)}%`;
  this.draw();
  if(this.elapsed>=duration){if(this.index<this.report.segments.length-1)this.step(1);else{this.auto=false;this.renderAuto();}}
 }
 finish(){if(!this.openNow)return;const mode=this.report.mode||'halftime';this.dialog.close();this.report=null;this.last=0;this.onResume(mode);}
}
