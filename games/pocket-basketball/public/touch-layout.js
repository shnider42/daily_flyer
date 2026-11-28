/** Semantic touch actions stay attached to their buttons; only face positions move. */
export const TOUCH_SLOTS = Object.freeze(['Y', 'X', 'B', 'A']);
export const DEFAULT_TOUCH_LAYOUT = Object.freeze({ Y: 'screen', X: 'sprint', B: 'shoot', A: 'pass' });
const ACTIONS = Object.freeze(Object.values(DEFAULT_TOUCH_LAYOUT));

/**
 * Preserve valid unique assignments in face order, then repair empty slots.
 * Missing settings use the new defaults. A partial or damaged save cannot
 * remove an action, assign it twice, or invoke an inherited property/getter.
 */
export function normalizeTouchLayout(value) {
  const layout = {}, used = new Set();
  let source = null;
  try { if (value && typeof value === 'object' && !Array.isArray(value)) source = value; } catch { /* Invalid persisted value. */ }
  for (const slot of TOUCH_SLOTS) {
    let action;
    try { action = source ? Object.getOwnPropertyDescriptor(source, slot)?.value : undefined; } catch { /* Treat unreadable slots as missing. */ }
    if (ACTIONS.includes(action) && !used.has(action)) {
      layout[slot] = action;
      used.add(action);
    }
  }
  for (const slot of TOUCH_SLOTS) {
    if (Object.hasOwn(layout, slot)) continue;
    const action = !used.has(DEFAULT_TOUCH_LAYOUT[slot]) ? DEFAULT_TOUCH_LAYOUT[slot]
      : ACTIONS.find(candidate => !used.has(candidate));
    layout[slot] = action;
    used.add(action);
  }
  // Always return the same slot order, including when a partial save was repaired.
  return Object.fromEntries(TOUCH_SLOTS.map(slot => [slot, layout[slot]]));
}

/** Move an action to a face button, swapping its old position with that button's action. */
export function assignTouchAction(value, slot, action) {
  const layout = normalizeTouchLayout(value);
  if (!TOUCH_SLOTS.includes(slot) || !ACTIONS.includes(action)) return layout;
  const previousSlot = TOUCH_SLOTS.find(candidate => layout[candidate] === action);
  const displacedAction = layout[slot];
  layout[slot] = action;
  layout[previousSlot] = displacedAction;
  return layout;
}

/** Return a face letter for a semantic action, or null for an unknown action. */
export function touchButtonFor(value, action) {
  if (!ACTIONS.includes(action)) return null;
  const layout = normalizeTouchLayout(value);
  return TOUCH_SLOTS.find(slot => layout[slot] === action) ?? null;
}
