const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../static/huddle_soccer/core.js');
const Sports = require('../static/nfl_catch_up/sports.js');
const D = require('../daily_flyer_v2/data/huddle_soccer.json');

test('soccer opens in Brazilian Portuguese with Manchester City and independent defaults', () => {
  const state = C.normalize({}, D);
  assert.equal(state.locale, 'pt-BR'); assert.equal(state.team, 'MCI');
  assert.equal(state.teamFocus, 'MCI'); assert.equal(state.theme, 'dark');
  assert.equal(C.normalize({locale: 'de-AT', team: 'MIN'}, D).team, 'MCI');
  assert.equal(C.normalize({team: 'ARS', theme: 'light'}, D).team, 'ARS');
  assert.equal(C.normalize({team: 'RBL'}, D).team, 'MCI');
  assert.equal(C.normalize({team: 'ALL'}, D).team, 'ALL');
});

test('malformed links and preferences cannot introduce invalid states', () => {
  const state = C.normalize({since: '2026-02-31', spoilers: 'true', tab: 'invalid', game: 'missing', query: 'x'.repeat(1000)}, D);
  assert.equal(state.since, '2026-10-15'); assert.equal(state.spoilers, false);
  assert.equal(state.tab, 'brief'); assert.equal(state.game, null); assert.equal(state.query.length, 100);
  assert.equal(C.normalize(null, D).team, 'MCI');
  assert.equal(C.normalize([], D).team, 'MCI');
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'http://example.com', 'https://name:password@example.com']) assert.equal(C.safeURL(url), '#');
  assert.equal(C.safeURL('https://www.mancity.com/results'), 'https://www.mancity.com/results');
});

test('dated snapshot has consistent team identities, goal totals and league points', () => {
  assert.equal(D.standings.length, 20);
  const teamIds = new Set(D.teams.map(team => team.id));
  assert.equal(teamIds.size, D.teams.length);
  assert.equal(new Set(D.games.map(game => game.id)).size, D.games.length);
  assert.deepEqual(D.standings.map(row => row.rank), Array.from({length: 20}, (_, i) => i + 1));
  for (const row of D.standings) {
    assert.ok(teamIds.has(row.team));
    assert.equal(row.played, row.w + row.d + row.l);
    assert.equal(row.points, row.w * 3 + row.d);
    assert.equal(row.gd, row.gf - row.ga);
  }
  assert.equal(D.standings.reduce((n, row) => n + row.gf, 0), D.standings.reduce((n, row) => n + row.ga, 0));
  for (const game of D.games) {
    assert.ok(teamIds.has(game.home.team)); assert.ok(teamIds.has(game.away.team));
    assert.notEqual(game.home.team, game.away.team); assert.ok(C.safeURL(game.source).startsWith('https:'));
    assert.ok(game.completed ? game.date <= D.as_of : game.date > D.as_of);
    if (!game.completed) {assert.equal(game.home.score, null); assert.equal(game.away.score, null);}
  }
});

test('complete City league results agree with the official table and exclude cup games', () => {
  const brief = C.teamBrief(D, 'MCI', D.season_start);
  assert.equal(brief.complete, true); assert.equal(brief.covered.played, 10);
  for (const key of ['played', 'w', 'd', 'l', 'gf', 'ga', 'gd', 'points']) assert.equal(brief.covered[key], brief.table[key], key);
  const window = C.teamBrief(D, 'MCI', '2026-10-24');
  assert.deepEqual([window.delta.w, window.delta.d, window.delta.l, window.delta.points], [0, 0, 3, 0]);
  assert.equal(window.before.points, 21);
  assert.equal(C.teamBrief(D, 'ARS', D.season_start).complete, false);
  assert.equal(brief.next.away.team, 'FUL');
});

test('date and team filters never claim a missing match was not played', () => {
  const state = C.normalize({team: 'MCI', since: D.season_start}, D);
  assert.equal(C.filterGames(D, state).length, 17);
  assert.equal(C.filterGames(D, {...state, gameStatus: 'scheduled'}).length, 3);
  assert.equal(C.filterGames(D, {...state, team: 'CHE'}).length, 0);
  assert.equal(C.filterGames(D, {...state, query: 'Napoli'}).length, 1);
  const ids = C.filterStories(D, state).map(story => story.id);
  for (const depth of ['little', 'basics', 'well']) assert.deepEqual(C.filterStories(D, {...state, depth}).map(story => story.id), ids);
});

test('Brazilian dates preserve date-only results and display confirmed Brasília times', () => {
  assert.equal(C.localDate('2026-11-07'), '2026-11-07');
  assert.equal(C.localDate('2026-11-08T01:30:00Z'), '2026-11-07');
  assert.match(C.formatKickoff('2026-11-21T12:30:00Z'), /09:30.*Brasília/);
  assert.doesNotMatch(C.formatKickoff('2026-11-07'), /\d\d:\d\d/);
});

test('penalty shootouts stay separate from match scores and league points', () => {
  const game = D.games.find(game => game.penalties);
  assert.equal(game.home.score, 2); assert.equal(game.away.score, 2);
  const read = C.gameRead(game, 'MCI', D);
  assert.equal(read.kind, 'Pênaltis'); assert.match(read.text, /Empate por 2 a 2/);
  assert.match(read.text, /Manchester City venceu.*4 a 3/);
  assert.doesNotMatch(read.text, /vitória.*2 a 2/i);
});

test('shared soccer links hide outcomes and omit private search text', () => {
  const state = C.normalize({team: 'ARS', query: 'private question', spoilers: false, tab: 'league'}, D);
  const shared = C.shareState(state);
  assert.equal(shared.spoilers, true); assert.equal(shared.team, 'ARS');
  assert.equal(shared.locale, 'pt-BR'); assert.equal(shared.query, undefined);
});

test('sport selection always starts soccer with City; reload keeps the active team', () => {
  const target = Sports.destination('https://huddle.example/?lang=de-AT#catchup=x', 'nfl', 'soccer');
  assert.equal(target.pathname, '/soccer/'); assert.equal(target.searchParams.get('team'), 'MCI');
  assert.equal(target.searchParams.get('lang'), 'pt-BR'); assert.equal(target.hash, '');
  assert.equal(Sports.route(target.href, 'soccer', 'soccer'), null);
  const restore = new URL(Sports.route('https://huddle.example/', 'nfl', 'soccer'));
  assert.equal(restore.pathname, '/soccer/'); assert.equal(restore.searchParams.has('team'), false);
  const back = Sports.destination(target.href, 'soccer', 'nfl');
  assert.equal(back.pathname, '/'); assert.equal(back.searchParams.get('sport'), 'nfl');
  assert.equal(back.searchParams.has('lang'), false);
});

test('older NFL language and share links override remembered soccer without redirect loops', () => {
  for (const locale of ['en-US', 'de-AT', 'hi-IN', 'gu-IN']) assert.equal(Sports.route(`https://huddle.example/?lang=${locale}`, 'nfl', 'soccer'), null);
  assert.equal(Sports.route('https://huddle.example/#catchup=%7B%7D', 'nfl', 'soccer'), null);
  assert.equal(Sports.route('https://huddle.example/?sport=nfl', 'nfl', 'soccer'), null);
  assert.equal(new URL(Sports.route('https://huddle.example/?lang=pt-BR', 'nfl', null)).pathname, '/soccer/');
  const dynamic = Sports.destination('https://huddle.example/v2?product=nfl_catch_up', 'nfl', 'soccer');
  assert.equal(dynamic.pathname, '/v2'); assert.equal(dynamic.searchParams.get('product'), 'huddle_soccer');
});
