/** Optional field evidence. The explanation behind it belongs in author notes, not this catalog. */
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

/** These are attributed interpretations, never a faction's automatic truth or allegiance rule. */
export const QUIET_EARTH_INTERPRETATIONS = freeze([
  { factionId: 'concord', name: 'Terran Continuity', claim: 'Quarantine kept the disaster contained.' },
  { factionId: 'freewake', name: 'Freewake Union', claim: 'Powerful people made leaving a necessity.' },
  { factionId: 'meridian', name: 'Meridian Combine', claim: 'Collapsing supply chains made staying impossible.' },
  { factionId: 'lantern', name: 'Lantern Assembly', claim: 'The same homeworld pattern may recur elsewhere.' },
  { factionId: 'cinder', name: 'Cinder Clans', claim: 'A sealed home can become somebody else’s claim.' }
]);

/** Stable IDs and order: layout seeds move the alcoves, not the meaning or ownership of evidence. */
export const QUIET_EARTH_FRAGMENT_RECORDS = freeze([
  {
    id: 'departure-copy', loreId: 'quiet_earth_departure_copy', name: 'Departure order · Civilian copy',
    text: '“We did not want to conquer the cosmos. We had to try.” The next line authorizes evacuation berths, seed stores and emergency landings. Territorial claims are struck out. The page naming the emergency has been removed.'
  },
  {
    id: 'service-layers', loreId: 'quiet_earth_service_layers', name: 'Maintenance plan · Human handwriting',
    text: 'Successive human repair crews sealed failing branches and opened alternate service loops. Their old arrows disagree. A handwritten instruction survives every revision: “Keep the green return strip on its own supply. People panic; the way home must not.”'
  },
  {
    id: 'homeworld-comparison', loreId: 'quiet_earth_homeworld_comparison', name: 'Comparison sheet · Three departures',
    text: 'A human analyst aligned three nonhuman departure records. Different bodies, languages and homeworlds; the same unexplained signature appears shortly before each evacuation. Margin: “Possible common pattern. Not proof of a common cause.” The Earth column ends mid-sentence.'
  },
  {
    id: 'collective-copy', loreId: 'quiet_earth_collective_copy', name: 'Translation copy · The Collective',
    text: 'TRANSLATION DISPUTED: THE COLLECTIVE. A nonhuman ledger dates occupied systems thousands of years before humanity left Earth. A homeworld warning appears before its first campaign. The translator could not verify the dates, who survived, or whether the name still belongs to the same group.'
  },
  {
    id: 'five-annotations', loreId: 'quiet_earth_five_annotations', name: 'One missing page · Five explanations',
    text: 'Archived arguments, not findings:\n' + QUIET_EARTH_INTERPRETATIONS.map(item => `${item.name}: ${item.claim}`).join('\n') + '\nNone explains all the readings.'
  }
]);

/** Reuse the captain's existing collected archive; uncollected entries stay out of its UI. */
export const QUIET_EARTH_LORE = freeze(QUIET_EARTH_FRAGMENT_RECORDS.map(record => ({
  id: record.loreId, title: record.name, text: record.text, physicalSourceOnly: true
})));

/** The corridor owns placement. Never silently put an unplaced record on a wall or at the origin. */
export function quietEarthLoreRecords(anchors = []) {
  return QUIET_EARTH_FRAGMENT_RECORDS.flatMap((record, index) => {
    const anchor = anchors[index];
    return Number.isFinite(anchor?.x) && Number.isFinite(anchor?.y)
      ? [{ ...record, x: anchor.x, y: anchor.y, optional: true }]
      : [];
  });
}
