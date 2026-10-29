import { Game } from './core.mjs';

const STEP = 1 / 30;
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
const copy = value => JSON.parse(JSON.stringify(value));
const angleDelta = (a,b) => Math.atan2(Math.sin(a-b),Math.cos(a-b));

export function websocketURL(base, origin) {
  if(!base)return null;
  const url = new URL(base === 'same-origin' ? origin : base);
  if(!['http:','https:'].includes(url.protocol))throw new Error('Invalid room service address.');
  url.protocol=url.protocol==='https:'?'wss:':'ws:';url.pathname='/ws';url.search='';url.hash='';return url.href;
}

/** Prediction only: no damage, pickups, AI, or world changes happen here. */
export function predictMovement(player, input, dt, level, doors) {
  if(player.alive===false||player.health<=0)return;
  const forward=clamp(Number(input.forward)||0,-1,1),strafe=clamp(Number(input.strafe)||0,-1,1);
  const speed=3.35*clamp(dt,0,.05)/Math.max(1,Math.hypot(forward,strafe));
  const angle=Number.isFinite(input.angle)?input.angle:player.angle;
  const dx=(Math.sin(angle)*forward+Math.cos(angle)*strafe)*speed;
  const dz=(-Math.cos(angle)*forward+Math.sin(angle)*strafe)*speed;
  const wall=(x,z)=>{
    const cx=Math.floor(x),cz=Math.floor(z);
    return cx<0||cz<0||cx>=level.width||cz>=level.height||level.grid[cz][cx]==='#'
      ||doors.some(d=>!d.open&&Math.floor(d.x)===cx&&Math.floor(d.z)===cz);
  };
  const clear=(x,z)=>[[-.22,-.22],[-.22,.22],[.22,-.22],[.22,.22],[0,0]].every(([sx,sz])=>!wall(x+sx,z+sz));
  const steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dz))/.12));
  for(let i=0;i<steps;i++){if(clear(player.x+dx/steps,player.z))player.x+=dx/steps;if(clear(player.x,player.z+dz/steps))player.z+=dz/steps;}
}

/** All personal visual/audio feedback belongs to the receiving player. */
export function personalEvents(events, selfId) {
  return (events||[]).filter(event=>!event.playerId||event.playerId===selfId);
}

export class CoopClient {
  constructor({base,origin=globalThis.location?.origin,callbacks={},Socket=globalThis.WebSocket,storage}={}) {
    this.url=websocketURL(base,origin);this.callbacks=callbacks;this.Socket=Socket;
    try{this.storage=storage===undefined?globalThis.sessionStorage:storage;}catch(_){this.storage=null;}
    this.socket=null;this.room=null;this.selfId=null;this.ownerId=null;this.roomId=null;this.token=null;
    this.view=null;this.seq=0;this.pending=[];this.lookAngle=null;this.predicted=null;this.remoteTargets={};
    this.held={forward:0,strafe:0,angle:0,fire:false};this.firePulse=false;this.manual=false;this.connected=false;
    this.waitingPause=false;this.reconnectStart=0;this.retryCount=0;this.timer=null;this.retryTimer=null;this.pingTimer=null;
    this.tick=-1;this.intent=null;this.error=null;this._lag=0;this.aimAssist=true;
    this.initialStart=0;this.everOpened=false;this.awaitingRoom=false;
    this.suspended=false;this.pageVisible=true;
  }
  _emit(name,...args){this.callbacks[name]?.(...args);}
  _readToken(roomId){try{return JSON.parse(this.storage?.getItem(`dfe.breach.room.${roomId}`)||'null');}catch(_){return null;}}
  _storeToken(){try{this.storage?.setItem(`dfe.breach.room.${this.roomId}`,JSON.stringify({token:this.token,selfId:this.selfId,name:this.intent?.name}));}catch(_){}}
  create({name,mission,difficulty}){this.intent={type:'create',protocol:1,name,mission,difficulty};this.manual=false;this.initialStart=Date.now();this._connect(false);}
  join({roomId,name}){
    roomId=String(roomId||'').trim().toUpperCase();const saved=this._readToken(roomId);
    this.roomId=roomId;this.token=saved?.token||null;
    this.intent={type:'join',protocol:1,roomId,name,...(this.token?{token:this.token}:{})};this.manual=false;this.initialStart=Date.now();this._connect(false);
  }
  _connect(retry) {
    if(this.manual||this.suspended||!this.pageVisible)return;
    this._emit('onConnection',retry?'reconnecting':'connecting',retry?'Reconnecting to your room…':'Connecting to the room service…');
    this.connected=false;this.waitingPause=true;this.awaitingRoom=true;this.pending=[];this.tick=-1;
    let socket;
    try{socket=new this.Socket(this.url);}catch(error){this._failedConnection(error.message);return;}
    this.socket=socket;
    const timeout=setTimeout(()=>{if(socket.readyState!==1)socket.close();},retry?12000:95000);
    const warming=setTimeout(()=>{if(this.socket===socket&&!this.connected&&!retry)this._emit('onConnection','connecting','Waking the room service. The first connection may take about a minute…');},4500);
    socket.addEventListener('open',()=>{
      clearTimeout(timeout);if(this.socket!==socket||this.manual||this.suspended)return;this.everOpened=true;
      const intent=retry?{type:'join',protocol:1,roomId:this.roomId,name:this.intent.name,token:this.token}:this.intent;
      socket.send(JSON.stringify(intent));
    });
    socket.addEventListener('message',event=>{
      if(this.socket!==socket||this.manual||this.suspended)return;
      let message;try{message=JSON.parse(event.data);}catch(_){return;}
      this._message(message);
    });
    socket.addEventListener('error',()=>{this.error='Unable to reach the room service. Please try again.';});
    socket.addEventListener('close',()=>{
      clearTimeout(timeout);clearTimeout(warming);if(this.socket!==socket)return;
      this.connected=false;this._stopStream();this.clearInput();
      if(this.manual||this.suspended)return;
      if(this.token&&this.roomId)this._scheduleReconnect();
      else if(!this.everOpened&&Date.now()-this.initialStart<90000){
        this._emit('onConnection','connecting','Waking the room service. The first connection may take about a minute…');
        if(this.pageVisible)this.retryTimer=setTimeout(()=>this._connect(false),3000);
      }else this._failedConnection(this.error||'The connection closed before the room was ready. Try again.');
    });
  }
  _message(message) {
    if(message.type==='welcome') {
      if(message.protocol!==1){this._closed('This room needs a newer game version. Reload and try again.');return;}
      this.roomId=message.roomId;this.selfId=message.selfId;this.ownerId=message.ownerId;this.token=message.token;
      this.connected=true;this.retryCount=0;this.reconnectStart=0;this.error=null;this._storeToken();this._startStream();
      this._emit('onConnection','connected','Connected');return;
    }
    if(message.type==='room') {
      const previous=this.room?.status;this.room=message.room;this.ownerId=this.room.ownerId;
      if(this.room.status!=='playing') {this.waitingPause=true;this.clearInput();}
      else if(previous!=='playing'||this.awaitingRoom){this.waitingPause=false;this.pending=[];}
      this.awaitingRoom=false;this._emit('onRoom',this.room);return;
    }
    if(message.type==='state') {this._applySnapshot(message);return;}
    if(message.type==='error') {
      this.error=message.message||'The room could not complete that action.';
      const terminal=['ROOM_NOT_FOUND','INVALID_TOKEN','ROOM_FULL','ROOM_CAPACITY','EXPIRED','VERSION_MISMATCH','PROTOCOL_MISMATCH'].includes(message.code);
      if(message.code==='ALREADY_CONNECTED'&&this.token){this.socket?.close();return;}
      this._emit('onError',this.error,message.code);
      if(terminal){try{this.storage?.removeItem(`dfe.breach.room.${this.roomId}`);}catch(_){}}
      if(terminal||!this.selfId){this.manual=true;this.connected=false;this._stopStream();this.socket?.close();this._emit('onConnection','error',this.error);}
      return;
    }
    if(message.type==='closed'){this._closed(message.message||'This room has ended. Create a new room to play again.');return;}
    if(message.type==='pong')this._lag=Math.max(0,Date.now()-Number(message.sentAt));
  }
  _applySnapshot(message) {
    if(!this.selfId||!this.room||!message.state?.players?.[this.selfId]||message.tick<this.tick)return;
    this.tick=message.tick;
    let created=false;
    if(!this.view||this.view.level.missionId!==this.room.mission) {
      this.view=new Game({mission:this.room.mission,difficulty:this.room.difficulty});created=true;this.lookAngle=null;this.pending=[];
    }
    const state=copy(message.state),local=state.players[this.selfId],previous=this.view.state;
    const wasAlive=previous.players?.[this.selfId]?.alive;
    const teleported=this.predicted&&Math.hypot(local.x-this.predicted.x,local.z-this.predicted.z)>2;
    if(this.lookAngle===null||teleported||wasAlive===false&&local.alive!==false)this.lookAngle=local.angle;
    const ack=Number(message.ackByPlayer?.[this.selfId]??-1);
    this.pending=this.pending.filter(entry=>entry.seq>ack).slice(-36);
    if(state.status!=='playing'||local.alive===false||teleported)this.pending=[];
    const predicted={...local};
    for(const entry of this.pending)predictMovement(predicted,entry.input,entry.dt,this.view.level,state.doors);
    this.predicted={x:predicted.x,z:predicted.z};local.x=predicted.x;local.z=predicted.z;local.angle=this.lookAngle;
    for(const[id,remote]of Object.entries(state.players))if(id!==this.selfId){
      this.remoteTargets[id]={x:remote.x,z:remote.z,angle:remote.angle};
      const old=previous.players?.[id];
      if(old&&remote.alive!==false&&Math.hypot(old.x-remote.x,old.z-remote.z)<3){remote.x=old.x;remote.z=old.z;remote.angle=old.angle;}
    }
    state.player=local;state.localPlayerId=this.selfId;state.tutorial=local.tutorial||{};
    this.view.state=state;
    if(created)this._emit('onView',this.view);
    this._emit('onState',state,personalEvents(message.events,this.selfId),message.events||[]);
  }
  _startStream(){
    this._stopStream();
    this.timer=setInterval(()=>{
      if(!this.connected||!this.view||this.room?.status!=='playing'||this.waitingPause)return;
      const local=this.view.state.player,alive=local.alive!==false&&local.health>0;
      this.seq++;
      this.send({type:'input',seq:this.seq,forward:alive?this.held.forward:0,strafe:alive?this.held.strafe:0,angle:this.lookAngle??local.angle,fire:alive&&(this.held.fire||this.firePulse),aimAssist:!!this.aimAssist});
      this.firePulse=false;
    },STEP*1000);
    this.pingTimer=setInterval(()=>this.send({type:'ping',sentAt:Date.now()}),5000);
  }
  _stopStream(){clearInterval(this.timer);clearInterval(this.pingTimer);this.timer=this.pingTimer=null;}
  drive(dt,input) {
    if(!this.view)return;
    const state=this.view.state,local=state.player;
    const active=this.connected&&!this.waitingPause&&this.room?.status==='playing'&&local.alive!==false&&local.health>0;
    if(active) {
      this.lookAngle=(this.lookAngle??local.angle)+(Number(input.turn)||0);local.angle=this.lookAngle;
      this.held={forward:clamp(input.forward||0,-1,1),strafe:clamp(input.strafe||0,-1,1),angle:this.lookAngle,fire:!!input.fire};
      if(input.fire)this.firePulse=true;
      const command={forward:this.held.forward,strafe:this.held.strafe,angle:this.lookAngle};
      predictMovement(local,command,dt,this.view.level,state.doors);this.predicted={x:local.x,z:local.z};
      this.pending.push({seq:this.seq+1,dt:clamp(dt,0,.05),input:command});if(this.pending.length>36)this.pending.shift();
    } else this.clearInput();
    for(const[id,target]of Object.entries(this.remoteTargets)) {
      const remote=state.players?.[id];if(!remote||remote.alive===false)continue;
      const t=1-Math.exp(-dt*14);remote.x+=(target.x-remote.x)*t;remote.z+=(target.z-remote.z)*t;remote.angle+=angleDelta(target.angle,remote.angle)*t;
    }
  }
  clearInput(){this.held.forward=this.held.strafe=0;this.held.fire=false;this.firePulse=false;}
  send(message){try{if(this.socket?.readyState===1){this.socket.send(JSON.stringify(message));return true;}}catch(_){}return false;}
  ready(value){return this.send({type:'ready',ready:!!value});}
  start(){return this.send({type:'start'});}
  interact(){return this.send({type:'interact'});}
  weapon(){return this.send({type:'weapon'});}
  pause(reason='menu'){this.clearInput();this.waitingPause=true;return this.send({type:'pause',reason});}
  resume(){return this.send({type:'resume'});}
  restart(checkpoint=true){this.pending=[];this.lookAngle=null;this.predicted=null;this.clearInput();return this.send({type:'restart',checkpoint:!!checkpoint});}
  // A cached page must release its socket without sending Leave or deleting its pass.
  suspend() {
    this.suspended=true;this.pageVisible=false;this.connected=false;this.waitingPause=true;
    this.clearInput();this.pending=[];this._stopStream();clearTimeout(this.retryTimer);this.retryTimer=null;
    const socket=this.socket;this.socket=null;
    try{socket?.close(1000,'Page suspended');}catch(_){}
    this._emit('onConnection','suspended','Room paused while this page is away.');
  }
  setPageVisible(visible) {
    this.pageVisible=!!visible;
    if(!this.pageVisible){clearTimeout(this.retryTimer);this.retryTimer=null;return;}
    if(this.suspended){this.resumeConnection();return;}
    if(this.manual||this.connected||this.socket&&this.socket.readyState<2)return;
    clearTimeout(this.retryTimer);this.retryTimer=null;
    if(this.token&&this.roomId)this._connect(true);
    else if(this.intent&&!this.everOpened)this._connect(false);
  }
  resumeConnection() {
    if(this.manual||!this.pageVisible)return;
    this.suspended=false;
    if(this.connected||this.socket&&this.socket.readyState<2)return;
    clearTimeout(this.retryTimer);this.retryTimer=null;
    if(this.token&&this.roomId)this._connect(true);
    else this._failedConnection('The connection was interrupted. Create or join a room to continue.');
  }
  _scheduleReconnect(){
    if(this.manual||this.suspended||!this.pageVisible)return;
    if(!this.reconnectStart)this.reconnectStart=Date.now();
    if(Date.now()-this.reconnectStart>55000){this._closed('The room connection expired. Create a new room to play again.');return;}
    this._emit('onConnection','reconnecting','Connection interrupted. Rejoining your room…');
    clearTimeout(this.retryTimer);this.retryTimer=setTimeout(()=>this._connect(true),Math.min(4000,800*2**this.retryCount++));
  }
  _failedConnection(message){this._stopStream();this._emit('onConnection','error',message);this._emit('onError',message);}
  _closed(message){this.manual=true;this.connected=false;this._stopStream();clearTimeout(this.retryTimer);this.socket?.close();try{this.storage?.removeItem(`dfe.breach.room.${this.roomId}`);}catch(_){}this._emit('onClosed',message);}
  leave(){
    this.send({type:'leave'});this.manual=true;this.connected=false;this._stopStream();clearTimeout(this.retryTimer);
    try{this.storage?.removeItem(`dfe.breach.room.${this.roomId}`);}catch(_){}
    this.socket?.close();
  }
}
