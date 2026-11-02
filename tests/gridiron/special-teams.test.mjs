import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Game,PLAYS,DEFENSE,distance} from '../../daily_flyer/themes/pocket_gridiron_assets/engine.js';
import {buildTeam} from '../../daily_flyer/themes/pocket_gridiron_assets/roster.js';
const data=JSON.parse(fs.readFileSync(new URL('../../daily_flyer/themes/pocket_gridiron_assets/rosters.json',import.meta.url)));
const make=()=>new Game(buildTeam('NE',data),buildTeam('BUF',data),'pro',()=>.5);
function until(g,predicate,input={x:0,y:0},limit=500){let n=0;while(!predicate(g)&&n++<limit)g.tick(.05,input);assert.ok(predicate(g),`stalled in ${g.phase}`);}
function flight(g,type='punt',kicking=1,spot=40,power=.7,aim=0){g.beginKick(type,kicking,spot);g.launchKick(power,aim);}

test('ten offensive plays and nine defensive calls all produce playable formations',()=>{
 const g=make();assert.equal(PLAYS.length,10);assert.equal(DEFENSE.length,9);
 for(const p of PLAYS){g.beginDrive(0,25);g.choose(p.id);g.snap(g.offense);assert.equal(g.phase,'live');assert.equal(g.carrier.slot,p.kind==='run'&&p.id!=='draw'?1:0);assert.equal(g.canPass,p.kind==='pass');for(let i=0;i<10;i++)g.tick(.05);}
 for(const d of DEFENSE){g.beginDrive(1,25);g.choose(d.id);g.snap(g.offense);assert.equal(g.defense,d.id);for(let i=0;i<10;i++)g.tick(.05);assert.ok(g.defenders.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));}
});
test('curl receivers come back, flood spreads three depths, counter pulls a guard left',()=>{
 const g=make();g.beginDrive(0,25);g.choose('curls');const wr=g.players[2];assert.ok(g.route(wr,1.5).y>g.route(wr,4).y);assert.equal(g.route(wr,4).y,33);
 g.choose('flood');const routes=g.players.slice(2,5).map(p=>g.route(p,5));assert.ok(routes[1].y>routes[0].y&&routes[0].y>routes[2].y);assert.ok(routes.every(p=>p.x>=40));
 g.choose('counter');const guardX=g.players[6].x;g.snap(g.offense);for(let i=0;i<15;i++)g.tick(.05);assert.ok(g.players[6].x<guardX-2);assert.equal(g.canPass,false);
});
test('Cover 2, Cover 3 and Run Commit use different coverage responsibilities',()=>{
 const g=make();g.beginDrive(1,25);g.choose('cover2');assert.equal(g.coverageTarget(g.defenders[5]).x,13);assert.equal(g.coverageTarget(g.defenders[6]).x,40);
 g.choose('cover3');const deep=g.defenders.slice(4).map(d=>g.coverageTarget(d));assert.deepEqual(deep.map(p=>p.x),[8,45,26.5]);assert.ok(deep.every(p=>p.y>=48));
 g.choose('commit');assert.equal(g.coverageTarget(g.defenders[2]),g.carrier);assert.equal(g.coverageTarget(g.defenders[3]),g.carrier);
});
test('opening kickoff is live special teams; power and aim determine landing',()=>{
 const g=make();assert.equal(g.phase,'kick_ready');assert.equal(g.special.type,'kickoff');assert.equal(g.offense,0);
 g.beginKick('punt',0,40);const short=g.kickTarget(.2,0),long=g.kickTarget(.9,0),left=g.kickTarget(.7,-.65),right=g.kickTarget(.7,.65);assert.ok(long.y<short.y);assert.ok(left.x<right.x);
 assert.equal(g.defenders[6].pos,'P');g.kickAction();assert.equal(g.phase,'kick_charge');until(g,g=>g.special.power>.65);const power=g.special.power;g.kickAction();assert.equal(g.phase,'kick_flight');assert.equal(g.special.power,power);assert.equal(g.kickAction(),false);
});
test('kick meter and ball flight pause without charging or moving',()=>{
 const g=make();g.beginKick('kickoff',0,35);g.kickAction();g.tick(.05,{x:1,y:0});const before=structuredClone(g.special);g.paused=true;g.tick(.05,{x:1,y:0});assert.deepEqual(g.special,before);assert.equal(g.kickAction(),false);
 g.paused=false;g.kickAction();g.paused=true;const ball=structuredClone(g.special.ball);g.tick(.05);assert.deepEqual(g.special.ball,ball);
});
test('receiving a punt supports fair catch and starts a fresh first down at the catch',()=>{
 const g=make();flight(g);assert.equal(g.fairCatch(),true);assert.equal(g.throwTo(0),false);until(g,g=>g.phase==='dead');assert.match(g.lastResult,/FAIR CATCH/);assert.equal(g.pending.offense,0);assert.ok(Math.abs(g.pending.spot-14)<=1);g.next();assert.equal(g.down,1);assert.equal(g.target,g.spot+10);assert.equal(g.special,null);
});
test('punt can be caught and returned with burst, then possession is retained at the return spot',()=>{
 const g=make();flight(g);until(g,g=>g.phase==='return');assert.equal(g.offense,0);assert.equal(g.canPass,false);g.burst();assert.ok(g.burstLeft>0);const start=g.special.catchY;g.carrier.y=start+14;g.finish('tackle',g.carrier.y);assert.equal(g.pending.offense,0);assert.equal(g.pending.newSeries,true);assert.equal(g.stats.returnYards,14);assert.equal(g.stats.yards,0);g.next();assert.equal(g.down,1);assert.equal(g.phase,'call');
});
test('a return touchdown scores for the receiver and queues a kickoff by that team',()=>{
 const g=make();flight(g);until(g,g=>g.phase==='return');g.carrier.y=101;g.tick(.016);assert.equal(g.scores[0],7);assert.equal(g.pending.kickoff,0);g.next();assert.equal(g.special.type,'kickoff');assert.equal(g.special.kickingTeam,0);assert.equal(g.offense,1);
});
test('kickoff and punt touchbacks use their documented arcade spots',()=>{
 for(const [type,spot,power,expected] of [['kickoff',35,1,25],['punt',70,.9,20]]){const g=make();flight(g,type,1,spot,power);until(g,g=>g.phase==='dead');assert.match(g.lastResult,/TOUCHBACK/);assert.equal(g.pending.spot,expected);assert.equal(g.pending.offense,0);}
});
test('directional punts go out at the landing spot; kickoff out of bounds awards the 40',()=>{
 for(const type of ['punt','kickoff']){const g=make();flight(g,type,1,type==='punt'?40:35,.6,1);until(g,g=>g.phase==='dead');assert.match(g.lastResult,/OUT OF BOUNDS/);assert.equal(g.pending.spot,type==='kickoff'?40:17);}
});
test('missed punts roll and can be downed by coverage without changing possession twice',()=>{
 const g=make();flight(g,'punt',1,40,.7,.6);g.carrier.x=1;g.carrier.y=95;for(const d of g.defenders){d.x=1;d.y=95;}
 until(g,g=>g.phase==='kick_loose',{x:-1,y:1});const ball=g.special.ball;g.defenders[0].x=ball.x;g.defenders[0].y=ball.y;g.tick(.05,{x:-1,y:1});assert.equal(g.phase,'dead');assert.match(g.lastResult,/PUNT DOWNED/);assert.equal(g.pending.offense,0);g.next();assert.equal(g.offense,0);assert.equal(g.down,1);
});
test('a loose kickoff may be recovered by the kicking team at the mirrored spot',()=>{
 const g=make();flight(g,'kickoff',1,35,.6,.5);g.carrier.x=1;g.carrier.y=95;for(const d of g.defenders){d.x=1;d.y=95;}
 until(g,g=>g.phase==='kick_loose',{x:-1,y:1});const y=g.special.ball.y;g.defenders[0].x=g.special.ball.x;g.defenders[0].y=y;g.tick(.05,{x:-1,y:1});assert.match(g.lastResult,/KICK RECOVERED/);assert.equal(g.pending.offense,1);assert.ok(Math.abs(g.pending.spot-(100-y))<1);
});
test('CPU punts on fourth down; humans cannot punt on earlier downs',()=>{
 const g=make();g.beginDrive(0,25);assert.equal(g.kick('punt'),false);g.down=4;assert.equal(g.kick('punt'),true);assert.equal(g.special.kickingTeam,0);assert.equal(g.offense,1);
 g.beginDrive(1,35,4,45);assert.equal(g.phase,'kick_ready');assert.equal(g.special.type,'punt');assert.equal(g.special.kickingTeam,1);
});
test('halftime, field goals and safety free kicks preserve the correct receiving team',()=>{
 const g=make();g.beginDrive(0,65,4);g.kick('fieldgoal');g.next();assert.equal(g.special.kickingTeam,0);
 g.beginDrive(0,25);g.choose('dive');g.snap(g.offense);g.finish('tackle',-1);g.next();assert.equal(g.special.kickingTeam,0);assert.equal(g.special.kickSpot,20);
 g.beginDrive(1,25);g.quarter=2;g.clock=0;g.choose('zone');g.snap(g.offense);g.finish('tackle',29);g.next();assert.equal(g.quarter,3);assert.equal(g.special.kickingTeam,0);assert.equal(g.offense,1);
});
test('the final whistle prevents a needless kickoff after a winning score',()=>{
 const g=make();g.beginDrive(0,90);g.quarter=4;g.clock=0;g.choose('dive');g.snap(g.offense);g.finish('touchdown',100);g.next();assert.equal(g.phase,'final');
});
test('complete games across different play selections and random seeds never stall',()=>{
 for(const difficulty of ['rookie','pro','legend'])for(let seed=1;seed<=12;seed++){
  let state=seed;const rng=()=>{state=(state*1664525+1013904223)>>>0;return state/4294967296;};
  const g=new Game(buildTeam('NE',data),buildTeam('BUF',data),difficulty,rng);let ticks=0;
  while(g.phase!=='final'&&ticks++<26000){
   if(g.phase==='penalty')g.resolvePenalty(true);if(g.phase==='call')g.choose(g.userOffense?PLAYS[Math.floor(rng()*PLAYS.length)].id:DEFENSE[Math.floor(rng()*DEFENSE.length)].id);
   if(g.phase==='ready'&&g.userOffense)g.snap();if(g.phase==='kick_ready')g.kickAction();if(g.phase==='kick_charge'&&g.special.power>.72)g.kickAction();
   if(g.canPass&&g.userOffense&&g.liveTime>1.1)g.throwTo(Math.floor(rng()*3));
   if(g.userOffense&&g.isLive)g.burst();
   g.tick(.05,g.phase.startsWith('kick_')?{x:0,y:0}:{x:Math.sin(ticks*.02),y:1});
   assert.ok(Number.isFinite(g.controlled.x)&&Number.isFinite(g.cameraY));assert.ok(g.down>=1&&g.down<=4);
  }
  assert.equal(g.phase,'final',`${difficulty} seed ${seed} stalled at ${g.phase}, q${g.quarter}`);
 }
});
