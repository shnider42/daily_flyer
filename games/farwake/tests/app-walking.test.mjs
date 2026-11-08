import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { Game } from '../dist/engine.mjs';
import { FarwakeNetwork } from '../dist/network.mjs';
import { movePerson } from '../dist/surface.mjs';

// Execute the actual app integration without starting its DOM or animation loop.
const app = readFileSync(new URL('../dist/app.mjs', import.meta.url), 'utf8');
const declaration = name => {
  const start = app.indexOf(`function ${name}(`), next = app.indexOf('\nfunction ', start + 1);
  assert.ok(start >= 0, `The app declares ${name}.`);
  return app.slice(start, next < 0 ? app.length : next);
};
const walkingCode = declaration('advanceOnlinePerson') + '\n' + declaration('receiveSnapshot');
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} should equal ${expected}`);

function fixture({ health = 100, down = false } = {}) {
  let time = 0, context;
  const authority = new Game('app-walking-regression');
  Object.assign(authority.state, { mode: 'person', locationId: 'kettle' });
  Object.assign(authority.state.person, { x: 100, y: 100, health, down, speed: 112 });
  const openHall = { width: 600, height: 600, tileSize: 24, tiles: Array.from({ length: 25 }, () => Array(25).fill(1)), solids: [], spawn: { x: 100, y: 100 } };
  const network = new FarwakeNetwork({ url: 'https://example.test', storage: null, autoReconnect: false, now: () => time, wallNow: () => 100000 + time, onSnapshot(packet) { context.packet = packet; vm.runInContext('receiveSnapshot(packet)', context); } });
  context = vm.createContext({
    Game, structuredClone, movePerson, network, performance: { now: () => time }, game: Game.fromSave(authority.save()),
    surface: openHall, surfaceKey: 'open-hall', surfaceTarget: null, onlineSnapshot: null, playing: false, hudDirty: false,
    personPredictedAt: null, personVisualAt: null, personVisualOffset: { x: 0, y: 0 },
    controls: { clear() {} }, worldPresentation: { push() {} }, frameMonitor: { snapshot() {} },
    ensureSurface() { context.surface = context.game.state.mode === 'person' ? openHall : null; }, updateSurfaceFlags() {}, processEvents() {},
  });
  vm.runInContext(walkingCode, context);
  const snapshot = (at, x, { reset = false, ...extra } = {}) => {
    const state = authority.save(); Object.assign(state.person, { x, y: 100, health, down });
    network._snapshot({ tick: Math.round(at / 10), ack: 0, simulatedAt: 100000 + at, serverTime: 100000 + time, room: { id: 'walk-room', kind: 'surface', systemId: 'hearth', locationId: 'kettle' }, state, world: authority.system, remoteShips: [], players: [], events: [], ...extra }, reset);
  };
  snapshot(0, 100, { reset: true });
  return { context, network, snapshot, setTime(value) { time = value; }, advance(value = time) { context.advanceTime = value; vm.runInContext('advanceOnlinePerson(advanceTime)', context); } };
}

test('walking reconciles at snapshot arrival time without a stop on a perfectly matching authority pose', () => {
  const f = fixture();
  f.setTime(100); f.network.setInput({ x: 1 }, .1); f.advance();
  close(f.context.game.state.person.x, 111.2);
  f.setTime(115); f.snapshot(100, 111.2);
  close(f.context.game.state.person.x, 112.88);
  close(f.context.personVisualOffset.x, 0);
  close(f.network.state.person.x, 111.2); // App prediction must not mutate the packet used for future merges.
  f.setTime(1000 / 60 * 7); f.network.setInput({ x: 1 }, 1 / 60); f.advance();
  close(f.context.game.state.person.x, 100 + 112 * 7 / 60);
});

test('both walking replay paths keep incapacitated captains stationary', () => {
  for (const injury of [{ health: 0, down: false }, { health: 55, down: true }]) {
    const f = fixture(injury);
    f.setTime(100); f.network.setInput({ x: 1 }, .1); f.advance();
    close(f.context.game.state.person.x, 100); assert.equal(f.context.game.state.person.moving, false);
    f.setTime(115); f.snapshot(100, 100);
    close(f.context.game.state.person.x, 100); assert.equal(f.context.game.state.person.moving, false);
  }
});

test('walking cursors stay monotonic, visual correction decays once, and explicit resets clear both', () => {
  const f = fixture();
  f.setTime(100); f.network.setInput({ x: 1 }, .1); f.advance();
  f.context.personVisualOffset = { x: 8, y: 0 };
  const position = f.context.game.state.person.x;
  f.advance(90);
  close(f.context.personPredictedAt, 100); close(f.context.personVisualAt, 100); close(f.context.game.state.person.x, position); close(f.context.personVisualOffset.x, 8);
  f.setTime(115); f.snapshot(100, 111.2);
  close(f.context.personVisualOffset.x, 8 * Math.exp(-.015 * 16)); close(f.context.personVisualAt, 115);
  f.setTime(200); f.snapshot(200, 400, { teleport: true });
  close(f.context.game.state.person.x, 400); close(f.context.personVisualOffset.x, 0); close(f.context.personPredictedAt, 200); close(f.context.personVisualAt, 200);
});
