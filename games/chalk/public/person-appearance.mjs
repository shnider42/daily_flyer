// Stable, inexpensive details for people seen from above. Appearance never
// changes collision, faction, sight, or combat statistics.
const cache = new Map();
const skins = ['#ac8062', '#825d45', '#bc9473', '#684936', '#976e50', '#72513d'];
const hair = ['#332c25', '#47382b', '#66513a', '#272824'];
const military = ['#949477', '#9d987b', '#8b9171', '#a39b7e', '#888f6d'];
const irregular = ['#a08b70', '#8f8771', '#aa9277', '#7d8470', '#9c8068', '#7f8580'];
const clothes = ['#ad9eac', '#879da0', '#b1a289', '#a88677', '#a5ab93', '#8b8b9c'];
function identityHash(value) {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export function personAppearance(actor = {}) {
  const key = `${actor.team}:${actor.id}:${actor.role || actor.kind || ''}`;
  if (cache.has(key)) return cache.get(key);
  const seed = identityHash(key), militaryKit = actor.team === 'squad' || actor.team === 'allied';
  const civilian = actor.team === 'civilian' || actor.team === 'survivor';
  const palette = militaryKit ? military : civilian ? clothes : irregular;
  const appearance = Object.freeze({
    uniform: palette[seed % palette.length],
    skin: skins[(seed >>> 4) % skins.length],
    hair: hair[(seed >>> 8) % hair.length],
    gear: militaryKit ? ['#505c43', '#62634b', '#5a6044'][(seed >>> 12) % 3] : '#615d49',
    headwear: militaryKit ? 'helmet' : civilian ? ((seed >>> 14) % 4 === 0 ? 'wrap' : 'bare') : ['bare', 'cap', 'wrap'][(seed >>> 14) % 3],
    width: .94 + ((seed >>> 18) % 4) * .035,
    phase: ((seed >>> 22) % 32) * Math.PI / 16,
    pack: militaryKit && (actor.role === 'medic' || actor.role === 'grenadier' || (seed >>> 11) % 3 === 0),
  });
  // One mission has far fewer people. Bound this across arbitrarily many new
  // games and network snapshots without mutating authoritative actor objects.
  if (cache.size >= 192) cache.clear();
  cache.set(key, appearance);
  return appearance;
}
