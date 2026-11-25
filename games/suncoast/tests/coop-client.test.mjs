import test from 'node:test';
import assert from 'node:assert/strict';
import { CoopClient, SESSION_KEY, readSession, socketURL } from '../public/coop-client.mjs';
import { PROTOCOL } from '../public/coop-protocol.mjs';

const SOLO_KEY='dfe.suncoast.save.v1';
const session={code:'ABC234',playerId:'p1',token:'private-seat-token'};
const copy=value=>JSON.parse(JSON.stringify(value));
function state(extra={}) {
  const player={id:'p1',name:'Chris',x:320,y:300,angle:0,hp:100,stamina:100,interior:'cafe',vehicleId:null,seat:null};
  return {time:0,player,crew:[player],vehicles:[],npcs:[],police:[],effects:[],bullets:[],phase:'playing',dialogue:null,coop:{playerId:'p1',hostId:'p1'},...extra};
}
function fixture(run,{savedSession=null}={}) {
  let time=1000;
  const values=new Map([[SOLO_KEY,'original-solo-story']]),writes=[],results=[],states=[];
  if(savedSession)values.set(SESSION_KEY,JSON.stringify(savedSession));
  const storage={getItem:key=>values.get(key)??null,setItem(key,value){writes.push(['set',key]);values.set(key,value);},removeItem(key){writes.push(['remove',key]);values.delete(key);}};
  const sockets=[];
  class Socket {
    constructor(url){this.url=url;this.readyState=0;this.bufferedAmount=0;this.sent=[];sockets.push(this);}
    open(){this.readyState=1;this.onopen?.();}
    send(data){assert.equal(this.readyState,1);this.sent.push(JSON.parse(data));}
    receive(packet){this.onmessage?.({data:JSON.stringify(packet)});}
    close(code=1000){if(this.readyState===3)return;this.readyState=3;this.onclose?.({code});}
  }
  const client=new CoopClient({url:'ws://localhost:3000/ws',WebSocketImpl:Socket,storage,now:()=>time,onResult:(result,action)=>results.push({result,action}),onState:(view,packet)=>states.push({view,packet})});
  const room={code:session.code,hostId:session.playerId,players:[{id:session.playerId,name:'Chris',connected:true}]};
  const packet=(game=state(),extra={})=>({type:'snapshot',protocol:PROTOCOL,tick:0,ack:0,room,state:game,...extra});
  const join=(socket=sockets.at(-1),game=state(),extra={})=>socket.receive(packet(game,{type:'joined',session,...extra}));
  const start=(game=state())=>{client.connect({type:'create',name:'Chris'});const socket=sockets.at(-1);socket.open();join(socket,game);return socket;};
  try{return run({client,storage,values,writes,results,states,sockets,packet,join,start,advance:ms=>time+=ms});}
  finally{client.leave(false);}
}

test('joining and leaving a crew only changes the separate session storage key',()=>fixture(({client,start,values,writes,storage})=>{
  const socket=start();
  assert.equal(socket.sent[0].type,'create');assert.equal(socket.sent[0].protocol,PROTOCOL);
  assert.deepEqual(readSession(storage),session);
  client.leave();
  assert.equal(socket.sent.at(-1).type,'leave');
  assert.equal(values.get(SOLO_KEY),'original-solo-story');
  assert.equal(values.has(SESSION_KEY),false);
  assert.ok(writes.every(([,key])=>key===SESSION_KEY));
}));

test('a saved reconnect seat survives another refresh while its handshake is pending',()=>fixture(({client,storage,sockets})=>{
  client.connect({type:'resume',...session});
  assert.deepEqual(readSession(storage),session,'retain the private reconnect token until resume succeeds or expires');
  sockets[0].open();
  assert.deepEqual(sockets[0].sent[0],{type:'resume',protocol:PROTOCOL,...session});
  assert.deepEqual(readSession(storage),session);
},{savedSession:session}));

test('congestion sends the latest steering and retains a short fire tap exactly until transmission',()=>fixture(({client,start,advance})=>{
  const socket=start(),initialSeq=client.seq;socket.sent=[];socket.bufferedAmount=500;
  client.setInput({mx:1,fire:true});client.setInput({mx:-1,fire:false});client._pump();
  assert.equal(client.seq,initialSeq);assert.equal(socket.sent.length,0);
  socket.bufferedAmount=0;advance(50);client._pump();
  const first=socket.sent.find(p=>p.type==='input');
  assert.equal(first.seq,initialSeq+1);assert.equal(first.input.mx,-1);assert.equal(first.input.fire,true);
  socket.sent=[];advance(50);client._pump();
  assert.equal(socket.sent.find(p=>p.type==='input').input.fire,false,'tap must not become held fire');
}));

test('neutral input clears queued movement and firing even when the socket is temporarily congested',()=>fixture(({client,start,advance})=>{
  const socket=start();socket.sent=[];socket.bufferedAmount=500;
  client.setInput({mx:1,sprint:true,fire:true});client.neutral();
  assert.equal(socket.sent.length,0);
  socket.bufferedAmount=0;advance(50);client._pump();
  const sent=socket.sent.find(p=>p.type==='input');
  assert.equal(sent.input.mx,0);assert.equal(sent.input.my,0);assert.equal(sent.input.fire,false);assert.equal(sent.input.sprint,false);
  assert.equal(sent.cancelActions,true,'server must distinguish a canceled fire edge from a normal button release');
}));

test('late messages and closure from an old socket cannot replace a resumed room',()=>fixture(({client,start,sockets,join,packet,advance})=>{
  const first=start();first.close(1006);clearTimeout(client.retryTimer);advance(600);client._open();
  const second=sockets.at(-1);second.open();
  assert.equal(second.sent[0].type,'resume');assert.equal(second.sent[0].token,session.token);
  const current=state();current.player.hp=87;join(second,current,{tick:10});
  const stale=state();stale.player.hp=1;first.receive(packet(stale,{tick:999}));
  first.onclose({code:4001});
  assert.equal(client.connected,true);assert.equal(client.state.player.hp,87);assert.equal(client.lastTick,10);
}));

test('discrete action retries reuse the same id and stop after confirmation',()=>fixture(({client,start,advance,results})=>{
  const socket=start();socket.sent=[];
  const action={type:'choose',index:1},id=client.action(action);
  assert.ok(id);assert.deepEqual(socket.sent[0],{type:'action',id,action});
  advance(1250);client._pump();
  assert.deepEqual(socket.sent.filter(p=>p.type==='action').map(p=>p.id),[id,id]);
  socket.receive({type:'result',id,ok:true});
  assert.deepEqual(results.at(-1),{result:{type:'result',id,ok:true},action});
  socket.sent=[];advance(1250);client._pump();
  assert.equal(socket.sent.some(p=>p.type==='action'),false);
  assert.equal(client.pending.size,0);
}));

test('acknowledged movement is not replayed, while a newer input remains predicted',()=>fixture(({client,start,packet,advance})=>{
  const socket=start();advance(16);client.advance({mx:1},1/60);client._sendInput();
  const acknowledgedSeq=client.seq,acknowledgedX=client.predicted.player.x;
  advance(16);client.advance({mx:1},1/60);const predictedX=client.predicted.player.x;
  const authoritative=state();authoritative.player.x=acknowledgedX;
  socket.receive(packet(authoritative,{tick:1,ack:acknowledgedSeq}));
  assert.ok(Math.abs(client.predicted.player.x-predictedX)<1e-8);
  assert.ok(client.frames.every(frame=>frame.seq>acknowledgedSeq));
  assert.equal(client.frames.length,1);
  const entered=state();entered.player.interior='clinic';entered.player.x=100;
  socket.receive(packet(entered,{tick:2,ack:acknowledgedSeq}));
  assert.equal(client.frames.length,0);assert.equal(client.view().player.x,100);
  assert.deepEqual(client.correction,{x:0,y:0},'an interior transition must never ease through unrelated room coordinates');
}));

test('older snapshots cannot roll back authority and remote interpolation resets at a scene change',()=>fixture(({client,start,packet,advance})=>{
  const initial=state();initial.crew.push({id:'p2',name:'Maya',x:100,y:250,interior:'cafe',vehicleId:null,seat:null,angle:0});
  const socket=start(initial);advance(100);
  const moved=copy(initial);moved.crew[1].x=200;socket.receive(packet(moved,{tick:2,ack:2}));
  advance(50);assert.equal(client.view().crew[1].x,150);
  socket.receive(packet(initial,{tick:1,ack:0}));assert.equal(client.lastTick,2);assert.equal(client.ack,2);
  const outdoors=copy(moved);outdoors.crew[1].interior=null;outdoors.crew[1].x=1000;
  socket.receive(packet(outdoors,{tick:3,ack:2}));
  assert.equal(client.view().crew[1].x,1000);
}));

test('socket routing preserves the existing frontend origin and uses local development servers directly',()=>{
  assert.equal(socketURL({hostname:'dfe-suncoast.onrender.com',origin:'https://dfe-suncoast.onrender.com'}),'wss://dfe-suncoast-coop.onrender.com/ws');
  assert.equal(socketURL({hostname:'localhost',origin:'http://localhost:3000'}),'ws://localhost:3000/ws');
});
