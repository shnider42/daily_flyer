import { hydrateState, availableActions } from './state.mjs';

export const MISSION_BRIEF = 'You are a recovery operator at Nightglass, a deserted survey station on the Moon. The previous crew never logged its departure, and the station is still repeating a call. Recover the field recorder from the lower landing, upload it with a warning at the surface beacon, then return to the airlock to finish the recovery. Enter the airlock, then visit the survey room for the crew’s notes.';

const places = Object.freeze({
  approach: 'station entrance', airlock: 'airlock', junction: 'service junction',
  survey: 'survey room', service: 'service bay', shaft: 'listening shaft',
  lower: 'lower landing', beacon: 'surface beacon'
});
const task = (destination, nextActionId, title, text, hint) => ({ destination, nextActionId, title, text, hint });

function serviceTask(state) {
  if (!state.records.includes('maintenance')) return task('service', 'read-maintenance',
    'Read the maintenance card', 'Find which circuit lights the shaft and lower landing.',
    'The green exit lights already have their own supply. Read the card beside the service panel.');
  if (!state.flags.panelOpened) return task('service', 'open-panel',
    'Open the service panel', 'The inspection lamps must be on before you enter the shaft.',
    'Open the panel, then use the INSPECTION circuit. The exit lights stay connected.');
  return task('service', 'power-inspection', 'Switch on the inspection lights',
    'Light the route to the lower recorder without interrupting the green exit lights.',
    'Use INSPECTION. The receiver already has power.');
}

function listenTask() {
  return task('shaft', 'listen-receiver', 'Listen to the repeated call',
    'Check how the call ends before changing the receiver.',
    'Listen at the receiver. Its written transcript contains the same clue as the sound.');
}

function cableTask() {
  return task('shaft', 'inspect-cable', 'Inspect the receiver cable',
    'Record the cable marks before deciding what to do with the playback.',
    'Examine the white lead and the marks at the receiver bracket. Your notes stay in the notebook.');
}

function nextWork(state) {
  const f = state.flags, has = id => state.records.includes(id);
  if (state.completed) return task('airlock', null, 'Recovery complete',
    'The recorder and warning are preserved, and you have returned to the airlock.',
    'Review your field report or the recovered records.');
  if (f.warningPublished) return task('airlock', 'finish', 'Complete the recovery',
    'The beacon has your warning. Finish your recovery at the airlock.',
    'Return to the airlock and complete the recovery to save your field report.');
  if (f.recorderRecovered) return task('beacon', 'publish-warning', 'Upload the recorder and warning',
    'Replace the surface beacon’s outdated clearance so the next crew knows what happened.',
    'The beacon is outside beside the station entrance. Upload the recorder with the warning.');
  if (state.receiverMode) return task('lower', 'recover-recorder', 'Recover the field recorder',
    'The call is off your recovery route. Retrieve the recorder from the lower landing.',
    'Enter the lower landing from the listening shaft and recover the recorder from its bracket.');
  if (f.signalCompared) return task('shaft', null, 'Choose how to control the call',
    'Mute the playback or redirect it into the empty side shaft before going down.',
    'Muting stops the playback here. Redirecting sends it away from the recovery passage. Both preserve the green exit lights and leave a route to the recorder.');

  // Useful work in the room takes priority over a prescribed visit order.
  if (state.scene === 'service' && !f.inspectionPowered) return serviceTask(state);
  if (state.scene === 'shaft') {
    if (!f.receiverListened) return listenTask();
    if (!has('cable_marks')) return cableTask();
  }
  if (!has('photograph')) return task('survey', 'take-photo', 'Collect the reference notes',
    'The crew’s notes explain the receiver you must pass to reach the lower recorder.',
    'Collect the reference notes beside the survey log. They describe the equipment before the last shift.');
  if (!has('survey_log')) return task('survey', 'read-survey-log', 'Read the survey log',
    'Learn what the last operator noticed about the repeated call.',
    'Read the log in the survey room. You will compare its account with the receiver and cable marks.');
  if (!f.inspectionPowered) return serviceTask(state);
  if (!f.receiverListened) return listenTask();
  if (!has('cable_marks')) return cableTask();
  return task('shaft', 'compare-signal', 'Compare the four clues',
    'Bring together the reference notes, survey log, cable marks, and repeated call.',
    'You have all four observations. Compare them at the receiver before choosing mute or redirect.');
}

/** Find an adjacent step using only routes the existing state allows. */
function routeTo(state, destination) {
  const queue = [[state.scene]], visited = new Set([state.scene]);
  while (queue.length) {
    const path = queue.shift(), scene = path[path.length - 1];
    if (scene === destination) return path;
    for (const action of availableActions({ ...state, scene })) {
      if (action.kind !== 'move' || action.disabled || visited.has(action.target)) continue;
      visited.add(action.target);
      queue.push([...path, action.target]);
    }
  }
  return null;
}

/**
 * Shared, optional guidance for snapshot and free-movement views.
 * nextScene is the adjacent suggested room (the current room for local work).
 * destination is the scene ID where the current piece of work can be completed.
 * A null nextActionId at the receiver deliberately leaves both endings equal.
 */
export function missionStatus(rawState) {
  const state = hydrateState(rawState), f = state.flags;
  const phase = state.completed ? 'complete' : f.warningPublished ? 'return' : f.recorderRecovered ? 'warn' : 'recover';
  const steps = [
    { label: 'Recover recorder', done: f.recorderRecovered, current: phase === 'recover' },
    { label: 'Warn next crew', done: f.warningPublished, current: phase === 'warn' },
    { label: 'Return to the airlock', done: state.completed, current: phase === 'return' }
  ];
  const work = nextWork(state);
  if (state.scene === work.destination) return { phase, ...work, nextScene: state.scene, steps };
  const path = routeTo(state, work.destination);
  const nextScene = path?.[1] || state.scene;
  const action = availableActions(state).find(option => option.kind === 'move' && !option.disabled && option.target === nextScene);
  const title = nextScene === 'airlock' && state.scene === 'approach' ? 'Enter the airlock'
    : nextScene === 'junction' && state.scene === 'airlock' ? 'Enter the installation'
    : `${state.visited.includes(nextScene) ? 'Return to' : 'Visit'} the ${places[nextScene]}`;
  return {
    phase, title,
    text: state.scene === 'approach' && work.destination === 'survey'
      ? 'Visit the survey room for the crew’s notes. They will help you reach the lower recorder.'
      : nextScene === work.destination ? work.text : `Continue through the ${places[nextScene]} to reach the ${places[work.destination]}. ${work.text}`,
    nextActionId: action?.id || null,
    nextScene,
    destination: work.destination,
    hint: `${path ? `Route: ${path.map(id => places[id]).join(' → ')}. ` : ''}${work.hint}`,
    steps
  };
}
