/** Public destinations for a new Casual captain, from this exact galaxy. */
import { FACTIONS } from './content.mjs';
import { publicStartingPort } from './livelihoods.mjs';

export function startSystemChoices(galaxy = []) {
  return galaxy.map(system => ({
    id: system.id,
    name: system.name,
    factionName: FACTIONS.find(faction => faction.id === system.faction)?.name || 'Independent',
    danger: system.danger,
    description: system.description || '',
    portName: publicStartingPort(system)?.name || 'Open space'
  }));
}
