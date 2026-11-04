import {randomBytes} from 'node:crypto';
import {WebSocketServer} from '../last-exit/vendor/ws/wrapper.mjs';
import {Voyage,PROTOCOL,cleanInput} from '../../daily_flyer/themes/saltbound_assets/core.mjs';
import { charterInfo, crewLoadout, validId } from '../../daily_flyer/themes/saltbound_assets/campaign.mjs';
import { CHAPTERS, STATIONS } from '../../daily_flyer/themes/saltbound_assets/catalog.mjs';
import { releaseStation, takeStation } from '../../daily_flyer/themes/saltbound_assets/deck.mjs';
const code=()=>randomBytes(5).toString('hex').toUpperCase();
export class SeaRooms{
 constructor({now=Date.now,maxRooms=12}={}){this.rooms=new Map();this.now=now;this.maxRooms=maxRooms;this.tick=0;}
 hello(peer, message) {
   if (message.protocol !== PROTOCOL) throw Error('Version changed. Reload both devices.');
   if (peer.session) throw Error('Already joined.');
   const pirate = validId(message.pirateId) ? message.pirateId : randomBytes(12).toString('hex');
   let room;
   if (message.create) {
     if (this.rooms.size >= this.maxRooms) throw Error('All seas are occupied. Try again shortly.');
     const charter = charterInfo(message.campaign || {id:randomBytes(12).toString('hex')});
     if (!charter) throw Error('Open a valid campaign from the captain’s log.');
     const active = [...this.rooms.values()].find(r=>r.game.campaign.id===charter.id && r.game.status==='sailing');
     if (active) throw Error('This campaign is already at sea. Join voyage '+active.code+'.');
     let roomCode;
     do { roomCode=code(); } while (this.rooms.has(roomCode));
     room={code:roomCode,sessions:new Map(),created:this.now(),game:new Voyage({
       profile:crewLoadout(message.loadout,charter,pirate),difficulty:charter.difficulty,campaign:charter
     })};
     this.rooms.set(roomCode,room);
   } else {
     room=this.rooms.get(String(message.code||'').toUpperCase());
     if (!room) throw Error('Crew code not found. Ask for the current voyage code.');
   }
   const game=room.game;
   let session=message.token ? room.sessions.get(message.token) : null;
   if (message.token && !session) throw Error('Your reconnect pass expired. Join with the current code.');
   if (!session) {
     if (game.status!=='sailing') throw Error('This voyage has ended. Open the campaign for another.');
     if (room.sessions.size>=4) throw Error('This crew already has four pirates.');
     if ([...room.sessions.values()].some(s=>s.pirate===pirate)) throw Error('This pirate already has a place aboard. Reconnect from the original tab.');
     const saved=charterInfo(message.campaign);
     if (saved?.id===game.campaign.id && saved.chapter>game.campaign.chapter) {
       if (game.time>0) throw Error('Your charter is further ahead. Host the next voyage from your campaign log.');
       game.campaign.chapter=saved.chapter;
       const chapter=CHAPTERS[saved.chapter];
       for (const chest of game.loot) chest.contract=null;
       const target=game.loot.find(l=>l.island===chapter?.target);
       if (target && chapter.prize) {target.contract=chapter.prize;target.type='relic';}
     }
     const id=randomBytes(8).toString('hex'),token=randomBytes(24).toString('hex');
     const player=game.addPlayer(id,message.name,crewLoadout(message.loadout,game.campaign,pirate));
     session={id,token,pirate,player,input:{},seq:0,lastInput:0,lastAction:0,peer:null,disconnected:null};
     room.sessions.set(token,session);
   }
   if (session.peer) {
     const old=session.peer;old.session=null;old.close(4001,'Reconnected elsewhere');
   }
   session.peer=peer; session.disconnected=null; session.input={}; session.player.connected=true;
   if (message.token && session.player.aboard) takeStation(game,session.player,session.player.preferredStation);
   peer.session=session;peer.room=room;
   this.updateCrew(room);
   return {type:'welcome',protocol:PROTOCOL,id:session.id,token:session.token,code:room.code,seq:session.seq,capacity:4,campaign:game.campaign};
 }
 updateCrew(room) {
   room.game.waiting=[...room.sessions.values()].filter(s=>s.peer).length<2;
 }
 input(peer,message) {
   const session=peer.session;
   if (!session || session.peer!==peer) return;
   if (message.type==='input') {
     if (!Number.isSafeInteger(message.seq)||message.seq<=session.seq||message.seq>session.seq+1000) return;
     session.seq=message.seq;session.input=cleanInput(message.input);session.lastInput=this.now();
   } else if (message.type==='action') {
     if (this.now()-session.lastAction<100 || typeof message.action!=='string') return;
     session.lastAction=this.now();
     const command=message.action;
     const station=command.startsWith('station:') && Object.hasOwn(STATIONS,command.slice(8));
     const allowed=['interact','left','right','repair','heal','sword','weapon','bucket','treat','scan'];
     if (!station && !allowed.includes(command)) return;
     const ok=peer.room.game.action(session.id,command);
     if (station) {
       session.input={};
       peer.send(JSON.stringify({type:'station',ok,role:session.player.station}));
     }
   } else if (message.type==='inactive') {session.input={};session.lastInput=0;}
 }
 disconnect(peer) {
   const session=peer.session;
   if (!session || session.peer!==peer) return;
   session.peer=null;session.disconnected=this.now();session.input={};session.player.connected=false;
   releaseStation(peer.room.game,session.player);
   this.updateCrew(peer.room);
 }
 leave(peer) {
   const session=peer.session,room=peer.room;
   if (!session || !room || session.peer!==peer) return;
   room.game.removePlayer(session.id);room.sessions.delete(session.token);peer.session=null;
   if (!room.sessions.size) this.rooms.delete(room.code);else this.updateCrew(room);
 }
 step(){for(const[id,r]of this.rooms){for(const[t,s]of r.sessions)if(!s.peer&&this.now()-s.disconnected>90000){r.game.removePlayer(s.id);r.sessions.delete(t);}if(!r.sessions.size||this.now()-r.created>7200000){for(const s of r.sessions.values())s.peer?.close(1000,'Voyage expired');this.rooms.delete(id);continue;}if([...r.sessions.values()].some(s=>s.peer)){const inp={};for(const s of r.sessions.values())inp[s.id]=this.now()-s.lastInput<300?s.input:{};r.game.step(1/30,inp);}}this.tick++;}
 packet(r){return{type:'state',tick:this.tick,ack:Object.fromEntries([...r.sessions.values()].map(s=>[s.id,s.seq])),state:r.game.snapshot()};}
}
export function attachSea(server,{service=new SeaRooms()}={}){
 const wss=new WebSocketServer({noServer:true,maxPayload:4096,perMessageDeflate:false}),buckets=new Map();
 server.on('upgrade',(req,socket,head)=>{const origin=req.headers.origin,validOrigin=!origin||origin===`https://${req.headers.host}`||origin===`http://${req.headers.host}`;if(req.url!=='/crew'||!validOrigin||wss.clients.size>=64){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}const ip=req.socket.remoteAddress,now=Date.now(),b=buckets.get(ip)||{n:0,t:now};if(now-b.t>60000){b.n=0;b.t=now;}b.n++;buckets.set(ip,b);if(b.n>50){socket.destroy();return;}wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));});
 wss.on('connection',ws=>{let count=0,at=Date.now(),joined=false;ws.alive=true;const timer=setTimeout(()=>{if(!joined)ws.close(4000,'Join timeout');},10000);timer.unref();ws.on('error',()=>{});ws.on('pong',()=>ws.alive=true);ws.on('close',()=>{clearTimeout(timer);service.disconnect(ws);});ws.on('message',(raw,binary)=>{try{if(binary)throw Error('Text messages required.');if(Date.now()-at>1000){at=Date.now();count=0;}if(++count>90){ws.close(4008,'Rate limit');return;}const m=JSON.parse(raw);if(!m||typeof m!=='object')throw Error('Invalid message.');if(!joined){if(m.type!=='hello')throw Error('Join a crew first.');ws.send(JSON.stringify(service.hello(ws,m)));joined=true;clearTimeout(timer);ws.send(JSON.stringify(service.packet(ws.room)));return;}if(m.type==='ping'){ws.send(JSON.stringify({type:'pong',at:m.at}));return;}if(m.type==='leave'){service.leave(ws);ws.close(1000,'Left crew');return;}service.input(ws,m);}catch(e){ws.send(JSON.stringify({type:'error',message:e.message}));if(!joined)ws.close(4000,'Join failed');}});});
 const timer=setInterval(()=>{service.step();if(service.tick%2===0)for(const r of service.rooms.values()){const data=JSON.stringify(service.packet(r),(_,v)=>typeof v==='number'?Math.round(v*1000)/1000:v);for(const s of r.sessions.values()){const ws=s.peer;if(ws?.readyState!==1)continue;if(ws.bufferedAmount>250000){ws.close(4002,'Slow connection');continue;}ws.send(data);}}},1000/30);timer.unref();const beat=setInterval(()=>{for(const ws of wss.clients){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}for(const[ip,b]of buckets)if(Date.now()-b.t>120000)buckets.delete(ip);},15000);beat.unref();return{service,wss,close(){clearInterval(timer);clearInterval(beat);for(const ws of wss.clients)ws.close(1012,'Server restarting');wss.close();}};
}
