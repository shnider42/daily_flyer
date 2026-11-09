import test from 'node:test';
import assert from 'node:assert/strict';
import {CELL, createGame, update, interact, target, developerAction, pathBetween, openAt, distance, rng} from '../dist/core.mjs';

const at=(x,z)=>({x:(x+.5)*CELL,z:(z+.5)*CELL});
const advance=(s,seconds,input={})=>{for(let n=0;n<Math.ceil(seconds*60);n++)update(s,input,1/60);};
function operate(s,item){
  assert.ok(pathBetween(s.map,s.player,item).length,'An interaction can be reached without crossing a wall');
  s.player={...s.player,x:item.x,z:item.z,yaw:0};
  assert.equal(target(s),item);
  assert.equal(interact(s),true);
}
function finish(s){
  const exit=s.items.find(i=>i.kind==='exit');
  assert.equal(exit.locked,false);
  operate(s,exit);advance(s,1.3);
  assert.equal(s.status,'next');
}

// Move through the real collision map. Waiting obeys visible environmental clocks;
// this deliberately does not teleport over the newly added hazards.
function walkTo(s,destination,{quiet=false,inspections=false}={}){
  const route=pathBetween(s.map,s.player,destination);
  assert.ok(route.length,'Destination is connected');
  let node=1,frames=0;
  while(node<route.length&&frames++<40000){
    const next=route[node],d=distance(s.player,next);
    if(d<.075){node++;continue;}
    s.player.yaw=Math.atan2(next.x-s.player.x,s.player.z-next.z);
    let move=true;
    if(quiet&&(!s.puzzle.hum||s.puzzle.warning))move=false;
    if(inspections){
      for(const light of s.inspections){
        const inside=Math.abs(s.player.x-light.x)<light.width/2&&Math.abs(s.player.z-light.z)<light.depth/2;
        const near=Math.abs(s.player.x-light.x)<light.width/2+.2&&Math.abs(s.player.z-light.z)<light.depth/2+1.1;
        if(!inside&&near&&(light.active||light.warning))move=false;
      }
    }
    update(s,{forward:move?Math.min(1,d/(2.8/60)):0},1/60);
    assert.equal(s.status,'playing');
    assert.equal(s.transition,null,'The cautious route should not trigger a retreat');
    assert.ok(openAt(s.map,s.player.x,s.player.z));
  }
  assert.ok(frames<40000,'A timed crossing has a usable interval');
  return frames;
}

test('saved random state resumes the exact sequence after geometry generation',()=>{
  const a=rng(817),b=rng(0);for(let i=0;i<39;i++)a();b.setState(a.getState());
  for(let i=0;i<100;i++)assert.equal(a(),b());
});

test('the drainage floor is quiet, recoverable, and gates its exit until the service sequence is completed',()=>{
  for(let seed=1;seed<=40;seed++){
    const s=createGame(4,seed),exit=s.items.find(i=>i.kind==='exit');
    for(const item of s.items.filter(i=>i.kind!=='exit'))assert.ok(pathBetween(s.map,s.player,item).length);
    assert.equal(pathBetween(s.map,s.player,exit).length,0,'Gate physically blocks the northern door');
    advance(s,45);
    assert.equal(s.events.some(e=>['caught','screech','attention'].includes(e.type)),false);
    const valves=s.items.filter(i=>i.kind==='control');
    operate(s,valves.find(i=>i.id===2));assert.equal(s.puzzle.progress,1);
    operate(s,valves.find(i=>i.id===3));assert.equal(s.puzzle.progress,0);
    assert.ok(valves.every(i=>!i.active),'Wrong order returns every wheel to its starting state');
    for(const id of [2,1,3])operate(s,valves.find(i=>i.id===id));
    assert.equal(s.puzzle.solved,true);
    assert.equal(s.events.filter(e=>e.type==='drain').length,1);
    assert.ok(s.disturbance.until>s.time);
    operate(s,valves[0]);
    assert.equal(s.events.filter(e=>e.type==='drain').length,1,'Latched valves cannot repeat the scare');
    advance(s,8);assert.ok(s.puzzle.water<.01);
    finish(s);assert.equal(s.nextLevel,5);
  }
});

test('interaction rays stop at walls even if an object is within reach',()=>{
  const s=createGame(4,104),valve=s.items.find(i=>i.kind==='control');
  s.player={...s.player,x:valve.x,z:valve.z+2,yaw:0};
  const wallX=Math.floor(valve.x/CELL),wallZ=Math.floor((valve.z+1)/CELL);
  s.map[wallZ][wallX]=1;
  assert.notEqual(target(s)?.id,valve.id);
  assert.equal(interact(s),false);
  assert.equal(s.puzzle.progress,0);
});

test('the records clock has both cues, and standing still during quiet never attracts attention',()=>{
  const s=createGame(5,104);s.player={...s.player,...at(12,23)};
  advance(s,6);assert.equal(s.puzzle.hum,true);assert.equal(s.puzzle.warning,true);
  advance(s,1.2);assert.equal(s.puzzle.hum,false);
  advance(s,3.5);assert.equal(s.puzzle.awareness,0);
  assert.equal(s.transition,null);
  advance(s,.5);assert.equal(s.puzzle.hum,true);
  assert.ok(s.events.some(e=>e.type==='generator-off'));
  assert.ok(s.events.some(e=>e.type==='generator-on'));
});

test('records mistakes return to a reached refuge while preserving the latched breaker',()=>{
  const s=createGame(5,104),breaker=s.items.find(i=>i.kind==='control');
  operate(s,breaker);update(s);assert.equal(s.checkpointIndex,1);
  const checkpoint={...s.checkpoint};
  s.time=7.05;s.player={...s.player,...at(12,19),yaw:0};
  for(let n=0;n<220&&!s.transition;n++)update(s,{forward:1},1/60);
  assert.equal(s.transition?.kind,'reset');
  assert.equal(s.status,'playing');
  for(let n=0;n<60&&s.transition;n++)update(s,{},1/60);
  assert.deepEqual(s.player,checkpoint);
  assert.equal(s.puzzle.breakers,1);assert.equal(breaker.active,true);
  assert.equal(s.puzzle.awareness,0);assert.ok(s.settle>0);
});

test('records breakers work in either order, and an actual walking route solves the floor without damage',()=>{
  for(const order of [[1,2],[2,1]]){
    const s=createGame(5,31),exit=s.items.find(i=>i.kind==='exit');
    assert.equal(pathBetween(s.map,s.player,exit).length,0);
    let frames=0;
    for(const id of order){
      const breaker=s.items.find(i=>i.kind==='control'&&i.id===id);
      frames+=walkTo(s,breaker,{quiet:true});
      assert.equal(target(s),breaker);assert.equal(interact(s),true);
    }
    assert.equal(s.puzzle.breakers,2);assert.equal(s.puzzle.solved,true);
    frames+=walkTo(s,exit,{quiet:true});
    assert.ok(frames>1000,'Route includes travel and quiet intervals');
    assert.equal(s.events.filter(e=>e.type==='attention').length,0);
    interact(s);advance(s,1.3);assert.equal(s.nextLevel,6);
  }
});

test('inspection lamps report the same hazard bounds used by the simulation, and retreats are nonlethal',()=>{
  const s=createGame(6,104),light=s.inspections[0];
  assert.equal(light.active,true);
  assert.ok(light.width>0&&light.depth>0);
  for(const x of [light.x-light.width/2+.3,light.x,light.x+light.width/2-.3])assert.ok(openAt(s.map,x,light.z));
  s.player={...s.player,x:light.x,z:light.z};advance(s,.7);
  assert.equal(s.transition?.kind,'reset');
  advance(s,.8);assert.equal(s.status,'playing');
  assert.equal(s.exposure,0);assert.ok(distance(s.player,s.checkpoint)<.1);
  assert.equal(s.puzzle.cleared,0);
});

test('all three inspection bays can be crossed on foot, with side alcoves retained for retries',()=>{
  for(const seed of [1,104,807]){
    const s=createGame(6,seed);let frames=0;
    for(const refuge of s.refuges.slice(1)){
      frames+=walkTo(s,refuge,{inspections:true});update(s);
      assert.equal(s.checkpointIndex,refuge.index);
    }
    const exit=s.items.find(i=>i.kind==='exit');
    frames+=walkTo(s,exit,{inspections:true});
    assert.equal(s.puzzle.cleared,3);assert.equal(exit.locked,false);
    assert.equal(s.events.filter(e=>e.type==='attention').length,0);
    assert.ok(frames>1500);
    interact(s);advance(s,1.3);assert.equal(s.nextLevel,3,'Original garden remains the final floor');
  }
});

test('new admin shortcuts prepare valid reachable exits and clear stale transitions',()=>{
  for(const [level,action,next]of[[4,'drain',5],[5,'breakers',6],[6,'transit',3]]){
    const s=createGame(level,104);s.transition={kind:'reset',time:0,duration:1};
    developerAction(s,action);assert.equal(s.transition,null);
    assert.ok(openAt(s.map,s.player.x,s.player.z));
    assert.ok(s.puzzle.solved);finish(s);assert.equal(s.nextLevel,next);
  }
});
