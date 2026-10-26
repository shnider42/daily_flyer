(function () {
  'use strict';
  const ERAS = ['2018–2019', '2020–2021', '2022–2023', '2024–2025', '2026'];
  const DEPTHS = ['overview', 'refresher', 'detailed'];
  const REGIONS = ['all', 'NA', 'EU', 'MENA', 'SAM', 'OCE', 'APAC', 'SSA'];
  const TOPICS = ['all', 'format', 'results', 'people'];
  const ORDERS = ['essentials', 'oldest', 'newest'];
  const HOSTS = ['www.rocketleague.com', 'blast.tv', 'nrg.gg', 'vitality.gg'];
  const defaults = () => ({since: '', mode: 'all', exclusive: false, depth: 'refresher', region: 'all', q: '', topic: 'all', era: 'all', order: 'essentials'});
  function validDay(day) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return false;
    const value = Date.parse(day + 'T00:00:00Z');
    return Number.isFinite(value) && new Date(value).toISOString().slice(0, 10) === day;
  }
  function localDay(d) { return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'); }
  function relativeDay(mode, now = new Date()) {
    const d = new Date(now); const day = d.getDate(); d.setDate(1);
    if (mode === 'year') d.setFullYear(d.getFullYear() - 1); else d.setMonth(d.getMonth() - 1);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    return localDay(d);
  }
  function normalize(raw, today = localDay(new Date())) {
    const state = defaults();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return state;
    if (validDay(raw.since) && raw.since <= today && raw.since >= '1900-01-01') {
      state.since = raw.since; state.mode = ['custom', 'event', 'month', 'year'].includes(raw.mode) ? raw.mode : 'custom';
      state.exclusive = raw.exclusive === true || raw.exclusive === 'true';
    }
    if (DEPTHS.includes(raw.depth)) state.depth = raw.depth;
    if (REGIONS.includes(raw.region)) state.region = raw.region;
    if (TOPICS.includes(raw.topic)) state.topic = raw.topic;
    if (ORDERS.includes(raw.order)) state.order = raw.order;
    if (ERAS.includes(raw.era)) state.era = raw.era;
    if (typeof raw.q === 'string') state.q = raw.q.slice(0, 80).trim();
    return state;
  }
  function matches(story, state, ignoreEra = false) {
    const query = state.q.toLocaleLowerCase();
    const names = [...story.people, ...story.teams].join(' ').toLocaleLowerCase();
    return (!state.since || (state.exclusive ? story.date > state.since : story.date >= state.since)) &&
      (state.region === 'all' || story.regions.includes('global') || story.regions.includes(state.region)) &&
      (state.topic === 'all' || story.topics.includes(state.topic)) &&
      (ignoreEra || state.era === 'all' || story.era === state.era) && (!query || names.includes(query));
  }
  function selectStories(stories, state) {
    return stories.filter(s => matches(s, state)).sort((a, b) => {
      if (state.order === 'oldest') return a.date.localeCompare(b.date) || a.priority - b.priority;
      if (state.order === 'newest') return b.date.localeCompare(a.date) || a.priority - b.priority;
      return a.priority - b.priority || b.date.localeCompare(a.date);
    });
  }
  function safeURL(value) {
    try { const u = new URL(value); return u.protocol === 'https:' && HOSTS.includes(u.hostname) && !u.username && !u.password && (!u.port || u.port === '443') ? u.href : ''; }
    catch (_) { return ''; }
  }
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  // Pure selection helpers are shared with Node checks; UI runs only in a browser.
  if (typeof module !== 'undefined' && module.exports) module.exports = {validDay, relativeDay, normalize, matches, selectStories, safeURL};
  if (typeof document === 'undefined') return;

  const $ = id => document.getElementById(id);
  let data;
  try { data = JSON.parse($('rlcs-data').textContent); if (data.schema_version !== 1 || !Array.isArray(data.stories) || !data.stories.length) throw Error('Invalid edition'); }
  catch (_) { $('fallback').querySelector('.fallback-note').textContent = 'The interactive edition could not load. These reviewed starting points remain available.'; return; }
  const sourceMap = new Map(data.sources.map(s => [s.id, s]));
  const storageKey = 'dfe-rlcs-catch-up-v1';
  let state = defaults(), showAll = false, showResults = false;
  const revealed = new Set(), revealedSources = new Set();
  function date(value, short = false) { return new Date(value + 'T00:00:00Z').toLocaleDateString('en-US', {month: 'short', ...(short ? {} : {day: 'numeric'}), year: 'numeric', timeZone: 'UTC'}); }
  function readState() {
    let raw = {};
    if (location.hash.startsWith('#catch-up?')) raw = Object.fromEntries(new URLSearchParams(location.hash.slice(10)));
    else if (location.hash === '#catch-up') raw = {};
    else { try { raw = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch (_) { /* Storage is optional. */ } }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) raw = {};
    state = normalize(raw);
    if (state.mode === 'event' && !data.events.some(e => e.date === state.since)) { state.mode = 'custom'; state.exclusive = false; }
    if (state.mode === 'month' || state.mode === 'year') { state.since = relativeDay(state.mode); state.exclusive = false; }
    if ((raw.since && state.since !== raw.since && state.mode === 'all') || (raw.depth && !DEPTHS.includes(raw.depth))) message('Some saved choices were invalid. Showing a safe starting view.');
  }
  function urlHash() {
    const p = new URLSearchParams(); const baseline = defaults();
    for (const key of ['since', 'mode', 'exclusive', 'depth', 'region', 'q', 'topic', 'era', 'order']) {
      if (state[key] !== baseline[key]) p.set(key, String(state[key]));
    }
    return '#catch-up' + (p.size ? '?' + p.toString() : '');
  }
  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch (_) { /* Private browsing still works. */ }
    try { history.replaceState(null, '', urlHash()); } catch (_) { /* File previews may forbid history updates. */ }
  }
  function message(text) { $('control-message').textContent = text; }
  function sourceLink(id, allow = false) {
    const s = sourceMap.get(id); const url = safeURL(s?.url);
    if (!s || !url) return '<p class="source-note">Source unavailable.</p>';
    if (s.spoiler && !showResults && !allow && !revealedSources.has(id)) return '<div class="source-gate">' + esc(s.publisher) + ' · this source contains results.<button type="button" data-source="' + esc(id) + '">Reveal source link · may spoil results ↗</button></div>';
    return '<a class="source-link" target="_blank" rel="noopener noreferrer" href="' + esc(url) + '">' + esc(s.title) + ' ↗</a><p class="source-note">' + esc(s.publisher) + ' · ' + esc(s.kind) + (s.published_at ? ' · Published ' + esc(date(s.published_at)) : ' · Publication date not supplied') + '<br>Checked ' + esc(date(s.checked_at)) + '</p>';
  }
  function visual(v) {
    let body = '';
    if (v.kind === 'change') body = '<div class="change-visual"><span>' + esc(v.left) + '</span><b aria-hidden="true">→</b><span>' + esc(v.right) + '</span></div>';
    if (v.kind === 'score') body = '<div class="score-visual"><div class="score-teams"><span>' + esc(v.left) + '</span><span>' + esc(v.right) + '</span></div><div class="score-value">' + esc(v.score) + '</div></div>';
    if (v.kind === 'roster') body = '<div class="roster-visual">' + ['left', 'right'].map(side => '<div><strong>' + esc(v[side]) + '</strong>' + v[side + '_items'].map(x => '<span>' + esc(x) + '</span>').join('') + '</div>').join('') + '</div>';
    if (v.kind === 'regions') body = '<div class="regions-visual">' + v.items.map(x => '<span>' + esc(x) + '</span>').join('') + '</div>';
    return '<div class="story-visual">' + body + '<p class="visual-caption">' + esc(v.caption) + '</p></div>';
  }
  function card(story) {
    const locked = story.spoiler && !showResults && !revealed.has(story.id);
    const title = locked ? story.safe_title : story.title;
    const summary = locked ? story.safe_summary : story.summary;
    const head = '<article class="story' + (locked ? ' story-locked' : '') + '" id="story-' + esc(story.id) + '"><div class="story-head"><div class="story-meta"><span class="story-type">' + (story.category === 'format' ? 'The bigger picture' : 'Tournament story') + '</span><time datetime="' + esc(story.date) + '">' + esc(date(story.date, true)) + '</time></div><h3>' + esc(title) + '</h3><p class="story-summary">' + esc(summary) + '</p></div>';
    if (locked) return head + '<div class="spoiler-block"><div class="lock-line">Outcome protected</div><p>Headlines, players, scores and sources are revealed together.</p><button class="reveal" data-reveal="' + esc(story.id) + '" type="button" aria-label="Reveal result: ' + esc(story.safe_title) + '">Reveal this story →</button></div></article>';
    const context = state.depth !== 'detailed' ? '<p class="story-context">' + (state.depth === 'overview' ? esc(story.context) : '<strong>Why it matters:</strong> ' + esc(story.meaning)) + '</p>' : '';
    const detail = '<details class="story-detail"' + (state.depth === 'detailed' ? ' open' : '') + '><summary>What changed & sources</summary><dl><dt>Before this change</dt><dd>' + esc(story.before) + '</dd><dt>After this change</dt><dd>' + esc(story.after) + '</dd></dl><p><strong>Context:</strong> ' + esc(story.context) + '</p><div class="meaning"><span class="detail-label">Why it matters · editorial context</span><p>' + esc(story.meaning) + '</p></div><p>' + esc(story.detail) + '</p><div class="source-links"><span class="detail-label">Evidence for this story</span>' + story.source_ids.map(id => sourceLink(id, story.spoiler && !locked)).join('') + '</div><p class="source-note">' + esc(story.date_kind) + ' ' + esc(date(story.date)) + '. The checked date is separate from the event date.</p></details>';
    return head + visual(story.visual) + '<div class="story-body">' + context + detail + '<div class="story-foot"><span>' + esc([...new Set(story.source_ids.map(id => sourceMap.get(id).publisher))].join(' + ')) + '</span><span>' + story.source_ids.length + (story.source_ids.length === 1 ? ' source' : ' sources') + '</span></div></div></article>';
  }
  function renderSources() {
    $('source-count').textContent = '· ' + data.sources.length + ' sources';
    $('sources').innerHTML = data.sources.map(s => '<div class="source-row"><span class="publisher">' + esc(s.publisher) + '<small>' + esc(s.kind) + '</small></span><div>' + sourceLink(s.id) + '</div><small>Checked<br>' + esc(date(s.checked_at)) + '</small></div>').join('');
  }
  function renderControls() {
    $('when').value = state.mode; $('since').value = state.since;
    $('event-date').value = state.mode === 'event' ? state.since : '';
    $('date-field').hidden = state.mode !== 'custom'; $('event-field').hidden = state.mode !== 'event';
    $('region').value = state.region;
    if (document.activeElement !== $('search') || !searchTimer) $('search').value = state.q;
    $('order').value = state.order;
    $('spoilers').checked = showResults;
    $('spoiler-label').textContent = showResults ? 'Outcomes visible' : 'Outcomes hidden';
    document.querySelectorAll('[data-depth]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.depth === state.depth)));
    document.querySelectorAll('[data-topic]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.topic === state.topic)));
  }
  function render() {
    const all = selectStories(data.stories, state);
    const expanded = showAll || state.depth === 'detailed';
    const visible = expanded ? all : all.slice(0, 3);
    $('chapters').innerHTML = ERAS.map(era => {
      const count = data.stories.filter(s => s.era === era && matches(s, state, true)).length;
      return '<button class="chapter" type="button" data-era="' + esc(era) + '" aria-pressed="' + String(state.era === era) + '"><strong>' + esc(era) + '</strong><span>' + count + ' matching ' + (count === 1 ? 'story' : 'stories') + '</span></button>';
    }).join('');
    $('all-eras').textContent = state.era === 'all' ? 'All years selected' : 'Show all years ↗';
    $('all-eras').setAttribute('aria-pressed', String(state.era === 'all'));
    $('result-title').textContent = all.length ? (state.q ? 'Following ' + state.q + '.' : state.era !== 'all' ? 'Your ' + state.era + ' chapter.' : expanded ? 'Your selected stories.' : 'Start with these stories.') : 'A gap in this edition.';
    const range = state.since ? (state.exclusive ? 'After ' : 'From ') + date(state.since) : 'The bigger picture';
    const depthLabel = {overview: 'Plain-language overview', refresher: 'Context and visual comparisons', detailed: 'Full explanations and evidence'}[state.depth];
    $('result-description').textContent = range + ' · ' + depthLabel + (state.q ? ' · Name matches only' : '');
    $('result-count').textContent = visible.length + ' of ' + all.length + ' reviewed stories';
    const coverage = $('coverage-message'); coverage.classList.remove('warning');
    if (state.since && state.since >= data.coverage_through) {
      coverage.textContent = 'The latest included development is ' + date(data.coverage_through) + '. Later developments are not covered. An empty briefing does not mean nothing happened.'; coverage.classList.add('warning');
    } else if (state.since && state.since < data.coverage_from) {
      coverage.textContent = 'This edition begins ' + date(data.coverage_from) + '. Earlier history and many events in between have not been backfilled.'; coverage.classList.add('warning');
    } else coverage.textContent = 'Selected milestones through ' + date(data.coverage_through) + ', checked ' + date(data.reviewed_at) + '. This is not a complete match or roster archive.';
    $('stories').innerHTML = visible.length ? visible.map(card).join('') : '<div class="empty"><h3>No reviewed stories match these choices.</h3><p>This can mean the period or person is not covered yet. It does not establish that nothing changed. Try a broader date, another name, or all regions.</p><button class="secondary" type="button" data-reset="true">Show the big picture ↗</button></div>';
    $('more').hidden = all.length <= 3 || state.depth === 'detailed';
    $('more').textContent = showAll ? 'Return to the first 3 ↑' : 'Explore all ' + all.length + ' stories ↓';
    $('more').setAttribute('aria-expanded', String(expanded));
    $('remaining').textContent = !expanded && all.length > 3 ? (all.length - 3) + ' more in this selection' : '';
    renderControls(); renderSources();
  }
  function update(patch, clearMessage = true) { state = {...state, ...patch}; showAll = false; if (clearMessage) message(''); $('share-fallback').hidden = true; save(); render(); }
  function reset() { clearTimeout(searchTimer); searchTimer = null; state = defaults(); showResults = false; showAll = false; revealed.clear(); revealedSources.clear(); message('Choices reset. Results are hidden.'); save(); render(); }
  function applyDate(value, exclusive) {
    if (!validDay(value) || value > localDay(new Date()) || value < '1900-01-01') { message('Choose a valid date on or before today. Your previous briefing is still shown.'); $('since').setAttribute('aria-invalid', 'true'); return; }
    $('since').removeAttribute('aria-invalid'); update({since: value, exclusive});
  }
  let searchTimer = null;
  readState();
  $('event-date').innerHTML += data.events.map(e => '<option value="' + esc(e.date) + '">' + esc(e.label) + '</option>').join('');
  $('since').max = localDay(new Date()); $('since').min = '1900-01-01';
  $('when').addEventListener('change', e => {
    const mode = e.target.value;
    if (mode === 'all') update({mode, since: '', exclusive: false});
    else if (mode === 'month' || mode === 'year') update({mode, since: relativeDay(mode), exclusive: false});
    else { state.mode = mode; renderControls(); message(mode === 'event' ? 'Choose the last tournament you watched. The briefing will begin the following day.' : 'Choose a starting date. Changes on that date are included.'); }
  });
  $('since').addEventListener('change', e => applyDate(e.target.value, false));
  $('event-date').addEventListener('change', e => { if (e.target.value) applyDate(e.target.value, true); });
  $('region').addEventListener('change', e => update({region: e.target.value}));
  $('order').addEventListener('change', e => update({order: e.target.value}));
  $('search').addEventListener('input', e => { const q = e.target.value; clearTimeout(searchTimer); searchTimer = setTimeout(() => { searchTimer = null; update({q: q.trim().slice(0, 80)}); }, 200); });
  $('spoilers').addEventListener('change', e => { showResults = e.target.checked; if (!showResults) { revealed.clear(); revealedSources.clear(); } render(); message(showResults ? 'Results are visible in this visit.' : 'All results and result-source titles are hidden again.'); });
  $('reset').addEventListener('click', reset);
  $('all-eras').addEventListener('click', () => update({era: 'all'}));
  $('more').addEventListener('click', () => { showAll = !showAll; render(); });
  $('share').addEventListener('click', async () => {
    const url = new URL(location.href); url.hash = urlHash();
    try { await navigator.clipboard.writeText(url.href); message('Briefing link copied. Results start hidden for the recipient.'); }
    catch (_) { $('share-fallback').hidden = false; $('share-url').value = url.href; $('share-url').focus(); $('share-url').select(); message('Copy the selected link. Results will start hidden.'); }
  });
  document.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.depth) update({depth: b.dataset.depth});
    else if (b.dataset.topic) update({topic: b.dataset.topic});
    else if (b.dataset.era) update({era: b.dataset.era});
    else if (b.dataset.reset) reset();
    else if (b.dataset.reveal) {
      const id = b.dataset.reveal; revealed.add(id); render();
      const target = $('story-' + id).querySelector('summary'); target.focus();
      message('That story is revealed. Other outcomes remain protected.');
    } else if (b.dataset.source) {
      const id = b.dataset.source; revealedSources.add(id);
      // Replace just this gate; preserve expanded stories and keyboard focus.
      const gate = b.closest('.source-gate'); gate.innerHTML = sourceLink(id);
      gate.querySelector('a')?.focus();
    }
  });
  window.addEventListener('hashchange', () => { if (location.hash.startsWith('#catch-up')) { readState(); showAll = false; showResults = false; revealed.clear(); revealedSources.clear(); render(); } });
  $('glossary').innerHTML = data.glossary.map(g => '<details><summary>' + esc(g.term) + '</summary><p>' + esc(g.definition) + '</p></details>').join('');
  render(); $('fallback').hidden = true; $('controls').hidden = false; $('dynamic').hidden = false;
})();
