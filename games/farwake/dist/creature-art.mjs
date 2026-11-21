/** Wildlife silhouettes and physical attack tells. No simulation state is changed here. */
import { pixelRect as pixel, pixelLine, pixelRing } from './pixel-art.mjs';
import { clearSidearmSight } from './combat.mjs';
import { isCabinWalkable } from './interior-layouts.mjs';

export const NEW_CREATURE_ART = Object.freeze(['stoneback', 'skitter', 'rimehorn', 'tidebell', 'coilworm', 'kiln-crab', 'veilwing', 'root-snare']);
const supported = new Set(NEW_CREATURE_ART), sprites = new Map();
const palettes = Object.freeze({
  stoneback: ['#a69f84', '#596463', '#d0c8a7', '#e1be79'],
  skitter: ['#a6b991', '#4e7169', '#d0d8ab', '#edc482'],
  rimehorn: ['#bfd7d5', '#587c90', '#e4e8d2', '#8bd2e5'],
  tidebell: ['#86b7c4', '#426381', '#ceddd2', '#d6a5d1'],
  coilworm: ['#b89b7b', '#655a68', '#dcc9a1', '#e0ae79'],
  'kiln-crab': ['#c38a69', '#594b58', '#e1bb82', '#f2c26f'],
  veilwing: ['#9e9bc1', '#545e85', '#c9c9dd', '#83d1c9'],
  'root-snare': ['#91ad7c', '#4e6b63', '#d2cd9d', '#d7b48b']
});

export function creatureArtHeight(species) {
  return ({ stoneback: 38, skitter: 26, rimehorn: 50, tidebell: 58, coilworm: 30,
    'kiln-crab': 38, veilwing: 56, 'root-snare': 48, reedstalker: 49, 'mire-spitter': 32,
    shardling: 45, sporeback: 45, glassmaw: 36, 'ember-mite': 37, bellwether: 51 })[species] || 30;
}

function paint(ctx, species, front, step, pose, hurt, dead, color) {
  let [body, shade, light, accent] = palettes[species];
  body = hurt ? '#eed8b8' : color || body;
  const ready = pose === 'windup', recovering = pose === 'recovery', glow = ready ? '#f4ce91' : accent;
  pixel(ctx, '#0b2029', species === 'skitter' ? -18 : -30, -1, species === 'skitter' ? 36 : 60, 5);
  if (dead) {
    if (species === 'rimehorn') {
      pixel(ctx, shade, -24, -11, 45, 13); pixel(ctx, body, -20, -16, 33, 9);
      pixelLine(ctx, 16, -11, 31, -19, light, 3); pixelLine(ctx, 21, -8, 34, -7, light, 3);
    } else if (species === 'tidebell') {
      for (let i = -2; i <= 2; i++) pixelLine(ctx, i * 6, -5, i * 10 + 5, 5, shade, 2);
      pixel(ctx, body, -26, -12, 52, 8); pixel(ctx, light, -17, -14, 34, 3);
    } else if (species === 'coilworm') {
      for (let i = 0; i < 7; i++) { const x = -28 + i * 9, y = -4 - (i % 2) * 4; pixel(ctx, shade, x, y, 10, 8); pixel(ctx, body, x, y - 2, 9, 5); }
    } else if (species === 'kiln-crab') {
      pixel(ctx, shade, -24, -8, 48, 9); pixel(ctx, body, -21, -16, 41, 12);
      for (const s of [-1, 1]) { pixelLine(ctx, s * 20, -5, s * 35, -12, shade, 4); pixel(ctx, body, s * 37 - 6, -15, 12, 9); }
    } else if (species === 'veilwing') {
      for (const s of [-1, 1]) { pixelLine(ctx, s * 6, -9, s * 36, -5, shade, 6); pixelLine(ctx, s * 7, -6, s * 25, 2, body, 4); }
      pixel(ctx, body, -7, -14, 14, 12);
    } else if (species === 'root-snare') {
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; pixelLine(ctx, 0, -3, Math.cos(a) * 32, Math.sin(a) * 10 - 3, shade, 3); }
      pixel(ctx, body, -14, -17, 28, 12); pixel(ctx, shade, -9, -12, 18, 7);
    } else if (species === 'skitter') {
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) pixelLine(ctx, s * 6, -7 + i * 3, s * (14 + i * 2), -13 + i * 5, shade, 2);
      pixel(ctx, body, -9, -10, 18, 8);
    } else {
      pixel(ctx, shade, -24, -9, 48, 10); pixel(ctx, body, -21, -18, 38, 13);
      for (let i = -1; i <= 1; i++) pixel(ctx, light, i * 11 - 4, -20, 8, 7);
    }
    return;
  }
  if (species === 'stoneback') {
    const crouch = ready ? 4 : recovering ? 2 : 0;
    for (const s of [-1, 1]) for (const x of [-14, 9]) { pixelLine(ctx, x, -11 + crouch, x + s * 8, step * s, shade, 6); pixel(ctx, light, x + s * 8 - 3, step * s, 7, 3); }
    pixel(ctx, shade, -24, -24 + crouch, 48, 21); pixel(ctx, body, -23, -29 + crouch, 43, 19);
    for (const [x, y] of [[-19, -27], [-6, -34], [7, -30]]) { pixel(ctx, shade, x, y + crouch, 13, 15); pixel(ctx, light, x + 1, y + crouch, 11, 5); pixel(ctx, body, x + 1, y + 6 + crouch, 11, 7); }
    pixel(ctx, shade, front * 22 - 6, -19 + crouch, 14, 13); pixel(ctx, body, front * 28 - 5, -18 + crouch, 12, 10);
    pixel(ctx, glow, front * 29 - 1, -17 + crouch, 3, 2); pixelLine(ctx, front * 31, -7 + crouch, front * 36, -13 + crouch, light, 3);
  } else if (species === 'skitter') {
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
      const y = -17 + i * 5, x = 12 + (i % 2) * 5;
      pixelLine(ctx, s * 7, y, s * x, y - 3 + step * s, shade, 2);
      pixelLine(ctx, s * x, y - 3 + step * s, s * (x + 7), y + 4 + step * s, body, 2);
    }
    pixel(ctx, shade, -10, -21, 20, 20); pixel(ctx, body, -8, -23, 16, 17); pixel(ctx, light, -3, -23, 5, 15);
    pixel(ctx, shade, front * 8 - 5, -13, 10, 9);
    for (const y of [-14, -9]) { pixel(ctx, glow, front * 11, y, 2, 2); pixelLine(ctx, front * 12, y + 1, front * 20, y + (ready ? -2 : 4), light, 2); }
  } else if (species === 'rimehorn') {
    const crouch = ready ? 5 : recovering ? 3 : 0;
    for (const s of [-1, 1]) for (const x of [-17, 13]) { pixelLine(ctx, x, -14 + crouch, x + s * 4, 1 + step * s, shade, 5); pixel(ctx, light, x + s * 4 - 4, step * s, 9, 4); }
    pixel(ctx, shade, -26, -30 + crouch, 48, 23); pixel(ctx, body, -23, -35 + crouch, 40, 21);
    for (let i = 0; i < 5; i++) pixelLine(ctx, -19 + i * 8, -35 + crouch, -23 + i * 8, -18 + crouch, light, 2);
    pixel(ctx, shade, front * 21 - 9, -28 + crouch, 19, 17); pixel(ctx, body, front * 28 - 7, -27 + crouch, 15, 12);
    const tipY = ready ? -27 : -48;
    for (const s of [-1, 1]) { pixelLine(ctx, front * 23, -28 + crouch + s * 3, front * 31, tipY + s * 4, light, 4); pixelLine(ctx, front * 31, tipY + s * 4, front * 38, tipY + 3 + s * 4, body, 2); }
    pixel(ctx, glow, front * 29 - 1, -25 + crouch, 3, 2); pixel(ctx, shade, front * 35 - 2, -18 + crouch, 5, 4);
  } else if (species === 'tidebell') {
    const lift = recovering ? 4 : step;
    for (let i = -3; i <= 3; i++) { const x = i * 7, sway = (i % 2 ? step : -step) * 2; pixelLine(ctx, x, -25 + lift, x + sway, -11, shade, 2); pixelLine(ctx, x + sway, -11, x - i * 2, 2 + (i % 2) * 4, i % 2 ? body : light, 2); }
    for (const [y, w, col] of [[-55, 12, light], [-51, 21, body], [-44, 28, shade], [-36, 31, body], [-29, 25, light]]) pixel(ctx, col, -w, y + lift, w * 2, 9);
    pixel(ctx, shade, -12, -41 + lift, 24, 14); pixel(ctx, glow, -5, -42 + lift, 10, ready ? 15 : 9);
    for (const s of [-1, 1]) pixelLine(ctx, s * 12, -48 + lift, s * 20, -29 + lift, light, 2);
  } else if (species === 'coilworm') {
    const coil = ready || recovering;
    for (let i = 8; i >= 0; i--) {
      const a = i * .65, x = coil ? Math.cos(a) * (24 - i) : -front * (i * 6 - 18), y = coil ? Math.sin(a) * 9 - 12 : -10 + Math.sin(i * .8 + step) * 4;
      pixel(ctx, shade, x - 6, y - 5, 13, 13); pixel(ctx, body, x - 5, y - 8, 11, 9); pixel(ctx, light, x - 4, y - 8, 8, 2);
      pixelLine(ctx, x - 2, y + 5, x - front * 6, y + 8, shade, 2);
    }
    const hx = front * (coil ? 17 : 23), hy = coil ? -23 : -14;
    pixel(ctx, shade, hx - 9, hy - 8, 18, 17); pixel(ctx, body, hx - 7, hy - 10, 15, 12);
    for (const s of [-1, 1]) pixelLine(ctx, hx + front * 5, hy + s * 4, hx + front * 15, hy + s * (ready ? 9 : 5), light, 3);
    pixel(ctx, glow, hx + front * 5 - 1, hy - 7, 3, 3);
  } else if (species === 'kiln-crab') {
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { pixelLine(ctx, s * 18, -13 + i * 4, s * (30 + i * 3), -10 + i * 5 + step * s, shade, 4); pixelLine(ctx, s * (30 + i * 3), -10 + i * 5 + step * s, s * (35 + i * 3), -5 + i * 5 + step * s, body, 2); }
    pixel(ctx, shade, -26, -26, 52, 23); pixel(ctx, body, -24, -32, 48, 22); pixel(ctx, light, -18, -34, 36, 4);
    for (const x of [-15, -4, 7]) { pixel(ctx, shade, x, -28, 7, 18); pixel(ctx, ready ? glow : accent, x + 2, -22, 2, recovering ? 12 : 4); }
    for (const s of [-1, 1]) { const cy = ready ? -30 : recovering ? -4 : -18; pixelLine(ctx, s * 18, -17, s * 34, cy, shade, 5); pixel(ctx, body, s * 35 - 7, cy - 7, 14, 14); pixelLine(ctx, s * 35, cy, s * 42, cy - 9, light, 3); pixelLine(ctx, s * 35, cy + 1, s * 43, cy + 7, body, 3); }
    pixel(ctx, shade, front * 12 - 4, -8, 9, 8); for (const s of [-1, 1]) pixel(ctx, glow, front * 13 + s * 4, -9, 2, 3);
  } else if (species === 'veilwing') {
    const folded = ready || recovering, lift = folded ? 4 : step * 3;
    for (const s of [-1, 1]) {
      const tip = folded ? 25 : 43;
      pixelLine(ctx, s * 5, -37, s * tip, -49 + lift, light, 3);
      for (let i = 0; i < 5; i++) pixelLine(ctx, s * (9 + i * 2), -35 + i * 4, s * (tip - i * 4), -45 + lift + i * 4, i % 2 ? body : shade, 4);
      pixelLine(ctx, s * tip, -49 + lift, s * (tip - 9), -23 + lift, shade, 2);
      pixelLine(ctx, s * 5, -15, s * 12, -3 + step * s, body, 2);
    }
    pixel(ctx, shade, -9, -45, 18, 32); pixel(ctx, body, -6, -48, 12, 28); pixel(ctx, light, -2, -43, 3, 21);
    pixelLine(ctx, 0, -16, -front * 10, 2, shade, 3); pixelLine(ctx, -5, -47, -10, -55, light, 2); pixelLine(ctx, 5, -47, 10, -55, light, 2);
    pixel(ctx, glow, front * 4 - 1, -43, 3, 3);
  } else if (species === 'root-snare') {
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, x = Math.cos(a) * (ready ? 36 : 29), y = Math.sin(a) * 13;
      pixelLine(ctx, 0, -6, x * .6, y - 4, shade, 4); pixelLine(ctx, x * .6, y - 4, x, y, body, 3); pixelLine(ctx, x, y, x + Math.cos(a) * 7, y - 3, light, 2);
    }
    pixel(ctx, shade, -11, -37, 22, 32); pixel(ctx, body, -8, -41, 16, 32);
    for (const s of [-1, 1]) { pixelLine(ctx, s * 5, -29, s * (ready ? 25 : 17), ready ? -43 : -35, shade, 6); pixelLine(ctx, s * (ready ? 25 : 17), ready ? -43 : -35, s * (ready ? 30 : 12), -47, light, 3); }
    pixel(ctx, shade, -12, -34, 24, 14); pixel(ctx, glow, -6, -32, 12, ready ? 12 : 5); pixel(ctx, light, -2, -40, 4, 6);
  }
}

export function drawCreatureBody(ctx, actor, time = 0) {
  if (!supported.has(actor?.species)) return false;
  const front = actor.facing === 'left' ? -1 : 1, step = actor.reduceMotion !== true && actor.moving ? Math.sin(time * 10) >= 0 ? 1 : -1 : 0;
  const pose = actor.windup > 0 || actor.phase === 'windup' ? 'windup' : actor.phase === 'recovery' ? 'recovery' : 'idle';
  const hurt = (actor.hitUntil || actor.hurtUntil || 0) > time, dead = actor.health <= 0, color = actor.color || '';
  const key = `${actor.species}:${front}:${step}:${pose}:${Number(hurt)}:${Number(dead)}:${color}`;
  let sprite = sprites.get(key);
  if (!sprite) {
    const owner = ctx.canvas?.ownerDocument || (typeof document === 'undefined' ? null : document);
    const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(112, 88) : owner?.createElement('canvas');
    if (canvas) {
      canvas.width = 112; canvas.height = 88; const target = canvas.getContext('2d'); target.imageSmoothingEnabled = false; target.translate(56, 68);
      paint(target, actor.species, front, step, pose, hurt, dead, color);
      if (sprites.size >= 256) sprites.delete(sprites.keys().next().value); sprites.set(key, canvas); sprite = canvas;
    }
  }
  if (sprite) ctx.drawImage(sprite, Math.round(actor.x - 56), Math.round(actor.y - 68));
  else { ctx.save(); ctx.translate(Math.round(actor.x), Math.round(actor.y)); paint(ctx, actor.species, front, step, pose, hurt, dead, color); ctx.restore(); }
  return true;
}

/** Attack footprints use locked authority coordinates and stop at the same walls. */
export function drawCreatureTell(ctx, actor, layout, time = 0) {
  if (!actor?.creatureBehavior || actor.health <= 0 || actor.hidden || actor.quietEarthDormant || actor.pacified) return false;
  const warning = actor.windup > 0 || actor.phase === 'windup', striking = actor.phase === 'strike';
  if (!warning && !striking) return true;
  const origin = { x: Number.isFinite(actor.attackX) ? actor.attackX : actor.x, y: Number.isFinite(actor.attackY) ? actor.attackY : actor.y };
  const angle = Number.isFinite(actor.aimAngle) ? actor.aimAngle : 0;
  let reach = Math.min(320, Math.max(8, actor.attackReach || actor.range || 30));
  const shape = actor.attackShape || 'cone', color = striking ? '#d99b7e' : '#d5b487';
  if (shape === 'lunge' && Number.isFinite(actor.attackTargetX) && Number.isFinite(actor.attackTargetY)) {
    reach = Math.min(reach, Math.hypot(actor.attackTargetX - origin.x, actor.attackTargetY - origin.y));
  }
  const clear = point => !layout || isCabinWalkable(layout, point.x, point.y, 1) && clearSidearmSight(layout, origin, point);
  const dot = (x, y, size = 2) => { if (clear({ x, y })) pixel(ctx, color, x - size / 2, y - size / 2, size, size); };
  const ray = (a, length, start = 16) => { for (let d = start; d <= length; d += 8) { const x = origin.x + Math.cos(a) * d, y = origin.y + Math.sin(a) * d; if (!clear({ x, y })) break; dot(x, y); } };
  const ring = (center, radius) => { for (let i = 0; i < 48; i++) { if (i % 3 === 2) continue; const a = i / 48 * Math.PI * 2; dot(center.x + Math.cos(a) * radius, center.y + Math.sin(a) * radius); } };
  if (shape === 'cloud' || shape === 'burst' || shape === 'ring') {
    const center = actor.creatureBehavior === 'root-lash' && Number.isFinite(actor.attackTargetX) && Number.isFinite(actor.attackTargetY) ? { x: actor.attackTargetX, y: actor.attackTargetY } : origin;
    ring(center, Math.min(160, Math.max(12, actor.attackRadius || reach)));
    if (shape === 'ring' && actor.attackInnerRadius > 0) ring(center, actor.attackInnerRadius);
    if (shape === 'cloud') { dot(center.x - 4, center.y); dot(center.x + 4, center.y); dot(center.x, center.y - 4); dot(center.x, center.y + 4); }
  } else if (shape === 'lunge' || shape === 'line') {
    const width = Math.max(5, Math.min(30, actor.attackWidth || 10));
    for (const s of [-1, 1]) for (let d = 16; d <= reach; d += 12) {
      const x = origin.x + Math.cos(angle) * d, y = origin.y + Math.sin(angle) * d;
      if (!clear({ x, y })) break;
      dot(x - Math.sin(angle) * width * s, y + Math.cos(angle) * width * s, 1);
    }
    ray(angle, reach);
  } else if (shape === 'fan') {
    const spread = Number.isFinite(actor.attackSpread) ? actor.attackSpread : .25;
    for (const offset of [-spread, 0, spread]) ray(angle + offset, reach);
  } else {
    const arc = Number.isFinite(actor.attackArc) ? actor.attackArc : .7;
    ray(angle - arc, reach); ray(angle + arc, reach);
    for (let i = 0; i <= 14; i++) { const a = angle - arc + i / 14 * arc * 2; dot(origin.x + Math.cos(a) * reach, origin.y + Math.sin(a) * reach); }
  }
  if (warning) {
    const y = actor.y - creatureArtHeight(actor.species) - 7;
    pixel(ctx, '#f1d49b', actor.x - 2, y, 4, 5); pixel(ctx, '#f1d49b', actor.x - 1, y + 7, 2, 2);
  }
  return true;
}
