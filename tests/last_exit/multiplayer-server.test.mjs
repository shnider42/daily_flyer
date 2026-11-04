import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';
import WebSocket from '../../server/last-exit/vendor/ws/wrapper.mjs';import {attachRooms} from '../../server/last-exit/rooms.mjs';
async function peer(url,hello,origin){const ws=new WebSocket(url,origin?{origin}:{}),messages=[];ws.on('message',data=>messages.push(JSON.parse(data)));await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});ws.send(JSON.stringify({type:'hello',protocol:10,...hello}));const until=async fn=>{for(let i=0;i<150;i++){const m=messages.find(fn);if(m)return m;await new Promise(r=>setTimeout(r,20));}throw Error('Timed out waiting for room state');};return{ws,messages,until,send:m=>ws.send(JSON.stringify(m))};}
test('real WebSockets share a city, reject a third driver, resume the same car, and release seats on leave',async()=>{
 const server=createServer(),mp=attachRooms(server);await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`ws://127.0.0.1:${server.address().port}/multiplayer`,peers=[];
 try{const a=await peer(url,{create:true,name:'Alpha'});peers.push(a);const h=await a.until(m=>m.type==='welcome'),b=await peer(url,{code:h.code,name:'Beta'});peers.push(b);const hb=await b.until(m=>m.type==='welcome');assert.notEqual(h.id,hb.id);const state=await a.until(m=>m.type==='state'&&m.players.length===2);assert.equal(state.players.length,2);
 const third=await peer(url,{code:h.code});peers.push(third);assert.match((await third.until(m=>m.type==='error')).message,/two drivers/);
 a.send({type:'input',commands:[1,2,3].map(seq=>({seq,input:{gas:1}}))});assert.equal((await a.until(m=>m.type==='state'&&m.ack===3)).ack,3);
 const car=mp.service.rooms.get(h.code).sessions.get(h.token).player.car;car.damage=38;await b.until(m=>m.type==='state'&&m.defs.some(d=>d.id===car.netId&&d.damage===38));
 a.ws.terminate();const resumed=await peer(url,{code:h.code,token:h.token});peers.push(resumed);const rh=await resumed.until(m=>m.type==='welcome');assert.equal(rh.id,h.id);const rs=await resumed.until(m=>m.type==='state');assert.ok(rs.defs.some(d=>d.id===car.netId&&d.damage===38));
 resumed.send({type:'leave'});await b.until(m=>m.type==='state'&&m.players.length===1);assert.equal(mp.service.rooms.get(h.code).world.members.size,1);
 const replacement=await peer(url,{code:h.code,name:'Replacement'});peers.push(replacement);assert.ok(await replacement.until(m=>m.type==='welcome'));
 }finally{for(const p of peers)p.ws.terminate();mp.close();await new Promise(r=>server.close(r));}
});
test('cross-origin connections are rejected before joining and oversized frames cannot create a room',async()=>{
 const server=createServer(),mp=attachRooms(server);await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`ws://127.0.0.1:${server.address().port}/multiplayer`;
 try{await assert.rejects(peer(url,{create:true},'https://unrelated.invalid'),/403/);const ws=new WebSocket(url);await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});const closed=new Promise(r=>ws.once('close',r));ws.send('x'.repeat(9000));assert.equal(await closed,1009);assert.equal(mp.service.rooms.size,0);}finally{mp.close();await new Promise(r=>server.close(r));}
});
