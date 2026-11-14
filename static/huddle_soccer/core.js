/* Association-football data and preferences. Kept separate from NFL scoring. */
(function (root) {
  'use strict';
  const TZ = 'America/Sao_Paulo';
  const isDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  function localDate(value) {
    if (isDate(value)) return value;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-CA', {timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(date);
    const part = type => parts.find(p => p.type === type).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }
  function formatKickoff(value, compact = false) {
    if (isDate(value)) return new Date(value + 'T12:00:00Z').toLocaleDateString('pt-BR', {timeZone: 'UTC', day: '2-digit', month: 'short'});
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Data a confirmar';
    return date.toLocaleString('pt-BR', {timeZone: TZ, day: '2-digit', month: 'short',
      ...(compact ? {} : {hour: '2-digit', minute: '2-digit', hourCycle: 'h23'})}) + (compact ? '' : ' · Brasília');
  }
  function normalize(raw, data) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) raw = {};
    const ids = new Set(data.standings.map(row => row.team));
    const cutoff = isDate(data.as_of) ? data.as_of : '2026-11-14';
    const start = data.season_start || cutoff.slice(0, 4) + '-08-01';
    const defaultSince = new Date(Date.parse(cutoff + 'T12:00:00Z') - 30 * 86400000).toISOString().slice(0, 10);
    return {
      locale: 'pt-BR',
      team: raw.team === 'ALL' || ids.has(raw.team) ? raw.team : 'MCI',
      teamFocus: ids.has(raw.teamFocus) ? raw.teamFocus : ids.has(raw.team) ? raw.team : 'MCI',
      depth: ['little', 'basics', 'well'].includes(raw.depth) ? raw.depth : 'basics',
      since: isDate(raw.since) && raw.since >= start && raw.since <= cutoff ? raw.since : defaultSince,
      tab: ['brief', 'games', 'teams', 'league', 'learn'].includes(raw.tab) ? raw.tab : 'brief',
      spoilers: raw.spoilers === true,
      theme: raw.theme === 'light' ? 'light' : 'dark',
      gameStatus: ['all', 'final', 'scheduled'].includes(raw.gameStatus) ? raw.gameStatus : 'all',
      query: typeof raw.query === 'string' ? raw.query.slice(0, 100) : '',
      game: data.games.some(game => game.id === raw.game) ? raw.game : null
    };
  }
  function safeURL(value) {
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : '#'; }
    catch { return '#'; }
  }
  const involves = (game, id) => id === 'ALL' || game.home.team === id || game.away.team === id;
  function filterGames(data, state) {
    const names = Object.fromEntries(data.teams.map(team => [team.id, team.name]));
    const query = (state.query || '').toLocaleLowerCase('pt-BR');
    return data.games.filter(game => involves(game, state.team)
      && localDate(game.date) >= state.since
      && (state.gameStatus === 'all' || (state.gameStatus === 'final' ? game.completed : !game.completed))
      && (!query || [names[game.home.team], names[game.away.team], game.competition, game.venue || ''].join(' ').toLocaleLowerCase('pt-BR').includes(query)))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  function filterStories(data, state) {
    return data.stories.filter(story => story.date >= state.since && (state.team === 'ALL' || story.teams.includes(state.team)))
      .sort((a, b) => b.date.localeCompare(a.date));
  }
  function summarize(games, id) {
    const result = {played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, points: 0};
    for (const game of games) {
      const [side, other] = game.home.team === id ? [game.home, game.away] : [game.away, game.home];
      if (!game.completed || !Number.isInteger(side.score) || !Number.isInteger(other.score)) continue;
      result.played++; result.gf += side.score; result.ga += other.score;
      result[side.score > other.score ? 'w' : side.score < other.score ? 'l' : 'd']++;
    }
    result.points = result.w * 3 + result.d;
    result.gd = result.gf - result.ga;
    return result;
  }
  function teamBrief(data, id, since) {
    const league = data.games.filter(game => game.completed && game.competition === 'Premier League' && involves(game, id));
    const window = league.filter(game => localDate(game.date) >= since);
    const before = league.filter(game => localDate(game.date) < since);
    return {window, before: summarize(before, id), delta: summarize(window, id), covered: summarize(league, id),
      table: data.standings.find(row => row.team === id) || null,
      complete: (data.complete_results_teams || []).includes(id),
      next: data.games.filter(game => !game.completed && involves(game, id)).sort((a, b) => a.date.localeCompare(b.date))[0] || null};
  }
  function gameRead(game, teamId, data) {
    const name = id => data.teams.find(team => team.id === id)?.name || id;
    if (!game.completed) return {kind: 'Agendado', text: 'A partida ainda não aconteceu nesta edição. Data e horário podem mudar.'};
    if (game.penalties) {
      const winner = game.penalties.home > game.penalties.away ? game.home.team : game.away.team;
      return {kind: 'Pênaltis', text: `Empate por ${game.home.score} a ${game.away.score} no jogo. ${name(winner)} venceu a disputa de pênaltis por ${Math.max(game.penalties.home, game.penalties.away)} a ${Math.min(game.penalties.home, game.penalties.away)}.`};
    }
    if (game.home.score === game.away.score) return {kind: 'Empate', text: `${name(game.home.team)} e ${name(game.away.team)} empataram por ${game.home.score} a ${game.away.score}.`};
    const winner = game.home.score > game.away.score ? game.home : game.away;
    const loser = winner === game.home ? game.away : game.home;
    return {kind: teamId && teamId !== 'ALL' ? winner.team === teamId ? 'Vitória' : 'Derrota' : 'Encerrado',
      text: `${name(winner.team)} venceu ${name(loser.team)} por ${winner.score} a ${loser.score}.`};
  }
  const shareState = state => ({locale: 'pt-BR', team: state.team, teamFocus: state.teamFocus, depth: state.depth,
    since: state.since, tab: state.tab, theme: state.theme, gameStatus: state.gameStatus, game: state.game || null, spoilers: true});
  const api = {normalize, localDate, formatKickoff, safeURL, filterGames, filterStories, teamBrief, gameRead, shareState};
  if (typeof module !== 'undefined') module.exports = api; else root.HuddleSoccer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
