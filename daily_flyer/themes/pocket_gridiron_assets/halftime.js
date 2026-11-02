import {paintBroadcast} from './broadcast-screen.js?v=12';

// Shared, skippable pregame/halftime presentation. The live engine stays still.
export class HalftimeShow {
 constructor(dialog,onResume){
  this.dialog=dialog;this.onResume=onResume;this.index=0;this.report=null;this.auto=true;this.elapsed=0;this.last=0;this.ink=true;
  this.reduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
  this.$=id=>dialog.querySelector('#'+id);
  this.$('halfPrev').onclick=()=>this.step(-1);this.$('halfNext').onclick=()=>this.step(1);
  this.$('halfAuto').onclick=()=>{this.auto=!this.auto;this.last=0;this.renderAuto();};
  this.$('halfResume').onclick=()=>this.finish();
  this.$('halfAgain').onclick=()=>{this.elapsed=0;this.last=0;this.auto=!this.reduced;this.renderAuto();this.draw();};
  this.$('halfInk').onclick=()=>{this.ink=!this.ink;this.$('halfInk').setAttribute('aria-pressed',String(this.ink));this.draw();};
  dialog.addEventListener('cancel',e=>{e.preventDefault();this.finish();});
 }
 get openNow(){return this.dialog.open&&!!this.report;}
 open(report){
  this.report=report;this.index=0;this.auto=!this.reduced;this.elapsed=0;this.last=0;this.ink=true;
  this.dialog.dataset.mode=report.mode||'halftime';this.dialog.dataset.reduced=String(this.reduced);
  const pre=report.mode==='pregame';
  this.$('halfEyebrow').textContent=pre?'PGI · THE PREGAME BOOTH':'PGI · THE HALFTIME BOOTH';
  this.$('halfTitle').textContent=pre?'Before the first snap.':'Bring out the yellow marker.';
  this.$('halfScore').textContent=report.teams.map((t,i)=>pre?t.abbr:`${t.abbr} ${report.scores[i]}`).join(pre?' vs ':' — ');
  this.$('halfResume').textContent=pre?'LET’S PLAY · KICK OFF ↗':'BACK TO FOOTBALL · SECOND HALF ↗';
  this.$('halfHome').textContent=report.teams[0].abbr;this.$('halfAway').textContent=report.teams[1].abbr;
  this.$('halfTableTitle').textContent=report.tableTitle||'First-half box score';
  this.$('halfTableLabel').textContent=pre?'Lineup / unit':'At the break';
  this.$('halfInk').setAttribute('aria-pressed','true');
  const body=this.$('halfStats');body.replaceChildren();
  const rows=report.rows||[['Offensive yards',...report.box.map(b=>b.rushYards+b.passYards)]];
  for(const [label,...values] of rows){
   const tr=document.createElement('tr'),th=document.createElement('th');th.scope='row';th.textContent=label;tr.append(th);
   for(const value of values){const td=document.createElement('td');td.textContent=value;tr.append(td);}body.append(tr);
  }
  this.render();if(!this.dialog.open)this.dialog.showModal();this.$('halfScroll').scrollTop=0;this.$('halfResume').focus({preventScroll:true});
 }
 renderAuto(){this.$('halfAuto').textContent=this.auto?'Ⅱ PAUSE SHOW':'▶ PLAY SHOW';this.$('halfAuto').setAttribute('aria-pressed',String(!this.auto));this.dialog.dataset.playing=String(this.auto);}
 render(){
  const s=this.report.segments[this.index];this.$('halfSegment').textContent=s.title;this.$('halfAl').textContent=s.al;this.$('halfJohn').textContent=s.john;
  this.$('halfClosing').textContent=s.closing||'';this.$('halfClosing').hidden=!s.closing;
  this.$('halfCount').textContent=`${this.index+1} / ${this.report.segments.length}`;this.$('halfPrev').disabled=this.index===0;this.$('halfNext').disabled=this.index===this.report.segments.length-1;
  this.$('halfCaption').textContent=s.caption||s.title;this.$('halfTag').textContent=s.tag||'FOR THE LOVE OF FOOTBALL';
  this.$('halfFeed').textContent=s.visual==='highlight'?'REPLAY ROOM':s.visual==='diagram'?'THE YELLOW BOARD':s.visual==='stats'?'BY THE NUMBERS':'IN THE BOOTH';
  this.$('halfScreen').setAttribute('aria-label',s.visual==='highlight'?`${s.caption}. ${s.detail||s.clip.detail}. Yellow markings identify a recorded player and the ball carrier’s path.`:s.caption||s.title);
  this.$('halfInk').hidden=!['highlight','diagram'].includes(s.visual);
  this.$('halfAgain').textContent=s.visual==='highlight'?'↺ RUN IT AGAIN':'↺ SHOW IT AGAIN';
  this.$('halfProgress').style.width='0%';this.dialog.dataset.speaker='al';this.dialog.dataset.visual=s.visual||'matchup';
  this.renderAuto();this.draw();
 }
 draw(){if(this.report)paintBroadcast(this.$('halfScreen'),this.report,this.report.segments[this.index],this.elapsed,{reduced:this.reduced,ink:this.ink});}
 step(direction){this.index=Math.max(0,Math.min(this.report.segments.length-1,this.index+direction));this.elapsed=0;this.last=0;this.render();}
 tick(now,hidden=false){
  if(!this.openNow){this.last=0;return;}
  if(hidden){this.last=0;return;}
  const dt=this.last?Math.min(.1,Math.max(0,(now-this.last)/1000)):0;this.last=now;
  if(!this.auto)return;
  const s=this.report.segments[this.index],duration=Math.max(17,(s.al+s.john+(s.closing||'')).split(/\s+/).length/3.1);this.elapsed+=dt;
  const handoff=['highlight','diagram'].includes(s.visual)?3.5:duration*.42;this.dialog.dataset.speaker=this.elapsed<handoff?'al':'john';this.$('halfProgress').style.width=`${Math.min(100,this.elapsed/duration*100)}%`;
  this.draw();
  if(this.elapsed>=duration){if(this.index<this.report.segments.length-1)this.step(1);else{this.auto=false;this.renderAuto();}}
 }
 finish(){if(!this.openNow)return;const mode=this.report.mode||'halftime';this.dialog.close();this.report=null;this.last=0;this.onResume(mode);}
}
