import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../../daily_flyer/themes/pocket_gridiron_assets/engine.js';
import {DECADE_TEAMS,decadeTeam} from '../../daily_flyer/themes/pocket_gridiron_assets/decades.js';
import {athleticSpeed,coverageLane} from '../../daily_flyer/themes/pocket_gridiron_assets/conditioning.js';
import {checkContactInjury,injuryChance} from '../../daily_flyer/themes/pocket_gridiron_assets/injuries.js';
import {PLAYS,DEFENSE,routeFor} from '../../daily_flyer/themes/pocket_gridiron_assets/plays.js';
import {seededRandom} from '../../daily_flyer/themes/pocket_gridiron_assets/rules.js';
import {halftimeReport} from '../../daily_flyer/themes/pocket_gridiron_assets/match.js';
import {halftimeBroadcast} from '../../daily_flyer/themes/pocket_gridiron_assets/broadcast.js';
import {giveBoothVoice,BoothVoices} from '../../daily_flyer/themes/pocket_gridiron_assets/booth-lines.js';
import {coachInterview} from '../../daily_flyer/themes/pocket_gridiron_assets/coach-interview.js';
import {commercialFor,COMMERCIALS} from '../../daily_flyer/themes/pocket_gridiron_assets/commercials.js';
const make=(options={})=>new Game(decadeTeam('D1980'),decadeTeam('D2020'),'pro',seededRandom(371),options);
const run=g=>{g.beginDrive(0,30);g.choose('dive');g.snap();return g;};
const advance=(g,p,seconds)=>{let yards=0;for(let i=0;i<seconds*20;i++){p.x=26;p.y=30;p.pace=1;g.move(p,0,1,p.speed,.05);yards+=p.y-30;}return yards;};

test('new games field eleven distinct athletes and explicit seven-player games remain available',()=>{
 for(const [options,count] of [[{},11],[{format:7},7]]){const g=make(options);for(const unit of [g.players,g.defenders]){assert.equal(unit.length,count);assert.equal(new Set(unit.map(p=>p.id)).size,count);}run(g);assert.equal(g.players.length,count);assert.equal(g.defenders.length,count);}
});
test('all eight decades have complete lineups, unique identities and distinct legal era books',()=>{
 assert.deepEqual(DECADE_TEAMS.map(t=>t.year),[1950,1960,1970,1980,1990,2000,2010,2020]);const books=[];
 for(const entry of DECADE_TEAMS){const t=decadeTeam(entry.id),g=new Game(t,decadeTeam('D2020'),'pro',seededRandom(5));
  assert.ok(t.roster.length>=33);assert.equal(new Set(t.roster.map(p=>p.id)).size,t.roster.length);
  for(const p of t.roster)for(const k of ['speed','power','acceleration','endurance','durability'])assert.ok(p[k]>=40&&p[k]<=99,`${p.name} ${k}`);
  for(const id of t.profile.offense.plays)assert.ok(PLAYS.some(p=>p.id===id),id);for(const id of t.profile.defense.plays)assert.ok(DEFENSE.some(p=>p.id===id),id);
  assert.equal(g.offensePlays.length,t.profile.offense.plays.length);books.push(g.offensePlays.map(p=>p.id).join(','));
  for(const call of g.offensePlays){g.beginDrive(0,30);g.choose(call.id);for(const slot of [2,3,4]){const p=g.players[slot],q=routeFor(call,p,0,g.spot);assert.ok(Math.hypot(q.x-p.x,q.y-p.y)<.001,`${entry.id} ${call.id} receiver ${slot}`);}}
 }
 assert.equal(new Set(books).size,8);assert.ok(!decadeTeam('D1950').profile.offense.plays.some(id=>id.startsWith('pistol')));
 const eighties=decadeTeam('D1980');assert.equal(eighties.offense[1].name,'Bo Jackson');assert.equal(eighties.specialists.kr.name,'Bo Jackson');assert.ok(eighties.roster.some(p=>p.name==='Walter Payton'));assert.ok(eighties.roster.some(p=>p.name==='Eric Dickerson'));
});
test('sustained possession drains more energy than pursuit, and elite endurance preserves late speed',()=>{
 const g=run(make()),p=g.carrier,d=g.defenders[4];p.endurance=d.endurance=80;advance(g,p,2);advance(g,d,2);assert.ok(Math.abs(p.energy-d.energy)<.01);
 advance(g,p,6);advance(g,d,6);assert.ok(p.energy<d.energy-25);
 const tired=advance(g,p,1),fresh=run(make()),elite=fresh.carrier;elite.endurance=99;elite.speed=p.speed;advance(fresh,elite,8);assert.ok(elite.energy>p.energy+25);assert.ok(advance(fresh,elite,1)>tired);
});
test('speed and endurance can preserve an elite breakaway against a slower pursuer',()=>{
 const g=run(make()),bo=g.carrier,d=g.defenders[0];assert.equal(bo.name,'Bo Jackson');bo.speed=athleticSpeed(99);bo.endurance=99;d.speed=athleticSpeed(60);d.endurance=80;
 assert.ok(advance(g,bo,10)>advance(g,d,10)+3);
});
test('stamina stays with the athlete across possession changes and stops with the game',()=>{
 const g=run(make()),runner=g.carrier;advance(g,runner,6);const energy=runner.energy;g.startFumble(g.defenders[0]);g.recoverFumble(runner);assert.equal(g.stamina,energy);
 g.paused=true;for(let i=0;i<80;i++)g.tick(.05,{x:0,y:1});assert.equal(g.stamina,energy);
});
test('kick coverage fans out into lanes before the catch, including outside containment',()=>{
 const g=make(),target={x:26.5,y:12},lanes=g.defenders.map(d=>coverageLane(d,target,1));
 assert.ok(new Set(lanes.map(p=>p.x)).size>=9);assert.ok(Math.min(...lanes.map(p=>p.x))<14);assert.ok(Math.max(...lanes.map(p=>p.x))>39);assert.ok(lanes[6].y>lanes[0].y+15);
});
test('rare injuries substitute for a few snaps, restore the athlete, and leave saved rosters intact',()=>{
 const g=run(make()),original=g.teams[0].offense[1];g.healthPlay=6;g.rng=()=>0;checkContactInjury(g,g.defenders[0]);assert.equal(g.injuries.length,1);
 const injury=g.injuries[0];assert.equal(injury.id,original.id);assert.ok(injury.plays>=2&&injury.plays<=4);
 for(let i=0;i<injury.plays;i++){g.beginDrive(0,30);g.choose('dive');assert.notEqual(g.players[1].id,original.id);assert.equal(new Set(g.players.map(p=>p.id)).size,11);g.snap();}
 g.beginDrive(0,30);g.choose('dive');assert.equal(g.players[1].id,original.id);g.snap();assert.equal(injury.returned,true);assert.equal(g.teams[0].offense[1],original);
 checkContactInjury(g,g.defenders[0]);assert.equal(g.injuries.length,1);
 g.healthPlay=g.lastInjuryPlay+18;checkContactInjury(g,g.defenders[0]);assert.equal(g.injuries.length,2);
 g.healthPlay+=30;checkContactInjury(g,g.defenders[0]);assert.equal(g.injuries.length,2);
});
test('injury checks cannot fire repeatedly on the same snap or with injuries disabled',()=>{
 const g=run(make());g.healthPlay=6;let rolls=0;g.rng=()=>{rolls++;return 1;};checkContactInjury(g,g.defenders[0]);const first=rolls;checkContactInjury(g,g.defenders[0]);assert.equal(rolls,first);
 const disabled=run(make({injuries:false}));disabled.healthPlay=10;disabled.rng=()=>{throw Error('Disabled injuries rolled');};checkContactInjury(disabled,disabled.defenders[0]);
 assert.ok(injuryChance({durability:99,energy:100})<injuryChance({durability:65,energy:20}));assert.ok(injuryChance({durability:40,energy:0})<.02);
});
test('injured defenders are absent from base, extra 11v11 and special-team formations',()=>{
 const g=run(make());g.healthPlay=7;const defender=g.defenders[0];g.injuries.push({id:defender.id,name:defender.name,team:1,until:11,backup:'Backup'});
 g.setFormation();assert.ok(!g.defenders.some(p=>p.id===defender.id));assert.equal(new Set(g.defenders.map(p=>p.id)).size,11);
 g.beginKick('punt',1,40);assert.ok(!g.defenders.some(p=>p.id===defender.id));assert.equal(new Set(g.defenders.map(p=>p.id)).size,11);
});
test('halftime interview reflects the actual score, running game, injuries and weather snapshot',()=>{
 const g=make({weather:'snow'});g.scores=[14,7];g.box[0].rushYards=87;g.box[0].passYards=20;g.injuries=[{id:'x',name:'Bo Jackson',team:0,returned:false}];
 const report=halftimeBroadcast(halftimeReport(g)),s=coachInterview(report),words=s.turns.map(t=>t.text).join(' ');
 assert.match(words,/leads by 7/);assert.match(words,/87 rushing yards/);assert.match(words,/Bo Jackson/);assert.match(words,/snow|footing/i);assert.match(s.tag,/FICTION/);
 g.box[0].rushYards=200;assert.equal(report.box[0].rushYards,87);
 const voiced=giveBoothVoice(report,new BoothVoices({seed:1}));assert.equal(voiced.segments.filter(s=>s.interview).length,1);assert.ok(voiced.segments.some(s=>s.turns?.some(t=>t.speaker==='coach')));assert.equal(coachInterview({...report,mode:'pregame'}),null);
});
test('fictional timeout ads rotate and a paused timeout leaves the football clock unchanged',()=>{
 assert.equal(new Set([1,2,3,4].map(q=>commercialFor(q).brand)).size,COMMERCIALS.length);
 const g=make({tvTimeouts:true});g.phase='tv_timeout';g.tvLeft=6;g.paused=true;const clock=g.clock;g.tick(.05);assert.equal(g.tvLeft,6);assert.equal(g.clock,clock);
 g.paused=false;g.tick(.05);assert.ok(g.tvLeft<6);assert.equal(g.clock,clock);
});
