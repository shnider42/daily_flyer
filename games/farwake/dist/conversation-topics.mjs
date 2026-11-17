/** Optional, concrete conversation topics. These explain existing actions; they
 * never create a job, claim a repair happened, or move a captain's progress. */
import { localAftermathTopic } from './local-campaigns.mjs';
import { frontierConversationTopic } from './frontier-bulletins.mjs';
const topic = (id, label, text) => ({ id, label, text });
const ROLE_TOPICS = {
  mechanic: [
    topic('fitting', 'How do ship upgrades work?', 'Open the shipyard’s upgrade list and check the cost and requirements of the part you want. Credits and ore are separate costs. A larger hull can wait; fit the equipment that solves your current problem.'),
    topic('repair', 'What should I check before leaving?', 'Check hull, fuel and reactor energy before launch. A shield can recover, but damaged hull needs repair. Leave yourself enough fuel for the return trip before spending everything on a new fitting.')
  ],
  engineer: [
    topic('field-tools', 'What do I need for field repairs?', 'At Floodworks 6 on Orchard Nine in Brindle, the intake workshop has a field cutter and a portable power bridge. Take the tools before trying the marked service seams or isolated pump supply. The field notebook records the next physical task.'),
    topic('damage-control', 'What does an engineer do aboard ship?', 'Watch the compartments, not just the overall hull reading. Fire and breaches need attention where they are happening. Use the engineering station for hull repairs and the marked damage-control points for local trouble.')
  ],
  dockworker: [
    topic('local-work', 'Where can I earn my first credits?', 'Check the local job board for repair, delivery and survey work. Read the destination before accepting. A job in this system can pay toward upgrades without needing a fold drive first.'),
    topic('cargo', 'What should I check before taking freight?', 'Check the room in your hold and the destination on the contract. Your log keeps the accepted job and its next step. Finish a load you can carry before taking on another promise.')
  ],
  broker: [
    topic('job-terms', 'How do I choose a contract?', 'Compare the destination, cargo requirement and reward before accepting. A high fee is not useful if you cannot reach the destination. Your log keeps the terms after you leave this desk.'),
    topic('stories', 'Where do I find longer work?', 'The Stories page in your notebook holds work with several steps and named people. Read the lead, track the next destination, and return to the people involved after making a decision. It is separate from the ordinary job board.')
  ],
  merchant: [
    topic('supplies', 'What is worth keeping in the hold?', 'Ore is used for ship upgrades as well as trade. Check your next fitting’s requirements before selling it all. Keep enough credits for fuel and repairs instead of filling every spare space with goods.'),
    topic('trade', 'How do I plan a delivery?', 'Accept a contract you have room for, then check its named destination in your log. Cargo does not travel with a passenger-ferry ticket; you need to bring the ship carrying it.')
  ],
  pilot: [
    topic('arrival', 'How do I dock and get back aboard?', 'Approach a landable destination slowly and use the docking action when it is in range. On foot, the ship marker or dock airlock is your way back. A ship’s helm gives you flight control; leaving the helm puts you on its deck.'),
    topic('fold-travel', 'How do I choose a fold route?', 'Use the galaxy chart to select a system and read its distance and fuel cost. The chart tells you whether your drive can reach it. A destination beyond your range needs a nearer stop or a better drive.')
  ],
  courier: [
    topic('travel', 'Can I travel without my own ship?', 'Passenger services at inhabited ports sell passage. The ticket moves you; it does not move a ship or freight left behind. Check the destination and fare before booking.'),
    topic('route', 'How do you keep the route straight?', 'I read the destination before I set off and check it again on arrival. You can mark your current job in the log. If the marker is in another system, the galaxy chart is the next place to check.')
  ],
  medic: [
    topic('care', 'Where do I go when I am hurt?', 'Visit the medic or a medical station for treatment. Your captain’s health and the ship’s hull are different problems. A repaired ship will not heal an injured person.'),
    topic('medical-work', 'How do I start medical work?', 'Visit a public-services desk and look at the medical professions. Read the patient and destination requirements before taking a shift. Transport work needs enough room for the people you promise to carry.')
  ],
  scientist: [
    topic('evidence', 'How do I follow an investigation?', 'Keep the observation and your explanation separate. Your story notebook records the current task and the person or object involved. Visit that target before trying to advance the investigation.'),
    topic('exploration', 'What should I look for on a planet?', 'Check the local map for entrances, named people and marked objects. Some places have records or repairs rather than a fight. A locked route may need a tool or an action elsewhere in the same site.')
  ],
  archivist: [
    topic('evidence', 'How do I follow a story?', 'Open the story in your notebook and read its current objective. Mark the named contact or object, then go there. Accepting a lead begins the record; it does not complete the task.'),
    topic('earth', 'Where does the Earth investigation begin?', 'Earth: The Long Silence is listed with the campaigns in your story notebook. It follows the rescue and investigation trail alongside the original Earth journey. Read each operation’s requirements before travelling.')
  ],
  warden: [
    topic('boarding', 'How do I board a disabled ship?', 'When a disabled ship is close enough, use Boarding & crew to establish the boarding action. People aboard the assisting ship can use its airlock once the boarding connection is available. Keep an eye on the other ship’s crew.'),
    topic('service', 'Where can I join a service?', 'Use the public-services or recruiting desk to review the available duties. Each captain keeps their own service record. A teammate’s promotion does not give everyone the same clearance.')
  ],
  salvager: [
    topic('boarding', 'What comes after disabling a ship?', 'Get close enough to inspect Boarding & crew, then use the available boarding action. Disabling the hull is only the approach; you still have to deal with the people aboard.'),
    topic('mining', 'How do I get useful ore?', 'Work a nearby asteroid with the mining beam and watch the room left in your hold. Ore is needed for fittings as well as trade. Keep the amount required by your next upgrade before selling the rest.')
  ],
  governor: [
    topic('community-work', 'Where can I help here?', 'The public-services desk lists local duties. The story notebook keeps longer commitments with named people. Pick one you can finish, and read what the next step actually asks you to do.'),
    topic('standing', 'What changes a faction’s opinion?', 'Work and recorded choices can change your standing. The faction page shows where you stand and any pledge you have made. Read the consequences of a decision before choosing it.')
  ],
  refugee: [
    topic('passage', 'Where can I find passage?', 'The passenger-services desk lists available travel. Check the price and destination first. You can travel without owning a hull, but anything left aboard another ship stays with that ship.'),
    topic('finding-work', 'Where would you look for work?', 'I would start with the local job board or public-services desk. The story notebook also has leads you can read before committing. Check the requirements; being willing is not the same as having the right equipment.')
  ],
  bartender: [
    topic('local-people', 'Where do people gather?', 'I would start with the people already here. Some have work, some have a story, and some are just taking a break. The people page in your notebook remembers named contacts you have met.'),
    topic('local-work', 'Know where I can find work?', 'The job board is for paid contracts. Public services has profession work, and the story notebook keeps the longer personal matters. Read the destination before saying yes.')
  ]
};

// These are conversations about the people already in the world, not hints
// about unrevealed quests. Keep one direct help topic beside each person's
// own concern, rather than giving every contact the same service manual.
const PEOPLE = {
  'kettle:mechanic': { helpRole: 'mechanic', subject: topic('iona-tools', 'Why do you count the tools yourself?', 'Because somebody always borrows a wrench just before departure. I want their ship to leave in good order. I would also like my wrench back. Both things can be true.') },
  'len-vale': { helpRole: 'courier', subject: topic('len-night-watch', 'Why the night watch?', 'Fewer announcements. I can hear what someone is actually asking for. People come to this desk with a destination ready, then stand over the kettle and admit they are not sure they want to go.') },
  'mara-reed': { helpRole: 'engineer', subject: topic('mara-pump-table', 'You keep a pump on a folding table?', 'It is the table I have. I lay the parts out in order so I can put it back without buying anything twice. People need that water. I would rather spend their money on the part than on a nicer workshop.') },
  'ada-finch': { helpRole: 'scientist', subject: topic('ada-weather', 'What do you like about watching the weather?', 'It makes me go outside and look. A reading can seem perfectly reasonable until you stand beneath the sky it describes. I still check the ridge myself, even when the instruments agree.') },
  'silas-voss': { helpRole: 'broker', subject: topic('silas-first-cup', 'Why do you buy the first cup?', 'Because I want you to sit down before we discuss money. It helps to know what someone needs. You are welcome to decide that is kindness, good business, or both. The cup does not commit you to anything.') },
  'orin-dax': { helpRole: 'warden', subject: topic('orin-breakfast', 'Does your breakfast ever stay warm?', 'Not often. I start reading a warrant and find something I want to check. I could eat first, but then I would have to sit there wondering about it. Cold food is the easier irritation.') },
  'nadi-vale': { helpRole: 'bartender', subject: topic('nadi-kitchen', 'How do you manage the kitchen and the accounts?', 'Badly, on some days. Someone needs a bowl while someone else wants to explain a grain price. I keep the pot going and make them explain it where the people eating can hear.') },
  'doctor-sef': { helpRole: 'medic', subject: topic('sef-paper-book', 'Why keep the paper book?', 'The terminal can reject a citizenship record. The person is still standing in front of me. I write their name here so the next clinician knows who we treated. It is slower than a working terminal. We do not have one of those.') },
  'tiva': { helpRole: 'archivist', subject: topic('tiva-listening', 'What do you listen for between the words?', 'Whether someone was interrupted. Whether they had time to answer. A transcript can make a hesitant conversation look like an agreement. I keep the pauses so the next listener can hear the difference.') },
  'commissioner-ryn': { helpRole: 'broker', subject: topic('ryn-agreements', 'Why keep the original agreements?', 'Because people quote whichever version helps them. I want the dates and signatures in front of us. It does not make the disagreement pleasant, but at least we can point to the same page.') },
  'ferryman': { helpRole: 'courier', subject: topic('ferryman-name', 'You call yourself the Ferryman without a boat?', 'Boats have owners, repair bills and places they cannot go. I work with people who already have boats. The name tells you what I arrange. You should still ask what a passage will cost you.') },
  'vey': { helpRole: 'archivist', subject: topic('vey-pauses', 'What should I do when the translator disagrees?', 'Tell me it has disagreed. Then wait while we try again. A wrong greeting is usually repairable. Pretending you understood can make the rest of the conversation very difficult.') },
  'elet': { helpRole: 'scientist', subject: topic('elet-clocks', 'Why keep clocks that disagree?', 'So I cannot forget to ask which clock a report used. I write it beside every observation. I would prefer one tidy time on the wall, but I would trust my records less.') },
  'mother-rusk': { helpRole: 'merchant', subject: topic('rusk-names', 'You know everyone in this market?', 'I know who has a birthday coming and who has missed a payment. People usually want me to forget one of those. They are less pleased when I forget the other.') }
};

const PLACES = {
  kettle: topic('place-kettle', 'What can I do at Kettle?', 'Kettle is the starting port in Hearth. You can find ship fittings, local jobs, passenger services and story contacts here. Morrow and Tinbell are in the same system, so reaching them does not require a fold drive.'),
  morrow: topic('place-morrow', 'What can I do on Morrow?', 'Morrow is in Hearth, the same system as Kettle. Check the clinic, passenger services and the people marked on the local map. Keep track of which port your ship is actually docked at before booking passage.'),
  glimmer: topic('place-glimmer', 'Where are the games on Glimmer?', 'Glimmer is the city world in Voltage. Look for marked venues and tables on the local map. Walk to the actual table to play; each game explains its own stake and controls before you commit.'),
  listening: topic('place-listening', 'What is Listening House for?', 'Listening House is on Vesper. Its archive and maintenance relay are part of the Earth investigation. Check your current story step before working on the relay or returning to the archivist.')
};

export function conversationTopics(game, entity, role, response = {}) {
  if (response.context === 'urgent' || entity.data?.automated) return [];
  const data = entity.data || {}, state = game.state;
  if (response.context === 'local-expedition') return response.rumor ? [topic('local-expedition', 'What is happening here?', response.rumor)] : [];
  if (data.socialOnly || data.techLevel === 'preflight' || data.culture === 'reedbound') {
    // A quiet social place keeps its own subject. Industrial advice would make
    // distinct cultures sound like another spaceport service desk.
    return response.rumor ? [topic('local-life', data.techLevel === 'preflight' || data.culture === 'reedbound' ? 'How do things work here?' : 'Tell me about life here', response.rumor)] : [];
  }
  const personId = data.contactId || String(entity.id || '').replace(/^quest:/, '');
  const person = PEOPLE[personId], help = ROLE_TOPICS[person?.helpRole || role] || ROLE_TOPICS.refugee;
  const topics = person ? [person.subject, help[0]] : [...help];
  if (['recovery', 'homecoming'].includes(response.context) && response.rumor) topics.unshift(topic('voyage-recovery', response.updateLabel || 'About what happened', response.rumor));
  const aftermath = localAftermathTopic(game, personId); if (aftermath) topics.unshift(aftermath);
  const currentBody = state.exploration?.bodyId || state.interior?.location?.parentId || state.locationId;
  const bodyId = data.homeLocationId || data.bodyId || currentBody;
  if (bodyId === currentBody && (!data.systemId || data.systemId === state.systemId) && PLACES[bodyId]) topics.push(PLACES[bodyId]);
  const bulletin = frontierConversationTopic(game, entity, role); if (bulletin && !person && !aftermath) topics.unshift(bulletin);
  return topics.slice(0, 3).map(value => ({ ...value }));
}
