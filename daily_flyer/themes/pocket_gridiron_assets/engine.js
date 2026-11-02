import {matchLength,emptyBox,copyBox,halftimeReport} from './match.js?v=10';
import {PLAYS,DEFENSE,routeFor,newCoverageTarget} from './plays.js?v=10';
import {passPlacement,eligibleReceivers,catchReach,landingPickChance} from './passing.js?v=10';
import {playbook} from './teams.js?v=10';
import {resetContact,nearestThreat,armBreak,beginContact,tickContact} from './contact.js?v=10';
import {AI_PROFILES,BALL_RULES,MOVEMENT_RULES,fumbleChance} from './rules.js?v=10';
import {clearBlocks,isBlocker,updateBlocking,shedBlock} from './blocking.js?v=10';
import {PENALTIES,acceptedPenalty,outcomeValue} from './penalties.js?v=10';
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export {PLAYS,DEFENSE} from './plays.js?v=10';
const animate=(p,slot,x,y)=>({...p,slot,x,y,speed:4.8+(p.speed||70)/35,stun:0,phase:0,pace:1});
export class Game {
 constructor(home,away,difficulty='pro',rng=Math.random,options={}){
  this.teams=[home,away];this.rng=rng;this.difficulty=difficulty;this.scores=[0,0];
  this.match=matchLength(options.length);this.quarterSeconds=this.match.quarterSeconds;this.halftimeShown=false;this.box=[emptyBox(),emptyBox()];this.quarter=1;this.clock=this.quarterSeconds;this.offense=0;this.spot=25;this.target=35;this.down=1;
  this.play='slants';this.defense='zone';this.events=[];this.history=[[],[]];this.stats={yards:0,returnYards:0,completions:0,attempts:0,tackles:0,drops:0,fumbles:0,fumblesLost:0,interceptions:0,takeaways:0,penalties:0,penaltyYards:0,brokenTackles:0};
  this.paused=false;this.time=0;this.special=null;this.pending=null;this.pendingFinal=false;this.publishedScores=[0,0];
  this.beginKick('kickoff',1,35);
 }
 emit(type,text,detail='',meta={}){this.events.push({type,text,detail,...meta});}
 get userOffense(){return this.offense===0;}
 get isReturn(){return this.phase==='return';}
 get isLive(){return this.phase==='live'||this.isReturn;}
 get isLoose(){return this.phase==='fumble';}
 get defenseAI(){return AI_PROFILES[this.userOffense?this.difficulty:'pro']||AI_PROFILES.pro;}
 get offenseAI(){return AI_PROFILES[this.difficulty]||AI_PROFILES.pro;}
 get userKicking(){return Boolean(this.special&&this.special.kickingTeam===0);}
 get controlled(){
  if(this.special&&['kick_ready','kick_charge'].includes(this.phase)&&this.userKicking)return this.defenders[6];
  return this.userOffense?(this.isLoose?this.players[this.recoverySelected]:this.carrier):this.defenders[this.selected];
 }
 get defenseDefinition(){return DEFENSE.find(p=>p.id===this.defense);}
 get playDefinition(){return PLAYS.find(p=>p.id===this.play);}
 get offensePlays(){return playbook(this.teams[this.offense],'offense',PLAYS);}
 get defensePlays(){return playbook(this.teams[1-this.offense],'defense',DEFENSE);}
 get humanPlays(){return this.userOffense?this.offensePlays:this.defensePlays;}
 get breakAvailable(){return Boolean(nearestThreat(this))&&!this.breakArm&&this.breakCooldown<=0&&this.stamina>=24;}
 breakTackle(input=this.lastInput){return this.userOffense&&!this.paused&&armBreak(this,input);}
 get canPass(){return this.phase==='live'&&!this.pass&&!this.passed&&!this.crossed&&this.playDefinition.kind==='pass'&&this.carrier===this.players[0];}
 resetPlay(){this.pass=null;this.loose=null;this.returnInfo=null;this.scrambleRecovery=false;this.receivedPass=false;this.passed=false;this.crossed=false;this.liveTime=0;this.burstLeft=0;this.burstCooldown=0;this.diveLeft=0;this.diveCooldown=0;this.evaded=false;this.breakUsed=false;this.ballVisible=true;this.nextQBRead=0;this.handoffTime=0;this.readyTime=0;this.cpuSnapIn=null;this.flags=[];this.playStart=null;this.penaltyReview=null;this.aiJump=null;this.lastInput={x:0,y:0};resetContact(this);clearBlocks(this);}
 setFormation(){
  const xs=this.play==='counter'?[26.5,35,7,46,16,23,30]:this.play==='flood'?[31,25,7,44,35,25,32]:[26.5,27,7,46,36,23,30];
  this.players=this.teams[this.offense].offense.map((p,i)=>animate(p,i,xs[i],this.spot+[-4,-7,0,0,-.5,-.5,-.5][i]));
  const depths=this.defenseDefinition.depths||{zone:[1.5,1.5,5,5,9,9,14],man:[1.5,1.5,4,4,5,5,16],blitz:[1.5,1.5,2,5,7,7,14],cover2:[1.5,1.5,5,5,6,17,17],cover3:[1.5,1.5,5,5,16,16,20],commit:[1,1,2,2,4,4,12],press:[1.5,1.5,2,3,1,1,19],robber:[1.5,1.5,4,7,5,5,19],prevent:[1.5,1.5,20,20,25,25,30]}[this.defense];
  const dx=this.defense==='cover2'?[23,30,18,39,7,13,40]:[23,30,15,39,8,45,26.5];
  const coverage=this.defenseDefinition.coverage;
  if(coverage)for(let i=0;i<7;i++){if(coverage.zones?.[i])dx[i]=coverage.zones[i].x;if(coverage.man?.[i]!==undefined)dx[i]=xs[coverage.man[i]];if(coverage.spy===i)dx[i]=26.5;if(coverage.bracket&&(coverage.bracket.under===i||coverage.bracket.over===i))dx[i]=xs[coverage.bracket.slot];}
  this.defenders=this.teams[1-this.offense].defense.map((p,i)=>animate(p,i,dx[i],Math.min(107,this.spot+depths[i])));
  if(['man','press','robber'].includes(this.defense)){this.defenders[2].x=xs[4];this.defenders[4].x=xs[2];this.defenders[5].x=xs[3];}
  this.carrier=this.players[0];this.selected=2;this.resetPlay();this.cameraY=this.spot+12;
  for(const d of this.defenders){d.nextRead=0;d.readTarget={x:d.x,y:d.y};d.reactionJitter=this.rng()*.10;}
 }
 weighted(items,weight){const weights=items.map(weight),sum=weights.reduce((a,b)=>a+b,0);let n=this.rng()*sum;return items.find((_,i)=>(n-=weights[i])<0)||items.at(-1);}
 selectDefense(){
  const ai=this.offense===0?(AI_PROFILES[this.difficulty]||AI_PROFILES.pro):AI_PROFILES.pro,toGo=this.target-this.spot;
  const recent=this.history[this.offense],runRate=recent.length?recent.filter(p=>p==='run').length/recent.length:.5;
  return this.weighted(this.defensePlays,p=>{let w=1;if(toGo>=8&&this.down>=3&&(p.group==='zone'||p.id==='robber'))w+=4;if(toGo<=3&&(p.group==='pressure'||p.id==='press'))w+=4;if(this.spot>85&&['zone','robber','press'].includes(p.id))w+=2;if(this.quarter===4&&this.clock<12&&this.scores[1-this.offense]>this.scores[this.offense]&&p.id==='prevent')w+=7;if(recent.length>=4){if(runRate>.65&&p.group==='pressure')w+=4;if(runRate<.35&&(p.group==='zone'||p.id==='robber'))w+=4;}return (1+(w-1)*ai.adapt)*(this.teams[1-this.offense].profile?.defense.signature.includes(p.id)?1.6:1);}).id;
 }
 selectOffense(){const players=this.teams[this.offense].offense,run=(players[1].power+players[1].agility+players[5].runBlock+players[6].runBlock)/4,pass=(players[0].accuracy+players[2].catching+players[3].catching+players[4].catching)/4;const long=this.target-this.spot>6,late=this.quarter===4&&this.clock<12&&this.scores[1]>this.scores[0];return this.weighted(this.offensePlays,p=>(this.teams[this.offense].profile?.offense.signature.includes(p.id)?1.6:1)*(1+((p.kind==='run'?run:pass)-80)*.015)*(1+this.offenseAI.adapt*((late&&p.kind==='run'?4:0)+(this.down>=3?(p.kind===(long?'pass':'run')?3:0):0)))).id;}
 beginDrive(offense,spot,down=1,target=Math.min(100,spot+10)){
  this.special=null;this.pending=null;this.offense=offense;this.spot=spot;this.down=down;this.target=target;this.phase='call';this.defense=this.selectDefense();this.setFormation();
  // CPU special teams are its own decisions, never buttons for the human to call.
  if(!this.userOffense&&down===4){
   if(spot<62){this.beginKick('punt',offense,spot);return;}
   if(117-spot<=55){this.kick('fieldgoal');return;}
  }
  this.emit('call','');
 }
 choose(id){
  if(!['call','ready'].includes(this.phase)||this.paused)return false;
  if(this.userOffense){if(!this.offensePlays.some(p=>p.id===id))return false;this.play=id;}
  else{if(!this.defensePlays.some(p=>p.id===id))return false;this.defense=id;this.play=this.selectOffense();}
  const selected=this.selected;this.phase='ready';this.setFormation();if(!this.userOffense&&this.defenders[selected])this.selected=selected;
  if(!this.userOffense)this.cpuSnapIn=2.4+this.rng()*.9;
  else if(this.rng()<({rookie:.07,pro:.04,legend:.015}[this.difficulty]??.04))this.aiJump={slot:this.rng()<.5?0:1,at:1.1+this.rng()};
  return true;
 }
 recordPlay(){this.playStart={offense:this.offense,spot:this.spot,target:this.target,down:this.down,scores:[...this.scores],stats:{...this.stats},box:copyBox(this.box)};}
 snap(team=0){
  if(this.phase!=='ready'||this.paused||team!==this.offense)return false;
  this.recordPlay();this.box[this.offense].plays++;this.phase='live';this.liveTime=0;this.emit('snap','');
  const offside=this.defenders.find(d=>d.y<this.spot+.45);if(offside)this.flag('offside',1-this.offense,offside);
  this.history[this.offense].push(this.playDefinition.kind);this.history[this.offense]=this.history[this.offense].slice(-12);
  if(this.playDefinition.kind==='run'&&this.play!=='draw')this.carrier=this.players[this.playDefinition.carrier??1];
  if(this.defense==='press')for(const slot of [2,3])this.players[slot].stun=.18+this.defenseAI.adapt*.20;
  return true;
 }
 tickReady(dt,input){
  this.readyTime+=dt;
  if(!this.userOffense){const d=this.controlled;this.move(d,input.x,input.y,d.speed*.75,dt);}
  else if(this.aiJump){
   const j=this.aiJump,d=this.defenders[j.slot];
   if(this.readyTime>=j.at&&this.readyTime<j.at+.32)this.move(d,0,-1,d.speed,dt);
   else if(this.readyTime>=j.at+.32)this.move(d,0,this.spot+1.5-d.y,d.speed,dt);
  }
  const encroacher=this.defenders.find(d=>d.y<this.spot+.45&&this.players.some(p=>distance(d,p)<1.45));
  if(encroacher){this.recordPlay();this.flag('encroachment',1-this.offense,encroacher);this.penaltyReview={accept:acceptedPenalty(this.playStart,this.flags)};this.resolvePenalty(true);return;}
  if(!this.userOffense){this.cpuSnapIn-=dt;if(this.cpuSnapIn<=0)this.snap(this.offense);}
 }
 flag(type,team,p){
  if(!this.playStart||this.flags.some(f=>f.type===type&&f.team===team))return;
  this.flags.push({type,team,x:p.x,y:p.y,number:p.number});this.emit('flag','FLAG',`${PENALTIES[type].name} · ${this.teams[team].abbr} #${p.number}`);
 }
 reviewResult(title,detail){
  if(this.flags.length&&this.playStart){
   const accept=acceptedPenalty(this.playStart,this.flags),decline={pending:{...this.pending},scores:[...this.scores],stats:{...this.stats},box:copyBox(this.box),title,detail,nextDown:this.down+1};
   const both=new Set(this.flags.map(f=>f.team)).size>1,beneficiary=1-this.flags[0].team;
   this.penaltyReview={accept,decline,beneficiary,description:this.flags.map(f=>`${PENALTIES[f.type].name} · ${this.teams[f.team].abbr} #${f.number}`).join(' + ')};
   // Do not display a provisional touchdown/turnover in the scoreboard while
   // the non-offending team chooses. The completed outcome is retained above.
   this.scores=[...this.playStart.scores];this.stats={...this.playStart.stats};this.box=copyBox(this.playStart.box||this.box);this.phase='penalty';this.pendingFinal=false;
   if(both||beneficiary===1)this.resolvePenalty(both||outcomeValue(accept,1)>=outcomeValue(decline,1));
   else this.emit('penalty','PENALTY DECISION',this.penaltyReview.description);
   return;
  }
  this.publishResult(title,detail);
 }
 resolvePenalty(accept){
  if(!this.penaltyReview||this.paused)return false;
  const review=this.penaltyReview,outcome=accept?review.accept:review.decline;if(!outcome)return false;
  this.scores=[...outcome.scores];this.stats={...outcome.stats};this.box=copyBox((accept?this.playStart?.box:outcome.box)||this.box);this.pending={...outcome.pending};
  this.penaltyReview=null;this.flags=[];this.phase='dead';this.deadTimer=2.7;this.pass=null;this.loose=null;clearBlocks(this);
  this.publishResult(accept?outcome.title:`PENALTY DECLINED`,accept?outcome.detail:`${outcome.title} · ${outcome.detail}`);return true;
 }
 publishResult(title,detail){
  const delta=this.scores.map((score,i)=>score-this.publishedScores[i]),scoreTeam=delta.findIndex(n=>n>0);
  this.publishedScores=[...this.scores];this.lastResult=`${title} — ${detail}`;
  this.emit('result',title,detail,scoreTeam<0?{}:{scoreTeam,scorePoints:delta[scoreTeam],scoreAbbr:this.teams[scoreTeam].abbr});
  this.pendingFinal=this.quarter>4&&this.scores[0]!==this.scores[1];
 }
 burst(){
  if(!this.isLive||this.paused)return;
  if(this.userOffense){if(this.pass||this.contact||this.burstCooldown>0||this.stamina<12)return;this.stamina-=12;this.burstLeft=.6;this.burstCooldown=3;this.evaded=false;this.emit('burst','');}
  else{if(this.diveCooldown>0)return;if(shedBlock(this,this.controlled)){this.diveCooldown=1.3;this.emit('shed','SHED THE BLOCK!');return;}this.diveLeft=.32;this.diveCooldown=1.7;const p=this.controlled,b=this.carrier,d=distance(p,b)||1;p.dx=(b.x-p.x)/d;p.dy=(b.y-p.y)/d;this.emit('dive','');}
 }
 selectDefender(index){
  if(this.userOffense||this.paused||!Number.isInteger(index)||!this.defenders[index]||!(['call','ready','kick_flight','kick_loose'].includes(this.phase)||this.isLive||this.isLoose))return false;
  this.selected=index;this.diveLeft=0;return true;
 }
 switchDefender(mode='nearest'){
  if(mode==='cycle')return this.selectDefender((this.selected+1)%this.defenders.length);
  const target=this.loose||this.special?.ball||this.pass||this.carrier;
  const best=this.defenders.map((p,i)=>({i,d:distance(p,target)+(p.stun>0?8:0)})).sort((a,b)=>a.d-b.d)[0];
  return this.selectDefender(best.i);
 }
 throwTo(index,input={x:0,y:0}){
  if(!this.canPass||this.paused)return false;
  const target=Number.isInteger(index)&&index>=0&&index<3?this.players[index+2]:null;if(!target)return false;
  const placement=passPlacement(this,target,input);if(!placement.reachable){this.emit('ball','OUT OF RANGE','Ease off the lead or move closer before throwing.');return false;}
  const pressured=this.defenders.some(d=>distance(d,this.carrier)<3),err=(100-(this.carrier.accuracy||78))/36+(pressured?1.7*(1+(85-(this.carrier.composure||80))/40):0);
  this.pass={x:this.carrier.x,y:this.carrier.y,sx:this.carrier.x,sy:this.carrier.y,tx:placement.x+(this.rng()-.5)*err,ty:placement.y+(this.rng()-.5)*err,target,aim:placement.aim,adjustAt:.10+(100-(target.routeRunning||80))*.002+(distance(target,this.route(target,this.liveTime+.25))<.3&&placement.aim.y>.3?.12:0),elapsed:0,duration:placement.duration,checked:[],tipped:false};
  for(const d of this.defenders){d.ballSeenAt=this.liveTime+this.defenseAI.reaction*(1+(80-(d.recognition||80))/100)+(d.reactionJitter||0);}
  this.passed=true;this.box[this.offense].attempts++;if(this.userOffense)this.stats.attempts++;this.emit('throw','','',{flight:this.pass.duration});return true;
 }
 move(p,dx,dy,speed,dt){if(p.stun>0)return;speed*=p.blockFactor??1;if(p===this.carrier&&this.isLive&&!this.pass)speed*=MOVEMENT_RULES.carrierSpeed*(this.contactSlow>0?.65:1)*(this.stamina<20?.94:1);const n=Math.hypot(dx,dy);if(n>.04){p.pace=Math.min(1,(p.pace??1)+dt*(2+(p.acceleration||75)/40));speed*=p.pace;p.x+=dx/Math.max(1,n)*speed*dt;p.y+=dy/Math.max(1,n)*speed*dt;p.phase+=dt*14;}else p.pace=.55;p.x=clamp(p.x,-.2,53.5);p.y=clamp(p.y,-9,110);}
 route(p,time=this.liveTime){return routeFor(this.playDefinition,p,time,this.spot);}
 coverageTarget(d){
  const i=d.slot,ai=this.defenseAI;
  if(this.pass&&this.liveTime>=(d.ballSeenAt??Infinity)&&distance(d,this.pass)<ai.vision&&(i>=2||this.defenseDefinition.coverage?.zones?.[i])){
   // React to the visible trajectory, not a telepathic landing-point broadcast.
   const b=this.pass,lead=Math.min(ai.lead,b.duration-b.elapsed);
   return {x:clamp(b.x+(b.tx-b.sx)/b.duration*lead,1,52),y:clamp(b.y+(b.ty-b.sy)/b.duration*lead,-4,107)};
  }
  if(this.isReturn||this.scrambleRecovery||!this.pass&&(this.carrier!==this.players[0]||this.crossed)&&this.liveTime>=this.handoffTime+ai.recognizeRun){
   // Returns need an intercept angle: a fixed short lead can trail outside
   // runs. Estimate travel time, capped so cuts still beat pursuit.
   const lead=this.isReturn?ai.lead+Math.min(.12+ai.adapt*.08,distance(d,this.carrier)/Math.max(1,d.speed*.95)*(.035+ai.adapt*.02)):ai.lead;
   return {x:clamp(this.carrier.x+(this.carrier.vx||0)*lead,1,52),y:clamp(this.carrier.y+(this.carrier.vy||0)*lead,-5,107)};
  }
  const assigned=newCoverageTarget(this,d);if(assigned)return assigned;
  if(i<2||this.defense==='blitz'&&i===2||this.defense==='commit'&&i<4)return this.carrier;
  if(['man','press','robber'].includes(this.defense)){
   // One primary matchup each. The safety provides help instead of duplicating
   // the right WR assignment; the remaining LB covers the back/hook or robs.
   const slot={2:4,4:2,5:3}[i];
   if(slot!==undefined){const p=this.players[slot];return {x:p.x+(p.x<26.5?.5:-.5),y:Math.min(107,p.y+(.6+ai.adapt*.7))};}
   if(i===6){const threats=this.players.slice(2,5).filter(p=>p.y>this.spot+10).sort((a,b)=>b.y-a.y);const p=threats[0];return {x:p?clamp(p.x,14,39):26.5,y:Math.min(107,Math.max(this.spot+22,(p?.y||this.spot)+5))};}
   if(this.defense==='press')return this.carrier;
   if(this.defense==='robber'){const p=this.players.slice(2,5).filter(p=>Math.abs(p.x-26.5)<15&&p.y<this.spot+14).sort((a,b)=>distance(a,d)-distance(b,d))[0];return p?{x:p.x,y:p.y+1}:{x:26.5,y:Math.min(107,this.spot+9)};}
   return {x:26.5,y:Math.min(107,this.spot+6)};
  }
  const depth=Math.min(this.liveTime*2,10),s=this.spot;
  const zones={
   zone:[[15,7],[39,7],[7,11],[46,11],[26.5,19]],
   blitz:[[15,7],[36,7],[7,10],[46,10],[26.5,23]],
   cover2:[[18,9],[43,6],[7,6],[13,25+depth],[40,25+depth]],
   cover3:[[16,8],[37,8],[8,23+depth],[45,23+depth],[26.5,28+depth]],
   commit:[[15,3],[39,3],[7,6],[46,6],[26.5,18]],
   prevent:[[8,30+depth],[45,30+depth],[18,36+depth],[35,36+depth],[26.5,42+depth]]
  }[this.defense];
  const [x,y]=zones[i-2];
  const nearby=this.players.slice(2,5).filter(p=>Math.abs(p.x-x)<10&&Math.abs(p.y-(s+y))<8).sort((a,b)=>distance(a,d)-distance(b,d))[0];
  return nearby?{x:clamp(nearby.x,x-9,x+9),y:Math.min(107,nearby.y+ai.adapt)}:{x,y:Math.min(107,s+y)};
 }
 readDefense(d){
  if(this.liveTime<(d.nextRead||0))return d.readTarget;
  const ai=this.defenseAI,t=this.coverageTarget(d),error=ai.error*(1+(83-(d.coverage||83))/80);
  d.readTarget={x:clamp(t.x+(this.rng()-.5)*error*2,1,52),y:clamp(t.y+(this.rng()-.5)*error*2,-5,107)};
  d.nextRead=this.liveTime+ai.readEvery*(1+(80-(d.recognition||80))/100);return d.readTarget;
 }
 tick(dt,input={x:0,y:0}){
  if(this.paused||this.phase==='final'||this.phase==='halftime')return;dt=clamp(dt,0,.05);this.time+=dt;
  if(this.phase==='dead'){this.deadTimer-=dt;if(this.deadTimer<=0)this.next();return;}
  if(this.phase==='ready'){this.tickReady(dt,input);return;}
  if(this.phase.startsWith('kick_')){this.tickKick(dt,input);return;}
  if(this.isLoose){this.tickFumble(dt,input);return;}
  if(!this.isLive)return;
  this.lastInput={x:input.x,y:input.y};
  this.liveTime+=dt;if(this.quarter<=4)this.clock=Math.max(0,this.clock-dt);
  this.burstLeft=Math.max(0,this.burstLeft-dt);this.burstCooldown=Math.max(0,this.burstCooldown-dt);this.diveLeft=Math.max(0,this.diveLeft-dt);this.diveCooldown=Math.max(0,this.diveCooldown-dt);
  for(const p of [...this.players,...this.defenders])p.stun=Math.max(0,p.stun-dt);
  this.breakCooldown=Math.max(0,this.breakCooldown-dt);this.offBalance=Math.max(0,this.offBalance-dt);this.contactSlow=Math.max(0,this.contactSlow-dt);
  this.stamina=Math.min(100,this.stamina+dt*7);if(this.moveAnimation){this.moveAnimation.left-=dt;if(this.moveAnimation.left<=0)this.moveAnimation=null;}
  if(this.breakArm&&!this.contact){this.breakArm.left-=dt;if(this.breakArm.left<=0)this.breakArm=null;}
  if(tickContact(this,dt))return;
  const oldCarrier={x:this.carrier.x,y:this.carrier.y,vx:this.carrier.vx||0,vy:this.carrier.vy||0};
  if(this.play==='draw'&&!this.isReturn&&!this.passed&&this.liveTime>=.85){const qb=this.players[0],rb=this.players[1];rb.x=qb.x;rb.y=qb.y-.6;this.carrier=rb;resetContact(this);this.burstLeft=0;this.burstCooldown=0;this.passed=true;this.handoffTime=this.liveTime;this.emit('handoff','DRAW HANDOFF');}
  const controlled=this.controlled;
  if(this.userOffense&&!this.pass)this.move(controlled,input.x,input.y,controlled.speed*(this.burstLeft>0?1.55:1),dt);
  if(!this.userOffense){if(this.diveLeft>0)this.move(controlled,controlled.dx,controlled.dy,controlled.speed*2,dt);else this.move(controlled,input.x,input.y,controlled.speed*(this.diveCooldown>1.1?.48:1.12),dt);}
  updateBlocking(this,dt);
  for(const p of this.players){if(p===this.carrier||this.pass?.target===p||isBlocker(this,p))continue;if(p.slot>=2&&p.slot<=4){const r=this.route(p);this.move(p,r.x-p.x,r.y-p.y,p.speed,dt);}}
  if(!this.userOffense&&!this.pass){
   const p=this.carrier;let tx=26,ty=p.y+12;
   if(!this.isReturn&&p===this.players[0]&&!this.passed&&this.playDefinition.kind==='pass'){
    tx=this.play==='flood'?43:26+Math.sin(this.liveTime)*4;ty=this.spot-5;
    const wait=this.playDefinition.wait||1.4;
    if(this.canPass&&this.liveTime>wait+this.offenseAI.reaction&&this.liveTime>=this.nextQBRead){
     this.nextQBRead=this.liveTime+this.offenseAI.readEvery;
     const options=this.players.slice(2,5).map((r,i)=>({i,gap:Math.min(...this.defenders.map(d=>distance(r,d)))+(this.rng()-.5)*this.offenseAI.qbNoise})).sort((a,b)=>b.gap-a.gap);
     if(options[0].gap>2||this.liveTime>3.8||this.defenders.some(d=>distance(d,p)<3))this.throwTo(options[0].i);
    }
   }else{
    const close=this.defenders.filter(d=>d.y>p.y-2&&distance(d,p)<13).sort((a,b)=>distance(a,p)-distance(b,p))[0];
    if(!this.isReturn&&this.playDefinition.delay>this.liveTime){tx=26.5;ty=this.spot-4;}
    else if(!this.isReturn&&this.playDefinition.kind==='run'&&this.liveTime<1.8)tx=this.playDefinition.lane;
    else if(close)tx=clamp(p.x+(p.x<close.x?-13:13),4,49);else tx=clamp(p.x,5,48);
   }
   this.move(p,tx-p.x,ty-p.y,p.speed*.92,dt);
  }
  this.carrier.vx=dt?(this.carrier.x-oldCarrier.x)/dt:0;this.carrier.vy=dt?(this.carrier.y-oldCarrier.y)/dt:0;
  if(oldCarrier.vx*this.carrier.vx+oldCarrier.vy*this.carrier.vy< -8)this.offBalance=Math.max(this.offBalance,.25*(1+(85-(this.carrier.balance||80))/60));
  for(const d of this.defenders){if(!this.userOffense&&d===controlled)continue;const target=this.readDefense(d);this.move(d,target.x-d.x,target.y-d.y,d.speed*.95,dt);}
  if(this.pass){
   this.tickPass(dt);if(!this.isLive||this.isReturn)return;
  }else{
   if(this.carrier.y>this.spot+.15)this.crossed=true;
   if(this.carrier.y>=100){this.finish('touchdown',100);return;}
   if(this.carrier.x<=.4||this.carrier.x>=52.9){this.finish('out',this.carrier.y);return;}
   for(const d of this.defenders){if(d.stun>0)continue;const radius=(!this.userOffense&&d===controlled&&this.diveLeft>0)?3:1.65;
    if(distance(d,this.carrier)<radius&&this.liveTime>.35){
     beginContact(this,d);return;
    }
   }
  }
  this.cameraY+=(clamp((this.pass?this.pass.y:this.carrier.y)+16,13,93)-this.cameraY)*Math.min(1,dt*6);
  if(this.liveTime>18)this.finish('tackle',this.carrier.y);
 }
 catchPass(p){if(p!==this.carrier){resetContact(this);this.burstLeft=0;this.burstCooldown=0;}const difficult=this.pass&&(this.pass.tipped||distance(this.pass,p)>1.4||(this.pass.aim?.amount||0)>.7);this.offBalance=difficult?clamp(.7-(p.balance||80)*.005,.15,.5):0;p.pace=difficult?.55:1;this.receivedPass=true;this.carrier=p;this.pass=null;this.box[this.offense].completions++;if(this.userOffense)this.stats.completions++;this.emit('catch','CAUGHT!',p.name);}
 bobble(ball,dropped=false){
  this.pass={x:ball.x,y:ball.y,sx:ball.x,sy:ball.y,tx:clamp(ball.x+(this.rng()-.5)*5,1,52),ty:ball.y+(this.rng()-.5)*4,elapsed:0,duration:.38,tipped:true,dropped};
  if(dropped&&this.userOffense)this.stats.drops++;
  this.emit('ball',dropped?'DROPPED!':'TIPPED!',dropped?'Incomplete pass':'The ball is still live in the air');
 }
 tickPass(dt){
  const b=this.pass;if(!b.tipped&&b.target){const p=b.target,r=b.elapsed>=(b.adjustAt||0)?{x:b.tx,y:b.ty}:this.route(p);this.move(p,r.x-p.x,r.y-p.y,p.speed,dt);}b.elapsed+=dt;const u=clamp(b.elapsed/b.duration,0,1);b.x=b.sx+(b.tx-b.sx)*u;b.y=b.sy+(b.ty-b.sy)*u;
  if(u>=1&&(b.x<=.4||b.x>=52.9||b.y>110||b.y< -9)){this.finish('incomplete',this.spot,'Pass out of bounds');return;}
  if(b.tipped){
   if(u<1)return;
   if(!b.dropped){
    const eligible=[...eligibleReceivers(this),...this.defenders].filter(p=>p.stun<=0&&distance(p,b)<1.8).sort((a,c)=>distance(a,b)-distance(c,b));
    const p=eligible[0];if(p){const defense=this.defenders.includes(p);if(this.rng()<(defense?BALL_RULES.tipIntercept:BALL_RULES.tipCatch)){if(defense)this.startTurnover(p,'interception');else this.catchPass(p);return;}}
   }
   this.finish('incomplete',this.spot,b.dropped?'Dropped pass':'Tipped pass hit the turf');return;
  }
  // Each defender gets one contact trial per throw; probabilities are not
  // rerolled every animation frame. An early lineman contact can only tip.
  const contacts=this.defenders.filter(d=>d.stun<=0&&!b.checked.includes(d.slot)&&distance(d,b)<(u<.22?1.8:1.45)&&(u<.22||u>.65)).sort((a,c)=>distance(a,b)-distance(c,b));
  // At the final point, consider every nearby defender before ruling the ball
  // out of the receiver's reach. Already-tried defenders never roll twice.
  for(const contact of u>=1?contacts:contacts.slice(0,1)){
   b.checked.push(contact.slot);const roll=this.rng(),base=BALL_RULES.intercept*(.6+(contact.coverage||80)/200),pickChance=u>.65?landingPickChance(this,b,contact,base):0;
   if(roll<pickChance){this.startTurnover(contact,'interception');return;}
   if(roll<pickChance+BALL_RULES.deflect){this.bobble(b);return;}
  }
  if(u>=1){
   const receiver=eligibleReceivers(this).filter(p=>p.stun<=0&&p.x>.4&&p.x<52.9&&distance(b,p)<=catchReach(p)).sort((a,c)=>distance(a,b)-distance(c,b))[0];
   if(!receiver){this.finish('incomplete',this.spot,'Pass out of reach');return;}
   if(this.rng()<clamp(BALL_RULES.drop*(1+(85-(receiver.catching||85))/40),.012,.085)){this.bobble(b,true);return;}
   this.catchPass(receiver);
  }
 }
 creditYards(y){
  const yards=Math.round(y-(this.returnInfo?this.returnInfo.catchY:this.spot)),kind=this.returnInfo?'return':this.receivedPass?'pass':'rush',box=this.box[this.offense];box[kind+'Yards']+=yards;if(yards>box.longest.yards)box.longest={yards,player:this.carrier.name,kind};
  if(!this.userOffense)return;
  if(this.returnInfo)this.stats.returnYards+=Math.round(y-this.returnInfo.catchY);
  else this.stats.yards+=Math.round(y-this.spot);
 }
 startTurnover(p,type){
  this.box[1-this.offense].takeaways++;
  if(type==='interception'){this.box[this.offense].interceptions++;if(this.userOffense)this.stats.interceptions++;}
  else{this.creditYards(this.loose?.originY??p.y);this.box[this.offense].fumblesLost++;if(this.userOffense)this.stats.fumblesLost++;}
  if(!this.userOffense)this.stats.takeaways++;
  // Rotate both axes and swap existing athletes, preserving the actual
  // interceptor/recoverer, pursuit positions and always-upfield controls.
  const oldPlayers=this.players;this.players=this.defenders;this.defenders=oldPlayers;this.offense=1-this.offense;
  clearBlocks(this);
  for(const a of [...this.players,...this.defenders]){a.x=53-a.x;a.y=100-a.y;a.vx=-(a.vx||0);a.vy=-(a.vy||0);a.nextRead=0;a.readTarget={x:a.x,y:a.y};}
  resetContact(this);this.carrier=p;this.special=null;this.loose=null;this.pass=null;this.phase='return';this.passed=true;this.crossed=true;this.liveTime=0;
  this.returnInfo={type,catchY:p.y};this.spot=clamp(p.y,1,99);this.target=100;this.burstLeft=0;this.burstCooldown=0;this.diveLeft=0;this.diveCooldown=0;this.evaded=false;this.breakUsed=false;
  this.selected=this.defenders.map((a,i)=>({i,d:distance(a,p)})).sort((a,b)=>a.d-b.d)[0].i;this.cameraY=clamp(p.y+16,13,93);
  this.emit('turnover',type==='interception'?'INTERCEPTED!':'FUMBLE RECOVERED!',this.userOffense?'YOUR BALL · RUN UPFIELD ↑':'POSSESSION FLIPS · STOP THE RETURN',{turnoverType:type});
  if(p.y<=0){this.deadPossession('TOUCHBACK',20,this.offense);return;}
 }
 startFumble(tackler){
  this.contact=null;this.breakArm=null;clearBlocks(this);
  const p=this.carrier;if(this.userOffense)this.stats.fumbles++;
  this.loose={x:p.x,y:p.y,originY:p.y,fumbler:p,resume:this.phase,vx:(this.rng()-.5)*12,vy:(this.rng()-.5)*12,elapsed:0};
  p.stun=.65;tackler.stun=.35;this.pass=null;this.phase='fumble';this.burstLeft=0;this.diveLeft=0;
  this.recoverySelected=this.players.map((a,i)=>({i,d:distance(a,p)+(a===p?3:0)})).sort((a,b)=>a.d-b.d)[0].i;
  this.emit('ball','FUMBLE!','LOOSE BALL · chase it with the stick');
 }
 recoverFumble(p){
  const b=this.loose;if(!b)return;
  if(this.defenders.includes(p)){this.startTurnover(p,'fumble');return;}
  resetContact(this);this.carrier=p;this.phase=b.resume;this.loose=null;this.passed=true;this.scrambleRecovery=true;this.liveTime=0;
  // Simplified fourth-down anti-advancement rule: own recovery is dead and
  // cannot gain beyond the fumble spot. Normal recoveries remain returnable.
  if(this.down===4&&!this.isReturn){p.y=Math.min(p.y,b.originY);this.finish('tackle',p.y,'Own recovery · no fourth-down fumble advance');return;}
  this.emit('ball','RECOVERED!',this.userOffense?'YOUR BALL · keep running ↑':'Offense keeps possession');
 }
 tickFumble(dt,input){
  const b=this.loose;b.elapsed+=dt;if(this.quarter<=4)this.clock=Math.max(0,this.clock-dt);
  b.x+=b.vx*dt;b.y+=b.vy*dt;b.vx*=Math.max(0,1-dt*2);b.vy*=Math.max(0,1-dt*2);
  if(b.y>=110||b.y>=100&&(b.x<=.4||b.x>=52.9)){this.creditYards(b.originY);this.box[this.offense].fumblesLost++;this.box[1-this.offense].takeaways++;if(this.userOffense)this.stats.fumblesLost++;else this.stats.takeaways++;this.deadPossession('FUMBLE TOUCHBACK',20,1-this.offense);return;}
  if(b.x<=.4||b.x>=52.9||b.y<=-10){this.phase=b.resume;this.loose=null;this.carrier.y=Math.min(b.y,b.originY);this.finish('out',this.carrier.y,'Fumble out of bounds · no forward advance');return;}
  const controlled=this.controlled;
  for(const p of [...this.players,...this.defenders]){
   p.stun=Math.max(0,p.stun-dt);
   if(p===controlled)this.move(p,input.x,input.y,p.speed,dt);else this.move(p,b.x-p.x,b.y-p.y,p.speed*.95,dt);
  }
  if(b.elapsed>.4){const p=[...this.players,...this.defenders].filter(p=>p.stun<=0&&distance(p,b)<1.7).sort((a,c)=>distance(a,b)-distance(c,b))[0];if(p){this.recoverFumble(p);return;}}
  // No arbitrary winning-team coin flip: the nearest athlete gets a stalled
  // pile after six seconds. This also prevents an abandoned input from hanging.
  if(b.elapsed>6){const p=[...this.players,...this.defenders].sort((a,c)=>distance(a,b)-distance(c,b))[0];p.x=b.x;p.y=b.y;this.recoverFumble(p);return;}
  this.cameraY+=(clamp(b.y+16,13,93)-this.cameraY)*Math.min(1,dt*6);
 }
 deadPossession(title,spot,offense=this.offense){
  this.phase='dead';this.deadTimer=2.2;this.pass=null;this.loose=null;if(this.special)this.special.ball=null;
  this.pending={offense,spot:clamp(Math.round(spot),1,99),newSeries:true};
  this.reviewResult(title,`${this.teams[offense].abbr} ball · ${spot<50?'own':'opponent'} ${Math.round(spot<50?spot:100-spot)}`);
 }
 finish(kind,y,reason=''){
  if(!this.isLive&&!['fieldgoal','miss'].includes(kind))return;
  const offense=this.offense,returning=this.isReturn,gain=kind==='incomplete'?0:Math.round(y-this.spot);
  if(!['fieldgoal','miss','incomplete'].includes(kind))this.creditYards(y);
  this.phase='dead';this.deadTimer=2.2;this.pass=null;let title='',detail='';
  if(kind==='touchdown'){this.scores[offense]+=7;this.pending={kickoff:offense,kickSpot:35};title='TOUCHDOWN!';detail=`${this.teams[offense].abbr} +7${returning?' · return TD':' · extra point included'}`;}
  else if(kind==='fieldgoal'){this.scores[offense]+=3;this.pending={kickoff:offense,kickSpot:35};title='IT’S GOOD!';detail='Three points · kickoff next';}
  else if(kind==='miss'){this.pending={offense:1-offense,spot:clamp(100-this.spot,20,99),newSeries:true};title='NO GOOD';detail='The other team takes over';}
  else if(y<=0&&kind!=='incomplete'){this.scores[1-offense]+=2;this.pending={kickoff:offense,kickSpot:20};title='SAFETY';detail='Two points · free kick from the 20';}
  else if(returning){this.pending={offense,spot:clamp(Math.round(y),1,99),newSeries:true};title='RETURN ENDS';detail=`${Math.round(y-this.returnInfo.catchY)} return yards · ${this.teams[offense].abbr} ball`;}
  else if(kind!=='incomplete'&&y>=this.target){this.pending={offense,spot:clamp(y,1,99),newSeries:true};title='FIRST DOWN!';detail=`${gain} yards · move the chains`;}
  else if(this.down>=4){this.pending={offense:1-offense,spot:clamp(100-y,1,99),newSeries:true};title='TURNOVER ON DOWNS';detail='The defense holds';}
  else{this.pending={offense,spot:kind==='incomplete'?this.spot:clamp(y,1,99),newSeries:false};title=kind==='incomplete'?'INCOMPLETE':gain<0?`${Math.abs(gain)} YARD LOSS`:gain===0?'NO GAIN':`${gain} YARD GAIN`;detail=kind==='out'?'Out of bounds':kind==='tackle'?(this.carrier===this.players[0]&&this.playDefinition.kind==='pass'&&gain<0?'Sacked!':'Brought down'):'Try another route';}
  if(reason)detail=reason;this.reviewResult(title,detail);
 }
 next(){
  if(this.phase!=='dead')return;
  const extend=this.pending?.extend;
  if(this.pendingFinal||(!extend&&this.quarter===4&&this.clock<=0&&this.scores[0]!==this.scores[1])){this.phase='final';this.emit('final','FINAL');return;}
  const p=this.pending;this.pending=null;
  if(!extend&&this.clock<=0&&this.quarter<=4){
   this.quarter++;this.clock=this.quarterSeconds;
   if(this.quarter===5){this.emit('overtime','OVERTIME','Next score wins');this.beginKick('kickoff',1,35);return;}
   this.emit('quarter',`QUARTER ${this.quarter}`);
   if(this.quarter===3){if(this.match.halftimeShow&&!this.halftimeShown){this.halftimeShown=true;this.halftime=halftimeReport(this);this.phase='halftime';this.emit('halftime','HALFTIME');return;}this.beginKick('kickoff',0,35);return;}
  }
  if(p?.kickoff!==undefined){this.beginKick('kickoff',p.kickoff,p.kickSpot);return;}
  const offense=p?.offense??this.offense,spot=p?.spot??this.spot;
  this.beginDrive(offense,spot,p?.down??(p?.newSeries?1:this.down+1),p?.target??(p?.newSeries?Math.min(100,spot+10):this.target));
 }
 resumeHalftime(){if(this.phase!=='halftime'||this.paused)return false;this.beginKick('kickoff',0,35);return true;}
 kick(type){
  if(!['call','ready'].includes(this.phase)||this.down!==4||this.paused)return false;
  if(type==='punt'){this.beginKick('punt',this.offense,this.spot);return true;}
  if(type!=='fieldgoal'||117-this.spot>55)return false;
  const kicker=this.teams[this.offense].roster.find(p=>p.pos==='K')||this.players[0];
  this.finish(this.rng()<clamp(1.1-(117-this.spot)/120+((kicker.kickAccuracy||82)-82)*.006+((kicker.kickPower||85)-85)*.003,.3,.98)?'fieldgoal':'miss',this.spot);return true;
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
  const kicker=this.defenders[6],factor=.9+(kicker.kickPower||85)/850;
  const yards=(s.type==='punt'?24+power*31:38+power*34)*factor;
  return {x:26.5+aim*(29+(82-(kicker.kickAccuracy||82))*.12),y:100-s.kickSpot-yards};
 }
 launchKick(power,aim){
  const s=this.special;s.power=clamp(power,0,1);s.aim=clamp(aim,-1,1);const target=this.kickTarget(s.power,s.aim),kicker=this.defenders[6];
  s.ball={x:kicker.x,y:kicker.y,sx:kicker.x,sy:kicker.y,tx:target.x,ty:target.y,elapsed:0,duration:(s.type==='punt'?2.8+s.power:3.2+s.power*.8)+( (kicker.hangTime||83)-83)*.015};
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
    resetContact(this);this.phase='return';s.catchY=b.y;this.returnInfo={type:s.type,catchY:b.y};this.spot=b.y;this.target=Math.min(100,b.y+10);s.ball=null;this.liveTime=0;this.passed=true;
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
