import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {musicPolicy,StadiumAudio} from '../../daily_flyer/themes/pocket_gridiron_assets/audio.js';
import {BOOTH_EXCHANGES,BoothVoices,giveBoothVoice,broadcastBeat} from '../../daily_flyer/themes/pocket_gridiron_assets/booth-lines.js';
import {boothPose} from '../../daily_flyer/themes/pocket_gridiron_assets/booth-stage.js';
import {postgameReport,pregameReport} from '../../daily_flyer/themes/pocket_gridiron_assets/broadcast.js';
import {Game} from '../../daily_flyer/themes/pocket_gridiron_assets/engine.js';
import {ReplayTape} from '../../daily_flyer/themes/pocket_gridiron_assets/replay.js';
import {buildTeam} from '../../daily_flyer/themes/pocket_gridiron_assets/roster.js';
const data=JSON.parse(fs.readFileSync(new URL('../../daily_flyer/themes/pocket_gridiron_assets/rosters.json',import.meta.url)));
const game=()=>new Game(buildTeam('NE',data),buildTeam('NYJ',data),'pro',()=>.5);
test('old audio preferences migrate to broadcast moments; continuous music requires an explicit choice',()=>{
 assert.equal(new StadiumAudio({music:true}).settings.musicMode,'broadcast');assert.equal(new StadiumAudio({musicMode:'always'}).settings.musicMode,'always');
 const s={musicMode:'broadcast'};assert.equal(musicPolicy(s,null).background,true);
 for(const phase of ['call','ready','live','dead','kick_ready','penalty'])assert.equal(musicPolicy(s,{phase,isLive:phase==='live'}).background,false,phase);
 for(const phase of ['pregame','halftime','postgame'])assert.equal(musicPolicy(s,{phase,paused:true},{broadcast:true}).background,true);
 assert.equal(musicPolicy(s,{phase:'live',isLive:true}).scoreAllowed,false);assert.equal(musicPolicy(s,{phase:'dead',isLive:false}).scoreAllowed,true);
 assert.equal(musicPolicy({musicMode:'always'},{phase:'live',isLive:true}).background,true);assert.equal(musicPolicy(s,{phase:'call'},{audition:true}).background,true);
});
test('expanded dialogue rotates 432 original lines without repeating a topic early',()=>{
 const john=Object.values(BOOTH_EXCHANGES).flatMap(bank=>bank.flatMap(([j,a,b])=>[j,b]));assert.equal(new Set(john).size,288);
 assert.equal(new Set(Object.values(BOOTH_EXCHANGES).flat(2)).size,432);
 const v=new BoothVoices({seed:42});for(const [topic,bank] of Object.entries(BOOTH_EXCHANGES)){const chosen=Array.from({length:bank.length},()=>v.take(topic).john);assert.equal(new Set(chosen).size,bank.length,topic);assert.notEqual(v.take(topic).john,chosen.at(-1));}
 const saved=v.snapshot(),next=v.take('team',{qb:'Chosen QB'});assert.deepEqual(new BoothVoices(saved).take('team',{qb:'Chosen QB'}),next);
});
test('hosts exchange the speaking role; previews keep selected lineup facts and presentation never rolls gameplay RNG',()=>{
 const g=game();g.teams[0].offense[0].name='Chosen Quarterback';const before=JSON.stringify(g);g.rng=()=>assert.fail('booth used gameplay RNG');
 const show=giveBoothVoice(pregameReport(g.teams,g.match),new BoothVoices({seed:3}));assert.match(show.segments[0].al,/Chosen Quarterback/);
 for(const s of show.segments){assert.deepEqual(s.turns.slice(0,4).map(t=>t.speaker),s.sideline?['al','casey','john']:['al','john','al','john']);assert.ok(s.turns.every(t=>!/[{}]|undefined|NaN/.test(t.text)));const roles=new Set();for(let t=0;t<broadcastBeat(s,0).duration;t+=.5)roles.add(broadcastBeat(s,t).index);assert.equal(roles.size,s.turns.length);}
 assert.equal(JSON.stringify(g),before);
});
test('hosts gesture, listeners nod, and reduced motion freezes every pose',()=>{
 assert.equal(boothPose('john',true,'point',1).column,2);assert.equal(boothPose('john',true,'big',1).column,3);
 assert.equal(boothPose('al',false,'talk',1).column,0);assert.deepEqual(boothPose('john',true,'point',1,false),boothPose('john',true,'point',20,false));
 assert.notDeepEqual(boothPose('al',false,'talk',.3),boothPose('al',false,'talk',4));
 const variants=['explain','lean','nod','chuckle','sweep'].map(p=>[.5,1.8,3].map(t=>boothPose('john',true,p,t)));
 assert.equal(new Set(variants.map(v=>JSON.stringify(v))).size,5);
 for(const pose of ['talk','explain','lean','nod','chuckle','sweep','point','big'])for(const active of [true,false])assert.deepEqual(boothPose('al',active,pose,1,false),{column:0,bob:0,lean:0});
 assert.notDeepEqual(boothPose('al',true,'talk',1,true,0),boothPose('al',true,'talk',1,true,1));
});
test('postgame has detached final statistics, preserves first-half clips, and includes late-game footage',()=>{
 const g=game(),t=new ReplayTape();
 for(const quarter of [2,4]){g.beginDrive(0,25);g.quarter=quarter;g.choose('dive');g.snap();g.events=[];for(let i=0;i<60;i++){g.carrier.y=25+i;t.observe(g,.05,[]);}g.finish(quarter===4?'touchdown':'tackle',quarter===4?100:40);t.observe(g,.05,g.events.splice(0));t.skipAll();}
 assert.ok(t.highlights.every(c=>c.quarter<=2));assert.ok(t.fullHighlights.some(c=>c.quarter===4));
 const before=JSON.stringify(g),report=postgameReport(g,t.fullHighlights),show=giveBoothVoice(report,new BoothVoices({seed:1}));
 assert.equal(report.mode,'postgame');assert.ok(show.segments.some(s=>s.clip?.quarter===4));assert.equal(JSON.stringify(g),before);
 assert.equal(report.box[0].rushYards,g.box[0].rushYards);g.box[0].rushYards=999;assert.notEqual(report.box[0].rushYards,999);assert.ok(show.segments.every(s=>!s.al.includes('second-half kickoff')));
});

test('music scene routing identifies the actual broadcast and holds the current playlist during football',()=>{
 const s={musicMode:'broadcast'};
 assert.equal(musicPolicy(s,null).scene,'menu');
 for(const scene of ['pregame','halftime','postgame'])assert.equal(musicPolicy(s,{phase:'call'},{broadcast:scene}).scene,scene);
 assert.equal(musicPolicy(s,{phase:'final'}).scene,'postgame');assert.equal(musicPolicy(s,{phase:'live'}).scene,null);
 assert.equal(musicPolicy(s,{phase:'live'}).background,false);
});
