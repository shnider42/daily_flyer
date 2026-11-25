import { hydrateState } from './state.mjs';

// Optional observations give a place texture. They never award a required clue,
// change a circuit, or advance the recovery. Anchors use scene-image percentages.
const observation = (id, title, body, x, y) => ({ id, title, body, anchor: [x, y] });

export function sceneObservations(rawState) {
  const s = hydrateState(rawState), f = s.flags;
  switch (s.scene) {
    case 'approach': return [
      observation('supply-cases', 'Cases by the entrance',
        'The cases are nested neatly against the wall. Pale rectangles show where their shipping labels were peeled away. Someone brought supplies here, unpacked them, and expected the empty cases to be useful again.', 18, 58),
      observation('crater-rim', 'The crater rim',
        'Beyond the installation, the ground folds into sharp ridges and deep shadow. There is no weather to watch. You take a moment to notice how small the warm airlock light looks against it.', 84, 35)
    ];
    case 'airlock': return [
      observation('airlock-case', 'The stowed case',
        'The case is latched and pushed clear of the walking space. One corner has polished the shelf beneath it. It has been lifted from this spot and put back many times.', 24, 55),
      observation('hatch-window', 'The hatch window',
        f.warningPublished
          ? 'The same ridge is framed by the hatch window. The station has your warning now, and the recorder is with you. Nothing here requires you to follow the call any farther.'
          : 'Through the small window, the lunar ridge is still exactly where you left it. The heavy seal and the green floor strip give you two ordinary things to trust.', 50, 34)
    ];
    case 'junction': return [
      observation('return-strip', 'The way back',
        f.inspectionPowered
          ? 'The inspection lamps have made the other passages readable. The green strip still leads to the airlock, just as it did in the dark. You can recognize the way home without consulting a screen.'
          : 'The green strip makes a continuous line through the junction. You pause at the doors and fix their positions in your mind. Whatever the equipment is doing, this is still a small building with a way out.', 30, 82)
    ];
    case 'survey': return [
      observation('survey-chair', 'The pulled-back chair',
        'The chair sits a little away from the desk. A shallow arc is worn into the floor beneath it. The room was somebody’s daily workplace before it became a place for you to investigate.', 48, 79),
      observation('survey-window', 'The view from the desk',
        'The lamp reflects faintly in the window. Beyond it, the ridges are quiet and bare. Whoever worked at this desk could look up from a page and see the whole edge of the crater.', 62, 32)
    ];
    case 'service': return [
      observation('service-lamp', 'A repaired lamp',
        'One fastener on the wall lamp is newer than the others. There are small tool scratches around it. Most of the work done here was probably as ordinary as keeping a light from going out.', 65, 25),
      observation('circuit-hum', 'The cabinet vibration',
        s.receiverMode === 'mute'
          ? 'The repeating voice has gone. The cabinet still has a faint, even vibration: power supplies, lamps, and other equipment doing their work. The silence has room for ordinary sounds again.'
          : f.inspectionPowered
            ? 'The cabinet gives a brief settling click, then holds a steady vibration. The inspection lamps stay on. Testing the receiver supply again would not make the passage any brighter.'
            : 'A faint vibration comes through the cabinet even while the inspection lamps are off. Some equipment is already powered. The maintenance card can tell you which supply needs attention.', 71, 65)
    ];
    case 'shaft': return [
      observation('survey-winch', 'The survey winch',
        'The cable is wound in even rows, with old grease darkening the guide. The mechanism is still. You can imagine the ordinary survey work: lower an instrument, take a reading, bring it back.', 47, 27),
      observation('shaft-handrail', 'The handrail',
        s.receiverMode === 'redirect'
          ? 'The call now reaches you from the side opening. The handrail and the green markers lead the other way, down toward the recorder. You have a clear route without following the voice.'
          : s.receiverMode === 'mute'
            ? 'Without the call, the lower landing is easier to place by its lights. The handrail runs down beside the route. You can take the recorder and come back the same way.'
            : 'You rest a gloved hand on the rail and look down. The lit landing is close enough to recognize; the repeated voice makes it feel farther away. The receiver controls are still within reach.', 80, 69)
    ];
    case 'lower': return [
      observation('recorder-bracket', f.recorderRecovered ? 'The empty bracket' : 'The recorder bracket',
        f.recorderRecovered
          ? 'A clean outline is left where the recorder sat. Its retaining clip springs back against the bracket. The part of the expedition you can bring home is now in your case.'
          : 'The recorder is held in a proper mounting bracket beside the pickup. It was left to keep recording in one place. Its presence alone cannot tell you which way the operator went afterward.', 65, 59),
      observation('lower-return-markers', 'The markers above',
        'The green markers remain visible above the landing. You check their position before turning back to the equipment. The route up has not changed.', 24, 46)
    ];
    case 'beacon': return [
      observation('beacon-clearance', f.warningPublished ? 'Your transmitted warning' : 'The old clearance',
        f.warningPublished
          ? 'The beacon now carries the acoustic hazard, the green return route, and the recovered recording. It makes no claim about the crew’s later movements. The next visitor will have more to go on than you did.'
          : 'The old clearance keeps repeating without anyone here to stand behind it. A message can survive the situation it describes. Your warning will need to say what you actually found.', 48, 54)
    ];
    default: return [];
  }
}

/** Short arrival copy stays separate from the task so observation has room. */
export function sceneObservationLead(rawState) {
  const s = hydrateState(rawState), f = s.flags;
  const leads = {
    approach: f.warningPublished
      ? 'The beacon is carrying your warning. The warm airlock light marks the final walk back.'
      : 'A warm light over the airlock. Empty ridges beyond it. Nightglass is still running.',
    airlock: f.warningPublished
      ? 'The recorder is secure. You are back at the seal where the recovery began.'
      : 'The seal holds. A green strip runs along the floor and into the installation.',
    junction: f.inspectionPowered
      ? 'The shaft entrance is lit now. The green strip still points back to the airlock.'
      : 'Three doorways, and the same green line behind you. The shaft entrance is dark.',
    survey: 'A pulled-back chair, a lit desk, and the crew’s unfinished work. Nothing stirs beyond the window.',
    service: s.receiverMode === 'mute'
      ? 'The cabinet hum is ordinary again. The inspection and return lamps are steady.'
      : f.inspectionPowered
        ? 'The inspection circuit is steady. A clipped voice still reaches you through the wall.'
        : 'The inspection supply is off. A low receiver tone comes through the wall.',
    shaft: s.receiverMode === 'redirect'
      ? 'The voice has moved into the side shaft. Your way down is lit and clear.'
      : s.receiverMode === 'mute'
        ? 'The call has stopped. You can see the lower landing beneath the rail.'
        : 'The receiver faces the lower passage. The call begins again when you stop to listen.',
    lower: f.recorderRecovered
      ? 'An empty bracket. The recorder is with you, and the green markers lead back up.'
      : 'The recorder waits beside the lower pickup. The green markers are visible above you.',
    beacon: f.warningPublished
      ? 'Your recording and warning are on the beacon. The last step is the airlock.'
      : 'The terminal still advertises clear survey access. Its message has outlasted the survey.'
  };
  return leads[s.scene] || '';
}

const question = (id, prompt, correctId, options) => Object.freeze({
  id, prompt, correctId,
  options: Object.freeze(options.map(option => Object.freeze(option)))
});

export const EVIDENCE_QUESTIONS = Object.freeze([
  question('signal', 'What does the repeated ending tell you?', 'repeated-call', [
    { id: 'live-reply', label: 'A crew member is answering now.', feedback: 'The survey log and your own listening end at the same cut. A repeated phrase does not establish a live reply.' },
    { id: 'repeated-call', label: 'The damaged survey call is being repeated.', feedback: 'Your listening matches the clipped ending in the log. The cable marks show that the receiver has also been moved.' },
    { id: 'crew-fate', label: 'The call proves what happened to the crew.', feedback: 'A recording can outlast its speaker. The records here do not establish the crew’s later movements.' }
  ]),
  question('return', 'How can you change the call and keep a way back?', 'separate-supply', [
    { id: 'all-power', label: 'Switch off every circuit in the station.', feedback: 'The green lamps mark your return route. Their separate supply can stay on while you control the receiver.' },
    { id: 'follow-call', label: 'Leave the receiver alone and follow the voice.', feedback: 'The receiver can carry the call in another direction. The voice is not a reliable marker for the route or a live person.' },
    { id: 'separate-supply', label: 'Control the receiver; leave the green supply on.', feedback: 'The green return supply is independent. You can mute the call or redirect it without extinguishing those lamps.' }
  ])
]);

const clueDefinitions = Object.freeze([
  { id: 'photograph', title: 'Reference notes', text: 'Before the last shift, the white lead entered the listening input. The side-shaft socket was capped; the green return cable ran above both.' },
  { id: 'survey_log', title: 'Survey log', text: 'The operator wrote that every return omitted the speaker’s final breath. They asked for the wiring and signal to be compared.' },
  { id: 'receiver', title: 'What you heard', text: '“North team. Hold the light.” The phrase repeats, cutting off in exactly the same place each time.' },
  { id: 'cable_marks', title: 'Cable marks', text: 'The white lead has moved from its recorded position. Scratches point toward the empty side shaft, away from the exit.' }
]);

/** Reveal only observations already earned through the existing actions. */
export function evidenceCards(rawState) {
  const s = hydrateState(rawState);
  return clueDefinitions.filter(clue => clue.id === 'receiver' ? s.flags.receiverListened : s.records.includes(clue.id))
    .map(clue => ({ ...clue }));
}

/** Assess the player's reading; the existing compare-signal action owns progress. */
export function assessEvidence(rawState, answers) {
  const cards = evidenceCards(rawState), found = new Set(cards.map(card => card.id));
  const missing = clueDefinitions.filter(clue => !found.has(clue.id)).map(clue => clue.title);
  if (missing.length) return { ready: false, correct: false, missing, feedback: `Still to examine: ${missing.join(', ')}.` };
  const choices = answers && typeof answers === 'object' && !Array.isArray(answers) ? answers : {};
  for (const item of EVIDENCE_QUESTIONS) {
    const option = item.options.find(candidate => candidate.id === choices[item.id]);
    if (!option) return { ready: true, correct: false, missing: [], feedback: `Choose a conclusion for: ${item.prompt}` };
    if (option.id !== item.correctId) return { ready: true, correct: false, missing: [], feedback: option.feedback };
  }
  return {
    ready: true, correct: true, missing: [],
    feedback: 'The call is repeating, and the green return supply is independent. You can now choose whether to mute the receiver or redirect it into the side shaft.'
  };
}
