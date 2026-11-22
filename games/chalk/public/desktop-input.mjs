import { segmentRectEntry } from './sim.mjs';

const pointIsFinite = point => !!point && Number.isFinite(point.x) && Number.isFinite(point.y);

/** Map a pointer with a cached DOM rectangle into the renderer's logical CSS pixels.
 * Pass renderer.width/height, never the canvas's backing-buffer dimensions.
 * Off-canvas coordinates are retained for pointer capture; `inside` distinguishes them.
 */
export function clientToCanvasPoint(clientX, clientY, rect, viewport = rect) {
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY) || !rect || !viewport ||
      !Number.isFinite(rect.left) || !Number.isFinite(rect.top) ||
      !Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0 ||
      !Number.isFinite(viewport.width) || !Number.isFinite(viewport.height) || viewport.width <= 0 || viewport.height <= 0) return null;
  const x = (clientX - rect.left) * viewport.width / rect.width;
  const y = (clientY - rect.top) * viewport.height / rect.height;
  return { x, y, inside: x >= 0 && y >= 0 && x <= viewport.width && y <= viewport.height };
}

/** First building touched by a requested aim segment. Uses the simulation's exact
 * zero-padding wall geometry. This is a cover cue, not hit prediction or weapon range.
 */
export function traceAim(world, from, to) {
  if (!pointIsFinite(from) || !pointIsFinite(to)) return null;
  let fraction = Infinity, wall = null;
  const buildings = Array.isArray(world?.buildings) ? world.buildings : [];
  for (const candidate of buildings) {
    if (!pointIsFinite(candidate) || !Number.isFinite(candidate.w) || !Number.isFinite(candidate.h) || candidate.w < 0 || candidate.h < 0) continue;
    const entry = segmentRectEntry(from, to, candidate);
    if (entry < fraction) { fraction = entry; wall = candidate; }
  }
  const blocked = Number.isFinite(fraction);
  if (!blocked) fraction = 1;
  const point = { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction };
  return { blocked, point, wall, fraction, distance: Math.hypot(point.x - from.x, point.y - from.y) };
}
