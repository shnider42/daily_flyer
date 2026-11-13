import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { startServer } from '../../server/index.mjs';
import { FarwakeNetwork } from '../../dist/network.mjs';
import { WORLD_CONTENT_VERSION, WORLD_CONTENT_REFRESH_MESSAGE } from '../../dist/world-content.mjs';

function memoryPersistence(){
  const records=new Map();
  return{kind:'content-version-test',durable:false,reads:0,writes:0,records,
    async ping(){return{ok:true};},
    async load(id){this.reads++;return structuredClone(records.get(id)||{version:0,snapshot:null});},
    async save(id,version,snapshot){this.writes++;records.set(id,{version:version+1,snapshot:structuredClone(snapshot)});return{version:version+1};}
  };
}
async function fixture(t){
  const persistence=memoryPersistence(),server=await startServer({port:0,host:'127.0.0.1',persistence,flushIntervalMs:600000});
  t.after(()=>server.close());
  return{server,persistence,async request(body){const response=await fetch(`${server.url}/api/realms`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return{status:response.status,data:await response.json()};}};
}
async function rejectedHello(server,packet){
  return new Promise((resolve,reject)=>{
    const socket=new WebSocket(server.url.replace(/^http/,'ws')+'/ws'),packets=[];
    const timer=setTimeout(()=>{socket.terminate();reject(new Error('Expected compatibility rejection.'));},4000);
    socket.on('open',()=>socket.send(JSON.stringify(packet)));
    socket.on('message',data=>packets.push(JSON.parse(data.toString())));
    socket.on('close',(code,reason)=>{clearTimeout(timer);resolve({code,reason:reason.toString(),packets});});
    socket.on('error',error=>{clearTimeout(timer);reject(error);});
  });
}

test('stale or missing world content is rejected before HTTP realm creation, joins or saved-state reads',async t=>{
  const f=await fixture(t);
  for(const version of [undefined,0,WORLD_CONTENT_VERSION+1,String(WORLD_CONTENT_VERSION)]){
    const result=await f.request({action:'create',worldContentVersion:version,name:'Stale tab'});
    assert.equal(result.status,409);assert.equal(result.data.code,'world-content-version');assert.equal(result.data.reason,WORLD_CONTENT_REFRESH_MESSAGE);
  }
  assert.equal(f.server.manager.realms.size,0);assert.equal(f.persistence.reads,0);assert.equal(f.persistence.writes,0);assert.equal(f.persistence.records.size,0);
  const current=await f.request({action:'create',worldContentVersion:WORLD_CONTENT_VERSION,name:'Current captain'});
  assert.equal(current.status,200);assert.equal(current.data.worldContentVersion,WORLD_CONTENT_VERSION);
  const realm=f.server.manager.realms.get(current.data.passport.realmCode),reads=f.persistence.reads,writes=f.persistence.writes,count=realm.captains.size;
  for(const action of ['join','resume']){
    const result=await f.request({action,realmCode:realm.id,passport:current.data.passport,name:'Stale returning tab'});
    assert.equal(result.status,409);assert.equal(result.data.code,'world-content-version');
  }
  assert.equal(realm.captains.size,count);assert.equal(f.persistence.reads,reads);assert.equal(f.persistence.writes,writes);assert.equal(realm.onlineCount,0);
});

test('stale hello closes before passport authentication or session attachment even with a valid passport',async t=>{
  const f=await fixture(t),created=await f.request({action:'create',worldContentVersion:WORLD_CONTENT_VERSION,name:'Saved captain'});
  const passport=created.data.passport,realm=f.server.manager.realms.get(passport.realmCode);
  let authenticated=0,attached=0;
  const authenticate=realm.authenticate.bind(realm),attach=realm.attach.bind(realm);
  realm.authenticate=(...args)=>{authenticated++;return authenticate(...args);};realm.attach=(...args)=>{attached++;return attach(...args);};
  const reads=f.persistence.reads,writes=f.persistence.writes;
  for(const version of [undefined,0,WORLD_CONTENT_VERSION+1]){
    const result=await rejectedHello(f.server,{type:'hello',protocol:1,worldContentVersion:version,passport});
    assert.equal(result.code,4001);assert.equal(result.reason,WORLD_CONTENT_REFRESH_MESSAGE);
    assert.equal(result.packets.length,1);assert.equal(result.packets[0].type,'error');assert.equal(result.packets[0].code,'world-content-version');
  }
  assert.equal(authenticated,0);assert.equal(attached,0);assert.equal(realm.onlineCount,0);
  assert.equal(f.persistence.reads,reads);assert.equal(f.persistence.writes,writes);assert.equal(realm.captains.get(passport.captainId).session,null);
});

test('the current browser transport registers, validates a matching welcome and resumes its same passport',async t=>{
  const f=await fixture(t),applied=[],statuses=[];
  const network=new FarwakeNetwork({url:f.server.url,WebSocketImpl:WebSocket,storage:null,autoReconnect:false,onSnapshot:value=>applied.push(value),onStatus:value=>statuses.push(value)});
  t.after(()=>network.disconnect());
  const welcome=await network.connect({create:true,name:'Compatible captain'});
  assert.equal(welcome.worldContentVersion,WORLD_CONTENT_VERSION);assert.equal(network.connected,true);assert.ok(applied.length>=1);
  const passport=structuredClone(network.passport);network.disconnect();
  const resumed=await network.connect({passport});
  assert.equal(resumed.worldContentVersion,WORLD_CONTENT_VERSION);assert.deepEqual(network.passport,passport);assert.equal(network.connected,true);
  const config=await(await fetch(`${f.server.url}/api/config`)).json();assert.equal(config.worldContentVersion,WORLD_CONTENT_VERSION);assert.equal(config.protocol,1);
  assert.ok(statuses.some(status=>status.state==='connected'));
});
