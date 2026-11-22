// Farwake transport patterns adapted for CHALK's small, private, in-memory squad rooms.
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {realpath,stat} from 'node:fs/promises';
import {dirname,extname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {WebSocketServer,WebSocket} from 'ws';
import {CoopRooms} from './rooms.mjs';
import {FixedStepClock} from './timing.mjs';
import {RateLimit,PROTOCOL,SIMULATION_HZ,SNAPSHOT_HZ,INPUT_HZ} from './protocol.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml',
  '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon',
  '.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'};
const finiteInteger=(value,fallback,min,max)=>Number.isInteger(Number(value))&&Number(value)>=min&&Number(value)<=max?Number(value):fallback;
const originOf=value=>{try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.origin:null;}catch{return null;}};

export function allowedOrigin(origin,requestHost,origins=[]){
  // Native test clients do not set Origin. Browsers always send it on WebSockets.
  if(origin===undefined)return true;
  const normalized=originOf(origin);if(!normalized)return false;
  const url=new URL(normalized);
  if(['localhost','127.0.0.1','[::1]'].includes(url.hostname))return true;
  if(requestHost&&url.host===requestHost)return true;
  return origins.includes(normalized);
}

/** Run one authority. Exposed for a local preview and real-socket integration tests. */
export async function createCoopServer({port=Number(process.env.PORT)||3000,host='0.0.0.0',
  allowedOrigins=process.env.CHALK_ALLOWED_ORIGINS||'',staticDir=resolve(here,'../public'),
  now=()=>Date.now(),roomOptions={},autoTick=true,heartbeatIntervalMs=15000,handshakeTimeoutMs=10000,
  maxConnections,maxPayload=8192,logger=console}={}){
  const configuredOrigins=Array.isArray(allowedOrigins)?allowedOrigins:String(allowedOrigins).split(/[\s,]+/);
  const origins=[...new Set([...configuredOrigins,process.env.RENDER_EXTERNAL_URL].map(originOf).filter(Boolean))];
  const rooms=new CoopRooms({now,maxRooms:finiteInteger(process.env.CHALK_MAX_ROOMS,16,1,64),...roomOptions});
  const connectionLimit=maxConnections??rooms.maxRooms*3+8;
  const sockets=new Set(),ipRates=new Map();let closing=false,tickTimer=null;
  const staticRoot=await realpath(resolve(staticDir));
  const originOK=req=>allowedOrigin(req.headers.origin,req.headers.host,origins);
  const sendHttp=(res,status,body,type='text/plain; charset=utf-8')=>{
    res.writeHead(status,{'content-type':type,'cache-control':'no-store','x-content-type-options':'nosniff'});res.end(body);
  };
  const server=createServer(async(req,res)=>{
    if(!originOK(req)){sendHttp(res,403,'This origin is not allowed.');return;}
    if(req.headers.origin){res.setHeader('access-control-allow-origin',req.headers.origin);res.setHeader('vary','Origin');}
    if(req.method==='OPTIONS'){res.writeHead(204,{'access-control-allow-methods':'GET, HEAD, OPTIONS'});res.end();return;}
    if(!['GET','HEAD'].includes(req.method)){sendHttp(res,405,'Use GET or HEAD.');return;}
    let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{sendHttp(res,400,'Invalid path.');return;}
    if(pathname==='/health'){
      const payload=JSON.stringify({ok:!closing,service:'chalk-coop',protocol:PROTOCOL,rooms:rooms.rooms.size,
        players:[...rooms.rooms.values()].reduce((count,room)=>count+room.players.filter(player=>player.peer).length,0),
        simulationHz:SIMULATION_HZ,snapshotHz:SNAPSHOT_HZ,inputHz:INPUT_HZ});
      sendHttp(res,closing?503:200,req.method==='HEAD'?'':payload,'application/json; charset=utf-8');return;
    }
    if(pathname==='/ws'){sendHttp(res,426,'Connect with WebSocket.');return;}
    if(pathname==='/'||pathname.endsWith('/'))pathname+='index.html';
    const candidate=resolve(staticRoot,`.${pathname}`);
    if(pathname.includes('\0')||pathname.split('/').some(part=>part.startsWith('.'))||!candidate.startsWith(staticRoot+sep)){
      sendHttp(res,403,'This path is not available.');return;
    }
    try{
      const file=await realpath(candidate);if(!file.startsWith(staticRoot+sep)){sendHttp(res,403,'This path is not available.');return;}
      const details=await stat(file);if(!details.isFile()){sendHttp(res,404,'Not found.');return;}
      res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream','content-length':details.size,
        'cache-control':'no-cache','x-content-type-options':'nosniff'});
      if(req.method==='HEAD'){res.end();return;}
      const stream=createReadStream(file);stream.on('error',()=>res.destroy());stream.pipe(res);
    }catch(error){if(!res.headersSent)sendHttp(res,error.code==='ENOENT'?404:500,error.code==='ENOENT'?'Not found.':'Unable to read this file.');else res.destroy();}
  });
  const wss=new WebSocketServer({noServer:true,maxPayload,perMessageDeflate:false});
  const rejectUpgrade=(socket,status,message)=>{socket.end(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);};
  server.on('upgrade',(req,socket,head)=>{
    let pathname;try{pathname=new URL(req.url,'http://localhost').pathname;}catch{rejectUpgrade(socket,400,'Bad Request');return;}
    if(closing){rejectUpgrade(socket,503,'Service Unavailable');return;}
    if(pathname!=='/ws'){rejectUpgrade(socket,404,'Not Found');return;}
    if(!originOK(req)){rejectUpgrade(socket,403,'Forbidden');return;}
    if(sockets.size>=connectionLimit){rejectUpgrade(socket,503,'Service Unavailable');return;}
    // The proxy address can group players on a host; use a generous bounded budget.
    const address=req.socket.remoteAddress||'unknown';let rate=ipRates.get(address);
    if(!rate){if(ipRates.size>=1024)ipRates.delete(ipRates.keys().next().value);rate=new RateLimit(2,60,now());ipRates.set(address,rate);}
    if(!rate.take(now())){rejectUpgrade(socket,429,'Too Many Requests');return;}
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
  });
  wss.on('connection',ws=>{
    sockets.add(ws);ws.isAlive=true;
    const messages=new RateLimit(80,120,now()),commands=new RateLimit(8,20,now());
    let timer;
    const peer={roomCode:null,playerId:null,
      get bufferedAmount(){return ws.bufferedAmount;},
      sendRaw(data){
        if(ws.readyState!==WebSocket.OPEN)return false;
        if(ws.bufferedAmount>256*1024){ws.close(1013,'Connection cannot keep up');return false;}
        try{ws.send(data);return true;}catch{return false;}
      },
      send(packet){return this.sendRaw(JSON.stringify(packet));},
      close(code,reason){if(ws.readyState===WebSocket.OPEN)ws.close(code,reason);}
    };
    timer=setTimeout(()=>{if(!peer.roomCode){peer.send({type:'error',code:'handshake',reason:'Create or join a squad to connect.'});ws.close(4001,'Handshake timeout');}},handshakeTimeoutMs);
    timer.unref?.();
    ws.on('pong',()=>{ws.isAlive=true;});
    ws.on('message',(data,isBinary)=>{
      if(isBinary){ws.close(1003,'Use JSON messages');return;}
      if(!messages.take(now())){ws.close(1008,'Message rate exceeded');return;}
      let packet;try{packet=JSON.parse(data.toString());}catch{ws.close(1007,'Invalid JSON');return;}
      if(!packet||typeof packet!=='object'||Array.isArray(packet)||typeof packet.type!=='string'){ws.close(1008,'Invalid packet');return;}
      if(packet.type!=='input'&&packet.type!=='ping'&&!commands.take(now())){ws.close(1008,'Command rate exceeded');return;}
      try{rooms.handle(peer,packet);if(peer.roomCode)clearTimeout(timer);}
      catch(error){logger?.error?.('CHALK room message failed:',error);peer.send({type:'error',code:'server',reason:'The squad could not process that action.'});ws.close(1011,'Room action failed');}
    });
    ws.on('close',()=>{clearTimeout(timer);sockets.delete(ws);rooms.disconnect(peer);});
    ws.on('error',()=>{});
  });
  const heartbeat=setInterval(()=>{
    for(const ws of sockets){if(!ws.isAlive){ws.terminate();continue;}ws.isAlive=false;if(ws.readyState===WebSocket.OPEN)ws.ping();}
    const time=now();for(const [address,rate] of ipRates)if(time-rate.at>5*60*1000)ipRates.delete(address);
  },heartbeatIntervalMs);heartbeat.unref?.();
  const clock=new FixedStepClock({hz:SIMULATION_HZ,now:now()});
  const tick=()=>{
    if(closing)return;
    try{clock.advance(now(),dt=>rooms.step(dt));}catch(error){logger?.error?.('CHALK simulation failed:',error);}
    tickTimer=setTimeout(tick,clock.nextDelay(now()));tickTimer.unref?.();
  };
  if(autoTick)tickTimer=setTimeout(tick,clock.nextDelay(now()));
  try{await new Promise((accept,reject)=>{server.once('error',reject);server.listen(port,host,()=>{server.off('error',reject);accept();});});}
  catch(error){closing=true;clearTimeout(tickTimer);clearInterval(heartbeat);wss.close();throw error;}
  return {server,wss,rooms,clock,address:server.address(),
    async close(){
      if(closing)return;closing=true;clearTimeout(tickTimer);clearInterval(heartbeat);rooms.shutdown();
      for(const ws of sockets)ws.terminate();
      await Promise.all([new Promise(resolve=>wss.close(()=>resolve())),new Promise(resolve=>server.close(()=>resolve()))]);
      server.closeAllConnections?.();
    }};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),argument=name=>{const index=args.indexOf(name);return index>=0?args[index+1]:undefined;};
  const port=finiteInteger(argument('--port')??process.env.PORT,3000,0,65535),host=argument('--host')||'0.0.0.0';
  const app=await createCoopServer({port,host});
  console.log(`CHALK co-op listening on ${host}:${app.address.port} (protocol ${PROTOCOL}, ${SIMULATION_HZ} Hz simulation / ${SNAPSHOT_HZ} Hz snapshots)`);
  const shutdown=async()=>{await app.close();process.exit(0);};
  process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
}
