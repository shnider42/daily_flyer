import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../daily_flyer/themes/breach_assets/core.mjs';
import { CoopGame } from '../daily_flyer/themes/breach_assets/coop-core.mjs';
import { CoopClient, websocketURL, predictMovement, personalEvents } from '../daily_flyer/themes/breach_assets/coop-client.mjs';

function networkFixture(callbacks={}, mission='crosslink-11') {
  const simulation=new CoopGame({mission,players:['p1','p2']});simulation.start();
  const client=new CoopClient({base:'same-origin',origin:'https://breach.example',storage:null,callbacks});
  client.selfId='p1';client.ownerId='p1';client.connected=true;
  client.room={id:'ABCDEFGH',mission,difficulty:'standard',status:'playing',ownerId:'p1',players:[{id:'p1',name:'One',connected:true,ready:true},{id:'p2',name:'Two',connected:true,ready:true}]};
  const packet=(tick=1,ack=0,events=[])=>({type:'state',tick,ackByPlayer:{p1:ack,p2:0},state:simulation.networkSnapshot(),events});
  client._applySnapshot(packet());return {client,simulation,packet};
}

test('room service URLs use the dedicated secure socket endpoint without query credentials',()=>{
  assert.equal(websocketURL('https://rooms.example/prefix?secret=none','https://game.example'),'wss://rooms.example/ws');
  assert.equal(websocketURL('same-origin','http://localhost:4173'),'ws://localhost:4173/ws');
  assert.equal(websocketURL('','https://game.example'),null);
  assert.throws(()=>websocketURL('file:///tmp/room','https://game.example'),/Invalid/);
});

test('prediction matches core movement and collides with closed doors',()=>{
  const game=new Game({mission:'blacksite-07'});game.start();
  for(const enemy of game.state.enemies){enemy.alive=false;enemy.health=0;}
  Object.assign(game.state.player,{x:5.5,z:21.5,angle:0});
  const predicted={...game.state.player};
  for(let i=0;i<30;i++) {
    predictMovement(predicted,{forward:1,strafe:.2,angle:0},1/30,game.level,game.state.doors);
    game.update(1/30,{forward:1,strafe:.2});
  }
  assert.ok(Math.abs(predicted.x-game.state.player.x)<1e-9);
  assert.ok(Math.abs(predicted.z-game.state.player.z)<1e-9);
  assert.ok(predicted.z>=21.2,'closed arrival door remains solid');
  const stopped={...predicted,alive:false};predictMovement(stopped,{forward:1,angle:0},.05,game.level,game.state.doors);
  assert.equal(stopped.z,predicted.z);
});

test('a network snapshot projects the local player and personal tutorial without solo restore',()=>{
  let mounted,personal,all;
  const {client,simulation,packet}=networkFixture({onView:view=>mounted=view,onState:(_state,local,events)=>{personal=local;all=events;}});
  simulation.state.players.p1.tutorial.moved=true;
  const events=[{type:'shot',playerId:'p2'},{type:'hurt',playerId:'p1'},{type:'power'}];
  client._applySnapshot(packet(2,0,events));
  assert.equal(mounted,client.view);assert.equal(client.view.state.player,client.view.state.players.p1);
  assert.equal(client.view.state.localPlayerId,'p1');assert.equal(client.view.state.tutorial.moved,true);
  assert.deepEqual(personal,[events[1],events[2]]);assert.deepEqual(all,events);
  assert.equal(client.view.getObjective().stage,'arrival');
});

test('Underworks projection keeps its large level and refreshes collision after a shared gate opens',()=>{
  const {client,simulation,packet}=networkFixture({},'underworks-13');
  assert.equal(client.view.level.missionId,'underworks-13');
  assert.ok(client.view.level.width>=75&&client.view.level.height>=75);
  const grille=simulation.state.doors.find(door=>door.requires==='cutter'&&!door.open);
  assert.ok(grille,'the authored mission contains cutter-gated routes');
  assert.equal(client.view.hasLineOfSight(grille.x,grille.z,grille.x+.05,grille.z+.05),false);
  simulation.state.upgrades.cutter=true;grille.open=true;
  client._applySnapshot(packet(2));
  assert.equal(client.view.state.upgrades.cutter,true);
  assert.equal(client.view.hasLineOfSight(grille.x,grille.z,grille.x+.05,grille.z+.05),true,'a replaced network state cannot retain a stale solid-door cache');
});

test('immediate look survives authoritative snapshots and acknowledged movement is reconciled',()=>{
  const {client,simulation,packet}=networkFixture();
  const start=client.view.state.player;
  const initialX=start.x,initialZ=start.z;
  client.drive(1/30,{forward:1,strafe:0,turn:.4,fire:false});
  const localAngle=client.view.state.player.angle;
  assert.ok(Math.hypot(client.view.state.player.x-initialX,client.view.state.player.z-initialZ)>.05);
  client._applySnapshot(packet(2,0));
  assert.equal(client.view.state.player.angle,localAngle,'server round trip does not rewind the camera');
  assert.ok(client.pending.length>0,'unacknowledged movement is replayed');
  client._applySnapshot(packet(3,1));
  assert.equal(client.pending.length,0);
  assert.equal(client.view.state.player.x,simulation.state.players.p1.x);
  assert.equal(client.view.state.player.z,simulation.state.players.p1.z);
});

test('equal-tick actions apply but older snapshots do not rewind progress',()=>{
  const {client,simulation,packet}=networkFixture();
  simulation.state.power=true;client._applySnapshot(packet(1));
  assert.equal(client.view.state.power,true,'power action can arrive in the same simulation tick');
  simulation.state.power=false;client._applySnapshot(packet(0));assert.equal(client.view.state.power,true);
});

test('remote position smooths and pause clears held movement and short fire pulses',()=>{
  const {client,simulation,packet}=networkFixture();
  const remote=client.view.state.players.p2,oldX=remote.x;
  simulation.state.players.p2.x+=.5;client._applySnapshot(packet(2));
  assert.equal(client.view.state.players.p2.x,oldX);
  client.drive(1/30,{forward:0,strafe:0,turn:0,fire:true});
  assert.ok(client.view.state.players.p2.x>oldX&&client.view.state.players.p2.x<oldX+.5);
  assert.equal(client.firePulse,true);client.pause('background');assert.equal(client.held.fire,false);assert.equal(client.firePulse,false);
  const position={x:client.view.state.player.x,z:client.view.state.player.z};
  client.drive(1/30,{forward:1,strafe:0,turn:0,fire:true});
  assert.equal(client.view.state.player.x,position.x);assert.equal(client.view.state.player.z,position.z);
});

test('tokens stay in guarded session storage and are sent only for rejoining that room',()=>{
  const saved=new Map();const storage={getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)};
  const client=new CoopClient({base:'same-origin',origin:'https://game.example',storage});
  client.roomId='ABCDEFGH';client.selfId='p1';client.token='private-token';client.intent={name:'Operator'};client._storeToken();
  assert.equal(JSON.parse(saved.get('dfe.breach.room.ABCDEFGH')).token,'private-token');
  let intent;client._connect=()=>{intent=client.intent;};client.join({roomId:'abcdefgh',name:'Operator'});
  assert.equal(intent.token,'private-token');assert.equal(intent.roomId,'ABCDEFGH');
  client.leave();assert.equal(saved.size,0);
  const denied=new CoopClient({base:'same-origin',origin:'https://game.example',storage:{getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}}});
  assert.equal(denied._readToken('ABCDEFGH'),null);assert.doesNotThrow(()=>denied._storeToken());
});

test('personal feedback filter retains shared events but excludes another operator damage and pickups',()=>{
  const shared={type:'checkpoint'},hurt={type:'hurt',playerId:'p2'},pickup={type:'pickup',playerId:'p1'};
  assert.deepEqual(personalEvents([shared,hurt,pickup],'p1'),[shared,pickup]);
});

test('page suspension releases the old socket without leaving, keeps its pass, and rejoins paused',()=>{
  class Socket {
    static instances=[];
    constructor(){this.readyState=0;this.listeners={};this.sent=[];this.closes=[];Socket.instances.push(this);}
    addEventListener(type,listener){(this.listeners[type]??=[]).push(listener);}
    emit(type,value={}){for(const listener of this.listeners[type]||[])listener(value);}
    send(value){this.sent.push(JSON.parse(value));}
    open(){this.readyState=1;this.emit('open');}
    receive(value){this.emit('message',{data:JSON.stringify(value)});}
    close(code,reason){this.closes.push({code,reason});this.readyState=3;this.emit('close');}
  }
  const saved=new Map(),storage={getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)};
  const client=new CoopClient({base:'same-origin',origin:'https://game.example',Socket,storage});
  const {simulation}=networkFixture();simulation.pause();
  client.roomId='ABCDEFGH';client.selfId='p1';client.ownerId='p1';client.token='keep-this-pass';client.intent={name:'Operator'};client.connected=true;
  const oldSocket=new Socket();oldSocket.readyState=1;client.socket=oldSocket;client._storeToken();client._startStream();
  client.retryTimer=setTimeout(()=>assert.fail('a suspended client must not retry'),10000);
  try {
    client.suspend();
    assert.equal(oldSocket.closes.length,1);assert.equal(oldSocket.sent.some(message=>message.type==='leave'),false);
    assert.equal(client.timer,null);assert.equal(client.retryTimer,null);assert.equal(client.connected,false);
    assert.equal(JSON.parse(saved.get('dfe.breach.room.ABCDEFGH')).token,'keep-this-pass');
    client._scheduleReconnect();client._connect(true);
    assert.equal(Socket.instances.length,1,'hidden/cached pages do not open replacement sockets');
    client.setPageVisible(true);
    assert.equal(Socket.instances.length,2,'a visible persisted page opens exactly one new socket');
    const rejoined=Socket.instances[1];rejoined.open();
    assert.deepEqual(rejoined.sent[0],{type:'join',protocol:2,roomId:'ABCDEFGH',name:'Operator',token:'keep-this-pass',replace:true});
    rejoined.receive({type:'welcome',protocol:2,roomId:'ABCDEFGH',selfId:'p1',ownerId:'p1',token:'keep-this-pass'});
    rejoined.receive({type:'room',room:{id:'ABCDEFGH',mission:'crosslink-11',difficulty:'standard',status:'paused',ownerId:'p1',players:[{id:'p1',ready:false,connected:true},{id:'p2',ready:false,connected:true}]}});
    rejoined.receive({type:'state',tick:1,ackByPlayer:{p1:-1,p2:-1},state:simulation.networkSnapshot(),events:[]});
    assert.equal(client.connected,true);assert.equal(client.waitingPause,true);assert.equal(client.view.state.status,'paused');
    assert.equal(client.view.state.player,client.view.state.players.p1);
  }finally{client.leave();}
});

test('a background connection loss waits for visibility before retrying',()=>{
  const client=new CoopClient({base:'same-origin',origin:'https://game.example',storage:null});
  client.token='pass';client.roomId='ABCDEFGH';client.intent={name:'Operator'};
  let attempts=0;client._connect=retry=>{assert.equal(retry,true);attempts++;};
  client.setPageVisible(false);client._scheduleReconnect();
  assert.equal(client.retryTimer,null);assert.equal(attempts,0);
  client.setPageVisible(true);assert.equal(attempts,1);
});
