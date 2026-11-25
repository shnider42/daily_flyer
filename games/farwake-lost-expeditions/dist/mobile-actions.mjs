/** Short scene labels; the action list retains each action's full description. */
export const MOBILE_LABELS = Object.freeze({
  'read-dispatch': 'Assignment',
  'check-return': 'Green supply',
  'take-photo': 'Photograph',
  'read-survey-log': 'Survey log',
  'read-maintenance': 'Maintenance card',
  'open-panel': 'Service panel',
  'power-inspection': 'Inspection lights',
  'power-receiver': 'Receiver supply',
  'listen-receiver': 'Receiver',
  'inspect-cable': 'Cable marks',
  'compare-signal': 'Compare evidence',
  'mute-receiver': 'Mute receiver',
  'redirect-receiver': 'Redirect call',
  'recover-recorder': 'Field recorder',
  'publish-warning': 'Transmit warning',
  finish: 'Complete recovery'
});

export function mobileLabel(action) {
  return MOBILE_LABELS[action.id] || action.label || action.id;
}

/**
 * Present existing actions without changing their availability or the save.
 * Collected records stay in the notebook; routes retain their lock reasons.
 * Arrays are new, while action descriptors remain the original read-only values.
 */
export function mobileActions(state, actions) {
  const records = new Set(state.records);
  const routes = actions.filter(action => action.kind === 'move');
  const interactions = actions.filter(action => {
    if (action.kind === 'move') return false;
    if (action.record && records.has(action.record)) return false;
    if (action.id === 'check-return' && state.flags.returnChecked) return false;
    if (['power-inspection', 'power-receiver'].includes(action.id) && state.flags.inspectionPowered) return false;
    if (action.id === 'listen-receiver' && state.receiverMode) return false;
    return true;
  });
  const hasNewInteraction = interactions.some(action => !action.disabled &&
    !(action.id === 'listen-receiver' && state.flags.receiverListened));
  const hasMute = interactions.some(action => action.id === 'mute-receiver');
  const hotspots = interactions.filter(action => !action.disabled &&
    !(hasMute && action.id === 'listen-receiver'));
  return {
    interactions,
    routes,
    defaultTab: state.completed || hasNewInteraction ? 'inspect' : 'move',
    hotspots
  };
}
