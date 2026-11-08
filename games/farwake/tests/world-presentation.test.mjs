import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldPresentation} from '../dist/world-presentation.mjs';
import {SpaceRenderer} from '../dist/space-art.mjs';

function packet(time, x, overrides = {}) {
  return {
    serverTime: time, room: {id: 'realm:system:hearth'},
    state: {systemId: 'hearth', boarding: null},
    world: {id: 'hearth', bodies: [], asteroids: [], signals: [], pickups: [], bullets: [],
      enemies: [{id: 'raider', x, y: 20, vx: 100, vy: 0, angle: 0, hp: 60}],
      traffic: [{id: 'freighter', x: x * .6, y: 40, speed: 60, angle: 0}]},
    ...overrides
  };
}
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} differs from ${expected}`);

test('NPC motion is continuous between 10 Hz snapshots without copying static world data', () => {
  const presentation = new WorldPresentation(), first = packet(1000, 0), second = packet(1100, 10);
  second.world.enemies[0].hp = 12;
  const originals = JSON.stringify([first, second]);
  presentation.push(first); presentation.push(second);
  const view = presentation.sample(1150);
  close(view.world.enemies[0].x, 5); close(view.world.traffic[0].x, 3);
  assert.equal(view.world.enemies[0].hp, 12, 'health comes from the current authority state');
  assert.equal(view.world.bodies, second.world.bodies, 'static geometry is reused');
  const positions = Array.from({length: 7}, (_, i) => presentation.sample(1100 + i * 100 / 6).world.enemies[0].x);
  for (let i = 1; i < positions.length; i++) close(positions[i] - positions[i - 1], 100 / 60);
  assert.equal(JSON.stringify([first, second]), originals);
});

test('authority simulation time is used and extrapolation freezes after a short bound', () => {
  const presentation = new WorldPresentation();
  presentation.push(packet(1200, 0, {simulatedAt: 1000}));
  presentation.push(packet(1300, 10, {simulatedAt: 1100}));
  close(presentation.sample(1150).world.enemies[0].x, 5);
  close(presentation.sample(1400).world.enemies[0].x, 25);
  close(presentation.sample(9000).world.enemies[0].x, 25);
  close(presentation.sample(9000).world.traffic[0].x, 15);
});

test('angle interpolation takes the short path and current removals never leave ghosts', () => {
  const presentation = new WorldPresentation(), first = packet(1000, 0), second = packet(1100, 10);
  first.world.enemies[0].angle = Math.PI - .1; second.world.enemies[0].angle = -Math.PI + .1;
  presentation.push(first); presentation.push(second);
  close(presentation.sample(1150).world.enemies[0].angle, Math.PI);
  const removed = packet(1200, 20); removed.world.enemies = [];
  presentation.push(removed); assert.equal(presentation.sample(1200).world.enemies.length, 0);
  assert.equal(presentation.push(first), false, 'late packets cannot resurrect removed entities');
});

test('room changes and teleports snap instead of sweeping through unrelated space', () => {
  const presentation = new WorldPresentation(); presentation.push(packet(1000, 0)); presentation.push(packet(1100, 1600));
  close(presentation.sample(1150).world.enemies[0].x, 1600);
  const arrival = packet(900, -50, {room: {id: 'realm:system:vesper'}, state: {systemId: 'vesper'}});
  assert.ok(presentation.push(arrival)); assert.equal(presentation.frames.length, 1);
  close(presentation.sample(900).world.enemies[0].x, -50);
  presentation.reset(); assert.deepEqual(presentation.sample(1200), {world: null, boardingActors: []});
});

test('anonymous bullets use bounded velocity and current membership rather than array-index pairing', () => {
  const presentation = new WorldPresentation(), first = packet(1000, 0), second = packet(1100, 10);
  first.world.bullets = [{owner: 'old', x: 500, y: 0, vx: -280, vy: 0, ttl: 2}];
  second.world.bullets = [{owner: 'new', x: 20, y: 0, vx: 280, vy: 40, ttl: 2}, {owner: 'expired', x: 0, y: 0, vx: 280, vy: 0, ttl: .05}];
  presentation.push(first); presentation.push(second);
  const bullets = presentation.sample(1200).world.bullets;
  assert.equal(bullets.length, 1); assert.equal(bullets[0].owner, 'new'); close(bullets[0].x, 48); close(bullets[0].y, 4);
  close(presentation.sample(1800).world.bullets[0].x, 62);
  assert.equal(second.world.bullets[0].x, 20); assert.equal(presentation.sample(3200).world.bullets.length, 0);
});

test('boarding actors interpolate only within the same active boarding action', () => {
  const presentation = new WorldPresentation(), make = (time, x, id = 'boarding-one') => packet(time, 0, {
    room: {id: 'realm:ship:cinder'}, state: {systemId: 'hearth', boarding: {id, startedAt: 4, phase: 'active', enemies: [{id: 'boarder', x, y: 100, health: 52}], allies: []}}
  });
  presentation.push(make(1000, 200)); presentation.push(make(1100, 205));
  const actor = presentation.sample(1150).boardingActors[0]; close(actor.x, 202.5); close(actor.vx, 50);
  presentation.push(make(1200, 450, 'boarding-two')); close(presentation.sample(1200).boardingActors[0].x, 450); close(presentation.sample(1500).boardingActors[0].x, 450);
  const complete = make(1300, 450, 'boarding-two'); complete.state.boarding.phase = 'won';
  presentation.push(complete); assert.equal(presentation.sample(1300).boardingActors.length, 0);
});

class FakeCanvas {
  constructor(width, height) { this.width = width; this.height = height; this.context = {canvas: this, save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, fillRect() {}, clearRect() {}, drawImage() {}, fillText() {}}; }
  getContext() { return this.context; }
}
test('camera follow has the same response at 30, 60 and 144 Hz and preserves world picking', () => {
  const original = globalThis.OffscreenCanvas; globalThis.OffscreenCanvas = FakeCanvas;
  try {
    const results = [];
    for (const fps of [30, 60, 144]) {
      const renderer = new SpaceRenderer(), ctx = new FakeCanvas(400, 300).context;
      const game = {state: {systemId: 'camera-test', ship: {id: 'cinder', x: 0, y: 0, hull: 100}}, system: {bodies: [], enemies: [], traffic: [], asteroids: [], signals: [], pickups: [], bullets: []}};
      renderer.draw(ctx, game, {time: 0, labels: []}); game.state.ship.x = 100;
      let view;
      for (let i = 1; i <= fps; i++) view = renderer.draw(ctx, game, {time: i / fps, labels: []});
      results.push(renderer.camera.x); close(renderer.camera.x, 100 * (1 - Math.pow(.88, 60)));
      assert.equal(view.offsetX, Math.round(200 - renderer.camera.x * view.zoom));
      assert.equal(view.offsetY, Math.round(150 - renderer.camera.y * view.zoom));
      close(renderer.toWorld(200, 150).x, view.cameraX); close(renderer.toWorld(200, 150).y, view.cameraY);
      for (const [x, y] of [[0, 0], [73, 229], [399, 299]]) {
        const picked = renderer.toWorld(x, y);
        close(picked.x, (x - view.offsetX) / view.zoom); close(picked.y, (y - view.offsetY) / view.zoom);
      }
      const before = renderer.camera.x; renderer.draw(ctx, game, {time: 1, labels: []}); close(renderer.camera.x, before);
    }
    close(results[0], results[1]); close(results[1], results[2]);
  } finally { if (original === undefined) delete globalThis.OffscreenCanvas; else globalThis.OffscreenCanvas = original; }
});

test('SpaceRenderer consumes visual ship/world poses without replacing authoritative state', () => {
  const original = globalThis.OffscreenCanvas; globalThis.OffscreenCanvas = FakeCanvas;
  try {
    const renderer = new SpaceRenderer(), ctx = new FakeCanvas(400, 300).context, labels = [];
    const authoritative = {bodies: [], enemies: [], traffic: [], asteroids: [], signals: [], pickups: [], bullets: []};
    const game = {state: {systemId: 'overlay', ship: {id: 'cinder', x: 0, y: 0, hull: 100}}, system: authoritative};
    const world = {...authoritative, enemies: [{id: 'visual', name: 'Smoothed raider', x: 70, y: 0, hp: 30, maxHp: 60}]};
    const ship = {...game.state.ship, x: 40, y: 10}, originalState = JSON.stringify(game.state);
    renderer.draw(ctx, game, {world, ship, labels, time: 1});
    assert.ok(labels.some(label => label.text === 'Smoothed raider')); assert.equal(game.system, authoritative); assert.equal(authoritative.enemies.length, 0);
    assert.deepEqual(renderer.camera, {x: 40, y: 10}); assert.equal(JSON.stringify(game.state), originalState); assert.equal(ship.x, 40);
  } finally { if (original === undefined) delete globalThis.OffscreenCanvas; else globalThis.OffscreenCanvas = original; }
});
