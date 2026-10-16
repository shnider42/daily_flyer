/* Runs in the head so a saved night preference is applied before first paint. */
(() => {
  'use strict';
  const storageKey = 'your-passage:appearance';
  const documentRoot = document.documentElement;
  const media = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const normalize = value => value === 'day' || value === 'night' ? value : 'system';
  function readPreference() {
    try { return normalize(localStorage.getItem(storageKey)); }
    catch (_) { return 'system'; }
  }
  let preference = readPreference();
  let saved = true;
  let controls;
  let toggle;
  let systemButton;
  let status;

  function apply() {
    const appearance = preference === 'system' ? (media?.matches ? 'night' : 'day') : preference;
    documentRoot.dataset.ypAppearance = appearance;
    documentRoot.dataset.ypAppearancePreference = preference;
    const themeColor = document.getElementById('yp-theme-color');
    if (themeColor) themeColor.content = appearance === 'night' ? '#121e29' : '#f4f6f4';
    if (!controls) return;
    toggle.setAttribute('aria-checked', String(appearance === 'night'));
    systemButton.setAttribute('aria-pressed', String(preference === 'system'));
    const label = appearance === 'night' ? 'Night' : 'Day';
    status.textContent = !saved
      ? `${label} mode for this visit. This browser could not save your appearance preference.`
      : preference === 'system' ? `${label} mode. Following your device setting.`
        : `${label} mode. Preference saved on this browser. Select Device to follow your device setting again.`;
    controls.querySelector('[data-appearance-unsaved]').hidden = saved;
  }
  function choose(next) {
    preference = next;
    saved = true;
    try {
      if (next === 'system') localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, next);
    } catch (_) { saved = false; }
    apply();
  }
  function mount() {
    controls = document.getElementById('yp-appearance');
    if (!controls) return;
    toggle = document.getElementById('yp-appearance-toggle');
    systemButton = document.getElementById('yp-appearance-system');
    status = document.getElementById('yp-appearance-status');
    toggle.addEventListener('click', () => choose(documentRoot.dataset.ypAppearance === 'night' ? 'day' : 'night'));
    systemButton.addEventListener('click', () => choose('system'));
    apply();
    controls.hidden = false;
  }

  apply();
  if (media?.addEventListener) media.addEventListener('change', () => { if (preference === 'system') apply(); });
  else if (media?.addListener) media.addListener(() => { if (preference === 'system') apply(); });
  window.addEventListener('storage', event => {
    if (event.key !== storageKey && event.key !== null) return;
    preference = event.key === null ? readPreference() : normalize(event.newValue);
    saved = true;
    apply();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once: true});
  else mount();
})();
