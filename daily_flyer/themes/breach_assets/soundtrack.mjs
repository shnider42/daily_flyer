import { MUSIC_CUES } from './music-cues.mjs';
const list = document.querySelector('#tracks'), player = document.querySelector('#player');
const title = document.querySelector('#now-title'), status = document.querySelector('#play-status');
let selected = null, generation = 0;
player.volume = .55;
const buttons = new Map();
const el = (tag, text, className) => { const item = document.createElement(tag); if (text) item.textContent = text; if (className) item.className = className; return item; };
function silence() {
  generation++; player.pause();
  if (player.readyState) player.currentTime = 0;
  status.textContent = 'Silence. Select a track when you’re ready.';
  for (const button of buttons.values()) button.setAttribute('aria-pressed','false');
}
async function select(cue) {
  silence(); const request = ++generation; selected = cue;
  title.textContent = cue.title;
  status.textContent = 'Loading…';
  player.src = cue.url.href;
  try { await player.play(); if (request === generation) status.textContent = 'One pass. The next track waits for you.'; }
  catch (_) { if (request === generation) status.textContent = 'Press play in the audio controls to listen, or try another track.'; }
}
for (const [index,cue] of MUSIC_CUES.entries()) {
  const row = el('article',null,'track'); row.id = cue.id;
  row.append(el('span',String(index+1).padStart(2,'0'),'track-number'));
  const body = el('div'); body.append(el('h3',cue.title));
  const duration = `${Math.floor(cue.seconds/60)}:${String(Math.round(cue.seconds%60)).padStart(2,'0')}`;
  body.append(el('span',`${cue.bpm ? cue.bpm + ' BPM' : 'FREE TIME'} / ${duration} / ${cue.kind === 'combat' ? 'PRESSURE' : 'DISCOVERY & BREATH'}`,'meta'),el('p',cue.sound));
  const placement = el('div',null,'placement');
  for (const [label,description] of [['WHEN IT FITS',cue.use],['LEAVE IT QUIET',cue.avoid]]) {
    const p = el('p'); p.append(el('strong',label),document.createTextNode(description)); placement.append(p);
  }
  body.append(placement); row.append(body);
  const actions = el('div',null,'track-actions'), button = el('button','LISTEN ↗');
  button.type = 'button'; button.setAttribute('aria-label',`Listen to ${cue.title}`); button.setAttribute('aria-pressed','false');
  button.addEventListener('click',() => select(cue)); buttons.set(cue.id,button);
  const midi = el('a','GET MIDI ↓'); midi.href = cue.midi.href; midi.download = `${cue.id}.mid`; midi.setAttribute('aria-label',`Download ${cue.title} MIDI`);
  actions.append(button,midi); row.append(actions); list.append(row);
}
player.addEventListener('play',() => { if (selected) buttons.get(selected.id)?.setAttribute('aria-pressed','true'); status.textContent = 'One pass. The next track waits for you.'; });
player.addEventListener('pause',() => { if (selected) buttons.get(selected.id)?.setAttribute('aria-pressed','false'); });
player.addEventListener('ended',() => { status.textContent = 'Silence. No automatic next track.'; });
player.addEventListener('error',() => { status.textContent = 'This track could not be loaded. Try again when connected.'; });
document.querySelector('#stop').addEventListener('click',silence);
document.addEventListener('visibilitychange',() => { if (document.hidden) silence(); });
window.addEventListener('pagehide',silence);
