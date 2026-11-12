/** Small, optional explanations inside crew and service panels. No game rules live here. */
import { escapeHtml as esc } from './ui.mjs';

export const flowGuidanceLevel=value=>['simple','moderate','expert'].includes(value)?value:'simple';

/** The same instructions remain available at every level; only their presentation changes. */
export function guidanceFlowMarkup({id,title,level='simple',steps=[],notes=[],next=null,expanded=true}={}){
 level=flowGuidanceLevel(level);
 const current=steps.findIndex(step=>!step.done),instruction=next||steps[current]?.text||'You are ready for the next part of the voyage.';
 const list=steps.length?`<ol class="guidance-flow-steps">${steps.map((step,index)=>`<li${step.done?' class="done"':index===current?' class="current" aria-current="step"':''}><span class="guidance-flow-state">${step.done?'Complete':index===current?'Next':'Then'}</span>${esc(step.text)}</li>`).join('')}</ol>`:'';
 return `${level==='moderate'?`<p class="guidance-flow-next"><strong>Next:</strong> ${esc(instruction)}</p>`:''}<details class="guidance-flow" data-guidance-flow="${esc(id||'help')}"${level==='simple'&&expanded?' open':''}><summary>${esc(title||'How this works')}</summary>${list}${notes.map(note=>`<p>${esc(note)}</p>`).join('')}</details>`;
}
