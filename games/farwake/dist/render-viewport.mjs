/** Pixel-art presentation geometry. Simulation and network coordinates stay continuous. */
import { normalizeModeZoom } from './camera-preferences.mjs';
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const positive = (value, fallback = 1) => { const n = number(value, fallback); return n > 0 ? n : fallback; };
const zero = value => Math.abs(value) < 1e-10 ? 0 : value;

/**
 * Cover a CSS viewport with whole physical-device pixels per game pixel.
 * `left/top` are its boundingClientRect origin; visual offsets/scale come from
 * visualViewport when available. Apply cssWidth/Height and offsetX/Y directly;
 * never subsequently stretch the canvas back to 100% of the container.
 * Below 100%, render straight onto the physical display grid. Shrinking source
 * art into the old coarse game grid first discards details that its final
 * enlargement cannot recover. rasterScale compensates the world transform so
 * this extra sampling resolution changes neither the camera nor the UI size.
 * The buffer never exceeds the physical viewport; this is not supersampling.
 */
export function pixelViewport({ width = 1, height = 1, left = 0, top = 0, dpr = 1, scale = 2, visualScale = 1, visualOffsetX = 0, visualOffsetY = 0, zoom = 1, mode = 'ship' } = {}) {
  width = Math.max(1, number(width, 1)); height = Math.max(1, number(height, 1));
  left = number(left); top = number(top); visualOffsetX = number(visualOffsetX); visualOffsetY = number(visualOffsetY);
  const deviceScale = positive(dpr) * positive(visualScale), baselinePixelsPerPixel = Math.max(1, Math.round(positive(scale, 2) * deviceScale));
  const physicalPixelsPerPixel = normalizeModeZoom(zoom, mode) < 1 ? 1 : baselinePixelsPerPixel, rasterScale = baselinePixelsPerPixel / physicalPixelsPerPixel;
  const cssScale = physicalPixelsPerPixel / deviceScale;
  // Floor the origin so alignment never reveals a thin uncovered strip.
  const physicalLeft = Math.floor((left - visualOffsetX) * deviceScale + 1e-8), physicalTop = Math.floor((top - visualOffsetY) * deviceScale + 1e-8);
  const offsetX = zero(physicalLeft / deviceScale + visualOffsetX - left), offsetY = zero(physicalTop / deviceScale + visualOffsetY - top);
  const logicalWidth = Math.max(1, Math.ceil((width - offsetX) / cssScale - 1e-9)), logicalHeight = Math.max(1, Math.ceil((height - offsetY) / cssScale - 1e-9));
  return { logicalWidth, logicalHeight, cssWidth: logicalWidth * cssScale, cssHeight: logicalHeight * cssScale, cssScale, offsetX, offsetY,
    left: left + offsetX, top: top + offsetY, deviceScale, physicalPixelsPerPixel, physicalWidth: logicalWidth * physicalPixelsPerPixel, physicalHeight: logicalHeight * physicalPixelsPerPixel,
    physicalLeft, physicalTop, rasterScale };
}

/** Use the measured canvas rect when available, including its aligned overflow. */
export function clientToCanvas(x, y, viewport, rect = null) {
  const bounds = rect || { left: viewport.left, top: viewport.top, width: viewport.cssWidth, height: viewport.cssHeight };
  return { x: (x - bounds.left) * viewport.logicalWidth / positive(bounds.width), y: (y - bounds.top) * viewport.logicalHeight / positive(bounds.height) };
}
export function canvasToClient(x, y, viewport, rect = null) {
  const bounds = rect || { left: viewport.left, top: viewport.top, width: viewport.cssWidth, height: viewport.cssHeight };
  return { x: bounds.left + x * bounds.width / viewport.logicalWidth, y: bounds.top + y * bounds.height / viewport.logicalHeight };
}

/** Snap only the camera's final raster origin; never round its follow state. */
export function pixelCamera({ cameraX = 0, cameraY = 0, width = 1, height = 1, zoom = 1, centered = false } = {}) {
  zoom = positive(zoom); cameraX = number(cameraX); cameraY = number(cameraY);
  const centerX = centered ? width / 2 : 0, centerY = centered ? height / 2 : 0;
  const offsetX = Math.round(centerX - cameraX * zoom), offsetY = Math.round(centerY - cameraY * zoom);
  return { cameraX: zero((centerX - offsetX) / zoom), cameraY: zero((centerY - offsetY) / zoom), width, height, zoom, offsetX, offsetY, centered };
}
export function worldToCanvas(x, y, view) { return { x: Math.round(x * view.zoom + view.offsetX), y: Math.round(y * view.zoom + view.offsetY) }; }
export function canvasToWorld(x, y, view) { return { x: (x - view.offsetX) / view.zoom, y: (y - view.offsetY) / view.zoom }; }
export function clientToWorld(x, y, viewport, view, rect = null) { const point = clientToCanvas(x, y, viewport, rect); return canvasToWorld(point.x, point.y, view); }

/** Canvas resize resets this state. Reapply before every world frame as well. */
export function beginPixelFrame(ctx) {
  ctx.imageSmoothingEnabled = false;
  if (typeof ctx.setTransform === 'function') ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  if ('filter' in ctx) ctx.filter = 'none';
  ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; ctx.shadowColor = 'transparent';
}
