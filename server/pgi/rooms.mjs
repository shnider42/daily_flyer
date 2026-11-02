// Room lifecycle and recovery adapted from Breach: authenticated replacement,
// expiring held inputs, bounded queues, explicit shared resume and one authority.
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {DuelGame,vector} from './game.mjs';
import {TEAMS} from '../../daily_flyer/themes/pocket_gridiron_assets/roster.js';
export const PROTOCOL=1;
const validTeam=id=>TEAMS.some(t=>t.abbr===id);
const sameToken=(a,b)=>typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const neutral=()=>({x:0,y:0});
export class DuelRooms{
 constructor({now=()=>Date.now(),maxRooms=8}={}){this.now=now;this.maxRooms=maxRooms;this.rooms=new Map();this.shuttingDown=false;}
 error(peer,message,detail){peer.send({type:'error',message:detail||message});}
 newPlayer(team){return {team,token:randomBytes(24).toString('base64url'),peer:null,ready:false,seq:-1,commandSeq:-1,input:neutral(),lastInput:0,disconnectedAt:null};}
 attach(room,p,peer){p.peer=peer;peer.roomId=room.id;peer.team=p.team;p.ready=false;p.input=neutral();p.seq=-1;p.commandSeq=-1;p.disconnectedAt=null;p.lastInput=this.now();peer.send({type:'welcome',protocol:PROTOCOL,roomId:room.id,team:p.team,token:p.token,eventId:room.eventId,teams:room.game?.teams||null});this.publish(room);if(room.game)this.snapshot(room,peer);}
 create(peer,m){
  if(this.rooms.size>=this.maxRooms)return this.error(peer,'All game rooms are busy. Try again in a moment.');
  if(!validTeam(m.home)||!validTeam(m.away)||m.home===m.away)return this.error(peer,'Choose two different teams.');
  const length=['quick','extended','showcase'].includes(m.length)?m.length:'quick';
  let id;do{id=randomBytes(4).toString('hex').toUpperCase();}while(this.rooms.has(id));
  const room={id,home:m.home,away:m.away,length,status:'lobby',reason:'Waiting for your friend.',players:[this.newPlayer(0)],game:null,tick:0,eventId:0,events:[],created:this.now(),changed:this.now(),lastActivity:this.now(),pauseCount:0};
  this.rooms.set(id,room);this.attach(room,room.players[0],peer);
 }
 join(peer,m){
  const room=this.rooms.get(typeof m.roomId==='string'?m.roomId.trim().toUpperCase():'');if(!room)return this.error(peer,'That room has ended or does not exist. Ask for a new invite.');
  if(m.token){
   const p=room.players.find(p=>sameToken(p.token,m.token));if(!p)return this.error(peer,'Your reconnect pass is invalid.');
   if(p.disconnectedAt!==null&&this.now()-p.disconnectedAt>60000){this.end(room,'The reconnect window expired. Create a new game.');return;}
   if(p.peer){if(m.replace!==true)return this.error(peer,'This player is already connected.');const old=p.peer;old.roomId=null;old.team=null;p.peer=null;old.send({type:'replaced',message:'This player reconnected in another tab.'});old.close(1000,'Replaced');}
   if(room.game&&room.status!=='final')this.pause(room,'Connection restored. Both players choose Resume.','network');
   this.attach(room,p,peer);return;
  }
  if(room.players.length===2||room.status!=='lobby')return this.error(peer,'This room already has its two players.');
  const p=this.newPlayer(1);room.players.push(p);this.attach(room,p,peer);
 }
 handle(peer,m){
  if(!m||typeof m!=='object'||Array.isArray(m)||typeof m.type!=='string')return;
  if(m.type==='ping'){peer.send({type:'pong',sentAt:Number.isFinite(m.sentAt)?m.sentAt:0});return;}
  if(this.shuttingDown)return this.error(peer,'The room service is restarting. Reload shortly.');
  if(['create','join'].includes(m.type)){if(m.protocol!==PROTOCOL)return this.error(peer,'Refresh both game tabs to use the same version.');if(peer.roomId)return this.error(peer,'Leave the current room first.');return m.type==='create'?this.create(peer,m):this.join(peer,m);}
  const r=this.rooms.get(peer.roomId),p=r?.players[peer.team];if(!r||p?.peer!==peer)return;
  r.lastActivity=this.now();
  if(m.type==='leave'){this.end(r,'Your opponent left the room. Create another game to play again.');return;}
  if(m.type==='ready'||m.type==='resume'){
   p.ready=true;this.publish(r);
   if(r.players.length===2&&r.players.every(p=>p.peer&&p.ready)){
    if(r.status==='lobby'||r.status==='final')this.start(r);
    else if(['pregame','halftime','paused'].includes(r.status))this.resume(r);
   }return;
  }
  if(m.type==='pause'){if(r.status==='playing')this.pause(r,m.reason==='network'?'Connection interrupted. Reconnect, then both choose Resume.':'Game paused. Both players choose Resume.',m.reason==='network'?'network':'manual');return;}
  if(m.type==='input'){
   if(!Number.isSafeInteger(m.seq)||m.seq<=p.seq)return;p.seq=m.seq;p.lastInput=this.now();
   p.input=r.status==='playing'&&m.epoch===r.game.epoch?vector(m):neutral();return;
  }
  if(m.type==='action'&&r.status==='playing'){
   if(!Number.isSafeInteger(m.seq)||m.seq<=p.commandSeq)return;p.commandSeq=m.seq;
   if(m.epoch!==r.game.epoch||typeof m.name!=='string'||!Array.isArray(m.args)||m.args.length>3)return;
   r.game.command(p.team,m.name,m.args);this.events(r);this.snapshot(r);
  }
 }
 start(r){r.game=new DuelGame(r.home,r.away,r.length,randomBytes(4).readUInt32LE());r.events=[];r.eventId=0;r.tick=0;r.status='pregame';r.reason='Pregame · both players ready to kick off';r.changed=this.now();r.game.paused=true;r.players.forEach(p=>{p.ready=false;p.input=neutral();});for(const p of r.players)p.peer?.send({type:'match',teams:r.game.teams});this.publish(r);this.snapshot(r);}
 resume(r){if(!r.game)return;if(r.status==='halftime'){r.game.paused=false;r.game.resumeHalftime();}r.status='playing';r.reason='';r.changed=this.now();r.game.paused=false;r.players.forEach(p=>{p.ready=false;p.input=neutral();p.lastInput=this.now();});this.publish(r);this.snapshot(r);}
 pause(r,reason,kind='manual'){if(!r.game||r.status==='final')return;if(r.status!=='paused'){r.pauseCount++;r.changed=this.now();}r.status='paused';r.pauseKind=kind;r.reason=reason;r.game.paused=true;r.players.forEach(p=>{p.ready=false;p.input=neutral();});if(r.pauseCount>12){this.end(r,'Too many connection interruptions to continue this match. Create a fresh room.');return;}this.publish(r);this.snapshot(r);}
 publish(r){const m={type:'room',room:{id:r.id,home:r.home,away:r.away,length:r.length,status:r.status,reason:r.reason,players:r.players.map(p=>({team:p.team,connected:!!p.peer,ready:p.ready})),remaining:Math.max(0,Math.ceil((45000-(this.now()-r.changed))/1000))}};for(const p of r.players)p.peer?.send(m);}
 events(r){for(const e of r.game.events.splice(0))r.events.push({...e,id:++r.eventId});r.events=r.events.slice(-80);}
 snapshot(r,only=null){if(!r.game)return;for(const p of r.players){if(!p.peer||only&&p.peer!==only)continue;p.peer.send({type:'state',tick:r.tick,ack:p.seq,status:r.status,state:r.game.snapshot(p.team),events:r.events.slice(-20)});}}
 step(dt){
  const now=this.now();for(const r of this.rooms.values()){
   if(now-r.created>7200000||r.players.some(p=>p.disconnectedAt!==null&&now-p.disconnectedAt>60000)||r.status==='lobby'&&now-r.lastActivity>600000){this.end(r,'This room expired. Create a fresh game.');continue;}
   if(['pregame','halftime'].includes(r.status)&&now-r.changed>45000&&r.players.every(p=>p.peer))this.resume(r);
   if(r.status==='paused'&&r.pauseKind==='manual'&&now-r.changed>45000&&r.players.every(p=>p.peer&&now-p.lastInput<1500))this.resume(r);
   if(r.status==='paused'&&now-r.changed>90000){this.end(r,'The pause timed out. Create a new game when both players are ready.');continue;}
   if(r.status!=='playing')continue;
   if(r.players.some(p=>!p.peer||now-p.lastInput>1500)){this.pause(r,'Connection stalled. Reconnect, then both choose Resume.','network');continue;}
   const before=r.game.phase;r.game.tickBoth(dt,r.players.map(p=>now-p.lastInput>300?neutral():p.input));r.tick++;
   if(r.game.phase!==before&&r.game.phase==='penalty')r.game.playClock=15;
   this.events(r);
   if(r.game.phase==='halftime'){r.status='halftime';r.reason='Halftime · both players ready for the second half';r.changed=now;r.game.paused=true;r.players.forEach(p=>p.ready=false);this.publish(r);this.snapshot(r);}
   else if(r.game.phase==='final'){r.status='final';r.reason='Final · both players can choose Rematch';r.changed=now;r.players.forEach(p=>p.ready=false);this.publish(r);this.snapshot(r);}
   else if(r.tick%2===0)this.snapshot(r);
  }
 }
 disconnect(peer){const r=this.rooms.get(peer.roomId),p=r?.players[peer.team];if(!r||p?.peer!==peer)return;p.peer=null;p.disconnectedAt=this.now();p.input=neutral();p.ready=false;if(r.game&&r.status!=='final')this.pause(r,'Opponent disconnected · place held for 60 seconds.','network');else this.publish(r);}
 end(r,message){for(const p of r.players){p.peer?.send({type:'closed',message});if(p.peer){p.peer.roomId=null;p.peer.close(1000,'Room ended');}}this.rooms.delete(r.id);}
 shutdown(){this.shuttingDown=true;for(const r of [...this.rooms.values()])this.end(r,'The room service restarted. Solo is unaffected; create a new room.');}
}
