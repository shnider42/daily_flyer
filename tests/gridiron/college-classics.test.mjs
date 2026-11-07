import test from 'node:test';
import assert from 'node:assert/strict';
import {CollegeChallengeGame,COLLEGE_CLASSICS,COLLEGE_CLASSIC_TEAMS,collegeClassicTeam} from '../../daily_flyer/themes/pocket_gridiron_assets/college-classics.js';
import {Game} from '../../daily_flyer/themes/pocket_gridiron_assets/engine.js';
import {seededRandom} from '../../daily_flyer/themes/pocket_gridiron_assets/rules.js';
import {fullUnit} from '../../daily_flyer/themes/pocket_gridiron_assets/full-team.js';

const byId=id=>COLLEGE_CLASSICS.find(c=>c.id===`college-${id}`);
const make=(id,seed=1,config={})=>{const item=byId(id);return new CollegeChallengeGame(collegeClassicTeam(item.home),collegeClassicTeam(item.away),{id:item.id,guidance:'moderate',difficulty:'pro',...config},seededRandom(seed));};
const step=(g,n,input={x:0,y:0})=>{for(let i=0;i<n&&!g.result;i++)g.tick(.05,input);};
const finite=g=>{for(const p of [...g.players,...g.defenders])assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y),p.name);};
function fieldKick(g){
 assert.equal(g.startMoment(),true);
 for(let i=0;i<80&&g.moment.stage==='flight';i++)g.tick(.05,{x:g.moment.target.x-g.carrier.x,y:g.moment.target.y-g.carrier.y});
 assert.equal(g.moment.stage,'catch');assert.equal(g.momentAction(),true);
}
function handoff(g){
 assert.equal(g.startMoment(),true);step(g,18);assert.equal(g.momentAction(),true);assert.equal(g.moment.stage,'handoff');
 for(let i=0;i<80&&g.moment.stage==='handoff'&&!g.result;i++){
  const t=g.momentBall;g.tick(.05,{x:t.x-g.carrier.x,y:t.y-g.carrier.y});
  if(Math.hypot(t.x-g.carrier.x,t.y-g.carrier.y)<.5)g.momentAction();
 }
 assert.equal(g.handedOff,true);assert.equal(g.carrier.name,'Ian Johnson');
}

test('college moments use their actual scores, dates, opponents and original principals',()=>{
 assert.equal(COLLEGE_CLASSICS.length,3);assert.equal(COLLEGE_CLASSIC_TEAMS.length,6);
 const f=byId('flutie');assert.deepEqual(f.score,[41,45]);assert.equal(f.spot,52);assert.equal(f.down,2);assert.equal(f.clock,6);assert.match(f.story,/regular-season/);
 const k=byId('kicksix');assert.deepEqual(k.score,[28,28]);assert.equal(k.clock,1);assert.equal(k.spot,38);assert.match(k.story,/57-yard/);
 const b=byId('statue');assert.deepEqual(b.score,[41,42]);assert.equal(b.spot,97);assert.equal(b.quarter,5);assert.equal(b.clock,0);
 assert.equal(collegeClassicTeam(f.home).offense[0].name,'Doug Flutie');assert.equal(collegeClassicTeam(b.home).offense[0].name,'Jared Zabransky');
 assert.equal(collegeClassicTeam(k.home).specialists.pr.name,'Chris Davis');
 for(const item of COLLEGE_CLASSICS)for(const key of ['simple','moderate','expert','goalText','story','source'])assert.ok(item[key].length>25,`${item.id}: ${key}`);
});
test('curated season squads supply distinct full teams and actual jersey numbers',()=>{
 for(const item of COLLEGE_CLASSIC_TEAMS){
  const t=collegeClassicTeam(item.id);assert.equal(t.college,true);assert.equal(t.historic,true);assert.equal(new Set(t.roster.map(p=>p.id)).size,t.roster.length);
  for(const side of ['offense','defense']){const unit=fullUnit(t,side,t[side]);assert.equal(unit.length,11);assert.equal(new Set(unit.map(p=>p.id)).size,11);}
  const g=new Game(t,collegeClassicTeam('CC_OU06'),'pro',()=>.5,{format:11,ruleset:'college'});g.beginDrive(0,30);finite(g);
 }
 assert.equal(collegeClassicTeam('CC_BC84').roster.find(p=>p.name==='Gerard Phelan').number,20);
 assert.equal(collegeClassicTeam('CC_AUB13').roster.find(p=>p.name==='Chris Davis').number,11);
 assert.equal(collegeClassicTeam('CC_BSU06').roster.find(p=>p.name==='Ian Johnson').number,41);
 assert.ok(!collegeClassicTeam('CC_AUB13').roster.some(p=>p.name==='Cam Newton'));
 assert.ok(!collegeClassicTeam('CC_BSU06').roster.some(p=>p.name==='Kellen Moore'));
});
test('historical uniforms are locked to the game; the Fiesta Bowl remains on green turf',()=>{
 const bc=collegeClassicTeam('CC_BC84'),miami=collegeClassicTeam('CC_MIA84'),boise=collegeClassicTeam('CC_BSU06');
 assert.equal(bc.uniforms.home.jersey,'#f8f5eb');assert.equal(bc.uniforms.home.pants,'#c7a96c');
 assert.equal(miami.uniforms.home.jersey,'#ed6a20');assert.equal(miami.uniforms.home.pants,'#f7f6ef');
 assert.equal(boise.uniforms.home.jersey,'#f8f7f0');assert.equal(boise.uniforms.home.pants,'#f26522');
 assert.equal(boise.field.surface,'#356e50');assert.match(boise.venue.name,/Fiesta Bowl/);
 assert.deepEqual(boise.uniforms.home,boise.uniforms.away);
 const copy=collegeClassicTeam('CC_BSU06');copy.roster[0].name='Changed';copy.uniforms.home.jersey='#000000';assert.equal(collegeClassicTeam('CC_BSU06').roster[0].name,'Jared Zabransky');assert.equal(collegeClassicTeam('CC_BSU06').uniforms.home.jersey,'#f8f7f0');
});
test('college challenge stays compatible with the common challenge UI without starting modern overtime',()=>{
 assert.equal(Object.getPrototypeOf(CollegeChallengeGame.prototype).constructor.name,'ChallengeGame');
 for(const id of ['flutie','kicksix','statue']){
  const g=make(id);assert.equal(g.challenge.mode,'college');assert.equal(g.format,11);assert.equal(g.ruleset,'college');assert.equal(g.historicalMoment,true);assert.equal(g.collegeOvertime,null);
  assert.equal(g.players.length,11);assert.equal(g.defenders.length,11);assert.equal(new Set(g.players.map(p=>p.id)).size,11);assert.equal(new Set(g.defenders.map(p=>p.id)).size,11);
  assert.ok(g.challengeCue.length>10);finite(g);
 }
});
test('Flutie rolls out, releases a real high pass, and Phelan completes it after zero',()=>{
 const g=make('flutie');assert.equal(g.snap(),true);let released=false;
 for(let i=0;i<240&&!g.result;i++){
  if(i===90){assert.ok(g.clock>0);released=g.throwTo(0);assert.equal(g.pass.duration,3);}
  g.tick(.05,{x:i<65?.8:0,y:i<65?-.3:0});finite(g);
 }
 assert.equal(released,true);assert.equal(g.result.success,true);assert.equal(g.carrier.name,'Gerard Phelan');assert.deepEqual(g.scores,[47,45]);assert.equal(g.clock,0);assert.equal(g.box[0].attempts,1);assert.equal(g.box[0].completions,1);assert.equal(g.box[0].passYards,48);assert.equal(g.pending,null);assert.doesNotMatch(g.lastResult,/extra point next/);
});
test('an early Hail Mary can fall short of the receiver and never awards a scripted score',()=>{
 const g=make('flutie');g.snap();step(g,8,{x:.8,y:-.3});assert.equal(g.throwTo(0),true);step(g,200);
 assert.equal(g.result.success,false);assert.deepEqual(g.scores,[41,45]);assert.equal(g.box[0].completions,0);
 const expired=make('flutie');expired.snap();expired.clock=0;assert.equal(expired.throwTo(0),false);expired.tick(.05);assert.equal(expired.result.success,false);assert.match(expired.result.detail,/Time expires/);
});
test('Kick Six fields the short kick and requires a full live return with the actual Auburn unit',()=>{
 const g=make('kicksix');assert.deepEqual(new Set(g.players.map(p=>p.name)),new Set(['Chris Davis','Gabe Wright','Angelo Blackson','LaDarius Owens','Cassanova McKinzy','Jonathon Mincy','Jermaine Whitehead','Ryan Smith','Dee Ford','Kris Frost','Robenson Therezie']));
 fieldKick(g);assert.equal(g.phase,'return');assert.equal(g.carrier.name,'Chris Davis');assert.equal(g.result,undefined);assert.equal(g.clock,0);assert.deepEqual(g.scores,[28,28]);
 for(let i=0;i<850&&!g.result;i++){g.tick(.05,{x:g.carrier.x>2?-1:0,y:1});finite(g);}
 assert.equal(g.result.success,true);assert.deepEqual(g.scores,[34,28]);assert.equal(g.result.value,100);assert.equal(g.stats.returnYards,100);assert.equal(g.box[0].returnYards,100);assert.equal(g.result.stars,3);assert.equal(g.pending,null);assert.doesNotMatch(g.lastResult,/extra point next/);
});
test('missing the kick or getting downed in the end zone fails without inventing a safety',()=>{
 const miss=make('kicksix');miss.startMoment();assert.equal(miss.momentAction(),false);step(miss,130);assert.equal(miss.result.success,false);assert.deepEqual(miss.scores,[28,28]);
 const down=make('kicksix');fieldKick(down);down.finish('tackle',down.carrier.y);assert.equal(down.result.success,false);assert.match(down.result.detail,/touchback/);assert.deepEqual(down.scores,[28,28]);
});
test('the return defense remains active and can tackle a player who runs through the middle',()=>{
 const g=make('kicksix',1,{difficulty:'legend'});fieldKick(g);step(g,500,{x:0,y:1});assert.equal(g.result.success,false);assert.ok(g.carrier.y<100);assert.deepEqual(g.scores,[28,28]);
});
test('Statue of Liberty demands the fake and the hidden handoff, then a player-controlled run worth two',()=>{
 const g=make('statue');assert.equal(g.quarter,5);assert.equal(g.spot,97);handoff(g);assert.deepEqual(g.scores,[41,42]);assert.equal(g.result,undefined);assert.equal(g.box[0].attempts,0);
 for(let i=0;i<180&&!g.result;i++){g.tick(.05,{x:g.carrier.x>8?-1:0,y:g.carrier.x>8?.1:1});finite(g);}
 assert.equal(g.result.success,true);assert.equal(g.result.value,2);assert.deepEqual(g.scores,[43,42]);assert.deepEqual(g.publishedScores,[43,42]);assert.equal(g.conversion.good,true);assert.equal(g.pending,null);assert.equal(g.collegeOvertime,null);assert.equal(g.clock,0);
});
test('Statue failure windows and a stopped conversion preserve the real 41–42 deficit',()=>{
 const slow=make('statue');slow.startMoment();assert.equal(slow.momentAction(),false);step(slow,70);assert.equal(slow.result.success,false);assert.deepEqual(slow.scores,[41,42]);
 const miss=make('statue');miss.startMoment();step(miss,18);miss.momentAction();step(miss,80);assert.equal(miss.result.success,false);assert.deepEqual(miss.scores,[41,42]);
 const stopped=make('statue');handoff(stopped);stopped.finish('tackle',97);assert.equal(stopped.result.success,false);assert.deepEqual(stopped.scores,[41,42]);assert.equal(stopped.conversion.good,false);
});
test('pause freezes checkpoints and results; retry starts from clean independent state',()=>{
 for(const id of ['kicksix','statue']){
  const g=make(id);g.paused=true;assert.equal(g.startMoment(),false);step(g,100);assert.equal(g.elapsed,0);g.paused=false;g.startMoment();step(g,8);g.paused=true;
  const snapshot=JSON.stringify({clock:g.clock,moment:g.moment,positions:g.players.map(p=>[p.x,p.y]),elapsed:g.elapsed});step(g,100);assert.equal(g.momentAction(),false);assert.equal(JSON.stringify({clock:g.clock,moment:g.moment,positions:g.players.map(p=>[p.x,p.y]),elapsed:g.elapsed}),snapshot);
  const retry=make(id);assert.equal(retry.result,undefined);assert.equal(retry.elapsed,0);assert.equal(retry.phase,'moment_ready');assert.deepEqual(retry.scores,byId(id).score);
 }
});
