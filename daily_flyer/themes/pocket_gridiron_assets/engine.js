export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const PLAYS=[{id:'dive',name:'Inside run',kind:'run',hint:'Follow the blocks'},{id:'sweep',name:'Wide sweep',kind:'run',hint:'Find the edge'},{id:'slants',name:'Quick slants',kind:'pass',hint:'Fast & underneath'},{id:'verts',name:'Go routes',kind:'pass',hint:'Let it fly'}];
export const DEFENSE=[{id:'zone',name:'Zone',hint:'Protect the space'},{id:'man',name:'Man cover',hint:'Stay with them'},{id:'blitz',name:'Blitz',hint:'Bring pressure'}];
export class Game {
 constructor(home,away,difficulty='pro',rng=Math.random){this.teams=[home,away];this.rng=rng;this.difficulty=difficulty;this.scores=[0,0];this.quarter=1;this.clock=45;this.offense=0;this.spot=25;this.target=35;this.down=1;this.phase='call';this.play='slants';this.defense='zone';this.events=[];this.stats={yards:0,completions:0,attempts:0,tackles:0};this.paused=false;this.time=0;this.setFormation();}
 emit(type,text,detail=''){this.events.push({type,text,detail});}
 get userOffense(){return this.offense===0;}
 get controlled(){return this.userOffense?this.carrier:this.defenders[this.selected];}
 setFormation(){
  const team=this.teams[this.offense];const line=team.offense;
  this.players=line.map((p,i)=>({...p,slot:i,x:[26.5,27,7,46,36,23,30][i],y:this.spot+[-4,-7,0,0,-.5,-.5,-.5][i],speed:4.8+(p.speed||70)/35,stun:0,phase:0}));
  const opp=this.teams[1-this.offense];
  this.defenders=opp.defense.map((p,i)=>({...p,slot:i,x:[23,30,15,39,8,45,26.5][i],y:Math.min(106,this.spot+[1.5,1.5,5,5,9,9,14][i]),speed:5.3+(p.speed||70)/40,stun:0,phase:0}));
  this.carrier=this.players[0];this.selected=2;this.pass=null;this.passed=false;this.crossed=false;this.liveTime=0;this.burstLeft=0;this.burstCooldown=0;this.diveLeft=0;this.diveCooldown=0;this.evaded=false;this.breakUsed=false;this.cameraY=this.spot+12;this.ballVisible=true;
 }
 choose(id){if(this.phase!=='call'&&this.phase!=='ready')return;if(this.userOffense){if(!PLAYS.some(p=>p.id===id))return;this.play=id;}else{if(!DEFENSE.some(p=>p.id===id))return;this.defense=id;this.play=this.rng()<.46?(this.rng()<.5?'dive':'sweep'):(this.rng()<.5?'slants':'verts');}this.phase='ready';this.setFormation();}
 snap(){if(this.phase!=='ready')return;this.phase='live';this.liveTime=0;this.emit('snap','');if(this.play==='dive'||this.play==='sweep')this.carrier=this.players[1];}
 burst(){if(this.phase!=='live')return;if(this.userOffense){if(this.pass||this.burstCooldown>0)return;this.burstLeft=.6;this.burstCooldown=3;this.evaded=false;this.emit('burst','');}else{if(this.diveCooldown>0)return;this.diveLeft=.32;this.diveCooldown=1.7;const p=this.controlled,b=this.carrier;const d=distance(p,b)||1;p.dx=(b.x-p.x)/d;p.dy=(b.y-p.y)/d;this.emit('dive','');}}
 switchDefender(){if(this.userOffense||this.phase!=='live')return;const candidates=this.defenders.map((p,i)=>({i,d:distance(p,this.carrier)+(i===this.selected?7:0)})).sort((a,b)=>a.d-b.d);this.selected=candidates[0].i;}
 throwTo(index){if(this.phase!=='live'||this.pass||this.passed||this.crossed||!['slants','verts'].includes(this.play)||this.carrier!==this.players[0])return false;const target=this.players[index+2];if(!target)return false;
  const range=distance(this.carrier,target);if(range>55)return false;
  const pressured=this.defenders.some(d=>distance(d,this.carrier)<3);const err=(100-(this.carrier.accuracy||78))/36+(pressured?1.7:0);
  this.pass={x:this.carrier.x,y:this.carrier.y,sx:this.carrier.x,sy:this.carrier.y,tx:clamp(target.x+(this.rng()-.5)*err,1,52),ty:target.y+(this.rng()-.5)*err,target,elapsed:0,duration:clamp(range/36,.3,1.4)};
  this.passed=true;if(this.userOffense)this.stats.attempts++;this.emit('throw','');return true;
 }
 move(p,dx,dy,speed,dt){if(p.stun>0)return;const n=Math.hypot(dx,dy);if(n>.04){p.x+=dx/Math.max(1,n)*speed*dt;p.y+=dy/Math.max(1,n)*speed*dt;p.phase+=dt*14;}p.x=clamp(p.x,-.2,53.5);p.y=clamp(p.y,-9,110);}
 route(p){let depth=this.liveTime*p.speed;const slot=p.slot;let x=[0,0,7,46,36][slot],y=this.spot+Math.min(depth,45);if(this.play==='slants'){x=slot===2?Math.min(33,7+depth*.8):slot===3?Math.max(21,46-depth*.8):36-depth*.35;y=this.spot+Math.min(depth*.7,30);}if(this.play==='sweep'&&slot===4)x=44;return {x:clamp(x,3,50),y:Math.min(106,y)};}
 tick(dt,input={x:0,y:0}){
  if(this.paused||this.phase==='final')return;dt=Math.min(.05,dt);this.time+=dt;
  if(this.phase==='dead'){this.deadTimer-=dt;if(this.deadTimer<=0)this.next();return;}
  if(this.phase!=='live')return;
  this.liveTime+=dt;if(this.quarter<=4)this.clock=Math.max(0,this.clock-dt);
  this.burstLeft=Math.max(0,this.burstLeft-dt);this.burstCooldown=Math.max(0,this.burstCooldown-dt);this.diveLeft=Math.max(0,this.diveLeft-dt);this.diveCooldown=Math.max(0,this.diveCooldown-dt);
  for(const p of [...this.players,...this.defenders])p.stun=Math.max(0,p.stun-dt);
  const controlled=this.controlled;
  if(this.userOffense&&!this.pass)this.move(controlled,input.x,input.y,controlled.speed*(this.burstLeft>0?1.55:1),dt);
  if(!this.userOffense){if(this.diveLeft>0)this.move(controlled,controlled.dx,controlled.dy,controlled.speed*2,dt);else this.move(controlled,input.x,input.y,controlled.speed*(this.diveCooldown>1.1?.48:1.12),dt);}
  // Blockers occupy rush lanes and briefly engage nearby defenders.
  for(const p of this.players){
   if(p===this.carrier||this.pass?.target===p)continue;
   if(p.slot===5||p.slot===6||p.slot===1){const target=this.defenders.filter(d=>d.stun<=0).sort((a,b)=>distance(a,p)-distance(b,p))[0];if(target){const guard=this.liveTime<2.2?this.spot+1:this.carrier.y+2;this.move(p,target.x-p.x,clamp(guard-p.y,-1,1),p.speed*.68,dt);if(distance(p,target)<2.1&&this.liveTime<5){target.stun=Math.max(target.stun,.09);p.stun=.06;}}}
   else if(p.slot>=2&&p.slot<=4){const r=this.route(p);this.move(p,r.x-p.x,r.y-p.y,p.speed,dt);}
  }
  if(!this.userOffense&&!this.pass){
   const p=this.carrier;let tx=26,ty=p.y+12;
   if(p===this.players[0]&&!this.passed){tx=26+Math.sin(this.liveTime)*4;ty=this.spot-5;if(this.liveTime>1.4+this.rng()*.8){const options=this.players.slice(2,5).map((r,i)=>({i,gap:Math.min(...this.defenders.map(d=>distance(r,d)))})).sort((a,b)=>b.gap-a.gap);this.throwTo(options[0].i);}}
   else{const close=this.defenders.filter(d=>d.y>p.y-2&&distance(d,p)<13).sort((a,b)=>distance(a,p)-distance(b,p))[0];if(this.play==='sweep'&&this.liveTime<1.8)tx=45;else if(close)tx=clamp(p.x+(p.x<close.x?-13:13),4,49);else tx=clamp(p.x,5,48);}
   this.move(p,tx-p.x,ty-p.y,p.speed*.92,dt);
  }
  const factor=this.difficulty==='rookie'?.79:this.difficulty==='legend'?1.06:.91;
  for(const d of this.defenders){
   if(!this.userOffense&&d===controlled)continue;
   let target=this.carrier;
   if(this.pass)target={x:this.pass.tx,y:this.pass.ty};
   else if(this.carrier===this.players[0]&&!this.passed&&!this.crossed&&d.slot>=2){
    if(d.slot<5||this.defense==='man')target=this.players[2+(d.slot%3)];
    else target={x:d.slot===5?43:25,y:this.spot+12+this.liveTime*2};
    if(this.defense==='blitz'&&d.slot===2)target=this.carrier;
   }
   this.move(d,target.x-d.x,target.y-d.y,d.speed*(this.userOffense?factor:.91),dt);
  }
  if(this.pass){
   const b=this.pass;b.elapsed+=dt;const u=clamp(b.elapsed/b.duration,0,1);b.x=b.sx+(b.tx-b.sx)*u;b.y=b.sy+(b.ty-b.sy)*u;
   if(u>.66){const interceptor=this.defenders.find(d=>d.stun<=0&&distance(d,b)<1.45);if(interceptor){this.pass=null;this.finish('interception',interceptor.y);return;}}
   if(u>=1){if(distance(b,b.target)<=2.8){this.carrier=b.target;this.pass=null;if(this.userOffense)this.stats.completions++;this.emit('catch','CAUGHT!',this.carrier.name);}else{this.pass=null;this.finish('incomplete',this.spot);return;}}
  }else{
   if(this.carrier.y>this.spot+.15)this.crossed=true;
   if(this.carrier.y>=100){this.finish('touchdown',100);return;}
   if(this.carrier.x<=.4||this.carrier.x>=52.9){this.finish('out',this.carrier.y);return;}
   for(const d of this.defenders){if(d.stun>0)continue;const tackleRadius=(!this.userOffense&&d===controlled&&this.diveLeft>0)?3:1.65;if(distance(d,this.carrier)<tackleRadius&&this.liveTime>.35){
     if(this.userOffense&&this.burstLeft>.28&&!this.evaded){this.evaded=true;d.stun=1;this.emit('juke','BROKE A TACKLE!');continue;}
     // A powerful runner gets one low-probability broken tackle, never endless Bo mode.
     if(!this.breakUsed&&(this.carrier.power||70)>88&&this.rng()<.22){this.breakUsed=true;d.stun=1;continue;}
     if(!this.userOffense)this.stats.tackles++;this.finish('tackle',this.carrier.y);return;
   }}
  }
  this.cameraY+=(clamp((this.pass?this.pass.y:this.carrier.y)+16,13,93)-this.cameraY)*Math.min(1,dt*6);
  if(this.liveTime>18)this.finish('tackle',this.carrier.y);
 }
 finish(kind,y){
  if(this.phase!=='live'&&kind!=='punt'&&kind!=='fieldgoal'&&kind!=='miss')return;
  const offense=this.offense;const gain=kind==='incomplete'?0:Math.round(y-this.spot);if(this.userOffense&&!['punt','fieldgoal','miss','interception'].includes(kind))this.stats.yards+=gain;
  this.phase='dead';this.deadTimer=2.2;this.pass=null;let title='',detail='';
  if(kind==='touchdown'){this.scores[offense]+=7;this.pending={offense:1-offense,spot:25,newSeries:true};title='TOUCHDOWN!';detail=`${this.teams[offense].abbr} +7 · extra point included`;}
  else if(kind==='interception'){this.pending={offense:1-offense,spot:clamp(100-y,1,99),newSeries:true};title='INTERCEPTED!';detail='Possession changes at the catch';}
  else if(kind==='fieldgoal'){this.scores[offense]+=3;this.pending={offense:1-offense,spot:25,newSeries:true};title='IT’S GOOD!';detail='Three points on the board';}
  else if(kind==='miss'){this.pending={offense:1-offense,spot:clamp(100-this.spot,20,99),newSeries:true};title='NO GOOD';detail='The other team takes over';}
  else if(kind==='punt'){this.pending={offense:1-offense,spot:clamp(100-y,20,99),newSeries:true};title='PUNT AWAY';detail='Flip the field';}
  else if(y<=0&&kind!=='incomplete'){this.scores[1-offense]+=2;this.pending={offense:1-offense,spot:35,newSeries:true};title='SAFETY';detail='Two points to the defense';}
  else if(kind!=='incomplete'&&y>=this.target){this.pending={offense,spot:clamp(y,1,99),newSeries:true};title='FIRST DOWN!';detail=`${gain} yards · move the chains`;}
  else if(this.down>=4){this.pending={offense:1-offense,spot:clamp(100-y,1,99),newSeries:true};title='TURNOVER ON DOWNS';detail='The defense holds';}
  else{this.pending={offense,spot:kind==='incomplete'?this.spot:clamp(y,1,99),newSeries:false};title=kind==='incomplete'?'INCOMPLETE':gain<0?`${Math.abs(gain)} YARD LOSS`:gain===0?'NO GAIN':`${gain} YARD GAIN`;detail=kind==='out'?'Out of bounds':kind==='tackle'?(this.carrier===this.players[0]&&gain<0?'Sacked!':'Brought down'):'Try another route';}
  this.emit('result',title,detail);this.lastResult=`${title} — ${detail}`;
  if(this.quarter>4&&this.scores[0]!==this.scores[1]){this.pendingFinal=true;}
 }
 next(){
  if(this.pendingFinal||(this.quarter===4&&this.clock<=0&&this.scores[0]!==this.scores[1])){this.phase='final';this.emit('final','FINAL');return;}
  const p=this.pending;if(p){this.offense=p.offense;this.spot=p.spot;if(p.newSeries){this.down=1;this.target=Math.min(100,this.spot+10);}else this.down++;}
  if(this.clock<=0&&this.quarter<=4){this.quarter++;this.clock=45;if(this.quarter===3){this.offense=1;this.spot=25;this.down=1;this.target=35;}if(this.quarter===5)this.emit('overtime','OVERTIME','Next score wins');else this.emit('quarter',`QUARTER ${this.quarter}`);}
  this.phase='call';this.setFormation();this.emit('call','');
 }
 kick(type){if(!['call','ready'].includes(this.phase)||this.down!==4)return false;const yards=100-this.spot+17;if(type==='fieldgoal'&&yards>55)return false;if(type==='punt')this.finish('punt',Math.min(100,this.spot+35+this.rng()*10));else this.finish(this.rng()<clamp(1.1-yards/120,.4,.95)?'fieldgoal':'miss',this.spot);return true;}
}
