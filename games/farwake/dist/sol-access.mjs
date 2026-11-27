/** Sol's physical expedition clearance is separate from a captain's evidence. */
export const SOL_SYSTEM_ID = 'sol';

export function personalSolClearance(game) {
  const flags = new Set(game?.state?.flags || []);
  const entry = flags.has('vault_recovered') && flags.has('homeward_signal');
  return { entry, landing: entry && flags.has('threshold_answered') };
}

export function solClearance(game) {
  const personal = personalSolClearance(game);
  const physical = typeof game?._solExpeditionClearance === 'function'
    ? game._solExpeditionClearance()
    : game?.state?.multiplayer?.solClearance;
  // A shared vessel actor may carry an absent owner's narrative state. Only
  // its actual hull and present crew can authorize that physical vessel.
  if(physical?.authoritative===true)return {entry:physical.entry===true,landing:physical.landing===true};
  return { entry: personal.entry || physical?.entry === true, landing: personal.landing || physical?.landing === true };
}

export function solEntryAccess(game, destinationId) {
  if(destinationId!==SOL_SYSTEM_ID)return {ok:true};
  const cleared=solClearance(game).entry;
  return {ok:true,cleared,quarantine:!cleared,...(!cleared?{warning:'Sol is reachable, but quarantine interceptors will fire on an unauthorized ship. Earth’s orbital batteries cover the landing approach. Keep fuel for the return jump.'}:{})};
}

export function solLandingAccess(game, body) {
  if (body?.id !== 'earth') return { ok: true };
  const permission = solClearance(game);
  // Clearing a physical battery screen is an exceptional alternative to a
  // recognized route. Merely arriving or clicking approach grants no permit.
  const destroyed=game?.system?.solCordon?.destroyedBatteryIds||[];
  const screenDestroyed=Array.from({length:6},(_,index)=>`sol:cordon:battery:${index+2}`).every(id=>destroyed.includes(id));
  if(!permission.landing&&screenDestroyed)return {ok:true,breach:true};
  if(!permission.entry)return {ok:false,code:'cordon',attemptable:true,
    reason:'Orbital batteries control the descent to Earth. An unauthorized approach will draw overwhelming fire.'};
  if(!permission.landing)return {ok:false,code:'permission',reason:'Your screened approach is recognized. Answer Threshold’s arrival hail to arrange the landing.'};
  return { ok: true };
}

export const isPublicOrigin = system => !!system && system.id !== SOL_SYSTEM_ID;
