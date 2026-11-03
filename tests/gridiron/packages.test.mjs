import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {primaryCommand} from '../../daily_flyer/themes/pocket_gridiron_assets/controls.js';
import {Game,PLAYS} from '../../daily_flyer/themes/pocket_gridiron_assets/engine.js';
import {PACKAGE_PLAYS} from '../../daily_flyer/themes/pocket_gridiron_assets/plays.js';
import {TEAMS,buildTeam} from '../../daily_flyer/themes/pocket_gridiron_assets/roster.js';
import {defensiveUnit,fakeRead,tendency,packageOf} from '../../daily_flyer/themes/pocket_gridiron_assets/packages.js';
import {seededRandom} from '../../daily_flyer/themes/pocket_gridiron_assets/rules.js';
import {bookPage,coachText} from '../../daily_flyer/themes/pocket_gridiron_assets/presentation.js';
import {ReplayTape,replayFrame} from '../../daily_flyer/themes/pocket_gridiron_assets/replay.js';
import {highlightFocus,halftimeBroadcast,pregameReport} from '../../daily_flyer/themes/pocket_gridiron_assets/broadcast.js';
import {halftimeReport} from '../../daily_flyer/themes/pocket_gridiron_assets/match.js';
import {BoothVoices,giveBoothVoice} from '../../daily_flyer/themes/pocket_gridiron_assets/booth-lines.js';
const data=JSON.parse(fs.readFileSync(new URL('../../daily_flyer/themes/pocket_gridiron_assets/rosters.json',import.meta.url)));
const make=(difficulty='pro',options={})=>new Game(buildTeam('NE',data),buildTeam('BUF',data),difficulty,seededRandom(18),options);
const coords=g=>g.players.map(p=>[p.x,p.y]);
test('every team has all twelve package calls; each package shares one actual alignment',()=>{
 for(const team of TEAMS){const g=new Game(buildTeam(team.abbr,data),buildTeam('BUF',data));g.beginDrive(0,25);for(const p of PACKAGE_PLAYS)assert.ok(g.offensePlays.some(q=>q.id===p.id));}
 const g=make();g.beginDrive(0,25);
 for(const id of ['singleback','pistol','bunch']){let shape;const plays=PACKAGE_PLAYS.filter(p=>p.formationId===id);assert.ok(plays.some(p=>p.kind==='run')&&plays.some(p=>p.playAction)&&plays.some(p=>p.kind==='pass'&&!p.playAction));
  for(const p of plays){assert.ok(g.choose(p.id));if(shape)assert.deepEqual(coords(g),shape);else shape=coords(g);for(const receiver of g.players.slice(2,5))if(p.kind==='pass'){const start=g.route(receiver,0);assert.equal(start.x,receiver.x);assert.ok(Math.abs(start.y-receiver.y)<=.5);}}
 }
});
test('CPU offense commits before the defensive book, and coverage changes never reroll its play',()=>{
 const g=make();let calls=0;g.selectOffense=()=>{calls++;return 'pistolpa';};g.beginDrive(1,25);assert.equal(calls,1);assert.equal(g.formation.name,'Pistol');
 for(const d of g.defensePlays){g.choose(d.id);assert.equal(g.play,'pistolpa');assert.equal(calls,1);assert.match(coachText(g,'moderate'),/Pistol is set/);assert.doesNotMatch(coachText(g,'moderate'),/seam|play.action/i);}
});
test('CPU defense responds only after the human call and cannot substitute between calls or downs',()=>{
 const g=make();let calls=0;g.selectDefense=()=>{calls++;assert.equal(g.play,'bunchpa');return 'zone';};g.beginDrive(0,25);assert.equal(calls,0);const ids=g.defenders.map(p=>p.id);
 g.choose('bunchpa');assert.equal(calls,1);assert.deepEqual(g.defenders.map(p=>p.id),ids);g.snap();g.finish('incomplete',25);g.next();assert.deepEqual(g.defenders.map(p=>p.id),ids);
});
test('all 32 rosters supply real distinct Base, Nickel and Heavy units',()=>{
 for(const meta of TEAMS){const team=buildTeam(meta.abbr,data),base=defensiveUnit(team),nickel=defensiveUnit(team,'nickel'),heavy=defensiveUnit(team,'heavy');
  for(const unit of [base,nickel,heavy]){assert.equal(new Set(unit.map(p=>p.id)).size,7);assert.ok(unit.every(p=>team.roster.some(q=>q.id===p.id)));}
  assert.ok(['CB','DB','S','FS','SS'].includes(nickel[3].pos),meta.abbr);assert.ok(['DL','DT','DE'].includes(heavy[2].pos),meta.abbr);assert.notDeepEqual(base.map(p=>p.id),nickel.map(p=>p.id));assert.notDeepEqual(base.map(p=>p.id),heavy.map(p=>p.id));
 }
});
test('personnel preference is queued for the next possession, while existing athlete ratings stay intact',()=>{
 const g=make('pro',{defensePackage:'nickel'});g.beginDrive(1,25);assert.equal(g.personnel,'nickel');const ids=g.defenders.map(p=>p.id);g.defensePreference='heavy';g.choose('man');g.beginDrive(1,30,2);assert.equal(g.personnel,'nickel');assert.deepEqual(g.defenders.map(p=>p.id),ids);g.beginDrive(0,25);g.beginDrive(1,25);assert.equal(g.personnel,'heavy');assert.notDeepEqual(g.defenders.map(p=>p.id),ids);
 for(const d of g.defenders)assert.equal(d.recognition,g.teams[0].roster.find(p=>p.id===d.id).recognition);
});
test('formation tendencies count snapped calls only, isolate teams/looks and remain bounded',()=>{
 const g=make();g.beginDrive(0,25);for(let i=0;i<4;i++)g.choose('sbpa');assert.deepEqual(g.formationHistory,[{},{}]);
 for(let i=0;i<30;i++){g.beginDrive(0,25);g.choose('sbzone');g.snap();}
 assert.equal(g.formationHistory[0].singleback.length,24);assert.equal(tendency(g.formationHistory[0].singleback).runs,24);assert.equal(g.formationHistory[0].pistol,undefined);assert.deepEqual(g.formationHistory[1],{});
 g.beginDrive(0,25);g.choose('sbpa');g.snap();assert.equal(g.playAction.seen.runs,24);assert.equal(g.playAction.seen.pa,0);assert.equal(tendency(g.formationHistory[0].singleback).pa,1);
});
test('fake credibility responds to run history, repeated fakes, difficulty and actual player/unit ratings',()=>{
 const args={defender:{recognition:80},qb:{composure:80,accuracy:80},rb:{agility:80},unitRecognition:80,slot:2},base=fakeRead(args);
 const runs=fakeRead({...args,seen:Array(8).fill('run')}),fakes=fakeRead({...args,seen:Array(8).fill('playaction')});assert.ok(runs.chance>base.chance&&base.chance>fakes.chance);
 const rookie=fakeRead({...args,difficulty:'rookie'}),legend=fakeRead({...args,difficulty:'legend'});assert.ok(rookie.chance>legend.chance&&rookie.duration>legend.duration);
 assert.ok(fakeRead({...args,defender:{recognition:99}}).chance<base.chance);assert.ok(fakeRead({...args,unitRecognition:99}).chance<base.chance);assert.ok(fakeRead({...args,qb:{composure:99,accuracy:99},rb:{agility:99}}).chance>base.chance);
});
test('the fake retains the football, blocks early throws, pauses and releases control without a second outcome roll',()=>{
 for(const dt of [.05,.01]){const g=make();g.beginDrive(0,25);g.choose('sbpa');let rolls=0;g.rng=()=>{rolls++;return .1;};g.snap();assert.equal(rolls,3);assert.equal(g.canPass,false);assert.equal(primaryCommand(g),null);const stamina=g.stamina;g.burst();assert.equal(g.stamina,stamina);assert.equal(g.throwTo(0),false);const read=g.defenders.map(d=>d.fakeUntil);g.paused=true;g.tick(.05);assert.equal(g.liveTime,0);g.paused=false;
  for(let time=0;time<1;time+=dt){g.liveTime=time;g.tickPlayAction(dt);assert.equal(g.carrier,g.players[0]);}assert.equal(rolls,3);assert.deepEqual(g.defenders.map(d=>d.fakeUntil),read);assert.equal(g.canPass,true);assert.equal(g.box[0].attempts,0);
 }
});
test('a fooled defender fits the run briefly, recovers, and responds to a visible throw; human input is never fooled',()=>{
 const g=make();g.beginDrive(0,25);g.choose('sbpa');g.rng=()=>0;g.snap();const d=g.defenders[3];g.liveTime=.5;assert.deepEqual(g.coverageTarget(d),{x:32,y:25.5});g.liveTime=2;assert.notDeepEqual(g.coverageTarget(d),{x:32,y:25.5});
 const h=make();h.selectOffense=()=> 'sbpa';h.beginDrive(1,25);h.choose('zone');h.selectDefender(3);h.rng=()=>0;h.snap(1);assert.equal(h.defenders[3].fakeBite,undefined);const x=h.controlled.x;h.tick(.05,{x:1,y:0});assert.ok(h.controlled.x>x);
});
test('package and PA filters expose every call in bounded pages',()=>{
 for(const id of ['singleback','pistol','bunch','special']){const book=PLAYS.filter(p=>packageOf(p)===id),all=[];for(let i=0;i<bookPage(book).pages;i++)all.push(...bookPage(book,'all',i).plays);assert.deepEqual(all,book);assert.ok(bookPage(book,'pa').plays.every(p=>p.playAction));}
});
test('booth false-step focus requires recorded movement, with detached call and tendency metadata',()=>{
 const g=make(),tape=new ReplayTape();g.beginDrive(0,25);g.formationHistory[0].singleback=['run','run','pass'];g.choose('sbpa');g.rng=()=>0;g.snap();g.events=[];
 for(let i=0;i<16;i++){g.liveTime=i*.05;if(i>4)g.defenders[3].y-=.12;tape.observe(g,.05,[]);}
 g.finish('incomplete',25);tape.observe(g,.05,g.events.splice(0));const clip=tape.highlights[0],focus=highlightFocus(clip);assert.equal(focus.fake,true);assert.equal(focus.focus.id,g.defenders[3].id);assert.equal(clip.call.name,'PA cross');assert.equal(clip.tendency.runs,2);g.playStart.call.name='changed';g.playAction.seen.runs=90;assert.equal(clip.call.name,'PA cross');assert.equal(clip.tendency.runs,2);
 const report=giveBoothVoice(halftimeBroadcast(halftimeReport(g),[clip]),new BoothVoices());assert.match(report.segments.find(s=>s.visual==='highlight').john,/2 runs and 1 pass/);
 const frozen=structuredClone(clip);for(const f of frozen.frames)for(const p of f.people)if(p.id===focus.focus.id)p.y=frozen.frames[0].people.find(q=>q.id===p.id).y;assert.equal(highlightFocus(frozen).fake,false);
});
test('pregame chalk talk keeps its teaching copy through rotating booth dialogue',()=>{
 const g=make(),report=giveBoothVoice(pregameReport(g.teams,g.match),new BoothVoices());const segment=report.segments.find(s=>s.visual==='package');assert.ok(segment);assert.match(segment.john,/Same starting picture/);assert.match(segment.caption,/illustration, not a replay/);
});
