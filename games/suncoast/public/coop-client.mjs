/** Bounded input prediction and room transport. Never writes the solo save. */
import * as Sim from './sim.mjs';
import {PROTOCOL, INPUT_HZ, cleanInput, normalizeRoomCode} from './coop-protocol.mjs';

export const SESSION_KEY = 'dfe.suncoast.crew.session.v1';
export const CREW_SAVE_KEY = 'dfe.suncoast.crew.checkpoint.v1';
export const BACKEND = 'https://dfe-suncoast-coop.onrender.com';
const clone = value => JSON.parse(JSON.stringify(value));
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
const sameSpace = (a,b) => !!a && !!b && (a.interior||null)===(b.interior||null) && (a.vehicleId||null)===(b.vehicleId||null) && (a.seat||null)===(b.seat||null);
const angleMix = (a,b,t) => a + Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
export function socketURL(location=globalThis.location) {
  const remote = location.hostname==='dfe-suncoast.onrender.com';
  const url=new URL(remote?BACKEND:location.origin);
  url.protocol=url.protocol==='https:'?'wss:':'ws:';url.pathname='/ws';url.search='';url.hash='';
  return url.href;
}
export function readSession(storage=globalThis.sessionStorage) {
  try {
    const s=JSON.parse(storage?.getItem(SESSION_KEY)||'null');
    return s&&typeof s.token==='string'&&typeof s.playerId==='string'&&normalizeRoomCode(s.code)?s:null;
  } catch {return null;}
}
function interpolateList(previous,current,t,skipId=null) {
  const before=new Map((previous||[]).map(e=>[e.id,e]));
  return (current||[]).map(e=>{
    const p=before.get(e.id);
    if(e.id===skipId||!p||!sameSpace(p,e)||Math.hypot(e.x-p.x,e.y-p.y)>300)return e;
    return {...e,x:p.x+(e.x-p.x)*t,y:p.y+(e.y-p.y)*t,
      angle:Number.isFinite(e.angle)&&Number.isFinite(p.angle)?angleMix(p.angle,e.angle,t):e.angle};
  });
}

export class CoopClient {
  constructor({url,WebSocketImpl=globalThis.WebSocket,storage=globalThis.sessionStorage,now=()=>performance.now(),onJoined=()=>{},onState=()=>{},onStatus=()=>{},onResult=()=>{},onCheckpoint=()=>{}}={}) {
    Object.assign(this,{url:url||socketURL(),WebSocketImpl,storage,now,onJoined,onState,onStatus,onResult,onCheckpoint});
    this.session=null;this.status='idle';this.state=null;this.predicted=null;this.previous=null;
    this.input={};this.seq=0;this.ack=0;this.frames=[];this.pending=new Map();this.actionCounter=0;
    this.correction={x:0,y:0};this.receivedAt=0;this.snapshotInterval=100;this.ping=0;
    this.generation=0;this.closed=true;this.retry=0;this.lastTick=-1;this.fireLatch=false;this.cancelActions=false;
    this.commandPrefix=Math.random().toString(36).slice(2,10);
  }
  get connected(){return this.status==='connected'&&this.ws?.readyState===1;}
  get isHost(){return !!this.session&&this.room?.hostId===this.session.playerId;}
  get diagnostics(){return {status:this.status,ping:Math.round(this.ping),snapshotAge:Math.max(0,Math.round(this.now()-this.receivedAt)),players:this.room?.players?.length||0,queuedActions:this.pending.size,pendingFrames:this.frames.length,bufferedBytes:this.ws?.bufferedAmount||0};}
  _status(status,reason=''){this.status=status;this.reason=reason;this.onStatus(status,reason);}
  connect(request) {
    this.leave(false);this.closed=false;this.session=request.type==='resume'?{code:normalizeRoomCode(request.code),playerId:request.playerId,token:request.token}:null;
    if(this.session){try{this.storage?.setItem(SESSION_KEY,JSON.stringify(this.session));}catch{}}
    this.request={...request,protocol:PROTOCOL};this.startedAt=this.now();this.retry=0;this._open();
    this.timer=setInterval(()=>this._pump(),1000/INPUT_HZ);
  }
  _open() {
    if(this.closed)return;
    const generation=++this.generation;
    this._status(this.session?'reconnecting':'connecting',this.session?'Reconnecting to your crew…':'Connecting to the city. The server may need a moment to wake up.');
    const ws=this.ws=new this.WebSocketImpl(this.url);let handshakeSent=false;
    this.connectTimeout=setTimeout(()=>{if(generation===this.generation&&ws.readyState!==3)ws.close();},70000);
    ws.onopen=()=>{
      if(generation!==this.generation||this.closed){ws.close();return;}
      const hello=this.session?{type:'resume',protocol:PROTOCOL,...this.session}:this.request;
      ws.send(JSON.stringify(hello));handshakeSent=true;
    };
    ws.onmessage=event=>{
      if(generation!==this.generation||this.closed)return;
      let m;try{m=JSON.parse(event.data);}catch{return;}
      if(m.type==='joined'){
        clearTimeout(this.connectTimeout);this.session=m.session;
        try{this.storage?.setItem(SESSION_KEY,JSON.stringify(this.session));}catch{}
        this.retry=0;this.seq=Math.max(this.seq,Number(m.ack)||0);this.frames=[];this.pending.clear();this.input={};this.fireLatch=false;
        this._status('connected');this._accept(m,true);this.onJoined(m);this._sendInput(true);
      }else if(m.type==='snapshot'){this._accept(m);}
      else if(m.type==='pong'&&Number.isFinite(m.sentAt)){const sample=clamp(this.now()-m.sentAt,0,10000);this.ping=this.ping?this.ping*.7+sample*.3:sample;}
      else if(m.type==='result'){
        const pending=this.pending.get(m.id);this.pending.delete(m.id);
        if(m.ok&&m.save)this.onCheckpoint(m.save);
        this.onResult(m,pending?.action);
      }else if(m.type==='error'){
        const reason=m.reason||'The crew could not be reached.';
        if(m.fatal||!this.state){this._fail(reason,true);}else this.onResult({ok:false,reason});
      }else if(m.type==='left'){this.leave(false);}
    };
    ws.onerror=()=>{}; // close carries retry semantics; do not report the same failure twice.
    ws.onclose=event=>{
      if(generation!==this.generation||this.closed)return;
      clearTimeout(this.connectTimeout);this.input={};this.fireLatch=false;this.frames=[];
      if(this.pending.size)this.onResult({ok:false,reason:'The connection interrupted an action. Check the city after reconnecting before trying it again.'});
      this.pending.clear();
      if([4001,4003,4009].includes(event.code)){this._fail(event.code===4001?'This crew seat was opened in another tab.':event.code===4009?'The city has been updated. Refresh to reconnect.':'This crew session has expired. Host or join a room again.',true);return;}
      if(!this.session&&handshakeSent){this._fail('The connection ended before your crew was confirmed. Please try again.',false);return;}
      const limit=this.session?60000:90000;
      this.disconnectedAt??=this.now();
      if(this.now()-(this.session?this.disconnectedAt:this.startedAt)>limit){this._fail('Could not reconnect. Your saved crew checkpoint is available from Play with friends.',true);return;}
      this._status('reconnecting','Connection interrupted. Your controls are stopped while we reconnect.');
      this.retryTimer=setTimeout(()=>this._open(),Math.min(5000,600*2**this.retry++));
    };
  }
  _fail(reason,clearSession) {
    this.closed=true;clearTimeout(this.retryTimer);clearTimeout(this.connectTimeout);clearInterval(this.timer);
    this.generation++;this.ws?.close();this.input={};this.pending.clear();
    if(clearSession){try{this.storage?.removeItem(SESSION_KEY);}catch{}this.session=null;}
    this._status('error',reason);
  }
  _send(message) {
    if(this.ws?.readyState!==1||this.ws.bufferedAmount>0)return false;
    this.ws.send(JSON.stringify(message));return true;
  }
  _sendInput(force=false) {
    if(!this.connected)return false;
    const input={...this.input,fire:!!this.input.fire||this.fireLatch};
    if(!this._send({type:'input',seq:this.seq+1,input,...(this.cancelActions?{cancelActions:true}:{})}))return false;
    this.seq++;this.fireLatch=false;this.cancelActions=false;this.lastInputAt=this.now();return true;
  }
  setInput(input={}) {
    const next=cleanInput(input);
    if(next.fire&&!this.input.fire)this.fireLatch=true;
    this.input=next;
  }
  neutral() {this.input=cleanInput({brake:true});this.fireLatch=false;this.cancelActions=true;this.frames=[];this._sendInput(true);}
  action(action) {
    if(!this.connected){this.onResult({ok:false,reason:'Wait until your crew reconnects before using that action.'});return false;}
    if(this.pending.size>=12){this.onResult({ok:false,reason:'The connection is busy. Give it a moment before trying again.'});return false;}
    const id=this.commandPrefix+'-'+(++this.actionCounter);
    this.pending.set(id,{action:clone(action),at:this.now(),lastSent:-Infinity});this._flushActions();return id;
  }
  _flushActions() {
    const now=this.now();
    for(const [id,p] of this.pending){
      if(now-p.at>5000){this.pending.delete(id);this.onResult({id,ok:false,reason:'That action could not be confirmed. Check the city before trying again.'},p.action);continue;}
      if(now-p.lastSent>=1200&&this._send({type:'action',id,action:p.action}))p.lastSent=now;
    }
  }
  _pump() {
    if(!this.connected)return;
    this._flushActions();this._sendInput();const now=this.now();
    if(now-(this.lastPingAt||0)>2000&&this._send({type:'ping',sentAt:now}))this.lastPingAt=now;
    if(this.receivedAt&&now-this.receivedAt>7000)this.ws.close();
  }
  _accept(message,first=false) {
    if(!message.state||!Number.isFinite(message.tick)||message.tick<this.lastTick)return;
    const now=this.now(),old=this.view(now),previousTick=this.lastTick;
    if(message.tick>previousTick){
      if(this.receivedAt)this.snapshotInterval=clamp(now-this.receivedAt,60,180);
      this.previous=this.state;
    }
    this.lastTick=message.tick;this.room=message.room;this.state=message.state;this.receivedAt=now;this.disconnectedAt=null;
    this.ack=Number(message.ack)||0;
    this.frames=this.frames.filter(f=>f.seq>this.ack&&now-f.at<220).slice(-14);
    this.predicted=clone(this.state);
    if(!sameSpace(old?.player,this.predicted.player)||first)this.frames=[];
    for(const f of this.frames)Sim.predictPlayer?.(this.predicted,f.input,f.dt);
    const p=this.predicted.player,o=old?.player;
    this.correction=!first&&sameSpace(o,p)&&Math.hypot(o.x-p.x,o.y-p.y)<150?{x:o.x-p.x,y:o.y-p.y}:{x:0,y:0};
    this.onState(this.view(now),message);
  }
  advance(input,dt) {
    this.setInput(input);
    if(!this.connected||!this.predicted||this.now()-this.receivedAt>800)return this.view();
    dt=clamp(dt,0,.05);
    if(this.predicted.phase==='playing'&&!this.predicted.dialogue){
      Sim.predictPlayer?.(this.predicted,this.input,dt);
      this.frames.push({seq:this.seq+1,input:{...this.input},dt,at:this.now()});
      if(this.frames.length>14)this.frames.shift();
    }
    const fade=Math.exp(-dt*16);this.correction.x*=fade;this.correction.y*=fade;
    return this.view();
  }
  view(now=this.now()) {
    if(!this.predicted)return this.state;
    const g=this.predicted,p={...g.player,x:g.player.x+this.correction.x,y:g.player.y+this.correction.y};
    const t=clamp((now-this.receivedAt)/this.snapshotInterval,0,1);
    const vehicles=interpolateList(this.previous?.vehicles,this.state.vehicles,t);
    const own=g.vehicles?.find(v=>v.id===p.vehicleId),index=vehicles.findIndex(v=>v.id===p.vehicleId);
    if(own&&index>=0){
      if(p.seat==='passenger'){p.x=vehicles[index].x;p.y=vehicles[index].y;p.angle=vehicles[index].angle;}
      else vehicles[index]={...own,x:own.x+this.correction.x,y:own.y+this.correction.y};
    }
    return {...g,player:p,vehicles,
      crew:interpolateList(this.previous?.crew,this.state.crew,t).map(member=>member.id===this.session?.playerId?{...member,...p}:member),
      npcs:interpolateList(this.previous?.npcs,this.state.npcs,t),police:interpolateList(this.previous?.police,this.state.police,t)};
  }
  leave(tellServer=true) {
    // Leave is reliable intent, unlike superseded motion snapshots. Queue the
    // tiny control frame before close even if earlier input is still draining.
    if(tellServer&&this.ws?.readyState===1)this.ws.send(JSON.stringify({type:'leave'}));
    this.closed=true;this.generation++;clearInterval(this.timer);clearTimeout(this.retryTimer);clearTimeout(this.connectTimeout);
    this.ws?.close();this.ws=null;this.input={};this.fireLatch=false;this.cancelActions=false;this.frames=[];this.pending.clear();
    this.session=null;this.state=null;this.predicted=null;this.previous=null;this.room=null;this.seq=0;this.ack=0;this.lastTick=-1;this.receivedAt=0;this.disconnectedAt=null;
    try{this.storage?.removeItem(SESSION_KEY);}catch{}
    this.status='idle';
  }
}
