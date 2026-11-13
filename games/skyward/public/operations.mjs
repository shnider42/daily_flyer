import { AIRCRAFT } from './campaign.mjs';
import { terrainHeight } from './terrain.mjs';

// Authored, repeatable flying problems. These are fictional arcade exercises,
// separate from the historical campaign and its unlock/progress state.
const runway = (x, z, label, extras = {}) => ({ x, z, y: 24, heading: 0, length: 1800, width: 110, label, carrier: false, ...extras });
const gate = (x, y, z, label, radius = 250) => ({ x, y, z, radius, label });
const air = (aircraft, x, y, z, heading = 0) => ({ x, y, z, heading, speed: AIRCRAFT[aircraft].cruise, airborne: true });
const ground = (id, x, z, label, extra = {}) => ({ id, type: 'depot', x, y: 20, z, health: 100, label, ...extra });
const fighter = (id, x, y, z, extra = {}) => ({ id, type: 'fighter', aircraft: 'f4', x, y, z, heading: Math.PI, speed: 205, health: 90, label: 'Hostile fighter', ...extra });
const weather = extra => ({ wind: { x: 2, z: 0 }, cloudBase: 2000, cloudTop: 3100, fog: .000025, timeOfDay: 'day', ...extra });
const operation = (id, category, gold, silver, definition) => ({
  id, operation: { id, category, medals: { gold: { time: gold, health: 85 }, silver: { time: silver, health: 55 } } },
  era: 'Independent operations', year: 'Open skies', kind: 'operation', weatherPreset: 'authored',
  enemies: [], targets: [], waypoints: [], sources: [],
  historicalNote: 'A fictional SKYWARD exercise. Routes, timing, targets and aircraft performance are game rules.',
  ...definition,
});

const canyon = { biome: 'canyon', runways: [runway(5200, -6500, 'Razorback plateau', { y: 1350, length: 2100 })] };
const canyonLine = z => 550 * Math.sin(z / 1700) + 210 * Math.sin(z / 680);
const canyonGates = [-5800, -4500, -3200, -1900, -600, 700, 2000, 3300].map((z, index) => {
  const x = canyonLine(z);
  return gate(x, terrainHeight(x, z, canyon) + 480, z, `CANYON ${index + 1} / 8`, 270);
});

export const OPERATIONS = [
  operation('op-ridge-runner', 'Low-level route', 310, 490, {
    title: 'Ridge Runner', aircraft: 'f16', location: 'Razorback Canyons', ...canyon,
    duration: '4–8 min', weather: weather({ timeOfDay: 'dawn', cloudBase: 2400 }),
    description: 'Thread eight canyon gates, climb out, and bring the jet back to the plateau.',
    briefing: ['Follow the eight numbered gates in order. The clock records the whole sortie; it never ends your flight.', 'The gates sit inside the canyon. Reduce thrust before a tight bend and leave room to raise the nose.', 'After the last gate, climb above the ridges and land at Razorback plateau. Gear down, throttle idle, brake to a stop.'],
    lesson: 'Read the bend · manage speed · return and land',
    start: air('f16', canyonLine(-6800), terrainHeight(canyonLine(-6800), -6800, canyon) + 570, -6800),
    waypoints: canyonGates,
    goal: { type: 'operation', task: 'route', destinationRunway: 0, stopSpeed: 3 },
  }),
  operation('op-mail-run', 'Transport', 420, 650, {
    title: 'The Mail Run', aircraft: 'c47', biome: 'countryside', location: 'Three field circuit', duration: '6–10 min',
    weather: weather({ wind: { x: 4, z: -1 }, cloudBase: 850, cloudTop: 1400, timeOfDay: 'dawn' }),
    description: 'Carry two loads between small airfields. Every delivery needs a landing and a full stop.',
    briefing: ['Depart West Field and deliver the first load to Mill Field. This C-47 carries mail, so there is no airdrop objective.', 'Land on the marked runway, set idle thrust and the brake, then hold still for four seconds to unload.', 'Take off again and make the second delivery at Orchard Field. The next field is marked after unloading.'],
    lesson: 'Heavy-aircraft planning · two landings · ground turnaround',
    runways: [runway(0, -2500, 'West Field', { length: 1450 }), runway(1300, 5200, 'Mill Field', { y: 35, length: 1550 }), runway(-2800, 11200, 'Orchard Field', { y: 32, heading: -.35, length: 1550 })],
    start: { x: 0, y: 27, z: -3120, heading: 0, speed: 0, airborne: false, gear: true },
    goal: { type: 'operation', task: 'courier', stops: [1, 2], holdSeconds: 4, stopSpeed: 3 },
  }),
  operation('op-coastwatch', 'Air defence', 420, 650, {
    title: 'Coastwatch', aircraft: 'f15', biome: 'coast', location: 'Coastal air station', duration: '5–10 min',
    weather: weather({ cloudBase: 2100, cloudTop: 3300 }),
    description: 'Break up two successive fighter patrols, then recover at the coastal air station.',
    briefing: ['Two hostile fighters are approaching from the north. Select a contact and build a lock before firing.', 'A second pair enters after the first patrol is cleared. Keep track of your missiles and use the coastline to orient yourself.', 'Once all four contacts are down, return to the air station. The operation ends only after a safe landing and stop.'],
    lesson: 'Manage contacts · retain weapons · bring the aircraft home',
    runways: [runway(0, -6000, 'Coastal air station', { length: 2300, width: 120 })],
    start: air('f15', 0, 1600, -4500),
    enemies: [fighter('coast-1', -700, 1600, 2500), fighter('coast-2', 800, 1900, 3700)],
    reinforcements: [fighter('coast-3', -1700, 2300, 8500, { missiles: true, label: 'Second patrol lead' }), fighter('coast-4', 1300, 2100, 9900, { label: 'Second patrol wing' })],
    goal: { type: 'operation', task: 'air', count: 4, destinationRunway: 0, stopSpeed: 3 },
  }),
  operation('op-broken-supply', 'Close support', 430, 680, {
    title: 'Broken Supply', aircraft: 'a10', biome: 'desert', location: 'Dry river supply road', duration: '5–10 min',
    weather: weather({ wind: { x: 5, z: 0 }, timeOfDay: 'dusk' }),
    description: 'Clear three supply positions near a protected camp, then return with the aircraft intact.',
    briefing: ['Destroy the three red supply objectives. The blue relief camp is protected; hitting it fails the operation.', 'A flak position covers the road. Use guns or conventional bombs and check the impact marker before every release.', 'Fly back to Dry Lake airfield after the strike. Keep enough height and airspeed for the return and landing.'],
    lesson: 'Identify targets · control the blast area · return to base',
    runways: [runway(0, -5000, 'Dry Lake airfield', { y: 20, length: 2000 })],
    start: air('a10', -400, 1000, -3000),
    targets: [ground('supply-west', -950, 4300, 'West supply store'), ground('supply-east', 1200, 5800, 'East supply store'), ground('supply-convoy', -350, 7400, 'Supply convoy', { type: 'tank', health: 140 }), ground('relief-camp', 2300, 4700, 'RELIEF CAMP · protect', { friendly: true, health: 120 }), ground('road-flak', -1300, 6500, 'Road flak', { type: 'flak', hazard: true, radius: 1400, health: 80 })],
    goal: { type: 'operation', task: 'ground', count: 3, targetIds: ['supply-west', 'supply-east', 'supply-convoy'], protectIds: ['relief-camp'], destinationRunway: 0, stopSpeed: 3 },
  }),
  operation('op-deck-circuit', 'Carrier handling', 260, 430, {
    title: 'Deck Circuit', aircraft: 'harrier', biome: 'pacific', location: 'Open ocean carrier', duration: '4–7 min',
    weather: weather({ wind: { x: 5, z: 2 }, timeOfDay: 'dusk', cloudBase: 1200, cloudTop: 2000 }),
    description: 'Fly a short circuit over open water, then settle back onto the deck in hover.',
    briefing: ['Follow the four gates around the carrier. There are no hostile aircraft; focus on the wind and your turn.', 'On return, slow below 130 m/s before selecting HOVER. The carrier has a solid island on its right side.', 'Settle on the clear deck in hover, then idle the thrust and stop. A flyby or a water landing will not finish the circuit.'],
    lesson: 'Open-water navigation · approach planning · hover recovery',
    runways: [runway(0, 0, 'SKYWARD carrier', { y: 28, length: 310, width: 40, carrier: true, launchLaneX: -4.8 })],
    start: air('harrier', -900, 500, -3300),
    waypoints: [gate(-1500, 550, -1800, 'OUTBOUND', 330), gate(-2300, 650, 1500, 'CROSSWIND', 360), gate(1300, 650, 2800, 'DOWNWIND', 380), gate(1700, 400, -1800, 'RECOVERY', 300)],
    goal: { type: 'operation', task: 'route', destinationRunway: 0, stopSpeed: 3, requireHover: true },
  }),
  operation('op-heavy-metal', 'Heavy bomber', 480, 720, {
    title: 'Heavy Metal', aircraft: 'b17', biome: 'countryside', location: 'Northern rail yards', duration: '6–12 min',
    weather: weather({ wind: { x: -4, z: 2 }, cloudBase: 600, cloudTop: 1000, timeOfDay: 'day' }),
    description: 'Line up a heavy bomber over two separated rail yards and bring it back through low cloud.',
    briefing: ['Destroy both red rail yards with conventional bombs. The impact marker accounts for the bomb falling while you fly forward.', 'The yards are far enough apart to need separate drops. Line up early: this aircraft takes time to pitch and roll.', 'The home field lies south of the yards. Descend through the cloud with room to settle your speed, then land and brake to a stop.'],
    lesson: 'Plan the run · use the impact marker · handle heavy inertia',
    runways: [runway(0, -4200, 'Northwick bomber field', { length: 2200, width: 125 })],
    start: air('b17', 0, 1650, -1800),
    targets: [ground('rail-yard-a', -180, 4600, 'West rail yard', { health: 140 }), ground('rail-yard-b', 1900, 7900, 'East rail yard', { health: 140 }), ground('rail-flak', -850, 6000, 'Rail defence', { type: 'flak', hazard: true, radius: 1400, health: 80 })],
    goal: { type: 'operation', task: 'ground', count: 2, targetIds: ['rail-yard-a', 'rail-yard-b'], destinationRunway: 0, stopSpeed: 3 },
  }),
];

export function getOperation(id) { return OPERATIONS.find(mission => mission.id === id) || null; }
