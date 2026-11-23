import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {CoopRooms} from '../server/rooms.mjs';
import {createCoopServer,allowedOrigin} from '../server/index.mjs';
import {PROTOCOL,cleanInput,newSecret,secretHash,verifySecret,RateLimit} from '../server/protocol.mjs';
import {SnapshotDeltaDecoder} from '../public/snapshot-delta.mjs';

class Peer {
  constructor(){this.messages=[];this.wire=[];this.states=[];this.bufferedAmount=0;this.decoder=new SnapshotDeltaDecoder();}
  send(packet){this.messages.push(structuredClone(packet));return true;}
  sendRaw(data){this.wire.push(JSON.parse(data));const decoded=this.decoder.decode(JSON.parse(data));assert.ok(decoded,'Every snapshot must decode against the last sent baseline');this.states.push(decoded);return true;}
  close(code,reason){this.closed={code,reason};}
  get session(){return this.messages.find(packet=>packet.type==='joined')?.session;}
  get latest(){return this.states.at(-1);}
}
function setup({role='leader',duo=true,...options}={}){
  let time=100000;
  const rooms=new CoopRooms({now:()=>time,seed:()=>63,...options}),host=new Peer(),guest=new Peer();
  rooms.handle(host,{type:'create',protocol:PROTOCOL,name:'Host',role,mission:0,difficulty:'standard'});
  const room=rooms.rooms.get(host.session.code);
  if(duo)rooms.handle(guest,{type:'join',protocol:PROTOCOL,code:room.code,name:'Guest'});
  const command=(peer,type,extra={})=>rooms.handle(peer,{type,id:`command-${++command.sequence}`,epoch:room.epoch,...extra});command.sequence=0;
  const step=(count=1)=>{for(let i=0;i<count;i++){time+=1000/30;rooms.step();}};
  const advance=ms=>{time+=ms;rooms.step();};
  const start=()=>{command(host,'start');room.game.enemies=[];room.game.maxEnemies=0;};
  return {rooms,room,host,guest,command,step,advance,start};
}

test('invitation rooms retain exactly four actors and host authority is independent of squad leadership',()=>{
  const {rooms,room,host,guest,command,start}=setup({role:'member'});
  assert.match(room.code,/^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(room.players.length,2);assert.equal(room.game.squad.length,4);
  assert.equal(room.game.squad.filter(a=>a.human).length,2);
  assert.equal(room.game.squad.filter(a=>!a.human).length,2);
  assert.equal(host.latest.state.role,'member');assert.equal(guest.latest.state.role,'leader');
  assert.equal(host.latest.room.hostId,host.session.playerId);
  assert.equal(host.latest.room.leaderId,guest.session.playerId);
  const intruder=new Peer();rooms.handle(intruder,{type:'join',protocol:PROTOCOL,code:room.code});
  assert.equal(intruder.messages.at(-1).code,'room-full');assert.equal(room.players.length,2);
  command(guest,'configure',{mission:1});assert.equal(guest.messages.at(-1).ok,false);assert.equal(room.mission,0);
  start();command(host,'order',{order:'hold'});assert.equal(host.messages.at(-1).ok,false);
  command(guest,'order',{order:'hold'});assert.equal(guest.messages.at(-1).ok,true);assert.equal(room.game.order.type,'hold');
  command(host,'order',{order:'help'});assert.equal(host.messages.at(-1).ok,true);
  command(guest,'restart');assert.equal(guest.messages.at(-1).ok,false);
});

test('two controls affect only their assigned soldiers; stale controls stop without handing a connected soldier to AI',()=>{
  const {rooms,room,host,guest,start,step,advance}=setup();start();
  const [hale,mercer]=room.game.squad,before=[{x:hale.x,y:hale.y},{x:mercer.x,y:mercer.y}];
  rooms.handle(host,{type:'input',epoch:room.epoch,seq:1,actorId:mercer.id,input:{moveX:100,hp:9999}});
  rooms.handle(guest,{type:'input',epoch:room.epoch,seq:1,actorId:hale.id,input:{moveY:-1}});
  step();assert.ok(hale.x>before[0].x);assert.equal(hale.y,before[0].y);
  assert.equal(mercer.x,before[1].x);assert.ok(mercer.y<before[1].y);assert.notEqual(hale.hp,9999);
  const stopped={x:hale.x,y:hale.y};advance(600);
  assert.deepEqual({x:hale.x,y:hale.y},stopped);assert.equal(hale.human,true);assert.equal(room.game.humanIds.length,2);
  rooms.handle(host,{type:'input',epoch:room.epoch,seq:1,input:{moveY:1}});step();assert.deepEqual({x:hale.x,y:hale.y},stopped);
  rooms.snapshot(room);assert.equal(host.latest.ack,1);assert.equal(guest.latest.ack,1);
});

test('one-shot reload and smoke are latched once while movement updates are coalesced',()=>{
  const {rooms,room,host,start,step}=setup();start();const actor=room.game.squad[0];actor.ammo=5;
  rooms.handle(host,{type:'input',epoch:room.epoch,seq:1,input:{moveX:1,smoke:true,reload:true}});
  rooms.handle(host,{type:'input',epoch:room.epoch,seq:2,input:{moveX:0}});
  const x=actor.x;step(6);assert.equal(actor.x,x);assert.equal(actor.smokes,2);assert.equal(room.game.smokes.length,1);
  assert.ok(actor.reloadTimer>0);assert.equal(host.latest.ack,2);
});

test('the grenadier keeps finite launcher ownership and observation ends on stale input or a role exchange',()=>{
  const {rooms,room,host,guest,start,step,advance,command}=setup();start();
  const [hale,mercer]=room.game.squad;room.game.civilians=[];
  const aim={aimX:mercer.x-200,aimY:mercer.y};
  rooms.handle(guest,{type:'input',epoch:room.epoch,seq:1,input:{...aim,grenade:true}});
  rooms.handle(guest,{type:'input',epoch:room.epoch,seq:2,input:{...aim}});
  step();assert.equal(mercer.grenades,3);assert.equal(room.game.grenades.length,1);assert.equal(room.game.grenades[0].owner,mercer.id);
  rooms.snapshot(room);assert.equal(host.latest.state.grenades.length,1);assert.equal(guest.latest.state.squad[1].role,'grenadier');
  step(6);assert.equal(mercer.grenades,3,'one action cannot consume another round on a later server tick');
  rooms.handle(guest,{type:'input',epoch:room.epoch,seq:3,input:{...aim,observe:true,fire:true}});
  const ammo=mercer.ammo;step();assert.equal(mercer.observing,true);assert.equal(mercer.ammo,ammo);
  advance(600);assert.equal(mercer.observing,false);
  mercer.grenadeCooldown=0;
  rooms.handle(guest,{type:'input',epoch:room.epoch,seq:4,input:{...aim,observe:true,grenade:true}});
  step();assert.equal(mercer.grenades,3,'observation blocks firing the launcher');
  rooms.handle(guest,{type:'input',epoch:room.epoch,seq:5,input:{...aim}});step();assert.equal(mercer.grenades,3,'a blocked action is not replayed after observation');
  rooms.handle(guest,{type:'input',epoch:room.epoch,seq:6,input:{...aim,grenade:true,observe:true}});
  command(host,'swap_roles');step();
  assert.equal(mercer.grenades,3);assert.equal(mercer.observing,false);assert.equal(hale.grenades,0);
  assert.equal(room.game.humanIds.length,2);assert.equal(room.game.squad.filter(a=>!a.human).length,2);
});

test('old map, movement and breach protocol versions cannot join a current authoritative room',()=>{
  const {rooms,room}=setup(),old=new Peer();
  rooms.handle(old,{type:'join',protocol:PROTOCOL-1,code:room.code,name:'Old tab'});
  assert.equal(old.messages.at(-1).code,'protocol');assert.match(old.messages.at(-1).reason,/Refresh/);
  assert.equal(old.closed.code,4001);assert.equal(room.players.length,2);
});

test('role exchange is atomic, idempotent and rejects controls queued for the previous soldier',()=>{
  const {rooms,room,host,guest,start,command}=setup({role:'member'});start();
  const epoch=room.epoch,hostId=room.hostId,ids=room.game.squad.map(a=>a.id),time=room.game.time;
  const packet={type:'swap_roles',id:'swap-once',epoch};rooms.handle(host,packet);
  assert.equal(room.hostId,hostId);assert.equal(room.epoch,epoch+1);assert.equal(room.game.time,time);
  assert.equal(host.latest.state.role,'leader');assert.equal(guest.latest.state.role,'member');
  assert.equal(host.latest.actorId,ids[0]);assert.equal(guest.latest.actorId,ids[1]);
  rooms.handle(host,packet);assert.equal(room.epoch,epoch+1);assert.equal(host.messages.at(-1).ok,true);
  rooms.handle(host,{type:'input',seq:20,epoch,input:{fire:true}});assert.equal(room.players[0].seq,0);
  command(guest,'swap_roles');assert.equal(guest.messages.at(-1).ok,false);
  command(guest,'order',{order:'move',point:{x:680,y:1340}});assert.equal(guest.messages.at(-1).ok,false);
  assert.deepEqual(room.game.squad.map(a=>a.id),ids);assert.equal(room.game.humanIds.length,2);
});

test('a lost connection gets immediate AI, host promotion after grace, and an authenticated return to the same soldier',()=>{
  const {rooms,room,host,guest,start,advance}=setup();start();
  const session=host.session,actor=room.game.squad[0];actor.hp=70;
  rooms.disconnect(host);assert.equal(actor.human,false);assert.equal(room.game.squad.filter(a=>a.human).length,1);
  assert.equal(room.hostId,session.playerId);advance(4999);assert.equal(room.hostId,session.playerId);
  advance(2);assert.equal(room.hostId,guest.session.playerId);
  const denied=new Peer();rooms.handle(denied,{type:'resume',protocol:PROTOCOL,...session,token:newSecret()});
  assert.equal(denied.messages.at(-1).code,'invalid-session');assert.equal(actor.human,false);
  const back=new Peer();rooms.handle(back,{type:'resume',protocol:PROTOCOL,...session});
  assert.equal(back.latest.actorId,actor.id);assert.equal(actor.hp,70);assert.equal(actor.human,true);
  assert.equal(room.hostId,guest.session.playerId);assert.equal(back.latest.ack,0);assert.equal(room.players.length,2);
  const publicJson=JSON.stringify(back.latest);assert.equal(publicJson.includes(session.token),false);assert.equal(publicJson.includes('tokenHash'),false);
  const replacement=new Peer();rooms.handle(replacement,{type:'resume',protocol:PROTOCOL,...session});
  assert.equal(back.closed.code,4009);rooms.disconnect(back);assert.equal(actor.human,true);assert.equal(room.players[0].peer,replacement);
});

test('reserved slots expire; rooms freeze with no humans, then expire without leaving simulation work behind',()=>{
  const a=setup();a.start();a.rooms.disconnect(a.guest);a.advance(30001);
  const expired=new Peer();a.rooms.handle(expired,{type:'resume',protocol:PROTOCOL,...a.guest.session});
  assert.equal(expired.messages.at(-1).code,'invalid-session');assert.equal(a.room.players.length,1);
  const newGuest=new Peer();a.rooms.handle(newGuest,{type:'join',protocol:PROTOCOL,code:a.room.code,name:'New guest'});
  assert.equal(a.room.players.length,2);assert.equal(newGuest.latest.actorId,a.room.game.squad[1].id);
  a.rooms.disconnect(a.host);a.rooms.disconnect(newGuest);const time=a.room.game.time;
  a.advance(10000);assert.equal(a.room.game.time,time);a.advance(51000);assert.equal(a.rooms.rooms.size,0);
  const b=setup({duo:false,maxRooms:1,idleMs:100});
  const extra=new Peer();b.rooms.handle(extra,{type:'create',protocol:PROTOCOL});assert.equal(extra.messages.at(-1).code,'capacity');
  b.advance(101);assert.equal(b.rooms.rooms.size,0);assert.equal(b.host.closed.code,4004);
});

test('leaving releases a slot immediately and promotes the remaining player without changing their squad role',()=>{
  const {rooms,room,host,guest,start}=setup();start();const originalActor=guest.latest.actorId;
  rooms.handle(host,{type:'leave'});assert.equal(room.players.length,1);assert.equal(room.hostId,guest.session.playerId);
  assert.equal(room.game.squad.length,4);assert.equal(room.game.squad.filter(a=>a.human).length,1);
  assert.equal(guest.latest.actorId,originalActor);assert.equal(guest.latest.state.role,'member');
  rooms.handle(guest,{type:'leave'});assert.equal(rooms.rooms.size,0);
});

test('lobby controls, restart and mission configuration stay authoritative',()=>{
  const {rooms,room,host,guest,command,start,step}=setup();
  command(host,'configure',{mission:2,difficulty:'story'});assert.equal(room.mission,2);assert.equal(room.game.difficulty,'story');
  rooms.handle(host,{type:'input',epoch:room.epoch,seq:2,input:{fire:true,smoke:true}});step(3);
  assert.equal(room.game.time,0);assert.equal(room.game.squad[0].smokes,3);
  start();step(3);assert.ok(room.game.time>0);
  command(host,'configure',{mission:0});assert.equal(host.messages.at(-1).ok,false);assert.equal(room.mission,2);
  command(guest,'return_lobby');assert.equal(guest.messages.at(-1).ok,false);
  command(host,'restart');assert.equal(room.game.time,0);assert.equal(host.latest.room.status,'playing');
  command(host,'return_lobby');assert.equal(host.latest.room.status,'lobby');assert.equal(room.game.time,0);
  command(host,'configure',{mission:99});assert.equal(host.messages.at(-1).ok,false);assert.equal(room.mission,2);
});

test('Farwake deltas resume from the last successful send and full resync includes current objective and mutable props',()=>{
  const {rooms,room,host,start,step}=setup();start();step(3);
  const baseline=host.deltaEncoder.sequence,count=host.wire.length;
  assert.ok(Object.hasOwn(host.wire.at(-1),'baseSnapshotId'));
  host.bufferedAmount=100;step(6);assert.equal(host.wire.length,count);assert.equal(host.deltaEncoder.sequence,baseline);
  host.bufferedAmount=0;step(3);assert.equal(host.wire.at(-1).baseSnapshotId,baseline);
  assert.equal(host.latest.state.time,room.game.time);assert.deepEqual(host.latest.state.objective,room.game.objective);
  assert.equal(host.latest.state.world,undefined);assert.equal(host.latest.state.grid,undefined);
  assert.ok(host.latest.state.squad.every(a=>!Object.hasOwn(a,'path')));
  assert.equal(host.latest.worldProps.length,room.game.world.props.length);
  room.game.world.props[0].cleared=true;rooms.handle(host,{type:'resync'});
  assert.equal(Object.hasOwn(host.wire.at(-1),'baseSnapshotId'),false);assert.equal(host.latest.worldProps[0].cleared,true);
  assert.ok(rooms.metrics.skipped>=2);
});

test('radio authority follows assigned soldiers, recommendations survive reconnect, and dead remains are shared',()=>{
  const {rooms,room,host,guest,start,step,command}=setup({role:'member'});start();
  room.game.time=8;step();const decision=room.game.story.activeDecision;
  command(host,'story_choice',{decisionId:decision.id,optionId:'reposition',actorId:room.game.squad[0].id});
  assert.equal(host.messages.at(-1).ok,true);assert.equal(room.game.stages.find(p=>p.id==='collection-hold').duration,55);
  assert.equal(room.game.story.activeDecision.recommendation.actorId,room.game.squad[1].id,'a forged actorId cannot turn the room host into the squad leader');
  assert.deepEqual(host.latest.state.story,guest.latest.state.story);
  const packet={type:'story_choice',id:'final-radio-order',epoch:room.epoch,decisionId:decision.id,optionId:'reposition'};
  rooms.handle(guest,packet);assert.equal(room.game.stages.find(p=>p.id==='collection-hold').duration,63);assert.equal(room.game.story.activeDecision,null);
  rooms.handle(guest,packet);assert.equal(room.game.stages.find(p=>p.id==='collection-hold').duration,63,'a repeated command acknowledgement cannot apply the cost twice');
  room.game.enemies.push({id:999,team:'enemy',kind:'rifleman',x:200,y:1720,angle:0,hp:0,maxHp:72,alive:false,downed:true,deathTime:0});
  room.game.bloodstains.push({id:'blood-network',x:200,y:1720,angle:0,amount:1,seed:4,at:8,seen:true});
  step();rooms.snapshot(room,{reset:true});
  assert.ok(host.latest.state.bodies.some(body=>body.actorId===999));assert.deepEqual(host.latest.state.bodies,guest.latest.state.bodies);
  const session=guest.session;rooms.disconnect(guest);const back=new Peer();rooms.handle(back,{type:'resume',protocol:PROTOCOL,...session});
  assert.deepEqual(back.latest.state.story,room.game.story);assert.deepEqual(back.latest.state.bodies,room.game.bodies);assert.deepEqual(back.latest.state.bloodstains,room.game.bloodstains);
  assert.equal(back.latest.state.story.resolved[decision.id].optionId,'reposition');
  command(host,'restart');room.game.enemies=[];room.game.maxEnemies=0;room.game.time=8;step();rooms.disconnect(back);
  command(host,'story_choice',{decisionId:room.game.story.activeDecision.id,optionId:'reposition'});
  assert.equal(room.game.stages.find(p=>p.id==='collection-hold').duration,63,'a remaining member can recommend a real change to the AI leader');
});

test('only the host can continue a completed operation; carry and assignments survive restart but fresh lobby missions reset them',()=>{
  const {rooms,room,host,guest,start,step,command}=setup({role:'member'});start();
  command(host,'continue_operation');assert.equal(host.messages.at(-1).ok,false);assert.equal(room.mission,0);
  room.game.time=8;step();command(guest,'story_choice',{decisionId:room.game.story.activeDecision.id,optionId:'original'});
  room.game.story.consequences.medicalSpent=1;room.game.story.consequences.smokeSpent=1;room.game.stats.civilianHarm=1;room.game.status='won';
  const assignments=room.players.map(p=>({id:p.id,slot:p.slot})),epoch=room.epoch;
  command(guest,'continue_operation');assert.equal(guest.messages.at(-1).ok,false);assert.equal(room.mission,0);
  const packet={type:'continue_operation',id:'continue-once',epoch,campaign:{version:1,fromMission:0,medicalDebt:0}};
  rooms.handle(host,packet);assert.equal(host.messages.at(-1).ok,true);assert.equal(room.mission,1);assert.equal(room.game.status,'playing');
  assert.deepEqual(room.players.map(p=>({id:p.id,slot:p.slot})),assignments);assert.equal(room.game.squad.length,4);assert.equal(room.game.squad.filter(a=>a.human).length,2);
  assert.deepEqual(room.game.campaign,{version:1,fromMission:0,medicalDebt:1,smokeDebt:1,fatigue:1,civilianHarm:1,aided:0});
  assert.equal(room.game.squad[2].medkits,5);assert.equal(room.game.squad[0].smokes,2);assert.equal(room.game.stages.find(p=>p.id==='crash-entry').duration,4);
  assert.deepEqual(host.latest.init.campaign,room.game.campaign);assert.deepEqual(host.latest.state.campaign,guest.latest.state.campaign);
  assert.deepEqual(room.game.bodies,[]);assert.deepEqual(room.game.bloodstains,[]);
  rooms.handle(host,packet);assert.equal(room.mission,1,'replaying Continue cannot skip a chapter');
  command(host,'restart');assert.equal(room.game.squad[2].medkits,5);assert.equal(room.game.stages.find(p=>p.id==='crash-entry').duration,4,'restart reapplies initial carry once');
  const carry=structuredClone(room.game.campaign);command(host,'swap_roles');assert.deepEqual(room.game.campaign,carry);assert.equal(room.game.squad.length,4);
  command(host,'return_lobby');assert.equal(room.campaign,null);assert.equal(room.game.campaign,null);assert.equal(room.game.squad[2].medkits,6);
  command(host,'configure',{mission:3});command(host,'start');room.game.status='won';command(host,'continue_operation');
  assert.equal(host.messages.at(-1).ok,false);assert.equal(room.mission,3,'the final chapter has no invented fifth mission');
});

test('a real co-op launcher shares a newly eligible frontage breach through reconnect and resets on restart',()=>{
  const {rooms,room,host,guest,start,step,command}=setup({seed:()=>17});start();
  Object.assign(room.game.squad[1],{x:1355,y:226});room.game.civilians=[];
  rooms.handle(guest,{type:'input',epoch:room.epoch,seq:1,input:{grenade:true,aimX:1355,aimY:344}});step(18);
  assert.equal(room.game.destruction.revision,1);assert.equal(room.game.squad[1].grenades,3);
  const opening=room.game.destruction.breaches[0];assert.equal(opening.wallId,'b02:north-left');assert.equal(opening.to-opening.from,50);
  assert.deepEqual(host.latest.state.destruction,room.game.destruction);assert.deepEqual(guest.latest.state.destruction,room.game.destruction);
  const blast=host.latest.state.soundEvents.find(e=>e.type==='explosion');assert.ok(blast.breached);assert.equal(blast.sourceActorId,room.game.squad[1].id);assert.ok(blast.sourceTime<=blast.time);
  command(host,'breach',{x:1000,y:1000});assert.equal(host.messages.at(-1).ok,false);assert.equal(room.game.destruction.revision,1,'there is no client-supplied geometry command');
  const session=guest.session;rooms.disconnect(guest);const back=new Peer();rooms.handle(back,{type:'resume',protocol:PROTOCOL,...session});
  assert.deepEqual(back.latest.state.destruction,room.game.destruction);assert.equal(back.latest.actorId,room.game.squad[1].id);
  command(host,'restart');assert.equal(room.game.destruction.revision,0);assert.equal(room.game.world.geometryRevision,0);assert.equal(back.latest.state.destruction.revision,0);
  assert.equal(room.game.squad.length,4);assert.equal(room.game.squad.filter(a=>a.human).length,2);
});

test('untrusted controls, session verification and origin permissions are bounded',()=>{
  const input=cleanInput({moveX:999,moveY:999,aimX:Infinity,aimY:1e9,fire:'yes',smoke:true,grenade:'yes',observe:1});
  assert.ok(Math.abs(Math.hypot(input.moveX,input.moveY)-1)<1e-12);assert.equal(input.aimX,null);assert.equal(input.aimY,3100);
  assert.equal(input.fire,false);assert.equal(input.smoke,true);assert.equal(input.grenade,false);assert.equal(input.observe,false);
  const token=newSecret();assert.equal(verifySecret(token,secretHash(token)),true);assert.equal(verifySecret(newSecret(),secretHash(token)),false);
  const bucket=new RateLimit(2,2,0);assert.equal(bucket.take(0),true);assert.equal(bucket.take(0),true);assert.equal(bucket.take(0),false);assert.equal(bucket.take(500),true);
  assert.equal(allowedOrigin(undefined,'authority.test'),true);assert.equal(allowedOrigin('https://authority.test','authority.test'),true);
  assert.equal(allowedOrigin('http://127.0.0.1:5173','authority.test'),true);assert.equal(allowedOrigin('http://localhost:3000','authority.test'),true);
  assert.equal(allowedOrigin('https://chalk.test','authority.test',['https://chalk.test']),true);
  assert.equal(allowedOrigin('https://chalk.test.evil.test','authority.test',['https://chalk.test']),false);
  assert.equal(allowedOrigin('null','authority.test'),false);
});

async function socketClient(url,options={}){
  const ws=new WebSocket(url,options),decoder=new SnapshotDeltaDecoder(),packets=[],waiting=[];
  ws.on('message',raw=>{
    const packet=JSON.parse(raw.toString()),message=packet.type==='snapshot'?decoder.decode(packet):packet;
    if(message===null)return;packets.push(message);
    for(const pending of [...waiting])if(pending.predicate(message)){waiting.splice(waiting.indexOf(pending),1);clearTimeout(pending.timer);pending.resolve(message);}
  });
  ws.on('error',()=>{});await once(ws,'open');
  return {ws,packets,send:packet=>ws.send(JSON.stringify(packet)),
    wait(predicate){const prior=packets.find(predicate);if(prior)return Promise.resolve(prior);return new Promise((resolve,reject)=>{
      const pending={predicate,resolve,timer:setTimeout(()=>{waiting.splice(waiting.indexOf(pending),1);reject(new Error('Timed out waiting for a co-op packet'));},3000)};waiting.push(pending);
    });}};
}

test('real WebSockets assemble a squad, advance two independent controls, preserve authority and resume sessions',async t=>{
  const app=await createCoopServer({port:0,host:'127.0.0.1',roomOptions:{seed:()=>63}});t.after(()=>app.close());
  const url=`ws://127.0.0.1:${app.address.port}/ws`;
  const host=await socketClient(url),guest=await socketClient(url);t.after(()=>{host.ws.terminate();guest.ws.terminate();});
  host.send({type:'create',protocol:PROTOCOL,name:'First',role:'member'});const joined=await host.wait(p=>p.type==='joined');
  guest.send({type:'join',protocol:PROTOCOL,code:joined.session.code,name:'Second'});const friend=await guest.wait(p=>p.type==='joined');
  const room=app.rooms.rooms.get(joined.session.code),epoch=room.epoch;
  guest.send({type:'start',id:'not-host',epoch});assert.equal((await guest.wait(p=>p.type==='result'&&p.id==='not-host')).ok,false);
  host.send({type:'start',id:'deploy',epoch});assert.equal((await host.wait(p=>p.type==='result'&&p.id==='deploy')).ok,true);
  const snapshot=await host.wait(p=>p.type==='snapshot'&&p.room.status==='playing');room.game.enemies=[];room.game.maxEnemies=0;
  const before=room.game.squad.slice(0,2).map(a=>({x:a.x,y:a.y}));
  host.send({type:'input',seq:1,epoch:snapshot.init.epoch,input:{moveX:1}});
  guest.send({type:'input',seq:1,epoch:snapshot.init.epoch,input:{moveY:-1}});
  const moved=await host.wait(p=>p.type==='snapshot'&&p.ack===1&&p.state.time>0);
  assert.equal(moved.state.role,'member');assert.ok(moved.state.squad[1].x>before[1].x);assert.ok(moved.state.squad[0].y<before[0].y);
  assert.equal(moved.state.squad.length,4);assert.equal(moved.room.players.length,2);
  const replaced=await socketClient(url);t.after(()=>replaced.ws.terminate());
  replaced.send({type:'resume',protocol:PROTOCOL,...friend.session});const resumed=await replaced.wait(p=>p.type==='snapshot');
  assert.equal(resumed.ack,0);assert.equal(resumed.selfId,friend.session.playerId);assert.equal(resumed.state.role,'leader');
  assert.equal((await guest.wait(p=>p.type==='replaced')).type,'replaced');
  replaced.send({type:'order',id:'hold',epoch:resumed.init.epoch,order:'hold'});
  assert.equal((await replaced.wait(p=>p.type==='result'&&p.id==='hold')).ok,true);
});

test('HTTP and socket boundaries reject foreign origins, invalid payloads and unjoined connections',async t=>{
  const app=await createCoopServer({port:0,host:'127.0.0.1',autoTick:false,handshakeTimeoutMs:80,allowedOrigins:['https://chalk.test']});t.after(()=>app.close());
  const base=`http://127.0.0.1:${app.address.port}`,url=base.replace('http:','ws:')+'/ws';
  const health=await fetch(base+'/health');assert.equal(health.status,200);assert.equal((await health.json()).service,'chalk-coop');
  const html=await fetch(base+'/');assert.equal(html.status,200);assert.match(html.headers.get('content-type'),/text\/html/);
  assert.equal((await fetch(base+'/health',{headers:{Origin:'https://outsider.test'}})).status,403);
  assert.equal((await fetch(base+'/health',{headers:{Origin:'https://chalk.test'}})).status,200);
  assert.equal((await fetch(base+'/%2e%2e%2fpackage.json')).status,403);
  const badOrigin=new WebSocket(url,{origin:'https://outsider.test'});badOrigin.on('error',()=>{});
  const status=await new Promise(resolve=>badOrigin.once('unexpected-response',(_req,res)=>{resolve(res.statusCode);res.resume();badOrigin.terminate();}));assert.equal(status,403);
  const invalid=await socketClient(url);const invalidClosed=once(invalid.ws,'close');invalid.ws.send('{');assert.equal((await invalidClosed)[0],1007);
  const binary=await socketClient(url);const binaryClosed=once(binary.ws,'close');binary.ws.send(Buffer.from('no'));assert.equal((await binaryClosed)[0],1003);
  const large=await socketClient(url);const largeClosed=new Promise(resolve=>large.ws.once('close',resolve));large.ws.send('x'.repeat(9000));assert.equal(await largeClosed,1009);
  const abandoned=await socketClient(url);const abandonedClosed=once(abandoned.ws,'close');assert.equal((await abandoned.wait(p=>p.type==='error')).code,'handshake');assert.equal((await abandonedClosed)[0],4001);
});

test('field cargo and independent side operations survive co-op snapshots and stop at the campaign boundary',()=>{
  const {rooms,room,host,guest,start,step,command}=setup();start();
  const p=room.game.stages.find(p=>p.id==='cordon-radio');room.game.stageIndex=room.game.stages.indexOf(p);
  Object.assign(room.game.squad[1],{x:p.x,y:p.y});
  for(let i=1;i<=100;i++){rooms.handle(guest,{type:'input',epoch:room.epoch,seq:i,input:{interact:true}});step();}
  const item=room.game.operation.items[0];assert.equal(item.status,'carried');assert.equal(item.carrierId,room.game.squad[1].id);
  rooms.snapshot(room,{reset:true});assert.deepEqual(host.latest.state.operation,room.game.operation);assert.deepEqual(host.latest.state.operation,guest.latest.state.operation);
  const session=guest.session;rooms.disconnect(guest);const back=new Peer();rooms.handle(back,{type:'resume',protocol:PROTOCOL,...session});assert.equal(back.latest.state.operation.items[0].carrierId,room.game.squad[1].id);
  command(host,'restart');assert.equal(room.game.operation.items[0].status,'ground');
  command(host,'return_lobby');command(host,'configure',{mission:4});assert.equal(room.game.mission.category,'side');command(host,'start');room.game.status='won';command(host,'continue_operation');assert.equal(host.messages.at(-1).ok,false);assert.equal(room.mission,4);
});
