import test from 'node:test';
import assert from 'node:assert/strict';
import { enemyInSharedSight, rayWallDistance, SharedSightLayer, sightObservers, sightPolygon, squadCanSeePoint } from '../public/visibility.mjs';

function fixture() {
  const observer = { id: 'lead', role: 'leader', x: 50, y: 300, angle: 0, alive: true };
  const state = { seed: 17, missionIndex: 0, time: 0, world: { width: 2000, height: 1600, walls: [] }, squad: [observer], smokes: [] };
  return { state, observer };
}

function inside(point, polygon) {
  let result = false;
  for (let i = 0, j = polygon.points.length - 1; i < polygon.points.length; j = i++) {
    const a = polygon.points[i], b = polygon.points[j];
    if (((a.y > point.y) !== (b.y > point.y)) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}

test('shared sight enters a real doorway but cannot cross either wall beside it', () => {
  const { state, observer } = fixture();
  state.world.walls = [
    { x: 150, y: 0, w: 10, h: 260 },
    { x: 150, y: 340, w: 10, h: 1260 },
  ];
  assert.equal(squadCanSeePoint(state, { x: 350, y: 300 }), true);
  assert.equal(squadCanSeePoint(state, { x: 350, y: 80 }), false);
  assert.equal(squadCanSeePoint(state, { x: 350, y: 520 }), false);
  const polygon = sightPolygon(state, observer);
  assert.equal(inside({ x: 350, y: 300 }, polygon), true, 'the open door produces a visible cone');
  assert.equal(inside({ x: 350, y: 80 }, polygon), false);
  assert.equal(inside({ x: 350, y: 520 }, polygon), false);
  // Sample the terrain behind the wall, away from the antialiased boundary.
  for (let x = 180; x < 540; x += 20) for (let y = 30; y < 570; y += 20) {
    if (inside({ x, y }, polygon)) assert.equal(squadCanSeePoint(state, { x, y }), true, `polygon leaked at ${x},${y}`);
  }
});

test('a second living teammate shares sight while casualties and removed actors cannot scout', () => {
  const { state } = fixture();
  const point = { x: 350, y: 300 };
  state.world.walls = [{ x: 150, y: 0, w: 10, h: 1600 }];
  const ally = { id: 'medic', role: 'medic', x: 400, y: 300, alive: true };
  state.squad.push(ally);
  assert.equal(squadCanSeePoint(state, point), true);
  ally.downed = true;
  assert.equal(squadCanSeePoint(state, point), false);
  assert.deepEqual(sightObservers(state).map(actor => actor.id), ['lead']);
  ally.downed = false; ally.alive = false;
  assert.equal(squadCanSeePoint(state, point), false);
  state.squad[0].alive = false;
  assert.equal(enemyInSharedSight(state, { ...point, visible: true }), false);
});

test('smoke occludes terrain and contacts, including a stale authoritative reveal', () => {
  const { state, observer } = fixture(), point = { x: 450, y: 300 };
  state.smokes = [{ x: 250, y: 300, radius: 90, ttl: 10 }];
  assert.equal(squadCanSeePoint(state, point), false);
  assert.equal(enemyInSharedSight(state, { ...point, visible: true }), false);
  assert.equal(inside(point, sightPolygon(state, observer)), false);
  assert.equal(squadCanSeePoint(state, { x: 90, y: 300 }), true, 'nearby clear ground remains visible');
  state.smokes[0].ttl = .5;
  assert.equal(squadCanSeePoint(state, point), true, 'fading smoke follows the simulation visibility rule');
  assert.equal(inside(point, sightPolygon(state, observer)), true);
});

test('authority hides contacts and fresh wall geometry still blocks an old visible flag', () => {
  const { state } = fixture(), actor = { x: 400, y: 300, visible: false };
  assert.equal(enemyInSharedSight(state, actor), false);
  actor.visible = true;
  assert.equal(enemyInSharedSight(state, actor), true);
  state.world.walls.push({ x: 150, y: 0, w: 10, h: 1600 });
  assert.equal(enemyInSharedSight(state, actor), false);
  state.world.walls.length = 0;
  actor.x = 760;
  assert.equal(enemyInSharedSight(state, actor), true, 'authority may reveal a sighted charging sniper beyond ordinary vision');
  delete actor.visible;
  assert.equal(enemyInSharedSight(state, actor), false, 'local fallback cannot invent that longer reveal');
});

test('grenadier binoculars extend only the facing cone and preserve shorter night sight', () => {
  const { state, observer } = fixture();
  observer.role = 'grenadier'; observer.x = 900; observer.y = 800;
  const ahead = { x: 1600, y: 800 }, behind = { x: 200, y: 800 };
  assert.equal(squadCanSeePoint(state, ahead), false);
  observer.observing = true;
  assert.equal(squadCanSeePoint(state, ahead), true);
  assert.equal(squadCanSeePoint(state, behind), false);
  assert.equal(inside(ahead, sightPolygon(state, observer)), true);
  assert.equal(inside(behind, sightPolygon(state, observer)), false);
  for (const [angle, expected] of [[.54, true], [.56, false]]) {
    assert.equal(squadCanSeePoint(state, { x: observer.x + Math.cos(angle) * 700, y: observer.y + Math.sin(angle) * 700 }), expected);
  }
  observer.angle = Math.PI;
  assert.equal(squadCanSeePoint(state, ahead), false);
  assert.equal(squadCanSeePoint(state, behind), true);
  observer.angle = 0; state.missionIndex = 2;
  assert.equal(squadCanSeePoint(state, ahead), false, 'night binocular range remains limited');
  assert.equal(squadCanSeePoint(state, { x: 1500, y: 800 }), true);
  observer.observing = false;
  assert.equal(squadCanSeePoint(state, { x: 1320, y: 800 }), false);
  state.missionIndex = 0;
  assert.equal(squadCanSeePoint(state, { x: 1320, y: 800 }), true);
});

function fakeCanvas(width, height) {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (target, key) => key in target ? target[key] : (...args) => calls.push({ method: key, args, composite: target.globalCompositeOperation, fill: target.fillStyle }),
    set: (target, key, value) => { target[key] = value; return true; },
  });
  return { width, height, calls, getContext: () => ctx };
}

test('the low-resolution mask is bounded, throttled, and retains terrain memory across co-op snapshots', () => {
  const { state, observer } = fixture();
  state.world.width = 8000; state.world.height = 5000;
  const layer = new SharedSightLayer({ createCanvas: fakeCanvas });
  assert.equal(layer.update(state, 1), true);
  assert.equal(layer.width, 640); assert.equal(layer.height, 400);
  const memory = layer.remembered, current = layer.current, polygons = layer.polygons;
  const clears = () => memory.calls.filter(call => call.method === 'clearRect').length;
  assert.equal(clears(), 1);
  observer.x += 50;
  assert.equal(layer.update(state, 1.05), false);
  assert.equal(layer.update(state, 1.12), false);
  assert.equal(layer.polygons, polygons, 'no ray casts between the eight-per-second refreshes');
  state.world = { ...state.world };
  assert.equal(layer.update(state, 1.125), true);
  assert.notEqual(layer.polygons, polygons);
  assert.equal(layer.remembered, memory); assert.equal(layer.current, current);
  assert.equal(clears(), 1, 'a same-seed network snapshot cannot erase explored terrain');
  assert.equal(layer.resetCount, 1);
  assert.equal(layer.revision, 2);
  const composition = layer.overlay.calls.filter(call => call.method === 'drawImage');
  assert.ok(composition.some(call => call.args[0] === memory && call.composite === 'destination-out'));
  assert.ok(composition.some(call => call.args[0] === current && call.composite === 'destination-out'));
  const target = fakeCanvas(1440, 900);
  layer.draw(target.getContext('2d'), { left: 120, top: 200, right: 820, bottom: 900 });
  const draw = target.calls.find(call => call.method === 'drawImage');
  assert.deepEqual(draw.args.slice(1), [9.6, 16, 56, 56, 120, 200, 700, 700], 'only the visible crop is upsampled');
});

test('new missions, restarted time and layout revisions reset memory; role and smoke changes refresh the current mask', () => {
  const { state, observer } = fixture();
  const layer = new SharedSightLayer({ createCanvas: fakeCanvas });
  layer.update(state, 10);
  state.seed++;
  layer.update(state, 10.01);
  assert.equal(layer.resetCount, 2);
  layer.update(state, 0);
  assert.equal(layer.resetCount, 3);
  state.world.layoutVersion = 2;
  layer.update(state, .01);
  assert.equal(layer.resetCount, 4);
  observer.role = 'grenadier'; observer.observing = true;
  layer.update(state, .135);
  assert.equal(inside({ x: 800, y: 300 }, layer.polygons[0]), true);
  state.smokes.push({ x: 260, y: 300, radius: 90, ttl: 10 });
  layer.update(state, .26);
  assert.equal(inside({ x: 800, y: 300 }, layer.polygons[0]), false);
  observer.downed = true;
  layer.update(state, .385);
  assert.deepEqual(layer.polygons, []);
  assert.equal(layer.resetCount, 4, 'losing current sight does not forget previously visited ground');
});

test('parallel and zero-length wall intersections remain finite and conservative', () => {
  const wall = { x: 100, y: 100, w: 20, h: 80 };
  assert.equal(rayWallDistance(50, 140, 1, 0, wall, 500), 50);
  assert.equal(rayWallDistance(50, 90, 1, 0, wall, 500), 500);
  assert.equal(rayWallDistance(110, 50, 0, 1, wall, 500), 50);
  assert.equal(rayWallDistance(110, 140, 1, 0, wall, 500), 0);
  assert.equal(rayWallDistance(110, 190, 0, 1, wall, 500), 500);
});
