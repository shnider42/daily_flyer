import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, readdirSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {RecoveryCodec, SnapshotStore, TabletopRooms, localRecoverySecret} from '../../server/tabletop/rooms.mjs';

const SECRET = 'a-test-recovery-key-at-least-twenty-four-characters';
const engine = {
  createGame({players,target,seed}) {
    return {version:1,status:'playing',players:structuredClone(players),activePlayerId:players[0].id,
      target,seed,turn:0,privateHands:Object.fromEntries(players.map(p=>[p.id,[`SECRET-${p.id}`]]))};
  },
  applyAction(state,id,key) {
    if (id!==state.activePlayerId || key!=='advance') throw new Error('That move is not legal.');
    const next=structuredClone(state); next.version++; next.turn++;
    next.activePlayerId=next.players[next.turn%next.players.length].id;
    if (next.turn>=12) next.status='finished';
    return next;
  },
  publicView(state,id) {
    return {version:state.version,status:state.status,activePlayerId:state.activePlayerId,
      players:state.players.map(p=>({id:p.id,name:p.name,bot:p.bot})),
      you:{id,hand:state.privateHands[id]},turn:state.turn};
  },
  chooseBotAction() {return 'advance';},
};
const newManager = options => new TabletopRooms({engine,secret:SECRET,...options});
const act = (manager,room,requestId='request_0001',extra={}) => manager.action(room.room.code,room.token,
  {key:'advance',version:room.room.version,requestId,...extra});
function setup() {
  const manager=newManager();
  const host=manager.create({name:'Chris',mode:'online',bots:0});
  const guest=manager.join(host.room.code,{name:'Friend'});
  const started=manager.start(host.room.code,host.token,{bots:0});
  return {manager,host:{...started,token:host.token},guest};
}

test('online room seats authenticate separately and hide opponents hands and tokens',()=>{
  const {manager,host,guest}=setup();
  const hostView=manager.get(host.room.code,host.token);
  const guestView=manager.get(host.room.code,guest.token);
  assert.deepEqual(hostView.game.you.hand,['SECRET-p1']);
  assert.deepEqual(guestView.game.you.hand,['SECRET-p2']);
  assert.ok(!JSON.stringify(hostView).includes('SECRET-p2'));
  assert.ok(!JSON.stringify(hostView).includes(guest.token));
  assert.ok(!JSON.stringify(hostView).includes('tokenHash'));
  assert.throws(()=>manager.get(host.room.code,'x'.repeat(43)),e=>e.status===403);
  assert.throws(()=>manager.get(host.room.code,null),e=>e.status===401);
});

test('join/start enforce capacity and host ownership',()=>{
  const manager=newManager();
  const host=manager.create({name:'Host',mode:'online'});
  const guest=manager.join(host.room.code,{name:'Guest'});
  assert.throws(()=>manager.start(host.room.code,guest.token,{bots:0}),e=>e.status===403);
  assert.throws(()=>manager.start(host.room.code,host.token,{bots:5}),/two and six/);
  for(let n=0;n<4;n++)manager.join(host.room.code,{name:`Friend ${n}`});
  assert.throws(()=>manager.join(host.room.code,{name:'Seventh'}),e=>e.code==='ROOM_FULL');
  const started=manager.start(host.room.code,host.token,{bots:0});
  assert.equal(started.game.players.length,6);
  assert.throws(()=>manager.join(host.room.code,{name:'Late'}),e=>e.code==='GAME_STARTED');
});

test('turn ownership, stale revisions and duplicate requests are independent safeguards',()=>{
  const {manager,host,guest}=setup();
  assert.throws(()=>manager.action(host.room.code,guest.token,{key:'advance',version:host.room.version,requestId:'wrong_turn_01'}),e=>e.code==='NOT_YOUR_TURN');
  const first=act(manager,host);
  assert.equal(first.game.turn,1);
  const duplicate=act(manager,host);
  assert.equal(duplicate.duplicate,true);
  assert.equal(duplicate.game.turn,1);
  assert.throws(()=>act(manager,host,'request_0002'),e=>e.code==='STALE_VERSION');
  assert.throws(()=>act(manager,host,'request_0001',{key:'different'}),e=>e.code==='REQUEST_REUSED');
  const after=manager.get(host.room.code,host.token);
  assert.equal(after.game.turn,1);
  assert.equal(after.room.version,first.room.version);
});

test('two competing requests at the same revision produce exactly one move',async()=>{
  const {manager,host}=setup();
  const results=await Promise.allSettled([
    Promise.resolve().then(()=>act(manager,host,'simultaneous_a')),
    Promise.resolve().then(()=>act(manager,host,'simultaneous_b')),
  ]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.filter(r=>r.status==='rejected')[0].reason.code,'STALE_VERSION');
  assert.equal(manager.get(host.room.code,host.token).game.turn,1);
});

test('illegal actions never mutate committed game state',()=>{
  const {manager,host}=setup();
  const before=JSON.stringify(manager.rooms.get(host.room.code).game);
  assert.throws(()=>act(manager,host,'illegal_0001',{key:'not-legal'}),e=>e.code==='ILLEGAL_ACTION');
  assert.equal(JSON.stringify(manager.rooms.get(host.room.code).game),before);
  assert.equal(manager.get(host.room.code,host.token).room.version,host.room.version);
});

test('solo immediately runs computer turns until the human turn',()=>{
  const manager=newManager();
  const room=manager.create({name:'Solo',mode:'solo',bots:5,target:12});
  assert.equal(room.game.players.length,6);
  const next=act(manager,room);
  assert.equal(next.game.turn,6);
  assert.equal(next.game.activePlayerId,room.room.youId);
  assert.equal(next.game.version,next.room.version);
});

test('encrypted recovery authenticates seat and rejects tampering',()=>{
  const {manager,host,guest}=setup();
  const latest=act(manager,host);
  const restarted=newManager();
  assert.throws(()=>restarted.restore('not-a-seat-token-00000000000000',latest.recovery),e=>e.code==='UNAUTHORIZED');
  const restored=restarted.restore(guest.token,latest.recovery);
  assert.equal(restored.restored,true);
  assert.equal(restored.game.turn,1);
  assert.deepEqual(restored.game.you.hand,['SECRET-p2']);
  const pieces=latest.recovery.split('.');
  pieces[3]=(pieces[3][0]==='A'?'B':'A')+pieces[3].slice(1);
  assert.throws(()=>newManager().restore(host.token,pieces.join('.')),e=>e.code==='INVALID_RECOVERY');
  assert.throws(()=>newManager({secret:'a completely different server secret'}).restore(host.token,latest.recovery),e=>e.code==='INVALID_RECOVERY');
});

test('recovery never rolls back an existing authoritative room',()=>{
  const {manager,host}=setup();
  const latest=act(manager,host);
  const result=manager.restore(host.token,host.recovery);
  assert.equal(result.restored,false);
  assert.equal(result.room.version,latest.room.version);
  assert.equal(result.game.turn,1);
});

test('disk snapshot survives a process restart and contains no plaintext hands/tokens',()=>{
  const directory=mkdtempSync(join(tmpdir(),'vineyard-test-'));
  try {
    const codec=new RecoveryCodec(SECRET);
    const manager=newManager({store:new SnapshotStore(directory,codec)});
    const host=manager.create({name:'Solo',mode:'solo',bots:1});
    const next=act(manager,host);
    manager.shutdown();
    const file=readdirSync(directory).find(n=>n.endsWith('.room'));
    const disk=readFileSync(join(directory,file),'utf8');
    assert.ok(!disk.includes('SECRET-p1'));
    assert.ok(!disk.includes(host.token));
    const restarted=newManager({store:new SnapshotStore(directory,codec)});
    const resumed=restarted.get(host.room.code,host.token);
    assert.equal(resumed.room.version,next.room.version);
    assert.equal(resumed.game.turn,2);
  } finally {rmSync(directory,{recursive:true,force:true});}
});

test('snapshot I/O failure leaves the last accepted turn intact',()=>{
  let broken=false;
  const store={load:()=>[],save:()=>{if(broken)throw new Error('Disk full');}};
  const manager=newManager({store});
  const host=manager.create({name:'Solo',mode:'solo',bots:1});
  broken=true;
  assert.throws(()=>act(manager,host),/Disk full/);
  assert.equal(manager.get(host.room.code,host.token).game.turn,0);
  assert.equal(manager.get(host.room.code,host.token).room.version,host.room.version);
});

test('expired room backups are rejected; local development secret is restart-stable',()=>{
  const manager=newManager({now:()=>1000});
  const host=manager.create({name:'Old',mode:'solo',bots:1});
  const restarted=newManager({now:()=>1000+15*86400000});
  assert.throws(()=>restarted.restore(host.token,host.recovery),e=>e.code==='RECOVERY_EXPIRED');
  const directory=mkdtempSync(join(tmpdir(),'vineyard-secret-'));
  try {assert.equal(localRecoverySecret(directory),localRecoverySecret(directory));}
  finally {rmSync(directory,{recursive:true,force:true});}
});

test('rematch revisions increase; only a host can rematch a finished table',()=>{
  const {manager,host,guest}=setup();
  assert.throws(()=>manager.rematch(host.room.code,host.token),e=>e.code==='GAME_NOT_FINISHED');
  for(let i=0;i<12;i++){
    const token=i%2?guest.token:host.token;
    const view=manager.get(host.room.code,token);
    manager.action(host.room.code,token,{key:'advance',version:view.room.version,requestId:`finish_move_${i}`});
  }
  const finished=manager.get(host.room.code,host.token);
  assert.equal(finished.room.status,'finished');
  assert.throws(()=>manager.rematch(host.room.code,guest.token),e=>e.code==='HOST_REQUIRED');
  const replay=manager.rematch(host.room.code,host.token);
  assert.equal(replay.room.status,'playing');
  assert.ok(replay.room.version>finished.room.version);
  assert.equal(replay.game.version,replay.room.version);
  assert.equal(replay.game.turn,0);
});

test('malformed input and room limits are rejected without side effects',()=>{
  const manager=newManager({maxRooms:1});
  assert.throws(()=>manager.create({name:'\n',mode:'solo'}),/name/);
  assert.throws(()=>manager.create({name:'N',mode:'solo',bots:0}),/Computer/);
  assert.throws(()=>manager.create({name:'N',mode:'solo',target:99}),/12-point/);
  const room=manager.create({name:'Okay',mode:'solo'});
  assert.throws(()=>manager.create({name:'Second',mode:'solo'}),e=>e.code==='ROOM_LIMIT');
  assert.throws(()=>manager.get('../../secret',room.token),/eight-character/);
  assert.equal(manager.rooms.size,1);
});

test('HTTP exposes playable rooms, same-origin checks, private state, and bounded routes',async t=>{
  const {createApp}=await import('../../server/vineyard/server.mjs');
  const directory=mkdtempSync(join(tmpdir(),'vineyard-http-'));
  const {writeFileSync}=await import('node:fs');
  writeFileSync(join(directory,'index.html'),'<!doctype html><title>Vineyard Table</title>');
  const manager=newManager();
  const server=createApp({manager,assets:directory,build:'test-commit',stableSecret:true});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{
    server.closeAllConnections();
    await new Promise(resolve=>server.close(resolve));
    rmSync(directory,{recursive:true,force:true});
  });
  const origin=`http://127.0.0.1:${server.address().port}`;
  const post=(path,body,token,extra={})=>fetch(origin+path,{method:'POST',headers:{
    'Content-Type':'application/json','Origin':origin,...(token?{Authorization:`Bearer ${token}`}:{ }),...extra,
  },body:JSON.stringify(body)});
  const health=await fetch(origin+'/healthz');
  assert.equal(health.status,200);
  assert.equal((await health.json()).build,'test-commit');
  const index=await fetch(origin+'/');
  assert.equal(index.status,200);
  assert.match(await index.text(),/Vineyard/);
  assert.match(index.headers.get('content-security-policy'),/script-src 'self'/);
  const badOrigin=await post('/api/rooms',{name:'Host',mode:'online'},null,{Origin:'https://other.example'});
  assert.equal(badOrigin.status,403);
  const create=await post('/api/rooms',{name:'Host',mode:'online',bots:0});
  assert.equal(create.status,201);
  const host=await create.json();
  const joinRes=await post(`/api/rooms/${host.room.code}/join`,{name:'Guest'});
  const guest=await joinRes.json();
  assert.ok(guest.token);
  const denied=await fetch(origin+`/api/rooms/${host.room.code}`);
  assert.equal(denied.status,401);
  const start=await post(`/api/rooms/${host.room.code}/start`,{bots:0},host.token);
  const game=await start.json();
  assert.equal(game.game.activePlayerId,host.room.youId);
  const move=await post(`/api/rooms/${host.room.code}/action`,{
    key:'advance',version:game.room.version,requestId:'http_action_0001',
  },host.token);
  assert.equal(move.status,200);
  const guestGet=await fetch(origin+`/api/rooms/${host.room.code}`,{headers:{Authorization:`Bearer ${guest.token}`}});
  const view=await guestGet.json();
  assert.deepEqual(view.game.you.hand,['SECRET-p2']);
  assert.ok(!JSON.stringify(view).includes('SECRET-p1'));
  const invalidBody=await fetch(origin+'/api/rooms',{method:'POST',headers:{'Content-Type':'text/plain'},body:'oops'});
  assert.equal(invalidBody.status,415);
  const traversal=await fetch(origin+'/%2e%2e%2fserver%2ftabletop%2frooms.mjs');
  assert.equal(traversal.status,404);
  const unsupported=await fetch(origin+'/api/rooms',{method:'DELETE'});
  assert.equal(unsupported.status,405);
});
