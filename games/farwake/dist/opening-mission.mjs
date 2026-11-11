/** A short, optional first job. Progress belongs to the captain, never a room. */
import { generateSurface } from './surface.mjs';
import { liveInteractionSurface, interactionInRange } from './live-surface.mjs';
import { getHullSystems } from './hull-systems.mjs';

export const OPENING_MISSION_ID = 'small-favor';
export const OPENING_JOB_ID = 'opening:small-favor';
export const OPENING_REWARD = 35;
export const OPENING_ORE = 2;
export const OPENING_BELT_DISTANCE = 600;
const SYSTEM = 'hearth';
const RANGE = 46;
const metadata = new WeakMap();
const finite = (value, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const count = value => Math.max(0, Math.floor(finite(value)));
const clock = game => Math.max(0, finite(game.state.stats?.time));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const ok = value => ({ ok: true, ...value });
const fail = (reason, code = 'unavailable') => ({ ok: false, reason, message: reason, code });
const active = game => game.state.openingMission?.status === 'active' ? game.state.openingMission : null;

export function openingContactId(bodyId) {
  return bodyId === 'kettle' ? 'kettle:dockworker' : bodyId === 'morrow' ? 'morrow:courier' : null;
}

function cacheFor(game) {
  let cache = metadata.get(game);
  if (!cache || cache.seed !== game.state.seed) {
    cache = { seed: game.state.seed, ports: new Map(), rockId: null };
    metadata.set(game, cache);
  }
  return cache;
}

// Cache static port geometry. Contacts use the current physical room so the
// opening follows a dockworker's routine without regenerating the map.
function portInfo(game, bodyId) {
  const cache = cacheFor(game);
  if (!cache.ports.has(bodyId)) {
    const system = game.galaxy.find(value => value.id === SYSTEM);
    const source = system?.bodies.find(value => value.id === bodyId);
    if (!source) return null;
    const body = { ...source, faction: source.faction || system.faction, systemId: SYSTEM };
    const surface = generateSurface(body, game.state.seed, []);
    const contact = surface.entities.find(value => value.id === openingContactId(bodyId));
    const relays = surface.entities.filter(value => value.type === 'work')
      .sort((a, b) => distance(a, contact || surface.spawn) - distance(b, contact || surface.spawn));
    cache.ports.set(bodyId, { body, surface, contact, relays });
  }
  const info = cache.ports.get(bodyId);
  const surface = liveInteractionSurface(game, info.surface);
  return surface === info.surface ? info : { ...info, surface, contact: surface.entities.find(value => value.id === openingContactId(bodyId)) };
}

function contactTarget(game, bodyId) {
  const contact = portInfo(game, bodyId)?.contact;
  return contact ? { kind: 'person', systemId: SYSTEM, bodyId, entityId: contact.id, x: contact.x, y: contact.y, label: contact.name } : null;
}

function repairEvidence(game, bodyId, entityId) {
  const prefix = `${SYSTEM}:${bodyId}:work:${entityId}:`;
  return (game.state.activityTokens || []).find(token => typeof token === 'string' && token.startsWith(prefix)) || null;
}

/** The existing belt beyond Kettle's docking lights, not berth-side debris. */
export function isOpeningMiningRock(game, rock) {
  const kettle = game.state.systemId === SYSTEM && game.system?.bodies?.find(body => body.id === 'kettle');
  return !!kettle && Number.isFinite(kettle.x) && Number.isFinite(kettle.y) && !!rock && rock.ore > 0 &&
    Number.isFinite(rock.x) && Number.isFinite(rock.y) && distance(rock, kettle) - Math.max(0, finite(rock.radius)) >= OPENING_BELT_DISTANCE;
}

function nearEntity(game, bodyId, entityId, expectedId, type = 'npc') {
  const state = game.state;
  if (state.mode !== 'person' || state.person.health <= 0 || state.person.down) return fail('Reach this contact on foot when you are able to work.', 'mode');
  if (state.systemId !== SYSTEM || state.locationId !== bodyId || state.interior || state.exploration) return fail('Reach the named port before continuing this job.', 'location');
  if (entityId !== expectedId) return fail('Use the person or relay named in this assignment.', 'entity');
  const surface = portInfo(game, bodyId)?.surface;
  const entity = surface?.entities.find(value => value.id === entityId && value.type === type && !value.hidden);
  if (!entity || !interactionInRange(game, surface, entity, RANGE)) return fail('Move closer to the marked contact.', 'distance');
  return ok({ entity });
}

function liveOre(game) {
  // Never infer depletion from a different room or an absent/stale world.
  if (game.state.systemId !== SYSTEM || !Array.isArray(game.system?.asteroids) || game.system.asteroids.length === 0 || !game.system.bodies?.some(body => body.id === 'kettle' && Number.isFinite(body.x) && Number.isFinite(body.y))) return null;
  return game.system.asteroids.filter(rock => rock.hp > 0 && isOpeningMiningRock(game, rock));
}

function miningInRange(game) {
  if (game.state.mode !== 'ship' || !game.hasActiveVessel || game.state.ship.energy < 1 || game.cargoUsed >= game.state.ship.cargoCap) return false;
  const ship = game.state.ship, reach = getHullSystems(ship.classId).miningReach;
  // Match _mine's actual target choice, including nearby non-qualifying rocks.
  const candidate = (game.system?.asteroids || []).filter(rock => rock.hp > 0 && distance(rock, ship) < reach + rock.radius)
    .reduce((nearest, rock) => !nearest || distance(rock, ship) < distance(nearest, ship) ? rock : nearest, null);
  return isOpeningMiningRock(game, candidate);
}

function oreTarget(game) {
  const rocks = liveOre(game);
  if (!rocks?.length) return { kind: 'system', systemId: SYSTEM, bodyId: null, label: 'Mining belt beyond Kettle’s docking lights' };
  const cache = cacheFor(game);
  let rock = rocks.find(value => value.id === cache.rockId);
  if (!rock) {
    rock = rocks.reduce((nearest, value) => !nearest || distance(value, game.state.ship) < distance(nearest, game.state.ship) ? value : nearest, null);
    cache.rockId = rock.id;
  }
  return { kind: 'asteroid', systemId: SYSTEM, bodyId: null, entityId: rock.id, x: rock.x, y: rock.y, radius: rock.radius, label: 'Beyond the dock · mine two new ore' };
}

export function normalizeOpeningMission(raw) {
  if (!raw || typeof raw !== 'object' || raw.version !== 1 || raw.id !== OPENING_MISSION_ID || !['regular', 'hardcore'].includes(raw.branch) || !['active', 'completed', 'skipped'].includes(raw.status)) return null;
  const branch = raw.branch, originBody = branch === 'hardcore' ? 'morrow' : 'kettle';
  const stages = branch === 'hardcore' ? ['meet', 'repair', 'passage', 'return'] : ['meet', 'repair', 'ore'];
  const status = raw.paid === true ? 'completed' : raw.status;
  const relayId = typeof raw.relayId === 'string' && new RegExp(`^${originBody}:repair-[1-3]$`).test(raw.relayId) ? raw.relayId : null;
  const repairToken = relayId && typeof raw.repairToken === 'string' && raw.repairToken.startsWith(`${SYSTEM}:${originBody}:work:${relayId}:`) ? raw.repairToken.slice(0, 400) : null;
  let stage = stages.includes(raw.stage) ? raw.stage : 'meet';
  if (stage !== 'meet' && raw.acceptedAt == null) stage = 'meet';
  if (['ore', 'passage', 'return'].includes(stage) && !repairToken) stage = 'repair';
  const passageId = typeof raw.passageId === 'string' && raw.passageId.startsWith('passage:') ? raw.passageId.slice(0, 180) : null;
  if (stage === 'return' && !passageId) stage = 'passage';
  return { version: 1, id: OPENING_MISSION_ID, branch, status, stage, originBody, relayId, repairToken,
    oreMined: Math.min(OPENING_ORE, count(raw.oreMined)), passageSerial: count(raw.passageSerial), passageId,
    startedAt: Math.max(0, finite(raw.startedAt)), acceptedAt: raw.acceptedAt == null ? null : Math.max(0, finite(raw.acceptedAt)),
    repairedAt: repairToken ? Math.max(0, finite(raw.repairedAt)) : null,
    completedAt: status === 'active' ? null : Math.max(0, finite(raw.completedAt)), paid: status === 'completed',
    outcome: status === 'completed' ? raw.outcome === 'relay-report' ? 'relay-report' : branch === 'hardcore' ? 'service-note' : 'ore-delivery' : null };
}

export const OpeningMissionRules = {
  /** Shared authority overrides this with its canonical owned-vessel berth. */
  openingOwnShipHere() { return this.canUseOwnShipHere(); },

  initializeOpeningMission({ enabled = false, fresh = false } = {}) {
    if (!fresh || enabled !== true) {
      this.state.openingMission = normalizeOpeningMission(this.state.openingMission);
      return this.state.openingMission;
    }
    const branch = this.state.startMode === 'hardcore' ? 'hardcore' : 'regular', originBody = branch === 'hardcore' ? 'morrow' : 'kettle';
    const info = portInfo(this, originBody);
    if (!info?.contact || !info.relays.length) { this.state.openingMission = null; return null; }
    this.state.openingMission = { version: 1, id: OPENING_MISSION_ID, branch, status: 'active', stage: 'meet', originBody,
      relayId: info.relays[0].id, repairToken: null, oreMined: 0, passageSerial: count(this.state.livelihoods?.transitSerial), passageId: null,
      startedAt: clock(this), acceptedAt: null, repairedAt: null, completedAt: null, paid: false, outcome: null };
    if (branch === 'regular') {
      const body = this.system.bodies.find(value => value.id === originBody);
      Object.assign(this.state.ship, { x: body.x, y: body.y + body.radius + 75, vx: 0, vy: 0, angularVelocity: 0, angle: Math.PI / 2 });
      this._arriveAsPassenger(body, { discovery: false });
      this.state.livelihoods.parkedShip = null;
    }
    return this.state.openingMission;
  },

  openingMissionStatus() {
    const mission = this.state.openingMission;
    if (!mission || mission.status !== 'active') return { active: false, id: mission?.id || OPENING_MISSION_ID, status: mission?.status || 'inactive', branch: mission?.branch || null, stageId: mission?.status || 'inactive', canSkip: false, canFinish: false };
    const availability = this.state.openingMissionAvailability;
    const sharedView = this.state.multiplayer?.serverAuthoritative === true && availability?.id === OPENING_MISSION_ID && availability.systemId === SYSTEM;
    // A borrowed port hull may supply the visible cargo HUD. This delivery is
    // still funded by the captain's own hull, so authority supplies its facts.
    const oreMined = Math.min(OPENING_ORE, count(mission.oreMined));
    const oreAvailable = sharedView && Number.isFinite(availability.oreAvailable) ? count(availability.oreAvailable) : count(this.state.cargo?.ore);
    const readyOre = oreMined >= OPENING_ORE && oreAvailable >= OPENING_ORE;
    const rocks = mission.branch === 'regular' && mission.stage === 'ore' ? liveOre(this) : null;
    // Person snapshots intentionally omit asteroid geometry. This small
    // server-authored view may explain the fallback, but cannot authorize pay.
    const projectedDepletion = rocks === null && sharedView && this.state.systemId === SYSTEM && availability.oreFieldExhausted === true;
    const fallbackAvailable = mission.branch === 'regular' && mission.stage === 'ore' && !!mission.repairToken && !readyOre && (rocks !== null && rocks.length === 0 || projectedDepletion);
    const stageId = mission.stage === 'ore' && (readyOre || fallbackAvailable) ? 'return' : mission.stage;
    const contactBody = ['meet', 'repair'].includes(stageId) ? mission.originBody : 'kettle';
    const contact = portInfo(this, contactBody)?.contact;
    let target = contactTarget(this, contactBody), objective, controlTarget = 'use';
    if (stageId === 'meet') objective = `Talk to ${contact?.name || 'the dockworker'} near the landing. There is a small paid favor to ask.`;
    else if (stageId === 'repair') {
      const relay = portInfo(this, mission.originBody)?.relays.find(value => value.id === mission.relayId);
      if (relay) target = { kind: 'work', systemId: SYSTEM, bodyId: mission.originBody, entityId: relay.id, x: relay.x, y: relay.y, label: relay.name };
      objective = `Calibrate the marked relay. Match its three conductors; the ordinary repair pays 12 CR.`;
    } else if (stageId === 'ore') {
      target = oreTarget(this); controlTarget = this.state.mode === 'ship' ? 'mine' : 'modePill';
      objective = oreMined < OPENING_ORE ? `Fly beyond Kettle’s docking lights and mine two new ore at the marked belt (${oreMined}/${OPENING_ORE}). Bring the metal back.` : `Your departure check is recorded. Refill your hold to two ore, then bring your ship back to Kettle.`;
    } else if (stageId === 'passage') {
      target = { kind: 'passage', systemId: SYSTEM, bodyId: 'kettle', label: 'Kettle Station · paid passenger ferry' }; controlTarget = 'portButton';
      objective = 'Book paid passenger passage from Morrow to Kettle. The dockworker is waiting for your service note.';
    } else {
      objective = mission.branch === 'hardcore' ? `Deliver the service note to ${contact?.name || 'the dockworker'} at Kettle. Payment: 35 CR.`
        : fallbackAvailable ? `The marked belt is exhausted. Return to ${contact?.name || 'the dockworker'} at Kettle with your completed relay report. Payment: 35 CR.`
        : `Dock your ship at Kettle and deliver two ore to ${contact?.name || 'the dockworker'}. Payment: 35 CR.`;
    }
    const contactEntityId = contact?.id || openingContactId(contactBody);
    const access = nearEntity(this, 'kettle', contactEntityId, openingContactId('kettle'));
    const ownShipHere = sharedView && typeof availability.ownShipHere === 'boolean' ? availability.ownShipHere : this.openingOwnShipHere();
    const shipHere = mission.branch !== 'regular' || fallbackAvailable || ownShipHere;
    return { active: true, id: OPENING_MISSION_ID, status: 'active', branch: mission.branch, stageId, title: 'A small favor', objective, target, controlTarget, canSkip: true,
      contactEntityId, contactIds: mission.branch === 'hardcore' ? [openingContactId('morrow'), openingContactId('kettle')] : [openingContactId('kettle')],
      contact: contact ? { id: contact.id, name: contact.name, x: contact.x, y: contact.y, systemId: SYSTEM, bodyId: contactBody } : null,
      action: stageId === 'meet' ? 'accept' : stageId === 'return' ? 'finish' : null,
      reward: OPENING_REWARD, oreNeeded: OPENING_ORE, oreMined, oreAvailable, missingOre: Math.max(0, OPENING_ORE - oreMined, OPENING_ORE - oreAvailable), fallbackAvailable, ownShipHere,
      miningInRange: stageId === 'ore' && miningInRange(this),
      canFinish: stageId === 'return' && access.ok && shipHere };
  },

  openingAction(action, { entityId } = {}) {
    const mission = active(this);
    if (!mission) return fail('There is no active opening assignment.', 'inactive');
    if (action === 'skip') {
      mission.status = 'skipped'; mission.completedAt = clock(this);
      return ok({ text: 'The opening assignment is left aside. Your voyage continues.', opening: this.openingMissionStatus() });
    }
    if (!['accept', 'finish'].includes(action)) return fail('Choose an offered action for this assignment.', 'action');
    const bodyId = action === 'accept' ? mission.originBody : 'kettle';
    const access = nearEntity(this, bodyId, entityId, openingContactId(bodyId));
    if (!access.ok) return access;
    if (action === 'accept') {
      if (mission.stage !== 'meet') return fail('You already accepted this favor.', 'duplicate');
      mission.acceptedAt = clock(this); mission.oreMined = 0; mission.passageSerial = count(this.state.livelihoods?.transitSerial);
      // An exploratory captain may have already repaired this real relay.
      // Acknowledge that work without replaying the puzzle or its 12 CR wage.
      const evidence = repairEvidence(this, mission.originBody, mission.relayId);
      if (evidence) { mission.repairToken = evidence; mission.repairedAt ??= clock(this); }
      mission.stage = mission.repairToken ? mission.branch === 'hardcore' ? 'passage' : 'ore' : 'repair';
      this._log('A small favor', mission.branch === 'hardcore' ? 'Calibrate a Morrow relay, then take paid passage to Kettle with its service note. The dockworker will pay 35 credits on delivery.' : 'Calibrate a Kettle relay, then check your ship on a short departure: fly beyond Kettle’s docking lights, mine two new ore at the marked belt, and bring it back. Berth-side mining still fills your hold but does not complete this departure check. The favor pays 35 credits.', 'job');
      return ok({ text: mission.repairToken ? 'Your completed relay work is recorded. The next part of the favor is marked.' : 'The relay is marked. Complete the calibration, then follow the next part of the favor.', opening: this.openingMissionStatus() });
    }
    if (mission.acceptedAt === null || !mission.repairToken) return fail('Accept the favor and complete its marked relay first.', 'requirements');
    if (mission.paid || this.state.completedJobs.includes(OPENING_JOB_ID)) return fail('This favor has already been paid.', 'duplicate');
    // Payment never trusts the snapshot's display projection, including a
    // borrowed hull's cargo or an earlier report that the field was depleted.
    const actualOre = count(this.state.cargo.ore), readyOre = count(mission.oreMined) >= OPENING_ORE && actualOre >= OPENING_ORE;
    const actualRocks = mission.branch === 'regular' && mission.stage === 'ore' ? liveOre(this) : null;
    const fallback = !readyOre && mission.branch === 'regular' && mission.stage === 'ore' && actualRocks !== null && actualRocks.length === 0;
    if (mission.branch === 'regular' ? mission.stage !== 'ore' || !readyOre && !fallback : mission.stage !== 'return' || !mission.passageId) return fail(mission.branch === 'hardcore' ? 'Take the paid passenger ferry from Morrow to Kettle after completing the relay.' : `Mine two new ore beyond Kettle’s docking lights and keep two ore aboard (${count(mission.oreMined)}/2 from the marked belt; ${actualOre} in your hold).`, 'requirements');
    if (mission.branch === 'regular' && !fallback && !this.openingOwnShipHere()) return fail('Bring your own ship and the promised ore to Kettle before unloading.', 'ship-location');
    const oreCost = mission.branch === 'regular' && !fallback ? OPENING_ORE : 0;
    this.state.cargo.ore -= oreCost; this.state.credits += OPENING_REWARD;
    mission.status = 'completed'; mission.paid = true; mission.completedAt = clock(this);
    mission.outcome = fallback ? 'relay-report' : mission.branch === 'hardcore' ? 'service-note' : 'ore-delivery';
    const job = { id: OPENING_JOB_ID, type: 'opening', title: 'A small favor', description: 'A paid relay repair and local delivery.', goal: 1, progress: 1, status: 'completed', reward: OPENING_REWARD, oreCost,
      originSystem: SYSTEM, originBody: mission.originBody, targetSystem: SYSTEM, targetBody: 'kettle', acceptedAt: mission.acceptedAt, completedAt: mission.completedAt };
    this.state.missions.push(job); this.state.completedJobs.push(job.id); this.state.stats.jobs++;
    this._flag('first_job'); this._flag('completed_job');
    const text = mission.branch === 'hardcore' ? 'Service note delivered · +35 CR. The exchange has more work; your first ship is still yours to earn.' : fallback ? 'Relay report accepted · +35 CR. No ore was available in the marked belt. Kettle’s exchange has more work when you want it.' : 'Hull metal delivered · +35 CR. Your first paid favor is complete. Kettle’s exchange and shipwright are open to you.';
    this._log('A small favor completed', text, 'job'); this._event('job-complete', { job, text });
    this._refreshJobs(); this._checkChapters();
    return ok({ text, job, credits: OPENING_REWARD, oreCost, opening: this.openingMissionStatus() });
  },

  /** Internal evidence hook, called only after actual authoritative work. */
  observeOpeningAction(name, args = {}, result) {
    const mission = active(this);
    if (!mission || result?.ok !== true) return false;
    const repair = name === 'surfaceAction' && args.action === 'repair' || name === 'recordActivity' && args.type === 'work';
    if (repair && ['meet', 'repair'].includes(mission.stage) && result.first === true) {
      const entityId = args.entityId || (typeof args.token === 'string' && args.token.startsWith(`${mission.relayId}:`) ? mission.relayId : null);
      const access = nearEntity(this, mission.originBody, entityId, mission.relayId, 'work');
      const evidence = access.ok && repairEvidence(this, mission.originBody, mission.relayId);
      if (!evidence || mission.repairToken) return false;
      mission.repairToken = evidence; mission.repairedAt = clock(this);
      if (mission.stage === 'repair') mission.stage = mission.branch === 'hardcore' ? 'passage' : 'ore';
      return true;
    }
    if (name === 'takePassengerTransit' && mission.branch === 'hardcore' && mission.stage === 'passage') {
      const receipt = result.receipt, stored = this.state.livelihoods?.journeys?.find(value => value.id === receipt?.id);
      if (!stored || stored.systemId !== SYSTEM || stored.fromBody !== 'morrow' || stored.toBody !== 'kettle' || stored.fare <= 0 || count(this.state.livelihoods.transitSerial) <= mission.passageSerial || this.state.systemId !== SYSTEM || this.state.locationId !== 'kettle' || this.state.mode !== 'person' || this.state.interior) return false;
      mission.passageId = stored.id; mission.stage = 'return';
      return true;
    }
    return false;
  },

  /** Ship proxies override this to credit only their actual owning pilot. */
  recordOpeningMining(amount, rock) {
    const mission = active(this), mp = this.state.multiplayer;
    if (!mission || mission.branch !== 'regular' || mission.stage !== 'ore' || this.state.systemId !== SYSTEM || this.state.mode !== 'ship' || !this.ownsShip || this.state.npcContract?.active || this.netVesselId || mp?.serverAuthoritative && mp.aboardVesselId !== mp.ownedVesselId) return false;
    const source = this.system?.asteroids?.find(value => value.id === rock?.id);
    const ore = count(amount); if (!ore || !isOpeningMiningRock(this, source)) return false;
    const before = mission.oreMined; mission.oreMined = Math.min(OPENING_ORE, count(before) + ore);
    return before !== mission.oreMined;
  }
};
