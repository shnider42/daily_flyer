import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {createClaimServer} from '../server/claim-server.mjs';
async function client(url){const ws=new WebSocket(url),messages=[];ws.on('message',b=>messages.push(JSON.parse(b)));await once(ws,'open');return {ws,messages,send:m=>ws.send(JSON.stringify(m))};}
async function waitFor(fn){for(let i=0;i<150;i++){const value=fn();if(value)return value;await new Promise(r=>setTimeout(r,20));}throw new Error('Timed out waiting for room packet');}
test('HTTP build, private files, four real sockets and reconnect work together',async()=>{
  const app=createClaimServer();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+app.server.address().port,clients=[];let pulse;
  try{
    const health=await (await fetch(origin+'/health')).json();assert.equal(health.version,'0.1.0');assert.equal(health.maxPlayersPerRoom,4);
    const html=await (await fetch(origin)).text();assert.ok(html.includes('CLAIM'));assert.ok(!html.includes('__CLAIM_DENIED_'));
    assert.equal((await fetch(origin+'/.git/config')).status,404);assert.equal((await fetch(origin+'/core.mjs',{method:'POST'})).status,405);
    const host=await client(origin.replace('http','ws')+'/ws');clients.push(host);host.send({type:'create',protocol:1,game:'claim-denied',mission:'everwell-house',difficulty:'standard',name:'Host'});
    const welcome=await waitFor(()=>host.messages.find(m=>m.type==='welcome'));
    for(let i=1;i<4;i++){const c=await client(origin.replace('http','ws')+'/ws');clients.push(c);c.send({type:'join',protocol:1,game:'claim-denied',roomId:welcome.roomId,name:'Neighbor '+i});await waitFor(()=>c.messages.some(m=>m.type==='welcome'));}
    for(const c of clients)c.send({type:'ready',ready:true});await waitFor(()=>host.messages.some(m=>m.type==='room'&&m.room.players.length===4&&m.room.players.every(p=>p.ready)));
    host.send({type:'start'});let seq=0;pulse=setInterval(()=>{for(const c of clients)if(c.ws.readyState===1)c.send({type:'input',seq:seq++,forward:0,strafe:0,angle:0,pitch:0,fire:false});},33);
    await waitFor(()=>clients.every(c=>c.messages.some(m=>m.type==='state'&&m.state.status==='playing')));
    const states=clients.map(c=>c.messages.find(m=>m.type==='state').state);for(const s of states){assert.equal(s.players.length,4);assert.equal(s.windows.length,6);}
    const token=clients[3].messages.find(m=>m.type==='welcome').token;clients[3].ws.close();await waitFor(()=>host.messages.some(m=>m.type==='room'&&m.room.status==='paused'));
    const replacement=await client(origin.replace('http','ws')+'/ws');clients[3]=replacement;replacement.send({type:'join',protocol:1,game:'claim-denied',roomId:welcome.roomId,token,replace:true});const rejoined=await waitFor(()=>replacement.messages.find(m=>m.type==='welcome'));assert.equal(rejoined.selfId,'p4');assert.equal(rejoined.resumed,true);
    for(const c of clients)c.send({type:'resume'});await waitFor(()=>replacement.messages.some(m=>m.type==='room'&&m.room.status==='playing'));
    // Same authoritative elapsed time/positions reach every peer.
    const snapshot=await waitFor(()=>replacement.messages.find(m=>m.type==='state'&&m.tick>=3));assert.equal(snapshot.state.players.length,4);assert.ok(snapshot.state.time>0);
  }finally{clearInterval(pulse);for(const c of clients)c.ws.terminate();await app.close();}
});
