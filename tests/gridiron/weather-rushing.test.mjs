import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Game} from '../../daily_flyer/themes/pocket_gridiron_assets/engine.js';
import {buildTeam,TEAMS} from '../../daily_flyer/themes/pocket_gridiron_assets/roster.js';
import {HISTORIC_TEAMS,historicTeam} from '../../daily_flyer/themes/pocket_gridiron_assets/history.js';
import {createWeather,WEATHER,venueFor,weatherWeights,effects,windFor,kickConditions,weatherAdvice,weatherMove} from '../../daily_flyer/themes/pocket_gridiron_assets/weather.js';
import {weatherSegment} from '../../daily_flyer/themes/pocket_gridiron_assets/weather-presentation.js';
import {goalResult,goalWindow} from '../../daily_flyer/themes/pocket_gridiron_assets/placekicks.js';
import {passPlacement} from '../../daily_flyer/themes/pocket_gridiron_assets/passing.js';
import {contactOdds,armBreak} from '../../daily_flyer/themes/pocket_gridiron_assets/contact.js';
import {runProbability,runLandmark,cpuRunTarget} from '../../daily_flyer/themes/pocket_gridiron_assets/rushing.js';
import {seededRandom} from '../../daily_flyer/themes/pocket_gridiron_assets/rules.js';
import {pregameReport,halftimeBroadcast,postgameReport} from '../../daily_flyer/themes/pocket_gridiron_assets/broadcast.js';
import {halftimeReport} from '../../daily_flyer/themes/pocket_gridiron_assets/match.js';
import {BoothVoices,giveBoothVoice} from '../../daily_flyer/themes/pocket_gridiron_assets/booth-lines.js';
import {replayFrame} from '../../daily_flyer/themes/pocket_gridiron_assets/replay.js';
const data=JSON.parse(fs.readFileSync(new URL('../../daily_flyer/themes/pocket_gridiron_assets/rosters.json',import.meta.url)));
const home=buildTeam('NE',data),away=buildTeam('BUF',data);
const make=(kind='clear',options={})=>new Game(home,away,'pro',seededRandom(27271),{weather:{selection:kind,seed:731,season:'winter'},...options});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function setWind(g,x,y){g.weather.wind={x,y};g.weather.gust=0;}
test('all current and historic home teams have an explicit venue and valid seasonal weights',()=>{
 assert.equal(Object.keys(WEATHER).length,5);
 for(const t of [...TEAMS,...HISTORIC_TEAMS.map(t=>historicTeam(t.id))])for(const season of ['early','autumn','winter']){
  const v=venueFor(t),weights=weatherWeights(v,season);assert.notEqual(v.name,'PGI Field');assert.equal(Object.values(weights).reduce((a,b)=>a+b,0),100);assert.ok(Object.values(weights).every(n=>n>=0));
 }
 assert.equal(venueFor('OAK78').city,'Oakland, California');assert.equal(venueFor('NE16','SBLI').roof,'fixed');assert.equal(venueFor('MIN').roof,'fixed');assert.equal(venueFor('BUF').roof,'open');
});
test('home-field probabilities respond to season and climate without pretending to be live weather',()=>{
 const b=venueFor('BUF'),m=venueFor('MIA'),s=venueFor('SEA');
 assert.equal(weatherWeights(b,'early').snow,0);assert.ok(weatherWeights(b,'winter').snow>weatherWeights(b,'autumn').snow);assert.equal(weatherWeights(m,'winter').snow,0);
 assert.ok(weatherWeights(m,'early').heat>weatherWeights(b,'early').heat);assert.ok(weatherWeights(s).rain>weatherWeights(venueFor('SF')).rain);
 const counts={};for(let seed=1;seed<=3000;seed++){const w=createWeather('BUF',{selection:'auto',season:'winter',seed});counts[w.kind]=(counts[w.kind]||0)+1;}
 assert.ok(counts.snow>700&&counts.snow<1100);assert.equal(counts.heat,undefined);
});
test('weather generation is deterministic and independent from football randomness',()=>{
 assert.deepEqual(createWeather('NE',{selection:'auto',seed:44}),createWeather('NE',{selection:'auto',seed:44}));
 let callsA=0,callsB=0;new Game(home,away,'pro',()=>{callsA++;return .5;},{weather:'clear'});new Game(home,away,'pro',()=>{callsB++;return .5;},{weather:'snow'});assert.equal(callsA,callsB);
 const w=createWeather('NE','rain'),g=make('clear',{weather:w});g.weather.kind='snow';assert.equal(w.kind,'rain');
});
test('closed roofs exclude all adverse weather and SoFi excludes precipitation but admits reduced wind',()=>{
 for(const team of ['MIN','DET','LV','NO','ARI','ATL','DAL','HOU','IND'])for(const kind of Object.keys(WEATHER)){
  const w=createWeather(team,{selection:kind,seed:17});assert.equal(w.kind,'clear');assert.equal(w.roofClosed,true);assert.deepEqual(w.wind,{x:0,y:0});
 }
 assert.equal(createWeather('LA','rain').kind,'clear');assert.equal(createWeather('LAC','snow').kind,'clear');assert.equal(createWeather('LA','wind').kind,'wind');
 assert.equal(createWeather('MIN',{selection:'snow',practice:true}).kind,'snow');
});
test('field wind reverses with possession and changing ends, and pauses freeze it',()=>{
 const g=make('wind');setWind(g,20,10);g.offense=0;g.quarter=1;assert.deepEqual(windFor(g),{x:20,y:10,mph:Math.hypot(20,10)});
 g.offense=1;assert.equal(windFor(g).x,-20);g.quarter=2;assert.equal(windFor(g).x,20);g.paused=true;const before=g.time;g.tick(.05);assert.equal(g.time,before);
});
test('pass preview and the released pass share weather drift; longer flights drift farther',()=>{
 const g=make('wind');g.beginDrive(0,30);g.choose('verts');g.snap();setWind(g,20,8);g.rng=()=>.5;
 const p=g.players[2];p.x=20;p.y=52;const aim=passPlacement(g,p);assert.ok(aim.drift.x>0&&aim.drift.y>0);g.throwTo(0);near(g.pass.tx,aim.x);near(g.pass.ty,aim.y);
 const calm=make();calm.beginDrive(0,30);calm.choose('verts');calm.snap();calm.players[2].x=20;calm.players[2].y=52;assert.ok(aim.x>passPlacement(calm,calm.players[2]).x);
});
test('field-goal wind shifts the visible green window and the same window determines success',()=>{
 const kicker=home.specialists.kicker,c={wind:{x:22,y:-18},rangeFactor:.96,accuracyFactor:.92},w=goalWindow(kicker,45,c);
 assert.ok(w.center<.5);assert.ok(w.range<goalWindow(kicker,45).range);assert.equal(goalResult(kicker,45,1,w.center,c).good,true);assert.equal(goalResult(kicker,45,1,w.high+.01,c).reason,'WIDE RIGHT');
 const g=make('wind');g.beginGoal('fieldgoal',0,72);setWind(g,22,-18);g.kickAction();const locked=kickConditions(g);g.time+=20;setWind(g,-22,18);assert.deepEqual(kickConditions(g),locked);g.launchGoal(1,goalWindow(g.players[0],45,locked).center);assert.equal(g.special.result.good,true);
});
test('punt preview and flight agree; wind is oriented to the receiving field view',()=>{
 const g=make('wind');g.beginKick('punt',0,45);setWind(g,18,16);g.kickAction();g.special.power=.65;
 const target=g.kickTarget(.65,0);g.kickAction();near(g.special.ball.tx,target.x);near(g.special.ball.ty,target.y);
 const calm=make();calm.beginKick('punt',0,45);const normal=calm.kickTarget(.65,0);assert.ok(target.x<normal.x);assert.ok(target.y<normal.y);
});
test('rain and snow slow both teams without a random slip or a change to ratings',()=>{
 for(const kind of ['clear','rain','snow']){
  const g=make(kind);g.beginDrive(0,30);g.choose('dive');g.snap();
  for(const p of [g.players[5],g.defenders[4]]){const old=p.speed;p.x=20;p.y=40;p.pace=1;g.move(p,0,1,10,.1);near(p.y-40,effects(g.weather).speed);assert.equal(p.speed,old);}
  const p=g.players[2];p.pace=1;weatherMove(g,p,1,0,.05);weatherMove(g,p,-1,0,.05);if(kind!=='clear')assert.ok(p.pace<1);else assert.equal(p.pace,1);
 }
});
test('wet grip adds a small bounded contact risk, not a guaranteed turnover',()=>{
 const dry=make(),wet=make('rain');for(const g of [dry,wet]){g.beginDrive(0,30);g.choose('dive');g.snap();}
 const a=contactOdds(dry,dry.defenders[0],null),b=contactOdds(wet,wet.defenders[0],null);near(b.risk-a.risk,.0035);assert.ok(b.risk<.03);
});
test('heat charges the same stamina costs to human and CPU runners and slows recovery',()=>{
 const g=make('heat');g.beginDrive(0,30);g.choose('dive');g.snap();g.burst();near(g.stamina,85);
 const cpu=make('heat');cpu.beginDrive(1,30);cpu.play='dive';cpu.setFormation();cpu.phase='ready';cpu.snap(1);cpu.burstForRunner();near(cpu.stamina,85);
 cpu.defenders[0].x=cpu.carrier.x;cpu.defenders[0].y=cpu.carrier.y+2;cpu.burstCooldown=0;armBreak(cpu,{x:0,y:1});near(cpu.stamina,55);
});
test('weather appears in pregame, halftime, postgame, voiced dialogue and recorded film',()=>{
 const g=make('snow'),reports=[pregameReport(g.teams,g.match,g.weather),halftimeBroadcast(halftimeReport(g)),postgameReport(g)];
 for(const report of reports){assert.ok(report.segments.some(s=>s.topic==='weather'));const voiced=giveBoothVoice(report,new BoothVoices({seed:9}));const words=voiced.segments.flatMap(s=>s.turns||[]).map(t=>t.text).join(' ');assert.match(words,/snow|footing/i);assert.doesNotMatch(words,/undefined|NaN/);}
 const f=replayFrame(g,1);assert.equal(f.weather.kind,'snow');assert.equal(f.weatherTime,g.time);
});
test('all weather explains gameplay at each guidance level, including roof protection',()=>{
 for(const kind of Object.keys(WEATHER))for(const level of ['simple','moderate','expert'])assert.ok(weatherAdvice(createWeather('NE',kind),level).length>20);
 assert.match(weatherSegment(createWeather('MIN','snow')).al,/roof closed/);
});
test('CPU run-pass choice is independent of book size and reacts to football situation',()=>{
 const g=make();g.beginDrive(1,30);const base=runProbability(g);const book=g.offensePlays;Object.defineProperty(g,'offensePlays',{get:()=>[...book,...Array(40).fill(book.find(p=>p.kind==='pass'))]});
 assert.ok(g.offensePlays.length>book.length);assert.equal(runProbability(g),base);
 g.down=3;g.target=32;assert.ok(runProbability(g)>base);g.target=45;assert.ok(runProbability(g)<base);
 g.quarter=4;g.clock=8;g.scores=[7,0];const trailing=runProbability(g);g.scores=[0,7];assert.ok(runProbability(g)>trailing);
});
test('CPU regularly calls runs at every difficulty and reduces them on third-and-long',()=>{
 for(const difficulty of ['rookie','pro','legend']){const g=make('clear');g.difficulty=difficulty;g.beginDrive(1,30);g.rng=seededRandom(7331);let early=0,long=0;
  for(let i=0;i<1500;i++){g.down=1;g.target=40;const a=g.selectOffense();early+=g.offensePlays.find(p=>p.id===a).kind==='run';g.down=3;g.target=44;const b=g.selectOffense();long+=g.offensePlays.find(p=>p.id===b).kind==='run';}
  assert.ok(early/1500>.30&&early/1500<.65);assert.ok(long<early*.75);
 }
});
test('outside run landmark keeps the runner behind the line until reaching the edge',()=>{
 const g=make();g.beginDrive(0,30);g.choose('sweep');g.snap();const edge=runLandmark(g);assert.equal(edge.stage,'edge');assert.ok(edge.x>35);assert.ok(edge.y<g.spot);
 g.carrier.x=45;assert.equal(runLandmark(g).stage,'upfield');
});
test('outside runners continue toward the edge instead of choosing a stationary safe spot',()=>{
 for(const format of [7,11]){const g=make('clear',{format});g.beginDrive(1,30);g.play='sweep';g.phase='ready';g.setFormation();g.snap(1);g.liveTime=1;g.carrier.x=format===11?33:30;g.carrier.y=29.5;
  for(const d of g.defenders){d.x=2;d.y=90;}const q=cpuRunTarget(g);assert.ok(Math.hypot(q.x-g.carrier.x,q.y-g.carrier.y)>=4);
 }
});
test('recorded wind uses the replay world orientation and wet temperatures stay above freezing',()=>{
 const g=make('wind');g.offense=1;g.quarter=2;setWind(g,20,8);const f=replayFrame(g,1);assert.equal(f.weatherWind.x,-20);assert.equal(f.weatherWind.y,-8);
 for(let seed=1;seed<=30;seed++)assert.ok(createWeather('GB',{selection:'rain',season:'winter',seed}).temperature>=36);
});
test('all five conditions can complete 7-player and 11-player games with finite physics',()=>{
 for(const kind of Object.keys(WEATHER))for(const format of [7,11]){
  const g=make(kind,{format,playClock:true,tvTimeouts:true});let ticks=0;
  while(g.phase!=='final'&&ticks++<36000){
   if(g.phase==='halftime')g.resumeHalftime();if(g.phase==='tv_timeout')g.resumeTV();if(g.phase==='penalty')g.resolvePenalty(true);
   if(g.phase==='call')g.choose(g.userOffense?'slants':'zone');if(g.phase==='ready'&&g.userOffense)g.snap();
   if(g.phase==='kick_ready')g.kickAction();if(g.phase==='kick_charge'&&g.special.power>.86)g.kickAction();if(g.phase==='kick_accuracy'&&g.special.accuracy>=goalWindow(g.players[0],g.special.distance,kickConditions(g)).center)g.kickAction();
   if(g.canPass&&g.liveTime>1.5)g.throwTo(0);if(g.isLive)g.burst();g.tick(.05,{x:0,y:1});
   assert.ok([...g.players,...g.defenders].every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
  }
  assert.equal(g.phase,'final',`${kind} ${format}`);
 }
});
