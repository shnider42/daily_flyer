(() => {
  'use strict';
  const storageKey = 'lmw-appearance-v1';
  const choices = new Set(['system', 'light', 'night', 'contrast']);
  const labels = {system: 'System', light: 'Light', night: 'Night', contrast: 'High contrast'};
  const dark = window.matchMedia('(prefers-color-scheme: dark)');
  const contrast = window.matchMedia('(prefers-contrast: more)');
  let preference = 'system';
  try {
    const saved = localStorage.getItem(storageKey);
    if (choices.has(saved)) preference = saved;
  } catch (_) { /* Appearance still works when browser storage is unavailable. */ }

  function apply() {
    const theme = preference === 'system' ? (contrast.matches ? 'contrast' : dark.matches ? 'night' : 'light') : preference;
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.appearance = preference;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'contrast' ? '#000000' : theme === 'night' ? '#101922' : '#f4f5f3');
    document.querySelectorAll('[name="appearance"]').forEach(input => { input.checked = input.value === preference; });
    document.querySelectorAll('[data-appearance-label]').forEach(node => { node.textContent = labels[preference]; });
    const summary = document.querySelector('.appearance-control summary');
    if (summary) summary.setAttribute('aria-label', `Display settings: ${labels[preference]}`);
  }

  apply(); // Before CSS and the app load: avoid a flash of the wrong appearance.
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    document.querySelectorAll('[name="appearance"]').forEach(input => input.addEventListener('change', () => {
      if (!input.checked || !choices.has(input.value)) return;
      preference = input.value;
      try { localStorage.setItem(storageKey, preference); } catch (_) { /* Optional preference storage. */ }
      apply();
      const status = document.getElementById('appearance-status');
      if (status) status.textContent = `${labels[preference]} display selected.`;
    }));
    document.addEventListener('click', event => {
      document.querySelectorAll('.appearance-control[open]').forEach(menu => {
        if (!menu.contains(event.target)) menu.open = false;
      });
    });
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      const menu = document.querySelector('.appearance-control[open]');
      if (menu) { menu.open = false; menu.querySelector('summary').focus(); }
    });
  });
  [dark, contrast].forEach(query => query.addEventListener('change', () => { if (preference === 'system') apply(); }));
  window.addEventListener('storage', event => {
    if (event.key === storageKey) { preference = choices.has(event.newValue) ? event.newValue : 'system'; apply(); }
  });
})();
