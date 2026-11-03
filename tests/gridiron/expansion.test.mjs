import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Game} from '../../daily_flyer/themes/pocket_gridiron_assets/engine.js';
import {TEAMS,buildTeam} from '../../daily_flyer/themes/pocket_gridiron_assets/roster.js';
import {CLASSICS,HISTORIC_TEAMS,historicTeam} from '../../daily_flyer/themes/pocket_gridiron_assets/history.js';
import {ChallengeGame,DRILLS,guideText,saveProgress} from '../../daily_flyer/themes/pocket_gridiron_assets/challenges.js';
import {crowdReaction,crowdBed} from '../../daily_flyer/themes/pocket_gridiron_assets/stadium-life.js';
import {replayFrame} from '../../daily_flyer/themes/pocket_gridiron_assets/replay.js';
import {seededRandom} from '../../daily_flyer/themes/pocket_gridiron_assets/rules.js';
const data=JSON.parse(fs.readFileSync(new URL('../../daily_flyer/themes/pocket_gridiron_assets/rosters.json',import.meta.url)));
const make=options=>new Game(buildTeam('NE',data),buildTeam('BUF',data),'pro',()=>.5,options);
const finite=g=>{for(const p of [...g.players,...g.defenders])assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y),`${p.name}: ${p.x},${p.y}`);};
test('all current and classic teams field 22 distinct roster athletes through scrimmage, goals and kickoffs',()=>{
 for(const t of [...TEAMS.map(t=>buildTeam(t.abbr,data)),...HISTORIC_TEAMS.map(t=>historicTeam(t.id))]){
  const g=new Game(t,buildTeam('BUF',data),'pro',()=>.5,{format:11});
  for(const phase of ['kickoff','drive','goal','punt']){
   if(phase==='drive')g.beginDrive(0,30);if(phase==='goal')g.beginGoal('fieldgoal',0,75);if(phase==='punt')g.beginKick('punt',0,40);
   assert.equal(g.players.length,11);assert.equal(g.defenders.length,11);assert.equal(new Set(g.players.map(p=>p.id)).size,11);assert.equal(new Set(g.defenders.map(p=>p.id)).size,11);finite(g);
  }
  g.beginDrive(1,30);assert.ok(g.defenders.every(p=>!['QB','K','P','WR'].includes(p.pos)));
 }
});
test('11-on-11 passes, runs, coverages, turnovers and replay frames remain finite',()=>{
 const g=make({format:11});
 for(const defense of g.defensePlays){g.beginDrive(0,30);g.choose('slants');g.defense=defense.id;g.setFormation();g.phase='ready';g.snap();for(let i=0;i<65&&g.isLive;i++){if(i===30)g.throwTo(0);g.tick(.05,{x:0,y:0});finite(g);}assert.equal(replayFrame(g,1).people.length,22);}
 g.beginDrive(0,30);g.choose('dive');g.snap();for(let i=0;i<60&&g.isLive;i++)g.tick(.05,{x:.3,y:1});finite(g);
 g.startTurnover(g.defenders[10],'interception');g.tick(.05);finite(g);assert.equal(g.players.length,11);
});
test('play clock cannot be refreshed by changing calls; delay repeats down with half-distance enforcement',()=>{
 const g=make({playClock:true});g.beginDrive(0,8,3,18);g.tick(.05);g.playClock=.1;g.choose('slants');g.choose('dive');assert.equal(g.playClock,.1);
 g.paused=true;g.tick(.05);assert.equal(g.playClock,.1);g.paused=false;g.tick(.05);g.tick(.05);assert.equal(g.spot,4);assert.equal(g.down,3);assert.equal(g.target,18);assert.equal(g.playClock,25);assert.equal(g.stats.penaltyYards,4);assert.equal(g.clock,g.quarterSeconds);
 const off=make({playClock:false});off.beginDrive(0,25);off.playClock=.01;off.tick(.05);assert.equal(off.spot,25);
});
test('TV break is skippable, clock-held, bounded and respects pause',()=>{
 const g=make({tvTimeouts:true});g.beginDrive(0,25,4,35);g.choose('dive');g.snap();g.finish('tackle',27);g.next();assert.equal(g.phase,'tv_timeout');const clock=g.clock;
 g.paused=true;assert.equal(g.resumeTV(),false);g.tick(.05);assert.equal(g.tvLeft,6);g.paused=false;g.tick(.05);assert.equal(g.clock,clock);assert.equal(g.resumeTV(),true);assert.equal(g.offense,1);assert.equal(g.phase,'call');assert.equal(g.tvQuarters.size,1);
});
test('historic rosters use the appropriate seasons, numbers and available Super Bowl players',()=>{
 assert.equal(HISTORIC_TEAMS.length,8);const ne=historicTeam('NE16');assert.equal(ne.season,2016);assert.equal(ne.offense[0].name,'Tom Brady');assert.equal(ne.roster.find(p=>p.name==='Joe Thuney').number,62);assert.ok(!ne.roster.some(p=>p.name==='Rob Gronkowski'));assert.equal(historicTeam('DAL81').specialists.punter.name,'Danny White');assert.equal(historicTeam('OAK72').roster.find(p=>p.name==='Jim Otto').number,'00');
 assert.deepEqual(CLASSICS.find(c=>c.id==='edelman').score,[20,28]);assert.equal(CLASSICS.find(c=>c.id==='catch').clock,58);
});
const challenge=(id,guidance='moderate')=>{const c=CLASSICS.find(c=>c.id===id);return new ChallengeGame(historicTeam(c.home),historicTeam(c.away),{mode:'campaign',id,guidance},()=>.5);};
const toCheckpoint=g=>{g.startMoment();for(let i=0;i<37;i++)g.tick(.05);};
test('Edelman catch requires movement/timing, can fail, and never awards a touchdown',()=>{
 const g=challenge('edelman');toCheckpoint(g);assert.equal(g.moment.stage,'scoop');assert.ok(g.momentBall);g.carrier.x=26;g.carrier.y=59;g.momentAction();assert.equal(g.result.success,true);assert.deepEqual(g.scores,[20,28]);assert.equal(g.box[0].passYards,23);
 const fail=challenge('edelman','expert');toCheckpoint(fail);for(let i=0;i<40;i++)fail.tick(.05);assert.equal(fail.result.success,false);
});
test('Immaculate Reception transfers to Harris for a live run; the scoop alone is not a win',()=>{
 const g=challenge('immaculate');toCheckpoint(g);g.carrier.x=14;g.carrier.y=59;g.momentAction();assert.equal(g.phase,'live');assert.equal(g.carrier.name,'Franco Harris');assert.equal(g.result,undefined);g.finish('touchdown',100);g.tick(.01);assert.equal(g.result.success,true);
});
test('Holy Roller uses two controlled recovery checkpoints without changing ordinary fumble rules',()=>{
 const g=challenge('roller','simple');toCheckpoint(g);g.carrier.x=28;g.carrier.y=87;g.momentAction();assert.equal(g.carrier.name,'Dave Casper');assert.equal(g.result,undefined);g.tick(.05);g.carrier.x=32;g.carrier.y=101;g.momentAction();assert.equal(g.result.success,true);assert.deepEqual(g.scores,[20,20]);
 const normal=make({});normal.beginDrive(0,30,4,40);normal.choose('dive');normal.snap();normal.startFumble(normal.defenders[0]);normal.players[2].y=40;normal.recoverFumble(normal.players[2]);assert.equal(normal.phase,'dead');assert.ok(normal.pending.spot>=70);
});
test('Catch uses Clark as A and a route to the end zone',()=>{const g=challenge('catch');assert.equal(g.players[2].name,'Dwight Clark');assert.equal(g.phase,'ready');assert.equal(g.spot,94);assert.equal(g.down,3);assert.equal(g.playDefinition.routes[0].at(-1)[1],10);g.snap();g.tick(.05);finite(g);});
test('twelve training stages use real mechanics and goals, with failure and repeat flow',()=>{
 for(const drill of DRILLS)for(let level=0;level<3;level++){
  const g=new ChallengeGame(buildTeam('NE',data),buildTeam('BUF',data),{mode:'training',id:drill.id,level},()=>.5);assert.equal(g.goal,drill.goals[level]);assert.equal(g.playClockEnabled,false);assert.equal(g.tvTimeouts,false);
  if(drill.id==='fieldgoal'){g.launchGoal(1,.5);for(let i=0;i<31;i++)g.tick(.05);assert.equal(g.result.success,true);}
  else if(drill.id==='passing'){g.snap();g.finish('incomplete',30);g.tick(.05);assert.equal(g.result.success,false);}
  else if(drill.id==='running'){g.snap();g.finish('tackle',30+g.goal);g.carrier.y=30+g.goal;g.tick(.05);assert.equal(g.result.success,true);}
  else {assert.equal(g.special.type,'punt');assert.equal(g.special.kickingTeam,0);}
 }
});
test('guidance explains every activity at all three levels and saved progress keeps best stars',()=>{
 for(const item of [...DRILLS,...CLASSICS])for(const level of ['simple','moderate','expert'])assert.ok(guideText(item,level).length>20);
 const a=saveProgress({},'catch',{stars:3,value:6}),b=saveProgress(a,'catch',{stars:0,value:0});assert.equal(b.catch.stars,3);assert.equal(b.catch.attempts,2);assert.equal(a.catch.attempts,1);
});
test('crowd reacts to home scores, away scores, turnovers, misses and third-down defense',()=>{
 assert.equal(crowdReaction({scorePoints:6,scoreTeam:0}).mood,'ROAR');assert.equal(crowdReaction({scorePoints:3,scoreTeam:1}).mood,'GROAN');assert.equal(crowdReaction({type:'turnover'}).mood,'GASP');assert.equal(crowdReaction({type:'result',text:'NO GOOD'}).mood,'GROAN');
 const g=make({});g.beginDrive(0,25);const quiet=crowdBed(g);g.beginDrive(1,25,3);assert.ok(crowdBed(g)>quiet);
});
test('full-team formations have five linemen, seven on the line and no overlapping starters',()=>{
 const g=make({format:11});g.beginDrive(0,30);
 for(const call of g.offensePlays){g.choose(call.id);assert.equal(g.players.filter(p=>p.pos==='OL').length,5);assert.equal(g.players.filter(p=>Math.abs(p.y-29.5)<.01).length,7);assert.equal(new Set(g.players.map(p=>`${p.x}:${p.y}`)).size,11);}
});
test('delay on a punt preserves fourth down and the line to gain; a delayed extra point stays a try',()=>{
 const g=make({playClock:true});g.beginDrive(0,40,4,45);g.kick('punt');g.playClock=.01;g.tick(.05);assert.equal(g.offense,0);assert.equal(g.down,4);assert.equal(g.spot,35);assert.equal(g.target,45);
 g.beginGoal('extra',0,85);g.playClock=.01;g.tick(.05);assert.equal(g.special.type,'extra');assert.equal(g.special.distance,37);
});
test('full-team matches reach final across current and historic rosters with TV breaks and clocks',()=>{
 for(const [home,away] of [[buildTeam('NE',data),buildTeam('BUF',data)],[historicTeam('SF81'),historicTeam('DAL81')],[historicTeam('OAK78'),historicTeam('SD78')]]){
  const g=new Game(home,away,'pro',seededRandom(72),{format:11,playClock:true,tvTimeouts:true});let ticks=0;
  while(g.phase!=='final'&&ticks++<30000){
   if(g.phase==='halftime')g.resumeHalftime();if(g.phase==='tv_timeout')g.resumeTV();if(g.phase==='penalty')g.resolvePenalty(true);
   if(g.phase==='call')g.choose(g.userOffense?'slants':'zone');if(g.phase==='ready'&&g.userOffense)g.snap();
   if(g.phase==='kick_ready')g.kickAction();if(g.phase==='kick_charge'&&g.special.power>.8)g.kickAction();if(g.phase==='kick_accuracy'&&g.special.accuracy>=.48)g.kickAction();
   if(g.canPass&&g.liveTime>1.5)g.throwTo(0);if(g.isLive)g.burst();g.tick(.05,g.phase.startsWith('kick_')?{x:0,y:0}:{x:Math.sin(ticks*.01)*.6,y:1});finite(g);
  }
  assert.equal(g.phase,'final',home.city);assert.ok(g.scores.every(Number.isFinite));
 }
});
