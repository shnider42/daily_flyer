// Visual preference only. Sight, targeting, and network visibility never read it.
export const DEFAULT_FOG_DENSITY = .25;
export const ORIGINAL_FOG_STYLE = Object.freeze({
  baseColor: '77,91,83', rememberedColor: '41,55,49',
  baseAlpha: .105, rememberedAlpha: .085, unseenAlpha: .181075,
  dayStrength: 1, nightStrength: .6, mapStrength: .8, nightMapStrength: .6,
});
export const DENSE_FOG_STYLE = Object.freeze({
  baseColor: '11,21,24', rememberedColor: '11,21,24',
  baseAlpha: (.7 - .34) / (1 - .34), rememberedAlpha: .34, unseenAlpha: .7,
  dayStrength: .9, nightStrength: .78, mapStrength: 1, nightMapStrength: 1,
});

export function fogAppearance(value = DEFAULT_FOG_DENSITY) {
  const density = typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : DEFAULT_FOG_DENSITY;
  const original = ORIGINAL_FOG_STYLE;
  if (density === DEFAULT_FOG_DENSITY) return { ...original, density };
  const t = Math.max(0, (density - DEFAULT_FOG_DENSITY) / (1 - DEFAULT_FOG_DENSITY));
  const fade = Math.min(1, density / DEFAULT_FOG_DENSITY);
  const mix = (a, b) => a + (b - a) * t;
  const color = (a, b) => a.split(',').map((component, i) => Math.round(mix(Number(component), Number(b.split(',')[i])))).join(',');
  const rememberedAlpha = mix(original.rememberedAlpha, DENSE_FOG_STYLE.rememberedAlpha) * fade;
  const unseenAlpha = mix(original.unseenAlpha, DENSE_FOG_STYLE.unseenAlpha) * fade;
  return {
    density, rememberedAlpha, unseenAlpha,
    baseAlpha: (unseenAlpha - rememberedAlpha) / (1 - rememberedAlpha),
    baseColor: color(original.baseColor, DENSE_FOG_STYLE.baseColor),
    rememberedColor: color(original.rememberedColor, DENSE_FOG_STYLE.rememberedColor),
    dayStrength: mix(original.dayStrength, DENSE_FOG_STYLE.dayStrength),
    nightStrength: mix(original.nightStrength, DENSE_FOG_STYLE.nightStrength),
    mapStrength: mix(original.mapStrength, DENSE_FOG_STYLE.mapStrength),
    nightMapStrength: mix(original.nightMapStrength, DENSE_FOG_STYLE.nightMapStrength),
  };
}

export function fogDrawStrength(style, { night = false, map = false } = {}) {
  return night && map ? style.nightMapStrength : night ? style.nightStrength : map ? style.mapStrength : style.dayStrength;
}
