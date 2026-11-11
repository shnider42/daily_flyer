/** Personal equipment, bought with the captain's purse at a physical outfitter. */
import { PERSONAL_WEAPONS, ensureSidearm, getPersonalWeapon } from './combat.mjs';
import { generateSurface } from './surface.mjs';
import { interactionInRange } from './live-surface.mjs';

const count = value => Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
const professions = ['paramedic', 'doctor', 'law', 'military'];
const fail = (reason, code) => ({ ok: false, reason, message: reason, code });

export function personalGearProgress(game) {
  // Ordinary contracts and successful hired watches increment stats.jobs.
  // Profession assignments have their own counters and never increment it.
  const jobs = count(game.state.stats?.jobs), assignments = professions.reduce((sum, id) => sum + count(game.state.professions?.careers?.[id]?.completed), 0);
  const knownSystems = new Set(game.galaxy.map(system => system.id));
  const visited = new Set((Array.isArray(game.state.visited) ? game.state.visited : []).filter(id => knownSystems.has(id)));
  return { jobs, assignments, completed: jobs + assignments, systems: visited.size };
}

function outfitterAccess(game) {
  const state = game.state;
  if (state.person.health <= 0 || state.person.down) return fail('Recover before handling your personal equipment.', 'incapacitated');
  if (!game.atInhabitedPort || state.mode !== 'person' || state.interior || state.exploration) return fail('Visit an inhabited port outfitter on foot for personal equipment.', 'location');
  const surface = game._surfaceForInteraction?.() || generateSurface(game.currentBody, state.seed, state.flags);
  if (!surface?.entities.some(entity => entity.type === 'mechanic' && !entity.hidden && interactionInRange(game, surface, entity, 46))) return fail('Walk to the port outfitter to buy or equip a personal weapon.', 'distance');
  return { ok: true };
}

export const PersonalGearRules = {
  personalWeaponInfo(id) {
    const weapon = PERSONAL_WEAPONS.find(value => value.id === id);
    if (!weapon) return this._fail('That personal weapon is not available.', 'target');
    const person = ensureSidearm(this.state.person), progress = personalGearProgress(this), owned = person.ownedWeapons.includes(id), equipped = getPersonalWeapon(person).id === id;
    const base = { weapon, id, cost: weapon.cost, owned, equipped, progress, requirements: { completed: weapon.requiredJobs, systems: weapon.requiredSystems } };
    if (equipped) return { ...base, ...fail('This weapon is equipped.', 'equipped') };
    if (!owned && (progress.completed < weapon.requiredJobs || progress.systems < weapon.requiredSystems)) return { ...base, ...fail(`Requires ${weapon.requiredJobs} completed jobs or service assignments and ${weapon.requiredSystems} explored star systems.`, 'requirements') };
    if (!owned && this.state.credits < weapon.cost) return { ...base, ...fail(`This weapon costs ${weapon.cost.toLocaleString('en-US')} credits. You have ${Math.floor(this.state.credits).toLocaleString('en-US')}.`, 'cost') };
    return { ...base, ...outfitterAccess(this) };
  },
  buyPersonalWeapon(id) {
    const info = this.personalWeaponInfo(id);
    if (info.owned) return this._fail('You already own this personal weapon.', 'owned');
    if (!info.ok) return info;
    this.state.credits -= info.cost;
    this.state.person.ownedWeapons.push(id);
    this.state.person.weapon = id;
    this._event('upgrade', { weaponId: id, text: `${info.weapon.name} purchased and equipped.` });
    return this._ok({ weaponId: id, weapon: info.weapon, text: `${info.weapon.name} purchased and equipped.` });
  },
  equipPersonalWeapon(id) {
    const person = ensureSidearm(this.state.person);
    if (!person.ownedWeapons.includes(id)) return this._fail('Purchase this personal weapon before equipping it.', 'owned');
    const access = outfitterAccess(this); if (!access.ok) return access;
    person.weapon = id;
    // Never reset shot timers or weaponReadyAt when changing equipment.
    return this._ok({ weaponId: id, weapon: getPersonalWeapon(person), text: `${getPersonalWeapon(person).name} equipped.` });
  }
};
