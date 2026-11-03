import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Game} from '../../daily_flyer/themes/pocket_gridiron_assets/engine.js';
import {buildTeam,TEAMS} from '../../daily_flyer/themes/pocket_gridiron_assets/roster.js';
import {specialUnit,RETURN_PLANS,specialRows,specialStory} from '../../daily_flyer/themes/pocket_gridiron_assets/special-teams.js';
import {copyBox,halftimeReport} from '../../daily_flyer/themes/pocket_gridiron_assets/match.js';
import {pregameReport,halftimeBroadcast,postgameReport} from '../../daily_flyer/themes/pocket_gridiron_assets/broadcast.js';
import {BoothVoices,giveBoothVoice,broadcastBeat} from '../../daily_flyer/themes/pocket_gridiron_assets/booth-lines.js';
import {addSideline} from '../../daily_flyer/themes/pocket_gridiron_assets/sideline.js';
import {reporterPose} from '../../daily_flyer/themes/pocket_gridiron_assets/sideline-stage.js';
import {chatterPulses,wordTimeline} from '../../daily_flyer/themes/pocket_gridiron_assets/booth-chatter.js';
import {ReplayTape} from '../../daily_flyer/themes/pocket_gridiron_assets/replay.js';
const data=JSON.parse(fs.readFileSync(new URL('../../daily_flyer/themes/pocket_gridiron_assets/rosters.json',import.meta.url)));
const game=()=>new Game(buildTeam('NE',data),buildTeam('BUF',data),'pro',()=>.5);
function until(g,predicate,tape=null){for(let i=0;i<500&&!predicate(g);i++){g.tick(.05);if(tape)tape.observe(g,.05,g.events.splice(0));}assert.ok(predicate(g),g.phase);}
test('every team fields seven distinct return and coverage players with real specialists',()=>{
 for(const meta of TEAMS){const t=buildTeam(meta.abbr,data);for(const kind of ['kickoff','punt']){const u=specialUnit(t,kind);assert.equal(u.receiving.length,7);assert.equal(u.coverage.length,7);assert.equal(new Set(u.receiving.map(p=>p.id)).size,7);assert.equal(new Set(u.coverage.map(p=>p.id)).size,7);assert.equal(u.coverage[6].pos,kind==='punt'?'P':'K');assert.equal(u.receiving[1],t.specialists[kind==='punt'?'pr':'kr']);assert.notEqual(u.coverage[0].id,u.coverage[1].id);}}
});
test('saved specialist selections reach the field and a return plan is locked after the kick',()=>{
 const t=buildTeam('NE',data),rb=t.roster.find(p=>p.pos==='RB'),wr=t.roster.find(p=>p.pos==='WR');
 const home=buildTeam('NE',data,{kr:rb.id,pr:wr.id,gunner1:wr.id}),g=new Game(home,buildTeam('BUF',data),'pro',()=>.5);
 assert.equal(g.carrier.id,rb.id);assert.equal(g.chooseReturnPlan('right'),true);assert.equal(g.special.returnPlan,'right');assert.equal(g.chooseReturnPlan('invalid'),false);
 g.paused=true;assert.equal(g.chooseReturnPlan('left'),false);g.paused=false;g.launchKick(.6,0);assert.equal(g.chooseReturnPlan('left'),false);
 g.beginKick('punt',1,40);assert.equal(g.carrier.id,wr.id);g.beginKick('punt',0,40);assert.equal(g.defenders[0].id,wr.id);assert.equal(g.chooseReturnPlan('left'),false);
});
test('return choices change the first blocking lane and leave ordinary offense untouched',()=>{
 const positions=[];
 for(const id of Object.keys(RETURN_PLANS)){const g=game();g.beginKick('punt',1,40);g.chooseReturnPlan(id);g.launchKick(.7,0);until(g,g=>g.phase==='return');g.carrier.x=26.5;for(const d of g.defenders){d.x=51;d.y=95;}for(const p of g.players)if(p!==g.carrier){p.x=26.5;p.y=g.carrier.y+3;}for(let i=0;i<10;i++)g.tick(.05);positions.push(g.players[5].x);}
 assert.ok(positions[0]<positions[1]&&positions[1]<positions[2],positions);
});
test('punt returns, coverage tackles, net yards and deep pins are counted once',()=>{
 const g=game();g.beginKick('punt',1,40);g.launchKick(.7,0);until(g,g=>g.phase==='return');const landing=g.special.catchY;g.carrier.y=landing+18;g.finish('tackle',g.carrier.y);
 assert.equal(g.box[0].special.puntReturns,1);assert.equal(g.box[0].special.puntReturnYards,18);assert.equal(g.box[1].special.coverageStops,1);assert.equal(g.box[1].special.punts,1);assert.equal(g.box[1].special.puntNet,Math.round(60-landing-18));assert.equal(g.box[0].rushYards+g.box[0].passYards,0);
 g.finish('tackle',g.carrier.y);assert.equal(g.box[0].special.puntReturns,1);
 g.beginKick('punt',1,40);g.launchKick(.7,0);g.fairCatch();until(g,g=>g.phase==='dead');assert.equal(g.box[1].special.inside20,1);assert.equal(g.box[0].special.puntReturns,1);
 const copy=copyBox(g.box);g.box[0].special.puntReturns=99;assert.equal(copy[0].special.puntReturns,1);
});
test('touchbacks, bad kickoffs and field goals have separate accurate ledgers',()=>{
 const g=game();g.beginKick('kickoff',1,35);g.launchKick(1,0);until(g,g=>g.phase==='dead');assert.equal(g.box[1].special.kickoffs,1);assert.equal(g.box[1].special.kickTouchbacks,1);assert.equal(g.box[0].special.kickReturns,0);
 g.beginKick('kickoff',1,35);g.launchKick(.6,1);until(g,g=>g.phase==='dead');assert.equal(g.box[1].special.outOfBounds,1);assert.equal(g.box[0].special.startYards,65);
 g.beginGoal('fieldgoal',0,70);g.launchGoal(1,.5);until(g,g=>g.phase==='dead');assert.equal(g.box[0].special.fgMade,1);assert.equal(g.box[0].special.fgAttempts,1);assert.equal(g.box[0].special.longFG,47);
 g.beginGoal('extra',0,85);g.launchGoal(0,0);until(g,g=>g.phase==='dead');assert.equal(g.box[0].special.xpAttempts,1);assert.equal(g.box[0].special.xpMade,0);
 assert.ok(specialRows(g.box).flat().every(v=>!String(v).includes('NaN')));
});
test('interception returns do not inflate kick return totals',()=>{
 const g=game();g.beginDrive(0,25);g.choose('slants');g.snap();const defender=g.defenders[4];defender.y=40;g.startTurnover(defender,'interception');g.carrier.y+=12;g.finish('tackle',g.carrier.y);assert.equal(g.box[1].returnYards,12);assert.equal(g.box[1].special.kickReturnYards+g.box[1].special.puntReturnYards,0);
});
test('big returns, deep punts and field goals enter detached broadcast footage',()=>{
 const g=game(),tape=new ReplayTape();g.beginKick('punt',1,40);g.events=[];g.launchKick(.7,0);until(g,g=>g.phase==='return',tape);const start=g.special.catchY;
 for(let i=0;i<45;i++){g.carrier.y=start+i*.4;tape.observe(g,.05,[]);}g.finish('tackle',start+18);tape.observe(g,.05,g.events.splice(0));
 assert.equal(tape.fullHighlights[0].kind,'BIG RETURN');assert.equal(tape.fullHighlights[0].special.yards,18);assert.equal(tape.clips[0].kind,'BIG RETURN');const stored=tape.fullHighlights[0].special;g.special.settled.yards=99;assert.equal(stored.yards,18);tape.skipAll();assert.ok(tape.fullHighlights.length);
 g.beginGoal('fieldgoal',0,70);g.events=[];g.launchGoal(1,.5);until(g,g=>g.phase==='dead',tape);assert.ok(tape.fullHighlights.some(c=>c.kind==='FIELD GOAL'));
 g.beginKick('punt',1,40);g.events=[];g.launchKick(.7,0);g.fairCatch();until(g,g=>g.phase==='dead',tape);assert.ok(tape.fullHighlights.some(c=>c.kind==='PINNED DEEP'));
 const report=postgameReport(g,tape.fullHighlights);assert.ok(report.segments.some(s=>s.clip?.special));assert.ok(report.segments.filter(s=>s.clip?.special).every(s=>s.topic==='special'&&!s.al.includes('offensive yards on')));
 const show=giveBoothVoice(report,new BoothVoices({seed:2}));assert.equal(show.segments.filter(s=>s.visual==='highlight').length,report.segments.filter(s=>s.visual==='highlight').length,'a field report never replaces recorded footage');assert.ok(show.segments.filter(s=>s.sideline).every(s=>!s.clip));
});
test('Casey reports actual selected specialists and rotates without adding show segments or using game RNG',()=>{
 const g=game();g.rng=()=>assert.fail('report consumed gameplay RNG');const before=JSON.stringify(g),report=pregameReport(g.teams,g.match),voices=new BoothVoices({seed:1});
 const shows=Array.from({length:6},()=>giveBoothVoice(report,voices));assert.deepEqual(shows.map(r=>r.segments.filter(s=>s.sideline).length),[1,0,1,0,1,0]);assert.ok(shows.every(r=>r.segments.length===report.segments.length));
 const s=shows[0].segments.find(s=>s.sideline);assert.match(s.turns[1].text,new RegExp(g.teams[0].specialists.kr.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));assert.deepEqual(s.turns.map(t=>t.speaker),['al','casey','john']);
 const at=wordTimeline(s.turns[0].text).duration+.3;assert.equal(broadcastBeat(s,at).turn.speaker,'casey');assert.ok(broadcastBeat(s,at).word);
 const saved=voices.snapshot();assert.deepEqual(giveBoothVoice(report,new BoothVoices(saved)),giveBoothVoice(report,voices));assert.equal(JSON.stringify(g),before);
 const half=halftimeBroadcast(halftimeReport(g),[]);assert.equal(addSideline(half,7).segments.filter(s=>s.sideline).length,1);assert.match(specialStory(half),/No field-goal/);
});
test('Casey has a distinct syllable timbre and animated poses that freeze for reduced motion',()=>{
 const word=wordTimeline('football').words[0],voices=['al','john','casey'].map(s=>chatterPulses(s,word));assert.ok(voices.every(p=>p.length===2));assert.equal(new Set(voices.map(p=>p[0].frequency)).size,3);
 assert.deepEqual(reporterPose(1,false,1),reporterPose(20,false,0));assert.notDeepEqual(reporterPose(1,true),reporterPose(4,true));
});
