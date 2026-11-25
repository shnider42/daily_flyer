import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEngine, RARITIES, MAX_SCORE, validateBank } from '../engine.mjs';
import { createGameServer } from '../server.mjs';
import { createStorage } from '../storage.mjs';

function fixture() {
  return RARITIES.flatMap((rarity, r) => Array.from({ length: 12 }, (_, i) => ({ id: `${rarity.id}-${i}`, prompt: `Question ${r}-${i}?`, options: ['Correct', 'Wrong one', 'Wrong two', 'Wrong three'], answerIndex: 0, category: `category-${i % 6}`, categoryLabel: `Category ${i % 6}`, rarity: rarity.id, source: { name: 'Fixture', url: 'https://example.com/source', license: 'CC0' }, explanation: 'A test explanation.' })));
}
const player = { nickname: 'Quiz Player', playerId: 'test-player-id-12345' };

test('ranked recipe, maximum score, question redaction, and option randomization are coherent', () => {
  const engine = createEngine({ questions: fixture(), now: () => 1000, random: () => 0 });
  const { run, payload } = engine.start({ ...player, mode: 'ranked', category: 'not-a-category', untimed: true });
  assert.equal(run.untimed, false);
  assert.equal(payload.question.deadline, 16000);
  assert.equal(payload.question.answerIndex, undefined);
  assert.equal(payload.question.source, undefined);
  assert.equal(payload.questions, undefined);
  assert.equal(new Set(run.questions.map(q => q.id)).size, 12);
  assert.deepEqual(RARITIES.map(r => run.questions.filter(q => q.rarity === r.id).length), [3, 3, 2, 2, 1, 1]);
  assert.equal(run.questions[0].options[run.questions[0].answerIndex], 'Correct');
  for (const question of run.questions) { engine.answer(run, { questionId: question.id, choice: question.answerIndex }); engine.next(run); }
  assert.equal(engine.result(run).score, 7875);
  assert.equal(engine.result(run).score, MAX_SCORE);
  assert.equal(engine.result(run).correct, 12);
  assert.equal(engine.record(run).total, 12);
});

test('server time controls speed, timeout, duplicate submissions, and Next retries', () => {
  let clock = 1000;
  const engine = createEngine({ questions: fixture(), now: () => clock });
  const { run } = engine.start(player);
  const first = run.questions[0];
  clock += 7500;
  const firstAnswer = engine.answer(run, { questionId: first.id, choice: first.answerIndex, score: 999999, elapsedMs: 0 });
  assert.equal(firstAnswer.pointsAwarded, 112);
  assert.equal(firstAnswer.speedBonus, 12);
  const duplicate = engine.answer(run, { questionId: first.id, choice: (first.answerIndex + 1) % 4 });
  assert.deepEqual(duplicate, firstAnswer);
  assert.equal(run.score, 112);
  clock += 60000; // Reading feedback consumes no question time.
  const next = engine.next(run);
  assert.equal(next.question.deadline, clock + 15000);
  clock += 1000;
  assert.equal(engine.next(run).question.deadline, next.question.deadline);
  assert.equal(engine.answer(run, { questionId: first.id, choice: first.answerIndex }).answered, 1);
  assert.equal(run.index, 1);
  clock = next.question.deadline;
  const timeout = engine.answer(run, { questionId: run.questions[1].id, choice: run.questions[1].answerIndex });
  assert.equal(timeout.correct, false);
  assert.equal(timeout.pointsAwarded, 0);
  assert.equal(timeout.timedOut, true);
});

test('practice respects a category, optional untimed answers, and cannot produce leaderboard records', () => {
  let clock = 0;
  const engine = createEngine({ questions: fixture(), now: () => clock });
  const { run, payload } = engine.start({ ...player, mode: 'practice', category: 'category-2', untimed: true });
  assert.ok(run.questions.every(q => q.category === 'category-2'));
  assert.equal(payload.question.deadline, null);
  clock = 600000;
  const feedback = engine.answer(run, { questionId: run.questions[0].id, choice: run.questions[0].answerIndex });
  assert.equal(feedback.correct, true);
  assert.equal(feedback.speedBonus, 0);
  assert.throws(() => engine.record(run), { code: 'not_ranked_result' });
});

test('run ownership, nickname validation, expiration, and malformed bank fail closed', () => {
  let clock = 0;
  const engine = createEngine({ questions: fixture(), now: () => clock });
  assert.throws(() => engine.start({ ...player, nickname: '<script>' }), { code: 'invalid_nickname' });
  const { run } = engine.start(player);
  assert.throws(() => engine.authorize(run.id, 'a'.repeat(64)), { code: 'invalid_token' });
  assert.throws(() => engine.authorize(run.id, 'é'.repeat(64)), { code: 'invalid_token' });
  assert.equal(engine.authorize(run.id, run.token), run);
  assert.throws(() => engine.answer(run, { questionId: run.questions[1].id, choice: 0 }), { code: 'stale_question' });
  assert.throws(() => engine.answer(run, { questionId: run.questions[0].id, choice: '0' }), { code: 'invalid_choice' });
  clock = 30 * 60 * 1000 + 1;
  assert.throws(() => engine.authorize(run.id, run.token), { code: 'run_expired' });
  const invalid = fixture(); invalid[0].options[1] = invalid[0].options[0];
  assert.throws(() => validateBank(invalid), /Invalid options/);
});

test('recent questions are avoided when alternatives remain and reports require answered questions', () => {
  const engine = createEngine({ questions: fixture(), random: () => 0 });
  const first = engine.start(player).run;
  const second = engine.start(player).run;
  assert.equal(first.questions.filter(q => second.questions.some(s => s.id === q.id)).length, 0);
  assert.throws(() => engine.report(first, first.questions[0].id, 'Wrong date'), { code: 'invalid_report' });
  engine.answer(first, { questionId: first.questions[0].id, choice: null });
  const report = engine.report(first, first.questions[0].id, 'The date appears to be incorrect.');
  assert.equal(report.run_id, first.id);
  assert.ok(!('token' in report));
  engine.markReported(first, first.questions[0].id);
  assert.equal(engine.report(first, first.questions[0].id, 'Duplicate report'), null);
});

test('the shipped bank is complete and ranked draws keep tiers and facts consistent', async () => {
  const questions = JSON.parse(await readFile(new URL('../data/questions.json', import.meta.url), 'utf8'));
  const manifest = JSON.parse(await readFile(new URL('../data/manifest.json', import.meta.url), 'utf8'));
  assert.ok(questions.length >= 2000);
  assert.equal(questions.length, manifest.questionCount);
  assert.ok(new Set(questions.map(q => q.category)).size >= 20);
  const engine = createEngine({ questions, bankVersion: manifest.bankVersion });
  for (let i = 0; i < 25; i++) {
    const { run } = engine.start({ ...player, playerId: `bank-review-${i}` });
    assert.equal(run.questions.length, 12);
    assert.equal(new Set(run.questions.map(q => q.factGroup || q.id)).size, 12);
    assert.ok(new Set(run.questions.map(q => q.category)).size >= 3);
    for (const rarity of RARITIES) assert.equal(run.questions.filter(q => q.rarity === rarity.id).length, rarity.questions);
  }
});

test('local storage persists, deduplicates score submissions, and shows each player best in bank version', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bk-storage-'));
  try {
    let clock = Date.parse('2026-11-25T00:00:00Z');
    const storage = createStorage({ env: { BK_STORAGE: 'local' }, directory, now: () => clock });
    const base = { id: 'one', player_id: 'player1', nickname: 'First', score: 100, correct: 1, total: 12, best_streak: 1, elapsed_ms: 10000, bank_version: '2026-11-25.v1', created_at: new Date(clock).toISOString() };
    await Promise.all([storage.saveRun(base), storage.saveRun(base)]);
    await storage.saveRun({ ...base, id: 'two', nickname: 'Better', score: 200 });
    await storage.saveRun({ ...base, id: 'three', player_id: 'player2', score: 300, bank_version: 'old' });
    let board = await storage.leaderboard('all');
    assert.equal(board.length, 1); assert.equal(board[0].nickname, 'Better');
    assert.equal((JSON.parse(await readFile(join(directory, '.local', 'records.json'), 'utf8'))).runs.length, 3);
    clock += 8 * 86400000;
    assert.equal((await storage.leaderboard('week')).length, 0);
    assert.equal((await storage.leaderboard('all')).length, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('Supabase adapter uses publishable header, bank version, and never reports failed persistence as saved', async () => {
  const calls = [];
  const env = { BK_STORAGE: 'supabase', BK_SUPABASE_URL: 'https://project-ref.supabase.co', BK_SUPABASE_ANON_KEY: 'sb_publishable_example', BK_WRITE_TOKEN: 'secret-for-test' };
  const storage = createStorage({ env, fetcher: async (url, options) => { calls.push({ url, options }); return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }); } });
  assert.equal(await storage.health(), true);
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.equal(calls[0].options.headers.apikey, env.BK_SUPABASE_ANON_KEY);
  assert.equal(JSON.parse(calls[0].options.body).p_bank_version, '2026-11-25.v1');
  await storage.saveRun({ id: 'test' });
  assert.equal(JSON.parse(calls.at(-1).options.body).p_token, env.BK_WRITE_TOKEN);
  const failed = createStorage({ env, fetcher: async () => new Response('denied', { status: 403 }) });
  assert.equal(await failed.health(), false);
  await assert.rejects(failed.saveRun({}), /temporarily unavailable/);
  assert.equal(await createStorage({ env: { NODE_ENV: 'production' } }).health(), false);
});

test('real HTTP run hides answers, enforces authorization, completes once, and retries a failed save', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bk-http-'));
  let attempts = 0;
  let saved = 0;
  const storage = { mode: 'test', health: async () => true, leaderboard: async () => [], report: async () => {}, saveRun: async () => { attempts++; if (attempts === 1) throw new Error('network unavailable'); saved++; } };
  const { server, engine } = await createGameServer({ questions: fixture(), publicDir: directory, storage, env: {}, manifest: { bankVersion: '2026-11-25.v1' } });
  await writeFile(join(directory, 'index.html'), '<!doctype html><title>Test</title>');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const meta = await (await fetch(base + '/api/meta')).json();
    assert.equal(meta.totalQuestions, 72);
    assert.equal((await fetch(base + '/data/questions.json')).status, 404);
    assert.equal((await fetch(base + '/engine.mjs')).status, 404);
    const start = await post('/api/runs', player);
    assert.equal(start.status, 201);
    let state = await start.json();
    assert.equal(state.question.answerIndex, undefined);
    const token = state.runToken;
    const id = state.runId;
    assert.equal((await post(`/api/runs/${id}/answer`, { token: 'bad', questionId: state.question.id, choice: 0 })).status, 403);
    const internal = engine.authorize(id, token);
    let last;
    for (let n = 0; n < 12; n++) {
      const q = internal.questions[n];
      const response = await post(`/api/runs/${id}/answer`, { token, questionId: q.id, choice: q.answerIndex });
      assert.equal(response.status, 200);
      last = await response.json();
      if (n < 11) state = await (await post(`/api/runs/${id}/next`, { token })).json();
    }
    assert.equal(last.finished, true);
    assert.equal(last.result.leaderboardSaved, false);
    assert.equal(last.result.correct, 12);
    const retries = await Promise.all([post(`/api/runs/${id}/save`, { token }), post(`/api/runs/${id}/save`, { token })]);
    assert.ok(retries.every(response => response.status === 200));
    assert.equal(saved, 1);
    assert.equal(attempts, 2);
    const resumed = await (await fetch(`${base}/api/runs/${id}`, { headers: { Authorization: `Bearer ${token}` } })).json();
    assert.equal(resumed.result.leaderboardSaved, true);
    assert.equal(resumed.result.review.length, 12);
    const maliciousOrigin = await fetch(base + '/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://different.example' }, body: JSON.stringify(player) });
    assert.equal(maliciousOrigin.status, 403);
    const html = await fetch(base + '/');
    assert.equal(html.status, 200);
    assert.ok(html.headers.get('Content-Security-Policy').includes("script-src 'self'"));
  } finally { await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); }
});
