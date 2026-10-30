import { Game } from './core.mjs';
import { createConnectionStatus } from './coop-status.mjs';

const STEP = 1 / 30;
const PROTOCOL = 2;
const STALE_STATE_MS = 1200;
const RECONNECT_MS = 4500;
const MAX_BUFFERED_BYTES = 8192;
const PREDICTION_SECONDS = 1.5;
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
  constructor({base,origin=globalThis.location?.origin,callbacks={},Socket=globalThis.WebSocket,storage,now=Date.now,statusUI=true}={}) {
    this.url=websocketURL(base,origin);this.callbacks=callbacks;this.Socket=Socket;this.now=now;
    try{this.storage=storage===undefined?globalThis.sessionStorage:storage;}catch(_){this.storage=null;}
    this.socket=null;this.room=null;this.selfId=null;this.ownerId=null;this.roomId=null;this.token=null;
    this.view=null;this.seq=0;this.pending=[];this.lookAngle=null;this.predicted=null;this.remoteTargets={};
    this.held={forward:0,strafe:0,angle:0,fire:false};this.firePulse=false;this.manual=false;this.connected=false;
    this.waitingPause=false;this.reconnectStart=0;this.retryCount=0;this.timer=null;this.retryTimer=null;this.pingTimer=null;
    this.tick=-1;this.intent=null;this.error=null;this._lag=0;this.aimAssist=true;
    this.initialStart=0;this.everOpened=false;this.awaitingRoom=false;
    this.suspended=false;this.pageVisible=true;
    this.lastReceivedAt=null;this.lastStateAt=null;this.lastAuthoritative=null;
    this.rtt=null;this.jitter=0;this.lastRtt=null;this.pingSentAt=null;this.networkHold=false;
    this.watchTimer=null;this.connectTimer=null;this.warmTimer=null;this.connectionStatus='idle';
    this.statusPanel=statusUI?createConnectionStatus(()=>this.reconnect()):null;
    this.onlineHandler=()=>{if(this.token&&this.roomId&&(!this.connected||this.lastReceivedAt!==null&&this.now()-this.lastReceivedAt>STALE_STATE_MS))this.reconnect();};
    globalThis.addEventListener?.('online',this.onlineHandler);
  }
  _emit(name,...args){
    if(name==='onConnection')this.connectionStatus=args[0];
    this.callbacks[name]?.(...args);
    if(name==='onConnection'||name==='onRoom')this._reportNetwork();
  }
  getNetworkStatus(){
    const age=this.lastReceivedAt===null?null:Math.max(0,this.now()-this.lastReceivedAt);
    const stateAge=this.lastStateAt===null?null:Math.max(0,this.now()-this.lastStateAt);
    const stalled=this.connected&&(this.networkHold||age>STALE_STATE_MS||this.room?.status==='playing'&&!this.waitingPause&&stateAge>STALE_STATE_MS);
    const quality=this.suspended?'away':!this.connected?this.connectionStatus:stalled?'stalled':this.rtt!==null&&(this.rtt>250||this.jitter>80)?'unstable':'connected';
    return {quality,rtt:this.rtt===null?null:Math.round(this.rtt),jitter:Math.round(this.jitter),lastReplyMs:age,stateAgeMs:stateAge,canReconnect:!!this.token&&!!this.roomId&&!this.manual,version:'0.5.0'};
  }
  _reportNetwork(){const status=this.getNetworkStatus();this.statusPanel?.update(status);this.callbacks.onNetwork?.(status);}
  _resetPrediction(){this.pending=[];this.predicted=null;this.lastAuthoritative=null;}
  _clearConnectTimers(){clearTimeout(this.connectTimer);clearTimeout(this.warmTimer);this.connectTimer=this.warmTimer=null;}
  _releaseSocket(reason){
    this._clearConnectTimers();this._stopStream();const socket=this.socket;this.socket=null;
    try{socket?.close(1000,reason);}catch(_){}
  }
  _disposeStatus(){this.statusPanel?.dispose();this.statusPanel=null;globalThis.removeEventListener?.('online',this.onlineHandler);}

  _readToken(roomId){try{return JSON.parse(this.storage?.getItem(`dfe.breach.room.${roomId}`)||'null');}catch(_){return null;}}
  _storeToken(){try{this.storage?.setItem(`dfe.breach.room.${this.roomId}`,JSON.stringify({token:this.token,selfId:this.selfId,name:this.intent?.name}));}catch(_){}}
  create({name,mission,difficulty}){this.intent={type:'create',protocol:PROTOCOL,name,mission,difficulty};this.manual=false;this.initialStart=this.now();this._connect(false);}
  join({roomId,name}){
    roomId=String(roomId||'').trim().toUpperCase();const saved=this._readToken(roomId);
    this.roomId=roomId;this.token=saved?.token||null;
    this.intent={type:'join',protocol:PROTOCOL,roomId,name,...(this.token?{token:this.token}:{})};this.manual=false;this.initialStart=this.now();this._connect(false);
  }
  _connect(retry) {
    if(this.manual||this.suspended||!this.pageVisible)return;
    clearTimeout(this.retryTimer);this.retryTimer=null;this._releaseSocket('Replacing transport');
    this.connected=false;this.waitingPause=true;this.awaitingRoom=true;this._resetPrediction();this.tick=-1;
    this.networkHold=false;this.lastReceivedAt=this.lastStateAt=null;
    this._emit('onConnection',retry?'reconnecting':'connecting',retry?'Reconnecting to the same room…':'Connecting to the room service…');
    let socket;
    try{socket=new this.Socket(this.url);}catch(error){this._failedConnection(error.message);return;}
    this.socket=socket;
    // The handshake is not complete just because TCP opened. A welcome is required.
    this.connectTimer=setTimeout(()=>{if(this.socket===socket&&!this.connected)this._connectionLost('The room handshake timed out.');},retry?12000:95000);
    this.warmTimer=setTimeout(()=>{if(this.socket===socket&&!this.connected&&!retry)this._emit('onConnection','connecting','Waking the room service. The first connection may take about a minute…');},4500);
    socket.addEventListener('open',()=>{
      if(this.socket!==socket||this.manual||this.suspended)return;this.everOpened=true;
      const intent=retry?{type:'join',protocol:PROTOCOL,roomId:this.roomId,name:this.intent.name,token:this.token,replace:true}:this.intent;
      try{socket.send(JSON.stringify(intent));}catch(_){this._connectionLost('Could not send the room handshake.');}
    });
    socket.addEventListener('message',event=>{
      if(this.socket!==socket||this.manual||this.suspended)return;
      let message;try{message=JSON.parse(event.data);}catch(_){return;}
      if(!message||typeof message!=='object'||!['welcome','room','state','error','closed','pong'].includes(message.type))return;
      this.lastReceivedAt=this.now();this._message(message);
    });
    socket.addEventListener('error',()=>{if(this.socket===socket)this.error='Unable to reach the room service. Please try again.';});
    socket.addEventListener('close',()=>{if(this.socket===socket)this._connectionLost(this.error||'Connection interrupted.');});
  }
  _connectionLost(message){
    this.connected=false;this.waitingPause=true;this.clearInput();this._resetPrediction();this._releaseSocket('Connection interrupted');
    if(this.manual||this.suspended)return;
    if(this.token&&this.roomId)this._scheduleReconnect();
    else if(!this.everOpened&&this.now()-this.initialStart<90000){
      this._emit('onConnection','connecting','Waking the room service. The first connection may take about a minute…');
      if(this.pageVisible)this.retryTimer=setTimeout(()=>this._connect(false),3000);
    }else this._failedConnection(message);
  }
  reconnect(){
    if(this.manual||!this.token||!this.roomId)return false;
    // Never send Leave: that destroys the shared run. An authenticated replacement
    // invalidates the old transport before queued commands can reach this slot.
    this.send({type:'pause',reason:'network'});this.clearInput();this.waitingPause=true;
    this.connected=false;this._resetPrediction();this._releaseSocket('Reconnect requested');
    this._emit('onConnection','reconnecting','Rejoining the same room. Mission progress is held.');
    if(!this.reconnectStart)this.reconnectStart=this.now();
    if(this.pageVisible&&!this.suspended)this._connect(true);
    return true;
  }
  _watchConnection(){
    if(!this.connected||!this.pageVisible||this.suspended||this.manual)return;
    const now=this.now(),replyAge=now-(this.lastReceivedAt??now);
    const stateAge=now-(this.lastStateAt??this.lastReceivedAt??now);
    if(replyAge>=RECONNECT_MS||this.room?.status==='playing'&&stateAge>=RECONNECT_MS){this.reconnect();return;}
    if(!this.networkHold&&(replyAge>=STALE_STATE_MS||this.room?.status==='playing'&&!this.waitingPause&&stateAge>=STALE_STATE_MS)){
      this.networkHold=true;this.waitingPause=true;this.clearInput();this.pending=[];
      this.send({type:'pause',reason:'network'});
      this._emit('onConnection','reconnecting','Server updates stalled. Holding the team while the connection recovers.');
    }
    this._reportNetwork();
  }
  _message(message) {
    if(message.type==='welcome') {
      if(message.protocol!==PROTOCOL){this._closed('This room needs a newer game version. Reload and try again.');return;}
      this.roomId=message.roomId;this.selfId=message.selfId;this.ownerId=message.ownerId;this.token=message.token;
      this.connected=true;this.retryCount=0;this.reconnectStart=0;this.error=null;this.networkHold=false;this.lastReceivedAt=this.now();this._clearConnectTimers();this._storeToken();this._startStream();
      this._emit('onConnection','connected','Connected');return;
    }
    if(message.type==='room') {
      const previous=this.room?.status;this.room=message.room;this.ownerId=this.room.ownerId;
      if(this.room.status!=='playing') {this.waitingPause=true;this.clearInput();}
      else if(previous!=='playing'||this.awaitingRoom){this.waitingPause=false;this.pending=[];this.lastStateAt=this.now();}
      this.awaitingRoom=false;if(this.networkHold&&this.room.status!=='playing'){this.networkHold=false;this._emit('onConnection','connected','Connection restored. Both players must resume.');}this._emit('onRoom',this.room);return;
    }
    if(message.type==='state') {this._applySnapshot(message);return;}
    if(message.type==='error') {
      this.error=message.message||'The room could not complete that action.';
      const terminal=['ROOM_NOT_FOUND','INVALID_TOKEN','ROOM_FULL','ROOM_CAPACITY','EXPIRED','VERSION_MISMATCH','PROTOCOL_MISMATCH'].includes(message.code);
      if(message.code==='ALREADY_CONNECTED'&&this.token){this._connectionLost('The old connection is still closing. Retrying…');return;}
      this._emit('onError',this.error,message.code);
      if(terminal){try{this.storage?.removeItem(`dfe.breach.room.${this.roomId}`);}catch(_){}}
      if(terminal||!this.selfId){this.manual=true;this.connected=false;this._releaseSocket('Room request rejected');this._disposeStatus();this._emit('onConnection','error',this.error);}
      return;
    }
    if(message.type==='closed'){this._closed(message.message||'This room has ended. Create a new room to play again.');return;}
    if(message.type==='pong'&&Number.isFinite(message.sentAt)&&message.sentAt===this.pingSentAt){
      const sample=Math.max(0,this.now()-message.sentAt);this._lag=sample;
      if(this.lastRtt!==null)this.jitter=this.jitter*.75+Math.abs(sample-this.lastRtt)*.25;
      this.rtt=this.rtt===null?sample:this.rtt*.75+sample*.25;this.lastRtt=sample;this.pingSentAt=null;
      if(this.networkHold&&this.room?.status!=='playing'){this.networkHold=false;this._emit('onConnection','connected','Connection restored. Both players must resume.');}
      this._reportNetwork();
    }
  }
  _applySnapshot(message) {
    if(!this.selfId||!this.room||!message.state?.players?.[this.selfId]||message.tick<this.tick)return;
    this.tick=message.tick;this.lastStateAt=this.now();
    let created=false;
    if(!this.view||this.view.level.missionId!==this.room.mission) {
      this.view=new Game({mission:this.room.mission,difficulty:this.room.difficulty});created=true;this.lookAngle=null;this.pending=[];
    }
    const state=copy(message.state),local=state.players[this.selfId],previous=this.view.state;
    const wasAlive=previous.players?.[this.selfId]?.alive;
    const previousAuthority=this.lastAuthoritative;
    const elapsed=previousAuthority?Math.max(0,state.time-previousAuthority.time):0;
    const teleported=!!previousAuthority&&(state.time<previousAuthority.time||Math.hypot(local.x-previousAuthority.x,local.z-previousAuthority.z)>3.35*elapsed+1);
    this.lastAuthoritative={x:local.x,z:local.z,time:state.time};
    if(this.lookAngle===null||teleported||wasAlive===false&&local.alive!==false)this.lookAngle=local.angle;
    const ack=Number(message.ackByPlayer?.[this.selfId]??-1);
    this.pending=this.pending.filter(entry=>entry.seq>ack);this._trimPrediction();
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
    this.timer=setInterval(()=>this._flushInput(),STEP*1000);
    this.pingTimer=setInterval(()=>this._ping(),1000);
    this.watchTimer=setInterval(()=>this._watchConnection(),250);
    this._ping();
  }
  _ping(){
    if(!this.connected||!this.pageVisible||this.suspended)return;
    // One outstanding sample prevents a delayed pong from being mistaken for a
    // reply to a newer ping, and permits meaningful high-latency measurements.
    if(this.pingSentAt!==null&&this.now()-this.pingSentAt<3000)return;
    this.pingSentAt=this.now();this.send({type:'ping',sentAt:this.pingSentAt});
  }
  _flushInput(){
    if(!this.connected||!this.view||this.room?.status!=='playing'||this.waitingPause||!this.pageVisible||this.suspended)return;
    const local=this.view.state.player,alive=local.alive!==false&&local.health>0;
    const next=this.seq+1;
    if(this.send({type:'input',seq:next,forward:alive?this.held.forward:0,strafe:alive?this.held.strafe:0,angle:this.lookAngle??local.angle,fire:alive&&(this.held.fire||this.firePulse),aimAssist:!!this.aimAssist})){
      this.seq=next;this.firePulse=false;
    }
  }
  _stopStream(){clearInterval(this.timer);clearInterval(this.pingTimer);clearInterval(this.watchTimer);this.timer=this.pingTimer=this.watchTimer=null;this.pingSentAt=null;}
  _trimPrediction(){
    let seconds=this.pending.reduce((sum,entry)=>sum+entry.dt,0);
    // Bound by elapsed simulated time, not render frames: 240 Hz must retain the
    // same latency window as 30 Hz. The count cap is only a pathological guard.
    while(this.pending.length&&(seconds>PREDICTION_SECONDS+1e-8||this.pending.length>1024))seconds-=this.pending.shift().dt;
  }
  drive(dt,input) {
    if(!this.view)return;
    dt=clamp(Number.isFinite(dt)?dt:0,0,.05);
    const state=this.view.state,local=state.player;
    const active=this.connected&&!this.waitingPause&&this.room?.status==='playing'&&local.alive!==false&&local.health>0;
    if(active) {
      this.lookAngle=(this.lookAngle??local.angle)+(Number(input.turn)||0);local.angle=this.lookAngle;
      this.held={forward:clamp(input.forward||0,-1,1),strafe:clamp(input.strafe||0,-1,1),angle:this.lookAngle,fire:!!input.fire};
      if(input.fire)this.firePulse=true;
      const command={forward:this.held.forward,strafe:this.held.strafe,angle:this.lookAngle};
      predictMovement(local,command,dt,this.view.level,state.doors);this.predicted={x:local.x,z:local.z};
      this.pending.push({seq:this.seq+1,dt:clamp(dt,0,.05),input:command});this._trimPrediction();
    } else this.clearInput();
    for(const[id,target]of Object.entries(this.remoteTargets)) {
      const remote=state.players?.[id];if(!remote||remote.alive===false)continue;
      const t=1-Math.exp(-dt*14);remote.x+=(target.x-remote.x)*t;remote.z+=(target.z-remote.z)*t;remote.angle+=angleDelta(target.angle,remote.angle)*t;
    }
  }
  clearInput(){this.held.forward=this.held.strafe=0;this.held.fire=false;this.firePulse=false;}
  send(message){
    try{if(this.socket?.readyState===1){
      if(message.type==='input'&&this.socket.bufferedAmount>MAX_BUFFERED_BYTES)return false;
      this.socket.send(JSON.stringify(message));return true;
    }}catch(_){}
    return false;
  }
  ready(value){return this.send({type:'ready',ready:!!value});}
  start(){return this.send({type:'start'});}
  interact(){return this.send({type:'interact'});}
  weapon(){return this.send({type:'weapon'});}
  pause(reason='menu'){this.clearInput();this.waitingPause=true;return this.send({type:'pause',reason});}
  resume(){return this.send({type:'resume'});}
  restart(checkpoint=true){this._resetPrediction();this.lookAngle=null;this.clearInput();return this.send({type:'restart',checkpoint:!!checkpoint});}
  // A cached page must release its socket without sending Leave or deleting its pass.
  suspend() {
    this.suspended=true;this.pageVisible=false;this.connected=false;this.waitingPause=true;
    this.clearInput();this.pending=[];this._stopStream();clearTimeout(this.retryTimer);this.retryTimer=null;
    this._resetPrediction();this._releaseSocket('Page suspended');
    this._emit('onConnection','suspended','Room paused while this page is away.');
  }
  setPageVisible(visible) {
    this.pageVisible=!!visible;
    if(!this.pageVisible){clearTimeout(this.retryTimer);this.retryTimer=null;return;}
    if(this.suspended){this.resumeConnection();return;}
    if(this.connected){this._watchConnection();return;}
    if(this.manual||this.socket&&this.socket.readyState<2)return;
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
    if(!this.reconnectStart)this.reconnectStart=this.now();
    if(this.now()-this.reconnectStart>55000){this._closed('The room connection expired. Create a new room to play again.');return;}
    this._emit('onConnection','reconnecting','Connection interrupted. Rejoining your room…');
    clearTimeout(this.retryTimer);this.retryTimer=setTimeout(()=>this._connect(true),Math.min(4000,800*2**this.retryCount++));
  }
  _failedConnection(message){this.manual=true;this.connected=false;clearTimeout(this.retryTimer);this.retryTimer=null;this._releaseSocket('Connection failed');this._disposeStatus();this._emit('onConnection','error',message);this._emit('onError',message);}
  _closed(message){this.manual=true;this.connected=false;this._releaseSocket('Room ended');this._disposeStatus();clearTimeout(this.retryTimer);this.retryTimer=null;try{this.storage?.removeItem(`dfe.breach.room.${this.roomId}`);}catch(_){}this._emit('onClosed',message);}
  leave(){
    this.send({type:'leave'});this.manual=true;this.connected=false;this._releaseSocket('Leaving room');this._disposeStatus();clearTimeout(this.retryTimer);this.retryTimer=null;
    try{this.storage?.removeItem(`dfe.breach.room.${this.roomId}`);}catch(_){}
  }
}
