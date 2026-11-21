import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { captureMenuSession } from '../dist/menu-session.mjs';
import { createNotebookNavigation, NOTEBOOK_SECTIONS } from '../dist/notebook-navigation.mjs';
import { Game } from '../dist/engine.mjs';
import { STORY_CHAPTERS } from '../dist/content.mjs';
import { foldDrivePlan } from '../dist/upgrade-guidance.mjs';
import { createRecoveryReportUI } from '../dist/recovery-report-ui.mjs';
import { appendNoticeHistory } from '../dist/notice-history-ui.mjs';

const source = readFileSync(new URL('../dist/app.mjs', import.meta.url), 'utf8');
const declarations = [...source.matchAll(/^(?:async )?function (\w+)\(/gm)];
function declaration(name) {
  const index = declarations.findIndex(match => match[1] === name); assert.ok(index >= 0);
  return source.slice(declarations[index].index, declarations[index + 1]?.index ?? source.length);
}
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.attributes = {}; this.style = {}; this.textContent = ''; }
  append(...children) { this.children.push(...children); }
  insertAdjacentHTML(_, html) { this.children.push({ html }); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  querySelector(selector) { this.selectors ??= new Map(); if (!this.selectors.has(selector)) this.selectors.set(selector, new Element('button')); return this.selectors.get(selector); }
}
const document = { createElement: tag => new Element(tag) };
function game() { return { state: { seed: 'same-captain', systemId: 'hearth', locationId: 'kettle', mode: 'person', stats: { jumps: 0, jobs: 0 }, journal: [], cargo: { ore: 3, crystal: 1 }, credits: 100, ship: { cargoCap: 30, fuel: 10 } } }; }
function dialog() {
  return { revision: 1, opened: true, kind: 'outfitter', body: new Element('section'),
    open(title, kind, options) { this.revision++; this.opened = true; this.kind = kind; this.title = title; this.options = options; this.body = new Element('section'); },
    close() { this.revision++; this.opened = false; }, choices(items) { this.items = items; },
    html() { throw new Error('A service tab must not erase the notebook/shipyard navigation.'); } };
}

test('menu replies belong to a specific captain, place, connection and navigation revision', () => {
  const state = { dialog: dialog(), game: game(), connection: {} }, valid = captureMenuSession(state);
  assert.equal(valid(state), true);
  state.game.state.credits -= 20; assert.equal(valid(state), true, 'A purchase can update its original menu.');
  assert.equal(valid({ ...state, connection: {} }), false);
  state.game.state.locationId = 'morrow'; assert.equal(valid(state), false);
  state.game.state.locationId = 'kettle'; state.dialog.open('Settings', 'settings'); assert.equal(valid(state), false);
  state.dialog.open('Shipyard', 'outfitter'); assert.equal(valid(state), false, 'Reopening a similarly named menu does not revive old replies.');
});

test('late successful purchases retain their result but do not replace the new menu', async () => {
  let resolve, recorded = 0, refreshed = 0;
  const context = vm.createContext({ dialog: dialog(), game: game(), network: {}, captureMenuSession,
    invoke: () => new Promise(done => { resolve = done; }), result: answer => { recorded++; return answer.ok; } });
  vm.runInContext(['menuSession', 'runMenuAction'].map(declaration).join('\n'), context);
  const request = context.runMenuAction('buyUpgrade', { id: 'scanner' }, () => refreshed++);
  context.dialog.open('Settings', 'settings'); resolve({ ok: true }); await request;
  assert.equal(recorded, 1); assert.equal(refreshed, 0); assert.equal(context.dialog.kind, 'settings');
  const current = context.runMenuAction('service', { action: 'repair' }, () => refreshed++);
  resolve({ ok: true }); await current; assert.equal(refreshed, 1);
});

test('a reply from a departed connection is not applied to the replacement captain UI', async () => {
  let resolve, recorded = 0;
  const context = vm.createContext({ dialog: dialog(), game: game(), network: {}, captureMenuSession,
    invoke: () => new Promise(done => { resolve = done; }), result: () => { recorded++; return true; } });
  vm.runInContext(['menuSession', 'runMenuAction'].map(declaration).join('\n'), context);
  const request = context.runMenuAction('service', {}); context.game = game(); context.network = {};
  resolve({ ok: true }); await request; assert.equal(recorded, 0);
});

test('a relief decision keeps its contact and next task without an unrelated discovery receipt', async () => {
  const panel = dialog(), current = game(); let resolve;
  panel.html = function (markup) { this.markup = markup; };
  panel.choices = function (items) { this.groups ??= []; this.groups.push(items); };
  const context = vm.createContext({ dialog: panel, game: current, network: null, captureMenuSession,
    surface: { warzone: true }, esc: String, fmt: String, effectSummary: answer => answer.credits ? `+${answer.credits} cr` : '',
    audio: { play() { throw new Error('Accepting an escort task does not collect an item.'); } },
    result: answer => answer.ok,
    invoke: async (_, args) => args.action === 'inspect' ? { ok: true, title: 'Asha · civilian evacuation', text: 'Meet the tenants at the apartment shelter.', choice: { options: [{ id: 'accept', label: 'Agree to escort the three tenants' }] } } : new Promise(done => { resolve = done; }) });
  vm.runInContext(['menuSession', 'runMenuAction', 'openSiteEntity', 'showSiteResult'].map(declaration).join('\n'), context);
  await context.openSiteEntity({ id: 'ashfall:evacuation', type: 'siteChoice', name: 'Asha', data: {} });
  const request = panel.groups[0][0].action();
  resolve({ ok: true, credits: 0, text: 'Three seats are reserved. Meet Siv, Oren and Mara at the apartment shelter.' }); await request;
  assert.equal(panel.title, 'Asha · civilian evacuation');
  assert.equal(panel.kind, 'site-record'); assert.equal(panel.options.contextKey, 'site:ashfall:evacuation');
  assert.equal(panel.options.eyebrow, 'CIVILIAN RELIEF');
  assert.match(panel.markup, /Meet Siv, Oren and Mara/);
  assert.doesNotMatch(panel.markup, /discovery|You now have|Hold/);
  assert.equal(panel.groups.at(-1)[0].label, 'Return to exploring');
});

test('the actual legacy notebook uses the same destinations and width as stories', () => {
  const message = Object.freeze({ id: 'notice-1', text: 'Course marked.\nFollow <Morrow> on the local chart.', type: 'info', count: 2, time: 100 });
  const context = vm.createContext({ testSession: null, game: game(), dialog: dialog(), document,
    createNotebookNavigation: (key, select) => createNotebookNavigation(key, select, { document }), fmt: String,
    syncNoticePresentation() {}, noticeHistory: () => Object.freeze([message]),
    appendNoticeHistory: (parent, entries, options) => appendNoticeHistory(parent, entries, { ...options, document }) });
  context.recoveryReportUI = createRecoveryReportUI({ getGame: () => context.game, dialog: context.dialog,
    invoke: (...args) => context.invoke(...args), acceptResult: answer => context.result(answer) });
  vm.runInContext(declaration('openJournal'), context); context.openJournal('log');
  const nav = context.dialog.body.children[0].children[0];
  assert.deepEqual(nav.children.map(button => button.dataset.notebookSection), NOTEBOOK_SECTIONS.map(([key]) => key));
  assert.equal(nav.children.find(button => button.dataset.notebookSection === 'log').attributes['aria-current'], 'page');
  assert.equal(context.dialog.kind, 'narrative'); assert.equal(context.dialog.options.wide, true);
  assert.equal(context.dialog.options.contextKey, 'notebook:log');
  const recent = context.dialog.body.children[0].children[1].children[0];
  assert.equal(recent.tagName, 'details'); assert.equal(recent.open, false, 'Ordinary log navigation keeps visit messages folded.');
  assert.equal(recent.children[0].textContent, 'Recent messages · 1');
  const row = recent.children[1].children.find(child => child.dataset?.noticeId === message.id);
  assert.equal(row.children.at(-1).textContent, message.text, 'The real renderer retains full text and line breaks without interpreting markup.');
  assert.equal(row.children.at(-1).style.whiteSpace, 'pre-wrap');
  context.openJournal('log', { showMessages: true, noticeId: message.id });
  const selected = context.dialog.body.children[0].children[1].children[0];
  assert.equal(selected.open, true);
  assert.equal(selected.children[1].children.find(child => child.dataset?.noticeId === message.id).dataset.selected, 'true');
  assert.equal(context.dialog.options.contextKey, 'notebook:log', 'Reading a notice uses the existing notebook destination.');
  assert.equal(context.dialog.options.wide, true);
});

test('shipyard services retain all four tabs and show earned support in the current quote', () => {
  const current = game(); Object.assign(current, { ownsShip: true, atInhabitedPort: true, currentBody: { name: 'Kettle' }, cargoUsed: 4,
    serviceQuote: key => ({ cost: 10, label: key, value: key.startsWith('sell') ? 5 : 0, ore: 3, support: key === 'repair' ? 'Workshop agreement · 15% off' : null }) });
  const context = vm.createContext({ game: current, dialog: dialog(), document, testSession: null, fmt: String,
    costDetail: cost => `Cost ${cost} cr`, runMenuAction() {} });
  vm.runInContext(['openOutfitter', 'renderPortServices'].map(declaration).join('\n'), context);
  context.openOutfitter(null, 'service');
  const tabs = context.dialog.body.children[0]; assert.equal(tabs.className, 'panel-tabs');
  assert.deepEqual(tabs.children.map(button => button.textContent), ['Equipment', 'Personal gear', 'New hulls', 'Repairs & trade']);
  assert.match(context.dialog.items.find(item => item.label.startsWith('repair')).detail, /Workshop agreement/);
});

test('the shipyard keeps the returned first greeting across tabs and purchases while refreshing quotes', async () => {
  const current = game(), spoken = [], derived = [], purchases = [];
  const first = { greeting: 'Iona Vale. I keep the ships here flying.' }, familiar = { greeting: 'Still here. Was there something else?' };
  const entity = { id: 'kettle:mechanic', name: 'Iona Vale', type: 'mechanic', conversation: first };
  let quoteCost = 10;
  Object.assign(current, { ownsShip: true, atInhabitedPort: true, currentBody: { name: 'Kettle' }, cargoUsed: 4,
    conversation(npc, options) { derived.push([npc.id, options]); return familiar; },
    serviceQuote: key => ({ cost: quoteCost, label: key, value: 0, ore: 3 }) });
  const context = vm.createContext({ game: current, dialog: dialog(), document, testSession: null, network: null, captureMenuSession,
    fmt: String, esc: String, npcTime: () => 100, foldDrivePlan: () => ({ installed: true }), getShipClass: () => ({ name: 'Cinder' }),
    UPGRADES: [], SHIP_CLASSES: [], personalGearUI: { render() {} }, costDetail: cost => `Cost ${cost} cr`,
    dialogueHeader: (npc, text, words) => spoken.push({ npc, text, words }),
    invoke: async (name, args) => { purchases.push([name, args]); quoteCost = 7; return { ok: true }; }, result: answer => answer.ok });
  vm.runInContext(['menuSession', 'runMenuAction', 'openOutfitter', 'renderPortServices'].map(declaration).join('\n'), context);
  context.openOutfitter(entity);
  for (const label of ['Personal gear', 'New hulls', 'Repairs & trade']) {
    context.dialog.body.children[0].children.find(button => button.textContent === label).onclick();
  }
  assert.equal(derived.length, 0);
  assert.equal(spoken.length, 4);
  assert.ok(spoken.every(({ npc, text, words }) => npc.id === entity.id && text === first.greeting && words === first));
  await context.dialog.items.find(item => item.id === 'service:refuel').action();
  assert.equal(purchases.length, 1); assert.equal(purchases[0][0], 'service');
  assert.equal(derived.length, 0); assert.equal(spoken.at(-1).words, first);
  assert.match(context.dialog.items.find(item => item.id === 'service:refuel').detail, /Cost 7 cr/);
  context.openOutfitter({ ...entity, conversation: undefined }, 'service');
  context.dialog.body.children[0].children.find(button => button.textContent === 'Personal gear').onclick();
  assert.equal(derived.length, 1); assert.equal(derived[0][1].record, false);
  assert.equal(spoken.at(-1).words, familiar);
});

test('asking a topic and returning keeps the same person without recording another conversation', () => {
  const spoken = [], current = game(), entity = { id: 'kettle:mechanic', name: 'Iona', role: 'mechanic', data: {} };
  const words = { greeting: 'The drive is fitted.', updateText: 'Refuel here, then select Vesper on the galaxy chart.', updateLabel: 'What comes next?', topics: [{ id: 'repairs', label: 'What can you repair?', text: 'Hull repairs use the Repairs & trade tab.' }], rumor: '' };
  const context = vm.createContext({ game: current, dialog: dialog(), surface: { name: 'Kettle' },
    resolveRole: () => 'mechanic', dialogueHeader: (npc, text) => spoken.push([npc.id, text]) });
  vm.runInContext(declaration('renderNPCConversation'), context); context.renderNPCConversation(entity, words);
  context.dialog.items.find(item => item.label === 'What can you repair?').action();
  assert.equal(context.dialog.title, 'Iona'); assert.equal(context.dialog.options.contextKey, 'npc:kettle:mechanic');
  assert.equal(spoken.at(-1)[1], 'Hull repairs use the Repairs & trade tab.');
  context.dialog.items.find(item => item.label === 'Back to conversation').action();
  assert.equal(spoken.at(-1)[1], words.greeting);
  context.dialog.items.find(item => item.label === 'What comes next?').action(); assert.equal(spoken.at(-1)[1], words.updateText);
});

function notebookContext(current, extra = {}) {
  const context = vm.createContext({ game: current, dialog: dialog(), document, testSession: null, network: {},
    captureMenuSession, foldDrivePlan, STORY_CHAPTERS, fmt: String, esc: String,
    createNotebookNavigation: (key, select) => createNotebookNavigation(key, select, { document }),
    syncNoticePresentation() {}, noticeHistory: () => [],
    appendNoticeHistory: (parent, entries, options) => appendNoticeHistory(parent, entries, { ...options, document }),
    appendQuietEarthEntry() {}, appendFieldWorkEntry() {}, militaryCareerUI: { appendEntry() {} }, openingUI: { appendEntry() {} },
    appendFoldDriveLink() {}, ...extra });
  context.recoveryReportUI = createRecoveryReportUI({ getGame: () => context.game, dialog: context.dialog,
    invoke: (...args) => context.invoke(...args), acceptResult: answer => context.result(answer) });
  vm.runInContext(['menuSession', 'runMenuAction', 'notebookChapterText', 'openJournal'].map(declaration).join('\n'), context);
  return context;
}

test('notebook chapter advice follows the personal fitted drive without changing story progress', () => {
  for (const casual of [false, true]) {
    const current = new Game('notebook-fold-copy', casual ? { startMode: 'casual' } : {}), links = [];
    const context = notebookContext(current, { appendFoldDriveLink: (_, label) => links.push(label) });
    for (const chapterId of ['first_shift', 'first_fold']) {
      current.state.completedChapters = chapterId === 'first_fold' ? ['first_shift', 'belt_signal'] : [];
      const before = JSON.stringify(current.state);
      context.openJournal('missions');
      const page = context.dialog.body.children[0].children[1], card = page.children.find(child => child.innerHTML?.includes('THE QUIET EARTH'));
      if (casual) {
        assert.match(card.innerHTML, chapterId === 'first_shift' ? /already has a fold drive fitted/ : /Jump to Vesper on the galaxy chart/);
        assert.doesNotMatch(card.innerHTML, /no fold drive|buy Fold Drive I/);
        assert.equal(links.at(-1), 'Fold drive: travel help');
      } else {
        assert.match(card.innerHTML, chapterId === 'first_shift' ? /no fold drive/ : /buy Fold Drive I/);
        assert.equal(links.at(-1), 'Fold drive: requirements & next step');
      }
      assert.equal(JSON.stringify(current.state), before);
    }
  }
});

test('the notebook Abandon action cannot reopen Missions after the captain moves to another menu', async () => {
  const current = new Game('notebook-abandon-reply');
  current.state.completedChapters = STORY_CHAPTERS.map(chapter => chapter.id);
  current.state.missions = [{ id: 'local-contract', title: 'A local shift', description: 'Repair the service panels.', progress: 0, goal: 3, reward: 20, status: 'active' }];
  let resolve, accepted = 0;
  const context = notebookContext(current, { invoke: () => new Promise(done => { resolve = done; }), result: answer => { accepted++; return answer.ok; } });
  context.dialog.html = html => { context.dialog.message = html; };
  context.openJournal('missions');
  const page = context.dialog.body.children[0].children[1], contract = page.children.find(child => child.className === 'entry-card');
  await contract.querySelector('[data-abandon]').onclick();
  const request = context.dialog.items.find(item => item.label === 'Abandon the contract').action();
  context.dialog.open('Settings', 'settings'); resolve({ ok: true }); await request;
  assert.equal(accepted, 1); assert.equal(context.dialog.kind, 'settings'); assert.equal(context.dialog.title, 'Settings');
});
