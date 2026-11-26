/** Public destinations for a new Casual captain, from this exact galaxy. */
import { FACTIONS, UPGRADES } from './content.mjs';
import { publicStartingPort } from './livelihoods.mjs';
import { systemIdentity } from './world-identity.mjs';
import { isPublicOrigin } from './sol-access.mjs';

const foldDrives = UPGRADES.filter(upgrade => ['fold_1', 'fold_2', 'fold_3'].includes(upgrade.id)).sort((a, b) => a.stats.warpRange - b.stats.warpRange);
const driveDetails = drive => drive ? { id: drive.id, name: drive.name, range: drive.stats.warpRange } : null;

export function fittedFoldDrive(upgrades = {}) {
  return driveDetails(foldDrives.findLast(drive => upgrades[drive.id] > 0));
}

/** The cheapest drive tier with a connected route home, including intermediate stops. */
export function casualStartingDrive(galaxy = [], systemId = 'hearth') {
  const home = galaxy.find(system => system.id === 'hearth');
  if (!home || !galaxy.some(system => system.id === systemId && isPublicOrigin(system))) return null;
  for (let tier = 0; tier < foldDrives.length; tier++) {
    const drive = foldDrives[tier], reached = new Set([home.id]), pending = [home];
    for (let index = 0; index < pending.length; index++) {
      const from = pending[index];
      for (const destination of galaxy.filter(isPublicOrigin)) {
        if (!reached.has(destination.id) && Math.hypot(destination.gx - from.gx, destination.gy - from.gy) <= drive.stats.warpRange) {
          reached.add(destination.id); pending.push(destination);
        }
      }
    }
    if (reached.has(systemId)) return { ...driveDetails(drive), upgrades: Object.fromEntries(foldDrives.slice(0, tier + 1).map(upgrade => [upgrade.id, 1])) };
  }
  return null;
}

export function startSystemChoices(galaxy = []) {
  return galaxy.filter(isPublicOrigin).map(system => ({
    id: system.id,
    name: system.name,
    factionName: FACTIONS.find(faction => faction.id === system.faction)?.name || 'Independent',
    danger: system.danger,
    typeName: systemIdentity(system)?.name || '',
    placeTypes: (system.bodies || []).map(body => body.typeLabel).filter(Boolean).join(' · '),
    description: [systemIdentity(system)?.name, system.description].filter(Boolean).join(' · '),
    portName: publicStartingPort(system)?.name || 'Open space',
    startingDrive: casualStartingDrive(galaxy, system.id)
  }));
}
