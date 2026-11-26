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
  return { entry: personal.entry || physical?.entry === true, landing: personal.landing || physical?.landing === true };
}

export function solEntryAccess(game, destinationId) {
  if (destinationId !== SOL_SYSTEM_ID || game?.state?.systemId === SOL_SYSTEM_ID || solClearance(game).entry) return { ok: true };
  return { ok: false, code: 'quarantine', reason: 'Sol is under quarantine. Follow the Quiet Earth investigation to recover a safe approach and expedition clearance.' };
}

export function solLandingAccess(game, body) {
  if (body?.id !== 'earth') return { ok: true };
  const permission = solClearance(game);
  if (!permission.entry) return { ok: false, code: 'quarantine', reason: 'Earth’s landing corridor is closed. Recover the safe approach from Witness first.' };
  if (!permission.landing) return { ok: false, code: 'permission', reason: 'Threshold is asking you to identify yourself. Answer the arrival hail to receive landing permission.' };
  return { ok: true };
}

export const isPublicOrigin = system => !!system && system.id !== SOL_SYSTEM_ID;
