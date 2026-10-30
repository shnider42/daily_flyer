// BREACH — original browser-local simulation. No DOM or graphics dependencies.
import { UNDERWORKS } from './underworks.mjs';
import { SWITCHYARD } from './switchyard.mjs';
import { GLASSHOUSE } from './glasshouse.mjs';
const TAU = Math.PI * 2;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const copy = (value) => JSON.parse(JSON.stringify(value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const finite = (value, lo, hi) => typeof value === 'number' && Number.isFinite(value) && value >= lo && value <= hi;

function createLevel() {
  const width = 31, height = 29;
  const cells = Array.from({ length: height }, () => Array(width).fill('#'));
  const room = (x1, z1, x2, z2) => {
    for (let z = z1; z <= z2; z++) for (let x = x1; x <= x2; x++) cells[z][x] = '.';
  };
  room(2, 22, 9, 26);                         // Arrival / safe teaching space.
  room(5, 19, 6, 21);
  room(2, 13, 14, 18);                        // Concourse.
  room(5, 10, 6, 12);
  room(2, 3, 12, 9);                         // Auxiliary generator.
  room(13, 6, 17, 6);                        // Powered northern airlock.
  room(18, 3, 28, 11);                       // Research lab and access key.
  room(22, 12, 24, 14);
  room(18, 15, 28, 21);                      // Quarantine hall.
  room(15, 16, 17, 16);                      // Powered return shortcut.
  room(23, 22, 23, 23);                      // Keyed extraction gate.
  room(18, 24, 28, 26);
  room(12, 19, 12, 21);                      // Hidden maintenance cache.
  room(11, 22, 15, 26);
  // Freestanding pillars and machinery create sightlines and cover.
  for (const [x, z] of [[7, 15], [11, 16], [6, 5], [7, 5], [6, 6], [7, 6], [21, 6], [22, 6], [25, 8], [21, 18], [25, 18]]) cells[z][x] = '#';
  const enemy = (id, type, x, z) => ({ id, type, x: x + .5, z: z + .5, health: type === 'brute' ? 145 : type === 'spitter' ? 70 : 52, maxHealth: type === 'brute' ? 145 : type === 'spitter' ? 70 : 52, alive: true });
  const pickup = (id, type, x, z, amount = 1) => ({ id, type, x: x + .5, z: z + .5, amount });
  return {
    id: 'blacksite-07-v1', missionId: 'blacksite-07', name: 'Blacksite 07', width, height,
    grid: cells.map(row => row.join('')),
    spawn: { x: 5.5, z: 25.5, angle: 0 },
    doors: [
      { id: 'arrival', x: 5.5, z: 20.5, axis: 'x', requires: null, open: false },
      { id: 'arrival-side', x: 6.5, z: 20.5, axis: 'x', requires: null, open: false, paired: 'arrival' },
      { id: 'lab-airlock', x: 15.5, z: 6.5, axis: 'z', requires: 'power', open: false },
      { id: 'return-airlock', x: 16.5, z: 16.5, axis: 'z', requires: 'power', open: false },
      { id: 'security', x: 23.5, z: 23.5, axis: 'x', requires: 'key', open: false },
      { id: 'maintenance', x: 12.5, z: 20.5, axis: 'x', requires: null, open: false, secret: true },
    ],
    interactables: [
      { id: 'aux-power', type: 'power', x: 10.5, z: 4.5, label: 'Restore auxiliary power' },
      { id: 'cache-panel', type: 'secret', x: 12.5, z: 19.5, label: 'Inspect maintenance panel' },
      { id: 'extraction', type: 'exit', x: 26.5, z: 25.5, label: 'Signal extraction' },
    ],
    pickups: [
      pickup('arrival-ammo', 'ammo', 5, 23, 28),
      pickup('arrival-armor', 'armor', 8, 24, 25),
      pickup('concourse-health', 'health', 3, 16, 35),
      pickup('concourse-ammo', 'ammo', 9, 17, 32),
      pickup('pump-shotgun', 'shotgun', 4, 8, 12),
      pickup('generator-health', 'health', 11, 8, 40),
      pickup('generator-ammo', 'ammo', 3, 4, 36),
      pickup('access-key', 'key', 26, 4),
      pickup('lab-shells', 'shells', 19, 4, 16),
      pickup('lab-health', 'health', 27, 10, 40),
      pickup('lab-armor', 'armor', 19, 10, 35),
      pickup('quarantine-shells', 'shells', 19, 20, 14),
      pickup('quarantine-ammo', 'ammo', 27, 16, 32),
      pickup('quarantine-health', 'health', 26, 20, 45),
      pickup('cache-armor', 'armor', 13, 24, 75),
      pickup('cache-shells', 'shells', 12, 23, 20),
      pickup('cache-health', 'health', 14, 25, 60),
    ],
    enemies: [
      enemy('c1', 'runner', 4, 16), enemy('c2', 'runner', 12, 14), enemy('c3', 'spitter', 10, 13),
      enemy('g1', 'runner', 3, 7), enemy('g2', 'spitter', 10, 7), enemy('g3', 'runner', 11, 3),
      enemy('l1', 'runner', 19, 7), enemy('l2', 'spitter', 26, 5), enemy('l3', 'runner', 24, 10), enemy('l4', 'brute', 27, 8),
      enemy('q1', 'runner', 20, 16), enemy('q2', 'spitter', 27, 18), enemy('q3', 'brute', 22, 20), enemy('q4', 'runner', 19, 20),
    ],
    zones: [
      { name: 'Arrival bay', x1: 2, x2: 10, z1: 21, z2: 27 },
      { name: 'Concourse', x1: 2, x2: 18, z1: 12, z2: 22 },
      { name: 'Auxiliary generator', x1: 2, x2: 18, z1: 3, z2: 12 },
      { name: 'Research laboratory', x1: 18, x2: 29, z1: 3, z2: 15 },
      { name: 'Quarantine hall', x1: 18, x2: 29, z1: 15, z2: 24 },
      { name: 'Extraction bay', x1: 18, x2: 29, z1: 24, z2: 27 },
      { name: 'Maintenance cache', x1: 11, x2: 16, z1: 22, z2: 27 },
    ],
  };
}

export const LEVEL = createLevel();

function createRelayLevel() {
  const width = 35, height = 33;
  const cells = Array.from({ length: height }, () => Array(width).fill('#'));
  const room = (x1, z1, x2, z2) => {
    for (let z = z1; z <= z2; z++) for (let x = x1; x <= x2; x++) cells[z][x] = '.';
  };
  room(14, 28, 20, 31);                     // Isolated maintenance landing.
  room(17, 25, 18, 27);
  room(5, 6, 8, 25);                        // Four wide galleries form a complete ring.
  room(26, 6, 29, 25);
  room(5, 6, 29, 9);
  room(5, 22, 29, 25);
  room(2, 19, 10, 25);                      // Power plant, southwest.
  room(2, 10, 10, 16);                      // Western relay room.
  room(24, 11, 32, 18);                     // Eastern relay room.
  room(12, 12, 22, 18);                     // Isolated communications vault.
  room(17, 10, 17, 11);                     // Only vault entrance; both relays unlock it.
  room(14, 2, 21, 4);                       // Extraction control, north.
  room(17, 5, 17, 5);
  room(30, 24, 30, 24);                     // Optional side cache.
  room(31, 22, 33, 27);
  // Console banks break the ring's sightlines without removing either route.
  for (const [x, z] of [[6, 14], [7, 14], [7, 20], [10, 7], [14, 8], [23, 7], [27, 12], [27, 17], [28, 17], [12, 23], [21, 24], [3, 22], [8, 12], [29, 14], [15, 15], [19, 15]]) cells[z][x] = '#';
  const enemy = (id, type, x, z) => ({ id, type, x: x + .5, z: z + .5, health: type === 'brute' ? 145 : type === 'spitter' ? 70 : 52, maxHealth: type === 'brute' ? 145 : type === 'spitter' ? 70 : 52, alive: true });
  const pickup = (id, type, x, z, amount = 1) => ({ id, type, x: x + .5, z: z + .5, amount });
  return {
    id: 'relay-09-v1', missionId: 'relay-09', name: 'Dead Relay', width, height,
    grid: cells.map(row => row.join('')),
    spawn: { x: 17.5, z: 30.5, angle: 0 },
    doors: [
      { id: 'arrival', x: 17.5, z: 26.5, axis: 'x', requires: null, open: false },
      { id: 'arrival-side', x: 18.5, z: 26.5, axis: 'x', requires: null, open: false, paired: 'arrival' },
      { id: 'relay-vault', x: 17.5, z: 11.5, axis: 'x', requires: 'relays', open: false },
      { id: 'security', x: 17.5, z: 5.5, axis: 'x', requires: 'key', open: false },
      { id: 'maintenance', x: 30.5, z: 24.5, axis: 'z', requires: null, open: false, secret: true },
    ],
    interactables: [
      { id: 'aux-power', type: 'power', x: 3.5, z: 20.5, label: 'Restore ring power' },
      { id: 'relay-west', type: 'relay', x: 3.5, z: 11.5, label: 'Activate western relay', requires: 'power' },
      { id: 'relay-east', type: 'relay', x: 31.5, z: 12.5, label: 'Activate eastern relay', requires: 'power' },
      { id: 'cache-panel', type: 'secret', x: 29.5, z: 24.5, label: 'Inspect service panel' },
      { id: 'extraction', type: 'exit', x: 19.5, z: 3.5, label: 'Transmit extraction signal' },
    ],
    pickups: [
      pickup('arrival-ammo', 'ammo', 17, 29, 36),
      pickup('arrival-armor', 'armor', 19, 30, 30),
      pickup('pump-shotgun', 'shotgun', 15, 24, 14),
      pickup('south-health', 'health', 9, 24, 35),
      pickup('south-ammo', 'ammo', 24, 23, 32),
      pickup('generator-ammo', 'ammo', 4, 20, 36),
      pickup('generator-health', 'health', 2, 24, 35),
      pickup('west-shells', 'shells', 9, 15, 14),
      pickup('west-health', 'health', 2, 15, 40),
      pickup('north-armor', 'armor', 8, 8, 35),
      pickup('north-ammo', 'ammo', 21, 8, 36),
      pickup('north-health', 'health', 28, 6, 35),
      pickup('east-shells', 'shells', 31, 17, 16),
      pickup('east-health', 'health', 25, 12, 40),
      pickup('east-armor', 'armor', 25, 17, 35),
      { ...pickup('access-key', 'key', 17, 16), requires: 'relays' },
      pickup('vault-shells', 'shells', 13, 13, 12),
      pickup('vault-health', 'health', 21, 16, 45),
      pickup('cache-armor', 'armor', 32, 23, 75),
      pickup('cache-shells', 'shells', 32, 25, 22),
      pickup('cache-health', 'health', 31, 26, 60),
    ],
    enemies: [
      enemy('s1', 'runner', 11, 24), enemy('s2', 'runner', 23, 24), enemy('s3', 'spitter', 27, 22), enemy('s4', 'runner', 19, 22),
      enemy('g1', 'runner', 4, 23), enemy('g2', 'spitter', 8, 20),
      enemy('w1', 'runner', 6, 17), enemy('w2', 'spitter', 4, 13), enemy('w3', 'runner', 9, 11),
      enemy('n1', 'spitter', 11, 7), { ...enemy('n2', 'sentry', 19, 7), health: 120, maxHealth: 120, faction: 'security' }, enemy('n3', 'runner', 25, 8),
      enemy('e1', 'runner', 27, 10), enemy('e2', 'spitter', 31, 14), enemy('e3', 'brute', 25, 16), enemy('e4', 'runner', 29, 19),
      enemy('v1', 'runner', 14, 16), enemy('v2', 'spitter', 20, 13), enemy('v3', 'brute', 21, 17), enemy('v4', 'runner', 13, 17),
    ],
    zones: [
      { name: 'Maintenance landing', x1: 14, x2: 21, z1: 26, z2: 32 },
      { name: 'Ring power plant', x1: 2, x2: 11, z1: 19, z2: 26 },
      { name: 'Western relay', x1: 2, x2: 11, z1: 10, z2: 17 },
      { name: 'Eastern relay', x1: 24, x2: 33, z1: 11, z2: 19 },
      { name: 'Communications vault', x1: 12, x2: 23, z1: 10, z2: 19 },
      { name: 'Extraction control', x1: 14, x2: 22, z1: 2, z2: 6 },
      { name: 'Service cache', x1: 30, x2: 34, z1: 22, z2: 28 },
      { name: 'North signal gallery', x1: 5, x2: 30, z1: 6, z2: 10 },
      { name: 'South ring gallery', x1: 5, x2: 30, z1: 22, z2: 26 },
      { name: 'West ring gallery', x1: 5, x2: 9, z1: 10, z2: 22 },
      { name: 'East ring gallery', x1: 26, x2: 30, z1: 10, z2: 22 },
    ],
  };
}

function createCrosslinkLevel() {
  const width = 23, height = 21;
  const cells = Array.from({ length: height }, () => Array(width).fill('#'));
  const room = (x1, z1, x2, z2) => {
    for (let z = z1; z <= z2; z++) for (let x = x1; x <= x2; x++) cells[z][x] = '.';
  };
  room(8, 17, 14, 19);                      // Safe landing for one or two operatives.
  room(10, 15, 11, 16);
  room(7, 11, 15, 14);                      // Power hub joins both short relay branches.
  room(6, 11, 6, 12);
  room(2, 8, 5, 13);                        // Western transmitter.
  room(16, 11, 16, 12);
  room(17, 8, 20, 13);                      // Eastern receiver.
  room(11, 10, 11, 10);                     // Both relays are required to enter the vault.
  room(9, 6, 13, 9);
  room(11, 5, 11, 5);                       // The vault key opens the final gate.
  room(8, 2, 14, 4);
  room(19, 14, 19, 15);                     // Optional cache off the eastern branch.
  room(17, 16, 20, 18);
  for (const [x, z] of [[9, 12], [13, 12], [3, 10], [18, 10], [12, 8]]) cells[z][x] = '#';
  const enemy = (id, type, x, z) => ({ id, type, x: x + .5, z: z + .5, health: type === 'brute' ? 145 : type === 'spitter' ? 70 : 52, maxHealth: type === 'brute' ? 145 : type === 'spitter' ? 70 : 52, alive: true });
  const pickup = (id, type, x, z, amount = 1) => ({ id, type, x: x + .5, z: z + .5, amount });
  return {
    id: 'crosslink-11-v1', missionId: 'crosslink-11', name: 'Crosslink', signCode: 'XL-11', width, height,
    grid: cells.map(row => row.join('')),
    spawn: { x: 10.5, z: 18.5, angle: 0 },
    coopSpawns: [{ x: 10.5, z: 18.5, angle: 0 }, { x: 12.5, z: 18.5, angle: 0 }],
    doors: [
      { id: 'arrival', x: 10.5, z: 16.5, axis: 'x', requires: null, open: false },
      { id: 'arrival-side', x: 11.5, z: 16.5, axis: 'x', requires: null, open: false, paired: 'arrival' },
      { id: 'relay-vault', x: 11.5, z: 10.5, axis: 'x', requires: 'relays', open: false },
      { id: 'security', x: 11.5, z: 5.5, axis: 'x', requires: 'key', open: false },
      { id: 'maintenance', x: 19.5, z: 14.5, axis: 'x', requires: null, open: false, secret: true },
    ],
    interactables: [
      { id: 'aux-power', type: 'power', x: 8.5, z: 13.5, label: 'Restore hub power' },
      { id: 'relay-west', type: 'relay', x: 2.5, z: 8.5, label: 'Activate western relay', requires: 'power' },
      { id: 'relay-east', type: 'relay', x: 20.5, z: 8.5, label: 'Activate eastern relay', requires: 'power' },
      { id: 'cache-panel', type: 'secret', x: 19.5, z: 13.5, label: 'Inspect supply panel' },
      { id: 'extraction', type: 'exit', x: 13.5, z: 3.5, label: 'Signal team extraction' },
    ],
    pickups: [
      pickup('arrival-ammo', 'ammo', 10, 17, 28),
      pickup('arrival-armor', 'armor', 13, 18, 25),
      pickup('pump-shotgun', 'shotgun', 10, 14, 12),
      pickup('hub-ammo', 'ammo', 14, 14, 28),
      pickup('hub-health', 'health', 7, 11, 40),
      pickup('west-shells', 'shells', 4, 12, 12),
      pickup('west-health', 'health', 2, 12, 40),
      pickup('east-shells', 'shells', 17, 12, 12),
      pickup('east-health', 'health', 20, 11, 40),
      { ...pickup('access-key', 'key', 10, 7), requires: 'relays' },
      pickup('vault-health', 'health', 9, 9, 40),
      pickup('vault-ammo', 'ammo', 13, 6, 28),
      pickup('cache-armor', 'armor', 18, 17, 75),
      pickup('cache-shells', 'shells', 19, 17, 18),
      pickup('cache-health', 'health', 17, 18, 60),
    ],
    enemies: [
      enemy('h1', 'runner', 8, 11), enemy('h2', 'runner', 14, 11),
      enemy('w1', 'runner', 4, 11), enemy('w2', 'spitter', 4, 8),
      enemy('e1', 'runner', 19, 12), enemy('e2', 'spitter', 19, 8),
      enemy('v1', 'brute', 12, 6), enemy('v2', 'runner', 9, 8),
    ],
    zones: [
      { name: 'Crosslink landing', x1: 8, x2: 15, z1: 15, z2: 20 },
      { name: 'Power hub', x1: 6, x2: 17, z1: 11, z2: 15 },
      { name: 'Western transmitter', x1: 2, x2: 6, z1: 8, z2: 14 },
      { name: 'Eastern receiver', x1: 17, x2: 21, z1: 8, z2: 14 },
      { name: 'Crosslink vault', x1: 9, x2: 14, z1: 6, z2: 11 },
      { name: 'Extraction uplink', x1: 8, x2: 15, z1: 2, z2: 6 },
      { name: 'Supply cache', x1: 17, x2: 21, z1: 14, z2: 19 },
    ],
  };
}

export const LEVELS = { 'blacksite-07': LEVEL, 'relay-09': createRelayLevel(), 'crosslink-11': createCrosslinkLevel(), 'underworks-13': UNDERWORKS, 'switchyard-15': SWITCHYARD, 'glasshouse-17': GLASSHOUSE };
export const MISSIONS = [
  { id: 'blacksite-07', levelId: LEVEL.id, name: 'Blacksite 07', number: '001', subtitle: 'The first breach', briefing: 'Emergency power is down. Enter the research facility, recover its security key, and reach extraction.', steps: ['Restore auxiliary power', 'Recover the security key', 'Reach extraction'] },
  { id: 'relay-09', levelId: LEVELS['relay-09'].id, name: 'Dead Relay', number: '002', subtitle: 'Bring the signal back', briefing: 'A silent communications station surrounds a sealed vault. Restore ring power, reconnect both relays, and recover the key to the extraction uplink.', steps: ['Restore ring power', 'Activate both relay consoles', 'Recover the vault key', 'Transmit the extraction signal'] },
  { id: 'crosslink-11', levelId: LEVELS['crosslink-11'].id, name: 'Crosslink', number: '003', subtitle: 'Two relays. One way out.', briefing: 'A compact relay facility has lost its uplink. Restore hub power, activate the western and eastern relays, and recover the vault key for extraction. Play solo or cover a teammate in a private co-op room.', steps: ['Restore hub power', 'Activate both relay consoles', 'Recover the vault key', 'Signal extraction'] },
  { id: 'underworks-13', levelId: UNDERWORKS.id, name: 'The Underworks', number: '004', subtitle: 'An entire world beneath the breach', briefing: 'Explore nine connected sectors below the arrival lift. Recover the cutter, insulator and phase module to open new routes through familiar territory. Restore two distant relays, defeat the reactor guardian and bring its key back to the lift. Refuges and activated transit stations support the journey, solo or together.', steps: ['Restore central power', 'Recover three permanent upgrades', 'Reconnect both crown relays', 'Defeat the reactor guardian', 'Return to the arrival lift'] },
  { id: 'switchyard-15', levelId: SWITCHYARD.id, name: 'Switchyard', number: '005', subtitle: 'Choose your route. Control the fight.', briefing: 'A freight battle divides the switchyard. Restore power, choose the yard or service route, and recover the arc caster from the workshop. Read the cable and phase galleries, reconnect their relays, and defeat the switching-engine guardian to reclaim the freight lift.', steps: ['Restore switchyard power', 'Reach the arc workshop', 'Reconnect both gallery relays', 'Defeat the switching-engine guardian', 'Return to the freight lift'] },
  { id: 'glasshouse-17', levelId: GLASSHOUSE.id, name: 'The Glasshouse', number: '006', subtitle: 'Break the shield. Cut the healing line.', briefing: 'An overgrown conservatory hides armored defenders and their healers. Practice bank shots with the Rebound carbine, restore atrium power, and recover the Thumper. Follow either cultivation wing to the relays, defeat the propagation guardian, and open the direct route back to the laboratory lift. Play solo or share the expedition in co-op.', steps: ['Explore the ballistics practice bay', 'Restore conservatory power', 'Reconnect both cultivation relays', 'Defeat the propagation guardian', 'Open the atrium return and extract'] },
];
export function getLevel(missionId = 'blacksite-07') { return Object.hasOwn(LEVELS, missionId) ? LEVELS[missionId] : LEVEL; }

export const WEAPONS = Object.freeze({
  pistol: Object.freeze({ id: 'pistol', name: 'Pistol', ownershipKey: null, ammoKey: 'pistol', range: 23, aimAssistRange: 16, cooldown: .27, damage: 24, pellets: 1, autoFire: true }),
  shotgun: Object.freeze({ id: 'shotgun', name: 'Scattergun', ownershipKey: 'hasShotgun', ammoKey: 'shells', range: 13, aimAssistRange: 16, cooldown: .72, damage: 14, pellets: 7, autoFire: true }),
  arc: Object.freeze({ id: 'arc', name: 'Arc caster', ownershipKey: 'hasArc', ammoKey: 'cells', range: 7.5, aimAssistRange: 7.5, cooldown: .82, damage: 28, pellets: 1, stun: .65, autoFire: true }),
  ricochet: Object.freeze({ id: 'ricochet', name: 'Rebound carbine', ownershipKey: 'hasRicochet', ammoKey: 'slugs', range: 26, aimAssistRange: 18, cooldown: .52, damage: 38, pellets: 1, maxBounces: 1, autoFire: false }),
  grenade: Object.freeze({ id: 'grenade', name: 'Thumper', ownershipKey: 'hasGrenade', ammoKey: 'grenades', range: 9, aimAssistRange: 0, cooldown: 1.15, damage: 90, pellets: 1, projectileSpeed: 6, fuse: 1.5, blastRadius: 2.8, autoFire: false }),
});
export function ownedWeapons(player) {
  return Object.values(WEAPONS).filter(weapon => !weapon.ownershipKey || player?.[weapon.ownershipKey] === true).map(weapon => weapon.id);
}

const DIFFICULTY = {
  relaxed: { health: .8, damage: .55, speed: .85 },
  standard: { health: 1, damage: 1, speed: 1 },
  hard: { health: 1.2, damage: 1.35, speed: 1.1 },
};

export class Game {
  constructor(options = {}) {
    this.options = { mission: 'blacksite-07', difficulty: 'standard', guidance: 'simple', aimAssist: true, seed: 1, ...options };
    this._events = [];
    this._checkpoint = null;
    this._reset();
  }

  _reset() {
    this.level = getLevel(this.options.mission);
    this.options.mission = this.level.missionId;
    if (!DIFFICULTY[this.options.difficulty]) this.options.difficulty = 'standard';
    this._difficulty = DIFFICULTY[this.options.difficulty];
    this._runDifficulty = this.options.difficulty;
    this._runSeed = (Number(this.options.seed) >>> 0) || 1;
    this._random = this._runSeed;
    this._serial = 0;
    this._shotCooldown = 0;
    this._reserveTimer = 0;
    this._messageCooldown = 0;
    this._pathTimer = 0;
    this._distances = null;
    this._events = [];
    this._checkpoint = null;
    this.state = {
      status: 'ready',
      player: { ...copy(this.level.spawn), health: 100, armor: 20, ammo: { pistol: 40, shells: 0, cells: 0, slugs: 0, grenades: 0 }, weapon: 'pistol', hasShotgun: false, hasArc: false, hasRicochet: false, hasGrenade: false, key: false },
      enemies: this.level.enemies.map(e => ({ ...e, ...this._encounterDefaults(e), health: Math.round(e.health * this._difficulty.health), maxHealth: Math.round(e.maxHealth * this._difficulty.health), active: false, angle: Math.PI, attackCooldown: 1, hitTimer: 0, pathTimer: 0 })),
      pickups: this.level.pickups.map(p => ({ ...p, collected: false })),
      doors: copy(this.level.doors), interactables: this.level.interactables.map(i => ({ ...i, used: false })),
      projectiles: [], effects: [], power: false, secretFound: false,
      checkpoint: false, time: 0, kills: 0, shots: 0, hits: 0,
      tutorial: { moved: false, fired: false, interacted: false, weaponSwitched: false },
    };
    for (const control of this.state.interactables.filter(i => i.type === 'shutter-switch')) control.used = control.doorIds.every(id => this.state.doors.find(d => d.id === id)?.open);
    if (this.level.upgradeNames) this.state.upgrades = { cutter: false, insulator: false, phase: false };
    if (this.level.exploration) {
      this.state.upgrades = { cutter: false, insulator: false, phase: false };
      this.state.healthBonus = 0;
      this.state.player.maxHealth = 100;
    }
  }

  start() {
    if (this.state.status === 'ready') {
      this.state.status = 'playing';
      this._events.push({ type: 'message', text: this.level.missionId === 'glasshouse-17' ? 'The Glasshouse. Explore the practice bay, then restore power in the planted atrium.' : this.level.missionId === 'switchyard-15' ? 'Switchyard. Restore power in the observation concourse, then choose a route to the workshop.' : this.level.exploration ? 'The Underworks. Activate the lift transit, then find power in the central exchange.' : this.level.missionId === 'crosslink-11' ? 'Crosslink. Restore hub power and reconnect both relays.' : this.level.missionId === 'relay-09' ? 'Dead Relay. Restore power to the communications ring.' : 'Blacksite 07. Find the auxiliary generator.' });
    }
  }
  pause() { if (this.state.status === 'playing') this.state.status = 'paused'; }
  resume() { if (this.state.status === 'paused' || this.state.status === 'ready') this.state.status = 'playing'; }
  restart() { this._reset(); this.start(); }

  _rng() {
    this._random = (Math.imul(this._random, 1664525) + 1013904223) >>> 0;
    return this._random / 4294967296;
  }

  _encounterDefaults(enemy) {
    return {
      faction: enemy.faction || (enemy.type === 'sentry' ? 'security' : 'infestation'),
      provoked: false, killedByPlayer: false, telegraph: null, stunTimer: 0,
      ...(enemy.encounterId ? { encounterAwake: false } : {}),
      ...(enemy.type === 'stalker' ? { blinkCooldown: 2.4 } : {}),
      ...(enemy.type === 'bulwark' ? { shieldPhase: 'guard', shieldTimer: 3.4 } : {}),
      ...(enemy.type === 'mender' ? { healCooldown: 1 } : {}),
      ...(enemy.guardian ? { bossPhase: 'stalk', phaseTimer: 0, bossCycle: 0, chargeAngle: 0, chargeHit: false, chargeTargetId: null, chargeTargetKind: null } : {}),
    };
  }

  isHostileToPlayer(enemy) {
    return Boolean(enemy?.alive && (enemy.faction !== 'security' && enemy.type !== 'sentry' || enemy.provoked === true));
  }

  _wall(x, z) {
    const cx = Math.floor(x), cz = Math.floor(z);
    if (cx < 0 || cz < 0 || cx >= this.level.width || cz >= this.level.height || this.level.grid[cz][cx] === '#') return true;
    // The client replaces state with fresh network snapshots. Detect the array
    // identity lazily; each cached door reference still sees in-place opening.
    if (this._doorSource !== this.state.doors) {
      this._doorSource = this.state.doors;
      this._doorCells = new Map(this.state.doors.map(d => [`${Math.floor(d.x)},${Math.floor(d.z)}`, d]));
    }
    const door = this._doorCells.get(`${cx},${cz}`);
    return Boolean(door && !door.open);
  }

  _clearCircle(x, z, radius) {
    for (const [dx, dz] of [[0, 0], [-radius, -radius], [-radius, radius], [radius, -radius], [radius, radius]]) if (this._wall(x + dx, z + dz)) return false;
    return true;
  }

  _move(entity, dx, dz, radius = .22) {
    // Small substeps prevent tunnelling through walls even after a dropped frame.
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / .12));
    for (let n = 0; n < steps; n++) {
      if (this._clearCircle(entity.x + dx / steps, entity.z, radius)) entity.x += dx / steps;
      if (this._clearCircle(entity.x, entity.z + dz / steps, radius)) entity.z += dz / steps;
    }
  }

  hasLineOfSight(x1, z1, x2, z2) {
    if (![x1, z1, x2, z2].every(Number.isFinite) || this._wall(x1, z1) || this._wall(x2, z2)) return false;
    let x = Math.floor(x1), z = Math.floor(z1);
    const targetX = Math.floor(x2), targetZ = Math.floor(z2);
    const dx = x2 - x1, dz = z2 - z1;
    const stepX = Math.sign(dx), stepZ = Math.sign(dz);
    const deltaX = dx ? Math.abs(1 / dx) : Infinity, deltaZ = dz ? Math.abs(1 / dz) : Infinity;
    let edgeX = dx ? ((stepX > 0 ? x + 1 : x) - x1) / dx : Infinity;
    let edgeZ = dz ? ((stepZ > 0 ? z + 1 : z) - z1) / dz : Infinity;
    // Traverse every crossed cell exactly. Sampling can miss narrow wall corners.
    while (x !== targetX || z !== targetZ) {
      if (Math.abs(edgeX - edgeZ) < 1e-10) {
        if (this._wall(x + stepX + .5, z + .5) || this._wall(x + .5, z + stepZ + .5)) return false;
        x += stepX; z += stepZ; edgeX += deltaX; edgeZ += deltaZ;
      } else if (edgeX < edgeZ) { x += stepX; edgeX += deltaX; }
      else { z += stepZ; edgeZ += deltaZ; }
      if (this._wall(x + .5, z + .5)) return false;
    }
    return true;
  }

  update(dt, input = {}) {
    if (this.state.status !== 'playing') return;
    if (!Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, .1);
    const state = this.state, player = state.player;
    state.time += dt;
    this._shotCooldown = Math.max(0, this._shotCooldown - dt);
    this._messageCooldown = Math.max(0, this._messageCooldown - dt);
    this._pathTimer -= dt;
    player.angle = ((player.angle + clamp(Number(input.turn) || 0, -Math.PI, Math.PI)) % TAU + TAU) % TAU;
    const forward = clamp(Number(input.forward) || 0, -1, 1), strafe = clamp(Number(input.strafe) || 0, -1, 1);
    const divisor = Math.max(1, Math.hypot(forward, strafe));
    const speed = 3.35 * dt / divisor;
    const beforeX = player.x, beforeZ = player.z;
    this._move(player, (Math.sin(player.angle) * forward + Math.cos(player.angle) * strafe) * speed,
      (-Math.cos(player.angle) * forward + Math.sin(player.angle) * strafe) * speed);
    if (Math.hypot(player.x - this.level.spawn.x, player.z - this.level.spawn.z) > .75) state.tutorial.moved = true;
    player.moving = Math.hypot(player.x - beforeX, player.z - beforeZ) > .0001;
    this._collectPickups();
    if (input.fire) this._fire();
    if (player.ammo.pistol === 0) {
      this._reserveTimer += dt;
      if (this._reserveTimer >= 1.7) {
        player.ammo.pistol = 1; this._reserveTimer = 0;
        this._events.push({ type: 'message', text: 'Emergency cell: one pistol round recovered.' });
      }
    } else this._reserveTimer = 0;
    if (this._pathTimer <= 0) { this._buildDistanceField(); this._pathTimer = .5; }
    this._updateEnemies(dt);
    this._updateProjectiles(dt);
    for (const effect of state.effects) effect.life -= dt;
    state.effects = state.effects.filter(e => e.life > 0);
  }

  _collectPickups() {
    const p = this.state.player;
    for (const item of this.state.pickups) {
      if (item.collected || distance(p, item) > .62 || !this.hasLineOfSight(p.x, p.z, item.x, item.z)) continue;
      if (item.requires && !this._requirementMet(item.requires)) continue;
      if (item.type === 'health' && p.health >= this._maxHealth(p) || item.type === 'armor' && p.armor >= 100) continue;
      item.collected = true;
      let text = '';
      if (item.type === 'ammo') { p.ammo.pistol += item.amount; text = `+${item.amount} pistol rounds`; }
      if (item.type === 'shells') { p.ammo.shells += item.amount; text = `+${item.amount} shotgun shells`; }
      if (item.type === 'cells') { p.ammo.cells = (p.ammo.cells || 0) + item.amount; text = `+${item.amount} arc cells`; }
      if (item.type === 'slugs') { p.ammo.slugs = (p.ammo.slugs || 0) + item.amount; text = `+${item.amount} rebound slugs`; }
      if (item.type === 'grenades') { p.ammo.grenades = (p.ammo.grenades || 0) + item.amount; text = `+${item.amount} grenades`; }
      if (item.type === 'health') { p.health = Math.min(this._maxHealth(p), p.health + item.amount); text = `Health restored`; }
      if (item.type === 'armor') { p.armor = Math.min(100, p.armor + item.amount); text = `Armor reinforced`; }
      if (item.type === 'shotgun') { p.hasShotgun = true; p.weapon = 'shotgun'; p.ammo.shells += item.amount; text = 'Scattergun acquired. Devastating at close range.'; }
      if (item.type === 'arc') { p.hasArc = true; p.weapon = 'arc'; p.ammo.cells = (p.ammo.cells || 0) + item.amount; text = 'Arc caster acquired. Short-range shots interrupt ordinary enemies.'; }
      if (item.type === 'ricochet') { p.hasRicochet = true; p.weapon = 'ricochet'; p.ammo.slugs = (p.ammo.slugs || 0) + item.amount; text = 'Rebound carbine acquired. One reflection from a wall; shutters absorb the shot.'; }
      if (item.type === 'grenade') { p.hasGrenade = true; p.weapon = 'grenade'; p.ammo.grenades = (p.ammo.grenades || 0) + item.amount; text = 'Thumper acquired. Bouncing grenades explode after a short fuse. Keep clear of your blast.'; }
      if (item.type === 'key') { p.key = true; text = 'Security key recovered. Reach the extraction gate.'; }
      if (item.type === 'healthExpansion') {
        this.state.healthBonus = 25;
        for (const recipient of Object.values(this.state.players || { solo: p })) {
          recipient.maxHealth = 125;
          if (recipient.alive !== false) recipient.health = Math.min(125, recipient.health + 25);
        }
        text = 'Medical expansion: maximum health increased to 125.';
        this._events.push({ type: 'reward', id: item.id, text });
      }
      this._events.push({ type: 'pickup', item: item.type, text });
      if (item.type === 'key' || item.type === 'healthExpansion') this._syncPermanentProgress();
    }
  }

  _fire() {
    if (this._shotCooldown > 0 || this.state.status !== 'playing') return;
    const p = this.state.player, weapon = p.weapon;
    const spec = WEAPONS[weapon] || WEAPONS.pistol, ammo = spec.ammoKey;
    if (!(p.ammo[ammo] > 0)) {
      this._shotCooldown = .25;
      if (this._messageCooldown <= 0) {
        this._events.push({ type: 'message', text: weapon === 'grenade' ? 'No grenades. Switch weapons or find an ammunition rack.' : weapon === 'ricochet' ? 'No rebound slugs. Switch weapons or find ammunition.' : weapon === 'arc' ? 'No arc cells. Switch weapons or find a cell pack.' : weapon === 'shotgun' ? 'No shells. Switch to your pistol.' : 'Cell empty. One emergency round recharges shortly.' });
        this._messageCooldown = 2;
      }
      return;
    }
    if (weapon === 'grenade' && this.state.projectiles.filter(shot => shot.type === 'grenade').length >= 8) return;
    p.ammo[ammo]--; this.state.shots++; this.state.tutorial.fired = true;
    this._shotCooldown = spec.cooldown;
    let aim = p.angle;
    if (this.options.aimAssist) {
      const target = this.state.enemies.filter(e => this.isHostileToPlayer(e) && distance(p, e) < spec.aimAssistRange && this.hasLineOfSight(p.x, p.z, e.x, e.z))
        .map(e => ({ enemy: e, angle: Math.atan2(e.x - p.x, -(e.z - p.z)) }))
        .filter(e => Math.abs(angleDelta(e.angle, aim)) < .12)
        .sort((a, b) => Math.abs(angleDelta(a.angle, aim)) - Math.abs(angleDelta(b.angle, aim)))[0];
      if (target) aim = target.angle;
    }
    if (weapon === 'grenade') {
      this.state.projectiles.push({ id: `grenade-${++this._serial}`, type: 'grenade', x: p.x, z: p.z,
        dx: Math.sin(aim) * spec.projectileSpeed, dz: -Math.cos(aim) * spec.projectileSpeed,
        life: spec.fuse, fuse: spec.fuse, ownerId: p.id || 'player', ownerKind: 'player', bounces: 0 });
      this._events.push({ type: 'shot', weapon, hit: false });
      return;
    }
    if (weapon === 'ricochet') {
      const trace = this._ricochetShot(p, aim, spec.range);
      if (trace.victim) { this.state.hits++; this._damageEnemy(trace.victim, spec.damage, 'player', trace.origin); }
      this.state.effects.push({ id: `ricochet-${++this._serial}`, type: 'ricochet', x: p.x, z: p.z, segments: trace.segments, life: .16 });
      this._events.push({ type: 'shot', weapon, hit: Boolean(trace.victim) });
      if (trace.segments.length > 1) this._events.push({ type: 'ricochet', x: trace.segments[0].targetX, z: trace.segments[0].targetZ });
      for (const enemy of this.state.enemies) if (this.isHostileToPlayer(enemy) && distance(p, enemy) < 7) enemy.active = true;
      return;
    }
    const hits = new Map();
    const pellets = spec.pellets;
    for (let n = 0; n < pellets; n++) {
      const shotAngle = aim + (weapon === 'shotgun' ? (n - 3) * .026 + (this._rng() - .5) * .012 : 0);
      let closest = null, closestDistance = spec.range;
      for (const e of this.state.enemies) {
        if (!e.alive) continue;
        const dx = e.x - p.x, dz = e.z - p.z;
        const along = dx * Math.sin(shotAngle) - dz * Math.cos(shotAngle);
        const across = Math.abs(dx * Math.cos(shotAngle) + dz * Math.sin(shotAngle));
        const radius = e.type === 'brute' ? .4 : .28;
        if (along > 0 && along < closestDistance && across < radius && (weapon !== 'arc' || distance(p, e) <= spec.range) && this.hasLineOfSight(p.x, p.z, e.x, e.z)) {
          closest = e; closestDistance = along;
        }
      }
      if (closest) hits.set(closest, (hits.get(closest) || 0) + spec.damage);
    }
    this._events.push({ type: 'shot', weapon, hit: hits.size > 0 });
    if (hits.size) this.state.hits++;
    for (const [enemy, damage] of hits) {
      this._damageEnemy(enemy, damage, 'player');
      if (weapon === 'arc' && enemy.alive && !enemy.guardian) {
        enemy.stunTimer = spec.stun; enemy.telegraph = null;
        if (enemy.type === 'bulwark') this._exposeBulwark(enemy);
        enemy.attackCooldown = Math.max(enemy.attackCooldown, spec.stun);
        this._events.push({ type: 'stun', id: enemy.id, x: enemy.x, z: enemy.z, duration: spec.stun });
      }
    }
    if (weapon === 'arc') {
      const victim = hits.keys().next().value;
      let reach = victim ? distance(p, victim) : spec.range;
      if (!victim) for (let d = .12; d <= spec.range; d += .12) {
        if (!this.hasLineOfSight(p.x, p.z, p.x + Math.sin(aim) * d, p.z - Math.cos(aim) * d)) { reach = Math.max(0, d - .12); break; }
      }
      this.state.effects.push({ id: `arc-${++this._serial}`, type: 'arc', x: p.x, z: p.z,
        targetX: victim?.x ?? p.x + Math.sin(aim) * reach, targetZ: victim?.z ?? p.z - Math.cos(aim) * reach, life: .18 });
    }
    for (const enemy of this.state.enemies) if (this.isHostileToPlayer(enemy) && distance(p, enemy) < 7) enemy.active = true;
  }

  _traceWall(x, z, dx, dz, range) {
    let cellX = Math.floor(x), cellZ = Math.floor(z);
    const stepX = Math.sign(dx), stepZ = Math.sign(dz);
    const deltaX = dx ? Math.abs(1 / dx) : Infinity, deltaZ = dz ? Math.abs(1 / dz) : Infinity;
    let edgeX = dx ? ((stepX > 0 ? cellX + 1 : cellX) - x) / dx : Infinity;
    let edgeZ = dz ? ((stepZ > 0 ? cellZ + 1 : cellZ) - z) / dz : Infinity;
    const hit = (length, normalX, normalZ, cells) => ({ x: x + dx * length, z: z + dz * length, distance: length,
      normalX, normalZ, hitWall: true, door: cells.some(([cx, cz]) => this._doorCells?.get(`${cx},${cz}`)?.open === false) });
    // Exact grid traversal gives bank shots a stable reflection plane and
    // treats a touched solid corner as a collision, just like line of sight.
    while (Math.min(edgeX, edgeZ) <= range) {
      if (Math.abs(edgeX - edgeZ) < 1e-9) {
        const sideX = this._wall(cellX + stepX + .5, cellZ + .5);
        const sideZ = this._wall(cellX + .5, cellZ + stepZ + .5);
        const diagonal = this._wall(cellX + stepX + .5, cellZ + stepZ + .5);
        if (sideX || sideZ || diagonal) {
          const blocked = [];
          if (sideX) blocked.push([cellX + stepX, cellZ]);
          if (sideZ) blocked.push([cellX, cellZ + stepZ]);
          if (diagonal) blocked.push([cellX + stepX, cellZ + stepZ]);
          return hit(edgeX, sideX || !sideZ ? -stepX : 0, sideZ || !sideX ? -stepZ : 0, blocked);
        }
        cellX += stepX; cellZ += stepZ; edgeX += deltaX; edgeZ += deltaZ;
      } else if (edgeX < edgeZ) {
        cellX += stepX;
        if (this._wall(cellX + .5, cellZ + .5)) return hit(edgeX, -stepX, 0, [[cellX, cellZ]]);
        edgeX += deltaX;
      } else {
        cellZ += stepZ;
        if (this._wall(cellX + .5, cellZ + .5)) return hit(edgeZ, 0, -stepZ, [[cellX, cellZ]]);
        edgeZ += deltaZ;
      }
    }
    return { x: x + dx * range, z: z + dz * range, distance: range, normalX: 0, normalZ: 0, hitWall: false, door: false };
  }

  _ricochetShot(player, aim, range) {
    let origin = { x: player.x, z: player.z }, dx = Math.sin(aim), dz = -Math.cos(aim), remaining = range;
    const segments = [];
    for (let bounce = 0; bounce <= WEAPONS.ricochet.maxBounces; bounce++) {
      const wall = this._traceWall(origin.x, origin.z, dx, dz, remaining);
      let victim = null, closest = wall.distance;
      for (const enemy of this.state.enemies) {
        if (!enemy.alive) continue;
        const ex = enemy.x - origin.x, ez = enemy.z - origin.z;
        const along = ex * dx + ez * dz, across = Math.abs(ex * dz - ez * dx);
        const radius = enemy.type === 'brute' || enemy.type === 'bulwark' ? .4 : .28;
        if (along <= 0 || across >= radius) continue;
        const entry = Math.max(0, along - Math.sqrt(radius * radius - across * across));
        if (entry < closest && this.hasLineOfSight(origin.x, origin.z, enemy.x, enemy.z)) { victim = enemy; closest = entry; }
      }
      segments.push({ x: origin.x, z: origin.z, targetX: origin.x + dx * closest, targetZ: origin.z + dz * closest });
      if (victim) return { victim, segments, origin };
      if (!wall.hitWall || wall.door || bounce === WEAPONS.ricochet.maxBounces) break;
      remaining -= wall.distance + .002;
      if (remaining <= 0) break;
      if (wall.normalX) dx = -dx;
      if (wall.normalZ) dz = -dz;
      origin = { x: wall.x + dx * .002, z: wall.z + dz * .002 };
    }
    return { victim: null, segments, origin };
  }

  _damageEnemy(enemy, amount, source, impact = null) {
    if (!enemy?.alive || !(amount > 0)) return;
    const playerHit = source === 'player' || source?.kind === 'player';
    const ownerId = playerHit ? source?.playerId || this.state.player.id || 'player' : source?.id;
    const owner = playerHit && ownerId && this.state.players?.[ownerId] ? { playerId: ownerId } : {};
    const origin = impact || (source === 'player' ? this.state.player : source);
    let multiplier = enemy.guardian ? enemy.bossPhase === 'recover' ? 1.6 : .65 : 1;
    if (enemy.type === 'bulwark' && enemy.shieldPhase !== 'exposed' && origin
      && Math.abs(angleDelta(Math.atan2(origin.x - enemy.x, -(origin.z - enemy.z)), enemy.angle)) <= .95) {
      multiplier *= .22;
      this.state.effects.push({ id: `shield-${++this._serial}`, type: 'shield-hit', x: enemy.x, z: enemy.z, life: .18 });
      this._events.push({ type: 'shield-hit', id: enemy.id, x: enemy.x, z: enemy.z, ...owner });
    }
    // The guardian's plates open while its core cools. The visible recovery
    // window is a better shot than firing continuously into the armor.
    const damage = Math.max(1, Math.round(amount * multiplier));
    enemy.health = Math.max(0, enemy.health - damage); enemy.active = true; enemy.hitTimer = .13;
    if (playerHit && enemy.faction === 'security' && !enemy.provoked) {
      enemy.provoked = true; enemy.telegraph = null; enemy.attackCooldown = Math.max(enemy.attackCooldown, .8);
      this._events.push({ type: 'provoked', id: enemy.id, x: enemy.x, z: enemy.z });
    }
    // A clean hit interrupts a phase shift before the creature disappears.
    if (enemy.type === 'stalker' && enemy.telegraph?.kind === 'blink') {
      enemy.telegraph = null; enemy.blinkCooldown = 3;
    }
    if (enemy.type === 'mender' && enemy.telegraph?.kind === 'heal') {
      enemy.telegraph = null; enemy.healCooldown = 2.5;
      this.state.effects.push({ id: `heal-interrupt-${++this._serial}`, type: 'heal-interrupt', x: enemy.x, z: enemy.z, life: .22 });
      this._events.push({ type: 'heal-interrupt', id: enemy.id, x: enemy.x, z: enemy.z, ...owner });
    }
    this._events.push({ type: playerHit ? 'hit' : 'enemy-hit', id: enemy.id, x: enemy.x, z: enemy.z, damage, sourceId: ownerId, ...owner });
    this.state.effects.push({ id: `hit-${++this._serial}`, type: 'hit', x: enemy.x, z: enemy.z, life: .22 });
    if (enemy.health === 0) {
      enemy.alive = false; enemy.killedByPlayer = playerHit; enemy.telegraph = null;
      if (enemy.type === 'bulwark') { enemy.shieldPhase = 'guard'; enemy.shieldTimer = 3.4; }
      if (enemy.guardian) { enemy.bossPhase = 'stalk'; enemy.phaseTimer = 0; enemy.chargeTargetId = null; enemy.chargeTargetKind = null; }
      if (playerHit) this.state.kills++;
      this._events.push({ type: playerHit ? 'kill' : 'enemy-kill', id: enemy.id, enemyType: enemy.type, x: enemy.x, z: enemy.z, sourceId: ownerId, ...owner });
      if (enemy.guardian) this._syncPermanentProgress();
    }
  }

  selectWeapon(id) {
    const p = this.state.player;
    if (!ownedWeapons(p).includes(id)) return false;
    if (p.weapon === id) return true;
    p.weapon = id; this.state.tutorial.weaponSwitched = true;
    this._shotCooldown = Math.max(this._shotCooldown, .15);
    return true;
  }

  switchWeapon(id) {
    if (id !== undefined) return this.selectWeapon(id);
    const p = this.state.player;
    const owned = ownedWeapons(p);
    if (owned.length === 1) {
      this._events.push({ type: 'message', text: 'Find the scattergun in the generator room.' }); return;
    }
    return this.selectWeapon(owned[(owned.indexOf(p.weapon) + 1) % owned.length]);
  }

  _buildDistanceField() {
    const w = this.level.width, h = this.level.height;
    const field = new Int16Array(w * h).fill(-1);
    const sx = Math.floor(this.state.player.x), sz = Math.floor(this.state.player.z);
    const queue = [[sx, sz]]; field[sz * w + sx] = 0;
    for (let index = 0; index < queue.length; index++) {
      const [x, z] = queue[index];
      for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) {
        if (nx < 0 || nz < 0 || nx >= w || nz >= h || field[nz * w + nx] >= 0 || this._wall(nx + .5, nz + .5)) continue;
        field[nz * w + nx] = field[z * w + x] + 1; queue.push([nx, nz]);
      }
    }
    this._distances = field;
  }

  _updateEnemies(dt) {
    for (const enemy of this.state.enemies) this._updateEnemy(enemy, dt);
  }

  _combatTarget(enemy) {
    const player = this.state.player;
    const playerVisible = this.hasLineOfSight(enemy.x, enemy.z, player.x, player.z);
    const faction = enemy.faction || 'infestation';
    // Encounters wait for an observer instead of resolving across an unseen map.
    const opponents = distance(enemy, player) <= 18 ? this.state.enemies.filter(other => other !== enemy && other.alive
      && (other.faction || 'infestation') !== faction && distance(enemy, other) < 10
      && this.hasLineOfSight(enemy.x, enemy.z, other.x, other.z)) : [];
    opponents.sort((a, b) => distance(enemy, a) - distance(enemy, b));
    if (!this.isHostileToPlayer(enemy)) return opponents[0] || null;
    if (opponents[0] && (!playerVisible || distance(enemy, opponents[0]) < distance(enemy, player))) return opponents[0];
    return player;
  }

  _hurtTarget(target, amount, source) {
    if (!target) return;
    if (target === this.state.player) this._hurt(amount, source);
    else if (target.id && this.state.players?.[target.id] === target && typeof this._withPlayer === 'function') {
      this._withPlayer(target.id, () => this._hurt(amount, source));
    }
    else this._damageEnemy(target, amount, source);
  }

  _isPlayerTarget(target) {
    return Boolean(target && (target === this.state.player || target.id && this.state.players?.[target.id] === target));
  }

  _targetIdentity(target) {
    return this._isPlayerTarget(target) ? target.id || 'player' : target?.id;
  }

  _targetKind(target) {
    return this._isPlayerTarget(target) ? 'player' : target?.id ? 'enemy' : undefined;
  }

  _resolveTarget(id, kind) {
    if (kind === 'player' || id === 'player') {
      const player = id === 'player' ? this.state.player : Object.hasOwn(this.state.players || {}, id) ? this.state.players[id] : null;
      return player && player.alive !== false && player.health > 0 ? player : null;
    }
    return this.state.enemies.find(enemy => enemy.id === id && enemy.alive) || null;
  }

  _warning(enemy, kind, target, duration, radius) {
    enemy.telegraph = { kind, x: target.x, z: target.z, fromX: enemy.x, fromZ: enemy.z,
      radius, duration, remaining: duration, targetId: this._targetIdentity(target), targetKind: this._targetKind(target) };
    this._events.push({ type: 'enemy-warning', kind, id: enemy.id, x: enemy.x, z: enemy.z });
  }

  _validBlinkDestination(enemy, point) {
    const player = this.state.player;
    return point && distance(point, player) >= 2.2 && distance(point, player) <= 5.2
      && distance(point, enemy) >= 1.3 && this._clearCircle(point.x, point.z, .25)
      && this.hasLineOfSight(enemy.x, enemy.z, point.x, point.z)
      && this.hasLineOfSight(player.x, player.z, point.x, point.z)
      && this.state.enemies.every(other => other === enemy || !other.alive || distance(point, other) > .65)
      && Object.values(this.state.players || { solo: player }).every(other => other.alive === false || distance(point, other) > 1.3);
  }

  _beginBlink(enemy) {
    const player = this.state.player;
    const initial = Math.atan2(enemy.z - player.z, enemy.x - player.x) + (this._rng() < .5 ? -1 : 1) * Math.PI / 2;
    for (let i = 0; i < 8; i++) {
      const angle = initial + i * Math.PI / 4;
      const point = { x: player.x + Math.cos(angle) * 3.1, z: player.z + Math.sin(angle) * 3.1 };
      if (!this._validBlinkDestination(enemy, point)) continue;
      this._warning(enemy, 'blink', point, .8, .65);
      return true;
    }
    enemy.blinkCooldown = 1.5;
    return false;
  }

  _updateStalker(enemy, dt, target, visible) {
    enemy.blinkCooldown = Math.max(0, (enemy.blinkCooldown ?? 2.4) - dt);
    if (enemy.telegraph?.kind === 'blink') {
      enemy.telegraph.remaining = Math.max(0, enemy.telegraph.remaining - dt);
      if (enemy.telegraph.remaining === 0) {
        const point = enemy.telegraph;
        if (this._validBlinkDestination(enemy, point)) {
          this.state.effects.push({ id: `blink-${++this._serial}`, type: 'blink', x: enemy.x, z: enemy.z, life: .45 });
          enemy.x = point.x; enemy.z = point.z;
          this.state.effects.push({ id: `blink-${++this._serial}`, type: 'blink', x: enemy.x, z: enemy.z, life: .45 });
          this._events.push({ type: 'teleport', id: enemy.id, x: enemy.x, z: enemy.z });
        }
        enemy.telegraph = null; enemy.blinkCooldown = 4.8;
        enemy.attackCooldown = Math.max(.7, enemy.attackCooldown);
      }
      return true;
    }
    if (target === this.state.player && visible && distance(enemy, target) > 2 && distance(enemy, target) < 10
      && enemy.blinkCooldown === 0 && enemy.hitTimer === 0) return this._beginBlink(enemy);
    return false;
  }

  _updateSentry(enemy, dt, target, visible) {
    if (enemy.telegraph?.kind === 'shot') {
      enemy.telegraph.remaining = Math.max(0, enemy.telegraph.remaining - dt);
      if (enemy.telegraph.remaining === 0) {
        const warning = enemy.telegraph;
        const victim = this._resolveTarget(warning.targetId, warning.targetKind);
        this.state.effects.push({ id: `beam-${++this._serial}`, type: 'beam', x: enemy.x, z: enemy.z,
          targetX: warning.x, targetZ: warning.z, life: .16, faction: 'security' });
        // The shot follows its shown aim point, so moving sideways beats it.
        if (victim && (!this._isPlayerTarget(victim) || this.isHostileToPlayer(enemy))
          && distance(victim, warning) < .72 && this.hasLineOfSight(enemy.x, enemy.z, victim.x, victim.z)) this._hurtTarget(victim, 20, enemy);
        enemy.telegraph = null; enemy.attackCooldown = 1.15;
        this._events.push({ type: 'enemy-shot', id: enemy.id, faction: 'security', x: enemy.x, z: enemy.z });
      }
      return true;
    }
    if (visible && distance(enemy, target) < 9 && enemy.attackCooldown === 0) {
      this._warning(enemy, 'shot', target, .55, .45);
      return true;
    }
    return false;
  }

  _exposeBulwark(enemy) {
    if (enemy.shieldPhase !== 'exposed') this._events.push({ type: 'shield-open', id: enemy.id, x: enemy.x, z: enemy.z });
    enemy.telegraph = null; enemy.shieldPhase = 'exposed'; enemy.shieldTimer = 1.4;
  }

  _updateBulwark(enemy, dt, target, visible) {
    enemy.shieldTimer = Math.max(0, enemy.shieldTimer - dt);
    if (enemy.shieldPhase === 'windup') {
      const warning = enemy.telegraph;
      if (warning) warning.remaining = enemy.shieldTimer;
      if (!warning || enemy.shieldTimer === 0) {
        const victim = warning && this._resolveTarget(warning.targetId, warning.targetKind);
        if (victim && distance(victim, warning) < warning.radius && distance(enemy, victim) < 2.8
          && this.hasLineOfSight(enemy.x, enemy.z, victim.x, victim.z)) this._hurtTarget(victim, 20, enemy);
        this._exposeBulwark(enemy); enemy.attackCooldown = 1.8;
      }
      return true;
    }
    if (enemy.shieldPhase === 'exposed') {
      if (enemy.shieldTimer === 0) { enemy.shieldPhase = 'guard'; enemy.shieldTimer = 3.4; }
      return true;
    }
    if (visible && distance(enemy, target) < 1.8 && enemy.attackCooldown === 0) {
      enemy.shieldPhase = 'windup'; enemy.shieldTimer = .8;
      this._warning(enemy, 'bash', target, .8, 1.3);
      return true;
    }
    if (enemy.shieldTimer === 0) { this._exposeBulwark(enemy); return true; }
    return false;
  }

  _canMend(mender, ally) {
    return Boolean(ally && ally !== mender && ally.alive && !ally.guardian
      && (ally.faction || 'infestation') === 'infestation' && ally.type !== 'sentry'
      && ally.health < ally.maxHealth && distance(mender, ally) <= 7
      && this.hasLineOfSight(mender.x, mender.z, ally.x, ally.z));
  }

  _updateMender(enemy, dt) {
    enemy.healCooldown = Math.max(0, enemy.healCooldown - dt);
    if (enemy.telegraph?.kind === 'heal') {
      const warning = enemy.telegraph;
      warning.remaining = Math.max(0, warning.remaining - dt);
      const ally = this._resolveTarget(warning.targetId, 'enemy');
      if (!this._canMend(enemy, ally)) { enemy.telegraph = null; enemy.healCooldown = 1; return true; }
      warning.x = ally.x; warning.z = ally.z;
      if (warning.remaining === 0) {
        const amount = Math.min(28, ally.maxHealth - ally.health);
        ally.health += amount;
        this.state.effects.push({ id: `heal-${++this._serial}`, type: 'heal', x: enemy.x, z: enemy.z,
          targetX: ally.x, targetZ: ally.z, life: .5 });
        this._events.push({ type: 'heal', id: enemy.id, targetId: ally.id, x: enemy.x, z: enemy.z,
          targetX: ally.x, targetZ: ally.z, amount });
        enemy.telegraph = null; enemy.healCooldown = 4.8; enemy.attackCooldown = Math.max(enemy.attackCooldown, .7);
      }
      return true;
    }
    if (enemy.healCooldown > 0) return false;
    const ally = this.state.enemies.filter(other => this._canMend(enemy, other) && other.maxHealth - other.health >= 12)
      .sort((a, b) => (b.maxHealth - b.health) - (a.maxHealth - a.health) || distance(enemy, a) - distance(enemy, b))[0];
    if (!ally) return false;
    this._warning(enemy, 'heal', ally, .9, .6);
    return true;
  }

  _guardianRecovery(enemy) {
    enemy.bossPhase = 'recover'; enemy.phaseTimer = 1.65; enemy.telegraph = null; enemy.chargeTargetId = null; enemy.chargeTargetKind = null;
    this._events.push({ type: 'boss-phase', id: enemy.id, phase: 'recover', x: enemy.x, z: enemy.z });
  }

  _updateGuardian(enemy, dt, target, visible) {
    const phase = enemy.bossPhase || 'stalk';
    if (phase === 'recover') {
      enemy.phaseTimer = Math.max(0, enemy.phaseTimer - dt);
      if (enemy.phaseTimer === 0) { enemy.bossPhase = 'stalk'; enemy.attackCooldown = .75; }
      return true;
    }
    if (phase === 'charge-windup' || phase === 'volley-windup') {
      enemy.phaseTimer = Math.max(0, enemy.phaseTimer - dt);
      if (enemy.telegraph) enemy.telegraph.remaining = enemy.phaseTimer;
      if (enemy.phaseTimer === 0) {
        const warning = enemy.telegraph;
        if (!warning) { this._guardianRecovery(enemy); return true; }
        if (phase === 'charge-windup') {
          enemy.chargeAngle = Math.atan2(warning.x - enemy.x, -(warning.z - enemy.z));
          enemy.chargeTargetId = warning.targetId || this._targetIdentity(target);
          enemy.chargeTargetKind = warning.targetKind || this._targetKind(target);
          enemy.bossPhase = 'charge'; enemy.phaseTimer = .65; enemy.chargeHit = false; enemy.telegraph = null;
        } else {
          const aim = Math.atan2(warning.x - enemy.x, -(warning.z - enemy.z));
          for (const offset of [-.18, 0, .18]) this.state.projectiles.push({ id: `p-${++this._serial}`, type: 'plasma',
            x: enemy.x, z: enemy.z, dx: Math.sin(aim + offset) * 4.5, dz: -Math.cos(aim + offset) * 4.5, life: 3.5 });
          this._events.push({ type: 'enemy-shot', id: enemy.id, x: enemy.x, z: enemy.z });
          this._guardianRecovery(enemy);
        }
      }
      return true;
    }
    if (phase === 'charge') {
      // Co-op selects a nearby operative again every tick. A warned attack
      // keeps its original victim even when that temporary player alias changes.
      const victim = enemy.chargeTargetId ? this._resolveTarget(enemy.chargeTargetId, enemy.chargeTargetKind) : target;
      const before = { x: enemy.x, z: enemy.z };
      this._move(enemy, Math.sin(enemy.chargeAngle) * 7.1 * dt, -Math.cos(enemy.chargeAngle) * 7.1 * dt, .3);
      const dx = enemy.x - before.x, dz = enemy.z - before.z, lengthSq = dx * dx + dz * dz;
      const projection = victim && lengthSq ? clamp(((victim.x - before.x) * dx + (victim.z - before.z) * dz) / lengthSq, 0, 1) : 0;
      const closest = { x: before.x + dx * projection, z: before.z + dz * projection };
      if (victim && !enemy.chargeHit && distance(victim, closest) < .78 && this.hasLineOfSight(enemy.x, enemy.z, victim.x, victim.z)) {
        this._hurtTarget(victim, 27, enemy); enemy.chargeHit = true;
      }
      this.state.effects.push({ id: `charge-${++this._serial}`, type: 'charge-trail', x: before.x, z: before.z, life: .25 });
      enemy.phaseTimer = Math.max(0, enemy.phaseTimer - dt);
      if (enemy.phaseTimer === 0 || lengthSq < .0001) this._guardianRecovery(enemy);
      return true;
    }
    if (visible && distance(enemy, target) < 10 && enemy.attackCooldown === 0) {
      const charge = (enemy.bossCycle || 0) % 2 === 0;
      enemy.bossCycle = (enemy.bossCycle || 0) + 1;
      enemy.bossPhase = charge ? 'charge-windup' : 'volley-windup'; enemy.phaseTimer = charge ? 1 : 1.1;
      this._warning(enemy, charge ? 'charge' : 'volley', target, enemy.phaseTimer, charge ? .78 : 1.05);
      this._events.push({ type: 'boss-phase', id: enemy.id, phase: enemy.bossPhase, x: enemy.x, z: enemy.z });
      return true;
    }
    return false;
  }

  _updateEnemy(enemy, dt) {
    enemy.hitTimer = Math.max(0, enemy.hitTimer - dt);
    if (!enemy.alive || this.state.status !== 'playing') return;
    enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
    enemy.stunTimer = Math.max(0, (enemy.stunTimer || 0) - dt);
    if (enemy.stunTimer > 0 && !enemy.guardian) return;
    if (enemy.encounterId && !enemy.encounterAwake) {
      const group = this.state.enemies.filter(other => other.encounterId === enemy.encounterId && other.alive);
      const observers = Object.values(this.state.players || { solo: this.state.player }).filter(player => player.alive !== false);
      if (!group.some(other => observers.some(player => distance(other, player) < 14 && this.hasLineOfSight(player.x, player.z, other.x, other.z)))) return;
      for (const other of group) { other.encounterAwake = true; other.active = true; }
    }
    const player = this.state.player;
    if (this.level.exploration && distance(player, enemy) > this.level.enemyAwarenessDistance) { enemy.active = false; return; }
    const target = this._combatTarget(enemy);
    if (!target) { enemy.active = false; enemy.telegraph = null; return; }
    const d = distance(target, enemy), visible = this.hasLineOfSight(enemy.x, enemy.z, target.x, target.z);
    enemy.combatTargetId = this._targetIdentity(target);
    if (d < 9 && visible || target !== player) enemy.active = true;
    if (!enemy.active) return;
    if (this.level.exploration) {
      enemy.alertTimer = visible ? 8 : Math.max(0, (enemy.alertTimer ?? 8) - dt);
      if (enemy.alertTimer === 0) { enemy.active = false; return; }
    }
    const facing = Math.atan2(target.x - enemy.x, -(target.z - enemy.z));
    if (enemy.type === 'bulwark') {
      if (enemy.shieldPhase !== 'windup') enemy.angle += clamp(angleDelta(facing, enemy.angle), -1.35 * dt, 1.35 * dt);
    } else enemy.angle = facing;
    if (enemy.guardian && this._updateGuardian(enemy, dt, target, visible)) return;
    if (enemy.type === 'stalker' && this._updateStalker(enemy, dt, target, visible)) return;
    if (enemy.type === 'sentry' && this._updateSentry(enemy, dt, target, visible)) return;
    if (enemy.type === 'bulwark' && this._updateBulwark(enemy, dt, target, visible)) return;
    if (enemy.type === 'mender' && this._updateMender(enemy, dt)) return;
    if (!enemy.guardian && !['sentry', 'bulwark'].includes(enemy.type) && d < .8 && visible && enemy.attackCooldown === 0) {
      this._hurtTarget(target, enemy.type === 'brute' ? 23 : enemy.type === 'stalker' ? 15 : enemy.type === 'runner' ? 10 : 8, enemy);
      enemy.attackCooldown = enemy.type === 'brute' ? 1.15 : .85;
    } else if (['spitter', 'mender'].includes(enemy.type) && d > 1.4 && d < 10 && visible && enemy.attackCooldown === 0) {
      const damage = enemy.type === 'mender' ? 10 : 15;
      if (target === player) {
        const speed = enemy.type === 'mender' ? 3.6 : 4.1;
        this.state.projectiles.push({ id: `p-${++this._serial}`, x: enemy.x, z: enemy.z, dx: (target.x - enemy.x) / d * speed,
          dz: (target.z - enemy.z) / d * speed, life: 4, type: 'plasma', damage });
      } else {
        this._damageEnemy(target, damage, enemy);
        this.state.effects.push({ id: `beam-${++this._serial}`, type: 'beam', x: enemy.x, z: enemy.z,
          targetX: target.x, targetZ: target.z, life: .16, faction: 'infestation' });
      }
      enemy.attackCooldown = (enemy.type === 'mender' ? 2.4 : 1.65) + this._rng() * .45;
    }
    if (d <= .65 || enemy.hitTimer > 0) return;
    if (['spitter', 'sentry', 'mender'].includes(enemy.type) && visible && d < 6.5) {
      // Ranged enemies hold a lane and retreat from pressure instead of joining
      // every runner in the same stationary pile at the player's feet.
      const direction = d < 2.8 ? -1 : 0;
      const side = direction ? 0 : Math.sin(this.state.time * 1.2 + enemy.x * .1) * .3;
      this._move(enemy, ((target.x - enemy.x) / d * direction * .85 + (target.z - enemy.z) / d * side) * dt,
        ((target.z - enemy.z) / d * direction * .85 - (target.x - enemy.x) / d * side) * dt, .2);
      return;
    }
    let targetX = target.x, targetZ = target.z;
    if (!visible) {
      const x = Math.floor(enemy.x), z = Math.floor(enemy.z);
      let best = this._distances?.[z * this.level.width + x] ?? -1;
      let step = null;
      for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) {
        const value = this._distances?.[nz * this.level.width + nx] ?? -1;
        if (value >= 0 && (best < 0 || value < best) && !this._wall(nx + .5, nz + .5)) { best = value; step = [nx + .5, nz + .5]; }
      }
      if (!step) return;
      [targetX, targetZ] = step;
    }
    const length = Math.hypot(targetX - enemy.x, targetZ - enemy.z);
    if (length < .05) return;
    const speed = (enemy.type === 'runner' ? 1.35 : enemy.type === 'stalker' ? 1.65 : enemy.type === 'brute' ? .69 : enemy.type === 'bulwark' ? .72 : .85) * this._difficulty.speed;
    let dx = (targetX - enemy.x) / length * speed * dt, dz = (targetZ - enemy.z) / length * speed * dt;
    for (const other of this.state.enemies) {
      if (other === enemy || !other.alive) continue;
      const apart = distance(enemy, other);
      if (apart > .01 && apart < .55) { dx += (enemy.x - other.x) / apart * dt * .6; dz += (enemy.z - other.z) / apart * dt * .6; }
    }
    this._move(enemy, dx, dz, enemy.type === 'brute' ? .28 : .2);
  }

  _updateProjectiles(dt) {
    const survivors = [];
    for (const shot of this.state.projectiles) {
      if (shot.type === 'grenade') {
        if (this._updateGrenade(shot, dt)) survivors.push(shot);
        continue;
      }
      shot.life -= dt;
      let removed = shot.life <= 0;
      const steps = Math.max(1, Math.ceil(Math.hypot(shot.dx, shot.dz) * dt / .12));
      for (let n = 0; n < steps && !removed; n++) {
        const previousX = shot.x, previousZ = shot.z;
        shot.x += shot.dx * dt / steps; shot.z += shot.dz * dt / steps;
        if (!this.hasLineOfSight(previousX, previousZ, shot.x, shot.z)) removed = true;
        else {
          const victim = Object.values(this.state.players || { solo: this.state.player })
            .filter(player => player.alive !== false && distance(shot, player) < .32 && this.hasLineOfSight(shot.x, shot.z, player.x, player.z))
            .sort((a, b) => distance(shot, a) - distance(shot, b))[0];
          if (victim) { this._hurtTarget(victim, shot.damage || 15, shot); removed = true; }
        }
      }
      if (!removed) survivors.push(shot);
    }
    this.state.projectiles = survivors;
  }

  _updateGrenade(shot, dt) {
    let travelTime = Math.min(dt, Math.max(0, shot.life));
    // An expired grenade detonates once. Wall reflections consume travel time,
    // lose energy and stop after four impacts, bounding both motion and work.
    for (let collision = 0; travelTime > .000001 && collision < 5; collision++) {
      const speed = Math.hypot(shot.dx, shot.dz);
      if (speed < .01 || shot.bounces >= 4) { shot.dx = 0; shot.dz = 0; break; }
      const dx = shot.dx / speed, dz = shot.dz / speed;
      const wall = this._traceWall(shot.x, shot.z, dx, dz, speed * travelTime);
      if (!wall.hitWall) { shot.x = wall.x; shot.z = wall.z; break; }
      shot.x = wall.x - dx * .002; shot.z = wall.z - dz * .002;
      travelTime -= wall.distance / speed;
      if (wall.normalX) shot.dx = -shot.dx;
      if (wall.normalZ) shot.dz = -shot.dz;
      shot.dx *= .66; shot.dz *= .66; shot.bounces++;
    }
    shot.life = Math.max(0, shot.life - dt);
    if (shot.life < .000001) shot.life = 0;
    if (shot.life > 0) return true;
    this._explodeGrenade(shot);
    return false;
  }

  _explodeGrenade(shot) {
    const spec = WEAPONS.grenade, source = { kind: 'player', playerId: shot.ownerId, x: shot.x, z: shot.z };
    let hit = false;
    for (const enemy of this.state.enemies) {
      const d = distance(shot, enemy);
      if (!enemy.alive || d >= spec.blastRadius || !this.hasLineOfSight(shot.x, shot.z, enemy.x, enemy.z)) continue;
      this._damageEnemy(enemy, spec.damage * (1 - .7 * d / spec.blastRadius), source);
      hit = true;
    }
    if (hit) this.state.hits++;
    // Co-op has no teammate damage. Only the stable throwing operative can
    // suffer their own splash, even if state.player now aliases somebody else.
    const owner = shot.ownerId === 'player' ? this.state.player : this.state.players?.[shot.ownerId];
    if (owner && owner.alive !== false && distance(shot, owner) < spec.blastRadius
      && this.hasLineOfSight(shot.x, shot.z, owner.x, owner.z)) {
      this._hurtTarget(owner, 55 * (1 - .7 * distance(shot, owner) / spec.blastRadius), shot);
    }
    this.state.effects.push({ id: `explosion-${++this._serial}`, type: 'explosion', x: shot.x, z: shot.z, radius: spec.blastRadius, life: .45 });
    this._events.push({ type: 'explosion', x: shot.x, z: shot.z, radius: spec.blastRadius, ownerId: shot.ownerId, hit });
  }

  _hurt(amount, source) {
    if (this.state.status !== 'playing') return;
    const p = this.state.player;
    const damage = Math.max(1, Math.round(amount * this._difficulty.damage));
    const absorbed = Math.min(p.armor, Math.ceil(damage * .55));
    p.armor -= absorbed;
    p.health = Math.max(0, p.health - (damage - absorbed));
    this._events.push({ type: 'hurt', damage, x: source.x, z: source.z });
    if (p.health === 0) { this.state.status = 'dead'; this._events.push({ type: 'death' }); }
  }

  _interactionCandidate() {
    const p = this.state.player;
    const candidates = [];
    for (const object of [...this.state.interactables, ...this.state.doors]) {
      if (object.used && !object.repeatable || object.open || object.paired || object.controlledBy) continue;
      const d = distance(p, object);
      if (d > 1.65) continue;
      // A door is solid; stop outside its cell. Consoles need full line of sight.
      const t = this.state.doors.includes(object) ? Math.max(0, (d - .74) / Math.max(d, .01)) : 1;
      if (!this.hasLineOfSight(p.x, p.z, p.x + (object.x - p.x) * t, p.z + (object.z - p.z) * t)) continue;
      candidates.push({ object, d });
    }
    candidates.sort((a, b) => a.d - b.d);
    return candidates[0]?.object ?? null;
  }

  _maxHealth(player = this.state.player) { return player.maxHealth || 100; }

  _requirementMet(requirement) {
    if (!requirement) return true;
    if (requirement === 'power') return this.state.power;
    if (requirement === 'key') return this.state.power && this.state.player.key && this._relaysReady();
    if (requirement === 'relays') return this.state.power && this._relaysReady();
    if (requirement === 'secret') return this.state.secretFound;
    if (requirement === 'guardian') return this.state.power && this._relaysReady() && this.state.enemies.some(e => e.id === this.level.guardianId && !e.alive);
    return ['cutter', 'insulator', 'phase'].includes(requirement) && this.state.upgrades?.[requirement] === true;
  }

  canOpenDoor(door) { return Boolean(door && (door.open || !door.controlledBy && this._requirementMet(door.requires))); }
  canTraverseDoor(door) { return Boolean(door && (door.open || !door.secret && this.canOpenDoor(door))); }

  _shutterDoors(control) { return (control.doorIds || []).map(id => this.state.doors.find(door => door.id === id)).filter(Boolean); }

  _shutterOccupied(control) {
    const actors = [...Object.values(this.state.players || { solo: this.state.player }).filter(player => player.alive !== false && player.health > 0),
      ...this.state.enemies.filter(enemy => enemy.alive), ...this.state.projectiles.filter(shot => shot.type === 'grenade' && shot.life > 0)];
    return this._shutterDoors(control).some(door => actors.some(actor => {
      const radius = actor.type === 'grenade' ? .08 : actor.type === 'brute' ? .3 : .22;
      return Math.abs(actor.x - door.x) < .5 + radius && Math.abs(actor.z - door.z) < .5 + radius;
    }));
  }

  _toggleShutter(control) {
    const doors = this._shutterDoors(control);
    if (!doors.length) return false;
    const open = !doors.every(door => door.open);
    if (!open && this._shutterOccupied(control)) return false;
    for (const door of doors) { door.open = open; this._events.push({ type: 'door', id: door.id, open }); }
    for (const linked of this.state.interactables.filter(item => item.type === 'shutter-switch')) linked.used = this._shutterDoors(linked).every(door => door.open);
    this._pathTimer = 0;
    this._events.push({ type: 'shutter', id: control.id, doorIds: [...control.doorIds], open, x: control.x, z: control.z,
      text: `${control.label || 'Shutter'} ${open ? 'raised' : 'lowered'}.` });
    return true;
  }

  _refugeSafe(station) {
    const living = Object.values(this.state.players || { solo: this.state.player }).filter(p => p.alive !== false);
    const hostile = this.state.enemies.some(enemy => this.isHostileToPlayer(enemy) && (
      distance(enemy, station) < 8 && this.hasLineOfSight(enemy.x, enemy.z, station.x, station.z)
      || living.some(p => distance(enemy, p) < (enemy.type === 'spitter' ? 10 : 6) && this.hasLineOfSight(enemy.x, enemy.z, p.x, p.z))));
    // A projectile remains dangerous after its shooter dies. Rest must not erase
    // an incoming hit or continually refill a teammate in a ranged encounter.
    const incoming = this.state.projectiles.some(shot => shot.life > 0 && living.some(p => distance(shot, p) < 10 && this.hasLineOfSight(shot.x, shot.z, p.x, p.z)));
    return !hostile && !incoming;
  }

  _replenishAtStation() {
    const p = this.state.player;
    p.health = this._maxHealth(p); p.armor = Math.max(50, p.armor);
    p.ammo.pistol = Math.max(60, p.ammo.pistol); p.ammo.shells = Math.max(16, p.ammo.shells);
    p.ammo.cells = p.hasArc ? Math.max(4, p.ammo.cells || 0) : p.ammo.cells || 0;
    p.ammo.slugs = p.hasRicochet ? Math.max(8, p.ammo.slugs || 0) : p.ammo.slugs || 0;
    p.ammo.grenades = p.hasGrenade ? Math.max(2, p.ammo.grenades || 0) : p.ammo.grenades || 0;
    this.state.projectiles = []; this.state.effects = [];
  }

  _syncPermanentProgress() {
    if (!this.level.exploration || !this._checkpoint) return;
    // Keep capabilities, routes and discoveries on checkpoint retry while the
    // checkpoint continues to own respawn positions and consumable supplies.
    const saved = this._checkpoint.state || this._checkpoint;
    saved.upgrades = copy(this.state.upgrades); saved.healthBonus = this.state.healthBonus;
    saved.power = this.state.power; saved.secretFound = this.state.secretFound;
    for (const door of saved.doors) if (!this.level.doors.find(current => current.id === door.id).controlledBy) door.open ||= this.state.doors.find(current => current.id === door.id).open;
    for (const object of saved.interactables) {
      const current = this.state.interactables.find(i => i.id === object.id);
      if (current.type !== 'exit' && current.type !== 'shutter-switch') object.used ||= current.used;
    }
    for (const item of this.state.pickups) if (['key', 'healthExpansion'].includes(item.type) && item.collected) saved.pickups.find(current => current.id === item.id).collected = true;
    const teamKey = this.state.pickups.find(item => item.type === 'key')?.collected === true;
    for (const p of Object.values(saved.players || { solo: saved.player })) {
      p.maxHealth = 100 + this.state.healthBonus; p.key = teamKey;
    }
    const guardian = this.state.enemies.find(e => e.id === this.level.guardianId);
    const savedGuardian = saved.enemies.find(e => e.id === this.level.guardianId);
    if (guardian && !guardian.alive && savedGuardian?.alive) {
      Object.assign(savedGuardian, copy(guardian)); saved.kills += Number(guardian.killedByPlayer !== false);
    }
  }

  getInteractionInfo() {
    const o = this._interactionCandidate();
    if (!o) return null;
    if (['cutter', 'insulator', 'phase'].includes(o.requires) && !this._requirementMet(o.requires)) return { text: `${this.level.upgradeNames?.[o.requires] || o.requires} required`, label: 'LOCKED', canUse: false };
    const active = this.state.status === 'playing' && this.state.player.alive !== false;
    if (o.type === 'shutter-switch') {
      if (!this.state.power) return { text: 'Shutter control offline — restore power', label: 'OFFLINE', canUse: false };
      const open = this._shutterDoors(o).every(door => door.open);
      if (open && this._shutterOccupied(o)) return { text: 'Shutter path occupied — clear the doorway', label: 'BLOCKED', canUse: false };
      return { text: `${open ? 'Lower' : 'Raise'} ${(o.label || `shutter ${o.mark || ''}`).toLowerCase()}`.trim(), label: open ? 'LOWER' : 'RAISE', canUse: active };
    }
    if (o.type === 'transit') {
      if (!o.used) return { text: `Activate ${o.label}`, label: 'LINK', canUse: active };
      const destination = this.state.interactables.find(i => i.id === o.destination);
      if (!this.state.power) return { text: 'Transit offline — restore central power', label: 'OFFLINE', canUse: false };
      if (!destination?.used) return { text: 'Station active — activate the other end to travel', label: 'OFFLINE', canUse: false };
      return { text: `Travel to ${this.level.zones.find(zone => destination.x >= zone.x1 && destination.x < zone.x2 && destination.z >= zone.z1 && destination.z < zone.z2)?.name || destination.label}`, label: 'TRAVEL', canUse: active };
    }
    const relayPower = this.level.missionId === 'crosslink-11' ? 'hub power' : 'ring power';
    if (o.requires === 'power' && !this.state.power) return { text: o.type === 'relay' ? `Relay offline — restore ${relayPower}` : 'Airlock offline — restore power', label: 'OFFLINE', canUse: false };
    if (o.requires === 'relays' && !this.state.power) return { text: `Communications vault offline — restore ${relayPower}`, label: 'OFFLINE', canUse: false };
    if (o.requires === 'relays' && !this._relaysReady()) return { text: 'Vault locked — activate both relay consoles', label: 'LOCKED', canUse: false };
    if (o.requires === 'key' && !this.state.power) return { text: 'Security gate offline — restore power', label: 'OFFLINE', canUse: false };
    if (o.requires === 'key' && !this.state.player.key) return { text: 'Security gate — access key required', label: 'LOCKED', canUse: false };
    if (o.type === 'exit' && (!this.state.power || !this.state.player.key)) return { text: 'Extraction offline — power and key required', label: this.state.power ? 'LOCKED' : 'OFFLINE', canUse: false };
    if (o.type === 'exit' && !this._relaysReady()) return { text: 'Uplink offline — activate both relay consoles', label: 'LOCKED', canUse: false };
    if (o.type === 'refuge' && !this._refugeSafe(o)) return { text: 'Clear nearby hostiles before the team can rest', label: 'THREAT', canUse: false };
    const label = o.type === 'upgrade' ? 'EQUIP' : o.type === 'refuge' ? 'REST' : o.type === 'power' ? 'POWER' : o.type === 'relay' ? 'LINK' : o.type === 'exit' ? 'EXTRACT' : o.type === 'secret' || o.secret ? 'INSPECT' : o.requires === 'cutter' ? 'CUT' : o.requires === 'insulator' ? 'CROSS' : o.requires === 'phase' ? 'PHASE' : 'OPEN';
    return { text: o.label || (o.secret ? 'Inspect maintenance panel' : 'Open airlock'), label, canUse: this.state.status === 'playing' && this.state.player.alive !== false };
  }

  getPrompt() { return this.getInteractionInfo()?.text || ''; }

  interact() {
    if (this.state.status !== 'playing') return false;
    const o = this._interactionCandidate();
    if (!o) return false;
    if (!this._requirementMet(o.requires)) {
      this._events.push({ type: 'message', text: this.getPrompt() }); return false;
    }
    this.state.tutorial.interacted = true;
    if (o.type === 'shutter-switch') {
      if (!this._toggleShutter(o)) { this._events.push({ type: 'message', text: 'Shutter path occupied — clear the doorway' }); return false; }
    } else if (o.type === 'upgrade') {
      this.state.upgrades[o.upgrade] = true; o.used = true; this.state.checkpoint = true;
      this._replenishAtStation();
      const text = `${this.level.upgradeNames[o.upgrade]} acquired. New routes through earlier sectors are now available.`;
      this._events.push({ type: 'upgrade', id: o.id, upgrade: o.upgrade, text }, { type: 'message', text });
      this._saveCheckpoint(`${this.level.upgradeNames[o.upgrade]} checkpoint saved.`);
    } else if (o.type === 'refuge') {
      if (!this._refugeSafe(o)) { this._events.push({ type: 'message', text: this.getPrompt() }); return false; }
      o.used = true; this.state.checkpoint = true; this._replenishAtStation();
      this._events.push({ type: 'refuge', id: o.id, text: 'Refuge secured. Health and ammunition replenished.' });
      this._saveCheckpoint('Refuge checkpoint saved.');
    } else if (o.type === 'transit') {
      if (!o.used) {
        o.used = true;
        this._events.push({ type: 'transit-activated', id: o.id, destination: o.destination }, { type: 'message', text: 'Transit station activated. Activate its partner to connect this route.' });
      } else {
        const destination = this.state.interactables.find(i => i.id === o.destination);
        if (!this.state.power || !destination?.used) { this._events.push({ type: 'message', text: this.getPrompt() }); return false; }
        const landing = destination.landing || destination;
        if (!this._clearCircle(landing.x, landing.z, .22)) return false;
        const p = this.state.player;
        p.x = landing.x; p.z = landing.z; p.moving = false; this._pathTimer = 0;
        this._events.push({ type: 'transit', ...(p.id ? { playerId: p.id } : {}), from: o.id, to: destination.id, x: p.x, z: p.z });
      }
    } else if (o.type === 'power') {
      o.used = true; this.state.power = true; this.state.checkpoint = true;
      this.state.player.health = Math.max(75, this.state.player.health);
      this.state.player.armor = Math.max(30, this.state.player.armor);
      this.state.player.ammo.pistol = Math.max(24, this.state.player.ammo.pistol);
      if (this.level.exploration) this._replenishAtStation();
      this._events.push({ type: 'power' }, { type: 'message', text: this.level.missionId === 'glasshouse-17' ? 'Conservatory power restored. The Thumper rack is active. Both cultivation wings lead to the northern relays.' : this.level.missionId === 'switchyard-15' ? 'Switchyard power restored. The freight shutter and western service loop both lead toward the arc workshop.' : this.level.exploration ? 'Central power restored. Find the industrial cutter in the western foundry.' : this.level.missionId === 'crosslink-11' ? 'Hub power restored. Activate the western and eastern relay consoles.' : this.level.missionId === 'relay-09' ? 'Ring power restored. Activate the western and eastern relay consoles.' : 'Power restored. Airlocks online. Find the security key.' });
      this._saveCheckpoint(this.level.missionId === 'glasshouse-17' ? 'Checkpoint saved in the planted atrium.' : this.level.missionId === 'switchyard-15' ? 'Checkpoint saved in the observation concourse.' : this.level.exploration ? 'Checkpoint saved at the central exchange.' : this.level.missionId === 'crosslink-11' ? 'Checkpoint saved at the power hub.' : 'Checkpoint saved at the generator.');
    } else if (o.type === 'relay') {
      o.used = true;
      const progress = this.getMissionProgress();
      const text = this.level.missionId === 'glasshouse-17' ? progress.relaysUsed === progress.relaysTotal ? 'Both cultivation relays linked. Open the propagation chamber.' : 'Cultivation relay linked. Reconnect the other wing to open containment.' : this.level.missionId === 'switchyard-15' ? progress.relaysUsed === progress.relaysTotal ? 'Both galleries linked. The switching-engine chamber is ready to open.' : 'Gallery relay linked. Reconnect the other gallery to release containment.' : progress.relaysUsed === progress.relaysTotal ? this.level.exploration ? 'Both crown relays online. Open reactor containment and defeat its guardian.' : 'Both relays online. The communications vault can now be opened.' : `${o.id === 'relay-west' ? 'Western' : 'Eastern'} relay online. Activate the other relay to unlock ${this.level.exploration ? 'reactor containment' : 'the vault'}.`;
      this._events.push({ type: 'relay', id: o.id, count: progress.relaysUsed, total: progress.relaysTotal, text }, { type: 'message', text });
      this._pathTimer = 0;
      if (progress.relaysUsed === progress.relaysTotal) {
        this.state.checkpoint = true;
        this._saveCheckpoint('Checkpoint saved: both relays online.');
      }
    } else if (o.type === 'secret' || o.secret) {
      this.state.secretFound = true;
      this.state.interactables.find(i => i.type === 'secret').used = true;
      this.state.doors.find(d => d.id === 'maintenance').open = true;
      this._events.push({ type: 'secret', text: 'Secret found: maintenance supply cache.' }, { type: 'door', id: 'maintenance' });
      this._pathTimer = 0;
    } else if (o.type === 'exit') {
      if (!this.state.power || !this.state.player.key || !this._relaysReady()) { this._events.push({ type: 'message', text: this.getPrompt() }); return false; }
      o.used = true; this.state.status = 'won'; this._events.push({ type: 'win', time: this.state.time });
    } else {
      o.open = true;
      for (const paired of this.state.doors) if (paired.paired === o.id) paired.open = true;
      this._events.push({ type: 'door', id: o.id }); this._pathTimer = 0;
    }
    this._syncPermanentProgress();
    return true;
  }

  getObjective() {
    if (this.level.missionId === 'glasshouse-17') return this._getGlasshouseObjective();
    if (this.level.missionId === 'switchyard-15') return this._getSwitchyardObjective();
    if (this.level.exploration) return this._getExplorationObjective();
    const relayMission = this.state.interactables.some(i => i.type === 'relay');
    const crosslink = this.level.missionId === 'crosslink-11';
    const arrival = this.state.doors.find(d => d.id === 'arrival');
    const power = this.state.interactables.find(i => i.type === 'power');
    const key = this.state.pickups.find(p => p.type === 'key');
    const gate = this.state.doors.find(d => d.id === 'security');
    const exit = this.state.interactables.find(i => i.type === 'exit');
    const objective = (target, title, detail, stage, action = 'interact') => ({ title, detail, x: target.x, z: target.z, stage, ...(action ? { action } : {}) });
    if (this.state.status === 'won') return objective(exit, 'Extraction complete', `${this.level.name} is behind you.`, 'complete', null);
    if (!arrival.open) return objective(arrival, crosslink ? 'Enter the Crosslink facility' : relayMission ? 'Enter the communications ring' : 'Leave the arrival bay', 'Move toward the airlock and use it to enter the facility.', 'arrival');
    if (!this.state.power) return objective(power, crosslink ? 'Restore hub power' : relayMission ? 'Restore ring power' : 'Restore auxiliary power', crosslink ? 'Find the power console on the west side of the central hub.' : relayMission ? 'Find the power console in the southwest plant.' : 'Find the illuminated console in the generator room.', 'power');
    const nextRelay = this.state.interactables.find(i => i.type === 'relay' && !i.used);
    if (nextRelay) return objective(nextRelay, nextRelay.label, `Find and activate both relay consoles. ${this.getMissionProgress().relaysUsed} of 2 relays online.`, 'relays');
    if (!this.state.player.key) {
      const vault = this.state.doors.find(d => d.requires === 'relays');
      if (vault && !vault.open) return objective(vault, 'Open the communications vault', 'Both relays are online. Open the central vault to recover its security key.', 'vault');
      return objective(key, 'Recover the security key', relayMission ? 'Enter the central vault and collect the illuminated key.' : 'Enter the research lab through a powered airlock.', 'key', 'collect');
    }
    if (!gate.open) return objective(gate, 'Open the extraction gate', crosslink ? 'Cross the vault to the northern gate. Your key opens the extraction uplink.' : relayMission ? 'Return to the north gallery. Your key opens the uplink gate.' : 'Head south through quarantine. Your key opens the gate.', 'gate');
    return objective(exit, 'Signal extraction', relayMission ? 'Use the terminal in extraction control to transmit your signal.' : 'Use the green terminal at the far end of the extraction bay.', 'extraction');
  }

  _getGlasshouseObjective() {
    const find = id => [...this.state.interactables, ...this.state.doors, ...this.state.pickups].find(item => item.id === id);
    const objective = (target, title, detail, stage, action = 'interact') => ({ title, detail, x: target.x, z: target.z, stage, ...(action ? { action } : {}) });
    if (this.state.status === 'won') return objective(find('extraction'), 'Glasshouse secured', 'The laboratory lift carries the team clear of the conservatory.', 'complete', null);
    if (!find('rebound-carbine').collected && !find('arrival').open) return objective(find('rebound-carbine'), 'Explore the ballistics practice bay', 'The western lab holds a Rebound carbine. Its slugs reflect once from solid walls.', 'practice', 'collect');
    if (!find('arrival').open) return objective(find('arrival'), 'Enter the planted atrium', 'Open the northern lab airlock. The lift behind you needs the guardian key.', 'arrival');
    if (!this.state.power) return objective(find('aux-power'), 'Restore conservatory power', 'The power console stands on the southwest side of the planted atrium.', 'power');
    if (!find('thumper').collected) return objective(find('thumper'), 'Recover the Thumper', 'The powered weapon rack on the southeast side of the atrium holds bouncing grenades.', 'armory', 'collect');
    const relay = this.state.interactables.filter(item => item.type === 'relay' && !item.used).sort((a, b) => distance(a, this.state.player) - distance(b, this.state.player))[0];
    if (relay) return objective(relay, relay.label, 'Follow either cultivation wing. The northern gallery connects both relays.', 'relays');
    if (!find('arena-seal').open) return objective(find('arena-seal'), 'Open the propagation chamber', 'Both relays are linked. Open the chamber from the north gallery.', 'containment');
    const guardian = this.state.enemies.find(enemy => enemy.id === this.level.guardianId);
    if (guardian.alive) return objective(guardian, 'Defeat the propagation guardian', 'Use the root banks as cover and attack when its reactor opens. Interrupt the supporting mender.', 'guardian', 'fight');
    if (!this.state.player.key) return objective(find('access-key'), 'Recover the laboratory key', 'Collect the key at the north end of the chamber.', 'key', 'collect');
    if (!find('return-shortcut').open) return objective(find('return-shortcut'), 'Open the atrium return', 'Follow the central spine south. The key opens a direct route into the familiar atrium.', 'return');
    if (!find('security').open) return objective(find('security'), 'Return to the laboratory lift', 'Pass through the atrium and arrival lab to the lift gate.', 'gate');
    return objective(find('extraction'), 'Depart from the Glasshouse', 'Use the laboratory lift terminal to extract.', 'extraction');
  }

  _getSwitchyardObjective() {
    const find = id => [...this.state.interactables, ...this.state.doors, ...this.state.pickups].find(item => item.id === id);
    const objective = (target, title, detail, stage, action = 'interact') => ({ title, detail, x: target.x, z: target.z, stage, ...(action ? { action } : {}) });
    if (this.state.status === 'won') return objective(find('extraction'), 'Switchyard secured', 'The freight lift is moving again.', 'complete', null);
    if (!find('arrival').open) return objective(find('arrival'), 'Enter the observation concourse', 'Open the north airlock. The freight lift behind you needs its guardian key.', 'arrival');
    if (!this.state.power) return objective(find('aux-power'), 'Restore switchyard power', 'The control cabinet is on the west side of the observation concourse.', 'power');
    if (!this.state.player.hasArc) return objective(find('arc-caster'), 'Reach the arc workshop', 'Raise the freight shutter to cross the yard, or take the western service loop. Both routes reach the workshop.', 'armory', 'collect');
    const relay = this.state.interactables.filter(item => item.type === 'relay' && !item.used).sort((a, b) => distance(a, this.state.player) - distance(b, this.state.player))[0];
    if (relay) return objective(relay, relay.label, 'Link the cable and phase galleries in either order. Shutters change firing lanes; their service bypasses stay open.', 'relays');
    if (!find('arena-seal').open) return objective(find('arena-seal'), 'Open the switching-engine chamber', 'Both relays are linked. Enter the chamber from the workshop approach.', 'guardian');
    const guardian = this.state.enemies.find(enemy => enemy.id === this.level.guardianId);
    if (guardian.alive) return objective(guardian, 'Defeat the switching-engine guardian', 'Sidestep the marked charge, use the cover banks, and fire when the reactor shutters open.', 'guardian', 'fight');
    if (!this.state.player.key) return objective(find('access-key'), 'Recover the freight-lift key', 'The guardian released the key at the north end of the chamber.', 'key', 'collect');
    if (this.state.upgrades.cutter && !find('return-grille').open) return objective(find('return-grille'), 'Open the workshop return', 'The cutter opens a direct route back to the freight-lift concourse.', 'return');
    if (!find('security').open) return objective(find('security'), 'Unlock the freight lift', 'Return to the landing by the workshop grille, yard, or service loop.', 'return');
    return objective(find('extraction'), 'Depart in the freight lift', 'Use the lift terminal to complete the mission.', 'extraction');
  }

  getMissionProgress() {
    const relays = this.state.interactables.filter(i => i.type === 'relay');
    return { missionId: this.level.missionId, relaysUsed: relays.filter(i => i.used).length, relaysTotal: relays.length };
  }

  _relaysReady() { const p = this.getMissionProgress(); return p.relaysUsed === p.relaysTotal; }

  _getExplorationObjective() {
    const find = id => this.state.interactables.find(i => i.id === id);
    const objective = (target, title, detail, stage, action = 'interact') => ({ title, detail, x: target.x, z: target.z, stage, ...(action ? { action } : {}) });
    const exit = find('extraction'), arrival = this.state.doors.find(d => d.id === 'arrival');
    if (this.state.status === 'won') return objective(exit, 'The Underworks secured', 'You returned to the arrival lift with the reactor key.', 'complete', null);
    if (!arrival.open) {
      if (!find('transit-arrival').used) return objective(find('transit-arrival'), 'Activate the arrival transit', 'Link this station now so the reactor station can bring you back later.', 'arrival');
      return objective(arrival, 'Enter the freight terminal', 'Open the north airlock and follow the freight route to the central exchange.', 'arrival');
    }
    if (!this.state.power) return objective(find('aux-power'), 'Restore central power', 'Find the power console on the southwest side of the central exchange.', 'power');
    for (const [upgrade, detail] of [
      ['cutter', 'Enter the western foundry. The cutter opens grilles here and back near the arrival terminal.'],
      ['insulator', 'Return to the exchange, cut the eastern grille and follow the pump works south into the flood reserve.'],
      ['phase', 'Return north through the pump works. Your insulator opens the energized passage to the archive workshop.'],
    ]) if (!this.state.upgrades[upgrade]) return objective(find(`upgrade-${upgrade}`), `Recover the ${this.level.upgradeNames[upgrade].toLowerCase()}`, detail, upgrade);
    const relay = this.state.interactables.filter(i => i.type === 'relay' && !i.used).sort((a, b) => distance(a, this.state.player) - distance(b, this.state.player))[0];
    if (relay) return objective(relay, relay.label, `Reconnect the rail crown and archive relays in either order. ${this.getMissionProgress().relaysUsed} of 2 online. Phase fields now open shortcuts through the reactor ring.`, 'relays');
    const seal = this.state.doors.find(d => d.id === 'reactor-seal');
    if (!seal.open) return objective(seal, 'Open reactor containment', 'Both relays are online. Enter the inner reactor from the south side of the crown.', 'guardian');
    const guardian = this.state.enemies.find(e => e.id === this.level.guardianId);
    if (guardian.alive) return objective(guardian, 'Defeat the reactor guardian', 'Use cover and both weapons. Its defeat releases the lift key.', 'guardian', 'fight');
    if (!this.state.player.key) return objective(this.state.pickups.find(i => i.type === 'key'), 'Recover the reactor key', 'Collect the illuminated key inside containment.', 'key', 'collect');
    const gate = this.state.doors.find(d => d.id === 'security');
    if (!gate.open) {
      const returnStation = find('transit-reactor');
      if (find('transit-arrival').used && distance(this.state.player, gate) > 30) return objective(returnStation, returnStation.used ? 'Return by reactor transit' : 'Activate the reactor return transit', returnStation.used ? 'Use the linked station to return to the arrival lift.' : 'Activate the station, then use it again to return to the lift.', 'return');
      return objective(gate, 'Unlock the arrival lift', 'Return south through the central exchange, or use the linked reactor transit.', 'return');
    }
    return objective(exit, 'Leave The Underworks', 'Use the arrival lift to complete the expedition.', 'extraction');
  }

  getExplorationProgress() {
    const upgrades = Object.entries(this.level.upgradeNames || {}).map(([id, name]) => ({ id, name, owned: this.state.upgrades?.[id] === true }));
    const refuges = this.state.interactables.filter(i => i.type === 'refuge'), transits = this.state.interactables.filter(i => i.type === 'transit');
    return { upgrades, upgradesFound: upgrades.filter(i => i.owned).length, upgradesTotal: upgrades.length, refugesVisited: refuges.filter(i => i.used).length, refugesTotal: refuges.length, transitsActive: transits.filter(i => i.used).length, transitsTotal: transits.length, healthBonus: this.state.healthBonus || 0 };
  }

  getMapInfo() {
    const sectors = this.level.zones.map((zone, index) => ({ id: zone.id || `sector-${index}`, name: zone.name, x: (zone.x1 + zone.x2) / 2, z: (zone.z1 + zone.z2) / 2, bounds: { x1: zone.x1, x2: zone.x2, z1: zone.z1, z2: zone.z2 }, palette: zone.palette || 'arrival' }));
    const markers = this.state.interactables.map(i => ({ id: i.id, type: i.type === 'secret' ? 'cache' : i.type, label: i.label, x: i.x, z: i.z, active: i.used, requires: i.requires || null, locked: !this._requirementMet(i.requires), ...(i.upgrade ? { upgrade: i.upgrade } : {}), ...(i.destination ? { destination: i.destination, landing: copy(i.landing || i) } : {}) }));
    for (const door of this.state.doors) if (!door.paired) markers.push({ id: door.id, type: door.secret ? 'cache' : ['grille', 'hazard', 'phase', 'shortcut', 'shutter'].includes(door.kind) ? door.kind : 'gate', label: door.label || (door.controlledBy ? `Freight shutter ${door.mark || ''}` : 'Airlock'), x: door.x, z: door.z, active: door.open, requires: door.requires || null, locked: !this.canOpenDoor(door) });
    for (const item of this.state.pickups) if (['key', 'healthExpansion'].includes(item.type)) markers.push({ id: item.id, type: item.type === 'key' ? 'key' : 'cache', label: item.type === 'key' ? 'Security key' : 'Medical expansion · +25 maximum health', x: item.x, z: item.z, active: item.collected, requires: item.requires || null, locked: !this._requirementMet(item.requires) });
    const guardian = this.state.enemies.find(e => e.id === this.level.guardianId);
    if (guardian) markers.push({ id: guardian.id, type: 'guardian', label: this.level.guardianName || 'Reactor guardian', x: guardian.x, z: guardian.z, active: !guardian.alive, requires: 'relays', locked: !this._requirementMet('relays') });
    return { large: Boolean(this.level.exploration), sectors, markers, upgrades: this.getExplorationProgress().upgrades };
  }

  getZone() {
    const p = this.state.player;
    return this.level.zones.find(zone => p.x >= zone.x1 && p.x < zone.x2 && p.z >= zone.z1 && p.z < zone.z2)?.name || 'Service passage';
  }

  drainEvents() { const events = this._events; this._events = []; return events; }

  _saveCheckpoint(text) {
    this._checkpoint = this._snapshot();
    this._events.push({ type: 'checkpoint', text });
  }

  _snapshot() {
    return {
      player: copy(this.state.player), enemies: copy(this.state.enemies),
      projectiles: copy(this.state.projectiles.filter(shot => shot.type === 'grenade')), serial: this._serial,
      pickups: this.state.pickups.map(p => ({ id: p.id, collected: p.collected })),
      doors: this.state.doors.map(d => ({ id: d.id, open: d.open })),
      interactables: this.state.interactables.map(i => ({ id: i.id, used: i.used })),
      power: this.state.power, secretFound: this.state.secretFound,
      time: this.state.time, kills: this.state.kills, shots: this.state.shots, hits: this.state.hits,
      tutorial: copy(this.state.tutorial), randomState: this._random,
      ...(this.level.upgradeNames ? { upgrades: copy(this.state.upgrades) } : {}),
      ...(this.level.exploration ? { healthBonus: this.state.healthBonus } : {}),
    };
  }

  serialize() {
    return { version: 1, levelId: this.level.id, options: { mission: this.level.missionId, difficulty: this._runDifficulty, seed: this._runSeed }, state: this._snapshot(), checkpoint: this._checkpoint ? copy(this._checkpoint) : null };
  }

  _validEncounterSnapshot(enemy, base, level) {
    const validTarget = (id, kind) => typeof id === 'string'
      && (kind === undefined || kind === null || ['player', 'enemy'].includes(kind))
      && (kind === 'player' ? id === 'player' || Object.hasOwn(this.state.players || {}, id)
        : kind === 'enemy' ? level.enemies.some(other => other.id === id)
          : id === 'player' || level.enemies.some(other => other.id === id));
    for (const flag of ['provoked', 'killedByPlayer', 'chargeHit', 'encounterAwake']) if (enemy[flag] !== undefined && typeof enemy[flag] !== 'boolean') return false;
    if (enemy.stunTimer !== undefined && (!finite(enemy.stunTimer, 0, WEAPONS.arc.stun) || base.guardian && enemy.stunTimer !== 0)) return false;
    if (enemy.shieldPhase !== undefined && (base.type !== 'bulwark' || !['guard', 'windup', 'exposed'].includes(enemy.shieldPhase))) return false;
    if (enemy.shieldTimer !== undefined && (base.type !== 'bulwark' || !finite(enemy.shieldTimer, 0, 3.4))) return false;
    if (enemy.healCooldown !== undefined && (base.type !== 'mender' || !finite(enemy.healCooldown, 0, 4.8))) return false;
    for (const timer of ['blinkCooldown', 'phaseTimer', 'attackCooldown']) if (enemy[timer] !== undefined && !finite(enemy[timer], 0, 30)) return false;
    if (enemy.bossPhase !== undefined && (!base.guardian || !['stalk', 'charge-windup', 'charge', 'volley-windup', 'recover'].includes(enemy.bossPhase))) return false;
    if (enemy.bossCycle !== undefined && (!Number.isSafeInteger(enemy.bossCycle) || enemy.bossCycle < 0 || enemy.bossCycle > 1000000)) return false;
    if (enemy.chargeAngle !== undefined && !finite(enemy.chargeAngle, -Math.PI, Math.PI)) return false;
    if (enemy.chargeTargetKind !== undefined && enemy.chargeTargetKind !== null && (!base.guardian || !['player', 'enemy'].includes(enemy.chargeTargetKind) || !enemy.chargeTargetId)) return false;
    if (enemy.chargeTargetId !== undefined && enemy.chargeTargetId !== null && (!base.guardian || !validTarget(enemy.chargeTargetId, enemy.chargeTargetKind))) return false;
    const mark = enemy.telegraph;
    if (mark === undefined || mark === null) return !['charge-windup', 'volley-windup'].includes(enemy.bossPhase) && enemy.shieldPhase !== 'windup';
    if (!mark || typeof mark !== 'object' || Array.isArray(mark) || !['blink', 'charge', 'volley', 'shot', 'bash', 'heal'].includes(mark.kind)) return false;
    if (mark.kind === 'blink' && base.type !== 'stalker' || mark.kind === 'shot' && base.type !== 'sentry'
      || mark.kind === 'bash' && (base.type !== 'bulwark' || enemy.shieldPhase !== 'windup') || mark.kind === 'heal' && base.type !== 'mender'
      || ['charge', 'volley'].includes(mark.kind) && !base.guardian) return false;
    for (const [key, bound] of [['x', level.width], ['z', level.height], ['fromX', level.width], ['fromZ', level.height]]) if (!finite(mark[key], 1, bound - 1)) return false;
    if (level.grid[Math.floor(mark.z)][Math.floor(mark.x)] === '#' || !finite(mark.radius, .1, 3)
      || !finite(mark.duration, .1, 3) || !finite(mark.remaining, 0, mark.duration)) return false;
    if (mark.targetKind !== undefined && (!['player', 'enemy'].includes(mark.targetKind) || !mark.targetId)) return false;
    if (mark.targetId !== undefined && !validTarget(mark.targetId, mark.targetKind)) return false;
    if (mark.kind === 'heal' && (mark.targetKind !== 'enemy' || !level.enemies.some(other => other.id === mark.targetId && other.id !== base.id && !other.guardian && other.type !== 'sentry' && (other.faction || 'infestation') === 'infestation'))) return false;
    return true;
  }

  _validSnapshot(s, level = this.level) {
    if (!s || typeof s !== 'object') return false;
    if (level.upgradeNames && (!s.upgrades || typeof s.upgrades !== 'object' || Array.isArray(s.upgrades) || Object.keys(s.upgrades).length !== 3 || !['cutter', 'insulator', 'phase'].every(id => typeof s.upgrades[id] === 'boolean'))) return false;
    if (level.exploration && ![0, 25].includes(s.healthBonus)) return false;
    const p = s.player;
    const maxHealth = level.exploration ? 100 + s.healthBonus : 100;
    if (!p || !finite(p.x, 1, level.width - 1) || !finite(p.z, 1, level.height - 1) || !finite(p.angle, -1000, 1000) || !finite(p.health, 1, maxHealth) || !finite(p.armor, 0, 100) || level.exploration && p.maxHealth !== maxHealth) return false;
    if (level.grid[Math.floor(p.z)][Math.floor(p.x)] === '#') return false;
    if (!p.ammo || !finite(p.ammo.pistol, 0, 10000) || !finite(p.ammo.shells, 0, 10000) || p.ammo.cells !== undefined && !finite(p.ammo.cells, 0, 10000)
      || !Object.hasOwn(WEAPONS, p.weapon) || typeof p.key !== 'boolean' || typeof p.hasShotgun !== 'boolean'
      || !ownedWeapons(p).includes(p.weapon)) return false;
    for (const weapon of [WEAPONS.arc, WEAPONS.ricochet, WEAPONS.grenade]) {
      if (p[weapon.ownershipKey] !== undefined && typeof p[weapon.ownershipKey] !== 'boolean') return false;
      if (p.ammo[weapon.ammoKey] !== undefined && (!finite(p.ammo[weapon.ammoKey], 0, 10000) || weapon.id !== 'arc' && !Number.isSafeInteger(p.ammo[weapon.ammoKey]))) return false;
    }
    if (typeof s.power !== 'boolean' || typeof s.secretFound !== 'boolean') return false;
    for (const key of ['time', 'kills', 'shots', 'hits', 'randomState']) if (!finite(s[key], 0, key === 'randomState' ? 4294967295 : 10000000)) return false;
    for (const [key, flag] of [['pickups', 'collected'], ['doors', 'open'], ['interactables', 'used']]) {
      if (!Array.isArray(s[key]) || s[key].length !== level[key].length || new Set(s[key].map(v => v?.id)).size !== level[key].length) return false;
      for (const base of level[key]) if (!s[key].some(v => v?.id === base.id && typeof v[flag] === 'boolean')) return false;
    }
    const savedDoor = id => s.doors.find(d => d.id === id);
    const savedItem = id => s.pickups.find(item => item.id === id);
    const savedFeature = id => s.interactables.find(i => i.id === id);
    if (p.key !== savedItem('access-key').collected || p.hasShotgun !== savedItem('pump-shotgun').collected || s.power !== savedFeature('aux-power').used) return false;
    for (const weapon of [WEAPONS.arc, WEAPONS.ricochet, WEAPONS.grenade]) if ((p[weapon.ownershipKey] === true) !== level.pickups.filter(item => item.type === weapon.id).some(item => savedItem(item.id).collected)) return false;
    const cachePanel = savedFeature('cache-panel'), maintenanceDoor = savedDoor('maintenance');
    if (cachePanel ? s.secretFound !== cachePanel.used || s.secretFound !== maintenanceDoor?.open : s.secretFound) return false;
    const relays = level.interactables.filter(i => i.type === 'relay');
    const relaysReady = relays.every(i => savedFeature(i.id).used);
    const meets = requirement => {
      if (!requirement) return true;
      if (requirement === 'power') return s.power;
      if (requirement === 'key') return s.power && p.key && relaysReady;
      if (requirement === 'relays') return s.power && relaysReady;
      if (requirement === 'secret') return s.secretFound;
      if (requirement === 'guardian') return s.power && relaysReady && Array.isArray(s.enemies) && s.enemies.some(e => e.id === level.guardianId && !e.alive);
      return ['cutter', 'insulator', 'phase'].includes(requirement) && s.upgrades?.[requirement] === true;
    };
    if (!s.power && relays.some(i => savedFeature(i.id).used)) return false;
    if (p.key && !relaysReady) return false;
    if (level.upgradeNames) {
      for (const id of ['cutter', 'insulator', 'phase']) {
        if (level.upgradeNames[id] ? s.upgrades[id] !== savedFeature(`upgrade-${id}`).used : s.upgrades[id] !== false) return false;
      }
    }
    if (level.exploration) {
      if (s.healthBonus !== (savedItem('health-expansion').collected ? 25 : 0)) return false;
    }
    for (const object of level.interactables) {
      if (savedFeature(object.id).used && !meets(object.requires)) return false;
      if (object.type === 'shutter-switch' && savedFeature(object.id).used !== object.doorIds.every(id => savedDoor(id).open)) return false;
    }
    for (const item of level.pickups) if (savedItem(item.id).collected && !meets(item.requires)) return false;
    for (const door of level.doors) {
      if (door.paired && savedDoor(door.id).open !== savedDoor(door.paired).open) return false;
      if (door.controlledBy && savedDoor(door.id).open !== savedFeature(door.controlledBy).used) return false;
      if (!savedDoor(door.id).open) continue;
      if (!meets(door.requires)) return false;
    }
    if (savedFeature('extraction').used && (!p.key || !s.power || !relaysReady)) return false;
    // A resumable player must fit on the floor and outside any closed door.
    for (const [dx, dz] of [[-.22, -.22], [-.22, .22], [.22, -.22], [.22, .22]]) {
      const cx = Math.floor(p.x + dx), cz = Math.floor(p.z + dz);
      if (level.grid[cz]?.[cx] === '#' || s.doors.some(d => !d.open && Math.floor(level.doors.find(base => base.id === d.id).x) === cx && Math.floor(level.doors.find(base => base.id === d.id).z) === cz)) return false;
    }
    if (!Array.isArray(s.enemies) || s.enemies.length !== level.enemies.length || new Set(s.enemies.map(e => e?.id)).size !== level.enemies.length) return false;
    for (const base of level.enemies) {
      const e = s.enemies.find(v => v?.id === base.id);
      if (!e || !finite(e.x, 1, level.width - 1) || !finite(e.z, 1, level.height - 1) || level.grid[Math.floor(e.z)][Math.floor(e.x)] === '#' || !finite(e.health, 0, 1000) || typeof e.alive !== 'boolean' || typeof e.active !== 'boolean') return false;
      if (e.alive !== (e.health > 0) || !this._validEncounterSnapshot(e, base, level)) return false;
      const radius = base.type === 'brute' ? .28 : .2;
      if (e.alive && s.doors.some(door => {
        const geometry = level.doors.find(item => item.id === door.id);
        return !door.open && Math.abs(e.x - geometry.x) < .5 + radius && Math.abs(e.z - geometry.z) < .5 + radius;
      })) return false;
    }
    if (s.serial !== undefined && (!Number.isSafeInteger(s.serial) || !finite(s.serial, 0, 10000000))) return false;
    if (s.projectiles !== undefined) {
      if (!Array.isArray(s.projectiles) || s.projectiles.length > 8 || new Set(s.projectiles.map(shot => shot?.id)).size !== s.projectiles.length) return false;
      for (const shot of s.projectiles) {
        if (!shot || typeof shot !== 'object' || !/^grenade-[1-9][0-9]{0,7}$/.test(shot.id) || Number(shot.id.slice(8)) > 10000000 || shot.type !== 'grenade'
          || shot.ownerId !== 'player' || shot.ownerKind !== 'player' || !p.hasGrenade || !finite(shot.life, .000001, WEAPONS.grenade.fuse)
          || shot.fuse !== WEAPONS.grenade.fuse || !Number.isInteger(shot.bounces) || !finite(shot.bounces, 0, 4)
          || !finite(shot.x, 1, level.width - 1) || !finite(shot.z, 1, level.height - 1)
          || !finite(shot.dx, -WEAPONS.grenade.projectileSpeed, WEAPONS.grenade.projectileSpeed)
          || !finite(shot.dz, -WEAPONS.grenade.projectileSpeed, WEAPONS.grenade.projectileSpeed)
          || Math.hypot(shot.dx, shot.dz) > WEAPONS.grenade.projectileSpeed + .000001) return false;
        const cx = Math.floor(shot.x), cz = Math.floor(shot.z);
        if (level.grid[cz][cx] === '#' || s.doors.some(door => !door.open && Math.floor(level.doors.find(base => base.id === door.id).x) === cx && Math.floor(level.doors.find(base => base.id === door.id).z) === cz)) return false;
      }
    }
    return true;
  }

  _stateFromSnapshot(s, level = this.level, difficulty = this._difficulty) {
    const p = s.player;
    const next = { player: { x: p.x, z: p.z, angle: p.angle, health: p.health, armor: p.armor,
      ammo: Object.fromEntries(Object.values(WEAPONS).map(weapon => [weapon.ammoKey, Math.floor(p.ammo[weapon.ammoKey] || 0)])),
      weapon: p.weapon, key: p.key, hasShotgun: p.hasShotgun, hasArc: p.hasArc === true, hasRicochet: p.hasRicochet === true, hasGrenade: p.hasGrenade === true } };
    if (level.upgradeNames) next.upgrades = copy(s.upgrades);
    if (level.exploration) { next.healthBonus = s.healthBonus; next.player.maxHealth = 100 + s.healthBonus; }
    next.enemies = level.enemies.map(base => {
      const e = s.enemies.find(v => v.id === base.id);
      const encounter = this._encounterDefaults(base);
      for (const key of ['provoked', 'killedByPlayer', 'telegraph', 'blinkCooldown', 'bossPhase', 'phaseTimer', 'bossCycle', 'chargeAngle', 'chargeHit', 'chargeTargetId', 'chargeTargetKind', 'stunTimer', 'encounterAwake', 'shieldPhase', 'shieldTimer', 'healCooldown']) {
        if (e[key] !== undefined) encounter[key] = copy(e[key]);
      }
      return { ...base, ...encounter, x: e.x, z: e.z, health: e.health, maxHealth: Math.round(base.maxHealth * difficulty.health), alive: e.alive, active: e.active, angle: finite(e.angle, -1000, 1000) ? e.angle : 0, attackCooldown: e.attackCooldown ?? .8, hitTimer: 0 };
    });
    next.pickups = level.pickups.map(base => ({ ...base, collected: s.pickups.find(v => v.id === base.id).collected }));
    next.doors = level.doors.map(base => ({ ...base, open: s.doors.find(v => v.id === base.id).open }));
    next.interactables = level.interactables.map(base => ({ ...base, used: s.interactables.find(v => v.id === base.id).used }));
    for (const key of ['power', 'secretFound', 'time', 'kills', 'shots', 'hits']) next[key] = s[key];
    next.tutorial = Object.fromEntries(['moved', 'fired', 'interacted', 'weaponSwitched'].map(k => [k, s.tutorial?.[k] === true]));
    next.effects = []; next.projectiles = copy(s.projectiles || []); next.status = 'paused'; next.checkpoint = false;
    if (next.interactables.find(i => i.type === 'exit').used) next.status = 'won';
    return next;
  }

  _resetAfterRestore(s) {
    this._random = s.randomState >>> 0; this._shotCooldown = 0; this._pathTimer = 0; this._distances = null;
    this._reserveTimer = 0; this._messageCooldown = 0;
    this._serial = Math.max(s.serial || 0, ...((s.projectiles || []).map(shot => Number(shot.id.split('-').at(-1)))));
  }

  restore(data) {
    try {
      // Resolve and construct everything before changing the active mission.
      const saved = copy(data);
      const level = Object.values(LEVELS).find(candidate => candidate.id === saved?.levelId);
      if (!saved || saved.version !== 1 || !level || !Object.hasOwn(DIFFICULTY, saved.options?.difficulty) || saved.options.mission !== undefined && saved.options.mission !== level.missionId) return false;
      if (!this._validSnapshot(saved.state, level)) return false;
      if (saved.checkpoint && (!this._validSnapshot(saved.checkpoint, level) || !saved.checkpoint.power || !saved.state.power || saved.checkpoint.time > saved.state.time || saved.checkpoint.interactables.some(i => i.used && level.interactables.find(base => base.id === i.id).type !== 'shutter-switch' && !saved.state.interactables.find(current => current.id === i.id).used))) return false;
      if (level.exploration && saved.checkpoint && (saved.checkpoint.healthBonus > saved.state.healthBonus || saved.checkpoint.doors.some(d => d.open && !saved.state.doors.find(current => current.id === d.id).open) || saved.checkpoint.pickups.some(p => p.collected && ['access-key', 'health-expansion'].includes(p.id) && !saved.state.pickups.find(current => current.id === p.id).collected))) return false;
      const difficulty = DIFFICULTY[saved.options.difficulty];
      const nextState = this._stateFromSnapshot(saved.state, level, difficulty);
      const checkpoint = saved.checkpoint ? copy(saved.checkpoint) : null;
      const seed = (Number(saved.options.seed) >>> 0) || 1;
      nextState.checkpoint = Boolean(checkpoint);
      this.level = level;
      this.options = { ...this.options, mission: level.missionId, difficulty: saved.options.difficulty, seed };
      this._runDifficulty = saved.options.difficulty; this._runSeed = seed; this._difficulty = difficulty;
      this.state = nextState; this._checkpoint = checkpoint;
      this._resetAfterRestore(saved.state);
      this._events = [{ type: 'message', text: 'Mission restored. Resume when ready.' }];
      return true;
    } catch { return false; }
  }

  restartCheckpoint() {
    if (!this._checkpoint || !this._validSnapshot(this._checkpoint)) return false;
    this.state = this._stateFromSnapshot(this._checkpoint); this._resetAfterRestore(this._checkpoint); this.state.checkpoint = true;
    this.state.status = 'playing'; this._events = [{ type: 'message', text: this.level.missionId === 'glasshouse-17' ? 'Glasshouse checkpoint restored.' : this.level.missionId === 'switchyard-15' ? 'Switchyard checkpoint restored.' : this.level.exploration ? 'Underworks refuge restored. Acquired upgrades and opened routes remain available.' : this.level.missionId === 'crosslink-11' ? 'Crosslink checkpoint restored.' : this.level.missionId === 'relay-09' ? 'Dead Relay checkpoint restored.' : 'Generator checkpoint restored.' }];
    return true;
  }
}
