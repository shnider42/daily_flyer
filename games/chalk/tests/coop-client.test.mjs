import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyBreach } from '../public/sim.mjs';
import { SnapshotDeltaEncoder } from '../public/snapshot-delta.mjs';
import { CoopClient, CoopStateHydrator, SquadInterpolator, predictMovement, readCoopSession, socketURL, COOP_SESSION_KEY } from '../public/coop-client.mjs';

class MemoryStorage {
  data=new Map(); getItem(key) { return this.data.get(key) || null; }
  setItem(key,value) { this.data.set(key,String(value)); } removeItem(key) { this.data.delete(key); }
}
class FakeSocket {
  static instances=[];
  constructor(url) { this.url=url; this.readyState=0; this.bufferedAmount=0; this.listeners=new Map(); this.sent=[]; FakeSocket.instances.push(this); }
  addEventListener(type,fn) { if (!this.listeners.has(type)) this.listeners.set(type,[]); this.listeners.get(type).push(fn); }
  emit(type,event={}) { for (const fn of this.listeners.get(type)||[]) fn(event); }
  open() { this.readyState=1; this.emit('open'); }
  send(data) { this.sent.push(JSON.parse(data)); }
  receive(packet) { this.emit('message',{data:JSON.stringify(packet)}); }
  close(code=1000,reason='') { this.readyState=3; this.emit('close',{code,reason}); }
}

function fixture({time=0,epoch=1,role='leader',squadRoles}={}) {
  const game=createGame({mission:0,seed:2468,difficulty:'story',squadRoles});
  game.time=time; game.coop=true; game.humanIds=[game.squad[0].id,game.squad[1].id];
  const {world,grid,stages,...state}=game;
  return {type:'snapshot',state,init:{seed:2468,mission:0,difficulty:'story',epoch,squadRoles:[...game.squadRoles]},worldProps:structuredClone(world.props),
    room:{code:'ABCDEF',hostId:'peer1',leaderId:role==='leader'?'peer1':'peer2',status:'playing',mission:0,difficulty:'story',epoch,capacity:2,players:[
      {id:'peer1',name:'One',actorId:game.squad[role==='leader'?0:1].id,slot:role==='leader'?0:1,role,connected:true,ready:true},
      {id:'peer2',name:'Two',actorId:game.squad[role==='leader'?1:0].id,slot:role==='leader'?1:0,role:role==='leader'?'member':'leader',connected:true,ready:true}]},
    selfId:'peer1',actorId:game.squad[role==='leader'?0:1].id,ack:0,tick:Math.round(time*30),serverTime:100000+time*1000};
}
const session={code:'ABCDEF',playerId:'peer1',token:'t'.repeat(32)};

test('co-op terrain reconstruction discards seeded NPC orders and any unseen local allies', () => {
  const hydrator=new CoopStateHydrator(), packet=fixture();
  assert.ok(packet.state.fieldSquads.groups.length,'fixture has the full solo seed');
  packet.state.allies=[];delete packet.state.fieldSquads;
  const {game}=hydrator.apply(packet,'peer1');
  assert.deepEqual(game.allies,[]);assert.equal('fieldSquads' in game,false);
  assert.equal('fieldSupport' in game,false,'local reconstruction cannot retain a private reserve target');
  const next=fixture({time:.1});next.state.allies=[];
  hydrator.apply(next,'peer1');
  assert.equal('fieldSquads' in game,false,'private routes cannot reappear in later packets');
  assert.equal('fieldSupport' in game,false,'private support state cannot enter through later packets');
});

async function connectedClient(options={}) {
  let time=0; const storage=new MemoryStorage(), statuses=[], errors=[], rooms=[], states=[];
  const client=new CoopClient({url:'https://squad.example',WebSocketImpl:FakeSocket,storage,now:()=>time,wallNow:()=>100000+time,autoTimers:false,autoReconnect:false,
    onStatus:s=>statuses.push(s),onError:e=>errors.push(e),onRoom:r=>rooms.push(r),onState:g=>states.push(g),...options});
  const connection=client.create({name:'One'}), socket=FakeSocket.instances.at(-1);
  socket.open(); socket.receive({type:'joined',session,room:fixture().room});
  const encoder=new SnapshotDeltaEncoder(); const prepared=encoder.prepare(fixture()); socket.receive(prepared.packet); encoder.commit(prepared);
  await connection;
  return {client,socket,storage,statuses,errors,rooms,states,encoder,setTime:value=>time=value};
}

test('tactical pings use an acknowledged command separate from heartbeat and hydrate without ordering',async()=>{
  const {client,socket,encoder,setTime}=await connectedClient();
  try {
    const point={x:1700,y:120},order=structuredClone(client.game.order),pending=client.ping(point);
    const command=socket.sent.at(-1);assert.equal(command.type,'tactical_ping');assert.equal(command.epoch,1);assert.deepEqual(command.point,point);
    point.x=10;assert.equal(command.point.x,1700);
    socket.receive({type:'result',id:command.id,ok:true});await pending;
    const packet=fixture({time:.1});packet.state.pings=[{id:1,actorId:packet.actorId,name:'Hale',x:1700,y:120,createdAt:.1,expiresAt:8.1}];
    const prepared=encoder.prepare(packet);setTime(100);socket.receive(prepared.packet);encoder.commit(prepared);
    assert.deepEqual(client.game.pings,packet.state.pings);assert.deepEqual(client.game.order,order);
    setTime(8200);client.getState(.016);assert.deepEqual(client.game.pings,[],'markers do not linger if the connection stops delivering snapshots');
  } finally {client.leave();}
});

test('support uses an explicit acknowledged command and hydrates only the public report',async()=>{
  const {client,socket,encoder,setTime}=await connectedClient();
  try {
    const point={x:200,y:1500},order=structuredClone(client.game.order),pending=client.requestSupport(point);
    const command=socket.sent.at(-1);assert.equal(command.type,'field_support');assert.equal(command.epoch,1);assert.deepEqual(command.point,point);
    socket.receive({type:'result',id:command.id,ok:true});await pending;
    const packet=fixture({time:.1});packet.state.support={enabled:true,available:false,remaining:0,status:'moving',callsign:'Relief',text:'Relief moving to support.',updatedAt:.1,requestId:1};
    packet.state.fieldSupport={target:{x:1900,y:400},privateRoute:[{x:1500,y:200}]};
    const prepared=encoder.prepare(packet);setTime(100);socket.receive(prepared.packet);encoder.commit(prepared);
    assert.deepEqual(client.game.support,packet.state.support);assert.deepEqual(client.game.order,order);
    assert.equal('fieldSupport' in client.game,false);assert.equal('fieldSquads' in client.game,false);
  } finally {client.leave();}
});

test('selecting another soldier cancels old controls and hydrates its identity and inventory after confirmation',async()=>{
  const {client,socket,encoder,setTime}=await connectedClient();
  try{
    const next=fixture({time:.1,epoch:2}),medic=next.state.squad[2];
    client.input({moveX:1,fire:true,frag:true,flashbang:true});
    const request=client.selectSoldier(String(medic.id)),command=socket.sent.at(-1),neutral=socket.sent.at(-2);
    assert.equal(command.type,'select_soldier');assert.equal(command.actorId,medic.id);assert.equal(command.epoch,1);
    assert.equal(neutral.type,'input');assert.equal(neutral.cancelActions,true);assert.equal(neutral.input.fire,false);
    assert.equal(client._input.moveX,0);assert.deepEqual(client._edges,{});
    socket.receive({type:'result',id:command.id,ok:true});await request;
    Object.assign(next.room.players[0],{actorId:medic.id,slot:2,role:'member',specialty:'medic',soldierName:'Ames'});
    next.room.leaderId=null;next.actorId=medic.id;next.state.playerId=medic.id;next.state.role='member';
    next.state.humanIds=[medic.id,next.state.squad[1].id];medic.hp=73;medic.ammo=12;
    next.room.soldiers=next.state.squad.map((actor,slot)=>({id:actor.id,slot,name:actor.name,role:actor.role,alive:actor.alive,downed:actor.downed,claimedBy:slot===2?'peer1':slot===1?'peer2':null,connected:slot===2||slot===1}));
    const prepared=encoder.prepare(next,{reset:true});setTime(100);socket.receive(prepared.packet);encoder.commit(prepared);
    assert.equal(client.game.playerId,medic.id);assert.equal(client.localPlayer.slot,2);assert.equal(client.role,'member');
    assert.equal(client.game.squad[2].hp,73);assert.equal(client.game.squad[2].ammo,12);
    assert.equal(client.room.soldiers.length,4);assert.equal(client._input.fire,false);assert.equal(client._history.length,0);
    assert.deepEqual(client.session,session,'switching soldiers keeps the reconnect identity');
    client._sendInput();assert.equal(socket.sent.at(-1).epoch,2);assert.equal(socket.sent.at(-1).input.frag,false);
    const failed=client.selectSoldier(next.state.squad[1].id),outgoing=socket.sent.at(-1);
    const rejected=assert.rejects(failed,/controlled by/);
    socket.receive({type:'result',id:outgoing.id,ok:false,reason:'Mercer is controlled by Two.'});await rejected;
    assert.equal(client.game.playerId,medic.id,'a rejected selection cannot change the local soldier');
    await assert.rejects(client.selectSoldier('not-a-soldier'),/Choose/);
  }finally{client.leave();}
});

test('co-op session validation rejects incomplete credentials and normalizes room codes', () => {
  const storage=new MemoryStorage(); storage.setItem(COOP_SESSION_KEY,JSON.stringify({...session,code:'abc def'}));
  assert.deepEqual(readCoopSession(storage),session);
  storage.setItem(COOP_SESSION_KEY,JSON.stringify({...session,token:'short'})); assert.equal(readCoopSession(storage),null);
  storage.setItem(COOP_SESSION_KEY,'broken'); assert.equal(readCoopSession(storage),null);
  assert.equal(socketURL('https://squad.example/'),'wss://squad.example/ws');
  assert.equal(socketURL('http://localhost:4173'),'ws://localhost:4173/ws');
});

test('leaving during a connection settles the request and ignores its late socket events', async () => {
  const client=new CoopClient({url:'https://squad.example',WebSocketImpl:FakeSocket,storage:null,autoTimers:false});
  const connection=client.create(), socket=FakeSocket.instances.at(-1);
  const ended=assert.rejects(connection,/left the squad before connecting/);
  client.leave(); await ended;
  socket.open(); socket.receive({type:'joined',session,room:fixture().room});
  assert.equal(client.connected,false); assert.equal(client.active,false); assert.equal(client.room,null);
});

test('invalid room codes report a visible error before attempting a connection', async () => {
  const errors=[], before=FakeSocket.instances.length;
  const client=new CoopClient({url:'https://squad.example',WebSocketImpl:FakeSocket,storage:null,onError:error=>errors.push(error)});
  await assert.rejects(client.join({code:'OOOOOO'}),/six-character squad code/);
  assert.equal(errors.length,1); assert.equal(FakeSocket.instances.length,before);
  client.leave();
});

test('snapshots preserve static map identity while projecting each human and updating props', () => {
  const hydrator=new CoopStateHydrator(), packet=fixture();
  const first=hydrator.apply(packet,'peer2'); const {game}=first, world=game.world, grid=game.grid, props=world.props;
  assert.equal(game.playerId,packet.room.players[1].actorId); assert.equal(game.role,'member'); assert.equal(game.squad.length,4);
  const next=fixture({time:.1}); next.worldProps[0].cleared=true; next.state.squad[1].hp=99;
  hydrator.apply(next,'peer2');
  assert.equal(hydrator.game,game); assert.equal(game.world,world); assert.equal(game.grid,grid); assert.equal(game.world.props,props);
  assert.equal(props[0].cleared,true); assert.equal(game.squad[1].hp,99);
  assert.equal(packet.state.role,'leader'); assert.equal(packet.state.playerId,packet.room.players[0].actorId,'client projection must not mutate wire state');
  const switched=hydrator.apply(fixture({epoch:2,role:'member'}),'peer2');
  assert.equal(switched.game.role,'leader'); assert.equal(switched.changedEpoch,true);
});

test('movement prediction respects walls, diagonal speed, incapacitation, and server-owned combat values', () => {
  const actor={x:100,y:100,angle:0,radius:13,alive:true,downed:false,ammo:21,hp:82,suppression:0};
  const world={width:500,height:500,buildings:[{x:125,y:75,w:40,h:50}]};
  const stopped=predictMovement(actor,{moveX:1,fire:true},.2,world);
  assert.ok(stopped.x<=112); assert.equal(stopped.ammo,21); assert.equal(stopped.hp,82);
  const clear={...world,buildings:[]}, diagonal=predictMovement(actor,{moveX:1,moveY:1},.1,clear);
  assert.ok(Math.abs(Math.hypot(diagonal.x-100,diagonal.y-100)-11.2)<.001);
  assert.equal(predictMovement({...actor,downed:true},{moveX:1},.1,clear).x,100);
  const bounded=predictMovement(actor,{moveX:1},10,clear); assert.ok(bounded.x<=124.65,'prediction cannot run indefinitely ahead');
});

test('independent allies interpolate without resurrecting contacts after sight is lost', () => {
  const interpolator = new SquadInterpolator({ delayMs: 80 });
  const first = { squad: [], allies: [{ id: 701, team: 'allied', x: 300, y: 200, angle: 0, alive: true }] };
  const second = structuredClone(first); second.allies[0].x = 320;
  interpolator.push(first, 0); interpolator.push(second, 100);
  const view = structuredClone(second); interpolator.apply(view, 130, 1);
  assert.ok(view.allies[0].x > 300 && view.allies[0].x < 320);
  const unseen = { squad: [], allies: [] };
  interpolator.push(unseen, 200); interpolator.apply(unseen, 220, 1);
  assert.deepEqual(unseen.allies, []);
});

test('remote interpolation blends position but snaps incapacitation and keeps the local player untouched', () => {
  const interp=new SquadInterpolator({delayMs:80}), a=fixture().state, b=structuredClone(a);
  b.squad[0].x+=20; b.squad[1].x+=20;
  interp.push(a,0,0); interp.push(b,100,100);
  const view=structuredClone(b), local=view.squad[0].id; interp.apply(view,155,local);
  assert.equal(view.squad[0].x,b.squad[0].x);
  assert.ok(view.squad[1].x>a.squad[1].x && view.squad[1].x<b.squad[1].x);
  const c=structuredClone(b); c.squad[1].downed=true; c.squad[1].x+=10;
  interp.push(c,200,200); const downed=structuredClone(c); interp.apply(downed,220,local);
  assert.equal(downed.squad[1].x,c.squad[1].x);
});

test('transport coalesces latest controls under backpressure and transmits a one-shot action once', async () => {
  const {client,socket,setTime}=await connectedClient();
  try {
    assert.equal(socket.sent[0].type,'create'); assert.equal(client.connected,true); assert.equal(client.isHost,true);
    client.input({moveX:1,smoke:true}); socket.bufferedAmount=50; assert.equal(client._sendInput(),false);
    client.input({moveY:-1}); setTime(30); socket.bufferedAmount=0; assert.equal(client._sendInput(),true);
    const sent=socket.sent.at(-1); assert.equal(sent.input.moveX,0); assert.equal(sent.input.moveY,-1); assert.equal(sent.input.smoke,true);
    setTime(60); client._sendInput(); assert.equal(socket.sent.at(-1).input.smoke,false);
    client.input({moveX:1,reload:true}); socket.bufferedAmount=50; client.clearInput();
    socket.bufferedAmount=0; client._sendInput(); const neutral=socket.sent.at(-1).input;
    assert.equal(neutral.moveX,0); assert.equal(neutral.reload,false); assert.equal(neutral.fire,false);
  } finally { client.leave(); }
});

test('grenade edges survive coalescing once while clearing input cancels observation and queued launches', async()=>{
  const {client,socket,setTime}=await connectedClient();
  try{
    client.input({grenade:true,observe:true});socket.bufferedAmount=50;assert.equal(client._sendInput(),false);
    client.input({observe:true});setTime(30);socket.bufferedAmount=0;client._sendInput();
    assert.equal(socket.sent.at(-1).input.grenade,true);assert.equal(socket.sent.at(-1).input.observe,true);
    setTime(60);client._sendInput();assert.equal(socket.sent.at(-1).input.grenade,false);assert.equal(socket.sent.at(-1).input.observe,true);
    client.input({grenade:true,observe:true});socket.bufferedAmount=50;client.clearInput();
    socket.bufferedAmount=0;client._sendInput();
    assert.equal(socket.sent.at(-1).input.grenade,false);assert.equal(socket.sent.at(-1).input.observe,false);
    client.input({observe:true});setTime(1000);client._sendInput();assert.equal(socket.sent.at(-1).input.observe,false,'stale input ends a binocular scan');
  }finally{client.leave();}
});

test('frag and flashbang inputs survive backpressure once and expire instead of throwing after a pause',async()=>{
  const {client,socket,setTime}=await connectedClient();
  try{
    client.input({frag:true,aimX:300,aimY:400});socket.bufferedAmount=50;assert.equal(client._sendInput(),false);
    client.input({moveX:1,aimX:800,aimY:900});setTime(30);socket.bufferedAmount=0;client._sendInput();
    assert.equal(socket.sent.at(-1).input.frag,true);assert.equal(socket.sent.at(-1).input.flashbang,false);
    assert.equal(socket.sent.at(-1).input.throwAimX,300);assert.equal(socket.sent.at(-1).input.throwAimY,400);
    assert.equal(socket.sent.at(-1).input.aimX,800);assert.equal(socket.sent.at(-1).input.aimY,900,'rifle aim stays independent of the latched throw');
    setTime(60);client._sendInput();assert.equal(socket.sent.at(-1).input.frag,false);
    client.input({flashbang:true});socket.bufferedAmount=50;client.clearInput();
    socket.bufferedAmount=0;client._sendInput();assert.equal(socket.sent.at(-1).input.flashbang,false);
    client.input({frag:true,flashbang:true});setTime(1000);client._sendInput();
    assert.equal(socket.sent.at(-1).input.frag,false);assert.equal(socket.sent.at(-1).input.flashbang,false);
    client.input({smoke:true,aimX:120,aimY:220});client.input({aimX:600,aimY:700});client._sendInput();
    assert.equal(socket.sent.at(-1).input.throwAimX,120);assert.equal(socket.sent.at(-1).input.throwAimY,220);
  }finally{client.leave();}
});

test('different throw edges retain separate release targets when coalesced into one packet',async()=>{
  const {client,socket}=await connectedClient();
  try{
    client.input({frag:true,aimX:300,aimY:400});
    client.input({smoke:true,aimX:500,aimY:600});
    client.input({aimX:700,aimY:800});client._sendInput();
    const input=socket.sent.at(-1).input;
    assert.equal(input.frag,true);assert.equal(input.smoke,true);
    assert.deepEqual(input.throwTargets,{frag:{x:300,y:400},smoke:{x:500,y:600}});
    assert.equal(input.aimX,700);assert.equal(input.aimY,800);
  }finally{client.leave();}
});

test('explicit input cancellation survives backpressure and is sent before a new post-pause throw',async()=>{
  const {client,socket,setTime}=await connectedClient();
  try{
    client.input({frag:true,aimX:300,aimY:400});client._sendInput();
    assert.equal(socket.sent.at(-1).input.frag,true);
    socket.bufferedAmount=50;client.clearInput();
    client.input({flashbang:true,aimX:500,aimY:600});setTime(30);socket.bufferedAmount=0;client._sendInput();
    const cancelled=socket.sent.at(-1);assert.equal(cancelled.cancelActions,true);
    assert.equal(cancelled.input.frag,false);assert.equal(cancelled.input.flashbang,false);
    setTime(60);client._sendInput();const resumed=socket.sent.at(-1);
    assert.equal(resumed.cancelActions,undefined);assert.equal(resumed.input.frag,false);assert.equal(resumed.input.flashbang,true);
    assert.deepEqual(resumed.input.throwTargets.flashbang,{x:500,y:600});
    setTime(90);client._sendInput();assert.equal(socket.sent.at(-1).input.flashbang,false);
  }finally{client.leave();}
});

test('stale input becomes neutral and local prediction is bounded by the last authority snapshot', async () => {
  const {client,socket,setTime}=await connectedClient();
  try {
    const start=client.game.squad[0].x;
    client.input({moveX:1}); setTime(100); client.getState(.1);
    assert.ok(client.game.squad[0].x>start);
    setTime(1000); client.getState(.1); client._sendInput();
    assert.ok(client.game.squad[0].x-start<=25); assert.equal(socket.sent.at(-1).input.moveX,0);
  } finally { client.leave(); }
});

test('delta gaps request one full resync and ordinary snapshots retain the hydrated world', async () => {
  const {client,socket,encoder,setTime}=await connectedClient();
  try {
    const world=client.game.world, next=fixture({time:.1}); next.ack=1; setTime(100);
    const prepared=encoder.prepare(next); socket.receive(prepared.packet); encoder.commit(prepared);
    assert.equal(client.game.world,world); assert.equal(client.game.time,.1);
    const broken={...prepared.packet,snapshotId:100,baseSnapshotId:99}; socket.receive(broken); socket.receive(broken);
    assert.equal(socket.sent.filter(packet=>packet.type==='resync').length,1);
    const full=encoder.prepare(fixture({time:.2}),{reset:true}); setTime(200); socket.receive(full.packet); encoder.commit(full);
    assert.equal(client.game.world,world); assert.equal(client.game.time,.2);
  } finally { client.leave(); }
});

test('session resume and role changes clear old inputs and preserve the assigned four-person squad', async () => {
  const {client,socket,storage,setTime}=await connectedClient();
  try {
    client.input({moveX:1,fire:true,smoke:true}); socket.close(1006,'Lost connection');
    assert.deepEqual(readCoopSession(storage),session); assert.equal(client.connected,false);
    const pending=client.resume(), second=FakeSocket.instances.at(-1); second.open();
    assert.equal(second.sent[0].type,'resume'); assert.equal(second.sent[0].token,session.token);
    second.receive({type:'joined',session,room:fixture().room});
    const packet=fixture({time:.2,epoch:2,role:'member'}), encoder=new SnapshotDeltaEncoder(); setTime(200);
    const prepared=encoder.prepare(packet); second.receive(prepared.packet); encoder.commit(prepared); await pending;
    assert.equal(client.role,'member'); assert.equal(client.game.playerId,packet.room.players[0].actorId); assert.equal(client.game.squad.length,4);
    client._sendInput(); assert.equal(second.sent.at(-1).input.fire,false); assert.equal(second.sent.at(-1).input.smoke,false);
    const command=client.swapRoles(), outgoing=second.sent.at(-1); assert.equal(outgoing.type,'swap_roles'); assert.equal(outgoing.epoch,2);
    second.receive({type:'result',id:outgoing.id,ok:true}); await command;
  } finally { client.leave(); }
});

test('radio choices and continuation use acknowledged commands, with neutral controls before the next chapter',async()=>{
  const {client,socket}=await connectedClient();
  try{
    const request=client.storyChoice('cordon-pickup','reposition'),choice=socket.sent.at(-1);
    assert.equal(choice.type,'story_choice');assert.equal(choice.decisionId,'cordon-pickup');assert.equal(choice.optionId,'reposition');assert.equal(choice.epoch,1);
    assert.equal(Object.hasOwn(choice,'actorId'),false,'the authority derives ownership from the authenticated session');
    socket.receive({type:'result',id:choice.id,ok:true});await request;
    client.input({moveX:1,fire:true,grenade:true});const continuation=client.continueOperation(),command=socket.sent.at(-1);
    assert.equal(command.type,'continue_operation');assert.equal(command.epoch,1);assert.equal(client._input.fire,false);assert.equal(client._input.moveX,0);
    socket.receive({type:'result',id:command.id,ok:true});await continuation;
  }finally{client.leave();}
});

test('hydration preserves story and persistent remains through updates, then reconstructs a continued chapter with its bounded carry',()=>{
  const hydrator=new CoopStateHydrator(),packet=fixture();
  packet.state.story.summary=['The pickup was moved.'];packet.state.story.resolved['cordon-pickup']={optionId:'reposition',actorId:1,time:8,reason:'order'};
  packet.state.bodies=[{id:'body:99',actorId:99,team:'enemy',kind:'rifleman',x:680,y:1340,angle:0,pose:1,diedAt:8,seen:true}];
  packet.state.bloodstains=[{id:'blood:1',x:680,y:1340,angle:0,amount:1,seed:7,at:8,seen:true}];
  const first=hydrator.apply(packet,'peer1').game,world=first.world;
  packet.state.time=9;hydrator.apply(packet,'peer1');assert.equal(hydrator.game.world,world);
  assert.deepEqual(hydrator.game.story,packet.state.story);assert.deepEqual(hydrator.game.bodies,packet.state.bodies);assert.deepEqual(hydrator.game.bloodstains,packet.state.bloodstains);
  packet.state.bodies[0].x=999;assert.equal(hydrator.game.bodies[0].x,680,'network objects do not alias the rendered persistent records');
  const campaign={version:1,fromMission:0,medicalDebt:1,smokeDebt:1,fatigue:1,civilianHarm:0,aided:1};
  const next=createGame({mission:1,seed:2468,difficulty:'story',campaign}),{world:nextWorld,grid,stages,...state}=next;
  const continued={...packet,init:{seed:2468,mission:1,difficulty:'story',epoch:2,campaign},state,
    room:{...packet.room,mission:1,epoch:2},worldProps:structuredClone(nextWorld.props)};
  const result=hydrator.apply(continued,'peer1');assert.equal(result.changedEpoch,true);assert.notEqual(result.game.world,world);
  assert.deepEqual(result.game.campaign,campaign);assert.equal(result.game.stages.find(p=>p.id==='crash-entry').duration,4);assert.equal(result.game.squad[2].medkits,5);
  assert.deepEqual(result.game.bodies,[]);assert.deepEqual(result.game.bloodstains,[]);assert.equal(result.game.squad.length,4);
});

test('breach snapshots update collision before prediction, retain map identity, and reconstruct late joins and clean restarts',()=>{
  const source=createGame({seed:17}),packet=fixture(),hydrator=new CoopStateHydrator();
  Object.assign(source.squad[0],{x:270,y:1500});
  const state=()=>{const {world,grid,stages,...view}=source;return structuredClone(view);};
  packet.init.seed=17;packet.state=state();packet.worldProps=structuredClone(source.world.props);
  const first=hydrator.apply(packet,'peer1').game,world=first.world,blocked=predictMovement(first.squad[0],{moveX:1},.22,world);
  assert.ok(blocked.x<280);
  applyBreach(source,{x:289,y:1500,radius:76,wallId:'b30a:west'});packet.state=state();
  const changed=hydrator.apply(packet,'peer1');assert.equal(changed.changedGeometry,true);assert.equal(changed.game.world,world);
  assert.equal(changed.game.world.geometryRevision,1);assert.ok(predictMovement(changed.game.squad[0],{moveX:1},.22,world).x>290);
  assert.equal(hydrator.apply(packet,'peer1').changedGeometry,false,'repeated snapshots do not rebuild the map');
  const late=new CoopStateHydrator().apply(packet,'peer2').game;assert.deepEqual(late.world.walls,source.world.walls);assert.deepEqual(late.grid,source.grid);
  const restarted=createGame({seed:17}),{world:newWorld,grid,stages,...freshState}=restarted;
  const fresh={...packet,state:freshState,init:{...packet.init,epoch:2},room:{...packet.room,epoch:2},worldProps:newWorld.props};
  const reset=hydrator.apply(fresh,'peer1');assert.equal(reset.changedEpoch,true);assert.equal(reset.game.destruction.revision,0);assert.equal(reset.game.world.geometryRevision,0);
});

test('hydration reconstructs configured kits and preserves command identity without a player role hint', () => {
  const roles=['sniper','heavy','medic','sniper'],packet=fixture({squadRoles:roles});
  // The epoch initializer must be sufficient before the first actor update.
  delete packet.state.squad;delete packet.state.squadRoles;
  for(const peer of packet.room.players)delete peer.role;
  const hydrator=new CoopStateHydrator(),first=hydrator.apply(packet,'peer1');
  assert.deepEqual(first.game.squad.map(actor=>actor.role),roles);
  assert.equal(first.game.squad[0].magSize,5);assert.equal(first.game.squad[1].magSize,60);
  assert.equal(first.game.role,'leader');assert.equal(first.game.squad[0].commander,true);
  const member=new CoopStateHydrator().apply(packet,'peer2');assert.equal(member.game.role,'member');
  const world=first.game.world,next=fixture({time:.2,squadRoles:roles});next.state.squad[0].ammo=2;
  hydrator.apply(next,'peer1');assert.equal(hydrator.game.world,world);assert.equal(hydrator.game.squad[0].ammo,2);
  const restarted=hydrator.apply(fixture({epoch:2,squadRoles:roles}),'peer1');
  assert.equal(restarted.changedEpoch,true);assert.notEqual(restarted.game.world,world);
  assert.deepEqual(restarted.game.squadRoles,roles);assert.equal(restarted.game.squad[0].ammo,5);
});

test('creating and configuring a room sends four loadout IDs independently from leader or member control', async () => {
  const roles=['heavy','sniper','sniper','medic'];
  const client=new CoopClient({url:'https://squad.example',WebSocketImpl:FakeSocket,storage:null,autoTimers:false,autoReconnect:false});
  const connecting=client.create({name:'One',role:'member',squadRoles:roles}),socket=FakeSocket.instances.at(-1);
  try {
    socket.open();
    const create=socket.sent.find(packet=>packet.type==='create');
    assert.equal(create.role,'member');assert.deepEqual(create.squadRoles,roles);
    const packet=fixture({role:'member',squadRoles:roles});
    socket.receive({type:'joined',session,room:packet.room});
    const encoder=new SnapshotDeltaEncoder(),prepared=encoder.prepare(packet);socket.receive(prepared.packet);encoder.commit(prepared);
    await connecting;
    const replacement=['rifleman','heavy','medic','support'],pending=client.configure({squadRoles:replacement});
    const command=socket.sent.at(-1);assert.equal(command.type,'configure');assert.equal(command.epoch,1);
    assert.deepEqual(command.squadRoles,replacement);assert.equal('role' in command,false);
    socket.receive({type:'result',id:command.id,ok:true});await pending;
  } finally { client.leave(); }
});
