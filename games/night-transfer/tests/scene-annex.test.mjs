import test from 'node:test';
import assert from 'node:assert/strict';
import { PrisonScene } from '../public/scene.js';
import { ROOMS, getObjects, newGame } from '../public/world.mjs';

const ANNEX = ['annexArchive', 'annexRelay', 'annexListening', 'annexRelease'];

function harness(t) {
  const originals = new Map(['window', 'document'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  function canvas() {
    const surface = { width: 800, height: 600, style: {}, texts: [], getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
    // Real Three.js transforms, raycasts and fallback geometry run below. Only the
    // drawing surface is inert: this test makes no claim about rendered appearance.
    const context = new Proxy({ canvas: surface, fillText: text => surface.texts.push(String(text)),
      createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) }, {
      get: (object, key) => key in object ? object[key] : (() => {}),
      set: (object, key, value) => { object[key] = value; return true; },
    });
    surface.getContext = kind => kind === 'webgl2' ? null : context;
    return surface;
  }
  globalThis.window = { devicePixelRatio: 1 };
  globalThis.document = { createElement: () => canvas() };
  const scene = new PrisonScene(canvas());
  t.after(() => {
    scene.dispose();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  return scene;
}

function stateFor(room, seed = 41) {
  const state = newGame({ campaign: room.level === 3 ? 'annex' : 'escape', seed, now: 0 });
  state.level = room.level;
  for (const item of Object.values(ROOMS)) if (item.requires) state.flags[item.requires] = true;
  return state;
}

function reachable(scene, spawn) {
  const step = .2, key = (x, z) => `${x},${z}`, start = [Math.round(spawn.x / step), Math.round(spawn.z / step)];
  const queue = [start], seen = new Set([key(...start)]), points = [];
  for (let i = 0; i < queue.length; i++) {
    const [x, z] = queue[i]; points.push({ x: x * step, z: z * step });
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz, id = key(nx, nz);
      if (!seen.has(id) && scene.canMove(nx * step, nz * step, .23)) { seen.add(id); queue.push([nx, nz]); }
    }
  }
  return points;
}

function artSnapshot(group) {
  const result = [];
  group.traverse(object => {
    if (!object.isMesh) return;
    result.push({ position: object.position.toArray(), rotation: object.rotation.toArray(), scale: object.scale.toArray(),
      visible: object.visible, color: object.material.color?.getHex(), emissive: object.material.emissive?.getHex(), text: object.material.map?.image?.texts || [] });
  });
  return result;
}

test('all thirteen rooms build and emit fallback geometry within the existing mobile scene budget', t => {
  const scene = harness(t), rooms = Object.values(ROOMS);
  assert.equal(rooms.length, 13);
  for (const room of rooms) {
    const state = stateFor(room), objects = getObjects(state, room.id, 'expert');
    scene.loadRoom(room, objects, state); scene.setCamera(room.spawn);
    assert.equal(scene.actors.size, room.objects.length, `${room.id}: missing interaction model`);
    assert(scene.canMove(room.spawn.x, room.spawn.z, .23), `${room.id}: obstructed spawn`);
    let meshes = 0;
    scene.scene.traverse(object => { if (object.isMesh) { meshes++; assert(object.material && object.geometry); } });
    if (ANNEX.includes(room.id)) {
      assert(scene.theme.annex, `${room.id}: missing theme`);
      assert(meshes < 550, `${room.id}: unexpected scene growth (${meshes} meshes)`);
      assert.equal(scene.scanners.length, 0, 'the annex has no timed surveillance animation');
    }
    scene.renderer._lastRender = -Infinity;
    scene.render({ state, time: 0, dt: 0 });
    assert(scene.renderer.info.render.triangles > 0, `${room.id}: no fallback geometry`);
  }
  scene.clearRoom();
  assert.equal(scene.geometryAssets.size, 0); assert.equal(scene.materialAssets.size, 0); assert.equal(scene.textureAssets.size, 0);
});

test('all 23 annex interactions can be approached and focused within 2.6 metres from the spawn', t => {
  const scene = harness(t);
  let checked = 0;
  for (const id of ANNEX) {
    const room = ROOMS[id], state = stateFor(room);
    scene.loadRoom(room, getObjects(state, id, 'expert'), state);
    for (let z = 3.2; z >= -4.2; z -= .2) assert(scene.canMove(0, z, .23), `${id}: center passage blocked at ${z}`);
    const points = reachable(scene, room.spawn);
    for (const actor of scene.actors.values()) {
      const candidates = points.map(point => ({ ...point, distance: Math.hypot(point.x - actor.anchor.x, point.z - actor.anchor.z) }))
        .filter(point => point.distance >= .4 && point.distance <= 2.55).sort((a, b) => a.distance - b.distance);
      const found = candidates.some(point => {
        const dx = actor.anchor.x - point.x, dz = actor.anchor.z - point.z;
        scene.setCamera({ ...point, yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(actor.anchor.y - 1.6, point.distance) });
        const target = scene.getTarget(); return target?.id === actor.object.id && target.distance <= 2.6;
      });
      assert(found, `${id}/${actor.object.id}: no reachable, unobstructed interaction pose`);
      checked++;
    }
  }
  assert.equal(checked, 23);
});

test('relay and interlock art changes only to submitted, accepted settings', t => {
  const scene = harness(t), room = ROOMS.annexRelay, state = stateFor(room);
  state.flags.annexRelaySettings = [true, false, true, false, false, true];
  scene.loadRoom(room, getObjects(state, room.id, 'expert'), state);
  const parts = scene.actors.get('annexRelayBoard').parts;
  assert(parts.relayLamps.every(lamp => lamp.material === scene.m.dark));
  assert(parts.relaySwitches.every(lever => lever.rotation.x === .5));
  const accepted = { ...state, flags: { ...state.flags, annexRelaySolved: true } };
  scene.updateState(accepted);
  parts.relaySwitches.forEach((lever, i) => assert.equal(lever.rotation.x, state.flags.annexRelaySettings[i] ? -.5 : .5));
  parts.relayLamps.forEach((lamp, i) => assert.equal(lamp.material, state.flags.annexRelaySettings[i] ? scene.m.green : scene.m.dark));
  const release = stateFor(ROOMS.annexRelease);
  scene.loadRoom(ROOMS.annexRelease, getObjects(release, 'annexRelease', 'expert'), release);
  const interlock = scene.actors.get('annexInterlock').parts;
  assert.equal(interlock.interlockDials.length, 4);
  scene.updateState({ ...release, flags: { ...release.flags, annexRelaySolved: true, annexSignalSolved: true,
    annexInterlockSolved: true, annexInterlockSettings: [2, 7, 5, 1] } });
  assert(interlock.releaseLamps.every(({ lamp }) => lamp.material === scene.m.green));
  interlock.interlockDials.forEach((dial, i) => assert.equal(dial.rotation.z, -[2, 7, 5, 1][i] * Math.PI / 5));
});

test('Expert receiver geometry and labels do not disclose run-specific tone data', t => {
  const scene = harness(t), room = ROOMS.annexListening;
  const snapshots = [12, 8675309].map(seed => {
    const state = stateFor(room, seed);
    scene.loadRoom(room, getObjects(state, room.id, 'expert'), state);
    scene.render({ state, time: 3000, dt: 0 });
    return artSnapshot(scene.actors.get('annexReceiver').group);
  });
  assert.deepEqual(snapshots[0], snapshots[1]);
});
