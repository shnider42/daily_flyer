/** Shared launch choices. Attendance and grants are decided by the authority. */
import { SHIP_CLASSES, STARTER_SHIP_IDS } from './fleet.mjs';

export const GROUP_STARTER_TIERS = Object.freeze([
  Object.freeze({ id: 'lark', minPlayers: 2 }),
  Object.freeze({ id: 'puffin', minPlayers: 4 }),
  Object.freeze({ id: 'osprey', minPlayers: 7 })
]);

export function groupLaunchChoices(connectedCount = 0) {
  const count = Number.isSafeInteger(connectedCount) && connectedCount >= 0 ? connectedCount : 0;
  return [...STARTER_SHIP_IDS.map(id => ({ id, minPlayers: 1 })), ...GROUP_STARTER_TIERS].map(tier => {
    const hull = SHIP_CLASSES.find(value => value.id === tier.id);
    if (!hull) return null;
    const eligible = count >= tier.minPlayers && count <= hull.berths;
    return { id: hull.id, name: hull.name, subtitle: hull.subtitle, berths: hull.berths,
      minPlayers: tier.minPlayers, eligible,
      reason: count < tier.minPlayers ? `${tier.minPlayers} connected captains unlock this ship.` : count > hull.berths ? `${hull.berths} berths cannot hold ${count} captains.` : '' };
  }).filter(Boolean);
}
