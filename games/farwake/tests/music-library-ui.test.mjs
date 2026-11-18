import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createMusicLibraryUI, musicGroup, musicListeningText } from '../dist/music-library-ui.mjs';
import { THEME_ID, MUSIC_CUES } from '../dist/music-catalog.mjs';
import { MENU_THEME } from '../dist/recorded-theme.mjs';

class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {}; this.textContent = ''; this.value = ''; this.checked = false; this.hidden = false; this.disabled = false; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  get firstChild() { return this.children[0]; }
}
const catalog = [
  { id: THEME_ID, title: 'The Long Way Home', family: 'theme', tags: ['home'], durationSeconds: 197 },
  { id: 'cabin', title: 'Cabin light', family: 'exploration', tags: ['ship', 'cabin'], durationSeconds: 65 },
  { id: 'field', title: 'Service lights', family: 'exploration', tags: ['fieldwork', 'surface'], durationSeconds: 70 },
  { id: 'foreman', title: 'Foreman cycle', family: 'combat', tags: ['fieldwork'], durationSeconds: 52 },
  { id: 'port', title: 'After hours', family: 'social', tags: ['nightlife'], durationSeconds: 74 },
];
function fixture(initial = {}, initialStatus = {}, cues = catalog) {
  const settings = { music: true, musicVolume: .65, musicPresence: 'balanced', sound: false, ...initial };
  let status = { state: 'running', cueId: null, title: 'Quiet', theme: false, preview: false, previewCueId: null, requestedCueId: null, ...initialStatus };
  const calls = [], saved = [], notices = [];
  const document = { createElement: tag => new Element(tag) };
  const dialog = { body: new Element('div'), opened: false, revision: 0, kind: null,
    open(title, kind) { this.title = title; this.kind = kind; this.opened = true; this.revision++; this.body.replaceChildren(); },
    close() { this.opened = false; this.revision++; },
  };
  const audio = { musicStatus: () => status, unlock: () => calls.push(['unlock']), mute: () => calls.push(['mute']),
    requestCue(id, now) { calls.push(['request', id, now]); status = { ...status, requestedCueId: id }; return true; },
    stopPreview(now) { calls.push(['stop', now]); status = { ...status, preview: false, previewCueId: null, requestedCueId: null }; },
  };
  const ui = createMusicLibraryUI({ dialog, audio, getSettings: () => settings, saveSettings: () => saved.push({ ...settings }),
    openSettings: () => dialog.open('Settings', 'settings'), now: () => 88, document, cues, toast: (...args) => notices.push(args) });
  const all = () => { const list = []; function visit(node) { list.push(node); node.children.forEach(visit); } visit(dialog.body); return list; };
  return { ui, dialog, settings, calls, saved, notices, all, node: id => all().find(node => node.id === id),
    button: label => all().find(node => node.tagName === 'button' && node.textContent === label),
    status: () => status, setStatus: next => { status = { ...status, ...next }; },
    text: () => all().map(node => node.textContent).join('\n') };
}

test('opening and browsing the score are silent and preserve disabled preferences', () => {
  const f = fixture({ music: false, musicVolume: 0 }); f.ui.open();
  assert.equal(f.dialog.title, 'Music & listening'); assert.match(f.text(), /Music is off/);
  assert.equal(f.node('musicLibraryGroup').value, 'all');
  assert.equal(f.node('musicLibraryPiece').children.length, catalog.length);
  assert.equal(f.node('musicLibraryPiece').attributes['aria-describedby'], 'musicLibraryDescription');
  const category = f.node('musicLibraryGroup'); category.value = 'field'; category.onchange();
  assert.deepEqual(f.node('musicLibraryPiece').children.map(node => node.value), ['field', 'foreman']);
  f.node('musicLibraryPiece').value = 'foreman'; f.node('musicLibraryPiece').onchange();
  assert.match(f.text(), /Danger · 0:52/); assert.deepEqual(f.calls, []); assert.deepEqual(f.saved, []);
  assert.equal(f.settings.music, false); assert.equal(f.settings.musicVolume, 0);
});

test('Listen is the explicit gesture that enables music and requests exactly the selected piece', () => {
  const f = fixture({ music: false, musicVolume: 0 }); f.ui.open();
  f.node('musicLibraryPiece').value = 'cabin'; f.node('musicLibraryPiece').onchange(); f.button('Listen').onclick();
  assert.deepEqual(f.calls, [['unlock'], ['request', 'cabin', 88]]);
  assert.equal(f.saved.length, 1); assert.equal(f.settings.music, true); assert.equal(f.settings.musicVolume, .65);
  assert.equal(f.settings.sound, false, 'Listening never enables effects.');
  assert.equal(f.node('libraryMusicEnabled').checked, true); assert.equal(f.node('libraryMusicVolume').value, '0.65');
  assert.match(f.text(), /Queued · Cabin light/); assert.ok(f.button('Cancel queued piece'));
  assert.equal(f.button('Cancel queued piece').attributes['aria-pressed'], 'true');
  f.button('Cancel queued piece').onclick();
  assert.deepEqual(f.calls.at(-1), ['stop', 88]); assert.equal(f.settings.music, true);
});

test('the recorded theme has a visible contribution credit that does not carry over to another piece', () => {
  const f = fixture({}, {}, MUSIC_CUES); f.ui.open();
  assert.equal(f.node('musicLibraryPiece').value, THEME_ID);
  assert.equal(f.node('musicLibraryCredit').textContent, MENU_THEME.credit);
  assert.equal(f.node('musicLibraryCredit').hidden, false);
  assert.match(f.node('musicLibraryPiece').attributes['aria-describedby'], /musicLibraryCredit/);
  assert.doesNotMatch(f.text(), /by Shnider/);
  f.node('musicLibraryPiece').value = 'long-way-home'; f.node('musicLibraryPiece').onchange();
  assert.equal(f.node('musicLibraryCredit').hidden, true);
  assert.equal(f.node('musicLibraryCredit').textContent, '');
  assert.deepEqual(f.calls, [], 'Reading music credits does not start playback.');
});

test('volume and cadence changes persist independently without requesting a piece or unmuting', () => {
  const f = fixture({ music: false }); f.ui.open();
  const volume = f.node('libraryMusicVolume'), presence = f.node('libraryMusicPresence');
  volume.value = '0.3'; volume.oninput(); presence.value = 'quiet'; presence.onchange();
  assert.equal(f.settings.music, false); assert.equal(f.settings.musicVolume, .3); assert.equal(f.settings.musicPresence, 'quiet');
  assert.equal(f.saved.length, 2); assert.deepEqual(f.calls, [['mute'], ['mute']]);
  assert.equal(volume.attributes['aria-valuetext'], '30 percent');
  volume.value = 'not a volume'; volume.oninput(); assert.equal(f.settings.musicVolume, .3);
  presence.value = 'invalid'; presence.onchange(); assert.equal(f.settings.musicPresence, 'quiet');
});

test('stopping an active audition returns control to the voyage without switching off music', () => {
  const f = fixture({}, { cueId: THEME_ID, title: 'The Long Way Home', preview: true, previewCueId: THEME_ID });
  f.ui.open(); assert.ok(f.button('Stop listening')); assert.equal(f.button('Return to voyage music').hidden, false);
  f.button('Stop listening').onclick();
  assert.deepEqual(f.calls, [['stop', 88]]); assert.equal(f.settings.music, true); assert.equal(f.saved.length, 0);
  assert.equal(f.button('Return to voyage music').hidden, true);
  f.setStatus({ cueId: 'cabin', title: 'Cabin light', preview: true, previewCueId: 'cabin' }); f.ui.refresh();
  assert.ok(f.button('Listen'), 'Another piece does not turn the selected theme button into Stop.');
  f.button('Return to voyage music').onclick(); assert.deepEqual(f.calls.at(-1), ['stop', 88]);
});

test('closed, replaced, and previously opened listening controls cannot mutate current playback', () => {
  const f = fixture(); f.ui.open(); const oldPlay = f.button('Listen'), oldVolume = f.node('libraryMusicVolume');
  f.ui.open(); oldPlay.onclick(); oldVolume.value = '0'; oldVolume.oninput(); assert.deepEqual(f.calls, []); assert.equal(f.settings.musicVolume, .65);
  const play = f.button('Listen'); f.dialog.open('Another panel', 'other'); play.onclick(); assert.deepEqual(f.calls, []); assert.equal(f.ui.refresh(), false);
  f.ui.open(); const closedPlay = f.button('Listen'); f.dialog.close(); closedPlay.onclick(); assert.deepEqual(f.calls, []);
});

test('live updates retain selection and expose queued danger priority, quiet, and browser failures', () => {
  const f = fixture(); f.ui.open(); f.node('musicLibraryPiece').value = 'port'; f.node('musicLibraryPiece').onchange();
  f.setStatus({ cueId: 'foreman', title: 'Foreman cycle', requestedCueId: 'port' }); f.ui.refresh();
  assert.equal(f.node('musicLibraryPiece').value, 'port'); assert.match(f.text(), /Now playing · Foreman cycle\. Queued · After hours/);
  assert.match(f.text(), /when things settle/);
  f.setStatus({ cueId: null, title: 'Quiet', requestedCueId: null }); f.ui.refresh(); assert.match(f.text(), /quiet moment between pieces/);
  f.setStatus({ state: 'unavailable' }); f.ui.refresh(); assert.equal(f.button('Listen').disabled, true); assert.match(f.text(), /could not start/);
  f.button('Listen').onclick(); assert.deepEqual(f.calls, []);
});

test('the catalog filters keep flight, field work and danger distinct while permitting useful overlap', () => {
  assert.equal(musicGroup(catalog[1], 'travel'), true); assert.equal(musicGroup(catalog[2], 'travel'), false);
  assert.equal(musicGroup(catalog[3], 'field'), true); assert.equal(musicGroup(catalog[3], 'danger'), true);
  assert.equal(musicGroup(catalog[4], 'social'), true); assert.equal(musicGroup(catalog[4], 'danger'), false);
  assert.ok(MUSIC_CUES.every(cue => musicGroup(cue, 'all')));
  assert.equal(musicListeningText({ state: 'locked' }), 'Music starts after your next click or tap.');
});

test('Worlds & caves includes all five cave and ten planetary pieces from the real score', () => {
  const caves = MUSIC_CUES.filter(cue => cue.family === 'cave');
  const planets = MUSIC_CUES.filter(cue => cue.family === 'planet');
  assert.equal(caves.length, 5); assert.equal(planets.length, 10);
  const worlds = MUSIC_CUES.filter(cue => musicGroup(cue, 'worlds'));
  for (const cue of [...caves, ...planets]) assert.ok(worlds.includes(cue), `${cue.title} belongs in Worlds & caves.`);
});

const app = readFileSync(new URL('../dist/app.mjs', import.meta.url), 'utf8');
test('the real title button distinguishes a queued theme from a different requested piece', () => {
  const start = app.indexOf('function bindThemeButton('), end = app.indexOf('\nfunction processEvents(', start);
  assert.ok(start >= 0 && end > start);
  const status = { state: 'running', theme: false, title: 'Quiet', requestedCueId: 'port' }, calls = [];
  const buttons = { themeButton: new Element('button'), settingsThemeButton: new Element('button') };
  const context = vm.createContext({ audio: { musicStatus: () => status, toggleTheme: value => { calls.push(value); return value; } }, THEME_ID, MENU_THEME,
    settings: { music: true, musicVolume: .65 }, $: id => buttons[id], applySettings() {}, localCameraPreferences: {}, scoreContextAt: 0, playing: false,
    hudText: (node, value) => { node.textContent = value; }, musicListeningText, musicLibraryUI: { refresh() {} }, toast() {} });
  vm.runInContext(app.slice(start, end), context); context.syncThemeButtons();
  assert.equal(buttons.themeButton.textContent, 'Listen to the theme');
  context.bindThemeButton(buttons.themeButton); buttons.themeButton.onpointerdown();
  status.theme = true; buttons.themeButton.onclick({ currentTarget: buttons.themeButton });
  assert.deepEqual(calls, [true], 'Gesture activation cannot turn a requested Listen into Stop.');
  status.theme = false; status.requestedCueId = THEME_ID; context.syncThemeButtons();
  assert.equal(buttons.themeButton.textContent, 'Cancel queued theme');
  buttons.themeButton.onpointerdown(); buttons.themeButton.onclick({ currentTarget: buttons.themeButton }); assert.deepEqual(calls, [true, false]);
});
