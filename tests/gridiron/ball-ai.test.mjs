import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Game,PLAYS} from '../../daily_flyer/themes/pocket_gridiron_assets/engine.js';
import {AI_PROFILES,seededRandom,fumbleChance} from '../../daily_flyer/themes/pocket_gridiron_assets/rules.js';
import {buildTeam} from '../../daily_flyer/themes/pocket_gridiron_assets/roster.js';
const data=JSON.parse(fs.readFileSync(new URL('../../daily_flyer/themes/pocket_gridiron_assets/rosters.json',import.meta.url)));
const home=buildTeam('NE',data),away=buildTeam('BUF',data);
function make(difficulty='pro',rng=()=>.5){const g=new Game(home,away,difficulty,rng);g.beginDrive(0,25);g.choose('slants');g.snap(g.offense);return g;}
function isolate(g){for(const p of [...g.players,...g.defenders]){p.x=50;p.y=90;p.speed=0;p.stun=0;}g.carrier.x=26;g.carrier.y=21;g.players[2].x=7;g.players[2].y=32;}
function passUntil(g,step=.05){let n=0;while(g.pass&&n++<300)g.tickPass(step);assert.ok(n<300);}

test('a clean drop is an incompletion, keeps the spot, and consumes one down',()=>{
 const g=make();isolate(g);g.throwTo(0);g.rng=()=>.01;passUntil(g);assert.equal(g.phase,'dead');assert.equal(g.stats.drops,1);assert.equal(g.stats.completions,0);assert.equal(g.stats.attempts,1);assert.match(g.lastResult,/Dropped pass/);g.next();assert.equal(g.down,2);assert.equal(g.spot,25);assert.equal(g.target,35);
});
test('a defender can tip a pass to the turf or into a live interception',()=>{
 const g=make();isolate(g);g.throwTo(0);g.bobble(g.pass);for(const p of [...g.players,...g.defenders]){p.x=50;p.y=90;}passUntil(g);assert.match(g.lastResult,/Tipped pass/);assert.equal(g.pending.offense,0);
 const h=make();isolate(h);h.throwTo(0);h.bobble({...h.pass,x:17,y:40});const d=h.defenders[4];d.x=h.pass.tx;d.y=h.pass.ty;h.rng=()=>.01;passUntil(h);assert.equal(h.phase,'return');assert.equal(h.carrier,d);assert.equal(h.offense,1);assert.equal(h.stats.interceptions,1);
});
test('a tipped ball caught by the offense stays live and counts once',()=>{
 const g=make();isolate(g);g.throwTo(0);g.bobble({...g.pass,x:17,y:40});const p=g.players[3];p.x=g.pass.tx;p.y=g.pass.ty;g.rng=()=>.01;passUntil(g);assert.equal(g.carrier,p);assert.equal(g.phase,'live');assert.equal(g.stats.completions,1);assert.equal(g.stats.attempts,1);
});
test('interception return keeps actual athletes, rotates the field, and can be a pick six',()=>{
 const g=make(),d=g.defenders[4],qb=g.carrier;d.x=8;d.y=60;qb.x=26;qb.y=21;g.startTurnover(d,'interception');assert.equal(g.offense,1);assert.equal(g.phase,'return');assert.equal(g.carrier,d);assert.equal(d.x,45);assert.equal(d.y,40);assert.ok(g.defenders.includes(qb));assert.equal(qb.y,79);assert.equal(g.canPass,false);assert.equal(g.special,null);g.finish('touchdown',100);assert.deepEqual(g.scores,[0,7]);assert.equal(g.pending.kickoff,1);
});
test('human takes control of an interception and earns return yards, not passing yards',()=>{
 const g=make();g.beginDrive(1,35);g.choose('man');g.snap(g.offense);const d=g.defenders[5];d.y=45;g.startTurnover(d,'interception');assert.equal(g.controlled,d);g.burst();assert.equal(g.burstLeft,.6);g.finish('tackle',65);assert.equal(g.stats.returnYards,10);assert.equal(g.stats.yards,0);assert.equal(g.stats.takeaways,1);g.next();assert.equal(g.offense,0);assert.equal(g.down,1);assert.equal(g.spot,65);
});
test('end-zone interceptions become touchbacks; expired clock waits for a return',()=>{
 const g=make();g.defenders[4].y=103;g.startTurnover(g.defenders[4],'interception');assert.equal(g.phase,'dead');assert.equal(g.pending.spot,20);assert.equal(g.pending.offense,1);
 const h=make();h.quarter=4;h.clock=0;h.scores=[7,7];h.defenders[4].y=40;h.startTurnover(h.defenders[4],'interception');assert.equal(h.phase,'return');h.finish('touchdown',100);h.next();assert.equal(h.phase,'final');assert.deepEqual(h.scores,[7,14]);
});
test('fumbles are loose balls, pause fully, and either side may recover and advance',()=>{
 const g=make();g.carrier=g.players[1];g.carrier.y=33;g.startFumble(g.defenders[0]);assert.equal(g.phase,'fumble');const before={...g.loose};g.paused=true;g.tick(.05,{x:1,y:1});assert.deepEqual(g.loose,before);g.paused=false;g.recoverFumble(g.players[2]);assert.equal(g.phase,'live');assert.equal(g.carrier,g.players[2]);assert.equal(g.canPass,false);assert.equal(g.stats.fumbles,1);assert.equal(g.stats.fumblesLost,0);
 const h=make();h.carrier=h.players[1];h.carrier.y=33;h.startFumble(h.defenders[0]);const d=h.defenders[4];d.y=34;h.recoverFumble(d);assert.equal(h.phase,'return');assert.equal(h.offense,1);assert.equal(h.carrier,d);assert.equal(h.stats.fumblesLost,1);assert.equal(h.stats.yards,8);
});
test('fourth-down recovery cannot gain a first down by advancing a fumble',()=>{
 const g=make();g.down=4;g.carrier.y=34;g.startFumble(g.defenders[0]);g.players[3].y=38;g.recoverFumble(g.players[3]);assert.equal(g.phase,'dead');assert.equal(g.pending.offense,1);assert.equal(g.pending.spot,66);assert.equal(g.stats.yards,9);
});
test('a return can be fumbled back, recording separate return segments and possessions',()=>{
 const g=make();g.defenders[4].y=50;g.startTurnover(g.defenders[4],'interception');g.carrier.y=60;g.startFumble(g.defenders[0]);const p=g.defenders[3];p.y=60;g.recoverFumble(p);assert.equal(g.offense,0);assert.equal(g.carrier,p);assert.equal(p.y,40);g.finish('tackle',48);assert.equal(g.stats.returnYards,8);assert.equal(g.stats.takeaways,1);assert.equal(g.pending.offense,0);
});
test('fumbles out of bounds preserve spot; through the opponent end zone are touchbacks',()=>{
 const g=make();g.carrier.y=31;g.startFumble(g.defenders[0]);g.loose.x=53.4;g.loose.y=34;g.loose.vx=g.loose.vy=0;g.tick(.01);assert.equal(g.pending.offense,0);assert.equal(g.pending.spot,31);
 const h=make();h.carrier.y=99;h.startFumble(h.defenders[0]);h.loose.y=101;h.loose.x=53.4;h.loose.vx=h.loose.vy=0;h.tick(.01);assert.equal(h.pending.offense,1);assert.equal(h.pending.spot,20);assert.equal(h.stats.fumblesLost,1);
});
test('fumble scrambles resolve by proximity without stalling',()=>{
 const g=make();g.carrier.y=38;g.startFumble(g.defenders[0]);let n=0;while(g.isLoose&&n++<150)g.tick(.05);assert.ok(n<150);assert.ok(['live','return','dead'].includes(g.phase));
});
test('clean catches drop occasionally across thousands of trials, never turn into phantom interceptions',()=>{
 const rng=seededRandom(814),g=make('pro',rng);let drops=0;const n=6000;
 for(let i=0;i<n;i++){g.beginDrive(0,25);g.choose('slants');g.snap(g.offense);isolate(g);g.throwTo(0);passUntil(g);if(g.phase==='dead')drops++;assert.notEqual(g.offense,1);}
 assert.ok(drops/n>.03&&drops/n<.05,`drop rate ${drops/n}`);
});
test('contact fumble trials stay rare; sacks and risky contact have higher conditional risk',()=>{
 const rng=seededRandom(72),g=make('pro',rng);let fumbles=0;const n=5000;
 for(let i=0;i<n;i++){g.beginDrive(0,25);g.choose('dive');g.snap(g.offense);isolate(g);g.carrier.power=70;g.carrier.y=27;g.liveTime=1;g.defenders[0].x=g.carrier.x;g.defenders[0].y=g.carrier.y;g.tick(.01);if(g.isLoose)fumbles++;}
 assert.ok(fumbles/n>.009&&fumbles/n<.024,`fumble rate ${fumbles/n}`);
 assert.ok(fumbleChance({sack:true})>fumbleChance({}));assert.ok(fumbleChance({burst:true,diving:true})>fumbleChance({}));
});
test('one defender contact trial is not repeated at higher frame rates',()=>{
 for(const dt of [.05,.01]){const g=make();isolate(g);g.throwTo(0);g.pass.duration=1;g.pass.elapsed=.7;g.pass.sx=g.pass.tx=g.defenders[4].x=7;g.pass.sy=g.pass.ty=g.defenders[4].y=32;g.pass.x=7;g.pass.y=32;let rolls=0;g.rng=()=>{rolls++;return .9;};passUntil(g,dt);assert.equal(rolls,2);assert.equal(g.stats.completions,1);}
});
test('difficulty changes reactions and sampled decisions while keeping speeds and outcome odds identical',()=>{
 const games=['rookie','pro','legend'].map(d=>make(d));assert.deepEqual(games[0].defenders.map(p=>p.speed),games[2].defenders.map(p=>p.speed));
 for(const g of games){isolate(g);g.defenders[4].x=10;g.defenders[4].y=32;g.throwTo(0);assert.ok(g.defenders[4].ballSeenAt>=AI_PROFILES[g.difficulty].reaction);const d=g.defenders[4];g.liveTime=1;g.readDefense(d);const target={...d.readTarget};g.pass.x=25;g.pass.y=35;g.liveTime+=.01;assert.deepEqual(g.readDefense(d),target);}
 assert.ok(games[0].defenders[4].ballSeenAt>games[1].defenders[4].ballSeenAt);assert.ok(games[1].defenders[4].ballSeenAt>games[2].defenders[4].ballSeenAt);
});
test('CPU calls use down and distance and past tendencies, without reading the newly selected offense',()=>{
 function calls(difficulty,long,history=[]){const g=make(difficulty,seededRandom(55));g.down=3;g.spot=40;g.target=long?55:41;g.history[0]=history;const counts={};for(let n=0;n<3000;n++){const p=g.selectDefense();counts[p]=(counts[p]||0)+1;}return counts;}
 const long=calls('legend',true),short=calls('legend',false),rookie=calls('rookie',true);
 assert.ok(long.prevent>short.prevent*2);assert.ok(short.commit>long.commit*2);assert.ok(long.prevent>rookie.prevent*1.4);
 const run=calls('legend',true,Array(8).fill('run'));assert.ok(run.commit>long.commit*2);
 const g=make('legend');g.phase='call';const chosen=g.defense;g.choose('mesh');assert.equal(g.defense,chosen);
});
test('man assigns separate outside receivers; new routes and delayed draw have distinct behavior',()=>{
 const g=make();g.defense='man';g.setFormation();assert.ok(g.coverageTarget(g.defenders[4]).x<10);assert.ok(g.coverageTarget(g.defenders[5]).x>40);assert.ok(g.coverageTarget(g.defenders[6]).y>g.spot+15);
 g.phase='call';g.choose('mesh');assert.ok(g.route(g.players[2],5).x>30);assert.ok(g.route(g.players[3],5).x<20);assert.notEqual(g.route(g.players[2],5).y,g.route(g.players[3],5).y);
 g.choose('smash');assert.ok(g.route(g.players[4],4).y>g.route(g.players[3],4).y+15);
 g.choose('draw');g.snap(g.offense);assert.equal(g.carrier,g.players[0]);for(let i=0;i<19;i++)g.tick(.05);assert.equal(g.carrier,g.players[1]);assert.equal(g.canPass,false);
});
test('seeded simulation replays identically for future authoritative multiplayer',()=>{
 function replay(){const g=make('legend',seededRandom(922));for(let n=0;n<1000;n++){if(g.phase==='penalty')g.resolvePenalty(true);if(g.phase==='call')g.choose(g.userOffense?'mesh':'robber');if(g.phase==='ready'&&g.userOffense)g.snap();if(g.phase==='kick_ready')g.kickAction();if(g.phase==='kick_charge'&&g.special.power>.72)g.kickAction();if(g.canPass&&g.liveTime>1.6)g.throwTo(n%3);g.tick(.05,{x:Math.sin(n*.04),y:1});}return JSON.stringify(g);}
 assert.equal(replay(),replay());assert.equal(PLAYS.length,10);
});
