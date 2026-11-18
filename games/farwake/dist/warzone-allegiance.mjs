/** Use the same personal or vessel relation for labels, aim and combat. */
const factions = ['freewake', 'meridian', 'concord', 'lantern', 'cinder'];
export function warzoneRelation(contactFactionId, viewer = {}) {
  if (!factions.includes(contactFactionId)) return 'neutral';
  if (Array.isArray(viewer.hostileFactions) && viewer.hostileFactions.includes(contactFactionId)) return 'hostile';
  if (!factions.includes(viewer.factionId)) return 'neutral';
  return contactFactionId === viewer.factionId ? 'ally' : 'hostile';
}
