import { randomBytes, randomInt, randomUUID, createHmac, timingSafeEqual } from 'node:crypto';

export const VERSION = '1.0.0';
export const ROUND_LENGTH = 12;
export const QUESTION_SECONDS = 15;
export const RARITIES = Object.freeze([
  { id: 'common', label: 'Common', points: 100, questions: 3 },
  { id: 'uncommon', label: 'Uncommon', points: 200, questions: 3 },
  { id: 'obscure', label: 'Obscure', points: 400, questions: 2 },
  { id: 'epic', label: 'Epic', points: 700, questions: 2 },
  { id: 'legendary', label: 'Legendary', points: 1200, questions: 1 },
  { id: 'one-of-one', label: 'One of one', points: 2000, questions: 1 },
]);
export const MAX_SCORE = RARITIES.reduce((sum, r) => sum + r.points * r.questions * 1.25, 0);
const RARITY_MAP = new Map(RARITIES.map(r => [r.id, r]));
const RUN_TTL = 30 * 60 * 1000;
const MAX_RUNS = 3000;
const MAX_PLAYERS = 5000;

export class GameError extends Error {
  constructor(status, error, message) { super(message); this.status = status; this.code = error; }
}

function shuffle(values, random = randomInt) {
  const array = [...values];
  for (let i = array.length - 1; i > 0; i--) {
    const j = random(i + 1); [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function sameToken(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  const actual = Buffer.from(a), expected = Buffer.from(b);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function validateBank(questions) {
  if (!Array.isArray(questions) || questions.length < ROUND_LENGTH) throw new Error('Question bank is missing or too small.');
  const ids = new Set();
  const prompts = new Set();
  for (const question of questions) {
    if (!question || typeof question.id !== 'string' || !question.id || ids.has(question.id)) throw new Error('Question bank contains invalid or duplicate ids.');
    ids.add(question.id);
    if (typeof question.prompt !== 'string' || !question.prompt.trim() || question.prompt.length > 1600) throw new Error(`Invalid prompt: ${question.id}`);
    const canonical = question.prompt.normalize('NFKC').toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (prompts.has(canonical)) throw new Error(`Duplicate prompt: ${question.id}`);
    prompts.add(canonical);
    if (!Array.isArray(question.options) || question.options.length !== 4 || question.options.some(x => typeof x !== 'string' || !x.trim() || x.length > 600) || new Set(question.options.map(x => x.normalize('NFKC').trim().toLowerCase())).size !== 4) throw new Error(`Invalid options: ${question.id}`);
    if (!Number.isInteger(question.answerIndex) || question.answerIndex < 0 || question.answerIndex > 3 || !RARITY_MAP.has(question.rarity)) throw new Error(`Invalid answer or rarity: ${question.id}`);
    if (typeof question.category !== 'string' || !/^[a-z0-9-]+$/.test(question.category) || typeof question.categoryLabel !== 'string') throw new Error(`Invalid category: ${question.id}`);
    if (!question.source || typeof question.source.name !== 'string' || !/^https:\/\//.test(question.source.url || '')) throw new Error(`Missing source: ${question.id}`);
  }
  for (const rarity of RARITIES) if (questions.filter(q => q.rarity === rarity.id).length < rarity.questions) throw new Error(`Not enough ${rarity.id} questions.`);
  return questions;
}

export function createEngine({ questions, bankVersion = '1', now = Date.now, random = randomInt, playerSalt = randomBytes(32).toString('hex'), maxRuns = MAX_RUNS } = {}) {
  validateBank(questions);
  const bank = new Map(questions.map(q => [q.id, q]));
  const runs = new Map();
  const histories = new Map();
  const categories = [...new Set(questions.map(q => q.category))].map(id => ({ id, label: questions.find(q => q.category === id).categoryLabel, count: questions.filter(q => q.category === id).length })).sort((a, b) => a.label.localeCompare(b.label));

  function sweep() {
    const cutoff = now() - RUN_TTL;
    for (const [id, run] of runs) if (run.touchedAt < cutoff) runs.delete(id);
    while (histories.size > MAX_PLAYERS) histories.delete(histories.keys().next().value);
  }

  function pickRound(mode, category, history) {
    const counts = new Map();
    const chosen = [];
    const recent = new Set(history);
    const available = questions.filter(q => category === 'all' || q.category === category);
    function take(pool, count) {
      const shuffled = shuffle(pool, random);
      for (let n = 0; n < count; n++) {
        let candidates = shuffled.filter(q => !chosen.some(c => c.id === q.id));
        if (!candidates.length) break;
        const chosenGroups = new Set(chosen.map(q => q.factGroup || q.id));
        const differentFacts = candidates.filter(q => !chosenGroups.has(q.factGroup || q.id));
        if (differentFacts.length) candidates = differentFacts;
        const unseen = candidates.filter(q => !recent.has(q.id));
        if (unseen.length) candidates = unseen;
        const diversified = candidates.filter(q => (counts.get(q.category) || 0) < 3);
        if (diversified.length) candidates = diversified;
        const q = candidates[0];
        chosen.push(q); counts.set(q.category, (counts.get(q.category) || 0) + 1);
      }
    }
    if (mode === 'ranked' || category === 'all') {
      for (const rarity of RARITIES) take(available.filter(q => q.rarity === rarity.id), rarity.questions);
    } else {
      take(available, ROUND_LENGTH);
    }
    if (chosen.length < Math.min(ROUND_LENGTH, available.length)) take(available, ROUND_LENGTH - chosen.length);
    return chosen.map(question => {
      const order = shuffle([0, 1, 2, 3], random);
      return { ...question, options: order.map(i => question.options[i]), answerIndex: order.indexOf(question.answerIndex) };
    });
  }

  function publicQuestion(run) {
    const q = run.questions[run.index];
    if (!q || run.finished || run.phase !== 'question') return null;
    return { id: q.id, prompt: q.prompt, options: q.options, category: q.category, categoryLabel: q.categoryLabel, rarity: q.rarity, points: RARITY_MAP.get(q.rarity).points, number: run.index + 1, deadline: run.untimed ? null : run.questionStartedAt + QUESTION_SECONDS * 1000 };
  }

  function state(run, includeToken = false) {
    const output = { runId: run.id, mode: run.mode, total: run.questions.length, score: run.score, answered: run.review.length, finished: run.finished, question: publicQuestion(run), serverNow: now() };
    if (includeToken) output.runToken = run.token;
    if (run.phase === 'feedback') output.feedback = run.lastFeedback;
    if (run.finished) output.result = result(run);
    return output;
  }

  function start(input = {}) {
    sweep();
    if (runs.size >= maxRuns) throw new GameError(503, 'busy', 'The game is busy. Try again in a moment.');
    const mode = input.mode ?? 'ranked';
    if (mode !== 'ranked' && mode !== 'practice') throw new GameError(400, 'invalid_mode', 'Choose ranked or practice.');
    const category = mode === 'ranked' ? 'all' : (input.category || 'all');
    if (category !== 'all' && !categories.some(c => c.id === category)) throw new GameError(400, 'invalid_category', 'Choose one of the available categories.');
    if (input.untimed !== undefined && typeof input.untimed !== 'boolean') throw new GameError(400, 'invalid_timer', 'The timer setting must be true or false.');
    const rawName = typeof input.nickname === 'string' ? input.nickname.normalize('NFKC').trim().replace(/\s+/g, ' ') : '';
    if (rawName.length < 2 || rawName.length > 20 || !/^[\p{L}\p{N} _.'-]+$/u.test(rawName)) throw new GameError(400, 'invalid_nickname', 'Use a name of 2–20 letters, numbers, spaces, or basic punctuation.');
    if (typeof input.playerId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(input.playerId)) throw new GameError(400, 'invalid_player', 'Refresh the page to create a player identity.');
    const playerId = createHmac('sha256', playerSalt).update(input.playerId).digest('hex');
    const recent = histories.get(playerId) || [];
    const selected = pickRound(mode, category, recent);
    if (!selected.length) throw new GameError(400, 'empty_category', 'This category has no playable questions.');
    histories.delete(playerId); histories.set(playerId, [...recent, ...selected.map(q => q.id)].slice(-120));
    const timestamp = now();
    const run = { id: randomUUID(), token: randomBytes(32).toString('hex'), playerId, nickname: rawName, mode, category, untimed: mode === 'practice' && input.untimed === true, questions: selected, index: 0, phase: 'question', score: 0, correct: 0, streak: 0, bestStreak: 0, activeElapsedMs: 0, review: [], answers: new Map(), createdAt: timestamp, touchedAt: timestamp, questionStartedAt: timestamp, finished: false, saved: false, saveError: null, savePromise: null, reports: new Set() };
    runs.set(run.id, run);
    return { run, payload: state(run, true) };
  }

  function authorize(id, token) {
    const run = runs.get(id);
    if (!run || run.touchedAt < now() - RUN_TTL) { if (run) runs.delete(id); throw new GameError(404, 'run_expired', 'This round expired. Start a new round.'); }
    if (!sameToken(token, run.token)) throw new GameError(403, 'invalid_token', 'This round belongs to a different session.');
    run.touchedAt = now();
    return run;
  }

  function result(run) {
    return { score: run.score, correct: run.correct, total: run.questions.length, bestStreak: run.bestStreak, elapsedMs: run.activeElapsedMs, mode: run.mode, nickname: run.nickname, leaderboardSaved: run.saved, ...(run.saveError ? { leaderboardError: run.saveError } : {}), review: run.review.map(item => ({ ...item })) };
  }

  function answer(run, { questionId, choice } = {}) {
    if (typeof questionId !== 'string') throw new GameError(400, 'invalid_question', 'The question identifier is missing.');
    if (!(choice === null || (Number.isInteger(choice) && choice >= 0 && choice < 4))) throw new GameError(400, 'invalid_choice', 'Choose one of the four answers.');
    // Repeated submissions return the original answer, even after Next. No points can be earned twice.
    if (run.answers.has(questionId)) {
      const previous = run.answers.get(questionId);
      return { ...previous, ...(previous.finished ? { result: result(run) } : {}) };
    }
    if (run.finished || run.phase !== 'question' || run.questions[run.index]?.id !== questionId) throw new GameError(409, 'stale_question', 'That question is no longer active.');
    const q = run.questions[run.index];
    const elapsed = Math.max(0, now() - run.questionStartedAt);
    const onTime = run.untimed || elapsed < QUESTION_SECONDS * 1000;
    const effectiveChoice = onTime ? choice : null;
    const correct = effectiveChoice === q.answerIndex;
    const base = RARITY_MAP.get(q.rarity).points;
    const speedBonus = correct && !run.untimed ? Math.floor(base * 0.25 * Math.max(0, 1 - elapsed / (QUESTION_SECONDS * 1000))) : 0;
    const pointsAwarded = correct ? base + speedBonus : 0;
    run.score += pointsAwarded;
    run.correct += Number(correct);
    run.streak = correct ? run.streak + 1 : 0;
    run.bestStreak = Math.max(run.bestStreak, run.streak);
    run.activeElapsedMs += Math.round(run.untimed ? elapsed : Math.min(elapsed, QUESTION_SECONDS * 1000));
    const review = { questionId: q.id, prompt: q.prompt, options: q.options, choice: effectiveChoice, correctIndex: q.answerIndex, rarity: q.rarity, categoryLabel: q.categoryLabel, pointsAwarded, source: q.source, explanation: q.explanation || '', timedOut: !onTime || choice === null };
    run.review.push(review);
    run.phase = 'feedback';
    run.finished = run.review.length === run.questions.length;
    const feedback = { correct, choice: effectiveChoice, correctIndex: q.answerIndex, answer: q.options[q.answerIndex], explanation: q.explanation || '', source: q.source, pointsAwarded, speedBonus, score: run.score, answered: run.review.length, total: run.questions.length, finished: run.finished, timedOut: review.timedOut };
    run.answers.set(q.id, feedback);
    run.lastFeedback = feedback;
    if (run.finished) feedback.result = result(run);
    return feedback;
  }

  function next(run) {
    if (run.finished) return state(run);
    if (run.phase === 'question') return state(run); // Idempotent retry; never restarts the clock.
    run.index++;
    run.phase = 'question';
    run.questionStartedAt = now();
    return state(run);
  }

  function record(run) {
    if (!run.finished || run.mode !== 'ranked') throw new GameError(409, 'not_ranked_result', 'Only a completed ranked round can enter the leaderboard.');
    return { id: run.id, player_id: run.playerId, nickname: run.nickname, score: run.score, correct: run.correct, total: run.questions.length, best_streak: run.bestStreak, elapsed_ms: run.activeElapsedMs, bank_version: String(bankVersion), created_at: new Date(run.createdAt).toISOString() };
  }

  return {
    start, authorize, answer, next, state, result, record, sweep,
    get activeRuns() { return runs.size; },
    meta(leaderboardAvailable) { return { version: VERSION, bankVersion: String(bankVersion), totalQuestions: questions.length, categories, rarities: RARITIES.map(r => ({ id: r.id, label: r.label, points: r.points, count: questions.filter(q => q.rarity === r.id).length })), roundLength: ROUND_LENGTH, questionSeconds: QUESTION_SECONDS, leaderboardAvailable }; },
    report(run, questionId, reason) {
      if (typeof questionId !== 'string' || !run.review.some(r => r.questionId === questionId)) throw new GameError(400, 'invalid_report', 'You can report a question after answering it.');
      if (typeof reason !== 'string' || reason.trim().length < 3 || reason.trim().length > 400) throw new GameError(400, 'invalid_report', 'Describe the problem in 3–400 characters.');
      if (run.reports.has(questionId)) return null;
      return { id: createHmac('sha256', playerSalt).update(`${run.id}:${questionId}`).digest('hex'), run_id: run.id, question_id: questionId, reason: reason.trim(), bank_version: String(bankVersion), created_at: new Date(now()).toISOString() };
    },
    markReported(run, questionId) { run.reports.add(questionId); },
  };
}
