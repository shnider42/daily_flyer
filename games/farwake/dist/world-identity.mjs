/** Short, human-facing place descriptions for charts and navigation. */
import { stationTypeFor, planetTypeFor, systemTypeFor, WORLD_SIZES } from './world-types.mjs';

const stationSizes = {
  compact: 'Compact station', regional: 'Regional station', research: 'Research station',
  industrial: 'Large working station', metropolitan: 'Metropolitan station', capital: 'Capital station'
};

export function placeIdentity(body) {
  if (!body) return null;
  if (body.kind === 'station') {
    const type = stationTypeFor(body);
    return { name: type.name, scale: stationSizes[body.sizeClass || type.sizeClass] || 'Orbital station', description: type.description, activity: type.activity };
  }
  if (body.kind === 'planet' || body.kind === 'moon') {
    const type = planetTypeFor(body), size = body.sizeClass || (body.kind === 'moon' ? 'moon' : type.sizeClass);
    return { name: type.name, scale: WORLD_SIZES[size]?.name || 'Terrestrial world', description: type.description };
  }
  return null;
}

export function systemIdentity(system) {
  if (!system?.systemTypeId) return null;
  const type = systemTypeFor(system);
  return { name: type.name, description: type.description };
}
