import test from 'node:test';
import assert from 'node:assert/strict';
import { CoopClient } from '../daily_flyer/themes/breach_assets/coop-client.mjs';
import { CoopGame } from '../daily_flyer/themes/breach_assets/coop-core.mjs';
import { BreachRooms, PROTOCOL } from '../server/breach-rooms.mjs';

function fixture(t, mission='underworks-13'){
  let time=1000;
  const sockets=[],messages=[],storage=new Map();
  class Socket {
    constructor(){this.readyState=0;this.bufferedAmount=0;this.listeners={};this.sent=[];this.closes=[];sockets.push(this);}
    addEventListener(type,callback){(this.listeners[type]??=[]).push(callback);}
    emit(type,event={}){for(const callback of this.listeners[type]||[])callback(event);}
    open(){this.readyState=1;this.emit('open');}
    send(data){this.sent.push(JSON.parse(data));}
    receive(message){this.emit('message',{data:JSON.stringify(message)});}
    close(code,reason){this.closes.push({code,reason});this.readyState=3;this.emit('close');}
  }
  const client=new CoopClient({base:'https://rooms.example',origin:'https://game.example',Socket,statusUI:false,now:()=>time,
    storage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    callbacks:{onConnection:(...data)=>messages.push(data)}});
  const game=new CoopGame({mission});game.start();
  const room={id:'ABCDEFGH',mission,difficulty:'standard',status:'playing',ownerId:'p1',players:[{id:'p1',name:'Host',connected:true,ready:true},{id:'p2',name:'Friend',connected:true,ready:true}]};
  client.create({name:'Host',mission,difficulty:'standard'});
  const socket=sockets[0];socket.open();
  const welcome=()=>({type:'welcome',protocol:PROTOCOL,roomId:room.id,selfId:'p1',ownerId:'p1',token:'private-reconnect-pass'});
  const packet=(tick=1,ack=0)=>({type:'state',tick,ackByPlayer:{p1:ack,p2:0},state:game.networkSnapshot(),events:[]});
  const greet=s=>{s.receive(welcome());s.receive({type:'room',room:structuredClone(room)});s.receive(packet());};
  greet(socket);client._stopStream();
  t.after(()=>client.leave());
  return {client,sockets,socket,messages,storage,room,game,packet,greet,advance(ms){time+=ms;}};
}

test('a silent open socket holds controls and reconnects without leaving or losing its identity',t=>{
  const f=fixture(t),{client,socket}=f;
  client.drive(.03,{forward:1,strafe:0,turn:0,fire:true});client._flushInput();
  assert.ok(socket.sent.some(m=>m.type==='input'&&m.fire));
  f.advance(1201);client._watchConnection();
  assert.equal(client.waitingPause,true);assert.equal(client.firePulse,false);assert.equal(client.held.forward,0);
  assert.equal(client.getNetworkStatus().quality,'stalled');
  assert.ok(socket.sent.some(m=>m.type==='pause'&&m.reason==='network'));
  const inputs=socket.sent.filter(m=>m.type==='input').length;client._flushInput();
  assert.equal(socket.sent.filter(m=>m.type==='input').length,inputs);
  f.advance(3300);client._watchConnection();
  assert.equal(f.sockets.length,2);assert.equal(socket.sent.some(m=>m.type==='leave'),false);
  assert.equal(f.storage.size,1);assert.equal(client.roomId,f.room.id);
  const replacement=f.sockets[1];replacement.open();
  assert.equal(replacement.sent[0].type,'join');assert.equal(replacement.sent[0].replace,true);
  assert.equal(replacement.sent[0].token,'private-reconnect-pass');
  f.room.status='paused';f.game.pause();f.greet(replacement);client._stopStream();
  assert.equal(client.connected,true);assert.equal(client.waitingPause,true);assert.equal(client.view.state.status,'paused');
  assert.equal(replacement.sent.some(m=>m.type==='resume'),false,'recovery never silently resumes the team');
});

test('a short stall recovers into an explicit team pause, without replacing a recovered socket',t=>{
  const f=fixture(t);f.advance(1300);f.client._watchConnection();
  f.room.status='paused';f.game.pause();f.socket.receive({type:'room',room:f.room});f.socket.receive(f.packet(2));
  assert.equal(f.client.connectionStatus,'connected');assert.equal(f.client.networkHold,false);
  assert.equal(f.client.waitingPause,true);assert.equal(f.sockets.length,1);
});

test('fresh pongs cannot disguise missing live game snapshots',t=>{
  const f=fixture(t);f.advance(4600);
  f.socket.receive({type:'pong',sentAt:999});f.client._watchConnection();
  assert.equal(f.sockets.length,2,'snapshot age also has a deadline');
});

test('a missing first game snapshot is bounded even when heartbeat replies arrive',t=>{
  const f=fixture(t);f.client.lastStateAt=null;f.client.room.status='lobby';
  f.socket.receive({type:'room',room:{...f.room,status:'playing'}});
  f.advance(4600);f.socket.receive({type:'pong',sentAt:999});f.client._watchConnection();
  assert.equal(f.sockets.length,2);
});

test('a paused room does not need continuous game snapshots when heartbeat replies remain healthy',t=>{
  const f=fixture(t);f.room.status='paused';f.socket.receive({type:'room',room:f.room});
  f.advance(120000);f.socket.receive({type:'pong',sentAt:999});f.client._watchConnection();
  assert.equal(f.sockets.length,1);assert.equal(f.client.getNetworkStatus().quality,'connected');
});

test('manual reconnect keeps the pass and clears held fire and prediction',t=>{
  const f=fixture(t);f.client.drive(.03,{forward:1,strafe:0,turn:0,fire:true});
  assert.equal(f.client.reconnect(),true);assert.equal(f.client.firePulse,false);assert.equal(f.client.pending.length,0);
  assert.equal(f.socket.sent.some(m=>m.type==='leave'),false);assert.equal(f.storage.size,1);
  f.sockets[1].open();assert.equal(f.sockets[1].sent[0].roomId,f.room.id);
});

test('late packets, errors, and close events from an old connection cannot modify its replacement',t=>{
  const f=fixture(t);f.client.reconnect();const next=f.sockets[1];next.open();
  f.room.status='paused';f.game.pause();f.greet(next);f.client._stopStream();
  const before=JSON.stringify(f.client.view.state);
  f.socket.receive({type:'closed',message:'stale close'});
  f.socket.receive({type:'room',room:{...f.room,status:'won'}});
  f.socket.receive({type:'error',code:'ROOM_NOT_FOUND',message:'old error'});
  f.socket.emit('error');f.socket.emit('close');
  assert.equal(f.client.socket,next);assert.equal(f.client.connected,true);assert.equal(f.client.manual,false);
  assert.equal(f.client.error,null);assert.equal(JSON.stringify(f.client.view.state),before);
  assert.equal(f.storage.size,1);assert.equal(f.client.retryTimer,null);
});

test('invalid messages do not renew liveness and disguise a dead connection',t=>{
  const f=fixture(t);f.advance(4600);
  f.socket.emit('message',{data:'{'});f.socket.receive(null);f.socket.receive({type:'not-a-room-message'});
  f.client._watchConnection();assert.equal(f.sockets.length,2);
});

test('hidden pages send no held commands and do not spin up replacement sockets',t=>{
  const f=fixture(t);f.client.setPageVisible(false);f.advance(10000);f.client._watchConnection();f.client._flushInput();
  assert.equal(f.sockets.length,1);assert.equal(f.socket.sent.some(m=>m.type==='input'),false);
  f.client.setPageVisible(true);assert.equal(f.sockets.length,2);
});

test('input backpressure does not append stale movement to a congested socket',t=>{
  const f=fixture(t);f.client.drive(.03,{forward:1,strafe:0,turn:0,fire:true});
  f.socket.bufferedAmount=8193;f.client._flushInput();
  assert.equal(f.client.seq,0);assert.equal(f.socket.sent.some(m=>m.type==='input'),false);
  f.socket.bufferedAmount=0;f.client._flushInput();assert.equal(f.client.seq,1);
  assert.ok(f.socket.sent.some(m=>m.type==='input'&&m.fire));
});

for(const fps of [30,60,120,240])test(`delayed authority retains a full second of movement history at ${fps} Hz`,t=>{
  const f=fixture(t);
  for(let i=0;i<fps;i++)f.client.drive(1/fps,{forward:1,strafe:0,turn:.1/fps,fire:false});
  const before={...f.client.view.state.player},seconds=f.client.pending.reduce((n,e)=>n+e.dt,0);
  assert.ok(Math.abs(seconds-1)<1e-8);
  f.socket.receive(f.packet(2,0));
  assert.ok(Math.hypot(f.client.view.state.player.x-before.x,f.client.view.state.player.z-before.z)<1e-8);
  assert.equal(f.client.view.state.player.angle,before.angle,'latency is not a teleport or a reason to rewind the camera');
});

test('prediction memory stays bounded by time at high refresh and acknowledgements discard applied input',t=>{
  const f=fixture(t);for(let i=0;i<1200;i++)f.client.drive(1/240,{forward:1,strafe:0,turn:0,fire:false});
  const seconds=f.client.pending.reduce((n,e)=>n+e.dt,0);assert.ok(seconds<=1.5+1e-8&&seconds>1.49);
  f.socket.receive(f.packet(2,1));assert.equal(f.client.pending.length,0);
});

test('real transit discontinuities reset prediction and use the authoritative destination',t=>{
  const f=fixture(t);f.client.drive(.03,{forward:1,strafe:0,turn:.3,fire:false});
  Object.assign(f.game.state.players.p1,{x:32.5,z:22.25,angle:Math.PI});
  f.socket.receive(f.packet(2));assert.equal(f.client.pending.length,0);
  assert.equal(f.client.view.state.player.z,22.25);assert.equal(f.client.view.state.player.angle,Math.PI);
});

test('network diagnostics measure only matched heartbeat round trips, never advertise Wi-Fi detection',t=>{
  const f=fixture(t);f.client._ping();const sent=f.client.pingSentAt;
  f.advance(85);f.socket.receive({type:'pong',sentAt:sent});assert.equal(f.client.getNetworkStatus().rtt,85);
  f.advance(100);f.socket.receive({type:'pong',sentAt:sent});assert.equal(f.client.getNetworkStatus().rtt,85,'duplicate reply is ignored');
  assert.equal(f.client.getNetworkStatus().quality,'connected');
  assert.equal(JSON.stringify(f.client.getNetworkStatus()).includes('private-reconnect-pass'),false);
});

test('leaving is terminal: no watchers, retry timers, or automatic reconnect remain',t=>{
  const f=fixture(t);f.client._startStream();f.client.leave();
  assert.equal(f.client.timer,null);assert.equal(f.client.pingTimer,null);assert.equal(f.client.watchTimer,null);
  assert.equal(f.client.connectTimer,null);assert.equal(f.client.warmTimer,null);assert.equal(f.client.retryTimer,null);
  assert.equal(f.client.reconnect(),false);assert.equal(f.storage.size,0);
});

function roomFixture(){
  let now=1000;const rooms=new BreachRooms({now:()=>now});
  const peer=()=>({messages:[],closed:false,send(message){this.messages.push(structuredClone(message));},close(){this.closed=true;}});
  const host=peer(),guest=peer();rooms.handle(host,{type:'create',protocol:PROTOCOL,name:'Host',mission:'underworks-13',difficulty:'standard'});
  const welcome=host.messages.find(m=>m.type==='welcome'),room=rooms.rooms.get(welcome.roomId);
  rooms.handle(guest,{type:'join',protocol:PROTOCOL,roomId:room.id,name:'Friend'});
  rooms.handle(host,{type:'ready',ready:true});rooms.handle(guest,{type:'ready',ready:true});rooms.handle(host,{type:'start'});
  return {rooms,host,guest,room,welcome,peer,advance(ms){now+=ms;}};
}

test('a valid reconnect token replaces a half-open transport while preserving the same Underworks simulation',()=>{
  const f=roomFixture(),oldGame=f.room.game;
  // Set retained progression as fixture data; this test isolates transport ownership.
  oldGame.state.power=true;oldGame.state.upgrades.cutter=true;oldGame.state.time=123;
  const next=f.peer();f.rooms.handle(next,{type:'join',protocol:PROTOCOL,roomId:f.room.id,name:'Ignored rename',token:f.welcome.token,replace:true});
  assert.equal(f.room.game,oldGame);assert.equal(f.room.status,'paused');assert.equal(oldGame.state.time,123);
  assert.equal(oldGame.state.upgrades.cutter,true);assert.equal(f.host.closed,true);
  assert.equal(f.host.roomId,null);assert.equal(f.host.playerId,null);assert.equal(f.room.players.get('p1').peer,next);
  assert.match(f.room.pauseReason,/reconnected/);assert.ok([...f.room.players.values()].every(p=>!p.ready));
  f.rooms.handle(f.host,{type:'input',seq:999,forward:1,strafe:0,angle:0,fire:true});f.rooms.disconnect(f.host);
  assert.equal(f.room.players.get('p1').peer,next);assert.equal(f.room.players.get('p1').seq,-1);
  f.rooms.handle(next,{type:'resume'});assert.equal(f.room.status,'paused');
  f.rooms.handle(f.guest,{type:'resume'});assert.equal(f.room.status,'playing');
  assert.equal(f.room.game,oldGame);assert.equal(oldGame.state.upgrades.cutter,true);
});

test('a replacement flag alone or a wrong token cannot evict either operator',()=>{
  const f=roomFixture();
  for(const fields of [{replace:true},{replace:true,token:'x'.repeat(32)}]){
    const intruder=f.peer();f.rooms.handle(intruder,{type:'join',protocol:PROTOCOL,roomId:f.room.id,name:'Other',...fields});
    assert.ok(intruder.messages.some(m=>m.type==='error'));assert.equal(f.host.closed,false);
    assert.equal(f.room.players.get('p1').peer,f.host);assert.equal(f.room.status,'playing');
  }
});
