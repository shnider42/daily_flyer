import { AIRCRAFT, getAircraft } from './campaign.mjs';
import { terrainHeight, carrierLaunchLane, carrierIslandParts } from './terrain.mjs';
import { modeledAirframeBounds } from './airframes.mjs';

export const ROOM_MODES = Object.freeze(['freeflight', 'dogfight', 'team-dogfight', 'squadron', 'coop', 'crew']);
export const ROUND_DURATIONS = Object.freeze([180, 300, 600, 1200]);
export const ARENA_MAPS = Object.freeze([
  { id: 'canyon', name: 'Razorback Canyons', label: 'Razorback Canyons', biome: 'canyon',
    description: 'Deep branching ravines, steep rock walls and open plateaus. Break a radar track behind a ridge and let pursuing missiles meet the rock.' },
  { id: 'islands', name: 'Open Ocean Islands', label: 'Open Ocean Islands', biome: 'pacific',
    description: 'Wide ocean, two mountainous islands and a carrier. Room for every generation of flight.' },
]);
export const ARENA_RESPAWN_DELAY = 4;
export const MISSION_RESPAWN_DELAY = 5;
export const isDogfightMode = mode => mode === 'dogfight' || mode === 'team-dogfight';
export const isArenaMode = mode => mode === 'freeflight' || isDogfightMode(mode);
export const usesRoomMap = mode => mode === 'coop' || isArenaMode(mode);
export const requiresFourPilots = mode => mode === 'coop' || mode === 'team-dogfight';
export const roomMapMissionId = ({ mode, mapId }) => `${mode === 'coop' ? 'coop' : 'arena'}-${mapId}`;
export const roomTeam = index => index % 2 ? 'red' : 'blue';
export const teamName = team => team === 'blue' ? 'Blue Flight' : team === 'red' ? 'Red Flight' : '';
export const arePilotsHostile = (mode, a, b) => mode === 'dogfight' || mode === 'team-dogfight' && teamName(a) !== '' && teamName(b) !== '' && a !== b;

export function teamDogfightStandings(players = []) {
  const teams = ['blue', 'red'].map(team => ({ team, name: teamName(team), kills: 0, deaths: 0 }));
  for (const pilot of players) {
    const team = teams.find(row => row.team === pilot.team);
    if (!team) continue;
    team.kills += pilot.kills || 0;
    team.deaths += pilot.deaths || 0;
  }
  const [blue, red] = teams;
  const winner = blue.kills === red.kills ? null : (blue.kills > red.kills ? blue : red);
  return { teams, winner };
}

export function normalizeArenaConfig(config = {}) {
  const mode = ROOM_MODES.includes(config.mode) ? config.mode : 'freeflight';
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
  const assisted = !!a.carrierLaunch;
  const supported = assisted || a.vtol;
  const level = supported ? 'compatible' : ['avro504', 'camel'].includes(a.id) ? 'experimental' : 'high-risk';
  const label = supported ? a.vtol ? 'VTOL deck departure' : 'Carrier launch compatible' : level === 'experimental' ? 'Experimental deck departure' : 'High-risk deck departure';
  let warning = supported
    ? a.vtol ? 'Select HOVER, release the brake and raise thrust for a vertical departure. Forward flight still needs enough airspeed.'
      : 'This aircraft has modeled carrier launch assistance. Release the brake, use full power and raise the nose when airspeed builds.'
    : `${a.name} has no compatible carrier launch assistance in SKYWARD. The short deck, takeoff speed and aircraft size can make departure fail. You may still attempt it; the aircraft keeps its normal performance.`;
  if (oversized) warning = `${a.name}'s modeled wings overlap the carrier island by ${Math.abs(wingClearance).toFixed(1)} m on the marked launch lane. Driving straight ahead can destroy the aircraft. Steer clear of the visible island before accelerating; the short deck remains your risk. You may attempt the launch.`;
  else if (wingClearance < 2) warning = `${a.name} has only ${wingClearance.toFixed(1)} m of modeled wing clearance beside the carrier island. A small drift or turn can cause a collision. ${warning}`;
  return { level, label, warning, supported, allowed: true, assisted,
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

function coopMission(mapId) {
  const fighter = (id, x, y, z, aircraft = 'f4', extra = {}) => ({
    id, x, y, z, aircraft, type: 'fighter', heading: Math.PI, speed: getAircraft(aircraft).cruise,
    health: 120, label: 'Hostile fighter', ...extra,
  });
  if (mapId === 'canyon') {
    const targets = [
      { id: 'relay-west', x: -940, z: 7800, type: 'depot', health: 125, label: 'West relay' },
      { id: 'ridge-sam', x: 1800, z: 9400, type: 'sam', radius: 2100, health: 140, label: 'Ridge air defense' },
      { id: 'relay-east', x: 3200, z: 10300, type: 'depot', health: 125, label: 'East relay' },
    ];
    return {
      title: 'Razorback Strike', kind: 'multirole',
      description: 'Clear four fighters and three ground sites across Razorback’s branching ravines.',
      briefing: ['Split into cover and strike pairs. The four fighters can pursue any of you.',
        'Destroy both relays and the ridge air-defense site. Guns, missiles or bombs can clear the ground targets.',
        'Use the ravines to break enemy locks, then climb clear of the ridge before the final attack.'],
      enemies: [fighter('ridge-a', -1100, 2300, 5650, 'f4', { missiles: true }),
        fighter('ridge-b', 1200, 2900, 6450, 'f4', { missiles: true }),
        fighter('ridge-c', -3500, 2650, 9200, 'f16'),
        fighter('ridge-d', 3600, 3100, 10500, 'f15', { missiles: true })],
      targets,
      goal: { type: 'mixed', air: 4, ground: targets.length, targetIds: targets.map(t => t.id), egress: 6 },
    };
  }
  const bomber = (id, x, y, z) => fighter(id, x, y, z, 'b17', { type: 'bomber', speed: 88, health: 165, label: 'Inbound bomber' });
  return {
    title: 'Island Intercept', kind: 'airsuperiority',
    description: 'Turn back a three-bomber raid over open water while three escorts try to draw your flight away.',
    briefing: ['The three bombers are heading south for the fleet. Track the bombers first.',
      'Split the formation and intercept before two bombers cross the defense line. Escorts are secondary targets.',
      'Use the island and carrier to regroup if you lose an aircraft. Your whole flight shares the defense result.'],
    enemies: [bomber('raid-bomber-a', -1850, 2150, 7350), bomber('raid-bomber-b', -200, 2460, 8150),
      bomber('raid-bomber-c', 1630, 2310, 9050),
      fighter('raid-escort-a', -2400, 2560, 6400, 'f4', { missiles: true }),
      fighter('raid-escort-b', 2400, 3260, 6950, 'f4', { missiles: true }),
      fighter('raid-escort-c', 0, 3100, 9550, 'f16')],
    targets: [],
    goal: { type: 'intercept', count: 3, bomberRaid: true, defenseLine: 1200, egress: 6 },
  };
}

export function createArenaMission(config = {}, aircraft = 'f16') {
  const settings = normalizeArenaConfig(config), map = ARENA_MAPS.find(item => item.id === settings.mapId);
  const a = getAircraft(aircraft), dogfight = isDogfightMode(settings.mode);
  const mission = {
    id: roomMapMissionId(settings), title: map.name, year: 'All eras', era: 'Open skies', location: map.name,
    aircraft: a.id, kind: dogfight ? 'dogfight' : 'free', biome: map.biome,
    arena: true, arenaConfig: settings, duration: dogfight ? `${settings.durationSeconds / 60} min` : 'Unlimited',
    description: map.description,
    briefing: [settings.mode === 'team-dogfight' ? 'Blue and Red flights earn a point for each opposing aircraft they down. Friendly fire is off. The team with more points at the horn wins.'
      : dogfight ? 'Every pilot chooses an aircraft. Fight until the round timer ends; deaths allow a fresh aircraft after a short delay.' : 'Fly together with any aircraft and practice at your own pace. Player weapons do not damage other pilots in free flight.',
      'Aircraft keep their own speed, handling and weapon capabilities. An unarmed aircraft stays unarmed.',
      'Terrain blocks radar line of sight and intercepts missiles. Watch height above ground when entering a canyon.'],
    lesson: 'Choose your aircraft · fly the terrain · keep your own flight alive',
    weather: { wind: { x: 2, z: 0 }, cloudBase: 2600, cloudTop: 3800, fog: 0.000025, timeOfDay: 'day' },
    start: { x: 0, y: 1900, z: -2600, heading: 0, speed: a.cruise, airborne: true },
    runways: [map.id === 'canyon'
      ? { x: 5200, z: -6500, y: 1350, heading: 0, length: 1900, width: 105, carrier: false, label: 'Razorback plateau airfield' }
      : { x: 6500, z: 7000, y: 560, heading: 0, length: 1750, width: 105, carrier: false, label: 'North island airfield' }],
    waypoints: [], enemies: [], targets: [], goal: { type: dogfight ? 'dogfight' : 'free' },
    historicalNote: 'Fictional terrain and arcade flight values. Every aircraft retains its own modeled performance and stores.', sources: [],
  };
  if (settings.mode === 'coop') Object.assign(mission, coopMission(map.id), {
    era: 'Four-pilot co-op', duration: '4–8 min', lesson: 'Share objectives · coordinate roles · return as a flight',
  });
  // Both maps always include their carrier, even when nobody chooses its deck.
  const prepared = ensureCarrier(mission);
  if (settings.mode === 'team-dogfight') {
    const canyon = map.id === 'canyon';
    const [airfield, carrier] = prepared.runways;
    Object.assign(airfield, { team: 'blue', label: 'Blue Flight airfield' });
    Object.assign(carrier, { team: 'blue', label: 'Blue Flight carrier' });
    const redField = { ...airfield, x: canyon ? 5500 : -7000, z: canyon ? 6800 : 13500, heading: Math.PI,
      team: 'red', label: 'Red Flight airfield' };
    redField.y = terrainHeight(redField.x, redField.z, prepared);
    prepared.runways.push(redField, { ...carrier, x: canyon ? -15100 : -6500, z: canyon ? 5500 : 5000, heading: Math.PI,
      team: 'red', label: 'Red Flight carrier' });
  }
  return prepared;
}

export function spawnForPlayer(mission, aircraft, index = 0, startMode = 'airborne', lifeId = 1, team = null) {
  const a = getAircraft(typeof aircraft === 'string' ? aircraft : aircraft.id), i = Math.max(0, index | 0);
  if (startMode === 'high') {
    const spawn = spawnForPlayer(mission, a.id, i, 'airborne', lifeId, team);
    return { ...spawn, y: Math.max(0, terrainHeight(spawn.x, spawn.z, mission)) + 6500, airborne: true, cold: false, gear: a.fixedGear };
  }
  if (startMode === 'carrier') {
    const carrier = mission.runways?.find(runway => runway.carrier && (!team || runway.team === team));
    if (carrier) {
      const along = -carrier.length / 2 + 24 + (i % 4) * 6, across = carrierLaunchLane(carrier);
      return { x: carrier.x + Math.sin(carrier.heading) * along + Math.cos(carrier.heading) * across,
        z: carrier.z + Math.cos(carrier.heading) * along - Math.sin(carrier.heading) * across,
        y: carrier.y + 3, heading: carrier.heading, speed: 0, airborne: false, gear: true,
        carrier: true, carrierLaunch: carrierCompatibility(a, carrier).assisted };
    }
  }
  if (startMode === 'runway') {
    const runway = mission.runways?.find(item => !item.carrier && (!team || item.team === team));
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
  const rotation = (lifeId - 1) * 0.73;
  const turn = team ? (team === 'red' ? Math.PI : 0) + (i < 2 ? -0.25 : 0.25) + 0.12 * Math.sin(rotation)
    : mission.arenaConfig?.mode === 'coop' ? (i - 1.5) * 0.13
      : i * Math.PI / 2 + rotation;
  const radius = mission.biome === 'canyon' ? 3100 : 3900;
  const x = Math.sin(turn) * radius, z = -Math.cos(turn) * radius;
  return { x, z, y: Math.max(1900, terrainHeight(x, z, mission) + 650),
    heading: Math.atan2(-x, -z), speed: a.cruise, airborne: true, gear: a.fixedGear };
}

export function aircraftChoice(id) { return Object.hasOwn(AIRCRAFT, id) ? id : 'f16'; }
