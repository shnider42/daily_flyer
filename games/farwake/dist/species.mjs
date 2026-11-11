/**
 * People are not factions, professions or encounter dispositions.
 * Keep species identity in its own deterministic stream so adding a population
 * never consumes a world, combat, loot or incident random number.
 */
const freeze = value => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
const own = (value, key) => value && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, key) ? value[key] : undefined;
const clean = (value, max = 180) => typeof value === 'string' ? value.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max) : '';
const hash = value => { let h = 2166136261; for (const c of value) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

export const SPECIES = freeze({
  human: {
    id: 'human', name: 'Human', plural: 'Humans',
    description: 'Humans make up most of the settled galaxy. A home port says more about someone’s customs than their species does.',
    palette: { skin: '#cba281', shade: '#8f644e', light: '#e1bf9c', eye: '#273842' }
  },
  choral: {
    id: 'choral', name: 'Choral', plural: 'Choral',
    description: 'Four-footed people with branching sensory crests. Communities around Chora are known for records that preserve several speakers’ accounts together.',
    palette: { skin: '#a6c7bb', shade: '#668b8c', light: '#d3e2c7', eye: '#eff1bd' }
  },
  vaeli: {
    id: 'vaeli', name: 'Vaeli', plural: 'Vaeli',
    description: 'Fin-crested people whose skin benefits from humid air. Vaeli communities live in many ports; their wet-room customs vary from household to household.',
    palette: { skin: '#78b5b4', shade: '#467e8d', light: '#badad0', eye: '#f0d29a' }
  },
  keth: {
    id: 'keth', name: 'Keth', plural: 'Keth',
    description: 'Broad-framed people with layered facial plates and fine sensory feelers. Hadrun’s courtyard towns are one part of a much wider Keth diaspora.',
    palette: { skin: '#c49f75', shade: '#816959', light: '#e2c4a0', eye: '#abcbd0' }
  },
  oru: {
    id: 'oru', name: 'Oru', plural: 'Oru',
    description: 'Slender people with tall folded sensory fins. The Oru living along these lanes trace different journeys; their older homelands lie beyond this chart.',
    palette: { skin: '#a9a9cb', shade: '#6b6f9a', light: '#d3cbe5', eye: '#e4d5a3' }
  }
});
export const SPECIES_IDS = Object.freeze(Object.keys(SPECIES));
export const NONHUMAN_SPECIES_IDS = Object.freeze(SPECIES_IDS.filter(id => id !== 'human'));
const WILDLIFE = new Set(['stoneback', 'skitter', 'bellwether']);
export const isPeopleSpecies = value => typeof value === 'string' && Object.hasOwn(SPECIES, value);
export const isWildlifeSpecies = value => typeof value === 'string' && WILDLIFE.has(value);
export const normalizeSpecies = value => isPeopleSpecies(value) ? value : 'human';
export const speciesProfile = value => SPECIES[normalizeSpecies(value)];
export const speciesLabel = value => speciesProfile(value).name;

// A profile describes these particular communities, never an entire faction.
// Rows total exactly 10,000 and are frozen shared constants, not per-frame data.
export const POPULATION_PROFILES = freeze({
  settled: [{ species: 'human', weight: 9200 }, { species: 'choral', weight: 150 }, { species: 'vaeli', weight: 300 }, { species: 'keth', weight: 250 }, { species: 'oru', weight: 100 }],
  hearth: [{ species: 'human', weight: 9800 }, { species: 'vaeli', weight: 80 }, { species: 'keth', weight: 80 }, { species: 'oru', weight: 40 }],
  human: [{ species: 'human', weight: 10000 }],
  'choral-home': [{ species: 'human', weight: 1600 }, { species: 'choral', weight: 8200 }, { species: 'vaeli', weight: 100 }, { species: 'keth', weight: 70 }, { species: 'oru', weight: 30 }],
  'shared-garden': [{ species: 'human', weight: 6500 }, { species: 'choral', weight: 3200 }, { species: 'vaeli', weight: 150 }, { species: 'keth', weight: 100 }, { species: 'oru', weight: 50 }],
  'glass-harbor': [{ species: 'human', weight: 7000 }, { species: 'choral', weight: 2700 }, { species: 'vaeli', weight: 150 }, { species: 'keth', weight: 100 }, { species: 'oru', weight: 50 }],
  'vaeli-home': [{ species: 'human', weight: 1700 }, { species: 'vaeli', weight: 8000 }, { species: 'choral', weight: 100 }, { species: 'keth', weight: 100 }, { species: 'oru', weight: 100 }],
  'keth-home': [{ species: 'human', weight: 1700 }, { species: 'keth', weight: 8000 }, { species: 'choral', weight: 100 }, { species: 'vaeli', weight: 100 }, { species: 'oru', weight: 100 }]
});
const BODY_POPULATION = freeze({
  kettle: 'hearth', morrow: 'hearth', tinbell: 'hearth',
  earth: 'human', luna: 'human', threshold: 'human', reedbank: 'human',
  chora: 'choral-home', 'ochre-garden': 'shared-garden', 'glass-harbor': 'glass-harbor',
  avel: 'vaeli-home', hadrun: 'keth-home'
});
const HOME_SPECIES = freeze({ chora: 'choral', avel: 'vaeli', hadrun: 'keth' });
const HOME_ANCHORS = new Set(['mechanic', 'medic', 'bartender', 'story', 'field-keeper']);

/** Interior visits inherit the parent body's population without changing IDs. */
export function populationProfile(location = {}) {
  const bodyId = typeof location === 'string' ? clean(location) : clean(own(location, 'parentId')) || clean(own(location, 'bodyId')) || clean(own(location, 'id'));
  const profile = Object.hasOwn(BODY_POPULATION, bodyId) ? BODY_POPULATION[bodyId] : null;
  if (profile) return POPULATION_PROFILES[profile];
  if (own(location, 'techLevel') === 'preflight') return POPULATION_PROFILES.human;
  return own(location, 'systemId') === 'hearth' ? POPULATION_PROFILES.hearth : POPULATION_PROFILES.settled;
}

/** Call at creation/projection, never every animation frame. Authored names stay human unless opted in. */
export function chooseNpcSpecies(seed, identityId, location = {}, options = {}) {
  const explicit = own(options, 'explicitSpecies');
  if (explicit !== undefined) return normalizeSpecies(explicit);
  if (own(options, 'authored') === true) return 'human';
  const id = clean(identityId);
  if (!id) return 'human';
  const bodyId = typeof location === 'string' ? clean(location) : clean(own(location, 'id'));
  // A small visible settlement needs a dependable local majority, not merely
  // a favorable population roll. These ordinary town jobs anchor that majority;
  // visitors and interior residents retain their independent/authored identity.
  if (Object.hasOwn(HOME_SPECIES, bodyId) && id.startsWith(`${bodyId}:`) && HOME_ANCHORS.has(id.slice(bodyId.length + 1))) return HOME_SPECIES[bodyId];
  const roll = hash(`${clean(seed, 240)}:people-v1:${id}`) % 10000;
  let edge = 0;
  for (const row of populationProfile(location)) {
    edge += row.weight;
    if (roll < edge) return row.species;
  }
  return 'human';
}

const NAMES = freeze({
  human: { first: ['Ari', 'Nemi', 'Keir', 'Tala', 'Bren', 'Mina', 'Siv', 'Reva', 'Kori', 'Noa', 'Iris', 'Rafi'], last: ['Voss', 'Ames', 'Pell', 'Raye', 'Ives', 'Rill', 'Marr', 'Vale', 'Holt', 'Sorn', 'Reed', 'Aster'] },
  choral: { first: ['Iri', 'Sere', 'Vey', 'Esi', 'Aru', 'Meli', 'Ossa', 'Tere', 'Uma', 'Neri', 'Ari', 'Sela'], last: ['of-the-Low-Tide', 'between-Stones', 'at-the-Window', 'of-Several-Paths', 'under-Rain', 'of-the-Long-Interval', 'beside-the-Root', 'at-First-Light', 'of-the-Quiet-Basin', 'between-Currents', 'of-New-Growth', 'at-the-Gate'] },
  vaeli: { first: ['Sae', 'Ilen', 'Vaen', 'Oli', 'Nai', 'Tavi', 'Mael', 'Seli', 'Rae', 'Eni', 'Vela', 'Suin'], last: ['Avet', 'Luma', 'Serin', 'Nelar', 'Vesh', 'Orien', 'Len', 'Ivara', 'Aren', 'Nesi', 'Tuva', 'Meral'] },
  keth: { first: ['Dren', 'Ketta', 'Odan', 'Vek', 'Tenn', 'Eska', 'Ruk', 'Hessa', 'Kor', 'Mett', 'Gara', 'Ven'], last: ['Hadr', 'Senn', 'Orek', 'Talar', 'Korr', 'Davi', 'Ett', 'Meren', 'Sark', 'Reth', 'Noll', 'Voss'] },
  oru: { first: ['Neri', 'Sei', 'Auren', 'Ilo', 'Ume', 'Veyin', 'Roa', 'Eri', 'Solen', 'Anu', 'Yela', 'Osei'], last: ['Ren', 'Sae', 'Iven', 'Leth', 'Aven', 'Ena', 'Suri', 'Taal', 'Lio', 'Erin', 'Meri', 'Olan'] }
});

export function speciesName(species, seed, identityId) {
  const id = normalizeSpecies(species), names = NAMES[id], h = hash(`${clean(seed, 240)}:people-name-v1:${clean(identityId)}`);
  return `${names.first[h % names.first.length]}${id === 'choral' ? '-' : ' '}${names.last[Math.floor(h / names.first.length) % names.last.length]}`;
}

/** A saved row is an identity even when it predates species. Never reroll it on load. */
export function resolveNpcIdentity(seed, identityId, location = {}, options = {}) {
  const saved = own(options, 'savedIdentity');
  const hasSaved = saved !== null && typeof saved === 'object' && !Array.isArray(saved);
  const species = hasSaved ? normalizeSpecies(own(saved, 'species')) : chooseNpcSpecies(seed, identityId, location, { explicitSpecies: own(options, 'species'), authored: own(options, 'authored') === true });
  const name = clean(hasSaved ? own(saved, 'name') : own(options, 'name'), 90) || clean(own(options, 'name'), 90) || speciesName(species, seed, identityId);
  return { version: 1, species, name };
}

const BACKGROUNDS = freeze({
  human: ['My family kept changing ports. I learned to ask which home someone means before telling them about mine.', 'People say the galaxy is ours. I mostly think about whether the next shift leaves me time to cook.'],
  choral: ['People ask whether all Choral enjoy long silences. I keep a radio on when I work. My neighbor has opinions about that.', 'Where I grew up, a record kept everyone’s account beside the others. I like that custom. It still leaves plenty of room for an argument.', 'My family has one song nobody agrees how to finish. We sing it anyway. That is a family habit, not a rule for all of us.'],
  vaeli: ['I carry a little humidifier on dry ships. It is about as mysterious as remembering a warm coat.', 'The towel by my door is for guests. My brother finds the whole custom fussy. He still uses it when he visits.', 'Some ports put all the Vaeli in one housing block. I would rather choose my neighbors for reasons other than the plumbing.'],
  keth: ['My feelers notice the old ventilation fan before my ears do. I have put in a repair request. Twice.', 'My family keeps repaired things until they can hardly hold together. I like buying something new now and then. It causes more discussion than you would expect.', 'People see the plates and ask what fighting is like. I would rather they asked about the instrument in my room.'],
  oru: ['Our fins pick up small changes in the air. A badly placed desk fan can make a very long afternoon.', 'My older family addresses are beyond this chart. I have friends here who would miss me if I left. Both things can be true.', 'I know a few of my grandparents’ stories. My cousin knows different ones. We compare them when the messages arrive.']
});
const LOCAL_BACKGROUNDS = freeze({
  'avel:vaeli': ['Avel has hundreds of tidewards. People from the next quay can be more foreign to my family than the humans upstairs.', 'We keep a wet room and a dry room here. Which one is the proper sitting room is a household argument, not a settled Vaeli tradition.'],
  'hadrun:keth': ['The courtyard customs belong to these towns. Keth living elsewhere have changed them, kept them, or never heard of them.', 'Hadrun is home to a great many Keth. That does not make its council my opinion. I have voted against them often enough.'],
  'chora:choral': ['The harbor has several ways to keep a promise. We do not all agree which one is best. A visitor who listens will hear the disagreement too.']
});

/** Optional, personal replies. They never replace danger, mission or relationship dialogue. */
export function speciesBackground(species, identityId, location = {}) {
  const kind = normalizeSpecies(species), id = clean(identityId);
  const body = typeof location === 'string' ? clean(location) : clean(own(location, 'parentId')) || clean(own(location, 'bodyId')) || clean(own(location, 'id'));
  const localKey = `${body}:${kind}`, local = Object.hasOwn(LOCAL_BACKGROUNDS, localKey) ? LOCAL_BACKGROUNDS[localKey] : null;
  const h = hash(`people-background-v1:${id}`), lines = local && h % 2 === 0 ? local : BACKGROUNDS[kind];
  return lines[Math.floor(h / 2) % lines.length];
}
