import { getChapter } from './content.mjs';
import { hydrateState, availableActions } from './state.mjs';
export const MISSION_BRIEF = getChapter('nightglass').brief;
export const missionBrief = raw => getChapter(raw?.chapter).brief;

/** Shortest reachable route through this chapter's fixed physical geography. */
export function routeTo(raw,destination){
  const s=hydrateState(raw),seen=new Set([s.scene]),queue=[[s.scene]];
  while(queue.length){
    const path=queue.shift(),here=path.at(-1);
    if(here===destination)return path;
    for(const a of availableActions({...s,scene:here}).filter(a=>a.kind==='move'&&!a.disabled)){
      if(seen.has(a.target))continue;seen.add(a.target);queue.push([...path,a.target]);
    }
  }
  return null;
}
export function missionStatus(raw){
  const s=hydrateState(raw),c=getChapter(s.chapter);
  const next=s.completed?null:c.tasks.find(t=>!s.flags[t.flag]);
  const steps=c.milestones.map((m,index)=>({label:m.label,done:Boolean(s.flags[m.flag]),current:!s.flags[m.flag]&&c.milestones.slice(0,index).every(p=>s.flags[p.flag])}));
  if(!next)return {phase:'complete',title:'Chapter complete',text:'Revisit your notes or choose another chapter.',hint:'Progress is saved separately for each chapter.',destination:s.scene,nextScene:s.scene,nextActionId:null,steps};
  const path=routeTo(s,next.scene);
  const nextScene=path?.[1]||s.scene;
  return {phase:'work',title:next.title,text:next.text,hint:next.hint,destination:next.scene,nextScene,nextActionId:s.scene===next.scene?next.action:path?.[1]?`go:${nextScene}`:null,steps};
}
