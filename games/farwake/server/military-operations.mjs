/** Galaxy-owned deployments with a separate service record for every recruit. */
import { militaryBranch, militaryMission, MILITARY_RECRUITER } from '../dist/military-content.mjs';
import { militaryServiceRank, militaryPermission } from '../dist/military-ranks.mjs';
import { navyDutyRoles } from '../dist/navy-duty.mjs';
import { settleNavyParticipant } from '../dist/npc-contracts.mjs';
import { clone, fail, ok, MAX_ONLINE } from './protocol.mjs';

const phases = new Set(['muster', 'active', 'returned', 'closed', 'cancelled']);
const phaseOf = active => active?.phase === 'paused' ? active.pausedPhase : active?.phase;
const alive = captain => captain?.game.state.person.health > 0 && !captain.game.state.person.down;
const ownActive = (captain, operation) => captain?.game.state.militaryCareer?.active?.shared === true && captain.game.state.militaryCareer.active.operationId === operation.id;
const counter = value => Number.isSafeInteger(value) && value >= 0 && value < 100000000 ? value : 0;
const nextIntro = game => {
  const state = game.state.militaryCareer;
  return militaryBranch(state?.factionId, state?.branchId)?.missions.find(mission => !state.completed.includes(mission.id)) || null;
};
const action = (name, label, check, extra = {}) => ({ action: name, label, available: !!check.ok, reason: check.reason || null, reasonCode: check.code || null, ...extra });

export const MilitaryOperationsAuthority = {
  _initializeMilitaryOperations(saved) {
    this.militaryOperations = { version: 1, serial: counter(saved?.serial), operations: {} };
    for (const raw of Object.values(saved?.operations || {}).slice(-128)) {
      const mission = militaryMission(raw?.missionId);
      if (!mission || raw.realmId !== this.id || !phases.has(raw.phase) || typeof raw.id !== 'string' || !raw.id.startsWith(`military:${mission.factionId}:${mission.branchId}:realm_${String(this.id).replace(/[^a-zA-Z0-9_-]/g, '_')}:`)) continue;
      const serial = Number(raw.id.split(':').at(-1));
      if (!counter(serial) || !this.captains.has(raw.ownerId) || !this.captains.has(raw.leaderId)) continue;
      const members = Object.fromEntries(Object.entries(raw.members || {}).filter(([id]) => this.captains.has(id)).slice(0, MAX_ONLINE).map(([id, member]) => [id, { joinedAt: Math.max(0, Number(member?.joinedAt) || 0), settled: member?.settled === true }]));
      if (!Object.keys(members).length) continue;
      const operation = { ...clone(raw), factionId: mission.factionId, branchId: mission.branchId, members };
      this.militaryOperations.operations[operation.id] = operation;
      this.militaryOperations.serial = Math.max(this.militaryOperations.serial, serial);
      if (operation.contract) {
        const vessel = this.vessels.get(operation.vesselId);
        if (!vessel || vessel.militaryOperationId !== operation.id || operation.contract.id !== operation.id || operation.contract.military?.operationId !== operation.id) {
          operation.contract = null;
          continue;
        }
        // Restore one canonical watch, not one independent copy per login.
        for (const [id, member] of Object.entries(operation.members)) {
          const captain = this.captains.get(id);
          if (!member.settled && ownActive(captain, operation) && !operation.contract.military?.participants?.[id]?.settled) captain.game.state.npcContract = operation.contract;
        }
      }
    }
  },

  _militaryOperation(captain) {
    const active = captain.game.state.militaryCareer?.active;
    const operation = active?.shared && this.militaryOperations?.operations[active.operationId];
    return operation?.members?.[captain.id] ? operation : null;
  },

  _militaryContract(vessel) {
    return this.militaryOperations?.operations[vessel?.militaryOperationId]?.contract || null;
  },

  _militaryAccess(captain, { empty = false } = {}) {
    if (!captain.session) return fail('Reconnect before changing your deployment orders.', 'offline');
    if (!alive(captain)) return fail('Recover before reporting for duty.', 'incapacitated');
    const access = captain.game.militaryRecruiterAccess(MILITARY_RECRUITER.id);
    if (!access.ok) return access;
    if (captain.aboard || captain.game.state.npcContract?.active) return fail('Go ashore and finish the current watch before mustering.', 'crew-duty');
    if (captain.game.state.pendingEncounter) return fail('Finish the current conversation before mustering.', 'encounter');
    if (empty && captain.game.state.militaryCareer?.active) return fail('Debrief or leave your current deployment first.', 'military-orders');
    const career = captain.game.state.militaryCareer;
    return militaryPermission(captain.game, 'join', { factionId: career?.factionId, branchId: career?.branchId });
  },

  _militaryLeadCheck(captain, mission) {
    return militaryPermission(captain.game, 'join', { factionId: mission.factionId, branchId: mission.branchId, minRank: mission.leadRank || 0 });
  },

  _militaryCanJoin(captain, operation) {
    if (operation.phase !== 'muster') return fail('This deployment has already left. Join the next muster at Morrow.', 'military-departed');
    if (operation.members[captain.id]) return fail('You are already on this roster.', 'duplicate');
    if (Object.keys(operation.members).length >= MAX_ONLINE) return fail('This deployment already has ten recruits.', 'military-capacity');
    const permission = militaryPermission(captain.game, 'join', { factionId: operation.factionId, branchId: operation.branchId });
    if (!permission.ok) return permission;
    return this._militaryAccess(captain, { empty: true });
  },

  _militaryCanLaunch(captain, operation) {
    if (operation.phase !== 'muster') return fail('This deployment has already left muster.', 'military-departed');
    if (operation.leaderId !== captain.id) return fail('The ranking operation leader authorizes departure.', 'military-command');
    const lead = this._militaryLeadCheck(captain, militaryMission(operation.missionId));
    if (!lead.ok) return lead;
    for (const id of Object.keys(operation.members)) {
      const member = this.captains.get(id);
      if (!member || !ownActive(member, operation)) return fail('A recruit’s orders changed. Refresh this muster.', 'military-roster');
      const access = this._militaryAccess(member);
      if (!access.ok) return fail(`${member.name}: ${access.reason}`, 'military-muster');
      const permission = militaryPermission(member.game, 'join', { factionId: operation.factionId, branchId: operation.branchId });
      if (!permission.ok) return permission;
    }
    return ok();
  },

  _militaryPublicRecord(captain) {
    const rank = militaryServiceRank(captain.game);
    if (!rank.enlisted) return null;
    const operation = this._militaryOperation(captain);
    return { factionId: rank.factionId, branchId: rank.branchId, rank: rank.rank, rankIndex: rank.rankIndex, operationId: operation?.id || null,
      operationPhase: operation?.phase || null, operationTitle: operation ? militaryMission(operation.missionId)?.title || null : null,
      role: operation ? operation.leaderId === captain.id ? 'Operation leader' : operation.branchId === 'navy' ? 'Gunner / watch' : 'Infantry' : 'Independent service' };
  },

  _militaryOperationView(captain, operation) {
    const mission = militaryMission(operation.missionId), member = !!operation.members[captain.id] && ownActive(captain, operation);
    const destination = mission.deployment || mission;
    const roster = Object.keys(operation.members).map(id => {
      const person = this.captains.get(id), record = this._militaryPublicRecord(person);
      const readiness = operation.phase === 'muster' ? this._militaryAccess(person) : null;
      const aboard = !!operation.vesselId && person.aboard === operation.vesselId, settled = operation.members[id].settled === true;
      const status = settled ? 'debriefed' : !person.session ? 'offline' : operation.phase === 'muster' ? readiness.ok ? 'ready' : 'waiting' : aboard ? 'aboard' : operation.phase === 'returned' ? 'returned' : operation.branchId === 'army' ? 'field' : 'ashore';
      return { captainId: id, name: person.name, rank: record?.rank || 'Recruit', rankIndex: record?.rankIndex || 0, role: operation.leaderId === id ? 'Operation leader' : operation.branchId === 'navy' ? 'Gunner / watch' : 'Infantry', online: !!person.session, settled,
        status, statusReason: readiness?.reason || null, aboard, ready: readiness?.ok === true };
    });
    const actions = [];
    if (member && operation.phase === 'muster') {
      actions.push(action('launchOperation', 'Depart with this roster', this._militaryCanLaunch(captain, operation), { operationId: operation.id }));
      actions.push(action('leaveOperation', 'Leave this muster', { ok: true }, { operationId: operation.id }));
    } else if (member && phaseOf(captain.game.state.militaryCareer?.active)==='failed') {
      const check=captain.game.state.npcContract?.active||captain.aboard?fail('Go ashore before closing your duty record.','crew-duty'):captain.game.militaryRecruiterAccess(MILITARY_RECRUITER.id);
      actions.push(action('leaveOperation','Close this failed deployment',check,{operationId:operation.id}));
    } else if (!member) actions.push(action('joinOperation', 'Join this unit', this._militaryCanJoin(captain, operation), { operationId: operation.id }));
    return { id: operation.id, missionId: mission.id, title: mission.title, phase: operation.phase, branchId: operation.branchId, factionId: operation.factionId,
      leaderId: operation.leaderId, leaderName: this.captains.get(operation.leaderId)?.name || 'Duty officer', systemId: destination.systemId,
      systemName: this.galaxy.find(system => system.id === destination.systemId)?.name || destination.systemId, roster, actions,
      vesselId: operation.vesselId || null, member, role: roster.find(value => value.captainId === captain.id)?.role || null };
  },

  _militaryOperationsView(captain) {
    const career = captain.game.state.militaryCareer, current = this._militaryOperation(captain), operations = [];
    // Public service rosters let friends understand a different branch or an
    // already-departed unit. Join permissions are still checked for this viewer.
    for (const operation of Object.values(this.militaryOperations?.operations || {})) {
      if (operation.id === current?.id || ['closed', 'cancelled'].includes(operation.phase)) continue;
      operations.push(this._militaryOperationView(captain, operation));
      if (operations.length === 32) break;
    }
    const actions = [], mission = nextIntro(captain.game);
    if (mission && !career.active) {
      const access = this._militaryAccess(captain, { empty: true });
      actions.push(action('createOperation', 'Open or join a muster', access, { missionId: mission.id, joinExisting: true,
        detail: 'Join the existing roster for this assignment, or open one at Morrow. The operation leader departs when everyone is ready.' }));
      actions.push(action('createOperation', 'Open a separate muster', access, { missionId: mission.id, joinExisting: false, separate: true,
        detail: 'Make a different unit for this assignment. Friends must join this new roster before you depart.' }));
    }
    return { sharedGalaxy: true, operation: current ? this._militaryOperationView(captain, current) : null, operations, actions };
  },

  _militaryCommand(captain, args) {
    const game = captain.game, career = game.state.militaryCareer;
    if (args.action === 'createOperation') {
      const access = this._militaryAccess(captain, { empty: true }); if (!access.ok) return access;
      const mission = args.missionId ? militaryMission(args.missionId) : nextIntro(game);
      if (!mission) return fail('Choose an available deployment from the recruiter.', 'military-mission');
      // This explicit action makes a simultaneous first-assignment choice safe:
      // the second captain joins the roster the first one just opened. A plain
      // createOperation remains available for deliberately separate deployments.
      if (args.joinExisting === true) {
        const existing = Object.values(this.militaryOperations.operations).find(operation => operation.phase === 'muster' && operation.missionId === mission.id && this._militaryCanJoin(captain, operation).ok);
        if (existing) return this._militaryCommand(captain, { action: 'joinOperation', operationId: existing.id });
      }
      const lead = this._militaryLeadCheck(captain, mission); if (!lead.ok) return lead;
      const branch = militaryBranch(career.factionId, career.branchId);
      if (branch?.missions.some(value => value.id === mission.id) && nextIntro(game)?.id !== mission.id && !career.completed.includes(mission.id)) return fail('Finish your current qualification before issuing those training orders.', 'military-orders');
      if (Object.values(this.militaryOperations.operations).filter(operation => !['closed', 'cancelled'].includes(operation.phase)).length >= 32) return fail('This galaxy already has thirty-two open deployments. Finish an existing assignment first.', 'military-capacity');
      const serial = this.militaryOperations.serial + 1;
      if (serial >= 100000000) return fail('This galaxy’s deployment ledger is full.', 'military-capacity');
      const id = `military:${mission.factionId}:${mission.branchId}:realm_${String(this.id).replace(/[^a-zA-Z0-9_-]/g, '_')}:${serial}`;
      const operation = { id, realmId: this.id, missionId: mission.id, factionId: mission.factionId, branchId: mission.branchId, ownerId: captain.id, leaderId: captain.id,
        phase: 'muster', createdAt: Date.now(), launchedAt: null, members: { [captain.id]: { joinedAt: Date.now(), settled: false } }, vesselId: null, contract: null };
      const result = game.beginMilitaryAssignment(mission, { operationId: id, serial }, { shared: true, leaderId: captain.id, role: 'leader' });
      if (!result.ok) return result;
      this.militaryOperations.serial = serial; this.militaryOperations.operations[id] = operation;
      return ok({ text: 'Muster opened at Morrow. Other enlisted captains in this galaxy can sign on before departure.', operationId: id });
    }
    const operation = this.militaryOperations.operations[args.operationId];
    if (!operation || operation.realmId !== this.id) return fail('That deployment is not in this galaxy.', 'military-operation');
    if (args.action === 'joinOperation') {
      const access = this._militaryCanJoin(captain, operation); if (!access.ok) return access;
      const result = game.beginMilitaryAssignment(militaryMission(operation.missionId), { operationId: operation.id, serial: Number(operation.id.split(':').at(-1)) }, { shared: true, leaderId: operation.leaderId, role: 'member' });
      if (!result.ok) return result;
      operation.members[captain.id] = { joinedAt: Date.now(), settled: false };
      const leader = this.captains.get(operation.leaderId);
      if (militaryServiceRank(game).rankIndex > militaryServiceRank(leader.game).rankIndex) operation.leaderId = captain.id;
      this._militarySyncLeader(operation);
      return ok({ text: 'You are on the same deployment roster. Your own rank, permissions, and service record remain individual.', operationId: operation.id });
    }
    if (!operation.members[captain.id] || !ownActive(captain, operation)) return fail('You are not enrolled in that deployment.', 'military-member');
    if (args.action === 'leaveOperation') {
      if (operation.phase !== 'muster') {
        if(phaseOf(career.active)!=='failed'||game.state.npcContract?.active||captain.aboard)return fail('This operation has departed. Use the carrier airlock or field return transport to leave safely.', 'military-departed');
        const access=game.militaryRecruiterAccess(MILITARY_RECRUITER.id);if(!access.ok)return access;
        operation.members[captain.id].settled=true;career.active=null;career.paused=false;
        game._log('Deployment closed','The recruiter closes your unsuccessful deployment without service credit. Other members keep their own orders.','profession');
        this._refreshMilitaryOperations();
        return ok({text:'Your failed deployment is closed without pay or promotion. You can sign on for fresh orders.'});
      }
      delete operation.members[captain.id]; game.state.militaryCareer.active = null;
      const members = Object.keys(operation.members).map(id => this.captains.get(id)).sort((a, b) => militaryServiceRank(b.game).rankIndex - militaryServiceRank(a.game).rankIndex);
      if (!members.length) operation.phase = 'cancelled';
      else { if (operation.leaderId === captain.id) operation.leaderId = members[0].id; if (operation.ownerId === captain.id) operation.ownerId = operation.leaderId; this._militarySyncLeader(operation); }
      return ok({ text: 'You leave the muster. No assignment, pay, or promotion was awarded.' });
    }
    if (args.action === 'launchOperation') {
      const access = this._militaryCanLaunch(captain, operation); if (!access.ok) return access;
      return this._launchMilitaryOperation(captain, operation);
    }
    return fail('Those operation orders are unavailable.', 'military-action');
  },

  _militarySyncLeader(operation) {
    for (const id of Object.keys(operation.members)) {
      const captain = this.captains.get(id);
      if (ownActive(captain, operation)) { captain.game.state.militaryCareer.active.leaderId = operation.leaderId; captain.game.state.militaryCareer.active.role = id === operation.leaderId ? 'leader' : 'member'; }
    }
  },

  _launchMilitaryOperation(captain, operation) {
    const mission = militaryMission(operation.missionId), members = Object.keys(operation.members).map(id => this.captains.get(id));
    if (mission.branchId === 'navy') {
      const participants = Object.fromEntries(members.map(member => [member.id, { role: member.id === operation.leaderId ? 'leader' : 'gunner', joinedAt: 0 }]));
      const result = this._startNavySortie(captain, mission, { operationId: operation.id, sharedOperation: true, participants, leaderId: operation.leaderId });
      if (!result.ok) return result;
      operation.ownerId = captain.id; operation.vesselId = captain.aboard; operation.contract = captain.game.state.npcContract;
      const vessel = this.vessels.get(operation.vesselId); vessel.militaryOperationId = operation.id;
      for (const member of members) {
        const owned = this.vessels.get(member.ownedVesselId);
        if (owned && owned.systemId === 'hearth' && owned.dockedAt === 'morrow') member.game.state.livelihoods.parkedShip = { ...clone(owned.ship), systemId: owned.systemId, bodyId: owned.dockedAt, vesselId: owned.id };
        member.game.state.npcContract = operation.contract;
        vessel.grants[member.id] = { allowed: true, roles: navyDutyRoles(member.game,operation.contract), allowBunk: false };
        if (member.aboard !== vessel.id) this._cabin(member, vessel);
        member.crewRole = 'weapons';
      }
    } else {
      const destination = mission.deployment || mission;
      const body = this.galaxy.find(system => system.id === destination.systemId)?.bodies.find(body => body.id === destination.bodyId);
      if (!body) return fail('The deployment’s landing zone is unavailable.', 'military-destination');
      for (const member of members) {
        const owned = this.vessels.get(member.ownedVesselId);
        if (owned && owned.systemId === 'hearth' && owned.dockedAt === 'morrow') member.game.state.livelihoods.parkedShip = { ...clone(owned.ship), systemId: owned.systemId, bodyId: owned.dockedAt, vesselId: owned.id };
        if (destination.systemId !== member.game.state.systemId || destination.bodyId !== member.game.state.locationId) this._landCharacter(member, destination.systemId, destination.bodyId);
      }
    }
    operation.phase = 'active'; operation.launchedAt = Date.now();
    for (const member of members) member.events.push({ type: 'military-progress', text: `${mission.title}: the roster is deployed. Follow your own assigned duty; service credit is recorded separately.` });
    return ok({ text: `Deployment underway with ${members.length} ${members.length === 1 ? 'recruit' : 'recruits'}.`, operationId: operation.id, vesselId: operation.vesselId });
  },

  _returnMilitaryTransport(captain) {
    this._landCharacter(captain, 'hearth', 'morrow'); captain.surfaceCache = null;
    return ok({ text: 'The service shuttle brings you back to Morrow. Report to Sergeant Venn for your own debrief.' });
  },

  _transferNavyVessel(vessel, actor, systemId, entryPoint) {
    if (!this.galaxy.some(system => system.id === systemId) || vessel.destroyed || vessel.ship.hull <= 0) return fail('The carrier cannot complete its jump.', 'military-transit');
    if (!entryPoint || !['x', 'y', 'angle'].every(key => Number.isFinite(entryPoint[key]))) return fail('The carrier has no safe arrival point.', 'military-transit');
    vessel.systemId = systemId; vessel.dockedAt = null;
    Object.assign(vessel.ship, entryPoint, { vx: 0, vy: 0, angularVelocity: 0 });
    const room = this._room(systemId);
    actor.state.systemId = systemId; actor.bindSharedWorld(room.runtime, room.record, vessel.ownerId);
    for (const member of this.captains.values()) if (member.aboard === vessel.id) {
      member.game.state.systemId = systemId; member.surfaceCache = null;
      if (member.game.state.interior) member.game.state.interior.location = { ...member.game.state.interior.location, systemId, dockedAt: null, dockedName: null };
      this._bindCaptain(member);
      member.events.push({ type: 'crew-duty', text: `Commander: jump complete. ${room.runtime.name || this.galaxy.find(system => system.id === systemId).name}. Keep your watch.` });
    }
    return ok();
  },

  _settleMilitaryParticipant(captain, vessel, options = {}) {
    const operation = this.militaryOperations?.operations[vessel?.militaryOperationId], contract = operation?.contract;
    if (!contract || !operation.members[captain.id]) return fail('This captain has no service watch on that carrier.', 'military-member');
    const actor = this._actor(vessel), result = settleNavyParticipant(actor, contract, captain.game, options);
    if (result.ok) {
      operation.members[captain.id].settled = true;
      captain.game.state.npcContract = null; captain.game.state.stationView = null;
      vessel.grants[captain.id] = { allowed: false, roles: [], allowBunk: false };
      this._syncActor(vessel);
      // The canonical watch remains available to anyone still aboard.
      if (contract.active === false && Object.values(operation.members).every(member => member.settled)) operation.phase = 'returned';
    }
    return result;
  },

  _refreshMilitaryOperations() {
    for (const operation of Object.values(this.militaryOperations.operations)) {
      if (['closed', 'cancelled', 'muster'].includes(operation.phase)) continue;
      if (operation.contract?.phase === 'docked') operation.phase = 'returned';
      for (const [id, member] of Object.entries(operation.members)) if (!ownActive(this.captains.get(id), operation)) member.settled = true;
      if (Object.values(operation.members).every(member => member.settled) && !Object.keys(operation.members).some(id => ownActive(this.captains.get(id), operation))) operation.phase = 'closed';
    }
    const retained = Object.values(this.militaryOperations.operations), old = retained.filter(operation => ['closed', 'cancelled'].includes(operation.phase)).sort((a, b) => a.createdAt - b.createdAt);
    while (Object.keys(this.militaryOperations.operations).length > 96 && old.length) delete this.militaryOperations.operations[old.shift().id];
  }
};
