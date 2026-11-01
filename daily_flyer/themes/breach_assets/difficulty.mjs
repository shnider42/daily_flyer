// One combat catalogue is shared by solo settings and authoritative rooms.
// Attack cadence changes recovery time, never the visible warning window.
export const DIFFICULTY = Object.freeze({
  relaxed: Object.freeze({ label: 'Relaxed', health: .8, damage: .55, speed: .85, attackRate: 1,
    description: 'More breathing room. Enemies are slower and less dangerous.' }),
  standard: Object.freeze({ label: 'Standard', health: 1, damage: 1, speed: 1, attackRate: 1,
    description: 'A balanced first run. Keep moving and watch your ammunition.' }),
  hard: Object.freeze({ label: 'Hard', health: 1.2, damage: 1.35, speed: 1.1, attackRate: 1,
    description: 'More pressure, tougher enemies. Every supply matters.' }),
  insane: Object.freeze({ label: 'Insane in the Membrane', health: 1.4, damage: 1.7, speed: 1.2, attackRate: 1.22,
    description: 'Relentless pursuit, shorter recovery and punishing hits. Read the warnings, break line of sight and use every weapon.' }),
});
export const DIFFICULTY_IDS = Object.freeze(Object.keys(DIFFICULTY));
export const difficultyLabel = id => DIFFICULTY[id]?.label || DIFFICULTY.standard.label;
