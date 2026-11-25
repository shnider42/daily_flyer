const $ = (selector, within = document) => within.querySelector(selector);
const $$ = (selector, within = document) => [...within.querySelectorAll(selector)];
const main = $('#main');
const dialog = $('#dialog');
const dialogContent = $('#dialog-content');
const STORAGE = 'ball-knowledge:v1:';
const RARITIES = [
  { id: 'common', label: 'Common', points: 100 },
  { id: 'uncommon', label: 'Uncommon', points: 200 },
  { id: 'obscure', label: 'Obscure', points: 400 },
  { id: 'epic', label: 'Epic', points: 700 },
  { id: 'legendary', label: 'Legendary', points: 1200 },
  { id: 'one-of-one', label: 'One of one', points: 2000 },
];
let meta;
let run = null;
let feedback = null;
let result = null;
let view = 'home';
let mode = 'ranked';
let selectedCategory = 'all';
let practiceUntimed = false;
let busy = false;
let timerFrame;
let warnedQuestionId;
let serverOffset = 0;
let pendingAnswer = null;
let soundEnabled = readLocal('sound', false);
let audioContext;
let toastTimer;
let boardPeriod = 'week';
let boardRequest = 0;
let playerId = readLocal('playerId', '');
if (!playerId) {
  playerId = globalThis.crypto?.randomUUID?.() || `player-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  writeLocal('playerId', playerId);
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function number(value) { return new Intl.NumberFormat('en-US').format(Number(value) || 0); }
function readLocal(key, fallback) {
  try { const item = localStorage.getItem(STORAGE + key); return item === null ? fallback : JSON.parse(item); }
  catch { return fallback; }
}
function writeLocal(key, value) {
  try { localStorage.setItem(STORAGE + key, JSON.stringify(value)); } catch { /* Play remains available without storage. */ }
}
function rarity(id) { return (meta?.rarities || RARITIES).find(item => item.id === id) || RARITIES[0]; }
function safeUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
function sourceInfo(source) {
  if (Array.isArray(source)) source = source[0];
  if (typeof source === 'string') return { name: 'Question source', url: safeUrl(source) };
  return { name: source?.name || 'Question source', url: safeUrl(source?.url) };
}
function sourceMarkup(source) {
  const item = sourceInfo(source);
  return item.url ? `<a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.name)}</a>` : `<span>${esc(item.name)}</span>`;
}
function rarityMarkup(id, includePoints = false) {
  const tier = rarity(id);
  return `<span class="rarity-label" style="--rarity:var(--${esc(tier.id)})"><span class="rarity-dot" aria-hidden="true"></span><span>${esc(tier.label)}</span>${includePoints ? `<span class="rarity-value">${number(tier.points)} pts</span>` : ''}</span>`;
}
function trackMarkup() {
  return `<div class="rarity-track">${(meta?.rarities || RARITIES).map(tier => `<div class="rarity-cell" style="--rarity:var(--${esc(tier.id)})"><h3>${esc(tier.label)}</h3><strong>${number(tier.points)}<span>pts</span></strong></div>`).join('')}</div>`;
}
function announce(message) { $('#announcer').textContent = message; }
function toast(message) {
  clearTimeout(toastTimer);
  const element = $('#toast');
  element.textContent = message;
  element.hidden = false;
  toastTimer = setTimeout(() => { element.hidden = true; }, 4000);
}
function focusHeading(selector = 'h1') {
  const heading = $(selector, main);
  if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
}
function scrollTop() { window.scrollTo({ top: 0, behavior: 'instant' }); }
function stopTimer() { if (timerFrame) cancelAnimationFrame(timerFrame); timerFrame = undefined; }
function saveSession() {
  try {
    if (!run) sessionStorage.removeItem(STORAGE + 'run');
    else sessionStorage.setItem(STORAGE + 'run', JSON.stringify({ run, feedback, result, view, serverOffset, pendingAnswer, savedAt: Date.now() }));
  } catch { /* Session storage is an optional reconnect aid. */ }
}
function clearRound() {
  stopTimer();
  run = feedback = result = pendingAnswer = null;
  busy = false;
  saveSession();
}
function syncServerClock(payload) {
  if (Number.isFinite(payload?.serverNow)) serverOffset = payload.serverNow - Date.now();
}
async function api(path, body, timeout = 25000, extraHeaders = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? { Accept: 'application/json', ...extraHeaders } : { Accept: 'application/json', 'Content-Type': 'application/json', ...extraHeaders },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || 'The request could not be completed.');
      error.status = response.status;
      error.code = data.error;
      throw error;
    }
    return data;
  } finally { clearTimeout(timeoutId); }
}
function friendlyError(error, fallback) {
  if (error?.status === 429) return 'A few too many requests arrived at once. Give it a moment, then try again.';
  if ([404, 410].includes(error?.status)) return 'This round is no longer available. Start a fresh round to keep playing.';
  if (error?.status === 403 || error?.status === 401) return 'This round could not be restored. Start a fresh round to keep playing.';
  if (error?.status === 400 && /name|nickname/i.test(error.message)) return 'Choose a quiz name with 2–20 characters.';
  return fallback;
}

function renderHome() {
  view = 'home';
  stopTimer();
  const nickname = readLocal('nickname', '');
  const best = readLocal('best', null);
  const count = meta?.totalQuestions || 0;
  main.innerHTML = `<div class="home-grid fade-in">
    <section class="hero" aria-labelledby="home-title">
      <p class="eyebrow">All subjects. No safe bets.</p>
      <h1 id="home-title"><span>BALL</span><span class="title-second">KNOWLEDGE</span></h1>
      <p class="tagline">A little knowledge.<br>A lot of nerve.</p>
      <div class="hero-facts"><div class="hero-fact"><strong>${number(count)}</strong><span>questions in the book</span></div><div class="hero-fact"><strong>${number(meta?.categories?.length || 0)}</strong><span>categories</span></div><div class="hero-fact"><strong>6</strong><span>rarity tiers</span></div></div>
      <p class="category-strip">History <span>·</span> Film <span>·</span> Science <span>·</span> Music <span>·</span> Geography <span>·</span> Games <span>·</span> Sports <span>·</span> and the wonderfully specific.</p>
    </section>
    <section class="play-box" aria-label="Set up your round">
      <div class="mode-tabs" role="tablist" aria-label="Round mode"><button class="mode-tab" id="ranked-tab" role="tab" type="button" aria-selected="${mode === 'ranked'}">Quick play</button><button class="mode-tab" id="practice-tab" role="tab" type="button" aria-selected="${mode === 'practice'}">Practice</button></div>
      <form id="start-form">
        <div id="mode-fields"></div>
        <label class="field-label" for="nickname">Your quiz name</label>
        <div class="nickname-row"><input class="text-input" id="nickname" name="nickname" type="text" autocomplete="nickname" maxlength="20" minlength="2" placeholder="What should the board call you?" value="${esc(nickname)}" aria-describedby="name-hint" required></div>
        <p class="hint" id="name-hint">2–20 characters. Ranked scores and names are public.</p>
        <button class="primary-button full-width" id="start-button" type="submit">Let’s play</button>
        <p class="inline-error" id="start-error" role="alert" hidden></p>
        <p class="play-footnote" id="play-footnote">${number(meta.roundLength)} questions · ${number(meta.questionSeconds)} seconds each · one shot per answer</p>
        <div class="personal-best"><span>Your best on this device</span><strong>${best ? `${number(best.score)} pts` : 'A clean slate'}</strong></div>
      </form>
    </section>
  </div>
  <section class="rarity-section" aria-labelledby="rarity-heading"><div class="section-heading"><h2 id="rarity-heading">The rarer the knowledge, the bigger the score.</h2><p>Correct answers earn the points. Speed adds up to 25%.</p></div>${trackMarkup()}<details class="rules-disclosure"><summary>What makes a fair round?</summary><p>Every ranked round has the same mix: 3 common, 3 uncommon, 2 obscure, 2 epic, 1 legendary, and 1 one of one. The questions and answer positions are shuffled. No repeats within a round. The clock stops while you read the answer.</p><p>Rarity is an editorial difficulty estimate, not a measured global success rate. Practice lets you choose a subject and take the timer off; practice scores stay off the shared board.</p></details></section>`;
  $('#ranked-tab').addEventListener('click', () => switchMode('ranked'));
  $('#practice-tab').addEventListener('click', () => switchMode('practice'));
  $('#start-form').addEventListener('submit', startRound);
  renderModeFields();
}
function switchMode(nextMode) {
  if (busy) return;
  mode = nextMode;
  $('#ranked-tab').setAttribute('aria-selected', String(mode === 'ranked'));
  $('#practice-tab').setAttribute('aria-selected', String(mode === 'practice'));
  renderModeFields();
}
function renderModeFields() {
  const fields = $('#mode-fields');
  if (!fields) return;
  if (mode === 'ranked') {
    fields.innerHTML = `<p class="mode-description">A random mix of everything. Work your way through all six rarities and put your score on the board.</p>${meta.leaderboardAvailable === false ? '<p class="inline-notice">The shared board is taking a break. You can still play and keep a personal best.</p>' : ''}`;
    $('#play-footnote').textContent = `${meta.roundLength} questions · ${meta.questionSeconds} seconds each · one shot per answer`;
    $('#start-button').textContent = 'Let’s play';
  } else {
    fields.innerHTML = `<p class="mode-description">Pick your territory. Learn something wonderfully useless. Practice scores stay off the shared board.</p><div class="select-wrap"><label class="field-label" for="category">Subject</label><select class="select-input" id="category"><option value="all">A bit of everything</option>${meta.categories.map(c => `<option value="${esc(c.id)}"${selectedCategory === c.id ? ' selected' : ''}>${esc(c.label)} (${number(c.count)})</option>`).join('')}</select></div><label class="check-row"><input type="checkbox" id="untimed"${practiceUntimed ? ' checked' : ''}>Take the timer off</label>`;
    $('#category').addEventListener('change', event => { selectedCategory = event.target.value; });
    $('#untimed').addEventListener('change', event => { practiceUntimed = event.target.checked; $('#play-footnote').textContent = practiceUntimed ? 'No clock. No pressure. No leaderboard.' : `${meta.roundLength} questions · ${meta.questionSeconds} seconds each · just for you`; });
    $('#play-footnote').textContent = practiceUntimed ? 'No clock. No pressure. No leaderboard.' : `${meta.roundLength} questions · ${meta.questionSeconds} seconds each · just for you`;
    $('#start-button').textContent = 'Start practicing';
  }
  $('#nickname').required = mode === 'ranked';
  $('#name-hint').textContent = mode === 'ranked' ? '2–20 characters. Ranked scores and names are public.' : 'Optional for practice. Nothing is posted to the board.';
}
async function startRound(event) {
  event.preventDefault();
  if (busy) return;
  const name = $('#nickname').value.trim();
  const errorElement = $('#start-error');
  if (mode === 'ranked' && (name.length < 2 || name.length > 20)) {
    errorElement.textContent = 'Choose a quiz name with 2–20 characters.';
    errorElement.hidden = false;
    $('#nickname').focus();
    return;
  }
  busy = true;
  $('#start-button').disabled = true;
  $('#start-button').innerHTML = '<span class="spinner-small" aria-hidden="true"></span> Drawing your questions…';
  errorElement.hidden = true;
  writeLocal('nickname', name);
  try {
    const payload = await api('/api/runs', { mode, category: mode === 'practice' ? selectedCategory : 'all', nickname: name || 'Practicing', untimed: mode === 'practice' && practiceUntimed, playerId });
    syncServerClock(payload);
    run = payload;
    feedback = result = pendingAnswer = null;
    busy = false;
    playSound('start');
    renderQuestion();
    scrollTop();
    focusHeading();
  } catch (error) {
    busy = false;
    $('#start-button').disabled = false;
    $('#start-button').textContent = mode === 'ranked' ? 'Let’s play' : 'Start practicing';
    errorElement.textContent = friendlyError(error, 'The game couldn’t connect just yet. Your name is saved—try again in a moment.');
    errorElement.hidden = false;
  }
}

function renderQuestion(startClock = true) {
  view = 'question';
  stopTimer();
  const q = run.question;
  const total = run.total || meta.roundLength;
  const tier = rarity(q.rarity);
  main.innerHTML = `<section class="game-shell fade-in" aria-label="Current question">
    <div class="game-heading"><div class="round-counter"><strong>${String(q.number).padStart(2, '0')}</strong><span>/ ${total}</span><span class="mode-tag">${run.mode === 'practice' ? 'Practice' : 'Ranked'}</span></div><div class="score-display"><span>SCORE</span><strong id="score-value">${number(run.score)}</strong></div></div>
    <div class="question-progress" aria-hidden="true">${Array.from({ length: total }, (_, i) => `<span class="progress-tick${i < q.number - 1 ? ' done' : i === q.number - 1 ? ' current' : ''}"></span>`).join('')}</div>
    <div class="question-meta"><span class="question-category">${esc(q.categoryLabel || q.category)}</span>${rarityMarkup(q.rarity, true)}</div>
    <h1 class="question-prompt${q.prompt.length > 150 ? ' long' : ''}" id="question-title">${esc(q.prompt)}</h1>
    ${q.deadline ? '<div class="time-row" id="timer-row"><div class="timer-track" aria-hidden="true"><div class="timer-fill" id="timer-fill"></div></div><div class="timer-reading" id="timer-reading" aria-label="Time remaining"><span id="timer-number">15.0</span><small>s</small></div></div>' : '<div class="time-row untimed">Untimed practice · take your time</div>'}
    <div class="answers" role="group" aria-labelledby="question-title">${q.options.map((option, index) => `<button class="answer-button" data-choice="${index}" type="button"><span class="answer-letter" aria-hidden="true">${String.fromCharCode(65 + index)}</span><span class="answer-text">${esc(option)}</span><span class="answer-icon" aria-hidden="true"></span></button>`).join('')}</div>
    <div class="question-bottom" id="question-bottom"><p class="keyboard-hint">Keys 1–4 to answer</p><button class="text-button" type="button" id="leave-round">Leave round</button></div>
    <div id="feedback-area"></div><div id="game-error" role="alert"></div>
  </section>`;
  $$('.answer-button').forEach(button => button.addEventListener('click', () => answerQuestion(Number(button.dataset.choice))));
  $('#leave-round').addEventListener('click', confirmLeave);
  saveSession();
  if (pendingAnswer && pendingAnswer.questionId === q.id) {
    lockChoices(pendingAnswer.choice);
    renderGameError(new Error('retry'), () => answerQuestion(pendingAnswer.choice, true));
  } else if (startClock) updateTimer();
}
function updateTimer() {
  if (view !== 'question' || busy || !run?.question?.deadline) return;
  const seconds = Math.max(0, (run.question.deadline - Date.now() - serverOffset) / 1000);
  const fullSeconds = meta.questionSeconds || 15;
  const timerNumber = $('#timer-number');
  if (!timerNumber) return;
  timerNumber.textContent = seconds.toFixed(1);
  $('#timer-fill').style.transform = `scaleX(${Math.min(1, seconds / fullSeconds)})`;
  $('#timer-row').classList.toggle('urgent', seconds <= 5);
  if (seconds <= 5 && seconds > 0 && warnedQuestionId !== run.question.id) {
    warnedQuestionId = run.question.id;
    announce('Five seconds remaining.');
  }
  if (seconds <= 0) { answerQuestion(null); return; }
  timerFrame = requestAnimationFrame(updateTimer);
}
function lockChoices(choice) {
  stopTimer();
  $$('.answer-button').forEach(button => {
    button.disabled = true;
    button.classList.toggle('selected', Number(button.dataset.choice) === choice);
  });
}
async function answerQuestion(choice, retry = false) {
  if (!run || busy || (view !== 'question' && !retry)) return;
  busy = true;
  pendingAnswer = { questionId: run.question.id, choice };
  lockChoices(choice);
  $('#game-error').innerHTML = '';
  saveSession();
  try {
    const payload = await api(`/api/runs/${encodeURIComponent(run.runId)}/answer`, { token: run.runToken, questionId: run.question.id, choice });
    syncServerClock(payload);
    run.score = payload.score;
    feedback = payload;
    feedback.choice = Object.hasOwn(payload, 'choice') ? payload.choice : payload.timedOut ? null : choice;
    pendingAnswer = null;
    busy = false;
    if (payload.result) result = payload.result;
    renderFeedback();
    playSound(payload.correct ? 'correct' : 'wrong');
  } catch (error) {
    busy = false;
    renderGameError(error, () => answerQuestion(choice, true));
  }
}
function renderFeedback() {
  view = 'feedback';
  stopTimer();
  const q = run.question;
  const f = feedback;
  $('#score-value').textContent = number(f.score);
  $$('.answer-button').forEach(button => {
    const index = Number(button.dataset.choice);
    button.disabled = true;
    button.classList.toggle('selected', index === f.choice);
    button.classList.toggle('correct', index === f.correctIndex);
    button.classList.toggle('wrong', index === f.choice && !f.correct);
    button.classList.toggle('muted', index !== f.correctIndex && index !== f.choice);
    $('.answer-icon', button).textContent = index === f.correctIndex ? '✓' : index === f.choice && !f.correct ? '×' : '';
    button.setAttribute('aria-label', `${q.options[index]}${index === f.correctIndex ? ', correct answer' : ''}${index === f.choice ? ', your answer' : ''}`);
  });
  $('#question-bottom').hidden = true;
  const correctAnswer = f.answer || q.options[f.correctIndex];
  const title = f.correct ? 'You know it.' : f.timedOut || f.choice === null ? 'Time’s up.' : 'Not this one.';
  const explanation = f.explanation || (f.correct ? `Correct: ${correctAnswer}.` : `The answer is ${correctAnswer}.`);
  $('#feedback-area').innerHTML = `<div class="feedback"><div class="feedback-head ${f.correct ? 'correct' : 'wrong'}"><h2>${title}</h2><span class="points-earned">+${number(f.pointsAwarded)}</span></div><p class="feedback-explanation">${esc(explanation)}</p><div class="source-row">${sourceMarkup(f.source)}<button type="button" id="report-question">Something off?</button></div><div class="feedback-actions"><p class="bonus-note">${f.correct ? `${number((f.pointsAwarded || 0) - (f.speedBonus || 0))} base + ${number(f.speedBonus)} speed` : 'No points lost.<br>There’s more in the book.'}</p><button class="primary-button" type="button" id="next-question">${f.finished ? 'See your score' : 'Next question'}</button></div><p class="paused-note">The clock is stopped. Read the answer, then keep going.</p></div>`;
  $('#next-question').addEventListener('click', nextQuestion);
  $('#report-question').addEventListener('click', () => showReport(q.id, q.prompt));
  announce(`${title} ${correctAnswer}. ${f.pointsAwarded} points earned. Total ${f.score}.`);
  saveSession();
  requestAnimationFrame(() => { if (view === 'feedback') $('#feedback-area')?.scrollIntoView({ block: 'nearest', behavior: 'instant' }); });
}
async function nextQuestion() {
  if (!run || busy) return;
  if (feedback?.finished && result) { renderResult(); scrollTop(); focusHeading(); return; }
  busy = true;
  const nextButton = $('#next-question');
  if (nextButton) { nextButton.disabled = true; nextButton.innerHTML = '<span class="spinner-small" aria-hidden="true"></span> Drawing…'; }
  $('#game-error').innerHTML = '';
  try {
    const payload = await api(`/api/runs/${encodeURIComponent(run.runId)}/next`, { token: run.runToken });
    syncServerClock(payload);
    if (payload.result) { result = payload.result; busy = false; renderResult(); scrollTop(); focusHeading(); return; }
    run = { ...run, ...payload };
    feedback = null;
    pendingAnswer = null;
    busy = false;
    renderQuestion();
    scrollTop();
    focusHeading();
  } catch (error) {
    busy = false;
    if (nextButton) { nextButton.disabled = false; nextButton.textContent = 'Next question'; }
    renderGameError(error, nextQuestion);
  }
}
function renderGameError(error, retry) {
  stopTimer();
  const expired = [401, 403, 404, 410].includes(error?.status);
  $('#game-error').innerHTML = `<div class="error-panel"><p>${esc(friendlyError(error, 'Connection interrupted. Retry to check your answer; it won’t be submitted twice. The server’s timer keeps running.'))}</p><button type="button" id="game-retry">${expired ? 'Start a fresh round' : 'Retry connection'}</button></div>`;
  $('#game-retry').addEventListener('click', expired ? () => { clearRound(); renderHome(); scrollTop(); } : retry);
  announce('Connection interrupted. A retry button is available.');
}

function renderResult() {
  view = 'result';
  stopTimer();
  const r = result;
  if (!r) return;
  if (r.mode === 'ranked' || run.mode === 'ranked') {
    const previous = readLocal('best', null);
    if (!previous || r.score > previous.score) writeLocal('best', { score: r.score, correct: r.correct, total: r.total, savedAt: Date.now() });
  }
  const isRanked = (r.mode || run.mode) === 'ranked';
  const ratio = r.correct / r.total;
  const verdict = ratio >= .9 ? 'That’s a statement.' : ratio >= .65 ? 'You brought some knowledge.' : ratio >= .35 ? 'A few things you knew. A few you do now.' : 'The next round has your name on it.';
  main.innerHTML = `<section class="result-shell fade-in"><div class="result-top"><div><p class="result-kicker">${isRanked ? 'Round complete' : 'Practice complete'} · ${esc(r.nickname || readLocal('nickname', 'You'))}</p><h1 class="result-score">${number(r.score)}<small>pts</small></h1><p class="result-verdict">${verdict}</p></div><div><div class="result-stats"><div><strong>${number(r.correct)} / ${number(r.total)}</strong><span>correct answers</span></div><div><strong>${number(r.bestStreak)}</strong><span>best streak</span></div></div><div id="result-save-status"></div><div class="result-actions"><button class="primary-button" id="play-again" type="button">Another round</button><button class="secondary-button" id="share-result" type="button">Share score</button></div><div class="result-tools"><button class="text-button" id="result-board" type="button">See the leaderboard</button><button class="text-button" id="back-home" type="button">Change mode</button></div></div></div><section class="review-section" aria-labelledby="review-heading"><h2 id="review-heading">A little more knowledge.</h2><p class="review-intro">Open any question to see the answer and its source.</p><div>${(r.review || []).map((item, index) => {
    const correct = item.choice === item.correctIndex;
    const tier = rarity(item.rarity);
    return `<details class="review-item"><summary><span class="review-mark${correct ? ' correct' : ''}" aria-label="${correct ? 'Correct' : item.choice === null ? 'Timed out' : 'Incorrect'}">${correct ? '✓' : '×'}</span><span class="review-title">${esc(item.prompt)}</span><span class="review-points">+${number(item.pointsAwarded)}</span></summary><div class="review-body">${rarityMarkup(tier.id)}<p class="review-answer">${esc(item.options?.[item.correctIndex] || item.answer || '')}</p>${!correct ? `<p class="review-your-answer">${item.choice === null ? 'You ran out of time.' : `You chose: ${esc(item.options?.[item.choice] || 'No answer')}`}</p>` : ''}${item.explanation ? `<p>${esc(item.explanation)}</p>` : ''}<div class="source-row">${sourceMarkup(item.source)}<button type="button" class="review-report" data-review="${index}">Something off?</button></div></div></details>`;
  }).join('')}</div></section></section>`;
  renderSaveStatus();
  $('#play-again').addEventListener('click', () => { clearRound(); renderHome(); scrollTop(); $('#start-form').requestSubmit(); });
  $('#share-result').addEventListener('click', shareResult);
  $('#result-board').addEventListener('click', showLeaderboard);
  $('#back-home').addEventListener('click', () => { clearRound(); renderHome(); scrollTop(); focusHeading(); });
  $$('.review-report').forEach(button => button.addEventListener('click', () => { const item = r.review[Number(button.dataset.review)]; showReport(item.questionId || item.id, item.prompt); }));
  saveSession();
  announce(`Round complete. ${number(r.score)} points, ${r.correct} out of ${r.total} correct.`);
}
function renderSaveStatus() {
  const target = $('#result-save-status');
  if (!target || !result) return;
  if ((result.mode || run.mode) !== 'ranked') target.innerHTML = '<p class="result-status">A practice round, just for you. Try Quick play to put a score on the board.</p>';
  else if (result.leaderboardSaved) target.innerHTML = '<p class="result-status"><strong>Your ranked score is saved.</strong><br>Your best score can earn a spot in the top 50.</p>';
  else {
    target.innerHTML = '<p class="result-status">Your score is saved on this device. The shared board hasn’t received it yet.</p><button class="text-button" id="retry-score-save" type="button">Retry posting score</button>';
    $('#retry-score-save').addEventListener('click', retrySave);
  }
}
async function retrySave() {
  const button = $('#retry-score-save');
  if (!button || busy) return;
  busy = true;
  button.disabled = true;
  button.textContent = 'Posting score…';
  try {
    const data = await api(`/api/runs/${encodeURIComponent(run.runId)}/save`, { token: run.runToken });
    result = { ...result, ...(data.result || {}), leaderboardSaved: data.result?.leaderboardSaved ?? data.leaderboardSaved ?? data.ok ?? false };
    renderSaveStatus();
    saveSession();
    toast(result.leaderboardSaved ? 'Your ranked score is saved.' : 'The board is still unavailable. You can retry here.');
  } catch { button.disabled = false; button.textContent = 'Retry posting score'; toast('The board is still unavailable. Your personal score is safe.'); }
  finally { busy = false; }
}
async function shareResult() {
  const text = `I scored ${number(result.score)} on Ball Knowledge — ${result.correct}/${result.total} correct. A little knowledge. A lot of nerve.`;
  const url = `${location.origin}/`;
  try {
    if (navigator.share) { await navigator.share({ title: 'Ball Knowledge', text, url }); return; }
    await navigator.clipboard.writeText(`${text}\n${url}`);
    toast('Score and game link copied.');
  } catch (error) {
    if (error.name === 'AbortError') return;
    openDialog('Share your score', `<div class="dialog-copy"><p>Copy this score and send it to your challengers.</p><textarea class="report-text share-field" id="share-field" readonly>${esc(`${text}\n${url}`)}</textarea></div>`);
    $('#share-field').select();
  }
}

function openDialog(title, html) {
  $('#dialog-title').textContent = title;
  dialogContent.innerHTML = html;
  if (!dialog.open) dialog.showModal();
}
function closeDialog() { if (dialog.open) dialog.close(); }
function confirmLeave() {
  if (!meta) return;
  if (!run || view === 'result' || view === 'home') { clearRound(); renderHome(); scrollTop(); return; }
  openDialog('Leave this round?', '<div class="dialog-copy"><p>This round won’t post a score. Your active question’s timer keeps running while this is open.</p></div><div class="dialog-actions"><button class="secondary-button" id="keep-playing" type="button">Keep playing</button><button class="primary-button" id="confirm-leave" type="button">Leave round</button></div>');
  $('#keep-playing').addEventListener('click', closeDialog);
  $('#confirm-leave').addEventListener('click', () => { closeDialog(); clearRound(); renderHome(); scrollTop(); focusHeading(); });
}
function showHelp() {
  openDialog('How to play', `<div class="dialog-copy"><p><strong>Twelve questions. Fifteen seconds each.</strong> Choose one answer before the clock runs out. A wrong answer or a timeout earns zero; you never lose points.</p><p>The timer stops after each answer. Read the explanation, check the source, then tap <strong>Next question</strong> when you’re ready.</p><h3>Rare knowledge pays off</h3>${trackMarkup()}<p>A correct answer earns its rarity’s points, plus a speed bonus of up to 25%. Every ranked round uses the same mix of rarities; the questions and answer positions change.</p><h3>Your pace, your subject</h3><p>Choose <strong>Practice</strong> for a particular category or a round without the clock. Practice doesn’t post to the shared leaderboard.</p><p>On a keyboard, use <strong>1–4</strong> for the answers and <strong>Enter</strong> to move to the next question. Switching tabs doesn’t stop a timed question.</p><h3>Found a dodgy question?</h3><p>Use <strong>Something off?</strong> below an answer or in your round review. Rarity is an editorial estimate. The community question bank can contain mistakes; reports help identify them.</p></div>`);
}
function showCredits() {
  openDialog('Questions & credits', `<div class="dialog-copy"><p>Ball Knowledge is a general trivia game from <a href="https://dfe-directory.onrender.com/" target="_blank" rel="noopener noreferrer">Daily Flyer</a>.</p><h3>The question book</h3><p>The main question bank is adapted from <a href="https://opentdb.com/" target="_blank" rel="noopener noreferrer">Open Trivia Database</a>, a community-reviewed collection, under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a>. Questions are normalized, deduplicated, filtered, and assigned rarity tiers for this game. Supplemental questions link to their references after you answer.</p><p>Rarity is an editorial difficulty estimate. It does not claim that only one person knows an answer. We do not claim every community-sourced question has been independently fact-checked. Use the question’s report link when wording or an answer needs a second look.</p><p><a href="https://github.com/shnider42/daily_flyer/blob/feat/ball-knowledge/games/ball-knowledge/data/questions.json" target="_blank" rel="noopener noreferrer">Adapted question bank</a> · <a href="https://github.com/shnider42/daily_flyer/blob/feat/ball-knowledge/games/ball-knowledge/data/manifest.json" target="_blank" rel="noopener noreferrer">Sources & methodology</a></p><h3>Scores & privacy</h3><p>Ranked quiz names, scores, and completion dates appear on the public leaderboard. Use a nickname you’re comfortable sharing. A random browser identifier connects your scores so the board can show your best. No account or email address is needed.</p><p>Your preferences and personal best are saved in this browser. Question reports are private and are used to review the question bank.</p><p>This is a casual competition: using outside help or creating new browser identities can’t be ruled out.</p><p>Sound is optional and starts only after you turn it on. No ad scripts or tracking pixels are used.</p></div>`);
}
function showLeaderboard() {
  openDialog('The knowledge board', '<div class="board-tabs" role="tablist" aria-label="Leaderboard period"><button type="button" role="tab" data-period="week">Last 7 days</button><button type="button" role="tab" data-period="all">All time</button></div><p class="board-caption">Best ranked scores. Same rarity mix, different questions. How high can you get?</p><div id="board-content" aria-live="polite"></div>');
  $$('[data-period]', dialog).forEach(button => button.addEventListener('click', () => { boardPeriod = button.dataset.period; loadLeaderboard(); }));
  loadLeaderboard();
}
async function loadLeaderboard() {
  const requestId = ++boardRequest;
  const target = $('#board-content');
  if (!target) return;
  $$('[data-period]', dialog).forEach(button => button.setAttribute('aria-selected', String(button.dataset.period === boardPeriod)));
  target.innerHTML = '<div class="board-empty"><p>Opening the board…</p></div>';
  try {
    const data = await api(`/api/leaderboard?period=${encodeURIComponent(boardPeriod)}`);
    if (requestId !== boardRequest || !target.isConnected) return;
    if (!data.available) {
      target.innerHTML = '<div class="board-empty"><strong>The board is taking a break.</strong><p>Your quiz is still ready to play. Check the board again in a moment.</p></div><button class="text-button" id="retry-board" type="button">Try again</button>';
      $('#retry-board').addEventListener('click', loadLeaderboard);
    } else if (!data.entries?.length) {
      target.innerHTML = `<div class="board-empty"><strong>A clean board.</strong><p>${boardPeriod === 'week' ? 'No scores in the last 7 days. There’s a first place going spare.' : 'The first score is still up for grabs.'}</p></div>`;
    } else {
      target.innerHTML = `<table class="board-list"><thead><tr><th scope="col">#</th><th scope="col">Player</th><th scope="col">Points</th><th scope="col">Right</th></tr></thead><tbody>${data.entries.map((entry, i) => `<tr><td>${number(entry.rank || i + 1)}</td><td>${esc(entry.nickname)}</td><td>${number(entry.score)}</td><td>${number(entry.correct)}/${number(entry.total)}</td></tr>`).join('')}</tbody></table><p class="hint">${boardPeriod === 'week' ? 'Your best ranked score from the last 7 days.' : 'Your best ranked score across every week.'}</p>`;
    }
  } catch {
    if (requestId !== boardRequest || !target.isConnected) return;
    target.innerHTML = '<div class="board-empty"><strong>Couldn’t reach the board.</strong><p>The connection may need another moment.</p></div><button class="text-button" id="retry-board" type="button">Try again</button>';
    $('#retry-board').addEventListener('click', loadLeaderboard);
  }
}
function showReport(questionId, prompt) {
  openDialog('Give this one a second look', `<form class="dialog-form" id="report-form"><p class="board-caption">${esc(prompt)}</p><label class="field-label" for="report-reason">What seems wrong?</label><textarea class="report-text" id="report-reason" minlength="5" maxlength="400" required placeholder="Wrong answer, ambiguous wording, an outdated fact…"></textarea><p class="hint">A short explanation helps. Please leave personal details out.</p><p class="inline-error" id="report-error" role="alert" hidden></p><button class="primary-button" type="submit" id="send-report">Send question report</button></form>`);
  $('#report-form').addEventListener('submit', async event => {
    event.preventDefault();
    const reason = $('#report-reason').value.trim();
    if (reason.length < 5) return;
    const button = $('#send-report');
    button.disabled = true;
    button.textContent = 'Sending…';
    try {
      await api('/api/reports', { runId: run.runId, token: run.runToken, questionId, reason });
      closeDialog();
      toast('Question reported. Thanks for keeping the book honest.');
    } catch {
      button.disabled = false;
      button.textContent = 'Send question report';
      $('#report-error').textContent = 'The report couldn’t be sent yet. Your explanation is still here—please retry.';
      $('#report-error').hidden = false;
    }
  });
}

function updateSoundButton() {
  const button = $('#sound-button');
  button.setAttribute('aria-pressed', String(soundEnabled));
  button.setAttribute('aria-label', soundEnabled ? 'Turn sound off' : 'Turn sound on');
  button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m11 5-5 4H3v6h3l5 4V5Z"/>${soundEnabled ? '<path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>' : '<path d="m16 9 5 6m0-6-5 6"/>'}</svg>`;
}
function unlockSound() {
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    if (!audioContext) audioContext = new Audio();
    if (audioContext.state === 'suspended') audioContext.resume();
  } catch { /* Audio is optional. */ }
}
function playSound(kind) {
  if (!soundEnabled || !audioContext) return;
  try {
    const tones = kind === 'correct' ? [523.25, 659.25, 783.99] : kind === 'wrong' ? [220, 174.61] : [392, 523.25];
    tones.forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const time = audioContext.currentTime + index * .065;
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(.045, time + .008);
      gain.gain.exponentialRampToValueAtTime(.001, time + .13);
      oscillator.connect(gain); gain.connect(audioContext.destination);
      oscillator.start(time); oscillator.stop(time + .15);
    });
  } catch { /* A disabled audio device must not interrupt a round. */ }
}

$('#home-link').addEventListener('click', event => { event.preventDefault(); confirmLeave(); });
$('#leaderboard-button').addEventListener('click', showLeaderboard);
$('#help-button').addEventListener('click', showHelp);
$('#credits-button').addEventListener('click', showCredits);
$('#dialog-close').addEventListener('click', closeDialog);
dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(); } });
$('#sound-button').addEventListener('click', () => { soundEnabled = !soundEnabled; writeLocal('sound', soundEnabled); updateSoundButton(); if (soundEnabled) { unlockSound(); playSound('start'); } });
document.addEventListener('pointerdown', () => { if (soundEnabled) unlockSound(); }, { once: true });
document.addEventListener('keydown', event => {
  if (dialog.open || event.altKey || event.ctrlKey || event.metaKey || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) return;
  if (soundEnabled) unlockSound();
  if (view === 'question' && /^[1-4]$/.test(event.key) && !busy && !pendingAnswer) { event.preventDefault(); answerQuestion(Number(event.key) - 1); }
  else if (view === 'feedback' && event.key === 'Enter' && !busy && document.activeElement?.tagName !== 'BUTTON' && document.activeElement?.tagName !== 'A') { event.preventDefault(); nextQuestion(); }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && view === 'question' && !busy && !pendingAnswer) { stopTimer(); updateTimer(); } });
window.addEventListener('pagehide', saveSession);
updateSoundButton();

async function boot() {
  try {
    meta = await api('/api/meta', undefined, 40000);
    $('#version-label').textContent = meta.version ? `v${meta.version}` : '';
    let saved;
    try { saved = JSON.parse(sessionStorage.getItem(STORAGE + 'run')); } catch { /* No restorable round. */ }
    if (saved?.run?.runId && saved?.run?.runToken && Date.now() - saved.savedAt < 60 * 60 * 1000 && ['question', 'feedback', 'result'].includes(saved.view)) {
      run = saved.run;
      feedback = saved.feedback;
      result = saved.result;
      serverOffset = Number(saved.serverOffset) || 0;
      pendingAnswer = saved.pendingAnswer;
      if (saved.view === 'result' && result) renderResult();
      else {
        try {
          const restored = await api(`/api/runs/${encodeURIComponent(run.runId)}`, undefined, 15000, { Authorization: `Bearer ${run.runToken}` });
          syncServerClock(restored);
          run = { ...run, ...restored, question: restored.question || run.question };
          if (restored.result) { result = restored.result; renderResult(); }
          else if (restored.feedback) {
            feedback = { ...restored.feedback, choice: Object.hasOwn(restored.feedback, 'choice') ? restored.feedback.choice : restored.feedback.timedOut ? null : pendingAnswer?.choice ?? saved.feedback?.choice ?? null };
            pendingAnswer = null;
            renderQuestion(false);
            renderFeedback();
          } else { feedback = null; pendingAnswer = null; renderQuestion(); toast('Round restored. The question timer kept running.'); }
        } catch (error) {
          if ([401, 403, 404, 410].includes(error?.status)) { clearRound(); renderHome(); toast('That round has ended. A fresh set of questions is ready.'); }
          else if (saved.view === 'feedback' && feedback) { pendingAnswer = null; renderQuestion(false); renderFeedback(); }
          else { renderQuestion(); toast('Round restored. The question timer kept running.'); }
        }
      }
    } else renderHome();
  } catch {
    main.innerHTML = '<section class="fatal-error"><p class="eyebrow">Ball Knowledge</p><h1>The question book is taking a moment.</h1><p>The game may be waking up. Give the connection another try.</p><button class="primary-button" id="retry-boot" type="button">Try again</button></section>';
    $('#retry-boot').addEventListener('click', () => { main.innerHTML = '<div class="loading-screen"><div class="loader" aria-hidden="true"></div><p>Opening the question book…</p></div>'; boot(); });
  }
}
boot();
