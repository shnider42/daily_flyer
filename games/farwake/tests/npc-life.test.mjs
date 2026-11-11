import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSurface, isWalkable, drawSurface } from '../dist/surface.mjs';
import { explorationLocation } from '../dist/exploration.mjs';
import { updateNpcLife, npcLifeActors, npcClock, makeNpcHold, NPC_DAY_SECONDS } from '../dist/npc-life.mjs';

const poses = surface => npcLifeActors(surface).map(entity => ({ id: entity.id, x: entity.x, y: entity.y, facing: entity.facing, moving: entity.moving, life: entity.life }));

test('four independent observers share a deterministic day and the same real NPC positions', () => {
  const places = Array.from({ length: 4 }, () => generateSurface('kettle', 'shared-life'));
  for (const time of [0, 26.5, 119.2, 389, 721, 1439.9, 1440, 40001.75]) {
    for (const surface of places) updateNpcLife(surface, time);
    for (const surface of places.slice(1)) assert.deepEqual(poses(surface), poses(places[0]));
  }
  const original = poses(places[0]);
  updateNpcLife(places[0], 40001.75 + NPC_DAY_SECONDS);
  assert.deepEqual(poses(places[0]).map(({ life, ...pose }) => pose), original.map(({ life, ...pose }) => pose));
  assert.equal(npcClock(0, 'kettle').text, npcClock(NPC_DAY_SECONDS, { id: 'kettle' }).text);
  assert.equal(npcClock(NPC_DAY_SECONDS, 'kettle').day, npcClock(0, 'kettle').day + 1);
});

for (const id of ['kettle', 'morrow', 'listening', 'earth', 'ledger']) test(`${id}: a full day stays on reachable floor and changes phases without teleporting`, () => {
  const surface = generateSurface(id, 'routine-collision'), previous = new Map(), activities = new Set();
  for (let seconds = 0; seconds <= NPC_DAY_SECONDS + 1; seconds += .5) {
    updateNpcLife(surface, seconds);
    for (const entity of npcLifeActors(surface)) {
      assert.ok(isWalkable(surface, entity.x, entity.y), `${entity.id} at ${seconds} crosses furniture or a wall`);
      const before = previous.get(entity.id);
      if (before) assert.ok(Math.hypot(entity.x - before.x, entity.y - before.y) <= 17, `${entity.id} snaps at ${seconds}`);
      previous.set(entity.id, { x: entity.x, y: entity.y }); activities.add(entity.life.activity);
      assert.equal(entity.hidden, undefined, 'a work/rest schedule cannot hide a service or quest contact');
    }
  }
  for (const activity of ['walking', 'working', 'eating', 'resting', 'sleeping']) assert.ok(activities.has(activity), `${id} never shows ${activity}`);
});

test('Len’s authored night-shift job is reflected in his schedule and physical dispatch errands', () => {
  const surface = generateSurface('kettle', 'night-shift');
  updateNpcLife(surface, 180); // Local late morning.
  const len = npcLifeActors(surface).find(entity => entity.id === 'quest:len-vale');
  assert.equal(npcClock(180, surface).period, 'morning');
  assert.equal(len.life.phase, 'rest');
  updateNpcLife(surface, 1080); // Local early morning, night watch still working.
  assert.equal(npcClock(1080, surface).period, 'night');
  assert.equal(len.life.phase, 'work');
  assert.match(len.life.task, /departures|flight plans/);
});

test('conversation holds freeze the visible route and resume continuously without shortcuts or lasting drift', () => {
  const surface = generateSurface('kettle', 'held-life'), second = generateSurface('kettle', 'held-life');
  let seconds = 0, actor;
  for (; seconds < 200; seconds += .5) {
    updateNpcLife(surface, seconds);
    actor = npcLifeActors(surface).find(entity => entity.id === 'kettle:dockworker' && entity.moving);
    if (actor) break;
  }
  assert.ok(actor, 'dockworker makes actual walking trips');
  const hold = makeNpcHold(surface, actor.id, seconds, 20), initial = { x: actor.x, y: actor.y };
  let previous = initial;
  for (let at = seconds; at <= hold.resumeAt + .5; at += .1) {
    updateNpcLife(surface, at, { holds: [hold] });
    updateNpcLife(second, at, { holds: [hold] });
    assert.deepEqual(poses(surface), poses(second), 'late observer sees the same conversation/recovery');
    if (at <= hold.until) assert.deepEqual({ x: actor.x, y: actor.y }, initial);
    assert.ok(Math.hypot(actor.x - previous.x, actor.y - previous.y) < 7, 'hold/recovery boundary never teleports');
    assert.ok(isWalkable(surface, actor.x, actor.y));
    previous = { x: actor.x, y: actor.y };
  }
  updateNpcLife(surface, hold.resumeAt, { holds: [hold] });
  updateNpcLife(second, hold.resumeAt);
  assert.deepEqual(poses(surface), poses(second), 'expired hold needs no permanent per-NPC offset');
});

test('service kiosks remain fixed and ambient routes never take over ships or boarded actors', () => {
  const station = generateSurface('kettle', 'kiosks');
  const kiosks = station.entities.filter(entity => entity.data?.serviceDesk);
  assert.equal(kiosks.length, 3);
  const initial = kiosks.map(entity => ({ ...entity }));
  updateNpcLife(station, 900);
  assert.deepEqual(kiosks, initial);
  assert.ok(kiosks.every(entity => entity.data.automated && !entity.life));
  const ship = generateSurface({ id: 'ship:crew', kind: 'ship', shipClass: 'capital', crew: [{ id: 'medic', role: 'medic', health: 100, name: 'Tavi' }], guests: [{ id: 'guest', name: 'Survivor', health: 100 }] }, 'ship');
  const before = JSON.stringify(ship);
  updateNpcLife(ship, 1234);
  assert.equal(npcLifeActors(ship).length, 0);
  assert.equal(JSON.stringify(ship), before);
  assert.equal(makeNpcHold(station, kiosks[0].id, 12), null);
});

test('residents of an explorable clinic use its floor and keep their existing identity', () => {
  const location = explorationLocation({ id: 'lilt', name: 'Lilt', kind: 'planet', systemId: 'vesper' }, 'tide-clinic', 'clinic-life');
  assert.ok(location);
  const surface = generateSurface(location, 'clinic-life'), ids = surface.entities.map(entity => entity.id);
  assert.ok(npcLifeActors(surface).length > 0);
  for (const seconds of [0, 359, 718, 1439]) {
    updateNpcLife(surface, seconds);
    assert.deepEqual(surface.entities.map(entity => entity.id), ids);
    for (const entity of npcLifeActors(surface)) assert.ok(isWalkable(surface, entity.x, entity.y));
  }
});

test('rendered activity is concise and limited to the nearby or tracked person', () => {
  const surface = generateSurface('kettle', 'visible-work'); updateNpcLife(surface, 0);
  const actor = npcLifeActors(surface).find(entity => entity.id === 'kettle:dockworker');
  const context = { canvas: { width: 800, height: 700 }, save() {}, restore() {}, fillRect() {}, fillText() {}, translate() {}, scale() {}, setLineDash() {}, strokeRect() {}, measureText(s) { return { width: String(s).length * 5 }; } };
  const labels = [], before = JSON.stringify(surface);
  drawSurface(context, surface, { person: { x: actor.x, y: actor.y + 20 }, width: 800, height: 700, labels, time: 2 });
  const cues = labels.filter(label => label.kind === 'npc-activity');
  assert.ok(cues.length <= 1, 'ambient residents do not fill the screen with status labels');
  assert.ok(cues.every(label => label.text.length <= 24 && label.size >= 12));
  assert.equal(JSON.stringify(surface), before, 'rendering is read-only');
});
