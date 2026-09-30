(() => {
  'use strict';
  const app = document.getElementById('mb-app');
  if (!app) return;
  const $ = (selector) => app.querySelector(selector);
  const KEY = 'dfe.metal_band.workspace.v1';
  const MAX_BYTES = 1024 * 1024;
  const views = ['start', 'band', 'music', 'shows', 'share'];
  const stages = { idea: 'Riff idea', writing: 'Writing', rehearsing: 'Rehearsing', ready: 'Stage ready' };
  const steps = [
    ['direction', 'Agree on a direction', 'Pick a few influences and describe the sound you want to make.'],
    ['lineup', 'Find your lineup', 'Get the core people together and agree on rehearsal availability.'],
    ['rehearsal', 'Book the first rehearsal', 'Choose a place, a time, and one thing to work on.'],
    ['song', 'Finish one song', 'Give it a beginning, an ending, and a rough full-length recording.'],
    ['set', 'Build a short set', 'Order your songs and time a complete run, including the gaps.'],
    ['recording', 'Choose a recording to share', 'Use a take that represents what the band actually sounds like.'],
    ['page', 'Make your band page', 'Add a bio, music, lineup, and a public booking contact.'],
    ['show', 'Line up your first show', 'Agree on the slot and logistics with the organizer.'],
  ];
  const blank = () => ({ version: 1, profile: { name: '', genre: '', location: '', email: '', tagline: '', bio: '' }, members: [], songs: [], shows: [], completed: [], gap: 20 });
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => globalThis.crypto?.randomUUID?.() || `item-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const duration = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const dateLabel = (date) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  function safeURL(value) {
    if (!value) return '';
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Use a full http:// or https:// link without embedded login details.');
    return url.href;
  }
  function validate(raw) {
    const obj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
    const str = (v, max) => { if (typeof v !== 'string' || v.length > max) throw new Error('A workspace text field is missing or too long.'); return v; };
    const required = (v, max) => { const s = str(v, max); if (!s.trim()) throw new Error('A required field is empty.'); return s; };
    const integer = (v, min, max) => { if (!Number.isInteger(v) || v < min || v > max) throw new Error('A workspace number is out of range.'); return v; };
    const bool = (v) => { if (typeof v !== 'boolean') throw new Error('Invalid workspace option.'); return v; };
    const list = (v) => { if (!Array.isArray(v) || v.length > 200 || !v.every(obj)) throw new Error('Invalid workspace list (maximum 200 entries).'); return v; };
    const ids = new Set();
    const id = (v) => { if (typeof v !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(v) || ids.has(v)) throw new Error('Invalid or duplicate item ID.'); ids.add(v); return v; };
    const url = (v) => safeURL(str(v, 2000));
    if (!obj(raw) || raw.version !== 1 || !obj(raw.profile)) throw new Error('Choose a First Riff version 1 workspace backup.');
    const p = raw.profile;
    const profile = { name: str(p.name, 100), genre: str(p.genre, 100), location: str(p.location, 120), email: str(p.email, 254), tagline: str(p.tagline, 180), bio: str(p.bio, 2000) };
    if (profile.email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(profile.email)) throw new Error('Enter a valid booking email.');
    const members = list(raw.members).map((m) => ({ id: id(m.id), name: required(m.name, 100), role: required(m.role, 100) }));
    const songs = list(raw.songs).map((s) => {
      if (!Object.hasOwn(stages, s.status)) throw new Error('Invalid song progress.');
      return { id: id(s.id), title: required(s.title, 120), seconds: integer(s.seconds, 1, 5999), bpm: s.bpm === '' ? '' : integer(s.bpm, 20, 400), tuning: str(s.tuning, 60), status: s.status, url: url(s.url), notes: str(s.notes, 2000), inSet: bool(s.inSet), published: bool(s.published) };
    });
    const shows = list(raw.shows).map((s) => {
      const date = str(s.date, 10), time = str(s.time, 5);
      const parsed = new Date(`${date}T12:00:00Z`);
      if (!/^(20|21)\d{2}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error('Enter a valid show date between 2000 and 2199.');
      if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Invalid show time.');
      if (!['idea', 'confirmed'].includes(s.status)) throw new Error('Invalid show status.');
      return { id: id(s.id), venue: required(s.venue, 160), city: required(s.city, 120), date, time, status: s.status, url: url(s.url), notes: str(s.notes, 2000) };
    });
    if (!Array.isArray(raw.completed) || raw.completed.length > steps.length || raw.completed.some((v) => !steps.some((s) => s[0] === v))) throw new Error('Invalid checklist.');
    const normalized = { version: 1, profile, members, songs, shows, completed: [...new Set(raw.completed)], gap: integer(raw.gap, 0, 300) };
    if (new Blob([JSON.stringify(normalized, null, 2)]).size > MAX_BYTES) throw new Error('Workspace is full (1 MB). Shorten notes or remove old entries after exporting a backup.');
    return normalized;
  }

  let state = blank(), currentView = 'start', saveBlocked = false, rawRecovery = '', toastTimer;
  function notify(message) {
    clearTimeout(toastTimer);
    $('#mb-status').textContent = message;
    $('#mb-status').hidden = false;
    toastTimer = setTimeout(() => { $('#mb-status').hidden = true; }, 6500);
  }
  function warning(message) { $('#mb-storage-warning').textContent = message; $('#mb-storage-warning').hidden = false; }
  try {
    rawRecovery = localStorage.getItem(KEY) || '';
    if (rawRecovery) state = validate(JSON.parse(rawRecovery));
  } catch (error) {
    if (rawRecovery) {
      saveBlocked = true;
      warning('Your saved workspace could not be read and has been left intact. Export the recovery copy below before importing a valid backup.');
      const recover = document.createElement('button');
      recover.type = 'button'; recover.textContent = 'Export recovery copy';
      recover.addEventListener('click', () => download(rawRecovery, 'first-riff-recovery.json', 'application/json'));
      $('#mb-storage-warning').append(document.createElement('br'), recover);
    } else warning('Browser storage is unavailable. You can work here, but export a workspace backup before closing this page.');
    $('#mb-save-state').textContent = 'Changes are not saved';
  }
  function persist() {
    if (saveBlocked) { $('#mb-save-state').textContent = 'Changes are not saved'; return false; }
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      $('#mb-save-state').textContent = 'Saved in this browser';
      $('#mb-storage-warning').hidden = true;
      return true;
    } catch (error) {
      $('#mb-save-state').textContent = 'Changes are not saved';
      warning('Browser storage is unavailable or full. Export a workspace backup from Band page before closing this page.');
      return false;
    }
  }
  function commit(next, message) {
    try { state = validate(next); } catch (error) { notify(error.message); return false; }
    const saved = persist();
    render();
    notify(saved ? message : `${message} In memory only; export a backup to keep it.`);
    return true;
  }
  function draft() { return JSON.parse(JSON.stringify(state)); }
  function download(content, filename, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function fileBase() { return (state.profile.name || 'first-riff').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'first-riff'; }
  function setlist() { return state.songs.filter((s) => s.inSet); }
  function runtime() { const songs = setlist(); return songs.reduce((sum, s) => sum + s.seconds, 0) + Math.max(0, songs.length - 1) * state.gap; }
  function upcoming() { return state.shows.filter((s) => s.status === 'confirmed' && s.date >= today()).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)); }
  function showView(view, focus = true) {
    currentView = views.includes(view) ? view : 'start';
    app.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== currentView; });
    app.querySelectorAll('[data-view]').forEach((b) => { if (b.dataset.view === currentView) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    if (currentView === 'share') $('#mb-preview').srcdoc = publicPage();
    try { history.replaceState(null, '', `#${currentView}`); } catch (error) { /* File previews may restrict history. */ }
    if (focus) { $('#mb-content').focus({ preventScroll: true }); $('#mb-content').scrollIntoView({ block: 'start' }); }
  }
  function empty(title, text) { return `<div class="mb-empty"><strong>${esc(title)}</strong>${esc(text)}</div>`; }
  function actions(kind, id, name) {
    return `<div class="mb-actions"><button type="button" data-edit="${kind}" data-id="${id}" aria-label="Edit ${esc(name)}">Edit</button><button type="button" data-delete="${kind}" data-id="${id}" aria-label="Remove ${esc(name)}">Remove</button></div>`;
  }
  function render() {
    $('#mb-member-count').textContent = state.members.length;
    $('#mb-song-count').textContent = state.songs.length;
    $('#mb-set-time').textContent = duration(runtime());
    $('#mb-show-count').textContent = upcoming().length;
    $('#mb-set-summary').textContent = `Set: ${duration(runtime())}`;
    $('#mb-gap').value = state.gap;
    $('#mb-download-set').disabled = !setlist().length;
    $('#mb-progress').textContent = `${state.completed.length} of ${steps.length} starting steps complete`;
    $('#mb-meter-fill').style.width = `${state.completed.length / steps.length * 100}%`;
    $('#mb-checklist').innerHTML = steps.map(([id, title, note]) => `<label class="mb-task"><input type="checkbox" data-step="${id}" ${state.completed.includes(id) ? 'checked' : ''}><span><strong>${title}</strong><small>${note}</small></span></label>`).join('');
    let next = ['It starts with a name.', 'Give your project a working name and a direction. You can change both later.', 'band', 'Name your band →'];
    if (state.profile.name) next = [`Make ${state.profile.name} real.`, 'Add the people making it happen. Start with whoever is already in.', 'band', 'Build the lineup →'];
    if (state.profile.name && state.members.length) next = ['Get the first idea down.', 'Give a riff a title, a tuning, and a tempo. Build from there.', 'music', 'Add your first song →'];
    if (state.profile.name && state.members.length && state.songs.length) next = ['Give the band a home.', 'Preview your band page and choose which songs to share.', 'share', 'Build your band page →'];
    if (state.profile.name && state.songs.some((s) => s.published) && state.completed.includes('page')) next = ['Take it to the stage.', 'Keep show possibilities and confirmed dates in one place.', 'shows', 'Plan your shows →'];
    $('#mb-next-title').textContent = next[0]; $('#mb-next-copy').textContent = next[1];
    $('#mb-next-button').dataset.go = next[2]; $('#mb-next-button').textContent = next[3];
    $('#mb-members').innerHTML = state.members.map((m) => `<article class="mb-item"><h3>${esc(m.name)}</h3><p>${esc(m.role)}</p>${actions('member', m.id, m.name)}</article>`).join('') || empty('Who’s making the noise?', 'Add your first member. Stage names are fine.');
    $('#mb-songs').innerHTML = state.songs.map((s, i) => `<article class="mb-item"><div class="mb-item-head"><h3>${String(i + 1).padStart(2, '0')} / ${esc(s.title)}</h3><span class="mb-badge">${duration(s.seconds)}</span></div><div class="mb-item-meta">${[stages[s.status], s.tuning, s.bpm ? `${s.bpm} BPM` : '', s.published ? 'Public' : 'Workspace only'].filter(Boolean).map(esc).join(' · ')}</div>${s.url ? `<p><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">Open recording ↗</a></p>` : ''}${s.notes ? `<p>${esc(s.notes)}</p>` : ''}<label class="mb-check"><input type="checkbox" data-in-set="${s.id}" ${s.inSet ? 'checked' : ''}>In set</label><div class="mb-actions"><button type="button" data-move="-1" data-id="${s.id}" aria-label="Move ${esc(s.title)} up" ${i === 0 ? 'disabled' : ''}>↑ Up</button><button type="button" data-move="1" data-id="${s.id}" aria-label="Move ${esc(s.title)} down" ${i === state.songs.length - 1 ? 'disabled' : ''}>↓ Down</button></div>${actions('song', s.id, s.title)}</article>`).join('') || empty('Every set starts with one song.', 'Save a riff idea or a song you already play. The set timer adds up your selected songs and the gaps between them.');
    $('#mb-shows').innerHTML = [...state.shows].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)).map((s) => `<article class="mb-item"><div class="mb-item-head"><h3>${esc(s.venue)}</h3><span class="mb-badge">${s.status === 'confirmed' ? 'Confirmed' : 'Possible'}</span></div><p>${esc(dateLabel(s.date))}${s.time ? ` · ${esc(s.time)} local time` : ''}<br>${esc(s.city)}${s.date < today() ? ' · Past show' : ''}</p>${s.url ? `<p><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">Event details ↗</a></p>` : ''}${s.notes ? `<p>${esc(s.notes)}</p>` : ''}${actions('show', s.id, s.venue)}</article>`).join('') || empty('Your first stage is out there.', 'Track a possible show now. Only confirmed upcoming dates appear on your band page.');
    if (currentView === 'share') $('#mb-preview').srcdoc = publicPage();
  }
  function fillProfile() { const form = $('#mb-profile-form'); Object.entries(state.profile).forEach(([key, value]) => { form.elements.namedItem(key).value = value; }); }
  const collections = { member: 'members', song: 'songs', show: 'shows' };
  function resetForm(kind) {
    const form = $(`#mb-${kind}-form`); form.reset(); form.elements.namedItem('id').value = '';
    $(`[data-cancel="${kind}"]`).hidden = true;
    if (kind === 'song') $('#mb-song-form-title').textContent = 'Add a song';
  }
  function edit(kind, id) {
    const item = state[collections[kind]].find((i) => i.id === id);
    if (!item) return;
    const form = $(`#mb-${kind}-form`);
    Object.entries(item).forEach(([key, value]) => { const field = form.elements.namedItem(key); if (field) { if (field.type === 'checkbox') field.checked = value; else field.value = value; } });
    if (kind === 'song') { form.elements.namedItem('duration').value = duration(item.seconds); $('#mb-song-form-title').textContent = 'Edit song'; }
    $(`[data-cancel="${kind}"]`).hidden = false;
    form.querySelector('input:not([type="hidden"])').focus();
    form.scrollIntoView({ block: 'start' });
  }
  app.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.view || button.dataset.go) showView(button.dataset.view || button.dataset.go);
    if (button.dataset.cancel) resetForm(button.dataset.cancel);
    if (button.dataset.edit) edit(button.dataset.edit, button.dataset.id);
    if (button.dataset.delete) {
      const kind = button.dataset.delete, key = collections[kind];
      const item = state[key].find((i) => i.id === button.dataset.id);
      if (!item || !confirm(`Remove “${item.name || item.title || item.venue}”?`)) return;
      const next = draft(); next[key] = next[key].filter((i) => i.id !== item.id);
      if (commit(next, 'Removed.')) { if ($(`#mb-${kind}-form`).elements.namedItem('id').value === item.id) resetForm(kind); }
    }
    if (button.dataset.move) {
      const next = draft(), i = next.songs.findIndex((s) => s.id === button.dataset.id), j = i + Number(button.dataset.move);
      if (i < 0 || j < 0 || j >= next.songs.length) return;
      [next.songs[i], next.songs[j]] = [next.songs[j], next.songs[i]];
      if (commit(next, 'Song order updated.')) $(`[data-move="${button.dataset.move}"][data-id="${button.dataset.id}"]:not(:disabled)`)?.focus();
    }
  });
  app.addEventListener('change', (event) => {
    const field = event.target;
    if (field.dataset.step) {
      const next = draft(); next.completed = field.checked ? [...new Set([...next.completed, field.dataset.step])] : next.completed.filter((s) => s !== field.dataset.step);
      commit(next, 'Checklist updated.'); $(`[data-step="${field.dataset.step}"]`).focus({ preventScroll: true });
    }
    if (field.dataset.inSet) {
      const next = draft(); next.songs.find((s) => s.id === field.dataset.inSet).inSet = field.checked;
      commit(next, 'Setlist updated.'); $(`[data-in-set="${field.dataset.inSet}"]`).focus({ preventScroll: true });
    }
  });
  $('#mb-gap').addEventListener('change', () => {
    const field = $('#mb-gap'); if (!field.value || !field.checkValidity()) { field.reportValidity(); field.value = state.gap; return; }
    const next = draft(); next.gap = Number(field.value); commit(next, 'Gap between songs updated.');
  });
  $('#mb-profile-form').addEventListener('submit', (event) => {
    event.preventDefault(); const next = draft(), data = new FormData(event.target);
    Object.keys(next.profile).forEach((key) => { next.profile[key] = data.get(key).trim(); });
    commit(next, 'Band details saved.');
  });
  Object.keys(collections).forEach((kind) => {
    $(`#mb-${kind}-form`).addEventListener('submit', (event) => {
      event.preventDefault(); const form = event.target, data = new FormData(form), val = (key) => String(data.get(key) || '').trim();
      let item = { id: val('id') || uid() };
      if (kind === 'member') item = { ...item, name: val('name'), role: val('role') };
      if (kind === 'song') {
        const parts = val('duration').split(':').map(Number);
        item = { ...item, title: val('title'), seconds: parts[0] * 60 + parts[1], bpm: val('bpm') ? Number(val('bpm')) : '', tuning: val('tuning'), status: val('status'), url: val('url'), notes: val('notes'), inSet: data.has('inSet'), published: data.has('published') };
      }
      if (kind === 'show') item = { ...item, venue: val('venue'), city: val('city'), date: val('date'), time: val('time'), status: val('status'), url: val('url'), notes: val('notes') };
      const next = draft(), key = collections[kind], index = next[key].findIndex((i) => i.id === item.id);
      if (index < 0) next[key].push(item); else next[key][index] = item;
      if (commit(next, `${kind[0].toUpperCase() + kind.slice(1)} saved.`)) resetForm(kind);
    });
  });
  $('#mb-export').addEventListener('click', () => { download(JSON.stringify(state, null, 2), `${fileBase()}-workspace.json`, 'application/json'); notify('Workspace backup exported. It includes your private notes.'); });
  $('#mb-import').addEventListener('click', () => $('#mb-import-file').click());
  $('#mb-import-file').addEventListener('change', async (event) => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > MAX_BYTES) throw new Error('This file is too large. Workspace backups must be under 1 MB.');
      const imported = validate(JSON.parse(await file.text()));
      if (!confirm(`Replace this browser’s workspace with “${imported.profile.name || 'Unnamed band'}”? Export your current workspace first if you want to keep it.`)) return;
      saveBlocked = false;
      if (commit(imported, 'Workspace imported.')) { fillProfile(); Object.keys(collections).forEach(resetForm); }
    } catch (error) { notify(`Import failed: ${error.message}`); }
    finally { event.target.value = ''; }
  });
  $('#mb-download-set').addEventListener('click', () => {
    const songs = setlist();
    const text = [`${state.profile.name || 'Your band'} — Setlist`, `Runtime: ${duration(runtime())} · ${state.gap}s between songs`, '', ...songs.map((s, i) => `${i + 1}. ${s.title} — ${duration(s.seconds)}${s.tuning ? ` · ${s.tuning}` : ''}${s.bpm ? ` · ${s.bpm} BPM` : ''}`)].join('\n');
    download(text, `${fileBase()}-setlist.txt`, 'text/plain'); notify('Setlist downloaded.');
  });
  $('#mb-download-page').addEventListener('click', () => { download(publicPage(), `${fileBase()}-band.html`, 'text/html'); notify('Band page downloaded. Host this HTML file to give it a public web address.'); });
  window.addEventListener('hashchange', () => showView(location.hash.slice(1), false));
  window.addEventListener('storage', (event) => {
    if (event.key !== KEY && event.key !== null) return;
    saveBlocked = true; $('#mb-save-state').textContent = 'Reload to use the latest save';
    warning('This workspace changed in another tab. Export any work you want to keep here, then reload to use the latest saved workspace. Changes in this tab will not overwrite the other tab.');
  });

  function publicPage() {
    const p = state.profile, songs = state.songs.filter((s) => s.published), shows = upcoming();
    const link = (url, label) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${esc(p.tagline || p.bio.slice(0, 160) || 'Music, lineup, and live shows.')} "><title>${esc(p.name || 'Your band')} — Official band page</title><style>
      :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#12140f;color:#f1f0e5;font:16px/1.65 Arial,Helvetica,sans-serif}main{max-width:900px;margin:auto;padding:46px 30px}header{border-bottom:1px solid #434a36;padding-bottom:45px}h1{font-family:Impact,'Arial Narrow',Arial,sans-serif;font-size:clamp(45px,10vw,90px);line-height:1.03;letter-spacing:-1px;margin:15px 0;overflow-wrap:anywhere;text-transform:uppercase}h2{font-size:26px;letter-spacing:-.5px}h3{font-size:18px;margin:0}p{color:#bcc3ae;white-space:pre-wrap;overflow-wrap:anywhere}.kicker{font:12px/1.8 monospace;letter-spacing:2px;color:#d0f36a;text-transform:uppercase}.tagline{font-size:23px;color:#eeeede}a{color:#d0f36a;overflow-wrap:anywhere}a:focus-visible{outline:3px solid #d0f36a;outline-offset:5px}.booking{display:inline-block;padding:10px 16px;border:1px solid #d0f36a;text-decoration:none;margin-top:15px}section{padding:20px 0;border-bottom:1px solid #434a36}.row{padding:16px 0;border-bottom:1px solid #2e3426}.row:last-child{border:0}.row p{margin:5px 0}.muted{font-size:14px;color:#a3aa96}.lineup{display:flex;flex-wrap:wrap;gap:18px 42px;padding-bottom:15px}.lineup div{min-width:140px}.empty{font-style:italic}footer{padding:26px 0;font:12px monospace;color:#a3aa96}@media(max-width:500px){main{padding:30px 20px}.tagline{font-size:19px}}</style></head><body><main><header><div class="kicker">${esc([p.genre || 'Heavy music', p.location].filter(Boolean).join(' / '))}</div><h1>${esc(p.name || 'Your band')}</h1>${p.tagline ? `<p class="tagline">${esc(p.tagline)}</p>` : ''}${p.bio ? `<p>${esc(p.bio)}</p>` : '<p class="empty">The next chapter starts here.</p>'}${p.email ? `<a class="booking" href="mailto:${esc(encodeURIComponent(p.email))}">Booking &amp; inquiries ↗</a>` : ''}</header>
      <section><div class="kicker">TURN IT UP</div><h2>Music</h2>${songs.length ? songs.map((s) => `<article class="row"><h3>${esc(s.title)}</h3><p class="muted">${duration(s.seconds)}</p>${s.url ? link(s.url, 'Listen') : '<p class="muted">Recording coming soon.</p>'}</article>`).join('') : '<p class="empty">New music is in the works. Stay tuned.</p>'}</section>
      <section><div class="kicker">SEE IT LIVE</div><h2>Upcoming shows</h2>${shows.length ? shows.map((s) => `<article class="row"><h3>${esc(s.venue)}</h3><p>${esc(dateLabel(s.date))}${s.time ? ` · ${esc(s.time)} local time` : ''}<br>${esc(s.city)}</p>${s.url ? link(s.url, 'Event details / tickets') : ''}</article>`).join('') : '<p class="empty">No upcoming shows announced.</p>'}</section>
      ${state.members.length ? `<section><div class="kicker">THE PEOPLE BEHIND THE SOUND</div><h2>The band</h2><div class="lineup">${state.members.map((m) => `<div><h3>${esc(m.name)}</h3><p>${esc(m.role)}</p></div>`).join('')}</div></section>` : ''}
      <footer>${esc(p.name || 'Your band')} / Made with First Riff</footer></main></body></html>`;
  }
  fillProfile(); render(); showView(location.hash.slice(1), false);
})();
