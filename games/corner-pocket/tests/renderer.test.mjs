import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three.module.js';
import { PoolRenderer, createRenderer } from '../public/renderer.mjs';
import { createGame, TABLE } from '../public/engine.mjs';

// A DOM/paint recorder, not a WebGL emulator. Real Three.js cameras, geometry,
// transforms and the context-loss handoff run without production dependencies.
class Canvas extends EventTarget {
  constructor(width = 960, height = 560) {
    super(); this.width = width; this.height = height; this.rect = { left: 0, top: 0, width, height };
    this.style = {}; this.attrs = {}; this.offsetLeft = 0; this.offsetTop = 0; this.text = [];
    this.ctx = new Proxy({}, { get: (target, key) => {
      if (key in target) return target[key];
      if (key === 'createRadialGradient' || key === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (key === 'fillText') return text => this.text.push(String(text));
      return () => {};
    } });
  }
  getContext() { return this.ctx; }
  setAttribute(key, value) { this.attrs[key] = value; }
  get nextSibling() { const list = this.parentNode?.children || []; return list[list.indexOf(this) + 1] || null; }
  getBoundingClientRect() {
    const value = (key, fallback) => /^\d+(?:\.\d+)?px$/.test(this.style[key] || '') ? parseFloat(this.style[key]) : fallback;
    return { left: value('left', this.rect.left), top: value('top', this.rect.top), width: value('width', this.rect.width), height: value('height', this.rect.height) };
  }
  remove() { if (this.parentNode) { this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; } }
}
const oldDocument = globalThis.document, oldStyle = globalThis.getComputedStyle;
globalThis.document = { createElement: () => new Canvas() };
globalThis.getComputedStyle = canvas => ({ opacity: canvas.cssOpacity || '1' });
after(() => { globalThis.document = oldDocument; globalThis.getComputedStyle = oldStyle; });

function fixture(width = 1440, height = 760) {
  const canvas = new Canvas(width, height);
  const parent = { children: [canvas], insertBefore(child, before) {
    const index = before ? this.children.indexOf(before) : this.children.length;
    this.children.splice(Math.max(0, index), 0, child); child.parentNode = this;
  } }; canvas.parentNode = parent;
  const gl = { shadowMap: {}, capabilities: { getMaxAnisotropy: () => 1 }, sizes: [],
    setPixelRatio(value) { this.dpr = value; }, setSize(...args) { this.sizes.push(args); }, render() {}, dispose() {} };
  return { canvas, parent, gl };
}

test('WebGL loss preserves the input canvas, listeners and resized aim coordinates', () => {
  const { canvas, parent, gl } = fixture();
  const renderer = createRenderer(canvas, { renderer: gl });
  let pointers = 0, fallbacks = 0;
  canvas.addEventListener('pointerdown', () => pointers++);
  canvas.addEventListener('pool-renderer-fallback', () => fallbacks++);
  renderer.render(createGame(), { aim: 0, power: .7 });
  canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  assert.equal(renderer.canvas, canvas); assert.equal(renderer.kind, 'canvas');
  assert.equal(fallbacks, 1); assert.equal(parent.children.length, 2);
  const overlay = parent.children[1]; assert.equal(overlay.style.pointerEvents, 'none'); assert.equal(overlay.attrs['aria-hidden'], 'true');
  canvas.dispatchEvent(new Event('pointerdown')); assert.equal(pointers, 1);
  canvas.offsetLeft = 310; canvas.rect = { left: 310, top: 0, width: 1130, height: 760 }; canvas.cssOpacity = '.7';
  renderer.resize(); assert.equal(overlay.style.left, '310px'); assert.equal(overlay.style.width, '1130px'); assert.equal(overlay.style.opacity, '.7');
  const origin = renderer.screenToTable(310 + 1130 / 2, 380);
  assert.ok(Math.abs(origin.x) < 1e-8 && Math.abs(origin.z) < 1e-8);
  canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true })); assert.equal(parent.children.length, 2);
  renderer.dispose(); assert.equal(parent.children.length, 1); assert.equal(canvas.style.filter, '');
});

test('full table fits desktop and portrait, with accurate inverse aim and pocket numbering', () => {
  const { canvas, gl } = fixture(); const renderer = new PoolRenderer(canvas, { renderer: gl }); const game = createGame();
  for (const [width, height] of [[1440, 760], [430, 650], [844, 300]]) for (const view of ['table', 'overhead']) {
    canvas.rect.width = width; canvas.rect.height = height;
    renderer.setView(view); renderer.resize(true); renderer.render(game, { aim: 0, selectingPocket: true });
    for (const p of TABLE.pockets) {
      const ndc = new THREE.Vector3(p.x, 0, p.z).project(renderer.camera);
      assert.ok(Math.abs(ndc.x) < .97 && Math.abs(ndc.y) < .97);
      const world = renderer.screenToTable((ndc.x + 1) * width / 2, (1 - ndc.y) * height / 2);
      assert.ok(Math.abs(world.x - p.x) < 1e-7 && Math.abs(world.z - p.z) < 1e-7);
      assert.deepEqual(renderer.pocketLabels[p.id].material.map.image.text, [String(p.id + 1)]);
      assert.equal(renderer.pocketLabels[p.id].visible, true);
    }
  }
  for (let id = 1; id <= 15; id++) {
    const mesh = renderer.balls.get(id).mesh;
    assert.deepEqual(mesh.material.map.image.text, [String(id), String(id)]);
    assert.ok(new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.quaternion).y > .99);
  }
  renderer.render(game, { calledPocket: 2 });
  assert.deepEqual(renderer.pocketLabels.map(label => label.visible), [false, false, true, false, false, false]);
  assert.ok(gl.sizes.every(args => args[2] === false), 'Buffer resizing must preserve percentage/calc CSS dimensions.');
  renderer.dispose();
});

test('automatic quality tolerates stable 30 Hz and reduces detail only after sustained slow frames', () => {
  const { canvas, gl } = fixture(); const renderer = new PoolRenderer(canvas, { renderer: gl });
  for (let i = 0; i < 250; i++) renderer._adaptQuality(1 / 30);
  assert.equal(renderer.autoQualityLevel || 0, 0);
  for (let i = 0; i < 160; i++) renderer._adaptQuality(.05);
  assert.ok(renderer.autoQualityLevel >= 1);
  for (let i = 0; i < 160; i++) renderer._adaptQuality(.05);
  assert.equal(renderer.autoQualityLevel, 2); assert.equal(gl.shadowMap.enabled, false);
  renderer.quality = 'high'; renderer.resize(true); assert.equal(gl.shadowMap.enabled, true);
  renderer.dispose();
});
