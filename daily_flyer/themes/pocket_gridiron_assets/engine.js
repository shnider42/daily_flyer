import {FRONTS,systemCalls} from './defensive-systems.js?v=33';
import {athleticSpeed,exert,pursuitTarget,coverageLane} from './conditioning.js?v=33';
import {availableTeam,beginHealthPlay} from './injuries.js?v=33';
import {chooseOffense,cpuRunTarget,cpuRunBurst} from './rushing.js?v=33';
import {createWeather,effects,windFor,kickConditions,weatherMove} from './weather.js?v=33';
import {fullUnit,fullFormation,fullCoverage,fillSpecial} from './full-team.js?v=33';
import {specialUnit,RETURN_PLANS,returnLane,recordKickLaunch,recordKickEnd,recordGoal} from './special-teams.js?v=33';
import {goalWindow,goalResult} from './placekicks.js?v=33';
import {formationOf,PERSONNEL,defensiveUnit,tendency,fakeRead,choosePersonnel} from './packages.js?v=33';
import {matchLength,emptyBox,copyBox,halftimeReport} from './match.js?v=33';
import {PLAYS,DEFENSE,routeFor,newCoverageTarget,defensiveCalls,fullCalls,pocketCalls} from './plays.js?v=33';
import {passPlacement,eligibleReceivers,catchReach,landingPickChance} from './passing.js?v=33';
import {playbook} from './teams.js?v=33';
import {resetContact,nearestThreat,armBreak,beginContact,tickContact} from './contact.js?v=33';
import {AI_PROFILES,BALL_RULES,MOVEMENT_RULES,fumbleChance,footballRules,catchInBounds} from './rules.js?v=33';
import {clearBlocks,isBlocker,updateBlocking,shedBlock,canTackle,stuntTarget} from './blocking.js?v=33';
import {PENALTIES,acceptedPenalty,outcomeValue} from './penalties.js?v=33';
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export {PLAYS,DEFENSE} from './plays.js?v=33';
const animate=(p,slot,x,y)=>({...p,slot,x,y,speed:athleticSpeed(p.speed),stun:0,phase:0,pace:.55,energy:100,carrySeconds:0,grounded:false,groundTime:0});
export class Game {
 constructor(home,away,difficulty='pro',rng=Math.random,options={}){
  this.rules=footballRules(options,[home,away]);this.ruleset=this.rules.id;this.historicalMoment=options.historicalMoment===true;this.ballX=26.5;this.collegeOvertime=null;this.tryAttempt=null;this.tryChoiceTeam=null;
  this.injuriesEnabled=options.injuries!==false;this.injuries=[];this.healthPlay=0;this.lastInjuryPlay=-18;this.injuryCheckedPlay=-1;this.format=options.format===7?7:11;this.playClockEnabled=options.playClock===true;this.tvTimeouts=options.tvTimeouts===true;this.tvQuarters=new Set();this.playClock=40;this.teams=[home,away];this.rng=rng;this.difficulty=difficulty;this.scores=[0,0];
  this.match=matchLength(options.length);this.quarterSeconds=this.match.quarterSeconds;this.halftimeShown=false;this.box=[emptyBox(),emptyBox()];this.quarter=1;this.clock=this.quarterSeconds;this.offense=0;this.spot=25;this.target=35;this.down=1;
  this.play='slants';this.defense='zone';this.events=[];this.history=[[],[]];this.stats={yards:0,returnYards:0,completions:0,attempts:0,tackles:0,drops:0,fumbles:0,fumblesLost:0,interceptions:0,takeaways:0,penalties:0,penaltyYards:0,brokenTackles:0};
  this.offenseCalls=[[],[]];this.formationHistory=[{},{}];this.defensePreference=PERSONNEL[options.defensePackage]?options.defensePackage:'base';this.unitOffense=null;this.personnel='base';this.defenseUnit=null;
  this.paused=false;this.time=0;this.special=null;this.pending=null;this.pendingFinal=false;this.publishedScores=[0,0];
  this.weather=createWeather(home,options.weather||'clear');this.beginKick('kickoff',1,35);
 }
 emit(type,text,detail='',meta={}){this.events.push({type,text,detail,...meta});}
 get stamina(){return this.carrier?.energy??100;}
 set stamina(value){if(this.carrier)this.carrier.energy=clamp(value,0,100);}
 get userOffense(){return this.offense===(this.humanTeam??0);}
 isHumanDefender(p){return !this.userOffense&&p===this.controlled;}
 autoPenalty(team){return team===1;}
 get isReturn(){return this.phase==='return';}
 get isLive(){return this.phase==='live'||this.isReturn;}
 get isLoose(){return this.phase==='fumble';}
 get defenseAI(){return AI_PROFILES[this.userOffense?this.difficulty:'pro']||AI_PROFILES.pro;}
 get offenseAI(){return AI_PROFILES[this.difficulty]||AI_PROFILES.pro;}
 get userKicking(){return Boolean(this.special&&this.special.kickingTeam===(this.humanTeam??0));}
 get controlled(){
  if(this.special?.goal)return this.players[0];
  if(this.special&&['kick_ready','kick_charge'].includes(this.phase)&&this.userKicking)return this.defenders[6];
  return this.userOffense?(this.isLoose?this.players[this.recoverySelected]:this.carrier):this.defenders[this.selected];
 }
 get hashOffset(){return this.rules.hashSpotting&&!this.isReturn?this.ballX-26.5:0;}
 fieldX(x){return this.hashOffset?clamp(x+this.hashOffset,1,52):x;}
 get defenseDefinition(){
  const original=defensiveCalls.get(this.defense),offset=this.hashOffset;if(!offset)return original;
  const key=`${this.defense}:${offset}`;if(this.shiftedDefense?.key===key)return this.shiftedDefense.value;
  const shift=c=>c?{...c,zones:c.zones?Object.fromEntries(Object.entries(c.zones).map(([slot,z])=>[slot,{...z,x:this.fieldX(z.x)}])):c.zones}:c;
  const value={...original,coverage:shift(original.coverage),fullCoverage:shift(original.fullCoverage)};this.shiftedDefense={key,value};return value;
 }
 get playDefinition(){
  const original=(this.format===11?fullCalls:pocketCalls).get(this.play),offset=this.hashOffset;if(!offset)return original;
  const key=`${this.play}:${this.format}:${offset}`;if(this.shiftedPlay?.key===key)return this.shiftedPlay.value;
  const value={...original};for(const k of ['lane','blockLane','rollout'])if(Number.isFinite(value[k]))value[k]=this.fieldX(value[k]);
  for(const k of ['pull','lead'])if(value[k])value[k]={...value[k],x:this.fieldX(value[k].x)};
  if(value.pulls)value.pulls=value.pulls.map(p=>({...p,x:this.fieldX(p.x)}));
  if(value.exchange)value.exchange={...value.exchange,xTarget:this.fieldX(value.exchange.xTarget)};
  if(value.playAction)value.playAction={...value.playAction,lane:this.fieldX(value.playAction.lane)};
  this.shiftedPlay={key,value};return value;
 }
 get formation(){const f=this.format===11?fullFormation(formationOf(this.playDefinition)):formationOf(this.playDefinition);return this.hashOffset?{...f,x:f.x.map(x=>this.fieldX(x))}:f;}
 get canChooseTry(){return this.phase==='try_choice'&&!this.paused;}
 get tryRequiredTwo(){return Boolean(this.collegeOvertime?.period>=2);}
 get fakeActive(){return !!this.playAction&&!this.isReturn&&!this.receivedPass&&!this.passed&&this.liveTime<this.playAction.duration;}
 get offensePlays(){return playbook(this.teams[this.offense],'offense',PLAYS);}
 get defensePlays(){const original=playbook(this.teams[1-this.offense],'defense',DEFENSE);return [...original,...systemCalls(DEFENSE,PERSONNEL[this.personnel].system).filter(p=>!original.some(q=>q.id===p.id))];}
 get humanPlays(){return this.userOffense?this.offensePlays:this.defensePlays;}
 get breakAvailable(){return Boolean(nearestThreat(this))&&!this.breakArm&&this.breakCooldown<=0&&this.stamina>=24*effects(this.weather).cost;}
 breakTackle(input=this.lastInput){return this.userOffense&&!this.paused&&armBreak(this,input);}
 get canPass(){return this.phase==='live'&&!this.fakeActive&&!this.pass&&!this.passed&&!this.crossed&&this.playDefinition.kind==='pass'&&this.carrier===this.players[0];}
 resetPlay(){this.nextRunRead=0;this.runRead=null;this.playAction=null;this.pass=null;this.pitch=null;this.loose=null;this.returnInfo=null;this.scrambleRecovery=false;this.receivedPass=false;this.passed=false;this.crossed=false;this.liveTime=0;this.burstLeft=0;this.burstCooldown=0;this.diveLeft=0;this.diveCooldown=0;this.evaded=false;this.breakUsed=false;this.ballVisible=true;this.nextQBRead=0;this.handoffTime=0;this.readyTime=0;this.cpuSnapIn=null;this.flags=[];this.playStart=null;this.penaltyReview=null;this.aiJump=null;this.lastInput={x:0,y:0};resetContact(this);clearBlocks(this);}
 setFormation(){
  const {x:xs,y:ys}=this.formation,attack=availableTeam(this,this.offense),defend=availableTeam(this,1-this.offense);
  this.players=(this.format===11?fullUnit(attack,'offense',attack.offense):attack.offense).map((p,i)=>({...animate(p,i,xs[i],this.spot+ys[i]),routeStart:{x:xs[i],y:ys[i]}}));
  const depths=this.defenseDefinition.depths||{zone:[1.5,1.5,5,5,9,9,14],man:[1.5,1.5,4,4,5,5,16],blitz:[1.5,1.5,2,5,7,7,14],cover2:[1.5,1.5,5,5,6,17,17],cover3:[1.5,1.5,5,5,16,16,20],commit:[1,1,2,2,4,4,12],press:[1.5,1.5,2,3,1,1,19],robber:[1.5,1.5,4,7,5,5,19],prevent:[1.5,1.5,20,20,25,25,30]}[this.defense];
  const dx=(this.defense==='cover2'?[23,30,18,39,7,13,40]:[23,30,15,39,8,45,26.5]).map(x=>this.fieldX(x));
  const coverage=this.defenseDefinition.coverage;
  if(coverage)for(let i=0;i<7;i++){if(coverage.zones?.[i])dx[i]=coverage.zones[i].x;if(coverage.man?.[i]!==undefined)dx[i]=xs[coverage.man[i]];if(coverage.spy===i)dx[i]=this.fieldX(26.5);if(coverage.bracket&&(coverage.bracket.under===i||coverage.bracket.over===i))dx[i]=xs[coverage.bracket.slot];}
  const unit=defensiveUnit(defend,this.personnel);
  this.defenders=(this.format===11?fullUnit(defend,'defense',unit,this.personnel):unit).map((p,i)=>animate(p,i,dx[i]??this.fieldX([19,34,26.5,40][i-7]),Math.min(107,this.spot+(depths[i]??[1.5,1.5,5,16][i-7]))));
  if(['man','press','robber'].includes(this.defense)){this.defenders[2].x=xs[4];this.defenders[4].x=xs[2];this.defenders[5].x=xs[3];}
  if(this.personnel==='heavy'&&this.unitOffense===this.offense){this.defenders[2].x=this.fieldX(19);this.defenders[2].y=this.spot+1.5;}
  const front=FRONTS[this.defenseDefinition.system||(this.format===11?PERSONNEL[this.personnel].system:['odd','bear','stack'].includes(this.personnel)?this.personnel:'')];
  if(front){const c=this.format===11?this.defenseDefinition.fullCoverage:this.defenseDefinition.coverage;for(const d of this.defenders){d.x=this.fieldX(front.x[d.slot]+(d.slot<2||d.slot===7||d.slot===8?(this.defenseDefinition.shift||0):0));d.y=Math.min(107,this.spot+front.y[d.slot]);const receiver=c?.man?.[d.slot];if(receiver!==undefined&&this.players[receiver]){d.x=this.players[receiver].x;d.y=Math.min(107,this.spot+Math.max(3,front.y[d.slot]));}}}
  if(this.format===11&&!this.defenseDefinition.system){
   const jobs=this.defenseDefinition.fullCoverage;
   for(const d of this.defenders){
    const zone=jobs.zones[d.slot];
    if(zone)d.y=Math.min(107,this.spot+(zone.y>=18?14:Math.min(7,zone.y)));
    else if(jobs.rush.includes(d.slot)&&d.slot>=2)d.y=Math.min(d.y,this.spot+3.5);
   }
  }
  this.carrier=this.players[0];this.selected=2;this.resetPlay();this.cameraY=this.spot+12;
  for(const d of this.defenders){d.nextRead=0;d.readTarget={x:d.x,y:d.y};d.reactionJitter=this.rng()*.10;}
 }
 weighted(items,weight){const weights=items.map(weight),sum=weights.reduce((a,b)=>a+b,0);let n=this.rng()*sum;return items.find((_,i)=>(n-=weights[i])<0)||items.at(-1);}
 selectDefense(){
  const ai=this.offense===0?(AI_PROFILES[this.difficulty]||AI_PROFILES.pro):AI_PROFILES.pro,toGo=this.target-this.spot;
  const observed=this.formationHistory[this.offense][this.formation.id]||[],recent=observed.length>=3?observed:this.history[this.offense],runRate=tendency(recent).runRate;
  return this.weighted(this.defensePlays,p=>{let w=1;if(toGo>=8&&this.down>=3&&(p.group==='zone'||p.id==='robber'))w+=4;if(toGo<=3&&(p.group==='pressure'||p.id==='press'))w+=4;if(this.spot>85&&['zone','robber','press'].includes(p.id))w+=2;if(this.quarter===4&&this.clock<12&&this.scores[1-this.offense]>this.scores[this.offense]&&p.id==='prevent')w+=7;if(recent.length>=4){if(runRate>.65&&p.group==='pressure')w+=4;if(runRate<.35&&(p.group==='zone'||p.id==='robber'))w+=4;}return (1+(w-1)*ai.adapt)*(this.teams[1-this.offense].profile?.defense.signature.includes(p.id)?1.6:p.system===PERSONNEL[this.personnel].system?1.45:1);}).id;
 }
 selectOffense(){return chooseOffense(this);}
 beginDrive(offense,spot,down=1,target=Math.min(100,spot+10),ballX=26.5){
  this.tryAttempt=null;this.tryChoiceTeam=null;this.ballX=this.rules.hashSpotting?clamp(ballX,...this.rules.hashMarksYards):26.5;
  this.playClock=40;this.special=null;this.pending=null;this.offense=offense;this.spot=spot;this.down=down;this.target=target;this.phase='call';
  // Personnel is committed before the offensive call and lasts this possession.
  if(this.unitOffense!==offense){
   const seen=tendency(this.history[offense]);
   this.personnel=!this.userOffense?this.defensePreference:seen.total>=4?(seen.runRate>.62?'heavy':seen.runRate<.38?'nickel':this.teams[1-offense].profile?.defense.personnel||'base'):this.teams[1-offense].profile?.defense.personnel||'base';
   this.personnel=choosePersonnel(this.teams[1-offense],this.personnel,this.format);
   this.defenseUnit=defensiveUnit(this.teams[1-offense],this.personnel);this.unitOffense=offense;
  }
  // The CPU offense commits now, before the human sees the defensive book.
  if(!this.userOffense){this.play=this.selectOffense();this.defense=this.selectDefense();}
  else this.defense=this.defensePlays[0].id;
  this.setFormation();
  // CPU special teams are its own decisions, never buttons for the human to call.
  if(!this.userOffense&&down===4){
   if(spot<62&&!this.collegeOvertime){this.beginKick('punt',offense,spot);return;}
   const needsTouchdown=this.collegeOvertime?.series===1&&this.scores[1-offense]-this.scores[offense]>3;
   if(117-spot<=55&&!needsTouchdown){this.kick('fieldgoal');return;}
  }
  this.emit('call','');
 }
 choose(id){
  if(!['call','ready'].includes(this.phase)||this.paused)return false;
  if(this.userOffense){if(!this.offensePlays.some(p=>p.id===id))return false;this.play=id;this.defense=this.selectDefense();}
  else{if(!this.defensePlays.some(p=>p.id===id))return false;this.defense=id;}
  const selected=this.selected;this.phase='ready';this.setFormation();if(!this.userOffense&&this.defenders[selected])this.selected=selected;
  if(!this.userOffense)this.cpuSnapIn=2.4+this.rng()*.9;
  else if(this.rng()<({rookie:.07,pro:.04,legend:.015}[this.difficulty]??.04))this.aiJump={slot:this.rng()<.5?0:1,at:1.1+this.rng()};
  return true;
 }
 recordPlay(){this.playStart={offense:this.offense,spot:this.spot,target:this.target,down:this.down,scores:[...this.scores],stats:{...this.stats},box:copyBox(this.box),call:{id:this.play,name:this.playDefinition.name,formation:this.formation.name,kind:this.playDefinition.kind,playAction:!!this.playDefinition.playAction}};}
 snap(team=0){
  if(this.phase!=='ready'||this.paused||team!==this.offense)return false;
  beginHealthPlay(this);this.recordPlay();this.box[this.offense].plays++;this.offenseCalls[this.offense]=[...this.offenseCalls[this.offense],this.play].slice(-8);this.phase='live';this.liveTime=0;this.emit('snap','');
  const offside=this.defenders.find(d=>d.y<this.spot+.45);if(offside)this.flag('offside',1-this.offense,offside);
  const observed=this.formationHistory[this.offense][this.formation.id]||[];
  if(this.playDefinition.playAction){
   this.playAction={...this.playDefinition.playAction,seen:tendency(observed),complete:false};
   const unitRecognition=this.defenders.reduce((sum,d)=>sum+(d.recognition||80),0)/this.defenders.length;
   for(const d of this.defenders){if(this.isHumanDefender(d)||![2,3,6].includes(d.slot)||this.personnel==='heavy'&&d.slot===2)continue;
    const read=fakeRead({difficulty:this.userOffense?this.difficulty:'pro',defender:d,qb:this.players[0],rb:this.players[1],unitRecognition,seen:observed,slot:d.slot});
    // One decision at the snap, never a fresh chance on each animation frame.
    d.fakeBite=this.rng()<read.chance;d.fakeUntil=d.fakeBite?.25+read.duration:0;
   }
  }
  this.formationHistory[this.offense][this.formation.id]=[...observed,this.playDefinition.playAction?'playaction':this.playDefinition.kind].slice(-24);
  this.history[this.offense].push(this.playDefinition.kind);this.history[this.offense]=this.history[this.offense].slice(-12);
  if(this.playDefinition.kind==='run'&&this.play!=='draw'&&!this.playDefinition.exchange)this.carrier=this.players[this.playDefinition.carrier??1];
  if(this.playDefinition.exchange)this.pitch={...this.playDefinition.exchange,elapsed:0,released:false,x:this.carrier.x,y:this.carrier.y};
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
   if(both||this.autoPenalty(beneficiary))this.resolvePenalty(both||outcomeValue(accept,1)>=outcomeValue(decline,1));
   else this.emit('penalty','PENALTY DECISION',this.penaltyReview.description);
   return;
  }
  this.publishResult(title,detail);
 }
 resolvePenalty(accept){
  if(!this.penaltyReview||this.paused)return false;
  const review=this.penaltyReview,outcome=accept?review.accept:review.decline;if(!outcome)return false;
  this.scores=[...outcome.scores];this.stats={...outcome.stats};this.box=copyBox((accept?this.playStart?.box:outcome.box)||this.box);this.pending={...outcome.pending};
  if(accept&&this.tryAttempt&&this.pending.kickoff!==undefined){this.scores=[...this.playStart.scores];this.scores[1-this.tryAttempt.team]++;this.pending={tryComplete:this.tryAttempt.team};outcome.title='HOLDING · ONE-POINT SAFETY';outcome.detail='One point to the defense on the try';}
  if(accept&&this.collegeOvertime){this.collegeOvertime.changedPossession=false;if(!this.tryAttempt&&this.scores[1-this.collegeOvertime.offense]>this.playStart.scores[1-this.collegeOvertime.offense])this.pending={collegeGameOver:true};}
  this.penaltyReview=null;this.flags=[];this.phase='dead';this.deadTimer=2.7;this.pass=null;this.loose=null;clearBlocks(this);
  this.publishResult(accept?outcome.title:`PENALTY DECLINED`,accept?outcome.detail:`${outcome.title} · ${outcome.detail}`);return true;
 }
 publishResult(title,detail){
  const delta=this.scores.map((score,i)=>score-this.publishedScores[i]),scoreTeam=delta.findIndex(n=>n>0);
  this.publishedScores=[...this.scores];this.lastResult=`${title} — ${detail}`;
  this.emit('result',title,detail,scoreTeam<0?{}:{scoreTeam,scorePoints:delta[scoreTeam],scoreAbbr:this.teams[scoreTeam].abbr});
  this.pendingFinal=!this.collegeOvertime&&this.rules.overtime!=='possessions'&&this.quarter>4&&this.scores[0]!==this.scores[1];
 }
 burst(){
  if(!this.isLive||this.paused||this.userOffense&&this.fakeActive)return;
  if(this.userOffense)this.burstForRunner();
  else{if(this.diveCooldown>0)return;if(shedBlock(this,this.controlled)){this.diveCooldown=1.3;this.emit('shed','SHED THE BLOCK!');return;}this.diveLeft=.32;this.diveCooldown=1.7;const p=this.controlled,b=this.carrier,d=distance(p,b)||1;p.dx=(b.x-p.x)/d;p.dy=(b.y-p.y)/d;this.emit('dive','');}
 }
 burstForRunner(){if(!this.isLive||this.paused||this.fakeActive||this.pass||this.contact||this.burstCooldown>0||this.stamina<12*effects(this.weather).cost)return false;this.stamina-=12*effects(this.weather).cost;this.burstLeft=.6;this.burstCooldown=3;this.evaded=false;this.emit('burst','');return true;}
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
 move(p,dx,dy,speed,dt){if(p.stun>0||p.groundTime>0)return;speed*=weatherMove(this,p,dx,dy,dt);speed*=p.blockFactor??1;speed*=exert(this,p,dx,dy,dt,effects(this.weather));if(p===this.carrier&&this.isLive&&!this.pass)speed*=MOVEMENT_RULES.carrierSpeed*(this.contactSlow>0?.65:1);const n=Math.hypot(dx,dy);if(n>.04){p.pace=Math.min(1,(p.pace??1)+dt*(2+(p.acceleration||75)/40)*effects(this.weather).acceleration);speed*=p.pace;p.x+=dx/Math.max(1,n)*speed*dt;p.y+=dy/Math.max(1,n)*speed*dt;p.phase+=dt*14;}else p.pace=.55;p.x=clamp(p.x,-.2,53.5);p.y=clamp(p.y,-9,110);}
 route(p,time=this.liveTime){
  const offset=this.hashOffset;if(!offset)return routeFor(this.playDefinition,p,time,this.spot);
  const base=(this.format===11?fullCalls:pocketCalls).get(this.play),canonical=p.routeStart?{...p,routeStart:{...p.routeStart,x:p.routeStart.x-offset}}:p;
  const target=routeFor(base,canonical,time,this.spot);return {...target,x:this.fieldX(target.x)};
 }
 coverageTarget(d){
  const i=d.slot,ai=this.defenseAI,coverage=this.format===11&&this.defenseDefinition.fullCoverage?this.defenseDefinition.fullCoverage:this.defenseDefinition.coverage;
  const stunt=stuntTarget(this,d);if(stunt)return {...stunt,x:this.fieldX(stunt.x)};
  if(this.pass&&this.liveTime>=(d.ballSeenAt??Infinity)&&distance(d,this.pass)<ai.vision&&(i>=2||coverage?.zones?.[i])){
   // React to the visible trajectory, not a telepathic landing-point broadcast.
   const b=this.pass,lead=Math.min(ai.lead,b.duration-b.elapsed);
   return {x:clamp(b.x+(b.tx-b.sx)/b.duration*lead,1,52),y:clamp(b.y+(b.ty-b.sy)/b.duration*lead,-4,107)};
  }
  if(this.isReturn||this.scrambleRecovery||!this.pass&&(this.carrier!==this.players[0]||this.crossed)&&this.liveTime>=this.handoffTime+ai.recognizeRun){
   return pursuitTarget(this,d);
  }
  if(!this.passed&&!this.pass&&this.playAction&&this.liveTime>=.25&&this.liveTime<d.fakeUntil)return {x:this.playAction.lane,y:this.spot+.5};
  if(this.personnel==='heavy'&&this.unitOffense===this.offense&&i===2)return this.carrier;
  const assigned=newCoverageTarget(this,d);if(assigned)return assigned;
  const extra=fullCoverage(this,d);if(extra)return extra;
  if(i<2||this.defense==='blitz'&&i===2||this.defense==='commit'&&i<4)return this.carrier;
  if(['man','press','robber'].includes(this.defense)){
   // One primary matchup each. The safety provides help instead of duplicating
   // the right WR assignment; the remaining LB covers the back/hook or robs.
   const slot={2:4,4:2,5:3}[i];
   if(slot!==undefined){const p=this.players[slot];return {x:p.x+(p.x<26.5?.5:-.5),y:Math.min(107,p.y+(.6+ai.adapt*.7))};}
   if(i===6){const threats=this.players.slice(2,5).filter(p=>p.y>this.spot+10).sort((a,b)=>b.y-a.y);const p=threats[0];return {x:p?clamp(p.x,14,39):26.5,y:Math.min(107,Math.max(this.spot+22,(p?.y||this.spot)+5))};}
   if(this.defense==='press')return this.carrier;
   if(this.defense==='robber'){const p=this.players.slice(2,5).filter(p=>Math.abs(p.x-26.5)<15&&p.y<this.spot+14).sort((a,b)=>distance(a,d)-distance(b,d))[0];return p?{x:p.x,y:p.y+1}:{x:26.5,y:Math.min(107,this.spot+9)};}
   return {x:this.fieldX(26.5),y:Math.min(107,this.spot+6)};
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
  const [baseX,y]=zones[i-2],x=this.fieldX(baseX);
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
  if(this.phase==='tv_timeout'){this.tvLeft-=dt;if(this.tvLeft<=0)this.resumeTV();return;}
  if(this.tickPlayClock(dt))return;
  if(this.phase==='dead'){this.deadTimer-=dt;if(this.deadTimer<=0)this.next();return;}
  if(this.phase==='ready'){this.tickReady(dt,input);return;}
  if(this.phase.startsWith('kick_')){this.tickKick(dt,input);return;}
  if(this.isLoose){this.tickFumble(dt,input);return;}
  if(!this.isLive)return;
  this.lastInput={x:input.x,y:input.y};
  this.liveTime+=dt;if(this.quarter<=4&&!this.tryAttempt)this.clock=Math.max(0,this.clock-dt);
  this.burstLeft=Math.max(0,this.burstLeft-dt);this.burstCooldown=Math.max(0,this.burstCooldown-dt);this.diveLeft=Math.max(0,this.diveLeft-dt);this.diveCooldown=Math.max(0,this.diveCooldown-dt);
  for(const p of [...this.players,...this.defenders]){p.stun=Math.max(0,p.stun-dt);if(p.groundTime>0){p.groundTime=Math.max(0,p.groundTime-dt);if(!p.groundTime)p.grounded=false;}}
  this.breakCooldown=Math.max(0,this.breakCooldown-dt);this.offBalance=Math.max(0,this.offBalance-dt);this.contactSlow=Math.max(0,this.contactSlow-dt);
  if(this.moveAnimation){this.moveAnimation.left-=dt;if(this.moveAnimation.left<=0)this.moveAnimation=null;}
  if(this.breakArm&&!this.contact){this.breakArm.left-=dt;if(this.breakArm.left<=0)this.breakArm=null;}
  if(tickContact(this,dt))return;
  const oldCarrier={x:this.carrier.x,y:this.carrier.y,vx:this.carrier.vx||0,vy:this.carrier.vy||0};
  if(this.play==='draw'&&!this.isReturn&&!this.passed&&this.liveTime>=.85){const qb=this.players[0],rb=this.players[1];rb.x=qb.x;rb.y=qb.y-.6;this.carrier=rb;resetContact(this);this.burstLeft=0;this.burstCooldown=0;this.passed=true;this.handoffTime=this.liveTime;this.emit('handoff','DRAW HANDOFF');}
  const exchanging=this.tickExchange(dt)||this.tickPlayAction(dt);
  const controlled=this.controlled;
  if(this.userOffense&&!this.pass&&!exchanging)this.move(controlled,input.x,input.y,controlled.speed*(this.burstLeft>0?1.55:1),dt);
  if(!this.userOffense){if(this.diveLeft>0)this.move(controlled,controlled.dx,controlled.dy,controlled.speed*2,dt);else this.move(controlled,input.x,input.y,controlled.speed*(this.diveCooldown>1.1?.48:1.12),dt);}
  updateBlocking(this,dt);
  for(const p of this.players){if(p===this.carrier||this.pass?.target===p||this.pitch&&p===this.players[this.pitch.runner??1]||isBlocker(this,p))continue;if(p.slot>=2&&p.slot<=4){const r=this.route(p);this.move(p,r.x-p.x,r.y-p.y,p.speed,dt);}}
  if(!this.userOffense&&!this.pass&&!exchanging){
   const p=this.carrier;let tx=26,ty=p.y+12;
   if(!this.isReturn&&p===this.players[0]&&!this.passed&&this.playDefinition.kind==='pass'){
    tx=this.playDefinition.rollout??this.fieldX(this.play==='flood'?43:26+Math.sin(this.liveTime)*4);ty=this.spot-5;
    const wait=this.playDefinition.wait||1.4;
    if(this.canPass&&this.liveTime>wait+this.offenseAI.reaction&&this.liveTime>=this.nextQBRead){
     this.nextQBRead=this.liveTime+this.offenseAI.readEvery;
     const options=this.players.slice(2,5).map((r,i)=>({i,gap:Math.min(...this.defenders.map(d=>distance(r,d)))+(this.rng()-.5)*this.offenseAI.qbNoise})).sort((a,b)=>b.gap-a.gap);
     if(options[0].gap>2||this.liveTime>3.8||this.defenders.some(d=>distance(d,p)<3))this.throwTo(options[0].i);
    }
   }else{
    const close=this.defenders.filter(d=>d.y>p.y-2&&distance(d,p)<13).sort((a,b)=>distance(a,p)-distance(b,p))[0];
    if(!this.isReturn&&this.playDefinition.delay>this.liveTime){tx=this.fieldX(26.5);ty=this.spot-4;}
    else if(!this.isReturn&&this.playDefinition.kind==='run'&&this.liveTime<1.8)tx=this.playDefinition.lane;
    else if(this.isReturn&&this.special&&this.liveTime<1.4)tx=returnLane(this);else if(close)tx=clamp(p.x+(p.x<close.x?-13:13),4,49);else tx=clamp(p.x,5,48);
   }
   if(!this.isReturn&&!this.receivedPass&&this.playDefinition.kind==='run'){const run=cpuRunTarget(this);tx=run.x;ty=run.y;cpuRunBurst(this,run);}
   const designedRun=!this.isReturn&&!this.receivedPass&&this.playDefinition.kind==='run';
   this.move(p,tx-p.x,ty-p.y,p.speed*(designedRun?.96:.92)*(this.burstLeft>0?1.55:1),dt);
  }
  if(this.isReturn&&this.special&&this.carrier.y>0)this.special.leftEndZone=true;
  this.carrier.vx=dt?(this.carrier.x-oldCarrier.x)/dt:0;this.carrier.vy=dt?(this.carrier.y-oldCarrier.y)/dt:0;
  if(oldCarrier.vx*this.carrier.vx+oldCarrier.vy*this.carrier.vy< -8)this.offBalance=Math.max(this.offBalance,.25*(1+(85-(this.carrier.balance||80))/60));
  for(const d of this.defenders){if(this.isHumanDefender(d))continue;const target=this.readDefense(d);this.move(d,target.x-d.x,target.y-d.y,d.speed*.95,dt);}
  if(this.pass){
   this.tickPass(dt);if(!this.isLive||this.isReturn)return;
  }else{
   if(this.carrier.y>this.spot+.15)this.crossed=true;
   if(this.carrier.y>=100){this.finish('touchdown',100);return;}
   if(this.carrier.x<=.4||this.carrier.x>=52.9){this.finish('out',this.carrier.y);return;}
   for(const d of this.defenders){if(d.stun>0||this.pitch?.released)continue;const radius=(this.isHumanDefender(d)&&this.diveLeft>0)?3:1.65;
    if(this.liveTime>.35&&canTackle(this,d,radius)){
     if(this.carrier.grounded){this.finish('tackle',this.carrier.y,'Down by contact after the diving catch');return;}
     beginContact(this,d);return;
    }
   }
  }
  this.cameraY+=(clamp((this.pass?this.pass.y:this.carrier.y)+16,13,93)-this.cameraY)*Math.min(1,dt*6);
  if(this.liveTime>18)this.finish('tackle',this.carrier.y);
 }
 catchPass(p){
  if(!catchInBounds(p,this.rules)){this.finish('incomplete',this.spot,`${this.rules.catchFeet===1?'One foot':'Two feet'} required in bounds`);return false;}
  if(p!==this.carrier){resetContact(this);this.burstLeft=0;this.burstCooldown=0;}
  const reach=this.pass?distance(this.pass,p):0,diving=reach>1.7,difficult=this.pass&&(this.pass.tipped||reach>1.4||(this.pass.aim?.amount||0)>.7);
  this.offBalance=difficult?clamp(.7-(p.balance||80)*.005,.15,.5):0;p.pace=difficult?.55:1;this.receivedPass=true;this.carrier=p;this.pass=null;this.box[this.offense].completions++;if(this.userOffense)this.stats.completions++;
  this.emit('catch',diving?'DIVING CATCH!':'CAUGHT!',p.name);
  if(p.y>=100)this.finish('touchdown',100);
  else if(diving){p.grounded=true;p.groundTime=.5;if(this.rules.downWithoutContact)this.finish('tackle',p.y,'Diving catch · down without contact');}
  return true;
 }
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
    const eligible=[...eligibleReceivers(this),...this.defenders].filter(p=>p.stun<=0&&catchInBounds(p,this.rules)&&distance(p,b)<1.8).sort((a,c)=>distance(a,b)-distance(c,b));
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
   if(roll<pickChance&&catchInBounds(contact,this.rules)){this.startTurnover(contact,'interception');return;}
   if(roll<pickChance+BALL_RULES.deflect){this.bobble(b);return;}
  }
  if(u>=1){
   const receiver=eligibleReceivers(this).filter(p=>p.stun<=0&&catchInBounds(p,this.rules)&&distance(b,p)<=catchReach(p)).sort((a,c)=>distance(a,b)-distance(c,b))[0];
   if(!receiver){this.finish('incomplete',this.spot,'Pass out of reach');return;}
   if(this.rng()<clamp(BALL_RULES.drop*(1+(85-(receiver.catching||85))/40)+effects(this.weather).drop,.012,.10)){this.bobble(b,true);return;}
   this.catchPass(receiver);
  }
 }
 creditYards(y,reason='return'){
  if(this.returnInfo&&this.special)recordKickEnd(this,y,reason);
  const yards=Math.round(y-(this.returnInfo?this.returnInfo.catchY:this.spot)),kind=this.returnInfo?'return':this.receivedPass?'pass':'rush',box=this.box[this.offense];box[kind+'Yards']+=yards;if(yards>box.longest.yards)box.longest={yards,player:this.carrier.name,kind};
  if(!this.userOffense)return;
  if(this.returnInfo)this.stats.returnYards+=Math.round(y-this.returnInfo.catchY);
  else this.stats.yards+=Math.round(y-this.spot);
 }
 startTurnover(p,type){
  this.pitch=null;
  if(this.collegeOvertime)this.collegeOvertime.changedPossession=true;
  this.box[1-this.offense].takeaways++;
  if(type==='interception'){this.box[this.offense].interceptions++;if(this.userOffense)this.stats.interceptions++;}
  else{this.creditYards(this.loose?.originY??p.y);this.box[this.offense].fumblesLost++;if(this.userOffense)this.stats.fumblesLost++;}
  if(!this.userOffense)this.stats.takeaways++;
  // Rotate both axes and swap existing athletes, preserving the actual
  // interceptor/recoverer, pursuit positions and always-upfield controls.
  const oldPlayers=this.players;this.players=this.defenders;this.defenders=oldPlayers;this.offense=1-this.offense;
  clearBlocks(this);
  for(const a of [...this.players,...this.defenders]){a.x=(this.ruleset==='college'?160/3:53)-a.x;a.y=100-a.y;a.vx=-(a.vx||0);a.vy=-(a.vy||0);a.nextRead=0;a.readTarget={x:a.x,y:a.y};}
  resetContact(this);this.carrier=p;this.special=null;this.loose=null;this.pass=null;this.phase='return';this.passed=true;this.crossed=true;this.liveTime=0;
  this.returnInfo={type,catchY:p.y};this.spot=clamp(p.y,1,99);this.target=100;this.burstLeft=0;this.burstCooldown=0;this.diveLeft=0;this.diveCooldown=0;this.evaded=false;this.breakUsed=false;
  this.selected=this.defenders.map((a,i)=>({i,d:distance(a,p)})).sort((a,b)=>a.d-b.d)[0].i;this.cameraY=clamp(p.y+16,13,93);
  this.emit('turnover',type==='interception'?'INTERCEPTED!':'FUMBLE RECOVERED!',this.userOffense?'YOUR BALL · RUN UPFIELD ↑':'POSSESSION FLIPS · STOP THE RETURN',{turnoverType:type});
  if(p.y<=0){this.deadPossession('TOUCHBACK',20,this.offense);return;}
 }
 startFumble(tackler){
  this.pitch=null;
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
  if(this.tryAttempt&&p!==b.fumbler){this.finishTry('incomplete',p.y,'Try ends · only the fumbler may advance an offensive recovery');return;}
  // Simplified fourth-down anti-advancement rule: own recovery is dead and
  // cannot gain beyond the fumble spot. Normal recoveries remain returnable.
  if(this.down===4&&!this.isReturn){p.y=Math.min(p.y,b.originY);this.finish('tackle',p.y,'Own recovery · no fourth-down fumble advance');return;}
  this.emit('ball','RECOVERED!',this.userOffense?'YOUR BALL · keep running ↑':'Offense keeps possession');
 }
 tickFumble(dt,input){
  const b=this.loose;b.elapsed+=dt;if(this.quarter<=4&&!this.tryAttempt)this.clock=Math.max(0,this.clock-dt);
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
  if(this.tryAttempt){this.finishTry('incomplete',spot,title);return;}
  this.phase='dead';this.deadTimer=2.2;this.pass=null;this.loose=null;if(this.special)this.special.ball=null;
  this.pending={offense,spot:clamp(Math.round(spot),1,99),newSeries:true,ballX:offense===this.offense?this.carrier.x:160/3-this.carrier.x};
  this.reviewResult(title,`${this.teams[offense].abbr} ball · ${spot<50?'own':'opponent'} ${Math.round(spot<50?spot:100-spot)}`);
 }
 finish(kind,y,reason=''){
  if(!this.isLive&&!['fieldgoal','miss'].includes(kind))return;
  if(this.tryAttempt){this.finishTry(kind,y,reason);return;}
  const offense=this.offense,returning=this.isReturn,gain=kind==='incomplete'?0:Math.round(y-this.spot);
  if(!['fieldgoal','miss','incomplete'].includes(kind))this.creditYards(y,kind);
  this.phase='dead';this.deadTimer=2.2;this.pass=null;this.pitch=null;let title='',detail='';
  if(kind==='touchdown'){this.scores[offense]+=6;this.pending={extraPoint:offense};title='TOUCHDOWN!';detail=`${this.teams[offense].abbr} +6${returning?' · return TD':''} · extra point next`;}
  else if(kind==='fieldgoal'){this.scores[offense]+=3;this.pending={kickoff:offense,kickSpot:35};title='IT’S GOOD!';detail=`${this.players[0].name} · ${this.special?.distance??117-this.spot} yards · three points`; }
  else if(kind==='miss'){this.pending={offense:1-offense,spot:clamp(100-this.spot,20,99),newSeries:true};title='NO GOOD';detail='The other team takes over';}
  else if(y<=0&&kind!=='incomplete'){this.scores[1-offense]+=2;this.pending={kickoff:offense,kickSpot:20};title='SAFETY';detail='Two points · free kick from the 20';}
  else if(returning){this.pending={offense,spot:clamp(Math.round(y),1,99),newSeries:true};title='RETURN ENDS';detail=`${Math.round(y-this.returnInfo.catchY)} return yards · ${this.teams[offense].abbr} starts ${y<50?'own':'opponent'} ${Math.round(y<50?y:100-y)}`;}
  else if(kind!=='incomplete'&&y>=this.target){this.pending={offense,spot:clamp(y,1,99),newSeries:true};title='FIRST DOWN!';detail=`${gain} yards · move the chains`;}
  else if(this.down>=4){this.pending={offense:1-offense,spot:clamp(100-y,1,99),newSeries:true};title='TURNOVER ON DOWNS';detail='The defense holds';}
  else{this.pending={offense,spot:kind==='incomplete'?this.spot:clamp(y,1,99),newSeries:false};title=kind==='incomplete'?'INCOMPLETE':gain<0?`${Math.abs(gain)} YARD LOSS`:gain===0?'NO GAIN':`${gain} YARD GAIN`;detail=kind==='out'?'Out of bounds':kind==='tackle'?(this.carrier===this.players[0]&&this.playDefinition.kind==='pass'&&gain<0?'Sacked!':'Brought down'):'Try another route';}
  this.pending.ballX=kind==='incomplete'?this.ballX:this.pending.offense!==undefined&&this.pending.offense!==offense?160/3-this.carrier.x:this.carrier.x;
  // Only a score by the original defense bypasses the reply possession. A
  // returner's safety awards the original offense two and still ends its series.
  if(this.collegeOvertime&&(kind==='touchdown'&&offense!==this.collegeOvertime.offense||y<=0&&kind!=='incomplete'&&!['fieldgoal','miss'].includes(kind)&&1-offense!==this.collegeOvertime.offense)){this.pending={collegeGameOver:true};detail=kind==='touchdown'?'Defensive touchdown · game over':'Defensive score · game over';}
  if(reason)detail=reason;this.reviewResult(title,detail);
 }
 beginTryChoice(team){
  this.tryChoiceTeam=team;this.tryAttempt=null;this.offense=team;this.special=null;this.pending=null;this.phase='try_choice';
  if(this.tryRequiredTwo){this.beginTwoPoint(team);return;}
  if(team!==(this.humanTeam??0)){
   const margin=this.scores[team]-this.scores[1-team],late=this.collegeOvertime||this.quarter===4&&this.clock<this.quarterSeconds*.5;
   this.chooseTry(late&&[-2,-5,-8].includes(margin)?'two':'kick');return;
  }
  this.emit('try','POINT AFTER','Kick for 1 or run a play for 2 · both from the 3-yard line');
 }
 chooseTry(type){
  if(!this.canChooseTry||!['kick','two'].includes(type)||type==='kick'&&this.tryRequiredTwo)return false;
  const team=this.tryChoiceTeam;if(type==='two')this.beginTwoPoint(team);else{this.tryChoiceTeam=null;this.beginGoal('extra',team,this.rules.extraPointSpot);}return true;
 }
 beginTwoPoint(team,spot=this.rules.twoPointSpot){
  this.beginDrive(team,spot,1,100,26.5);this.tryAttempt={team,spot};this.playClock=25;
  this.emit('try','TWO-POINT TRY',`${this.teams[team].abbr} · one play from the ${Math.round(100-spot)} · no game clock`);
 }
 finishTry(kind,y,reason=''){
  const attempt=this.tryAttempt;if(!attempt)return;
  let team=null,points=0;if(kind==='touchdown'){team=this.offense;points=2;}else if(y<=0&&kind!=='incomplete'){team=1-this.offense;points=1;}
  if(team!==null)this.scores[team]+=points;
  this.phase='dead';this.deadTimer=2.2;this.pass=null;this.pitch=null;this.loose=null;this.pending={tryComplete:attempt.team};
  const title=points===2?(team===attempt.team?'TWO-POINT CONVERSION!':'DEFENSIVE TWO-POINT RETURN!'):points===1?'ONE-POINT SAFETY':'TRY NO GOOD';
  this.reviewResult(title,reason||(points?`${this.teams[team].abbr} +${points}`:'The defense stops the conversion'));
 }
 startCollegeOvertime(firstTeam=this.rng()<.5?0:1){
  this.collegeOvertime={period:1,firstTeam,series:0,offense:firstTeam,changedPossession:false};this.pendingFinal=false;this.beginCollegeSeries();
 }
 beginCollegeSeries(){
  const ot=this.collegeOvertime;this.quarter=4+ot.period;this.clock=0;ot.offense=ot.series===0?ot.firstTeam:1-ot.firstTeam;ot.changedPossession=false;this.pendingFinal=false;
  if(ot.period>=3)this.beginTwoPoint(ot.offense);else this.beginDrive(ot.offense,75,1,85,26.5);
  this.emit('overtime',`OVERTIME ${ot.period}`,`${this.teams[ot.offense].abbr} · ${ot.series===0?'first':'second'} possession · ${ot.period>=3?'two-point try':ot.period===2?'start at the 25 · two-point try after TD':'start at the 25 · both teams get a possession'}`);
 }
 completeCollegePossession(){
  const ot=this.collegeOvertime;this.tryAttempt=null;this.tryChoiceTeam=null;
  if(ot.series===0){ot.series=1;this.beginCollegeSeries();return;}
  if(this.scores[0]!==this.scores[1]){this.pending=null;this.phase='final';this.emit('final','FINAL');return;}
  ot.period++;ot.firstTeam=1-ot.firstTeam;ot.series=0;this.beginCollegeSeries();
 }
 nextCollege(){
  const p=this.pending||{},ot=this.collegeOvertime;
  if(p.collegeGameOver){this.pending=null;this.tryAttempt=null;this.phase='final';this.emit('final','FINAL');return;}
  if(p.tryComplete!==undefined){this.completeCollegePossession();return;}
  if(this.tryAttempt){this.beginTwoPoint(this.tryAttempt.team,p.spot??this.tryAttempt.spot);return;}
  if(p.extraPoint!==undefined){
   if(ot.series===1&&this.scores[p.extraPoint]>this.scores[1-p.extraPoint]){this.completeCollegePossession();return;}
   this.beginTryChoice(p.extraPoint);return;
  }
  if(p.kickoff!==undefined||ot.changedPossession||p.offense!==undefined&&p.offense!==ot.offense){this.completeCollegePossession();return;}
  this.beginDrive(ot.offense,p.spot??this.spot,p.down??(p.newSeries?1:this.down+1),p.target??(p.newSeries?Math.min(100,(p.spot??this.spot)+10):this.target),p.ballX??this.ballX);
 }
 next(){
  if(this.phase!=='dead')return;
  if(this.collegeOvertime){this.nextCollege();return;}
  if(this.pending?.tryComplete!==undefined){const team=this.pending.tryComplete;this.tryAttempt=null;this.pending={kickoff:team,kickSpot:35};}
  else if(this.tryAttempt){this.beginTwoPoint(this.tryAttempt.team,this.pending?.spot??this.tryAttempt.spot);return;}
  if(this.tvTimeouts&&!this.tvQuarters.has(this.quarter)&&this.quarter<4&&(this.pending?.newSeries&&this.pending.offense!==this.offense||this.clock<=0&&[1,3].includes(this.quarter))){this.tvQuarters.add(this.quarter);this.phase='tv_timeout';this.tvLeft=6;this.emit('tv','TV TIMEOUT','A quick breather. Skip whenever you are ready.');return;}
  const extend=this.pending?.extend;
  const tryTeam=this.pending?.extraPoint,tryMatters=!(this.quarter===4&&this.clock<=0&&(this.scores[tryTeam]>this.scores[1-tryTeam]||this.scores[1-tryTeam]-this.scores[tryTeam]>(this.ruleset==='college'?2:1)));
  if(tryTeam!==undefined&&!this.pendingFinal&&tryMatters){if(this.ruleset==='college')this.beginTryChoice(tryTeam);else this.beginGoal('extra',tryTeam,this.rules.extraPointSpot);return;}
  if(this.pendingFinal||(!extend&&this.quarter===4&&this.clock<=0&&this.scores[0]!==this.scores[1])){this.phase='final';this.emit('final','FINAL');return;}
  const p=this.pending;this.pending=null;
  if(!extend&&this.clock<=0&&this.quarter<=4){
   this.quarter++;this.clock=this.quarterSeconds;
   if(this.quarter===5){if(this.rules.overtime==='possessions'&&!this.historicalMoment){this.startCollegeOvertime();return;}this.emit('overtime','OVERTIME','Next score wins');this.beginKick('kickoff',1,35);return;}
   this.emit('quarter',`QUARTER ${this.quarter}`);
   if(this.quarter===3){if(this.match.halftimeShow&&!this.halftimeShown){this.halftimeShown=true;this.halftime=halftimeReport(this);this.phase='halftime';this.emit('halftime','HALFTIME');return;}this.beginKick('kickoff',0,35);return;}
  }
  if(p?.kickoff!==undefined){this.beginKick('kickoff',p.kickoff,p.kickSpot);return;}
  const offense=p?.offense??this.offense,spot=p?.spot??this.spot;
  this.beginDrive(offense,spot,p?.down??(p?.newSeries?1:this.down+1),p?.target??(p?.newSeries?Math.min(100,spot+10):this.target),p?.ballX??this.ballX);
 }
 resumeTV(){if(this.paused||this.phase!=='tv_timeout')return false;this.phase='dead';this.next();return true;}
 tickPlayClock(dt){
  if(!this.playClockEnabled)return false;
  const scrimmage=['call','ready'].includes(this.phase),kick=this.special&&this.special.type!=='kickoff'&&['kick_ready','kick_charge','kick_accuracy'].includes(this.phase);
  if(!scrimmage&&!kick)return false;
  // The human chooses a defensive call before the CPU's cadence begins.
  if(scrimmage&&!this.userOffense&&this.phase==='call')return false;
  this.playClock=Math.max(0,this.playClock-dt);if(this.playClock>0)return false;
  const team=kick?this.special.kickingTeam:this.offense,spot=kick?this.special.kickSpot:this.spot,yards=Math.min(5,spot/2),down=kick?(this.special.seriesDown??this.down):this.down,target=kick?(this.special.seriesTarget??this.target):this.target,extra=this.special?.type==='extra';
  this.box[team].penalties++;this.box[team].penaltyYards+=yards;if(team===(this.humanTeam??0)){this.stats.penalties++;this.stats.penaltyYards+=yards;}
  if(extra)this.beginGoal('extra',team,spot-yards);else if(this.tryAttempt)this.beginTwoPoint(team,spot-yards);else this.beginDrive(team,spot-yards,down,target,this.ballX);this.playClock=25;
  this.emit('result','DELAY OF GAME',`${yards} yards · same down · 25 seconds to get set`);return true;
 }
 resumeHalftime(){if(this.phase!=='halftime'||this.paused)return false;this.beginKick('kickoff',0,35);return true;}
 kick(type){
  if(!['call','ready'].includes(this.phase)||this.paused||this.tryAttempt)return false;
  if(type==='punt'){if(this.down!==4||this.collegeOvertime)return false;this.beginKick('punt',this.offense,this.spot);return true;}
  if(type!=='fieldgoal'||117-this.spot>65)return false;
  this.beginGoal('fieldgoal',this.offense,this.spot);return true;
 }
 tickExchange(dt){
  const e=this.pitch;if(!e)return false;e.elapsed+=dt;
  const qb=this.players[0],runner=this.players[e.runner??1];
  // The designed exchange gets a brief animation; player steering resumes on receipt.
  this.move(runner,e.xTarget-runner.x,this.spot+e.yTarget-runner.y,runner.speed,dt);
  if(e.elapsed>=e.release&&!e.released){e.released=true;e.sx=qb.x;e.sy=qb.y;}
  if(e.released){const u=clamp((e.elapsed-e.release)/e.flight,0,1);e.x=e.sx+(runner.x-e.sx)*u;e.y=e.sy+(runner.y-e.sy)*u;}
  if(e.elapsed>=e.release+e.flight){this.carrier=runner;this.pitch=null;this.handoffTime=this.liveTime;this.burstLeft=0;this.burstCooldown=0;this.emit('handoff',e.flight>.1?'TOSS!':'HANDOFF',runner.name);return false;}
  return true;
 }
 tickPlayAction(dt){
  const a=this.playAction;if(!a||this.isReturn||this.receivedPass||this.passed)return false;
  if(!this.fakeActive){if(!a.complete){a.complete=true;this.emit('handoff','PLAY-ACTION','QB keeps it · find your receiver');}return false;}
  const qb=this.players[0],rb=this.players[1],meeting=this.liveTime<.45;
  this.move(rb,(meeting?qb.x:a.lane)-rb.x,(meeting?qb.y:this.spot+1)-rb.y,rb.speed,dt);
  return true;
 }
 beginGoal(type,team,spot){
  const seriesTarget=this.target,seriesDown=this.down;if(type==='extra')this.ballX=26.5;
  this.special=null;this.offense=team;this.spot=spot;this.target=100;this.pending=null;this.pendingFinal=false;
  this.setFormation();this.resetPlay();
  const kicker=this.teams[team].specialists?.kicker||this.teams[team].roster.find(p=>p.pos==='K')||this.teams[team].offense[0];
  this.players[0]=animate(kicker,0,this.fieldX(26.5),spot-7);this.carrier=this.players[0];
  this.players.forEach((p,i)=>{if(i){p.x=this.fieldX([26.5,26.5,20,23,30,33,36,17,39,14,42][i]);p.y=spot+(i===1?-6:0);}});
  this.defenders.forEach((p,i)=>{p.x=this.fieldX([20,23,26.5,30,33,37,16,13,40,10,43][i]);p.y=spot+(i<5?1.8:5);});
  this.playClock=25;this.special={type,goal:true,seriesTarget,seriesDown,kickingTeam:team,kickSpot:spot,distance:117-spot,power:0,accuracy:0,meterTime:0,aim:0,ball:null,cpuTime:0};
  this.phase='kick_ready';this.cameraY=(spot-7+110)/2-8;this.emit('special',type==='extra'?'EXTRA POINT':'FIELD GOAL',this.userKicking?'Start · set power · stop the accuracy slider in green.':'Opponent preparing to kick.');
 }
 launchGoal(power,accuracy){
  const s=this.special,kicker=this.players[0];s.power=clamp(power,0,1);s.accuracy=clamp(accuracy,0,1);
  s.result=goalResult(kicker,s.distance,s.power,s.accuracy,kickConditions(this));
  s.ball={x:kicker.x,y:kicker.y,sx:kicker.x,sy:kicker.y,tx:26.5+s.result.offset/(s.result.window.halfWidth)*3.1,ty:Math.min(110,kicker.y+s.result.travel),elapsed:0,duration:1.5};
  this.phase='kick_flight';this.emit('kick','KICK IS UP');
 }
 tickGoal(dt){
  const s=this.special;
  if(!this.userKicking&&this.phase!=='kick_flight'){
   s.cpuTime+=dt;if(s.cpuTime>1.3){const w=goalWindow(this.players[0],s.distance,kickConditions(this)),noise=this.offenseAI.qbNoise||1;this.launchGoal(clamp(w.minPower+.07+(this.rng()-.5)*.18,.35,1),clamp(w.center+(this.rng()-.5)*(.30+noise*.04),0,1));}return;
  }
  if(this.phase==='kick_charge'||this.phase==='kick_accuracy'){s.meterTime+=dt;const u=(s.meterTime/(this.phase==='kick_accuracy'?1.05:1.35))%2;s[this.phase==='kick_accuracy'?'accuracy':'power']=u<=1?u:2-u;return;}
  if(this.phase!=='kick_flight')return;
  const b=s.ball;b.elapsed+=dt;const u=clamp(b.elapsed/b.duration,0,1);b.x=b.sx+(b.tx-b.sx)*u;b.y=b.sy+(b.ty-b.sy)*u;
  if(s.type!=='extra'&&this.quarter<=4)this.clock=Math.max(0,this.clock-dt);
  if(u<1)return;
  const {good,reason}=s.result;s.ball=null;
  recordGoal(this,good);
  if(s.type==='extra'){if(good)this.scores[s.kickingTeam]++;this.phase='dead';this.deadTimer=2;this.pending={kickoff:s.kickingTeam,kickSpot:35};this.publishResult(good?'EXTRA POINT GOOD':'EXTRA POINT MISSED',good?'One point · kickoff next':reason+' · kickoff next');}
  else this.finish(good?'fieldgoal':'miss',this.spot,reason);
 }

 // All special-team coordinates face upfield for the receiving team, so returns
 // keep the same thumb direction as ordinary offense. Kicks travel downscreen.
 beginKick(type,kickingTeam,kickSpot){
  this.ballX=26.5;this.tryAttempt=null;this.tryChoiceTeam=null;
  const seriesTarget=this.target,seriesDown=this.down;
  this.unitOffense=null;this.defenseUnit=null;
  this.offense=1-kickingTeam;this.spot=type==='punt'?20:25;this.target=this.spot+10;this.down=1;this.pending=null;
  this.resetPlay();this.special={type,kickingTeam,kickSpot,seriesTarget,seriesDown,aim:0,power:0,meterTime:0,ball:null,fair:false,looseTime:0,returnPlan:'middle',kickStyle:'deep'};
  const receive=availableTeam(this,this.offense),kicking=availableTeam(this,kickingTeam),returnUnit=specialUnit(receive,type),kickUnit=specialUnit(kicking,type);
  this.players=(this.format===11?fillSpecial(receive,returnUnit.receiving):returnUnit.receiving).map((p,i)=>animate(p,i,[20,26.5,7,46,34,16,39,10,23,30,43][i],[27,12,24,24,28,34,34,40,44,44,40][i]));
  this.playClock=25;this.defenders=(this.format===11?fillSpecial(kicking,kickUnit.coverage):kickUnit.coverage).map((p,i)=>animate(p,i,[4,49,12,20,33,41,26.5,8,16,37,45][i],i===6?100-kickSpot+(type==='punt'?7:0):type==='punt'?100-kickSpot:45));
  this.carrier=this.players[1];this.carrier.y=clamp(this.kickTarget(.7,0).y,3,90);
  const shift=this.carrier.y-12;for(const p of this.players){if(p!==this.carrier)p.y=clamp(p.y+shift,5,95);}
  if(type==='kickoff'){
   // The hands team starts ten yards from the kick line. The deep returner stays back.
   const front=this.players.filter(p=>p.slot>=(this.format===11?5:3));
   front.forEach((p,i)=>{p.x=5+(43*i/Math.max(1,front.length-1));p.y=100-kickSpot-11;});
  }
  this.selected=0;this.phase='kick_ready';this.cameraY=clamp((this.defenders[6].y+this.carrier.y)/2-8,13,85);
  this.emit('special',type==='punt'?'PUNT TEAM':'KICKOFF',this.userKicking?'Aim with the stick. Start the meter, then tap to kick.':'Get ready to return. Follow the landing ring.');
 }
 chooseReturnPlan(id){if(this.paused||this.phase!=='kick_ready'||this.special?.goal||!this.userOffense||!Object.hasOwn(RETURN_PLANS,id))return false;this.special.returnPlan=id;return true;}
 chooseKickStyle(style){
  if(this.paused||!this.userKicking||this.phase!=='kick_ready'||this.special?.type!=='kickoff'||!['deep','squib','onside'].includes(style))return false;
  this.special.kickStyle=style;
  return true;
 }
 get canKneel(){
  return this.isReturn&&this.special?.type==='kickoff'&&this.offense!==this.special.kickingTeam&&this.special.catchY<=0
   &&!this.special.leftEndZone&&this.carrier.y<=0;
 }
 takeKnee(){
  if(this.paused||!this.canKneel)return false;
  this.endKick('TOUCHBACK',this.rules.kickoffTouchback);
  return true;
 }
 kickAction(){
  if(this.paused||!this.special)return false;
  if(this.special.goal){if(!this.userKicking)return false;if(this.phase==='kick_ready'){this.special.weatherWind=windFor(this,this.special.kickingTeam);this.phase='kick_charge';this.special.meterTime=0;}else if(this.phase==='kick_charge'){this.phase='kick_accuracy';this.special.meterTime=0;this.special.accuracy=0;}else if(this.phase==='kick_accuracy')this.launchGoal(this.special.power,this.special.accuracy);else return false;return true;}
  if(this.phase==='kick_ready'){
   if(this.userKicking){this.special.weatherWind=windFor(this,this.special.kickingTeam);this.phase='kick_charge';this.special.meterTime=0;this.special.power=0;}
   else {
    if(this.special.type==='kickoff'){
     const margin=this.scores[this.special.kickingTeam]-this.scores[this.offense];
     const gamble=this.quarter>=4 && margin<0 && margin>=-16 && this.clock<this.quarterSeconds*.6;
     const chance=this.rng();
     this.special.kickStyle=chance<(gamble?.76:.022)?'onside':chance<(gamble?.82:.15)?'squib':'deep';
    }
    this.launchKick(.62+this.rng()*.23,(this.rng()-.5)*1.25);
   }
   return true;
  }
  if(this.phase==='kick_charge'&&this.userKicking){this.launchKick(this.special.power,this.special.aim);return true;}
  return false;
 }
 kickTarget(power=this.special?.power??.7,aim=this.special?.aim??0){
  const s=this.special;if(!s)return null;
  const kicker=this.defenders[6],factor=.9+(kicker.kickPower||85)/850;
  const wind=s.weatherWind?{x:-s.weatherWind.x,y:-s.weatherWind.y}:windFor(this),e=effects(this.weather),flight=(s.type==='punt'?2.8+power:3.2+power*.8)+((kicker.hangTime||83)-83)*.015;
  if(s.type==='kickoff'&&s.kickStyle==='onside')return {x:26.5+aim*19,y:100-s.kickSpot-(5+power*5)*factor};
  if(s.type==='kickoff'&&s.kickStyle==='squib')return {x:26.5+aim*25+wind.x*.08,y:100-s.kickSpot-(19+power*23)*factor*e.range};
  const yards=(s.type==='punt'?24+power*31:38+power*40)*factor*e.range;
  return {x:26.5+aim*(29+(82-(kicker.kickAccuracy||82))*.12)+wind.x*.03*flight*flight,y:100-s.kickSpot-yards+wind.y*.22*(flight/3)};
 }
 launchKick(power,aim){
  beginHealthPlay(this);const s=this.special;s.power=clamp(power,0,1);s.aim=clamp(aim,-1,1);const target=this.kickTarget(s.power,s.aim),kicker=this.defenders[6];
  s.ball={x:kicker.x,y:kicker.y,sx:kicker.x,sy:kicker.y,tx:target.x,ty:target.y,elapsed:0,duration:(s.type==='punt'?2.8+s.power:3.2+s.power*.8)+( (kicker.hangTime||83)-83)*.015};
  if(s.type==='kickoff'&&s.kickStyle!=='deep'){
   s.ball.duration=s.kickStyle==='onside'?.75:1.55;
   // Give the player control of the nearest receiver in his actual stance.
   this.carrier=this.players.reduce((best,p)=>distance(p,target)<distance(best,target)?p:best,this.carrier);
   if(s.kickStyle==='onside'){
    for(const d of this.defenders)d.y=100-s.kickSpot;
    s.readDelay=.55+(100-(this.carrier.recognition||75))*.009;
    s.hopSide=(this.rng()<.5?-1:1)*(3+s.power*5);
   }
  }
  recordKickLaunch(this);this.phase='kick_flight';
  this.emit('kick',s.type==='punt'?'PUNT AWAY':s.kickStyle==='onside'?'SURPRISE ONSIDE':s.kickStyle==='squib'?'SQUIB KICK':'KICK IS UP');
 }
 get canFairCatch(){return !this.paused&&this.userOffense&&this.phase==='kick_flight'&&!this.special?.goal&&(this.special?.type==='punt'||this.rules.kickoffFairCatch25&&this.special?.type==='kickoff'&&this.special.kickStyle==='deep');}
 fairCatch(){if(!this.canFairCatch)return false;this.special.fair=true;this.emit('special','FAIR CATCH',this.special.type==='kickoff'?'Catch it cleanly inside the 25 to start at the 25.':'Steer under the ball to complete the fair catch.');return true;}
 tickKick(dt,input){
  const s=this.special;
  if(s.goal){this.tickGoal(dt);return;}
  if(['kick_ready','kick_charge'].includes(this.phase)){
   if(this.userKicking)s.aim=clamp(s.aim+input.x*dt*.85,-1,1);
   if(this.phase==='kick_charge'){s.meterTime+=dt;const cycle=(s.meterTime/1.35)%2;s.power=cycle<=1?cycle:2-cycle;}
   return;
  }
  const b=s.ball,target={x:clamp(b.tx,1,52),y:clamp(b.ty,-9,99)},returner=this.carrier;
  if(this.userOffense)this.move(returner,input.x,input.y,returner.speed,dt);
  else if(s.kickStyle!=='onside'||b.elapsed+s.looseTime>=s.readDelay)this.move(returner,target.x-returner.x,target.y-returner.y,returner.speed*1.12,dt);
  for(const d of this.defenders){
   if(!this.userOffense&&d===this.controlled)this.move(d,input.x,input.y,d.speed,dt);
   else if(b.elapsed>.25||s.kickStyle==='onside'||this.phase==='kick_loose'){const lane=this.phase==='kick_loose'||s.kickStyle==='onside'?target:coverageLane(d,target,b.elapsed);this.move(d,lane.x-d.x,lane.y-d.y,d.speed*(d.slot<2?1:.96),dt);}
  }
  for(const p of this.players){if(p===returner)continue;const d=this.defenders.filter(d=>d.stun<=0).sort((a,b)=>distance(a,p)-distance(b,p))[0];if(d)this.move(p,d.x-p.x,clamp(returner.y+7-p.y,-1,1),p.speed*.5,dt);}
  if(this.phase==='kick_flight'){
   b.elapsed+=dt;const u=clamp(b.elapsed/b.duration,0,1);b.x=b.sx+(b.tx-b.sx)*u;b.y=b.sy+(b.ty-b.sy)*u;
   if(u>=1){
    if(b.tx<=.4||b.tx>=52.9){
     const edge=b.tx<=.4?.4:52.9;
     const crossY=b.sy+(b.ty-b.sy)*(edge-b.sx)/(b.tx-b.sx);
     if(s.type==='kickoff'&&crossY<=0)this.endKick('TOUCHBACK',25);
     else this.endKick('OUT OF BOUNDS',s.type==='kickoff'?40:clamp(b.ty,1,99));
     return;
    }
    const collegeGround=s.type==='kickoff'&&this.rules.kickoffGroundTouchback&&b.ty<=0&&(b.ty<=-10||distance(returner,b)>2.15+((returner.catching||80)-75)*.015);
    if(b.ty<=(s.type==='punt'?0:-10)||collegeGround){this.endKick('TOUCHBACK',s.type==='punt'?this.rules.puntTouchback:this.rules.kickoffTouchback);return;}
    this.phase='kick_loose';s.looseTime=0;
   }
  }
  if(this.phase==='kick_loose'){
   const onside=s.kickStyle==='onside';
   const reach=(onside?1.35:2.15)+((returner.catching||80)-75)*.015;
   // The kicker drives an onside kick into the turf first. The resulting hop
   // stays beyond a fielder's reach until it descends.
   const reachable=!onside||s.looseTime>=.60;
   const receiverDistance=distance(returner,b);
   const coverDistance=Math.min(...this.defenders.map(d=>distance(d,b)));
   const canRecover=s.type==='punt'||100-s.kickSpot-b.y>=10;
   if(reachable&&receiverDistance<=reach && (!canRecover||receiverDistance<=coverDistance||coverDistance>1.75)){
    if(s.fair){const clean=s.looseTime===0,spot=s.type==='kickoff'&&clean&&this.rules.kickoffFairCatch25?Math.max(25,b.y):Math.max(1,b.y);this.endKick(clean?'FAIR CATCH':'FAIR-CATCH SIGNAL · BALL DEAD',spot);return;}
    resetContact(this);this.phase='return';s.catchY=b.y;s.leftEndZone=b.y>0;
    this.returnInfo={type:s.type,catchY:b.y};this.spot=b.y;this.target=Math.min(100,b.y+10);
    s.ball=null;this.liveTime=0;this.passed=true;
    if(!this.userOffense&&this.canKneel&&b.y< -2){this.takeKnee();return;}
    this.emit('special',this.userOffense?'RETURN IT!':'MAKE THE STOP',this.canKneel?'Run out or take a knee for the 25.':'Run upfield ↑');
   }else if(reachable&&canRecover&&coverDistance<=1.75){
    if(s.type==='punt')this.endKick('PUNT DOWNED',b.y);
    else if(b.y<=0){
     recordKickEnd(this,0,'COVERAGE TD',s.kickingTeam);this.scores[s.kickingTeam]+=6;
     this.phase='dead';this.deadTimer=2.2;s.ball=null;this.pending={extraPoint:s.kickingTeam};
     this.lastResult='TOUCHDOWN! Kick recovered in the end zone.';
     this.emit('result','TOUCHDOWN!',this.lastResult,{scoreTeam:s.kickingTeam,scorePoints:6});
    }else this.endKick('KICK RECOVERED',100-b.y,s.kickingTeam);
    return;
   }else{
    s.looseTime+=dt;
    const speed=s.kickStyle==='onside'?Math.max(1.4,5-s.looseTime):s.kickStyle==='squib'?Math.max(2,9-s.looseTime):s.type==='kickoff'?Math.max(3.2,8-s.looseTime):1.9;
    const lateral=onside&&s.looseTime<.85?(s.hopSide||0):0;
    b.y-=dt*speed;b.x+=dt*((s.aim||0)*speed*.35+lateral);b.tx=b.x;b.ty=b.y;
    if(b.y<=(s.type==='punt'||this.rules.kickoffGroundTouchback?0:-10)){this.endKick('TOUCHBACK',s.type==='punt'?this.rules.puntTouchback:this.rules.kickoffTouchback);return;}
    if(b.x<=.4||b.x>=52.9){
     if(b.y<=0)this.endKick('TOUCHBACK',25);else this.endKick('OUT OF BOUNDS',s.type==='kickoff'?40:b.y);
     return;
    }
   }
  }
  this.cameraY+=(clamp(s.ball?(s.ball.y+returner.y)/2-8:returner.y+16,13,93)-this.cameraY)*Math.min(1,dt*4);
 }
 endKick(title,spot,offense=this.offense){
  recordKickEnd(this,clamp(Math.round(spot),1,99),title,offense);
  this.phase='dead';this.deadTimer=2.2;this.special.ball=null;this.pending={offense,spot:clamp(Math.round(spot),1,99),newSeries:true};
  this.lastResult=`${title} — ${this.teams[offense].abbr} ball at ${Math.round(spot)}`;this.emit('result',title,`${this.teams[offense].abbr} ball · ${Math.round(spot)<50?'own':'opponent'} ${Math.round(spot)<50?Math.round(spot):100-Math.round(spot)}`);
 }
}
