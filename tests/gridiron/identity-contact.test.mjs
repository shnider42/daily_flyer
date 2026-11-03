import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {Game,PLAYS,DEFENSE} from '../../daily_flyer/themes/pocket_gridiron_assets/engine.js';
import {buildTeam,TEAMS,rate} from '../../daily_flyer/themes/pocket_gridiron_assets/roster.js';
import {beginContact,tickContact,contactOdds,armBreak,resetContact,chooseMove} from '../../daily_flyer/themes/pocket_gridiron_assets/contact.js';
import {showOffensiveRoutes,coachText,suggestions,hitDefender} from '../../daily_flyer/themes/pocket_gridiron_assets/presentation.js';
import {primaryCommand} from '../../daily_flyer/themes/pocket_gridiron_assets/controls.js';
import {seededRandom} from '../../daily_flyer/themes/pocket_gridiron_assets/rules.js';
import {StadiumAudio} from '../../daily_flyer/themes/pocket_gridiron_assets/audio.js';
const data=JSON.parse(fs.readFileSync(new URL('../../daily_flyer/themes/pocket_gridiron_assets/rosters.json',import.meta.url)));
const team=abbr=>buildTeam(abbr,data);
function make(side=0,seed=21){const g=new Game(team('NE'),team('BUF'),'pro',seededRandom(seed));g.beginDrive(side,25);g.choose(side===0?'dive':'zone');g.snap(side);g.carrier.x=26;g.carrier.y=40;g.liveTime=1;for(const d of g.defenders){d.x=1;d.y=85;d.stun=0;}const d=g.defenders[4];d.x=27;d.y=41;return g;}

test('all 32 teams have valid distinct books and available signature calls',()=>{
 const books=new Set();for(const t of TEAMS){const g=new Game(team(t.abbr),team(t.abbr==='BUF'?'NE':'BUF'));g.beginDrive(0,25);assert.ok([32,33].includes(g.offensePlays.length));assert.equal(g.defensePlays.length,12);books.add(g.offensePlays.map(p=>p.id).join(','));for(const id of g.teams[0].profile.offense.signature)assert.ok(g.offensePlays.some(p=>p.id===id));for(const p of g.offensePlays){assert.equal(g.choose(p.id),true);g.snap();for(let i=0;i<8;i++)g.tick(.05);assert.ok(g.players.every(p=>Number.isFinite(p.x)));g.beginDrive(0,25);}}
 assert.equal(books.size,5);assert.equal(PLAYS.length,48);assert.equal(DEFENSE.length,18);
});
test('CPU calls stay in its own book and illegal human calls cannot replace a ready play',()=>{
 const g=make();g.beginDrive(0,25);g.choose('keeper');assert.equal(g.choose('stretch'),false);assert.equal(g.play,'keeper');for(let i=0;i<500;i++){const id=g.selectDefense();assert.ok(g.defensePlays.some(p=>p.id===id));}g.beginDrive(1,25);for(let i=0;i<500;i++){const id=g.selectOffense();assert.ok(g.offensePlays.some(p=>p.id===id));}
});
test('signature keeper uses the QB and run blockers; designed runs are not sacks',()=>{
 const g=make();g.beginDrive(0,25);g.choose('keeper');g.snap();assert.equal(g.carrier,g.players[0]);g.finish('tackle',23);assert.doesNotMatch(g.lastResult,/Sacked/);
});
test('ratings are bounded, labeled and retained across team changes and refresh builds',()=>{
 const required=['acceleration','agility','balance','catching','routeRunning','ballSecurity','armStrength','composure','passBlock','runBlock','tackling','coverage','recognition','shed','kickPower','kickAccuracy','hangTime'];
 for(const p of data.players.map(rate)){for(const k of required)assert.ok(p[k]>=40&&p[k]<=99,`${p.name} ${k}`);assert.ok(p.ratingSource&&p.ratingDate);}
 const a=rate({name:'Josh Allen',pos:'QB',team:'BUF'}),b=rate({name:'Josh Allen',pos:'QB',team:'NE'});assert.equal(a.armStrength,b.armStrength);assert.equal(a.ratingSource,'Individual arcade estimate');
 assert.notEqual(rate({name:'Josh Allen',pos:'QB'}).armStrength,rate({name:'Tua Tagovailoa',pos:'QB'}).armStrength);
});
test('the defense never receives offensive diagrams or secret-call coaching at any guidance level',()=>{
 const g=make(1);g.phase='ready';for(const level of ['simple','moderate','expert']){g.play='slants';const before=coachText(g,level),picks=suggestions(g,g.humanPlays).map(p=>p.id);for(const play of PLAYS){g.play=play.id;assert.equal(showOffensiveRoutes(g),false);assert.equal(coachText(g,level).replace(g.formation.name,'FORMATION'),before.replace('Singleback','FORMATION'));assert.deepEqual(suggestions(g,g.humanPlays).map(p=>p.id),picks);}}
 g.offense=0;assert.equal(showOffensiveRoutes(g),true);g.phase='live';assert.equal(showOffensiveRoutes(g),false);
});
test('fourth-down guidance protects possession and early-down suggestions retain a run choice',()=>{
 const g=make();g.phase='call';g.down=4;assert.match(coachText(g,'simple'),/keep possession/);assert.doesNotMatch(coachText(g,'simple'),/next down/);g.down=1;assert.ok(suggestions(g,g.humanPlays).some(p=>p.kind==='run'));assert.equal(coachText(g,'expert'),'');
});
test('named, next and nearest selection have stable separate behavior, including a ball in flight',()=>{
 const g=make(1);g.phase='ready';assert.equal(g.selectDefender(6),true);assert.equal(g.controlled,g.defenders[6]);g.choose('man');assert.equal(g.selected,6);g.switchDefender('cycle');assert.equal(g.selected,0);g.defenders[3].x=g.carrier.x;g.defenders[3].y=g.carrier.y;g.switchDefender();assert.equal(g.selected,3);g.switchDefender();assert.equal(g.selected,3);
 g.phase='live';g.pass={x:10,y:60};g.defenders[5].x=10;g.defenders[5].y=60;g.switchDefender();assert.equal(g.selected,5);g.paused=true;assert.equal(g.selectDefender(0),false);g.paused=false;g.offense=0;assert.equal(g.selectDefender(0),false);
});
test('field selection uses closest visible hit within a generous touch radius',()=>{
 const p=[{index:1,x:100,y:200},{index:4,x:140,y:200}];assert.equal(hitDefender(p,123,201),4);assert.equal(hitDefender(p,76,200),1);assert.equal(hitDefender(p,50,50),null);
});
test('contact move follows steering and impact angle',()=>{
 const g=make(),d=g.defenders[4];g.carrier.agility=95;g.carrier.power=80;assert.equal(chooseMove(g,d,{x:1,y:0}),'spin');d.x=30;d.y=40;assert.equal(chooseMove(g,d,{x:0,y:1}),'stiff');d.x=26;d.y=42;assert.equal(chooseMove(g,d,{x:0,y:1}),'truck');
});
test('rating matchups, defenders in traffic, balance and fatigue affect the same contact contest',()=>{
 const g=make(),d=g.defenders[4];g.carrier.power=g.carrier.balance=98;d.tackling=d.power=60;const strong=contactOdds(g,d,'truck');g.carrier.power=65;assert.ok(contactOdds(g,d,'truck').chance<strong.chance);g.carrier.power=98;g.offBalance=.3;assert.ok(contactOdds(g,d,'truck').chance<strong.chance);g.offBalance=0;
 const help=g.defenders[5];help.x=27;help.y=42;assert.ok(contactOdds(g,d,'truck').chance<strong.chance);help.blocked=true;assert.equal(contactOdds(g,d,'truck').chance,strong.chance);g.players[5].x=26;g.players[5].y=40;assert.equal(contactOdds(g,d,'truck').chance,strong.chance);g.stamina=20;assert.ok(contactOdds(g,d,'truck').chance<strong.chance);
 assert.ok(contactOdds(g,d,'spin').risk>contactOdds(g,d,null).risk);
});
test('a clean catch stays balanced; a difficult catch temporarily reduces balance',()=>{
 const g=make(),p=g.players[2];g.pass={x:p.x,y:p.y,tipped:false};g.stamina=32;g.burstLeft=.5;g.catchPass(p);assert.equal(g.offBalance,0);assert.equal(g.stamina,100);assert.equal(g.burstLeft,0);g.pass={x:p.x,y:p.y,tipped:true};g.catchPass(p);assert.ok(g.offBalance>0);
});
test('one contact accepts one commitment and one outcome roll, regardless of repeated taps',()=>{
 const g=make(),d=g.defenders[4];beginContact(g,d);assert.equal(primaryCommand(g),'break');assert.equal(g.breakTackle({x:0,y:1}),true);const stamina=g.stamina;for(let i=0;i<20;i++)assert.equal(g.breakTackle(),false);assert.equal(g.stamina,stamina);let rolls=0;g.rng=()=>{rolls++;return .2;};tickContact(g,.05);assert.equal(rolls,1);tickContact(g,.05);assert.equal(rolls,1);
});
test('burst alone never grants a free escape; waiting resolves one tackle and respects pause',()=>{
 const g=make(),d=g.defenders[4];g.burst();beginContact(g,d);g.rng=()=>.9;g.paused=true;g.tick(.05);assert.equal(g.contact.left,.24);g.paused=false;for(let i=0;i<6;i++)g.tick(.05);assert.equal(g.phase,'dead');assert.equal(g.stats.brokenTackles,0);
});
test('escaping one defender leaves other defenders able to tackle',()=>{
 const g=make(),d=g.defenders[4],help=g.defenders[5];help.x=26;help.y=41;beginContact(g,d);g.breakTackle();g.rng=()=>.1;tickContact(g,.05);assert.equal(g.phase,'live');assert.ok(d.stun>0);assert.equal(help.stun,0);assert.equal(g.stats.brokenTackles,1);beginContact(g,help);g.rng=()=>.9;tickContact(g,.3);assert.equal(g.phase,'dead');
});
test('a risky failed move can fumble and resets pending contact without a second result',()=>{
 const g=make(),d=g.defenders[4];beginContact(g,d);g.breakTackle();g.rng=()=>0;tickContact(g,.05);assert.equal(g.phase,'fumble');assert.equal(g.contact,null);assert.equal(g.breakArm,null);assert.equal(g.stats.fumbles,1);tickContact(g,.1);assert.equal(g.stats.fumbles,1);
});
test('CPU uses the same move cost and odds, and resets contact on turnover',()=>{
 const a=make(0),b=make(1);b.carrier={...a.carrier};b.defenders[4]={...a.defenders[4]};assert.deepEqual(contactOdds(a,a.defenders[4],'truck'),contactOdds(b,b.defenders[4],'truck'));
 beginContact(b,b.defenders[4]);assert.ok(b.breakArm);assert.equal(b.stamina,76);b.defenders[4].y=45;b.startTurnover(b.defenders[4],'interception');assert.equal(b.contact,null);assert.equal(b.breakArm,null);assert.equal(b.stamina,100);
});
test('acceleration and special-team ratings change execution without changing input rules',()=>{
 const g=make(),a=g.players[2],b=g.players[3];for(const p of [a,b]){p.x=20;p.y=50;p.pace=.55;}a.acceleration=99;b.acceleration=40;g.move(a,0,1,7,.05);g.move(b,0,1,7,.05);assert.ok(a.y>b.y);
 g.beginKick('punt',0,40);g.defenders[6].kickPower=99;const long=g.kickTarget(.7,0);g.defenders[6].kickPower=50;assert.ok(g.kickTarget(.7,0).y>long.y);
});
test('sound preferences keep effects and music independent and tolerate no audio device',async()=>{
 const a=new StadiumAudio({effects:false,music:true,volume:.3});assert.equal(a.settings.effects,false);assert.equal(a.settings.music,true);await a.unlock();a.event({type:'result',text:'TOUCHDOWN!'});a.update(null,true);assert.equal(a.settings.volume,.3);
});
