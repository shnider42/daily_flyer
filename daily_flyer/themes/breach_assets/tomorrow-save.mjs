import { initialTomorrowSociety } from './tomorrow-society.mjs';
import { initializeTomorrowHazards } from './tomorrow-hazards.mjs';

// Revision 2 adds people and room hazards without moving revision-1 geometry.
// Validate the original roster first; only then append authored new IDs. A
// malformed or unknown revision is never rescued by dropping its extra fields.
export function migrateTomorrowSnapshot(snapshot, level, difficulty, seed, defaults, validateLegacy) {
  if (!level.tomorrow) return true;
  if (!snapshot || typeof snapshot !== 'object') return false;
  if (snapshot.tomorrowRevision === level.tomorrowRevision) return true;
  if (snapshot.tomorrowRevision !== 1 || level.tomorrowRevision !== 2) return false;
  const legacyLevel = { ...level, tomorrow:false,
    enemies:level.enemies.filter(item=>item.introducedRevision!==2),
    pickups:level.pickups.filter(item=>item.introducedRevision!==2),
    interactables:level.interactables.filter(item=>item.introducedRevision!==2),
    doors:level.doors.filter(item=>item.introducedRevision!==2),
  };
  if (!validateLegacy(snapshot,legacyLevel)) return false;
  for (const base of level.enemies.filter(item=>item.introducedRevision===2)) {
    snapshot.enemies.push({ ...base,...defaults(base),health:Math.round(base.health*difficulty.health),maxHealth:Math.round(base.maxHealth*difficulty.health),active:false,angle:Math.PI,attackCooldown:1,hitTimer:0,pathTimer:0 });
  }
  for (const base of level.interactables.filter(item=>item.introducedRevision===2)) snapshot.interactables.push({id:base.id,used:false});
  for (const base of level.pickups.filter(item=>item.introducedRevision===2)) snapshot.pickups.push({id:base.id,collected:false});
  for (const base of level.doors.filter(item=>item.introducedRevision===2)) snapshot.doors.push({id:base.id,open:base.open===true});
  snapshot.tomorrowSociety=initialTomorrowSociety(seed);
  // Hazard initialization needs authored type metadata, whereas solo saves
  // deliberately retain only each interaction's identity and used bit.
  const state={...snapshot,interactables:level.interactables.map(base=>({...base,used:snapshot.interactables.find(item=>item.id===base.id).used}))};
  initializeTomorrowHazards({level,state});
  snapshot.tomorrowHazards=state.tomorrowHazards;
  snapshot.tomorrowRevision=2;
  return true;
}
