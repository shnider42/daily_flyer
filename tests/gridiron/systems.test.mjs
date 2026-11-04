import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Game,PLAYS,DEFENSE} from '../../daily_flyer/themes/pocket_gridiron_assets/engine.js';
import {OFFENSIVE_SYSTEMS,SYSTEM_PLAYS} from '../../daily_flyer/themes/pocket_gridiron_assets/offensive-systems.js';
import {SYSTEM_DEFENSE} from '../../daily_flyer/themes/pocket_gridiron_assets/defensive-systems.js';
import {PERSONNEL,choosePersonnel,supportsPersonnel} from '../../daily_flyer/themes/pocket_gridiron_assets/packages.js';
import {withOffensiveSystem} from '../../daily_flyer/themes/pocket_gridiron_assets/teams.js';
import {TEAMS,buildTeam} from '../../daily_flyer/themes/pocket_gridiron_assets/roster.js';
import {DECADE_TEAMS,decadeTeam} from '../../daily_flyer/themes/pocket_gridiron_assets/decades.js';
import {historicTeam} from '../../daily_flyer/themes/pocket_gridiron_assets/history.js';
import {seededRandom} from '../../daily_flyer/themes/pocket_gridiron_assets/rules.js';
import {runProbability} from '../../daily_flyer/themes/pocket_gridiron_assets/rushing.js';
import {updateBlocking} from '../../daily_flyer/themes/pocket_gridiron_assets/blocking.js';
import {newCoverageTarget,playDiagram} from '../../daily_flyer/themes/pocket_gridiron_assets/plays.js';
const data=JSON.parse(fs.readFileSync(new URL('../../daily_flyer/themes/pocket_gridiron_assets/rosters.json',import.meta.url)));
const team=(system='team')=>withOffensiveSystem(buildTeam('NE',data),system);
const make=(system='team',format=11,defensePackage='base')=>new Game(team(system),withOffensiveSystem(buildTeam('BUF',data),system),'pro',seededRandom(32),{format,defensePackage});
const finite=g=>{for(const p of [...g.players,...g.defenders])assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y),`${g.play}/${g.defense}: ${p.name} ${p.x},${p.y}`);};
const groups=[['DL','DT','DE'],['LB','ILB','OLB'],['DB','CB','S','FS','SS']];
test('42 new offensive calls belong to seven distinct six-call systems, with supporting legacy calls',()=>{
 assert.equal(SYSTEM_PLAYS.length,42);assert.equal(SYSTEM_DEFENSE.length,20);
 assert.equal(new Set(PLAYS.map(p=>p.id)).size,PLAYS.length);assert.equal(new Set(DEFENSE.map(p=>p.id)).size,DEFENSE.length);
 for(const [id,s] of Object.entries(OFFENSIVE_SYSTEMS)){
  assert.equal(s.plays.length,6);const g=make(id);g.beginDrive(0,30);
  assert.equal(g.offensePlays.filter(p=>p.system).length,6);assert.ok(g.offensePlays.length>6);
  assert.ok(g.offensePlays.filter(p=>p.system).every(p=>p.system===id));
  assert.ok(SYSTEM_PLAYS.filter(p=>p.system===id).some(p=>p.kind==='run'));
  assert.ok(SYSTEM_PLAYS.filter(p=>p.system===id).some(p=>p.kind==='pass'));
 }
});
test('each system disguises all six calls in one legal 11-player formation and aligned route starts',()=>{
 for(const [id,s] of Object.entries(OFFENSIVE_SYSTEMS))for(const format of [7,11]){
  const g=make(id,format);g.beginDrive(0,30);let alignment;
  for(const play of SYSTEM_PLAYS.filter(p=>p.system===id)){
   assert.equal(g.choose(play.id),true);const coords=g.players.map(p=>[p.x,p.y]);
   if(alignment)assert.deepEqual(coords,alignment);else alignment=coords;
   assert.equal(g.formation.id,s.formation);assert.equal(new Set(coords.map(p=>p.join(':'))).size,format);
   if(format===11){assert.equal(g.players.filter(p=>p.pos==='OL').length,5);assert.equal(g.players.filter(p=>p.y===29.5).length,7);}
   if(play.kind==='pass')for(const receiver of g.players.slice(2,5)){assert.deepEqual(g.route(receiver,0),{x:receiver.x,y:receiver.y});assert.ok(Object.values(g.route(receiver,5)).every(Number.isFinite));}
  }
 }
});
test('all current and decade teams supply actual, distinct athletes for five defensive systems',()=>{
 for(const t of [...TEAMS.map(t=>buildTeam(t.abbr,data)),...DECADE_TEAMS.map(t=>decadeTeam(t.id))])for(const id of ['base','odd','bear','nickel','stack']){
  assert.ok(supportsPersonnel(t,id),`${t.abbr}/${id}`);const g=new Game(t,team(),'pro',seededRandom(1),{format:11,defensePackage:id});g.beginDrive(1,30);
  assert.deepEqual(groups.map(ps=>g.defenders.filter(p=>ps.includes(p.pos)).length),PERSONNEL[id].counts,`${t.abbr}/${id}`);
  assert.equal(new Set(g.defenders.map(p=>p.id)).size,11);assert.ok(g.defenders.every(p=>t.roster.some(q=>q.id===p.id)));
  assert.equal(g.defensePlays.filter(p=>p.system).length,4);
 }
 assert.equal(supportsPersonnel(historicTeam('OAK72'),'nickel'),false);assert.equal(choosePersonnel(historicTeam('OAK72'),'nickel'),'base');
 assert.equal(supportsPersonnel(historicTeam('OAK72'),'odd'),false);
});
test('all 20 new defensive calls assign every defender once, with finite 7- and 11-player targets',()=>{
 for(const p of SYSTEM_DEFENSE)for(const format of [7,11]){
  const c=format===11?p.fullCoverage:p.coverage,slots=[...c.rush,...Object.keys(c.zones).map(Number),...Object.keys(c.man||{}).map(Number),...(c.spies||[]),...(c.safety===undefined?[]:[c.safety]),...(c.bracket?[c.bracket.under,c.bracket.over]:[])];
  assert.deepEqual(slots.sort((a,b)=>a-b),Array.from({length:format},(_,i)=>i),`${p.id}/${format}`);
  const id=Object.keys(PERSONNEL).find(id=>PERSONNEL[id].system===p.system),g=make('westcoast',format,id);g.beginDrive(1,30);g.choose(p.id);
  assert.ok(!/NaN|undefined/.test(playDiagram(p.id)));for(const d of g.defenders){const target=newCoverageTarget(g,d);assert.ok(target&&[target.x,target.y].every(Number.isFinite),`${p.id}/${d.slot}`);}
  assert.equal(g.snap(1),true);for(let i=0;i<100&&g.isLive;i++){g.tick(.05);finite(g);}
 }
 assert.equal(SYSTEM_DEFENSE.find(p=>p.id==='34drop').fullCoverage.rush.length,3);
 assert.equal(SYSTEM_DEFENSE.find(p=>p.id==='46zero').fullCoverage.rush.length,6);
 const bracket=SYSTEM_DEFENSE.find(p=>p.id==='nkbracket');for(const c of [bracket.coverage,bracket.fullCoverage])assert.equal(Object.values(c.man).filter(slot=>slot===2).length+2,2,'Nickel bracket doubles the left receiver without a third man assignment');
});
test('each new offense can snap, exchange, pass and finish a live play in both field sizes',()=>{
 for(const p of SYSTEM_PLAYS)for(const format of [7,11])for(const offense of [0,1]){
  const g=make(p.system,format);if(offense)g.selectOffense=()=>p.id;g.beginDrive(offense,30);g.choose(offense?'zone':p.id);assert.equal(g.snap(offense),true);
  for(let i=0;i<240&&g.isLive;i++){if(g.userOffense&&g.canPass&&g.liveTime>p.wait)g.throwTo(0);g.tick(.05,{x:0,y:1});finite(g);}
  assert.notEqual(g.phase,'live',`${p.id}/${format}/${offense}`);
 }
});
test('wing and jet exchanges reach their intended carrier; QB keepers stay with the quarterback',()=>{
 for(const [id,system,slot] of [['wtcounter','wingt',4],['spjet','spread',3],['spqbpower','spread',0]]){
  const g=make(system);g.beginDrive(0,30);g.choose(id);g.snap();if(g.pitch){g.liveTime=1;g.tickExchange(1);}assert.equal(g.carrier.slot,slot);assert.equal(g.pitch,null);
 }
});
test('counter GT moves both pullers and delayed TE release holds its starting point',()=>{
 const g=make('poweri');g.beginDrive(0,30);g.choose('pigt');g.snap();for(const d of g.defenders)d.y=80;const starts=[g.players[5].x,g.players[7].x];g.liveTime=.4;updateBlocking(g,.1);assert.ok(g.players[5].x>starts[0]);assert.ok(g.players[7].x>starts[1]);
 g.beginDrive(0,30);g.choose('piflat');const te=g.players[4];assert.deepEqual(g.route(te,.5),{x:te.x,y:te.y});assert.notDeepEqual(g.route(te,1),{x:te.x,y:te.y});
});
test('scheme tendencies influence CPU run selection; package changes wait until the next series',()=>{
 const rates=Object.fromEntries(Object.keys(OFFENSIVE_SYSTEMS).map(id=>{const g=make(id);g.beginDrive(0,30);return [id,runProbability(g)];}));assert.ok(rates.wingt>rates.westcoast+.15);assert.ok(rates.poweri>rates.airraid+.25);
 const g=make('spread',11,'odd');g.beginDrive(1,30);const ids=g.defenders.map(p=>p.id);g.defensePreference='stack';g.choose('34drop');g.beginDrive(1,36,2);assert.equal(g.personnel,'odd');assert.deepEqual(g.defenders.map(p=>p.id),ids);g.beginDrive(0,30);g.beginDrive(1,30);assert.equal(g.personnel,'stack');assert.ok(g.defensePlays.some(p=>p.id==='stspy'));assert.ok(!g.defensePlays.some(p=>p.id==='34drop'));
});
test('full games complete with each selected offense and the five new defensive books',()=>{
 const systems=Object.keys(OFFENSIVE_SYSTEMS),units=['base','odd','bear','nickel','stack'];
 for(const [index,id] of systems.entries()){
  const g=make(id,11,units[index%units.length]);let ticks=0,calls=0;
  while(g.phase!=='final'&&ticks++<30000){
   if(g.phase==='halftime')g.resumeHalftime();if(g.phase==='tv_timeout')g.resumeTV();if(g.phase==='penalty')g.resolvePenalty(true);
   if(g.phase==='call'){const book=g.humanPlays.filter(p=>p.system);g.choose(book[calls++%book.length].id);}
   if(g.phase==='ready'&&g.userOffense)g.snap();
   if(g.phase==='kick_ready')g.kickAction();if(g.phase==='kick_charge'&&g.special.power>.8)g.kickAction();if(g.phase==='kick_accuracy'&&g.special.accuracy>=.48)g.kickAction();
   if(g.canPass&&g.liveTime>1.8)g.throwTo(calls%3);g.tick(.05,g.phase.startsWith('kick_')?{x:0,y:0}:{x:Math.sin(ticks*.01)*.5,y:1});finite(g);
  }
  assert.equal(g.phase,'final',id);assert.ok(g.scores.every(Number.isFinite));assert.ok(calls>4);
 }
});
