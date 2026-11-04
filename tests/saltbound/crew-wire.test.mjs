import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import WebSocket from '../../server/last-exit/vendor/ws/wrapper.mjs';
import {PROTOCOL,EXITS} from '../../daily_flyer/themes/saltbound_assets/core.mjs';
import {newId} from '../../daily_flyer/themes/saltbound_assets/campaign.mjs';

process.env.NODE_ENV='test';
const {server,sea}=await import('../../server/saltbound/server.mjs');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(condition) {
  const end=Date.now()+3500;
  while(!condition()){
    if(Date.now()>end)throw Error('Timed out waiting for the crew snapshot.');
    await delay(15);
  }
}

test('four socket clients swap stations on deck, receive one mast signal, and extract the same campaign order',async()=>{
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base='127.0.0.1:'+server.address().port,clients=[];
  async function join(fields) {
    const ws=new WebSocket('ws://'+base+'/crew');
    const client={ws,send:action=>ws.send(JSON.stringify({type:'action',action}))};
    clients.push(client);
    ws.on('message',raw=>{
      const m=JSON.parse(raw);
      if(m.type==='welcome')client.welcome=m;
      if(m.type==='state')client.state=m.state;
    });
    await once(ws,'open');
    ws.send(JSON.stringify({type:'hello',protocol:PROTOCOL,pirateId:newId(),...fields}));
    await until(()=>client.welcome&&client.state);
    return client;
  }
  try{
    const campaign={id:newId(),name:'Kite Fleet',chapter:0,difficulty:'normal'};
    const a=await join({create:true,campaign,name:'Skipper'}),code=a.welcome.code;
    assert(a.state.waiting);
    assert.deepEqual(await (await fetch('http://'+base+'/api/crew/'+code)).json(),campaign);
    const b=await join({code,name:'Gunner'}),c=await join({code,name:'Surgeon'}),d=await join({code,name:'Lookout'});
    await until(()=>clients.every(client=>client.state.players.length===4 && !client.state.waiting));
    assert.deepEqual(d.state.players.map(p=>p.station),['helm','guns','medic','mast']);
    a.send('station:holding');
    await until(()=>b.state.players[0].station==='holding');
    b.send('station:helm');
    await until(()=>a.state.ship.helm===b.welcome.id);
    await delay(110);a.send('station:guns');
    d.send('scan');
    await until(()=>clients.every(client=>client.state.ship.mark && client.state.players[0].station==='guns'));
    assert(clients.every(client=>client.state.players.every(p=>p.aboard)));
    const game=sea.service.rooms.get(code).game;
    game.damageShip(25);c.send('bucket');
    await until(()=>!!d.state.ship.bucket);
    await delay(690);c.send('bucket');
    await until(()=>!a.state.ship.bucket && a.state.message.includes('bucket'));
    game.cargo=[{island:'palm',value:80}];
    Object.assign(game.ship,{x:EXITS[0].x,y:EXITS[0].y,speed:0});
    b.send('interact');await until(()=>d.state.extracting);
    game.exitProgress=9.99;
    await until(()=>clients.every(client=>client.state.status==='extracted'));
    for(const client of clients){
      assert.equal(client.state.receipt.campaignId,campaign.id);
      assert.equal(client.state.receipt.gold,205);
      assert.equal(client.state.campaign.chapter,1);
    }
  }finally{
    for(const {ws} of clients)ws.terminate();
    sea.close();await new Promise(resolve=>server.close(resolve));
  }
});
