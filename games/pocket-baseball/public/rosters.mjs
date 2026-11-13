/** Fictional clubs and players. Ratings are game-balance values, not real statistics. */
const deepFreeze = value => { if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; };

/** Release locations describe a right-handed delivery; the engine mirrors x for a lefty. */
export const DELIVERIES = deepFreeze({
  classic: { id: 'classic', label: 'Classic windup', duration: .65, start: { x: -.32, y: 1.88, z: 18.44 } },
  highKick: { id: 'highKick', label: 'High leg kick', duration: .92, start: { x: -.38, y: 2.03, z: 18.25 } },
  compact: { id: 'compact', label: 'Compact stretch', duration: .48, start: { x: -.34, y: 1.82, z: 18.44 } },
  sidearm: { id: 'sidearm', label: 'Sidearm', duration: .58, start: { x: -.67, y: 1.23, z: 18.35 } },
  submarine: { id: 'submarine', label: 'Submarine', duration: .78, start: { x: -.73, y: .82, z: 18.35 } },
});

const lineup = (club, rows) => rows.map(([name, number, position, bats, speed, contact, power]) => ({
  id: `${club}-${name.toLowerCase().replaceAll(' ', '-')}`, name, number, position, bats,
  throws: ['1B','LF','CF','RF'].includes(position) && bats === 'L' ? 'L' : 'R', speed, contact, power,
}));
const staff = (club, names) => [
  ['balanced', 'R', 'classic', 21], ['power', 'R', 'highKick', 44],
  ['movement', 'R', 'compact', 31], ['knuckle', 'R', 'classic', 49],
  ['heat104', 'R', 'compact', 99], ['southpaw', 'L', 'highKick', 32],
  ['sidearm', 'R', 'sidearm', 56], ['finesse', 'L', 'submarine', 60],
].map(([profileId, throws, delivery, number], i) => ({ id: `${club}-${profileId}`, name: names[i], number, profileId, throws, delivery, position: 'P', bats: throws }));

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
    pitchers: staff('foundry', ['Isaac Porter', 'Dante Briggs', 'Hugo Castillo', 'Benji Walsh', 'Troy Vance', 'Adrian Ellis', 'Roman Bell', 'Milo Quinn']),
  },
]);

export function getRoster(side = 0) { return TEAM_ROSTERS[side === 1 ? 1 : 0]; }
export function getBatter(state) {
  const side = state?.battingSide === 1 ? 1 : 0;
  const index = Number.isInteger(state?.batterIndex?.[side]) ? state.batterIndex[side] : 0;
  return getRoster(side).lineup[((index % 9) + 9) % 9];
}
export function getPitcher(state, side = 1 - (state?.battingSide === 1 ? 1 : 0)) {
  const roster = getRoster(side), activeId = state?.pitching?.[side]?.activeId;
  const profile = side === 0 ? state?.options?.pitcher : state?.options?.opponentPitcher;
  return roster.pitchers.find(p => p.id === activeId) || roster.pitchers.find(p => p.profileId === profile) || roster.pitchers[0];
}
export function getBatterHand(state) {
  const batter = getBatter(state);
  return batter.bats === 'S' ? (getPitcher(state).throws === 'L' ? 'R' : 'L') : batter.bats;
}
/** A standing body capsule, in the same batter's box used by both renderers. */
export function getBatterBody(state) {
  const hand = state?.pitch?.batter?.hand || getBatterHand(state);
  return { hand, x: hand === 'L' ? 1.02 : -1.02, z: -.04, bottom: .30, top: 1.52, radius: .22 };
}
