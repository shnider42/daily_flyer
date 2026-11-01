export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const PLAYS=[
 {id:'dive',name:'Inside run',kind:'run',hint:'Follow the blocks'},
 {id:'sweep',name:'Wide sweep',kind:'run',hint:'Find the right edge'},
 {id:'slants',name:'Quick slants',kind:'pass',hint:'Fast & underneath'},
 {id:'verts',name:'Go routes',kind:'pass',hint:'Stretch the field'},
 {id:'counter',name:'Counter left',kind:'run',hint:'Follow the pulling guard'},
 {id:'curls',name:'Curl hooks',kind:'pass',hint:'Wait for the comeback'},
 {id:'flood',name:'Boot flood',kind:'pass',hint:'Roll right · three levels'}
];
export const DEFENSE=[
 {id:'zone',name:'Zone',hint:'Balanced underneath'},
 {id:'man',name:'Man cover',hint:'Stay with your receiver'},
 {id:'blitz',name:'Blitz',hint:'Pressure the pocket'},
 {id:'cover2',name:'Cover 2',hint:'Two deep · guard the flats'},
 {id:'cover3',name:'Cover 3',hint:'Three deep · concede short'},
 {id:'commit',name:'Run commit',hint:'Crowd the line · risky deep'}
];
const pick=(items,rng)=>items[Math.min(items.length-1,Math.floor(rng()*items.length))];
const animate=(p,slot,x,y)=>({...p,slot,x,y,speed:4.8+(p.speed||70)/35,stun:0,phase:0});
export class Game {
 constructor(home,away,difficulty='pro',rng=Math.random){
  this.teams=[home,away];this.rng=rng;this.difficulty=difficulty;this.scores=[0,0];
  this.quarter=1;this.clock=45;this.offense=0;this.spot=25;this.target=35;this.down=1;
  this.play='slants';this.defense='zone';this.events=[];this.stats={yards:0,returnYards:0,completions:0,attempts:0,tackles:0};
  this.paused=false;this.time=0;this.special=null;this.pending=null;this.pendingFinal=false;
  this.beginKick('kickoff',1,35);
 }
 emit(type,text,detail=''){this.events.push({type,text,detail});}
 get userOffense(){return this.offense===0;}
 get isReturn(){return this.phase==='return';}
 get isLive(){return this.phase==='live'||this.isReturn;}
 get userKicking(){return Boolean(this.special&&this.special.kickingTeam===0);}
 get controlled(){
  if(this.special&&['kick_ready','kick_charge'].includes(this.phase)&&this.userKicking)return this.defenders[6];
  return this.userOffense?this.carrier:this.defenders[this.selected];
 }
 get playDefinition(){return PLAYS.find(p=>p.id===this.play);}
 get canPass(){return this.phase==='live'&&!this.pass&&!this.passed&&!this.crossed&&this.playDefinition.kind==='pass'&&this.carrier===this.players[0];}
 resetPlay(){this.pass=null;this.passed=false;this.crossed=false;this.liveTime=0;this.burstLeft=0;this.burstCooldown=0;this.diveLeft=0;this.diveCooldown=0;this.evaded=false;this.breakUsed=false;this.ballVisible=true;}
 setFormation(){
  const xs=this.play==='counter'?[26.5,35,7,46,16,23,30]:this.play==='flood'?[31,25,7,44,35,25,32]:[26.5,27,7,46,36,23,30];
  this.players=this.teams[this.offense].offense.map((p,i)=>animate(p,i,xs[i],this.spot+[-4,-7,0,0,-.5,-.5,-.5][i]));
  const depths={zone:[1.5,1.5,5,5,9,9,14],man:[1.5,1.5,4,4,5,5,12],blitz:[1.5,1.5,2,5,7,7,14],cover2:[1.5,1.5,5,5,6,17,17],cover3:[1.5,1.5,5,5,16,16,20],commit:[1,1,2,2,4,4,12]}[this.defense];
  const dx=this.defense==='cover2'?[23,30,18,39,7,13,40]:[23,30,15,39,8,45,26.5];
  this.defenders=this.teams[1-this.offense].defense.map((p,i)=>animate(p,i,dx[i],Math.min(107,this.spot+depths[i])));
  this.carrier=this.players[0];this.selected=2;this.resetPlay();this.cameraY=this.spot+12;
 }
 beginDrive(offense,spot,down=1,target=Math.min(100,spot+10)){
  this.special=null;this.pending=null;this.offense=offense;this.spot=spot;this.down=down;this.target=target;this.phase='call';this.defense=pick(DEFENSE,this.rng).id;this.setFormation();
  // CPU special teams are its own decisions, never buttons for the human to call.
  if(!this.userOffense&&down===4){
   if(spot<62){this.beginKick('punt',offense,spot);return;}
   if(117-spot<=55){this.kick('fieldgoal');return;}
  }
  this.emit('call','');
 }
 choose(id){
  if(!['call','ready'].includes(this.phase)||this.paused)return false;
  if(this.userOffense){if(!PLAYS.some(p=>p.id===id))return false;this.play=id;}
  else{if(!DEFENSE.some(p=>p.id===id))return false;this.defense=id;this.play=pick(PLAYS,this.rng).id;}
  this.phase='ready';this.setFormation();return true;
 }
 snap(){if(this.phase!=='ready'||this.paused)return;this.phase='live';this.liveTime=0;this.emit('snap','');if(this.playDefinition.kind==='run')this.carrier=this.players[1];}
 burst(){
  if(!this.isLive||this.paused)return;
  if(this.userOffense){if(this.pass||this.burstCooldown>0)return;this.burstLeft=.6;this.burstCooldown=3;this.evaded=false;this.emit('burst','');}
  else{if(this.diveCooldown>0)return;this.diveLeft=.32;this.diveCooldown=1.7;const p=this.controlled,b=this.carrier,d=distance(p,b)||1;p.dx=(b.x-p.x)/d;p.dy=(b.y-p.y)/d;this.emit('dive','');}
 }
 switchDefender(){
  if(this.userOffense||this.paused||!(this.isLive||['kick_flight','kick_loose'].includes(this.phase)))return;
  const target=this.special?.ball||this.carrier;
  this.selected=this.defenders.map((p,i)=>({i,d:distance(p,target)+(i===this.selected?7:0)})).sort((a,b)=>a.d-b.d)[0].i;
 }
 throwTo(index){
  if(!this.canPass||this.paused)return false;
  const target=this.players[index+2];if(!target)return false;
  const range=distance(this.carrier,target);if(range>55)return false;
  const pressured=this.defenders.some(d=>distance(d,this.carrier)<3),err=(100-(this.carrier.accuracy||78))/36+(pressured?1.7:0);
  this.pass={x:this.carrier.x,y:this.carrier.y,sx:this.carrier.x,sy:this.carrier.y,tx:clamp(target.x+(this.rng()-.5)*err,1,52),ty:target.y+(this.rng()-.5)*err,target,elapsed:0,duration:clamp(range/36,.3,1.4)};
  this.passed=true;if(this.userOffense)this.stats.attempts++;this.emit('throw','');return true;
 }
 move(p,dx,dy,speed,dt){if(p.stun>0)return;const n=Math.hypot(dx,dy);if(n>.04){p.x+=dx/Math.max(1,n)*speed*dt;p.y+=dy/Math.max(1,n)*speed*dt;p.phase+=dt*14;}p.x=clamp(p.x,-.2,53.5);p.y=clamp(p.y,-9,110);}
 route(p,time=this.liveTime){
  const depth=time*p.speed,slot=p.slot;let x=[0,0,7,46,36][slot],y=this.spot+Math.min(depth,45);
  if(this.play==='slants'){x=slot===2?Math.min(33,7+depth*.8):slot===3?Math.max(21,46-depth*.8):36-depth*.35;y=this.spot+Math.min(depth*.7,30);}
  if(this.play==='curls'){
   if(slot===4){x=36-Math.min(depth,22);y=this.spot+Math.min(depth,6);}
   else{const comeback=Math.max(0,Math.min(4,depth-12));x=slot===2?7+comeback*.7:46-comeback*.7;y=this.spot+Math.min(depth,12)-comeback;}
  }
  if(this.play==='flood'){
   if(slot===2){x=7+Math.min(34,Math.max(0,depth-5)*1.1);y=this.spot+Math.min(depth,18);}
   if(slot===3){x=44;y=this.spot+Math.min(depth,45);}
   if(slot===4){x=35+Math.min(14,depth);y=this.spot+Math.min(depth*.5,5);}
  }
  if(this.play==='sweep'&&slot===4)x=44;
  return {x:clamp(x,3,50),y:Math.min(106,y)};
 }
 coverageTarget(d){
  const i=d.slot;
  if(this.pass)return {x:this.pass.tx,y:this.pass.ty};
  if(this.isReturn||this.carrier!==this.players[0]||this.passed||this.crossed)return this.carrier;
  if(i<2||this.defense==='blitz'&&i===2||this.defense==='commit'&&i<4)return this.carrier;
  if(this.defense==='man')return this.players[2+({2:2,3:2,4:0,5:1,6:1}[i])];
  const depth=Math.min(this.liveTime*2,10),s=this.spot;
  const zones={
   zone:[[15,7],[39,7],[7,11],[46,11],[26.5,19]],
   blitz:[[15,7],[36,7],[7,10],[46,10],[26.5,23]],
   cover2:[[18,9],[43,6],[7,6],[13,25+depth],[40,25+depth]],
   cover3:[[16,8],[37,8],[8,23+depth],[45,23+depth],[26.5,28+depth]],
   commit:[[15,3],[39,3],[7,6],[46,6],[26.5,18]]
  }[this.defense];
  const [x,y]=zones[i-2];
  const nearby=this.players.slice(2,5).filter(p=>Math.abs(p.x-x)<10&&Math.abs(p.y-(s+y))<8).sort((a,b)=>distance(a,d)-distance(b,d))[0];
  return nearby||{x,y:Math.min(107,s+y)};
 }
 tick(dt,input={x:0,y:0}){
  if(this.paused||this.phase==='final')return;dt=clamp(dt,0,.05);this.time+=dt;
  if(this.phase==='dead'){this.deadTimer-=dt;if(this.deadTimer<=0)this.next();return;}
  if(this.phase.startsWith('kick_')){this.tickKick(dt,input);return;}
  if(!this.isLive)return;
  this.liveTime+=dt;if(this.quarter<=4)this.clock=Math.max(0,this.clock-dt);
  this.burstLeft=Math.max(0,this.burstLeft-dt);this.burstCooldown=Math.max(0,this.burstCooldown-dt);this.diveLeft=Math.max(0,this.diveLeft-dt);this.diveCooldown=Math.max(0,this.diveCooldown-dt);
  for(const p of [...this.players,...this.defenders])p.stun=Math.max(0,p.stun-dt);
  const controlled=this.controlled;
  if(this.userOffense&&!this.pass)this.move(controlled,input.x,input.y,controlled.speed*(this.burstLeft>0?1.55:1),dt);
  if(!this.userOffense){if(this.diveLeft>0)this.move(controlled,controlled.dx,controlled.dy,controlled.speed*2,dt);else this.move(controlled,input.x,input.y,controlled.speed*(this.diveCooldown>1.1?.48:1.12),dt);}
  for(const p of this.players){
   if(p===this.carrier||this.pass?.target===p)continue;
   if(this.isReturn||p.slot===5||p.slot===6||p.slot===1||this.play==='counter'&&p.slot===4){
    const target=this.defenders.filter(d=>d.stun<=0).sort((a,b)=>distance(a,p)-distance(b,p))[0];
    if(target){
     const pulling=!this.isReturn&&this.play==='counter'&&p.slot===6&&this.liveTime<1.6;
     const guard=this.isReturn?this.carrier.y+5:this.liveTime<2.2?this.spot+1:this.carrier.y+2;
     this.move(p,(pulling?13:target.x)-p.x,clamp(guard-p.y,-1,1),p.speed*(pulling?.95:.68),dt);
     if(distance(p,target)<2.1&&(this.isReturn||this.liveTime<5)){target.stun=Math.max(target.stun,.09);p.stun=.06;}
    }
   }else if(p.slot>=2&&p.slot<=4){const r=this.route(p);this.move(p,r.x-p.x,r.y-p.y,p.speed,dt);}
  }
  if(!this.userOffense&&!this.pass){
   const p=this.carrier;let tx=26,ty=p.y+12;
   if(!this.isReturn&&p===this.players[0]&&!this.passed){
    tx=this.play==='flood'?43:26+Math.sin(this.liveTime)*4;ty=this.spot-5;
    const wait=this.play==='curls'?2.3:this.play==='flood'?1.9:1.4;
    if(this.liveTime>wait+this.rng()*.6){const options=this.players.slice(2,5).map((r,i)=>({i,gap:Math.min(...this.defenders.map(d=>distance(r,d)))})).sort((a,b)=>b.gap-a.gap);this.throwTo(options[0].i);}
   }else{
    const close=this.defenders.filter(d=>d.y>p.y-2&&distance(d,p)<13).sort((a,b)=>distance(a,p)-distance(b,p))[0];
    if(!this.isReturn&&this.play==='sweep'&&this.liveTime<1.8)tx=45;
    else if(!this.isReturn&&this.play==='counter'&&this.liveTime<1.8)tx=12;
    else if(close)tx=clamp(p.x+(p.x<close.x?-13:13),4,49);else tx=clamp(p.x,5,48);
   }
   this.move(p,tx-p.x,ty-p.y,p.speed*.92,dt);
  }
  const factor=this.difficulty==='rookie'?.79:this.difficulty==='legend'?1.06:.91;
  for(const d of this.defenders){if(!this.userOffense&&d===controlled)continue;const target=this.coverageTarget(d);this.move(d,target.x-d.x,target.y-d.y,d.speed*(this.userOffense?factor:.91),dt);}
  if(this.pass){
   const b=this.pass;b.elapsed+=dt;const u=clamp(b.elapsed/b.duration,0,1);b.x=b.sx+(b.tx-b.sx)*u;b.y=b.sy+(b.ty-b.sy)*u;
   if(u>.66){const interceptor=this.defenders.find(d=>d.stun<=0&&distance(d,b)<1.45);if(interceptor){this.pass=null;this.finish('interception',interceptor.y);return;}}
   if(u>=1){if(distance(b,b.target)<=2.8){this.carrier=b.target;this.pass=null;if(this.userOffense)this.stats.completions++;this.emit('catch','CAUGHT!',this.carrier.name);}else{this.pass=null;this.finish('incomplete',this.spot);return;}}
  }else{
   if(this.carrier.y>this.spot+.15)this.crossed=true;
   if(this.carrier.y>=100){this.finish('touchdown',100);return;}
   if(this.carrier.x<=.4||this.carrier.x>=52.9){this.finish('out',this.carrier.y);return;}
   for(const d of this.defenders){if(d.stun>0)continue;const radius=(!this.userOffense&&d===controlled&&this.diveLeft>0)?3:1.65;
    if(distance(d,this.carrier)<radius&&this.liveTime>.35){
     if(this.userOffense&&this.burstLeft>.28&&!this.evaded){this.evaded=true;d.stun=1;this.emit('juke','BROKE A TACKLE!');continue;}
     if(!this.breakUsed&&(this.carrier.power||70)>88&&this.rng()<.22){this.breakUsed=true;d.stun=1;continue;}
     if(!this.userOffense)this.stats.tackles++;this.finish('tackle',this.carrier.y);return;
    }
   }
  }
  this.cameraY+=(clamp((this.pass?this.pass.y:this.carrier.y)+16,13,93)-this.cameraY)*Math.min(1,dt*6);
  if(this.liveTime>18)this.finish('tackle',this.carrier.y);
 }
 finish(kind,y){
  if(!this.isLive&&!['fieldgoal','miss'].includes(kind))return;
  const offense=this.offense,returning=this.isReturn,gain=kind==='incomplete'?0:Math.round(y-this.spot);
  if(this.userOffense){if(returning)this.stats.returnYards+=Math.round(y-this.special.catchY);else if(!['fieldgoal','miss','interception'].includes(kind))this.stats.yards+=gain;}
  this.phase='dead';this.deadTimer=2.2;this.pass=null;let title='',detail='';
  if(kind==='touchdown'){this.scores[offense]+=7;this.pending={kickoff:offense,kickSpot:35};title='TOUCHDOWN!';detail=`${this.teams[offense].abbr} +7${returning?' · return TD':' · extra point included'}`;}
  else if(kind==='interception'){this.pending={offense:1-offense,spot:clamp(100-y,1,99),newSeries:true};title='INTERCEPTED!';detail='Possession changes at the catch';}
  else if(kind==='fieldgoal'){this.scores[offense]+=3;this.pending={kickoff:offense,kickSpot:35};title='IT’S GOOD!';detail='Three points · kickoff next';}
  else if(kind==='miss'){this.pending={offense:1-offense,spot:clamp(100-this.spot,20,99),newSeries:true};title='NO GOOD';detail='The other team takes over';}
  else if(y<=0&&kind!=='incomplete'){this.scores[1-offense]+=2;this.pending={kickoff:offense,kickSpot:20};title='SAFETY';detail='Two points · free kick from the 20';}
  else if(returning){this.pending={offense,spot:clamp(Math.round(y),1,99),newSeries:true};title='RETURN ENDS';detail=`${Math.round(y-this.special.catchY)} return yards · ${this.teams[offense].abbr} ball`;}
  else if(kind!=='incomplete'&&y>=this.target){this.pending={offense,spot:clamp(y,1,99),newSeries:true};title='FIRST DOWN!';detail=`${gain} yards · move the chains`;}
  else if(this.down>=4){this.pending={offense:1-offense,spot:clamp(100-y,1,99),newSeries:true};title='TURNOVER ON DOWNS';detail='The defense holds';}
  else{this.pending={offense,spot:kind==='incomplete'?this.spot:clamp(y,1,99),newSeries:false};title=kind==='incomplete'?'INCOMPLETE':gain<0?`${Math.abs(gain)} YARD LOSS`:gain===0?'NO GAIN':`${gain} YARD GAIN`;detail=kind==='out'?'Out of bounds':kind==='tackle'?(this.carrier===this.players[0]&&gain<0?'Sacked!':'Brought down'):'Try another route';}
  this.emit('result',title,detail);this.lastResult=`${title} — ${detail}`;
  if(this.quarter>4&&this.scores[0]!==this.scores[1])this.pendingFinal=true;
 }
 next(){
  if(this.pendingFinal||(this.quarter===4&&this.clock<=0&&this.scores[0]!==this.scores[1])){this.phase='final';this.emit('final','FINAL');return;}
  const p=this.pending;this.pending=null;
  if(this.clock<=0&&this.quarter<=4){
   this.quarter++;this.clock=45;
   if(this.quarter===5){this.emit('overtime','OVERTIME','Next score wins');this.beginKick('kickoff',1,35);return;}
   this.emit('quarter',`QUARTER ${this.quarter}`);
   if(this.quarter===3){this.beginKick('kickoff',0,35);return;}
  }
  if(p?.kickoff!==undefined){this.beginKick('kickoff',p.kickoff,p.kickSpot);return;}
  const offense=p?.offense??this.offense,spot=p?.spot??this.spot;
  this.beginDrive(offense,spot,p?.newSeries?1:this.down+1,p?.newSeries?Math.min(100,spot+10):this.target);
 }
 kick(type){
  if(!['call','ready'].includes(this.phase)||this.down!==4||this.paused)return false;
  if(type==='punt'){this.beginKick('punt',this.offense,this.spot);return true;}
  if(type!=='fieldgoal'||117-this.spot>55)return false;
  this.finish(this.rng()<clamp(1.1-(117-this.spot)/120,.4,.95)?'fieldgoal':'miss',this.spot);return true;
 }
 // All special-team coordinates face upfield for the receiving team, so returns
 // keep the same thumb direction as ordinary offense. Kicks travel downscreen.
 beginKick(type,kickingTeam,kickSpot){
  this.offense=1-kickingTeam;this.spot=type==='punt'?20:25;this.target=this.spot+10;this.down=1;this.pending=null;
  this.resetPlay();this.special={type,kickingTeam,kickSpot,aim:0,power:0,meterTime:0,ball:null,fair:false,looseTime:0};
  const receive=this.teams[this.offense],kicking=this.teams[kickingTeam];
  this.players=receive.offense.map((p,i)=>animate(p,i,[20,26.5,7,46,34,16,39][i],[27,12,24,24,28,34,34][i]));
  const specialist=kicking.roster.find(p=>p.pos===(type==='punt'?'P':'K'))||kicking.offense[0];
  this.defenders=[...kicking.defense.slice(0,6),specialist].map((p,i)=>animate(p,i,[4,49,12,20,33,41,26.5][i],i===6?100-kickSpot+(type==='punt'?7:0):type==='punt'?100-kickSpot:45));
  this.carrier=this.players[1];this.carrier.y=clamp(this.kickTarget(.7,0).y,3,90);
  const shift=this.carrier.y-12;for(const p of this.players){if(p!==this.carrier)p.y=clamp(p.y+shift,5,95);}
  this.selected=0;this.phase='kick_ready';this.cameraY=clamp((this.defenders[6].y+this.carrier.y)/2-8,13,85);
  this.emit('special',type==='punt'?'PUNT TEAM':'KICKOFF',this.userKicking?'Aim with the stick. Start the meter, then tap to kick.':'Get ready to return. Follow the landing ring.');
 }
 kickAction(){
  if(this.paused||!this.special)return false;
  if(this.phase==='kick_ready'){
   if(this.userKicking){this.phase='kick_charge';this.special.meterTime=0;this.special.power=0;}
   else this.launchKick(.62+this.rng()*.23,(this.rng()-.5)*1.25);
   return true;
  }
  if(this.phase==='kick_charge'&&this.userKicking){this.launchKick(this.special.power,this.special.aim);return true;}
  return false;
 }
 kickTarget(power=this.special?.power??.7,aim=this.special?.aim??0){
  const s=this.special;if(!s)return null;
  const yards=s.type==='punt'?24+power*31:38+power*34;
  return {x:26.5+aim*29,y:100-s.kickSpot-yards};
 }
 launchKick(power,aim){
  const s=this.special;s.power=clamp(power,0,1);s.aim=clamp(aim,-1,1);const target=this.kickTarget(s.power,s.aim),kicker=this.defenders[6];
  s.ball={x:kicker.x,y:kicker.y,sx:kicker.x,sy:kicker.y,tx:target.x,ty:target.y,elapsed:0,duration:s.type==='punt'?2.8+s.power:3.2+s.power*.8};
  this.phase='kick_flight';this.emit('kick',s.type==='punt'?'PUNT AWAY':'KICK IS UP');
 }
 fairCatch(){if(this.paused||!this.userOffense||this.phase!=='kick_flight'||this.special.type!=='punt')return false;this.special.fair=true;this.emit('special','FAIR CATCH','Returner will secure the ball. No return.');return true;}
 tickKick(dt,input){
  const s=this.special;
  if(['kick_ready','kick_charge'].includes(this.phase)){
   if(this.userKicking)s.aim=clamp(s.aim+input.x*dt*.85,-1,1);
   if(this.phase==='kick_charge'){s.meterTime+=dt;const cycle=(s.meterTime/1.35)%2;s.power=cycle<=1?cycle:2-cycle;}
   return;
  }
  const b=s.ball,target={x:clamp(b.tx,1,52),y:clamp(b.ty,1,99)},returner=this.carrier;
  if(this.userOffense&&Math.hypot(input.x,input.y)>.1&&!s.fair)this.move(returner,input.x,input.y,returner.speed,dt);
  else this.move(returner,target.x-returner.x,target.y-returner.y,returner.speed*1.12,dt);
  for(const d of this.defenders){
   if(!this.userOffense&&d===this.controlled)this.move(d,input.x,input.y,d.speed,dt);
   else if(b.elapsed>.45||this.phase==='kick_loose')this.move(d,target.x-d.x,target.y-d.y,d.speed*(d.slot<2?1:.88),dt);
  }
  for(const p of this.players){if(p===returner)continue;const d=this.defenders.filter(d=>d.stun<=0).sort((a,b)=>distance(a,p)-distance(b,p))[0];if(d)this.move(p,d.x-p.x,clamp(returner.y+7-p.y,-1,1),p.speed*.5,dt);}
  if(this.phase==='kick_flight'){
   b.elapsed+=dt;const u=clamp(b.elapsed/b.duration,0,1);b.x=b.sx+(b.tx-b.sx)*u;b.y=b.sy+(b.ty-b.sy)*u;
   if(u>=1){
    if(b.tx<=.4||b.tx>=52.9){this.endKick('OUT OF BOUNDS',s.type==='kickoff'?40:clamp(b.ty,1,99));return;}
    if(b.ty<=0){this.endKick('TOUCHBACK',s.type==='punt'?20:25);return;}
    this.phase='kick_loose';s.looseTime=0;
   }
  }
  if(this.phase==='kick_loose'){
   if(distance(returner,b)<3){
    if(s.fair){this.endKick('FAIR CATCH',b.y);return;}
    this.phase='return';s.catchY=b.y;this.spot=b.y;this.target=Math.min(100,b.y+10);s.ball=null;this.liveTime=0;this.passed=true;
    this.emit('special',this.userOffense?'RETURN IT!':'MAKE THE STOP',this.userOffense?'Run upfield ↑ · BURST through a gap':'Switch to coverage · DIVE to tackle');
   }else{
    s.looseTime+=dt;b.y-=dt*1.6;b.ty=b.y;
    if(b.y<=0){this.endKick('TOUCHBACK',s.type==='punt'?20:25);return;}
    if(this.defenders.some(d=>distance(d,b)<1.8)){
     if(s.type==='punt')this.endKick('PUNT DOWNED',b.y);
     else this.endKick('KICK RECOVERED',100-b.y,s.kickingTeam);
     return;
    }
    if(s.looseTime>7){this.endKick('BALL DEAD',b.y);return;}
   }
  }
  this.cameraY+=(clamp(s.ball?(s.ball.y+returner.y)/2-8:returner.y+16,13,93)-this.cameraY)*Math.min(1,dt*4);
 }
 endKick(title,spot,offense=this.offense){
  this.phase='dead';this.deadTimer=2.2;this.special.ball=null;this.pending={offense,spot:clamp(Math.round(spot),1,99),newSeries:true};
  this.lastResult=`${title} — ${this.teams[offense].abbr} ball at ${Math.round(spot)}`;this.emit('result',title,`${this.teams[offense].abbr} ball · ${Math.round(spot)<50?'own':'opponent'} ${Math.round(spot)<50?Math.round(spot):100-Math.round(spot)}`);
 }
}
