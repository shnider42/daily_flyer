(function () {
  'use strict';
  const D = window.NotebookData;
  const C = window.NotebookCloud;
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const store = D.createStore();
  const TAGS = {note: 'Loose note', speech: 'For the speech', ask: 'Ask him', weekend: 'The weekend'};
  const SECTIONS = {before: 'Before the weekend', weekend: 'The weekend', day: 'On the day'};
  const SUGGESTIONS = [
    ['Ask him what he’d like help with', 'before'],
    ['Find out the suit plans', 'before'],
    ['Check when I’m giving the speech', 'before'],
    ['Talk through the bachelor weekend', 'weekend'],
    ['Confirm who’s looking after the rings', 'day']
  ];
  let state = D.fresh();
  let lastValidState = JSON.parse(JSON.stringify(state));
  let unlocked = false;
  let currentPage = 'notes';
  let noteFilter = 'all';
  let planView = 'tasks';
  let cloudVersion = 0;
  let dirty = false;
  let generation = 0;
  let saving = null;
  let syncTimer = null;
  let conflict = false;
  let localBlocked = false;
  let localSaved = false;
  let suspendedEditor = null;
  let editor = null;
  let pendingImport = null;
  let undoAction = null;
  let toastTimer = null;
  let setupToken = new URLSearchParams(location.hash.replace(/^#/, '')).get('setup') || '';
  let readingSize = 1;
  let timerStarted = 0;
  let timerElapsed = 0;
  let timerTick = null;
  let editorOriginal = '';
  const now = () => new Date().toISOString();
  const clone = value => JSON.parse(JSON.stringify(value));
  const base = () => ({id: D.id(), createdAt: now(), updatedAt: now()});

  function element(tag, className, text) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = text;
    return item;
  }
  function button(text, action, id, className = 'text-button') {
    const item = element('button', className, text);
    item.type = 'button';
    if (action) item.dataset.action = action;
    if (id) item.dataset.id = id;
    return item;
  }
  function dateLabel(value, options) {
    if (!value) return '';
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d, 12).toLocaleDateString(undefined, options || {month: 'short', day: 'numeric', year: 'numeric'});
  }
  function toast(message, undo = null) {
    clearTimeout(toastTimer);
    $('#toast-message').textContent = message;
    $('#undo-button').hidden = !undo;
    undoAction = undo;
    $('#toast').hidden = false;
    toastTimer = setTimeout(() => { $('#toast').hidden = true; undoAction = null; }, undo ? 16000 : 6500);
  }
  function status(message) {
    $('#save-status').textContent = message;
    $('#mobile-save-status').textContent = message;
  }
  function warning(message) {
    $('#save-warning').textContent = message;
    $('#save-warning').hidden = !message;
  }
  function metaWrite() {
    // Sync metadata and its exact snapshot are one atomic browser-storage write.
    localSave();
  }
  function localSave(replace = false) {
    try {
      const metadata = {version: cloudVersion, pending: dirty};
      if (replace) store.replace(state, metadata); else store.save(state, metadata);
      localBlocked = false;
      localSaved = true;
      return true;
    } catch (error) {
      localSaved = false;
      if (error.code === 'STALE_DATA') {
        localBlocked = true;
        $('#external-warning').hidden = false;
        status('Another tab has changes');
      } else {
        warning('This browser couldn’t keep a safety copy. Keep this page open until “Saved online” appears, or download a backup.');
      }
      return false;
    }
  }
  function changed() {
    if (!unlocked) return;
    state.updatedAt = now();
    try { lastValidState = D.validate(state); }
    catch (error) { state = clone(lastValidState); fillInputs(); renderAll(); toast(error.message); return; }
    generation++;
    dirty = true;
    localSave();
    if (!conflict && !localBlocked) status('Saving…');
    clearTimeout(syncTimer);
    syncTimer = setTimeout(sync, 700);
  }
  async function sync() {
    if (!unlocked || !dirty || conflict || localBlocked) return false;
    if (saving) { await saving; if (dirty && !conflict && !localBlocked) return sync(); return !dirty; }
    const sentGeneration = generation;
    let snapshot;
    try { snapshot = D.validate(state); } catch (error) { warning(error.message); status('Not saved — download a copy'); return false; }
    status('Saving…');
    saving = (async () => {
      try {
        const result = await C.save(snapshot, cloudVersion);
        cloudVersion = result.version;
        dirty = generation !== sentGeneration;
        metaWrite();
        if (!dirty) { status('Saved online'); if (!localBlocked) warning(''); }
        return true;
      } catch (error) {
        if (error.code === 'CONFLICT') {
          conflict = true;
          status('Choose which copy to keep');
          showConflict();
        } else if (error.code === 'LOCKED') {
          status(localSaved ? 'Saved here — unlock to sync' : 'Unlock to save your writing');
          warning('Your session has ended. Unlock the notebook again to save your latest writing online.');
          showLock('Enter your password again. Your unfinished writing is still here in this open page.');
        } else {
          status(localSaved ? 'Saved here — waiting for connection' : 'Not saved — keep this page open');
          warning(localSaved ? 'Your latest changes haven’t reached the online notebook yet. Keep this tab open; saving will retry when the connection returns. You can also download a backup.' : 'Your latest writing is only in this open page. Online saving and the browser safety copy both failed. Keep the page open and download a backup.');
        }
        return false;
      } finally { saving = null; }
    })();
    const okay = await saving;
    if (okay && dirty) { clearTimeout(syncTimer); syncTimer = setTimeout(sync, 250); }
    return okay && !dirty;
  }
  function showConflict() {
    const box = $('#save-warning');
    box.replaceChildren(element('span', '', 'There’s a newer copy from another device. Your writing here is still safe. '), button('Compare the copies', 'resolve-conflict'));
    box.hidden = false;
  }
  async function acceptRemote(remote, afterLogin = false) {
    const memoryPending = afterLogin && dirty;
    const memoryVersion = cloudVersion;
    const saved = store.load();
    const meta = saved.sync;
    if (memoryPending) {
      // A failed browser cache must never outrank writing still in memory.
      cloudVersion = memoryVersion;
      conflict = memoryVersion !== remote.version;
    } else if (afterLogin && meta && meta.pending && !saved.blocked) {
      state = saved.state;
      dirty = true;
      cloudVersion = meta.version;
      conflict = meta.version !== remote.version;
    } else {
      cloudVersion = remote.version;
      state = remote.data ? D.validate(remote.data) : D.fresh();
      dirty = false;
      conflict = false;
      localSave(true);
    }
    lastValidState = D.validate(state);
    undoAction = null; $('#toast').hidden = true;
    unlocked = true;
    localBlocked = false;
    $('#external-warning').hidden = true;
    $('#lock-screen').hidden = true;
    $('#notebook-app').hidden = false;
    $('#unlock-password').value = '';
    $('#confirm-password').value = '';
    fillInputs();
    renderAll();
    const requested = location.hash.slice(1);
    goPage(['notes', 'plans', 'speech', 'details'].includes(requested) ? requested : 'notes', false);
    if (setupToken) { setupToken = ''; history.replaceState(null, '', location.pathname + location.search + '#notes'); }
    if (conflict) showConflict();
    else if (dirty) sync();
    else { status('Saved online'); warning(''); }
    if (suspendedEditor) {
      const retained = suspendedEditor; suspendedEditor = null;
      const exists = state[retained.editor.collection].some(v => v.id === retained.editor.id);
      openEditor(retained.editor.kind, exists ? retained.editor.id : null, retained.values);
      for (const [key, value] of Object.entries(retained.values)) {
        const input = $('#editor-form').elements.namedItem(key); if (input) input.value = value;
      }
    }
  }
  function showLock(description) {
    if (editor && $('#editor-dialog').open) suspendedEditor = {editor: {...editor}, values: Object.fromEntries(new FormData($('#editor-form')))};
    unlocked = false;
    $('#notebook-app').hidden = true;
    $('#lock-screen').hidden = false;
    $('#lock-heading').textContent = 'Open your notebook.';
    $('#lock-description').textContent = description || 'The plans, the stories, and a few words for the day.';
    $('#confirm-password-field').hidden = true;
    $('#confirm-password').required = false;
    $('#unlock-password').autocomplete = 'current-password';
    $('#unlock-button').disabled = false;
    $('#unlock-button').textContent = 'Open notebook →';
    $('#lock-status').textContent = 'Use the same password on your phone or computer.';
    $$('dialog[open]').forEach(d => d.close());
  }
  async function start() {
    $('#lock-error').hidden = true;
    $('#retry-connection').hidden = true;
    $('#unlock-button').disabled = true;
    $('#unlock-button').textContent = 'Opening…';
    try {
      C.init();
      if (C.hasSession()) {
        try { await acceptRemote(await C.load(), true); return; }
        catch (error) { if (error.code !== 'LOCKED') throw error; }
      }
      const info = await C.status();
      showLock();
      if (!info.initialized) {
        if (setupToken) {
          $('#lock-heading').textContent = 'Make it yours.';
          $('#lock-description').textContent = 'Choose a notebook password. You’ll use it here and on any other device.';
          $('#confirm-password-field').hidden = false;
          $('#confirm-password').required = true;
          $('#unlock-password').autocomplete = 'new-password';
          $('#unlock-button').textContent = 'Start my notebook →';
          $('#lock-status').textContent = 'At least 8 characters. No email or account needed.';
        } else {
          $('#unlock-button').disabled = true;
          $('#lock-status').textContent = 'Open your private setup link to choose the notebook password first.';
        }
      } else if (setupToken) {
        setupToken = '';
        history.replaceState(null, '', location.pathname + location.search + '#notes');
      }
    } catch (error) {
      $('#lock-error').textContent = 'The notebook couldn’t connect just now. Your saved writing hasn’t been changed.';
      $('#lock-error').hidden = false;
      $('#retry-connection').hidden = false;
      $('#unlock-button').textContent = 'Open notebook →';
      $('#lock-status').textContent = 'Check your connection, then try again.';
    }
  }
  $('#unlock-form').addEventListener('submit', async event => {
    event.preventDefault();
    const password = $('#unlock-password').value;
    const settingUp = !$('#confirm-password-field').hidden;
    if (settingUp && password !== $('#confirm-password').value) {
      $('#lock-error').textContent = 'Those passwords don’t match. Try that second one again.';
      $('#lock-error').hidden = false;
      return;
    }
    $('#unlock-button').disabled = true;
    $('#unlock-button').textContent = settingUp ? 'Making your notebook…' : 'Opening…';
    $('#lock-error').hidden = true;
    try { await acceptRemote(settingUp ? await C.setup(setupToken, password) : await C.login(password), true); }
    catch (error) {
      $('#lock-error').textContent = error.message;
      $('#lock-error').hidden = false;
      $('#unlock-button').disabled = false;
      $('#unlock-button').textContent = settingUp ? 'Start my notebook →' : 'Open notebook →';
    }
  });
  $('#retry-connection').addEventListener('click', start);
  $('#toggle-password').addEventListener('click', () => {
    const reveal = $('#unlock-password').type === 'password';
    $('#unlock-password').type = reveal ? 'text' : 'password';
    $('#confirm-password').type = reveal ? 'text' : 'password';
    $('#toggle-password').textContent = reveal ? 'Hide password' : 'Show password';
  });

  function fillInputs() {
    $('#note-text').value = state.composer.text;
    $('#note-tag').value = state.composer.tag;
    $('#speech-draft').value = state.speech;
    $$('[data-detail]').forEach(input => { input.value = state.details[input.dataset.detail]; });
    applyTheme();
    weddingLabel();
    speechStats();
  }
  function applyTheme() {
    document.documentElement.dataset.theme = state.prefs.theme;
    $$('[data-theme-choice]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.themeChoice === state.prefs.theme)));
    $('meta[name="theme-color"]').content = state.prefs.theme === 'dark' ? '#252722' : '#f3efe5';
  }
  function weddingLabel() { $('#wedding-label').textContent = state.details.weddingDate ? dateLabel(state.details.weddingDate) : 'Date to come'; }
  function goPage(page, focus = true) {
    if (!unlocked) return;
    currentPage = page;
    $$('.page-section').forEach(section => { section.hidden = section.id !== 'page-' + page; });
    $$('.main-nav [data-page]').forEach(link => { if (link.dataset.page === page) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
    if (location.hash !== '#' + page) history.replaceState(null, '', location.pathname + location.search + '#' + page);
    if (focus) { window.scrollTo({top: 0, behavior: 'instant'}); $('#main').focus({preventScroll: true}); }
  }
  function renderNotes() {
    const q = $('#note-search').value.trim().toLocaleLowerCase();
    const notes = state.notes.filter(n => (noteFilter === 'all' || n.tag === noteFilter) && (!q || n.text.toLocaleLowerCase().includes(q))).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));
    const list = $('#notes-list');
    list.replaceChildren();
    for (const note of notes) {
      const article = element('article', 'note-entry' + (note.pinned ? ' is-pinned' : ''));
      const meta = element('div', 'note-meta');
      meta.append(element('span', '', (note.pinned ? 'Pinned · ' : '') + TAGS[note.tag]), element('time', '', new Date(note.createdAt).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})));
      const content = element('p', 'note-text', note.text);
      const actions = element('div', 'entry-actions');
      actions.append(button('Edit', 'edit-note', note.id), button(note.pinned ? 'Unpin' : 'Pin', 'pin-note', note.id), button('Make a to-do', 'note-to-task', note.id));
      article.append(meta, content, actions); list.append(article);
    }
    $('#notes-empty').hidden = notes.length > 0;
    if (!notes.length && state.notes.length) {
      $('#notes-empty .empty-title').textContent = 'No notes here yet.';
      $('#notes-empty > p:nth-child(2)').textContent = q ? 'Try another word or clear the search.' : 'Choose Everything to see the rest, or keep a note in this section.';
      $('#notes-empty .starter-links').hidden = true;
    } else {
      $('#notes-empty .empty-title').textContent = 'A blank page is a good start.';
      $('#notes-empty > p:nth-child(2)').textContent = 'You can start with one thing you want to ask him, or a story you don’t want to forget.';
      $('#notes-empty .starter-links').hidden = false;
    }
  }
  function taskRow(task) {
    const row = element('div', 'task-row' + (task.done ? ' is-done' : ''));
    const check = element('input', 'task-checkbox'); check.type = 'checkbox'; check.checked = task.done;
    check.dataset.task = task.id; check.setAttribute('aria-label', (task.done ? 'Reopen ' : 'Complete ') + task.title);
    const main = element('div', 'task-main');
    main.append(button(task.title, 'edit-task', task.id, 'task-title'));
    if (task.notes) main.append(element('p', 'task-notes', task.notes));
    if (task.date) main.append(element('span', 'task-date', dateLabel(task.date)));
    row.append(check, main, button('Edit', 'edit-task', task.id));
    return row;
  }
  function renderTasks() {
    const open = state.tasks.filter(t => !t.done);
    const done = state.tasks.filter(t => t.done);
    $('#tasks-list').replaceChildren();
    for (const [key, name] of Object.entries(SECTIONS)) {
      const tasks = open.filter(t => t.section === key).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.createdAt.localeCompare(b.createdAt));
      if (!tasks.length) continue;
      const group = element('section', 'task-group');
      group.append(element('h2', 'list-heading', name), ...tasks.map(taskRow));
      $('#tasks-list').append(group);
    }
    $('#tasks-empty').hidden = !!open.length;
    $('#done-section').hidden = !done.length;
    $('#done-summary').textContent = 'Taken care of (' + done.length + ')';
    $('#done-list').replaceChildren(...done.map(taskRow));
    $('#suggestions-list').replaceChildren(...SUGGESTIONS.map(([title], i) => {
      const exists = state.tasks.some(t => t.title === title);
      const row = button(title + (exists ? ' ✓' : ' +'), 'suggest-task', String(i), 'suggestion');
      row.disabled = exists; return row;
    }));
  }
  function renderEvents() {
    const items = [...state.events].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.time.localeCompare(b.time) || a.createdAt.localeCompare(b.createdAt));
    const list = $('#events-list'); list.replaceChildren();
    for (const item of items) {
      const row = element('article', 'event-entry');
      const when = element('div', 'event-time');
      when.append(element('span', '', item.date ? dateLabel(item.date, {weekday: 'short', month: 'short', day: 'numeric'}) : 'Date to come'));
      if (item.time) { const [h, m] = item.time.split(':').map(Number); when.append(element('span', '', new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, {hour: 'numeric', minute: '2-digit'}))); }
      const body = element('div', 'event-body'); body.append(element('h2', '', item.title));
      if (item.location) body.append(element('p', 'event-location', item.location));
      if (item.notes) body.append(element('p', 'task-notes', item.notes));
      body.append(button('Edit plan', 'edit-event', item.id));
      row.append(when, body); list.append(row);
    }
    $('#events-empty').hidden = !!items.length;
  }
  function renderSpeech() {
    const notes = state.notes.filter(n => n.tag === 'speech').sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));
    $('#speech-notes').replaceChildren(...notes.map(note => {
      const article = element('article', 'scrap-entry');
      const actions = element('div', 'scrap-actions');
      actions.append(button('Edit', 'edit-note', note.id), button('Add to draft', 'to-speech', note.id));
      article.append(element('p', 'scrap-text', note.text), actions); return article;
    }));
    $('#speech-notes-empty').hidden = !!notes.length;
    speechStats();
  }
  function speechStats() {
    const words = state.speech.trim() ? state.speech.trim().split(/\s+/).length : 0;
    const seconds = Math.round(words / 130 * 60);
    $('#speech-stats').textContent = words ? `${words} words · roughly ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} aloud` : 'No rush.';
    $('#read-speech').disabled = !state.speech.trim();
  }
  function renderPeople() {
    $('#people-list').replaceChildren(...state.people.map(person => {
      const row = element('article', 'person-entry');
      const info = element('div', 'person-info');
      info.append(element('h3', '', person.name));
      if (person.role) info.append(element('p', 'small-note', person.role));
      const links = element('div', 'contact-links');
      if (person.phone) {
        const clean = person.phone.replace(/[^0-9+*#,;]/g, '');
        if (clean) { const link = element('a', '', person.phone); link.href = 'tel:' + clean; links.append(link); }
      }
      if (person.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email)) {
        const link = element('a', '', person.email); link.href = 'mailto:' + encodeURIComponent(person.email); links.append(link);
      }
      if (links.childNodes.length) info.append(links);
      if (person.notes) info.append(element('p', 'task-notes', person.notes));
      row.append(info, button('Edit', 'edit-person', person.id)); return row;
    }));
    $('#people-empty').hidden = !!state.people.length;
  }
  function renderAll() { renderNotes(); renderTasks(); renderEvents(); renderSpeech(); renderPeople(); weddingLabel(); }

  function field(name, label, value = '', kind = 'text', options = {}) {
    const wrapper = element('label', 'field' + (options.wide ? ' wide' : ''), label);
    let input;
    if (kind === 'textarea') { input = element('textarea'); input.rows = options.rows || 3; }
    else if (kind === 'select') {
      input = element('select'); Object.entries(options.choices).forEach(([v, title]) => { const o = element('option', '', title); o.value = v; input.append(o); });
    } else { input = element('input'); input.type = kind; }
    input.name = name;
    if (options.required) input.required = true;
    if (options.max) input.maxLength = options.max;
    if (options.placeholder) input.placeholder = options.placeholder;
    if (kind === 'date') { input.min = '1900-01-01'; input.max = '2200-12-31'; }
    input.value = value;
    wrapper.append(input); return wrapper;
  }
  function openEditor(kind, id = null, seed = {}) {
    const collection = {note: 'notes', task: 'tasks', event: 'events', person: 'people'}[kind];
    const item = id ? state[collection].find(v => v.id === id) : seed;
    if (!item) return;
    editor = {kind, collection, id};
    $('#editor-title').textContent = (id ? 'Edit ' : 'Add ') + {note: 'a note', task: 'a to-do', event: 'a plan', person: 'someone'}[kind];
    $('#editor-error').hidden = true;
    $('#editor-delete').hidden = !id;
    const fields = $('#editor-fields'); fields.className = 'form-grid'; fields.replaceChildren();
    if (kind === 'note') fields.append(field('text', 'The note', item.text || '', 'textarea', {required: true, max: 20000, wide: true, rows: 7}), field('tag', 'Keep with', item.tag || 'note', 'select', {choices: TAGS}));
    if (kind === 'task') fields.append(field('title', 'What needs doing?', item.title || '', 'text', {required: true, max: 500, wide: true}), field('section', 'When it belongs', item.section || 'before', 'select', {choices: SECTIONS}), field('date', 'Date (optional)', item.date || '', 'date'), field('notes', 'Anything to remember', item.notes || '', 'textarea', {max: 20000, wide: true}));
    if (kind === 'event') fields.append(field('title', 'The plan', item.title || '', 'text', {required: true, max: 500, wide: true}), field('date', 'Date (optional)', item.date || '', 'date'), field('time', 'Local time (optional)', item.time || '', 'time'), field('location', 'Where', item.location || '', 'text', {max: 2000, wide: true}), field('notes', 'Notes', item.notes || '', 'textarea', {max: 20000, wide: true}));
    if (kind === 'person') fields.append(field('name', 'Name', item.name || '', 'text', {required: true, max: 300}), field('role', 'Who they are', item.role || '', 'text', {max: 300, placeholder: 'Groomsman, coordinator…'}), field('phone', 'Phone', item.phone || '', 'tel', {max: 120}), field('email', 'Email', item.email || '', 'email', {max: 320}), field('notes', 'Notes', item.notes || '', 'textarea', {max: 20000, wide: true}));
    $('#editor-dialog').showModal();
    editorOriginal = JSON.stringify(Object.fromEntries(new FormData($('#editor-form'))));
  }
  $('#editor-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!editor) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    for (const key in values) if (typeof values[key] === 'string') values[key] = values[key].trim();
    const required = editor.kind === 'note' ? 'text' : editor.kind === 'person' ? 'name' : 'title';
    if (!values[required]) { $('#editor-error').textContent = 'Add a little text before saving.'; $('#editor-error').hidden = false; return; }
    const previous = editor.id ? state[editor.collection].find(v => v.id === editor.id) : {...base(), ...(editor.kind === 'note' ? {pinned: false} : {}), ...(editor.kind === 'task' ? {done: false} : {})};
    const item = {...previous, ...values, updatedAt: now()};
    const next = clone(state);
    if (editor.id) next[editor.collection] = next[editor.collection].map(v => v.id === editor.id ? item : v); else next[editor.collection].push(item);
    try { D.validate(next); state = next; } catch (error) { $('#editor-error').textContent = error.message; $('#editor-error').hidden = false; return; }
    $('#editor-dialog').close(); editor = null;
    changed(); renderAll(); toast('Kept in your notebook.');
  });
  function discardEditor() {
    if (editor && JSON.stringify(Object.fromEntries(new FormData($('#editor-form')))) !== editorOriginal && !window.confirm('Leave this edit without saving it?')) return false;
    $('#editor-dialog').close(); editor = null; return true;
  }
  $('#editor-dialog').addEventListener('cancel', e => { e.preventDefault(); discardEditor(); });
  $('#editor-delete').addEventListener('click', () => {
    if (!editor || !editor.id) return;
    const {collection, id} = editor;
    const item = state[collection].find(v => v.id === id);
    const index = state[collection].findIndex(v => v.id === id);
    state[collection] = state[collection].filter(v => v.id !== id);
    $('#editor-dialog').close(); editor = null;
    changed(); renderAll();
    toast('Removed from your notebook.', () => { state[collection].splice(index, 0, item); changed(); renderAll(); toast('Put back.'); });
  });
  $('#note-form').addEventListener('submit', event => {
    event.preventDefault();
    const text = $('#note-text').value.trim();
    if (!text) { $('#note-text').focus(); return; }
    state.notes.push({...base(), text, tag: $('#note-tag').value, pinned: false});
    state.composer = {text: '', tag: $('#note-tag').value};
    $('#note-text').value = '';
    noteFilter = 'all'; $('#note-search').value = '';
    $$('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === 'all')));
    changed(); renderNotes(); renderSpeech(); toast('Note kept.');
  });
  $('#note-text').addEventListener('input', () => { state.composer.text = $('#note-text').value; changed(); });
  $('#note-tag').addEventListener('change', () => { state.composer.tag = $('#note-tag').value; changed(); });
  $('#note-search').addEventListener('input', renderNotes);
  $('#speech-draft').addEventListener('input', () => { state.speech = $('#speech-draft').value; changed(); speechStats(); });
  $('#details-form').addEventListener('submit', event => event.preventDefault());
  $('#details-form').addEventListener('input', event => {
    const key = event.target.dataset.detail;
    if (!key) return;
    state.details[key] = event.target.value; changed(); weddingLabel();
  });
  $('#add-plan').addEventListener('click', () => openEditor(planView === 'tasks' ? 'task' : 'event'));
  $('#add-person').addEventListener('click', () => openEditor('person'));
  $('#add-story').addEventListener('click', () => openEditor('note', null, {tag: 'speech'}));
  document.addEventListener('change', event => {
    if (event.target.dataset.task) {
      const item = state.tasks.find(t => t.id === event.target.dataset.task);
      if (item) { item.done = event.target.checked; item.updatedAt = now(); changed(); renderTasks(); }
    }
  });

  function download(content, filename, type) {
    const blob = new Blob([content], {type});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function downloadBackup() {
    try { download(D.exportBackup(state), 'for-my-brother-' + new Date().toISOString().slice(0, 10) + '.json', 'application/json'); toast('Backup ready. Keep the downloaded file somewhere safe.'); }
    catch (error) { toast(error.message); }
  }
  function openSettings() {
    $('#import-error').hidden = true;
    try { $('#recover-button').hidden = !store.restoreRecovery(); } catch (_) { $('#recover-button').hidden = true; }
    $('#settings-dialog').showModal();
  }
  async function lockNotebook() {
    if (editor && $('#editor-dialog').open && !discardEditor()) return;
    if (dirty && !(await sync())) {
      toast('Your latest writing still needs to save. Keep this tab open or download a copy before locking.');
      return;
    }
    // Stop editing before the network wait, so new writing cannot be cleared.
    unlocked = false;
    $('#notebook-app').hidden = true;
    showLock('Locking your notebook…');
    $('#unlock-button').disabled = true;
    const result = await C.logout();
    try { localStorage.removeItem('best-man-notebook:v1'); } catch (_) { /* The online session is still locked. */ }
    state = D.fresh(); dirty = false; conflict = false; generation++;
    lastValidState = clone(state); suspendedEditor = null; undoAction = null; $('#toast').hidden = true;
    fillInputs(); renderAll(); pauseTimer(); showLock();
    if (!result.revoked) $('#lock-status').textContent = 'Locked on this device. The connection dropped before the online session could be revoked.';
    status('Locked');
  }
  async function resolveConflict() {
    try {
      const remote = await C.load();
      if (!unlocked) return;
      const dialog = $('#conflict-dialog');
      pendingImport = null;
      $('#conflict-local').textContent = summary(state);
      $('#conflict-remote').textContent = remote.data ? summary(remote.data) : 'An empty notebook.';
      dialog.dataset.remoteVersion = String(remote.version);
      dialog._remote = remote;
      dialog.showModal();
    } catch (error) { toast(error.message); }
  }
  function summary(data) { return `${data.notes.length} notes, ${data.tasks.length} to-dos, ${data.events.length} plans, ${data.people.length} people${data.speech ? ', and a speech draft' : ''}. Saved ${new Date(data.updatedAt).toLocaleString()}.`; }
  document.addEventListener('click', async event => {
    const target = event.target.closest('button, a'); if (!target) return;
    if (target.dataset.page) { event.preventDefault(); goPage(target.dataset.page); }
    if (target.dataset.filter) { noteFilter = target.dataset.filter; $$('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b === target))); renderNotes(); }
    if (target.dataset.planView) {
      planView = target.dataset.planView;
      $$('[data-plan-view]').forEach(b => b.setAttribute('aria-pressed', String(b === target)));
      $('#tasks-panel').hidden = planView !== 'tasks'; $('#events-panel').hidden = planView !== 'events';
      $('#add-plan').textContent = planView === 'tasks' ? 'Add a to-do +' : 'Add a plan +';
    }
    if (target.dataset.notePrompt) { $('#note-tag').value = target.dataset.notePrompt; state.composer.tag = target.dataset.notePrompt; changed(); $('#note-text').focus(); }
    if (target.dataset.themeChoice) { state.prefs.theme = target.dataset.themeChoice; applyTheme(); changed(); }
    if (target.dataset.close) {
      if (target.dataset.close === 'editor-dialog') discardEditor();
      else { $('#' + target.dataset.close).close(); if (target.dataset.close === 'reading-dialog') pauseTimer(); }
    }
    const action = target.dataset.action; const id = target.dataset.id;
    if (!action) return;
    if (action === 'backup') downloadBackup();
    if (action === 'settings') openSettings();
    if (action === 'lock') lockNotebook();
    if (action === 'reload') { if (window.confirm('Reload the saved notebook? Download a copy first if you have writing here to keep.')) location.reload(); }
    if (action === 'export-text') download(D.exportText(state), 'for-my-brother-' + new Date().toISOString().slice(0, 10) + '.txt', 'text/plain;charset=utf-8');
    if (action === 'resolve-conflict') resolveConflict();
    if (action.startsWith('edit-')) openEditor(action.slice(5), id);
    if (action === 'pin-note') { const note = state.notes.find(n => n.id === id); if (note) { note.pinned = !note.pinned; note.updatedAt = now(); changed(); renderNotes(); renderSpeech(); } }
    if (action === 'note-to-task') { const note = state.notes.find(n => n.id === id); if (note) openEditor('task', null, {title: note.text.split('\n')[0].slice(0, 500), notes: note.text, section: note.tag === 'weekend' ? 'weekend' : 'before'}); }
    if (action === 'suggest-task') { const suggested = SUGGESTIONS[Number(id)]; if (suggested && !state.tasks.some(t => t.title === suggested[0])) { state.tasks.push({...base(), title: suggested[0], section: suggested[1], date: '', notes: '', done: false}); changed(); renderTasks(); toast('Added to your list.'); } }
    if (action === 'to-speech') { const note = state.notes.find(n => n.id === id); if (note) { const before = state.speech; const appended = state.speech + (state.speech.trim() ? '\n\n' : '') + note.text; if (appended.length > 100000) { toast('That would make the draft too long. Keep this as a separate story.'); return; } state.speech = appended; $('#speech-draft').value = state.speech; changed(); speechStats(); toast('Added to the end of your draft.', () => { if (state.speech !== appended) { toast('You’ve edited the draft since then, so your newer writing was kept.'); return; } state.speech = before; $('#speech-draft').value = before; changed(); speechStats(); }); } }
  });
  $('#undo-button').addEventListener('click', () => { const action = undoAction; undoAction = null; if (action) action(); });
  $('#toast-close').addEventListener('click', () => { $('#toast').hidden = true; });
  $('#import-file').addEventListener('change', async event => {
    const file = event.target.files[0]; event.target.value = ''; if (!file) return;
    try {
      if (file.size > 2000000) throw new Error('That file is too large. Choose a notebook backup smaller than 2 MB.');
      pendingImport = D.importBackup(await file.text());
      $('#import-preview').textContent = summary(pendingImport);
      $('#import-dialog').showModal();
    } catch (error) { $('#import-error').textContent = error.message; $('#import-error').hidden = false; }
  });
  $('#confirm-import').addEventListener('click', () => {
    if (!pendingImport) return;
    try {
      store.recovery(state);
      store.replace(pendingImport, {version: cloudVersion, pending: true});
      state = pendingImport; pendingImport = null;
      undoAction = null;
      $('#import-dialog').close(); $('#settings-dialog').close();
      changed(); fillInputs(); renderAll(); toast('Notebook restored. Saving the online copy…');
    } catch (error) { $('#import-error').textContent = error.message; $('#import-error').hidden = false; $('#import-dialog').close(); }
  });
  $('#recover-button').addEventListener('click', () => {
    try { pendingImport = store.restoreRecovery(); if (pendingImport) { $('#import-preview').textContent = summary(pendingImport); $('#import-dialog').showModal(); } }
    catch (error) { $('#import-error').textContent = error.message; $('#import-error').hidden = false; }
  });
  $('#keep-local-copy').addEventListener('click', async () => {
    const remote = $('#conflict-dialog')._remote;
    if (!remote) return;
    try {
      if (remote.data) store.recovery(remote.data);
      cloudVersion = remote.version; conflict = false; dirty = true; localBlocked = false;
      localSave(true);
      $('#conflict-dialog').close(); $('#external-warning').hidden = true; warning('');
      await sync();
    } catch (error) { toast(error.message); }
  });
  $('#keep-online-copy').addEventListener('click', async () => {
    const remote = $('#conflict-dialog')._remote;
    if (!remote) return;
    try { store.recovery(state); await acceptRemote(remote, false); $('#conflict-dialog').close(); toast('Opened the online copy. Your previous writing is in recovery.'); }
    catch (error) { toast(error.message); }
  });

  function timerRender() {
    const elapsed = timerElapsed + (timerStarted ? Date.now() - timerStarted : 0);
    const seconds = Math.floor(elapsed / 1000);
    $('#rehearsal-time').textContent = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  }
  function pauseTimer() {
    if (timerStarted) { timerElapsed += Date.now() - timerStarted; timerStarted = 0; }
    clearInterval(timerTick); timerTick = null;
    $('#rehearsal-toggle').textContent = timerElapsed ? 'Resume timer' : 'Start timer'; timerRender();
  }
  $('#read-speech').addEventListener('click', () => {
    if (!state.speech.trim()) return;
    const content = $('#reading-content'); content.replaceChildren(...state.speech.split(/\n\s*\n/).map(p => element('p', '', p)));
    $('#reading-dialog').dataset.readingSize = ['small', 'medium', 'large', 'xlarge'][readingSize];
    $('#reading-dialog').showModal(); content.scrollTop = 0;
  });
  $('#reading-dialog').addEventListener('close', pauseTimer);
  $('#reading-smaller').addEventListener('click', () => { readingSize = Math.max(0, readingSize - 1); $('#reading-dialog').dataset.readingSize = ['small', 'medium', 'large', 'xlarge'][readingSize]; });
  $('#reading-larger').addEventListener('click', () => { readingSize = Math.min(3, readingSize + 1); $('#reading-dialog').dataset.readingSize = ['small', 'medium', 'large', 'xlarge'][readingSize]; });
  $('#rehearsal-toggle').addEventListener('click', () => { if (timerStarted) pauseTimer(); else { timerStarted = Date.now(); timerTick = setInterval(timerRender, 250); $('#rehearsal-toggle').textContent = 'Pause timer'; } });
  $('#rehearsal-reset').addEventListener('click', () => { pauseTimer(); timerElapsed = 0; timerRender(); $('#rehearsal-toggle').textContent = 'Start timer'; });
  window.addEventListener('hashchange', () => { const page = location.hash.slice(1); if (['notes', 'plans', 'speech', 'details'].includes(page)) goPage(page); });
  window.addEventListener('online', () => { if (unlocked) sync(); });
  window.addEventListener('pagehide', () => { if (dirty) localSave(); });
  window.addEventListener('beforeunload', event => { if (dirty || suspendedEditor || (editor && $('#editor-dialog').open && JSON.stringify(Object.fromEntries(new FormData($('#editor-form')))) !== editorOriginal)) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('storage', event => {
    if (!unlocked || event.key !== 'best-man-notebook:v1') return;
    localBlocked = true; $('#external-warning').hidden = false; status('Another tab has changes');
  });
  document.addEventListener('visibilitychange', async () => {
    if (!unlocked) return;
    if (document.visibilityState === 'hidden') { if (dirty) { localSave(); sync(); } return; }
    if (dirty) { sync(); return; }
    if (localBlocked) return;
    const readGeneration = generation, readVersion = cloudVersion;
    try { const remote = await C.load(); if (unlocked && remote.version > cloudVersion && generation === readGeneration && cloudVersion === readVersion) { if (dirty) { conflict = true; showConflict(); } else await acceptRemote(remote, false); } }
    catch (error) { if (error.code === 'LOCKED') showLock(); }
  });
  setInterval(() => { if (unlocked && dirty && !conflict && !localBlocked && !saving) sync(); }, 20000);
  start();
})();
