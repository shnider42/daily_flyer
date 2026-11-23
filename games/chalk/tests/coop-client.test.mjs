import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../public/sim.mjs';
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

function fixture({time=0,epoch=1,role='leader'}={}) {
  const game=createGame({mission:0,seed:2468,difficulty:'story'});
  game.time=time; game.coop=true; game.humanIds=[game.squad[0].id,game.squad[1].id];
  const {world,grid,stages,...state}=game;
  return {type:'snapshot',state,init:{seed:2468,mission:0,difficulty:'story',epoch},worldProps:structuredClone(world.props),
    room:{code:'ABCDEF',hostId:'peer1',leaderId:role==='leader'?'peer1':'peer2',status:'playing',mission:0,difficulty:'story',epoch,capacity:2,players:[
      {id:'peer1',name:'One',actorId:game.squad[role==='leader'?0:1].id,slot:role==='leader'?0:1,role,connected:true,ready:true},
      {id:'peer2',name:'Two',actorId:game.squad[role==='leader'?1:0].id,slot:role==='leader'?1:0,role:role==='leader'?'member':'leader',connected:true,ready:true}]},
    selfId:'peer1',actorId:game.squad[role==='leader'?0:1].id,ack:0,tick:Math.round(time*30),serverTime:100000+time*1000};
}
const session={code:'ABCDEF',playerId:'peer1',token:'t'.repeat(32)};

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
