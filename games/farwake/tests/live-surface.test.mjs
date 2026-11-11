import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { generateSurface } from '../dist/surface.mjs';
import { updateNpcLife } from '../dist/npc-life.mjs';
import { liveInteractionSurface } from '../dist/live-surface.mjs';

function livingPort(game, id) {
  const map=generateSurface(game.currentBody,game.state.seed,game.state.flags);
  const actor=map.entities.find(entity=>entity.id===id), original={x:actor.x,y:actor.y};
  let time=0;
  for(;time<1440;time+=5){updateNpcLife(map,time);if(Math.hypot(actor.x-original.x,actor.y-original.y)>49)break;}
  assert.ok(time<1440,'resident leaves their old interaction point');
  game._surfaceForInteraction=()=>map;
  game._npcTime=()=>time;
  return{map,actor,original};
}

test('opening marker and hand-off follow the real dockworker instead of the old spawn',()=>{
  const game=new Game('living-opening',{openingMission:true});
  const{actor,original}=livingPort(game,'kettle:dockworker');
  const target=game.openingMissionStatus().target;
  assert.deepEqual({x:target.x,y:target.y},{x:actor.x,y:actor.y});
  Object.assign(game.state.person,original);
  assert.equal(game.openingAction('accept',{entityId:actor.id}).code,'distance');
  Object.assign(game.state.person,{x:actor.x,y:actor.y});
  assert.equal(game.openingAction('accept',{entityId:actor.id}).ok,true);
});

test('story contact inspection and acceptance use the same moving person',()=>{
  const game=new Game('living-story',{openingMission:true});
  const{actor,original}=livingPort(game,'quest:len-vale');
  Object.assign(game.state.person,original);
  assert.equal(game.inspectContact(actor.id).code,'distance');
  Object.assign(game.state.person,{x:actor.x,y:actor.y});
  const result=game.inspectContact(actor.id);
  assert.equal(result.ok,true,result.reason);
  assert.equal(game.threadAction({threadId:'last_fare',action:'accept',entityId:actor.id}).ok,true);
});

test('a stale room hook cannot replace another port or another system',()=>{
  const kettle={id:'kettle',systemId:'hearth',entities:[]};
  const same={...kettle,entities:[{id:'moving'}]};
  const game={_surfaceForInteraction:()=>same};
  assert.equal(liveInteractionSurface(game,kettle),same);
  assert.equal(liveInteractionSurface(game,{id:'morrow',systemId:'hearth'}).id,'morrow');
  const other={id:'kettle',systemId:'other'};
  assert.equal(liveInteractionSurface(game,other),other);
  assert.equal(liveInteractionSurface({},kettle),kettle);
});
