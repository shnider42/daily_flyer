/** Short, human-facing place descriptions for charts and navigation. */
import { stationTypeFor, planetTypeFor, systemTypeFor, WORLD_SIZES } from './world-types.mjs';
import { planetSettlementPlan } from './planet-layout.mjs';
import { ringHabitatFor } from './ring-habitats.mjs';
import { systemIdentity as authoredSystemIdentity } from './system-identity.mjs';

const stationSizes = {
  compact: 'Compact station', regional: 'Regional station', research: 'Research station',
  industrial: 'Large working station', metropolitan: 'Metropolitan station', capital: 'Capital station'
};

export function placeIdentity(body, seed = 'farwake') {
  if (!body) return null;
  const habitat=ringHabitatFor(body);
  if(habitat)return {name:habitat.role,scale:'Inhabited inner landscape',description:habitat.description,activity:habitat.activity,location:habitat.description,locationKind:'ring-habitat'};
  if (body.kind === 'station') {
    const type = stationTypeFor(body);
    return { name: type.name, scale: stationSizes[body.sizeClass || type.sizeClass] || 'Orbital station', description: type.description, activity: type.activity,
      location: body.stationGeography?.reason || null, locationKind: body.stationGeography?.kind || null };
  }
  if (body.kind === 'planet' || body.kind === 'moon') {
    const type = planetTypeFor(body), size = body.sizeClass || (body.kind === 'moon' ? 'moon' : type.sizeClass);
    const settlement = body.techLevel === 'preflight' || body.portServices === false ? null : planetSettlementPlan(body, seed);
    return { name: type.name, scale: WORLD_SIZES[size]?.name || 'Terrestrial world', description: type.description,
      settlementName: settlement?.name || null, settlementDescription: settlement?.description || null };
  }
  return null;
}

export function systemIdentity(system) {
  const identity=authoredSystemIdentity(system);
  if(identity)return {name:identity.role,description:identity.description,activities:identity.activities};
  if (!system?.systemTypeId) return null;
  const type = systemTypeFor(system);
  return { name: type.name, description: type.description };
}
