/** Farwake: Lost Expeditions — Nightglass. Authored fictional recovery case. */
export const CHAPTER = Object.freeze({
  id: 'nightglass',
  title: 'Nightglass',
  subtitle: 'The listening shaft · Luna',
  archive: 'Lilt Library · expedition records',
  brief: 'A survey installation is still answering an abandoned call. Recover its field recorder, make the route safe, and leave an accurate warning for the next crew.',
  fiction: 'A fictional expedition in the Farwake universe. Its people, installation, records, and events are invented.',
  controls: 'Choose a place to move. Inspect what catches your eye. Your journal keeps the records you recover.',
  sourceNote: 'Adapted from Farwake’s existing Nightglass Listening Shaft: an imitated call, a damaged survey receiver, and a separate supply for the exit lamps.'
});

const scene = (id, title, subtitle, image, description) => Object.freeze({ id, title, subtitle, image, description });
export const SCENES = Object.freeze({
  approach: scene('approach', 'The approach', 'Lunar survey perimeter', 'approach', 'A low installation sits at the edge of the crater. Green lamps mark a narrow route from its airlock to a surface beacon. The receiver is still powered.'),
  airlock: scene('airlock', 'The airlock', 'A way back', 'airlock', 'The inner seal is intact. A green cable follows the doorway into the installation, separate from the overhead service wiring. Your return route has its own supply.'),
  junction: scene('junction', 'Service junction', 'Three doors. One return line.', 'junction', 'The green strip continues behind you. The survey room and service bay are close by; the shaft access is too dark to inspect safely.'),
  survey: scene('survey', 'The survey room', 'Before the last shift', 'survey', 'The crew left annotated reference notes beside the survey log. The room looks recently used, but the fine dust on the writing surface has not been disturbed.'),
  service: scene('service', 'The service bay', 'Independent circuits', 'service', 'A maintenance card identifies the three circuits. The inspection supply is isolated at the panel. A low receiver tone continues through the wall.'),
  shaft: scene('shaft', 'The listening shaft', 'A voice without a breath', 'shaft', 'A receiver faces the lower passage. Its white lead has been moved since the reference photograph. A separate branch points into an empty side shaft.'),
  lower: scene('lower', 'The lower landing', 'The last recording', 'lower', 'The field recorder rests in a bracket beside the lower pickup. Your green return markers remain visible above. A narrow side opening leads away from the recovery route.'),
  beacon: scene('beacon', 'The surface beacon', 'A message for the next crew', 'beacon', 'The beacon still advertises clear survey access. A recovered recording and a truthful warning can outlast this visit.')
});

const record = (id, title, kind, source, body) => Object.freeze({ id, title, kind, source, body });
export const RECORDS = Object.freeze({
  dispatch: record('dispatch', 'Recovery assignment', 'document', 'Surface dispatch sleeve',
    'Nightglass survey access is suspended. The beacon is repeating an old clearance. Recover the lower field recorder and identify the repeated call. The green exit lights have a separate supply. After transmitting the warning, return to the airlock to finish the recovery. The earlier crew’s departure was never logged. Check the recorder before assigning a final status.'),
  photograph: record('photograph', 'Before the last shift', 'photo', 'Annotations on survey photograph · survey room',
    'The receiver is aimed down the central passage. A white lead enters its listening input. The unused side-shaft socket is capped. Above both, the green return-light cable runs unbroken. Someone has circled the receiver bracket and written: “Record the position before moving it.”'),
  survey_log: record('survey_log', 'The missing breath', 'audio', 'Survey log · final legible entry',
    '“North team. Hold the light.” The call repeats with the same clipped ending. The return always omits the speaker’s final breath. Do not treat it as a live reply. Photograph the wiring, trace the pickup, and compare the signal before changing the receiver.'),
  maintenance: record('maintenance', 'Keep the way home', 'document', 'Service-bay maintenance card',
    'RETURN: independent green supply. Leave connected. INSPECTION: overhead lamps and the lower landing. Restore at the service panel. RECEIVER: directional pickup and playback assembly. It can be muted without interrupting the exit lamps. Restore visibility before working on its controls.'),
  cable_marks: record('cable_marks', 'Marks at the bracket', 'observation', 'Receiver bracket · listening shaft',
    'The white lead was pulled away from its photographed position. Scratches on the sleeve point toward the empty side shaft, away from the exit. The lower pickup hears the repeated call as well as movement near it. Muting stops the call; redirecting moves its source off the recovery route.'),
  field_recorder: record('field_recorder', 'A useful warning', 'audio', 'Recovered lower field recorder',
    'The last operator describes an animal copying the survey call. They tried to draw it toward the empty side shaft. Between bursts of feedback, they check the green lamps and call for the north team. The recording ends before anyone answers. There is no departure entry.')
});

export const RECORD_ORDER = Object.freeze(['dispatch', 'photograph', 'survey_log', 'maintenance', 'cable_marks', 'field_recorder']);

export const ENDINGS = Object.freeze({
  mute: {
    title: 'The call has ended',
    text: 'You recovered the field record, silenced the receiver, and returned along the green lights. The next crew will receive a warning they can use.',
    outcome: 'Receiver muted · recorder recovered · route preserved',
    details: [
      'Confirmed: the return was an imitation of a repeated survey call.',
      'Confirmed: the receiver can be isolated without extinguishing the exit lamps.',
      'Unresolved: the earlier crew’s later movements and the animal’s origin.'
    ]
  },
  redirect: {
    title: 'A light to return by',
    text: 'You moved the call into the empty side shaft. Something followed it out of the recovery passage. You brought back the recorder and left a truthful warning.',
    outcome: 'Call redirected · recorder recovered · route preserved',
    details: [
      'Confirmed: movement followed the redirected playback into the side shaft.',
      'Confirmed: the green return route remained powered throughout the recovery.',
      'Unresolved: the earlier crew’s later movements and the animal’s origin.'
    ]
  }
});
