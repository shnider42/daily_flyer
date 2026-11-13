/** Presentation only: a compact packet cannot change a captain's quest stage. */
export function earthCampaignPresentation(view, live) {
  if (!view?.campaign) return null;
  const stored = view.campaign;
  const status = live?.threadId === view.id && live.stageId === stored.stageId
    && (!stored.operationId || !live.operationId || stored.operationId === live.operationId) ? { ...stored, ...live } : stored;
  const mission = `Mission ${status.missionNumber} of ${status.missionCount}`;
  const integrity = Number.isFinite(status.maxIntegrity) && status.maxIntegrity > 0
    ? Math.max(0, Math.min(100, Math.round(status.integrity / status.maxIntegrity * 100))) : null;
  let detail = status.carriedPassenger ? `${status.carriedPassenger.name} is aboard. Bring this same ship to the receiving port.`
    : `${status.rescues || 0} survivors delivered`;
  if (status.requiredHold) {
    const watch = `${Math.floor(status.held || 0)} / ${status.requiredHold} seconds on watch`;
    const attackers = `${status.neutralized || 0} / ${status.targets || 0} attackers neutralized`;
    detail = status.status === 'waiting' ? 'Reach the marked contact and begin the defense.'
      : status.status === 'failed' ? 'Operation interrupted. Return to the marker with a working ship to retry.'
      : status.status === 'ready' ? 'The contact is secure. Confirm the completed operation.'
      : `${watch} · ${attackers}`;
  }
  return { mission, detail, integrity, status: status.status, stageId: status.stageId };
}
