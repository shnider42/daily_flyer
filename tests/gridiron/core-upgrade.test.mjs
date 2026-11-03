import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {Game} from '../../daily_flyer/themes/pocket_gridiron_assets/engine.js';
import {TEAMS,buildTeam} from '../../daily_flyer/themes/pocket_gridiron_assets/roster.js';
import {uniformFor} from '../../daily_flyer/themes/pocket_gridiron_assets/uniforms.js';
import {goalWindow,goalResult} from '../../daily_flyer/themes/pocket_gridiron_assets/placekicks.js';
import {primaryCommand} from '../../daily_flyer/themes/pocket_gridiron_assets/controls.js';
import {replayFrame} from '../../daily_flyer/themes/pocket_gridiron_assets/replay.js';
const data=JSON.parse(fs.readFileSync(new URL('../../daily_flyer/themes/pocket_gridiron_assets/rosters.json',import.meta.url)));
const make=()=>new Game(buildTeam('NE',data),buildTeam('BUF',data),'pro',()=>.5);
const tick=(g,n=31)=>{for(let i=0;i<n;i++)g.tick(.05);};
function touchdown(g,score=[0,0]){g.beginDrive(0,90);g.choose('dive');g.snap();g.scores=[...score];g.publishedScores=[...score];g.finish('touchdown',100);}
test('all home uniforms contrast with white away jerseys; replay and turnover keep team identity',()=>{
 const lum=h=>h.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
 for(const t of TEAMS){const h=uniformFor(t,0),a=uniformFor(t,1);assert.ok((lum(a.jersey)+.05)/(lum(h.jersey)+.05)>3,t.abbr);assert.notEqual(a.jersey,a.number);}
 const g=make();g.beginDrive(0,25);g.choose('slants');g.snap();const d=g.defenders[4],id=d.id;d.y=50;g.startTurnover(d,'interception');const p=replayFrame(g,1).people.find(p=>p.id===id);assert.equal(p.team,1);assert.equal(uniformFor(g.teams[p.team],p.team).jersey,'#f5f3e9');
});
test('every team can choose both tosses, both sweep directions and jet sweep',()=>{for(const t of TEAMS){const g=new Game(buildTeam(t.abbr,data),buildTeam('BUF',data));g.beginDrive(0,25);for(const id of ['sweep','sweepleft','tossleft','tossright','jetsweep'])assert.ok(g.offensePlays.some(p=>p.id===id),`${t.abbr} ${id}`);}});
test('tosses visibly travel sideways and transfer control; jet gives the receiver the ball',()=>{
 for(const id of ['tossleft','tossright','sweepleft','jetsweep']){const g=make();g.beginDrive(0,25);g.choose(id);g.snap();for(const d of g.defenders){d.x=50;d.y=100;d.speed=0;}assert.equal(g.carrier,g.players[0]);tick(g,4);assert.ok(g.pitch);if(id.startsWith('toss')){assert.ok(g.pitch.released);assert.ok(id==='tossleft'?g.pitch.x<26.5:g.pitch.x>26.5);}tick(g,10);assert.equal(g.pitch,null);assert.equal(g.carrier,g.players[id==='jetsweep'?2:1]);assert.equal(g.box[0].attempts,0);assert.equal(g.canPass,false);const y=g.carrier.y;g.tick(.05,{x:0,y:1});assert.ok(g.carrier.y>y);}
});
test('human place kicks use power and accuracy without an outcome random roll',()=>{
 const g=make();g.beginDrive(0,70,4);assert.ok(g.kick('fieldgoal'));g.rng=()=>assert.fail('human kick rolled RNG');assert.equal(primaryCommand(g),'kick');g.kickAction();tick(g,24);g.kickAction();assert.equal(g.phase,'kick_accuracy');assert.equal(primaryCommand(g),'kick');tick(g,10);g.kickAction();assert.equal(g.phase,'kick_flight');assert.equal(g.kickAction(),false);tick(g);assert.equal(g.scores[0],3);g.next();assert.equal(g.special.type,'kickoff');
});
test('short and wide kicks miss deterministically; longer kicks demand more power and accuracy',()=>{const k={kickPower:85,kickAccuracy:82};assert.equal(goalResult(k,47,.2,.5).reason,'SHORT');assert.equal(goalResult(k,47,1,.05).reason,'WIDE LEFT');assert.equal(goalResult(k,47,1,.95).reason,'WIDE RIGHT');assert.ok(goalResult(k,47,1,.5).good);assert.ok(goalWindow(k,55).minPower>goalWindow(k,32).minPower);assert.ok(goalWindow(k,55).high<goalWindow(k,32).high);assert.equal(goalResult(k,65,1,.5).good,false);});
test('pause freezes both meter stages and flight, and extra points never consume the game clock',()=>{const g=make();touchdown(g);assert.equal(g.scores[0],6);g.next();assert.equal(g.special.type,'extra');const clock=g.clock;for(const phase of ['kick_charge','kick_accuracy','kick_flight']){g.kickAction();assert.equal(g.phase,phase);g.paused=true;const state=JSON.stringify(g.special);tick(g,50);assert.equal(JSON.stringify(g.special),state);g.paused=false;tick(g,phase==='kick_charge'?24:phase==='kick_accuracy'?10:31);}assert.equal(g.clock,clock);assert.equal(g.scores[0],7);});
test('an expired-clock conversion can force overtime; a miss ends the game; Q2 waits for the try',()=>{
 for(const accuracy of [.5,.01]){const g=make();touchdown(g,[0,7]);g.quarter=4;g.clock=0;g.next();assert.equal(g.special.type,'extra');g.launchGoal(1,accuracy);tick(g);g.next();assert.equal(g.quarter,accuracy===.5?5:4);assert.equal(g.phase,accuracy===.5?'kick_ready':'final');}
 const g=make();touchdown(g);g.quarter=2;g.clock=0;g.next();assert.equal(g.quarter,2);g.launchGoal(1,.5);tick(g);g.next();assert.equal(g.phase,'halftime');assert.deepEqual(g.halftime.scores,[7,0]);
});
test('a CPU place kick resolves without a user tap',()=>{const g=make();g.beginGoal('extra',1,85);assert.equal(primaryCommand(g),null);tick(g,70);assert.equal(g.phase,'dead');assert.equal(g.scores[1],1);});
