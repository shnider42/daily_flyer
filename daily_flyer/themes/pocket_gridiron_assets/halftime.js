// Presentation only: the engine owns the halftime boundary and frozen report.
export class HalftimeShow {
 constructor(dialog,onResume){
  this.dialog=dialog;this.onResume=onResume;this.index=0;this.report=null;this.auto=true;this.elapsed=0;this.last=0;
  this.$=id=>dialog.querySelector('#'+id);
  this.$('halfPrev').onclick=()=>this.step(-1);this.$('halfNext').onclick=()=>this.step(1);
  this.$('halfAuto').onclick=()=>{this.auto=!this.auto;this.renderAuto();};
  this.$('halfResume').onclick=()=>this.finish();
  dialog.addEventListener('cancel',e=>{e.preventDefault();this.finish();});
 }
 open(report){
  this.report=report;this.index=0;this.auto=true;this.elapsed=0;this.last=0;
  this.$('halfScore').textContent=report.teams.map((t,i)=>`${t.abbr} ${report.scores[i]}`).join('  —  ');
  this.$('halfHome').textContent=report.teams[0].abbr;this.$('halfAway').textContent=report.teams[1].abbr;
  const body=this.$('halfStats');body.replaceChildren();
  for(const [label,value] of [['Offensive yards',b=>b.rushYards+b.passYards],['Rush / pass yards',b=>`${b.rushYards} / ${b.passYards}`],['Passing',b=>`${b.completions} / ${b.attempts}`],['Takeaways',b=>b.takeaways],['Return yards',b=>b.returnYards]]){
   const tr=document.createElement('tr'),th=document.createElement('th');th.scope='row';th.textContent=label;tr.append(th);
   for(const b of report.box){const td=document.createElement('td');td.textContent=value(b);tr.append(td);}body.append(tr);
  }
  this.render();if(!this.dialog.open)this.dialog.showModal();
 }
 renderAuto(){this.$('halfAuto').textContent=this.auto?'PAUSE SHOW':'PLAY SHOW';this.$('halfAuto').setAttribute('aria-pressed',String(!this.auto));}
 render(){
  const s=this.report.segments[this.index];this.$('halfSegment').textContent=s.title;this.$('halfAl').textContent=s.al;this.$('halfJohn').textContent=s.john;
  this.$('halfClosing').textContent=s.closing||'';this.$('halfClosing').hidden=!s.closing;
  this.$('halfCount').textContent=`${this.index+1} / ${this.report.segments.length}`;this.$('halfPrev').disabled=this.index===0;this.$('halfNext').disabled=this.index===this.report.segments.length-1;
  this.$('halfProgress').style.width='0%';this.dialog.dataset.speaker='al';this.renderAuto();
 }
 step(direction){this.index=Math.max(0,Math.min(this.report.segments.length-1,this.index+direction));this.elapsed=0;this.render();}
 tick(now,hidden=false){
  if(!this.dialog.open){this.last=0;return;}const dt=this.last?Math.min(.5,Math.max(0,(now-this.last)/1000)):0;this.last=now;
  if(hidden||!this.auto)return;
  const s=this.report.segments[this.index],duration=Math.max(13,(s.al+s.john+(s.closing||'')).split(/\s+/).length/3.4);this.elapsed+=dt;
  this.dialog.dataset.speaker=this.elapsed<duration*.43?'al':'john';this.$('halfProgress').style.width=`${Math.min(100,this.elapsed/duration*100)}%`;
  if(this.elapsed>=duration){if(this.index<this.report.segments.length-1)this.step(1);else{this.auto=false;this.renderAuto();}}
 }
 finish(){if(!this.dialog.open)return;this.dialog.close();this.report=null;this.last=0;this.onResume();}
}
