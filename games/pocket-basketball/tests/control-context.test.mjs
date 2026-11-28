import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../public/engine.js';
import { getTeam } from '../public/teams.js';
import { Controls } from '../public/input.js';
import { controlContext } from '../public/control-context.js';

class InputSurface {
  constructor() {
    this.listeners = new Map(); this.attrs = new Map(); this.captured = new Set();
    this.style = {}; this.classList = { add() {}, remove() {} };
  }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  setAttribute(name, value) { this.attrs.set(name, value); }
  getAttribute(name) { return this.attrs.get(name); }
  closest() { return null; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 120, height: 120 }; }
  setPointerCapture(id) { this.captured.add(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  releasePointerCapture(id) { this.captured.delete(id); }
  emit(type, values = {}) {
    const event = { type, target: this, cancelable: true, detail: 1, pointerType: 'touch',
      button: 0, preventDefault() {}, ...values };
    for (const listener of this.listeners.get(type) || []) listener(event);
  }
}

function setup({ defense = false } = {}) {
  const win = globalThis.window = new InputSurface();
  const doc = globalThis.document = new InputSurface(); doc.hidden = false;
  const game = new Match({ home: getTeam('uconn'), away: getTeam('duke'), human: 0, seed: 7 });
  game._releaseInbound();
  game.elapsed = 5;
  const nodes = Object.fromEntries(['stick','knob','shoot','pass','sprint','steal','block','switcher','screen']
    .map(name => [name, new InputSurface()]));
  for (const p of game.players) p.aiTimer = 100;
  if (defense) {
    for (const p of game.active(0)) { p.x = 30 + p.slot * 30; p.y = 300; }
    const enemy = game.player(100), defender = game.player(0);
    enemy.x = 250; enemy.y = 800; defender.x = 250; defender.y = 776;
    game._giveBall(enemy);
  }
  // Steals succeed deterministically, leaving timing/ownership as the tested variables.
  game.random = () => 0;
  const actions = [];
  let controls;
  controls = new Controls({ ...nodes,
    active: () => !['halftime', 'finished'].includes(game.phase),
    context: () => controlContext(game),
    onAction(name, payload) {
      const result = game.action(name, payload);
      actions.push({ name, payload, result });
      if (result && ['shoot', 'pass', 'switch'].includes(name)) controls.cancelShot();
      controls.syncContext();
    },
  });
  controls.syncContext();
  const down = key => win.emit('keydown', { key, code: key === ' ' ? 'Space' : undefined });
  const up = key => win.emit('keyup', { key, code: key === ' ' ? 'Space' : undefined });
  return { game, controls, actions, win, doc, ...nodes, down, up };
}

test('J selects the nearest defender and a repeated fresh press keeps that player', () => {
  const { game, controls, down, up, actions } = setup({ defense: true });
  game.controlled = 4;
  down('j'); up('j');
  assert.equal(game.controlled, 0);
  down('j'); up('j');
  assert.equal(game.controlled, 0);
  assert.deepEqual(actions.map(action => action.name), ['switch', 'switch']);
  assert.equal(controlContext(game).offense, false);
  assert.equal(game.ball.owner, 100);
  controls.destroy();
});

test('Space steals on press; holding and releasing after the guard cannot shoot', () => {
  const { game, controls, down, up, actions } = setup({ defense: true });
  down(' ');
  assert.equal(game.ball.owner, 0, 'swipe acts before key release');
  assert.equal(actions[0].name, 'steal');
  assert.equal(controlContext(game).shotGuard, true);
  assert.equal(controls.charging, false);
  game.elapsed = game.shootGraceUntil + 0.01;
  controls.syncContext();
  up(' ');
  assert.equal(game.stats[0].fga, 0);
  assert.equal(game.ball.flight, null);
  down(' ');
  assert.equal(controls.charging, true, 'a fresh press starts a normal offensive shot');
  up(' ');
  assert.equal(game.ball.flight?.kind, 'shot');
  assert.equal(game.stats[0].fga, 1);
  controls.destroy();
});

test('touch steal preserves steering and sprint and allows an immediate outlet pass', () => {
  const { game, controls, stick, sprint, shoot, pass, win, actions } = setup({ defense: true });
  stick.emit('pointerdown', { pointerId: 11, clientX: 115, clientY: 60 });
  sprint.emit('pointerdown', { pointerId: 12 });
  shoot.emit('pointerdown', { pointerId: 13 });
  assert.equal(game.ball.owner, 0);
  assert.equal(controlContext(game).shotGuard, true);
  assert.equal(controls.read().x, 1);
  assert.equal(controls.read().sprint, true);
  pass.emit('pointerdown', { pointerId: 14 });
  assert.equal(game.ball.flight?.kind, 'pass', 'shooting guard does not delay passing');
  assert.equal(actions.at(-1).result, true);
  assert.equal(controlContext(game).offense, true, 'our airborne pass keeps offensive button meanings');
  win.emit('pointerup', { pointerId: 13 });
  assert.equal(game.stats[0].fga, 0);
  assert.equal(controls.read().x, 1);
  assert.equal(controls.read().sprint, true);
  controls.destroy();
});

test('a fresh press inside the settling guard is not queued for guard expiry', () => {
  const { game, controls, down, up } = setup({ defense: true });
  game._giveBall(game.player(0));
  down(' ');
  assert.equal(controls.charging, false);
  game.elapsed = game.shootGraceUntil + 0.01;
  controls.read();
  assert.equal(controls.charging, false);
  up(' ');
  assert.equal(game.stats[0].fga, 0);
  down(' '); up(' ');
  assert.equal(game.stats[0].fga, 1);
  controls.destroy();
});

test('own shot and loose rebound use recovery controls without converting a held swipe', () => {
  const { game, controls, down, up, actions } = setup();
  down(' '); up(' ');
  const shot = game.ball.flight;
  assert.equal(shot?.kind, 'shot');
  assert.equal(controlContext(game).offense, false);
  shot.made = false; shot.foul = null; shot.rim = true;
  game.ball.flight = null; game._resolveShot(shot);
  assert.equal(game.ball.owner, null);
  down(' ');
  assert.equal(actions.at(-1).name, 'steal');
  const epoch = game.possessionEpoch;
  game._giveBall(game.player(1));
  assert.equal(game.possessionEpoch, epoch, 'offensive rebound keeps the team possession');
  controls.syncContext(); up(' ');
  assert.equal(game.stats[0].fga, 1, 'rebound must not turn the recovery swipe into a second shot');
  assert.equal(game.ball.owner, 1);
  down(' '); up(' ');
  assert.equal(game.stats[0].fga, 2);
  controls.destroy();
});

test('two rapid possession changes cancel a shot even when the original player gets it back', () => {
  const { game, controls, down, up } = setup();
  down(' ');
  assert.equal(controls.charging, true);
  const initialEpoch = game.possessionEpoch;
  game._giveBall(game.player(100));
  game._giveBall(game.player(0));
  assert.equal(game.possessionEpoch, initialEpoch + 2);
  game.elapsed = game.shootGraceUntil + 0.01;
  // No intervening UI update: release itself must reject the earlier possession.
  up(' ');
  assert.equal(game.stats[0].fga, 0);
  assert.equal(game.ball.owner, 0);
  assert.equal(controls.charging, false);
  controls.destroy();
});

test('a live-shot hold cannot leak into free throws; a ready free throw accepts a fresh shot', () => {
  const { game, controls, down, up } = setup();
  down(' ');
  assert.equal(controls.charging, true);
  game._startFreeThrows(game.player(0), 2);
  game.phaseTime = 0;
  up(' ');
  assert.equal(game.ball.flight, null);
  assert.equal(game.stats[0].fga, 0);
  // The live-possession shot guard must not prevent the awarded free throw.
  game.shootGraceUntil = game.elapsed + 10;
  assert.equal(controlContext(game).canShoot, true);
  down(' '); up(' ');
  assert.equal(game.ball.flight?.kind, 'freeThrow');
  assert.equal(game.stats[0].fga, 0);
  assert.equal(controlContext(game).offense, true);
  assert.equal(controlContext(game).canShoot, false);
  controls.destroy();
});
