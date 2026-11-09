/** Captain identity is cosmetic; only explicit, bounded traits affect the rules. */
const freezeList = values => Object.freeze(values.map(value => Object.freeze(value)));

export const SKIN_TONES = freezeList([
  { id:'pale', name:'Pale', color:'#e8c7ad' },
  { id:'warm', name:'Warm', color:'#d4af88' },
  { id:'olive', name:'Olive', color:'#bd9c75' },
  { id:'copper', name:'Copper', color:'#b98260' },
  { id:'umber', name:'Umber', color:'#93664e' },
  { id:'deep', name:'Deep', color:'#684a3d' }
]);
export const SUIT_COLORS = freezeList([
  { id:'teal', name:'Tide teal', color:'#79b3ad', accent:'#d8c18c' },
  { id:'ochre', name:'Work ochre', color:'#c2a16b', accent:'#d9e4cd' },
  { id:'rust', name:'Signal rust', color:'#b87963', accent:'#edc78c' },
  { id:'slate', name:'Dock slate', color:'#829bad', accent:'#c0d8d0' },
  { id:'moss', name:'Field moss', color:'#8ca275', accent:'#e2ca94' },
  { id:'plum', name:'Night plum', color:'#a38cae', accent:'#d7d2b0' },
  { id:'ivory', name:'Survey ivory', color:'#c9c6af', accent:'#80bfc0' },
  { id:'charcoal', name:'Engine charcoal', color:'#66757d', accent:'#e0b777' }
]);
export const HAIR_COLORS = freezeList([
  { id:'dark', name:'Dark', color:'#343532' },
  { id:'brown', name:'Brown', color:'#665044' },
  { id:'copper', name:'Copper', color:'#9d6650' },
  { id:'sand', name:'Sand', color:'#bca982' },
  { id:'silver', name:'Silver', color:'#c2c7bc' }
]);
export const HAIR_STYLES = freezeList([
  { id:'crop', name:'Short crop' },
  { id:'swept', name:'Side sweep' },
  { id:'shaved', name:'Shaved' },
  { id:'hood', name:'Travel hood' }
]);

export const DEFAULT_APPEARANCE = Object.freeze({ skin:'warm', suit:'teal', hair:'dark', style:'crop' });
export const MAX_TRAITS = 2;
export const CHARACTER_TRAITS = Object.freeze([
  {
    id:'long_stride', name:'Long Stride',
    description:'You learned to cross open country with very little on your back.',
    benefit:'Walk 15% faster.', cost:'15% less maximum health.',
    modifiers:{ walkSpeed:1.15, maxHealth:.85 }
  },
  {
    id:'bulkhead_born', name:'Bulkhead Born',
    description:'Years hauling equipment through cramped passages made you hard to put down.',
    benefit:'20% more maximum health.', cost:'Walk 12% slower.',
    modifiers:{ maxHealth:1.2, walkSpeed:.88 }
  },
  {
    id:'hot_cell', name:'Hot Cell',
    description:'You tune a sidearm for one forceful pulse, then wait for its cell to settle.',
    benefit:'Sidearm hits deal 25% more damage.', cost:'30% longer between sidearm shots.',
    modifiers:{ sidearmDamage:1.25, sidearmCooldown:1.3 }
  },
  {
    id:'quick_hands', name:'Quick Hands',
    description:'Your familiar low-power pulse setting lets you fire again sooner.',
    benefit:'20% shorter delay between sidearm shots.', cost:'Sidearm hits deal 15% less damage.',
    modifiers:{ sidearmCooldown:.8, sidearmDamage:.85 }
  },
  {
    id:'belt_born', name:'Belt Born',
    description:'You read mineral seams better than you negotiate a work contract.',
    benefit:'Mine 25% faster.', cost:'Job credit rewards are 10% lower.',
    modifiers:{ mining:1.25, jobRewards:.9 }
  },
  {
    id:'port_regular', name:'Port Regular',
    description:'You know the repair counters and their people. Ore fields are less familiar.',
    benefit:'Ship services and infirmary visits cost 15% less.', cost:'Mine 15% slower.',
    modifiers:{ serviceCost:.85, mining:.85 }
  }
].map(trait => Object.freeze({ ...trait, modifiers:Object.freeze(trait.modifiers) })));

const select = (items, value, fallback) => typeof value === 'string' && items.some(item => item.id === value) ? value : fallback;
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

/** Palette IDs, never user-supplied CSS, are safe to share between clients. */
export function normalizeAppearance(raw) {
  const value = object(raw);
  return {
    skin:select(SKIN_TONES,value.skin,DEFAULT_APPEARANCE.skin),
    suit:select(SUIT_COLORS,value.suit,DEFAULT_APPEARANCE.suit),
    hair:select(HAIR_COLORS,value.hair,DEFAULT_APPEARANCE.hair),
    style:select(HAIR_STYLES,value.style,DEFAULT_APPEARANCE.style)
  };
}

/** Choice locking belongs to the authority; a client cannot import a lock flag. */
export function normalizeCharacter(raw) {
  const value = object(raw), traits = [];
  for (const id of Array.isArray(value.traits) ? value.traits : []) {
    if (typeof id !== 'string' || traits.includes(id) || !CHARACTER_TRAITS.some(trait => trait.id === id)) continue;
    traits.push(id);
    if (traits.length === MAX_TRAITS) break;
  }
  return { appearance:normalizeAppearance(value.appearance), traits };
}

/** Values are multiplicative. Recompute from the profile, never from modified stats. */
export function characterModifiers(profile) {
  const result = { walkSpeed:1, maxHealth:1, sidearmDamage:1, sidearmCooldown:1, mining:1, jobRewards:1, serviceCost:1 };
  for (const id of normalizeCharacter(profile).traits) {
    for (const [key, value] of Object.entries(CHARACTER_TRAITS.find(trait => trait.id === id).modifiers)) result[key] *= value;
  }
  for (const key of Object.keys(result)) result[key] = Math.round(result[key] * 1e6) / 1e6;
  return result;
}

export function appearancePalette(raw) {
  const value = normalizeAppearance(raw), suit = SUIT_COLORS.find(item => item.id === value.suit);
  return {
    skin:SKIN_TONES.find(item => item.id === value.skin).color,
    suit:suit.color, hair:HAIR_COLORS.find(item => item.id === value.hair).color,
    style:value.style, accent:suit.accent
  };
}

/** A crisp 32 × 32 portrait, rendered without DOM, image files, or fractional pixels. */
export function drawCaptainPortrait(ctx, appearance, { x=0, y=0, size=96 } = {}) {
  const safe = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  const pixelSize = Math.max(1, Math.floor(Math.max(32,safe(size,96))/32)), width=32*pixelSize;
  const left=Math.round(safe(x,0)+(safe(size,96)-width)/2), top=Math.round(safe(y,0)+(safe(size,96)-width)/2);
  const colors=appearancePalette(appearance), edge='#142733', shadow='#263b43', eyes='#23343a';
  const p=(color,px,py,w,h)=>{ctx.fillStyle=color;ctx.fillRect(left+px*pixelSize,top+py*pixelSize,w*pixelSize,h*pixelSize);};
  ctx.save();
  ctx.imageSmoothingEnabled=false;
  p('#0f232e',0,0,32,32);p('#203842',1,1,30,30);
  p('#2b464d',2,2,28,1);p('#1b303b',2,3,28,27);
  p('#3a5358',4,6,2,1);p('#3a5358',26,7,2,1);p('#324a52',24,18,4,1);
  p(edge,7,21,18,10);p(colors.suit,8,22,16,9);p(colors.suit,5,25,22,6);
  p(shadow,6,29,4,2);p(shadow,22,29,4,2);p(colors.accent,9,24,3,2);p('#b9cbc1',20,24,3,1);
  p('#9c8270',14,19,4,4);p(colors.skin,13,18,6,4);
  p(edge,10,6,12,14);p(colors.skin,11,8,10,11);p(colors.skin,12,19,8,2);
  p(colors.skin,10,12,1,4);p(colors.skin,21,12,1,4);
  if(colors.style==='hood') {
    p(colors.suit,9,6,14,5);p(colors.suit,8,9,3,12);p(colors.suit,21,9,3,12);
    p(colors.accent,10,8,12,1);p(edge,10,10,1,8);p(edge,21,10,1,8);
  } else if(colors.style==='shaved') {
    p(colors.skin,12,7,8,2);p('#b2967c',11,8,1,3);
  } else {
    p(colors.hair,10,6,12,4);p(colors.hair,10,9,2,4);p(colors.hair,20,9,2,4);
    if(colors.style==='swept') {p(colors.hair,11,5,9,2);p(colors.hair,11,9,7,2);p(colors.hair,11,11,3,2);}
    else p(colors.hair,12,9,3,1);
  }
  p(eyes,13,13,2,1);p(eyes,18,13,2,1);p('#a77c62',16,14,1,3);p('#805d51',14,18,4,1);
  p(edge,12,22,8,2);p(colors.accent,13,22,6,1);p('#415b63',15,24,2,7);
  p(colors.accent,3,27,1,3);p(colors.accent,28,3,1,3);
  ctx.restore();
  return { x:left, y:top, width, height:width, pixelSize };
}
