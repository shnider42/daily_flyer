/** Additive, authored communities. Append bodies and residents; never replace old IDs. */
const freeze = value => {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
};
const record = (id, name, text, x = 12, y = 8) => ({ id, name, text, x, y });
const resident = (id, name, species, role, roleLabel, tileX, tileY, text, rumors, extra = {}) => ({ id, name, species, role, roleLabel, tileX, tileY, text, rumors, ...extra });

// Two additions among hundreds of human-majority worlds. The homeworld is not
// synonymous with a faction: these communities keep their own civic customs.
export const SPECIES_HOMEWORLDS = freeze([
  { systemId: 'kindred', body: {
    id: 'avel', name: 'Avel', kind: 'planet', biome: 'ocean', homeworldOf: 'vaeli', population: 'vaeli-home', culture: 'avel-tidewards', civilianSettlement: true,
    lore: 'Vaeli tideward towns rise between warm shoals. Most residents here are Vaeli; human neighborhoods and visiting crews share the dry quays. The local councils joined Kindred’s passage agreement without surrendering their own harbor laws.'
  } },
  { systemId: 'brassfall', body: {
    id: 'hadrun', name: 'Hadrun', kind: 'planet', biome: 'desert', homeworldOf: 'keth', population: 'keth-home', culture: 'hadrun-courtyards', civilianSettlement: true,
    lore: 'The Keth homeworld holds cool courtyard cities beneath high desert walls. Human workshops cluster near the landing field. Combine claims cover the orbital freight road; the courtyard councils contest every attempt to extend them through a family door.'
  } }
]);

export const SPECIES_DISTRICT_NAMES = freeze({
  avel: ['Dry Quay', 'Returning Tide', 'Towel Market', 'Warm Shoals'],
  hadrun: ['Landing Court', 'Shade Walk', 'Repair Steps', 'Long Wall']
});

export const SPECIES_DISTRICT_RESIDENTS = freeze({
  avel: [
    resident('quay-host', 'Sae Meral', 'vaeli', 'settler', 'Quay host', 70, 48,
      'The blue towels are for anyone. Put a used one in the basket, even if you only dried your hands.',
      ['The threshold house is testing a route both wet and dry visitors can use. The old route works perfectly for exactly half my neighbors.', 'My brother lives on a dry station. He has stronger opinions about the humidity here than any visitor does.'], { color: '#84b6ad' }),
    resident('landing-baker', 'Mina Renn', 'human', 'merchant', 'Quayside baker', 79, 52,
      'I was born two streets inland. People still ask me whether I find the weather strange.',
      ['I make two doughs. The recipe cards are about allergies, not citizenship.', 'The morning ferry is full of school bags. People forget how ordinary another world can be.'], { color: '#c0a786' })
  ],
  hadrun: [
    resident('court-surveyor', 'Eska Reth', 'keth', 'scientist', 'Courtyard surveyor', 70, 48,
      'The old wall has moved three fingers since my last survey. My neighbor calls that tradition. I call it a measurement.',
      ['The repair house keeps a plate from every wall it has replaced. Keeping the mistake and repeating it are different things.', 'A freight charter cannot own the shade. We have been explaining that for twelve hearings.'], { color: '#c5a477' }),
    resident('stair-courier', 'Neri Leth', 'oru', 'courier', 'Local parcel runner', 79, 52,
      'The lifts take longer than the stairs. I have finished counting how often people tell me that is impossible.',
      ['I rent a room here. It took a year before anyone stopped recommending inns to me.', 'A captain once asked me for an ancient Oru proverb. I gave her my grandmother’s advice about checking the fare.'], { color: '#b8a7cb' })
  ],
  'kindred-landing': [
    resident('humidity-technician', 'Ilen Vesh', 'vaeli', 'engineer', 'Habitat technician', 78, 52,
      'This filter is for the children’s sleeping room. The expensive one can wait until after they stop coughing.',
      ['My parents stayed on Avel. I like living somewhere the furniture does not have to float.', 'Half our neighbors brought their own tools. The other half know who to borrow from.'], { color: '#83b5b7' })
  ],
  'brassfall-works': [
    resident('shift-musician', 'Tenn Orek', 'keth', 'dockworker', 'Off-watch freight hand', 78, 52,
      'No, the case isn’t a tool box. My instrument looks unfinished because I am still changing it.',
      ['I work the freight road. My sister back on Hadrun keeps asking when I will find something steady.', 'The strike kitchen asked for music. I asked whether the cooks wanted music. We are still negotiating.'], { color: '#bba080' })
  ],
  noonless: [
    resident('warm-window', 'Sei Aven', 'oru', 'settler', 'Window repairer', 78, 52,
      'Someone paid me to leave the scratches in this pane. They mark where their children used to stand.',
      ['My oldest family address is outside your chart. This one is on the second floor, warm side.', 'The observatory offered me a room with a better view. I would miss the people across this alley.'], { color: '#b3b5d0' })
  ]
});

export const SPECIES_PLANET_PLACES = freeze({
  avel: [{
    id: 'threshold-house', name: 'The Common Threshold', kind: 'clinic', tileX: 73, tileY: 46, culture: 'avel-tidewards',
    summary: 'A public rest house has two old entrances and one unfinished ramp.',
    story: 'A damp sitting room opens onto a dry waiting room. The doorway between them is wider than either entrance from the street. A borrowed chair holds the plans for a new threshold.',
    hostile: false, caches: [],
    records: [
      record('marks', 'Two sets of water marks', 'One line marks a comfortable water level. Another marks where a human neighbor’s wheelchair motor stopped working. A third line has been drawn beside both: NEW RAMP HEIGHT.'),
      record('costs', 'The repair estimate', 'The fund can cover a shared ramp now, or a second accessible washroom. An unsigned note says: THE PERSON WHO ASKED FOR THE WASHROOM IS NOT WRONG.', 33, 9)
    ],
    choices: [{ id: 'access-plan', name: 'The visitor’s route test', x: 33, y: 24,
      text: 'The builders asked visiting captains which repair would make this place easier to use. Both plans are within the same small budget.',
      options: [
        { id: 'ramp', label: 'Recommend the shared ramp', text: 'You mark the route between the rooms. The builders file your recommendation beside those of local residents. The washroom request stays on the board.' },
        { id: 'washroom', label: 'Recommend the accessible washroom', text: 'You mark the washroom plan. The builders file your recommendation beside those of local residents. The unfinished ramp stays in the next estimate.' }
      ]
    }]
  }],
  hadrun: [{
    id: 'repair-court', name: 'The House of Repairs', kind: 'market', tileX: 73, tileY: 46, culture: 'hadrun-courtyards',
    summary: 'A shared workshop displays broken pieces beside the objects they came from.',
    story: 'Cool air moves through a shaded court. Every repaired object has a small plate recording who did the work. A drinking fountain is silent; its original builder’s plate lies beside a new pump.',
    hostile: false, caches: [],
    records: [
      record('plates', 'A rack of repair plates', 'The plates name skilled work and failed attempts in the same size of lettering. One reads: THIS PATCH LASTED THREE DAYS. THANK YOU FOR TRYING.'),
      record('pump', 'Two pump estimates', 'A standard orbital pump will fit if the stone basin is cut. Restoring the old pump keeps the basin intact, but the workshop cannot promise it will survive the next hot season.', 33, 9)
    ],
    choices: [{ id: 'fountain-advice', name: 'The fountain repair book', x: 33, y: 24,
      text: 'The neighbors are collecting advice before spending the courtyard repair fund. The old basin and reliable drinking water both matter to them.',
      options: [
        { id: 'replace', label: 'Recommend the dependable new pump', text: 'You record the case for dependable water. A stoneworker adds a sketch showing how much of the old basin could be kept. The neighbors will make the final decision.' },
        { id: 'restore', label: 'Recommend one more restoration', text: 'You record the case for keeping the basin whole. A repairer adds the cost of a backup water tank. The neighbors will make the final decision.' }
      ]
    }]
  }]
});

export const SPECIES_INTERIOR_RESIDENTS = freeze({
  'avel:threshold-house': [
    { id: 'room-steward', name: 'Nai Serin', species: 'vaeli', role: 'medic', roleLabel: 'Rest-house steward', x: 13, y: 16, color: '#9ec8bc',
      text: 'The room you need is the room you may use. Tell me if our signs make that harder to understand.',
      rumors: ['My aunt dislikes every change we have made. She also brings towels every morning.', 'A captain from a dry world helped design that seat. It became the favorite seat in the wet room.'],
      data: { localSiteResponses: [{ bodyId: 'avel', siteId: 'threshold-house', choiceId: 'access-plan', options: {
        ramp: { greeting: 'I read your recommendation for the shared ramp. You explained who the old step leaves outside. That belongs in the discussion.' },
        washroom: { greeting: 'I read your recommendation for the washroom. People have been quietly planning their visits around that problem. Thank you for putting it on the page.' }
      } }] } },
    { id: 'ramp-builder', name: 'Davi Voss', species: 'human', role: 'engineer', roleLabel: 'Local access builder', x: 23, y: 17, color: '#b8aa8b',
      text: 'I built the old step. Nobody complained until the wrong person tried to use it. That was a bad way to test a step.',
      rumors: ['We have two good plans and money for one. The visitors’ book gives us more eyes on the problem.'] }
  ],
  'hadrun:repair-court': [
    { id: 'plate-keeper', name: 'Hessa Senn', species: 'keth', role: 'mechanic', roleLabel: 'Workshop keeper', x: 13, y: 16, color: '#c4a57e',
      text: 'The broken pieces stay until the owner is ready to let them go. Space is becoming a practical objection to a generous rule.',
      rumors: ['My nephew wants to build things that have never been broken. I hope he gets to.', 'We disagree about the fountain. Everyone agrees that somebody has to carry water while we disagree.'],
      data: { localSiteResponses: [{ bodyId: 'hadrun', siteId: 'repair-court', choiceId: 'fountain-advice', options: {
        replace: { greeting: 'Your note makes a fair case for the new pump. Reliable water belongs in the repair book alongside everything we hope to preserve.' },
        restore: { greeting: 'Your note makes a fair case for another restoration. I am glad you read the old plate first. We still need to agree how to keep water running if it fails.' }
      } }] } },
    { id: 'pump-customer', name: 'Tala Ames', species: 'human', role: 'settler', roleLabel: 'Courtyard resident', x: 23, y: 17, color: '#9fb4bb',
      text: 'My grandmother helped cut that basin. I want to keep it. I also want not to carry two buckets up those stairs.',
      rumors: ['The repair plates record the work. The gossip records everything else.'] }
  ]
});
