import test from 'node:test';
import assert from 'node:assert/strict';
import { quietEarthSites, QUIET_EARTH_BEATS } from '../dist/quiet-earth-content.mjs';
import { normalizeQuietEarthState, applyQuietEarthConsequences, stepQuietEarthEncounter, quietEarthStatus } from '../dist/quiet-earth-rules.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
function fixture() {
  const site = quietEarthSites({ id: 'morrow', name: 'Morrow', kind: 'planet', systemId: 'hearth' })[0];
  assert.ok(site);
  const state = { id: site.key, time: 0, choices: {}, story: { readRecords: [], revision: 0 },
    monsters: site.hostiles.map((actor, index) => ({ ...actor, id: `${site.key}:actor:${actor.id}`, health: 80 + index, maxHealth: 80 + index,
      status: 'alive', alert: false, aggressors: [], cooldown: 0 })), quietEarth: normalizeQuietEarthState(site) };
  const actor = { id: 'one', person: { x: QUIET_EARTH_BEATS[0].x, y: QUIET_EARTH_BEATS[0].y, health: 100, down: false } };
  const events = [], emit = (type, detail) => events.push({ type, ...detail });
  const step = (actors = [actor], dt = 1 / 30) => stepQuietEarthEncounter(state, actors, dt, { site }, emit);
  applyQuietEarthConsequences(state, site);
  return { site, state, actor, events, step };
}
function searchCompleted(f) {
  f.state.choices = { 'check-in': 'begin', breaker: 'restore' };
  f.state.story.readRecords = ['voices', 'service'];
}
function trigger(f) { searchCompleted(f); f.state.choices.receiver = 'copy'; applyQuietEarthConsequences(f.state, f.site); }

test('only known cue receipts survive restore; stored phase and actor data cannot advance the campaign', () => {
  const f = fixture(), first = QUIET_EARTH_BEATS[0].id;
  const result = normalizeQuietEarthState(f.site, { version: 900, cues: [first, first, 'ambush', null, {}, 'invented'],
    ambushAnnounced: 'true', escapeAnnounced: 1, phase: 'escape', monsters: [{ health: 0 }], rewards: 99999 });
  assert.deepEqual(result, { version: 1, cues: [first], ambushAnnounced: false, escapeAnnounced: false });
  assert.equal(normalizeQuietEarthState({ id: 'other' }, {}), null);
  f.state.quietEarth = result;
  f.state.choices.receiver = 'copy';
  applyQuietEarthConsequences(f.state, f.site);
  assert.equal(quietEarthStatus(f.state, f.site).phase, 'quiet');
  assert.ok(f.state.monsters.every(actor => actor.hidden && actor.pacified && actor.quietEarthDormant));
});

test('search remains harmless until the supported receiver action; activation never heals killed actors', () => {
  const f = fixture(), health = f.state.monsters.map(actor => actor.health);
  searchCompleted(f); applyQuietEarthConsequences(f.state, f.site);
  assert.equal(quietEarthStatus(f.state, f.site).threats, 0);
  assert.ok(f.state.monsters.every(actor => !actor.hostileToPlayer && !actor.alert));
  f.state.monsters[1].health = 0; f.state.monsters[1].status = 'dead';
  trigger(f);
  assert.equal(quietEarthStatus(f.state, f.site).phase, 'escape');
  assert.equal(quietEarthStatus(f.state, f.site).threats, 3);
  assert.ok(f.state.monsters.filter(actor => actor.health > 0).every(actor => !actor.hidden && !actor.pacified && actor.alert));
  assert.equal(f.state.monsters[1].health, 0);
  const restored = clone(f.state);
  restored.quietEarth = normalizeQuietEarthState(f.site, restored.quietEarth);
  // The general restore path rebuilds actors from their authored dormant base.
  for (const actor of restored.monsters) actor.quietEarthDormant = true;
  applyQuietEarthConsequences(restored, f.site);
  assert.equal(restored.monsters[1].health, 0);
  assert.equal(restored.monsters[1].status, 'dead');
  assert.equal(restored.monsters[0].health, health[0]);
  assert.equal(restored.monsters[2].health, health[2]);
  assert.equal(restored.cleared, false);
});

test('both false alarms happen at their actual locations once per shared site, without damage', () => {
  const f = fixture();
  f.step(); assert.equal(f.events.length, 0, 'no cue before checking in');
  f.state.choices['check-in'] = 'begin';
  const crew = [f.actor, ...[2, 3, 4].map(id => ({ id: String(id), person: { ...f.actor.person } }))];
  f.step(crew); f.step(crew);
  assert.equal(f.events.length, 1);
  assert.equal(f.events[0].beatId, QUIET_EARTH_BEATS[0].id);
  assert.equal(f.events[0].harmless, true);
  assert.ok(crew.every(actor => actor.person.health === 100));
  const second = QUIET_EARTH_BEATS[1];
  Object.assign(f.actor.person, { x: second.x, y: second.y });
  f.step(); f.step();
  assert.deepEqual(f.events.map(event => event.beatId), QUIET_EARTH_BEATS.map(beat => beat.id));
  assert.ok(f.events.every(event => event.type === 'quiet-earth-beat' && event.phase === 'quiet' && !Object.hasOwn(event, 'damage')));
  assert.ok(f.state.monsters.every(actor => actor.hidden && actor.pacified));
});

test('empty, paused, downed, or protected visits cannot consume narrative cues', () => {
  const f = fixture(); f.state.choices['check-in'] = 'begin';
  const before = clone(f.state);
  f.step([]); f.step([f.actor], 0); f.step([f.actor], NaN);
  f.step([{ ...f.actor, person: { ...f.actor.person, down: true } }]);
  f.step([{ ...f.actor, person: { ...f.actor.person, health: 0 } }]);
  f.step([{ ...f.actor, protected: true }]);
  assert.deepEqual(f.state, before); assert.deepEqual(f.events, []);
  f.step(); assert.equal(f.events.length, 1);
});

test('the ambush is announced once, remains earned after reload, and cannot replay quiet false alarms', () => {
  const f = fixture(); trigger(f);
  f.step([]); assert.equal(f.state.quietEarth.ambushAnnounced, false);
  f.step(); f.step();
  assert.equal(f.events.length, 1);
  assert.equal(f.events[0].beatId, 'ambush');
  assert.equal(f.events[0].phase, 'escape');
  assert.match(f.events[0].text, /GET BACK TO THE ENTRY/);
  f.state.quietEarth = normalizeQuietEarthState(f.site, clone(f.state.quietEarth));
  Object.assign(f.actor.person, { x: QUIET_EARTH_BEATS[1].x, y: QUIET_EARTH_BEATS[1].y });
  f.step(); assert.equal(f.events.length, 1);
  assert.deepEqual(f.state.quietEarth.cues, []);
});

test('sealing the entry completes the escape with every hostile alive and never grants another reward', () => {
  const f = fixture(); trigger(f);
  const health = f.state.monsters.map(actor => actor.health);
  f.state.choices.evacuate = 'seal';
  applyQuietEarthConsequences(f.state, f.site); f.step(); f.step();
  const view = quietEarthStatus(f.state, f.site);
  assert.equal(view.completed, true); assert.equal(view.phase, 'complete'); assert.equal(view.threats, 0);
  assert.ok(f.state.monsters.every(actor => actor.hidden && actor.pacified && !actor.hostileToPlayer));
  assert.deepEqual(f.state.monsters.map(actor => actor.health), health);
  assert.equal(f.events.filter(event => event.beatId === 'escaped').length, 1);
  assert.ok(!f.events.some(event => Object.hasOwn(event, 'credits') || Object.hasOwn(event, 'reward')));
  f.state.quietEarth = normalizeQuietEarthState(f.site, clone(f.state.quietEarth));
  f.step(); assert.equal(f.events.length, 1);
});

test('the objective advances through the actual evidence and then points back to the entry', () => {
  const f = fixture(), view = () => quietEarthStatus(f.state, f.site);
  assert.equal(view().nextTargetId, `${f.site.key}:choice:check-in`);
  f.state.choices['check-in'] = 'begin';
  assert.equal(view().nextTargetId, `${f.site.key}:record:voices`);
  f.state.story.readRecords.push('voices');
  assert.equal(view().nextTargetId, `${f.site.key}:choice:breaker`);
  f.state.choices.breaker = 'restore';
  assert.equal(view().nextTargetId, `${f.site.key}:record:service`);
  f.state.story.readRecords.push('service');
  assert.equal(view().nextTargetId, `${f.site.key}:choice:receiver`);
  f.state.choices.receiver = 'copy';
  assert.equal(view().nextTargetId, `${f.site.key}:choice:evacuate`);
  assert.equal(view().objective, 'Get back to the entry. Follow the green lights. You do not have to kill them.');
  assert.equal(view().completedTasks, 3);
  const before = JSON.stringify(f.state); view(); view(); assert.equal(JSON.stringify(f.state), before, 'reading the HUD does not advance the mission');
});
