import { Game, distance, seededRandom } from '../dist/engine.mjs';
import { getShipClass, SHIP_CLASSES, STATION_ROLES } from '../dist/fleet.mjs';
import { generateSurface, movePerson, nearestEntity, repairSolution, isWalkable } from '../dist/surface.mjs';
import { ENCOUNTERS, DIALOGUE, UPGRADES, LORE } from '../dist/content.mjs';
import { PersistenceConflict } from './persistence.mjs';
import { BoardingAuthority } from './boarding.mjs';
import { normalizeCameraPreferences } from '../dist/camera-preferences.mjs';
import { explorationLocation, createSiteState, stepSiteEncounter } from '../dist/exploration.mjs';
import { clone, clamp, finite, cleanName, newCaptainId, newSecret, secretHash, verifySecret, MAX_ONLINE, DISCONNECT_GRACE_MS, INPUT_TIMEOUT_MS, SURFACE_RANGE, EMPTY_INPUT, cleanInput, fail, ok, MOTION_STATE_FIELDS, MOTION_WORLD_FIELDS } from './protocol.mjs';

const HOST_FIELDS = ['cargo', 'upgrades', 'fleet', 'crew', 'formerCrew', 'memorial', 'boarding', 'boardingHistory', 'flags', 'rep', 'stats', 'knownLore', 'completedChapters', 'missions', 'completedJobs', 'abandonedJobs', 'activityTokens', 'journal'];
const ROLE_ALIASES = { engineer: 'engineering', medic: 'medical', gunner: 'weapons', navigator: 'navigation', scientist: 'scanner' };
const roleName = value => ROLE_ALIASES[value] || value;
const now = () => Date.now();
const starterHome = () => ({ kind: 'port', systemId: 'hearth', locationId: 'kettle' });
const usable = result => result && result.ok !== false;
const smallId = value => typeof value === 'string' && value.length > 0 && value.length < 160;

/** One authority for an invitation realm. Simulation never awaits a network client. */
export class Realm extends BoardingAuthority {
  constructor({ id, name, seed, persistence, version = 0, snapshot = null, onConflict = () => {} }) {
    super();
    this.id = id; this.name = snapshot?.name || cleanName(name, 'Farwake friends'); this.seed = snapshot?.seed || seed || `realm-${id}`;
    this.persistence = persistence; this.version = version; this.onConflict = onConflict;
    this.createdAt = snapshot?.createdAt || now(); this.ownerId = snapshot?.ownerId || null;
    this.captains = new Map(); this.vessels = new Map(); this.rooms = new Map(); this.worlds = snapshot?.worlds || {}; this.leases = snapshot?.leases || {}; this.sites = snapshot?.sites || {}; this.normalizedSites = new Set();
    this.revision = 0; this.persistedRevision = 0; this.flushing = null; this.storageError = null; this.conflicted = false; this.tick = 0; this.simulatedAt = now();
    for (const data of Object.values(snapshot?.captains || {})) {
      const { cameraPreferences: localCameraPreferences, cameraRevision: localCameraRevision, ...savedGame } = data.game || {};
      const game = Game.fromSave({ ...savedGame, seed: this.seed, worlds: {} });
      const disconnectUntil = data.aboard && (data.crewRole !== 'passenger' || game.state.mode === 'ship') ? Math.max(now(), (data.lastSeen || now()) + DISCONNECT_GRACE_MS) : 0;
      this.captains.set(data.id, { ...data, game, cameraPreferences: normalizeCameraPreferences(data.cameraPreferences), cameraRevision: Number.isSafeInteger(data.cameraRevision) && data.cameraRevision >= 0 ? data.cameraRevision : 0, session: null, input: { ...EMPTY_INPUT }, inputSeq: 0, ack: 0, inputAt: 0, disconnectUntil, events: [], recentCommands: data.recentCommands || [], surfaceCache: null, needsRestoration: true });
    }
    for (const data of Object.values(snapshot?.vessels || {})) {
      const owner = this.captains.get(data.ownerId); if (!owner) continue;
      const vessel = { ...data, actor: null, grants: data.grants || {}, bunks: data.bunks || {}, installedBunks: data.installedBunks ?? 1 };
      vessel.ship = data.ship || (data.id === owner.ownedVesselId ? owner.game.state.ship : null); if (!vessel.ship) continue;
      vessel.ship.id = vessel.id; vessel.boarding = data.boarding ?? (data.id === owner.ownedVesselId ? owner.game.state.boarding : null);
      if (data.id === owner.ownedVesselId) owner.game.state.ship = vessel.ship;
      vessel.inventory ||= { crew: [], formerCrew: [], memorial: [], boardingHistory: [] };
      this.vessels.set(vessel.id, vessel);
    }
    for (const captain of this.captains.values()) if (!this.vessels.has(captain.ownedVesselId)) this._createVessel(captain);
    this._migrateLegacyBoarding();
  }

  get onlineCount() { return [...this.captains.values()].filter(c => c.session).length; }
  markDirty() { return ++this.revision; }
  _createVessel(captain) {
    const id = captain.ownedVesselId || `vessel_${captain.id}`; captain.ownedVesselId = id;
    const vessel = { id, ownerId: captain.id, name: 'Cinder', systemId: captain.game.state.systemId, dockedAt: captain.game.state.mode === 'person' && !captain.game.state.interior ? captain.game.state.locationId : null, ship: captain.game.state.ship, allowCrew: false, grants: {}, helmOwner: captain.game.state.mode === 'ship' ? captain.id : null, bunks: { 0: captain.id }, installedBunks: 1, actor: null, flightAssist: true, boarding: null, hostileTo: [] };
    vessel.ship.id = id; this.vessels.set(id, vessel); return vessel;
  }
  async createCaptain(name, options = {}) {
    if (this.conflicted || this.storageError) throw new Error('Realm persistence is temporarily unavailable.');
    if (this.onlineCount >= MAX_ONLINE) throw new Error('This realm already has ten online captains.');
    if (this.captains.size >= 256) throw new Error('This realm has reached its saved-passport limit.');
    const id = newCaptainId(), token = newSecret(), game = new Game(this.seed, {...options, name:cleanName(name)});
    const angle = this.captains.size * 2.399963;
    game.state.ship.x = Math.sin(angle) * 155; game.state.ship.y = Math.cos(angle) * 155;
    const captain = { id, name: cleanName(name), tokenHash: secretHash(token), createdAt: now(), lastSeen: now(), home: starterHome(), game, cameraPreferences: normalizeCameraPreferences(), cameraRevision: 0, ownedVesselId: `vessel_${id}`, aboard: `vessel_${id}`, crewRole: 'helm', session: null, input: { ...EMPTY_INPUT }, inputSeq: 0, ack: 0, inputAt: 0, disconnectUntil: 0, events: [], recentCommands: [], surfaceCache: null };
    this.captains.set(id, captain); this._createVessel(captain); if (!this.ownerId) this.ownerId = id;
    const revision = this.markDirty(); await this.flush(revision);
    return { captain, passport: { realmCode: this.id, captainId: id, token } };
  }
  authenticate(passport) {
    const captain = this.captains.get(passport?.captainId);
    if (!captain || !verifySecret(passport.token, captain.tokenHash)) return null;
    return captain;
  }
  attach(captain, session) {
    if (!captain.session && this.onlineCount >= MAX_ONLINE) return fail('Ten captains are already online in this realm.', 'realm-full');
    if (this.conflicted || this.storageError) return fail('This realm is waiting for durable storage to recover.', 'storage');
    if (captain.session && captain.session !== session) captain.session.close(4009, 'This passport connected in another window.');
    captain.session = session; captain.disconnectUntil = 0; captain.input = { ...EMPTY_INPUT }; captain.inputAt = 0; captain.inputSeq = 0; captain.ack = 0;
    if (captain.needsRestoration) {
      captain.needsRestoration = false;
      if (now() - (captain.lastSeen || this.createdAt) > DISCONNECT_GRACE_MS) this._restoreAtHome(captain);
    }
    captain.lastSeen = now(); this._bindCaptain(captain);
    if (captain.game.state.mode === 'person') this._ensurePersonPosition(captain);
    this.markDirty(); return ok();
  }
  detach(captain, session) {
    if (captain.session !== session) return;
    captain.session = null; captain.lastSeen = now(); captain.disconnectUntil = now() + DISCONNECT_GRACE_MS; captain.input = { ...EMPTY_INPUT };
    captain.combatAtDisconnect = this._inCombat(this.vessels.get(captain.aboard || captain.ownedVesselId));
    this.markDirty(); this.flush().catch(() => {});
  }
  acceptInput(captain, seq, input) {
    if (!Number.isSafeInteger(seq) || seq <= captain.inputSeq || seq > captain.inputSeq + 2000) return false;
    captain.inputSeq = seq; captain.input = cleanInput(input); captain.inputAt = now(); return true;
  }

  _room(systemId) {
    let room = this.rooms.get(systemId); if (room) return room;
    const saved = this.worlds[systemId] || {}, coordinator = new Game(this.seed);
    coordinator.state.systemId = systemId; coordinator.state.worlds = { [systemId]: saved.record || {} }; coordinator._loadSystem(systemId);
    const record = coordinator.state.worlds[systemId], runtime = coordinator.system;
    for (const key of ['enemies', 'traffic']) if (Array.isArray(saved[key])) {
      const positions = new Map(saved[key].map(e => [e.id, e]));
      for (const entity of runtime[key]) { const prior = positions.get(entity.id); if (prior) for (const field of ['x', 'y', 'angle', 'vx', 'vy', 'hp', 'cooldown']) if (Number.isFinite(prior[field])) entity[field] = prior[field]; }
    }
    // Empty rooms do not run combat. Only a bounded amount of harmless traffic motion catches up.
    const elapsed = Math.min(15, Math.max(0, (now() - (saved.savedAt || now())) / 1000));
    for (const traffic of runtime.traffic) { traffic.x = clamp(traffic.x + Math.cos(traffic.angle) * traffic.speed * elapsed, -2300, 2300); traffic.y = clamp(traffic.y + Math.sin(traffic.angle) * traffic.speed * elapsed, -2300, 2300); }
    coordinator.bindSharedWorld(runtime, record, `world:${systemId}`); coordinator.netTargetEligible = false;
    room = { systemId, coordinator, runtime, record, lastActive: now(), ticks: 0 }; this.rooms.set(systemId, room);
    for (const vessel of this.vessels.values()) if (vessel.systemId === systemId && vessel.npcEnemyId) this._linkNpcVessel(vessel);
    return room;
  }
  _captureRoom(room) {
    room.coordinator._persistRuntime();
    const fields = entity => Object.fromEntries(['id', 'x', 'y', 'angle', 'vx', 'vy', 'hp', 'cooldown'].filter(key => entity[key] !== undefined).map(key => [key, entity[key]]));
    this.worlds[room.systemId] = { record: clone(room.record), enemies: room.runtime.enemies.map(fields), traffic: room.runtime.traffic.map(fields), savedAt: now() };
  }
  _bindCaptain(captain) {
    const vessel = captain.aboard && this.vessels.get(captain.aboard);
    if (vessel) captain.game.state.systemId = vessel.systemId;
    const room = this._room(captain.game.state.systemId);
    captain.game.bindSharedWorld(room.runtime, room.record, captain.id); this._bindExploration(captain); captain.game._playerName = captain.name; room.lastActive = now(); return room;
  }
  _prepareExploration(captain, bodyId, siteId) {
    const game=captain.game, body=game.system.bodies.find(value=>value.id===bodyId), location=body&&explorationLocation(body,siteId,this.seed);
    if(!location)return null;
    const key=`${game.state.systemId}:${bodyId}:${siteId}`;
    if(!this.normalizedSites.has(key)){
      this.sites[key]=createSiteState(location.site,this.sites[key]||game.state.exploration?.encounter);
      this.normalizedSites.add(key);
    }
    game.state.explorationRecords=this.sites;
    return this.sites[key];
  }
  _bindExploration(captain) {
    const active=captain.game.state.exploration;
    captain.game.state.explorationRecords=this.sites;
    if(!active)return;
    const encounter=this._prepareExploration(captain,active.bodyId,active.siteId);
    if(encounter)active.encounter=encounter;
  }
  _stepExplorations(captains,dt) {
    const groups=new Map();
    for(const captain of captains){const active=captain.game.state.exploration;if(!active)continue;if(!groups.has(active.key))groups.set(active.key,[]);groups.get(active.key).push(captain);}
    for(const crew of groups.values()){
      const leader=crew[0],encounter=leader.game.state.exploration.encounter,surface=this._surface(leader);
      const events=stepSiteEncounter(encounter,crew.map(c=>c.game.explorationParticipant(c.appliedInput||EMPTY_INPUT)),dt,surface);
      for(const captain of crew){
        const game=captain.game;game.recordExplorationEvents(events);
        if(game.state.person.health<=0){game._siteDownTime=(game._siteDownTime||0)+dt;if(game._siteDownTime>=2.5){game._returnFromSite(true);captain.surfaceCache=null;}}
        else game._siteDownTime=0;
      }
    }
  }
  _actor(vessel) {
    const owner = this.captains.get(vessel.ownerId), beneficiary = this.captains.get(vessel.occupation?.controllerId) || this.captains.get(vessel.boardingLeaderId) || owner, room = this._room(vessel.systemId), primary = vessel.id === owner.ownedVesselId;
    if (!vessel.actor) vessel.actor = Game.fromSave({ ...owner.game.save(), systemId: vessel.systemId, mode: 'ship', locationId: null, interior: null, boarding: null, ship: vessel.ship, worlds: {} });
    const actor = vessel.actor;
    for (const field of HOST_FIELDS) if (!['cargo', 'upgrades', 'crew', 'formerCrew', 'memorial', 'boarding', 'boardingHistory'].includes(field)) actor.state[field] = beneficiary.game.state[field];
    const inventory = this._inventoryFor(vessel);
    for (const field of ['cargo', 'upgrades', 'crew', 'formerCrew', 'memorial', 'boardingHistory']) actor.state[field] = inventory[field];
    actor.state.boarding = vessel.pvp ? null : vessel.boarding || null;
    actor.state.ship = vessel.ship; actor.state.credits = beneficiary.game.state.credits; actor._creditBaseline = beneficiary.game.state.credits; actor._economyCaptainId = beneficiary.id;
    actor.state.character = (this.captains.get(vessel.helmOwner)||beneficiary).game.state.character;
    actor.state.exploration=null; actor.state.explorationRecords={};
    actor.state.systemId = vessel.systemId; actor.state.mode = vessel.dockedAt ? 'person' : 'ship'; actor.state.locationId = vessel.dockedAt || null;
    actor.state.interior = null; actor.state.person = owner.aboard === vessel.id ? owner.game.state.person : { x: 0, y: 0, health: 100, facing: 'up' };
    const leader = this.captains.get(vessel.boardingLeaderId), assaultPresent = leader?.aboard === vessel.id && leader.game.state.mode === 'person' && leader.game.state.interior?.kind === 'enemy';
    if (vessel.combatInterior && vessel.boarding?.kind === 'assault' && assaultPresent) { actor.state.interior = clone(vessel.combatInterior); actor.state.mode = 'person'; actor.state.locationId = `ship:${vessel.id}`; actor.state.person = leader.game.state.person; }
    actor.state.pendingEncounter = null; actor.state.nextEncounterAt = Infinity;
    actor.state.ship.humanOccupants = [...this.captains.values()].filter(c => c.aboard === vessel.id).length;
    actor.bindSharedWorld(room.runtime, room.record, beneficiary.id); actor.netVesselId = vessel.id; actor.netTargetEligible = !vessel.dockedAt && !vessel.destroyed;
    actor._boardingLeaderId = vessel.boardingLeaderId || vessel.helmOwner || owner.id; actor._playerName = this.captains.get(actor._boardingLeaderId)?.name || owner.name;
    actor.startBoarding = enemyId => {
      if (vessel.pvp?.phase === 'active' || vessel.npcOccupied) return fail('A boarding party already contests this deck.', 'boarding');
      const result = Game.prototype.startBoarding.call(actor, enemyId);
      if (result.ok) { vessel.pvp = null; vessel.boardingLeaderId = vessel.helmOwner || actor._boardingLeaderId; }
      return result;
    };
    actor.netCanDamage = other => this._shipsHostile(vessel, this.vessels.get(other.netVesselId || other.state.ship.id));
    actor.netOnShipDestroyed = details => this._destroyVessel(vessel, details);
    actor.netOnBoardedTargetDestroyed = () => this._destroyVessel(vessel);
    actor.netOnBoardingLost = boarding => {
      if (boarding.kind === 'defense') { vessel.npcOccupied = true; vessel.npcHostile = true; vessel.occupation = { boarderId: boarding.targetId, controllerId: null, contested: true }; }
      for (const captain of [...this.captains.values()]) if (captain.aboard === vessel.id) this._recoverCaptain(captain, `Your escape capsule reached a safe port. ${vessel.name} remains damaged and occupied in space.`);
      return true;
    };
    return actor;
  }
  _syncActor(vessel) {
    const owner = this.captains.get(vessel.ownerId), actor = vessel.actor; if (!actor || !owner) return;
    const beneficiary = this.captains.get(actor._economyCaptainId) || owner;
    beneficiary.game.state.credits += actor.state.credits - (actor._creditBaseline ?? actor.state.credits); actor.state.credits = beneficiary.game.state.credits; actor._creditBaseline = actor.state.credits;
    vessel.ship = actor.state.ship;
    const primary = vessel.id === owner.ownedVesselId, inventory = this._inventoryFor(vessel);
    if (primary) owner.game.state.ship = vessel.ship;
    for (const key of ['cargo', 'upgrades', 'crew', 'formerCrew', 'boardingHistory', 'memorial']) if (actor.state[key] !== undefined) inventory[key] = actor.state[key];
    if (!vessel.pvp) vessel.boarding = actor.state.boarding;
    if (primary) owner.game.state.boarding = owner.aboard === vessel.id ? vessel.boarding : null;
    if (vessel.boarding?.phase === 'active' && vessel.boarding.kind === 'defense' && vessel.lastBoardingId !== vessel.boarding.id) {
      vessel.lastBoardingId = vessel.boarding.id;
      const helm = this.captains.get(vessel.helmOwner);
      if (helm?.aboard === vessel.id) this._cabin(helm, vessel);
      vessel.helmOwner = null;
    }
    const boarding = vessel.boarding;
    if (boarding && boarding.phase !== 'active' && vessel.lastBoardingOutcome !== `${boarding.id}:${boarding.phase}`) {
      vessel.lastBoardingOutcome = `${boarding.id}:${boarding.phase}`;
      if (boarding.phase === 'won') {
        vessel.npcOccupied = false; vessel.npcHostile = false;
        if (vessel.npcEnemyId && boarding.kind === 'assault') { vessel.captured = true; if (this.captains.has(vessel.boardingLeaderId)) vessel.ownerId = vessel.boardingLeaderId; vessel.occupation = { boarderId: vessel.boardingLeaderId, controllerId: vessel.boardingLeaderId, controllerTeam: vessel.ownerId, contested: false }; }
        for (const captain of this.captains.values()) if (captain.aboard === vessel.id && (captain.game.state.person.health <= 0 || captain.game.state.person.down)) { captain.game.state.person.health = 35; captain.game.state.person.down = false; }
      }
    }
    this._linkNpcVessel(vessel);
    const events = actor.drainEvents();
    for (const captain of this.captains.values()) if (captain.aboard === vessel.id || captain.id === owner.id) captain.events.push(...events);
  }
  _withShip(captain, vessel, callback, { forceShip = false } = {}) {
    const fields = ['cargo', 'upgrades', 'crew', 'formerCrew', 'memorial', 'boardingHistory'], inventory = this._inventoryFor(vessel), state = captain.game.state;
    const original = Object.fromEntries(['ship', ...fields].map(key => [key, state[key]])), mode = state.mode;
    const primary = captain.id === vessel.ownerId && captain.ownedVesselId === vessel.id;
    state.ship = vessel.ship; for (const field of fields) state[field] = inventory[field];
    if (forceShip) state.mode = 'ship';
    try { return callback(); } finally {
      vessel.ship = state.ship; for (const field of fields) inventory[field] = state[field];
      if (!primary) for (const [key, value] of Object.entries(original)) state[key] = value;
      if (forceShip) state.mode = mode;
    }
  }
  _inCombat(vessel) {
    if (!vessel || vessel.dockedAt) return false;
    const room = this.rooms.get(vessel.systemId);
    return !!(vessel.actor?._hitTimer > 0 || vessel.boarding?.phase === 'active' || vessel.pvp?.phase === 'active' || room?.runtime.enemies.some(e => e.hp > 0 && e.active && distance(e, vessel.ship) < 700));
  }
  _canBoard(captain, vessel) { if (vessel && !vessel.destroyed && !vessel.npcOccupied && vessel.occupation?.controllerId === captain.id && !vessel.occupation.contested) return true; return !!vessel && !vessel.destroyed && !this._hostileOccupied(vessel) && (vessel.ownerId === captain.id || (vessel.grants[captain.id] ? vessel.grants[captain.id].allowed === true : vessel.allowCrew)); }
  _hasBerth(captain, vessel) {
    const humans = 1 + [...this.captains.values()].filter(other => other.id !== captain.id && other.aboard === vessel.id).length;
    const hired = this._crewFor(vessel).filter(member => !member.dead && (member.health ?? 100) > 0).length;
    return humans + hired <= getShipClass(vessel.ship.classId).berths;
  }
  _canRole(captain, vessel, role) { if (!vessel || vessel.destroyed) return false; if (vessel.occupation?.controllerId === captain.id && !vessel.occupation.contested) return true; if (this._hostileOccupied(vessel)) return false; return vessel.ownerId === captain.id || this._canBoard(captain, vessel) && (role === 'passenger' || (vessel.grants[captain.id] ? vessel.grants[captain.id].roles?.includes(role) : vessel.allowCrew && ['weapons', 'engineering', 'scanner', 'medical', 'security'].includes(role))); }
  _helm(captain, vessel) { return !!vessel && vessel.helmOwner === captain.id && captain.aboard === vessel.id && captain.game.state.mode === 'ship'; }
  _location(captain) {
    if (['ship', 'enemy'].includes(captain.game.state.interior?.kind) && captain.aboard) {
      const vessel = this.vessels.get(captain.aboard);
      return { ...captain.game.state.interior.location, ...this._locationForVessel(vessel, captain) };
    }
    return captain.game.currentBody;
  }
  _surface(captain) {
    const location = this._location(captain); if (!location) return null;
    const key = `${location.id}:${location.classId || ''}:${JSON.stringify(location.crew || [])}:${JSON.stringify(location.bunkAssignments || {})}`;
    if (captain.surfaceCache?.key !== key) captain.surfaceCache = { key, value: generateSurface(location, this.seed, captain.game.state.flags) };
    return captain.surfaceCache.value;
  }
  _ensurePersonPosition(captain, reset = false) {
    const surface = this._surface(captain); if (!surface) return;
    if (reset || !isWalkable(surface, captain.game.state.person.x, captain.game.state.person.y)) Object.assign(captain.game.state.person, surface.spawn);
  }
  _entity(captain, entityId, types) {
    if (captain.game.state.mode !== 'person') return null;
    const surface = this._surface(captain); if (!surface) return null;
    const entity = entityId ? surface.entities.find(e => e.id === entityId) : nearestEntity(surface, captain.game.state.person, SURFACE_RANGE);
    if (!entity || entity.hidden || types && !types.includes(entity.type) || distance(entity, captain.game.state.person) > SURFACE_RANGE) return null;
    return entity;
  }
  _nearTypes(captain, types) {
    if (captain.game.state.mode !== 'person') return false;
    const surface = this._surface(captain);
    return !!surface?.entities.some(e => !e.hidden && types.includes(e.type) && distance(e, captain.game.state.person) <= SURFACE_RANGE);
  }
  _atStation(captain, role) {
    if (captain.game.state.mode !== 'person' || captain.game.state.person.health <= 0 || captain.game.state.interior?.kind !== 'ship') return false;
    const wanted = ['weapons', 'security'].includes(role) ? 'security' : ['scanner', 'navigation'].includes(role) ? 'navigation' : role;
    return !!this._surface(captain)?.entities.some(entity => entity.data?.stationRole === wanted && distance(entity, captain.game.state.person) <= SURFACE_RANGE);
  }
  _onBoardingDeck(captain, vessel) {
    return !!(vessel && (vessel.boarding || vessel.pvp) && captain.aboard === vessel.id && captain.game.state.mode === 'person' && ['ship', 'enemy'].includes(captain.game.state.interior?.kind));
  }
  _cabin(captain, vessel) {
    captain.game.state.exploration=null; captain.game.state.person.weaponDrawn=false;
    captain.aboard = vessel.id; captain.portVesselId = null; captain.game.state.systemId = vessel.systemId; captain.game.state.mode = 'person';
    captain.game.state.locationId = `ship:${vessel.id}`; captain.crewRole = 'passenger';
    captain.game.state.interior = { kind: 'ship', location: this._locationForVessel(vessel, captain), returnLocation: null, returnShip: { x: vessel.ship.x, y: vessel.ship.y, vx: vessel.ship.vx, vy: vessel.ship.vy, angle: vessel.ship.angle } };
    this._bindCaptain(captain); this._ensurePersonPosition(captain, true); captain.game._flag('entered_cabin');
  }
  _locationForVessel(vessel, viewer = null) {
    const owner = this.captains.get(vessel.ownerId), pirate = vessel.npcOccupied || vessel.npcHostile && !vessel.captured;
    const source = viewer && this.vessels.get(viewer.aboard || viewer.ownedVesselId), hostile = !!(pirate || viewer && (source?.id === vessel.id ? this._captainTeam(viewer, vessel) !== vessel.ownerId && vessel.occupation?.controllerId !== viewer.id : this._shipsHostile(source, vessel)));
    const ownerName = pirate ? 'Pirate crew' : owner?.name || 'Independent crew', ownership = pirate ? 'hostile' : viewer?.id === vessel.ownerId ? 'owned' : viewer?.id === vessel.occupation?.controllerId ? 'commandeered' : hostile ? 'hostile' : 'crew';
    return { id: `ship:${vessel.id}`, vesselId: vessel.id, vesselName: vessel.name, ownerName, ownerId: vessel.ownerId, ownership, hostile,
      name: pirate ? `${vessel.name} · pirate deck` : `${vessel.name} · ${ownerName}’s deck`, kind: 'ship', biome: 'ship', classId: vessel.ship.classId, shipClass: vessel.ship.classId, shipClassId: vessel.ship.classId,
      crew: this._crewFor(vessel), bunkAssignments: vessel.bunks, systemId: vessel.systemId, faction: pirate ? this._enemyFor(vessel)?.faction || 'covenant' : 'freewake' };
  }
  _landCharacter(captain, systemId, bodyId, position) {
    const previous = this.vessels.get(captain.aboard), owned = this.vessels.get(captain.ownedVesselId);
    captain.portVesselId = previous?.dockedAt === bodyId && previous.systemId === systemId && this._canRole(captain, previous, 'helm') ? previous.id : owned?.dockedAt === bodyId && owned.systemId === systemId && this._canRole(captain, owned, 'helm') ? owned.id : null;
    captain.game.state.exploration=null; captain.game.state.person.weaponDrawn=false;
    captain.aboard = null; captain.boardingTeam = null; captain.returnVesselId = null; captain.crewRole = 'passenger'; captain.game.state.systemId = systemId; captain.game.state.locationId = bodyId; captain.game.state.mode = 'person'; captain.game.state.interior = null;
    this._bindCaptain(captain); this._ensurePersonPosition(captain, true);
    if (position && isWalkable(this._surface(captain), position.x, position.y)) Object.assign(captain.game.state.person, position);
  }

  async command(captain, name, args = {}, requestId = '') {
    if (this.failed || this.conflicted || this.storageError) return fail('Durable storage is unavailable. No new action has been accepted.', 'storage');
    if (requestId) { const previous = captain.recentCommands.find(c => c.id === requestId); if (previous) { try { await this.flush(); return clone(previous.result); } catch { return fail('Storage has not confirmed this action yet.', 'storage-unconfirmed'); } } }
    if (!args || typeof args !== 'object' || Array.isArray(args)) return fail('Invalid action arguments.', 'protocol');
    let result;
    try { result = this._command(captain, name, args); } catch (error) { this.failed = true; this.onConflict(this, error); return fail('This realm must reload its last durable revision before continuing.', 'invalid-action'); }
    result ||= fail('Unknown action.', 'command');
    if (!result.ok) return result;
    captain.lastSeen = now();
    if (name !== 'setCameraPreferences') {
      this._bindCaptain(captain);
      captain.events.push(...captain.game.drainEvents()); if (captain.events.length > 80) captain.events.splice(0, captain.events.length - 80);
    }
    if (requestId) { captain.recentCommands.push({ id: requestId, result: clone(result) }); if (captain.recentCommands.length > 80) captain.recentCommands.shift(); }
    const revision = this.markDirty();
    try { await this.flush(revision); } catch { return fail('The storage service has not confirmed this action. Reconnect before retrying.', 'storage-unconfirmed'); }
    return result;
  }

  _setCameraPreferences(c, args) {
    const values = () => ({ cameraPreferences: clone(c.cameraPreferences), cameraRevision: c.cameraRevision });
    const keys = Object.keys(args), zoomKeys = keys.filter(key => key === 'shipZoom' || key === 'personZoom');
    if (!zoomKeys.length || keys.some(key => !['shipZoom', 'personZoom', 'expectedRevision'].includes(key)) ||
        !Number.isSafeInteger(args.expectedRevision) || args.expectedRevision < 0 ||
        zoomKeys.some(key => typeof args[key] !== 'number' || !Number.isFinite(args[key]))) {
      return { ...fail('Send a finite camera zoom and its current revision.', 'camera-invalid'), ...values() };
    }
    if (args.expectedRevision !== c.cameraRevision) {
      return { ...fail('Camera settings changed on another connection. Use the saved settings before changing them again.', 'camera-conflict'), ...values() };
    }
    if (c.cameraRevision >= Number.MAX_SAFE_INTEGER) return { ...fail('Camera settings cannot be revised further.', 'camera-invalid'), ...values() };
    c.cameraPreferences = normalizeCameraPreferences(args, c.cameraPreferences);
    // Revision zero also means that an older captain has not imported local preferences yet.
    c.cameraRevision++;
    return ok({ ...values() });
  }

  _command(c, name, a) {
    if (name === 'setCameraPreferences') return this._setCameraPreferences(c, a);
    const game = c.game, active = this.vessels.get(c.aboard), owned = this.vessels.get(c.ownedVesselId);
    const id = a.id ?? a.systemId ?? a.bodyId ?? a.signalId;
    if (game.state.person.health <= 0 && !['renameCaptain', 'setCrewAccess'].includes(name)) return fail('You are incapacitated. Your crew can still clear the deck.', 'incapacitated');
    if (name === 'declareHostility') return this._declareHostility(c, a);
    if (name === 'boardHostileShip') return this._boardHostileShip(c, a);
    if (name === 'takeCapturedHelm') return this._takeCapturedHelm(c);
    if (name === 'returnToOwnShip' || name === 'retreatBoarding') return this._returnToOwnShip(c);
    if (name === 'surfaceAction') return this._surfaceAction(c, a);
    if (name === 'customizeCharacter') { const result=game.customizeCharacter(a);if(result.ok&&owned)owned.actor=null;return result; }
    if (name === 'enterSite') {
      this._prepareExploration(c,game.state.locationId,a.siteId||id);
      const result=game.enterSite(a.siteId||id);if(result.ok){c.surfaceCache=null;this._bindExploration(c);}return result;
    }
    if (name === 'exitSite') {const result=game.exitSite();if(result.ok)c.surfaceCache=null;return result;}
    if (name === 'siteAction') return game.siteAction(a.entityId,a.action,a.optionId);
    if (name === 'medicalFromStation') return this._crewCommand(c, 'crewAction', { action: 'heal' });
    if (name === 'repairFromStation') return this._crewCommand(c, 'crewAction', { action: 'repair' });
    if (name === 'setCrewAccess' || name === 'boardShip' || name === 'takeStation' || name === 'leaveCrew' || name === 'returnToShip' || name === 'crewAction') return this._crewCommand(c, name, a);
    if (name === 'setHome' || name === 'installBunk') return this._homeCommand(c, name, a);
    if (name === 'renameShip') { if (!owned) return fail('Ship unavailable.'); owned.name = cleanName(a.name, 'Cinder'); owned.ship.name = owned.name; return ok({ text: `Your ship is now ${owned.name}.` }); }
    if (name === 'renameCaptain') { c.name = cleanName(a.name); return ok({ text: 'Captain name updated.' }); }
    if (name === 'dock') {
      if (!this._helm(c, active)) return fail('Only the current helmsman may dock this vessel.', 'helm');
      const result = this._withShip(c, active, () => game.dock(id));
      if (result.ok) { active.dockedAt = id; active.helmOwner = null; this._landCharacter(c, active.systemId, id); }
      return result;
    }
    if (name === 'launch') {
      const vessel = active || this.vessels.get(a.vesselId || c.portVesselId || c.ownedVesselId);
      if (!vessel || !this._canRole(c, vessel, 'helm')) return fail('The owner has not granted you the helm.', 'permission');
      if (vessel.systemId !== game.state.systemId || !vessel.dockedAt || !active && vessel.dockedAt !== game.state.locationId) return fail('Your vessel is not docked here. Return to its port or board it first.', 'location');
      if (!active && !this._nearTypes(c, ['exit'])) return fail('Walk to the departure shuttle or airlock first.', 'distance');
      if (vessel.helmOwner && vessel.helmOwner !== c.id) return fail('Another captain holds the helm.', 'station-occupied');
      const actor = this._actor(vessel); actor.state.mode = 'person'; actor.state.locationId = vessel.dockedAt; actor.state.interior = null;
      const result = actor.launch(); this._syncActor(vessel);
      if (result.ok) { vessel.dockedAt = null; vessel.helmOwner = c.id; c.aboard = vessel.id; c.portVesselId = null; c.crewRole = 'helm'; game.state.mode = 'ship'; game.state.locationId = null; game.state.interior = null; }
      return result;
    }
    if (name === 'travel') {
      if (!this._helm(c, active)) return fail('Only the current helmsman may engage the fold drive.', 'helm');
      if (this._inCombat(active)) return fail('Clear the immediate attack before engaging the fold drive.', 'combat');
      const result = this._withShip(c, active, () => game.travel(id));
      if (result.ok) {
        active.systemId = game.state.systemId; active.dockedAt = null;
        for (const other of this.captains.values()) if (other.aboard === active.id) { other.game.state.systemId = active.systemId; other.game._flag(`visited_${active.systemId}`); other.game._flag(`jumped_to_${active.systemId}`); if (!other.game.state.visited.includes(active.systemId)) other.game.state.visited.push(active.systemId); this._bindCaptain(other); }
        active.actor = null;
      }
      return result;
    }
    if (name === 'scan' || name === 'salvage') {
      if (!active || !(this._helm(c, active) || ['scanner', 'navigation'].includes(c.crewRole))) return fail('Operate the helm or scanner station first.', 'station');
      if (!this._helm(c, active) && (!this._canRole(c, active, c.crewRole) || !this._atStation(c, c.crewRole))) return fail('Remain at the permitted navigation console to operate the scanner.', 'distance');
      if (name === 'scan' && id === 'hearth:story:tinbell' && !game.hasFlag('belt_signal_scanned')) { const signal = game.system.signals.find(s => s.id === id); if (signal) { signal.resolved = false; signal.scanned = false; } }
      return this._withShip(c, active, () => game[name](id), { forceShip: true });
    }
    if (name === 'enterCabin') {
      if (!active || game.state.mode !== 'ship') return fail('Take the helm before entering this cabin.', 'mode');
      this._cabin(c, active); if (active.helmOwner === c.id) active.helmOwner = null; return ok({ body: this._location(c), text: 'You step away from the helm.' });
    }
    if (name === 'leaveInterior' || name === 'exitCabin' || name === 'leaveDerelict') {
      if(game.state.interior?.kind==='site')return this._command(c,'exitSite',a);
      if (game.state.interior?.kind === 'enemy') return this._command(c, 'retreatBoarding', a);
      if (game.state.interior?.kind === 'derelict') { const result = game.leaveDerelict(); if (result.ok) { c.aboard = owned.id; c.crewRole = 'helm'; owned.helmOwner = c.id; } return result; }
      if (!active) return fail('There is no ship interior to leave.', 'mode');
      if (active.dockedAt) return this._crewCommand(c, 'leaveCrew', {});
      return this._crewCommand(c, 'takeStation', { role: 'helm', entityId: a.entityId });
    }
    if (name === 'boardDerelict') {
      if (!this._helm(c, active) || active.ownerId !== c.id) return fail('Board from your own ship while at its helm.', 'helm');
      if (this._inCombat(active)) return fail('Clear the attack before boarding.', 'combat');
      const result = game.boardDerelict(id); if (result.ok) { active.helmOwner = null; c.crewRole = 'passenger'; c.aboard = null; this._ensurePersonPosition(c, true); } return result;
    }
    if (name === 'boardEnemy') return this._boardEnemy(c, { ...a, id });
    if (name === 'acceptJob' || name === 'turnInJob') { if (!this._nearTypes(c, ['jobboard'])) return fail('Visit the contract exchange in person.', 'distance'); return game[name](id); }
    if (name === 'abandonJob') return game.abandonJob(id);
    if (name === 'buyUpgrade' || name === 'buyShip' || name === 'selectShip') {
      const vessel = this.vessels.get(c.portVesselId || c.ownedVesselId);
      if (!this._nearTypes(c, ['mechanic']) || game.state.interior || vessel.ownerId !== c.id || vessel.dockedAt !== game.state.locationId || vessel.systemId !== game.state.systemId || this._hostileOccupied(vessel) || vessel.destroyed) return fail('Bring your permitted vessel to this port shipwright before fitting equipment or changing hulls.', 'distance');
      const result = this._withShip(c, vessel, () => game[name](id)); if (result.ok) { vessel.actor = null; this._linkNpcVessel(vessel); } return result;
    }
    if (name === 'service') {
      if (!this._nearTypes(c, a.action === 'rest' ? ['medic'] : ['mechanic', 'merchant', 'jobboard', 'npc'])) return fail('Visit the appropriate port service in person.', 'distance');
      if (a.action === 'rest') return game.service(a.action);
      const vessel = this.vessels.get(c.portVesselId || c.ownedVesselId);
      if (!vessel || vessel.dockedAt !== game.state.locationId || vessel.systemId !== game.state.systemId || !this._canRole(c, vessel, 'helm')) return fail('This service needs your controlled vessel at the same port.', 'location');
      return this._withShip(c, vessel, () => game.service(a.action));
    }
    if (name === 'recruitCrew') {
      const vessel = this.vessels.get(c.portVesselId || c.ownedVesselId);
      if (!this._nearTypes(c, ['npc', 'crew', 'medic', 'mechanic']) || !vessel || vessel.ownerId !== c.id || vessel.dockedAt !== game.state.locationId || vessel.systemId !== game.state.systemId || this._hostileOccupied(vessel)) return fail('Meet potential crew at the same port as your permitted vessel.', 'distance');
      const result = this._withShip(c, vessel, () => game.recruitCrew(a.role, { name: cleanName(a.name, '') })); if (result.ok) vessel.actor = null; return result;
    }
    if (name === 'dismissCrew') {
      if (game.state.mode !== 'person' || game.state.interior || owned.systemId !== game.state.systemId || owned.dockedAt !== game.state.locationId) return fail('Bring your vessel to the same inhabited port before dismissing hired crew.', 'location');
      const result = game.dismissCrew(a.crewId || id); if (result.ok) { owned.actor = null; c.surfaceCache = null; } return result;
    }
    if (name === 'triggerEncounter' || name === 'beginEncounter') {
      if (game.state.mode === 'person') { if (!this._entity(c, a.entityId, ['npc', 'crew', 'terminal'])) return fail('Approach a person or archive before starting this conversation.', 'distance'); }
      else if (id !== 'earth_arrival' && !game.system.signals.some(s => !s.resolved && distance(s, active?.ship || game.state.ship) <= (active?.ship.scanRange || game.state.ship.scanRange)) && !game.system.traffic.some(t => distance(t, active?.ship || game.state.ship) < 220)) return fail('Approach a signal or passing ship first.', 'distance');
      return game.triggerEncounter(id);
    }
    if (name === 'applyChoice') return active ? this._withShip(c, active, () => game.applyChoice(a.encounterId, a.choice ?? a.index)) : game.applyChoice(a.encounterId, a.choice ?? a.index);
    if (name === 'dismissEncounter') return game.dismissEncounter();
    if (name === 'attackBoarder') return this._attackDeck(c, a.enemyId || id);
    return fail('This action is not accepted by the multiplayer authority.', 'command');
  }

  _surfaceAction(c, a) {
    const game = c.game, entity = this._entity(c, a.entityId);
    if (!entity) return fail('Move closer to that person or workstation.', 'distance');
    const action = a.action === 'interact' || !a.action ? ({ npc: 'talk', crew: 'talk', terminal: 'read', work: 'repair', crate: 'pickup', delivery: 'deliver', sample: 'collect', bunk: 'bunk', station: 'station', exit: 'leave' })[entity.type] : a.action;
    const surface = this._surface(c), flag = value => game._flag(value);
    if (action === 'talk' && ['npc', 'crew', 'mechanic', 'medic'].includes(entity.type)) {
      const aliases = { Shipwright: 'mechanic', scientist: 'archivist', settler: 'governor', survivor: 'refugee', 'Field archivist': 'archivist' };
      const role = DIALOGUE[entity.role] ? entity.role : aliases[entity.role] || (entity.type === 'mechanic' ? 'mechanic' : 'refugee');
      return { ...game.recordActivity('talk', { role, token: entity.id }), entity: { id: entity.id, role, name: entity.name } };
    }
    if (action === 'read' && entity.type === 'terminal') { game.recordActivity('explore', { token: entity.id }); if (LORE.some(l => l.id === entity.data?.loreId) && !game.state.knownLore.includes(entity.data.loreId)) game.state.knownLore.push(entity.data.loreId); return ok({ text: entity.text, loreId: entity.data?.loreId }); }
    if (action === 'repair' && entity.type === 'work') {
      const solution = typeof repairSolution === 'function' ? repairSolution(entity.id) : (() => { const r = seededRandom(entity.id); return [0, 1, 2].map(() => Math.floor(r() * 4)); })();
      if (!Array.isArray(a.solution) || a.solution.length !== 3 || a.solution.some((v, i) => v !== solution[i])) return fail('The relay conductors are not aligned.', 'puzzle');
      const work = game.state.missions.find(m => m.type === 'work' && m.targetSystem === game.state.systemId && m.targetBody === game.state.locationId && m.status !== 'completed');
      const token = `${entity.id}:${work?.id || 'local'}`;
      const result = game.recordActivity('work', { token, role: game.state.locationId === 'listening' ? 'archive' : 'repair', kind: 'repair' });
      if (result.first) { game.state.credits += 12; flag(entity.data?.flag || `done:${entity.id}`); }
      return { ...result, text: result.first ? 'Relay calibrated · +12 credits.' : 'This relay is already recorded for the current shift.' };
    }
    if (action === 'pickup' && entity.type === 'crate') { if (game.hasFlag(`delivered:${surface.id}`) || game.hasFlag(`carrying:${surface.id}`)) return fail('This shipment is already collected.', 'duplicate'); flag(`carrying:${surface.id}`); game.state.person.carrying = true; return ok({ text: 'Carry the crate to the marked loading pad.' }); }
    if (action === 'deliver' && entity.type === 'delivery') {
      if (!game.hasFlag(`carrying:${surface.id}`) || game.hasFlag(`delivered:${surface.id}`)) return fail('Collect this location’s freight crate first.', 'cargo');
      game.state.flags = game.state.flags.filter(f => f !== `carrying:${surface.id}`); flag(`delivered:${surface.id}`); if (entity.data?.flag) flag(entity.data.flag); game.state.person.carrying = false;
      const result = game.recordActivity('freight', { token: `${entity.id}:cargo`, kind: 'cargo' });
      if (result.first) { game.state.credits += 35; game.state.rep.freewake = Math.min(100, game.state.rep.freewake + 2); }
      return { ...result, text: 'Freight delivered · +35 credits.' };
    }
    if (action === 'collect' && entity.type === 'sample') {
      if (game.hasFlag(`done:${entity.id}`)) return fail('This sample has already been collected.', 'duplicate');
      flag(`done:${entity.id}`); if (entity.data?.flag) flag(entity.data.flag); const result = game.recordActivity('sample', { token: entity.id, kind: 'sample' });
      if (result.first) { game.state.credits += 15; game.state.rep.lantern = Math.min(100, game.state.rep.lantern + 2); }
      return { ...result, text: 'Sample catalogued · +15 credits.' };
    }
    if (action === 'bunk' && entity.type === 'bunk') return this._homeCommand(c, 'setHome', { kind: 'bunk', entityId: entity.id, bunkIndex: entity.data.bunkIndex });
    if (action === 'station' && (entity.type === 'station' || entity.type === 'exit' && entity.data?.stationRole === 'helm')) return this._crewCommand(c, 'takeStation', { role: entity.data.stationRole || entity.data.role, entityId: entity.id });
    if (action === 'leave' && entity.type === 'exit') return this._command(c, c.game.state.interior ? 'leaveInterior' : 'launch', { entityId: entity.id });
    return fail('That action does not belong to this workstation.', 'entity-type');
  }

  _crewCommand(c, name, a) {
    const game = c.game, active = this.vessels.get(c.aboard), owned = this.vessels.get(c.ownedVesselId);
    if (name === 'setCrewAccess') {
      const vessel = this.vessels.get(a.vesselId || c.ownedVesselId);
      if (!vessel || vessel.ownerId !== c.id) return fail('Only the vessel owner can change boarding permissions.', 'ownership');
      if (!a.captainId) { vessel.allowCrew = !!a.allowed; return ok({ text: vessel.allowCrew ? 'Realm friends may board. Helm access still requires a personal grant.' : 'Boarding now requires a personal invitation.' }); }
      if (!this.captains.has(a.captainId) || a.captainId === c.id) return fail('Choose another captain in this realm.', 'captain');
      const roles = Array.isArray(a.roles) ? [...new Set(a.roles.map(roleName).filter(role => STATION_ROLES.includes(role) && role !== 'passenger'))] : ['weapons', 'engineering', 'scanner', 'navigation', 'medical', 'security'];
      vessel.grants[a.captainId] = { allowed: !!a.allowed, roles, allowBunk: a.allowBunk !== false };
      const guest = this.captains.get(a.captainId);
      if (!a.allowed && guest.aboard === vessel.id && this._captainTeam(guest, vessel) === vessel.ownerId) {
        if (vessel.helmOwner === guest.id) vessel.helmOwner = null;
        if (vessel.dockedAt) this._landCharacter(guest, vessel.systemId, vessel.dockedAt);
        else this._cabin(guest, vessel);
        guest.crewRole = 'passenger'; guest.events.push({ type: 'crew', text: 'The owner withdrew station access. You may disembark at the next port.' });
      }
      return ok({ text: a.allowed ? 'Crew permission recorded.' : 'Crew permission withdrawn.' });
    }
    if (name === 'boardShip') {
      const vessel = this.vessels.get(a.vesselId);
      if (!vessel || !this._canBoard(c, vessel)) return fail('The owner must allow you aboard this vessel.', 'permission');
      if (vessel.systemId !== game.state.systemId) return fail('Travel to the same system before boarding.', 'location');
      if (c.aboard === vessel.id && game.state.interior?.kind === 'ship') return fail('You are already aboard.', 'duplicate');
      if (this._inCombat(vessel) || this._inCombat(owned)) return fail('Finish the immediate fight before transferring between ships.', 'combat');
      const samePort = vessel.dockedAt && game.state.mode === 'person' && !game.state.interior && game.state.locationId === vessel.dockedAt;
      const nearbyShip = game.state.mode === 'ship' && distance(vessel.ship, active?.ship || game.state.ship) < 220 && Math.hypot(vessel.ship.vx || 0, vessel.ship.vy || 0) < 90;
      if (!samePort && !nearbyShip) return fail('Meet at the same port or approach within 220 metres at low speed.', 'distance');
      if (!this._hasBerth(c, vessel)) return fail('This vessel has no free berth. Human and hired crew share its capacity.', 'capacity');
      if (active?.helmOwner === c.id) active.helmOwner = null;
      if (active && active.id !== vessel.id) c.returnVesselId = active.id;
      c.boardingTeam = vessel.occupation?.controllerId === c.id ? vessel.occupation.controllerTeam || c.id : null;
      this._cabin(c, vessel); return ok({ text: `Welcome aboard ${vessel.name}.`, vesselId: vessel.id, body: this._location(c) });
    }
    if (name === 'takeStation') {
      const vessel = active; const role = roleName(a.role || 'helm');
      if (!vessel || !STATION_ROLES.includes(role) || !this._canRole(c, vessel, role)) return fail('The owner has not granted this station role.', 'permission');
      if (role === 'passenger') { if (vessel.helmOwner === c.id) vessel.helmOwner = null; this._cabin(c, vessel); return ok({ text: 'You leave the station.' }); }
      const entity = this._entity(c, a.entityId, ['station', 'exit']);
      const wanted = ['weapons', 'security'].includes(role) ? 'security' : ['scanner', 'navigation'].includes(role) ? 'navigation' : role;
      const actual = entity?.data?.stationRole || (entity?.type === 'station' ? entity?.data?.role : null);
      if (!entity || actual !== wanted) return fail('Walk to that station inside the vessel first.', 'distance');
      const occupied = [...this.captains.values()].find(other => other.id !== c.id && other.aboard === vessel.id && roleName(other.crewRole) === role && (other.session || other.disconnectUntil > now()));
      if (occupied) return fail(`${occupied.name} is using that station.`, 'station-occupied');
      if (role === 'helm') {
        if (vessel.boarding?.phase === 'active' || vessel.pvp?.phase === 'active') return fail('Resolve the boarding action before taking the helm.', 'boarding');
        const previousHelm = this.captains.get(vessel.helmOwner);
        if (previousHelm && !previousHelm.session && previousHelm.disconnectUntil <= now()) { vessel.helmOwner = null; previousHelm.crewRole = 'passenger'; }
        if (vessel.helmOwner && vessel.helmOwner !== c.id) return fail('Another captain holds the helm.', 'station-occupied');
        vessel.helmOwner = c.id; c.crewRole = role;
        if (vessel.dockedAt) return this._command(c, 'launch', {});
        game.state.mode = 'ship'; game.state.locationId = null; game.state.interior = null;
      } else { if (vessel.helmOwner === c.id) vessel.helmOwner = null; c.crewRole = role; }
      return ok({ text: `You take the ${role} station.`, role });
    }
    if (name === 'leaveCrew') {
      if (!active || !active.dockedAt) return fail('The vessel must dock before you can disembark.', 'location');
      if (active.helmOwner === c.id) active.helmOwner = null;
      this._landCharacter(c, active.systemId, active.dockedAt); return ok({ text: `You disembark at ${c.game.currentBody?.name || active.dockedAt}.` });
    }
    if (name === 'returnToShip') {
      if (game.state.mode !== 'person' || game.state.interior || !game.currentBody) return fail('Book passage from an inhabited port or settlement.', 'location');
      if (this._inCombat(owned) || this._hostileOccupied(owned) || owned.destroyed) return fail('Your ship cannot receive a transfer while occupied or damaged beyond recovery.', 'combat');
      if (!owned.dockedAt) { this._cabin(c, owned); return ok({ text: 'A recovery shuttle brought you to your drifting vessel. Its hull has not moved.', vesselId: owned.id }); }
      const port = this._room(owned.systemId).runtime.bodies.find(b => b.id === owned.dockedAt) || this._room(owned.systemId).runtime.bodies.find(b => b.kind === 'station') || this._room(owned.systemId).runtime.bodies[0];
      owned.dockedAt = port.id; owned.helmOwner = null; Object.assign(owned.ship, { x: port.x, y: port.y + port.radius + 80, vx: 0, vy: 0 });
      this._landCharacter(c, owned.systemId, port.id); return ok({ text: 'A port shuttle brings you back to your parked vessel.' });
    }
    if (name === 'crewAction') {
      if (!active || game.state.interior?.kind !== 'ship') return fail('Operate a station aboard the vessel first.', 'location');
      if (!this._canRole(c, active, c.crewRole) || !this._atStation(c, c.crewRole)) return fail('Operate this control from its assigned console.', 'distance');
      const actor = this._actor(active);
      if (a.action === 'repair' && c.crewRole === 'engineering') { const result = actor.repairFromStation(); this._syncActor(active); return result; }
      if (a.action === 'scan' && ['scanner', 'navigation'].includes(c.crewRole)) {
        const signal = a.signalId ? actor.system.signals.find(signal => signal.id === a.signalId) : actor.system.signals.filter(signal => !signal.resolved && distance(signal, active.ship) <= active.ship.scanRange).sort((one, two) => distance(one, active.ship) - distance(two, active.ship))[0];
        if (!signal) return fail('No unresolved signal is within scanner range.', 'target');
        return this._command(c, 'scan', { id: signal.id });
      }
      if (a.action === 'heal' && c.crewRole === 'medical') { const patients = [...this.captains.values()].filter(patient => patient.aboard === active.id && patient.game.state.interior?.kind === 'ship').map(patient => patient.game); const result = actor.medicalFromStation(patients); this._syncActor(active); return result; }
      return fail('This action requires the matching crew station.', 'station');
    }
    return fail('Unknown crew action.', 'command');
  }

  _homeCommand(c, name, a) {
    const game = c.game, vessel = this.vessels.get(c.aboard || c.ownedVesselId);
    if (name === 'installBunk') {
      if (!vessel || vessel.ownerId !== c.id || game.state.interior?.kind !== 'ship' || c.aboard !== vessel.id) return fail('The owner installs bunks while aboard their vessel.', 'ownership');
      if (vessel.installedBunks >= getShipClass(vessel.ship.classId).berths) return fail('Every available bunk is already fitted.', 'capacity');
      if (game.state.credits < 60 || game.state.cargo.ore < 4) return fail('A fitted bunk requires 60 credits and 4 ore.', 'cost');
      game.state.credits -= 60; game.state.cargo.ore -= 4; const index = vessel.installedBunks++; return ok({ text: `Bunk ${index + 1} is ready for a crew member.`, bunkIndex: index });
    }
    if (a.kind === 'bunk') {
      if (!vessel || c.aboard !== vessel.id || game.state.interior?.kind !== 'ship') return fail('Visit a bunk aboard a permitted vessel.', 'location');
      const entity = this._entity(c, a.entityId, ['bunk']);
      if (!entity || a.bunkIndex !== undefined && a.bunkIndex !== entity.data.bunkIndex) return fail('Stand beside the bunk you want to claim.', 'distance');
      const index = entity.data.bunkIndex;
      if (index >= vessel.installedBunks) return fail('The owner must fit this bunk first (60 credits, 4 ore).', 'bunk-unfitted');
      if (vessel.ownerId !== c.id && !(this._canBoard(c, vessel) && (vessel.grants[c.id] ? vessel.grants[c.id].allowBunk === true : vessel.allowCrew))) return fail('The owner has not granted a home berth.', 'permission');
      if (vessel.bunks[index] && vessel.bunks[index] !== c.id) return fail('Another captain has claimed this bunk.', 'occupied');
      for (const [other, occupant] of Object.entries(vessel.bunks)) if (occupant === c.id && Number(other) !== index) delete vessel.bunks[other];
      vessel.bunks[index] = c.id; c.home = { kind: 'bunk', vesselId: vessel.id, bunkIndex: index, systemId: vessel.systemId, locationId: `ship:${vessel.id}` }; c.surfaceCache = null;
      return ok({ text: `Bunk ${index + 1} is now your home berth.`, home: clone(c.home) });
    }
    if (!['room', 'outpost'].includes(a.kind)) return fail('Choose a port room, a planetary outpost, or an installed bunk.', 'home');
    const body = game.currentBody;
    if (game.state.mode !== 'person' || game.state.interior || !body) return fail('Visit the location in person before making it your home.', 'location');
    if (a.kind === 'room' && !this._surface(c)?.entities.some(entity => ['npc', 'mechanic', 'medic', 'jobboard'].includes(entity.type))) return fail('A room lease requires an inhabited port or settlement.', 'location');
    if (a.kind === 'outpost' && !['planet', 'moon'].includes(body.kind)) return fail('Build an outpost on a planet or moon.', 'location');
    const credits = a.kind === 'room' ? 50 : 180, ore = a.kind === 'room' ? 0 : 12;
    const leaseId = `${c.id}:${a.kind}:${game.state.systemId}:${body.id}`, existing = this.leases[leaseId];
    if (existing && (!existing.expiresAt || existing.expiresAt > now())) { c.home = clone(existing); return ok({ text: 'Your existing home is active.', home: clone(c.home) }); }
    if (game.state.credits < credits || game.state.cargo.ore < ore) return fail(`${a.kind === 'room' ? 'A standing room lease' : 'An outpost'} costs ${credits} credits${ore ? ` and ${ore} ore` : ''}.`, 'cost');
    game.state.credits -= credits; game.state.cargo.ore -= ore;
    const lease = { id: leaseId, ownerId: c.id, ownerName: c.name, kind: a.kind, systemId: game.state.systemId, locationId: body.id, x: game.state.person.x, y: game.state.person.y, createdAt: now() };
    this.leases[leaseId] = lease; c.home = clone(lease); return ok({ text: a.kind === 'room' ? 'Your room lease is recorded. It does not expire.' : 'Your outpost is established and recorded as your home.', home: clone(c.home) });
  }

  _restoreAtHome(c, { combatPenalty = false, forceSafe = false, preserveShips = false } = {}) {
    // A restart must finish an already-triggered field rescue before ordinary
    // offline home restoration can move the captain or their parked vessel.
    if (c.game.state.exploration && (c.game.state.person.health <= 0 || c.game.state.person.down)) {
      this._bindCaptain(c);
      const recovered = c.game._returnFromSite(true);
      if (recovered.ok) { c.surfaceCache = null; return; }
    }
    let home = c.home || starterHome();
    if (home.expiresAt && home.expiresAt <= now()) home = starterHome();
    const owned = this.vessels.get(c.ownedVesselId);
    const previousVessel = this.vessels.get(c.aboard);
    if (previousVessel?.helmOwner === c.id) previousVessel.helmOwner = null;
    if (combatPenalty) { c.game.state.credits = Math.floor(c.game.state.credits * .85); c.game.state.cargo.ore = Math.floor(c.game.state.cargo.ore * .8); c.events.push({ type: 'rescue', text: 'Your lost-connection beacon brought a recovery tug. Emergency towing cost 15% of your credits and part of your ore.' }); }
    if (home.kind === 'bunk' && !forceSafe) {
      const vessel = this.vessels.get(home.vesselId);
      if (vessel && !vessel.destroyed && !this._hostileOccupied(vessel) && vessel.bunks[home.bunkIndex] === c.id && this._canBoard(c, vessel) && this._hasBerth(c, vessel)) {
        const otherCrewOnline = [...this.captains.values()].some(other => other.id !== c.id && other.aboard === vessel.id && other.session);
        if (!otherCrewOnline && !vessel.dockedAt) this._park(vessel);
        this._cabin(c, vessel);
        const bunk = this._surface(c)?.entities.find(e => e.type === 'bunk' && e.data.bunkIndex === home.bunkIndex); if (bunk) Object.assign(c.game.state.person, { x: bunk.x, y: bunk.y });
        c.game.state.person.health = Math.max(25, c.game.state.person.health); c.game.state.person.down = false; return;
      }
      home = starterHome();
    }
    if (home.kind === 'bunk') home = starterHome();
    const bodyExists = c.game.galaxy.find(s => s.id === home.systemId)?.bodies.some(b => b.id === home.locationId);
    if (!bodyExists) home = starterHome();
    const ownedHasOtherCrew = [...this.captains.values()].some(other => other.id !== c.id && other.aboard === owned.id && other.session);
    if (!forceSafe && !preserveShips && !combatPenalty && !c.returnVesselId && !owned.destroyed && !this._hostileOccupied(owned) && !ownedHasOtherCrew) { owned.systemId = home.systemId; owned.dockedAt = home.locationId; owned.helmOwner = null; owned.actor = null; const body = this._room(home.systemId).runtime.bodies.find(b => b.id === home.locationId); Object.assign(owned.ship, { x: body.x, y: body.y + body.radius + 80, vx: 0, vy: 0 }); }
    this._landCharacter(c, home.systemId, home.locationId, home); c.game.state.person.health = Math.max(25, c.game.state.person.health); c.game.state.person.down = false;
    if (owned.destroyed || this._hostileOccupied(owned)) this._recoveryCutter(c, owned);
  }
  _park(vessel) {
    if (!vessel || vessel.destroyed || this._hostileOccupied(vessel)) return;
    const room = this._room(vessel.systemId), body = room.runtime.bodies.find(b => b.kind === 'station') || room.runtime.bodies[0];
    vessel.dockedAt = body.id; vessel.helmOwner = null; Object.assign(vessel.ship, { x: body.x, y: body.y + body.radius + 80, vx: 0, vy: 0 });
  }

  step(dt, tick, timestamp = now(), simulatedAt = timestamp) {
    if (this.failed || this.conflicted || this.storageError) return;
    this.tick = tick; this.simulatedAt = simulatedAt;
    const activeCaptains = [...this.captains.values()].filter(c => c.session || c.disconnectUntil > timestamp);
    const activeVessels = new Map(), occupiedSystems = new Set(), timeBefore = new Map([...this.captains.values()].map(c => [c.id, c.game.state.stats.time]));
    for (const c of activeCaptains) {
      this._bindCaptain(c); occupiedSystems.add(c.game.state.systemId);
      const input = timestamp - c.inputAt <= INPUT_TIMEOUT_MS && c.session ? c.input : { ...EMPTY_INPUT };
      c.appliedInput = input; c.ack = c.inputSeq;
      if (c.game.state.mode === 'person' && c.game.state.person.health > 0) {
        const surface = this._surface(c); if (surface) { c.game.state.person.speed = (input.boost ? 155 : 112)*c.game.characterEffects.walkSpeed; movePerson(surface, c.game.state.person, input.x, input.y, dt); }
      }
      const vessel = this.vessels.get(c.aboard);
      if (vessel) { activeVessels.set(vessel.id, vessel); occupiedSystems.add(vessel.systemId); }
    }
    this._stepExplorations(activeCaptains,dt);
    // Physical hulls do not disappear when their last pilot crosses a tether.
    for (const vessel of this.vessels.values()) if (occupiedSystems.has(vessel.systemId) && !vessel.dockedAt && !vessel.destroyed) activeVessels.set(vessel.id, vessel);
    const actorsBySystem = new Map();
    for (const vessel of activeVessels.values()) {
      const actor = this._actor(vessel), helm = this.captains.get(vessel.helmOwner);
      actor.state.stats.time = timeBefore.get(actor._economyCaptainId || vessel.ownerId) || 0;
      const participants = activeCaptains.filter(c => this._onBoardingDeck(c, vessel));
      const pilot = helm && this._helm(helm, vessel) && helm.session ? helm.appliedInput || EMPTY_INPUT : { ...EMPTY_INPUT, flightAssist: vessel.flightAssist !== false };
      if (helm?.session) vessel.flightAssist = pilot.flightAssist;
      const weapons = activeCaptains.find(c => c.aboard === vessel.id && c.crewRole === 'weapons' && this._canRole(c, vessel, 'weapons') && this._atStation(c, 'weapons') && c.appliedInput?.fire);
      actor.stepPilot(dt, { ...pilot, fire: false }, { operateShip: !vessel.dockedAt, boardingParticipants: participants.map(c => c.game) });
      if (!vessel.dockedAt && actor.state.boarding?.phase !== 'active' && (weapons || pilot.fire)) actor.fireWeapons(weapons?.id || helm?.id || vessel.ownerId);
      for (const person of participants) if (!vessel.pvp && actor.state.boarding?.phase === 'active') { actor.updatePersonAim(person.game, person.appliedInput || {}); if (person.appliedInput?.fire) actor.attackBoarder(null, person.game, person.appliedInput); }
      if (vessel.pvp) this._stepPvP(vessel, dt, activeCaptains);
      if (!actorsBySystem.has(vessel.systemId)) actorsBySystem.set(vessel.systemId, []); actorsBySystem.get(vessel.systemId).push(actor);
      this._syncActor(vessel);
    }
    for (const systemId of occupiedSystems) {
      const room = this._room(systemId); room.lastActive = timestamp; room.ticks++;
      const actors = actorsBySystem.get(systemId) || [], recipients = activeCaptains.filter(c => c.game.state.systemId === systemId).map(c => c.game);
      room.coordinator.stepWorld(dt, actors, { recipients });
    }
    for (const vessel of activeVessels.values()) this._syncActor(vessel);
    for (const c of activeCaptains) {
      c.game.state.stats.time = (timeBefore.get(c.id) || 0) + dt;
      c.events.push(...c.game.drainEvents()); if (c.events.length > 80) c.events.splice(0, c.events.length - 80);
      if (c.session) c.lastSeen = timestamp;
    }
    for (const c of this.captains.values()) if (!c.session && c.disconnectUntil && c.disconnectUntil <= timestamp) {
      const vessel = this.vessels.get(c.aboard);
      const otherActive = vessel && [...this.captains.values()].some(other => other.id !== c.id && other.aboard === vessel.id && other.session);
      if (vessel?.helmOwner === c.id) vessel.helmOwner = null;
      if (otherActive) { if (c.game.state.mode === 'ship') this._cabin(c, vessel); c.crewRole = 'passenger'; }
      else this._restoreAtHome(c, { combatPenalty: c.combatAtDisconnect || this._inCombat(vessel) });
      c.disconnectUntil = 0; c.lastSeen = timestamp; this.markDirty();
    }
    for (const [systemId, room] of this.rooms) if (!occupiedSystems.has(systemId) && timestamp - room.lastActive > 10000) { this._captureRoom(room); this.rooms.delete(systemId); for (const vessel of this.vessels.values()) if (vessel.systemId === systemId) vessel.actor = null; }
    if (activeCaptains.length) this.markDirty();
  }

  roomInfo(c) {
    const s = c.game.state, vessel = this.vessels.get(c.aboard);
    const kind = s.mode === 'ship' ? 'system' : vessel && ['ship', 'enemy'].includes(s.interior?.kind) ? vessel.boarding?.kind === 'assault' ? 'boarding' : 'ship' : s.interior?.kind === 'derelict' ? 'derelict' : s.interior?.kind === 'site' ? 'site' : 'surface';
    const suffix = kind === 'system' ? s.systemId : ['ship', 'boarding'].includes(kind) ? c.aboard : `${s.systemId}:${s.locationId}`;
    return { id: `${this.id}:${kind}:${suffix}`, kind, systemId: s.systemId, locationId: s.locationId, vesselId: c.aboard || null };
  }
  _publicCaptain(c, viewer = null) {
    const room = this.roomInfo(c), person = c.game.state.person, vessel = this.vessels.get(c.aboard);
    const hostile = viewer && vessel && viewer.aboard === vessel.id && this._captainTeam(c, vessel) !== this._captainTeam(viewer, vessel);
    return { captainId: c.id, name: c.name, online: !!c.session, systemId: c.game.state.systemId, roomId: room.id, vesselId: c.aboard || null, crewRole: c.crewRole, mode: c.game.state.mode,
      appearance: clone(person.appearance), maxHealth:person.maxHealth||100, x: person.x, y: person.y, vx: person.vx || 0, vy: person.vy || 0, facing: person.facing, health: person.health, down: !!person.down,
      weapon: person.weapon, weaponDrawn: person.weaponDrawn, aimAngle: person.aimAngle, aimManual: person.aimManual, lastShot: clone(person.lastShot || null), aimTargetId: person.aimTargetId, attackUntil: person.attackUntil, hitUntil: person.hitUntil, team: hostile ? 'hostile' : 'friendly',
      sleeping: !c.session, home: c.home ? { kind: c.home.kind, systemId: c.home.systemId, locationId: c.home.locationId, vesselId: c.home.vesselId } : null };
  }
  _publicVessel(vessel, viewer) {
    const owner = this.captains.get(vessel.ownerId), occupants = [...this.captains.values()].filter(c => c.aboard === vessel.id), source = this.vessels.get(viewer.aboard);
    return { id: vessel.id, ownerId: vessel.ownerId, ownerName: owner.name, name: vessel.name, classId: vessel.ship.classId, systemId: vessel.systemId, dockedAt: vessel.dockedAt,
      ...Object.fromEntries(['x', 'y', 'vx', 'vy', 'angle', 'angularVelocity', 'hull', 'maxHull', 'shield', 'maxShield', 'radius', 'renderLength', 'renderWidth'].map(key => [key, vessel.ship[key]])),
      allowCrew: vessel.allowCrew, helmOwner: vessel.helmOwner, berths: getShipClass(vessel.ship.classId).berths, occupants: occupants.length, installedBunks: vessel.installedBunks,
      bunks: clone(vessel.bunks), canBoard: this._canBoard(viewer, vessel), destroyed: !!vessel.destroyed,
      disabled: !vessel.destroyed && vessel.ship.hull <= vessel.ship.maxHull * .48 && vessel.ship.shield <= vessel.ship.maxShield * .2,
      hostile: this._shipsHostile(source, vessel), occupation: clone(vessel.occupation || null), npcHostile: !!vessel.npcHostile, captured: !!vessel.captured,
      canDeclareHostility: this._canDeclareHostility(viewer, vessel), canHostileBoard: this._canHostileBoard(viewer, vessel), canTakeHelm: viewer.aboard === vessel.id && this._canTakeCapturedHelm(viewer, vessel),
      canReturn: viewer.aboard === vessel.id && this._canReturn(viewer),
      grantedRoles: viewer.id === owner.id ? [...STATION_ROLES] : vessel.grants[viewer.id]?.roles || [], ...(viewer.id === owner.id ? { grants: clone(vessel.grants) } : {}) };
  }
  snapshotFor(c, { drainEvents = true, compact = false } = {}) {
    const room = this.roomInfo(c), vessel = this.vessels.get(c.aboard || c.portVesselId || c.ownedVesselId), ownState = c.game.state;
    const aboardOwner = (c.aboard || c.portVesselId) && vessel ? this.captains.get(vessel.ownerId) : null;
    const ship = aboardOwner ? vessel.ship : ownState.ship;
    const boarding = aboardOwner && this._onBoardingDeck(c, vessel) ? this._viewBoarding(c, vessel) : null;
    let state;
    if (compact) state = clone({ ...Object.fromEntries(MOTION_STATE_FIELDS.map(key => [key, ownState[key]])), ship, boarding });
    else {
      // Off-system world records live in realm persistence; do not clone them just to discard them.
      const { worlds, explorationRecords, ship: ownedShip, cameraPreferences: localCameraPreferences, cameraRevision: localCameraRevision, ...personalState } = ownState;
      state = clone(personalState); state.ship = clone(ship); state.boarding = clone(boarding);
      state.worlds = { [state.systemId]: clone(this._room(state.systemId).record) };
      if (aboardOwner) {
        state.crew = clone(this._crewFor(vessel));
        if (state.interior?.kind === 'ship') state.interior.location = clone(this._locationForVessel(vessel, c));
      }

    }
    if (aboardOwner) { state.cargo = clone(this._inventoryFor(vessel).cargo); if (!compact) state.upgrades = clone(this._inventoryFor(vessel).upgrades); }
    state.interior = clone(ownState.interior);
    if (state.interior && c.aboard && ['ship', 'enemy'].includes(state.interior.kind)) state.interior.location = { ...state.interior.location, ...clone(this._locationForVessel(vessel, c)), vesselId: vessel.id, hull: vessel.ship.hull, maxHull: vessel.ship.maxHull };
    state.multiplayer = { captainId: c.id, name: c.name, realmCode: this.id, ownedVesselId: c.ownedVesselId, aboardVesselId: c.aboard || null, crewRole: c.crewRole, home: clone(c.home), serverAuthoritative: true,
      returnVesselId: c.returnVesselId || null, portVesselId: c.portVesselId || null, hostileBoarding: !!(c.aboard && (vessel.npcHostile || c.boardingTeam && c.boardingTeam !== vessel.ownerId)), canReturn: this._canReturn(c), canTakeHelm: this._canTakeCapturedHelm(c, vessel) };
    const relevantWorld = this._room(state.systemId).runtime, inSpace = room.kind === 'system';
    let world;
    if (compact) {
      world = clone(Object.fromEntries(MOTION_WORLD_FIELDS.map(key => [key, inSpace || key.startsWith('mining') ? relevantWorld[key] : []])));
      world.asteroidStates = inSpace ? relevantWorld.asteroids.map(rock => [rock.id, Math.round(rock.angle * 1000) / 1000, rock.hp, rock.ore, rock.crystal]) : [];
    } else if (inSpace) world = clone(relevantWorld);
    else {
      const { asteroids, enemies, bullets, pickups, traffic, signals, ...metadata } = relevantWorld;
      world = clone({ ...metadata, asteroids: [], enemies: [], bullets: [], pickups: [], traffic: [], signals: [] });
    }
    world.enemies = (world.enemies || []).filter(enemy => !enemy.canonicalVesselId && !enemy.promotedVesselId);
    for (const signal of world.signals) if (signal.id === 'hearth:story:tinbell') signal.resolved = c.game.hasFlag('belt_signal_scanned');
    const players = room.kind === 'system' ? [] : [...this.captains.values()].filter(other => other.id !== c.id && other.game.state.mode === 'person' && this.roomInfo(other).id === room.id && (other.session || other.aboard || other.home)).map(other => this._publicCaptain(other, c));
    const remoteShips = room.kind === 'system' ? [...this.vessels.values()].filter(v => v.systemId === state.systemId && v.id !== c.aboard && !v.dockedAt).map(v => ({ ...this._publicVessel(v, c), ...Object.fromEntries(['x', 'y', 'vx', 'vy', 'angle', 'angularVelocity', 'hull', 'maxHull', 'shield', 'maxShield', 'radius'].map(key => [key, v.ship[key]])), mode: 'ship', online: [...this.captains.values()].some(other => other.aboard === v.id && other.session) })) : [];
    const motion = { protocol: 1, tick: this.tick, serverTime: now(), simulatedAt: this.simulatedAt, ack: c.ack, state, world, room, players, remoteShips,
      events: drainEvents ? c.events.splice(0, 80) : clone(c.events) };
    if (compact) return { ...motion, partial: true };
    return { ...motion, cameraPreferences: clone(c.cameraPreferences), cameraRevision: c.cameraRevision,
      crew: vessel ? [...this.captains.values()].filter(other => other.aboard === vessel.id).map(other => ({ captainId: other.id, name: other.name, role: other.crewRole, online: !!other.session })) : [],
      fleet: [...this.vessels.values()].map(v => this._publicVessel(v, c)), presence: [...this.captains.values()].map(other => { const p = this._publicCaptain(other); return { captainId: p.captainId, name: p.name, online: p.online, systemId: p.systemId, roomId: p.roomId, vesselId: p.vesselId, crewRole: p.crewRole, mode: p.mode, sleeping: p.sleeping, home: p.home }; }),
      homes: Object.values(this.leases).filter(home => home.systemId === state.systemId && home.locationId === state.locationId && (!home.expiresAt || home.expiresAt > now())).map(clone),
      homeOffers: { room: { credits: 50, permanent: true }, outpost: { credits: 180, ore: 12 }, bunk: { credits: 60, ore: 4 } },
      realm: { code: this.id, name: this.name, seed: this.seed, online: this.onlineCount, capacity: MAX_ONLINE, persistence: this.persistence.kind } };
  }
  document() {
    for (const room of this.rooms.values()) this._captureRoom(room);
    const captains = {};
    for (const c of this.captains.values()) {
      c.game._persistRuntime(); c.game.state.lastSaveAt = c.game.state.stats.time;
      const { worlds, explorationRecords, cameraPreferences: localCameraPreferences, cameraRevision: localCameraRevision, ...personalState } = c.game.state;
      const game = clone(personalState); game.worlds = {};
      captains[c.id] = { id: c.id, name: c.name, tokenHash: c.tokenHash, createdAt: c.createdAt, lastSeen: c.lastSeen, home: clone(c.home), cameraPreferences: clone(c.cameraPreferences), cameraRevision: c.cameraRevision, ownedVesselId: c.ownedVesselId, aboard: c.aboard, crewRole: c.crewRole, returnVesselId: c.returnVesselId || null, portVesselId: c.portVesselId || null, boardingTeam: c.boardingTeam || null, combatAtDisconnect: c.combatAtDisconnect || false, recentCommands: clone(c.recentCommands), game };
    }
    const vessels = Object.fromEntries([...this.vessels].map(([id, vessel]) => { const { actor, ...data } = vessel; return [id, clone(data)]; }));
    return { format: 1, realmId: this.id, name: this.name, seed: this.seed, ownerId: this.ownerId, createdAt: this.createdAt, updatedAt: now(), captains, vessels, worlds: clone(this.worlds), sites: clone(this.sites), leases: clone(this.leases) };
  }
  async flush(targetRevision = this.revision) {
    if (this.failed) throw new Error('This realm must be reloaded from its last durable state.');
    if (this.conflicted) throw new PersistenceConflict(this.version);
    while (this.persistedRevision < targetRevision) {
      if (this.flushing) { await this.flushing; continue; }
      const capturedRevision = this.revision, snapshot = this.document();
      this.flushing = (async () => {
        try { const saved = await this.persistence.save(this.id, this.version, snapshot); this.version = saved.version; this.persistedRevision = capturedRevision; this.storageError = null; }
        catch (error) {
          this.storageError = error;
          if (error instanceof PersistenceConflict) { this.conflicted = true; this.onConflict(this, error); }
          throw error;
        } finally { this.flushing = null; }
      })();
      await this.flushing;
    }
  }
  async shutdown() { for (const c of this.captains.values()) if (c.session) { c.lastSeen = now(); c.disconnectUntil = now() + DISCONNECT_GRACE_MS; } this.markDirty(); await this.flush(); }
}
