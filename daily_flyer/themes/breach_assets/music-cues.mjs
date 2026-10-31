/** Original cue palette. No gameplay state or network synchronization lives here. */
const cue = (id, title, bpm, kind, sound, use, avoid, seconds) => Object.freeze({id, title, bpm, kind, sound, use, avoid, seconds, url:new URL(`./music/${id}.mp3`, import.meta.url), midi:new URL(`./music/${id}.mid`, import.meta.url)});
export const MUSIC_CUES = Object.freeze([
  cue('shadow-running','Shadow Running',140,'combat','A fast two-bar guitar hook, a contrasting middle and a clear return.','Beneath The Shadow’s arrival, city routes, aqueduct and Warden/root encounters.','The chapel’s first listening pause and the slower lantern district.',42.94),
  cue('sever-the-echo','Sever the Echo',154,'combat','Fast 3+3+2 accents, answering bass and a half-time bridge.','Sustained Shadow boss rotations and the Hollow’s Choir Keeper.','Unrevealed bosses, the menu and quiet exploration themes.',45.44),
  cue('lanterns-below','Lanterns Below',80,'ambient','Clean guitar carries a slow fragment of the opening hook.','Alternates with Containment Pulse in the menu; the lantern district and aqueduct approach.','Fast boss phases; lower the mix for records and attack warnings.',49.80),
  cue('containment-pulse','Containment Pulse',104,'combat','Low, spacious power chords; a broad backbeat and an answering lead.','Alternates with Lanterns Below in the menu; Blacksite research laboratory and Crosslink vault.','The brief scripted listening pauses and the results screen.',38.72),
  cue('iron-wake','Iron Wake',92,'combat','Open low guitar, a patient straight pulse and large gaps.','Blacksite’s opening and ongoing facility score; workshops and lantern streets.','Hollow’s listening textures and Shadow’s fastest boss phases.',33.10),
  cue('dry-contact','Dry Contact',118,'combat','A shifting three-bar accent pattern with a more independent bass.','Crosslink’s opening and routes, industrial rotations and keyed return routes.','The deliberately quiet reveal beats and the debrief.',26.21),
  cue('dead-carrier','Dead Carrier',76,'ambient','Clean harmonics and rolling toms in 6/8, with an unresolved rise.','Dead Relay and Hollow openings and rotations; archives and laboratories.','The first six seconds of Dead Relay’s arrival; lower the mix for records.',30.22),
  cue('crown-circuit','Crown Circuit',126,'combat','Dry chugs under a widely spaced upper answer.','Rail crowns, cable galleries, Shadow gantries and industrial boss rotations.','Listening pauses; keep warning sounds above the music.',32.28),
  cue('counterweight','Counterweight',98,'combat','Stop/start midrange guitar, floor toms and contrary bass movement.','Switchyard’s opening and recurring score, foundries, freight and relay routes.','The chapel and the Hollow’s quieter listening rooms.',31.19),
  cue('glass-teeth','Glass Teeth',112,'combat','High brittle dyads over a narrow low pedal.','Glasshouse’s opening, cultivation routes and Propagation boss rotation.','The practice bay’s first brief pause; lower the mix for warning cues.',27.51),
  cue('root-pressure','Root Pressure',86,'combat','Long low chords, rounded bass and fewer cymbals.','Foundries, the Glasshouse atrium and the Hollow’s recurring undertow.','The quiet reveal beats and high-speed Shadow arrivals.',35.29),
  cue('weight-of-stone','Weight of Stone',68,'combat','Heavy held chords and widely separated drum hits.','Sustained guardian rotations after a brief local sighting; continues through cover.','Unseen or remote bosses, ordinary corridors and the menu.',30.04),
  cue('below-the-carrier','Below the Carrier',null,'ambient','Unmetered swells and isolated clean notes; no drums.','The Hollow listening gallery’s recurring texture, after its first ten-second hush.','Boss score and using music as a hint about unseen enemies.',21.80),
  cue('the-room-replies','The Room Replies',54,'ambient','Muted dissonant dyads answering a low room tone.','The Hollow archive and listening gallery; Dead Relay’s communications vault.','Fast boss rotations; duck beneath records and warnings.',24.02),
  cue('spare-air','Spare Air',82,'ambient','Brief clean guitar and a small upward answer.','The Underworks opening, workers’ quarters, practice bay, observatory and chapel.','Fast boss phases and the mission results screen.',16.43),
  cue('exit-load','Exit Load',116,'combat','Urgent low guitar broken by higher open answers.','Every mission’s keyed extraction route, alternating with Dry Contact.','Early exploration, the menu and the results screen.',26.63),
]);
export const CUES_BY_ID = new Map(MUSIC_CUES.map(c => [c.id,c]));
// Fixed rotations give each place a musical identity. Enemy counts never shuffle tracks.
const rotation=(key,cues,extra={})=>Object.freeze({key,cues:Object.freeze(cues),level:.9,fade:1.2,...extra});
const boss=(key,cues=['weight-of-stone','crown-circuit'])=>rotation(key,cues,{level:1,delay:1.5});
export const MENU_SCORES=Object.freeze(['containment-pulse','lanterns-below'].map(cue=>
  Object.freeze({key:`menu:${cue}`,cue,level:.65,fade:1.2})));
export const MISSION_SCORE=Object.freeze({
  'blacksite-07':{
    opening:'iron-wake',rotation:rotation('facility',['iron-wake','containment-pulse','dry-contact']),
    sections:{'Research laboratory':rotation('research',['containment-pulse','glass-teeth']),'Quarantine hall':rotation('quarantine',['crown-circuit','dry-contact'])},
    bosses:{},quietBeats:{},returnZone:'Extraction bay',
  },
  'relay-09':{
    opening:'dead-carrier',rotation:rotation('signal',['dead-carrier','dry-contact','counterweight']),
    sections:{'Communications vault':rotation('vault',['dead-carrier','the-room-replies'],{level:.8})},
    bosses:{},quietBeats:{'Maintenance landing':6},returnZone:'Extraction control',
  },
  'crosslink-11':{
    opening:'dry-contact',rotation:rotation('relay',['dry-contact','containment-pulse','crown-circuit']),
    sections:{'Crosslink vault':rotation('vault',['containment-pulse','iron-wake'])},
    bosses:{},quietBeats:{},returnZone:'Extraction uplink',
  },
  'underworks-13':{
    opening:'spare-air',rotation:rotation('depths',['counterweight','root-pressure','crown-circuit']),
    sections:{foundry:rotation('foundry',['root-pressure','counterweight']),rail:rotation('crowns',['crown-circuit','dry-contact']),archives:rotation('archives',['dead-carrier','lanterns-below'],{level:.8}),quarters:rotation('quarters',['lanterns-below','spare-air'],{level:.75})},
    bosses:{reactor:boss('reactor')},quietBeats:{quarters:8},returnZone:'arrival',
  },
  'switchyard-15':{
    opening:'counterweight',rotation:rotation('yard',['counterweight','crown-circuit','dry-contact']),
    sections:{cables:rotation('cables',['crown-circuit','containment-pulse']),workshop:rotation('workshop',['iron-wake','counterweight'],{level:.75})},
    bosses:{engine:boss('engine')},quietBeats:{},returnZone:'lift',
  },
  'glasshouse-17':{
    opening:'glass-teeth',rotation:rotation('growth',['glass-teeth','root-pressure','containment-pulse']),
    sections:{practice:rotation('practice',['spare-air','iron-wake'],{level:.7}),atrium:rotation('atrium',['root-pressure','glass-teeth']),research:rotation('research',['containment-pulse','dead-carrier'])},
    bosses:{chamber:boss('propagation',['weight-of-stone','glass-teeth'])},quietBeats:{practice:6},returnZone:'arrival',
  },
  'hollow-19':{
    opening:'dead-carrier',rotation:rotation('undertow',['dead-carrier','root-pressure','counterweight'],{level:.8}),
    sections:{listening:rotation('listening',['below-the-carrier','the-room-replies'],{level:.8}),archive:rotation('archive',['the-room-replies','dead-carrier'],{level:.8}),observatory:rotation('observatory',['lanterns-below','spare-air'],{level:.75}),freight:rotation('freight',['counterweight','crown-circuit'])},
    bosses:{choir:boss('choir',['weight-of-stone','sever-the-echo'])},quietBeats:{dock:8,listening:10},returnZone:'dock',
  },
  'beneath-the-shadow':{
    opening:'shadow-running',rotation:rotation('buried-city',['shadow-running','dry-contact','crown-circuit']),
    sections:{lantern:rotation('lantern',['lanterns-below','iron-wake'],{level:.8}),bridge:rotation('aqueduct',['crown-circuit','shadow-running']),null:rotation('laboratory',['dead-carrier','counterweight'],{level:.75}),gantry:rotation('gantry',['crown-circuit','lanterns-below'],{level:.75}),chapel:rotation('chapel',['lanterns-below','spare-air'],{level:.75})},
    bosses:{forge:boss('warden',['shadow-running','sever-the-echo']),hydra:boss('hydra',['sever-the-echo','shadow-running']),engine:boss('sun',['sever-the-echo','weight-of-stone'])},
    quietBeats:{chapel:10},returnZone:'descent',
  },
});
const returnScore=rotation('return',['exit-load','dry-contact'],{level:.9});

export function musicScene(game){
  const p=game?.state?.player,level=game?.level,mission=level?.missionId||'';
  const zone=p&&level?.zones?.find(z=>p.x>=z.x1&&p.x<z.x2&&p.z>=z.z1&&p.z<z.z2);
  const zoneId=zone?.id||zone?.name||'',score=MISSION_SCORE[mission];
  const returning=!!p?.key&&score?.returnZone===zoneId;
  let encounter=score?.bosses[zoneId]||null;
  if(encounter){
    const living=(game.state.enemies||[]).some(e=>e.guardian&&e.alive&&e.health>0&&
      (mission==='beneath-the-shadow'?e.bossGroup===encounter.key:true));
    if(!living)encounter=null;
  }
  return {mission,zone:zoneId,opening:score?.opening||null,
    rotation:returning?returnScore:score?.sections[zoneId]||score?.rotation||null,
    boss:encounter,quietBeat:!returning&&score?.quietBeats[zoneId]?{key:zoneId,seconds:score.quietBeats[zoneId]}:null,
    missionTime:game?.state?.time||0};
}
