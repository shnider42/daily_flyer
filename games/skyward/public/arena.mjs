import { AIRCRAFT, getAircraft } from './campaign.mjs';
import { terrainHeight, carrierLaunchLane, carrierIslandParts } from './terrain.mjs';
import { modeledAirframeBounds } from './airframes.mjs';

export const ROUND_DURATIONS = Object.freeze([300, 600, 1200]);
export const ARENA_MAPS = Object.freeze([
  { id: 'canyon', name: 'Razorback Canyons', label: 'Razorback Canyons', biome: 'canyon',
    description: 'Deep branching ravines, steep rock walls and open plateaus. Break a radar track behind a ridge and let pursuing missiles meet the rock.' },
  { id: 'islands', name: 'Open Ocean Islands', label: 'Open Ocean Islands', biome: 'pacific',
    description: 'Wide ocean, two mountainous islands and a carrier. Room for every generation of flight.' },
]);
export const ARENA_RESPAWN_DELAY = 4;
export const MISSION_RESPAWN_DELAY = 5;

export function normalizeArenaConfig(config = {}) {
  const mode = ['freeflight', 'dogfight', 'squadron', 'crew'].includes(config.mode) ? config.mode : 'freeflight';
  return {
    mode, mapId: ARENA_MAPS.some(map => map.id === config.mapId) ? config.mapId : 'canyon',
    durationSeconds: ROUND_DURATIONS.includes(Number(config.durationSeconds)) ? Number(config.durationSeconds) : 600,
    lives: [1, 3, 5].includes(Number(config.lives)) ? Number(config.lives) : 3,
  };
}

/** Compatibility describes this game's launch model, never an entry gate. */
export function carrierCompatibility(aircraft, runway = { width: 40, length: 310 }) {
  const a = typeof aircraft === 'string' ? getAircraft(aircraft) : aircraft;
  const bounds = modeledAirframeBounds(a), halfSpan = (bounds.max[0] - bounds.min[0]) / 2;
  const island = carrierIslandParts(runway)[0], laneClearance = island.x - island.width / 2 - carrierLaunchLane(runway);
  const wingClearance = laneClearance - halfSpan, oversized = wingClearance < 0;
  const supported = a.id === 'hellcat' || a.vtol;
  const level = supported ? 'compatible' : ['avro504', 'camel'].includes(a.id) ? 'experimental' : 'high-risk';
  const label = supported ? a.vtol ? 'VTOL deck departure' : 'Carrier launch compatible' : level === 'experimental' ? 'Experimental deck departure' : 'High-risk deck departure';
  let warning = supported
    ? a.vtol ? 'Select HOVER, release the brake and raise thrust for a vertical departure. Forward flight still needs enough airspeed.'
      : 'This aircraft has modeled carrier launch assistance. Release the brake, use full power and raise the nose when airspeed builds.'
    : `${a.name} has no compatible carrier launch assistance in SKYWARD. The short deck, takeoff speed and aircraft size can make departure fail. You may still attempt it; the aircraft keeps its normal performance.`;
  if (oversized) warning = `${a.name}'s modeled wings overlap the carrier island by ${Math.abs(wingClearance).toFixed(1)} m on the marked launch lane. Driving straight ahead can destroy the aircraft. Steer clear of the visible island before accelerating; the short deck remains your risk. You may attempt the launch.`;
  else if (wingClearance < 2) warning = `${a.name} has only ${wingClearance.toFixed(1)} m of modeled wing clearance beside the carrier island. A small drift or turn can cause a collision. It has no carrier launch assistance; you may attempt the departure at your own risk.`;
  return { level, label, warning, supported, allowed: true, assisted: a.id === 'hellcat',
    takeoffSpeed: Math.round(a.stallSpeed * 1.12), deckLength: runway.length || 310, halfSpan, laneClearance, wingClearance, oversized };
}

/** Deterministic infrastructure shared by all clients before they spawn. */
export function prepareMissionStarts(mission, players = []) {
  const prepared = structuredClone(mission);
  prepared.runways ||= [];
  if (!players.some(player => player.startMode === 'carrier') || prepared.runways.some(runway => runway.carrier)) return prepared;
  const ocean = ['pacific', 'south_atlantic'].includes(prepared.biome);
  const x = prepared.biome === 'canyon' ? -15000 : ocean ? 0 : -18000;
  const z = prepared.biome === 'canyon' ? -3000 : ocean ? -1500 : -12000;
  if (!ocean && prepared.biome !== 'canyon') prepared.carrierWater = { x, z, radius: 3400, shore: 1000 };
  prepared.runways.push({ x, z, y: 28, heading: 0, length: 310, width: 40, launchLaneX: -4.8,
    carrier: true, label: 'SKYWARD carrier', launchAssist: true });
  return prepared;
}

export const ensureCarrier = mission => prepareMissionStarts(mission, [{ startMode: 'carrier' }]);

export function createArenaMission(config = {}, aircraft = 'f16') {
  const settings = normalizeArenaConfig(config), map = ARENA_MAPS.find(item => item.id === settings.mapId);
  const a = getAircraft(aircraft);
  const mission = {
    id: `arena-${map.id}`, title: map.name, year: 'All eras', era: 'Open skies', location: map.name,
    aircraft: a.id, kind: settings.mode === 'dogfight' ? 'dogfight' : 'free', biome: map.biome,
    arena: true, arenaConfig: settings, duration: settings.mode === 'dogfight' ? `${settings.durationSeconds / 60} min` : 'Unlimited',
    description: map.description,
    briefing: [settings.mode === 'dogfight' ? 'Every pilot chooses an aircraft. Fight until the round timer ends; deaths allow a fresh aircraft after a short delay.' : 'Fly together with any aircraft and practice at your own pace. Player weapons do not damage other pilots in free flight.',
      'Aircraft keep their own speed, handling and weapon capabilities. An unarmed aircraft stays unarmed.',
      'Terrain blocks radar line of sight and intercepts missiles. Watch height above ground when entering a canyon.'],
    lesson: 'Choose your aircraft · fly the terrain · keep your own flight alive',
    weather: { wind: { x: 2, z: 0 }, cloudBase: 2600, cloudTop: 3800, fog: 0.000025, timeOfDay: 'day' },
    start: { x: 0, y: 1900, z: -2600, heading: 0, speed: a.cruise, airborne: true },
    runways: [map.id === 'canyon'
      ? { x: 5200, z: -6500, y: 1350, heading: 0, length: 1900, width: 105, carrier: false, label: 'Razorback plateau airfield' }
      : { x: 6500, z: 7000, y: 560, heading: 0, length: 1750, width: 105, carrier: false, label: 'North island airfield' }],
    waypoints: [], enemies: [], targets: [], goal: { type: settings.mode === 'dogfight' ? 'dogfight' : 'free' },
    historicalNote: 'Fictional terrain and arcade flight values. Every aircraft retains its own modeled performance and stores.', sources: [],
  };
  // Both maps always include their carrier, even when nobody chooses its deck.
  return ensureCarrier(mission);
}

export function spawnForPlayer(mission, aircraft, index = 0, startMode = 'airborne', lifeId = 1) {
  const a = getAircraft(typeof aircraft === 'string' ? aircraft : aircraft.id), i = Math.max(0, index | 0);
  if (startMode === 'high') {
    const spawn = spawnForPlayer(mission, a.id, i, 'airborne', lifeId);
    return { ...spawn, y: Math.max(0, terrainHeight(spawn.x, spawn.z, mission)) + 6500, airborne: true, cold: false, gear: a.fixedGear };
  }
  if (startMode === 'carrier') {
    const carrier = mission.runways?.find(runway => runway.carrier);
    if (carrier) {
      const along = -carrier.length / 2 + 24 + (i % 4) * 6, across = carrierLaunchLane(carrier);
      return { x: carrier.x + Math.sin(carrier.heading) * along + Math.cos(carrier.heading) * across,
        z: carrier.z + Math.cos(carrier.heading) * along - Math.sin(carrier.heading) * across,
        y: carrier.y + 3, heading: carrier.heading, speed: 0, airborne: false, gear: true,
        carrier: true, carrierLaunch: carrierCompatibility(a).assisted };
    }
  }
  if (startMode === 'runway') {
    const runway = mission.runways?.find(item => !item.carrier);
    if (runway) {
      const along = -runway.length / 2 + 45 + (i % 4) * 38;
      return { x: runway.x + Math.sin(runway.heading) * along, z: runway.z + Math.cos(runway.heading) * along,
        y: runway.y + 3, heading: runway.heading, speed: 0, airborne: false, gear: true };
    }
  }
  if (!mission.arena && lifeId === 1 && startMode !== 'airborne') return { ...mission.start };
  if (!mission.arena) {
    const origin = mission.start || {}, heading = origin.heading || 0;
    const lateral = i * 150;
    return { ...origin, x: (origin.x || 0) + Math.cos(heading) * lateral,
      z: (origin.z || 0) - Math.sin(heading) * lateral,
      y: Math.max(origin.y || 0, terrainHeight(origin.x || 0, origin.z || 0, mission) + 650),
      speed: a.cruise, airborne: true, cold: false, gear: a.fixedGear };
  }
  const turn = i * Math.PI / 2 + (lifeId - 1) * 0.73;
  const radius = mission.biome === 'canyon' ? 3100 : 3900;
  const x = Math.sin(turn) * radius, z = -Math.cos(turn) * radius;
  return { x, z, y: Math.max(1900, terrainHeight(x, z, mission) + 650),
    heading: Math.atan2(-x, -z), speed: a.cruise, airborne: true, gear: a.fixedGear };
}

export function aircraftChoice(id) { return Object.hasOwn(AIRCRAFT, id) ? id : 'f16'; }
