import test from 'node:test';
import assert from 'node:assert/strict';
import {PartyClient} from '../daily_flyer/themes/claim_denied_assets/network.mjs';

test('resume grants a fresh snapshot grace period; only sustained silence reconnects',t=>{
  t.mock.timers.enable({apis:['Date','setInterval','setTimeout'],now:10000});
  const originals=new Map(['WebSocket','location','sessionStorage'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  class Socket {
    readyState=0;sent=[];closed=false;
    send(text){this.sent.push(JSON.parse(text));}
    close(){this.closed=true;this.readyState=3;this.onclose?.();}
    open(){this.readyState=1;this.onopen();}
    packet(packet){this.onmessage({data:JSON.stringify(packet)});}
  }
  Object.assign(globalThis,{WebSocket:Socket,location:{href:'https://example.test/'},sessionStorage:{setItem(){},removeItem(){}}});
  const client=new PartyClient();
  t.after(()=>{client.leave();for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
  client.connect({code:'ABCDEFGH',name:'Test'});const ws=client.ws;ws.open();
  ws.packet({type:'room',room:{status:'paused'}});t.mock.timers.tick(60000);assert.equal(ws.closed,false);
  ws.packet({type:'room',room:{status:'playing'}});t.mock.timers.tick(3000);assert.equal(ws.closed,false);
  ws.packet({type:'state',state:{},events:[]});t.mock.timers.tick(7000);assert.equal(ws.closed,false);
  // The client never injects a second global pause from stale pre-resume state.
  assert.equal(ws.sent.some(p=>p.type==='pause'),false);
  t.mock.timers.tick(2000);assert.equal(ws.closed,true);
});
