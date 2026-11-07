import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Game,PLAYS,DEFENSE} from '../../daily_flyer/themes/pocket_gridiron_assets/engine.js';
import {buildTeam} from '../../daily_flyer/themes/pocket_gridiron_assets/roster.js';
import {FOOTBALL_RULESETS,catchFootCount,seededRandom} from '../../daily_flyer/themes/pocket_gridiron_assets/rules.js';
import {kickOptions,suggestions} from '../../daily_flyer/themes/pocket_gridiron_assets/presentation.js';

const data=JSON.parse(fs.readFileSync(new URL('../../daily_flyer/themes/pocket_gridiron_assets/rosters.json',import.meta.url)));
const team=id=>({...buildTeam(id,data),profile:null});
const make=(ruleset='college',options={},rng=()=>.5)=>new Game(team('NE'),team('BUF'),'pro',rng,{format:11,ruleset,...options});
function snap(g,play='dive'){
 assert.equal(g.choose(g.userOffense?play:'zone'),true);assert.equal(g.snap(g.offense),true);
}
function until(g,predicate,limit=250){let n=0;while(!predicate(g)&&n++<limit)g.tick(.05);assert.ok(predicate(g),`stalled in ${g.phase}`);}
function finishPAT(g){
 if(g.phase==='try_choice')assert.equal(g.chooseTry('kick'),true);
 assert.equal(g.special?.type,'extra');g.launchGoal(1,.5);until(g,g=>g.phase==='dead');g.next();
}
function touchdown(g){snap(g);g.finish('touchdown',100);g.next();}
function convert(g,good){assert.ok(g.tryAttempt);snap(g);g.finish(good?'touchdown':'incomplete',good?100:g.spot);g.next();}
function staticPass(g,{x=.62,y=50,reach=0}={}){
 g.beginDrive(0,40);snap(g,'curls');for(const p of [...g.players,...g.defenders]){p.x=40;p.y=90;p.speed=0;}
 const receiver=g.players[2];receiver.x=x;receiver.y=y;
 g.pass={sx:x+reach,sy:y,tx:x+reach,ty:y,x:x+reach,y,elapsed:0,duration:.1,checked:[],tipped:false};g.tickPass(.1);return receiver;
}
function kickoff(g,y=12,{fair=true,caught=true}={}){
 g.beginKick('kickoff',1,35);g.launchKick(.65,0);const ball=g.special.ball;ball.tx=26.5;ball.ty=y;
 g.carrier.x=caught?26.5:1;g.carrier.y=caught?y:90;for(const d of g.defenders){d.x=50;d.y=90;d.speed=0;}
 if(fair)assert.equal(g.fairCatch(),true);return ball;
}

test('college rule selection is automatic only for two college teams, with an explicit override',()=>{
 const a={...team('NE'),college:true},b={...team('BUF'),college:true};
 assert.equal(new Game(a,b).ruleset,'college');assert.equal(new Game(a,team('BUF')).ruleset,'pro');assert.equal(new Game(a,b,'pro',()=>.5,{ruleset:'pro'}).ruleset,'pro');
 assert.equal(FOOTBALL_RULESETS.college.extraPointSpot,97);assert.equal(FOOTBALL_RULESETS.pro.extraPointSpot,85);
 assert.ok(Math.abs(FOOTBALL_RULESETS.college.hashMarksYards[1]-FOOTBALL_RULESETS.college.hashMarksYards[0]-40/3)<1e-10);
 assert.ok(Math.abs(FOOTBALL_RULESETS.pro.hashMarksYards[1]-FOOTBALL_RULESETS.pro.hashMarksYards[0]-18.5/3)<1e-10);
});

test('the same sideline and end-line reception needs one college foot or two pro feet',()=>{
 for(const y of [50,109.94]){
  const college=make(),pro=make('pro'),x=y>100?26.5:.62;
  const receiver=staticPass(college,{x,y});staticPass(pro,{x,y});assert.equal(catchFootCount(receiver),1);
  assert.equal(college.stats.completions,1);assert.equal(pro.stats.completions,0);assert.equal(pro.phase,'dead');
  assert.equal(college.scores[0],y>100?6:0);
 }
});

test('a diving college receiver is down without contact; an untouched pro receiver can get up',()=>{
 const college=make(),pro=make('pro');staticPass(college,{x:26.5,reach:1.9});const receiver=staticPass(pro,{x:26.5,reach:1.9});
 assert.equal(college.phase,'dead');assert.match(college.lastResult,/down without contact/);assert.equal(college.pending.spot,50);
 assert.equal(pro.phase,'live');assert.equal(receiver.grounded,true);const x=receiver.x;pro.tick(.05,{x:1,y:0});assert.equal(receiver.x,x);
 for(let i=0;i<11;i++)pro.tick(.05);assert.equal(receiver.grounded,false);assert.equal(pro.phase,'live');
});

test('college next-snap hashes change the formation, route origin, and field-goal launch position',()=>{
 const college=make(),pro=make('pro');
 for(const g of [college,pro]){g.beginDrive(0,25);snap(g);g.carrier.x=.4;g.finish('out',30);g.next();g.choose('slants');}
 assert.equal(college.ballX,20);assert.equal(college.players[0].x,20);assert.equal(pro.ballX,26.5);assert.equal(pro.players[0].x,26.5);
 assert.ok(college.route(college.players[4],1).x<pro.route(pro.players[4],1).x);
 college.beginDrive(0,90,1,100,53);assert.equal(college.ballX,160/3-20);college.kick('fieldgoal');assert.equal(college.players[0].x,160/3-20);
});

test('every 7- and 11-player call stays finite at both college hashes',()=>{
 for(const format of [7,11])for(const hash of [20,160/3-20]){
  const g=make('college',{format});
  for(const p of PLAYS){g.beginDrive(0,50,1,60,hash);assert.equal(g.choose(p.id),true);assert.ok(g.players.every(p=>p.x>=1&&p.x<=52));if(p.kind==='pass')for(const receiver of g.players.slice(2,5))for(const time of [0,1,4]){const r=g.route(receiver,time);assert.ok(Number.isFinite(r.x)&&Number.isFinite(r.y)&&r.x>=1&&r.x<=52,p.id);}}
  for(const p of DEFENSE){g.beginDrive(1,50,1,60,hash);assert.equal(g.choose(p.id),true);g.snap(1);for(const d of g.defenders){const r=g.coverageTarget(d);assert.ok(Number.isFinite(r.x)&&Number.isFinite(r.y),p.id);}}
 }
});

test('college offers a 20-yard PAT or a playable two-point try from the 3',()=>{
 const g=make();g.beginDrive(0,97);touchdown(g);assert.equal(g.phase,'try_choice');assert.equal(g.canChooseTry,true);
 g.paused=true;assert.equal(g.chooseTry('kick'),false);g.paused=false;assert.equal(g.chooseTry('kick'),true);assert.equal(g.special.distance,20);assert.equal(g.special.kickSpot,97);
 const pro=make('pro');pro.beginDrive(0,97);touchdown(pro);assert.equal(pro.special.distance,32);assert.equal(pro.special.kickSpot,85);
 const two=make();two.beginDrive(0,97);touchdown(two);assert.equal(two.chooseTry('two'),true);assert.equal(two.spot,97);assert.equal(two.target,100);assert.equal(two.down,1);
 const before=two.clock;snap(two);two.tick(.05);assert.equal(two.clock,before);two.finish('touchdown',100);assert.equal(two.scores[0],8);two.next();assert.equal(two.special.type,'kickoff');assert.equal(two.tryAttempt,null);
});

test('two-point tries cannot become kicks, first downs, or six-point defensive returns',()=>{
 const g=make();g.beginTwoPoint(0);assert.equal(g.kick('fieldgoal'),false);assert.deepEqual(kickOptions(g),[]);assert.ok(suggestions(g,g.humanPlays).every(p=>p.kind!=='kick'));
 snap(g);const d=g.defenders[4];d.y=90;g.startTurnover(d,'interception');d.y=100;g.finish('touchdown',100);
 assert.deepEqual(g.scores,[0,2]);g.next();assert.equal(g.special.kickingTeam,0);
 const failure=make();failure.beginTwoPoint(0);snap(failure);failure.finish('tackle',99.5);failure.next();assert.equal(failure.special.type,'kickoff');assert.deepEqual(failure.scores,[0,0]);
});

test('try penalties replay a single try and delay of game cannot turn it into a normal drive',()=>{
 const g=make('college',{playClock:true});g.beginTwoPoint(0);g.playClock=.01;g.tick(.05);assert.ok(g.tryAttempt);assert.equal(g.spot,92);assert.equal(g.target,100);assert.equal(g.playClock,25);
 snap(g);g.flag('offside',1,g.defenders[0]);g.finish('incomplete',g.spot);assert.equal(g.phase,'penalty');g.resolvePenalty(true);g.next();assert.ok(g.tryAttempt);assert.equal(g.spot,96);assert.equal(g.down,1);assert.equal(g.target,100);
});

test('a touchdown with no time remaining still permits the two points needed to tie',()=>{
 const g=make();g.beginDrive(0,97);g.quarter=4;g.clock=0;g.scores=[0,8];g.publishedScores=[0,8];touchdown(g);
 assert.equal(g.phase,'try_choice');g.chooseTry('two');convert(g,true);assert.deepEqual(g.scores,[8,8]);assert.ok(g.collegeOvertime);assert.equal(g.spot,75);assert.equal(g.clock,0);
});

test('college overtime gives both sides possessions, forces two in OT2 and alternates tries in OT3',()=>{
 const g=make();g.startCollegeOvertime(0);assert.equal(g.spot,75);assert.equal(g.target,85);assert.equal(g.quarter,5);assert.equal(g.clock,0);
 touchdown(g);assert.notEqual(g.phase,'final');finishPAT(g);assert.deepEqual(g.scores,[7,0]);assert.equal(g.offense,1);assert.equal(g.collegeOvertime.series,1);assert.equal(g.spot,75);
 touchdown(g);finishPAT(g);assert.deepEqual(g.scores,[7,7]);assert.equal(g.collegeOvertime.period,2);assert.equal(g.offense,1);assert.equal(g.quarter,6);
 touchdown(g);assert.ok(g.tryAttempt);assert.equal(g.tryRequiredTwo,true);assert.equal(g.chooseTry('kick'),false);convert(g,true);assert.equal(g.offense,0);
 touchdown(g);convert(g,true);assert.deepEqual(g.scores,[15,15]);assert.equal(g.collegeOvertime.period,3);assert.equal(g.offense,0);assert.equal(g.spot,97);assert.ok(g.tryAttempt);
 convert(g,true);assert.notEqual(g.phase,'final');assert.equal(g.offense,1);assert.equal(g.spot,97);convert(g,false);assert.equal(g.phase,'final');assert.deepEqual(g.scores,[17,15]);
});

test('an overtime field goal is not sudden death and a winning second-possession TD needs no try',()=>{
 const g=make();g.startCollegeOvertime(0);assert.equal(g.kick('fieldgoal'),true);g.launchGoal(1,.5);until(g,g=>g.phase==='dead');g.next();
 assert.equal(g.offense,1);assert.equal(g.spot,75);assert.deepEqual(g.scores,[3,0]);touchdown(g);assert.equal(g.phase,'final');assert.deepEqual(g.scores,[3,6]);
});

test('a college overtime turnover ends that series; a defensive TD or safety wins immediately',()=>{
 for(const outcome of ['stop','touchdown','safety']){
  const g=make();g.startCollegeOvertime(0);snap(g);
  if(outcome==='safety')g.finish('tackle',-1);
  else{const d=g.defenders[4];d.y=90;g.startTurnover(d,'interception');d.y=outcome==='touchdown'?100:22;g.finish(outcome==='touchdown'?'touchdown':'tackle',d.y);}
  g.next();if(outcome==='stop'){assert.equal(g.offense,1);assert.equal(g.spot,75);assert.equal(g.collegeOvertime.series,1);}else{assert.equal(g.phase,'final');assert.equal(g.scores[1],outcome==='touchdown'?6:2);}
 }
});

test('an interception-return safety awards the original OT offense two, then gives the defense its reply',()=>{
 const g=make();g.startCollegeOvertime(0);snap(g);const d=g.defenders[4];d.y=50;g.startTurnover(d,'interception');g.carrier.y=-1;g.finish('tackle',-1);
 assert.deepEqual(g.scores,[2,0]);assert.notEqual(g.pending.collegeGameOver,true);g.next();
 assert.equal(g.phase,'call');assert.equal(g.offense,1);assert.equal(g.spot,75);assert.equal(g.target,85);assert.equal(g.down,1);assert.equal(g.collegeOvertime.period,1);assert.equal(g.collegeOvertime.series,1);
});

test('accepting an overtime defensive foul erases its turnover before deciding whose series is next',()=>{
 const g=make();g.startCollegeOvertime(0);snap(g);g.flag('offside',1,g.defenders[0]);const d=g.defenders[4];d.y=90;g.startTurnover(d,'interception');g.finish('tackle',22);
 assert.equal(g.phase,'penalty');g.resolvePenalty(true);g.next();assert.equal(g.collegeOvertime.series,0);assert.equal(g.collegeOvertime.changedPossession,false);assert.equal(g.offense,0);assert.equal(g.spot,80);
});

test('college overtime suggestions explain a reply possession and never punt or recommend a losing FG',()=>{
 const g=make();g.startCollegeOvertime(0);let cards=suggestions(g,g.humanPlays);assert.match(cards.find(p=>p.kind==='kick').reason,/opponent still gets a possession/);
 g.down=4;assert.ok(kickOptions(g).every(p=>p.kickType!=='punt'));assert.equal(g.kick('punt'),false);
 g.collegeOvertime.series=1;g.scores=[0,7];assert.ok(suggestions(g,g.humanPlays).every(p=>p.kind!=='kick'));
 g.scores=[0,3];cards=suggestions(g,g.humanPlays);assert.match(cards.find(p=>p.kind==='kick').reason,/another overtime/);
});

test('college clean kickoff fair catches start at the 25, while farther catches and punts keep the spot',()=>{
 for(const y of [12,36]){const g=make();kickoff(g,y);until(g,g=>g.phase==='dead');assert.equal(g.pending.spot,Math.max(25,y));assert.match(g.lastResult,/FAIR CATCH/);}
 const punt=make();punt.beginKick('punt',1,40);punt.launchKick(.7,0);punt.special.ball.ty=12;punt.carrier.y=12;assert.equal(punt.fairCatch(),true);until(punt,g=>g.phase==='dead');assert.equal(punt.pending.spot,12);
 const pro=make('pro');kickoff(pro,12,{fair:false});assert.equal(pro.fairCatch(),false);
});

test('a muffed fair-catch signal cannot advance or claim the clean-catch 25-yard award',()=>{
 const g=make();const ball=kickoff(g,12,{caught:false});until(g,g=>g.phase==='kick_loose');assert.ok(g.special.looseTime>0);g.carrier.x=ball.x;g.carrier.y=ball.y;g.tick(.05);
 assert.equal(g.phase,'dead');assert.ok(g.pending.spot<25);assert.match(g.lastResult,/BALL DEAD/);
});

test('an untouched college kickoff on the end-zone turf is dead; an aerial catch may still be returned',()=>{
 const college=make(),pro=make('pro');kickoff(college,-2,{fair:false,caught:false});kickoff(pro,-2,{fair:false,caught:false});until(college,g=>g.phase==='dead');until(pro,g=>g.phase==='kick_loose');assert.equal(college.pending.spot,25);
 const caught=make();kickoff(caught,-2,{fair:false});until(caught,g=>g.phase==='return');assert.equal(caught.canKneel,true);assert.equal(caught.takeKnee(),true);assert.equal(caught.pending.spot,25);
});

test('college full games across seeds finish with legal downs, choices and overtime state',()=>{
 for(let seed=71;seed<77;seed++){
  const rng=seededRandom(seed),g=make('college',{length:'quick'},rng);let ticks=0;
  while(g.phase!=='final'&&ticks++<26000){
   if(g.phase==='halftime')g.resumeHalftime();if(g.phase==='penalty')g.resolvePenalty(true);
   if(g.phase==='try_choice')g.chooseTry('two');
   if(g.phase==='call')g.choose(g.userOffense?g.offensePlays[Math.floor(rng()*g.offensePlays.length)].id:'zone');
   if(g.phase==='ready'&&g.userOffense)g.snap();if(g.phase==='kick_ready')g.kickAction();if(g.phase==='kick_charge'&&g.special.power>.9)g.kickAction();if(g.phase==='kick_accuracy'&&g.special.accuracy>=.48)g.kickAction();
   if(g.canPass&&g.userOffense&&g.liveTime>1.1)g.throwTo(Math.floor(rng()*3));if(g.userOffense&&g.isLive)g.burst();
   g.tick(.05,g.phase.startsWith('kick_')?{x:0,y:0}:{x:Math.sin(ticks*.02),y:1});assert.ok(g.down>=1&&g.down<=4);assert.ok(Number.isFinite(g.controlled.x)&&Number.isFinite(g.cameraY));
  }
  assert.equal(g.phase,'final',`seed ${seed} stalled in ${g.phase}, OT ${g.collegeOvertime?.period}`);
 }
});
