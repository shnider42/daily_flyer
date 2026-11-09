export const defaults = {
  scoring: 'half', format: 'redraft', qb: 'one', size: '12', waivers: 'faab',
  lineup: 'managed', guidance: 'simple', window: '3', scope: 'all', position: 'ALL',
};

const choices = {
  scoring: ['standard', 'half', 'ppr', 'custom'],
  format: ['redraft', 'keeper', 'dynasty'],
  qb: ['one', 'super', 'two'],
  waivers: ['faab', 'priority'],
  lineup: ['managed', 'best'],
  guidance: ['simple', 'moderate', 'expert'],
  window: ['since', '1', '3', '7'],
  scope: ['all', 'mine', 'available'],
  position: ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'],
};
const nflTeams = new Set('ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LAC LAR LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WSH'.split(' '));
const timestamp = value => typeof value === 'string' && value.trim() ? Date.parse(value) : NaN;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function normalizeSettings(raw) {
  const result = { ...defaults };
  if (!record(raw)) return result;
  for (const [key, values] of Object.entries(choices)) {
    const value = typeof raw[key] === 'string' || typeof raw[key] === 'number' ? String(raw[key]) : '';
    if (values.includes(value)) result[key] = value;
  }
  if (typeof raw.size === 'string' || typeof raw.size === 'number') {
    const size = Number(raw.size);
    if (Number.isInteger(size) && size >= 2 && size <= 32) result.size = String(size);
  }
  return result;
}

export function leagueIsCurrent(league, season, now = Date.now()) {
  if (!record(league) || !/^20\d{2}$/.test(String(season)) || String(league.season) !== String(season)) return false;
  const age = now - timestamp(league.checkedAt);
  if (!Number.isFinite(age) || age < 0 || age >= 15 * 60000) return false;
  // Older callers only provide season/check time. Reject malformed roster data when supplied.
  if (league.rosters !== undefined && (!Array.isArray(league.rosters) || !league.rosters.length || league.rosters.some(r => !record(r) || !Array.isArray(r.players)))) return false;
  return true;
}

export function inferSettings(league = {}) {
  if (!record(league)) league = {};
  const s = record(league.settings) ? league.settings : {};
  const p = Array.isArray(league.positions) ? league.positions : [];
  const rec = league.scoring?.rec ?? 0;
  const inferred = normalizeSettings({
    scoring: rec === 1 ? 'ppr' : rec === 0.5 ? 'half' : rec === 0 ? 'standard' : 'custom',
    format: s.type === 2 ? 'dynasty' : s.type === 1 ? 'keeper' : 'redraft',
    qb: p.includes('SUPER_FLEX') ? 'super' : p.filter(x => x === 'QB').length > 1 ? 'two' : 'one',
    size: Array.isArray(league.rosters) ? league.rosters.length : defaults.size,
    waivers: s.waiver_type === 2 ? 'faab' : 'priority',
    lineup: s.best_ball === 1 ? 'best' : 'managed',
  });
  return Object.fromEntries(['scoring', 'format', 'qb', 'size', 'waivers', 'lineup'].map(key => [key, inferred[key]]));
}

export function cutoff(settings, lastSeen, now = Date.now()) {
  const { window } = normalizeSettings(settings);
  const seen = timestamp(lastSeen);
  if (window === 'since' && Number.isFinite(seen) && seen <= now) return seen;
  return now - Number(window === 'since' ? 3 : window) * 86400000;
}

export function filterNews(news, settings, tracked, available, lastSeen, now = Date.now()) {
  const normalized = normalizeSettings(settings);
  const after = cutoff(normalized, lastSeen, now);
  const relevant = normalized.scope === 'mine' ? tracked : available;
  return (Array.isArray(news) ? news : []).filter(n => {
    if (!record(n)) return false;
    const published = timestamp(n.published);
    const updated = timestamp(n.updated);
    if (Number.isFinite(published) && published > now) return false;
    const validDates = [published, updated].filter(date => Number.isFinite(date) && date <= now);
    if (!validDates.length || Math.max(...validDates) < after) return false;
    return normalized.scope === 'all' || (Array.isArray(n.players) && typeof relevant?.has === 'function' && n.players.some(id => relevant.has(id)));
  });
}

export function relevantPlayers(data, ids) {
  return (Array.isArray(data?.players) ? data.players : []).filter(p => ids?.has(p.id));
}

export function statusChanges(players, previous) {
  const baseline = record(previous) ? previous : {};
  return (Array.isArray(players) ? players : [])
    .filter(p => record(baseline[p.id]) && (baseline[p.id].status !== p.status || baseline[p.id].team !== p.team))
    .map(p => ({ player: p, before: baseline[p.id], after: { status: p.status, team: p.team } }));
}

export function byeTeams(schedule, players, expectedState = null, sourceMeta = null, now = Date.now()) {
  // Byes come from ESPN's explicit week metadata, never from missing matchups.
  if (!record(schedule) || schedule.seasonType !== 'regular' || schedule.complete !== true || !Array.isArray(schedule.byeTeams) || !Array.isArray(schedule.games)) return new Set();
  if (expectedState && (String(schedule.season) !== String(expectedState.season) || Number(schedule.week) !== Number(expectedState.week) || schedule.seasonType !== expectedState.season_type)) return new Set();
  if (sourceMeta) {
    const age = now - timestamp(sourceMeta.checkedAt);
    const refreshSeconds = Number(sourceMeta.refreshSeconds);
    const lifetime = (Number.isFinite(refreshSeconds) && refreshSeconds > 0 ? refreshSeconds : 900) * 2000;
    if (sourceMeta.error || sourceMeta.stale || !Number.isFinite(age) || age < 0 || age > lifetime) return new Set();
  }
  if (schedule.games.some(g => !record(g) || !record(g.home) || !record(g.away))) return new Set();
  const playing = new Set(schedule.games.flatMap(g => [g.home.team, g.away.team]));
  const byes = schedule.byeTeams;
  if (new Set(byes).size !== byes.length || byes.some(team => !nflTeams.has(team) || playing.has(team))) return new Set();
  return new Set(byes);
}

export function orderFixtures(games, now = Date.now()) {
  const group = game => game.state === 'in' ? 0 : game.completed || game.state === 'post' ? 2 : 1;
  const when = game => Number.isFinite(timestamp(game.date)) ? timestamp(game.date) : now;
  return (Array.isArray(games) ? games : []).filter(g => record(g) && record(g.home) && record(g.away)).slice().sort((a, b) => {
    const difference = group(a) - group(b);
    if (difference) return difference;
    return group(a) === 2 ? when(b) - when(a) : when(a) - when(b);
  });
}

export function normalizeSearch(value) {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

export function playerLens(player, rawSettings, level = rawSettings?.guidance) {
  const s = normalizeSettings(rawSettings);
  const notes = {
    QB: s.qb === 'one' ? 'Compare his matchup with your other starting options.' : 'Check replacement quarterbacks early in a multi-QB league.',
    RB: s.scoring === 'standard' ? 'Check carries and goal-line work.' : 'Check carries, targets, and goal-line work.',
    WR: s.scoring === 'standard' ? 'Check targets and end-zone opportunities.' : s.scoring === 'custom' ? 'Check targets and your reception-scoring rules.' : 'Catches score points here; check whether the targets are consistent.',
    TE: 'Check routes and targets before relying on a touchdown.',
    K: 'Check the matchup and your kicker scoring.',
    DEF: 'Check the next opponent and your defense scoring.',
  };
  const result = [notes[player?.position] || 'Compare the player with the alternatives in your league.'];
  if (s.format === 'dynasty') result.push('Consider his future role before dropping him.');
  if (s.format === 'keeper') result.push('Include the keeper cost in your decision.');
  if (s.lineup === 'best') result.push('Check whether your best-ball league allows roster changes.');
  if (level === 'moderate') result.push(s.waivers === 'faab' ? 'Check your remaining FAAB budget.' : 'Check the waiver priority you would spend.');
  if (level === 'expert') result.push(`${s.size}-team league. Add counts do not measure playing time or projected points.`);
  return result.join(' ');
}

export function newsLens(news, people, settings) {
  const s = normalizeSettings(settings);
  const notes = {
    Availability: 'Check the latest team report before setting your lineup.',
    'Roster moves': 'A move does not guarantee playing time; check the depth chart.',
    'Fantasy report': 'Check that the article uses your scoring format.',
  };
  const result = [notes[news?.kind] || 'Check whether this changes a player’s role or availability.'];
  if (people?.length === 1) result.push(playerLens(people[0], s));
  else if (people?.length > 1) result.push('Open the report for details about each player.');
  else if (s.guidance !== 'simple') result.push('No fantasy player was matched to this report.');
  if (s.guidance === 'expert') result.push('Player matching uses source athlete IDs and names.');
  return result.join(' ');
}
