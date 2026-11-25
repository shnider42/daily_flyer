import { SCENES, RECORDS, ENDINGS } from './content.mjs';

export const saveVersion = 1;
const flagKeys = Object.freeze(['returnChecked', 'panelOpened', 'inspectionPowered', 'receiverListened', 'signalCompared', 'threatRevealed', 'recorderRecovered', 'warningPublished']);
const sceneIds = Object.keys(SCENES);
const recordIds = Object.keys(RECORDS);
const bool = v => v === true;
const uniqueKnown = (value, known) => Array.isArray(value) ? [...new Set(value.filter(v => typeof v === 'string' && known.includes(v)))] : [];
const has = (s, id) => s.records.includes(id);

export function initialState() {
  return {
    version: saveVersion, scene: 'approach', visited: ['approach'], records: [],
    flags: Object.fromEntries(flagKeys.map(k => [k, false])),
    receiverMode: null, completed: false, moves: 0
  };
}

/** Recover a save without allowing malformed values or impossible progress chains. */
export function hydrateState(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== saveVersion) return initialState();
  const s = initialState();
  s.scene = sceneIds.includes(raw.scene) ? raw.scene : 'approach';
  s.visited = uniqueKnown(raw.visited, sceneIds);
  if (!s.visited.includes('approach')) s.visited.unshift('approach');
  if (!s.visited.includes(s.scene)) s.visited.push(s.scene);
  s.records = uniqueKnown(raw.records, recordIds);
  s.flags = Object.fromEntries(flagKeys.map(k => [k, bool(raw.flags?.[k])]));
  s.moves = Number.isSafeInteger(raw.moves) && raw.moves >= 0 ? Math.min(raw.moves, 1000000) : 0;
  s.flags.inspectionPowered = s.flags.inspectionPowered && s.flags.panelOpened && has(s, 'maintenance');
  s.flags.receiverListened = s.flags.receiverListened && s.flags.inspectionPowered;
  s.flags.signalCompared = s.flags.signalCompared && s.flags.receiverListened && has(s, 'photograph') && has(s, 'survey_log') && has(s, 'cable_marks');
  s.receiverMode = s.flags.signalCompared && ['mute', 'redirect'].includes(raw.receiverMode) ? raw.receiverMode : null;
  s.flags.threatRevealed = s.receiverMode === 'redirect';
  s.flags.recorderRecovered = s.flags.recorderRecovered && Boolean(s.receiverMode) && has(s, 'field_recorder');
  if (!s.flags.recorderRecovered) s.records = s.records.filter(id => id !== 'field_recorder');
  s.flags.warningPublished = s.flags.warningPublished && s.flags.recorderRecovered;
  s.completed = bool(raw.completed) && s.flags.warningPublished && s.scene === 'airlock';
  // A damaged save must never strand somebody beyond an unpowered access gate.
  if (['shaft', 'lower'].includes(s.scene) && !s.flags.inspectionPowered) s.scene = 'junction';
  return s;
}

const action = (id, label, kind, x, y, extra = {}) => ({ id, label, kind, x, y, ...extra });
const move = (target, label, x, y, allowed = true, reason = '') => action(`go:${target}`, label, 'move', x, y, { target, disabled: !allowed, reason });
const inspect = (id, label, x, y, extra = {}) => action(id, label, 'inspect', x, y, extra);
const operate = (id, label, x, y, allowed = true, reason = '', extra = {}) => action(id, label, 'operate', x, y, { disabled: !allowed, reason, ...extra });

export function availableActions(state) {
  const s = hydrateState(state);
  if (s.completed) return [];
  const f = s.flags;
  const receiverReady = f.signalCompared && !s.receiverMode;
  const missingClues = [!has(s,'photograph') && 'reference notes', !has(s,'survey_log') && 'survey log', !f.receiverListened && 'a listen to the call', !has(s,'cable_marks') && 'cable marks'].filter(Boolean);
  switch (s.scene) {
    case 'approach': return [
      move('airlock', 'Enter the airlock', 53, 57),
      move('beacon', 'Surface beacon', 83, 53),
      inspect('read-dispatch', has(s, 'dispatch') ? 'Read recovery assignment' : 'Recovery assignment', 25, 74, { record: 'dispatch' })
    ];
    case 'airlock': return [
      move('junction', 'Enter the installation', 51, 49),
      move('approach', 'Return to the surface', 14, 62),
      inspect('check-return', 'Check the green supply', 76, 61),
      ...(f.warningPublished ? [action('finish', 'Complete the recovery', 'finish', 52, 82)] : [])
    ];
    case 'junction': return [
      move('airlock', 'Airlock · exit', 11, 74),
      move('survey', 'Survey room', 28, 47),
      move('service', 'Service bay', 77, 49),
      move('shaft', 'Listening shaft', 51, 41, f.inspectionPowered, 'Restore the inspection lamps at the service panel first.')
    ];
    case 'survey': return [
      move('junction', 'Service junction', 12, 72),
      inspect('take-photo', has(s, 'photograph') ? 'Reference notes' : 'Collect the reference notes', 57, 48, { record: 'photograph' }),
      inspect('read-survey-log', 'Survey log', 73, 66, { record: 'survey_log' })
    ];
    case 'service': return [
      move('junction', 'Service junction', 13, 73),
      inspect('read-maintenance', 'Maintenance card', 29, 48, { record: 'maintenance' }),
      ...(!f.panelOpened ? [operate('open-panel', 'Open the service panel', 68, 50)] : [
        operate('power-inspection', f.inspectionPowered ? 'Inspection lamps restored' : 'Switch on inspection lights', 59, 47, !f.inspectionPowered && has(s, 'maintenance'), f.inspectionPowered ? 'The inspection lamps are already on.' : 'Read the maintenance card before switching a circuit.'),
        operate('power-receiver', 'Test RECEIVER supply', 78, 58, !f.inspectionPowered, 'The receiver already has power; the inspection lamps are restored.')
      ])
    ];
    case 'shaft': return [
      move('junction', 'Back to service junction', 12, 73),
      move('lower', 'Lower landing', 53, 64, Boolean(s.receiverMode), 'Identify and isolate the repeated call before approaching its lower pickup.'),
      inspect('listen-receiver', s.receiverMode ? 'Listen to the changed signal' : 'Listen to the receiver', 72, 38),
      inspect('inspect-cable', 'Inspect the cable marks', 66, 61, { record: 'cable_marks' }),
      ...(!f.signalCompared ? [operate('compare-signal', 'Compare the four clues', 37, 47, has(s, 'photograph') && has(s, 'survey_log') && has(s, 'cable_marks') && f.receiverListened, `Still needed: ${missingClues.join(', ')}.`)] : []),
      ...(receiverReady ? [
        operate('mute-receiver', 'Mute the receiver', 35, 44),
        operate('redirect-receiver', 'Redirect into the side shaft', 73, 48)
      ] : [])
    ];
    case 'lower': return [
      move('shaft', 'Return to the shaft head', 15, 71),
      operate('recover-recorder', f.recorderRecovered ? 'Read the recovered recording' : 'Recover the field recorder', 62, 66, Boolean(s.receiverMode), 'Isolate the repeated call before approaching.', { record: 'field_recorder' })
    ];
    case 'beacon': return [
      move('approach', 'Back to the station entrance', 23, 71),
      operate('publish-warning', f.warningPublished ? 'Warning transmitted' : 'Upload recorder and warning', 73, 56, f.recorderRecovered && !f.warningPublished, f.warningPublished ? 'The truthful warning has been saved and transmitted.' : 'Recover the lower field recorder before replacing the warning.')
    ];
    default: return [];
  }
}

const addRecord = (s, id) => { if (!s.records.includes(id)) s.records.push(id); };

/** Scene copy follows the work already done, including on revisit or reload. */
export function sceneDescription(state) {
  const s = hydrateState(state);
  if (s.scene === 'approach' && s.flags.warningPublished) return 'The beacon is carrying your corrected warning. The green path leads back to the airlock. Your recovery record is ready to leave with you.';
  if (s.scene === 'junction' && s.flags.inspectionPowered) return 'The inspection lamps now reach the shaft entrance. The survey room and service bay remain accessible. The green return strip leads back to the airlock.';
  if (s.scene === 'service' && s.receiverMode === 'mute') return 'The inspection circuit is restored and the receiver is muted. The green return supply remains independent. The service bay has settled into an ordinary low hum.';
  if (s.scene === 'service' && s.flags.inspectionPowered) return 'The inspection circuit is restored. Its lamps and the separate green return strip are steady. The maintenance panel can stay as it is.';
  if (s.scene === 'shaft' && s.receiverMode === 'mute') return 'The repeated call has stopped. The lower landing is lit and the green return strip is steady. The receiver remains isolated.';
  if (s.scene === 'shaft' && s.receiverMode === 'redirect') return 'The call now comes from the empty side shaft. The movement followed it away from the recovery passage. The lower landing and the green route remain clear.';
  if (s.scene === 'lower' && s.flags.recorderRecovered) return 'The recorder is secured in your case. Its empty bracket remains beside the pickup. The green markers above show the way back.';
  if (s.scene === 'lower' && s.receiverMode === 'redirect') return 'The call comes from the empty side shaft, off your recovery route. The field recorder is in its bracket beside the lower pickup. Green markers lead back above you.';
  if (s.scene === 'beacon' && s.flags.warningPublished) return 'The obsolete clearance is gone. The beacon now carries an accurate acoustic warning, the safe return route, and a copy of the recovered recording.';
  return SCENES[s.scene].description;
}

export function perform(state, actionId) {
  const current = hydrateState(state);
  if (current.completed) return { state: current, message: 'This recovery is complete. Its record is preserved.' };
  const selected = availableActions(current).find(a => a.id === actionId);
  if (!selected) return { state: current, message: 'That action is not available from here.' };
  if (selected.disabled) return { state: current, message: selected.reason || 'You cannot do that yet.' };
  const s = { ...current, visited: [...current.visited], records: [...current.records], flags: { ...current.flags } };
  if (selected.kind === 'move') {
    s.scene = selected.target;
    if (!s.visited.includes(s.scene)) s.visited.push(s.scene);
    s.moves += 1;
    return { state: s, message: sceneDescription(s), event: 'step' };
  }
  switch (actionId) {
    case 'read-dispatch':
      addRecord(s, 'dispatch');
      return { state: s, message: 'Recovery assignment copied to your journal.', event: 'record', record: 'dispatch' };
    case 'check-return':
      s.flags.returnChecked = true;
      return { state: s, message: 'The green exit supply has an independent cell. It is healthy. There is no reason to disconnect it.', event: 'panel' };
    case 'take-photo':
      addRecord(s, 'photograph');
      return { state: s, message: 'Reference notes saved. Compare the recorded receiver position and white lead when you reach the shaft.', event: 'record', record: 'photograph' };
    case 'read-survey-log':
      addRecord(s, 'survey_log');
      return { state: s, message: 'The operator noticed a repeated call with the final breath missing.', event: 'record', record: 'survey_log' };
    case 'read-maintenance':
      addRecord(s, 'maintenance');
      return { state: s, message: 'The inspection lamps and the return strip use separate supplies.', event: 'record', record: 'maintenance' };
    case 'open-panel':
      s.flags.panelOpened = true;
      return { state: s, message: 'The panel opens. INSPECTION is isolated. RECEIVER is already live. The green RETURN cable bypasses these switches.', event: 'panel' };
    case 'power-inspection':
      s.flags.inspectionPowered = true;
      return { state: s, message: 'The inspection lamps come on in stages. The shaft and lower landing are visible. The green return strip stays on.', event: 'power' };
    case 'power-receiver':
      return { state: s, message: 'The receiver answers with a short burst of feedback. It already has power. The maintenance card identifies the separate INSPECTION supply.', event: 'feedback' };
    case 'listen-receiver':
      s.flags.receiverListened = true;
      return { state: s, message: s.receiverMode === 'mute' ? 'The playback is silent. You can hear the installation’s ordinary low hum.' : s.receiverMode === 'redirect' ? 'The clipped call is now coming from the side shaft, away from your return route.' : '“North team. Hold the light.” The phrase repeats. Its ending cuts off in exactly the same place.', event: s.receiverMode ? 'panel' : 'receiver' };
    case 'inspect-cable':
      addRecord(s, 'cable_marks');
      return { state: s, message: 'The scraped white lead points away from the exit and into an empty side shaft.', event: 'record', record: 'cable_marks' };
    case 'compare-signal':
      s.flags.signalCompared = true;
      return { state: s, message: 'The changed cable position and identical clipped ending agree: this is a repeated survey call, not a live reply. Mute it here, or redirect it into the empty side shaft. Either leaves the green lights powered.', event: 'diagnosis' };
    case 'mute-receiver':
      s.receiverMode = 'mute';
      return { state: s, message: 'The call stops. After a while, the faint movement below stops too. The lower landing is clear enough to recover the recorder.', event: 'mute' };
    case 'redirect-receiver':
      s.receiverMode = 'redirect';
      s.flags.threatRevealed = true;
      return { state: s, message: 'The call moves into the empty side shaft. A low shape crosses the edge of the inspection light and follows it. It moves away from your recovery route. The green strip is steady.', event: 'redirect' };
    case 'recover-recorder':
      s.flags.recorderRecovered = true;
      addRecord(s, 'field_recorder');
      return { state: s, message: 'The field recorder is secure. Return to the surface beacon and replace its obsolete clearance with the supported facts.', event: 'recover', record: 'field_recorder' };
    case 'publish-warning':
      s.flags.warningPublished = true;
      return { state: s, message: 'Warning transmitted: repeated acoustic lure, altered receiver, independent green exit route. The recorder is attached. No unsupported claim about the earlier crew is included.', event: 'transmit' };
    case 'finish':
      s.completed = true;
      return { state: s, message: 'Recovery complete. Your record has been preserved for the next crew.', event: 'complete' };
    default: return { state: current, message: 'That action is not available from here.' };
  }
}

export function objective(state) {
  const s = hydrateState(state), f = s.flags;
  if (s.completed) return { title: 'Recovery complete', text: 'Your recording and warning are preserved.', hint: 'You can review the journal or begin a new recovery.', nextScene: 'airlock' };
  if (f.warningPublished) return { title: 'Return to the airlock', text: 'The beacon has your warning. Bring the recovery to a close.', hint: 'Follow the path back to the approach, then enter the airlock and complete the recovery.', nextScene: 'airlock' };
  if (f.recorderRecovered) return { title: 'Warn the next crew', text: 'Replace the surface beacon’s obsolete clearance.', hint: 'Follow the green route through the junction and airlock. The beacon is outside, beside the approach.', nextScene: 'beacon' };
  if (s.receiverMode) return { title: 'Recover the field recorder', text: 'The call is off the recovery route. Reach the lower landing.', hint: 'From the listening shaft, choose the lower landing. The recorder is in a bracket beside the pickup.', nextScene: 'lower' };
  if (f.signalCompared) return { title: 'Resolve the repeated call', text: 'Mute the receiver or redirect it into the empty side shaft.', hint: 'Both controls leave the green return lights intact. Muting is quiet; redirecting lets you observe what follows the sound.', nextScene: 'shaft' };
  if (f.inspectionPowered) {
    if (!has(s, 'photograph') || !has(s, 'survey_log')) return { title: 'Find the earlier observations', text: 'The survey room holds a reference photograph and the listening log.', hint: 'Inspect both records in the survey room before comparing the receiver.', nextScene: 'survey' };
    return { title: 'Understand the receiver', text: 'Listen, inspect its cable, and compare your observations.', hint: 'At the shaft, listen to the receiver and inspect the cable marks. Then compare them with your photograph and survey log.', nextScene: 'shaft' };
  }
  if (!has(s, 'photograph') || !has(s, 'survey_log')) return { title: 'Examine the survey room', text: 'Find the records left by the previous shift.', hint: 'Enter the airlock, continue to the junction, and visit the survey room. Look for a clipped photograph and a log.', nextScene: 'survey' };
  return { title: 'Restore inspection lighting', text: 'Find the service-bay instructions and restore the isolated circuit.', hint: 'Read the maintenance card, open the service panel, and restore INSPECTION. The green exit supply stays connected.', nextScene: 'service' };
}

export function getEnding(state) {
  const s = hydrateState(state);
  if (!s.completed || !s.receiverMode) return null;
  const ending = ENDINGS[s.receiverMode];
  return { ...ending, details: [...ending.details], recordsRecovered: s.records.length, totalRecords: recordIds.length, moves: s.moves };
}
