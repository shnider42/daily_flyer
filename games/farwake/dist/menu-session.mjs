/** A reply may update its original menu, never a newer menu or another captain. */
const place = game => {
  const state = game?.state || {};
  return [state.multiplayer?.captainId || state.seed, state.systemId, state.locationId,
    state.mode, state.interior?.kind, state.interior?.targetId, state.exploration?.siteId].join(':');
};

export function captureMenuSession({ dialog, game, connection = null }) {
  const revision = dialog.revision, opened = dialog.opened, kind = dialog.kind, location = place(game);
  return current => current.dialog === dialog && current.game === game && current.connection === connection
    && dialog.revision === revision && dialog.opened === opened && dialog.kind === kind && place(game) === location;
}
