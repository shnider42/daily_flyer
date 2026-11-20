import { MUSIC_CUES, THEME_ID } from './music-catalog.mjs';

const GROUPS = Object.freeze([
  ['all', 'All pieces'], ['theme', 'Theme & homecoming'], ['travel', 'Space & ship life'],
  ['worlds', 'Worlds & caves'], ['social', 'Ports & nightlife'], ['field', 'Field expeditions'], ['danger', 'Danger'], ['crosswind', 'Crosswind warzone'],
]);
const FAMILIES = Object.freeze({ theme: 'Main theme', exploration: 'Exploration', planet: 'Planets & moons', cave: 'Caves & passages', social: 'Life at port', discovery: 'Discovery', tension: 'Unease', combat: 'Danger', recovery: 'A moment to recover', terror: 'Rare encounters' });
const SITUATIONS = Object.freeze({
  'no-way-back': 'A C-minor pressure piece for actual danger in Quiet Earth: piano, warm synthesizer, low bass and drums. The quiet corridor keeps its own recording.',
  'morrow-flightline-loop': 'A recorded cue for the Floodworks service gallery and the danger rotation.',
  'shnider-theme': 'Farwake’s recorded menu theme. It loops on the title screen and plays once when requested during a voyage.',
  'long-way-home': 'The original synthesized theme. A small beginning, a wider horizon, and the way home.',
  'lamps-in-the-cabin': 'Quiet time aboard ship, away from the helm.',
  'under-the-service-lights': 'Following service passages and bringing the Floodworks back to life.',
  'the-foreman-cycle': 'The active machine bay, with room to hear its warnings.',
  'carry-the-light': 'The relief of bringing someone safely out.',
  'after-hours-on-glimmer': 'Low Orbit and the late-night company of Voltage.',
  'rain-on-the-transit-line': 'Glimmer’s streets after dark.',
  'crosswind-kill-corridor': 'Fast thrash for the fleet crossing: clipped low riffs, double-kick drive, and a hard return after the breakdown.',
  'crosswind-iron-teeth': 'A heavy syncopated groove: low guitar punches, tom accents, and a grinding half-time middle.',
  'crosswind-ashes-in-orbit': 'Driving metalcore rhythm guitars, a contrasting middle, and a final full-band return.',
});

export function musicGroup(cue, group = 'all') {
  const tags = cue?.tags || [];
  if (group === 'theme') return ['theme', 'recovery', 'discovery'].includes(cue?.family);
  if (group === 'travel') return cue?.family === 'exploration' && (tags.includes('flight') || tags.includes('ship'));
  if (group === 'worlds') return ['planet', 'cave'].includes(cue?.family) || cue?.family === 'exploration' && (tags.includes('planet') || tags.includes('cave') || tags.includes('surface'));
  if (group === 'social') return cue?.family === 'social';
  if (group === 'field') return tags.includes('fieldwork');
  if (group === 'crosswind') return tags.includes('crosswind');
  if (group === 'danger') return ['combat', 'tension', 'terror'].includes(cue?.family);
  return true;
}

export function musicListeningText(status = {}, enabled = true, cues = MUSIC_CUES) {
  if (!enabled) return 'Music is off.';
  if (status.state === 'unavailable') return 'Music could not start in this browser. Reload to try again.';
  if (status.state === 'locked') return 'Music starts after your next click or tap.';
  if (['suspended', 'interrupted'].includes(status.state)) return 'Music is paused. Tap Listen to resume.';
  const requested = cues.find(cue => cue.id === status.requestedCueId);
  const current = status.cueId && status.title && status.title !== 'Quiet' ? `Now playing · ${status.title}.` : 'A quiet moment between pieces.';
  if (requested) return `${current} Queued · ${requested.title}. ${status.warzone?'It will play after you leave Crosswind.':'It will play when things settle.'}`;
  return current;
}

/** A session-only listening panel. Opening or browsing never starts a piece. */
export function createMusicLibraryUI({ dialog, audio, getSettings, saveSettings = () => {}, onChange = () => {},
  openSettings = () => {}, toast = () => {}, cues = MUSIC_CUES, document: doc = globalThis.document,
  now = () => performance.now() / 1000 } = {}) {
  let selectedId = cues.some(cue => cue.id === THEME_ID) ? THEME_ID : cues[0]?.id, group = 'all', view = null;
  const element = (tag, className = '', text = '') => {
    const node = doc.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node;
  };
  const text = (node, value) => { if (node.textContent !== value) node.textContent = value; };
  const current = () => view && dialog.opened && dialog.kind === 'music' && dialog.revision === view.revision;
  const validAction = callback => {
    const revision = dialog.revision;
    return () => { if (current() && view.revision === revision) callback(); };
  };
  function option(value, label) { const node = element('option', '', label); node.value = value; return node; }
  function persist() { saveSettings(); audio.mute(); onChange(); refresh(); }
  function choose() {
    const options = cues.filter(cue => musicGroup(cue, group));
    if (!options.some(cue => cue.id === selectedId)) selectedId = options[0]?.id;
    view.piece.replaceChildren(...options.map(cue => option(cue.id, cue.title)));
    view.piece.value = selectedId || ''; view.count.textContent = `${options.length} ${options.length === 1 ? 'piece' : 'pieces'}`;
    describe(); refresh();
  }
  function describe() {
    const cue = cues.find(entry => entry.id === selectedId);
    text(view.credit, cue?.credit || ''); view.credit.hidden = !cue?.credit;
    view.piece.setAttribute('aria-describedby', cue?.credit ? 'musicLibraryDescription musicLibraryCredit' : 'musicLibraryDescription');
    if (!cue) { text(view.description, 'There are no pieces in this selection.'); return; }
    const seconds = Math.round(cue.durationSeconds || 0), duration = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    text(view.detail, `${FAMILIES[cue.family] || 'Farwake score'} · ${duration}`);
    text(view.description, SITUATIONS[cue.id] || (cue.family === 'terror' ? 'A brief, sparse disturbance for an encounter you have actually witnessed.'
      : cue.family === 'combat' ? 'Movement and weight for a danger already underway.'
      : cue.family === 'tension' ? 'Uncertainty when something has caught your attention.'
      : cue.family === 'recovery' ? 'Space to breathe after a difficult passage.'
      : cue.family === 'discovery' ? 'A glimpse of possibility.'
      : cue.family === 'social' ? 'A little company where people gather.'
      : cue.tags?.includes('cave') ? 'Sparse phrases for the passages below.' : 'A piece for a quiet stretch of the voyage.'));
  }
  function listen(intent = null) {
    const cue = cues.find(entry => entry.id === selectedId), status = audio.musicStatus();
    if (!cue || status.state === 'unavailable') return;
    const stop = intent === 'stop' || intent !== 'start' && (status.requestedCueId === selectedId || status.preview && status.previewCueId === selectedId);
    if (stop) {
      audio.stopPreview(now()); onChange(); refresh(); return;
    }
    const settings = getSettings();
    const changed = !settings.music || settings.musicVolume === 0;
    settings.music = true; if (settings.musicVolume === 0) settings.musicVolume = .65;
    if (changed) saveSettings();
    audio.unlock();
    if (!audio.requestCue(cue.id, now())) toast('This piece could not start. Try again in a moment.', 'info', 4000);
    onChange(); refresh();
  }
  function setting(labelText, help, input) {
    const row = element('div', 'setting-row'), label = element('label'); label.htmlFor = input.id;
    label.append(element('strong', '', labelText), element('small', '', help)); row.append(label, input); return row;
  }
  function open() {
    dialog.open('Music & listening', 'music', { eyebrow: 'FARWAKE SCORE' });
    const root = element('section', 'music-library'); root.setAttribute('aria-label', 'Farwake music library');
    const intro = element('p', 'section-note', 'Choose a piece to hear once. The voyage chooses the score again afterward. Crosswind keeps its three battle pieces in a shuffled rotation; peaceful travel leaves room for silence.');
    const status = element('p', 'music-listening-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.setAttribute('aria-atomic', 'true');
    const selectors = element('div', 'music-selectors');
    const categoryLabel = element('label', 'music-select-label', 'Situation'); categoryLabel.htmlFor = 'musicLibraryGroup';
    const category = element('select'); category.id = 'musicLibraryGroup';
    for (const [value, label] of GROUPS) if (value === 'all' || cues.some(cue => musicGroup(cue, value))) category.append(option(value, label));
    category.value = group; categoryLabel.append(category);
    const pieceLabel = element('label', 'music-select-label', 'Piece'); pieceLabel.htmlFor = 'musicLibraryPiece';
    const piece = element('select'); piece.id = 'musicLibraryPiece'; pieceLabel.append(piece);
    selectors.append(categoryLabel, pieceLabel);
    const count = element('span', 'music-piece-count'), detail = element('p', 'music-piece-detail'), description = element('p', 'music-piece-description');
    const credit = element('p', 'music-piece-credit'); credit.id = 'musicLibraryCredit'; credit.hidden = true;
    description.id = 'musicLibraryDescription'; piece.setAttribute('aria-describedby', description.id);
    const actions = element('div', 'music-listening-actions'), play = element('button', 'button-primary', 'Listen'), adaptive = element('button', '', 'Return to voyage music');
    play.type = adaptive.type = 'button'; actions.append(play, adaptive);
    const controls = element('div', 'music-listening-controls');
    const enabled = element('input'); enabled.id = 'libraryMusicEnabled'; enabled.type = 'checkbox';
    const volume = element('input'); volume.id = 'libraryMusicVolume'; volume.type = 'range'; volume.min = '0'; volume.max = '1'; volume.step = '.05';
    const volumeValue = element('output'); volumeValue.htmlFor = volume.id;
    const volumeRow = setting('Music volume', 'Sound effects keep their own setting.', volume); volumeRow.firstChild.append(volumeValue);
    const presence = element('select'); presence.id = 'libraryMusicPresence';
    for (const [value, label] of [['quiet', 'More quiet'], ['balanced', 'Balanced'], ['frequent', 'More music']]) presence.append(option(value, label));
    controls.append(setting('Music', 'Enable the score during your voyage.', enabled), volumeRow,
      setting('How often music plays', 'Changes the quiet between peaceful pieces. Danger responds when it happens.', presence));
    const foot = element('p', 'audio-note', 'Listening here is personal. In a shared galaxy, the world keeps moving and immediate danger takes priority.');
    const back = element('button', 'music-settings-back', 'Back to settings'); back.type = 'button';
    root.append(intro, status, selectors, count, detail, description, credit, actions, controls, foot, back); dialog.body.append(root);
    view = { revision: dialog.revision, root, category, piece, count, detail, description, credit, status, play, adaptive, enabled, volume, volumeValue, presence };
    category.onchange = validAction(() => { group = GROUPS.some(([id]) => id === category.value) ? category.value : 'all'; choose(); });
    piece.onchange = validAction(() => { if (cues.some(cue => cue.id === piece.value && musicGroup(cue, group))) selectedId = piece.value; describe(); refresh(); });
    let playIntent = null;
    const rememberIntent = () => { const state = audio.musicStatus(); playIntent = state.requestedCueId === selectedId || state.preview && state.previewCueId === selectedId ? 'stop' : 'start'; };
    play.onpointerdown = validAction(rememberIntent);
    play.onkeydown = event => { if (current() && !event.repeat && (event.key === 'Enter' || event.key === ' ')) rememberIntent(); };
    play.onpointercancel = play.onblur = () => { playIntent = null; };
    play.onclick = validAction(() => { const intent = playIntent; playIntent = null; listen(intent); });
    adaptive.onclick = validAction(() => { audio.stopPreview(now()); onChange(); refresh(); });
    enabled.onchange = validAction(() => { getSettings().music = !!enabled.checked; if (enabled.checked) audio.unlock(); persist(); });
    volume.oninput = validAction(() => { const value = Number(volume.value); if (Number.isFinite(value)) getSettings().musicVolume = Math.max(0, Math.min(1, value)); persist(); });
    presence.onchange = validAction(() => { if (['quiet', 'balanced', 'frequent'].includes(presence.value)) getSettings().musicPresence = presence.value; persist(); });
    back.onclick = validAction(openSettings);
    choose(); return root;
  }
  function refresh() {
    if (!current()) return false;
    const settings = getSettings(), status = audio.musicStatus(), waiting = status.requestedCueId === selectedId;
    const playing = status.preview && status.previewCueId === selectedId;
    text(view.status, musicListeningText(status, settings.music, cues));
    text(view.play, waiting ? 'Cancel queued piece' : playing ? 'Stop listening' : 'Listen');
    view.play.disabled = status.state === 'unavailable' || !selectedId;
    view.play.setAttribute('aria-pressed', String(!!(waiting || playing)));
    view.adaptive.hidden = !(status.preview || status.requestedCueId);
    view.enabled.checked = !!settings.music;
    const volume = Number.isFinite(settings.musicVolume) ? settings.musicVolume : .65;
    view.volume.value = String(volume); view.volume.setAttribute('aria-valuetext', `${Math.round(volume * 100)} percent`);
    text(view.volumeValue, `${Math.round(volume * 100)}%`);
    view.presence.value = settings.musicPresence || 'balanced';
    return true;
  }
  return { open, refresh };
}
