/** Original cue palette. No gameplay state or network synchronization lives here. */
const cue = (id, title, bpm, kind, sound, use, avoid, seconds, cooldown = 120) => Object.freeze({id, title, bpm, kind, sound, use, avoid, seconds, cooldown, url:new URL(`./music/${id}.mp3`, import.meta.url), midi:new URL(`./music/${id}.mid`, import.meta.url)});
export const MUSIC_CUES = Object.freeze([
  cue('containment-pulse','Containment Pulse',104,'combat','Low, spacious power chords; a broad backbeat and an answering lead.','The main menu, Blacksite research laboratory and Crosslink vault.','Extraction, reading and revisiting a scored room. Never loop behind the menu.',38.72),
  cue('iron-wake','Iron Wake',92,'combat','Open low guitar, a patient straight pulse and large gaps.','The opening of a fresh Blacksite mission.','Continue, checkpoint retries and extraction. Attack warnings lower its mix.',33.10),
  cue('dry-contact','Dry Contact',118,'combat','A shifting three-bar accent pattern with a more independent bass.','The opening of a fresh Crosslink mission.','Continue, checkpoint retries, relay work and the debrief.',26.21),
  cue('dead-carrier','Dead Carrier',76,'ambient','Clean harmonics and rolling toms in 6/8, with an unresolved rise.','Dead Relay’s communications vault and the Underworks archives.','Dead Relay’s arrival, tape text and relay operation.',30.22),
  cue('crown-circuit','Crown Circuit',126,'combat','Dry chugs under a widely spaced upper answer.','The Underworks rail crowns and Switchyard cable sector.','Upgrade explanations, transit and repeated trips through the same sector.',32.28),
  cue('counterweight','Counterweight',98,'combat','Stop/start midrange guitar, floor toms and contrary bass movement.','The opening of a fresh Switchyard mission.','Routing cabinets, shutter experiments and checkpoint retries.',31.19),
  cue('glass-teeth','Glass Teeth',112,'combat','High brittle dyads over a narrow low pedal.','The first visited Glasshouse cultivation wing; both wings share one cue.','The practice bay and initial shield or healing demonstrations.',27.51),
  cue('root-pressure','Root Pressure',86,'combat','Long low chords, rounded bass and fewer cymbals.','The Underworks foundry and Glasshouse’s atrium after power returns.','Glasshouse arrival, the practice bay and the power activation itself.',35.29),
  cue('weight-of-stone','Weight of Stone',68,'combat','Heavy held chords and widely separated drum hits.','An authored guardian arena after eight seconds of local exposure; twelve in Hollow.','A guardian reveal, the first attack cycle or an immediate retry.',30.04),
  cue('below-the-carrier','Below the Carrier',null,'ambient','Unmetered swells and isolated clean notes; no drums.','One quiet visit to the Hollow listening gallery.','Tape text, pursuit, hidden-enemy hints or ordinary dark corridors.',21.80,180),
  cue('the-room-replies','The Room Replies',54,'ambient','Muted dissonant dyads answering a low room tone.','The Hollow cold archive after visiting the listening gallery.','Containment instructions, journal reading or an enemy reveal.',24.02,180),
  cue('spare-air','Spare Air',82,'ambient','Brief clean guitar and a small upward answer.','The Underworks opening: a brief clean-guitar descent before the heavier crowns.','Refuges, healing, checkpoints, co-op regrouping and later returns to the lift.',16.43),
  cue('exit-load','Exit Load',116,'combat','Urgent low guitar broken by higher open answers.','Local resistance on the final return near a mission’s arrival lift.','Simply taking a key, a safe walk home or the results screen.',26.63),
]);
export const CUES_BY_ID = new Map(MUSIC_CUES.map(c => [c.id,c]));
// A score is placed in the level. Enemy counts never choose a track.
const section = (key, cue, extra = {}) => Object.freeze({key, cue, delay:2, window:30, gap:25, ...extra});
export const MENU_SCORE = section('menu','containment-pulse',{delay:0,gap:0,level:.65});
export const MISSION_SCORE = Object.freeze({
  'blacksite-07': {opening:'iron-wake', sections:{'Research laboratory':section('research','containment-pulse')}, quiet:['Extraction bay']},
  'relay-09': {opening:null, sections:{'Communications vault':section('vault','dead-carrier',{delay:3})}, quiet:['Maintenance landing','Western relay','Eastern relay','Extraction control']},
  'crosslink-11': {opening:'dry-contact', sections:{'Crosslink vault':section('vault','containment-pulse')}, quiet:['Extraction uplink']},
  'underworks-13': {opening:'spare-air', sections:{foundry:section('foundry','root-pressure'),rail:section('crowns','crown-circuit'),archives:section('archives','dead-carrier'),reactor:section('guardian','weight-of-stone',{guardian:true,delay:8})}, quiet:['hub','quarters']},
  'switchyard-15': {opening:'counterweight', sections:{cables:section('cables','crown-circuit'),engine:section('guardian','weight-of-stone',{guardian:true,delay:8})}, quiet:['workshop','phase']},
  'glasshouse-17': {opening:null, sections:{atrium:section('atrium','root-pressure',{power:true,delay:8}),west:section('cultivation','glass-teeth'),east:section('cultivation','glass-teeth'),chamber:section('guardian','weight-of-stone',{guardian:true,delay:8})}, quiet:['arrival','practice','north']},
  'hollow-19': {opening:null, sections:{listening:section('listening','below-the-carrier',{delay:4,quiet:true,gap:60}),archive:section('archive','the-room-replies',{delay:4,quiet:true,visit:'listening',gap:60}),choir:section('guardian','weight-of-stone',{guardian:true,delay:12,gap:60})}, quiet:['west','observatory','wards','exchange','well','freight','dock','reservoir','plant']},
});

export function musicScene(game) {
  const p=game?.state?.player, level=game?.level, mission=level?.missionId || '';
  const zone=p && level?.zones?.find(z=>p.x>=z.x1 && p.x<z.x2 && p.z>=z.z1 && p.z<z.z2);
  const zoneId=zone?.id || zone?.name || '', score=MISSION_SCORE[mission];
  let passage=score?.sections[zoneId] || null;
  if(passage?.power && !game.state.power) passage=null;
  const returning=!!p?.key && ((['underworks-13','glasshouse-17'].includes(mission) && zoneId==='arrival') || (mission==='switchyard-15' && zoneId==='lift') || (mission==='hollow-19' && zoneId==='dock'));
  if(returning) passage=section('return','exit-load',{danger:true,delay:2});
  return {mission,zone:zoneId,opening:score?.opening || null,section:passage,
    silence:!passage && !!score?.quiet.includes(zoneId),missionTime:game?.state?.time || 0};
}
