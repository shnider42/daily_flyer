import {unlockAdmin, isAdminUnlocked, lockAdmin, buildTestUrl} from './admin-session.mjs';
import {LEVEL_ORDER, floorNumber, TITLES} from './core.mjs';

const gate = document.getElementById('gate');
const panel = document.getElementById('admin-panel');
const code = document.getElementById('admin-code');
const error = document.getElementById('gate-error');
let storage;
try { storage = window.sessionStorage; } catch {}

const FLOOR_DETAILS = {
  1: {place: 'SERVICE ACCESS', shortcuts: [['pattern', 'Last pattern step']]},
  2: {place: 'THE YELLOW ROOMS', shortcuts: [['chase', 'Trigger pursuit'], ['hole', 'Near the drop']]},
  4: {place: 'DRAINAGE', shortcuts: [['drain', 'At the open drain gate']]},
  5: {place: 'RECORDS', shortcuts: [['breakers', 'Breakers restored']]},
  6: {place: 'SERVICE PASSAGE', shortcuts: [['transit', 'Last safe refuge']]},
  3: {place: 'THE OTHER SIDE', shortcuts: [['ghost', 'Final encounter']]}
};

function floorMarkup(level) {
  const number = String(floorNumber(level)).padStart(2, '0');
  const details = FLOOR_DETAILS[level];
  const shortcuts = details.shortcuts.map(([action, label]) =>
    `<a class="launch" data-level="${level}" data-action="${action}" href="${buildTestUrl(level, action)}">${label}</a>`).join('');
  return `<article class="floor" aria-label="Floor ${number}">
    <span class="floor-number" aria-hidden="true">${number}</span>
    <div><h2>${TITLES[level]}</h2><p class="floor-place">${details.place}</p></div>
    <div class="floor-actions"><a class="launch primary" data-level="${level}" href="${buildTestUrl(level)}">Enter floor ${number}<span aria-hidden="true">→</span></a>${shortcuts ? `<div class="shortcuts">${shortcuts}</div>` : ''}</div>
  </article>`;
}

function hidePanel() {
  panel.hidden = true;
  panel.replaceChildren();
  gate.hidden = false;
  code.value = '';
}

function showPanel() {
  if (!isAdminUnlocked(storage)) { hidePanel(); return; }
  if (!panel.childElementCount) {
    panel.innerHTML = `
      <div class="panel-heading"><div><p class="eyebrow">FURTHER IN / PLAYTEST</p><h1>Floor tests</h1><p class="intro">Start anywhere in the descent, or jump to a specific moment.</p></div><button id="lock-admin">Lock admin</button></div>
      <div class="tools"><label class="check"><input id="telemetry" type="checkbox">Show test telemetry</label><p class="fine">Test progress stays separate from your regular game.</p></div>
      <div class="floors">${LEVEL_ORDER.map(floorMarkup).join('')}</div>
      <details class="notes"><summary>Floor notes & solutions <small>SPOILERS</small></summary><div class="notes-content">
        <p><strong>01 / Pattern:</strong> Follow the door marks 1 → 2 → 3 → 1. A wrong choice loops the corridor. There is no lethal enemy here; the distant glimpse happens only once per attempt.</p>
        <p><strong>02 / Pursuit:</strong> The resonator is beside the starting room. Aim a pulse at the pursuer to stun it briefly. Repeated effective pulses shorten the stun and make it faster. Find the hole and drop through it to continue.</p>
        <p><strong>03 / Drainage:</strong> Read the service card, then turn valves 02 → 01 → 03. The north gate opens when the sequence is complete. The drain shortcut solves the sequence and puts you at the exit.</p>
        <p><strong>04 / Records:</strong> Restore both breakers in the side refuges, in either order. The generator hums for seven seconds, then falls quiet for four. Move through the main hall while it hums; wait in place or shelter in the refuges during the quiet. The warning light makes the timing visible. The breaker shortcut restores power without removing the quiet rule.</p>
        <p><strong>05 / Service passage:</strong> Pass three inspection-light bays. Wait for the warm light to go out, then cross; the side alcoves are safe checkpoints. Amber warns that another inspection is about to begin. Reach the transit door to continue to the garden. The transit shortcut starts in the last safe refuge.</p>
        <p><strong>06 / The other side:</strong> Every door advances the sequence. After 7–9 choices the ghost appears. Stop moving and face it for 4.5 seconds to win. Keep fleeing and it catches you. Sprint into it to earn the medal and lose the attempt.</p>
      </div></details>
      <div class="panel-bottom"><a href="./">← Return to the game</a><p class="fine">Tap the entry button after launch to begin with sound.</p></div>`;
    document.getElementById('telemetry').addEventListener('change', event => {
      panel.querySelectorAll('[data-level]').forEach(link => {
        link.href = buildTestUrl(Number(link.dataset.level), link.dataset.action || '', event.target.checked);
      });
    });
    document.getElementById('lock-admin').addEventListener('click', () => {
      lockAdmin(storage);
      hidePanel();
      error.textContent = 'Admin locked.';
      code.focus();
    });
  }
  error.textContent = '';
  code.value = '';
  gate.hidden = true;
  panel.hidden = false;
}

document.getElementById('unlock-form').addEventListener('submit', event => {
  event.preventDefault();
  if (unlockAdmin(code.value, storage)) { showPanel(); return; }
  error.textContent = storage ? 'Incorrect code. Try again.' : 'Enable session storage in your browser to unlock admin.';
  code.value = '';
  code.focus();
});

panel.addEventListener('click', event => {
  if (event.target.closest('a') && !isAdminUnlocked(storage)) {
    event.preventDefault();
    hidePanel();
  }
});

// Clear spoiler content before a cached page can be restored by Back.
window.addEventListener('pagehide', hidePanel);
window.addEventListener('pageshow', showPanel);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !isAdminUnlocked(storage)) hidePanel();
});
showPanel();
