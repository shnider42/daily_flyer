import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { gamblingCardMarkup, gamblingLobbyModel, gamblingSessionIdentity, gamblingTableScreen, poolAimGuide, poolTableMarkup } from '../dist/gambling-ui.mjs';
import { createGamblingSession, publicGamblingSession } from '../dist/gambling-rules.mjs';

test('stake choices display blackjack reserve and disable unaffordable double coverage', () => {
  const model = gamblingLobbyModel({ data: { gameId: 'blackjack', stakes: [10, 20, 50, 100] } }, 180);
  assert.deepEqual(model.stakes.map(item => [item.stake, item.escrow, item.affordable]), [[10,20,true],[20,40,true],[50,100,true],[100,200,false]]);
  assert.deepEqual(gamblingLobbyModel({ data: { gameId: 'poker', stakes: [10, 50, 999] } }, 20).stakes.map(item => [item.stake, item.escrow, item.affordable]), [[10,10,true],[50,50,false]]);
});

test('face-down cards remain anonymous while visible suits and face ranks read correctly', () => {
  for (const value of [null, undefined, -1, 52, '12', '<img onerror=alert(1)>']) {
    const markup = gamblingCardMarkup(value);
    assert.match(markup, /aria-label="Face-down card"/);
    assert.doesNotMatch(markup, /onerror|<b>/);
  }
  assert.match(gamblingCardMarkup(12), /aria-label="A♣"/);
  assert.match(gamblingCardMarkup(25), /gambling-card red/);
  assert.match(gamblingCardMarkup(51), /aria-label="A♠"/);
});

test('poker public views render exactly two backs for the other seat before showdown', () => {
  const { session } = createGamblingSession({ gameId: 'poker', stake: 20, seed: 'ui-hidden-cards' });
  const view = publicGamblingSession(session);
  assert.deepEqual(view.opponentCards, [null, null]);
  const markup = view.opponentCards.map(card => gamblingCardMarkup(card)).join('');
  assert.equal((markup.match(/Face-down card/g) || []).length, 2);
  assert.doesNotMatch(markup, /<b>/);
  assert.equal(view.cards.length, 2);
});

const table = { width: 1000, height: 500, ballRadius: 11 };
test('pool guide stops at the first ball, including the physical cue radius', () => {
  const view = { table, balls: [{ id: 0, x: 100, y: 250 }, { id: 7, x: 700, y: 250 }, { id: 3, x: 300, y: 250 }] };
  const guide = poolAimGuide(view, 0);
  assert.equal(guide.targetId, 3);
  assert.equal(guide.end.x, 278);
  assert.equal(guide.bank, null);
  view.balls[2].pocketed = true;
  assert.equal(poolAimGuide(view, 0).targetId, 7);
});

test('pool bank guide reflects at the cushion and never follows a pocketed cue ball', () => {
  const view = { table, balls: [{ id: 0, x: 100, y: 250 }] };
  const guide = poolAimGuide(view, Math.PI);
  assert.equal(guide.targetId, null);
  assert.ok(Math.abs(guide.end.x - 11) < 1e-8);
  assert.ok(guide.bank.x > guide.end.x);
  assert.ok(guide.bank.y >= 11 && guide.bank.y <= 489);
  view.balls[0].pocketed = true;
  assert.equal(poolAimGuide(view, 0), null);
});

test('pool presentation renders all sixteen balls, readable numbers and touch/keyboard instructions', () => {
  const { session } = createGamblingSession({ gameId: 'pool', stake: 10, seed: 'ui-pool-table' });
  const view = publicGamblingSession(session), markup = poolTableMarkup(view);
  assert.equal((markup.match(/data-ball="/g) || []).length, 16);
  assert.match(markup, /data-ball="8"/);
  assert.match(markup, /tabindex="0"/);
  assert.match(markup, /Tap to aim; left and right arrows adjust aim/);
  assert.match(poolTableMarkup({ ...view, ballInHand: true }), /tap an open spot to place the cue ball/);
  assert.doesNotMatch(markup, /NaN|undefined|Infinity/);
});

const app = readFileSync(new URL('../dist/app.mjs', import.meta.url), 'utf8');
const appFunction = (name, next) => {
  const start = app.indexOf(`async function ${name}(`), end = app.indexOf(`\n${next}`, start + 1);
  assert.ok(start >= 0 && end > start, `Find actual ${name} integration.`);
  return app.slice(start, end);
};
test('solo command dispatch preserves the stake, session identity and revision required by shared play', async () => {
  const calls = [], game = { militaryRecoveryAccess: () => ({ ok: true }) };
  for (const method of ['startGambling', 'gamblingAction', 'leaveGambling']) game[method] = (...args) => { calls.push({ method, args }); return { ok: true }; };
  const context = vm.createContext({ game, network: null, testSession: null });
  vm.runInContext(appFunction('performInvoke', 'function advanceOnlinePerson('), context);
  await context.performInvoke('startGambling', { entityId: 'glimmer:table:poker', gameId: 'poker', stake: 20 });
  const action = { type: 'raise', amount: 8, sessionId: 'table-1', revision: 3 };
  await context.performInvoke('gamblingAction', action);
  const leaving = { sessionId: 'table-1', revision: 4 };
  await context.performInvoke('leaveGambling', leaving);
  assert.deepEqual(calls[0], { method: 'startGambling', args: ['glimmer:table:poker', 'poker', 20] });
  assert.equal(calls[1].args[0], action);
  assert.equal(calls[2].args[0], leaving);
});

test('using a real table enters the gambling UI without treating it as an NPC conversation', async () => {
  const opened = [], context = vm.createContext({ testSession: null, gamblingUI: { open: entity => opened.push(entity) } });
  vm.runInContext(appFunction('handleEntity', 'async function openSiteEntity('), context);
  const entity = { id: 'glimmer:table:pool', type: 'gambling', data: { gameId: 'pool' } };
  await context.handleEntity(entity);
  assert.equal(opened[0], entity);
});

test('unfinished rounds at another table are identified explicitly and completed receipts reopen only at their own table', () => {
  const poker = { id: 'glimmer:table:poker', data: { gameId: 'poker' } }, otherPoker = { id: 'voltage-crown:table:poker', data: { gameId: 'poker' } }, pool = { id: 'glimmer:table:pool', data: { gameId: 'pool' } };
  const view = { id: 'table-1', entityId: poker.id, gameId: 'poker', status: 'playing', venue: 'Low Orbit' };
  assert.equal(gamblingTableScreen(view, poker), 'session');
  assert.equal(gamblingTableScreen(view, pool), 'elsewhere');
  assert.equal(gamblingTableScreen(view, otherPoker), 'elsewhere');
  const receipt = { ...view, status: 'complete' };
  assert.equal(gamblingTableScreen(receipt, poker), 'session');
  assert.equal(gamblingTableScreen(receipt, otherPoker), 'lobby');
  assert.equal(gamblingTableScreen(receipt, pool), 'lobby');
  assert.equal(gamblingTableScreen(null, poker), 'lobby');
});

test('the same serial round ID has independent replay and aim state for each captain and galaxy', () => {
  const view = { id: 'table-1' }, solo = { state: { seed: 'voyage-one' } }, nextSolo = { state: { seed: 'voyage-two' } };
  const first = { state: { seed: 'shared-seed', multiplayer: { realmCode: 'ABCDEF', captainId: 'captain-one' } } };
  const second = { state: { seed: 'shared-seed', multiplayer: { realmCode: 'ABCDEF', captainId: 'captain-two' } } };
  const elsewhere = { state: { seed: 'shared-seed', multiplayer: { realmCode: 'GHIJKL', captainId: 'captain-one' } } };
  const keys = [solo, nextSolo, first, second, elsewhere].map(game => gamblingSessionIdentity(game, view));
  assert.equal(new Set(keys).size, 5);
  assert.equal(gamblingSessionIdentity(first, structuredClone(view)), keys[2]);
});

const uiSource = readFileSync(new URL('../dist/gambling-ui.mjs', import.meta.url), 'utf8');
function uiFunction(name, next) {
  const start = uiSource.indexOf(`  function ${name}(`), end = uiSource.indexOf(`\n  function ${next}(`, start + 1);
  assert.ok(start >= 0 && end > start);
  return uiSource.slice(start, end);
}

test('click-to-aim and cue buttons focus the replacement SVG so arrows and Enter work immediately', () => {
  const { session } = createGamblingSession({ gameId: 'pool', stake: 10, seed: 'keyboard-pool' }), view = publicGamblingSession(session), calls = [];
  const document = { activeElement: { kind: 'modal' } };
  const newSvg = () => ({ viewBox: { baseVal: { x: -43, y: -43, width: 1086, height: 586 } }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1086, height: 586 }), focus() { document.activeElement = this; } });
  const stage = { svg: newSvg(), querySelector: () => stage.svg, set innerHTML(value) { this.markup = value; this.svg = newSvg(); } };
  const nodes = Object.fromEntries(['input', 'output', '[data-gambling-action="aim-left"]', '[data-gambling-action="aim-right"]', '[data-gambling-action="shoot"]'].map(key => [key, {}]));
  const row = { querySelector: selector => nodes[selector] }, host = { querySelector: () => stage }, controls = { append() {}, querySelector: selector => nodes[selector] };
  document.createElement = () => row;
  const context = vm.createContext({ document, poolTableMarkup, pending: false, animation: null, angle: 0, power: 1, TAU: Math.PI * 2,
    isComplete: value => value.status === 'complete', legal: (value, type) => value.legalActions.includes(type), clamp: (n, lo, hi) => Math.max(lo, Math.min(hi, n)), esc: String, BALL_COLORS: [], run: (method, args) => calls.push({ method, args }) });
  vm.runInContext(uiFunction('renderPool', 'replayShots'), context);
  context.renderPool(view, host, controls);
  const originalSvg = stage.svg;
  originalSvg.onpointerdown({ clientX: 643, clientY: 143, button: 0, preventDefault() {} });
  assert.notEqual(stage.svg, originalSvg);
  assert.equal(document.activeElement, stage.svg, 'Normal click-to-aim focuses the newly rendered table.');
  const aimed = context.angle;
  const key = value => ({ key: value, preventDefault() {}, stopPropagation() {} });
  document.activeElement.onkeydown(key('ArrowRight'));
  assert.ok(Math.abs(context.angle - ((aimed + Math.PI / 180 + Math.PI * 2) % (Math.PI * 2))) < 1e-8);
  assert.equal(document.activeElement, stage.svg, 'Fine aim keeps keyboard focus across SVG replacement.');
  document.activeElement.onkeydown(key('Enter'));
  assert.equal(calls[0].method, 'gamblingAction');
  assert.equal(calls[0].args.type, 'shoot');
  assert.equal(calls[0].args.angle, context.angle);
  assert.equal(calls[0].args.power, 1);
  document.activeElement = nodes['[data-gambling-action="aim-left"]'];
  nodes['[data-gambling-action="aim-left"]'].onclick();
  assert.equal(document.activeElement, stage.svg, 'An aim button also restores table keyboard control.');
  context.pending = true;
  document.activeElement.onkeydown(key('Enter'));
  assert.equal(calls.length, 1, 'The keyboard cannot submit a second shot while one is pending.');
});

test('a shared wallet update refreshes open-lobby affordability without replacing controls or their focus', () => {
  const game = { state: { credits: 180 } }, entity = { id: 'blackjack-table', data: { gameId: 'blackjack' } }, wallet = {}, feedback = { classList: { contains: () => false } };
  const stakes = [10,20,50,100].map(stake => ({ dataset: { gamblingStake: String(stake) }, disabled: stake === 100 }));
  const document = { activeElement: stakes[2] }, controls = stakes.slice();
  const dialog = { body: { querySelector: selector => selector === '[data-gambling-wallet]' ? wallet : feedback, querySelectorAll: () => stakes }, html() { throw new Error('Refreshing the purse must not rebuild the lobby.'); } };
  const context = vm.createContext({ current: () => true, pending: false, animation: null, receiptOnly: false, screen: 'lobby', lobbyBalance: 180,
    status: () => null, getGame: () => game, isComplete: value => value?.status === 'complete', gamblingLobbyModel, entity, dialog, document, money: value => `${value} CR` });
  vm.runInContext(uiFunction('refresh', 'openGuide'), context);
  assert.equal(context.refresh(), false);
  game.state.credits = 220;
  assert.equal(context.refresh(), true);
  assert.equal(wallet.textContent, '220 CR');
  assert.equal(stakes[3].disabled, false);
  assert.equal(document.activeElement, controls[2]);
  for (let i = 0; i < stakes.length; i++) assert.equal(stakes[i], controls[i]);
});
