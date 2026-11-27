import test from 'node:test';
import assert from 'node:assert/strict';
import { updateHostileShouts, HOSTILE_SHOUT_POLICY } from '../public/hostile-shouts.mjs';

function fixture(count = 9) {
  return { seed: 17, missionIndex: 0, status: 'playing', time: 0, maxEnemies: 19,
    squad: [{ id: 1, team: 'squad', x: 700, y: 200, alive: true }], allies: [],
    enemies: Array.from({ length: count }, (_, index) => ({ id: index + 10, team: 'enemy', x: 500, y: 200 + index * 2,
      alive: true, downed: false, visible: false, alert: true, target: 1, lastSeenAt: 0,
      ammo: 30, reloadTimer: 0, suppression: 0, fieldSquadId: 'cell-' + Math.floor(index / 3), tactic: 'fire', moving: false })) };
}
function run(state, seconds, configure = () => {}) {
  const events = [];
  const hooks = { soundEvent: (s, type, actor, extra) => events.push({ type, actorId: actor.id, group: actor.fieldSquadId,
    team: actor.team, x: actor.x, y: actor.y, time: s.time, ...extra }) };
  for (let i = 0; i <= seconds * 10; i++) {
    state.time = i / 10;
    for (const actor of state.enemies) actor.lastSeenAt = state.time;
    configure(state);
    updateHostileShouts(state, .1, hooks);
  }
  return events;
}

test('actual hostile contacts make rare deterministic positional calls with bounded actor, group and global cadence', () => {
  const state = fixture(), keys = Object.keys(state), events = run(state, 180);
  assert.ok(events.length >= 2 && events.length <= 12, 'several real contacts stay sparse over three minutes');
  assert.deepEqual(events, run(fixture(), 180), 'the authority does not depend on playback randomness');
  assert.deepEqual(Object.keys(state), keys, 'private cadence does not become snapshot data');
  for (let index = 0; index < events.length; index++) {
    const event = events[index], actor = state.enemies.find(value => value.id === event.actorId);
    assert.equal(event.type, 'hostile_shout'); assert.equal(event.team, 'enemy');
    assert.equal(event.sourceTime, event.time); assert.equal(event.alive, true);
    assert.equal(event.x, actor.x); assert.equal(event.y, actor.y); assert.equal(actor.visible, false);
    assert.equal(event.intent, 'contact'); assert.ok([0, 1].includes(event.variant));
    if (index) assert.ok(event.time - events[index - 1].time >= HOSTILE_SHOUT_POLICY.globalGap - 1e-8);
    const sameActor = events.slice(0, index).findLast(previous => previous.actorId === event.actorId);
    const sameGroup = events.slice(0, index).findLast(previous => previous.group === event.group);
    if (sameActor) assert.ok(event.time - sameActor.time >= HOSTILE_SHOUT_POLICY.actorGap - 1e-8);
    if (sameGroup) assert.ok(event.time - sameGroup.time >= HOSTILE_SHOUT_POLICY.groupGap - 1e-8);
  }
  assert.ok(state.enemies.every(actor => !Object.keys(actor).some(key => /shout|voice/i.test(key))));
});

test('alarms require current living contacts and never manufacture distant fighting, speech through a flash, or a retreat charge', () => {
  for (const change of [
    actor => { actor.target = null; }, actor => { actor.lastSeenAt = -100; },
    actor => { actor.alive = false; }, actor => { actor.downed = true; },
    actor => { actor.fieldRetreat = true; }, actor => { actor.reloadTimer = 3; },
    actor => { actor.ammo = 0; }, actor => { actor.suppression = .9; },
    actor => { actor.flashUntil = 999; actor.flashStartedAt = 0; actor.flashStrength = 1; },
  ]) {
    const events = run(fixture(), 120, state => state.enemies.forEach(change));
    assert.equal(events.length, 0);
  }
  for (const status of ['won', 'lost', 'menu']) {
    const state = fixture(); state.status = status;
    assert.equal(run(state, 120).length, 0);
  }
  const deadTarget = fixture(); deadTarget.squad[0].alive = false;
  assert.equal(run(deadTarget, 120).length, 0);
});

test('advance intent follows real movement toward a seen opponent, while missed or paused offers are discarded', () => {
  const state = fixture(3);
  const events = run(state, 120, s => {
    for (const actor of s.enemies) { actor.x += 2; actor.moving = true; actor.tactic = 'reposition'; }
    s.squad[0].x = s.enemies[0].x + 200;
  });
  assert.ok(events.length > 0); assert.ok(events.every(event => event.intent === 'advance'));
  state.paused = true;
  let called = false;
  updateHostileShouts(state, 1, { soundEvent: () => { called = true; } });
  assert.equal(called, false);
  state.paused = false; state.time += 60; state.enemies.forEach(actor => actor.target = null);
  updateHostileShouts(state, 1, { soundEvent: () => { called = true; } });
  assert.equal(called, false, 'a long pause cannot queue old contact calls');
});
