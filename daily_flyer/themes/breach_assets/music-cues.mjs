/** Original cue palette. No gameplay state or network synchronization lives here. */
const cue = (id, title, bpm, kind, sound, use, avoid, seconds, cooldown = 120) => Object.freeze({id, title, bpm, kind, sound, use, avoid, seconds, cooldown, url:new URL(`./music/${id}.mp3`, import.meta.url), midi:new URL(`./music/${id}.mid`, import.meta.url)});
export const MUSIC_CUES = Object.freeze([
  cue('containment-pulse','Containment Pulse',104,'combat','Low, spacious power chords; a broad backbeat and an answering lead.','An established facility battle.','Arrival, lone enemies, traversal and repeated continuous combat.',38.72),
  cue('iron-wake','Iron Wake',92,'combat','Open low guitar, a patient straight pulse and large gaps.','Blacksite pressure once the first encounter is understood.','The first steps inside or learning to move and fire.',33.10),
  cue('dry-contact','Dry Contact',118,'combat','A shifting three-bar accent pattern with a more independent bass.','A committed local Crosslink battle.','A distant partner’s fight, regrouping or waiting at a relay.',26.21),
  cue('dead-carrier','Dead Carrier',76,'ambient','Clean harmonics and rolling toms in 6/8, with an unresolved rise.','A quiet pause inside the discovered communications vault.','Before finding the vault, reading instructions or operating relays.',30.22),
  cue('crown-circuit','Crown Circuit',126,'combat','Dry chugs under a widely spaced upper answer.','Pressure in the Underworks crown sectors.','Cleared corridors, upgrade explanations and transit.',32.28),
  cue('counterweight','Counterweight',98,'combat','Stop/start midrange guitar, floor toms and contrary bass movement.','An established Switchyard battle.','Routing cabinets, shutter experiments and the first warning.',31.19),
  cue('glass-teeth','Glass Teeth',112,'combat','High brittle dyads over a narrow low pedal.','A sustained Glasshouse fight after time to read its defenders.','The practice bay and initial shield or healing demonstrations.',27.51),
  cue('root-pressure','Root Pressure',86,'combat','Long low chords, rounded bass and fewer cymbals.','A longer Glasshouse encounter; contrast to Glass Teeth.','Plant-gallery exploration or a single healer.',35.29),
  cue('weight-of-stone','Weight of Stone',68,'combat','Heavy held chords and widely separated drum hits.','A visible guardian after twelve seconds of exposure.','A guardian reveal, the first attack cycle or an immediate retry.',30.04),
  cue('below-the-carrier','Below the Carrier',null,'ambient','Unmetered swells and isolated clean notes; no drums.','One quiet visit to the Hollow listening gallery.','Tape text, pursuit, hidden-enemy hints or ordinary dark corridors.',21.80,180),
  cue('the-room-replies','The Room Replies',54,'ambient','Muted dissonant dyads answering a low room tone.','The Hollow cold archive after visiting the listening gallery.','Containment instructions, journal reading or an enemy reveal.',24.02,180),
  cue('spare-air','Spare Air',82,'ambient','Brief clean guitar and a small upward answer.','An Underworks exchange pause after an earlier local fight.','Every refuge, healing, checkpoints or co-op regrouping.',16.43),
  cue('exit-load','Exit Load',116,'combat','Urgent low guitar broken by higher open answers.','Local resistance on the final return near a mission’s arrival lift.','Simply taking a key, a safe walk home or the results screen.',26.63),
]);
export const CUES_BY_ID = new Map(MUSIC_CUES.map(c => [c.id,c]));
const POOLS = {
  'blacksite-07':['iron-wake','containment-pulse'],
  'relay-09':['containment-pulse','iron-wake'],
  'crosslink-11':['dry-contact','containment-pulse','iron-wake'],
  'underworks-13':['containment-pulse','dry-contact'],
  'switchyard-15':['counterweight','containment-pulse'],
  'glasshouse-17':['glass-teeth','root-pressure'],
  'hollow-19':['root-pressure','containment-pulse'],
};

// Coordinates are the local listener's occupied zone, never undiscovered enemies.
export function musicScene(game) {
  const p = game?.state?.player, level = game?.level;
  const mission = level?.missionId || '';
  const zone = p && level?.zones?.find(z => p.x >= z.x1 && p.x < z.x2 && p.z >= z.z1 && p.z < z.z2);
  const zoneId = zone?.id || zone?.name || '';
  let pool = POOLS[mission] || ['containment-pulse'];
  if (mission === 'underworks-13' && ['rail','reactor','archives'].includes(zoneId)) pool = ['crown-circuit','containment-pulse'];
  const returning = !!p?.key && ((['underworks-13','glasshouse-17'].includes(mission) && zoneId === 'arrival') || (mission === 'switchyard-15' && zoneId === 'lift') || (mission === 'hollow-19' && zoneId === 'dock'));
  if (returning) pool = ['exit-load', ...pool];
  let ambient = null;
  if (mission === 'relay-09' && zoneId === 'Communications vault') ambient = 'dead-carrier';
  if (mission === 'hollow-19' && zoneId === 'listening') ambient = 'below-the-carrier';
  if (mission === 'hollow-19' && zoneId === 'archive') ambient = 'the-room-replies';
  if (mission === 'underworks-13' && zoneId === 'hub') ambient = 'spare-air';
  return { mission, zone:zoneId, pool, ambient, silence:mission === 'glasshouse-17' && zoneId === 'practice', hold:mission === 'glasshouse-17' ? 10 : 2.5 };
}

export function chooseCue(pool, recent = []) {
  const valid = pool.filter(id => CUES_BY_ID.get(id)?.kind === 'combat');
  // Prefer no repeat of the last two; relax only as far as a small pool needs.
  for (let count = Math.min(2,recent.length); count >= 0; count--) {
    const choice = valid.find(id => !(count ? recent.slice(-count) : []).includes(id));
    if (choice) return choice;
  }
  return valid[0] || 'containment-pulse';
}
