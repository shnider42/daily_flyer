import test from 'node:test';
import assert from 'node:assert/strict';
import { CombatFeedback, combatDirection, explosionStrength } from '../public/combat-feedback.mjs';
import { orientationFromEuler } from '../public/orientation.mjs';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
function flight(extra = {}) {
  return { mission: { id: 'feedback-flight' }, time: 10, aircraft: { health: 100 }, events: [], effects: [],
    player: { id: 'pilot', lifeId: 1, x: 0, y: 1000, z: 0, health: 100, orientation: orientationFromEuler(0, 0, 0) }, ...extra };
}
function hit(extra = {}) {
  return { id: 1, kind: 'damage', targetId: 'pilot', targetLifeId: 1, damageId: 1,
    damage: 20, health: 80, maxHealth: 100, weapon: 'gun', at: 10,
    source: { x: -200, y: 1000, z: 0 }, position: { x: 0, y: 1000, z: 0 }, ...extra };
}
function explosion(extra = {}) {
  return { id: 'blast-1', type: 'explosion', x: 60, y: 1000, z: 0, radius: 80, age: .05, life: 3, ...extra };
}
const isZeroKick = kick => Object.values(kick).every(value => value === 0);

test('received hits are addressed to our aircraft; another pilot being hit does not flash our HUD', () => {
  const sim = flight(), feedback = new CombatFeedback();
  sim.events = [hit({ targetId: 'wingmate' })];
  let view = feedback.update(sim, 1 / 60);
  assert.equal(view.visible, false); assert.equal(view.hit, 0); assert.equal(view.cues.length, 0);
  sim.events.push(hit({ id: 2, damageId: 2 })); sim.player.health = 80;
  view = feedback.update(sim, 1 / 60);
  assert.equal(view.visible, true); assert.ok(view.hit > 0);
  assert.equal(view.title, 'AIRFRAME HIT'); assert.match(view.detail, /FROM RIGHT.*80% AIRFRAME/);
  assert.equal(view.bearing, true); near(view.angle, 90);
  assert.equal(view.cues.length, 1); assert.equal(view.cues[0].kind, 'hit');
  assert.equal(view.cues[0].details.pan, 1);
});

test('event and lastDamage are one impact, and repeated snapshot objects never replay it', () => {
  const single = flight({ events: [hit()] }); single.player.health = 80;
  const baseline = new CombatFeedback().update(single, .016).hit;
  const sim = structuredClone(single), feedback = new CombatFeedback();
  sim.player.lastDamage = { ...hit(), eventId: 1 };
  sim.localParticipant = { lastDamage: structuredClone(sim.player.lastDamage) };
  const before = structuredClone(sim);
  const first = feedback.update(sim, .016);
  near(first.hit, baseline); assert.equal(first.cues.length, 1);
  assert.deepEqual(sim, before, 'presentation must not mutate authoritative receipts or health');
  sim.events = structuredClone(sim.events); sim.localParticipant.lastDamage = structuredClone(sim.localParticipant.lastDamage);
  const repeated = feedback.update(sim, .1);
  assert.equal(repeated.cues.length, 0); assert.ok(repeated.hit < first.hit);
  assert.equal(sim.player.health, 80);
});

test('a retained participant receipt supplies feedback after the network event tail drops the hit', () => {
  const receipt = { ...hit({ id: 42, weapon: 'missile', damage: 45, health: 55 }), eventId: 42 };
  const sim = flight({ events: [{ id: 99, kind: 'radio', text: 'Other traffic' }], localParticipant: { lastDamage: receipt } });
  sim.player.health = 55;
  const feedback = new CombatFeedback(), view = feedback.update(sim, .016);
  assert.equal(view.visible, true); assert.equal(view.title, 'MISSILE HIT');
  assert.equal(view.cues[0].details.weapon, 'missile'); assert.match(view.detail, /55% AIRFRAME/);
  assert.equal(feedback.update(sim, .016).cues.length, 0);
});

test('old receipts stay quiet on reconnect and cannot flash a respawned aircraft', () => {
  const sim = flight({ events: [hit({ at: 8 })] }), feedback = new CombatFeedback();
  assert.equal(feedback.update(sim, .016).visible, false);
  sim.events = [hit({ id: 2, at: 10 })]; sim.player.health = 80;
  assert.equal(feedback.update(sim, .016).visible, true);
  sim.player.lifeId = 2; sim.player.health = 100;
  sim.player.lastDamage = { ...hit({ id: 2 }), eventId: 2 };
  const respawn = feedback.update(sim, .016);
  assert.equal(respawn.visible, false); assert.equal(respawn.hit, 0); assert.equal(respawn.cues.length, 0);
  sim.player.health = 80; sim.events.push(hit({ id: 3, targetLifeId: 2, damageId: 4 }));
  assert.equal(feedback.update(sim, .016).cues.length, 1);
});

test('a new sortie can reuse event numbers without suppressing its first real hit', () => {
  const sim = flight({ multiplayer: { runId: 'first-sortie' }, events: [hit()] }), feedback = new CombatFeedback();
  assert.equal(feedback.update(sim, .016).cues.length, 1);
  assert.equal(feedback.update(sim, .016).cues.length, 0);
  sim.multiplayer.runId = 'second-sortie';
  assert.equal(feedback.update(sim, .016).cues.length, 1);
});

test('AC-130 crew feedback follows the shared pilot aircraft ID rather than the gunner connection', () => {
  const sim = flight({ mission: { id: 'gunship-nightwatch' }, events: [hit({ targetId: 'gunner-client' })] });
  sim.player.id = 'host-aircraft';
  const feedback = new CombatFeedback();
  assert.equal(feedback.update(sim, .016).cues.length, 0);
  sim.events.push(hit({ id: 2, targetId: 'host-aircraft', weapon: 'flak' }));
  const view = feedback.update(sim, .016);
  assert.equal(view.title, 'FLAK HIT'); assert.equal(view.cues.length, 1);
});

test('direction uses aircraft-local axes through heading changes and inverted flight', () => {
  const p = flight().player;
  assert.equal(combatDirection({ x: -100, y: 1000, z: 0 }, p).label, 'RIGHT');
  assert.equal(combatDirection({ x: 0, y: 1100, z: 0 }, p).label, 'ABOVE');
  p.orientation = orientationFromEuler(0, 0, Math.PI);
  const inverted = combatDirection({ x: -100, y: 1000, z: 0 }, p);
  assert.equal(inverted.label, 'LEFT'); near(inverted.pan, -1);
  assert.equal(combatDirection({ x: 0, y: 1100, z: 0 }, p).label, 'BELOW');
  p.orientation = orientationFromEuler(Math.PI / 2, 0, 0);
  assert.equal(combatDirection({ x: 100, y: 1000, z: 0 }, p).label, 'AHEAD');
  assert.equal(combatDirection({ x: -100, y: 1000, z: 0 }, p).label, 'BEHIND');
  assert.equal(combatDirection({ x: 0, y: 1000, z: 0 }, p).known, false);
});

test('a side-facing camera supplies its own direction and stereo axes', () => {
  const p = flight().player;
  const camera = { matrixWorld: { elements: [0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 1000, 0, 1] } };
  assert.equal(combatDirection({ x: 100, y: 1000, z: 0 }, p, camera).label, 'AHEAD');
  const right = combatDirection({ x: 0, y: 1000, z: 100 }, p, camera);
  assert.equal(right.label, 'RIGHT'); near(right.angle, 90); near(right.pan, 1);
  assert.equal(combatDirection({ x: -100, y: 1000, z: 0 }, p, camera).label, 'BEHIND');
  assert.equal(combatDirection({ x: 0, y: 900, z: 0 }, p, camera).label, 'BELOW');
});

test('near explosions have a local concussion; distant blasts fade and duplicate effects stay quiet', () => {
  const sim = flight(), feedback = new CombatFeedback(), nearBlast = explosion();
  const close = explosionStrength(nearBlast, sim.player), distant = explosionStrength(explosion({ x: 100000 }), sim.player);
  assert.ok(close.intensity > distant.intensity); assert.ok(close.proximity > 0); assert.equal(distant.proximity, 0);
  sim.effects = [nearBlast];
  const first = feedback.update(sim, .016);
  assert.equal(first.cues.length, 1); assert.equal(first.cues[0].kind, 'explosion');
  assert.ok(first.blast > 0); assert.equal(first.visible, false, 'a nearby blast is not a claimed aircraft hit');
  sim.effects = [{ ...nearBlast, age: .2 }, explosion({ id: 'far-blast', x: 100000 })];
  assert.equal(feedback.update(sim, .016).cues.length, 0);
  const farOnly = flight({ effects: [explosion({ x: 1000 })] });
  const farView = new CombatFeedback().update(farOnly, .016);
  assert.equal(farView.cues.length, 1); assert.equal(farView.blast, 0); assert.equal(isZeroKick(farView.kick), true);
});

test('stale smoke-phase explosions do not replay and overlapping blast layers produce one boom', () => {
  const sim = flight({ effects: [explosion({ age: 1.1 })] }), feedback = new CombatFeedback();
  assert.equal(feedback.update(sim, .016).cues.length, 0);
  sim.effects = [explosion({ age: .1 })];
  assert.equal(feedback.update(sim, .016).cues.length, 0, 'an older snapshot cannot make an already-seen burst new');
  sim.effects = [explosion({ id: 'missile-burst', x: 30 }), explosion({ id: 'airframe-burst', x: 32, radius: 105 })];
  assert.equal(feedback.update(sim, .016).cues.length, 1);
});

test('reduced motion retains the readable hit warning and audio while removing camera kick', () => {
  const sim = flight({ events: [hit()], effects: [explosion()] }); sim.player.health = 80;
  const normal = new CombatFeedback().update(sim, .016);
  const reduced = new CombatFeedback().update(sim, .016, { reducedMotion: true });
  assert.equal(reduced.visible, true); assert.equal(reduced.bearing, true); assert.equal(reduced.title, normal.title);
  assert.ok(reduced.hit > 0 && reduced.hit < normal.hit); assert.ok(reduced.blast > 0 && reduced.blast < normal.blast);
  assert.equal(reduced.cues.length, normal.cues.length); assert.equal(isZeroKick(reduced.kick), true);
  assert.equal(isZeroKick(normal.kick), false);
});

test('pause consumes pending effects without playing them later; spectating never jolts the watched camera', () => {
  const sim = flight({ events: [hit()], effects: [explosion()] }), feedback = new CombatFeedback();
  const paused = feedback.update(sim, .016, { suspended: true });
  assert.equal(paused.visible, false); assert.equal(paused.hit, 0); assert.equal(paused.blast, 0); assert.equal(paused.cues.length, 0);
  assert.equal(feedback.update(sim, .016).cues.length, 0);
  sim.player.health = 0; sim.events = [hit({ id: 2, damage: 100, health: 0, weapon: 'missile' })];
  sim.effects = [explosion({ id: 'destruction', x: 0 })];
  const watched = { ...sim.player, id: 'wingmate', x: 10000, health: 100 };
  const dead = feedback.update(sim, .016, { spectating: true, listener: watched });
  assert.equal(dead.title, 'AIRCRAFT DESTROYED'); assert.equal(isZeroKick(dead.kick), true);
  assert.ok(dead.cues.some(cue => cue.kind === 'explosion' && cue.details.distance === 0), 'own destruction stays audible on the spectator transition');
});
