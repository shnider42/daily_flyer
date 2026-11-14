/* Shared HUDDLE sport navigation; sport-specific preferences remain independent. */
(function (root) {
  'use strict';
  const KEY = 'dfe-huddle-sport-v1';
  function destination(href, current, selected, fresh = true) {
    const url = new URL(href);
    const dynamic = /\/v2\/?$/.test(url.pathname);
    const target = dynamic ? new URL(url.pathname, url.origin)
      : new URL(selected === 'soccer' ? (current === 'soccer' ? './' : './soccer/') : (current === 'soccer' ? '../' : './'), url);
    if (dynamic) target.searchParams.set('product', selected === 'soccer' ? 'huddle_soccer' : 'nfl_catch_up');
    target.searchParams.set('sport', selected);
    if (selected === 'soccer') {
      target.searchParams.set('lang', 'pt-BR');
      if (fresh) target.searchParams.set('team', 'MCI');
    }
    return target;
  }
  function route(href, current, saved) {
    const url = new URL(href), requested = url.searchParams.get('sport');
    const explicitNFL = url.hash.startsWith('#catchup=') || (url.searchParams.has('lang') && url.searchParams.get('lang') !== 'pt-BR');
    if (current !== 'soccer' && (requested === 'soccer' || url.hash.startsWith('#soccer=') || requested !== 'nfl' && url.searchParams.get('lang') === 'pt-BR')) {
      const target = destination(href, current, 'soccer');
      if (url.searchParams.has('team')) target.searchParams.set('team', url.searchParams.get('team'));
      if (url.hash.startsWith('#soccer=')) target.hash = url.hash;
      return target.href;
    }
    if (requested === 'nfl' && current !== 'nfl') return destination(href, current, 'nfl').href;
    if (current === 'nfl' && !requested && !explicitNFL && saved === 'soccer') return destination(href, current, 'soccer', false).href;
    return null;
  }
  if (typeof module !== 'undefined') {module.exports = {destination, route}; return;}
  const current = document.documentElement.dataset.sport || 'nfl';
  let saved; try {saved = localStorage.getItem(KEY);} catch {}
  const target = route(location.href, current, saved);
  root.HuddleSports = {redirecting: Boolean(target)};
  if (target) {location.replace(target); return;}
  try {localStorage.setItem(KEY, current);} catch {}
  function bind() {
    const select = document.getElementById('sport-select');
    if (!select) return;
    select.value = current;
    select.addEventListener('change', () => {
      const next = select.value === 'soccer' ? 'soccer' : 'nfl';
      try {localStorage.setItem(KEY, next);} catch {}
      location.assign(destination(location.href, current, next).href);
    });
    function labels() {
      const language = document.documentElement.lang;
      const copy = {'en-US': ['Sport', 'Soccer'], en: ['Sport', 'Soccer'], 'de-AT': ['Sport', 'Fußball'],
        'hi-IN': ['खेल', 'फ़ुटबॉल'], 'gu-IN': ['રમત', 'ફૂટબૉલ'], 'pt-BR': ['Esporte', 'Futebol']}[language] || ['Sport', 'Soccer'];
      const label = document.querySelector('[data-sport-label]');
      if (label) label.textContent = copy[0];
      select.setAttribute('aria-label', copy[0]);
      const option = select.querySelector('option[value="soccer"]');
      if (option) option.textContent = copy[1];
    }
    labels();
    new MutationObserver(labels).observe(document.documentElement, {attributes: true, attributeFilter: ['lang']});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
})(typeof globalThis !== 'undefined' ? globalThis : this);
