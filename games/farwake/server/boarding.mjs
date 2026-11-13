/** Persistent physical hulls and authoritative deck combat for a shared realm. */
import { Game, distance } from '../dist/engine.mjs';
import { getShipClass, enemyHullProfile, enemyShipState, cabinLayout, CREW_ROLES } from '../dist/fleet.mjs';
import { SIDEARM, ensureSidearm, getPersonalWeapon, personalWeaponDamage, sidearmAim, clearSidearmSight } from '../dist/combat.mjs';
import { clone, fail, ok, SURFACE_RANGE } from './protocol.mjs';
import { normalizeSpecies } from '../dist/species.mjs';
import { shipRecoveryContext } from '../dist/ship-recovery.mjs';

const alive = captain => captain.game.state.person.health > 0 && !captain.game.state.person.down;
const present = (captain, vessel) => captain.aboard === vessel.id && alive(captain);
const weak = vessel => !vessel.destroyed && vessel.ship.hull > 0 && vessel.ship.hull <= vessel.ship.maxHull * .48 && vessel.ship.shield <= vessel.ship.maxShield * .2;
const airborne = vessel => vessel && !vessel.dockedAt && !vessel.destroyed && vessel.ship.hull > 0;
const close = (one, two, range = 220) => one && two && one.systemId === two.systemId && distance(one.ship, two.ship) <= range + Math.max(one.ship.radius || 0, two.ship.radius || 0);
const liveCrew = crew => !crew.dead && crew.health > 0;

export class BoardingAuthority {
  _migrateLegacyBoarding() {
    for (const source of [...this.vessels.values()]) {
      const old = source.boarding;
      if (source.npcEnemyId || !source.combatInterior || old?.kind !== 'assault') continue;
      const people = [...this.captains.values()].filter(c => c.aboard === source.id && c.game.state.interior?.kind === 'enemy');
      if (!people.length) continue;
      const leader = people.find(c => c.id === source.boardingLeaderId) || people[0], room = this._room(source.systemId);
      let enemy = room.runtime.enemies.find(enemy => enemy.id === old.targetId);
      if (!enemy) {
        // Earlier versions removed a hull on a boarding victory; preserve the
        // already-earned clear without awarding its stores a second time.
        const recorded = this.worlds[source.systemId]?.enemies?.find(enemy => enemy.id === old.targetId);
        const maximum = recorded?.maxHp || 100, hp = recorded?.hp > 0 ? recorded.hp : maximum * .35;
        enemy = { id: old.targetId, name: source.combatInterior.location?.name?.replace(/ ·.*$/, '') || 'Boarded vessel', classId: old.shipClass || 'sparrow',
          x: recorded?.x ?? source.ship.x + source.ship.radius + 85, y: recorded?.y ?? source.ship.y, hp, maxHp: maximum, shield: 0, angle: recorded?.angle || 0,
          disabled: true, active: false, cooldown: 99, speed: 0, damage: 5, reward: 0, faction: 'covenant' };
        room.runtime.enemies.push(enemy); room.record.defeated = room.record.defeated.filter(id => id !== enemy.id); room.record.spawned.push(clone(enemy));
      }
      Object.assign(enemy, enemyHullProfile(old.shipClass || enemy.classId));
      const id = `prize:${source.systemId}:${enemy.id}`, ship = enemyShipState(enemy, id);
      const occupation = { boarderId: leader.id, controllerId: old.phase === 'won' ? leader.id : null, controllerTeam: old.phase === 'won' ? leader.id : null, contested: old.phase === 'active' };
      const boarding = { ...old, originVesselId: source.id, vesselId: id, targetVesselId: id, locationId: `ship:${id}`, leaderId: leader.id, allies: [] };
      enemy.deck = { shipClass: ship.classId, enemies: boarding.enemies, cleared: old.phase === 'won', rewardClaimed: old.phase === 'won', occupation, shotSerial: old.shotSerial || 0 }; enemy.occupation = occupation;
      const target = { id, ownerId: leader.id, name: enemy.name, systemId: source.systemId, dockedAt: null, ship, npcEnemyId: enemy.id, npcHostile: old.phase !== 'won', captured: old.phase === 'won',
        allowCrew: false, grants: {}, helmOwner: null, bunks: {}, installedBunks: 0, actor: null, flightAssist: true, hostileTo: [], inventory: { crew: [], formerCrew: [], memorial: [], boardingHistory: [] },
        boarding, boardingLeaderId: leader.id, occupation, combatInterior: clone(source.combatInterior) };
      target.combatInterior.location = { ...target.combatInterior.location, ...this._locationForVessel(target), vesselId: target.id, shipClass: ship.classId };
      this.vessels.set(id, target); source.boarding = null; source.combatInterior = null; source.boardingLeaderId = null; source.helmOwner = null;
      const owner = this.captains.get(source.ownerId); if (owner) owner.game.state.boarding = null;
      for (const captain of people) { captain.aboard = id; captain.returnVesselId = source.id; captain.boardingTeam = source.ownerId; captain.game.state.boarding = null;
        captain.game.state.interior = clone(target.combatInterior); captain.game.state.locationId = `ship:${id}`; captain.surfaceCache = null; this._bindCaptain(captain);
        captain.events.push({ type: 'boarding', text: `Your boarding party remains aboard ${target.name}. Your original ship and its hired crew are at the tether.` }); }
      this._linkNpcVessel(target);
    }
  }
  _inventoryFor(vessel) {
    const owner = this.captains.get(vessel.ownerId);
    if (vessel.id === owner?.ownedVesselId) return owner.game.state;
    const inventory = vessel.inventory ||= {};
    for (const field of ['crew', 'formerCrew', 'memorial', 'boardingHistory']) inventory[field] ||= [];
    inventory.cargo ||= { ore: 0, crystal: 0 }; inventory.upgrades ||= {}; return inventory;
  }
  _crewFor(vessel) {
    const owner = this.captains.get(vessel.ownerId);
    return this._inventoryFor(vessel).crew;
  }
  _vesselTeam(vessel) { return vessel.occupation?.controllerTeam || vessel.ownerId; }
  _captainTeam(captain, vessel) { return captain?.boardingTeam || vessel.ownerId; }
  _hostileOccupied(vessel) {
    if (!vessel) return false;
    if (vessel.npcOccupied || vessel.npcHostile && !vessel.captured) return true;
    if (vessel.boarding?.phase === 'active' && vessel.boarding.kind === 'defense') return true;
    return [...this.captains.values()].some(c => present(c, vessel) && this._captainTeam(c, vessel) !== vessel.ownerId) || !!(vessel.occupation?.controllerId && vessel.occupation.controllerTeam !== vessel.ownerId);
  }
  _shipsHostile(source, target) {
    if (!source || !target || source.id === target.id || this._vesselTeam(source) === this._vesselTeam(target) && !target.npcHostile) return false;
    return !!(target.npcHostile || source.npcHostile || source.hostileTo?.includes(target.id) || target.hostileTo?.includes(source.id));
  }
  _canDeclareHostility(captain, target) {
    const source = this.vessels.get(captain.aboard);
    return !!(airborne(source) && airborne(target) && this._helm(captain, source) && this._canRole(captain, source, 'helm') && source.id !== target.id && this._vesselTeam(source) !== this._vesselTeam(target) && close(source, target, 900));
  }
  _boardingDeparture(captain, source = this.vessels.get(captain.aboard)) {
    if (captain.game.state.npcContract?.active) return fail('Complete your crew watch or request a return to port through Crew duty before changing vessels.', 'contract');
    if (!source || captain.aboard !== source.id || captain.game.state.systemId !== source.systemId) return fail('Board from the ship you are actually aboard.', 'location');
    if (!alive(captain)) return fail('You must be conscious to use the airlock.', 'incapacitated');
    if (!airborne(source)) return fail('Your ship must be intact and undocked before crossing a boarding tether.', 'location');
    if (source.boarding?.phase === 'active' || source.pvp?.phase === 'active') return fail('Resolve the boarders on this deck or use its return tether before boarding another ship.', 'boarding');
    if (this._helm(captain, source)) return null;
    const { mode, interior, person } = captain.game.state;
    if (mode !== 'person' || !['ship', 'enemy'].includes(interior?.kind)) return fail('Use the entry airlock inside your current ship.', 'airlock');
    if (!Number.isFinite(person.x) || !Number.isFinite(person.y) || distance(person, cabinLayout(source.ship.classId).spawn) > 70) return fail('Walk to your ship’s entry airlock before boarding.', 'airlock');
    return null;
  }
  _canUseBoardingAirlock(captain, source = this.vessels.get(captain.aboard)) { return !this._boardingDeparture(captain, source); }
  _npcEngineDisabled(vessel) {
    // Promoting a disabled NPC into a persistent hull must not let ordinary
    // shield recharge repair its engines or silently remove its boarding path.
    return !!(vessel?.npcEnemyId && !vessel.captured && !vessel.pvp && !vessel.destroyed && vessel.ship.hull > 0 && vessel.ship.hull <= vessel.ship.maxHull * .48);
  }
  _npcBoardingCheck(captain, enemy) {
    const source = this.vessels.get(captain.aboard), departure = this._boardingDeparture(captain, source);
    if (departure) return departure;
    if (captain.game.state.pendingEncounter) return fail('Resolve the open transmission first.', 'encounter');
    if (!enemy || enemy.hp <= 0) return fail('That vessel is no longer here.', 'target');
    if (enemy.trainingTarget) return fail('This is an unmanned Navy practice hull, with no boardable interior.', 'training-target');
    const target = enemy.canonicalVesselId && this.vessels.get(enemy.canonicalVesselId);
    if (!enemyHullProfile(enemy.classId).boardable && !(target?.boarding?.kind === 'assault' && target.combatInterior)) return fail('This craft is too small for a boarding party.', 'capacity');
    if (target && (target.captured || target.pvp || target.dockedAt)) return fail('This hull has a player-controlled berth. Use crew access or explicitly declare a hostile boarding action.', 'permission');
    if (target && (target.id === source.id || target.systemId !== source.systemId || target.destroyed)) return fail('That vessel is not an available nearby boarding target.', 'target');
    if (target ? !this._npcEngineDisabled(target) : !enemy.disabled) return fail('Disable the target’s engines before boarding.', 'disabled');
    if (enemy.boardingTargetId && !target) return fail('Another boarding party already has the tether.', 'occupied');
    const hull = target?.ship || enemy;
    const gap = distance(source.ship, hull);
    if (!Number.isFinite(gap) || gap > (source.ship.radius || 0) + (hull.radius || 0) + 110) return fail('Close to the disabled vessel before attaching a tether.', 'distance');
    if (Math.hypot(hull.vx || 0, hull.vy || 0) >= 90) return fail('Wait for the target to slow before crossing the tether.', 'speed');
    const others = target && [...this.captains.values()].filter(other => other.id !== captain.id && present(other, target));
    if (others?.length && (target.boarding?.kind !== 'assault' || target.boarding.phase !== 'active' || others.some(other => this._captainTeam(other, target) !== this._captainTeam(captain, source)))) return fail('Another boarding party controls this deck.', 'boarding');
    return null;
  }
  _hostileBoardingCheck(captain, target) {
    const source = this.vessels.get(captain.aboard), departure = this._boardingDeparture(captain, source);
    if (departure) return departure;
    if (!airborne(target) || source.id === target.id || source.systemId !== target.systemId) return fail('Choose another intact undocked vessel in this system.', 'location');
    // Fleet metadata includes remote hulls. Reject their location before an
    // NPC lookup can recreate a deliberately unloaded simulation room.
    if (target.npcEnemyId && !target.captured && !target.pvp) return this._npcBoardingCheck(captain, this._enemyFor(target));
    if (!this._shipsHostile(source, target)) return fail('The helmsman must explicitly declare hostility before boarding another captain’s ship.', 'permission');
    if (!weak(target)) return fail('Disable the target hull and shields before crossing.', 'disabled');
    if (!close(source, target)) return fail('Approach within tether range before boarding.', 'distance');
    if (Math.hypot(target.ship.vx || 0, target.ship.vy || 0) >= 90) return fail('Wait for the target to slow before crossing the tether.', 'speed');
    if (target.boarding?.phase === 'active' && target.boarding.kind !== 'pvp' && !target.npcOccupied) return fail('Clear the existing pirate boarding action before another party crosses.', 'boarding');
    return null;
  }
  _canHostileBoard(captain, target) {
    return !this._hostileBoardingCheck(captain, target);
  }
  _boardingAction(captain, { vessel = null, enemy = null } = {}) {
    let command, args, check;
    if (vessel?.npcEnemyId && !vessel.captured && !vessel.pvp) { command = 'boardEnemy'; args = { id: vessel.npcEnemyId }; check = this._hostileBoardingCheck(captain, vessel); }
    else if (enemy) { command = 'boardEnemy'; args = { id: enemy.id }; check = this._npcBoardingCheck(captain, enemy); }
    else if (vessel && !this._shipsHostile(this.vessels.get(captain.aboard), vessel)) { command = 'boardShip'; args = { vesselId: vessel.id }; check = this._friendlyBoardingCheck(captain, vessel); }
    else { command = 'boardHostileShip'; args = { vesselId: vessel?.id }; check = this._hostileBoardingCheck(captain, vessel); }
    const name = vessel?.name || enemy?.name || 'ship', joining = command === 'boardEnemy' && vessel?.boarding?.phase === 'active' && [...this.captains.values()].some(other => other.id !== captain.id && present(other, vessel));
    return { command, args, label: joining ? `Join boarding of ${name}` : `Board ${name}`, enabled: !check, reason: check?.reason || null };
  }
  _boardingTargets(captain) {
    const source = this.vessels.get(captain.aboard);
    if (!source || source.destroyed || source.dockedAt) return [];
    const targets = [];
    for (const vessel of this.vessels.values()) {
      if (vessel.id === source.id || vessel.systemId !== source.systemId || vessel.destroyed || vessel.dockedAt || distance(source.ship, vessel.ship) > 900) continue;
      if (!this._shipsHostile(source, vessel) && !this._canBoard(captain, vessel)) continue;
      targets.push({ id: vessel.id, vesselId: vessel.id, enemyId: vessel.npcEnemyId || null, name: vessel.name, classId: vessel.ship.classId, distance: distance(source.ship, vessel.ship), boardingAction: this._boardingAction(captain, { vessel }) });
    }
    for (const enemy of this._room(source.systemId).runtime.enemies) {
      if (enemy.hp <= 0 || !enemy.disabled || enemy.canonicalVesselId || enemy.promotedVesselId || enemy.trainingTarget || !enemyHullProfile(enemy.classId).boardable || distance(source.ship, enemy) > 900) continue;
      targets.push({ id: enemy.id, enemyId: enemy.id, name: enemy.name, classId: enemy.classId, distance: distance(source.ship, enemy), boardingAction: this._boardingAction(captain, { enemy }) });
    }
    return targets.sort((one, two) => one.distance - two.distance);
  }
  _canTakeCapturedHelm(captain, vessel) {
    if (!vessel || !present(captain, vessel) || vessel.destroyed || captain.game.state.mode !== 'person') return false;
    if (vessel.boarding?.phase === 'active') return false;
    if (!vessel.pvp && vessel.npcEnemyId) return !vessel.npcOccupied && !!(vessel.boarding?.phase === 'won' || vessel.captured || this._enemyFor(vessel)?.deck?.cleared);
    if (!vessel.pvp || this._captainTeam(captain, vessel) === vessel.ownerId) return false;
    const team = this._captainTeam(captain, vessel);
    return ![...this.captains.values()].some(other => present(other, vessel) && this._captainTeam(other, vessel) !== team) && !this._crewFor(vessel).some(liveCrew);
  }
  _canReturn(captain) {
    const source = this.vessels.get(captain.returnVesselId), target = this.vessels.get(captain.aboard);
    return !!(source && target && source.id !== target.id && airborne(source) && close(source, target, 270) && this._canBoard(captain, source) && !this._hostileOccupied(source));
  }
  _declareHostility(captain, args) {
    const target = this.vessels.get(args.vesselId || args.id), source = this.vessels.get(captain.aboard);
    if (!this._canDeclareHostility(captain, target)) return fail('Declare hostility from a permitted helm within 900 metres of another undocked vessel.', 'distance');
    source.hostileTo ||= []; target.hostileTo ||= [];
    if (!source.hostileTo.includes(target.id)) source.hostileTo.push(target.id);
    if (!target.hostileTo.includes(source.id)) target.hostileTo.push(source.id);
    const event = { type: 'hostility', attackerId: captain.id, vesselId: source.id, targetVesselId: target.id, text: `${captain.name} declared ${source.name} hostile to ${target.name}. Both vessels can now exchange fire.` };
    for (const person of this.captains.values()) if ([source.id, target.id].includes(person.aboard) || person.id === target.ownerId) person.events.push(event);
    return ok({ text: `Hostility declared against ${target.name}.`, vesselId: target.id });
  }
  _enemyFor(vessel) { return vessel.npcEnemyId ? this._room(vessel.systemId).runtime.enemies.find(enemy => enemy.id === vessel.npcEnemyId) : null; }
  _linkNpcVessel(vessel) {
    const enemy = this._enemyFor(vessel); if (!enemy) return;
    enemy.canonicalVesselId = vessel.id; enemy.promotedVesselId = vessel.id; enemy.hp = vessel.ship.hull; enemy.maxHp = vessel.ship.maxHull;
    enemy.x = vessel.ship.x; enemy.y = vessel.ship.y; enemy.vx = vessel.ship.vx || 0; enemy.vy = vessel.ship.vy || 0; enemy.angle = vessel.ship.angle;
    enemy.damageControl = vessel.ship.damageControl; enemy.energy = vessel.ship.energy; enemy.shield = vessel.ship.shield; enemy.active = false; enemy.disabled = this._npcEngineDisabled(vessel) || weak(vessel); enemy.occupation = vessel.occupation || enemy.occupation;
    if (enemy.deck && vessel.boarding?.enemies) enemy.deck.enemies = vessel.boarding.enemies;
  }
  _joinNpcBoarding(captain, source, target) {
    if (source.helmOwner === captain.id) source.helmOwner = null;
    captain.returnVesselId = source.id; captain.boardingTeam = this._captainTeam(captain, source);
    this._cabin(captain, target); captain.crewRole = 'security';
    captain.game.state.interior = clone(target.combatInterior);
    captain.game.state.interior.location.originVesselId = source.id;
    captain.game.state.boarding = null;
    ensureSidearm(captain.game.state.person).weaponDrawn = true;
    captain.surfaceCache = null; this._ensurePersonPosition(captain, true);
    captain.game._log('Across the tether', `You joined the boarding party aboard ${target.name}.`, 'boarding');
    this._deckEvent(target, { type: 'boarding', text: `${captain.name} joined the boarding party aboard ${target.name}.` });
    return ok({ text: `You joined the boarding party aboard ${target.name}.`, vesselId: target.id, boarding: clone(target.boarding), body: this._location(captain) });
  }
  _boardEnemy(captain, args) {
    const source = this.vessels.get(captain.aboard), id = args.enemyId || args.id;
    const enemy = source && this._room(source.systemId).runtime.enemies.find(candidate => candidate.id === id);
    const check = this._npcBoardingCheck(captain, enemy); if (check) return check;
    let target = enemy.canonicalVesselId && this.vessels.get(enemy.canonicalVesselId);
    if (target && [...this.captains.values()].some(other => other.id !== captain.id && present(other, target))) return this._joinNpcBoarding(captain, source, target);
    if (target) this._linkNpcVessel(target);
    let boarding, interior;
    // Run the transition for the person who crosses, with the real carrier
    // temporarily bound. A guest's private ship and the carrier's pilot remain
    // separate, and the carrier's own deck/combat actor is never repurposed.
    const game = captain.game, pilotedByOther = source.helmOwner && source.helmOwner !== captain.id;
    const motion = { vx: source.ship.vx, vy: source.ship.vy, angularVelocity: source.ship.angularVelocity };
    const result = this._withShip(captain, source, () => {
      Object.assign(enemy, enemyHullProfile(target?.ship.classId || enemy.classId || (game.currentSystem.danger >= 3 ? 'hauler' : 'sparrow')));
      let outcome = game._enterInterior(game._enemyLocation(enemy), 'enemy', enemy.id);
      if (outcome.ok) outcome = game._beginBoarding(enemy, 'assault', target?.ship.classId || enemy.classId);
      if (outcome.ok) { boarding = game.state.boarding; interior = clone(game.state.interior); }
      return outcome;
    });
    if (pilotedByOther) Object.assign(source.ship, motion);
    if (!result.ok) return result;
    boarding.originVesselId = source.id;
    if (!target) {
      const vesselId = `prize:${source.systemId}:${enemy.id}`, ship = enemyShipState(enemy, vesselId);
      target = { id: vesselId, ownerId: captain.id, name: enemy.name, systemId: source.systemId, dockedAt: null, ship, npcEnemyId: enemy.id, npcHostile: true, captured: false,
        allowCrew: false, grants: {}, helmOwner: null, bunks: {}, installedBunks: 0, actor: null, flightAssist: true, hostileTo: [], inventory: { crew: [], formerCrew: [], memorial: [], boardingHistory: [] } };
      this.vessels.set(target.id, target);
    }
    // Hired crew remain on the source ship. A person never occupies two hulls.
    boarding.allies = []; boarding.vesselId = target.id; boarding.targetVesselId = target.id;
    target.boarding = boarding; target.boardingLeaderId = captain.id; target.combatInterior = interior;
    target.occupation = { boarderId: captain.id, controllerId: null, controllerTeam: null, contested: boarding.phase === 'active' };
    if (enemy.deck) enemy.deck.occupation = target.occupation;
    interior.location.id = `ship:${target.id}`; interior.location.vesselId = target.id; interior.location.classId = target.ship.classId; interior.location.shipClassId = target.ship.classId;
    target.combatInterior = interior; target.actor = null;
    if (source.helmOwner === captain.id) source.helmOwner = null;
    captain.returnVesselId = source.id; captain.boardingTeam = this._captainTeam(captain, source); captain.aboard = target.id; captain.crewRole = 'security';
    captain.game.state.mode = 'person'; captain.game.state.boarding = null; captain.game.state.stationView = null; captain.game.state.interior = clone(interior); captain.game.state.locationId = interior.location.id;
    captain.surfaceCache = null; this._bindCaptain(captain); this._ensurePersonPosition(captain, true); this._linkNpcVessel(target);
    return ok({ text: `You crossed to ${target.name}. ${source.name} remains at the tether.`, vesselId: target.id, boarding: clone(boarding), body: this._location(captain) });
  }
  _boardHostileShip(captain, args) {
    const target = this.vessels.get(args.vesselId || args.id), source = this.vessels.get(captain.aboard);
    const check = this._hostileBoardingCheck(captain, target); if (check) return check;
    if (target.npcOccupied && target.boarding?.enemies.some(enemy => enemy.health > 0)) {
      if (source.helmOwner === captain.id) source.helmOwner = null; captain.returnVesselId = source.id; captain.boardingTeam = target.ownerId; this._cabin(captain, target); captain.crewRole = 'security';
      target.boarding.phase = 'active'; target.boarding.unopposedTime = 0; target.boardingLeaderId = captain.id; target.lastBoardingOutcome = null; target.actor = null;
      return ok({ text: `You returned to the occupied deck of ${target.name}. The surviving pirates are still aboard.`, vesselId: target.id });
    }
    if (target.npcEnemyId && !target.captured) return this._boardEnemy(captain, { id: target.npcEnemyId });
    if (target.boarding?.phase === 'active' && target.boarding.kind !== 'pvp') return fail('Clear the existing pirate boarding action before another party crosses.', 'boarding');
    this._ensurePvP(target);
    if (source.helmOwner === captain.id) source.helmOwner = null; captain.returnVesselId = source.id; captain.boardingTeam = this._captainTeam(captain, source);
    this._cabin(captain, target); captain.crewRole = 'security'; ensureSidearm(captain.game.state.person).weaponDrawn = true;
    const oldHelm = this.captains.get(target.helmOwner);
    if (oldHelm && oldHelm.id !== captain.id) {
      this._cabin(oldHelm, target);
      const bridge = this._surface(oldHelm)?.entities.find(entity => entity.data?.stationRole === 'helm');
      if (bridge) Object.assign(oldHelm.game.state.person, { x: bridge.x, y: bridge.y });
    }
    target.helmOwner = null; target.pvp.phase = 'active'; target.pvp.attackerIds ||= [];
    if (!target.pvp.attackerIds.includes(captain.id)) target.pvp.attackerIds.push(captain.id);
    this._refreshOccupation(target);
    this._deckEvent(target, { type: 'boarding', boardingId: target.pvp.id, attackerId: captain.id, text: `${captain.name} crossed the tether. The hulls remain exposed to space combat.` });
    return ok({ text: `You are aboard ${target.name}. Clear its defenders to take the bridge.`, vesselId: target.id });
  }
  _ensurePvP(vessel) {
    if (vessel.pvp) return vessel.pvp;
    const layout = cabinLayout(vessel.ship.classId), crew = this._crewFor(vessel);
    vessel.pvp = { id: `pvp:${vessel.id}:${this.tick}`, phase: 'active', shipClass: vessel.ship.classId, startedAt: this.simulatedAt, combatTime: 0, shotSerial: 0, attackerIds: [], crewActors: crew.filter(liveCrew).map((member, i) => ({ id: `crew:${member.id}`, crewId: member.id, name: member.name, species: normalizeSpecies(member.species), role: member.role,
      ...layout.crewSpawns[i % layout.crewSpawns.length], health: member.health, maxHealth: member.maxHealth || 100, damage: CREW_ROLES[member.role]?.damage || 8, speed: 52, cooldown: 1.5 + i * .2, teamId: vessel.ownerId, color: member.color, facing: 'down' })) };
    return vessel.pvp;
  }
  _refreshOccupation(vessel) {
    if (!vessel?.pvp) return;
    const living = [...this.captains.values()].filter(c => present(c, vessel)), invaders = living.filter(c => this._captainTeam(c, vessel) !== vessel.ownerId);
    const teams = new Set(living.map(c => this._captainTeam(c, vessel))); if (this._crewFor(vessel).some(liveCrew)) teams.add(vessel.ownerId);
    const controller = this.captains.get(vessel.occupation?.controllerId);
    const controllerPresent = controller && present(controller, vessel);
    vessel.occupation = { boarderId: invaders[0]?.id || null, controllerId: controllerPresent ? controller.id : null, controllerTeam: controllerPresent ? this._captainTeam(controller, vessel) : null, contested: teams.size > 1 };
    vessel.pvp.phase = teams.size > 1 ? 'active' : invaders.length ? 'won' : 'repelled';
    if (!controllerPresent && vessel.helmOwner && this._captainTeam(this.captains.get(vessel.helmOwner), vessel) !== vessel.ownerId) vessel.helmOwner = null;
  }
  _returnToOwnShip(captain) {
    const target = this.vessels.get(captain.aboard), origin = this.vessels.get(captain.returnVesselId);
    if (target?.dockedAt) return this._disembark(captain);
    if (!this._canReturn(captain)) return fail('Your return vessel must be intact, free of boarders, and within tether range.', 'distance');
    if (captain.game.state.mode !== 'person') return fail('Step into the cabin before crossing the tether.', 'mode');
    const airlock = cabinLayout(target.ship.classId).spawn;
    if (distance(captain.game.state.person, airlock) > 70) return fail('Return to the entry airlock before crossing back.', 'distance');
    if (target.helmOwner === captain.id) target.helmOwner = null;
    const wasNpc = !!target.npcEnemyId;
    if (wasNpc && target.boarding?.phase === 'active') {
      const event = { ...target.boarding, phase: 'retreated', endedAt: captain.game.state.stats.time };
      captain.game.state.boardingHistory.push({ id: event.id, kind: 'assault', phase: 'retreated', systemId: target.systemId, time: event.endedAt, casualties: [] });
      const remaining = [...this.captains.values()].filter(other => other.id !== captain.id && present(other, target)), enemy = this._enemyFor(target);
      if (remaining.length) {
        // One crew member retreating must not cancel everybody else's fight.
        if (target.boardingLeaderId === captain.id) {
          const leader = remaining[0]; target.boardingLeaderId = leader.id; target.boarding.leaderId = leader.id;
          target.boarding.originVesselId = leader.returnVesselId || target.boarding.originVesselId;
          target.occupation.boarderId = leader.id; target.actor = null;
          if (enemy) { enemy.boardingTargetId = leader.id; enemy.boardingOriginId = target.boarding.originVesselId; }
        }
      } else {
        target.boarding.phase = 'retreated'; target.boardingLeaderId = null; target.occupation = { boarderId: null, controllerId: null, contested: false };
        if (enemy) { delete enemy.boardingTargetId; delete enemy.boardingOriginId; if (enemy.deck) enemy.deck.occupation = target.occupation; }
      }
    }
    captain.returnVesselId = null; captain.boardingTeam = null; captain.game.state.boarding = null;
    this._cabin(captain, origin);
    if (!origin.helmOwner && this._canRole(captain, origin, 'helm')) { origin.helmOwner = captain.id; captain.crewRole = 'helm'; captain.game.state.mode = 'ship'; captain.game.state.locationId = null; captain.game.state.interior = null; }
    this._refreshOccupation(target); this._linkNpcVessel(target);
    return ok({ text: `You returned to ${origin.name}. ${target.name} remains where you left it.`, vesselId: origin.id });
  }
  _takeCapturedHelm(captain) {
    const vessel = this.vessels.get(captain.aboard);
    if (!this._canTakeCapturedHelm(captain, vessel)) return fail('Clear the opposing crew before claiming the bridge.', 'boarding');
    const bridge = this._surface(captain)?.entities.find(entity => entity.data?.stationRole === 'helm');
    if (!bridge || distance(bridge, captain.game.state.person) > SURFACE_RANGE) return fail('Walk to the bridge helm first.', 'distance');
    if (vessel.helmOwner && vessel.helmOwner !== captain.id) return fail('Another captain holds the helm.', 'station-occupied');
    if (vessel.npcEnemyId && !vessel.pvp) {
      const team = this._captainTeam(captain, vessel), allies = [...this.captains.values()].filter(other => other.aboard === vessel.id && this._captainTeam(other, vessel) === team);
      vessel.captured = true; vessel.npcHostile = false; vessel.ownerId = captain.id;
      for (const ally of allies) {
        ally.boardingTeam = captain.id;
        if (ally.id !== captain.id && !Object.hasOwn(vessel.grants, ally.id)) vessel.grants[ally.id] = { allowed: true, roles: ['security'], allowBunk: false };
      }
    }
    vessel.occupation = { boarderId: captain.id, controllerId: captain.id, controllerTeam: this._captainTeam(captain, vessel), contested: false };
    vessel.helmOwner = captain.id; captain.crewRole = 'helm'; captain.game.state.mode = 'ship'; captain.game.state.interior = null; captain.game.state.locationId = null; captain.game.state.boarding = null;
    vessel.actor = null; this._linkNpcVessel(vessel);
    return ok({ text: `You take ${vessel.name}'s helm. Your original ship remains in this system.`, vesselId: vessel.id });
  }
  _deckEvent(vessel, event) { for (const captain of this.captains.values()) if (captain.aboard === vessel.id) captain.events.push(event.teamId ? { ...event, team: event.attackerId === captain.id ? 'player' : event.teamId === this._captainTeam(captain, vessel) ? 'friendly' : 'hostile' } : event); }
  _deckPeople(vessel) {
    return [...this.captains.values()].filter(c => c.aboard === vessel.id && c.game.state.mode === 'person').map(c => ({ ...c.game.state.person, id: c.id, captainId: c.id, human: true, name: c.name, maxHealth: c.game.state.person.maxHealth || 100, teamId: this._captainTeam(c, vessel) }));
  }
  _crewActors(vessel) {
    if (!vessel.pvp) return [];
    for (const actor of vessel.pvp.crewActors) { const crew = this._crewFor(vessel).find(member => member.id === actor.crewId); if (crew) actor.health = crew.health; }
    return vessel.pvp.crewActors;
  }
  _viewBoarding(captain, vessel) {
    if (!vessel || captain.game.state.mode !== 'person' || captain.aboard !== vessel.id) return null;
    if (vessel.pvp) {
      const team = this._captainTeam(captain, vessel), people = [...this._deckPeople(vessel), ...this._crewActors(vessel)];
      return { id: vessel.pvp.id, kind: team === vessel.ownerId ? 'defense' : 'assault', phase: vessel.pvp.phase === 'active' ? 'active' : 'won', pvp: true,
        shipClass: vessel.ship.classId, vesselId: vessel.id, targetVesselId: vessel.id, originVesselId: captain.returnVesselId || null, targetId: vessel.id,
        locationId: `ship:${vessel.id}`, combatTime: vessel.pvp.combatTime, occupation: clone(vessel.occupation),
        enemies: people.filter(person => person.teamId !== team).map(person => ({ ...person, team: 'hostile' })), allies: people.filter(person => person.id !== captain.id && person.teamId === team).map(person => ({ ...person, team: 'friendly' })) };
    }
    return vessel.boarding || null;
  }
  _attackDeck(captain, enemyId, input = captain.appliedInput || captain.input || {}) {
    const vessel = this.vessels.get(captain.aboard);
    if (!vessel || captain.game.state.mode !== 'person' || !alive(captain)) return fail('You must be conscious on the occupied deck.', 'location');
    if (!vessel.pvp) {
      if (!vessel.boarding || vessel.boarding.phase !== 'active') return fail('There are no active boarders on this deck.', 'location');
      const actor = this._actor(vessel); captain.game._playerName = captain.name;
      const result = actor.attackBoarder(enemyId, captain.game, input); this._syncActor(vessel); return result;
    }
    if (captain.game._boardingShotTimer > 0) return fail('Your sidearm is cycling.', 'cooldown');
    const team = this._captainTeam(captain, vessel), candidates = [...this._deckPeople(vessel), ...this._crewActors(vessel)].filter(person => person.teamId !== team && person.health > 0);
    if (enemyId && !candidates.some(person => person.id === enemyId)) return fail('That person is not a hostile target on this deck.', 'target');
    const requested = enemyId && candidates.find(person => person.id === enemyId), person = captain.game.state.person;
    let shotInput = input;
    if (requested && !input.aiming) { const length = Math.hypot(requested.x - person.x, requested.y - person.y); shotInput = length > 0 ? { ...input, aiming: true, aimX: (requested.x - person.x) / length, aimY: (requested.y - person.y) / length } : input; }
    const aim = sidearmAim(person, candidates, shotInput, vessel.ship.classId);
    const weapon = getPersonalWeapon(person), damage = personalWeaponDamage(person, aim.target, captain.game.characterEffects.sidearmDamage);
    captain.game._boardingShotTimer = weapon.cooldown * captain.game.characterEffects.sidearmCooldown;
    captain.game.state.person.weaponReadyAt = vessel.pvp.combatTime + captain.game._boardingShotTimer;
    const result = this._deckShot(vessel, captain.game.state.person, aim, { id: captain.id, name: captain.name, teamId: team, damage, weapon });
    captain.game.state.stats.personShots = (captain.game.state.stats.personShots || 0) + 1;
    if (aim.target) captain.game.state.stats.personHits = (captain.game.state.stats.personHits || 0) + 1;
    this._refreshOccupation(vessel); return ok({ shot: result, targetId: aim.targetId, hit: aim.hit, damage: aim.hit ? damage : 0 });
  }
  _deckShot(vessel, person, aim, attacker) {
    const combat = vessel.pvp, at = combat.combatTime, target = aim.target, weapon = attacker.weapon || SIDEARM;
    ensureSidearm(person); person.weapon = weapon.id; person.weaponDrawn = true; person.aimAngle = aim.angle; person.aimTargetId = aim.targetId; person.aimManual = aim.manual; person.attackUntil = at + weapon.shotDuration;
    const shot = { type: 'person-shot', id: `${combat.id}:shot:${++combat.shotSerial}`, boardingId: combat.id, at, until: person.attackUntil,
      attackerId: attacker.id, actorName: attacker.name, team: 'player', teamId: attacker.teamId, weaponId: weapon.id, angle: aim.angle,
      from: clone(aim.from), to: clone(aim.to), x: aim.from.x, y: aim.from.y, targetX: aim.to.x, targetY: aim.to.y, targetId: aim.targetId, targetName: target?.name || null,
      hit: !!target, blocked: aim.blocked, damage: target ? attacker.damage : 0 };
    person.lastShot = shot; this._deckEvent(vessel, shot);
    if (!target) return shot;
    const human = target.human && this.captains.get(target.captainId), member = target.crewId && this._crewFor(vessel).find(crew => crew.id === target.crewId);
    const victim = human?.game.state.person || member; if (!victim) return shot;
    victim.health = Math.max(0, victim.health - attacker.damage); victim.hitUntil = at + .24; victim.lastHitBy = attacker.id; target.health = victim.health;
    this._deckEvent(vessel, { ...shot, type: 'person-hit', id: `${shot.id}:hit`, until: at + .65, x: target.x, y: target.y, health: victim.health, maxHealth: target.maxHealth || 100 });
    if (!victim.health) {
      const event = { ...shot, type: human ? 'person-down' : 'boarder-down', id: `${shot.id}:down`, x: target.x, y: target.y, actorId: target.id, until: at + 1.5, text: `${attacker.name} downed ${target.name}.` };
      this._deckEvent(vessel, event);
      if (human) this._recoverCaptain(human, `${attacker.name} forced you off ${vessel.name}. Your recovery berth is outside the occupied ship.`);
      else { victim.status = 'dead'; victim.dead = true; const owner = this.captains.get(vessel.ownerId); if (owner && !owner.game.state.memorial.some(entry => entry.crewId === victim.id)) owner.game.state.memorial.push({ id: `memorial:${victim.id}`, crewId: victim.id, name: victim.name, species: normalizeSpecies(victim.species), role: victim.role, cause: `Boarded by ${attacker.name}`, systemId: vessel.systemId, time: at, shipClass: vessel.ship.classId }); }
      const killer = this.captains.get(attacker.id); if (killer) killer.game.state.stats.personKills = (killer.game.state.stats.personKills || 0) + 1;
    }
    return shot;
  }
  _stepPvP(vessel, dt, captains) {
    const combat = vessel.pvp; if (!combat) return;
    combat.combatTime += dt;
    for (const captain of captains.filter(c => c.aboard === vessel.id && c.game.state.mode === 'person')) {
      if (captain.aboard !== vessel.id || captain.game.state.mode !== 'person') continue;
      captain.game._boardingShotTimer = Math.max(0, (captain.game._boardingShotTimer || 0) - dt);
      const view = this._viewBoarding(captain, vessel), person = ensureSidearm(captain.game.state.person), aim = sidearmAim(person, view.enemies, captain.appliedInput || {}, vessel.ship.classId);
      person.weaponDrawn = view.phase === 'active'; person.aimAngle = aim.angle; person.aimTargetId = aim.targetId; person.aimManual = aim.manual;
      if (captain.appliedInput?.fire) this._attackDeck(captain, null, captain.appliedInput);
    }
    const layout = cabinLayout(vessel.ship.classId), actor = vessel.actor;
    for (const guard of this._crewActors(vessel)) {
      if (guard.health <= 0) continue; guard.cooldown = Math.max(0, (guard.cooldown || 0) - dt);
      const targets = this._deckPeople(vessel).filter(person => person.health > 0 && person.teamId !== guard.teamId), target = targets.sort((a, b) => distance(guard, a) - distance(guard, b))[0];
      if (!target) continue;
      if (distance(guard, target) > 135 || !clearSidearmSight(layout, guard, target)) actor._advanceBoardingActor(guard, target, layout, dt);
      else if (!guard.cooldown) { guard.cooldown = guard.role === 'security' ? .8 : 1.15; this._deckShot(vessel, guard, sidearmAim(guard, targets, {}, layout), { id: guard.id, name: guard.name, teamId: guard.teamId, damage: guard.damage }); }
    }
    this._refreshOccupation(vessel);
  }
  _recoverCaptain(captain, text) {
    const previous = this.vessels.get(captain.aboard); if (previous?.helmOwner === captain.id) previous.helmOwner = null;
    const game=captain.game,system=this._room(previous?.systemId||game.state.systemId).runtime;
    const context=shipRecoveryContext(game,previous?.ship||game.state.ship,{system,sourceKind:previous?.destroyed?'ship-destroyed':'deck-defeat'});
    if(!context.destination)return;
    this._interruptNpcContract(captain);
    captain.game.state.boarding = null; captain.game._boardingShotTimer = 0; captain.returnVesselId = null; captain.boardingTeam = null;
    const owned = this.vessels.get(captain.ownedVesselId);
    if (owned && (owned.destroyed || this._hostileOccupied(owned))) this._detachLostVessel(captain, owned);
    this._landCharacter(captain,context.destination.systemId,context.destination.bodyId);
    game.completeShipRecovery({...context,...(text?{message:`${text} You are ashore at ${context.destination.name}; no replacement hull was issued.`}:{})});
    captain.events.push(...game.drainEvents());captain.surfaceCache=null;this._refreshOccupation(previous);
  }
  _detachLostVessel(captain, previous) {
    if(!previous||captain.ownedVesselId!==previous.id)return;
    // Keep the manifest attached to the physical wreck or occupied vessel.
    // A compatibility record has no hull, ownership, berth, or launch rights.
    previous.inventory = { cargo: captain.game.state.cargo, upgrades: captain.game.state.upgrades, crew: captain.game.state.crew, formerCrew: captain.game.state.formerCrew, memorial: captain.game.state.memorial, boardingHistory: captain.game.state.boardingHistory };
    captain.game.losePersonalVessel(previous.ship,{reason:previous.destroyed?'destroyed':'captured'});
    captain.ownedVesselId=null;if(captain.portVesselId===previous.id)captain.portVesselId=null;
    if (previous.actor) { previous.actor.state.ship = previous.ship; previous.actor.state.crew = previous.inventory.crew; }
  }
  _destroyVessel(vessel, details = {}) {
    if (vessel.destroyed) return true;
    vessel.destroyed = true; vessel.ship.destroyed = true; vessel.ship.hull = 0; vessel.ship.shield = 0; vessel.helmOwner = null; vessel.ship.vx = 0; vessel.ship.vy = 0;
    const occupants = [...this.captains.values()].filter(c => c.aboard === vessel.id);
    // A relief survivor belongs to the actual carrier, even if the captain
    // who accepted the rescue has gone ashore or owns a different ship.
    for (const captain of this.captains.values()) {
      const loss = captain.game.earthCarrierLost?.(vessel.id);
      if (!loss?.affected) continue;
      const rooms = [...new Set([vessel.systemId, loss.operationSystemId].filter(Boolean))].map(systemId => this._room(systemId));
      for (const room of rooms) room.runtime.signals = room.runtime.signals.filter(signal => signal.campaignKey !== loss.campaignKey);
      if (loss.operationStep) {
        const room = this._room(loss.operationSystemId || vessel.systemId);
        const prefix = `earth:${loss.campaignKey}:${loss.operationStep}:`;
        const retain = enemy => !enemy.id.startsWith(prefix) || enemy.promotedVesselId || enemy.canonicalVesselId;
        room.runtime.enemies = room.runtime.enemies.filter(retain);
        room.record.spawned = room.record.spawned.filter(retain);
        for (const field of ['enemyHealth', 'enemyStates']) for (const id of Object.keys(room.record[field] || {})) if (id.startsWith(prefix)) delete room.record[field][id];
        room.runtime.bullets = room.runtime.bullets.filter(bullet => !String(bullet.ownerId || bullet.owner || '').startsWith(prefix));
      }
    }
    for(const captain of this.captains.values())if(captain.game.state.ship.id===vessel.id){
      captain.game.professionRescue?.();
      if(!occupants.includes(captain))captain.game.narrativeRescue();
    }
    for (const member of this._crewFor(vessel)) if (liveCrew(member)) { member.health = 0; member.status = 'dead'; member.dead = true; }
    for (const captain of occupants) this._recoverCaptain(captain, `${vessel.name} was destroyed. An escape capsule brought you to a safe port; its wreck remains in space.`);
    // An owner who is ashore or aboard another vessel loses the destroyed
    // registration too, but never moves with the absent hull's survivors.
    for(const captain of this.captains.values())if(captain.ownedVesselId===vessel.id)this._detachLostVessel(captain,vessel);
    if (vessel.boarding) vessel.boarding.phase = 'lost'; if (vessel.pvp) vessel.pvp.phase = 'destroyed';
    vessel.occupation = { boarderId: null, controllerId: null, contested: false };
    if(vessel.npcEnemyId){
      const record=this._room(vessel.systemId).record;
      if(!record.defeated.includes(vessel.npcEnemyId))record.defeated.push(vessel.npcEnemyId);
      delete record.enemyHealth[vessel.npcEnemyId];
    }
    this._linkNpcVessel(vessel); this.markDirty(); return true;
  }
}
