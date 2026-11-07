import {paintBroadcast} from './broadcast-screen.js?v=33';
import {broadcastBeat} from './booth-lines.js?v=33';
import {BoothStage} from './booth-stage.js?v=33';
import {syllableEnergy} from './booth-chatter.js?v=33';
import {REPORTER} from './sideline.js?v=33';
import {SidelineStage} from './sideline-stage.js?v=33';
const labels={al:'AL',john:'JOHN',coach:'COACH',[REPORTER.id]:REPORTER.label};

// Shared, skippable pregame/halftime presentation. The live engine stays still.
export class HalftimeShow {
 constructor(dialog,onResume,onSilence=()=>{}){
  this.dialog=dialog;this.onResume=onResume;this.onSilence=onSilence;this.generation=0;this.wordMark=null;this.wordNodes={};this.index=0;this.report=null;this.auto=true;this.elapsed=0;this.last=0;this.ink=true;
  this.motionQuery=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');this.reduced=!!this.motionQuery?.matches;
  try{this.motion=localStorage.getItem('pg-booth-motion')||'on';}catch{this.motion='on';}
  this.$=id=>dialog.querySelector('#'+id);
  this.stage=new BoothStage(dialog);this.turnIndex=-1;
  this.sidelineStage=new SidelineStage(this.$('host-casey'));
  this.$('halfMotion').value=this.motion;this.$('halfMotion').onchange=()=>{this.motion=this.$('halfMotion').value;try{localStorage.setItem('pg-booth-motion',this.motion);}catch{}this.draw();};
  this.motionQuery?.addEventListener?.('change',e=>{this.reduced=e.matches;this.draw();});
  this.$('halfPrev').onclick=()=>this.step(-1);this.$('halfNext').onclick=()=>this.step(1);
  this.$('halfAuto').onclick=()=>{this.onSilence();this.auto=!this.auto;this.last=0;this.renderAuto();};
  this.$('halfResume').onclick=()=>this.finish();
  this.$('halfAgain').onclick=()=>{this.onSilence();this.generation++;this.elapsed=0;this.last=0;this.auto=true;this.renderAuto();this.draw();};
  this.$('halfInk').onclick=()=>{this.ink=!this.ink;this.$('halfInk').setAttribute('aria-pressed',String(this.ink));this.draw();};
  dialog.addEventListener('cancel',e=>{e.preventDefault();this.finish();});
  dialog.addEventListener('close',()=>this.onSilence());
 }
 get motionEnabled(){return this.motion==='on'||this.motion!=='off'&&!this.reduced;}
 get openNow(){return this.dialog.open&&!!this.report;}
 get speech(){
  if(!this.openNow||!this.auto)return null;
  const beat=broadcastBeat(this.report.segments[this.index],this.elapsed);
  return {key:`${this.generation}:${this.index}:${beat.index}`,speaker:beat.turn.speaker,word:beat.word,wordIndex:beat.wordIndex,wordElapsed:beat.wordElapsed};
 }
 open(report){
  this.onSilence();this.generation++;
  this.report=report;this.index=0;this.auto=true;this.elapsed=0;this.last=0;this.ink=true;
  this.dialog.dataset.mode=report.mode||'halftime';this.dialog.dataset.reduced=String(this.reduced);
  const pre=report.mode==='pregame',post=report.mode==='postgame';
  this.$('halfDetails').open=!pre;this.$('halfSettings').open=false;
  this.$('halfDetailsLabel').textContent=pre?'Lineups & show details':'Show details & box score';
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
  this.onSilence();
  const s=this.report.segments[this.index];this.turnIndex=-1;this.$('halfSegment').textContent=s.title;
  const transcript=this.$('halfTranscript');transcript.replaceChildren();
  for(const turn of broadcastBeat(s,0).turns){const p=document.createElement('p'),b=document.createElement('b');b.textContent=`${labels[turn.speaker]}: `;p.append(b,turn.text);transcript.append(p);}
  this.$('halfClosing').textContent=s.closing||'';this.$('halfClosing').hidden=!!s.turns||!s.closing;
  this.$('halfCount').textContent=`${this.index+1} / ${this.report.segments.length}`;this.$('halfPrev').disabled=this.index===0;this.$('halfNext').disabled=this.index===this.report.segments.length-1;
  this.$('halfCaption').textContent=s.caption||s.title;this.$('halfTag').textContent=s.tag||'FOR THE LOVE OF FOOTBALL';
  this.$('halfFeed').textContent=s.visual==='highlight'?'REPLAY ROOM':['diagram','package'].includes(s.visual)?'THE YELLOW BOARD':s.visual==='stats'?'BY THE NUMBERS':'IN THE BOOTH';
  this.$('halfScreen').setAttribute('aria-label',s.visual==='highlight'?`${s.caption}. ${s.detail||s.clip.detail}. Yellow markings identify a recorded player and the ball carrier’s path.`:s.caption||s.title);
  this.$('halfInk').hidden=!['highlight','diagram','package'].includes(s.visual);
  this.$('halfAgain').textContent=s.visual==='highlight'?'↺ RUN IT AGAIN':'↺ SHOW IT AGAIN';
  this.$('halfProgress').style.width='0%';this.dialog.dataset.speaker='al';this.dialog.dataset.visual=s.visual||'matchup';
  this.dialog.dataset.sideline=String(!!s.sideline);
  this.renderAuto();this.draw();
 }
 draw(){
  this.$('halfMotionHint').textContent=this.motion==='system'&&this.reduced?'Your device requests reduced motion. Select On to animate the booth.':this.motion==='off'?'Presentation animation is off.':'Animation is on for the booth, sideline and weather.';
  if(!this.report)return;const s=this.report.segments[this.index],beat=broadcastBeat(s,this.elapsed);
  if(this.turnIndex!==beat.index){
   this.turnIndex=beat.index;this.dialog.dataset.speaker=beat.turn.speaker;
   this.wordMark=null;
   for(const name of ['al','john',REPORTER.id,'coach']){
    const line=beat.turns.slice(0,beat.index+1).findLast(t=>t.speaker===name)||beat.turns.find(t=>t.speaker===name),text=line?.text||'',container=this.$({al:'halfAl',john:'halfJohn',casey:'halfCasey',coach:'halfCoach'}[name]);
    // Screen readers receive one complete turn, not a live announcement per word.
    const accessible=document.createElement('span');accessible.className='booth-readable';accessible.textContent=text;
    const visual=document.createElement('span');visual.setAttribute('aria-hidden','true');this.wordNodes[name]=[];
    for(const word of text.match(/\S+/g)||[]){const node=document.createElement('span');node.className='booth-word';node.textContent=word;this.wordNodes[name].push(node);visual.append(node,document.createTextNode(' '));}
    container.replaceChildren(accessible,visual);
   }
   this.$('halfOnAir').textContent=beat.turn.speaker==='coach'?'HEAD COACH · PGI FICTION':beat.turn.speaker===REPORTER.id?`${REPORTER.name.toUpperCase()} · ${REPORTER.location}`:`${beat.turn.speaker==='al'?'AL MICHAELS':'JOHN MADDEN'} · IN THE BOOTH`;
  }
  const mark=this.wordNodes[beat.turn.speaker]?.[beat.wordIndex]||null;
  if(mark!==this.wordMark){this.wordMark?.classList.remove('current');mark?.classList.add('current');this.wordMark=mark;}
  // Let John hold the film while he explains; roll it on Al's response.
  const filmTime=s.turns?(beat.index===0?Math.min(3.49,this.elapsed*.7):beat.index===1?3.5+Math.min(4.49,beat.turnElapsed*.8):beat.index===2?8+Math.min(4,beat.turnElapsed):12):this.elapsed;
  if(!s.sideline)paintBroadcast(this.$('halfScreen'),this.report,s,filmTime,{reduced:!this.motionEnabled,ink:this.ink});
  const field=beat.turn.speaker===REPORTER.id||beat.turn.speaker==='coach',frame={speaker:beat.turn.speaker,pose:beat.turn.pose,time:this.elapsed,moving:this.auto&&this.motionEnabled,energy:syllableEnergy(beat.word,beat.wordElapsed)};
  this.$('halfSideline').hidden=!field;this.dialog.querySelector('.boothcast').hidden=field;
  if(field){this.$('host-casey').setAttribute('aria-label',s.interview?'Casey Reed interviewing the fictional PGI head coach on the sideline':'Casey Reed, fictional PGI field reporter, on the sideline');this.$('halfSidelineLocation').textContent=`${this.report.teams[s.team].abbr} · ${s.interview?'COACH INTERVIEW · PGI FICTION':'SIDELINE'}`;this.sidelineStage.draw({...frame,team:this.report.teams[s.team],interview:!!s.interview,weather:this.report.weather,reduced:!this.motionEnabled});}
  else this.stage.draw(frame);
 }
 step(direction){this.index=Math.max(0,Math.min(this.report.segments.length-1,this.index+direction));this.elapsed=0;this.last=0;this.render();}
 tick(now,hidden=false){
  if(!this.openNow){this.onSilence();this.last=0;return;}
  if(hidden){this.onSilence();this.last=0;return;}
  const dt=this.last?Math.min(.1,Math.max(0,(now-this.last)/1000)):0;this.last=now;
  if(!this.auto)return;
  const s=this.report.segments[this.index],duration=broadcastBeat(s,this.elapsed).duration;this.elapsed+=dt;
  this.$('halfProgress').style.width=`${Math.min(100,this.elapsed/duration*100)}%`;
  this.draw();
  if(this.elapsed>=duration){if(this.index<this.report.segments.length-1)this.step(1);else{this.onSilence();this.auto=false;this.renderAuto();}}
 }
 finish(){if(!this.openNow)return;this.onSilence();const mode=this.report.mode||'halftime';this.dialog.close();this.report=null;this.last=0;this.onResume(mode);}
}
