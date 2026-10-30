export function resolveTouchPreset(saved, { coarse = false, width = 1024, height = 768 } = {}) {
  if (['compact', 'standard', 'large'].includes(saved)) return saved;
  return coarse && Math.min(width, height) <= 600 ? 'compact' : 'standard';
}

// Movement follows the live pad dimensions, so all presets reach full speed.
// Pointer capture permits the thumb to continue dragging beyond the visible pad.
export function joystickVector(bounds, clientX, clientY) {
  const radius = Math.max(1, Math.min(bounds.width, bounds.height) * .33);
  let dx = clientX - (bounds.left + bounds.width / 2);
  let dy = clientY - (bounds.top + bounds.height / 2);
  const length = Math.hypot(dx, dy);
  if (length > radius) { dx = dx / length * radius; dy = dy / length * radius; }
  const x = dx / radius, y = dy / radius;
  return { x: Math.abs(x) < .1 ? 0 : x, y: Math.abs(y) < .1 ? 0 : y, dx, dy };
}
