import { getChapter } from './content.mjs';
import { hydrateState, sceneDescription } from './state.mjs';
/** Optional observations never advance a gate or claim facts beyond this witness. */
export function sceneObservations(raw){const s=hydrateState(raw);return getChapter(s.chapter).scenes[s.scene].observations.map(item=>({...item}));}
export function sceneObservationLead(raw){return sceneDescription(raw);}
// The parked renderer imports these names. Its old recovery quiz is retired;
// the released anthology's puzzles operate actual equipment through state.mjs.
export const EVIDENCE_QUESTIONS=Object.freeze([]);
export function evidenceCards(raw){const s=hydrateState(raw);return getChapter(s.chapter).records.filter(r=>s.records.includes(r.id)).map(r=>({id:r.id,title:r.title,text:r.body}));}
export function assessEvidence(){return {ready:false,correct:false,feedback:'Use the equipment controls and your current task. There is no recovery evidence quiz in this chapter.'};}
