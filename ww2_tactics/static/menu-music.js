/* The approved full arrangement belongs to Squad Leader's menus only. */
'use strict';
document.addEventListener('DOMContentLoaded', () => {
 const audio = document.getElementById('menuMusic');
 const controls = document.getElementById('menuMusicControls');
 const toggle = document.getElementById('menuMusicToggle');
 const status = document.getElementById('menuMusicStatus');
 const lobby = document.getElementById('lobby');
 const game = document.getElementById('game');
 const preference = 'ww2-menu-music';
 let enabled = true, unlocked = false, pageActive = true;
 let pending = false, retryRequired = false, attempt = 0;
 try { enabled = localStorage.getItem(preference) !== 'off'; } catch {}
 audio.volume = 0.35;
 audio.loop = true;
 controls.hidden = false;

 function inMenu() {
  return !lobby.hidden && game.hidden && !document.body.classList.contains('empires-active');
 }
 function shouldPlay() {
  return enabled && unlocked && pageActive && !document.hidden && inMenu();
 }
 function paint() {
  toggle.setAttribute('aria-pressed', String(enabled));
  toggle.textContent = retryRequired && enabled ? 'Music: retry' : `Music: ${enabled ? 'on' : 'off'}`;
  status.textContent = !enabled ? 'Menu music is off.'
   : retryRequired ? 'Tap Music to try again.'
   : !unlocked ? 'Starts after your first tap.'
   : pending ? 'Loading music…'
   : !audio.paused ? 'Playing · loops in the menus.' : 'Ready for the Squad Leader menu.';
 }
 function pause() {
  attempt++;
  pending = false;
  audio.pause();
  paint();
 }
 function sync() {
  if (!shouldPlay()) { pause(); return; }
  if (pending || !audio.paused || retryRequired) { paint(); return; }
  // No download or autoplay attempt before a gesture; reuse one player on return.
  if (!audio.getAttribute('src')) audio.src = '/assets/audio/battlefield-1942-full-arrangement-v1.mp3';
  if (audio.error) audio.load();
  const current = ++attempt;
  pending = true;
  paint();
  audio.play().then(() => {
   if (current !== attempt) return;
   pending = false;
   if (!shouldPlay()) pause(); else paint();
  }).catch(() => {
   if (current !== attempt) return;
   pending = false;
   retryRequired = true;
   paint();
  });
 }
 toggle.addEventListener('click', () => {
  unlocked = true;
  enabled = retryRequired ? true : !enabled;
  retryRequired = false;
  try { localStorage.setItem(preference, enabled ? 'on' : 'off'); } catch {}
  sync();
 });
 function gesture(event) {
  if (event.target.closest?.('#menuMusicToggle')) return;
  unlocked = true;
  // Retry a browser's autoplay rejection within the next real interaction.
  retryRequired = false;
  sync();
 }
 document.addEventListener('click', gesture);
 document.addEventListener('keydown', event => {
  if (event.repeat || !['Enter', ' '].includes(event.key) ||
      event.target.closest?.('input, textarea, select, [contenteditable]')) return;
  gesture(event);
 });
 audio.addEventListener('playing', () => { if (!shouldPlay()) pause(); else paint(); });
 audio.addEventListener('pause', paint);
 audio.addEventListener('error', () => { retryRequired = true; pending = false; paint(); });
 document.addEventListener('visibilitychange', sync);
 window.addEventListener('pagehide', () => { pageActive = false; sync(); });
 window.addEventListener('pageshow', () => { pageActive = true; sync(); });
 window.addEventListener('storage', event => {
  if (event.key !== preference && event.key !== null) return;
  try { enabled = localStorage.getItem(preference) !== 'off'; } catch {}
  sync();
 });
 const observer = new MutationObserver(sync);
 observer.observe(lobby, { attributes: true, attributeFilter: ['hidden'] });
 observer.observe(game, { attributes: true, attributeFilter: ['hidden'] });
 observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
 sync();
});
