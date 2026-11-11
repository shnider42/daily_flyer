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
import { SHIP_CLASSES, CREW_ROLES, STATION_ROLES, getShipClass, advanceShip, normaliseFlightInput, cabinLayout, isCabinWalkable, enemyHullProfile, enemyShipState } from './fleet.mjs';
import { SIDEARM, ensureSidearm, sidearmAim, clearSidearmSight } from './combat.mjs';
import { normalizeCharacter, normalizeAppearance, characterModifiers } from './character.mjs';
import { normalizeStarterShip, STARTER_SHIP_IDS } from './fleet.mjs';
import { ExpeditionRules } from './expedition-rules.mjs';
import { NarrativeRules } from './quest-rules.mjs';
import { ProfessionRules, militaryPortAccess } from './profession-rules.mjs';
import { LivelihoodRules, normalizeStartMode } from './livelihoods.mjs';
import { NpcContractRules } from './npc-contracts.mjs';
import { OpeningMissionRules } from './opening-mission.mjs';
import { advanceWorldDirector, syncDirectorWorld, recordDirectorDamage } from './world-director.mjs';
import { expandGalaxy, systemCosmicBodies, applyCosmicHazards } from './galaxy-expansion.mjs';
import { systemContext } from './encounter-context.mjs';
import { contextualSignals, materializeEncounterContacts, encounterSource, encounterFitsPlace, pendingSourceAvailable, resolvePhysicalEncounter } from './encounter-rules.mjs';
import { RescueRules, rescueOccupants } from './rescue-rules.mjs';
import { InteriorDamageRules, ensureDamageControl, stepShipDamage, clearInteriorDamage, relocateHullOccupants } from './interior-damage.mjs';
import { getHullSystems, hullEnergyAfterStep } from './hull-systems.mjs';
import { conversation, normalizeConversations } from './npc-dialogue.mjs';
import { normalizeSocialVisits } from './social-world.mjs';
import { chooseNpcSpecies, normalizeSpecies, speciesName } from './species.mjs';
import { createSystemTraffic, advanceTraffic, captureTraffic, restoreTraffic, TRAFFIC_ROLE_LABELS } from './traffic.mjs';
import { appendFactionPorts } from './port-content.mjs';
import { portProfile } from './port-traffic.mjs';
import { PEACEKEEPER_ID, PEACEKEEPER_HAIL_DISTANCE, isPeacekeeper, trafficHailDistance, stepPeacekeeperDefense } from './peacekeeper.mjs';
export { SHIP_CLASSES, CREW_ROLES, STATION_ROLES, advanceShip, normaliseFlightInput } from './fleet.mjs';

export const SAVE_VERSION = 7;
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
// Keep port availability aligned with the uninhabited surface generator.
const hasPortServices = body => !!body && body.portServices !== false && body.landable !== false && body.kind !== 'blackhole' && !(['moon', 'asteroid'].includes(body.kind) && /barren|rock|dust/.test(String(body.biome)));
const cabinCache=new Map();
const combatLayout=id=>{if(!cabinCache.has(id))cabinCache.set(id,cabinLayout(id));return cabinCache.get(id);};
const facingOf=(dx,dy)=>Math.abs(dx)>Math.abs(dy)?dx<0?'left':'right':dy<0?'up':'down';
const clearInteriorShot=(layout,a,b)=>{
  const steps=Math.max(1,Math.ceil(distance(a,b)/6));
  for(let i=1;i<steps;i++)if(!isCabinWalkable(layout,a.x+(b.x-a.x)*i/steps,a.y+(b.y-a.y)*i/steps,1))return false;
  return true;
};
function interiorRoute(layout,start,target) {
  const index=p=>Math.floor(p.y/layout.tile)*layout.cols+Math.floor(p.x/layout.tile);
  const from=index(start),to=index(target);
  if(!layout.walkable[from]||!layout.walkable[to])return [];
  const queue=[from],prev=new Int32Array(layout.walkable.length).fill(-1);prev[from]=from;
  for(let n=0;n<queue.length&&prev[to]<0;n++){
    const cell=queue[n],x=cell%layout.cols,y=Math.floor(cell/layout.cols);
    for(const [nx,ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]){
      if(nx<0||ny<0||nx>=layout.cols||ny>=layout.rows)continue;
      const next=ny*layout.cols+nx;if(!layout.walkable[next]||prev[next]>=0)continue;
      prev[next]=cell;queue.push(next);
    }
  }
  if(prev[to]<0)return [];
  const route=[];for(let cell=to;cell!==from;cell=prev[cell])route.push({x:(cell%layout.cols+.5)*layout.tile,y:(Math.floor(cell/layout.cols)+.5)*layout.tile});
  return route.reverse();
}
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
  return appendFactionPorts(expandGalaxy(systems, seed));
}

function initialState(seed, options = {}) {
  const starter = getShipClass(normalizeStarterShip(options.starterShip)), character = normalizeCharacter(options.character);
  const startMode=normalizeStartMode(options.startMode),shipless=startMode==='hardcore';
  return {
    version: SAVE_VERSION, seed: String(seed || 'farwake'), startMode, mode: shipless?'person':'ship', systemId: 'hearth', locationId: shipless?'morrow':null,
    credits: 180, character, characterLocked: true, captainName: String(options.name || 'Captain').replace(/[<>\x00-\x1f]/g, '').trim().slice(0,32) || 'Captain', exploration: null, explorationRecords: {}, cargo: { ore: 0, crystal: 0 }, rep: Object.fromEntries(factionIds().map(id => [id, 0])), flags: [],
    upgrades: {}, visited: ['hearth'], discovered: ['hearth'], missions: [], completedJobs: [], abandonedJobs: {}, journal: [], encounterHistory: [], openingMission: null, conversations: { version: 1, people: [] }, socialVisits: normalizeSocialVisits(), socialEpoch: 0,
    crew: [], formerCrew: [], memorial: [], fleet:{owned:shipless?[]:[starter.id],history:[]}, boarding:null, boardingHistory:[], knownLore: [], completedChapters: [], pendingEncounter: null, worlds: {},
    stats: { time: 0, oreMined: 0, crystalsMined: 0, kills: 0, jobs: 0, scans: 0, salvaged: 0, jumps: 0, dockings: 0, work: 0, talks: 0, rescues: 0, distance: 0, decisions: 0 },
    ship: { id:`cinder-${hash(seed).toString(36)}`, name:'Cinder', classId:starter.id, ...(shipless?{unowned:true}:{}), humanOccupants:1, x: 0, y: 142, vx: 0, vy: 0, angle: -Math.PI / 2, angularVelocity:0, hull: 100, maxHull: 100, shield: 35, maxShield: 35, energy: 100, maxEnergy: 100, fuel: 22, maxFuel: 30, cargoCap: 24, speed: 255, turn: 4.6, damage: 16, range: 850, warpRange: 0, scanRange: 235, mining: 1, ...starter.stats, hull:starter.stats.maxHull, shield:starter.stats.maxShield, energy:starter.stats.maxEnergy, fuel:Math.min(22,starter.stats.maxFuel) },
    person: { x: 480, y: 570, health: 100, facing: 'up', weapon: SIDEARM.id, weaponDrawn: false },
    rng: hash(`${seed}:runtime`), encounterPolicyVersion: 2, nextEncounterAt: null, lastBodyId: shipless?'morrow':'kettle', jobSerial: 0, activityTokens: [], lastSaveAt: 0, interior: null, storyActions: []
  };
}

export class Game {
  constructor(seedOrSave = 'farwake', options = {}) {
    let supplied = seedOrSave;
    if (typeof supplied === 'string' && supplied.trim().startsWith('{')) supplied = JSON.parse(supplied);
    if (supplied?.state) supplied = supplied.state;
    const isSave = supplied && typeof supplied === 'object';
    const fresh = initialState(isSave ? supplied.seed : supplied, isSave ? {} : options);
    this.state = isSave ? this._restore(fresh, supplied) : fresh;
    this.galaxy = buildGalaxy(this.state.seed);
    if (!this.galaxy.some(s => s.id === this.state.systemId)) this.state.systemId = 'hearth';
    this.events = [];
    this._shotTimer = 0;
    this._hitTimer = 0;
    this._mineTimer = 0;
    this._recoveryTimer = 0;
    this._runtime = null;
    this._updateCharacter();
    if(!isSave)this.state.person.health=this.state.person.maxHealth;
    this._updateStats(false);
    this._loadSystem(this.state.systemId);
    this.initializeLivelihoods();
    if(!isSave&&!this.ownsShip)this._arriveAsPassenger(this.currentBody,{discovery:false});
    this.initializeOpeningMission({ enabled: !isSave && options.openingMission === true, fresh: !isSave });
    this._restoreBoardingDeck();
    this._restoreExploration();
    if(this.state.interior?.kind==='ship')this.state.interior.location={...this.state.interior.location,...this._cabinLocation()};
    if (this.state.mode === 'person' && !this.state.interior && !this.system.bodies.some(b => b.id === this.state.locationId)) {
      this.state.mode = 'ship'; this.state.locationId = null;
    }
    if (isSave) this._relocateLegacyJobs();
    if (!isSave) {
      if(this.ownsShip)this._log('A ship of your own', this.state.openingMission?.status === 'active' ? 'Cinder waits at Kettle’s berth. A dockworker near the landing has a small paid favor to ask. Your ship and the wider galaxy will be there when you are ready.' : 'Kettle Station is behind you. The ship is held together by secondhand parts, but its next destination is yours. Dock to meet the people keeping Hearth alive.', 'story');
      else this._log('Your first ship is still ahead', 'You arrive on Morrow with 180 credits and no ship. The contract exchange offers paid maintenance shifts, the clinic hires assistants, and crew contracts pay for work aboard someone else’s ship. Passenger ferries connect the inhabited ports. A used starter hull costs credits, with no ore or trade-in required.', 'story');
      this._flag('started');
      this._discoverNear('hearth');
    }
    this.initializeNarrative();
    this.initializeProfessions();
    this.initializeRescueOccupants();
    this.initializeInteriorDamage();
    this.initializeNpcContracts();
    if(this.state.pendingEncounter&&!pendingSourceAvailable(this,this.state.pendingEncounter))this.state.pendingEncounter=null;
    this.state.worldDirector=advanceWorldDirector(this.state.worldDirector,this.state.stats.time,{seed:this.state.seed,systems:this.galaxy}).state;
    this.syncNarrativeWorld();
    this.syncProfessionWorld();
    syncDirectorWorld(this,this.worldDirector);
    this._checkChapters();
  }

  static fromSave(save) { return new Game(save); }
  get system() { return this._runtime; }
  get currentSystem() { return this.galaxy.find(s => s.id === this.state.systemId); }
  get currentBody() {
    const interior=this.state.interior;
    if(interior?.kind==='derelict'){
      const contact=this.state.worlds[this.state.systemId]?.encounterContacts?.[`contact:${interior.signalId}`];
      return {...interior.location,evacuated:!!(interior.location.evacuated||contact?.evacuated)};
    }
    return interior?.location || this.system.bodies.find(b => b.id === this.state.locationId) || null;
  }
  get atInhabitedPort() { return this.state.mode === 'person' && !this.state.interior && hasPortServices(this.currentBody); }
  get cargoUsed() { return Math.max(0, this.state.cargo.ore) + Math.max(0, this.state.cargo.crystal); }
  get chapter() { return !this.ownsShip?{id:'earn_first_ship',title:'00 · A ship to earn',brief:'Your first hull is still ahead. Every local port has paid work and passage to other inhabited ports.',objective:'Earn credits from local jobs or crew contracts, then buy a used starter ship at an outfitter.',mode:'person',targetSystem:this.state.systemId,targetBody:this.state.locationId||this.state.lastBodyId}:STORY_CHAPTERS.find(c => !this.state.completedChapters.includes(c.id)) || null; }
  get activeChapter() { return this.chapter; }
  get playerId() { return this._playerId || 'local'; }
  get worldDirector() { return this._directorShared || this.state.worldDirector; }
  get personalShip() { return this.state.npcContract?.personal?.ship || this.state.ship; }
  get ownsShip() { return this.state.multiplayer?.serverAuthoritative&&Object.hasOwn(this.state.multiplayer,'ownedVesselId')?!!this.state.multiplayer.ownedVesselId:this.personalShip?.unowned !== true; }
  get hasActiveVessel() { return !!this.state.ship && this.state.ship.unowned !== true; }
  get shipClass() { return getShipClass(this.state.ship.classId); }
  get livingCrew() { return this.state.crew.filter(c => c.health > 0 && c.status !== 'dead'); }
  get crewCapacity() { return this.hasActiveVessel?Math.max(0,this.state.ship.berths-Math.max(1,finite(this.state.ship.humanOccupants,1))-this.narrativeBerths()-this.professionBerths()-this.rescuedBerths()):0; }
  get freeBerths() { return Math.max(0,this.crewCapacity-this.livingCrew.length); }
  get characterEffects() { return characterModifiers(this.state.character); }
  get hasHyperdrive() { return this.hasActiveVessel&&(Object.keys(this.state.upgrades).some(id => /hyperdrive|fold.?drive|lightdrive|jumpdrive|ftldrive/i.test(id)) || this.state.flags.includes('hyperdrive_installed') || this.state.ship.warpRange > 0); }

  _restore(fresh, raw) {
    const s = { ...fresh, ...clone(raw), version: SAVE_VERSION };
    s.seed = String(raw.seed || fresh.seed);
    s.startMode=normalizeStartMode(raw.startMode);
    s.mode = raw.mode === 'person' ? 'person' : 'ship';
    s.ship = { ...fresh.ship, ...(raw.ship || {}) };
    if(raw.ship?.unowned!==true)delete s.ship.unowned;
    s.character = normalizeCharacter(raw.character);
    s.characterLocked = raw.characterLocked === true;
    s.explorationRecords = raw.explorationRecords && typeof raw.explorationRecords === 'object' && !Array.isArray(raw.explorationRecords) ? clone(raw.explorationRecords) : {};
    s.exploration = raw.exploration && typeof raw.exploration === 'object' ? clone(raw.exploration) : null;
    s.person = { ...fresh.person, ...(raw.person || {}) };ensureSidearm(s.person);s.person.weaponDrawn=s.mode==='person'&&s.boarding?.phase==='active';
    s.stats = { ...fresh.stats, ...(raw.stats || {}) };
    s.cargo = { ore: Math.max(0, Math.floor(finite(raw.cargo?.ore))), crystal: Math.max(0, Math.floor(finite(raw.cargo?.crystal))) };
    s.credits = Math.max(0, Math.floor(finite(s.credits)));
    s.rep = { ...fresh.rep, ...(raw.rep || {}) };
    for (const id of factionIds()) s.rep[id] = clamp(finite(s.rep[id]), -100, 100);
    for (const name of ['flags', 'visited', 'discovered', 'completedJobs', 'encounterHistory', 'knownLore', 'completedChapters', 'activityTokens']) s[name] = unique(raw[name] || fresh[name]);
    for (const name of ['missions', 'journal', 'crew', 'formerCrew', 'memorial', 'boardingHistory']) s[name] = Array.isArray(raw[name]) ? clone(raw[name]) : [];
    s.ship.classId = getShipClass(s.ship.classId).id;
    s.ship.humanOccupants = clamp(Math.floor(finite(s.ship.humanOccupants,1)),1,10);
    const personalShip=raw.npcContract?.personal?.ship||s.ship,sharedShipless=raw.multiplayer?.serverAuthoritative&&Object.hasOwn(raw.multiplayer,'ownedVesselId')&&!raw.multiplayer.ownedVesselId;
    s.fleet = { owned:personalShip.unowned===true||sharedShipless?[]:unique([personalShip.classId,...(Array.isArray(raw.fleet?.owned)?raw.fleet.owned:['sparrow'])]).filter(id=>SHIP_CLASSES.some(c=>c.id===id)), history:Array.isArray(raw.fleet?.history)?clone(raw.fleet.history):[] };
    s.crew=s.crew.map((crew,index)=>{
      const maxHealth=Math.max(1,finite(crew.maxHealth,CREW_ROLES[crew.role]?.health||100));
      const health=clamp(finite(crew.health,crew.status==='dead'?0:maxHealth),0,maxHealth);
      return {...crew,id:crew.id||`legacy-crew-${index}`,species:normalizeSpecies(crew.species),maxHealth,health,status:health<=0?'dead':crew.status==='injured'?'injured':'active'};
    });
    for(const collection of ['formerCrew','memorial'])s[collection]=s[collection].filter(person=>person&&typeof person==='object'&&!Array.isArray(person)).map(person=>({...person,species:normalizeSpecies(person.species)}));
    s.upgrades = raw.upgrades && typeof raw.upgrades === 'object' ? clone(raw.upgrades) : {};
    s.abandonedJobs = raw.abandonedJobs && typeof raw.abandonedJobs === 'object' && !Array.isArray(raw.abandonedJobs) ? clone(raw.abandonedJobs) : {};
    s.conversations = normalizeConversations(raw.conversations);
    s.socialVisits = normalizeSocialVisits(raw.socialVisits);
    // Social projects begin when this feature joins an existing voyage. Its
    // ordinary clock still drives schedules, recognition and local time.
    const socialNow = Math.max(0, finite(s.stats.time));
    s.socialEpoch = Number.isFinite(raw.socialEpoch) && raw.socialEpoch >= 0 ? Math.min(raw.socialEpoch, socialNow) : socialNow;
    s.worlds = raw.worlds && typeof raw.worlds === 'object' ? clone(raw.worlds) : {};
    s.rng = finite(s.rng, fresh.rng) >>> 0;
    for (const name of ['x', 'y', 'vx', 'vy', 'angle', 'angularVelocity', 'hull', 'shield', 'energy', 'fuel']) s.ship[name] = finite(s.ship[name], fresh.ship[name]);
    s.person.health = clamp(finite(s.person.health, 100), s.person.down ? 0 : 1, Math.round(100 * characterModifiers(s.character).maxHealth));
    if (s.pendingEncounter && !ENCOUNTERS.some(e => e.id === s.pendingEncounter.id)) s.pendingEncounter = null;
    // A legacy overdue timer is not an event waiting at the helm. Conversations
    // now require a physical source; retain only real source-bound invitations.
    if(raw.encounterPolicyVersion!==2&&s.pendingEncounter){
      const encounter=ENCOUNTERS.find(e=>e.id===s.pendingEncounter.id);
      if(encounter?.mode==='ship'&&encounter.id!=='earth_arrival'&&!s.pendingEncounter.sourceId)s.pendingEncounter=null;
    }
    s.encounterPolicyVersion=2;s.nextEncounterAt=null;
    if(s.interior?.kind==='ship')s.interior.liveVessel=true;
    return s;
  }

  _updateCharacter() {
    this.state.character = normalizeCharacter(this.state.character);
    const person = this.state.person, effects = this.characterEffects;
    person.maxHealth = Math.round(100 * effects.maxHealth);
    person.health = clamp(finite(person.health, person.maxHealth), person.down ? 0 : 1, person.maxHealth);
    person.appearance = { ...this.state.character.appearance };
    person.speed = 112 * effects.walkSpeed;
  }
  conversation(entity, options = {}) {
    const sharedTime = this._socialTime?.(), projectedTime = this.state.npcLife?.socialTime;
    const storyTime = Number.isFinite(sharedTime) ? sharedTime : Number.isFinite(projectedTime) ? projectedTime : finite(this.state.stats?.time) - finite(this.state.socialEpoch);
    return conversation(this, entity, { ...options, storyTime: clamp(storyTime, 0, 1e12) });
  }
  customizeCharacter({appearance, traits, chooseTraits = false} = {}) {
    if(this.state.person.health <= 0 || this.state.boarding?.phase === 'active' || this.state.exploration) return this._fail('Find a safe place before changing your captain.', 'combat');
    if(chooseTraits && this.state.characterLocked) return this._fail('Your traits are already part of this captain. Appearance can still change.', 'locked');
    const fraction = this.state.person.health / (this.state.person.maxHealth || 100);
    const next = normalizeCharacter({ appearance: appearance === undefined ? this.state.character.appearance : normalizeAppearance(appearance), traits: chooseTraits ? traits : this.state.character.traits });
    this.state.character = next;
    if(chooseTraits) this.state.characterLocked = true;
    this._updateCharacter();
    this.state.person.health = Math.max(1, Math.min(this.state.person.maxHealth, fraction * this.state.person.maxHealth));
    this._event('captain-customized', {text: chooseTraits ? 'Captain traits recorded. Your appearance can be changed any time you are safe.' : 'Captain appearance updated.'});
    return this._ok({character:clone(next), characterLocked:this.state.characterLocked});
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
    record.trafficStates = captureTraffic(this.system.traffic);
    record.pickups = this.system.pickups.map(x => clone(x));
    record.enemyHealth ||= {};
    record.enemyStates ||= {};
    for (const e of this.system.enemies) if (e.hp > 0) {
      record.enemyHealth[e.id] = e.hp;
      record.enemyStates[e.id]={classId:e.classId,damageControl:e.damageControl?clone(e.damageControl):null,energy:e.energy,x:e.x,y:e.y,vx:e.vx||0,vy:e.vy||0,angle:e.angle,disabled:!!e.disabled,boardingTargetId:e.boardingTargetId||null,boardingOriginId:e.boardingOriginId||null,boardingCharge:e.boardingCharge||0,boardingCooldown:e.boardingCooldown||0,deck:e.deck?clone(e.deck):null,occupation:e.occupation?clone(e.occupation):null,capturedBy:e.capturedBy||null,promotedVesselId:e.promotedVesselId||null,canonicalVesselId:e.canonicalVesselId||null};
    }
    record.parkedShips=(this.system.parkedShips||[]).filter(sh=>sh.hull>0).map(clone);
    record.asteroidHealth ||= {};
    for (const a of this.system.asteroids) if (a.hp > 0 && a.hp < a.maxHp) record.asteroidHealth[a.id] = a.hp;
  }

  _loadSystem(id) {
    const data = this.galaxy.find(s => s.id === id) || this.galaxy[0];
    const r = seededRandom(`${this.state.seed}:${id}`);
    const record = this._record();
    for (const key of ['depleted', 'defeated', 'resolved', 'scanned', 'pickups', 'spawned']) record[key] ||= [];
    record.asteroidHealth ||= {}; record.enemyHealth ||= {}; record.enemyStates ||= {};
    const bodies = data.bodies.map((b, i) => {
      const angle = -0.55 + i * 2.3;
      let x = i === 0 ? 0 : Math.cos(angle) * (780 + i * 190);
      let y = i === 0 ? 0 : Math.sin(angle) * (780 + i * 190);
      if (id === 'hearth' && b.id === 'morrow') { x = 840; y = -420; }
      return { ...clone(b), faction: b.faction || data.faction, x: finite(b.x, x), y: finite(b.y, y), radius: b.kind === 'planet' ? 122 : b.kind === 'moon' ? 76 : 70, color: FACTIONS.find(f => f.id === (b.faction || data.faction))?.color || '#5edac0' };
    });
    bodies.push(...systemCosmicBodies(data, this.state.seed));
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
    // Hull choice uses its own stable hash so adding designs cannot move the
    // existing rocks, signals or traffic. Saved/captured ships keep their class.
    const hullFor=entityId=>{
      const tier=data.danger||1;
      const pool=tier>=5?['marten','hauler','frigate']:tier>=3?['hauler','marten','mule']:['sparrow','kestrel'];
      return pool[hash(`${this.state.seed}:${id}:${entityId}:hull`)%pool.length];
    };
    const enemies = [];
    const context=systemContext(data);
    // Consume the old seeded draws to keep rocks, routes and story beacons fixed.
    // Only persistent/involved old hulls survive a newly protected region.
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
      Object.assign(enemy,record.enemyStates[enemy.id]||{});
      enemy.disabled=enemy.hp>0&&(enemy.disabled||enemy.hp<=enemy.maxHp*.4);
      Object.assign(enemy,enemyHullProfile(record.enemyStates[enemy.id]?.classId||hullFor(enemy.id)));
      const saved=record.enemyStates[enemy.id],involved=enemy.hp<enemy.maxHp||enemy.disabled||saved?.deck||saved?.boardingTargetId||saved?.capturedBy||saved?.promotedVesselId||saved?.canonicalVesselId;
      if (!record.defeated.includes(enemy.id)&&(i<context.backgroundHostileCount||involved)) enemies.push(enemy);
    }
    for (const e of record.spawned) if (!record.defeated.includes(e.id)) enemies.push({ ...e,...(record.enemyStates[e.id]||{}),...enemyHullProfile(record.enemyStates[e.id]?.classId||e.classId||hullFor(e.id)), hp: record.enemyHealth[e.id] ?? e.hp });
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
    // Preserve the four legacy commuter draws; lane identities and geometry now
    // have independent streams so expanding a fleet never reshuffles the world.
    for(let i=0;i<16;i++)r();
    const traffic = restoreTraffic(createSystemTraffic({seed:this.state.seed,system:data,bodies,count:context.trafficCount}), record.trafficStates);
    for(const contact of traffic)if(context.region!=='core'&&contact.faction==='concord'&&['patrol','escort','carrier'].includes(contact.trafficRole)&&hash(`${this.state.seed}:${contact.id}:patrol-assistance`)%100<3)contact.encounterId='patrol';
    this._runtime = { id, name: data.name, faction: data.faction, danger: data.danger, biome: data.biome, description: data.description, context, bodies, asteroids, enemies, parkedShips:clone(record.parkedShips||[]).filter(sh=>sh.hull>0&&sh.id!==this.state.ship.id), bullets: [], pickups: clone(record.pickups), signals:contextualSignals(data,signals,this.state.seed), traffic, miningTarget: null, mining: null, miningBeams:{}, width: WORLD_RADIUS * 2, height: WORLD_RADIUS * 2, radius: WORLD_RADIUS };
    materializeEncounterContacts(this);
    for(const ship of [...this.system.parkedShips,...this.system.enemies])relocateHullOccupants(ship);
    record.visits = (record.visits || 0) + 1;
    if(this.state.narrative)this.syncNarrativeWorld();
    if(this.state.professions)this.syncProfessionWorld();
    if(this.worldDirector)syncDirectorWorld(this,this.worldDirector);
  }

  _updateStats(heal = false) {
    const sh = this.state.ship;
    const previous = { hull: sh.maxHull || 100, shield: sh.maxShield || 35, fuel: sh.maxFuel || 30 };
    const hullClass=getShipClass(sh.classId);
    const values = { ...hullClass.stats, classId:hullClass.id, berths:hullClass.berths, turn:hullClass.stats.angularAcceleration, warpRange:0 };
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
      if (crew.health <= 0 || crew.status === 'dead') continue;
      if (crew.role === 'engineer') values.maxHull += 10;
      if (crew.role === 'navigator') values.scanRange += 45;
      if (crew.role === 'medic') values.maxEnergy += 10;
      if (crew.role === 'gunner') values.damage += 3;
      if (crew.role === 'quartermaster') values.cargoCap += 8;
      if (crew.role === 'scientist') {values.scanRange += 30;values.mining *= 1.1;}
    }
    values.angularAcceleration=values.turn;
    values.maxAngularVelocity+=Math.max(0,values.turn-hullClass.stats.angularAcceleration)*.15;
    Object.assign(sh, values);
    sh.hull = clamp(sh.hull + (heal ? Math.max(0, values.maxHull - previous.hull) : 0), sh.destroyed?0:1, sh.maxHull);
    sh.shield = clamp(sh.shield + (heal ? Math.max(0, values.maxShield - previous.shield) : 0), 0, sh.maxShield);
    sh.fuel = clamp(sh.fuel + (heal ? Math.max(0, values.maxFuel - previous.fuel) : 0), 0, sh.maxFuel);
    sh.energy = clamp(sh.energy, 0, sh.maxEnergy);
  }

  /** Bind every pilot in a room to the same live world and persistent record. */
  bindSharedWorld(runtime, record, playerId = this.playerId) {
    if (!runtime || runtime.id !== this.state.systemId) return this._fail('The shared world does not match this pilot’s system.', 'system');
    this._runtime=runtime;this.state.worlds[this.state.systemId]=record || this._record();this._playerId=String(playerId);this._sharedWorld=true;
    this.system.miningBeams ||= {};
    if(this.state.narrative)this.syncNarrativeWorld();
    if(this.state.professions)this.syncProfessionWorld();
    return this._ok();
  }

  step(delta, input = {}) {
    const dt=clamp(finite(delta),0,.1);
    if(!dt)return;
    this.stepPilot(dt,input);
    if(!this._sharedWorld){
      const result=advanceWorldDirector(this.worldDirector,this.state.stats.time,{seed:this.state.seed,systems:this.galaxy});
      if(result.state!==this.state.worldDirector){
        this.state.worldDirector=result.state;syncDirectorWorld(this,result.state);this.syncProfessionWorld();
        for(const event of result.transitions)if(event.systemId===this.state.systemId)this._event(event.type,event);
      }
    }
    this.stepWorld(dt,[this]);
  }

  /** Per-pilot rules only. A multiplayer room calls stepWorld exactly once afterward. */
  stepPilot(delta, input = {}, options = {}) {
    const dt=clamp(finite(delta),0,.1);
    if(!dt)return;
    this.state.stats.time+=dt;
    for(const key of ['_shotTimer','_hitTimer','_recoveryTimer','_boardingShotTimer','_repairTimer','_crewHealTimer','_damageControlTimer'])this[key]=Math.max(0,finite(this[key])-dt);
    this.stepNpcContract(dt,input);
    const sh=this.state.ship;
    if(this.hasActiveVessel){this.stepInteriorDamage(dt);this.stepRescueOccupants(dt);}
    this.system.miningBeams ||= {};delete this.system.miningBeams[this.playerId];
    this.system.miningTarget=null;this.system.mining=null;
    if(this.state.boarding?.phase==='active')this._stepBoarding(dt,input,options.boardingParticipants);
    if(this.state.exploration && !this._sharedWorld) this.stepExploration(dt, input);
    const operate=this.hasActiveVessel&&(this.state.mode==='ship'||['ship','eva'].includes(this.state.interior?.kind));
    if(!operate){this.state.cosmicWarning=null;sh.energy=Math.min(sh.maxEnergy,sh.energy+dt*14);this._checkChapters();return;}
    const pilotConscious=this._damageHumans!==undefined||this.state.person.health>0&&!this.state.person.down;
    const helmInput=this.npcContractPilot()||(pilotConscious&&(this.state.mode==='ship'||options.operateShip)?input:{});
    const flight=normaliseFlightInput(helmInput),boosting=flight.boost&&flight.thrust>0&&sh.energy>8;
    const oldX=sh.x,oldY=sh.y;
    Object.assign(sh,advanceShip(sh,dt,flight,{worldRadius:WORLD_RADIUS}));
    const cosmic=applyCosmicHazards(sh,dt,this.system.bodies,{damage:true});
    Object.assign(sh,cosmic.ship);
    const warningKey=cosmic.hazard?`${cosmic.hazard.id}:${cosmic.hazard.level}`:null;
    if(warningKey&&warningKey!==this._cosmicWarningKey)this._event('cosmic-warning',{...cosmic.hazard,text:cosmic.hazard.warning});
    this._cosmicWarningKey=warningKey;this.state.cosmicWarning=cosmic.hazard||null;
    if(cosmic.damage>0){this._damageShip(cosmic.damage,{sourceId:cosmic.hazard?.id,cause:'tidal forces'});if(sh.destroyed||sh.hull<=0||this._recoveryTimer)return;}
    this.state.stats.distance+=Math.hypot(sh.x-oldX,sh.y-oldY);
    sh.energy=hullEnergyAfterStep(sh,dt,helmInput);
    if(!this._hitTimer)sh.shield=Math.min(sh.maxShield,sh.shield+getHullSystems(sh.classId).shieldRecharge*dt);
    if(helmInput.fire)this.fireWeapons();
    if(helmInput.mine)this._mine(dt);
    this._checkChapters();
  }

  /** Once-per-room simulation. Recipients may include crew whose parked ships are not targets. */
  stepWorld(delta, participants = [this], {recipients=[]} = {}) {
    const dt=clamp(finite(delta),0,.1);if(!dt)return;
    const games=[...new Set(participants)].filter(g=>g?.state?.systemId===this.state.systemId);
    this._worldGames=games;
    this._rewardGames=new Map([...games,...recipients].map(g=>[g.playerId,g]));
    const targets=[...games.filter(g=>g.hasActiveVessel&&g.netTargetEligible!==false&&(g.state.mode==='ship'||['ship','enemy','eva'].includes(g.state.interior?.kind)||g.netTargetEligible===true)),...this._parkedActors()];
    this._updateEnemies(dt,targets);
    stepPeacekeeperDefense(this.system,dt,targets,(type,event)=>this._worldEvent(type,event));
    this._updateBullets(dt,targets);
    for(const ship of [...(this.system.parkedShips||[]),...this.system.enemies.filter(enemy=>!enemy.promotedVesselId&&!enemy.canonicalVesselId)]){
      if(!ship.damageControl)continue;
      stepShipDamage(ship,dt);
      const occupant=games.find(game=>game.state.interior?.kind==='enemy'&&game.currentDamageHull()?.id===ship.id);
      (occupant||this)._hurtInteriorOccupants(ship,{delta:dt});
    }
    this._updatePickups(dt,targets.filter(g=>!g._parkedVessel));
    for(const game of games)game._syncBoardedVessel();
    this.system.parkedShips=(this.system.parkedShips||[]).filter(sh=>sh.hull>0);
    advanceTraffic(this.system.traffic,dt);
    for(const a of this.system.asteroids)a.angle+=a.spin*dt;
  }

  fireWeapons(shooterId = this.playerId) {
    if(!this.hasActiveVessel)return this._fail('You do not have an active ship or its weapons.','no-ship');
    if(this.state.mode!=='ship'&&this.state.interior?.kind!=='ship')return this._fail('Ship weapons require a vessel in space.', 'mode');
    if(this._shotTimer>0)return this._fail('The pulse emitter is cycling.', 'cooldown');
    if(this.state.ship.energy<getHullSystems(this.state.ship.classId).pulseEnergy)return this._fail('The pulse emitter needs reactor charge.', 'energy');
    this._fire(shooterId);return this._ok();
  }

  repairFromStation() {
    if(!this.hasActiveVessel)return this._fail('There is no ship to repair.','no-ship');
    if(this.state.mode!=='ship'&&this.state.interior?.kind!=='ship')return this._fail('Use the engineering station aboard an active ship.', 'mode');
    const sh=this.state.ship,system=getHullSystems(sh.classId);
    if(sh.hull>=sh.maxHull)return this._fail('Hull integrity is already full.', 'full');
    if(this._repairTimer>0)return this._fail('The repair rig is cooling.', 'cooldown');
    if(sh.energy<system.repairEnergy)return this._fail(`The repair rig needs ${system.repairEnergy} reactor charge.`, 'energy');
    const restored=Math.min(system.repairHull,sh.maxHull-sh.hull);
    sh.energy-=system.repairEnergy;sh.hull+=restored;this._repairTimer=system.repairCooldown;
    this._event('service',{text:`Engineering restored ${restored} hull integrity.`});return this._ok({hull:restored,energy:system.repairEnergy});
  }

  medicalFromStation(patients = [this]) {
    if(!this.hasActiveVessel)return this._fail('Visit a port clinic for treatment until you have access to a ship’s medical station.','no-ship');
    if(this.state.mode!=='ship'&&this.state.interior?.kind!=='ship')return this._fail('Use the medical station aboard your ship.','mode');
    if(this._crewHealTimer>0)return this._fail('The medical station is preparing the next treatment.','cooldown');
    const system=getHullSystems(this.state.ship.classId);
    const people=(Array.isArray(patients)?patients:[this]).filter(g=>g?.state?.person?.health>0&&g.state.person.health<(g.state.person.maxHealth||100));
    const crew=this.livingCrew.filter(c=>c.health<c.maxHealth);
    const rescued=(this.state.ship.rescueGroups||[]).filter(group=>group.status==='aboard').flatMap(group=>group.members||[]).filter(person=>person.health>0&&person.health<(person.maxHealth||68));
    if(!people.length&&!crew.length&&!rescued.length)return this._fail('Everyone aboard is already healthy.','full');
    if(this.state.ship.energy<system.healEnergy)return this._fail(`The medical station needs ${system.healEnergy} reactor charge.`,'energy');
    this.state.ship.energy-=system.healEnergy;this._crewHealTimer=system.healCooldown;
    for(const g of people)g.state.person.health=Math.min(g.state.person.maxHealth||100,g.state.person.health+system.healPerson);
    for(const c of crew){c.health=Math.min(c.maxHealth,c.health+system.healCrew);c.status=c.health===c.maxHealth?'active':'injured';}
    for(const person of rescued)person.health=Math.min(person.maxHealth||68,person.health+system.healCrew);
    if(this.state.interior?.kind==='ship')this.state.interior.location.crew=clone(this.state.crew);
    this._event('service',{text:'Medical treatment restored vitality to the injured crew.'});
    return this._ok({healedPeople:people.length,healedCrew:crew.length,healedPassengers:rescued.length,energy:system.healEnergy});
  }

  _fire(shooterId = this.playerId) {
    if(!this.hasActiveVessel)return;
    const sh = this.state.ship,system=getHullSystems(sh.classId);
    let angle = sh.angle;
    const candidates = this.system.enemies.filter(e => e.hp > 0 && !e.promotedVesselId && !e.canonicalVesselId && !e.capturedBy && distance(e, sh) < 550).sort((a, b) => distance(a, sh) - distance(b, sh));
    for (const e of candidates) {
      const target = Math.atan2(e.y - sh.y, e.x - sh.x);
      if (Math.abs(Math.atan2(Math.sin(target - angle), Math.cos(target - angle))) < 0.25) { angle = target; break; }
    }
    const vesselId=this.netVesselId||sh.id,serial=this._spaceShotSerial=(this._spaceShotSerial||0)+1;
    const volleyId=`${vesselId}:${shooterId}:pulse:${this.state.stats.time}:${serial}`,nose=Math.max(24,(sh.renderLength||getShipClass(sh.classId).stats.renderLength)*.42),bullets=[];
    for(let mount=0;mount<system.pulseCount;mount++){
      const muzzle=system.pulseMuzzles?.[mount],side=muzzle?.[1]??(mount*2-(system.pulseCount-1))*system.pulseOffset;
      const forward=muzzle?.[0]??nose,mountAngle=muzzle?sh.angle:angle;
      const bullet={id:system.pulseCount===1?volleyId:`${volleyId}:${mount}`,x:sh.x+Math.cos(mountAngle)*forward-Math.sin(mountAngle)*side,y:sh.y+Math.sin(mountAngle)*forward+Math.cos(mountAngle)*side,vx:Math.cos(angle)*650+sh.vx*.3,vy:Math.sin(angle)*650+sh.vy*.3,ttl:sh.range/650,damage:sh.damage*system.pulseDamageScale,owner:'player',ownerId:String(shooterId),shooterId:String(shooterId),vesselId,radius:4};
      bullets.push(bullet);this.system.bullets.push(bullet);
    }
    sh.energy-=system.pulseEnergy;this._shotTimer=system.pulseCooldown;
    const first=bullets[0];this._event('shot',{id:volleyId,ownerId:first.ownerId,shooterId:first.shooterId,vesselId,x:first.x,y:first.y,angle,projectileIds:bullets.map(bullet=>bullet.id)});
  }

  _mine(dt) {
    if(!this.hasActiveVessel)return;
    const sh = this.state.ship;
    if (sh.energy < 1 || this.cargoUsed >= sh.cargoCap) return;
    const target = this.system.asteroids.filter(a => a.hp > 0 && distance(a, sh) < getHullSystems(sh.classId).miningReach + a.radius).sort((a, b) => distance(a, sh) - distance(b, sh))[0];
    if (!target) return;
    this.system.miningTarget = target.id;
    this.system.mining = { x1: sh.x, y1: sh.y, x2: target.x, y2: target.y, targetId: target.id, ownerId:this.playerId };
    this.system.miningBeams ||= {};this.system.miningBeams[this.playerId]=this.system.mining;
    target.hp -= dt * 10 * (sh.mining || 1) * this.characterEffects.mining;
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
      this.recordOpeningMining(ore, target);
      this._flag('mined_ore'); this._flag('first_mining');
      if (this.state.stats.oreMined >= 6) this._flag('mined_six_ore');
      if (crystal) this._flag('found_crystal');
      this._event('mined', { id: `mined:${this.state.systemId}:${target.id}`, ownerId: this.playerId, vesselId: this.netVesselId || sh.id, targetId: target.id, x: target.x, y: target.y, ore, crystal, text: `+${ore} ore${crystal ? ' · +1 crystal' : ''}` });
      if (ore < target.ore || crystal < target.crystal) {
        this._dropPickup({ id: `${target.id}:spill`, x: target.x, y: target.y, ore: target.ore - ore, crystal: target.crystal - crystal, credits: 0 });
      }
      this._refreshJobs();
    }
  }

  _worldEvent(type,data={}) {
    for(const game of this._worldGames?.length?this._worldGames:[this])game._event(type,data);
  }

  _updateEnemies(dt, targets = [this]) {
    for(const e of this.system.enemies){
      if(e.hp<=0||e.promotedVesselId||e.canonicalVesselId)continue;
      if(e.disabled||e.boardingTargetId||e.capturedBy){e.active=false;e.vx=0;e.vy=0;continue;}
      const target=targets.filter(g=>(g.state.rep[e.faction]||0)<45).sort((a,b)=>distance(e,a.state.ship)-distance(e,b.state.ship))[0];
      const sh=target?.state.ship,dist=sh?distance(e,sh):Infinity;
      if(dist<650)e.active=true;if(dist>1100||!target)e.active=false;
      e.cooldown-=dt;
      if(!e.active){e.angle+=dt*.18;e.x+=Math.cos(e.angle)*16*dt;e.y+=Math.sin(e.angle)*16*dt;e.boardingCharge=0;continue;}
      e.targetId=target.playerId;e.angle=Math.atan2(sh.y-e.y,sh.x-e.x);
      e.boardingCooldown=Math.max(0,(e.boardingCooldown||0)-dt);
      const exposed=getShipClass(e.classId).berths>=3&&getShipClass(sh.classId).berths>=3&&!target._parkedVessel&&sh.shield<=Math.max(4,sh.maxShield*.2)&&target.state.boarding?.phase!=='active'&&!target.state.pendingEncounter&&!e.boardingCooldown;
      const side=e.id.length%2?1:-1;
      const moveAngle=e.angle+(exposed?(dist<90?Math.PI*.5*side:0):(dist<220?Math.PI*.65*side:.2*side));
      const moveSpeed=e.speed*(exposed&&dist<150?.25:1);
      e.vx=Math.cos(moveAngle)*moveSpeed;e.vy=Math.sin(moveAngle)*moveSpeed;e.x+=e.vx*dt;e.y+=e.vy*dt;
      if(exposed&&dist<175+sh.radius){
        if(!e.boardingCharge)target._event('boarding-warning',{enemyId:e.id,text:'Pirate grapples are locking on. Boost away or restore your shields.'});
        e.boardingCharge=(e.boardingCharge||0)+dt;
        if(e.boardingCharge>=3){const result=target.startBoarding(e.id);if(result.ok){e.boardingCharge=0;continue;}}
      }else e.boardingCharge=0;
      if(e.cooldown<=0&&dist<520){
        const angle=e.angle+(this._rand()-.5)*.16;
        const serial=this._spaceShotSerial=(this._spaceShotSerial||0)+1,equipment=getHullSystems(e.classId);
        for(let mount=0;mount<equipment.pulseCount;mount++){
          const muzzle=equipment.pulseMuzzles?.[mount],side=muzzle?.[1]??(mount*2-(equipment.pulseCount-1))*equipment.pulseOffset;
          const forward=muzzle?.[0]??0,mountAngle=muzzle?e.angle:angle;
          this.system.bullets.push({id:`${e.id}:pulse:${this.state.stats.time}:${serial}:${mount}`,x:e.x+Math.cos(mountAngle)*forward-Math.sin(mountAngle)*side,y:e.y+Math.sin(mountAngle)*forward+Math.cos(mountAngle)*side,vx:Math.cos(angle)*280,vy:Math.sin(angle)*280,ttl:2.1,damage:e.damage*equipment.pulseDamageScale,owner:e.id,ownerId:e.id,vesselId:e.id,team:'hostile',targetId:target.playerId,radius:4});
        }
        e.cooldown=1.2+this._rand()*.8;this._worldEvent('enemy-shot',{x:e.x,y:e.y,angle});
      }
      if(dist<sh.radius+e.radius-2){target._damageShip(4*dt,{sourceX:e.x,sourceY:e.y,cause:'collision'});sh.vx+=Math.cos(e.angle)*30*dt;sh.vy+=Math.sin(e.angle)*30*dt;}
    }
  }

  _updateBullets(dt, targets = [this]) {
    for(const b of this.system.bullets){
      const fromX=b.x,fromY=b.y;
      const travelTime=Math.min(dt,Math.max(0,b.ttl));
      b.x+=b.vx*travelTime;b.y+=b.vy*travelTime;b.ttl-=dt;
      if(!travelTime)continue;
      if(b.cosmetic===true&&b.owner===PEACEKEEPER_ID)continue;
      if(b.owner==='player'){
        const shooter=targets.find(g=>(g.netVesselId||g.state.ship.id)===b.vesselId)||this._worldGames?.find(g=>g.playerId===b.ownerId);
        const hostileVessel=g=>{
          if(g===shooter||(g.netVesselId||g.state.ship.id)===b.vesselId)return false;
          if(typeof shooter?.netCanDamage==='function')return shooter.netCanDamage(g,b)===true;
          const sourceId=shooter?.netVesselId||shooter?.state.ship.id,targetId=g.netVesselId||g.state.ship.id;
          return !!(shooter?.netHostileTo?.has(targetId)&&g.netHostileTo?.has(sourceId));
        };
        const hits=[
          ...this.system.enemies.filter(e=>e.hp>0&&!e.promotedVesselId&&!e.canonicalVesselId&&e.capturedBy!==b.ownerId&&segmentDistance(e,fromX,fromY,b.x,b.y)<=e.radius+(b.radius||4)+4).map(e=>({point:e,enemy:e})),
          ...targets.filter(g=>g.state.ship.hull>0&&hostileVessel(g)&&segmentDistance(g.state.ship,fromX,fromY,b.x,b.y)<=g.state.ship.radius+(b.radius||4)).map(g=>({point:g.state.ship,game:g}))
        ].sort((a,c)=>Math.hypot(a.point.x-fromX,a.point.y-fromY)-Math.hypot(c.point.x-fromX,c.point.y-fromY));
        const collision=hits[0];if(!collision)continue;b.ttl=0;
        if(collision.game){const hit=collision.game;hit._damageShip(b.damage,{sourceId:b.ownerId,sourceVesselId:b.vesselId,bullet:b});this._worldEvent('hit',{x:collision.point.x,y:collision.point.y,target:'player',playerId:hit.playerId,vesselId:hit.netVesselId||collision.point.id,damage:b.damage});continue;}
        const hit=collision.enemy,damage=Math.min(hit.hp,b.damage);ensureDamageControl(hit);hit.hp=Math.max(0,hit.hp-b.damage);hit.active=true;
        const interiorOwner=this._worldGames?.find(game=>game.state.interior?.kind==='enemy'&&game.currentDamageHull()?.id===hit.id);
        (interiorOwner||this)._registerInteriorHit(hit,damage,0,{sourceId:b.ownerId,sourceVesselId:b.vesselId,bullet:b});
        recordDirectorDamage(this.worldDirector,hit,b.ownerId||this.playerId,damage);
        this._record().enemyHealth[hit.id]=hit.hp;
        this._worldEvent('hit',{x:hit.x,y:hit.y,target:'enemy',vesselId:hit.id,damage:b.damage});
        if(hit.hp<=0){const owner=this._rewardGames?.get(b.ownerId)||this._worldGames?.find(g=>(g.netVesselId||g.state.ship.id)===b.vesselId)||this;this._defeat(hit,owner);this._boardedTargetDestroyed(hit);}
        else if(hit.hp<=hit.maxHp*.4&&!hit.disabled){hit.disabled=true;hit.active=false;hit.vx=0;hit.vy=0;this._worldEvent('disabled',{enemyId:hit.id,text:`${hit.name} disabled. Close to board, or finish the hull.`});}
      }else{
        const hit=targets.filter(g=>g.state.ship.hull>0&&segmentDistance(g.state.ship,fromX,fromY,b.x,b.y)<=g.state.ship.radius+(b.radius||4)).sort((a,c)=>Math.hypot(a.state.ship.x-fromX,a.state.ship.y-fromY)-Math.hypot(c.state.ship.x-fromX,c.state.ship.y-fromY))[0];
        if(hit){hit._damageShip(b.damage,{sourceId:b.ownerId,sourceVesselId:b.vesselId||b.ownerId,bullet:b});b.ttl=0;this._worldEvent('hit',{x:hit.state.ship.x,y:hit.state.ship.y,target:'player',playerId:hit.playerId,vesselId:hit.netVesselId||hit.state.ship.id,damage:b.damage});}
      }
    }
    this.system.bullets=this.system.bullets.filter(b=>b.ttl>0);
    this.system.enemies=this.system.enemies.filter(e=>e.hp>0);
  }

  _damageShip(amount, details = {}) {
    if(!this.hasActiveVessel)return;
    if (this._recoveryTimer) return;
    const sh = this.state.ship;
    if(sh.destroyed||sh.hull<=0)return;
    const absorbed = Math.min(sh.shield, amount);
    const hullDamage=Math.min(sh.hull,Math.max(0,amount-absorbed));
    sh.shield -= absorbed; sh.hull = Math.max(0,sh.hull-hullDamage);
    const hullAfterImpact=sh.hull;
    this._registerInteriorHit(sh,hullDamage,absorbed,details);
    // Losing a specialist recalculates stats. Its ordinary one-hull minimum
    // must not resurrect a vessel destroyed by this same penetrating hit.
    sh.hull=Math.min(sh.hull,hullAfterImpact);
    this.recordPassengerDamage(hullDamage);
    if(hullDamage>0)this.netOnHullDamaged?.({...details,hullDamage});
    this._hitTimer = getHullSystems(sh.classId).shieldDelay;
    if(sh.hull<=0){
      this._worldEvent('vessel-destroyed',{vesselId:this.netVesselId||sh.id,name:sh.name,...details});
      if(this.netOnShipDestroyed?.({vesselId:this.netVesselId||sh.id,...details})===true)return;
      if(this.state.interior?.kind==='enemy'){
        sh.destroyed=true;sh.vx=0;sh.vy=0;this.state.interior.originDestroyed=true;
        this._event('origin-destroyed',{vesselId:sh.id,text:`${sh.name||'Your ship'} was destroyed outside. Secure this vessel to escape, or call for recovery.`});
      }else this._rescue('A passing tug caught your emergency beacon. Your ship survived; some cargo did not.');
    }
  }

  _parkedActors() {
    return (this.system.parkedShips||[]).filter(ship=>ship.hull>0).map(ship=>({
      _parkedVessel:true,netVesselId:ship.id,playerId:ship.ownerId||this.playerId,
      state:{ship,mode:'ship',systemId:this.state.systemId,rep:this.state.rep,boarding:null},
      _event:(type,data)=>this._event(type,data),startBoarding:()=>this._fail('This vessel has no crew aboard.','empty'),
      _damageShip:(amount,details={})=>{const absorbed=Math.min(ship.shield||0,amount),hullDamage=Math.min(ship.hull,Math.max(0,amount-absorbed));ship.shield=Math.max(0,(ship.shield||0)-absorbed);ship.hull=Math.max(0,ship.hull-hullDamage);this._registerInteriorHit(ship,hullDamage,absorbed,details);if(!ship.hull){ship.destroyed=true;this._worldEvent('vessel-destroyed',{vesselId:ship.id,name:ship.name,...details});}}
    }));
  }
  _defeat(enemy, credited = this) {
    const record = this._record();
    if (record.defeated.includes(enemy.id)) return;
    record.defeated.push(enemy.id);
    delete record.enemyHealth[enemy.id];
    credited.state.stats.kills++;
    credited.progressJob('bounty', 1, {token:enemy.id});
    credited._flag('won_battle'); credited._flag('first_victory');
    credited.state.rep.freewake = clamp(credited.state.rep.freewake + 2, -100, 100);
    this._dropPickup({ id: `${enemy.id}:wreck`, x: enemy.x, y: enemy.y, credits: enemy.reward, ore: 1, crystal: 0, name: 'Raider salvage' });
    this._worldEvent('explosion', { x: enemy.x, y: enemy.y, size: 25, text: 'Raider defeated' });
    credited._refreshJobs();
  }
  _dropPickup(item) { if (!this.system.pickups.some(p => p.id === item.id)) this.system.pickups.push({ radius: 12, ...item }); }
  _updatePickups(dt, targets = [this]) {
    for(const p of [...this.system.pickups]){
      const game=targets.filter(g=>(g.cargoUsed<g.state.ship.cargoCap||p.credits)&&distance(p,g.state.ship)<getHullSystems(g.state.ship.classId).salvagePullRange).sort((a,b)=>distance(p,a.state.ship)-distance(p,b.state.ship))[0];
      if(!game)continue;const sh=game.state.ship,dist=distance(p,sh);
      if(dist<getHullSystems(sh.classId).salvagePullRange){p.x+=(sh.x-p.x)*Math.min(1,dt*4);p.y+=(sh.y-p.y)*Math.min(1,dt*4);if(dist<35)game.salvage(p.id);}
    }
  }

  interact() {
    if (this.state.mode !== 'ship'||!this.hasActiveVessel||this.state.npcContract?.active) return null;
    const sh = this.state.ship;
    const parked=(this.system.parkedShips||[]).filter(v=>v.hull>0&&distance(v,sh)<sh.radius+v.radius+110).sort((a,b)=>distance(a,sh)-distance(b,sh))[0];
    if(parked)return {type:'parked-ship',id:parked.id,name:parked.name,vessel:parked,distance:distance(parked,sh),range:sh.radius+parked.radius+110};
    const disabled=this.system.enemies.filter(e=>e.hp>0&&e.disabled&&!e.boardingTargetId&&!e.promotedVesselId&&!e.canonicalVesselId&&distance(e,sh)<sh.radius+e.radius+110).sort((a,b)=>distance(a,sh)-distance(b,sh))[0];
    if(disabled)return {type:'board',id:disabled.id,name:disabled.name,enemy:disabled,distance:distance(disabled,sh),range:sh.radius+disabled.radius+110};
    const bodies = this.system.bodies.filter(body=>body.landable!==false&&body.kind!=='blackhole').map(body => ({ type: 'dock', id: body.id, bodyId: body.id, name: body.name, body, distance: distance(sh, body), range: body.radius + 150 })).filter(t => t.distance <= t.range).sort((a, b) => a.distance - b.distance);
    if (bodies.length) return bodies[0];
    const signal = this.system.signals.filter(s => !s.resolved && distance(sh, s) <= sh.scanRange).sort((a, b) => distance(sh, a) - distance(sh, b))[0];
    if (signal) return { type: 'signal', id: signal.id, signalId: signal.id, name: signal.name, signal, distance: distance(sh, signal), range: sh.scanRange };
    const salvageReach=getHullSystems(sh.classId).salvageReach,pickup=this.system.pickups.find(p=>distance(p,sh)<salvageReach);
    if (pickup) return { type: 'salvage', id: pickup.id, name: pickup.name || 'Loose salvage', pickup, distance: distance(pickup, sh), range: salvageReach };
    const traffic = this.system.traffic.filter(t => trafficHailDistance(t, sh) <= PEACEKEEPER_HAIL_DISTANCE).sort((a,b)=>trafficHailDistance(a,sh)-trafficHailDistance(b,sh))[0];
    if (traffic) return { type: 'hail', id: traffic.id, name: traffic.name, traffic, distance: distance(traffic, sh), range:Math.hypot(traffic.renderLength||32,traffic.renderWidth||24)/2+sh.radius+PEACEKEEPER_HAIL_DISTANCE };
    return null;
  }

  /** A radio reply conveys permission; it never grants a berth, reward or hull. */
  hailTraffic(id) {
    if(!this.hasActiveVessel||!(this.state.mode==='ship'||this.state.mode==='person'&&this.state.interior?.kind==='ship'))return this._fail('Use the radio aboard your active ship.','mode');
    if(this.state.npcContract?.active)return this._fail('The service captain is handling this vessel’s radio.','crew-duty');
    const contact=this.system.traffic.find(ship=>ship.id===id);
    if(!contact)return this._fail('That contact is no longer in this system.','target');
    if(trafficHailDistance(contact,this.state.ship)>PEACEKEEPER_HAIL_DISTANCE)return this._fail('Move within local radio range of the vessel.','distance');
    const hull=getShipClass(contact.classId),faction=FACTIONS.find(f=>f.id===contact.faction)?.name||'Independent';
    const keeper=isPeacekeeper(contact),permission=keeper?militaryPortAccess(this,contact.faction):null;
    const clearance=keeper&&permission.ok;
    const message=keeper?(clearance?
      '“Service identity confirmed. Resolute operations. You may use the duty channel for fleet traffic. Keep the civilian approach clear and maintain separation. Docking is not authorized.”':
      permission.code==='military-standing'?'“Vessel calling Resolute: your service clearance is suspended. Withdraw from our patrol envelope. Do not approach this ship. Resolute out.”':
      '“Unidentified civilian vessel, this is Freewake warship Resolute. This is a restricted fleet channel. Alter course, maintain separation, and clear our patrol envelope. No boarding or docking is authorized. Resolute out.”'):
      '“Quiet on our route. Safe travels, captain.”';
    return this._ok({id:contact.id,name:contact.name,role:TRAFFIC_ROLE_LABELS[contact.trafficRole]||'Local traffic',factionId:contact.faction,faction,classId:hull.id,hull:hull.name,message,clearance,restricted:keeper,status:contact.trafficStatus||'In transit',route:contact.originName&&contact.destinationName?`${contact.originName} → ${contact.destinationName}`:this.currentSystem.name});
  }

  portAccess(body, system = this.currentSystem) {
    const profile=portProfile(system,body);
    return profile?.restricted?{...militaryPortAccess(this,profile.faction),profile}:this._ok({profile});
  }

  dock(bodyId) {
    if (this.state.mode !== 'ship') return this._fail('You are already on foot.', 'mode');
    const vesselAccess=this.ownShipAccess();if(!vesselAccess.ok)return vesselAccess;
    if (this.state.pendingEncounter) return this._fail('Resolve the open transmission first.', 'encounter');
    const body = this.system.bodies.find(b => b.id === bodyId);
    if (!body) return this._fail('That destination is not in this system.', 'target');
    if (body.landable === false || body.kind === 'blackhole') return this._fail('This is a gravitational hazard. Keep clear of its tidal boundary; there is nowhere to land.', 'hazard');
    if (distance(this.state.ship, body) > body.radius + 150) return this._fail(`Fly closer to ${body.name} to ${body.kind === 'station' ? 'dock' : 'land'}.`, 'distance');
    const portPermission=this.portAccess(body);if(!portPermission.ok)return portPermission;
    const rescueAccess=this.rescueDockCheck();if(!rescueAccess.ok)return rescueAccess;
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
    this.state.ship.vx = 0; this.state.ship.vy = 0; this.state.ship.angularVelocity=0;
    this.state.livelihoods.parkedShip=null;
    this.state.person = { ...this.state.person, x: 480, y: 570, facing: 'up' };
    this.state.stats.dockings++;
    this.disembarkRescuedOccupants(body);
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
    const vesselAccess=this.ownShipAccess({atPort:true});if(!vesselAccess.ok)return vesselAccess;
    if (this.state.pendingEncounter) return this._fail('Finish this conversation first.', 'encounter');
    if (this.state.interior) return this._leaveInterior();
    const body = this.currentBody || this.system.bodies[0];
    this.state.mode = 'ship'; this.state.locationId = null;
    this.state.ship.x = body.x; this.state.ship.y = body.y + body.radius + 75;
    this.state.ship.vx = 0; this.state.ship.vy = 0; this.state.ship.angle = Math.PI / 2; this.state.ship.angularVelocity=0;
    this.state.livelihoods.parkedShip=null;
    this._flag('first_launch');
    this._event('launch', { body, text: `Departing ${body.name}` });
    return this._ok({ body });
  }

  /** A departure shortcut only for the hull already parked at this landing. */
  quickLaunch() {
    const vesselAccess=this.ownShipAccess();if(!vesselAccess.ok)return vesselAccess;
    const s=this.state,body=this.system.bodies.find(value=>value.id===s.locationId);
    if(s.mode!=='person'||s.interior||s.exploration||!body)return this._fail('Return outside to your ship’s landing before launching.','location');
    if(s.person.health<=0||s.person.down)return this._fail('You are incapacitated and cannot launch.','incapacitated');
    if(s.pendingEncounter)return this._fail('Finish this conversation before launching.','encounter');
    if(s.ship.destroyed||s.ship.hull<=0)return this._fail('Your ship is no longer intact.','destroyed');
    const portAccess=this.ownShipAccess({atPort:true});if(!portAccess.ok)return portAccess;
    if(s.boarding?.phase==='active'||this._hitTimer>0||this.system.enemies.some(enemy=>enemy.hp>0&&enemy.active&&distance(enemy,s.ship)<700))return this._fail('Resolve the immediate attack before using the departure shortcut.','combat');
    if(body.landable===false||distance(s.ship,body)>body.radius+155)return this._fail('Your ship must be parked at this landing to launch from here.','location');
    return this.launch();
  }

  _discoverNear(id) {
    const source = this.galaxy.find(s => s.id === id);
    if (!source) return;
    const range = Math.max(7.5, this.state.ship.warpRange * 1.6)*getHullSystems(this.state.ship.classId).surveyMultiplier;
    for (const s of this.galaxy) if (Math.hypot(s.gx - source.gx, s.gy - source.gy) < range && !this.state.discovered.includes(s.id)) this.state.discovered.push(s.id);
  }
  travelInfo(id) {
    const target = this.galaxy.find(s => s.id === id);
    if (!target) return this._fail('Unknown star system.', 'target');
    const current = this.currentSystem;
    const dist = Math.hypot(target.gx - current.gx, target.gy - current.gy);
    const fuelCost = Math.ceil((2+dist*.65)*getHullSystems(this.state.ship.classId).foldFuelMultiplier);
    const base = { target, distance: dist, fuelCost, range: this.state.ship.warpRange };
    if (id === current.id) return this._fail('You are already in this system.', 'same-system');
    if (this.state.mode !== 'ship') return { ...this._fail('Launch your ship before jumping.', 'mode'), ...base };
    const vesselAccess=this.ownShipAccess();if(!vesselAccess.ok)return {...vesselAccess,...base};
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
    const vesselAccess=this.ownShipAccess();if(!vesselAccess.ok)return vesselAccess;
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
    const vesselAccess=this.ownShipAccess();if(!vesselAccess.ok)return vesselAccess;
    if (this.state.mode !== 'ship' && this.state.interior?.kind !== 'ship') return this._fail('Salvage is collected from your ship.', 'mode');
    const item = this.system.pickups.find(p => p.id === id);
    if (!item) return this._fail('There is no salvage left here.', 'target');
    if (distance(item, this.state.ship) > getHullSystems(this.state.ship.classId).salvageReach) return this._fail('Fly closer to collect the salvage.', 'distance');
    const ore = Math.min(item.ore || 0, Math.max(0, this.state.ship.cargoCap - this.cargoUsed));
    this.state.cargo.ore += ore; item.ore = (item.ore || 0) - ore;
    const crystal = Math.min(item.crystal || 0, Math.max(0, this.state.ship.cargoCap - this.cargoUsed));
    this.state.cargo.crystal += crystal; item.crystal = (item.crystal || 0) - crystal;
    const credits = item.credits || 0; this.state.credits += credits; item.credits = 0;
    if (!(credits || ore || crystal)) return this._fail('Your cargo hold is full.', 'cargo');
    if (!item.ore && !item.crystal) this.system.pickups = this.system.pickups.filter(p => p.id !== id);
    this.state.stats.salvaged++; this._flag('salvaged_wreck');
    this._event('salvage', { id: `salvage:${this.state.systemId}:${item.id}`, ownerId: this.playerId, vesselId: this.netVesselId || this.state.ship.id, pickupId: item.id, x: item.x, y: item.y, text: `Recovered${credits ? ` ${credits} cr` : ''}${ore ? ` · ${ore} ore` : ''}${crystal ? ` · ${crystal} crystal` : ''}` });
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

  availableEncounters(mode = this.state.mode, source = null) {
    return ENCOUNTERS.filter(e => (e.mode === mode || e.mode === 'any') && (!e.once || !this.state.encounterHistory.includes(e.id)) && this.conditionsMet(e.conditions)&&encounterFitsPlace(this,e,source));
  }
  triggerEncounter(id, source = {}) {
    if(isPeacekeeper(this.system.traffic.find(contact=>contact.id===source.sourceId||contact.id===source.vesselId)))return this._fail('Resolute accepts fleet radio traffic only. Hail the vessel on its own channel.','restricted-channel');
    if (this.state.pendingEncounter) {
      const open = ENCOUNTERS.find(e => e.id === this.state.pendingEncounter.id);
      return id && id !== open?.id ? this._fail('A conversation is already open.', 'encounter') : this._ok({ encounter: open, existing: true });
    }
    const origin=this.state.mode==='ship'?encounterSource(this,source,id):null;
    let list = this.availableEncounters(this.state.mode,origin);
    if (id) list = list.filter(e => e.id === id);
    if (!list.length) return this._fail('No new transmission is waiting.', 'no-encounter');
    // Sources must match. An ordinary survey is never a fallback rescue or attack.
    list = list.filter(e => e.id !== 'earth_arrival' || this.state.systemId === 'sol');
    if (!list.length) return this._fail('No new transmission is waiting.', 'no-encounter');
    const encounter = id ? list[0] : pick(() => this._rand(),list);
    this.state.pendingEncounter = { ...origin,id: encounter.id, sourceId: origin?.sourceId || null, sourceType: origin?.sourceType || this.state.mode, shipId:this.state.ship.id,locationId: this.state.locationId, systemId: this.state.systemId };
    return this._ok({ encounter });
  }
  beginEncounter(id, source = {}) { return this.triggerEncounter(id, source); }
  getEncounter(id = this.state.pendingEncounter?.id) { return ENCOUNTERS.find(e => e.id === id) || null; }
  choiceAvailable(encounterId, index) {
    const e = ENCOUNTERS.find(e => e.id === encounterId);
    const choice = typeof index === 'number' ? e?.choices[index] : e?.choices.find(c => c.id === index);
    if (!choice) return false;
    if (!this.conditionsMet(choice.conditions)) return false;
    if(this.state.pendingEncounter?.id===encounterId&&!pendingSourceAvailable(this,this.state.pendingEncounter))return false;
    if(!this.rescueAdmissionCheck(encounterId,choice.id).ok)return false;
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
    if(!pendingSourceAvailable(this,pending))return this._fail('That contact is no longer alongside this ship. Approach the same source again.','source');
    if(this.rescueAdmissionCheck(encounterId,choice.id).count){const rescue=this.takeRescueOccupants(encounterId,choice.id,pending);if(!rescue.ok)return rescue;}
    const hostileContact=resolvePhysicalEncounter(this,pending,choice);
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
    return this._ok({ text: resultText, choice, encounter,hostileContactId:hostileContact?.id||null });
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
    this.state.person.health = clamp(this.state.person.health + finite(effect.health), 1, this.state.person.maxHealth || 100);
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
    if(!this.ownsShip)return;
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

  classInfo(id) {
    const shipClass=SHIP_CLASSES.find(c=>c.id===id);
    if(!shipClass)return this._fail('Unknown vessel class.','target');
    const used=STARTER_SHIP_IDS.includes(id),quote=used?this.usedStarterQuote(id):{cost:shipClass.cost,ore:shipClass.ore};
    const base={shipClass,owned:this.state.fleet.owned.includes(id),active:this.ownsShip&&this.state.ship.classId===id,cost:quote.cost,ore:quote.ore,used};
    if(base.active)return {...this._fail('This is your active hull.','owned'),...base};
    if(base.owned){const fit=this._canActivateClass(shipClass);return fit.ok?this._ok(base):{...fit,...base};}
    if(shipClass.requiresClass&&!this.state.fleet.owned.includes(shipClass.requiresClass)&&!(shipClass.requiresClass==='sparrow'&&this.state.fleet.owned.some(id=>STARTER_SHIP_IDS.includes(id))))return {...this._fail(`First commission a ${getShipClass(shipClass.requiresClass).name}.`,'prerequisite'),...base};
    if(shipClass.requires?.some(key=>!this.state.upgrades[key]))return {...this._fail(`Requires ${shipClass.requires.map(key=>UPGRADES.find(u=>u.id===key)?.name||key).join(', ')}.`,'prerequisite'),...base};
    if(!this.conditionsMet(shipClass.conditions))return {...this._fail('Continue the Quiet Earth expedition before this yard will commission that hull.','story'),...base};
    if(this.state.credits<base.cost||this.state.cargo.ore<base.ore)return {...this._fail(used?`This used starter costs ${base.cost} credits. You have ${Math.floor(this.state.credits)} credits.`:`Commissioning needs ${base.cost} credits and ${base.ore} ore.`,'cost'),...base};
    return this._ok(base);
  }
  _canActivateClass(shipClass) {
    if(this.livingCrew.length+Math.max(1,this.state.ship.humanOccupants||1)+this.narrativeBerths()+this.professionBerths()+this.rescuedBerths()>shipClass.berths)return this._fail('This hull does not have enough berths for everyone aboard, including passengers and patients.','capacity');
    const capacity=shipClass.stats.cargoCap+(this.state.ship.cargoCap-this.shipClass.stats.cargoCap);
    if(this.cargoUsed>capacity)return this._fail('Unload cargo before switching to a smaller hold.','cargo');
    return this._ok();
  }
  _activateClass(id, commissioned = false) {
    const sh=this.state.ship,condition={hull:sh.hull/sh.maxHull,shield:sh.shield/sh.maxShield,fuel:sh.fuel/sh.maxFuel,energy:sh.energy/sh.maxEnergy};
    sh.classId=id;delete sh.damageControl;this._updateStats(false);
    for(const [key,max] of [['hull','maxHull'],['shield','maxShield'],['fuel','maxFuel'],['energy','maxEnergy']])sh[key]=Math.max(key==='hull'?1:0,sh[max]*(commissioned?1:clamp(finite(condition[key],1),0,1)));
    ensureDamageControl(sh);
    this.state.ship.angularVelocity=clamp(finite(this.state.ship.angularVelocity),-this.state.ship.maxAngularVelocity,this.state.ship.maxAngularVelocity);
    this.state.fleet.history.push({classId:id,time:this.state.stats.time,systemId:this.state.systemId});
    this._event('ship-class',{shipClass:this.shipClass,text:`Cinder is now a ${this.shipClass.name}. ${this.shipClass.berths} berths ready.`});
    return this._ok({shipClass:this.shipClass});
  }
  buyShip(id) {
    if(!this.atInhabitedPort)return this._fail('Commission a new hull at an inhabited port.','mode');
    if(this.state.npcContract?.active)return this._fail('Finish your crew contract before buying a personal ship.','contract');
    const firstShip=!this.ownsShip;
    if(!firstShip){const access=this.ownShipAccess({atPort:true});if(!access.ok)return access;}
    const info=this.classInfo(id);if(info.owned)return {...this._fail('This hull is already in your fleet.','owned'),shipClass:info.shipClass,owned:true};if(!info.ok)return info;
    const capacity=this._canActivateClass(info.shipClass);if(!capacity.ok)return capacity;
    this.state.credits-=info.cost;this.state.cargo.ore-=info.ore;
    this.state.fleet.owned.push(id);const result=this._activateClass(id,true);
    if(firstShip)this.claimFirstShip();
    this._flag(`fleet_${id}`);this._log(`Commissioned: ${info.shipClass.name}`,info.shipClass.description,'fleet');
    this._refreshJobs();return result;
  }
  selectShip(id) {
    if(!this.atInhabitedPort)return this._fail('Change hulls at an inhabited port.','mode');
    const vesselAccess=this.ownShipAccess({atPort:true});if(!vesselAccess.ok)return vesselAccess;
    if(!this.state.fleet.owned.includes(id))return this._fail('This hull is not in your fleet.','owned');
    if(this.state.ship.classId===id)return this._fail('This hull is already active.','same-class');
    const capacity=this._canActivateClass(getShipClass(id));if(!capacity.ok)return capacity;
    return this._activateClass(id);
  }
  _cabinLocation() {
    const c=this.shipClass;
    return {id:'own-ship',vesselId:this.state.ship.id,name:`${this.state.ship.name||'Cinder'} · ${c.name}`,kind:'ship',biome:'ship',faction:'freewake',shipClass:c.id,berths:c.berths,crew:clone(this.state.crew),guests:rescueOccupants(this.state.ship),lore:`${c.berths} berths aboard your ${c.name}. A small home that crosses a very large sky.`};
  }

  enterCabin() {
    const vesselAccess=this.ownShipAccess();if(!vesselAccess.ok)return vesselAccess;
    if (this.state.mode !== 'ship') return this._fail('Take the helm before entering the cabin.', 'mode');
    if (this.state.pendingEncounter) return this._fail('Resolve the open transmission first.', 'encounter');
    if (this.system.enemies.some(e => e.active && distance(e, this.state.ship) < 600)) return this._fail('You need to clear immediate danger before leaving the helm.', 'combat');
    return this._enterInterior(this._cabinLocation(), 'ship');
  }
  exitCabin() { return this.state.interior?.kind === 'ship' ? this._leaveInterior() : this._fail('You are not in your cabin.', 'mode'); }
  /** Move to the helm within the occupied cabin, never to a different hull. */
  quickHelm() {
    if(this.state.npcContract?.active)return this._fail('This is your employer’s helm. Complete your assigned crew work while the NPC captain flies.','contract');
    if(!this.hasActiveVessel&&this.state.interior?.kind!=='enemy')return this._fail('You do not own a ship yet.','no-ship');
    const s=this.state,interior=s.interior,person=s.person;
    if(s.mode!=='person'||s.exploration||!['ship','enemy'].includes(interior?.kind))return this._fail('You must be aboard a ship’s crew deck to take its helm.','mode');
    if(person.health<=0||person.down)return this._fail('You are incapacitated and cannot take the helm.','incapacitated');
    if(s.pendingEncounter)return this._fail('Finish this conversation before taking the helm.','encounter');
    if(s.boarding?.phase==='active')return this._fail('Clear the hostile boarders before taking the helm.','boarding');
    const captured=interior.kind==='enemy',target=captured?this.system.enemies.find(enemy=>enemy.id===s.boarding?.targetId&&enemy.hp>0):s.ship;
    if(!target||target.destroyed||(captured?target.hp:target.hull)<=0)return this._fail('The ship you are aboard is no longer intact.','destroyed');
    if(interior.location?.vesselId&&interior.location.vesselId!==target.id)return this._fail('This helm belongs to a different vessel.','vessel');
    if(captured&&(s.boarding?.kind!=='assault'||s.boarding.phase!=='won'||!target.deck?.cleared))return this._fail('Clear this vessel’s defenders before claiming its helm.','boarding');
    const pose={x:person.x,y:person.y},helm=cabinLayout(target.classId).stations.helm;
    Object.assign(person,{x:helm.x,y:helm.y});
    const result=captured?this.takeCapturedHelm():this.exitCabin();
    if(!result.ok)Object.assign(person,pose);else Object.assign(person,{facing:'up',moving:false});
    return result;
  }
  boardDerelict(signalId) {
    const vesselAccess=this.ownShipAccess();if(!vesselAccess.ok)return vesselAccess;
    if (this.state.mode !== 'ship') return this._fail('Approach the derelict in your ship first.', 'mode');
    if (this.state.pendingEncounter) return this._fail('Resolve the open transmission first.', 'encounter');
    const signal = this.system.signals.find(s => s.id === signalId && s.kind === 'derelict');
    if (!signal) return this._fail('This is not a boardable derelict.', 'target');
    if (distance(signal, this.state.ship) > 190) return this._fail('Get within 190 metres to attach the docking tether.', 'distance');
    const contact=this._record().encounterContacts?.[signal.vesselId||`contact:${signal.id}`];
    return this._enterInterior({id: `derelict-${signal.id}`, name: 'Silent freighter', kind:'derelict',biome:'derelict',faction:'cinder',lore:'quiet_earth',evacuated:!!contact?.evacuated}, 'derelict', signal.id);
  }
  leaveDerelict() { return this.state.interior?.kind === 'derelict' ? this._leaveInterior() : this._fail('You are not on a derelict.', 'mode'); }
  _enterInterior(location, kind, signalId = null) {
    const sh = this.state.ship;
    this.state.interior = {kind, location, signalId, liveVessel:kind==='enemy'||kind==='ship', returnShip:{x:sh.x,y:sh.y,vx:sh.vx,vy:sh.vy,angle:sh.angle,angularVelocity:sh.angularVelocity},returnLocation:this.state.locationId};
    this.state.mode='person';this.state.locationId=location.id;
    if(!this.state.interior.liveVessel||kind==='enemy'){sh.vx=0;sh.vy=0;sh.angularVelocity=0;}
    const spawn=kind==='ship'||kind==='enemy'?cabinLayout(location.shipClass||'sparrow').spawn:{x:156,y:348};
    this.state.person={...this.state.person,...spawn};
    this._flag(kind==='ship'?'entered_cabin':'boarded_derelict');
    this._event('dock',{body:location,text:kind==='ship'?'You leave the helm.':'Docking tether secured.'});
    return this._ok({body:location});
  }
  _leaveInterior() {
    if(this.state.interior?.kind === 'site') return this.exitSite();
    const vesselAccess=this.ownShipAccess();if(!vesselAccess.ok)return vesselAccess;
    if (!this.state.interior) return this._fail('No interior to leave.', 'mode');
    if (this.state.pendingEncounter) return this._fail('Finish this conversation first.', 'encounter');
    if(this.state.boarding?.phase==='active')return this._fail('Clear the boarders or retreat through the airlock first.','boarding');
    const interior=this.state.interior;
    if(interior.kind==='enemy'){const access=this._boardingReturnCheck();if(!access.ok)return access;}
    if(!interior.liveVessel)Object.assign(this.state.ship,interior.returnShip);
    if(interior.kind==='enemy')this._releaseBoardingTether();
    if(this.state.boarding)this.state.boarding=null;
    this.state.person.weaponDrawn=false;
    this.state.mode='ship';this.state.locationId=interior.returnLocation||null;this.state.interior=null;
    this._event('launch',{body:interior.location,text:'You take the helm.'});
    return this._ok({body:interior.location});
  }
  /** The hiring board and authority resolve the same person before money changes hands. */
  crewCandidate(role) {
    if(!Object.hasOwn(CREW_ROLES,role))return null;
    const definition=CREW_ROLES[role];
    let id=`crew-${role}`,serial=1;
    while([...this.state.crew,...this.state.formerCrew].some(person=>person.id===id))id=`crew-${role}-${++serial}`;
    const names={engineer:'Anik Sol',navigator:'Jules Aster',medic:'Tavi Sen',gunner:'Rook Venn',security:'Mara Kest',scientist:'Sera Ilan',quartermaster:'Orrin Hale'};
    const replacements=['Kellan Rho','Meri Ash','Ives Noon','Asha Pell','Kori Fen','Lin Voss','Beck Vale'];
    const name=serial>1?replacements[(serial+Object.keys(CREW_ROLES).indexOf(role)-2)%replacements.length]:names[role];
    const location=this.currentBody||{systemId:this.state.systemId},identityId=`${location.id||this.state.systemId}:candidate:${id}`;
    const species=chooseNpcSpecies(this.state.seed,identityId,location);
    return{id,role,species,name:species==='human'?name:speciesName(species,this.state.seed,identityId),cost:definition.cost,color:definition.color,description:definition.description};
  }
  recruitCrew(role, identity = {}) {
    if(!this.atInhabitedPort)return this._fail('Meet potential crew at an inhabited port.','mode');
    const vesselAccess=this.ownShipAccess({atPort:true});if(!vesselAccess.ok)return vesselAccess;
    const candidate=this.crewCandidate(role),definition=Object.hasOwn(CREW_ROLES,role)?CREW_ROLES[role]:null;if(!definition)return this._fail('Unknown crew role.','target');
    const details=typeof identity==='string'?{id:identity,name:identity}:identity||{};
    if(!details.id&&this.livingCrew.some(c=>c.role===role))return this._fail('This specialist role is already filled.','duplicate');
    const id=details.id||candidate.id;
    if(this.state.crew.some(c=>c.id===id))return this._fail('This person is already in your crew records.','duplicate');
    if(this.freeBerths<1)return this._fail(`All ${this.state.ship.berths} berths are occupied. Commission a larger hull or free a berth first.`,'capacity');
    if(this.state.credits<definition.cost)return this._fail(`Signing this crew member costs ${definition.cost} credits.`,'cost');
    const species=details.species!==undefined?normalizeSpecies(details.species):details.id||details.name?'human':candidate.species;
    const crew={id,name:details.name||candidate.name,species,role,color:details.color||definition.color,description:details.description||definition.description,health:definition.health,maxHealth:definition.health,status:'active'};
    this.state.credits-=definition.cost;this.state.crew.push(crew);this._updateStats(true);
    this._flag(`crew_${role}`);this._log(`Welcome aboard, ${crew.name}`,definition.description,'crew');
    this._event('crew',{crew,text:`${crew.name} joined your crew`});return this._ok({crew,cost:definition.cost});
  }

  dismissCrew(id) {
    if(!this.atInhabitedPort)return this._fail('Crew can disembark safely at an inhabited port.','mode');
    const crew=this.state.crew.find(c=>c.id===id&&c.health>0);if(!crew)return this._fail('This crew member is not aboard.','target');
    if(crew.role==='quartermaster'&&this.cargoUsed>this.state.ship.cargoCap-8)return this._fail('Unload cargo before releasing your quartermaster’s storage arrangements.','cargo');
    this.state.formerCrew.push({...clone(crew),status:'released',departedAt:this.state.stats.time,systemId:this.state.systemId,locationId:this.state.locationId});
    this.state.crew.splice(this.state.crew.indexOf(crew),1);this._updateStats(false);
    this._log(`Safe travels, ${crew.name}`,`${crew.name} disembarked at ${this.currentBody.name}. Their berth is free for another traveler.`,'crew');
    this._event('crew',{crew,text:`${crew.name} disembarked. A berth is now free.`});return this._ok({crew});
  }

  boardEnemy(enemyId) {
    const vesselAccess=this.ownShipAccess();if(!vesselAccess.ok)return vesselAccess;
    if(this.state.mode!=='ship')return this._fail('Approach the disabled ship from the helm.','mode');
    if(this.state.pendingEncounter)return this._fail('Resolve the open transmission first.','encounter');
    const enemy=this.system.enemies.find(e=>e.id===enemyId&&e.hp>0&&!e.promotedVesselId&&!e.canonicalVesselId);
    if(!enemy||!enemy.disabled)return this._fail('Disable the target’s engines before boarding.','disabled');
    if(enemy.boardingTargetId)return this._fail('Another boarding party already has the tether.','occupied');
    if(distance(enemy,this.state.ship)>this.state.ship.radius+enemy.radius+110)return this._fail('Close to the disabled vessel before attaching a tether.','distance');
    Object.assign(enemy,enemyHullProfile(enemy.classId||((this.currentSystem.danger||1)>=3?'hauler':'sparrow')));
    if(!enemy.boardable)return this._fail('This craft is too small for a boarding party.','capacity');
    const shipClass=enemy.classId;
    const result=this._enterInterior(this._enemyLocation(enemy),'enemy',enemy.id);
    if(!result.ok)return result;
    return this._beginBoarding(enemy,'assault',shipClass);
  }

  /** Called by an NPC's completed grapple, never by a random casualty roll. */
  startBoarding(enemyId) {
    if(!this.hasActiveVessel)return this._fail('There is no hull here to board.','no-ship');
    if(this.shipClass.berths<3)return this._fail('This small craft cannot accept an external boarding party.','capacity');
    if(this.state.boarding?.phase==='active')return this._fail('A boarding action is already underway.','boarding');
    if(this.state.mode!=='ship'&&this.state.interior?.kind!=='ship')return this._fail('This vessel is not exposed in space.','mode');
    const enemy=this.system.enemies.find(e=>e.id===enemyId&&e.hp>0&&!e.disabled);
    if(!enemy||enemy.boardingTargetId)return this._fail('That pirate ship cannot attach a boarding tether.','target');
    if(!enemyHullProfile(enemy.classId).boardable)return this._fail('That small raider cannot carry an external boarding party.','capacity');
    if(this.state.ship.shield>Math.max(4,this.state.ship.maxShield*.2))return this._fail('Your shields block the grapples.','shield');
    if(distance(enemy,this.state.ship)>175+this.state.ship.radius)return this._fail('The pirate grapples cannot reach your hull.','distance');
    if(this.state.mode==='ship')this._enterInterior(this._cabinLocation(),'ship');
    return this._beginBoarding(enemy,'defense',this.state.ship.classId);
  }

  _beginBoarding(enemy,kind,shipClass) {
    const layout=combatLayout(shipClass),count=Math.min(4,2+Math.floor((this.currentSystem.danger||1)/2));
    const id=`boarding:${enemy.id}:${kind}`;
    const freshEnemies=()=>Array.from({length:count},(_,i)=>{
      const point=layout.combatSpawns[i%layout.combatSpawns.length];
      const actorId=`${id}:hostile:${i}`,species=chooseNpcSpecies(this.state.seed,actorId,{systemId:this.state.systemId});
      return {id:actorId,name:i?'Boarding raider':'Pirate breacher',species,...point,health:52,maxHealth:52,team:'hostile',role:'raider',color:'#e69079',facing:'right',damage:7+Math.floor((this.currentSystem.danger||1)/2),cooldown:1.8+i*.35,speed:52,status:'active'};
    });
    if(kind==='assault')enemy.deck ||= {shipClass,enemies:freshEnemies(),cleared:false,rewardClaimed:false,occupation:null,shotSerial:0};
    const enemies=kind==='assault'?enemy.deck.enemies:freshEnemies();
    const allies=this.livingCrew.map((crew,i)=>({id:`${id}:crew:${crew.id}`,crewId:crew.id,name:crew.name,species:normalizeSpecies(crew.species),role:crew.role,...layout.crewSpawns[i%layout.crewSpawns.length],health:crew.health,maxHealth:crew.maxHealth,team:'friendly',color:crew.color,facing:'left',damage:CREW_ROLES[crew.role]?.damage||8,cooldown:.8+i*.15,speed:crew.role==='security'?64:50,status:'active'}));
    const leaderId=this._boardingLeaderId||this.playerId,originVesselId=this.netVesselId||this.state.ship.id;
    enemy.boardingTargetId=leaderId;enemy.boardingOriginId=originVesselId;enemy.boardingCharge=0;
    if(kind==='assault')enemy.occupation=enemy.deck.occupation={boarderId:leaderId,controllerId:enemy.deck.occupation?.controllerId||enemy.capturedBy||null,contested:!enemy.deck.cleared};
    const phase=kind==='assault'&&enemy.deck.cleared?'won':'active';
    this.state.boarding={id,kind,phase,shipClass,systemId:this.state.systemId,vesselId:kind==='assault'?enemy.id:originVesselId,originVesselId,targetVesselId:enemy.id,locationId:this.state.locationId,targetId:enemy.id,enemies,allies,elapsed:0,combatTime:this.state.stats.time,unopposedTime:0,startedAt:this.state.stats.time,shotSerial:enemy.deck?.shotSerial||0,leaderId};
    ensureSidearm(this.state.person);this.state.person.down=false;this.state.person.weaponDrawn=phase==='active';this.state.person.lastShot=null;
    this._event('boarding',{boarding:this.state.boarding,text:phase==='won'?`${enemy.name} is still secure. Return across the tether or take its helm.`:kind==='defense'?`Boarders are inside ${this.state.ship.name||'your ship'}. Defend your crew and clear the deck.`:`Tether secured to ${enemy.name}. Clear its hostile crew to secure the bridge.`});
    this._log(kind==='defense'?'Boarding alarm':'Across the tether',`${enemy.name}: ${enemies.length} armed contacts on the deck.`,'boarding');
    return this._ok({boarding:this.state.boarding,body:this.currentBody});
  }

  _enemyLocation(enemy) {
    ensureDamageControl(enemy);
    const ship=enemyShipState(enemy),hull=getShipClass(enemy.classId);
    return {id:`boarded-${enemy.id}`,vesselId:enemy.id,name:`${enemy.name} · boarding deck`,vesselName:enemy.name,kind:'ship',biome:'ship',shipClass:hull.id,berths:hull.berths,crew:clone(this.livingCrew),guests:rescueOccupants(ship),faction:enemy.faction,
      damageControl:enemy.damageControl||null,hull:ship.hull,maxHull:ship.maxHull,hp:enemy.hp,maxHp:enemy.maxHp,disabled:!!enemy.disabled,occupation:enemy.occupation||null,originVesselId:this.netVesselId||this.state.ship.id};
  }

  _restoreBoardingDeck() {
    const boarding=this.state.boarding;if(!boarding)return;
    for(const actor of boarding.enemies||[])actor.species=normalizeSpecies(actor.species);
    for(const actor of boarding.allies||[])actor.species=normalizeSpecies(this.state.crew.find(crew=>crew.id===actor.crewId)?.species??actor.species);
    boarding.originVesselId ||= this.state.ship.id;
    boarding.targetVesselId ||= boarding.targetId;
    if(boarding.kind!=='assault')return;
    boarding.vesselId=boarding.targetVesselId;
    const enemy=this.system.enemies.find(e=>e.id===boarding.targetId);if(!enemy)return;
    enemy.deck ||= {shipClass:boarding.shipClass,enemies:boarding.enemies,cleared:boarding.phase==='won',rewardClaimed:boarding.phase==='won',occupation:null};
    // The active deck is saved with the captain as well as the system. Rejoin the
    // canonical array so retreat/save/reboard can never regenerate living guards.
    enemy.deck.enemies=boarding.enemies;enemy.deck.shotSerial=boarding.shotSerial||0;
    enemy.occupation=enemy.deck.occupation ||= {boarderId:boarding.leaderId||this.playerId,controllerId:enemy.capturedBy||null,contested:boarding.phase==='active'};
    enemy.boardingTargetId=boarding.leaderId||this.playerId;enemy.boardingOriginId=boarding.originVesselId;
    if(this.state.interior?.kind==='enemy'){this.state.interior.liveVessel=true;this.state.interior.location={...this.state.interior.location,...this._enemyLocation(enemy),originVesselId:boarding.originVesselId};}
  }

  _syncBoardedVessel() {
    const boarding=this.state.boarding;
    if(boarding?.kind!=='assault'||this.state.interior?.kind!=='enemy')return;
    const enemy=this.system.enemies.find(e=>e.id===boarding.targetId);
    if(!enemy)return;
    if(enemy.deck)enemy.deck.shotSerial=boarding.shotSerial||0;
    Object.assign(this.state.interior.location,this._enemyLocation(enemy),{originVesselId:boarding.originVesselId});
  }

  _releaseBoardingTether() {
    const boarding=this.state.boarding;
    if(boarding?.kind!=='assault')return;
    const enemy=this.system.enemies.find(e=>e.id===boarding.targetId);if(!enemy)return;
    delete enemy.boardingTargetId;delete enemy.boardingOriginId;
    if(enemy.deck){enemy.deck.shotSerial=boarding.shotSerial||0;enemy.deck.occupation={boarderId:null,controllerId:enemy.capturedBy||null,contested:false};enemy.occupation=enemy.deck.occupation;}
  }

  _boardedTargetDestroyed(enemy) {
    for(const game of this._worldGames?.length?this._worldGames:[this]){
      const boarding=game.state.boarding;
      if(boarding?.kind!=='assault'||boarding.targetId!==enemy.id||!game.state.interior)continue;
      if(game.netOnBoardedTargetDestroyed?.(enemy,boarding)===true)continue;
      if(boarding.phase==='active')game._finishBoarding('destroyed');
      else boarding.phase='destroyed';
      for(const crew of game.livingCrew)game._damageCrew(crew.id,60,`Hull destruction aboard ${enemy.name}`);
      game.state.person.health=Math.max(1,game.state.person.health-60);game.state.person.down=false;game.state.person.weaponDrawn=false;
      game.state.mode='ship';game.state.interior=null;game.state.locationId=null;game.state.boarding=null;
      if(game.state.ship.destroyed||game.state.ship.hull<=0)game._rescue('Both ships were lost. A station rescue crew recovered your escape capsule.');
      game._event('boarding-complete',{phase:'destroyed',vesselId:enemy.id,text:`${enemy.name} was destroyed during boarding. The emergency tether brought survivors back; the blast injured the boarding party.`});
    }
  }

  updatePersonAim(attacker = this, input = {}) {
    const person=ensureSidearm(attacker.state.person),boarding=this.state.boarding;
    person.weaponDrawn=attacker.state.mode==='person'&&boarding?.phase==='active'&&person.health>0&&!person.down;
    if(!person.weaponDrawn){person.aimTargetId=null;return null;}
    const aim=sidearmAim(person,boarding.enemies,input,boarding.shipClass);
    person.aimAngle=aim.angle;person.aimTargetId=aim.targetId;person.aimManual=aim.manual;
    return aim;
  }

  _personShot(actor, aim, {attackerId=actor.id,actorName=actor.name||'Captain',team=actor.team||'friendly',damage=SIDEARM.damage,weaponId=SIDEARM.id}={}) {
    const boarding=this.state.boarding,at=this.state.stats.time,id=`${boarding.id}:shot:${boarding.shotSerial=(boarding.shotSerial||0)+1}`;
    const target=aim.target||null,shot={id,boardingId:boarding.id,at,until:at+SIDEARM.shotDuration,team,attackerId,actorName,weaponId,angle:aim.angle,
      from:{...aim.from},to:{...aim.to},x:aim.from.x,y:aim.from.y,targetX:aim.to.x,targetY:aim.to.y,targetId:target?.id||null,targetName:target?.name||null,
      hit:!!target,blocked:!!aim.blocked,damage:target?damage:0};
    actor.facing=facingOf(Math.cos(aim.angle),Math.sin(aim.angle));actor.aimAngle=aim.angle;actor.weapon=weaponId;actor.attackUntil=shot.until;actor.lastShot=shot;
    this._event('person-shot',shot);return shot;
  }

  _personHit(target,shot,health=target.health,maxHealth=target.maxHealth||100) {
    target.hitUntil=this.state.stats.time+.24;target.lastHitBy=shot.attackerId;
    const event={id:shot.id+':hit',boardingId:this.state.boarding.id,at:shot.at,until:shot.at+.65,x:target.x,y:target.y,targetId:target.id,
      targetName:target.name||'Captain',attackerId:shot.attackerId,actorName:shot.actorName,team:shot.team,weaponId:shot.weaponId,damage:shot.damage,health,maxHealth};
    this._event('person-hit',event);return event;
  }

  _boarderDown(target,shot) {
    target.status='dead';target.lastHitBy=shot.attackerId;
    const b=this.state.boarding;b.kills ||= {player:0,crew:0};b.kills[shot.team==='player'?'player':'crew']++;
    this._event('boarder-down',{id:shot.id+':down',boardingId:b.id,at:shot.at,until:shot.at+1.5,x:target.x,y:target.y,actorId:target.id,targetId:target.id,
      targetName:target.name,attackerId:shot.attackerId,actorName:shot.actorName,team:shot.team,text:`${shot.actorName} neutralized ${target.name}.`});
  }

  attackBoarder(enemyId = null, attacker = this, input = {}) {
    const boarding=this.state.boarding;
    if(boarding?.phase!=='active')return this._fail('There are no active boarders to fight.','boarding');
    if(attacker.state.mode!=='person'||attacker.state.person.health<=0||attacker.state.person.down)return this._fail('You must be on the deck and able to fight.','mode');
    if(attacker._boardingShotTimer>0)return this._fail('Your sidearm is cycling.','cooldown');
    const person=ensureSidearm(attacker.state.person),layout=combatLayout(boarding.shipClass);
    const candidates=boarding.enemies;let aimingInput=input;
    if(enemyId){const chosen=candidates.find(e=>e.id===enemyId&&e.health>0);if(!chosen)return this._fail('That hostile is no longer a target.','target');
      if(distance(chosen,person)>SIDEARM.range)return this._fail('That boarder is outside sidearm range.','distance');
      if(!clearSidearmSight(layout,person,chosen))return this._fail('A bulkhead blocks the shot.','sight');
      if(!input.aiming)aimingInput={...input,aiming:true,aimX:chosen.x-person.x,aimY:chosen.y-person.y};
    }
    const aim=sidearmAim(person,candidates,aimingInput,layout),target=aim.target;
    const effects=attacker.characterEffects, damage=SIDEARM.damage*effects.sidearmDamage, cooldown=SIDEARM.cooldown*effects.sidearmCooldown;
    attacker._boardingShotTimer=cooldown;person.weaponDrawn=true;person.weaponReadyAt=this.state.stats.time+cooldown;person.aimTargetId=aim.targetId;person.aimManual=aim.manual;
    const shot=this._personShot(person,aim,{attackerId:attacker.playerId,actorName:attacker._playerName|| (attacker.playerId==='local'?'You':'Captain'),team:'player',damage});
    attacker.state.stats.personShots=(attacker.state.stats.personShots||0)+1;
    if(target){target.health=Math.max(0,target.health-damage);this._personHit(target,shot);attacker.state.stats.personHits=(attacker.state.stats.personHits||0)+1;
      if(target.health<=0){this._boarderDown(target,shot);attacker.state.stats.personKills=(attacker.state.stats.personKills||0)+1;}
    }
    if(boarding.enemies.every(e=>e.health<=0))this._finishBoarding('won');
    return this._ok({shot,targetId:target?.id||null,damage:target?damage:0,health:target?.health??null,hit:!!target});
  }
  repelBoarders(enemyId = null, attacker = this) {return this.attackBoarder(enemyId,attacker);}

  retreatBoarding() {
    const boarding=this.state.boarding;
    if(boarding?.phase!=='active')return this._leaveInterior();
    if(boarding.kind!=='assault')return this._fail('The boarders are on your own ship. Clear them before taking the helm.','defense');
    const access=this._boardingReturnCheck();if(!access.ok)return access;
    this._finishBoarding('retreated');return this._leaveInterior();
  }
  leaveInterior() {return this.state.boarding?.phase==='active'?this.retreatBoarding():this._leaveInterior();}

  _boardingReturnCheck() {
    const boarding=this.state.boarding,interior=this.state.interior,person=this.state.person,origin=this.state.ship;
    if(person.health<=0||person.down)return this._fail('You are incapacitated. Surviving crew must secure the deck before recovery.','incapacitated');
    if(interior?.originDestroyed||origin.destroyed||origin.hull<=0)return this._fail('Your original ship was destroyed. Secure this bridge and take its helm.','destroyed');
    const enemy=this.system.enemies.find(e=>e.id===(boarding?.targetId||interior?.signalId)&&e.hp>0);
    if(!enemy)return this._fail('The target hull is no longer intact.','destroyed');
    if(boarding?.systemId&&boarding.systemId!==this.state.systemId||boarding?.originVesselId&&boarding.originVesselId!==origin.id||distance(enemy,origin)>270+Math.max(origin.radius||0,enemy.radius||0))return this._fail('Your original ship must remain nearby and within tether range.','distance');
    const layout=combatLayout(boarding?.shipClass||interior?.location?.shipClass);
    if(distance(person,layout.spawn)>70)return this._fail('Return to the entry airlock to cross back to your ship.','distance');
    return this._ok();
  }

  returnToOwnShip() {
    if(this.state.interior?.kind!=='enemy'){
      if(this.state.mode==='ship'&&this.state.returnVesselId)return this.boardParkedShip(this.state.returnVesselId);
      return this._fail('You are not aboard a tethered vessel.','mode');
    }
    return this.state.boarding?.phase==='active'?this.retreatBoarding():this._leaveInterior();
  }

  _parkCurrentVessel() {
    const ship=this.state.ship;
    if(!this.hasActiveVessel||ship.hull<=0||ship.destroyed)return null;
    const parked={...clone(ship),vx:0,vy:0,angularVelocity:0,ownerId:this.playerId,storedUpgrades:clone(this.state.upgrades),systemId:this.state.systemId};
    this.system.parkedShips ||= [];
    const old=this.system.parkedShips.findIndex(v=>v.id===ship.id);
    if(old>=0)this.system.parkedShips.splice(old,1);
    this.system.parkedShips.push(parked);return parked;
  }

  takeCapturedHelm() {
    if(this.state.npcContract?.active)return this._fail('Finish your employer’s crew contract before taking another vessel.','contract');
    const boarding=this.state.boarding;
    if(this.state.interior?.kind!=='enemy'||boarding?.kind!=='assault')return this._fail('You must be aboard the target vessel to take its helm.','mode');
    if(this.state.person.health<=0||this.state.person.down)return this._fail('You are incapacitated and cannot take the helm.','incapacitated');
    const enemy=this.system.enemies.find(e=>e.id===boarding.targetId&&e.hp>0);
    if(!enemy)return this._fail('The target hull is no longer intact.','destroyed');
    if(boarding.phase!=='won'||!enemy.deck?.cleared)return this._fail('Clear every hostile from this deck before taking its helm.','boarding');
    if(distance(this.state.person,combatLayout(boarding.shipClass).stations.helm)>46)return this._fail('Walk to this vessel’s bridge helm before taking command.','distance');
    const hull=getShipClass(enemy.classId),ship=enemyShipState(enemy);
    if(this.livingCrew.length+1+this.rescuedBerths(ship)>hull.berths)return this._fail(`This hull has ${hull.berths} berths, including its rescued passengers. Return to your ship and arrange a smaller crew before transferring command.`,'capacity');
    if(this.cargoUsed>hull.stats.cargoCap)return this._fail('Unload cargo before transferring command to this smaller hold.','capacity');
    const origin=this._parkCurrentVessel(),fraction=ship.hull/ship.maxHull;
    this._releaseBoardingTether();
    enemy.promotedVesselId=ship.id;enemy.capturedBy=boarding.leaderId||this.playerId;enemy.disabled=true;enemy.active=false;
    enemy.deck.occupation=enemy.occupation={boarderId:null,controllerId:enemy.capturedBy,contested:false};
    this.state.ship={...ship,disabled:false};this.initializeRescueOccupants();this.syncRescueCombat();this.state.upgrades=clone(enemy.storedUpgrades||{});this._updateStats(false);this.state.ship.hull=this.state.ship.maxHull*fraction;
    this.state.returnVesselId=origin?.id||null;this.state.boarding=null;this.state.interior=null;this.state.mode='ship';this.state.locationId=null;this.state.person.weaponDrawn=false;
    this.state.fleet.owned=unique([...this.state.fleet.owned,hull.id]);
    this.state.fleet.history.push({type:'capture',vesselId:ship.id,classId:hull.id,name:ship.name,time:this.state.stats.time,systemId:this.state.systemId});
    this._event('vessel-captured',{vesselId:ship.id,originVesselId:origin?.id||null,text:`You take ${ship.name}'s helm. Its hull damage remains.${origin?` ${origin.name||'Your original ship'} is parked beside the tether.`:''}`});
    return this._ok({ship:this.state.ship,originVesselId:origin?.id||null,text:`Command transferred to ${ship.name}.`});
  }

  boardParkedShip(vesselId) {
    const vesselAccess=this.ownShipAccess();if(!vesselAccess.ok)return vesselAccess;
    if(this.state.mode!=='ship')return this._fail('Approach your parked vessel from the helm.','mode');
    const target=(this.system.parkedShips||[]).find(v=>v.id===vesselId&&v.hull>0);
    if(!target)return this._fail('That vessel is no longer parked in this system.','target');
    if(target.ownerId&&target.ownerId!==this.playerId)return this._fail('That vessel is not under your command.','permission');
    if(distance(target,this.state.ship)>this.state.ship.radius+target.radius+110)return this._fail('Close to your parked vessel to transfer command.','distance');
    if(this.livingCrew.length+1+this.rescuedBerths(target)>target.berths||this.cargoUsed>target.cargoCap)return this._fail('Your crew, cargo, and that vessel’s rescued passengers will not fit aboard that vessel.','capacity');
    const previous=this._parkCurrentVessel();
    this.system.parkedShips=this.system.parkedShips.filter(v=>v.id!==target.id);
    const {storedUpgrades,ownerId,systemId,...ship}=clone(target);
    this.state.ship=ship;this.initializeRescueOccupants();this.state.upgrades=storedUpgrades||{};this._updateStats(false);this.state.returnVesselId=previous?.id||null;
    this._event('launch',{vesselId:ship.id,text:`You take ${ship.name||'your ship'}'s helm. The other vessel remains parked.`});
    return this._ok({ship:this.state.ship,text:`Command transferred to ${ship.name||'your ship'}.`});
  }

  _advanceBoardingActor(actor,target,layout,dt) {
    actor.facing=facingOf(target.x-actor.x,target.y-actor.y);
    actor.pathTimer=(actor.pathTimer||0)-dt;
    if(actor.pathTimer<=0||!actor.path?.length){actor.path=interiorRoute(layout,actor,target);actor.pathTimer=.55;}
    let goal=actor.path?.[0];
    if(!goal&&clearInteriorShot(layout,actor,target))goal=target;
    if(!goal)return;
    const dx=goal.x-actor.x,dy=goal.y-actor.y,d=Math.hypot(dx,dy),speed=actor.speed||52;
    if(d<1){actor.path?.shift();return;}
    const step=Math.min(d,speed*dt),x=actor.x+dx/d*step,y=actor.y+dy/d*step;
    if(isCabinWalkable(layout,x,y,5)){actor.x=x;actor.y=y;}
    else {actor.path=[];actor.pathTimer=0;}
    if(step===d)actor.path?.shift();
  }

  _actorShot(actor,target) {
    const angle=Math.atan2(target.y-actor.y,target.x-actor.x),from={x:actor.x,y:actor.y},to={x:target.x,y:target.y};
    return this._personShot(actor,{angle,from,to,target,blocked:false},{attackerId:actor.id,actorName:actor.name,team:actor.team,damage:actor.damage});
  }

  _stepBoarding(dt,input,participants) {
    const boarding=this.state.boarding;if(boarding?.phase!=='active')return;
    const layout=combatLayout(boarding.shipClass),humans=participants===undefined?[this]:participants;
    for(const human of humans)if(human!==this)human._boardingShotTimer=Math.max(0,finite(human._boardingShotTimer)-dt);
    this._boardingHumans=humans;
    boarding.elapsed+=dt;boarding.combatTime=this.state.stats.time;
    if(participants===undefined){this.updatePersonAim(this,input);if(input.fire&&this.state.mode==='person')this.attackBoarder(null,this,input);}
    else for(const human of humans){ensureSidearm(human.state.person);human.state.person.weaponDrawn=human.state.person.health>0&&!human.state.person.down;}
    if(boarding.phase!=='active')return;
    for(const ally of boarding.allies){const crew=this.state.crew.find(c=>c.id===ally.crewId);if(crew){ally.health=crew.health;ally.status=crew.status;}}
    const people=humans.filter(g=>g.state.mode==='person'&&g.state.person.health>0).map(g=>({id:g.playerId,name:g._playerName||(g.playerId==='local'?'You':'Captain'),...g.state.person,game:g,team:'friendly'}));
    const targets=[...people,...boarding.allies.filter(a=>a.health>0)];
    for(const hostile of boarding.enemies){
      if(hostile.health<=0)continue;hostile.cooldown=Math.max(0,(hostile.cooldown||0)-dt);
      const target=targets.filter(t=>t.game?t.game.state.person.health>0:t.health>0).sort((a,b)=>distance(a,hostile)-distance(b,hostile))[0];
      if(!target)continue;
      if(distance(hostile,target)>116||!clearInteriorShot(layout,hostile,target))this._advanceBoardingActor(hostile,target,layout,dt);
      else if(!hostile.cooldown){
        hostile.cooldown=1.05;const shot=this._actorShot(hostile,target);
        if(target.game){const person=target.game.state.person;person.health=Math.max(0,person.health-hostile.damage);person.hitUntil=this.state.stats.time+.24;this._personHit(target,shot,person.health,person.maxHealth||100);if(person.health<=0){person.down=true;target.game._event('person-down',{...shot,id:shot.id+':down',targetId:target.id,targetName:target.name,boardingId:boarding.id,text:`${hostile.name} downed you. Your crew can still clear the deck.`});}}
        else{this._damageCrew(target.crewId,hostile.damage,`Boarding action against ${this.system.enemies.find(e=>e.id===boarding.targetId)?.name||'pirates'}`,shot);this._personHit(target,shot);}
      }
    }
    for(const ally of boarding.allies){
      const crew=this.state.crew.find(c=>c.id===ally.crewId);if(!crew||crew.health<=0)continue;
      ally.health=crew.health;ally.cooldown=Math.max(0,(ally.cooldown||0)-dt);ally.healTimer=Math.max(0,(ally.healTimer||0)-dt);
      if(ally.role==='medic'&&!ally.healTimer){
        const injured=[...people.filter(p=>p.game.state.person.health>0&&p.game.state.person.health<(p.game.state.person.maxHealth||100)),...boarding.allies.filter(a=>a.health>0&&a.health<a.maxHealth)];
        const patient=injured.find(a=>distance(a,ally)<88&&clearInteriorShot(layout,ally,a));
        if(patient){if(patient.game)patient.game.state.person.health=Math.min(patient.game.state.person.maxHealth||100,patient.game.state.person.health+7);else{const c=this.state.crew.find(c=>c.id===patient.crewId);if(c)c.health=Math.min(c.maxHealth,c.health+7);}ally.healTimer=2;}
      }
      const target=boarding.enemies.filter(e=>e.health>0).sort((a,b)=>distance(a,ally)-distance(b,ally))[0];if(!target)continue;
      if(distance(ally,target)>150||!clearInteriorShot(layout,ally,target))this._advanceBoardingActor(ally,target,layout,dt);
      else if(!ally.cooldown){ally.cooldown=ally.role==='security'?.65:.95;const shot=this._actorShot(ally,target);target.health=Math.max(0,target.health-ally.damage);this._personHit(target,shot);if(target.health<=0)this._boarderDown(target,shot);}
    }
    if(boarding.enemies.every(e=>e.health<=0)){this._finishBoarding('won');return;}
    const conscious=humans.some(g=>g.state.person.health>0)||this.livingCrew.length>0;
    boarding.unopposedTime=conscious?0:boarding.unopposedTime+dt;
    if(boarding.unopposedTime>=12)this._finishBoarding('lost');
  }

  _damageCrew(id,amount,cause='Boarding combat',shot=null) {
    const crew=this.state.crew.find(c=>c.id===id);if(!crew||crew.health<=0)return;
    crew.health=Math.max(0,crew.health-amount);crew.status=crew.health<=0?'dead':crew.health<crew.maxHealth?'injured':'active';
    const actor=this.state.boarding?.allies.find(a=>a.crewId===id);if(actor){actor.health=crew.health;actor.status=crew.status;}
    if(crew.health<=0){
      if(!this.state.memorial.some(m=>m.crewId===id))this.state.memorial.push({id:`memorial:${id}`,crewId:id,name:crew.name,species:normalizeSpecies(crew.species),role:crew.role,cause,systemId:this.state.systemId,time:this.state.stats.time,shipClass:this.state.ship.classId});
      this._updateStats(false);this._log(`In memory of ${crew.name}`,`${crew.name}, ${crew.role}, died defending the crew. ${cause}.`,'memorial');
      this._event('crew-death',{...(shot?{id:shot.id+':down',boardingId:shot.boardingId,at:shot.at,until:shot.at+1.5,actorId:actor?.id,targetId:actor?.id,targetName:crew.name,x:actor?.x,y:actor?.y,attackerId:shot.attackerId,actorName:shot.actorName,team:shot.team}:{}),crewId:id,crew,text:`${crew.name} has died. Their name is in your crew memorial.`});
    }
    if(this.state.interior?.kind==='ship')this.state.interior.location.crew=clone(this.state.crew);
  }

  _finishBoarding(phase) {
    const boarding=this.state.boarding;if(boarding?.phase!=='active')return;
    boarding.phase=phase;boarding.endedAt=this.state.stats.time;this.state.person.weaponDrawn=false;for(const human of this._boardingHumans||[])human.state.person.weaponDrawn=false;
    this.syncRescueCombat();
    this.state.boardingHistory.push({id:boarding.id,kind:boarding.kind,phase,vesselId:boarding.vesselId,originVesselId:boarding.originVesselId,systemId:this.state.systemId,time:this.state.stats.time,casualties:boarding.allies.filter(a=>a.health<=0).map(a=>a.crewId)});
    const enemy=this.system.enemies.find(e=>e.id===boarding.targetId);
    if(enemy){
      enemy.boardingCooldown=60;enemy.active=false;enemy.boardingCharge=0;
      if(boarding.kind==='assault'&&enemy.deck){enemy.deck.enemies=boarding.enemies;enemy.deck.shotSerial=boarding.shotSerial||0;}
      if(boarding.kind!=='assault'||phase!=='won'){delete enemy.boardingTargetId;delete enemy.boardingOriginId;}
    }
    if(phase==='won'){
      let reward=boarding.source==='rescued-pirates'?0:boarding.kind==='assault'?95:45;
      if(enemy&&boarding.kind==='assault'){
        reward=enemy.deck.rewardClaimed?0:reward;enemy.deck.cleared=true;enemy.deck.rewardClaimed=true;
        enemy.capturedBy=boarding.leaderId||this._boardingLeaderId||this.playerId;enemy.disabled=true;
        enemy.deck.occupation=enemy.occupation={boarderId:enemy.capturedBy,controllerId:enemy.capturedBy,contested:false};
      }else if(enemy){enemy.disabled=true;enemy.vx=0;enemy.vy=0;}
      this.state.credits+=reward;
      this.state.stats.boardingsWon=(this.state.stats.boardingsWon||0)+1;this._flag('won_ground_fight');this._flag(boarding.kind==='assault'?'captured_vessel':'repelled_boarders');
      const text=boarding.source==='rescued-pirates'?'The hijackers are defeated. Your ship is secure; the people who tried to seize it are accounted for.':boarding.kind==='assault'?`Deck secure. ${reward} credits recovered. ${enemy?.name||'The target'} remains a separate damaged vessel. Return across the tether or take its helm.`:`Boarders repelled. ${reward} credits recovered. The pirate hull remains outside.`;
      this._event('boarding-complete',{phase,vesselId:boarding.vesselId,originVesselId:boarding.originVesselId,text});
      this._log(boarding.kind==='assault'?'The prize is secured':'The deck is ours',`${reward} credits recovered. ${this.livingCrew.length} crew members survived.`,'boarding');
      if(this.state.person.health<=0){this.state.person.health=35;this.state.person.down=false;}
    }else if(phase==='lost'){
      this.state.stats.boardingsLost=(this.state.stats.boardingsLost||0)+1;
      if(enemy?.deck&&boarding.kind==='assault'){enemy.deck.occupation=enemy.occupation={boarderId:null,controllerId:enemy.capturedBy||null,contested:false};}
      if(this.netOnBoardingLost?.(boarding)===true)return;
      if(boarding.kind==='defense')this._abandonOccupiedShip(boarding,enemy);
      this.state.mode='ship';this.state.locationId=null;this.state.interior=null;
      this.state.person.health=55;this.state.person.down=false;
      this._rescue(boarding.kind==='defense'?'Your escape capsule reached the station. The occupied ship remains in space; a recovery cutter carries the survivors.':'The surviving boarding party escaped to a station. The target remains in space with its surviving defenders.');
      this._event('boarding-complete',{phase,text:boarding.kind==='defense'?'Your ship is occupied. Survivors recovered at port aboard a basic cutter; crew casualties remain in the memorial.':'The boarding party withdrew after defeat. Surviving guards still hold the target.'});
    }else if(phase==='retreated'){
      this._releaseBoardingTether();
      this._event('boarding-complete',{phase,text:'Boarding party withdrawn. The damaged vessel and its surviving crew remain in the system.'});
    }
    this._syncBoardedVessel();
  }

  _abandonOccupiedShip(boarding,raider) {
    if(this.state.npcContract?.active&&this.recoverNpcContract?.('The employer’s hull was overrun. The port rescue service recovered the surviving crew.'))return;
    if(!this.ownsShip)return this.recoverOnFoot('The port rescue service recovered you. You still need to earn a ship of your own.');
    this.professionRescue?.();
    this.syncRescueCombat();
    const ship=this.state.ship,id=ship.id,hostiles=boarding.enemies.filter(e=>e.health>0);
    const occupied={id,name:ship.name||'Occupied ship',classId:ship.classId,...enemyHullProfile(ship.classId),x:ship.x,y:ship.y,vx:0,vy:0,angle:ship.angle,
      hp:Math.max(1,ship.hull),maxHp:ship.maxHull,faction:raider?.faction||'cinder',disabled:true,active:false,speed:ship.speed,damage:ship.damage,reward:0,cooldown:999,
      deck:{shipClass:ship.classId,enemies:hostiles,cleared:false,rewardClaimed:true,occupation:{boarderId:raider?.id||'pirates',controllerId:raider?.id||'pirates',contested:true}},storedUpgrades:clone(this.state.upgrades),
      energy:ship.energy,damageControl:ship.damageControl?clone(ship.damageControl):null,rescueGroups:clone(ship.rescueGroups||[]),rescueHistory:clone(ship.rescueHistory||[])};
    occupied.occupation=occupied.deck.occupation;
    const old=this.system.enemies.findIndex(enemy=>enemy.id===id),record=this._record(),saved=record.spawned.findIndex(enemy=>enemy.id===id);
    if(old>=0)this.system.enemies.splice(old,1,occupied);else this.system.enemies.push(occupied);
    if(saved>=0)record.spawned.splice(saved,1,clone(occupied));else record.spawned.push(clone(occupied));
    const replacement=initialState(this.state.seed).ship;
    this.state.ship={...replacement,id:`recovery-${hash(`${id}:${this.state.stats.time}`).toString(36)}`,name:'Recovery cutter'};this.state.upgrades={};this._updateStats(false);
  }

  healCrew(id) {
    if(!this.atInhabitedPort)return this._fail('Crew treatment is available at port infirmaries.','mode');
    const crew=this.state.crew.find(c=>c.id===id);
    if(!crew||crew.health<=0)return this._fail('This crew member cannot receive treatment.','target');
    const cost=Math.ceil((crew.maxHealth-crew.health)*.4);
    if(!cost)return this._fail('This crew member is already healthy.','full');
    if(this.state.credits<cost)return this._fail(`Treatment costs ${cost} credits.`,'cost');
    this.state.credits-=cost;crew.health=crew.maxHealth;crew.status='active';this._event('crew',{crew,text:`${crew.name} recovered at the infirmary.`});return this._ok({cost,crew});
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
    const result = this._ok({ first });
    if (type === 'work' && first) this.observeOpeningAction('recordActivity', { type, ...details }, result);
    return result;
  }

  _relocateLegacyJobs() {
    for (const mission of this.state.missions) {
      if (mission.status === 'completed' || this.state.completedJobs.includes(mission.id)) continue;
      const targetSystem = this.galaxy.find(system => system.id === mission.targetSystem);
      const formerBody = targetSystem?.bodies.find(body => body.id === mission.targetBody);
      if (!formerBody || hasPortServices(formerBody)) continue;
      const originSystem = this.galaxy.find(system => system.id === mission.originSystem);
      const originBody = originSystem?.bodies.find(body => body.id === mission.originBody && hasPortServices(body));
      const destinationSystem = originBody ? originSystem : targetSystem;
      const destination = originBody || destinationSystem.bodies.find(hasPortServices);
      if (!destination) continue;
      mission.relocatedFrom = { systemId: targetSystem.id, bodyId: formerBody.id };
      mission.targetSystem = destinationSystem.id;
      mission.targetBody = destination.id;
      if (mission.type === 'delivery') {
        mission.title = `A parcel for ${destination.name}`;
        mission.description = `Carry the sealed medicine parcel to ${destination.name}. Its contract exchange now handles the ${formerBody.name} handoff.`;
      } else if (mission.type === 'work') {
        mission.description = `Complete any remaining service panels at ${destination.name}, then return to its contract exchange. Your recorded work carries over.`;
      } else {
        mission.description = `${mission.description || 'Complete the recorded contract requirements.'} Payment has moved from ${formerBody.name} to ${destination.name}.`;
      }
      this._log('Contract exchange moved', `${mission.title}: ${formerBody.name} no longer has a staffed exchange. Finish this contract at ${destination.name}. Your agreed ${mission.reward} credits and recorded work are unchanged.`, 'job');
    }
  }

  availableJobs(bodyId = this.state.locationId || this.state.lastBodyId) {
    // Protected ports no longer invent raiders for old contracts. Keep their
    // agreed pay and existing evidence while moving only the patrol scope.
    for(const mission of this.state.missions){
      const origin=this.galaxy.find(system=>system.id===mission.originSystem);
      if(mission.type==='bounty'&&mission.status!=='completed'&&!mission.bountyScope&&origin&&systemContext(origin).backgroundHostileCount===0){
        const port=this.galaxy.find(system=>system.id===mission.targetSystem)?.bodies.find(body=>body.id===mission.targetBody);
        mission.bountyScope='frontier';
        mission.description=`The port watch has extended this contract to frontier routes. Defeat hostile ships there, then return to ${port?.name||'the original contract exchange'} for the agreed ${mission.reward} credits. Your recorded progress carries over.`;
      }
    }
    const body = this.system.bodies.find(b => b.id === bodyId);
    if (!hasPortServices(body)) return [];
    const epoch = Math.floor(this.state.stats.jobs / 4);
    const root = `${this.state.systemId}:${bodyId}:jobs:${epoch}`;
    // A port never runs out of ordinary paid work. Each finished shift opens a
    // fresh set of relay tasks independently of space-only contract progress.
    const workRoot=`${this.state.systemId}:${bodyId}:jobs:`;
    const currentWork=this.state.missions.find(m=>m.type==='work'&&m.originSystem===this.state.systemId&&m.originBody===bodyId&&m.status!=='completed');
    const shifts=this.state.completedJobs.filter(id=>id.startsWith(workRoot)&&id.endsWith(':work')).length;
    const workId=currentWork?.id||`${workRoot}shift-${shifts}:work`;
    const otherBody = this.system.bodies.find(b => b.id !== bodyId && hasPortServices(b)) || body;
    const definitions = [
      { id: workId, type: 'work', title: 'An honest shift', description: 'Repair three service panels on foot, then return to the job board. No ship or entry fee required; another paid shift is available after this one.', goal: 3, reward: 120, oreCost: 0, targetBody: bodyId, targetSystem: this.state.systemId, faction: body.faction, icon: 'tool' },
      { id: `${root}:delivery`, type: 'delivery', title: `A parcel for ${otherBody.name}`, description: `Carry a sealed medicine parcel to ${otherBody.name}. Hand it in at the local job board.`, goal: 1, reward: 145, oreCost: 0, targetBody: otherBody.id, targetSystem: this.state.systemId, faction: 'lantern', icon: 'parcel' },
      { id: `${root}:mining`, type: 'mining', title: 'Hull metal wanted', description: 'Bring six units of ore to this port. The yard pays above the open market.', goal: 6, reward: 150, oreCost: 6, targetBody: bodyId, targetSystem: this.state.systemId, faction: body.faction, icon: 'ore' },
      { id: `${root}:survey`, type: 'survey', title: 'Signals in the dark', description: 'Scan two unexplored signals in this system, then return with your survey.', goal: 2, reward: 160, oreCost: 0, targetBody: bodyId, targetSystem: this.state.systemId, faction: 'lantern', icon: 'scan' },
      { id: `${root}:bounty`, type: 'bounty', bountyScope:'local', title: 'Keep the lanes clear', description: 'Defeat two hostile ships in this system. The port will pay when you return.', goal: 2, reward: 220, oreCost: 0, targetBody: bodyId, targetSystem: this.state.systemId, faction: body.faction, icon: 'target' }
    ];
    const targets=this.system.enemies.filter(enemy=>enemy.hp>0&&enemy.id.startsWith(`${this.state.systemId}:raider:`)&&!enemy.surrendered&&!enemy.capturedBy&&!enemy.promotedVesselId&&!enemy.canonicalVesselId);
    return definitions.filter(d=>d.type!=='bounty'||this.state.missions.some(m=>m.id===d.id)||this.state.completedJobs.includes(d.id)||systemContext(this.currentSystem).backgroundHostileCount>=2&&targets.length>=d.goal).map(d => {
      const mission = this.state.missions.find(m => m.id === d.id);
      return { ...d, ...(mission?.type==='bounty'?{description:mission.description,bountyScope:mission.bountyScope}:{}), reward:mission?.reward ?? Math.round(d.reward*this.characterEffects.jobRewards), originBody: bodyId, originSystem: this.state.systemId, status: this.state.completedJobs.includes(d.id) ? 'completed' : mission?.status || 'available', progress: mission?.progress || 0 };
    });
  }
  acceptJob(id) {
    if (!this.atInhabitedPort) return this._fail('Visit a job board at an inhabited port to take work.', 'mode');
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
      if(m.type==='bounty'){
        const origin=this.galaxy.find(system=>system.id===m.originSystem);
        if(!m.bountyScope&&origin&&systemContext(origin).backgroundHostileCount===0){
          const port=this.galaxy.find(system=>system.id===m.targetSystem)?.bodies.find(body=>body.id===m.targetBody);
          m.bountyScope='frontier';
          m.description=`The port watch has extended this contract to frontier routes. Defeat hostile ships there, then return to ${port?.name||'the original contract exchange'} for the agreed ${m.reward} credits. Your recorded progress carries over.`;
        }
        if(typeof details.token!=='string'||!this._record().defeated.includes(details.token))continue;
        if(m.bountyScope==='frontier'?systemContext(this.currentSystem).backgroundHostileCount===0:m.originSystem!==this.state.systemId)continue;
      }else if (m.type !== 'work' && m.originSystem !== this.state.systemId) continue;
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
    if (!this.atInhabitedPort) return this._fail('Visit the destination job board at an inhabited port to collect payment.', 'mode');
    const m = this.state.missions.find(job => job.id === id);
    if (!m || m.status === 'completed' || this.state.completedJobs.includes(id)) return this._fail('This contract has already been paid or is not active.', 'duplicate');
    this._refreshJobs();
    if (m.status !== 'ready') return this._fail('This contract still has work left to do.', 'requirements');
    if (m.targetSystem !== this.state.systemId || m.targetBody !== this.state.locationId) return this._fail('Payment is waiting at the contract destination.', 'location');
    if(m.oreCost&&this.ownsShip&&!this.canUseOwnShipHere())return this._fail('Bring the ship holding this ore to the destination before unloading it.','ship-location');
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
    const vesselAccess=this.ownShipAccess({atPort:true});if(!vesselAccess.ok)return {...vesselAccess,upgrade:u};
    if (this.state.upgrades[id]) return { ...this._fail('Already installed.', 'owned'), upgrade: u, owned: true };
    const requirements = [...new Set([...(u.requires || []), ...(u.id === 'fold_1' ? ['thrusters_1', 'scanner_1'] : [])])];
    const missing = requirements.filter(required => !this.state.upgrades[required] && !Object.keys(this.state.upgrades).some(k => normId(k) === normId(required)));
    if (missing.length) return { ...this._fail(`Requires ${missing.map(k => UPGRADES.find(v => v.id === k)?.name || k).join(' and ')}.`, 'prerequisite'), upgrade: u };
    if (!this.conditionsMet(u.conditions) || (id === 'fold_1' && !this.hasFlag('belt_signal_found'))) return { ...this._fail('Finish Something in the belt before Iona can calibrate the Fold Drive.', 'story'), upgrade: u };
    if (this.state.credits < u.cost || this.state.cargo.ore < (u.ore || 0)) return { ...this._fail(`Needs ${u.cost} credits${u.ore ? ` and ${u.ore} ore` : ''}.`, 'cost'), upgrade: u };
    return this._ok({ upgrade: u });
  }
  buyUpgrade(id) {
    if (!this.atInhabitedPort) return this._fail('Visit an inhabited port outfitter to fit an upgrade.', 'mode');
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
    if(['repair','refuel','emergency'].includes(action)){
      const access=this.ownShipAccess({atPort:true});if(!access.ok)return {action,cost:0,label:{repair:'Repair hull',refuel:'Fill fuel tanks',emergency:'Emergency port assistance'}[action],unavailable:true,...access};
    }
    const sh = this.state.ship,condition=this.worldDirector?.conditions?.[`${this.state.systemId}:${this.state.locationId}`];
    const localRate=condition&&condition.until>this.worldDirector.time?condition.serviceMultiplier:1;
    const rate=this.characterEffects.serviceCost*clamp(finite(localRate,1),.8,1.2);
    if (action === 'repair') return { action, cost: Math.ceil(Math.max(0, sh.maxHull - sh.hull) * 0.65 * rate), label: 'Repair hull' };
    if (action === 'refuel') return { action, cost: Math.ceil(Math.max(0, sh.maxFuel - sh.fuel) * 2 * rate), label: 'Fill fuel tanks' };
    if (action === 'rest') return { action, cost: Math.ceil(Math.max(0,(this.state.person.maxHealth||100) - this.state.person.health) * 0.25 * rate), label: 'Visit the infirmary' };
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
    if (!this.atInhabitedPort) return this._fail('Services and trading are available at inhabited ports.', 'mode');
    if(['repair','refuel','emergency'].includes(action)||this.ownsShip&&action.startsWith('sell')){const access=this.ownShipAccess({atPort:true});if(!access.ok)return access;}
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
    if (action === 'repair') { sh.hull = sh.maxHull; clearInteriorDamage(sh); }
    if (action === 'refuel') sh.fuel = sh.maxFuel;
    if (action === 'rest') this.state.person.health = this.state.person.maxHealth || 100;
    this._event('service', { text: `${quote.label} · −${quote.cost} cr` });
    return this._ok({ cost: quote.cost, text: quote.label });
  }

  _rescue(message) {
    if(this.state.npcContract?.active&&this.recoverNpcContract?.(message))return;
    if(!this.ownsShip)return this.recoverOnFoot(message);
    const sh = this.state.ship;
    delete sh.destroyed;
    const body = this.system.bodies.find(b => b.kind === 'station') || this.system.bodies[0];
    sh.hull = Math.ceil(sh.maxHull * 0.6); sh.shield = 0; sh.energy = sh.maxEnergy;
    clearInteriorDamage(sh);
    sh.x = body.x; sh.y = body.y + body.radius + 80; sh.vx = 0; sh.vy = 0;
    this.state.livelihoods.parkedShip=null;
    this.state.cargo.ore = Math.floor(this.state.cargo.ore * 0.5);
    this.state.cargo.crystal = Math.floor(this.state.cargo.crystal * 0.5);
    const cost = Math.floor(this.state.credits * 0.12); this.state.credits -= cost;
    sh.fuel = Math.max(8, sh.fuel);
    this.state.stats.rescues++;
    this.narrativeRescue();
    this.professionRescue?.();
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

Object.assign(Game.prototype, ExpeditionRules, NarrativeRules, ProfessionRules, RescueRules, InteriorDamageRules, LivelihoodRules, NpcContractRules, OpeningMissionRules);
export default Game;
