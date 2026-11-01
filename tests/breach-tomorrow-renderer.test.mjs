import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as THREE from '../daily_flyer/themes/breach_assets/vendor/three.module.js';
import { Game } from '../daily_flyer/themes/breach_assets/core.mjs';
import { CoopGame, COOP_PLAYER_IDS } from '../daily_flyer/themes/breach_assets/coop-core.mjs';
import { TOMORROW, TOMORROW_ID, tomorrowInteractionInfo } from '../daily_flyer/themes/breach_assets/tomorrow.mjs';
import { TOMORROW_PALETTES, paintTomorrowSurface, paintTomorrowLandmark, paintTomorrowProp, paintTomorrowStation } from '../daily_flyer/themes/breach_assets/tomorrow-art.mjs';
import { platformSolid, platformStatus, courseStatus, shadowPuzzleInfo, jumpInfo } from '../daily_flyer/themes/breach_assets/shadow.mjs';
import { weaponViewTransform } from '../daily_flyer/themes/breach_assets/weapon-view.mjs';

// Execute the real painters, scene geometry and software projection. This
// recorder checks image selection and geometry, not GPU pixels or visual taste.
let canvasCount = 0;
function canvas(width = 926, height = 428) {
  canvasCount++;
  const record = (c, values) => {
    for (const value of values) {
      assert.ok(Number.isFinite(Number(value)), 'Drawing coordinates must remain finite');
      c.shapeHash = Math.imul(c.shapeHash ^ Math.round(Number(value) * 100), 16777619) >>> 0;
    }
  };
  const context = {
    texts: [], colors: new Set(), images: new Set(), rotations: [], fillStyle: '#000', globalAlpha: 1, shapeHash: 2166136261,
    fillRect(...v) { this.colors.add(this.fillStyle); record(this, [1, ...v]); },
    strokeRect(...v) { this.colors.add(this.strokeStyle); record(this, [2, ...v]); },
    fillText(text) { this.texts.push(text); },
    fill() { this.colors.add(this.fillStyle); }, stroke() { this.colors.add(this.strokeStyle); },
    moveTo(...v) { record(this, [17, ...v]); }, lineTo(...v) { record(this, [31, ...v]); },
    arc(...v) { record(this, [43, ...v]); }, ellipse(...v) { record(this, [47, ...v]); },
    translate(...v) { record(this, [53, ...v]); }, scale(...v) { record(this, [59, ...v]); },
    rotate(angle) { this.rotations.push(angle); record(this, [61, angle]); },
    drawImage(image) { assert.ok(image, 'Every projected sprite has an image'); this.images.add(image); },
    getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
    createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
  };
  for (const method of ['beginPath', 'closePath', 'save', 'restore', 'clearRect', 'putImageData']) context[method] = () => {};
  const result = { width, height, style: {}, context, getContext() { return context; }, getBoundingClientRect() { return { width, height }; },
    parentElement: { appendChild() {} }, insertAdjacentElement() {}, setAttribute() {}, remove() {} };
  context.canvas = result;
  return result;
}

class GeometryOnlyRenderer {
  constructor() { this.info = { render: { calls: 0, triangles: 0 } }; }
  setPixelRatio() {} setClearColor() {} setSize() {} dispose() {}
  render(scene, camera) {
    scene.updateMatrixWorld(); camera.updateMatrixWorld();
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    let calls = 0, triangles = 0;
    scene.traverseVisible(object => {
      if (!object.isMesh && !object.isSprite || object.frustumCulled && !frustum.intersectsObject(object)) return;
      calls++; triangles += (object.geometry?.index?.count || object.geometry?.attributes.position?.count || 6) / 3 * (object.isInstancedMesh ? object.count : 1);
    });
    this.info.render = { calls, triangles };
  }
}

const source = readFileSync(new URL('../daily_flyer/themes/breach_assets/renderer.mjs', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace('export class BreachRenderer', 'class BreachRenderer');
const api = runInNewContext(source + ';({surfaceLayout,allLandmarkPanels,landmarkTexture,makeTomorrowWallTexture,makeTomorrowFloorTexture,tomorrowPropMotion,featureMode,stationKey,enemyArt,enemyHeight,enemyWidth,drawEnemy,WebGLBreachRenderer,SoftwareBreachRenderer})', {
  TOMORROW_PALETTES, paintTomorrowSurface, paintTomorrowLandmark, paintTomorrowProp, paintTomorrowStation, tomorrowInteractionInfo,
  platformSolid, platformStatus, courseStatus, shadowPuzzleInfo, jumpInfo, weaponViewTransform,
  THREE: { ...THREE, WebGLRenderer: GeometryOnlyRenderer }, document: { createElement: () => canvas() }, window: { innerWidth: 926, innerHeight: 428 }, matchMedia: () => ({ matches: false }),
});
const Renderers = [api.WebGLBreachRenderer, api.SoftwareBreachRenderer];
const imageOf = texture => texture.image || texture;
const signature = texture => imageOf(texture).context.shapeHash;
function gameFor() {
  const game = new Game({ mission: TOMORROW_ID, seed: 73 }); game.start();
  game.state.enemies = []; game.state.pickups = [];
  return game;
}
function renderUnchanged(renderer) {
  renderer.context?.images.clear();
  const before = JSON.stringify(renderer.game.state); renderer.render(0);
  assert.equal(JSON.stringify(renderer.game.state), before, 'Rendering never changes simulation state');
}
function observe(game, target, minDistance = 3, maxDistance = 4) {
  const candidates = [];
  for (let dz = -Math.ceil(maxDistance); dz <= maxDistance; dz++) for (let dx = -Math.ceil(maxDistance); dx <= maxDistance; dx++) {
    const x = target.x + dx, z = target.z + dz, distance = Math.hypot(dx, dz);
    if (distance >= minDistance && distance <= maxDistance && game.level.grid[Math.floor(z)]?.[Math.floor(x)] === '.' && game.hasLineOfSight(x, z, target.x, target.z)) candidates.push({ x, z });
  }
  assert.ok(candidates.length, `A visible viewing position exists for ${target.id}`);
  Object.assign(game.state.player, candidates[0], { angle: Math.atan2(target.x - candidates[0].x, candidates[0].z - target.z) });
}
const item = (game, id) => game.state.interactables.find(o => o.id === id);
function use(game, id) {
  const object = item(game, id); Object.assign(game.state.player, { x: object.x, z: object.z });
  assert.equal(game.interact(), true, id);
}
function assertStation(renderer, id, mode) {
  const object = item(renderer.game, id); observe(renderer.game, object); renderUnchanged(renderer);
  assert.equal(api.featureMode(object, renderer.game.state, renderer.game), mode, id);
  if (renderer.mode === 'webgl') {
    const visual = renderer.featureVisuals.get(id);
    assert.equal(visual.sprite.material.map, visual.maps[mode], id);
    assert.equal(visual.sprite.visible, true);
  } else assert.ok(renderer.context.images.has(renderer.stationImages.get(api.stationKey(object))[mode]), `${id} projects its current state`);
}

test('all nine Tomorrow districts reach their authored palettes and render without changing gameplay', () => {
  const layout = api.surfaceLayout(TOMORROW, true), names = Object.keys(TOMORROW_PALETTES);
  assert.equal(names.length, 9);
  assert.equal(new Set(names.map(id => signature(api.makeTomorrowWallTexture(id)))).size, 9, 'District wall silhouettes differ, beyond palette changes');
  assert.equal(new Set(names.map(id => JSON.stringify(TOMORROW_PALETTES[id].fog))).size, 9);
  for (const zone of TOMORROW.zones) {
    for (let z = zone.z1; z < zone.z2; z++) for (let x = zone.x1; x < zone.x2; x++) assert.equal(layout.names[layout.paletteAt(x + .5, z + .5)], zone.id);
    assert.notEqual(signature(api.makeTomorrowFloorTexture(zone.id)), signature(api.makeTomorrowFloorTexture(zone.id, true)));
  }
  assert.equal(new Set(layout.indices).size, 9);
  assert.ok(Array.from(layout.indices).every(index => index < names.length));
  for (const Renderer of Renderers) {
    const game = gameFor(), renderer = new Renderer(canvas(), game, { quality: 'low', reducedMotion: true });
    assert.equal(renderer.worldWallHeight, 4.8); assert.equal(renderer.ceilingHeight, 4.8);
    for (const zone of TOMORROW.zones) {
      Object.assign(game.state.player, { x: zone.x1 + 1.5, z: zone.z2 - 1.5, angle: 0 }); renderUnchanged(renderer);
      assert.equal(renderer.stats.tomorrowDistrict, zone.id);
      assert.deepEqual(Array.from(renderer.visuals.fogRgb), TOMORROW_PALETTES[zone.id].fog);
    }
    if (renderer.mode === 'software') {
      assert.equal(renderer.wallImages.length, 9); assert.equal(renderer.floorPixelsByPalette.length, 9); assert.equal(renderer.ceilingPixelsByPalette.length, 9);
    }
    renderer.dispose();
  }
});

test('Tomorrow landmark facades follow the full collision footprint in every district', () => {
  const panels = api.allLandmarkPanels(TOMORROW), landmarks = TOMORROW.landmarks.filter(p => p.type.startsWith('tomorrow-'));
  assert.equal(new Set(landmarks.map(p => p.tomorrowDistrict)).size, 9);
  for (const landmark of landmarks) {
    const faces = panels.filter(p => p.id === landmark.id); assert.equal(faces.length, 4, landmark.id);
    for (const face of faces) {
      assert.equal(face.tomorrowDistrict, landmark.tomorrowDistrict);
      assert.equal(imageOf(api.landmarkTexture(face)).width, 192);
      assert.ok(face.height + face.bottom <= 4.8);
    }
    const modified = structuredClone(TOMORROW), x = Math.floor(landmark.x - landmark.width / 2), z = Math.floor(landmark.z - landmark.depth / 2);
    assert.equal(modified.grid[z][x], '#');
    const row = modified.grid[z].split(''); row[x] = '.'; modified.grid[z] = row.join('');
    assert.equal(api.allLandmarkPanels(modified).some(p => p.id === landmark.id), false, `${landmark.id} cannot leave phantom cover over a removed collision cell`);
  }
});

test('custom stations cache all three modes and both renderers follow power, relay, memory and fold gates', () => {
  for (const Renderer of Renderers) {
    const game = gameFor(), renderer = new Renderer(canvas(), game, { quality: 'low', reducedMotion: true });
    for (const object of game.state.interactables.filter(o => o.tomorrowAction)) {
      const maps = renderer.stationMaps?.get(api.stationKey(object)) || renderer.stationImages.get(api.stationKey(object));
      assert.equal(maps.length, 3, object.id); assert.equal(new Set(maps).size, 3);
      assert.ok(imageOf(maps[0]).context.texts.includes('OFFLINE'));
      assert.ok(imageOf(maps[1]).context.texts.includes(object.tomorrowAction === 'ending' ? object.ending.toUpperCase() : 'USE'));
      assert.ok(imageOf(maps[2]).context.texts.includes(object.tomorrowAction === 'fold' ? 'FOLD AGAIN' : 'RECORDED'));
      if (object.tomorrowAction === 'ending') {
        assert.ok(imageOf(maps[1]).context.texts.includes({ escape: 'I', seal: 'II', rewrite: 'III' }[object.ending]));
        const palette = TOMORROW_PALETTES[{ escape: 'exchange', seal: 'aquarium', rewrite: 'wardrobe' }[object.ending]];
        assert.ok(imageOf(maps[1]).context.colors.has(palette.panel), `${object.ending} matches its objective color`);
        assert.ok(imageOf(maps[1]).context.colors.has(palette.accent));
      }
    }
    assertStation(renderer, 'aux-power', 1); assertStation(renderer, 'relay-west', 0); assertStation(renderer, 'fold-waiting', 0);
    use(game, 'aux-power'); assertStation(renderer, 'aux-power', 2); assertStation(renderer, 'relay-west', 1);
    use(game, 'relay-west'); assertStation(renderer, 'relay-west', 2);
    assertStation(renderer, 'memory-museum', 0); game.state.player.hasNull = true; assertStation(renderer, 'memory-museum', 1);
    use(game, 'memory-museum'); assertStation(renderer, 'memory-museum', 2);
    assertStation(renderer, 'fold-waiting', 1); use(game, 'fold-waiting'); assertStation(renderer, 'fold-waiting', 2);
    assert.equal(tomorrowInteractionInfo(game, item(game, 'fold-waiting')).canUse, true, 'Completed folds remain usable');
    renderer.dispose();
  }
});

test('relay transformations select cached changed artwork in software and rotate the same props in WebGL', () => {
  for (const Renderer of Renderers) {
    const game = gameFor(), renderer = new Renderer(canvas(), game, { quality: 'low', reducedMotion: true });
    assert.equal(renderer.tomorrowProps.length, 9);
    for (const visual of renderer.tomorrowProps) {
      const { prop } = visual;
      assert.equal(game.level.grid[Math.floor(prop.z)]?.[Math.floor(prop.x)], '.', `${prop.id} cannot sit hidden inside a full-height solid landmark`);
      observe(game, prop, 7, 10); renderUnchanged(renderer);
      if (renderer.mode === 'software') assert.ok(renderer.context.images.has(visual.image), `${prop.id} actually projects from a clear walkable viewpoint`);
      else assert.equal(visual.sprite.visible, true, prop.id);
    }
    for (const visual of renderer.tomorrowProps.filter(v => v.prop.changedBy)) {
      const { prop } = visual;
      Object.assign(game.state.player, { x: prop.x, z: prop.z + 9, angle: 0 });
      renderUnchanged(renderer);
      if (renderer.mode === 'software') {
        assert.ok(renderer.context.images.has(visual.image)); assert.ok(visual.changedImage);
        assert.ok(visual.changedImage.context.rotations.includes(Math.PI));
        assert.notEqual(signature(visual.image), signature(visual.changedImage));
      } else { assert.equal(visual.sprite.material.rotation, 0); assert.equal(visual.sprite.material.color.getHex(), 0xffffff); }
      const beforeAllocations = canvasCount;
      item(game, prop.changedBy).used = true; renderUnchanged(renderer); renderUnchanged(renderer);
      if (renderer.mode === 'software') {
        assert.ok(renderer.context.images.has(visual.changedImage)); assert.equal(renderer.context.images.has(visual.image), false);
      } else {
        assert.equal(visual.sprite.material.rotation, Math.PI); assert.equal(visual.sprite.material.color.getHex(), 0xb9ffd7);
        // Real Sprite.raycast applies Three's billboard center and rotation.
        // Flipping around the foot would wrongly move this ceiling prop below
        // the floor, while the software image remains in its overhead bounds.
        const ray = new THREE.Raycaster(); ray.camera = renderer.camera;
        for (const y of [visual.size.bottom + .1, visual.size.bottom + visual.size.height / 2, visual.size.bottom + visual.size.height - .1]) {
          ray.set(new THREE.Vector3(prop.x, y, prop.z + 9), new THREE.Vector3(0, 0, -1));
          assert.equal(ray.intersectObject(visual.sprite).length, 1, `${prop.id} remains overhead after rotating`);
        }
        ray.set(new THREE.Vector3(prop.x, .2, prop.z + 9), new THREE.Vector3(0, 0, -1));
        assert.equal(ray.intersectObject(visual.sprite).length, 0, 'The changed prop does not descend into the walking space');
      }
      assert.equal(canvasCount, beforeAllocations, 'A relay change and later frames do not allocate fresh textures');
      for (const clock of [0, 17, 90]) {
        const pose = api.tomorrowPropMotion(prop, game.state, clock, true);
        assert.equal(pose.x, prop.x); assert.equal(pose.z, prop.z); assert.equal(pose.y, 0); assert.equal(pose.changed, true);
      }
    }
    renderer.dispose();
  }
});

test('Tomorrow retains all four newest enemy silhouettes and projects their real warning frames in both paths', () => {
  const types = ['cinder-sower', 'tether-widow', 'glass-skimmer', 'lantern-maw'];
  assert.equal(new Set(types.map(type => signature(api.drawEnemy(type, 0)))).size, 4);
  for (const type of types) assert.notEqual(signature(api.drawEnemy(type, 0)), signature(api.drawEnemy(type, 4)));
  for (const Renderer of Renderers) {
    const game = gameFor(); Object.assign(game.state.player, { x: 45.5, z: 83.5, angle: 0 });
    game.state.enemies = types.map((type, i) => {
      const authored = TOMORROW.enemies.find(e => e.type === type); assert.ok(authored, type);
      return { ...structuredClone(authored), x: 44 + i, z: 79.5, alive: true, health: 90, dormant: false, revealed: true, shadowPhase: 'windup',
        telegraph: { kind: ['cinder', 'tether', 'skimmer', 'maw'][i], x: 45.5, z: 81, radius: .6, remaining: .8, duration: 1 } };
    });
    const renderer = new Renderer(canvas(), game, { quality: 'low', reducedMotion: true }); renderUnchanged(renderer);
    for (const enemy of game.state.enemies) {
      const warning = renderer.getEnemyFrames(api.enemyArt(enemy, game.state.player))[4];
      if (renderer.mode === 'webgl') {
        const visual = renderer.enemyVisuals.get(enemy.id); assert.equal(visual.sprite.material.map, warning); assert.equal(visual.sprite.visible, true);
        assert.equal(visual.sprite.scale.x, api.enemyWidth(enemy)); assert.equal(visual.sprite.scale.y, api.enemyHeight(enemy));
      } else assert.ok(renderer.context.images.has(warning), enemy.type);
    }
    renderer.dispose();
  }
});

test('each of four local identities sees only the other three operators with distinct numbered artwork', () => {
  for (const Renderer of Renderers) {
    const game = new CoopGame({ mission: TOMORROW_ID, players: [...COOP_PLAYER_IDS], seed: 73 }); game.start();
    game.state.enemies = []; game.state.pickups = [];
    const renderer = new Renderer(canvas(), game, { quality: 'low', reducedMotion: true });
    const colorSets = COOP_PLAYER_IDS.map(id => {
      const frames = renderer.getTeammateFrames(id), front = imageOf(frames.front[0]);
      assert.ok(front.context.texts.includes(id.slice(1)), `${id} has its own number`);
      assert.equal(renderer.getTeammateFrames(id), frames, 'Identity textures are cached');
      return JSON.stringify([...front.context.colors].sort());
    });
    assert.equal(new Set(colorSets).size, 4, 'Player three and four cannot alias earlier colors');
    for (const selfId of COOP_PLAYER_IDS) {
      let index = 0; game.state.player = game.state.players[selfId]; game.state.localPlayerId = selfId;
      Object.assign(game.state.player, { x: 45.5, z: 83.5, angle: 0 });
      for (const id of COOP_PLAYER_IDS.filter(id => id !== selfId)) Object.assign(game.state.players[id], { x: 44.5 + index++, z: 79.5, angle: Math.PI, health: 100, alive: true, weapon: 'pistol' });
      renderUnchanged(renderer);
      const visible = renderer.teammateVisuals || renderer.teammateMotion;
      assert.deepEqual([...visible.keys()].sort(), COOP_PLAYER_IDS.filter(id => id !== selfId));
      for (const id of COOP_PLAYER_IDS.filter(id => id !== selfId)) {
        const frames = renderer.getTeammateFrames(id), images = Object.values(frames).flat();
        if (renderer.mode === 'webgl') assert.ok(images.includes(visible.get(id).sprite.material.map), id);
        else assert.ok(images.some(image => renderer.context.images.has(image)), `${selfId} sees ${id}`);
      }
    }
    renderer.dispose();
  }
});
