/** Factual casualty receipts and the people who survived them. No rewards are
 * generated here: this is durable ownership, whereabouts, and acknowledgment. */
import { captureCasualCrew, casualCrewStatus } from './casual-crew.mjs';
import { getShipClass, cabinLayout } from './fleet.mjs';
import { militaryServiceRank } from './military-ranks.mjs';

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const list = value => Array.isArray(value) ? value : [];
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const alive = person => person && !person.dead && person.health > 0 && !['dead', 'released'].includes(person.status);
const text = (value, limit = 240) => typeof value === 'string' ? value.slice(0, limit) : '';
const samePlace = (one, two) => !!one && !!two && one.systemId === two.systemId && one.bodyId && one.bodyId === two.bodyId;
const now = game => Math.max(0, finite(game.state.stats?.time));
const currentPort = game => game.state.mode === 'person' && !game.state.interior && game.state.locationId ? place(game, game.state.systemId, game.state.locationId) : null;
function place(game, systemId, bodyId, name = '') {
  const system = game.galaxy?.find(value => value.id === systemId), body = system?.bodies.find(value => value.id === bodyId);
  return { systemId: systemId || game.state.systemId, bodyId: bodyId || null, name: name || body?.name || system?.name || 'Unknown location' };
}
function shipPlace(game, ship, personal = false) {
  const contract = game.state.npcContract, parked = game.state.livelihoods?.parkedShip;
  const authoritative = personal && game._voyagePersonalContext?.();
  if (authoritative?.ship?.id === ship.id) return { ...place(game, authoritative.systemId, authoritative.bodyId), vesselId: ship.id, kind: authoritative.aboard ? 'ship' : 'berth' };
  if (personal && contract?.personal?.ship?.id === ship.id) return { ...place(game, contract.origin.systemId, contract.origin.bodyId, contract.origin.name), vesselId: ship.id, kind: 'berth' };
  if (personal && parked?.vesselId === ship.id) return { ...place(game, parked.systemId, parked.bodyId), vesselId: ship.id, kind: 'berth' };
  return { ...place(game, game.state.systemId, ship.dockedAt || null), vesselId: ship.id, kind: 'ship', name: `${ship.name || 'Ship'} · ${game.currentSystem?.name || game.state.systemId}` };
}
function shipView(game, ship, personal, status = null) {
  return { id: ship.id, name: ship.name || 'Ship', classId: ship.classId, personal: !!personal,
    status: status || (ship.destroyed || ship.hull <= 0 ? 'destroyed' : 'intact'), location: shipPlace(game, ship, personal) };
}
function knownCrew(ship, crew) {
  const members = new Map(list(ship?.casualCrew?.records).map(person => [person.id, person]));
  for (const person of list(crew)) if (person?.id) members.set(person.id, person);
  return [...members.values()].filter(person => person.status !== 'released');
}
function parkedManifests(game) {
  if (game._sharedWorld || game.state.multiplayer?.serverAuthoritative) return [];
  const ships=new Map();
  for(const [systemId,record] of Object.entries(game.state.worlds||{}))for(const ship of list(record.parkedShips))if(ship.ownerId===game.playerId)ships.set(ship.id,{ship,systemId});
  for(const ship of list(game.system?.parkedShips))if(ship.ownerId===game.playerId)ships.set(ship.id,{ship,systemId:game.state.systemId});
  return [...ships.values()].filter(({ship})=>ship.id!==game.state.ship.id&&ship.id!==game.state.npcContract?.personal?.ship?.id).map(({ship,systemId})=>({ship,crew:knownCrew(ship,ship.storedCrew||[]),location:{...place(game,systemId,ship.dockedAt),vesselId:ship.id,kind:'ship'}}));
}
function personView(person, location, personal, status = 'aboard', participated = false) {
  return { id: person.id, name: person.name || 'Unnamed crewmate', species: person.species || 'human', role: person.recoveredRole || person.role || 'crew',
    health: person.dead ? 0 : Math.max(0, finite(person.health)), maxHealth: Math.max(1, finite(person.maxHealth, 100)), status: alive(person) ? status : 'dead',
    location: clone(person.recoveryLocation || location), personal: !!personal, participated: !!participated, duty: person.status === 'reserve' ? 'reserve' : 'active' };
}
function serviceView(game) {
  const rank = militaryServiceRank(game); if (!rank.enlisted) return null;
  const contract = game.state.npcContract, active = game.state.militaryCareer?.active;
  return { factionId: rank.factionId, rank: rank.rank || null, branchId: game.state.militaryCareer?.branchId || null,
    operationId: contract?.military?.operationId || null, title: contract?.navy?.operation?.title || contract?.title || null,
    outcome: contract?.military ? contract.outcome || (contract.aborted ? 'interrupted' : 'in-progress') : null,
    recordedOperations: list(game.state.professions?.history).filter(receipt => receipt.professionId === 'military').slice(0, 8).map(receipt => ({ id: receipt.id, title: receipt.title, outcome: receipt.outcome, at: receipt.at })),
    currentReceipt: active?.receipt ? clone(active.receipt) : null };
}
function memory(game) {
  const state = game.state;
  if (!state.voyageMemory || state.voyageMemory.version !== 1) state.voyageMemory = { version: 1, serial: 0, incidents: [], pendingId: null, recoveredCrews: [] };
  return state.voyageMemory;
}
const latest = game => list(game.state.voyageMemory?.incidents).at(-1) || null;
const incidentById = (game, id) => list(game.state.voyageMemory?.incidents).find(incident => incident.id === id) || null;
function casualtyCause(game, kind, boarding, supplied) {
  if (supplied) return text(supplied, 700);
  if (kind === 'ship-destroyed') return 'The vessel was destroyed; the recovery record accounts for its surviving crew.';
  const injury = game.state.person.lastInjury;
  if (boarding) {
    const hit = injury?.boardingId === boarding.id && injury.actorName ? `${injury.actorName} incapacitated you during the boarding action. ` : 'You required evacuation during the boarding action. ';
    return hit + (boarding.phase === 'won' ? 'Your boarding party secured the target before medical evacuation.' : boarding.phase === 'lost' ? 'The boarding action ended in defeat.' : 'The recorded boarding outcome is not yet settled.');
  }
  return kind === 'ship-destroyed' ? 'The vessel was destroyed; the recovery record accounts for its surviving crew.' : kind === 'deck-defeat' ? 'The vessel was overrun and survivors were evacuated.' : 'You were incapacitated and received medical evacuation. The exact attacking source was not recorded.';
}

export const VoyageMemoryRules = {
  initializeVoyageMemory() {
    const raw = this.state.voyageMemory;
    if (raw?.version === 1) {
      this.state.voyageMemory = { version: 1, serial: Math.max(0, Math.floor(finite(raw.serial))), incidents: list(raw.incidents).filter(row => row?.id).slice(-12).map(row => ({ ...clone(row), source:row.source||{systemId:null,bodyId:null,name:'Unrecorded location'}, crew:list(row.crew).filter(person=>person?.id).map(clone), arrival:{arrived:false,acknowledged:false,...row.arrival}, losses:{credits:0,...row.losses} })),
        pendingId: typeof raw.pendingId === 'string' ? raw.pendingId : null, recoveredCrews: list(raw.recoveredCrews).filter(group => group?.id && Array.isArray(group.crew) && group.status !== 'rejoined').map(clone) };
    } else memory(this);
    if (!this.state.voyageMemory.incidents.length) {
      const receipt = this.state.medicalRecovery || this.state.shipRecovery;
      if (receipt?.destination) {
        const loss = this.state.shipRecovery;
        const report = this.beginRecoveryIncident({ key: `legacy:${receipt.id || `${loss?.vesselId || 'casualty'}:${receipt.at}`}`, sourceKind: receipt.sourceKind || 'unknown-casualty', legacy: true, crew: [],
          source: { ...place(this, loss?.sourceSystemId || this.state.militaryRecovery?.sourceSystemId || this.state.systemId, null), vesselId: loss?.vesselId || null, vesselName: loss?.vesselName || null },
          cause: 'A saved recovery receipt confirms this evacuation. It did not retain the attacking source or a complete crew manifest.',
          losses: { credits: finite(receipt.cost), shipLost: list(this.state.fleet?.history).some(row=>row.type==='loss'&&row.vesselId===loss?.vesselId) ? true : null },
          unknowns: ['The original crew manifest and unrecorded casualty outcomes cannot be reconstructed from this save.'] });
        report.at = finite(receipt.at); this.completeRecoveryIncident({ incidentId: report.id, destination: receipt.destination, medicalReceipt: receipt, silent: true });
      }
    }
    this.syncRecoveryReturn({ silent: true });
    return this.state.voyageMemory;
  },
  beginRecoveryIncident(context = {}) {
    const data = memory(this), pending = incidentById(this, data.pendingId);
    const existing = context.incidentId && incidentById(this, context.incidentId) || context.key && data.incidents.find(row => row.key === context.key) || pending;
    if (existing) return existing;
    const ship = context.ship || this.state.ship, crew = context.crew === undefined ? this.state.crew : context.crew;
    const personal = context.personal ?? (!ship.npcEmployer && ship.id === this.personalShip?.id);
    const boarding = context.boarding || this.state.boarding, participants = new Set(list(boarding?.allies).map(actor => actor.crewId).filter(Boolean));
    const source = { ...place(this, context.system?.id || this.state.systemId, this.state.exploration?.bodyId || (this.state.mode === 'person' && !this.state.interior ? this.state.locationId : null)), vesselId: ship.id, vesselName: ship.name || 'Ship', ...(context.source || {}) };
    const id = `${this.playerId}:incident:${++data.serial}`, sourceKind = context.sourceKind || 'medical-casualty';
    const rows = (context.legacy ? list(crew) : knownCrew(ship, crew)).map(person => personView(person, shipPlace(this, ship, personal), personal || person.recoveredPassenger, 'aboard', participants.has(person.id)));
    const parked = this._voyagePersonalContext?.() || this.state.npcContract?.personal;
    if (parked && parked.ship.id !== ship.id) rows.push(...knownCrew(parked.ship, parked.crew).map(person => personView(person, shipPlace(this, parked.ship, true), true, 'waiting', false)));
    const seen=new Set(rows.map(row=>row.id));for(const manifest of parkedManifests(this))for(const person of manifest.crew)if(!seen.has(person.id)){rows.push(personView(person,manifest.location,true,'waiting'));seen.add(person.id);}
    const report = { id, key: context.key || id, at: now(this), sourceKind, title: boarding ? 'Boarding casualty report' : sourceKind === 'ship-destroyed' ? 'Vessel loss and rescue report' : 'Medical evacuation report',
      cause: casualtyCause(this, sourceKind, boarding, context.cause), source, ship: context.legacy ? { id: source.vesselId || null, name: source.vesselName || 'Unrecorded vessel', status: 'unknown', location: clone(source) } : shipView(this, ship, personal, sourceKind === 'deck-defeat' && personal && boarding?.kind !== 'assault' ? 'occupied' : null),
      crew: rows.slice(0, 64), reserveCount: casualCrewStatus({ ship, crew: list(crew) })?.reserveCount || 0,
      boarding: boarding ? { id: boarding.id, kind: boarding.kind, phase: boarding.phase, targetId: boarding.targetId || boarding.vesselId, targetName: this.system.enemies.find(enemy => enemy.id === boarding.targetId)?.name || null,
        allies: [...participants], kills: boarding.kills ? clone(boarding.kills) : null } : null,
      recoveryDestination: clone(context.destination || null), losses: { shipLost: !!personal && (sourceKind === 'ship-destroyed' || sourceKind === 'deck-defeat' && boarding?.kind !== 'assault'), cargo: null, upgrades: null, credits: 0, ...(context.losses || {}) },
      service: context.service === undefined ? serviceView(this) : clone(context.service), home: clone(this.state.militaryRecovery?.home || null),
      arrival: { arrived: false, at: null, acknowledged: false, acknowledgedAt: null }, legacy: context.legacy === true, unknowns: list(context.unknowns).map(value => text(value)) };
    data.incidents.push(report); data.incidents = data.incidents.slice(-12); data.pendingId = report.id;
    return report;
  },
  completeRecoveryIncident({ incidentId, destination, cost = 0, medicalReceipt = null, captainRecovered = true, serviceEvacuated = false, serviceDestination = null, losses = null, silent = false } = {}) {
    const data = memory(this), report = incidentById(this, incidentId || data.pendingId) || this.beginRecoveryIncident({ sourceKind: medicalReceipt?.sourceKind || 'medical-casualty', destination });
    if (destination) report.recoveryDestination = clone(destination);
    report.losses = { ...report.losses, ...(losses || {}), credits: Math.max(finite(report.losses?.credits), finite(cost)) };
    report.home = clone(this.state.militaryRecovery?.home || report.home || destination || report.recoveryDestination);
    report.captainRecovered = captainRecovered;
    if (medicalReceipt) report.medicalReceiptId = medicalReceipt.id;
    report.completedAt ??= now(this);
    if (report.ship && !report.ship.personal && (serviceDestination || destination) && (serviceEvacuated || report.ship.status === 'destroyed')) for (const person of report.crew) if (!person.personal && person.status !== 'dead') { person.status = 'recovered'; person.location = clone(serviceDestination || destination); }
    if (data.pendingId === report.id) data.pendingId = null;
    if (!silent && !report.notified) { report.notified = true; this._event('recovery-report', { incidentId: report.id, text: report.cause }); }
    this.syncRecoveryReturn({ silent });
    return report;
  },
  evacuatePersonalCrew(destination, { incidentId, ship = this.state.ship, crew = this.state.crew, personal = ship.id === this.personalShip?.id } = {}) {
    if (!personal || !destination) return null;
    const data = memory(this), report = incidentById(this, incidentId || data.pendingId) || this.beginRecoveryIncident({ ship, crew, personal: true, destination });
    const id = `recovered:${report.id}:${ship.id}`, previous = data.recoveredCrews.find(group => group.id === id); if (previous) return previous;
    for(const member of [...list(crew),...list(ship.casualCrew?.records)])if(member.dead){member.health=0;member.status='dead';}
    captureCasualCrew({ ship, crew });
    const survivors = list(crew).filter(alive).map(person => ({ ...clone(person), recoveryLocation: clone(destination) }));
    const roster = clone(ship.casualCrew || null), ids = new Set(survivors.map(person => person.id));
    this.state.memorial ||= [];
    for (const member of knownCrew(ship, crew).filter(person => !alive(person))) if (!this.state.memorial.some(row => row.crewId === member.id)) this.state.memorial.push({ id:`memorial:${member.id}`,crewId:member.id,name:member.name,species:member.species,role:member.role,cause:'Confirmed casualty recorded before evacuation',systemId:this.state.systemId,time:now(this),shipClass:ship.classId });
    const group = { id, incidentId: report.id, label: `${ship.name || 'Your ship'} · recovered crew`, ship: shipView(this, ship, true), location: clone(destination), crew: survivors, casualCrew: roster, status: 'recovered' };
    if (survivors.length || roster) data.recoveredCrews.push(group);
    delete ship.casualCrew;
    if (Array.isArray(crew)) crew.splice(0, crew.length, ...crew.filter(person => !ids.has(person.id)));
    for (const person of report.crew) if (ids.has(person.id)) { person.status = 'recovered'; person.location = clone(destination); }
    report.ship.location = shipPlace(this, ship, true);
    return group;
  },
  recoveryReports() { return list(this.state.voyageMemory?.incidents).slice().reverse().map(report => this.recoveryReport(report.id)); },
  recoveryReport(id = null) {
    const source = id ? incidentById(this, id) : latest(this); if (!source) return null;
    const report = clone(source), evacuation = source === latest(this) ? this.militaryRecoveryStatus?.() || null : null;
    report.evacuation = evacuation ? { ...evacuation, available: evacuation.canBook, free: evacuation.fare === 0, destination: clone(evacuation.home), action: 'startMilitaryPassage', args: {} } : null;
    const at = currentPort(this), target = report.home || report.recoveryDestination;
    report.canAcknowledge = !report.arrival.acknowledged && report.arrival.arrived && samePlace(at, target) && this.state.person.health > 0 && !this.state.person.down && !this.medicalRecoveryActive?.();
    report.acknowledgmentReason = report.arrival.acknowledged ? 'This return has already been acknowledged.' : !samePlace(at, target) ? `Return to ${target?.name || 'the recovery post'} for a debrief.` : this.medicalRecoveryActive?.() ? 'Rest until medical recovery is complete.' : '';
    return report;
  },
  crewWhereabouts() {
    if (this.state.multiplayer?.serverAuthoritative && !this._voyagePersonalContext && this.state.voyageView?.crewWhereabouts) return clone(this.state.voyageView.crewWhereabouts);
    const groups = [], s = this.state, contract = s.npcContract;
    const authoritative = this._voyagePersonalContext?.();
    const personal = authoritative || contract?.personal || (!s.ship.npcEmployer && !s.ship.unowned ? { ship: s.ship, crew: s.crew } : null);
    if (personal) {
      const location = shipPlace(this, personal.ship, true), aboard = authoritative ? authoritative.aboard : personal.ship.id === s.ship.id && !contract?.active && !s.livelihoods?.parkedShip;
      const members = knownCrew(personal.ship, personal.crew).map(person => personView(person, location, true, aboard ? 'aboard' : 'waiting'));
      if (members.length || personal.ship.casualCrew) groups.push({ id: `personal:${personal.ship.id}`, kind: 'personal', label: `${personal.ship.name || 'Your ship'} · personal crew`, location, ship: shipView(this, personal.ship, true), crew: members, reserveCount: casualCrewStatus(personal)?.reserveCount || 0 });
    }
    for(const manifest of parkedManifests(this)){
      const active=manifest.crew.filter(person=>alive(person)&&person.status!=='reserve'),members=manifest.crew.map(person=>personView(person,manifest.location,true,'waiting'));
      if(members.length||manifest.ship.casualCrew)groups.push({id:`parked:${manifest.ship.id}`,kind:'personal',label:`${manifest.ship.name||'Parked ship'} · waiting crew`,location:clone(manifest.location),ship:{...shipView(this,manifest.ship,true),location:clone(manifest.location)},crew:members,reserveCount:casualCrewStatus({ship:manifest.ship,crew:active})?.reserveCount||0});
    }
    const occupied=this._voyageOccupiedContext?.(),service=occupied&&!occupied.personal?occupied:s.ship.npcEmployer||contract?.active&&contract.vesselId===s.ship.id?{ship:s.ship,crew:s.crew}:null;
    if (service) {
      const location = occupied===service?{...place(this,service.systemId,service.bodyId),kind:'ship',vesselId:service.ship.id}:shipPlace(this, service.ship), members = list(service.crew).filter(person => !person.recoveredPassenger).map(person => personView(person, location, false));
      groups.push({ id: `service:${service.ship.id}`, kind: 'service', label: `${service.ship.name || 'Service ship'} · ship’s company`, location, ship: {...shipView(this, service.ship, false),location}, crew: members, reserveCount: 0 });
    }
    for (const group of list(s.voyageMemory?.recoveredCrews)) if (group.status !== 'rejoined') {
      const crew = group.crew.map(person => personView(person, group.location, true, person.recoveryLocation?.kind === 'ship' ? 'aboard' : 'recovered'));
      const roster = group.casualCrew, lost = list(roster?.records).filter(person => !alive(person)).length;
      const rejoin = this.recoveredCrewRejoinInfo(group.id);
      groups.push({ id: group.id, kind: 'recovered', label: group.label, location: clone(group.location), ship: clone(group.ship), crew,
        reserveCount: Math.max(0, (roster?.requestedCount || 0) - lost - group.crew.filter(alive).length), canRejoin: rejoin.ok, reason: rejoin.reason || '' });
    }
    const members = groups.flatMap(group => group.crew), seen = new Set(members.map(person => person.id));
    const memorial = list(s.memorial).filter(person => !seen.has(person.crewId || person.id)).map(person => ({ id: person.crewId || person.id, name: person.name, species: person.species || 'human', role: person.role, health: 0, maxHealth: 100, status: 'dead', personal: true, location: place(this, person.systemId, null), cause: person.cause }));
    if (memorial.length) groups.push({ id: 'memorial', kind: 'memorial', label: 'Crew memorial', location: null, crew: memorial, reserveCount: 0 });
    return { groups, totalKnown: new Set([...members, ...memorial].map(person => person.id)).size, deadCount: [...members, ...memorial].filter(person => person.status === 'dead').length, unknownCount: members.filter(person => person.status === 'unknown').length };
  },
  recoveredCrewAt(bodyId = this.state.locationId, systemId = this.state.systemId) {
    const at = { systemId, bodyId };
    return list(this.state.voyageMemory?.recoveredCrews).filter(group => group.status !== 'rejoined').flatMap(group => group.crew.filter(person => alive(person) && samePlace(person.recoveryLocation || group.location, at) && person.recoveryLocation?.kind !== 'ship')
      .map(person => ({ ...clone(person), status: person.health < person.maxHealth ? 'injured' : 'recovered', recoveryGroupId: group.id, incidentId: group.incidentId })));
  },
  /** Actual survivors at the pickup; an arbitrary reserve count is never a passenger list. */
  recoveredPassageParty(origin = currentPort(this)) {
    if (!origin) return [];
    return this.recoveredCrewAt(origin.bodyId, origin.systemId);
  },
  boardRecoveredPassengers(ship, origin, limit = Math.max(0, getShipClass(ship.classId).berths - 2)) {
    const people = this.recoveredPassageParty(origin).slice(0, Math.max(0, limit)), layout = cabinLayout(ship.classId);
    const occupied = [layout.spawn, layout.stations.helm], passengers = [];
    for (const person of people) {
      const group = memory(this).recoveredCrews.find(row => row.id === person.recoveryGroupId), member = group?.crew.find(row => row.id === person.id);
      if (!member || !alive(member)) continue;
      const point = layout.crewSpawns.find(point => occupied.every(other => Math.hypot(point.x-other.x,point.y-other.y)>=20)) || layout.crewSpawns[passengers.length];
      if (!point) break;
      occupied.push(point);
      member.recoveryLocation = { systemId:origin.systemId,bodyId:null,kind:'ship',vesselId:ship.id,name:ship.name };
      const passenger = { ...clone(member), ...point, role:'passenger',recoveredRole:member.role,recoveredPassenger:true,recoveryGroupId:group.id,recoveryCrewId:member.id,serviceCrew:false,dutyLabel:'Recovered passenger',greeting:'We were evacuated together. I am travelling home as a passenger; my injuries and place in your crew have been retained.' };
      delete passenger.casualCrew;delete passenger.casualCrewRosterId;delete passenger.casualCrewIndex;delete passenger.recoveryLocation;
      passengers.push(passenger);
      const report = incidentById(this, group.incidentId), row = report?.crew.find(row => row.id === member.id);
      if (row) { row.location=clone(member.recoveryLocation);row.status='aboard'; }
      if (group.crew.filter(alive).every(member=>member.recoveryLocation?.vesselId===ship.id)) group.location=clone(member.recoveryLocation);
    }
    return passengers;
  },
  /** Settle the same people after real disembarkation or a subsequent rescue. */
  disembarkRecoveredPassengers(destination, { ship = this.state.ship, crew = this.state.crew, incidentId = null } = {}) {
    if (!destination || !ship?.id) return 0;
    let moved=0;const movedIds=new Set();
    for (const group of list(this.state.voyageMemory?.recoveredCrews)) {
      for (const member of group.crew) {
        if (member.recoveryLocation?.kind!=='ship'||member.recoveryLocation.vesselId!==ship.id) continue;
        const actor=list(crew).find(person=>person.recoveredPassenger&&person.recoveryCrewId===member.id&&person.recoveryGroupId===group.id);
        if (actor) { member.health=Math.max(0,finite(actor.health));member.dead=!!actor.dead;member.status=alive(actor)?member.health<member.maxHealth?'injured':'active':'dead'; }
        member.recoveryLocation=clone(destination);moved++;movedIds.add(member.id);
        const record=group.casualCrew?.records?.find(person=>person.id===member.id);if(record)Object.assign(record,{health:member.health,status:member.status,dead:!!member.dead});
        if (!alive(member)) { this.state.memorial ||= [];if(!this.state.memorial.some(row=>row.crewId===member.id))this.state.memorial.push({id:`memorial:${member.id}`,crewId:member.id,name:member.name,species:member.species,role:member.role,cause:'Confirmed casualty aboard the recovery transport',systemId:this.state.systemId,time:now(this),shipClass:ship.classId}); }
        for(const report of list(this.state.voyageMemory?.incidents))for(const row of report.crew||[])if(row.id===member.id){row.health=member.health;row.status=alive(member)?'recovered':'dead';row.location=clone(destination);}
      }
      if(group.crew.length&&group.crew.every(member=>samePlace(member.recoveryLocation||group.location,destination)))group.location=clone(destination);
    }
    if(Array.isArray(crew))crew.splice(0,crew.length,...crew.filter(person=>!person.recoveredPassenger||!movedIds.has(person.recoveryCrewId)));
    return moved;
  },
  recoveredCrewRejoinInfo(groupId) {
    const group = list(this.state.voyageMemory?.recoveredCrews).find(group => group.id === groupId && group.status !== 'rejoined');
    if (!group) return this._fail('That recovered crew is no longer waiting.','crew');
    if(this.state.person.health<=0||this.state.person.down||this.medicalRecoveryActive?.())return this._fail('Finish medical recovery before bringing the crew back aboard.','recovery');
    const survivors=group.crew.filter(alive);
    if (!this.atInhabitedPort || !survivors.every(person => samePlace(person.recoveryLocation || group.location, currentPort(this))) || !survivors.length&&!samePlace(group.location,currentPort(this))) return this._fail('Meet the complete recovered crew at their actual port before bringing them aboard.','location');
    const access = this.ownShipAccess({ atPort: true }); if (!access.ok) return access;
    if (this.state.boarding?.phase === 'active' || this.state.pendingEncounter || this._hitTimer > 0) return this._fail('Resolve the current danger or conversation before reuniting the crew.','busy');
    if (group.casualCrew && this.state.ship.casualCrew && group.casualCrew.id !== this.state.ship.casualCrew.id) return this._fail('This ship already carries a different departure roster.','crew');
    const humans = Math.max(1, this.state.ship.humanOccupants || 1), used = this.livingCrew.length + this.narrativeBerths() + this.professionBerths() + this.rescuedBerths();
    if (humans + used + group.crew.filter(alive).length > getShipClass(this.state.ship.classId).berths) return this._fail('This hull needs a real berth for every returning survivor. Bring a larger ship or free berths.','capacity');
    return this._ok({ groupId });
  },
  rejoinRecoveredCrew(groupId) {
    const access = this.recoveredCrewRejoinInfo(groupId); if (!access.ok) return access;
    const group = memory(this).recoveredCrews.find(group => group.id === groupId), ids = new Set(this.state.crew.map(person => person.id));
    if (group.casualCrew) this.state.ship.casualCrew = clone(group.casualCrew);
    for (const member of group.crew.filter(alive)) if (!ids.has(member.id)) { const person = clone(member); delete person.recoveryLocation; this.state.crew.push(person); }
    this._updateStats(false);
    const report = incidentById(this, group.incidentId), location = shipPlace(this, this.state.ship, true);
    for (const person of report?.crew || []) if (group.crew.some(member => member.id === person.id) && person.status !== 'dead') { person.status = 'aboard'; person.location = clone(location); }
    memory(this).recoveredCrews=memory(this).recoveredCrews.filter(row=>row.id!==group.id);
    this._event('crew-reunited', { groupId, text: 'Your recovered crew is aboard again. Their names, wounds, and service records are preserved.' });
    return this._ok({ text: 'Your recovered crew is aboard again.', groupId });
  },
  syncRecoveryReturn({ silent = false } = {}) {
    const at = currentPort(this); if (!at || this.state.npcContract?.active || this.state.person.health <= 0 || this.state.person.down) return false;
    let changed = false;
    for (const report of list(this.state.voyageMemory?.incidents)) {
      if (report.completedAt === undefined || report.arrival.arrived || !samePlace(at, report.home || report.recoveryDestination)) continue;
      report.arrival.arrived = true; report.arrival.at = now(this); changed = true;
      if (!silent) { const message = `Your safe return to ${at.name} is recorded. Review the recovery report and account for your crew before closing the debrief.`; this._log('Returned after evacuation', message, 'recovery'); this._event('recovery-returned', { incidentId: report.id, text: message }); }
    }
    return changed;
  },
  acknowledgeRecoveryReport(id) {
    this.syncRecoveryReturn();
    const view = this.recoveryReport(id); if (!view) return this._fail('That recovery report does not exist.','report');
    if (!view.canAcknowledge) return this._fail(view.acknowledgmentReason || 'Return safely and finish medical recovery before debriefing.','recovery');
    id=view.id;const report = incidentById(this, id); report.arrival.acknowledged = true; report.arrival.acknowledgedAt = now(this);
    const message = `Your return from ${report.source.name} has been acknowledged. The recovery record retains the named crew, confirmed losses, and medical destination. No additional service pay or promotion credit is awarded.`;
    this._log('Recovery debrief acknowledged', message, 'recovery'); this._event('recovery-acknowledged', { incidentId: id, text: message });
    return this._ok({ incidentId: id, text: message });
  }
};
