import test from 'node:test';
import assert from 'node:assert/strict';
import * as rules from '../../server/vineyard/engine.mjs';
import {TabletopRooms} from '../../server/tabletop/rooms.mjs';
import {createApp} from '../../server/vineyard/server.mjs';

const SECRET='real-engine-integration-test-server-secret';
function manager(seed) {
  return new TabletopRooms({secret:SECRET,engine:{...rules,
    createGame:config=>rules.createGame({...config,seed}),
  }});
}
function move(table,view,token,id) {
  const raw=table.rooms.get(view.room.code).game;
  const key=rules.chooseBotAction(raw,view.room.youId);
  assert.ok(view.game.legalActions.some(a=>a.key===key),'AI-selected human move must be present in the personalized public choices');
  const response=table.action(view.room.code,token,{key,version:view.game.version,requestId:id});
  assert.ok(response.room.version>view.room.version,'A committed client choice advances the public revision');
  assert.equal(response.game.version,response.room.version);
  return response;
}

for (const seats of [2,4,6]) for (const target of [12,20]) {
  test(`real engine completes ${seats}-estate ${target}-point solo table`,t=>{
    const table=manager(`integration-${seats}-${target}`);
    let view=table.create({name:'Chris',mode:'solo',bots:seats-1,target});
    const token=view.token;
    let turns=0,maxRecovery=0,maxResponse=0;
    const phases=new Set([view.game.phase]);
    while(view.room.status==='playing' && turns<1500){
      assert.equal(view.game.activePlayerId,view.room.youId,'Computer turns must stop at the human decision');
      view=move(table,view,token,`complete_game_${++turns}`);
      phases.add(view.game.phase);
      maxRecovery=Math.max(maxRecovery,view.recovery.length);
      maxResponse=Math.max(maxResponse,Buffer.byteLength(JSON.stringify(view)));
    }
    assert.equal(view.room.status,'finished',`Match failed to finish after ${turns} human decisions`);
    assert.equal(view.game.phase,'finished');
    assert.ok(view.game.winnerIds.length>=1);
    assert.equal(view.game.rankings.length,seats);
    assert.ok(view.game.players.some(p=>p.score>=target));
    assert.ok(phases.has('summer')&&phases.has('winter'),'The simulation must traverse the seasonal production cycle');
    const raw=table.rooms.get(view.room.code).game;
    assert.ok(raw.players.some(p=>p.ordersFilled>0),'AI must pursue wine orders instead of only passive points');
    assert.ok(maxRecovery<250000,'Encrypted recovery stays comfortably inside upload/browser limits');
    assert.ok(maxResponse<750000,'Personalized response remains bounded at six seats');
    t.diagnostic(JSON.stringify({seats,target,year:view.game.year,humanDecisions:turns,
      totalDecisions:raw.version-1,maxRecoveryBytes:maxRecovery,maxResponseBytes:maxResponse}));
    const restarted=manager('ignored-for-restore');
    const recovered=restarted.restore(token,view.recovery);
    assert.equal(recovered.room.status,'finished');
    assert.deepEqual(recovered.game.winnerIds,view.game.winnerIds);
  });
}

test('real-engine online lobby revisions and opaque action keys coexist through mixed-human play',()=>{
  const table=manager('online-mixed-6');
  const host=table.create({name:'Chris',mode:'online',target:12,bots:0});
  const guest=table.join(host.room.code,{name:'Friend'});
  const tokens={[host.room.youId]:host.token,[guest.room.youId]:guest.token};
  let view=table.start(host.room.code,host.token,{bots:4});
  assert.equal(view.room.version,3);
  const raw=table.rooms.get(host.room.code).game;
  assert.notEqual(view.game.version,raw.version,'Lobby revisions intentionally differ from the rules engine counter');
  let turns=0;
  while(view.room.status==='playing' && turns<1500){
    const active=table.rooms.get(host.room.code).game.activePlayerId;
    const token=tokens[active];
    assert.ok(token,'The server must have already advanced every computer turn');
    view=table.get(host.room.code,token);
    const other=table.get(host.room.code,token===host.token?guest.token:host.token);
    assert.equal(other.game.legalActions.length,0,'Waiting players cannot see another player’s private choices');
    assert.equal(other.game.you.id,other.room.youId);
    assert.ok(other.game.players.every(p=>!Object.hasOwn(p,'hand')));
    const before=view;
    const key=rules.chooseBotAction(table.rooms.get(view.room.code).game,view.room.youId);
    view=move(table,view,token,`mixed_human_${++turns}`);
    if(turns===1){
      const duplicate=table.action(host.room.code,token,{key,version:before.game.version,requestId:'mixed_human_1'});
      assert.equal(duplicate.duplicate,true);
      assert.equal(duplicate.game.version,view.game.version);
      assert.throws(()=>table.action(host.room.code,token,{key,version:before.game.version,requestId:'mixed_stale_0001'}),e=>e.code==='STALE_VERSION');
    }
  }
  assert.equal(view.room.status,'finished');
  const oldVersion=view.room.version;
  const replay=table.rematch(host.room.code,host.token);
  assert.ok(replay.room.version>oldVersion);
  assert.equal(replay.game.phase,'spring');
  assert.equal(replay.game.you.id,host.room.youId);
  assert.equal(replay.room.players.length,6);
  assert.equal(table.get(host.room.code,guest.token).room.youId,guest.room.youId);
});

test('real-engine HTTP client contract supports compressed recovery and lost-response retries',async t=>{
  const table=manager('http-real-engine');
  const server=createApp({manager:table,build:'integration',stableSecret:true});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const origin=`http://127.0.0.1:${server.address().port}`;
  const post=(path,body,token)=>fetch(origin+path,{method:'POST',headers:{
    'Content-Type':'application/json',Origin:origin,...(token?{Authorization:`Bearer ${token}`}:{ }),
  },body:JSON.stringify(body)});
  const created=await post('/api/rooms',{name:'Chris',mode:'solo',bots:3,target:12});
  assert.equal(created.status,201);
  assert.equal(created.headers.get('content-encoding'),'gzip');
  const host=await created.json();
  assert.equal(host.game.you.id,host.room.youId);
  assert.match(host.recovery,/^vt2\./);
  assert.ok(host.recovery.length<25000);
  let view=host;
  for(let i=0;i<12;i++){
    const key=rules.chooseBotAction(table.rooms.get(view.room.code).game,view.room.youId);
    const request={key,version:view.game.version,requestId:`http_real_${i}`};
    const result=await post(`/api/rooms/${view.room.code}/action`,request,host.token);
    assert.equal(result.status,200);
    view=await result.json();
    const duplicate=await post(`/api/rooms/${view.room.code}/action`,request,host.token);
    assert.equal(duplicate.status,200);
    const retry=await duplicate.json();
    assert.equal(retry.duplicate,true);
    assert.equal(retry.game.version,view.game.version);
  }
  const restored=await post('/api/restore',{recovery:host.recovery},host.token);
  assert.equal(restored.status,200);
  assert.equal((await restored.json()).game.version,view.game.version,'The client’s older backup cannot overwrite the live table');
  const unknown=await post('/api/restore',{recovery:view.recovery},'invalid-seat-token-key-0000000000000');
  assert.equal(unknown.status,403);
});
