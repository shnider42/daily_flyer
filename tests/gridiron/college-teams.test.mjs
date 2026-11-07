import test from 'node:test';
import assert from 'node:assert/strict';
import {COLLEGE_TEAMS,collegeTeam,COLLEGE_RATING_LABEL} from '../../daily_flyer/themes/pocket_gridiron_assets/college-teams.js';
import {fullUnit} from '../../daily_flyer/themes/pocket_gridiron_assets/full-team.js';
import {PLAYS,DEFENSE} from '../../daily_flyer/themes/pocket_gridiron_assets/plays.js';
import {Game} from '../../daily_flyer/themes/pocket_gridiron_assets/engine.js';
import {seededRandom} from '../../daily_flyer/themes/pocket_gridiron_assets/rules.js';
import {RATING_LABELS} from '../../daily_flyer/themes/pocket_gridiron_assets/ratings.js';

test('the nine college collections field complete, distinct all-time lineups and specialists',()=>{
 assert.deepEqual(COLLEGE_TEAMS.map(t=>t.id),['C_BC','C_ND','C_MICH','C_OSU','C_BAMA','C_AUB','C_UF','C_BOISE','C_MIAMI']);
 const globalIds=new Set();
 for(const meta of COLLEGE_TEAMS){
  const team=collegeTeam(meta.id);
  assert.equal(team.college,true);assert.equal(team.ruleset,'college');assert.equal(team.ratingScale,'college');
  assert.ok(team.roster.length>=34);assert.equal(new Set(team.roster.map(p=>p.name)).size,team.roster.length);
  for(const p of team.roster){
   assert.ok(!globalIds.has(p.id),p.id);globalIds.add(p.id);
   assert.equal(p.ratingSource,COLLEGE_RATING_LABEL);assert.ok(Number.isInteger(p.number)&&p.number>=0&&p.number<=99);
   for(const key of Object.keys(RATING_LABELS))assert.ok(Number.isFinite(p[key])&&p[key]>=40&&p[key]<=99,`${p.name}: ${key}`);
  }
  for(const side of ['offense','defense']){
   assert.equal(team[side].length,7);
   const unit=fullUnit(team,side,team[side],team.profile.defense.personnel);
   assert.equal(unit.length,11);assert.equal(new Set(unit.map(p=>p.id)).size,11);
   assert.ok(unit.every(p=>team.roster.includes(p)));
   if(side==='offense')assert.equal(unit.filter(p=>p.pos==='OL').length,5);
  }
  for(const p of Object.values(team.specialists))assert.ok(team.roster.includes(p));
  assert.equal(team.specialists.kicker.pos,'K');assert.equal(team.specialists.punter.pos,'P');
 }
});

test('requested college starters and college jersey numbers survive the factory',()=>{
 assert.deepEqual(collegeTeam('C_BC').offense[0].name,'Doug Flutie');
 assert.deepEqual(collegeTeam('C_UF').offense[0].name,'Tim Tebow');
 const michigan=collegeTeam('C_MICH');
 assert.equal(michigan.offense[0].name,'Tom Brady');assert.equal(michigan.offense[0].number,10);
 assert.equal(michigan.defense[4].name,'Ty Law');assert.equal(michigan.defense[4].number,22);
 // Regressions against accidentally using the much more familiar NFL numbers.
 for(const [id,name,number] of [
  ['C_BC','Andre Williams',34],['C_BC','William Green',1],['C_BC','Dan Koppen',77],['C_BC','Damien Woody',63],
  ['C_ND','Dave Casper',86],['C_ND','Alan Page',81],['C_ND','John Carney',18],
  ['C_MICH','Larry Foote',17],['C_MICH','Jeff Backus',79],['C_MICH','David Baas',75],
  ['C_OSU','Jim Parker',62],['C_OSU','Jim Lachey',64],['C_OSU','Tom Skladany',1],
  ['C_AUB','Willie Anderson',71],['C_AUB','Ed King',67],['C_AUB','Kevin Greene',90],
  ['C_UF','Lito Sheppard',3],['C_UF','Errict Rhett',33],['C_UF','Jeff Mitchell',71],
  ['C_BOISE','Quintin Mikell',9],['C_BOISE','Ryan Winterswyk',98],
  ['C_MIAMI','Michael Irvin',47],['C_MIAMI','Leon Searcy',73],['C_MIAMI','Carlos Huerta',27],['C_MIAMI','Jeff Feagles',38]
 ])assert.equal(collegeTeam(id).roster.find(p=>p.name===name).number,number,name);
});

test('college ratings preserve player styles without inheriting current NFL boosts',()=>{
 const brady=collegeTeam('C_MICH').offense[0],tebow=collegeTeam('C_UF').offense[0],moore=collegeTeam('C_BOISE').offense[0];
 assert.ok(brady.accuracy<99);assert.ok(tebow.speed>brady.speed+20);assert.ok(tebow.power>brady.power+15);
 assert.ok(moore.accuracy>tebow.accuracy);assert.ok(moore.armStrength<collegeTeam('C_AUB').offense[0].armStrength);
 const bama=collegeTeam('C_BAMA'),henry=bama.offense[1];assert.ok(henry.power>henry.agility);assert.equal(henry.endurance,99);
 const boise=collegeTeam('C_BOISE'),jeanty=boise.offense[1];assert.ok(jeanty.balance>=98);assert.equal(jeanty.endurance,99);
});

test('school schemes resolve to executable calls in both seven and eleven player games',()=>{
 const books=[];
 for(const meta of COLLEGE_TEAMS){
  const team=collegeTeam(meta.id),ids=team.profile.offense.plays;
  assert.equal(new Set(ids).size,ids.length);books.push(ids.join(','));
  assert.ok(team.profile.offense.signature.length>=4);
  for(const id of team.profile.offense.signature)assert.ok(ids.includes(id));
  for(const id of ids)assert.ok(PLAYS.some(p=>p.id===id),`${meta.id}: ${id}`);
  for(const id of team.profile.defense.plays)assert.ok(DEFENSE.some(p=>p.id===id),`${meta.id}: ${id}`);
  for(const format of [7,11]){
   const g=new Game(team,collegeTeam('C_MIAMI'),'pro',seededRandom(73),{format,playClock:false});
   for(const id of team.profile.offense.signature){
    g.beginDrive(0,35);g.choose(id);assert.equal(g.playDefinition.id,id);assert.equal(g.phase,'ready');
    assert.equal(g.players.length,format);assert.equal(g.defenders.length,format);g.snap();g.tick(.05,{x:0,y:0});
    for(const p of [...g.players,...g.defenders])assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
   }
  }
 }
 assert.equal(new Set(books).size,COLLEGE_TEAMS.length);
});

test('school uniforms and home venues are independent of lineup mutation',()=>{
 const boise=collegeTeam('C_BOISE'),nd=collegeTeam('C_ND'),michigan=collegeTeam('C_MICH'),bama=collegeTeam('C_BAMA');
 assert.equal(boise.venue.name,'Albertsons Stadium');assert.equal(boise.field.surface,'#0057B8');
 assert.equal(nd.uniforms.home.helmetPattern,'plain');assert.equal(michigan.uniforms.home.helmetPattern,'winged');assert.equal(bama.uniforms.home.helmetPattern,'numbers');
 assert.equal(nd.uniforms.home.helmet,nd.uniforms.away.helmet);
 boise.field.surface='#000000';boise.uniforms.home.helmet='#000000';boise.roster[0].speed=1;
 const fresh=collegeTeam('C_BOISE');assert.notEqual(fresh.field.surface,'#000000');assert.notEqual(fresh.uniforms.home.helmet,'#000000');assert.notEqual(fresh.roster[0].speed,1);
});

test('custom depth selections use actual college athletes without duplicated starters',()=>{
 const original=collegeTeam('C_MICH'),denard=original.roster.find(p=>p.name==='Denard Robinson'),wheatley=original.roster.find(p=>p.name==='Tyrone Wheatley');
 const changed=collegeTeam('C_MICH',{qb:denard.id,rb:wheatley.id});
 assert.equal(changed.offense[0].name,'Denard Robinson');assert.equal(changed.offense[1].name,'Tyrone Wheatley');
 assert.equal(new Set(fullUnit(changed,'offense',changed.offense).map(p=>p.id)).size,11);
 assert.equal(collegeTeam('C_MICH').offense[0].name,'Tom Brady');
 assert.throws(()=>collegeTeam('NE'),/Unknown college/);
});
