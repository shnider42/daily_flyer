/** Presentation never changes the authoritative action set or its prerequisites. */
export function mobileLabel(action){return action.shortLabel||action.label||action.id;}
export const MOBILE_LABELS=Object.freeze({});
export function mobileActions(state,actions){
  const routes=actions.filter(a=>a.kind==='move');
  const interactions=actions.filter(a=>a.kind!=='move'&&!(a.record&&state.records.includes(a.record)));
  return {interactions,routes,defaultTab:state.completed||interactions.some(a=>!a.disabled&&a.sets?.length)?'inspect':'move',hotspots:interactions.filter(a=>!a.disabled)};
}
