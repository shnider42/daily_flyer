/** Cards, a cue and a quiet corner of the port. All stakes are Farwake credits. */
import { GAMBLING_GAMES, GAMBLING_STAKES, gamblingEscrow, cardInfo } from './gambling-rules.mjs';
import { escapeHtml as esc, fmt } from './ui.mjs';

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const gameInfo = id => GAMBLING_GAMES.find(game => game.id === id) || { id, name: id === 'pool' ? 'Eight-ball pool' : id === 'poker' ? 'Texas Hold’em' : 'Blackjack' };
const isComplete = view => view?.status === 'complete';
const money = value => `${fmt(value)} CR`;
const legal = (view, action) => view?.status === 'playing' && view.legalActions?.includes(action);
const svgNumber = value => Number.isFinite(Number(value)) ? Number(value).toFixed(2) : '0';

export function gamblingSessionIdentity(game, view) {
  const state = game.state || {}, captain = state.multiplayer || {};
  return JSON.stringify([captain.realmCode || state.seed || '', captain.captainId || 'solo', view?.id || '']);
}

export function gamblingTableScreen(view, entity) {
  if (!view) return 'lobby';
  const sameTable = (view.entityId || view.tableEntityId) === entity?.id;
  return sameTable ? 'session' : isComplete(view) ? 'lobby' : 'elsewhere';
}

const leaveExplanation = view => view.gameId === 'poker'
  ? 'Leaving folds your hand. Chips you have not bet are returned; chips in the pot are lost.'
  : view.gameId === 'blackjack'
    ? 'Leaving stands on your current total. The dealer finishes the hand and the wager resolves normally. Any unused reserve is returned.'
    : 'Conceding loses your stake for this game.';

export function gamblingLobbyModel(entity, balance = 0) {
  const gameId = entity?.data?.gameId || entity?.gameId;
  const permitted = entity?.data?.stakes || GAMBLING_STAKES;
  const stakes = GAMBLING_STAKES.filter(stake => permitted.includes(stake)).map(stake => {
    const escrow = gamblingEscrow(gameId, stake);
    return { stake, escrow, affordable: Number.isFinite(escrow) && escrow <= balance };
  });
  return { gameId, title: gameInfo(gameId).name, stakes, balance };
}

/** Never turn a null/hidden card into a face. Used by both card tables. */
export function gamblingCardMarkup(card, { small = false } = {}) {
  const info = Number.isInteger(card) && card >= 0 && card < 52 ? cardInfo(card) : null;
  if (!info) return `<span class="gambling-card back${small ? ' small' : ''}" role="img" aria-label="Face-down card"><i aria-hidden="true">◆</i></span>`;
  const rank = info.rankLabel || ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[info.rank] || info.rank);
  const suits = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠', C: '♣', D: '♦', H: '♥', S: '♠', c: '♣', d: '♦', h: '♥', s: '♠', 0: '♣', 1: '♦', 2: '♥', 3: '♠' };
  const suit = suits[info.suit] || info.symbol || info.suit;
  const red = ['♥', '♦', 'hearts', 'diamonds', 'H', 'D', 'h', 'd', 1, 2].includes(info.suit) || info.color === 'red';
  return `<span class="gambling-card${red ? ' red' : ''}${small ? ' small' : ''}" role="img" aria-label="${esc(info.label || `${rank} ${suit}`)}"><b>${esc(rank)}</b><i aria-hidden="true">${esc(suit)}</i></span>`;
}

function cardsMarkup(cards = [], count = cards.length) {
  return Array.from({ length: Math.max(count, cards.length) }, (_, index) => index < cards.length ? gamblingCardMarkup(cards[index]) : '<span class="gambling-card empty" aria-hidden="true"></span>').join('');
}

/** One collision or cushion is enough to read a shot; the physics decides its result. */
export function poolAimGuide(view, angle = 0) {
  const table = view?.table || {}, radius = Number(table.ballRadius) || 11;
  const cue = view?.balls?.find(ball => ball.id === 0 && !ball.pocketed);
  if (!cue) return null;
  const width = Number(table.width) || 1000, height = Number(table.height) || 500;
  const dx = Math.cos(angle), dy = Math.sin(angle);
  let length = Infinity, edge = null, target = null;
  for (const [axis, value] of [['x', radius], ['x', width - radius], ['y', radius], ['y', height - radius]]) {
    const direction = axis === 'x' ? dx : dy;
    if (Math.abs(direction) < 1e-8) continue;
    const t = (value - cue[axis]) / direction;
    if (t > .001 && t < length) { length = t; edge = axis; }
  }
  for (const ball of view.balls) {
    if (ball.id === 0 || ball.pocketed) continue;
    const x = ball.x - cue.x, y = ball.y - cue.y, along = x * dx + y * dy;
    if (along <= 0) continue;
    const side2 = x * x + y * y - along * along, diameter = radius * 2;
    if (side2 > diameter * diameter) continue;
    const hit = along - Math.sqrt(Math.max(0, diameter * diameter - side2));
    if (hit > .001 && hit < length) { length = hit; target = ball; edge = null; }
  }
  if (!Number.isFinite(length)) return null;
  const end = { x: cue.x + dx * length, y: cue.y + dy * length };
  const bank = !target && edge ? { x: clamp(end.x + (edge === 'x' ? -dx : dx) * 130, radius, width - radius), y: clamp(end.y + (edge === 'y' ? -dy : dy) * 130, radius, height - radius) } : null;
  return { cue: { x: cue.x, y: cue.y }, end, targetId: target?.id ?? null, bank };
}

const BALL_COLORS = ['#f6f4e6', '#e0b52d', '#487bd6', '#cb4d47', '#8659a5', '#d87c34', '#408c6d', '#8a463f', '#252c33'];
function ballMarkup(ball, radius) {
  if (ball.pocketed) return '';
  const id = Number(ball.id), color = BALL_COLORS[id === 0 ? 0 : id === 8 ? 8 : (id - 1) % 8 + 1];
  const x = svgNumber(ball.x), y = svgNumber(ball.y), r = svgNumber(radius);
  return `<g class="pool-ball" data-ball="${id}" transform="translate(${x} ${y})"><circle r="${r}" fill="${id > 8 ? '#f0eee0' : color}" stroke="#091a19" stroke-width="1.3"/>${id > 8 ? `<path d="M ${-radius * .88} ${-radius * .46} Q 0 ${-radius * .65} ${radius * .88} ${-radius * .46} L ${radius * .88} ${radius * .46} Q 0 ${radius * .65} ${-radius * .88} ${radius * .46} Z" fill="${color}"/>` : ''}${id ? `<circle r="${svgNumber(radius * .5)}" fill="#f3f0df"/><text y="${svgNumber(radius * .3)}" text-anchor="middle" fill="#17252b" font-size="${svgNumber(radius * .85)}" font-family="Arial,sans-serif" font-weight="bold">${id}</text>` : '<circle cx="-3" cy="-4" r="3" fill="#ffffff" opacity=".7"/>'}</g>`;
}

export function poolTableMarkup(view, { angle = 0, aiming = true } = {}) {
  const table = view.table || {}, width = Number(table.width) || 1000, height = Number(table.height) || 500, radius = Number(table.ballRadius) || 11;
  const pockets = table.pockets || [{ x: 0, y: 0 }, { x: width / 2, y: 0 }, { x: width, y: 0 }, { x: 0, y: height }, { x: width / 2, y: height }, { x: width, y: height }];
  const guide = aiming && !view.ballInHand ? poolAimGuide(view, angle) : null;
  const aim = guide ? `<line x1="${svgNumber(guide.cue.x)}" y1="${svgNumber(guide.cue.y)}" x2="${svgNumber(guide.end.x)}" y2="${svgNumber(guide.end.y)}" stroke="#f9e7b9" stroke-width="2.2" stroke-dasharray="8 7" opacity=".8"/>${guide.bank ? `<line x1="${svgNumber(guide.end.x)}" y1="${svgNumber(guide.end.y)}" x2="${svgNumber(guide.bank.x)}" y2="${svgNumber(guide.bank.y)}" stroke="#f9e7b9" stroke-width="2" stroke-dasharray="4 7" opacity=".42"/>` : ''}<circle cx="${svgNumber(guide.end.x)}" cy="${svgNumber(guide.end.y)}" r="${svgNumber(radius)}" fill="none" stroke="#f9e7b9" stroke-width="1.7" opacity=".7"/><line x1="${svgNumber(guide.cue.x - Math.cos(angle) * 22)}" y1="${svgNumber(guide.cue.y - Math.sin(angle) * 22)}" x2="${svgNumber(guide.cue.x - Math.cos(angle) * 120)}" y2="${svgNumber(guide.cue.y - Math.sin(angle) * 120)}" stroke="#d7b786" stroke-width="4"/>` : '';
  return `<svg class="pool-table" data-pool-table viewBox="-43 -43 ${width + 86} ${height + 86}" role="img" tabindex="0" aria-label="Eight-ball table. Tap to aim; left and right arrows adjust aim. ${view.ballInHand ? 'Ball in hand: tap an open spot to place the cue ball.' : 'Set power, then press Shoot.'}"><rect x="-38" y="-38" width="${width + 76}" height="${height + 76}" rx="25" fill="#3b302b" stroke="#806c53" stroke-width="3"/><rect x="-15" y="-15" width="${width + 30}" height="${height + 30}" rx="13" fill="#0d423d"/><rect width="${width}" height="${height}" rx="8" fill="#21645b" stroke="#133b35" stroke-width="6"/><path d="M ${width * .25} 10 V ${height - 10}" stroke="#5d8a74" stroke-width="1" opacity=".35"/>${[.125, .25, .375, .625, .75, .875].map(t => `<path d="M ${width * t} -26 l 3 4 l -3 4 l -3 -4 Z M ${width * t} ${height + 18} l 3 4 l -3 4 l -3 -4 Z" fill="#c8b58d" opacity=".7"/>`).join('')}${pockets.map(p => `<circle cx="${svgNumber(p.x)}" cy="${svgNumber(p.y)}" r="${svgNumber(radius * 2.05)}" fill="#061813" stroke="#ba9663" stroke-width="2.5"/>`).join('')}<g data-pool-aim>${aim}</g><g data-pool-balls>${(view.balls || []).map(ball => ballMarkup(ball, radius)).join('')}</g></svg>`;
}

function rulesMarkup(gameId) {
  const text = gameInfo(gameId).rules;
  const rules = gameId === 'poker'
    ? 'Heads-up Texas Hold’em. Make your best five-card hand from your two cards and the five community cards. Check when no bet is due, call to match, raise to increase the total street bet, or fold. Your buy-in caps what this hand can cost. Uncalled bets return to their owner; tied hands split the pot.'
    : gameId === 'pool'
      ? 'Eight-ball. Pocket your solids or stripes, then the 8. Aim with a tap or the arrow buttons; set power and shoot. A legal pot keeps your turn. A scratch or other foul gives your opponent ball in hand. Pocketing the 8 too early loses the game. The dashed guide shows the first contact, not a guaranteed pot.'
      : 'Blackjack. Get closer to 21 than the dealer without going over. Aces count as 1 or 11. Hit takes a card; Stand ends your hand. Double doubles your original bet, gives one card and stands. The dealer draws to 17 and stands on soft 17. A natural blackjack pays 3:2; equal hands push. Two stakes are reserved at the start so Double is covered; any unused reserve is returned.';
  return `<details class="gambling-rules"><summary>Rules &amp; payouts</summary><p>${esc(typeof text === 'string' && text.length > 120 ? text : rules)}</p><p class="mini muted">Wagers use credits earned in Farwake. No purchases or cash redemption.</p></details>`;
}

export function createGamblingUI({ getGame, dialog, invoke, acceptResult = answer => answer?.ok, onChange = () => {}, getSurface = () => null, markEntity = () => {}, openMap = () => {}, reducedMotion = () => false }) {
  let entity = null, pending = false, fingerprint = '', screen = 'lobby', lobbyBalance = null, angle = 0, power = .55, animation = null, lastAnimated = 0, sessionKey = null, renderedView = null, receiptOnly = false;
  const status = () => getGame().gamblingStatus?.() || null;
  const current = () => dialog.opened && dialog.kind === 'gambling';
  const keyOf = view => `${gamblingSessionIdentity(getGame(), view)}:${entity?.id || ''}:${view?.revision || 0}:${view?.status || ''}:${getGame().state.credits}`;
  function cancelAnimation() { if (animation) { animation.cancelled = true; animation = null; } }
  function showError(message) { const node = dialog.body.querySelector('[data-gambling-status]'); if (node) { node.textContent = message; node.classList.add('gambling-error'); } }

  async function run(method, args = {}) {
    if (pending || animation) return;
    const game = getGame(), revision = dialog.revision, identity = game.state.multiplayer?.captainId || game.state.seed;
    if (method === 'gamblingAction' || method === 'leaveGambling') {
      const view = renderedView || status();
      args = { ...args, sessionId: view?.id, revision: view?.revision };
    }
    pending = true;
    for (const node of dialog.body.querySelectorAll('[data-gambling-action]')) node.disabled = true;
    const notice = dialog.body.querySelector('[data-gambling-status]'); if (notice) notice.textContent = 'Table is resolving…';
    try {
      const answer = await invoke(method, args);
      if (getGame() !== game || (getGame().state.multiplayer?.captainId || getGame().state.seed) !== identity) return;
      const accepted = acceptResult(answer); onChange();
      if (!current() || dialog.revision !== revision) return;
      pending = false;
      if (accepted) {
        if (method === 'leaveGambling') { cancelAnimation(); receiptOnly = !!answer.session; if (answer.session) renderSession(answer.session); else renderLobby(); }
        else renderSession(answer.session || status(), { replay: method === 'gamblingAction' && args.type === 'shoot' });
      } else { renderSessionOrLobby(); showError(answer?.reason || answer?.message || 'The table could not accept that action.'); }
    } catch (error) {
      if (current() && dialog.revision === revision) { pending = false; renderSessionOrLobby(); showError(error?.message || 'The table could not be reached. Try again.'); }
    } finally {
      pending = false;
      if (current() && dialog.revision !== revision && getGame() === game && (getGame().state.multiplayer?.captainId || getGame().state.seed) === identity) renderSessionOrLobby();
    }
  }

  function buttons(items, host = dialog.body) {
    const row = document.createElement('div'); row.className = 'gambling-actions';
    for (const item of items) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.gamblingAction = item.id || '';
      button.className = item.primary ? 'button-primary' : 'button-secondary'; button.textContent = item.label;
      button.disabled = !!item.disabled || pending; if (item.title) button.title = item.title;
      button.onclick = item.action; row.append(button);
    }
    host.append(row); return row;
  }

  function renderLobby() {
    if (!entity || !current()) return;
    cancelAnimation(); fingerprint = 'lobby'; screen = 'lobby'; receiptOnly = false; lobbyBalance = getGame().state.credits;
    const model = gamblingLobbyModel(entity, getGame().state.credits), descriptor = gameInfo(model.gameId);
    dialog.html(`<section class="gambling-room"><div class="gambling-ledger"><span>Available credits <strong data-gambling-wallet>${money(model.balance)}</strong></span><span>Table <strong>Against the house</strong></span></div><p>${esc(descriptor.description || 'Take a seat and play a round with the local regular.')}</p><h3>Choose your stake</h3><div class="gambling-stakes" data-gambling-stakes></div>${model.gameId === 'blackjack' ? '<p class="mini muted">The table reserves twice the stake to cover Double. Any unused reserve comes back after the hand.</p>' : '<p class="mini muted">The selected buy-in is your maximum risk for this hand or game.</p>'}<p data-gambling-status role="status" class="gambling-feedback">${model.stakes.some(s => s.affordable) ? 'Choose a stake to sit down.' : 'You need more credits for this table. Port jobs are available without a wager.'}</p>${rulesMarkup(model.gameId)}</section>`);
    const host = dialog.body.querySelector('[data-gambling-stakes]');
    for (const item of model.stakes) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.gamblingAction = 'start'; button.dataset.gamblingStake = String(item.stake); button.disabled = !item.affordable || pending;
      button.innerHTML = `<strong>${money(item.stake)}</strong><small>${model.gameId === 'blackjack' ? `${money(item.escrow)} reserved` : 'Buy-in'}</small>`;
      button.onclick = () => run('startGambling', { entityId: entity.id, gameId: model.gameId, stake: item.stake }); host.append(button);
    }
    buttons([{ label: 'Back to the room', action: () => dialog.close() }]);
  }

  function renderSessionOrLobby() {
    const view = status(), destination = gamblingTableScreen(view, entity);
    if (destination === 'session') renderSession(view);
    else if (destination === 'elsewhere') renderElsewhere(view);
    else renderLobby();
  }

  function renderElsewhere(view) {
    cancelAnimation(); screen = 'elsewhere'; fingerprint = keyOf(view); renderedView = view;
    const game = getGame(), system = game.galaxy?.find(item => item.id === view.systemId), place = system?.bodies?.find(item => item.id === view.locationId);
    const oldTable = game.state.systemId === view.systemId && game.state.locationId === view.locationId ? getSurface()?.entities?.find(item => item.id === view.entityId) : null;
    dialog.html(`<section class="gambling-room"><h3>You have an unfinished ${esc(gameInfo(view.gameId).name)} round</h3><p>Your open round is at <strong>${esc(view.venue || oldTable?.name || 'your previous table')}</strong>${place ? `, ${esc(place.name)}` : ''}${system ? ` in ${esc(system.name)}` : ''}. Return there to continue, or settle that round before taking another seat.</p><p>${esc(leaveExplanation(view))}</p><p data-gambling-status role="status" class="gambling-feedback">${money(view.escrow)} remains reserved at that table.</p></section>`);
    const choices = [];
    if (oldTable) choices.push({ label: `Mark ${oldTable.name}`, primary: true, action: () => { dialog.close(); markEntity(oldTable.id); } });
    else if (system) choices.push({ label: `Find ${system.name} on the starmap`, primary: true, action: () => openMap(system.id, 'galaxy') });
    choices.push({ label: view.gameId === 'pool' ? 'Concede the open pool game' : view.gameId === 'poker' ? 'Fold the open poker hand' : 'Stand and leave blackjack', action: () => run('leaveGambling') });
    choices.push({ label: 'Back to the room', action: () => dialog.close() });
    buttons(choices);
  }

  function renderSession(view, { replay = false } = {}) {
    if (!current()) return;
    if (!view) { renderLobby(); return; }
    const previousView = renderedView;
    cancelAnimation(); screen = 'session'; fingerprint = keyOf(view); renderedView = view;
    const identity = gamblingSessionIdentity(getGame(), view);
    if (identity !== sessionKey) { sessionKey = identity; angle = 0; power = view.gameId === 'pool' && view.isBreak ? 1 : .55; lastAnimated = view.shotNumber || 0; }
    else if (view.gameId === 'pool' && previousView?.isBreak && !view.isBreak) power = .55;
    const complete = isComplete(view), opponent = view.opponentName || 'House player';
    const outcome = typeof view.result === 'string' ? view.result : view.result?.reason || view.result?.message || view.result?.label || (complete ? 'Round complete.' : '');
    const returned = Number(view.creditsReturned ?? view.result?.returned ?? (Array.isArray(view.payout) ? view.payout[0] : view.payout) ?? 0);
    const net = complete ? Number(view.purseChange ?? view.result?.net ?? (returned - Number(view.escrow || view.stake || 0))) : 0;
    const settlement = complete ? `<div class="gambling-result" role="status"><strong>${esc(outcome)}</strong><span>${money(returned)} returned${net ? ` · ${net > 0 ? '+' : '−'}${money(Math.abs(net))} net` : ' · Even'}</span></div>` : '';
    dialog.html(`<section class="gambling-room"><div class="gambling-ledger"><span>Wallet <strong>${money(getGame().state.credits)}</strong></span><span>${complete ? 'Reserved at start' : 'At table'} <strong>${money(view.escrow || view.stake)}</strong></span><span>Opponent <strong>${esc(opponent)}</strong></span></div>${settlement}<div data-gambling-game></div><p data-gambling-status class="gambling-feedback" role="status">${complete ? 'Your result is recorded with your captain.' : view.gameId === 'pool' ? view.ballInHand ? 'Ball in hand — tap a clear spot on the felt to place the cue ball.' : 'Tap the table to aim. Set power, then Shoot.' : 'Your move.'}</p><div data-gambling-controls></div><details class="gambling-log"><summary>Table notes</summary><ol>${(view.log || []).slice(-8).map(line => `<li>${esc(typeof line === 'string' ? line : line.message || line.text || '')}</li>`).join('')}</ol></details>${rulesMarkup(view.gameId)}</section>`);
    const board = dialog.body.querySelector('[data-gambling-game]'), controls = dialog.body.querySelector('[data-gambling-controls]');
    if (view.gameId === 'poker') renderPoker(view, board, controls);
    else if (view.gameId === 'blackjack') renderBlackjack(view, board, controls);
    else if (view.gameId === 'pool') renderPool(view, board, controls);
    if (complete) {
      buttons([{ label: 'Another round', primary: true, action: () => renderLobby() }, { label: 'Back to the room', action: () => dialog.close() }]);
    } else {
      const foot = document.createElement('div'); foot.className = 'gambling-foot';
      foot.innerHTML = '<p class="mini muted">Closing this window keeps the round open. Return to this table to continue.</p>';
      const leave = document.createElement('button'); leave.type = 'button'; leave.className = 'gambling-leave'; leave.dataset.gamblingAction = 'leave'; leave.textContent = view.gameId === 'pool' ? 'Concede this game…' : 'Leave the table…';
      leave.onclick = () => confirmLeave(view); foot.append(leave); dialog.body.append(foot);
    }
    if (replay && view.gameId === 'pool' && !reducedMotion()) {
      const shots = (view.recentShots || (view.lastShot ? [view.lastShot] : [])).filter(shot => !shot.number || shot.number > lastAnimated);
      if (shots.length) replayShots(view, shots);
    }
    lastAnimated = Math.max(lastAnimated, view.shotNumber || 0);
  }

  function confirmLeave(view) {
    const node = dialog.body.querySelector('.gambling-foot'); if (!node) return;
    node.replaceChildren();
    const note = document.createElement('p'); note.className = 'mini';
    note.textContent = leaveExplanation(view); node.append(note);
    buttons([{ label: 'Keep playing', primary: true, action: () => renderSession(status()) }, { label: 'Leave table', action: () => run('leaveGambling') }], node);
  }

  function renderPoker(view, host, controls) {
    const stage = { preflop: 'Pre-flop', flop: 'The flop', turn: 'The turn', river: 'The river', showdown: 'Showdown' }[view.street] || view.street || 'Cards on the table';
    host.innerHTML = `<div class="card-table poker-table"><div class="card-seat opponent"><div class="gambling-cards">${cardsMarkup(view.opponentCards || [null, null])}</div><p>${esc(view.opponentName || 'House player')} · ${money(view.stacks?.[1] || 0)} behind${view.bets?.[1] ? ` · ${money(view.bets[1])} bet` : ''}</p></div><div class="poker-community"><span class="gambling-table-label">${esc(stage)}</span><div class="gambling-cards">${cardsMarkup(view.board || [], 5)}</div><strong class="gambling-pot">Pot ${money(view.pot || 0)}</strong></div><div class="card-seat player"><div class="gambling-cards">${cardsMarkup(view.cards || [], 2)}</div><p>You · ${money(view.stacks?.[0] || 0)} behind${view.bets?.[0] ? ` · ${money(view.bets[0])} bet` : ''}${view.handName ? `<br><strong>${esc(view.handName)}</strong>` : ''}</p></div></div>`;
    if (isComplete(view)) return;
    const moves = [];
    if (legal(view, 'check')) moves.push({ id: 'check', label: 'Check', primary: true, action: () => run('gamblingAction', { type: 'check' }) });
    if (legal(view, 'call')) moves.push({ id: 'call', label: `Call ${money(view.callAmount || 0)}`, primary: true, action: () => run('gamblingAction', { type: 'call' }) });
    if (legal(view, 'fold')) moves.push({ id: 'fold', label: 'Fold', action: () => run('gamblingAction', { type: 'fold' }) });
    buttons(moves, controls);
    if (legal(view, 'raise')) {
      const min = Math.max(0, Math.ceil(view.minRaise)), max = Math.max(min, Math.floor(view.maxRaise));
      const row = document.createElement('div'); row.className = 'poker-raise';
      row.innerHTML = `<label for="gamblingRaise">Raise total to <output>${money(min)}</output></label><div><input id="gamblingRaise" type="range" min="${min}" max="${max}" step="1" value="${min}" aria-label="Raise total to"><button type="button" data-gambling-action="raise">Raise</button></div><small>Total for this betting street, including anything you already bet.</small>`;
      const slider = row.querySelector('input'), output = row.querySelector('output'); slider.oninput = () => { output.textContent = money(Number(slider.value)); };
      row.querySelector('button').onclick = () => run('gamblingAction', { type: 'raise', amount: Number(slider.value) }); controls.append(row);
    }
  }

  function renderBlackjack(view, host, controls) {
    host.innerHTML = `<div class="card-table blackjack-table"><div class="card-seat opponent"><span class="gambling-table-label">${esc(view.opponentName || 'Dealer')}</span><div class="gambling-cards">${cardsMarkup(view.dealerCards || [null, null])}</div><p>${view.dealerCards?.some(card => card === null) ? 'One card face down' : `Dealer total: ${fmt(view.dealerTotal)}`}</p></div><div class="blackjack-rule">BLACKJACK PAYS 3:2<br><small>DEALER STANDS ON 17</small></div><div class="card-seat player"><div class="gambling-cards">${cardsMarkup(view.cards || [])}</div><p>Your total <strong>${fmt(view.total)}</strong> · Bet ${money(view.bet || view.stake)}</p></div></div>`;
    if (isComplete(view)) return;
    const moves = [];
    if (legal(view, 'hit')) moves.push({ id: 'hit', label: 'Hit', primary: true, action: () => run('gamblingAction', { type: 'hit' }) });
    if (legal(view, 'stand')) moves.push({ id: 'stand', label: 'Stand', action: () => run('gamblingAction', { type: 'stand' }) });
    if (legal(view, 'double')) moves.push({ id: 'double', label: `Double · ${money((view.bet || view.stake) * 2)} total`, action: () => run('gamblingAction', { type: 'double' }) });
    buttons(moves, controls);
  }

  function renderPool(view, host, controls) {
    const groupLabel = group => group === 'solids' ? 'Solids · 1–7' : group === 'stripes' ? 'Stripes · 9–15' : 'Open table';
    const ballsLeft = group => group ? (view.balls || []).filter(ball => !ball.pocketed && (group === 'solids' ? ball.id > 0 && ball.id < 8 : ball.id > 8)).length : null;
    host.innerHTML = `<div class="pool-score"><span><strong>You</strong>${groupLabel(view.groups?.[0])}${view.groups?.[0] ? ` · ${ballsLeft(view.groups[0])} left` : ''}</span><span><strong>${esc(view.opponentName || 'House player')}</strong>${groupLabel(view.groups?.[1])}${view.groups?.[1] ? ` · ${ballsLeft(view.groups[1])} left` : ''}</span></div><div class="pool-stage" data-pool-stage>${poolTableMarkup(view, { angle, aiming: !isComplete(view) })}</div><div class="pool-pocketed" aria-label="Pocketed balls">${(view.balls || []).filter(ball => ball.pocketed && ball.id).map(ball => `<span class="pool-pocketed-ball${ball.id > 8 ? ' stripe' : ''}" style="--ball-color:${BALL_COLORS[ball.id === 8 ? 8 : (ball.id - 1) % 8 + 1]}">${ball.id}</span>`).join('')}</div>`;
    if (isComplete(view)) return;
    const stage = host.querySelector('[data-pool-stage]');
    const redrawAim = ({ focus = false } = {}) => { const svg = stage.querySelector('svg'); if (!svg) return; const focused = focus || document.activeElement === svg; stage.innerHTML = poolTableMarkup(view, { angle }); bindTable(); if (focused) stage.querySelector('svg').focus({ preventScroll: true }); };
    const onPointer = event => {
      if (pending || animation || event.button && event.button !== 0) return;
      const svg = stage.querySelector('svg'), rect = svg.getBoundingClientRect(), table = view.table;
      const vb = svg.viewBox.baseVal, factor = Math.min(rect.width / vb.width, rect.height / vb.height), offsetX = (rect.width - vb.width * factor) / 2, offsetY = (rect.height - vb.height * factor) / 2;
      const x = (event.clientX - rect.left - offsetX) / factor + vb.x, y = (event.clientY - rect.top - offsetY) / factor + vb.y;
      if (x < 0 || y < 0 || x > table.width || y > table.height) return;
      event.preventDefault();
      if (view.ballInHand && legal(view, 'place')) { void run('gamblingAction', { type: 'place', x, y }); return; }
      const cue = view.balls.find(ball => ball.id === 0 && !ball.pocketed); if (!cue) return;
      angle = Math.atan2(y - cue.y, x - cue.x); redrawAim({ focus: true });
    };
    const fineAim = delta => { angle = (angle + delta + TAU) % TAU; redrawAim({ focus: true }); };
    const bindTable = () => {
      const svg = stage.querySelector('svg'); if (!svg) return;
      svg.onpointerdown = onPointer;
      svg.onkeydown = event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' '].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation(); if (pending || animation) return;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') fineAim((event.key === 'ArrowLeft' ? -1 : 1) * Math.PI / (event.shiftKey ? 720 : 180));
        else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { power = clamp(power + (event.key === 'ArrowUp' ? .05 : -.05), .05, 1); const slider = controls.querySelector('input'); if (slider) { slider.value = String(Math.round(power * 100)); controls.querySelector('output').textContent = `${Math.round(power * 100)}%`; } }
        else if (legal(view, 'shoot') && !view.ballInHand) void run('gamblingAction', { type: 'shoot', angle, power });
      };
    };
    bindTable();
    const row = document.createElement('div'); row.className = 'pool-controls';
    row.innerHTML = `<div class="pool-power"><label for="gamblingPower">Shot power <output>${Math.round(power * 100)}%</output></label><input id="gamblingPower" type="range" min="5" max="100" step="1" value="${Math.round(power * 100)}" aria-label="Shot power"></div><div class="pool-cue-actions"><button type="button" data-gambling-action="aim-left" aria-label="Adjust aim left by one degree">↶ Aim</button><button type="button" data-gambling-action="aim-right" aria-label="Adjust aim right by one degree">Aim ↷</button><button type="button" class="button-primary" data-gambling-action="shoot" ${view.ballInHand || !legal(view, 'shoot') ? 'disabled' : ''}>Shoot</button></div><p class="mini muted">Tap to aim · Arrows fine-tune · Shift + arrows: finer aim · Enter: shoot</p>`;
    row.querySelector('input').oninput = event => { power = Number(event.target.value) / 100; row.querySelector('output').textContent = `${event.target.value}%`; };
    row.querySelector('[data-gambling-action="aim-left"]').onclick = () => fineAim(-Math.PI / 180);
    row.querySelector('[data-gambling-action="aim-right"]').onclick = () => fineAim(Math.PI / 180);
    row.querySelector('[data-gambling-action="shoot"]').onclick = () => run('gamblingAction', { type: 'shoot', angle, power }); controls.append(row);
  }

  function replayShots(view, shots) {
    const usable = shots.filter(shot => shot.frames?.length > 1); if (!usable.length) return;
    const stage = dialog.body.querySelector('[data-pool-stage]'), notice = dialog.body.querySelector('[data-gambling-status]'); if (!stage) return;
    const state = { cancelled: false, started: null }; animation = state;
    const outcome = dialog.body.querySelector('.gambling-result'); if (outcome) outcome.hidden = true;
    for (const button of dialog.body.querySelectorAll('[data-gambling-action]')) button.disabled = true;
    const skip = document.createElement('button'); skip.type = 'button'; skip.className = 'pool-skip'; skip.textContent = 'Skip shot replay';
    const finish = () => { if (animation !== state) return; cancelAnimation(); if (current()) renderSession(status()); };
    skip.onclick = finish; stage.after(skip);
    const perShot = Math.min(1500, 7500 / usable.length);
    const initial = usable[0].frames[0].balls || usable[0].frames[0];
    stage.innerHTML = poolTableMarkup({ ...view, balls: initial.map(ball => ({ ...ball, pocketed: false })) }, { aiming: false });
    const ballNodes = new Map([...stage.querySelectorAll('[data-ball]')].map(node => [Number(node.dataset.ball), node]));
    let shownShot = -1;
    function frame(now) {
      if (state.cancelled || animation !== state || !current() || !stage.isConnected) return;
      state.started ??= now;
      const elapsed = now - state.started, index = Math.floor(elapsed / perShot);
      if (index >= usable.length) { finish(); return; }
      const shot = usable[index], phase = (elapsed % perShot) / perShot, frame = shot.frames[Math.min(shot.frames.length - 1, Math.floor(phase * shot.frames.length))];
      if (shownShot !== index) { shownShot = index; notice.textContent = `${shot.actor === 1 ? view.opponentName || 'House player' : 'You'} · ${shot.message || 'Shot in motion'}`; }
      for (const ball of frame.balls || frame) {
        const node = ballNodes.get(ball.id); if (!node) continue;
        node.style.display = ball.pocketed ? 'none' : '';
        node.setAttribute('transform', `translate(${svgNumber(ball.x)} ${svgNumber(ball.y)})`);
      }
      requestAnimationFrame(frameTick);
    }
    const frameTick = now => frame(now); requestAnimationFrame(frameTick);
  }

  function open(target) {
    entity = target; receiptOnly = false; cancelAnimation();
    dialog.open(target?.name || gameInfo(target?.data?.gameId).name, 'gambling', { eyebrow: 'PORT TABLES / FARWAKE CREDITS', wide: true });
    renderSessionOrLobby();
  }

  function refresh() {
    if (!current()) { cancelAnimation(); return false; }
    if (pending || animation || receiptOnly) return false;
    const view = status();
    if (screen === 'lobby' && (!view || isComplete(view))) {
      if (lobbyBalance === getGame().state.credits) return false;
      lobbyBalance = getGame().state.credits;
      const model = gamblingLobbyModel(entity, lobbyBalance), wallet = dialog.body.querySelector('[data-gambling-wallet]');
      if (wallet) wallet.textContent = money(lobbyBalance);
      for (const button of dialog.body.querySelectorAll('[data-gambling-stake]')) button.disabled = !model.stakes.find(item => item.stake === Number(button.dataset.gamblingStake))?.affordable;
      const feedback = dialog.body.querySelector('[data-gambling-status]');
      if (feedback && !feedback.classList.contains('gambling-error')) feedback.textContent = model.stakes.some(item => item.affordable) ? 'Choose a stake to sit down.' : 'You need more credits for this table. Port jobs are available without a wager.';
      return true;
    }
    const next = keyOf(view); if (next === fingerprint) return false;
    renderSessionOrLobby(); return true;
  }

  function openGuide() {
    cancelAnimation();
    const game = getGame(), surface = getSurface(), tables = (surface?.entities || []).filter(item => item.type === 'gambling' && !item.hidden);
    dialog.open('Nightlife & tables', 'nightlife', { eyebrow: 'PLACES TO STAY A WHILE' });
    dialog.html('<p>Play poker, eight-ball pool or blackjack with the regulars at port tables. Stakes use your captain’s Farwake credits. Each game is played against a local opponent, including in a shared galaxy.</p><div class="nightlife-destination"><span class="eyebrow">VOLTAGE SYSTEM</span><h3>Glimmer after dark</h3><p>A city of rain, bright signs and crowded streets. Low Orbit, in the Lantern Row night market, has the full set of tables. Crown Exchange has the After Shift lounge above the city.</p><p class="mini">Open Voltage on the starmap, jump when your ship is in range, then land on Glimmer at Dock Nine. Walk north along the quay toward Lantern Row, or use the local chart to mark a table.</p></div>');
    const choices = [];
    if (tables.length) for (const table of tables) choices.push({ label: `Find ${table.name}`, detail: `${gameInfo(table.data?.gameId).name} · ${Math.round(Math.hypot(table.x - game.state.person.x, table.y - game.state.person.y) / (surface.tileSize || 24))} paces`, action: () => { dialog.close(); markEntity(table.id); } });
    else dialog.body.insertAdjacentHTML('beforeend', '<p class="mini muted">No gaming table on this deck. Look in civilian station common rooms or visit Glimmer.</p>');
    if (game.galaxy.some(system => system.id === 'voltage')) choices.push({ label: 'Find Voltage on the starmap', detail: 'Inspect the route and fold-drive requirements.', action: () => openMap('voltage', 'galaxy') });
    choices.push({ label: 'Back to the world', action: () => dialog.close() }); dialog.choices(choices);
  }

  return { open, openGuide, refresh, close: cancelAnimation };
}
