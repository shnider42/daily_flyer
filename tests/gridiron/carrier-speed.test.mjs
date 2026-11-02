import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Game} from '../../daily_flyer/themes/pocket_gridiron_assets/engine.js';
import {buildTeam} from '../../daily_flyer/themes/pocket_gridiron_assets/roster.js';
import {seededRandom} from '../../daily_flyer/themes/pocket_gridiron_assets/rules.js';
const data=JSON.parse(fs.readFileSync(new URL('../../daily_flyer/themes/pocket_gridiron_assets/rosters.json',import.meta.url)));
const home=buildTeam('NE',data),away=buildTeam('BUF',data);
function make(offense=0,difficulty='pro'){const g=new Game(home,away,difficulty,seededRandom(71));g.beginDrive(offense,25);g.choose(offense===0?'slants':'zone');g.snap(offense);return g;}
function travel(g,p,speed=10){p.x=26;p.y=40;p.stun=0;g.move(p,0,1,speed,.1);return p.y-40;}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('possession slows either team by seven percent at every difficulty without editing ratings',()=>{
 for(const side of [0,1])for(const level of ['rookie','pro','legend']){
  const g=make(side,level),rating=g.carrier.speed;
  near(travel(g,g.carrier),.93);near(travel(g,g.defenders[4]),1);near(travel(g,g.players[5]),1);
  assert.equal(g.carrier.speed,rating);
 }
});
test('a throw releases the speed penalty and the receiver takes it only after the catch',()=>{
 const g=make(),qb=g.carrier,wr=g.players[2];g.throwTo(0);
 near(travel(g,qb),1);near(travel(g,wr),1);
 g.catchPass(wr);near(travel(g,qb),1);near(travel(g,wr),.93);
});
test('kick returners run freely to the landing point and slow only after securing the kick',()=>{
 for(const type of ['kickoff','punt'])for(const side of [0,1]){
  const g=make();g.beginKick(type,side,type==='punt'?40:35);const p=g.carrier;
  near(travel(g,p),1);g.launchKick(.7,0);near(travel(g,p),1);
  p.x=g.special.ball.tx;p.y=g.special.ball.ty;let ticks=0;
  while(g.phase.startsWith('kick_')&&ticks++<150)g.tick(.05);
  assert.equal(g.phase,'return');near(travel(g,g.carrier),.93);
 }
});
test('loose-ball chasers are not slowed and a fumble or interception recovery transfers the penalty',()=>{
 const g=make(),qb=g.carrier,wr=g.players[2];g.startFumble(g.defenders[0]);
 near(travel(g,qb),1);near(travel(g,wr),1);g.recoverFumble(wr);
 near(travel(g,wr),.93);near(travel(g,qb),1);
 const defender=g.defenders[4];defender.y=50;g.startTurnover(defender,'interception');
 near(travel(g,defender),.93);near(travel(g,wr),1);
});
test('burst retains its short speed advantage and faster ratings can still outrun slower players',()=>{
 const g=make();g.carrier.speed=10;
 for(const p of [...g.players,...g.defenders])if(p!==g.carrier){p.x=0;p.y=90;p.speed=0;}
 const start=g.carrier.y;g.tick(.05,{x:0,y:1});const normal=g.carrier.y-start;
 g.burst();const before=g.carrier.y;g.tick(.05,{x:0,y:1});near((g.carrier.y-before)/normal,1.55);
 assert.ok(travel(g,g.carrier,8)>travel(g,g.defenders[4],7));
});
test('return pursuit leads a moving runner more at distance, without predicting past its cap',()=>{
 const g=make();g.phase='return';g.carrier.x=20;g.carrier.y=40;g.carrier.vx=4;g.carrier.vy=6;
 const d=g.defenders[4];d.x=22;d.y=45;const close=g.coverageTarget(d);
 d.x=45;d.y=70;const far=g.coverageTarget(d);
 assert.ok(far.x>close.x&&far.y>close.y);assert.ok(far.x<=22&&far.y<=43);
 g.carrier.vx=g.carrier.vy=0;assert.deepEqual(g.coverageTarget(d),{x:20,y:40});
});
test('an unopposed return remains a touchdown with no hidden speed clamp or touchdown cap',()=>{
 const g=make();g.beginKick('punt',1,40);g.launchKick(.7,0);
 let ticks=0;while(g.phase.startsWith('kick_')&&ticks++<150)g.tick(.05);
 for(const d of g.defenders){d.x=0;d.y=-8;d.speed=0;}
 while(g.isReturn&&ticks++<600){g.burst();g.tick(.05,{x:0,y:1});}
 assert.equal(g.scores[0],7);assert.match(g.lastResult,/TOUCHDOWN/);
});
