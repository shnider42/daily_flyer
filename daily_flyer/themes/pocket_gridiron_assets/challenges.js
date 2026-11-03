import {Game,clamp,distance} from './engine.js?v=22';
import {CLASSICS} from './history.js?v=22';
export const DRILLS=[
 {id:'passing',name:'Passing lab',icon:'A →',simple:'Snap, let a receiver get open, then tap A, B or C.',moderate:'Read the coverage and lead the receiver with the stick as you throw.',expert:'Progression: 5 / 10 / 15-yard completions. Placement and separation matter.',goals:[5,10,15]},
 {id:'running',name:'Running lanes',icon:'↑ ↑',simple:'Follow your blockers. Use BURST when you see a gap.',moderate:'Press the lane, cut behind the block, and protect the ball through contact.',expert:'Progression: 5 / 10 / 20 yards. Gain is measured from the line of scrimmage.',goals:[5,10,20]},
 {id:'fieldgoal',name:'Between the posts',icon:'⅃ ⅂',simple:'Tap START, SET POWER in green, then KICK in the green center.',moderate:'Distance changes the required power. Lock power first, then time accuracy.',expert:'Progression: 25 / 40 / 55 yards. Your selected kicker sets the meter windows.',goals:[25,40,55]},
 {id:'punting',name:'Coffin corner',icon:'↗',simple:'Aim with the stick. Stop the meter to kick. Keep the ball out of the end zone.',moderate:'Land near the goal line, then cover the return. A touchback misses the target.',expert:'Progression: pin inside the 20 / 15 / 10. From midfield; net field position decides.',goals:[20,15,10]}
];
export function guideText(item,guidance='moderate'){return item[guidance]||item.moderate;}
export function saveProgress(progress,key,result){
 const old=progress?.[key]||{};return {...progress,[key]:{attempts:Math.max(0,Number(old.attempts)||0)+1,stars:Math.max(Number(old.stars)||0,result.stars),best:Math.max(Number(old.best)||0,result.value||0)}};
}
export class ChallengeGame extends Game{
 constructor(home,away,config,rng=Math.random){
  super(home,away,config.difficulty||'rookie',rng,{format:config.format||7,length:'showcase',playClock:false,tvTimeouts:false});
  this.challenge={...config,level:clamp(Number(config.level)||0,0,2)};this.practice=config.mode==='training';this.elapsed=0;this.events=[];this.pendingFinal=false;
  const item=this.practice?DRILLS.find(d=>d.id===config.id):CLASSICS.find(d=>d.id===config.id);if(!item)throw Error('Unknown challenge');this.item=item;
  this.goal=this.practice?item.goals[this.challenge.level]:null;
  this.beginDrive(0,this.practice?(config.id==='punting'?50:30):item.spot,this.practice?1:item.down,this.practice?40:item.target);this.events=[];
  if(this.practice){this.clock=120;if(config.id==='fieldgoal')this.beginGoal('fieldgoal',0,117-this.goal);else if(config.id==='punting')this.beginKick('punt',0,50);else this.choose(config.id==='running'?'dive':'slants');}
  else{
   this.quarter=4;this.clock=item.clock;this.scores=[...item.score];this.publishedScores=[...item.score];
   if(config.id==='catch'){
    this.scenarioPlay={id:'catch',name:'Sprint right • Clark',kind:'pass',group:'quick',formationId:'singleback',routes:[[[36,0],[38,5],[43,10]],[[46,0],[49,3]],[[36,0],[25,5]]],wait:2};
    this.phase='ready';this.setFormation();this.players[2].x=36;this.defenders[4].x=39;this.defenders[4].y=99;
   }else this.setupMoment(config.id);
  }
 }
 get playDefinition(){return this.scenarioPlay||super.playDefinition;}
 setupMoment(id){
  this.phase='moment_ready';this.moment={id,stage:'intro',t:0,quality:0};
  const name=id==='immaculate'?'Franco Harris':id==='roller'?'Pete Banaszak':'Julian Edelman';
  let p=this.players.find(p=>p.name===name);if(!p){const raw=this.teams[0].roster.find(p=>p.name===name);p={...this.players[1],...raw,speed:7.3,slot:1};this.players[1]=p;}
  this.carrier=p;this.moment.actor=p;this.passed=true;
  const at=id==='immaculate'?{x:14,y:57}:id==='roller'?{x:28,y:85}:{x:25,y:58};
  Object.assign(p,at);if(id==='immaculate'){const raw=this.teams[0].roster.find(p=>p.name==='John Fuqua');this.players[4]={...this.players[4],...raw,speed:7.2,x:18,y:65,slot:4};}this.cameraY=id==='roller'?90:60;
  for(const d of this.defenders){d.y=id==='roller'?80:50;d.x=5+d.slot*6;}
  const names=id==='immaculate'?['Jack Tatum']:id==='roller'?['Woodrow Lowe']:['Robert Alford','Ricardo Allen','Keanu Neal'];
  this.moment.witnesses=names.map((name,i)=>{let d=this.defenders.find(p=>p.name===name);if(!d){const raw=this.teams[1].roster.find(p=>p.name===name);d={...this.defenders[i],...raw,speed:7.2,slot:i};this.defenders[i]=d;}Object.assign(d,{x:at.x+4+i*2,y:id==='immaculate'?65:at.y+4-i});return d;});
 }
 startMoment(){if(this.paused||this.phase!=='moment_ready')return false;this.phase='moment';this.moment.t=0;this.emit('snap','');return true;}
 momentAction(){
  if(this.paused)return false;if(this.phase==='moment_ready')return this.startMoment();
  if(this.phase!=='moment'||this.moment.stage==='intro')return false;
  const m=this.moment,b=this.momentBall,reach=this.challenge.guidance==='simple'?4:3;
  if(!b||distance(this.carrier,b)>reach){this.emit('ball','GET CLOSER','Move toward the gold ring, then try.');return true;}
  m.quality=Math.max(m.quality,1-distance(this.carrier,b)/reach);
  if(m.id==='roller'&&m.stage==='bump'){
   m.stage='dive';m.t=0;const p=this.players.find(p=>p.name==='Dave Casper');this.carrier=p;Object.assign(p,{x:32,y:96});this.emit('handoff','NOW CASPER','Chase it into the end zone, then DIVE.');return true;
  }
  if(m.id==='roller'){this.scores[0]+=6;this.momentBall=null;this.complete(true,'Casper recovers in the end zone. The extra point won the original game.',14);return true;}
  if(m.id==='edelman'){this.box[0].attempts=1;this.box[0].completions=1;this.box[0].passYards=23;this.momentBall=null;this.complete(true,'23 yards. Drive alive. The tying touchdown still came later.',23);return true;}
  Object.assign(this.carrier,{x:b.x,y:b.y});this.momentBall=null;m.stage='run';this.phase='live';this.receivedPass=true;this.passed=true;this.liveTime=0;this.crossed=true;this.scrambleRecovery=true;
  this.box[0].attempts=1;this.box[0].completions=1;this.target=100;this.emit('catch','HARRIS HAS IT!','Run upfield. Finish the play.');return true;
 }
 tickMoment(dt,input){
  const m=this.moment;m.t+=dt;for(const p of [this.carrier,...m.witnesses])p.phase+=dt*8;this.clock=Math.max(0,this.clock-dt);this.move(this.carrier,input.x,input.y,this.carrier.speed,dt);
  if(m.stage==='intro'){
   const duration=1.8,u=clamp(m.t/duration,0,1),end=m.id==='roller'?{x:28,y:87}:m.id==='immaculate'?{x:18,y:65}:{x:26,y:60};
   this.momentBall={x:26.5+(end.x-26.5)*u,y:this.item.spot-4+(end.y-this.item.spot+4)*u,arc:Math.sin(u*Math.PI)*18};
   if(u===1){m.stage=m.id==='roller'?'bump':'scoop';m.t=0;this.emit('ball',m.id==='roller'?'LOOSE BALL!':'DEFLECTED!','Follow the gold ring.');}return;
  }
  const window={simple:3.2,moderate:2.2,expert:1.5}[this.challenge.guidance]||2.2;
  if(m.id==='roller'){
   this.momentBall=m.stage==='bump'?{x:28,y:87,arc:2}:{x:32,y:101,arc:Math.abs(Math.sin(m.t*9))*3};
  }else this.momentBall={x:m.id==='immaculate'?14:26,y:m.id==='immaculate'?59:59,arc:Math.max(0,12*(1-m.t/window))};
  if(m.t>window)this.complete(false,m.id==='roller'?'The defense reaches the loose ball. Try the recovery sequence again.':'The ball reaches the grass. Move to the ring and tap sooner.',0);
 }
 tick(dt,input={x:0,y:0}){
  if(this.paused||this.result)return;dt=clamp(dt,0,.05);
  if(this.phase==='moment_ready')return;
  if(!['ready','call','kick_ready'].includes(this.phase))this.elapsed+=dt;
  if(this.phase==='moment'){this.time+=dt;this.tickMoment(dt,input);return;}
  super.tick(dt,input);
  if(this.phase==='penalty')this.resolvePenalty(false);
  if(this.phase==='dead'){
   if(this.practice){
    const id=this.challenge.id,value=id==='punting'?100-(this.pending?.spot??100):id==='fieldgoal'?this.goal:Math.round(this.carrier.y-30);
    const success=id==='fieldgoal'?!!this.special?.settled?.good:id==='punting'?this.pending?.offense===1&&this.pending.spot>0&&this.pending.spot<this.goal&&this.special?.settled?.reason!=='TOUCHBACK':this.offense===0&&!this.loose&&(id==='running'?this.box[0].fumblesLost===0:this.receivedPass&&this.box[0].interceptions===0)&&value>=this.goal;
    const feedback=id==='fieldgoal'?(success?'Straight through the posts.':this.special?.result?.reason||'Try the green windows.'):id==='punting'?`Opponent starts at its ${Math.round(this.pending?.spot??0)}. Target: inside the ${this.goal}.`:`${Math.max(0,value)} yards. Target: ${this.goal}.${id==='passing'&&!this.receivedPass?' Complete the pass first.':''}`;
    this.complete(success,feedback,success?value:0);
   }else this.complete(this.offense===0&&this.scores[0]>this.item.score[0]&&this.carrier.name===this.item.hero,this.scores[0]>this.item.score[0]?'A moment for the scrapbook.':'One play, another chance. Reset and try again.',Math.max(0,100-this.item.spot));
  }
  if(!this.result&&this.elapsed>45)this.complete(false,'Reset for another repetition. The goal is one good play.',0);
 }
 complete(success,detail,value){
  if(this.result)return;const stars=success?1+(this.elapsed<20?1:0)+(this.moment?this.moment.quality>=.65:this.practice?this.elapsed<12:true):0;
  this.result={success,detail,value,stars};this.paused=true;this.emit('challenge',success?'MOMENT MADE':'RUN IT AGAIN',detail);
 }
}
