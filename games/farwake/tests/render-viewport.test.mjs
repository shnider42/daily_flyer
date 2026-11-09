import test from 'node:test';
import assert from 'node:assert/strict';
import { pixelViewport, clientToCanvas, canvasToClient, pixelCamera, worldToCanvas, canvasToWorld, clientToWorld, beginPixelFrame } from '../dist/render-viewport.mjs';
import { drawSurface, generateSurface } from '../dist/surface.mjs';
import { SpaceRenderer, drawShip } from '../dist/space-art.mjs';

const near = (actual, expected, message = '') => assert.ok(Math.abs(actual - expected) < 1e-8, `${message}: ${actual} versus ${expected}`);
for (const dpr of [1, 1.25, 2, 3]) test(`DPR ${dpr}: portrait/landscape pixels and fractional viewport origins land on the device grid`, () => {
  for (const [width, height] of [[390.333, 844.667], [844.5, 390.25], [1365, 768]]) {
    const left = .375, top = 54.5, view = pixelViewport({ width, height, left, top, dpr });
    assert.equal(Number.isInteger(view.physicalPixelsPerPixel), true);
    near(view.cssScale * dpr, view.physicalPixelsPerPixel, 'one logical pixel is a whole device block');
    near(view.left * dpr, view.physicalLeft); near(view.top * dpr, view.physicalTop);
    near(view.cssWidth * dpr, view.physicalWidth); near(view.cssHeight * dpr, view.physicalHeight);
    assert.ok(view.left <= left + 1e-8 && view.top <= top + 1e-8, 'alignment cannot reveal an empty edge');
    assert.ok(view.left + view.cssWidth >= left + width - 1e-8 && view.top + view.cssHeight >= top + height - 1e-8, 'the integer canvas covers the viewport');
    assert.ok(view.cssWidth < width + view.cssScale + 1 / dpr && view.cssHeight < height + view.cssScale + 1 / dpr, 'overflow stays below one game pixel plus alignment');
    if ([1, 2, 3].includes(dpr)) assert.equal(view.cssScale, 2, 'ordinary desktop and phone art keeps its established size');
  }
});

test('DPR3 toolbar movement and visual zoom retain integer physical pixels without changing game state', () => {
  for (const visualScale of [1, 1.1, 1.25, 1.5]) for (const top of [0, 46.25, 54.5, 85.333]) {
    const input = Object.freeze({ width: 428, height: 731.5, left: .25, top, dpr: 3, scale: 2, visualScale, visualOffsetX: .125, visualOffsetY: 12.375 });
    const view = pixelViewport(input);
    near((view.left - input.visualOffsetX) * view.deviceScale, view.physicalLeft);
    near((view.top - input.visualOffsetY) * view.deviceScale, view.physicalTop);
    near(view.cssScale * view.deviceScale, Math.round(2 * 3 * visualScale));
    assert.equal(input.top, top); assert.ok(Number.isInteger(view.logicalWidth) && Number.isInteger(view.logicalHeight));
  }
  assert.deepEqual(pixelViewport({ width: 428, height: 926, dpr: 3 }), pixelViewport({ width: 428, height: 926, dpr: 3, visualScale: 1, visualOffsetX: 0, visualOffsetY: 0 }));
});

test('zooming out uses a bounded native raster while 100% and zoom-in keep the original art grid',()=>{
 for(const dpr of[1,1.25,2,3])for(const mode of['ship','person']){
  const input={width:390.333,height:844.667,left:.375,top:54.5,dpr,mode},base=pixelViewport(input);
  assert.deepEqual(pixelViewport({...input,zoom:1}),base);assert.deepEqual(pixelViewport({...input,zoom:1.6}),base);
  for(const zoom of[.25,.5,.8,.95]){
   const view=pixelViewport({...input,zoom});
   assert.equal(view.physicalPixelsPerPixel,1,'never shrink detail into coarse blocks before enlargement');
   assert.equal(view.logicalWidth,view.physicalWidth);assert.equal(view.logicalHeight,view.physicalHeight);
   near(view.cssScale*view.rasterScale,base.cssScale,'extra samples must not change world size');
   assert.ok(view.logicalWidth<=Math.ceil(input.width*dpr)+1&&view.logicalHeight<=Math.ceil(input.height*dpr)+1,'native buffer stays within a one-pixel viewport alignment allowance');
  }
 }
});

test('80% zoom retains one-pixel details without coarse-grid dropouts or panning shimmer',()=>{
 for(const dpr of[1,1.25,2,3])for(const mode of['ship','person']){
  const viewport=pixelViewport({width:390,height:844,dpr,zoom:.8,mode}),zoom=.8*(mode==='ship'?.7:1)*viewport.rasterScale;
  let previous;
  for(let frame=0;frame<30;frame++){
   const view=pixelCamera({cameraX:100.37+frame*.037,cameraY:0,width:viewport.logicalWidth,height:viewport.logicalHeight,zoom,centered:true});
   // A run of alternating one-world-pixel trim details must give every color
   // a physical sample. The old coarse intermediate raster loses some entirely.
   const widths=Array.from({length:64},(_,x)=>worldToCanvas(x+1,0,view).x-worldToCanvas(x,0,view).x);
   assert.ok(Math.min(...widths)>=1,'one-pixel hull/window detail survives');
   assert.ok(Math.max(...widths)-Math.min(...widths)<=1,'any uneven spacing is at most one physical screen pixel');
   if(previous)assert.deepEqual(widths,previous,'the world grid has stable phase while the camera moves');
   previous=widths;
  }
 }
});

test('labels and pointer picking use the same aligned canvas bounds, including actual measured CSS rounding', () => {
  const viewport = pixelViewport({ width: 428.25, height: 799.5, left: .125, top: 54.5, dpr: 3, visualScale: 1.1 });
  const rect = { left: viewport.left + .003, top: viewport.top - .002, width: viewport.cssWidth + .005, height: viewport.cssHeight - .004 };
  const view = pixelCamera({ cameraX: 123.456, cameraY: -34.789, zoom: .7, width: viewport.logicalWidth, height: viewport.logicalHeight, centered: true });
  for (const point of [{ x: 0, y: 0 }, { x: 36.5, y: 20.75 }, { x: viewport.logicalWidth - 1, y: viewport.logicalHeight - 1 }]) {
    const client = canvasToClient(point.x, point.y, viewport, rect), canvas = clientToCanvas(client.x, client.y, viewport, rect);
    near(canvas.x, point.x); near(canvas.y, point.y);
    const world = clientToWorld(client.x, client.y, viewport, view, rect), expected = canvasToWorld(point.x, point.y, view);
    near(world.x, expected.x); near(world.y, expected.y);
  }
});

test('one snapped raster origin preserves detail spacing while the continuous camera moves', () => {
  let separation;
  for (let frame = 0; frame < 80; frame++) {
    const camera = Object.freeze({ cameraX: 142.123 + frame * .0317, cameraY: 77.888 - frame * .027, zoom: .7, width: 215, height: 389, centered: true });
    const view = pixelCamera(camera), first = worldToCanvas(170.1, 95.1, view), second = worldToCanvas(171.3, 96.3, view);
    const delta = { x: second.x - first.x, y: second.y - first.y };
    if (!separation) separation = delta; else assert.deepEqual(delta, separation, 'camera panning must not make stationary details swim relative to each other');
    assert.ok(Number.isInteger(view.offsetX) && Number.isInteger(view.offsetY));
    for (const screen of [first, second]) { const picked = canvasToWorld(screen.x, screen.y, view); assert.deepEqual(worldToCanvas(picked.x, picked.y, view), screen); }
    assert.equal(camera.cameraX, 142.123 + frame * .0317, 'the simulation/follow input remains unrounded');
  }
});

class Context {
  constructor(canvas) { this.canvas = canvas; this.transforms = []; this.fills = []; this.stack = []; this.rotations = []; this.reset(); }
  reset() { this.transform = [1.25, 0, 0, 1.25, .3, .7]; this.imageSmoothingEnabled = true; this.filter = 'blur(2px)'; this.globalAlpha = .3; this.globalCompositeOperation = 'screen'; this.shadowBlur = 5; this.shadowOffsetX = .5; this.shadowOffsetY = .5; this.shadowColor = '#fff'; }
  setTransform(...value) { this.transform = value; this.transforms.push(value); }
  save() { this.stack.push({ transform: [...this.transform], imageSmoothingEnabled: this.imageSmoothingEnabled, globalAlpha: this.globalAlpha }); }
  restore() { const state = this.stack.pop(); if (state) Object.assign(this, state); }
  translate(x, y) { this.transform[4] += x; this.transform[5] += y; }
  rotate(angle) { this.rotations.push(angle); }
  scale() {}
  clearRect() {}
  fillRect(x, y, w, h) { if (this.fills.length < 6) this.fills.push({ x, y, w, h, transform: [...this.transform], imageSmoothingEnabled: this.imageSmoothingEnabled, filter: this.filter, alpha: this.globalAlpha }); }
  drawImage() {}
  fillText() {}
  measureText(text) { return { width: String(text).length * 6 }; }
}
class Canvas { constructor(width, height) { this.width = width; this.height = height; this.ctx = new Context(this); } getContext() { return this.ctx; } }

test('both renderers rebuild sharp world state after a resize or inherited filtered transform', () => {
  const original = globalThis.OffscreenCanvas; globalThis.OffscreenCanvas = Canvas;
  try {
    const ctx = new Canvas(215, 390).ctx, surface = generateSurface({ id: 'ship:pixels', kind: 'ship', classId: 'sparrow' }, 'pixels');
    const person = { ...surface.spawn, x: surface.spawn.x + .23, y: surface.spawn.y + .45, health: 100 }, before = JSON.stringify(person);
    const view = drawSurface(ctx, surface, { person, width: 215, height: 390, labels: [] });
    assert.equal(JSON.stringify(person), before); assert.ok(Number.isInteger(view.cameraX) && Number.isInteger(view.cameraY));
    assert.deepEqual(ctx.fills[0].transform, [1, 0, 0, 1, 0, 0]); assert.equal(ctx.fills[0].filter, 'none'); assert.equal(ctx.fills[0].alpha, 1); assert.equal(ctx.imageSmoothingEnabled, false);
    ctx.reset(); ctx.fills = [];
    const game = { state: { systemId: 'pixels', stats: { time: 1 }, ship: { id: 'pixel-hull', classId: 'sparrow', x: 100.123, y: 200.456, angle: .321, hull: 100, maxHull: 100 } }, system: { bodies: [], enemies: [], traffic: [], asteroids: [], signals: [], bullets: [], pickups: [] } };
    const previous = JSON.stringify(game), renderer = new SpaceRenderer(), spaceView = renderer.draw(ctx, game, { width: 215, height: 390, labels: [], motion: false });
    assert.equal(JSON.stringify(game), previous); assert.deepEqual(renderer.camera, { x: 100.123, y: 200.456 });
    assert.deepEqual(ctx.fills[0].transform, [1, 0, 0, 1, 0, 0]); assert.equal(ctx.fills[0].filter, 'none'); assert.equal(ctx.imageSmoothingEnabled, false);
    const marker = worldToCanvas(150.75, 210.25, spaceView), picked = renderer.toWorld(marker.x, marker.y);
    assert.deepEqual(worldToCanvas(picked.x, picked.y, spaceView), marker);
    const priorRotations = ctx.rotations.length; drawShip(ctx, 80.4, 90.7, .321, '#c6d5c8', .7); assert.equal(ctx.rotations.at(-1), .321); assert.equal(ctx.rotations.length, priorRotations + 1, 'ship headings keep their continuous rotation');
  } finally { if (original === undefined) delete globalThis.OffscreenCanvas; else globalThis.OffscreenCanvas = original; }
});

test('pixel frame reset and empty/invalid viewport input remain safe during a transient mobile resize', () => {
  const ctx = new Canvas(1, 1).ctx; beginPixelFrame(ctx);
  assert.deepEqual(ctx.transform, [1, 0, 0, 1, 0, 0]); assert.equal(ctx.imageSmoothingEnabled, false); assert.equal(ctx.filter, 'none'); assert.equal(ctx.globalAlpha, 1); assert.equal(ctx.shadowBlur, 0);
  const view = pixelViewport({ width: 0, height: NaN, dpr: 0, visualScale: Infinity, scale: 0 });
  assert.equal(view.logicalWidth, 1); assert.equal(view.logicalHeight, 1); assert.ok(Object.values(view).every(Number.isFinite));
});
