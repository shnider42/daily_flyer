import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { generateSurface, isWalkable } from '../dist/surface.mjs';
import { reconcileSurfacePosition } from '../dist/surface-position.mjs';

const pose = person => ({ x: person.x, y: person.y });

test('an old rectangular-station save migrates to the new connected ring entrance once', () => {
  const body = { id: 'save-ring', name: 'Solace', kind: 'station', stationTypeId: 'wheel-habitat' };
  const surface = generateSurface(body, 'save-shape');
  const person = { x: surface.cols * 12, y: surface.rows * 12, health: 61, carrying: true, vx: 4 };
  assert.equal(reconcileSurfacePosition(person, surface), true);
  assert.deepEqual(pose(person), pose(surface.spawn));
  assert.equal(isWalkable(surface, person.x, person.y), true);
  assert.equal(person.health, 61); assert.equal(person.carrying, true);
  const exit = surface.entities.find(entity => entity.type === 'exit');
  Object.assign(person, pose(exit));
  assert.equal(reconcileSurfacePosition(person, surface), false);
  assert.deepEqual(pose(person), pose(exit), 'The migrated captain is not returned to spawn every frame.');
});

test('current layout poses survive a local save and invalid coordinates are repaired', () => {
  const game = new Game('surface-pose-save'), body = game.galaxy[0].bodies.find(body => body.id === 'morrow');
  const surface = generateSurface(body, game.state.seed, game.state.flags);
  reconcileSurfacePosition(game.state.person, surface);
  const exit = surface.entities.find(entity => entity.type === 'exit');
  Object.assign(game.state.person, pose(exit));
  const restored = Game.fromSave(JSON.parse(game.serialize()));
  assert.equal(reconcileSurfacePosition(restored.state.person, surface), false);
  assert.deepEqual(pose(restored.state.person), pose(exit));
  restored.state.person.x = -10000;
  assert.equal(reconcileSurfacePosition(restored.state.person, surface), true);
  assert.deepEqual(pose(restored.state.person), pose(surface.spawn));
});

test('a ship deck without a place version keeps a valid saved cabin position', () => {
  const surface = generateSurface({ id: 'own-ship', name: 'Cinder', kind: 'ship', classId: 'sparrow', crew: [] }, 'cabin-save');
  const person = { ...surface.spawn, health: 88, surfaceLayoutVersion: 'previous-port:place-0' };
  assert.equal(reconcileSurfacePosition(person, surface), false);
  assert.deepEqual(pose(person), pose(surface.spawn));
  assert.equal(person.surfaceLayoutVersion, undefined);
});
