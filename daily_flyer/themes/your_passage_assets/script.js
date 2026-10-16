/* All personal notes remain local. Nothing is sent to a service. */
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
  const freshAudience = {
    student: {copy: 'You don’t have to know what you want to be. Start by exploring what interests you, practicing a useful skill, and trying one thing.', link: 'Try a small step today', href: '#practice'},
    parent: {copy: 'Help them move forward without having to supply every answer. Start with a calmer conversation, a useful question, and room for them to choose.', link: 'Support without taking over', href: '#parents'},
    school: {copy: 'Bring career readiness into the room. Explore coaching, group conversations, and practical skill-building shaped around your students and program.', link: 'Explore school partnerships', href: '#schools'}
  };

  function freshState() { return {plan: '', reflection: '', done: [], tab: 'read'}; }
  function key() { return storagePrefix + data.exercises[selected].id; }
  function message(text) { $('yp-storage-status').textContent = text; }
  function capture() {
    state.plan = $('yp-plan').value;
    state.reflection = $('yp-reflection').value;
    draftCache.set(key(), {...state, done: [...state.done]});
  }
  function normalize(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return freshState();
    return {
      plan: typeof value.plan === 'string' ? value.plan.slice(0, 4000) : '',
      reflection: typeof value.reflection === 'string' ? value.reflection.slice(0, 8000) : '',
      done: Array.isArray(value.done) ? [...new Set(value.done.filter(item => stages.includes(item)))] : [],
      tab: stages.includes(value.tab) ? value.tab : 'read'
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
      message(saved ? 'Saved passage restored from this browser. Save again after making changes.' : 'No notes saved yet. Writing alone does not save your notes.');
    } catch (_) {
      state = freshState();
      message('Saved notes could not be read. You can still practice and download your notes.');
    }
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
      ? 'Passage complete. Take your next step into the day. Save or download your notes if you’d like to keep them.'
      : state.done.includes('reflect') ? 'Reflection complete. You can return to Read or Try whenever you’re ready.' : '';
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
  function renderExercise() {
    resetClear();
    const item = data.exercises[selected];
    $('yp-focus-title').textContent = item.title;
    $('yp-skill').textContent = item.skill;
    $('yp-read-copy').textContent = item.read;
    $('yp-reflection-prompt').textContent = item.reflection;
    $('yp-parent-prompt').textContent = item.conversation;
    $('yp-parent-note').textContent = item.parent_note;
    $('yp-action-list').replaceChildren(...item.steps.map(step => {
      const li = document.createElement('li'); li.textContent = step; return li;
    }));
    $('yp-topic').value = String(selected);
    $('yp-plan').value = state.plan;
    $('yp-reflection').value = state.reflection;
    updateProgress();
    activate(state.tab);
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
    const option = document.createElement('option');
    option.value = String(index); option.textContent = item.title;
    $('yp-topic').append(option);
  });
  $('yp-topic').addEventListener('change', event => {
    capture(); selected = Number(event.target.value); restore(); renderExercise();
  });
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
      updateProgress();
      activate(stages[Math.min(stages.indexOf(stage) + 1, stages.length - 1)], true);
      capture();
      message('Progress updated for this visit. Save if you’d like to keep it.');
    });
  });
  ['yp-plan', 'yp-reflection'].forEach(id => {
    $(id).addEventListener('input', () => {
      resetClear(); capture(); message('You have unsaved changes. Save or download to keep them.');
    });
  });
  $('yp-save').addEventListener('click', () => {
    resetClear(); capture();
    try {
      localStorage.setItem(key(), JSON.stringify(state));
      message('Saved on this browser only. Your notes have not been sent to anyone.');
    } catch (_) { message('This browser could not save your notes. Use Download my notes to keep a copy.'); }
  });
  $('yp-download').addEventListener('click', () => {
    resetClear(); capture();
    const item = data.exercises[selected];
    const text = `YOUR PASSAGE\n${item.title}\n${data.date}\n\nMY NEXT STEP\n${state.plan || '(No written plan)'}\n\nREFLECTION\n${item.reflection}\n${state.reflection || '(No written reflection)'}\n\nProgress: ${state.done.length} of 3 steps complete\n\nPersonal notes. Not sent to Tim or Your Passage.\n`;
    const url = URL.createObjectURL(new Blob([text], {type: 'text/plain;charset=utf-8'}));
    const link = document.createElement('a');
    link.href = url; link.download = `your-passage-${item.id}-${data.date}.txt`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    message('Notes download requested. Check your browser’s downloads.');
  });
  $('yp-clear').addEventListener('click', () => {
    if (!clearArmed) {
      clearArmed = true;
      $('yp-clear').textContent = 'Confirm clear';
      message('Clear the current passage’s notes and saved progress? Click Confirm clear within 8 seconds. Other passages are kept.');
      clearTimer = setTimeout(() => { resetClear(); message('Clear cancelled. Your notes are unchanged.'); }, 8000);
      return;
    }
    try {
      localStorage.removeItem(key());
    } catch (_) {
      resetClear(); message('Saved notes could not be removed. Clear this site’s data in browser settings. On-screen notes have been kept.'); return;
    }
    draftCache.delete(key()); state = freshState(); renderExercise();
    message('This passage’s notes and saved progress have been cleared.');
  });
  restore(); renderExercise();
})();
