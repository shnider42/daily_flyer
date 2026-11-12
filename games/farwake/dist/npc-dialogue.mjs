/** Local, authored reactions to facts the captain and this person actually share. */
import { DIALOGUE } from './content.mjs';
import { QUEST_THREADS } from './quest-content.mjs';
import { npcClock } from './npc-life.mjs';
import { socialConversation } from './social-world.mjs';
import { normalizeSpecies, speciesLabel, speciesBackground } from './species.mjs';
import { localSiteResponse } from './local-site-dialogue.mjs';
import { militaryDialogue, militaryServiceRank } from './military-ranks.mjs';
import { militaryMission } from './military-content.mjs';

export const CONVERSATION_LIMIT = 96;
const REMEMBER_AFTER = 30;
const finite = (value, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const text = (value, max = 300) => typeof value === 'string' ? value.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max) : '';
const idOf = entity => text(entity?.id, 180);
const hash = value => { let h = 2166136261; for (const c of String(value)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const choose = (values, key) => values[hash(key) % values.length];
const has = (state, flag) => state.flags?.includes(flag);
const localBody = (game, entity) => entity.data?.homeLocationId || entity.data?.bodyId || game.state.exploration?.bodyId || game.state.locationId;
const contactId = entity => entity.data?.contactId || (idOf(entity).startsWith('quest:') ? idOf(entity).slice(6) : null);

export function normalizeConversations(raw) {
  const people = [], seen = new Set();
  for (const saved of (Array.isArray(raw?.people) ? raw.people : []).slice(-CONVERSATION_LIMIT * 2)) {
    const id = text(saved?.id, 180);
    if (!id || ['__proto__', 'prototype', 'constructor'].includes(id) || seen.has(id)) continue;
    const count = Math.floor(clamp(finite(saved.count), 0, 99));
    if (!count) continue;
    seen.add(id);
    people.push({ id, count, lastAt: clamp(finite(saved.lastAt), 0, 1e12), context: text(saved.context, 80) });
  }
  return { version: 1, people: people.sort((a, b) => a.lastAt - b.lastAt).slice(-CONVERSATION_LIMIT) };
}

function roleOf(entity) {
  if (['scientist', 'bartender', 'courier'].includes(entity.role)) return entity.role;
  const value = entity.data?.dialogueRole || entity.data?.crewRole || entity.role || entity.type;
  return ({ Shipwright: 'mechanic', navigator: 'pilot', gunner: 'warden', security: 'warden', medical: 'medic', engineering: 'engineer', bartender: 'bartender', courier: 'courier', settler: 'governor', survivor: 'refugee', 'Field archivist': 'archivist' })[value] || value;
}

const VOICES = {
  mechanic: {
    morning: ['Morning. Put the troublesome part where I can see it.', 'First job of the watch: find out what the last watch called “fixed”.'],
    afternoon: ['Hold that thought. I’m listening for the rattle.', 'Every ship has a noise its owner pretends not to hear.'],
    evening: ['Nearly through the tool count. What needs attention?', 'I can hear a loose coupling over the departure announcements. Occupational hazard.'],
    night: ['Night watch. Keep your voice down; the tools have been shouting all day.', 'Still awake? So is the repair list.'],
    familiar: ['Back in one piece. That’s a useful habit.', 'There you are. What did the galaxy loosen this time?']
  },
  dockworker: {
    morning: ['Mind the loading lane. Morning freight has no patience.', 'Another watch, another stack. You need something?'],
    afternoon: ['Give me a moment to put this down. All right—go on.', 'A quiet manifest would make a lovely change.'],
    evening: ['I count the crates twice before handing over. Saves an argument tomorrow.', 'The freight keeps coming. The shift does eventually end.'],
    night: ['Easy with the noise. Some people have finished their watch.', 'Night freight still needs counting. What brings you through?'],
    familiar: ['I know that face. You finding your way around?', 'Back again. Stay clear of the loading marks and we’ll get along.']
  },
  medic: {
    morning: ['Fresh watch. Clean hands. How are you feeling?', 'One thing at a time. Start with what hurts.'],
    afternoon: ['Sit if you need to. Nobody gets better by proving they can stand.', 'I have a moment. Tell me what you need.'],
    evening: ['I’m checking supplies before handover. Are you all right?', 'The clinic’s still here. What’s troubling you?'],
    night: ['Night watch. Speak softly; people are trying to rest.', 'You don’t need to apologize for needing care after dark.'],
    familiar: ['I remember you. Better, worse, or just passing through?', 'Good to see you upright. Let’s keep it that way.']
  },
  pilot: {
    morning: ['Morning departures. Everybody thinks theirs should go first.', 'Checking the route before I trust the timetable.'],
    afternoon: ['The stars stay put. It’s the connections that need checking.', 'Give me a moment with these arrival times.'],
    evening: ['I prefer arriving before the kitchens close.', 'Last connections always make people honest about where they want to be.'],
    night: ['Night watch has fewer conversations. I don’t mind this one.', 'Quiet departures. Check the berth lights twice.'],
    familiar: ['Back through? Somewhere become home yet?', 'I remember your face better than your transponder.']
  },
  courier: {
    morning: ['Morning rounds. Somebody always remembers one more message.', 'Small parcels, heavy promises. That’s the morning.'],
    afternoon: ['I’ve time for a word. Make it a good one.', 'Names and destinations. I check both before moving on.'],
    evening: ['I’m getting the route in order before my next round.', 'A note can wait overnight. People are less patient.'],
    night: ['Keep it quiet. I’d like one message to wait until morning.', 'Off the clock for a moment. What do you need?'],
    familiar: ['You again. Any news worth carrying?', 'Good to see a familiar face between deliveries.']
  },
  engineer: {
    morning: ['One reading before I touch anything. Then we can argue with it.', 'Morning checks. The machinery doesn’t know we changed shifts.'],
    afternoon: ['That hum is almost right. Almost is the interesting part.', 'I’m checking the same reading twice. Humor me.'],
    evening: ['I leave notes for the next watch. Guesswork isn’t a handover.', 'Finishing the checks. What have you found?'],
    night: ['It’s easier to hear the faults on night watch.', 'Quiet hours. Machines rarely respect them.'],
    familiar: ['Back with a question or a broken part?', 'I remember you. What needs making sense of?']
  },
  scientist: {
    morning: ['New readings. Same insistence on labeling the samples.', 'The first observation is usually that I need another cup.'],
    afternoon: ['Please don’t move that label. It matters more than it looks.', 'I’m checking the record against the sample. What have you found?'],
    evening: ['Closing the sample log before I forget which mistake was mine.', 'There’s always one reading that refuses to fit.'],
    night: ['Night observations. Some things only show up when the port is quiet.', 'Speak softly. I’m trying to keep the numbers straight.'],
    familiar: ['You again. Brought an observation, or just a story?', 'I remember our conversation. What changed?']
  },
  broker: {
    morning: ['Morning. Read the destination before the number beside it.', 'A new watch. The old invoices remain.'],
    afternoon: ['There’s room at the table. The terms are still on the page.', 'I can spare a minute. What are you offering?'],
    evening: ['Closing the accounts. Some promises don’t add up.', 'The day gets shorter. A debt doesn’t.'],
    night: ['Late business. Let’s keep the terms clear.', 'After hours. People tend to skip the small print now. Don’t.'],
    familiar: ['A familiar face is worth a little time. Go on.', 'Back to discuss a promise, or make another one?']
  },
  bartender: {
    morning: ['Early cup? Pick a seat that doesn’t rock.', 'Morning regulars like their quiet. I understand the feeling.'],
    afternoon: ['Make yourself comfortable. The corridor can wait.', 'There’s always room for another story.'],
    evening: ['Evening watch brings the best stories and the worst explanations.', 'Find a seat. Everybody’s carrying something by this hour.'],
    night: ['Quietly now. Some of the regulars are halfway asleep.', 'Late cup? Nobody here needs a reason.'],
    familiar: ['Your usual corner’s wherever you can find a seat.', 'Back through. I wondered how the road was treating you.']
  },
  merchant: {
    morning: ['Counting stock. You’d be surprised what survives a busy watch.', 'Morning. Need a part or an opinion?'],
    afternoon: ['Have a look. Ask before lifting the heavy things.', 'I keep the useful bits where people can reach them.'],
    evening: ['Evening inventory. Every empty shelf has a story.', 'Nearly through the count. What are you after?'],
    night: ['Late supplies? Let’s see what you need.', 'At this hour, everyone wants the part they meant to buy earlier.'],
    familiar: ['Good to see a repeat customer still walking.', 'Back again. What’s missing this time?']
  },
  archivist: {
    morning: ['Morning. Leave the order of those records as you found it.', 'A new watch doesn’t make the old questions go away.'],
    afternoon: ['One moment. I want to finish this line before I lose it.', 'A record is only useful if someone can find it again.'],
    evening: ['Putting the records back is half the work.', 'Evening. You have the look of someone carrying a question.'],
    night: ['Night watch is good for listening. Fewer people trying to answer.', 'Lower your voice a little. This place keeps its own quiet.'],
    familiar: ['A familiar face. What have you learned since last time?', 'You’re back. The unanswered questions have kept your place.']
  },
  warden: {
    morning: ['Morning watch. Keep the approach clear.', 'Just checking the route. What do you need?'],
    afternoon: ['Weapons cold in the harbor. Otherwise, take your time.', 'All right. I can stop a moment.'],
    evening: ['Handover soon. I’d like to leave a quiet port behind me.', 'Evening. Anything I should put in the watch notes?'],
    night: ['Night watch. Keep the noise down around the sleeping berths.', 'Quiet shift, if people let it be.'],
    familiar: ['I recognize you. Everything all right?', 'Back in port. Anything the watch should know?']
  },
  default: {
    morning: ['Morning. Getting the day in order?', 'Another watch. I’m finding my rhythm.'],
    afternoon: ['I can stop a moment. How are you doing?', 'Give me a moment. There—what do you need?'],
    evening: ['Evening. Nearly time to put things away.', 'Long day. Are you staying a while?'],
    night: ['Keep your voice down. People are trying to sleep.', 'Still awake too? I can spare a minute.'],
    familiar: ['There you are. Good to recognize someone.', 'Back again. How’s it been since we spoke?']
  }
};

const ACTIVE_LINES = {
  'last_fare:booking': 'One seat for Nessa. She needs a captain, not another person deciding whether she deserves one.',
  'last_fare:privacy': 'The destination request is still here. I haven’t filled it in.',
  'last_fare:arrival': 'Bring Nessa to the clinic. We can discuss the paperwork afterward.',
  'nine_knocks:request': 'It’s my handwriting on that report. That’s the part I can’t explain.',
  'nine_knocks:account': 'You found something at the shelter? Tell me exactly what you saw.',
  'nine_knocks:disposition': 'You’ve heard the recorder. I need to know what you think should happen to it.',
  'salt_debt:favor': 'The crate goes to Morrow. Read the paperwork before you promise me anything.',
  'salt_debt:distribution': 'The medicine is here. Now we decide who gets to call it theirs.',
  'salt_debt:reckoning': 'We need to talk about that delivery. Sit down.',
  'paper_bounty:warrant': 'Rook is a person on a warrant. Keep both parts in mind.',
  'paper_bounty:judgment': 'Put the evidence on the table. We should decide what goes into the file.',
  'water_dividend:proposal': 'I can fix the bypass. The terms attached to the money are harder.',
  'borrowed_voice:reply': 'There’s another call. Before you ask: yes, I checked the receiver.',
  'borrowed_voice:listen': 'Play the reply once. Then let’s listen to what happens between the words.',
  'first_names:invitation': 'An invitation can include limits. I need you to hear both.',
  'lost_ticket:ticket': 'Someone’s asleep by the departures. We should keep our voices down.',
  'quiet_meal:meal': 'One bowl left. Two people still hungry. Help me think.'
};

const CONSEQUENCES = {
  'len-vale': {
    nessa_protected: 'Nessa’s destination stays out of that file. Thank you for understanding what was at stake.',
    nessa_registered: 'My license is safer. Nessa’s destination is public. I’m still weighing that.',
    nessa_appeal: 'You paid for Nessa to be heard. I remember who makes room for people.'
  },
  'mara-reed': {
    medicine_shared: 'The medicine went to the clinic. The debt didn’t vanish, but neither did the people who needed it.',
    medicine_sold: 'You kept the delivery contract. I’m the one facing the patients who can’t afford it.',
    medicine_bought: 'You paid to release our own medicine. I’m grateful. I hate that you had to.',
    nessa_protected: 'Thank you for leaving Nessa’s destination out of the file.',
    nessa_registered: 'You put Nessa’s destination in the registry. Don’t expect me to be comfortable with that.',
    nessa_appeal: 'You gave Nessa a chance at a hearing. That matters here.'
  },
  'silas-voss': {
    medicine_shared: 'My invoice is still unpaid. Your good reason doesn’t make my supplier disappear.',
    medicine_sold: 'You kept the terms. That makes the next conversation easier.',
    medicine_bought: 'You bought out the claim. Generous. Expensive. I hope you can keep affording your principles.'
  },
  'ada-finch': {
    voices_sealed: 'The recorder is intact. I’m grateful you left room for an answer.',
    voices_cut: 'You silenced the transmitter. I asked for help understanding it.',
    voices_open: 'The voices are public now. I still wonder who should have been asked first.'
  },
  'vey': {
    choral_consent: 'You kept the interval we offered. We remember the restraint.',
    choral_recording_sold: 'You sold words we did not give you. Leave a wider silence between us.',
    choral_recording_returned: 'You returned our voices. You may keep the greeting.'
  }
};

function urgent(game, entity, role) {
  const state = game.state, aboard = ['ship', 'enemy'].includes(state.interior?.kind);
  if (aboard && state.boarding?.phase === 'active') return { context: 'urgent', greeting: 'Keep your head down. We can talk when the deck is clear.', rumor: 'Stay behind cover and keep an escape route open.' };
  if (aboard && state.ship?.damageControl?.sections?.some(section => section.fire > 0)) return { context: 'urgent', greeting: 'There’s fire on this deck. Conversation can wait.', rumor: 'Reach the marked compartment before the fire spreads.' };
  if (aboard && state.ship?.damageControl?.sections?.some(section => section.breach > 0)) return { context: 'urgent', greeting: 'We’re losing air. Find the breach.', rumor: 'Keep clear of the damaged compartment until it’s patched.' };
  if (role === 'medic' && state.person?.health < (state.person.maxHealth || 100) * .45) return { context: 'urgent', greeting: 'Sit down. You’re hurt. Tell me where the pain is worst.', rumor: 'Let’s deal with the injury before the small talk.' };
  if (entity.type === 'crew' && finite(entity.data?.health, 100) < finite(entity.data?.maxHealth, 100) * .4) return { context: 'urgent', greeting: 'I’m hurt, captain. I need the medical station.', rumor: 'I can’t take another watch like this.' };
  return null;
}

function militaryMember(game,entity,role){
 const state=game.state,data=entity.data||{},contract=state.npcContract,crewId=data.crewId;
 const deckCrew=Array.isArray(state.interior?.location?.crew)?state.interior.location.crew:state.crew||[];
 const crew=entity.type==='crew'&&crewId&&deckCrew.find(member=>member?.id===crewId);
 const servingCrew=!!(crew&&contract?.military&&state.interior?.location?.vesselId===contract.vesselId);
 const body=game.system?.bodies?.find(body=>body.id===localBody(game,entity));
 const baseMember=body?.portType==='military'&&['warden','pilot','engineer','medic','dockworker'].includes(role);
 if(!data.militaryRecruiter&&!data.militaryFactionId&&!servingCrew&&!baseMember)return null;
 const factionId=data.militaryFactionId||data.factionId||(servingCrew?contract.military.factionId||militaryMission(contract.military.missionId)?.factionId:body?.portFaction||body?.faction);
 if(!factionId)return null;
 const branchId=data.militaryBranchId||(servingCrew?'navy':null),rank=militaryServiceRank(game);
 const greeting=militaryDialogue(game,{factionId,branchId,role:data.militaryRecruiter?'recruiter':'member',baseText:servingCrew?crew.greeting||data.greeting||'': ''});
 const rumor=!rank.enlisted||rank.factionId!==factionId?'The recruiting desk handles enlistment. Duty clearances are issued to each person.':rank.suspended?'Your duty clearance is suspended until your faction standing recovers.':rank.nextRank===null?'Your service record is current. Every person in a squad keeps their own rank and assigned duties.':`${rank.remaining} more completed ${rank.remaining===1?'assignment':'assignments'} before the next promotion review. Every person in a squad keeps their own rank and assigned duties.`;
 return{context:'military-service',greeting,rumor,militaryRank:rank.factionId===factionId&&rank.enlisted?rank.rank:null};
}

function opening(game, entity) {
  const mission = game.state.openingMission, id = idOf(entity);
  if (!mission || !['kettle:dockworker', 'morrow:courier'].includes(id)) return null;
  if (mission.status === 'completed') {
    if (id === 'kettle:dockworker') return { context: 'consequence', greeting: mission.outcome === 'relay-report' ? 'Relay report’s filed. Good work on the repair.' : mission.branch === 'hardcore' ? 'Nessa’s note is filed. Thanks for making the trip.' : 'The relay’s holding and the ore is logged. You kept your word.', rumor: 'A small job done properly is a good way to become known around here.' };
    if (mission.branch === 'hardcore') return { context: 'consequence', greeting: 'Back from Kettle? I hope that note bought us a quieter next shift.', rumor: 'The passenger service is useful when you’re still earning your own hull.' };
    return null;
  }
  if (mission.status !== 'active') return null;
  const sender = mission.branch === 'hardcore' ? 'morrow:courier' : 'kettle:dockworker';
  if (id === sender && mission.stage === 'meet') return { context: 'mission', greeting: 'Got a moment? A small paid job needs another pair of hands.', rumor: 'The relay’s close by. I’ll mark the one that needs attention.' };
  if (id === sender && mission.stage === 'repair') return { context: 'mission', greeting: 'That marked relay still needs a steady pair of hands.', rumor: 'Match the conductors at the relay. We’ll settle the rest afterward.' };
  if (id === 'kettle:dockworker' && mission.branch === 'regular') return { context: 'mission', greeting: mission.oreMined >= 2 ? 'You’re back. Have you brought the ore in your own hold?' : 'The repair’s done. I still need two fresh ore from the belt beyond the docking lights.', rumor: 'Bring your ship back to this berth before we settle up.' };
  if (id === sender && mission.branch === 'hardcore') return { context: 'mission', greeting: 'The relay’s steady. My note needs to reach Tala on Kettle.', rumor: 'The passenger desk sells passage. Keep enough credits for the fare.' };
  if (id === 'kettle:dockworker' && mission.branch === 'hardcore' && mission.stage === 'return') return { context: 'mission', greeting: 'You’ve come from Morrow? I’m expecting Nessa’s service note.', rumor: 'Show me the note and we can close the job.' };
  return null;
}

function shortAuthored(value, fallback) {
  const clean = text(value, 1000), quote = clean.match(/“([^”]{1,210})”/u)?.[1];
  if (quote) return quote;
  const first = clean.match(/^.{1,230}?[.!?](?:\s|$)/u)?.[0]?.trim();
  return first || (clean.length <= 230 ? clean : fallback);
}

function narrative(game, entity) {
  const id = contactId(entity); if (!id) return null;
  const state = game.state.narrative || {}, records = state.quests || {};
  const relevant = QUEST_THREADS.filter(definition => {
    const record = records[definition.id];
    return record?.status === 'active' && (definition.offeredBy === id || definition.stages[record.stage]?.at?.contactId === id);
  }).sort((a, b) => finite(records[b.id].startedAt) - finite(records[a.id].startedAt));
  const definition = relevant[0], record = definition && records[definition.id], step = definition?.stages[record?.stage];
  if (step?.at?.contactId === id) return { context: 'mission', greeting: ACTIVE_LINES[`${definition.id}:${step.id}`] || shortAuthored(step.responses?.[record.choices?.[step.respondTo]] || step.text, 'You’re here. Tell me where things stand.'), rumor: 'We can talk through it when you’re ready.', missionId: definition.id };
  if (definition) {
    const lines = { 'len-vale': 'Still working on the fare? I’m here when you’re ready.', 'ada-finch': 'Take your time. Bring back what you actually find.', 'silas-voss': 'Our arrangement still stands. Anything about it troubling you?', 'orin-dax': 'Don’t let the fee do your thinking. Check the evidence.', 'mara-reed': 'The job’s still on my mind. Let me know what you find.', 'tiva': 'Listen carefully. Bring back what was said, including the silences.' };
    return { context: 'mission', greeting: lines[id] || 'We still have that matter between us. What have you learned?', rumor: 'No need to rush an answer you’ll have to live with.', missionId: definition.id };
  }
  const memory = state.relations?.[id]?.memories?.at(-1);
  if (memory?.text) {
    const specific = CONSEQUENCES[id];
    // Match a specific response to the remembered choice, not merely any old
    // flag: later, intertwined decisions must remain the latest conversation.
    const remembered = QUEST_THREADS.flatMap(thread => thread.stages.flatMap(stage => stage.options || [])).find(option => option.effects?.memory === memory.text);
    const flag = remembered?.effects?.flags?.find(value => specific?.[value] && has(game.state, `thread:${value}`));
    return { context: 'consequence', greeting: flag ? specific[flag] : text(memory.text), rumor: 'People remember how a promise turns out.' };
  }
  return null;
}

function mainStory(game, entity) {
  const state = game.state, id = idOf(entity), key = entity.data?.storyKey;
  if (id === 'kettle:mechanic') {
    if (has(state, 'jumped_to_vesper')) return { context: 'consequence', greeting: 'Back from your first fold. Tell me how the drive sounded on the other side.', rumor: 'A new route is useful. Getting back from it is the part I care about.' };
    if (game.hasHyperdrive) return { context: 'mission', greeting: 'Fold drive fitted. Check your fuel and choose the crossing before you spool it up.', rumor: 'Keep enough fuel to come back. Curiosity isn’t a reserve tank.' };
    if (has(state, 'census_fragment')) return { context: 'mission', greeting: 'A recent address from Earth? Keep that fragment safe. It deserves a proper reading.', rumor: 'The fold-drive work is in my fitting list when you’re ready.' };
    if (has(state, 'first_job')) return { context: 'consequence', greeting: 'You finished a job. Good. Ships are easier to improve when the credits are your own.', rumor: 'Check the fitting costs against your balance. There’ll always be another upgrade.' };
  }
  if (key === 'listening_house') {
    if (has(state, 'archive_restored')) return { context: 'consequence', greeting: 'We have a reading now. What you do with it matters as much as the signal.', rumor: 'Keep the record intact. An explanation without evidence travels too easily.' };
    if (has(state, 'archive_terminal_repaired')) return { context: 'mission', greeting: 'The array’s stable. Bring that census fragment over; we can read it together.', rumor: 'A repaired receiver is a good beginning. Now we listen.' };
    if (has(state, 'census_fragment')) return { context: 'mission', greeting: 'You brought a fragment. I need the array’s relay stable before I can trust its reading.', rumor: 'The maintenance relay is here in the house.' };
  }
  if (key === 'first_shift' && has(state, 'first_shift_done')) return { context: 'consequence', greeting: 'Your name’s on the departure board now. You earned that first line.', rumor: 'Kettle remembers the people who keep its air running.' };
  if (key === 'three_claims' && has(state, 'alliance_committed')) return { context: 'consequence', greeting: 'Your alliance is on the record. Other ports will read that choice too.', rumor: 'An agreement keeps meaning something after the signing.' };
  if (key === 'open_sky' && has(state, 'council_decision_made')) return { context: 'consequence', greeting: 'The council’s decision is recorded. Living with it is the next part.', rumor: 'Keep asking the people here what they need. A decision isn’t the end of a conversation.' };
  return null;
}

function localNews(game, entity, role) {
  const director = game.worldDirector, bodyId = localBody(game, entity), systemId = entity.data?.systemId || game.state.systemId;
  const incident = director?.events?.find(event => event.systemId === systemId && event.bodyId === bodyId && ['active', 'warning'].includes(event.status));
  if (incident) {
    const lines = {
      outbreak: incident.status === 'warning' ? 'The clinic has issued an isolation notice. Check public services if you can help.' : 'The clinic is dealing with the fever surge. Public services is coordinating help.',
      raid: incident.status === 'warning' ? 'Dispatch is warning the convoy about approaching raiders.' : 'Dispatch has a convoy under attack. The watch is responding outside.',
      rescue: incident.status === 'warning' ? 'Dispatch has a shuttle with failing life support. Rescue crews are preparing.' : 'Rescue crews are bringing shuttle passengers in. The clinic is coordinating arrivals.',
      clash: incident.status === 'warning' ? 'Two patrols are disputing the shipping lane. Dispatch has posted a warning.' : 'The patrol standoff has turned violent. Check the lane report before departing.'
    };
    return { rumor: lines[incident.type] || 'There’s a current notice at public services.', newsContext: 'local-event' };
  }
  const condition = director?.conditions?.[`${systemId}:${bodyId}`];
  if (condition && condition.until > finite(director.time)) return { rumor: shortAuthored(condition.text, 'The port is still dealing with the last incident.'), newsContext: 'local-aftermath' };
  const body = localBody(game, entity), work = game.state.missions?.find(mission => mission.status !== 'completed' && mission.targetBody === body && mission.targetSystem === game.state.systemId);
  if (work && ['dockworker', 'broker', 'mechanic', 'engineer', 'pilot', 'courier'].includes(role)) return { rumor: `You still have “${text(work.title, 90)}” on the local board. Check your log before taking another load.`, newsContext: 'local-job' };
  return null;
}

function relationship(game, entity, known) {
  const relation = game.state.narrative?.relations?.[contactId(entity)], trust = finite(relation?.trust), standing = finite(game.state.rep?.[entity.data?.faction]);
  const label = trust >= 8 ? 'Trusted' : trust >= 3 ? 'Warm' : trust <= -6 ? 'Estranged' : trust <= -2 ? 'Wary' : standing <= -20 ? 'Wary' : standing >= 20 ? 'Welcomed' : known ? 'Familiar' : 'Unacquainted';
  return { label, trust, standing };
}

function routine(entity, role, clock, key) {
  const voice = VOICES[role] || VOICES.default, activity = entity.life?.activity;
  if (activity === 'sleeping') return 'Mm? I was asleep. Give me a moment. What do you need?';
  if (activity === 'eating') return choose(['Just taking a meal break. Pull up a place.', 'Let me finish this mouthful. All right—go on.'], key);
  if (activity === 'resting') return choose(['Off my feet for a moment. You’re welcome to stop.', 'Taking a quiet minute. What brings you over?'], key);
  if (idOf(entity) === 'kettle:mechanic') return choose({ morning: ['Morning. A new watch and the same tray of loose fasteners.'], afternoon: ['I can listen and sort parts. Tell me what’s rattling.'], evening: ['Counting tools before somebody launches with my favorite wrench.'], night: ['Night watch. If your hull is humming in B-flat, I already know the problem.'] }[clock.period] || voice.morning, key);
  if (contactId(entity) === 'len-vale') return clock.period === 'night' ? 'Night watch suits me. Fewer announcements, more time to hear the person at the desk.' : 'I count passengers before fares. Easier to remember what the job is for.';
  if (contactId(entity) === 'mara-reed') return clock.period === 'night' ? 'I should be asleep. One loose fitting always becomes another.' : 'Hand me a moment. I’m keeping track of which parts still fit.';
  if (contactId(entity) === 'silas-voss') return clock.period === 'night' ? 'After hours, captain. We can still talk. We can always talk.' : 'Take a seat. I’d rather hear what you need before quoting a price.';
  if (contactId(entity) === 'ada-finch') return clock.period === 'night' ? 'The ridge looks nearer after dark. I know that’s not a measurement.' : 'One moment. I’m making sure the observation is mine.';
  if (contactId(entity) === 'orin-dax') return clock.period === 'night' ? 'Cold breakfast, late watch. The paperwork doesn’t mind.' : 'Read a warrant all the way down. The interesting part is often what’s missing.';
  if (contactId(entity) === 'nadi-vale') return clock.period === 'night' ? 'If you’re hungry, say so before I put the pot away.' : 'Talk while I work. A kitchen can’t pause for every conversation.';
  if (contactId(entity) === 'tiva') return clock.period === 'night' ? 'The receivers have their own night voices. I’m listening.' : 'Give the recording a moment to end. Then you have my attention.';
  if (contactId(entity) === 'doctor-sef') return clock.period === 'night' ? 'The paper book doesn’t close the ward. What do you need?' : 'Treatment first. We can discuss which form you belong on afterward.';
  if (contactId(entity) === 'mother-rusk') return clock.period === 'night' ? 'Late visitor. My household keeps complicated hours.' : 'Every name in this market means something to me. What brings yours here?';
  if (contactId(entity) === 'commissioner-ryn') return clock.period === 'night' ? 'After hours. We can talk, provided we keep the record straight.' : 'The agreement is available to read. I recommend doing that before arguing with it.';
  if (contactId(entity) === 'elet') return clock.period === 'night' ? 'Night here. The clocks don’t all agree, but I’m calling it night.' : 'I check the clock before the message. It matters here.';
  if (contactId(entity) === 'ferryman') return clock.period === 'night' ? 'Late passage usually carries a longer story.' : 'Everyone wants a route. Few start by telling me what they’re leaving.';
  if (entity.species === 'choral' || entity.data?.species === 'choral') return clock.period === 'night' ? 'This is our quiet interval. You may share it.' : 'You have arrived. Leave room for us to answer.';
  return choose(voice[clock.period] || voice.morning, key);
}

/** Caller owns proximity validation. Reading dialogue never changes reputation. */
export function conversation(game, entity = {}, { record = true, time, storyTime } = {}) {
  const state = game.state, id = idOf(entity), at = clamp(finite(time, finite(state.stats?.time)), 0, 1e12);
  if (entity.data?.automated) {
    const greetings = { passage: 'Passenger dispatch. Review destinations, fares, and care needs before accepting.', faction: 'Affiliation records. Review your standing and the terms of a pledge.', public: 'Public services. Clinic shifts, care flights, patrols, and enlistment.' };
    return { greeting: greetings[entity.data.serviceDesk] || shortAuthored(entity.text, 'Service terminal ready.'), rumor: '', context: 'service', newsContext: 'service', activity: 'Service terminal', relationship: '', trust: 0, standing: 0, known: false, name: text(entity.name, 80), role: text(entity.data?.roleLabel || entity.role || 'Services', 80), clock: npcClock(at, localBody(game, entity) || 'port').text };
  }
  const memory = normalizeConversations(state.conversations), previous = memory.people.find(person => person.id === id);
  const known = !!previous || !!state.narrative?.met?.includes(contactId(entity)), role = roleOf(entity), clock = npcClock(at, localBody(game, entity) || 'port');
  const species=normalizeSpecies(entity.species??entity.data?.species);
  const relation = relationship(game, entity, known), key = `${state.seed}:${id}:${clock.day}:${clock.period}`;
  const activity = text(entity.life?.label || (entity.data?.automated ? 'Service terminal' : ''), 40), data = DIALOGUE[role] || DIALOGUE.refugee;
  const social = socialConversation(state, entity, at, { record, storyTime });
  const news = entity.data?.socialOnly ? null : localNews(game, entity, role);
  let response = urgent(game, entity, role) || militaryMember(game,entity,role) || opening(game, entity) || narrative(game, entity) || mainStory(game, entity) || localSiteResponse(state,entity) || social;
  if (!response && relation.trust <= -2) response = { context: 'relationship', greeting: relation.trust <= -6 ? 'I remember what happened. Keep this conversation to what you need.' : 'We can talk. That doesn’t mean I’m easy with how things turned out.' };
  if (!response && relation.trust >= 3) response = { context: 'relationship', greeting: relation.trust >= 8 ? 'You’ve earned my trust. Sit with me a moment.' : 'Good to see you. I haven’t forgotten what you did.' };
  if (!response && relation.standing <= -20) response = { context: 'relationship', greeting: role === 'medic' ? 'I know where you stand with the port. If you need care, say so.' : 'Your reputation gets here before you do. What do you need?' };
  if (!response && relation.standing >= 20) response = { context: 'relationship', greeting: 'Your work for our people is known here. You’re welcome to stop a moment.' };
  if (!response && previous && at >= previous.lastAt && at - previous.lastAt < REMEMBER_AFTER) response = { context: 'familiar', greeting: 'Still here. Was there something else?' };
  if (!response && previous && hash(`${key}:known`) % 3 === 0 && !['sleeping', 'eating', 'resting'].includes(entity.life?.activity)) response = { context: 'familiar', greeting: choose((VOICES[role] || VOICES.default).familiar, key) };
  if (!response && !known && species!=='human' && !['sleeping','eating','resting'].includes(entity.life?.activity) && entity.text) response={context:'introduction',greeting:shortAuthored(entity.text,'Hello. What brings you here?')};
  if (!response) response = { context: 'routine', greeting: routine(entity, role, clock, key) };
  const rumors = (Array.isArray(entity.data?.rumors) ? entity.data.rumors : data.rumors || []).filter(value => typeof value === 'string' && value.trim());
  const rumor = response.context === 'urgent' ? response.rumor : news?.rumor || response.rumor || shortAuthored(choose(rumors.length ? rumors : ['People have their own lives between arrivals. Take your time finding your way.'], key), 'It’s been quiet here. I don’t mind that.');
  const result = { ...response, greeting: text(response.greeting), rumor: text(rumor), newsContext: news?.newsContext || response.context, activity, relationship: social?.relationship || relation.label, trust: relation.trust, standing: relation.standing, known, name: text(entity.name, 80), role: text(entity.data?.roleLabel || entity.role || role, 80), clock: clock.text, localHour: clock.hour, species, speciesLabel:speciesLabel(species), background:species!=='human'&&response.context!=='urgent'?text(speciesBackground(species,entity.data?.crewId||entity.data?.guestId||id,localBody(game,entity))):'' };
  if (record && id && !entity.data?.automated && !['__proto__', 'prototype', 'constructor'].includes(id)) {
    if (!previous) memory.people.push({ id, count: 1, lastAt: at, context: result.context });
    else if (at >= previous.lastAt + REMEMBER_AFTER || at < previous.lastAt) { previous.count = Math.min(99, previous.count + 1); previous.lastAt = at; previous.context = result.context; }
    state.conversations = { version: 1, people: memory.people.sort((a, b) => a.lastAt - b.lastAt).slice(-CONVERSATION_LIMIT) };
  }
  return result;
}
