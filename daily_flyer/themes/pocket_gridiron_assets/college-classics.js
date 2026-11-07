import {Game,clamp,distance} from './engine.js?v=33';
import {ChallengeGame} from './challenges.js?v=33';
import {collegeClassicTeam,COLLEGE_CLASSIC_TEAMS} from './college-classic-teams.js?v=33';
import {athleticSpeed} from './conditioning.js?v=33';
import {routeFor} from './plays.js?v=33';
import {clearBlocks} from './blocking.js?v=33';
import {resetContact} from './contact.js?v=33';
export {collegeClassicTeam,COLLEGE_CLASSIC_TEAMS};

// The scoreboard, principals and defining action follow the original games.
// Flight / handoff checkpoints are deliberately slowed for arcade control.
export const COLLEGE_CLASSICS=[
 {id:'college-flutie',name:'Hail Flutie',date:'November 23, 1984',home:'CC_BC84',away:'CC_MIA84',venue:'Orange Bowl stadium · Miami',
  venueInfo:{name:'Orange Bowl stadium',city:'Miami, Florida',climate:'florida',roof:'open'},score:[41,45],spot:52,down:2,target:62,clock:6,hero:'Gerard Phelan',
  situation:'Q4 · 0:06 · BC 41–45 Miami · 2nd & 10 at Miami 48',goalText:'Release the Hail Mary before time expires. Find Gerard Phelan for the winning touchdown.',
  story:'Doug Flutie escaped the rush and found Gerard Phelan with a 48-yard touchdown as time expired. Boston College won 47–45. This was a regular-season game at the Orange Bowl stadium, not the Orange Bowl bowl game.',
  simple:'Snap, move Flutie right, then throw A to Phelan when the clock shows 2 or 1. Let go of the movement keys for the straight throw.',
  moderate:'Six seconds at the Miami 48. Roll right to buy time. Wait for Phelan (A) to run deep, release before zero, and let the high pass arrive beyond the defenders.',
  expert:'2nd & 10 · Flood Tip. A is Phelan beyond the goal line; B and C draw coverage short. The special high-arc throw needs about three seconds of flight. Early throws can land out of reach.',
  source:'https://bceagles.com/news/2014/11/13/Recalling_The_Play_That_Made_History',
  sources:['https://bceagles.com/news/2014/11/13/Recalling_The_Play_That_Made_History','https://bceagles.com/news/1999/10/20/Forever_And_Ever_The_Pass']},
 {id:'college-kicksix',name:'Kick Six',date:'November 30, 2013',home:'CC_AUB13',away:'CC_BAMA13',venue:'Jordan–Hare Stadium',
  venueInfo:{name:'Jordan–Hare Stadium',city:'Auburn, Alabama',climate:'southeast',roof:'open'},score:[28,28],spot:38,down:1,target:48,clock:1,hero:'Chris Davis',
  situation:'Q4 · 0:01 · Tied 28–28 · Alabama attempts 57 yards',goalText:'Catch the short field goal as Chris Davis, then run it all the way back for Auburn.',starSeconds:26,starNote:'Three stars: complete the return, finish within 26 seconds, and make a clean catch.',
  story:'After one second was restored, Adam Griffith tried a 57-yard field goal from Auburn’s 38. Chris Davis caught it nine yards deep and ran up the left sideline for a 34–28 Auburn win. The official return was 100 yards; he covered 109 including the end zone.',
  simple:'Start the moment. Move Davis to the gold ring. When CATCH appears, tap it or press Space. Run to the left sideline, then upfield. Save your burst for a gap.',
  moderate:'Field the short kick at the back of the end zone. Time CATCH at the gold ring, find the left-side blocks, then keep running. The catch alone does not win it.',
  expert:'57-yard missed field goal · Chris Davis #11. Catch inbounds, bend left behind the return wall, then hug the sideline. Repeated bursts drain the stamina needed for this long return. No extra point follows the winner.',
  source:'https://auburntigers.com/news/2013/11/30/auburn-beats-bama-in-an-iron-bowl-for-the-ages',
  sources:['https://auburntigers.com/news/2013/11/30/auburn-beats-bama-in-an-iron-bowl-for-the-ages','https://auburntigers.com/news/2023/11/21/the-kick-six-10-years-later-a-great-moment-for-auburn','https://ua_ftp.sidearmsports.com/custompages/sports/m-footbl/stats/2013-2014/uafb12.html']},
 {id:'college-statue',name:'Statue of Liberty',date:'January 1, 2007',home:'CC_BSU06',away:'CC_OU06',venue:'Fiesta Bowl · University of Phoenix Stadium',
  venueInfo:{name:'University of Phoenix Stadium · Fiesta Bowl',city:'Glendale, Arizona',climate:'desert',roof:'fixed'},score:[41,42],spot:97,down:1,target:100,clock:0,quarter:5,hero:'Ian Johnson',
  situation:'Overtime · Boise State 41–42 Oklahoma · Two-point try from the 3',goalText:'Sell the fake right, take the hidden handoff with Ian Johnson, then reach the end zone for two points.',
  story:'Boise State’s hook-and-lateral had forced overtime. After Vinny Perretta’s touchdown pass to Derek Schouman, Jared Zabransky faked right and handed behind his back to Ian Johnson for the winning two points: 43–42. This neutral-site Fiesta Bowl uses green turf; Boise’s home field is blue.',
  simple:'Snap. Tap PUMP RIGHT when prompted. Move Johnson to the gold ring behind Zabransky and tap TAKE HANDOFF. Run left, then up into the end zone.',
  moderate:'Show the quick screen to three receivers on the right. Time the pump, move Ian Johnson to the hidden ball, then take the handoff and follow Ryan Clady around the left edge.',
  expert:'OT · two-point attempt at the Oklahoma 3. The left-hash Statue Left starts with Zabransky’s pump. Complete the handoff behind his back, then steer Johnson past the edge block. The conversion is worth two, not six.',
  source:'https://www.fiestasportsfoundation.org/sports/vrbofb/roster/36th-annual-game--2007/67',
  sources:['https://www.fiestasportsfoundation.org/sports/vrbofb/roster/36th-annual-game--2007/67','https://broncosports.com/news/2026/10/1/in-their-words-the-2007-fiesta-bowl']}
];
const actor=(p,slot,x,y)=>({...p,slot,x,y,speed:athleticSpeed(p.speed),stun:0,groundTime:0,phase:0,pace:1,energy:100,carrySeconds:0,nextRead:0,readTarget:{x,y},reactionJitter:0});
const isFlutie=g=>g.challenge?.id==='college-flutie';
const isKickSix=g=>g.challenge?.id==='college-kicksix';
const isStatue=g=>g.challenge?.id==='college-statue';

export class CollegeChallengeGame extends ChallengeGame{
 constructor(home,away,config,rng=Math.random){
  const item=COLLEGE_CLASSICS.find(c=>c.id===config.id);if(!item)throw Error('Unknown college classic');
  super(home,away,{...config,mode:'college',format:11,ruleset:'college',item,customSetup:true,weather:config.weather||'clear'},rng);
  this.quarter=item.quarter||4;this.clock=item.clock;this.events=[];this.pending=null;this.special=null;this.pendingFinal=false;
  this.moment={id:item.id,stage:'intro',t:0,quality:0};
  if(isFlutie(this))this.setupFlutie();else if(isKickSix(this))this.setupKickSix();else this.setupStatue();
 }
 get playDefinition(){return this.scenarioPlay||super.playDefinition;}
 get momentLabel(){
  if(this.phase==='moment_ready')return isStatue(this)?'SNAP THE STATUE':'START THE MOMENT';
  if(this.phase!=='moment')return '';
  if(isKickSix(this))return this.moment.stage==='catch'?'CATCH THE KICK':'TRACK THE KICK';
  return this.moment.stage==='fake'?(this.moment.t<.35?'SELL THE SCREEN':'PUMP RIGHT'):'TAKE HANDOFF';
 }
 get challengeCue(){
  const m=this.moment;
  if(isFlutie(this))return this.phase==='ready'?'Snap. Roll Flutie right; A is Gerard Phelan.':this.pass?'The ball is live after zero. Phelan is tracking it.':this.receivedPass?'Phelan has it. Finish in the end zone!':this.clock>2.4?'Buy time to the right. Let Phelan run deep.':`THROW A NOW · ${Math.ceil(this.clock)} SECOND${Math.ceil(this.clock)===1?'':'S'}`;
  if(isKickSix(this))return this.phase==='moment_ready'?'One second. A short field goal can be returned.':m.stage==='flight'?'Move Davis to the gold ring. Wait for CATCH.':m.stage==='catch'?'CATCH NOW · tap the action button or press Space.':'Davis has it! Bend to the left sideline, then stay inbounds. Save your burst.';
  return this.phase==='moment_ready'?'Trips right. Snap, pump right, then hide the ball.':m.stage==='fake'?(m.t<.35?'Zabransky shows the screen.':'PUMP RIGHT · tap the action button or press Space.'):m.stage==='handoff'?'Move Johnson to the ring behind the QB. TAKE HANDOFF with Space.':'Johnson has it! Run left behind Clady, then up across the goal line.';
 }
 makeActor(team,name,slot,x,y){const p=this.teams[team].roster.find(p=>p.name===name);if(!p)throw Error(`Missing ${name} in college moment`);return actor(p,slot,x,y);}
 setupFlutie(){
  this.scenarioPlay={id:'college-flutie',name:'Flood Tip · Hail Mary',kind:'pass',group:'deep',formationId:'proset',routes:[[[35,-.5],[42,50]],[[44,-1.5],[39,43]],[[30,-4],[35,43]]],wait:4.5};
  this.play='college-flutie';this.defense='prevent';this.ballX=26.5;this.setFormation();this.phase='ready';
  const set=(i,x,y)=>{Object.assign(this.players[i],{x,y,routeStart:{x,y:y-this.spot},pace:1});};
  this.players[1]=this.makeActor(0,'Steve Strachan',1,29,48);
  this.players[4]=this.makeActor(0,'Troy Stradford',4,30,48);
  this.players[10]=this.makeActor(0,'Scott Gieselman',10,18,51.5);
  set(2,35,51.5);set(3,44,50.5);set(4,30,48);
  this.carrier=this.players[0];this.cameraY=64;this.moment.stage='dropback';
  this.defenders.filter(d=>d.pos==='DL').forEach(d=>{d.speed*=.92;});
 }
 setupKickSix(){
  this.scenarioPlay={id:'college-kicksix',name:'Missed field goal return',kind:'run',lane:8,carrier:1};this.play='college-kicksix';
  const blockers=['Dee Ford','Robenson Therezie','Cassanova McKinzy','Kris Frost','Jonathon Mincy','Jermaine Whitehead','Gabe Wright','Angelo Blackson','LaDarius Owens','Ryan Smith'];
  this.players=[this.makeActor(0,blockers[0],0,20,16),this.makeActor(0,'Chris Davis',1,26.5,-7.4),...blockers.slice(1).map((name,i)=>this.makeActor(0,name,i+2,10+(i%5)*5,18+Math.floor(i/5)*9))];
  const kicking=['Cyrus Kouandjio','Arie Kouandjio','Ryan Kelly','Anthony Steen','Austin Shepherd','Brandon Greene','Brian Vogler','Jalston Fowler','Cole Mazza','Cody Mandell','Adam Griffith'];
  this.defenders=kicking.map((name,i)=>this.makeActor(1,name,i,18+(i%6)*4.5,31+Math.floor(i/6)*8));
  // This checkpoint begins after the kick has cleared the line. Auburn's
  // return wall is set; the two tight-end/backfield coverage players are on
  // the far side of it. Running into the middle still exposes Davis to tackles.
  for(const p of this.players)if(p!==this.players[1])p.runBlock=Math.max(p.runBlock||70,94);
  for(const d of this.defenders)if(['Brian Vogler','Jalston Fowler'].includes(d.name)){d.x=45;d.y=38;}
  this.carrier=this.players[1];this.resetPlay();this.selected=0;this.spot=38;this.target=100;this.phase='moment_ready';this.cameraY=13;
  this.moment.stage='flight';this.moment.target={x:24,y:-8.8};this.moment.actor=this.carrier;this.momentBall={...this.moment.target,arc:38};
  this.returnInfo={type:'missedfieldgoal',catchY:-8.8};this.leftReturnEndZone=false;
 }
 setupStatue(){
  this.scenarioPlay={id:'college-statue',name:'Statue Left · two-point try',kind:'run',lane:7,blockLane:10,carrier:1,formationId:'bunch',pull:{slot:5,x:10,y:0,until:2},lead:{slot:10,x:9,until:2}};
  this.play='college-statue';this.defense='man';this.ballX=20;this.setFormation();this.phase='moment_ready';this.cameraY=96;
  const alignment=[['Jared Zabransky',20,94],['Ian Johnson',22,91.5],['Drisan James',37,96.5],['Jerard Rabb',44,95.5],['Legedu Naanee',49,95.5],['Ryan Clady',14,96.5],['Tad Miller',17,96.5],['Jadon Dailey',20,96.5],['Pete Cavender',23,96.5],['Jeff Cavender',26,96.5],['Derek Schouman',11,96.5]];
  this.players=alignment.map(([name,x,y],i)=>this.makeActor(0,name,i,x,y));this.carrier=this.players[0];this.resetPlay();
  const positions=[[14,98],[24,98],[18,101],[29,101],[37,99],[46,99],[36,104],[19,98],[28,98],[26,103],[46,105]];
  this.defenders.forEach((d,i)=>Object.assign(d,{x:positions[i][0],y:positions[i][1],readTarget:{x:positions[i][0],y:positions[i][1]}}));
  this.moment.stage='fake';this.moment.actor=this.carrier;this.conversion={attempts:0,good:false};
 }
 // The Hail Mary has a deliberately high, fixed destination. A neutral throw
 // still needs the receiver to reach it; early / badly aimed throws can fail.
 throwTo(index,input={x:0,y:0}){
  if(!isFlutie(this))return false;
  if(!this.canPass||this.paused||this.clock<=0||this.contact)return false;
  if(index!==0)return super.throwTo(index,input);
  const qb=this.carrier,target=this.players[2],x=clamp(Number(input.x)||0,-1,1),y=clamp(Number(input.y)||0,-1,1);
  this.pass={x:qb.x,y:qb.y,sx:qb.x,sy:qb.y,tx:42+x*5,ty:102+y*3,target,aim:{x,y,amount:Math.min(1,Math.hypot(x,y))},adjustAt:.15,elapsed:0,duration:3,checked:[],tipped:false};
  this.passed=true;this.box[0].attempts++;this.stats.attempts++;this.moment.stage='air';this.moment.quality=clamp(1-Math.abs(this.liveTime-5)/2,0,1);
  for(const d of this.defenders)d.ballSeenAt=this.liveTime+1.8;
  this.emit('throw','','',{flight:3});return true;
 }
 route(p,time=this.liveTime){return this.scenarioPlay?.routes?routeFor(this.scenarioPlay,p,time,this.spot):super.route(p,time);}
 tickPass(dt){
  const b=this.pass;
  if(!isFlutie(this)||!b||b.tipped||b.duration!==3){super.tickPass(dt);return;}
  // This ball is high above the underneath defenders. The ordinary pass model
  // assumes a much flatter flight; only the final descent is catchable here.
  const checked=b.checked;if((b.elapsed+dt)/b.duration<.97)b.checked=this.defenders.map(d=>d.slot);
  super.tickPass(dt);if(this.pass===b&&(b.elapsed/b.duration)<.97)b.checked=checked;
 }
 coverageTarget(d){
  if(isFlutie(this)&&d.pos==='DL'&&this.liveTime<1.1&&!this.passed)return {x:d.x,y:this.spot+1};
  if(isFlutie(this)&&d.pos==='DB'&&(!this.pass||this.pass.elapsed<2.65)&&!this.receivedPass)return {x:d.slot===4?36:d.slot===5?43:39,y:96};
  return super.coverageTarget(d);
 }
 startMoment(){
  if(this.paused||this.phase!=='moment_ready')return false;
  this.phase='moment';this.moment.t=0;this.emit('snap','');
  if(isStatue(this)){this.recordPlay();this.box[0].plays++;this.conversion.attempts=1;}
  return true;
 }
 momentAction(){
  if(this.paused||this.result)return false;if(this.phase==='moment_ready')return this.startMoment();if(this.phase!=='moment')return false;
  const m=this.moment,simple=this.challenge.guidance==='simple',expert=this.challenge.guidance==='expert';
  if(isKickSix(this)){
   if(m.stage!=='catch')return false;
   const reach=simple?3.1:expert?1.8:2.5,gap=distance(this.carrier,m.target);
   if(gap>reach){this.emit('ball','GET UNDER IT','Move Davis to the gold ring.');return true;}
   m.quality=clamp(1-gap/reach,0,1);m.stage='run';this.momentBall=null;Object.assign(this.carrier,{x:m.target.x,y:m.target.y});
   this.phase='return';this.spot=0;this.target=100;this.liveTime=0;this.passed=true;this.crossed=true;resetContact(this);clearBlocks(this);
   this.emit('catch','DAVIS HAS IT!','Find the left sideline, then run upfield.');return true;
  }
  if(!isStatue(this))return false;
  if(m.stage==='fake'){
   if(m.t<.35)return false;
   m.quality=clamp(1-Math.abs(m.t-.9)/1.1,0,1);m.stage='handoff';m.t=0;this.carrier=this.players[1];
   this.momentBall={x:this.players[0].x-.7,y:this.players[0].y-.5,arc:0};
   this.emit('handoff','THE BALL IS BEHIND HIM','Move Johnson to the ring, then TAKE HANDOFF.');return true;
  }
  if(m.stage==='handoff'){
   const reach=simple?2.7:expert?1.7:2.1,gap=distance(this.carrier,this.momentBall);
   if(gap>reach){this.emit('ball','REACH THE HANDOFF','Move Johnson behind Zabransky to the gold ring.');return true;}
   m.quality=Math.min(m.quality,clamp(1-gap/(reach*1.7),0,1));m.stage='run';this.handedOff=true;this.momentBall=null;
   this.phase='live';this.liveTime=0;this.passed=true;this.crossed=false;this.handoffTime=0;this.burstLeft=0;resetContact(this);clearBlocks(this);
   this.emit('handoff','JOHNSON HAS IT!','Left around Clady, then upfield for two.');return true;
  }
  return false;
 }
 tickMoment(dt,input){
  const m=this.moment;m.t+=dt;
  if(isKickSix(this)){
   this.clock=Math.max(0,this.clock-dt);this.move(this.carrier,input.x,input.y,this.carrier.speed,dt);
   if(m.stage==='flight'){
    this.momentBall={...m.target,arc:38*(1-clamp(m.t/2.8,0,1))+3};
    if(m.t>=2.8){m.stage='catch';m.t=0;this.emit('ball','SHORT! CATCH IT!','Davis · gold ring · tap CATCH.');}
   }else{
    this.momentBall={...m.target,arc:Math.max(0,4-m.t*3)};
    if(m.t>({simple:2.4,moderate:1.65,expert:1.05}[this.challenge.guidance]||1.65))this.complete(false,'The kick lands before Davis secures it. Get to the ring and catch when prompted.',0);
   }
   return;
  }
  if(!isStatue(this))return;
  if(m.stage==='handoff')this.move(this.carrier,input.x,input.y,this.carrier.speed,dt);
  const qb=this.players[0];qb.phase+=dt*5;
  for(const p of this.players.slice(2,5))this.move(p,51-p.x,Math.max(-.5,98-p.y),p.speed*.35,dt);
  // The quick-screen look pulls the coverage right; the runner still has to
  // execute the exchange and beat a real pursuing defense after the handoff.
  for(const d of this.defenders)this.move(d,Math.min(50,d.x+9)-d.x,99-d.y,d.speed*.35,dt);
  if(m.stage==='fake'&&m.t>({simple:2.6,moderate:2.0,expert:1.5}[this.challenge.guidance]||2))this.complete(false,'The fake took too long. Pump right while the screen look still holds the defense.',0);
  if(m.stage==='handoff'&&m.t>({simple:3.5,moderate:2.8,expert:2.1}[this.challenge.guidance]||2.8))this.complete(false,'The exchange window closed. Move Johnson behind Zabransky, then take the hidden handoff.',0);
 }
 creditYards(y,reason='return'){
  if(isKickSix(this)&&this.returnInfo){const catchY=this.returnInfo.catchY;this.returnInfo.catchY=0;super.creditYards(y,reason);this.returnInfo.catchY=catchY;return;}
  super.creditYards(y,reason);
 }
 finish(kind,y,reason=''){
  if(isStatue(this)&&this.isLive){
   const good=kind==='touchdown'&&this.offense===0&&this.handedOff&&this.carrier.name==='Ian Johnson';
   if(good)this.scores[0]+=2;this.conversion.good=good;this.phase='dead';this.deadTimer=2.2;this.pending=null;this.pass=null;this.pitch=null;
   this.publishResult(good?'TWO POINTS!':'TRY STOPPED',good?'Boise State 43–42 Oklahoma. Statue Left wins it.':reason||'Oklahoma keeps the lead.');
   this.complete(good,good?'Johnson follows the left edge for two. Boise State wins the Fiesta Bowl, 43–42.':'The two-point try is stopped. Sell the screen, take the handoff, then find the left edge.',good?2:0);return;
  }
  if(isKickSix(this)&&y<=0&&!this.leftReturnEndZone&&this.isLive){this.phase='dead';this.pending=null;this.complete(false,'Davis is down in the end zone. The missed kick is a touchback, and the game would go to overtime.',0);return;}
  super.finish(kind,y,reason);
 }
 publishResult(title,detail){
  if(this.challenge?.mode==='college'&&title==='TOUCHDOWN!'&&this.offense===0&&this.clock===0)detail=isKickSix(this)?'Auburn wins 34–28. No extra point is needed.':isFlutie(this)?'Boston College wins 47–45 as time expires.':detail;
  super.publishResult(title,detail);
 }
 tick(dt,input={x:0,y:0}){
  if(this.paused||this.result)return;dt=clamp(dt,0,.05);input={x:Number(input.x)||0,y:Number(input.y)||0};
  if(this.phase==='moment_ready')return;
  if(!['ready','call'].includes(this.phase))this.elapsed+=dt;
  if(this.phase==='moment'){this.time+=dt;this.tickMoment(dt,input);return;}
  if(isKickSix(this)&&this.isReturn){this.leftReturnEndZone||=this.carrier.y>0;this.liveTime=Math.min(this.liveTime,17);}
  Game.prototype.tick.call(this,dt,input);
  if(this.result)return;
  if(this.phase==='penalty')this.resolvePenalty(false);
  if(isFlutie(this)&&this.clock<=0&&!this.passed){this.complete(false,'Time expires before the throw. Roll right and release to Phelan while a second remains.',0);return;}
  if(this.isLoose&&isStatue(this)){this.complete(false,'The conversion is lost on the loose ball. Complete the exchange and protect it through the turn.',0);return;}
  if(this.phase==='dead'){
   const success=this.offense===0&&this.scores[0]===this.item.score[0]+6&&this.carrier.name===this.item.hero;
   this.complete(success,success?(isKickSix(this)?'Davis goes the distance. Auburn wins 34–28: 109 yards covered, 100 in the official return statistics.':'Flutie to Phelan as time expires. Boston College wins 47–45 at the Orange Bowl stadium.'):'The defining play is stopped. Reset the moment and try another route through it.',success?(isKickSix(this)?100:48):0);return;
  }
  if(this.elapsed>45)this.complete(false,'The moment is over. Reset to try the sequence again.',0);
 }
 complete(success,detail,value){
  if(this.result)return;
  super.complete(success,detail,value);if(success)this.result.stars=1+(this.elapsed<(this.item.starSeconds||20)?1:0)+(this.moment.quality>=.65?1:0);
  this.pending=null;this.pendingFinal=false;this.momentBall=null;this.pass=null;this.pitch=null;
 }
}
