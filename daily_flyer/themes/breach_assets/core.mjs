// BREACH — original browser-local simulation. No DOM or graphics dependencies.
import { UNDERWORKS } from './underworks.mjs';
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

export const LEVELS = { 'blacksite-07': LEVEL, 'relay-09': createRelayLevel(), 'crosslink-11': createCrosslinkLevel(), 'underworks-13': UNDERWORKS };
export const MISSIONS = [
  { id: 'blacksite-07', levelId: LEVEL.id, name: 'Blacksite 07', number: '001', subtitle: 'The first breach', briefing: 'Emergency power is down. Enter the research facility, recover its security key, and reach extraction.', steps: ['Restore auxiliary power', 'Recover the security key', 'Reach extraction'] },
  { id: 'relay-09', levelId: LEVELS['relay-09'].id, name: 'Dead Relay', number: '002', subtitle: 'Bring the signal back', briefing: 'A silent communications station surrounds a sealed vault. Restore ring power, reconnect both relays, and recover the key to the extraction uplink.', steps: ['Restore ring power', 'Activate both relay consoles', 'Recover the vault key', 'Transmit the extraction signal'] },
  { id: 'crosslink-11', levelId: LEVELS['crosslink-11'].id, name: 'Crosslink', number: '003', subtitle: 'Two relays. One way out.', briefing: 'A compact relay facility has lost its uplink. Restore hub power, activate the western and eastern relays, and recover the vault key for extraction. Play solo or cover a teammate in a private co-op room.', steps: ['Restore hub power', 'Activate both relay consoles', 'Recover the vault key', 'Signal extraction'] },
  { id: 'underworks-13', levelId: UNDERWORKS.id, name: 'The Underworks', number: '004', subtitle: 'An entire world beneath the breach', briefing: 'Explore nine connected sectors below the arrival lift. Recover the cutter, insulator and phase module to open new routes through familiar territory. Restore two distant relays, defeat the reactor guardian and bring its key back to the lift. Refuges and activated transit stations support the journey, solo or together.', steps: ['Restore central power', 'Recover three permanent upgrades', 'Reconnect both crown relays', 'Defeat the reactor guardian', 'Return to the arrival lift'] },
];
export function getLevel(missionId = 'blacksite-07') { return Object.hasOwn(LEVELS, missionId) ? LEVELS[missionId] : LEVEL; }

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
      player: { ...copy(this.level.spawn), health: 100, armor: 20, ammo: { pistol: 40, shells: 0 }, weapon: 'pistol', hasShotgun: false, key: false },
      enemies: this.level.enemies.map(e => ({ ...e, ...this._encounterDefaults(e), health: Math.round(e.health * this._difficulty.health), maxHealth: Math.round(e.maxHealth * this._difficulty.health), active: false, angle: Math.PI, attackCooldown: 1, hitTimer: 0, pathTimer: 0 })),
      pickups: this.level.pickups.map(p => ({ ...p, collected: false })),
      doors: copy(this.level.doors), interactables: this.level.interactables.map(i => ({ ...i, used: false })),
      projectiles: [], effects: [], power: false, secretFound: false,
      checkpoint: false, time: 0, kills: 0, shots: 0, hits: 0,
      tutorial: { moved: false, fired: false, interacted: false, weaponSwitched: false },
    };
    if (this.level.exploration) {
      this.state.upgrades = { cutter: false, insulator: false, phase: false };
      this.state.healthBonus = 0;
      this.state.player.maxHealth = 100;
    }
  }

  start() {
    if (this.state.status === 'ready') {
      this.state.status = 'playing';
      this._events.push({ type: 'message', text: this.level.exploration ? 'The Underworks. Activate the lift transit, then find power in the central exchange.' : this.level.missionId === 'crosslink-11' ? 'Crosslink. Restore hub power and reconnect both relays.' : this.level.missionId === 'relay-09' ? 'Dead Relay. Restore power to the communications ring.' : 'Blacksite 07. Find the auxiliary generator.' });
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
      provoked: false, killedByPlayer: false, telegraph: null,
      ...(enemy.type === 'stalker' ? { blinkCooldown: 2.4 } : {}),
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
      if (item.type === 'health') { p.health = Math.min(this._maxHealth(p), p.health + item.amount); text = `Health restored`; }
      if (item.type === 'armor') { p.armor = Math.min(100, p.armor + item.amount); text = `Armor reinforced`; }
      if (item.type === 'shotgun') { p.hasShotgun = true; p.weapon = 'shotgun'; p.ammo.shells += item.amount; text = 'Scattergun acquired. Devastating at close range.'; }
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
    const ammo = weapon === 'shotgun' ? 'shells' : 'pistol';
    if (p.ammo[ammo] <= 0) {
      this._shotCooldown = .25;
      if (this._messageCooldown <= 0) {
        this._events.push({ type: 'message', text: weapon === 'shotgun' ? 'No shells. Switch to your pistol.' : 'Cell empty. One emergency round recharges shortly.' });
        this._messageCooldown = 2;
      }
      return;
    }
    p.ammo[ammo]--; this.state.shots++; this.state.tutorial.fired = true;
    this._shotCooldown = weapon === 'shotgun' ? .72 : .27;
    let aim = p.angle;
    if (this.options.aimAssist) {
      const target = this.state.enemies.filter(e => this.isHostileToPlayer(e) && distance(p, e) < 16 && this.hasLineOfSight(p.x, p.z, e.x, e.z))
        .map(e => ({ enemy: e, angle: Math.atan2(e.x - p.x, -(e.z - p.z)) }))
        .filter(e => Math.abs(angleDelta(e.angle, aim)) < .12)
        .sort((a, b) => Math.abs(angleDelta(a.angle, aim)) - Math.abs(angleDelta(b.angle, aim)))[0];
      if (target) aim = target.angle;
    }
    const hits = new Map();
    const pellets = weapon === 'shotgun' ? 7 : 1;
    for (let n = 0; n < pellets; n++) {
      const shotAngle = aim + (weapon === 'shotgun' ? (n - 3) * .026 + (this._rng() - .5) * .012 : 0);
      let closest = null, closestDistance = weapon === 'shotgun' ? 13 : 23;
      for (const e of this.state.enemies) {
        if (!e.alive) continue;
        const dx = e.x - p.x, dz = e.z - p.z;
        const along = dx * Math.sin(shotAngle) - dz * Math.cos(shotAngle);
        const across = Math.abs(dx * Math.cos(shotAngle) + dz * Math.sin(shotAngle));
        const radius = e.type === 'brute' ? .4 : .28;
        if (along > 0 && along < closestDistance && across < radius && this.hasLineOfSight(p.x, p.z, e.x, e.z)) {
          closest = e; closestDistance = along;
        }
      }
      if (closest) hits.set(closest, (hits.get(closest) || 0) + (weapon === 'shotgun' ? 14 : 24));
    }
    this._events.push({ type: 'shot', weapon, hit: hits.size > 0 });
    if (hits.size) this.state.hits++;
    for (const [enemy, damage] of hits) this._damageEnemy(enemy, damage, 'player');
    for (const enemy of this.state.enemies) if (this.isHostileToPlayer(enemy) && distance(p, enemy) < 7) enemy.active = true;
  }

  _damageEnemy(enemy, amount, source) {
    if (!enemy?.alive || !(amount > 0)) return;
    const playerHit = source === 'player';
    // The guardian's plates open while its core cools. The visible recovery
    // window is a better shot than firing continuously into the armor.
    const damage = Math.max(1, Math.round(amount * (enemy.guardian ? enemy.bossPhase === 'recover' ? 1.6 : .65 : 1)));
    enemy.health = Math.max(0, enemy.health - damage); enemy.active = true; enemy.hitTimer = .13;
    if (playerHit && enemy.faction === 'security' && !enemy.provoked) {
      enemy.provoked = true; enemy.telegraph = null; enemy.attackCooldown = Math.max(enemy.attackCooldown, .8);
      this._events.push({ type: 'provoked', id: enemy.id, x: enemy.x, z: enemy.z });
    }
    // A clean hit interrupts a phase shift before the creature disappears.
    if (enemy.type === 'stalker' && enemy.telegraph?.kind === 'blink') {
      enemy.telegraph = null; enemy.blinkCooldown = 3;
    }
    this._events.push({ type: playerHit ? 'hit' : 'enemy-hit', id: enemy.id, x: enemy.x, z: enemy.z, damage, sourceId: playerHit ? 'player' : source?.id });
    this.state.effects.push({ id: `hit-${++this._serial}`, type: 'hit', x: enemy.x, z: enemy.z, life: .22 });
    if (enemy.health === 0) {
      enemy.alive = false; enemy.killedByPlayer = playerHit; enemy.telegraph = null;
      if (enemy.guardian) { enemy.bossPhase = 'stalk'; enemy.phaseTimer = 0; enemy.chargeTargetId = null; enemy.chargeTargetKind = null; }
      if (playerHit) this.state.kills++;
      this._events.push({ type: playerHit ? 'kill' : 'enemy-kill', id: enemy.id, enemyType: enemy.type, x: enemy.x, z: enemy.z, sourceId: playerHit ? 'player' : source?.id });
      if (enemy.guardian) this._syncPermanentProgress();
    }
  }

  switchWeapon() {
    if (!this.state.player.hasShotgun) {
      this._events.push({ type: 'message', text: 'Find the scattergun in the generator room.' }); return;
    }
    this.state.player.weapon = this.state.player.weapon === 'pistol' ? 'shotgun' : 'pistol';
    this.state.tutorial.weaponSwitched = true;
    this._shotCooldown = Math.max(this._shotCooldown, .15);
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
    enemy.angle = Math.atan2(target.x - enemy.x, -(target.z - enemy.z));
    if (enemy.guardian && this._updateGuardian(enemy, dt, target, visible)) return;
    if (enemy.type === 'stalker' && this._updateStalker(enemy, dt, target, visible)) return;
    if (enemy.type === 'sentry' && this._updateSentry(enemy, dt, target, visible)) return;
    if (!enemy.guardian && enemy.type !== 'sentry' && d < .8 && visible && enemy.attackCooldown === 0) {
      this._hurtTarget(target, enemy.type === 'brute' ? 23 : enemy.type === 'stalker' ? 15 : enemy.type === 'runner' ? 10 : 8, enemy);
      enemy.attackCooldown = enemy.type === 'brute' ? 1.15 : .85;
    } else if (enemy.type === 'spitter' && d > 1.4 && d < 10 && visible && enemy.attackCooldown === 0) {
      if (target === player) {
        const speed = 4.1;
        this.state.projectiles.push({ id: `p-${++this._serial}`, x: enemy.x, z: enemy.z, dx: (target.x - enemy.x) / d * speed,
          dz: (target.z - enemy.z) / d * speed, life: 4, type: 'plasma' });
      } else {
        this._damageEnemy(target, 15, enemy);
        this.state.effects.push({ id: `beam-${++this._serial}`, type: 'beam', x: enemy.x, z: enemy.z,
          targetX: target.x, targetZ: target.z, life: .16, faction: 'infestation' });
      }
      enemy.attackCooldown = 1.65 + this._rng() * .45;
    }
    if (d <= .65 || enemy.hitTimer > 0) return;
    if ((enemy.type === 'spitter' || enemy.type === 'sentry') && visible && d < 6.5) {
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
    const speed = (enemy.type === 'runner' ? 1.35 : enemy.type === 'stalker' ? 1.65 : enemy.type === 'brute' ? .69 : .85) * this._difficulty.speed;
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
      shot.life -= dt;
      let removed = shot.life <= 0;
      const steps = Math.max(1, Math.ceil(Math.hypot(shot.dx, shot.dz) * dt / .12));
      for (let n = 0; n < steps && !removed; n++) {
        const previousX = shot.x, previousZ = shot.z;
        shot.x += shot.dx * dt / steps; shot.z += shot.dz * dt / steps;
        if (!this.hasLineOfSight(previousX, previousZ, shot.x, shot.z)) removed = true;
        else if (distance(shot, this.state.player) < .32 && this.hasLineOfSight(shot.x, shot.z, this.state.player.x, this.state.player.z)) { this._hurt(15, shot); removed = true; }
      }
      if (!removed) survivors.push(shot);
    }
    this.state.projectiles = survivors;
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
      if (object.used && !object.repeatable || object.open || object.paired) continue;
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

  canOpenDoor(door) { return Boolean(door && (door.open || this._requirementMet(door.requires))); }
  canTraverseDoor(door) { return Boolean(door && (door.open || !door.secret && this.canOpenDoor(door))); }

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
    this.state.projectiles = []; this.state.effects = [];
  }

  _syncPermanentProgress() {
    if (!this.level.exploration || !this._checkpoint) return;
    // Keep capabilities, routes and discoveries on checkpoint retry while the
    // checkpoint continues to own respawn positions and consumable supplies.
    const saved = this._checkpoint.state || this._checkpoint;
    saved.upgrades = copy(this.state.upgrades); saved.healthBonus = this.state.healthBonus;
    saved.power = this.state.power; saved.secretFound = this.state.secretFound;
    for (const door of saved.doors) door.open ||= this.state.doors.find(current => current.id === door.id).open;
    for (const object of saved.interactables) {
      const current = this.state.interactables.find(i => i.id === object.id);
      if (current.type !== 'exit') object.used ||= current.used;
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
    if (o.type === 'upgrade') {
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
      this._events.push({ type: 'power' }, { type: 'message', text: this.level.exploration ? 'Central power restored. Find the industrial cutter in the western foundry.' : this.level.missionId === 'crosslink-11' ? 'Hub power restored. Activate the western and eastern relay consoles.' : this.level.missionId === 'relay-09' ? 'Ring power restored. Activate the western and eastern relay consoles.' : 'Power restored. Airlocks online. Find the security key.' });
      this._saveCheckpoint(this.level.exploration ? 'Checkpoint saved at the central exchange.' : this.level.missionId === 'crosslink-11' ? 'Checkpoint saved at the power hub.' : 'Checkpoint saved at the generator.');
    } else if (o.type === 'relay') {
      o.used = true;
      const progress = this.getMissionProgress();
      const text = progress.relaysUsed === progress.relaysTotal ? this.level.exploration ? 'Both crown relays online. Open reactor containment and defeat its guardian.' : 'Both relays online. The communications vault can now be opened.' : `${o.id === 'relay-west' ? 'Western' : 'Eastern'} relay online. Activate the other relay to unlock ${this.level.exploration ? 'reactor containment' : 'the vault'}.`;
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
    for (const door of this.state.doors) if (!door.paired) markers.push({ id: door.id, type: door.secret ? 'cache' : ['grille', 'hazard', 'phase', 'shortcut'].includes(door.kind) ? door.kind : 'gate', label: door.label || 'Airlock', x: door.x, z: door.z, active: door.open, requires: door.requires || null, locked: !this.canOpenDoor(door) });
    for (const item of this.state.pickups) if (['key', 'healthExpansion'].includes(item.type)) markers.push({ id: item.id, type: item.type === 'key' ? 'key' : 'cache', label: item.type === 'key' ? 'Security key' : 'Medical expansion · +25 maximum health', x: item.x, z: item.z, active: item.collected, requires: item.requires || null, locked: !this._requirementMet(item.requires) });
    const guardian = this.state.enemies.find(e => e.id === this.level.guardianId);
    if (guardian) markers.push({ id: guardian.id, type: 'guardian', label: 'Reactor guardian', x: guardian.x, z: guardian.z, active: !guardian.alive, requires: 'relays', locked: !this._requirementMet('relays') });
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
      pickups: this.state.pickups.map(p => ({ id: p.id, collected: p.collected })),
      doors: this.state.doors.map(d => ({ id: d.id, open: d.open })),
      interactables: this.state.interactables.map(i => ({ id: i.id, used: i.used })),
      power: this.state.power, secretFound: this.state.secretFound,
      time: this.state.time, kills: this.state.kills, shots: this.state.shots, hits: this.state.hits,
      tutorial: copy(this.state.tutorial), randomState: this._random,
      ...(this.level.exploration ? { upgrades: copy(this.state.upgrades), healthBonus: this.state.healthBonus } : {}),
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
    for (const flag of ['provoked', 'killedByPlayer', 'chargeHit']) if (enemy[flag] !== undefined && typeof enemy[flag] !== 'boolean') return false;
    for (const timer of ['blinkCooldown', 'phaseTimer', 'attackCooldown']) if (enemy[timer] !== undefined && !finite(enemy[timer], 0, 30)) return false;
    if (enemy.bossPhase !== undefined && (!base.guardian || !['stalk', 'charge-windup', 'charge', 'volley-windup', 'recover'].includes(enemy.bossPhase))) return false;
    if (enemy.bossCycle !== undefined && (!Number.isSafeInteger(enemy.bossCycle) || enemy.bossCycle < 0 || enemy.bossCycle > 1000000)) return false;
    if (enemy.chargeAngle !== undefined && !finite(enemy.chargeAngle, -Math.PI, Math.PI)) return false;
    if (enemy.chargeTargetKind !== undefined && enemy.chargeTargetKind !== null && (!base.guardian || !['player', 'enemy'].includes(enemy.chargeTargetKind) || !enemy.chargeTargetId)) return false;
    if (enemy.chargeTargetId !== undefined && enemy.chargeTargetId !== null && (!base.guardian || !validTarget(enemy.chargeTargetId, enemy.chargeTargetKind))) return false;
    const mark = enemy.telegraph;
    if (mark === undefined || mark === null) return !['charge-windup', 'volley-windup'].includes(enemy.bossPhase);
    if (!mark || typeof mark !== 'object' || Array.isArray(mark) || !['blink', 'charge', 'volley', 'shot'].includes(mark.kind)) return false;
    if (mark.kind === 'blink' && base.type !== 'stalker' || mark.kind === 'shot' && base.type !== 'sentry'
      || ['charge', 'volley'].includes(mark.kind) && !base.guardian) return false;
    for (const [key, bound] of [['x', level.width], ['z', level.height], ['fromX', level.width], ['fromZ', level.height]]) if (!finite(mark[key], 1, bound - 1)) return false;
    if (level.grid[Math.floor(mark.z)][Math.floor(mark.x)] === '#' || !finite(mark.radius, .1, 3)
      || !finite(mark.duration, .1, 3) || !finite(mark.remaining, 0, mark.duration)) return false;
    if (mark.targetKind !== undefined && (!['player', 'enemy'].includes(mark.targetKind) || !mark.targetId)) return false;
    if (mark.targetId !== undefined && !validTarget(mark.targetId, mark.targetKind)) return false;
    return true;
  }

  _validSnapshot(s, level = this.level) {
    if (!s || typeof s !== 'object') return false;
    if (level.exploration && (!s.upgrades || typeof s.upgrades !== 'object' || Array.isArray(s.upgrades) || Object.keys(s.upgrades).length !== 3 || !['cutter', 'insulator', 'phase'].every(id => typeof s.upgrades[id] === 'boolean') || ![0, 25].includes(s.healthBonus))) return false;
    const p = s.player;
    const maxHealth = level.exploration ? 100 + s.healthBonus : 100;
    if (!p || !finite(p.x, 1, level.width - 1) || !finite(p.z, 1, level.height - 1) || !finite(p.angle, -1000, 1000) || !finite(p.health, 1, maxHealth) || !finite(p.armor, 0, 100) || level.exploration && p.maxHealth !== maxHealth) return false;
    if (level.grid[Math.floor(p.z)][Math.floor(p.x)] === '#') return false;
    if (!p.ammo || !finite(p.ammo.pistol, 0, 10000) || !finite(p.ammo.shells, 0, 10000) || !['pistol', 'shotgun'].includes(p.weapon) || typeof p.key !== 'boolean' || typeof p.hasShotgun !== 'boolean' || p.weapon === 'shotgun' && !p.hasShotgun) return false;
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
    if (s.secretFound !== savedFeature('cache-panel').used || s.secretFound !== savedDoor('maintenance').open) return false;
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
    if (level.exploration) {
      if (s.healthBonus !== (savedItem('health-expansion').collected ? 25 : 0)) return false;
      for (const id of ['cutter', 'insulator', 'phase']) if (s.upgrades[id] !== savedFeature(`upgrade-${id}`).used) return false;
    }
    for (const object of level.interactables) if (savedFeature(object.id).used && !meets(object.requires)) return false;
    for (const item of level.pickups) if (savedItem(item.id).collected && !meets(item.requires)) return false;
    for (const door of level.doors) {
      if (door.paired && savedDoor(door.id).open !== savedDoor(door.paired).open) return false;
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
    }
    return true;
  }

  _stateFromSnapshot(s, level = this.level, difficulty = this._difficulty) {
    const p = s.player;
    const next = { player: { x: p.x, z: p.z, angle: p.angle, health: p.health, armor: p.armor, ammo: { pistol: Math.floor(p.ammo.pistol), shells: Math.floor(p.ammo.shells) }, weapon: p.weapon, key: p.key, hasShotgun: p.hasShotgun } };
    if (level.exploration) { next.upgrades = copy(s.upgrades); next.healthBonus = s.healthBonus; next.player.maxHealth = 100 + s.healthBonus; }
    next.enemies = level.enemies.map(base => {
      const e = s.enemies.find(v => v.id === base.id);
      const encounter = this._encounterDefaults(base);
      for (const key of ['provoked', 'killedByPlayer', 'telegraph', 'blinkCooldown', 'bossPhase', 'phaseTimer', 'bossCycle', 'chargeAngle', 'chargeHit', 'chargeTargetId', 'chargeTargetKind']) {
        if (e[key] !== undefined) encounter[key] = copy(e[key]);
      }
      return { ...base, ...encounter, x: e.x, z: e.z, health: e.health, maxHealth: Math.round(base.maxHealth * difficulty.health), alive: e.alive, active: e.active, angle: finite(e.angle, -1000, 1000) ? e.angle : 0, attackCooldown: e.attackCooldown ?? .8, hitTimer: 0 };
    });
    next.pickups = level.pickups.map(base => ({ ...base, collected: s.pickups.find(v => v.id === base.id).collected }));
    next.doors = level.doors.map(base => ({ ...base, open: s.doors.find(v => v.id === base.id).open }));
    next.interactables = level.interactables.map(base => ({ ...base, used: s.interactables.find(v => v.id === base.id).used }));
    for (const key of ['power', 'secretFound', 'time', 'kills', 'shots', 'hits']) next[key] = s[key];
    next.tutorial = Object.fromEntries(['moved', 'fired', 'interacted', 'weaponSwitched'].map(k => [k, s.tutorial?.[k] === true]));
    next.effects = []; next.projectiles = []; next.status = 'paused'; next.checkpoint = false;
    if (level.exploration && next.interactables.find(i => i.type === 'exit').used) next.status = 'won';
    return next;
  }

  _resetAfterRestore(s) {
    this._random = s.randomState >>> 0; this._shotCooldown = 0; this._pathTimer = 0; this._distances = null;
    this._reserveTimer = 0; this._messageCooldown = 0; this._serial = 0;
  }

  restore(data) {
    try {
      // Resolve and construct everything before changing the active mission.
      const saved = copy(data);
      const level = Object.values(LEVELS).find(candidate => candidate.id === saved?.levelId);
      if (!saved || saved.version !== 1 || !level || !Object.hasOwn(DIFFICULTY, saved.options?.difficulty) || saved.options.mission !== undefined && saved.options.mission !== level.missionId) return false;
      if (!this._validSnapshot(saved.state, level)) return false;
      if (saved.checkpoint && (!this._validSnapshot(saved.checkpoint, level) || !saved.checkpoint.power || !saved.state.power || saved.checkpoint.time > saved.state.time || saved.checkpoint.interactables.some(i => i.used && !saved.state.interactables.find(current => current.id === i.id).used))) return false;
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
    this.state.status = 'playing'; this._events = [{ type: 'message', text: this.level.exploration ? 'Underworks refuge restored. Acquired upgrades and opened routes remain available.' : this.level.missionId === 'crosslink-11' ? 'Crosslink checkpoint restored.' : this.level.missionId === 'relay-09' ? 'Dead Relay checkpoint restored.' : 'Generator checkpoint restored.' }];
    return true;
  }
}
