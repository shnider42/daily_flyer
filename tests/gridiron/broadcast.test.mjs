import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Game} from '../../daily_flyer/themes/pocket_gridiron_assets/engine.js';
import {buildTeam} from '../../daily_flyer/themes/pocket_gridiron_assets/roster.js';
import {ReplayTape} from '../../daily_flyer/themes/pocket_gridiron_assets/replay.js';
import {pregameReport,halftimeBroadcast,highlightFocus} from '../../daily_flyer/themes/pocket_gridiron_assets/broadcast.js';
import {sampleHighlight} from '../../daily_flyer/themes/pocket_gridiron_assets/broadcast-screen.js';
import {halftimeReport} from '../../daily_flyer/themes/pocket_gridiron_assets/match.js';
const data=JSON.parse(fs.readFileSync(new URL('../../daily_flyer/themes/pocket_gridiron_assets/rosters.json',import.meta.url)));
const game=()=>new Game(buildTeam('NE',data),buildTeam('BUF',data),'pro',()=>.5);
function film(g,t,side=0,end=40){
 g.beginDrive(side,25);g.choose(side===0?'dive':'zone');g.snap(side);g.carrier=g.players[1];g.events=[];
 for(let i=0;i<65;i++){g.carrier.y=25+(end-25)*i/64;t.observe(g,.05,[]);}
}
function settle(g,t,end=40){g.finish(end>=100?'touchdown':'tackle',end);t.observe(g,.05,g.events.splice(0));}

test('pregame uses selected starters and both teams, without changing the game or rolling RNG',()=>{
 const g=game();g.teams[0].offense[0]={...g.teams[0].offense[0],name:'Selected QB'};
 g.rng=()=>assert.fail('broadcast consumed gameplay RNG');const before=JSON.stringify(g);
 const r=pregameReport(g.teams,g.match);assert.equal(r.mode,'pregame');assert.match(r.segments[0].al,/Selected QB/);
 assert.ok(r.segments.some(s=>s.team===1));assert.equal(r.rows.find(row=>row[0]==='Quarterback')[1],'Selected QB');
 assert.ok(r.segments.some(s=>s.visual==='package'&&s.caption.includes('not a replay')));assert.equal(JSON.stringify(g),before);
});
test('first-half reel survives replay skips and owns detached, bounded snapshots',()=>{
 const g=game(),t=new ReplayTape();film(g,t);settle(g,t);assert.equal(t.highlights.length,1);
 const first=t.highlights[0];assert.equal(first.gain,15);t.skipAll();assert.equal(t.highlights.length,1);
 const x=first.frames[0].people[0].x;g.players[0].x=51;t.history[0].people[0].x=50;assert.equal(first.frames[0].people[0].x,x);
 for(let i=0;i<12;i++){film(g,t,i%2,40+i);settle(g,t,40+i);t.skipAll();}
 assert.ok(t.highlights.length<=6);assert.ok(t.highlights.every(c=>c.frames.length<=162));
 assert.equal(t.highlights.filter(c=>c.team===0).length,3);assert.equal(t.highlights.filter(c=>c.team===1).length,3);
 const n=t.highlights.length;g.quarter=3;film(g,t,0,100);settle(g,t,100);assert.equal(t.highlights.length,n);assert.ok(t.highlights.every(c=>c.quarter<=2));
});
test('accepted penalties cannot become halftime highlights; declined outcomes can',()=>{
 for(const accept of [true,false]){
  const g=game(),t=new ReplayTape();film(g,t,0,100);g.flag('offside',1,g.defenders[0]);g.finish('touchdown',100);t.observe(g,.05,g.events.splice(0));
  assert.equal(g.phase,'penalty');assert.equal(t.highlights.length,0);g.resolvePenalty(accept);t.observe(g,.05,g.events.splice(0));
  assert.equal(t.highlights.length,accept?0:1);if(!accept)assert.equal(t.highlights[0].kind,'TOUCHDOWN');
 }
});
test('the same settled play cannot enter the reel twice',()=>{
 const g=game(),t=new ReplayTape();film(g,t);settle(g,t);g.publishResult('SAME RESULT','');t.observe(g,.05,g.events.splice(0));assert.equal(t.highlights.length,1);
});
test('marker focus identifies an actually recorded blocker; replay does not change live state',()=>{
 const g=game(),t=new ReplayTape();g.beginDrive(0,25);g.choose('dive');g.snap();g.events=[];
 g.blocks=[{p:5,d:0,left:2,age:.2}];for(let i=0;i<70;i++){g.carrier.y=25+i*.3;t.observe(g,.05,[]);}settle(g,t,46);
 const clip=t.highlights[0],f=highlightFocus(clip);assert.equal(f.block,true);assert.equal(f.focus.id,g.players[5].id);
 g.rng=()=>assert.fail('film consumed RNG');const before=JSON.stringify(g),stored=JSON.stringify(clip);
 for(let i=0;i<300;i++)sampleHighlight({...clip,focusIndex:f.index},i*.05);
 assert.equal(JSON.stringify(g),before);assert.equal(JSON.stringify(clip),stored);
 assert.equal(sampleHighlight({...clip,focusIndex:f.index},4).ball.y,sampleHighlight({...clip,focusIndex:f.index},7).ball.y);
});
test('halftime gives both teams footage when available, and clearly labels the empty-reel fallback',()=>{
 const g=game(),t=new ReplayTape();film(g,t,0,100);settle(g,t,100);t.skipAll();film(g,t,1,40);settle(g,t,40);
 const report=halftimeReport(g),show=halftimeBroadcast(report,t.highlights),clips=show.segments.filter(s=>s.visual==='highlight');
 assert.deepEqual(new Set(clips.map(s=>s.clip.team)),new Set([0,1]));assert.ok(clips.length<=3);
 const fallback=halftimeBroadcast(report,[]).segments.find(s=>s.visual==='diagram');assert.match(fallback.al,/not a replay/);assert.match(fallback.caption,/no eligible/);
});
