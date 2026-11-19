/** GRAVEBLOOM — shared authoritative simulation. No browser or server dependencies. */
export const VERSION = '0.1.0';
export const CLASSES = {
  warrior: { id: 'warrior', name: 'Warrior', title: 'The Ironbound', description: 'Get close. Break their ranks. Keep your friends standing.', color: '#e2ad6c', hp: 160, energy: 100, speed: 183, damage: 28, armor: 4,
    primary: { name: 'Cleave', description: 'A sweeping blade strikes enemies in front of you.', cooldown: .44, energyCost: 0 },
    skill1: { name: 'Earthbreaker', description: 'Slam the ground. Stun and pull nearby enemies into your reach.', cooldown: 5, energyCost: 22 },
    skill2: { name: 'Rally', description: 'Shield nearby allies and restore a little health.', cooldown: 11, energyCost: 30 } },
  archer: { id: 'archer', name: 'Archer', title: 'The Thornwalker', description: 'Keep your distance. Pierce the crowd. Make the ground dangerous.', color: '#a4cb8c', hp: 115, energy: 100, speed: 207, damage: 21, armor: 1,
    primary: { name: 'Quickshot', description: 'A fast arrow toward your aim.', cooldown: .29, energyCost: 0 },
    skill1: { name: 'Splinter Volley', description: 'Fire five arrows that pierce through enemies.', cooldown: 5, energyCost: 23 },
    skill2: { name: 'Venom Snare', description: 'Lay a poison field at your feet. Burning poisoned enemies causes an eruption.', cooldown: 8, energyCost: 26 } },
  wizard: { id: 'wizard', name: 'Wizard', title: 'The Cinderborn', description: 'Freeze the rush. Call the storm. Turn one mistake into a chain reaction.', color: '#bdacf0', hp: 105, energy: 120, speed: 192, damage: 26, armor: 1,
    primary: { name: 'Emberbolt', description: 'A burning bolt that erupts on poisoned enemies.', cooldown: .38, energyCost: 0 },
    skill1: { name: 'Winter Pulse', description: 'Freeze nearby enemies. Lightning shatters frozen targets.', cooldown: 6, energyCost: 25 },
    skill2: { name: 'Chain Lightning', description: 'Lightning jumps between up to six enemies. It shatters frozen enemies.', cooldown: 8, energyCost: 32 } },
};
export const RARITIES = {
  common: { name: 'Worn', color: '#b9b5aa', multiplier: 1 },
  magic: { name: 'Enchanted', color: '#77bcff', multiplier: 1.35 },
  rare: { name: 'Rare', color: '#efc763', multiplier: 1.8 },
  legendary: { name: 'Legendary', color: '#ed965e', multiplier: 2.4 },
};
export const ZONES = [
  { id: 'wilds', name: 'The Weeping Wilds', boss: 'Briarhart', bossTitle: 'The garden remembers every grave.', description: 'Follow the old road through a forest that grows from the dead.', heart: 'The Briar Heart', heartDescription: 'Your attacks poison. The forest grows stronger around you.', palette: { floor: '#242d27', wall: '#101917', accent: '#9bab69', fog: '#101a18' } },
  { id: 'ossuary', name: 'The Sunken Ossuary', boss: 'The Bellkeeper', bossTitle: 'Every toll calls someone home.', description: 'Under the drowned village, the bells still answer.', heart: 'The Echo Heart', heartDescription: 'Your attacks sometimes arc to a second foe. The bells wake the restless.', palette: { floor: '#27313b', wall: '#121b27', accent: '#82b5c4', fog: '#101927' } },
  { id: 'cathedral', name: 'The Hollow Cathedral', boss: 'The Hollow King', bossTitle: 'Something has been wearing the crown.', description: 'Climb toward the throne at the root of the curse.', heart: 'The Crown Heart', heartDescription: 'Claim the crown and carry the curse into your next legend.', palette: { floor: '#352b2d', wall: '#1b171e', accent: '#c88769', fog: '#1f141e' } },
];

const TAU = Math.PI * 2;
const TILE = 48;
const MAX_PLAYERS = 4;
const MAX_INVENTORY = 30;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function hashSeed(seed) { let h = 2166136261; for (const c of String(seed)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0 || 1; }
function rng(g) { let t = g._rng += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }
function int(g, a, b) { return Math.floor(rng(g) * (b - a + 1)) + a; }
function pick(g, values) { return values[Math.floor(rng(g) * values.length)]; }
function uid(g, prefix = 'e') { return `${prefix}${++g._id}`; }
function announce(g, text, kind = 'info') { g.messages.push({ id: uid(g, 'm'), text, kind, time: g.time }); if (g.messages.length > 12) g.messages.shift(); }
function effect(g, type, x, y, options = {}) {
  if (g.effects.length > 180) g.effects.shift();
  const life = options.life ?? .45;
  const e = { id: uid(g, 'f'), type, x, y, r: 24, color: '#ead9a7', life, maxLife: life, ...options };
  g.effects.push(e); return e;
}
const living = g => g.players.filter(p => !p.downed && p.connected !== false);
const activePartyCount = g => Math.max(1, g.players.filter(p => p.connected !== false).length);

function buildMap(g) {
  const width = 60, height = 43, tiles = Array(width * height).fill(0);
  const base = [
    [3, 31, 11, 9, 'spawn'], [4, 17, 12, 10, 'combat'], [21, 26, 12, 12, 'combat'],
    [40, 27, 14, 11, 'combat'], [42, 7, 13, 13, 'combat'], [22, 3, 15, 14, 'boss'],
    [3, 3, 12, 10, 'treasure'],
  ];
  const mirror = rng(g) > .5;
  const rooms = base.map(([x, y, w, h, kind], id) => {
    x += int(g, -1, 1); y += int(g, -1, 1); w += int(g, -1, 1); h += int(g, -1, 1);
    if (mirror) x = width - x - w;
    return { id, x, y, w, h, kind, cleared: kind === 'spawn' || kind === 'treasure' };
  });
  const floor = (x, y) => { if (x > 0 && y > 0 && x < width - 1 && y < height - 1) tiles[y * width + x] = 1; };
  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) floor(x, y);
  function corridor(a, b) {
    let x = Math.floor(a.x + a.w / 2), y = Math.floor(a.y + a.h / 2);
    const tx = Math.floor(b.x + b.w / 2), ty = Math.floor(b.y + b.h / 2);
    const paint = () => { for (let q = -1; q <= 1; q++) for (let v = -1; v <= 1; v++) floor(x + q, y + v); };
    const horizontal = () => { while (x !== tx) { x += Math.sign(tx - x); paint(); } };
    const vertical = () => { while (y !== ty) { y += Math.sign(ty - y); paint(); } };
    paint(); if (rng(g) < .5) { horizontal(); vertical(); } else { vertical(); horizontal(); }
  }
  for (let i = 0; i < 5; i++) corridor(rooms[i], rooms[i + 1]);
  corridor(rooms[1], rooms[6]);
  // Obstacles are carved only in spacious chambers and never divide a corridor.
  for (const r of rooms.filter(r => r.kind === 'combat')) {
    if (rng(g) < .7) {
      const x = r.x + 3, y = r.y + 3;
      tiles[y * width + x] = 0; tiles[(y + 1) * width + x] = 0;
    }
  }
  const decor = [], chests = [], shrines = [];
  for (const r of rooms) {
    for (let j = 0; j < 14; j++) {
      const x = int(g, r.x, r.x + r.w - 1), y = int(g, r.y, r.y + r.h - 1);
      if (tiles[y * width + x]) decor.push({ type: pick(g, g.zoneIndex === 0 ? ['grass', 'bones', 'roots', 'rubble'] : ['bones', 'rubble', 'crack']), x: (x + rng(g)) * TILE, y: (y + rng(g)) * TILE, variant: int(g, 0, 4) });
    }
    for (const [tx, ty] of [[r.x + 1, r.y + 1], [r.x + r.w - 2, r.y + 1], [r.x + 1, r.y + r.h - 2], [r.x + r.w - 2, r.y + r.h - 2]]) {
      decor.push({ type: g.zoneIndex === 0 ? 'tree' : 'pillar', x: (tx + .5) * TILE, y: (ty + .5) * TILE, variant: int(g, 0, 3) });
      decor.push({ type: 'torch', x: (tx + .5) * TILE, y: (ty + .5) * TILE - 16, variant: 0 });
    }
    if (r.kind === 'treasure' || r.id === 3) chests.push({ id: uid(g, 'c'), x: (r.x + r.w / 2) * TILE, y: (r.y + r.h / 2) * TILE, opened: false });
    if (r.kind === 'spawn' || r.kind === 'treasure') shrines.push({ id: uid(g, 's'), x: (r.x + r.w / 2) * TILE, y: (r.y + 2) * TILE, used: false });
  }
  return { width, height, tileSize: TILE, tiles, rooms, decor, chests, shrines };
}

function roomCenter(r) { return { x: (r.x + r.w / 2) * TILE, y: (r.y + r.h / 2) * TILE }; }
function setZone(g, index) {
  g.zoneIndex = index; g.zoneName = ZONES[index].name; g.floor = index + 1;
  g.map = buildMap(g); g.enemies = []; g.projectiles = []; g.effects = []; g.loot = []; g.zonesCleared = index;
  g.spawn = roomCenter(g.map.rooms[0]); g.exit = { ...roomCenter(g.map.rooms[5]), active: false };
  g.bossDefeated = false; g.phase = 'playing'; g._flow = null; g._flowTimer = 0;
  for (const r of g.map.rooms.filter(r => r.kind === 'combat')) {
    const n = int(g, 4, 6) + Math.min(2, g.corruption);
    for (let i = 0; i < n; i++) {
      const pos = findFloor(g, (r.x + 2 + rng(g) * (r.w - 4)) * TILE, (r.y + 2 + rng(g) * (r.h - 4)) * TILE, 16);
      const type = pick(g, index === 0 ? ['crawler', 'crawler', 'archer', 'brute'] : ['crawler', 'archer', 'brute', 'wisp']);
      spawnEnemy(g, type, pos.x, pos.y, { roomId: r.id, elite: rng(g) < .07 + g.corruption * .055 });
    }
  }
  const bossPos = roomCenter(g.map.rooms[5]);
  const boss = spawnEnemy(g, ['briarhart', 'bellkeeper', 'hollowking'][index], bossPos.x, bossPos.y, { boss: true, roomId: 5 });
  g.bossId = boss.id;
  for (let i = 0; i < g.players.length; i++) {
    const p = g.players[i]; p.x = g.spawn.x + (i % 2) * 35 - 18; p.y = g.spawn.y + Math.floor(i / 2) * 35;
    p.hp = Math.min(p.maxHp, Math.max(p.maxHp * .65, p.hp + p.maxHp * .35)); p.energy = p.maxEnergy;
    p.downed = false; p.reviveProgress = 0; p.invulnerable = 3; p.shield = 0; p._input = {};
    p.cooldowns = { primary: 0, skill1: 0, skill2: 0, dodge: 0, potion: 0 };
  }
  announce(g, `${g.zoneName}. Find and defeat ${ZONES[index].boss}.`, 'area');
}

export function createGame({ seed = Date.now(), difficulty = 'normal' } = {}) {
  difficulty = ['story', 'normal', 'hard'].includes(difficulty) ? difficulty : 'normal';
  const g = {
    version: VERSION, seed: String(seed).slice(0, 80), difficulty, time: 0, phase: 'playing', zoneIndex: 0,
    zoneName: '', floor: 1, players: [], enemies: [], projectiles: [], effects: [], loot: [], map: null,
    spawn: { x: 0, y: 0 }, exit: null, bossId: null, bossDefeated: false, kills: 0, corruption: 0,
    hearts: [], messages: [], zonesCleared: 0, run: 1, _rng: hashSeed(seed), _id: 0, _partyScale: 1,
  };
  setZone(g, 0); return g;
}

function starterItem(g, classId) {
  return { id: uid(g, 'i'), name: ({ warrior: 'Notched Longsword', archer: 'Ashwood Bow', wizard: 'Cinder Staff' })[classId], slot: 'weapon', rarity: 'common', level: 1, classId,
    stats: { damage: 0, armor: 0, hp: 0, speed: 0, crit: 0 }, affixes: [], description: 'It has carried you this far.', value: 5 };
}

export function addPlayer(g, { id, name = 'Wanderer', classId = 'warrior' } = {}) {
  id = String(id || uid(g, 'p')).slice(0, 80);
  const found = g.players.find(p => p.id === id);
  if (found) { found.connected = true; found._input = {}; scaleParty(g); return found; }
  if (g.players.length >= MAX_PLAYERS) return null;
  classId = CLASSES[classId] ? classId : 'warrior';
  const c = CLASSES[classId], leader = living(g)[0], level = leader?.level || 1;
  const p = { id, name: String(name || 'Wanderer').replace(/[<>]/g, '').slice(0, 18), classId,
    x: leader?.x ?? g.spawn.x, y: (leader?.y ?? g.spawn.y) + g.players.length * 20, r: 14,
    hp: c.hp, maxHp: c.hp, energy: c.energy, maxEnergy: c.energy, level, xp: 0, xpNext: 45 + level * 35, gold: 0,
    inventory: [], equipment: { weapon: starterItem(g, classId), armor: null, charm: null },
    stats: { damage: c.damage, armor: c.armor, speed: c.speed, crit: .06 },
    cooldowns: { primary: 0, skill1: 0, skill2: 0, dodge: 0, potion: 0 }, facing: -Math.PI / 2,
    downed: false, reviveProgress: 0, kills: 0, damageDone: 0, connected: true, shield: 0,
    invulnerable: 3, attackAnim: 0, hitFlash: 0, dodgeTimer: 0, _input: {}, _hurtAgo: 100, _sanctity: 0,
  };
  p._sanctity = g.hearts.filter(h => h.choice === 'cleanse').length;
  recalculate(p); p.hp = p.maxHp; const safe = findFloor(g, p.x, p.y, p.r); p.x = safe.x; p.y = safe.y;
  g.players.push(p); scaleParty(g); return p;
}
export function removePlayer(g, id, { permanent = false } = {}) {
  const p = g.players.find(p => p.id === id);
  if (permanent) g.players = g.players.filter(p => p.id !== id);
  else if (p) { p.connected = false; p._input = {}; }
  scaleParty(g);
}
function scaleParty(g) {
  const next = 1 + .58 * (activePartyCount(g) - 1), ratio = next / (g._partyScale || 1);
  for (const e of g.enemies) { e.maxHp *= ratio; e.hp *= ratio; }
  g._partyScale = next;
}
export function setInput(g, id, input = {}) {
  const p = g.players.find(p => p.id === id); if (!p || !input || typeof input !== 'object') return;
  p._input = {
    mx: clamp(finite(input.mx), -1, 1), my: clamp(finite(input.my), -1, 1),
    aimX: Number.isFinite(input.aimX) ? clamp(input.aimX, -200, g.map.width * TILE + 200) : undefined,
    aimY: Number.isFinite(input.aimY) ? clamp(input.aimY, -200, g.map.height * TILE + 200) : undefined,
    attack: input.attack === true, skill1: input.skill1 === true, skill2: input.skill2 === true,
    dodge: input.dodge === true, interact: input.interact === true, potion: input.potion === true,
  };
}

function recalculate(p) {
  const c = CLASSES[p.classId], stat = { damage: c.damage + (p.level - 1) * 3, armor: c.armor + (p.level - 1) * .45, speed: c.speed, crit: .06, hp: c.hp + (p.level - 1) * 15 + (p._sanctity || 0) * 20 };
  for (const item of Object.values(p.equipment)) if (item) for (const k of ['damage', 'armor', 'speed', 'crit', 'hp']) stat[k] += finite(item.stats[k]);
  p.maxHp = Math.round(stat.hp); p.maxEnergy = c.energy; delete stat.hp;
  stat.speed = clamp(stat.speed, 140, 285); stat.crit = clamp(stat.crit, .01, .6); stat.armor = Math.min(45, stat.armor);
  p.stats = stat; p.hp = Math.min(p.hp, p.maxHp);
}
function addXp(g, value) {
  for (const p of g.players.filter(p => p.connected !== false)) {
    p.xp += value;
    while (p.xp >= p.xpNext && p.level < 30) {
      p.xp -= p.xpNext; p.level++; p.xpNext = 45 + p.level * 35;
      const hp = p.maxHp; recalculate(p); p.hp = Math.min(p.maxHp, p.hp + p.maxHp - hp + 25);
      effect(g, 'ring', p.x, p.y, { r: 75, color: '#e7c980', life: .8 }); effect(g, 'text', p.x, p.y - 48, { value: `LEVEL ${p.level}`, color: '#f0ce79', life: 1.6 });
      announce(g, `${p.name} reached level ${p.level}.`, 'level');
    }
  }
}

/** generateLoot(game, classId, {rarity?, slot?, level?}) produces deterministic, rolled equipment. */
export function generateLoot(g, classId = 'warrior', options = {}) {
  if (!CLASSES[classId]) classId = 'warrior';
  const level = options.level || g.floor + 1;
  const r = rng(g) + g.corruption * .025;
  const rarity = options.rarity && RARITIES[options.rarity] ? options.rarity : r > .965 ? 'legendary' : r > .76 ? 'rare' : r > .37 ? 'magic' : 'common';
  const mult = RARITIES[rarity].multiplier;
  const slot = ['weapon', 'armor', 'charm'].includes(options.slot) ? options.slot : pick(g, ['weapon', 'weapon', 'armor', 'charm']);
  const bases = slot === 'weapon' ? ({ warrior: ['Falchion', 'Grave Axe', 'Longsword', 'War Hammer'], archer: ['Yew Bow', 'Recurve', 'Bone Bow', 'Hunting Bow'], wizard: ['Ash Staff', 'Crystal Wand', 'Thorn Staff', 'Ossuary Rod'] })[classId] : slot === 'armor' ? ['Brigandine', 'Gravecoat', 'Warden Mail', 'Hollow Mantle'] : ['Reliquary', 'Signet', 'Tearstone', 'Bone Rosary'];
  const prefix = pick(g, ['Wayward', 'Hallowed', 'Gloaming', 'Vigorous', 'Merciless', 'Buried', 'Unquiet', 'Sable']);
  const suffix = pick(g, ['of the Hunt', 'of Embers', 'of the Last Light', 'of Hunger', 'of the Watch', 'of Hollow Mercy']);
  const stats = { damage: 0, armor: 0, hp: 0, speed: 0, crit: 0 };
  if (slot === 'weapon') stats.damage = Math.round((int(g, 3, 6) + level * 2) * mult);
  if (slot === 'armor') { stats.armor = Math.round((int(g, 1, 3) + level) * mult); stats.hp = Math.round((int(g, 3, 7) + level * 3) * mult); }
  if (slot === 'charm') { stats.crit = Math.round((.02 + rng(g) * .025 + level * .005) * mult * 100) / 100; stats.speed = int(g, 3, 8) + level; }
  if (rarity === 'rare' || rarity === 'legendary') { const key = pick(g, ['damage', 'hp', 'speed']); stats[key] += Math.round(int(g, 2, 5) * mult); }
  const affixes = [];
  if (rarity !== 'common' && (rarity === 'legendary' || rng(g) < .5)) {
    const id = pick(g, ['burn', 'poison', 'leech', 'chain']);
    affixes.push({ id, name: ({ burn: 'Kindling', poison: 'Venom', leech: 'Blooddrinker', chain: 'Stormbound' })[id], description: ({ burn: 'Hits burn enemies. Fire erupts on poisoned foes.', poison: 'Hits poison enemies for a short time.', leech: 'Dealing damage restores a little health.', chain: 'Hits can arc to another nearby enemy.' })[id], value: rarity === 'legendary' ? 1.5 : 1 });
  }
  let name = rarity === 'common' ? pick(g, bases) : `${prefix} ${pick(g, bases)}${rarity === 'rare' ? ' ' + suffix : ''}`;
  if (rarity === 'legendary') name = pick(g, ['The Last Kindness', 'Debt to the Garden', 'Yesterday’s Thunder', 'A King’s Regret', 'Neverburied']);
  return { id: uid(g, 'i'), name, slot, rarity, level, classId: slot === 'weapon' ? classId : null, stats, affixes, description: rarity === 'legendary' ? 'A memory that refuses to stay dead.' : 'Found where the living no longer tread.', value: Math.round((8 + level * 7) * mult) };
}
function giveItem(g, p, item) {
  if (p.inventory.length >= MAX_INVENTORY) { p.gold += item.value; effect(g, 'text', p.x, p.y - 38, { value: `Pack full · +${item.value} gold`, color: '#d5b878', life: 1.6 }); return; }
  p.inventory.push(item);
  if (item.rarity === 'rare' || item.rarity === 'legendary') announce(g, `${p.name} found ${item.name}.`, 'loot');
}
function dropLoot(g, e) {
  const players = g.players.filter(p => p.connected !== false);
  if (e.boss) {
    for (const p of players) {
      p.gold += 55 + g.floor * 20;
      giveItem(g, p, generateLoot(g, p.classId, { rarity: rng(g) < .2 + g.corruption * .04 ? 'legendary' : 'rare', level: g.floor + 2 }));
    }
  } else {
    for (const p of players) p.gold += int(g, 2, 5) + g.zoneIndex;
    if (players.length && (e.elite || rng(g) < .42)) {
      const owner = pick(g, players), item = generateLoot(g, owner.classId, e.elite ? { rarity: rng(g) < .5 ? 'rare' : 'magic' } : {});
      if (g.loot.length < 80) g.loot.push({ id: uid(g, 'l'), x: e.x, y: e.y, ownerId: owner.id, item });
    }
  }
}

function floorAt(g, x, y) { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return tx >= 0 && ty >= 0 && tx < g.map.width && ty < g.map.height && g.map.tiles[ty * g.map.width + tx] === 1; }
function fits(g, x, y, r = 14) { return floorAt(g, x - r, y - r) && floorAt(g, x + r, y - r) && floorAt(g, x - r, y + r) && floorAt(g, x + r, y + r); }
function findFloor(g, x, y, r) {
  if (fits(g, x, y, r)) return { x, y };
  const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
  for (let ring = 0; ring < 10; ring++) for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) {
    const px = (cx + dx + .5) * TILE, py = (cy + dy + .5) * TILE;
    if (fits(g, px, py, r)) return { x: px, y: py };
  }
  return g.spawn;
}
function move(g, entity, dx, dy) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 12));
  for (let i = 0; i < steps; i++) {
    if (fits(g, entity.x + dx / steps, entity.y, entity.r)) entity.x += dx / steps;
    if (fits(g, entity.x, entity.y + dy / steps, entity.r)) entity.y += dy / steps;
  }
}
function lineOfSight(g, a, b, clearance = 0) {
  const d = distance(a, b), steps = Math.ceil(d / 22);
  for (let i = 1; i < steps; i++) {
    const x = a.x + (b.x - a.x) * i / steps, y = a.y + (b.y - a.y) * i / steps;
    if (clearance ? !fits(g, x, y, clearance) : !floorAt(g, x, y)) return false;
  }
  return true;
}
function createFlow(g) {
  const { width, height, tiles } = g.map, dist = new Int16Array(width * height).fill(-1), queue = new Int32Array(width * height);
  let head = 0, tail = 0;
  for (const p of living(g)) { const at = Math.floor(p.y / TILE) * width + Math.floor(p.x / TILE); if (at >= 0 && at < dist.length && dist[at] < 0) { dist[at] = 0; queue[tail++] = at; } }
  while (head < tail) {
    const at = queue[head++], x = at % width, y = Math.floor(at / width);
    for (const n of [x > 0 ? at - 1 : -1, x < width - 1 ? at + 1 : -1, y > 0 ? at - width : -1, y < height - 1 ? at + width : -1]) {
      if (n >= 0 && tiles[n] && dist[n] < 0) { dist[n] = dist[at] + 1; queue[tail++] = n; }
    }
  }
  g._flow = dist;
}
function chaseVector(g, e, target) {
  let tx = target.x, ty = target.y;
  if (!lineOfSight(g, e, target, e.r) && g._flow) {
    const w = g.map.width, x = Math.floor(e.x / TILE), y = Math.floor(e.y / TILE), at = y * w + x;
    let best = at, value = g._flow[at] < 0 ? 32767 : g._flow[at];
    for (const n of [at - 1, at + 1, at - w, at + w]) if (n >= 0 && n < g._flow.length && g._flow[n] >= 0 && g._flow[n] < value) { best = n; value = g._flow[n]; }
    tx = (best % w + .5) * TILE; ty = (Math.floor(best / w) + .5) * TILE;
  }
  const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy) || 1;
  return { x: dx / d, y: dy / d };
}

function spawnEnemy(g, type, x, y, extra = {}) {
  const stats = {
    crawler: { hp: 48, damage: 10, speed: 113, r: 15, name: 'Gravebound' },
    archer: { hp: 43, damage: 9, speed: 92, r: 14, name: 'Thornshot' },
    brute: { hp: 102, damage: 20, speed: 76, r: 22, name: 'Husk Brute' },
    wisp: { hp: 38, damage: 11, speed: 116, r: 12, name: 'Lost Wisp' },
    briarhart: { hp: 1560, damage: 24, speed: 79, r: 34, name: 'Briarhart' },
    bellkeeper: { hp: 2688, damage: 29, speed: 74, r: 35, name: 'The Bellkeeper' },
    hollowking: { hp: 4032, damage: 32, speed: 91, r: 33, name: 'The Hollow King' },
  }[type];
  const diffHp = g.difficulty === 'story' ? .78 : g.difficulty === 'hard' ? 1.23 : 1;
  const diffDamage = g.difficulty === 'story' ? .65 : g.difficulty === 'hard' ? 1.28 : 1;
  const boss = !!extra.boss, elite = !!extra.elite;
  const maxHp = Math.round(stats.hp * (boss ? 1 : 1 + g.zoneIndex * .38) * (g._partyScale || 1) * (1 + g.corruption * .12) * (elite ? 1.6 : 1) * diffHp);
  const safe = findFloor(g, x, y, stats.r);
  const e = { id: uid(g), type, x: safe.x, y: safe.y, r: stats.r, hp: maxHp, maxHp, damage: stats.damage * diffDamage * (1 + g.zoneIndex * .12 + g.corruption * .08), speed: stats.speed,
    name: `${elite ? 'Unquiet ' : ''}${stats.name}`, boss, elite, facing: 0, attackTimer: .6 + rng(g), skillTimer: 2, awake: false, phase: 1,
    telegraph: null, statuses: { burn: 0, poison: 0, chill: 0, shock: 0 }, hitFlash: 0, stun: 0, _dotTimer: .5, _dotOwner: null, ...extra };
  g.enemies.push(e); return e;
}
function projectile(g, p, angle, damage, options = {}) {
  if (g.projectiles.length >= 180) return;
  const speed = options.speed || 620, r = options.r || 5;
  g.projectiles.push({ id: uid(g, 'b'), x: p.x + Math.cos(angle) * (p.r + 8), y: p.y + Math.sin(angle) * (p.r + 8), vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r,
    color: '#c7dab0', ownerId: p.id, enemy: false, kind: 'arrow', life: 1.35, damage, pierce: 0, hits: [], ...options });
}
function affix(p, id) { let value = 0; for (const item of Object.values(p.equipment)) for (const a of item?.affixes || []) if (a.id === id) value += a.value; return value; }
function claimed(g, kind) { return g.hearts.some(h => h.kind === kind && h.choice === 'claim'); }

function hurtEnemy(g, e, amount, sourceId, kind = 'physical', extra = {}) {
  if (e.hp <= 0 || g.phase !== 'playing') return;
  const p = g.players.find(p => p.id === sourceId); let crit = false;
  if (p && !extra.dot && rng(g) < p.stats.crit) { amount *= 1.75; crit = true; }
  if (kind === 'lightning' && e.statuses.chill > 0) {
    amount *= 1.8; e.statuses.chill = 0; e.stun = .6;
    effect(g, 'burst', e.x, e.y, { r: 70, color: '#acf2ff' }); effect(g, 'text', e.x, e.y - 48, { value: 'SHATTER', color: '#b6efff', life: .9 });
  }
  const eruption = kind === 'fire' && e.statuses.poison > 0 && !extra.dot;
  if (eruption) { e.statuses.poison = 0; amount *= 1.5; effect(g, 'burst', e.x, e.y, { r: 90, color: '#e1b45b', life: .5 }); effect(g, 'text', e.x, e.y - 42, { value: 'ERUPTION', color: '#f8c377', life: .9 }); }
  amount = Math.max(1, Math.round(amount)); e.hp -= amount; e.hitFlash = .12; e.awake = true;
  if (p) p.damageDone += amount;
  if (!extra.dot || rng(g) < .3) effect(g, 'text', e.x + int(g, -9, 9), e.y - e.r, { value: String(amount) + (crit ? '!' : ''), color: crit ? '#ffe29b' : kind === 'poison' ? '#a7cd6a' : '#ece1cd', life: .65, crit });
  if (p && !extra.dot) {
    e._dotOwner = p.id;
    if (kind === 'fire' || affix(p, 'burn')) e.statuses.burn = Math.max(e.statuses.burn, 2.7);
    if (kind === 'poison' || affix(p, 'poison') || claimed(g, 'briar')) e.statuses.poison = Math.max(e.statuses.poison, 3.5);
    if (kind === 'frost') { e.statuses.chill = 3.4; e.stun = Math.max(e.stun, .5); }
    if (kind === 'lightning') e.statuses.shock = 1.2;
    const leech = affix(p, 'leech'); if (leech && !p.downed) p.hp = Math.min(p.maxHp, p.hp + amount * .035 * leech);
    if (!extra.noChain && (affix(p, 'chain') || claimed(g, 'bell')) && rng(g) < .2) {
      const other = g.enemies.find(other => other.id !== e.id && other.hp > 0 && distance(other, e) < 180);
      if (other) { effect(g, 'lightning', e.x, e.y, { x2: other.x, y2: other.y, color: '#aacef2', life: .25 }); hurtEnemy(g, other, amount * .4, p.id, 'lightning', { noChain: true }); }
    }
  }
  if (eruption) for (const other of g.enemies) if (other !== e && other.hp > 0 && distance(other, e) < 90) hurtEnemy(g, other, amount * .3, sourceId, 'physical', { dot: true });
  if (e.hp <= 0) killEnemy(g, e, p);
}
function killEnemy(g, e, p) {
  if (e._dead) return; e._dead = true; e.telegraph = null; g.kills++; if (p) p.kills++;
  effect(g, 'burst', e.x, e.y, { r: e.boss ? 125 : e.r * 2, color: e.boss ? '#f1d28d' : '#8e6753', life: e.boss ? 1.4 : .4 });
  addXp(g, e.boss ? 85 + g.floor * 35 : e.elite ? 24 : 11 + g.zoneIndex * 3); dropLoot(g, e);
  if (e.boss) {
    g.bossDefeated = true; g.exit.active = true; g.phase = 'choice'; g.projectiles = [];
    for (const drop of g.loot) { const owner = g.players.find(p => p.id === drop.ownerId); if (owner) giveItem(g, owner, drop.item); } g.loot = [];
    announce(g, `${e.name} has fallen. The heart is yours to claim — or lay to rest.`, 'boss');
  }
}
function hurtPlayer(g, p, amount, from) {
  if (p.downed || p.invulnerable > 0 || p.dodgeTimer > 0 || p.connected === false) return;
  amount = Math.max(1, amount * (100 / (100 + p.stats.armor * 4)));
  const absorbed = Math.min(p.shield, amount); p.shield -= absorbed; amount -= absorbed;
  p.hp -= amount; p.hitFlash = .17; p._hurtAgo = 0;
  effect(g, 'text', p.x, p.y - 35, { value: `−${Math.ceil(amount)}`, color: '#ed8a7a', life: .7 });
  if (from) { const dx = p.x - from.x, dy = p.y - from.y, d = Math.hypot(dx, dy) || 1; move(g, p, dx / d * 10, dy / d * 10); }
  if (p.hp <= 0) {
    p.hp = 0; p.downed = true; p.reviveProgress = 0; p._input = {}; p.shield = 0;
    effect(g, 'ring', p.x, p.y, { r: 55, color: '#c97161', life: .9 });
    announce(g, `${p.name} is down. Stand nearby and hold Interact to revive.`, 'danger');
  }
}

function playerAttack(g, p, slot) {
  const c = CLASSES[p.classId], spec = c[slot];
  if (p.cooldowns[slot] > 0 || p.energy < spec.energyCost) return;
  p.cooldowns[slot] = spec.cooldown; p.energy -= spec.energyCost; p.attackAnim = slot === 'primary' ? .18 : .35;
  const dmg = p.stats.damage, angle = p.facing;
  if (p.classId === 'warrior') {
    if (slot === 'primary') {
      effect(g, 'slash', p.x, p.y, { r: 106, angle, color: '#edc281', life: .22 });
      for (const e of g.enemies) if (e.hp > 0 && distance(p, e) < 104 + e.r) {
        const ea = Math.atan2(e.y - p.y, e.x - p.x), delta = Math.atan2(Math.sin(ea - angle), Math.cos(ea - angle));
        if (Math.abs(delta) < 1.32 && lineOfSight(g, p, e)) { hurtEnemy(g, e, dmg, p.id); e.stun = Math.max(e.stun, .12); move(g, e, Math.cos(ea) * 12, Math.sin(ea) * 12); }
      }
    } else if (slot === 'skill1') {
      effect(g, 'ring', p.x, p.y, { r: 195, color: '#d3a26a', life: .6 });
      for (const e of g.enemies) if (e.hp > 0 && distance(p, e) < 195 + e.r && lineOfSight(g, p, e)) {
        hurtEnemy(g, e, dmg * 1.65, p.id); e.stun = e.boss ? .45 : 1.35;
        if (!e.boss) { const a = Math.atan2(p.y - e.y, p.x - e.x); move(g, e, Math.cos(a) * 40, Math.sin(a) * 40); }
      }
    } else {
      effect(g, 'ring', p.x, p.y, { r: 250, color: '#d4d9ac', life: .8 });
      for (const ally of living(g)) if (distance(p, ally) < 270) { ally.shield = Math.min(ally.maxHp * .6, ally.shield + 38 + p.level * 7); ally.hp = Math.min(ally.maxHp, ally.hp + 10 + p.level * 2); effect(g, 'heal', ally.x, ally.y, { r: 28, color: '#a8d7aa', life: .7 }); }
    }
  } else if (p.classId === 'archer') {
    if (slot === 'primary') projectile(g, p, angle, dmg, { color: '#c1d59b', speed: 730 });
    else if (slot === 'skill1') {
      for (let i = -2; i <= 2; i++) projectile(g, p, angle + i * .115, dmg * 1.15, { color: '#dfd489', speed: 780, pierce: 3, life: 1.25 });
    } else effect(g, 'trap', p.x, p.y, { r: 135, color: '#8eb85d', life: 5, ownerId: p.id, damage: dmg * .28, _pulse: 0 });
  } else {
    if (slot === 'primary') projectile(g, p, angle, dmg, { color: '#f1b483', speed: 565, r: 8, kind: 'bolt', damageKind: 'fire', life: 1.55 });
    else if (slot === 'skill1') {
      effect(g, 'ring', p.x, p.y, { r: 215, color: '#9ccfe0', life: .75 });
      for (const e of g.enemies) if (e.hp > 0 && distance(p, e) < 215 + e.r && lineOfSight(g, p, e)) hurtEnemy(g, e, dmg * .95, p.id, 'frost');
    } else {
      const candidates = g.enemies.filter(e => e.hp > 0 && distance(p, e) < 480 && lineOfSight(g, p, e));
      const aim = { x: p.x + Math.cos(angle) * 280, y: p.y + Math.sin(angle) * 280 };
      candidates.sort((a, b) => distance(a, aim) - distance(b, aim));
      let prev = p, count = 0;
      while (candidates.length && count < 6) {
        let index = count === 0 ? 0 : candidates.findIndex(e => distance(prev, e) < 240);
        if (index < 0) break;
        const e = candidates.splice(index, 1)[0];
        effect(g, 'lightning', prev.x, prev.y, { x2: e.x, y2: e.y, color: '#c1b4f2', life: .32 + count * .03 });
        hurtEnemy(g, e, dmg * (count === 0 ? 2 : 1.35), p.id, 'lightning'); prev = e; count++;
      }
      if (!count) effect(g, 'lightning', p.x, p.y, { x2: aim.x, y2: aim.y, color: '#9b90be', life: .25 });
    }
  }
}

function updatePlayer(g, p, dt) {
  p.hitFlash = Math.max(0, p.hitFlash - dt); p.attackAnim = Math.max(0, p.attackAnim - dt);
  p.invulnerable = Math.max(0, p.invulnerable - dt); p._hurtAgo += dt;
  for (const k of Object.keys(p.cooldowns)) p.cooldowns[k] = Math.max(0, p.cooldowns[k] - dt);
  if (p.connected === false || p.downed) return;
  p.energy = Math.min(p.maxEnergy, p.energy + dt * 15); p.shield = Math.max(0, p.shield - dt * 1.2);
  if (p._hurtAgo > 8) p.hp = Math.min(p.maxHp, p.hp + dt * (g.difficulty === 'story' ? 3.8 : 1.9));
  const i = p._input || {}, aimx = i.aimX, aimy = i.aimY;
  if (Number.isFinite(aimx) && Number.isFinite(aimy) && Math.hypot(aimx - p.x, aimy - p.y) > 5) p.facing = Math.atan2(aimy - p.y, aimx - p.x);
  let mx = finite(i.mx), my = finite(i.my); const len = Math.hypot(mx, my); if (len > 1) { mx /= len; my /= len; }
  if ((!Number.isFinite(aimx) || !Number.isFinite(aimy)) && len > .1) p.facing = Math.atan2(my, mx);
  if (i.dodge && p.cooldowns.dodge <= 0) {
    p.dodgeTimer = .24; p.cooldowns.dodge = 3.2; p.invulnerable = .3;
    p._dodgeX = len > .1 ? mx / Math.min(len, 1) : Math.cos(p.facing); p._dodgeY = len > .1 ? my / Math.min(len, 1) : Math.sin(p.facing);
    effect(g, 'burst', p.x, p.y, { r: 25, color: CLASSES[p.classId].color, life: .3 });
  }
  if (p.dodgeTimer > 0) { move(g, p, p._dodgeX * 610 * dt, p._dodgeY * 610 * dt); p.dodgeTimer = Math.max(0, p.dodgeTimer - dt); }
  else move(g, p, mx * p.stats.speed * dt, my * p.stats.speed * dt);
  if (i.potion && p.cooldowns.potion <= 0 && p.hp < p.maxHp) {
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * .48); p.cooldowns.potion = 18;
    effect(g, 'heal', p.x, p.y, { r: 45, color: '#c36b65', life: .7 }); effect(g, 'text', p.x, p.y - 40, { value: 'RESTORED', color: '#bdd5a0', life: .8 });
  }
  if (i.attack) playerAttack(g, p, 'primary'); if (i.skill1) playerAttack(g, p, 'skill1'); if (i.skill2) playerAttack(g, p, 'skill2');
  if (i.interact) interact(g, p);
  for (let n = g.loot.length - 1; n >= 0; n--) if (g.loot[n].ownerId === p.id && distance(p, g.loot[n]) < 64) {
    const drop = g.loot.splice(n, 1)[0]; giveItem(g, p, drop.item); effect(g, 'text', p.x, p.y - 34, { value: drop.item.name, color: RARITIES[drop.item.rarity].color, life: 1.35 });
  }
}

function interact(g, p) {
  for (const c of g.map.chests) if (!c.opened && distance(p, c) < 85) {
    c.opened = true;
    for (const ally of g.players.filter(p => p.connected !== false)) {
      giveItem(g, ally, generateLoot(g, ally.classId, { rarity: rng(g) < .25 ? 'rare' : 'magic' })); ally.gold += int(g, 18, 30);
    }
    effect(g, 'burst', c.x, c.y, { r: 65, color: '#d7b868', life: .8 }); announce(g, `${p.name} opened a lost cache. Everyone received loot.`, 'loot'); return;
  }
  for (const s of g.map.shrines) if (!s.used && distance(p, s) < 80) {
    s.used = true;
    for (const ally of g.players) { ally.hp = ally.maxHp; ally.energy = ally.maxEnergy; ally.downed = false; ally.reviveProgress = 0; ally.cooldowns.potion = 0; effect(g, 'heal', ally.x, ally.y, { r: 60, color: '#bad4aa', life: 1 }); }
    announce(g, 'The wayshrine restores the whole party.', 'heal'); return;
  }
}
function updateRevives(g, dt) {
  for (const p of g.players.filter(p => p.downed)) {
    const helpers = living(g).filter(ally => ally._input?.interact && distance(ally, p) < 95);
    p.reviveProgress = clamp(p.reviveProgress + (helpers.length ? dt * helpers.length / 2.4 : -dt * .22), 0, 1);
    if (p.reviveProgress >= 1) { p.downed = false; p.hp = Math.max(1, p.maxHp * .45); p.invulnerable = 2.5; p.reviveProgress = 0; effect(g, 'heal', p.x, p.y, { r: 70, color: '#ced5a6', life: 1 }); announce(g, `${p.name} is back on their feet.`, 'heal'); }
  }
}

function beginTell(g, e, type, target, radius, duration) {
  e.telegraph = { type, x: type === 'slam' || type === 'ring' ? e.x : target.x, y: type === 'slam' || type === 'ring' ? e.y : target.y, r: radius, remaining: duration, duration, angle: Math.atan2(target.y - e.y, target.x - e.x), fromX: e.x, fromY: e.y };
}
function executeTell(g, e) {
  const t = e.telegraph; e.telegraph = null;
  if (t.type === 'slam' || t.type === 'strike') {
    effect(g, 'burst', t.x, t.y, { r: t.r, color: e.boss ? '#e3a56e' : '#ac725a', life: .5 });
    for (const p of living(g)) if (distance(p, t) < t.r + p.r) hurtPlayer(g, p, e.damage * (e.boss ? 1.25 : 1), e);
    if (e.type === 'briarhart') for (let a = 0; a < TAU; a += TAU / 8) projectile(g, e, a, e.damage * .55, { enemy: true, color: '#a7ba6a', speed: 240, r: 7, kind: 'thorn', life: 2.4 });
  } else if (t.type === 'ring') {
    effect(g, 'ring', e.x, e.y, { r: 240, color: '#b2bfd1', life: .9 });
    const count = e.phase > 1 ? 16 : 12;
    for (let i = 0; i < count; i++) projectile(g, e, i * TAU / count + (e._ringAngle || 0), e.damage * .7, { enemy: true, color: '#b7c6df', speed: 205 + g.zoneIndex * 20, r: 8, kind: 'orb', life: 3.2 });
    e._ringAngle = (e._ringAngle || 0) + .17;
  } else if (t.type === 'charge') {
    e._charge = { x: Math.cos(t.angle), y: Math.sin(t.angle), remaining: .65, hit: [] };
    effect(g, 'burst', e.x, e.y, { r: 45, color: '#ce9270', life: .35 });
  } else if (t.type === 'summon') {
    effect(g, 'ring', e.x, e.y, { r: 160, color: '#b792c4', life: 1 });
    const existing = g.enemies.filter(x => !x.boss && !x._dead).length;
    for (let i = 0; i < Math.min(3, 12 - existing); i++) {
      const a = rng(g) * TAU, pos = findFloor(g, e.x + Math.cos(a) * 130, e.y + Math.sin(a) * 130, 15);
      spawnEnemy(g, g.zoneIndex === 0 ? 'crawler' : 'wisp', pos.x, pos.y, { awake: true, roomId: 5 });
    }
  }
}
function updateEnemy(g, e, dt) {
  if (e.hp <= 0) return;
  e.hitFlash = Math.max(0, e.hitFlash - dt); e.attackTimer -= dt; e.skillTimer -= dt; e.stun = Math.max(0, e.stun - dt);
  for (const k of Object.keys(e.statuses)) e.statuses[k] = Math.max(0, e.statuses[k] - dt);
  if (e.statuses.poison > 0 || e.statuses.burn > 0) {
    e._dotTimer -= dt;
    if (e._dotTimer <= 0) { e._dotTimer = .5; hurtEnemy(g, e, (e.statuses.burn > 0 ? 3 + g.floor : 0) + (e.statuses.poison > 0 ? 3 + g.floor : 0), e._dotOwner, e.statuses.poison > 0 ? 'poison' : 'fire', { dot: true }); }
  }
  if (e.hp <= 0 || g.phase !== 'playing') return;
  const targets = living(g); if (!targets.length) return;
  let target = targets[0]; for (const p of targets) if (distance(e, p) < distance(e, target)) target = p;
  const d = distance(e, target); if (d < (e.boss ? 470 : 455)) e.awake = true;
  if (!e.awake || d > 1100) return;
  e.facing = Math.atan2(target.y - e.y, target.x - e.x);
  if (e.boss && e.hp < e.maxHp * .48 && e.phase === 1) { e.phase = 2; e.skillTimer = .2; announce(g, `${e.name} is enraged. Watch the ground.`, 'danger'); effect(g, 'ring', e.x, e.y, { r: 120, color: '#cf806e', life: .8 }); }
  if (e.telegraph) { e.telegraph.remaining -= dt; if (e.telegraph.remaining <= 0) executeTell(g, e); return; }
  if (e._charge) {
    const charge = e._charge; move(g, e, charge.x * 530 * dt, charge.y * 530 * dt); charge.remaining -= dt;
    for (const p of targets) if (distance(p, e) < e.r + p.r + 8 && !charge.hit.includes(p.id)) { hurtPlayer(g, p, e.damage * 1.35, e); charge.hit.push(p.id); }
    if (charge.remaining <= 0) e._charge = null; return;
  }
  if (e.stun > 0) return;
  const slow = e.statuses.chill > 0 ? .36 : 1;
  if (e.boss && e.skillTimer <= 0) {
    const sequence = e.type === 'briarhart' ? ['slam', 'charge', 'summon'] : e.type === 'bellkeeper' ? ['ring', 'strike', 'summon'] : ['charge', 'ring', 'strike', 'summon'];
    const type = sequence[(e._pattern || 0) % sequence.length]; e._pattern = (e._pattern || 0) + 1;
    beginTell(g, e, type, target, type === 'charge' ? 55 : type === 'strike' ? 115 : type === 'summon' ? 160 : 155, type === 'charge' ? .9 : 1.1);
    e.skillTimer = (e.phase === 2 ? 2.15 : 3.1) + rng(g) * .45; return;
  }
  if ((e.type === 'archer' || e.type === 'wisp') && d < 390 && lineOfSight(g, e, target)) {
    if (e.attackTimer <= 0) { projectile(g, e, e.facing, e.damage, { enemy: true, color: e.type === 'wisp' ? '#c6a6d1' : '#b1a875', speed: e.type === 'wisp' ? 245 : 300, life: 2, kind: e.type === 'wisp' ? 'orb' : 'thorn', r: 6 }); e.attackTimer = e.type === 'wisp' ? 1.6 : 1.85; }
    if (d < 140) { const v = chaseVector(g, e, target); move(g, e, -v.x * e.speed * .7 * dt, -v.y * e.speed * .7 * dt); } return;
  }
  if (e.type === 'brute' && d < 105 && e.attackTimer <= 0) { beginTell(g, e, 'slam', target, 105, .7); e.attackTimer = 2.3; return; }
  if (d > e.r + target.r + 8) {
    const v = chaseVector(g, e, target); let sx = 0, sy = 0;
    for (const other of g.enemies) if (other !== e && other.hp > 0) { const od = distance(e, other), min = e.r + other.r; if (od > .1 && od < min) { sx += (e.x - other.x) / od * (min - od) * 3; sy += (e.y - other.y) / od * (min - od) * 3; } }
    move(g, e, (v.x * e.speed * slow + sx) * dt, (v.y * e.speed * slow + sy) * dt);
  } else if (e.attackTimer <= 0 && e.type !== 'brute') { hurtPlayer(g, target, e.damage, e); e.attackTimer = e.boss ? 1.1 : 1.2; effect(g, 'slash', e.x, e.y, { r: e.r + 28, angle: e.facing, color: '#ad6657', life: .18 }); }
}

function updateProjectiles(g, dt) {
  for (const b of g.projectiles) {
    b.life -= dt; if (b.life <= 0) continue;
    const steps = Math.max(1, Math.ceil(Math.hypot(b.vx, b.vy) * dt / 14));
    for (let n = 0; n < steps && b.life > 0; n++) {
      b.x += b.vx * dt / steps; b.y += b.vy * dt / steps;
      if (!floorAt(g, b.x, b.y)) { b.life = 0; break; }
      if (b.enemy) {
        for (const p of living(g)) if (distance(b, p) < b.r + p.r) { hurtPlayer(g, p, b.damage, b); b.life = 0; break; }
      } else {
        for (const e of g.enemies) if (e.hp > 0 && !b.hits.includes(e.id) && distance(b, e) < b.r + e.r) {
          hurtEnemy(g, e, b.damage, b.ownerId, b.damageKind || 'physical'); b.hits.push(e.id);
          effect(g, 'burst', b.x, b.y, { r: 18, color: b.color, life: .22 });
          if (b.pierce-- <= 0) { b.life = 0; break; }
        }
      }
    }
  }
  g.projectiles = g.projectiles.filter(b => b.life > 0);
}

export function step(g, dt) {
  dt = clamp(finite(dt), 0, .05); if (!dt) return;
  g.time += dt;
  for (const f of g.effects) {
    f.life -= dt;
    if (g.phase === 'playing' && f.type === 'trap' && f.life > 0) {
      f._pulse -= dt;
      if (f._pulse <= 0) { f._pulse = .65; for (const e of g.enemies) if (e.hp > 0 && distance(f, e) < f.r + e.r) { hurtEnemy(g, e, f.damage, f.ownerId, 'poison'); e.statuses.chill = Math.max(e.statuses.chill, .9); } }
    }
  }
  g.effects = g.effects.filter(f => f.life > 0);
  if (g.phase !== 'playing' || !g.players.length) return;
  g._flowTimer -= dt; if (g._flowTimer <= 0) { createFlow(g); g._flowTimer = .35; }
  for (const p of g.players) updatePlayer(g, p, dt);
  updateRevives(g, dt);
  for (const e of g.enemies) { updateEnemy(g, e, dt); if (g.phase !== 'playing') break; }
  if (g.phase === 'playing') updateProjectiles(g, dt);
  g.enemies = g.enemies.filter(e => !e._dead);
  for (const room of g.map.rooms) if (room.kind === 'combat') room.cleared = !g.enemies.some(e => e.roomId === room.id && !e._dead);
  if (g.phase === 'playing' && g.players.some(p => p.connected !== false) && !living(g).length) { g.phase = 'defeat'; g.projectiles = []; announce(g, 'The garden takes its due. Your next descent awaits.', 'defeat'); }
}

export function temperCost(p) {
  return 45 + 15 * p.level + 25 * (p.equipment.weapon?.temper || 0);
}

export function action(g, playerId, data = {}) {
  const p = g.players.find(p => p.id === playerId); if (!p) return { ok: false, error: 'Player not found.' };
  if (!data || typeof data !== 'object') return { ok: false, error: 'Invalid action.' };
  if (data.type === 'temper') {
    const weapon = p.equipment.weapon;
    if (!weapon) return { ok: false, error: 'Equip a weapon before tempering.' };
    if ((weapon.temper || 0) >= 3) return { ok: false, error: 'This weapon is fully tempered.' };
    const cost = temperCost(p);
    if (p.gold < cost) return { ok: false, error: `Tempering costs ${cost} gold.` };
    const damage = 3 + g.floor * 2;
    p.gold -= cost; weapon.temper = (weapon.temper || 0) + 1; weapon.stats.damage += damage; recalculate(p);
    effect(g, 'burst', p.x, p.y, { r: 38, color: '#e3b66b', life: .5 });
    return { ok: true, cost, damage, temper: weapon.temper };
  }
  if (data.type === 'equip') {
    const index = p.inventory.findIndex(item => item.id === data.itemId); if (index < 0) return { ok: false, error: 'That item is no longer in your pack.' };
    const item = p.inventory[index]; if (item.classId && item.classId !== p.classId) return { ok: false, error: 'That weapon belongs to another class.' };
    const old = p.equipment[item.slot]; p.inventory.splice(index, 1); if (old) p.inventory.push(old); p.equipment[item.slot] = item; recalculate(p); return { ok: true };
  }
  if (data.type === 'salvage' || data.type === 'drop') {
    const index = p.inventory.findIndex(item => item.id === data.itemId); if (index < 0) return { ok: false, error: 'Item not found.' };
    const item = p.inventory.splice(index, 1)[0];
    if (data.type === 'salvage') { p.gold += item.value; return { ok: true, gold: item.value }; }
    if (g.loot.length >= 80) { p.inventory.push(item); return { ok: false, error: 'Too many items on the ground.' }; }
    const pos = findFloor(g, p.x + Math.cos(p.facing) * 90, p.y + Math.sin(p.facing) * 90, 8);
    g.loot.push({ id: uid(g, 'l'), x: pos.x, y: pos.y, ownerId: p.id, item }); return { ok: true };
  }
  if (data.type === 'interact') { if (!p.downed && g.phase === 'playing') interact(g, p); return { ok: true }; }
  if (data.type === 'choose') {
    if (g.phase !== 'choice') return { ok: false, error: 'There is no heart to choose yet.' };
    // Multiplayer leader authorization belongs to the transport, which owns host migration.
    if (!['claim', 'cleanse'].includes(data.choice)) return { ok: false, error: 'Choose claim or cleanse.' };
    const kind = ['briar', 'bell', 'crown'][g.zoneIndex];
    g.hearts.push({ zoneIndex: g.zoneIndex, name: ZONES[g.zoneIndex].heart, kind, choice: data.choice });
    if (data.choice === 'claim') { g.corruption++; announce(g, `${ZONES[g.zoneIndex].heart} claimed. More power. A more dangerous road.`, 'heart'); }
    else { for (const ally of g.players) { ally._sanctity = (ally._sanctity || 0) + 1; recalculate(ally); ally.hp = ally.maxHp; } announce(g, 'The heart rests. Everyone gains 20 maximum health.', 'heart'); }
    if (g.zoneIndex === ZONES.length - 1) { g.phase = 'victory'; g.zonesCleared = 3; announce(g, 'The Hollow King is gone. What grows here next is up to you.', 'victory'); }
    else setZone(g, g.zoneIndex + 1);
    return { ok: true };
  }
  if (data.type === 'restart') {
    // Multiplayer leader authorization belongs to the transport, which owns host migration.
    if (g.phase !== 'defeat' && g.phase !== 'victory') return { ok: false, error: 'Finish this descent first.' };
    const roster = g.players.map(p => ({ id: p.id, name: p.name, classId: p.classId, connected: p.connected })), run = g.run + 1;
    const fresh = createGame({ seed: `${g.seed.split(':run:')[0]}:run:${run}`, difficulty: g.difficulty });
    Object.assign(g, fresh); g.run = run;
    for (const member of roster) { const next = addPlayer(g, member); next.connected = member.connected; } scaleParty(g); return { ok: true };
  }
  return { ok: false, error: 'Unknown action.' };
}

/** A JSON-safe public world. Inputs, RNG internals and pathfinding caches stay private. */
export function snapshot(g) {
  const clean = value => {
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === 'object') { const out = {}; for (const [k, v] of Object.entries(value)) if (!k.startsWith('_')) out[k] = clean(v); return out; }
    return value;
  };
  return clean(g);
}

/** Full browser-local checkpoint, including RNG and combat timers. Never accept this from a multiplayer client. */
export function serializeGame(g) {
  return JSON.parse(JSON.stringify(g, (key, value) => key === '_flow' ? null : key === '_input' ? {} : value));
}

/** Restore only our bounded, versioned local checkpoint; return null for corrupt or obsolete saves. */
export function restoreGame(saved) {
  try {
    const g = typeof saved === 'string' ? JSON.parse(saved) : JSON.parse(JSON.stringify(saved));
    if (!g || g.version !== VERSION || !['playing', 'choice', 'victory', 'defeat'].includes(g.phase)) return null;
    if (!Number.isInteger(g.zoneIndex) || !ZONES[g.zoneIndex] || !Number.isFinite(g.time) || !Number.isFinite(g._rng) || !Number.isInteger(g._id)) return null;
    const m = g.map;
    if (!m || !Number.isInteger(m.width) || !Number.isInteger(m.height) || m.width < 10 || m.width > 80 || m.height < 10 || m.height > 60 || m.tileSize !== TILE) return null;
    if (!Array.isArray(m.tiles) || m.tiles.length !== m.width * m.height || !m.tiles.every(v => v === 0 || v === 1)) return null;
    if (!Array.isArray(g.players) || !g.players.length || g.players.length > MAX_PLAYERS || !Array.isArray(g.enemies) || g.enemies.length > 160 || !Array.isArray(g.projectiles) || g.projectiles.length > 180 || !Array.isArray(g.effects) || g.effects.length > 220 || !Array.isArray(g.loot) || g.loot.length > 80) return null;
    for (const p of g.players) {
      if (!CLASSES[p.classId] || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.hp) || !Number.isFinite(p.maxHp) || !p.cooldowns || !p.equipment || !Array.isArray(p.inventory) || p.inventory.length > MAX_INVENTORY) return null;
      p._input = {}; p.connected = true; p.invulnerable = Math.max(1.5, p.invulnerable || 0);
    }
    g._flow = null; g._flowTimer = 0;
    return g;
  } catch { return null; }
}
