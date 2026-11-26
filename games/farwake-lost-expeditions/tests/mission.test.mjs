import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTER_ORDER, getChapter } from '../dist/content.mjs';
import { initialState, availableActions, perform } from '../dist/state.mjs';
import { missionBrief, missionStatus, routeTo } from '../dist/mission.mjs';
import { playChapter } from './chapter-helpers.mjs';

for(const id of CHAPTER_ORDER){
  test(`${id}: guidance describes the current physical task and traverses reachable exits`,()=>{
    playChapter(id,{onStep:(s,a)=>{const m=missionStatus(s);assert(m.title&&m.text&&m.hint);assert.equal(a.id,m.nextActionId);
      if(a.kind==='move'){assert.equal(a.target,m.nextScene);assert(routeTo(s,m.destination)?.length>1);}
      else assert.equal(s.scene,m.destination);
      assert.equal(m.steps.length,3);
    }});
    const done=missionStatus(playChapter(id));assert.equal(done.phase,'complete');assert(done.steps.every(x=>x.done));assert.equal(done.nextActionId,null);
    assert.match(missionBrief(initialState(id)),new RegExp(getChapter(id).character));
  });
  test(`${id}: every reachable pre-ending state retains a route to its starting room`,()=>{
    playChapter(id,{onStep:s=>{
      const c=getChapter(id);
      for(const scene of Object.keys(c.scenes)){
        const route=routeTo(s,scene);if(!route)continue;
        let visit=s;for(const step of route.slice(1))visit=perform(visit,`go:${step}`).state;
        assert(routeTo(visit,c.startScene),`return route from ${scene}`);
        assert(availableActions(visit).some(a=>a.kind==='move'&&!a.disabled),`exit from ${scene}`);
      }
    }});
  });
}
