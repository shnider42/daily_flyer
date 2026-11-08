/**
 * COORDINATION root + galaxy_story — CONTENT ENCOUNTERS ARE THE UI PATH.
 * Canonical gates (please use exactly these in content):
 * first_shift: first_job + talked_mechanic. belt_signal: mined_six_ore + belt_signal_scanned.
 * first_fold: jumped_to_vesper.
 * listening_house: archive_terminal_repaired AND archive_restored. Require the repair to OPEN
 * listening_archive; its choices set archive_restored. Do NOT complete chapter on repair alone.
 * three_claims: alliance_committed (all ledger_alliance choices set it).
 * witness_vault: climate_record_recovered (all buried_weather choices set it).
 * threshold: threshold_answered AND landed_earth; person mode.
 * open_sky: council_decision_made (all earth_council choices set it).
 * recordActivity('work'|'repair') in Listening sets archive_terminal_repaired only with
 * explicit repair metadata: role:'archive' or kind:'repair'. Freight does not repair relays.
 * storyAction is only a bridge to the authored choices; root should use encounters.
 * FARWAKE — DOM-free game rules. All mutation methods return {ok, reason?, ...}.
 * Game(seedOrSave); state/galaxy/system public; events are drained with drainEvents().
 * step(dt,{x,y,fire,mine,boost,brake}); interact() is a read-only proximity query.
 * dock(bodyId), launch(), travel(systemId), travelInfo(systemId), scan(signalId), salvage(id).
 * availableJobs(), acceptJob(id), progressJob(type,amount,{token,role}), turnInJob(id).
 * Job types: delivery, mining, work, survey, bounty. progressJob returns ready jobs.
 * triggerEncounter(id?) / beginEncounter(id?) returns {ok,encounter}; applyChoice(id,index).
 * buyUpgrade(id), service('repair'|'refuel'|'sell'|'rest'|'emergency'), serviceQuote(action).
 * recordActivity(type,details) records authored person work/talk/exploration milestones.
 * serialize() => JSON string; save() => object; Game.fromSave(string|object).
 * Authored content lives in content.mjs. No DOM, timers, fetch, or rendering dependencies.
 */
import { FACTIONS, NAMED_SYSTEMS, ENCOUNTERS, STORY_CHAPTERS, UPGRADES, LORE } from './content.mjs';

export const SAVE_VERSION = 3;
export const WORLD_RADIUS = 2700;
export const TAU = Math.PI * 2;
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// Swept collision prevents fast pulses crossing a target between simulation frames.
const segmentDistance = (point, x, y, endX, endY) => {
  const dx=endX-x, dy=endY-y, length2=dx*dx+dy*dy;
  const t=length2 ? clamp(((point.x-x)*dx+(point.y-y)*dy)/length2,0,1) : 0;
  return Math.hypot(point.x-(x+dx*t),point.y-(y+dy*t));
};
const clone = x => JSON.parse(JSON.stringify(x));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const unique = list => [...new Set(Array.isArray(list) ? list : [])];
const factionIds = () => FACTIONS.map(x => x.id);
const hash = input => {
  let n = 2166136261;
  for (const c of String(input)) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
};
export function seededRandom(seed) {
  let n = typeof seed === 'number' ? seed >>> 0 : hash(seed);
  return () => {
    n = (n + 0x6D2B79F5) >>> 0;
    let t = n;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const pick = (r, array) => array[Math.floor(r() * array.length)];
const normId = id => String(id).toLowerCase().replace(/[^a-z0-9]/g, '');
const BIO = ['arid', 'ice', 'forest', 'ocean', 'volcanic', 'barren', 'desert'];
const PREFIX = ['Aster', 'Vela', 'Sable', 'Cairn', 'Nacre', 'Lumen', 'Orin', 'Dusk', 'Vesper', 'Mica', 'Thorn', 'Ember', 'Aure', 'Hollow', 'Rill', 'Pale', 'Cobalt', 'Drift', 'Serein', 'Fallow'];
const SUFFIX = ['Reach', 'Rest', 'Crossing', 'Veil', 'Anchor', 'Crown', 'Drift', 'Basin', 'Wake', 'Trace', 'March', 'Shoal', 'Haven', 'Spur', 'Depths', 'Fall'];

/** A fixed connected lattice with authored places layered into it. */
export function buildGalaxy(seed = 'farwake') {
  const r = seededRandom(`${seed}:galaxy`);
  const named = NAMED_SYSTEMS.map((s, i) => ({ ...clone(s), gx: finite(s.gx, i * 3), gy: finite(s.gy), authored: true, index: i }));
  const systems = [...named];
  for (let row = 0; row < 18; row++) {
    for (let col = 0; col < 16; col++) {
      const index = row * 16 + col;
      let gx = (col - 7.5) * 3.8 + (r() - 0.5) * 1.2;
      let gy = (row - 8.5) * 3.8 + (r() - 0.5) * 1.2;
      // Near-identical marks on the map are difficult to select on a phone.
      for (const fixed of named) {
        if (Math.hypot(gx - fixed.gx, gy - fixed.gy) < 1.35) { gx += 1.55; gy += 0.75; }
      }
      const faction = factionIds()[(Math.floor((gx + 32) / 13) + Math.floor((gy + 35) / 17)) % Math.max(1, FACTIONS.length)] || 'freewake';
      const danger = clamp(Math.floor(Math.hypot(gx, gy) / 10 + r() * 2), 1, 5);
      const biome = pick(r, BIO);
      const name = `${pick(r, PREFIX)} ${pick(r, SUFFIX)} ${String(index + 1).padStart(2, '0')}`;
      systems.push({
        id: `sector-${index}`, name, gx, gy, faction, biome, danger, authored: false, index: systems.length,
        description: `${name} sits on a ${danger >= 4 ? 'contested' : 'quiet'} ${faction === 'freewake' ? 'independent' : 'charted'} route. ${biome === 'ice' ? 'Ice miners work beneath the slow pulse of a pale sun.' : biome === 'ocean' ? 'Water worlds carry settlements built from the hulls of the first arrivals.' : 'Old survey beacons still transmit claims nobody has agreed to honor.'}`,
        bodies: [
          { id: `port-${index}`, name: `${name.split(' ')[0]} Exchange`, kind: 'station', biome: 'station', faction, lore: 'A station survives on the promises captains keep.' },
          { id: `world-${index}`, name: `${name.split(' ')[0]} ${['I', 'II', 'III'][index % 3]}`, kind: 'planet', biome, faction, lore: `Settlers here have made a home from ${biome === 'arid' || biome === 'desert' ? 'dust and water debts' : biome === 'ice' ? 'ice and geothermal warmth' : 'the remains of an older migration'}.` },
          ...(index % 3 === 0 ? [{ id: `moon-${index}`, name: `${name.split(' ')[0]} Minor`, kind: 'moon', biome: 'barren', faction, lore: 'A scattered mining community watches the sky for supply ships.' }] : [])
        ]
      });
    }
  }
  return systems;
}

function initialState(seed) {
  return {
    version: SAVE_VERSION, seed: String(seed || 'farwake'), mode: 'ship', systemId: 'hearth', locationId: null,
    credits: 180, cargo: { ore: 0, crystal: 0 }, rep: Object.fromEntries(factionIds().map(id => [id, 0])), flags: [],
    upgrades: {}, visited: ['hearth'], discovered: ['hearth'], missions: [], completedJobs: [], abandonedJobs: {}, journal: [], encounterHistory: [],
    crew: [], knownLore: [], completedChapters: [], pendingEncounter: null, worlds: {},
    stats: { time: 0, oreMined: 0, crystalsMined: 0, kills: 0, jobs: 0, scans: 0, salvaged: 0, jumps: 0, dockings: 0, work: 0, talks: 0, rescues: 0, distance: 0, decisions: 0 },
    ship: { x: 0, y: 142, vx: 0, vy: 0, angle: -Math.PI / 2, hull: 100, maxHull: 100, shield: 35, maxShield: 35, energy: 100, maxEnergy: 100, fuel: 22, maxFuel: 30, cargoCap: 24, speed: 255, turn: 9, damage: 16, range: 850, warpRange: 0, scanRange: 235, mining: 1 },
    person: { x: 480, y: 570, health: 100, facing: 'up' },
    rng: hash(`${seed}:runtime`), nextEncounterAt: 95, lastBodyId: 'kettle', jobSerial: 0, activityTokens: [], lastSaveAt: 0, interior: null, storyActions: []
  };
}

export class Game {
  constructor(seedOrSave = 'farwake') {
    let supplied = seedOrSave;
    if (typeof supplied === 'string' && supplied.trim().startsWith('{')) supplied = JSON.parse(supplied);
    if (supplied?.state) supplied = supplied.state;
    const isSave = supplied && typeof supplied === 'object';
    const fresh = initialState(isSave ? supplied.seed : supplied);
    this.state = isSave ? this._restore(fresh, supplied) : fresh;
    this.galaxy = buildGalaxy(this.state.seed);
    if (!this.galaxy.some(s => s.id === this.state.systemId)) this.state.systemId = 'hearth';
    this.events = [];
    this._shotTimer = 0;
    this._hitTimer = 0;
    this._mineTimer = 0;
    this._recoveryTimer = 0;
    this._runtime = null;
    this._updateStats(false);
    this._loadSystem(this.state.systemId);
    if (this.state.mode === 'person' && !this.state.interior && !this.system.bodies.some(b => b.id === this.state.locationId)) {
      this.state.mode = 'ship'; this.state.locationId = null;
    }
    if (!isSave) {
      this._log('A ship of your own', 'Kettle Station is behind you. The ship is held together by secondhand parts, but its next destination is yours. Dock to meet the people keeping Hearth alive.', 'story');
      this._flag('started');
      this._discoverNear('hearth');
    }
    this._checkChapters();
  }

  static fromSave(save) { return new Game(save); }
  get system() { return this._runtime; }
  get currentSystem() { return this.galaxy.find(s => s.id === this.state.systemId); }
  get currentBody() { return this.state.interior?.location || this.system.bodies.find(b => b.id === this.state.locationId) || null; }
  get cargoUsed() { return Math.max(0, this.state.cargo.ore) + Math.max(0, this.state.cargo.crystal); }
  get chapter() { return STORY_CHAPTERS.find(c => !this.state.completedChapters.includes(c.id)) || null; }
  get activeChapter() { return this.chapter; }
  get hasHyperdrive() { return Object.keys(this.state.upgrades).some(id => /hyperdrive|fold.?drive|lightdrive|jumpdrive|ftldrive/i.test(id)) || this.state.flags.includes('hyperdrive_installed') || this.state.ship.warpRange > 0; }

  _restore(fresh, raw) {
    const s = { ...fresh, ...clone(raw), version: SAVE_VERSION };
    s.seed = String(raw.seed || fresh.seed);
    s.mode = raw.mode === 'person' ? 'person' : 'ship';
    s.ship = { ...fresh.ship, ...(raw.ship || {}) };
    s.person = { ...fresh.person, ...(raw.person || {}) };
    s.stats = { ...fresh.stats, ...(raw.stats || {}) };
    s.cargo = { ore: Math.max(0, Math.floor(finite(raw.cargo?.ore))), crystal: Math.max(0, Math.floor(finite(raw.cargo?.crystal))) };
    s.credits = Math.max(0, Math.floor(finite(s.credits)));
    s.rep = { ...fresh.rep, ...(raw.rep || {}) };
    for (const id of factionIds()) s.rep[id] = clamp(finite(s.rep[id]), -100, 100);
    for (const name of ['flags', 'visited', 'discovered', 'completedJobs', 'encounterHistory', 'knownLore', 'completedChapters', 'activityTokens']) s[name] = unique(raw[name] || fresh[name]);
    for (const name of ['missions', 'journal', 'crew']) s[name] = Array.isArray(raw[name]) ? clone(raw[name]) : [];
    s.upgrades = raw.upgrades && typeof raw.upgrades === 'object' ? clone(raw.upgrades) : {};
    s.abandonedJobs = raw.abandonedJobs && typeof raw.abandonedJobs === 'object' && !Array.isArray(raw.abandonedJobs) ? clone(raw.abandonedJobs) : {};
    s.worlds = raw.worlds && typeof raw.worlds === 'object' ? clone(raw.worlds) : {};
    s.rng = finite(s.rng, fresh.rng) >>> 0;
    for (const name of ['x', 'y', 'vx', 'vy', 'angle', 'hull', 'shield', 'energy', 'fuel']) s.ship[name] = finite(s.ship[name], fresh.ship[name]);
    s.person.health = clamp(finite(s.person.health, 100), 1, 100);
    if (s.pendingEncounter && !ENCOUNTERS.some(e => e.id === s.pendingEncounter.id)) s.pendingEncounter = null;
    return s;
  }

  _rand() {
    this.state.rng = (this.state.rng + 0x6D2B79F5) >>> 0;
    let t = this.state.rng;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  _event(type, data = {}) { this.events.push({ type, ...data }); if (this.events.length > 80) this.events.shift(); }
  drainEvents() { return this.events.splice(0); }
  _ok(data = {}) { return { ok: true, message: data.text || '', ...data }; }
  _fail(reason, code = 'unavailable') { return { ok: false, reason, message: reason, code }; }
  _log(title, text, type = 'log') {
    this.state.journal.unshift({ id: `log-${this.state.stats.time.toFixed(2)}-${this.state.journal.length}`, title, text, type, systemId: this.state.systemId, time: Math.round(this.state.stats.time) });
    this.state.journal = this.state.journal.slice(0, 160);
  }
  _flag(flag) { if (flag && !this.state.flags.includes(flag)) this.state.flags.push(flag); }
  hasFlag(flag) { return this.state.flags.includes(flag); }
  _record() {
    return this.state.worlds[this.state.systemId] ||= { depleted: [], asteroidHealth: {}, defeated: [], enemyHealth: {}, resolved: [], scanned: [], pickups: [], spawned: [], visits: 0 };
  }
  _persistRuntime() {
    if (!this._runtime) return;
    const record = this._record();
    record.pickups = this.system.pickups.map(x => clone(x));
    record.enemyHealth ||= {};
    for (const e of this.system.enemies) if (e.hp > 0) record.enemyHealth[e.id] = e.hp;
    record.asteroidHealth ||= {};
    for (const a of this.system.asteroids) if (a.hp > 0 && a.hp < a.maxHp) record.asteroidHealth[a.id] = a.hp;
  }

  _loadSystem(id) {
    const data = this.galaxy.find(s => s.id === id) || this.galaxy[0];
    const r = seededRandom(`${this.state.seed}:${id}`);
    const record = this._record();
    for (const key of ['depleted', 'defeated', 'resolved', 'scanned', 'pickups', 'spawned']) record[key] ||= [];
    record.asteroidHealth ||= {}; record.enemyHealth ||= {};
    const bodies = data.bodies.map((b, i) => {
      const angle = -0.55 + i * 2.3;
      let x = i === 0 ? 0 : Math.cos(angle) * (780 + i * 190);
      let y = i === 0 ? 0 : Math.sin(angle) * (780 + i * 190);
      if (id === 'hearth' && b.id === 'morrow') { x = 840; y = -420; }
      return { ...clone(b), faction: b.faction || data.faction, x: finite(b.x, x), y: finite(b.y, y), radius: b.kind === 'planet' ? 122 : b.kind === 'moon' ? 76 : 70, color: FACTIONS.find(f => f.id === (b.faction || data.faction))?.color || '#5edac0' };
    });
    const asteroids = [];
    for (let i = 0; i < 46; i++) {
      const cluster = i % 4;
      const centers = [{ x: 380, y: 235 }, { x: -640, y: 660 }, { x: 1250, y: 560 }, { x: -1330, y: -880 }];
      const a = r() * TAU, radius = 70 + r() * (cluster === 0 ? 230 : 400);
      let x = centers[cluster].x + Math.cos(a) * radius;
      let y = centers[cluster].y + Math.sin(a) * radius;
      if (i === 0) { x = 240; y = 210; }
      const hp = 10 + Math.floor(r() * 13);
      const rock = { id: `${id}:rock:${i}`, x, y, radius: 13 + r() * 18, angle: r() * TAU, spin: (r() - 0.5) * 0.25, maxHp: hp, hp, ore: 1 + Math.floor(r() * 3), crystal: r() < 0.22 ? 1 : 0, seed: Math.floor(r() * 99999) };
      if (record.depleted.includes(rock.id)) rock.hp = 0;
      else if (record.asteroidHealth[rock.id] !== undefined) rock.hp = record.asteroidHealth[rock.id];
      asteroids.push(rock);
    }
    const enemies = [];
    const count = id === 'hearth' ? 2 : 1 + data.danger;
    for (let i = 0; i < count; i++) {
      const a = r() * TAU;
      const enemy = {
        id: `${id}:raider:${i}`, name: i % 2 ? 'Privateer' : 'Scrap raider', faction: 'cinder',
        x: Math.cos(a) * (id === 'hearth' ? 1600 + r() * 550 : 900 + r() * 1050),
        y: Math.sin(a) * (id === 'hearth' ? 1600 + r() * 550 : 900 + r() * 1050),
        vx: 0, vy: 0, angle: a, hp: 36 + data.danger * 10, maxHp: 36 + data.danger * 10,
        radius: 16, cooldown: 1.6 + r(), speed: 80 + data.danger * 10, damage: 5 + data.danger,
        reward: 35 + data.danger * 12, active: false
      };
      if (record.enemyHealth[enemy.id] !== undefined) enemy.hp = record.enemyHealth[enemy.id];
      if (!record.defeated.includes(enemy.id)) enemies.push(enemy);
    }
    for (const e of record.spawned) if (!record.defeated.includes(e.id)) enemies.push({ ...e, hp: record.enemyHealth[e.id] ?? e.hp });
    const signals = [];
    const tags = ['distress', 'derelict', 'anomaly', 'survey', 'beacon'];
    for (let i = 0; i < 7; i++) {
      const a = r() * TAU;
      const radius = i === 0 ? 560 : 900 + r() * 1250;
      const tag = tags[i % tags.length];
      const signal = { id: `${id}:signal:${i}`, kind: tag, name: ['Broken transmission', 'Silent freighter', 'A bend in the light', 'Old survey buoy', 'A voice in the static'][i % 5], x: Math.cos(a) * radius, y: Math.sin(a) * radius, radius: 20, resolved: record.resolved.includes(`${id}:signal:${i}`), scanned: record.scanned.includes(`${id}:signal:${i}`) };
      signals.push(signal);
    }
    if (id === 'hearth') {
      const moon = bodies.find(b => b.id === 'tinbell');
      if (moon) signals.unshift({id:'hearth:story:tinbell',kind:'story',name:'Tinbell evacuation beacon',x:moon.x+moon.radius+165,y:moon.y+85,radius:24,story:true,resolved:record.resolved.includes('hearth:story:tinbell'),scanned:record.scanned.includes('hearth:story:tinbell')});
    }
    const traffic = Array.from({ length: 4 }, (_, i) => ({ id: `${id}:traffic:${i}`, name: ['Long Weekend', 'Little Promise', 'Fifth Wind', 'Ordinary Miracle'][i], faction: data.faction, x: 450 + r() * 900, y: (r() - 0.5) * 1000, angle: r() * TAU, speed: 30 + r() * 30, radius: 12 }));
    this._runtime = { id, name: data.name, faction: data.faction, danger: data.danger, biome: data.biome, description: data.description, bodies, asteroids, enemies, bullets: [], pickups: clone(record.pickups), signals, traffic, miningTarget: null, mining: null, width: WORLD_RADIUS * 2, height: WORLD_RADIUS * 2, radius: WORLD_RADIUS };
    record.visits = (record.visits || 0) + 1;
  }

  _updateStats(heal = false) {
    const sh = this.state.ship;
    const previous = { hull: sh.maxHull || 100, shield: sh.maxShield || 35, fuel: sh.maxFuel || 30 };
    const values = { maxHull: 100, maxShield: 35, maxEnergy: 100, maxFuel: 30, cargoCap: 24, speed: 255, turn: 9, damage: 16, range: 850, warpRange: 0, scanRange: 235, mining: 1 };
    const mapping = { hull: 'maxHull', shield: 'maxShield', fuelMax: 'maxFuel', cargo: 'cargoCap', speed: 'speed', turn: 'turn', damage: 'damage', range: 'range', warpRange: 'warpRange', scanRange: 'scanRange', energy: 'maxEnergy', mining: 'mining' };
    for (const u of UPGRADES) {
      if (!this.state.upgrades[u.id]) continue;
      for (const [key, value] of Object.entries(u.stats || {})) {
        if (key === 'warpRange') values.warpRange = Math.max(values.warpRange, finite(value));
        else if (key === 'mining') values.mining = Math.max(values.mining, finite(value, 1));
        else if (mapping[key]) values[mapping[key]] += finite(value);
      }
    }
    if (Object.keys(this.state.upgrades).some(id => /hyperdrive|fold.?drive|lightdrive|jumpdrive|ftldrive/i.test(id)) && values.warpRange < 6) values.warpRange = 6;
    // Crew bonuses are small, predictable and describe their effect in the crew panel.
    for (const crew of this.state.crew || []) {
      if (crew.role === 'engineer') values.maxHull += 10;
      if (crew.role === 'navigator') values.scanRange += 45;
      if (crew.role === 'medic') values.maxEnergy += 10;
    }
    Object.assign(sh, values);
    sh.hull = clamp(sh.hull + (heal ? Math.max(0, values.maxHull - previous.hull) : 0), 1, sh.maxHull);
    sh.shield = clamp(sh.shield + (heal ? Math.max(0, values.maxShield - previous.shield) : 0), 0, sh.maxShield);
    sh.fuel = clamp(sh.fuel + (heal ? Math.max(0, values.maxFuel - previous.fuel) : 0), 0, sh.maxFuel);
    sh.energy = clamp(sh.energy, 0, sh.maxEnergy);
  }

  step(delta, input = {}) {
    const dt = clamp(finite(delta), 0, 0.1);
    if (!dt) return;
    this.state.stats.time += dt;
    this._shotTimer = Math.max(0, this._shotTimer - dt);
    this._hitTimer = Math.max(0, this._hitTimer - dt);
    this._recoveryTimer = Math.max(0, this._recoveryTimer - dt);
    const sh = this.state.ship;
    if (this.state.mode !== 'ship') {
      sh.energy = Math.min(sh.maxEnergy, sh.energy + dt * 14);
      return;
    }
    let ix = clamp(finite(input.x), -1, 1), iy = clamp(finite(input.y), -1, 1);
    let magnitude = Math.hypot(ix, iy);
    if (magnitude > 1) { ix /= magnitude; iy /= magnitude; magnitude = 1; }
    const boosting = Boolean(input.boost) && magnitude > 0.05 && sh.energy > 8;
    if (magnitude > 0.05) {
      const target = Math.atan2(iy, ix);
      const angleDelta = Math.atan2(Math.sin(target - sh.angle), Math.cos(target - sh.angle));
      sh.angle += clamp(angleDelta, -sh.turn * dt, sh.turn * dt);
      const accel = boosting ? 490 : 335;
      sh.vx += Math.cos(sh.angle) * accel * magnitude * dt;
      sh.vy += Math.sin(sh.angle) * accel * magnitude * dt;
    }
    const damping = input.brake ? 5.5 : input.flightAssist === false ? 0.035 : magnitude < 0.05 ? 1.4 : 0.6;
    sh.vx *= Math.exp(-damping * dt); sh.vy *= Math.exp(-damping * dt);
    const speed = Math.hypot(sh.vx, sh.vy);
    const maxSpeed = sh.speed * (boosting ? 1.65 : 1);
    if (speed > maxSpeed) { sh.vx *= maxSpeed / speed; sh.vy *= maxSpeed / speed; }
    sh.x += sh.vx * dt; sh.y += sh.vy * dt;
    this.state.stats.distance += Math.hypot(sh.vx, sh.vy) * dt;
    if (Math.abs(sh.x) > WORLD_RADIUS || Math.abs(sh.y) > WORLD_RADIUS) {
      sh.x = clamp(sh.x, -WORLD_RADIUS, WORLD_RADIUS); sh.y = clamp(sh.y, -WORLD_RADIUS, WORLD_RADIUS);
      sh.vx *= 0.9; sh.vy *= 0.9;
    }
    sh.energy = clamp(sh.energy + (boosting ? -18 : input.mine ? -1 : 11) * dt, 0, sh.maxEnergy);
    if (!this._hitTimer) sh.shield = Math.min(sh.maxShield, sh.shield + 4 * dt);
    if (input.fire && !this._shotTimer && sh.energy >= 3) this._fire();
    this.system.miningTarget = null;
    this.system.mining = null;
    if (input.mine) this._mine(dt);
    this._updateEnemies(dt);
    this._updateBullets(dt);
    this._updatePickups(dt);
    for (const t of this.system.traffic) {
      t.x += Math.cos(t.angle) * t.speed * dt; t.y += Math.sin(t.angle) * t.speed * dt;
      if (Math.abs(t.x) > 2300 || Math.abs(t.y) > 2300) t.angle += Math.PI;
    }
    for (const a of this.system.asteroids) a.angle += a.spin * dt;
    if (this.state.stats.time > this.state.nextEncounterAt && !this.state.pendingEncounter && !this.system.enemies.some(e => e.active && distance(e, sh) < 650)) {
      this.state.nextEncounterAt = this.state.stats.time + 100 + this._rand() * 75;
      const bodyNear = this.system.bodies.some(b => distance(b, sh) < b.radius + 220);
      if (!bodyNear && this.state.stats.distance > 1200) {
        const result = this.triggerEncounter();
        if (result.ok) this._event('encounter', { id: result.encounter.id, encounter: result.encounter });
      }
    }
    this._checkChapters();
  }

  _fire() {
    const sh = this.state.ship;
    let angle = sh.angle;
    const candidates = this.system.enemies.filter(e => e.hp > 0 && distance(e, sh) < 550).sort((a, b) => distance(a, sh) - distance(b, sh));
    for (const e of candidates) {
      const target = Math.atan2(e.y - sh.y, e.x - sh.x);
      if (Math.abs(Math.atan2(Math.sin(target - angle), Math.cos(target - angle))) < 0.25) { angle = target; break; }
    }
    const bullet = { id: `shot-${this.state.stats.time}`, x: sh.x + Math.cos(angle) * 24, y: sh.y + Math.sin(angle) * 24, vx: Math.cos(angle) * 650 + sh.vx * 0.3, vy: Math.sin(angle) * 650 + sh.vy * 0.3, ttl: sh.range / 650, damage: sh.damage, owner: 'player', radius: 4 };
    this.system.bullets.push(bullet);
    sh.energy -= 3;
    this._shotTimer = 0.25;
    this._event('shot', { x: bullet.x, y: bullet.y, angle });
  }

  _mine(dt) {
    const sh = this.state.ship;
    if (sh.energy < 1 || this.cargoUsed >= sh.cargoCap) return;
    const target = this.system.asteroids.filter(a => a.hp > 0 && distance(a, sh) < 225 + a.radius).sort((a, b) => distance(a, sh) - distance(b, sh))[0];
    if (!target) return;
    this.system.miningTarget = target.id;
    this.system.mining = { x1: sh.x, y1: sh.y, x2: target.x, y2: target.y, targetId: target.id };
    target.hp -= dt * 10 * (sh.mining || 1);
    this._record().asteroidHealth[target.id] = Math.max(0, target.hp);
    if (target.hp <= 0) {
      target.hp = 0;
      const record = this._record();
      if (!record.depleted.includes(target.id)) record.depleted.push(target.id);
      delete record.asteroidHealth[target.id];
      let ore = Math.min(target.ore, sh.cargoCap - this.cargoUsed);
      this.state.cargo.ore += ore;
      let crystal = Math.min(target.crystal, sh.cargoCap - this.cargoUsed);
      this.state.cargo.crystal += crystal;
      this.state.stats.oreMined += ore; this.state.stats.crystalsMined += crystal;
      this._flag('mined_ore'); this._flag('first_mining');
      if (this.state.stats.oreMined >= 6) this._flag('mined_six_ore');
      if (crystal) this._flag('found_crystal');
      this._event('mined', { x: target.x, y: target.y, ore, crystal, text: `+${ore} ore${crystal ? ' · +1 crystal' : ''}` });
      if (ore < target.ore || crystal < target.crystal) {
        this._dropPickup({ id: `${target.id}:spill`, x: target.x, y: target.y, ore: target.ore - ore, crystal: target.crystal - crystal, credits: 0 });
      }
      this._refreshJobs();
    }
  }

  _updateEnemies(dt) {
    const sh = this.state.ship;
    for (const e of this.system.enemies) {
      if (e.hp <= 0) continue;
      const dist = distance(e, sh);
      const factionFriendly = this.state.rep[e.faction] >= 45;
      if (dist < 650 && !factionFriendly) e.active = true;
      if (dist > 1100 || factionFriendly) e.active = false;
      e.cooldown -= dt;
      if (!e.active) {
        e.angle += dt * 0.18;
        e.x += Math.cos(e.angle) * 16 * dt; e.y += Math.sin(e.angle) * 16 * dt;
        continue;
      }
      e.angle = Math.atan2(sh.y - e.y, sh.x - e.x);
      const side = e.id.length % 2 ? 1 : -1;
      const moveAngle = e.angle + (dist < 220 ? Math.PI * 0.65 * side : 0.2 * side);
      e.vx = Math.cos(moveAngle) * e.speed; e.vy = Math.sin(moveAngle) * e.speed;
      e.x += e.vx * dt; e.y += e.vy * dt;
      if (e.cooldown <= 0 && dist < 520) {
        const angle = e.angle + (this._rand() - 0.5) * 0.16;
        this.system.bullets.push({ x: e.x, y: e.y, vx: Math.cos(angle) * 280, vy: Math.sin(angle) * 280, ttl: 2.1, damage: e.damage, owner: e.id, radius: 4 });
        e.cooldown = 1.2 + this._rand() * 0.8;
        this._event('enemy-shot', { x: e.x, y: e.y, angle });
      }
      if (dist < 28) { this._damageShip(4 * dt); sh.vx += Math.cos(e.angle) * 30 * dt; sh.vy += Math.sin(e.angle) * 30 * dt; }
    }
  }

  _updateBullets(dt) {
    const sh = this.state.ship;
    for (const b of this.system.bullets) {
      const fromX=b.x, fromY=b.y;
      b.x += b.vx * dt; b.y += b.vy * dt; b.ttl -= dt;
      if (b.ttl <= 0) continue;
      if (b.owner === 'player') {
        for (const e of this.system.enemies) {
          if (e.hp > 0 && segmentDistance(e,fromX,fromY,b.x,b.y) <= e.radius + b.radius + 4) {
            e.hp -= b.damage; e.active = true; b.ttl = 0;
            this._record().enemyHealth[e.id] = Math.max(0, e.hp);
            this._event('hit', { x: b.x, y: b.y, target: 'enemy', damage: b.damage });
            if (e.hp <= 0) this._defeat(e);
            break;
          }
        }
      } else if (segmentDistance(sh,fromX,fromY,b.x,b.y) <= 18) {
        this._damageShip(b.damage); b.ttl = 0;
        this._event('hit', { x: sh.x, y: sh.y, target: 'player', damage: b.damage });
      }
    }
    this.system.bullets = this.system.bullets.filter(b => b.ttl > 0);
    this.system.enemies = this.system.enemies.filter(e => e.hp > 0);
  }

  _damageShip(amount) {
    if (this._recoveryTimer) return;
    const sh = this.state.ship;
    const absorbed = Math.min(sh.shield, amount);
    sh.shield -= absorbed; sh.hull -= amount - absorbed;
    this._hitTimer = 5;
    if (sh.hull <= 0) this._rescue('A passing tug caught your emergency beacon. Your ship survived; some cargo did not.');
  }
  _defeat(enemy) {
    const record = this._record();
    if (record.defeated.includes(enemy.id)) return;
    record.defeated.push(enemy.id);
    delete record.enemyHealth[enemy.id];
    this.state.stats.kills++;
    this.progressJob('bounty', 1, {token:enemy.id});
    this._flag('won_battle'); this._flag('first_victory');
    this.state.rep.freewake = clamp(this.state.rep.freewake + 2, -100, 100);
    this._dropPickup({ id: `${enemy.id}:wreck`, x: enemy.x, y: enemy.y, credits: enemy.reward, ore: 1, crystal: 0, name: 'Raider salvage' });
    this._event('explosion', { x: enemy.x, y: enemy.y, size: 25, text: 'Raider disabled' });
    this._refreshJobs();
  }
  _dropPickup(item) { if (!this.system.pickups.some(p => p.id === item.id)) this.system.pickups.push({ radius: 12, ...item }); }
  _updatePickups(dt) {
    const sh = this.state.ship;
    for (const p of [...this.system.pickups]) {
      const dist = distance(p, sh);
      if (dist < 90) {
        p.x += (sh.x - p.x) * Math.min(1, dt * 4); p.y += (sh.y - p.y) * Math.min(1, dt * 4);
        if (dist < 35) this.salvage(p.id);
      }
    }
  }

  interact() {
    if (this.state.mode !== 'ship') return null;
    const sh = this.state.ship;
    const bodies = this.system.bodies.map(body => ({ type: 'dock', id: body.id, bodyId: body.id, name: body.name, body, distance: distance(sh, body), range: body.radius + 150 })).filter(t => t.distance <= t.range).sort((a, b) => a.distance - b.distance);
    if (bodies.length) return bodies[0];
    const signal = this.system.signals.filter(s => !s.resolved && distance(sh, s) <= sh.scanRange).sort((a, b) => distance(sh, a) - distance(sh, b))[0];
    if (signal) return { type: 'signal', id: signal.id, signalId: signal.id, name: signal.name, signal, distance: distance(sh, signal), range: sh.scanRange };
    const pickup = this.system.pickups.find(p => distance(p, sh) < 150);
    if (pickup) return { type: 'salvage', id: pickup.id, name: pickup.name || 'Loose salvage', pickup, distance: distance(pickup, sh), range: 150 };
    const traffic = this.system.traffic.find(t => distance(t, sh) < 185);
    if (traffic) return { type: 'hail', id: traffic.id, name: traffic.name, traffic, distance: distance(traffic, sh), range: 185 };
    return null;
  }

  dock(bodyId) {
    if (this.state.mode !== 'ship') return this._fail('You are already on foot.', 'mode');
    if (this.state.pendingEncounter) return this._fail('Resolve the open transmission first.', 'encounter');
    const body = this.system.bodies.find(b => b.id === bodyId);
    if (!body) return this._fail('That destination is not in this system.', 'target');
    if (distance(this.state.ship, body) > body.radius + 150) return this._fail(`Fly closer to ${body.name} to ${body.kind === 'station' ? 'dock' : 'land'}.`, 'distance');
    if (body.id === 'earth') {
      if (!this.hasFlag('vault_recovered') || !this.hasFlag('homeward_signal')) return this._fail('Earth’s quarantine corridor is closed. Recover the safe approach from Witness first.', 'quarantine');
      if (!this.hasFlag('threshold_answered')) {
        // Reopen a dismissed arrival hail when the captain requests permission again.
        const hail=this.triggerEncounter('earth_arrival');
        if(hail.ok) this._event('encounter',{id:hail.encounter.id,encounter:hail.encounter});
        return this._fail('Threshold is asking you to identify yourself. Answer the hail to receive landing permission.', 'permission');
      }
    }
    this.state.mode = 'person'; this.state.locationId = body.id; this.state.lastBodyId = body.id;
    this.state.ship.vx = 0; this.state.ship.vy = 0;
    this.state.person = { ...this.state.person, x: 480, y: 570, facing: 'up' };
    this.state.stats.dockings++;
    this._flag(`visited_${body.id}`); this._flag(`landed_${body.id}`); this._flag('first_landing');
    if (body.id === 'kettle') this._flag('docked_kettle');
    if (body.id === 'morrow') this._flag('landed_morrow');
    const visitId = `${this.state.systemId}/${body.id}`;
    if (!this.state.visited.includes(visitId)) {
      this.state.visited.push(visitId);
      this._log(body.kind === 'station' ? `Docked at ${body.name}` : `Landed on ${body.name}`, body.lore || this.currentSystem.description, 'discovery');
    }
    this._refreshJobs(); this._checkChapters();
    this._event('dock', { body, text: `${body.kind === 'station' ? 'Docked at' : 'Landed on'} ${body.name}` });
    return this._ok({ body });
  }

  launch() {
    if (this.state.mode !== 'person') return this._fail('You are already flying.', 'mode');
    if (this.state.pendingEncounter) return this._fail('Finish this conversation first.', 'encounter');
    if (this.state.interior) return this._leaveInterior();
    const body = this.currentBody || this.system.bodies[0];
    this.state.mode = 'ship'; this.state.locationId = null;
    this.state.ship.x = body.x; this.state.ship.y = body.y + body.radius + 75;
    this.state.ship.vx = 0; this.state.ship.vy = 0; this.state.ship.angle = Math.PI / 2;
    this._flag('first_launch');
    this._event('launch', { body, text: `Departing ${body.name}` });
    return this._ok({ body });
  }

  _discoverNear(id) {
    const source = this.galaxy.find(s => s.id === id);
    if (!source) return;
    const range = Math.max(7.5, this.state.ship.warpRange * 1.6);
    for (const s of this.galaxy) if (Math.hypot(s.gx - source.gx, s.gy - source.gy) < range && !this.state.discovered.includes(s.id)) this.state.discovered.push(s.id);
  }
  travelInfo(id) {
    const target = this.galaxy.find(s => s.id === id);
    if (!target) return this._fail('Unknown star system.', 'target');
    const current = this.currentSystem;
    const dist = Math.hypot(target.gx - current.gx, target.gy - current.gy);
    const fuelCost = Math.ceil(2 + dist * 0.65);
    const base = { target, distance: dist, fuelCost, range: this.state.ship.warpRange };
    if (id === current.id) return this._fail('You are already in this system.', 'same-system');
    if (this.state.mode !== 'ship') return { ...this._fail('Launch your ship before jumping.', 'mode'), ...base };
    if (!this.hasHyperdrive) return { ...this._fail('Fit Vector thrusters, an Echo scanner and a Fold Drive at a port first.', 'hyperdrive'), ...base };
    if (dist > this.state.ship.warpRange) return { ...this._fail('Beyond your drive range. Follow nearer stars or upgrade the drive.', 'range'), ...base };
    if (this.state.ship.fuel < fuelCost) return { ...this._fail(`This jump needs ${fuelCost} fuel. Refuel at a port.`, 'fuel'), ...base };
    if (this.state.pendingEncounter) return { ...this._fail('Resolve the open transmission before jumping.', 'encounter'), ...base };
    return this._ok(base);
  }
  travel(id) {
    const info = this.travelInfo(id);
    if (!info.ok) return info;
    this._persistRuntime();
    this.state.ship.fuel -= info.fuelCost;
    this.state.systemId = id;
    this.state.stats.jumps++;
    if (!this.state.visited.includes(id)) this.state.visited.push(id);
    if (!this.state.discovered.includes(id)) this.state.discovered.push(id);
    this._flag('first_jump'); this._flag('left_hearth'); this._flag(`visited_${id}`); this._flag(`jumped_to_${id}`);
    this._loadSystem(id);
    const port = this.system.bodies.find(b => b.kind === 'station') || this.system.bodies[0];
    Object.assign(this.state.ship, { x: port.x, y: port.y + port.radius + 95, vx: 0, vy: 0 });
    this._discoverNear(id);
    this._log(`Arrived in ${this.currentSystem.name}`, this.currentSystem.description, 'discovery');
    this._event('jump', { systemId: id, target: this.currentSystem, text: `Welcome to ${this.currentSystem.name}` });
    this._refreshJobs(); this._checkChapters();
    if (id === 'sol' && this.hasFlag('vault_recovered') && !this.state.encounterHistory.includes('earth_arrival')) {
      const greeting=this.triggerEncounter('earth_arrival');
      if(greeting.ok) this._event('encounter',{id:greeting.encounter.id,encounter:greeting.encounter});
    }
    return this._ok({ target: this.currentSystem, fuelCost: info.fuelCost });
  }

  scan(signalId) {
    if (this.state.mode !== 'ship') return this._fail('Scanners are operated from the ship.', 'mode');
    if (this.state.pendingEncounter) return this._fail('Resolve your open transmission first.', 'encounter');
    const signal = this.system.signals.find(s => s.id === signalId);
    if (!signal || signal.resolved) return this._fail('That signal has already gone quiet.', 'target');
    if (distance(signal, this.state.ship) > this.state.ship.scanRange) return this._fail('Move closer to scan the signal.', 'distance');
    if (this.state.ship.energy < 8) return this._fail('Wait for the scanner capacitor to recharge.', 'energy');
    if (signal.story && signal.id === 'hearth:story:tinbell' && !this.hasFlag('first_shift_done')) return this._fail('Iona at Kettle can help identify this old frequency. Meet her and complete a local job first.', 'story');
    if (signal.story && !this.hasFlag('mined_six_ore')) return this._fail('Mine six units of ore first; the metal dust lets your scanner match the damaged beacon.', 'story');
    this.state.ship.energy -= 8;
    if (!signal.scanned) {
      signal.scanned = true;
      this._record().scanned.push(signal.id);
      this.state.stats.scans++;
      this.progressJob('survey', 1, {token:signal.id});
      this._flag('scanned_signal'); this._flag('first_scan');
      this.state.credits += 18;
      this._refreshJobs();
    }
    if (signal.story && signal.id === 'hearth:story:tinbell') {
      this._flag('belt_signal_scanned');
      signal.resolved = true; this._record().resolved.push(signal.id);
      this._log('A living address', 'The broken evacuation beacon contains a recent household update from Earth. It is a trail worth following.', 'story');
      this._event('scan', {x:signal.x,y:signal.y,text:'Earth census fragment recovered'});
      this._checkChapters();
      return this._ok({text:'A recent address change from Earth. Find a way to Vesper.'});
    }
    const result = this.triggerEncounter(undefined, { sourceId: signal.id, sourceType: 'signal', tag: signal.kind });
    if (result.ok) {
      this._event('encounter', { id: result.encounter.id, encounter: result.encounter, source: signal });
      return result;
    }
    signal.resolved = true;
    this._record().resolved.push(signal.id);
    const reward = signal.kind === 'derelict' ? 60 : 28;
    this.state.credits += reward;
    const earlyLore = ['quiet_earth','severance','sparrow','lanes','kettle_history','union_charter','cinder_debt','open_frequency'];
    const archivePool = this.hasFlag('vault_recovered') ? LORE : LORE.filter(l => earlyLore.includes(l.id));
    const lore = archivePool[(hash(signal.id) + this.state.stats.scans) % archivePool.length];
    if (lore && !this.state.knownLore.includes(lore.id)) this.state.knownLore.push(lore.id);
    this._log(signal.name, lore?.text || 'An old survey packet records another small part of the galaxy.', 'discovery');
    this._event('scan', { x: signal.x, y: signal.y, text: `Survey recovered · +${reward} cr` });
    this._checkChapters();
    return this._ok({ text: lore?.text || 'Survey recovered.', credits: reward });
  }

  salvage(id) {
    if (this.state.mode !== 'ship') return this._fail('Salvage is collected from your ship.', 'mode');
    const item = this.system.pickups.find(p => p.id === id);
    if (!item) return this._fail('There is no salvage left here.', 'target');
    if (distance(item, this.state.ship) > 150) return this._fail('Fly closer to collect the salvage.', 'distance');
    const ore = Math.min(item.ore || 0, Math.max(0, this.state.ship.cargoCap - this.cargoUsed));
    this.state.cargo.ore += ore; item.ore = (item.ore || 0) - ore;
    const crystal = Math.min(item.crystal || 0, Math.max(0, this.state.ship.cargoCap - this.cargoUsed));
    this.state.cargo.crystal += crystal; item.crystal = (item.crystal || 0) - crystal;
    const credits = item.credits || 0; this.state.credits += credits; item.credits = 0;
    if (!(credits || ore || crystal)) return this._fail('Your cargo hold is full.', 'cargo');
    if (!item.ore && !item.crystal) this.system.pickups = this.system.pickups.filter(p => p.id !== id);
    this.state.stats.salvaged++; this._flag('salvaged_wreck');
    this._event('salvage', { x: item.x, y: item.y, text: `Recovered${credits ? ` ${credits} cr` : ''}${ore ? ` · ${ore} ore` : ''}${crystal ? ` · ${crystal} crystal` : ''}` });
    this._refreshJobs(); this._checkChapters();
    return this._ok({ credits, ore, crystal });
  }

  conditionsMet(condition = {}) {
    if (!condition) return true;
    if (condition.flags?.some(f => !this.hasFlag(f))) return false;
    if (condition.notFlags?.some(f => this.hasFlag(f))) return false;
    if (condition.credits !== undefined && this.state.credits < condition.credits) return false;
    if (condition.fuel !== undefined && this.state.ship.fuel < condition.fuel) return false;
    if (condition.ore !== undefined && this.state.cargo.ore < condition.ore) return false;
    if (condition.crystal !== undefined && this.state.cargo.crystal < condition.crystal) return false;
    if (condition.systemId && condition.systemId !== this.state.systemId) return false;
    if (condition.locationId && condition.locationId !== this.state.locationId) return false;
    if (condition.upgrades?.some(id => !this.state.upgrades[id])) return false;
    return true;
  }

  availableEncounters(mode = this.state.mode) {
    return ENCOUNTERS.filter(e => (e.mode === mode || e.mode === 'any') && (!e.once || !this.state.encounterHistory.includes(e.id)) && this.conditionsMet(e.conditions));
  }
  triggerEncounter(id, source = {}) {
    if (this.state.pendingEncounter) {
      const open = ENCOUNTERS.find(e => e.id === this.state.pendingEncounter.id);
      return id && id !== open?.id ? this._fail('A conversation is already open.', 'encounter') : this._ok({ encounter: open, existing: true });
    }
    let list = this.availableEncounters();
    if (id) list = list.filter(e => e.id === id);
    if (!list.length) return this._fail('No new transmission is waiting.', 'no-encounter');
    // Prefer encounter flavor that fits the signal, while every signal remains useful.
    list = list.filter(e => e.id !== 'earth_arrival' || this.state.systemId === 'sol');
    if (!list.length) return this._fail('No new transmission is waiting.', 'no-encounter');
    const tagged = source.tag ? list.filter(e => e.tag === source.tag || e.tag?.includes(source.tag)) : [];
    const encounter = id ? list[0] : pick(() => this._rand(), tagged.length ? tagged : list);
    this.state.pendingEncounter = { id: encounter.id, sourceId: source.sourceId || null, sourceType: source.sourceType || this.state.mode, locationId: this.state.locationId, systemId: this.state.systemId };
    return this._ok({ encounter });
  }
  beginEncounter(id, source = {}) { return this.triggerEncounter(id, source); }
  getEncounter(id = this.state.pendingEncounter?.id) { return ENCOUNTERS.find(e => e.id === id) || null; }
  choiceAvailable(encounterId, index) {
    const e = ENCOUNTERS.find(e => e.id === encounterId);
    const choice = typeof index === 'number' ? e?.choices[index] : e?.choices.find(c => c.id === index);
    if (!choice) return false;
    if (!this.conditionsMet(choice.conditions)) return false;
    const fx = choice.effects || {};
    return this.state.credits + finite(fx.credits) >= 0 && this.state.cargo.ore + finite(fx.ore) >= 0 && this.state.cargo.crystal + finite(fx.crystal) >= 0 && this.state.ship.fuel + finite(fx.fuel) >= 0;
  }
  applyChoice(encounterId, index) {
    if (this.state.pendingEncounter?.id !== encounterId) return this._fail('That conversation is no longer open.', 'encounter');
    const encounter = ENCOUNTERS.find(e => e.id === encounterId);
    if (!encounter || encounter.once && this.state.encounterHistory.includes(encounter.id)) return this._fail('This choice has already been made.', 'resolved');
    const choice = typeof index === 'number' ? encounter.choices[index] : encounter.choices.find(c => c.id === index);
    if (!choice || !this.choiceAvailable(encounterId, index)) return this._fail('You do not have what this choice requires.', 'requirements');
    const pending = this.state.pendingEncounter;
    this._effects(choice.effects || {});
    const allied = (choice.effects?.flags || []).find(flag => flag.startsWith('allied_'));
    if (allied) this.state.alliance = allied.slice(7);
    const future = (choice.effects?.flags || []).find(flag => flag.startsWith('earth_future_'));
    if (future) this.state.earthChoice = future.slice(13);
    else if (encounter.id === 'earth_council') this.state.earthChoice = choice.id;
    this.state.encounterHistory.push(encounter.id);
    this.state.stats.decisions++;
    this.state.pendingEncounter = null;
    this._flag('made_choice');
    if (pending.sourceType === 'signal' && pending.sourceId) {
      const signal = this.system.signals.find(s => s.id === pending.sourceId);
      if (signal) signal.resolved = true;
      if (!this._record().resolved.includes(pending.sourceId)) this._record().resolved.push(pending.sourceId);
    }
    const resultText = choice.result || choice.text || 'The choice becomes part of your story.';
    this._log(encounter.title, `${choice.label}\n${resultText}`, 'decision');
    this._event('choice', { title: encounter.title, text: resultText, effects: choice.effects });
    this._refreshJobs(); this._checkChapters();
    return this._ok({ text: resultText, choice, encounter });
  }
  dismissEncounter() {
    if (!this.state.pendingEncounter) return this._ok();
    this.state.pendingEncounter = null;
    return this._ok({ text: 'Transmission left open for another time.' });
  }

  _effects(effect) {
    this.state.credits = Math.max(0, this.state.credits + Math.floor(finite(effect.credits)));
    for (const kind of ['ore', 'crystal']) {
      const amount = Math.floor(finite(effect[kind]));
      if (amount < 0) this.state.cargo[kind] = Math.max(0, this.state.cargo[kind] + amount);
      else if (amount > 0) this.state.cargo[kind] += Math.min(amount, this.state.ship.cargoCap - this.cargoUsed);
    }
    this.state.ship.fuel = clamp(this.state.ship.fuel + finite(effect.fuel), 0, this.state.ship.maxFuel);
    this.state.ship.hull = clamp(this.state.ship.hull + finite(effect.hull), 1, this.state.ship.maxHull);
    this.state.person.health = clamp(this.state.person.health + finite(effect.health), 1, 100);
    for (const [id, amount] of Object.entries(effect.rep || {})) if (id in this.state.rep) this.state.rep[id] = clamp(this.state.rep[id] + finite(amount), -100, 100);
    for (const flag of effect.flags || []) this._flag(flag);
    for (const lore of effect.lore || []) if (!this.state.knownLore.includes(lore)) this.state.knownLore.push(lore);
    if (effect.crew) {
      const entries = Array.isArray(effect.crew) ? effect.crew : [effect.crew];
      for (const crew of entries) if (!this.state.crew.some(c => c.id === crew.id)) this.state.crew.push(clone(crew));
      this._updateStats(true);
    }
  }

  _checkChapters() {
    // Chapters are awarded in order; an action completed early still counts later.
    for (const chapter of STORY_CHAPTERS) {
      if (this.state.completedChapters.includes(chapter.id)) continue;
      if (!this.conditionsMet(chapter.conditions)) break;
      if (chapter.mode && chapter.mode !== 'any' && this.state.mode !== chapter.mode && chapter.id !== 'threshold') break;
      if (chapter.targetSystem && chapter.targetSystem !== this.state.systemId) break;
      if (chapter.targetBody && chapter.mode !== 'ship' && chapter.targetBody !== this.state.locationId) break;
      if (chapter.targetBody && chapter.mode === 'ship' && chapter.id === 'threshold' && !this.hasFlag('landed_earth')) break;
      if (chapter.id === 'first_shift' && !(this.hasFlag('first_job') && this.hasFlag('talked_mechanic'))) break;
      if (chapter.id === 'belt_signal' && !(this.hasFlag('mined_six_ore') && this.hasFlag('belt_signal_scanned'))) break;
      if (chapter.id === 'first_fold' && !this.hasFlag('jumped_to_vesper')) break;
      if (chapter.id === 'listening_house' && !(this.hasFlag('archive_terminal_repaired') && this.hasFlag('archive_restored'))) break;
      if (chapter.id === 'three_claims' && !this.hasFlag('alliance_committed')) break;
      if (chapter.id === 'witness_vault' && !this.hasFlag('climate_record_recovered')) break;
      if (chapter.id === 'threshold' && !(this.hasFlag('threshold_answered') && this.hasFlag('landed_earth'))) break;
      if (chapter.id === 'open_sky' && !this.hasFlag('council_decision_made')) break;
      this.state.completedChapters.push(chapter.id);
      this._flag(chapter.completionFlag || `chapter_${chapter.id}`);
      this._effects(chapter.reward || {});
      this._log(chapter.title, chapter.debrief || chapter.brief, 'chapter');
      this._event('chapter', { chapter, text: chapter.debrief || `${chapter.title} complete` });
    }
  }

  enterCabin() {
    if (this.state.mode !== 'ship') return this._fail('Take the helm before entering the cabin.', 'mode');
    if (this.state.pendingEncounter) return this._fail('Resolve the open transmission first.', 'encounter');
    if (this.system.enemies.some(e => e.active && distance(e, this.state.ship) < 600)) return this._fail('You need to clear immediate danger before leaving the helm.', 'combat');
    return this._enterInterior({ id: 'own-ship', name: 'Cinder · your ship', kind: 'ship', biome: 'ship', faction: 'freewake', crew: clone(this.state.crew), lore: 'A sleeping berth, three empty seats, and the engines you trust your life to.' }, 'ship');
  }
  exitCabin() { return this.state.interior?.kind === 'ship' ? this._leaveInterior() : this._fail('You are not in your cabin.', 'mode'); }
  boardDerelict(signalId) {
    if (this.state.mode !== 'ship') return this._fail('Approach the derelict in your ship first.', 'mode');
    if (this.state.pendingEncounter) return this._fail('Resolve the open transmission first.', 'encounter');
    const signal = this.system.signals.find(s => s.id === signalId && s.kind === 'derelict');
    if (!signal) return this._fail('This is not a boardable derelict.', 'target');
    if (distance(signal, this.state.ship) > 190) return this._fail('Get within 190 metres to attach the docking tether.', 'distance');
    return this._enterInterior({id: `derelict-${signal.id}`, name: 'Silent freighter', kind:'derelict',biome:'derelict',faction:'cinder',lore:'quiet_earth'}, 'derelict', signal.id);
  }
  leaveDerelict() { return this.state.interior?.kind === 'derelict' ? this._leaveInterior() : this._fail('You are not on a derelict.', 'mode'); }
  _enterInterior(location, kind, signalId = null) {
    const sh = this.state.ship;
    this.state.interior = {kind, location, signalId, returnShip:{x:sh.x,y:sh.y,vx:sh.vx,vy:sh.vy,angle:sh.angle},returnLocation:this.state.locationId};
    this.state.mode='person';this.state.locationId=location.id;
    sh.vx=0;sh.vy=0;
    this.state.person={...this.state.person,x:kind==='ship'?348:156,y:kind==='ship'?276:348};
    this._flag(kind==='ship'?'entered_cabin':'boarded_derelict');
    this._event('dock',{body:location,text:kind==='ship'?'You leave the helm.':'Docking tether secured.'});
    return this._ok({body:location});
  }
  _leaveInterior() {
    if (!this.state.interior) return this._fail('No interior to leave.', 'mode');
    if (this.state.pendingEncounter) return this._fail('Finish this conversation first.', 'encounter');
    const interior=this.state.interior;
    Object.assign(this.state.ship,interior.returnShip);
    this.state.mode='ship';this.state.locationId=interior.returnLocation||null;this.state.interior=null;
    this._event('launch',{body:interior.location,text:'You take the helm.'});
    return this._ok({body:interior.location});
  }
  recruitCrew(role, identity = {}) {
    if (this.state.mode !== 'person' || this.state.interior || !this.currentBody) return this._fail('Meet potential crew at an inhabited port.', 'mode');
    const roles={engineer:{cost:160,name:'Iona Vale',description:'Adds 10 hull integrity and keeps the machinery running.'},navigator:{cost:140,name:'Sera Venn',description:'Extends scanner range by 45 metres.'},medic:{cost:150,name:'Jun Bell',description:'Improves crew stamina and ship capacitor reserve by 10.'}};
    const definition=roles[role];
    if (!definition) return this._fail('Unknown crew role.', 'target');
    const details=typeof identity==='string'?{id:identity,name:identity}:identity||{};
    if (this.state.crew.some(c=>c.role===role || details.id && c.id===details.id)) return this._fail('This berth is already filled.', 'duplicate');
    if (this.state.credits<definition.cost) return this._fail(`Signing this crew member costs ${definition.cost} credits.`, 'cost');
    const crew={id:details.id||`crew-${role}`,name:details.name||definition.name,role,color:details.color||'#acd7ce',description:details.description||definition.description};
    this.state.credits-=definition.cost;this.state.crew.push(crew);
    if(this.state.interior?.kind==='ship') this.state.interior.location.crew=clone(this.state.crew);
    this._updateStats(true);this._flag(`crew_${role}`);this._log(`Welcome aboard, ${crew.name}`,definition.description,'crew');
    this._event('crew',{crew,text:`${crew.name} joined your crew`});
    return this._ok({crew,cost:definition.cost});
  }
  storyAction(action, details = {}) {
    const ids = {archive:'listening_archive',ally:'ledger_alliance',vault:'buried_weather',council:'earth_council'};
    const id = ids[action];
    if (!id) return this._fail('Unknown story action.', 'target');
    const existing = this.state.pendingEncounter;
    if (existing && existing.id !== id) return this._fail('Finish the current conversation first.', 'encounter');
    const opened = existing ? this._ok({encounter:this.getEncounter(id)}) : this.triggerEncounter(id);
    if (!opened.ok) return opened;
    const requested = details.choice || (action === 'ally' ? details.faction : null);
    if (requested === null || requested === undefined) return opened;
    const aliases = {gradual:'corridor',independent:'local',vault:'mark'};
    const choice = aliases[requested] || requested;
    return this.applyChoice(id, choice);
  }

  completeStoryStep(id, details = {}) {
    const actions={listening_house:'archive',three_claims:'ally',witness_vault:'vault',open_sky:'council'};
    if(actions[id]) return this.storyAction(actions[id],details);
    this._checkChapters();
    return this.state.completedChapters.includes(id)?this._ok():this._fail('Complete this chapter’s objective first.','story');
  }

  recordActivity(type, details = {}) {
    if (this.state.mode !== 'person' && ['talk', 'work', 'repair', 'freight', 'sample', 'explore', 'heal', 'surface-combat'].includes(type)) return this._fail('This activity requires being on foot.', 'mode');
    const alreadyScoped = String(details.token || '').includes(':jobs:') || String(details.token || '').endsWith(':once');
    const workEpoch = !alreadyScoped && (type === 'work' || type === 'repair') ? ':' + this.state.missions.filter(m => m.type === 'work' && m.targetBody === this.state.locationId && m.status !== 'completed').map(m => m.id).join(',') : '';
    const token = details.token ? `${this.state.systemId}:${this.state.locationId}:${type}:${details.token}${workEpoch}` : null;
    const first = !token || !this.state.activityTokens.includes(token);
    if (token && first) this.state.activityTokens.push(token);
    if (type === 'talk') {
      if (first) this.state.stats.talks++;
      this._flag('met_local'); this._flag('talked_to_local');
      const role = details.role || 'local';
      this._flag(`talked_${role}`); this._flag(`met_${role}`);
      if (this.state.locationId === 'kettle') this._flag('met_kettle_crew');
      if (role === 'mechanic' || role === 'engineer' || details.name === 'Iona') { this._flag('met_iona'); this._flag('talked_mechanic'); this._flag('heard_drive_plan'); }
      if (role === 'archivist' || role === 'historian') this._flag('heard_earth');
    } else if ((type === 'work' || type === 'repair') && first) {
      if (type === 'work') this.state.stats.work++;
      this._flag('worked_shift'); this._flag('completed_work'); this._flag(`worked_${this.state.locationId}`);
      if (type === 'work') this.progressJob('work', 1, { token: details.token || `work-${this.state.stats.work}` });
      const archiveRepair = details.role === 'archive' || details.kind === 'repair';
      if (archiveRepair && this.state.locationId === 'listening' && this.hasFlag('first_fold_done')) this._flag('archive_terminal_repaired');
    } else if (type === 'explore' && first) {
      this._flag('explored_surface');
    } else if (type === 'surface-combat' && first) {
      this._flag('won_ground_fight');
      this.progressJob('bounty', 1, { token: details.token || `ground-${this.state.stats.time}` });
    }
    this._checkChapters();
    return this._ok({ first });
  }

  availableJobs(bodyId = this.state.locationId || this.state.lastBodyId) {
    const body = this.system.bodies.find(b => b.id === bodyId);
    if (!body) return [];
    const epoch = Math.floor(this.state.stats.jobs / 4);
    const root = `${this.state.systemId}:${bodyId}:jobs:${epoch}`;
    const otherBody = this.system.bodies.find(b => b.id !== bodyId) || body;
    const definitions = [
      { id: `${root}:work`, type: 'work', title: 'An honest shift', description: 'Repair three service panels on foot, then return to the job board.', goal: 3, reward: 120, oreCost: 0, targetBody: bodyId, targetSystem: this.state.systemId, faction: body.faction, icon: 'tool' },
      { id: `${root}:delivery`, type: 'delivery', title: `A parcel for ${otherBody.name}`, description: `Carry a sealed medicine parcel to ${otherBody.name}. Hand it in at the local job board.`, goal: 1, reward: 145, oreCost: 0, targetBody: otherBody.id, targetSystem: this.state.systemId, faction: 'lantern', icon: 'parcel' },
      { id: `${root}:mining`, type: 'mining', title: 'Hull metal wanted', description: 'Bring six units of ore to this port. The yard pays above the open market.', goal: 6, reward: 150, oreCost: 6, targetBody: bodyId, targetSystem: this.state.systemId, faction: body.faction, icon: 'ore' },
      { id: `${root}:survey`, type: 'survey', title: 'Signals in the dark', description: 'Scan two unexplored signals in this system, then return with your survey.', goal: 2, reward: 160, oreCost: 0, targetBody: bodyId, targetSystem: this.state.systemId, faction: 'lantern', icon: 'scan' },
      { id: `${root}:bounty`, type: 'bounty', title: 'Keep the lanes clear', description: 'Disable two hostile ships. The port will pay when you return.', goal: 2, reward: 220, oreCost: 0, targetBody: bodyId, targetSystem: this.state.systemId, faction: body.faction, icon: 'target' }
    ];
    return definitions.map(d => {
      const mission = this.state.missions.find(m => m.id === d.id);
      return { ...d, originBody: bodyId, originSystem: this.state.systemId, status: this.state.completedJobs.includes(d.id) ? 'completed' : mission?.status || 'available', progress: mission?.progress || 0 };
    });
  }
  acceptJob(id) {
    if (this.state.mode !== 'person' || this.state.interior || !this.currentBody) return this._fail('Land and visit a job board to take work.', 'mode');
    if (this.state.missions.some(m => m.id === id) || this.state.completedJobs.includes(id)) return this._fail('You already took this contract.', 'duplicate');
    if (this.state.missions.filter(m => m.status !== 'completed').length >= 6) return this._fail('Your log can hold six active contracts.', 'capacity');
    const job = this.availableJobs().find(j => j.id === id && j.status === 'available');
    if (!job) return this._fail('That contract is no longer on this board.', 'target');
    const previous = this.state.abandonedJobs[id];
    const mission = { ...clone(job), status: 'active', progress: clamp(Math.floor(finite(previous?.progress)), 0, job.goal), tokens: unique(previous?.tokens), startedStats: { scans: this.state.stats.scans, kills: this.state.stats.kills }, acceptedAt: this.state.stats.time };
    delete this.state.abandonedJobs[id];
    this.state.missions.push(mission);
    this._flag('accepted_job');
    this._log(job.title, job.description, 'job');
    this._event('job', { job: mission, text: `Accepted: ${job.title}` });
    this._refreshJobs();
    return this._ok({ job: mission });
  }
  _refreshJobs() {
    for (const m of this.state.missions) {
      if (m.status === 'completed') continue;
      const wasReady = m.status === 'ready';
      if (m.type === 'mining') m.progress = Math.min(m.goal, this.state.cargo.ore);
      if (m.type === 'delivery') m.progress = this.state.systemId === m.targetSystem && this.state.locationId === m.targetBody ? 1 : 0;
      if (m.type === 'survey' || m.type === 'bounty') m.progress = Math.min(m.goal, m.progress);
      m.status = m.progress >= m.goal ? 'ready' : 'active';
      if (!wasReady && m.status === 'ready') this._event('job-ready', { job: m, text: `${m.title}: return to the job board` });
    }
  }
  progressJob(typeOrId, amount = 1, details = {}) {
    const matching = this.state.missions.filter(m => m.status !== 'completed' && (m.id === typeOrId || m.type === typeOrId));
    if (!matching.length) return this._ok({ jobs: [], ready: [] });
    let progressed = false;
    for (const m of matching) {
      if (!['work', 'survey', 'bounty'].includes(m.type)) continue;
      if (m.type === 'work' && (this.state.mode !== 'person' || m.targetBody !== this.state.locationId)) continue;
      if (m.type !== 'work' && m.originSystem !== this.state.systemId) continue;
      const token = details.token || `${m.type}:${Math.floor(this.state.stats.time)}`;
      m.tokens ||= [];
      if (m.tokens.includes(token)) continue;
      m.tokens.push(token);
      m.progress = Math.min(m.goal, m.progress + clamp(Math.floor(finite(amount)), 0, 1));
      progressed = true;
    }
    this._refreshJobs();
    return this._ok({ progressed, jobs: matching, ready: matching.filter(m => m.status === 'ready') });
  }
  turnInJob(id) {
    if (this.state.mode !== 'person' || this.state.interior || !this.currentBody) return this._fail('Visit the destination job board to collect payment.', 'mode');
    const m = this.state.missions.find(job => job.id === id);
    if (!m || m.status === 'completed' || this.state.completedJobs.includes(id)) return this._fail('This contract has already been paid or is not active.', 'duplicate');
    this._refreshJobs();
    if (m.status !== 'ready') return this._fail('This contract still has work left to do.', 'requirements');
    if (m.targetSystem !== this.state.systemId || m.targetBody !== this.state.locationId) return this._fail('Payment is waiting at the contract destination.', 'location');
    if (m.oreCost && this.state.cargo.ore < m.oreCost) return this._fail('You need to deliver the promised ore.', 'cargo');
    this.state.cargo.ore -= m.oreCost || 0;
    this.state.credits += m.reward;
    m.status = 'completed'; m.completedAt = this.state.stats.time;
    this.state.completedJobs.push(id);
    this.state.stats.jobs++;
    this._flag('completed_job'); this._flag('first_job');
    if (m.type === 'work') { this._flag('first_shift'); this._flag('completed_shift'); }
    if (m.type === 'delivery') { this._flag('delivered_medicine'); this._flag('medicine_delivered'); }
    this.state.rep[m.faction] = clamp((this.state.rep[m.faction] || 0) + 4, -100, 100);
    this._log(`Contract paid: ${m.title}`, `${m.reward} credits received. ${FACTIONS.find(f => f.id === m.faction)?.name || m.faction} remembers reliable work.`, 'job');
    this._event('job-complete', { job: m, text: `Contract complete · +${m.reward} cr` });
    this._refreshJobs(); this._checkChapters();
    return this._ok({ job: m, credits: m.reward });
  }
  completeJob(id) { return this.turnInJob(id); }
  abandonJob(id) {
    const m = this.state.missions.find(j => j.id === id && j.status !== 'completed');
    if (!m) return this._fail('No active contract found.', 'target');
    // Reaccepting the same offer keeps completed work and its one-shot task tokens.
    this.state.abandonedJobs[id] = { progress: m.progress, tokens: clone(m.tokens || []) };
    this.state.missions = this.state.missions.filter(j => j.id !== id);
    this.state.rep[m.faction] = clamp((this.state.rep[m.faction] || 0) - 2, -100, 100);
    this._event('job', { text: `Abandoned: ${m.title}` });
    return this._ok();
  }

  upgradeInfo(id) {
    const u = UPGRADES.find(x => x.id === id);
    if (!u) return this._fail('Unknown upgrade.', 'target');
    if (this.state.upgrades[id]) return { ...this._fail('Already installed.', 'owned'), upgrade: u, owned: true };
    const requirements = [...new Set([...(u.requires || []), ...(u.id === 'fold_1' ? ['thrusters_1', 'scanner_1'] : [])])];
    const missing = requirements.filter(required => !this.state.upgrades[required] && !Object.keys(this.state.upgrades).some(k => normId(k) === normId(required)));
    if (missing.length) return { ...this._fail(`Requires ${missing.map(k => UPGRADES.find(v => v.id === k)?.name || k).join(' and ')}.`, 'prerequisite'), upgrade: u };
    if (!this.conditionsMet(u.conditions) || (id === 'fold_1' && !this.hasFlag('belt_signal_found'))) return { ...this._fail('Finish Something in the belt before Iona can calibrate the Fold Drive.', 'story'), upgrade: u };
    if (this.state.credits < u.cost || this.state.cargo.ore < (u.ore || 0)) return { ...this._fail(`Needs ${u.cost} credits${u.ore ? ` and ${u.ore} ore` : ''}.`, 'cost'), upgrade: u };
    return this._ok({ upgrade: u });
  }
  buyUpgrade(id) {
    if (this.state.mode !== 'person' || this.state.interior) return this._fail('Land and visit the outfitter to fit an upgrade.', 'mode');
    const info = this.upgradeInfo(id);
    if (!info.ok) return info;
    const u = info.upgrade;
    this.state.credits -= u.cost;
    this.state.cargo.ore -= u.ore || 0;
    this.state.upgrades[id] = 1;
    this._flag(`upgrade_${id}`); this._flag(`${id}_installed`); this._flag('first_upgrade');
    if (/nav|navigation/i.test(id)) { this._flag('navigation_array'); this._flag('nav_installed'); }
    if (/coil|engine/i.test(id)) { this._flag('engine_coil'); this._flag('coil_installed'); }
    if (u.slot === 'drive' || /hyperdrive|fold.?drive|lightdrive|jumpdrive|ftldrive/i.test(id)) { this._flag('hyperdrive_installed'); this._flag('ftl_ready'); }
    this._updateStats(true);
    this._discoverNear(this.state.systemId);
    this._log(`Installed: ${u.name}`, u.description, 'upgrade');
    this._event('upgrade', { upgrade: u, text: `${u.name} installed` });
    this._refreshJobs(); this._checkChapters();
    return this._ok({ upgrade: u });
  }

  serviceQuote(action) {
    const sh = this.state.ship;
    if (action === 'repair') return { action, cost: Math.ceil(Math.max(0, sh.maxHull - sh.hull) * 0.65), label: 'Repair hull' };
    if (action === 'refuel') return { action, cost: Math.ceil(Math.max(0, sh.maxFuel - sh.fuel) * 2), label: 'Fill fuel tanks' };
    if (action === 'rest') return { action, cost: Math.ceil((100 - this.state.person.health) * 0.25), label: 'Visit the infirmary' };
    if (action === 'sell' || action === 'sellOre' || action === 'sellCrystal') {
      const ore = action === 'sellCrystal' ? 0 : this.state.cargo.ore;
      const crystal = action === 'sellOre' ? 0 : this.state.cargo.crystal;
      const marketMultiplier = 1 + Math.max(-0.15, Math.min(0.2, (this.state.rep[this.currentBody?.faction] || 0) / 250));
      return { action, cost: 0, value: Math.floor((ore * 14 + crystal * 48) * marketMultiplier), ore, crystal, label: 'Sell cargo' };
    }
    if (action === 'emergency') return { action, cost: 0, label: 'Emergency port assistance' };
    return null;
  }
  service(action) {
    if (this.state.mode !== 'person' || this.state.interior) return this._fail('Port services are available after landing.', 'mode');
    const quote = this.serviceQuote(action);
    if (!quote) return this._fail('Unknown port service.', 'target');
    if (quote.cost > this.state.credits) return this._fail(`This service costs ${quote.cost} credits.`, 'cost');
    const sh = this.state.ship;
    if (action.startsWith('sell')) {
      if (!quote.value) return this._fail('Your hold is empty.', 'cargo');
      this.state.cargo.ore -= quote.ore; this.state.cargo.crystal -= quote.crystal;
      this.state.credits += quote.value;
      this._flag('sold_cargo');
      this._event('trade', { text: `Cargo sold · +${quote.value} cr` });
      this._refreshJobs(); this._checkChapters();
      return this._ok({ credits: quote.value, text: `Sold cargo for ${quote.value} credits.` });
    }
    if (action === 'emergency') {
      if (this.state.credits >= 24 || sh.fuel >= 10) return this._fail('Assistance is reserved for captains without enough money or fuel to leave.', 'requirements');
      sh.fuel = Math.max(sh.fuel, 12);
      sh.hull = Math.max(sh.hull, Math.ceil(sh.maxHull * 0.5));
      this.state.rep.freewake = clamp(this.state.rep.freewake - 2, -100, 100);
      this._flag('accepted_port_assistance');
      this._log('No captain left drifting', 'The port supplied enough fuel to leave. The dockmaster asked you to pay the kindness forward.', 'log');
      this._event('service', { text: 'Emergency fuel supplied. Freewake favor −2.' });
      return this._ok({ text: 'The port gives you enough fuel to reach another system.' });
    }
    if (!quote.cost) return this._fail('No service is needed.', 'full');
    this.state.credits -= quote.cost;
    if (action === 'repair') sh.hull = sh.maxHull;
    if (action === 'refuel') sh.fuel = sh.maxFuel;
    if (action === 'rest') this.state.person.health = 100;
    this._event('service', { text: `${quote.label} · −${quote.cost} cr` });
    return this._ok({ cost: quote.cost, text: quote.label });
  }

  _rescue(message) {
    const sh = this.state.ship;
    const body = this.system.bodies.find(b => b.kind === 'station') || this.system.bodies[0];
    sh.hull = Math.ceil(sh.maxHull * 0.6); sh.shield = 0; sh.energy = sh.maxEnergy;
    sh.x = body.x; sh.y = body.y + body.radius + 80; sh.vx = 0; sh.vy = 0;
    this.state.cargo.ore = Math.floor(this.state.cargo.ore * 0.5);
    this.state.cargo.crystal = Math.floor(this.state.cargo.crystal * 0.5);
    const cost = Math.floor(this.state.credits * 0.12); this.state.credits -= cost;
    sh.fuel = Math.max(8, sh.fuel);
    this.state.stats.rescues++;
    this._recoveryTimer = 8;
    this._runtime.bullets.length = 0;
    this._log('Emergency tow', message, 'log');
    this._event('rescue', { text: message, cost });
    this._refreshJobs();
  }

  save() {
    this._persistRuntime();
    this.state.lastSaveAt = this.state.stats.time;
    return clone(this.state);
  }
  serialize() { return JSON.stringify(this.save()); }
}

export default Game;
