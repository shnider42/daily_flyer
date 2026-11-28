import { TEAMS, getTeam } from './teams.js';

const seeded = seed => { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };
const clone = value => JSON.parse(JSON.stringify(value));
export const roundName = round => ['Quarterfinal', 'Semifinal', 'Championship'][round] || 'Campus Cup';
export function createCup(teamId, {seed = Date.now(), halfSeconds = 180, difficulty = 'varsity'} = {}) {
  if (!TEAMS.some(t => t.id === teamId)) throw new Error('Choose a valid program.');
  const random = seeded(seed), others = TEAMS.filter(t => t.id !== teamId).map(t => t.id);
  for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
  const field = [teamId, ...others.slice(0, 7)];
  return {version: 1, teamId, seed: seed >>> 0, halfSeconds, difficulty, round: 0,
    rounds: [{name: roundName(0), matches: Array.from({length: 4}, (_, i) => ({home: field[i * 2], away: field[i * 2 + 1], score: null, winner: null, simulated: false}))}],
    completed: false, champion: null, eliminated: false};
}
export function validCup(cup) {
  const ids = new Set(TEAMS.map(t => t.id));
  return !!cup && cup.version === 1 && ids.has(cup.teamId) && Number.isInteger(cup.round) && cup.round >= 0 && cup.round <= 2 &&
    Array.isArray(cup.rounds) && cup.rounds.length >= 1 && cup.rounds.length <= 3 && cup.rounds.every((r, i) =>
      Array.isArray(r.matches) && r.matches.length === 4 / (2 ** i) && r.matches.every(m => ids.has(m.home) && ids.has(m.away) && m.home !== m.away &&
        (m.winner === null || m.winner === m.home || m.winner === m.away) && (m.score === null || (Array.isArray(m.score) && m.score.length === 2 && m.score.every(v => Number.isFinite(v) && v >= 0))))) &&
    Number.isFinite(cup.halfSeconds) && cup.halfSeconds >= 10 && cup.halfSeconds <= 1200 &&
    (cup.completed || !!cupMatch(cup));
}
export function cupMatch(cup) {
  if (!cup || cup.completed) return null;
  return cup.rounds?.[cup.round]?.matches.find(m => !m.winner && (m.home === cup.teamId || m.away === cup.teamId)) || null;
}
function simulateMatch(match, cup, index) {
  const random = seeded(cup.seed + cup.round * 3191 + index * 911 + 17);
  const strength = id => Object.values(getTeam(id).ratings).reduce((a, b) => a + b, 0) / 5;
  const base = 13 * Math.pow(cup.halfSeconds / 90, .75);
  const a = Math.max(2, Math.round(base + (random() - .5) * base * .8 + (strength(match.home) - 82) * .6));
  let b = Math.max(2, Math.round(base + (random() - .5) * base * .8 + (strength(match.away) - 82) * .6));
  if (a === b) b += random() < .5 ? 1 : -1;
  return {...match, score: [a, b], winner: a > b ? match.home : match.away, simulated: true};
}
export function advanceCup(previous, {homeId, awayId, score}) {
  if (!validCup(previous) || previous.completed) throw new Error('No active tournament.');
  const expected = cupMatch(previous);
  if (!expected || ![expected.home, expected.away].includes(homeId) || ![expected.home, expected.away].includes(awayId) || homeId === awayId)
    throw new Error('Result does not match the current bracket.');
  if (!Array.isArray(score) || score.length !== 2 || score.some(n => !Number.isInteger(n) || n < 0) || score[0] === score[1])
    throw new Error('A finished, untied result is required.');
  const cup = clone(previous), current = cup.rounds[cup.round];
  current.matches = current.matches.map((m, index) => {
    if (m.home !== cup.teamId && m.away !== cup.teamId) return simulateMatch(m, cup, index);
    const result = m.home === homeId ? [...score] : [score[1], score[0]];
    return {...m, score: result, winner: result[0] > result[1] ? m.home : m.away, simulated: false};
  });
  const won = current.matches.find(m => m.home === cup.teamId || m.away === cup.teamId).winner === cup.teamId;
  if (!won) { cup.completed = true; cup.eliminated = true; return cup; }
  if (cup.round === 2) { cup.completed = true; cup.champion = cup.teamId; return cup; }
  const winners = current.matches.map(m => m.winner); cup.round++;
  cup.rounds.push({name: roundName(cup.round), matches: Array.from({length: winners.length / 2}, (_, i) => ({home: winners[2*i], away: winners[2*i+1], score: null, winner: null, simulated: false}))});
  return cup;
}

export class LocalStore {
  constructor(storage = globalThis.localStorage) { this.storage = storage; this.available = true; }
  read(key, fallback) {
    try { const raw = this.storage?.getItem(`dfe.hoops.v1.${key}`); return raw ? JSON.parse(raw) : fallback; }
    catch { this.available = false; return fallback; }
  }
  write(key, value) {
    try { this.storage?.setItem(`dfe.hoops.v1.${key}`, JSON.stringify(value)); return !!this.storage; }
    catch { this.available = false; return false; }
  }
}
