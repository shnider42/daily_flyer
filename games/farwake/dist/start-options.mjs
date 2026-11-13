/** Public destinations for a new Casual captain, from this exact galaxy. */
import { FACTIONS } from './content.mjs';
import { publicStartingPort } from './livelihoods.mjs';
import { systemIdentity } from './world-identity.mjs';

export function startSystemChoices(galaxy = []) {
  return galaxy.map(system => ({
    id: system.id,
    name: system.name,
    factionName: FACTIONS.find(faction => faction.id === system.faction)?.name || 'Independent',
    danger: system.danger,
    typeName: systemIdentity(system)?.name || '',
    placeTypes: (system.bodies || []).map(body => body.typeLabel).filter(Boolean).join(' · '),
    description: [systemIdentity(system)?.name, system.description].filter(Boolean).join(' · '),
    portName: publicStartingPort(system)?.name || 'Open space'
  }));
}
