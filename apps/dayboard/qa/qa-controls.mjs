import {qaAction, qaState, subscribeQA} from './fake-supabase.mjs';

const actions = [
  ['lose', 'Lose next save replies'], ['remote', 'Remote edit first task'],
  ['expire', 'Expire test sign-in'], ['restore', 'Restore test sign-in'], ['delay', 'Delay next save 3s'],
  ['offline', 'Simulate offline'], ['polling', 'Polling only'],
];

function strip(inDialog = false) {
  const section = document.createElement('section');
  section.className = `qa-controls ${inDialog ? 'qa-controls--dialog' : 'qa-controls--page'}`;
  section.setAttribute('aria-label', 'Synthetic browser QA controls');
  section.innerHTML = `<div class="qa-heading"><strong>SYNTHETIC QA · client UI only</strong><span>No backend or email requests. Team data resets on reload.</span></div><div class="qa-actions">${actions.map(([action, label]) => `<a href="#qa-${action}" role="button" data-qa-action="${action}">${label}</a>`).join('')}</div><p class="qa-state" aria-live="polite"></p>`;
  updateStrip(section, qaState());
  return section;
}

function updateStrip(section, state) {
  const text = section.querySelector('.qa-state');
  const message = `${state.signedIn ? 'Owner signed in' : 'Signed out'} · Synthetic ${state.online ? 'online' : 'offline'} · ${state.liveUpdates ? 'Live notifications enabled' : 'Polling only'} · Server revision ${state.revision} · ${state.committed} committed saves · ${state.dropped} lost replies · ${state.taskCount} team tasks. ${state.lastEvent}`;
  if (text.textContent !== message) text.textContent = message;
  section.querySelector('[data-qa-action="lose"]').setAttribute('aria-pressed', String(state.loseArmed));
  section.querySelector('[data-qa-action="delay"]').setAttribute('aria-pressed', String(state.delayArmed));
  const offline = section.querySelector('[data-qa-action="offline"]');
  offline.setAttribute('aria-pressed', String(!state.online));
  offline.title = state.online ? 'Make synthetic requests fail and stop live updates.' : 'Restore the synthetic connection.';
  const polling = section.querySelector('[data-qa-action="polling"]');
  polling.setAttribute('aria-pressed', String(!state.liveUpdates));
  polling.title = state.liveUpdates ? 'Stop synthetic live notifications while keeping requests available.' : 'Restore synthetic live notifications.';
}

// These visible links remain operable during a deliberately stalled save. They
// are QA instrumentation, not normal app controls, and never alter app DOM data.
document.body.append(strip());
document.addEventListener('click', event => {
  const control = event.target.closest?.('[data-qa-action]');
  if (!control) return;
  event.preventDefault();
  qaAction(control.dataset.qaAction);
});
document.addEventListener('keydown', event => {
  if (event.key === ' ' && event.target.matches?.('[data-qa-action]')) { event.preventDefault(); event.target.click(); }
});
subscribeQA(state => { document.querySelectorAll('.qa-controls').forEach(section => updateStrip(section, state)); });

// Native modal dialogs make page controls inert. A clearly labelled copy lives
// inside each open modal so expiry/conflicts can be triggered while editing.
const observer = new MutationObserver(() => {
  for (const dialog of document.querySelectorAll('dialog[open]')) {
    const existing = dialog.querySelector('.qa-controls');
    if (!existing) dialog.append(strip(true));
    else updateStrip(existing, qaState());
  }
});
observer.observe(document.body, {subtree: true, childList: true, attributes: true, attributeFilter: ['open']});
