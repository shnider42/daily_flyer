import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {Game} from '../../daily_flyer/themes/pocket_gridiron_assets/engine.js';
import {clearBlocks,updateBlocking,isBlocker} from '../../daily_flyer/themes/pocket_gridiron_assets/blocking.js';
import {primaryCommand,stickInput} from '../../daily_flyer/themes/pocket_gridiron_assets/controls.js';
import {seededRandom} from '../../daily_flyer/themes/pocket_gridiron_assets/rules.js';
import {buildTeam} from '../../daily_flyer/themes/pocket_gridiron_assets/roster.js';
const data=JSON.parse(fs.readFileSync(new URL('../../daily_flyer/themes/pocket_gridiron_assets/rosters.json',import.meta.url))),home=buildTeam('NE',data),away=buildTeam('BUF',data);
function make(offense=0,rng=()=>.5){const g=new Game(home,away,'pro',rng);g.beginDrive(offense,25);g.choose(offense===0?'slants':'zone');return g;}
function live(offense=0){const g=make(offense);g.snap(offense);return g;}
function ticks(g,seconds,input={x:0,y:0}){for(let t=0;t<seconds;t+=.05)g.tick(.05,input);}
function offside(){const g=make();g.defenders[0].x=50;g.defenders[0].y=g.spot+.2;g.snap();return g;}

test('human cannot snap for CPU; CPU cadence starts after coverage selection',()=>{
 const g=make(1);assert.equal(primaryCommand(g),null);assert.equal(g.snap(),false);assert.equal(g.phase,'ready');const clock=g.clock,y=g.controlled.y;ticks(g,.4,{x:0,y:1});assert.ok(g.controlled.y>y);assert.equal(g.clock,clock);ticks(g,3.1);assert.equal(g.phase,'live');assert.ok(g.clock<clock);assert.equal(g.history[1].length,1);
});
test('pause freezes cadence and positioning; offense snaps only on its own button',()=>{
 const g=make(1);g.paused=true;const remaining=g.cpuSnapIn,x=g.controlled.x;ticks(g,4,{x:1,y:0});assert.equal(g.cpuSnapIn,remaining);assert.equal(g.controlled.x,x);g.paused=false;const selected=g.selected;g.switchDefender();assert.notEqual(g.selected,selected);
 const h=make();ticks(h,6);assert.equal(h.phase,'ready');assert.equal(h.clock,45);assert.equal(primaryCommand(h),'snap');assert.equal(h.snap(),true);assert.equal(primaryCommand(h),'burst');h.throwTo(0);assert.equal(primaryCommand(h),null);
});
test('encroachment whistles pre-snap contact, advances five yards and preserves the down',()=>{
 const g=make(1),d=g.controlled,p=g.players[5];d.x=p.x;d.y=p.y;g.tick(.01);assert.equal(g.phase,'dead');assert.equal(g.pending.spot,30);assert.equal(g.pending.down,1);assert.equal(g.clock,45);assert.equal(g.history[1].length,0);assert.equal(g.stats.penalties,1);assert.match(g.lastResult,/ENCROACHMENT/);g.next();assert.equal(g.down,1);assert.equal(g.target,35);
});
test('offsides is a free play and can be accepted or declined after the outcome',()=>{
 const g=offside();assert.equal(g.phase,'live');assert.equal(g.flags[0].type,'offside');g.finish('incomplete',25);assert.equal(g.phase,'penalty');assert.equal(primaryCommand(g),'accept');g.next();assert.equal(g.phase,'penalty');g.resolvePenalty(true);assert.equal(g.pending.spot,30);g.next();assert.equal(g.down,1);assert.equal(g.spot,30);
 const h=offside();h.finish('tackle',42);h.resolvePenalty(false);h.next();assert.equal(h.spot,42);assert.equal(h.down,1);assert.match(h.lastResult,/DECLINED/);
});
test('holding choices roll back provisional touchdowns and play statistics only if accepted',()=>{
 for(const accept of [true,false]){const g=live(1);g.flag('holding',1,g.players[5]);g.stats.tackles=8;g.finish('touchdown',100);assert.equal(g.phase,'penalty');assert.deepEqual(g.scores,[0,0]);assert.ok(!g.events.some(e=>e.type==='result'&&e.text==='TOUCHDOWN!'));g.resolvePenalty(accept);if(accept){assert.deepEqual(g.scores,[0,0]);assert.equal(g.pending.spot,15);assert.equal(g.pending.down,1);assert.equal(g.stats.tackles,0);}else{assert.deepEqual(g.scores,[0,6]);assert.equal(g.pending.extraPoint,1);assert.equal(g.stats.tackles,8);}}
});
test('CPU declines an offensive hold when it already secured a turnover',()=>{
 const g=live();g.flag('holding',0,g.players[5]);g.stats.attempts=1;g.defenders[4].y=40;g.startTurnover(g.defenders[4],'interception');g.finish('tackle',65);assert.equal(g.phase,'dead');assert.match(g.lastResult,/DECLINED/);assert.equal(g.pending.offense,1);assert.equal(g.pending.spot,65);assert.equal(g.stats.interceptions,1);
});
test('an accepted fourth-down hold repeats fourth down; half-distance and end-zone safety work',()=>{
 const g=make();g.down=4;g.snap();g.flag('holding',0,g.players[5]);g.finish('touchdown',100);assert.equal(g.phase,'dead');assert.equal(g.pending.down,4);assert.equal(g.pending.spot,15);assert.deepEqual(g.scores,[0,0]);g.next();assert.equal(g.down,4);
 const h=make();h.spot=6;h.target=16;h.setFormation();h.snap();h.flag('holding',0,h.players[5]);h.finish('touchdown',100);assert.equal(h.pending.spot,3);assert.match(h.lastResult,/Half the distance/);
 const s=live();s.players[5].y=-1;s.flag('holding',0,s.players[5]);s.finish('touchdown',100);assert.deepEqual(s.scores,[0,2]);assert.equal(s.pending.kickoff,0);
});
test('defensive penalty can earn a first down and uses half-distance near the goal',()=>{
 const g=make();g.target=28;g.defenders[0].x=50;g.defenders[0].y=25;g.snap();g.finish('incomplete',25);g.resolvePenalty(true);assert.equal(g.pending.down,1);assert.equal(g.pending.target,40);
 const h=make();h.spot=97;h.target=100;h.setFormation();h.defenders[0].x=50;h.defenders[0].y=97;h.snap();h.finish('incomplete',97);h.resolvePenalty(true);assert.equal(h.pending.spot,98.5);assert.equal(h.pending.target,100);
});
test('offsetting pre-possession fouls replay the original down and cancel scores',()=>{
 const g=offside();g.flag('holding',0,g.players[5]);g.finish('touchdown',100);assert.equal(g.phase,'dead');assert.deepEqual(g.scores,[0,0]);assert.equal(g.pending.spot,25);assert.equal(g.pending.down,1);assert.match(g.lastResult,/OFFSETTING/);
});
test('accepted defensive foul allows an untimed down; offensive holding does not extend the half',()=>{
 const g=offside();g.quarter=4;g.clock=0;g.scores=[0,7];g.playStart.scores=[0,7];g.finish('incomplete',25);g.resolvePenalty(true);g.next();assert.equal(g.quarter,4);assert.equal(g.clock,0);assert.equal(g.phase,'call');g.choose('dive');g.snap();g.finish('touchdown',100);g.next();assert.equal(g.special.type,'extra');g.launchGoal(1,.5);for(let i=0;i<31;i++)g.tick(.05);g.next();assert.equal(g.quarter,5);
 const h=live();h.quarter=4;h.clock=0;h.scores=[0,7];h.playStart.scores=[0,7];h.flag('holding',0,h.players[5]);h.finish('touchdown',100);h.next();assert.equal(h.phase,'final');assert.deepEqual(h.scores,[0,7]);
});
test('pause stops penalty decisions and preserves the pending review',()=>{
 const g=offside();g.finish('incomplete',25);g.paused=true;const review=JSON.stringify(g.penaltyReview);assert.equal(g.resolvePenalty(true),false);ticks(g,5);assert.equal(JSON.stringify(g.penaltyReview),review);assert.equal(primaryCommand(g),null);
});
test('pass protection assigns different threats and leaves receivers on their routes',()=>{
 const g=live();updateBlocking(g,.05);const ids=g.players.filter(p=>p.assignment!==null).map(p=>p.assignment);assert.equal(ids.length,new Set(ids).size);assert.ok(ids.length>=2);assert.equal(isBlocker(g,g.players[2]),false);assert.equal(isBlocker(g,g.players[5]),true);assert.ok(g.defenders.every(d=>d.stun===0));
});
test('protection creates a useful but finite pocket compared with an unprotected QB',()=>{
 const means=[];for(const protect of [true,false]){let seconds=0;for(let seed=1;seed<=30;seed++){const g=make(0,seededRandom(seed));g.defense='zone';g.setFormation();g.snap();if(!protect)for(const i of [1,5,6]){g.players[i].x=0;g.players[i].y=0;g.players[i].speed=0;}let n=0;while(g.isLive&&n++<160)g.tick(.05);seconds+=n*.05;}means.push(seconds/30);}assert.ok(means[0]>means[1]+1,JSON.stringify(means));assert.ok(means[0]<4.5,JSON.stringify(means));
});
test('blocks expire and defenders can actively shed instead of being stun-locked',()=>{
 const g=live(1),p=g.players[5],d=g.controlled;p.x=26;p.y=24;d.x=26;d.y=25.9;g.blocks=[{p:5,d:g.selected,left:1,age:.4,held:false}];updateBlocking(g,.05);assert.equal(d.blocked,true);assert.equal(primaryCommand(g),'burst');g.burst();assert.equal(d.blocked,false);assert.ok(g.blocks.every(b=>b.d!==g.selected));assert.ok(d.blockCooldown>0);assert.equal(d.stun,0);
 const h=live();h.rng=()=>.9;h.players[5].x=26;h.players[5].y=24;h.defenders[0].x=26;h.defenders[0].y=25.9;h.blocks=[{p:5,d:0,left:.01,age:2,held:false}];updateBlocking(h,.05);assert.ok(h.defenders[0].blockCooldown>0);assert.equal(h.defenders[0].blocked,false);
});
test('a pocket hold comes from one failed block, not a per-frame random flag',()=>{
 const g=live(),p=g.players[5],d=g.defenders[0];clearBlocks(g);for(const q of g.players){if(q!==p&&q!==g.carrier){q.x=0;q.y=-5;q.speed=0;}}p.x=26;p.y=24;d.x=26;d.y=25.9;d.power=90;p.power=80;g.carrier.x=26;g.carrier.y=21;g.blocks=[{p:5,d:0,left:.01,age:2,held:false}];g.rng=()=>0;updateBlocking(g,.05);assert.equal(g.flags.length,1);assert.equal(g.flags[0].type,'holding');for(let i=0;i<5;i++)updateBlocking(g,.05);assert.equal(g.flags.length,1);assert.equal(g.blocks.find(b=>b.d===0).held,true);
});
test('joystick dead zone prevents drift and clamps diagonal input to full speed',()=>{
 const center=stickInput(2,-1,32);assert.equal(center.x,0);assert.equal(center.y,0);const full=stickInput(80,-80,32);assert.ok(Math.abs(Math.hypot(full.x,full.y)-1)<1e-9);assert.ok(full.x>0&&full.y>0);assert.ok(Math.abs(Math.hypot(full.px,full.py)-32)<1e-9);const half=stickInput(16,0,32);assert.ok(half.x>0&&half.x<1);
});
