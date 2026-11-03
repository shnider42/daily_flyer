import test from 'node:test';import assert from 'node:assert/strict';
import {DuelGame} from '../../server/pgi/game.mjs';
import {DuelRooms,PROTOCOL} from '../../server/pgi/rooms.mjs';
import {Game} from '../../daily_flyer/themes/pocket_gridiron_assets/engine.js';
function drive(offense=0){const g=new DuelGame('NE','BUF','quick',9);g.beginDrive(offense,25);g.chooseFor(offense,'slants');g.chooseFor(1-offense,'zone');return g;}
const peer=()=>({messages:[],send(m){this.messages.push(m)},close(){this.closed=true}});
function roomSetup(){let now=1000;const rooms=new DuelRooms({now:()=>now}),a=peer(),b=peer();rooms.handle(a,{type:'create',protocol:PROTOCOL,home:'NE',away:'BUF',length:'quick'});const r=rooms.rooms.get(a.roomId);rooms.handle(b,{type:'join',protocol:PROTOCOL,roomId:r.id});return {rooms,a,b,r,advance(dt){now+=dt*1000;rooms.step(dt)}};}
test('both teams call privately and independently control offense and defense',()=>{
 for(const side of [0,1]){const g=drive(side);assert.equal(g.phase,'ready');assert.equal(g.command(1-side,'snap'),false);g.command(side,'snap');const runner=g.carrier,d=g.defenders[g.selected],before=[runner.y,d.x];g.tickBoth(.05,side===0?[{x:0,y:1},{x:1,y:0}]:[{x:1,y:0},{x:0,y:1}]);assert.ok(runner.y>before[0]);assert.ok(d.x>before[1]);assert.equal(g.snapshot(1-side).play,'slants');assert.equal(typeof g.snapshot(side).calls[1-side],'boolean');assert.equal(g.command(1-side,'throwTo',[0]),false);assert.equal(g.command(side,'throwTo',[0,{x:0,y:0}]),true);}
});
test('snap waits for both calls, and an interception swaps control without selecting an AI offense',()=>{
 const g=new DuelGame('NE','BUF');g.beginDrive(1,25);g.chooseFor(1,'verts');assert.equal(g.phase,'call');assert.equal(g.command(1,'snap'),false);assert.equal(g.snapshot(0).calls[1],true);g.chooseFor(0,'zone');g.command(1,'snap');const d=g.defenders[4];d.y=50;g.startTurnover(d,'interception');assert.equal(g.offense,0);assert.equal(g.carrier,d);const y=d.y;g.tickBoth(.05,[{x:0,y:1},{x:0,y:0}]);assert.ok(d.y>y);
});
test('penalty decisions belong to the beneficiary and kicking belongs to the kicker',()=>{
 const g=drive();g.command(0,'snap');g.flag('holding',0,g.players[5]);g.finish('touchdown',100);assert.equal(g.phase,'penalty');assert.equal(g.command(0,'resolvePenalty',[false]),false);g.command(1,'resolvePenalty',[true]);assert.equal(g.phase,'dead');assert.deepEqual(g.scores,[0,0]);
 const h=new DuelGame('NE','BUF');assert.equal(h.command(0,'kickAction'),false);h.command(1,'kickAction');assert.equal(h.phase,'kick_charge');h.tickBoth(.05,[{x:-1,y:0},{x:1,y:0}]);assert.ok(h.special.aim>0);h.command(1,'kickAction');assert.equal(h.phase,'kick_flight');
});
test('play-clock expiry advances both missing calls and kick setup',()=>{const g=new DuelGame('NE','BUF');g.playClock=.01;g.tickBoth(.02);assert.equal(g.phase,'kick_flight');g.beginDrive(0,25);g.playClock=.01;g.tickBoth(.02);assert.equal(g.phase,'live');});
test('room membership, readiness and authenticated replacement preserve the exact simulation',()=>{
 const {rooms,a,b,r}=roomSetup();rooms.handle(a,{type:'ready'});assert.equal(r.status,'lobby');rooms.handle(b,{type:'ready'});assert.equal(r.status,'pregame');rooms.handle(a,{type:'resume'});rooms.handle(b,{type:'resume'});assert.equal(r.status,'playing');const g=r.game;
 const attacker=peer();rooms.handle(attacker,{type:'join',protocol:PROTOCOL,roomId:r.id,token:'bad',replace:true});assert.equal(r.players[0].peer,a);
 const token=r.players[0].token,c=peer();rooms.handle(c,{type:'join',protocol:PROTOCOL,roomId:r.id,token,replace:true});assert.equal(r.game,g);assert.equal(r.status,'paused');assert.equal(r.players[0].peer,c);rooms.disconnect(a);assert.equal(r.players[0].peer,c);rooms.handle(a,{type:'leave'});assert.ok(rooms.rooms.has(r.id));
 rooms.handle(c,{type:'resume'});rooms.handle(b,{type:'resume'});assert.equal(r.status,'playing');
});
test('stale controls stop and a lost stream freezes the shared clock',()=>{
 const {rooms,a,b,r,advance}=roomSetup();rooms.handle(a,{type:'ready'});rooms.handle(b,{type:'ready'});rooms.handle(a,{type:'resume'});rooms.handle(b,{type:'resume'});r.game.beginDrive(0,25);r.game.chooseFor(0,'dive');r.game.chooseFor(1,'zone');r.game.command(0,'snap');
 for(const p of [a,b])rooms.handle(p,{type:'input',seq:1,epoch:r.game.epoch,x:0,y:1});const y=r.game.carrier.y;
 for(let i=0;i<12;i++)advance(.05);const stopped=r.game.carrier.y;assert.ok(stopped>y);for(let i=0;i<10;i++)advance(.05);assert.equal(r.game.carrier.y,stopped);
 for(let i=0;i<10;i++)advance(.05);assert.equal(r.status,'paused');const clock=r.game.clock;advance(.05);assert.equal(r.game.clock,clock);
});
test('complete two-human matches traverse kicks, calls, both possessions, halftime, and final',()=>{
 const g=new DuelGame('NE','BUF','quick',77);let ticks=0,halves=0;const possessions=new Set();
 while(g.phase!=='final'&&ticks++<45000){
  possessions.add(g.offense);
  if(g.phase==='halftime'){halves++;g.resumeHalftime();}
  if(g.phase==='penalty')g.command(g.penaltyReview.beneficiary,'resolvePenalty',[true]);
  if(g.phase==='call'&&g.down===4&&g.spot>=62)g.command(g.offense,'kick',['fieldgoal']);
  if(g.phase==='call'){g.chooseFor(g.offense,ticks%2?'dive':'slants');g.chooseFor(1-g.offense,'zone');}
  if(g.phase==='ready')g.command(g.offense,'snap');
  if(g.phase==='kick_ready'||g.phase==='kick_charge'&&g.special.power>.7)g.command(g.special.kickingTeam,'kickAction');
  if(g.phase==='kick_accuracy'&&Math.abs(g.special.accuracy-.5)<.08)g.command(g.special.kickingTeam,'kickAction');
  if(g.canPass&&g.liveTime>1)g.command(g.offense,'throwTo',[ticks%3]);
  if(g.isLive&&ticks%20===0){g.command(g.offense,'burst');g.command(1-g.offense,'switchDefender');g.command(1-g.offense,'burst');}
  const d=g.defenders[g.selected],ball=g.loose||g.pass||g.carrier,inputs=[{x:0,y:0},{x:0,y:0}];inputs[g.offense]={x:Math.sin(ticks*.01)*.5,y:1};inputs[1-g.offense]={x:ball.x-d.x,y:ball.y-d.y};g.tickBoth(.05,inputs);
 }
 assert.equal(g.phase,'final',`stuck ${g.phase} ${g.clock} ${g.scores}`);assert.equal(halves,1);assert.equal(possessions.size,2);assert.ok(g.box.every(b=>b.plays>0));
});
