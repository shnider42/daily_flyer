import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, issueOrder, placePing, step, PING_DURATION, PING_COOLDOWN } from '../public/sim.mjs';
import { Renderer, renderMinimap } from '../public/renderer.mjs';

const gameplay = state => {
  const { pings, nextPingId, ...rest } = state;
  return structuredClone(rest);
};

test('a point of interest changes no orders, AI paths, sight, combat, radio, or random state', () => {
  for (const role of ['leader','member']) {
    const game=createGame({role,seed:17});
    if (role==='leader') issueOrder(game,'hold');
    const before=gameplay(game),point={x:game.world.width-40,y:20};
    assert.equal(placePing(game,point),true);
    assert.deepEqual(gameplay(game),before);
    assert.equal(game.pings.length,1);
    assert.deepEqual({x:game.pings[0].x,y:game.pings[0].y},point);
    assert.equal(game.pings[0].actorId,game.playerId);
    assert.equal(game.pings[0].name,game.squad.find(a=>a.id===game.playerId).name);
    assert.equal(game.pings[0].expiresAt-game.pings[0].createdAt,PING_DURATION);
  }
});

test('pings reject invalid locations and inactive soldiers without partial mutations', () => {
  const game=createGame({seed:18}),before=structuredClone(game);
  for (const point of [null,{}, {x:NaN,y:2},{x:2,y:Infinity},{x:-1,y:20},{x:20,y:-1},{x:2401,y:20},{x:20,y:1901}]) {
    assert.equal(placePing(game,point),false);
    assert.deepEqual(game,before);
  }
  assert.equal(placePing(game,{x:20,y:20},-999),false);
  const actor=game.squad.find(a=>a.id===game.playerId);
  actor.downed=true;assert.equal(placePing(game,{x:20,y:20}),false);
  actor.downed=false;actor.alive=false;assert.equal(placePing(game,{x:20,y:20}),false);
  actor.alive=true;game.status='won';assert.equal(placePing(game,{x:20,y:20}),false);
  assert.equal(game.pings.length,0);
});

test('each soldier has a bounded, rate-limited marker that expires with simulation time', () => {
  const game=createGame({seed:19,difficulty:'story'});
  game.enemies=[];game.maxEnemies=0;
  for (const actor of game.squad) assert.equal(placePing(game,{x:100,y:100},actor.id),true);
  assert.equal(game.pings.length,4);
  const first=game.pings[0],owner=first.actorId;
  assert.equal(placePing(game,{x:200,y:200},owner),false);
  assert.equal(game.pings[0],first);
  game.time=PING_COOLDOWN+.01;
  assert.equal(placePing(game,{x:200,y:200},owner),true);
  assert.equal(game.pings.length,4);
  assert.equal(game.pings.filter(p=>p.actorId===owner).length,1);
  assert.equal(game.pings.at(-1).x,200);
  game.time=game.pings.at(-1).expiresAt-.01;
  step(game,{},.02);
  assert.equal(game.pings.length,0);
});

test('map and battlefield pings render a distinct annotation without exposing hidden actors', () => {
  const labels=[],drawn=[],context=new Proxy({measureText:text=>({width:text.length*7}),fillText:(text,x,y)=>labels.push({text,x,y})},
    {get:(target,key)=>key in target?target[key]:(...args)=>drawn.push({method:key,args})});
  const canvas={width:1280,height:720,clientWidth:1280,clientHeight:720,getContext:()=>context};
  const renderer=new Renderer(canvas);renderer.resize(1280,720,1);
  renderer.camera={x:1200,y:950,zoom:.3};
  const state={time:1,pings:[{id:1,actorId:2,name:'Mercer',x:1200,y:950,createdAt:0,expiresAt:8}],enemies:[{id:30,visible:false,x:1200,y:950}]};
  const before=structuredClone(state);
  for (const showMap of [false,true]) renderer.drawPings(state,{showMap,guidance:'simple',reducedMotion:true});
  assert.equal(labels.filter(item=>item.text==='PING · MERCER').length,2,'names remain readable even at overview zoom');
  assert.deepEqual(state,before);
  labels.length=0;renderer.drawPings(state,{menu:true});assert.equal(labels.length,0);
  state.time=8;renderer.drawPings(state,{});assert.equal(labels.length,0);
  assert.ok(drawn.some(item=>item.method==='closePath'),'the annotation has a diamond outline distinct from orders');
});

test('minimap and offscreen indicators discard expired pings', () => {
  const labels=[],paths=[];
  const context=new Proxy({measureText:text=>({width:text.length*6}),fillText:text=>labels.push(text),moveTo:(x,y)=>paths.push([x,y])},
    {get:(target,key)=>key in target?target[key]:(()=>{})});
  const canvas={width:1280,height:720,clientWidth:1280,clientHeight:720,getContext:()=>context};
  const renderer=new Renderer(canvas);renderer.resize(1280,720,1);renderer.camera={x:200,y:1700,zoom:1};
  const state={time:1,world:{width:2400,height:1900,buildings:[]},squad:[],pings:[{name:'Hale',x:2100,y:20,createdAt:0,expiresAt:8}]};
  renderer.drawPingIndicator(state,{guidance:'simple'});assert.ok(labels.includes('PING · HALE'));
  labels.length=0;renderer.drawPingIndicator(state,{showMap:true});assert.equal(labels.length,0);
  renderMinimap(canvas,state);const withPing=paths.length;
  paths.length=0;state.time=8;renderMinimap(canvas,state);assert.ok(paths.length<withPing);
  labels.length=0;renderer.drawPingIndicator(state,{});assert.equal(labels.length,0);
});
