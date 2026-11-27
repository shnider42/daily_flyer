/** Fictional clubs plus a fan-made Backyard Baseball roster. Engine ratings are game adaptations. */
const deepFreeze = value => { if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; };

/** Release locations describe a right-handed delivery; the engine mirrors x for a lefty. */
export const DELIVERIES = deepFreeze({
  classic: { id: 'classic', label: 'Classic windup', duration: .65, start: { x: -.32, y: 1.88, z: 18.44 } },
  highKick: { id: 'highKick', label: 'High leg kick', duration: .92, start: { x: -.38, y: 2.03, z: 18.25 } },
  compact: { id: 'compact', label: 'Compact stretch', duration: .48, start: { x: -.34, y: 1.82, z: 18.44 } },
  sidearm: { id: 'sidearm', label: 'Sidearm', duration: .58, start: { x: -.67, y: 1.23, z: 18.35 } },
  submarine: { id: 'submarine', label: 'Submarine', duration: .78, start: { x: -.73, y: .82, z: 18.35 } },
  seated: { id: 'seated', label: 'Seated delivery', duration: .56, start: { x: -.40, y: 1.12, z: 18.35 } },
});

// Arm strength, throwing accuracy and glove work are deliberately independent.
// A reliable fielder can still need two hops to reach the plate from deep left.
const CLUB_DEFENSE = {
  harbor: [[.68,.86,.87],[.56,.77,.85],[.94,.79,.81],[.58,.81,.86],[.84,.74,.79],[.45,.52,.52],[.82,.85,.84],[.28,.60,.71],[.59,.87,.90]],
  foundry: [[.74,.84,.84],[.78,.66,.82],[.53,.78,.83],[.39,.57,.53],[.61,.91,.88],[.90,.72,.79],[.85,.82,.86],[.56,.83,.87],[.32,.71,.76]],
};
const SKINS = ['#e3b58e','#b67d54','#70482f','#c58d66','#a76d48','#efc5a3','#8d593c','#cd9b78','#d5ad86'];
const HAIR = ['#342820','#1d1714','#171412','#7c492e','#26201d','#a5683d','#3c2a21','#24211f','#201b18'];
function fictionalAppearance(club, index, position) {
  const i = (index + (club === 'foundry' ? 3 : 0)) % SKINS.length;
  return {
    skin: SKINS[i], hair: HAIR[i], height: [.98,1.04,1.08,1.05,.99,1.02,.96,1.01,.94][i],
    build: position === 'C' || position === '1B' ? 1.10 : [.96,.91,1.03,1.07,1,.98,1.06,.95,.90][i],
    hairStyle: i === 2 || i === 6 ? 'curly' : i === 7 ? 'long' : 'short',
    cap: club === 'harbor' ? '#173f62' : '#542f35',
    jersey: club === 'harbor' ? '#dfebf0' : '#a83f48',
    trim: club === 'harbor' ? '#b43a43' : '#f3e4cb', glasses: i === 8,
  };
}
const lineup = (club, rows, bench = false) => rows.map(([name, number, position, bats, speed, contact, power], i) => {
  const [arm, accuracy, fielding] = bench ? [[.62,.74,.76],[.55,.80,.79],[.68,.70,.77]][i % 3] : CLUB_DEFENSE[club][i];
  return {
  id: `${club}-${name.toLowerCase().replaceAll(' ', '-')}`, name, number, position, bats,
  throws: ['1B','LF','CF','RF'].includes(position) && bats === 'L' ? 'L' : 'R', speed, contact, power,
  arm, accuracy, fielding, appearance: fictionalAppearance(club, i + (bench ? 4 : 0), position),
}; });
const staff = (club, names) => [
  ['balanced', 'R', 'classic', 21], ['power', 'R', 'highKick', 44],
  ['movement', 'R', 'compact', 31], ['knuckle', 'R', 'classic', 49],
  ['heat104', 'R', 'compact', 99], ['southpaw', 'L', 'highKick', 32],
  ['sidearm', 'R', 'sidearm', 56], ['finesse', 'L', 'submarine', 60],
].map(([profileId, throws, delivery, number], i) => ({
  id: `${club}-${profileId}`, name: names[i], number, profileId, throws, delivery, position: 'P', bats: throws,
  speed: 6.1 + (i % 3) * .18, contact: .84, power: .82,
  arm: [.62,.85,.64,.45,.96,.72,.61,.48][i], accuracy: [.80,.67,.86,.81,.59,.78,.82,.89][i],
  fielding: [.72,.63,.77,.71,.56,.75,.78,.82][i], appearance: fictionalAppearance(club, i + 2, 'P'),
}));

/**
 * Original 1997 four-baseball card categories, transcribed from:
 * https://thegamehaus.com/gaming/all-backyard-baseball-1997-players-stats-steam-edition/2024/10/09/
 * Finer relative strengths use community-reported original hidden stats:
 * https://thegamehaus.com/sports/all-backyard-baseball-1997-players-secret-stats/2024/10/10/
 * These are secondary transcriptions, not verified original source code.
 * Appearance references: https://backyardsports.fandom.com/wiki/ + character name.
 * https://www.backyardsports.com/games/baseball97 confirms the original cast.
 * Speeds in m/s, contact/power multipliers, positions, numbers, handedness and
 * pitch repertoires are Pocket Baseball adaptations, not original-game claims.
 * Rows: card batting/running/pitching/fielding; power/contact/speed/catch/arm/accuracy/eye.
 */
const BACKYARD_SKILLS = {
  'Pete Wheeler': [[3,4,3,3],[80,50,100,79,82,64,12]],
  'Stephanie Morgan': [[3,3,2,3],[40,72,68,55,56,68,88]],
  'Pablo Sanchez': [[4,4,3,4],[100,63,95,100,72,78,68]],
  'Kiesha Phillips': [[4,4,2,3],[87,67,82,69,86,51,21]],
  'Achmed Khan': [[4,3,2,2],[95,84,66,71,31,29,38]],
  'Mikey Thomas': [[4,1,2,3],[90,81,31,65,100,49,58]],
  'Tony Delvecchio': [[3,2,2,3],[74,56,53,53,100,70,55]],
  'Ernie Steele': [[2,2,3,4],[62,36,57,98,34,85,71]],
  'Annie Frazier': [[3,3,1,3],[38,96,74,81,49,19,49]],
  'Jocinda Smith': [[4,2,2,4],[54,100,44,65,63,94,82]],
  'Vicki Kawaguchi': [[1,4,3,4],[1,15,84,100,52,59,76]],
  'Dmitri Petrovich': [[3,3,1,2],[78,57,66,39,53,28,43]],
  'Kenny Kawaguchi': [[2,3,4,2],[19,49,70,36,43,38,100]],
  'Sally Dobbs': [[2,3,2,3],[94,1,67,63,86,84,31]],
  'Angela Delvecchio': [[3,1,4,1],[89,40,34,1,15,22,63]],
  'Lisa Crocket': [[2,3,3,2],[67,16,78,46,73,19,68]],
  'Ronny Dobbs': [[3,2,3,2],[86,24,52,23,88,68,31]],
  'Luanne Lui': [[2,4,3,1],[18,77,96,70,24,1,29]],
  'Amir Khan': [[3,2,3,2],[73,64,56,42,26,36,100]],
  'Marky Dubois': [[3,1,3,3],[57,49,37,81,57,71,49]],
};
const BACKYARD_LOOKS = {
  'Pete Wheeler': { skin:'#efc6a1',hair:'#bf632d',height:1.08,build:.87,hairStyle:'short',cap:'#b54b35',jersey:'#eee9df',trim:'#b74739',freckles:true },
  'Stephanie Morgan': { skin:'#8b583d',hair:'#241a15',height:.96,build:.96,hairStyle:'short',cap:'#c34642',jersey:'#c4c8c7',trim:'#c7443e' },
  'Pablo Sanchez': { skin:'#bd865b',hair:'#281c14',height:.87,build:1.16,hairStyle:'short',cap:'#edc34c',capTrim:'#315c96',jersey:'#eee9dc',trim:'#bf3b3f' },
  'Kiesha Phillips': { skin:'#70432e',hair:'#2b1c16',height:.98,build:1.18,hairStyle:'curly',hairBuns:true,cap:'#d8aa3b',jersey:'#e6c34c',trim:'#3f784b' },
  'Achmed Khan': { skin:'#be8b5b',hair:'#443024',height:.96,build:1.04,hairStyle:'curly',cap:'#c7a448',jersey:'#dfbc47',trim:'#b53f3b',accessory:'headphones' },
  'Mikey Thomas': { skin:'#926344',hair:'#503220',height:.94,build:1.10,hairStyle:'curly',cap:'#4c796d',jersey:'#eeeadf',trim:'#4e8277' },
  'Tony Delvecchio': { skin:'#e5b78f',hair:'#35251d',height:1.01,build:1.03,hairStyle:'short',pompadour:true,cap:'#3a577e',jersey:'#f0ece0',trim:'#345a84' },
  'Ernie Steele': { skin:'#75462f',hair:'#231912',height:1.10,build:.86,hairStyle:'short',cap:'#caa444',jersey:'#d8b951',trim:'#ac4d3c' },
  'Annie Frazier': { skin:'#efc59f',hair:'#d7b764',height:.97,build:.98,hairStyle:'curly',cap:'#88aec6',jersey:'#b0d3de',trim:'#dcac47',rainbow:true },
  'Jocinda Smith': { skin:'#89583c',hair:'#35251c',height:1.02,build:1.10,hairStyle:'long',cap:'#3c71ac',jersey:'#83a4c8',trim:'#b84b42',ponytail:true },
  'Vicki Kawaguchi': { skin:'#dfb38a',hair:'#211a17',height:.89,build:.87,hairStyle:'long',cap:'#b64f6d',jersey:'#d58aaa',trim:'#704a6e' },
  'Dmitri Petrovich': { skin:'#edc7a4',hair:'#70462d',height:.96,build:1.15,hairStyle:'short',cap:'#55789a',jersey:'#dfb74b',trim:'#4c7790',glasses:true },
  'Kenny Kawaguchi': { skin:'#dab18b',hair:'#201a16',height:.92,build:.94,hairStyle:'short',cap:'#385f99',jersey:'#c74e40',trim:'#e9d9b1',wheelchair:true },
  'Sally Dobbs': { skin:'#edc49d',hair:'#ad713d',height:.99,build:.98,hairStyle:'long',cap:'#486f8c',jersey:'#6796b4',trim:'#e8ddbe' },
  'Angela Delvecchio': { skin:'#e6b58f',hair:'#533622',height:.94,build:1.08,hairStyle:'long',cap:'#466590',jersey:'#597da5',trim:'#eee8d9' },
  'Lisa Crocket': { skin:'#e4bc96',hair:'#30251f',height:.97,build:.90,hairStyle:'long',cap:'#d9bc4d',jersey:'#a76655',trim:'#dbbe64' },
  'Ronny Dobbs': { skin:'#e8bb92',hair:'#a36839',height:.85,build:1.02,hairStyle:'short',cap:'#d4bc53',jersey:'#e9ce60',trim:'#c58da6' },
  'Luanne Lui': { skin:'#dcad83',hair:'#403023',height:.84,build:.87,hairStyle:'long',cap:'#d8bb50',jersey:'#e9ce63',trim:'#61894f' },
  'Amir Khan': { skin:'#ba8657',hair:'#3c2a1e',height:.87,build:.95,hairStyle:'curly',cap:'#b76a38',jersey:'#d17c3f',trim:'#a64a31' },
  'Marky Dubois': { skin:'#e4b58c',hair:'#9d6437',height:.98,build:1.08,hairStyle:'short',cap:'#a27848',jersey:'#7391ad',trim:'#ded8bd' },
};
// Profile baselines retain short-relief/knuckleball tradeoffs. Card pitching
// changes command and endurance, without turning every kid into the same arm.
// These values and multipliers are game balancing, not original velocity claims.
const BACKYARD_PITCHING_BASE = {
  balanced:[1,60], power:[.88,50], movement:[.96,55], knuckle:[.83,70],
  heat104:[.74,24], southpaw:[.98,55], sidearm:[.94,28], finesse:[1.04,35],
};
function backyardPlayer(name, number, position, bats = 'R', extra = {}) {
  const [cards, hidden] = BACKYARD_SKILLS[name];
  const [batting,running,pitching,fieldingCard] = cards;
  const [power,contact,speed,catching,arm,accuracy,eye] = hidden;
  const base = BACKYARD_PITCHING_BASE[extra.profileId];
  const pitchingAttributes = base ? {
    control: +Math.min(1.18, base[0] * [0,.78,.90,1.01,1.14][pitching]).toFixed(3),
    stamina: Math.round(base[1] * [0,.62,.80,1.04,1.28][pitching]),
  } : {};
  return {
    id: `backyard-${name.toLowerCase().replaceAll(' ', '-')}`, name, number, position, bats,
    throws: ['1B','LF','CF','RF'].includes(position) && bats === 'L' ? 'L' : 'R',
    speed: +(4.8 + speed * .032).toFixed(3), contact: +(.80 + contact * .0032).toFixed(3),
    power: +(.72 + power * .0045).toFixed(3), arm: arm / 100, accuracy: accuracy / 100,
    fielding: catching / 100, eye: eye / 100,
    classicRatings: { batting, running, pitching, fielding:fieldingCard, scale:4 },
    appearance: { glasses:false, noCap:!['Pablo Sanchez','Stephanie Morgan','Kenny Kawaguchi','Lisa Crocket'].includes(name), ...BACKYARD_LOOKS[name] },
    ...pitchingAttributes, ...extra,
  };
}

export const TEAM_ROSTERS = deepFreeze([
  {
    id: 'harbor', name: 'Boston Harbor', abbrev: 'BOS',
    lineup: lineup('harbor', [
      ['Evan Ward', 1, 'SS', 'R', 6.8, 1, 1],
      ['Mateo Cruz', 7, 'CF', 'L', 7.7, 1.06, .93],
      ['Darius Cole', 24, 'RF', 'R', 7.1, 1.02, 1.08],
      ['Sam Mercer', 35, '1B', 'L', 6.4, .94, 1.12],
      ['Nico Reyes', 12, '3B', 'S', 6.9, 1.03, 1.02],
      ['Owen Brooks', 18, 'DH', 'L', 6.6, .97, 1.09],
      ['Cal Bennett', 6, 'C', 'R', 6.3, 1.04, .95],
      ['Luis Vega', 9, 'LF', 'L', 7.5, .98, .97],
      ['Theo Park', 4, '2B', 'R', 7.3, 1.08, .90],
    ]),
    bench: lineup('harbor', [
      ['Jamie Holt', 22, 'UTIL', 'R', 7.0, .96, .94],
      ['Marco Silva', 29, 'UTIL', 'L', 6.8, .98, .96],
      ['Alex Kim', 14, 'UTIL', 'S', 7.2, .95, .92],
    ], true),
    pitchers: staff('harbor', ['Jack Sullivan', 'Marcus Hale', 'Rafael Torres', 'Wes Finnegan', 'Jace Navarro', 'Eli Brennan', 'Dean Okafor', 'Silas Reed']),
  },
  {
    id: 'foundry', name: 'Brooklyn Foundry', abbrev: 'BKN',
    lineup: lineup('foundry', [
      ['Miles Grant', 2, 'SS', 'R', 6.8, 1, 1],
      ['Andre Banks', 8, 'CF', 'L', 7.6, 1.07, .92],
      ['Tomás Rios', 27, '1B', 'L', 6.5, .98, 1.10],
      ['Julian Stone', 42, 'DH', 'R', 6.4, .94, 1.12],
      ['Kenji Sato', 16, 'RF', 'S', 7.1, 1.05, 1.01],
      ['Ben Osei', 15, '3B', 'R', 6.8, 1.02, 1.04],
      ['Noah Keene', 11, 'C', 'R', 6.3, 1.03, .96],
      ['Gabriel Soto', 5, '2B', 'L', 7.4, 1.08, .90],
      ['Finn Abbott', 19, 'LF', 'L', 7.3, .99, .98],
    ]),
    bench: lineup('foundry', [
      ['Casey Dunn', 23, 'UTIL', 'L', 7.0, .97, .93],
      ['Ramon Felix', 30, 'UTIL', 'R', 6.8, .96, .97],
      ['Avery Chen', 13, 'UTIL', 'S', 7.2, .95, .92],
    ], true),
    pitchers: staff('foundry', ['Isaac Porter', 'Dante Briggs', 'Hugo Castillo', 'Benji Walsh', 'Troy Vance', 'Adrian Ellis', 'Roman Bell', 'Milo Quinn']),
  },
  {
    id:'backyard', name:'Backyard Kids', abbrev:'YARD',
    ratingsNote:'1997 card ratings · Movement, arm strength, pitching command, endurance and pitch styles are adapted for Pocket Baseball.',
    lineup: [
      backyardPlayer('Pete Wheeler',20,'CF','R'),
      backyardPlayer('Stephanie Morgan',11,'SS','L'),
      backyardPlayer('Pablo Sanchez',25,'2B','R'),
      backyardPlayer('Kiesha Phillips',10,'RF','R'),
      backyardPlayer('Achmed Khan',17,'DH','R'),
      backyardPlayer('Mikey Thomas',29,'C','L'),
      backyardPlayer('Tony Delvecchio',26,'3B','R'),
      backyardPlayer('Ernie Steele',30,'1B','R'),
      backyardPlayer('Annie Frazier',13,'LF','S'),
    ],
    bench: [
      backyardPlayer('Jocinda Smith',14,'UTIL','R'),
      backyardPlayer('Vicki Kawaguchi',4,'UTIL','L'),
      backyardPlayer('Dmitri Petrovich',21,'UTIL','S'),
    ],
    // Every profile has a different kid; pitchers never appear twice in the lineup.
    pitchers: [
      backyardPlayer('Kenny Kawaguchi',19,'P','R',{profileId:'balanced',throws:'R',delivery:'seated'}),
      backyardPlayer('Sally Dobbs',6,'P','R',{profileId:'power',throws:'R',delivery:'highKick'}),
      backyardPlayer('Angela Delvecchio',3,'P','R',{profileId:'movement',throws:'R',delivery:'compact'}),
      backyardPlayer('Lisa Crocket',15,'P','R',{profileId:'knuckle',throws:'R',delivery:'classic'}),
      backyardPlayer('Ronny Dobbs',16,'P','R',{profileId:'heat104',throws:'R',delivery:'compact'}),
      backyardPlayer('Luanne Lui',12,'P','L',{profileId:'southpaw',throws:'L',delivery:'highKick'}),
      backyardPlayer('Amir Khan',18,'P','R',{profileId:'sidearm',throws:'R',delivery:'sidearm'}),
      backyardPlayer('Marky Dubois',23,'P','L',{profileId:'finesse',throws:'L',delivery:'submarine'}),
    ],
  },
]);

/** Unknown or inherited-object keys always fall back to a real catalog entry. */
export function resolveTeamId(id, fallback = 'harbor') {
  const candidate = id === 'backyard-kids' ? 'backyard' : id;
  return TEAM_ROSTERS.find(team => team.id === candidate)?.id
    || TEAM_ROSTERS.find(team => team.id === fallback)?.id || 'harbor';
}
/** Backward compatible without options; state and plain options are both accepted. */
export function getRoster(side = 0, stateOrOptions) {
  const options = stateOrOptions?.options || stateOrOptions;
  const fallback = side === 1 ? 'foundry' : 'harbor';
  const id = resolveTeamId(side === 1 ? options?.opponentTeam : options?.team, fallback);
  return TEAM_ROSTERS.find(team => team.id === id);
}
/** The nine batting slots survive an ejection; a reserve takes the removed player's slot. */
export function getLineup(state, side = state?.battingSide === 1 ? 1 : 0) {
  const roster = getRoster(side, state), changes = state?.lineupChanges?.[side] || {};
  return roster.lineup.map(original => {
    const replacement = roster.bench.find(player => player.id === changes[original.id]);
    return replacement ? { ...replacement, position: original.position, replaces: original.id } : original;
  });
}
export function getBatter(state) {
  const side = state?.battingSide === 1 ? 1 : 0;
  const index = Number.isInteger(state?.batterIndex?.[side]) ? state.batterIndex[side] : 0;
  return getLineup(state, side)[((index % 9) + 9) % 9];
}
export function getPitcher(state, side = 1 - (state?.battingSide === 1 ? 1 : 0)) {
  const roster = getRoster(side, state), activeId = state?.pitching?.[side]?.activeId;
  const profile = side === 0 ? state?.options?.pitcher : state?.options?.opponentPitcher;
  return roster.pitchers.find(p => p.id === activeId) || roster.pitchers.find(p => p.profileId === profile) || roster.pitchers[0];
}
export function getBatterHand(state) {
  const batter = getBatter(state);
  return batter.bats === 'S' ? (getPitcher(state).throws === 'L' ? 'R' : 'L') : batter.bats;
}
/** A standing body capsule, in the same batter's box used by both renderers. */
export function getBatterBody(state) {
  // A delivered pitch belongs to its original hitter even after the lineup
  // advances. Keep the same stature bounds as the two presentation backends.
  const batter = state?.pitch?.batter || getBatter(state), appearance = batter.appearance || {};
  const height = Math.max(.78, Math.min(1.16, appearance.height || 1));
  const build = Math.max(.80, Math.min(1.25, appearance.build || 1));
  const hand = state?.pitch?.batter?.hand || getBatterHand(state);
  return { hand, x: hand === 'L' ? 1.02 : -1.02, z: -.04, bottom: .30 * height, top: 1.52 * height, radius: .22 * build };
}
