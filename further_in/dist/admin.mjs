import {unlockAdmin, isAdminUnlocked, lockAdmin, buildTestUrl} from './admin-session.mjs';

const gate = document.getElementById('gate');
const panel = document.getElementById('admin-panel');
const code = document.getElementById('admin-code');
const error = document.getElementById('gate-error');
let storage;
try { storage = window.sessionStorage; } catch {}

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
      <div class="panel-heading"><div><p class="eyebrow">ADMIN / PLAYTEST</p><h1>Every door is open.</h1><p class="intro">Start a floor in isolation or jump to a specific moment.</p></div><button id="lock-admin">Lock admin</button></div>
      <div class="tools"><label class="check"><input id="telemetry" type="checkbox">Show test telemetry</label><p class="fine">Test progress stays separate from your regular game.</p></div>
      <div class="floors">
        <article class="floor"><span class="floor-number">FLOOR 01</span><h2>The same way out</h2><p>THE SERVICE CORRIDOR</p><a class="launch primary" data-level="1" href="${buildTestUrl(1)}">Enter floor 01 <span aria-hidden="true">↗</span></a><div class="shortcuts"><a class="launch" data-level="1" data-action="pattern" href="${buildTestUrl(1,'pattern')}">Last pattern step</a></div></article>
        <article class="floor"><span class="floor-number">FLOOR 02</span><h2>The lights are still on</h2><p>THE YELLOW ROOMS</p><a class="launch primary" data-level="2" href="${buildTestUrl(2)}">Enter floor 02 <span aria-hidden="true">↗</span></a><div class="shortcuts"><a class="launch" data-level="2" data-action="chase" href="${buildTestUrl(2,'chase')}">Trigger pursuit</a><a class="launch" data-level="2" data-action="hole" href="${buildTestUrl(2,'hole')}">Near the drop</a></div></article>
        <article class="floor"><span class="floor-number">FLOOR 03</span><h2>Somewhere beautiful</h2><p>THE OTHER SIDE</p><a class="launch primary" data-level="3" href="${buildTestUrl(3)}">Enter floor 03 <span aria-hidden="true">↗</span></a><div class="shortcuts"><a class="launch" data-level="3" data-action="ghost" href="${buildTestUrl(3,'ghost')}">Final ghost</a></div></article>
      </div>
      <details class="notes"><summary>Floor notes & solutions <small>SPOILERS</small></summary><div class="notes-content">
        <p><strong>01 / Pattern:</strong> Follow the door marks 1 → 2 → 3 → 1. A wrong choice loops the corridor. There is no lethal enemy here; the distant glimpse happens only once per attempt.</p>
        <p><strong>02 / Pursuit:</strong> The resonator is beside the starting room. Aim a pulse at the pursuer to stun it briefly. Repeated effective pulses shorten the stun and make it faster. Find the hole and drop through it to continue.</p>
        <p><strong>03 / The other side:</strong> Every door advances the sequence. After 7–9 choices the ghost appears. Stop moving and face it for 4.5 seconds to win. Keep fleeing and it catches you. Sprint into it to earn the medal and lose the attempt.</p>
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
  error.textContent = storage ? 'That code did not open the door. Try again.' : 'Enable session storage in your browser to unlock admin.';
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
