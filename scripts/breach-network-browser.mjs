// Integration checks use a local proxy to mute only one browser's incoming
// traffic while leaving its old upstream connection open. No production room
// is touched. Run after building dist_breach and installing Playwright.
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { WebSocket, WebSocketServer } from 'ws';
import { createBreachServer } from '../server/breach-server.mjs';
const out='breach-network-results';await mkdir(out,{recursive:true});
const app=createBreachServer();
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const backend=`http://127.0.0.1:${app.server.address().port}`;
const links=[];
const proxy=http.createServer((req,res)=>{
  const upstream=http.request(backend+req.url,{method:req.method,headers:{'content-type':req.headers['content-type']||'text/plain'}},reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);});
  upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);
});
const sockets=new WebSocketServer({server:proxy});
sockets.on('connection',downstream=>{
  const upstream=new WebSocket(backend.replace('http:','ws:')+'/ws',{headers:{Origin:backend}});
  const link={downstream,upstream,muted:false,pending:[]};links.push(link);
  downstream.on('message',data=>{if(upstream.readyState===WebSocket.OPEN)upstream.send(data.toString());else link.pending.push(data.toString());});
  upstream.on('open',()=>{for(const data of link.pending)upstream.send(data);link.pending=[];});
  upstream.on('message',data=>{if(!link.muted&&downstream.readyState===WebSocket.OPEN)downstream.send(data.toString());});
  downstream.on('close',()=>{if(!link.muted)upstream.close();});
  upstream.on('close',()=>{if(downstream.readyState===WebSocket.OPEN)downstream.close();});
  downstream.on('error',()=>{});upstream.on('error',()=>{});
});
await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${proxy.address().port}`;
const browser=await chromium.launch({headless:true,args:['--disable-webgl']});
let guest,stream;const results=[];
async function until(predicate,message,timeout=10000){const end=Date.now()+timeout;while(Date.now()<end){if(predicate())return;await new Promise(r=>setTimeout(r,25));}throw new Error(message);}
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'/?mission=underworks-13');
  await page.getByRole('button',{name:'PLAY WITH A FRIEND'}).click();
  await page.getByLabel('YOUR CALL SIGN').fill('Network QA');
  await page.getByLabel('CO-OP MISSION').selectOption('underworks-13');
  await page.getByRole('button',{name:'CREATE PRIVATE ROOM'}).click();
  await page.waitForFunction(()=>/^[A-Z0-9]{8}$/.test(document.getElementById('room-id').textContent));
  const roomId=await page.locator('#room-id').innerText();
  guest=new WebSocket(backend.replace('http:','ws:')+'/ws',{headers:{Origin:backend}});
  let room,lastState,seq=0;
  guest.on('message',data=>{const m=JSON.parse(data);if(m.type==='room')room=m.room;if(m.type==='state')lastState=m.state;});
  await new Promise(resolve=>guest.once('open',resolve));
  guest.send(JSON.stringify({type:'join',protocol:2,roomId,name:'Teammate QA'}));
  await until(()=>room?.players.length===2,'guest must join');
  guest.send(JSON.stringify({type:'ready',ready:true}));
  await page.getByRole('button',{name:'I’M READY'}).click();
  stream=setInterval(()=>{if(room?.status==='playing'&&guest.readyState===WebSocket.OPEN)guest.send(JSON.stringify({type:'input',seq:++seq,forward:0,strafe:0,angle:0,fire:false}));},33);
  await page.getByRole('button',{name:'START THE UNDERWORKS'}).click();
  await page.waitForFunction(()=>document.body.dataset.mode==='playing');
  await page.keyboard.down('a');await page.waitForTimeout(650);await page.keyboard.up('a');
  await page.keyboard.press('e');
  await until(()=>lastState?.interactables.find(i=>i.id==='transit-arrival')?.used,'initial transit must activate through real input');
  const authoritativeRoom=app.rooms.rooms.get(roomId),run=authoritativeRoom.game;
  const beforeTime=run.state.time,originalPeer=authoritativeRoom.players.get('p1').peer;
  results.push({check:'two-player start and shared transit activation',passed:true});
  links[0].muted=true;
  await page.waitForFunction(()=>document.body.dataset.mode==='paused');
  await until(()=>links.length>=2,'watchdog must open a replacement',12000);
  await until(()=>authoritativeRoom.players.get('p1').peer!==originalPeer&&authoritativeRoom.players.get('p1').peer,'new transport must own the same slot');
  await page.waitForFunction(()=>document.getElementById('coop-network-detail').textContent.includes('CONNECTED'));
  assert.equal(app.rooms.rooms.get(roomId),authoritativeRoom);assert.equal(authoritativeRoom.game,run);
  assert.equal(run.state.status,'paused');assert.ok(run.state.time>=beforeTime);
  assert.equal(run.state.interactables.find(i=>i.id==='transit-arrival').used,true);
  assert.match(authoritativeRoom.pauseReason,/reconnected/);
  assert.equal(authoritativeRoom.players.get('p1').ready,false);assert.equal(authoritativeRoom.players.get('p2').ready,false);
  results.push({check:'one-way outage: same run, same progression, both must resume',passed:true});
  await page.screenshot({path:`${out}/desktop-recovered.png`});
  guest.send(JSON.stringify({type:'resume'}));
  await page.getByRole('button',{name:'READY TO RESUME'}).click();
  await page.waitForFunction(()=>document.body.dataset.mode==='playing');
  await page.keyboard.press('p');
  await page.getByRole('button',{name:'RECONNECT WITHOUT LEAVING'}).click();
  await until(()=>links.length>=3,'manual reconnect must open a new transport');
  await page.waitForFunction(()=>document.getElementById('coop-network-detail').textContent.includes('CONNECTED'));
  assert.equal(authoritativeRoom.game,run);assert.equal(run.state.interactables.find(i=>i.id==='transit-arrival').used,true);
  assert.equal(app.rooms.rooms.size,1);
  results.push({check:'manual reconnect retains the room and mission progress',passed:true});
  await page.setViewportSize({width:393,height:852});
  await page.screenshot({path:`${out}/phone-portrait-recovered.png`,fullPage:true});
  assert.equal(await page.locator('#coop-network-reconnect').isVisible(),true);
  await page.setViewportSize({width:852,height:393});
  await page.screenshot({path:`${out}/phone-landscape-recovered.png`,fullPage:true});
  assert.equal(await page.locator('#coop-network-reconnect').isVisible(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  results.push({check:'desktop and phone-sized recovery controls: no script errors or horizontal overflow',passed:true});
  await page.getByRole('button',{name:'LEAVE ROOM',exact:true}).click();
  await until(()=>app.rooms.rooms.size===0,'test room must close');
  assert.equal(await page.locator('#coop-network-indicator').count(),0);
  results.push({check:'leave cleans up the room and diagnostics',passed:true});
  await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));
  console.log(JSON.stringify({passed:results.length,results},null,2));
}finally{
  clearInterval(stream);guest?.terminate();
  for(const link of links){link.downstream.terminate();link.upstream.terminate();}
  sockets.close();await new Promise(resolve=>proxy.close(resolve));await app.close();await browser.close();
}
