import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Game} from '../../daily_flyer/themes/pocket_gridiron_assets/engine.js';
import {buildTeam,TEAMS} from '../../daily_flyer/themes/pocket_gridiron_assets/roster.js';
import {PERSONNEL} from '../../daily_flyer/themes/pocket_gridiron_assets/packages.js';
import {withOffensiveSystem} from '../../daily_flyer/themes/pocket_gridiron_assets/teams.js';
import {OFFENSIVE_SYSTEMS} from '../../daily_flyer/themes/pocket_gridiron_assets/offensive-systems.js';
import {suggestions,kickOptions} from '../../daily_flyer/themes/pocket_gridiron_assets/presentation.js';
import {seededRandom} from '../../daily_flyer/themes/pocket_gridiron_assets/rules.js';

const data=JSON.parse(fs.readFileSync(new URL('../../daily_flyer/themes/pocket_gridiron_assets/rosters.json',import.meta.url)));
function game({team='NE',opponent='BUF',format=11,personnel='base',humanTeam=0,offense=humanTeam,spot=25,down=1,toGo=10,quarter=1,clock=100,margin=0,system}={}){
 let home=buildTeam(team,data),away=buildTeam(opponent,data);
 if(system){if(humanTeam===0)home=withOffensiveSystem(home,system);else away=withOffensiveSystem(away,system);}
 const g=new Game(home,away,'pro',seededRandom(42),{format,defensePackage:personnel});g.humanTeam=humanTeam;
 // Keep setup out of the CPU's autonomous fourth-down kick branch.
 g.beginDrive(offense,spot,1,Math.min(100,spot+toGo));g.down=down;g.quarter=quarter;g.clock=clock;
 g.scores[offense]=Math.max(0,margin);g.scores[1-offense]=Math.max(0,-margin);
 return g;
}
const picks=g=>suggestions(g,g.humanPlays);
const ids=cards=>cards.map(p=>p.id);
const fg=cards=>cards.find(p=>p.kickType==='fieldgoal');
const regular=cards=>cards.filter(p=>p.kind!=='kick');
function fourLegal(g,cards=picks(g)){
 assert.equal(cards.length,4);assert.equal(new Set(ids(cards)).size,4);
 const book=new Set(g.humanPlays.map(p=>p.id)),kicks=new Set(kickOptions(g).map(p=>p.id));
 for(const p of cards){assert.ok((p.kind==='kick'?kicks:book).has(p.id),p.id);assert.ok(p.reason&&p.reason.length<75,p.id);}
 return cards;
}
function fastGoalCalls(cards){
 assert.ok(cards.some(p=>p.kind==='run'));assert.ok(cards.some(p=>p.kind==='pass'));
 for(const p of cards){
  assert.ok(!p.playAction,`${p.id}: a goal-line call should not need a long fake`);
  if(p.kind==='pass'){assert.equal(p.group,'quick',p.id);assert.ok((p.wait??1.4)<=1.6,p.id);}
  else {assert.ok((p.delay||0)<=.4,p.id);assert.ok((p.exchange?.flight||0)<=.15,p.id);}
 }
}

test('opponent two: every real 11-on-11 team gets three quick goal-line calls and a 19-yard FG on every down',()=>{
 for(const {abbr} of TEAMS)for(const down of [1,2,3,4]){
  const g=game({team:abbr,spot:98,down,toGo:2}),cards=fourLegal(g);
  assert.equal(fg(cards)?.distance,19,`${abbr}, down ${down}`);assert.equal(regular(cards).length,3);fastGoalCalls(regular(cards));
  for(const p of regular(cards))assert.equal(g.choose(p.id),true,`${abbr}: ${p.id}`);
 }
});

test('own two is a backed-up offense, with safe space-making runs and outlets rather than a goal-line kick',()=>{
 for(const {abbr} of TEAMS){
  const cards=fourLegal(game({team:abbr,spot:2}));assert.equal(fg(cards),undefined);fastGoalCalls(cards);
  for(const p of cards){assert.match(p.reason,/own end zone|away from your end zone/);if(p.kind==='run')assert.ok(Math.abs((p.lane??26.5)-26.5)<=10,p.id);}
 }
});

test('all selectable offensive systems retain four eligible recommendations, including condensed-field choices',()=>{
 for(const system of Object.keys(OFFENSIVE_SYSTEMS))for(const spot of [25,98]){
  const g=game({system,spot,toGo:spot===98?2:10}),cards=fourLegal(g);assert.ok(regular(cards).every(p=>g.humanPlays.some(q=>q.id===p.id)),system);
  if(spot===98)fastGoalCalls(regular(cards));
 }
});

test('short yardage mixes a direct run and quick pass; third-and-long supplies routes to the sticks',()=>{
 const short=fourLegal(game({spot:45,down:3,toGo:1}));assert.equal(short[0].kind,'run');assert.ok(short.some(p=>p.kind==='pass'&&p.group==='quick'));
 for(const {abbr} of TEAMS){
  const long=fourLegal(game({team:abbr,spot:40,down:3,toGo:14}));assert.ok(long.every(p=>p.kind==='pass'&&!p.playAction),abbr);
  for(const p of long){if(p.routes)assert.ok(p.routes.some(route=>route.at(-1)[1]>=14),`${abbr}: ${p.id}`);else assert.ok(['verts','flood','postwheel','smash'].includes(p.id),`${abbr}: ${p.id}`);}
  assert.notDeepEqual(ids(short),ids(long));
 }
});

test('fourth-and-long away from scoring range leads with a punt; ordinary early downs do not suggest a kick',()=>{
 const fourth=fourLegal(game({spot:25,down:4,toGo:10}));assert.equal(fourth[0].kickType,'punt');assert.ok(regular(fourth).every(p=>p.kind==='pass'));
 for(const spot of [25,55,70,85])for(const down of [1,2])assert.ok(fourLegal(game({spot,down})).every(p=>p.kind!=='kick'),`${spot}, down ${down}`);
});

test('the end of a half offers realistic field goals on early downs, with no early-quarter panic kick',()=>{
 for(const quarter of [2,4])for(const down of [1,2,3]){
  const cards=fourLegal(game({spot:75,quarter,clock:8,down}));assert.equal(cards[0].kickType,'fieldgoal');assert.equal(cards[0].distance,42);
 }
 assert.equal(fg(picks(game({spot:75,quarter:1,clock:8}))),undefined);
 assert.equal(fg(picks(game({spot:75,quarter:3,clock:8}))),undefined);
 assert.equal(fg(picks(game({spot:75,quarter:2,clock:80}))),undefined);
});

test('a late touchdown deficit keeps four attacking choices and never punts possession away',()=>{
 for(const spot of [25,60,75,90]){
  const cards=fourLegal(game({spot,down:4,toGo:8,quarter:4,clock:8,margin:-7}));assert.ok(cards.every(p=>p.kind==='pass'),String(spot));assert.equal(fg(cards),undefined);
 }
 const tie=fourLegal(game({spot:75,down:4,quarter:4,clock:8,margin:-3}));assert.equal(tie[0].kickType,'fieldgoal');
});

test('goal-line FG remains available even when three points are insufficient, after three touchdown attempts',()=>{
 for(const down of [1,2,3,4]){
  const cards=fourLegal(game({spot:98,down,toGo:2,quarter:4,clock:8,margin:-7}));
  assert.equal(cards[0].kind,'pass');assert.equal(cards[3].kickType,'fieldgoal');assert.match(cards[3].reason,/will not tie/);fastGoalCalls(regular(cards));
 }
});

test('protecting a late lead favors clock-moving runs and sudden-death overtime favors available points',()=>{
 for(const clock of [15,8]){const leading=fourLegal(game({quarter:4,clock,margin:7}));assert.equal(leading[0].kind,'run');assert.equal(leading.filter(p=>p.kind==='run').length,2);assert.ok(leading.every(p=>p.kind!=='kick'));}
 assert.equal(fg(picks(game({spot:75,quarter:4,clock:8,margin:7}))),undefined);
 const goalLead=fourLegal(game({spot:98,toGo:2,quarter:4,clock:8,margin:7}));assert.equal(goalLead[0].kind,'run');assert.equal(goalLead[3].kickType,'fieldgoal');assert.doesNotMatch(goalLead[3].reason,/Take the points/);
 const overtime=fourLegal(game({spot:75,quarter:5,clock:100}));assert.equal(overtime[0].kickType,'fieldgoal');assert.match(overtime[0].reason,/win in overtime/);
});

test('recommended field-goal range follows the actual kicker and wind, while the full book retains legal attempts',()=>{
 const g=game({spot:60,down:4,toGo:10});g.teams[0].specialists.kicker.kickPower=75;
 assert.ok(fg(kickOptions(g)));assert.equal(fg(picks(g)),undefined);assert.equal(picks(g)[0].kickType,'punt');
 g.teams[0].specialists.kicker.kickPower=99;assert.equal(fg(picks(g))?.distance,57);
 g.weather.wind={x:0,y:-25};g.weather.gust=0;g.weather.roofClosed=false;assert.equal(fg(picks(g)),undefined);
 g.weather.wind.y=25;assert.equal(fg(picks(g))?.distance,57);
});

test('full-book kick cards share engine legality, preserve first-to-third-down FG access, and use the UI kick schema',()=>{
 const g=game({spot:52});
 for(const down of [1,2,3,4]){
  g.down=down;const cards=kickOptions(g);assert.equal(fg(cards)?.distance,65);assert.equal(cards.some(p=>p.kickType==='punt'),down===4);
  for(const card of cards){assert.equal(card.id,card.kickType);assert.equal(card.kind,'kick');assert.equal(card.group,'kick');assert.ok(card.name&&card.hint&&card.reason);}
 }
 g.spot=51;assert.deepEqual(ids(kickOptions(g)),['punt']);g.offense=1;assert.deepEqual(kickOptions(g),[]);
 g.offense=0;g.spot=98;g.paused=true;assert.deepEqual(kickOptions(g),[]);g.paused=false;g.phase='live';assert.deepEqual(kickOptions(g),[]);
});

test('the full-book FG card executes on each down through the game engine',()=>{
 for(const format of [7,11])for(const down of [1,2,3,4]){
  const g=game({format,spot:98,down,toGo:2}),card=fg(picks(g));assert.ok(card);assert.equal(g.kick(card.kickType),true);assert.equal(g.special.type,'fieldgoal');assert.equal(g.special.distance,19);
 }
});

test('team identity and recently used calls change recommendations without modifying the underlying playbook',()=>{
 const a=game({team:'NE'}),b=game({team:'MIA'}),book=a.humanPlays,original=JSON.stringify(book),first=fourLegal(a);
 assert.notDeepEqual(ids(first),ids(fourLegal(b)));a.offenseCalls[0]=Array(4).fill(first[0].id);const fresh=fourLegal(a);assert.notEqual(fresh[0].id,first[0].id);
 assert.equal(JSON.stringify(book),original);for(const card of regular(fresh))assert.notEqual(card,book.find(p=>p.id===card.id));
 a.rng=()=>{throw Error('recommendations must not advance game randomness');};assert.deepEqual(picks(a),picks(a));
 const duplicated=suggestions(a,[...book,...book]);assert.equal(new Set(ids(duplicated)).size,4);
});

test('away-side human offense uses its own book, kicker and correct score perspective',()=>{
 const g=game({humanTeam:1,opponent:'MIA',spot:98,down:2,toGo:2,quarter:4,clock:8,margin:-7});
 assert.equal(g.userOffense,true);const cards=fourLegal(g);assert.equal(cards[3].kickType,'fieldgoal');assert.match(cards[3].reason,/will not tie/);
 assert.ok(regular(cards).some(p=>p.system==='airraid'));assert.ok(regular(cards).every(p=>g.offensePlays.some(q=>q.id===p.id)));
});

test('all committed defensive packages get four legal calls without substituting personnel',()=>{
 for(const personnel of Object.keys(PERSONNEL))for(const spot of [25,98]){
  const g=game({offense:1,personnel,spot,toGo:spot===98?2:10}),before=g.defenders.map(p=>p.id),cards=fourLegal(g);
  assert.equal(g.personnel,personnel);assert.ok(cards.every(p=>!p.system||p.system===PERSONNEL[personnel].system),personnel);assert.ok(cards.every(p=>p.kind!=='kick'));
  for(const p of cards){assert.equal(g.choose(p.id),true);assert.deepEqual(g.defenders.map(p=>p.id),before);assert.equal(g.personnel,personnel);}
 }
});

test('defensive goal-line, long-yardage and protect-the-lead pages change with public game situations',()=>{
 const goal=fourLegal(game({offense:1,spot:98,toGo:2}));assert.ok(goal.every(p=>p.id!=='prevent'));assert.ok(goal.some(p=>p.group==='pressure'||p.group==='man'));
 const long=fourLegal(game({offense:1,spot:40,down:3,toGo:16}));assert.notDeepEqual(ids(goal),ids(long));assert.ok(long.filter(p=>p.group==='zone').length>=2);
 const protecting=fourLegal(game({team:'SF',offense:1,spot:40,quarter:4,clock:8,margin:-7}));assert.ok(protecting.some(p=>p.id==='prevent'));assert.ok(protecting.every(p=>p.group!=='pressure'));
 const behind=fourLegal(game({team:'SF',offense:1,spot:40,quarter:4,clock:8,margin:7}));assert.ok(behind.every(p=>p.id!=='prevent'));
});

test('defensive suggestions use completed run/pass tendencies, never the current secret play or its routes',()=>{
 const g=game({offense:1,spot:45}),book=g.humanPlays;
 g.history[1]=Array(12).fill('run');const runs=suggestions(g,book);g.history[1]=Array(12).fill('pass');const passes=suggestions(g,book);assert.notDeepEqual(ids(runs),ids(passes));
 for(const key of ['play','playDefinition','formation'])Object.defineProperty(g,key,{get(){throw Error(`secret getter accessed: ${key}`);},configurable:true});
 g.rng=()=>{throw Error('defensive guidance consumed game RNG');};assert.deepEqual(suggestions(g,book),passes);
});

test('defensive suggestions can react to visible alignment while remaining identical for hidden calls with the same look',()=>{
 const g=game({offense:1,spot:45});
 const configure=id=>{g.play=id;g.setFormation();return ids(fourLegal(g));};
 assert.deepEqual(configure('sbzone'),configure('sbpa'));
 assert.deepEqual(configure('bunchrub'),configure('bunchpa'));
 const book=g.humanPlays;g.players[2].x=7;g.players[3].x=46;g.players[4].x=36.5;const balanced=suggestions(g,book);
 g.players[2].x=36;g.players[3].x=43;g.players[4].x=39;
 const bunched=suggestions(g,book);assert.ok(bunched.some(p=>/bunched receivers/.test(p.reason)));
 g.players[2].x=3;g.players[3].x=50;g.players[4].x=33;
 const wide=suggestions(g,book);assert.ok(wide.some(p=>/wide receiver alignment/.test(p.reason)));assert.notDeepEqual(ids(bunched),ids(balanced));
});

test('pocket-format offense and defense also keep four unique suggestions and the same goal-line rule',()=>{
 for(const offense of [0,1])for(const spot of [25,98]){
  const g=game({format:7,offense,spot,toGo:spot===98?2:10}),cards=fourLegal(g);
  if(offense===0&&spot===98){assert.equal(fg(cards)?.distance,19);fastGoalCalls(regular(cards));}
 }
});
