const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const number = (value, fallback) => Number.isFinite(value) ? value : fallback;
const rounded = value => Math.round(value * 1000) / 1000;

function stick(size, kind) {
  const knob = clamp(size * .4, kind === 'move' ? 28 : 36, kind === 'move' ? 44 : 56);
  const footprint = Math.max(size, .68 * size + knob);
  return { size, knob, padWidth: Math.max(kind === 'move' ? 104 : 128, footprint + 16) };
}

function fitStick(requested, budget, kind) {
  // The normal phone layouts keep generous pickup pads. The final cap also
  // bounds malformed or exceptionally narrow viewports without NaN geometry.
  const original = stick(requested, kind);
  if (budget < (kind === 'move' ? 104 : 128)) {
    const ratio = budget / original.padWidth;
    return { size: original.size * ratio, knob: original.knob * ratio, padWidth: budget, padHeight: budget + 18 };
  }
  let low = 0, high = requested;
  for (let i = 0; i < 32; i++) {
    const middle = (low + high) / 2;
    const probe = stick(middle, kind);
    if (probe.padWidth <= budget) low = middle; else high = middle;
  }
  const fitted = stick(stick(requested, kind).padWidth <= budget ? requested : low, kind);
  if (fitted.padWidth > budget) {
    const ratio = budget / fitted.padWidth;
    fitted.size *= ratio; fitted.knob *= ratio; fitted.padWidth = budget;
  }
  fitted.padHeight = fitted.padWidth + 18;
  return fitted;
}

/** Resolve independent stick preferences to the available viewport.
 * Coordinates are CSS pixels; every `bottom` already includes the supplied
 * safe bottom inset. CSS must apply these values directly, without adding a
 * second safe-area offset. Saved preference values are never modified.
 */
export function touchControlLayout({ width = 390, height = 844, moveScale = .8, aimScale = 1.5, left = 8, right = 8, bottom = 14, landscape = false } = {}) {
  width = Math.max(160, number(width, 390)); height = Math.max(180, number(height, 844));
  left = clamp(number(left, 8), 0, width / 4); right = clamp(number(right, 8), 0, width / 4);
  bottom = clamp(number(bottom, 14), 0, height / 4);
  landscape = landscape === true;
  const desiredMove = clamp(number(moveScale, .8), .6, 1.2) * 100;
  const desiredAim = clamp(number(aimScale, 1.5), 1, 2) * 100;
  const usable = width - left - right;
  const dockWidth = landscape ? Math.min(139, usable * .3) : Math.min(48, usable * .2);
  const nominalGap = landscape ? 16 : 8;
  const gap = Math.min(nominalGap, Math.max(0, (usable - 232 - dockWidth) / 2));
  const padBudget = Math.max(1, usable - dockWidth - gap * 2);
  const minAimPad = Math.min(128, padBudget * .56);
  const moveBudget = Math.max(1, padBudget - minAimPad);
  const move = fitStick(Math.min(desiredMove, landscape ? height * .34 : desiredMove), moveBudget, 'move');
  const aim = fitStick(Math.min(desiredAim, landscape ? height * .44 : desiredAim), padBudget - move.padWidth, 'aim');
  Object.assign(move, { left, bottom });
  Object.assign(aim, { left: width - right - aim.padWidth, right, bottom });
  const gapLeft = left + move.padWidth, gapRight = aim.left;
  const center = (gapLeft + gapRight) / 2;
  const dock = { left: center - dockWidth / 2, bottom: bottom + (landscape ? 3 : 8), width: dockWidth, height: landscape ? 46 : 104, vertical: !landscape };
  const moveActions = { left, bottom: bottom + move.padHeight + 8, width: 155, height: 44 };
  const aimStatus = { right, bottom: bottom + aim.padHeight + 8, width: Math.min(128, aim.padWidth), height: 70 };
  // Regroup extends beyond the smaller movement pad. In an unusually narrow
  // viewport, put that row above the aim pad rather than crossing its hit area.
  if (moveActions.left + moveActions.width > aim.left - 4) moveActions.bottom = Math.max(moveActions.bottom, bottom + aim.padHeight + 8);
  if (moveActions.left + moveActions.width > width - right - aimStatus.width - 4 &&
      moveActions.bottom < aimStatus.bottom + aimStatus.height + 8 &&
      moveActions.bottom + moveActions.height + 8 > aimStatus.bottom) {
    moveActions.bottom = aimStatus.bottom + aimStatus.height + 8;
  }
  const assistWidth = landscape ? Math.min(116, gapRight - gapLeft - 8) : dockWidth;
  const assist = {
    left: center - assistWidth / 2,
    bottom: landscape ? dock.bottom + dock.height + 8 : Math.max(dock.bottom + dock.height + 8, moveActions.bottom + moveActions.height + 8),
    width: Math.max(1, assistWidth), height: 44,
  };
  let tray;
  if (landscape) {
    const trayLeft = Math.max(gapLeft, moveActions.left + moveActions.width) + 16;
    const trayRight = Math.min(gapRight, width - aimStatus.right - aimStatus.width) - 16;
    const trayWidth = Math.max(1, Math.min(400, trayRight - trayLeft));
    const trayBottom = dock.bottom + dock.height + 8;
    tray = { left: (trayLeft + trayRight - trayWidth) / 2, bottom: trayBottom, width: trayWidth, maxHeight: Math.max(88, height - trayBottom - 54) };
  } else {
    const trayWidth = Math.min(352, Math.max(1, usable - 8));
    const trayBottom = Math.max(moveActions.bottom + moveActions.height, aimStatus.bottom + aimStatus.height, assist.bottom + assist.height) + 12;
    tray = { left: left + (usable - trayWidth) / 2, bottom: trayBottom, width: trayWidth, maxHeight: Math.max(88, height - trayBottom - 108) };
  }
  const result = { move, aim, dock, moveActions, aimStatus, assist, tray, controlHeight: bottom + Math.max(move.padHeight, aim.padHeight), landscape,
    fitted: Math.abs(move.size - desiredMove) > .01 || Math.abs(aim.size - desiredAim) > .01 };
  for (const group of [move, aim, dock, moveActions, aimStatus, assist, tray]) {
    for (const key of Object.keys(group)) if (typeof group[key] === 'number') group[key] = rounded(group[key]);
  }
  result.controlHeight = rounded(result.controlHeight);
  return result;
}
