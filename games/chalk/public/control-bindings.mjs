/** Desktop bindings use physical KeyboardEvent.code values and Mouse0–Mouse4.
 * Keep the table in one place: gameplay, rebinding and help all read this model.
 * Escape always remains available to close a view or open the mission menu.
 */
const definitions = [
  ['moveUp', 'Move up', 'Movement', ['KeyW', 'ArrowUp'], true, 'Move toward the top of the screen.'],
  ['moveDown', 'Move down', 'Movement', ['KeyS', 'ArrowDown'], true, 'Move toward the bottom of the screen.'],
  ['moveLeft', 'Move left', 'Movement', ['KeyA', 'ArrowLeft'], true, 'Move toward the left of the screen.'],
  ['moveRight', 'Move right', 'Movement', ['KeyD', 'ArrowRight'], true, 'Move toward the right of the screen.'],
  ['sprint', 'Sprint', 'Movement', ['ShiftLeft', 'ShiftRight'], true, 'Hold while moving to run.'],
  ['fire', 'Fire', 'Equipment', ['Mouse0', null], true, 'Aim with the cursor and hold to shoot.'],
  ['interact', 'Help / interact', 'Equipment', ['KeyE', null], true, 'Hold near a wounded person or an objective that needs work.'],
  ['reload', 'Reload', 'Equipment', ['KeyR', null], false, 'Refill the weapon from your spare ammunition.'],
  ['cycleThrowable', 'Choose grenade', 'Equipment', ['KeyY', null], false, 'Cycle through frag, flashbang and smoke.'],
  ['throwThrowable', 'Throw selected grenade', 'Equipment', ['KeyN', null], false, 'Throw the selected grenade toward the cursor.'],
  ['smoke', 'Throw smoke', 'Equipment', ['KeyG', null], false, 'Throw smoke directly, without changing the selected grenade.'],
  ['observe', 'Binoculars', 'Equipment', ['KeyB', null], false, 'Mercer can raise binoculars to look farther.'],
  ['launcher', 'Fire 40 mm launcher', 'Equipment', ['KeyV', null], false, 'Mercer fires the separate grenade launcher toward the cursor.'],
  ['ping', 'Ping a location', 'Squad', ['Mouse1', 'KeyP'], false, 'Mark a location for the squad without changing anyone’s orders.'],
  ['moveOrder', 'Order squad to move', 'Squad', ['Mouse2', 'KeyT'], false, 'As leader, send the squad to the cursor.'],
  ['regroup', 'Regroup / Ready', 'Squad', ['KeyQ', null], false, 'As leader, call the squad back. As a member, tell the leader you are ready.'],
  ['hold', 'Hold / Wait', 'Squad', ['KeyH', null], false, 'As leader, stop the squad here. As a member, ask the leader to wait.'],
  ['assist', 'Assist / Help', 'Squad', ['KeyF', null], false, 'Ask the squad to help the wounded.'],
  ['soldier1', 'Control Hale', 'Squad', ['Digit1', null], false, 'Take control of the squad leader when that soldier is available.'],
  ['soldier2', 'Control Mercer', 'Squad', ['Digit2', null], false, 'Take control of the grenadier when that soldier is available.'],
  ['soldier3', 'Control Ames', 'Squad', ['Digit3', null], false, 'Take control of the medic when that soldier is available.'],
  ['soldier4', 'Control Webb', 'Squad', ['Digit4', null], false, 'Take control of the machine gunner when that soldier is available.'],
  ['map', 'Open / close map', 'Interface', ['KeyM', null], false, 'Show the whole map or return to the battlefield.'],
  ['radio', 'Open radio decision', 'Interface', ['KeyC', null], false, 'Read a radio decision when one is available.'],
  ['reply1', 'First radio reply', 'Interface', ['KeyZ', null], false, 'Choose the first reply while a radio decision is open.'],
  ['reply2', 'Second radio reply', 'Interface', ['KeyX', null], false, 'Choose the second reply while a radio decision is open.'],
  ['pause', 'Mission menu / back', 'Interface', ['Escape', null], false, 'Open the mission menu or close the current view. Escape always works.'],
  ['fps', 'Show performance', 'Interface', ['F3', null], false, 'Show or hide frame rate and render resolution.'],
];

export const CONTROL_ACTIONS = Object.freeze(definitions.map(([id, label, group, defaults, held, description]) =>
  Object.freeze({ id, label, group, defaults: Object.freeze(defaults), held, description })));
export const DEFAULT_BINDINGS = Object.freeze(Object.fromEntries(CONTROL_ACTIONS.map(action => [action.id, action.defaults])));
const actionIds = new Set(CONTROL_ACTIONS.map(action => action.id));
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

// Tab and Escape retain keyboard navigation/cancellation. Browser and OS shortcuts
// are intentionally excluded; unmodified F3 stays available for the FPS display.
const supportedKeys = new Set([
  ...Array.from({ length: 26 }, (_, index) => `Key${String.fromCharCode(65 + index)}`),
  ...Array.from({ length: 10 }, (_, index) => `Digit${index}`),
  ...Array.from({ length: 10 }, (_, index) => `Numpad${index}`),
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight',
  'Enter', 'NumpadEnter', 'CapsLock', 'Home', 'End', 'PageUp', 'PageDown', 'Insert', 'Delete', 'Pause',
  'Backquote', 'Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Backslash', 'IntlBackslash',
  'Semicolon', 'Quote', 'Comma', 'Period', 'Slash',
  'NumpadAdd', 'NumpadSubtract', 'NumpadMultiply', 'NumpadDivide', 'NumpadDecimal',
  'F2', 'F3', 'F4', 'F7', 'F8', 'F9', 'F10', 'Escape',
]);
const mouseToken = token => typeof token === 'string' && /^Mouse[0-4]$/.test(token);
export const isBindingToken = token => typeof token === 'string' && (supportedKeys.has(token) || mouseToken(token));
const validForAction = (token, action) => token === null || isBindingToken(token) && (token !== 'Escape' || action === 'pause');

export function createDefaultBindings() {
  return Object.fromEntries(CONTROL_ACTIONS.map(action => [action.id, [...action.defaults]]));
}

/** Migrate saved controls, retaining explicit unbound slots and removing conflicts.
 * Explicit saved choices win over inherited defaults. Two malformed explicit
 * assignments resolve in table order, so a token can never fire two actions.
 * This runs when preferences change, never in the frame/input hot path.
 */
export function normalizeBindings(raw, fallback = DEFAULT_BINDINGS) {
  const input = isRecord(raw) ? raw : {};
  const base = isRecord(fallback) ? fallback : DEFAULT_BINDINGS;
  const result = Object.fromEntries(CONTROL_ACTIONS.map(action => [action.id, [null, null]]));
  const candidates = [];
  for (const { id, defaults } of CONTROL_ACTIONS) {
    const saved = Object.hasOwn(input, id) && Array.isArray(input[id]) ? input[id] : null;
    const inherited = Object.hasOwn(base, id) && Array.isArray(base[id]) ? base[id] : defaults;
    for (let slot = 0; slot < 2; slot++) {
      let token, priority;
      if (saved && (saved[slot] === undefined || validForAction(saved[slot], id))) {
        token = saved[slot] ?? null; priority = 2;
      } else if (validForAction(inherited[slot], id)) {
        token = inherited[slot]; priority = 1;
      } else if (slot >= inherited.length) {
        token = null; priority = 1;
      } else { token = defaults[slot]; priority = 0; }
      if (token !== null) candidates.push({ id, slot, token, priority });
    }
  }
  const assigned = new Set();
  for (const { id, slot, token } of candidates.sort((a, b) => b.priority - a.priority)) {
    if (assigned.has(token)) continue;
    assigned.add(token); result[id][slot] = token;
  }
  return result;
}

/** Return an unmodified key/button token. Touch events and browser shortcut
 * chords are not gameplay bindings; Shift remains usable while sprinting.
 */
export function eventToken(event) {
  if (!event || event.isComposing || event.metaKey || event.altKey || event.ctrlKey) return null;
  if (typeof event.code === 'string' && event.code) return supportedKeys.has(event.code) ? event.code : null;
  if (event.pointerType === 'touch') return null;
  return Number.isInteger(event.button) && event.button >= 0 && event.button <= 4 ? `Mouse${event.button}` : null;
}

const labels = {
  Mouse0: 'Left mouse', Mouse1: 'Middle mouse', Mouse2: 'Right mouse', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Space',
  ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', Enter: 'Enter', Escape: 'Esc',
  NumpadEnter: 'Num Enter', CapsLock: 'Caps Lock', PageUp: 'Page Up', PageDown: 'Page Down',
  Backquote: '`', Minus: '−', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', IntlBackslash: '\\',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
  NumpadAdd: 'Num +', NumpadSubtract: 'Num −', NumpadMultiply: 'Num ×', NumpadDivide: 'Num /', NumpadDecimal: 'Num .',
};
export function bindingLabel(token) {
  if (!isBindingToken(token)) return 'Unbound';
  if (labels[token]) return labels[token];
  if (/^Key[A-Z]$/.test(token)) return token.slice(3);
  if (/^Digit\d$/.test(token)) return token.slice(5);
  if (/^Numpad\d$/.test(token)) return `Num ${token.slice(6)}`;
  return token;
}
function tokensForAction(action, bindings) {
  if (!actionIds.has(action)) return [];
  return Array.isArray(bindings?.[action]) ? bindings[action] : DEFAULT_BINDINGS[action];
}
export function actionLabel(action, bindings = DEFAULT_BINDINGS, separator = ' / ') {
  const tokens = tokensForAction(action, bindings).filter(token => validForAction(token, action) && token !== null);
  if (action === 'pause' && !tokens.includes('Escape')) tokens.push('Escape');
  return tokens.length ? [...new Set(tokens)].map(bindingLabel).join(separator) : 'Unbound';
}

export function actionsForToken(token, bindings = DEFAULT_BINDINGS) {
  if (token === 'Escape') return ['pause'];
  if (!isBindingToken(token)) return [];
  const action = CONTROL_ACTIONS.find(action => tokensForAction(action.id, bindings).includes(token));
  return action ? [action.id] : [];
}
export function actionHeld(action, heldSet, bindings = DEFAULT_BINDINGS) {
  if (!heldSet || typeof heldSet.has !== 'function') return false;
  if (action === 'pause' && heldSet.has('Escape')) return true;
  return tokensForAction(action, bindings).some(token => token !== null && validForAction(token, action) && heldSet.has(token));
}

/** Reassign one slot without mutating the caller. Conflicting actions stay intact
 * until the UI explicitly retries with resolveConflict:true. The caller can show
 * the returned conflicts before replacing their assignments.
 */
export function rebindControl(bindings, action, slot, token, { resolveConflict = false } = {}) {
  const current = normalizeBindings(bindings);
  if (!actionIds.has(action) || !Number.isInteger(slot) || slot < 0 || slot > 1)
    return { ok: false, bindings: current, conflicts: [], reason: 'Choose a control and one of its two slots.' };
  if (!validForAction(token, action)) return {
    ok: false, bindings: current, conflicts: [],
    reason: token === 'Escape' ? 'Escape is reserved for the mission menu and cancelling.' : 'Use a letter, number, arrow, supported key, or mouse button. Browser shortcuts stay reserved.',
  };
  const conflicts = [];
  if (token !== null) for (const definition of CONTROL_ACTIONS) {
    if (definition.id === action) continue;
    current[definition.id].forEach((assigned, index) => {
      if (assigned === token) conflicts.push({ action: definition.id, slot: index, label: definition.label });
    });
  }
  if (conflicts.length && !resolveConflict) return { ok: false, bindings: current, conflicts, reason: 'That key or button is already assigned.' };
  for (const conflict of conflicts) current[conflict.action][conflict.slot] = null;
  if (token !== null) current[action] = current[action].map(assigned => assigned === token ? null : assigned);
  current[action][slot] = token;
  return { ok: true, bindings: current, conflicts, reason: '' };
}
