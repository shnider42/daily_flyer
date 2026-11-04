import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Game,PLAYS,DEFENSE,distance} from '../../daily_flyer/themes/pocket_gridiron_assets/engine.js';
import {passPlacement,passAim} from '../../daily_flyer/themes/pocket_gridiron_assets/passing.js';
import {movementInput,stickInput} from '../../daily_flyer/themes/pocket_gridiron_assets/controls.js';
import {buildTeam,TEAMS} from '../../daily_flyer/themes/pocket_gridiron_assets/roster.js';
import {bookPage,suggestions} from '../../daily_flyer/themes/pocket_gridiron_assets/presentation.js';
import {playDiagram} from '../../daily_flyer/themes/pocket_gridiron_assets/plays.js';
import {seededRandom} from '../../daily_flyer/themes/pocket_gridiron_assets/rules.js';
import {isBlocker,updateBlocking} from '../../daily_flyer/themes/pocket_gridiron_assets/blocking.js';
const data=JSON.parse(fs.readFileSync(new URL('../../daily_flyer/themes/pocket_gridiron_assets/rosters.json',import.meta.url)));
const team=abbr=>({...buildTeam(abbr,data),profile:null});
function make(play='curls',rng=()=>.5){const g=new Game(team('NE'),team('BUF'),'pro',rng,{format:7});g.beginDrive(0,25);g.choose(play);g.snap();g.liveTime=4;for(const d of g.defenders){d.x=50;d.y=95;d.speed=0;}for(const p of g.players.slice(2,5)){Object.assign(p,g.route(p,4));p.stun=0;}return g;}
function finishFlight(g,dt=.025){for(let i=0;i<200&&g.pass;i++)g.tickPass(dt);assert.equal(g.pass,null);}

test('current thumb direction and strength combine with keyboard; centering never retains an old lead',()=>{
 const v=stickInput(20,-20,40),p=movementInput(v,{});assert.ok(p.x>0&&p.y>0);assert.equal(movementInput({x:0,y:0},{arrowleft:true}).x,-1);assert.deepEqual(movementInput({x:0,y:0},{}),{x:0,y:0});assert.ok(Math.hypot(...Object.values(movementInput({x:1,y:1},{d:true,w:true})))<=1.000001);assert.equal(passAim({x:NaN,y:Infinity}).amount,0);
});
test('all eight stick directions move the throw in field coordinates; partial travel gives smaller offsets',()=>{
 const g=make(),p=g.players[2];p.speed=0;const center=passPlacement(g,p);
 for(const [x,y] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){const a=passPlacement(g,p,{x,y});if(x)assert.equal(Math.sign(a.x-center.x),x);if(y)assert.equal(Math.sign(a.y-center.y),y);}
 const soft=passPlacement(g,p,{x:.3,y:0}),hard=passPlacement(g,p,{x:1,y:0});assert.ok(soft.x-center.x<hard.x-center.x);assert.equal(passPlacement(g,p,{x:.03,y:0}).x,center.x);
});
test('assisted prediction respects a settled hook and advances a receiver still running a deep route',()=>{
 const hook=make(),wr=hook.players[2],aim=passPlacement(hook,wr);assert.equal(aim.y,wr.y);const deep=make('verts');assert.ok(passPlacement(deep,deep.players[2]).y>deep.players[2].y);
});
test('receiver adjusts on foot and ball destination remains fixed after release or later stick changes',()=>{
 const g=make('verts'),p=g.players[2],before={x:p.x,y:p.y};g.throwTo(0,{x:.25,y:.4});const dest={x:g.pass.tx,y:g.pass.ty};g.tickPass(.05);assert.ok(distance(p,before)<=p.speed*.05+.001);g.lastInput={x:-1,y:-1};g.tickPass(.05);assert.deepEqual({x:g.pass.tx,y:g.pass.ty},dest);finishFlight(g);assert.equal(g.stats.completions,1);assert.equal(g.carrier,p);assert.ok(distance(p,before)>0);
});
test('modest placement on a hook is forgiving, but hard overthrows can fall incomplete',()=>{
 const soft=make(),hard=make();for(const g of [soft,hard])g.players[2].speed=0;soft.throwTo(0,{x:0,y:.25});finishFlight(soft);assert.equal(soft.stats.completions,1);hard.throwTo(0,{x:0,y:1});finishFlight(hard);assert.equal(hard.stats.completions,0);assert.match(hard.lastResult,/out of reach/);assert.equal(hard.offense,0);
});
test('overthrowing a hook into a defender creates a real interception and live return',()=>{
 const g=make();g.players[2].speed=0;g.throwTo(0,{x:0,y:1});const d=g.defenders[4];d.x=g.pass.tx;d.y=g.pass.ty;finishFlight(g);assert.equal(g.phase,'return');assert.equal(g.carrier,d);assert.equal(g.stats.interceptions,1);assert.equal(g.stats.completions,0);assert.equal(g.offense,1);
});
test('a well-positioned defender can still drop or tip a misplaced ball instead of every mistake being a pick',()=>{
 let picks=0;for(let i=0;i<800;i++){const g=make('curls',seededRandom(810+i));g.players[2].speed=0;g.throwTo(0,{x:0,y:1});const d=g.defenders[4];d.x=g.pass.tx;d.y=g.pass.ty;finishFlight(g);if(g.offense===1)picks++;}
 assert.ok(picks>440&&picks<730,`${picks}/800 clean defender opportunities`);
});
test('back-shoulder placement pulls the destination behind the assisted throw and away from over-top coverage',()=>{
 const g=make('verts'),p=g.players[2],neutral=passPlacement(g,p),back=passPlacement(g,p,{x:-.35,y:-.65});assert.ok(back.y<neutral.y-1);assert.ok(back.x<neutral.x);g.throwTo(0,{x:-.35,y:-.65});finishFlight(g);assert.equal(g.carrier,p);assert.equal(g.stats.completions,1);
});
test('sideline throws are not clamped into catches and a nearby different receiver can catch a misplaced pass',()=>{
 const out=make('speedouts');out.players[2].x=1;out.throwTo(0,{x:-1,y:0});assert.ok(out.pass.tx<0);finishFlight(out);assert.match(out.lastResult,/out of bounds/);assert.equal(out.stats.completions,0);
 const other=make();other.players[2].speed=0;other.throwTo(0,{x:1,y:0});other.players[3].x=other.pass.tx;other.players[3].y=other.pass.ty;finishFlight(other);assert.equal(other.carrier,other.players[3]);assert.equal(other.stats.completions,1);
});
test('pause, illegal targets, range, and crossing the line preserve pass and RNG guards',()=>{
 const rng=seededRandom(17),g=make('verts',rng);const before=rng.getState();for(const i of [-1,3,NaN,.5])assert.equal(g.throwTo(i,{x:1,y:0}),false);g.paused=true;assert.equal(g.throwTo(0),false);g.paused=false;g.crossed=true;assert.equal(g.throwTo(0),false);assert.equal(rng.getState(),before);assert.equal(g.stats.attempts,0);
});
test('all new plays have distinct finite routes and diagrams, every defense assigns all seven players',()=>{
 const g=make();const shapes=new Set();for(const p of PLAYS){g.beginDrive(0,25);assert.equal(g.choose(p.id),true);assert.ok(playDiagram(p.id));if(p.kind==='pass'){const route=g.players.slice(2,5).map(r=>[1,2,4,6].map(t=>g.route(r,t)));assert.ok(route.flat().every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));shapes.add(JSON.stringify(route));}}
 assert.equal(shapes.size,PLAYS.filter(p=>p.kind==='pass').length);
 for(const d of DEFENSE){g.beginDrive(1,25);g.choose(d.id);g.snap(1);for(const p of g.defenders){const t=g.coverageTarget(p);assert.ok(Number.isFinite(t.x)&&Number.isFinite(t.y),d.id+':'+p.slot);}for(let i=0;i<40;i++)g.tick(.05);assert.ok(g.defenders.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));}
});
test('QB draw keeps the quarterback and shifts blockers from pocket protection to a lead run',()=>{
 const g=make('qbdraw');g.beginDrive(0,25);g.choose('qbdraw');g.snap();assert.equal(g.carrier,g.players[0]);assert.equal(isBlocker(g,g.players[2]),false);g.liveTime=1;assert.equal(isBlocker(g,g.players[2]),true);const rb=g.players[1],before=rb.y;updateBlocking(g,.05);assert.ok(rb.y>before);assert.equal(g.canPass,false);
});
test('all 32 team books expose their new calls; paged filters preserve access without giant phone grids',()=>{
 const offense=new Set(),defense=new Set();for(const t of TEAMS){const g=new Game(buildTeam(t.abbr,data),buildTeam(t.abbr==='BUF'?'NE':'BUF',data));g.beginDrive(0,25);assert.ok([39,40].includes(g.offensePlays.length));assert.equal(g.defensePlays.length,18);g.offensePlays.forEach(p=>offense.add(p.id));g.beginDrive(1,25);g.defensePlays.forEach(p=>defense.add(p.id));g.beginDrive(0,25);assert.equal(suggestions(g,g.humanPlays).length,3);const seen=[];for(let i=0;i<bookPage(g.humanPlays).pages;i++){const page=bookPage(g.humanPlays,'all',i);assert.ok(page.plays.length<=6);seen.push(...page.plays.map(p=>p.id));}assert.equal(new Set(seen).size,g.offensePlays.length);assert.ok(bookPage(g.humanPlays,'run',99).plays.every(p=>p.kind==='run'));}
 assert.equal(offense.size,91);assert.equal(defense.size,24);
});

test('new coverages create actual spies, brackets, zone drops and uncovered deep risks',()=>{
 const g=make();function call(id){g.beginDrive(1,25);g.choose(id);g.snap(1);g.liveTime=1;}
 call('firezone');assert.ok(g.coverageTarget(g.defenders[1]).y>g.spot+3);assert.equal(g.coverageTarget(g.defenders[2]),g.carrier);
 call('cover0');assert.equal(g.coverageTarget(g.defenders[6]),g.carrier);
 call('spy');const before=g.coverageTarget(g.defenders[3]);g.carrier.x+=6;assert.ok(g.coverageTarget(g.defenders[3]).x>before.x);assert.ok(g.coverageTarget(g.defenders[3]).y>g.carrier.y);
 call('bracketleft');g.players[2].x=12;g.players[2].y=43;assert.ok(g.coverageTarget(g.defenders[3]).y<43);assert.ok(g.coverageTarget(g.defenders[6]).y>43);assert.ok(Math.abs(g.coverageTarget(g.defenders[6]).x-12)<4);
 call('cover4');assert.ok(g.defenders.slice(3).every(d=>g.coverageTarget(d).y>g.spot+20));
});
test('full forward lead remains usable on open deep routes and small hook adjustments stay forgiving',()=>{
 let deep=0,hook=0;for(let i=0;i<200;i++){for(const [play,input] of [['verts',{x:0,y:1}],['curls',{x:0,y:.3}]]){const g=make(play,seededRandom(3000+i));g.liveTime=3;for(const p of g.players.slice(2,5))Object.assign(p,g.route(p,3));g.throwTo(0,input);finishFlight(g);if(play==='verts')deep+=g.stats.completions;else hook+=g.stats.completions;}}
 assert.ok(deep>120,`deep full-lead catches ${deep}/200`);assert.ok(hook>180,`hook small-lead catches ${hook}/200`);
});
test('multiple defenders at the landing point each get at most one opportunity before an incompletion',()=>{
 const g=make();g.players[2].speed=0;g.throwTo(0,{x:0,y:1});g.pass.elapsed=g.pass.duration-.001;for(const i of [4,5]){g.defenders[i].x=g.pass.tx;g.defenders[i].y=g.pass.ty;}let rolls=0;g.rng=()=>++rolls===1?.99:0;g.tickPass(.001);assert.equal(g.offense,1);assert.equal(rolls,2);
});
test('an aim beyond the quarterback arm range gives feedback without consuming the pass',()=>{
 const g=make('verts');g.players[2].x=7;g.players[2].y=95;assert.equal(g.throwTo(0,{x:0,y:1}),false);assert.equal(g.canPass,true);assert.equal(g.stats.attempts,0);assert.equal(g.events.at(-1).text,'OUT OF RANGE');
});
