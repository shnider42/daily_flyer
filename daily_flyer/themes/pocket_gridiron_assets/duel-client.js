import {Game} from './engine.js?v=20';
import {vector} from './duel-input.js?v=20';
export class DuelClient{
 constructor(callbacks={}){this.callbacks=callbacks;this.socket=null;this.room=null;this.view=null;this.teams=null;this.team=0;this.seq=0;this.commandSeq=0;this.pending=[];this.held={x:0,y:0};this.lastEvent=0;this.lastTick=-1;this.lastReply=0;this.lastState=0;this.rtt=null;this.jitter=0;this.manual=false;this.retry=0;this.waiting=false;this.targets=new Map();try{this.pass=JSON.parse(sessionStorage.getItem('pgi-duel-pass')||'null');}catch{}this.timer=setInterval(()=>this.pump(),50);this.watch=setInterval(()=>this.check(),500);window.addEventListener('online',()=>{if(this.pass)this.reconnect();});document.addEventListener('visibilitychange',()=>{if(document.hidden){this.clear();this.send({type:'pause',reason:'network'});}else if(this.pass)this.reconnect();});window.addEventListener('pagehide',()=>{this.clear();this.send({type:'pause',reason:'network'});});}
 emit(name,...args){this.callbacks[name]?.(...args);}
 save(){try{if(this.pass)sessionStorage.setItem('pgi-duel-pass',JSON.stringify(this.pass));else sessionStorage.removeItem('pgi-duel-pass');}catch{}}
 send(m){if(this.socket?.readyState!==1||this.socket.bufferedAmount>8192)return false;this.socket.send(JSON.stringify(m));return true;}
 connect(intent){this.manual=false;this.intent=intent;this.waiting=true;this.clear();const old=this.socket;this.socket=null;old?.close();const ws=new WebSocket(new URL('/ws',location.href).href.replace(/^http/,'ws'));this.socket=ws;this.lastReply=this.lastState=performance.now();this.emit('status','Connecting to the room service…');ws.onopen=()=>{if(this.socket===ws)this.send({...intent,protocol:1});};ws.onmessage=e=>{if(this.socket!==ws)return;let m;try{m=JSON.parse(e.data);}catch{return;}this.lastReply=performance.now();this.receive(m);};ws.onclose=()=>{if(this.socket!==ws||this.manual)return;this.waiting=true;this.clear();this.emit('status','Connection interrupted · reconnecting…');clearTimeout(this.retryTimer);if(!document.hidden&&this.pass)this.retryTimer=setTimeout(()=>this.reconnect(),Math.min(4000,800*2**this.retry++));};ws.onerror=()=>this.emit('status','Waiting for the room service. First connection may take a moment.');}
 create(options){this.pass=null;this.save();this.connect({type:'create',...options});}
 join(roomId){this.pass=null;this.save();this.connect({type:'join',roomId});}
 reconnect(){if(this.manual||!this.pass||document.hidden)return;this.connect({type:'join',...this.pass,replace:true});}
 leave(){this.send({type:'leave'});this.manual=true;this.pass=null;this.save();this.socket?.close();this.clear();this.room=null;this.view=null;}
 clear(){this.held={x:0,y:0};this.pending=[];}
 receive(m){
  if(m.type==='welcome'){this.team=m.team;this.lastEvent=m.eventId||0;this.pass={roomId:m.roomId,token:m.token};this.save();this.teams=m.teams||this.teams;this.seq=0;this.commandSeq=0;this.lastTick=-1;this.retry=0;this.emit('welcome',m);return;}
  if(m.type==='match'){this.teams=m.teams;this.view=null;this.lastEvent=0;this.lastTick=-1;this.pending=[];return;}
  if(m.type==='room'){this.room=m.room;this.waiting=m.room.status!=='playing';if(this.waiting)this.clear();this.emit('room',m.room);return;}
  if(m.type==='pong'){const rtt=performance.now()-m.sentAt;if(this.rtt!==null)this.jitter=this.jitter*.8+Math.abs(rtt-this.rtt)*.2;this.rtt=rtt;return;}
  if(m.type==='error'){this.emit('status',m.message);this.emit('error',m.message);return;}
  if(m.type==='closed'||m.type==='replaced'){this.manual=true;this.pass=null;this.save();this.clear();this.waiting=true;if(this.view)this.view.paused=true;this.emit('closed',m.message);return;}
  if(m.type!=='state'||!this.teams||m.tick<this.lastTick)return;
  this.lastTick=m.tick;this.lastState=performance.now();
  const fresh=!this.view,old=this.view;const g=Object.assign(Object.create(Game.prototype),m.state);g.teams=this.teams;g.humanTeam=this.team;g.rng=()=>.5;g.events=[];g.carrier=g.players[m.state.carrierIndex];
  if(g.pass?.targetIndex!==undefined)g.pass.target=g.players[g.pass.targetIndex];if(g.loose?.fumblerIndex!==undefined)g.loose.fumbler=g.players[g.loose.fumblerIndex];
  const key=controlKey(g),previousKey=old?controlKey(old):null;
  if(key!==previousKey){this.pending=[];this.targets.clear();}
  this.pending=this.pending.filter(p=>p.seq>m.ack&&p.key===key);this.trim();
  if(!g.paused&&m.status==='playing')for(const p of this.pending)predict(g,p.input,p.dt);
  this.targets.clear();
  if(old&&key===previousKey){for(const [side,people] of [['players',g.players],['defenders',g.defenders]])for(let i=0;i<people.length;i++){const p=people[i],last=old[side][i];if(p===g.controlled||!last||Math.hypot(p.x-last.x,p.y-last.y)>8)continue;this.targets.set(p,{x:p.x,y:p.y});p.x=last.x;p.y=last.y;}g.cameraY=old.cameraY+(g.cameraY-old.cameraY)*.35;}
  for(const name of ['choose','snap','throwTo','burst','breakTackle','selectDefender','switchDefender','kick','kickAction','fairCatch','resolvePenalty'])g[name]=(...args)=>this.command(name,args);
  for(const e of m.events||[])if(e.id>this.lastEvent){this.lastEvent=e.id;g.events.push(e);}
  this.view=g;this.waiting=m.status!=='playing';this.emit('state',g,fresh);
 }
 command(name,args=[]){if(this.waiting||!this.view||this.view.paused)return false;return this.send({type:'action',seq:++this.commandSeq,epoch:this.view.epoch,name,args});}
 ready(){this.send({type:'ready'});}
 pause(){this.clear();this.waiting=true;if(this.view)this.view.paused=true;this.send({type:'pause'});}
 resume(){this.send({type:'resume'});}
 pump(){if(this.socket?.readyState!==1)return;const now=performance.now();if(!document.hidden)this.send({type:'input',seq:++this.seq,epoch:this.view?.epoch,...(this.waiting?{x:0,y:0}:this.held)});if(!this.lastPing||now-this.lastPing>2000){this.lastPing=now;this.send({type:'ping',sentAt:now});}}
 check(){if(this.manual||!this.pass||document.hidden)return;const now=performance.now();if(now-this.lastReply>4500||this.room?.status==='playing'&&now-this.lastState>4500){this.reconnect();return;}if(this.room?.status==='playing'&&!this.waiting&&now-this.lastState>1200){this.waiting=true;this.clear();if(this.view)this.view.paused=true;this.send({type:'pause',reason:'network'});this.emit('status','Connection stalled · holding the game');}}
 trim(){let time=this.pending.reduce((n,p)=>n+p.dt,0);while(time>1.5||this.pending.length>500)time-=this.pending.shift().dt;}
 drive(dt,input){const g=this.view;if(!g)return;dt=Math.min(.05,Math.max(0,dt));this.held=vector(input);if(!this.waiting&&!g.paused&&!document.hidden){predict(g,this.held,dt);this.pending.push({seq:this.seq+1,key:controlKey(g),input:this.held,dt});this.trim();}else this.held={x:0,y:0};for(const[p,t]of this.targets){const a=1-Math.exp(-dt*18);p.x+=(t.x-p.x)*a;p.y+=(t.y-p.y)*a;}}
}
export const controlKey=g=>`${g.epoch}:${g.offense}:${g.phase}:${g.controlled?.id}:${g.controlled?.slot}`;
export function predict(g,input,dt){
 const p=g.controlled;if(g.special?.goal)return;if(!p||p.stun>0||g.contact)return;
 let speed=p.speed;
 if(g.userOffense){if(g.pass)return;if(!(g.isLive||g.isLoose||['kick_flight','kick_loose'].includes(g.phase)))return;speed*=g.burstLeft>0?1.55:1;}
 else {if(!(['call','ready','kick_flight','kick_loose'].includes(g.phase)||g.isLive||g.isLoose))return;if(g.diveLeft>0){input={x:p.dx||0,y:p.dy||0};speed*=2;}else speed*=g.phase==='ready'?.75:g.diveCooldown>1.1?.48:1.12;}
 g.move(p,input.x,input.y,speed,dt);
}
