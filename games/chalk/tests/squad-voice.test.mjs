import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareBuildingInteriors } from '../public/building-geometry.mjs';
import { VOICE_LINES } from '../public/squad-voice-lines.mjs';
import { ORDER_VOICE_COOLDOWN, VOICE_LINE_COOLDOWN, createVoiceDirector,
  chooseVoiceLine, squadVoiceCategory, voicePolicy, findVoiceSpeaker, squadVoiceRoute } from '../public/squad-voice.mjs';

const open = { buildings: [], walls: [] };
const soldier = (id, x, y, extra = {}) => ({ id, x, y, alive: true, ...extra });
const house = () => prepareBuildingInteriors({ buildings: [{ id: 'house', x: 0, y: 0, w: 200, h: 200, tone: .3 }] });
const speak = (director, category, time, available) => chooseVoiceLine(director, category, VOICE_LINES, time, available);

test('all routine order types share one minute of silence while orders themselves remain independent', () => {
  assert.equal(ORDER_VOICE_COOLDOWN, 60);
  const director = createVoiceDirector(0);
  assert.ok(speak(director, 'move', 0));
  for (const category of ['move', 'hold', 'assist', 'cover', 'ready', 'smoke']) {
    assert.equal(voicePolicy(category)?.group, 'orders');
    for (const time of [1, 15, 30, 59.999]) assert.equal(speak(director, category, time), null, `${category} at ${time}s`);
  }
  assert.ok(speak(director, 'hold', 60), 'another order may speak when the minute expires');
  assert.equal(speak(director, 'move', 119.999), null);
  assert.ok(speak(director, 'move', 120));
});

test('three movement recordings rotate without recycling any exact phrase inside three minutes', () => {
  assert.equal(VOICE_LINE_COOLDOWN, 180);
  const director = createVoiceDirector(0), ids = [0, 60, 120].map(time => speak(director, 'move', time)?.line.id);
  assert.equal(new Set(ids).size, 3);
  assert.ok(ids.every(Boolean));
  assert.equal(speak(director, 'move', 179.999), null);
  assert.equal(speak(director, 'move', 180)?.line.id, ids[0]);
  const single = createVoiceDirector();
  assert.ok(speak(single, 'hold', 0));
  assert.equal(speak(single, 'hold', 60), null, 'a one-line category stays quiet instead of defeating its phrase cooldown');
  assert.equal(speak(single, 'hold', 179.999), null);
  assert.ok(speak(single, 'hold', 180));
});

test('failed or unavailable samples do not consume the speech budget or reserve a later stale call', () => {
  const director = createVoiceDirector(4);
  assert.equal(speak(director, 'move', 0, () => false), null);
  assert.equal(director.groups.size, 0);
  assert.equal(director.lines.size, 0);
  assert.equal(director.lastSpokeAt, -Infinity);
  assert.equal(speak(director, 'not-a-category', 0), null);
  assert.equal(speak(director, 'move', NaN), null);
  assert.equal(speak(director, 'move', Infinity), null);
  assert.ok(speak(director, 'hold', 1));
  assert.equal(speak(director, 'move', 10), null);
  assert.equal(director.groups.get('orders'), 1, 'suppressed clicks do not extend or restart the cooldown');
});

test('assist and smoke use truthful short recordings without escaping the routine order policy', () => {
  const assist = speak(createVoiceDirector(), 'assist', 0);
  assert.equal(assist?.line.text, 'Medic!');
  assert.equal(assist?.group, 'orders');
  const smoke = speak(createVoiceDirector(), 'smoke', 0);
  assert.equal(smoke?.line.text, 'Go, go, go!');
  assert.equal(smoke?.group, 'orders');
  assert.equal(speak(createVoiceDirector(), 'ready', 0), null, 'no invented acknowledgment from the interrogative Ready? recording');
});

test('danger warnings have a separate bounded opportunity without interrupting every order or repeating every throw', () => {
  const director = createVoiceDirector();
  assert.ok(speak(director, 'move', 0));
  assert.equal(speak(director, 'frag', 1), null, 'preserves brief space around the previous spoken line');
  assert.ok(speak(director, 'frag', 2), 'a necessary danger call need not wait for the order minute');
  assert.equal(speak(director, 'flash', 9.999), null, 'different grenade names share their short cooldown');
  assert.ok(speak(director, 'flash', 10));
  assert.equal(speak(director, 'frag', 18), null, 'the same urgent phrase still has its own repeat limit');
  assert.ok(speak(director, 'frag', 24));
});

test('only known actionable squad messages become voice cues; narrative text stays intact', () => {
  const cases = [
    ['Move to your marker.', 'move'], ['Move to the marker.', 'move'],
    ['Regroup on you.', 'move'], ['Regroup on the leader.', 'move'],
    ['Hold this position.', 'hold'], ['Hold up. Give me a moment.', 'hold'],
    ['Help the wounded.', 'assist'], ['Ready. Moving with you.', 'ready'],
    ['Medic, I need help.', 'help'], ['Mercer down. Need help here.', 'help'],
    ['Long rifle report from the east. Get off the open street and check the far approach.', 'sniper'],
    ['Frag out.', 'frag'], ['Flashbang out.', 'flash'], ['Smoke out. Keep moving.', 'smoke'],
  ];
  for (const [text, category] of cases) assert.equal(squadVoiceCategory({ text }), category, text);
  for (const text of ['Chalk, stay together. Watch for civilians.', 'A helicopter is down. All chalks, stand by for new orders.',
    'The route may be clear, but a resident needs help.', 'Distant fire in the city.', 'Target destroyed.', '', 'Reload the supplies at the rally point.']) {
    assert.equal(squadVoiceCategory({ text }), null, text);
  }
  assert.equal(squadVoiceCategory(null), null);
});

test('speaker identity follows authoritative IDs, rejects the dead, and retains living casualty calls', () => {
  const hale = soldier(1, 0, 0, { name: 'Hale' }), webb = soldier(2, 100, 0, { name: 'Webb' });
  const state = { squad: [hale, webb] };
  assert.equal(findVoiceSpeaker(state, { speaker: 'HALE' }), hale);
  assert.equal(findVoiceSpeaker(state, { actorId: 2, speaker: 'HALE' }), webb, 'a display label cannot override a concrete source ID');
  assert.equal(findVoiceSpeaker(state, { speaker: 'RADIO' }), null);
  assert.equal(findVoiceSpeaker(state, { speaker: 'UNKNOWN' }), null);
  webb.downed = true;
  assert.equal(findVoiceSpeaker(state, { actorId: 2 }), webb, 'a living downed soldier can still call for help');
  webb.alive = false;
  assert.equal(findVoiceSpeaker(state, { actorId: 2, speaker: 'WEBB' }), null, 'no ghost source after death');
});

test('clear nearby voices are spatial, far voices use radio, and hysteresis prevents boundary chatter', () => {
  const listener = soldier(1, 0, 0), source = soldier(2, 239, 0);
  let route = squadVoiceRoute(open, source, listener, 'radio');
  assert.equal(route.mode, 'local'); assert.ok(route.pan > 0);
  assert.ok(route.gain > 0 && route.gain < 1);
  source.x = 260;
  assert.equal(squadVoiceRoute(open, source, listener, 'local').mode, 'local');
  assert.equal(squadVoiceRoute(open, source, listener, 'radio').mode, 'radio');
  source.x = 291;
  assert.equal(squadVoiceRoute(open, source, listener, 'local').mode, 'radio');
  source.x = 230;
  assert.equal(squadVoiceRoute(open, source, listener, 'radio').mode, 'local');
  source.x = -230;
  assert.ok(squadVoiceRoute(open, source, listener).pan < 0, 'the source side is audible');
  assert.equal(squadVoiceRoute(open, null, listener).mode, 'radio', 'HQ or other nonphysical speakers use the radio');
  route = squadVoiceRoute(open, listener, listener);
  assert.equal(route.mode, 'local'); assert.equal(route.pan, 0); assert.equal(route.gain, 1);
});

test('room and street speech have distinct timbre while a solid nearby partition selects radio', () => {
  const world = house(), speaker = soldier(1, 40, 40), listener = soldier(2, 100, 40);
  const indoor = squadVoiceRoute(world, speaker, listener), outdoor = squadVoiceRoute(open, speaker, listener);
  assert.equal(indoor.mode, 'local'); assert.equal(indoor.space.sourceKind, 'room');
  assert.ok(indoor.space.room > outdoor.space.room);
  assert.notEqual(indoor.highpass, outdoor.highpass);
  Object.assign(speaker, { x: 40, y: 70 }); Object.assign(listener, { x: 40, y: 130 });
  const divided = squadVoiceRoute(world, speaker, listener, 'local');
  assert.equal(divided.mode, 'radio'); assert.equal(divided.space.occluded, true);
  assert.equal(divided.portal, false, 'sharing a house does not bypass an intact partition');
});

test('an open doorway carries quieter indirect speech and a blocked doorway cannot fake that path', () => {
  const world = house(), speaker = soldier(1, 40, 40), listener = soldier(2, 0, -10);
  const heard = squadVoiceRoute(world, speaker, listener);
  assert.equal(heard.mode, 'local'); assert.equal(heard.space.occluded, true); assert.equal(heard.portal, true);
  assert.ok(heard.gain < squadVoiceRoute(open, speaker, listener).gain, 'detoured speech is quieter');
  assert.ok(heard.lowpass < squadVoiceRoute(open, speaker, listener).lowpass, 'doorway spill loses high frequencies');
  assert.ok(heard.pan > 0, 'speech arrives from the doorway to the listener’s right');
  world.walls.push({ id: 'door-block', x: 80, y: -2, w: 40, h: 4 });
  const blocked = squadVoiceRoute(world, speaker, listener, 'local');
  assert.equal(blocked.mode, 'radio'); assert.equal(blocked.portal, false);
});
