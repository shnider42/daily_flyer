/** Describe confirmed work and update freshness separately. No network or storage access. */
export function describeSharedConnection(store, {saving = false, saveError = '', now = Date.now()} = {}) {
  const connection = store.connection || {};
  const waiting = Boolean(saving || store.busy);
  const pending = Boolean(store.hasPending);
  const online = connection.online !== false;
  const interval = Number.isFinite(connection.pollIntervalMs) ? Math.max(5000, connection.pollIntervalMs) : 15000;
  const confirmed = Number.isFinite(connection.lastConfirmedAt) ? connection.lastConfirmedAt : null;
  const age = confirmed === null ? null : Math.max(0, now - confirmed);
  const stale = age === null || age >= Math.max(45000, interval * 3);
  const checking = Boolean(connection.checking);
  const duration = connection.lastResponseMs;
  let label, tone = 'normal', detail;

  if (pending && !waiting) {
    label = 'Save needs confirmation'; tone = 'error';
    detail = 'The reply did not arrive. The save may have reached the workspace. Retry the original save before making another change; keep this tab open.';
  } else if (!online) {
    label = waiting ? 'Offline · save still waiting' : 'Offline · updates paused'; tone = 'warning';
    detail = 'This is the last confirmed copy of the board. Keep this tab open to retain any unfinished draft. Updates will be checked when the connection returns.';
  } else if (waiting) {
    label = connection.slow ? 'Save taking longer…' : 'Saving…'; tone = 'waiting';
    detail = 'Waiting for the workspace to confirm this save. Keep this tab open; another submission is not needed.';
  } else if (checking && connection.slow) {
    label = 'Updates taking longer…'; tone = 'warning';
    detail = 'Showing the last confirmed copy while checking for changes. Your open draft stays in place.';
  } else if (store.loadIssue || stale) {
    label = 'Updates delayed'; tone = 'warning';
    detail = 'The visible board may be out of date. Check for updates before relying on a teammate’s latest changes.';
  } else if (connection.updates === 'live') {
    label = 'Live updates';
    detail = 'Changes are checked when a shared update arrives, with periodic checks while this tab is visible.';
  } else {
    label = `Checking every ${Math.round(interval / 1000)}s`;
    detail = `Live updates are unavailable. The board checks for changes about every ${Math.round(interval / 1000)} seconds while this tab is visible.`;
  }

  let freshness = 'No confirmed board check yet.';
  if (age !== null) {
    const seconds = Math.floor(age / 1000);
    const elapsed = seconds < 5 ? 'just now' : seconds < 60 ? `${seconds}s ago` : seconds < 3600 ? `${Math.floor(seconds / 60)}m ago` : `${Math.floor(seconds / 3600)}h ago`;
    freshness = `Last confirmed ${elapsed}.`;
  }
  const response = Number.isFinite(duration) && duration >= 0
    ? `Last confirmed request: ${duration < 1000 ? `${Math.round(duration)} ms` : `${(duration / 1000).toFixed(1)} s`}, including server processing.`
    : '';
  const saveLabel = waiting ? (connection.slow ? 'Still saving…' : 'Saving…') : pending ? 'Save needs confirmation' : saveError ? 'Shared save needs attention' : 'Saved to shared workspace';
  return {
    label, tone, detail, freshness, response, saveLabel,
    saveError: Boolean(saveError || (pending && !waiting)), saveWaiting: waiting,
    action: pending ? 'retry-pending' : 'refresh-shared',
    actionLabel: pending ? 'Retry original save' : checking ? 'Checking…' : 'Check for updates',
    actionDisabled: waiting || !online || (!pending && checking),
  };
}
