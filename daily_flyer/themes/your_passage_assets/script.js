/* Your Passage: explicit browser-only saving, compatible with the original v1 notes. */
(() => {
  'use strict';
  const root = document.getElementById('yp');
  if (!root) return;
  const data = JSON.parse(document.getElementById('yp-data').textContent);
  const $ = id => document.getElementById(id);
  const storagePrefix = 'your-passage:v1:';
  const stages = ['read', 'try', 'reflect'];
  const draftCache = new Map();
  let selected = data.selected;
  let state = freshState();
  let clearArmed = false;
  let clearTimer;
  let focusReturn = null;
  const freshAudience = {
    student: {copy: 'You don’t have to know what you want to be. Start by exploring what interests you, practicing a useful skill, and trying one thing.', link: 'Find a starting point', href: '#choose'},
    parent: {copy: 'Help them move forward without having to supply every answer. Start with a calmer conversation, a useful question, and room for them to choose.', link: 'Support without taking over', href: '#parents'},
    school: {copy: 'Bring career readiness into the room. Explore coaching, group conversations, and practical skill-building shaped around your students and program.', link: 'Explore school partnerships', href: '#schools'}
  };
  function freshState() {
    return {plan: '', when: '', reflection: '', done: [], tab: 'read', choice: null, response: null, savedAt: ''};
  }
  function key(index = selected) { return storagePrefix + data.exercises[index].id; }
  function message(text) { $('yp-storage-status').textContent = text; }
  function capture() {
    state.plan = $('yp-plan').value;
    state.when = $('yp-when').value;
    state.reflection = $('yp-reflection').value;
    draftCache.set(key(), {...state, done: [...state.done]});
  }
  function normalize(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return freshState();
    return {
      plan: typeof value.plan === 'string' ? value.plan.slice(0, 4000) : '',
      when: typeof value.when === 'string' ? value.when.slice(0, 160) : '',
      reflection: typeof value.reflection === 'string' ? value.reflection.slice(0, 8000) : '',
      done: Array.isArray(value.done) ? [...new Set(value.done.filter(item => stages.includes(item)))] : [],
      tab: stages.includes(value.tab) ? value.tab : 'read',
      choice: Number.isInteger(value.choice) && value.choice >= 0 && value.choice < 3 ? value.choice : null,
      response: Number.isInteger(value.response) && value.response >= 0 && value.response < 2 ? value.response : null,
      savedAt: typeof value.savedAt === 'string' && !Number.isNaN(Date.parse(value.savedAt)) ? value.savedAt : ''
    };
  }
  function restore() {
    if (draftCache.has(key())) {
      state = normalize(draftCache.get(key()));
      message('Draft restored for this visit. Choose Save to keep your latest changes.');
      return;
    }
    try {
      const saved = localStorage.getItem(key());
      state = saved ? normalize(JSON.parse(saved)) : freshState();
      message(saved ? 'Saved passage restored from this browser. Save again after making changes.' : 'Writing alone does not save your notes. Choose Save when you want to keep them.');
    } catch (_) {
      state = freshState();
      message('Saved notes could not be read. You can still practice and download your notes.');
    }
  }
  function updateTakeaway() {
    const visible = state.done.includes('reflect');
    $('yp-takeaway').hidden = !visible;
    $('yp-takeaway-topic').textContent = data.exercises[selected].short_title;
    $('yp-takeaway-plan').textContent = state.plan.trim() || 'My next step is still taking shape. I can return to Try and write it down when I’m ready.';
    $('yp-takeaway-when').textContent = state.when.trim() || 'I’ll choose a time that works for me.';
    $('yp-takeaway-reflection').textContent = state.reflection;
    $('yp-takeaway-reflection-wrap').hidden = !state.reflection.trim();
  }
  function updateProgress() {
    $('yp-progress').value = state.done.length;
    $('yp-progress-text').textContent = `${state.done.length} of 3 steps complete`;
    stages.forEach(stage => {
      const done = state.done.includes(stage);
      $(`yp-tab-${stage}`).querySelector('i').textContent = done ? '✓' : '';
      $(`yp-tab-${stage}`).setAttribute('aria-label', `${stage[0].toUpperCase() + stage.slice(1)}${done ? ', complete' : ''}`);
    });
    $('yp-finish-message').textContent = state.done.length === 3
      ? 'Passage complete. Your next-step card is below. Save or download it if you’d like to keep it.'
      : state.done.includes('reflect') ? 'Your card is below. You can return to Read or Try whenever you’re ready.' : '';
    updateTakeaway();
  }
  function activate(stage, focus = false) {
    state.tab = stage;
    stages.forEach(item => {
      const active = item === stage;
      $(`yp-tab-${item}`).setAttribute('aria-selected', String(active));
      $(`yp-tab-${item}`).tabIndex = active ? 0 : -1;
      $(`yp-panel-${item}`).hidden = !active;
    });
    if (focus) $(`yp-panel-${stage}`).focus({preventScroll: true});
  }
  function resetClear() {
    clearArmed = false;
    clearTimeout(clearTimer);
    $('yp-clear').textContent = 'Clear this passage';
  }
  function setFocus(enabled) {
    if (enabled && !root.classList.contains('yp-focus')) focusReturn = document.activeElement;
    root.classList.toggle('yp-focus', enabled);
    $('yp-exit-focus').hidden = !enabled;
    $('yp-focus-toggle').setAttribute('aria-pressed', String(enabled));
    $('yp-focus-toggle').textContent = enabled ? 'Leave focus view ↙' : 'Enter focus view ↗';
    closeMenu();
    if (enabled) {
      $(`yp-tab-${state.tab}`).focus();
    } else if (focusReturn && focusReturn.isConnected) {
      focusReturn.focus();
    } else {
      $('yp-focus-toggle').focus();
    }
  }
  function closeMenu() {
    $('yp-menu-toggle').setAttribute('aria-expanded', 'false');
    $('yp-navigation').classList.remove('is-open');
  }
  function renderActions() {
    const item = data.exercises[selected];
    $('yp-action-list').replaceChildren(...item.steps.map((step, index) => {
      const li = document.createElement('li');
      const button = document.createElement('button'); button.type = 'button';
      button.setAttribute('aria-pressed', String(state.choice === index));
      const number = document.createElement('span'); number.textContent = String(index + 1).padStart(2, '0'); number.setAttribute('aria-hidden', 'true');
      const text = document.createElement('span'); text.textContent = step;
      button.append(number, text);
      button.addEventListener('click', () => {
        state.choice = index;
        $('yp-plan').value = step;
        capture(); renderActions(); updateTakeaway(); resetClear();
        $('yp-plan').focus({preventScroll: true});
        message('Added to your next step. Change the wording to make it yours, then save if you want to keep it.');
      });
      li.append(button); return li;
    }));
  }
  function renderRehearsal() {
    const item = data.exercises[selected];
    $('yp-scenario').textContent = item.scenario;
    $('yp-response-options').replaceChildren(...item.responses.map((response, index) => {
      const button = document.createElement('button'); button.type = 'button';
      button.textContent = response.label;
      button.setAttribute('aria-pressed', String(state.response === index));
      button.addEventListener('click', () => {
        state.response = index; capture(); renderRehearsal();
        // Keep the keyboard position after rebuilding the options.
        $('yp-response-options').children[index].focus({preventScroll: true});
      });
      return button;
    }));
    $('yp-response-feedback').hidden = state.response === null;
    $('yp-response-feedback').textContent = item.responses[state.response]?.feedback || '';
  }
  function renderNotebook() {
    const entries = [];
    let unreadable = 0;
    data.exercises.forEach((item, index) => {
      try {
        const saved = localStorage.getItem(key(index));
        if (saved) {
          const parsed = JSON.parse(saved);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) { unreadable += 1; return; }
          entries.push({index, item, value: normalize(parsed)});
        }
      } catch (_) { unreadable += 1; }
    });
    root.querySelectorAll('[data-notebook-count]').forEach(node => { node.textContent = String(entries.length); });
    const nodes = entries.map(({index, item, value}) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'yp-saved-passage';
      const title = document.createElement('strong'); title.textContent = item.short_title;
      const arrow = document.createElement('span'); arrow.textContent = '↗'; arrow.setAttribute('aria-hidden', 'true');
      const detail = document.createElement('small');
      detail.textContent = `${value.done.length}/3 steps · ${value.plan ? value.plan.slice(0, 95) + (value.plan.length > 95 ? '…' : '') : 'No written next step yet'}`;
      button.append(title, arrow, detail);
      button.addEventListener('click', () => { selectTopic(index); $('notebook').open = false; $(`yp-tab-${state.tab}`).focus(); });
      return button;
    });
    if (!nodes.length || unreadable) {
      const empty = document.createElement('p');
      empty.textContent = unreadable ? 'Some browser saves could not be read. You can continue practicing and download a copy of your notes.' : 'A place for your thoughts. Save a passage and you can return to it here.';
      nodes.push(empty);
    }
    $('yp-notebook-list').replaceChildren(...nodes);
  }
  function renderExercise() {
    resetClear();
    const item = data.exercises[selected];
    $('yp-focus-title').textContent = item.short_title;
    $('yp-selection-label').textContent = selected === data.selected ? 'TODAY’S STARTING POINT' : 'YOUR CHOSEN STARTING POINT';
    $('yp-skill').textContent = item.skill;
    $('yp-read-heading').textContent = item.heading;
    $('yp-read-copy').textContent = item.read;
    $('yp-margin-copy').textContent = item.margin_note;
    $('yp-reflection-prompt').textContent = item.reflection;
    $('yp-parent-prompt').textContent = item.conversation;
    $('yp-parent-note').textContent = item.parent_note;
    $('yp-route-label').textContent = item.short_title.toUpperCase();
    $('yp-route-benefit').textContent = item.benefit;
    root.querySelectorAll('[data-route]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.route) === selected)));
    $('yp-topic').value = String(selected);
    $('yp-plan').value = state.plan;
    $('yp-when').value = state.when;
    $('yp-reflection').value = state.reflection;
    $('yp-rehearsal').open = state.response !== null;
    renderActions(); renderRehearsal(); updateProgress(); activate(state.tab);
  }
  function selectTopic(index) {
    if (!Number.isInteger(index) || !data.exercises[index]) return;
    capture(); selected = index; restore(); renderExercise();
  }
  function save() {
    resetClear(); capture();
    try {
      const saved = {...state, savedAt: new Date().toISOString()};
      localStorage.setItem(key(), JSON.stringify(saved));
      state.savedAt = saved.savedAt; capture(); renderNotebook();
      message('Saved on this browser only. Your notes have not been sent to anyone.');
    } catch (_) { message('This browser could not save your notes. Use Download my notes to keep a copy.'); }
  }
  function download() {
    resetClear(); capture();
    const item = data.exercises[selected];
    const text = `YOUR PASSAGE\n${item.title}\n${data.date}\n\nMY NEXT STEP\n${state.plan || '(No written plan)'}\n\nWHEN\n${state.when || '(Not chosen yet)'}\n\nREFLECTION\n${item.reflection}\n${state.reflection || '(No written reflection)'}\n\nProgress: ${state.done.length} of 3 steps complete\n\nPersonal notes. Not sent to Tim or Your Passage.\n`;
    try {
      const url = URL.createObjectURL(new Blob([text], {type: 'text/plain;charset=utf-8'}));
      const link = document.createElement('a');
      link.href = url; link.download = `your-passage-${item.id}-${data.date}.txt`;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      message('Notes download requested. Check your browser’s downloads.');
    } catch (_) { message('This browser could not start a download. You can copy your notes or print your next-step card.'); }
  }

  root.querySelectorAll('[data-audience]').forEach(button => {
    button.addEventListener('click', () => {
      const audience = freshAudience[button.dataset.audience];
      root.querySelectorAll('[data-audience]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      $('yp-audience-copy').textContent = audience.copy;
      $('yp-audience-link').textContent = `${audience.link} →`;
      $('yp-audience-link').href = audience.href;
    });
  });
  data.exercises.forEach((item, index) => {
    const option = document.createElement('option'); option.value = String(index); option.textContent = item.short_title;
    $('yp-topic').append(option);
  });
  $('yp-topic').addEventListener('change', event => selectTopic(Number(event.target.value)));
  root.querySelectorAll('[data-route]').forEach(button => button.addEventListener('click', () => selectTopic(Number(button.dataset.route))));
  $('yp-start-practice').addEventListener('click', () => setFocus(true));
  $('yp-focus-toggle').addEventListener('click', () => setFocus(!root.classList.contains('yp-focus')));
  $('yp-exit-focus').addEventListener('click', () => setFocus(false));
  root.querySelector('.yp-brand').addEventListener('click', () => { if (root.classList.contains('yp-focus')) setFocus(false); });
  $('yp-menu-toggle').addEventListener('click', () => {
    const expanded = $('yp-menu-toggle').getAttribute('aria-expanded') !== 'true';
    $('yp-menu-toggle').setAttribute('aria-expanded', String(expanded));
    $('yp-navigation').classList.toggle('is-open', expanded);
  });
  $('yp-navigation').querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape' && $('yp-menu-toggle').getAttribute('aria-expanded') === 'true') {
      closeMenu(); $('yp-menu-toggle').focus();
    }
  });
  root.querySelectorAll('[data-open-notebook]').forEach(link => link.addEventListener('click', () => {
    renderNotebook(); $('notebook').open = true; $('notebook').querySelector('summary').focus();
  }));
  stages.forEach((stage, index) => {
    const tab = $(`yp-tab-${stage}`);
    tab.addEventListener('click', () => { capture(); activate(stage); });
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % stages.length;
      else if (event.key === 'ArrowLeft') next = (index + stages.length - 1) % stages.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = stages.length - 1;
      else return;
      event.preventDefault(); capture(); activate(stages[next]); $(`yp-tab-${stages[next]}`).focus();
    });
  });
  root.querySelectorAll('[data-complete]').forEach(button => {
    button.addEventListener('click', () => {
      const stage = button.dataset.complete;
      capture();
      if (!state.done.includes(stage)) state.done.push(stage);
      updateProgress(); activate(stages[Math.min(stages.indexOf(stage) + 1, stages.length - 1)], true); capture();
      if (stage === 'reflect') $('yp-takeaway').focus();
      message('Progress updated for this visit. Save if you’d like to keep it.');
    });
  });
  ['yp-plan', 'yp-when', 'yp-reflection'].forEach(id => {
    $(id).addEventListener('input', () => {
      resetClear();
      if (id === 'yp-plan') { state.choice = null; renderActions(); }
      capture(); updateTakeaway(); message('You have unsaved changes. Save or download to keep them.');
    });
  });
  $('yp-save').addEventListener('click', save);
  $('yp-download').addEventListener('click', download);
  $('yp-print').addEventListener('click', () => { capture(); updateTakeaway(); window.print(); });
  $('yp-edit-plan').addEventListener('click', () => { activate('try'); $('yp-plan').focus(); });
  $('yp-clear').addEventListener('click', () => {
    if (!clearArmed) {
      clearArmed = true; $('yp-clear').textContent = 'Confirm clear';
      message('Clear the current passage’s notes and saved progress? Click Confirm clear within 8 seconds. Other passages are kept.');
      clearTimer = setTimeout(() => { resetClear(); message('Clear cancelled. Your notes are unchanged.'); }, 8000);
      return;
    }
    try { localStorage.removeItem(key()); }
    catch (_) {
      resetClear(); message('Saved notes could not be removed. Clear this site’s data in browser settings. On-screen notes have been kept.'); return;
    }
    draftCache.delete(key()); state = freshState(); renderExercise(); renderNotebook();
    message('This passage’s notes and saved progress have been cleared.');
  });
  restore(); renderExercise(); renderNotebook();
  // Hide the mobile nav only after its controls are fully wired.
  root.classList.add('yp-ready');
})();
