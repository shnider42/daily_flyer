import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTER_ORDER } from '../dist/content.mjs';
import { availableActions } from '../dist/state.mjs';
import { mobileActions, mobileLabel } from '../dist/mobile-actions.mjs';
import { playChapter } from './chapter-helpers.mjs';

for(const id of CHAPTER_ORDER)test(`${id}: every required interaction and exit survives mobile presentation`,()=>{
  const end=playChapter(id,{onStep:(s,required)=>{
    const actions=availableActions(s),before=JSON.stringify({s,actions}),view=mobileActions(s,actions);
    assert([...view.interactions,...view.routes].some(a=>a.id===required.id&&!a.disabled),`${required.id} in mobile task`);
    assert.deepEqual(view.routes,actions.filter(a=>a.kind==='move'));
    assert(view.hotspots.every(a=>!a.disabled&&a.kind!=='move'));
    for(const action of [...view.interactions,...view.routes])assert(mobileLabel(action));
    assert.equal(JSON.stringify({s,actions}),before);
  }});
  assert.deepEqual(mobileActions(end,availableActions(end)),{interactions:[],routes:[],defaultTab:'inspect',hotspots:[]});
});

test('disabled operations retain an explanation and collected notes remain in the notebook',()=>{
  playChapter('nightglass',{onStep:s=>{
    const view=mobileActions(s,availableActions(s));
    for(const a of [...view.routes,...view.interactions].filter(a=>a.disabled))assert(a.reason);
    assert(!view.interactions.some(a=>a.record&&s.records.includes(a.record)));
  }});
});
