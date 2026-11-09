import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, normalizeSettings, leagueIsCurrent, cutoff, filterNews, byeTeams, orderFixtures, normalizeSearch } from '../public/logic.js';

const now = Date.parse('2026-11-09T18:00:00Z');

test('corrupt saved preferences fall back to usable settings without retaining unknown keys', () => {
  for (const raw of [null, [], 'ppr', 12]) assert.deepEqual(normalizeSettings(raw), defaults);
  const settings = normalizeSettings({ scoring: 'ppr', scope: 'unsupported', window: 'forever', size: 18, guidance: 'expert', injected: true });
  assert.equal(settings.scoring, 'ppr');
  assert.equal(settings.guidance, 'expert');
  assert.equal(settings.size, '18');
  assert.equal(settings.scope, defaults.scope);
  assert.equal(settings.window, defaults.window);
  assert.equal('injected' in settings, false);
  assert.equal(normalizeSettings({ size: -1 }).size, defaults.size);
  assert.equal(normalizeSettings({ size: { toString: 'invalid' } }).size, defaults.size);
});

test('a future or malformed import cannot claim a current league snapshot', () => {
  const league = { season: '2026', checkedAt: '2026-11-09T17:59:00Z', rosters: [{ players: ['1'] }] };
  assert.equal(leagueIsCurrent(league, '2026', now), true);
  assert.equal(leagueIsCurrent({ ...league, checkedAt: '2026-11-10T17:59:00Z' }, '2026', now), false);
  assert.equal(leagueIsCurrent({ ...league, rosters: {} }, '2026', now), false);
  assert.equal(leagueIsCurrent({ ...league, rosters: [] }, '2026', now), false);
  assert.equal(leagueIsCurrent({ ...league, rosters: [{ players: {} }] }, '2026', now), false);
  assert.equal(leagueIsCurrent({}, undefined, now), false);
});

test('invalid or future catch-up checkpoints fall back to three days', () => {
  const settings = { ...defaults, window: 'since' };
  const fallback = now - 3 * 86400000;
  assert.equal(cutoff(settings, 'not a date', now), fallback);
  assert.equal(cutoff(settings, '2026-11-10T00:00:00Z', now), fallback);
  assert.equal(cutoff(settings, '2026-11-09T12:00:00Z', now), Date.parse('2026-11-09T12:00:00Z'));
});

test('news dates cannot invent new reports or turn old stories fresh', () => {
  const settings = { ...defaults, window: '1' };
  const news = [
    { id: 'current', published: '2026-11-09T12:00:00Z', updated: 'invalid', players: [] },
    { id: 'future', published: '2026-11-10T12:00:00Z', players: [] },
    { id: 'invalid', updated: 'invalid', players: [] },
    { id: 'old-future-update', published: '2026-11-05T12:00:00Z', updated: '2026-11-10T12:00:00Z', players: [] },
    { id: 'new-update', published: '2026-11-05T12:00:00Z', updated: '2026-11-09T12:00:00Z', players: ['1'] },
  ];
  assert.deepEqual(filterNews(news, settings, new Set(), new Set(), null, now).map(n => n.id), ['current', 'new-update']);
  assert.deepEqual(filterNews(news, { ...settings, scope: 'mine' }, new Set(['1']), new Set(), null, now).map(n => n.id), ['new-update']);
  assert.deepEqual(filterNews(null, settings, null, null, null, now), []);
});

test('only explicit current-season byes are shown; missing games never establish byes', () => {
  const state = { season: '2026', week: 9, season_type: 'regular' };
  const source = { checkedAt: '2026-11-09T17:59:00Z', refreshSeconds: 900, stale: false };
  const schedule = { season: 2026, week: 9, seasonType: 'regular', complete: true, byeTeams: ['TEN', 'PIT'], games: [{ home: { team: 'MIN' }, away: { team: 'BUF' } }] };
  const players = [{ id: 'a', team: 'TEN' }, { id: 'b', team: 'GB' }];
  assert.deepEqual([...byeTeams(schedule, players, state, source, now)], ['TEN', 'PIT']);
  assert.equal(byeTeams({ ...schedule, byeTeams: null }, players, state, source, now).size, 0);
  assert.equal(byeTeams({ ...schedule, complete: false }, players, state, source, now).size, 0);
  assert.equal(byeTeams({ ...schedule, week: 8 }, players, state, source, now).size, 0);
  assert.equal(byeTeams({ ...schedule, byeTeams: ['MIN'] }, players, state, source, now).size, 0);
  assert.equal(byeTeams({ ...schedule, byeTeams: ['OAK'] }, players, state, source, now).size, 0);
  assert.equal(byeTeams({ ...schedule, games: [null] }, players, state, source, now).size, 0);
  assert.equal(byeTeams(schedule, players, state, { ...source, stale: true }, now).size, 0);
  assert.equal(byeTeams(schedule, players, state, { ...source, checkedAt: '2026-11-08T17:59:00Z' }, now).size, 0);
});

test('fixture order prioritizes live, upcoming, then newest results without mutating the feed', () => {
  const fixture = (id, state, date) => ({ id, state, date, completed: state === 'post', home: { team: 'MIN' }, away: { team: 'BUF' } });
  const games = [
    fixture('old-final', 'post', '2026-11-06T20:00:00Z'),
    fixture('later', 'pre', '2026-11-10T20:00:00Z'),
    fixture('next', 'pre', '2026-11-09T20:00:00Z'),
    fixture('live', 'in', '2026-11-09T17:00:00Z'),
    fixture('recent-final', 'post', '2026-11-08T20:00:00Z'),
  ];
  assert.deepEqual(orderFixtures(games, now).map(g => g.id), ['live', 'next', 'later', 'recent-final', 'old-final']);
  assert.equal(games[0].id, 'old-final');
});

test('player searches tolerate punctuation and accents', () => {
  assert.equal(normalizeSearch(' A.J. Brown '), normalizeSearch('AJ Brown'));
  assert.equal(normalizeSearch('J.J. McCarthy'), normalizeSearch('JJ McCarthy'));
  assert.equal(normalizeSearch('D’Andre Swift'), normalizeSearch('DAndre Swift'));
  assert.equal(normalizeSearch('José  Smith'), 'jose smith');
});
