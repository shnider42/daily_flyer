/**
 * A Casual departure roster belongs to its physical hull. Only a working watch
 * is materialized: choosing a million reserves costs no more than choosing ten.
 * Human berths and accepted station choices always come before the NPC watch.
 */
import { CREW_ROLES, getShipClass, STATION_ROLES } from './fleet.mjs';

const ROLES = Object.freeze(['engineer', 'gunner', 'medic', 'navigator', 'scientist', 'security', 'quartermaster']);
const HUMAN_ROLE = Object.freeze({ engineering: 'engineer', weapons: 'gunner', medical: 'medic', navigation: 'navigator', scanner: 'scientist', security: 'security' });
const FIRST = ['Anik', 'Tavi', 'Meri', 'Rook', 'Sera', 'Ives', 'Kori', 'Asha', 'Lin', 'Beck', 'Jules', 'Mara'];
const LAST = ['Vale', 'Ash', 'Sen', 'Venn', 'Pell', 'Rho', 'Aster', 'Sol', 'Hale', 'Noon', 'Fen', 'Kest'];
const hash = input => { let value = 2166136261; for (const char of String(input)) value = Math.imul(value ^ char.charCodeAt(0), 16777619); return value >>> 0; };
const clone = value => JSON.parse(JSON.stringify(value));
const living = member => member.health > 0 && member.status !== 'dead' && member.status !== 'released';
const roles = value => [...new Set((Array.isArray(value) ? value : []).filter(role => STATION_ROLES.includes(role)))];
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;

export function normalizeCasualCrewCount(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value.trim()))) return 0;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

export function createCasualCrewRoster(requestedCount, seed = 'casual-crew') {
  return { version: 1, requestedCount: normalizeCasualCrewCount(requestedCount), seed: String(seed), id: `watch-${hash(seed).toString(36)}`, records: [], humanCount: 1, humanRoles: ['helm'], reservedBerths: 0 };
}

export const isCasualCrew = member => member?.casualCrew === true;

function recordFor(roster, index) {
  const role = ROLES[index % ROLES.length], definition = CREW_ROLES[role], key = hash(`${roster.seed}:${index}`);
  return { id: `${roster.id}:${index}`, casualCrew: true, casualCrewRosterId: roster.id, casualCrewIndex: index,
    name: `${FIRST[key % FIRST.length]} ${LAST[Math.floor(key / FIRST.length) % LAST.length]}${index >= FIRST.length * LAST.length ? ` ${index + 1}` : ''}`,
    species: 'human', role, color: definition.color, description: definition.description,
    health: definition.health, maxHealth: definition.health, status: 'active' };
}

function validMember(member, roster) {
  return isCasualCrew(member) && member.casualCrewRosterId === roster.id && Number.isSafeInteger(member.casualCrewIndex)
    && member.casualCrewIndex >= 0 && member.casualCrewIndex < roster.requestedCount;
}

/** Read-only counts; virtual reserves are counted, never expanded into people. */
export function casualCrewStatus(state) {
  const roster = state?.ship?.casualCrew;
  if (!roster || roster.version !== 1) return null;
  const requestedCount = normalizeCasualCrewCount(roster.requestedCount);
  const seen = new Set(), records = (Array.isArray(roster.records) ? roster.records : []).filter(member => {
    if (!validMember(member, { ...roster, requestedCount }) || seen.has(member.casualCrewIndex)) return false;
    seen.add(member.casualCrewIndex); return true;
  });
  const lostCount = records.filter(member => !living(member)).length;
  const activeCount = (state.crew || []).filter(member => validMember(member, { ...roster, requestedCount }) && living(member)).length;
  return { requestedCount, activeCount, reserveCount: Math.max(0, requestedCount - lostCount - activeCount), lostCount,
    totalCount: Math.max(0, requestedCount - lostCount), humanCount: roster.humanCount || 1, humanRoles: roles(roster.humanRoles) };
}

/**
 * Reconcile a physical vessel's inventory, not a visitor's personal inventory.
 * This function never changes hull health, credits or cargo, and never heals a
 * returning NPC. Call the ordinary stat refresh with heal=false when changed.
 */
export function reconcileCasualCrew(state, options = {}) {
  const before = Array.isArray(state.crew) ? state.crew : [], roster = state.ship?.casualCrew;
  if (!roster || roster.version !== 1) {
    // A captain changing ships leaves this hull's watch with the parked hull.
    const crew = before.filter(member => !isCasualCrew(member));
    if (crew.length !== before.length) state.crew = crew;
    return { changed: crew.length !== before.length, requestedCount: 0, activeCount: 0, reserveCount: 0, lostCount: 0, totalCount: 0 };
  }
  roster.requestedCount = normalizeCasualCrewCount(roster.requestedCount);
  roster.seed = String(roster.seed || state.ship.id || 'casual-crew');
  roster.id ||= `watch-${hash(roster.seed).toString(36)}`;
  roster.humanCount = Math.max(1, count(options.humanCount ?? state.ship.humanOccupants ?? roster.humanCount ?? 1));
  if (options.humanCount !== undefined) state.ship.humanOccupants = roster.humanCount;
  roster.humanRoles = roles(options.humanRoles ?? roster.humanRoles ?? ['helm']);
  roster.reservedBerths = count(options.reservedBerths ?? roster.reservedBerths ?? 0);

  // Save mutations made to the live watch (including wounds, death and names)
  // before deciding who is needed. Released people remain permanent records.
  const records = new Map();
  for (const member of Array.isArray(roster.records) ? roster.records : []) if (validMember(member, roster)) records.set(member.casualCrewIndex, member);
  for (const member of before) if (validMember(member, roster)) records.set(member.casualCrewIndex, member);
  for (const member of state.formerCrew || []) if (validMember(member, roster)) records.set(member.casualCrewIndex, { ...member, status: 'released' });
  roster.records = [...records.values()];
  if (state.boarding?.phase === 'active') return { changed: false, ...casualCrewStatus(state) };

  const permanent = before.filter(member => !isCasualCrew(member));
  const permanentBerths = permanent.filter(member => living(member) && !member.serviceCrew).length;
  const physicalCapacity = state.ship.unowned || state.ship.destroyed || state.ship.hull <= 0 ? 0
    : Math.max(0, getShipClass(state.ship.classId).berths - roster.humanCount - roster.reservedBerths - permanentBerths);
  const capacity = Number.isSafeInteger(roster.dutyLimit) ? Math.min(physicalCapacity, Math.max(0, roster.dutyLimit)) : physicalCapacity;
  const blocked = new Set(roster.humanRoles.map(role => HUMAN_ROLE[role]).filter(Boolean));
  // Hired specialists keep their jobs; the complimentary watch fills gaps.
  for (const member of permanent) if (living(member)) blocked.add(member.role);
  const availableRoles = ROLES.filter(role => !blocked.has(role));
  const active = [], next = availableRoles.map(role => ROLES.indexOf(role));
  // At most one step per materialized casualty plus a hull's berth count.
  // The requested roster size never controls the amount of work here.
  while (active.length < capacity && next.some(index => index < roster.requestedCount)) {
    let best = -1;
    for (let i = 0; i < next.length; i++) if (next[i] < roster.requestedCount && (best < 0 || next[i] < next[best])) best = i;
    if (best < 0) break;
    const index = next[best];
    next[best] = index > Number.MAX_SAFE_INTEGER - ROLES.length ? Infinity : index + ROLES.length;
    let member = records.get(index);
    if (member && !living(member)) continue;
    if (!member) { member = recordFor(roster, index); records.set(index, member); }
    member.status = member.health < member.maxHealth ? 'injured' : 'active';
    active.push(member);
  }
  const selected = new Set(active.map(member => member.casualCrewIndex));
  for (const member of records.values()) if (!selected.has(member.casualCrewIndex) && living(member)) member.status = 'reserve';
  roster.records = [...records.values()].sort((one, two) => one.casualCrewIndex - two.casualCrewIndex);
  const crew = [...permanent, ...active];
  const changed = crew.length !== before.length || crew.some((member, index) => member.id !== before[index]?.id);
  if (changed || crew.some((member, index) => member !== before[index])) state.crew = crew;
  return { changed, ...casualCrewStatus(state) };
}

/** Flush a departing hull's current watch without taking its NPCs elsewhere. */
export function captureCasualCrew(state) {
  const roster = state.ship?.casualCrew;
  if (!roster) return;
  const records = new Map((roster.records || []).map(member => [member.casualCrewIndex, member]));
  for (const member of state.crew || []) if (validMember(member, roster)) records.set(member.casualCrewIndex, clone(member));
  roster.records = [...records.values()];
}
