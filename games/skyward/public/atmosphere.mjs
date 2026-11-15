// Colors describe the same sky, land and distant haze in both renderers.
const biomes = {
  countryside: { top: '#638fa6', horizon: '#dce4cd', fog: '#a9bdba', ground: ['#718963', '#8d9b6d', '#aaa678', '#5d7b62'], water: '#477f8c', light: '#fff0cf' },
  channel: { top: '#5c85a3', horizon: '#d6e0d8', fog: '#a3bac6', ground: ['#6a8168', '#869774', '#abac88', '#567962'], water: '#427585', light: '#f8e6c6' },
  coast: { top: '#5b89a2', horizon: '#dfdcc2', fog: '#acc1c1', ground: ['#647f66', '#87997b', '#b1ac87', '#769178'], water: '#3d8490', light: '#ffe7c6' },
  pacific: { top: '#4296b5', horizon: '#cfe9df', fog: '#92c3ca', ground: ['#438369', '#639971', '#adb989', '#386e60'], water: '#247e93', light: '#ffedc8' },
  jungle: { top: '#578596', horizon: '#ccd8b8', fog: '#9ab2ab', ground: ['#326c53', '#4f805b', '#798659', '#3f6450'], water: '#4d8b8a', light: '#e9e0b3' },
  south_atlantic: { top: '#708da5', horizon: '#d6dcd7', fog: '#a2b4c1', ground: ['#708075', '#87907a', '#a0a491', '#566b63'], water: '#3c697e', light: '#ebdfc4' },
  desert: { top: '#668eaa', horizon: '#efdbc1', fog: '#c7b2a0', ground: ['#bb956d', '#cfae7e', '#e0c59b', '#a78162'], water: '#548391', light: '#fff0ce' },
  mountains: { top: '#5f82a0', horizon: '#e0e2d9', fog: '#a5bcc7', ground: ['#617a70', '#7e927d', '#b2b09b', '#4d665b'], water: '#4d7d8d', light: '#f2e7ce' },
  canyon: { top: '#517fa3', horizon: '#e9d9bc', fog: '#aebabb', ground: ['#998b69', '#a97e5c', '#5e7565', '#b2a17b'], water: '#3f7d88', light: '#ffe7be' },
};

const day = {
  name: 'day', direction: [-.56, .59, .58], disc: '#fff2c9', glow: '#ffe9bb',
  cloud: '#e9ede2', sunStrength: 1, ambientColor: '#c2d7df', ambientGround: '#526254', sunIntensity: 2.8, ambientIntensity: 2,
};
const dawn = {
  ...day, name: 'dawn', direction: [-.62, .15, .77], top: '#647d9d', horizon: '#f6d8ab', fog: '#b5b9bc',
  light: '#ffd7a6', disc: '#fff1cc', glow: '#ffcd9a', cloud: '#e8ded5', sunStrength: 1.08,
  ambientColor: '#b8c8e3', ambientGround: '#535f5b', sunIntensity: 2.5, ambientIntensity: 1.9,
};
const dusk = {
  ...day, name: 'dusk', direction: [.59, .12, .8], top: '#505f8b', horizon: '#e9aa94', fog: '#a6a1b3',
  light: '#ffb67e', disc: '#ffe1ad', glow: '#ffad7e', cloud: '#dbbed1', sunStrength: 1.08,
  ambientColor: '#a6b2d9', ambientGround: '#4c555e', sunIntensity: 2.3, ambientIntensity: 1.8,
};
const night = {
  ...day, name: 'night', direction: [.49, .43, .75], top: '#091729', horizon: '#405972', fog: '#2e445e',
  ground: ['#263f40', '#364c45', '#4a584b', '#22373a'], water: '#1b344b', light: '#b8ceea',
  disc: '#dceaff', glow: '#829fc2', cloud: '#8da3b9', sunStrength: .23,
  ambientColor: '#7893b5', ambientGround: '#19272f', sunIntensity: .75, ambientIntensity: 1.3,
};
const gunshipGround = ['#2b4140', '#304644', '#354a46', '#2d4241'];

export function atmosphereFor(mission, menu = false) {
  const biome = mission?.biome;
  const hour = String(mission?.weather?.timeOfDay || 'day').toLowerCase();
  const phase = biome === 'night' || /night/.test(hour) ? night
    : /dawn|sunrise|morning/.test(hour) ? dawn : menu || /dusk|sunset|evening/.test(hour) ? dusk : day;
  const palette = { ...(biomes[biome] || biomes.countryside), ...phase };
  if (mission?.kind === 'gunship') palette.ground = gunshipGround;
  return palette;
}
