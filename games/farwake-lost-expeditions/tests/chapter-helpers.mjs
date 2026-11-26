import assert from 'node:assert/strict';
import { initialState, perform, availableActions, hydrateState } from '../dist/state.mjs';
import { missionStatus } from '../dist/mission.mjs';
export function apply(state,...ids){return ids.reduce((s,id)=>{const a=availableActions(s).find(a=>a.id===id);assert(a&&!a.disabled,`${id} is usable from ${s.scene}: ${a?.reason}`);return perform(s,id).state;},state);}
export function playChapter(id,{until='finalEvent',onStep=()=>{}}={}){
  let state=initialState(id),count=0;
  while(!state.flags[until]&&count++<100){
    const task=missionStatus(state),a=availableActions(state).find(a=>a.id===task.nextActionId);
    assert(a&&!a.disabled,`${id}: guidance reaches a usable action from ${state.scene}`);
    onStep(state,a);
    state=perform(state,a.id).state;
    // Actual save normalization is exercised between every step, not only at the end.
    state=hydrateState(JSON.parse(JSON.stringify(state)));
  }
  assert(state.flags[until],`${id} reaches ${until} in bounded steps`);return state;
}
