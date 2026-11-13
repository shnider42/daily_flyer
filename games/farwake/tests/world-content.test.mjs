import test from 'node:test';
import assert from 'node:assert/strict';
import { FarwakeNetwork } from '../dist/network.mjs';
import { WORLD_CONTENT_VERSION, WORLD_CONTENT_REFRESH_MESSAGE } from '../dist/world-content.mjs';

test('client announces its world content before registration and refuses an older registration response', async () => {
  const writes=[],requests=[];
  let opened=0;
  const network=new FarwakeNetwork({url:'https://galaxy.example.test',storage:{getItem:()=>null,setItem:(...args)=>writes.push(args)},autoReconnect:false,
    fetchImpl:async(url,options)=>{if(url.endsWith('/api/config'))return new Response(JSON.stringify({ok:true,worldContentVersion:WORLD_CONTENT_VERSION}));requests.push(JSON.parse(options.body));return new Response(JSON.stringify({ok:true,passport:{realmCode:'CONTENT1',captainId:'test-captain',token:'test-token'}}));}
  });
  network._open=()=>{opened++;};
  await assert.rejects(network.connect({create:true,name:'Current captain'}),{message:WORLD_CONTENT_REFRESH_MESSAGE});
  assert.equal(requests[0].worldContentVersion,WORLD_CONTENT_VERSION);
  assert.equal(opened,0);assert.deepEqual(writes,[],'an incompatible response cannot replace a saved passport');
});

test('read-only compatibility preflight prevents a new client from creating a captain on an older authority',async()=>{
  const calls=[],writes=[];
  const network=new FarwakeNetwork({url:'https://galaxy.example.test',storage:{getItem:()=>null,setItem:(...args)=>writes.push(args)},autoReconnect:false,
    fetchImpl:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({ok:true,protocol:1}));}
  });
  await assert.rejects(network.connect({create:true,name:'Fresh frontend'}),{message:WORLD_CONTENT_REFRESH_MESSAGE});
  assert.equal(calls.length,1);assert.equal(calls[0].url,'https://galaxy.example.test/api/config');assert.equal(calls[0].options.method,'GET');
  assert.equal(calls[0].options.credentials,'omit');assert.equal(calls[0].options.cache,'no-store');assert.equal(calls[0].options.body,undefined);assert.deepEqual(writes,[]);
});

test('an incompatible welcome never reaches the world, prediction, input timers or reconnect loop', async () => {
  for(const version of [undefined,0,WORLD_CONTENT_VERSION+1,String(WORLD_CONTENT_VERSION)]){
    let socket,applied=0,started=0;const sent=[],statuses=[],closes=[];
    class Socket{
      constructor(){socket=this;this.handlers={};this.readyState=1;}
      addEventListener(name,callback){this.handlers[name]=callback;}
      send(value){sent.push(JSON.parse(value));}
      close(code,reason){this.readyState=3;closes.push({code,reason});this.handlers.close?.({code,reason});}
    }
    const network=new FarwakeNetwork({url:'https://galaxy.example.test',WebSocketImpl:Socket,storage:null,autoReconnect:true,onStatus:status=>statuses.push(status)});
    network._snapshot=()=>{applied++;};network._startTimers=()=>{started++;};
    const opening=network._open();socket.handlers.open();
    assert.equal(sent[0].worldContentVersion,WORLD_CONTENT_VERSION);
    socket.handlers.message({data:JSON.stringify({type:'snapshot',state:{unvalidated:true}})});
    assert.equal(applied,0,'world packets before a compatible welcome are ignored');
    socket.handlers.message({data:JSON.stringify({type:'welcome',worldContentVersion:version,state:{oldLayout:true}})});
    await assert.rejects(opening,{message:WORLD_CONTENT_REFRESH_MESSAGE});
    assert.equal(applied,0);assert.equal(started,0);assert.equal(network.connected,false);assert.equal(network.reconnectTimer,undefined);
    assert.deepEqual(closes,[{code:4001,reason:WORLD_CONTENT_REFRESH_MESSAGE}]);
    assert.ok(statuses.some(status=>status.code==='world-content-version'&&status.reason===WORLD_CONTENT_REFRESH_MESSAGE));
    assert.equal(statuses.at(-1).state,'disconnected');
  }
});

test('a matching welcome continues through the existing snapshot and connection path', async () => {
  let socket,applied=0,started=0;
  class Socket{constructor(){socket=this;this.handlers={};this.readyState=1;}addEventListener(name,callback){this.handlers[name]=callback;}send(){}close(){this.readyState=3;}}
  const network=new FarwakeNetwork({url:'https://galaxy.example.test',WebSocketImpl:Socket,storage:null,autoReconnect:false});
  network._snapshot=()=>{applied++;};network._startTimers=()=>{started++;};
  const opening=network._open();socket.handlers.open();
  const welcome={type:'welcome',worldContentVersion:WORLD_CONTENT_VERSION,serverTime:Date.now(),ack:0,realm:{code:'CONTENT1'}};
  socket.handlers.message({data:JSON.stringify(welcome)});
  assert.deepEqual(await opening,welcome);assert.equal(applied,1);assert.equal(started,1);assert.equal(network.connected,true);
  network.disconnect();
});
